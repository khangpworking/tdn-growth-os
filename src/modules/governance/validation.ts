import { createRequire } from 'node:module';
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
const validateRequest = ajv.getSchema<GovernedProposalReviewRequest>(requestSchema.$id)!;
const validateDecision = ajv.compile<GovernedProposalDecision>(decisionSchema);

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
