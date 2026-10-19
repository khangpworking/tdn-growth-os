import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';

const BUSINESS_CLOCK = '2026-10-19T00:00:00.000Z';

/** Minimal legacy and Insight controls: fixed ids, retained dates, no presentation dispatch. */
export function businessByteInput(): AutomationReportInput {
  const workspaceId = '11111111-1111-4111-8111-111111111111';
  const runId = '22222222-2222-4222-8222-222222222222';
  return {
    run: { runId, workspaceId, createdAt: BUSINESS_CLOCK, coverage: [], usage: {} },
    start: { workspaceId, country: 'VN', mode: 'CATEGORY', keyword: 'Sản phẩm mẫu', description: null, interview: null,
      requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET', 'INSIGHT'] },
    scope: { workspaceId, runId, definition: 'Phạm vi mẫu', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], testReviewCap: 20 },
    collection: { runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', coverage: [], limitations: [], comparables: [],
      productCards: [{ productId: 'shopee:101', title: 'Sản phẩm mẫu A' }],
      exactShopee: { collectionId: 'sample-byte-reviews', collectionSha256: 'a'.repeat(64), requestSha256: 'b'.repeat(64) },
      exactShopeeOutcome: { outcome: 'PARTIAL_LISTINGS', testReviewCap: 20,
        listings: [0, 7, 20].map((reviews, i) => ({ listingUrl: `https://shopee.vn/product/201/${101 + i}`, reviews })),
        attemptedAt: '2026-10-02T00:00:01.000Z', providerMessage: null, reused: false } }, captures: [],
  } as unknown as AutomationReportInput;
}
