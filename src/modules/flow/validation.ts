import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/flow/approved-proposal-intake-request.schema.json' with { type: 'json' };
import type { ApprovedProposalIntakeRequest } from '../../../contracts/flow/approved-proposal-intake-request.generated.js';
import planSchema from '../../../contracts/flow/authorized-plan.schema.json' with { type: 'json' };
import type { AuthorizedPlan } from '../../../contracts/flow/authorized-plan.generated.js';
import decisionSchema from '../../../contracts/governance/governed-proposal-decision.schema.json' with { type: 'json' };
import type { GovernedProposalDecision } from '../../../contracts/governance/governed-proposal-decision.generated.js';
import decisionRequestSchema from '../../../contracts/governance/governed-proposal-review-request.schema.json' with { type: 'json' };

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(requestSchema);
ajv.addSchema(decisionRequestSchema);
const validateRequest = ajv.getSchema<ApprovedProposalIntakeRequest>(requestSchema.$id)!;
const validatePlan = ajv.compile<AuthorizedPlan>(planSchema);
const validateDecision = ajv.compile<GovernedProposalDecision>(decisionSchema);

export class FlowValidationError extends Error {
  readonly details: string;

  constructor(details: string) {
    super(`Invalid flow input: ${details}`);
    this.details = details;
  }
}

export function validateApprovedProposalIntakeRequest(value: unknown): ApprovedProposalIntakeRequest {
  if (!validateRequest(value)) throw new FlowValidationError(ajv.errorsText(validateRequest.errors, { separator: '; ' }));
  return value as ApprovedProposalIntakeRequest;
}

export function validateAuthorizedPlan(value: unknown): AuthorizedPlan {
  if (!validatePlan(value)) throw new FlowValidationError(ajv.errorsText(validatePlan.errors, { separator: '; ' }));
  return value as AuthorizedPlan;
}

export function validateSourceDecision(value: unknown): GovernedProposalDecision {
  if (!validateDecision(value)) throw new FlowValidationError(`Malformed verified decision reader result: ${ajv.errorsText(validateDecision.errors, { separator: '; ' })}`);
  return value as GovernedProposalDecision;
}
