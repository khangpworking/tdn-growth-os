import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';

test('RAWDB-W W2: migration 0067 keeps STRICT, referenced, append-only readings and ordered segments', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  const contracts = {
    video_reading: {
      columns: { capture_id: 'TEXT', video_url: 'TEXT', origin: 'TEXT', duration_s: 'REAL', caption_source: 'TEXT',
        model_id: 'TEXT', media_sha256: 'TEXT', media_bytes: 'INTEGER', read_at: 'TEXT' },
      primary: ['capture_id'], required: ['capture_id', 'video_url', 'origin', 'caption_source', 'model_id', 'read_at'],
      foreign: [['raw_capture', 'capture_id', 'capture_id'], ['video', 'video_url', 'video_url']],
    },
    video_segment: {
      columns: { capture_id: 'TEXT', segment_type: 'TEXT', seq: 'INTEGER', start_s: 'REAL', end_s: 'REAL', text: 'TEXT' },
      primary: ['capture_id', 'segment_type', 'seq'], required: ['capture_id', 'segment_type', 'seq', 'text'],
      foreign: [['video_reading', 'capture_id', 'capture_id']],
    },
  };
  for (const [table, contract] of Object.entries(contracts)) {
    assert.deepEqual(db.prepare('SELECT type,strict FROM pragma_table_list WHERE name=?').get(table), { type: 'table', strict: 1 });
    const columns = db.pragma(`table_info(${table})`) as { name: string; type: string; pk: number; notnull: number }[];
    assert.deepEqual(Object.fromEntries(columns.map(c => [c.name, c.type])), contract.columns, 'no AI judgement columns');
    assert.deepEqual(columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name), contract.primary);
    assert.deepEqual(columns.filter(c => c.notnull).map(c => c.name).sort(), [...contract.required].sort());
    assert.deepEqual((db.pragma(`foreign_key_list(${table})`) as { table: string; from: string; to: string }[])
      .map(c => [c.table, c.from, c.to]).sort(), [...contract.foreign].sort());
  }
  db.exec(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome) VALUES
    ('synthetic-s14-a','S14','gemini','videowatch.generate','2026-11-03T01:00:00Z','OK'),
    ('synthetic-s14-b','S14','gemini','videowatch.generate','2026-11-03T01:00:01Z','OK'),
    ('synthetic-s14-c','S14','gemini','videowatch.generate','2026-11-03T01:00:02Z','OK');
    INSERT INTO video(video_url,link_basis,capture_id) VALUES ('synthetic:video','UNKNOWN','synthetic-s14-a');`);
  type Value = string | number | null;
  const reading: Record<string, Value> = { capture_id: 'synthetic-s14-a', video_url: 'synthetic:video', origin: 'SELECTION',
    caption_source: 'NATIVE_SUBTITLE', model_id: 'gemini-synthetic-s14', read_at: '2026-11-03T01:00:00Z' };
  const segment: Record<string, Value> = { capture_id: 'synthetic-s14-a', segment_type: 'speech', seq: 0, text: 'Chữ giả lập 😀' };
  const insert = (table: string, row: Record<string, Value>) => db.prepare(
    `INSERT INTO ${table}(${Object.keys(row).join(',')}) VALUES (${Object.keys(row).map(() => '?').join(',')})`).run(...Object.values(row));
  for (const change of [{ origin: 'SEARCH' }, { caption_source: 'AI' }]) {
    assert.throws(() => insert('video_reading', { ...reading, ...change }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  }
  for (const name of contracts.video_reading.required) {
    assert.throws(() => insert('video_reading', { ...reading, [name]: null }), { code: 'SQLITE_CONSTRAINT_NOTNULL' }, name);
  }
  assert.throws(() => insert('video_reading', { ...reading, media_bytes: 'many' }), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
  for (const name of ['capture_id', 'video_url']) {
    assert.throws(() => insert('video_reading', { ...reading, [name]: 'missing' }), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  }
  insert('video_reading', reading); // Nullable media and duration are allowed.
  insert('video_reading', { ...reading, capture_id: 'synthetic-s14-b', origin: 'TOP_SELLING', caption_source: 'MODEL_TRANSCRIBED' });
  insert('video_reading', { ...reading, capture_id: 'synthetic-s14-c', origin: 'EXPANDED_SEARCH' });
  assert.throws(() => insert('video_reading', reading), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  assert.throws(() => insert('video_segment', { ...segment, segment_type: 'caption' }), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => insert('video_segment', { ...segment, seq: 'first' }), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
  assert.throws(() => insert('video_segment', { ...segment, capture_id: 'missing' }), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  for (const name of contracts.video_segment.required) {
    assert.throws(() => insert('video_segment', { ...segment, [name]: null }), { code: 'SQLITE_CONSTRAINT_NOTNULL' }, name);
  }
  insert('video_segment', segment);
  assert.throws(() => insert('video_segment', segment), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  insert('video_segment', { ...segment, seq: 1 });
  insert('video_segment', { ...segment, segment_type: 'on_screen' });
  insert('video_segment', { ...segment, capture_id: 'synthetic-s14-b' });
  for (const [table, update] of [['video_reading', "model_id='changed'"], ['video_segment', "text='changed'"]]) {
    const rows = () => db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), before = rows();
    for (const sql of [`UPDATE ${table} SET ${update}`, `DELETE FROM ${table}`]) {
      assert.throws(() => db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
      assert.deepEqual(rows(), before);
    }
  }
});
