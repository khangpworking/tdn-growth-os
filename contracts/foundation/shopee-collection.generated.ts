/* Generated from shopee-collection.schema.json. Do not edit by hand. */

export interface ShopeeCollection {
  contractVersion: '1.0.0';
  collectionId: string;
  runKey: string;
  requestSha256: string;
  createdAt: string;
  mode: 'fixture' | 'live';
  /**
   * @maxItems 5
   */
  selected:
    | []
    | [
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
      ]
    | [
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
      ]
    | [
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
      ]
    | [
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
      ]
    | [
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
        {
          platform: 'shopee';
          shopId: string;
          itemId: string;
          productKey: string;
          groupingBasis: string;
          productName: string;
          productUrl: string;
          periodRevenueVnd: string;
          revenuePrecision: 'exact';
        },
      ];
  /**
   * @maxItems 2005
   */
  selectionWarnings: string[];
  /**
   * @maxItems 100
   */
  collectorWarnings: string[];
  actor: {
    actorId: 'zen-studio/shopee-product-reviews-scraper';
    settings: {
      maxReviewsPerProduct: number;
      starFilter: 'all';
      contentFilter: 'all' | 'with comments';
      maxChargeUsd: number | null;
    };
    inputSha256: string;
    runId: string | null;
    datasetId: string | null;
    buildId: string | null;
    status: string;
    retrievedAt: string;
    providerTotalRows: number | null;
    usageTotalUsd: number | null;
    stopReason:
      | 'fixture_complete'
      | 'dataset_exhausted'
      | 'collection_limit_reached'
      | 'dataset_read_failed'
      | 'actor_terminal_failed'
      | 'actor_terminal_timed-out'
      | 'actor_terminal_aborted'
      | 'not_started_no_eligible_listings';
  };
  /**
   * @maxItems 25
   */
  pages: {
    sha256: string;
    byteSize: number;
    offset: number;
  }[];
}
