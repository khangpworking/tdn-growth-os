/* Generated from keyword-list-draft-record-v3.schema.json. Do not edit by hand. */

export type Digest = string;
/**
 * Who drafted the keyword/exclusion data. Source and model-drafted provenance stay distinct; neither implies human approval.
 */
export type KeywordListProvenance = 'OPERATOR_SUPPLIED' | 'MODEL_DRAFTED';

/**
 * Additive retained keyword proposal with at least one exact confirmed Metric workbook title cell. Old Kalodata capture references keep their original meaning. Package identity is not provider authentication or product admission.
 */
export interface KeywordListDraftRecordV3 {
  contractVersion: 'l9-keyword-list-draft-record-v3';
  run: Run;
  scopeDigest: string;
  sourceSetDigest: Digest;
  /**
   * @minItems 1
   * @maxItems 500
   */
  salesNameRefs: [Items | MetricWorkbookTitleCellRef, ...(Items | MetricWorkbookTitleCellRef)[]];
  seeds: KeywordListDraftSeeds;
  dataVersion: string;
  category: string;
  model: KeywordListDraftModel;
  output: KeywordMeaningFilterData;
}
export interface Run {
  workspaceId: string;
  runId: string;
}
export interface Items {
  digest: string;
  locator: string;
  captureDigest: string;
}
export interface MetricWorkbookTitleCellRef {
  kind: 'metric-workbook-title-cell-v1';
  sourcePackage: SourceIdentity;
  workbook: {
    logicalPath: string;
    sha256: Digest;
    byteSize: number;
  };
  row: number;
  locator: string;
}
export interface SourceIdentity {
  packageId: string;
  manifestArtifactSha256: string;
  packageContentSha256: string;
}
export interface KeywordListDraftSeeds {
  /**
   * @minItems 1
   * @maxItems 500
   */
  productNames: [string, ...string[]];
  /**
   * @minItems 0
   * @maxItems 500
   */
  includeTerms: string[];
  /**
   * @minItems 0
   * @maxItems 500
   */
  excludeTerms: string[];
}
export interface KeywordListDraftModel {
  identity: string;
  promptVersion: string;
  prompt: string;
  promptSha256: string;
  configuration: KeywordDraftConfiguration | null;
}
export interface KeywordDraftConfiguration {
  contractVersion: 'keyword-draft-configuration-v1';
  providerId: 'cliproxy';
  modelId: string;
  temperature: number | null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}
export interface KeywordMeaningFilterData {
  contractVersion: 'l9-keyword-data-v1';
  dataVersion: string;
  category: string;
  provenance: KeywordListProvenance;
  /**
   * @minItems 1
   * @maxItems 500
   */
  keywords: [string, ...string[]];
  /**
   * @maxItems 500
   */
  exclusions: KeywordMeaningExclusion[];
}
export interface KeywordMeaningExclusion {
  term: string;
  reason: string;
}
