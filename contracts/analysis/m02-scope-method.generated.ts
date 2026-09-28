/* Generated from m02-scope-method.schema.json. Do not edit by hand. */

export type Digest = string;
export type Count = number;

export interface M02ScopeMethod {
  contractVersion: '1.0.0';
  methodOutputId: Digest;
  methodId: 'metric-scope-packet-context';
  methodVersion: '2.0.0';
  sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED';
  scope: {
    key: string;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    acquiredAt: string | null;
    currency: 'VND';
  };
  measurement: {
    profileId: string;
    labelCodebookVersion: string;
    wideUnknownPolicy: 'include' | 'exclude';
    recordCount: number;
    labelIssueCount: number;
    recordLocatorCount: number;
    revenue: ObservationCoverage;
    units: ObservationCoverage;
    labels: {
      labeled: Count;
      unlabeled: Count;
      coreCandidate: Count;
      adjacent: Count;
      outside: Count;
      unknown: Count;
      human: Count;
      assistant: Count;
      unadjudicated: Count;
    };
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
   * @minItems 2
   * @maxItems 3
   */
  rawByteMappings:
    | [
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          packageFileSha256: Digest;
          rawByteSha256: Digest;
          byteSize: number;
          mediaType: string;
          exportPath: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          packageFileSha256: Digest;
          rawByteSha256: Digest;
          byteSize: number;
          mediaType: string;
          exportPath: string;
        },
      ]
    | [
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          packageFileSha256: Digest;
          rawByteSha256: Digest;
          byteSize: number;
          mediaType: string;
          exportPath: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          packageFileSha256: Digest;
          rawByteSha256: Digest;
          byteSize: number;
          mediaType: string;
          exportPath: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels';
          logicalPath: string;
          packageFileSha256: Digest;
          rawByteSha256: Digest;
          byteSize: number;
          mediaType: string;
          exportPath: string;
        },
      ];
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
export interface ObservationCoverage {
  missing: Count;
  observedZero: Count;
  observedValue: Count;
  exact: Count;
  displayRounded: Count;
  estimated: Count;
  unknownPrecision: Count;
  locatorCount: Count;
}
export interface Period {
  start: string;
  end: string;
}
