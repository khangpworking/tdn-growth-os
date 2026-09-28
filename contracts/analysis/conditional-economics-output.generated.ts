/* Generated from conditional-economics-output.schema.json. Do not edit by hand. */

/**
 * @minItems 1
 * @maxItems 4
 */
export type RequestedOutputs =
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
export type Provenance = {
  [k: string]: unknown;
} & {
  kind: 'SOURCE_DECLARED' | 'OWNER_DECLARED' | 'SCENARIO_ASSUMPTION';
  label: string;
  note: string;
  sourceRef: SourceRef | null;
};
export type ExcludedTerm = {
  [k: string]: unknown;
} & {
  status: 'NOT_MODELED' | 'SCENARIO_ASSUMED_ZERO';
  value: NonNegativeDecimalInput | null;
  provenance: Provenance;
  note: string;
};
export type IntegerString = string;
export type PositiveIntegerString = string;
export type DisplayString = string;

export interface ConditionalEconomicsOutput {
  contractVersion: '1.0.0';
  methodVersion: 'conditional-economics-v1';
  scenarioId: string;
  currency: 'VND';
  unitBasis: 'VND_PER_UNIT';
  requestedOutputs: RequestedOutputs;
  status: 'SCENARIO';
  approvalState: 'UNREVIEWED';
  evidenceState: 'DECLARED_UNVERIFIED';
  sourceAuthenticity: 'NOT_AUTHENTICATED';
  inputSha256: string;
  feeBasePolicy: FeeBasePolicy;
  feeBindings: FeeBindings;
  inputProvenance: {
    pricePerUnit: Provenance | null;
    cogsPerUnit: Provenance | null;
    otherVariableCostPerUnit: Provenance | null;
    sharedMarketingPerUnit: Provenance | null;
    targetContributionPerUnit: Provenance | null;
    unitsPerOrder: Provenance | null;
    commissionRate: Provenance | null;
    transactionRate: Provenance | null;
    processingFeePerOrder: Provenance | null;
  };
  /**
   * @minItems 1
   */
  modeledTerms: [
    (
      | 'pricePerUnit'
      | 'cogsPerUnit'
      | 'otherVariableCostPerUnit'
      | 'sharedMarketingPerUnit'
      | 'targetContributionPerUnit'
      | 'unitsPerOrder'
      | 'commissionRate'
      | 'transactionRate'
      | 'processingFeePerOrder'
    ),
    ...(
      | 'pricePerUnit'
      | 'cogsPerUnit'
      | 'otherVariableCostPerUnit'
      | 'sharedMarketingPerUnit'
      | 'targetContributionPerUnit'
      | 'unitsPerOrder'
      | 'commissionRate'
      | 'transactionRate'
      | 'processingFeePerOrder'
    )[],
  ];
  excludedTerms: ExcludedTerms;
  outputs: {
    contributionPerUnit?: CalculationOutput;
    pmin?: CalculationOutput;
    cmax?: CalculationOutput;
    mmax?: CalculationOutput;
  };
  /**
   * @minItems 1
   */
  limitations: [string, ...string[]];
}
export interface FeeBasePolicy {
  percentageBase: 'N_TIMES_PRICE_PER_ORDER';
  processingBase: 'PER_DELIVERED_ORDER';
}
export interface FeeBindings {
  commissionRate: FeeBinding;
  transactionRate: FeeBinding;
  processingFeePerOrder: FeeBinding;
}
export interface FeeBinding {
  categoryPath: string;
  bindingState: 'ASSUMED_EXACT_MATCH' | 'UNCONFIRMED';
  provenance: Provenance;
}
export interface SourceRef {
  artifactSha256: string;
  locator: string;
}
export interface ExcludedTerms {
  sellerBusinessTax: ExcludedTerm;
  fixedOverhead: ExcludedTerm;
  returnsRefunds: ExcludedTerm;
  vouchersDiscounts: ExcludedTerm;
  shippingSubsidy: ExcludedTerm;
  settlementAdjustments: ExcludedTerm;
  affiliateOrOtherFees: ExcludedTerm;
  demandConversion: ExcludedTerm;
  inventoryCapital: ExcludedTerm;
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
  heldFixed: string[];
  warnings: ('NEGATIVE_CONTRIBUTION' | 'INFEASIBLE_THRESHOLD' | 'NON_POSITIVE_PRICE_THRESHOLD')[];
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
  roundingVersion: 'CEIL_INTEGER_VND_V1' | 'HALF_EVEN_DECIMAL_2_VND_V1';
}
