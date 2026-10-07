import type { SourceLimitation } from './model.js';

/** Owner-facing outcome of one exact-Shopee review collection (#123). Pure: no I/O, no clock. */
export type ExactShopeeOutcome = 'PROVIDER_BLOCKED' | 'PROVIDER_TIMEOUT_NO_REVIEWS' | 'PARTIAL_LISTINGS' | 'OK';

export interface ExactShopeeListingCount { readonly listingUrl: string; readonly reviews: number }

export interface ExactShopeeOutcomeRecord {
  readonly outcome: ExactShopeeOutcome;
  readonly listings: readonly ExactShopeeListingCount[];
  /** Provider status message, at most 300 chars; null when reused or absent. Never shown to the reader. */
  readonly providerMessage: string | null;
  /** ISO time when collect() ended. */
  readonly attemptedAt: string;
  readonly reused: boolean;
}

export const EXACT_SHOPEE_OUTCOMES: readonly ExactShopeeOutcome[] = ['PROVIDER_BLOCKED', 'PROVIDER_TIMEOUT_NO_REVIEWS', 'PARTIAL_LISTINGS', 'OK'];
export const MAX_PROVIDER_MESSAGE_LENGTH = 300;

interface SelectedListing { readonly shopId: string; readonly itemId: string; readonly productUrl: string }

/** Rows per requested listing, matched by itemId (and shopId when the row has one) as strings. Unrequested rows are ignored. */
export function countReviewsPerListing(selected: readonly SelectedListing[], pages: readonly { readonly bytes: Buffer }[]): ExactShopeeListingCount[] {
  const counts = selected.map(() => 0);
  for (const page of pages) {
    const rows = JSON.parse(page.bytes.toString('utf8')) as unknown;
    if (!Array.isArray(rows)) throw new Error('Collection page is not a JSON array');
    for (const row of rows) {
      if (row === null || typeof row !== 'object') continue;
      const record = row as Record<string, unknown>;
      if (record.itemId === undefined || record.itemId === null) continue;
      const itemId = String(record.itemId);
      const shopId = record.shopId === undefined || record.shopId === null ? null : String(record.shopId);
      const index = selected.findIndex(listing => listing.itemId === itemId && (shopId === null || listing.shopId === shopId));
      if (index >= 0) counts[index]!++;
    }
  }
  return selected.map((listing, index) => ({ listingUrl: listing.productUrl, reviews: counts[index]! }));
}

const TIMEOUT_MESSAGE = /time limit|timed out/i;

/**
 * Rules in order: no rows and a timed-out run; no rows and a failed or aborted run;
 * some listings without rows; every listing with rows.
 * Edge case: no rows at all from a run that did not fail (SUCCEEDED, or a fixture)
 * also counts as PROVIDER_BLOCKED, because the reader still gets no reviews.
 */
export function classifyExactShopee(input: { readonly actorStatus: string; readonly statusMessage: string | null; readonly counts: readonly ExactShopeeListingCount[] }): ExactShopeeOutcome {
  const total = input.counts.reduce((sum, row) => sum + row.reviews, 0);
  if (total === 0) {
    if (input.actorStatus === 'TIMED-OUT' || (input.actorStatus === 'FAILED' && input.statusMessage !== null && TIMEOUT_MESSAGE.test(input.statusMessage)))
      return 'PROVIDER_TIMEOUT_NO_REVIEWS';
    return 'PROVIDER_BLOCKED';
  }
  return input.counts.some(row => row.reviews === 0) ? 'PARTIAL_LISTINGS' : 'OK';
}

const OUTCOME_CODES: Readonly<Record<Exclude<ExactShopeeOutcome, 'OK'>, string>> = {
  PROVIDER_BLOCKED: 'EXACT_SHOPEE_REVIEWS_BLOCKED',
  PROVIDER_TIMEOUT_NO_REVIEWS: 'EXACT_SHOPEE_REVIEWS_TIMEOUT',
  PARTIAL_LISTINGS: 'EXACT_SHOPEE_REVIEWS_PARTIAL',
};

/** The extra run-page limitation for a non-OK outcome; null when every listing has reviews. */
export function exactShopeeOutcomeLimitation(outcome: ExactShopeeOutcome, counts: readonly ExactShopeeListingCount[]): SourceLimitation | null {
  if (outcome === 'OK') return null;
  const withReviews = counts.filter(row => row.reviews > 0).length;
  return { provider: 'apify-shopee', code: OUTCOME_CODES[outcome],
    message: `${withReviews}/${counts.length} sản phẩm có đánh giá.${outcome === 'PARTIAL_LISTINGS' ? '' : ' Không tự chạy lượt tính phí khác.'}` };
}
