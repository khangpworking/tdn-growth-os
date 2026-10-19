/* Generated from research-automation-source-api-v3.schema.json. Do not edit by hand. */

/**
 * @maxItems 5
 */
export type ExactShopeeUrls = string[];

/**
 * Source-bound confirmation v2. Preparation supplies a package ID, never caller-authored content identities or provider authority. This confirmation contract is not a file upload or late-supplement command.
 */
export interface ResearchAutomationSourceConfirmRequestV3 {
  contractVersion: 'research-automation-confirm-v3';
  requestKey: string;
  expectedRevision: number;
  definition: string;
  /**
   * @maxItems 30
   */
  includeTerms: string[];
  /**
   * @maxItems 30
   */
  excludeTerms: string[];
  /**
   * @maxItems 4
   */
  selectedProductIds: string[];
  /**
   * @maxItems 8
   */
  peerProductIds: string[];
  exactShopeeUrls?: ExactShopeeUrls;
  sources: {
    metric:
      | {
          decision: 'USE_PREPARED';
          packageId: string;
        }
      | {
          decision: 'ABSENT' | 'SKIPPED';
        };
    nativeReview:
      | ('AUTO_REUSE' | 'SKIP')
      | {
          decision: 'COLLECT_EXACT';
          providerId: 'shopee-public-review';
          maxReviewsPerProduct: number;
        }
      | {
          decision: 'COLLECT_EXACT_TEST';
          providerId: 'shopee-public-review';
          maxReviewsPerProduct: number;
        };
  };
}
