/* Generated from automation-metric-web-snapshot-v1.schema.json. Do not edit by hand. */

export type Platform = 'shopee' | 'tiktok';
export type Date = string;
export type ShortText = string;
export type NullableValue = Value | null;
/**
 * W3: revenue and share per platform.
 *
 * @minItems 1
 * @maxItems 2
 */
export type PlatformSplit =
  | [
      {
        platform: Platform;
        revenue: Value;
        share: Value;
      },
    ]
  | [
      {
        platform: Platform;
        revenue: Value;
        share: Value;
      },
      {
        platform: Platform;
        revenue: Value;
        share: Value;
      },
    ];
/**
 * W4: one point per month per platform.
 *
 * @maxItems 240
 */
export type Monthly = {
  platform: Platform;
  month: string;
  revenue: Value;
  units: NullableValue;
}[];
/**
 * W10: revenue share by shop type.
 *
 * @maxItems 2
 */
export type ShopType =
  | []
  | [
      {
        shopType: 'mall' | 'normal';
        share: Value;
      },
    ]
  | [
      {
        shopType: 'mall' | 'normal';
        share: Value;
      },
      {
        shopType: 'mall' | 'normal';
        share: Value;
      },
    ];

/**
 * Values captured from one results page for the same search as the xlsx capture (same captureId and specDigest). Every value keeps its label and displayed text; value is the raw number when the page data carried one. Groups W1-W3 are required; W4-W16 may be an explicit Absent marker. No computed or derived values.
 */
export interface AutomationMetricWebSnapshotV1 {
  contractVersion: 'automation-metric-web-snapshot-v1';
  captureId: string;
  specDigest: string;
  capturedAt: string;
  scope: Scope;
  groups: {
    W2_kpi: Kpi;
    W3_platformSplit: PlatformSplit;
    W4_monthly: Monthly | Absent;
    W5_category: Table | Absent;
    W6_priceLevel: Table | Absent;
    W7_top10Brand: Top10Share | Absent;
    W8_top10Shop: Top10Share | Absent;
    W9_brandByShopType: Table | Absent;
    W10_shopType: ShopType | Absent;
    W11_location: Table | Absent;
    W12_topProducts: Table | Absent;
    W13_topShops: Table | Absent;
    W14_topBrands: Table | Absent;
    W16_detailHistory: Table | Absent;
  };
}
/**
 * W1: filters as applied on the page.
 */
export interface Scope {
  /**
   * @minItems 1
   * @maxItems 10
   */
  keywords:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string];
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: [Platform] | [Platform, Platform];
  period: Period;
  category: ShortText | null;
  /**
   * @maxItems 20
   */
  ticks:
    | []
    | [ShortText]
    | [ShortText, ShortText]
    | [ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText]
    | [ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText, ShortText]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ]
    | [
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
        ShortText,
      ];
  /**
   * @maxItems 50
   */
  advancedFilters: {
    label: ShortText;
    displayed: string;
  }[];
  /**
   * @maxItems 50
   */
  exclusions: ShortText[];
}
export interface Period {
  startDate: Date;
  endDate: Date;
}
/**
 * W2: market overview headline values.
 */
export interface Kpi {
  revenue: KpiMetric;
  units: KpiMetric;
  soldListings: KpiMetric;
  shops: KpiMetric;
}
export interface KpiMetric {
  current: Value;
  changePct: NullableValue;
}
export interface Value {
  label: ShortText;
  displayed: string;
  value: number | null;
  unit: 'VND' | 'COUNT' | 'PERCENT' | 'RANK';
  precision: 'exact' | 'display_rounded';
  platform: 'shopee' | 'tiktok' | 'all';
  period: Period;
  sourcePointer: ShortText;
}
export interface Absent {
  absent: true;
  reason: 'NOT_ON_PAGE' | 'NOT_CAPTURED' | 'RECON_PENDING';
}
/**
 * Generic page table. Allowed column keys per group are enforced by the runtime validator.
 */
export interface Table {
  /**
   * @minItems 1
   * @maxItems 20
   */
  columns:
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
  /**
   * @maxItems 1000
   */
  rows: {
    cells: {
      [k: string]: Value | Text;
    };
  }[];
}
export interface Text {
  label: ShortText;
  text: string;
  sourcePointer: ShortText;
}
/**
 * W7/W8: top-10 share against the others.
 */
export interface Top10Share {
  top10: Value;
  others: Value;
}
