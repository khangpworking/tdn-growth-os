import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { readSellerVideoInputs, selectSellerVideos, sellerVideoBlockHtml, sellerVideoNote, sellerVideoPackages, sellerVideoSrc, SELLER_VIDEO_AUTO_NOTE,
  SELLER_VIDEO_AUTO_PROVENANCE, SELLER_VIDEO_AUTO_SRC, SELLER_VIDEO_AUTO_TITLE, SELLER_VIDEO_AUTO_TITLE_V1, SELLER_VIDEO_NOTE, SELLER_VIDEO_PROVENANCE, SELLER_VIDEO_READING_TITLE, SELLER_VIDEO_SRC,
  type AutomatedReadingInput, type SellerVideoAutomatedRef, type SellerVideoRef } from '../../src/modules/analysis/research-automation/seller-video.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const ref = (n: number): SellerVideoRef => ({ packageId: `pkg-${n}`, manifestArtifactSha256: String(n % 10).repeat(64), packageContentSha256: 'f'.repeat(64) });
const autoRef = (n: number): SellerVideoAutomatedRef => ({ ...ref(n), readingSha256: String.fromCharCode(97 + n).repeat(64) });
const seg = (text: string, startSeconds = 1, endSeconds = 3) => ({ text, startSeconds, endSeconds });
const operator = (n: number, text: string) => ({ ref: ref(n), reading: { readingSha256: String.fromCharCode(97 + n).repeat(64), voiceLabel: 'lời người bán', segments: [seg(text)] } });
const automated = (n: number, segments: ReturnType<typeof seg>[], voiceLabel = 'lời người bán'): AutomatedReadingInput =>
  ({ ref: autoRef(n), reading: { readingSha256: autoRef(n).readingSha256, voiceLabel, segments } });

test('automated readings: same caps, after operator readings; not about the product is stored but never drawn', () => {
  const picked = selectSellerVideos({ tables: [], readings: [operator(1, 'Câu người vận hành')], automated: [
    automated(2, [seg('Bình này giữ nóng lâu'), seg('Nắp kín'), seg('Dễ rửa'), seg('Câu thứ tư')]),
    { ref: autoRef(3), reading: 'NOT_ABOUT_PRODUCT' }, { ref: autoRef(4), reading: 'NOT_VERIFIED' },
    automated(5, [seg('Theo Google thì tốt')]), automated(6, [seg('Câu sáu')], 'Google'),
    automated(7, [seg('Câu bảy')]), automated(8, [seg('Câu tám')]), automated(9, [seg('Câu chín')]), automated(10, [seg('Câu mười')]), automated(11, [seg('Câu mười một')])] })!;
  assert.deepEqual(picked.readings.map(r => [r.package.packageId, r.automated ?? false, r.excerpts.map(e => e.text)]), [['pkg-1', false, ['Câu người vận hành']],
    ['pkg-2', true, ['Bình này giữ nóng lâu', 'Nắp kín', 'Dễ rửa']], ['pkg-7', true, ['Câu bảy']], ['pkg-8', true, ['Câu tám']], ['pkg-9', true, ['Câu chín']]]);
  assert.deepEqual(picked.leftOut.map(item => [item.packageId, item.reason]), [['pkg-2', 'OVER_3_SEGMENTS'], ['pkg-3', 'NOT_ABOUT_PRODUCT'], ['pkg-4', 'NOT_VERIFIED'],
    ['pkg-5', 'NOT_READER_SAFE'], ['pkg-5', 'NO_SHOWN_SEGMENT'], ['pkg-6', 'NOT_READER_SAFE'], ['pkg-10', 'OVER_5_VIDEOS'], ['pkg-11', 'OVER_5_VIDEOS']]);
  assert.equal(picked.sources.automated!.length, 10, 'every considered automated package is pinned');
  assert.deepEqual(Object.keys(picked.readings[1]!.package), ['packageId', 'manifestArtifactSha256', 'packageContentSha256']);
  assert.deepEqual(sellerVideoPackages(picked).readings.length, 5, 'S14 binds every shown reading, automated included');
  assert.equal(selectSellerVideos({ tables: [], readings: [], automated: [{ ref: autoRef(3), reading: 'NOT_ABOUT_PRODUCT' }] }), null, 'nothing drawn from an off-product video');
});

test('no automated input: the selection has no automated field (byte-identical to the operator-only build)', () => {
  const operatorOnly = selectSellerVideos({ tables: [], readings: [operator(1, 'Câu một')] });
  assert.deepEqual(selectSellerVideos({ tables: [], readings: [operator(1, 'Câu một')], automated: [] }), operatorOnly);
  assert.equal(JSON.stringify(operatorOnly).includes('automated'), false);
  assert.equal(sellerVideoNote(operatorOnly!), SELLER_VIDEO_NOTE);
  assert.equal(sellerVideoSrc(operatorOnly!), SELLER_VIDEO_SRC);
});

test('block: automated speech has its own title and provenance; operator wording unchanged; no creator, link, model or on-screen text', () => {
  const both = selectSellerVideos({ tables: [], readings: [operator(1, 'Câu người vận hành')], automated: [automated(2, [seg('Bình giữ nóng rất lâu', 1, 3.5)], 'lời người làm video review')] })!;
  const html = sellerVideoBlockHtml(both, value => value);
  const doc = new JSDOM(html).window.document;
  assert.deepEqual([...doc.querySelectorAll('h3')].map(h => h.textContent), [SELLER_VIDEO_READING_TITLE, SELLER_VIDEO_AUTO_TITLE]);
  const footers = [...doc.querySelectorAll('blockquote[data-quote] footer')].map(f => f.textContent);
  assert.deepEqual(footers, [`Lời người bán; giây 1–3; ${SELLER_VIDEO_PROVENANCE}.`, `Lời người làm video review; giây 1–3,5; ${SELLER_VIDEO_AUTO_PROVENANCE}.`]);
  assert.equal(SELLER_VIDEO_AUTO_TITLE, 'Lời nói trong video bán hàng và video đánh giá sản phẩm', 'the automated block holds seller and reviewer videos');
  assert.match(SELLER_VIDEO_AUTO_NOTE, /video bán hàng và video đánh giá sản phẩm/u);
  assert.doesNotMatch(SELLER_VIDEO_AUTO_NOTE, /tự nói để bán hàng/u, 'a creator review is not called selling');
  assert.doesNotMatch(SELLER_VIDEO_AUTO_NOTE, /video review/iu, 'automated owner-facing wording is Vietnamese');
  assert.equal(SELLER_VIDEO_AUTO_PROVENANCE, 'ghi lại tự động từ video, chưa xác minh');
  assert.doesNotMatch(html, /https?:|tiktok\.com|@nguoiban|Google|Gemini|model|yt-dlp|sha|GIẢM/iu);
  assert.equal(sellerVideoNote(both), `${SELLER_VIDEO_NOTE} ${SELLER_VIDEO_AUTO_NOTE}`);
  assert.equal(sellerVideoSrc(both), `${SELLER_VIDEO_SRC} ${SELLER_VIDEO_AUTO_SRC}`);
  const autoOnly = selectSellerVideos({ tables: [], readings: [], automated: [automated(2, [seg('Bình giữ nóng rất lâu')])] })!;
  assert.equal(sellerVideoNote(autoOnly), SELLER_VIDEO_AUTO_NOTE);
  assert.equal(sellerVideoSrc(autoOnly), SELLER_VIDEO_AUTO_SRC);
  assert.equal(sellerVideoBlockHtml(autoOnly, v => v).includes(SELLER_VIDEO_READING_TITLE), false);
  for (const text of [SELLER_VIDEO_AUTO_NOTE, SELLER_VIDEO_AUTO_SRC, SELLER_VIDEO_AUTO_TITLE, SELLER_VIDEO_AUTO_PROVENANCE])
    assert.doesNotMatch(text, /Google|Gemini|Kalodata|Metric|Apify|SerpApi|PageIndex|TradeInt|Dami|model|yt-dlp/iu, text);
});

test('reading inputs: the hook gives stored readings on a first build, exactly the pinned ones on a pinned build, and none for a pin without them', async () => {
  const reader = { findAutomationAttachmentPackagesByKeyPrefix: async () => [], readFinalizedSourcePackage: async () => { throw new Error('none'); } } as never;
  const asked: (readonly SellerVideoAutomatedRef[] | undefined)[] = [];
  const hook = async (pinned?: readonly SellerVideoAutomatedRef[]) => { asked.push(pinned); return [automated(2, [seg('Câu')])]; };
  const deps = { reader, workspaceId: 'w', runId: 'r', reading: async () => { throw new Error('no'); }, automated: hook };
  assert.deepEqual(await readSellerVideoInputs(deps), { tables: [], readings: [], automated: [automated(2, [seg('Câu')])] });
  assert.deepEqual((await readSellerVideoInputs(deps, { tables: [], readings: [], automated: [autoRef(2)] })).automated, [automated(2, [seg('Câu')])]);
  assert.deepEqual(await readSellerVideoInputs(deps, { tables: [], readings: [] }), { tables: [], readings: [] }, 'a pinned draft never gains automated readings');
  assert.deepEqual(asked, [undefined, [autoRef(2)]]);
  const { automated: _hook, ...withoutHook } = deps;
  assert.deepEqual(await readSellerVideoInputs(withoutHook), { tables: [], readings: [] });
});

async function report(sellerVideos?: ReturnType<typeof selectSellerVideos>) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(sellerVideos ? { sellerVideos } : {}) });
}

test('reader report: the automated block sits once in M09 with its note and passes every gate', async () => {
  const videos = selectSellerVideos({ tables: [], readings: [], automated: [automated(2, [seg('Bình giữ nóng rất lâu')]), automated(3, [seg('Nắp vặn rất chắc')], 'lời người làm video review')] })!;
  const built = await report(videos);
  const doc = new JSDOM(built.html).window.document;
  assert.equal([...doc.querySelectorAll('h3')].filter(h => h.textContent === SELLER_VIDEO_AUTO_TITLE).length, 1, 'one automated block');
  assert.ok(doc.querySelector('#phan-9')!.textContent!.includes(SELLER_VIDEO_AUTO_TITLE));
  assert.equal(doc.querySelectorAll('#phan-9 .seller-video-speech blockquote[data-quote]').length, 2);
  assert.ok(doc.body.textContent!.includes(SELLER_VIDEO_AUTO_NOTE));
  assert.equal(built.html.includes(SELLER_VIDEO_NOTE), false, 'the operator note is not shown without an upload');
  const audit = auditMarketReportHtml(built.html, { presentation: false });
  assert.deepEqual(audit.filter(item => !item.ok).map(item => `${item.rule}: ${item.detail}`), []);
  assert.ok(audit.some(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL' && item.ok));
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  const noData = built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:');
  assert.doesNotMatch(noData, /PageIndex|Google|Gemini|Kalodata|Metric\b|SerpApi|Apify|TradeInt|Dami\b|yt-dlp/iu);
});

const withAutoBlock = (statement: string, title = SELLER_VIDEO_AUTO_TITLE): string => `<html><body><section id="M09"><h3>${title}</h3><ul><li><blockquote data-quote><p>Câu gốc.</p></blockquote></li></ul><p>${statement}</p></section></body></html>`;
const verdict = (statement: string, title?: string): boolean | undefined => auditMarketReportHtml(withAutoBlock(statement, title), { presentation: false }).find(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL')?.ok;

test('gate: SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL applies to the automated block wording', () => {
  for (const text of ['Nội dung video là ý kiến của khách hàng.', 'Lời trong video đã được kiểm chứng.', 'Tổng doanh thu các video là 5 triệu.', 'Doanh thu video cộng với doanh thu của mẫu.'])
    assert.equal(verdict(text), false, text);
  for (const text of [SELLER_VIDEO_AUTO_NOTE, `${SELLER_VIDEO_NOTE} ${SELLER_VIDEO_AUTO_NOTE}`, 'Video chưa được kiểm chứng.'])
    assert.equal(verdict(text), true, text);
  // A draft built before VW2 carries the old automated title: the gate still finds that block and applies the rule.
  assert.equal(SELLER_VIDEO_AUTO_TITLE_V1, 'Lời nói trong video bán hàng');
  assert.equal(verdict('Nội dung video là ý kiến của khách hàng.', SELLER_VIDEO_AUTO_TITLE_V1), false, 'old title still gated');
  assert.equal(verdict('Video chưa được kiểm chứng.', SELLER_VIDEO_AUTO_TITLE_V1), true);
});
