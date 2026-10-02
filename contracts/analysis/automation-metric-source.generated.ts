/* Generated from automation-metric-source.schema.json. Do not edit by hand. */

export type LogicalPath = string;

/**
 * Explicit operator attachment of one retained Metric export to one confirmed research run. Binding only; not provider authenticity, filter, category or coverage proof.
 */
export interface AutomationMetricSource {
  contractVersion: 'automation-metric-source-v1';
  runId: string;
  workspaceId: string;
  runBindingSha256: string;
  keyword: string;
  workbookPath: LogicalPath;
  manifestPath: LogicalPath;
  /**
   * v1 admits no classification sidecar; WIDE/CORE stay blocked.
   */
  labelsPath: null;
  sourceContextPath: LogicalPath;
}
