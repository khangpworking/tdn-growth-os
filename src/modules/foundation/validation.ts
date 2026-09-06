import { createRequire } from 'node:module';
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
