/* Generated from automation-metric-results-capture-v1.schema.json. Do not edit by hand. */

export type Sha256 = string;

/**
 * The exact manifest emitted beside one normalized Metric results-page snapshot. The archive is published only after the page gate clears.
 */
export interface AutomationMetricResultsCaptureV1 {
  contractVersion: 'metric-results-capture-v1';
  captureId: string;
  specDigest: string;
  appliedFilters: Scope;
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
