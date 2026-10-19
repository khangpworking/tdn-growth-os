/* Generated from research-review-corpus-v2.schema.json. Do not edit by hand. */

export type Digest = string;
export type PlatformId = string;
export type ShortText = string;
export type Count = number;

export interface ResearchReviewCorpusV2 {
  contractVersion: 'research-review-corpus-v2';
  mappingRevision: 'shopee-public-review-row-v1';
  corpusId: Digest;
  collectionId: string;
  collectionSha256: Digest;
  requestSha256: Digest;
  selectionBasis: 'OWNER_EXACT_URL';
  /**
   * @minItems 1
   * @maxItems 5
   */
  selectedListings: {
    platform: 'shopee';
    shopId: PlatformId;
    itemId: PlatformId;
    listingKey: ShortText;
    productUrl: ShortText;
  }[];
  /**
   * @maxItems 25
   */
  sourcePages: {
    sha256: Digest;
    pageIndex: number;
    byteSize: number;
    offset: Count;
    rowCount: Count;
  }[];
  capture: {
    providerId: 'shopee-public-review';
    /**
     * @maxItems 5
     */
    listings: Receipt[];
  };
  corpusState: 'RAW_CAPTURE_ONLY';
  codingState: 'NOT_CODED';
  /**
   * @maxItems 1500
   */
  records: Record[];
  coverage: {
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
   * @maxItems 20
   */
  blockers: ShortText[];
  /**
   * @maxItems 20
   */
  limitations: ShortText[];
  confirmedSourceSetSha256: string;
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
export interface Record {
  identity: {
    kind: 'NATIVE_REVIEW_ID' | 'SOURCE_ROW_LOCATOR' | 'UNRESOLVED';
    nativeReviewId: string | null;
    listingKey: string | null;
    internalLocator: string | null;
  };
  listingAdmission: 'SELECTED_LISTING' | 'WRONG_LISTING' | 'UNRESOLVED_LISTING';
  disposition: 'RETAINED_RAW' | 'QUARANTINED' | 'UNRESOLVED_CONFLICT';
  occurrenceCount: number;
  /**
   * @minItems 1
   * @maxItems 2500
   */
  versions: Version[];
}
export interface Version {
  rawRowSha256: string;
  text: string | null;
  textState: 'READABLE' | 'EMPTY' | 'UNREADABLE';
  rating: {
    state: 'VALID' | 'MISSING' | 'INVALID';
    value: number | null;
  };
  /**
   * @minItems 1
   * @maxItems 2500
   */
  sourceRefs: SourceRef[];
  /**
   * @maxItems 10
   */
  reasons: string[];
}
export interface SourceRef {
  pageSha256: string;
  pageIndex: number;
  rowIndex: number;
  rowPointer: string;
  textPointer: string | null;
}
