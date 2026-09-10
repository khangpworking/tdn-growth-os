import path from 'node:path';
import type Database from 'better-sqlite3';

const tails = new Map<string, Promise<void>>();

/** Serializes application-owned async mutation workflows targeting one SQLite file. */
export async function withDatabaseMutationMutex<T>(db: Database.Database, operation: () => Promise<T>): Promise<T> {
  const key = path.resolve(db.name);
  const previous = tails.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const tail = previous.then(() => current);
  tails.set(key, tail);
  await previous;
  try {
    return await operation();
  } finally {
    release();
    if (tails.get(key) === tail) tails.delete(key);
  }
}
