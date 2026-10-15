import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { filterKeywordMeanings } from '../../src/modules/analysis/keyword-meaning-filter.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import type { RetainedKeywordListDraftRecord } from '../../src/modules/analysis/keyword-list-draft-record.js';
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { buildAutomationMarketPresentation, marketPresentationDigest, type MarketPresentationBinding } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildSourceEvidence, verifySourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { sourceEvidenceHtml } from '../../src/modules/analysis/research-automation/source-evidence-report.js';
import type { CaptureRecord, StepWebResult } from '../../src/modules/analysis/research-automation/model.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const data: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'web-page-type-209-v1', category: 'synthetic',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'synthetic other product' }] };
const draft = { output: data } as unknown as RetainedKeywordListDraftRecord;
const capture: CaptureRecord = { stepId: 'COLLECTION', ordinal: 0, artifactSha256: 'b'.repeat(64), mediaType: 'application/json', provider: 'serpapi',
  operation: 'serpapi.search', retrievedAt: '2026-10-12T00:00:00.000Z', window: null, truncated: false };
const row = (position: number, title: string, url: string, extra: Partial<StepWebResult> = {}): StepWebResult =>
  ({ position, title, url, snippet: null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex: 0, ...extra });
const howTo = row(1, 'Cách làm thạch dừa tại nhà', 'https://blog.example.test/cach-lam-thach-dua', { site: 'Blog synthetic' });
const news = row(2, 'Thạch dừa tăng giá mùa hè', 'https://vnexpress.net/thach-dua-tang-gia', { site: 'Báo synthetic', published: '3 ngày trước' });
const other = row(3, 'Thạch dừa 500g giá tốt', 'https://shop.example.test/thach-dua', { site: 'Cửa hàng synthetic' });
const excludedHowTo = row(4, 'Cách làm thạch dứa', 'https://blog.example.test/thach-dua-cach-lam');
const evidence = (webResults: StepWebResult[], pageTypes: boolean) => buildSourceEvidence({ draft, draftDigest: 'a'.repeat(64), unavailableReason: null, webResults,
  captures: [capture], ...(pageTypes ? { pageTypes } : {}) });
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

test('packet registers S13 and S26 only for admitted rows of that type; S19 keeps the L9 accounting', () => {
  const packet = evidence([howTo, news, other, excludedHowTo], true);
  assert.equal(packet.webPageTypes, true);
  assert.deepEqual(ids(packet), ['S19', 'S13', 'S26']);
  const s19 = packet.sourceAppendix.rows[0]!;
  assert.equal(s19.l9Excluded, 1, 'the excluded how-to row stays an L9 exclusion');
  for (const typed of packet.sourceAppendix.rows.slice(1)) assert.deepEqual([typed.l9Excluded, typed.l9Unclear, typed.l10SourceType, typed.binding], [null, null, null, { kind: 'capture', ref: capture.artifactSha256 }]);
  assert.deepEqual(ids(evidence([other, excludedHowTo], true)), ['S19'], 'an excluded or untyped row registers nothing extra');
  assert.deepEqual(ids(evidence([howTo], true)), ['S19', 'S13']);
  assert.deepEqual(ids(evidence([news], true)), ['S19', 'S26']);
  assert.doesNotThrow(() => verifySourceEvidence(packet, { draft, draftDigest: packet.draftDigest, unavailableReason: null, webResults: [howTo, news, other, excludedHowTo], captures: [capture] }));
  assert.deepEqual(ids(sourceEvidenceForReport(packet, {} as never, 'MARKET')), ['S19', 'S13', 'S26'], 'report projection keeps the typed uses');
});

test('replay: a stored packet without the flag rebuilds byte-identically and never gains S13/S26', () => {
  const stored = evidence([howTo, news, other], false);
  assert.equal('webPageTypes' in stored, false);
  assert.deepEqual(ids(stored), ['S19']);
  assert.doesNotThrow(() => verifySourceEvidence(stored, { draft, draftDigest: stored.draftDigest, unavailableReason: null, webResults: [howTo, news, other], captures: [capture] }));
  const flagged = evidence([howTo, news, other], true);
  assert.throws(() => verifySourceEvidence({ ...stored, webPageTypes: true }, { draft, draftDigest: stored.draftDigest, unavailableReason: null, webResults: [howTo, news, other], captures: [capture] }), /exact replay/);
  assert.throws(() => verifySourceEvidence({ ...flagged, sourceAppendix: stored.sourceAppendix }, { draft, draftDigest: flagged.draftDigest, unavailableReason: null, webResults: [howTo, news, other], captures: [capture] }), /exact replay/);
});

test('appendix wording names no search engine and gives S26 a plain name', () => {
  const html = sourceEvidenceHtml(evidence([howTo, news, other], true));
  assert.doesNotMatch(html, /google/i);
  assert.match(html, /kết quả tìm kiếm/);
  assert.match(html, /bài hướng dẫn công khai/);
  assert.match(html, /tin tức đã đăng trên trang báo/);
});

test('a Market presentation with how-to, news and other rows passes every gate and shows the page type', async () => {
  const input = await presentationInput();
  const webResults = [howTo, news, other, excludedHowTo];
  const packet = evidence(webResults, true);
  const built = buildResearchAutomationReport({ ...input, captures: [capture], sourceEvidence: packet,
    collection: { webResults, coverage: [], comparables: [] } } as unknown as AutomationReportInput, 'MARKET');
  const html = built.html.toString('utf8');
  const document = new JSDOM(html).window.document;
  const table = [...document.querySelectorAll('table')].find(t => t.querySelector('caption')?.textContent?.startsWith('Kết quả tìm kiếm trên web'));
  assert.ok(table, 'the saved search result table is rendered');
  const heads = [...table.querySelectorAll('th')].map(th => th.textContent);
  const typeAt = heads.indexOf('Loại trang');
  assert.ok(typeAt > 0, 'the page-type column exists');
  const body = [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent ?? ''));
  assert.deepEqual(body.map(cells => cells[typeAt]?.split('Đăng')[0]), ['Bài hướng dẫn', 'Tin tức', 'Trang khác'], 'excluded rows are not rendered');
  assert.match(body[1]![typeAt]!, /Đăng 3 ngày trước/, 'a news row shows the publication date it carries');
  assert.doesNotMatch(body[0]![typeAt]! + body[2]![typeAt]!, /Đăng/, 'rows without a date show none');
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: true }));
  assert.ok(lintVisibleReportText(html).every(check => check.ok), JSON.stringify(lintVisibleReportText(html).filter(check => !check.ok)));
  assert.deepEqual(providerNameViolations(html), []);
  const failed = auditMarket14(html).filter(item => item.rule === '4' || item.rule === '13').filter(item => !item.ok);
  assert.deepEqual(failed, [], 'rules 4 (no search-engine or provider word) and 13 (label kết quả tìm kiếm) hold');
  assert.doesNotMatch(document.body.textContent ?? '', /google/i);
  assert.match(document.body.textContent ?? '', /Kết quả tìm kiếm/);
  const plain = buildResearchAutomationReport({ ...input, captures: [capture], sourceEvidence: evidence(webResults, false),
    collection: { webResults, coverage: [], comparables: [] } } as unknown as AutomationReportInput, 'MARKET').html.toString('utf8');
  assert.doesNotMatch(plain, /Loại trang/, 'a packet without the flag renders as before');
});
