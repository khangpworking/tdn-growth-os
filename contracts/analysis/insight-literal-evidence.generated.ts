/* Generated from insight-literal-evidence.schema.json. Do not edit by hand. */

export type Uuid = string;
export type Digest = string;
export type Review = {
  [k: string]: unknown;
} & {
  sourceKind: 'EXACT_SHOPEE' | 'NATIVE_SHOPEE';
  text: string | null;
  textState: 'READABLE' | 'EMPTY' | 'UNREADABLE';
  rating: Rating;
  admitted: boolean;
  /**
   * @minItems 0
   * @maxItems 8
   */
  exclusionReasons: (
    | 'UNRESOLVED_CONFLICT'
    | 'WRONG_LISTING'
    | 'UNRESOLVED_LISTING'
    | 'NON_REVIEW_ROW'
    | 'UNRESOLVED_ROW_TYPE'
    | 'NATIVE_ID_TEXT_CONFLICT'
    | 'NATIVE_ID_RATING_CONFLICT'
    | 'NATIVE_ID_LISTING_CONFLICT'
  )[];
  /**
   * @minItems 1
   * @maxItems 512
   */
  sourceRefs: SourceRef[];
};
export type Rating = {
  [k: string]: unknown;
} & {
  fieldPresent: boolean;
  state: 'ABSENT' | 'MISSING' | 'INVALID' | 'VALID';
  value: number | null;
};
export type Pointer = string;
export type Count = number;
export type ReviewPointer = string;
/**
 * @minItems 0
 * @maxItems 10000
 */
export type ReviewPointers = ReviewPointer[];
export type Stars = {
  [k: string]: unknown;
} & {
  state: 'NO_USABLE_RECORDS' | 'SOURCE_FIELD_ABSENT' | 'AVAILABLE';
  /**
   * @minItems 0
   * @maxItems 5
   */
  bins: {
    value: number;
    recordCount: Count;
    recordPointers: ReviewPointers;
  }[];
  absentField: CountedRecords;
  missingValue: CountedRecords;
  invalidValue: CountedRecords;
  textlessUnknown: CountedRecords;
  unreadableText: CountedRecords;
};
export type SellerLayer = {
  [k: string]: unknown;
} & {
  state: 'AVAILABLE' | 'UNAVAILABLE';
  /**
   * @minItems 0
   * @maxItems 10000
   */
  statementPointers: string[];
  /**
   * @minItems 0
   * @maxItems 1
   */
  blockers: 'TYPED_RETAINED_SELLER_SOURCE_REQUIRED'[];
  /**
   * @minItems 0
   * @maxItems 0
   */
  customerCodingMembership: string[];
};

/**
 * Versioned source-bound literal Insight output. Stars are source ratings, never text sentiment; identical text preserves distinct admitted locators; typed retained listing voice never enters customer coding. Owning-service exact source replay is required in addition to schema validation.
 */
export interface InsightLiteralEvidence {
  contractVersion: 'insight-literal-evidence-v1';
  methodId: 'insight-literal-evidence';
  methodVersion: '1.0.0';
  input: Input;
  methodOutputId: Digest;
  selectedRecordCount: Count;
  selectedRecordPointers: ReviewPointers;
  excludedRecordPointers: ReviewPointers;
  stars: Stars;
  /**
   * @minItems 0
   * @maxItems 10000
   */
  duplicateTexts: DuplicateText[];
  sellerLayer: SellerLayer;
  /**
   * @minItems 5
   * @maxItems 5
   */
  limitations: (
    | 'SOURCE_RECORDS_NOT_UNIQUE_PEOPLE'
    | 'STARS_NOT_TEXT_SENTIMENT'
    | 'SELLER_WORDING_NOT_CUSTOMER_EVIDENCE'
    | 'NO_SELLER_TARGET_INFERENCE_OR_CROSS_PLATFORM_JOIN'
    | 'RETAINED_FIELD_PROVENANCE_NOT_SELLER_AUTHENTICITY'
  )[];
}
export interface Input {
  binding: {
    workspaceId: Uuid;
    runId: Uuid;
    scopeSha256: Digest;
    previousPairId: Digest;
  };
  /**
   * @minItems 0
   * @maxItems 10000
   */
  reviews: Review[];
  /**
   * @minItems 0
   * @maxItems 10000
   */
  sellerStatements: Seller[];
}
export interface SourceRef {
  sourceSha256: Digest;
  rowLocator: Pointer;
  textLocator: Pointer | null;
  ratingLocator: Pointer;
}
export interface Seller {
  voice: 'SELLER';
  platform: 'TIKTOK_SHOP';
  productId: string;
  sourceType: 'LISTING_TITLE' | 'LISTING_DESCRIPTION';
  text: string;
  sourceSha256: Digest;
  responseSha256: Digest;
  locator: Pointer;
  period: {
    startDate: string;
    endDate: string;
  };
  retrievedAt: string;
}
export interface CountedRecords {
  recordCount: Count;
  recordPointers: ReviewPointers;
}
export interface DuplicateText {
  textSha256: Digest;
  /**
   * @minItems 2
   * @maxItems 10000
   */
  recordPointers: ReviewPointer[];
  label: 'trùng nguyên văn, có thể cùng một người';
}
