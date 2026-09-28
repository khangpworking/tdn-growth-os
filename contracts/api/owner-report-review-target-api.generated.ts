/* Generated from owner-report-review-target-api.schema.json. Do not edit by hand. */

export type OwnerReportReviewTargetApiContract =
  ReportReviewTargetCreateRequest | OwnerReportReviewTargetReceipt | OwnerReportReviewTargetErrorResponse;
export type Digest = string;
export type Uuid = string;

export interface ReportReviewTargetCreateRequest {
  contractVersion: '1.0.0';
  reportId: string;
  reportVersion: number;
  interpretationId: string;
  intendedUse: string;
}
export interface OwnerReportReviewTargetReceipt {
  contractVersion: '1.0.0';
  reviewTargetId: Digest;
  reportId: Uuid;
  reportVersion: number;
  interpretationId: Uuid;
  intendedUse: string;
  storedAt: string;
  exactRetry: boolean;
}
export interface OwnerReportReviewTargetErrorResponse {
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
