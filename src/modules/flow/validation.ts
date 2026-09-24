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
import productB8DecisionRequestSchema from '../../../contracts/governance/product-b8-lane-decision-request.schema.json' with { type: 'json' };
import productB8DecisionSchema from '../../../contracts/governance/product-b8-lane-decision.schema.json' with { type: 'json' };
import type { ProductB8LaneDecision } from '../../../contracts/governance/product-b8-lane-decision.generated.js';
import b8ClearanceRequestSchema from '../../../contracts/flow/b8-clearance-create-request.schema.json' with { type: 'json' };
import type { B8ClearanceCreateRequest } from '../../../contracts/flow/b8-clearance-create-request.generated.js';
import b8ClearanceArtifactSchema from '../../../contracts/flow/b8-clearance-artifact.schema.json' with { type: 'json' };
import type { B8ClearanceArtifact } from '../../../contracts/flow/b8-clearance-artifact.generated.js';
import stpContentSchema from '../../../contracts/flow/stp-content.schema.json' with { type: 'json' };
import type { StpContent } from '../../../contracts/flow/stp-content.generated.js';
import stpWorkingSaveRequestSchema from '../../../contracts/flow/stp-working-save-request.schema.json' with { type: 'json' };
import type { StpWorkingSaveRequest } from '../../../contracts/flow/stp-working-save-request.generated.js';
import stpLockRequestSchema from '../../../contracts/flow/stp-lock-request.schema.json' with { type: 'json' };
import type { StpLockRequest } from '../../../contracts/flow/stp-lock-request.generated.js';
import lockedStpArtifactSchema from '../../../contracts/flow/locked-stp-artifact.schema.json' with { type: 'json' };
import type { LockedStpArtifact } from '../../../contracts/flow/locked-stp-artifact.generated.js';
import contentBrandCreateSchema from '../../../contracts/flow/content-brand-create-request.schema.json' with { type: 'json' };
import type { ContentBrandCreateRequest } from '../../../contracts/flow/content-brand-create-request.generated.js';
import contentBrandRevisionSchema from '../../../contracts/flow/content-brand-revision-request.schema.json' with { type: 'json' };
import type { ContentBrandRevisionRequest } from '../../../contracts/flow/content-brand-revision-request.generated.js';
import contentBrandArtifactSchema from '../../../contracts/flow/content-brand-artifact.schema.json' with { type: 'json' };
import type { ContentBrandArtifact } from '../../../contracts/flow/content-brand-artifact.generated.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
ajv.addSchema(requestSchema);
ajv.addSchema(decisionRequestSchema);
ajv.addSchema(candidateB7DecisionRequestSchema);
ajv.addSchema(productWorkspaceRequestSchema);
ajv.addSchema(productB8DecisionRequestSchema);
ajv.addSchema(productWorkspaceArtifactSchema);
ajv.addSchema(productB8DecisionSchema);
ajv.addSchema(stpContentSchema);
ajv.addSchema(stpWorkingSaveRequestSchema);
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
const validateB8ClearanceRequest = ajv.compile<B8ClearanceCreateRequest>(b8ClearanceRequestSchema);
const validateB8ClearanceEnvelope = ajv.compile<B8ClearanceArtifact>(b8ClearanceArtifactSchema);
const validateProductB8Source = ajv.getSchema<ProductB8LaneDecision>(productB8DecisionSchema.$id)!;
const validateStpContentEnvelope = ajv.getSchema<StpContent>(stpContentSchema.$id)!;
const validateStpWorkingSave = ajv.getSchema<StpWorkingSaveRequest>(stpWorkingSaveRequestSchema.$id)!;
const validateStpLock = ajv.compile<StpLockRequest>(stpLockRequestSchema);
const validateLockedStp = ajv.compile<LockedStpArtifact>(lockedStpArtifactSchema);
const validateContentBrandCreate = ajv.compile<ContentBrandCreateRequest>(contentBrandCreateSchema);
const validateContentBrandRevision = ajv.compile<ContentBrandRevisionRequest>(contentBrandRevisionSchema);
const validateContentBrandEnvelope = ajv.compile<ContentBrandArtifact>(contentBrandArtifactSchema);

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

export function validateB8ClearanceCreateRequest(value: unknown): B8ClearanceCreateRequest {
  if (!validateB8ClearanceRequest(value)) throw new FlowValidationError(ajv.errorsText(validateB8ClearanceRequest.errors, { separator: '; ' }));
  return value as B8ClearanceCreateRequest;
}

export function validateB8ClearanceArtifact(value: unknown): B8ClearanceArtifact {
  if (!validateB8ClearanceEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateB8ClearanceEnvelope.errors, { separator: '; ' }));
  return value as B8ClearanceArtifact;
}

export function validateSourceProductB8Decision(value: unknown): ProductB8LaneDecision {
  if (!validateProductB8Source(value)) throw new FlowValidationError(`Malformed verified B8 decision reader result: ${ajv.errorsText(validateProductB8Source.errors, { separator: '; ' })}`);
  return value as ProductB8LaneDecision;
}

export function validateStpContent(value: unknown): StpContent {
  if (!validateStpContentEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateStpContentEnvelope.errors, { separator: '; ' }));
  const content = value as StpContent;
  const segmentKeys = content.segments.map((segment) => segment.key);
  if (new Set(segmentKeys).size !== segmentKeys.length) throw new FlowValidationError('STP segment keys must be unique');
  if (!segmentKeys.includes(content.primaryTargetSegmentKey)) throw new FlowValidationError('Primary target segment key must resolve to a supplied segment');
  const secondary = content.secondaryTargetSegmentKeys ?? [];
  if (secondary.includes(content.primaryTargetSegmentKey)) throw new FlowValidationError('Primary and secondary target segment keys must not overlap');
  if (secondary.some((key) => !segmentKeys.includes(key))) throw new FlowValidationError('Secondary target segment keys must resolve to supplied segments');
  return content;
}

export function validateStpWorkingSaveRequest(value: unknown): StpWorkingSaveRequest {
  if (!validateStpWorkingSave(value)) throw new FlowValidationError(ajv.errorsText(validateStpWorkingSave.errors, { separator: '; ' }));
  validateStpContent(stpContentFromSave(value as StpWorkingSaveRequest));
  return value as StpWorkingSaveRequest;
}

export function validateStpLockRequest(value: unknown): StpLockRequest {
  if (!validateStpLock(value)) throw new FlowValidationError(ajv.errorsText(validateStpLock.errors, { separator: '; ' }));
  return value as StpLockRequest;
}

export function validateLockedStpArtifact(value: unknown): LockedStpArtifact {
  if (!validateLockedStp(value)) throw new FlowValidationError(ajv.errorsText(validateLockedStp.errors, { separator: '; ' }));
  validateStpContent((value as LockedStpArtifact).workingStp.content);
  return value as LockedStpArtifact;
}

function stpContentFromSave(value: StpWorkingSaveRequest): StpContent {
  return {
    segments: value.segments,
    primaryTargetSegmentKey: value.primaryTargetSegmentKey,
    ...(value.secondaryTargetSegmentKeys === undefined ? {} : { secondaryTargetSegmentKeys: value.secondaryTargetSegmentKeys }),
    positioningStatement: value.positioningStatement,
  };
}

export function validateContentBrandCreateRequest(value: unknown): ContentBrandCreateRequest {
  if (!validateContentBrandCreate(value)) throw new FlowValidationError(ajv.errorsText(validateContentBrandCreate.errors, { separator: '; ' }));
  return value as ContentBrandCreateRequest;
}

export function validateContentBrandRevisionRequest(value: unknown): ContentBrandRevisionRequest {
  if (!validateContentBrandRevision(value)) throw new FlowValidationError(ajv.errorsText(validateContentBrandRevision.errors, { separator: '; ' }));
  return value as ContentBrandRevisionRequest;
}

export function validateContentBrandArtifact(value: unknown): ContentBrandArtifact {
  if (!validateContentBrandEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateContentBrandEnvelope.errors, { separator: '; ' }));
  return value as ContentBrandArtifact;
}
