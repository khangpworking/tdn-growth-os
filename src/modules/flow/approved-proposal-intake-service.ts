import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ApprovedProposalIntakeRequest } from '../../../contracts/flow/approved-proposal-intake-request.generated.js';
import type { AuthorizedPlan } from '../../../contracts/flow/authorized-plan.generated.js';
import type { GovernedProposalDecision } from '../../../contracts/governance/governed-proposal-decision.generated.js';
import type { GovernedProposalDecisionReader } from '../governance/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import {
  FlowValidationError,
  validateApprovedProposalIntakeRequest,
  validateAuthorizedPlan,
  validateSourceDecision,
} from './validation.js';

export interface ApprovedProposalIntakeConfiguration {
  readonly producerId: string;
  readonly producerVersion: number;
}

export interface ApprovedProposalIntakeExecution {
  readonly planId: string;
  readonly planArtifactSha256: string;
  readonly state: 'AUTHORIZED_PLAN';
  readonly deduplicated: boolean;
}

interface VerifiedApproval {
  readonly decision: GovernedProposalDecision;
  readonly decisionArtifactSha256: string;
}

interface ExistingPlan extends ApprovedProposalIntakeExecution {
  readonly planKey: string;
  readonly sourceProposalId: string;
  readonly sourceProposalArtifactSha256: string;
  readonly approvedDecisionId: string;
  readonly approvedDecisionArtifactSha256: string;
  readonly producerId: string;
  readonly producerVersion: bigint;
  readonly requestSha256: string;
}

interface PlanRow {
  readonly planKey: string;
  readonly planType: string;
  readonly state: string;
  readonly sourceProposalId: string;
  readonly sourceProposalArtifactSha256: string;
  readonly approvedDecisionId: string;
  readonly approvedDecisionArtifactSha256: string;
  readonly approvedDecisionVersion: bigint;
  readonly authorizationActorId: string;
  readonly authorizationRoleSnapshot: string;
  readonly authorizationPolicyId: string;
  readonly authorizationPolicyVersion: bigint;
  readonly approvalTimestamp: string;
  readonly producerId: string;
  readonly producerVersion: bigint;
  readonly requestSha256: string;
  readonly planArtifactSha256: string;
  readonly createdAt: string;
  readonly artifactByteSize: bigint | null;
  readonly artifactMediaType: string | null;
  readonly artifactRelativePath: string | null;
  readonly artifactContractVersion: string | null;
}

export class ApprovedProposalIntakeIdentityConflictError extends Error {}

export class ApprovedProposalIntakeService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #decisions: GovernedProposalDecisionReader;
  readonly #config: ApprovedProposalIntakeConfiguration;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly decisionReader: GovernedProposalDecisionReader;
    readonly configuration: ApprovedProposalIntakeConfiguration;
    readonly now?: () => Date;
  }) {
    assertConfiguration(options.configuration);
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#decisions = options.decisionReader;
    this.#config = Object.freeze({ ...options.configuration });
    this.#now = options.now ?? (() => new Date());
  }

  async intake(untrustedInput: unknown): Promise<ApprovedProposalIntakeExecution> {
    const validatedInput = validateApprovedProposalIntakeRequest(untrustedInput);
    const input: ApprovedProposalIntakeRequest = Object.freeze({ ...validatedInput });
    const approval = await this.#verifiedApproval(input.sourceProposalId, input.approvedDecisionId);
    const requestSha256 = this.#requestSha256(input);
    const byKey = this.#existingByKey(input.planKey);
    const byDecision = this.#existingByDecision(input.approvedDecisionId);
    if (byKey || byDecision) return this.#deduplicateOrConflict(input, approval, requestSha256, byKey, byDecision);

    const planId = randomUUID();
    const createdAt = this.#now().toISOString();
    const envelope = buildEnvelope(planId, createdAt, input, approval, this.#config, requestSha256);
    validateAuthorizedPlan(envelope);
    const stored = await this.#artifacts.put(Buffer.from(canonicalJson(envelope), 'utf8'));

    const transaction = this.#db.transaction((): ApprovedProposalIntakeExecution => {
      const concurrentByKey = this.#existingByKey(input.planKey);
      const concurrentByDecision = this.#existingByDecision(input.approvedDecisionId);
      if (concurrentByKey || concurrentByDecision) {
        return this.#assertExistingIdentity(input, approval, requestSha256, concurrentByKey, concurrentByDecision);
      }
      this.#db.prepare(
        `INSERT INTO artifact_manifests(
           sha256, byte_size, media_type, relative_path, acquired_at,
           contract_version, retention_status, created_at
         ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
         ON CONFLICT(sha256) DO NOTHING`,
      ).run(stored.sha256, stored.byteSize, stored.relativePath, createdAt, createdAt);
      const artifact = this.#db.prepare(
        `SELECT byte_size AS byteSize, media_type AS mediaType, relative_path AS relativePath,
                contract_version AS contractVersion FROM artifact_manifests WHERE sha256 = ?`,
      ).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
      if (artifact.byteSize !== BigInt(stored.byteSize) || artifact.mediaType !== 'application/json' ||
          artifact.relativePath !== stored.relativePath || artifact.contractVersion !== '1.0.0') {
        throw new ApprovedProposalIntakeIdentityConflictError('Plan artifact metadata conflict');
      }
      this.#db.prepare(
        `INSERT INTO flow_authorized_plans(
           plan_id, plan_key, plan_type, state, source_proposal_id, source_proposal_artifact_sha256,
           approved_decision_id, approved_decision_artifact_sha256, approved_decision_version,
           authorization_actor_id, authorization_role_snapshot, authorization_policy_id,
           authorization_policy_version, approval_timestamp, producer_id, producer_version,
           request_sha256, plan_artifact_sha256, created_at
         ) VALUES (?, ?, 'approved_proposal_intake_v1', 'AUTHORIZED_PLAN', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        planId, input.planKey, input.sourceProposalId, approval.decision.proposal.proposalArtifactSha256,
        input.approvedDecisionId, approval.decisionArtifactSha256, approval.decision.decisionVersion,
        approval.decision.actor.actorId, approval.decision.actor.roleSnapshot, approval.decision.policy.policyId,
        approval.decision.policy.policyVersion, approval.decision.createdAt, this.#config.producerId,
        this.#config.producerVersion, requestSha256, stored.sha256, createdAt,
      );
      return { planId, planArtifactSha256: stored.sha256, state: 'AUTHORIZED_PLAN', deduplicated: false };
    });
    const execution = transaction();
    if (!execution.deduplicated) return execution;
    const replayed = await this.replay(execution.planId);
    return { planId: replayed.planId, planArtifactSha256: execution.planArtifactSha256, state: replayed.state, deduplicated: true };
  }

  async replay(planId: string): Promise<AuthorizedPlan> {
    if (!isUuid(planId)) throw new FlowValidationError('planId must be a UUID');
    const row = this.#db.prepare(
      `SELECT p.plan_key AS planKey, p.plan_type AS planType, p.state AS state,
              p.source_proposal_id AS sourceProposalId,
              p.source_proposal_artifact_sha256 AS sourceProposalArtifactSha256,
              p.approved_decision_id AS approvedDecisionId,
              p.approved_decision_artifact_sha256 AS approvedDecisionArtifactSha256,
              p.approved_decision_version AS approvedDecisionVersion,
              p.authorization_actor_id AS authorizationActorId,
              p.authorization_role_snapshot AS authorizationRoleSnapshot,
              p.authorization_policy_id AS authorizationPolicyId,
              p.authorization_policy_version AS authorizationPolicyVersion,
              p.approval_timestamp AS approvalTimestamp, p.producer_id AS producerId,
              p.producer_version AS producerVersion, p.request_sha256 AS requestSha256,
              p.plan_artifact_sha256 AS planArtifactSha256, p.created_at AS createdAt,
              a.byte_size AS artifactByteSize, a.media_type AS artifactMediaType,
              a.relative_path AS artifactRelativePath, a.contract_version AS artifactContractVersion
         FROM flow_authorized_plans p
         LEFT JOIN artifact_manifests a ON a.sha256 = p.plan_artifact_sha256
        WHERE p.plan_id = ?`,
    ).get(planId) as PlanRow | undefined;
    if (!row) throw new FlowValidationError(`Authorized plan not found: ${planId}`);
    const bytes = await this.#artifacts.read(row.planArtifactSha256);
    if (row.artifactByteSize !== BigInt(bytes.byteLength) || row.artifactMediaType !== 'application/json' ||
        row.artifactRelativePath !== expectedPath(row.planArtifactSha256) || row.artifactContractVersion !== '1.0.0') {
      throw new ApprovedProposalIntakeIdentityConflictError('Plan artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new FlowValidationError(`Invalid authorized plan JSON: ${(error as Error).message}`);
    }
    const envelope = validateAuthorizedPlan(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(envelope), 'utf8'))) throw new FlowValidationError('Authorized plan is not canonical JSON');
    const approval = await this.#verifiedApproval(row.sourceProposalId, row.approvedDecisionId);
    const request = requestFromEnvelope(envelope);
    const expectedRequestSha256 = this.#requestSha256(request);
    if (envelope.planId !== planId || envelope.planKey !== row.planKey || envelope.planType !== row.planType ||
        envelope.state !== row.state || envelope.state !== 'AUTHORIZED_PLAN' || envelope.createdAt !== row.createdAt ||
        envelope.sourceProposal.proposalId !== row.sourceProposalId ||
        envelope.sourceProposal.proposalArtifactSha256 !== row.sourceProposalArtifactSha256 ||
        envelope.sourceProposal.proposalArtifactSha256 !== approval.decision.proposal.proposalArtifactSha256 ||
        envelope.authorization.decisionId !== row.approvedDecisionId ||
        envelope.authorization.decisionArtifactSha256 !== row.approvedDecisionArtifactSha256 ||
        envelope.authorization.decisionArtifactSha256 !== approval.decisionArtifactSha256 ||
        BigInt(envelope.authorization.decisionVersion) !== row.approvedDecisionVersion ||
        envelope.authorization.decisionVersion !== approval.decision.decisionVersion ||
        envelope.authorization.actor.actorId !== row.authorizationActorId ||
        envelope.authorization.actor.actorId !== approval.decision.actor.actorId ||
        envelope.authorization.actor.roleSnapshot !== row.authorizationRoleSnapshot ||
        envelope.authorization.actor.roleSnapshot !== approval.decision.actor.roleSnapshot ||
        envelope.authorization.policy.policyId !== row.authorizationPolicyId ||
        envelope.authorization.policy.policyId !== approval.decision.policy.policyId ||
        BigInt(envelope.authorization.policy.policyVersion) !== row.authorizationPolicyVersion ||
        envelope.authorization.policy.policyVersion !== approval.decision.policy.policyVersion ||
        envelope.authorization.approvedAt !== row.approvalTimestamp ||
        envelope.authorization.approvedAt !== approval.decision.createdAt ||
        envelope.producer.producerId !== row.producerId || envelope.producer.producerId !== this.#config.producerId ||
        BigInt(envelope.producer.producerVersion) !== row.producerVersion ||
        envelope.producer.producerVersion !== this.#config.producerVersion ||
        envelope.requestedNextStep !== 'define_manual_tasks' || envelope.requestSha256 !== row.requestSha256 ||
        expectedRequestSha256 !== row.requestSha256) {
      throw new ApprovedProposalIntakeIdentityConflictError('Authorized plan does not match immutable metadata or current verified approval');
    }
    return envelope;
  }

  #deduplicateOrConflict(
    input: ApprovedProposalIntakeRequest,
    approval: VerifiedApproval,
    requestSha256: string,
    byKey: ExistingPlan | undefined,
    byDecision: ExistingPlan | undefined,
  ): Promise<ApprovedProposalIntakeExecution> {
    const existing = this.#assertExistingIdentity(input, approval, requestSha256, byKey, byDecision);
    return this.replay(existing.planId).then((plan) => ({
      planId: plan.planId, planArtifactSha256: existing.planArtifactSha256, state: plan.state, deduplicated: true,
    }));
  }

  #assertExistingIdentity(
    input: ApprovedProposalIntakeRequest,
    approval: VerifiedApproval,
    requestSha256: string,
    byKey: ExistingPlan | undefined,
    byDecision: ExistingPlan | undefined,
  ): ApprovedProposalIntakeExecution {
    if (!byKey || !byDecision || byKey.planId !== byDecision.planId || byKey.planKey !== input.planKey ||
        byKey.sourceProposalId !== input.sourceProposalId ||
        byKey.sourceProposalArtifactSha256 !== approval.decision.proposal.proposalArtifactSha256 ||
        byKey.approvedDecisionId !== input.approvedDecisionId ||
        byKey.approvedDecisionArtifactSha256 !== approval.decisionArtifactSha256 ||
        byKey.producerId !== this.#config.producerId || byKey.producerVersion !== BigInt(this.#config.producerVersion) ||
        byKey.requestSha256 !== requestSha256) {
      throw new ApprovedProposalIntakeIdentityConflictError('Plan key or approved decision already exists with changed identity');
    }
    return { planId: byKey.planId, planArtifactSha256: byKey.planArtifactSha256, state: byKey.state, deduplicated: true };
  }

  #existingByKey(planKey: string): ExistingPlan | undefined {
    return this.#existing('plan_key', planKey);
  }

  #existingByDecision(decisionId: string): ExistingPlan | undefined {
    return this.#existing('approved_decision_id', decisionId);
  }

  #existing(column: 'plan_key' | 'approved_decision_id', value: string): ExistingPlan | undefined {
    return this.#db.prepare(
      `SELECT plan_id AS planId, plan_key AS planKey, source_proposal_id AS sourceProposalId,
              source_proposal_artifact_sha256 AS sourceProposalArtifactSha256,
              approved_decision_id AS approvedDecisionId,
              approved_decision_artifact_sha256 AS approvedDecisionArtifactSha256,
              producer_id AS producerId, producer_version AS producerVersion,
              request_sha256 AS requestSha256, plan_artifact_sha256 AS planArtifactSha256,
              state, 0 AS deduplicated
         FROM flow_authorized_plans WHERE ${column} = ?`,
    ).get(value) as ExistingPlan | undefined;
  }

  async #verifiedApproval(sourceProposalId: string, approvedDecisionId: string): Promise<VerifiedApproval> {
    const result: unknown = await this.#decisions.readEffectiveDecision(sourceProposalId);
    if (!result || typeof result !== 'object') throw new FlowValidationError('Malformed verified decision reader result');
    const record = result as Record<string, unknown>;
    if (record.proposalId !== sourceProposalId) throw new FlowValidationError('Verified decision reader returned the wrong proposal');
    if (record.effectiveState !== 'APPROVED' || !('decision' in record)) {
      throw new FlowValidationError('Exact current effective decision must be APPROVED');
    }
    const validatedDecision = validateSourceDecision(record.decision);
    if (Object.keys(record).sort().join(',') !== 'decision,effectiveState,proposalId') {
      throw new FlowValidationError('Malformed verified decision reader result');
    }
    const canonicalDecisionBytes = Buffer.from(canonicalJson(validatedDecision), 'utf8');
    const decision = validateSourceDecision(JSON.parse(canonicalDecisionBytes.toString('utf8')) as unknown);
    if (decision.decisionId !== approvedDecisionId) throw new FlowValidationError('Approved decision ID is not the exact current effective decision');
    if (decision.proposal.proposalId !== sourceProposalId || decision.resultState !== 'APPROVED' || decision.action !== 'APPROVE') {
      throw new FlowValidationError('Verified approval has mismatched proposal or state');
    }
    const decisionArtifactSha256 = sha256(canonicalDecisionBytes);
    return { decision, decisionArtifactSha256 };
  }

  #requestSha256(input: ApprovedProposalIntakeRequest): string {
    return sha256(Buffer.from(canonicalJson(input), 'utf8'));
  }
}

function buildEnvelope(
  planId: string,
  createdAt: string,
  input: ApprovedProposalIntakeRequest,
  approval: VerifiedApproval,
  config: ApprovedProposalIntakeConfiguration,
  requestSha256: string,
): AuthorizedPlan {
  return {
    contractVersion: '1.0.0', planId, planKey: input.planKey, planType: input.planType,
    state: 'AUTHORIZED_PLAN', createdAt,
    sourceProposal: {
      proposalId: approval.decision.proposal.proposalId,
      proposalArtifactSha256: approval.decision.proposal.proposalArtifactSha256,
    },
    authorization: {
      decisionId: approval.decision.decisionId,
      decisionArtifactSha256: approval.decisionArtifactSha256,
      decisionVersion: approval.decision.decisionVersion,
      actor: { ...approval.decision.actor }, policy: { ...approval.decision.policy }, approvedAt: approval.decision.createdAt,
    },
    producer: { ...config }, requestedNextStep: input.requestedNextStep, requestSha256,
  };
}

function requestFromEnvelope(envelope: AuthorizedPlan): ApprovedProposalIntakeRequest {
  return {
    contractVersion: envelope.contractVersion, planKey: envelope.planKey, planType: envelope.planType,
    sourceProposalId: envelope.sourceProposal.proposalId, approvedDecisionId: envelope.authorization.decisionId,
    requestedNextStep: envelope.requestedNextStep,
  };
}

function assertConfiguration(config: ApprovedProposalIntakeConfiguration): void {
  if (!/^flow:[a-z][a-z0-9_-]{2,114}$/.test(config.producerId)) throw new TypeError('Invalid Flow producer ID');
  if (!Number.isSafeInteger(config.producerVersion) || config.producerVersion < 1) throw new TypeError('Invalid Flow producer version');
}

function expectedPath(digest: string): string {
  return `sha256/${digest.slice(0, 2)}/${digest}`;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
