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
    runId: string | null;
    datasetId: string | null;
    buildId: string | null;
    status: string;
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
