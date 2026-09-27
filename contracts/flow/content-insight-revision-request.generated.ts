/* Generated from content-insight-revision-request.schema.json. Do not edit by hand. */

export type ContentInsightSource = ContentInsightTypedSource | ContentInsightStpSource;

export interface ContentInsightRevisionRequest {
  contractVersion: '1.0.0';
  campaignId: string;
  expectedVersion: number;
  insight: ContentInsightContent;
}
export interface ContentInsightContent {
  customer: string;
  painPoint: string;
  insight: string;
  source: ContentInsightSource;
}
export interface ContentInsightTypedSource {
  kind: 'TYPED';
}
export interface ContentInsightStpSource {
  kind: 'STP';
  lockedStpId: string;
}
