import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { StepWebResult } from '../../src/modules/analysis/research-automation/model.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const textOf = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');
const at = '2026-10-02T00:00:00.000Z';
const row = (position: number, name: string, origin?: StepWebResult['origin']): StepWebResult => ({ position, title: `Bình giữ nhiệt ${name}`, url: `https://example.test/${name}`, snippet: `Mô tả ${name}`, retrievedAt: at, site: 'example.test', published: null, captureIndex: 1, ...(origin ? { origin } : {}) });
const plainRow = row(1, 'chinh-hang');
const expandedRows = [row(1, 'trong-ky', 'WINDOW'), row(1, 'shopee', 'SHOPEE'), row(1, 'tiktok', 'TIKTOK')];

async function reader(rows: StepWebResult[], webPageTypes = false) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: false, webResults: web, ...(webPageTypes ? { webPageTypes: true as const } : {}) });
}
async function presentationInput(web: StepWebResult[] = []): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows, unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  const collection = { runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', comparables: [], productCards: [], webResults: web, coverage: [], limitations: [] };
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows),  } as unknown as AutomationReportInput;
}


test('reader report: extra rows carry a neutral label column; plain rows leave it empty', async () => {
  const built = await reader([plainRow, ...expandedRows], true);
  const doc = new JSDOM(built.html).window.document;
  const table = [...doc.querySelectorAll('table')].find(item => item.textContent!.includes('Trang tìm thấy'))!;
  const headers = [...table.querySelectorAll('th')].map(item => item.textContent!.trim());
  assert.deepEqual(headers, ['Trang tìm thấy', 'Lượt tìm', 'Loại trang', 'Đoạn mô tả hiển thị']);
  const rows = [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')][1]!.textContent!.trim());
  assert.deepEqual(rows, ['', 'Trong kỳ báo cáo', 'Trên Shopee', 'Trên TikTok Shop']);
  const text = textOf(built.html);
  assert.match(text, /kỳ tìm là khoảng ngày đã yêu cầu, không phải ngày xảy ra sự việc/u);
  assert.doesNotMatch(text, /site:|\btbs\b|\bcdr\b|Google|serpapi|số kết quả/iu);
  assert.deepEqual(built.webResults.map(item => item.origin), [undefined, 'WINDOW', 'SHOPEE', 'TIKTOK']);
});

test('reader report: without extra rows the report is byte-identical to a build that never heard of them', async () => {
  const plain = (await reader([plainRow])).html;
  assert.equal(plain.includes('Lượt tìm'), false);
  assert.equal((await reader([plainRow], false)).html, plain);
  assert.equal(plain.includes('kỳ tìm'), false);
});

test('reader report: gates and the 14 machine rules hold with extra rows', async () => {
  const built = await reader([plainRow, ...expandedRows], true);
  const gate = auditMarketReportHtml(built.html, { presentation: false }).filter(item => !item.ok).map(item => item.rule);
  const rules = auditMarket14(built.html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  assert.deepEqual([gate, rules], [[], []]);
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
});

const draftHtml = (input: AutomationReportInput): string => buildResearchAutomationReport(input, 'MARKET').html.toString('utf8');

test('presentation build with extra rows passes the business gate, the partial-total rule, NO_LEAK and the 14 machine rules', async () => {
  const html = draftHtml(await presentationInput([plainRow, ...expandedRows]));
  const text = textOf(html);
  for (const label of ['Trong kỳ báo cáo', 'Trên Shopee', 'Trên TikTok Shop']) assert.ok(text.includes(label), label);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true, partialTotals: [] }));
  assert.doesNotThrow(() => assertMarket14MachineRules(html));
  const gate = auditMarketReportHtml(html, { presentation: true, partialTotals: [] });
  for (const rule of ['PARTIAL_TOTAL_FORBIDDEN', 'NO_LEAK', 'G08_PROVIDER_NAME']) assert.equal(gate.find(item => item.rule === rule)!.ok, true, rule);
  const rules = auditMarket14(html);
  for (const id of ['4', '11', '13']) assert.equal(rules.find(rule => rule.rule === id)!.ok, true, `rule ${id}: ${rules.find(rule => rule.rule === id)!.detail}`);
  assert.doesNotMatch(text, /site:|\btbs\b|\bcdr\b|Google|serpapi/iu);
  assert.doesNotMatch(text, /số kết quả|tổng số/iu, 'pointers only: no counts or totals');
});

test('presentation build: no extra rows, no label and no note', async () => {
  const html = draftHtml(await presentationInput([plainRow]));
  assert.equal(html.includes('Lượt tìm'), false);
  assert.equal(html.includes('Trên Shopee'), false);
});
