/* Generated from automation-metric-source-capture-v1.schema.json. Do not edit by hand. */

/**
 * Run-bound descriptor for a retained Metric results-page capture. It has no workbook path.
 */
export interface AutomationMetricSourceCaptureV1 {
  contractVersion: 'automation-metric-source-capture-v1';
  runId: string;
  workspaceId: string;
  runBindingSha256: string;
  keyword: string;
  captureId: string;
  specDigest: string;
  snapshotPath: string;
  manifestPath: string;
  sourceContextPath: string;
}
