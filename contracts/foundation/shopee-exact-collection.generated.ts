/* Generated from shopee-exact-collection.schema.json. Do not edit by hand. */

/**
 * @maxItems 2005
 */
export type SelectionWarnings = string[];
/**
 * @maxItems 100
 */
export type CollectorWarnings = string[];
/**
 * @maxItems 25
 */
export type Pages = {
  sha256: string;
  byteSize: number;
  offset: number;
}[];

export interface ShopeeExactCollection {
  contractVersion: '2.0.0';
  selectionBasis: 'OWNER_EXACT_URL';
  collectionId: string;
  runKey: string;
  requestSha256: string;
  createdAt: string;
  mode: 'fixture' | 'live';
  /**
   * @minItems 1
   * @maxItems 5
   */
  selected: {
    platform: 'shopee';
    shopId: string;
    itemId: string;
    productUrl: string;
    submittedUrl: string;
  }[];
  selectionWarnings: SelectionWarnings;
  collectorWarnings: CollectorWarnings;
  actor: Actor;
  pages: Pages;
}
export interface Actor {
  actorId: 'zen-studio/shopee-product-reviews-scraper';
  settings: {
    maxReviewsPerProduct: number;
    starFilter: 'all';
    contentFilter: 'all' | 'with comments';
    maxChargeUsd: number | null;
  };
  inputSha256: string;
  runId: string | null;
  datasetId: string | null;
  buildId: string | null;
  status: string;
  retrievedAt: string;
  providerTotalRows: number | null;
  usageTotalUsd: number | null;
  stopReason:
    | 'fixture_complete'
    | 'dataset_exhausted'
    | 'collection_limit_reached'
    | 'dataset_read_failed'
    | 'actor_terminal_failed'
    | 'actor_terminal_timed-out'
    | 'actor_terminal_aborted'
    | 'not_started_no_eligible_listings';
}
