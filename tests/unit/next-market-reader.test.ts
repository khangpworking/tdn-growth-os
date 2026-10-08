import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildMarketReport, computeReaderReportData, lint, publishReaderReport, verifyReaderReportInput } from '../../src/modules/analysis/reader-report/index.js';
import { marketFindings } from '../../src/modules/analysis/reader-report/market-findings.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
const hash = (bytes: string | Buffer): string => createHash('sha256').update(bytes).digest('hex');
const data = () => { const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE }; const units = unitPriceFixture(input.rows); input.unitPrices = units.packet; return { input, ...units }; };

test('Market1.4 has six unordered scoped findings, strict unit tables and same-sentence draft numbers', async () => {
  const f = data(), computed = computeReaderReportData(f.input, f.retained), built = await buildMarketReport(computed, sync1Options);
  const doc = new JSDOM(built.html).window.document;
  assert.equal(doc.querySelectorAll('.market-findings > li').length, 6);
  assert.equal(doc.querySelectorAll('.market-findings > ol').length, 0);
  for (const finding of doc.querySelectorAll('.market-findings > li')) {
    assert.match(finding.textContent!, /Nhận định:.*Bằng chứng:.*Trạng thái:/s);
    assert.match(finding.textContent!, /Bảng \d\.\d/);
    assert.match(finding.textContent!, /2026|01\/01/);
    assert.match(finding.textContent!, /Bình nhỏ; Bình lớn/);
  }
  assert.deepEqual(computed.unitPrices.map(item => item.value), [5000, 10000, 15000, 200, 50000, 60000]);
  const m08 = doc.querySelector('#phan-8')!.textContent!;
  assert.match(m08, /100g \(khối lượng tịnh\)/); assert.match(m08, /100g \(khối lượng cái\)/);
  assert.match(m08, /100ml/); assert.match(m08, /đồng\/viên/); assert.match(m08, /đồng\/cái/); assert.match(m08, /đồng\/combo/);
  assert.match(m08, /giá bán trung bình|Giá bán trung bình/);
  assert.match(m08, /Chưa có trường ROAS hoặc CPA/);
  assert.doesNotMatch(m08, /adSpend|adShare/);
  assert.ok(lint(built.html, { visibleTextRules: true }).every(item => item.ok), JSON.stringify(lint(built.html, { visibleTextRules: true }).filter(item => !item.ok)));
  assert.deepEqual(built.narrator.checkHardcoded(built.extraOk).hardcoded, []);
  assert.deepEqual(built.narrator.notInBundle(built.extraOk), []);
  const pending = [...doc.querySelectorAll('[data-classified="pending"]')];
  assert.ok(pending.length > 30);
  // Every numeric core/group/cohort/peer/rule cell must be marked. The only
  // source-only count table and raw appendix are deliberately not classified.
  let checked = 0;
  for (const id of ['phan-4', 'phan-6', 'phan-7']) for (const cell of doc.querySelectorAll(`#${id} .n`)) {
    // A citation number and the fixed E11 policy threshold are not measured
    // classified counts. Missing metric text must remain unmarked.
    const literal = cell.cloneNode(true) as Element;
    literal.querySelectorAll('sup.cite').forEach(cite => cite.remove());
    if (cell.closest('p')?.textContent?.startsWith('Quy tắc đã chốt trước khi tính:')) continue;
    if (/\d/.test(literal.textContent!)) { checked++; assert.ok(cell.querySelector('[data-classified="pending"]'), cell.outerHTML); }
  }
  assert.ok(checked > 20);
  const forged = built.html.replace(/ \(đề xuất, chờ chủ duyệt\)/g, '');
  assert.ok(lintVisibleReportText(forged).some(item => item.rule === 'U13_PENDING_NUMBER' && !item.ok));
  let writes = 0;
  await assert.rejects(publishReaderReport({ put: async () => { writes++; throw new Error('should not write'); } } as never,
    { html: forged, narrator: built.narrator, extraOk: built.extraOk, visibleTextRules: true }), /cổng kiểm/);
  assert.equal(writes, 0);
});

test('old reader1.2/1.3 HTML and metrics match independent assigned-base bytes in both paths', async () => {
  const expected = JSON.parse(readFileSync(new URL('../fixtures/next-market-legacy-reader-hashes.json', import.meta.url), 'utf8'));
  assert.equal(expected.base, '998549072ae62b9d619ffbf645ba59b22a920d4e');
  for (const item of expected.cases) {
    const input = sync1ReaderFixture(item.version);
    if (item.version === '1.3.0') input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
    if (item.missing) { input.rows[0]!.rev = null; input.rows[0]!.asp = null; }
    const computed = computeReaderReportData(input), built = await buildMarketReport(computed, sync1Options);
    assert.equal(hash(built.html), item.html);
    assert.equal(hash(JSON.stringify(computed.bundle.toJSON())), item.metrics);
    assert.equal(built.visibleTextRules, undefined);
  }
});

test('only compatible category/basis/price kind/period/conditions join a sorted unit table', async () => {
  const f = data();
  assert.throws(() => verifyReaderReportInput({ ...f.input, adSpend: 100 }), /sai khuôn/);
  assert.throws(() => verifyReaderReportInput({ ...f.input, adShare: 0.5 }), /sai khuôn/);
  const first = f.packet.records[0]!.observation, second = f.packet.records[1]!.observation;
  second.category = structuredClone(first.category); second.quantity.value = 400; second.price.value = 10000;
  const retain = () => { const bytes = Buffer.from(canonicalJson({ observations: f.packet.records.map(r => r.observation) })), sha256 = hash(bytes);
    f.packet.sources[0]!.sha256 = sha256; f.packet.records.forEach(r => { r.source.sourceSha256 = sha256; }); return [{ sha256, bytes }]; };
  let retained = retain(), computed = computeReaderReportData(f.input, retained);
  assert.equal(computed.unitPrices[0]!.comparisonKey, computed.unitPrices[1]!.comparisonKey);
  const doc = new JSDOM((await buildMarketReport(computed, sync1Options)).html).window.document;
  const sorted = [...doc.querySelectorAll('#phan-8 table')].find(table => table.textContent!.includes('listing-1') && table.textContent!.includes('listing-0'))!;
  assert.ok(sorted);
  const listingOrder = [...sorted.querySelectorAll('tbody tr')].map(row => row.children[1]!.querySelector('small')!.textContent);
  assert.deepEqual(listingOrder, ['listing-1', 'listing-0']);
  for (const change of [
    () => { second.category.massBasis = 'DRAINED'; },
    () => { second.category.massBasis = 'NET'; second.price.kind = 'PAYMENT'; },
    () => { second.price.kind = 'LISTED'; second.period.end = '2026-01-30'; },
    () => { second.period.end = '2026-01-31'; second.price.kind = 'CONDITIONAL_PROMO'; second.price.conditions = ['Có mã giảm giá nguồn ghi']; },
  ]) { change(); retained = retain(); computed = computeReaderReportData(f.input, retained); assert.notEqual(computed.unitPrices[0]!.comparisonKey, computed.unitPrices[1]!.comparisonKey); }
  second.category.kind = 'DURABLE'; second.category.massBasis = 'NOT_APPLICABLE'; second.category.specGroup = 'Cùng kích thước'; second.quantity = { value: 200, unit: 'ml' };
  assert.throws(() => computeReaderReportData(f.input, retain()), /CATEGORY_UNIT_MISMATCH/);
});

test('U29 drops unsupported claims, retains honest gaps and never orders by revenue', async () => {
  const f = data(), initial = marketFindings(computeReaderReportData(f.input, f.retained)).map(item => item.id);
  f.input.rows.forEach(row => { row.rev = null; row.units = null; row.asp = null; });
  const reduced = marketFindings(computeReaderReportData(f.input, f.retained));
  assert.ok(reduced.length < 4);
  assert.ok(reduced.every(item => !['price', 'demand', 'structure'].includes(item.id)));
  const built = await buildMarketReport(computeReaderReportData(f.input, f.retained), sync1Options);
  assert.match(built.html, /Chưa đủ bằng chứng để có bốn nhận định/);
  const swapped = data(); swapped.input.rows.forEach(row => { row.rev = row.rev! * 7; row.asp = row.rev! / row.units!; });
  assert.deepEqual(marketFindings(computeReaderReportData(swapped.input, swapped.retained)).map(item => item.id), initial);
  delete swapped.input.rowLineage;
  assert.deepEqual(marketFindings(computeReaderReportData(swapped.input, swapped.retained)), []);
});

test('verified units reject tampered bytes, wrong locator/variant/listing and duplicate inflation', () => {
  const f = data();
  assert.throws(() => computeReaderReportData(f.input), /SOURCE_MISSING/);
  assert.throws(() => computeReaderReportData(f.input, [{ ...f.retained[0]!, bytes: Buffer.from('{}') }]), /HASH_MISMATCH/);
  for (const mutate of [
    (v: typeof f.input) => { v.unitPrices!.records[0]!.source.locator = '/absent'; },
    (v: typeof f.input) => { v.unitPrices!.records[0]!.observation.variant = 'another variant'; },
    (v: typeof f.input) => { v.unitPrices!.records[0]!.observation.price.value = 1; },
  ]) { const input = structuredClone(f.input); mutate(input); assert.throws(() => computeReaderReportData(input, f.retained), /LOCATOR_MISSING|OBSERVATION_MISMATCH/); }
  const wrongRow = structuredClone(f.input); wrongRow.unitPrices!.records[0]!.rowI = 4;
  assert.throws(() => computeReaderReportData(wrongRow, f.retained), /LISTING_MISMATCH/);
  const duplicate = structuredClone(f.input); duplicate.unitPrices!.records.push(duplicate.unitPrices!.records[0]!);
  assert.throws(() => computeReaderReportData(duplicate, f.retained), /DUPLICATE_OBSERVATION/);
  for (const version of ['1.0.0', '1.1.0', '1.2.0', '1.3.0']) assert.throws(() => verifyReaderReportInput({ ...f.input, contractVersion: version }), /sai khuôn|webSnapshot/);
});

test('missing quantity is never guessed from title, zero remains observed; owner override is exact and bounded', async () => {
  const f = data(); f.packet.records[0]!.observation.quantity.value = null; f.packet.records[1]!.observation.price.value = 0;
  // Re-retain synthetic edited source bytes; cannot just change a declared value.
  const bytes = Buffer.from(canonicalJson({ observations: f.packet.records.map(r => r.observation) })), sha256 = hash(bytes);
  f.packet.sources[0]!.sha256 = sha256; f.packet.records.forEach(r => { r.source.sourceSha256 = sha256; });
  const retained = [{ sha256, bytes }];
  f.input.rows[0]!.title = 'Tiêu đề ghi 999999g';
  let computed = computeReaderReportData(f.input, retained);
  assert.equal(computed.unitPrices[0]!.value, null); assert.equal(computed.unitPrices[1]!.value, 0);
  const built = await buildMarketReport(computed, sync1Options);
  assert.match(built.html, /Chưa rõ số lượng/);
  const override = structuredClone(f.packet.records[0]!.observation); override.quantity.value = 100;
  const ownerBytes = Buffer.from(canonicalJson({ declaration: override })), ownerSha = hash(ownerBytes);
  f.packet.sources.push({ sha256: ownerSha, role: 'OWNER_DECLARATION' });
  f.packet.records[0]!.quantityOverride = { source: { sourceSha256: ownerSha, locator: '/declaration' }, observation: override };
  computed = computeReaderReportData(f.input, [...retained, { sha256: ownerSha, bytes: ownerBytes }]);
  assert.equal(computed.unitPrices[0]!.value, 10000); assert.equal(computed.unitPrices[0]!.ownerDeclared, true);
  const altered = structuredClone(f.input); altered.unitPrices!.records[0]!.quantityOverride!.observation.price.value = 9;
  assert.throws(() => computeReaderReportData(altered, [...retained, { sha256: ownerSha, bytes: ownerBytes }]), /DECLARATION_MISMATCH/);
});
