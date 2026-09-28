import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { SourcePackageIntakeRequest } from '../../../contracts/foundation/source-package-intake-request.generated.js';
import type { SourcePackageManifest } from '../../../contracts/foundation/source-package-manifest.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from './canonical-json.js';
import { FoundationIdentityConflictError } from './foundation-service.js';
import { FoundationValidationError, validateSourcePackageIntakeRequest, validateSourcePackageManifest } from './validation.js';

export interface SourcePackageIntakeResult {
  readonly packageId: string;
  readonly manifestArtifactSha256: string;
  readonly packageContentSha256: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}
export type VerifiedSourcePackageFile = SourcePackageManifest['files'][number] & { readonly bytes: Buffer };
export interface VerifiedFinalizedSourcePackage {
  readonly packageId: string;
  readonly manifestArtifactSha256: string;
  readonly packageContentSha256: string;
  readonly manifest: SourcePackageManifest;
  readonly files: readonly VerifiedSourcePackageFile[];
}

export interface SourcePackageReadBudget {
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export class SourcePackageReadLimitError extends Error {
  constructor(readonly code: 'FILE_SIZE_LIMIT' | 'TOTAL_SIZE_LIMIT') {
    super(`Source package read rejected: ${code}`);
  }
}

export class SourcePackageService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;

  constructor(options: { readonly db: Database.Database; readonly artifactStore: ContentAddressedArtifactStore; readonly now?: () => Date }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#now = options.now ?? (() => new Date());
  }

  async intake(untrustedInput: unknown, supplied: ReadonlyMap<string, Uint8Array> | readonly { path: string; bytes: Uint8Array }[]): Promise<SourcePackageIntakeResult> {
    const input = validateSourcePackageIntakeRequest(untrustedInput);
    const files = [...input.files].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    for (const file of files) {
      if (file.path === '.' || path.posix.isAbsolute(file.path) || path.posix.normalize(file.path) !== file.path || /^[A-Za-z]:\//.test(file.path)) {
        throw new FoundationValidationError(`Unsafe or non-canonical logical path: ${file.path}`);
      }
    }

    const suppliedItems = Array.isArray(supplied) ? supplied : [...supplied.entries()].map(([itemPath, bytes]) => ({ path: itemPath, bytes }));
    const bytesByPath = new Map(suppliedItems.map((item) => [item.path, item.bytes]));
    if (bytesByPath.size !== suppliedItems.length) throw new FoundationValidationError('Duplicate supplied file path');
    const declared = new Set(files.map((file) => file.path));
    const missing = files.filter((file) => !bytesByPath.has(file.path)).map((file) => file.path);
    const extra = [...bytesByPath.keys()].filter((name) => !declared.has(name));
    if (missing.length || extra.length) throw new FoundationValidationError(`Exact membership mismatch; missing: ${missing.join(', ') || 'none'}; extra: ${extra.join(', ') || 'none'}`);
    for (const file of files) {
      const bytes = Buffer.from(bytesByPath.get(file.path)!);
      if (bytes.byteLength !== file.byteSize || sha256(bytes) !== file.sha256) throw new FoundationValidationError(`Exact-byte digest/size mismatch: ${file.path}`);
    }

    const semantic = { ...input, files } as SourcePackageIntakeRequest;
    const packageContentSha256 = contentDigest(files);
    const requestSha256 = sha256(Buffer.from(canonicalJson(semantic)));
    const existing = this.#db.prepare('SELECT package_id AS packageId, request_sha256 AS requestSha256, package_content_sha256 AS packageContentSha256, manifest_artifact_sha256 AS manifestArtifactSha256 FROM foundation_source_packages WHERE package_key=? AND version=?').get(input.packageKey, input.version) as { packageId: string; requestSha256: string; packageContentSha256: string; manifestArtifactSha256: string } | undefined;
    if (existing) {
      if (
        existing.requestSha256 !== requestSha256 ||
        existing.packageContentSha256 !== packageContentSha256
      ) throw new FoundationIdentityConflictError('Source package key/version exists with metadata or byte drift');
      await this.readVerified(existing.packageId);
      return { packageId: existing.packageId, manifestArtifactSha256: existing.manifestArtifactSha256, packageContentSha256, deduplicated: true, databaseMutations: 0 };
    }

    const storedFiles = new Map<string, Awaited<ReturnType<ContentAddressedArtifactStore['put']>>>();
    for (const file of files) storedFiles.set(file.path, await this.#artifacts.put(bytesByPath.get(file.path)!));
    const packageId = randomUUID();
    const finalizedAt = this.#now().toISOString();
    const manifest: SourcePackageManifest = { ...semantic, packageId, finalizedAt, packageContentSha256 };
    validateSourcePackageManifest(manifest);
    const manifestStored = await this.#artifacts.put(Buffer.from(canonicalJson(manifest)));

    const transaction = this.#db.transaction(() => {
      let mutations = 0;
      for (const file of files) mutations += this.#registerArtifact(storedFiles.get(file.path)!, file.mediaType, finalizedAt);
      mutations += this.#registerArtifact(manifestStored, 'application/json', finalizedAt);
      this.#db.prepare(`INSERT INTO foundation_source_packages(package_id,package_key,version,source_acquired_at,source_label,request_sha256,package_content_sha256,manifest_artifact_sha256,finalized_at) VALUES(?,?,?,?,?,?,?,?,NULL)`).run(packageId, input.packageKey, input.version, input.sourceAcquiredAt, input.sourceLabel, requestSha256, packageContentSha256, manifestStored.sha256);
      mutations++;
      const insert = this.#db.prepare(`INSERT INTO foundation_source_package_files(package_id,logical_path,artifact_sha256,byte_size,media_type,evidence_family,representation_role,independence,provider_provenance,provenance_basis,period_start,period_end) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`);
      for (const file of files) {
        insert.run(packageId, file.path, file.sha256, file.byteSize, file.mediaType, file.evidenceFamily, file.representationRole, file.independence, file.providerProvenance, file.provenanceBasis, file.period?.start ?? null, file.period?.end ?? null);
        mutations++;
      }
      this.#db.prepare('UPDATE foundation_source_packages SET finalized_at=? WHERE package_id=?').run(finalizedAt, packageId);
      mutations++;
      return mutations;
    });
    return { packageId, manifestArtifactSha256: manifestStored.sha256, packageContentSha256, deduplicated: false, databaseMutations: transaction() };
  }

  async readVerified(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage> {
    if (budget) assertReadBudget(budget);
    const row = this.#db.prepare(`SELECT package_key AS packageKey,version,source_acquired_at AS sourceAcquiredAt,source_label AS sourceLabel,request_sha256 AS requestSha256,package_content_sha256 AS packageContentSha256,manifest_artifact_sha256 AS manifestSha256,finalized_at AS finalizedAt FROM foundation_source_packages WHERE package_id=? AND finalized_at IS NOT NULL`).get(packageId) as any;
    if (!row) throw new FoundationValidationError('Finalized source package not found');
    const manifestMetadata = this.#artifactMetadata(row.manifestSha256, 'application/json');
    const dbFiles = this.#db.prepare(`SELECT logical_path AS path,artifact_sha256 AS sha256,byte_size AS byteSize,media_type AS mediaType,evidence_family AS evidenceFamily,representation_role AS representationRole,independence,provider_provenance AS providerProvenance,provenance_basis AS provenanceBasis,period_start AS periodStart,period_end AS periodEnd FROM foundation_source_package_files WHERE package_id=? ORDER BY logical_path`).all(packageId) as any[];
    const fileMetadata = dbFiles.map(file => ({ file, artifact: this.#artifactMetadata(file.sha256, file.mediaType) }));
    if (budget) {
      const declaredSizes = [manifestMetadata.byteSize, ...fileMetadata.map(({ file }) => toBigInt(file.byteSize))];
      const actualSizes = [manifestMetadata.byteSize, ...fileMetadata.map(({ artifact }) => artifact.byteSize)];
      assertPackageReadBudget(budget, declaredSizes.map((declared, index) => declared > actualSizes[index]! ? declared : actualSizes[index]!));
    }
    const manifestBytes = await this.#verifiedArtifact(row.manifestSha256, 'application/json', budget?.maxFileBytes);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)); }
    catch { throw new FoundationValidationError('Invalid source package manifest JSON'); }
    const manifest = validateSourcePackageManifest(parsed);
    if (!manifestBytes.equals(Buffer.from(canonicalJson(manifest)))) throw new FoundationIdentityConflictError('Source package manifest is not canonical');

    const files: VerifiedSourcePackageFile[] = [];
    for (const { file } of fileMetadata) {
      files.push({ path: file.path, sha256: file.sha256, byteSize: Number(file.byteSize), mediaType: file.mediaType, evidenceFamily: file.evidenceFamily, representationRole: file.representationRole, independence: file.independence, providerProvenance: file.providerProvenance, provenanceBasis: file.provenanceBasis, ...(file.periodStart === null ? {} : { period: { start: file.periodStart, end: file.periodEnd } }), bytes: await this.#verifiedArtifact(file.sha256, file.mediaType, budget?.maxFileBytes) });
    }
    const reconstructed = { contractVersion: '1.0.0', packageId, packageKey: row.packageKey, version: Number(row.version), sourceAcquiredAt: row.sourceAcquiredAt, sourceLabel: row.sourceLabel, finalizedAt: row.finalizedAt, packageContentSha256: row.packageContentSha256, files: files.map(({ bytes, ...file }) => file) } as SourcePackageManifest;
    if (canonicalJson(manifest) !== canonicalJson(reconstructed)) throw new FoundationIdentityConflictError('Source package manifest does not match immutable membership');
    if (contentDigest(reconstructed.files) !== row.packageContentSha256) {
      throw new FoundationIdentityConflictError('Source package content identity mismatch');
    }
    const { packageId: _id, finalizedAt: _time, packageContentSha256: _content, ...request } = reconstructed;
    if (sha256(Buffer.from(canonicalJson(request))) !== row.requestSha256) throw new FoundationIdentityConflictError('Source package request identity mismatch');
    return { packageId, manifestArtifactSha256: row.manifestSha256, packageContentSha256: row.packageContentSha256, manifest, files };
  }

  #registerArtifact(stored: { sha256: string; byteSize: number; relativePath: string }, mediaType: string, acquiredAt: string): number {
    const info = this.#db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES(?,?,?,?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`).run(stored.sha256, stored.byteSize, mediaType, stored.relativePath, acquiredAt, acquiredAt);
    const row = this.#db.prepare('SELECT byte_size AS byteSize,media_type AS mediaType,relative_path AS relativePath,contract_version AS contractVersion FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as any;
    if (row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== mediaType || row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0') throw new FoundationIdentityConflictError('Artifact manifest exact metadata conflict');
    return Number(info.changes);
  }

  async #verifiedArtifact(digest: string, mediaType: string, maxBytes?: number): Promise<Buffer> {
    const meta = this.#artifactMetadata(digest, mediaType);
    const bytes = await this.#artifacts.read(digest, maxBytes === undefined ? undefined : { maxBytes });
    if (meta.byteSize !== BigInt(bytes.length)) throw new FoundationIdentityConflictError('Artifact size mismatch');
    return bytes;
  }

  #artifactMetadata(digest: string, mediaType: string): { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } {
    const meta = this.#db.prepare('SELECT byte_size AS byteSize,media_type AS mediaType,relative_path AS relativePath,contract_version AS contractVersion FROM artifact_manifests WHERE sha256=?').get(digest) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!meta || meta.byteSize < 0n || meta.mediaType !== mediaType || meta.relativePath !== `sha256/${digest.slice(0, 2)}/${digest}` || meta.contractVersion !== '1.0.0') throw new FoundationIdentityConflictError('Artifact manifest mismatch');
    return meta;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function contentDigest(
  files: readonly Pick<SourcePackageManifest['files'][number], 'path' | 'sha256' | 'byteSize'>[],
): string {
  const membership = files
    .map(({ path: logicalPath, sha256: fileSha256, byteSize }) => ({
      path: logicalPath,
      sha256: fileSha256,
      byteSize,
    }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return sha256(Buffer.from(canonicalJson(membership)));
}

function assertReadBudget(budget: SourcePackageReadBudget): void {
  if (!Number.isSafeInteger(budget.maxFileBytes) || budget.maxFileBytes < 0 ||
      !Number.isSafeInteger(budget.maxTotalBytes) || budget.maxTotalBytes < 0 ||
      budget.maxTotalBytes < budget.maxFileBytes) {
    throw new RangeError('Invalid source package read budget');
  }
}

function toBigInt(value: bigint | number): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

function assertPackageReadBudget(budget: SourcePackageReadBudget, sizes: readonly bigint[]): void {
  const maxFileBytes = BigInt(budget.maxFileBytes);
  const maxTotalBytes = BigInt(budget.maxTotalBytes);
  if (sizes.some(size => size > maxFileBytes)) throw new SourcePackageReadLimitError('FILE_SIZE_LIMIT');
  const total = sizes.reduce((sum, size) => sum + size, 0n);
  if (total > maxTotalBytes) throw new SourcePackageReadLimitError('TOTAL_SIZE_LIMIT');
}
