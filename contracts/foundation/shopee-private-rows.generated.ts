/* Generated from shopee-private-rows.schema.json. Do not edit by hand. */

/**
 * Closed sanitized metadata allowlist, preserves source comment strings verbatim; rating preserves explicit source presence/state and safe numeric values; other invalid evidence scalars are null. Missing field and invalid ID differ. No raw author ID/name/profile fields. Bound2500 follows5 listings times500 existing collection ceiling.
 *
 * @maxItems 2500
 */
export type ShopeePrivateRows = {
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
