import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { B8ClearanceArtifact } from '../../../contracts/flow/b8-clearance-artifact.generated.js';
import type { B8ClearanceCreateRequest } from '../../../contracts/flow/b8-clearance-create-request.generated.js';
import type { ProductB8LaneDecision } from '../../../contracts/governance/product-b8-lane-decision.generated.js';
import type { ProductB8DecisionByIdReader, ProductB8Status, ProductB8StatusReader } from '../governance/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import {
  FlowValidationError,
  validateB8ClearanceArtifact,
  validateB8ClearanceCreateRequest,
  validateSourceProductB8Decision,
} from './validation.js';

export const B8_CLEARANCE_LANES = ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'] as const;
export class B8ClearanceIdentityConflictError extends Error {}
export interface B8ClearanceExecution {
  readonly clearanceId: string;
  readonly clearanceArtifactSha256: string;
  readonly state: 'READY_FOR_B9';
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

type Lane = typeof B8_CLEARANCE_LANES[number];
type DecisionSnapshot = B8ClearanceArtifact['decisions'][number];
type WorkspaceSnapshot = B8ClearanceArtifact['productWorkspace'];
type ClearanceRow = {
  clearanceId: string; productWorkspaceId: string; productWorkspaceArtifactSha256: string;
  productWorkspaceKey: string; productWorkspaceTitle: string; state: string;
  requestSha256: string; artifactSha256: string; clearedAt: string;
};
type MembershipRow = {
  clearanceId: string; laneOrdinal: bigint; lane: Lane; decisionId: string; decisionVersion: bigint;
  decisionArtifactSha256: string; decidedAt: string; actorId: string; roleSnapshot: string;
  requiredCapability: string; policyId: string; policyVersion: bigint;
};
type VerifiedSources = { readonly productWorkspace: WorkspaceSnapshot; readonly decisions: readonly DecisionSnapshot[] };

export class B8ClearanceService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #decisions: ProductB8DecisionByIdReader;
  readonly #statuses: ProductB8StatusReader;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly decisionReader: ProductB8DecisionByIdReader;
    readonly statusReader: ProductB8StatusReader;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#decisions = options.decisionReader;
    this.#statuses = options.statusReader;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createClearance(untrustedInput: unknown): Promise<B8ClearanceExecution> {
    const input = snapshot(validateB8ClearanceCreateRequest(untrustedInput));
    return withDatabaseMutationMutex(this.#db, async () => this.#createValidated(input));
  }

  async #createValidated(input: B8ClearanceCreateRequest): Promise<B8ClearanceExecution> {
    const requestSha256 = digest(input);
    const existing = this.#byWorkspace(input.productWorkspaceId);
    if (existing) return this.#verifiedRetry(input, existing, requestSha256);
    this.#assertDecisionIdsUnused(input);

    const verified = await this.#verifiedSources(input);
    await this.#requireCurrentPasses(input, verified);
    const clearanceId = this.#validUuid();
    const clearedAt = this.#now().toISOString();
    const artifact: B8ClearanceArtifact = {
      contractVersion: '1.0.0', clearanceId, state: 'READY_FOR_B9', clearedAt, requestSha256,
      productWorkspace: verified.productWorkspace,
      decisions: verified.decisions as B8ClearanceArtifact['decisions'],
    };
    validateB8ClearanceArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));
    // Acquire the local authoritative write lock before the final status read. The injected
    // status reader for production shares this database, so a competing B8 revision cannot
    // commit between this check and the clearance insert. A failed check may leave only a safe
    // content-addressed orphan; it cannot create authoritative clearance rows.
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const concurrent = this.#byWorkspace(input.productWorkspaceId);
      if (concurrent) {
        const result = this.#retryResult(input, concurrent, requestSha256);
        this.#db.exec('COMMIT');
        await this.replay(result.clearanceId);
        return result;
      }
      this.#assertDecisionIdsUnused(input);
      await this.#requireCurrentPasses(input, verified);
      let databaseMutations = this.#registerArtifact(stored, clearedAt);
      databaseMutations += this.#db.prepare(`INSERT INTO flow_b8_clearances(
        clearance_id, product_workspace_id, product_workspace_artifact_sha256, product_workspace_key,
        product_workspace_title, state, request_sha256, clearance_artifact_sha256, cleared_at
      ) VALUES (?, ?, ?, ?, ?, 'READY_FOR_B9', ?, ?, ?)`).run(
        clearanceId, input.productWorkspaceId, verified.productWorkspace.productWorkspaceArtifactSha256,
        verified.productWorkspace.productWorkspaceKey, verified.productWorkspace.title,
        requestSha256, stored.sha256, clearedAt,
      ).changes;
      const insertMember = this.#db.prepare(`INSERT INTO flow_b8_clearance_decisions(
        clearance_id, lane_ordinal, lane, decision_id, decision_version, decision_artifact_sha256,
        decided_at, actor_id, role_snapshot, required_capability, policy_id, policy_version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OWNER', ?, ?, 1)`);
      for (const [index, decision] of verified.decisions.entries()) {
        databaseMutations += insertMember.run(
          clearanceId, index + 1, decision.lane, decision.decisionId, decision.decisionVersion,
          decision.decisionArtifactSha256, decision.decidedAt, decision.actor.actorId,
          decision.requiredCapability, decision.policy.policyId,
        ).changes;
      }
      const result: B8ClearanceExecution = { clearanceId, clearanceArtifactSha256: stored.sha256, state: 'READY_FOR_B9', deduplicated: false, databaseMutations };
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  async replay(clearanceId: string): Promise<B8ClearanceArtifact> {
    assertUuid(clearanceId);
    const row = this.#byId(clearanceId);
    if (!row) throw new FlowValidationError(`B8 clearance not found: ${clearanceId}`);
    const members = this.#members(clearanceId);
    if (members.length !== 4) throw new B8ClearanceIdentityConflictError('B8 clearance must have exactly four immutable decision memberships');
    const data = await this.#artifacts.read(row.artifactSha256);
    const manifest = this.#db.prepare(`SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
      contract_version contractVersion FROM artifact_manifests WHERE sha256=?`).get(row.artifactSha256) as
      { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' ||
        manifest.relativePath !== expectedPath(row.artifactSha256) || manifest.contractVersion !== '1.0.0') {
      throw new B8ClearanceIdentityConflictError('B8 clearance artifact manifest mismatch');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
    catch (error) { throw new FlowValidationError(`Invalid B8 clearance JSON: ${(error as Error).message}`); }
    const artifact = validateB8ClearanceArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('B8 clearance is not canonical JSON');

    const request = requestFromArtifact(artifact);
    const requestSha256 = digest(validateB8ClearanceCreateRequest(request));
    const verified = await this.#verifiedHistoricalSources(request);
    if (artifact.clearanceId !== clearanceId || artifact.clearanceId !== row.clearanceId ||
        artifact.state !== 'READY_FOR_B9' || row.state !== 'READY_FOR_B9' || artifact.clearedAt !== row.clearedAt ||
        artifact.requestSha256 !== row.requestSha256 || requestSha256 !== row.requestSha256 ||
        artifact.productWorkspace.productWorkspaceId !== row.productWorkspaceId ||
        artifact.productWorkspace.productWorkspaceArtifactSha256 !== row.productWorkspaceArtifactSha256 ||
        artifact.productWorkspace.productWorkspaceKey !== row.productWorkspaceKey || artifact.productWorkspace.title !== row.productWorkspaceTitle ||
        canonicalJson(artifact.productWorkspace) !== canonicalJson(verified.productWorkspace) ||
        canonicalJson(artifact.decisions) !== canonicalJson(verified.decisions) || !membersMatch(members, artifact.decisions)) {
      throw new B8ClearanceIdentityConflictError('B8 clearance does not match immutable row, membership, request, workspace, or decisions');
    }
    return artifact;
  }

  async #verifiedSources(input: B8ClearanceCreateRequest): Promise<VerifiedSources> {
    const verified = await this.#verifiedHistoricalSources(input);
    return verified;
  }

  async #verifiedHistoricalSources(input: B8ClearanceCreateRequest): Promise<VerifiedSources> {
    const decisions: DecisionSnapshot[] = [];
    let productWorkspace: WorkspaceSnapshot | undefined;
    for (const lane of B8_CLEARANCE_LANES) {
      const decisionId = input.decisions[lane];
      const untrusted: unknown = await this.#decisions.readVerifiedDecision(decisionId);
      const decision = snapshot(validateSourceProductB8Decision(untrusted));
      if (decision.decisionId !== decisionId) throw new FlowValidationError(`Verified B8 reader returned the wrong ${lane} decision`);
      if (decision.lane !== lane) throw new FlowValidationError(`Exact B8 decision must belong to ${lane}`);
      if (decision.decision !== 'PASS') throw new FlowValidationError(`Exact ${lane} decision must be PASS`);
      if (decision.productWorkspace.productWorkspaceId !== input.productWorkspaceId) throw new FlowValidationError(`Exact ${lane} decision belongs to another product workspace`);
      if (decision.actor.roleSnapshot !== 'OWNER' || decision.requiredCapability !== 'governance:product-b8-review' ||
          decision.policy.policyId !== 'governance:product-b8-review-v1' || decision.policy.policyVersion !== 1 ||
          decision.productWorkspace.state !== 'ACTIVE' || decision.productWorkspace.entryStep !== 'B8') {
        throw new FlowValidationError(`Exact ${lane} decision has invalid authorization, policy, or workspace state`);
      }
      if (!productWorkspace) productWorkspace = snapshot(decision.productWorkspace);
      else if (canonicalJson(productWorkspace) !== canonicalJson(decision.productWorkspace)) {
        throw new B8ClearanceIdentityConflictError('All four B8 decisions must contain identical frozen product-workspace lineage');
      }
      decisions.push({
        lane, decisionId, decisionVersion: decision.decisionVersion, decisionArtifactSha256: digest(decision),
        decidedAt: decision.decidedAt, decision: 'PASS', actor: { ...decision.actor },
        requiredCapability: decision.requiredCapability, policy: { ...decision.policy },
      });
    }
    if (!productWorkspace) throw new FlowValidationError('Four B8 decisions are required');
    return { productWorkspace, decisions };
  }

  async #requireCurrentPasses(input: B8ClearanceCreateRequest, verified: VerifiedSources): Promise<void> {
    const untrusted: unknown = await this.#statuses.readStatus(input.productWorkspaceId);
    if (!untrusted || typeof untrusted !== 'object') throw new FlowValidationError('Malformed B8 status reader result');
    const status = untrusted as ProductB8Status;
    if (status.productWorkspaceId !== input.productWorkspaceId || status.readyForB9 !== true || !Array.isArray(status.lanes) || status.lanes.length !== 4) {
      throw new FlowValidationError('Product workspace is not currently ready for B9');
    }
    for (const [index, lane] of B8_CLEARANCE_LANES.entries()) {
      const current = status.lanes[index];
      if (!current || current.lane !== lane || current.effectiveState !== 'PASS' ||
          !('decisionId' in current) || current.decisionId !== input.decisions[lane] ||
          !('decisionVersion' in current) || !Number.isSafeInteger(current.decisionVersion) ||
          current.decisionVersion !== verified.decisions[index]?.decisionVersion) {
        throw new FlowValidationError(`Supplied ${lane} decision is not the current effective PASS`);
      }
    }
  }

  async #verifiedRetry(input: B8ClearanceCreateRequest, row: ClearanceRow, requestSha256: string): Promise<B8ClearanceExecution> {
    const result = this.#retryResult(input, row, requestSha256);
    await this.replay(result.clearanceId);
    return result;
  }
  #retryResult(input: B8ClearanceCreateRequest, row: ClearanceRow, requestSha256: string): B8ClearanceExecution {
    const members = this.#members(row.clearanceId);
    if (row.requestSha256 !== requestSha256 || row.productWorkspaceId !== input.productWorkspaceId || members.length !== 4 ||
        B8_CLEARANCE_LANES.some((lane, index) => members[index]?.lane !== lane || members[index]?.decisionId !== input.decisions[lane])) {
      throw new B8ClearanceIdentityConflictError('Product workspace already has a B8 clearance with a different exact decision set');
    }
    return { clearanceId: row.clearanceId, clearanceArtifactSha256: row.artifactSha256, state: 'READY_FOR_B9', deduplicated: true, databaseMutations: 0 };
  }
  #assertDecisionIdsUnused(input: B8ClearanceCreateRequest): void {
    const ids = B8_CLEARANCE_LANES.map((lane) => input.decisions[lane]);
    if (new Set(ids).size !== 4) throw new FlowValidationError('Each B8 lane must supply a distinct exact decision ID');
    const placeholders = ids.map(() => '?').join(',');
    const used = this.#db.prepare(`SELECT decision_id decisionId, clearance_id clearanceId FROM flow_b8_clearance_decisions WHERE decision_id IN (${placeholders}) LIMIT 1`).get(...ids) as { decisionId: string; clearanceId: string } | undefined;
    if (used) throw new B8ClearanceIdentityConflictError('A B8 decision set cannot be assigned to another product workspace');
  }
  #byId(clearanceId: string): ClearanceRow | undefined { return this.#clearanceQuery('clearance_id=?', clearanceId); }
  #byWorkspace(productWorkspaceId: string): ClearanceRow | undefined { return this.#clearanceQuery('product_workspace_id=?', productWorkspaceId); }
  #clearanceQuery(where: string, value: string): ClearanceRow | undefined { return this.#db.prepare(`SELECT clearance_id clearanceId, product_workspace_id productWorkspaceId, product_workspace_artifact_sha256 productWorkspaceArtifactSha256, product_workspace_key productWorkspaceKey, product_workspace_title productWorkspaceTitle, state, request_sha256 requestSha256, clearance_artifact_sha256 artifactSha256, cleared_at clearedAt FROM flow_b8_clearances WHERE ${where}`).get(value) as ClearanceRow | undefined; }
  #members(clearanceId: string): MembershipRow[] { return this.#db.prepare(`SELECT clearance_id clearanceId, lane_ordinal laneOrdinal, lane, decision_id decisionId, decision_version decisionVersion, decision_artifact_sha256 decisionArtifactSha256, decided_at decidedAt, actor_id actorId, role_snapshot roleSnapshot, required_capability requiredCapability, policy_id policyId, policy_version policyVersion FROM flow_b8_clearance_decisions WHERE clearance_id=? ORDER BY lane_ordinal`).all(clearanceId) as MembershipRow[]; }
  #registerArtifact(stored: StoredArtifact, at: string): number { const result = this.#db.prepare("INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING").run(stored.sha256, stored.byteSize, stored.relativePath, at, at); const row = this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string }; if (row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' || row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0') throw new B8ClearanceIdentityConflictError('Artifact metadata conflict'); return result.changes; }
  #validUuid(): string { const value = this.#uuid(); assertUuid(value); return value; }
}

function requestFromArtifact(artifact: B8ClearanceArtifact): B8ClearanceCreateRequest { return { contractVersion: '1.0.0', productWorkspaceId: artifact.productWorkspace.productWorkspaceId, decisions: { LEGAL: artifact.decisions[0].decisionId, SCIENTIFIC: artifact.decisions[1].decisionId, QUALITY: artifact.decisions[2].decisionId, FINANCE: artifact.decisions[3].decisionId } }; }
function membersMatch(rows: readonly MembershipRow[], decisions: B8ClearanceArtifact['decisions']): boolean { return rows.every((row, index) => { const decision = decisions[index]; return !!decision && Number(row.laneOrdinal) === index + 1 && row.lane === decision.lane && row.decisionId === decision.decisionId && Number(row.decisionVersion) === decision.decisionVersion && row.decisionArtifactSha256 === decision.decisionArtifactSha256 && row.decidedAt === decision.decidedAt && row.actorId === decision.actor.actorId && row.roleSnapshot === decision.actor.roleSnapshot && row.requiredCapability === decision.requiredCapability && row.policyId === decision.policy.policyId && Number(row.policyVersion) === decision.policy.policyVersion; }); }
function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function expectedPath(value: string): string { return `sha256/${value.slice(0, 2)}/${value}`; }
function assertUuid(value: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new FlowValidationError('ID must be a UUID'); }
