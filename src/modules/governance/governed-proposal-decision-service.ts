import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { GovernedProposalDecision } from '../../../contracts/governance/governed-proposal-decision.generated.js';
import type { GovernedProposalReviewRequest } from '../../../contracts/governance/governed-proposal-review-request.generated.js';
import type { AnalysisBackedProposalReader, VerifiedAnalysisBackedProposal } from '../orchestrator/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import {
  GovernanceValidationError,
  validateGovernedProposalDecision,
  validateGovernedProposalReviewRequest,
} from './validation.js';

export const PROPOSAL_REVIEW_CAPABILITY = 'governance:proposal-review' as const;
export const PROPOSAL_REVIEW_POLICY_ID = 'governance:proposal-review-v1' as const;

export interface TrustedProposalReviewActorContext {
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly capabilities: ReadonlySet<string>;
}

interface ValidatedActorSnapshot {
  readonly actorId: string;
  readonly roleSnapshot: string;
}

export interface GovernedProposalReviewConfiguration {
  readonly policyId: typeof PROPOSAL_REVIEW_POLICY_ID;
  readonly policyVersion: number;
  readonly requiredCapability: typeof PROPOSAL_REVIEW_CAPABILITY;
}

export interface GovernedProposalDecisionExecution {
  readonly decisionId: string;
  readonly decisionArtifactSha256: string;
  readonly resultState: GovernedProposalDecision['resultState'];
  readonly deduplicated: boolean;
}

export type EffectiveGovernedProposalDecision =
  | { readonly proposalId: string; readonly effectiveState: 'PROPOSED' }
  | {
      readonly proposalId: string;
      readonly effectiveState: GovernedProposalDecision['resultState'];
      readonly decision: GovernedProposalDecision;
    };

interface ExistingDecision extends GovernedProposalDecisionExecution {
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly requiredCapability: string;
  readonly policyId: string;
  readonly policyVersion: bigint;
  readonly requestSha256: string;
}

interface DecisionRow {
  readonly proposalId: string;
  readonly decisionVersion: bigint;
  readonly action: string;
  readonly previousState: string;
  readonly resultState: string;
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly requiredCapability: string;
  readonly policyId: string;
  readonly policyVersion: bigint;
  readonly requestSha256: string;
  readonly decisionArtifactSha256: string;
  readonly createdAt: string;
  readonly artifactByteSize: bigint | null;
  readonly artifactMediaType: string | null;
  readonly artifactRelativePath: string | null;
  readonly artifactContractVersion: string | null;
}

type PreviousState = GovernedProposalDecision['previousState'];
type Action = GovernedProposalDecision['action'];
type ResultState = GovernedProposalDecision['resultState'];

const transitions: Readonly<Record<PreviousState, Partial<Record<Action, ResultState>>>> = Object.freeze({
  PROPOSED: Object.freeze({ APPROVE: 'APPROVED', REJECT: 'REJECTED', HOLD: 'HOLD' }),
  HOLD: Object.freeze({ APPROVE: 'APPROVED', REJECT: 'REJECTED' }),
});

export class GovernedProposalDecisionIdentityConflictError extends Error {}

export class GovernedProposalDecisionService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #proposals: AnalysisBackedProposalReader;
  readonly #config: GovernedProposalReviewConfiguration;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly proposalReader: AnalysisBackedProposalReader;
    readonly configuration: GovernedProposalReviewConfiguration;
    readonly now?: () => Date;
  }) {
    assertConfiguration(options.configuration);
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#proposals = options.proposalReader;
    this.#config = Object.freeze({ ...options.configuration });
    this.#now = options.now ?? (() => new Date());
  }

  async decide(untrustedInput: unknown, actorContext: TrustedProposalReviewActorContext): Promise<GovernedProposalDecisionExecution> {
    const validatedInput = validateGovernedProposalReviewRequest(untrustedInput);
    const input: GovernedProposalReviewRequest = Object.freeze({ ...validatedInput });
    const actor = validateActorContext(actorContext);
    const verifiedProposal = await this.#verifiedProposal(input.proposalId);
    const requestSha256 = this.#requestSha256(
      input,
      verifiedProposal.proposalArtifactSha256,
      actor,
      this.#config.requiredCapability,
      this.#config.policyId,
      this.#config.policyVersion,
    );
    const existing = this.#existing(input.proposalId, input.decisionVersion);
    if (existing) {
      if (existing.actorId !== actor.actorId || existing.roleSnapshot !== actor.roleSnapshot ||
          existing.requiredCapability !== this.#config.requiredCapability ||
          existing.policyId !== this.#config.policyId || existing.policyVersion !== BigInt(this.#config.policyVersion) ||
          existing.requestSha256 !== requestSha256) {
        throw new GovernedProposalDecisionIdentityConflictError('Decision proposal/version exists with changed request, proposal, actor, or policy identity');
      }
      const replayed = await this.replay(existing.decisionId);
      return {
        decisionId: replayed.decisionId,
        decisionArtifactSha256: existing.decisionArtifactSha256,
        resultState: replayed.resultState,
        deduplicated: true,
      };
    }

    const previousState = await this.#assertNextTransition(input);
    const resultState = transition(previousState, input.action);
    const decisionId = randomUUID();
    const createdAt = this.#now().toISOString();
    const envelope: GovernedProposalDecision = {
      contractVersion: '1.0.0',
      decisionId,
      createdAt,
      proposal: {
        proposalId: verifiedProposal.proposalId,
        proposalArtifactSha256: verifiedProposal.proposalArtifactSha256,
      },
      decisionVersion: input.decisionVersion,
      previousState,
      resultState,
      action: input.action,
      rationale: input.rationale,
      actor: { actorId: actor.actorId, roleSnapshot: actor.roleSnapshot },
      requiredCapability: this.#config.requiredCapability,
      policy: { policyId: this.#config.policyId, policyVersion: this.#config.policyVersion },
      requestSha256,
    };
    validateGovernedProposalDecision(envelope);
    const stored = await this.#artifacts.put(Buffer.from(canonicalJson(envelope), 'utf8'));

    const transaction = this.#db.transaction((): GovernedProposalDecisionExecution => {
      const concurrent = this.#existing(input.proposalId, input.decisionVersion);
      if (concurrent) {
        if (concurrent.actorId !== actor.actorId || concurrent.roleSnapshot !== actor.roleSnapshot ||
            concurrent.requiredCapability !== this.#config.requiredCapability ||
            concurrent.policyId !== this.#config.policyId || concurrent.policyVersion !== BigInt(this.#config.policyVersion) ||
            concurrent.requestSha256 !== requestSha256) {
          throw new GovernedProposalDecisionIdentityConflictError('Decision proposal/version was concurrently created with changed identity');
        }
        return {
          decisionId: concurrent.decisionId,
          decisionArtifactSha256: concurrent.decisionArtifactSha256,
          resultState: concurrent.resultState,
          deduplicated: true,
        };
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
        throw new GovernedProposalDecisionIdentityConflictError('Decision artifact metadata conflict');
      }
      this.#db.prepare(
        `INSERT INTO governance_proposal_decisions(
           decision_id, proposal_id, decision_version, action, previous_state, result_state,
           actor_id, role_snapshot, required_capability, policy_id, policy_version,
           request_sha256, decision_artifact_sha256, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        decisionId, input.proposalId, input.decisionVersion, input.action, previousState, resultState,
        actor.actorId, actor.roleSnapshot, this.#config.requiredCapability, this.#config.policyId,
        this.#config.policyVersion, requestSha256, stored.sha256, createdAt,
      );
      return { decisionId, decisionArtifactSha256: stored.sha256, resultState, deduplicated: false };
    });
    const execution = transaction();
    if (!execution.deduplicated) return execution;
    const replayed = await this.replay(execution.decisionId);
    return {
      decisionId: replayed.decisionId,
      decisionArtifactSha256: execution.decisionArtifactSha256,
      resultState: replayed.resultState,
      deduplicated: true,
    };
  }

  async replay(decisionId: string): Promise<GovernedProposalDecision> {
    if (!isUuid(decisionId)) throw new GovernanceValidationError('decisionId must be a UUID');
    const row = this.#db.prepare(
      `SELECT d.proposal_id AS proposalId, d.decision_version AS decisionVersion,
              d.action AS action, d.previous_state AS previousState, d.result_state AS resultState,
              d.actor_id AS actorId, d.role_snapshot AS roleSnapshot,
              d.required_capability AS requiredCapability, d.policy_id AS policyId,
              d.policy_version AS policyVersion, d.request_sha256 AS requestSha256,
              d.decision_artifact_sha256 AS decisionArtifactSha256, d.created_at AS createdAt,
              a.byte_size AS artifactByteSize, a.media_type AS artifactMediaType,
              a.relative_path AS artifactRelativePath, a.contract_version AS artifactContractVersion
         FROM governance_proposal_decisions d
         LEFT JOIN artifact_manifests a ON a.sha256 = d.decision_artifact_sha256
        WHERE d.decision_id = ?`,
    ).get(decisionId) as DecisionRow | undefined;
    if (!row) throw new GovernanceValidationError(`Decision not found: ${decisionId}`);
    const bytes = await this.#artifacts.read(row.decisionArtifactSha256);
    if (row.artifactByteSize !== BigInt(bytes.byteLength) || row.artifactMediaType !== 'application/json' ||
        row.artifactRelativePath !== expectedPath(row.decisionArtifactSha256) || row.artifactContractVersion !== '1.0.0') {
      throw new GovernedProposalDecisionIdentityConflictError('Decision artifact manifest metadata mismatch');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch (error) {
      throw new GovernanceValidationError(`Invalid decision JSON: ${(error as Error).message}`);
    }
    const envelope = validateGovernedProposalDecision(parsed);
    if (!bytes.equals(Buffer.from(canonicalJson(envelope), 'utf8'))) {
      throw new GovernanceValidationError('Decision is not canonical JSON');
    }
    const verifiedProposal = await this.#verifiedProposal(row.proposalId);
    const previousState = await this.#replayPreviousState(row.proposalId, Number(row.decisionVersion));
    const expectedResult = transition(previousState, envelope.action);
    const request = requestFromEnvelope(envelope);
    const expectedRequestSha256 = this.#requestSha256(
      request,
      verifiedProposal.proposalArtifactSha256,
      { actorId: envelope.actor.actorId, roleSnapshot: envelope.actor.roleSnapshot },
      envelope.requiredCapability,
      envelope.policy.policyId,
      envelope.policy.policyVersion,
    );
    if (envelope.decisionId !== decisionId || envelope.createdAt !== row.createdAt ||
        envelope.proposal.proposalId !== row.proposalId || verifiedProposal.proposalId !== row.proposalId ||
        envelope.proposal.proposalArtifactSha256 !== verifiedProposal.proposalArtifactSha256 ||
        BigInt(envelope.decisionVersion) !== row.decisionVersion || envelope.previousState !== row.previousState ||
        envelope.previousState !== previousState || envelope.resultState !== row.resultState ||
        envelope.resultState !== expectedResult || envelope.action !== row.action ||
        envelope.actor.actorId !== row.actorId || envelope.actor.roleSnapshot !== row.roleSnapshot ||
        envelope.requiredCapability !== row.requiredCapability || row.requiredCapability !== PROPOSAL_REVIEW_CAPABILITY ||
        envelope.policy.policyId !== row.policyId || row.policyId !== PROPOSAL_REVIEW_POLICY_ID ||
        BigInt(envelope.policy.policyVersion) !== row.policyVersion ||
        envelope.requestSha256 !== row.requestSha256 || expectedRequestSha256 !== row.requestSha256) {
      throw new GovernedProposalDecisionIdentityConflictError('Decision artifact does not match immutable metadata or verified chain');
    }
    return envelope;
  }

  async readEffectiveDecision(proposalId: string): Promise<EffectiveGovernedProposalDecision> {
    const verifiedProposal = await this.#verifiedProposal(proposalId);
    const latest = this.#db.prepare(
      `SELECT decision_id AS decisionId FROM governance_proposal_decisions
        WHERE proposal_id = ? ORDER BY decision_version DESC LIMIT 1`,
    ).get(proposalId) as { decisionId: string } | undefined;
    if (!latest) return { proposalId: verifiedProposal.proposalId, effectiveState: 'PROPOSED' };
    const decision = await this.replay(latest.decisionId);
    return { proposalId: verifiedProposal.proposalId, effectiveState: decision.resultState, decision };
  }

  #existing(proposalId: string, decisionVersion: number): ExistingDecision | undefined {
    return this.#db.prepare(
      `SELECT decision_id AS decisionId, decision_artifact_sha256 AS decisionArtifactSha256,
              result_state AS resultState, actor_id AS actorId, role_snapshot AS roleSnapshot,
              required_capability AS requiredCapability, policy_id AS policyId,
              policy_version AS policyVersion, request_sha256 AS requestSha256, 0 AS deduplicated
         FROM governance_proposal_decisions
        WHERE proposal_id = ? AND decision_version = ?`,
    ).get(proposalId, decisionVersion) as ExistingDecision | undefined;
  }

  async #assertNextTransition(input: GovernedProposalReviewRequest): Promise<PreviousState> {
    const latest = this.#db.prepare(
      `SELECT decision_id AS decisionId, decision_version AS decisionVersion
         FROM governance_proposal_decisions WHERE proposal_id = ?
        ORDER BY decision_version DESC LIMIT 1`,
    ).get(input.proposalId) as { decisionId: string; decisionVersion: bigint } | undefined;
    if (!latest) {
      if (input.decisionVersion !== 1 || input.expectedPreviousState !== 'PROPOSED') {
        throw new GovernanceValidationError('First decision requires version 1 and expectedPreviousState PROPOSED');
      }
      return 'PROPOSED';
    }
    if (input.decisionVersion !== Number(latest.decisionVersion) + 1) {
      throw new GovernanceValidationError(`Decision version ${input.decisionVersion} is stale or skips the next version`);
    }
    const prior = await this.replay(latest.decisionId);
    if (prior.resultState !== 'HOLD' || input.expectedPreviousState !== prior.resultState) {
      throw new GovernanceValidationError('A later decision requires a verified HOLD predecessor and matching expected state');
    }
    return 'HOLD';
  }

  async #replayPreviousState(proposalId: string, decisionVersion: number): Promise<PreviousState> {
    if (decisionVersion === 1) return 'PROPOSED';
    const prior = this.#db.prepare(
      `SELECT decision_id AS decisionId FROM governance_proposal_decisions
        WHERE proposal_id = ? AND decision_version = ?`,
    ).get(proposalId, decisionVersion - 1) as { decisionId: string } | undefined;
    if (!prior) throw new GovernedProposalDecisionIdentityConflictError('Decision chain predecessor is missing');
    const replayed = await this.replay(prior.decisionId);
    if (replayed.resultState !== 'HOLD') {
      throw new GovernedProposalDecisionIdentityConflictError('Decision chain predecessor is not HOLD');
    }
    return 'HOLD';
  }

  async #verifiedProposal(proposalId: string): Promise<VerifiedAnalysisBackedProposal> {
    const verified = await this.#proposals.readVerifiedProposal(proposalId);
    if (verified.proposalId !== proposalId || verified.proposal.proposalId !== proposalId ||
        verified.proposal.state !== 'PROPOSED' ||
        verified.proposalArtifactSha256 !== sha256(Buffer.from(canonicalJson(verified.proposal), 'utf8'))) {
      throw new GovernedProposalDecisionIdentityConflictError('Verified proposal identity or artifact digest mismatch');
    }
    return verified;
  }

  #requestSha256(
    input: GovernedProposalReviewRequest,
    proposalArtifactSha256: string,
    actor: ValidatedActorSnapshot,
    requiredCapability: typeof PROPOSAL_REVIEW_CAPABILITY,
    policyId: typeof PROPOSAL_REVIEW_POLICY_ID,
    policyVersion: number,
  ): string {
    return sha256(Buffer.from(canonicalJson({
      request: input,
      proposalArtifactSha256,
      actor: { actorId: actor.actorId, roleSnapshot: actor.roleSnapshot },
      requiredCapability,
      policy: { policyId, policyVersion },
    }), 'utf8'));
  }
}

function requestFromEnvelope(envelope: GovernedProposalDecision): GovernedProposalReviewRequest {
  return {
    contractVersion: envelope.contractVersion,
    proposalId: envelope.proposal.proposalId,
    decisionVersion: envelope.decisionVersion,
    action: envelope.action,
    rationale: envelope.rationale,
    expectedPreviousState: envelope.previousState,
  };
}

function validateActorContext(actor: TrustedProposalReviewActorContext): ValidatedActorSnapshot {
  if (!actor || typeof actor !== 'object') throw new GovernanceValidationError('Trusted actor context is required');
  if (!/^[a-z][a-z0-9:_-]{2,119}$/.test(actor.actorId)) throw new GovernanceValidationError('Invalid trusted actor ID');
  if (actor.roleSnapshot.length < 1 || actor.roleSnapshot.length > 120 || actor.roleSnapshot.trim() !== actor.roleSnapshot) {
    throw new GovernanceValidationError('Invalid trusted actor role snapshot');
  }
  if (!(actor.capabilities instanceof Set)) throw new GovernanceValidationError('Trusted actor capabilities must be an application-verified Set');
  for (const capability of actor.capabilities) {
    if (typeof capability !== 'string' || capability.length < 1 || capability.length > 120) {
      throw new GovernanceValidationError('Invalid trusted actor capability');
    }
  }
  if (!actor.capabilities.has(PROPOSAL_REVIEW_CAPABILITY)) {
    throw new GovernanceValidationError(`Trusted actor lacks ${PROPOSAL_REVIEW_CAPABILITY}`);
  }
  return Object.freeze({ actorId: actor.actorId, roleSnapshot: actor.roleSnapshot });
}

function assertConfiguration(config: GovernedProposalReviewConfiguration): void {
  if (config.policyId !== PROPOSAL_REVIEW_POLICY_ID) throw new TypeError('Invalid proposal review policy ID');
  if (config.requiredCapability !== PROPOSAL_REVIEW_CAPABILITY) throw new TypeError('Invalid proposal review capability');
  if (!Number.isSafeInteger(config.policyVersion) || config.policyVersion < 1) throw new TypeError('Invalid proposal review policy version');
}

function transition(previousState: PreviousState, action: Action): ResultState {
  const result = transitions[previousState][action];
  if (!result) throw new GovernanceValidationError(`Transition ${previousState} -> ${action} is not allowed`);
  return result;
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
