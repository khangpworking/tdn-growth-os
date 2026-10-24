/* Generated from automation-tiktok-shop-reviews.schema.json. Do not edit by hand. */

/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "skipReason".
 */
export type TikTokShopReviewsSkipReason =
  | 'FLAG_OFF'
  | 'NOT_INSIGHT_RUN'
  | 'CHANNEL_NOT_MAIN'
  | 'CHANNEL_SHARE_UNKNOWN'
  | 'NO_TIKTOK_PRODUCTS'
  | 'CREDIT_EXHAUSTED'
  | 'PROVIDER_FAILED';
/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "productId".
 */
export type ProductId = string;
/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "productOutcome".
 */
export type TikTokShopReviewsProductOutcome =
  | 'OK'
  | 'EMPTY'
  | 'FAILED'
  | 'AMBIGUOUS_NO_RETRY'
  | 'NOT_RUN_CREDIT_EXHAUSTED'
  | 'NOT_RUN_STOPPED'
  | 'NOT_RUN_CANCELLED';
/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "sha256".
 */
export type Sha256 = string;

/**
 * S06 normalized TikTok Shop product reviews of one run. Private: review text stays out of reports. Reviewer name, avatar, user id and every other personal field are removed. Counts are record counts, never people. Provider-AI points are the provider's own grouping, never this application's coding.
 */
export interface AutomationTikTokShopReviews {
  contractVersion: 'automation-tiktok-shop-reviews-v1';
  country: 'VN';
  status: 'COLLECTED' | 'PARTIAL' | 'SKIPPED' | 'FAILED';
  skipReason: null | TikTokShopReviewsSkipReason;
  counting: 'RECORDS_NOT_PEOPLE';
  /**
   * @maxItems 3
   */
  products: TikTokShopReviewsProduct[];
}
/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "product".
 */
export interface TikTokShopReviewsProduct {
  productId: ProductId;
  outcome: TikTokShopReviewsProductOutcome;
  responseSha256: null | Sha256;
  reviewCount: number;
  ratingAvailable: false;
  cachedAt: string | null;
  /**
   * @maxItems 2000
   */
  reviews: TikTokShopReview[];
  /**
   * @maxItems 150
   */
  points: TikTokShopReviewPoint[];
}
/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "review".
 */
export interface TikTokShopReview {
  id: ProductId;
  text: string | null;
  sku: string | null;
  dateRaw: string | null;
}
/**
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "point".
 */
export interface TikTokShopReviewPoint {
  kind: 'PAIN_POINT' | 'POSITIVE_POINT' | 'USAGE_SCENARIO';
  label: string;
  /**
   * @maxItems 2000
   */
  reviewIds: ProductId[];
  providerAiPoint: true;
}
/**
 * COLLECTION step pointer: counts and digests only, never review text.
 *
 * This interface was referenced by `AutomationTikTokShopReviews`'s JSON-Schema
 * via the `definition` "stepSummary".
 */
export interface StepTikTokShopReviews {
  profile: 'tiktok-shop-reviews-v1';
  status: 'COLLECTED' | 'PARTIAL' | 'SKIPPED' | 'FAILED';
  skipReason: null | TikTokShopReviewsSkipReason;
  documentSha256: null | Sha256;
  /**
   * @maxItems 3
   */
  products: {
    productId: ProductId;
    outcome: TikTokShopReviewsProductOutcome;
    captureIndex: number | null;
    reviewCount: number;
  }[];
}
