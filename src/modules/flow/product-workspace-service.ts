import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ProductWorkspaceCreateRequest } from '../../../contracts/flow/product-workspace-create-request.generated.js';
import type { ProductWorkspaceArtifact } from '../../../contracts/flow/product-workspace-artifact.generated.js';
import type { CandidateB7Decision } from '../../../contracts/governance/candidate-b7-decision.generated.js';
import type { CandidateB7DecisionByIdReader } from '../governance/index.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import {
  FlowValidationError,
  validateProductWorkspaceArtifact,
  validateProductWorkspaceCreateRequest,
  validateSourceCandidateB7Decision,
} from './validation.js';

export class ProductWorkspaceIdentityConflictError extends Error {}

export interface ProductWorkspaceExecution {
  readonly productWorkspaceId: string;
  readonly productWorkspaceArtifactSha256: string;
  readonly state: 'ACTIVE';
  readonly entryStep: 'B8';
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

type SourceSnapshot = ProductWorkspaceArtifact['source'];
type Row = {
  productWorkspaceId: string;
  productWorkspaceKey: string;
  state: string;
  entryStep: string;
  title: string;
  sourceWorkspaceId: string;
  sourceBasketId: string;
  sourceBasketArtifactSha256: string;
  sourceBasketKey: string;
  sourceBasketVersion: bigint;
  sourceCandidateId: string;
  sourceCandidateVersion: bigint;
  sourceCandidateArtifactSha256: string;
  sourceCandidateKey: string;
  sourceCandidateLabel: string;
  sourceCandidateState: string;
  sourceB7DecisionId: string;
  sourceB7DecisionArtifactSha256: string;
  sourceB7DecidedAt: string;
  sourceB7Decision: string;
  sourceActorId: string;
  sourceRoleSnapshot: string;
  sourceRequiredCapability: string;
  sourcePolicyId: string;
  sourcePolicyVersion: bigint;
  sourceB7RequestSha256: string;
  requestSha256: string;
  artifactSha256: string;
  createdAt: string;
};

type VerifiedPass = {
  readonly decision: CandidateB7Decision;
  readonly decisionArtifactSha256: string;
  readonly source: SourceSnapshot;
};

export class ProductWorkspaceService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #decisions: CandidateB7DecisionByIdReader;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly decisionReader: CandidateB7DecisionByIdReader;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#decisions = options.decisionReader;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createWorkspace(untrustedInput: unknown): Promise<ProductWorkspaceExecution> {
    const input = snapshot(validateProductWorkspaceCreateRequest(untrustedInput));
    const verified = await this.#verifiedPass(input.decisionId);
    const requestSha256 = digest(input);
    const byKey = this.#byKey(input.productWorkspaceKey);
    const byDecision = this.#byDecision(input.decisionId);
    if (byKey || byDecision) return this.#verifiedRetry(input, verified, requestSha256, byKey, byDecision);

    const productWorkspaceId = this.#validUuid();
    const createdAt = this.#now().toISOString();
    const artifact: ProductWorkspaceArtifact = {
      contractVersion: '1.0.0',
      productWorkspaceId,
      productWorkspaceKey: input.productWorkspaceKey,
      state: 'ACTIVE',
      entryStep: 'B8',
      title: verified.decision.candidate.label,
      createdAt,
      requestSha256,
      source: verified.source,
    };
    validateProductWorkspaceArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): ProductWorkspaceExecution => {
      const concurrentByKey = this.#byKey(input.productWorkspaceKey);
      const concurrentByDecision = this.#byDecision(input.decisionId);
      if (concurrentByKey || concurrentByDecision) {
        return this.#retryResult(input, verified, requestSha256, concurrentByKey, concurrentByDecision);
      }
      let databaseMutations = this.#registerArtifact(stored, createdAt);
      const source = verified.source;
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_product_workspaces(
          product_workspace_id, product_workspace_key, state, entry_step, title,
          source_workspace_id, source_basket_id, source_basket_artifact_sha256, source_basket_key,
          source_basket_version, source_candidate_id, source_candidate_version,
          source_candidate_artifact_sha256, source_candidate_key, source_candidate_label,
          source_candidate_state, source_b7_decision_id, source_b7_decision_artifact_sha256,
          source_b7_decided_at, source_b7_decision, source_actor_id, source_role_snapshot,
          source_required_capability, source_policy_id, source_policy_version, source_b7_request_sha256,
          request_sha256, product_workspace_artifact_sha256, created_at
        ) VALUES (?, ?, 'ACTIVE', 'B8', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'EXPLORING', ?, ?, ?, 'PASS', ?, 'OWNER', ?, ?, ?, ?, ?, ?, ?)
      `).run(
        productWorkspaceId, input.productWorkspaceKey, verified.decision.candidate.label,
        source.discoveryWorkspace.workspaceId, source.basket.basketId, source.basket.basketArtifactSha256,
        source.basket.basketKey, source.basket.basketVersion, source.candidate.candidateId,
        source.candidate.candidateVersion, source.candidate.candidateArtifactSha256,
        source.candidate.candidateKey, source.candidate.label, source.b7Decision.decisionId,
        source.b7Decision.decisionArtifactSha256, source.b7Decision.decidedAt,
        source.b7Decision.actor.actorId, source.b7Decision.requiredCapability,
        source.b7Decision.policy.policyId, source.b7Decision.policy.policyVersion,
        source.b7Decision.requestSha256, requestSha256, stored.sha256, createdAt,
      ).changes;
      return {
        productWorkspaceId, productWorkspaceArtifactSha256: stored.sha256,
        state: 'ACTIVE', entryStep: 'B8', deduplicated: false, databaseMutations,
      };
    });

    const result = execute();
    if (result.deduplicated) await this.replay(result.productWorkspaceId);
    return result;
  }

  async replay(productWorkspaceId: string): Promise<ProductWorkspaceArtifact> {
    assertUuid(productWorkspaceId);
    const row = this.#byId(productWorkspaceId);
    if (!row) throw new FlowValidationError(`Product workspace not found: ${productWorkspaceId}`);
    const data = await this.#artifacts.read(row.artifactSha256);
    const manifest = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion FROM artifact_manifests WHERE sha256 = ?
    `).get(row.artifactSha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!manifest || manifest.byteSize !== BigInt(data.byteLength) || manifest.mediaType !== 'application/json' ||
        manifest.relativePath !== expectedPath(row.artifactSha256) || manifest.contractVersion !== '1.0.0') {
      throw new ProductWorkspaceIdentityConflictError('Product workspace artifact manifest mismatch');
    }
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data)); }
    catch (error) { throw new FlowValidationError(`Invalid product workspace JSON: ${(error as Error).message}`); }
    const artifact = validateProductWorkspaceArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('Product workspace is not canonical JSON');

    const verified = await this.#verifiedPass(row.sourceB7DecisionId);
    const request: ProductWorkspaceCreateRequest = {
      contractVersion: artifact.contractVersion,
      decisionId: artifact.source.b7Decision.decisionId,
      productWorkspaceKey: artifact.productWorkspaceKey,
    };
    const expectedRequestSha256 = digest(validateProductWorkspaceCreateRequest(request));
    if (
      artifact.productWorkspaceId !== row.productWorkspaceId || artifact.productWorkspaceId !== productWorkspaceId ||
      artifact.productWorkspaceKey !== row.productWorkspaceKey || artifact.state !== row.state || artifact.state !== 'ACTIVE' ||
      artifact.entryStep !== row.entryStep || artifact.entryStep !== 'B8' || artifact.title !== row.title ||
      artifact.createdAt !== row.createdAt || artifact.requestSha256 !== row.requestSha256 ||
      expectedRequestSha256 !== row.requestSha256 || canonicalJson(artifact.source) !== canonicalJson(verified.source) ||
      !rowMatchesSource(row, artifact.source)
    ) throw new ProductWorkspaceIdentityConflictError('Product workspace does not match immutable metadata or verified B7 PASS');
    return artifact;
  }

  async #verifiedPass(decisionId: string): Promise<VerifiedPass> {
    const untrusted: unknown = await this.#decisions.readVerifiedDecision(decisionId);
    const decision = snapshot(validateSourceCandidateB7Decision(untrusted));
    if (decision.decisionId !== decisionId) throw new FlowValidationError('Verified B7 decision reader returned the wrong decision');
    if (decision.decision !== 'PASS') throw new FlowValidationError('Exact verified B7 decision must be PASS');
    if (decision.actor.roleSnapshot !== 'OWNER' || decision.requiredCapability !== 'governance:candidate-b7-review' ||
        decision.policy.policyId !== 'governance:candidate-b7-review-v1' || decision.policy.policyVersion !== 1 ||
        decision.candidate.state !== 'EXPLORING' || decision.basket.workspaceId.length !== 36) {
      throw new FlowValidationError('Verified B7 PASS has invalid authorization or frozen source identity');
    }
    const decisionArtifactSha256 = digest(decision);
    const source: SourceSnapshot = {
      discoveryWorkspace: { workspaceId: decision.basket.workspaceId },
      basket: { ...decision.basket },
      candidate: { ...decision.candidate },
      b7Decision: {
        contractVersion: decision.contractVersion,
        decisionId: decision.decisionId,
        decisionArtifactSha256,
        decidedAt: decision.decidedAt,
        decision: 'PASS',
        actor: { ...decision.actor },
        requiredCapability: decision.requiredCapability,
        policy: { ...decision.policy },
        requestSha256: decision.requestSha256,
      },
    };
    validateProductWorkspaceArtifact({
      contractVersion: '1.0.0', productWorkspaceId: '00000000-0000-4000-8000-000000000000',
      productWorkspaceKey: 'validation-only', state: 'ACTIVE', entryStep: 'B8', title: decision.candidate.label,
      createdAt: '2026-01-01T00:00:00.000Z', requestSha256: '0'.repeat(64), source,
    });
    return { decision, decisionArtifactSha256, source };
  }

  async #verifiedRetry(input: ProductWorkspaceCreateRequest, verified: VerifiedPass, requestSha256: string, byKey: Row | undefined, byDecision: Row | undefined): Promise<ProductWorkspaceExecution> {
    const result = this.#retryResult(input, verified, requestSha256, byKey, byDecision);
    await this.replay(result.productWorkspaceId);
    return result;
  }

  #retryResult(input: ProductWorkspaceCreateRequest, verified: VerifiedPass, requestSha256: string, byKey: Row | undefined, byDecision: Row | undefined): ProductWorkspaceExecution {
    if (!byKey || !byDecision || byKey.productWorkspaceId !== byDecision.productWorkspaceId ||
        byKey.productWorkspaceKey !== input.productWorkspaceKey || byKey.sourceB7DecisionId !== input.decisionId ||
        byKey.sourceB7DecisionArtifactSha256 !== verified.decisionArtifactSha256 ||
        byKey.requestSha256 !== requestSha256 || !rowMatchesSource(byKey, verified.source)) {
      throw new ProductWorkspaceIdentityConflictError('Product workspace key or B7 PASS already exists with changed identity');
    }
    return {
      productWorkspaceId: byKey.productWorkspaceId,
      productWorkspaceArtifactSha256: byKey.artifactSha256,
      state: 'ACTIVE', entryStep: 'B8', deduplicated: true, databaseMutations: 0,
    };
  }

  #byKey(value: string): Row | undefined { return this.#query('product_workspace_key = ?', value); }
  #byDecision(value: string): Row | undefined { return this.#query('source_b7_decision_id = ?', value); }
  #byId(value: string): Row | undefined { return this.#query('product_workspace_id = ?', value); }
  #query(where: string, value: string): Row | undefined {
    return this.#db.prepare(`
      SELECT product_workspace_id productWorkspaceId, product_workspace_key productWorkspaceKey,
        state, entry_step entryStep, title, source_workspace_id sourceWorkspaceId,
        source_basket_id sourceBasketId, source_basket_artifact_sha256 sourceBasketArtifactSha256,
        source_basket_key sourceBasketKey, source_basket_version sourceBasketVersion,
        source_candidate_id sourceCandidateId, source_candidate_version sourceCandidateVersion,
        source_candidate_artifact_sha256 sourceCandidateArtifactSha256,
        source_candidate_key sourceCandidateKey, source_candidate_label sourceCandidateLabel,
        source_candidate_state sourceCandidateState, source_b7_decision_id sourceB7DecisionId,
        source_b7_decision_artifact_sha256 sourceB7DecisionArtifactSha256,
        source_b7_decided_at sourceB7DecidedAt, source_b7_decision sourceB7Decision,
        source_actor_id sourceActorId, source_role_snapshot sourceRoleSnapshot,
        source_required_capability sourceRequiredCapability, source_policy_id sourcePolicyId,
        source_policy_version sourcePolicyVersion, source_b7_request_sha256 sourceB7RequestSha256,
        request_sha256 requestSha256, product_workspace_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_product_workspaces WHERE ${where}
    `).get(value) as Row | undefined;
  }

  #registerArtifact(stored: StoredArtifact, acquiredAt: string): number {
    const result = this.#db.prepare(`
      INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at)
      VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, stored.relativePath, acquiredAt, acquiredAt);
    const row = this.#db.prepare(`SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
      contract_version contractVersion FROM artifact_manifests WHERE sha256 = ?`).get(stored.sha256) as
      { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
    if (row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== 'application/json' ||
        row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0') {
      throw new ProductWorkspaceIdentityConflictError('Product workspace artifact metadata conflict');
    }
    return result.changes;
  }

  #validUuid(): string { const value = this.#uuid(); assertUuid(value); return value; }
}

function rowMatchesSource(row: Row, source: SourceSnapshot): boolean {
  return row.sourceWorkspaceId === source.discoveryWorkspace.workspaceId &&
    row.sourceWorkspaceId === source.basket.workspaceId && row.sourceBasketId === source.basket.basketId &&
    row.sourceBasketArtifactSha256 === source.basket.basketArtifactSha256 && row.sourceBasketKey === source.basket.basketKey &&
    row.sourceBasketVersion === BigInt(source.basket.basketVersion) && row.sourceCandidateId === source.candidate.candidateId &&
    row.sourceCandidateVersion === BigInt(source.candidate.candidateVersion) &&
    row.sourceCandidateArtifactSha256 === source.candidate.candidateArtifactSha256 &&
    row.sourceCandidateKey === source.candidate.candidateKey && row.sourceCandidateLabel === source.candidate.label &&
    row.sourceCandidateState === source.candidate.state && row.sourceB7DecisionId === source.b7Decision.decisionId &&
    row.sourceB7DecisionArtifactSha256 === source.b7Decision.decisionArtifactSha256 &&
    row.sourceB7DecidedAt === source.b7Decision.decidedAt && row.sourceB7Decision === source.b7Decision.decision &&
    row.sourceActorId === source.b7Decision.actor.actorId && row.sourceRoleSnapshot === source.b7Decision.actor.roleSnapshot &&
    row.sourceRequiredCapability === source.b7Decision.requiredCapability && row.sourcePolicyId === source.b7Decision.policy.policyId &&
    row.sourcePolicyVersion === BigInt(source.b7Decision.policy.policyVersion) &&
    row.sourceB7RequestSha256 === source.b7Decision.requestSha256;
}

function snapshot<T>(value: T): T { return JSON.parse(canonicalJson(value)) as T; }
function bytes(value: unknown): Buffer { return Buffer.from(canonicalJson(value), 'utf8'); }
function digest(value: unknown): string { return createHash('sha256').update(bytes(value)).digest('hex'); }
function expectedPath(value: string): string { return `sha256/${value.slice(0, 2)}/${value}`; }
function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new FlowValidationError('ID must be a UUID');
  }
}
