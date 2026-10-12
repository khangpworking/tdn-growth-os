/* Generated from tiktok-comment-collection-v1.schema.json. Do not edit by hand. */

/**
 * Run/source-bound opt-in TikTok selection, before-call charge intent, sanitized allowlist audit, L9 corpus and author/key-free read. No raw author metadata, salt, automatic collection, person verification, native Shopee relabel or release approval. Source period remains unknown/unverified independently of requested run period.
 */
export type TikTokCommentCollectionV1 =
  | TikTokVideoSelectionRequest
  | TikTokVideoSelection
  | TikTokCommentCollectionIntent
  | TikTokCommentRetainedCapture
  | TikTokCommentCorpus
  | TikTokCommentReadView
  | TikTokCommentSourceReceipt
  | TikTokCommentSourceHistory;
/**
 * Who drafted the keyword/exclusion data. Source and model-drafted provenance stay distinct; neither implies human approval.
 */
export type KeywordListProvenance = 'OPERATOR_SUPPLIED' | 'MODEL_DRAFTED';
export type TikTokCommentAuthorIdentity = TikTokHashedAuthorIdentity | TikTokMissingAuthorIdentity;
export type KeywordMeaningDecision = 'INCLUDED' | 'EXCLUDED' | 'UNCLEAR';
export type KeywordMeaningReason =
  | 'MATCHED_KEYWORD'
  | 'RESOLVED_BY_CONTEXT'
  | 'EXCLUDED_TERM'
  | 'EXCLUDED_CONTEXT'
  | 'UNRESOLVED_UNDIACRITICIZED'
  | 'UNLISTED_ACCENTED_LOOKALIKE'
  | 'NO_KEYWORD_MATCH'
  | 'EMPTY_TEXT';

export interface TikTokVideoSelectionRequest {
  contractVersion: 'tiktok-video-selection-request-v1';
  requestKey: string;
  expectedRevision: number;
  sourcePackage: TikTokSourcePackageIdentity;
  option: 'A_TOP_20_PERCENT' | 'C_CUMULATIVE_80_PERCENT';
  /**
   * @minItems 0
   * @maxItems 30
   */
  reviewVideoUrls: string[];
}
export interface TikTokSourcePackageIdentity {
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
}
export interface TikTokVideoSelection {
  contractVersion: 'tiktok-video-selection-v1';
  workspaceId: string;
  runId: string;
  scopeSha256: string;
  sourceSetSha256: string;
  requestedPeriod: TikTokRequestedPeriod;
  sourcePeriod: TikTokUnknownSourcePeriod;
  sourcePackage: TikTokSourcePackageIdentity;
  tableSha256: string;
  option: 'A_TOP_20_PERCENT' | 'C_CUMULATIVE_80_PERCENT';
  tieRule: 'EXACT_SOURCE_ORDER';
  maximumVideos: 30;
  sampleVideoCount: number;
  /**
   * @minItems 0
   * @maxItems 5000
   */
  excluded: TikTokVideoSelectionExclusion[];
  /**
   * @minItems 1
   * @maxItems 30
   */
  videos: SelectedTikTokVideo[];
}
export interface TikTokRequestedPeriod {
  startDate: string;
  endDate: string;
}
export interface TikTokUnknownSourcePeriod {
  state: 'UNKNOWN_UNVERIFIED';
  startDate: null;
  endDate: null;
}
export interface TikTokVideoSelectionExclusion {
  line: string;
  reason: 'MISSING_VIDEO' | 'INVALID_VIDEO_URL' | 'MISSING_REVENUE' | 'ZERO_REVENUE';
}
export interface SelectedTikTokVideo {
  videoId: string;
  url: string;
  kind: 'SELLER_VIDEO' | 'REVIEW_VIDEO';
  sourceLine: string | null;
  revenue: string | null;
}
export interface TikTokCommentCollectionIntent {
  contractVersion: 'tiktok-comment-intent-v1';
  requestKey: string;
  binding: TikTokRunBinding;
  selection: TikTokVideoSelection;
  selectionSha256: string;
  keywordData: KeywordMeaningFilterData;
  actor: 'datadoping/tiktok-comment-reply-scraper' | 'clockworks/tiktok-comments-scraper';
  privacy: TikTokCommentPrivacyProfile;
  approvedMaxTotalChargeUsd: number;
  maxCommentsPerVideo: number;
  replyPolicy: 'TOP_LEVEL_ONLY';
  auditForm: 'SANITIZED_ALLOWLIST';
}
export interface TikTokRunBinding {
  workspaceId: string;
  runId: string;
  scopeSha256: string;
  sourceSetSha256: string;
  requestedPeriod: TikTokRequestedPeriod1;
  sourcePeriod: TikTokUnknownSourcePeriod1;
}
export interface TikTokRequestedPeriod1 {
  startDate: string;
  endDate: string;
}
export interface TikTokUnknownSourcePeriod1 {
  state: 'UNKNOWN_UNVERIFIED';
  startDate: null;
  endDate: null;
}
export interface KeywordMeaningFilterData {
  contractVersion: 'l9-keyword-data-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: string[];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
}
export interface KeywordMeaningExclusion {
  term: string;
  reason: string;
}
export interface TikTokCommentPrivacyProfile {
  profileVersion: 'tiktok-comment-privacy-v1';
  platform: 'tiktok';
  keyId: string;
  keyCommitment: string;
  voicePolicyCommitment: string;
  algorithm: 'HMAC-SHA256';
}
export interface TikTokCommentRetainedCapture {
  contractVersion: 'tiktok-comment-capture-v1';
  actor: 'datadoping/tiktok-comment-reply-scraper' | 'clockworks/tiktok-comments-scraper';
  inputSha256: string;
  privacy: TikTokCommentPrivacyProfile;
  receipt: TikTokCommentRunReceipt;
  auditForm: 'SANITIZED_ALLOWLIST';
  /**
   * @minItems 0
   * @maxItems 24000
   */
  pages: TikTokSanitizedAuditPage[];
}
export interface TikTokCommentRunReceipt {
  runId: string;
  datasetId: string;
  buildId: string | null;
  status: 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'INCOMPLETE';
  retrievedAt: string;
  providerTotalRows: number | null;
  usageTotalUsd: number | null;
}
export interface TikTokSanitizedAuditPage {
  sha256: string;
  offset: number;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  rows: SanitizedTikTokComment[];
}
export interface SanitizedTikTokComment {
  videoId: string;
  commentId: string;
  videoUrl: string;
  pageIndex: number;
  rowIndex: number;
  text: string | null;
  textForm: 'SANITIZED';
  createdAt: string | null;
  likeCount: number | null;
  authorIdentity: TikTokCommentAuthorIdentity;
  voice: 'CUSTOMER' | 'SELLER_OR_CREATOR';
  isReply: boolean;
  exclusionReason: ('REPLY' | 'EMPTY' | 'TAG_ONLY' | 'EMOJI_ONLY') | null;
  evidenceCommitment: string;
}
export interface TikTokHashedAuthorIdentity {
  state: 'HASHED';
  hash: string;
}
export interface TikTokMissingAuthorIdentity {
  state: 'MISSING' | 'INVALID';
  hash: null;
}
export interface TikTokCommentCorpus {
  contractVersion: 'tiktok-comment-corpus-v1';
  registryId: 'S07';
  platform: 'tiktok';
  selectionSha256: string;
  sourcePackage: TikTokSourcePackageIdentity;
  privacy: TikTokCommentPrivacyProfile;
  auditForm: 'SANITIZED_ALLOWLIST';
  codingState: 'NOT_CODED';
  sampleLabel: 'bình luận thu được';
  keywordData: KeywordMeaningFilterData;
  /**
   * @minItems 1
   * @maxItems 5
   */
  filterBatches: KeywordMeaningFilterResult[];
  /**
   * @minItems 0
   * @maxItems 24000
   */
  records: TikTokCommentCorpusRecord[];
  accounting: TikTokCommentAccounting;
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations: string[];
}
export interface KeywordMeaningFilterResult {
  contractVersion: 'keyword-meaning-filter-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: string[];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
  /**
   * @maxItems 5000
   */
  results: KeywordMeaningRecordResult[];
  accounting: {
    included: number;
    excluded: number;
    unclear: number;
    byReason: {
      [k: string]: number;
    };
  };
}
export interface KeywordMeaningRecordResult {
  recordId: string;
  decision: KeywordMeaningDecision;
  reason: KeywordMeaningReason;
  matchedKeyword: string | null;
  excludedBy: string | null;
  exclusionReason: string | null;
  text: string;
  contextText: string | null;
}
export interface TikTokCommentCorpusRecord {
  recordId: string;
  videoId: string;
  commentId: string;
  videoUrl: string;
  videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO';
  sourceType: 'COMMENT_UNDER_REVIEW_VIDEO' | 'COMMENT_UNDER_SELLER_VIDEO';
  voice: 'CUSTOMER' | 'SELLER_OR_CREATOR';
  text: string | null;
  createdAt: string | null;
  likeCount: number | null;
  authorIdentity: TikTokCommentAuthorIdentity;
  occurrenceCount: number;
  disposition: 'INCLUDED' | 'EXCLUDED' | 'UNCLEAR';
  dispositionReason: string | null;
  l9: KeywordMeaningRecordResult;
  /**
   * @minItems 1
   * @maxItems 24000
   */
  versions: TikTokCommentVersion[];
}
export interface TikTokCommentVersion {
  row: SanitizedTikTokComment;
  /**
   * @minItems 1
   * @maxItems 24000
   */
  sourceRefs: TikTokCommentSourceRef[];
}
export interface TikTokCommentSourceRef {
  pageSha256: string;
  pageIndex: number;
  rowIndex: number;
  textPointer: string;
}
export interface TikTokCommentAccounting {
  returnedRows: number;
  uniqueComments: number;
  equalDuplicateRows: number;
  conflictingCommentGroups: number;
  included: number;
  excluded: number;
  unclear: number;
  byReason: {
    [k: string]: number;
  };
}
export interface TikTokCommentReadView {
  contractVersion: 'tiktok-comment-read-v1';
  registryId: 'S07';
  sampleLabel: 'bình luận thu được';
  /**
   * @minItems 0
   * @maxItems 6000
   */
  rows: TikTokCommentReadRow[];
  accounting: TikTokCommentAccounting;
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations: string[];
}
export interface TikTokCommentReadRow {
  text: string | null;
  sourceType: 'COMMENT_UNDER_REVIEW_VIDEO' | 'COMMENT_UNDER_SELLER_VIDEO';
  voice: 'CUSTOMER';
  createdAt: string | null;
  likeCount: number | null;
  citation: number | null;
}
export interface TikTokCommentSourceReceipt {
  contractVersion: 'tiktok-comment-source-receipt-v1';
  requestKey: string;
  package: TikTokSourcePackageIdentity;
  selectionSha256: string;
  corpusSha256: string;
  exactRetry: boolean;
  state: 'RETAINED_NOT_CODED';
}
export interface TikTokCommentSourceHistory {
  contractVersion: 'tiktok-comment-source-history-v1';
  workspaceId: string;
  runId: string;
  /**
   * @minItems 0
   * @maxItems 1000
   */
  sources: TikTokCommentSourceReceipt[];
}
