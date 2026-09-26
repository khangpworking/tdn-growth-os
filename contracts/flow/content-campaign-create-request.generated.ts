/* Generated from content-campaign-create-request.schema.json. Do not edit by hand. */

export type CampaignKey = string;

export interface ContentCampaignCreateRequest {
  contractVersion: '1.0.0';
  campaignKey: CampaignKey;
  brandId: string;
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
