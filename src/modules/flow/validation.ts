import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/flow/approved-proposal-intake-request.schema.json' with { type: 'json' };
import type { ApprovedProposalIntakeRequest } from '../../../contracts/flow/approved-proposal-intake-request.generated.js';
import planSchema from '../../../contracts/flow/authorized-plan.schema.json' with { type: 'json' };
import type { AuthorizedPlan } from '../../../contracts/flow/authorized-plan.generated.js';
import decisionSchema from '../../../contracts/governance/governed-proposal-decision.schema.json' with { type: 'json' };
import type { GovernedProposalDecision } from '../../../contracts/governance/governed-proposal-decision.generated.js';
import decisionRequestSchema from '../../../contracts/governance/governed-proposal-review-request.schema.json' with { type: 'json' };
import workspaceRequestSchema from '../../../contracts/flow/discovery-workspace-request.schema.json' with { type: 'json' };
import type { DiscoveryWorkspaceRequest } from '../../../contracts/flow/discovery-workspace-request.generated.js';
import workspaceArtifactSchema from '../../../contracts/flow/discovery-workspace-artifact.schema.json' with { type: 'json' };
import type { DiscoveryWorkspaceArtifact } from '../../../contracts/flow/discovery-workspace-artifact.generated.js';
import candidateCreateSchema from '../../../contracts/flow/product-candidate-create-request.schema.json' with { type: 'json' };
import type { ProductCandidateCreateRequest } from '../../../contracts/flow/product-candidate-create-request.generated.js';
import candidateRevisionSchema from '../../../contracts/flow/product-candidate-revision-request.schema.json' with { type: 'json' };
import type { ProductCandidateRevisionRequest } from '../../../contracts/flow/product-candidate-revision-request.generated.js';
import candidateArtifactSchema from '../../../contracts/flow/product-candidate-artifact.schema.json' with { type: 'json' };
import type { ProductCandidateArtifact } from '../../../contracts/flow/product-candidate-artifact.generated.js';
import basketRequestSchema from '../../../contracts/flow/candidate-basket-freeze-request.schema.json' with { type: 'json' };
import type { CandidateBasketFreezeRequest } from '../../../contracts/flow/candidate-basket-freeze-request.generated.js';
import basketArtifactSchema from '../../../contracts/flow/candidate-basket-artifact.schema.json' with { type: 'json' };
import type { CandidateBasketArtifact } from '../../../contracts/flow/candidate-basket-artifact.generated.js';
import productWorkspaceRequestSchema from '../../../contracts/flow/product-workspace-create-request.schema.json' with { type: 'json' };
import type { ProductWorkspaceCreateRequest } from '../../../contracts/flow/product-workspace-create-request.generated.js';
import productWorkspaceArtifactSchema from '../../../contracts/flow/product-workspace-artifact.schema.json' with { type: 'json' };
import type { ProductWorkspaceArtifact } from '../../../contracts/flow/product-workspace-artifact.generated.js';
import candidateB7DecisionRequestSchema from '../../../contracts/governance/candidate-b7-decision-request.schema.json' with { type: 'json' };
import candidateB7DecisionSchema from '../../../contracts/governance/candidate-b7-decision.schema.json' with { type: 'json' };
import type { CandidateB7Decision } from '../../../contracts/governance/candidate-b7-decision.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(requestSchema);
ajv.addSchema(decisionRequestSchema);
ajv.addSchema(candidateB7DecisionRequestSchema);
ajv.addSchema(productWorkspaceRequestSchema);
const validateRequest = ajv.getSchema<ApprovedProposalIntakeRequest>(requestSchema.$id)!;
const validatePlan = ajv.compile<AuthorizedPlan>(planSchema);
const validateDecision = ajv.compile<GovernedProposalDecision>(decisionSchema);
const validateWorkspaceRequest = ajv.compile<DiscoveryWorkspaceRequest>(workspaceRequestSchema);
const validateWorkspaceArtifact = ajv.compile<DiscoveryWorkspaceArtifact>(workspaceArtifactSchema);
const validateCandidateCreate = ajv.compile<ProductCandidateCreateRequest>(candidateCreateSchema);
const validateCandidateRevision = ajv.compile<ProductCandidateRevisionRequest>(candidateRevisionSchema);
const validateCandidateArtifact = ajv.compile<ProductCandidateArtifact>(candidateArtifactSchema);
const validateBasketRequest = ajv.compile<CandidateBasketFreezeRequest>(basketRequestSchema);
const validateBasketArtifact = ajv.compile<CandidateBasketArtifact>(basketArtifactSchema);
const validateProductWorkspaceRequest = ajv.getSchema<ProductWorkspaceCreateRequest>(productWorkspaceRequestSchema.$id)!;
const validateProductWorkspaceEnvelope = ajv.compile<ProductWorkspaceArtifact>(productWorkspaceArtifactSchema);
const validateCandidateB7Source = ajv.compile<CandidateB7Decision>(candidateB7DecisionSchema);

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

export function validateDiscoveryWorkspaceRequest(value: unknown): DiscoveryWorkspaceRequest {
  if (!validateWorkspaceRequest(value)) throw new FlowValidationError(ajv.errorsText(validateWorkspaceRequest.errors, { separator: '; ' }));
  return value as DiscoveryWorkspaceRequest;
}

export function validateDiscoveryWorkspaceArtifact(value: unknown): DiscoveryWorkspaceArtifact {
  if (!validateWorkspaceArtifact(value)) throw new FlowValidationError(ajv.errorsText(validateWorkspaceArtifact.errors, { separator: '; ' }));
  return value as DiscoveryWorkspaceArtifact;
}

export function validateProductCandidateCreateRequest(value: unknown): ProductCandidateCreateRequest {
  if (!validateCandidateCreate(value)) throw new FlowValidationError(ajv.errorsText(validateCandidateCreate.errors, { separator: '; ' }));
  return value as ProductCandidateCreateRequest;
}

export function validateProductCandidateRevisionRequest(value: unknown): ProductCandidateRevisionRequest {
  if (!validateCandidateRevision(value)) throw new FlowValidationError(ajv.errorsText(validateCandidateRevision.errors, { separator: '; ' }));
  return value as ProductCandidateRevisionRequest;
}

export function validateProductCandidateArtifact(value: unknown): ProductCandidateArtifact {
  if (!validateCandidateArtifact(value)) throw new FlowValidationError(ajv.errorsText(validateCandidateArtifact.errors, { separator: '; ' }));
  return value as ProductCandidateArtifact;
}

export function validateCandidateBasketFreezeRequest(value: unknown): CandidateBasketFreezeRequest {
  if (!validateBasketRequest(value)) throw new FlowValidationError(ajv.errorsText(validateBasketRequest.errors, { separator: '; ' }));
  return value as CandidateBasketFreezeRequest;
}

export function validateCandidateBasketArtifact(value: unknown): CandidateBasketArtifact {
  if (!validateBasketArtifact(value)) throw new FlowValidationError(ajv.errorsText(validateBasketArtifact.errors, { separator: '; ' }));
  return value as CandidateBasketArtifact;
}

export function validateProductWorkspaceCreateRequest(value: unknown): ProductWorkspaceCreateRequest {
  if (!validateProductWorkspaceRequest(value)) throw new FlowValidationError(ajv.errorsText(validateProductWorkspaceRequest.errors, { separator: '; ' }));
  return value as ProductWorkspaceCreateRequest;
}

export function validateProductWorkspaceArtifact(value: unknown): ProductWorkspaceArtifact {
  if (!validateProductWorkspaceEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateProductWorkspaceEnvelope.errors, { separator: '; ' }));
  return value as ProductWorkspaceArtifact;
}

export function validateSourceCandidateB7Decision(value: unknown): CandidateB7Decision {
  if (!validateCandidateB7Source(value)) throw new FlowValidationError(`Malformed verified B7 decision reader result: ${ajv.errorsText(validateCandidateB7Source.errors, { separator: '; ' })}`);
  return value as CandidateB7Decision;
}
