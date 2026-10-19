/* Generated from shopee-public-rows.schema.json. Do not edit by hand. */

/**
 * @maxItems 1500
 */
export type ShopeePublicRows = {
  reviewId: string | null;
  shopId: string;
  itemId: string;
  postedAtLocal: string | null;
  createdAt: string | null;
  variation: string | null;
  ratingStar: number | null;
  ratingState: 'VALID' | 'MISSING' | 'INVALID';
  comment: string | null;
  /**
   * @maxItems 100
   */
  attributes: string[];
  contentType: 'COMMENT' | 'ATTRIBUTES_ONLY' | 'UNRESOLVED';
  sourcePage: number | null;
  sourceUrl: string;
  sourceRow: number;
  /**
   * @maxItems 10
   */
  admissionReasons: (
    | 'INVALID_REVIEW_ID'
    | 'UNREADABLE_COMMENT'
    | 'INVALID_ATTRIBUTES'
    | 'INCONSISTENT_CONTENT_TYPE'
    | 'INVALID_SOURCE_PAGE'
    | 'SOURCE_TIME_NOT_PARSED'
    | 'INVALID_VARIATION'
    | 'INVALID_SOURCE_TIME'
  )[];
}[];
