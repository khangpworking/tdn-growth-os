/* Generated from report-version-record.schema.json. Do not edit by hand. */

export type Digest = string;

export interface ReportVersionRecord {
  contractVersion: '1.0.0';
  reportId: string;
  reportKey: string;
  versionId: string;
  version: number;
  previousSemanticVersionId: Digest | null;
  semanticVersionId: Digest;
  requestSha256: Digest;
  workspaceId: string;
  workspaceSnapshotSha256: Digest;
  sourcePackageId: string;
  sourcePackageManifestSha256: Digest;
  packageContentSha256: Digest;
  evidenceEnvelopeSha256: Digest;
  semanticContentSha256: Digest;
  reviewStateSha256: Digest;
  interpretationState: 'NONE';
  reviewState: 'UNREVIEWED';
  createdAt: string;
  /**
   * @minItems 1
   * @maxItems 40
   */
  artifacts: {
    fileName: string;
    sha256: Digest;
    mediaType: string;
    byteSize: number;
  }[];
  /**
   * @minItems 2
   * @maxItems 20
   */
  selectedSources: {
    ordinal: number;
    role: 'workbook' | 'manifest' | 'labels';
    logicalPath: string;
    sha256: Digest;
  }[];
}
