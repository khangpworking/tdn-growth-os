import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ProductB10Decision } from '../../../contracts/governance/product-b10-decision.generated.js';
import type { ProductB10DecisionRequest } from '../../../contracts/governance/product-b10-decision-request.generated.js';
import type { LockedStpArtifact } from '../../../contracts/flow/locked-stp-artifact.generated.js';
import type { LockedStpReader } from '../flow/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { GovernanceValidationError, validateProductB10Decision, validateProductB10DecisionRequest, validateSourceLockedStp } from './validation.js';

export const PRODUCT_B10_REVIEW_CAPABILITY = 'governance:product-b10-review' as const;
export const PRODUCT_B10_REVIEW_POLICY_ID = 'governance:product-b10-review-v1' as const;
export class ProductB10DecisionIdentityConflictError extends Error {}
export interface TrustedProductB10DecisionActorContext {
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly capabilities: ReadonlySet<string>;
}
export interface ProductB10DecisionExecution {
  readonly decisionId: string;
  readonly decisionArtifactSha256: string;
  readonly decisionNumber: number;
  readonly decision: ProductB10Decision['decision'];
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}
export type ProductB10Status =
  | { readonly lockedStpId?: string; readonly productWorkspaceId: string; readonly decisionExists: false; readonly readyForB11: false }
  | { readonly lockedStpId: string; readonly productWorkspaceId: string; readonly decisionExists: true; readonly effectiveDecisionId: string; readonly effectiveDecisionNumber: number; readonly effectiveDecision: ProductB10Decision['decision']; readonly readyForB11: boolean };
export interface ProductB10History {
  readonly productWorkspaceId: string;
  readonly decisions: readonly ProductB10Decision[];
  readonly status: ProductB10Status;
}

type Row = {
  decisionId: string; lockedStpId: string; lockedStpArtifactSha256: string; productWorkspaceId: string;
  decisionNumber: bigint; previousDecisionId: string | null; decision: ProductB10Decision['decision'];
  actorId: string; roleSnapshot: string; requiredCapability: string; policyId: string; policyVersion: bigint;
  requestSha256: string; artifactSha256: string; decidedAt: string;
};
type Actor = ProductB10Decision['actor'];
type VerifiedLock = { readonly artifact: LockedStpArtifact; readonly digest: string; readonly productWorkspaceId: string };

export class ProductB10DecisionService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #lockedStps: LockedStpReader;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly lockedStpReader: LockedStpReader;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#lockedStps = options.lockedStpReader;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async decide(untrustedInput: unknown, actorContext: TrustedProductB10DecisionActorContext): Promise<ProductB10DecisionExecution> {
    const input = snapshot(validateProductB10DecisionRequest(untrustedInput));
    const actor = actorSnapshot(actorContext);
    return withDatabaseMutationMutex(this.#db, async () => this.#decideAuthorized(input, actor));
  }

  async #decideAuthorized(input: ProductB10DecisionRequest, actor: Actor): Promise<ProductB10DecisionExecution> {
    const historicalRetry = this.#byExactRequest(input, actor);
    if (historicalRetry) return this.#verifiedRetry(historicalRetry, input, actor);
    const lock = await this.#verifiedLock(input.lockedStpId);

    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const concurrentRetry = this.#byExactRequest(input, actor);
      if (concurrentRetry) {
        const result = this.#retryResult(concurrentRetry, input, actor);
        this.#db.exec('COMMIT');
        await this.replay(concurrentRetry.decisionId);
        return result;
      }
      const current = this.#effectiveByLock(input.lockedStpId);
      this.#assertPredecessor(input, current);
      const decisionNumber = current ? Number(current.decisionNumber) + 1 : 1;
      const decisionId = this.#validUuid();
      const decidedAt = this.#now().toISOString();
      const requestSha256 = requestDigest(input, actor, lock);
      const artifact = envelope(decisionId, decisionNumber, decidedAt, input, actor, lock, requestSha256);
      validateProductB10Decision(artifact);
      const stored = await this.#artifacts.put(bytes(artifact));
      let databaseMutations = this.#registerArtifact(stored, decidedAt);
      databaseMutations += this.#db.prepare(`INSERT INTO governance_product_b10_decisions(
        decision_id, locked_stp_id, locked_stp_artifact_sha256, product_workspace_id,
        decision_number, previous_decision_id, decision, actor_id, role_snapshot,
        required_capability, policy_id, policy_version, request_sha256, decision_artifact_sha256, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OWNER', ?, ?, 1, ?, ?, ?)`).run(
        decisionId, input.lockedStpId, lock.digest, lock.productWorkspaceId,
        decisionNumber, input.previousDecisionId, input.decision, actor.actorId,
        PRODUCT_B10_REVIEW_CAPABILITY, PRODUCT_B10_REVIEW_POLICY_ID, requestSha256, stored.sha256, decidedAt,
      ).changes;
      this.#db.exec('COMMIT');
      return { decisionId, decisionArtifactSha256: stored.sha256, decisionNumber, decision: input.decision, deduplicated: false, databaseMutations };
    } catch (error) {
      if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  async replay(decisionId: string): Promise<ProductB10Decision> {
    assertUuid(decisionId);
    const row = this.#byId(decisionId);
    if (!row) throw new GovernanceValidationError(`B10 decision not found: ${decisionId}`);
    const data = await this.#artifacts.read(row.artifactSha256);
    const manifest = this.#manifest(row.artifactSha256);
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' || manifest.relativePath !== expectedPath(row.artifactSha256) || manifest.contractVersion !== '1.0.0' || manifest.retentionStatus !== 'active') throw new ProductB10DecisionIdentityConflictError('B10 decision artifact manifest mismatch');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
    catch (error) { throw new GovernanceValidationError(`Invalid B10 decision JSON: ${(error as Error).message}`); }
    const artifact = validateProductB10Decision(parsed);
    if (!data.equals(bytes(artifact))) throw new GovernanceValidationError('B10 decision artifact is not canonical JSON');
    const frozenLock = artifact.lockedStp.artifact;
    const frozenDigest = digest(frozenLock);
    const productWorkspaceId = frozenLock.productWorkspace.artifact.productWorkspaceId;
    const lock: VerifiedLock = { artifact: frozenLock, digest: frozenDigest, productWorkspaceId };
    const request: ProductB10DecisionRequest = { contractVersion: '1.0.0', lockedStpId: row.lockedStpId, previousDecisionId: row.previousDecisionId, decision: row.decision };
    const actor: Actor = { actorId: row.actorId, roleSnapshot: 'OWNER' };
    const expectedRequestSha256 = requestDigest(request, actor, lock);
    const expected = envelope(row.decisionId, Number(row.decisionNumber), row.decidedAt, request, actor, lock, expectedRequestSha256);
    if (createHash('sha256').update(data).digest('hex') !== row.artifactSha256 || frozenLock.lockId !== row.lockedStpId || artifact.lockedStp.lockId !== row.lockedStpId ||
        artifact.lockedStp.lockArtifactSha256 !== frozenDigest || row.decisionId !== decisionId || row.lockedStpArtifactSha256 !== frozenDigest || row.productWorkspaceId !== productWorkspaceId ||
        row.roleSnapshot !== 'OWNER' || row.requiredCapability !== PRODUCT_B10_REVIEW_CAPABILITY || row.policyId !== PRODUCT_B10_REVIEW_POLICY_ID || row.policyVersion !== 1n ||
        row.requestSha256 !== expectedRequestSha256 || canonicalJson(artifact) !== canonicalJson(expected)) {
      throw new ProductB10DecisionIdentityConflictError('B10 decision does not match immutable row, request, actor, policy, or exact locked STP');
    }
    this.#assertHistoricalChain(row);
    return artifact;
  }

  async readStatusByLockedStp(lockedStpId: string): Promise<ProductB10Status> {
    const row = this.#effectiveByLock(lockedStpId);
    if (!row) {
      const lock = await this.#verifiedLock(lockedStpId);
      return { lockedStpId, productWorkspaceId: lock.productWorkspaceId, decisionExists: false, readyForB11: false };
    }
    const decision = await this.replay(row.decisionId);
    return status(decision);
  }

  async readStatusByProductWorkspace(productWorkspaceId: string): Promise<ProductB10Status> {
    assertUuid(productWorkspaceId);
    const row = this.#effectiveByWorkspace(productWorkspaceId);
    if (!row) return { productWorkspaceId, decisionExists: false, readyForB11: false };
    const decision = await this.replay(row.decisionId);
    if (decision.productWorkspaceId !== productWorkspaceId) throw new ProductB10DecisionIdentityConflictError('B10 workspace status identity mismatch');
    return status(decision);
  }

  async readHistoryByProductWorkspace(productWorkspaceId: string): Promise<ProductB10History> {
    assertUuid(productWorkspaceId);
    const rows = this.#db.prepare(`SELECT decision_id decisionId FROM governance_product_b10_decisions WHERE product_workspace_id=? ORDER BY decision_number, decision_id`).all(productWorkspaceId) as { decisionId: string }[];
    const decisions: ProductB10Decision[] = [];
    for (const row of rows) {
      const decision = await this.replay(row.decisionId);
      if (decision.productWorkspaceId !== productWorkspaceId) throw new ProductB10DecisionIdentityConflictError('B10 history workspace identity mismatch');
      decisions.push(decision);
    }
    const effective = decisions.at(-1);
    const readStatus: ProductB10Status = effective ? status(effective) : { productWorkspaceId, decisionExists: false, readyForB11: false };
    return { productWorkspaceId, decisions, status: readStatus };
  }

  #assertPredecessor(input: ProductB10DecisionRequest, current: Row | undefined): void {
    if (!current) {
      if (input.previousDecisionId !== null) throw new ProductB10DecisionIdentityConflictError('First B10 decision requires previousDecisionId null');
      return;
    }
    if (input.previousDecisionId !== current.decisionId) throw new ProductB10DecisionIdentityConflictError('previousDecisionId must equal the exact current effective B10 decision ID');
    if (input.decision === current.decision) throw new GovernanceValidationError('A B10 correction must change the effective decision');
  }

  #assertHistoricalChain(row: Row): void {
    let current = row;
    const seen = new Set<string>();
    while (current.decisionNumber > 1n) {
      if (!current.previousDecisionId || seen.has(current.decisionId)) throw new ProductB10DecisionIdentityConflictError('Historical B10 decision predecessor is missing or cyclic');
      seen.add(current.decisionId);
      const previous = this.#byId(current.previousDecisionId);
      if (!previous || previous.lockedStpId !== current.lockedStpId || previous.lockedStpArtifactSha256 !== current.lockedStpArtifactSha256 || previous.productWorkspaceId !== current.productWorkspaceId || previous.decisionNumber !== current.decisionNumber - 1n || previous.decision === current.decision) throw new ProductB10DecisionIdentityConflictError('Historical B10 decision chain mismatch');
      current = previous;
    }
    if (current.previousDecisionId !== null || current.decisionNumber !== 1n) throw new ProductB10DecisionIdentityConflictError('First B10 decision must have number one and no predecessor');
  }

  async #verifiedLock(lockedStpId: string): Promise<VerifiedLock> {
    assertUuid(lockedStpId);
    const artifact = snapshot(validateSourceLockedStp(await this.#lockedStps.readVerifiedLockedStp(lockedStpId)));
    if (artifact.lockId !== lockedStpId) throw new ProductB10DecisionIdentityConflictError('Verified LockedStpReader returned the wrong lock');
    if (artifact.state !== 'LOCKED_STP') throw new GovernanceValidationError('B10 requires exact immutable LOCKED_STP state');
    const productWorkspaceId = artifact.productWorkspace.artifact.productWorkspaceId;
    if (artifact.productWorkspace.artifact.state !== 'ACTIVE' || artifact.productWorkspace.artifact.entryStep !== 'B8') throw new GovernanceValidationError('Locked STP contains invalid product workspace state');
    return { artifact, digest: digest(artifact), productWorkspaceId };
  }

  async #verifiedRetry(row: Row, input: ProductB10DecisionRequest, actor: Actor): Promise<ProductB10DecisionExecution> {
    const result = this.#retryResult(row, input, actor);
    const artifact = await this.replay(row.decisionId);
    const lock: VerifiedLock = { artifact: artifact.lockedStp.artifact, digest: artifact.lockedStp.lockArtifactSha256, productWorkspaceId: artifact.productWorkspaceId };
    if (row.requestSha256 !== requestDigest(input, actor, lock)) throw new ProductB10DecisionIdentityConflictError('B10 retry frozen request digest mismatch');
    return result;
  }
  #retryResult(row: Row, input: ProductB10DecisionRequest, actor: Actor): ProductB10DecisionExecution {
    if (row.lockedStpId !== input.lockedStpId || row.previousDecisionId !== input.previousDecisionId || row.decision !== input.decision || row.actorId !== actor.actorId || row.roleSnapshot !== actor.roleSnapshot) throw new ProductB10DecisionIdentityConflictError('B10 retry changed request, actor, predecessor, or decision');
    return { decisionId: row.decisionId, decisionArtifactSha256: row.artifactSha256, decisionNumber: Number(row.decisionNumber), decision: row.decision, deduplicated: true, databaseMutations: 0 };
  }

  #byId(value: string): Row | undefined { return this.#query('decision_id=?', value); }
  #byExactRequest(input: ProductB10DecisionRequest, actor: Actor): Row | undefined {
    return this.#db.prepare(`SELECT decision_id decisionId, locked_stp_id lockedStpId, locked_stp_artifact_sha256 lockedStpArtifactSha256, product_workspace_id productWorkspaceId, decision_number decisionNumber, previous_decision_id previousDecisionId, decision, actor_id actorId, role_snapshot roleSnapshot, required_capability requiredCapability, policy_id policyId, policy_version policyVersion, request_sha256 requestSha256, decision_artifact_sha256 artifactSha256, decided_at decidedAt FROM governance_product_b10_decisions WHERE locked_stp_id=? AND previous_decision_id IS ? AND decision=? AND actor_id=? AND role_snapshot='OWNER' AND required_capability=? AND policy_id=? AND policy_version=1 LIMIT 1`).get(input.lockedStpId, input.previousDecisionId, input.decision, actor.actorId, PRODUCT_B10_REVIEW_CAPABILITY, PRODUCT_B10_REVIEW_POLICY_ID) as Row | undefined;
  }
  #effectiveByLock(value: string): Row | undefined { return this.#query('locked_stp_id=? ORDER BY decision_number DESC LIMIT 1', value); }
  #effectiveByWorkspace(value: string): Row | undefined { return this.#query('product_workspace_id=? ORDER BY decision_number DESC LIMIT 1', value); }
  #query(where: string, value: string): Row | undefined { return this.#db.prepare(`SELECT decision_id decisionId, locked_stp_id lockedStpId, locked_stp_artifact_sha256 lockedStpArtifactSha256, product_workspace_id productWorkspaceId, decision_number decisionNumber, previous_decision_id previousDecisionId, decision, actor_id actorId, role_snapshot roleSnapshot, required_capability requiredCapability, policy_id policyId, policy_version policyVersion, request_sha256 requestSha256, decision_artifact_sha256 artifactSha256, decided_at decidedAt FROM governance_product_b10_decisions WHERE ${where}`).get(value) as Row | undefined; }
  #manifest(value: string): { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string } | undefined { return this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion,retention_status retentionStatus FROM artifact_manifests WHERE sha256=?').get(value) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string } | undefined; }
  #registerArtifact(stored: StoredArtifact, at: string): number { const result = this.#db.prepare("INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING").run(stored.sha256, stored.byteSize, stored.relativePath, at, at); const row = this.#manifest(stored.sha256); if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' || row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') throw new ProductB10DecisionIdentityConflictError('Artifact metadata conflict'); return result.changes; }
  #validUuid(): string { const value = this.#uuid(); assertUuid(value); return value; }
}

function envelope(decisionId: string, decisionNumber: number, decidedAt: string, input: ProductB10DecisionRequest, actor: Actor, lock: VerifiedLock, requestSha256: string): ProductB10Decision {
  return { contractVersion: '1.0.0', decisionId, decisionNumber, previousDecisionId: input.previousDecisionId, decision: input.decision, decidedAt, lockedStp: { lockId: lock.artifact.lockId, lockArtifactSha256: lock.digest, artifact: lock.artifact }, productWorkspaceId: lock.productWorkspaceId, actor, requiredCapability: PRODUCT_B10_REVIEW_CAPABILITY, policy: { policyId: PRODUCT_B10_REVIEW_POLICY_ID, policyVersion: 1 }, requestSha256 };
}
function status(decision: ProductB10Decision): ProductB10Status { return { lockedStpId: decision.lockedStp.lockId, productWorkspaceId: decision.productWorkspaceId, decisionExists: true, effectiveDecisionId: decision.decisionId, effectiveDecisionNumber: decision.decisionNumber, effectiveDecision: decision.decision, readyForB11: decision.decision === 'APPROVE' }; }
function actorSnapshot(context: TrustedProductB10DecisionActorContext): Actor { if (!context || typeof context !== 'object') throw new GovernanceValidationError('Trusted actor context is required'); if (typeof context.actorId !== 'string' || !/^[a-z][a-z0-9:_-]{2,119}$/.test(context.actorId)) throw new GovernanceValidationError('Invalid trusted actor ID'); if (!(context.capabilities instanceof Set)) throw new GovernanceValidationError('Trusted actor capabilities must be an application-verified Set'); if (context.roleSnapshot !== 'OWNER') throw new GovernanceValidationError('Product B10 review is OWNER-only'); if (!context.capabilities.has(PRODUCT_B10_REVIEW_CAPABILITY)) throw new GovernanceValidationError(`Trusted actor lacks ${PRODUCT_B10_REVIEW_CAPABILITY}`); return { actorId: context.actorId, roleSnapshot: 'OWNER' }; }
function requestDigest(input: ProductB10DecisionRequest, actor: Actor, lock: VerifiedLock): string { return digest({ request: input, actor, requiredCapability: PRODUCT_B10_REVIEW_CAPABILITY, policy: { policyId: PRODUCT_B10_REVIEW_POLICY_ID, policyVersion: 1 }, lockedStpArtifactSha256: lock.digest, productWorkspaceId: lock.productWorkspaceId }); }
function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function expectedPath(value: string): string { return `sha256/${value.slice(0, 2)}/${value}`; }
function assertUuid(value: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new GovernanceValidationError('ID must be a UUID'); }
