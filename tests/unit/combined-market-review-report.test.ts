import assert from 'node:assert/strict';
import test from 'node:test';
import type { MarketSnapshotResult } from '../../contracts/analysis/market-snapshot-result.generated.js';
import type { ShopeeReviewResult } from '../../contracts/analysis/shopee-review-result.generated.js';
import type { ShopeeCollection } from '../../contracts/foundation/shopee-collection.generated.js';
import type { ShopeeListingRequest } from '../../contracts/foundation/shopee-listing-request.generated.js';
import { renderCombinedMarketReviewReport, type CombinedMarketReviewReportInput } from '../../src/modules/analysis/combined-market-review-report.js';

const marketSha = 'a'.repeat(64);
const reviewSha = 'b'.repeat(64);
const collectionSha = 'c'.repeat(64);
const rawSha = 'd'.repeat(64);
const productKey = 'synthetic-product';
const listingKey = 'shopee:1:2';

const marketResult: MarketSnapshotResult = {
  contractVersion: '1.0.0',
  resultId: '00000000-0000-4000-8000-000000000001',
  calculationKey: 'market_snapshot_v1',
  calculationVersion: 1,
  completedAt: '2026-06-01T11:00:00.000Z',
  dataPack: { dataPackId: '00000000-0000-4000-8000-000000000002', packKey: 'synthetic-market', version: 1, manifestArtifactSha256: 'e'.repeat(64) },
  period: { scope: 'shopee-vn', start: '2026-05-01T00:00:00Z', end: '2026-05-31T23:59:59Z', grain: 'month' },
  coverage: { selectedObservationCount: 3, uniqueProductCount: 2, periodRevenueObservedProductCount: 1, periodUnitsSoldObservedProductCount: 2 },
  totals: { periodRevenueVndTotal: '900719925474099312345', periodUnitsSoldTotal: '0' },
  ignoredMetricCodes: [],
};

const request: ShopeeListingRequest = {
  contractVersion: '1.0.0', runKey: 'synthetic-022', topic: 'Canxi synthetic',
  period: { start: '2026-04-01T00:00:00Z', end: '2026-06-02T08:00:00Z' },
  source: { label: 'Synthetic source', acquiredAt: '2026-06-02T08:00:00Z' },
  listings: [],
};
const packet: ShopeeCollection = {
  contractVersion: '1.0.0', collectionId: '00000000-0000-4000-8000-000000000003', runKey: request.runKey,
  requestSha256: 'f'.repeat(64), createdAt: '2026-06-02T09:00:00Z', mode: 'fixture',
  selected: [{ platform: 'shopee', shopId: '1', itemId: '2', productKey, groupingBasis: 'synthetic', productName: 'Listing không liên kết', productUrl: 'https://shopee.vn/product/1/2', periodRevenueVnd: '10', revenuePrecision: 'exact' }],
  selectionWarnings: [], collectorWarnings: ['synthetic_partial'],
  actor: { actorId: 'zen-studio/shopee-product-reviews-scraper', settings: { maxReviewsPerProduct: 500, starFilter: 'all', contentFilter: 'all', maxChargeUsd: null }, inputSha256: '0'.repeat(64), runId: null, datasetId: null, buildId: null, status: 'FAILED', retrievedAt: '2026-06-02T08:30:00Z', providerTotalRows: null, usageTotalUsd: null, stopReason: 'actor_terminal_failed' },
  pages: [{ sha256: rawSha, byteSize: 2, offset: 0 }],
};
const reviewResult: ShopeeReviewResult = {
  contractVersion: '1.0.0', collectionId: packet.collectionId, collectionSha256: collectionSha,
  filterVersion: 'shopee-calcium-v3-adapter3', filterSha256: '1'.repeat(64), createdAt: '2026-06-03T08:00:00Z',
  summary: { mode: 'fixture', requestedProducts: 5, maxCommentsPerProduct: 500, selectedProducts: 1, collected: 1, kept: 1, removed: 0, invalidRows: 0, duplicateRows: 0, warnings: ['synthetic_partial'], listings: [{ productKey, listingKey, collected: 1, kept: 1, status: 'partial' }], fetchedRows: 1, providerReportedRows: null },
  reviews: [{ reviewId: 'rv-001', productKey, listingKey, text: 'Vị dễ uống | không bị tanh`\nDòng mới', content: 'Vị dễ uống', target: 'canxi', guidedFieldBoundary: 'ambiguous-preserved', signals: ['dễ uống'], noise: [], negative: [], score: 3, decision: 'kept', reason: 'synthetic', rawPageSha256: rawSha, rawRowIndex: 0 }],
};
const input: CombinedMarketReviewReportInput = {
  marketResultSha256: marketSha,
  marketResult,
  reviewResult: { result: reviewResult, resultSha256: reviewSha, collection: { packet, request, sha256: collectionSha, pages: [{ bytes: Buffer.from('[]'), sha256: rawSha, offset: 0 }] }, ratings: new Map([[`${listingKey}:rv-001`, 4]]) },
};

test('renders deterministic scoped composition from actual persisted Result and collection types', () => {
  const first = renderCombinedMarketReviewReport(input);
  assert.equal(first, renderCombinedMarketReviewReport(input));
  assert.match(first, /900719925474099312345/);
  assert.match(first, /Tổng đơn vị bán kỳ: \*\*0\*\*/);
  assert.match(first, /Thiếu metric theo sản phẩm: doanh thu 1; đơn vị bán 0/);
  assert.match(first, /Tham chiếu raw artifact digest: `d{64}`; row index: \*\*0\*\*/);
  assert.match(first, /Kỳ market không giới hạn ngày đăng review/);
  assert.match(first, /không nối theo tên tương tự/);
  assert.doesNotMatch(first, /sentiment tổng hợp|cơ hội thị trường:/i);
});


test('renders market string metadata as inert text using the Task 021 escaping rules', () => {
  const unsafe: CombinedMarketReviewReportInput = {
    ...input,
    marketResult: {
      ...input.marketResult,
      dataPack: { ...input.marketResult.dataPack, packKey: '<script>alert(1)</script>\n# injected ` heading &' },
      period: {
        ...input.marketResult.period,
        scope: '<img src=x onerror=alert(1)>\r\n- injected',
        start: '`start`',
        end: '<b>end</b>',
        grain: 'month | [link](javascript:alert(1))',
      },
    },
  };

  const report = renderCombinedMarketReviewReport(unsafe);
  assert.doesNotMatch(report, /<script>|<img|<b>/);
  assert.match(report, /&lt;script&gt;alert\(1\)&lt;\/script&gt;&#10;# injected ` heading &amp;/);
  assert.match(report, /&lt;img src=x onerror=alert\(1\)&gt;&#13;&#10;- injected/);
  assert.match(report, /`` `start` ``/);
  assert.match(report, /&lt;b&gt;end&lt;\/b&gt;/);
  assert.match(report, /`month \| \[link\]\(javascript:alert\(1\)\)`/);
});
