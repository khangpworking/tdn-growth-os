import type Database from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { extractPageIndexPdf } from './pageindex-questions.js';

/**
 * SQLite-backed ledger for automatic PDF indexing uploads, plus the shared
 * ingest hook used by every run path that handles PDF bytes. The same source
 * SHA-256 is never uploaded twice, across runs too. Nothing here throws to a
 * run: `ensureIndexed` always returns an outcome.
 */
export type PageIndexDocumentStatus =
  | 'INDEXING'
  | 'READY'
  | 'FAILED'
  | 'SKIPPED_LOW_BALANCE'
  | 'SKIPPED_USAGE_LIMIT';

export type PageIndexDocumentErrorCode =
  | 'INVALID_SHA256'
  | 'INVALID_FILENAME'
  | 'STORE_UNAVAILABLE';

export class PageIndexDocumentError extends Error {
  constructor(readonly code: PageIndexDocumentErrorCode) {
    super(`PageIndex document rejected: ${code}`);
    this.name = 'PageIndexDocumentError';
  }
}

export interface PageIndexDocumentRow {
  readonly sourceSha256: string;
  readonly cloudDocId: string | null;
  readonly cloudFileName: string;
  readonly pageCount: number;
  readonly uploadedAt: string | null;
  readonly status: PageIndexDocumentStatus;
  readonly failureCode: string | null;
  readonly updatedAt: string;
  readonly uploadAttempted: boolean;
  readonly uploadAttemptedAt: string | null;
}

const SHA256 = /^[0-9a-f]{64}$/;
const STATUSES: ReadonlySet<string> = new Set<PageIndexDocumentStatus>([
  'INDEXING',
  'READY',
  'FAILED',
  'SKIPPED_LOW_BALANCE',
  'SKIPPED_USAGE_LIMIT',
]);

function assertSha256(value: string): void {
  if (typeof value !== 'string' || !SHA256.test(value)) throw new PageIndexDocumentError('INVALID_SHA256');
}

function rowOf(value: {
  source_sha256: string;
  cloud_doc_id: string | null;
  cloud_file_name: string;
  page_count: number | bigint;
  uploaded_at: string | null;
  status: string;
  failure_code: string | null;
  updated_at: string;
  upload_attempted: number | bigint;
  upload_attempted_at: string | null;
}): PageIndexDocumentRow {
  if (!STATUSES.has(value.status)) throw new PageIndexDocumentError('STORE_UNAVAILABLE');
  return {
    sourceSha256: value.source_sha256,
    cloudDocId: value.cloud_doc_id,
    cloudFileName: value.cloud_file_name,
    pageCount: Number(value.page_count),
    uploadedAt: value.uploaded_at,
    status: value.status as PageIndexDocumentStatus,
    failureCode: value.failure_code,
    updatedAt: value.updated_at,
    uploadAttempted: Number(value.upload_attempted) === 1,
    uploadAttemptedAt: value.upload_attempted_at,
  };
}

/** Reads one ledger row by exact source SHA-256, or null when never seen. */
export function readPageIndexDocument(db: Database.Database, sourceSha256: string): PageIndexDocumentRow | null {
  assertSha256(sourceSha256);
  try {
    const found = db
      .prepare(`SELECT source_sha256, cloud_doc_id, cloud_file_name, page_count, uploaded_at, status, failure_code, updated_at, upload_attempted, upload_attempted_at
        FROM analysis_pageindex_documents WHERE source_sha256 = ?`)
      .get(sourceSha256) as Parameters<typeof rowOf>[0] | undefined;
    return found ? rowOf(found) : null;
  } catch (error) {
    if (error instanceof PageIndexDocumentError) throw error;
    throw new PageIndexDocumentError('STORE_UNAVAILABLE');
  }
}

/** Lists every ledger row, newest first. Used by the status card's document count. */
export function listPageIndexDocuments(db: Database.Database): readonly PageIndexDocumentRow[] {
  try {
    const rows = db
      .prepare(`SELECT source_sha256, cloud_doc_id, cloud_file_name, page_count, uploaded_at, status, failure_code, updated_at, upload_attempted, upload_attempted_at
        FROM analysis_pageindex_documents ORDER BY updated_at DESC, source_sha256 ASC`)
      .all() as Array<Parameters<typeof rowOf>[0]>;
    return rows.map(rowOf);
  } catch (error) {
    if (error instanceof PageIndexDocumentError) throw error;
    throw new PageIndexDocumentError('STORE_UNAVAILABLE');
  }
}

/** True while the vendor usage-limit flag row is set. No new upload may start. */
export function isPageIndexUsageLimited(db: Database.Database): boolean {
  try {
    const flag = db
      .prepare(`SELECT flag_value FROM analysis_pageindex_flags WHERE flag_key = 'usage_limit_reached'`)
      .get() as { flag_value: string } | undefined;
    return flag?.flag_value === '1';
  } catch {
    // Fail closed when the ledger is unavailable: never spend blindly.
    return true;
  }
}

/** Sets or clears the vendor usage-limit flag row. */
export function setPageIndexUsageLimited(db: Database.Database, limited: boolean, now: () => Date = () => new Date()): void {
  try {
    db.prepare(`UPDATE analysis_pageindex_flags SET flag_value = ?, updated_at = ? WHERE flag_key = 'usage_limit_reached'`)
      .run(limited ? '1' : '0', now().toISOString());
  } catch {
    throw new PageIndexDocumentError('STORE_UNAVAILABLE');
  }
}

export interface PageIndexPdfFile {
  readonly sha256: string;
  readonly fileName: string;
  readonly bytes: Uint8Array;
}

/** A run PDF reference without bytes: used to join inventory against the ledger. */
export interface PageIndexPdfRef {
  readonly sha256: string;
  readonly fileName: string;
}

export type EnsureIndexedOutcome =
  | 'READY'
  | 'INDEXING'
  | 'FAILED'
  | 'SKIPPED_DISABLED'
  | 'SKIPPED_LOW_BALANCE'
  | 'SKIPPED_USAGE_LIMIT';

export interface EnsureIndexedResult {
  readonly outcome: EnsureIndexedOutcome;
  readonly cloudDocId: string | null;
  readonly failureCode: string | null;
  /** Vendor upload calls made by this invocation: 0 or 1, never more. */
  readonly uploadCalls: number;
}

export interface EnsureIndexedDeps {
  readonly db: Database.Database;
  readonly now?: () => Date;
  /** Kill switch. Defaults to `TDN_PAGEINDEX_CLOUD_ENABLED === 'true'`. */
  readonly enabled?: boolean;
  /** Fail-closed balance gate. True (or resolving true) makes zero upload calls. */
  readonly lowBalance?: boolean | ((pageCount: number) => boolean | Promise<boolean>);
  /** Usage-limit gate. Defaults to the ledger flag row. True makes zero upload calls. */
  readonly usageLimited?: boolean | (() => boolean | Promise<boolean>);
  /** Local page counter. Defaults to the bounded exact-byte pypdf extractor. */
  readonly countPages?: ((bytes: Uint8Array) => number | Promise<number>) | undefined;
  /** Vendor transport. A single call at most; absent transport leaves the row INDEXING. */
  readonly upload?: ((input: { fileName: string; bytes: Uint8Array }) => Promise<{ cloudDocId: string; pageCount: number | null }>) | undefined;
  /** Indexing-state poll. Absent poll leaves the row INDEXING for a later run. */
  readonly fetchStatus?: ((cloudDocId: string) => Promise<'processing' | 'completed' | 'failed' | 'unknown'>) | undefined;
  /** Upper bound on status polls per invocation. Defaults to 6. */
  readonly maxStatusPolls?: number;
  /** Injectable delay between polls. Defaults to no delay. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly waitBetweenPollsMs?: number;
  /** Observability hook. Must not throw; exceptions are ignored. */
  readonly onEvent?: (event: { readonly kind: string; readonly sourceSha256: string; readonly detail?: string }) => void;
}

const MAX_UPSERT_FILENAME = 256;

function emit(deps: EnsureIndexedDeps, event: { readonly kind: string; readonly sourceSha256: string; readonly detail?: string }): void {
  try {
    deps.onEvent?.(event);
  } catch {
    // Observability must never break indexing.
  }
}

function upsert(
  db: Database.Database,
  input: { sourceSha256: string; cloudDocId: string | null; cloudFileName: string; pageCount: number; uploadedAt: string | null; status: PageIndexDocumentStatus; failureCode: string | null; updatedAt: string },
): void {
  db.prepare(
    `INSERT INTO analysis_pageindex_documents(source_sha256, cloud_doc_id, cloud_file_name, page_count, uploaded_at, status, failure_code, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(source_sha256) DO UPDATE SET
       cloud_doc_id = excluded.cloud_doc_id, cloud_file_name = excluded.cloud_file_name, page_count = excluded.page_count,
       uploaded_at = excluded.uploaded_at, status = excluded.status, failure_code = excluded.failure_code, updated_at = excluded.updated_at
     WHERE status <> 'READY'`,
  ).run(input.sourceSha256, input.cloudDocId, input.cloudFileName, input.pageCount,
    input.uploadedAt, input.status, input.failureCode, input.updatedAt);
}

async function resolveFlag(value: boolean | (() => boolean | Promise<boolean>) | undefined, fallback: () => boolean | Promise<boolean>): Promise<boolean> {
  try {
    if (value === undefined) return fallback();
    return typeof value === 'boolean' ? value : await value();
  } catch {
    // Fail closed: an unreadable gate never authorises spending.
    return true;
  }
}

/**
 * Ensures one PDF is indexed, uploading at most once per source SHA-256 across
 * all runs. Checks the kill switch, the `%PDF-` magic with a 1–1000 page
 * bound, the low-balance gate and the usage-limit gate before any upload call;
 * waits a bounded number of status polls afterwards. Never throws: every
 * failure is returned as an outcome with a failure code.
 */
export async function ensureIndexed(pdf: PageIndexPdfFile, deps: EnsureIndexedDeps): Promise<EnsureIndexedResult> {
  const at = (): string => (deps.now ?? (() => new Date()))().toISOString();
  let uploadCalls = 0;
  try {
    if (!SHA256.test(pdf.sha256) || typeof pdf.fileName !== 'string' || !pdf.fileName.trim() ||
      pdf.fileName.length > MAX_UPSERT_FILENAME || !(pdf.bytes instanceof Uint8Array)) {
      return { outcome: 'FAILED', cloudDocId: null, failureCode: 'PAGEINDEX_INPUT_INVALID', uploadCalls: 0 };
    }
    const enabled = deps.enabled ?? process.env.TDN_PAGEINDEX_CLOUD_ENABLED === 'true';
    if (!enabled) return { outcome: 'SKIPPED_DISABLED', cloudDocId: null, failureCode: null, uploadCalls: 0 };
    const existing = readPageIndexDocument(deps.db, pdf.sha256);
    if (createHash('sha256').update(pdf.bytes).digest('hex') !== pdf.sha256 || pdf.bytes.length > 32 * 1024 * 1024)
      return { outcome: 'FAILED', cloudDocId: null, failureCode: 'PAGEINDEX_INPUT_INVALID', uploadCalls: 0 };
    // A finished or failed row is terminal: the same sha is never uploaded twice.
    if (existing?.status === 'READY') return { outcome: 'READY', cloudDocId: existing.cloudDocId, failureCode: null, uploadCalls: 0 };
    if (existing?.status === 'FAILED') {
      return { outcome: 'FAILED', cloudDocId: existing.cloudDocId, failureCode: existing.failureCode, uploadCalls: 0 };
    }
    if (existing?.uploadAttempted && !existing.cloudDocId)
      return { outcome: existing.status, cloudDocId: null, failureCode: existing.failureCode, uploadCalls: 0 };
    const magic = new TextDecoder('utf-8', { fatal: false }).decode(pdf.bytes.subarray(0, 5));
    if (!magic.startsWith('%PDF-')) {
      upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: null, cloudFileName: pdf.fileName, pageCount: 1,
        uploadedAt: null, status: 'FAILED', failureCode: 'PAGEINDEX_LOCAL_PDF_INVALID', updatedAt: at() });
      emit(deps, { kind: 'dropped', sourceSha256: pdf.sha256, detail: 'missing %PDF- magic' });
      return { outcome: 'FAILED', cloudDocId: null, failureCode: 'PAGEINDEX_LOCAL_PDF_INVALID', uploadCalls: 0 };
    }
    let pages = 0;
    try {
      pages = deps.countPages ? await deps.countPages(pdf.bytes) : (await extractPageIndexPdf(pdf.bytes)).length;
    } catch {
      pages = 0;
    }
    if (!Number.isSafeInteger(pages) || pages < 1 || pages > 1000) {
      upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: null, cloudFileName: pdf.fileName, pageCount: 1,
        uploadedAt: null, status: 'FAILED', failureCode: 'PAGEINDEX_PAGE_COUNT_OUT_OF_RANGE', updatedAt: at() });
      emit(deps, { kind: 'dropped', sourceSha256: pdf.sha256, detail: 'page count outside 1-1000' });
      return { outcome: 'FAILED', cloudDocId: null, failureCode: 'PAGEINDEX_PAGE_COUNT_OUT_OF_RANGE', uploadCalls: 0 };
    }
    const balanceGate = deps.lowBalance;
    if (await resolveFlag(typeof balanceGate === 'function' ? () => balanceGate(existing?.uploadAttempted ? 0 : pages) : balanceGate, () => false)) {
      upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: existing?.cloudDocId ?? null, cloudFileName: pdf.fileName,
        pageCount: pages, uploadedAt: existing?.uploadedAt ?? null, status: 'SKIPPED_LOW_BALANCE', failureCode: null, updatedAt: at() });
      return { outcome: 'SKIPPED_LOW_BALANCE', cloudDocId: existing?.cloudDocId ?? null, failureCode: null, uploadCalls: 0 };
    }
    if (await resolveFlag(deps.usageLimited, () => isPageIndexUsageLimited(deps.db))) {
      upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: existing?.cloudDocId ?? null, cloudFileName: pdf.fileName,
        pageCount: pages, uploadedAt: existing?.uploadedAt ?? null, status: 'SKIPPED_USAGE_LIMIT', failureCode: null, updatedAt: at() });
      return { outcome: 'SKIPPED_USAGE_LIMIT', cloudDocId: existing?.cloudDocId ?? null, failureCode: null, uploadCalls: 0 };
    }
    // A row already uploaded by an earlier run only needs its bounded wait.
    const uploaded = existing && existing.cloudDocId && existing.uploadedAt ? existing : null;
    let cloudDocId = uploaded?.cloudDocId ?? null;
    if (!uploaded) {
      if (!deps.upload) {
        upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: null, cloudFileName: pdf.fileName,
          pageCount: pages, uploadedAt: null, status: 'INDEXING', failureCode: null, updatedAt: at() });
        return { outcome: 'INDEXING', cloudDocId: null, failureCode: null, uploadCalls: 0 };
      }
      // This synchronous SQLite reservation is committed before any network call.
      // Even a crash or an unreadable acknowledgement must never cause a retry.
      const reserved = deps.db.prepare(`INSERT INTO analysis_pageindex_documents
        (source_sha256, cloud_doc_id, cloud_file_name, page_count, uploaded_at, status, failure_code, updated_at, upload_attempted, upload_attempted_at)
        VALUES (?, NULL, ?, ?, NULL, 'INDEXING', NULL, ?, 1, ?)
        ON CONFLICT(source_sha256) DO UPDATE SET status='INDEXING', failure_code=NULL, upload_attempted=1, updated_at=excluded.updated_at,upload_attempted_at=excluded.upload_attempted_at
        WHERE analysis_pageindex_documents.upload_attempted=0
        RETURNING source_sha256`).get(pdf.sha256, pdf.fileName, pages, at(), at());
      if (!reserved) {
        const winner = readPageIndexDocument(deps.db, pdf.sha256);
        return { outcome: winner?.status ?? 'INDEXING', cloudDocId: winner?.cloudDocId ?? null,
          failureCode: winner?.failureCode ?? null, uploadCalls: 0 };
      }
      let acknowledged = false;
      try {
        uploadCalls = 1;
        const uploadedDoc = await deps.upload({ fileName: pdf.fileName, bytes: pdf.bytes });
        acknowledged = true;
        cloudDocId = uploadedDoc.cloudDocId;
        upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId, cloudFileName: pdf.fileName,
          pageCount: uploadedDoc.pageCount ?? pages, uploadedAt: at(), status: 'INDEXING', failureCode: null, updatedAt: at() });
      } catch (error) {
        if (acknowledged) throw error;
        const code = error instanceof Error && /^PAGEINDEX_[A-Z0-9_]+$/u.test(error.message) ? error.message : 'PAGEINDEX_TRANSPORT_FAILED';
        if (code === 'PAGEINDEX_USAGE_LIMIT_REACHED') {
          try { setPageIndexUsageLimited(deps.db, true, deps.now); } catch { /* flag write is best effort */ }
          upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: null, cloudFileName: pdf.fileName,
            pageCount: pages, uploadedAt: null, status: 'SKIPPED_USAGE_LIMIT', failureCode: code, updatedAt: at() });
          emit(deps, { kind: 'usage_limited', sourceSha256: pdf.sha256 });
          return { outcome: 'SKIPPED_USAGE_LIMIT', cloudDocId: null, failureCode: code, uploadCalls: 1 };
        }
        upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId: null, cloudFileName: pdf.fileName,
          pageCount: pages, uploadedAt: null, status: 'FAILED', failureCode: code, updatedAt: at() });
        emit(deps, { kind: 'failed', sourceSha256: pdf.sha256, detail: code });
        return { outcome: 'FAILED', cloudDocId: null, failureCode: code, uploadCalls: 1 };
      }
    }
    if (!deps.fetchStatus || !cloudDocId) return { outcome: 'INDEXING', cloudDocId, failureCode: null, uploadCalls };
    const polls = Math.max(0, Math.min(deps.maxStatusPolls ?? 6, 20));
    const pause = Math.max(0, Math.min(deps.waitBetweenPollsMs ?? 0, 30_000));
    const sleep = deps.sleep ?? ((ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms)));
    for (let attempt = 0; attempt < polls; attempt += 1) {
      let state: 'processing' | 'completed' | 'failed' | 'unknown';
      try {
        state = await deps.fetchStatus(cloudDocId);
      } catch {
        state = 'unknown';
      }
      if (state === 'completed') {
        upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId, cloudFileName: pdf.fileName,
          pageCount: pages, uploadedAt: uploaded?.uploadedAt ?? at(), status: 'READY', failureCode: null, updatedAt: at() });
        return { outcome: 'READY', cloudDocId, failureCode: null, uploadCalls };
      }
      if (state === 'failed') {
        upsert(deps.db, { sourceSha256: pdf.sha256, cloudDocId, cloudFileName: pdf.fileName,
          pageCount: pages, uploadedAt: uploaded?.uploadedAt ?? at(), status: 'FAILED', failureCode: 'PAGEINDEX_INDEX_FAILED', updatedAt: at() });
        return { outcome: 'FAILED', cloudDocId, failureCode: 'PAGEINDEX_INDEX_FAILED', uploadCalls };
      }
      if (pause > 0 && attempt + 1 < polls) await sleep(pause);
    }
    return { outcome: 'INDEXING', cloudDocId, failureCode: null, uploadCalls };
  } catch {
    return { outcome: 'FAILED', cloudDocId: null, failureCode: 'PAGEINDEX_STORE_UNAVAILABLE', uploadCalls };
  }
}

export interface RefreshPageIndexStatusDeps {
  readonly fetchStatus: (cloudDocId: string) => Promise<'processing' | 'completed' | 'failed' | 'unknown'>;
  readonly now?: () => Date;
  /** Upper bound on status polls. Defaults to 3. */
  readonly maxPolls?: number;
}

/**
 * Re-reads one INDEXING row's vendor status and settles terminal states.
 * Bounded and never throws: any failure leaves the row untouched and returns
 * the current row (or null when unreadable).
 */
export async function refreshPageIndexStatus(
  db: Database.Database,
  sourceSha256: string,
  deps: RefreshPageIndexStatusDeps,
): Promise<PageIndexDocumentRow | null> {
  try {
    assertSha256(sourceSha256);
    const current = readPageIndexDocument(db, sourceSha256);
    if (!current || current.status !== 'INDEXING' || !current.cloudDocId) return current;
    const at = (): string => (deps.now ?? (() => new Date()))().toISOString();
    const polls = Math.max(1, Math.min(deps.maxPolls ?? 3, 20));
    for (let attempt = 0; attempt < polls; attempt += 1) {
      let state: 'processing' | 'completed' | 'failed' | 'unknown';
      try {
        state = await deps.fetchStatus(current.cloudDocId);
      } catch {
        state = 'unknown';
      }
      if (state === 'completed') {
        upsert(db, { sourceSha256, cloudDocId: current.cloudDocId, cloudFileName: current.cloudFileName,
          pageCount: current.pageCount, uploadedAt: current.uploadedAt, status: 'READY', failureCode: null, updatedAt: at() });
        return readPageIndexDocument(db, sourceSha256);
      }
      if (state === 'failed') {
        upsert(db, { sourceSha256, cloudDocId: current.cloudDocId, cloudFileName: current.cloudFileName,
          pageCount: current.pageCount, uploadedAt: current.uploadedAt, status: 'FAILED',
          failureCode: 'PAGEINDEX_INDEX_FAILED', updatedAt: at() });
        return readPageIndexDocument(db, sourceSha256);
      }
      if (state !== 'processing' && state !== 'unknown') return current;
    }
    return readPageIndexDocument(db, sourceSha256);
  } catch {
    return null;
  }
}

export interface PageIndexInventoryFile {
  readonly path: string;
  readonly sha256: string;
  readonly mediaType: string;
}

/**
 * Selects a run's PDFs from prepared inventory files: vendor PDFs by media
 * type, or future PDF members by extension. Pure, so the run page and the
 * service share one definition of "a PDF the run uses".
 */
export function selectRunPdfFiles(files: readonly PageIndexInventoryFile[]): readonly PageIndexPdfRef[] {
  const selected: PageIndexPdfRef[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    if (!file || typeof file.path !== 'string' || typeof file.sha256 !== 'string' || typeof file.mediaType !== 'string') continue;
    if (file.mediaType !== 'application/pdf' && !file.path.toLowerCase().endsWith('.pdf')) continue;
    if (!SHA256.test(file.sha256) || seen.has(file.sha256)) continue;
    seen.add(file.sha256);
    selected.push({ sha256: file.sha256, fileName: file.path });
  }
  return selected;
}

/**
 * Shared source-ingest hook: runs `ensureIndexed` once for every PDF a run
 * uses — attached sources, uploaded inputs and PDFs fetched during research
 * all funnel through this one function. Never throws; per-file outcomes are
 * returned for run-page states.
 */
export async function indexRunPdfsForPageIndex(
  files: Iterable<PageIndexPdfFile>,
  deps: EnsureIndexedDeps,
): Promise<readonly EnsureIndexedResult[]> {
  const outcomes: EnsureIndexedResult[] = [];
  try {
    for (const file of files) outcomes.push(await ensureIndexed(file, deps));
  } catch {
    // ensureIndexed never throws; this guards only against a bad iterable.
  }
  return outcomes;
}
