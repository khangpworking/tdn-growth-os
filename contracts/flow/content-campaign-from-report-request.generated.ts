/* Generated from content-campaign-from-report-request.schema.json. Do not edit by hand. */

export interface ContentCampaignFromReportRequest {
  contractVersion: '1.0.0';
  campaignKey: string;
  brandId: string;
  campaign: ContentCampaignContent;
  revisionId: string;
  statementId: string;
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
