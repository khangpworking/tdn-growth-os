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
import type { CaptureRecord, StepSearchInterest } from '../../src/modules/analysis/research-automation/model.js';
import { assertFlintCharts } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { syntheticSearchInterest, syntheticWeeks } from '../helpers/search-interest-synthetic.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const textOf = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');
const sparse = syntheticSearchInterest({ points: syntheticWeeks(10).map((point, i) => ({ period: point.period, index: i < 2 ? 40 : null })) });
const failed = syntheticSearchInterest({ status: 'FAILED', reason: 'PROVIDER_FAILED', points: [] });
const unusable = [failed, sparse, syntheticSearchInterest({ captureIndex: null }), syntheticSearchInterest({ status: 'SKIPPED', reason: 'PERIOD_NOT_COVERED', captureIndex: null, points: [] })];
const failing = (html: string) => ({
  gate: auditMarketReportHtml(html, { presentation: false }).filter(item => !item.ok).map(item => item.rule),
  rules: auditMarket14(html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule),
});
const deniedAsCount = (text: string) => { const hits = [...text.matchAll(/lượt tìm kiếm/gu)]; return hits.length > 0 && hits.every(hit => /không phải số\s*$/iu.test(text.slice(Math.max(0, hit.index! - 16), hit.index!))); };

async function reader(searchInterest?: StepSearchInterest, version: '1.3.0' | '1.4.0' = '1.4.0', flint = true) {
  const input = sync1ReaderFixture(version); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const options = { ...sync1Options, flint, ...(searchInterest ? { searchInterest } : {}) };
  if (version === '1.3.0') return buildMarketReport(computeReaderReportData(input), options);
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), options);
}

test('reader report: the series sits in the demand section on its own axis, as a relative index', async () => {
  const built = await reader(syntheticSearchInterest());
  const doc = new JSDOM(built.html).window.document, demand = doc.querySelector('#phan-5')!;
  const figure = [...demand.querySelectorAll('figure')].find(item => item.textContent!.includes('Hình 5.2'))!;
  assert.ok(figure, 'Hình 5.2 is in the demand section');
  assert.equal(figure.querySelector('.chart')!.getAttribute('data-engine'), 'flint');
  assert.equal(figure.querySelectorAll('table').length, 0);
  assert.match(figure.textContent!, /chỉ số tương đối/u);
  assert.match(figure.textContent!, /Không phải số lượt tìm kiếm, không phải doanh số/u);
  assert.match(demand.textContent!, /không cộng hay so với số bán/u);
  const salesTables = [...demand.querySelectorAll('table')];
  assert.ok(salesTables.length >= 1);
  assert.ok(salesTables.every(table => !/tìm kiếm|chỉ số/u.test(table.textContent!)), 'no sales table carries the index');
  assert.match(doc.querySelector('#phan-10')!.textContent!, /Chưa dự báo/u);
  assert.equal(doc.querySelector('#phan-10 figure'), null, 'the index is not turned into a forecast');
  assert.doesNotMatch(textOf(built.html), /Google/iu);
  assert.ok(deniedAsCount(demand.textContent!.replace(/\s+/gu, ' ')), 'only ever denied as a count');
  assert.deepEqual(built.charts.filter(chart => chart.id === 'M05.search-interest').map(chart => chart.engine), ['flint']);
  assert.equal(built.charts.length, (await reader()).charts.length + 1);
});

test('reader report: the series gets its own source row and the gates and the 14 machine rules stay as they were', async () => {
  const built = await reader(syntheticSearchInterest()), plain = await reader();
  assert.match(textOf(built.html), /Mức quan tâm tìm kiếm\s*Đã lưu trong lượt này; chỉ số tương đối, không phải doanh số/u);
  for (const label of ['Dữ liệu đánh giá sản phẩm trên nền tảng', 'Kết quả tìm kiếm', 'Bình luận đã thu thập']) assert.match(textOf(built.html), new RegExp(label, 'u'));
  assert.doesNotThrow(() => assertFlintCharts(built.charts, true));
  assert.deepEqual(failing(plain.html), { gate: [], rules: [] });
  assert.deepEqual(failing(built.html), { gate: [], rules: [] }, 'the series adds no failing gate or machine rule');
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
});

test('reader report: a series that is absent, failed or too thin changes no byte', async () => {
  const plain = (await reader()).html;
  for (const value of unusable) assert.equal((await reader(value)).html, plain, value.status);
  assert.doesNotMatch(plain, /Hình 5\.2/u);
  assert.match(plain, /chưa có chuỗi tìm kiếm phù hợp/u);
  assert.equal((await reader(syntheticSearchInterest(), '1.4.0', false)).html.includes('data-engine="flint"'), false, 'the opt-out draws no Flint chart');
});

test('reader report: the older reader contract never renders the series', async () => {
  const legacy = (await reader(undefined, '1.3.0', false)).html;
  assert.equal((await reader(syntheticSearchInterest(), '1.3.0', false)).html, legacy);
  assert.doesNotMatch(legacy, /Hình 5\.2/u);
});

const trendsCapture = (): CaptureRecord => ({ stepId: 'COLLECTION', ordinal: 1, artifactSha256: 'c'.repeat(64), mediaType: 'application/json', provider: 'serpapi',
  operation: 'serpapi.google.trends', retrievedAt: '2026-10-02T00:00:00.000Z', window: null, truncated: false });

async function presentationInput(searchInterest?: StepSearchInterest, chart = true): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows, unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  const collection = { runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', comparables: [], productCards: [], webResults: [], coverage: [], limitations: [], ...(searchInterest ? { searchInterest } : {}) };
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection, captures: [trendsCapture()], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows),
    ...(searchInterest && chart ? { searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)) } : {}) } as unknown as AutomationReportInput;
}
const draftHtml = (input: AutomationReportInput): string => buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');
const flintCharts = (html: string) => [...html.matchAll(/<div class="chart flint" data-engine="([^"]+)">/gu)].map(match => match[1]);

test('presentation build with a series passes the business gate, the partial-total rule, NO_LEAK and the 14 machine rules', async () => {
  const html = draftHtml(await presentationInput(syntheticSearchInterest()));
  assert.deepEqual(flintCharts(html), ['flint', 'flint', 'flint', 'flint'], 'the three required charts plus the series');
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true, partialTotals: [] }));
  assert.doesNotThrow(() => assertMarket14MachineRules(html));
  const gate = auditMarketReportHtml(html, { presentation: true, partialTotals: [] });
  for (const rule of ['PARTIAL_TOTAL_FORBIDDEN', 'NO_LEAK', 'SEARCH_INTEREST_NOT_COUNT', 'G08_PROVIDER_NAME', 'U32_NO_CROSS_PLATFORM_TOTAL', 'E2_NO_REVENUE_ORDER'])
    assert.equal(gate.find(item => item.rule === rule)!.ok, true, rule);
  const rules = auditMarket14(html);
  for (const id of ['4', '11', '13']) assert.equal(rules.find(rule => rule.rule === id)!.ok, true, `rule ${id}: ${rules.find(rule => rule.rule === id)!.detail}`);
  const doc = new JSDOM(html).window.document, demand = doc.querySelector('#M05')!;
  const figure = [...demand.querySelectorAll('figure')].find(item => item.textContent!.includes('Hình 5.2'))!;
  assert.ok(figure);
  assert.equal(figure.querySelectorAll('table').length, 0);
  assert.match(figure.textContent!, /chỉ số tương đối/u);
  assert.match(figure.textContent!, /Không phải số lượt tìm kiếm, không phải doanh số/u);
  assert.match(figure.textContent!, /không đo số người tìm và không cộng hay so với số bán/u);
  assert.ok([...demand.querySelectorAll('table')].every(table => !/tìm kiếm|chỉ số/u.test(table.textContent!)));
  assert.equal(doc.querySelector('#M10 figure'), null);
  assert.match(doc.querySelector('#M10')!.textContent!, /Chưa đủ dữ liệu/u);
  const text = textOf(html);
  assert.doesNotMatch(text, /Google|serpapi/iu);
  assert.match(text, /Mức quan tâm tìm kiếm theo thời gian/u);
  assert.ok(deniedAsCount(demand.textContent!.replace(/\s+/gu, ' ')), 'only ever denied as a count');
});

test('presentation build: a series the report cannot draw is silent, and a drawn series needs its chart', async () => {
  const none = draftHtml(await presentationInput());
  for (const value of unusable) assert.equal(draftHtml(await presentationInput(value)), none, value.status);
  assert.doesNotMatch(none, /Hình 5\.2/u);
  assert.deepEqual(flintCharts(none), ['flint', 'flint', 'flint']);
  const input = await presentationInput(syntheticSearchInterest(), false);
  assert.throws(() => draftHtml(input), /SEARCH_INTEREST_CHART_MISSING/u);
});


test('both readers omit a retrieved in-progress week and the automated reading uses the chart dates', async () => {
  const interest = syntheticSearchInterest({ retrievedAt: '2026-10-19T08:00:00Z', points: [
    { period: '20 – 26 thg 9, 2026', index: 20 }, { period: '27 thg 9 – 3 thg 10, 2026', index: 30 },
    { period: '4 – 10 thg 10, 2026', index: 40 }, { period: '11 – 17 thg 10, 2026', index: 50 },
    { period: '18 – 24 thg 10, 2026', index: 99 },
  ] });
  const before = JSON.stringify(interest);
  for (const html of [(await reader(interest)).html, draftHtml(await presentationInput(interest))]) {
    const doc = new JSDOM(html).window.document;
    const section = doc.querySelector('#M05, #phan-5')!;
    const figure = [...section.querySelectorAll('figure')].find(node => node.textContent!.includes('Hình 5.2'))!;
    assert.match(figure.innerHTML, /11–17\/10\/2026/u);
    assert.doesNotMatch(figure.innerHTML, /18–24|thg|chi_so[^;]*: 99/u);
    const reading = figure.nextElementSibling;
    if (reading?.classList.contains('interp')) {
      assert.match(reading.textContent!, /từ 20–26\/09\/2026 đến 11–17\/10\/2026/u);
      assert.match(reading.textContent!, /từ 20 lên 50/u);
      assert.doesNotMatch(reading.textContent!, /99|18–24/u);
    }
  }
  assert.equal(JSON.stringify(interest), before);
});

test('filtering all dated values leaves no empty search chart in either reader', async () => {
  const interest = syntheticSearchInterest({ retrievedAt: '2026-10-19T08:00:00Z', points: [
    { period: '11 – 17 thg 10, 2026', index: null },
    ...syntheticWeeks(4, '2026-10-18'),
  ] });
  for (const html of [(await reader(interest)).html, draftHtml(await presentationInput(interest))]) {
    const doc = new JSDOM(html).window.document;
    assert.ok([...doc.querySelectorAll('figure')].every(node => !/Hình 5\.2/u.test(node.textContent!)));
    assert.match(doc.querySelector('#M05, #phan-5')!.textContent!, /Chưa có tuần đã kết thúc có số liệu tìm kiếm/u);
  }
});


test('missing retrieval time withholds the chart and explains the empty state in both readers', async () => {
  const interest = syntheticSearchInterest({ retrievedAt: null });
  const before = JSON.stringify(interest);
  for (const html of [(await reader(interest)).html, draftHtml(await presentationInput(interest, false))]) {
    const doc = new JSDOM(html).window.document;
    const section = doc.querySelector('#M05, #phan-5')!;
    assert.ok([...section.querySelectorAll('figure')].every(node => !/Hình 5\.2/u.test(node.textContent!)));
    const empty = [...section.querySelectorAll('p')].find(node => /Chưa có tuần đã kết thúc/u.test(node.textContent!));
    assert.ok(empty, 'the missing search chart has a plain explanation');
    assert.doesNotMatch(empty.textContent!, /%|\b0\b|Google|SerpApi/u);
  }
  assert.equal(JSON.stringify(interest), before);
});
