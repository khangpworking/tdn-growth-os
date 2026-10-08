/* Generated from reader-report-input.schema.json. Do not edit by hand. */

/**
 * Versioned reader inputs. Historical 1.0.0/1.1.0 retain numeric constraints; 1.2.0 preserves null separately from observed zero and never authorizes cross-platform totals.
 */
export type ReaderReportInput = {
  [k: string]: unknown;
} & {
  contractVersion: '1.0.0' | '1.1.0' | '1.2.0';
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
  source?: Source;
  /**
   * Opaque web snapshot (automation-metric-web-snapshot-v1). Allowed only in 1.1.0; validated at runtime.
   */
  webSnapshot?: {
    [k: string]: unknown;
  };
  webSnapshotSha256?: string;
  /**
   * Retained workbook identity supplied by the application, never inferred from the displayed row values.
   */
  rowLineage?: {
    sha256: string;
  };
};
export type Text = string;
export type SegmentKey = string;
export type Pattern = string;
export type Platform = 'shopee' | 'tiktok';
export type Date = string;

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
  rev: number | null;
  units: number | null;
  asp: number | null;
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
    revenueVnd: number | null;
    soldListings: number | null;
    shops: number | null;
    units: number | null;
  };
  platformBreakdown: {
    shopee?: PlatformDisplay;
    tiktok?: PlatformDisplay;
  };
}
export interface PlatformDisplay {
  displayedRevenueVnd: number | null;
}
