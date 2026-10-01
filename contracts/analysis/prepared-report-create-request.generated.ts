/* Generated from prepared-report-create-request.schema.json. Do not edit by hand. */

export type PreparedReportCreateRequest = {
  [k: string]: unknown;
} & {
  contractVersion: 'prepared-report-v1';
  reportPresentation?: 'report-kit-v1';
  descriptiveMethodsPath?: string;
  locatedInsightMethodsPath?: string;
  methodPacketsPath?: string;
  reportKey: string;
  version: number;
  previousSemanticVersionId: Digest | null;
  sourceRequest: SourceBackedReportRequest;
  preparationSha256: Digest;
  readinessSha256: Digest;
  sectionArtifactSha256: Digest;
};
export type Digest = string;

export interface SourceBackedReportRequest {
  contractVersion: '1.0.0';
  workspaceId: string;
  packageId: string;
  packageManifestSha256: string;
  workbookPath: string;
  manifestPath: string;
  labelsPath: string | null;
  tabletQuoteSourcePath?: string | null;
  tabletQuoteInputPath?: string | null;
  catalogSha256: string;
}
