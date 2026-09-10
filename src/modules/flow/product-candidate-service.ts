import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ProductCandidateCreateRequest } from '../../../contracts/flow/product-candidate-create-request.generated.js';
import type { ProductCandidateArtifact } from '../../../contracts/flow/product-candidate-artifact.generated.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import {
  FlowValidationError,
  validateProductCandidateArtifact,
  validateProductCandidateCreateRequest,
  validateProductCandidateRevisionRequest,
} from './validation.js';

export class ProductCandidateIdentityConflictError extends Error {}

export interface ProductCandidateExecution {
  readonly candidateId: string;
  readonly candidateArtifactSha256: string;
  readonly state: 'EXPLORING';
  readonly version: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

interface CandidateRow {
  candidateId: string;
  workspaceId: string;
  candidateKey: string;
  state: string;
  version: bigint;
  label: string;
  summary: string | null;
  requestSha256: string;
  artifactSha256: string;
  createdAt: string;
}

export class ProductCandidateService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createCandidate(untrustedInput: unknown): Promise<ProductCandidateExecution> {
    const input = snapshot(validateProductCandidateCreateRequest(untrustedInput));
    if (!this.#workspaceExists(input.workspaceId)) {
      throw new FlowValidationError(`Discovery workspace not found: ${input.workspaceId}`);
    }
    const requestSha256 = digest(input);
    const existing = this.#candidateByKey(input.workspaceId, input.candidateKey);
    if (existing) {
      const versionOne = this.#candidateVersion(existing.candidateId, 1);
      if (!versionOne) throw new ProductCandidateIdentityConflictError('Candidate is missing version 1');
      const result = this.#createRetry(input, requestSha256, versionOne);
      await this.readCandidate(result.candidateId, 1);
      return result;
    }

    const candidateId = this.#validUuid();
    const createdAt = this.#now().toISOString();
    const artifact = candidateArtifact(candidateId, input.workspaceId, input.candidateKey, 1, input.label, input.summary, createdAt, requestSha256);
    validateProductCandidateArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): ProductCandidateExecution => {
      if (!this.#workspaceExists(input.workspaceId)) throw new FlowValidationError(`Discovery workspace not found: ${input.workspaceId}`);
      const concurrent = this.#candidateByKey(input.workspaceId, input.candidateKey);
      if (concurrent) {
        const versionOne = this.#candidateVersion(concurrent.candidateId, 1);
        if (!versionOne) throw new ProductCandidateIdentityConflictError('Candidate is missing version 1');
        return this.#createRetry(input, requestSha256, versionOne);
      }
      let databaseMutations = this.#registerArtifact(stored, createdAt);
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_product_candidates(candidate_id, workspace_id, candidate_key, state, created_at)
        VALUES (?, ?, ?, 'EXPLORING', ?)
      `).run(candidateId, input.workspaceId, input.candidateKey, createdAt).changes;
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_product_candidate_revisions(
          candidate_id, version, label, summary, request_sha256, candidate_artifact_sha256, created_at
        ) VALUES (?, 1, ?, ?, ?, ?, ?)
      `).run(candidateId, input.label, input.summary ?? null, requestSha256, stored.sha256, createdAt).changes;
      return { candidateId, candidateArtifactSha256: stored.sha256, state: 'EXPLORING', version: 1, deduplicated: false, databaseMutations };
    });

    const result = execute();
    if (result.deduplicated) await this.readCandidate(result.candidateId, 1);
    return result;
  }

  async reviseCandidate(untrustedInput: unknown): Promise<ProductCandidateExecution> {
    const input = snapshot(validateProductCandidateRevisionRequest(untrustedInput));
    const requestSha256 = digest(input);
    const current = this.#candidateById(input.candidateId);
    if (!current) throw new FlowValidationError(`Product candidate not found: ${input.candidateId}`);
    const targetVersion = input.expectedVersion + 1;
    const existingTarget = this.#candidateVersion(input.candidateId, targetVersion);
    if (existingTarget) {
      const result = this.#revisionRetry(input, requestSha256, existingTarget);
      await this.readCandidate(input.candidateId, targetVersion);
      return result;
    }
    if (Number(current.version) !== input.expectedVersion) {
      throw new ProductCandidateIdentityConflictError('Candidate revision version or content drift');
    }

    const createdAt = this.#now().toISOString();
    const artifact = candidateArtifact(
      current.candidateId,
      current.workspaceId,
      current.candidateKey,
      targetVersion,
      input.label,
      input.summary,
      createdAt,
      requestSha256,
    );
    validateProductCandidateArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): ProductCandidateExecution => {
      const concurrent = this.#candidateById(input.candidateId);
      if (!concurrent) throw new FlowValidationError(`Product candidate not found: ${input.candidateId}`);
      const concurrentTarget = this.#candidateVersion(input.candidateId, targetVersion);
      if (concurrentTarget) return this.#revisionRetry(input, requestSha256, concurrentTarget);
      if (Number(concurrent.version) !== input.expectedVersion) {
        throw new ProductCandidateIdentityConflictError('Candidate revision version or content drift');
      }
      let databaseMutations = this.#registerArtifact(stored, createdAt);
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_product_candidate_revisions(
          candidate_id, version, label, summary, request_sha256, candidate_artifact_sha256, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(input.candidateId, targetVersion, input.label, input.summary ?? null, requestSha256, stored.sha256, createdAt).changes;
      return { candidateId: input.candidateId, candidateArtifactSha256: stored.sha256, state: 'EXPLORING', version: targetVersion, deduplicated: false, databaseMutations };
    });

    const result = execute();
    if (result.deduplicated) await this.readCandidate(result.candidateId, result.version);
    return result;
  }

  async readCandidate(candidateId: string, version?: number): Promise<ProductCandidateArtifact> {
    assertUuid(candidateId);
    const row = version === undefined ? this.#candidateById(candidateId) : this.#candidateVersion(candidateId, version);
    if (!row) throw new FlowValidationError(`Product candidate revision not found: ${candidateId}`);
    const artifact = await this.#readArtifact(row.artifactSha256);
    const ownerRequest = artifact.version === 1
      ? validateProductCandidateCreateRequest({
          contractVersion: '1.0.0', workspaceId: artifact.workspaceId, candidateKey: artifact.candidateKey,
          label: artifact.label, ...(artifact.summary === undefined ? {} : { summary: artifact.summary }),
        })
      : validateProductCandidateRevisionRequest({
          contractVersion: '1.0.0', candidateId: artifact.candidateId, expectedVersion: artifact.version - 1,
          label: artifact.label, ...(artifact.summary === undefined ? {} : { summary: artifact.summary }),
        });
    if (
      digest(ownerRequest) !== artifact.requestSha256 ||
      artifact.candidateId !== row.candidateId ||
      artifact.workspaceId !== row.workspaceId ||
      artifact.candidateKey !== row.candidateKey ||
      artifact.state !== row.state ||
      BigInt(artifact.version) !== row.version ||
      artifact.label !== row.label ||
      (artifact.summary ?? null) !== row.summary ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new ProductCandidateIdentityConflictError('Candidate artifact does not match immutable metadata');
    return artifact;
  }

  #createRetry(input: ProductCandidateCreateRequest, requestSha256: string, row: CandidateRow): ProductCandidateExecution {
    if (
      row.version !== 1n ||
      row.workspaceId !== input.workspaceId ||
      row.candidateKey !== input.candidateKey ||
      row.requestSha256 !== requestSha256 ||
      row.label !== input.label ||
      row.summary !== (input.summary ?? null)
    ) throw new ProductCandidateIdentityConflictError('Workspace candidate key already exists with changed content');
    return receipt(row, true);
  }

  #revisionRetry(
    input: { readonly candidateId: string; readonly label: string; readonly summary?: string },
    requestSha256: string,
    row: CandidateRow,
  ): ProductCandidateExecution {
    if (
      row.candidateId !== input.candidateId ||
      row.requestSha256 !== requestSha256 ||
      row.label !== input.label ||
      row.summary !== (input.summary ?? null)
    ) throw new ProductCandidateIdentityConflictError('Candidate revision version or content drift');
    return receipt(row, true);
  }

  #workspaceExists(workspaceId: string): boolean {
    return this.#db.prepare('SELECT 1 FROM flow_discovery_workspaces WHERE workspace_id = ?').get(workspaceId) !== undefined;
  }

  #candidateByKey(workspaceId: string, candidateKey: string): CandidateRow | undefined {
    return this.#candidateQuery('c.workspace_id = ? AND c.candidate_key = ?', workspaceId, candidateKey);
  }

  #candidateById(candidateId: string): CandidateRow | undefined {
    return this.#candidateQuery('c.candidate_id = ?', candidateId);
  }

  #candidateVersion(candidateId: string, version: number): CandidateRow | undefined {
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive safe integer');
    return this.#candidateQuery('c.candidate_id = ? AND r.version = ?', candidateId, version);
  }

  #candidateQuery(where: string, ...values: unknown[]): CandidateRow | undefined {
    return this.#db.prepare(`
      SELECT c.candidate_id candidateId, c.workspace_id workspaceId, c.candidate_key candidateKey,
             c.state, r.version, r.label, r.summary, r.request_sha256 requestSha256,
             r.candidate_artifact_sha256 artifactSha256, r.created_at createdAt
      FROM flow_product_candidates c
      JOIN flow_product_candidate_revisions r ON r.candidate_id = c.candidate_id
      WHERE ${where}
      ORDER BY r.version DESC LIMIT 1
    `).get(...values) as CandidateRow | undefined;
  }

  #registerArtifact(stored: StoredArtifact, acquiredAt: string): number {
    const changes = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, stored.relativePath, acquiredAt, acquiredAt);
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion
      FROM artifact_manifests WHERE sha256 = ?
    `).get(stored.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string };
    if (
      row.byteSize !== BigInt(stored.byteSize) ||
      row.mediaType !== 'application/json' ||
      row.relativePath !== stored.relativePath ||
      row.contractVersion !== '1.0.0'
    ) throw new ProductCandidateIdentityConflictError('Artifact metadata conflict');
    return changes.changes;
  }

  async #readArtifact(sha256: string): Promise<ProductCandidateArtifact> {
    const manifest = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath, contract_version contractVersion
      FROM artifact_manifests WHERE sha256 = ?
    `).get(sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    const data = await this.#artifacts.read(sha256);
    if (
      !manifest ||
      manifest.byteSize !== BigInt(data.byteLength) ||
      manifest.mediaType !== 'application/json' ||
      manifest.relativePath !== `sha256/${sha256.slice(0, 2)}/${sha256}` ||
      manifest.contractVersion !== '1.0.0'
    ) throw new ProductCandidateIdentityConflictError('Artifact manifest metadata mismatch');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    } catch (error) {
      throw new FlowValidationError(`Invalid artifact JSON: ${(error as Error).message}`);
    }
    const artifact = validateProductCandidateArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('Artifact is not canonical JSON');
    return artifact;
  }

  #validUuid(): string {
    const value = this.#uuid();
    assertUuid(value);
    return value;
  }
}

function candidateArtifact(
  candidateId: string,
  workspaceId: string,
  candidateKey: string,
  version: number,
  label: string,
  summary: string | undefined,
  createdAt: string,
  requestSha256: string,
): ProductCandidateArtifact {
  return {
    contractVersion: '1.0.0', candidateId, workspaceId, candidateKey, state: 'EXPLORING', version, label,
    ...(summary === undefined ? {} : { summary }), createdAt, requestSha256,
  };
}

function receipt(row: CandidateRow, deduplicated: boolean): ProductCandidateExecution {
  return {
    candidateId: row.candidateId,
    candidateArtifactSha256: row.artifactSha256,
    state: 'EXPLORING',
    version: Number(row.version),
    deduplicated,
    databaseMutations: 0,
  };
}

function snapshot<T>(value: T): T {
  return JSON.parse(canonicalJson(value)) as T;
}

function bytes(value: unknown): Buffer {
  return Buffer.from(canonicalJson(value), 'utf8');
}

function digest(value: unknown): string {
  return createHash('sha256').update(bytes(value)).digest('hex');
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new FlowValidationError('ID must be a UUID');
  }
}
