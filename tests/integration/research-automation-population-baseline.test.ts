import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { findHiddenNames } from '../../src/modules/analysis/report-language/hidden-names.js';
import { prepareInsightReaderBuild } from '../../src/modules/analysis/reader-report/insight-build-v1.js';
import { buildInsightReaderTemplate } from '../../src/modules/analysis/reader-report/insight-template.js';
import { REPORT_SOURCE_REGISTRY } from '../../src/modules/analysis/source-registry.js';
import type { CaptureRecord, StepPopulationBaseline, StepResultDocument, StepWorldBankIndicator } from '../../src/modules/analysis/research-automation/model.js';
import { buildPopulationBaseline, PopulationBaselineBuildError } from '../../src/modules/analysis/research-automation/population-baseline-build.js';
import { createPopulationBaselineSource, populationBaselineSection, type PopulationBaselineAttempt, type PopulationBaselineV1 } from '../../src/modules/analysis/research-automation/population-baseline.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const timestamp = '2026-10-24T18:00:00.000Z'; // 25/10 in Vietnam, deliberately across the UTC date boundary.
const now = () => new Date(timestamp);
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const header = 'region,zone,sex,age_band,education_level,occupation,n';
const csv = [header,
  'Trung du và miền núi phía Bắc,Đô Thị,Nam,10,A,B,125',
  'Đồng bằng sông Hồng,Nông Thôn,Nữ,20,A,B,275',
  'Bắc Trung Bộ và Duyên hải miền Trung,Nông Thôn,Nam,30,A,B,100',
  'Tây Nguyên,Đô Thị,Nữ,40,A,B,150',
  'Đông Nam Bộ,Nông Thôn,Nam,90,A,B,50',
  'Đồng bằng sông Cửu Long,Đô Thị,Nữ,80,A,B,200',
  'Đồng bằng sông Hồng,Nông Thôn,Nữ,20,C,D,100',
].join('\r\n') + '\r\n';

// Independent arithmetic oracle, also used without the CSV builder by reader/storage tests.
function baseline(): PopulationBaselineV1 {
  return {
    contractVersion: 'population-baseline-v1', sourceRevision: 'synthetic-1', rowCount: 7, builtAt: timestamp, total: 1000,
    sexAge: { total: 1000, rows: [
      { sex: 'MALE', ageBand: 10, n: 125 }, { sex: 'FEMALE', ageBand: 20, n: 375 },
      { sex: 'MALE', ageBand: 30, n: 100 }, { sex: 'FEMALE', ageBand: 40, n: 150 },
      { sex: 'FEMALE', ageBand: 80, n: 200 }, { sex: 'MALE', ageBand: 90, n: 50 },
    ] },
    region: { total: 1000, rows: [
      { region: 'Trung du và miền núi phía Bắc', n: 125 }, { region: 'Đồng bằng sông Hồng', n: 375 },
      { region: 'Bắc Trung Bộ và Duyên hải miền Trung', n: 100 }, { region: 'Tây Nguyên', n: 150 },
      { region: 'Đông Nam Bộ', n: 50 }, { region: 'Đồng bằng sông Cửu Long', n: 200 },
    ] },
    zone: { total: 1000, rows: [{ zone: 'URBAN', n: 475 }, { zone: 'RURAL', n: 525 }] },
  };
}
const fileBytes = () => Buffer.from('\n' + JSON.stringify(baseline(), null, 2) + '\r\n');
const collected = (): StepPopulationBaseline => ({ profile: 'population-baseline-v1', status: 'COLLECTED', reason: null,
  captureIndex: 1, retrievedAt: timestamp, sourceSha256: sha(fileBytes()), baseline: baseline() });
const skipped = (reason: 'FILE_MISSING' | 'FILE_INVALID'): StepPopulationBaseline => ({ profile: 'population-baseline-v1',
  status: 'SKIPPED', reason, captureIndex: null, retrievedAt: null, sourceSha256: null, baseline: null });
const captureRecord = (over: Partial<CaptureRecord> = {}): CaptureRecord => ({ stepId: 'COLLECTION', ordinal: 1,
  artifactSha256: 'c'.repeat(64), mediaType: 'application/vnd.tdn.research-automation.capture+json', provider: 'population-baseline',
  operation: 'populationbaseline.read', retrievedAt: timestamp, window: null, truncated: false, ...over });
const emptyPacket = () => buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });

function reportInput(stored?: StepPopulationBaseline): AutomationReportInput {
  const period = { startDate: '2026-09-01', endDate: '2026-09-30', dayCount: 30 };
  return {
    run: { contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 3, status: 'RENDERING', country: 'VN',
      mode: 'CATEGORY', keyword: 'Mẫu tổng hợp', description: null, interview: null, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'],
      definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
      usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false }, steps: [], blockers: [], createdAt: timestamp, updatedAt: timestamp },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY',
      keyword: 'Mẫu tổng hợp', description: null, interview: null, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Phạm vi tổng hợp',
      includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED',
      productCards: [], comparables: [], coverage: [], limitations: [], ...(stored ? { populationBaseline: stored } : {}) },
    captures: stored?.status === 'COLLECTED' ? [captureRecord()] : [],
  };
}

const documentOf = (html: string | Buffer) => new JSDOM(html.toString()).window.document;
function i02Bytes(html: string): string {
  const section = html.match(/<section\b[^>]*\bid="I02"[^>]*>[\s\S]*?<\/section>/u)?.[0];
  assert.ok(section, 'I02 is present in the generated report');
  return section;
}
function readerHtml(input: AutomationReportInput): string {
  const identity = { workspaceId, runId, draftPairId: '5'.repeat(64),
    semanticSha256: 'a'.repeat(64), sourceReportSha256: 'b'.repeat(64), frozenStartSha256: sha(canonicalJson(input.start)),
    frozenScopeSha256: sha(canonicalJson(input.scope)), sourceRendererVersion: 'automation-report-kit-v19' as const };
  return buildInsightReaderTemplate(prepareInsightReaderBuild(identity, input).page).html;
}

async function temporary(t: TestContext): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s28-test-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function runToDraft(t: TestContext, options: { reports: ('MARKET' | 'INSIGHT')[]; bytes?: Buffer; mode?: 'ABSENT' | 'FLAG_OFF' | 'MISSING'; pdfSearch?: boolean } = { reports: ['MARKET', 'INSIGHT'] }) {
  const root = await temporary(t);
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  t.after(() => db.close());
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 's28-synthetic', title: 'Synthetic population baseline run' });
  const file = path.join(root, 'baseline.json');
  if (options.mode !== 'MISSING') await fs.writeFile(file, options.bytes ?? fileBytes());
  const source = createPopulationBaselineSource(options.mode === 'FLAG_OFF' ? null : { path: file }, now);
  const attempts: PopulationBaselineAttempt[] = [];
  const pdfSearch = syntheticWebSource(() => {}, []);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    uuid: () => runId, now, renderer: buildResearchAutomationReport, source: syntheticProductSource({ salesBytes: Buffer.from(options.pdfSearch
      ? '{"data":[{"product_id":"12345","product_name":"Mẫu tổng hợp"}]}' : '{"data":[]}') }),
    sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'v1', ...(options.pdfSearch
      ? { transport: { draftLists: async () => ({ keywords: ['Mẫu tổng hợp'], exclusions: [] }) } } : {}) },
    ...(options.pdfSearch ? { pageIndex: { enabled: true }, pdfDiscoverySource: {
      search: async (input, callOptions) => ({ state: 'CALLED' as const, result: (await pdfSearch.collect(input, callOptions)).result }),
      download: async () => { throw new Error('No PDF candidates in the synthetic search'); },
    } } : {}),
    ...(options.mode === 'ABSENT' ? {} : { populationBaselineSource: { read: async (input: { reports: readonly string[] }) => {
      const attempt = await source.read(input); attempts.push(attempt); return attempt;
    } } }) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'Mẫu tổng hợp', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: options.reports });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Phạm vi tổng hợp', includeTerms: [], excludeTerms: [],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const step = db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { sha: string };
  const stepBytes = await artifacts.read(step.sha);
  const stored = JSON.parse(stepBytes.toString()) as StepResultDocument;
  const captures = db.prepare("SELECT ordinal,provider,operation,artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal").all(runId) as { ordinal: number | bigint; provider: string; operation: string; sha: string }[];
  const usage = db.prepare('SELECT step_id,ordinal,provider,operation,request_count FROM analysis_research_automation_usage WHERE run_id=? ORDER BY step_id,ordinal').all(runId);
  return { root, file, db, artifacts, service, attempts, stepBytes, stored, captures, usage };
}

test('S28 row 1: CSV aggregation, rejected dimensions and RFC 4180 fields', () => {
  const expected = baseline();
  for (const [label, input] of [
    ['plain', csv],
    ['quoted commas, doubled quotes and CRLF within ignored fields', csv.replace(',A,B,125', ',"A, A","B ""quoted""\r\ncontinued",125')],
  ]) {
    const built = buildPopulationBaseline(input!, 'synthetic-1', timestamp);
    assert.equal(built.rowCount, 7, label);
    assert.equal(built.total, 1000, label);
    assert.deepEqual(built.sexAge, expected.sexAge, label);
    assert.deepEqual(Object.fromEntries(built.region.rows.map(row => [row.region, row.n])), Object.fromEntries(expected.region.rows.map(row => [row.region, row.n])), label);
    assert.deepEqual(Object.fromEntries(built.zone.rows.map(row => [row.zone, row.n])), { URBAN: 475, RURAL: 525 }, label);
    for (const table of [built.sexAge, built.region, built.zone]) {
      assert.equal(table.total, 1000, label);
      assert.equal(table.rows.reduce((sum, row) => sum + row.n, 0), 1000, label);
    }
  }
  for (const [label, input] of [
    ['bad header', csv.replace('age_band', 'age')],
    ['unknown region', csv.replace('Trung du và miền núi phía Bắc', 'Vùng không có')],
    ['unknown zone', csv.replace('Đô Thị', 'Nơi không có')],
    ['unknown sex', csv.replace(',Nam,', ',Không rõ,')],
    ['unknown band', csv.replace(',10,', ',15,')],
    ['unterminated quote', csv + '"unfinished'],
  ]) assert.throws(() => buildPopulationBaseline(input!, 'synthetic-1', timestamp), PopulationBaselineBuildError, label);
});

test('S28 row 2: startup accepts only exact flag and normalized absolute path', async t => {
  const root = await temporary(t);
  const frontendDist = path.join(root, 'dist'); await fs.mkdir(frontendDist);
  await fs.writeFile(path.join(frontendDist, 'index.html'), '<p>Synthetic application</p>');
  const read = (flag?: string, file?: string) => operatorAppConfigurationFromEnvironment({ TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'),
    TDN_ARTIFACT_ROOT: path.join(root, 'artifacts'), TDN_RESEARCH_POPULATION_BASELINE_ENABLED: flag,
    TDN_RESEARCH_POPULATION_BASELINE_PATH: file }, { frontendDist, version: 'synthetic' });
  const file = path.join(root, 'baseline.json');
  for (const flag of [undefined, '', '0', 'true', 'TRUE', 'yes', '01', ' 1', '1 ']) {
    assert.equal(Object.hasOwn(read(flag, file), 'researchPopulationBaseline'), false, String(flag));
    assert.equal(Object.hasOwn(read(flag, 'relative.json'), 'researchPopulationBaseline'), false, String(flag));
  }
  assert.deepEqual(read('1', file).researchPopulationBaseline, { path: file });
  for (const invalid of [undefined, '', 'baseline.json', './baseline.json', `${root}/../baseline.json`, `${root}//baseline.json`, ` ${file}`, `${file}\n`, `${file}\0`])
    assert.throws(() => read('1', invalid), TypeError, JSON.stringify(invalid));
});

test('S28 row 3: skip reasons store only file failures and preserve Market-only bytes', async t => {
  const badSum = baseline(); badSum.region.rows[0]!.n++;
  const wrongTotal = baseline(); wrongTotal.zone.total++;
  const duplicate = baseline(); duplicate.zone.rows = [{ zone: 'URBAN', n: 475 }, { zone: 'URBAN', n: 525 }];
  const marketOff = await runToDraft(t, { reports: ['MARKET'], mode: 'ABSENT' });
  for (const item of [
    { label: 'flag off', reason: 'FLAG_OFF', mode: 'FLAG_OFF' as const, reports: ['MARKET'] as ('MARKET' | 'INSIGHT')[] },
    { label: 'Market only', reason: 'NOT_INSIGHT_RUN', reports: ['MARKET'] as ('MARKET' | 'INSIGHT')[], bytes: Buffer.from('{bad') },
    { label: 'missing file', reason: 'FILE_MISSING', mode: 'MISSING' as const },
    { label: 'bad JSON', reason: 'FILE_INVALID', bytes: Buffer.from('{bad') },
    { label: 'schema fail', reason: 'FILE_INVALID', bytes: Buffer.from(JSON.stringify({ ...baseline(), total: '1000' })) },
    { label: 'row sum mismatch', reason: 'FILE_INVALID', bytes: Buffer.from(JSON.stringify(badSum)) },
    { label: 'table total mismatch', reason: 'FILE_INVALID', bytes: Buffer.from(JSON.stringify(wrongTotal)) },
    { label: 'duplicate key with correct sum', reason: 'FILE_INVALID', bytes: Buffer.from(JSON.stringify(duplicate)) },
    { label: 'over 256 KB but valid JSON', reason: 'FILE_INVALID', bytes: Buffer.concat([fileBytes(), Buffer.alloc(256 * 1024, 32)]) },
  ]) {
    const result = await runToDraft(t, { reports: ['INSIGHT'], ...item });
    assert.equal(result.attempts[0]?.reason, item.reason, item.label);
    assert.equal(result.attempts[0]?.capture, null, item.label);
    assert.equal(result.captures.some(row => row.operation === 'populationbaseline.read'), false, item.label);
    if (item.reason === 'FLAG_OFF' || item.reason === 'NOT_INSIGHT_RUN') {
      assert.equal(Object.hasOwn(result.stored, 'populationBaseline'), false, item.label);
      assert.deepEqual(result.stepBytes, marketOff.stepBytes, item.label);
      assert.deepEqual((await result.service.readReport(workspaceId, runId, 'MARKET')).bytes,
        (await marketOff.service.readReport(workspaceId, runId, 'MARKET')).bytes, item.label);
    } else assert.deepEqual(result.stored.populationBaseline, skipped(item.reason as 'FILE_MISSING' | 'FILE_INVALID'), item.label);
  }
});

test('S28 row 4: exact bytes and hash survive capture storage, lineage and replay without usage', async t => {
  const off = await runToDraft(t, { reports: ['MARKET', 'INSIGHT'], mode: 'ABSENT' });
  // Include the exact size ceiling: valid JSON plus trailing whitespace is still accepted at 256 KB.
  for (const bytes of [fileBytes(), Buffer.concat([fileBytes(), Buffer.alloc(256 * 1024 - fileBytes().length, 32)])]) {
    const result = await runToDraft(t, { reports: ['MARKET', 'INSIGHT'], bytes });
    const stored = result.stored.populationBaseline;
    assert.equal(stored?.status, 'COLLECTED');
    if (stored?.status !== 'COLLECTED') throw new Error('Expected collected baseline');
    assert.equal(stored.sourceSha256, sha(bytes));
    assert.equal(stored.captureIndex, off.captures.length, 'existing capture ordinals stay unchanged');
    assert.deepEqual(result.captures.slice(0, off.captures.length), off.captures);
    const row = result.captures.find(value => Number(value.ordinal) === stored.captureIndex)!;
    assert.equal(row.provider, 'population-baseline'); assert.equal(row.operation, 'populationbaseline.read');
    const envelope = JSON.parse((await result.artifacts.read(row.sha)).toString()) as {
      endpoint: string; operation: string; responseBytesBase64: string; responseSha256: string; responseByteLength: number;
    };
    assert.deepEqual(Buffer.from(envelope.responseBytesBase64, 'base64'), bytes);
    assert.equal(envelope.responseSha256, sha(bytes)); assert.equal(envelope.responseByteLength, bytes.length);
    assert.equal(envelope.operation, 'populationbaseline.read'); assert.equal(envelope.endpoint, 'file:///baseline.json');
    assert.equal(JSON.stringify(envelope).includes(result.root), false, 'the server directory is never retained');
    assert.deepEqual(result.usage, off.usage, 'a local read creates no usage row');
    const first = await result.service.readReport(workspaceId, runId, 'INSIGHT');
    assert.deepEqual((await result.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, first.bytes, 'stored lineage replays');
    assert.equal(documentOf(first.bytes).querySelectorAll('#I02 .population-baseline').length, 1);
  }
  // PDF discovery saves captures after admission; S28 must follow those too.
  const pdfOff = await runToDraft(t, { reports: ['MARKET', 'INSIGHT'], mode: 'ABSENT', pdfSearch: true });
  const pdfOn = await runToDraft(t, { reports: ['MARKET', 'INSIGHT'], pdfSearch: true });
  assert.equal(pdfOff.stored.pdfDiscovery?.search.status, 'CALLED', 'the later lane really stores a capture');
  assert.deepEqual(pdfOn.stored.pdfDiscovery, pdfOff.stored.pdfDiscovery, 'PDF capture references stay unchanged');
  assert.deepEqual(pdfOn.captures.slice(0, pdfOff.captures.length), pdfOff.captures, 'all earlier captures keep their ordinals');
  assert.equal(pdfOn.stored.populationBaseline?.captureIndex, pdfOff.captures.length, 'S28 is the last collection capture');
  assert.deepEqual(pdfOn.usage, pdfOff.usage);
});

test('S28 row 5: null-grade non-evidence appendix is used only by rendered Insight blocks', () => {
  assert.deepEqual(REPORT_SOURCE_REGISTRY.S28, [null, 'Dữ liệu dân số mô phỏng', 'POPULATION_BASELINE']);
  const invalid = collected(); if (invalid.status === 'COLLECTED') invalid.baseline.sexAge.total++;
  for (const stored of [collected(), skipped('FILE_MISSING'), skipped('FILE_INVALID'), undefined, invalid]) {
    const input = reportInput(stored);
    for (const kind of ['INSIGHT', 'MARKET'] as const) {
      const packet = sourceEvidenceForReport(emptyPacket(), input, kind);
      const rows = packet.sourceAppendix.rows;
      const expected = kind === 'INSIGHT' && stored?.status === 'COLLECTED' && stored !== invalid;
      assert.equal(rows.some(row => row.registryId === 'S28'), expected, `${kind}/${stored?.status}`);
      const withPolicy = { ...input, sourceEvidence: packet,
        start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' as const } };
      const doc = documentOf(buildResearchAutomationReport(withPolicy, kind).html);
      assert.equal(doc.getElementById(kind === 'INSIGHT' ? 'I17' : 'M13')!.textContent!.includes('Dữ liệu dân số mô phỏng'), expected);
      if (kind === 'INSIGHT') assert.equal(documentOf(readerHtml(withPolicy)).getElementById('I17')!.textContent!.includes('Dữ liệu dân số mô phỏng'), expected);
      if (expected) {
        assert.equal(rows[0]!.tier, null); assert.equal(rows[0]!.group, 'POPULATION_BASELINE');
        assert.equal(rows[0]!.tierDetail, 'Không xếp hạng: không phải bằng chứng, chỉ là mốc toàn dân');
        assert.deepEqual(rows[0]!.binding, { kind: 'capture', ref: 'c'.repeat(64) });
      }
    }
  }
  for (const over of [{ operation: 'other.read' }, { provider: 'other-source' }, { truncated: true },
    { ordinal: 2 }, { stepId: 'QUICK_SEARCH' as const }, { retrievedAt: '2026-10-23T00:00:00.000Z' }]) {
    assert.throws(() => sourceEvidenceForReport(emptyPacket(), { ...reportInput(collected()), captures: [captureRecord(over)] }, 'INSIGHT'),
      /Population baseline capture lineage is unavailable/);
  }
  assert.throws(() => sourceEvidenceForReport(emptyPacket(), { ...reportInput(collected()), captures: [] }, 'INSIGHT'), /capture lineage/);
});

test('S28 row 6: only revalidated COLLECTED data renders, keeping legacy I02 bytes', () => {
  const invalid = collected(); if (invalid.status === 'COLLECTED') invalid.baseline.zone.rows[0]!.n++;
  const badDigest = { ...collected(), sourceSha256: 'invalid' } as StepPopulationBaseline;
  for (const stored of [undefined, skipped('FILE_MISSING'), skipped('FILE_INVALID'), invalid, badDigest]) {
    assert.equal(populationBaselineSection(reportInput(stored).collection), '', stored?.status);
    for (const html of [buildResearchAutomationReport(reportInput(stored), 'INSIGHT').html, readerHtml(reportInput(stored))])
      assert.equal(documentOf(html).querySelector('.population-baseline'), null, 'no empty box');
  }
  // Pinned from origin/main using the same synthetic input; not generated by the renderer under test.
  const legacy = {
    draft: '124da1a3520a886d2e2f025ae1667a30a77220e77b0384a72197c053bc4fcc18',
    reader: 'aac633ca99fba81441d20fef18a8c733c40dccb97d373a11b89ac252475f73e3',
  };
  for (const [name, render] of [
    ['draft', (input: AutomationReportInput) => buildResearchAutomationReport(input, 'INSIGHT').html.toString()],
    ['reader', readerHtml],
  ] as const) {
    const absent = i02Bytes(render(reportInput()));
    assert.equal(sha(absent), legacy[name], `${name}: original I02 golden bytes`);
    const present = i02Bytes(render(reportInput(collected())));
    const blocks = [...present.matchAll(/<div class="population-baseline" data-population-baseline="1">[\s\S]*?<\/ul><\/div>/gu)];
    assert.equal(blocks.length, 1, `${name}: appended baseline`);
    assert.equal(sha(present.replace(blocks[0]![0], '')), legacy[name], `${name}: original I02 text survives the addition`);
  }
});

test('S28 row 7: reader block has neutral names, declared bases/dates and decimal commas', () => {
  for (const render of [
    (input: AutomationReportInput) => buildResearchAutomationReport(input, 'INSIGHT').html.toString(), readerHtml,
  ]) {
    const block = documentOf(render(reportInput(collected()))).querySelector('#I02 .population-baseline')!;
    const text = block.textContent!;
    assert.deepEqual(findHiddenNames(block.outerHTML, 'READER'), []);
    assert.doesNotMatch(text, /persona|khách hàng|người dùng/iu);
    const note = block.querySelector('p')!.textContent!;
    assert.match(note, /^Chú thích: .*không phải người mua\./u);
    assert.equal((text.match(/người mua/giu) ?? []).length, 1);
    const captions = [...block.querySelectorAll('caption')]; assert.equal(captions.length, 3);
    for (const caption of captions) {
      assert.match(caption.textContent!, /Tỷ lệ trên tổng số 1\.000 hồ sơ người từ 18 tuổi trở lên/u);
      assert.match(caption.textContent!, /trong dữ liệu dân số mô phỏng; bảng lập ngày 25\/10\/2026\./u);
    }
    const percentages = text.match(/\d+[,.]\d+%/gu) ?? [];
    assert.ok(percentages.length >= 12);
    assert.ok(percentages.every(value => /^\d+,\d%$/u.test(value)));
    assert.match(text, /12,5%/u); assert.match(text, /72,5%/u); assert.match(text, /47,5%/u);
    assert.doesNotMatch(text, /\d+\.\d+%/u);
  }
});

test('S28 row 8: official comparisons compute percentage-point gaps without adjusting shares', () => {
  const indicator = (code: string, value: string, year: string): StepWorldBankIndicator => ({ code, status: 'COLLECTED', reason: null,
    retrievedAt: timestamp, captureIndex: 2, metadataCaptureIndex: 3, sourceSha256: 'd'.repeat(64), metadataSha256: 'e'.repeat(64),
    row: { indicatorName: 'Chỉ số dân số chính thức', value, unit: '%', year, lastUpdated: '2026-10-24', statusLiteral: '', footnote: null, locator: '/1/0' } });
  const female = indicator('SP.POP.TOTL.FE.ZS', '50.25', '2024');
  const urban = indicator('SP.URB.TOTL.IN.ZS', '60.75', '2023');
  for (const item of [
    { indicators: [], expected: [
      'Cơ cấu tuổi: chưa so với số dân chính thức.',
      'Tỷ lệ nữ: 72,5% trong dữ liệu dân số mô phỏng; chưa so với số dân chính thức.',
      'Tỷ lệ thành thị: 47,5% trong dữ liệu dân số mô phỏng; chưa so với số dân chính thức.',
    ] },
    { indicators: [female, urban], expected: [
      'Cơ cấu tuổi: chưa so với số dân chính thức.',
      'Tỷ lệ nữ: 72,5% trong dữ liệu dân số mô phỏng, lệch 22,3 điểm phần trăm so với số dân chính thức (50,3%, năm 2024).',
      'Tỷ lệ thành thị: 47,5% trong dữ liệu dân số mô phỏng, lệch 13,3 điểm phần trăm so với số dân chính thức (60,8%, năm 2023).',
    ] },
  ]) {
    const input = reportInput(collected());
    const collection = { ...input.collection!, worldBank: { profile: 'world-bank-v1', indicators: item.indicators } };
    const before = canonicalJson(collection);
    const block = documentOf(populationBaselineSection(collection));
    assert.deepEqual([...block.querySelectorAll('li')].map(li => li.textContent), item.expected);
    const without = documentOf(populationBaselineSection(input.collection));
    assert.deepEqual([...block.querySelectorAll('table')].map(table => table.outerHTML), [...without.querySelectorAll('table')].map(table => table.outerHTML));
    assert.equal(canonicalJson(collection), before, 'neither the stored counts nor official values change');
  }
});
