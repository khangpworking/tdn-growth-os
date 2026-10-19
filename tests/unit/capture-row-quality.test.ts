import assert from 'node:assert/strict';
import test from 'node:test';
import { CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2, isCaptureRowProfile, splitCaptureNameCell, isMainCapturedProduct, captureRowExclusions, captureExclusionNotice, assessCaptureRows, assessCaptureRowsTitleOnly } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { plainCaptureNumbers } from '../../src/modules/analysis/reader-report/format.js';
import { retainedRelevance } from '../helpers/capture-relevance-fixture.js';

test('name cell splits tolerant spacing and case; explicit shops win and unmatched cells are unchanged', () => {
  const name = 'Quạt điện Mẫu A 340 REVIEWS Total  sold products: 1.496 Created date: 03/2024  Gian hàng Mẫu';
  assert.deepEqual(splitCaptureNameCell(name, ''), { title: 'Quạt điện Mẫu A', shop: 'Gian hàng Mẫu', reviews: '340', lifetimeSold: '1.496', createdMonth: '03/2024' });
  assert.equal(splitCaptureNameCell(name, 'Gian hàng khác').shop, 'Gian hàng khác');
  for (const original of ['Quạt điện 7 cánh remote', 'Quạt điện 3 reviews', '  Tên chưa có mẫu  '])
    assert.deepEqual(splitCaptureNameCell(original, 'Shop'), { title: original, shop: 'Shop', reviews: null, lifetimeSold: null, createdMonth: null });
});

test('generic prefix rule keeps title suffixes and promotional prefixes, across products and accents', () => {
  const cases: [string, string, boolean][] = [
    ['Quạt điện Mẫu A remote Phụ Kiện 7 cánh', 'quạt điện', true],
    ['TOP 1 SHOPEE BH 2NĂM Quạt cây 5 cánh', 'quạt điện', true],
    ['Hàng Loại 1 5 Tốc Độ Gió- Size 15cm Quạt Kẹp Bàn', 'quạt điện', true],
    ['Moter Quạt Điện B4 220V', 'quạt điện', false], ['Mô-tơ quạt điện', 'quạt điện', false],
    ['Pin sạc dự phòng cho quạt điện thoại', 'quạt điện', false], ['Power Bank quạt điện thoại', 'quạt điện', false],
    ['Tụ quạt điện', 'quạt điện', false], ['Dầu quạt', 'quạt điện', false], ['Công tắc remote quạt', 'quạt điện', false],
    ['Nắp bình giữ nhiệt', 'bình giữ nhiệt', false], ['Bình giữ nhiệt kèm nắp', 'bình giữ nhiệt', true],
    ['Thạch dừa hương trái cây', 'thạch dừa', true], ['Bút cho thạch dừa', 'thạch dừa', false],
    ['Giày thể thao kèm dây', 'giày thể thao', true], ['Dây giày thể thao', 'giày thể thao', false],
    ['Ốp cho son môi', 'son', false], ['Thỏi SON-môi', 'son', true], ['Sơn tường', 'son', false],
    ['sonic person', 'son', false], ['Combo của son môi', 'son', false], ['Quà tặng thay thế son', 'son', false],
    ['Quạt mini dùng cho bàn', 'quạt điện', true], ['', 'quạt', false], ['Quạt', '', false],
  ];
  for (const [title, keyword, expected] of cases) assert.equal(isMainCapturedProduct(title, keyword), expected, title);
  assert.equal(isMainCapturedProduct('SON môi'.normalize('NFD'), 'son'), true);
  assert.equal(isMainCapturedProduct('SON môi', 'sơn'), false);
});

test('v3 floor preserves ambiguous part words; retained NOT_MAIN excludes them while v2 answers stay frozen', () => {
  assert.equal(CAPTURE_ROW_PROFILE, 'automation-metric-capture-v3');
  assert.equal(CAPTURE_ROW_PROFILE_V2, 'automation-metric-capture-v2');
  const adjacent = ['trục', 'đầu', 'đế', 'lốc', 'cuộn', 'núm', 'lưới', 'mạch', 'chân'];
  const prefixes = ['stato', 'chiết áp', 'chuyển đổi', 'đọng cơ', 'bánh răng', 'phụ tùng'];
  const ambiguous = [
    ...adjacent.map(word => `Mẫu thử ${word} quạt điện mini`),
    ...prefixes.map(word => `Mẫu thử ${word} loại nhỏ dành riêng Quạt điện`),
    'Trục Quạt Điện,Cốt Quạt Điện,Mẫu A B C',
    'Mẫu thử Đầu quạt không chổi than điện áp thấp',
    'Đầu quạt không chổi than loại mini',
    'Lốc quạt Mẫu A cuộn stato',
    'LỐC QUẠT ĐIỆN DÂY ĐỒNG - STATOR MẪU THỬ',
    'CÓ ĐÈN LED Đế chuyển đổi nguồn điện Cắm Được Quạt Điện mẫu thử',
    'ĐỌNG CƠ QUẠT ĐIỆN MẪU A - LOẠI CÓ REN',
    'Chiết áp tăng giảm tốc độ quạt điện mẫu thử',
  ];
  for (const title of ambiguous) for (const normalized of [title, title.toUpperCase(), title.normalize('NFD')]) {
    assert.equal(isMainCapturedProduct(normalized, 'quạt điện'.normalize('NFD'), CAPTURE_ROW_PROFILE), true, title);
    assert.equal(isMainCapturedProduct(normalized, 'quạt điện', CAPTURE_ROW_PROFILE_V2), true, `v2: ${title}`);
  }
  // Released v2 retains its prefix list; the general v3 floor has no part vocabulary.
  for (const title of ['Motor mẫu thử quạt điện', 'Cánh mẫu thử quạt điện']) {
    assert.equal(isMainCapturedProduct(title, 'quạt điện', CAPTURE_ROW_PROFILE_V2), false);
    assert.equal(isMainCapturedProduct(title, 'quạt điện', CAPTURE_ROW_PROFILE), true);
  }
  const rows = ambiguous.map(title => ({ title, platform: 'shopee', revenue: 100, units: 1 }));
  const relevance = retainedRelevance(rows, 'quạt điện', () => 'NOT_MAIN');
  assert.deepEqual([...assessCaptureRowsTitleOnly(rows, ['quạt điện'], CAPTURE_ROW_PROFILE, relevance).exclusions],
    rows.map((_, i) => [i, 'NOT_MAIN_PRODUCT']));
});

test('v3 keeps head-first fans and non-adjacent short words, with whole accented tokens', () => {
  const kept = [
    'Quạt điện để bàn mẫu thử xoay đầu tự động', 'Quạt điện mới lắc đầu mẫu thử',
    'Quạt điện để bàn để đầu giường mẫu thử', 'Quạt điện ô tô Hai đầu quạt tuỳ chỉnh',
    'Mẫu thử Quạt điện gắn sau ghế có tích hợp đèn LED', 'Mẫu F Bạo lực Quạt điện Máy thổi khí',
    'QUẠT ĐIỀU HÒA HƠI NƯỚC MẪU THỬ', 'Đầu mùa sale Quạt điện mẫu thử',
    ...['trục', 'đầu', 'đế', 'lốc', 'cuộn', 'núm', 'lưới', 'mạch', 'chân'].map(word => `${word} mùa sale Quạt điện`),
    ...['stato', 'chiết áp', 'chuyển đổi', 'đọng cơ', 'bánh răng', 'phụ tùng'].map(word => `Quạt điện kèm ${word}`),
    'Mẫu statorish quạt điện', 'Dau quat dien',
  ];
  for (const title of kept) for (const profile of [CAPTURE_ROW_PROFILE_V2, CAPTURE_ROW_PROFILE])
    assert.equal(isMainCapturedProduct(title.normalize('NFD'), title === 'Dau quat dien' ? 'quat dien' : 'quạt điện', profile), true, title);
  assert.equal(isMainCapturedProduct('Đầu, QUẠT điện', 'quạt điện', CAPTURE_ROW_PROFILE), true, 'adjacency alone is not a relation');
  assert.equal(isMainCapturedProduct('Dau quạt điện', 'quạt điện', CAPTURE_ROW_PROFILE), true, 'accents are not stripped');
  assert.equal(isMainCapturedProduct('Đầu quat dien', 'quạt điện', CAPTURE_ROW_PROFILE), true, 'an unrecognized accented target is conserved');
  assert.equal(isMainCapturedProduct('Ống mẫu, DÙNG CHO lumo pod'.normalize('NFD'), 'LUMO POD', CAPTURE_ROW_PROFILE), false, 'a strong relation survives punctuation, case and NFC normalization');
  assert.equal(isMainCapturedProduct('Ống mẫu dùng cho lumo pód', 'lumo pod', CAPTURE_ROW_PROFILE), true, 'accents are not folded into a full target match');
});

test('independent fan title adversaries preserve ambiguous parts until retained NOT_MAIN decides them', () => {
  for (const title of ['quạt đứng chân cao', 'quạt có đèn', 'Quạt không cánh có đèn ngủ', 'Quạt điện lắc đầu kèm chân đế', 'Đầu giường dùng quạt điện mini', 'Lưới bảo vệ đi kèm quạt đứng', 'Chân cao dáng đứng: quạt điện'])
    assert.equal(isMainCapturedProduct(title, 'quạt điện', CAPTURE_ROW_PROFILE), true, title);
  const parts = ['đầu quạt', 'Bộ trục-quạt điện', 'Lưới, quạt điện', 'Chân quạt điện thay thế', 'Stato cho quạt điện', 'MOTOR QUẠT ĐIỆN'];
  for (const title of parts) assert.equal(isMainCapturedProduct(title, 'quạt điện', CAPTURE_ROW_PROFILE), true, title);
  const rows = parts.map(title => ({ title, platform: 'shopee', revenue: 100, units: 1 }));
  const relevance = retainedRelevance(rows, 'quạt điện', () => 'NOT_MAIN');
  assert.deepEqual([...assessCaptureRowsTitleOnly(rows, ['quạt điện'], CAPTURE_ROW_PROFILE, relevance).exclusions],
    rows.map((_, i) => [i, 'NOT_MAIN_PRODUCT']));
});

test('row exclusions use the requested profile and never reinterpret retained v2 parts as v3', () => {
  const rows = ['Trục quạt điện', 'Chiết áp mẫu thử Quạt điện', 'Quạt điện lắc đầu', 'Đầu mùa sale Quạt điện', 'Motor quạt điện']
    .map(title => ({ title, platform: 'shopee', revenue: 100, units: 1 }));
  const retained = structuredClone(rows);
  assert.deepEqual([...captureRowExclusions(rows, ['quạt điện'], CAPTURE_ROW_PROFILE_V2)], [[4, 'NOT_MAIN_PRODUCT']]);
  assert.deepEqual([...captureRowExclusions(rows, ['quạt điện'], CAPTURE_ROW_PROFILE)], []);
  const relevance = retainedRelevance(rows, 'quạt điện', title => [rows[0]!.title, rows[1]!.title, rows[4]!.title].includes(title) ? 'NOT_MAIN' : 'MAIN');
  assert.deepEqual([...assessCaptureRows(rows, ['quạt điện'], 'BATCH', relevance).exclusions], [[0, 'NOT_MAIN_PRODUCT'], [1, 'NOT_MAIN_PRODUCT'], [4, 'NOT_MAIN_PRODUCT']]);
  assert.deepEqual(captureRowExclusions(rows, ['quạt điện']), captureRowExclusions(rows, ['quạt điện'], CAPTURE_ROW_PROFILE_V2));
  assert.deepEqual(rows, retained);
});

test('capture profile guard accepts exactly v2 and v3, including rejecting non-string values', () => {
  for (const value of ['automation-metric-capture-v2', 'automation-metric-capture-v3']) assert.equal(isCaptureRowProfile(value), true);
  for (const value of ['automation-metric-capture-v1', 'automation-metric-capture-v4', '', 'AUTOMATION-METRIC-CAPTURE-V3', null, undefined, 3, true, {}, [], new String(CAPTURE_ROW_PROFILE)])
    assert.equal(isCaptureRowProfile(value), false, String(value));
});

test('plausibility uses relevant rows only, each platform separately, strict twenty-fold threshold and honest missing units', () => {
  const rows = [
    { title: 'Quạt A', platform: 'shopee', revenue: 1000000, units: 10 },
    { title: 'Quạt B', platform: 'shopee', revenue: 2000000, units: 20 },
    { title: 'Quạt C', platform: 'shopee', revenue: 2000000, units: 1 },
    { title: 'Quạt D', platform: 'shopee', revenue: 57200000, units: 1 },
    { title: 'Quạt E', platform: 'shopee', revenue: 1, units: 0 },
    { title: 'Quạt F', platform: 'shopee', revenue: 1, units: null },
    { title: 'Quạt G', platform: 'shopee', revenue: 0, units: 0 },
    { title: 'Quạt H', platform: 'shopee', revenue: null, units: null },
    { title: 'Tụ quạt', platform: 'shopee', revenue: 99999999999, units: 1 },
    { title: 'Quạt I', platform: 'tiktok', revenue: 100000000, units: 1 },
  ];
  // Add a normal row so the relevant Shopee median is exactly 100,000.
  rows.push({ title: 'Quạt J', platform: 'shopee', revenue: 100000, units: 1 });
  const exclusions = captureRowExclusions(rows, ['quạt điện']);
  assert.deepEqual([...exclusions].sort((a,b) => a[0]-b[0]), [[3,'UNIT_REVENUE_OUTLIER'],[4,'REVENUE_WITHOUT_UNITS'],[5,'REVENUE_WITHOUT_UNITS'],[8,'NOT_MAIN_PRODUCT']]);
  assert.deepEqual(captureRowExclusions([{ title: 'Son A', platform: 'shopee', revenue: 100, units: 1 }, { title: 'Son B', platform: 'shopee', revenue: 200, units: 1 }], ['son']), new Map());
});

test('filter notice omits zero categories, empty notices and forbidden visible text', () => {
  const rows = [{ platform: 'shopee', reason: 'NOT_MAIN_PRODUCT' as const }, { platform: 'shopee', reason: 'UNIT_REVENUE_OUTLIER' as const }];
  assert.equal(captureExclusionNotice(rows, 'tiktok'), '');
  assert.equal(captureExclusionNotice(rows.slice(0,1), 'shopee'), 'Đã loại 1 dòng không phải sản phẩm chính (phụ kiện, linh kiện hoặc sản phẩm khác) khỏi mẫu tính toán. Số liệu của toàn bộ kết quả tìm kiếm trên trang nguồn được giữ riêng, chưa áp dụng bộ lọc này.');
  const notice = captureExclusionNotice(rows, 'shopee');
  assert.match(notice, /và 1 dòng/);
  assert.doesNotMatch(notice, /0|%|Metric|Kalodata|Google/);
});

test('even medians average the central ratios, do not round unit revenue, and keep the exact threshold', () => {
  const rows = [100, 100, 300, 300, 4000, 4001].map((revenue, i) => ({ title: `Son mẫu ${i}`, platform: 'shopee', revenue, units: 1 }));
  // Median = 300, so neither upper row is twenty-fold; adding two lower rows makes median = 200.
  rows.push({ title: 'Son thêm A', platform: 'shopee', revenue: 100, units: 1 }, { title: 'Son thêm B', platform: 'shopee', revenue: 100, units: 1 });
  assert.deepEqual([...captureRowExclusions(rows, ['son'])], [[5, 'UNIT_REVENUE_OUTLIER']]);
});

test('capture number wording leaves source quotes, source identifiers and layout bytes intact', () => {
  const protectedHtml = '<style>.x{width:100%}</style><p data-quote>Shop 0 giảm 25%</p><q>0%</q><code>source_0</code>';
  assert.equal(plainCaptureNumbers(protectedHtml + '<p title="0%">0 dòng; 20%; 10.000; 0,01</p>'),
    protectedHtml + '<p title="0%">không có dòng; 20 phần trăm; 10.000; 0,01</p>');
  assert.equal(plainCaptureNumbers('<p>Trong mẫu có 0 dòng thiếu doanh thu và 0 dòng thiếu đơn vị bán.</p>'),
    '<p>Trong mẫu không có dòng thiếu doanh thu và không có dòng thiếu đơn vị bán.</p>');
  const citation = '<sup class="cite"><a href="#cite-1">[1]</a></sup><a href="https://example.test/a%20b?x=0&amp;y=1">Nguồn</a>';
  const escaped = '&lt;img src=x onerror=bad&gt; &amp; &#0; &#37; &quot;';
  assert.equal(plainCaptureNumbers(`<p>${escaped} 20%${citation}</p>`), `<p>${escaped} 20 phần trăm${citation}</p>`);
});
