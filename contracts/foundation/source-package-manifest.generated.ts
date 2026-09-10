/* Generated from source-package-manifest.schema.json. Do not edit by hand. */

export interface SourcePackageManifest {
  contractVersion: '1.0.0';
  packageId: string;
  packageKey: string;
  version: number;
  sourceAcquiredAt: string | null;
  sourceLabel: string;
  finalizedAt: string;
  packageContentSha256: string;
  /**
   * @minItems 1
   */
  files: [File, ...File[]];
}
export interface File {
  path: string;
  sha256: string;
  byteSize: number;
  mediaType: string;
  evidenceFamily: string;
  representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
  independence: 'independent' | 'non_independent';
  providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
  provenanceBasis: string;
  period?: Period;
}
export interface Period {
  start: string;
  end: string;
}
