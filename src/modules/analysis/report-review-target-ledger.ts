import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import requestSchema from '../../../contracts/analysis/report-review-target-create-request.schema.json' with { type: 'json' };
import type { ReportReviewTargetCreateRequest } from '../../../contracts/analysis/report-review-target-create-request.generated.js';
import type { ReportReviewTarget } from '../../../contracts/analysis/report-review-target.generated.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import {
  buildReportReviewTarget,
  type ReportReviewTargetInterpretationReader,
  type ReportReviewTargetReportReader,
} from './report-review-target.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateRequest = ajv.compile<ReportReviewTargetCreateRequest>(requestSchema);

const JSON_MEDIA = 'application/json';
const MAX_ARTIFACT_BYTES = 1024 * 1024;
const DIGEST = /^[0-9a-f]{64}$/;

export class ReportReviewTargetLedgerValidationError extends Error {}
export class ReportReviewTargetLedgerConflictError extends Error {}
export class ReportReviewTargetLedgerIntegrityError extends Error {}

export interface ReportReviewTargetLedgerExecution {
  readonly reviewTargetId: string;
  readonly reportId: string;
  readonly reportVersion: number;
  readonly interpretationId: string;
  readonly artifactSha256: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface VerifiedReportReviewTarget {
  readonly target: ReportReviewTarget;
  readonly targetBytes: Buffer;
  readonly storedAt: string;
}

interface TargetRow {
  readonly reviewTargetId: string;
  readonly reportId: string;
  readonly reportVersion: bigint;
  readonly reportVersionId: string;
  readonly semanticVersionId: string;
  readonly interpretationId: string;
  readonly interpretationContentSha256: string;
  readonly renderedReportSha256: string;
  readonly intendedUse: string;
  readonly artifactSha256: string;
  readonly artifactByteSize: bigint;
  readonly storedAt: string;
}

interface CreatedArtifact {
  readonly stored: StoredArtifact;
  readonly removeOnFailure: boolean;
}

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export class ReportReviewTargetLedgerService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #reports: ReportReviewTargetReportReader;
  readonly #interpretations: ReportReviewTargetInterpretationReader;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly reports: ReportReviewTargetReportReader;
    readonly interpretations: ReportReviewTargetInterpretationReader;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#reports = options.reports;
    this.#interpretations = options.interpretations;
    this.#now = options.now ?? (() => new Date());
  }

  async create(untrusted: unknown): Promise<ReportReviewTargetLedgerExecution> {
    const request = requestSnapshot(untrusted);
    const built = await buildReportReviewTarget({
      reportId: request.reportId,
      reportVersion: request.reportVersion,
      interpretationId: request.interpretationId,
      intendedUse: request.intendedUse,
      reports: this.#reports,
      interpretations: this.#interpretations,
    });
    const existing = this.#rowById(built.target.reviewTargetId);
    if (existing) return this.#verifiedRetry(existing, built.targetBytes);

    const createdArtifacts: CreatedArtifact[] = [];
    const stored = await this.#putTracked(built.targetBytes, createdArtifacts);
    const storedAt = this.#now().toISOString();
    let execution: ReportReviewTargetLedgerExecution;
    try {
      execution = await withDatabaseMutationMutex(this.#db, async () => {
        this.#db.exec('BEGIN IMMEDIATE');
        try {
          const raced = this.#rowById(built.target.reviewTargetId);
          if (raced) {
            const retry = await this.#verifiedRetry(raced, built.targetBytes);
            this.#db.exec('COMMIT');
            return retry;
          }
          let databaseMutations = this.#registerArtifact(stored, storedAt);
          databaseMutations += this.#db.prepare(`
            INSERT INTO analysis_report_review_targets(
              review_target_id, report_id, report_version, report_version_id,
              semantic_version_id, interpretation_id, interpretation_content_sha256,
              rendered_report_sha256, intended_use, artifact_sha256,
              artifact_byte_size, stored_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            built.target.reviewTargetId,
            built.target.report.reportId,
            built.target.report.version,
            built.target.report.versionId,
            built.target.report.semanticVersionId,
            built.target.interpretation.interpretationId,
            built.target.interpretation.interpretationContentSha256,
            built.target.renderedReport.sha256,
            built.target.approvalScope.intendedUse,
            stored.sha256,
            stored.byteSize,
            storedAt,
          ).changes;
          this.#db.exec('COMMIT');
          return executionFromTarget(built.target, stored.sha256, false, databaseMutations);
        } catch (error) {
          if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
          throw error;
        }
      });
    } catch (error) {
      await this.#removeUnregisteredArtifacts(createdArtifacts);
      throw error;
    }
    const verified = await this.read(execution.reviewTargetId);
    if (!verified.targetBytes.equals(built.targetBytes)) {
      throw new ReportReviewTargetLedgerIntegrityError('Persisted review target does not match its receipt');
    }
    return execution;
  }

  async read(reviewTargetId: string): Promise<VerifiedReportReviewTarget> {
    if (!DIGEST.test(reviewTargetId)) throw new ReportReviewTargetLedgerValidationError('Invalid reviewTargetId');
    const row = this.#rowById(reviewTargetId);
    if (!row) throw new ReportReviewTargetLedgerValidationError('Review target not found');
    const rebuilt = await buildReportReviewTarget({
      reportId: row.reportId,
      reportVersion: Number(row.reportVersion),
      interpretationId: row.interpretationId,
      intendedUse: row.intendedUse,
      reports: this.#reports,
      interpretations: this.#interpretations,
    });
    assertRowMatchesTarget(row, rebuilt.target);
    const retained = await this.#readRegisteredArtifact(row);
    if (!retained.equals(rebuilt.targetBytes)) {
      throw new ReportReviewTargetLedgerIntegrityError('Review target bytes do not match deterministic replay');
    }
    return { target: rebuilt.target, targetBytes: Buffer.from(retained), storedAt: row.storedAt };
  }

  async #verifiedRetry(row: TargetRow, expectedBytes: Buffer): Promise<ReportReviewTargetLedgerExecution> {
    const verified = await this.read(row.reviewTargetId);
    if (!verified.targetBytes.equals(expectedBytes)) {
      throw new ReportReviewTargetLedgerConflictError('Review target identity already exists with changed bytes');
    }
    return executionFromTarget(verified.target, row.artifactSha256, true, 0);
  }

  #rowById(reviewTargetId: string): TargetRow | undefined {
    return this.#db.prepare(`${targetSelect()} WHERE review_target_id = ?`).get(reviewTargetId) as TargetRow | undefined;
  }

  async #putTracked(value: Buffer, created: CreatedArtifact[]): Promise<StoredArtifact> {
    const sha256 = digest(value);
    const absolutePath = this.#artifacts.pathForDigest(sha256);
    const existed = await pathExists(absolutePath);
    const registered = this.#db.prepare('SELECT 1 found FROM artifact_manifests WHERE sha256 = ?').get(sha256) !== undefined;
    const stored = await this.#artifacts.put(value);
    if (!existed) created.push({ stored, removeOnFailure: !registered });
    return stored;
  }

  async #removeUnregisteredArtifacts(created: readonly CreatedArtifact[]): Promise<void> {
    const unique = new Map(created.map(item => [item.stored.sha256, item]));
    for (const { stored, removeOnFailure } of unique.values()) {
      if (!removeOnFailure) continue;
      if (this.#db.prepare('SELECT 1 found FROM artifact_manifests WHERE sha256 = ?').get(stored.sha256)) continue;
      const retained = await this.#artifacts.read(stored.sha256, { maxBytes: stored.byteSize });
      if (retained.byteLength !== stored.byteSize || digest(retained) !== stored.sha256) {
        throw new ReportReviewTargetLedgerIntegrityError('Review target changed before cleanup');
      }
      await fs.rm(stored.absolutePath);
    }
  }

  #registerArtifact(stored: StoredArtifact, storedAt: string): number {
    const inserted = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, ?, ?, ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, JSON_MEDIA, stored.relativePath, storedAt, storedAt);
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(stored.sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string;
      contractVersion: string; retentionStatus: string;
    } | undefined;
    if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== JSON_MEDIA ||
        row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new ReportReviewTargetLedgerConflictError('Review target artifact manifest metadata conflict');
    }
    return inserted.changes;
  }

  async #readRegisteredArtifact(row: TargetRow): Promise<Buffer> {
    const manifest = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(row.artifactSha256) as {
      byteSize: bigint; mediaType: string; relativePath: string;
      contractVersion: string; retentionStatus: string;
    } | undefined;
    let value: Buffer;
    try { value = await this.#artifacts.read(row.artifactSha256, { maxBytes: MAX_ARTIFACT_BYTES }); }
    catch { throw new ReportReviewTargetLedgerIntegrityError('Review target artifact is missing or corrupt'); }
    if (!manifest || manifest.byteSize !== row.artifactByteSize || manifest.byteSize !== BigInt(value.byteLength) ||
        manifest.mediaType !== JSON_MEDIA || manifest.relativePath !== `sha256/${row.artifactSha256.slice(0, 2)}/${row.artifactSha256}` ||
        manifest.contractVersion !== '1.0.0' || manifest.retentionStatus !== 'active' ||
        digest(value) !== row.artifactSha256) {
      throw new ReportReviewTargetLedgerIntegrityError('Review target artifact manifest metadata mismatch');
    }
    return value;
  }
}

export class AnalysisReportReviewTargetReader {
  readonly #service: ReportReviewTargetLedgerService;
  constructor(service: ReportReviewTargetLedgerService) { this.#service = service; }
  read(reviewTargetId: string): Promise<VerifiedReportReviewTarget> { return this.#service.read(reviewTargetId); }
}

function requestSnapshot(value: unknown): ReportReviewTargetCreateRequest {
  if (!validateRequest(value)) {
    throw new ReportReviewTargetLedgerValidationError(`Invalid review target request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  return JSON.parse(canonicalJson(value)) as ReportReviewTargetCreateRequest;
}

function executionFromTarget(
  target: ReportReviewTarget,
  artifactSha256: string,
  deduplicated: boolean,
  databaseMutations: number,
): ReportReviewTargetLedgerExecution {
  return {
    reviewTargetId: target.reviewTargetId,
    reportId: target.report.reportId,
    reportVersion: target.report.version,
    interpretationId: target.interpretation.interpretationId,
    artifactSha256,
    deduplicated,
    databaseMutations,
  };
}

function assertRowMatchesTarget(row: TargetRow, target: ReportReviewTarget): void {
  if (
    row.reviewTargetId !== target.reviewTargetId || row.reportId !== target.report.reportId ||
    Number(row.reportVersion) !== target.report.version || row.reportVersionId !== target.report.versionId ||
    row.semanticVersionId !== target.report.semanticVersionId ||
    row.interpretationId !== target.interpretation.interpretationId ||
    row.interpretationContentSha256 !== target.interpretation.interpretationContentSha256 ||
    row.renderedReportSha256 !== target.renderedReport.sha256 ||
    row.intendedUse !== target.approvalScope.intendedUse || row.artifactSha256 !== digest(Buffer.from(`${canonicalJson(target)}\n`, 'utf8'))
  ) throw new ReportReviewTargetLedgerIntegrityError('Review target row does not match deterministic replay');
}

function targetSelect(): string {
  return `SELECT review_target_id reviewTargetId, report_id reportId, report_version reportVersion,
    report_version_id reportVersionId, semantic_version_id semanticVersionId,
    interpretation_id interpretationId, interpretation_content_sha256 interpretationContentSha256,
    rendered_report_sha256 renderedReportSha256, intended_use intendedUse,
    artifact_sha256 artifactSha256, artifact_byte_size artifactByteSize, stored_at storedAt
    FROM analysis_report_review_targets`;
}

async function pathExists(filePath: string): Promise<boolean> {
  try { await fs.access(filePath); return true; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
