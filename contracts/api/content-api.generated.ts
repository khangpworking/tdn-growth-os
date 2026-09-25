/* Generated from content-api.schema.json. Do not edit by hand. */

export type ContentApiContract =
  | ContentBrandListResponse
  | ContentBrandDetailResponse
  | ContentCatalogListResponse
  | ContentCatalogDetailResponse
  | ContentApiErrorResponse;
export type Uuid = string;
export type DateTime = string;
export type ContentVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';
export type Sha256 = string;
export type ContentCatalogItemType = 'PHYSICAL' | 'SERVICE';

export interface ContentBrandListResponse {
  contractVersion: '1.0.0';
  brands: ContentBrandSummary[];
}
export interface ContentBrandSummary {
  brandId: Uuid;
  brandKey: string;
  version: number;
  brandName: string;
  updatedAt: DateTime;
}
export interface ContentBrandDetailResponse {
  contractVersion: '1.0.0';
  brand: ContentBrandRecord;
  /**
   * @minItems 1
   */
  history: [ContentBrandHistoryItem, ...ContentBrandHistoryItem[]];
}
export interface ContentBrandRecord {
  brandId: Uuid;
  brandKey: string;
  version: number;
  profile: ContentProfile;
  displayRules: ContentDisplayRules;
  logoMediaSha256?: Sha256;
  createdAt: DateTime;
}
export interface ContentProfile {
  brandName: string;
  tagline?: string;
  hotline?: string;
  website?: string;
  fanpage?: string;
  address?: string;
}
export interface ContentDisplayRules {
  sales: ContentElementRules;
  trust: ContentElementRules;
  education: ContentElementRules;
  entertainment: ContentElementRules;
  engagement: ContentElementRules;
}
export interface ContentElementRules {
  name: ContentVisibility;
  logo: ContentVisibility;
  tagline: ContentVisibility;
  hotline: ContentVisibility;
  web: ContentVisibility;
  address: ContentVisibility;
}
export interface ContentBrandHistoryItem {
  version: number;
  brandName: string;
  createdAt: DateTime;
}
export interface ContentCatalogListResponse {
  contractVersion: '1.0.0';
  brandId: Uuid;
  items: ContentCatalogItemSummary[];
}
export interface ContentCatalogItemSummary {
  itemId: Uuid;
  itemKey: string;
  version: number;
  itemType: 'PHYSICAL' | 'SERVICE';
  name: string;
  tierNames: string[];
  photoCount: number;
  updatedAt: DateTime;
}
export interface ContentCatalogDetailResponse {
  contractVersion: '1.0.0';
  item: ContentCatalogItemRecord;
  /**
   * @minItems 1
   */
  history: [ContentCatalogHistoryItem, ...ContentCatalogHistoryItem[]];
}
export interface ContentCatalogItemRecord {
  itemId: Uuid;
  brandId: Uuid;
  itemKey: string;
  version: number;
  item: ContentCatalogItemContent;
  createdAt: DateTime;
}
export interface ContentCatalogItemContent {
  itemType: ContentCatalogItemType;
  name: string;
  description?: string;
  /**
   * @maxItems 8
   */
  tiers:
    | []
    | [ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier, ContentCatalogTier]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ]
    | [
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
        ContentCatalogTier,
      ];
  /**
   * @maxItems 12
   */
  photos:
    | []
    | [ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto, ContentCatalogPhoto]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ]
    | [
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
        ContentCatalogPhoto,
      ];
}
export interface ContentCatalogTier {
  tierKey: string;
  name: string;
  priceText?: string;
  /**
   * @maxItems 12
   */
  inclusions:
    | []
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string, string, string, string, string];
}
export interface ContentCatalogPhoto {
  mediaSha256: string;
  posterDefault: boolean;
}
export interface ContentCatalogHistoryItem {
  version: number;
  name: string;
  createdAt: DateTime;
}
export interface ContentApiErrorResponse {
  error: {
    code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error';
    message: string;
  };
}
