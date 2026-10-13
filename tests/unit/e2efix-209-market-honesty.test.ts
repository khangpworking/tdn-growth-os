import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCaptureFilterScope, MetricMethodFailure, type AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { marketSourceRows } from '../../src/modules/analysis/research-automation/reports.js';

type ReportInput = Parameters<typeof marketSourceRows>[0];
const failedWeb = { coverage: [{ provider: 'synthetic-web', dataset: 'web_discovery_current', state: 'FAILED', observedStartDate: null, observedEndDate: null, truncated: false, note: null }] };

function captureSnapshot(declared: readonly ('shopee' | 'tiktok')[]): AutomationMetricMethodSnapshot {
  return { limitations: [], capture: { platforms: [], unattributedRows: [], capture: { captureId: 'capture-synthetic-209', platforms: declared,
    measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-29' }, truncation: { cap: 3, totalShown: null, pagesRead: 1, rowsRead: 0, truncated: false } } } } as unknown as AutomationMetricMethodSnapshot;
}

test('capture section names a declared platform with no rows instead of dropping it', () => {
  const html = metricMethodSection(captureSnapshot(['shopee', 'tiktok']), 'M03', undefined, { mark: () => '[1]' });
  assert.match(html, /TikTok Shop: <strong>không có số liệu<\/strong> trong lượt này/);
  assert.match(html, /Shopee: <strong>không có số liệu<\/strong> trong lượt này/);
});

test('Market appendix source rows reflect what the run actually used', () => {
  const rows = (input: Partial<ReportInput>, web = 0, failed = false) => new Map(marketSourceRows(input as ReportInput, web, failed));
  const empty = rows({});
  assert.equal(empty.get('Dữ liệu bán hàng'), 'Chưa có trong lượt này.');
  assert.equal(empty.get('Kết quả tìm kiếm'), 'Chưa có trong lượt này.');
  assert.match(rows({ metricMethodsFailure: 'METRIC_METHOD_FAILED' }).get('Dữ liệu bán hàng')!, /Không dùng được/);
  assert.match(rows({ metricMethods: captureSnapshot(['shopee', 'tiktok']) }).get('Dữ liệu bán hàng')!, /Dùng một phần: không có số liệu cho Shopee, TikTok Shop/);
  assert.equal(rows({}, 4).get('Kết quả tìm kiếm'), 'Đã lưu 4 kết quả trong lượt này.');
  assert.match(rows({ collection: failedWeb } as unknown as Partial<ReportInput>, 0, true).get('Kết quả tìm kiếm')!, /không phản hồi kịp/);
  assert.match(rows({ nativeReviewFailure: 'NATIVE_REVIEW_METHOD_FAILED', reviewCorpusFailure: 'REVIEW_CORPUS_FAILED' }).get('Bình luận đã thu thập')!, /Không dùng được/);
  for (const [, status] of rows({ metricMethods: captureSnapshot(['shopee']) }, 2)) assert.doesNotMatch(status, /Metric|Kalodata|SerpApi|Apify/i);
});

test('capture page filters must match the confirmed scope', () => {
  const scope = { excludeTerms: ['Nắp Thay Thế'] };
  const mismatch = (error: unknown) => error instanceof MetricMethodFailure && error.code === 'METRIC_SOURCE_RUN_MISMATCH';
  assert.doesNotThrow(() => assertCaptureFilterScope({ advancedFilters: [], exclusions: ['nắp thay thế '] }, scope));
  assert.doesNotThrow(() => assertCaptureFilterScope({ advancedFilters: [{ label: 'Giá' }], exclusions: [] }, null));
  // A confirmed exclusion the page did not apply would leave excluded rows in the figures.
  assert.throws(() => assertCaptureFilterScope({ advancedFilters: [], exclusions: [] }, scope), mismatch);
  for (const captured of [{ advancedFilters: [{ label: 'Giá' }], exclusions: ['nắp thay thế'] }, { advancedFilters: [], exclusions: ['nắp thay thế', 'hàng cũ'] }])
    assert.throws(() => assertCaptureFilterScope(captured, scope), mismatch);
});
