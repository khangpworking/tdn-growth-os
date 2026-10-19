/* Generated from shopee-public-journal.schema.json. Do not edit by hand. */

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

export interface ShopeePublicJournal {
  contractVersion: 'shopee-public-journal-v1';
  runKey: string;
  confirmedSourceSetSha256: string;
  requestSha256: string;
  providerId: 'shopee-public-review';
  maxReviewsPerProduct: number;
  mappingRevision: 'shopee-public-review-row-v1';
  sampleMode: 'STANDARD' | 'TRIAL';
  productUrl: string;
  shopId: string;
  itemId: string;
  inputSha256: string;
  intentAt: string | null;
  submitWindowStart: string | null;
  submitWindowEnd: string | null;
  deadline: string | null;
  acquisitionDeadline: string | null;
  /**
   * @maxItems 100
   */
  baselineIds: string[];
  job: Job | null;
  lastState:
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
  snapshot: Envelope | null;
  requestCount: number;
  requestCountUncertain: boolean;
  cancelIntent: boolean;
  timedOut: boolean;
  terminal: Receipt | null;
}
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
