import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { insightReaderFixture, readerRunId, readerWorkspaceId } from '../helpers/insight-reader-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { META_AD_NAME_WITHHELD, META_AD_NOTE, META_AD_SELLER_VOICE, META_AD_TEXT_WITHHELD, selectMetaAdPages, type MetaAdPage } from '../../src/modules/analysis/research-automation/meta-ad-report.js';
import type { MetaPageSourceView } from '../../src/modules/analysis/research-automation/meta-page-intake.js';
import { INSIGHT_META_AD_SECTIONS } from '../../src/modules/analysis/reader-report/insight-meta-ads.js';
import { prepareInsightReaderBuild } from '../../src/modules/analysis/reader-report/insight-build-v1.js';
import { buildInsightReaderTemplate } from '../../src/modules/analysis/reader-report/insight-template.js';
import { INSIGHT_SECTION_IDS } from '../../src/modules/analysis/reader-report/insight-projection.js';
import { lint } from '../../src/modules/analysis/reader-report/lint.js';

const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const SHA = (char: string): string => char.repeat(64);
const TAKEN = '2026-09-01T03:00:00.000Z';
// Synthetic captures only.
interface AdSpec { readonly libraryId: string; readonly startDate: string; readonly age: number; readonly text: string; readonly pageName?: string }
function view(pageId: string, captureSha: string, ads: readonly AdSpec[], included: readonly string[] | 'all', state: 'CONFIRMED' | 'PREPARED' = 'CONFIRMED'): MetaPageSourceView {
  return { state, projection: { captureSha256: captureSha, capturedAt: TAKEN, pageId, includedLibraryIds: included === 'all' ? ads.map(ad => ad.libraryId) : [...included],
    observations: ads.map(ad => ({ libraryId: ad.libraryId, pageId, pageName: ad.pageName ?? `Cửa hàng mẫu ${pageId}`, startDate: ad.startDate, ageDaysToCapture: ad.age, textFirst200: ad.text })) } } as unknown as MetaPageSourceView;
}
const COPY_ONE = 'Bình giữ nhiệt inox giữ nóng 12 giờ, giao nhanh trong ngày.';
const COPY_TWO = 'Ly giữ nhiệt mẫu mới, nhiều màu để chọn.';
const COPY_EXCLUDED = 'Chai giữ lạnh cho chuyến đi dài.';
const confirmedPages = (): MetaAdPage[] => selectMetaAdPages([
  view('1001', SHA('a'), [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: COPY_ONE }, { libraryId: 'L2', startDate: '2026-04-10', age: 144, text: COPY_TWO }], 'all'),
  view('1002', SHA('b'), [{ libraryId: 'L3', startDate: '2026-05-01', age: 123, text: COPY_TWO }], 'all'),
  view('1003', SHA('c'), [{ libraryId: 'L5', startDate: '2026-02-01', age: 212, text: COPY_EXCLUDED }], 'all', 'PREPARED'),
  view('1004', SHA('d'), [{ libraryId: 'L6', startDate: '2026-02-10', age: 203, text: COPY_EXCLUDED }], [])]);

async function prepared(t: TestContext) {
  const fixture = await insightReaderFixture(t);
  const frozen = fixture.db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope FROM analysis_research_automation_runs WHERE run_id=?').get(readerRunId) as { start: string; scope: string };
  const identity = { workspaceId: readerWorkspaceId, runId: readerRunId, draftPairId: fixture.pair.pairId, semanticSha256: fixture.report.versionId,
    sourceReportSha256: sha(fixture.report.bytes), frozenStartSha256: frozen.start, frozenScopeSha256: frozen.scope, sourceRendererVersion: 'automation-report-kit-v19' as const };
  const build = (metaAds?: readonly MetaAdPage[]) => {
    const out = prepareInsightReaderBuild(identity, { ...fixture.input, ...(metaAds ? { metaAds } : {}) } as AutomationReportInput);
    const html = buildInsightReaderTemplate(out.page).html;
    return { ...out, html, lint: lint(html, { reportKind: 'INSIGHT', visibleTextRules: true, sectionIds: INSIGHT_SECTION_IDS }) };
  };
  return { build };
}
const failed = (results: readonly { ok: boolean; rule: string }[]): string[] => results.filter(item => !item.ok).map(item => item.rule);
const sectionOf = (html: string, id: string): string => new JSDOM(html).window.document.getElementById(id)?.outerHTML ?? '';
const withoutMetaBlocks = (html: string): string => {
  const doc = new JSDOM(html).window.document;
  for (const block of [...doc.querySelectorAll('.meta-ads')]) block.remove();
  return doc.documentElement.outerHTML;
};

test('Insight: no confirmed captures prints nothing of S15 and leaves the page byte-identical', async t => {
  const { build } = await prepared(t);
  const base = build();
  for (const empty of [build([]), build(selectMetaAdPages([]))]) assert.equal(empty.html, base.html);
  for (const marker of ['insight-meta-ads', META_AD_SELLER_VOICE, 'Quảng cáo trên Meta', META_AD_NOTE, META_AD_NAME_WITHHELD, META_AD_TEXT_WITHHELD, 'Bản lưu trang quảng cáo trên Meta'])
    assert.equal(base.html.includes(marker), false, marker);
  const unconfirmed = selectMetaAdPages([view('1003', SHA('c'), [{ libraryId: 'L5', startDate: '2026-02-01', age: 212, text: COPY_EXCLUDED }], 'all', 'PREPARED'), view('1004', SHA('d'), [{ libraryId: 'L6', startDate: '2026-02-10', age: 203, text: COPY_EXCLUDED }], [])]);
  assert.deepEqual(unconfirmed, []);
  assert.equal(build(unconfirmed).html, base.html);
});

test('Insight: confirmed pages appear in I02, I12 and I13 as seller voice, with verbatim quotes and citations', async t => {
  const { build } = await prepared(t);
  const base = build();
  const full = build(confirmedPages());
  const doc = new JSDOM(full.html).window.document;
  assert.deepEqual(INSIGHT_META_AD_SECTIONS, ['I02', 'I12', 'I13']);
  for (const id of INSIGHT_META_AD_SECTIONS) {
    const block = doc.querySelector(`#${id} .meta-ads`);
    assert.ok(block, `${id} carries the seller-voice block`);
    assert.ok(block!.textContent!.includes(META_AD_SELLER_VOICE), `${id} is labelled seller voice`);
    assert.ok(block!.textContent!.includes('Không phải ý kiến khách hàng'), `${id} says it is not customer voice`);
    assert.equal(block!.querySelectorAll('tbody tr').length, 2, `${id}: only the 2 confirmed, L9-included pages`);
    assert.ok(block!.querySelectorAll('sup.cite').length >= 2, `${id}: citation marks`);
  }
  assert.equal(doc.querySelectorAll('.meta-ads').length, 3, 'nowhere else');
  // I02: the quoted copy, byte-exact, as a quotation.
  const i02 = doc.querySelector('#I02 .meta-ads')!;
  assert.deepEqual([...i02.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('span[data-quote]')].map(item => item.textContent)),
    [['Cửa hàng mẫu 1001', COPY_ONE], ['Cửa hàng mẫu 1002', COPY_TWO]]);
  assert.deepEqual([...i02.querySelectorAll('thead th')].map(cell => cell.textContent), ['Trang', 'Lời người bán (quảng cáo)']);
  // I12: presence only; the days and the fixed note.
  const i12 = doc.querySelector('#I12 .meta-ads')!;
  assert.deepEqual([...i12.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent!.replace(/\[\d+\]/gu, '').trim())),
    [['Cửa hàng mẫu 1001', '2', '01/03/2026', '184'], ['Cửa hàng mẫu 1002', '1', '01/05/2026', '123']]);
  assert.ok(i12.textContent!.includes(META_AD_NOTE));
  assert.equal(i12.textContent!.includes(COPY_ONE), false, 'I12 shows no ad copy');
  // I13: page names as the seller wrote them, never as a brand verdict.
  const i13 = doc.querySelector('#I13 .meta-ads')!;
  assert.ok(i13.textContent!.includes('tên trang không xác nhận thương hiệu hay đối thủ'));
  assert.equal(i13.textContent!.includes(COPY_ONE), false, 'I13 shows no ad copy');
  // Citation register: one entry per saved capture, shared by the three sections.
  assert.equal((full.html.match(/Bản lưu trang quảng cáo trên Meta/gu) ?? []).length >= 2, true);
  assert.ok(full.page.registry);
  // Publication lint adds no failure, and no provider name appears.
  assert.deepEqual(failed(full.lint), failed(base.lint));
  assert.deepEqual(providerNameViolations(full.html), []);
  assert.doesNotMatch(full.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:'), /Kalodata|TradeInt|SerpApi|Apify|PageIndex|Gemini/iu);
  // Nothing of the unconfirmed or L9-excluded pages.
  for (const text of ['Cửa hàng mẫu 1003', 'Cửa hàng mẫu 1004', COPY_EXCLUDED]) assert.equal(full.html.includes(text), false, text);
});

test('Insight: ad text never reaches findings, retained methods, coding, personas or counts', async t => {
  const { build } = await prepared(t);
  const base = build();
  const full = build(confirmedPages());
  // The retained input (what an exact retry checks) and the findings are identical.
  assert.deepEqual(full.input, base.input);
  assert.deepEqual(full.page.findings, base.page.findings);
  assert.deepEqual(full.input.retainedMethods.map(item => item.kind), base.input.retainedMethods.map(item => item.kind));
  assert.equal(JSON.stringify(full.page.findings).includes('Cửa hàng mẫu'), false);
  for (const text of [COPY_ONE, COPY_TWO]) assert.equal(JSON.stringify(full.page.findings).includes(text), false);
  // Every other section is unchanged; the three seller-voice sections only grow at the end.
  const touched = new Set<string>(INSIGHT_META_AD_SECTIONS);
  assert.deepEqual(full.page.sections.filter(item => !touched.has(item.id)), base.page.sections.filter(item => !touched.has(item.id)));
  for (const id of INSIGHT_META_AD_SECTIONS) {
    const before = base.page.sections.find(item => item.id === id), after = full.page.sections.find(item => item.id === id)!;
    assert.equal(after.body.startsWith(before?.body ?? ''), true, `${id}: the existing body is kept as it was`);
    assert.equal(after.explanation, before?.explanation ?? after.explanation, `${id}: the existing explanation wins`);
  }
  // Outside the seller-voice blocks every section, with all its counts and quotes, reads exactly as it does without ads (citation numbers aside).
  // A section that had no content at all (it showed the "no evidence" placeholder) now shows the seller-voice block instead.
  const sectionText = (html: string, id: string): string => (new JSDOM(html).window.document.getElementById(id)?.textContent ?? '').replace(/\s+/gu, ' ').replace(/\[\d+\]/gu, '[n]');
  const stripped = withoutMetaBlocks(full.html);
  for (const id of INSIGHT_SECTION_IDS) {
    if (touched.has(id) && !base.page.sections.some(item => item.id === id)) continue;
    assert.equal(sectionText(stripped, id), sectionText(base.html, id), id);
  }
  assert.deepEqual(INSIGHT_SECTION_IDS.filter(id => touched.has(id) && !base.page.sections.some(item => item.id === id)), ['I12'], 'only an empty section is filled by the block');
  // The words of the ads appear only inside the seller-voice blocks.
  const rest = withoutMetaBlocks(full.html);
  for (const text of ['Cửa hàng mẫu 1001', 'Cửa hàng mẫu 1002', COPY_ONE, COPY_TWO]) assert.equal(rest.includes(text), false, text);
  // Each seller-voice block states, in words, that it is outside the customer-voice methods.
  assert.ok(sectionOf(full.html, 'I02').includes('không dùng để mã hóa, đếm tần suất hay dựng chân dung'));
});

test('Insight: copied text a report rule would reject is withheld and the page still lints', async t => {
  const { build } = await prepared(t);
  const base = build();
  const pages = selectMetaAdPages([view('7001', SHA('e'), [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: 'Xem thêm trên Google Shopping, thị phần là 40%', pageName: 'Theo Kalodata' }], 'all')]);
  const full = build(pages);
  const text = new JSDOM(full.html).window.document.body.textContent!;
  assert.ok(text.includes(META_AD_NAME_WITHHELD) && text.includes(META_AD_TEXT_WITHHELD));
  assert.equal(full.html.includes('Kalodata'), false);
  assert.deepEqual(failed(full.lint), failed(base.lint));
  assert.deepEqual(providerNameViolations(full.html), []);
});
