import { createRequire } from 'node:module';
import candidateDecisionSchema from '../../../contracts/governance/candidate-b7-decision.schema.json' with { type: 'json' };
import type { CandidateB7Decision } from '../../../contracts/governance/candidate-b7-decision.generated.js';
import candidateRequestSchema from '../../../contracts/governance/candidate-b7-decision-request.schema.json' with { type: 'json' };
import type { CandidateB7DecisionRequest } from '../../../contracts/governance/candidate-b7-decision-request.generated.js';
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
const validateRequest = ajv.getSchema<GovernedProposalReviewRequest>(requestSchema.$id)!;
const validateDecision = ajv.compile<GovernedProposalDecision>(decisionSchema);
const validateCandidateRequest = ajv.getSchema<CandidateB7DecisionRequest>(candidateRequestSchema.$id)!;
const validateCandidateDecisionEnvelope = ajv.compile<CandidateB7Decision>(candidateDecisionSchema);

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
