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
import contentCatalogItemCreateSchema from '../../../contracts/flow/content-catalog-item-create-request.schema.json' with { type: 'json' };
import type { ContentCatalogItemContent, ContentCatalogItemCreateRequest } from '../../../contracts/flow/content-catalog-item-create-request.generated.js';
import contentCatalogItemRevisionSchema from '../../../contracts/flow/content-catalog-item-revision-request.schema.json' with { type: 'json' };
import type { ContentCatalogItemRevisionRequest } from '../../../contracts/flow/content-catalog-item-revision-request.generated.js';
import contentCatalogItemArtifactSchema from '../../../contracts/flow/content-catalog-item-artifact.schema.json' with { type: 'json' };
import type { ContentCatalogItemArtifact } from '../../../contracts/flow/content-catalog-item-artifact.generated.js';
import contentPromptCreateSchema from '../../../contracts/flow/content-prompt-create-request.schema.json' with { type: 'json' };
import type { ContentPromptContent, ContentPromptCreateRequest, ContentPromptModel, ContentPromptType } from '../../../contracts/flow/content-prompt-create-request.generated.js';
import contentPromptRevisionSchema from '../../../contracts/flow/content-prompt-revision-request.schema.json' with { type: 'json' };
import type { ContentPromptRevisionRequest } from '../../../contracts/flow/content-prompt-revision-request.generated.js';
import contentPromptLifecycleSchema from '../../../contracts/flow/content-prompt-lifecycle-request.schema.json' with { type: 'json' };
import type { ContentPromptLifecycleRequest } from '../../../contracts/flow/content-prompt-lifecycle-request.generated.js';
import contentPromptArtifactSchema from '../../../contracts/flow/content-prompt-artifact.schema.json' with { type: 'json' };
import type { ContentPromptArtifact } from '../../../contracts/flow/content-prompt-artifact.generated.js';
import contentCampaignCreateSchema from '../../../contracts/flow/content-campaign-create-request.schema.json' with { type: 'json' };
import type { ContentCampaignContent, ContentCampaignCreateRequest } from '../../../contracts/flow/content-campaign-create-request.generated.js';
import contentCampaignRevisionSchema from '../../../contracts/flow/content-campaign-revision-request.schema.json' with { type: 'json' };
import type { ContentCampaignRevisionRequest } from '../../../contracts/flow/content-campaign-revision-request.generated.js';
import contentCampaignLifecycleSchema from '../../../contracts/flow/content-campaign-lifecycle-request.schema.json' with { type: 'json' };
import type { ContentCampaignLifecycleRequest } from '../../../contracts/flow/content-campaign-lifecycle-request.generated.js';
import contentCampaignArtifactSchema from '../../../contracts/flow/content-campaign-artifact.schema.json' with { type: 'json' };
import type { ContentCampaignArtifact } from '../../../contracts/flow/content-campaign-artifact.generated.js';

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
const validateContentCatalogItemCreate = ajv.compile<ContentCatalogItemCreateRequest>(contentCatalogItemCreateSchema);
const validateContentCatalogItemRevision = ajv.compile<ContentCatalogItemRevisionRequest>(contentCatalogItemRevisionSchema);
const validateContentCatalogItemEnvelope = ajv.compile<ContentCatalogItemArtifact>(contentCatalogItemArtifactSchema);
const validateContentPromptCreate = ajv.compile<ContentPromptCreateRequest>(contentPromptCreateSchema);
const validateContentPromptRevision = ajv.compile<ContentPromptRevisionRequest>(contentPromptRevisionSchema);
const validateContentPromptLifecycle = ajv.compile<ContentPromptLifecycleRequest>(contentPromptLifecycleSchema);
const validateContentPromptEnvelope = ajv.compile<ContentPromptArtifact>(contentPromptArtifactSchema);
const validateContentCampaignCreate = ajv.compile<ContentCampaignCreateRequest>(contentCampaignCreateSchema);
const validateContentCampaignRevision = ajv.compile<ContentCampaignRevisionRequest>(contentCampaignRevisionSchema);
const validateContentCampaignLifecycle = ajv.compile<ContentCampaignLifecycleRequest>(contentCampaignLifecycleSchema);
const validateContentCampaignEnvelope = ajv.compile<ContentCampaignArtifact>(contentCampaignArtifactSchema);

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

export function validateContentCatalogItemCreateRequest(value: unknown): ContentCatalogItemCreateRequest {
  if (!validateContentCatalogItemCreate(value)) throw new FlowValidationError(ajv.errorsText(validateContentCatalogItemCreate.errors, { separator: '; ' }));
  assertCatalogItemUnique(value.item);
  return value;
}

export function validateContentCatalogItemRevisionRequest(value: unknown): ContentCatalogItemRevisionRequest {
  if (!validateContentCatalogItemRevision(value)) throw new FlowValidationError(ajv.errorsText(validateContentCatalogItemRevision.errors, { separator: '; ' }));
  assertCatalogItemUnique(value.item);
  return value;
}

export function validateContentCatalogItemArtifact(value: unknown): ContentCatalogItemArtifact {
  if (!validateContentCatalogItemEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateContentCatalogItemEnvelope.errors, { separator: '; ' }));
  assertCatalogItemUnique(value.item);
  return value;
}

/** Text prompt types recommend a text model; Poster recommends an image model (Task 047 §4). */
export const CONTENT_PROMPT_IMAGE_MODELS: readonly ContentPromptModel[] = ['gpt-image-2', 'gemini-3.1-flash-image'];

export function assertContentPromptContent(type: ContentPromptType, prompt: ContentPromptContent): void {
  if ((type === 'POSTER') !== CONTENT_PROMPT_IMAGE_MODELS.includes(prompt.recommendedModel)) throw new FlowValidationError(`Model ${prompt.recommendedModel} does not suit ${type} prompts`);
  if (new Set(prompt.tags).size !== prompt.tags.length) throw new FlowValidationError('Prompt tags must be unique');
}

export function validateContentPromptCreateRequest(value: unknown): ContentPromptCreateRequest {
  if (!validateContentPromptCreate(value)) throw new FlowValidationError(ajv.errorsText(validateContentPromptCreate.errors, { separator: '; ' }));
  assertContentPromptContent(value.promptType, value.prompt);
  if (value.duplicatedFrom && (value.duplicatedFrom.kind === 'SYSTEM') !== value.duplicatedFrom.id.startsWith('system-')) throw new FlowValidationError('Prompt lineage kind does not match its ID');
  return value;
}

export function validateContentPromptRevisionRequest(value: unknown): ContentPromptRevisionRequest {
  if (!validateContentPromptRevision(value)) throw new FlowValidationError(ajv.errorsText(validateContentPromptRevision.errors, { separator: '; ' }));
  return value;
}

export function validateContentPromptLifecycleRequest(value: unknown): ContentPromptLifecycleRequest {
  if (!validateContentPromptLifecycle(value)) throw new FlowValidationError(ajv.errorsText(validateContentPromptLifecycle.errors, { separator: '; ' }));
  return value;
}

export function validateContentPromptArtifact(value: unknown): ContentPromptArtifact {
  if (!validateContentPromptEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateContentPromptEnvelope.errors, { separator: '; ' }));
  assertContentPromptContent(value.promptType, value.prompt);
  if (value.duplicatedFrom && value.version !== 1) throw new FlowValidationError('Only version 1 records prompt lineage');
  return value;
}

/** A campaign names each catalog item once; tier keys are already unique per item by schema. */
export function assertContentCampaignContent(campaign: ContentCampaignContent): void {
  const itemIds = campaign.items.map((item) => item.itemId);
  if (new Set(itemIds).size !== itemIds.length) throw new FlowValidationError('Campaign items must be unique');
}

export function validateContentCampaignCreateRequest(value: unknown): ContentCampaignCreateRequest {
  if (!validateContentCampaignCreate(value)) throw new FlowValidationError(ajv.errorsText(validateContentCampaignCreate.errors, { separator: '; ' }));
  assertContentCampaignContent(value.campaign);
  return value;
}

export function validateContentCampaignRevisionRequest(value: unknown): ContentCampaignRevisionRequest {
  if (!validateContentCampaignRevision(value)) throw new FlowValidationError(ajv.errorsText(validateContentCampaignRevision.errors, { separator: '; ' }));
  assertContentCampaignContent(value.campaign);
  return value;
}

export function validateContentCampaignLifecycleRequest(value: unknown): ContentCampaignLifecycleRequest {
  if (!validateContentCampaignLifecycle(value)) throw new FlowValidationError(ajv.errorsText(validateContentCampaignLifecycle.errors, { separator: '; ' }));
  return value;
}

export function validateContentCampaignArtifact(value: unknown): ContentCampaignArtifact {
  if (!validateContentCampaignEnvelope(value)) throw new FlowValidationError(ajv.errorsText(validateContentCampaignEnvelope.errors, { separator: '; ' }));
  assertContentCampaignContent(value.campaign);
  return value;
}

function assertCatalogItemUnique(item: ContentCatalogItemContent): void {
  if (new Set(item.tiers.map((tier) => tier.tierKey)).size !== item.tiers.length) throw new FlowValidationError('Catalog tier keys must be unique');
  if (new Set(item.photos.map((photo) => photo.mediaSha256)).size !== item.photos.length) throw new FlowValidationError('Catalog photos must be unique');
}
