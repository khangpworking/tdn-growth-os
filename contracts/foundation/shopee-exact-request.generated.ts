/* Generated from shopee-exact-request.schema.json. Do not edit by hand. */

export interface ShopeeExactRequest {
  contractVersion: '2.0.0';
  runKey: string;
  topic: string;
  selectionBasis: 'OWNER_EXACT_URL';
  source: Source;
  /**
   * @minItems 1
   * @maxItems 5
   */
  productUrls: string[];
}
export interface Source {
  label: string;
  acquiredAt: string;
}
