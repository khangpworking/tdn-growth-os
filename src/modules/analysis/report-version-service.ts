import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import requestSchema from '../../../contracts/analysis/report-version-create-request.schema.json' with { type: 'json' };
import recordSchema from '../../../contracts/analysis/report-version-record.schema.json' with { type: 'json' };
import sourceRequestSchema from '../../../contracts/analysis/source-backed-report-request.schema.json' with { type: 'json' };
import type { ReportVersionCreateRequest } from '../../../contracts/analysis/report-version-create-request.generated.js';
import type { ReportVersionRecord } from '../../../contracts/analysis/report-version-record.generated.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { buildReportSemanticContent, buildUnreviewedReportState } from './report-semantic-content.js';
import { renderResearchReportHtml } from './research-report-html.js';
import { buildSourceBackedReport, type SourceBackedReportBundle, type SourceBackedReportDependencies } from './source-backed-report.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(sourceRequestSchema);
const validateRequest = ajv.compile<ReportVersionCreateRequest>(requestSchema);
const validateRecord = ajv.compile<ReportVersionRecord>(recordSchema);

const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JSON_MEDIA = 'application/json';
const MAX_ARTIFACT_BYTES = 32 * 1024 * 1024;

export class ReportVersionValidationError extends Error {}
export class ReportVersionIdentityConflictError extends Error {}
export class ReportVersionIntegrityError extends Error {}

export interface ReportVersionExecution {
  readonly reportId: string;
  readonly versionId: string;
  readonly version: number;
  readonly semanticVersionId: string;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

interface SeriesRow {
  readonly reportId: string;
  readonly reportKey: string;
  readonly workspaceId: string;
  readonly createdAt: string;
}

interface VersionRow {
  readonly reportId: string;
  readonly reportKey: string;
  readonly seriesWorkspaceId: string;
  readonly versionId: string;
  readonly version: bigint;
  readonly previousSemanticVersionId: string | null;
  readonly semanticVersionId: string;
  readonly requestSha256: string;
  readonly requestArtifactSha256: string;
  readonly evidenceEnvelopeSha256: string;
  readonly semanticContentSha256: string;
  readonly reviewStateSha256: string;
  readonly workspaceId: string;
  readonly workspaceSnapshotSha256: string;
  readonly sourcePackageId: string;
  readonly sourcePackageManifestSha256: string;
  readonly packageContentSha256: string;
  readonly artifactCount: bigint;
  readonly sourceCount: bigint;
  readonly interpretationState: 'NONE';
  readonly reviewState: 'UNREVIEWED';
  readonly createdAt: string;
}

interface ArtifactRow {
  readonly fileName: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteSize: bigint;
}

interface SourceRow {
  readonly ordinal: bigint;
  readonly role: 'workbook' | 'manifest' | 'labels';
  readonly logicalPath: string;
  readonly sha256: string;
}

interface BuiltVersion {
  readonly bundle: SourceBackedReportBundle;
  readonly semanticVersionId: string;
  readonly files: ReadonlyMap<string, Buffer>;
}

interface PreparedVersion extends BuiltVersion {
  readonly stored: ReadonlyMap<string, StoredArtifact>;
}

export class ReportVersionService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #dependencies: SourceBackedReportDependencies;
  readonly #now: () => Date;
  readonly #uuid: () => string;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly dependencies: SourceBackedReportDependencies;
    readonly now?: () => Date;
    readonly uuid?: () => string;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#dependencies = options.dependencies;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
  }

  async createVersion(untrusted: unknown, catalogBytes: Buffer): Promise<ReportVersionExecution> {
    const request = requestSnapshot(untrusted);
    const catalogSnapshot = Buffer.from(catalogBytes);
    assertCatalogBytes(request, catalogSnapshot);
    return withDatabaseMutationMutex(this.#db, async () => this.#createValidated(request, catalogSnapshot));
  }

  async #createValidated(request: ReportVersionCreateRequest, catalogBytes: Buffer): Promise<ReportVersionExecution> {
    const requestSha256 = digest(canonicalBytes(request, false));
    const existing = this.#versionByKey(request.reportKey, request.version);
    if (existing) return this.#verifiedRetry(request, requestSha256, existing);

    const series = this.#seriesByKey(request.reportKey);
    this.#assertNextVersion(request, series);
    const duplicateRequest = series ? this.#versionByRequest(series.reportId, requestSha256) : undefined;
    if (duplicateRequest) throw new ReportVersionIdentityConflictError('The exact report request already belongs to another version');

    const prepared = await this.#prepare(request, catalogBytes);
    const createdAt = exactTimestamp(this.#now());
    const stagedReportId = series?.reportId ?? validUuid(this.#uuid());
    const stagedVersionId = validUuid(this.#uuid());

    this.#db.exec('BEGIN IMMEDIATE');
    let result: ReportVersionExecution;
    try {
      const concurrentVersion = this.#versionByKey(request.reportKey, request.version);
      if (concurrentVersion) {
        if (concurrentVersion.requestSha256 !== requestSha256) {
          throw new ReportVersionIdentityConflictError('Report version already exists with changed content');
        }
        result = execution(concurrentVersion, true, 0);
      } else {
        const concurrentSeries = this.#seriesByKey(request.reportKey);
        this.#assertNextVersion(request, concurrentSeries);
        const reportId = concurrentSeries?.reportId ?? stagedReportId;
        let databaseMutations = 0;
        if (!concurrentSeries) {
          databaseMutations += this.#db.prepare(`
            INSERT INTO analysis_report_series(report_id, report_key, workspace_id, created_at) VALUES (?, ?, ?, ?)
          `).run(reportId, request.reportKey, request.sourceRequest.workspaceId, createdAt).changes;
        }

        for (const [name, stored] of prepared.stored) {
          databaseMutations += this.#registerArtifact(stored, mediaType(name), createdAt);
        }

        const requestArtifact = requiredStored(prepared.stored, 'create-request.json');
        const envelope = requiredStored(prepared.stored, 'evidence-envelope.json');
        const semantic = requiredStored(prepared.stored, 'semantic-content.json');
        const review = requiredStored(prepared.stored, 'review-state.json');
        const insertArtifact = this.#db.prepare(`
          INSERT INTO analysis_report_version_artifacts(
            report_id, version, file_name, artifact_sha256, media_type, byte_size
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const [name, stored] of [...prepared.stored].sort(([a], [b]) => compare(a, b))) {
          databaseMutations += insertArtifact.run(reportId, request.version, name, stored.sha256, mediaType(name), stored.byteSize).changes;
        }

        const insertSource = this.#db.prepare(`
          INSERT INTO analysis_report_version_sources(
            report_id, version, ordinal, role, logical_path, source_sha256
          ) VALUES (?, ?, ?, ?, ?, ?)
        `);
        for (const [ordinal, source] of prepared.bundle.envelope.selectedSources.entries()) {
          databaseMutations += insertSource.run(
            reportId, request.version, ordinal, source.role, source.logicalPath, source.sha256,
          ).changes;
        }
        databaseMutations += this.#db.prepare(`
          INSERT INTO analysis_report_versions(
            version_id, report_id, version, previous_semantic_version_id, semantic_version_id,
            request_sha256, request_artifact_sha256, evidence_envelope_sha256,
            semantic_content_sha256, review_state_sha256,
            workspace_id, workspace_snapshot_sha256, source_package_id,
            source_package_manifest_sha256, package_content_sha256, artifact_count, source_count,
            interpretation_state, review_state, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'NONE', 'UNREVIEWED', ?)
        `).run(
          stagedVersionId, reportId, request.version, request.previousSemanticVersionId,
          prepared.semanticVersionId, requestSha256, requestArtifact.sha256, envelope.sha256,
          semantic.sha256, review.sha256, prepared.bundle.envelope.workspace.workspaceId,
          prepared.bundle.envelope.workspace.snapshotSha256, prepared.bundle.envelope.sourcePackage.packageId,
          prepared.bundle.envelope.sourcePackage.manifestArtifactSha256,
          prepared.bundle.envelope.sourcePackage.packageContentSha256,
          prepared.stored.size, prepared.bundle.envelope.selectedSources.length, createdAt,
        ).changes;
        result = {
          reportId,
          versionId: stagedVersionId,
          version: request.version,
          semanticVersionId: prepared.semanticVersionId,
          deduplicated: false,
          databaseMutations,
        };
      }
      this.#db.exec('COMMIT');
    } catch (error) {
      if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
      throw error;
    }

    const verified = await this.readVersion(result.reportId, result.version);
    if (verified.versionId !== result.versionId || verified.semanticVersionId !== result.semanticVersionId) {
      throw new ReportVersionIntegrityError('Persisted report version does not match its receipt');
    }
    return result;
  }

  async readVersion(reportId: string, version: number): Promise<ReportVersionRecord> {
    assertUuid(reportId, 'reportId');
    assertVersion(version);
    const row = this.#versionById(reportId, version);
    if (!row) throw new ReportVersionValidationError('Report version not found');

    const requestBytes = await this.#readRegisteredArtifact(row.requestArtifactSha256, JSON_MEDIA);
    const request = parseCanonicalRequest(requestBytes);
    if (
      request.reportKey !== row.reportKey || request.version !== Number(row.version) ||
      request.previousSemanticVersionId !== row.previousSemanticVersionId ||
      digest(canonicalBytes(request, false)) !== row.requestSha256
    ) throw new ReportVersionIntegrityError('Report request does not match immutable metadata');

    const artifactRows = this.#artifactRows(reportId, version);
    if (BigInt(artifactRows.length) !== row.artifactCount) {
      throw new ReportVersionIntegrityError('Report artifact membership count mismatch');
    }
    const storedFiles = new Map<string, Buffer>();
    for (const artifact of artifactRows) {
      if (artifact.mediaType !== mediaType(artifact.fileName)) {
        throw new ReportVersionIntegrityError('Report artifact media type does not match its file name');
      }
      const bytes = await this.#readRegisteredArtifact(artifact.sha256, artifact.mediaType);
      if (BigInt(bytes.byteLength) !== artifact.byteSize) throw new ReportVersionIntegrityError('Report artifact byte size mismatch');
      storedFiles.set(artifact.fileName, bytes);
    }
    const catalogBytes = requiredFile(storedFiles, 'section-catalog.json');
    let expected: BuiltVersion;
    try {
      expected = await this.#build(request, catalogBytes);
    } catch (error) {
      if (error instanceof ReportVersionIntegrityError) throw error;
      throw new ReportVersionIntegrityError('Report version cannot be replayed through its owning readers', { cause: error });
    }
    assertExactFiles(expected.files, storedFiles);

    if (
      expected.semanticVersionId !== row.semanticVersionId ||
      digest(requiredFile(storedFiles, 'evidence-envelope.json')) !== row.evidenceEnvelopeSha256 ||
      digest(requiredFile(storedFiles, 'semantic-content.json')) !== row.semanticContentSha256 ||
      digest(requiredFile(storedFiles, 'review-state.json')) !== row.reviewStateSha256 ||
      expected.bundle.envelope.workspace.workspaceId !== row.workspaceId ||
      expected.bundle.envelope.workspace.snapshotSha256 !== row.workspaceSnapshotSha256 ||
      expected.bundle.envelope.sourcePackage.packageId !== row.sourcePackageId ||
      expected.bundle.envelope.sourcePackage.manifestArtifactSha256 !== row.sourcePackageManifestSha256 ||
      expected.bundle.envelope.sourcePackage.packageContentSha256 !== row.packageContentSha256 ||
      row.seriesWorkspaceId !== row.workspaceId ||
      row.interpretationState !== 'NONE' || row.reviewState !== 'UNREVIEWED'
    ) throw new ReportVersionIntegrityError('Report version lineage does not match replayed evidence');

    const previous = version === 1 ? null : this.#versionById(reportId, version - 1);
    if ((previous?.semanticVersionId ?? null) !== row.previousSemanticVersionId) {
      throw new ReportVersionIntegrityError('Report version predecessor chain is invalid');
    }
    const sources = this.#sourceRows(reportId, version);
    if (BigInt(sources.length) !== row.sourceCount) {
      throw new ReportVersionIntegrityError('Report source membership count mismatch');
    }
    const expectedSources = expected.bundle.envelope.selectedSources.map((source, ordinal) => ({
      ordinal,
      role: source.role,
      logicalPath: source.logicalPath,
      sha256: source.sha256,
    }));
    if (canonicalJson(sources.map(source => ({ ...source, ordinal: Number(source.ordinal) }))) !== canonicalJson(expectedSources)) {
      throw new ReportVersionIntegrityError('Report source membership does not match replayed evidence');
    }

    const record: ReportVersionRecord = {
      contractVersion: '1.0.0',
      reportId: row.reportId,
      reportKey: row.reportKey,
      versionId: row.versionId,
      version: Number(row.version),
      previousSemanticVersionId: row.previousSemanticVersionId,
      semanticVersionId: row.semanticVersionId,
      requestSha256: row.requestSha256,
      workspaceId: row.workspaceId,
      workspaceSnapshotSha256: row.workspaceSnapshotSha256,
      sourcePackageId: row.sourcePackageId,
      sourcePackageManifestSha256: row.sourcePackageManifestSha256,
      packageContentSha256: row.packageContentSha256,
      evidenceEnvelopeSha256: row.evidenceEnvelopeSha256,
      semanticContentSha256: row.semanticContentSha256,
      reviewStateSha256: row.reviewStateSha256,
      interpretationState: row.interpretationState,
      reviewState: row.reviewState,
      createdAt: row.createdAt,
      artifacts: artifactRows.map(artifact => ({
        fileName: artifact.fileName,
        sha256: artifact.sha256,
        mediaType: artifact.mediaType,
        byteSize: Number(artifact.byteSize),
      })),
      selectedSources: sources.map(source => ({
        ordinal: Number(source.ordinal),
        role: source.role,
        logicalPath: source.logicalPath,
        sha256: source.sha256,
      })),
    };
    if (!validateRecord(record)) throw new ReportVersionIntegrityError('Report version projection breaks its contract');
    return record;
  }

  async readHistory(reportId: string): Promise<readonly ReportVersionRecord[]> {
    assertUuid(reportId, 'reportId');
    const versions = this.#db.prepare(`
      SELECT version FROM analysis_report_versions WHERE report_id = ? ORDER BY version
    `).all(reportId) as Array<{ version: bigint }>;
    if (!versions.length) throw new ReportVersionValidationError('Report series not found');
    const records: ReportVersionRecord[] = [];
    for (const item of versions) records.push(await this.readVersion(reportId, Number(item.version)));
    return records;
  }

  async #verifiedRetry(
    request: ReportVersionCreateRequest,
    requestSha256: string,
    row: VersionRow,
  ): Promise<ReportVersionExecution> {
    if (row.requestSha256 !== requestSha256) {
      throw new ReportVersionIdentityConflictError('Report version already exists with changed content');
    }
    const verified = await this.readVersion(row.reportId, Number(row.version));
    return {
      reportId: verified.reportId,
      versionId: verified.versionId,
      version: verified.version,
      semanticVersionId: verified.semanticVersionId,
      deduplicated: true,
      databaseMutations: 0,
    };
  }

  async #build(request: ReportVersionCreateRequest, catalogBytes: Buffer): Promise<BuiltVersion> {
    const bundle = await buildSourceBackedReport(request.sourceRequest, catalogBytes, this.#dependencies);
    const semantic = buildReportSemanticContent(bundle);
    const review = buildUnreviewedReportState(semantic.content.semanticVersionId);
    const files = new Map(bundle.files);
    files.set('create-request.json', canonicalBytes(request));
    files.set('evidence-envelope.json', bundle.envelopeBytes);
    files.set('semantic-content.json', semantic.contentBytes);
    files.set('review-state.json', review.stateBytes);
    files.set('report.html', Buffer.from(renderResearchReportHtml({ ...bundle, files }, semantic.content.semanticVersionId), 'utf8'));
    const exportManifest = {
      contractVersion: 'source-backed-export-v1',
      rendererVersion: 'research-evidence-html-vi-v1',
      approvalState: 'UNREVIEWED',
      packetId: bundle.packet.packetId,
      semanticVersionId: semantic.content.semanticVersionId,
      reviewStateSha256: digest(review.stateBytes),
      files: [...files].sort(([left], [right]) => compare(left, right)).map(([name, bytes]) => ({
        name,
        byteSize: bytes.byteLength,
        sha256: digest(bytes),
      })),
    };
    files.set('export-manifest.json', canonicalBytes(exportManifest));
    for (const [name, bytes] of files) {
      if (!/^[a-z0-9._-]{1,120}$/.test(name)) throw new ReportVersionValidationError('Unsafe report artifact name');
      if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new ReportVersionValidationError('Report artifact exceeds the size limit');
    }
    return { bundle, semanticVersionId: semantic.content.semanticVersionId, files };
  }

  async #prepare(request: ReportVersionCreateRequest, catalogBytes: Buffer): Promise<PreparedVersion> {
    const built = await this.#build(request, catalogBytes);
    const stored = new Map<string, StoredArtifact>();
    for (const [name, bytes] of built.files) {
      stored.set(name, await this.#artifacts.put(bytes));
    }
    return { ...built, stored };
  }

  #assertNextVersion(request: ReportVersionCreateRequest, series: SeriesRow | undefined): void {
    if (!series) {
      if (request.version !== 1 || request.previousSemanticVersionId !== null) {
        throw new ReportVersionValidationError('A new report series must start at version 1 without a predecessor');
      }
      return;
    }
    if (series.workspaceId !== request.sourceRequest.workspaceId) {
      throw new ReportVersionIdentityConflictError('A report series cannot move between discovery workspaces');
    }
    const latest = this.#db.prepare(`
      SELECT version, semantic_version_id semanticVersionId
      FROM analysis_report_versions WHERE report_id = ? ORDER BY version DESC LIMIT 1
    `).get(series.reportId) as { version: bigint; semanticVersionId: string } | undefined;
    if (!latest || request.version !== Number(latest.version) + 1 || request.previousSemanticVersionId !== latest.semanticVersionId) {
      throw new ReportVersionValidationError('Report version must explicitly continue the current predecessor');
    }
  }

  #registerArtifact(stored: StoredArtifact, type: string, createdAt: string): number {
    const result = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, ?, ?, ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, type, stored.relativePath, createdAt, createdAt);
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(stored.sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string;
    } | undefined;
    if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== type || row.relativePath !== stored.relativePath ||
        row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new ReportVersionIdentityConflictError('Report artifact manifest metadata conflict');
    }
    return result.changes;
  }

  async #readRegisteredArtifact(sha256: string, type: string): Promise<Buffer> {
    assertDigest(sha256, 'artifactSha256');
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string;
    } | undefined;
    let bytes: Buffer;
    try { bytes = await this.#artifacts.read(sha256, { maxBytes: MAX_ARTIFACT_BYTES }); }
    catch { throw new ReportVersionIntegrityError('Report artifact is missing or corrupt'); }
    if (!row || row.byteSize !== BigInt(bytes.byteLength) || row.mediaType !== type ||
        row.relativePath !== `sha256/${sha256.slice(0, 2)}/${sha256}` || row.contractVersion !== '1.0.0' ||
        row.retentionStatus !== 'active' || digest(bytes) !== sha256) {
      throw new ReportVersionIntegrityError('Report artifact manifest metadata mismatch');
    }
    return bytes;
  }

  #seriesByKey(reportKey: string): SeriesRow | undefined {
    return this.#db.prepare(`
      SELECT report_id reportId, report_key reportKey, workspace_id workspaceId, created_at createdAt
      FROM analysis_report_series WHERE report_key = ?
    `).get(reportKey) as SeriesRow | undefined;
  }

  #versionByKey(reportKey: string, version: number): VersionRow | undefined {
    return this.#db.prepare(`${versionSelect()} WHERE s.report_key = ? AND v.version = ?`)
      .get(reportKey, version) as VersionRow | undefined;
  }

  #versionById(reportId: string, version: number): VersionRow | undefined {
    return this.#db.prepare(`${versionSelect()} WHERE v.report_id = ? AND v.version = ?`)
      .get(reportId, version) as VersionRow | undefined;
  }

  #versionByRequest(reportId: string, requestSha256: string): VersionRow | undefined {
    return this.#db.prepare(`${versionSelect()} WHERE v.report_id = ? AND v.request_sha256 = ?`)
      .get(reportId, requestSha256) as VersionRow | undefined;
  }

  #artifactRows(reportId: string, version: number): ArtifactRow[] {
    return this.#db.prepare(`
      SELECT file_name fileName, artifact_sha256 sha256, media_type mediaType, byte_size byteSize
      FROM analysis_report_version_artifacts
      WHERE report_id = ? AND version = ? ORDER BY file_name
    `).all(reportId, version) as ArtifactRow[];
  }

  #sourceRows(reportId: string, version: number): SourceRow[] {
    return this.#db.prepare(`
      SELECT ordinal, role, logical_path logicalPath, source_sha256 sha256
      FROM analysis_report_version_sources
      WHERE report_id = ? AND version = ? ORDER BY ordinal
    `).all(reportId, version) as SourceRow[];
  }
}

/** Narrow explicit-version reader. There is deliberately no implicit latest. */
export class AnalysisReportVersionReader {
  readonly #service: ReportVersionService;
  constructor(service: ReportVersionService) { this.#service = service; }
  readVersion(reportId: string, version: number): Promise<ReportVersionRecord> {
    return this.#service.readVersion(reportId, version);
  }
  readHistory(reportId: string): Promise<readonly ReportVersionRecord[]> {
    return this.#service.readHistory(reportId);
  }
}

function versionSelect(): string {
  return `SELECT v.report_id reportId, s.report_key reportKey, s.workspace_id seriesWorkspaceId,
    v.version_id versionId, v.version,
    v.previous_semantic_version_id previousSemanticVersionId, v.semantic_version_id semanticVersionId,
    v.request_sha256 requestSha256, v.request_artifact_sha256 requestArtifactSha256,
    v.evidence_envelope_sha256 evidenceEnvelopeSha256, v.semantic_content_sha256 semanticContentSha256,
    v.review_state_sha256 reviewStateSha256, v.workspace_id workspaceId,
    v.workspace_snapshot_sha256 workspaceSnapshotSha256, v.source_package_id sourcePackageId,
    v.source_package_manifest_sha256 sourcePackageManifestSha256, v.package_content_sha256 packageContentSha256,
    v.artifact_count artifactCount, v.source_count sourceCount,
    v.interpretation_state interpretationState, v.review_state reviewState, v.created_at createdAt
    FROM analysis_report_versions v JOIN analysis_report_series s ON s.report_id = v.report_id`;
}

function requestSnapshot(untrusted: unknown): ReportVersionCreateRequest {
  if (!validateRequest(untrusted)) {
    throw new ReportVersionValidationError(`Invalid report version request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  return JSON.parse(canonicalJson(untrusted)) as ReportVersionCreateRequest;
}

function assertCatalogBytes(request: ReportVersionCreateRequest, catalogBytes: Buffer): void {
  if (catalogBytes.byteLength > MAX_ARTIFACT_BYTES) {
    throw new ReportVersionValidationError('Section catalog exceeds the size limit');
  }
  if (digest(catalogBytes) !== request.sourceRequest.catalogSha256) {
    throw new ReportVersionValidationError('Section catalog bytes do not match the declared digest');
  }
}

function parseCanonicalRequest(bytes: Buffer): ReportVersionCreateRequest {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new ReportVersionIntegrityError('Report request artifact is invalid JSON'); }
  let request: ReportVersionCreateRequest;
  try { request = requestSnapshot(parsed); }
  catch (error) { throw new ReportVersionIntegrityError('Report request artifact breaks its contract', { cause: error }); }
  if (!bytes.equals(canonicalBytes(request))) throw new ReportVersionIntegrityError('Report request artifact is not canonical JSON');
  return request;
}

function assertExactFiles(expected: ReadonlyMap<string, Buffer>, actual: ReadonlyMap<string, Buffer>): void {
  if (expected.size !== actual.size) throw new ReportVersionIntegrityError('Report artifact membership mismatch');
  for (const [name, bytes] of expected) {
    const found = actual.get(name);
    if (!found || !found.equals(bytes)) throw new ReportVersionIntegrityError(`Report artifact replay mismatch: ${name}`);
  }
}

function execution(row: VersionRow, deduplicated: boolean, databaseMutations: number): ReportVersionExecution {
  return {
    reportId: row.reportId,
    versionId: row.versionId,
    version: Number(row.version),
    semanticVersionId: row.semanticVersionId,
    deduplicated,
    databaseMutations,
  };
}

function exactTimestamp(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new ReportVersionValidationError('Invalid report version timestamp');
  return value.toISOString();
}

function validUuid(value: string): string {
  assertUuid(value, 'generatedId');
  return value;
}

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new ReportVersionValidationError(`${label} must be a UUID`);
}

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new ReportVersionIntegrityError(`${label} must be a SHA-256 digest`);
}

function assertVersion(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 10000) throw new ReportVersionValidationError('Invalid report version');
}

function canonicalBytes(value: unknown, newline = true): Buffer {
  return Buffer.from(`${canonicalJson(value)}${newline ? '\n' : ''}`, 'utf8');
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function requiredFile(files: ReadonlyMap<string, Buffer>, name: string): Buffer {
  const value = files.get(name);
  if (!value) throw new ReportVersionIntegrityError(`Missing report artifact: ${name}`);
  return value;
}

function requiredStored(files: ReadonlyMap<string, StoredArtifact>, name: string): StoredArtifact {
  const value = files.get(name);
  if (!value) throw new ReportVersionIntegrityError(`Missing staged report artifact: ${name}`);
  return value;
}

function mediaType(name: string): string {
  if (name.endsWith('.json')) return JSON_MEDIA;
  if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (name.endsWith('.md')) return 'text/markdown; charset=utf-8';
  if (name.endsWith('.html')) return 'text/html; charset=utf-8';
  throw new ReportVersionValidationError(`Unsupported report artifact media type: ${name}`);
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
