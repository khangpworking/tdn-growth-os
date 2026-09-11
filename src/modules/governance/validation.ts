import { createRequire } from 'node:module';
import candidateDecisionSchema from '../../../contracts/governance/candidate-b7-decision.schema.json' with { type: 'json' };
import type { CandidateB7Decision } from '../../../contracts/governance/candidate-b7-decision.generated.js';
import candidateRequestSchema from '../../../contracts/governance/candidate-b7-decision-request.schema.json' with { type: 'json' };
import type { CandidateB7DecisionRequest } from '../../../contracts/governance/candidate-b7-decision-request.generated.js';
import productB8DecisionSchema from '../../../contracts/governance/product-b8-lane-decision.schema.json' with { type: 'json' };
import type { ProductB8LaneDecision } from '../../../contracts/governance/product-b8-lane-decision.generated.js';
import productB8RequestSchema from '../../../contracts/governance/product-b8-lane-decision-request.schema.json' with { type: 'json' };
import type { ProductB8LaneDecisionRequest } from '../../../contracts/governance/product-b8-lane-decision-request.generated.js';
import productB10DecisionSchema from '../../../contracts/governance/product-b10-decision.schema.json' with { type: 'json' };
import type { ProductB10Decision } from '../../../contracts/governance/product-b10-decision.generated.js';
import productB10RequestSchema from '../../../contracts/governance/product-b10-decision-request.schema.json' with { type: 'json' };
import type { ProductB10DecisionRequest } from '../../../contracts/governance/product-b10-decision-request.generated.js';
import lockedStpSchema from '../../../contracts/flow/locked-stp-artifact.schema.json' with { type: 'json' };
import stpContentSchema from '../../../contracts/flow/stp-content.schema.json' with { type: 'json' };
import type { LockedStpArtifact } from '../../../contracts/flow/locked-stp-artifact.generated.js';
import productWorkspaceSchema from '../../../contracts/flow/product-workspace-artifact.schema.json' with { type: 'json' };
import productWorkspaceRequestSchema from '../../../contracts/flow/product-workspace-create-request.schema.json' with { type: 'json' };
import decisionSchema from '../../../contracts/governance/governed-proposal-decision.schema.json' with { type: 'json' };
import type { GovernedProposalDecision } from '../../../contracts/governance/governed-proposal-decision.generated.js';
import requestSchema from '../../../contracts/governance/governed-proposal-review-request.schema.json' with { type: 'json' };
import type { GovernedProposalReviewRequest } from '../../../contracts/governance/governed-proposal-review-request.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(requestSchema);
ajv.addSchema(candidateRequestSchema);
ajv.addSchema(productWorkspaceRequestSchema);
ajv.addSchema(productWorkspaceSchema);
ajv.addSchema(productB8RequestSchema);
ajv.addSchema(stpContentSchema);
ajv.addSchema(lockedStpSchema);
ajv.addSchema(productB10RequestSchema);
const validateRequest = ajv.getSchema<GovernedProposalReviewRequest>(requestSchema.$id)!;
const validateDecision = ajv.compile<GovernedProposalDecision>(decisionSchema);
const validateCandidateRequest = ajv.getSchema<CandidateB7DecisionRequest>(candidateRequestSchema.$id)!;
const validateCandidateDecisionEnvelope = ajv.compile<CandidateB7Decision>(candidateDecisionSchema);
const validateProductB8Request = ajv.getSchema<ProductB8LaneDecisionRequest>(productB8RequestSchema.$id)!;
const validateProductB8DecisionEnvelope = ajv.compile<ProductB8LaneDecision>(productB8DecisionSchema);
const validateProductB10Request = ajv.getSchema<ProductB10DecisionRequest>(productB10RequestSchema.$id)!;
const validateProductB10DecisionEnvelope = ajv.compile<ProductB10Decision>(productB10DecisionSchema);
const validateLockedStpSource = ajv.getSchema<LockedStpArtifact>(lockedStpSchema.$id)!;

export class GovernanceValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid governance input: ${details}`);
    this.details = details;
  }
}

export function validateGovernedProposalReviewRequest(value: unknown): GovernedProposalReviewRequest {
  if (!validateRequest(value)) {
    throw new GovernanceValidationError(ajv.errorsText(validateRequest.errors, { separator: '; ' }));
  }
  return value as GovernedProposalReviewRequest;
}

export function validateGovernedProposalDecision(value: unknown): GovernedProposalDecision {
  if (!validateDecision(value)) {
    throw new GovernanceValidationError(ajv.errorsText(validateDecision.errors, { separator: '; ' }));
  }
  return value as GovernedProposalDecision;
}

export function validateCandidateB7DecisionRequest(value: unknown): CandidateB7DecisionRequest {
  if (!validateCandidateRequest(value)) throw new GovernanceValidationError(ajv.errorsText(validateCandidateRequest.errors, { separator: '; ' }));
  return value as CandidateB7DecisionRequest;
}

export function validateCandidateB7Decision(value: unknown): CandidateB7Decision {
  if (!validateCandidateDecisionEnvelope(value)) throw new GovernanceValidationError(ajv.errorsText(validateCandidateDecisionEnvelope.errors, { separator: '; ' }));
  return value as CandidateB7Decision;
}

export function validateProductB8LaneDecisionRequest(value: unknown): ProductB8LaneDecisionRequest {
  if (!validateProductB8Request(value)) throw new GovernanceValidationError(ajv.errorsText(validateProductB8Request.errors, { separator: '; ' }));
  return value as ProductB8LaneDecisionRequest;
}

export function validateProductB8LaneDecision(value: unknown): ProductB8LaneDecision {
  if (!validateProductB8DecisionEnvelope(value)) throw new GovernanceValidationError(ajv.errorsText(validateProductB8DecisionEnvelope.errors, { separator: '; ' }));
  return value as ProductB8LaneDecision;
}

export function validateProductB10DecisionRequest(value: unknown): ProductB10DecisionRequest {
  if (!validateProductB10Request(value)) throw new GovernanceValidationError(ajv.errorsText(validateProductB10Request.errors, { separator: '; ' }));
  return value as ProductB10DecisionRequest;
}

export function validateProductB10Decision(value: unknown): ProductB10Decision {
  if (!validateProductB10DecisionEnvelope(value)) throw new GovernanceValidationError(ajv.errorsText(validateProductB10DecisionEnvelope.errors, { separator: '; ' }));
  return value as ProductB10Decision;
}

export function validateSourceLockedStp(value: unknown): LockedStpArtifact {
  if (!validateLockedStpSource(value)) throw new GovernanceValidationError(`Malformed verified LockedStpReader result: ${ajv.errorsText(validateLockedStpSource.errors, { separator: '; ' })}`);
  return value as LockedStpArtifact;
}
