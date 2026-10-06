/* Generated from reader-report-input.schema.json. Do not edit by hand. */

export type Text = string;
export type SegmentKey = string;
export type Pattern = string;
export type Platform = 'shopee' | 'tiktok';
export type Date = string;

/**
 * Semantic input for one owner-facing reader report: the classification profile, the per-listing rows and what the source screen displayed. Numbers only; no narrative.
 */
export interface ReaderReportInput {
  contractVersion: '1.0.0';
  profile: Profile;
  /**
   * @minItems 1
   * @maxItems 2
   */
  platforms: [Platform] | [Platform, Platform];
  /**
   * @minItems 1
   * @maxItems 20000
   */
  rows: [Row, ...Row[]];
  source: Source;
}
export interface Profile {
  slug: string;
  product: Text;
  status: 'proposed' | 'approved';
  segments: TextMap;
  short: TextMap;
  /**
   * @minItems 1
   * @maxItems 30
   */
  core: [SegmentKey, ...SegmentKey[]];
  /**
   * @maxItems 30
   */
  non: SegmentKey[];
  labelOverrides?: TextMap;
  /**
   * @minItems 1
   * @maxItems 500
   */
  rules: [Rule, ...Rule[]];
  primaryNouns?: {
    [k: string]: Pattern;
  };
  stripBeforePrimary?: Pattern;
  measure?: {
    unit: Text;
    re: Pattern;
    toBase: {
      [k: string]: number;
    };
  };
  /**
   * Pairs of [label, title pattern].
   *
   * @maxItems 30
   */
  signals: [Pattern, Pattern][];
  benchmark?: {
    label: Text;
    titleRe?: Pattern;
    /**
     * @minItems 2
     * @maxItems 2
     */
    measureRange?: [number, number];
    excludeRe?: Pattern;
  };
  brandAlias?: TextMap1;
}
export interface TextMap {
  [k: string]: Text;
}
export interface Rule {
  seg: SegmentKey;
  when: Condition;
  why?: Text;
}
export interface Condition {
  /**
   * @maxItems 20000
   */
  idIn?: number[];
  labelEq?: Text;
  labelPrefix?: Text;
  titleRe?: Pattern;
  notTitleRe?: Pattern;
  aspGte?: number;
  measureGte?: number;
  measureMinGte?: number;
  /**
   * @maxItems 50
   */
  primaryIn?: Text[];
  /**
   * @minItems 1
   * @maxItems 50
   */
  any?: [Condition, ...Condition[]];
}
/**
 * Lower-case brand spelling to the canonical brand name.
 */
export interface TextMap1 {
  [k: string]: Text;
}
export interface Row {
  i: number;
  platform: Platform;
  listing: string;
  shop: string;
  shopName?: string;
  cat: string;
  rev: number;
  units: number;
  asp: number;
  brand: string;
  title: string;
  start?: Date | null;
  label?: string;
}
/**
 * What the export screen displayed for the broader query. Used only to state coverage of the exported rows.
 */
export interface Source {
  measurementPeriod: {
    start: Date;
    end: Date;
  };
  rowCap: number;
  displayedHeadlines: {
    revenueVnd: number;
    soldListings: number;
    shops: number;
    units: number;
  };
  platformBreakdown: {
    shopee?: PlatformDisplay;
    tiktok?: PlatformDisplay;
  };
}
export interface PlatformDisplay {
  displayedRevenueVnd: number;
}
