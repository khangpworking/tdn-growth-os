import { createRequire } from 'node:module';
import schema from '../../../contracts/foundation/manual-observation.schema.json' with { type: 'json' };
import type { ManualObservationInput } from '../../../contracts/foundation/manual-observation.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

export class FoundationValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid manual observation input: ${details}`);
    this.details = details;
  }
}

export function validateManualObservationInput(value: unknown): ManualObservationInput {
  if (!validate(value)) {
    const details = ajv.errorsText(validate.errors, { separator: '; ' });
    throw new FoundationValidationError(details);
  }
  const input = value as unknown as ManualObservationInput;
  const periodStart = Date.parse(input.observation.period.start);
  const periodEnd = Date.parse(input.observation.period.end);
  if (!Number.isFinite(periodStart) || !Number.isFinite(periodEnd) || periodStart > periodEnd) {
    throw new FoundationValidationError('observation.period.start must not be after observation.period.end');
  }
  return input;
}
