import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type Database from 'better-sqlite3';

export interface Migration {
  readonly version: number;
  readonly name: string;
  readonly checksumSha256: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly applied: readonly number[];
  readonly currentVersion: number;
}

export const defaultMigrationsDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../migrations',
);

export function readMigrations(directory = defaultMigrationsDirectory): readonly Migration[] {
  const names = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  if (names.length === 0) throw new Error(`No migrations found in ${directory}`);

  return names.map((name, index) => {
    const match = /^(\d{4})_[a-z0-9_]+\.sql$/.exec(name);
    if (!match) throw new Error(`Invalid migration filename: ${name}`);
    const version = Number(match[1]);
    if (version !== index + 1) throw new Error(`Migration sequence must be contiguous at ${name}`);
    const sql = fs.readFileSync(path.join(directory, name), 'utf8');
    return {
      version,
      name,
      sql,
      checksumSha256: createHash('sha256').update(sql, 'utf8').digest('hex'),
    };
  });
}

function hasMigrationLedger(db: Database.Database): boolean {
  return Boolean(
    db.prepare("SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'schema_migrations'").get(),
  );
}

function assertEmptyWithoutLedger(db: Database.Database): void {
  const objects = db
    .prepare("SELECT name FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%' AND type IN ('table', 'view', 'trigger', 'index')")
    .all() as Array<{ name: string }>;
  if (objects.length > 0) throw new Error('Refusing to migrate a non-empty database without schema_migrations');
}

export function applyMigrations(
  db: Database.Database,
  options: { readonly migrationsDirectory?: string; readonly now?: () => Date } = {},
): MigrationResult {
  const migrations = readMigrations(options.migrationsDirectory);
  const now = options.now ?? (() => new Date());

  if (!hasMigrationLedger(db)) assertEmptyWithoutLedger(db);

  const appliedRows = hasMigrationLedger(db)
    ? (db.prepare('SELECT version, name, checksum_sha256 AS checksumSha256 FROM schema_migrations ORDER BY version').all() as Array<{
        version: number;
        name: string;
        checksumSha256: string;
      }>)
    : [];

  for (const [index, row] of appliedRows.entries()) {
    const expected = migrations[index];
    if (!expected || row.version !== expected.version || row.name !== expected.name || row.checksumSha256 !== expected.checksumSha256) {
      throw new Error(`Migration ledger mismatch at version ${row.version}`);
    }
  }
  if (appliedRows.length > migrations.length) throw new Error('Database schema is newer than available migrations');

  const userVersion = Number(db.pragma('user_version', { simple: true }));
  if (userVersion !== appliedRows.length) {
    throw new Error(`PRAGMA user_version ${userVersion} does not match migration ledger ${appliedRows.length}`);
  }

  const applied: number[] = [];
  for (const migration of migrations.slice(appliedRows.length)) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration.sql);
      db.prepare(
        'INSERT INTO schema_migrations(version, name, checksum_sha256, applied_at) VALUES (?, ?, ?, ?)',
      ).run(migration.version, migration.name, migration.checksumSha256, now().toISOString());
      db.pragma(`user_version = ${migration.version}`);
      db.exec('COMMIT');
      applied.push(migration.version);
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // Preserve the original migration error.
      }
      throw error;
    }
  }

  return { applied, currentVersion: migrations.length };
}
