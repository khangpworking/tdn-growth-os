/* Generated from content-api.schema.json. Do not edit by hand. */

export type ContentApiContract = ContentBrandListResponse | ContentBrandDetailResponse | ContentApiErrorResponse;
export type Uuid = string;
export type DateTime = string;
export type ContentVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';

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
export interface ContentApiErrorResponse {
  error: {
    code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error';
    message: string;
  };
}
