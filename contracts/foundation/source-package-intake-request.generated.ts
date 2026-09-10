/* Generated from source-package-intake-request.schema.json. Do not edit by hand. */

export interface SourcePackageIntakeRequest {
  contractVersion: '1.0.0';
  packageKey: string;
  version: number;
  sourceAcquiredAt: string | null;
  sourceLabel: string;
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
