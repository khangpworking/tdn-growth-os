/* Generated from automation-metric-results-capture-v1.schema.json. Do not edit by hand. */

export type Sha256 = string;
/**
 * Version of the chart-series payload the adapter derived from the same responses as this capture. Absent on captures written before the adapter emitted it.
 */
export type MetricDataVersion = 'metric-results-data-v2';
/**
 * Closed union of the row shapes the adapter writes. Branches are disjoint by `series`.
 */
export type ChartSeriesItem =
  ChartSeriesBreakdownRow | ChartSeriesHeadlineRow | ChartSeriesProductRow | ChartSeriesNamedRow | ChartSeriesTrendRow;
/**
 * Mapped platform of the row. The adapter writes `unknown` when the provider platform id is not in the live platform map, and the live map resolves to the two marketplaces the capture scope already allows (`scope.platforms` is bounded to these same two).
 */
export type ChartSeriesPlatform = 'shopee' | 'tiktok' | 'unknown';
/**
 * Provider value copied verbatim: a finite number, or a displayed string when the provider reports text. Absent when the provider entity carries no value, because the adapter drops undefined keys.
 */
export type ChartSeriesRawValue = number | string | null;
/**
 * Provenance pointer of the response the row was read from. The adapter always prefixes `response:`; the trailing path is the sanitized response path.
 */
export type ChartSeriesSource = string;

/**
 * The exact manifest emitted beside one normalized Metric results-page snapshot. The archive is published only after the page gate clears.
 */
export interface AutomationMetricResultsCaptureV1 {
  contractVersion: 'metric-results-capture-v1';
  captureId: string;
  specDigest: string;
  appliedFilters: AppliedFilters;
  resultCount: number;
  productPagination: Pagination;
  /**
   * @maxItems 3
   */
  views:
    | []
    | [
        {
          platform: 'all' | 'shopee' | 'tiktok' | 'unknown';
          pagesRead: number;
          source?: 'response' | 'dom';
        },
      ]
    | [
        {
          platform: 'all' | 'shopee' | 'tiktok' | 'unknown';
          pagesRead: number;
          source?: 'response' | 'dom';
        },
        {
          platform: 'all' | 'shopee' | 'tiktok' | 'unknown';
          pagesRead: number;
          source?: 'response' | 'dom';
        },
      ]
    | [
        {
          platform: 'all' | 'shopee' | 'tiktok' | 'unknown';
          pagesRead: number;
          source?: 'response' | 'dom';
        },
        {
          platform: 'all' | 'shopee' | 'tiktok' | 'unknown';
          pagesRead: number;
          source?: 'response' | 'dom';
        },
        {
          platform: 'all' | 'shopee' | 'tiktok' | 'unknown';
          pagesRead: number;
          source?: 'response' | 'dom';
        },
      ];
  sourceMap: {
    [k: string]: unknown;
  };
  /**
   * @minItems 1
   * @maxItems 256
   */
  files: [File, ...File[]];
  /**
   * @maxItems 256
   */
  screenshotSkips: {
    [k: string]: unknown;
  }[];
  archive: {
    rawResponses: string;
    normalizedSnapshot: 'snapshot.json';
    resultsHtml: string;
    screenshots: string[];
  };
  noReportFileRequested: true;
  metricDataVersion?: MetricDataVersion;
  chartSeries?: ChartSeries;
  captureGate?:
    | true
    | false
    | {
        cleared: boolean;
        status?: 'CLEARED' | 'NOT_CLEARED';
      }
    | {
        cleared?: boolean;
        status: 'CLEARED' | 'NOT_CLEARED';
      };
}
/**
 * W1 filters as read from the page. It repeats every snapshot `scope` property and adds the three page toggles the adapter observes but the snapshot scope does not model. The extra toggles stay optional so captures written before they were read still validate, and they are allowed here and nowhere else: the snapshot schema keeps its own closed `scope`. Intake compares the scope-shaped part against the snapshot scope.
 */
export interface AppliedFilters {
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
  platforms: ['shopee' | 'tiktok'] | ['shopee' | 'tiktok', 'shopee' | 'tiktok'];
  period: Period;
  category: string | null;
  /**
   * @maxItems 20
   */
  ticks:
    | []
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
   * @maxItems 50
   */
  advancedFilters: {
    label: string;
    displayed: string;
  }[];
  /**
   * @maxItems 50
   */
  exclusions: string[];
  /**
   * Page toggle: the smart-query switch the adapter read. Absent on captures written before the adapter read it.
   */
  smartQuery?: boolean;
  /**
   * Page toggle: the AI-normalisation switch the adapter read. Absent on captures written before the adapter read it.
   */
  aiNormalisation?: boolean;
  /**
   * The three page toggles the adapter maps by label. The object is closed so an unrecognized toggle cannot be smuggled through intake.
   */
  usefulFilters?: {
    fake?: boolean;
    gifts?: boolean;
    deleted?: boolean;
  };
}
export interface Period {
  startDate: string;
  endDate: string;
}
export interface Pagination {
  cap: number;
  totalShown: number | null;
  pageSize: number | null;
  pagesRead: number;
  rowsRead: number;
  truncated: boolean;
  byPlatform?: {
    [k: string]: PaginationStats;
  };
}
export interface PaginationStats {
  cap: number;
  totalShown: number | null;
  pageSize: number | null;
  pagesRead: number;
  rowsRead: number;
  truncated: boolean;
}
export interface File {
  path: string;
  sha256: Sha256;
  byteSize: number;
  mediaType: string;
  role?: string;
}
/**
 * Adapter-derived chart rows for this capture. Values are copied from provider responses without coercion, so this boundary asserts shape and provenance only; it does not assert non-negativity, units or provider authenticity.
 */
export interface ChartSeries {
  contractVersion: MetricDataVersion;
  /**
   * One row per provider aggregation entity, per platform headline, per product/shop/brand row and per shop-revenue interval. The adapter's row sources are bounded well below this cap (at most 200 product rows per platform view, at most 3 views), and intake already rejects any manifest above 8 MiB, so the cap only rejects implausible arrays.
   *
   * @maxItems 2000
   */
  series: ChartSeriesItem[];
  trendOffered: boolean;
  trendNote?: string | null;
}
export interface ChartSeriesBreakdownRow {
  series: 'priceRange' | 'province' | 'shopType' | 'category';
  platform: ChartSeriesPlatform;
  label: string | number;
  value?: ChartSeriesRawValue;
  source: ChartSeriesSource;
}
/**
 * Per-platform headline totals; missing provider values are explicit nulls, never summed across platforms.
 */
export interface ChartSeriesHeadlineRow {
  series: 'headline';
  platform: ChartSeriesPlatform;
  revenue: ChartSeriesRawValue;
  units: ChartSeriesRawValue;
  previousRevenue: ChartSeriesRawValue;
  previousUnits: ChartSeriesRawValue;
  source: ChartSeriesSource;
}
export interface ChartSeriesProductRow {
  series: 'topProducts';
  platform: ChartSeriesPlatform;
  name?: string | null;
  revenue?: ChartSeriesRawValue;
  units?: ChartSeriesRawValue;
  source: ChartSeriesSource;
}
export interface ChartSeriesNamedRow {
  series: 'topShops' | 'topBrands';
  platform: ChartSeriesPlatform;
  name?: string | null;
  revenue?: ChartSeriesRawValue;
  units?: ChartSeriesRawValue;
  previousRevenue?: ChartSeriesRawValue;
  previousUnits?: ChartSeriesRawValue;
  source: ChartSeriesSource;
}
export interface ChartSeriesTrendRow {
  series: 'trend';
  platform: ChartSeriesPlatform;
  shop?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  revenue?: ChartSeriesRawValue;
  units?: ChartSeriesRawValue;
  source: ChartSeriesSource;
}
