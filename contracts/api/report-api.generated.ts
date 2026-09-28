/* Generated from report-api.schema.json. Do not edit by hand. */

export interface WorkspaceReportIndexResponse {
  contractVersion: '1.0.0';
  workspaceId: string;
  reports: ReportSeriesSummary[];
}
export interface ReportSeriesSummary {
  reportId: string;
  reportKey: string;
  createdAt: string;
}
export interface ReportHistoryResponse {
  contractVersion: '1.0.0';
  reportId: string;
  reportKey: string;
  workspaceId: string;
  versions: ReportVersionSummary[];
}
export interface ReportVersionSummary {
  versionId: string;
  version: number;
  previousSemanticVersionId: string | null;
  semanticVersionId: string;
  createdAt: string;
  status: 'DRAFT';
  interpretationState: 'NONE';
  reviewState: 'UNREVIEWED';
  scope: {
    key: string;
    platform: 'shopee' | 'tiktok';
    selection: 'ON' | 'OFF' | 'UNSPECIFIED';
    start: string;
    end: string;
    periodBasis: string;
    acquiredAt: string | null;
  };
  sectionCounts: {
    total: number;
    partialDeterministicDraft: number;
    methodOnly: number;
    blocked: number;
    manualReviewRequired: number;
    notImplemented: number;
  };
  selectedSourceCount: number;
  artifacts: { fileName: string; mediaType: string; byteSize: number }[];
}
export interface ReportApiErrorResponse {
  error: { code: 'bad_request' | 'not_found' | 'method_not_allowed' | 'integrity_error'; message: string };
}
