import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AnySchema, ValidateFunction } from 'ajv';
import type {
  ReportInterpretationDetailResponse,
  ReportInterpretationIndexResponse,
} from '../../contracts/api/report-api.generated';
import reportApiSchema from '../../contracts/api/report-api.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(reportApiSchema as AnySchema);

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

export function isReportInterpretationIndexResponse(value: unknown): value is ReportInterpretationIndexResponse {
  return validateInterpretationIndex(value);
}

export function isReportInterpretationDetailResponse(value: unknown): value is ReportInterpretationDetailResponse {
  return validateInterpretationDetail(value);
}
