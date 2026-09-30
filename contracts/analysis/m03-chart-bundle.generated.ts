/* Generated from m03-chart-bundle.schema.json. Do not edit by hand. */

export type Digest = string;
export type ScopeChart = {
  [k: string]: unknown;
} & {
  [k: string]: unknown;
} & {
  chartId: 'm03-observed-revenue-by-scope' | 'm03-observed-units-by-scope';
  kind: 'BAR';
  title: string;
  measure: 'OBSERVED_REVENUE' | 'OBSERVED_UNITS';
  unit: 'VND' | 'UNITS';
  /**
   * @minItems 3
   * @maxItems 3
   */
  points: [ScopePoint, ScopePoint, ScopePoint];
};

export interface M03ChartBundle {
  contractVersion: '1.0.0';
  chartBundleSha256: Digest;
  request: M03ChartBundleRequest;
  section: {
    sectionId: 'M03';
    title: 'Quy mô và diễn biến';
  };
  metricSet: {
    metricSetSha256: Digest;
    preparationSha256: Digest;
    readinessSha256: Digest;
    methodVersion: 'metric-scope-v1';
    rounding: 'percent-half-even-2-v1';
  };
  /**
   * @minItems 3
   * @maxItems 3
   */
  charts: [ScopeChart | SensitivityChart, ScopeChart | SensitivityChart, ScopeChart | SensitivityChart];
  /**
   * @minItems 3
   * @maxItems 3
   */
  limitations: [
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'SCOPES_OVERLAP_AND_MUST_NOT_BE_STACKED_OR_SUMMED'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
    ),
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'SCOPES_OVERLAP_AND_MUST_NOT_BE_STACKED_OR_SUMMED'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
    ),
    (
      | 'NULL_VALUES_MUST_RENDER_AS_MISSING_NOT_ZERO'
      | 'SCOPES_OVERLAP_AND_MUST_NOT_BE_STACKED_OR_SUMMED'
      | 'SENSITIVITY_IS_MEMBERSHIP_DIFFERENCE_NOT_GROWTH'
    ),
  ];
}
export interface M03ChartBundleRequest {
  contractVersion: '1.0.0';
  sectionId: 'M03';
  chartProfile: 'm03-chart-profile-v1';
  metricSetSha256: string;
}
export interface ScopePoint {
  scope: 'all' | 'wide' | 'core';
  value: string | null;
  observedCount: number;
  missingCount: number;
  nonExactCount: number;
  complete: boolean;
  recordIndices: number[];
}
export interface SensitivityChart {
  chartId: 'm03-membership-revenue-sensitivity';
  kind: 'DIVERGING_BAR';
  title: 'Độ nhạy doanh thu quan sát theo membership';
  measure: 'REVENUE_DELTA_FROM_ALL';
  unit: 'VND';
  /**
   * @minItems 2
   * @maxItems 2
   */
  points: [SensitivityPoint, SensitivityPoint];
}
export interface SensitivityPoint {
  to: 'wide' | 'core';
  value: string | null;
  removedRecordIndices: number[];
}
