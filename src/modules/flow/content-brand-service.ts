import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import type { ContentBrandArtifact, ContentBrandDisplayRules, ContentBrandProfile } from '../../../contracts/flow/content-brand-artifact.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import {
  canonicalBytes as bytes,
  canonicalDigest as digest,
  canonicalSnapshot as snapshot,
  readCanonicalJsonArtifact,
  registerContentManifest,
  sha256,
} from './content-artifacts.js';
import { registeredContentMedia } from './content-media-service.js';
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
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
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
    this.#assertLogo(input.brandId, input.logoMediaSha256);

    const createdAt = this.#now().toISOString();
    const artifact = brandArtifact(current.brandId, current.brandKey, targetVersion, input.profile, input.displayRules, createdAt, requestSha256, input.logoMediaSha256);
    validateContentBrandArtifact(artifact);
    const stored = await this.#artifacts.put(bytes(artifact));

    const execute = this.#db.transaction((): ContentBrandExecution => {
      const concurrent = this.#brandById(input.brandId);
      if (!concurrent) throw new FlowValidationError(`Content brand not found: ${input.brandId}`);
      const concurrentTarget = this.#brandVersion(input.brandId, targetVersion);
      if (concurrentTarget) return this.#retry(requestSha256, concurrentTarget);
      if (Number(concurrent.version) !== input.expectedVersion) throw new ContentBrandIdentityConflictError('Brand revision version or content drift');
      let databaseMutations = registerContentManifest(this.#db, stored, createdAt, 'application/json');
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
    const artifact = validateContentBrandArtifact(await readCanonicalJsonArtifact(this.#db, this.#artifacts, row.artifactSha256));
    const ownerRequest = artifact.version === 1
      ? validateContentBrandCreateRequest({ contractVersion: '1.0.0', brandKey: artifact.brandKey, profile: artifact.profile, displayRules: artifact.displayRules })
      : validateContentBrandRevisionRequest({
          contractVersion: '1.0.0', brandId: artifact.brandId, expectedVersion: artifact.version - 1,
          profile: artifact.profile, displayRules: artifact.displayRules,
          ...(artifact.logoMediaSha256 === undefined ? {} : { logoMediaSha256: artifact.logoMediaSha256 }),
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
    this.#assertLogo(artifact.brandId, artifact.logoMediaSha256);
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
    const artifact = brandArtifact(row.brandId, row.brandKey, Number(row.version), input.profile, input.displayRules, row.createdAt, row.requestSha256, 'logoMediaSha256' in input ? input.logoMediaSha256 : undefined);
    const restored = bytes(validateContentBrandArtifact(artifact));
    if (sha256(restored) !== row.artifactSha256) {
      throw new ContentBrandIdentityConflictError('Committed brand artifact cannot be reconstructed');
    }
    await this.#artifacts.put(restored);
    return true;
  }

  #assertLogo(brandId: string, logoMediaSha256: string | undefined): void {
    if (logoMediaSha256 !== undefined && !registeredContentMedia(this.#db, brandId, 'LOGO', logoMediaSha256)) throw new FlowValidationError(`Brand logo is not a registered logo of this brand: ${logoMediaSha256}`);
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
  logoMediaSha256?: string,
): ContentBrandArtifact {
  return { contractVersion: '1.0.0', brandId, brandKey, version, profile, displayRules, ...(logoMediaSha256 === undefined ? {} : { logoMediaSha256 }), createdAt, requestSha256 };
}

function assertUuid(value: string): void {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new FlowValidationError('ID must be a UUID');
  }
}
