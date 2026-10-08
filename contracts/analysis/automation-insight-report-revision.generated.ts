/* Generated from automation-insight-report-revision.schema.json. Do not edit by hand. */

/**
 * Owner report-revision request carrying either accepted coding receipts (v1) or one versioned receipt-free draft selection. Exactly one variant validates; historical v1 payloads match only the accepted branch.
 */
export type AutomationInsightReportRevisionRequest =
  AutomationInsightAcceptedReportRevisionRequest | AutomationInsightDraftReportRevisionRequest;
export type InsightDraftSelection = InsightDraftSelectionV1 | InsightDraftSelectionV2;

export interface AutomationInsightAcceptedReportRevisionRequest {
  contractVersion: 'automation-insight-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  acceptedInsight: InsightReportSelection;
}
export interface InsightRevisionSources {
  metric: Keep;
  nativeReview: Keep;
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
export interface AutomationInsightDraftReportRevisionRequest {
  contractVersion: 'automation-insight-report-revision-v1';
  requestKey: string;
  previousPairId: string;
  sources: InsightRevisionSources;
  draftInsight: InsightDraftSelection;
}
/**
 * Versioned receipt-free draft selection of one exact retained proposal. Zero receipts by construction; never an implicit latest, never approval.
 */
export interface InsightDraftSelectionV1 {
  contractVersion: 'insight-draft-select-v1';
  proposalId: string;
}
/**
 * Versioned receipt-free draft selection of one exact retained proposal. Zero receipts by construction; never an implicit latest, never approval.
 */
export interface InsightDraftSelectionV2 {
  contractVersion: 'insight-draft-select-v2';
  proposalId: string;
}
