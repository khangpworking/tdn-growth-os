/* Generated from apify-shopee-rows.schema.json. Do not edit by hand. */

/**
 * @maxItems 2500
 */
export type ApifyShopeeRows = {
  reviewId: string | number;
  itemId: string | number;
  shopId: string | number;
  ratingStar: number;
  comment: string;
  region?: string;
  createdAt?: string;
  [k: string]: unknown;
}[];
