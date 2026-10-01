/* Generated from report-version-create-request.schema.json. Do not edit by hand. */

export type ReportVersionCreateRequest = {
  [k: string]: unknown;
} & {
  contractVersion: '1.0.0';
  reportPresentation?: 'report-kit-v1';
  descriptiveMethodsPath?: string;
  reportKey: string;
  version: number;
  previousSemanticVersionId: Digest | null;
  sourceRequest: SourceBackedReportRequest;
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
