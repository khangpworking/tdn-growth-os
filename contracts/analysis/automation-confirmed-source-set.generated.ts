/* Generated from automation-confirmed-source-set.schema.json. Do not edit by hand. */

export type Digest = string;

/**
 * Immutable first-version inputs frozen with confirmation. Admission is not provider authentication, labels acceptance or complete coverage. Native NONE retains the original explicitly approved collection path; SKIPPED never collects reviews.
 */
export interface AutomationConfirmedSourceSet {
  contractVersion: 'automation-confirmed-source-set-v1';
  runId: string;
  workspaceId: string;
  executionId: string;
  startSha256: Digest;
  scopeSha256: Digest;
  requestSha256: Digest;
  confirmedAt: string;
  metric:
    | {
        decision: 'ADMITTED';
        sourcePackage: SourceIdentity;
      }
    | {
        decision: 'ABSENT' | 'SKIPPED';
      };
  privateShopeeSource?: AutomationPrivateShopeeSource;
  nativeReview:
    | {
        decision: 'RESOLVED';
        referenceSha256: Digest;
      }
    | {
        decision: 'NONE' | 'SKIPPED';
      };
}
export interface SourceIdentity {
  packageId: string;
  manifestArtifactSha256: Digest;
  packageContentSha256: Digest;
}
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
