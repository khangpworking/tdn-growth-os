import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeMetricWorkbook, normalizeMetricWorkbookInput, MetricSourceRejection } from '../../src/modules/analysis/metric-source-profile.js';
import { renderMetricScopeDraft } from '../../src/modules/analysis/metric-scope-calculator.js';
import { createResearchReportPacket } from '../../src/modules/analysis/versioned-report-packet.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };

const root = fileURLToPath(new URL('../../', import.meta.url));
function fixture(config: object = {}): Buffer {
  const r = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { cwd: root, input: JSON.stringify(config) });
  assert.equal(r.status, 0, r.stderr.toString()); return r.stdout;
}
const encode = (v: unknown): Buffer => Buffer.from(JSON.stringify(v));
function manifest(bytes: Buffer) {
  return { contractVersion: '1.0.0', profileId: 'metric-shopee-product-list-sheet1-v1', profileVersion: '1.0.0',
    source: { sha256: createHash('sha256').update(bytes).digest('hex'), label: 'Synthetic export', provenanceBasis: 'Synthetic test only',
      evidenceFamily: 'synthetic-metric', sheetName: 'Sheet1', headerSha256: '8c2bdf296db44d3ab32e4e67908a0385cc34960717270a38ae05e325f5127bba', lastRow: 3 },
    scope: { key: 'synthetic', platform: 'shopee', selection: 'ON', start: '2026-08-17', end: '2026-09-15', periodBasis: 'Synthetic declared period', acquiredAt: '2026-09-16T00:00:00.000Z' },
    precision: { revenue: 'unknown', units: 'unknown' }, labelCodebookVersion: 'synthetic-v1', wideUnknownPolicy: 'exclude' };
}
const normalize = (bytes: Buffer) => normalizeMetricWorkbook(bytes, encode(manifest(bytes)));

test('explicit v2 maps current export IDs and missing inline cells while v1 remains strict', () => {
  const headers = ['Tên sản phẩm', 'Link sản phẩm', 'Giá', 'Số đã bán', 'Doanh thu', 'Thương hiệu',
    'Giá phân loại cao nhất', 'Giá phân loại nhỏ nhất', 'Link shop', 'Mã sản phẩm', 'Ngành hàng',
    'Ngành hàng cấp 1', 'Ngành hàng cấp 2', 'Ngành hàng cấp 3', 'Ngày bắt đầu bán', 'Thumbnail',
    'Tên shop', 'Tổng doanh số', 'Tổng số đánh giá', 'Tổng số đã bán'];
  const v2Manifest = (b: Buffer) => ({ ...manifest(b), profileId: 'metric-shopee-product-list-sheet1-v2', profileVersion: '2.0.0',
    source: { ...manifest(b).source, headerSha256: createHash('sha256').update(canonicalJson(headers)).digest('hex') } });
  const cells = { B2: { value: 'https://shopee.vn/Canxi-vien-i.10.101' }, D2: { type: 'inlineStr', emptyInline: true },
    N2: { type: 'inlineStr', emptyInline: true }, E2: { type: 'n', value: '9007199254740993' } };
  const bytes = fixture({ profile: 'v2', cells });
  const parsed = normalizeMetricWorkbook(bytes, encode(v2Manifest(bytes)));
  assert.deepEqual(parsed.input.records.map(r => [r.shopId, r.listingId, r.category]), [['10', '101', 'Supplements'], ['20', '102', 'Supplements']]);
  assert.equal(parsed.input.records[0]!.units.state, 'missing');
  assert.equal(parsed.input.records[1]!.units.state, 'observed_zero');
  assert.equal(parsed.input.records[0]!.revenue.source.locator, 'Sheet1!E2');
  assert.equal(parsed.receipt.evidence[0]!.cells[13]!.rawType, 'inlineStr');
  assert.equal(parsed.result.scopes[0].revenue.value, '9007199254741043');
  assert.equal(parsed.result.scopes[1].status, 'BLOCKED_LABELS');
  assert.deepEqual(normalizeMetricWorkbook(bytes, encode(v2Manifest(bytes))), parsed);
  for (const [changes, locator, code] of [
    [{ I2: { value: 'https://shopee.vn/shop/999' } }, 'Sheet1!I2', 'SHOP_ID_MISMATCH'],
    [{ J2: { value: '1__999__10' } }, 'Sheet1!J2', 'COMPOSITE_ID_MISMATCH'],
    [{ B2: { value: 'https://shopee.vn/canxi-i.10.101?redirect=999' } }, 'Sheet1!B2', 'PRODUCT_URL_SHAPE'],
    [{ E1: { value: 'Tổng doanh số' } }, 'Sheet1!A1:T1', 'HEADER_MISMATCH'],
    [{ N2: { type: 'inlineStr', duplicateInline: true } }, 'Sheet1!N2', 'AMBIGUOUS_INLINE_STRING'],
  ] as const) {
    const bad = fixture({ profile: 'v2', cells: { ...cells, ...changes } });
    assert.throws(() => normalizeMetricWorkbook(bad, encode(v2Manifest(bad))),
      e => e instanceof MetricSourceRejection && e.locator === locator && e.code === code);
  }
  assert.throws(() => normalizeMetricWorkbook(bytes, encode({ ...v2Manifest(bytes), profileVersion: '1.0.0' })), /INVALID_MANIFEST/);
  const old = fixture({ cells: { N2: { type: 'inlineStr', emptyInline: true } } });
  assert.throws(() => normalize(old), /AMBIGUOUS_INLINE_STRING/);
  const oldSlug = fixture({ cells: { B2: cells.B2 } });
  assert.throws(() => normalize(oldSlug), /PRODUCT_URL_SHAPE/);
  const reorderedWithoutEmpty = fixture({ profile: 'v2' });
  assert.throws(() => normalize(reorderedWithoutEmpty), /HEADER_MISMATCH/);
});

test('normalization can finish before the explicit calculation gate without changing input identity', () => {
  const workbook = fixture();
  const sourceManifest = encode(manifest(workbook));
  const prepared = normalizeMetricWorkbookInput(workbook, sourceManifest);
  const calculated = normalizeMetricWorkbook(workbook, sourceManifest);
  assert.deepEqual(prepared.input, calculated.input);
  assert.deepEqual(prepared.receipt, calculated.receipt);
  assert.equal(prepared.receipt.inputSha256, calculated.result.inputSha256);
  assert.equal('result' in prepared, false);
});

test('explicitly unconfirmed acquisition survives workbook intake and report replay without changing measurement dates or totals', () => {
  const bytes = fixture(), knownManifest = manifest(bytes), known = normalize(bytes);
  const unknownManifest = { ...knownManifest, scope: { ...knownManifest.scope, acquiredAt: null } };
  const parsed = normalizeMetricWorkbook(bytes, encode(unknownManifest));
  assert.equal(parsed.input.scope.acquiredAt, null);
  assert.equal(parsed.input.scope.start, '2026-08-17');
  assert.equal(parsed.input.scope.end, '2026-09-15');
  assert.deepEqual(parsed.result.scopes, known.result.scopes);
  assert.equal(parsed.result.scopes[0].revenue.value, '150');
  assert.equal(parsed.result.scopes[1].status, 'BLOCKED_LABELS');
  assert.notEqual(parsed.result.inputSha256, known.result.inputSha256);
  assert.match(renderMetricScopeDraft(parsed.result), /Thu nhận: chưa xác nhận/);
  assert.match(renderMetricScopeDraft(known.result), /Thu nhận: 2026-09-16T00:00:00.000Z/);
  const hash = (b: Buffer) => createHash('sha256').update(b).digest('hex');
  const c = Buffer.from(canonicalJson(catalog) + '\n');
  const compose = (r: typeof parsed.result) => {
    const b = Buffer.from(canonicalJson(r) + '\n');
    return createResearchReportPacket(b, hash(b), c, hash(c));
  };
  const packet = compose(parsed.result);
  assert.equal(packet.packet.scope.acquiredAt, null);
  assert.equal(packet.packet.status, 'DRAFT');
  assert.equal(packet.packet.approvalState, 'UNREVIEWED');
  assert.equal(packet.packet.sourceVerification, 'NORMALIZED_INPUT_ONLY');
  assert.match(packet.report, /Thu nhận khai báo: chưa xác nhận/);
  assert.equal(packet.packet.claims.find(claim => claim.claimId === 'M03:all:revenue')?.value, '150');
  assert.ok(packet.packet.claims.every(claim => claim.limitations.includes('ACQUISITION_TIME_UNCONFIRMED')));
  assert.ok(packet.packet.sections.find(s => s.sectionId === 'M13')!.blockers.includes('ACQUISITION_TIME_UNCONFIRMED'));
  assert.deepEqual(compose(parsed.result), packet);
  assert.notEqual(compose(known.result).packet.packetId, packet.packet.packetId);
  for (const acquiredAt of ['', 'not-a-date', '2026-99-99T99:99:99Z', undefined]) {
    const bad = { ...unknownManifest, scope: { ...unknownManifest.scope, acquiredAt } };
    assert.throws(() => normalizeMetricWorkbook(bytes, encode(bad)), /INVALID_MANIFEST/);
  }
});

test('A2 reads actual shared-string cells and maps period metrics, never lifetime totals or source names', () => {
  const parsed = normalize(fixture());
  assert.deepEqual(parsed.input.records.map(r => [r.shopId, r.listingId, r.revenue.value, r.units.value]), [['10', '101', '100', '2'], ['20', '102', '50', '0']]);
  assert.equal(parsed.result.scopes[0].revenue.value, '150');
  assert.equal(parsed.result.scopes[0].shopCount, 2); // Both source names are "Shop".
  assert.equal(parsed.result.scopes[1].status, 'BLOCKED_LABELS');
  assert.equal(parsed.input.records[0]!.revenue.source.locator, 'Sheet1!E2');
  assert.equal(parsed.input.records[1]!.units.state, 'observed_zero');
  assert.equal(parsed.receipt.evidence[0]!.cells[17]!.value, '99999');
  assert.equal(parsed.receipt.evidence[0]!.cells[4]!.rawType, 's');
  assert.equal(parsed.input.records[0]!.revenue.precision, 'unknown');
});

test('A2 preserves exact large integer/numeric lexical values and distinguishes missing from zero', () => {
  const bytes = fixture({ cells: { E2: { type: 'n', value: '9007199254740993' }, D2: null, E3: { type: 'n', value: '1.2E2' } } });
  const parsed = normalize(bytes);
  assert.equal(parsed.result.scopes[0].revenue.value, '9007199254741113');
  assert.equal(parsed.input.records[0]!.units.state, 'missing');
  assert.equal(parsed.result.scopes[0].units.complete, false);
  assert.equal(parsed.input.records[1]!.revenue.displayedValue, '1.2E2');
});

test('A2 rejects ambiguous rich-string content instead of discarding or concatenating alternatives', () => {
  for (const type of ['inlineStr', 's']) {
    const valid = normalize(fixture({ cells: { E2: { type, richXml: '<r><t>10</t></r><r><t>0</t></r>' } } }));
    assert.equal(valid.input.records[0]!.revenue.value, '100');
    assert.equal(valid.result.scopes[0].revenue.value, '150');
    for (const richXml of ['<t>100</t><r><t>200</t></r>', '<t>100</t><t>200</t>', '<r><t>100</t><t>200</t></r>']) {
      assert.throws(() => normalize(fixture({ cells: { E2: { type, richXml } } })),
        e => e instanceof MetricSourceRejection && e.code === 'AMBIGUOUS_RICH_STRING', `${type}: ${richXml}`);
    }
  }
  assert.throws(() => normalize(fixture({ cells: { E2: { type: 'inlineStr', value: '100', duplicateInline: true } } })),
    e => e instanceof MetricSourceRejection && e.locator === 'Sheet1!E2' && e.code === 'AMBIGUOUS_INLINE_STRING');
});

test('A2 rejects a whole workbook at the offending locator instead of repairing or dropping rows', () => {
  const cases: [object, string, string][] = [
    [{ cells: { E2: { type: 's', value: '1.5' } } }, 'Sheet1!E2', 'INVALID_INTEGER_TEXT'],
    [{ cells: { E2: { type: 'n', value: '1.5' } } }, 'Sheet1!E2', 'FRACTIONAL_VALUE'],
    [{ cells: { E2: { type: 'n', value: '-2' } } }, 'Sheet1!E2', 'INVALID_NUMERIC_VALUE'],
    [{ cells: { E2: { type: 'b', value: '1' } } }, 'Sheet1!E2', 'INVALID_NUMERIC_TYPE'],
    [{ cells: { E2: { type: 'n', value: '44444', dateStyle: true } } }, 'Sheet1!E2', 'UNSUPPORTED_METRIC_NUMBER_FORMAT'],
    [{ cells: { E2: { type: 'n', value: '2', formula: true } } }, 'Sheet1!E2', 'FORMULA_NOT_ALLOWED'],
    [{ cells: { B2: { value: 'https://example.org/product/10/101' } } }, 'Sheet1!B2', 'PRODUCT_URL_SHAPE'],
    [{ cells: { J2: { value: 'https://shopee.vn/shop/999' } } }, 'Sheet1!J2', 'SHOP_ID_MISMATCH'],
    [{ cells: { K2: { value: '101' } } }, 'Sheet1!K2', 'COMPOSITE_ID_MISMATCH'],
    [{ cells: { M2: null } }, 'Sheet1!M2', 'REQUIRED_TEXT'],
    [{ cells: { B3: { value: 'https://shopee.vn/product/10/101' }, J3: { value: 'https://shopee.vn/shop/10' }, K3: { value: '1__101__10' } } }, 'Sheet1!B3', 'DUPLICATE_LISTING'],
    [{ cells: { E1: { value: 'Lifetime revenue' } } }, 'Sheet1!A1:T1', 'HEADER_MISMATCH'],
    [{ hidden: true }, 'Sheet1!2', 'HIDDEN_ROW'], [{ merged: true }, 'Sheet1', 'NON_FLAT_SHEET'],
    [{ filter: true }, 'Sheet1', 'NON_FLAT_SHEET'], [{ sheet: 'Report' }, 'workbook', 'SHEET_PROFILE_MISMATCH'],
    [{ badXml: true }, 'xl/worksheets/sheet1.xml', 'UNSUPPORTED_XML'],
  ];
  for (const [config, locator, code] of cases) assert.throws(() => normalize(fixture(config)),
    e => e instanceof MetricSourceRejection && e.locator === locator && e.code === code, code);
  const bytes = fixture(), m = manifest(bytes);
  m.source.lastRow = 2;
  assert.throws(() => normalizeMetricWorkbook(bytes, encode(m)), /ROW_RANGE_MISMATCH/);
  m.source.lastRow = 3; m.source.sha256 = 'f'.repeat(64);
  assert.throws(() => normalizeMetricWorkbook(bytes, encode(m)), /SOURCE_HASH_MISMATCH/);
  m.source.sha256 = manifest(bytes).source.sha256; m.scope.start = '2027-01-01';
  assert.throws(() => normalizeMetricWorkbook(bytes, encode(m)), /SCOPE_PERIOD_MISMATCH/);
  m.scope.start = '2026-08-17'; m.scope.acquiredAt = '';
  assert.throws(() => normalizeMetricWorkbook(bytes, encode(m)), /INVALID_MANIFEST/);
});

test('A2 binds every supplied label to exact workbook/row/identity/content/codebook without upgrading adjudication', () => {
  const bytes = fixture(), parsed = normalize(bytes), m = encode(manifest(bytes));
  const sidecar = { contractVersion: '1.0.0', sourceSha256: parsed.receipt.sourceSha256, codebookVersion: 'synthetic-v1', provenanceBasis: 'Synthetic assistant labels',
    rows: parsed.receipt.evidence.map(e => ({ row: e.row, rowSha256: e.rowSha256, shopId: e.shopId, listingId: e.listingId,
      contentSha256: e.contentSha256, classification: 'CORE_CANDIDATE', group: 'Synthetic', methodVersion: 'synthetic-v1', adjudication: 'assistant' })) };
  const accepted = normalizeMetricWorkbook(bytes, m, encode(sidecar));
  assert.equal(accepted.result.scopes[2].revenue.value, '150');
  assert.equal(accepted.input.records[0]!.label!.adjudication, 'assistant');
  assert.equal(accepted.input.records[0]!.label!.source.locator, '/rows/0');
  const mutations: ((s: typeof sidecar) => void)[] = [
    s => { s.sourceSha256 = 'f'.repeat(64); }, s => { s.codebookVersion = 'stale'; }, s => { s.rows.pop(); },
    s => { s.rows[1] = structuredClone(s.rows[0]!); }, s => { s.rows[0]!.row = 999; },
    s => { s.rows[0]!.rowSha256 = 'f'.repeat(64); }, s => { s.rows[0]!.contentSha256 = 'f'.repeat(64); },
    s => { s.rows[0]!.methodVersion = 'stale'; }, s => { s.rows[0]!.shopId = '999'; },
  ];
  for (const mutate of mutations) { const bad = structuredClone(sidecar); mutate(bad); assert.throws(() => normalizeMetricWorkbook(bytes, m, encode(bad)), MetricSourceRejection); }
});

test('actual A2 CLI publishes private bundles, reuses exact bytes, and emits locator/hash rejection without partial results', async () => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-a2-'));
  try {
    const source = path.join(temp, 'source.xlsx'), manifestPath = path.join(temp, 'manifest.json'), output = path.join(temp, 'bundle');
    const bytes = fixture();
    await fs.writeFile(source, bytes); await fs.writeFile(manifestPath, encode(manifest(bytes)));
    const run = (target = output) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/normalize-metric-workbook.ts', source, manifestPath, '-', target], { cwd: root, encoding: 'utf8' });
    const first = run(); assert.equal(first.status, 0, first.stderr); assert.equal(JSON.parse(first.stdout).reused, false);
    const file = path.join(output, 'receipt.json'), original = await fs.readFile(file), stat = await fs.stat(file);
    const retry = run(); assert.equal(retry.status, 0, retry.stderr); assert.equal(JSON.parse(retry.stdout).reused, true);
    assert.equal((await fs.stat(file)).mtimeMs, stat.mtimeMs);
    assert.deepEqual(await fs.readFile(file), original);
    if (process.platform !== 'win32') {
      assert.equal((await fs.stat(output)).mode & 0o777, 0o700);
      for (const name of await fs.readdir(output)) assert.equal((await fs.stat(path.join(output, name))).mode & 0o777, 0o600);
    }
    assert.equal(run(path.join(root, 'forbidden-a2')).status, 1);
    const changed = manifest(bytes); changed.scope.selection = 'OFF';
    await fs.writeFile(manifestPath, encode(changed)); assert.equal(run().status, 1);
    const invalid = fixture({ cells: { E2: { value: 'invalid' } } });
    await fs.writeFile(source, invalid); await fs.writeFile(manifestPath, encode(manifest(invalid)));
    const rejected = run(path.join(temp, 'rejected')); assert.equal(rejected.status, 1);
    assert.equal(JSON.parse(rejected.stderr).locator, 'Sheet1!E2');
    assert.equal(JSON.parse(rejected.stderr).sourceSha256, manifest(invalid).source.sha256);
    assert.equal(JSON.parse(rejected.stderr).status, 'REJECTED');
    await assert.rejects(fs.access(path.join(temp, 'rejected')));
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
