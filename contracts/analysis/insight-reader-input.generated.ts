/* Generated from insight-reader-input.schema.json. Do not edit by hand. */

/**
 * Exact retained Insight reader build identity; frozen scope comes from authenticated start/scope. Method references bind owning-service-verified retained outputs, never injected summaries or copied private corpus. No calculation, model call, Metric profile or implicit approval.
 */
export interface InsightReaderInput {
  contractVersion: 'insight-reader-input-v1';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-v1';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'automation-report-kit-v17' | 'automation-report-kit-v18' | 'automation-report-kit-v19';
  scope: InsightReaderFrozenScope;
  retainedMethods: InsightReaderMethodReference[];
}
export interface InsightReaderFrozenScope {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod;
}
export interface InsightReaderRequestedPeriod {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference {
  kind:
    | 'CODING'
    | 'LITERAL'
    | 'LOCATED'
    | 'NATIVE'
    | 'CORPUS'
    | 'BOUNDED'
    | 'SOURCE_EVIDENCE'
    | 'SOURCE_CLAIMS'
    | 'DECISION_PACKET'
    | 'DECISION_SYNTHESIS'
    | 'I14_ADMISSION'
    | 'I14_SYNTHESIS';
  sha256: string;
}
