/* Generated from m03-narrative-evidence.schema.json. Do not edit by hand. */

export type Digest = string;
export type Coverage = {
  observedCount: number;
  missingCount: number;
  nonExactCount: number;
  complete: boolean;
} | null;

export interface M03NarrativeEvidence {
  contractVersion: '1.0.0';
  envelopeSha256: Digest;
  request: M03NarrativeEvidenceRequest;
  section: {
    sectionId: 'M03';
    title: 'Quy mô và diễn biến';
  };
  dependencies: {
    preparationSha256: Digest;
    readinessSha256: Digest;
    metricSetSha256: Digest;
    chartBundleSha256: Digest;
  };
  /**
   * @minItems 16
   * @maxItems 16
   */
  claims: [
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
    Claim,
  ];
  /**
   * @minItems 6
   * @maxItems 6
   */
  authoringRules: [
    (
      | 'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE'
      | 'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO'
      | 'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS'
      | 'NO_CROSS_PERIOD_COMPARISON'
      | 'NO_ADDITION_OF_OVERLAPPING_SCOPES'
      | 'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS'
    ),
    (
      | 'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE'
      | 'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO'
      | 'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS'
      | 'NO_CROSS_PERIOD_COMPARISON'
      | 'NO_ADDITION_OF_OVERLAPPING_SCOPES'
      | 'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS'
    ),
    (
      | 'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE'
      | 'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO'
      | 'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS'
      | 'NO_CROSS_PERIOD_COMPARISON'
      | 'NO_ADDITION_OF_OVERLAPPING_SCOPES'
      | 'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS'
    ),
    (
      | 'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE'
      | 'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO'
      | 'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS'
      | 'NO_CROSS_PERIOD_COMPARISON'
      | 'NO_ADDITION_OF_OVERLAPPING_SCOPES'
      | 'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS'
    ),
    (
      | 'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE'
      | 'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO'
      | 'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS'
      | 'NO_CROSS_PERIOD_COMPARISON'
      | 'NO_ADDITION_OF_OVERLAPPING_SCOPES'
      | 'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS'
    ),
    (
      | 'EVERY_NUMBER_MUST_COPY_ONE_CITED_CLAIM_VALUE'
      | 'MISSING_MUST_NOT_BE_RENDERED_OR_DESCRIBED_AS_ZERO'
      | 'NO_CAUSATION_FORECAST_MARKET_SHARE_OR_HEALTH_CLAIMS'
      | 'NO_CROSS_PERIOD_COMPARISON'
      | 'NO_ADDITION_OF_OVERLAPPING_SCOPES'
      | 'LIMIT_TO_M03_OBSERVED_FACTS_AND_EXPLICIT_LIMITATIONS'
    ),
  ];
}
export interface M03NarrativeEvidenceRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  profile: 'm03-narrative-evidence-v1';
  metricSetSha256: string;
  chartBundleSha256: string;
}
export interface Claim {
  claimId: string;
  statementKind: 'FACT';
  metric:
    | 'LISTING_COUNT'
    | 'SHOP_COUNT'
    | 'OBSERVED_REVENUE'
    | 'OBSERVED_UNITS'
    | 'REVENUE_MEMBERSHIP_DELTA'
    | 'UNITS_MEMBERSHIP_DELTA';
  context: 'all' | 'wide' | 'core' | 'all_to_wide' | 'all_to_core';
  value: string | null;
  valueState: 'OBSERVED' | 'MISSING';
  unit: 'LISTINGS' | 'SHOPS' | 'VND' | 'UNITS';
  coverage: Coverage;
  recordIndices: number[];
  evidencePointer: string;
  /**
   * @maxItems 3
   */
  chartIds:
    | []
    | ['m03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity']
    | [
        'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
        'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
      ]
    | [
        'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
        'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
        'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope' | 'm03-membership-revenue-sensitivity',
      ];
}
