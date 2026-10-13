import assert from 'node:assert/strict';
import test from 'node:test';
import { sameCaptureProvenance, type AutomationMetricMethodSnapshot, type CaptureMetricMethodDetails } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { metricMethodSection } from '../../src/modules/analysis/research-automation/metric-method-report.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

const citations = { mark: () => '[1]' };
const SHA = 'a'.repeat(64);
const SAMPLE_REVENUE = '185'; // 100 + 50 + 25 + 0 + 10 in the synthetic fixture
const NO_FIGURE_SENTENCE = 'Không phải tổng của danh sách giữ bên dưới';

type Figure = { readonly value: string | null; readonly precision: 'exact' | 'display_rounded'; readonly locator: string };
const figure = (value: string | null, precision: Figure['precision'] = 'exact'): Figure => ({ value, precision, locator: 'response:/groups/W3_platformSplit/0/revenue/value' });

interface Fixture { readonly headlines: readonly { platform: 'shopee' | 'tiktok'; revenue: Figure; units: Figure | null }[] | null;
  readonly resultPlatforms?: readonly ('shopee' | 'tiktok')[] }
function captureSnapshot({ headlines, resultPlatforms = ['shopee', 'tiktok'] }: Fixture): AutomationMetricMethodSnapshot {
  const result = calculateMetricScopes(metricFixture());
  return { limitations: [], capture: { snapshotSha256: SHA,
    platforms: resultPlatforms.map(platform => ({ platform, result })),
    ...(headlines === null ? {} : { platformHeadlines: headlines }),
    unattributedRows: [],
    capture: { captureId: 'capture-synthetic-209', platforms: ['shopee', 'tiktok'],
      measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-29' },
      truncation: { cap: 3, totalShown: null, pagesRead: 1, rowsRead: 0, truncated: false } } } } as unknown as AutomationMetricMethodSnapshot;
}

test('a capture that reports per-platform revenue shows those figures instead of the retained sample sum', () => {
  const html = metricMethodSection(captureSnapshot({ headlines: [
    { platform: 'shopee', revenue: figure('1234567890'), units: figure('42000') },
    { platform: 'tiktok', revenue: figure('9876543210'), units: figure('999') },
  ] }), 'M03', undefined, citations);
  assert.match(html, /<h3>Shopee<\/h3><p>Doanh thu quan sát: <strong>1\.234\.567\.890 VND<\/strong> \[1\]; sản lượng: <strong>42\.000<\/strong> \[1\]\. Đây là số của cả tập kết quả theo bộ lọc trên trang\. Không phải tổng của danh sách giữ bên dưới\. /);
  assert.match(html, /<h3>TikTok Shop<\/h3><p>Doanh thu quan sát: <strong>9\.876\.543\.210 VND<\/strong> \[1\]; sản lượng: <strong>999<\/strong> \[1\]\./);
  assert.doesNotMatch(html, new RegExp(`Doanh thu quan sát: <strong>${SAMPLE_REVENUE} VND`));
});

test('every capture section uses the per-platform figures', () => {
  for (const sectionId of ['M03', 'M04'] as const) {
    const html = metricMethodSection(captureSnapshot({ headlines: [
      { platform: 'shopee', revenue: figure('1234567890'), units: null },
      { platform: 'tiktok', revenue: figure('9876543210'), units: null },
    ] }), sectionId, undefined, citations);
    assert.match(html, /<strong>1\.234\.567\.890 VND<\/strong>/);
    assert.match(html, /<strong>9\.876\.543\.210 VND<\/strong>/);
    assert.doesNotMatch(html, new RegExp(`Doanh thu quan sát: <strong>${SAMPLE_REVENUE} VND`));
  }
});

test('a capture platform figure keeps a missing value missing and a real zero a zero', () => {
  const html = metricMethodSection(captureSnapshot({ headlines: [{ platform: 'shopee', revenue: figure('0'), units: null }] }), 'M04', undefined, citations);
  assert.match(html, /Doanh thu quan sát: <strong>0 VND<\/strong> \[1\]; sản lượng: <strong>không có số liệu<\/strong>\. Đây là số của cả tập kết quả theo bộ lọc trên trang\./);
});

test('a rounded capture figure is labelled as the rounded page figure and cited', () => {
  const html = metricMethodSection(captureSnapshot({ headlines: [{ platform: 'shopee', revenue: figure('103300000', 'display_rounded'), units: null }] }), 'M03', undefined, citations);
  assert.match(html, /Doanh thu quan sát: <strong>103\.300\.000 VND<\/strong> <small>số làm tròn như trên trang<\/small> \[1\]/);
});

test('a capture figure for a declared platform without rows is still shown, and no zero is invented', () => {
  const html = metricMethodSection(captureSnapshot({ resultPlatforms: ['shopee'],
    headlines: [{ platform: 'tiktok', revenue: figure('777'), units: null }] }), 'M04', undefined, citations);
  assert.match(html, /<h3>TikTok Shop<\/h3><p>Doanh thu quan sát: <strong>777 VND<\/strong> \[1\]; sản lượng: <strong>không có số liệu<\/strong>\. Đây là số của cả tập kết quả theo bộ lọc trên trang\. Capture có chọn nền tảng này nhưng không có dòng nào gán được cho nền tảng; báo cáo không suy ra và không ghi thành 0\./);
  assert.doesNotMatch(html, new RegExp(NO_FIGURE_SENTENCE));
});

test('a capture without per-platform figures keeps the retained-sample sentence', () => {
  const html = metricMethodSection(captureSnapshot({ headlines: null }), 'M03', undefined, citations);
  assert.match(html, new RegExp(`<h3>Shopee</h3><p>Doanh thu quan sát: <strong>${SAMPLE_REVENUE} VND</strong>; sản lượng: <strong>23</strong>; 5 dòng, 3 gian hàng\\.`));
  assert.doesNotMatch(html, /cả tập kết quả theo bộ lọc trên trang/);
});

test('a capture platform without a usable revenue figure falls back to its retained rows, never to a blank figure', () => {
  const html = metricMethodSection(captureSnapshot({ headlines: [{ platform: 'shopee', revenue: figure(null, 'display_rounded'), units: figure('42000') }] }), 'M03', undefined, citations);
  assert.match(html, new RegExp(`<h3>Shopee</h3><p>Doanh thu quan sát: <strong>${SAMPLE_REVENUE} VND</strong>; sản lượng: <strong>23</strong>; 5 dòng, 3 gian hàng\\.`));
});

test('retained capture provenance replays: pre-figure snapshots keep their saved record and new ones must carry the figures', () => {
  const details = { provenance: 'RESULTS_PAGE_CAPTURE', snapshotSha256: SHA, manifestSha256: SHA, contextSha256: SHA, descriptorSha256: SHA,
    capture: { captureId: 'capture-synthetic-209' }, platforms: [], platformHeadlines: [{ platform: 'shopee', revenue: figure('1'), units: null }], unattributedRows: [] } as unknown as CaptureMetricMethodDetails;
  const { platformHeadlines: _figures, ...legacy } = details;
  const retained = legacy as CaptureMetricMethodDetails;
  assert.equal(sameCaptureProvenance(retained, details), true);
  assert.equal(sameCaptureProvenance(details, details), true);
  assert.equal(sameCaptureProvenance({ ...details, platformHeadlines: [] } as CaptureMetricMethodDetails, details), false);
  assert.equal(sameCaptureProvenance({ ...retained, capture: { captureId: 'capture-other' } } as CaptureMetricMethodDetails, details), false);
  assert.equal(sameCaptureProvenance({ ...retained, unattributedRows: [{ rowIndex: 0 }] } as unknown as CaptureMetricMethodDetails, details), false);
});
