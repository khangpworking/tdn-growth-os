/* Generated from research-automation-api.schema.json. Do not edit by hand. */

export type ResearchAutomationApiContract =
  | ResearchAutomationStartRequest
  | ResearchAutomationConfirmRequest
  | ResearchAutomationCancelRequest
  | ResearchAutomationAutoRunRetryRequest
  | ResearchAutomationAutoRunKeywordRequest
  | ResearchAutomationRun
  | ResearchAutomationRunList
  | ResearchAutomationMutationReceipt
  | ResearchAutomationError;
export type RequestKey = string;
export type ResearchAutomationMode = 'PRODUCT' | 'CATEGORY';
export type Text120 = string;
export type LongText = string;
export type Date = string;
export type ResearchAutomationReportKind = 'MARKET' | 'INSIGHT';
/**
 * Exactly ['MARKET'], ['INSIGHT'] or ['MARKET','INSIGHT'] in that order; the service rejects any other order.
 *
 * @minItems 1
 * @maxItems 2
 */
export type ResearchAutomationReports = ResearchAutomationReportKind[];
export type Text200 = string;
export type Term = string;
export type ProductId = string;
/**
 * @maxItems 5
 */
export type ExactShopeeUrls = string[];
export type Uuid = string;
export type ResearchAutomationRunStatus =
  | 'QUICK_SEARCH_QUEUED'
  | 'QUICK_SEARCH_RUNNING'
  | 'AWAITING_SCOPE'
  | 'COLLECTION_QUEUED'
  | 'COLLECTING'
  | 'RENDERING'
  | 'CANCELLING'
  | 'DRAFT_READY'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED';
export type Timestamp = string;
export type Provider = string;
export type HttpsUrl = string;
export type Operation = string;
export type ResearchAutomationCost =
  | {
      state: 'KNOWN';
      unit: 'USD' | 'CREDITS';
      amount: string;
    }
  | {
      state: 'UNKNOWN';
    };
export type ResearchAutomationStepState =
  | 'PENDING'
  | 'QUEUED'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'PARTIAL'
  | 'UNAVAILABLE'
  | 'FAILED'
  | 'CANCELLED'
  | 'INTERRUPTED'
  | 'SKIPPED';
export type Code = string;
export type Digest = string;

export interface ResearchAutomationStartRequest {
  contractVersion: 'research-automation-start-v1';
  requestKey: RequestKey;
  mode: ResearchAutomationMode;
  keyword: Text120;
  description?: LongText;
  requestedPeriod: ResearchAutomationRequestedPeriodInput;
  reports: ResearchAutomationReports;
  interview?: ResearchAutomationInterview;
  /**
   * Explicit capture spec, validated by the canonical metric-v3-capture-spec-v1 schema in the start service.
   */
  metricV3Preset?: {
    [k: string]: unknown;
  };
}
export interface ResearchAutomationRequestedPeriodInput {
  startDate: Date;
  endDate: Date;
}
export interface ResearchAutomationInterview {
  productType?: Text200;
  audience?: Text200;
  useCase?: Text200;
  priceRange?: Text200;
  knownProduct?: Text200;
}
export interface ResearchAutomationConfirmRequest {
  contractVersion: 'research-automation-confirm-v1';
  requestKey: RequestKey;
  expectedRevision: number;
  definition: LongText;
  /**
   * @maxItems 30
   */
  includeTerms: Term[];
  /**
   * @maxItems 30
   */
  excludeTerms: Term[];
  /**
   * @maxItems 4
   */
  selectedProductIds: ProductId[];
  /**
   * @maxItems 8
   */
  peerProductIds: ProductId[];
  exactShopeeUrls?: ExactShopeeUrls;
}
export interface ResearchAutomationCancelRequest {
  contractVersion: 'research-automation-cancel-v1';
  requestKey: RequestKey;
  expectedRevision: number;
}
/**
 * Owner click on "Thử lại": re-runs one stopped automatic capture (one more lookup).
 */
export interface ResearchAutomationAutoRunRetryRequest {
  contractVersion: 'research-automation-autorun-retry-v1';
  requestKey: RequestKey;
}
/**
 * Owner answer to the suggested keyword 2 after the first automatic capture: the accepted or edited term, or null to remove it. The second capture then runs (one more lookup).
 */
export interface ResearchAutomationAutoRunKeywordRequest {
  contractVersion: 'research-automation-autorun-keyword-v1';
  requestKey: RequestKey;
  keyword2: Term | null;
  /**
   * Owner-confirmed complete preset, validated by the canonical capture spec service.
   */
  metricV3Preset?: {
    [k: string]: unknown;
  };
}
export interface ResearchAutomationRun {
  contractVersion: 'research-automation-run-v1' | 'research-automation-run-v2';
  runId: Uuid;
  workspaceId: Uuid;
  revision: number;
  status: ResearchAutomationRunStatus;
  country: 'VN';
  mode: ResearchAutomationMode;
  keyword: Text120;
  description: LongText | null;
  interview: ResearchAutomationInterview | null;
  requestedPeriod: ResearchAutomationRequestedPeriod;
  reports: ResearchAutomationReports;
  definition: ResearchAutomationConfirmedScope | null;
  /**
   * @maxItems 24
   */
  productCards: ResearchAutomationProductCard[];
  coverage: ResearchAutomationCoverage;
  usage: ResearchAutomationUsage;
  aiActivity?: ResearchAutomationAiActivity;
  /**
   * @minItems 3
   * @maxItems 3
   */
  steps: ResearchAutomationStep[];
  /**
   * @maxItems 64
   */
  blockers: ResearchAutomationBlocker[];
  outputs?: {
    market?: ResearchAutomationOutput;
    insight?: ResearchAutomationOutput;
  };
  autoRun?: ResearchAutomationAutoRun;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface ResearchAutomationRequestedPeriod {
  startDate: Date;
  endDate: Date;
  dayCount: number;
}
export interface ResearchAutomationConfirmedScope {
  definition: LongText;
  /**
   * @maxItems 30
   */
  includeTerms: Term[];
  /**
   * @maxItems 30
   */
  excludeTerms: Term[];
  /**
   * @maxItems 4
   */
  selectedProductIds: ProductId[];
  /**
   * @maxItems 8
   */
  peerProductIds: ProductId[];
  confirmedAt: Timestamp;
  exactShopeeUrls?: ExactShopeeUrls;
}
export interface ResearchAutomationProductCard {
  productId: ProductId;
  provider: Provider;
  sourceProductId: string;
  role: 'PRINCIPAL' | 'EXPLORATION';
  title: string | null;
  sourceUrl: HttpsUrl | null;
  imageUrl: HttpsUrl | null;
  description: string | null;
  descriptionState: 'PRESENT' | 'EMPTY' | 'UNAVAILABLE';
  observedWindow: ResearchAutomationObservedWindow | null;
  retrievedAt: Timestamp;
}
export interface ResearchAutomationObservedWindow {
  startDate: Date;
  endDate: Date;
  label: string;
}
export interface ResearchAutomationCoverage {
  requestedPeriod: ResearchAutomationRequestedPeriod;
  /**
   * @maxItems 64
   */
  sources: ResearchAutomationCoverageSource[];
}
export interface ResearchAutomationCoverageSource {
  provider: Provider;
  dataset: Operation;
  state: 'COLLECTED' | 'PARTIAL' | 'WAITING_FOR_INPUT' | 'UNSUPPORTED' | 'UNAVAILABLE' | 'FAILED' | 'CANCELLED';
  observedStartDate: Date | null;
  observedEndDate: Date | null;
  truncated: boolean;
  note: string | null;
}
export interface ResearchAutomationUsage {
  /**
   * @maxItems 512
   */
  entries: ResearchAutomationUsageEntry[];
  requestCount: number;
  /**
   * @maxItems 2
   */
  knownCosts: {
    unit: 'USD' | 'CREDITS';
    amount: string;
  }[];
  hasUnknownCost: boolean;
}
export interface ResearchAutomationUsageEntry {
  stepId: 'QUICK_SEARCH' | 'COLLECTION';
  provider: Provider;
  operation: Operation;
  requestCount: number;
  cost: ResearchAutomationCost;
}
/**
 * Recorded section activity across the initial run and all report revisions, not billed provider requests or business completion. Each field is absent when no execution was prepared; older servers may only supply I14.
 */
export interface ResearchAutomationAiActivity {
  m11?: I14;
  m12?: I14;
  i15?: I14;
  i14?: I14;
}
export interface I14 {
  states: {
    prepared: number;
    dispatching: number;
    completed: number;
    dispatchUnknown: number;
  };
  /**
   * Local response-validation outcomes, not business approval.
   */
  outcomes: {
    valid: number;
    invalid: number;
  };
  /**
   * UNKNOWN after any dispatch claim, including an uncertain outcome. No provider usage or billing receipt is available.
   */
  billing: {
    state: 'NOT_DISPATCHED' | 'UNKNOWN';
  };
}
export interface ResearchAutomationStep {
  stepId: 'QUICK_SEARCH' | 'COLLECTION' | 'REPORTS';
  state: ResearchAutomationStepState;
  code: Code | null;
  message: string | null;
  startedAt: Timestamp | null;
  finishedAt: Timestamp | null;
}
export interface ResearchAutomationBlocker {
  code: Code;
  scope: 'RUN' | 'SOURCE';
  provider: Provider | null;
  message: string;
}
export interface ResearchAutomationOutput {
  versionId: Digest;
  web: true;
  pdf: {
    available: boolean;
    reason: string | null;
  };
}
/**
 * Market auto-runner state; present only for a run that has an auto-run row.
 */
export interface ResearchAutomationAutoRun {
  phase: 'WAITING_SCOPE' | 'CAPTURE' | 'PREPARE' | 'PICK' | 'CONFIRM' | 'WAIT_DRAFT' | 'PRESENT' | 'DONE' | 'STOPPED';
  state: 'QUEUED' | 'RUNNING';
  stopCode?: string;
  linksFound?: number;
  canRetry: boolean;
  /**
   * research-automation-run-v2 only. Present while the auto-run waits for the owner's answer on keyword 2: the suggested term and its evidence in the first capture's top-revenue titles.
   */
  keyword2Suggestion?: {
    categoryId?: string | null;
    keyword1: Text120;
    term: Term;
    titles: number;
    titleCount: number;
    brands: number;
  };
}
export interface ResearchAutomationRunList {
  contractVersion: 'research-automation-run-list-v1';
  workspaceId: Uuid;
  /**
   * @maxItems 50
   */
  runs: ResearchAutomationRunSummary[];
}
export interface ResearchAutomationRunSummary {
  runId: Uuid;
  revision: number;
  status: ResearchAutomationRunStatus;
  mode: ResearchAutomationMode;
  keyword: Text120;
  requestedPeriod: ResearchAutomationRequestedPeriod;
  reports: ResearchAutomationReports;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
export interface ResearchAutomationMutationReceipt {
  contractVersion: 'research-automation-receipt-v1';
  exactRetry: boolean;
  run: ResearchAutomationRun;
}
export interface ResearchAutomationError {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'workspace_not_found'
      | 'run_not_found'
      | 'report_not_available'
      | 'pdf_not_available'
      | 'method_not_allowed'
      | 'request_key_conflict'
      | 'revision_conflict'
      | 'invalid_state'
      | 'payload_too_large'
      | 'integrity_error'
      | 'service_unavailable';
    message: string;
  };
}
