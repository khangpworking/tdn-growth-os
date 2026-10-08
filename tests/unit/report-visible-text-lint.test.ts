import assert from 'node:assert/strict';
import test from 'node:test';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
const bad = (html: string): string[] => lintVisibleReportText(html).filter(r => !r.ok).map(r => r.rule);
test('U13 inspects visible wording while preserving nested quotes and titles', () => {
  assert.deepEqual(bad('<h2>Tốt nhất</h2><p><span data-quote><b>rẻ nhất</b></span> Lời nguồn.</p><script>hàng đầu</script>'), []);
  assert.deepEqual(bad('<p>Sản phẩm tốt <b>nhất</b>.</p>'), ['U13_SUPERLATIVE']);
  assert.deepEqual(bad('<p>h&#224;ng đầu</p>'), ['U13_SUPERLATIVE']);
});
test('U13 requires explicit dependency for priority and a same-sentence draft label', () => {
  assert.deepEqual(bad('<p>Làm ngay bước này, tiếp theo bước kia.</p>'), ['U13_PRIORITY']);
  assert.deepEqual(bad('<section><p>Làm ngay bước này.</p><p>Tiếp theo bước kia.</p></section>'), ['U13_PRIORITY']);
  assert.deepEqual(bad('<p>Làm ngay xác minh; tiếp theo tính giá chỉ sau khi xác minh.</p>'), []);
  assert.deepEqual(bad('<p><span data-classified="pending">12,5%</span> trong mẫu. Phân loại đề xuất, chờ chủ duyệt.</p>'), ['U13_PENDING_NUMBER']);
  assert.deepEqual(bad('<p><span data-classified="pending">12.5%</span> trong mẫu (đề xuất, chờ chủ duyệt).</p>'), []);
  assert.deepEqual(bad('<table><tr><td data-classified="pending">12</td><td>đề xuất, chờ chủ duyệt</td></tr><tr><td data-classified="pending">2</td><td>chưa rõ</td></tr></table>'), ['U13_PENDING_NUMBER']);
});
