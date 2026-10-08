/* Generated from default-market-peers.schema.json. Do not edit by hand. */

export type Revenue = string;

/**
 * Frozen E11 sales selection, retained compatible memberships/exclusions and separate owner additions; each group/platform is independent. Exact title labels are source labels, not verified legal brand identities. Caller authenticates source bytes.
 */
export interface DefaultMarketPeers {
  contractVersion: 'default-market-peers-v1';
  input: Input;
  /**
   * @maxItems 100
   */
  frames: Result[];
}
export interface Input {
  rule: Rule;
  /**
   * @maxItems 100
   */
  frames: Frame[];
  /**
   * @maxItems 20000
   */
  records: Record[];
  /**
   * @maxItems 100
   */
  ownerAdditions: string[];
}
export interface Rule {
  version: 'e11-sales-peers-v1';
  thresholdPercent: 50;
  boundary: 'MINIMAL_PREFIX_REVENUE_DESC_IDENTITY_ASC';
  identity: 'EXACT_TITLE_LABEL_OR_SOURCE_SHOP_PER_PLATFORM';
  denominator: 'COMPLETE_COMPATIBLE_GROUP_SAMPLE';
}
export interface Frame {
  platform: 'shopee' | 'tiktok';
  group: string;
  sampleKey: string;
  period: Period;
  unit: 'VND';
  membershipBasis: string;
}
export interface Period {
  start: string;
  end: string;
}
export interface Record {
  platform: string;
  group: string | null;
  membership: 'IN_GROUP' | 'OTHER_GROUP' | 'UNKNOWN';
  sampleKey: string | null;
  period: Period | null;
  unit: string | null;
  listingId: string | null;
  title: string;
  brandLabel: string | null;
  shopId: string | null;
  shopLabel: string | null;
  revenue: Revenue | null;
  source: Source | null;
}
export interface Source {
  sourceSha256: string;
  locator: string;
}
export interface Result {
  frame: Frame;
  state: 'SELECTED' | 'NO_SALES' | 'ZERO_REVENUE' | 'INCOMPLETE';
  /**
   * @maxItems 20000
   */
  eligible: Source[];
  /**
   * @maxItems 20000
   */
  excluded: Excluded[];
  /**
   * @maxItems 20000
   */
  members: Member[];
  /**
   * @maxItems 20000
   */
  selected: Member[];
  totalRevenue: Revenue | null;
  selectedRevenue: Revenue | null;
}
export interface Excluded {
  source: Source | null;
  listingId: string | null;
  reason:
    | 'PLATFORM_MISMATCH'
    | 'FRAME_MISMATCH'
    | 'PERIOD_MISMATCH'
    | 'UNIT_MISMATCH'
    | 'OTHER_GROUP'
    | 'GROUP_UNKNOWN'
    | 'SOURCE_MISSING'
    | 'EXACT_REFERENCE_DUPLICATE'
    | 'CONFLICTING_REFERENCE'
    | 'LISTING_IDENTITY_AMBIGUOUS'
    | 'REVENUE_MISSING'
    | 'PEER_IDENTITY_AMBIGUOUS';
}
export interface Member {
  identity: Identity;
  revenue: Revenue;
  /**
   * @maxItems 20000
   */
  sources: Source[];
}
export interface Identity {
  kind: 'TITLE_LABEL' | 'SHOP';
  key: string;
  label: string;
  source: Source;
}
