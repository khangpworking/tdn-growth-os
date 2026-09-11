import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { LockedStpArtifact } from '../../../contracts/flow/locked-stp-artifact.generated.js';
import type { StpContent } from '../../../contracts/flow/stp-content.generated.js';
import type { StpLockRequest } from '../../../contracts/flow/stp-lock-request.generated.js';
import type { StpWorkingSaveRequest } from '../../../contracts/flow/stp-working-save-request.generated.js';
import type { ProductWorkspaceArtifact } from '../../../contracts/flow/product-workspace-artifact.generated.js';
import type { B8ClearanceArtifact } from '../../../contracts/flow/b8-clearance-artifact.generated.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import type { B8ClearanceReader } from './b8-clearance-reader.js';
import type { ProductWorkspaceReader } from './product-workspace-reader.js';
import {
  FlowValidationError,
  validateB8ClearanceArtifact,
  validateLockedStpArtifact,
  validateProductWorkspaceArtifact,
  validateStpContent,
  validateStpLockRequest,
  validateStpWorkingSaveRequest,
} from './validation.js';

export const PRODUCT_B9_LOCK_CAPABILITY = 'governance:product-b9-lock' as const;
export const PRODUCT_B9_LOCK_POLICY_ID = 'governance:product-b9-lock-v1' as const;
export class StpIdentityConflictError extends Error {}
export interface TrustedStpLockActorContext {
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly capabilities: ReadonlySet<string>;
}
export interface StpWorkingExecution {
  readonly workingStpId: string;
  readonly productWorkspaceId: string;
  readonly workingDigest: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}
export interface StpWorkingRecord {
  readonly workingStpId: string;
  readonly productWorkspaceId: string;
  readonly productWorkspaceArtifactSha256: string;
  readonly b8ClearanceId: string;
  readonly b8ClearanceArtifactSha256: string;
  readonly workingDigest: string;
  readonly content: StpContent;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface StpLockExecution {
  readonly lockId: string;
  readonly lockArtifactSha256: string;
  readonly state: 'LOCKED_STP';
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}
export type ProductB9ReadStatus =
  | { readonly productWorkspaceId: string; readonly state: 'NOT_STARTED' }
  | { readonly productWorkspaceId: string; readonly state: 'WORKING'; readonly working: StpWorkingRecord }
  | { readonly productWorkspaceId: string; readonly state: 'LOCKED'; readonly working: StpWorkingRecord; readonly locked: LockedStpArtifact };

type WorkingRow = {
  workingStpId: string; productWorkspaceId: string; productWorkspaceArtifactSha256: string;
  b8ClearanceId: string; b8ClearanceArtifactSha256: string; contentJson: string;
  workingDigest: string; createdAt: string; updatedAt: string;
};
type LockRow = {
  lockId: string; productWorkspaceId: string; workingStpId: string; workingDigest: string;
  productWorkspaceArtifactSha256: string; b8ClearanceId: string; b8ClearanceArtifactSha256: string;
  actorId: string; roleSnapshot: string; requiredCapability: string; policyId: string; policyVersion: bigint;
  requestSha256: string; artifactSha256: string; lockedAt: string;
};
type VerifiedSources = {
  readonly workspace: ProductWorkspaceArtifact;
  readonly workspaceDigest: string;
  readonly clearance: B8ClearanceArtifact;
  readonly clearanceDigest: string;
};
type LockActor = LockedStpArtifact['actor'];

export class StpService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #workspaces: ProductWorkspaceReader;
  readonly #clearances: B8ClearanceReader;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly productWorkspaceReader: ProductWorkspaceReader;
    readonly b8ClearanceReader: B8ClearanceReader;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#workspaces = options.productWorkspaceReader;
    this.#clearances = options.b8ClearanceReader;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async saveWorking(untrustedInput: unknown): Promise<StpWorkingExecution> {
    const input = snapshot(validateStpWorkingSaveRequest(untrustedInput));
    return withDatabaseMutationMutex(this.#db, async () => this.#saveValidated(input));
  }

  async #saveValidated(input: StpWorkingSaveRequest): Promise<StpWorkingExecution> {
    if (this.#lockByWorkspace(input.productWorkspaceId)) throw new FlowValidationError('Locked STP cannot be edited or replaced');
    const content = contentFromSave(input);
    const workingDigest = digest(content);
    const existing = this.#workingByWorkspace(input.productWorkspaceId);
    const sources = await this.#verifiedSources(input.productWorkspaceId, input.b8ClearanceId);
    if (existing) {
      this.#assertWorkingIdentity(existing, sources);
      if (existing.workingDigest === workingDigest) {
        await this.#readVerifiedWorkingRow(existing, sources);
        return receipt(existing, true);
      }
      if (input.expectedWorkingDigest !== existing.workingDigest) throw new StpIdentityConflictError('STP working digest is stale');
      const updatedAt = this.#now().toISOString();
      this.#db.exec('BEGIN IMMEDIATE');
      try {
        if (this.#lockByWorkspace(input.productWorkspaceId)) throw new FlowValidationError('Locked STP cannot be edited or replaced');
        const current = this.#workingByWorkspace(input.productWorkspaceId);
        if (!current || current.workingDigest !== input.expectedWorkingDigest) throw new StpIdentityConflictError('STP working content changed concurrently');
        const changes = this.#db.prepare('UPDATE flow_stp_working_records SET content_json=?, working_digest=?, updated_at=? WHERE working_stp_id=?').run(canonicalJson(content), workingDigest, updatedAt, current.workingStpId).changes;
        this.#db.exec('COMMIT');
        return { workingStpId: existing.workingStpId, productWorkspaceId: input.productWorkspaceId, workingDigest, deduplicated: false, databaseMutations: changes };
      } catch (error) {
        if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
        throw error;
      }
    }
    if (input.expectedWorkingDigest !== null) throw new StpIdentityConflictError('Initial STP save requires null expectedWorkingDigest');
    const workingStpId = this.#validUuid();
    const createdAt = this.#now().toISOString();
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      if (this.#lockByWorkspace(input.productWorkspaceId)) throw new FlowValidationError('Locked STP cannot be edited or replaced');
      const concurrent = this.#workingByWorkspace(input.productWorkspaceId);
      if (concurrent) {
        this.#assertWorkingIdentity(concurrent, sources);
        if (concurrent.workingDigest !== workingDigest) throw new StpIdentityConflictError('STP working record changed concurrently');
        this.#db.exec('COMMIT');
        return receipt(concurrent, true);
      }
      const changes = this.#db.prepare(`INSERT INTO flow_stp_working_records(
        working_stp_id, product_workspace_id, product_workspace_artifact_sha256,
        b8_clearance_id, b8_clearance_artifact_sha256, content_json, working_digest, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        workingStpId, input.productWorkspaceId, sources.workspaceDigest, input.b8ClearanceId,
        sources.clearanceDigest, canonicalJson(content), workingDigest, createdAt, createdAt,
      ).changes;
      this.#db.exec('COMMIT');
      return { workingStpId, productWorkspaceId: input.productWorkspaceId, workingDigest, deduplicated: false, databaseMutations: changes };
    } catch (error) {
      if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  async readVerifiedWorking(productWorkspaceId: string): Promise<StpWorkingRecord> {
    assertUuid(productWorkspaceId);
    const row = this.#workingByWorkspace(productWorkspaceId);
    if (!row) throw new FlowValidationError(`STP working record not found: ${productWorkspaceId}`);
    const sources = await this.#verifiedSources(productWorkspaceId, row.b8ClearanceId);
    return this.#readVerifiedWorkingRow(row, sources);
  }

  async readStatusByProductWorkspace(productWorkspaceId: string): Promise<ProductB9ReadStatus> {
    assertUuid(productWorkspaceId);
    const workingRow = this.#workingByWorkspace(productWorkspaceId);
    const lockRow = this.#lockByWorkspace(productWorkspaceId);
    if (!workingRow) {
      if (lockRow) throw new StpIdentityConflictError('Locked STP has no working record');
      return { productWorkspaceId, state: 'NOT_STARTED' };
    }
    const sources = await this.#verifiedSources(productWorkspaceId, workingRow.b8ClearanceId);
    const working = await this.#readVerifiedWorkingRow(workingRow, sources);
    if (!lockRow) return { productWorkspaceId, state: 'WORKING', working };
    const locked = await this.replayLocked(lockRow.lockId);
    if (locked.productWorkspace.artifact.productWorkspaceId !== productWorkspaceId || locked.workingStp.workingStpId !== working.workingStpId || locked.workingStp.workingDigest !== working.workingDigest) throw new StpIdentityConflictError('B9 status identity mismatch');
    return { productWorkspaceId, state: 'LOCKED', working, locked };
  }

  async lock(untrustedInput: unknown, actorContext: TrustedStpLockActorContext): Promise<StpLockExecution> {
    const input = snapshot(validateStpLockRequest(untrustedInput));
    const actor = actorSnapshot(actorContext);
    return withDatabaseMutationMutex(this.#db, async () => this.#lockValidated(input, actor));
  }

  async #lockValidated(input: StpLockRequest, actor: LockActor): Promise<StpLockExecution> {
    const existing = this.#lockByWorkspace(input.productWorkspaceId);
    if (existing) return this.#verifiedLockRetry(existing, input, actor);
    const working = this.#workingByWorkspace(input.productWorkspaceId);
    if (!working) throw new FlowValidationError('B9 lock requires one existing STP working record');
    if (working.workingDigest !== input.expectedWorkingDigest) throw new StpIdentityConflictError('B9 lock expectedWorkingDigest is stale');
    const sources = await this.#verifiedSources(input.productWorkspaceId, working.b8ClearanceId);
    const verifiedWorking = await this.#readVerifiedWorkingRow(working, sources);
    const requestSha256 = lockRequestDigest(input, actor, sources);
    const lockId = this.#validUuid();
    const lockedAt = this.#now().toISOString();
    const artifact: LockedStpArtifact = {
      contractVersion: '1.0.0', lockId, state: 'LOCKED_STP', lockedAt, requestSha256,
      workingStp: { workingStpId: working.workingStpId, workingDigest: working.workingDigest, content: verifiedWorking.content },
      productWorkspace: { productWorkspaceArtifactSha256: sources.workspaceDigest, artifact: sources.workspace },
      b8Clearance: { clearanceId: sources.clearance.clearanceId, clearanceArtifactSha256: sources.clearanceDigest, state: 'READY_FOR_B9' },
      actor, requiredCapability: PRODUCT_B9_LOCK_CAPABILITY,
      policy: { policyId: PRODUCT_B9_LOCK_POLICY_ID, policyVersion: 1 },
    };
    validateLockedStpArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const concurrentLock = this.#lockByWorkspace(input.productWorkspaceId);
      if (concurrentLock) {
        const result = this.#lockRetryResult(concurrentLock, input, actor, sources);
        this.#db.exec('COMMIT');
        await this.replayLocked(result.lockId);
        return result;
      }
      const current = this.#workingByWorkspace(input.productWorkspaceId);
      if (!current || current.workingStpId !== working.workingStpId || current.workingDigest !== input.expectedWorkingDigest || current.contentJson !== working.contentJson) throw new StpIdentityConflictError('STP working record changed before lock');
      this.#assertWorkingIdentity(current, sources);
      let databaseMutations = this.#registerArtifact(stored, lockedAt);
      databaseMutations += this.#db.prepare(`INSERT INTO flow_locked_stps(
        lock_id, product_workspace_id, working_stp_id, working_digest, product_workspace_artifact_sha256,
        b8_clearance_id, b8_clearance_artifact_sha256, actor_id, role_snapshot, required_capability,
        policy_id, policy_version, request_sha256, lock_artifact_sha256, locked_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'OWNER', ?, ?, 1, ?, ?, ?)`).run(
        lockId, input.productWorkspaceId, working.workingStpId, working.workingDigest, sources.workspaceDigest,
        working.b8ClearanceId, sources.clearanceDigest, actor.actorId, PRODUCT_B9_LOCK_CAPABILITY,
        PRODUCT_B9_LOCK_POLICY_ID, requestSha256, stored.sha256, lockedAt,
      ).changes;
      const result: StpLockExecution = { lockId, lockArtifactSha256: stored.sha256, state: 'LOCKED_STP', deduplicated: false, databaseMutations };
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }
  }

  async replayLocked(lockId: string): Promise<LockedStpArtifact> {
    assertUuid(lockId);
    const row = this.#lockById(lockId);
    if (!row) throw new FlowValidationError(`Locked STP not found: ${lockId}`);
    const data = await this.#artifacts.read(row.artifactSha256);
    const manifest = this.#manifest(row.artifactSha256);
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' || manifest.relativePath !== expectedPath(row.artifactSha256) || manifest.contractVersion !== '1.0.0' || manifest.retentionStatus !== 'active') throw new StpIdentityConflictError('Locked STP artifact manifest mismatch');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
    catch (error) { throw new FlowValidationError(`Invalid locked STP JSON: ${(error as Error).message}`); }
    const artifact = validateLockedStpArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('Locked STP artifact is not canonical JSON');
    const working = this.#workingById(row.workingStpId);
    if (!working) throw new StpIdentityConflictError('Locked STP working record is missing');
    const sources = await this.#verifiedSources(row.productWorkspaceId, row.b8ClearanceId);
    const verifiedWorking = await this.#readVerifiedWorkingRow(working, sources);
    const request: StpLockRequest = { contractVersion: '1.0.0', productWorkspaceId: row.productWorkspaceId, expectedWorkingDigest: row.workingDigest };
    const actor: LockActor = { actorId: row.actorId, roleSnapshot: 'OWNER' };
    const expectedRequestSha256 = lockRequestDigest(request, actor, sources);
    const expectedArtifact: LockedStpArtifact = {
      contractVersion: '1.0.0', lockId: row.lockId, state: 'LOCKED_STP', lockedAt: row.lockedAt,
      requestSha256: expectedRequestSha256,
      workingStp: { workingStpId: working.workingStpId, workingDigest: working.workingDigest, content: verifiedWorking.content },
      productWorkspace: { productWorkspaceArtifactSha256: sources.workspaceDigest, artifact: sources.workspace },
      b8Clearance: { clearanceId: sources.clearance.clearanceId, clearanceArtifactSha256: sources.clearanceDigest, state: 'READY_FOR_B9' },
      actor, requiredCapability: PRODUCT_B9_LOCK_CAPABILITY, policy: { policyId: PRODUCT_B9_LOCK_POLICY_ID, policyVersion: 1 },
    };
    if (row.lockId !== lockId || row.productWorkspaceId !== working.productWorkspaceId || row.workingDigest !== working.workingDigest ||
        row.productWorkspaceArtifactSha256 !== sources.workspaceDigest || row.b8ClearanceId !== working.b8ClearanceId ||
        row.b8ClearanceArtifactSha256 !== sources.clearanceDigest || row.roleSnapshot !== 'OWNER' ||
        row.requiredCapability !== PRODUCT_B9_LOCK_CAPABILITY || row.policyId !== PRODUCT_B9_LOCK_POLICY_ID || row.policyVersion !== 1n ||
        row.requestSha256 !== expectedRequestSha256 || canonicalJson(artifact) !== canonicalJson(expectedArtifact)) {
      throw new StpIdentityConflictError('Locked STP does not match immutable row, working content, actor, workspace, or clearance');
    }
    return artifact;
  }

  async #verifiedLockRetry(row: LockRow, input: StpLockRequest, actor: LockActor): Promise<StpLockExecution> {
    const working = this.#workingById(row.workingStpId);
    if (!working) throw new StpIdentityConflictError('Locked STP working record is missing');
    const sources = await this.#verifiedSources(input.productWorkspaceId, row.b8ClearanceId);
    const result = this.#lockRetryResult(row, input, actor, sources);
    await this.replayLocked(result.lockId);
    return result;
  }
  #lockRetryResult(row: LockRow, input: StpLockRequest, actor: LockActor, sources: VerifiedSources): StpLockExecution {
    const expected = lockRequestDigest(input, actor, sources);
    if (row.productWorkspaceId !== input.productWorkspaceId || row.workingDigest !== input.expectedWorkingDigest ||
        row.actorId !== actor.actorId || row.roleSnapshot !== actor.roleSnapshot || row.requestSha256 !== expected ||
        row.productWorkspaceArtifactSha256 !== sources.workspaceDigest || row.b8ClearanceArtifactSha256 !== sources.clearanceDigest) {
      throw new StpIdentityConflictError('Product workspace already has a locked STP with changed digest, actor, workspace, clearance, or content');
    }
    return { lockId: row.lockId, lockArtifactSha256: row.artifactSha256, state: 'LOCKED_STP', deduplicated: true, databaseMutations: 0 };
  }

  async #verifiedSources(productWorkspaceId: string, clearanceId: string): Promise<VerifiedSources> {
    const workspace = snapshot(validateProductWorkspaceArtifact(await this.#workspaces.readVerifiedProductWorkspace(productWorkspaceId)));
    if (workspace.productWorkspaceId !== productWorkspaceId || workspace.state !== 'ACTIVE' || workspace.entryStep !== 'B8') throw new FlowValidationError('Verified product workspace has wrong identity or state');
    const clearance = snapshot(validateB8ClearanceArtifact(await this.#clearances.readVerifiedClearance(clearanceId)));
    if (clearance.clearanceId !== clearanceId || clearance.state !== 'READY_FOR_B9' || clearance.productWorkspace.productWorkspaceId !== productWorkspaceId) throw new FlowValidationError('Verified B8 clearance has wrong identity, workspace, or state');
    const workspaceDigest = digest(workspace);
    if (clearance.productWorkspace.productWorkspaceArtifactSha256 !== workspaceDigest || clearance.productWorkspace.productWorkspaceKey !== workspace.productWorkspaceKey || clearance.productWorkspace.title !== workspace.title || canonicalJson(clearance.productWorkspace.source) !== canonicalJson(workspace.source)) throw new StpIdentityConflictError('B8 clearance and product workspace lineage mismatch');
    return { workspace, workspaceDigest, clearance, clearanceDigest: digest(clearance) };
  }

  async #readVerifiedWorkingRow(row: WorkingRow, sources: VerifiedSources): Promise<StpWorkingRecord> {
    this.#assertWorkingIdentity(row, sources);
    let parsed: unknown;
    try { parsed = JSON.parse(row.contentJson); }
    catch (error) { throw new FlowValidationError(`Invalid STP working JSON: ${(error as Error).message}`); }
    const content = snapshot(validateStpContent(parsed));
    if (canonicalJson(content) !== row.contentJson || digest(content) !== row.workingDigest) throw new StpIdentityConflictError('STP working content is noncanonical or digest-mismatched');
    return { workingStpId: row.workingStpId, productWorkspaceId: row.productWorkspaceId, productWorkspaceArtifactSha256: row.productWorkspaceArtifactSha256, b8ClearanceId: row.b8ClearanceId, b8ClearanceArtifactSha256: row.b8ClearanceArtifactSha256, workingDigest: row.workingDigest, content, createdAt: row.createdAt, updatedAt: row.updatedAt };
  }
  #assertWorkingIdentity(row: WorkingRow, sources: VerifiedSources): void {
    if (row.productWorkspaceId !== sources.workspace.productWorkspaceId || row.productWorkspaceArtifactSha256 !== sources.workspaceDigest || row.b8ClearanceId !== sources.clearance.clearanceId || row.b8ClearanceArtifactSha256 !== sources.clearanceDigest) throw new StpIdentityConflictError('STP working record workspace or clearance identity mismatch');
  }
  #workingByWorkspace(value: string): WorkingRow | undefined { return this.#workingQuery('product_workspace_id=?', value); }
  #workingById(value: string): WorkingRow | undefined { return this.#workingQuery('working_stp_id=?', value); }
  #workingQuery(where: string, value: string): WorkingRow | undefined { return this.#db.prepare(`SELECT working_stp_id workingStpId, product_workspace_id productWorkspaceId, product_workspace_artifact_sha256 productWorkspaceArtifactSha256, b8_clearance_id b8ClearanceId, b8_clearance_artifact_sha256 b8ClearanceArtifactSha256, content_json contentJson, working_digest workingDigest, created_at createdAt, updated_at updatedAt FROM flow_stp_working_records WHERE ${where}`).get(value) as WorkingRow | undefined; }
  #lockByWorkspace(value: string): LockRow | undefined { return this.#lockQuery('product_workspace_id=?', value); }
  #lockById(value: string): LockRow | undefined { return this.#lockQuery('lock_id=?', value); }
  #lockQuery(where: string, value: string): LockRow | undefined { return this.#db.prepare(`SELECT lock_id lockId, product_workspace_id productWorkspaceId, working_stp_id workingStpId, working_digest workingDigest, product_workspace_artifact_sha256 productWorkspaceArtifactSha256, b8_clearance_id b8ClearanceId, b8_clearance_artifact_sha256 b8ClearanceArtifactSha256, actor_id actorId, role_snapshot roleSnapshot, required_capability requiredCapability, policy_id policyId, policy_version policyVersion, request_sha256 requestSha256, lock_artifact_sha256 artifactSha256, locked_at lockedAt FROM flow_locked_stps WHERE ${where}`).get(value) as LockRow | undefined; }
  #manifest(value: string): { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string } | undefined { return this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion,retention_status retentionStatus FROM artifact_manifests WHERE sha256=?').get(value) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string } | undefined; }
  #registerArtifact(stored: StoredArtifact, at: string): number { const result = this.#db.prepare("INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING").run(stored.sha256, stored.byteSize, stored.relativePath, at, at); const row = this.#manifest(stored.sha256); if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' || row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') throw new StpIdentityConflictError('Artifact metadata conflict'); return result.changes; }
  #validUuid(): string { const value = this.#uuid(); assertUuid(value); return value; }
}

function contentFromSave(input: StpWorkingSaveRequest): StpContent { return snapshot(validateStpContent({ segments: input.segments, primaryTargetSegmentKey: input.primaryTargetSegmentKey, ...(input.secondaryTargetSegmentKeys === undefined ? {} : { secondaryTargetSegmentKeys: input.secondaryTargetSegmentKeys }), positioningStatement: input.positioningStatement })); }
function receipt(row: WorkingRow, deduplicated: boolean): StpWorkingExecution { return { workingStpId: row.workingStpId, productWorkspaceId: row.productWorkspaceId, workingDigest: row.workingDigest, deduplicated, databaseMutations: 0 }; }
function actorSnapshot(context: TrustedStpLockActorContext): LockActor { if (!context || typeof context.actorId !== 'string' || !/^[a-z][a-z0-9:_-]{2,119}$/.test(context.actorId) || context.roleSnapshot !== 'OWNER' || !(context.capabilities instanceof Set) || !context.capabilities.has(PRODUCT_B9_LOCK_CAPABILITY)) throw new FlowValidationError('B9 lock requires trusted OWNER with governance:product-b9-lock capability'); return { actorId: context.actorId, roleSnapshot: 'OWNER' }; }
function lockRequestDigest(input: StpLockRequest, actor: LockActor, sources: VerifiedSources): string { return digest({ request: input, actor, requiredCapability: PRODUCT_B9_LOCK_CAPABILITY, policy: { policyId: PRODUCT_B9_LOCK_POLICY_ID, policyVersion: 1 }, productWorkspaceArtifactSha256: sources.workspaceDigest, b8ClearanceId: sources.clearance.clearanceId, b8ClearanceArtifactSha256: sources.clearanceDigest }); }
function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function expectedPath(value: string): string { return `sha256/${value.slice(0, 2)}/${value}`; }
function assertUuid(value: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new FlowValidationError('ID must be a UUID'); }
