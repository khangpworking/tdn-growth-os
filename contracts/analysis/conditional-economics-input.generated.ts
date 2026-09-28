/* Generated from conditional-economics-input.schema.json. Do not edit by hand. */

export type NonNegativeDecimalString = string;
export type Provenance = {
  [k: string]: unknown;
} & {
  kind: 'SOURCE_DECLARED' | 'OWNER_DECLARED' | 'SCENARIO_ASSUMPTION';
  label: string;
  note: string;
  sourceRef: SourceRef | null;
};
export type DecimalString = string;
export type PositiveIntegerString = string;
export type ExcludedTerm = {
  [k: string]: unknown;
} & {
  status: 'NOT_MODELED' | 'SCENARIO_ASSUMED_ZERO';
  value: NonNegativeDecimalInput | null;
  provenance: Provenance;
  note: string;
};

export interface ConditionalEconomicsInput {
  contractVersion: '1.0.0';
  methodVersion: 'conditional-economics-v1';
  scenarioId: string;
  currency: 'VND';
  unitBasis: 'VND_PER_UNIT';
  /**
   * @minItems 1
   * @maxItems 4
   */
  requestedOutputs:
    | ['contributionPerUnit' | 'pmin' | 'cmax' | 'mmax']
    | ['contributionPerUnit' | 'pmin' | 'cmax' | 'mmax', 'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax']
    | [
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
      ]
    | [
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
        'contributionPerUnit' | 'pmin' | 'cmax' | 'mmax',
      ];
  feeBasePolicy: {
    percentageBase: 'N_TIMES_PRICE_PER_ORDER';
    processingBase: 'PER_DELIVERED_ORDER';
  };
  fees: {
    commissionRate: NonNegativeDecimalInput | null;
    transactionRate: NonNegativeDecimalInput | null;
    processingFeePerOrder: NonNegativeDecimalInput | null;
  };
  feeBindings: {
    commissionRate: FeeBinding;
    transactionRate: FeeBinding;
    processingFeePerOrder: FeeBinding;
  };
  inputs: {
    pricePerUnit: NonNegativeDecimalInput | null;
    cogsPerUnit: NonNegativeDecimalInput | null;
    otherVariableCostPerUnit: NonNegativeDecimalInput | null;
    sharedMarketingPerUnit: NonNegativeDecimalInput | null;
    targetContributionPerUnit: DecimalInput | null;
    unitsPerOrder: PositiveIntegerInput | null;
  };
  excludedTerms: {
    sellerBusinessTax: ExcludedTerm;
    fixedOverhead: ExcludedTerm;
    returnsRefunds: ExcludedTerm;
    vouchersDiscounts: ExcludedTerm;
    shippingSubsidy: ExcludedTerm;
    settlementAdjustments: ExcludedTerm;
    affiliateOrOtherFees: ExcludedTerm;
    demandConversion: ExcludedTerm;
    inventoryCapital: ExcludedTerm;
  };
}
export interface NonNegativeDecimalInput {
  value: NonNegativeDecimalString;
  provenance: Provenance;
}
export interface SourceRef {
  artifactSha256: string;
  locator: string;
}
export interface FeeBinding {
  categoryPath: string;
  bindingState: 'ASSUMED_EXACT_MATCH' | 'UNCONFIRMED';
  base: 'N_TIMES_PRICE_PER_ORDER' | 'SINGLE_UNIT_PRICE_PER_ORDER' | 'PER_DELIVERED_ORDER' | 'OTHER_OR_UNCONFIRMED';
  provenance: Provenance;
}
export interface DecimalInput {
  value: DecimalString;
  provenance: Provenance;
}
export interface PositiveIntegerInput {
  value: PositiveIntegerString;
  provenance: Provenance;
}
