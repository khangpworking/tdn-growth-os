/* Generated from m08-tablet-quote-method.schema.json. Do not edit by hand. */

export type Digest = string;
export type OperatorPackCount = {
  [k: string]: unknown;
} & {
  declaration: 'OPERATOR_DECLARED';
  unit: 'TABLET';
  value: string;
  provenance: Provenance;
};
export type Provenance = {
  [k: string]: unknown;
} & {
  kind: 'SOURCE_DECLARED' | 'OWNER_DECLARED' | 'SCENARIO_ASSUMPTION';
  label: string;
  note: string;
  sourceRef: SourceRef | null;
};

export interface M08TabletQuoteMethod {
  contractVersion: '1.0.0';
  methodOutputId: Digest;
  sectionId: 'M08';
  sectionSliceId: 'M08/P4';
  sectionSliceTitle: 'Chuẩn hóa giá quote viên đơn lẻ';
  methodId: 'tablet-quote-normalization';
  methodVersion: '2.0.0';
  normalizerVersion: 'tablet-quote-normalization-v1';
  sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED';
  deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT';
  approvalState: 'UNREVIEWED';
  evidenceState: 'DECLARED_UNVERIFIED';
  sourceAuthenticity: 'NOT_AUTHENTICATED';
  sourcePackage: {
    packageId: string;
    packageKey: string;
    version: number;
    manifestArtifactSha256: Digest;
    packageContentSha256: Digest;
    sourceAcquiredAt: string | null;
    finalizedAt: string;
  };
  /**
   * @minItems 2
   * @maxItems 2
   */
  sources: [SourceBase, SourceBase];
  lineage: {
    rawSourceSha256: Digest;
    quoteInputRawSha256: Digest;
    canonicalQuoteInputSha256: Digest;
    normalizedQuoteOutputSha256: Digest;
  };
  quote: TabletQuoteOutput;
  /**
   * @minItems 8
   * @maxItems 16
   */
  limitations:
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
      ];
}
export interface SourceBase {
  role: 'tabletQuoteSource' | 'tabletQuoteInput';
  logicalPath: string;
  exportPath: string;
  sha256: Digest;
  byteSize: number;
  mediaType: 'application/json';
  evidenceFamily: string;
  representationRole: 'primary' | 'alternate' | 'structured' | 'derived';
  independence: 'independent' | 'non_independent';
  providerProvenance: 'verified' | 'provider_reported' | 'operator_supplied_unverified' | 'synthetic';
  provenanceBasis: string;
  period: Period | null;
}
export interface Period {
  start: string;
  end: string;
}
export interface TabletQuoteOutput {
  contractVersion: '1.0.0';
  methodVersion: 'tablet-quote-normalization-v1';
  quoteId: string;
  sourceRef: SourceRef;
  observedAt: string | null;
  observationPeriod: string | null;
  observationTimeState: 'KNOWN' | 'UNKNOWN';
  entityTitle: string;
  packText: string;
  packCount: OperatorPackCount | null;
  priceVnd: NonNegativeDecimalInput | null;
  currency: 'VND';
  priceState: 'DISPLAYED_LISTED' | 'CHECKOUT_FINAL';
  identityTier: 'TITLE_PACK_MATCH_ONLY' | 'EXACT_IDENTITY_DECLARED' | 'UNRESOLVED';
  variantStatus: 'DECLARED_MATCH' | 'UNKNOWN' | 'CONFLICT';
  gtinStatus: 'DECLARED_MATCH' | 'UNKNOWN' | 'CONFLICT';
  versionStatus: 'DECLARED_MATCH' | 'UNKNOWN' | 'CONFLICT';
  sourceRole: 'RETAILER' | 'BRAND' | 'MARKETPLACE' | 'OTHER';
  status: 'SCENARIO';
  approvalState: 'UNREVIEWED';
  evidenceState: 'DECLARED_UNVERIFIED';
  sourceAuthenticity: 'NOT_AUTHENTICATED';
  inputSha256: string;
  pricePerPack: CalculationOutput;
  pricePerTabletArithmetic: CalculationOutput;
  /**
   * @minItems 1
   */
  limitations: [string, ...string[]];
}
export interface SourceRef {
  artifactSha256: string;
  locator: string;
}
export interface NonNegativeDecimalInput {
  value: string;
  provenance: Provenance;
}
export interface CalculationOutput {
  state: 'AVAILABLE' | 'UNAVAILABLE';
  exactValue: Rational | null;
  displayValue: DisplayValue | null;
  missingInputs: string[];
  /**
   * @minItems 1
   */
  limitations: [string, ...string[]];
}
export interface Rational {
  numerator: string;
  denominator: string;
  reduced: true;
}
export interface DisplayValue {
  value: string;
  roundingVersion: 'HALF_EVEN_DECIMAL_2_VND_V1';
}
