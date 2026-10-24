import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import { publishReaderReport, ReaderReportGateError, storeReaderProfile, type BuiltMarketReport, type StoredCoverImage } from '../reader-report/index.js';
import type { InsightReaderInput } from '../reader-report/insight-input-v1.js';
import { buildInsightReaderTemplate, type InsightReaderPage } from '../reader-report/insight-template.js';
import { INSIGHT_SECTION_IDS } from '../reader-report/insight-projection.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationValidationError } from './model.js';
import { checkMarketReport } from './market-report-check.js';
import { marketCheckReasons, readerLintReasons } from './market-check-reasons.js';

export const MAX_READER_HTML_BYTES = 32 * 1024 * 1024;
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value), 'utf8');

export interface RevisionRow {
  report_kind: 'MARKET' | 'INSIGHT'; semantic_sha256: string | null; source_report_sha256: string | null;
  revision_id: string; workspace_id: string; run_id: string; revision_number: number | bigint; request_key: string; request_sha256: string;
  draft_pair_id: string; metric_package_id: string | null; platforms: string | null; profile_status: 'proposed' | 'approved' | null;
  input_sha256: string; profile_sha256: string | null; cover_sha256: string | null; html_sha256: string; metrics_sha256: string; claims_sha256: string;
  builder_version: string; actor_id: string; created_at: string;
  decision: 'APPROVED' | 'REJECTED' | null; decision_request_key: string | null; reason: string | null; decision_actor_id: string | null; decided_at: string | null;
}
export const SELECT = `SELECT v.*, d.decision, d.request_key decision_request_key, d.reason, d.actor_id decision_actor_id, d.decided_at
  FROM analysis_reader_report_revisions v LEFT JOIN analysis_reader_report_decisions d ON d.revision_id = v.revision_id`;

export function revisionByRequestKey(db: Database.Database, key: string): RevisionRow | undefined {
  return db.prepare(`${SELECT} WHERE v.request_key=?`).get(key) as RevisionRow | undefined;
}
export function latestRevision(db: Database.Database, runId: string, kind: 'MARKET' | 'INSIGHT'): RevisionRow | undefined {
  return db.prepare(`${SELECT} WHERE v.run_id=? AND v.report_kind=? ORDER BY v.revision_number DESC LIMIT 1`).get(runId, kind) as RevisionRow | undefined;
}
export function registerReaderManifest(db: Database.Database, artifact: StoredArtifact, mediaType: string, at: string): void {
  db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,?,?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`).run(artifact.sha256, artifact.byteSize, mediaType, artifact.relativePath, at, at);
  const row = db.prepare('SELECT byte_size,media_type,relative_path FROM artifact_manifests WHERE sha256=?').get(artifact.sha256) as
    { byte_size: number | bigint; media_type: string; relative_path: string };
  if (BigInt(row.byte_size) !== BigInt(artifact.byteSize) || row.media_type !== mediaType || row.relative_path !== artifact.relativePath)
    throw new ResearchAutomationIntegrityError('Artifact manifest conflict.');
}

const HTML = 'text/html; charset=utf-8', JSON_TYPE = 'application/json';
const INSIGHT_APPROVED = 'Bản đọc insight mới nhất đã được chủ duyệt.';
const MARKET_APPROVED = 'Bản đọc mới nhất đã được chủ duyệt.';

/**
 * The one revision transaction: request-key race recheck, latest-APPROVED
 * recheck, manifests, next revision number, row insert, optional ledger row.
 * Returns the row that claimed the key first (nothing written), else undefined.
 */
function commitRevision(db: Database.Database, tx: {
  readonly kind: 'MARKET' | 'INSIGHT'; readonly runId: string; readonly requestKey: string; readonly createdAt: string; readonly approved: string;
  readonly manifests: readonly (readonly [StoredArtifact, string])[]; readonly insert: (next: number) => void; readonly ledger?: () => void;
}): RevisionRow | undefined {
  db.exec('BEGIN IMMEDIATE');
  try {
    // A concurrent writer on another connection may have claimed the key.
    const raced = revisionByRequestKey(db, tx.requestKey);
    if (raced) { db.exec('ROLLBACK'); return raced; }
    if (latestRevision(db, tx.runId, tx.kind)?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', tx.approved);
    for (const [artifact, mediaType] of tx.manifests) registerReaderManifest(db, artifact, mediaType, tx.createdAt);
    const next = Number((db.prepare('SELECT COALESCE(max(revision_number),0)+1 n FROM analysis_reader_report_revisions WHERE run_id=? AND report_kind=?').get(tx.runId, tx.kind) as { n: number | bigint }).n);
    tx.insert(next);
    tx.ledger?.();
    db.exec('COMMIT');
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    if (error instanceof Error && /reader_report_requires_draft_ready_sequence/.test(error.message)) throw new ResearchAutomationConflictError('invalid_state', 'Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.');
    throw error;
  }
  return undefined;
}

/** One Insight-family (Insight, TikTok, Shopee) reader build after the family's own checks passed. */
export interface InsightFamilyPublish {
  /** Family word in the owner-visible size and gate messages. */
  readonly family: 'insight' | 'TikTok' | 'Shopee';
  readonly workspaceId: string; readonly runId: string; readonly actorId: string;
  readonly requestKey: string; readonly requestSha256: string;
  /** Verified frozen input; it binds the retry check, the stored record and the revision row. */
  readonly input: InsightReaderInput;
  readonly page: InsightReaderPage;
  /** Called once, after the gate passed. */
  readonly createdAt: () => string;
  /** Family ledger row written inside the revision transaction, first build only. */
  readonly ledger?: (revisionId: string, createdAt: string) => void;
}
export type ReaderPublishOutcome = { readonly exactRetry: true; readonly row: RevisionRow } | { readonly exactRetry: false; readonly revisionId: string };

/**
 * Publishes one reader revision, or resolves an exact request-key retry. Owns
 * the approved-latest refusal, size bound, publish gate, stored build record and
 * the single transaction (race recheck, manifests, numbering, row, ledger).
 * An exact-retry row is returned unverified; the caller re-verifies its page.
 */
export async function publishInsightFamilyRevision(db: Database.Database, artifacts: ContentAddressedArtifactStore, build: InsightFamilyPublish): Promise<ReaderPublishOutcome> {
  const { input, page } = build;
  // D3: every Insight-family page restates its frozen scope (c3 b3).
  if (page.keyword !== input.scope.keyword || page.definition !== input.scope.definition || canonicalJson(page.period) !== canonicalJson(input.scope.requestedPeriod))
    throw new ResearchAutomationIntegrityError(`${build.family === 'insight' ? 'Insight' : build.family} reader context differs from its exact frozen binding.`);
  const retry = (row: RevisionRow): ReaderPublishOutcome => {
    if (row.report_kind !== 'INSIGHT' || row.workspace_id !== build.workspaceId || row.run_id !== build.runId || row.draft_pair_id !== input.draftPairId ||
        row.semantic_sha256 !== input.semanticSha256 || row.source_report_sha256 !== input.sourceReportSha256 || row.actor_id !== build.actorId || row.request_sha256 !== build.requestSha256)
      throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.');
    return { exactRetry: true, row };
  };
  const prior = revisionByRequestKey(db, build.requestKey); if (prior) return retry(prior);
  if (latestRevision(db, build.runId, 'INSIGHT')?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', INSIGHT_APPROVED);
  const built = buildInsightReaderTemplate(build.page);
  if (Buffer.byteLength(built.html) > MAX_READER_HTML_BYTES) throw new ResearchAutomationValidationError(`Bản đọc ${build.family} vượt giới hạn bản lưu; không cắt dữ liệu hoặc tự thu lại.`);
  let published;
  try { published = await publishReaderReport(artifacts, { ...built, reportKind: 'INSIGHT', visibleTextRules: true, sectionIds: ['insight-findings', ...INSIGHT_SECTION_IDS] }); }
  catch (error) {
    if (error instanceof ReaderReportGateError) throw new ResearchAutomationValidationError(`Bản đọc ${build.family} chưa đạt kiểm tra bằng chứng hoặc cách trình bày.`);
    throw error;
  }
  const createdAt = build.createdAt(), revisionId = randomUUID();
  const record = await artifacts.put(json({ contractVersion: 'insight-reader-build-record-v1', input,
    revisionId, requestSha256: build.requestSha256, htmlSha256: published.html.sha256, citationTrace: built.citationTrace, actorId: build.actorId, createdAt }));
  const raced = commitRevision(db, { kind: 'INSIGHT', runId: build.runId, requestKey: build.requestKey, createdAt, approved: INSIGHT_APPROVED,
    manifests: [[published.html, HTML], [published.metrics, JSON_TYPE], [published.claims, JSON_TYPE], [record, JSON_TYPE]],
    insert: next => db.prepare(`INSERT INTO analysis_reader_report_revisions(report_kind,semantic_sha256,source_report_sha256,
      revision_id,workspace_id,run_id,revision_number,request_key,request_sha256,draft_pair_id,input_sha256,html_sha256,metrics_sha256,claims_sha256,builder_version,actor_id,created_at)
      VALUES ('INSIGHT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.semanticSha256, input.sourceReportSha256,
      revisionId, build.workspaceId, build.runId, next, build.requestKey, build.requestSha256, input.draftPairId, record.sha256,
      published.html.sha256, published.metrics.sha256, published.claims.sha256, input.builderVersion, build.actorId, createdAt),
    ...(build.ledger ? { ledger: () => build.ledger!(revisionId, createdAt) } : {}) });
  if (raced) return retry(raced);
  return { exactRetry: false, revisionId };
}

/**
 * One Market reader build after the Market adapter's own steps passed (request
 * checks, rows, peers, unit prices, cover storage, public review source, page
 * build, Flint). The caller owns the request-key retry and the early APPROVED
 * check before its input checks, and projects the receipt.
 */
export interface MarketPublish {
  readonly workspaceId: string; readonly runId: string; readonly actorId: string; readonly draftPairId: string;
  readonly requestKey: string; readonly requestSha256: string; readonly contractVersion: string;
  readonly metricPackageId: string; readonly platforms: readonly string[];
  readonly profile: { readonly status: 'proposed' | 'approved' };
  readonly builderVersion: string; readonly publicReviewSource: boolean; readonly requireFlint: boolean;
  /** Taken before the page was built (footer date). */
  readonly createdAt: string;
  /** Allocated before page construction and artifact writes to preserve Market record bytes. */
  readonly revisionId: string;
  readonly page: Pick<BuiltMarketReport, 'html' | 'narrator' | 'extraOk'>;
  /** Cover image and sidecar, already stored; registered in the revision transaction. */
  readonly cover: StoredCoverImage | null;
  /** Stored build record contents; canonical JSON. */
  readonly record: (stored: { readonly revisionId: string; readonly profileSha256: string; readonly htmlSha256: string }) => Record<string, unknown>;
}

/**
 * Publishes one Market reader revision: size bound (D9), Market check then
 * Reader gate, profile and build record, and the shared transaction with the
 * APPROVED recheck (D8). Any refusal here comes after the cover artifacts were
 * written, never after a revision row.
 */
export async function publishMarketRevision(db: Database.Database, artifacts: ContentAddressedArtifactStore, build: MarketPublish): Promise<ReaderPublishOutcome> {
  const { page } = build;
  if (Buffer.byteLength(page.html) > MAX_READER_HTML_BYTES) throw new ResearchAutomationValidationError('Bản đọc vượt giới hạn bản lưu; không cắt dữ liệu hoặc tự thu lại.');
  // The gate blocks report publication and revision insertion; cover/sidecar artifacts may already be written.
  // One Market check by contract version (gate, plus the fourteen rules for v1.2); the owner sees plain reasons, ops get the ids (owner Q2).
  const check = checkMarketReport(page.html, { kind: 'READER', contractVersion: build.contractVersion, requireFlint: build.requireFlint, publicReviewSource: build.publicReviewSource });
  if (check.failure) throw new ResearchAutomationValidationError(
    `Bản đọc chưa đạt kiểm tra bằng chứng hoặc cách trình bày: ${marketCheckReasons(check.failure.message).join(' ')} Hãy sửa cách trình bày trước khi tạo phiên bản mới.`,
    { cause: new TypeError(check.failure.message) });
  let published;
  try { published = await publishReaderReport(artifacts, { html: page.html, narrator: page.narrator, extraOk: page.extraOk, visibleTextRules: build.contractVersion === 'reader-report-build-v1.2', ...(check.visibleText ? { visibleTextResults: check.visibleText } : {}), publicReviewSource: build.publicReviewSource }); }
  catch (error) {
    if (error instanceof ReaderReportGateError) throw new ResearchAutomationValidationError(
      `Bản đọc chưa đạt kiểm tra bằng chứng hoặc cách trình bày: ${readerLintReasons(error.lint.filter(row => !row.ok).map(row => row.rule), error.hardcoded.length, error.notInBundle.length).join(' ')} Hãy kiểm tra nguồn, nhận định và nhãn phân loại chờ chủ duyệt trước khi tạo phiên bản mới.`,
      { cause: error });
    throw error;
  }
  const { revisionId, createdAt, cover } = build;
  const profile = (await storeReaderProfile(artifacts, build.profile)).artifact;
  const record = await artifacts.put(json(build.record({ revisionId, profileSha256: profile.sha256, htmlSha256: published.html.sha256 })));
  const raced = commitRevision(db, { kind: 'MARKET', runId: build.runId, requestKey: build.requestKey, createdAt, approved: MARKET_APPROVED,
    manifests: [[published.html, HTML], [published.metrics, JSON_TYPE], [published.claims, JSON_TYPE], [profile, JSON_TYPE], [record, JSON_TYPE],
      ...(cover ? [[cover.image, cover.mime], [cover.sidecar, JSON_TYPE]] as const : [])],
    insert: next => db.prepare(`INSERT INTO analysis_reader_report_revisions(revision_id,workspace_id,run_id,revision_number,request_key,request_sha256,
      draft_pair_id,metric_package_id,platforms,profile_status,input_sha256,profile_sha256,cover_sha256,html_sha256,metrics_sha256,claims_sha256,
      builder_version,actor_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      revisionId, build.workspaceId, build.runId, next, build.requestKey, build.requestSha256, build.draftPairId, build.metricPackageId,
      build.platforms.join(','), build.profile.status, record.sha256, profile.sha256, cover?.coverSha256 ?? null,
      published.html.sha256, published.metrics.sha256, published.claims.sha256, build.builderVersion, build.actorId, createdAt) });
  return raced ? { exactRetry: true, row: raced } : { exactRetry: false, revisionId };
}
