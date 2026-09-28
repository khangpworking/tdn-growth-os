/* Generated from m13-provenance-appendix.schema.json. Do not edit by hand. */

export type Digest = string;
export type Count = number;

export interface M13ProvenanceAppendix {
  contractVersion: '1.0.0';
  methodOutputId: Digest;
  methodId: 'metric-scope-packet-provenance';
  methodVersion: '2.0.0';
  sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED';
  sourcePackage: {
    packageId: string;
    packageKey: string;
    version: number;
    manifestArtifactSha256: Digest;
    packageContentSha256: Digest;
    sourceAcquiredAt: string | null;
    finalizedAt: string;
  };
  lineage: {
    normalizedInputSha256: Digest;
    normalizationReceiptSha256: Digest;
    metricResultSha256: Digest;
  };
  /**
   * @minItems 2
   * @maxItems 3
   */
  sources:
    | [
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          exportPath: string;
          sha256: Digest;
          byteSize: number;
          mediaType: string;
          evidenceFamily: string;
          representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
          independence: 'independent' | 'non_independent';
          providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
          provenanceBasis: string;
          period: Period | null;
        },
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          exportPath: string;
          sha256: Digest;
          byteSize: number;
          mediaType: string;
          evidenceFamily: string;
          representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
          independence: 'independent' | 'non_independent';
          providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
          provenanceBasis: string;
          period: Period | null;
        },
      ]
    | [
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          exportPath: string;
          sha256: Digest;
          byteSize: number;
          mediaType: string;
          evidenceFamily: string;
          representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
          independence: 'independent' | 'non_independent';
          providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
          provenanceBasis: string;
          period: Period | null;
        },
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          exportPath: string;
          sha256: Digest;
          byteSize: number;
          mediaType: string;
          evidenceFamily: string;
          representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
          independence: 'independent' | 'non_independent';
          providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
          provenanceBasis: string;
          period: Period | null;
        },
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          exportPath: string;
          sha256: Digest;
          byteSize: number;
          mediaType: string;
          evidenceFamily: string;
          representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
          independence: 'independent' | 'non_independent';
          providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
          provenanceBasis: string;
          period: Period | null;
        },
      ];
  /**
   * @maxItems 10000
   */
  recordLineage: {
    recordIndex: number;
    recordPointer: string;
    record: EvidenceRef;
    revenue: EvidenceRef;
    units: EvidenceRef;
    label: EvidenceRef | null;
  }[];
  coverage: {
    recordCount: Count;
    recordLocatorCount: Count;
    revenueLocatorCount: Count;
    unitsLocatorCount: Count;
    labelLocatorCount: Count;
    unlabeledRecordCount: Count;
  };
  /**
   * @minItems 3
   * @maxItems 20
   */
  limitations:
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string, string, string]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ]
    | [
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
        string,
      ];
}
export interface Period {
  start: string;
  end: string;
}
export interface EvidenceRef {
  sourceSha256: Digest;
  locator: string;
}
