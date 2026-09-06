import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/market-snapshot-request.schema.json' with { type: 'json' };
import type { MarketSnapshotRequest } from '../../../contracts/analysis/market-snapshot-request.generated.js';
import resultSchema from '../../../contracts/analysis/market-snapshot-result.schema.json' with { type: 'json' };
import type { MarketSnapshotResult } from '../../../contracts/analysis/market-snapshot-result.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);

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
