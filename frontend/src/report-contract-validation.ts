import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AnySchema, ValidateFunction } from 'ajv';
import type {
  ReportInterpretationDetailResponse,
  ReportInterpretationIndexResponse,
  ReportReviewTarget,
  ReportSectionReadinessResponse,
} from '../../contracts/api/report-api.generated';
import type { OwnerReportReviewTargetReceipt } from '../../contracts/api/owner-report-review-target-api.generated';
import reportApiSchema from '../../contracts/api/report-api.schema.json' with { type: 'json' };
import reportReviewTargetSchema from '../../contracts/analysis/report-review-target.schema.json' with { type: 'json' };
import reportReviewTargetCreateRequestSchema from '../../contracts/analysis/report-review-target-create-request.schema.json' with { type: 'json' };
import ownerReportReviewTargetApiSchema from '../../contracts/api/owner-report-review-target-api.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(reportReviewTargetSchema as AnySchema);
ajv.addSchema(reportReviewTargetCreateRequestSchema as AnySchema);
ajv.addSchema(reportApiSchema as AnySchema);
ajv.addSchema(ownerReportReviewTargetApiSchema as AnySchema);

function requiredSynchronousValidator<T>(schemaRef: string): ValidateFunction<T> {
  const validator = ajv.getSchema<T>(schemaRef);
  if (!validator || '$async' in validator) {
    throw new Error(`Research report API validator is unavailable or asynchronous: ${schemaRef}`);
  }
  return validator;
}

const validateInterpretationIndex = requiredSynchronousValidator<ReportInterpretationIndexResponse>(
  `${reportApiSchema.$id}#/$defs/interpretationIndex`,
);
const validateInterpretationDetail = requiredSynchronousValidator<ReportInterpretationDetailResponse>(
  `${reportApiSchema.$id}#/$defs/interpretationDetail`,
);
const validateSectionReadiness = requiredSynchronousValidator<ReportSectionReadinessResponse>(
  `${reportApiSchema.$id}#/$defs/sectionReadiness`,
);
const validateReviewTarget = requiredSynchronousValidator<ReportReviewTarget>(reportReviewTargetSchema.$id);
const validateOwnerReviewTargetReceipt = requiredSynchronousValidator<OwnerReportReviewTargetReceipt>(
  `${ownerReportReviewTargetApiSchema.$id}#/$defs/receipt`,
);

export function isReportInterpretationIndexResponse(value: unknown): value is ReportInterpretationIndexResponse {
  return validateInterpretationIndex(value);
}

export function isReportInterpretationDetailResponse(value: unknown): value is ReportInterpretationDetailResponse {
  return validateInterpretationDetail(value);
}

export function isReportSectionReadinessResponse(value: unknown): value is ReportSectionReadinessResponse {
  return validateSectionReadiness(value);
}

export function isReportReviewTarget(value: unknown): value is ReportReviewTarget {
  return validateReviewTarget(value);
}

export function isOwnerReportReviewTargetReceipt(value: unknown): value is OwnerReportReviewTargetReceipt {
  return validateOwnerReviewTargetReceipt(value);
}
