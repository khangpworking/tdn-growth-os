/* Generated from shopee-public-collection.schema.json. Do not edit by hand. */

/**
 * @maxItems 2005
 */
export type SelectionWarnings = string[];
/**
 * @maxItems 100
 */
export type CollectorWarnings = string[];
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

export interface ShopeePublicCollection {
  contractVersion: '4.0.0';
  selectionBasis: 'OWNER_EXACT_URL';
  collectionId: string;
  runKey: string;
  requestSha256: string;
  createdAt: string;
  mode: 'fixture' | 'live';
  /**
   * @minItems 1
   * @maxItems 5
   */
  selected: {
    platform: 'shopee';
    shopId: string;
    itemId: string;
    productUrl: string;
    submittedUrl: string;
  }[];
  selectionWarnings: SelectionWarnings;
  collectorWarnings: CollectorWarnings;
  /**
   * @maxItems 5
   */
  pages: {
    sha256: string;
    byteSize: number;
    offset: number;
  }[];
  confirmedSourceSetSha256: string;
  mappingRevision: 'shopee-public-review-row-v1';
  providerId: 'shopee-public-review';
  maxReviewsPerProduct: number;
  usageTotalUsd: 0;
  /**
   * @maxItems 5
   */
  listings: Receipt[];
  attemptedAt: string;
  reused: boolean;
}
/**
 * This interface was referenced by `ShopeePublicCollection`'s JSON-Schema
 * via the `definition` "receipt".
 */
export interface Receipt {
  productUrl: string;
  shopId: string;
  itemId: string;
  inputSha256: string;
  jobId: string | null;
  state:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'partial'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
    | 'needs_login'
    | 'needs_verification'
    | 'NOT_SUBMITTED'
    | 'HEALTH_NOT_READY'
    | 'SUBMISSION_UNCERTAIN'
    | 'HUMAN_LOGIN_REQUIRED'
    | 'HUMAN_VERIFICATION_REQUIRED'
    | 'DEADLINE'
    | 'OWNER_ABORTED'
    | 'SHOPEE_REVIEW_TIMEOUT'
    | 'SHOPEE_REVIEW_TRANSPORT'
    | 'SHOPEE_REVIEW_INVALID_RESPONSE'
    | 'SHOPEE_REVIEW_LIMIT'
    | 'CREDENTIAL_ECHO_REFUSED'
    | 'SHOPEE_REVIEW_HTTP_301'
    | 'SHOPEE_REVIEW_HTTP_302'
    | 'SHOPEE_REVIEW_HTTP_303'
    | 'SHOPEE_REVIEW_HTTP_307'
    | 'SHOPEE_REVIEW_HTTP_308'
    | 'SHOPEE_REVIEW_HTTP_400'
    | 'SHOPEE_REVIEW_HTTP_401'
    | 'SHOPEE_REVIEW_HTTP_403'
    | 'SHOPEE_REVIEW_HTTP_404'
    | 'SHOPEE_REVIEW_HTTP_409'
    | 'SHOPEE_REVIEW_HTTP_422'
    | 'SHOPEE_REVIEW_HTTP_429'
    | 'SHOPEE_REVIEW_HTTP_500'
    | 'SHOPEE_REVIEW_HTTP_502'
    | 'SHOPEE_REVIEW_HTTP_503'
    | 'SHOPEE_REVIEW_HTTP_504'
    | 'SHOPEE_REVIEW_HTTP_5XX';
  stopCode:
    | (
        | 'NOT_SUBMITTED'
        | 'HEALTH_NOT_READY'
        | 'SUBMISSION_UNCERTAIN'
        | 'HUMAN_LOGIN_REQUIRED'
        | 'HUMAN_VERIFICATION_REQUIRED'
        | 'DEADLINE'
        | 'OWNER_ABORTED'
        | 'SHOPEE_REVIEW_TIMEOUT'
        | 'SHOPEE_REVIEW_TRANSPORT'
        | 'SHOPEE_REVIEW_INVALID_RESPONSE'
        | 'SHOPEE_REVIEW_LIMIT'
        | 'CREDENTIAL_ECHO_REFUSED'
        | 'SHOPEE_REVIEW_HTTP_301'
        | 'SHOPEE_REVIEW_HTTP_302'
        | 'SHOPEE_REVIEW_HTTP_303'
        | 'SHOPEE_REVIEW_HTTP_307'
        | 'SHOPEE_REVIEW_HTTP_308'
        | 'SHOPEE_REVIEW_HTTP_400'
        | 'SHOPEE_REVIEW_HTTP_401'
        | 'SHOPEE_REVIEW_HTTP_403'
        | 'SHOPEE_REVIEW_HTTP_404'
        | 'SHOPEE_REVIEW_HTTP_409'
        | 'SHOPEE_REVIEW_HTTP_422'
        | 'SHOPEE_REVIEW_HTTP_429'
        | 'SHOPEE_REVIEW_HTTP_500'
        | 'SHOPEE_REVIEW_HTTP_502'
        | 'SHOPEE_REVIEW_HTTP_503'
        | 'SHOPEE_REVIEW_HTTP_504'
        | 'SHOPEE_REVIEW_HTTP_5XX'
      )
    | null;
  createdAt: string | null;
  observedAt: string;
  attemptedAt: string;
  complete: boolean;
  stopReason: 'record_limit' | 'expected_count_reached' | 'last_page' | 'OTHER_OR_MISSING';
  resultAvailable: boolean;
  resultSha256: string | null;
  resultByteSize: number;
  requestCount: number;
  requestCountUncertain: boolean;
  timedOut: boolean;
  cancelIntent: boolean;
}
/**
 * This interface was referenced by `ShopeePublicCollection`'s JSON-Schema
 * via the `definition` "acquisition".
 */
export interface Acquisition {
  providerId: 'shopee-public-review';
  maxReviewsPerProduct: number;
  mappingRevision: 'shopee-public-review-row-v1';
  sampleMode: 'STANDARD' | 'TRIAL';
}
/**
 * This interface was referenced by `ShopeePublicCollection`'s JSON-Schema
 * via the `definition` "stage".
 */
export interface Stage {
  contractVersion: 'shopee-public-review-stage-v1';
  state: 'PENDING' | 'FINAL';
  confirmedSourceSetSha256: string;
  providerId: 'shopee-public-review';
  maxReviewsPerProduct: number;
  mappingRevision: 'shopee-public-review-row-v1';
  sampleMode: 'STANDARD' | 'TRIAL';
}
/**
 * This interface was referenced by `ShopeePublicCollection`'s JSON-Schema
 * via the `definition` "envelope".
 */
export interface Envelope {
  contractVersion: 'shopee-public-sanitized-result-v1';
  jobId: string;
  productUrl: string;
  shopId: string;
  itemId: string;
  maxReviewsPerProduct: number;
  complete: boolean;
  stopReason: 'record_limit' | 'expected_count_reached' | 'last_page' | 'OTHER_OR_MISSING';
  filter: 'HAS_COMMENTS';
  expectedWithComments: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  /**
   * @maxItems 100000
   */
  excluded: {
    reviewId: string;
    reason: 'EMPTY_OR_MEDIA_ONLY' | 'EMPTY_OR_SYMBOLS_ONLY';
  }[];
  /**
   * @maxItems 100000
   */
  diagnostics: 'INVALID_EXCLUDED_ENTRY'[];
  /**
   * @maxItems 500
   */
  pages: {
    page: number;
    cards: number;
    collected: number;
    /**
     * @maxItems 100000
     */
    ids: (string | null)[];
  }[];
  rows: ShopeePublicRows;
}
/**
 * This interface was referenced by `ShopeePublicCollection`'s JSON-Schema
 * via the `definition` "job".
 */
export interface Job {
  id: string;
  request: {
    url: string;
    max_comments: number;
  };
  state:
    | 'queued'
    | 'running'
    | 'succeeded'
    | 'partial'
    | 'failed'
    | 'cancelled'
    | 'interrupted'
    | 'needs_login'
    | 'needs_verification';
  created_at: string;
  updated_at: string;
  collected?: number;
  result_available: boolean;
}
/**
 * This interface was referenced by `ShopeePublicCollection`'s JSON-Schema
 * via the `definition` "publicReviewSource".
 */
export interface PublicReviewSource {
  acquisition: Stage;
  reference: {
    collectionId: string;
    collectionSha256: string;
    requestSha256: string;
  } | null;
  outcome: {
    outcome:
      | 'OK'
      | 'PARTIAL_LISTINGS'
      | 'PROVIDER_BLOCKED'
      | 'PROVIDER_TIMEOUT_NO_REVIEWS'
      | 'SHOPEE_LOGIN_REQUIRED'
      | 'SHOPEE_VERIFICATION_REQUIRED'
      | 'SHOPEE_COLLECTOR_DOWN';
    /**
     * @minItems 1
     * @maxItems 5
     */
    listings: {
      listingUrl: string;
      reviews: number;
      shortfallReason?: 'RETURNED_COUNT_BELOW_REQUESTED';
    }[];
    providerMessage: null;
    attemptedAt: string;
    reused: boolean;
    testReviewCap?: number;
  };
  corpusSha256: string | null;
  corpusUnavailableReason: ('PUBLIC_REVIEW_CORPUS_TOO_LARGE' | 'PUBLIC_REVIEW_NOT_CONFIGURED') | null;
  accounting: {
    sourceRows: number;
    uniqueScopedGroups: number;
    equalDuplicates: number;
    conflictingGroups: number;
    quarantinedRows: number;
    capturedReviewRecords: number;
    readableCommentRecords: number;
    attributesOnlyRecords: number;
    emptyComments: number;
    unreadableComments: number;
    missingRatings: number;
    invalidRatings: number;
    sourceExcludedIds: number;
  };
  /**
   * @minItems 1
   * @maxItems 5
   */
  products: {
    records: number;
    readableComments: number;
  }[];
  humanBlocked: boolean;
  corpusInlineUnavailableReason?: 'PUBLIC_REVIEW_CORPUS_RETAINED_SEPARATELY';
}
