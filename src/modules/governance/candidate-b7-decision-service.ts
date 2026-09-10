import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { CandidateB7Decision } from '../../../contracts/governance/candidate-b7-decision.generated.js';
import type { CandidateB7DecisionRequest } from '../../../contracts/governance/candidate-b7-decision-request.generated.js';
import type { CandidateBasketArtifact } from '../../../contracts/flow/candidate-basket-artifact.generated.js';
import type { CandidateBasketReader } from '../flow/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { GovernanceValidationError, validateCandidateB7Decision, validateCandidateB7DecisionRequest } from './validation.js';

export const CANDIDATE_B7_DECISION_CAPABILITY = 'governance:candidate-b7-review' as const;
export const CANDIDATE_B7_DECISION_POLICY_ID = 'governance:candidate-b7-review-v1' as const;

export interface TrustedCandidateB7DecisionActorContext {
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly capabilities: ReadonlySet<string>;
}
export interface CandidateB7DecisionConfiguration {
  readonly policyId: typeof CANDIDATE_B7_DECISION_POLICY_ID;
  readonly policyVersion: 1;
  readonly requiredCapability: typeof CANDIDATE_B7_DECISION_CAPABILITY;
}
export interface CandidateB7DecisionExecution {
  readonly decisionId: string;
  readonly decisionArtifactSha256: string;
  readonly decision: CandidateB7Decision['decision'];
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}
export type EffectiveCandidateB7Decision =
  | { readonly basketId: string; readonly candidateId: string; readonly candidateVersion: number; readonly effectiveState: 'NO_DECISION' }
  | { readonly basketId: string; readonly candidateId: string; readonly candidateVersion: number; readonly effectiveState: CandidateB7Decision['decision']; readonly decision: CandidateB7Decision };
export class CandidateB7DecisionIdentityConflictError extends Error {}

type Row = {
  decisionId: string; basketId: string; candidateId: string; candidateVersion: bigint; decision: CandidateB7Decision['decision'];
  actorId: string; roleSnapshot: string; requiredCapability: string; policyId: string; policyVersion: bigint;
  requestSha256: string; artifactSha256: string; decidedAt: string;
};
type Actor = CandidateB7Decision['actor'];
type Member = CandidateBasketArtifact['candidates'][number];

export class CandidateB7DecisionService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #baskets: CandidateBasketReader;
  readonly #config: CandidateB7DecisionConfiguration;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: { readonly db: Database.Database; readonly artifactStore: ContentAddressedArtifactStore; readonly basketReader: CandidateBasketReader; readonly configuration: CandidateB7DecisionConfiguration; readonly now?: () => Date; readonly uuid?: () => string }) {
    assertConfiguration(options.configuration);
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#baskets = options.basketReader;
    this.#config = Object.freeze({ ...options.configuration });
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async decide(untrustedInput: unknown, actorContext: TrustedCandidateB7DecisionActorContext): Promise<CandidateB7DecisionExecution> {
    const input = snapshot(validateCandidateB7DecisionRequest(untrustedInput));
    const actor = actorSnapshot(actorContext, this.#config.requiredCapability);
    const { basket, member, basketArtifactSha256 } = await this.#verifiedSelection(input.basketId, input.candidateId, input.candidateVersion);
    const requestSha256 = this.#requestDigest(input, basketArtifactSha256, member, actor);
    const existing = this.#existing(input.basketId, input.candidateId, input.candidateVersion);
    if (existing) return this.#verifiedRetry(existing, requestSha256);

    const decisionId = this.#uuid();
    assertUuid(decisionId);
    const decidedAt = this.#now().toISOString();
    const envelope: CandidateB7Decision = {
      contractVersion: '1.0.0', decisionId, decidedAt,
      basket: { basketId: basket.basketId, basketArtifactSha256, workspaceId: basket.workspaceId, basketKey: basket.basketKey, basketVersion: basket.version },
      candidate: { candidateId: member.candidateId, candidateVersion: member.candidateVersion, candidateArtifactSha256: member.candidateArtifactSha256, candidateKey: member.candidateKey, label: member.label, ...(member.summary === undefined ? {} : { summary: member.summary }), state: 'EXPLORING' },
      decision: input.decision,
      actor,
      requiredCapability: this.#config.requiredCapability,
      policy: { policyId: this.#config.policyId, policyVersion: this.#config.policyVersion },
      requestSha256,
    };
    validateCandidateB7Decision(envelope);
    const stored = await this.#artifacts.put(bytes(envelope));
    const execute = this.#db.transaction((): CandidateB7DecisionExecution => {
      const concurrent = this.#existing(input.basketId, input.candidateId, input.candidateVersion);
      if (concurrent) return this.#retryResult(concurrent, requestSha256);
      let databaseMutations = this.#registerArtifact(stored, decidedAt);
      databaseMutations += this.#db.prepare(`INSERT INTO governance_candidate_b7_decisions(
        decision_id, basket_id, candidate_id, candidate_version, decision, actor_id, role_snapshot,
        required_capability, policy_id, policy_version, request_sha256, decision_artifact_sha256, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        decisionId, input.basketId, input.candidateId, input.candidateVersion, input.decision, actor.actorId, actor.roleSnapshot,
        this.#config.requiredCapability, this.#config.policyId, this.#config.policyVersion, requestSha256, stored.sha256, decidedAt,
      ).changes;
      return { decisionId, decisionArtifactSha256: stored.sha256, decision: input.decision, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.replay(result.decisionId);
    return result;
  }

  async replay(decisionId: string): Promise<CandidateB7Decision> {
    assertUuid(decisionId);
    const row = this.#byId(decisionId);
    if (!row) throw new GovernanceValidationError(`B7 decision not found: ${decisionId}`);
    const data = await this.#artifacts.read(row.artifactSha256);
    const manifest = this.#db.prepare('SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion FROM artifact_manifests WHERE sha256=?').get(row.artifactSha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' || manifest.relativePath !== expectedPath(row.artifactSha256) || manifest.contractVersion !== '1.0.0') throw new CandidateB7DecisionIdentityConflictError('Decision artifact manifest mismatch');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
    catch (error) { throw new GovernanceValidationError(`Invalid B7 decision JSON: ${(error as Error).message}`); }
    const envelope = validateCandidateB7Decision(parsed);
    if (!data.equals(bytes(envelope))) throw new GovernanceValidationError('B7 decision is not canonical JSON');
    const verified = await this.#verifiedSelection(row.basketId, row.candidateId, Number(row.candidateVersion));
    const request: CandidateB7DecisionRequest = { contractVersion: '1.0.0', basketId: row.basketId, candidateId: row.candidateId, candidateVersion: Number(row.candidateVersion), decision: envelope.decision };
    const expectedRequest = this.#requestDigest(request, verified.basketArtifactSha256, verified.member, envelope.actor);
    if (envelope.decisionId !== decisionId || envelope.decidedAt !== row.decidedAt ||
        envelope.basket.basketId !== verified.basket.basketId || envelope.basket.basketArtifactSha256 !== verified.basketArtifactSha256 || envelope.basket.workspaceId !== verified.basket.workspaceId || envelope.basket.basketKey !== verified.basket.basketKey || envelope.basket.basketVersion !== verified.basket.version ||
        envelope.candidate.candidateId !== verified.member.candidateId || envelope.candidate.candidateVersion !== verified.member.candidateVersion || envelope.candidate.candidateArtifactSha256 !== verified.member.candidateArtifactSha256 || envelope.candidate.candidateKey !== verified.member.candidateKey || envelope.candidate.label !== verified.member.label || (envelope.candidate.summary ?? null) !== (verified.member.summary ?? null) || envelope.candidate.state !== 'EXPLORING' ||
        envelope.decision !== row.decision || envelope.actor.actorId !== row.actorId || envelope.actor.roleSnapshot !== row.roleSnapshot || row.roleSnapshot !== 'OWNER' ||
        envelope.requiredCapability !== row.requiredCapability || row.requiredCapability !== CANDIDATE_B7_DECISION_CAPABILITY || envelope.policy.policyId !== row.policyId || row.policyId !== CANDIDATE_B7_DECISION_POLICY_ID || BigInt(envelope.policy.policyVersion) !== row.policyVersion || row.policyVersion !== 1n ||
        envelope.requestSha256 !== row.requestSha256 || expectedRequest !== row.requestSha256) throw new CandidateB7DecisionIdentityConflictError('B7 decision does not match immutable row, artifact, manifest, or verified input identity');
    return envelope;
  }

  async readEffectiveDecision(basketId: string, candidateId: string, candidateVersion: number): Promise<EffectiveCandidateB7Decision> {
    const verified = await this.#verifiedSelection(basketId, candidateId, candidateVersion);
    const row = this.#existing(verified.basket.basketId, verified.member.candidateId, verified.member.candidateVersion);
    if (!row) return { basketId, candidateId, candidateVersion, effectiveState: 'NO_DECISION' };
    const decision = await this.replay(row.decisionId);
    return { basketId, candidateId, candidateVersion, effectiveState: decision.decision, decision };
  }

  async #verifiedSelection(basketId: string, candidateId: string, candidateVersion: number): Promise<{ basket: CandidateBasketArtifact; member: Member; basketArtifactSha256: string }> {
    const basket = await this.#baskets.readVerifiedBasket(basketId);
    if (basket.basketId !== basketId) throw new CandidateB7DecisionIdentityConflictError('Verified basket reader returned the wrong basket');
    const member = basket.candidates.find((candidate) => candidate.candidateId === candidateId && candidate.candidateVersion === candidateVersion);
    if (!member) throw new GovernanceValidationError('Candidate decision requires exact membership in the verified basket');
    if (member.candidateId !== candidateId || member.candidateVersion !== candidateVersion || member.state !== 'EXPLORING' || !isDigest(member.candidateArtifactSha256)) throw new CandidateB7DecisionIdentityConflictError('Verified basket member identity, state, or digest is invalid');
    const basketArtifactSha256 = digest(basket);
    if (!isDigest(basketArtifactSha256)) throw new CandidateB7DecisionIdentityConflictError('Verified basket digest is invalid');
    return { basket, member, basketArtifactSha256 };
  }

  #requestDigest(input: CandidateB7DecisionRequest, basketArtifactSha256: string, member: Member, actor: Actor): string {
    return digest({ request: input, basketArtifactSha256, frozenMember: member, actor, requiredCapability: this.#config.requiredCapability, policy: { policyId: this.#config.policyId, policyVersion: this.#config.policyVersion } });
  }
  async #verifiedRetry(row: Row, requestSha256: string): Promise<CandidateB7DecisionExecution> { const result = this.#retryResult(row, requestSha256); await this.replay(row.decisionId); return result; }
  #retryResult(row: Row, requestSha256: string): CandidateB7DecisionExecution { if (row.requestSha256 !== requestSha256) throw new CandidateB7DecisionIdentityConflictError('Candidate version already has a B7 decision with changed request, decision, actor, policy, basket, or member identity'); return { decisionId: row.decisionId, decisionArtifactSha256: row.artifactSha256, decision: row.decision, deduplicated: true, databaseMutations: 0 }; }
  #existing(basketId: string, candidateId: string, candidateVersion: number): Row | undefined { return this.#query('basket_id=? AND candidate_id=? AND candidate_version=?', basketId, candidateId, candidateVersion); }
  #byId(decisionId: string): Row | undefined { return this.#query('decision_id=?', decisionId); }
  #query(where: string, ...values: unknown[]): Row | undefined { return this.#db.prepare(`SELECT decision_id decisionId, basket_id basketId, candidate_id candidateId, candidate_version candidateVersion, decision, actor_id actorId, role_snapshot roleSnapshot, required_capability requiredCapability, policy_id policyId, policy_version policyVersion, request_sha256 requestSha256, decision_artifact_sha256 artifactSha256, decided_at decidedAt FROM governance_candidate_b7_decisions WHERE ${where}`).get(...values) as Row | undefined; }
  #registerArtifact(stored: StoredArtifact, at: string): number { const result = this.#db.prepare("INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING").run(stored.sha256, stored.byteSize, stored.relativePath, at, at); const row = this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string }; if (row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' || row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0') throw new CandidateB7DecisionIdentityConflictError('Artifact metadata conflict'); return result.changes; }
}

function actorSnapshot(context: TrustedCandidateB7DecisionActorContext, capability: string): Actor {
  if (!context || typeof context !== 'object') throw new GovernanceValidationError('Trusted actor context is required');
  if (typeof context.actorId !== 'string' || !/^[a-z][a-z0-9:_-]{2,119}$/.test(context.actorId)) throw new GovernanceValidationError('Invalid trusted actor ID');
  if (!(context.capabilities instanceof Set)) throw new GovernanceValidationError('Trusted actor capabilities must be an application-verified Set');
  for (const value of context.capabilities) if (typeof value !== 'string' || value.length < 1 || value.length > 120 || value.trim() !== value) throw new GovernanceValidationError('Invalid trusted actor capability');
  if (!context.capabilities.has(capability)) throw new GovernanceValidationError(`Trusted actor lacks ${capability}`);
  if (context.roleSnapshot !== 'OWNER') throw new GovernanceValidationError('Candidate B7 review is owner-only; roleSnapshot must be OWNER');
  return Object.freeze({ actorId: context.actorId, roleSnapshot: 'OWNER' });
}
function assertConfiguration(config: CandidateB7DecisionConfiguration): void { if (config.policyId !== CANDIDATE_B7_DECISION_POLICY_ID || config.requiredCapability !== CANDIDATE_B7_DECISION_CAPABILITY || config.policyVersion !== 1) throw new TypeError('Invalid B7 review configuration'); }
function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function isDigest(value: string): boolean { return /^[0-9a-f]{64}$/.test(value); }
function expectedPath(value: string): string { return `sha256/${value.slice(0, 2)}/${value}`; }
function assertUuid(value: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new GovernanceValidationError('ID must be a UUID'); }
