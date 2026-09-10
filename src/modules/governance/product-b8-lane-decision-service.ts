import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ProductB8LaneDecision } from '../../../contracts/governance/product-b8-lane-decision.generated.js';
import type { ProductB8LaneDecisionRequest } from '../../../contracts/governance/product-b8-lane-decision-request.generated.js';
import type { ProductWorkspaceArtifact } from '../../../contracts/flow/product-workspace-artifact.generated.js';
import type { ProductWorkspaceReader } from '../flow/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { GovernanceValidationError, validateProductB8LaneDecision, validateProductB8LaneDecisionRequest } from './validation.js';

export const PRODUCT_B8_REVIEW_CAPABILITY = 'governance:product-b8-review' as const;
export const PRODUCT_B8_REVIEW_POLICY_ID = 'governance:product-b8-review-v1' as const;
export const PRODUCT_B8_LANES = ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'] as const;

export interface TrustedProductB8DecisionActorContext {
  readonly actorId: string;
  readonly roleSnapshot: string;
  readonly capabilities: ReadonlySet<string>;
}
export interface ProductB8DecisionConfiguration {
  readonly policyId: typeof PRODUCT_B8_REVIEW_POLICY_ID;
  readonly policyVersion: 1;
  readonly requiredCapability: typeof PRODUCT_B8_REVIEW_CAPABILITY;
}
export interface ProductB8DecisionExecution {
  readonly decisionId: string;
  readonly decisionArtifactSha256: string;
  readonly decisionVersion: number;
  readonly lane: ProductB8LaneDecision['lane'];
  readonly decision: ProductB8LaneDecision['decision'];
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}
export type ProductB8LaneStatus =
  | { readonly lane: ProductB8LaneDecision['lane']; readonly effectiveState: 'NO_DECISION' }
  | { readonly lane: ProductB8LaneDecision['lane']; readonly effectiveState: ProductB8LaneDecision['decision']; readonly decisionId: string; readonly decisionVersion: number };
export interface ProductB8Status {
  readonly productWorkspaceId: string;
  readonly lanes: readonly ProductB8LaneStatus[];
  readonly readyForB9: boolean;
}
export class ProductB8DecisionIdentityConflictError extends Error {}

interface Row {
  decisionId: string; productWorkspaceId: string; productWorkspaceArtifactSha256: string;
  lane: ProductB8LaneDecision['lane']; decisionVersion: bigint; decision: ProductB8LaneDecision['decision'];
  actorId: string; roleSnapshot: string; requiredCapability: string; policyId: string; policyVersion: bigint;
  requestSha256: string; artifactSha256: string; decidedAt: string;
}
type Actor = ProductB8LaneDecision['actor'];
type WorkspaceSnapshot = ProductB8LaneDecision['productWorkspace'];

export class ProductB8LaneDecisionService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #workspaces: ProductWorkspaceReader;
  readonly #config: ProductB8DecisionConfiguration;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly productWorkspaceReader: ProductWorkspaceReader;
    readonly configuration: ProductB8DecisionConfiguration;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    assertConfiguration(options.configuration);
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#workspaces = options.productWorkspaceReader;
    this.#config = Object.freeze({ ...options.configuration });
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async decide(untrustedInput: unknown, actorContext: TrustedProductB8DecisionActorContext): Promise<ProductB8DecisionExecution> {
    const input = snapshot(validateProductB8LaneDecisionRequest(untrustedInput));
    const actor = actorSnapshot(actorContext, this.#config.requiredCapability);
    const workspace = await this.#verifiedWorkspace(input.productWorkspaceId);
    const workspaceArtifactSha256 = digest(workspace);
    const requestSha256 = this.#requestDigest(input, workspaceArtifactSha256, actor);
    const consumed = this.#version(input.productWorkspaceId, input.lane, input.expectedVersion + 1);
    if (consumed) return this.#verifiedRetry(consumed, requestSha256);
    const latest = this.#latest(input.productWorkspaceId, input.lane);
    const actualVersion = latest ? Number(latest.decisionVersion) : 0;
    if (actualVersion !== input.expectedVersion) throw new ProductB8DecisionIdentityConflictError('B8 lane expectedVersion does not match the current decision version');
    if (latest?.decision === input.decision) throw new GovernanceValidationError('A new B8 lane version must change the effective decision');

    const decisionId = this.#uuid();
    assertUuid(decisionId);
    const decisionVersion = input.expectedVersion + 1;
    const decidedAt = this.#now().toISOString();
    const envelope: ProductB8LaneDecision = {
      contractVersion: '1.0.0', decisionId, decisionVersion, decidedAt,
      lane: input.lane, decision: input.decision,
      productWorkspace: workspaceSnapshot(workspace, workspaceArtifactSha256),
      actor, requiredCapability: this.#config.requiredCapability,
      policy: { policyId: this.#config.policyId, policyVersion: this.#config.policyVersion }, requestSha256,
    };
    validateProductB8LaneDecision(envelope);
    const stored = await this.#artifacts.put(bytes(envelope));
    const execute = this.#db.transaction((): ProductB8DecisionExecution => {
      const concurrent = this.#version(input.productWorkspaceId, input.lane, decisionVersion);
      if (concurrent) return this.#retryResult(concurrent, requestSha256);
      const concurrentLatest = this.#latest(input.productWorkspaceId, input.lane);
      const concurrentVersion = concurrentLatest ? Number(concurrentLatest.decisionVersion) : 0;
      if (concurrentVersion !== input.expectedVersion) throw new ProductB8DecisionIdentityConflictError('B8 lane changed concurrently');
      if (concurrentLatest?.decision === input.decision) throw new GovernanceValidationError('A new B8 lane version must change the effective decision');
      let databaseMutations = this.#registerArtifact(stored, decidedAt);
      databaseMutations += this.#db.prepare(`INSERT INTO governance_product_b8_lane_decisions(
        decision_id, product_workspace_id, product_workspace_artifact_sha256, lane, decision_version,
        decision, actor_id, role_snapshot, required_capability, policy_id, policy_version,
        request_sha256, decision_artifact_sha256, decided_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'OWNER', ?, ?, 1, ?, ?, ?)`).run(
        decisionId, input.productWorkspaceId, workspaceArtifactSha256, input.lane, decisionVersion,
        input.decision, actor.actorId, this.#config.requiredCapability, this.#config.policyId,
        requestSha256, stored.sha256, decidedAt,
      ).changes;
      return { decisionId, decisionArtifactSha256: stored.sha256, decisionVersion, lane: input.lane, decision: input.decision, deduplicated: false, databaseMutations };
    });
    const result = execute();
    if (result.deduplicated) await this.replay(result.decisionId);
    return result;
  }

  async replay(decisionId: string): Promise<ProductB8LaneDecision> {
    assertUuid(decisionId);
    const row = this.#byId(decisionId);
    if (!row) throw new GovernanceValidationError(`B8 lane decision not found: ${decisionId}`);
    const data = await this.#artifacts.read(row.artifactSha256);
    const manifest = this.#db.prepare('SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion FROM artifact_manifests WHERE sha256=?').get(row.artifactSha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' || manifest.relativePath !== expectedPath(row.artifactSha256) || manifest.contractVersion !== '1.0.0') throw new ProductB8DecisionIdentityConflictError('B8 decision artifact manifest mismatch');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
    catch (error) { throw new GovernanceValidationError(`Invalid B8 decision JSON: ${(error as Error).message}`); }
    const envelope = validateProductB8LaneDecision(parsed);
    if (!data.equals(bytes(envelope))) throw new GovernanceValidationError('B8 lane decision is not canonical JSON');
    const workspace = await this.#verifiedWorkspace(row.productWorkspaceId);
    const workspaceArtifactSha256 = digest(workspace);
    const request: ProductB8LaneDecisionRequest = { contractVersion: '1.0.0', productWorkspaceId: row.productWorkspaceId, lane: row.lane, expectedVersion: Number(row.decisionVersion) - 1, decision: row.decision };
    const expectedRequest = this.#requestDigest(request, workspaceArtifactSha256, envelope.actor);
    if (envelope.decisionId !== decisionId || envelope.decisionVersion !== Number(row.decisionVersion) || envelope.decidedAt !== row.decidedAt ||
        envelope.lane !== row.lane || envelope.decision !== row.decision || row.productWorkspaceArtifactSha256 !== workspaceArtifactSha256 ||
        canonicalJson(envelope.productWorkspace) !== canonicalJson(workspaceSnapshot(workspace, workspaceArtifactSha256)) ||
        envelope.actor.actorId !== row.actorId || envelope.actor.roleSnapshot !== row.roleSnapshot || row.roleSnapshot !== 'OWNER' ||
        envelope.requiredCapability !== row.requiredCapability || row.requiredCapability !== PRODUCT_B8_REVIEW_CAPABILITY ||
        envelope.policy.policyId !== row.policyId || row.policyId !== PRODUCT_B8_REVIEW_POLICY_ID || BigInt(envelope.policy.policyVersion) !== row.policyVersion || row.policyVersion !== 1n ||
        envelope.requestSha256 !== row.requestSha256 || expectedRequest !== row.requestSha256) {
      throw new ProductB8DecisionIdentityConflictError('B8 decision does not match immutable row, artifact, manifest, or verified workspace identity');
    }
    return envelope;
  }

  async readStatus(productWorkspaceId: string): Promise<ProductB8Status> {
    await this.#verifiedWorkspace(productWorkspaceId);
    const lanes: ProductB8LaneStatus[] = [];
    for (const lane of PRODUCT_B8_LANES) {
      const row = this.#latest(productWorkspaceId, lane);
      if (!row) { lanes.push({ lane, effectiveState: 'NO_DECISION' }); continue; }
      const decision = await this.replay(row.decisionId);
      lanes.push({ lane, effectiveState: decision.decision, decisionId: decision.decisionId, decisionVersion: decision.decisionVersion });
    }
    return { productWorkspaceId, lanes, readyForB9: lanes.every((lane) => lane.effectiveState === 'PASS') };
  }

  async #verifiedWorkspace(productWorkspaceId: string): Promise<ProductWorkspaceArtifact> {
    const workspace = snapshot(await this.#workspaces.readVerifiedProductWorkspace(productWorkspaceId));
    if (workspace.productWorkspaceId !== productWorkspaceId) throw new ProductB8DecisionIdentityConflictError('Verified ProductWorkspaceReader returned the wrong workspace');
    if (workspace.state !== 'ACTIVE' || workspace.entryStep !== 'B8') throw new GovernanceValidationError('B8 review requires an ACTIVE product workspace at entryStep B8');
    return workspace;
  }
  #requestDigest(input: ProductB8LaneDecisionRequest, productWorkspaceArtifactSha256: string, actor: Actor): string {
    return digest({ request: input, productWorkspaceArtifactSha256, actor, requiredCapability: this.#config.requiredCapability, policy: { policyId: this.#config.policyId, policyVersion: this.#config.policyVersion } });
  }
  async #verifiedRetry(row: Row, requestSha256: string): Promise<ProductB8DecisionExecution> { const result = this.#retryResult(row, requestSha256); await this.replay(row.decisionId); return result; }
  #retryResult(row: Row, requestSha256: string): ProductB8DecisionExecution {
    if (row.requestSha256 !== requestSha256) throw new ProductB8DecisionIdentityConflictError('B8 lane decision version already exists with changed request, actor, policy, or workspace identity');
    return { decisionId: row.decisionId, decisionArtifactSha256: row.artifactSha256, decisionVersion: Number(row.decisionVersion), lane: row.lane, decision: row.decision, deduplicated: true, databaseMutations: 0 };
  }
  #version(productWorkspaceId: string, lane: string, decisionVersion: number): Row | undefined { return this.#query('product_workspace_id=? AND lane=? AND decision_version=?', productWorkspaceId, lane, decisionVersion); }
  #latest(productWorkspaceId: string, lane: string): Row | undefined { return this.#query('product_workspace_id=? AND lane=? ORDER BY decision_version DESC LIMIT 1', productWorkspaceId, lane); }
  #byId(decisionId: string): Row | undefined { return this.#query('decision_id=?', decisionId); }
  #query(where: string, ...values: unknown[]): Row | undefined { return this.#db.prepare(`SELECT decision_id decisionId, product_workspace_id productWorkspaceId, product_workspace_artifact_sha256 productWorkspaceArtifactSha256, lane, decision_version decisionVersion, decision, actor_id actorId, role_snapshot roleSnapshot, required_capability requiredCapability, policy_id policyId, policy_version policyVersion, request_sha256 requestSha256, decision_artifact_sha256 artifactSha256, decided_at decidedAt FROM governance_product_b8_lane_decisions WHERE ${where}`).get(...values) as Row | undefined; }
  #registerArtifact(stored: StoredArtifact, at: string): number { const result = this.#db.prepare("INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING").run(stored.sha256, stored.byteSize, stored.relativePath, at, at); const row = this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string }; if (row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' || row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0') throw new ProductB8DecisionIdentityConflictError('Artifact metadata conflict'); return result.changes; }
}

function workspaceSnapshot(workspace: ProductWorkspaceArtifact, artifactSha256: string): WorkspaceSnapshot { return { productWorkspaceId: workspace.productWorkspaceId, productWorkspaceArtifactSha256: artifactSha256, productWorkspaceKey: workspace.productWorkspaceKey, state: workspace.state, entryStep: workspace.entryStep, title: workspace.title, source: workspace.source }; }
function actorSnapshot(context: TrustedProductB8DecisionActorContext, capability: string): Actor {
  if (!context || typeof context !== 'object') throw new GovernanceValidationError('Trusted actor context is required');
  if (typeof context.actorId !== 'string' || !/^[a-z][a-z0-9:_-]{2,119}$/.test(context.actorId)) throw new GovernanceValidationError('Invalid trusted actor ID');
  if (!(context.capabilities instanceof Set)) throw new GovernanceValidationError('Trusted actor capabilities must be an application-verified Set');
  for (const value of context.capabilities) if (typeof value !== 'string' || value.length < 1 || value.length > 120 || value.trim() !== value) throw new GovernanceValidationError('Invalid trusted actor capability');
  if (!context.capabilities.has(capability)) throw new GovernanceValidationError(`Trusted actor lacks ${capability}`);
  if (context.roleSnapshot !== 'OWNER') throw new GovernanceValidationError('Product B8 review is owner-only; roleSnapshot must be OWNER');
  return Object.freeze({ actorId: context.actorId, roleSnapshot: 'OWNER' });
}
function assertConfiguration(config: ProductB8DecisionConfiguration): void { if (config.policyId !== PRODUCT_B8_REVIEW_POLICY_ID || config.requiredCapability !== PRODUCT_B8_REVIEW_CAPABILITY || config.policyVersion !== 1) throw new TypeError('Invalid B8 review configuration'); }
function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function expectedPath(value: string): string { return `sha256/${value.slice(0, 2)}/${value}`; }
function assertUuid(value: string): void { if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) throw new GovernanceValidationError('ID must be a UUID'); }
