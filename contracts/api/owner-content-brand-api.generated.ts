/* Generated from owner-content-brand-api.schema.json. Do not edit by hand. */

export type OwnerContentBrandApiContract =
  | OwnerContentBrandCreateRequest
  | OwnerContentBrandRevisionRequest
  | OwnerContentBrandReceipt
  | OwnerContentApiErrorResponse;
export type BrandKey = string;
export type Uuid = string;

export interface OwnerContentBrandCreateRequest {
  contractVersion: '1.0.0';
  brandKey: BrandKey;
  profile: OwnerContentBrandProfile;
  displayRules: OwnerContentBrandDisplayRules;
}
export interface OwnerContentBrandProfile {
  [k: string]: unknown;
}
export interface OwnerContentBrandDisplayRules {
  [k: string]: unknown;
}
export interface OwnerContentBrandRevisionRequest {
  contractVersion: '1.0.0';
  expectedVersion: number;
  profile: OwnerContentBrandProfile;
  displayRules: OwnerContentBrandDisplayRules;
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
