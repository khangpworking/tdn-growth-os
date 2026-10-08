import type {
  ResearchAutomationCoverageSource, ResearchAutomationInterview, ResearchAutomationMode, ResearchAutomationProductCard,
  ResearchAutomationReportKind, ResearchAutomationRunStatus, ResearchAutomationStepState,
} from '../../../../contracts/api/research-automation-api.generated.js';
import type { NativeSourceReviewReference } from './native-source-review-bridge.js';
import type { ExactShopeeOutcome } from './exact-shopee-outcome.js';
import type { DefaultMarketPeers } from '../../../../contracts/analysis/default-market-peers.generated.js';

// New literal revisions retain their canonical output independently of coding.
export type { InsightLiteralSelection, AutomationInsightLiteralReportRevisionRequest } from '../../../../contracts/analysis/automation-insight-report-revision.generated.js';
export type { InsightLiteralEvidence as AutomationInsightLiteralSnapshot } from '../../../../contracts/analysis/insight-literal-evidence.generated.js';

export type StepId = 'QUICK_SEARCH' | 'COLLECTION' | 'REPORTS';
export type SourceStepId = Exclude<StepId, 'REPORTS'>;
export type RunStatus = ResearchAutomationRunStatus;
export type StepState = ResearchAutomationStepState;

export const TERMINAL_STATUSES: ReadonlySet<RunStatus> = new Set(['DRAFT_READY', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
export const STEP_IDS: readonly StepId[] = ['QUICK_SEARCH', 'COLLECTION', 'REPORTS'];
export const MAX_PERIOD_DAYS = 1096;
export const RUN_LIST_LIMIT = 50;
export const MAX_PRINCIPAL_CARDS = 4;
export const MAX_CARDS = 24;
export const MAX_CAPTURES_PER_STEP = 512;
export const MAX_CAPTURE_BYTES = 16 * 1024 * 1024;
/** Base64 request/response fields plus the bounded capture envelope overhead. */
export const MAX_CAPTURE_ENVELOPE_BYTES = Math.ceil(MAX_CAPTURE_BYTES * 4 / 3) + 8192;
export const MAX_JSON_ARTIFACT_BYTES = 8 * 1024 * 1024;
export const MAX_HTML_BYTES = 16 * 1024 * 1024;
export const MAX_PDF_BYTES = 64 * 1024 * 1024;

/** Exact start snapshot persisted before the run exists; its digest is the request identity. */
export interface StartSnapshot {
  readonly contractVersion: 'research-automation-start-snapshot-v1';
  readonly workspaceId: string;
  readonly country: 'VN';
  readonly mode: ResearchAutomationMode;
  readonly keyword: string;
  readonly description: string | null;
  readonly interview: ResearchAutomationInterview | null;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string; readonly dayCount: number };
  readonly reports: readonly ResearchAutomationReportKind[];
  /** Frozen before discovery/sales reads; absent on historical starts. */
  readonly defaultPeerRule?: DefaultMarketPeers['input']['rule'];
}

/** Exact owner-approved scope; peers are explicit and never implied by selection. */
export interface ScopeSnapshot {
  readonly contractVersion: 'research-automation-scope-snapshot-v1';
  readonly workspaceId: string;
  readonly runId: string;
  readonly definition: string;
  readonly includeTerms: readonly string[];
  readonly excludeTerms: readonly string[];
  readonly selectedProductIds: readonly string[];
  readonly peerProductIds: readonly string[];
  /** Owner-selected listing URLs, absent on historical runs. */
  readonly exactShopeeUrls?: readonly string[];
}

export interface SourceLimitation {
  readonly code: string;
  readonly provider: string | null;
  readonly message: string;
}

/** A typed, source-located measure for one exact product. Never a market total. */
export interface TypedComparable {
  readonly productId: string;
  readonly provider: string;
  readonly metric: 'GMV_VND' | 'UNITS_SOLD';
  readonly value: string;
  readonly window: { readonly startDate: string; readonly endDate: string };
  /** Index into the same step's captures; the exact raw bytes this value was read from. */
  readonly captureIndex: number;
}

/** One web search per collection; the provider requests and keeps at most 10 organic results. */
export const MAX_WEB_RESULTS = 10;

/** One organic web search result as returned at retrieval time; captureIndex locates its raw response. */
export interface StepWebResult {
  readonly position: number;
  readonly title: string;
  readonly url: string;
  readonly snippet: string | null;
  /** Page name and publish date as the search engine shows them; absent in results stored before they were kept. */
  readonly site?: string | null;
  readonly published?: string | null;
  readonly retrievedAt: string;
  readonly captureIndex: number;
}

/** Normalized step outcome retained as canonical JSON; raw bytes are separate capture artifacts. */
export interface StepResultDocument {
  readonly contractVersion: 'research-automation-step-result-v1';
  readonly runId: string;
  readonly stepId: SourceStepId;
  readonly outcome: 'SUCCEEDED' | 'PARTIAL' | 'UNAVAILABLE' | 'FAILED' | 'CANCELLED' | 'INTERRUPTED';
  readonly productCards: readonly ResearchAutomationProductCard[];
  readonly comparables: readonly TypedComparable[];
  readonly coverage: readonly ResearchAutomationCoverageSource[];
  readonly limitations: readonly SourceLimitation[];
  /** Web search results of the collection step; absent on runs without a web source. */
  readonly webResults?: readonly StepWebResult[];
  readonly exactShopee?: {
    readonly collectionId: string;
    readonly collectionSha256: string;
    readonly requestSha256: string;
  };
  /** Classified exact-Shopee review outcome; absent on runs stored before it was kept. */
  readonly exactShopeeOutcome?: {
    readonly outcome: ExactShopeeOutcome;
    readonly listings: readonly { readonly listingUrl: string; readonly reviews: number }[];
    readonly providerMessage: string | null;
    readonly attemptedAt: string;
    readonly reused: boolean;
  };
  /** A reused native capture, never projected as a new provider collection. */
  readonly nativeReview?: NativeSourceReviewReference;
}

export interface CaptureRecord {
  readonly stepId: SourceStepId;
  readonly ordinal: number;
  readonly artifactSha256: string;
  readonly mediaType: string;
  readonly provider: string;
  readonly operation: string;
  readonly retrievedAt: string;
  readonly window: { readonly startDate: string; readonly endDate: string } | null;
  readonly truncated: boolean;
}

/** Fixed, server-authored, safe step/blocker messages. Provider text never reaches these. */
export const MESSAGES: Readonly<Record<string, string>> = {
  PROVIDER_NOT_CONFIGURED: 'No research data provider is configured on this operator; nothing was collected.',
  PROVIDER_FAILED: 'The provider operation failed and was not retried automatically.',
  PROVIDER_OUTPUT_INVALID: 'The provider returned data that failed validation; the result was rejected and nothing was inferred from it.',
  SCOPE_FILTERS_NOT_APPLIED: 'The confirmed scope definition and terms were retained, but provider-side filtering for those criteria is not implemented in this run.',
  STEP_TIMEOUT: 'The provider operation exceeded the operator time bound and was stopped; it was not retried.',
  CANCELLED_BY_OWNER: 'Cancelled by the owner.',
  CANCELLED_DURING_PROVIDER_OPERATION: 'Cancelled while a provider operation was in flight; any charge for that operation is unknown.',
  OPERATOR_STOPPED: 'The operator stopped during a provider operation. It was not retried automatically; start a new run to collect again. Provider captures returned before the stop are preserved; an in-flight response may be unavailable.',
  EXECUTOR_RESTARTED: 'The operator restarted during a provider operation. It was not retried automatically; start a new run to collect again.',
  SKIPPED_AFTER_STOP: 'Not run because an earlier step stopped the run.',
  NO_APPROVED_PRODUCT_REFS: 'No product was approved for collection, so no product period detail was requested or collected.',
  REPORT_RENDER_FAILED: 'Draft rendering failed; collected data and raw captures are preserved.',
  INTERRUPTED_DURING_PROVIDER_OPERATION: 'A paid provider operation was interrupted. It was not retried automatically; captures returned before interruption are preserved and an in-flight response may be unavailable.',
  USAGE_UNKNOWN: 'At least one provider operation ended without a settled usage receipt; its cost is unknown, not zero.',
  PDF_RENDERER_NOT_CONFIGURED: 'PDF renderer is not configured on this operator.',
  PDF_RENDER_FAILED: 'PDF rendering failed on this operator; the web version is unaffected.',
};

export function message(code: string): string {
  const text = MESSAGES[code];
  if (text === undefined) throw new TypeError(`Unknown research automation message code: ${code}`);
  return text;
}

export class ResearchAutomationValidationError extends Error {}
export class ResearchAutomationNotFoundError extends Error {
  constructor(readonly code: 'workspace_not_found' | 'run_not_found' | 'report_not_available' | 'pdf_not_available' | 'rule_adoption_not_found' | 'membership_not_found' | 'insight_coding_not_found' | 'reader_report_not_found', text: string) { super(text); }
}
export class ResearchAutomationConflictError extends Error {
  constructor(readonly code: 'request_key_conflict' | 'revision_conflict' | 'invalid_state', text: string) { super(text); }
}
export class ResearchAutomationStateError extends ResearchAutomationConflictError {
  constructor(text: string) { super('invalid_state', text); }
}
export class ResearchAutomationIntegrityError extends Error {}
export class ResearchAutomationProviderOutputError extends Error {}
