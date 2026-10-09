import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { SourcePackageIntakeRequest } from '../../../contracts/foundation/source-package-intake-request.generated.js';
import type { SourcePackageManifest } from '../../../contracts/foundation/source-package-manifest.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { RequestScopedArtifactStore } from '../../platform/artifacts/request-scoped-artifact-store.js';
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

export interface FinalizedSourcePackageSummary {
  readonly packageId: string;
  readonly manifestArtifactSha256: string;
  readonly sourceLabel: string;
  readonly version: number;
}

/** Immutable row metadata only. It is not verified evidence: read the chosen ID with readVerified. */
export interface FinalizedSourcePackageEntry {
  readonly packageId: string;
  readonly packageKey: string;
  readonly version: number;
  readonly manifestArtifactSha256: string;
}

export interface SourcePackageReadBudget {
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

/** Service-authored storage origin only; it does not admit a package into an Analysis run. */
export interface SourceAttachmentOrigin {
  readonly packageId: string;
  readonly originKind: 'AUTOMATION_ATTACHMENT';
  readonly bindingSha256: string;
  readonly manifestArtifactSha256: string;
  readonly markedAt: string;
}

export class SourcePackageReadLimitError extends Error {
  constructor(readonly code: 'FILE_SIZE_LIMIT' | 'TOTAL_SIZE_LIMIT') {
    super(`Source package read rejected: ${code}`);
  }
}

/** The caller supplied a different semantic request for an existing key/version. */
export class SourcePackageRequestConflictError extends FoundationIdentityConflictError {
  constructor() {
    super('Source package key/version exists with metadata or byte drift');
  }
}

interface ExistingSourcePackageRow {
  readonly packageId: string;
  readonly packageKey: string;
  readonly version: number | bigint;
  readonly sourceAcquiredAt: string | null;
  readonly sourceLabel: string;
  readonly requestSha256: string;
  readonly packageContentSha256: string;
  readonly manifestArtifactSha256: string;
  readonly finalizedAt: string | null;
}

interface ExistingAttachmentOrigin {
  readonly packageId: string;
  readonly originKind: string;
  readonly bindingSha256: string;
  readonly manifestArtifactSha256: string;
  readonly markedAt: string;
}

interface ExistingSourcePackageFileRow {
  readonly path: string;
  readonly sha256: string;
  readonly byteSize: bigint | number;
  readonly mediaType: string;
  readonly evidenceFamily: string;
  readonly representationRole: string;
  readonly independence: string;
  readonly providerProvenance: string;
  readonly provenanceBasis: string;
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
}

interface RetryArtifactMetadata {
  readonly byteSize: bigint | number;
  readonly mediaType: string;
  readonly relativePath: string;
  readonly acquiredAt: string;
  readonly contractVersion: string;
  readonly retentionStatus: string;
  readonly createdAt: string;
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
    return this.#intake(untrustedInput, supplied);
  }

  /** Only the server attachment owner supplies this binding; ordinary intake cannot acquire this origin. */
  async intakeAutomationAttachment(untrustedInput: unknown, supplied: ReadonlyMap<string, Uint8Array> | readonly { path: string; bytes: Uint8Array }[], bindingSha256: string): Promise<SourcePackageIntakeResult> {
    if (this.#artifacts instanceof RequestScopedArtifactStore) this.#artifacts.assertOwnership();
    if (typeof bindingSha256 !== 'string' || !/^[0-9a-f]{64}$/.test(bindingSha256))
      throw new FoundationValidationError('Invalid attachment origin binding');
    return this.#intake(untrustedInput, supplied, bindingSha256);
  }

  async #intake(untrustedInput: unknown, supplied: ReadonlyMap<string, Uint8Array> | readonly { path: string; bytes: Uint8Array }[], bindingSha256?: string): Promise<SourcePackageIntakeResult> {
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
    const existing = this.#db.prepare(`SELECT package_id AS packageId,package_key AS packageKey,version,
      source_acquired_at AS sourceAcquiredAt,source_label AS sourceLabel,request_sha256 AS requestSha256,
      package_content_sha256 AS packageContentSha256,manifest_artifact_sha256 AS manifestArtifactSha256,
      finalized_at AS finalizedAt FROM foundation_source_packages WHERE package_key=? AND version=?`)
      .get(input.packageKey, input.version) as ExistingSourcePackageRow | undefined;
    if (existing) {
      if (
        existing.requestSha256 !== requestSha256 ||
        existing.packageContentSha256 !== packageContentSha256
      ) throw new SourcePackageRequestConflictError();
      if (bindingSha256 !== undefined) {
        if (this.#artifacts instanceof RequestScopedArtifactStore) {
          await this.#recoverAutomationAttachment(existing, input, files, bytesByPath, semantic, packageContentSha256, bindingSha256);
        } else {
          await this.readVerified(existing.packageId);
          const origin = await this.readAutomationAttachmentOrigin(existing.packageId);
          if (!origin || origin.bindingSha256 !== bindingSha256 || origin.manifestArtifactSha256 !== existing.manifestArtifactSha256)
            throw new FoundationIdentityConflictError('Attachment origin differs from its original intake');
        }
      } else {
        await this.readVerified(existing.packageId);
      }
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
      if (bindingSha256 !== undefined) {
        this.#db.prepare(`INSERT INTO foundation_source_attachment_origins(package_id,origin_kind,binding_sha256,manifest_artifact_sha256,marked_at)
          VALUES (?,'AUTOMATION_ATTACHMENT',?,?,?)`).run(packageId, bindingSha256, manifestStored.sha256, finalizedAt);
        mutations++;
      }
      this.#db.prepare('UPDATE foundation_source_packages SET finalized_at=? WHERE package_id=?').run(finalizedAt, packageId);
      mutations++;
      return mutations;
    });
    return { packageId, manifestArtifactSha256: manifestStored.sha256, packageContentSha256, deduplicated: false, databaseMutations: transaction() };
  }

  /**
   * Re-stage only the exact immutable attachment artifacts after a committed
   * intake whose caller did not publish them. RequestScopedArtifactStore.put
   * verifies an existing canonical path and stages only an actual ENOENT; it
   * never repairs or overwrites a corrupt canonical artifact.
   */
  async #recoverAutomationAttachment(
    existing: ExistingSourcePackageRow,
    input: SourcePackageIntakeRequest,
    files: readonly SourcePackageIntakeRequest['files'][number][],
    bytesByPath: ReadonlyMap<string, Uint8Array>,
    semantic: SourcePackageIntakeRequest,
    packageContentSha256: string,
    bindingSha256: string,
  ): Promise<void> {
    if (existing.packageKey !== input.packageKey || Number(existing.version) !== input.version ||
        existing.sourceLabel !== input.sourceLabel || existing.sourceAcquiredAt !== input.sourceAcquiredAt ||
        typeof existing.finalizedAt !== 'string' || existing.finalizedAt.length === 0 ||
        !/^[0-9a-f]{64}$/.test(existing.manifestArtifactSha256)) {
      throw new FoundationIdentityConflictError('Source package row differs from its immutable intake');
    }

    const origin = this.#db.prepare(`SELECT package_id AS packageId,origin_kind AS originKind,
      binding_sha256 AS bindingSha256,manifest_artifact_sha256 AS manifestArtifactSha256,marked_at AS markedAt
      FROM foundation_source_attachment_origins WHERE package_id=?`).get(existing.packageId) as ExistingAttachmentOrigin | undefined;
    if (!origin || origin.packageId !== existing.packageId || origin.originKind !== 'AUTOMATION_ATTACHMENT' ||
        origin.bindingSha256 !== bindingSha256 || origin.manifestArtifactSha256 !== existing.manifestArtifactSha256 ||
        origin.markedAt !== existing.finalizedAt) {
      throw new FoundationIdentityConflictError('Attachment origin differs from its original intake');
    }

    const dbFiles = this.#db.prepare(`SELECT logical_path AS path,artifact_sha256 AS sha256,byte_size AS byteSize,
      media_type AS mediaType,evidence_family AS evidenceFamily,representation_role AS representationRole,
      independence,provider_provenance AS providerProvenance,provenance_basis AS provenanceBasis,
      period_start AS periodStart,period_end AS periodEnd FROM foundation_source_package_files
      WHERE package_id=? ORDER BY logical_path`).all(existing.packageId) as ExistingSourcePackageFileRow[];
    if (dbFiles.length !== files.length) throw new FoundationIdentityConflictError('Source package membership differs from its immutable intake');
    for (const file of files) {
      const row = dbFiles.find(candidate => candidate.path === file.path);
      if (!row || row.sha256 !== file.sha256 || toBigInt(row.byteSize) !== BigInt(file.byteSize) ||
          row.mediaType !== file.mediaType || row.evidenceFamily !== file.evidenceFamily ||
          row.representationRole !== file.representationRole || row.independence !== file.independence ||
          row.providerProvenance !== file.providerProvenance || row.provenanceBasis !== file.provenanceBasis ||
          row.periodStart !== (file.period?.start ?? null) || row.periodEnd !== (file.period?.end ?? null)) {
        throw new FoundationIdentityConflictError('Source package membership differs from its immutable intake');
      }
    }

    const manifest: SourcePackageManifest = {
      ...semantic,
      packageId: existing.packageId,
      finalizedAt: existing.finalizedAt,
      packageContentSha256: existing.packageContentSha256,
    };
    validateSourcePackageManifest(manifest);
    const manifestBytes = Buffer.from(canonicalJson(manifest));
    if (existing.packageContentSha256 !== packageContentSha256 || sha256(manifestBytes) !== existing.manifestArtifactSha256) {
      throw new FoundationIdentityConflictError('Source package manifest differs from its immutable intake');
    }

    // Validate every persisted manifest field before staging anything. The
    // acquired_at/created_at values belong to first storage and are therefore
    // intentionally not compared with this package's finalizedAt.
    this.#assertRetryArtifactMetadata(existing.manifestArtifactSha256, manifestBytes.length, 'application/json');
    for (const file of files) this.#assertRetryArtifactMetadata(file.sha256, file.byteSize, file.mediaType);

    const artifacts: { readonly bytes: Uint8Array; readonly sha256: string }[] = [
      { bytes: manifestBytes, sha256: existing.manifestArtifactSha256 },
      ...files.map(file => ({ bytes: bytesByPath.get(file.path)!, sha256: file.sha256 })),
    ];
    for (const artifact of artifacts) {
      const stored = await this.#artifacts.put(artifact.bytes);
      if (stored.sha256 !== artifact.sha256 || stored.byteSize !== artifact.bytes.byteLength ||
          stored.relativePath !== `sha256/${artifact.sha256.slice(0, 2)}/${artifact.sha256}`) {
        throw new FoundationIdentityConflictError('Source package artifact identity differs from its immutable intake');
      }
    }

    // This reads staged bytes through RequestScopedArtifactStore and verifies
    // package, manifest, exact membership/request identity, and origin before
    // the caller decides whether to publishOwned(). No database writes occur.
    await this.readVerified(existing.packageId);
    const verifiedOrigin = await this.readAutomationAttachmentOrigin(existing.packageId);
    if (!verifiedOrigin || verifiedOrigin.bindingSha256 !== bindingSha256 ||
        verifiedOrigin.manifestArtifactSha256 !== existing.manifestArtifactSha256) {
      throw new FoundationIdentityConflictError('Attachment origin differs from its original intake');
    }
  }

  #assertRetryArtifactMetadata(digest: string, byteSize: number, mediaType: string): void {
    const meta = this.#db.prepare(`SELECT byte_size AS byteSize,media_type AS mediaType,relative_path AS relativePath,
      acquired_at AS acquiredAt,contract_version AS contractVersion,retention_status AS retentionStatus,
      created_at AS createdAt FROM artifact_manifests WHERE sha256=?`).get(digest) as RetryArtifactMetadata | undefined;
    if (!meta || toBigInt(meta.byteSize) !== BigInt(byteSize) || meta.mediaType !== mediaType ||
        meta.relativePath !== `sha256/${digest.slice(0, 2)}/${digest}` || meta.contractVersion !== '1.0.0' ||
        meta.retentionStatus !== 'active' || typeof meta.acquiredAt !== 'string' || meta.acquiredAt.length === 0 ||
        typeof meta.createdAt !== 'string' || meta.createdAt.length === 0) {
      throw new FoundationIdentityConflictError('Artifact manifest exact metadata conflict');
    }
  }

  async listFinalizedSourcePackages(budget?: SourcePackageReadBudget): Promise<readonly FinalizedSourcePackageSummary[]> {
    // The reserved automation-method: namespace contains internal run bundles,
    // excluded before manual inventory counting/reads. Exact-ID replay still verifies them.
    const rows = this.#db.prepare(`SELECT p.package_id AS packageId FROM foundation_source_packages p
      WHERE p.finalized_at IS NOT NULL AND p.package_key NOT GLOB 'automation-method:*'
        AND NOT EXISTS (SELECT 1 FROM foundation_source_attachment_origins o WHERE o.package_id=p.package_id)
      ORDER BY p.package_id LIMIT 101`).all() as { packageId: string }[];
    if (rows.length > 100) throw new FoundationValidationError('Source inventory exceeds the local enumeration limit');
    const summaries: FinalizedSourcePackageSummary[] = [];
    for (const row of rows) {
      const verified = await this.readVerified(row.packageId, budget);
      summaries.push({
        packageId: verified.packageId,
        manifestArtifactSha256: verified.manifestArtifactSha256,
        sourceLabel: verified.manifest.sourceLabel,
        version: verified.manifest.version,
      });
    }
    return summaries;
  }

  async readAutomationAttachmentOrigin(packageId: string, budget?: SourcePackageReadBudget): Promise<SourceAttachmentOrigin | undefined> {
    const row = this.#db.prepare(`SELECT package_id packageId,origin_kind originKind,binding_sha256 bindingSha256,
      manifest_artifact_sha256 manifestArtifactSha256,marked_at markedAt FROM foundation_source_attachment_origins WHERE package_id=?`)
      .get(packageId) as SourceAttachmentOrigin | undefined;
    if (!row) return undefined;
    const source = await this.readVerified(packageId, budget);
    if (row.packageId !== source.packageId || row.originKind !== 'AUTOMATION_ATTACHMENT' || !/^[0-9a-f]{64}$/.test(row.bindingSha256) ||
        row.manifestArtifactSha256 !== source.manifestArtifactSha256 || row.markedAt !== source.manifest.finalizedAt)
      throw new FoundationIdentityConflictError('Attachment storage origin differs from its immutable source');
    return { ...row };
  }

  // Exact lookups read no artifacts, so a damaged or unrelated package outside
  // the match cannot affect them. Each match still needs readVerified.
  findFinalizedSourcePackagesByKey(packageKey: string): readonly FinalizedSourcePackageEntry[] {
    if (typeof packageKey !== 'string' || !packageKey) throw new FoundationValidationError('Invalid source package lookup key');
    return lookupEntries(this.#db.prepare(`SELECT ${ENTRY_COLUMNS} FROM foundation_source_packages
      WHERE finalized_at IS NOT NULL AND package_key=? ORDER BY version LIMIT 101`).all(packageKey));
  }

  findAutomationAttachmentPackagesByKeyPrefix(prefix: string): readonly FinalizedSourcePackageEntry[] {
    if (typeof prefix !== 'string' || prefix.length < 1 || prefix.length > 160 || /[\u0000-\u001f\u007f]/.test(prefix))
      throw new FoundationValidationError('Invalid automation attachment package-key prefix');
    return lookupEntries(this.#db.prepare(`SELECT p.package_id AS packageId,p.package_key AS packageKey,p.version,
        p.manifest_artifact_sha256 AS manifestArtifactSha256
      FROM foundation_source_packages p
      JOIN foundation_source_attachment_origins o ON o.package_id=p.package_id
      WHERE p.finalized_at IS NOT NULL AND o.origin_kind='AUTOMATION_ATTACHMENT'
        AND substr(p.package_key,1,?)=?
      ORDER BY p.package_key ASC,p.version ASC,p.package_id ASC LIMIT 101`).all(prefix.length, prefix));
  }

  findFinalizedSourcePackagesByMembership(version: number, paths: readonly string[]): readonly FinalizedSourcePackageEntry[] {
    if (!Number.isSafeInteger(version) || version < 1 || !paths.length || paths.some(item => typeof item !== 'string') || new Set(paths).size !== paths.length) {
      throw new FoundationValidationError('Invalid source package membership lookup');
    }
    // Logical paths are unique per package, so count plus containment is exact set equality.
    return lookupEntries(this.#db.prepare(`SELECT ${ENTRY_COLUMNS} FROM foundation_source_packages p
      WHERE p.finalized_at IS NOT NULL AND p.version=?
        AND (SELECT count(*) FROM foundation_source_package_files f WHERE f.package_id=p.package_id)=?
        AND NOT EXISTS (SELECT 1 FROM foundation_source_package_files f WHERE f.package_id=p.package_id
          AND f.logical_path NOT IN (${paths.map(() => '?').join(',')}))
      ORDER BY p.package_id LIMIT 101`).all(version, paths.length, ...paths));
  }

  async readVerified(packageId: string, budget?: SourcePackageReadBudget): Promise<VerifiedFinalizedSourcePackage> {
    if (budget) assertReadBudget(budget);
    const row = this.#db.prepare(`SELECT package_key AS packageKey,version,source_acquired_at AS sourceAcquiredAt,source_label AS sourceLabel,request_sha256 AS requestSha256,package_content_sha256 AS packageContentSha256,manifest_artifact_sha256 AS manifestSha256,finalized_at AS finalizedAt FROM foundation_source_packages WHERE package_id=? AND finalized_at IS NOT NULL`).get(packageId) as any;
    if (!row) throw new FoundationValidationError('Finalized source package not found');
    const artifactMetadataQuery = this.#db.prepare('SELECT byte_size AS byteSize,media_type AS mediaType,relative_path AS relativePath,contract_version AS contractVersion FROM artifact_manifests WHERE sha256=?');
    const manifestMetadata = this.#artifactMetadata(row.manifestSha256, 'application/json', artifactMetadataQuery);
    const dbFiles = this.#db.prepare(`SELECT logical_path AS path,artifact_sha256 AS sha256,byte_size AS byteSize,media_type AS mediaType,evidence_family AS evidenceFamily,representation_role AS representationRole,independence,provider_provenance AS providerProvenance,provenance_basis AS provenanceBasis,period_start AS periodStart,period_end AS periodEnd FROM foundation_source_package_files WHERE package_id=? ORDER BY logical_path`).all(packageId) as any[];
    const fileMetadata = dbFiles.map(file => ({ file, artifact: this.#artifactMetadata(file.sha256, file.mediaType, artifactMetadataQuery) }));
    if (budget) {
      const declaredSizes = [manifestMetadata.byteSize, ...fileMetadata.map(({ file }) => toBigInt(file.byteSize))];
      const actualSizes = [manifestMetadata.byteSize, ...fileMetadata.map(({ artifact }) => artifact.byteSize)];
      assertPackageReadBudget(budget, declaredSizes.map((declared, index) => declared > actualSizes[index]! ? declared : actualSizes[index]!));
    }
    const manifestBytes = await this.#verifiedArtifact(row.manifestSha256, 'application/json', artifactMetadataQuery, budget?.maxFileBytes);
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(manifestBytes)); }
    catch { throw new FoundationValidationError('Invalid source package manifest JSON'); }
    const manifest = validateSourcePackageManifest(parsed);
    if (!manifestBytes.equals(Buffer.from(canonicalJson(manifest)))) throw new FoundationIdentityConflictError('Source package manifest is not canonical');

    const files: VerifiedSourcePackageFile[] = [];
    for (const { file } of fileMetadata) {
      files.push({ path: file.path, sha256: file.sha256, byteSize: Number(file.byteSize), mediaType: file.mediaType, evidenceFamily: file.evidenceFamily, representationRole: file.representationRole, independence: file.independence, providerProvenance: file.providerProvenance, provenanceBasis: file.provenanceBasis, ...(file.periodStart === null ? {} : { period: { start: file.periodStart, end: file.periodEnd } }), bytes: await this.#verifiedArtifact(file.sha256, file.mediaType, artifactMetadataQuery, budget?.maxFileBytes) });
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

  async #verifiedArtifact(digest: string, mediaType: string, artifactMetadataQuery: Database.Statement, maxBytes?: number): Promise<Buffer> {
    const meta = this.#artifactMetadata(digest, mediaType, artifactMetadataQuery);
    const bytes = await this.#artifacts.read(digest, maxBytes === undefined ? undefined : { maxBytes });
    if (meta.byteSize !== BigInt(bytes.length)) throw new FoundationIdentityConflictError('Artifact size mismatch');
    return bytes;
  }

  #artifactMetadata(digest: string, mediaType: string, artifactMetadataQuery: Database.Statement): { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } {
    const meta = artifactMetadataQuery.get(digest) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string } | undefined;
    if (!meta || meta.byteSize < 0n || meta.mediaType !== mediaType || meta.relativePath !== `sha256/${digest.slice(0, 2)}/${digest}` || meta.contractVersion !== '1.0.0') throw new FoundationIdentityConflictError('Artifact manifest mismatch');
    return meta;
  }
}

const ENTRY_COLUMNS = 'package_id AS packageId,package_key AS packageKey,version,manifest_artifact_sha256 AS manifestArtifactSha256';

function lookupEntries(rows: unknown[]): readonly FinalizedSourcePackageEntry[] {
  if (rows.length > 100) throw new FoundationValidationError('Source package lookup exceeds the local enumeration limit');
  return (rows as { packageId: string; packageKey: string; version: number | bigint; manifestArtifactSha256: string }[])
    .map(row => ({ packageId: row.packageId, packageKey: row.packageKey, version: Number(row.version), manifestArtifactSha256: row.manifestArtifactSha256 }));
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
