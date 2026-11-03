import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';

export const CODES_VERSION = 'synthetic-codes-v1';
export const CODES_AT = '2026-11-03T02:00:00.000Z';
export const CODES_COMMENT = '  Mẫu thử 🧪 vị dịu.\r\nCafe\u0301  ';
export const CODES_ATTRIBUTES = ['Vị: ngọt 🍊', 'Hộp thử 2 viên'];
// Literal input, independent of the production text reconstruction.
export const CODES_TEXT = '  Mẫu thử 🧪 vị dịu.\r\nCafe\u0301    Vị: ngọt 🍊  Hộp thử 2 viên';
export const codesHash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');

export function codesReview(overrides = {}) {
  return { review_id: 'shopee:synthetic-codes-a', platform: 'shopee', source_review_id: 'synthetic-codes-a',
    rating: 3, text: CODES_TEXT, ...overrides };
}

export function codesLabel(overrides = {}) {
  return { review_id: 'shopee:synthetic-codes-a', theme_code: 'T-GIA', codebook_version: CODES_VERSION,
    block_key: 'thuc_pham' as string | null, block_norm: 'thuc_pham', p_yes: 0.91, polarity: 'khen', status: 'kept',
    step: 'Sau mua', text_start: 0, text_end: [...CODES_TEXT].length, text_sha256: codesHash(CODES_TEXT), ...overrides };
}

export function codesState(overrides = {}) {
  return { review_id: 'shopee:synthetic-codes-a', codebook_version: CODES_VERSION,
    block_key: 'thuc_pham' as string | null, block_norm: 'thuc_pham', input_sha256: codesHash(CODES_TEXT), status: 'done', ...overrides };
}

export function codesTarget(overrides = {}) {
  return { codebook_version: CODES_VERSION, block_key: 'thuc_pham' as string | null,
    block_norm: 'thuc_pham', started_at: CODES_AT, ...overrides };
}

type Inputs = {
  reviews?: readonly ReturnType<typeof codesReview>[];
  labels?: readonly ReturnType<typeof codesLabel>[];
  states?: readonly ReturnType<typeof codesState>[];
  targets?: readonly ReturnType<typeof codesTarget>[];
  codebookText?: string;
};

/** Only the five MCP tables pinned in COMMON-X §2; never opens a real run warehouse. */
export async function writeCodeInputs(root: string, input: Inputs = {}) {
  const mcpRunFile = path.join(root, 'synthetic-mcp-run.sqlite');
  const codebookFile = path.join(root, 'synthetic-codebook.json');
  const codebookText = input.codebookText ?? await fs.readFile(new URL('./raw-db-v1-codes.synthetic.json', import.meta.url), 'utf8');
  await fs.writeFile(codebookFile, codebookText);
  const warehouse = new Database(mcpRunFile);
  try {
    warehouse.exec(`
      CREATE TABLE review(review_id TEXT, platform TEXT, source_review_id TEXT, rating INTEGER);
      CREATE TABLE review_text(review_id TEXT, text TEXT);
      CREATE TABLE label(review_id TEXT, theme_code TEXT, codebook_version TEXT, block_key TEXT, block_norm TEXT,
        p_yes REAL, polarity TEXT, status TEXT, step TEXT, text_start INTEGER, text_end INTEGER, text_sha256 TEXT);
      CREATE TABLE coding_state(review_id TEXT, codebook_version TEXT, block_key TEXT, block_norm TEXT, input_sha256 TEXT, status TEXT);
      CREATE TABLE coding_target(codebook_version TEXT, block_key TEXT, block_norm TEXT, started_at TEXT);
    `);
    for (const review of input.reviews ?? [codesReview()]) {
      warehouse.prepare('INSERT INTO review VALUES (@review_id,@platform,@source_review_id,@rating)').run(review);
      warehouse.prepare('INSERT INTO review_text VALUES (@review_id,@text)').run(review);
    }
    for (const label of input.labels ?? [codesLabel()]) warehouse.prepare(`INSERT INTO label VALUES
      (@review_id,@theme_code,@codebook_version,@block_key,@block_norm,@p_yes,@polarity,@status,@step,@text_start,@text_end,@text_sha256)`).run(label);
    for (const state of input.states ?? [codesState()]) warehouse.prepare(`INSERT INTO coding_state VALUES
      (@review_id,@codebook_version,@block_key,@block_norm,@input_sha256,@status)`).run(state);
    for (const target of input.targets ?? [codesTarget()]) warehouse.prepare(`INSERT INTO coding_target VALUES
      (@codebook_version,@block_key,@block_norm,@started_at)`).run(target);
  } finally { warehouse.close(); }
  const loaderInput = { mcpRunFile, codebookFile, coder: 'synthetic-coder' };
  return { ...loaderInput, input: loaderInput, codebookText };
}

/** A synthetic db-v1 precondition; the import has no dependency on acquisition or analysis. */
export function seedCodeReview(db: Database.Database, overrides: Record<string, string | number | null> = {}) {
  db.exec(`INSERT OR IGNORE INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('synthetic-codes-capture','S05','synthetic','synthetic.review','2026-11-03T00:00:00Z','OK');
    INSERT OR IGNORE INTO product(product_key,platform,item_id,product_name,first_capture_id)
    VALUES ('shopee:synthetic-codes-product','shopee','synthetic-codes-product','Synthetic product','synthetic-codes-capture');`);
  const row = { review_key: 'S05:synthetic-codes-a', source_code: 'S05', platform: 'shopee', kind: 'product_review',
    external_id: 'synthetic-codes-a', product_key: 'shopee:synthetic-codes-product', rating_star: 3,
    text: CODES_COMMENT, attributes_json: JSON.stringify(CODES_ATTRIBUTES), reviewer_name_state: 'not_provided',
    collected_at: '2026-11-03T00:00:00Z', capture_id: 'synthetic-codes-capture', source_position: 'synthetic=0', ...overrides };
  db.prepare(`INSERT INTO review(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
}

export async function codesFixture(t: TestContext, input: Inputs = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-raw-codes-'));
  const databasePath = path.join(root, 'test.sqlite');
  const db = new Database(databasePath);
  t.after(async () => { if (db.open) db.close(); await fs.rm(root, { recursive: true, force: true }); });
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  seedCodeReview(db);
  return { root, databasePath, db, ...await writeCodeInputs(root, input) };
}

export const emptyCodesReceipt = {
  codebookInserted: 0, labelsInserted: 0, noThemeInserted: 0, alreadyPresent: 0,
  reviewsMissing: 0, textMismatch: 0, skipped: [],
};
