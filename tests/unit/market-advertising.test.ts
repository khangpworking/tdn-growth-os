import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutomationMarketPresentation, marketPresentationDigest,
  type MarketPresentationBinding, type MarketPresentationInput } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { renderAutomationMarketAdvertising } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';

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
    revenue: { value: '500000', source: { identity: 'synthetic-ads-export-v1' } },
    adCost: { value: '100000', source: { identity: 'synthetic-ads-export-v1' } },
    orders: { value: '20', source: { identity: 'synthetic-ads-export-v1' } },
  });

  assert.match(html, /Kỳ: 2026-01-01 đến 2026-01-31/);
  assert.match(html, /Đối tượng: video: video tổng hợp/);
  assert.match(html, /ROAS: 5x · ước tính tham khảo/);
  assert.match(html, /CPA: 5\.000 VND\/đơn · ước tính tham khảo/);
  assert.match(html, /không suy ra lợi nhuận/);
  assert.match(html, /không so sánh kênh/);
});

test('Market output keeps ROAS and CPA unavailable without confirmed advertising fields', () => {
  const method = metricMethod();
  const html = buildResearchAutomationReport({
    run: { contractVersion: 'research-automation-run-v1', runId, workspaceId, createdAt: '2026-08-17T00:00:00.000Z', coverage: {}, usage: {} } as never,
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'synthetic', description: null,
      interview: null, requestedPeriod: { startDate: '2026-08-17', endDate: '2026-09-15', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic Market scope', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    collection: null, captures: [], marketPresentation: method,
  }, 'MARKET').html.toString();

  assert.match(html, /ROAS: chưa khả dụng/);
  assert.match(html, /CPA: chưa khả dụng/);
  assert.match(html, /Kỳ: 2026-08-17 đến 2026-09-15/);
  assert.match(html, /Đối tượng: video: chưa xác định trong đầu vào Market/);
  assert.match(html, /đầu vào Market chưa có trường chi phí quảng cáo và số đơn đã xác nhận/);
  assert.match(html, /không trộn với số liệu bán hàng từ nguồn khác/);
  assert.doesNotMatch(html, /Ad Spend|adSpend|adShare/);
});

test('advertising references remain unavailable when source identities or report scope are incomplete', () => {
  const base = {
    period: { start: '2026-01-01', end: '2026-01-31' }, object: { kind: 'shop' as const, label: 'Synthetic shop' },
    revenue: { value: '500000', source: { identity: 'source-a' } },
    adCost: { value: '100000', source: { identity: 'source-b' } },
    orders: { value: '20', source: { identity: 'source-a' } },
  };
  assert.match(renderAutomationMarketAdvertising(base), /ROAS: chưa khả dụng/);
  assert.match(renderAutomationMarketAdvertising({ ...base, period: null, adCost: { value: '100000', source: { identity: 'source-a' } } }), /CPA: chưa khả dụng/);
  assert.match(renderAutomationMarketAdvertising({ ...base, object: { kind: 'shop', label: ' ' }, adCost: { value: '100000', source: { identity: 'source-a' } } }), /ROAS: chưa khả dụng/);
});
