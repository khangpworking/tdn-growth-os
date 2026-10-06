/* Generated from automation-insight-report-revision.schema.json. Do not edit by hand. */

export interface AutomationInsightReportRevisionRequest {
  contractVersion: 'automation-insight-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: {
    metric: Keep;
    nativeReview: Keep;
  };
  acceptedInsight: InsightReportSelection;
}
export interface Keep {
  decision: 'KEEP';
}
export interface InsightReportSelection {
  proposalId: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  receiptIds: [string, ...string[]];
}
