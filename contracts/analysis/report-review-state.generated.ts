/* Generated from report-review-state.schema.json. Do not edit by hand. */

export interface ReportReviewState {
  contractVersion: '1.0.0';
  semanticVersionId: string;
  state: 'UNREVIEWED';
  /**
   * @maxItems 0
   */
  decisionArtifacts: unknown[];
  /**
   * @minItems 1
   * @maxItems 10
   */
  limitations: string[];
}
