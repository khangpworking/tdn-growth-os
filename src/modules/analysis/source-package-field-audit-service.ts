import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { SourcePackageFieldAuditRequest } from '../../../contracts/analysis/source-package-field-audit-request.generated.js';
import type { SourcePackageFieldAuditResult } from '../../../contracts/analysis/source-package-field-audit-result.generated.js';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import { canonicalJson } from '../foundation/index.js';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { VerifiedFinalizedSourcePackage } from '../foundation/source-package-service.js';
import {
  AnalysisValidationError,
  canonicalizeSourcePackageFieldAuditCollections,
  validateSourcePackageFieldAuditRequest,
  validateSourcePackageFieldAuditResult,
} from './validation.js';

export interface SourcePackageFieldAuditExecution { readonly resultId: string; readonly resultArtifactSha256: string; readonly deduplicated: boolean; readonly databaseMutations: number }
export interface VerifiedSourcePackageFieldAudit { readonly resultId: string; readonly resultArtifactSha256: string; readonly result: SourcePackageFieldAuditResult }
export class SourcePackageFieldAuditIdentityConflictError extends Error {}

export class SourcePackageFieldAuditService {
  constructor(private readonly options: { readonly db: Database.Database; readonly artifactStore: ContentAddressedArtifactStore; readonly sourcePackages: FinalizedSourcePackageReader; readonly now?: () => Date }) {}

  async audit(value: unknown): Promise<SourcePackageFieldAuditExecution> {
    const validated = validateSourcePackageFieldAuditRequest(value);
    const request = canonicalizeSourcePackageFieldAuditCollections(validated);
    const pack = this.#find(request.packageKey, request.version);
    const verified = await this.options.sourcePackages.readFinalizedSourcePackage(pack.packageId);
    this.#validateReferences(request, verified);
    const requestSha256 = sha256(Buffer.from(canonicalJson(request)));
    const existing = this.options.db.prepare('SELECT result_id AS resultId,result_artifact_sha256 AS digest,package_manifest_sha256 AS manifest,request_sha256 AS request FROM analysis_source_package_field_audit_results WHERE package_id=? AND request_sha256=?').get(pack.packageId, requestSha256) as any;
    if (existing) {
      if (existing.manifest !== verified.manifestArtifactSha256 || existing.request !== requestSha256) throw new SourcePackageFieldAuditIdentityConflictError('Audit identity drift');
      await this.readByDigest(existing.digest);
      return { resultId: existing.resultId, resultArtifactSha256: existing.digest, deduplicated: true, databaseMutations: 0 };
    }

    const resultId = randomUUID();
    const completedAt = (this.options.now?.() ?? new Date()).toISOString();
    const result: SourcePackageFieldAuditResult = { contractVersion: '1.0.0', resultId, completedAt, sourcePackage: { packageId: pack.packageId, packageKey: request.packageKey, version: request.version, manifestSha256: verified.manifestArtifactSha256 }, requestSha256, observations: request.observations, conflicts: request.conflicts, periodComparisons: request.periodComparisons };
    validateSourcePackageFieldAuditResult(result);
    const stored = await this.options.artifactStore.put(Buffer.from(canonicalJson(result)));
    const mutations = this.options.db.transaction(() => {
      let count = 0;
      const info = this.options.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES(?,?, 'application/json',?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`).run(stored.sha256, stored.byteSize, stored.relativePath, completedAt, completedAt);
      count += Number(info.changes);
      const artifact = this.options.db.prepare('SELECT byte_size AS size,media_type AS media,relative_path AS path FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as any;
      if (artifact.size !== BigInt(stored.byteSize) || artifact.media !== 'application/json' || artifact.path !== stored.relativePath) throw new SourcePackageFieldAuditIdentityConflictError('Result artifact metadata conflict');
      this.options.db.prepare('INSERT INTO analysis_source_package_field_audit_results(result_id,package_id,package_manifest_sha256,request_sha256,result_artifact_sha256,completed_at) VALUES(?,?,?,?,?,?)').run(resultId, pack.packageId, verified.manifestArtifactSha256, requestSha256, stored.sha256, completedAt);
      return count + 1;
    })();
    return { resultId, resultArtifactSha256: stored.sha256, deduplicated: false, databaseMutations: mutations };
  }

  async readByDigest(digest: string): Promise<VerifiedSourcePackageFieldAudit> {
    const row = this.options.db.prepare(`SELECT result_id AS resultId,package_id AS packageId,package_manifest_sha256 AS manifest,request_sha256 AS request,completed_at AS completed,a.byte_size AS size,a.media_type AS media,a.relative_path AS path,a.contract_version AS contract FROM analysis_source_package_field_audit_results r JOIN artifact_manifests a ON a.sha256=r.result_artifact_sha256 WHERE r.result_artifact_sha256=?`).get(digest) as any;
    if (!row) throw new AnalysisValidationError('Field audit not found');
    const bytes = await this.options.artifactStore.read(digest);
    if (row.size !== BigInt(bytes.length) || row.media !== 'application/json' || row.path !== `sha256/${digest.slice(0, 2)}/${digest}` || row.contract !== '1.0.0') throw new SourcePackageFieldAuditIdentityConflictError('Field audit artifact metadata mismatch');
    let parsed: unknown;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new AnalysisValidationError('Invalid field audit JSON'); }
    const result = validateSourcePackageFieldAuditResult(parsed);
    const replayedRequest = canonicalizeSourcePackageFieldAuditCollections({
      contractVersion: result.contractVersion,
      packageKey: result.sourcePackage.packageKey,
      version: result.sourcePackage.version,
      observations: result.observations,
      conflicts: result.conflicts,
      periodComparisons: result.periodComparisons,
    } as SourcePackageFieldAuditRequest);
    if (
      sha256(Buffer.from(canonicalJson(replayedRequest))) !== result.requestSha256 ||
      !bytes.equals(Buffer.from(canonicalJson(result))) ||
      result.resultId !== row.resultId ||
      result.completedAt !== row.completed ||
      result.requestSha256 !== row.request ||
      result.sourcePackage.packageId !== row.packageId ||
      result.sourcePackage.manifestSha256 !== row.manifest
    ) throw new SourcePackageFieldAuditIdentityConflictError('Field audit immutable replay mismatch');
    const pack = await this.options.sourcePackages.readFinalizedSourcePackage(row.packageId);
    if (
      pack.manifestArtifactSha256 !== row.manifest ||
      pack.manifest.packageKey !== result.sourcePackage.packageKey ||
      pack.manifest.version !== result.sourcePackage.version
    ) throw new SourcePackageFieldAuditIdentityConflictError('Source package lineage drift');
    this.#validateReferences(result, pack);
    return { resultId: row.resultId, resultArtifactSha256: digest, result };
  }

  async replay(resultId: string): Promise<VerifiedSourcePackageFieldAudit> {
    const row = this.options.db.prepare('SELECT result_artifact_sha256 AS digest FROM analysis_source_package_field_audit_results WHERE result_id=?').get(resultId) as any;
    if (!row) throw new AnalysisValidationError('Field audit not found');
    return this.readByDigest(row.digest);
  }

  #find(key: string, version: number): { packageId: string } {
    const row = this.options.db.prepare('SELECT package_id AS packageId FROM foundation_source_packages WHERE package_key=? AND version=? AND finalized_at IS NOT NULL').get(key, version) as any;
    if (!row) throw new AnalysisValidationError('Source package not found');
    return row;
  }

  #validateReferences(request: Pick<SourcePackageFieldAuditRequest, 'observations' | 'periodComparisons'>, pack: VerifiedFinalizedSourcePackage): void {
    const files = new Map(pack.files.map((file) => [file.path, file]));
    const observations = new Map(request.observations.map((observation) => [observation.observationKey, observation]));
    for (const observation of request.observations) {
      const file = files.get(observation.representationPath);
      if (!file || file.sha256 !== observation.representationSha256 || file.evidenceFamily !== observation.evidenceFamily) throw new AnalysisValidationError(`Observation representation does not match package membership: ${observation.observationKey}`);
      const allowed = locatorMediaTypes(observation.locator.type);
      if (!allowed.has(file.mediaType.toLowerCase())) throw new AnalysisValidationError(`Locator type does not match representation media type: ${observation.observationKey}`);
    }
    for (const comparison of request.periodComparisons) {
      const left = observations.get(comparison.leftObservationKey)!;
      const right = observations.get(comparison.rightObservationKey)!;
      const leftFile = files.get(left.representationPath)!;
      const rightFile = files.get(right.representationPath)!;
      const samePeriod = leftFile.period !== undefined && rightFile.period !== undefined && leftFile.period.start === rightFile.period.start && leftFile.period.end === rightFile.period.end;
      if (left.evidenceFamily !== right.evidenceFamily) {
        if (comparison.compatibility !== 'incompatible' || comparison.claim !== null) {
          throw new AnalysisValidationError(
            'Cross-family periods may only be recorded as incompatible with a null claim',
          );
        }
      } else if (comparison.compatibility === 'compatible' && !samePeriod) {
        throw new AnalysisValidationError(
          'A period comparison may be claimed compatible only for identical declared periods',
        );
      }
    }
  }
}

function locatorMediaTypes(type: string): ReadonlySet<string> {
  if (type === 'html_text') return new Set(['text/html', 'application/xhtml+xml']);
  if (type === 'pdf_page') return new Set(['application/pdf']);
  if (type === 'xlsx_cell') return new Set(['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
  return new Set(['application/json']);
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
