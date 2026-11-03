import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import type Database from 'better-sqlite3';

/** The lock file next to the app DB. Never deleted: unlinking it would let another process lock a new file. */
export const LABELS_LOCK_FILE = 'raw-db-labels.lock.sqlite';
/** How long a second labelling or CODES pass waits for the lock before LABELS_BUSY. */
export const LABELS_LOCK_WAIT_MS = 10_000;

export class LabelsBusyError extends Error {
  readonly code = 'LABELS_BUSY';
  constructor(lockPath: string) { super(`LABELS_BUSY: another labelling or CODES pass holds ${lockPath}`); }
}

/**
 * Takes the one-pass-at-a-time lock of the app DB's labelling and CODES writers (owner F376): a separate SQLite file
 * `<db dir>/raw-db-labels.lock.sqlite` held in `BEGIN EXCLUSIVE`. SQLite takes OS advisory locks, so a crashed holder
 * releases it. Waits up to LABELS_LOCK_WAIT_MS, then throws LabelsBusyError. Returns the release function.
 * An in-memory app DB has no file another process could share, so it needs no lock.
 */
export function acquireLabelsLock(db: Database.Database): () => void {
  if (db.memory || !db.name) return () => {};
  const lockPath = path.join(path.dirname(path.resolve(db.name)), LABELS_LOCK_FILE);
  const lock = new BetterSqlite3(lockPath, { timeout: LABELS_LOCK_WAIT_MS });
  try {
    lock.exec('BEGIN EXCLUSIVE');
  } catch (error) {
    lock.close();
    if ((error as { code?: string }).code === 'SQLITE_BUSY') throw new LabelsBusyError(lockPath);
    throw error;
  }
  return () => {
    try { lock.exec('ROLLBACK'); } finally { lock.close(); }
  };
}
