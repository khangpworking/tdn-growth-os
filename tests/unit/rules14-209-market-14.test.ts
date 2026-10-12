import assert from 'node:assert/strict';
import test from 'node:test';

import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';

const glossary = `<table data-glossary="true"><tbody>${[
  ['listing', 'sản phẩm'], ['review', 'đánh giá'], ['export', 'tệp dữ liệu'], ['peer set', 'nhóm đối thủ'],
  ['Giá TB', 'giá trung bình'], ['P25 / P75', 'mốc 25% / mốc 75%'], ['NSX', 'nhà sản xuất'], ['H1', 'giả thuyết 1'],
  ['ROAS', 'tỷ lệ doanh thu trên chi phí quảng cáo'], ['CPA', 'chi phí trên đơn'], ['AI', 'trí tuệ nhân tạo'],
].map(([term, meaning]) => `<tr><td>${term}</td><td>${meaning}</td></tr>`).join('')}</tbody></table>`;

const sections = [...Array.from({ length: 11 }, (_, i) => `<section id="phan-${i + 1}"><span>Phần ${i + 1}</span><p>Doanh thu 10 trong mẫu (n = 4) sản phẩm.</p></section>`),
  `<section id="phan-12"><span>Phần 12</span><p>Ba phương án là đề xuất, chờ chủ duyệt.</p><table><thead><tr><th>Việc làm ngay</th><th>Người phụ trách</th><th>Hạn</th></tr></thead><tbody>${[
    'Việc làm nhanh: rà dữ liệu', 'Kiểm tra phân loại', 'Đối chiếu đánh giá',
  ].map(name => `<tr><td>${name} (đề xuất, chờ chủ duyệt)</td><td>Chủ dự án (đề xuất, chờ chủ duyệt)</td><td>Hạn: chủ chọn</td></tr>`).join('')}</tbody></table></section>`,
  `<section id="phu-luc"><span>Phụ lục</span>${glossary}<p>Dữ liệu bán hàng, dữ liệu đánh giá sản phẩm trên nền tảng, kết quả tìm kiếm, bình luận đã thu thập.</p><p>Bảng PL.1</p></section>`];

const valid = `<html><head><style>.pi{background-image:url(data:image/svg+xml;base64,AA==)}</style></head><body><header class="cover"></header>
${sections.join('')}
<p>Trong mẫu n = 4 sản phẩm. <i class="pi s">Shopee</i> và <i class="pi t">TikTok Shop</i>.</p>
<table><thead><tr><th>Sàn</th><th>Doanh thu</th></tr></thead><tbody><tr><td><i class="pi s">Shopee</i></td><td>10</td></tr><tr><td><i class="pi t">TikTok Shop</i></td><td>20</td></tr></tbody></table>
<div class="chart flint" data-engine="flint"></div></body></html>`;

const rule = (html: string, number: string, trace?: string) => auditMarket14(html, trace).find(item => item.rule === number)!;

test('synthetic Market HTML passes all machine rules and marks review-only rules as READ', () => {
  const results = auditMarket14(valid);
  assert.deepEqual(results.filter(item => item.kind === 'machine' && !item.ok), []);
  assert.deepEqual(results.filter(item => item.kind === 'evidence').map(item => item.rule), ['6', '8', '10', '14']);
  assert.equal(rule(valid, '10').ok, false);
  const licensed = valid.replace('<header class="cover">', '<header class="cover" style="background-image:url(\'data:image/png;base64,AAAA\')">');
  assert.equal(rule(licensed, '10', 'owner-supplied asset; licensed for reuse').ok, true);
});

test('each machine rule has a failing synthetic mutation', () => {
  const mutations: Record<string, string> = {
    '1': valid.replace('<td>review</td><td>đánh giá</td>', '<td>review</td><td></td>'),
    '2': valid.replace('Phần 1</span>', 'M01</span>'),
    '3': valid.replace('</body>', '<p>source_sha256 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef</p></body>'),
    '4': valid.replace('Shopee</i> và', 'Google</i> và'),
    '5': valid.replace('Bảng PL.1', 'Ghi chú: Bảng PL.1'),
    '7': valid.replace('Trong mẫu n = 4 sản phẩm.', 'Trong mẫu 4 sản phẩm.'),
    '9': valid.replace(/Việc làm (?:nhanh|ngay)/gu, 'Bước'),
    '10': valid.replace('<header class="cover">', '<header class="cover" style="background-image:url(\'https://example.test/cover.jpg\')">'),
    '11': valid.replace('data-engine="flint"', 'data-engine="svg"'),
    '12': valid.replace(/TikTok Shop<\/i>/gu, 'TikTok</i>'),
    '13': valid.replace('bình luận đã thu thập', 'ghi chú nội bộ'),
  };
  for (const [number, html] of Object.entries(mutations)) assert.equal(rule(html, number).ok, false, `rule ${number}`);
});

test('rules 6, 8 and 14 remain evidence reads', () => {
  for (const number of ['6', '8', '14']) {
    const result = rule(valid, number);
    assert.equal(result.kind, 'evidence', `rule ${number}`);
    assert.match(result.detail, /READ/);
  }
});
