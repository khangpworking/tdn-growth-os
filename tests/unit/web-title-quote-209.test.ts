import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { CaptureRecord, StepWebResult } from '../../src/modules/analysis/research-automation/model.js';
import { WEB_SITE_WITHHELD, WEB_TITLE_WITHHELD } from '../../src/modules/analysis/research-automation/web-page-type.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

/**
 * A replayed quạt điện run collected every source, then failed at REPORTS with
 * MARKET_BUSINESS_GATE_FAILED:U13_SUPERLATIVE. The saved web search results
 * carried page titles such as "Top 10 … bán chạy nhất năm 2025" and the table
 * printed them as plain cells, so the owned-wording rule read the source's
 * title as the report's own claim. Rows and wording here are synthetic.
 */
const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const TITLE = 'Top 10 quạt synthetic bán chạy nhất năm 2025';
const SITE = 'Trang synthetic hàng đầu';
const capture: CaptureRecord = { stepId: 'COLLECTION', ordinal: 0, artifactSha256: 'b'.repeat(64), mediaType: 'application/json', provider: 'serpapi',
  operation: 'serpapi.search', retrievedAt: '2026-10-12T00:00:00.000Z', window: null, truncated: false };
const row = (position: number, title: string, url: string, extra: Partial<StepWebResult> = {}): StepWebResult =>
  ({ position, title, url, snippet: null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex: 0, ...extra });
const rows = (): StepWebResult[] => [row(1, TITLE, 'https://shop.example.test/top-quat', { site: SITE }),
  row(2, 'Quạt synthetic tin tức mới nhất 24h qua', 'https://news.example.test/quat', { site: 'Báo synthetic' }),
  row(3, 'Quạt synthetic không ghi trang', 'https://blog.example.test/quat')];

async function presentationInput(webResults: StepWebResult[]): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const readerRows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(readerRows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows: readerRows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: { runId, stepId: 'COLLECTION', webResults, coverage: [], comparables: [] }, captures: [capture], marketPresentation,
    marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows) } as unknown as AutomationReportInput;
}

/** The draft (non-presentation) Market report that the failing run rendered. */
function plainInput(webResults: StepWebResult[]): AutomationReportInput {
  const period = { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 };
  const run: ResearchAutomationRun = {
    contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 8, status: 'RENDERING', country: 'VN', mode: 'CATEGORY',
    keyword: 'synthetic-keyword', description: null, interview: null, requestedPeriod: period, reports: ['MARKET'], definition: null, productCards: [],
    coverage: { requestedPeriod: period, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
    steps: [], blockers: [], createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
  };
  return {
    run,
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: run.keyword, description: null, interview: null, requestedPeriod: period, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic market scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: { contractVersion: 'research-automation-step-result-v1', runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], comparables: [], coverage: [], limitations: [], webResults },
    captures: [capture],
  } as unknown as AutomationReportInput;
}

const webTable = (html: string): Element => {
  const document = new JSDOM(html).window.document;
  const table = [...document.querySelectorAll('table')].find(t => t.querySelector('caption')?.textContent?.startsWith('Kết quả tìm kiếm trên web'));
  assert.ok(table, 'the saved search result table is rendered');
  return table;
};
const unmarked = (html: string): string => html.replaceAll('<q data-quote>', '<span>').replaceAll('</q>', '</span>');
const gateThrows = (html: string, presentation: boolean, rule: string): void =>
  assert.throws(() => assertMarketBusinessGate(html, { presentation }), new RegExp(`MARKET_BUSINESS_GATE_FAILED:.*${rule}`));

test('WEB-TITLE-209: a copied page title or site name with a superlative passes the draft report gate as visibly quoted text', () => {
  const html = buildResearchAutomationReport(plainInput(rows()), 'MARKET').html.toString('utf8');
  const table = webTable(html);
  const cells = [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')]);
  assert.deepEqual(cells.map(td => td[1]?.textContent), [TITLE, 'Quạt synthetic tin tức mới nhất 24h qua', 'Quạt synthetic không ghi trang'], 'titles keep the source wording');
  assert.deepEqual(cells.map(td => td[2]?.textContent), [SITE, 'Báo synthetic', 'Chưa rõ trang']);
  assert.ok(cells.every(td => td[1]?.querySelector('q[data-quote]')?.textContent === td[1]?.textContent), 'every title is one copied-text quote');
  assert.equal(cells[2]![2]!.querySelector('q'), null, 'the missing-site wording is the report\'s own and is not quoted');
  // The reference list names each page by its site; a copied name is quoted there too, the generic label is not.
  const labels = [...new JSDOM(html).window.document.querySelectorAll('.citation-register .cite-label')];
  assert.deepEqual(labels.map(label => [label.textContent, label.querySelector('q[data-quote]') !== null]),
    [['Bản thu dữ liệu nguồn', false], [SITE, true], ['Báo synthetic', true], ['Kết quả tìm kiếm trên web', false]]);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  // Without the copied-text marker the same page fails exactly as the run did.
  gateThrows(unmarked(html), false, 'U13_SUPERLATIVE');
  // Authored prose is still checked.
  gateThrows(html.replace('</body>', '<p>Quạt synthetic là lựa chọn tốt nhất.</p></body>'), false, 'U13_SUPERLATIVE');
});

test('WEB-TITLE-209: the presentation report passes every visible-text rule with the same rows', async () => {
  const html = buildResearchAutomationReport(await presentationInput(rows()), 'MARKET').html.toString('utf8');
  const table = webTable(html);
  assert.equal(table.querySelectorAll('tbody tr q[data-quote]').length, 5, 'three titles and two site names are quoted');
  assert.ok(lintVisibleReportText(html).every(check => check.ok), JSON.stringify(lintVisibleReportText(html).filter(check => !check.ok)));
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  const neutral = buildResearchAutomationReport(await presentationInput([row(1, 'Quạt synthetic', 'https://shop.example.test/quat', { site: 'Trang synthetic' })]), 'MARKET').html.toString('utf8');
  const failed14 = (value: string) => auditMarket14(value).filter(item => !item.ok).map(item => item.rule);
  assert.deepEqual(failed14(html), failed14(neutral), 'superlative source titles change no 14-rule result');
  gateThrows(unmarked(html), true, 'U13_SUPERLATIVE');
});

test('WEB-TITLE-209: withheld text stays the report wording and source markup cannot leave its cell', () => {
  const hostile = '</q></td></tr><h2 data-quote>synthetic tốt nhất</h2><q>';
  const html = buildResearchAutomationReport(plainInput([row(1, 'Quạt synthetic trên Google', 'https://blog.example.test/quat-1', { site: 'Google' }),
    row(2, hostile, 'https://blog.example.test/quat-2', { site: 'Trang synthetic' })]), 'MARKET').html.toString('utf8');
  const table = webTable(html);
  const cells = [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')]);
  assert.deepEqual([cells[0]![1]!.textContent, cells[0]![2]!.textContent], [WEB_TITLE_WITHHELD, WEB_SITE_WITHHELD]);
  assert.equal(cells[0]![1]!.querySelector('q') ?? cells[0]![2]!.querySelector('q'), null, 'withheld wording is not presented as a quote');
  assert.equal(cells[1]![1]!.textContent, hostile, 'escaped source text stays inside its own cell');
  assert.equal(new JSDOM(html).window.document.querySelector('h2[data-quote]'), null);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
});
