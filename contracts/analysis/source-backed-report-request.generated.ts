/* Generated from source-backed-report-request.schema.json. Do not edit by hand. */

export type Digest = string;
export type LogicalPath = string;

export interface SourceBackedReportRequest {
  contractVersion: '1.0.0';
  workspaceId: string;
  packageId: string;
  packageManifestSha256: Digest;
  workbookPath: LogicalPath;
  manifestPath: LogicalPath;
  labelsPath: LogicalPath | null;
  catalogSha256: Digest;
}
