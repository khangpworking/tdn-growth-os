/* Generated from research-chart-spec.schema.json. Do not edit by hand. */

export type Digest = string;
export type Pointer = string;

export interface ResearchChartSpec {
  contractVersion: '1.0.0';
  chartSpecId: Digest;
  methodId: 'evidence-bound-chart-spec';
  methodVersion: '1.0.0';
  chartDataSha256: Digest;
  chartDataContractVersion: 'research-report-charts-v2';
  approvalState: 'UNREVIEWED';
  policies: {
    scopeOrder: ['all', 'wide', 'core'];
    scopeRelationship: 'OVERLAPPING_NON_ADDITIVE';
    missingValuePolicy: 'BLOCK_OR_UNAVAILABLE_NEVER_ZERO_IMPUTATION';
    observedZeroPolicy: 'VISIBLE_EXACT_ZERO_AT_ZERO_BASELINE';
    unknownPolicy: 'VISIBLE_AND_EXCLUDED_FROM_WIDE' | 'VISIBLE_AND_INCLUDED_IN_WIDE';
    percentScale: 'LINEAR_ZERO_TO_100';
    nonPercentScale: 'LINEAR_ZERO_BASELINE';
    signedDeltaScale: 'LINEAR_SIGNED_WITH_VISIBLE_ZERO';
    crossPanelComparability: 'LOCAL_MAX_GEOMETRY_NOT_CROSS_PANEL_COMPARABLE';
  };
  /**
   * @minItems 1
   * @maxItems 20
   */
  views:
    | [View]
    | [View, View]
    | [View, View, View]
    | [View, View, View, View]
    | [View, View, View, View, View]
    | [View, View, View, View, View, View]
    | [View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View, View]
    | [
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
        View,
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
   * @minItems 5
   * @maxItems 20
   */
  reopenConditions:
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
export interface View {
  viewId: string;
  sourceChartId:
    | 'scope-totals'
    | 'top-shop-share'
    | 'scope-membership-sensitivity'
    | 'group-composition'
    | 'top-shop-removal-sensitivity';
  sourcePointer: Pointer;
  sectionId: 'M03' | 'M04';
  title: string;
  state: 'READY' | 'PARTIAL' | 'BLOCKED' | 'EMPTY';
  markType: 'HORIZONTAL_BAR';
  orientation: 'HORIZONTAL';
  axes: Axes;
  relationship:
    | 'OVERLAPPING_NON_ADDITIVE'
    | 'CUMULATIVE_OVERLAPPING_NOT_DONUT'
    | 'FILTER_MEMBERSHIP_EFFECT_NOT_GROWTH'
    | 'WITHIN_SCOPE_COMPOSITION_OVERLAPPING_SCOPES'
    | 'LEADER_REMOVAL_SENSITIVITY_NOT_FORECAST';
  /**
   * @maxItems 100
   */
  marks: Mark[];
  /**
   * @maxItems 100
   */
  annotations: Annotation[];
  /**
   * @maxItems 50
   */
  blockers: string[];
  /**
   * @minItems 1
   * @maxItems 20
   */
  limitations:
    | [string]
    | [string, string]
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
export interface Axes {
  category: {
    orientation: 'VERTICAL';
    orderPolicy:
      | 'FIXED_SCOPE_ORDER'
      | 'FIXED_TOP_K_ORDER'
      | 'FIXED_WIDE_CORE_ORDER'
      | 'SOURCE_GROUP_KEY_ORDER'
      | 'FIXED_REMOVAL_METRIC_ORDER';
    /**
     * @maxItems 100
     */
    categoryOrder: string[];
  };
  value: {
    orientation: 'HORIZONTAL';
    unit: 'VND' | 'unit' | 'listing' | 'shop' | 'percent';
    scale: 'LINEAR_ZERO_TO_LOCAL_MAX' | 'LINEAR_ZERO_TO_100' | 'LINEAR_SIGNED_ZERO_CENTERED';
    zeroBaseline: true;
    domainPolicy: 'LOCAL_MAX' | 'FIXED_0_100' | 'SYMMETRIC_LOCAL_MAX_ABSOLUTE';
    geometryPolicy: 'SOURCE_BASIS_POINTS' | 'LOCAL_MAX_EXACT_VALUE' | 'LOCAL_MAX_ABSOLUTE_SIGNED_VALUE';
  };
}
export interface Mark {
  markId: Digest;
  seriesKey: string;
  categoryKey: string;
  valueText: string;
  unit: 'VND' | 'unit' | 'listing' | 'shop' | 'percent';
  chartDataValuePointer: Pointer;
  chartDataGeometryPointer: Pointer | null;
  chartDataMembershipPointer: Pointer | null;
  claimId: string | null;
  resultSha256: Digest;
  resultValuePointer: Pointer;
  resultMembershipPointer: Pointer | null;
  numeratorPointer: Pointer | null;
  denominatorPointer: Pointer | null;
  /**
   * @minItems 1
   * @maxItems 20
   */
  resultEvidencePointers:
    | [Pointer]
    | [Pointer, Pointer]
    | [Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ];
}
export interface Annotation {
  categoryKey: string;
  /**
   * @minItems 1
   * @maxItems 4
   */
  values:
    | [SupportingValue]
    | [SupportingValue, SupportingValue]
    | [SupportingValue, SupportingValue, SupportingValue]
    | [SupportingValue, SupportingValue, SupportingValue, SupportingValue];
}
export interface SupportingValue {
  key:
    | 'unitsDelta'
    | 'removedRecordCount'
    | 'listingCount'
    | 'observedRevenue'
    | 'remainingListingCount'
    | 'remainingObservedRevenue'
    | 'usedShopCount';
  valueText: string;
  unit: 'VND' | 'unit' | 'listing' | 'shop' | 'record';
  derivation: 'DIRECT' | 'ARRAY_LENGTH';
  chartDataValuePointer: Pointer;
  resultValuePointer: Pointer | null;
  /**
   * @minItems 1
   * @maxItems 20
   */
  resultEvidencePointers:
    | [Pointer]
    | [Pointer, Pointer]
    | [Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer, Pointer]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ]
    | [
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
        Pointer,
      ];
}
