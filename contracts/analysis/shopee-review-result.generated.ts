/* Generated from shopee-review-result.schema.json. Do not edit by hand. */

export interface ShopeeReviewResult {
  contractVersion: '1.0.0';
  collectionId: string;
  collectionSha256: string;
  filterVersion: 'shopee-calcium-v3-adapter3';
  filterSha256: string;
  createdAt: string;
  summary: {
    mode: 'fixture' | 'live';
    requestedProducts: 5;
    maxCommentsPerProduct: number;
    selectedProducts: number;
    collected: number;
    kept: number;
    removed: number;
    invalidRows: number;
    duplicateRows: number;
    /**
     * @maxItems 2200
     */
    warnings: string[];
    /**
     * @maxItems 5
     */
    listings:
      | []
      | [
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
        ]
      | [
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
        ]
      | [
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
        ]
      | [
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
        ]
      | [
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
          {
            productKey: string;
            listingKey: string;
            collected: number;
            kept: number;
            status: 'sample_limit' | 'below_limit' | 'empty' | 'unavailable' | 'failed' | 'partial';
          },
        ];
    fetchedRows: number;
    providerReportedRows: number | null;
  };
  /**
   * @maxItems 2500
   */
  reviews: {
    reviewId: string;
    productKey: string;
    listingKey: string;
    text: string;
    content: string;
    target: string;
    guidedFieldBoundary: 'none' | 'explicit' | 'ambiguous-preserved';
    /**
     * @maxItems 500
     */
    signals: string[];
    /**
     * @maxItems 500
     */
    noise: string[];
    /**
     * @maxItems 500
     */
    negative: string[];
    score: number;
    decision: 'kept' | 'removed';
    reason: string;
    rawPageSha256: string;
    rawRowIndex: number;
  }[];
}
