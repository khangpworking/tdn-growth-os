import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { renderMarketCharts, renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { CaptureRecord, StepSearchGeo, StepSearchInterest } from '../../src/modules/analysis/research-automation/model.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { syntheticSearchInterest } from '../helpers/search-interest-synthetic.js';
import { GEO_FIXTURES, syntheticSearchGeo } from '../helpers/search-geo-synthetic.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const textOf = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');
const failedGeo = syntheticSearchGeo(undefined, { status: 'FAILED', reason: 'PROVIDER_FAILED', provinces: [] });
const unusable: StepSearchGeo[] = [failedGeo, syntheticSearchGeo(undefined, { captureIndex: null }), syntheticSearchGeo(undefined, { provinces: [{ name: 'Atlantis', index: 50 }] }),
  syntheticSearchGeo(undefined, { status: 'SKIPPED', reason: 'PERIOD_NOT_COVERED', captureIndex: null, retrievedAt: null, provinces: [] })];
const REGIONS = ['Trung du và miền núi phía Bắc', 'Đồng bằng sông Hồng', 'Bắc Trung Bộ và Duyên hải miền Trung', 'Tây Nguyên', 'Đông Nam Bộ', 'Đồng bằng sông Cửu Long'];

/** The geo table and its lines, whichever renderer drew them. */
function geoBlock(html: string) {
  const doc = new JSDOM(html).window.document;
  const section = doc.querySelector('#M05') ?? doc.querySelector('#phan-5')!;
  const head = [...section.querySelectorAll('.exn')].find(item => /^Bảng 5\.2$/u.test(item.textContent!.trim()));
  const table = head ? head.closest('.table-wrap, .ex')!.querySelector('table')! : null;
  return { doc, section, head, table, text: section.textContent!.replace(/\s+/gu, ' ') };
}

function assertBlock(html: string, choice: RegExp) {
  const { section, head, table, text } = geoBlock(html);
  assert.ok(head, 'Bảng 5.2 sits in the demand section');
  assert.match(head.parentElement!.textContent!, /Mức quan tâm tìm kiếm theo vùng/u);
  assert.equal(text.split('Mức quan tâm tìm kiếm theo vùng').length - 1, 1, 'the table title is shown once');
  const rows = [...table!.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent!.trim()));
  assert.deepEqual(rows.map(row => row[0]), REGIONS);
  assert.equal(rows.reduce((sum, row) => sum + Number(row[2]), 0), 10, 'the top ten are counted once');
  assert.ok(rows.every(row => /^\d+(,\d)?$|^$/u.test(row[1]!)), 'averages use a comma; missing stays blank');
  assert.match(text, /5 tỉnh, thành phố đứng đầu về mức quan tâm: /u);
  assert.match(text, choice);
  for (const lead of ['Thấy gì:', 'Dùng để:', 'Đừng hiểu là:']) assert.ok(text.includes(lead), lead);
  assert.match(text, /Chú thích: Chỉ số tương đối từ 0 đến 100 theo tỉnh/u);
  const figure = [...section.querySelectorAll('figure')].find(item => item.textContent!.includes('Hình 5.2'));
  if (figure) assert.ok(figure.compareDocumentPosition(head!) & 4, 'right after Hình 5.2');
  assert.doesNotMatch(textOf(html), /Google|serpapi|Metric|Kalodata|TradeInt|Dami|NVIDIA|Jev/iu);
}

async function reader(searchGeo?: StepSearchGeo, searchInterest?: StepSearchInterest) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(searchInterest ? { searchInterest } : {}), ...(searchGeo ? { searchGeo, searchGeoCapture: capture(2) } : {}) });
}

const capture = (ordinal: number): CaptureRecord => ({ stepId: 'COLLECTION', ordinal, artifactSha256: String(ordinal).repeat(64), mediaType: 'application/json', provider: 'serpapi',
  operation: 'serpapi.google.trends', retrievedAt: '2026-10-02T00:00:01.000Z', window: null, truncated: false });

async function presentationInput(searchGeo?: StepSearchGeo, searchInterest?: StepSearchInterest): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows, unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  const collection = { runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', comparables: [], productCards: [], webResults: [], coverage: [], limitations: [],
    ...(searchInterest ? { searchInterest } : {}), ...(searchGeo ? { searchGeo } : {}) };
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection, captures: [capture(1), capture(2)], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows),
    ...(searchInterest ? { searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)) } : {}) } as unknown as AutomationReportInput;
}
const draftHtml = (input: AutomationReportInput): string => buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');

const CASES = [
  ['quạt điện', /Kết quả: vùng nổi bật là Đồng bằng sông Hồng \(6 trong 10 tỉnh đứng đầu\)\./u],
  ['bình giữ nhiệt', /Kết quả: toàn quốc, không lọc\. Dẫn đầu: Đồng bằng sông Hồng và Đông Nam Bộ/u],
  ['thạch dừa', /Kết quả: toàn quốc, không lọc\./u],
] as const;

for (const [keyword, choice] of CASES) {
  test(`reader report (${keyword}): the region table follows Hình 5.2 and the gates stay green`, async () => {
    const built = await reader(syntheticSearchGeo(GEO_FIXTURES[keyword]), syntheticSearchInterest());
    assertBlock(built.html, choice);
    const { head } = geoBlock(built.html);
    assert.match(head!.closest('.ex')!.querySelector('.ex-src .cite')!.textContent!, /^\[\d+\]$/u, 'the reader cites the stored map');
    assert.deepEqual(auditMarketReportHtml(built.html, { presentation: false }).filter(item => !item.ok).map(item => item.rule), []);
    assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
    assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
    assert.deepEqual(providerNameViolations(built.html), []);
  });

  test(`presentation build (${keyword}): the same block, cited, with the business gate and the 14 machine rules green`, async () => {
    const html = draftHtml(await presentationInput(syntheticSearchGeo(GEO_FIXTURES[keyword]), syntheticSearchInterest()));
    assertBlock(html, choice);
    assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true, partialTotals: [] }));
    const gate = auditMarketReportHtml(html, { presentation: true, partialTotals: [] });
    for (const rule of ['SEARCH_INTEREST_NOT_COUNT', 'NO_LEAK', 'G08_PROVIDER_NAME', 'PARTIAL_TOTAL_FORBIDDEN', 'U32_NO_CROSS_PLATFORM_TOTAL'])
      assert.equal(gate.find(item => item.rule === rule)!.ok, true, rule);
    assert.doesNotThrow(() => assertMarket14MachineRules(html));
    const { head, table } = geoBlock(html);
    assert.equal(table!.getAttribute('aria-label'), 'Mức quan tâm tìm kiếm theo vùng', 'the table keeps an accessible name without a second caption');
    assert.match(head!.closest('.table-wrap')!.querySelector('.ex-src .cite')!.textContent!, /^\[\d+\]$/u, 'the stored map is cited');
    assert.deepEqual(auditMarket14(html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule), []);
  });
}

test('the region table is drawn without the series too, and marks the source as used', async () => {
  const built = await reader(syntheticSearchGeo());
  assertBlock(built.html, /vùng nổi bật/u);
  assert.match(textOf(built.html), /Mức quan tâm tìm kiếm\s*Đã lưu trong lượt này/u);
  const html = draftHtml(await presentationInput(syntheticSearchGeo()));
  assertBlock(html, /vùng nổi bật/u);
  assert.match(textOf(html), /Mức quan tâm tìm kiếm\s*Đã dùng trong lượt này/u);
});

test('a map the report cannot use changes no byte in either renderer', async () => {
  const plainReader = (await reader()).html, plainDraft = draftHtml(await presentationInput());
  for (const value of unusable) {
    assert.equal((await reader(value)).html, plainReader, `${value.status} ${value.reason}`);
    assert.equal(draftHtml(await presentationInput(value)), plainDraft, `${value.status} ${value.reason}`);
  }
  assert.doesNotMatch(plainDraft, /Bảng 5\.2/u);
});

test('unknown provider labels never enter visible text or break either report gate; missing averages stay blank', async () => {
  for (const name of ['Metric', 'SerpApi', 'https://example.test/source', '/tmp/synthetic-map', '192.0.2.1']) {
    const geo = syntheticSearchGeo(undefined, { provinces: [{ name, index: 100 }, { name: 'Hà Nội', index: 90 }] });
    for (const html of [(await reader(geo)).html, draftHtml(await presentationInput(geo))]) {
      const { table, text } = geoBlock(html);
      assert.doesNotMatch(text, /Metric|SerpApi|https:|\/tmp\/|192\.0\.2\.1|không có số/u);
      assert.match(text, /Kết quả: toàn quốc, không lọc/u);
      assert.equal([...table!.querySelectorAll('tbody tr')].filter(row => row.children[1]!.textContent === '').length, 5);
      assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: html.includes('id="M05"'), partialTotals: [] }));
      assert.doesNotThrow(() => assertMarket14MachineRules(html));
    }
  }
});

test('source evidence: the drawn map binds its own trends capture as S20, beside the series', () => {
  const empty = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = (searchGeo: StepSearchGeo, captures: readonly CaptureRecord[], searchInterest?: StepSearchInterest) =>
    ({ collection: { searchGeo, ...(searchInterest ? { searchInterest } : {}) }, captures }) as unknown as Parameters<typeof sourceEvidenceForReport>[1];
  const geoOnly = sourceEvidenceForReport(empty, input(syntheticSearchGeo(), [capture(2)]), 'MARKET');
  assert.deepEqual(geoOnly.sourceAppendix.rows.map(row => [row.registryId, row.binding.kind, row.binding.ref]), [['S20', 'capture', '2'.repeat(64)]]);
  const both = sourceEvidenceForReport(empty, input(syntheticSearchGeo(), [capture(1), capture(2)], syntheticSearchInterest()), 'MARKET');
  assert.deepEqual(both.sourceAppendix.rows.map(row => [row.registryId, row.binding.ref]), [['S20', '1'.repeat(64)], ['S20', '2'.repeat(64)]]);
  assert.deepEqual(sourceEvidenceForReport(both, input(syntheticSearchGeo(), [capture(1), capture(2)], syntheticSearchInterest()), 'MARKET'), both, 'idempotent S20 bindings');
  assert.throws(() => sourceEvidenceForReport(empty, input(syntheticSearchGeo(undefined, { captureIndex: 1 }), [capture(1)], syntheticSearchInterest()), 'MARKET'), /capture lineage/u);
  for (const invalid of [{ ...capture(2), truncated: true }, { ...capture(2), retrievedAt: '2026-10-01T00:00:00.000Z' }, { ...capture(2), provider: 'other' }])
    assert.throws(() => sourceEvidenceForReport(empty, input(syntheticSearchGeo(), [invalid]), 'MARKET'), /capture lineage/u);
  assert.deepEqual(sourceEvidenceForReport(empty, input(syntheticSearchGeo(), [capture(2)]), 'INSIGHT'), empty, 'Insight draws no map');
  for (const unused of unusable) assert.deepEqual(sourceEvidenceForReport(empty, input(unused, [capture(2)]), 'MARKET'), empty, `${unused.status}`);
  assert.throws(() => sourceEvidenceForReport(empty, input(syntheticSearchGeo(), [{ ...capture(2), operation: 'serpapi.google.search' }]), 'MARKET'), /by province capture lineage/u);
  assert.throws(() => sourceEvidenceForReport(empty, input(syntheticSearchGeo(), []), 'MARKET'), /by province capture lineage/u);
});
