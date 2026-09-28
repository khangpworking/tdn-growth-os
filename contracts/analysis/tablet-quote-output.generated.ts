/* Generated from tablet-quote-output.schema.json. Do not edit by hand. */

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
export type IntegerString = string;
export type PositiveIntegerString = string;
export type DisplayString = string;

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
  numerator: IntegerString;
  denominator: PositiveIntegerString;
  reduced: true;
}
export interface DisplayValue {
  value: DisplayString;
  roundingVersion: 'HALF_EVEN_DECIMAL_2_VND_V1';
}
