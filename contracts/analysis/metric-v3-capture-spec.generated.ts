/* Generated from metric-v3-capture-spec.schema.json. Do not edit by hand. */

/**
 * Owner-confirmed preset with one or two keywords. Retained two-keyword captures stay on metric-v3-capture-spec-v1.
 */
export interface MetricV3CaptureSpec {
  contractVersion: 'metric-v3-capture-spec-v2';
  preset: Preset;
  /**
   * @minItems 2
   * @maxItems 2
   */
  windows: [Window, Window];
}
export interface Preset {
  /**
   * @minItems 1
   * @maxItems 2
   */
  keywords: [string] | [string, string];
  smartQuery: true;
  category: {
    id: string;
    label: string;
    /**
     * @minItems 4
     * @maxItems 4
     */
    children: [
      {
        id: string;
        label: string;
      },
      {
        id: string;
        label: string;
      },
      {
        id: string;
        label: string;
      },
      {
        id: string;
        label: string;
      },
    ];
  };
  usefulFilters: {
    fake: true;
    gifts: true;
    deleted: true;
  };
  advancedFilter: {
    firstField: 'rating_count';
    operator: '>';
    firstRate: 1;
    secondField: 'order_count';
    secondRate: 0.02;
  };
  /**
   * @minItems 2
   * @maxItems 2
   */
  shopTypes: ['mall' | 'regular', 'mall' | 'regular'];
  /**
   * @minItems 4
   * @maxItems 4
   */
  platforms: [
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
    'shopee' | 'lazada' | 'tiki' | 'tiktok',
  ];
  aiNormalisation: false;
  customizeCategory: false;
  /**
   * @maxItems 0
   */
  exclusions: [];
}
export interface Window {
  id: '30d' | '12m';
  period: {
    startDate: string;
    endDate: string;
  };
  intervalDays: 7 | 30;
}
