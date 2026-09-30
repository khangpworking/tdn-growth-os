/* Generated from metric-input-preparation-result.schema.json. Do not edit by hand. */

export type Digest = string;
export type WorkbookSource = BaseSource & {
  role?: 'workbook';
  [k: string]: unknown;
};
export type ManifestSource = BaseSource & {
  role?: 'manifest';
  [k: string]: unknown;
};
export type LabelsSource = BaseSource & {
  role?: 'labels';
  [k: string]: unknown;
};

export interface MetricInputPreparationResult {
  contractVersion: '1.0.0';
  preparationSha256: Digest;
  request: MetricInputPreparationRequest;
  requestSha256: Digest;
  workspace: {
    workspaceId: string;
    state: 'ACTIVE';
    snapshotSha256: Digest;
  };
  sourcePackage: {
    packageId: string;
    manifestArtifactSha256: Digest;
    packageContentSha256: Digest;
  };
  selectedSources: {
    workbook: WorkbookSource;
    manifest: ManifestSource;
    labels: LabelsSource | null;
  };
  normalizedInput: {
    artifactSha256: Digest;
    valueSha256: Digest;
    sourceCount: number;
    rowCount: number;
  };
  normalizationReceiptSha256: Digest;
}
export interface MetricInputPreparationRequest {
  contractVersion: '1.0.0';
  workspaceId: string;
  packageId: string;
  packageManifestSha256: string;
  workbookPath: string;
  manifestPath: string;
  labelsPath: string | null;
}
export interface BaseSource {
  role: 'workbook' | 'manifest' | 'labels';
  logicalPath: string;
  sha256: Digest;
  byteSize: number;
  mediaType: string;
  evidenceFamily: string;
  representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
  independence: 'independent' | 'non_independent';
  providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
  provenanceBasis: string;
}
