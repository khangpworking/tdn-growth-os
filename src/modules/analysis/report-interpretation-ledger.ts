import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import artifactSchema from '../../../contracts/analysis/report-interpretation-artifact.schema.json' with { type: 'json' };
import type { ReportInterpretationArtifact } from '../../../contracts/analysis/report-interpretation-artifact.generated.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import {
  buildEvidenceBoundReportInterpretation,
  type ReportInterpretationConfiguration,
  type ReportInterpretationTelemetry,
} from './report-interpretation.js';
import {
  AnalysisReportVersionReader,
  type VerifiedReportInterpretationSource,
} from './report-version-service.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateArtifact = ajv.compile<ReportInterpretationArtifact>(artifactSchema);

const JSON_MEDIA = 'application/json';
const PROMPT_MEDIA = 'text/plain; charset=utf-8';
const MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const MAX_PROMPT_BYTES = 512 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ReportInterpretationLedgerValidationError extends Error {}
export class ReportInterpretationLedgerConflictError extends Error {}
export class ReportInterpretationLedgerIntegrityError extends Error {}

export interface ReportInterpretationLedgerExecution {
  readonly interpretationId: string;
  readonly reportId: string;
  readonly reportVersion: number;
  readonly interpretationNumber: number;
  readonly interpretationContentSha256: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface ReportInterpretationLedgerRecord {
  readonly interpretationId: string;
  readonly reportId: string;
  readonly reportVersion: number;
  readonly reportVersionId: string;
  readonly interpretationNumber: number;
  readonly interpretationContentSha256: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly artifactByteSize: number;
  readonly promptArtifactSha256: string;
  readonly promptByteSize: number;
  readonly sourceSemanticVersionId: string;
  readonly sourcePacketId: string;
  readonly sourcePacketSha256: string;
  readonly sourceClaimsSha256: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptId: string;
  readonly promptVersion: number;
  readonly outputSchemaVersion: '1.0.0';
  readonly providerRequestId?: string;
  readonly inputTokenCount?: number;
  readonly outputTokenCount?: number;
  readonly latencyMs?: number;
  readonly completedAt: string;
  readonly storedAt: string;
}

export interface VerifiedReportInterpretation {
  readonly record: ReportInterpretationLedgerRecord;
  readonly artifact: ReportInterpretationArtifact;
  readonly artifactBytes: Buffer;
}

interface RunRow {
  readonly interpretationId: string;
  readonly reportId: string;
  readonly reportVersion: bigint;
  readonly reportVersionId: string;
  readonly interpretationNumber: bigint;
  readonly interpretationContentSha256: string;
  readonly requestSha256: string;
  readonly artifactSha256: string;
  readonly artifactByteSize: bigint;
  readonly promptArtifactSha256: string;
  readonly promptByteSize: bigint;
  readonly sourceSemanticVersionId: string;
  readonly sourcePacketId: string;
  readonly sourcePacketSha256: string;
  readonly sourceClaimsSha256: string;
  readonly providerId: string;
  readonly modelId: string;
  readonly promptId: string;
  readonly promptVersion: bigint;
  readonly promptSha256: string;
  readonly outputSchemaVersion: '1.0.0';
  readonly providerRequestId: string | null;
  readonly inputTokenCount: bigint | null;
  readonly outputTokenCount: bigint | null;
  readonly latencyMs: bigint | null;
  readonly completedAt: string;
  readonly storedAt: string;
}

interface CreatedArtifact {
  readonly stored: StoredArtifact;
  readonly removeOnFailure: boolean;
}

export class ReportInterpretationLedgerService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #reports: AnalysisReportVersionReader;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly reports: AnalysisReportVersionReader;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#reports = options.reports;
    this.#now = options.now ?? (() => new Date());
  }

  async persist(options: {
    readonly reportId: string;
    readonly reportVersion: number;
    readonly artifactBytes: Buffer;
    readonly promptText: string;
  }): Promise<ReportInterpretationLedgerExecution> {
    assertReportIdentity(options.reportId, options.reportVersion);
    const artifactBytes = Buffer.from(options.artifactBytes);
    const promptBytes = Buffer.from(options.promptText, 'utf8');
    if (artifactBytes.byteLength < 1 || artifactBytes.byteLength > MAX_ARTIFACT_BYTES) {
      throw new ReportInterpretationLedgerValidationError('Interpretation artifact size is invalid');
    }
    if (promptBytes.byteLength < 1 || promptBytes.byteLength > MAX_PROMPT_BYTES || options.promptText.trim() !== options.promptText) {
      throw new ReportInterpretationLedgerValidationError('Interpretation prompt is invalid');
    }
    const source = await this.#reports.readInterpretationSource(options.reportId, options.reportVersion);
    const artifact = rebuildAndVerify(artifactBytes, options.promptText, source);
    const existing = this.#rowById(artifact.interpretationId);
    if (existing) return this.#verifiedRetry(existing, source, artifactBytes, options.promptText);

    const storedAt = exactTimestamp(this.#now());
    return withDatabaseMutationMutex(this.#db, async () => {
      this.#db.exec('BEGIN IMMEDIATE');
      let execution: ReportInterpretationLedgerExecution;
      const createdArtifacts: CreatedArtifact[] = [];
      try {
        const raced = this.#rowById(artifact.interpretationId);
        if (raced) {
          execution = await this.#verifiedRetry(raced, source, artifactBytes, options.promptText);
        } else {
          const storedArtifact = await this.#putTracked(artifactBytes, createdArtifacts);
          const storedPrompt = await this.#putTracked(promptBytes, createdArtifacts);
          const interpretationNumber = this.#nextNumber(options.reportId, options.reportVersion);
          let databaseMutations = 0;
          databaseMutations += this.#registerArtifact(storedArtifact, JSON_MEDIA, storedAt);
          databaseMutations += this.#registerArtifact(storedPrompt, PROMPT_MEDIA, storedAt);
          const generation = artifact.generation;
          databaseMutations += this.#db.prepare(`
            INSERT INTO analysis_report_interpretation_runs(
              interpretation_id, report_id, report_version, report_version_id, interpretation_number,
              interpretation_content_sha256, request_sha256, artifact_sha256, artifact_byte_size,
              prompt_artifact_sha256, prompt_byte_size, source_semantic_version_id, source_packet_id,
              source_packet_sha256, source_claims_sha256, provider_id, model_id, prompt_id,
              prompt_version, prompt_sha256, output_schema_version, provider_request_id,
              input_token_count, output_token_count, latency_ms, completed_at, stored_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            artifact.interpretationId, options.reportId, options.reportVersion, source.record.versionId,
            interpretationNumber, artifact.interpretationContentSha256, artifact.requestSha256,
            storedArtifact.sha256, storedArtifact.byteSize, storedPrompt.sha256, storedPrompt.byteSize,
            artifact.source.semanticVersionId, artifact.source.packetId, artifact.source.packetSha256,
            artifact.source.claimsSha256, generation.providerId, generation.modelId, generation.promptId,
            generation.promptVersion, generation.promptSha256, generation.outputSchemaVersion,
            generation.providerRequestId ?? null, generation.inputTokenCount ?? null,
            generation.outputTokenCount ?? null, generation.latencyMs ?? null, artifact.completedAt, storedAt,
          ).changes;
          execution = {
            interpretationId: artifact.interpretationId,
            reportId: options.reportId,
            reportVersion: options.reportVersion,
            interpretationNumber,
            interpretationContentSha256: artifact.interpretationContentSha256,
            deduplicated: false,
            databaseMutations,
          };
        }
        this.#db.exec('COMMIT');
      } catch (error) {
        let cleanupError: unknown;
        try {
          await this.#removeUnregisteredArtifacts(createdArtifacts);
        } catch (cleanupFailure) {
          cleanupError = cleanupFailure;
        }
        if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
        if (cleanupError) {
          throw new ReportInterpretationLedgerIntegrityError('Failed to clean up interpretation artifacts', { cause: cleanupError });
        }
        throw error;
      }
      const verified = await this.read(
        execution.reportId, execution.reportVersion, execution.interpretationId,
      );
      if (verified.record.interpretationNumber !== execution.interpretationNumber) {
        throw new ReportInterpretationLedgerIntegrityError('Persisted interpretation receipt does not match');
      }
      return execution;
    });
  }

  async read(reportId: string, reportVersion: number, interpretationId: string): Promise<VerifiedReportInterpretation> {
    assertReportIdentity(reportId, reportVersion);
    if (!UUID.test(interpretationId)) throw new ReportInterpretationLedgerValidationError('Invalid interpretationId');
    const row = this.#rowById(interpretationId);
    if (!row || row.reportId !== reportId || Number(row.reportVersion) !== reportVersion) {
      throw new ReportInterpretationLedgerValidationError('Interpretation not found for the exact report version');
    }
    const source = await this.#reports.readInterpretationSource(reportId, reportVersion);
    if (source.record.versionId !== row.reportVersionId) {
      throw new ReportInterpretationLedgerIntegrityError('Interpretation report identity mismatch');
    }
    const artifactBytes = await this.#readRegisteredArtifact(row.artifactSha256, JSON_MEDIA, row.artifactByteSize, MAX_ARTIFACT_BYTES);
    const promptBytes = await this.#readRegisteredArtifact(row.promptArtifactSha256, PROMPT_MEDIA, row.promptByteSize, MAX_PROMPT_BYTES);
    if (digest(promptBytes) !== row.promptSha256) {
      throw new ReportInterpretationLedgerIntegrityError('Interpretation prompt digest mismatch');
    }
    const promptText = decodeUtf8(promptBytes);
    const artifact = rebuildAndVerify(artifactBytes, promptText, source);
    assertRowMatchesArtifact(row, artifact);
    return { record: record(row), artifact, artifactBytes: Buffer.from(artifactBytes) };
  }

  async list(reportId: string, reportVersion: number): Promise<readonly VerifiedReportInterpretation[]> {
    assertReportIdentity(reportId, reportVersion);
    await this.#reports.readInterpretationSource(reportId, reportVersion);
    const ids = this.#db.prepare(`
      SELECT interpretation_id interpretationId
      FROM analysis_report_interpretation_runs
      WHERE report_id = ? AND report_version = ?
      ORDER BY interpretation_number
      LIMIT 1001
    `).all(reportId, reportVersion) as Array<{ interpretationId: string }>;
    if (ids.length > 1000) throw new ReportInterpretationLedgerIntegrityError('Interpretation history exceeds the read limit');
    const results: VerifiedReportInterpretation[] = [];
    for (const { interpretationId } of ids) results.push(await this.read(reportId, reportVersion, interpretationId));
    return results;
  }

  async #verifiedRetry(
    row: RunRow,
    source: VerifiedReportInterpretationSource,
    artifactBytes: Buffer,
    promptText: string,
  ): Promise<ReportInterpretationLedgerExecution> {
    const rebuilt = rebuildAndVerify(artifactBytes, promptText, source);
    const promptSha256 = digest(Buffer.from(promptText, 'utf8'));
    if (
      row.reportId !== source.record.reportId || Number(row.reportVersion) !== source.record.version ||
      row.artifactSha256 !== digest(artifactBytes) || row.promptSha256 !== promptSha256 ||
      row.promptArtifactSha256 !== promptSha256 || row.interpretationContentSha256 !== rebuilt.interpretationContentSha256
    ) throw new ReportInterpretationLedgerConflictError('Interpretation identity already exists with changed content');
    const verified = await this.read(row.reportId, Number(row.reportVersion), row.interpretationId);
    if (!verified.artifactBytes.equals(artifactBytes)) {
      throw new ReportInterpretationLedgerConflictError('Interpretation identity already exists with changed bytes');
    }
    return {
      interpretationId: row.interpretationId,
      reportId: row.reportId,
      reportVersion: Number(row.reportVersion),
      interpretationNumber: Number(row.interpretationNumber),
      interpretationContentSha256: row.interpretationContentSha256,
      deduplicated: true,
      databaseMutations: 0,
    };
  }

  #nextNumber(reportId: string, reportVersion: number): number {
    const row = this.#db.prepare(`
      SELECT COALESCE(MAX(interpretation_number), 0) + 1 next
      FROM analysis_report_interpretation_runs WHERE report_id = ? AND report_version = ?
    `).get(reportId, reportVersion) as { next: bigint };
    return Number(row.next);
  }

  #rowById(interpretationId: string): RunRow | undefined {
    return this.#db.prepare(`${runSelect()} WHERE interpretation_id = ?`).get(interpretationId) as RunRow | undefined;
  }

  async #putTracked(bytes: Buffer, createdArtifacts: CreatedArtifact[]): Promise<StoredArtifact> {
    const sha256 = digest(bytes);
    const absolutePath = this.#artifacts.pathForDigest(sha256);
    const existed = await pathExists(absolutePath);
    const registered = this.#db.prepare('SELECT 1 found FROM artifact_manifests WHERE sha256 = ?').get(sha256) !== undefined;
    const stored = await this.#artifacts.put(bytes);
    if (!existed) createdArtifacts.push({ stored, removeOnFailure: !registered });
    return stored;
  }

  async #removeUnregisteredArtifacts(artifacts: readonly CreatedArtifact[]): Promise<void> {
    const unique = new Map(artifacts.map(({ stored, removeOnFailure }) => [stored.sha256, { stored, removeOnFailure }]));
    for (const { stored, removeOnFailure } of unique.values()) {
      if (!removeOnFailure) continue;
      const bytes = await this.#artifacts.read(stored.sha256, { maxBytes: stored.byteSize });
      if (bytes.byteLength !== stored.byteSize || digest(bytes) !== stored.sha256) {
        throw new ReportInterpretationLedgerIntegrityError('Interpretation artifact changed before cleanup');
      }
      await fs.rm(stored.absolutePath);
    }
  }

  #registerArtifact(stored: StoredArtifact, mediaType: string, storedAt: string): number {
    const result = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, ?, ?, ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, mediaType, stored.relativePath, storedAt, storedAt);
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(stored.sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string;
    } | undefined;
    if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== mediaType ||
        row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new ReportInterpretationLedgerConflictError('Interpretation artifact manifest metadata conflict');
    }
    return result.changes;
  }

  async #readRegisteredArtifact(sha256: string, mediaType: string, byteSize: bigint, maxBytes: number): Promise<Buffer> {
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string;
    } | undefined;
    let bytes: Buffer;
    try { bytes = await this.#artifacts.read(sha256, { maxBytes }); }
    catch { throw new ReportInterpretationLedgerIntegrityError('Interpretation artifact is missing or corrupt'); }
    if (!row || row.byteSize !== byteSize || row.byteSize !== BigInt(bytes.byteLength) || row.mediaType !== mediaType ||
        row.relativePath !== `sha256/${sha256.slice(0, 2)}/${sha256}` || row.contractVersion !== '1.0.0' ||
        row.retentionStatus !== 'active' || digest(bytes) !== sha256) {
      throw new ReportInterpretationLedgerIntegrityError('Interpretation artifact manifest metadata mismatch');
    }
    return bytes;
  }
}

export class AnalysisReportInterpretationReader {
  readonly #service: ReportInterpretationLedgerService;
  constructor(service: ReportInterpretationLedgerService) { this.#service = service; }
  read(reportId: string, reportVersion: number, interpretationId: string): Promise<VerifiedReportInterpretation> {
    return this.#service.read(reportId, reportVersion, interpretationId);
  }
  list(reportId: string, reportVersion: number): Promise<readonly VerifiedReportInterpretation[]> {
    return this.#service.list(reportId, reportVersion);
  }
}

function rebuildAndVerify(
  bytes: Buffer,
  promptText: string,
  source: VerifiedReportInterpretationSource,
): ReportInterpretationArtifact {
  const artifact = parseCanonicalArtifact(bytes);
  if (digest(Buffer.from(promptText, 'utf8')) !== artifact.generation.promptSha256) {
    throw new ReportInterpretationLedgerValidationError('Prompt text does not match the interpretation artifact');
  }
  const sectionIds = [...new Set(artifact.items.map(item => item.sectionId))].sort();
  const request = {
    contractVersion: '1.0.0',
    semanticVersionId: artifact.source.semanticVersionId,
    packetId: artifact.source.packetId,
    sectionIds,
  };
  const output = {
    items: artifact.items.map(item => ({
      sectionId: item.sectionId,
      kind: item.kind,
      conclusion: item.conclusion,
      evidenceLogic: item.evidenceLogic,
      supportingClaimIds: [...item.supportingClaimIds],
      assumptions: [...item.assumptions],
      limitations: [...item.limitations],
    })),
  };
  const configuration: ReportInterpretationConfiguration = {
    providerId: artifact.generation.providerId,
    modelId: artifact.generation.modelId,
    promptId: artifact.generation.promptId,
    promptVersion: artifact.generation.promptVersion,
    promptText,
    outputSchemaVersion: artifact.generation.outputSchemaVersion,
  };
  const telemetry: ReportInterpretationTelemetry = {
    ...(artifact.generation.providerRequestId === undefined ? {} : { providerRequestId: artifact.generation.providerRequestId }),
    ...(artifact.generation.inputTokenCount === undefined ? {} : { inputTokenCount: artifact.generation.inputTokenCount }),
    ...(artifact.generation.outputTokenCount === undefined ? {} : { outputTokenCount: artifact.generation.outputTokenCount }),
    ...(artifact.generation.latencyMs === undefined ? {} : { latencyMs: artifact.generation.latencyMs }),
  };
  let rebuilt;
  try {
    rebuilt = buildEvidenceBoundReportInterpretation({
      request,
      output,
      bundle: source.bundle,
      configuration,
      telemetry,
      now: () => new Date(artifact.completedAt),
      createId: () => artifact.interpretationId,
    });
  } catch (cause) {
    throw new ReportInterpretationLedgerIntegrityError('Interpretation cannot be replayed against its exact evidence', { cause });
  }
  if (!rebuilt.artifactBytes.equals(bytes)) {
    throw new ReportInterpretationLedgerIntegrityError('Interpretation bytes do not match deterministic replay');
  }
  return artifact;
}

function parseCanonicalArtifact(bytes: Buffer): ReportInterpretationArtifact {
  let value: unknown;
  try { value = JSON.parse(decodeUtf8(bytes)); }
  catch { throw new ReportInterpretationLedgerValidationError('Interpretation artifact is not valid JSON'); }
  if (!validateArtifact(value)) {
    throw new ReportInterpretationLedgerValidationError(`Interpretation artifact contract is invalid: ${ajv.errorsText(validateArtifact.errors)}`);
  }
  const canonical = Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
  if (!canonical.equals(bytes)) throw new ReportInterpretationLedgerValidationError('Interpretation artifact is not canonical JSON');
  return value;
}

function assertRowMatchesArtifact(row: RunRow, artifact: ReportInterpretationArtifact): void {
  const generation = artifact.generation;
  if (
    row.interpretationContentSha256 !== artifact.interpretationContentSha256 ||
    row.requestSha256 !== artifact.requestSha256 || row.sourceSemanticVersionId !== artifact.source.semanticVersionId ||
    row.sourcePacketId !== artifact.source.packetId || row.sourcePacketSha256 !== artifact.source.packetSha256 ||
    row.sourceClaimsSha256 !== artifact.source.claimsSha256 || row.providerId !== generation.providerId ||
    row.modelId !== generation.modelId || row.promptId !== generation.promptId ||
    Number(row.promptVersion) !== generation.promptVersion || row.promptSha256 !== generation.promptSha256 ||
    row.outputSchemaVersion !== generation.outputSchemaVersion || row.providerRequestId !== (generation.providerRequestId ?? null) ||
    optionalNumber(row.inputTokenCount) !== generation.inputTokenCount ||
    optionalNumber(row.outputTokenCount) !== generation.outputTokenCount || optionalNumber(row.latencyMs) !== generation.latencyMs ||
    row.completedAt !== artifact.completedAt
  ) throw new ReportInterpretationLedgerIntegrityError('Interpretation metadata does not match its artifact');
}

function record(row: RunRow): ReportInterpretationLedgerRecord {
  return {
    interpretationId: row.interpretationId,
    reportId: row.reportId,
    reportVersion: Number(row.reportVersion),
    reportVersionId: row.reportVersionId,
    interpretationNumber: Number(row.interpretationNumber),
    interpretationContentSha256: row.interpretationContentSha256,
    requestSha256: row.requestSha256,
    artifactSha256: row.artifactSha256,
    artifactByteSize: Number(row.artifactByteSize),
    promptArtifactSha256: row.promptArtifactSha256,
    promptByteSize: Number(row.promptByteSize),
    sourceSemanticVersionId: row.sourceSemanticVersionId,
    sourcePacketId: row.sourcePacketId,
    sourcePacketSha256: row.sourcePacketSha256,
    sourceClaimsSha256: row.sourceClaimsSha256,
    providerId: row.providerId,
    modelId: row.modelId,
    promptId: row.promptId,
    promptVersion: Number(row.promptVersion),
    outputSchemaVersion: row.outputSchemaVersion,
    ...(row.providerRequestId === null ? {} : { providerRequestId: row.providerRequestId }),
    ...(row.inputTokenCount === null ? {} : { inputTokenCount: Number(row.inputTokenCount) }),
    ...(row.outputTokenCount === null ? {} : { outputTokenCount: Number(row.outputTokenCount) }),
    ...(row.latencyMs === null ? {} : { latencyMs: Number(row.latencyMs) }),
    completedAt: row.completedAt,
    storedAt: row.storedAt,
  };
}

function runSelect(): string {
  return `SELECT interpretation_id interpretationId, report_id reportId, report_version reportVersion,
    report_version_id reportVersionId, interpretation_number interpretationNumber,
    interpretation_content_sha256 interpretationContentSha256, request_sha256 requestSha256,
    artifact_sha256 artifactSha256, artifact_byte_size artifactByteSize,
    prompt_artifact_sha256 promptArtifactSha256, prompt_byte_size promptByteSize,
    source_semantic_version_id sourceSemanticVersionId, source_packet_id sourcePacketId,
    source_packet_sha256 sourcePacketSha256, source_claims_sha256 sourceClaimsSha256,
    provider_id providerId, model_id modelId, prompt_id promptId, prompt_version promptVersion,
    prompt_sha256 promptSha256, output_schema_version outputSchemaVersion,
    provider_request_id providerRequestId, input_token_count inputTokenCount,
    output_token_count outputTokenCount, latency_ms latencyMs, completed_at completedAt, stored_at storedAt
    FROM analysis_report_interpretation_runs`;
}

function assertReportIdentity(reportId: string, reportVersion: number): void {
  if (!UUID.test(reportId)) throw new ReportInterpretationLedgerValidationError('Invalid reportId');
  if (!Number.isSafeInteger(reportVersion) || reportVersion < 1 || reportVersion > 10000) {
    throw new ReportInterpretationLedgerValidationError('Invalid reportVersion');
  }
}

function exactTimestamp(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new ReportInterpretationLedgerValidationError('Invalid storage timestamp');
  return now.toISOString();
}

function decodeUtf8(bytes: Buffer): string {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes)) {
    throw new ReportInterpretationLedgerValidationError('Interpretation text is not valid UTF-8');
  }
  return text;
}

function optionalNumber(value: bigint | null): number | undefined {
  return value === null ? undefined : Number(value);
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
