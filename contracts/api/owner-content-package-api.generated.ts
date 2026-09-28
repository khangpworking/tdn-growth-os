/* Generated from owner-content-package-api.schema.json. Do not edit by hand. */

export type OwnerContentPackageApiContract =
  | OwnerContentPackageCreateReceipt
  | OwnerContentPackageGenerateReceipt
  | OwnerContentPackageVersionReceipt
  | OwnerContentPackageStateReceipt
  | OwnerContentCampaignDefaultsReceipt
  | OwnerContentPackageApiErrorResponse;
export type Uuid = string;
export type ContentPackagePart = 'CAPTION' | 'POSTER';
export type ContentPackageVersionSource = 'GENERATED' | 'MANUAL' | 'RESTORE';
export type ContentPackageStateAction = 'DELETE' | 'RESTORE';
export type OwnerContentPackageAiFailureReason =
  | 'ai_not_configured'
  | 'model_not_allowed'
  | 'request_too_large'
  | 'timeout'
  | 'network_error'
  | 'gateway_http_error'
  | 'malformed_envelope'
  | 'response_too_large'
  | 'invalid_image'
  | 'schema_mismatch';

export interface OwnerContentPackageCreateReceipt {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  requestId: Uuid;
  packages: OwnerContentPackageCreated[];
  exactRetry: boolean;
}
export interface OwnerContentPackageCreated {
  packageId: Uuid;
  angleId: Uuid;
  code: string;
  createdAt: string;
}
export interface OwnerContentPackageGenerateReceipt {
  contractVersion: '1.0.0';
  packageId: Uuid;
  part: ContentPackagePart;
  version: number;
  attemptId: Uuid;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentPackageVersionReceipt {
  contractVersion: '1.0.0';
  packageId: Uuid;
  part: ContentPackagePart;
  version: number;
  source: ContentPackageVersionSource;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentPackageStateReceipt {
  contractVersion: '1.0.0';
  packageId: Uuid;
  sequence: number;
  action: ContentPackageStateAction;
  createdAt: string;
  restorableUntil?: string;
  exactRetry: boolean;
}
export interface OwnerContentCampaignDefaultsReceipt {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  version: number;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentPackageApiErrorResponse {
  error: {
    code:
      | 'bad_request'
      | 'unauthorized'
      | 'forbidden'
      | 'not_found'
      | 'method_not_allowed'
      | 'conflict'
      | 'integrity_error'
      | 'ai_unavailable'
      | 'ai_failed';
    message: string;
    reason?: OwnerContentPackageAiFailureReason;
  };
}
