import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AnySchema } from 'ajv';
import type {
  ReportInterpretationDetailResponse,
  ReportInterpretationIndexResponse,
} from '../../contracts/api/report-api.generated';
import reportApiSchema from '../../contracts/api/report-api.schema.json' with { type: 'json' };

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(reportApiSchema as AnySchema);

const validateInterpretationIndex = ajv.getSchema<ReportInterpretationIndexResponse>(`${reportApiSchema.$id}#/$defs/interpretationIndex`);
const validateInterpretationDetail = ajv.getSchema<ReportInterpretationDetailResponse>(`${reportApiSchema.$id}#/$defs/interpretationDetail`);

if (!validateInterpretationIndex || !validateInterpretationDetail) {
  throw new Error('Research report API interpretation validators are unavailable');
}

export function isReportInterpretationIndexResponse(value: unknown): value is ReportInterpretationIndexResponse {
  return validateInterpretationIndex(value);
}

export function isReportInterpretationDetailResponse(value: unknown): value is ReportInterpretationDetailResponse {
  return validateInterpretationDetail(value);
}
