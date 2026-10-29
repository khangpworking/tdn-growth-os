/* Generated from owner-content-insight-api.schema.json. Do not edit by hand. */

export type OwnerContentInsightApiContract =
  | OwnerContentInsightRevisionRequest
  | OwnerContentInsightLockRequest
  | OwnerContentInsightRevisionReceipt
  | OwnerContentInsightLockReceipt
  | OwnerContentInsightApiErrorResponse;
export type ContentInsightSource = ContentInsightTypedSource | ContentInsightStpSource | ContentInsightReportSource;
export type Uuid = string;

export interface OwnerContentInsightRevisionRequest {
  contractVersion: '1.0.0';
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
export interface OwnerContentInsightLockRequest {
  contractVersion: '1.0.0';
  insightVersion: number;
  campaignVersion: number;
}
export interface OwnerContentInsightRevisionReceipt {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  version: number;
  createdAt: string;
  exactRetry: boolean;
}
export interface OwnerContentInsightLockReceipt {
  contractVersion: '1.0.0';
  campaignId: Uuid;
  insightVersion: number;
  campaignVersion: number;
  lockedAt: string;
  exactRetry: boolean;
}
export interface OwnerContentInsightApiErrorResponse {
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
