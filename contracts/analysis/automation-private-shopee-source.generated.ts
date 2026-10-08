/* Generated from automation-private-shopee-source.schema.json. Do not edit by hand. */

/**
 * Explicit frozen private Shopee source configuration; public profile/key identity only, never salt or raw author metadata. Historical absence selects the existing raw path.
 */
export interface AutomationPrivateShopeeSource {
  contractVersion: 'automation-private-shopee-source-v1';
  profile: Privacy;
}
export interface Privacy {
  profileVersion: 'shopee-author-id-hmac-v1';
  platform: 'shopee';
  namespace: 'tdn:shopee.vn:author:v1';
  field: 'authorId';
  algorithm: 'HMAC-SHA256';
  documentationUrl: 'https://apify.com/zen-studio/shopee-product-reviews-scraper';
  documentationSha256: '798f1078e4b52991129ec29d34346cf3980495061fc14f0026c3fe4c0578d1c6';
  documentationRetrievedAt: '2026-10-08';
  keyId: string;
  /**
   * Domain-separated HMAC-SHA256 fixed-label key commitment. Caller must use a private random high-entropy salt, never a password. This opaque value binds actual salt continuity without retaining or reconstructing key material.
   */
  keyCommitment: string;
}
