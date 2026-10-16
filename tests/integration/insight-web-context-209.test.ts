import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { insightReaderFixture, readerRunId, readerWorkspaceId } from '../helpers/insight-reader-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import type { RetainedKeywordListDraftRecord } from '../../src/modules/analysis/keyword-list-draft-record.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import type { CaptureRecord, StepExpandedSearch, StepResultDocument, StepWebResult } from '../../src/modules/analysis/research-automation/model.js';
import { buildSourceEvidence, type AutomationSourceEvidence } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { WEB_SITE_WITHHELD, WEB_TITLE_WITHHELD } from '../../src/modules/analysis/research-automation/web-page-type.js';
import { prepareInsightReaderBuild } from '../../src/modules/analysis/reader-report/insight-build-v1.js';
import { buildInsightReaderTemplate } from '../../src/modules/analysis/reader-report/insight-template.js';
import { INSIGHT_SECTION_IDS } from '../../src/modules/analysis/reader-report/insight-projection.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';

const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const data: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1', dataVersion: 'insight-web-209-v1', category: 'synthetic',
  provenance: 'OPERATOR_SUPPLIED', keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'synthetic other product' }] };
const draft = { output: data } as unknown as RetainedKeywordListDraftRecord;
const capture = (ordinal: number): CaptureRecord => ({ stepId: 'COLLECTION', ordinal, artifactSha256: String.fromCharCode(98 + ordinal).repeat(64), mediaType: 'application/json', provider: 'serpapi',
  operation: 'serpapi.google.search', retrievedAt: '2026-10-12T00:00:00.000Z', window: null, truncated: false });
const captures = [0, 1, 2, 3].map(capture);
const row = (position: number, title: string, url: string, captureIndex: number, extra: Partial<StepWebResult> = {}): StepWebResult =>
  ({ position, title, url, snippet: null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex, ...extra });
const plain = row(1, 'Thạch dừa 500g giá tốt', 'https://shop.example.test/thach-dua', 0);
const howTo = row(1, 'Cách làm thạch dừa tại nhà', 'https://blog.example.test/cach-lam-thach-dua', 1);
const shop = row(1, 'Thạch dừa trên sàn', 'https://shopee.example.test/thach-dua', 2);
const news = row(1, 'Thạch dừa tăng giá mùa hè', 'https://vnexpress.net/thach-dua-tang-gia', 3, { published: '3 ngày trước' });
const excluded = row(2, 'Cách làm thạch dứa', 'https://blog.example.test/thach-dua-cach-lam', 1);
const expanded = (rows: Record<'WINDOW' | 'SHOPEE' | 'TIKTOK', StepWebResult[]>): StepExpandedSearch => ({ queries: (['WINDOW', 'SHOPEE', 'TIKTOK'] as const).map((kind, i) => ({ kind, status: 'COLLECTED' as const, reason: null,
  requestedWindow: kind === 'WINDOW' ? { startDate: '2026-01-01', endDate: '2026-01-30' } : null, retrievedAt: '2026-10-12T00:00:00.000Z', captureIndex: i + 1, results: rows[kind] })) });
const packetFor = (webResults: StepWebResult[], pageTypes: boolean, caps: CaptureRecord[] = captures) => buildSourceEvidence({ draft, draftDigest: 'a'.repeat(64), unavailableReason: null, webResults, captures: caps, ...(pageTypes ? { pageTypes } : {}) });

async function prepared(t: TestContext) {
  const fixture = await insightReaderFixture(t);
  const frozen = fixture.db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope FROM analysis_research_automation_runs WHERE run_id=?').get(readerRunId) as { start: string; scope: string };
  const identity = { workspaceId: readerWorkspaceId, runId: readerRunId, draftPairId: fixture.pair.pairId, semanticSha256: fixture.report.versionId,
    sourceReportSha256: sha(fixture.report.bytes), frozenStartSha256: frozen.start, frozenScopeSha256: frozen.scope, sourceRendererVersion: 'automation-report-kit-v19' as const };
  const build = (over: { collection?: Partial<StepResultDocument>; caps?: CaptureRecord[]; sourceEvidence?: AutomationSourceEvidence }) => {
    const out = prepareInsightReaderBuild(identity, { ...fixture.input, collection: { ...(fixture.input.collection ?? { runId: readerRunId, stepId: 'COLLECTION', coverage: [], comparables: [] }), ...over.collection } as StepResultDocument,
      captures: over.caps ?? captures, ...(over.sourceEvidence ? { sourceEvidence: over.sourceEvidence } : {}) } as AutomationReportInput);
    const html = buildInsightReaderTemplate(out.page).html;
    return { ...out, html, lint: lint(html, { reportKind: 'INSIGHT', visibleTextRules: true, sectionIds: INSIGHT_SECTION_IDS }) };
  };
  return { build };
}
const allRows = [plain, howTo, excluded, shop, news];
const withRows = { webResults: [plain], expandedSearch: expanded({ WINDOW: [howTo, excluded], SHOPEE: [shop], TIKTOK: [news] }) };

test('Insight reader lists admitted plain and expanded pages by type as context pointers only', async t => {
  const { build } = await prepared(t);
  const base = build({ collection: { webResults: [] }, sourceEvidence: packetFor([], true) });
  const full = build({ collection: withRows, sourceEvidence: packetFor(allRows, true) });
  const html = full.html;
  assert.match(html, /<h3>Trang web liên quan<\/h3>/);
  for (const url of [plain.url, howTo.url, shop.url, news.url]) assert.ok(html.includes(`href="${url}"`), url);
  assert.equal(html.includes(excluded.url), false, 'an L9-excluded row is not drawn');
  const block = html.match(/<div class="web-context"[\s\S]*?<\/table>/)![0];
  assert.deepEqual([...block.matchAll(/<td>(Bài hướng dẫn|Tin tức|Trang khác)<\/td>/g)].map(m => m[1]), ['Trang khác', 'Bài hướng dẫn', 'Trang khác', 'Tin tức']);
  assert.match(block, /<td><span data-quote>vnexpress\.net<\/span><\/td>/);
  assert.doesNotMatch(block, /số kết quả|\d+ (kết quả|trang)|%|site:|\btbs\b|\bcdr\b|google|serpapi/iu);
  assert.deepEqual(providerNameViolations(html), []);
  assert.deepEqual(full.lint.filter(r => !r.ok).map(r => r.rule), base.lint.filter(r => !r.ok).map(r => r.rule), 'no new lint failure');
  assert.equal(full.html.indexOf('id="I17"') < full.html.indexOf('insight-web-context'), true, 'drawn inside I17');
});

test('web pages never reach findings, coding, retained methods or other sections', async t => {
  const { build } = await prepared(t);
  const base = build({ collection: { webResults: [] }, sourceEvidence: packetFor([], true) });
  const full = build({ collection: withRows, sourceEvidence: packetFor(allRows, true) });
  assert.deepEqual(full.page.findings, base.page.findings);
  assert.deepEqual(full.page.sections.filter(s => s.id !== 'I17'), base.page.sections.filter(s => s.id !== 'I17'));
  assert.deepEqual(full.input.retainedMethods.map(r => r.kind), base.input.retainedMethods.map(r => r.kind));
  assert.equal(full.input.contractVersion, base.input.contractVersion);
  const i17 = full.page.sections.find(s => s.id === 'I17')!, i17Base = base.page.sections.find(s => s.id === 'I17')!;
  assert.equal(i17.explanation, i17Base.explanation);
  assert.equal(i17.body.startsWith(i17Base.body.slice(0, 200)), true);
  assert.doesNotMatch(full.page.findings.toString() + JSON.stringify(full.page.findings), /thach-dua|Cách làm thạch dừa/);
});

test('no admitted rows, or a stored packet without the page-type marker, leaves the page byte-identical', async t => {
  const { build } = await prepared(t);
  const none = build({ collection: { webResults: [] }, sourceEvidence: packetFor([], true) });
  const allExcluded = build({ collection: { webResults: [excluded] }, sourceEvidence: packetFor([excluded], true, [capture(1)]), caps: [capture(1)] });
  assert.equal(allExcluded.html.includes('insight-web-context'), false, 'no empty section and no note');
  const storedStyle = build({ collection: withRows, sourceEvidence: packetFor(allRows, false) });
  const storedPacket = packetFor(allRows, false), markedPacket = packetFor([excluded], true, [capture(1)]);
  assert.equal(build({ collection: withRows, sourceEvidence: storedPacket }).html, build({ collection: { webResults: [] }, sourceEvidence: storedPacket }).html, 'stored rows change nothing without the marker');
  assert.equal(build({ collection: { webResults: [excluded] }, sourceEvidence: markedPacket, caps: [capture(1)] }).html, build({ collection: { webResults: [] }, sourceEvidence: markedPacket, caps: [capture(1)] }).html, 'no admitted row changes nothing');
  const storedNone = build({ collection: { webResults: [] }, sourceEvidence: packetFor([], false) });
  assert.equal(storedStyle.html.includes('insight-web-context'), false);
  assert.equal(none.html.includes('insight-web-context'), false);
  const noSource = build({ collection: withRows });
  assert.equal(noSource.html.includes('insight-web-context'), false, 'a report without a source packet is unchanged');
  assert.equal(sha(storedStyle.html) === sha(build({ collection: withRows, sourceEvidence: packetFor(allRows, false) }).html), true, 'deterministic');
  assert.equal(storedNone.html.includes('insight-web-context'), false);
});

test('registered use must match the rows drawn', async t => {
  const { build } = await prepared(t);
  const packet = packetFor(allRows, true);
  const dropped: AutomationSourceEvidence = { ...packet, sourceAppendix: { ...packet.sourceAppendix, rows: packet.sourceAppendix.rows.filter(r => r.registryId !== 'S13') } };
  assert.throws(() => build({ collection: withRows, sourceEvidence: dropped }), /registered source usage/);
  const dup: AutomationSourceEvidence = { ...packet, sourceAppendix: { ...packet.sourceAppendix, rows: [...packet.sourceAppendix.rows, packet.sourceAppendix.rows[0]!] } };
  assert.throws(() => build({ collection: withRows, sourceEvidence: dup }), /duplicated/);
});

test('provider and search-engine words in a copied title, domain or address are withheld; the full build and lint still pass', async t => {
  const { build } = await prepared(t);
  const base = build({ collection: { webResults: [] }, sourceEvidence: packetFor([], true) });
  const bad = [row(1, 'Thạch dừa Metric giá tốt', 'https://metric.vn/thach-dua', 0), row(2, 'Thạch dừa Kalodata', 'https://kalodata.com/thach-dua', 0),
    row(3, 'Thạch dừa SerpApi', 'https://blog.example.test/thach-dua-serpapi', 0), row(4, 'Thạch dừa trên Google', 'https://news.google.com/thach-dua', 0),
    row(5, 'Thạch dừa Apify Dami TradeInt', 'https://example.test/thach-dua', 0), row(6, 'Thạch dừa sạch', 'https://clean.example.test/thach-dua', 0),
    row(7, 'site:shopee.vn thạch dừa', 'https://shop.example.test/thach-dua-7', 0), row(8, 'Thạch dừa G o o g l e', 'https://shop.example.test/thach-dua-8', 0),
    row(9, 'Thạch dừa Page Index', 'https://shop.example.test/%47oogle-thach-dua', 0)];
  const out = build({ collection: { webResults: bad }, sourceEvidence: packetFor(bad, true, [capture(0)]), caps: [capture(0)] });
  const visible = out.html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ');
  assert.match(visible, /Thạch dừa sạch/);
  assert.doesNotMatch(visible, /metric|kalodata|serpapi|google|apify|dami|tradeint/iu);
  assert.doesNotMatch(visible, /site:|g\s+o\s+o\s+g\s+l\s+e|page\s+index/iu, 'operators and spaced names are withheld too');
  assert.equal(out.html.includes('%47oogle'), false, 'an encoded search-engine address is not linked');
  assert.deepEqual(providerNameViolations(out.html), []);
  assert.ok(out.html.includes(WEB_TITLE_WITHHELD) && out.html.includes(WEB_SITE_WITHHELD), 'same withheld wording as Market');
  const block = /<div class="web-context"[\s\S]*?<\/tbody>/.exec(out.html)?.[0] ?? '';
  assert.match(block, /Thạch dừa sạch/);
  assert.doesNotMatch(block, /metric|kalodata|serpapi|google|apify|dami|tradeint/iu, 'raw block incl. attributes and links');
  assert.deepEqual(out.lint.filter(r => !r.ok).map(r => r.rule), base.lint.filter(r => !r.ok).map(r => r.rule), 'publication lint adds no failure');
  assert.equal(out.lint.find(r => r.rule.startsWith('F1'))!.ok, true);
});

test('each drawn page type needs its exact (registryId, capture) usage', async t => {
  const { build } = await prepared(t);
  const packet = packetFor(allRows, true);
  const moved: AutomationSourceEvidence = { ...packet, sourceAppendix: { ...packet.sourceAppendix, rows: packet.sourceAppendix.rows.map(r => r.registryId === 'S26' ? { ...r, binding: { ...r.binding, ref: 'f'.repeat(64) } } : r) } };
  assert.throws(() => build({ collection: withRows, sourceEvidence: moved }), /registered source usage/);
});
