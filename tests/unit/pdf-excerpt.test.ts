import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { DEFAULT_MARKET_PEER_RULE } from '../../src/modules/analysis/default-market-peers.js';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { PAGEINDEX_ELIGIBLE_SECTIONS, type PageIndexQuotesArtifact, type PageIndexVerifiedQuote } from '../../src/modules/analysis/pageindex-questions.js';
import { auditMarket14, assertMarket14MachineRules } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { PDF_EXCERPT_NOTE, PDF_EXCERPT_TITLE, pdfDocumentTitle, pdfExcerptBlockHtml, pdfUntitledName, selectPdfExcerpts, storedPdfExcerpts, type PdfExcerpt } from '../../src/modules/analysis/research-automation/pdf-excerpt.js';
import { buildSourceEvidence, sourceEvidenceForReport } from '../../src/modules/analysis/research-automation/source-evidence.js';
import { sync1Options, sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';

const RUN = '22222222-2222-4222-8222-222222222222';
const SHA_A = 'a'.repeat(64), SHA_B = 'b'.repeat(64);
const quote = (sourceSha256: string, page: number, text: string, sectionId = 'M09', extra: Partial<PageIndexVerifiedQuote> = {}): PageIndexVerifiedQuote =>
  ({ sourceSha256, cloudDocId: 'doc-1', sectionId, page, quote: text, quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED', ...extra });
const artifact = (quotes: PageIndexVerifiedQuote[], runId = RUN): PageIndexQuotesArtifact => ({ contractVersion: 'pageindex-verified-quotes-v1', approvalState: 'UNREVIEWED', runId, quotes });
const TITLE_A = 'Báo cáo thị trường bình giữ nhiệt năm 2025';
const names = new Map<string, string | null>([[SHA_A, TITLE_A], [SHA_B, null]]);
const excerptsOf = (quotes: PageIndexVerifiedQuote[], map: ReadonlyMap<string, string | null> = names): PdfExcerpt[] => [...selectPdfExcerpts(artifact(quotes), RUN, map).excerpts];
const twoDocuments = (): PdfExcerpt[] => excerptsOf([
  quote(SHA_A, 2, 'Nhu cầu bình giữ nhiệt tăng đều ở các đô thị lớn.'), quote(SHA_A, 5, 'Giá nguyên liệu inox biến động theo quý.', 'M03'),
  quote(SHA_B, 1, 'Quy định ghi nhãn vật liệu tiếp xúc thực phẩm áp dụng từ năm trước.')]);

test('selection: two documents keep stored order, Market sections only, verbatim text', () => {
  const picked = selectPdfExcerpts(artifact([quote(SHA_A, 2, 'Câu một.'), quote(SHA_B, 1, 'Câu hai.'), quote(SHA_A, 5, 'Câu ba.', 'M05')]), RUN, names);
  assert.deepEqual(picked.excerpts.map(item => [item.sourceSha256 === SHA_A ? 'A' : 'B', item.page, item.text]), [['A', 2, 'Câu một.'], ['B', 1, 'Câu hai.'], ['A', 5, 'Câu ba.']]);
  assert.deepEqual(picked.excerpts.map(item => item.label), [`${TITLE_A}, trang 2`, 'Tài liệu PDF số 1, trang 1', `${TITLE_A}, trang 5`]);
  assert.deepEqual(picked.leftOut, []);
});

test('selection: each left-out reason is coded, nothing is cut or reworded, at most 3 per document', () => {
  const word = (i: number): string => ['một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'][i % 10]!;
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
    'Mã 550e8400-e29b-41d4-a716-446655440000 cấp riêng.', 'Mã abc123 dùng tạm.', 'pin 4821.', 'Mã khóa: 4821.', 'Mã số: 4821.', 'Chuỗi AbCdEfGhIjKlMnOpQrStUvWxYz dùng tạm.', 'Số tài khoản 0123456789012.',
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

test('word set: every word is written Vietnamese, so hosts, commands, English labels and spelled addresses are left out', () => {
  const shown = (text: string): boolean => selectPdfExcerpts(artifact([quote(SHA_A, 1, text)]), RUN, names).excerpts.length === 1;
  for (const text of ['Giá nguyên liệu inox biến động theo quý.', 'Kênh livestream trên Shopee và TikTok tăng mạnh, KOL chiếm phần lớn.', 'Thị trường FMCG ở ĐBSCL tăng đều.',
    'Sản phẩm serum vitamin bán chạy dịp sale cuối năm.', 'Người mua chọn mẫu mini, size nhỏ, giá tốt.'])
    assert.equal(shown(text), true, text);
  // Round 7 blockers: a host with a port or share, spaced domains on newer top-level names, spelled-out addresses, access-code
  // labels without accent marks, with a dash or in English, long or grouped codes and shell text.
  for (const text of ['Máy localhost: 8080 dùng nội bộ.', 'Máy server: 443.', 'Lưu ở server: share.', 'Xem example. dev', 'Xem example. co', 'Xem example. ai',
    'Gửi name at example dot com', 'Gửi minh at tin dot com', 'Gửi minh (at) tin (dot) com', 'Ma xac thuc: 4821', 'Nhập mã xác-thực: 4821', 'Tài khoản số 4821 dùng tạm.',
    'Nhập verification code: 4821', 'Mã: abcdefghijklmnopqrst', 'Mã: ABCD-12', 'Chạy chmod +x file khi cài.', 'Viết bằng C++.',
    // Round 7 follow-ups.
    'Theo Góogle, nhu cầu tăng.', 'Mã AB12 và CD34 dùng tạm.', 'Lưu ở server slash share.', 'Gửi minh a còng tin chấm com.', 'Máy 203 chấm 0 chấm 113 chấm 7.',
    // An English sentence is not written Vietnamese, so it is left out whole.
    'Demand for vacuum flasks grows in big cities.'])
    assert.equal(shown(text), false, text);
  assert.deepEqual(selectPdfExcerpts(artifact([quote(SHA_A, 1, 'Demand grows.')]), RUN, names).leftOut.map(item => item.reason), ['NOT_READER_SAFE']);
  // A file name is never a document name, however plain it reads.
  for (const bad of ['example. dev.pdf', 'http:.pdf', 'C:.pdf', '.pdf', '-.pdf', '123.pdf', 'pin.pdf', 'ma-so-4821.pdf', 'ma-khoa-4821.pdf', 'ma-xac-thuc-4821.pdf', 'minh-a-cong-tin.pdf', 'server-share.pdf', 'demand-report.pdf',
    'bao-cao-quat-dien.pdf', 'thi-truong-binh-giu-nhiet-2025.pdf', 'Báo cáo ngành quạt điện.pdf', 'source-0.pdf'])
    assert.equal(pdfDocumentTitle(bad), null, bad);
});

test('selection: only market sections are eligible even when the section id is made up', () => {
  assert.ok(PAGEINDEX_ELIGIBLE_SECTIONS.includes('M09'));
  const picked = selectPdfExcerpts(artifact([quote(SHA_A, 1, 'Một.', 'M99'), quote(SHA_A, 2, 'Hai.', 'X09'), quote(SHA_A, 3, 'Ba.', 'I16')]), RUN, names);
  assert.deepEqual([picked.excerpts.length, picked.leftOut.map(item => item.reason)], [0, ['NOT_MARKET_SECTION', 'NOT_MARKET_SECTION', 'NOT_MARKET_SECTION']]);
});

test('document titles: a plain Vietnamese title is shown as written, search-page trimmings are dropped', () => {
  for (const [raw, shown] of [
    [TITLE_A, TITLE_A],
    ['  Báo cáo   ngành quạt điện  ', 'Báo cáo ngành quạt điện'],
    ['[PDF] Báo cáo ngành quạt điện | Cổng thông tin', 'Báo cáo ngành quạt điện'],
    ['Báo cáo ngành quạt điện - VnExpress', 'Báo cáo ngành quạt điện'],
    ['Báo cáo ngành quạt điện năm 2025...', 'Báo cáo ngành quạt điện năm 2025'],
    ['Báo cáo ngành quạt điện năm 2025 …', 'Báo cáo ngành quạt điện năm 2025'],
    ['Báo cáo ngành quạt điện ... - VnExpress', 'Báo cáo ngành quạt điện'],
    ['Báo cáo ngành quạt điện......', 'Báo cáo ngành quạt điện'],
    ['Báo cáo ngành quạt điện ... … - VnExpress', 'Báo cáo ngành quạt điện'],
    ['Báo cáo ngành quạt điện - cơ hội và rủi ro', 'Báo cáo ngành quạt điện - cơ hội và rủi ro'],
    ['BÁO CÁO NGÀNH QUẠT ĐIỆN VIỆT NAM', 'BÁO CÁO NGÀNH QUẠT ĐIỆN VIỆT NAM'],
    ['Thị trường FMCG ở ĐBSCL quý 3/2025', 'Thị trường FMCG ở ĐBSCL quý 3/2025'],
  ] as const) {
    assert.equal(pdfDocumentTitle(raw), shown, raw);
    assert.equal(pdfDocumentTitle(pdfDocumentTitle(raw)), shown, `idempotent: ${raw}`);
  }
  assert.equal(pdfDocumentTitle(pdfDocumentTitle(TITLE_A)), TITLE_A, 'vetting a vetted title keeps it');
});

test('document titles: a file name, link, path, code, provider, English heading or one word is never shown', () => {
  for (const bad of [undefined, null, 42, '', '   ', '[PDF]', 'Báo', 'Báo cáo', 'bao-cao-nganh.pdf', 'Báo cáo ngành quạt điện.pdf', 'https://example.test/a.pdf', 'Xem tại solieu.example.vn',
    'C:\\x\\y.pdf', '/tmp/bao-cao.pdf', 'Báo cáo theo Kalodata', 'Số liệu PageIndex tháng 6', 'Báo cáo của Google', 'Báo cáo Ｇｏｏｇｌｅ', 'Vacuum flask market report 2025',
    'Báo cáo mã OTP 4821 dùng tạm', 'Báo cáo ' + 'nghiêng '.repeat(20), 'Báo cáo <script>', 'Báo cáo gửi nhom@example.test',
    'Báo cáo ngành quạt điện - bản in.pdf', 'Báo cáo ngành quạt điện.docx', 'Báo cáo ngành quạt điện 1234567890',
    ...['rtf', 'odt', 'ods', 'odp', 'odg', 'ott', 'ots', 'otp', 'epub', 'docm', 'xlsb', 'xlsm', 'pptm', 'ppsx', 'potx', 'dot', 'dotx', 'dotm', 'odf', 'odm', 'mobi',
      'azw3', 'pages', 'numbers', 'key', 'mp4', '7z', 'PDF', 'Docx'].flatMap(extension => [`Báo cáo ngành quạt điện - bản in.${extension}`, `Báo cáo ngành quạt điện.${extension}`,
      `Báo cáo ngành quạt điện.${extension} - Cổng thông tin`]),
    'Báo cáo ngành M03', 'Báo cáo ngành Q8', 'Tăng trưởng 20%', 'Báo cáo -', 'Báo cáo . .',
    'Báo cáo Gοοgle', 'Báo cáo Kaⅼodata', 'Báo cáo Ｍｅｔｒｉｃ', 'Báo cáo Page Index'])
    assert.equal(pdfDocumentTitle(bad), null, JSON.stringify(bad));
  assert.equal(pdfUntitledName(3), 'Tài liệu PDF số 3');
});

test('labels: "<title>, trang N", or "Tài liệu PDF số k, trang N" numbered only over shown untitled documents', () => {
  const SHA_C = 'c'.repeat(64);
  const map = new Map<string, string | null>([[SHA_A, null], [SHA_B, null], [SHA_C, 'Báo cáo ngành quạt điện']]);
  const labels = excerptsOf([quote(SHA_A, 1, 'Xem https://example.test/x.'), quote(SHA_C, 1, 'Một.'), quote(SHA_B, 2, 'Hai.'), quote(SHA_A, 3, 'Ba.'), quote(SHA_B, 4, 'Bốn.')], map).map(item => item.label);
  assert.deepEqual(labels, ['Báo cáo ngành quạt điện, trang 1', 'Tài liệu PDF số 1, trang 2', 'Tài liệu PDF số 2, trang 3', 'Tài liệu PDF số 1, trang 4'], 'a left-out excerpt takes no number');
  // A stored name that is a file name, empty or provider-like is vetted again and replaced by the order wording.
  for (const fileName of ['bao-cao-nganh.pdf', 'Báo cáo ngành quạt điện - bản in.odt', 'Báo cáo ngành quạt điện - bản in.dotx', 'Báo cáo ngành quạt điện.pages']) {
    const vetted = excerptsOf([quote(SHA_A, 2, 'Một.'), quote(SHA_B, 3, 'Hai.')], new Map([[SHA_A, fileName], [SHA_B, 'PageIndex.pdf']]));
    assert.deepEqual(vetted.map(item => item.label), ['Tài liệu PDF số 1, trang 2', 'Tài liệu PDF số 2, trang 3']);
    assert.ok(vetted.every(item => !item.label.includes('.pdf')));
  }
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
  const pdfEntries = [...doc.querySelectorAll('.citation-register li')].filter(li => li.querySelector('.cite-locator')?.textContent?.startsWith('trang '));
  assert.equal(pdfEntries.length, 3);
  for (const entry of pdfEntries) assert.equal((entry.textContent!.match(/trang \d+/gu) ?? []).length, 1, entry.textContent!);
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

test('a reader regenerated from legacy excerpt labels uses consecutive fallback names and passes the gates', async () => {
  const excerpts = twoDocuments().map(item => ({ ...item, label: `Tài liệu bao-cao-nganh.pdf, trang ${item.page}` }));
  const built = await reader(excerpts);
  const doc = new JSDOM(built.html).window.document;
  const labels = [...doc.querySelectorAll('.pdf-excerpts footer')].map(item => item.textContent!.split(';')[0]);
  assert.deepEqual(labels, ['Tài liệu PDF số 1, trang 2', 'Tài liệu PDF số 1, trang 5', 'Tài liệu PDF số 2, trang 1']);
  assert.doesNotMatch(built.html, /bao-cao-nganh\.pdf|tên tệp/u);
  assert.doesNotThrow(() => assertMarket14MachineRules(built.html));
  assert.doesNotThrow(() => assertMarketBusinessGate(built.html, { presentation: false }));
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
