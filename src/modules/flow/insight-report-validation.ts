import { createRequire } from 'node:module';
import fromReport from '../../../contracts/flow/content-insight-from-report-request.schema.json' with { type: 'json' };
import campaignFromReport from '../../../contracts/flow/content-campaign-from-report-request.schema.json' with { type: 'json' };
import campaign from '../../../contracts/flow/content-campaign-create-request.schema.json' with { type: 'json' };
import type { ContentInsightFromReportRequest } from '../../../contracts/flow/content-insight-from-report-request.generated.js';
import type { ContentCampaignFromReportRequest } from '../../../contracts/flow/content-campaign-from-report-request.generated.js';
import { FlowValidationError } from './validation.js';
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true }); addFormats(ajv); ajv.addSchema(campaign);
const valid = ajv.compile<ContentInsightFromReportRequest>(fromReport);
const validCampaign = ajv.compile<ContentCampaignFromReportRequest>(campaignFromReport);
export function validateContentInsightFromReportRequest(value: unknown): ContentInsightFromReportRequest {
  if (!valid(value)) throw new FlowValidationError(ajv.errorsText(valid.errors));
  return structuredClone(value);
}
export function validateContentCampaignFromReportRequest(value: unknown): ContentCampaignFromReportRequest {
  if (!validCampaign(value)) throw new FlowValidationError(ajv.errorsText(validCampaign.errors));
  return structuredClone(value);
}
