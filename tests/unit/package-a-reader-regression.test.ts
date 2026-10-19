import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildMarketReport, computeReaderReportData } from '../../src/modules/analysis/reader-report/index.js';
import { CAPTURE_ROW_PROFILE, type CaptureRowExclusionReason } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import { sync1ReaderFixture } from '../helpers/sync1-reader-fixture.js';

const filter = 'Bộ lọc mẫu: loại phụ kiện, linh kiện, sản phẩm khác và dòng có doanh thu hoặc đơn vị bán bất thường khỏi mẫu tính. Bộ lọc mẫu do hệ thống áp dụng trên bảng kết quả đã lưu.';
const text = (node: Element) => node.textContent!.replace(/\s+/gu, ' ').trim();
for (const [shopee, tiktok] of [[2, 1], [1, 4], [2, 0]] as const) test(`public v3 Phần 2 discloses the filter and independent removals ${shopee}/${tiktok}`, async t => {
  const reasons: CaptureRowExclusionReason[] = ['NOT_MAIN_PRODUCT', 'REVENUE_WITHOUT_UNITS', 'UNIT_REVENUE_OUTLIER'];
  const captureExcludedRows = [['shopee', shopee], ['tiktok', tiktok]].flatMap(([platform, count]) =>
    Array.from({ length: Number(count) }, (_, i) => ({ platform: String(platform), reason: reasons[i % reasons.length]! })));
  const built = await buildMarketReport(computeReaderReportData(sync1ReaderFixture()), {
    builtOn: '01/02/2026', flint: false, captureSource: true, captureRowPolicy: CAPTURE_ROW_PROFILE, limitations: [], captureExcludedRows,
  });
  const dom = new JSDOM(built.html);
  t.after(() => dom.window.close());
  const section = dom.window.document.querySelector('#phan-2');
  assert.ok(section, 'public Phần 2 is present');
  const paragraphs = [...section.querySelectorAll('p')].map(text);
  assert.ok(paragraphs.includes(filter));
  const countLines = paragraphs.filter(line => /dòng đã loại khỏi mẫu tính toán/u.test(line));
  assert.deepEqual(countLines, [
    `Shopee: ${shopee} dòng đã loại khỏi mẫu tính toán.`,
    `TikTok Shop: ${tiktok === 0 ? 'không có' : tiktok} dòng đã loại khỏi mẫu tính toán.`,
  ]);
  assert.doesNotMatch(text(section), /%/u);
  const rest = text(section).replaceAll(countLines[0]!, '').replaceAll(countLines[1]!, '');
  assert.doesNotMatch(rest, /\d+\s+dòng.*(?:loại|lọc)|(?:tổng|gộp|cộng).*\d+\s+dòng/iu, 'no cross-platform removed-row total');
  if (tiktok === 0) {
    assert.ok(countLines.includes('TikTok Shop: không có dòng đã loại khỏi mẫu tính toán.'));
    assert.doesNotMatch(countLines.join(' '), /(?<![\d.,])0(?![\d.,])/u, 'empty state has no bare zero');
  }
  const m03 = dom.window.document.querySelector('#phan-3');
  assert.ok(m03);
  assert.ok(text(m03).includes('1 dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét'));
  if (shopee > 1) assert.ok(text(m03).includes('1 dòng có doanh thu hoặc đơn vị bán bất thường'));
});
