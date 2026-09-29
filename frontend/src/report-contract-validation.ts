import type {
  ReportInterpretationDetailResponse,
  ReportInterpretationIndexResponse,
  ReportReviewTarget,
  ReportSectionReadinessResponse,
} from '../../contracts/api/report-api.generated';
import type { OwnerReportReviewTargetReceipt } from '../../contracts/api/owner-report-review-target-api.generated';
// Precompiled by scripts/generate-report-validators.mjs: the operator app's CSP forbids Ajv's runtime `new Function`.
import {
  interpretationDetail,
  interpretationIndex,
  ownerReviewTargetReceipt,
  reviewTarget,
  sectionReadiness,
} from './generated/report-validators.generated.js';

export function isReportInterpretationIndexResponse(value: unknown): value is ReportInterpretationIndexResponse {
  return interpretationIndex(value);
}

export function isReportInterpretationDetailResponse(value: unknown): value is ReportInterpretationDetailResponse {
  return interpretationDetail(value);
}

export function isReportSectionReadinessResponse(value: unknown): value is ReportSectionReadinessResponse {
  return sectionReadiness(value);
}

export function isReportReviewTarget(value: unknown): value is ReportReviewTarget {
  return reviewTarget(value);
}

export function isOwnerReportReviewTargetReceipt(value: unknown): value is OwnerReportReviewTargetReceipt {
  return ownerReviewTargetReceipt(value);
}
