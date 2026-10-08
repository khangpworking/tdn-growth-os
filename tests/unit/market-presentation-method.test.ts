import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { buildAutomationMarketPresentation, marketPresentationDigest, verifyAutomationMarketPresentation,
  type MarketPresentationBinding, type MarketPresentationInput } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { renderAutomationMarketFindings, renderAutomationMarketUnitPrices } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { JSDOM } from 'jsdom';
import type { ReportCitations } from '../../src/modules/analysis/research-automation/descriptive-report.js';
import type { UnitPricePacket } from '../../src/modules/analysis/reader-report/market-unit-prices.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
function fixture() {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const input: MarketPresentationInput = { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } };
  return { binding, input, unit };
}
const citations: ReportCitations = { mark: entry => `<sup data-source="${entry.identity}">[1]</sup>` };

test('auto Market freezes existing Metric facts and reuses verified retained-spec arithmetic with scopes/citations/lint', () => {
  const f = fixture(), original = JSON.stringify(f.input);
  const method = buildAutomationMarketPresentation(f.binding, f.input, f.unit.retained);
  assert.equal(method.findings.length, 5);
  assert.equal(method.findings[1]!.statement.includes('185 VND'), true);
  assert.ok(method.findings[0]!.scope.includes('2026-08-17 đến 2026-09-15'));
  assert.ok(method.findings.every(finding => finding.evidence.length && !finding.pending));
  assert.deepEqual(method.unitPrices.map(row => row.value), [5000, 10000, 15000, 200, 50000, 60000]);
  assert.equal(JSON.stringify(f.input), original);
  const html = '<section>' + renderAutomationMarketFindings(method, citations) + renderAutomationMarketUnitPrices(method, citations) + '</section>';
  assert.ok(lintVisibleReportText(html).every(check => check.ok), JSON.stringify(lintVisibleReportText(html)));
  const doc = new JSDOM(html).window.document;
  assert.equal(doc.querySelectorAll('ul.market-findings > li').length, 5);
  assert.equal(doc.querySelectorAll('ol').length, 0);
  assert.ok(doc.body.textContent!.includes('Nhận định:'));
  assert.ok(doc.body.textContent!.includes('Bằng chứng:'));
  assert.ok(doc.body.textContent!.includes('Trạng thái:'));
  assert.ok(!html.includes('adSpend') && !html.includes('adShare'));
  assert.ok(html.includes('Chưa có trường ROAS hoặc CPA'));
  assert.ok(doc.querySelector('sup[data-source]'));
  assert.deepEqual(verifyAutomationMarketPresentation(JSON.parse(JSON.stringify(method)), f.binding), method);
});

test('absence stays unavailable, observed zero survives, and missing quantities never enter compatible sorting', () => {
  const f = fixture();
  const empty = buildAutomationMarketPresentation({ ...f.binding, metric: null }, { metric: null, rows: [], unitSpec: null });
  assert.equal(empty.findings.length, 0);
  assert.equal(empty.unitPrices.length, 0);
  assert.ok(renderAutomationMarketFindings(empty, citations).includes('Chưa đủ bằng chứng'));
  assert.ok(renderAutomationMarketUnitPrices(empty, citations).includes('Chưa tính giá'));
  const zeroInput = metricFixture();
  for (const row of zeroInput.records) row.revenue = { ...row.revenue, state: 'observed_zero', value: '0', displayedValue: '0' };
  const zero = calculateMetricScopes(zeroInput);
  const method = buildAutomationMarketPresentation({ ...f.binding, metric: { ...f.binding.metric!, resultSha256: marketPresentationDigest(zero) } },
    { metric: zero, rows: [], unitSpec: null });
  assert.ok(method.findings[1]!.statement.includes('0 VND'));
  const missingInput = metricFixture();
  for (const row of missingInput.records) {
    row.revenue = { ...row.revenue, state: 'missing', value: null, displayedValue: null };
    row.units = { ...row.units, state: 'missing', value: null, displayedValue: null };
  }
  const missing = calculateMetricScopes(missingInput);
  const partial = buildAutomationMarketPresentation({ ...f.binding, metric: { ...f.binding.metric!, resultSha256: marketPresentationDigest(missing) } },
    { metric: missing, rows: [], unitSpec: null });
  assert.equal(partial.findings.length, 3);
  assert.ok(renderAutomationMarketFindings(partial, citations).includes('Chưa đủ bằng chứng'));

  const unitInput = structuredClone(f.input);
  const packet = unitInput.unitSpec!.record.request.unitPrices as UnitPricePacket;
  packet.records[0]!.observation.price.value = 0;
  packet.records[1]!.observation.quantity.value = null;
  packet.records[2]!.observation.quantity.value = 0;
  const bytes = Buffer.from(JSON.stringify({ observations: packet.records.map(record => record.observation) }));
  const hash = createHash('sha256').update(bytes).digest('hex');
  packet.sources[0]!.sha256 = hash;
  packet.records.forEach(record => { record.source.sourceSha256 = hash; });
  unitInput.unitSpec!.sha256 = marketPresentationDigest(unitInput.unitSpec!.record);
  const unitMethod = buildAutomationMarketPresentation(f.binding, unitInput, [{ sha256: hash, bytes }]);
  assert.equal(unitMethod.unitPrices[0]!.value, 0);
  assert.equal(unitMethod.unitPrices[1]!.value, null);
  assert.equal(unitMethod.unitPrices[2]!.value, null);
  assert.equal(unitMethod.unitPrices[1]!.missing, 'Chưa rõ số lượng');
  assert.equal(unitMethod.unitPrices[2]!.missing, 'Số lượng bằng không; không quy đổi');
  const doc = new JSDOM(renderAutomationMarketUnitPrices(unitMethod, citations)).window.document;
  const missingTable = [...doc.querySelectorAll('table')].find(table => table.querySelector('caption')?.textContent?.includes('Dòng chưa rõ'))!;
  assert.equal(missingTable.querySelectorAll('tbody tr').length, 2);
  const sorted = [...doc.querySelectorAll('table')].filter(table => table.querySelector('caption')?.textContent?.includes('sắp xếp tăng dần'));
  assert.equal(sorted.flatMap(table => [...table.querySelectorAll('tbody tr')]).length, 4);
});

test('wrong receipt/run/pair/workbook/package and altered bytes fail before projection; replay does not recalculate', () => {
  const f = fixture();
  for (const changed of [
    { workspaceId: runId }, { runId: workspaceId }, { previousPairId: 'f'.repeat(64) },
    { metric: { ...f.binding.metric!, workbookSha256: 'f'.repeat(64) } },
    { metric: { ...f.binding.metric!, sourcePackage: { ...f.binding.metric!.sourcePackage, packageId: workspaceId } } },
  ]) assert.throws(() => buildAutomationMarketPresentation({ ...f.binding, ...changed }, f.input, f.unit.retained), /receipt differs/);
  assert.throws(() => buildAutomationMarketPresentation(f.binding, f.input, []), /SOURCE_MISSING/);
  const badBytes = [{ ...f.unit.retained[0]!, bytes: Buffer.from('{}') }];
  assert.throws(() => buildAutomationMarketPresentation(f.binding, f.input, badBytes), /HASH_MISMATCH/);
  const method = buildAutomationMarketPresentation(f.binding, f.input, f.unit.retained);
  assert.throws(() => verifyAutomationMarketPresentation(method, { ...f.binding, runId: workspaceId }), /identity differs/);
  const changed = structuredClone(method); changed.input.metric!.input.records[0]!.title = 'Changed original';
  assert.throws(() => verifyAutomationMarketPresentation(changed, f.binding), /Metric bytes differ/);
  // Read v1 uses only frozen inputs and binding checks; no retained source bytes
  // or live calculator are required by this pure verifier.
  assert.deepEqual(verifyAutomationMarketPresentation(method, f.binding), method);
});

test('pending finding numbers carry their classification label in the same sentence', () => {
  const f = fixture(), method = buildAutomationMarketPresentation(f.binding, { ...f.input, unitSpec: null });
  method.findings[0]!.pending = true;
  const html = renderAutomationMarketFindings(method, citations);
  assert.ok(lintVisibleReportText(html).every(check => check.ok));
  assert.equal(lintVisibleReportText(html.replace(/ \(đề xuất, chờ chủ duyệt\)/g, '')).find(check => check.rule === 'U13_PENDING_NUMBER')!.ok, false);
});
