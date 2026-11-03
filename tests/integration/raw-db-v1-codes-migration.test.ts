import assert from 'node:assert/strict';
import test from 'node:test';
import { CODES_AT, CODES_TEXT, CODES_VERSION, codesFixture, codesHash, seedCodeReview } from '../fixtures/raw-db-v1-codes.js';

test('RAWDB-X X1: migration 0068 enforces STRICT codes, append-only labels and the exact codebook approval transition', async t => {
  const f = await codesFixture(t), { db } = f;
  assert.equal(db.prepare('SELECT name FROM schema_migrations WHERE version=68').pluck().get(), '0068_raw_db_v1_review_code.sql');
  for (const name of ['codebook', 'review_code']) {
    assert.deepEqual(db.prepare('SELECT type,strict FROM pragma_table_list WHERE name=?').get(name), { type: 'table', strict: 1 });
  }
  type Value = string | number | null;
  const insert = (table: string, row: Record<string, Value>) => db.prepare(
    `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  const book = { codebook_version: CODES_VERSION, contract_version: 'insight-theme-codebook-v1', status: 'DRAFT',
    approved_by: null, approved_at: null, definition_json: f.codebookText, definition_sha256: codesHash(f.codebookText), loaded_at: CODES_AT };
  for (const patch of [
    { status: 'PUBLISHED' }, { approved_by: 'synthetic-owner' }, { approved_at: CODES_AT },
    { status: 'APPROVED', approved_by: null, approved_at: CODES_AT },
    { status: 'APPROVED', approved_by: 'synthetic-owner', approved_at: null },
  ]) assert.throws(() => insert('codebook', { ...book, ...patch }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => insert('codebook', { ...book, definition_json: Buffer.from('{}') } as unknown as Record<string, Value>),
    { code: 'SQLITE_CONSTRAINT_DATATYPE' });
  insert('codebook', book);
  const code = { review_key: 'S05:synthetic-codes-a', codebook_version: CODES_VERSION, theme_code: 'T-GIA',
    block_key: 'thuc_pham', polarity: 'khen', journey_step: 'Sau mua', status: 'kept', confidence: 0.91,
    coder: 'synthetic-coder', text_sha256: codesHash(CODES_TEXT), coded_at: CODES_AT,
    origin: 'MCP_IMPORT', import_sha256: 'a'.repeat(64) };
  for (const patch of [{ polarity: 'positive' }, { status: 'approved' }, { confidence: -0.001 }, { confidence: 1.001 }, { origin: 'AI' }]) {
    assert.throws(() => insert('review_code', { ...code, ...patch }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  }
  assert.throws(() => insert('review_code', { ...code, confidence: 'high' }), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
  for (const column of ['review_key', 'codebook_version']) {
    assert.throws(() => insert('review_code', { ...code, [column]: 'synthetic-missing' }), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  }
  insert('review_code', code);
  assert.throws(() => insert('review_code', code), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  for (const [theme_code, polarity, confidence, status] of [
    ['T-VI', 'che', 0, 'unclear'], ['T-KHAC', 'ke', 1, 'kept'], ['T-CHATLUONG', 'khong_ro_huong', null, 'kept'],
  ] as const) insert('review_code', { ...code, theme_code, polarity, confidence, status });
  insert('review_code', { ...code, theme_code: 'NO_THEME', block_key: null, polarity: null, journey_step: null, confidence: null });
  const codesBefore = db.prepare('SELECT * FROM review_code ORDER BY theme_code').all();
  for (const sql of ['UPDATE review_code SET coder=coder', "UPDATE review_code SET polarity='che'", 'DELETE FROM review_code']) {
    assert.throws(() => db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.deepEqual(db.prepare('SELECT * FROM review_code ORDER BY theme_code').all(), codesBefore);
  }

  const approval = "status='APPROVED',approved_by='synthetic-owner',approved_at='2026-11-03T03:00:00.000Z'";
  // Changing even one other field alongside an approval must abort.
  for (const [column, value] of Object.entries({ codebook_version: 'synthetic-v2', contract_version: 'changed',
    definition_json: '{}', definition_sha256: 'b'.repeat(64), loaded_at: '2026-11-03T04:00:00.000Z' })) {
    assert.throws(() => db.prepare(`UPDATE codebook SET ${approval},${column}=?`).run(value), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  }
  for (const sql of [
    'DELETE FROM codebook', 'UPDATE codebook SET status=status', "UPDATE codebook SET definition_json='{}'",
    "UPDATE codebook SET status='APPROVED',approved_by='synthetic-owner'",
    "UPDATE codebook SET status='APPROVED',approved_at='2026-11-03T03:00:00.000Z'",
  ]) assert.throws(() => db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  assert.deepEqual(db.prepare('SELECT * FROM codebook').get(), book);
  db.exec(`UPDATE codebook SET ${approval}`);
  const approved = { ...book, status: 'APPROVED', approved_by: 'synthetic-owner', approved_at: '2026-11-03T03:00:00.000Z' };
  assert.deepEqual(db.prepare('SELECT * FROM codebook').get(), approved);
  for (const sql of ['DELETE FROM codebook', 'UPDATE codebook SET status=status', `UPDATE codebook SET ${approval}`,
    "UPDATE codebook SET approved_by='another-owner'", "UPDATE codebook SET status='DRAFT',approved_by=NULL,approved_at=NULL"]) {
    assert.throws(() => db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.deepEqual(db.prepare('SELECT * FROM codebook').get(), approved);
  }
});

test('RAWDB-X X2: star sentiment view maps every star including 3 and preserves NULL and review identity', async t => {
  const { db } = await codesFixture(t);
  assert.equal(db.prepare("SELECT type FROM sqlite_schema WHERE name='review_star_sentiment'").pluck().get(), 'view');
  for (const star of [1, 2, 4, 5, null]) seedCodeReview(db, {
    review_key: `S05:synthetic-star-${star}`, external_id: `synthetic-star-${star}`, rating_star: star,
  });
  assert.deepEqual(db.prepare(`SELECT * FROM review_star_sentiment ORDER BY rating_star`).all(), [
    { review_key: 'S05:synthetic-star-null', source_code: 'S05', platform: 'shopee', product_key: 'shopee:synthetic-codes-product', rating_star: null, star_sentiment: null },
    { review_key: 'S05:synthetic-star-1', source_code: 'S05', platform: 'shopee', product_key: 'shopee:synthetic-codes-product', rating_star: 1, star_sentiment: 'tieu_cuc' },
    { review_key: 'S05:synthetic-star-2', source_code: 'S05', platform: 'shopee', product_key: 'shopee:synthetic-codes-product', rating_star: 2, star_sentiment: 'tieu_cuc' },
    { review_key: 'S05:synthetic-codes-a', source_code: 'S05', platform: 'shopee', product_key: 'shopee:synthetic-codes-product', rating_star: 3, star_sentiment: 'tieu_cuc' },
    { review_key: 'S05:synthetic-star-4', source_code: 'S05', platform: 'shopee', product_key: 'shopee:synthetic-codes-product', rating_star: 4, star_sentiment: 'tich_cuc' },
    { review_key: 'S05:synthetic-star-5', source_code: 'S05', platform: 'shopee', product_key: 'shopee:synthetic-codes-product', rating_star: 5, star_sentiment: 'tich_cuc' },
  ]);
});
