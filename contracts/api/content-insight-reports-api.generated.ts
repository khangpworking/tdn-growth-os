/* Generated from content-insight-reports-api.schema.json. Do not edit by hand. */

export type ContentInsightReportsApi = ContentInsightReportsResponse | ContentInsightReportStatementsResponse;

export interface ContentInsightReportsResponse {
  contractVersion: '1.0.0';
  reports: ContentInsightReport[];
}
export interface ContentInsightReport {
  revisionId: string;
  runId: string;
  reportKind: 'INSIGHT';
  revisionNumber: number;
  createdAt: string;
  keyword: string;
  period: null | {
    startDate: string;
    endDate: string;
  };
}
export interface ContentInsightReportStatementsResponse {
  contractVersion: '1.0.0';
  report: ContentInsightReport;
  statements: InsightReportStatement[];
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
