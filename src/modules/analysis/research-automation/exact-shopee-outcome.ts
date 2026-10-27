import type { SourceLimitation } from './model.js';

/** Owner-facing outcome of one exact-Shopee review collection (#123). Pure: no I/O, no clock. */
export type ExactShopeeOutcome = 'SHOPEE_LOGIN_REQUIRED' | 'SHOPEE_VERIFICATION_REQUIRED' | 'SHOPEE_COLLECTOR_DOWN'
  | 'PROVIDER_BLOCKED' | 'PROVIDER_TIMEOUT_NO_REVIEWS' | 'PARTIAL_LISTINGS' | 'OK';
export const TARGET_REVIEWS = 300 as const;
export const SHORTFALL_REASON = 'RETURNED_COUNT_BELOW_REQUESTED' as const;

export interface ExactShopeeListingCount {
  readonly listingUrl: string;
  readonly reviews: number;
  /** Present on newly stored outcomes whenever the fixed target was not met. */
  readonly shortfallReason?: typeof SHORTFALL_REASON;
}

export interface ExactShopeeOutcomeRecord {
  readonly testReviewCap?: number;
  readonly outcome: ExactShopeeOutcome;
  readonly listings: readonly ExactShopeeListingCount[];
  /** Provider status message, at most 300 chars; null when reused or absent. Never shown to the reader. */
  readonly providerMessage: string | null;
  /** ISO time when collect() ended. */
  readonly attemptedAt: string;
  readonly reused: boolean;
}

export const EXACT_SHOPEE_OUTCOMES: readonly ExactShopeeOutcome[] = ['SHOPEE_LOGIN_REQUIRED', 'SHOPEE_VERIFICATION_REQUIRED', 'SHOPEE_COLLECTOR_DOWN',
  'PROVIDER_BLOCKED', 'PROVIDER_TIMEOUT_NO_REVIEWS', 'PARTIAL_LISTINGS', 'OK'];
/** Outcomes that name a repairable Shopee source condition; only these offer owner repair on the run page. */
export const SHOPEE_REPAIRABLE_OUTCOMES: readonly ExactShopeeOutcome[] = ['SHOPEE_LOGIN_REQUIRED', 'SHOPEE_VERIFICATION_REQUIRED', 'SHOPEE_COLLECTOR_DOWN'];
export const MAX_PROVIDER_MESSAGE_LENGTH = 300;

interface SelectedListing { readonly shopId: string; readonly itemId: string; readonly productUrl: string }

/** Provider review identity, admitted exactly as the review corpus admits it: a non-empty review id, text or positive integer. */
function hasReviewIdentity(record: Record<string, unknown>): boolean {
  const reviewId = record.reviewId;
  return (typeof reviewId === 'string' && reviewId.trim() !== '' && reviewId.length <= 2000) ||
    (typeof reviewId === 'number' && Number.isSafeInteger(reviewId) && reviewId > 0);
}

/**
 * Reviews per requested listing, matched by itemId and shopId as strings. Unrequested rows are ignored.
 * Only rows carrying a review identity count: the provider also returns one status row per listing when it
 * collects nothing, and that row has listing ids without a `reviewId`, so counting it would report a review
 * the provider never returned.
 */
export function countReviewsPerListing(selected: readonly SelectedListing[], pages: readonly { readonly bytes: Buffer }[]): ExactShopeeListingCount[] {
  const counts = selected.map(() => 0);
  for (const page of pages) {
    const rows = JSON.parse(page.bytes.toString('utf8')) as unknown;
    if (!Array.isArray(rows)) throw new Error('Collection page is not a JSON array');
    for (const row of rows) {
      if (row === null || typeof row !== 'object' || Array.isArray(row)) continue;
      const record = row as Record<string, unknown>;
      if (!hasReviewIdentity(record) || record.itemId === undefined || record.itemId === null ||
        record.shopId === undefined || record.shopId === null) continue;
      const itemId = String(record.itemId);
      const shopId = String(record.shopId);
      const index = selected.findIndex(listing => listing.itemId === itemId && listing.shopId === shopId);
      if (index >= 0) counts[index]!++;
    }
  }
  return selected.map((listing, index) => ({ listingUrl: listing.productUrl, reviews: counts[index]! }));
}

/** Adds the fixed per-product target and a durable reason for every short set. */
export function markReviewShortfalls(counts: readonly ExactShopeeListingCount[], targetReviews: number = TARGET_REVIEWS): ExactShopeeListingCount[] {
  return counts.map(row => row.reviews < targetReviews ? { ...row, shortfallReason: SHORTFALL_REASON } : row);
}

const TIMEOUT_MESSAGE = /time limit|timed out/i;

/**
 * Rules in order: no rows and a timed-out run; no rows and a failed or aborted run;
 * some listings without rows; every listing with rows.
 * Edge case: no rows at all from a run that did not fail (SUCCEEDED, or a fixture)
 * also counts as PROVIDER_BLOCKED, because the reader still gets no reviews.
 */
export function classifyExactShopee(input: { readonly actorStatus: string; readonly statusMessage: string | null; readonly counts: readonly ExactShopeeListingCount[]; readonly targetReviews?: number }): ExactShopeeOutcome {
  const total = input.counts.reduce((sum, row) => sum + row.reviews, 0);
  if (total === 0) {
    if (input.actorStatus === 'TIMED-OUT' || (input.actorStatus === 'FAILED' && input.statusMessage !== null && TIMEOUT_MESSAGE.test(input.statusMessage)))
      return 'PROVIDER_TIMEOUT_NO_REVIEWS';
    return 'PROVIDER_BLOCKED';
  }
  return input.counts.some(row => row.reviews === 0 || (input.targetReviews !== undefined && row.reviews < input.targetReviews)) ? 'PARTIAL_LISTINGS' : 'OK';
}

const OUTCOME_CODES: Readonly<Record<Exclude<ExactShopeeOutcome, 'OK'>, string>> = {
  SHOPEE_LOGIN_REQUIRED: 'SHOPEE_LOGIN_REQUIRED',
  SHOPEE_VERIFICATION_REQUIRED: 'SHOPEE_VERIFICATION_REQUIRED',
  SHOPEE_COLLECTOR_DOWN: 'SHOPEE_COLLECTOR_DOWN',
  PROVIDER_BLOCKED: 'EXACT_SHOPEE_REVIEWS_BLOCKED',
  PROVIDER_TIMEOUT_NO_REVIEWS: 'EXACT_SHOPEE_REVIEWS_TIMEOUT',
  PARTIAL_LISTINGS: 'EXACT_SHOPEE_REVIEWS_PARTIAL',
};

/** Plain-Vietnamese source error for the three named Shopee repair outcomes; null for every other outcome. */
export function publicExactShopeeOutcomeMessage(outcome: ExactShopeeOutcome): string | null {
  if (outcome === 'SHOPEE_LOGIN_REQUIRED') return 'Nguồn đánh giá Shopee: bộ thu mất đăng nhập Shopee nên chưa lấy được đánh giá. Vào trang lần chạy, bấm «Đăng nhập Shopee», rồi «Thu lại đánh giá».';
  if (outcome === 'SHOPEE_VERIFICATION_REQUIRED') return 'Nguồn đánh giá Shopee: Shopee yêu cầu xác minh phiên đăng nhập nên chưa lấy được đánh giá. Vào trang lần chạy, bấm «Đăng nhập Shopee», rồi «Thu lại đánh giá».';
  if (outcome === 'SHOPEE_COLLECTOR_DOWN') return 'Nguồn đánh giá Shopee: bộ thu đánh giá Shopee không phản hồi nên chưa lấy được đánh giá. Hệ thống không tự chạy lại; kiểm tra bộ thu rồi mở lại trang lần chạy.';
  return null;
}

/** The run-page limitation for a public-review collection; the named source error is never generic. */
export function publicExactShopeeOutcomeLimitation(outcome: ExactShopeeOutcome): SourceLimitation | null {
  const message = publicExactShopeeOutcomeMessage(outcome);
  return message === null ? null : { provider: 'shopee-public-review', code: OUTCOME_CODES[outcome as Exclude<ExactShopeeOutcome, 'OK'>], message };
}

/** The extra run-page limitation for a non-OK outcome; null when every listing has reviews. */
export function exactShopeeOutcomeLimitation(outcome: ExactShopeeOutcome, counts: readonly ExactShopeeListingCount[], targetReviews?: number): SourceLimitation | null {
  if (outcome === 'OK') return null;
  const named = publicExactShopeeOutcomeLimitation(outcome);
  if (named) return named;
  if (targetReviews !== undefined && targetReviews <= 20) return { provider: 'apify-shopee', code: OUTCOME_CODES[outcome],
    message: `Chưa thu đủ giới hạn thử ${targetReviews} đánh giá cho mọi sản phẩm. Đây là mẫu thử nhỏ, không đại diện cho toàn bộ đánh giá; không tự thu lại.` };
  const withReviews = counts.filter(row => row.reviews > 0).length;
  const short = counts.filter(row => row.shortfallReason !== undefined || row.reviews === 0);
  return { provider: 'apify-shopee', code: OUTCOME_CODES[outcome],
    message: `${withReviews}/${counts.length} sản phẩm có đánh giá.${outcome === 'PARTIAL_LISTINGS'
      ? targetReviews !== undefined ? ` Có ${short.length} sản phẩm chưa đạt mốc ${targetReviews} bình luận (${short.map(row => `${row.reviews}/${targetReviews}`).join(', ')}).`
        : ''
      : ' Không tự chạy lượt tính phí khác.'}` };
}

/**
 * Public source classification trusts only verified receipts and scoped admitted counts.
 * Login and verification win over every other receipt, so a partly collected listing set
 * still names the repairable Shopee condition. A stopped collector is named separately;
 * only unrelated provider failures keep the generic PROVIDER_BLOCKED outcome.
 */
export function classifyPublicExactShopee(input: { receipts: readonly import('../../../platform/collectors/shopee-public-reviews.js').PublicReviewReceipt[]; counts: readonly ExactShopeeListingCount[]; maxReviewsPerProduct: number }): ExactShopeeOutcome {
  const codes = input.receipts.flatMap(r => r.stopCode === null ? [] : [r.stopCode]);
  const states = new Set(input.receipts.map(r => r.state));
  if (codes.includes('HUMAN_LOGIN_REQUIRED') || states.has('needs_login')) return 'SHOPEE_LOGIN_REQUIRED';
  if (codes.includes('HUMAN_VERIFICATION_REQUIRED') || states.has('needs_verification')) return 'SHOPEE_VERIFICATION_REQUIRED';
  if (codes.includes('HEALTH_NOT_READY')) return 'SHOPEE_COLLECTOR_DOWN';
  const hard = (code: string | null) => code !== null && (['SHOPEE_REVIEW_INVALID_RESPONSE','SHOPEE_REVIEW_LIMIT','CREDENTIAL_ECHO_REFUSED'].includes(code) || /^SHOPEE_REVIEW_HTTP_(?:[34]\d\d)$/.test(code));
  if (input.receipts.some(r => hard(r.stopCode))) return 'PROVIDER_BLOCKED';
  const total = input.counts.reduce((n, r) => n + r.reviews, 0);
  if (!total) return input.receipts.some(r => r.timedOut) ? 'PROVIDER_TIMEOUT_NO_REVIEWS' : 'PROVIDER_BLOCKED';
  return input.receipts.length === input.counts.length && input.receipts.every((r, i) => r.state === 'succeeded' && r.stopCode === null && r.complete && ['record_limit','expected_count_reached','last_page'].includes(r.stopReason) && input.counts[i]!.reviews >= input.maxReviewsPerProduct) ? 'OK' : 'PARTIAL_LISTINGS';
}
