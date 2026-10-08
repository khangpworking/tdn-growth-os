import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import apiSchema from '../../../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import readerApiSchema from '../../../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import readerInputSchema from '../../../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import type {
  ResearchAutomationReaderBuildRequest, ResearchAutomationReaderBuildReceipt, ResearchAutomationReaderDecisionRequest,
  ResearchAutomationReaderDecisionReceipt, ResearchAutomationReaderRevision, ResearchAutomationReaderRevisionList,
} from '../../../../contracts/api/research-automation-reader-report-api.generated.js';
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import {
  buildMarketReport, computeReaderReportData, publishReaderReport, ReaderAssetError, ReaderReportGateError, ReaderReportInputError,
  ReaderSourceError, storeCoverImage, storeReaderProfile, type CoverImage, type ReaderPlatform, type ReaderWebResult, type StoredCoverImage,
} from '../reader-report/index.js';
import { ReaderMetricRowsError, readerRowsFromMetricWorkbook, type ReaderRow } from '../reader-report/metric-rows.js';
import { MetricSourceRejection } from '../metric-source-profile.js';
import { MetricWebSnapshotError } from './metric-web-snapshot.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv); ajv.addSchema(apiSchema); ajv.addSchema(readerInputSchema); ajv.addSchema(readerApiSchema);
const def = <T>(name: string) => ajv.compile<T>({ $ref: `${readerApiSchema.$id}#/$defs/${name}` });
const validBuild = def<ResearchAutomationReaderBuildRequest>('buildRequest');
const validDecision = def<ResearchAutomationReaderDecisionRequest>('decisionRequest');
const validRevision = def<ResearchAutomationReaderRevision>('revision');

export const READER_BUILDER_VERSION = 'reader-report-market-v2';
export const MAX_READER_HTML_BYTES = 32 * 1024 * 1024;
const sha = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value), 'utf8');

/** Section titles of the market draft, used to restate blocked parts without codes. */
const MARKET_TITLES: Record<string, string> = {
  M01: 'Kết luận chính', M02: 'Phạm vi và phương pháp', M03: 'Quy mô và diễn biến', M04: 'Cơ cấu thị trường',
  M05: 'Nhu cầu', M06: 'Nguồn cung', M07: 'Đối thủ', M08: 'Giá và kinh tế đơn vị', M09: 'Động lực và rủi ro',
  M10: 'Dự báo và kịch bản', M11: 'Cơ hội', M12: 'Hành động', M13: 'Phụ lục và truy nguồn',
};

/**
 * Plain-Vietnamese limits carried from the verified market draft. Never prints
 * raw limitation codes or source names; the reader page must restate each one.
 */
export function readerLimitationsFromDraft(semantic: Record<string, unknown>, profileStatus: 'proposed' | 'approved'): string[] {
  const out: string[] = [];
  const sections = Array.isArray(semantic.sections) ? semantic.sections as { sectionId?: unknown; state?: unknown }[] : [];
  const blocked = sections.filter(s => s.state === 'BLOCKED').map(s => MARKET_TITLES[String(s.sectionId)]).filter((t): t is string => !!t);
  if (blocked.length) out.push(`Bản nháp tự động chưa đủ dữ liệu cho các phần: ${blocked.join('; ')}. Bản đọc chỉ nói tới phần đó trong giới hạn của tệp danh sách sản phẩm.`);
  const outcome = semantic.collectionOutcome;
  const limits = Array.isArray(semantic.limitations) ? semantic.limitations : [];
  if ((outcome !== null && outcome !== undefined && outcome !== 'SUCCEEDED') || limits.length)
    out.push('Lượt thu dữ liệu tự động chưa thu đủ mọi nguồn; bản đọc chỉ dùng tệp danh sách sản phẩm đã gắn vào lượt.');
  if (profileStatus === 'proposed') out.push('Phân loại sản phẩm do AI đề xuất, chưa được chủ duyệt.');
  return out;
}

export interface ReaderDraftContext {
  readonly workspaceId: string; readonly runId: string; readonly draftPairId: string;
  readonly marketSemantic: Record<string, unknown>;
  /** Web search results retained by the run's collection step; empty when none ran. */
  readonly webResults?: readonly ReaderWebResult[];
  readonly metric: { readonly packageId: string; readonly workbook: Buffer; readonly measurementPeriod: { readonly startDate: string; readonly endDate: string } };
}
export interface ReaderBinding { readonly workspaceId: string; readonly runId: string }
export type ReaderRowsReader = (workbook: Buffer, platforms: readonly ReaderPlatform[]) => ReaderRow[];

interface RevisionRow {
  revision_id: string; workspace_id: string; run_id: string; revision_number: number | bigint; request_key: string; request_sha256: string;
  draft_pair_id: string; metric_package_id: string; platforms: string; profile_status: 'proposed' | 'approved';
  input_sha256: string; profile_sha256: string; cover_sha256: string | null; html_sha256: string; metrics_sha256: string; claims_sha256: string;
  builder_version: string; actor_id: string; created_at: string;
  decision: 'APPROVED' | 'REJECTED' | null; decision_request_key: string | null; reason: string | null; decision_actor_id: string | null; decided_at: string | null;
}
const SELECT = `SELECT v.*, d.decision, d.request_key decision_request_key, d.reason, d.actor_id decision_actor_id, d.decided_at
  FROM analysis_reader_report_revisions v LEFT JOIN analysis_reader_report_decisions d ON d.revision_id = v.revision_id`;

/** dd/mm/yyyy in Vietnam time, shown in the reader footer only. */
const builtOn = (at: Date): string => new Date(at.getTime() + 7 * 3_600_000).toISOString().slice(0, 10).split('-').reverse().join('/');

/**
 * OWNER-facing reader pages built from a DRAFT_READY run. A build restates the
 * verified draft and the run's prepared product-list file; it never edits the
 * draft, admits a source, or calls a provider. Decisions are append-only.
 */
export class AutomationReaderReports {
  readonly #rows: ReaderRowsReader;
  constructor(private readonly db: Database.Database, private readonly artifacts: ContentAddressedArtifactStore,
    private readonly now: () => Date, private readonly options: { flint?: boolean; rows?: ReaderRowsReader } = {}) {
    this.#rows = options.rows ?? readerRowsFromMetricWorkbook;
  }

  async build(context: ReaderDraftContext, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<ResearchAutomationReaderBuildReceipt> {
    this.#owner(actor);
    if (!validBuild(value)) throw new ResearchAutomationValidationError('Yêu cầu dựng bản đọc không hợp lệ.');
    const request = JSON.parse(canonicalJson(value)) as ResearchAutomationReaderBuildRequest;
    const requestSha = sha(canonicalJson(request));
    const prior = this.#byRequestKey(request.requestKey);
    if (prior) return { contractVersion: 'reader-report-build-receipt-v1', exactRetry: true, revision: this.#exactBuildRetry(prior, context, requestSha, actor) };

    if (request.metricPackageId !== context.metric.packageId) throw new ResearchAutomationIntegrityError('Reader build context names another package.');
    const period = context.metric.measurementPeriod;
    if (request.contractVersion === 'reader-report-build-v1' && request.source !== undefined &&
      (request.source.measurementPeriod.start !== period.startDate || request.source.measurementPeriod.end !== period.endDate))
      throw new ResearchAutomationValidationError('Kỳ số liệu khai báo khác kỳ của tệp đã gắn vào lượt.');
    const latest = this.#latest(context.runId);
    if (latest?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc mới nhất đã được chủ duyệt.');

    const platforms = [...request.platforms].sort() as ReaderPlatform[];
    let rows: ReaderRow[];
    try { rows = this.#rows(context.metric.workbook, platforms); }
    catch (error) {
      if (error instanceof ReaderMetricRowsError || error instanceof MetricSourceRejection)
        throw new ResearchAutomationValidationError(`Tệp danh sách sản phẩm không dùng được cho bản đọc (${error.locator}).`);
      throw error;
    }
    // computeReaderReportData re-validates the whole input against its schema.
    // A reader-report-build-v1.1 request carries a web snapshot; the effective (derived) period
    // is checked against the attached file below, after compute.
    const input = {
      contractVersion: '1.2.0',
      profile: request.profile, platforms, rows, rowLineage: { sha256: sha(context.metric.workbook) },
      ...(request.source === undefined ? {} : { source: request.source }),
      ...(request.contractVersion === 'reader-report-build-v1' ? {} : {
        webSnapshot: request.webSnapshot,
        webSnapshotSha256: request.webSnapshotSha256,
      }),
    } as unknown as ReaderReportInput;
    let data;
    try { data = computeReaderReportData(input); }
    catch (error) {
      if (error instanceof ReaderReportInputError || error instanceof ReaderSourceError || error instanceof MetricWebSnapshotError) {
        throw new ResearchAutomationValidationError(error.message);
      }
      throw error;
    }
    const effectivePeriod = data.input.source?.measurementPeriod;
    if (effectivePeriod !== undefined &&
      (effectivePeriod.start !== period.startDate || effectivePeriod.end !== period.endDate)) {
      throw new ResearchAutomationValidationError('Kỳ số liệu khai báo khác kỳ của tệp đã gắn vào lượt.');
    }

    // Cover photo and profile are stored as artifacts first: the page is built only from stored, checked bytes.
    let stored: StoredCoverImage | null = null, coverBytes: Buffer | null = null;
    if (request.cover) {
      coverBytes = Buffer.from(request.cover.imageBase64, 'base64');
      try {
        stored = await storeCoverImage(this.artifacts, coverBytes,
          { licence: request.cover.licence, ...(request.cover.credit === undefined ? {} : { credit: request.cover.credit }) });
      } catch (error) {
        if (error instanceof ReaderAssetError) throw new ResearchAutomationValidationError(`Ảnh bìa không dùng được: ${error.message}.`);
        throw error;
      }
    }
    const cover: CoverImage | null = stored && coverBytes ? { bytes: coverBytes, mime: stored.mime } : null;
    const limitations = readerLimitationsFromDraft(context.marketSemantic, request.profile.status);
    const at = this.now(), createdAt = at.toISOString(), revisionId = randomUUID();
    const webResults = context.webResults ?? [];
    const built = await buildMarketReport(data, { limitations, builtOn: builtOn(at), cover, flint: this.options.flint ?? true, webResults });
    let published;
    try { published = await publishReaderReport(this.artifacts, { html: built.html, narrator: built.narrator, extraOk: built.extraOk }); }
    catch (error) { if (error instanceof ReaderReportGateError) throw new ResearchAutomationValidationError(error.message); throw error; }
    const profile = (await storeReaderProfile(this.artifacts, request.profile)).artifact;
    const record = await this.artifacts.put(json({
      contractVersion: 'reader-report-build-record-v1', builderVersion: READER_BUILDER_VERSION, revisionId,
      workspaceId: context.workspaceId, runId: context.runId, draftPairId: context.draftPairId, metricPackageId: request.metricPackageId,
      requestSha256: requestSha, profileSha256: profile.sha256, input, limitations, webResults: built.webResults,
      cover: stored && request.cover ? { sha256: stored.coverSha256, imageSha256: stored.imageSha256, mime: stored.mime,
        licence: request.cover.licence, credit: request.cover.credit ?? null } : null,
      charts: built.charts, htmlSha256: published.html.sha256, actorId: actor.actorId, createdAt,
    }));

    this.db.exec('BEGIN IMMEDIATE');
    try {
      // A concurrent writer on another connection may have claimed the key.
      const raced = this.#byRequestKey(request.requestKey);
      if (raced) {
        this.db.exec('ROLLBACK');
        return { contractVersion: 'reader-report-build-receipt-v1', exactRetry: true, revision: this.#exactBuildRetry(raced, context, requestSha, actor) };
      }
      this.#manifest(published.html, 'text/html; charset=utf-8', createdAt);
      for (const a of [published.metrics, published.claims, profile, record]) this.#manifest(a, 'application/json', createdAt);
      if (stored) { this.#manifest(stored.image, stored.mime, createdAt); this.#manifest(stored.sidecar, 'application/json', createdAt); }
      const next = Number((this.db.prepare('SELECT COALESCE(max(revision_number),0)+1 n FROM analysis_reader_report_revisions WHERE run_id=?').get(context.runId) as { n: number | bigint }).n);
      this.db.prepare(`INSERT INTO analysis_reader_report_revisions(revision_id,workspace_id,run_id,revision_number,request_key,request_sha256,
        draft_pair_id,metric_package_id,platforms,profile_status,input_sha256,profile_sha256,cover_sha256,html_sha256,metrics_sha256,claims_sha256,
        builder_version,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        revisionId, context.workspaceId, context.runId, next, request.requestKey, requestSha, context.draftPairId, request.metricPackageId,
        platforms.join(','), request.profile.status, record.sha256, profile.sha256, stored?.coverSha256 ?? null,
        published.html.sha256, published.metrics.sha256, published.claims.sha256, READER_BUILDER_VERSION, actor.actorId, createdAt);
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('ROLLBACK');
      if (error instanceof Error && /reader_report_requires_draft_ready_sequence/.test(error.message))
        throw new ResearchAutomationConflictError('invalid_state', 'Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.');
      throw error;
    }
    return { contractVersion: 'reader-report-build-receipt-v1', exactRetry: false, revision: this.#project(this.#byId(context.runId, revisionId)!) };
  }

  async decide(binding: ReaderBinding, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<ResearchAutomationReaderDecisionReceipt> {
    this.#owner(actor);
    if (!validDecision(value)) throw new ResearchAutomationValidationError('Yêu cầu duyệt bản đọc không hợp lệ.');
    const request = value;
    const reason = request.reason === null ? null : request.reason.trim();
    const receipt = (row: RevisionRow, exactRetry: boolean): ResearchAutomationReaderDecisionReceipt =>
      ({ contractVersion: 'reader-report-decision-receipt-v1', exactRetry, revision: this.#project(row) });
    const prior = this.db.prepare('SELECT revision_id FROM analysis_reader_report_decisions WHERE request_key=?').get(request.requestKey) as { revision_id: string } | undefined;
    if (prior) {
      const row = this.#byId(binding.runId, prior.revision_id);
      if (!row || row.revision_id !== request.revisionId || row.workspace_id !== binding.workspaceId || row.decision !== request.decision ||
          row.reason !== reason || row.decision_actor_id !== actor.actorId)
        throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một quyết định khác.');
      return receipt(row, true);
    }
    const row = this.#byId(binding.runId, request.revisionId);
    if (!row || row.workspace_id !== binding.workspaceId) throw new ResearchAutomationNotFoundError('reader_report_not_found', 'Không tìm thấy bản đọc.');
    if (row.decision) throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc này đã có quyết định.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO analysis_reader_report_decisions(revision_id,run_id,decision,request_key,reason,actor_id,decided_at)
        VALUES (?,?,?,?,?,?,?)`).run(row.revision_id, binding.runId, request.decision, request.requestKey, reason, actor.actorId, this.now().toISOString());
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('ROLLBACK');
      if (error instanceof Error && /reader_report_decision_requires_latest_revision/.test(error.message))
        throw new ResearchAutomationConflictError('revision_conflict', 'Đã có bản đọc mới hơn; hãy xem bản mới nhất.');
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message))
        throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc này đã có quyết định.');
      throw error;
    }
    return receipt(this.#byId(binding.runId, row.revision_id)!, false);
  }

  list(binding: ReaderBinding): ResearchAutomationReaderRevisionList {
    const rows = this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.workspace_id=? ORDER BY v.revision_number`).all(binding.runId, binding.workspaceId) as RevisionRow[];
    return { contractVersion: 'reader-report-list-v1', workspaceId: binding.workspaceId, runId: binding.runId, revisions: rows.map(r => this.#project(r)) };
  }

  /** Verified page bytes; the manifest must match before anything is served. */
  async html(binding: ReaderBinding, revisionId: string): Promise<{ revision: ResearchAutomationReaderRevision; bytes: Buffer }> {
    const row = this.#byId(binding.runId, revisionId);
    if (!row || row.workspace_id !== binding.workspaceId) throw new ResearchAutomationNotFoundError('reader_report_not_found', 'Không tìm thấy bản đọc.');
    const manifest = this.db.prepare('SELECT byte_size,media_type,relative_path,contract_version,retention_status FROM artifact_manifests WHERE sha256=?')
      .get(row.html_sha256) as { byte_size: number | bigint; media_type: string; relative_path: string; contract_version: string; retention_status: string } | undefined;
    if (!manifest || manifest.media_type !== 'text/html; charset=utf-8' || manifest.contract_version !== '1.0.0' || manifest.retention_status !== 'active' ||
        manifest.relative_path !== `sha256/${row.html_sha256.slice(0, 2)}/${row.html_sha256}`)
      throw new ResearchAutomationIntegrityError('Reader page manifest failed verification.');
    const bytes = await this.artifacts.read(row.html_sha256, { maxBytes: MAX_READER_HTML_BYTES });
    if (BigInt(bytes.byteLength) !== BigInt(manifest.byte_size) || sha(bytes) !== row.html_sha256)
      throw new ResearchAutomationIntegrityError('Reader page failed verification.');
    return { revision: this.#project(row), bytes };
  }

  #owner(actor: { actorId: string; role: 'OWNER' }): void {
    if (actor.role !== 'OWNER' || !actor.actorId.trim() || actor.actorId.length > 120)
      throw new ResearchAutomationValidationError('A trusted OWNER actor is required.');
  }
  #exactBuildRetry(row: RevisionRow, context: ReaderBinding, requestSha: string, actor: { actorId: string }): ResearchAutomationReaderRevision {
    if (row.request_sha256 !== requestSha || row.run_id !== context.runId || row.workspace_id !== context.workspaceId || row.actor_id !== actor.actorId)
      throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.');
    return this.#project(row);
  }
  #byRequestKey(key: string): RevisionRow | undefined {
    return this.db.prepare(`${SELECT} WHERE v.request_key=?`).get(key) as RevisionRow | undefined;
  }
  #byId(runId: string, revisionId: string): RevisionRow | undefined {
    return this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.revision_id=?`).get(runId, revisionId) as RevisionRow | undefined;
  }
  #latest(runId: string): RevisionRow | undefined {
    return this.db.prepare(`${SELECT} WHERE v.run_id=? ORDER BY v.revision_number DESC LIMIT 1`).get(runId) as RevisionRow | undefined;
  }
  #project(row: RevisionRow): ResearchAutomationReaderRevision {
    const latest = this.#latest(row.run_id);
    const revision: ResearchAutomationReaderRevision = {
      revisionId: row.revision_id, revisionNumber: Number(row.revision_number), workspaceId: row.workspace_id, runId: row.run_id,
      state: row.decision ?? (latest?.revision_id === row.revision_id ? 'PENDING_OWNER_REVIEW' : 'SUPERSEDED'),
      draftPairId: row.draft_pair_id, platforms: row.platforms.split(',') as ResearchAutomationReaderRevision['platforms'],
      profileStatus: row.profile_status, htmlSha256: row.html_sha256, createdAt: row.created_at,
      decision: row.decision && row.decided_at ? { decision: row.decision, reason: row.reason, decidedAt: row.decided_at } : null,
    };
    if (!validRevision(revision)) throw new ResearchAutomationIntegrityError('Stored reader revision is invalid.');
    return revision;
  }
  #manifest(artifact: StoredArtifact, mediaType: string, at: string): void {
    this.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
      VALUES (?,?,?,?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`).run(artifact.sha256, artifact.byteSize, mediaType, artifact.relativePath, at, at);
    const row = this.db.prepare('SELECT byte_size,media_type,relative_path FROM artifact_manifests WHERE sha256=?').get(artifact.sha256) as
      { byte_size: number | bigint; media_type: string; relative_path: string };
    if (BigInt(row.byte_size) !== BigInt(artifact.byteSize) || row.media_type !== mediaType || row.relative_path !== artifact.relativePath)
      throw new ResearchAutomationIntegrityError('Artifact manifest conflict.');
  }
}
