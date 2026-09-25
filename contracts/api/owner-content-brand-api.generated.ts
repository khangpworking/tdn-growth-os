/* Generated from owner-content-brand-api.schema.json. Do not edit by hand. */

export type OwnerContentBrandApiContract =
  | OwnerContentBrandCreateRequest
  | OwnerContentBrandRevisionRequest
  | OwnerContentBrandReceipt
  | OwnerContentApiErrorResponse;
export type BrandKey = string;
export type ContentBrandVisibility = 'ALWAYS' | 'OPTIONAL' | 'HIDDEN';
export type Uuid = string;

export interface OwnerContentBrandCreateRequest {
  contractVersion: '1.0.0';
  brandKey: BrandKey;
  profile: ContentBrandProfile;
  displayRules: ContentBrandDisplayRules;
}
export interface ContentBrandProfile {
  brandName: string;
  tagline?: string;
  hotline?: string;
  website?: string;
  fanpage?: string;
  address?: string;
}
export interface ContentBrandDisplayRules {
  sales: ContentBrandElementRules;
  trust: ContentBrandElementRules;
  education: ContentBrandElementRules;
  entertainment: ContentBrandElementRules;
  engagement: ContentBrandElementRules;
}
export interface ContentBrandElementRules {
  name: ContentBrandVisibility;
  logo: ContentBrandVisibility;
  tagline: ContentBrandVisibility;
  hotline: ContentBrandVisibility;
  web: ContentBrandVisibility;
  address: ContentBrandVisibility;
}
export interface OwnerContentBrandRevisionRequest {
  contractVersion: '1.0.0';
  expectedVersion: number;
  profile: ContentBrandProfile;
  displayRules: ContentBrandDisplayRules;
}
export interface OwnerContentBrandReceipt {
  contractVersion: '1.0.0';
  brandId: Uuid;
  brandKey: BrandKey;
  version: number;
  brandName: string;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentApiErrorResponse {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'method_not_allowed'
      | 'conflict'
      | 'integrity_error';
    message: string;
  };
}
