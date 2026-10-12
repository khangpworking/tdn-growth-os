/* Generated from research-automation-metric-capture-intake-api.schema.json. Do not edit by hand. */

/**
 * Owner-authenticated intake for an exact, gate-cleared Metric results-page capture. Preparation stores evidence only; it does not call Metric, wake a worker or admit a source.
 */
export type ResearchAutomationMetricCaptureIntakeApi =
  | ResearchAutomationMetricCapturePrepareRequest
  | ResearchAutomationMetricCapturePrepareReceipt
  | ResearchAutomationPreparedMetricCaptureList;
export type Uuid = string;
export type Sha256 = string;

export interface ResearchAutomationMetricCapturePrepareRequest {
  contractVersion: 'automation-metric-capture-prepare-v1';
  requestKey: string;
  expectedRevision: number;
  sourceContext: string;
}
export interface ResearchAutomationMetricCapturePrepareReceipt {
  contractVersion: 'automation-metric-capture-prepared-v1';
  requestKey: string;
  packageId: Uuid;
  state: 'PREPARED_NOT_ADMITTED';
  exactRetry: boolean;
  recordCount: number;
  sourceLabel: 'results-page capture';
  capture: Capture;
  provenance: 'RESULTS_PAGE_CAPTURE';
}
export interface Capture {
  captureId: string;
  specDigest: Sha256;
  keyword: string;
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: ['shopee' | 'tiktok'] | ['shopee' | 'tiktok', 'shopee' | 'tiktok'];
  measurementPeriod: Period;
  truncation: Truncation;
}
export interface Period {
  startDate: string;
  endDate: string;
}
export interface Truncation {
  cap: number;
  totalShown: number | null;
  pagesRead: number;
  rowsRead: number;
  truncated: boolean;
}
export interface ResearchAutomationPreparedMetricCaptureList {
  contractVersion: 'automation-prepared-metric-capture-list-v1';
  workspaceId: Uuid;
  runId: Uuid;
  /**
   * @maxItems 100
   */
  sources: PreparedEntry[];
}
export interface PreparedEntry {
  packageId: Uuid;
  recordCount: number;
  request: ResearchAutomationMetricCapturePrepareRequest;
  capture: Capture;
  provenance: 'RESULTS_PAGE_CAPTURE';
}
