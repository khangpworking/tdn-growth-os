import assert from 'node:assert/strict';
import test from 'node:test';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
const bad = (html: string): string[] => lintVisibleReportText(html).filter(r => !r.ok).map(r => r.rule);
test('U13 inspects visible wording in headings while preserving nested quotes and titles', () => {
  assert.deepEqual(bad('<h2>Tốt nhất</h2><p><span data-quote><b>rẻ nhất</b></span> Lời nguồn.</p><script>hàng đầu</script>'), ['U13_SUPERLATIVE', 'L20_RANKING_WORD']);
  assert.deepEqual(bad('<title>Sản phẩm tốt nhất</title>'), ['U13_SUPERLATIVE', 'L20_RANKING_WORD']);
  assert.deepEqual(bad('<p>Sản phẩm tốt <b>nhất</b>.</p>'), ['U13_SUPERLATIVE', 'L20_RANKING_WORD']);
  assert.deepEqual(bad('<p>h&#224;ng đầu</p>'), ['U13_SUPERLATIVE']);
  assert.deepEqual(bad('<p>Quy tắc chọn tới khi đạt ít nhất <b>50</b>% doanh thu nhóm.</p>'), []);
  assert.deepEqual(bad('<p>Bản ghi duy nhất: 12; Dòng trùng đồng nhất: 2.</p>'), []);
  assert.deepEqual(bad('<p>Bản ghi duy nhất của sản phẩm tốt nhất.</p>'), ['U13_SUPERLATIVE', 'L20_RANKING_WORD']);
  assert.deepEqual(bad('<p>Sản phẩm duy nhất cho nhu cầu này.</p>'), ['U13_SUPERLATIVE']);
});
test('U13 requires explicit dependency for priority and a same-sentence draft label', () => {
  assert.deepEqual(bad('<p>Làm ngay bước này, tiếp theo bước kia.</p>'), ['U13_PRIORITY']);
  assert.deepEqual(bad('<section><p>Làm ngay bước này.</p><p>Tiếp theo bước kia.</p></section>'), ['U13_PRIORITY']);
  assert.deepEqual(bad('<section><p>Làm ngay bước này.</p><p>Tiếp theo bước kia.</p><p>Phụ thuộc vào dữ liệu.</p></section>'), ['U13_PRIORITY']);
  assert.deepEqual(bad('<p>Làm ngay xác minh; tiếp theo tính giá chỉ sau khi xác minh.</p>'), []);
  assert.deepEqual(bad('<p><span data-classified="pending">12,5%</span> trong mẫu. Phân loại đề xuất, chờ chủ duyệt.</p>'), ['U13_PENDING_NUMBER']);
  assert.deepEqual(bad('<p><span data-classified="pending">12.5%</span> trong mẫu (đề xuất, chờ chủ duyệt).</p>'), []);
  assert.deepEqual(bad('<table><tr><td data-classified="pending">12</td><td>đề xuất, chờ chủ duyệt</td></tr><tr><td data-classified="pending">2</td><td>chưa rõ</td></tr></table>'), ['U13_PENDING_NUMBER']);
});


for (const code of ['DT-1', 'GIA-2', 'ABCD-12']) {
  test(`R-M33 visible metric column ${code} fails`, () => {
    assert.deepEqual(bad(`<table><thead><tr><th>${code}</th></tr></thead></table>`), ['U13_METRIC_CODE']);
  });
}
test('R-M34 visible giá thật fails', () => {
  assert.deepEqual(bad('<p>Giá thật trong kỳ.</p>'), ['U13_REAL_PRICE']);
});

const rankingRows = [
  ['neutral retained coverage count', '<dl><dt>Độ phủ dòng</dt><dd>Có số 1 · Bằng 0 0 · Thiếu 0</dd></dl>', []],
  ['neutral retained document ordinal', '<p>Tài liệu PDF số 1, trang 1.</p>', []],
  ['neutral labels do not excuse a ranking claim', '<p>Có số 1 · Sản phẩm số 1.</p><p>Tài liệu PDF số 1, dẫn đầu.</p>', ['L20_RANKING_WORD']],
  ['neutral labels do not excuse a banned phrase', '<p>Tài liệu PDF số 1 thị trường.</p>', ['L20_RANKING_WORD']],
  ...[
    ['period', 'về doanh thu trong 120 sản phẩm Shopee.'],
    ['sample', 'về doanh thu, kỳ 20/09–19/10/2026.'],
    ['measure', 'trong 120 sản phẩm Shopee, kỳ 20/09–19/10/2026.'],
  ].map(([missing, scope]) => [`counter prefix in a ranking still requires ${missing}`, `<p>Thương hiệu A có số 1 ${scope}</p>`, ['L20_RANKING_WORD']] as const),
  ['complete số 1 ranking', '<p>Thương hiệu A có số 1 về doanh thu trong 120 sản phẩm Shopee, kỳ 20/09–19/10/2026.</p>', []],
  ['complete Market sentence', '<p>Thương hiệu A dẫn đầu về doanh thu trong 120 sản phẩm Shopee của mẫu, kỳ 20/09–19/10/2026.</p>', []],
  ['missing period', '<p>Thương hiệu A dẫn đầu về doanh thu trong 120 sản phẩm Shopee của mẫu.</p>', ['L20_RANKING_WORD']],
  ['complete Insight nhiều nhất', '<p>Giao hàng chậm là chủ đề chê được nhắc nhiều nhất trong 300 bình luận TikTok Shop, kỳ 01/09–30/09/2026.</p>', []],
  ['complete table title', '<h3>Sản phẩm dẫn đầu theo doanh thu, 200 sản phẩm trong mẫu, Shopee và TikTok Shop, kỳ 20/09–19/10/2026</h3>', []],
  ...['caption', 'div class="ext"'].map(tag => [`O9 ${tag} cannot borrow ranking context from a sibling`,
    `<table><${tag}>Sản phẩm dẫn đầu</${tag.split(' ')[0]}></table><div>Doanh thu trong 120 sản phẩm Shopee, kỳ 19/10/2026</div>`, ['L20_RANKING_WORD']] as const),
  ...['số 1 thị trường', 'tốt nhất', 'dẫn đầu ngành'].map(word => [word, `<p>Thương hiệu A ${word} về doanh thu trong 120 sản phẩm Shopee của mẫu, kỳ 20/09–19/10/2026.</p>`, word === 'tốt nhất' ? ['U13_SUPERLATIVE', 'L20_RANKING_WORD'] : ['L20_RANKING_WORD']] as const),
  ...['cao nhất', 'lớn nhất'].map(word => [word, `<p>Doanh thu ${word} trong 120 sản phẩm Shopee của mẫu, kỳ 20/09–19/10/2026.</p>`, ['U13_SUPERLATIVE']] as const),
] as const;
for (const [name, html, expected] of rankingRows) test(`R-L20 ${name}`, () => assert.deepEqual(bad(html), expected));
