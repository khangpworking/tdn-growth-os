import assert from 'node:assert/strict';
import test from 'node:test';
import { splitCaptureNameCell, isMainCapturedProduct, captureRowExclusions, captureExclusionNotice } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { plainCaptureNumbers } from '../../src/modules/analysis/reader-report/format.js';

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
