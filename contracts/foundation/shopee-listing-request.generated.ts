/* Generated from shopee-listing-request.schema.json. Do not edit by hand. */

export interface ShopeeListingRequest {
  contractVersion: '1.0.0';
  runKey: string;
  topic: string;
  period: {
    start: string;
    end: string;
  };
  source: {
    label: string;
    acquiredAt: string;
  };
  /**
   * @maxItems 1000
   */
  listings: {
    platform: 'shopee' | 'tiktokshop';
    shopId: string;
    itemId: string;
    productKey: string | null;
    groupingBasis: string | null;
    productName: string;
    productUrl: string | null;
    periodRevenueVnd: string | null;
    revenuePrecision: 'exact' | 'rounded' | 'unknown';
  }[];
}
