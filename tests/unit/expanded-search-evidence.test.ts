import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import type { RetainedKeywordListDraftRecord } from '../../src/modules/analysis/keyword-list-draft-record.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence, verifySourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import type { CaptureRecord, ExpandedSearchKind, StepExpandedSearch, StepResultDocument, StepWebResult } from '../../src/modules/analysis/research-automation/model.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const data: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'web-page-type-209-v1', category: 'synthetic',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'synthetic other product' }] };
const draft = { output: data } as unknown as RetainedKeywordListDraftRecord;
import { admitWebResults } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { planExpandedSearch } from '../../src/modules/analysis/research-automation/expanded-search-queries.js';
import { collectionWebRows, expandedQueryDocument, expandedSearchEnabled, webResultUrlKey, EXPANDED_SEARCH_LABEL, EXPANDED_SEARCH_MAX_CALLS, EXPANDED_SEARCH_PLAN, EXPANDED_SEARCH_USAGE_ORDINAL, type ExpandedSearchAttempt } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import type { CollectResult } from '../../src/modules/analysis/research-automation/providers.js';
import { auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
const capture = (ordinal: number): CaptureRecord => ({ stepId: 'COLLECTION', ordinal, artifactSha256: String.fromCharCode(98 + ordinal).repeat(64), mediaType: 'application/json', provider: 'serpapi',
  operation: 'serpapi.google.search', retrievedAt: '2026-10-12T00:00:00.000Z', window: null, truncated: false });
const captures = [0, 1, 2, 3].map(capture);
const row = (position: number, title: string, url: string, captureIndex: number, extra: Partial<StepWebResult> = {}): StepWebResult =>
  ({ position, title, url, snippet: null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex, ...extra });
const plain = row(1, 'Thạch dừa 500g giá tốt', 'https://shop.example.test/thach-dua', 0, { site: 'Cửa hàng synthetic' });
const window = row(1, 'Cách làm thạch dừa tại nhà', 'https://blog.example.test/cach-lam-thach-dua', 1, { site: 'Blog synthetic' });
const shopee = row(1, 'Thạch dừa trên sàn', 'https://shopee.example.test/thach-dua', 2, { site: 'Sàn synthetic' });
const tiktok = row(1, 'Thạch dừa tăng giá mùa hè', 'https://vnexpress.net/thach-dua-tang-gia', 3, { site: 'Báo synthetic', published: '3 ngày trước' });
const excluded = row(2, 'Cách làm thạch dứa', 'https://blog.example.test/thach-dua-cach-lam', 1);
const expandedSearch = (rows: Record<'WINDOW' | 'SHOPEE' | 'TIKTOK', StepWebResult[]>): StepExpandedSearch => ({ queries: (['WINDOW', 'SHOPEE', 'TIKTOK'] as const).map((kind, i) => ({ kind, status: 'COLLECTED' as const, reason: null,
  requestedWindow: kind === 'WINDOW' ? { startDate: '2026-01-01', endDate: '2026-01-30' } : null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex: i + 1, results: rows[kind] })) });
const stored = expandedSearch({ WINDOW: [window, excluded], SHOPEE: [shopee], TIKTOK: [tiktok] });
const collection = { runId, stepId: 'COLLECTION', webResults: [plain], expandedSearch: stored, coverage: [], comparables: [] } as unknown as StepResultDocument;
const all = collectionWebRows(collection);
const evidence = (webResults: StepWebResult[], pageTypes: boolean, caps = captures) => buildSourceEvidence({ draft, draftDigest: 'a'.repeat(64), unavailableReason: null, webResults,
  captures: caps, ...(pageTypes ? { pageTypes } : {}) });
const ids = (packet: ReturnType<typeof evidence>) => packet.sourceAppendix.rows.map(r => r.registryId);
async function presentationInput(): Promise<AutomationReportInput> {
  const metric = calculateMetricScopes(metricFixture());
  const rows = sync1ReaderFixture('1.4.0').rows;
  const unit = unitPriceFixture(rows);
  const record = { contractVersion: 'reader-unit-spec-intake-record-v1' as const, workspaceId, runId, draftPairId: 'a'.repeat(64),
    workbookSha256: 'b'.repeat(64), actorId: 'synthetic-owner', request: { contractVersion: 'reader-unit-spec-intake-v1' as const,
      metricPackageId: runId, platforms: ['shopee', 'tiktok'] as ('shopee' | 'tiktok')[], unitPrices: unit.packet } };
  const binding: MarketPresentationBinding = { workspaceId, runId, previousPairId: record.draftPairId, scopeSha256: 'c'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'd'.repeat(64), packageContentSha256: 'e'.repeat(64) },
      workbookSha256: record.workbookSha256, resultSha256: marketPresentationDigest(metric) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric, rows, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
  return { run: { runId, workspaceId, createdAt: '2026-01-01T00:00:00.000Z', coverage: [], usage: {} },
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic jar', description: null,
      interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: null, captures: [], marketPresentation, marketPresentationCharts: await renderMarketCharts(marketPresentation.input.rows) } as unknown as AutomationReportInput;
}


test('rows are tagged by the query that produced them and listed after the plain rows', () => {
  assert.deepEqual(all.map(r => [r.url, r.origin]), [[plain.url, undefined], [window.url, 'WINDOW'], [excluded.url, 'WINDOW'], [shopee.url, 'SHOPEE'], [tiktok.url, 'TIKTOK']]);
  assert.deepEqual(collectionWebRows({ webResults: [plain] }).map(r => r.origin), [undefined]);
  assert.deepEqual(collectionWebRows(null), []);
  assert.equal('origin' in (collection.expandedSearch!.queries[0]!.results[0]!), false, 'storage keeps no per-row origin');
});

test('extra rows pass the same L9 admission and page typing as the plain rows', () => {
  const packet = evidence(all, true);
  assert.deepEqual([ids(packet).filter(id => id === 'S13').length, ids(packet).filter(id => id === 'S26').length], [1, 1], 'one how-to use and one news use');
  assert.deepEqual(ids(packet).filter(id => id === 'S19').length, 4, 'S19 keeps one use per capture, extra captures included');
  assert.equal(packet.sourceAppendix.rows.filter(r => r.registryId === 'S19').reduce((sum, r) => sum + (r.l9Excluded ?? 0), 0), 1, 'the excluded extra row is an L9 exclusion, like a plain one');
  const admitted = admitWebResults(packet, all, captures, null);
  assert.deepEqual(admitted.map(r => r.url), [plain.url, window.url, shopee.url, tiktok.url]);
  assert.deepEqual(admitted.map(r => r.origin), [undefined, 'WINDOW', 'SHOPEE', 'TIKTOK'], 'origin survives admission');
  assert.doesNotThrow(() => verifySourceEvidence(packet, { draft, draftDigest: packet.draftDigest, unavailableReason: null, webResults: all, captures }));
  assert.throws(() => verifySourceEvidence(packet, { draft, draftDigest: packet.draftDigest, unavailableReason: null, webResults: [plain], captures }), /exact replay/);
});

test('replay: a stored packet without extra rows verifies byte-identically', () => {
  const before = evidence([plain], true, [capture(0)]);
  assert.doesNotThrow(() => verifySourceEvidence(before, { draft, draftDigest: before.draftDigest, unavailableReason: null, webResults: collectionWebRows({ webResults: [plain] }), captures: [capture(0)] }));
  assert.deepEqual(ids(before), ['S19']);
});

test('URL keys fold scheme, host case, trailing slash and fragment; a different query string is a different page', () => {
  assert.equal(webResultUrlKey('https://Example.test/a/#top'), webResultUrlKey('https://example.test/a'));
  assert.equal(webResultUrlKey('http://example.test/a/'), webResultUrlKey('https://example.test/a'));
  assert.notEqual(webResultUrlKey('https://example.test/a?x=1'), webResultUrlKey('https://example.test/a'));
  assert.equal(webResultUrlKey('not a url'), 'not a url');
});

const called = (kind: ExpandedSearchKind, over: Partial<CollectResult>): ExpandedSearchAttempt => ({ kind, state: 'CALLED', requestedWindow: null, result: { status: 'SUCCEEDED', captures: [], ...over } as unknown as CollectResult });

test('a settled attempt is stored with its reason code and no rows when it did not succeed', () => {
  const seen = new Set<string>();
  assert.deepEqual(expandedQueryDocument({ kind: 'SHOPEE', state: 'SKIPPED', reason: 'NOT_PLANNED' }, null, seen), { kind: 'SHOPEE', status: 'SKIPPED', reason: 'NOT_PLANNED', requestedWindow: null, retrievedAt: null, captureIndex: null, results: [] });
  assert.deepEqual(expandedQueryDocument({ kind: 'TIKTOK', state: 'THROWN' }, null, seen).reason, 'PROVIDER_FAILED');
  assert.deepEqual(expandedQueryDocument(called('WINDOW', { status: 'WAITING_FOR_INPUT' }), null, seen).reason, 'BUDGET_EXHAUSTED');
  const cap = { completedAt: '2026-10-12T00:00:01.000Z' };
  const cancelled = expandedQueryDocument(called('WINDOW', { status: 'CANCELLED', captures: [cap] as never }), 2, seen);
  assert.deepEqual([cancelled.status, cancelled.reason, cancelled.captureIndex, cancelled.results], ['FAILED', 'CANCELLED', 2, []]);
  const failed = expandedQueryDocument(called('WINDOW', { status: 'FAILED', captures: [cap] as never }), 2, seen);
  assert.deepEqual([failed.status, failed.reason, failed.captureIndex], ['FAILED', 'PROVIDER_FAILED', 2]);
});

test('the planner issues one query per kind for the exact keyword and refuses operator text', () => {
  const base = { version: 'expanded-search-request-v1' as const, confirmedProducts: [], confirmedBrands: [], requestedWindow: null };
  for (const siteDomain of [null, 'shopee.vn', 'tiktok.com']) {
    const planned = planExpandedSearch({ ...base, siteDomain, exactKeyword: 'bình giữ nhiệt' });
    assert.equal(planned.length, 1);
    assert.equal(planned[0]!.parameters.q, siteDomain ? `bình giữ nhiệt site:${siteDomain}` : 'bình giữ nhiệt');
  }
  assert.throws(() => planExpandedSearch({ ...base, siteDomain: null, exactKeyword: 'bình site:evil.test' }));
  assert.throws(() => planExpandedSearch({ ...base, siteDomain: null, exactKeyword: '   ' }));
});

test('the lane is a fixed set of three, in order, with neutral labels', () => {
  assert.deepEqual(EXPANDED_SEARCH_PLAN.map(item => [item.kind, item.windowed, item.siteDomain]), [['WINDOW', true, null], ['SHOPEE', false, 'shopee.vn'], ['TIKTOK', false, 'tiktok.com']]);
  assert.equal(EXPANDED_SEARCH_MAX_CALLS, 3);
  assert.deepEqual(EXPANDED_SEARCH_USAGE_ORDINAL, { WINDOW: 4, SHOPEE: 5, TIKTOK: 6 });
  assert.deepEqual(Object.values(EXPANDED_SEARCH_LABEL), ['Trong kỳ báo cáo', 'Trên Shopee', 'Trên TikTok Shop']);
  for (const label of Object.values(EXPANDED_SEARCH_LABEL)) assert.doesNotMatch(label, /site:|google|serp/iu);
  assert.equal(expandedSearchEnabled({}), false);
  assert.equal(expandedSearchEnabled({ TDN_RESEARCH_EXPANDED_SEARCH_ENABLED: '1' }), true);
  assert.equal(expandedSearchEnabled({ TDN_RESEARCH_EXPANDED_SEARCH_ENABLED: 'true' }), false);
});

test('a Market presentation with extra rows passes every gate, labels each row and still types the pages', async () => {
  const input = await presentationInput();
  const packet = evidence(all, true);
  const built = buildResearchAutomationReport({ ...input, captures, sourceEvidence: packet, start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, collection } as unknown as AutomationReportInput, 'MARKET');
  const html = built.html.toString('utf8');
  const document = new JSDOM(html).window.document;
  const table = [...document.querySelectorAll('table')].find(t => t.querySelector('caption')?.textContent?.startsWith('Kết quả tìm kiếm trên web'))!;
  assert.ok(table);
  const heads = [...table.querySelectorAll('th')].map(th => th.textContent);
  const at = heads.indexOf('Lượt tìm'), typeAt = heads.indexOf('Loại trang');
  assert.ok(at > 0 && typeAt > 0);
  const body = [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent ?? ''));
  assert.deepEqual(body.map(cells => cells[at]), ['', 'Trong kỳ báo cáo', 'Trên Shopee', 'Trên TikTok'], 'the excluded extra row is not rendered');
  assert.deepEqual(body.map(cells => cells[typeAt]?.split('Đăng')[0]), ['Trang khác', 'Bài hướng dẫn', 'Trang khác', 'Tin tức']);
  assert.match(document.body.textContent ?? '', /kỳ tìm là khoảng ngày đã yêu cầu, không phải ngày xảy ra sự việc/);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true, partialTotals: [] }));
  const gate = auditMarketReportHtml(html, { presentation: true, partialTotals: [] });
  for (const rule of ['PARTIAL_TOTAL_FORBIDDEN', 'NO_LEAK']) assert.equal(gate.find(item => item.rule === rule)!.ok, true, rule);
  assert.deepEqual(auditMarket14(html).filter(item => ['4', '11', '13'].includes(item.rule) && !item.ok), []);
  assert.deepEqual(providerNameViolations(html), []);
  assert.doesNotMatch(document.body.textContent ?? '', /site:|\btbs\b|\bcdr\b|google|serpapi|số kết quả/iu);
  const without = buildResearchAutomationReport({ ...input, captures: [capture(0)], sourceEvidence: evidence([plain], true, [capture(0)]), start: { ...input.start, sourceEvidenceVersion: 'automation-source-evidence-v1' }, collection: { ...collection, expandedSearch: undefined } } as unknown as AutomationReportInput, 'MARKET').html.toString('utf8');
  assert.equal(without.includes('Lượt tìm'), false);
});
