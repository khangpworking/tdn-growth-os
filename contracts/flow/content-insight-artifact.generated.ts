/* Generated from content-insight-artifact.schema.json. Do not edit by hand. */

export type ContentInsightSource = ContentInsightTypedSource | ContentInsightStpSource;

export interface ContentInsightArtifact {
  contractVersion: '1.0.0';
  campaignId: string;
  version: number;
  insight: ContentInsightContent;
  createdAt: string;
  requestSha256: string;
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
