import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { assertMarket14MachineRules, auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { META_AD_EXCERPT_MAX, META_AD_NAME_WITHHELD, META_AD_NOTE, META_AD_SOURCE_LABEL, META_AD_TEXT_WITHHELD, META_AD_TITLE, metaAdExcerpt, metaTextReportSafe, selectMetaAdPages, type MetaAdPage } from '../../src/modules/analysis/research-automation/meta-ad-report.js';
import type { MetaPageSourceView } from '../../src/modules/analysis/research-automation/meta-page-intake.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

// Synthetic captures only: no real page, no real ad.
const SHA = (char: string): string => char.repeat(64);
interface AdSpec { readonly libraryId: string; readonly startDate: string; readonly age: number; readonly text: string; readonly pageName?: string }
function view(pageId: string, sha: string, capturedAt: string, ads: readonly AdSpec[], included: readonly string[] | 'all', state: 'CONFIRMED' | 'PREPARED' = 'CONFIRMED'): MetaPageSourceView {
  return { state, projection: { captureSha256: sha, capturedAt, pageId, includedLibraryIds: included === 'all' ? ads.map(ad => ad.libraryId) : [...included],
    observations: ads.map(ad => ({ libraryId: ad.libraryId, pageId, pageName: ad.pageName ?? `Cửa hàng mẫu ${pageId}`, startDate: ad.startDate, ageDaysToCapture: ad.age, textFirst200: ad.text })) } } as unknown as MetaPageSourceView;
}
const COPY_ONE = 'Bình giữ nhiệt inox giữ nóng 12 giờ, giao nhanh trong ngày.';
const COPY_TWO = 'Ly giữ nhiệt mẫu mới, nhiều màu để chọn.';
const COPY_THREE = 'Chai giữ lạnh cho chuyến đi dài.';
const TAKEN = '2026-09-01T03:00:00.000Z';

/** Two confirmed pages, one unconfirmed page and one confirmed page whose only ad is L9-excluded. */
function mixedViews(): MetaPageSourceView[] {
  return [
    view('1001', SHA('a'), TAKEN, [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: COPY_ONE }, { libraryId: 'L2', startDate: '2026-04-10', age: 144, text: COPY_TWO }], 'all'),
    view('1002', SHA('b'), TAKEN, [{ libraryId: 'L3', startDate: '2026-05-01', age: 123, text: COPY_TWO }, { libraryId: 'L4', startDate: '2026-01-01', age: 243, text: COPY_THREE }], ['L3']),
    view('1003', SHA('c'), TAKEN, [{ libraryId: 'L5', startDate: '2026-02-01', age: 212, text: COPY_THREE }], 'all', 'PREPARED'),
    view('1004', SHA('d'), TAKEN, [{ libraryId: 'L6', startDate: '2026-02-10', age: 203, text: COPY_THREE }], []),
  ];
}

test('selection: 2 confirmed pages + 1 unconfirmed + 1 L9-excluded print only the 2 confirmed', () => {
  const pages = selectMetaAdPages(mixedViews());
  assert.deepEqual(pages.map(page => page.pageId), ['1001', '1002']);
  assert.deepEqual(pages.map(page => page.adCount), [2, 1], 'the excluded ad L4 of page 1002 is not counted');
  assert.deepEqual(pages.map(page => [page.earliestStart, page.daysRun]), [['2026-03-01', 184], ['2026-05-01', 123]], 'the earlier but excluded ad does not set the date');
  assert.deepEqual(pages.map(page => page.excerpt), [COPY_ONE, COPY_TWO]);
  assert.deepEqual(pages.map(page => page.captures.map(capture => capture.sha256)), [[SHA('a')], [SHA('b')]]);
  assert.deepEqual(pages.map(page => page.pageName), ['Cửa hàng mẫu 1001', 'Cửa hàng mẫu 1002']);
});

test('selection: nothing confirmed gives nothing', () => {
  assert.deepEqual(selectMetaAdPages([]), []);
  assert.deepEqual(selectMetaAdPages(mixedViews().filter(item => item.state !== 'CONFIRMED')), []);
  assert.deepEqual(selectMetaAdPages([mixedViews()[3]!]), [], 'a confirmed page with no L9-included ad is not printed');
});

test('selection: an ad seen in two confirmed captures counts once and is read from the newest; order is not a ranking', () => {
  const older = view('2001', SHA('1'), '2026-08-01T00:00:00.000Z', [{ libraryId: 'L1', startDate: '2026-03-01', age: 153, text: COPY_ONE }, { libraryId: 'L2', startDate: '2026-03-01', age: 153, text: COPY_TWO }], 'all');
  const newer = view('2001', SHA('2'), TAKEN, [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: COPY_ONE }], 'all');
  const [page] = selectMetaAdPages([newer, older]);
  assert.equal(page!.adCount, 2);
  assert.equal(page!.daysRun, 184, 'the repeated ad is read from the newest capture');
  assert.deepEqual(page!.captures.map(capture => capture.sha256), [SHA('1'), SHA('2')], 'every capture a counted ad comes from, oldest first');
  assert.deepEqual(selectMetaAdPages([older, newer]), selectMetaAdPages([newer, older]), 'input order does not matter');
  const byStart = selectMetaAdPages([
    view('3002', SHA('4'), TAKEN, [{ libraryId: 'L9', startDate: '2026-06-01', age: 92, text: COPY_TWO }], 'all'),
    view('3001', SHA('3'), TAKEN, [{ libraryId: 'L8', startDate: '2026-02-01', age: 212, text: COPY_ONE }], 'all')]);
  assert.deepEqual(byStart.map(item => item.pageId), ['3001', '3002'], 'earliest start first, never by count');
});

test('excerpt: byte-exact prefix, cut at 160 characters on a character boundary', () => {
  const short = metaAdExcerpt(COPY_ONE);
  assert.deepEqual(short, { text: COPY_ONE, cut: false });
  const exact = 'a'.repeat(META_AD_EXCERPT_MAX);
  assert.deepEqual(metaAdExcerpt(exact), { text: exact, cut: false }, 'exactly 160 is not cut');
  const long = metaAdExcerpt('a'.repeat(200));
  assert.equal(long.text, 'a'.repeat(160));
  assert.equal(long.cut, true);
  // A letter made of marks and an emoji are never split.
  const text = 'ế'.normalize('NFD');
  assert.ok(Array.from(text).length > 1);
  const marks = metaAdExcerpt('a'.repeat(159) + text + 'x');
  assert.equal(marks.text, 'a'.repeat(159), 'the letter with its marks would pass 160, so it is left out whole');
  assert.equal(marks.cut, true);
  const emoji = '\u{1F600}';
  const pairs = metaAdExcerpt('a'.repeat(159) + emoji + emoji);
  assert.equal(pairs.text, 'a'.repeat(159) + emoji, 'the 160th character is a whole surrogate pair');
  assert.equal(pairs.cut, true);
  assert.equal(pairs.text.length, 161);
  assert.doesNotMatch(pairs.text, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u, 'no lone surrogate');
  const accents = 'Giữ nóng 12 giờ – tiết kiệm điện. '.repeat(8).slice(0, 200);
  const accented = metaAdExcerpt(accents);
  assert.equal(accents.startsWith(accented.text), true, 'a verbatim prefix, nothing reworded');
  assert.equal(Array.from(accented.text).length, 160);
});

test('selection: the excerpt of a long ad is the first 160 characters of its text, verbatim', () => {
  const original = ('Bình giữ nhiệt inox 304, nắp kín, giữ nóng lâu. ' + 'Giao hàng toàn quốc, đổi trả dễ dàng. ').repeat(4).slice(0, 200);
  const [page] = selectMetaAdPages([view('4001', SHA('5'), TAKEN, [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: original }], 'all')]);
  assert.equal(page!.excerpt, Array.from(original).slice(0, 160).join(''));
  assert.equal(original.startsWith(page!.excerpt!), true);
  assert.equal(page!.excerptCut, true);
});

test('copied text that a report rule would reject is withheld, never reworded', () => {
  for (const text of ['Xem thêm trên Google Shopping', 'Theo Kalodata, bán chạy', 'Metric cho thấy', 'Ghi chú: giảm giá', 'Chú thích: ưu đãi', 'Mục M07 của báo cáo', 'Theo Page Index', 'Tìm site:shopee.vn', ''])
    assert.equal(metaTextReportSafe(text), false, text);
  for (const text of [COPY_ONE, COPY_TWO, 'Cửa hàng Bình Nhiệt Việt', 'Giảm giá cuối tuần cho khách mới.'])
    assert.equal(metaTextReportSafe(text), true, text);
  const [page] = selectMetaAdPages([view('5001', SHA('6'), TAKEN, [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: 'Xem thêm trên Google Shopping', pageName: 'Theo Kalodata' }], 'all')]);
  assert.equal(page!.pageName, null);
  assert.equal(page!.excerpt, null);
  assert.equal(page!.adCount, 1, 'the ad still counts');
});

async function reader(metaAds?: readonly MetaAdPage[]) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(metaAds ? { metaAds } : {}) });
}
const visible = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');
const failedRules = (html: string): string[] => auditMarketReportHtml(html, { presentation: false }).filter(item => !item.ok).map(item => `${item.rule}: ${item.detail}`);
const machineFailures = (html: string): string[] => auditMarket14(html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
const S15_MARKERS = [META_AD_TITLE, META_AD_NOTE, 'Ngày bắt đầu đầu tiên', META_AD_NAME_WITHHELD, META_AD_TEXT_WITHHELD, 'Bản lưu trang quảng cáo trên Meta'];

test('Market M07: no confirmed captures prints nothing of S15, and the bytes equal a build that never heard of it', async () => {
  const plain = (await reader()).html;
  for (const marker of S15_MARKERS) assert.equal(plain.includes(marker), false, marker);
  assert.equal(plain.includes(META_AD_SOURCE_LABEL), false, 'no source-list line either');
  assert.equal((await reader([])).html, plain);
  assert.equal((await reader(selectMetaAdPages(mixedViews().filter(item => item.state !== 'CONFIRMED' || item.projection.includedLibraryIds.length === 0)))).html, plain);
  assert.doesNotMatch(plain, /Meta\b/u);
});

test('Market M07: the two confirmed pages are printed in one table with the fixed note, citation marks and a source-list line', async () => {
  const pages = selectMetaAdPages(mixedViews());
  const built = await reader(pages);
  const doc = new JSDOM(built.html).window.document;
  const section = doc.querySelector('#phan-7')!;
  assert.ok(section.textContent!.includes(META_AD_TITLE), 'the table sits in M07');
  assert.equal((built.html.match(new RegExp(META_AD_TITLE, 'gu')) ?? []).length, 1);
  const table = [...section.querySelectorAll('table')].find(item => item.textContent!.includes('Số quảng cáo đã xác nhận'))!;
  assert.ok(table, 'the Meta table is found');
  assert.deepEqual([...table.querySelectorAll('thead th')].map(cell => cell.textContent!.trim()),
    ['Trang', 'Số quảng cáo đã xác nhận', 'Ngày bắt đầu đầu tiên', 'Số ngày đã chạy (tính tới ngày thu)', 'Trích nội dung']);
  const rows = [...table.querySelectorAll('tbody tr')].map(row => [...row.querySelectorAll('td')].map(cell => cell.textContent!.replace(/\s+/gu, ' ').trim()));
  assert.equal(rows.length, 2, 'the unconfirmed page and the L9-excluded page are not printed');
  assert.deepEqual(rows.map(row => row.slice(0, 4)), [['Cửa hàng mẫu 1001', '2', '01/03/2026', '184'], ['Cửa hàng mẫu 1002', '1', '01/05/2026', '123']]);
  assert.match(rows[0]![4]!, new RegExp(`^${COPY_ONE.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')}\\s*\\[\\d+\\]$`, 'u'));
  assert.match(rows[1]![4]!, /\[\d+\]$/u);
  assert.equal(table.querySelectorAll('td:last-child sup.cite').length, 2, 'one citation mark per saved capture');
  assert.equal(table.querySelectorAll('span[data-quote]').length, 4, 'page name and excerpt are quoted text');
  assert.ok(visible(built.html).includes(META_AD_NOTE), 'the fixed note');
  assert.equal(doc.querySelectorAll('#phan-7 .ex').length >= 2, true);
  // Page 1003 (unconfirmed) and 1004 (L9-excluded) leave no trace.
  for (const text of ['Cửa hàng mẫu 1003', 'Cửa hàng mẫu 1004', COPY_THREE]) assert.equal(built.html.includes(text), false, text);
  // The source list names the source once, as the seller's own words.
  assert.equal(built.html.includes(META_AD_SOURCE_LABEL + '</td>') || built.html.includes(META_AD_SOURCE_LABEL), true);
  assert.ok(visible(built.html).includes('lời người bán (quảng cáo), không phải ý kiến khách hàng'));
  // No other section carries Meta text.
  const elsewhere = [...doc.querySelectorAll('section')].filter(item => item.id !== 'phan-7' && item.textContent!.includes('Cửa hàng mẫu 1001'));
  assert.deepEqual(elsewhere.map(item => item.id), [], 'the page name is not repeated in another section');
});

test('Market M07: every gate and 14-rule check still passes, and no new failure appears', async () => {
  const plain = await reader();
  const built = await reader(selectMetaAdPages(mixedViews()));
  assert.deepEqual(failedRules(built.html), failedRules(plain.html));
  assert.deepEqual(failedRules(built.html), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
  assert.deepEqual(machineFailures(built.html).filter(rule => !machineFailures(plain.html).includes(rule)), [], 'no new machine-rule failure');
  const noData = built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:');
  assert.doesNotMatch(noData, /PageIndex|Google|Kalodata|Metric\b|SerpApi|Apify|Dami|TradeInt|Gemini/iu);
  assert.doesNotMatch(noData, /[A-Za-z]:\\|\/home\/|\/Users\//u);
  assert.doesNotMatch(visible(built.html), /\d+\s*%\s*(?:hoàn|xong|tiến)|đang xử lý \d+/iu);
});

test('Market M07: Meta numbers are never added to the Shopee and TikTok sample numbers', async () => {
  const plain = await reader();
  const built = await reader(selectMetaAdPages(mixedViews()));
  // Outside the Meta table and its source line, the report text is exactly the plain report.
  const strip = (html: string): string => {
    const doc = new JSDOM(html).window.document;
    for (const table of [...doc.querySelectorAll('.ex')]) if (table.textContent!.includes('Số quảng cáo đã xác nhận')) table.remove();
    for (const row of [...doc.querySelectorAll('tr')]) if (row.textContent!.includes(META_AD_SOURCE_LABEL)) row.remove();
    // The two saved captures also join the citation register at the end; that is the only other trace.
    return doc.body.textContent!.replace(/\s+/gu, ' ').replace(/\[\d+\]/gu, '[n]').replace(/Bản lưu trang quảng cáo trên Meta · ngày \d{2}\/\d{2}\/\d{4}\[n\] · /gu, '');
  };
  assert.equal(strip(built.html), strip(plain.html));
  const table = built.html.match(/<div class="ex">(?:(?!<div class="ex">)[\s\S])*?Số quảng cáo đã xác nhận[\s\S]*?<\/div>/u)?.[0] ?? '';
  assert.doesNotMatch(table, /Shopee|TikTok|tổng cộng|tổng số/iu);
});

test('Market M07: copied text a gate would reject is withheld and the report still builds and passes', async () => {
  const unsafe = selectMetaAdPages([view('6001', SHA('7'), TAKEN, [{ libraryId: 'L1', startDate: '2026-03-01', age: 184, text: 'Xem thêm trên Google Shopping, Ghi chú: M07', pageName: 'Theo Kalodata' }], 'all')]);
  const built = await reader(unsafe);
  const text = visible(built.html);
  assert.ok(text.includes(META_AD_NAME_WITHHELD) && text.includes(META_AD_TEXT_WITHHELD));
  assert.equal(built.html.includes('Kalodata'), false);
  assert.doesNotMatch(built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:'), /Google/u);
  assert.deepEqual(failedRules(built.html), []);
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
});
