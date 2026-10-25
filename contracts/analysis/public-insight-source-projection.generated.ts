/* Generated from public-insight-source-projection.schema.json. Do not edit by hand. */

export type Digest = string;

/**
 * Server-derived per-record metadata of one PUBLIC_REVIEWS coding source: the verified public Shopee review corpus and/or the verified S06 TikTok Shop reviews document of the same run. It is parallel to the coding input records by recordIndex. It never holds a writer name, avatar or raw user id. writerKey is a one-way anonymous key and is null when the source gives no per-writer id. Counts built from it are record counts, never people, unless a writer key is present.
 */
export interface PublicInsightSourceProjection {
  contractVersion: 'public-insight-source-projection-v1';
  shopeePublic: null | {
    corpusId: Digest;
    collectionSha256: Digest;
  };
  tiktokShop: null | {
    documentSha256: Digest;
  };
  /**
   * @maxItems 10000
   */
  records: PublicInsightSourceRecord[];
}
export interface PublicInsightSourceRecord {
  recordIndex: number;
  platform: 'SHOPEE' | 'TIKTOK_SHOP';
  productKey: string;
  rating: number | null;
  writerKey: Digest | null;
}
