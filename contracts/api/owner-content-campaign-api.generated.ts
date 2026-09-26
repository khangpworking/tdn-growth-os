/* Generated from owner-content-campaign-api.schema.json. Do not edit by hand. */

export type OwnerContentCampaignApiContract =
  | OwnerContentCampaignCreateRequest
  | OwnerContentCampaignRevisionRequest
  | OwnerContentCampaignLifecycleRequest
  | OwnerContentCampaignReceipt
  | OwnerContentCampaignLifecycleReceipt
  | OwnerContentCampaignApiErrorResponse;
export type Uuid = string;

export interface OwnerContentCampaignCreateRequest {
  contractVersion: '1.0.0';
  campaignKey: string;
  brandId: Uuid;
  campaign: ContentCampaignContent;
}
export interface ContentCampaignContent {
  name: string;
  objective: string;
  /**
   * @minItems 1
   * @maxItems 12
   */
  items:
    | [ContentCampaignItemRef]
    | [ContentCampaignItemRef, ContentCampaignItemRef]
    | [ContentCampaignItemRef, ContentCampaignItemRef, ContentCampaignItemRef]
    | [ContentCampaignItemRef, ContentCampaignItemRef, ContentCampaignItemRef, ContentCampaignItemRef]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ]
    | [
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
        ContentCampaignItemRef,
      ];
  researchProductWorkspaceId?: string;
}
export interface ContentCampaignItemRef {
  itemId: string;
  itemVersion: number;
  /**
   * @minItems 1
   * @maxItems 8
   */
  tierKeys?:
    | [string]
    | [string, string]
    | [string, string, string]
    | [string, string, string, string]
    | [string, string, string, string, string]
    | [string, string, string, string, string, string]
    | [string, string, string, string, string, string, string]
    | [string, string, string, string, string, string, string, string];
}
export interface OwnerContentCampaignRevisionRequest {
  contractVersion: '1.0.0';
  expectedVersion: number;
  campaign: ContentCampaignContent;
}
export interface OwnerContentCampaignLifecycleRequest {
  contractVersion: '1.0.0';
  action: 'DELETE' | 'RESTORE';
  expectedSequence: number;
}
export interface OwnerContentCampaignReceipt {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  campaignKey: string;
  brandId: Uuid;
  version: number;
  name: string;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentCampaignLifecycleReceipt {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  sequence: number;
  action: 'DELETE' | 'RESTORE';
  createdAt: string;
  restorableUntil?: string;
  exactRetry: boolean;
}
export interface OwnerContentCampaignApiErrorResponse {
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
