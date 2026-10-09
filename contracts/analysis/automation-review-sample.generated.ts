/* Generated from automation-review-sample.schema.json. Do not edit by hand. */

/**
 * Author-free mechanical accounting of one exact private collection. Dataset exhaustion is not complete product/platform coverage; owner selection does not authenticate revenue periods.
 */
export interface AutomationReviewSample {
  contractVersion: 'automation-review-sample-v1';
  sampleId: string;
  binding: Binding;
  policySha256: string;
  collection: Reference;
  /**
   * @minItems 1
   * @maxItems 5
   */
  products:
    | [
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
      ]
    | [
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
      ]
    | [
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
      ]
    | [
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
      ]
    | [
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
        {
          listing: {
            platform: 'shopee';
            shopId: string;
            itemId: string;
          };
          retainedReviews: number;
          textReviews: number;
          targetReviews: 300;
          hardMaximum: 500;
          meetsComparisonTextMinimum: boolean;
          stop: 'A_FIXED_COUNT' | 'PROVIDER_DATASET_EXHAUSTED' | 'CAPTURE_STOPPED_BEFORE_TARGET';
        },
      ];
  receipt: {
    runKey: string;
    actorId: 'zen-studio/shopee-product-reviews-scraper';
    inputSha256: string;
    maxReviewsPerProduct: 300;
    contentFilter: 'all' | 'with comments';
    maxChargeUsd: number;
    usageTotalUsd: number | null;
    providerDatasetRows: number | null;
    stopReason: string;
  };
  coverageAvailable: false;
  shortage: 'AUTHENTIC_MEASUREMENT_PERIOD_UNAVAILABLE';
  saturation: 'SOURCE_BOUND_CODING_UNAVAILABLE';
  unresolvedOrOtherListingRecords: number;
  /**
   * @minItems 1
   */
  limits: [string, ...string[]];
}
export interface Binding {
  workspaceId: string;
  runId: string;
  startSha256: string;
  scopeSha256: string;
  confirmedSourceSetSha256: string;
  scopeConfirmedAt: string;
}
export interface Reference {
  privateVersion: '3.0.0';
  collectionId: string;
  collectionSha256: string;
  requestSha256: string;
}
