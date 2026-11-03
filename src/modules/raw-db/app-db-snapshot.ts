import { randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';

export const APP_DB_SNAPSHOT_FILE = 'app-db.snapshot.sqlite';
export interface AppDbSnapshot { path: string; bytes: number; publishedAt: string }

/** The default snapshot folder: `<db dir>/app-db-snapshot/`. */
export function defaultSnapshotDir(dbPath: string): string { return path.join(path.dirname(path.resolve(dbPath)), 'app-db-snapshot'); }

/**
 * Publishes a clean copy of the live app DB for the Insight MCP (owner F376): an SQLite online backup into
 * `<dir>/.tmp-<pid>-<random>.sqlite`, set to journal_mode=DELETE and fsynced, then renamed atomically to
 * `<dir>/app-db.snapshot.sqlite` and the folder fsynced. Folder mode 0700, file 0600. On failure only this call's
 * temporary files are removed.
 */
export async function publishAppDbSnapshot(db: Database.Database, dir: string): Promise<AppDbSnapshot> {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  await fs.chmod(dir, 0o700);
  const tmp = path.join(dir, `.tmp-${process.pid}-${randomBytes(8).toString('hex')}.sqlite`);
  const target = path.join(dir, APP_DB_SNAPSHOT_FILE);
  try {
    // Created empty with mode 0600 first, so the copied rows are never readable by others.
    await fs.writeFile(tmp, '', { mode: 0o600, flag: 'wx' });
    await db.backup(tmp);
    const copy = new BetterSqlite3(tmp, { fileMustExist: true });
    try { copy.pragma('journal_mode = DELETE'); } finally { copy.close(); }
    const file = await fs.open(tmp, 'r+');
    try { await file.sync(); } finally { await file.close(); }
    const { size } = await fs.stat(tmp);
    await fs.rename(tmp, target);
    const folder = await fs.open(dir, 'r');
    try { await folder.sync(); } finally { await folder.close(); }
    return { path: target, bytes: size, publishedAt: new Date().toISOString() };
  } catch (error) {
    await Promise.all(['', '-journal', '-wal', '-shm'].map(suffix => fs.rm(tmp + suffix, { force: true })));
    throw error;
  }
}

const publishing = new Map<string, number>();

/** publishAppDbSnapshot that never throws: a failure is returned as `{ error }`. Counts as a publish in progress. */
export async function tryPublishAppDbSnapshot(db: Database.Database, dir: string): Promise<AppDbSnapshot | { error: string }> {
  const key = path.resolve(dir);
  publishing.set(key, (publishing.get(key) ?? 0) + 1);
  try { return await publishAppDbSnapshot(db, dir); }
  catch (error) { return { error: error instanceof Error ? error.message : String(error) }; }
  finally {
    const left = publishing.get(key)! - 1;
    if (left) publishing.set(key, left); else publishing.delete(key);
  }
}

/** The running app publishes the snapshot every 10 minutes (owner F368). */
export const APP_DB_SNAPSHOT_INTERVAL_MS = 10 * 60_000;

/**
 * Publishes the app DB snapshot every `intervalMs` on a short-lived read-only connection. A tick is skipped while
 * another publish of the same folder is running; a tick never throws. Returns the stop function.
 */
export function startAppDbSnapshotTimer(dbPath: string, intervalMs = APP_DB_SNAPSHOT_INTERVAL_MS): () => void {
  const dir = defaultSnapshotDir(dbPath);
  const timer = setInterval(() => {
    if (publishing.has(path.resolve(dir))) return;
    let db: BetterSqlite3.Database | undefined;
    try { db = new BetterSqlite3(dbPath, { readonly: true, fileMustExist: true }); }
    catch { return; }
    const open = db;
    void tryPublishAppDbSnapshot(open, dir).finally(() => { try { open.close(); } catch { /* nothing left to do */ } });
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}
