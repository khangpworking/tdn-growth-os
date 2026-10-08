/* Generated from shopee-private-projection.schema.json. Do not edit by hand. */

/**
 * Declared finalized source read projection; exact sanitized page locators, within-platform reported-ID accounting and E4 requirement disclosure. Does not decide persona eligibility or assert a total person count.
 */
export interface ShopeePrivateProjection {
  contractVersion: 'shopee-private-projection-v1';
  collectionId: string;
  collectionSha256: string;
  privacy: Privacy;
  /**
   * @maxItems 2500
   */
  records: {
    reviewId: string | null;
    shopId: string | null;
    itemId: string | null;
    comment: string | null;
    createdAt: string | null;
    region: string | null;
    authorIdentity:
      | {
          state: 'HASHED';
          hash: string;
        }
      | {
          state: 'MISSING' | 'INVALID';
          hash: null;
        };
    admission: 'SELECTED_TEXT' | 'OTHER_LISTING' | 'UNRESOLVED_LISTING' | 'NO_READABLE_TEXT';
    locator: {
      collectionId: string;
      pageSha256: string;
      pageIndex: number;
      rowIndex: number;
      textPointer: string;
    };
    /**
     * Source rating presence/state; never manufacture an absent source field. Invalid finite safe numeric source values survive, arbitrary strings/nested values do not.
     */
    rating:
      | {
          fieldPresent: false;
          state: 'ABSENT';
          value: null;
        }
      | {
          fieldPresent: true;
          state: 'MISSING';
          value: null;
        }
      | {
          fieldPresent: true;
          state: 'VALID';
          value: number;
        }
      | {
          fieldPresent: true;
          state: 'INVALID';
          value: null | number;
        };
  }[];
  accounting: {
    retainedRecords: number;
    selectedTextRecords: number;
    distinctContents: number;
    missingIdentityRecords: number;
    invalidIdentityRecords: number;
    reportedAuthorHashes: number | null;
    identityCoverage: 'UNAVAILABLE' | 'PARTIAL' | 'COMPLETE_IN_CAPTURE';
  };
  missingIdentityLabel: 'nguồn không có mã người viết';
  fallbackRequirement: '>=5 distinct contents, chưa xác minh là 5 người';
  limits: [
    'SOURCE_REPORTED_IDS_NOT_INDEPENDENTLY_VERIFIED_PEOPLE',
    'WITHIN_SHOPEE_AND_ONE_KEY_ONLY',
    'VERBATIM_TEXT_MAY_CONTAIN_PERSONAL_DATA',
    'SANITIZED_BYTES_NOT_ERASED_RAW_BYTE_RECONSTRUCTION',
    'NO_PERSONA_ELIGIBILITY_DECISION',
  ];
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
