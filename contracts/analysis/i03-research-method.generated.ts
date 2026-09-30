/* Generated from i03-research-method.schema.json. Do not edit by hand. */

export type Digest = string;
export type Count = number;

export interface I03ResearchMethod {
  contractVersion: '1.0.0';
  methodOutputId: Digest;
  sectionId: 'I03';
  sectionTitle: 'Phương pháp nghiên cứu';
  methodId: 'metric-research-method-account';
  methodVersion: '2.0.0';
  deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT';
  approvalState: 'UNREVIEWED';
  sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED_NOT_PROVIDER_AUTHENTICATED';
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
    m02MethodOutputId: Digest;
    m02ArtifactSha256: Digest;
    m13MethodOutputId: Digest;
    m13ArtifactSha256: Digest;
    normalizedInputSha256: Digest;
    normalizationReceiptSha256: Digest;
    metricResultSha256: Digest;
  };
  normalization: {
    profileId: string;
    profileVersion: string;
    verification: string;
    rowDigestMethod: string;
    numericDisplay: string;
    inputSha256: Digest;
    provenance: string;
  };
  measurementFrame: {
    scopeKey: string;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    acquiredAt: string | null;
    currency: 'VND';
    wideUnknownPolicy: 'include' | 'exclude';
    membershipPolicy: 'ALL_ALL_ROWS; WIDE_EXCLUDES_OUTSIDE_AND_FOLLOWS_UNKNOWN_POLICY; CORE_CORE_CANDIDATE_ONLY';
    overlapPolicy: 'ALL_WIDE_CORE_ARE_NESTED_NON_ADDITIVE_SCOPES';
  };
  /**
   * @minItems 2
   * @maxItems 5
   */
  sourceInventory:
    | [
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
      ]
    | [
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
      ]
    | [
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
      ]
    | [
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
        {
          role: 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';
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
          m13SourcePointer: string;
        },
      ];
  coverage: {
    denominatorRecordCount: Count;
    selectedSourceCount: Count;
    mappedRecordCount: Count;
    recordLocatorCount: Count;
    revenueLocatorCount: Count;
    unitsLocatorCount: Count;
    labelDenominatorCount: Count;
    labelLocatorCount: Count;
    labeledRecordCount: Count;
    unlabeledRecordCount: Count;
    unknownLabelCount: Count;
    outsideLabelCount: Count;
    revenueMissingCount: Count;
    revenueObservedZeroCount: Count;
    revenueNonExactCount: Count;
    unitsMissingCount: Count;
    unitsObservedZeroCount: Count;
    unitsNonExactCount: Count;
    locatorLedgerPointer: 'm13-provenance-appendix.json#/recordLineage';
  };
  /**
   * @minItems 3
   * @maxItems 3
   */
  scopeMembership: [
    {
      scope: 'all' | 'wide' | 'core';
      status: 'CALCULATED' | 'BLOCKED_LABELS';
      memberCount: Count;
      denominatorRecordCount: Count;
      warningCodes: string[];
    },
    {
      scope: 'all' | 'wide' | 'core';
      status: 'CALCULATED' | 'BLOCKED_LABELS';
      memberCount: Count;
      denominatorRecordCount: Count;
      warningCodes: string[];
    },
    {
      scope: 'all' | 'wide' | 'core';
      status: 'CALCULATED' | 'BLOCKED_LABELS';
      memberCount: Count;
      denominatorRecordCount: Count;
      warningCodes: string[];
    },
  ];
  /**
   * @minItems 6
   * @maxItems 20
   */
  limitations:
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
  /**
   * @minItems 3
   * @maxItems 12
   */
  reopenConditions:
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string];
}
export interface Period {
  start: string;
  end: string;
}
