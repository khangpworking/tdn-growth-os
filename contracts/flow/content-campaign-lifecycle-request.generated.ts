/* Generated from content-campaign-lifecycle-request.schema.json. Do not edit by hand. */

export type ContentCampaignLifecycleAction = 'DELETE' | 'RESTORE';

export interface ContentCampaignLifecycleRequest {
  contractVersion: '1.0.0';
  campaignId: string;
  action: ContentCampaignLifecycleAction;
  expectedSequence: number;
}
