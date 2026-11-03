import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations, readMigrations } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { PublicCollectedPages, PublicReviewEnvelope } from '../../src/platform/collectors/shopee-public-reviews.js';
import { s07Hash } from './raw-db-v1-s07.js';

export const FIELD_FIX_MIGRATION = '0071_raw_db_v1_field_fixes.sql';
export const AT = '2026-11-03T01:00:00Z';

export async function temporaryDirectory(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-raw-field-fixes-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

/** A populated upgrade starts with the actual, unchanged migrations preceding 0071. */
export async function beforeFieldFixes(t: TestContext) {
  const migrations = readMigrations();
  assert.ok(migrations.some(m => m.name === FIELD_FIX_MIGRATION), 'migration 0071 must be available');
  const directory = await temporaryDirectory(t);
  for (const m of migrations.filter(m => m.version < 71)) await fs.writeFile(path.join(directory, m.name), m.sql);
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applyMigrations(db, { migrationsDirectory: directory });
  t.after(() => db.close());
  return db;
}

export function databaseRows(db: Database.Database, omit: readonly string[] = []) {
  const tables = db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    .all() as { name: string }[];
  return Object.fromEntries(tables.filter(({ name }) => !omit.includes(name)).map(({ name }) =>
    [name, db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}" ORDER BY rowid`).all()]));
}

/** Explicit historical fixtures only: emulate the pre-0071 absence of name provenance or a name conflict. */
export function historicalNameState(db: Database.Database, mismatch = false) {
  const triggers = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name IN ('product_name_source','product')")
    .all() as { name: string; sql: string }[];
  db.transaction(() => {
    for (const { name } of triggers) db.exec(`DROP TRIGGER "${name.replaceAll('"', '""')}"`);
    db.exec('DELETE FROM product_name_source');
    if (mismatch) db.exec("UPDATE product SET product_name='Synthetic conflicting historical name'");
    for (const { sql } of triggers) db.exec(sql);
  })();
}

/** Recompute every retained byte binding after editing synthetic provider rows. */
export function editPublicRows(collected: PublicCollectedPages, edit: (row: PublicReviewEnvelope['rows'][number], index: number) => void): PublicCollectedPages {
  let index = 0, offset = 0;
  const envelopes = structuredClone(collected.envelopes!);
  for (const envelope of envelopes) for (const row of envelope.rows) edit(row, index++);
  return { ...collected, envelopes,
    pages: envelopes.map(e => {
      const page = { bytes: Buffer.from(canonicalJson(e.rows)), offset };
      offset += e.rows.length;
      return page;
    }),
    listings: collected.listings.map((listing, i) => {
      const bytes = Buffer.from(canonicalJson(envelopes[i]!));
      return { ...listing, resultSha256: s07Hash(bytes), resultByteSize: bytes.length };
    }),
  };
}

/** Synthetic historical captures cover each distinct representation, not real provider bytes. */
export const BASIS_ROWS = [
  ['s05', 'S05', 'shopee-public-review', 'shopee.public_reviews.listing', 'artifact:synthetic#listing=0', 'RETAINED_ENVELOPE'],
  ['s07-run', 'S07', 'apify', 'datadoping/tiktok-comment-reply-scraper', 'artifact:synthetic', 'RETAINED_ENVELOPE'],
  ['s07-file', 'S07', 'apify', 'apify.tiktok.comments', 'file:synthetic.json#1', 'SUPPLIED_FILE'],
  ['suggest-run', 'S19b', 'google-suggest', 'google.suggest', 'artifact:synthetic', 'ORIGINAL_BYTES'],
  ['suggest-file', 'S19b', 'google-suggest', 'google.suggest', 'file:synthetic.json#0', 'CANONICAL_JSON'],
  ['overview-run', 'S29', 'serpapi', 'serpapi.google.search', 'artifact:synthetic', 'ORIGINAL_BYTES'],
  ['overview-followup', 'S29', 'serpapi', 'serpapi.google_ai_overview', 'artifact:synthetic', 'ORIGINAL_BYTES'],
  ['overview-file', 'S29', 'serpapi', 'serpapi.google.search', 'file:synthetic.json#0', 'CANONICAL_JSON'],
  ['s02b-run', 'S02b', 'kalodata', 'kalodata.video.rank', 'artifact:synthetic', 'ORIGINAL_BYTES'],
  ['s02b-file', 'S02b', 'kalodata', 'kalodata.video.rank', 'file:synthetic.json#0', 'SUPPLIED_FILE'],
  ['s14-run', 'S14', 'gemini', 'videowatch.generate', 'artifact:synthetic', 'ORIGINAL_BYTES'],
  ['s14-file', 'S14', 'gemini', 'videowatch.generate', 'file:synthetic.json#1', 'SUPPLIED_FILE'],
] as const;
