/* Generated from tablet-quote-input.schema.json. Do not edit by hand. */

export type OperatorPackCount = {
  [k: string]: unknown;
} & {
  declaration: 'OPERATOR_DECLARED';
  unit: 'TABLET';
  value: PositiveIntegerString;
  provenance: Provenance;
};
export type PositiveIntegerString = string;
export type Provenance = {
  [k: string]: unknown;
} & {
  kind: 'SOURCE_DECLARED' | 'OWNER_DECLARED' | 'SCENARIO_ASSUMPTION';
  label: string;
  note: string;
  sourceRef: SourceRef | null;
};
export type NonNegativeDecimalString = string;

export interface TabletQuoteInput {
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
}
export interface SourceRef {
  artifactSha256: string;
  locator: string;
}
export interface NonNegativeDecimalInput {
  value: NonNegativeDecimalString;
  provenance: Provenance;
}
