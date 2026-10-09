import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import apiSchema from '../../../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import readerApiSchema from '../../../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import readerInputSchema from '../../../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import defaultPeerSchema from '../../../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import type {
  ResearchAutomationReaderBuildRequest, ResearchAutomationReaderBuildReceipt, ResearchAutomationReaderDecisionRequest,
  ResearchAutomationReaderDecisionReceipt, ResearchAutomationReaderRevision, ResearchAutomationReaderRevisionList,
  ResearchAutomationIntakeBoundReaderBuildRequest,
  ResearchAutomationInsightReaderBuildRequest, ResearchAutomationReaderBuildReceiptV2, ResearchAutomationReaderDecisionRequestV2,
  ResearchAutomationReaderDecisionReceiptV2, ResearchAutomationReaderRevisionV2, ResearchAutomationReaderRevisionListV2,
} from '../../../../contracts/api/research-automation-reader-report-api.generated.js';
import type { ReaderReportInput } from '../../../../contracts/analysis/reader-report-input.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { DEFAULT_MARKET_PEER_RULE } from '../default-market-peers.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import {
  buildMarketReport, computeReaderReportData, publishReaderReport, ReaderAssetError, ReaderReportGateError, ReaderReportInputError,
  ReaderSourceError, storeCoverImage, storeReaderProfile, type CoverImage, type ReaderPlatform, type ReaderWebResult, type StoredCoverImage,
} from '../reader-report/index.js';
import { ReaderUnitSpecIntakes } from './reader-unit-spec-intake.js';
import type { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { MarketUnitPriceError, type RetainedUnitPriceSource } from '../reader-report/market-unit-prices.js';
import { ReaderMetricRowsError, readerRowsFromMetricWorkbook, type ReaderRow } from '../reader-report/metric-rows.js';
import { MetricSourceRejection } from '../metric-source-profile.js';
import { MetricWebSnapshotError } from './metric-web-snapshot.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from './model.js';
import { verifyInsightReaderInput, type InsightReaderInput } from '../reader-report/insight-input-v1.js';
import { buildInsightReaderTemplate, type InsightReaderPage } from '../reader-report/insight-template.js';
import { INSIGHT_SECTION_IDS } from '../reader-report/insight-projection.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(defaultPeerSchema); ajv.addSchema(apiSchema); ajv.addSchema(readerInputSchema); ajv.addSchema(readerApiSchema);
const def = <T>(name: string) => ajv.compile<T>({ $ref: `${readerApiSchema.$id}#/$defs/${name}` });
const validBuild = def<ResearchAutomationReaderBuildRequest>('buildRequest');
const validIntakeBuild = def<ResearchAutomationIntakeBoundReaderBuildRequest>('intakeBoundBuildRequest');
const validDecision = def<ResearchAutomationReaderDecisionRequest>('decisionRequest');
const validRevision = def<ResearchAutomationReaderRevision>('revision');
const validInsightBuild = def<ResearchAutomationInsightReaderBuildRequest>('insightBuildRequest');
const validDecisionV2 = def<ResearchAutomationReaderDecisionRequestV2>('decisionRequestV2');
const validRevisionV2 = def<ResearchAutomationReaderRevisionV2>('revisionV2');

export const READER_BUILDER_VERSION = 'reader-report-market-v3';
export const NEXT_MARKET_READER_BUILDER_VERSION = 'reader-report-market-v4';
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
/** Only the owning service constructs this after exact source/method replay. */
export interface InsightReaderDraftContext extends ReaderBinding {
  readonly input: InsightReaderInput;
  readonly page: InsightReaderPage;
}
export type ReaderRowsReader = (workbook: Buffer, platforms: readonly ReaderPlatform[]) => ReaderRow[];

interface RevisionRow {
  report_kind: 'MARKET' | 'INSIGHT'; semantic_sha256: string | null; source_report_sha256: string | null;
  revision_id: string; workspace_id: string; run_id: string; revision_number: number | bigint; request_key: string; request_sha256: string;
  draft_pair_id: string; metric_package_id: string | null; platforms: string | null; profile_status: 'proposed' | 'approved' | null;
  input_sha256: string; profile_sha256: string | null; cover_sha256: string | null; html_sha256: string; metrics_sha256: string; claims_sha256: string;
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
  readonly #unitSpecs: ReaderUnitSpecIntakes;
  constructor(private readonly db: Database.Database, private readonly artifacts: ContentAddressedArtifactStore,
    private readonly now: () => Date, private readonly options: { flint?: boolean; rows?: ReaderRowsReader; staging?: RequestScopedArtifactStore } = {}) {
    this.#rows = options.rows ?? readerRowsFromMetricWorkbook;
    this.#unitSpecs = new ReaderUnitSpecIntakes(db, artifacts, options.staging, now);
  }

  async prepareUnitSpecs(context: ReaderDraftContext, value: unknown, files: ReadonlyMap<string, Uint8Array>, actor: { actorId: string; role: 'OWNER' }) {
    this.#owner(actor);
    const platforms = (value as { platforms?: unknown } | null)?.platforms;
    if (!Array.isArray(platforms) || !platforms.length || platforms.some(p => p !== 'shopee' && p !== 'tiktok'))
      throw new ResearchAutomationValidationError('Chọn đúng sàn cho quy cách.');
    return this.#unitSpecs.prepare(this.#unitSpecContext(context, platforms), value, files, actor);
  }

  async buildFromUnitSpecs(context: ReaderDraftContext, value: unknown, actor: { actorId: string; role: 'OWNER' }) {
    this.#owner(actor);
    if (!validIntakeBuild(value)) throw new ResearchAutomationValidationError('Yêu cầu dựng bản đọc từ quy cách không hợp lệ.');
    const envelope = JSON.parse(canonicalJson(value)) as ResearchAutomationIntakeBoundReaderBuildRequest;
    await this.#unitSpecs.read(this.#unitSpecContext(context, envelope.request.platforms), envelope.intakeSha256,
      { contractVersion: 'reader-unit-spec-intake-v1', metricPackageId: envelope.request.metricPackageId,
        platforms: envelope.request.platforms, unitPrices: envelope.request.unitPrices! });
    return this.#build(context, envelope.request, actor, envelope);
  }

  #unitSpecContext(context: ReaderDraftContext, platforms: readonly ReaderPlatform[]) {
    let rows: ReaderRow[];
    try { rows = this.#rows(context.metric.workbook, platforms); }
    catch (error) {
      if (error instanceof ReaderMetricRowsError || error instanceof MetricSourceRejection)
        throw new ResearchAutomationValidationError('Không đọc được tệp sản phẩm để đối chiếu quy cách.');
      throw error;
    }
    return { workspaceId: context.workspaceId, runId: context.runId, draftPairId: context.draftPairId,
      metricPackageId: context.metric.packageId, workbookSha256: sha(context.metric.workbook), rows };
  }

  async build(context: ReaderDraftContext, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<ResearchAutomationReaderBuildReceipt> {
    return this.#build(context, value, actor);
  }

  async #build(context: ReaderDraftContext, value: unknown, actor: { actorId: string; role: 'OWNER' }, intakeEnvelope?: ResearchAutomationIntakeBoundReaderBuildRequest): Promise<ResearchAutomationReaderBuildReceipt> {
    this.#owner(actor);
    if (!validBuild(value)) throw new ResearchAutomationValidationError('Yêu cầu dựng bản đọc không hợp lệ.');
    const request = JSON.parse(canonicalJson(value)) as ResearchAutomationReaderBuildRequest;
    const requestSha = sha(canonicalJson(intakeEnvelope ?? request));
    const prior = this.#byRequestKey(request.requestKey);
    if (prior) return { contractVersion: 'reader-report-build-receipt-v1', exactRetry: true, revision: this.#exactBuildRetry(prior, context, requestSha, actor) };

    if (request.metricPackageId !== context.metric.packageId) throw new ResearchAutomationIntegrityError('Reader build context names another package.');
    const period = context.metric.measurementPeriod;
    if ((request.contractVersion === 'reader-report-build-v1' || request.contractVersion === 'reader-report-build-v1.2') && request.source !== undefined &&
      (request.source.measurementPeriod.start !== period.startDate || request.source.measurementPeriod.end !== period.endDate))
      throw new ResearchAutomationValidationError('Kỳ số liệu khai báo khác kỳ của tệp đã gắn vào lượt.');
    const latest = this.#latest(context.runId);
    if (latest?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc mới nhất đã được chủ duyệt.');

    const platforms = [...request.platforms].sort() as ReaderPlatform[];
    // Immutable policy declaration precedes workbook parsing or revenue derivation.
    const peerRule = { ...DEFAULT_MARKET_PEER_RULE };
    const scope = context.marketSemantic.scope;
    const additions = typeof scope === 'object' && scope !== null && 'peerProductIds' in scope && Array.isArray(scope.peerProductIds)
      ? scope.peerProductIds.filter((id): id is string => typeof id === 'string') : [];
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
    const next = request.contractVersion === 'reader-report-build-v1.2';
    const builderVersion = next ? NEXT_MARKET_READER_BUILDER_VERSION : READER_BUILDER_VERSION;
    const retainedUnitPriceSources: RetainedUnitPriceSource[] = [];
    if (next && request.unitPrices) {
      let totalBytes = 0;
      for (const source of request.unitPrices.sources) {
        let bytes: Buffer;
        try { bytes = await this.artifacts.read(source.sha256, { maxBytes: 2 * 1024 * 1024 }); }
        catch { throw new ResearchAutomationValidationError('Không đọc được bản lưu quy cách hoặc khai báo số lượng.'); }
        totalBytes += bytes.byteLength;
        if (sha(bytes) !== source.sha256 || totalBytes > 8 * 1024 * 1024) throw new ResearchAutomationIntegrityError('Bản lưu quy cách không vượt qua kiểm tra toàn vẹn hoặc giới hạn kích thước.');
        retainedUnitPriceSources.push({ sha256: source.sha256, bytes });
      }
    }
    const input = {
      contractVersion: next ? '1.4.0' : '1.3.0', peerRule, ownerPeerProductIds: additions,
      profile: request.profile, platforms, rows, rowLineage: { sha256: sha(context.metric.workbook) },
      ...(request.source === undefined ? {} : { source: request.source }),
      ...(request.webSnapshot === undefined ? {} : {
        webSnapshot: request.webSnapshot,
        webSnapshotSha256: request.webSnapshotSha256,
      }),
      ...(next && request.unitPrices ? { unitPrices: request.unitPrices } : {}),
    } as unknown as ReaderReportInput;
    let data;
    try { data = computeReaderReportData(input, retainedUnitPriceSources); }
    catch (error) {
      if (error instanceof MarketUnitPriceError) throw new ResearchAutomationValidationError('Không xác minh được quy cách hoặc giá từ bản lưu. Hãy kiểm tra đúng listing, biến thể, số lượng, kỳ và vị trí nguồn; không dùng quan sát trùng.');
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
    try { published = await publishReaderReport(this.artifacts, { html: built.html, narrator: built.narrator, extraOk: built.extraOk, visibleTextRules: next }); }
    catch (error) {
      if (error instanceof ReaderReportGateError) throw new ResearchAutomationValidationError(next
        ? 'Bản đọc chưa đạt kiểm tra bằng chứng hoặc cách trình bày. Hãy kiểm tra nguồn, nhận định và nhãn phân loại chờ chủ duyệt trước khi tạo phiên bản mới.' : error.message);
      throw error;
    }
    const profile = (await storeReaderProfile(this.artifacts, request.profile)).artifact;
    const record = await this.artifacts.put(json({
      contractVersion: 'reader-report-build-record-v1', builderVersion, revisionId,
      ...(intakeEnvelope ? { unitSpecIntakeSha256: intakeEnvelope.intakeSha256 } : {}),
      workspaceId: context.workspaceId, runId: context.runId, draftPairId: context.draftPairId, metricPackageId: request.metricPackageId,
      requestSha256: requestSha, profileSha256: profile.sha256, input, limitations, webResults: built.webResults,
      defaultMarketPeers: data.defaultMarketPeers,
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
      const next = Number((this.db.prepare("SELECT COALESCE(max(revision_number),0)+1 n FROM analysis_reader_report_revisions WHERE run_id=? AND report_kind='MARKET'").get(context.runId) as { n: number | bigint }).n);
      this.db.prepare(`INSERT INTO analysis_reader_report_revisions(revision_id,workspace_id,run_id,revision_number,request_key,request_sha256,
        draft_pair_id,metric_package_id,platforms,profile_status,input_sha256,profile_sha256,cover_sha256,html_sha256,metrics_sha256,claims_sha256,
        builder_version,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
        revisionId, context.workspaceId, context.runId, next, request.requestKey, requestSha, context.draftPairId, request.metricPackageId,
        platforms.join(','), request.profile.status, record.sha256, profile.sha256, stored?.coverSha256 ?? null,
        published.html.sha256, published.metrics.sha256, published.claims.sha256, builderVersion, actor.actorId, createdAt);
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('ROLLBACK');
      if (error instanceof Error && /reader_report_requires_draft_ready_sequence/.test(error.message))
        throw new ResearchAutomationConflictError('invalid_state', 'Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.');
      throw error;
    }
    return { contractVersion: 'reader-report-build-receipt-v1', exactRetry: false, revision: this.#project(this.#byId(context.runId, revisionId)!) };
  }

  async buildInsight(context: InsightReaderDraftContext, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<ResearchAutomationReaderBuildReceiptV2> {
    this.#owner(actor);
    if (!validInsightBuild(value)) throw new ResearchAutomationValidationError('Yêu cầu dựng bản đọc insight không hợp lệ.');
    const request = JSON.parse(canonicalJson(value)) as ResearchAutomationInsightReaderBuildRequest;
    const input = verifyInsightReaderInput(context.input, context.input);
    const requestedBuilder = request.contractVersion === 'insight-reader-build-v3' ? 'reader-report-insight-v6'
      : request.contractVersion === 'insight-reader-build-v2'
      ? request.sourceKind === 'CROSSCHECK' ? 'reader-report-insight-v4' : 'reader-report-insight-v5'
      : undefined;
    if (requestedBuilder ? input.builderVersion !== requestedBuilder : !['reader-report-insight-v1', 'reader-report-insight-v2', 'reader-report-insight-v3'].includes(input.builderVersion))
      throw new ResearchAutomationValidationError('Insight reader request and frozen builder versions differ.');
    if (input.workspaceId !== context.workspaceId || input.runId !== context.runId || input.draftPairId !== request.draftPairId || input.semanticSha256 !== request.semanticSha256 ||
        context.page.keyword !== input.scope.keyword || context.page.definition !== input.scope.definition || canonicalJson(context.page.period) !== canonicalJson(input.scope.requestedPeriod))
      throw new ResearchAutomationIntegrityError('Insight reader context differs from its exact frozen binding.');
    if (request.contractVersion === 'insight-reader-build-v3' && (input.contractVersion !== 'insight-reader-input-v6' ||
        input.personaProposalId !== request.personaProposalId || input.personaProposalSha256 !== request.personaProposalSha256 ||
        input.personaSourcePairId !== request.personaSourcePairId || input.personaSourceSha256 !== request.personaSourceSha256))
      throw new ResearchAutomationIntegrityError('Persona reader context differs from its exact selected proposal and source.');
    const requestSha = sha(canonicalJson(request));
    const retry = async (row: RevisionRow): Promise<ResearchAutomationReaderBuildReceiptV2> => {
      if (row.report_kind !== 'INSIGHT' || row.workspace_id !== context.workspaceId || row.run_id !== context.runId || row.draft_pair_id !== input.draftPairId ||
          row.semantic_sha256 !== input.semanticSha256 || row.source_report_sha256 !== input.sourceReportSha256 || row.actor_id !== actor.actorId || row.request_sha256 !== requestSha)
        throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.');
      await this.#verifiedInsightPage(row, input);
      return { contractVersion: 'reader-report-build-receipt-v2', exactRetry: true, revision: await this.#projectWithPersona(row) };
    };
    const prior = this.#byRequestKey(request.requestKey); if (prior) return retry(prior);
    if (this.#latest(context.runId, 'INSIGHT')?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc insight mới nhất đã được chủ duyệt.');
    const built = buildInsightReaderTemplate(context.page);
    if (Buffer.byteLength(built.html) > MAX_READER_HTML_BYTES) throw new ResearchAutomationValidationError('Bản đọc insight vượt giới hạn bản lưu; không cắt dữ liệu hoặc tự thu lại.');
    let published;
    try { published = await publishReaderReport(this.artifacts, { ...built, reportKind: 'INSIGHT', visibleTextRules: true, sectionIds: ['insight-findings', ...INSIGHT_SECTION_IDS] }); }
    catch (error) {
      if (error instanceof ReaderReportGateError) throw new ResearchAutomationValidationError('Bản đọc insight chưa đạt kiểm tra bằng chứng hoặc cách trình bày.');
      throw error;
    }
    const createdAt = this.now().toISOString(), revisionId = randomUUID();
    const record = await this.artifacts.put(json({ contractVersion: 'insight-reader-build-record-v1', input,
      revisionId, requestSha256: requestSha, htmlSha256: published.html.sha256, citationTrace: built.citationTrace, actorId: actor.actorId, createdAt }));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const raced = this.#byRequestKey(request.requestKey);
      if (raced) { this.db.exec('ROLLBACK'); return retry(raced); }
      if (this.#latest(context.runId, 'INSIGHT')?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc insight mới nhất đã được chủ duyệt.');
      this.#manifest(published.html, 'text/html; charset=utf-8', createdAt);
      for (const artifact of [published.metrics, published.claims, record]) this.#manifest(artifact, 'application/json', createdAt);
      const next = Number((this.db.prepare("SELECT COALESCE(max(revision_number),0)+1 n FROM analysis_reader_report_revisions WHERE run_id=? AND report_kind='INSIGHT'").get(context.runId) as { n: number | bigint }).n);
      this.db.prepare(`INSERT INTO analysis_reader_report_revisions(report_kind,semantic_sha256,source_report_sha256,
        revision_id,workspace_id,run_id,revision_number,request_key,request_sha256,draft_pair_id,input_sha256,html_sha256,metrics_sha256,claims_sha256,builder_version,actor_id,created_at)
        VALUES ('INSIGHT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.semanticSha256, input.sourceReportSha256,
        revisionId, context.workspaceId, context.runId, next, request.requestKey, requestSha, input.draftPairId, record.sha256,
        published.html.sha256, published.metrics.sha256, published.claims.sha256, input.builderVersion, actor.actorId, createdAt);
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('ROLLBACK');
      if (error instanceof Error && /reader_report_requires_draft_ready_sequence/.test(error.message)) throw new ResearchAutomationConflictError('invalid_state', 'Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.');
      throw error;
    }
    return { contractVersion: 'reader-report-build-receipt-v2', exactRetry: false, revision: await this.#projectWithPersona(this.#byId(context.runId, revisionId)!) };
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
      if (!row || row.report_kind !== 'MARKET' || row.revision_id !== request.revisionId || row.workspace_id !== binding.workspaceId || row.decision !== request.decision ||
          row.reason !== reason || row.decision_actor_id !== actor.actorId)
        throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một quyết định khác.');
      return receipt(row, true);
    }
    const row = this.#byId(binding.runId, request.revisionId);
    if (!row || row.report_kind !== 'MARKET' || row.workspace_id !== binding.workspaceId) throw new ResearchAutomationNotFoundError('reader_report_not_found', 'Không tìm thấy bản đọc.');
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
    const rows = this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.workspace_id=? AND v.report_kind='MARKET' ORDER BY v.revision_number`).all(binding.runId, binding.workspaceId) as RevisionRow[];
    return { contractVersion: 'reader-report-list-v1', workspaceId: binding.workspaceId, runId: binding.runId, revisions: rows.map(r => this.#project(r)) };
  }

  listV2(binding: ReaderBinding): ResearchAutomationReaderRevisionListV2 {
    const rows = this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.workspace_id=? ORDER BY v.report_kind,v.revision_number`).all(binding.runId, binding.workspaceId) as RevisionRow[];
    return { contractVersion: 'reader-report-list-v2', workspaceId: binding.workspaceId, runId: binding.runId, revisions: rows.map(row => this.#projectV2(row)) };
  }

  async listWithPersona(binding: ReaderBinding): Promise<ResearchAutomationReaderRevisionListV2> {
    const rows = this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.workspace_id=? ORDER BY v.report_kind,v.revision_number`).all(binding.runId, binding.workspaceId) as RevisionRow[];
    return { contractVersion: 'reader-report-list-v2', workspaceId: binding.workspaceId, runId: binding.runId, revisions: await Promise.all(rows.map(row => this.#projectWithPersona(row))) };
  }

  async decideV2(binding: ReaderBinding, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<ResearchAutomationReaderDecisionReceiptV2> {
    this.#owner(actor);
    if (!validDecisionV2(value)) throw new ResearchAutomationValidationError('Yêu cầu duyệt đúng bản đọc không hợp lệ.');
    const request = JSON.parse(canonicalJson(value)) as ResearchAutomationReaderDecisionRequestV2;
    const row = this.#byId(binding.runId, request.revisionId);
    if (!row || row.workspace_id !== binding.workspaceId || row.report_kind !== request.reportKind || row.html_sha256 !== request.htmlSha256)
      throw new ResearchAutomationConflictError('revision_conflict', 'Loại hoặc nội dung bản đọc không khớp phiên bản bạn đã xem.');
    if (row.report_kind === 'INSIGHT') await this.#verifiedInsightPage(row);
    if (request.reportKind === 'MARKET') {
      const result = await this.decide(binding, { contractVersion: 'reader-report-decision-v1', requestKey: request.requestKey,
        revisionId: request.revisionId, decision: request.decision, reason: request.reason }, actor);
      return { contractVersion: 'reader-report-decision-receipt-v2', exactRetry: result.exactRetry, revision: await this.#projectWithPersona(this.#byId(binding.runId, request.revisionId)!) };
    }
    const reason = request.reason === null ? null : request.reason.trim();
    const prior = this.db.prepare('SELECT revision_id FROM analysis_reader_report_decisions WHERE request_key=?').get(request.requestKey) as { revision_id: string } | undefined;
    if (prior) {
      const decided = this.#byId(binding.runId, prior.revision_id);
      if (!decided || decided.revision_id !== request.revisionId || decided.workspace_id !== binding.workspaceId || decided.report_kind !== request.reportKind ||
          decided.html_sha256 !== request.htmlSha256 || decided.decision !== request.decision || decided.reason !== reason || decided.decision_actor_id !== actor.actorId)
        throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một quyết định khác.');
      return { contractVersion: 'reader-report-decision-receipt-v2', exactRetry: true, revision: await this.#projectWithPersona(decided) };
    }
    if (row.decision) throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc này đã có quyết định.');
    this.db.exec('BEGIN IMMEDIATE');
    try {
      this.db.prepare(`INSERT INTO analysis_reader_report_decisions(revision_id,run_id,decision,request_key,reason,actor_id,decided_at)
        VALUES (?,?,?,?,?,?,?)`).run(row.revision_id, binding.runId, request.decision, request.requestKey, reason, actor.actorId, this.now().toISOString());
      this.db.exec('COMMIT');
    } catch (error) {
      if (this.db.inTransaction) this.db.exec('ROLLBACK');
      if (error instanceof Error && /reader_report_decision_requires_latest_revision/.test(error.message)) throw new ResearchAutomationConflictError('revision_conflict', 'Đã có bản đọc insight mới hơn; hãy xem bản mới nhất.');
      if (error instanceof Error && /UNIQUE constraint failed/.test(error.message)) throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc này đã có quyết định.');
      throw error;
    }
    return { contractVersion: 'reader-report-decision-receipt-v2', exactRetry: false, revision: await this.#projectWithPersona(this.#byId(binding.runId, request.revisionId)!) };
  }

  /** Verified page bytes; the manifest must match before anything is served. */
  async html(binding: ReaderBinding, revisionId: string): Promise<{ revision: ResearchAutomationReaderRevision | ResearchAutomationReaderRevisionV2; bytes: Buffer }> {
    const row = this.#byId(binding.runId, revisionId);
    if (!row || row.workspace_id !== binding.workspaceId) throw new ResearchAutomationNotFoundError('reader_report_not_found', 'Không tìm thấy bản đọc.');
    if (row.report_kind === 'INSIGHT') return { revision: await this.#projectWithPersona(row), bytes: await this.#verifiedInsightPage(row) };
    const manifest = this.db.prepare('SELECT byte_size,media_type,relative_path,contract_version,retention_status FROM artifact_manifests WHERE sha256=?')
      .get(row.html_sha256) as { byte_size: number | bigint; media_type: string; relative_path: string; contract_version: string; retention_status: string } | undefined;
    if (!manifest || manifest.media_type !== 'text/html; charset=utf-8' || manifest.contract_version !== '1.0.0' || manifest.retention_status !== 'active' ||
        manifest.relative_path !== `sha256/${row.html_sha256.slice(0, 2)}/${row.html_sha256}`)
      throw new ResearchAutomationIntegrityError('Reader page manifest failed verification.');
    const bytes = await this.artifacts.read(row.html_sha256, { maxBytes: MAX_READER_HTML_BYTES });
    if (BigInt(bytes.byteLength) !== BigInt(manifest.byte_size) || sha(bytes) !== row.html_sha256)
      throw new ResearchAutomationIntegrityError('Reader page failed verification.');
    return { revision: row.report_kind === 'MARKET' ? this.#project(row) : await this.#projectWithPersona(row), bytes };
  }

  /** Insight reads/retries authenticate only their frozen retained record and
   * HTML. Never replay upstream, render again, calculate or write a manifest. */
  async #verifiedInsightPage(row: RevisionRow, expected?: InsightReaderInput): Promise<Buffer> {
    await this.#verifiedInsightInput(row, expected);
    return this.#verifiedInsightArtifact(row.html_sha256, 'text/html; charset=utf-8');
  }
  async #verifiedInsightInput(row: RevisionRow, expected?: InsightReaderInput): Promise<InsightReaderInput> {
    const bytes = await this.#verifiedInsightArtifact(row.input_sha256, 'application/json');
    let record: Record<string, unknown>, input: InsightReaderInput;
    try {
      const parsed: unknown = JSON.parse(bytes.toString('utf8'));
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed) || !bytes.equals(json(parsed)))
        throw new Error('Invalid canonical record');
      record = parsed as Record<string, unknown>;
      const keys = ['contractVersion', 'input', 'revisionId', 'requestSha256', 'htmlSha256', 'citationTrace', 'actorId', 'createdAt'];
      if (Object.keys(record).length !== keys.length || keys.some(key => !Object.hasOwn(record, key)))
        throw new Error('Invalid record fields');
      // The immutable ledger/CAS authenticates the frozen input on GET. On a
      // retry the owning service additionally supplies its replayed exact input.
      input = verifyInsightReaderInput(record.input, expected ?? record.input as InsightReaderInput);
    } catch { throw new ResearchAutomationIntegrityError('Stored Insight reader build record failed verification.'); }
    if (row.report_kind !== 'INSIGHT' || record.contractVersion !== 'insight-reader-build-record-v1' ||
        record.revisionId !== row.revision_id || record.requestSha256 !== row.request_sha256 || record.actorId !== row.actor_id ||
        record.createdAt !== row.created_at || record.htmlSha256 !== row.html_sha256 || input.reportKind !== row.report_kind ||
        input.workspaceId !== row.workspace_id || input.runId !== row.run_id || input.draftPairId !== row.draft_pair_id ||
        input.semanticSha256 !== row.semantic_sha256 || input.sourceReportSha256 !== row.source_report_sha256 || input.builderVersion !== row.builder_version)
      throw new ResearchAutomationIntegrityError('Stored Insight reader build record differs from its immutable binding.');
    return input;
  }
  async #verifiedInsightArtifact(digest: string, mediaType: string): Promise<Buffer> {
    const manifest = this.db.prepare('SELECT byte_size,media_type,relative_path,contract_version,retention_status FROM artifact_manifests WHERE sha256=?')
      .get(digest) as { byte_size: number | bigint; media_type: string; relative_path: string; contract_version: string; retention_status: string } | undefined;
    if (!manifest || manifest.media_type !== mediaType || manifest.contract_version !== '1.0.0' || manifest.retention_status !== 'active' ||
        manifest.relative_path !== `sha256/${digest.slice(0, 2)}/${digest}`)
      throw new ResearchAutomationIntegrityError('Insight reader retained artifact manifest failed verification.');
    const bytes = await this.artifacts.read(digest, { maxBytes: MAX_READER_HTML_BYTES });
    if (BigInt(bytes.byteLength) !== BigInt(manifest.byte_size) || sha(bytes) !== digest)
      throw new ResearchAutomationIntegrityError('Insight reader retained artifact failed verification.');
    return bytes;
  }

  #owner(actor: { actorId: string; role: 'OWNER' }): void {
    if (actor.role !== 'OWNER' || !actor.actorId.trim() || actor.actorId.length > 120)
      throw new ResearchAutomationValidationError('A trusted OWNER actor is required.');
  }
  #exactBuildRetry(row: RevisionRow, context: ReaderBinding, requestSha: string, actor: { actorId: string }): ResearchAutomationReaderRevision {
    if (row.report_kind !== 'MARKET' || row.request_sha256 !== requestSha || row.run_id !== context.runId || row.workspace_id !== context.workspaceId || row.actor_id !== actor.actorId)
      throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.');
    return this.#project(row);
  }
  #byRequestKey(key: string): RevisionRow | undefined {
    return this.db.prepare(`${SELECT} WHERE v.request_key=?`).get(key) as RevisionRow | undefined;
  }
  #byId(runId: string, revisionId: string): RevisionRow | undefined {
    return this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.revision_id=?`).get(runId, revisionId) as RevisionRow | undefined;
  }
  #latest(runId: string, kind: 'MARKET' | 'INSIGHT' = 'MARKET'): RevisionRow | undefined {
    return this.db.prepare(`${SELECT} WHERE v.run_id=? AND v.report_kind=? ORDER BY v.revision_number DESC LIMIT 1`).get(runId, kind) as RevisionRow | undefined;
  }
  #project(row: RevisionRow): ResearchAutomationReaderRevision {
    if (row.report_kind !== 'MARKET' || row.platforms === null || row.profile_status === null) throw new ResearchAutomationIntegrityError('Stored Market reader revision is invalid.');
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
  async #projectWithPersona(row: RevisionRow): Promise<ResearchAutomationReaderRevisionV2> {
    if (row.report_kind !== 'INSIGHT') return this.#projectV2(row);
    // Authenticate the frozen record before dispatching by ledger version, so a
    // corrupted v6 row cannot masquerade as an older saved Reader.
    const input = await this.#verifiedInsightInput(row);
    if (row.builder_version !== 'reader-report-insight-v6') return this.#projectV2(row);
    await this.#verifiedInsightArtifact(row.html_sha256, 'text/html; charset=utf-8');
    if (input.contractVersion !== 'insight-reader-input-v6') throw new ResearchAutomationIntegrityError('Persona reader revision lacks its exact frozen input.');
    return this.#projectV2(row, input);
  }
  #projectV2(row: RevisionRow, personaInput?: Extract<InsightReaderInput, { contractVersion: 'insight-reader-input-v6' }>): ResearchAutomationReaderRevisionV2 {
    let revision: ResearchAutomationReaderRevisionV2;
    if (row.report_kind === 'MARKET') revision = { ...this.#project(row), reportKind: 'MARKET', builderVersion: row.builder_version };
    else {
      if (row.semantic_sha256 === null || row.source_report_sha256 === null || (row.builder_version !== 'reader-report-insight-v1' && row.builder_version !== 'reader-report-insight-v2' && row.builder_version !== 'reader-report-insight-v3' && row.builder_version !== 'reader-report-insight-v4' && row.builder_version !== 'reader-report-insight-v5' && row.builder_version !== 'reader-report-insight-v6'))
        throw new ResearchAutomationIntegrityError('Stored Insight reader revision is invalid.');
      const latest = this.#latest(row.run_id, 'INSIGHT');
      const base = { reportKind: 'INSIGHT' as const, builderVersion: row.builder_version, revisionId: row.revision_id,
        revisionNumber: Number(row.revision_number), workspaceId: row.workspace_id, runId: row.run_id,
        state: row.decision ?? (latest?.revision_id === row.revision_id ? 'PENDING_OWNER_REVIEW' as const : 'SUPERSEDED' as const),
        draftPairId: row.draft_pair_id, semanticSha256: row.semantic_sha256, sourceReportSha256: row.source_report_sha256,
        htmlSha256: row.html_sha256, createdAt: row.created_at,
        decision: row.decision && row.decided_at ? { decision: row.decision, reason: row.reason, decidedAt: row.decided_at } : null };
      if (row.builder_version === 'reader-report-insight-v6') {
        const input = personaInput;
        if (!input) throw new ResearchAutomationIntegrityError('Persona reader revision requires its verified frozen input.');
        revision = { ...base, builderVersion: 'reader-report-insight-v6', personaProposalId: input.personaProposalId,
          personaProposalSha256: input.personaProposalSha256, personaSourcePairId: input.personaSourcePairId, personaSourceSha256: input.personaSourceSha256 };
      } else revision = { ...base, builderVersion: row.builder_version };
    }
    if (!validRevisionV2(revision)) throw new ResearchAutomationIntegrityError('Stored kind-bound reader revision is invalid.');
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
