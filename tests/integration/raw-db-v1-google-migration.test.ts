import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';

// L1 owns the storage contract; loader tests own the mapping into that contract.
test('RAWDB-G L1: migration 0064 exposes three STRICT db-v1 tables, flat block types and immutable rows', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  const columns = {
    search_suggestion: 'prefix:TEXT rank:INTEGER suggestion:TEXT collected_at:TEXT capture_id:TEXT',
    ai_overview_block: 'query:TEXT block_seq:INTEGER block_type:TEXT text:TEXT reference_indexes:TEXT capture_id:TEXT',
    ai_overview_reference: 'query:TEXT ref_index:INTEGER title:TEXT link:TEXT site:TEXT capture_id:TEXT snippet:TEXT',
  };
  const keys: Record<string, string[]> = {
    search_suggestion: ['capture_id', 'prefix', 'rank'], ai_overview_block: ['capture_id', 'block_seq'], ai_overview_reference: ['capture_id', 'ref_index'],
  };
  const required: Record<string, string[]> = {
    search_suggestion: ['prefix', 'rank', 'suggestion', 'collected_at', 'capture_id'],
    ai_overview_block: ['query', 'block_seq', 'capture_id'], ai_overview_reference: ['query', 'ref_index', 'capture_id'],
  };
  for (const [table, expected] of Object.entries(columns)) {
    const info = db.pragma(`table_info(${table})`) as { name: string; type: string; notnull: number; pk: number }[];
    assert.deepEqual(info.map(c => `${c.name}:${c.type}`).sort(), expected.split(' ').sort(), table);
    assert.deepEqual(info.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name), keys[table], `${table} primary key`);
    assert.deepEqual(info.filter(c => c.notnull).map(c => c.name).sort(), required[table]!.slice().sort(), `${table} required columns`);
    const foreignKeys = db.pragma(`foreign_key_list(${table})`) as { table: string; from: string; to: string }[];
    assert.deepEqual(foreignKeys.map(c => [c.table, c.from, c.to]), [['raw_capture', 'capture_id', 'capture_id']], `${table} capture link`);
    assert.equal((db.prepare('SELECT strict FROM pragma_table_list WHERE name=?').get(table) as { strict: number }).strict, 1, table);
  }
  db.exec(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('synthetic-google','S29','serpapi','serpapi.google.search','2026-11-03T08:00:00+07:00','OK');
    INSERT INTO search_suggestion VALUES ('synthetic jar',1,'synthetic jar uses','2026-11-03T08:00:00+07:00','synthetic-google');
    INSERT INTO ai_overview_reference(query,ref_index,title,snippet,capture_id)
      VALUES ('synthetic jar',7,'Synthetic reference','Retained snippet','synthetic-google');`);
  const insert = db.prepare(`INSERT INTO ai_overview_block(query,block_seq,block_type,text,capture_id) VALUES ('synthetic jar',?,?,?,'synthetic-google')`);
  for (const [i, type] of ['heading', 'paragraph', 'list_item'].entries()) insert.run(i, type, `Synthetic ${type}`);
  assert.throws(() => insert.run(3, 'list', 'Unflattened'), { code: 'SQLITE_CONSTRAINT_CHECK' });
  for (const [table, column] of [['search_suggestion', 'suggestion'], ['ai_overview_block', 'text'], ['ai_overview_reference', 'snippet']]) {
    const before = db.prepare(`SELECT * FROM ${table}`).all();
    for (const statement of [`UPDATE ${table} SET ${column}='changed'`, `DELETE FROM ${table}`]) {
      assert.throws(() => db.exec(statement), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
      assert.deepEqual(db.prepare(`SELECT * FROM ${table}`).all(), before);
    }
  }
});
