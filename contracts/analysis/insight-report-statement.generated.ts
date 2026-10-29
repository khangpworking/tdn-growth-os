/* Generated from insight-report-statement.schema.json. Do not edit by hand. */

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
