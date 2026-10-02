/* Generated from research-automation-api.schema.json. Do not edit by hand. */

export type ResearchAutomationApiContract =
  | ResearchAutomationStartRequest
  | ResearchAutomationConfirmRequest
  | ResearchAutomationCancelRequest
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
}
export interface ResearchAutomationCancelRequest {
  contractVersion: 'research-automation-cancel-v1';
  requestKey: RequestKey;
  expectedRevision: number;
}
export interface ResearchAutomationRun {
  contractVersion: 'research-automation-run-v1';
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
