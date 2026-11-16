/* Generated from shopee-module-review-process.schema.json. Do not edit by hand. */

export type ShopeeModuleReviewProcess =
  | ReviewProcessView
  | ReviewProcessStart
  | RunsProgress
  | ReviewProcessAutoRecord
  | ReviewProcessStateRecord
  | ReviewProcessLinkRecord
  | ReviewProcessGateFile
  | ReviewProcessPlan
  | ReviewProcessStageFile
  | ReviewProcessReceipt;
export type ReviewProcessErrorCode =
  | 'JEV_CALL_FAILED'
  | 'JEV_DISABLED'
  | 'REVIEW_SOURCE_CHANGED'
  | 'DB_IMPORT_CONFLICT'
  | 'PRODUCT_NAME_PROVENANCE_MISSING'
  | 'APP_DB_NOT_CONFIGURED'
  | 'READONLY_ON'
  | 'GATE_FAILED';

export interface ReviewProcessView {
  format: 'review-process-view-v1';
  runId: string;
  autoRun: boolean;
  labelUnresolved: boolean;
  sources: ReviewProcessSource[];
}
export interface ReviewProcessSource {
  sourceSha256: string;
  state: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE';
  errorCode: ReviewProcessErrorCode | null;
  startedAt: string | null;
  finishedAt: string | null;
  retries: number;
  canResume: boolean;
  fee: ReviewProcessFee;
  stages: {
    save: ReviewProcessSaveStage;
    filter: ReviewProcessFilterStage;
    label: ReviewProcessLabelStage;
  };
  gates: {
    in: ReviewProcessGateSummary | null;
    out: ReviewProcessGateSummary | null;
  };
}
export interface ReviewProcessFee {
  currency: 'USD';
  filter: number;
  label: number;
  total: number;
  basis: 'ESTIMATE';
}
export interface ReviewProcessSaveStage {
  state: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL';
  total: number;
  done: number;
  inserted: number;
  alreadyPresent: number;
}
export interface ReviewProcessFilterStage {
  state: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL';
  total: number;
  done: number;
  keep: number;
  exclude: number;
  unresolved: number;
  noContent: number;
}
export interface ReviewProcessLabelStage {
  state: 'IDLE' | 'RUNNING' | 'PASS' | 'FAIL';
  total: number | null;
  done: number;
  unresolvedSkipped: number | null;
}
export interface ReviewProcessGateSummary {
  verdict: 'PASS' | 'FAIL';
  checks: ReviewProcessCheck[];
}
export interface ReviewProcessCheck {
  id:
    | 'source_unchanged'
    | 'review_ids_valid'
    | 'not_saved_twice'
    | 'jev_ready_versions_fixed'
    | 'fee_estimate_recorded'
    | 'all_rows_saved'
    | 'one_filter_result_each'
    | 'kept_all_labelled'
    | 'no_new_label_on_excluded'
    | 'no_failed_jev_call'
    | 'receipt_complete';
  ok: boolean;
  level: 'error' | 'warn';
  got: string;
}
export interface ReviewProcessStart {
  format: 'review-process-start-v1';
  runId: string;
  sourceSha256: string;
  status: 'RUNNING' | 'PASS' | 'FAIL';
  pid: number;
}
export interface RunsProgress {
  format: 'runs-progress-v1';
  generatedAt: string;
  runs: RunProgress[];
}
export interface RunProgress {
  runId: string;
  /**
   * @minItems 4
   * @maxItems 4
   */
  steps: ('IDLE' | 'RUNNING' | 'PASS' | 'FAIL' | 'WAIT_OWNER' | 'NOT_APPLICABLE')[];
  active: {
    step: 1 | 2 | 3 | 4;
    stage: ('save' | 'filter' | 'label') | null;
    done: number | null;
    total: number | null;
  } | null;
  finished: boolean;
  changedAt: string | null;
}
export interface ReviewProcessAutoRecord {
  format: 'review-process-auto-v1';
  runId: string;
  createdAt: string;
}
export interface ReviewProcessStateRecord {
  format: 'review-process-state-v1';
  runId: string;
  sourceSha256: string;
  status: 'RUNNING' | 'PASS' | 'FAIL';
  stage: ('save' | 'filter' | 'label') | null;
  pid: number | null;
  startedAt: string;
  finishedAt: string | null;
  retries: number;
  errorCode: ReviewProcessErrorCode | null;
  waiting: 'LABELS_BUSY' | null;
}
/**
 * m4/m3/<legacy|attemptId>.json: which step-4 source belongs to one M3 PASS source (by the M3 slip output hash), and the last failure of the automatic start after M3 when it stopped before any step-4 state was written. A start clears errorCode.
 */
export interface ReviewProcessLinkRecord {
  format: 'review-process-link-v1';
  runId: string;
  m3: string;
  m3OutputSha256: string | null;
  sourceSha256: string | null;
  errorCode: string | null;
  recordedAt: string;
}
export interface ReviewProcessGateFile {
  format: 'handoff-v1';
  module: 'M4';
  runId: string;
  skillVersion: string;
  verdict: 'PASS' | 'FAIL';
  inputSha256: string;
  outputSha256: string | null;
  checks: ReviewProcessCheck[];
  errorCode: ReviewProcessErrorCode | null;
  next: null;
}
export interface ReviewProcessPlan {
  format: 'review-process-plan-v1';
  runId: string;
  sourceSha256: string;
  versions: ReviewProcessVersions;
  calls: {
    filter: number;
    label: number;
  };
  fee: ReviewProcessFee;
  planSha256: string;
}
export interface ReviewProcessVersions {
  filterPolicy: string;
  filterPolicySha256: string;
  codebook: string;
  codebookSha256: string;
  model: string;
  labelUnresolved: boolean;
}
export interface ReviewProcessStageFile {
  format: 'review-process-stage-v1';
  runId: string;
  sourceSha256: string;
  stage: 'save' | 'filter' | 'label';
  attempts: ReviewProcessStageAttempt[];
}
export interface ReviewProcessStageAttempt {
  startedAt: string;
  finishedAt: string;
  errorCode: string | null;
  passes: {
    [k: string]: unknown;
  }[];
}
export interface ReviewProcessReceipt {
  format: 'review-process-receipt-v1';
  runId: string;
  sourceSha256: string;
  datasetId: string;
  planSha256: string;
  versions: ReviewProcessVersions;
  fee: ReviewProcessFee;
  counts: {
    rows: number;
    saved: number;
    inserted: number;
    alreadyPresent: number;
    firstVersionDiffers: number;
    keep: number;
    exclude: number;
    unresolved: number;
    noContent: number;
    labelEligible: number;
    labelled: number;
    unresolvedSkipped: number;
    olderLabelsOnNotKept: number;
  };
  calls: {
    filter: number;
    label: number;
  };
  retries: number;
  startedAt: string;
  finishedAt: string;
}
