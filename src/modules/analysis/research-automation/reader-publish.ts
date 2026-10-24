import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import { publishReaderReport, ReaderReportGateError } from '../reader-report/index.js';
import type { InsightReaderInput } from '../reader-report/insight-input-v1.js';
import { buildInsightReaderTemplate, type InsightReaderPage } from '../reader-report/insight-template.js';
import { INSIGHT_SECTION_IDS } from '../reader-report/insight-projection.js';
import { ResearchAutomationConflictError, ResearchAutomationIntegrityError, ResearchAutomationValidationError } from './model.js';

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
  const { input } = build;
  const retry = (row: RevisionRow): ReaderPublishOutcome => {
    if (row.report_kind !== 'INSIGHT' || row.workspace_id !== build.workspaceId || row.run_id !== build.runId || row.draft_pair_id !== input.draftPairId ||
        row.semantic_sha256 !== input.semanticSha256 || row.source_report_sha256 !== input.sourceReportSha256 || row.actor_id !== build.actorId || row.request_sha256 !== build.requestSha256)
      throw new ResearchAutomationConflictError('request_key_conflict', 'Mã yêu cầu đã dùng cho một lần dựng khác.');
    return { exactRetry: true, row };
  };
  const prior = revisionByRequestKey(db, build.requestKey); if (prior) return retry(prior);
  if (latestRevision(db, build.runId, 'INSIGHT')?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc insight mới nhất đã được chủ duyệt.');
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
  db.exec('BEGIN IMMEDIATE');
  try {
    const raced = revisionByRequestKey(db, build.requestKey);
    if (raced) { db.exec('ROLLBACK'); return retry(raced); }
    if (latestRevision(db, build.runId, 'INSIGHT')?.decision === 'APPROVED') throw new ResearchAutomationConflictError('invalid_state', 'Bản đọc insight mới nhất đã được chủ duyệt.');
    registerReaderManifest(db, published.html, 'text/html; charset=utf-8', createdAt);
    for (const artifact of [published.metrics, published.claims, record]) registerReaderManifest(db, artifact, 'application/json', createdAt);
    const next = Number((db.prepare("SELECT COALESCE(max(revision_number),0)+1 n FROM analysis_reader_report_revisions WHERE run_id=? AND report_kind='INSIGHT'").get(build.runId) as { n: number | bigint }).n);
    db.prepare(`INSERT INTO analysis_reader_report_revisions(report_kind,semantic_sha256,source_report_sha256,
      revision_id,workspace_id,run_id,revision_number,request_key,request_sha256,draft_pair_id,input_sha256,html_sha256,metrics_sha256,claims_sha256,builder_version,actor_id,created_at)
      VALUES ('INSIGHT',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(input.semanticSha256, input.sourceReportSha256,
      revisionId, build.workspaceId, build.runId, next, build.requestKey, build.requestSha256, input.draftPairId, record.sha256,
      published.html.sha256, published.metrics.sha256, published.claims.sha256, input.builderVersion, build.actorId, createdAt);
    build.ledger?.(revisionId, createdAt);
    db.exec('COMMIT');
  } catch (error) {
    if (db.inTransaction) db.exec('ROLLBACK');
    if (error instanceof Error && /reader_report_requires_draft_ready_sequence/.test(error.message)) throw new ResearchAutomationConflictError('invalid_state', 'Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.');
    throw error;
  }
  return { exactRetry: false, revisionId };
}
