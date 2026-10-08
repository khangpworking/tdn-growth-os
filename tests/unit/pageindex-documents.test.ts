import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/index.js';
import {
  ensureIndexed,
  indexRunPdfsForPageIndex,
  isPageIndexUsageLimited,
  listPageIndexDocuments,
  readPageIndexDocument,
  refreshPageIndexStatus,
  selectRunPdfFiles,
  setPageIndexUsageLimited,
  PageIndexDocumentError,
  type EnsureIndexedDeps,
} from '../../src/modules/analysis/pageindex-documents.js';

const roots: string[] = [];
test.afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function migratedDb(): { db: BetterSqlite3.Database; close: () => void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-pageindex-docs-'));
  roots.push(root);
  const opened = openDatabase({ databasePath: path.join(root, 'test.sqlite') });
  return { db: opened.db, close: () => opened.db.close() };
}

function pdfBytes(pages = 1): Buffer {
  const text = 'BT /F1 12 Tf 20 100 Td (Calcium 120 mg) Tj ET';
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];
  void pages;
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const start = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`;
  return Buffer.from(pdf);
}

const shaOf = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const fixedNow = () => new Date('2026-10-07T00:00:00.000Z');

function deps(db: BetterSqlite3.Database, overrides: Partial<EnsureIndexedDeps> = {}): EnsureIndexedDeps {
  return {
    db, now: fixedNow, enabled: true,
    // Gates are omitted by default so the ledger flag row governs, as in production.
    countPages: () => 1,
    upload: async () => ({ cloudDocId: 'pi-doc-1', pageCount: 1 }),
    fetchStatus: async () => 'completed',
    sleep: async () => undefined,
    ...overrides,
  };
}

test('upload happens once per sha across runs and reaches READY through the bounded wait', async () => {
  const { db, close } = migratedDb();
  try {
    const bytes = pdfBytes();
    let uploads = 0;
    const transport = deps(db, { upload: async () => { uploads += 1; return { cloudDocId: 'pi-doc-9', pageCount: 1 }; } });
    const first = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport);
    assert.equal(first.outcome, 'READY');
    assert.equal(first.cloudDocId, 'pi-doc-9');
    assert.equal(first.uploadCalls, 1);
    assert.equal(uploads, 1);
    // A second run with the same PDF uploads nothing.
    const second = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport);
    assert.equal(second.outcome, 'READY');
    assert.equal(second.uploadCalls, 0);
    assert.equal(uploads, 1);
    const stored = readPageIndexDocument(db, shaOf(bytes));
    assert.equal(stored?.status, 'READY');
    assert.equal(listPageIndexDocuments(db).length, 1);
  } finally { close(); }
});

test('simultaneous callers reserve the SHA before dispatching one upload', async () => {
  const { db, close } = migratedDb();
  try {
    const bytes = pdfBytes(); let uploads = 0;
    const transport = deps(db, { upload: async () => { uploads += 1; await Promise.resolve(); return { cloudDocId: 'pi-reserved', pageCount: 1 }; } });
    const results = await Promise.all([ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport),
      ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport)]);
    assert.equal(uploads, 1);
    assert.equal(results.reduce((sum, result) => sum + result.uploadCalls, 0), 1);
    assert.equal((await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport)).outcome, 'READY');
  } finally { close(); }
});

test('a failed acknowledgement write retains the reservation and truthful call count', async () => {
  const { db, close } = migratedDb();
  try {
    const bytes = pdfBytes(); let uploads = 0;
    db.exec(`CREATE TRIGGER reject_upload_ack BEFORE UPDATE ON analysis_pageindex_documents
      WHEN NEW.cloud_doc_id IS NOT NULL BEGIN SELECT RAISE(ABORT, 'synthetic_ack_failure'); END;`);
    const transport = deps(db, { upload: async () => { uploads += 1; return { cloudDocId: 'pi-uncertain', pageCount: 1 }; } });
    const first = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport);
    assert.equal(first.uploadCalls, 1);
    db.exec('DROP TRIGGER reject_upload_ack');
    const second = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport);
    assert.equal(second.uploadCalls, 0);
    assert.equal(uploads, 1);
    assert.equal(second.outcome, 'INDEXING');
  } finally { close(); }
});

test('kill switch, low balance and usage limit make zero upload calls', async () => {
  const { db, close } = migratedDb();
  try {
    const bytes = pdfBytes();
    let uploads = 0;
    const counting = (overrides: Partial<EnsureIndexedDeps>): EnsureIndexedDeps =>
      deps(db, { ...overrides, upload: async () => { uploads += 1; return { cloudDocId: 'pi-x', pageCount: 1 }; } });
    assert.equal((await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, counting({ enabled: false }))).outcome, 'SKIPPED_DISABLED');
    assert.equal(readPageIndexDocument(db, shaOf(bytes)), null, 'a disabled run writes nothing');
    assert.equal((await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, counting({ lowBalance: true }))).outcome, 'SKIPPED_LOW_BALANCE');
    assert.equal((await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, counting({ usageLimited: true }))).outcome, 'SKIPPED_USAGE_LIMIT');
    assert.equal(readPageIndexDocument(db, shaOf(bytes))?.status, 'SKIPPED_USAGE_LIMIT');
    assert.equal((await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes },
      counting({ lowBalance: () => { throw new Error('gate exploded'); } }))).outcome, 'SKIPPED_LOW_BALANCE');
    assert.equal(uploads, 0);
    assert.equal(readPageIndexDocument(db, shaOf(bytes))?.status, 'SKIPPED_LOW_BALANCE');
  } finally { close(); }
});

test('usage-limit failure during upload sets the flag row and blocks later uploads', async () => {
  const { db, close } = migratedDb();
  try {
    assert.equal(isPageIndexUsageLimited(db), false);
    const bytes = pdfBytes();
    let uploads = 0;
    const limited = deps(db, {
      upload: async () => { uploads += 1; throw new Error('PAGEINDEX_USAGE_LIMIT_REACHED'); },
    });
    const first = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, limited);
    assert.equal(first.outcome, 'SKIPPED_USAGE_LIMIT');
    assert.equal(first.failureCode, 'PAGEINDEX_USAGE_LIMIT_REACHED');
    assert.equal(isPageIndexUsageLimited(db), true);
    const other = pdfBytes();
    const second = await ensureIndexed({ sha256: shaOf(other), fileName: 'b.pdf', bytes: other }, limited);
    assert.equal(second.outcome, 'SKIPPED_USAGE_LIMIT');
    assert.equal(second.uploadCalls, 0);
    assert.equal(uploads, 1);
    setPageIndexUsageLimited(db, false, fixedNow);
    assert.equal(isPageIndexUsageLimited(db), false);
  } finally { close(); }
});

test('non-PDF bytes and out-of-range page counts fail without any upload call', async () => {
  const { db, close } = migratedDb();
  try {
    let uploads = 0;
    const transport = deps(db, { upload: async () => { uploads += 1; return { cloudDocId: 'pi-x', pageCount: 1 }; } });
    const notPdf = Buffer.from('not a pdf at all');
    const rejected = await ensureIndexed({ sha256: shaOf(notPdf), fileName: 'a.pdf', bytes: notPdf }, transport);
    assert.equal(rejected.outcome, 'FAILED');
    assert.equal(rejected.failureCode, 'PAGEINDEX_LOCAL_PDF_INVALID');
    const bytes = pdfBytes();
    const tooMany = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'big.pdf', bytes }, deps(db, {
      ...transport, countPages: () => 1001, upload: async () => { uploads += 1; return { cloudDocId: 'pi-x', pageCount: 1001 }; },
    }));
    assert.equal(tooMany.outcome, 'FAILED');
    assert.equal(tooMany.failureCode, 'PAGEINDEX_PAGE_COUNT_OUT_OF_RANGE');
    assert.equal(uploads, 0);
  } finally { close(); }
});

test('exhausted polls stay INDEXING and a failed remote settles FAILED; refresh settles later', async () => {
  const { db, close } = migratedDb();
  try {
    const bytes = pdfBytes();
    const pending = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, deps(db, {
      fetchStatus: async () => 'processing', maxStatusPolls: 2,
    }));
    assert.equal(pending.outcome, 'INDEXING');
    assert.equal(pending.uploadCalls, 1);
    const settled = await refreshPageIndexStatus(db, shaOf(bytes), { fetchStatus: async () => 'completed', now: fixedNow });
    assert.equal(settled?.status, 'READY');
    const other = Buffer.from(pdfBytes().toString('utf8').replace('Calcium', 'Sắt'));
    await ensureIndexed({ sha256: shaOf(other), fileName: 'b.pdf', bytes: other }, deps(db, { fetchStatus: async () => 'failed' }));
    assert.equal(readPageIndexDocument(db, shaOf(other))?.status, 'FAILED');
  } finally { close(); }
});

test('failed rows never re-upload and nothing ever throws to the run', async () => {
  const { db, close } = migratedDb();
  try {
    const bytes = pdfBytes();
    let uploads = 0;
    const transport = deps(db, { upload: async () => { uploads += 1; throw new Error('boom'); } });
    const first = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport);
    assert.equal(first.outcome, 'FAILED');
    const second = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, transport);
    assert.equal(second.outcome, 'FAILED');
    assert.equal(uploads, 1);
    // A database without the ledger fails closed instead of throwing.
    const bare = new BetterSqlite3(':memory:');
    try {
      const outcome = await ensureIndexed({ sha256: shaOf(bytes), fileName: 'a.pdf', bytes }, deps(bare));
      assert.equal(outcome.outcome, 'FAILED');
      assert.equal(outcome.uploadCalls, 0);
    } finally { bare.close(); }
  } finally { close(); }
});

test('run PDF selection takes vendor PDFs and pdf members, deduped by sha', () => {
  const sha = 'c'.repeat(64);
  assert.deepEqual(selectRunPdfFiles([
    { path: 'doc.pdf', sha256: sha, mediaType: 'application/pdf' },
    { path: 'doc.pdf', sha256: sha, mediaType: 'application/pdf' },
    { path: 'notes.pdf', sha256: 'd'.repeat(64), mediaType: 'text/markdown' },
    { path: 'quotes.json', sha256: 'e'.repeat(64), mediaType: 'application/json' },
    { path: 'bad.pdf', sha256: 'not-a-sha', mediaType: 'application/pdf' },
  ]), [
    { sha256: sha, fileName: 'doc.pdf' },
    { sha256: 'd'.repeat(64), fileName: 'notes.pdf' },
  ]);
  assert.deepEqual(selectRunPdfFiles([]), []);
});

test('shared hook indexes every PDF once and deletes stay blocked', async () => {
  const { db, close } = migratedDb();
  try {
    const first = pdfBytes();
    const second = Buffer.from(pdfBytes().toString('utf8').replace('Calcium', 'Kẽm'));
    let uploads = 0;
    const transport = deps(db, { upload: async () => { uploads += 1; return { cloudDocId: `pi-${uploads}`, pageCount: 1 }; } });
    const outcomes = await indexRunPdfsForPageIndex([
      { sha256: shaOf(first), fileName: 'one.pdf', bytes: first },
      { sha256: shaOf(first), fileName: 'one.pdf', bytes: first },
      { sha256: shaOf(second), fileName: 'two.pdf', bytes: second },
    ], transport);
    assert.deepEqual(outcomes.map(outcome => outcome.outcome), ['READY', 'READY', 'READY']);
    assert.equal(uploads, 2);
    assert.throws(() => db.prepare(`DELETE FROM analysis_pageindex_documents WHERE source_sha256 = ?`).run(shaOf(first)), /immutable_pageindex_document/);
    assert.throws(() => db.prepare(`DELETE FROM analysis_pageindex_flags WHERE flag_key = 'usage_limit_reached'`).run(), /immutable_pageindex_flag/);
    assert.throws(() => readPageIndexDocument(db, 'not-a-sha'), error => error instanceof PageIndexDocumentError && error.code === 'INVALID_SHA256');
  } finally { close(); }
});
