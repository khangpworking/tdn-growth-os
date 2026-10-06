/* Generated from automation-classified-report-revision.schema.json. Do not edit by hand. */

export interface AutomationClassifiedReportRevisionRequest {
  contractVersion: 'automation-classified-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: {
    metric: Keep;
    nativeReview: Keep;
  };
  acceptedMetric: MetricAcceptanceSelection;
}
export interface Keep {
  decision: 'KEEP';
}
export interface MetricAcceptanceSelection {
  adoptionId: string;
  /**
   * @minItems 1
   * @maxItems 1000
   */
  receiptIds: [string, ...string[]];
}
