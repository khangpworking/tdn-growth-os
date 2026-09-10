import { createRequire } from 'node:module';
import fieldAuditRequestSchema from '../../../contracts/analysis/source-package-field-audit-request.schema.json' with { type: 'json' };
import fieldAuditResultSchema from '../../../contracts/analysis/source-package-field-audit-result.schema.json' with { type: 'json' };
import type { SourcePackageFieldAuditRequest } from '../../../contracts/analysis/source-package-field-audit-request.generated.js';
import type { SourcePackageFieldAuditResult } from '../../../contracts/analysis/source-package-field-audit-result.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import auditRequestSchema from '../../../contracts/analysis/research-evidence-audit-request.schema.json' with { type: 'json' };
import type { ResearchEvidenceAuditRequest } from '../../../contracts/analysis/research-evidence-audit-request.generated.js';
import auditOutputSchema from '../../../contracts/analysis/research-evidence-audit-output.schema.json' with { type: 'json' };
import type { ResearchEvidenceAuditOutput } from '../../../contracts/analysis/research-evidence-audit-output.generated.js';
import auditSchema from '../../../contracts/analysis/research-evidence-audit.schema.json' with { type: 'json' };
import type { ResearchEvidenceAudit } from '../../../contracts/analysis/research-evidence-audit.generated.js';
import evidenceIndexRequestSchema from '../../../contracts/analysis/research-evidence-index-request.schema.json' with { type: 'json' };
import type { ResearchEvidenceIndexRequest } from '../../../contracts/analysis/research-evidence-index-request.generated.js';
import evidenceIndexResultSchema from '../../../contracts/analysis/research-evidence-index-result.schema.json' with { type: 'json' };
import type { ResearchEvidenceIndexResult } from '../../../contracts/analysis/research-evidence-index-result.generated.js';
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
ajv.addSchema(fieldAuditRequestSchema);
const validateFieldAuditRequestContract = ajv.getSchema<SourcePackageFieldAuditRequest>(fieldAuditRequestSchema.$id)!;
const validateFieldAuditResultContract = ajv.compile(fieldAuditResultSchema);
ajv.addSchema(interpretationOutputSchema);
ajv.addSchema(auditOutputSchema);
const validateGovernedSkillRequest = ajv.compile(governedSkillRequestSchema);
const validateRequest = ajv.compile(requestSchema);
const validateResult = ajv.compile(resultSchema);
const validateInterpretationRequest = ajv.compile(interpretationRequestSchema);
const validateInterpretationOutput = ajv.getSchema<MarketSnapshotInterpretationOutput>(interpretationOutputSchema.$id)!;
const validateInterpretation = ajv.compile(interpretationSchema);
const validateEvidenceIndexRequest = ajv.compile(evidenceIndexRequestSchema);
const validateEvidenceIndexResult = ajv.compile(evidenceIndexResultSchema);
const validateAuditRequest = ajv.compile(auditRequestSchema);
const validateAuditOutput = ajv.getSchema<ResearchEvidenceAuditOutput>(auditOutputSchema.$id)!;
const validateAudit = ajv.compile(auditSchema);

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

export function validateResearchEvidenceIndexRequest(value: unknown): ResearchEvidenceIndexRequest {
  if (!validateEvidenceIndexRequest(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateEvidenceIndexRequest.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchEvidenceIndexRequest;
}

export function validateResearchEvidenceIndexResult(value: unknown): ResearchEvidenceIndexResult {
  if (!validateEvidenceIndexResult(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateEvidenceIndexResult.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchEvidenceIndexResult;
}

export function validateResearchEvidenceAuditRequest(value: unknown): ResearchEvidenceAuditRequest {
  if (!validateAuditRequest(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateAuditRequest.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchEvidenceAuditRequest;
}

export function validateResearchEvidenceAuditOutput(value: unknown): ResearchEvidenceAuditOutput {
  if (!validateAuditOutput(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateAuditOutput.errors, { separator: '; ' }));
  }
  return value as ResearchEvidenceAuditOutput;
}

export function validateResearchEvidenceAudit(value: unknown): ResearchEvidenceAudit {
  if (!validateAudit(value)) {
    throw new AnalysisValidationError(ajv.errorsText(validateAudit.errors, { separator: '; ' }));
  }
  return value as unknown as ResearchEvidenceAudit;
}

export function validateSourcePackageFieldAuditRequest(value: unknown): SourcePackageFieldAuditRequest {
  if (!validateFieldAuditRequestContract(value)) throw new AnalysisValidationError(ajv.errorsText(validateFieldAuditRequestContract.errors, { separator: '; ' }));
  const request = value as SourcePackageFieldAuditRequest;
  validateFieldAuditSemantics(request);
  return request;
}

export function validateSourcePackageFieldAuditResult(value: unknown): SourcePackageFieldAuditResult {
  if (!validateFieldAuditResultContract(value)) throw new AnalysisValidationError(ajv.errorsText(validateFieldAuditResultContract.errors, { separator: '; ' }));
  const result = value as unknown as SourcePackageFieldAuditResult;
  validateFieldAuditSemantics(result);
  const canonical = canonicalizeSourcePackageFieldAuditCollections(result);
  if (
    canonicalJson(result.observations) !== canonicalJson(canonical.observations) ||
    canonicalJson(result.conflicts) !== canonicalJson(canonical.conflicts) ||
    canonicalJson(result.periodComparisons) !== canonicalJson(canonical.periodComparisons)
  ) {
    throw new AnalysisValidationError('Field audit result collections must use canonical sorted order');
  }
  return result;
}

function validateFieldAuditSemantics(value: Pick<SourcePackageFieldAuditRequest, 'observations' | 'conflicts' | 'periodComparisons'>): void {
  const observations = new Map(value.observations.map((item) => [item.observationKey, item]));
  if (observations.size !== value.observations.length) throw new AnalysisValidationError('observationKey must be unique');
  for (const item of value.observations) {
    if (item.state === 'missing' && (item.value !== null || item.unit !== null)) throw new AnalysisValidationError(`Missing field must have null value/unit: ${item.observationKey}`);
    if (item.state === 'observed_zero' && item.value !== '0') throw new AnalysisValidationError(`Observed zero must have exact value "0": ${item.observationKey}`);
    if (item.state === 'observed_value' && (item.value === null || item.value === '0')) throw new AnalysisValidationError(`Observed value must be non-null and not "0": ${item.observationKey}`);
  }
  for (const conflict of value.conflicts) {
    if (conflict.observationKeys.some((key) => !observations.has(key))) throw new AnalysisValidationError('Conflict references unknown observationKey');
    const families = new Set(conflict.observationKeys.map((key) => observations.get(key)!.evidenceFamily));
    if (families.size > 1 && conflict.type !== 'scope_mismatch') throw new AnalysisValidationError('Only an explicit unresolved scope_mismatch conflict may cross evidence families');
  }
  for (const comparison of value.periodComparisons) {
    if (!observations.has(comparison.leftObservationKey) || !observations.has(comparison.rightObservationKey)) throw new AnalysisValidationError('Period comparison references unknown observationKey');
    if (comparison.leftObservationKey === comparison.rightObservationKey) throw new AnalysisValidationError('Period comparison observation keys must be distinct');
    if (comparison.compatibility === 'incompatible' && comparison.claim !== null) throw new AnalysisValidationError('Incompatible periods cannot have a comparison claim');
  }
}

export function canonicalizeSourcePackageFieldAuditCollections<
  T extends Pick<SourcePackageFieldAuditRequest, 'observations' | 'conflicts' | 'periodComparisons'>,
>(value: T): T {
  const compareCanonical = (left: unknown, right: unknown): number => {
    const a = canonicalJson(left);
    const b = canonicalJson(right);
    return a < b ? -1 : a > b ? 1 : 0;
  };
  const observations = [...value.observations].sort((a, b) =>
    a.observationKey < b.observationKey ? -1 : a.observationKey > b.observationKey ? 1 : 0,
  );
  const conflicts = value.conflicts
    .map((conflict) => ({ ...conflict, observationKeys: [...conflict.observationKeys].sort() }))
    .sort(compareCanonical);
  const periodComparisons = [...value.periodComparisons].sort(compareCanonical);
  return { ...value, observations, conflicts, periodComparisons } as T;
}
