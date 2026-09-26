/* Generated from content-campaign-revision-request.schema.json. Do not edit by hand. */

export interface ContentCampaignRevisionRequest {
  contractVersion: '1.0.0';
  campaignId: string;
  expectedVersion: number;
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
