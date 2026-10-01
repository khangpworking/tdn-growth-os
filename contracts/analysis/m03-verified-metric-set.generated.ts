/* Generated from m03-verified-metric-set.schema.json. Do not edit by hand. */

export type Digest = string;

export interface M03VerifiedMetricSet {
  contractVersion: '1.0.0';
  metricSetSha256: Digest;
  request: M03SectionRecipeRequest;
  section: {
    sectionId: 'M03';
    title: 'Quy mô và diễn biến';
    methodId: 'metric-scope-packet-totals';
    methodVersion: '1.0.0';
    recipeId: 'm03-scope-totals';
    recipeVersion: '1.0.0';
  };
  preparation: {
    preparationSha256: Digest;
    normalizedInputArtifactSha256: Digest;
    normalizedInputValueSha256: Digest;
  };
  readiness: {
    readinessSha256: Digest;
    profile: 'metric-preparation-readiness-v1';
    catalogId: string;
    catalogVersion: string;
    catalogSha256: Digest;
    state: 'READY_TO_CALCULATE';
  };
  calculation: {
    methodVersion: 'metric-scope-v1';
    rounding: 'percent-half-even-2-v1';
    verification: 'NORMALIZED_INPUT_ONLY';
    inputSha256: Digest;
  };
  scope: {
    key: string;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    acquiredAt: string | null;
  };
  labelPolicy: {
    codebookVersion: string;
    wideUnknownPolicy: 'exclude';
    unknownRetention: 'RETAIN_IN_ALL_EXCLUDE_FROM_WIDE';
  };
  /**
   * @minItems 1
   * @maxItems 100
   */
  sources: [
    {
      sha256: Digest;
      label: string;
      representationRole: 'primary' | 'structured' | 'derived';
      evidenceFamily: string;
      provenanceBasis: string;
    },
    ...{
      sha256: Digest;
      label: string;
      representationRole: 'primary' | 'structured' | 'derived';
      evidenceFamily: string;
      provenanceBasis: string;
    }[],
  ];
  /**
   * @minItems 3
   * @maxItems 3
   */
  scopes: [BaseScope, BaseScope, BaseScope];
  /**
   * @minItems 2
   * @maxItems 2
   */
  comparisons: [BaseComparison, BaseComparison];
  /**
   * @minItems 6
   * @maxItems 6
   */
  limitations: [
    (
      | 'NORMALIZED_INPUT_ONLY'
      | 'MISSING_VALUES_ARE_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE'
      | 'LISTING_IS_NOT_A_UNIQUE_PRODUCT'
      | 'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION'
    ),
    (
      | 'NORMALIZED_INPUT_ONLY'
      | 'MISSING_VALUES_ARE_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE'
      | 'LISTING_IS_NOT_A_UNIQUE_PRODUCT'
      | 'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION'
    ),
    (
      | 'NORMALIZED_INPUT_ONLY'
      | 'MISSING_VALUES_ARE_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE'
      | 'LISTING_IS_NOT_A_UNIQUE_PRODUCT'
      | 'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION'
    ),
    (
      | 'NORMALIZED_INPUT_ONLY'
      | 'MISSING_VALUES_ARE_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE'
      | 'LISTING_IS_NOT_A_UNIQUE_PRODUCT'
      | 'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION'
    ),
    (
      | 'NORMALIZED_INPUT_ONLY'
      | 'MISSING_VALUES_ARE_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE'
      | 'LISTING_IS_NOT_A_UNIQUE_PRODUCT'
      | 'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION'
    ),
    (
      | 'NORMALIZED_INPUT_ONLY'
      | 'MISSING_VALUES_ARE_NOT_ZERO'
      | 'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE'
      | 'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE'
      | 'LISTING_IS_NOT_A_UNIQUE_PRODUCT'
      | 'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION'
    ),
  ];
}
export interface M03SectionRecipeRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  recipeId: 'm03-scope-totals';
  recipeVersion: '1.0.0';
  preparationSha256: string;
  catalogSha256: string;
  readinessSha256: string;
}
export interface BaseScope {
  key: 'all' | 'wide' | 'core';
  recordIndices: number[];
  listingCount: number;
  shopCount: number;
  revenue: Total;
  units: Total;
  warnings: (
    | 'EMPTY_SCOPE'
    | 'MISSING_REVENUE'
    | 'MISSING_UNITS'
    | 'NON_EXACT_REVENUE'
    | 'NON_EXACT_UNITS'
    | 'ZERO_REVENUE'
    | 'LABELS_REQUIRE_ADJUDICATION'
  )[];
}
export interface Total {
  value: string | null;
  observedCount: number;
  missingCount: number;
  nonExactCount: number;
  complete: boolean;
}
export interface BaseComparison {
  from: 'all';
  to: 'wide' | 'core';
  revenueDelta: string | null;
  unitsDelta: string | null;
  removedRecordIndices: number[];
}
