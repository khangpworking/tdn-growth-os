/* Generated from content-insight-revision-request.schema.json. Do not edit by hand. */

export type ContentInsightSource = ContentInsightTypedSource | ContentInsightStpSource | ContentInsightReportSource;

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
export interface ContentInsightReportSource {
  kind: 'INSIGHT_REPORT';
  revisionId: string;
  statementId: string;
  snapshot: InsightReportStatement;
}
export interface InsightReportStatement {
  contractVersion: '1.0.0';
  statementId: string;
  revisionId: string;
  purchaseStage: 'AWARENESS' | 'INTEREST' | 'DESIRE' | 'PURCHASE' | 'POST_PURCHASE';
  customer: string;
  hiddenTruth: string;
  motivation: string;
  conflict: string;
  insight: string;
  threeC?: null | {
    customer: string;
    brand: string;
    category: string;
  };
  /**
   * @minItems 1
   */
  evidence: [
    {
      platform: 'shopee' | 'tiktok';
      count: number;
      denominator?: number;
    },
    ...{
      platform: 'shopee' | 'tiktok';
      count: number;
      denominator?: number;
    }[],
  ];
  confidence: {
    level: 'CERTAIN' | 'FAIR' | 'WEAK' | 'NONE';
    hypothesis: boolean;
  };
}
