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

// All counts below come from the shared projection, with distinct synthetic products.
for (const [first, second] of [[2, 1], [0, 0], [0, 4]] as const) test(`actual method-c membership renders ${first}/${second}, uncertainty and per-platform M03 reasons`, async t => {
  const { inventedProducts, normalRow, methodCArchive } = await import('../helpers/method-c-fixture.js');
  const { retainedRelevance } = await import('../helpers/capture-relevance-fixture.js');
  const { readCaptureRelevanceRecord } = await import('../../src/modules/analysis/research-automation/capture-relevance.js');
  const { readerRowsFromMetricCapture } = await import('../../src/modules/analysis/reader-report/metric-capture-rows.js');
  const { providerNameViolations } = await import('../helpers/report-visible-text.js');
  const keywords = inventedProducts.map(p => p.keyword);
  const rows = ['shopee', 'tiktok'].flatMap(platform => inventedProducts.map(p => ({ ...normalRow(p.accessory), platform })));
  // Give each platform different exact title bytes to retain independent decisions.
  const distinct = [...rows.map((r, i) => ({ ...r, title: `${r.title} mẫu ${i}` })),
    ...['shopee', 'tiktok'].flatMap(platform => inventedProducts.map(p => ({ ...normalRow(`${p.keyword} retained`), platform })))];
  const records = keywords.map(keyword => retainedRelevance(distinct, keyword, title => {
    const i = distinct.findIndex(r => r.title === title);
    return i < 8 && i % 4 < (i < 4 ? first : second) ? 'NOT_MAIN' : null;
  }));
  const record = readCaptureRelevanceRecord({ ...records[0]!, decisions: records.flatMap(p => p.decisions) }, distinct, keywords);
  const archive = await methodCArchive(keywords[0]!, distinct);
  archive.snapshot.scope.keywords = [keywords[0]!, keywords[1]!, keywords[2]!, keywords[3]!];
  const projection = readerRowsFromMetricCapture(archive.snapshot, ['shopee', 'tiktok'], CAPTURE_ROW_PROFILE, record);
  assert.deepEqual(['shopee', 'tiktok'].map(platform => projection.excluded.filter(r => r.platform === platform).length), [first, second]);
  const limitation = 'Những tiêu đề AI chưa phân loại được hoặc còn chưa chắc chắn vẫn được giữ trong mẫu.';
  const limitations = ['Synthetic retained limitation'];
  for (const policy of [undefined, 'automation-metric-capture-v2', CAPTURE_ROW_PROFILE] as const) {
    const built = await buildMarketReport(computeReaderReportData({ ...sync1ReaderFixture(), rows: projection.rows }), {
      builtOn: '01/02/2026', flint: false, captureSource: true, limitations, captureExcludedRows: projection.excluded,
      ...(policy ? { captureRowPolicy: policy } : {}),
    });
    assert.deepEqual(limitations, ['Synthetic retained limitation']);
    assert.equal(built.html.split(limitation).length - 1, policy === CAPTURE_ROW_PROFILE ? 1 : 0);
    const dom = new JSDOM(built.html); t.after(() => dom.window.close());
    const section = dom.window.document.querySelector('#phan-2')!;
    assert.deepEqual(providerNameViolations(text(section)), []);
    if (policy !== CAPTURE_ROW_PROFILE) continue;
    const lines = [...section.querySelectorAll('p')].map(text).filter(line => /dòng đã loại khỏi mẫu tính toán/u.test(line));
    assert.deepEqual(lines, [`Shopee: ${first || 'không có'} dòng đã loại khỏi mẫu tính toán.`, `TikTok Shop: ${second || 'không có'} dòng đã loại khỏi mẫu tính toán.`]);
    assert.ok(text(section).includes(filter));
    assert.doesNotMatch(text(section), /%|(?:tổng|gộp|cộng).*\d+\s+dòng/iu);
    const m03 = text(dom.window.document.querySelector('#phan-3')!);
    for (const count of [first, second]) if (count) assert.ok(m03.includes(`${count} dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét`));
    if (!first && !second) assert.doesNotMatch(m03, /dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét/u);
  }
});
