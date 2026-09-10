import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DiscoveryWorkspaceRequest } from '../../../contracts/flow/discovery-workspace-request.generated.js';
import type { DiscoveryWorkspaceArtifact } from '../../../contracts/flow/discovery-workspace-artifact.generated.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import {
  FlowValidationError,
  validateDiscoveryWorkspaceArtifact,
  validateDiscoveryWorkspaceRequest,
} from './validation.js';

export class DiscoveryWorkspaceIdentityConflictError extends Error {}

export interface DiscoveryWorkspaceExecution {
  readonly workspaceId: string;
  readonly workspaceArtifactSha256: string;
  readonly state: 'ACTIVE';
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

interface WorkspaceRow {
  workspaceId: string;
  workspaceKey: string;
  state: string;
  title: string;
  description: string | null;
  requestSha256: string;
  artifactSha256: string;
  createdAt: string;
}

export class DiscoveryWorkspaceService {
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

  async createWorkspace(untrustedInput: unknown): Promise<DiscoveryWorkspaceExecution> {
    const input = snapshot(validateDiscoveryWorkspaceRequest(untrustedInput));
    const requestSha256 = digest(input);
    const existing = this.#workspaceByKey(input.workspaceKey);
    if (existing) {
      const result = this.#retry(input, requestSha256, existing);
      await this.readWorkspace(result.workspaceId);
      return result;
    }

    const workspaceId = this.#validUuid();
    const createdAt = this.#now().toISOString();
    const artifact: DiscoveryWorkspaceArtifact = {
      contractVersion: '1.0.0',
      workspaceId,
      workspaceKey: input.workspaceKey,
      state: 'ACTIVE',
      title: input.title,
      ...(input.description === undefined ? {} : { description: input.description }),
      createdAt,
      requestSha256,
    };
    validateDiscoveryWorkspaceArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): DiscoveryWorkspaceExecution => {
      const concurrent = this.#workspaceByKey(input.workspaceKey);
      if (concurrent) return this.#retry(input, requestSha256, concurrent);
      let databaseMutations = this.#registerArtifact(stored, createdAt);
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_discovery_workspaces(
          workspace_id, workspace_key, state, title, description,
          request_sha256, workspace_artifact_sha256, created_at
        ) VALUES (?, ?, 'ACTIVE', ?, ?, ?, ?, ?)
      `).run(workspaceId, input.workspaceKey, input.title, input.description ?? null, requestSha256, stored.sha256, createdAt).changes;
      return { workspaceId, workspaceArtifactSha256: stored.sha256, state: 'ACTIVE', deduplicated: false, databaseMutations };
    });

    const result = execute();
    if (result.deduplicated) await this.readWorkspace(result.workspaceId);
    return result;
  }

  async readWorkspace(workspaceId: string): Promise<DiscoveryWorkspaceArtifact> {
    assertUuid(workspaceId);
    const row = this.#workspaceById(workspaceId);
    if (!row) throw new FlowValidationError(`Discovery workspace not found: ${workspaceId}`);
    const artifact = await this.#readArtifact(row.artifactSha256);
    const ownerRequest = validateDiscoveryWorkspaceRequest({
      contractVersion: '1.0.0',
      workspaceKey: artifact.workspaceKey,
      title: artifact.title,
      ...(artifact.description === undefined ? {} : { description: artifact.description }),
    });
    if (
      digest(ownerRequest) !== artifact.requestSha256 ||
      artifact.workspaceId !== row.workspaceId ||
      artifact.workspaceKey !== row.workspaceKey ||
      artifact.state !== row.state ||
      artifact.title !== row.title ||
      (artifact.description ?? null) !== row.description ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new DiscoveryWorkspaceIdentityConflictError('Workspace artifact does not match immutable metadata');
    return artifact;
  }

  #retry(input: DiscoveryWorkspaceRequest, requestSha256: string, row: WorkspaceRow): DiscoveryWorkspaceExecution {
    if (
      row.requestSha256 !== requestSha256 ||
      row.title !== input.title ||
      row.description !== (input.description ?? null)
    ) throw new DiscoveryWorkspaceIdentityConflictError('Workspace key already exists with changed content');
    return { workspaceId: row.workspaceId, workspaceArtifactSha256: row.artifactSha256, state: 'ACTIVE', deduplicated: true, databaseMutations: 0 };
  }

  #workspaceByKey(key: string): WorkspaceRow | undefined {
    return this.#db.prepare(`
      SELECT workspace_id workspaceId, workspace_key workspaceKey, state, title, description,
             request_sha256 requestSha256, workspace_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_discovery_workspaces WHERE workspace_key = ?
    `).get(key) as WorkspaceRow | undefined;
  }

  #workspaceById(id: string): WorkspaceRow | undefined {
    return this.#db.prepare(`
      SELECT workspace_id workspaceId, workspace_key workspaceKey, state, title, description,
             request_sha256 requestSha256, workspace_artifact_sha256 artifactSha256, created_at createdAt
      FROM flow_discovery_workspaces WHERE workspace_id = ?
    `).get(id) as WorkspaceRow | undefined;
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
    ) throw new DiscoveryWorkspaceIdentityConflictError('Artifact metadata conflict');
    return changes.changes;
  }

  async #readArtifact(sha256: string): Promise<DiscoveryWorkspaceArtifact> {
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
    ) throw new DiscoveryWorkspaceIdentityConflictError('Artifact manifest metadata mismatch');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    } catch (error) {
      throw new FlowValidationError(`Invalid artifact JSON: ${(error as Error).message}`);
    }
    const artifact = validateDiscoveryWorkspaceArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('Artifact is not canonical JSON');
    return artifact;
  }

  #validUuid(): string {
    const value = this.#uuid();
    assertUuid(value);
    return value;
  }
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
