/* Generated from shopee-review-coding-configuration-v1.schema.json. Do not edit by hand. */

/**
 * Explicit Shopee draft-coding model dispatch configuration. The model id records what was requested; it is never selected automatically. Enabling Shopee coding never enables any other model path.
 */
export interface ShopeeReviewCodingConfiguration {
  contractVersion: 'shopee-review-coding-configuration-v1';
  providerId: string;
  modelId: string;
  temperature: null;
  maxOutputTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
}
