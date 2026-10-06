/* Generated from automation-metric-source-v2.schema.json. Do not edit by hand. */

export type LogicalPath = string;

/**
 * Prepared exact-byte operator export bound to one run and proposed scope before confirmation. runBindingSha256 hashes {runId,start,scope}, not a future confirmation timestamp. This does not authenticate provider, filters, category or measurement dates.
 */
export interface AutomationMetricSourceV2 {
  contractVersion: 'automation-metric-source-v2';
  runId: string;
  workspaceId: string;
  runBindingSha256: string;
  keyword: string;
  workbookPath: LogicalPath;
  manifestPath: LogicalPath;
  /**
   * Classification is separate; this original-export binding accepts no labels.
   */
  labelsPath: null;
  sourceContextPath: LogicalPath;
}
