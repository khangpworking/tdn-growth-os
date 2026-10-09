/* Generated from insight-reader-input.schema.json. Do not edit by hand. */

/**
 * Exact retained Insight reader build identity; frozen scope comes from authenticated start/scope. Method references bind owning-service-verified retained outputs, never injected summaries or copied private corpus. No calculation, model call, Metric profile or implicit approval.
 */
export type InsightReaderInput =
  | InsightReaderInputV1
  | InsightReaderInputV2
  | InsightReaderInputV3
  | InsightReaderInputV4
  | InsightReaderInputV5
  | InsightReaderInputV6
  | InsightReaderInputV7;

export interface InsightReaderInputV1 {
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
export interface InsightReaderInputV2 {
  contractVersion: 'insight-reader-input-v2';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-v2';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'automation-report-kit-v21';
  scope: InsightReaderFrozenScope1;
  retainedMethods: InsightReaderMethodReference1[];
}
export interface InsightReaderFrozenScope1 {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod1;
}
export interface InsightReaderRequestedPeriod1 {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference1 {
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
export interface InsightReaderInputV3 {
  contractVersion: 'insight-reader-input-v3';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-v3';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'automation-report-kit-v22';
  scope: InsightReaderFrozenScope2;
  retainedMethods: InsightReaderMethodReference2[];
}
export interface InsightReaderFrozenScope2 {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod2;
}
export interface InsightReaderRequestedPeriod2 {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference2 {
  kind: 'PRIVATE_CORPUS' | 'LITERAL' | 'SOURCE_EVIDENCE';
  sha256: string;
}
export interface InsightReaderInputV4 {
  contractVersion: 'insight-reader-input-v4';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-v4';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'automation-report-kit-v23';
  scope: InsightReaderFrozenScope3;
  retainedMethods: {
    [k: string]: unknown;
  } & InsightReaderMethodReference3[];
}
export interface InsightReaderFrozenScope3 {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod3;
}
export interface InsightReaderRequestedPeriod3 {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference3 {
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
    | 'I14_SYNTHESIS'
    | 'CROSSCHECK';
  sha256: string;
}
export interface InsightReaderInputV5 {
  contractVersion: 'insight-reader-input-v5';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-v5';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'automation-report-kit-v25';
  scope: InsightReaderFrozenScope4;
  retainedMethods: {
    [k: string]: unknown;
  } & InsightReaderMethodReference4[];
}
export interface InsightReaderFrozenScope4 {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod4;
}
export interface InsightReaderRequestedPeriod4 {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference4 {
  kind: 'PRIVATE_CORPUS' | 'LITERAL' | 'SOURCE_EVIDENCE' | 'CODING' | 'PRIVATE_PROJECTION';
  sha256: string;
}
export interface InsightReaderInputV6 {
  contractVersion: 'insight-reader-input-v6';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-v6';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'automation-report-kit-v26';
  scope: InsightReaderFrozenScope5;
  retainedMethods: {
    [k: string]: unknown;
  } & InsightReaderMethodReference5[];
  personaProposalId: string;
  personaProposalSha256: string;
  personaSourcePairId: string;
  personaSourceSha256: string;
}
export interface InsightReaderFrozenScope5 {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod5;
}
export interface InsightReaderRequestedPeriod5 {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference5 {
  kind: 'PERSONA' | 'PERSONA_SOURCE' | 'SOURCE_EVIDENCE';
  sha256: string;
}
export interface InsightReaderInputV7 {
  contractVersion: 'insight-reader-input-v7';
  reportKind: 'INSIGHT';
  builderVersion: 'reader-report-insight-tiktok-v1';
  workspaceId: string;
  runId: string;
  draftPairId: string;
  semanticSha256: string;
  sourceReportSha256: string;
  frozenStartSha256: string;
  frozenScopeSha256: string;
  sourceRendererVersion: 'tiktok-reader-kit-v1';
  scope: InsightReaderFrozenScope6;
  retainedMethods: InsightReaderMethodReference6[];
}
export interface InsightReaderFrozenScope6 {
  keyword: string;
  definition: string;
  requestedPeriod: InsightReaderRequestedPeriod6;
}
export interface InsightReaderRequestedPeriod6 {
  startDate: string;
  endDate: string;
}
export interface InsightReaderMethodReference6 {
  kind: 'TIKTOK_CODING';
  sha256: string;
}
