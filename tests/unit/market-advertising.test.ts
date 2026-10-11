import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutomationMarketPresentation, marketPresentationDigest,
  type MarketPresentationBinding, type MarketPresentationInput } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { renderAutomationMarketAdvertising, renderAutomationMarketUnitPrices } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import type { ReportCitations } from '../../src/modules/analysis/research-automation/descriptive-report.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const citations: ReportCitations = { mark: () => '<sup>[1]</sup>' };

function metricMethod() {
  const metric = calculateMetricScopes(metricFixture());
  const binding: MarketPresentationBinding = {
    workspaceId, runId, previousPairId: 'a'.repeat(64), scopeSha256: 'b'.repeat(64),
    metric: { sourcePackage: { packageId: runId, manifestArtifactSha256: 'c'.repeat(64), packageContentSha256: 'd'.repeat(64) },
      workbookSha256: 'e'.repeat(64), resultSha256: marketPresentationDigest(metric) },
  };
  const input: MarketPresentationInput = { metric, rows: [], unitSpec: null };
  return buildAutomationMarketPresentation(binding, input);
}

test('confirmed same-source inputs render scoped estimated ROAS and CPA with the disclaimer', () => {
  const html = renderAutomationMarketAdvertising({
    period: { start: '2026-01-01', end: '2026-01-31' },
    object: { kind: 'video', label: 'video tổng hợp' },
    revenue: '500000', adCost: '100000', orders: '20', sourceConfirmed: true,
  });

  assert.match(html, /Kỳ: 2026-01-01 đến 2026-01-31/);
  assert.match(html, /Đối tượng: video: video tổng hợp/);
  assert.match(html, /ROAS: 5x · ước tính tham khảo/);
  assert.match(html, /CPA: 5\.000 VND\/đơn · ước tính tham khảo/);
  assert.match(html, /không suy ra lợi nhuận/);
  assert.match(html, /không so sánh kênh/);
});

test('Market output keeps ROAS and CPA unavailable without confirmed advertising fields', () => {
  const html = renderAutomationMarketUnitPrices(metricMethod(), citations);

  assert.match(html, /ROAS: chưa khả dụng/);
  assert.match(html, /CPA: chưa khả dụng/);
  assert.match(html, /Kỳ: 2026-08-17 đến 2026-09-15/);
  assert.match(html, /Đối tượng: video: chưa xác định trong đầu vào Market/);
  assert.match(html, /đầu vào Market chưa có trường chi phí quảng cáo và số đơn đã xác nhận/);
  assert.match(html, /không trộn với số liệu bán hàng từ nguồn khác/);
  assert.doesNotMatch(html, /Ad Spend|adSpend|adShare/);
});
