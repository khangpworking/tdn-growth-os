import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { ContentBrandArtifact, ContentBrandDisplayRules, ContentBrandProfile } from '../../../contracts/flow/content-brand-artifact.generated.js';
import { canonicalJson } from '../foundation/index.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import {
  FlowValidationError,
  validateContentBrandArtifact,
  validateContentBrandCreateRequest,
  validateContentBrandRevisionRequest,
} from './validation.js';

export class ContentBrandIdentityConflictError extends Error {}

export interface ContentBrandExecution {
  readonly brandId: string;
  readonly brandArtifactSha256: string;
  readonly version: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

interface BrandRow {
  brandId: string;
  brandKey: string;
  version: bigint;
  brandName: string;
  requestSha256: string;
  artifactSha256: string;
  createdAt: string;
}

/** Content brands (Task 048): immutable, sequentially versioned profiles and display rules. */
export class ContentBrandService {
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

  async createBrand(untrustedInput: unknown): Promise<ContentBrandExecution> {
    const input = snapshot(validateContentBrandCreateRequest(untrustedInput));
    const requestSha256 = digest(input);
    const existing = this.#brandByKey(input.brandKey);
    if (existing) {
      const result = this.#retry(requestSha256, this.#versionOne(existing.brandId));
      await this.readBrand(result.brandId, 1);
      return result;
    }

    const brandId = this.#validUuid();
    const createdAt = this.#now().toISOString();
    const artifact = brandArtifact(brandId, input.brandKey, 1, input.profile, input.displayRules, createdAt, requestSha256);
    validateContentBrandArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): ContentBrandExecution => {
      const concurrent = this.#brandByKey(input.brandKey);
      if (concurrent) return this.#retry(requestSha256, this.#versionOne(concurrent.brandId));
      let databaseMutations = this.#registerArtifact(stored, createdAt);
      databaseMutations += this.#db.prepare(`
        INSERT INTO flow_content_brands(brand_id, brand_key, created_at) VALUES (?, ?, ?)
      `).run(brandId, input.brandKey, createdAt).changes;
      databaseMutations += this.#insertRevision(brandId, 1, input.profile.brandName, requestSha256, stored.sha256, createdAt);
      return { brandId, brandArtifactSha256: stored.sha256, version: 1, deduplicated: false, databaseMutations };
    });

    const result = execute();
    if (result.deduplicated) await this.readBrand(result.brandId, 1);
    return result;
  }

  async reviseBrand(untrustedInput: unknown): Promise<ContentBrandExecution> {
    const input = snapshot(validateContentBrandRevisionRequest(untrustedInput));
    const requestSha256 = digest(input);
    const current = this.#brandById(input.brandId);
    if (!current) throw new FlowValidationError(`Content brand not found: ${input.brandId}`);
    const targetVersion = input.expectedVersion + 1;
    const existingTarget = this.#brandVersion(input.brandId, targetVersion);
    if (existingTarget) {
      const result = this.#retry(requestSha256, existingTarget);
      await this.readBrand(input.brandId, targetVersion);
      return result;
    }
    if (Number(current.version) !== input.expectedVersion) throw new ContentBrandIdentityConflictError('Brand revision version or content drift');

    const createdAt = this.#now().toISOString();
    const artifact = brandArtifact(current.brandId, current.brandKey, targetVersion, input.profile, input.displayRules, createdAt, requestSha256);
    validateContentBrandArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): ContentBrandExecution => {
      const concurrent = this.#brandById(input.brandId);
      if (!concurrent) throw new FlowValidationError(`Content brand not found: ${input.brandId}`);
      const concurrentTarget = this.#brandVersion(input.brandId, targetVersion);
      if (concurrentTarget) return this.#retry(requestSha256, concurrentTarget);
      if (Number(concurrent.version) !== input.expectedVersion) throw new ContentBrandIdentityConflictError('Brand revision version or content drift');
      let databaseMutations = this.#registerArtifact(stored, createdAt);
      databaseMutations += this.#insertRevision(input.brandId, targetVersion, input.profile.brandName, requestSha256, stored.sha256, createdAt);
      return { brandId: input.brandId, brandArtifactSha256: stored.sha256, version: targetVersion, deduplicated: false, databaseMutations };
    });

    const result = execute();
    if (result.deduplicated) await this.readBrand(result.brandId, result.version);
    return result;
  }

  async readBrand(brandId: string, version?: number): Promise<ContentBrandArtifact> {
    assertUuid(brandId);
    const row = version === undefined ? this.#brandById(brandId) : this.#brandVersion(brandId, version);
    if (!row) throw new FlowValidationError(`Content brand revision not found: ${brandId}`);
    const artifact = await this.#readArtifact(row.artifactSha256);
    const ownerRequest = artifact.version === 1
      ? validateContentBrandCreateRequest({ contractVersion: '1.0.0', brandKey: artifact.brandKey, profile: artifact.profile, displayRules: artifact.displayRules })
      : validateContentBrandRevisionRequest({
          contractVersion: '1.0.0', brandId: artifact.brandId, expectedVersion: artifact.version - 1,
          profile: artifact.profile, displayRules: artifact.displayRules,
        });
    if (
      digest(ownerRequest) !== artifact.requestSha256 ||
      artifact.brandId !== row.brandId ||
      artifact.brandKey !== row.brandKey ||
      BigInt(artifact.version) !== row.version ||
      artifact.profile.brandName !== row.brandName ||
      artifact.requestSha256 !== row.requestSha256 ||
      artifact.createdAt !== row.createdAt
    ) throw new ContentBrandIdentityConflictError('Brand artifact does not match immutable metadata');
    return artifact;
  }

  /**
   * Re-stages the exact artifact of an already committed create or revision when the
   * row exists with the same request digest but its artifact file was never published.
   * Returns true when bytes were staged; the caller publishes them.
   */
  async restoreExactArtifact(untrustedInput: unknown): Promise<boolean> {
    const isRevision = typeof untrustedInput === 'object' && untrustedInput !== null && 'brandId' in untrustedInput;
    const input = snapshot(isRevision ? validateContentBrandRevisionRequest(untrustedInput) : validateContentBrandCreateRequest(untrustedInput));
    const requestSha256 = digest(input);
    const row = 'brandId' in input
      ? this.#brandVersion(input.brandId, input.expectedVersion + 1)
      : (() => { const existing = this.#brandByKey(input.brandKey); return existing ? this.#brandVersion(existing.brandId, 1) : undefined; })();
    if (!row || row.requestSha256 !== requestSha256) return false;
    if (await this.#artifactPresent(row.artifactSha256)) return false;
    const artifact = brandArtifact(row.brandId, row.brandKey, Number(row.version), input.profile, input.displayRules, row.createdAt, row.requestSha256);
    const restored = bytes(validateContentBrandArtifact(artifact));
    if (createHash('sha256').update(restored).digest('hex') !== row.artifactSha256) {
      throw new ContentBrandIdentityConflictError('Committed brand artifact cannot be reconstructed');
    }
    await this.#artifacts.put(restored);
    return true;
  }

  async #artifactPresent(sha256: string): Promise<boolean> {
    try { await fs.access(this.#artifacts.pathForDigest(sha256)); return true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; }
  }

  #retry(requestSha256: string, row: BrandRow): ContentBrandExecution {
    if (row.requestSha256 !== requestSha256) throw new ContentBrandIdentityConflictError('Brand key or version already exists with changed content');
    return { brandId: row.brandId, brandArtifactSha256: row.artifactSha256, version: Number(row.version), deduplicated: true, databaseMutations: 0 };
  }

  #versionOne(brandId: string): BrandRow {
    const row = this.#brandVersion(brandId, 1);
    if (!row) throw new ContentBrandIdentityConflictError('Brand is missing version 1');
    return row;
  }

  #insertRevision(brandId: string, version: number, brandName: string, requestSha256: string, artifactSha256: string, createdAt: string): number {
    return this.#db.prepare(`
      INSERT INTO flow_content_brand_revisions(brand_id, version, brand_name, request_sha256, brand_artifact_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(brandId, version, brandName, requestSha256, artifactSha256, createdAt).changes;
  }

  #brandByKey(brandKey: string): BrandRow | undefined { return this.#brandQuery('b.brand_key = ?', brandKey); }
  #brandById(brandId: string): BrandRow | undefined { return this.#brandQuery('b.brand_id = ?', brandId); }

  #brandVersion(brandId: string, version: number): BrandRow | undefined {
    if (!Number.isSafeInteger(version) || version < 1) throw new FlowValidationError('version must be a positive safe integer');
    return this.#brandQuery('b.brand_id = ? AND r.version = ?', brandId, version);
  }

  #brandQuery(where: string, ...values: unknown[]): BrandRow | undefined {
    return this.#db.prepare(`
      SELECT b.brand_id brandId, b.brand_key brandKey, r.version, r.brand_name brandName,
             r.request_sha256 requestSha256, r.brand_artifact_sha256 artifactSha256, r.created_at createdAt
      FROM flow_content_brands b
      JOIN flow_content_brand_revisions r ON r.brand_id = b.brand_id
      WHERE ${where}
      ORDER BY r.version DESC LIMIT 1
    `).get(...values) as BrandRow | undefined;
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
    ) throw new ContentBrandIdentityConflictError('Artifact metadata conflict');
    return changes.changes;
  }

  async #readArtifact(sha256: string): Promise<ContentBrandArtifact> {
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
    ) throw new ContentBrandIdentityConflictError('Artifact manifest metadata mismatch');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(data));
    } catch (error) {
      throw new FlowValidationError(`Invalid artifact JSON: ${(error as Error).message}`);
    }
    const artifact = validateContentBrandArtifact(parsed);
    if (!data.equals(bytes(artifact))) throw new FlowValidationError('Artifact is not canonical JSON');
    return artifact;
  }

  #validUuid(): string {
    const value = this.#uuid();
    assertUuid(value);
    return value;
  }
}

function brandArtifact(
  brandId: string,
  brandKey: string,
  version: number,
  profile: ContentBrandProfile,
  displayRules: ContentBrandDisplayRules,
  createdAt: string,
  requestSha256: string,
): ContentBrandArtifact {
  return { contractVersion: '1.0.0', brandId, brandKey, version, profile, displayRules, createdAt, requestSha256 };
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
