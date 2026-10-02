/* Generated from research-review-corpus.schema.json. Do not edit by hand. */

export type Digest = string;
export type PlatformId = string;
export type ShortText = string;
export type Count = number;
export type NullableText = ShortText | null;

export interface ResearchReviewCorpus {
  contractVersion: 'research-review-corpus-v1';
  mappingRevision: 'apify-shopee-review-row-v1';
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
    mode: 'fixture' | 'live';
    actorStatus: ShortText;
    stopReason: ShortText;
    /**
     * @maxItems 100
     */
    warnings: ShortText[];
  };
  corpusState: 'RAW_CAPTURE_ONLY';
  codingState: 'NOT_CODED';
  /**
   * @maxItems 2500
   */
  records: Record[];
  coverage: {
    rawRows: Count;
    recordGroups: Count;
    collapsedEqualDuplicateRows: Count;
    conflictingRecordGroups: Count;
    selectedListingRawRows: Count;
    quarantinedRawRows: Count;
    readableRawRows: Count;
    emptyTextRawRows: Count;
    unreadableRawRows: Count;
    invalidRatingRawRows: Count;
    missingNativeIdRawRows: Count;
    unresolvedNativeIdRawRows: Count;
  };
  /**
   * @maxItems 20
   */
  blockers: ShortText[];
  /**
   * @maxItems 20
   */
  limitations: ShortText[];
}
export interface Record {
  identity: {
    kind: 'NATIVE_REVIEW_ID' | 'SOURCE_ROW_LOCATOR' | 'UNRESOLVED';
    nativeReviewId: NullableText;
    listingKey: NullableText;
    internalLocator: NullableText;
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
  rawRowSha256: Digest;
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
  reasons: ShortText[];
}
export interface SourceRef {
  pageSha256: Digest;
  pageIndex: number;
  rowIndex: number;
  rowPointer: string;
  textPointer: string | null;
}
