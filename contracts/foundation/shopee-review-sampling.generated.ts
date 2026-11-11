/* Generated from shopee-review-sampling.schema.json. Do not edit by hand. */

/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "jobInput".
 */
export type SamplingJobInput = CollectionJobInput | CountsJobInput;
/**
 * @maxItems 10000
 *
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "rows".
 */
export type SampledReviewRows = {
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

export interface ShopeeReviewPlan {
  format: 'shopee-review-plan-v1';
  runId: string;
  requestSha256: string;
  m2Digest: string;
  policy: ReviewPolicy;
  policySha256: string;
  /**
   * @maxItems 5
   */
  targets: StarTarget[];
  /**
   * @minItems 1
   * @maxItems 5
   */
  links: ReviewLink[];
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "policy".
 */
export interface ReviewPolicy {
  format: 'shopee-review-policy-v1';
  mode: 'all' | 'with-comments' | 'stars';
  /**
   * @maxItems 5
   */
  stars: number[];
  totalPerLink: number;
  allocation: 'pooled' | 'equal-stars';
  textRule: 'comment-or-attributes-v1';
  order: 'native-filter-ascending-stars-v1';
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "target".
 */
export interface StarTarget {
  star: number;
  target: number;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "link".
 */
export interface ReviewLink {
  shopId: string;
  itemId: string;
  url: string;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "input".
 */
export interface ReviewSamplingInput {
  mode: 'all' | 'with-comments' | 'stars';
  /**
   * @maxItems 5
   */
  stars: number[];
  totalPerLink: number;
  allocation: 'pooled' | 'equal-stars';
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "plan".
 */
export interface ShopeeReviewPlan1 {
  format: 'shopee-review-plan-v1';
  runId: string;
  requestSha256: string;
  m2Digest: string;
  policy: ReviewPolicy;
  policySha256: string;
  /**
   * @maxItems 5
   */
  targets: StarTarget[];
  /**
   * @minItems 1
   * @maxItems 5
   */
  links: ReviewLink[];
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "countValue".
 */
export interface SourceCountValue {
  status: 'observed' | 'missing' | 'ambiguous' | 'unavailable';
  value: number | null;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "counts".
 */
export interface ReviewCounts {
  format: 'shopee-review-counts-v1';
  shopId: string;
  itemId: string;
  url: string;
  observedAt: string;
  snapshotDigest: string;
  stars: SourceStarCounts;
  withComments: SourceCountValue;
}
export interface SourceStarCounts {
  '1': SourceCountValue;
  '2': SourceCountValue;
  '3': SourceCountValue;
  '4': SourceCountValue;
  '5': SourceCountValue;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "samplingBinding".
 */
export interface SamplingBinding {
  planSha256: string;
  policySha256: string;
  policy: ReviewPolicy;
  attemptId: string;
}
export interface CollectionJobInput {
  url: string;
  max_comments: number;
  sampling: SamplingBinding;
}
export interface CountsJobInput {
  kind: 'counts';
  url: string;
  request_key: string;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "job".
 */
export interface SamplingJob {
  id: string;
  request: SamplingJobInput;
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
  result_available: boolean;
  collected?: number;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "page".
 */
export interface SamplingPage {
  filter: 'all' | 'with-comments' | '1' | '2' | '3' | '4' | '5';
  page: number;
  cards: number;
  collected: number;
  /**
   * @maxItems 100000
   */
  ids: string[];
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "group".
 */
export interface SamplingGroupOutcome {
  filter: 'all' | 'with-comments' | '1' | '2' | '3' | '4' | '5';
  stopReason:
    'quota' | 'exhausted' | 'page_limit' | 'timeout' | 'cancelled' | 'control_changed' | 'not_started' | 'total_limit';
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "result".
 */
export interface SamplingResult {
  format: 'shopee-sampled-result-v1';
  jobId: string;
  inputSha256: string;
  planSha256: string;
  policySha256: string;
  link: ReviewLink;
  rows: SampledReviewRows;
  /**
   * @maxItems 500
   */
  pages: SamplingPage[];
  /**
   * @maxItems 5
   */
  groups: SamplingGroupOutcome[];
  sourceCounts: ReviewCounts | null;
  stopReason:
    | 'record_limit'
    | 'exhausted'
    | 'page_limit'
    | 'timeout'
    | 'cancelled'
    | 'control_changed'
    | 'not_started'
    | 'running';
  complete: boolean;
  phase: 'checkpoint' | 'terminal';
  sourceSha256: string;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "journal".
 */
export interface SamplingJournal {
  format: 'shopee-sampling-journal-v1';
  inputSha256: string;
  request: SamplingJobInput;
  intentAt: string | null;
  deadline: string;
  /**
   * @maxItems 100
   */
  baselineIds: string[];
  job: SamplingJob | null;
  result: (SamplingResult | ReviewCounts) | null;
  terminal: boolean;
  errorCode: string | null;
  requestCount: number;
  requestCountUncertain: boolean;
  cancelIntent: boolean;
  resultSha256: string | null;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "attempt".
 */
export interface ReviewSamplingAttempt {
  format: 'shopee-review-attempt-v1';
  kind: 'counts' | 'custom';
  attemptId: string;
  runId: string;
  createdAt: string;
  m2Digest: string;
  requestSha256: string;
  planSha256: string | null;
  /**
   * @minItems 1
   * @maxItems 5
   */
  links: ReviewLink[];
  executionId?: string;
  sequence?: number;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "attemptState".
 */
export interface ReviewSamplingAttemptState {
  format: 'shopee-review-attempt-state-v1';
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'UNCERTAIN';
  pid: number | null;
  errorCode: string | null;
  outputSha256: string | null;
  attemptSha256: string;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "automatic".
 */
export interface AutomaticReviewBinding {
  format: 'shopee-automatic-review-binding-v1';
  runId: string;
  requestSha256: string;
  m2Digest: string;
  policySha256: string;
  planSha256: string;
  attemptId: string;
  executionId: string;
  sequence: number;
  createdAt: string;
}
/**
 * This interface was referenced by `ShopeeReviewPlan`'s JSON-Schema
 * via the `definition` "execution".
 */
export interface ModuleExecution {
  format: 'shopee-module-execution-v1';
  runId: string;
  executionId: string;
  sequence: number;
  module: 'M1' | 'M2' | 'M3';
  kind: 'module' | 'automatic' | 'custom';
  attemptId: string | null;
  requestSha256: string | null;
  inputSha256: string | null;
  startedAt: string;
  endedAt: string | null;
  status: 'RUNNING' | 'UNCERTAIN' | 'SUCCEEDED' | 'FAILED' | 'WAIT_OWNER';
  pid: number | null;
  gateSha256: string | null;
  errorCode: string | null;
  previousGateSha256?: string | null;
}
