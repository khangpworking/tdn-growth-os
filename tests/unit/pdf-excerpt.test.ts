import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { PAGEINDEX_ELIGIBLE_SECTIONS, type PageIndexQuotesArtifact, type PageIndexVerifiedQuote } from '../../src/modules/analysis/pageindex-questions.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { PDF_EXCERPT_NOTE, PDF_EXCERPT_TITLE, pdfExcerptBlockHtml, pdfExcerptFileNameShown, selectPdfExcerpts, storedPdfExcerpts, type PdfExcerpt } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const RUN = '22222222-2222-4222-8222-222222222222';
const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
const quote = (sourceSha256: string, page: number, text: string, sectionId = 'M09', extra: Partial<PageIndexVerifiedQuote> = {}): PageIndexVerifiedQuote =>
  ({ sourceSha256, cloudDocId: 'doc-1', sectionId, page, quote: text, quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED', ...extra });
const artifact = (quotes: PageIndexVerifiedQuote[], runId = RUN): PageIndexQuotesArtifact => ({ contractVersion: 'pageindex-verified-quotes-v1', approvalState: 'UNREVIEWED', runId, quotes });
const names = new Map([[SHA_A, 'bao-cao-nganh.pdf'], [SHA_B, 'tai-lieu-hai.pdf']]);
const excerptsOf = (quotes: PageIndexVerifiedQuote[], map = names): PdfExcerpt[] => [...selectPdfExcerpts(artifact(quotes), RUN, map).excerpts];
const twoDocuments = (): PdfExcerpt[] => excerptsOf([
  quote(SHA_A, 2, 'Nhu cầu bình giữ nhiệt tăng đều ở các đô thị lớn.'), quote(SHA_A, 5, 'Giá nguyên liệu inox biến động theo quý.', 'M03'),
  quote(SHA_B, 1, 'Quy định ghi nhãn vật liệu tiếp xúc thực phẩm áp dụng từ năm trước.')]);

test('selection: two documents keep stored order, Market sections only, verbatim text', () => {
  const picked = selectPdfExcerpts(artifact([quote(SHA_A, 2, 'Câu một.'), quote(SHA_B, 1, 'Câu hai.'), quote(SHA_A, 5, 'Câu ba.', 'M05')]), RUN, names);
  assert.deepEqual(picked.excerpts.map(item => [item.sourceSha256 === SHA_A ? 'A' : 'B', item.page, item.text]), [['A', 2, 'Câu một.'], ['B', 1, 'Câu hai.'], ['A', 5, 'Câu ba.']]);
  assert.deepEqual(picked.excerpts.map(item => item.label), ['Tài liệu bao-cao-nganh.pdf, trang 2', 'Tài liệu tai-lieu-hai.pdf, trang 1', 'Tài liệu bao-cao-nganh.pdf, trang 5']);
  assert.deepEqual(picked.leftOut, []);
});

test('selection: each left-out reason is coded, nothing is cut or reworded, at most 3 per document', () => {
  const word = (i: number): string => `từ${String.fromCharCode(97 + (i % 26))}`;
  const long = Array.from({ length: 31 }, (_, i) => word(i)).join(' '), exactly30 = Array.from({ length: 30 }, (_, i) => word(i)).join(' ');
  const picked = selectPdfExcerpts(artifact([
    quote(SHA_A, 1, 'Một.'), quote(SHA_A, 2, 'Hai.'), quote(SHA_A, 3, 'Ba.'), quote(SHA_A, 4, 'Bốn.'),
    quote(SHA_B, 1, long), quote(SHA_B, 2, exactly30), quote(SHA_B, 3, 'Thuộc phần insight.', 'I02'), quote(SHA_B, 4, 'Chưa kiểm.', 'M09', { quoteVerification: 'UNVERIFIED' as never }),
    quote(SHA_B, 5, '   '), quote('c'.repeat(64), 1, 'Tài liệu không thuộc lượt.'), quote(SHA_B, 6, 'Gọi qua PageIndex để lấy câu này.'), quote(SHA_B, 7, 'Xem tại https://example.test/x.')]), RUN, names);
  assert.deepEqual(picked.excerpts.map(item => item.text), ['Một.', 'Hai.', 'Ba.', exactly30]);
  assert.deepEqual(picked.leftOut.map(item => item.reason), ['OVER_3_PER_DOCUMENT', 'OVER_30_WORDS', 'NOT_MARKET_SECTION', 'NOT_ATTESTED', 'EMPTY_QUOTE', 'NOT_FOR_THIS_RUN', 'NOT_READER_SAFE', 'NOT_READER_SAFE']);
  assert.equal(picked.excerpts.every(item => item.text === item.text.trim()), true);
  assert.deepEqual(selectPdfExcerpts(artifact([quote(SHA_A, 1, 'Một.')], '99999999-9999-4999-8999-999999999999'), RUN, names).excerpts, [], 'an artifact of another run gives nothing');
  assert.deepEqual(selectPdfExcerpts(null, RUN, names), { excerpts: [], leftOut: [] });
  assert.deepEqual(selectPdfExcerpts({ ...artifact([quote(SHA_A, 1, 'Một.')]), contractVersion: 'other' } as never, RUN, names).excerpts, []);
});

test('selection: a quote that shows a path, link, address or secret is left out whole, never cut', () => {
  const unsafe = ['Bản gốc lưu ở /tmp/market/report.pdf trên máy.', 'Xem thư mục ~/bao-cao để biết thêm.', 'Xem ../phu-luc/bang-2.pdf.', 'Mở thư mục /tmp khi cần.',
    'Chi tiết tại bao-cao/bang-1.html.', 'Trang solieu.example.vn có số liệu.', 'Máy chủ 203.0.113.7.', 'Địa chỉ 2001:db8::1 dùng nội bộ.',
    'Liên hệ nhom@example.test để nhận bản.', 'Khóa ghp_abcdefghijklmnop1234 dùng tạm.', 'Mã aB3dE5gH7jK9mN1pQ3sT5vW7 cấp cho tài khoản.', 'Ghi chú api key: xyz.',
    'Bản lưu C:/bao-cao/a.pdf.', 'Mở trang ?id=12 để xem.', 'Bảng lấy từ bang_2025_quy.',
    'Bản gốc lưu ở /secret.', 'Tệp /foo.txt đính kèm.', 'Mở \\secret để xem.', 'Bản lưu C:report.pdf.', 'Xem (/bang) phía dưới.',
    'Lưu tại //server/share/report.', 'Lưu tại \\\\server/share/report.', 'Lưu tại \\\\server\\share.', 'Xem thu-muc/bao-cao.', 'Mục a/b/c.', 'Từ ./a hoặc ~/a.', 'Ngày /12/2025.',
    'Lưu ở ∕tmp∕a.', 'Lưu ở ／tmp／a.', 'Lưu ở ⁄tmp.', 'Mở %2Ftmp%2Fa.', 'Mở file:/tmp.',
    'Tài liệu được lưu tại file:report.pdf.', 'Lưu tại %252Ftmp%252Fa', 'Lưu tại ╱tmp╱a', 'Lưu tại ╲server╲share', 'Mã truy cập glpat-abc12345678901234567',
    'Dùng token=abc123 khi gọi.', 'Dán token: abcdefghijklmnop1234 vào ô.', 'Xem example.dev hoặc server.local.', 'Trang 例子.公司 có bảng.', 'Gửi tên@example.com.',
    'Gửi user@例子.公司.', 'Theo G​oogle, nhu cầu tăng.', 'Theo Goog­le, nhu cầu tăng.', 'Theo Page​Index.', 'Theo Ｇｏｏｇｌｅ.', 'Lưu ở C: / secret.',
    'Mã 550e8400-e29b-41d4-a716-446655440000 cấp riêng.', 'Mã abc123 dùng tạm.', 'Chuỗi AbCdEfGhIjKlMnOpQrStUvWxYz dùng tạm.', 'Số tài khoản 0123456789012.',
    'Lưu tại / tmp / a', 'Ghi chú api  key: a1-b2', 'Ghi chú mật  khẩu: x2-ab12', 'Theo Page Index, nhu cầu tăng.', 'Theo Agent–Reach.', 'Theo Kalo-data.',
    'Xem https : / / example . com', 'Xem example . dev', 'Máy 001.002.003.004 nội bộ.', 'Xếp theo thùng / két.'];
  const picked = selectPdfExcerpts(artifact(unsafe.map((text, i) => quote(SHA_A, i + 1, text))), RUN, names);
  assert.deepEqual(picked.excerpts, []);
  assert.deepEqual(picked.leftOut.map(item => item.reason), unsafe.map(() => 'NOT_READER_SAFE'));
});

test('selection: ordinary numbers, month-year dates, ratios and unit slashes stay verbatim', () => {
  const plain = ['Doanh thu ngành đạt 12.345.678 triệu đồng năm 2025, tăng 5,2%.', 'Giá bình quân 250.000 đồng/chiếc trong tháng 6/2025.', 'Tỷ lệ hộ có quạt điện là 3/4 ở đô thị, 10.500.000 hộ.',
    'Giá 250.000đ/tháng, bán 24/7, tính theo (cái/hộp) và/hoặc thùng/két.', 'Tại TP.HCM, quạt 5G, pin 5000mAh, phòng 50m², quý Q3/2025, sau COVID-19, v.v.',
    'Cửa hàng mở lúc 10:30, giảm ~30% cho mẫu S24 (“bán chạy”) – theo khảo sát…'];
  const picked = selectPdfExcerpts(artifact(plain.map((text, i) => quote([SHA_A, SHA_A, SHA_A, SHA_B, SHA_B, SHA_B][i]!, i + 1, text))), RUN, names);
  assert.deepEqual(picked.excerpts.map(item => item.text), plain);
  assert.deepEqual(picked.leftOut, []);
  const spaced = ['Mô hình B2B tăng 10–20% so với cùng kỳ, tỷ lệ 1:2 .', 'Doanh số 1.234.567.890 đồng ... theo khảo sát :'];
  assert.deepEqual(selectPdfExcerpts(artifact(spaced.map((text, i) => quote(SHA_A, i + 1, text))), RUN, names).excerpts.map(item => item.text), spaced);
});

test('number grammar: a digit is shown only inside a closed number shape and two numbers never stand side by side', () => {
  const shown = (text: string): boolean => selectPdfExcerpts(artifact([quote(SHA_A, 1, text)]), RUN, names).excerpts.length === 1;
  for (const text of ['Thị trường tăng 25% năm 2025.', 'Quy mô đạt 1,2 tỷ USD, tăng 8,5% trong 2024–2025.', 'Doanh thu 1.234 tỷ đồng, 6/2025.', 'Bán 1.000+ đơn, giá 250.000đ/tháng.',
    'Dung tích 10-20ml, pin 5000mAh, nhiệt độ 30°C, dùng 3 lần/ngày.', 'Sau COVID-19, quý Q3 tăng, mẫu S24 dẫn đầu.', 'Khung giờ 09:30 – 11:00, tỷ lệ 1:2.',
    'Giảm ~30%, đạt ≥40% vào 15/6, gói 50.000đ/kg, tổng 1.234.567,5 đồng.', 'Có 1500 cửa hàng ở 63 tỉnh, màn 4K, mạng 5G, mô hình B2C.'])
    assert.equal(shown(text), true, text);
  // Round 6 blockers: a spaced machine address and grouped codes.
  for (const text of ['Máy 001. 002. 003. 004 nội bộ.', 'Máy 203. 0. 113. 7.', 'Máy 203 . 0 . 113 . 7', 'Máy 203, 0, 113, 7.', 'Máy 203 – 0 – 113 – 7.', 'Máy 192.168.100.200 nội bộ.',
    'Mã xác thực: 1234 5678 9012 3456', 'Dãy 1234 5678 9012 3456 dùng một lần.', 'Mã x2-ab12 dùng tạm.', 'Mã AB12-CD34-EF56-GH78.', 'Mã AB12 CD34 dùng tạm.', 'Dãy 1234–5678 cấp riêng.',
    'Mã 12345 dùng tạm.', 'Lô 0012 xuất kho.', 'Mã OTP 4821.', 'Nhập mã bảo mật 4821.', 'Số thẻ 4821 dùng tạm.', 'Mã 203-0-113-7.',
    // Follow-ups of the same rounds: spaced domain, one-slash path, slug, command flag, port-like ratio, small capitals.
    'Xem example. com', 'Xem example. com.pdf', 'Lưu ở server/share.', 'Lưu ở tmp/a.', 'Mục thu-muc-bao-cao.', 'Chạy rm -rf khi dọn.', 'Tỷ lệ 1:80.', 'Theo ɢᴏᴏɢʟᴇ, nhu cầu tăng.',
    'Theo G̲o̲o̲g̲l̲e̲, nhu cầu tăng.'])
    assert.equal(shown(text), false, text);
});

test('selection: only market sections are eligible even when the section id is made up', () => {
  assert.ok(PAGEINDEX_ELIGIBLE_SECTIONS.includes('M09'));
  const picked = selectPdfExcerpts(artifact([quote(SHA_A, 1, 'Một.', 'M99'), quote(SHA_A, 2, 'Hai.', 'X09'), quote(SHA_A, 3, 'Ba.', 'I16')]), RUN, names);
  assert.deepEqual([picked.excerpts.length, picked.leftOut.map(item => item.reason)], [0, ['NOT_MARKET_SECTION', 'NOT_MARKET_SECTION', 'NOT_MARKET_SECTION']]);
});

test('file names: empty, missing or provider-like names are withheld, never guessed', () => {
  for (const bad of ['', '   ', 'pageindex-export.pdf', 'Google trang.pdf', 'kalodata.pdf', 'a/b.pdf', 'C:\\x\\y.pdf', 'https://example.test/a.pdf', 'a;b.pdf', 'metric-report.pdf', 'x'.repeat(130), 'solieu.example.vn.pdf', '203.0.113.7.pdf', 'bao_cao_nganh.pdf', 'aB3dE5gH7jK9mN1pQ3sT5vW7.pdf', '/secret.pdf', '\\secret.pdf', 'C:report.pdf', '~/a.pdf', 'tmp∕a.pdf', '%2Fa.pdf',
    '%252Fa.pdf', 'file:report.pdf', 'glpat-abc12345678901234567.pdf', 'example.dev.pdf', '╱tmp╱a.pdf', 'Ｇｏｏｇｌｅ.pdf', 'G​oogle.pdf', 'page index.pdf', 'Agent–Reach.pdf', 'api  key.pdf',
    'x2-ab12.pdf', '1234-5678-9012-3456.pdf', '192-168-1-1.pdf', 'AB12-CD34-EF56.pdf'])
    assert.equal(pdfExcerptFileNameShown(bad), false, JSON.stringify(bad));
  assert.equal(pdfExcerptFileNameShown(undefined), false);
  assert.equal(pdfExcerptFileNameShown('bao-cao-nganh.pdf'), true);
  assert.equal(pdfExcerptFileNameShown('bao-cao-2025-quy-3-nganh-quat-dien.pdf'), true, 'a long hyphenated name is not a token');
  const withheld = excerptsOf([quote(SHA_A, 2, 'Một.'), quote(SHA_B, 3, 'Hai.')], new Map([[SHA_A, ''], [SHA_B, 'PageIndex.pdf']]));
  assert.deepEqual(withheld.map(item => item.label), ['Tài liệu số 1, không hiển thị tên tệp, trang 2', 'Tài liệu số 2, không hiển thị tên tệp, trang 3']);
});

test('block: publisher and year read "chưa ghi", the grade reads unrated, no grade A and no S22', () => {
  const html = pdfExcerptBlockHtml(twoDocuments(), value => value);
  const doc = new JSDOM(html).window.document;
  const items = [...doc.querySelectorAll('li')];
  assert.equal(items.length, 3);
  for (const item of items) {
    assert.match(item.querySelector('blockquote[data-quote]')!.textContent!, /nhà xuất bản: chưa ghi; năm: chưa ghi; độ tin cậy: chưa xếp hạng độ tin cậy\./u);
  }
  assert.doesNotMatch(html, /S22|độ tin cậy: A|hạng A|Hạng A|\bgrade\b/u);
  assert.equal(pdfExcerptBlockHtml([], value => value), '');
  assert.match(html, new RegExp(PDF_EXCERPT_TITLE, 'u'));
});

test('stored excerpts are read only from a draft whose packet carries the marker', () => {
  const excerpts = twoDocuments();
  assert.deepEqual(storedPdfExcerpts({ sourceEvidence: { pdfExcerpts: true }, pdfExcerpts: excerpts }), excerpts);
  assert.deepEqual(storedPdfExcerpts({ pdfExcerpts: excerpts }), []);
  assert.deepEqual(storedPdfExcerpts({ sourceEvidence: {}, pdfExcerpts: excerpts }), []);
  assert.deepEqual(storedPdfExcerpts({ sourceEvidence: { pdfExcerpts: true } }), []);
});

test('evidence: S25 is registered once per document and only when an excerpt is drawn', () => {
  const base = buildSourceEvidence({ draft: null, draftDigest: null, unavailableReason: 'SALES_NAMES_UNAVAILABLE', webResults: [], captures: [] });
  const excerpts = twoDocuments();
  const input = (over: object = {}) => ({ collection: null, ...over }) as Parameters<typeof sourceEvidenceForReport>[1];
  const drawn = sourceEvidenceForReport(base, input({ pdfExcerpts: excerpts }), 'MARKET');
  assert.equal(drawn.pdfExcerpts, true);
  assert.deepEqual(drawn.sourceAppendix.rows.map(row => [row.registryId, row.binding.kind, row.binding.ref]).sort(), [['S25', 'package', SHA_A], ['S25', 'package', SHA_B]]);
  assert.deepEqual(sourceEvidenceForReport(drawn, input({ pdfExcerpts: excerpts }), 'MARKET'), drawn, 'idempotent: no duplicate use');
  assert.equal(JSON.stringify(drawn).includes('S22'), false);
  const none = sourceEvidenceForReport(base, input(), 'MARKET');
  assert.equal('pdfExcerpts' in none, false);
  assert.deepEqual(none, base);
  assert.deepEqual(sourceEvidenceForReport(base, input({ pdfExcerpts: excerpts }), 'INSIGHT'), base, 'Insight draws no document excerpt');
  assert.deepEqual(sourceEvidenceForReport(base, input({ pdfExcerpts: [] }), 'MARKET'), base);
});
async function reader(pdfExcerpts: readonly PdfExcerpt[] = []) {
  const input = sync1ReaderFixture('1.4.0'); input.peerRule = { ...DEFAULT_MARKET_PEER_RULE };
  const units = unitPriceFixture(input.rows); input.unitPrices = units.packet;
  return buildMarketReport(computeReaderReportData(input, units.retained), { ...sync1Options, flint: true, ...(pdfExcerpts.length ? { pdfExcerpts } : {}) });
}
const visible = (html: string): string => new JSDOM(html).window.document.body.textContent!.replace(/\s+/gu, ' ');

test('reader report: no excerpts gives the same bytes as a build that never heard of them', async () => {
  const plain = (await reader()).html;
  assert.equal(plain.includes(PDF_EXCERPT_TITLE), false);
  assert.equal(plain.includes(PDF_EXCERPT_NOTE), false);
  assert.equal((await reader([])).html, plain);
});

test('reader report: the block sits once in M09 with its note, passes every gate and leaks no provider text', async () => {
  const built = await reader(twoDocuments());
  const doc = new JSDOM(built.html).window.document;
  const section = doc.querySelector('#phan-9')!;
  assert.equal((built.html.match(new RegExp(PDF_EXCERPT_TITLE, 'gu')) ?? []).length, 1);
  assert.ok(section.textContent!.includes(PDF_EXCERPT_TITLE));
  assert.equal(doc.querySelectorAll('#phan-9 blockquote[data-quote]').length, 3);
  assert.ok(section.textContent!.includes('Nhu cầu bình giữ nhiệt tăng đều ở các đô thị lớn.'));
  assert.equal(doc.querySelectorAll('blockquote[data-quote]').length, 3, 'no other section carries an excerpt');
  assert.match(built.html, /Chú thích:/u);
  assert.ok(visible(built.html).includes('không so sánh được với số liệu mẫu'));
  const failed = auditMarketReportHtml(built.html, { presentation: false }).filter(item => !item.ok).map(item => `${item.rule}: ${item.detail}`);
  assert.deepEqual(failed, []);
  assert.ok(auditMarketReportHtml(built.html, { presentation: false }).some(item => item.rule === 'PDF_EXCERPT_NOT_MARKET_NUMBER' && item.ok), 'the extra check runs once the block is drawn');
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
  const plainRules = auditMarket14((await reader()).html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule);
  assert.deepEqual(auditMarket14(built.html).filter(item => item.kind === 'machine' && !item.ok).map(item => item.rule).filter(rule => !plainRules.includes(rule)), [], 'no new machine-rule failure');
  const rule13 = auditMarket14(built.html).find(item => item.rule === '13')!;
  assert.equal(rule13.ok, true, rule13.detail);
  const noData = built.html.replace(/data:[a-z/+-]+;base64,[A-Za-z0-9+/=]+/gu, 'data:');
  assert.doesNotMatch(noData, /PageIndex|Google|Kalodata|Metric\b|SerpApi|Apify|\bS22\b/iu);
  assert.doesNotMatch(noData, /[A-Za-z]:\\|\/home\/|\/Users\//u);
  assert.doesNotMatch(visible(built.html), /\d+\s*%\s*(?:hoàn|xong|tiến)|đang xử lý \d+/iu);
});

const withBlock = (statement: string): string => `<html><body><section id="M09"><h3>${PDF_EXCERPT_TITLE}</h3><ul><li><blockquote data-quote><p>Câu gốc.</p></blockquote></li></ul><p>${statement}</p></section></body></html>`;
const verdict = (statement: string): boolean | undefined => auditMarketReportHtml(withBlock(statement), { presentation: false }).find(item => item.rule === 'PDF_EXCERPT_NOT_MARKET_NUMBER')?.ok;

test('gate: an excerpt number presented as market size, combined with sample figures, or as customer voice is refused', () => {
  for (const text of ['Con số trong đoạn trích cho biết quy mô thị trường của sản phẩm này.', 'Trích đoạn tài liệu PDF là tổng thị trường của bình giữ nhiệt.',
    'Số trong tài liệu PDF cho thấy thị phần của mẫu.', 'Tài liệu PDF nêu tổng doanh thu của cả ngành.',
    'Số trong trích đoạn cộng với doanh thu của mẫu ra một con số.', 'Con số trong đoạn trích trừ doanh thu của mẫu.',
    'Đoạn trích là khách hàng nói về sản phẩm.', 'Tài liệu PDF là đánh giá của người mua.', 'Trích đoạn là ý kiến của khách hàng.'])
    assert.equal(verdict(text), false, text);
});

test('gate: negated disclaimers and the template own note do not trip it', () => {
  for (const text of ['Trích đoạn tài liệu PDF không phải quy mô thị trường.', 'Đoạn trích không cộng với doanh thu của mẫu.', 'Tài liệu PDF không phải là tiếng nói của khách hàng.',
    'Đoạn trích không so sánh được với doanh thu của mẫu.', PDF_EXCERPT_NOTE, 'Doanh thu của mẫu được ghi riêng, không liên quan tài liệu khác.'])
    assert.equal(verdict(text), true, text);
  assert.equal(auditMarketReportHtml('<html><body><section id="M09"><p>Tài liệu PDF là tổng thị trường.</p></section></body></html>', { presentation: false }).some(item => item.rule === 'PDF_EXCERPT_NOT_MARKET_NUMBER'), false, 'no block, no extra rule');
  assert.equal(verdict('Câu thường về bình giữ nhiệt.'), true);
});

test('gate: the excerpt text itself is copied source text and is not read as a statement of the report', () => {
  const html = `<html><body><section id="M09"><h3>${PDF_EXCERPT_TITLE}</h3><ul><li><blockquote data-quote><p>Tổng thị trường đạt 10 tỷ, theo tài liệu PDF này, cộng doanh thu mẫu.</p></blockquote></li></ul></section></body></html>`;
  assert.equal(auditMarketReportHtml(html, { presentation: false }).find(item => item.rule === 'PDF_EXCERPT_NOT_MARKET_NUMBER')?.ok, true);
});
