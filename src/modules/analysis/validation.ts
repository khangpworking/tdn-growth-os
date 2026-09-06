import { createRequire } from 'node:module';
import governedSkillRequestSchema from '../../../contracts/analysis/governed-skill-execution-request.schema.json' with { type: 'json' };
import type { GovernedSkillExecutionRequest } from '../../../contracts/analysis/governed-skill-execution-request.generated.js';
import interpretationOutputSchema from '../../../contracts/analysis/market-snapshot-interpretation-output.schema.json' with { type: 'json' };
import type { MarketSnapshotInterpretationOutput } from '../../../contracts/analysis/market-snapshot-interpretation-output.generated.js';
import interpretationRequestSchema from '../../../contracts/analysis/market-snapshot-interpretation-request.schema.json' with { type: 'json' };
import type { MarketSnapshotInterpretationRequest } from '../../../contracts/analysis/market-snapshot-interpretation-request.generated.js';
import interpretationSchema from '../../../contracts/analysis/market-snapshot-interpretation.schema.json' with { type: 'json' };
import type { MarketSnapshotInterpretation } from '../../../contracts/analysis/market-snapshot-interpretation.generated.js';
import requestSchema from '../../../contracts/analysis/market-snapshot-request.schema.json' with { type: 'json' };
import type { MarketSnapshotRequest } from '../../../contracts/analysis/market-snapshot-request.generated.js';
import resultSchema from '../../../contracts/analysis/market-snapshot-result.schema.json' with { type: 'json' };
import type { MarketSnapshotResult } from '../../../contracts/analysis/market-snapshot-result.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(interpretationOutputSchema);
const validateGovernedSkillRequest = ajv.compile(governedSkillRequestSchema);
const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);
const validateInterpretationRequest = ajv.compile(interpretationRequestSchema);
const validateInterpretationOutput = ajv.getSchema<MarketSnapshotInterpretationOutput>(interpretationOutputSchema.$id)!;
const validateInterpretation = ajv.compile(interpretationSchema);

export class AnalysisValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid analysis input: ${details}`);
    this.details = details;
  }
}

export function validateMarketSnapshotRequest(value: unknown): MarketSnapshotRequest {
  if (!validateRequest(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateRequest.errors, { separator: '; ' }));
  }
  return value as unknown as MarketSnapshotRequest;
}

export function validateMarketSnapshotResult(value: unknown): MarketSnapshotResult {
  if (!validateResult(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateResult.errors, { separator: '; ' }));
  }
  const result = value as unknown as MarketSnapshotResult;
  const sortedIgnored = [...result.ignoredMetricCodes].sort();
  if (result.ignoredMetricCodes.some((code, index) => code !== sortedIgnored[index])) {
    throw new AnalysisValidationError('ignoredMetricCodes must be sorted');
  }
  return result;
}

export function validateMarketSnapshotInterpretationRequest(value: unknown): MarketSnapshotInterpretationRequest {
  if (!validateInterpretationRequest(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateInterpretationRequest.errors, { separator: '; ' }));
  }
  return value as unknown as MarketSnapshotInterpretationRequest;
}

export function validateMarketSnapshotInterpretationOutput(value: unknown): MarketSnapshotInterpretationOutput {
  if (!validateInterpretationOutput(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateInterpretationOutput.errors, { separator: '; ' }));
  }
  return value as MarketSnapshotInterpretationOutput;
}

export function validateMarketSnapshotInterpretation(value: unknown): MarketSnapshotInterpretation {
  if (!validateInterpretation(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateInterpretation.errors, { separator: '; ' }));
  }
  return value as unknown as MarketSnapshotInterpretation;
}

export function validateGovernedSkillExecutionRequest(value: unknown): GovernedSkillExecutionRequest {
  if (!validateGovernedSkillRequest(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateGovernedSkillRequest.errors, { separator: '; ' }));
  }
  return value as unknown as GovernedSkillExecutionRequest;
}
