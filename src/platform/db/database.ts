import fs from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { applyMigrations, type MigrationResult } from './migrations.js';

export interface OpenDatabaseOptions {
  readonly databasePath: string;
  readonly migrationsDirectory?: string;
  readonly busyTimeoutMs?: number;
  readonly now?: () => Date;
}

export interface OpenDatabaseResult {
  readonly db: BetterSqlite3.Database;
  readonly migration: MigrationResult;
}

export function openDatabase(options: OpenDatabaseOptions): OpenDatabaseResult {
  const databasePath = path.resolve(options.databasePath);
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
  if (process.platform !== 'win32') {
    fs.closeSync(fs.openSync(databasePath, 'a', 0o600));
    fs.chmodSync(databasePath, 0o600);
  }
  const db = new BetterSqlite3(databasePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
    db.pragma('synchronous = FULL');
    const migration = applyMigrations(db, {
      ...(options.migrationsDirectory ? { migrationsDirectory: options.migrationsDirectory } : {}),
      ...(options.now ? { now: options.now } : {}),
    });
    db.defaultSafeIntegers(true);
    return { db, migration };
  } catch (error) {
    db.close();
    throw error;
  }
}
