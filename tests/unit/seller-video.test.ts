import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { readSellerVideoInputs, selectSellerVideos, sellerVideoBlockHtml, sellerVideoPackages, sellerVideoSegmentSafe, storedSellerVideos, SELLER_VIDEO_NOTE,
  SELLER_VIDEO_READING_TITLE, SELLER_VIDEO_TABLE_TITLE, type SellerVideoInputs, type SellerVideoRef, type SellerVideos } from '../../src/modules/analysis/research-automation/seller-video.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const ref = (n: number): SellerVideoRef => ({ packageId: `pkg-${n}`, manifestArtifactSha256: String(n % 10).repeat(64), packageContentSha256: 'f'.repeat(64) });
const row = (revenue: string | null, views: string | null = null, units: string | null = null, publishDate: string | null = null) => ({ revenue, views, units, publishDate });
const seg = (text: string, startSeconds = 1, endSeconds = 3) => ({ text, startSeconds, endSeconds });
const reading = (n: number, segments: { text: string; startSeconds: number; endSeconds: number }[], voiceLabel = 'lời người bán') =>
  ({ ref: ref(n), reading: { readingSha256: String.fromCharCode(97 + n).repeat(64), voiceLabel, segments } });
const word = (i: number): string => ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'][i % 10]!;
const sample = (): SellerVideos => selectSellerVideos({
  tables: [{ ref: ref(1), rows: [row('1200000', '35000', '80', '2026-09-03'), row(null, '900', null, null)] }],
  readings: [reading(2, [seg('Bình giữ nhiệt này giữ nóng rất lâu', 1, 3.5)]), reading(3, [seg('Mình dùng thử cả tuần rồi', 4, 6)], 'lời người làm video review')] })!;

test('selection: first verified table only, at most 10 rows in stored order, values as stored', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row(String(i + 1)));
  const picked = selectSellerVideos({ tables: [{ ref: ref(1), rows: 'NOT_VERIFIED' }, { ref: ref(2), rows: 'NOT_VIDEO_TABLE' }, { ref: ref(3), rows }, { ref: ref(4), rows: [row('9')] }], readings: [] })!;
  assert.equal(picked.table!.package.packageId, 'pkg-3');
  assert.deepEqual(picked.table!.rows.map(item => item.revenue), ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  assert.deepEqual(picked.leftOut.map(item => [item.packageId, item.reason, item.count]), [['pkg-1', 'NOT_VERIFIED', 1], ['pkg-2', 'NOT_VIDEO_TABLE', 1], ['pkg-3', 'OVER_10_ROWS', 2], ['pkg-4', 'NOT_FIRST_TABLE', 1]]);
  assert.deepEqual(picked.sources.tables, [ref(1), ref(2), ref(3), ref(4)], 'every considered package is pinned');
  assert.equal(selectSellerVideos({ tables: [], readings: [] }), null, 'nothing stored, nothing drawn');
  assert.equal(selectSellerVideos({ tables: [{ ref: ref(1), rows: [] }], readings: [] }), null, 'an empty table draws nothing');
});

test('selection: at most 5 videos and 3 segments each, verbatim, every other item left out with a reason, never cut', () => {
  const long = Array.from({ length: 31 }, (_, i) => word(i)).join(' '), exactly30 = Array.from({ length: 30 }, (_, i) => word(i)).join(' ');
  const inputs: SellerVideoInputs = { tables: [], readings: [
    reading(1, [seg('Câu một'), seg('Câu hai'), seg('Câu ba'), seg('Câu bốn')]),
    reading(2, [seg(long), seg(exactly30), seg('   '), seg('Mua ở Shopee nhé'), seg('Xem https://example.test/a')]),
    { ref: ref(3), reading: 'NOT_VERIFIED' }, reading(1, [seg('Lặp lại')]), reading(4, [seg(' ')]),
    reading(5, [seg('Câu năm')]), reading(6, [seg('Câu sáu')]), reading(7, [seg('Câu bảy')]), reading(8, [seg('Câu tám')])] };
  const picked = selectSellerVideos(inputs)!;
  assert.deepEqual(picked.readings.map(item => item.excerpts.map(excerpt => excerpt.text)), [['Câu một', 'Câu hai', 'Câu ba'], [exactly30], ['Câu năm'], ['Câu sáu'], ['Câu bảy']]);
  assert.deepEqual(picked.leftOut.map(item => [item.packageId, item.reason, item.count]), [['pkg-1', 'OVER_3_SEGMENTS', 1], ['pkg-2', 'OVER_30_WORDS', 1], ['pkg-2', 'EMPTY_SEGMENT', 1],
    ['pkg-2', 'NOT_READER_SAFE', 2], ['pkg-3', 'NOT_VERIFIED', 1], ['pkg-1', 'SAME_READING', 1], ['pkg-4', 'EMPTY_SEGMENT', 1], ['pkg-4', 'NO_SHOWN_SEGMENT', 1], ['pkg-8', 'OVER_5_VIDEOS', 1]]);
  assert.equal(picked.table, null);
  const tooMany = selectSellerVideos({ tables: 'TOO_MANY', readings: 'TOO_MANY' });
  assert.equal(tooMany, null);
});

test('segments: provider names, platform names, links, paths, secrets and report-own markers are not reader safe', () => {
  for (const bad of ['Theo Kalodata thì bán chạy', 'Mua trên TikTok Shop', 'Shopee giảm giá', 'Xem tại example.dev', 'Lưu ở /tmp/a', 'Mã ghp_abcdefghijklmnop1234', 'Chú thích: hàng mới',
    'Doanh thu trong mẫu 5', 'Phần M09 nói rõ', 'n = 30 người', 'Liên hệ nhom@example.test', 'Theo Google'])
    assert.equal(sellerVideoSegmentSafe(bad), false, bad);
  for (const good of ['Bình giữ nhiệt này giữ nóng rất lâu', 'Giá chỉ 199 nghìn hôm nay', 'Dung tích 500 ml'])
    assert.equal(sellerVideoSegmentSafe(good), true, good);
});

test('block: neutral video numbers, missing values say so, every number labelled an estimate, no creator, link, ad spend or ratio', () => {
  const html = sellerVideoBlockHtml(sample(), value => value);
  const doc = new JSDOM(html).window.document;
  assert.deepEqual([...doc.querySelectorAll('thead th')].map(cell => cell.textContent), ['Video', 'Doanh thu (ước tính)', 'Lượt xem (ước tính)', 'Đơn vị bán (ước tính)', 'Ngày đăng']);
  assert.deepEqual([...doc.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(cell => cell.textContent)),
    [['Video 1', '1200000', '35000', '80', '2026-09-03'], ['Video 2', 'không có dữ liệu', '900', 'không có dữ liệu', 'không có dữ liệu']]);
  assert.doesNotMatch(html, /creator|follower|người theo dõi|https?:|tiktok\.com|ad_spend|quảng cáo|tỷ lệ|tổng|trung bình|xếp hạng|thị phần|%/iu);
  const quotes = [...doc.querySelectorAll('blockquote[data-quote]')];
  assert.equal(quotes.length, 2);
  assert.equal(quotes[0]!.querySelector('footer')!.textContent, 'Lời người bán; giây 1–3,5; do người vận hành ghi lại từ video, chưa xác minh.');
  assert.equal(quotes[1]!.querySelector('footer')!.textContent, 'Lời người làm video review; giây 4–6; do người vận hành ghi lại từ video, chưa xác minh.');
  assert.equal(sellerVideoBlockHtml({ ...sample(), table: null }, value => value).includes(SELLER_VIDEO_TABLE_TITLE), false);
  assert.equal(sellerVideoBlockHtml({ ...sample(), readings: [] }, value => value).includes(SELLER_VIDEO_READING_TITLE), false);
});

test('stored uploads are read only from a draft whose packet carries the marker', () => {
  const videos = sample();
  assert.deepEqual(storedSellerVideos({ sourceEvidence: { sellerVideos: true }, sellerVideos: videos }), videos);
  assert.equal(storedSellerVideos({ sellerVideos: videos }), null);
  assert.equal(storedSellerVideos({ sourceEvidence: {}, sellerVideos: videos }), null);
  assert.equal(storedSellerVideos({ sourceEvidence: { sellerVideos: true }, sellerVideos: { ...videos, contractVersion: 'other' } }), null);
});

test('evidence: S02 and S14 are registered once each, only when drawn and only for Market', () => {
  const base = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const input = (over: object = {}) => ({ collection: null, ...over }) as Parameters<typeof sourceEvidenceForReport>[1];
  const videos = sample();
  const drawn = sourceEvidenceForReport(base, input({ sellerVideos: videos }), 'MARKET');
  assert.equal(drawn.sellerVideos, true);
  assert.deepEqual(drawn.sourceAppendix.rows.map(item => [item.registryId, item.binding.kind, item.binding.ref]).sort(),
    [['S02', 'package', ref(1).manifestArtifactSha256], ['S14', 'package', ref(2).manifestArtifactSha256], ['S14', 'package', ref(3).manifestArtifactSha256]]);
  assert.deepEqual(sourceEvidenceForReport(drawn, input({ sellerVideos: videos }), 'MARKET'), drawn, 'idempotent: no duplicate use');
  assert.equal(drawn.sourceAppendix.rows.some(item => item.registryId === 'S04'), false, 'S04 is not drawn');
  assert.deepEqual(sourceEvidenceForReport(base, input(), 'MARKET'), base);
  assert.deepEqual(sourceEvidenceForReport(base, input({ sellerVideos: null }), 'MARKET'), base);
  assert.deepEqual(sourceEvidenceForReport(base, input({ sellerVideos: videos }), 'INSIGHT'), base, 'Insight draws no video upload');
  assert.deepEqual(sellerVideoPackages(null), { table: [], readings: [] });
});

test('reading: a pinned set re-reads exactly those packages and never lists; 101 listed packages are skipped, not truncated', async () => {
  let listed = 0; const opened: string[] = [];
  const fakeReader = {
    findAutomationAttachmentPackagesByKeyPrefix: async () => { listed += 1; return Array.from({ length: 101 }, (_, i) => ({ packageId: `p${i}`, manifestArtifactSha256: 'a'.repeat(64), version: 1 })); },
    readFinalizedSourcePackage: async (id: string) => { opened.push(id); throw new Error('missing'); },
  } as never;
  const deps = { reader: fakeReader, workspaceId: 'w', runId: 'r', reading: async () => { throw new Error('no reading'); } };
  assert.deepEqual(await readSellerVideoInputs(deps), { tables: 'TOO_MANY', readings: 'TOO_MANY' });
  assert.equal(listed, 2); assert.deepEqual(opened, []);
  const pinned = await readSellerVideoInputs(deps, { tables: [ref(1)], readings: [ref(2)] });
  assert.equal(listed, 2, 'a pinned read never lists the run');
  assert.deepEqual(opened.sort(), ['pkg-1', 'pkg-2']);
  assert.deepEqual(pinned, { tables: [{ ref: ref(1), rows: 'NOT_VERIFIED' }], readings: [{ ref: ref(2), reading: 'NOT_VERIFIED' }] }, 'a package that no longer verifies is left out, never repaired');
  assert.deepEqual(await readSellerVideoInputs(deps, { tables: 'TOO_MANY', readings: [] }), { tables: 'TOO_MANY', readings: [] });
});

async function reader(sellerVideos?: SellerVideos) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(sellerVideos ? { sellerVideos } : {}) });
}
const visible = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');

test('reader report: no uploads gives the same bytes as a build that never heard of them', async () => {
  const plain = (await reader()).html;
  assert.equal(plain.includes(SELLER_VIDEO_TABLE_TITLE) || plain.includes(SELLER_VIDEO_NOTE), false);
  assert.equal((await reader(undefined)).html, plain);
});

test('reader report: both blocks sit once in M09 with one note, pass every gate and leak no provider text', async () => {
  const built = await reader(sample());
  const doc = new JSDOM(built.html).window.document;
  const section = doc.querySelector('#phan-9')!;
  for (const title of [SELLER_VIDEO_TABLE_TITLE, SELLER_VIDEO_READING_TITLE]) {
    assert.equal(built.html.split(title).length - 1, 1, title);
    assert.ok(section.textContent!.includes(title));
  }
  assert.equal(doc.querySelectorAll('#phan-9 table.seller-videos tbody tr').length, 2);
  assert.equal(doc.querySelectorAll('#phan-9 .seller-video-speech blockquote[data-quote]').length, 2);
  assert.equal(visible(built.html).split('không phải ý kiến khách hàng').length - 1, 1, 'one note covers both blocks');
  const failed = auditMarketReportHtml(built.html, { presentation: false }).filter(item => !item.ok).map(item => `${item.rule}: ${item.detail}`);
  assert.deepEqual(failed, []);
  assert.ok(auditMarketReportHtml(built.html, { presentation: false }).some(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL' && item.ok));
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
  const plainRules = auditMarket14((await reader()).html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  assert.deepEqual(auditMarket14(built.html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule).filter(rule => !plainRules.includes(rule)), [], 'no new machine-rule failure');
  const rule13 = auditMarket14(built.html).find(item => item.rule === '13')!;
  assert.equal(rule13.ok, true, rule13.detail);
  const noData = built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:');
  assert.doesNotMatch(noData, /PageIndex|Google|Kalodata|Metric\b|SerpApi|Apify|TradeInt|Dami\b/iu);
  assert.doesNotMatch(visible(built.html), /\d+\s*%\s*(?:hoàn|xong|tiến)|đang xử lý \d+/iu);
});

const withBlock = (statement: string): string => `<html><body><section id="M09"><h3>${SELLER_VIDEO_READING_TITLE}</h3><ul><li><blockquote data-quote><p>Câu gốc.</p></blockquote></li></ul><p>${statement}</p></section></body></html>`;
const verdict = (statement: string): boolean | undefined => auditMarketReportHtml(withBlock(statement), { presentation: false }).find(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL')?.ok;

test('gate: video content as customer voice, verified fact, market size, or totalled or combined with sample numbers is refused', () => {
  for (const text of ['Nội dung video là ý kiến của khách hàng.', 'Video cho thấy khách hàng nói sản phẩm tốt.', 'Lời trong video là đánh giá của người mua.', 'Video là review của khách.',
    'Lời trong video đã được kiểm chứng.', 'Video chứng minh sản phẩm giữ nhiệt tốt.', 'Nội dung video là sự thật.',
    'Số liệu video là quy mô thị trường.', 'Doanh thu video là tổng thị trường.', 'Tổng doanh thu các video là 5 triệu.',
    'Doanh thu video cộng với doanh thu của mẫu.', 'Lượt xem trung bình của video là 900.', 'Doanh thu video so với số liệu mẫu cao hơn.', 'Xếp hạng video theo doanh thu.'])
    assert.equal(verdict(text), false, text);
});

test('gate: negated disclaimers and the template own note do not trip it; no block, no extra rule; copied speech is not a statement', () => {
  for (const text of [SELLER_VIDEO_NOTE, 'Nội dung video không phải ý kiến khách hàng.', 'Video chưa được kiểm chứng.', 'Số liệu video không cộng với doanh thu của mẫu.',
    'Video không phải quy mô thị trường.', 'Câu thường về bình giữ nhiệt.', 'Doanh thu của mẫu được ghi riêng.'])
    assert.equal(verdict(text), true, text);
  assert.equal(auditMarketReportHtml('<html><body><section id="M09"><p>Video là ý kiến khách hàng.</p></section></body></html>', { presentation: false }).some(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL'), false);
  const html = `<html><body><section id="M09"><h3>${SELLER_VIDEO_READING_TITLE}</h3><ul><li><blockquote data-quote><p>Khách hàng nói video này là tổng doanh thu cả thị trường.</p></blockquote></li></ul></section></body></html>`;
  assert.equal(auditMarketReportHtml(html, { presentation: false }).find(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL')?.ok, true);
});
