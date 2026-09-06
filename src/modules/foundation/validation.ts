import { createRequire } from 'node:module';
import researchDocumentImportSchema from '../../../contracts/foundation/research-document-import.schema.json' with { type: 'json' };
import type { ResearchDocumentImport } from '../../../contracts/foundation/research-document-import.generated.js';
import researchPackManifestSchema from '../../../contracts/foundation/research-pack-manifest.schema.json' with { type: 'json' };
import type { ResearchPackManifest } from '../../../contracts/foundation/research-pack-manifest.generated.js';
import researchPackRequestSchema from '../../../contracts/foundation/research-pack-request.schema.json' with { type: 'json' };
import type { ResearchPackRequest } from '../../../contracts/foundation/research-pack-request.generated.js';
import manifestSchema from '../../../contracts/foundation/data-pack-manifest.schema.json' with { type: 'json' };
import type { DataPackManifest } from '../../../contracts/foundation/data-pack-manifest.generated.js';
import requestSchema from '../../../contracts/foundation/data-pack-request.schema.json' with { type: 'json' };
import type { DataPackRequest } from '../../../contracts/foundation/data-pack-request.generated.js';
import exportSchema from '../../../contracts/foundation/json-export.schema.json' with { type: 'json' };
import type { JsonExportInput } from '../../../contracts/foundation/json-export.generated.js';
import manualSchema from '../../../contracts/foundation/manual-observation.schema.json' with { type: 'json' };
import type { ManualObservationInput } from '../../../contracts/foundation/manual-observation.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateManual = ajv.compile(manualSchema);
const validateExport = ajv.compile(exportSchema);
const validatePackRequest = ajv.compile(requestSchema);
const validatePackManifest = ajv.compile(manifestSchema);
const validateResearchDocumentImportContract = ajv.compile(researchDocumentImportSchema);
const validateResearchPackRequestContract = ajv.compile(researchPackRequestSchema);
const validateResearchPackManifestContract = ajv.compile(researchPackManifestSchema);

export class FoundationValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid manual observation input: ${details}`);
    this.details = details;
  }
}

export function validateManualObservationInput(value: unknown): ManualObservationInput {
  if (!validateManual(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateManual.errors, { separator: '; ' }));
  }
  const input = value as unknown as ManualObservationInput;
  assertPeriodOrder(
    input.observation.period.start,
    input.observation.period.end,
    'observation.period.start must not be after observation.period.end',
  );
  return input;
}

export function validateDataPackRequest(value: unknown): DataPackRequest {
  if (!validatePackRequest(value)) {
    throw new FoundationValidationError(ajv.errorsText(validatePackRequest.errors, { separator: '; ' }));
  }
  return value as unknown as DataPackRequest;
}

export function validateDataPackManifest(value: unknown): DataPackManifest {
  if (!validatePackManifest(value)) {
    throw new FoundationValidationError(ajv.errorsText(validatePackManifest.errors, { separator: '; ' }));
  }
  return value as unknown as DataPackManifest;
}

export function validateJsonExportInput(value: unknown): JsonExportInput {
  if (!validateExport(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateExport.errors, { separator: '; ' }));
  }
  const input = value as unknown as JsonExportInput;
  assertPeriodOrder(input.period.start, input.period.end, 'period.start must not be after period.end');
  return input;
}

function assertPeriodOrder(start: string, end: string, message: string): void {
  const periodStart = Date.parse(start);
  const periodEnd = Date.parse(end);
  if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodStart > periodEnd) {
    throw new FoundationValidationError(message);
  }
}

export function validateResearchDocumentImport(value: unknown): ResearchDocumentImport {
  if (!validateResearchDocumentImportContract(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateResearchDocumentImportContract.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchDocumentImport;
}

export function validateResearchPackRequest(value: unknown): ResearchPackRequest {
  if (!validateResearchPackRequestContract(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateResearchPackRequestContract.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchPackRequest;
}

export function validateResearchPackManifest(value: unknown): ResearchPackManifest {
  if (!validateResearchPackManifestContract(value)) {
    throw new FoundationValidationError(ajv.errorsText(validateResearchPackManifestContract.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchPackManifest;
}
