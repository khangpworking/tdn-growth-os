import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';

// T1 owns db-v1 §5 storage; the loader suite owns source-to-row mapping.
test('RAWDB-T T1: migration 0065 creates STRICT video identity, explicit product linkage and immutable rows', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  const columns = db.pragma('table_info(video)') as { name: string; type: string; notnull: number; pk: number; dflt_value: string | null }[];
  assert.deepEqual(columns.map(c => `${c.name}:${c.type}`), [
    'video_url:TEXT', 'video_id:TEXT', 'platform:TEXT', 'product_key:TEXT', 'brand:TEXT', 'author_key:TEXT', 'link_basis:TEXT', 'capture_id:TEXT',
  ]);
  assert.deepEqual(columns.filter(c => c.pk).map(c => c.name), ['video_url']);
  assert.deepEqual(columns.filter(c => c.notnull).map(c => c.name), ['video_url', 'platform', 'link_basis', 'capture_id']);
  assert.deepEqual(columns.filter(c => c.dflt_value !== null).map(c => [c.name, c.dflt_value]), [['platform', "'tiktok'"]]);
  assert.deepEqual(db.prepare("SELECT type,strict FROM pragma_table_list WHERE name='video'").get(), { type: 'table', strict: 1 });
  assert.deepEqual((db.pragma('foreign_key_list(video)') as { table: string; from: string; to: string }[])
    .map(c => [c.table, c.from, c.to]).sort(), [
    ['product', 'product_key', 'product_key'], ['raw_capture', 'capture_id', 'capture_id'],
  ]);
  db.exec(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('synthetic-s07','S07','apify','synthetic','2026-11-03T01:00:00Z','OK');
    INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id)
    VALUES ('tiktok_shop:101','tiktok_shop','101','Synthetic product','synthetic-s07');`);
  const insert = db.prepare('INSERT INTO video(video_url,link_basis,product_key,capture_id) VALUES (?,?,?,?)');
  insert.run('synthetic:unknown', 'UNKNOWN', null, 'synthetic-s07');
  for (const basis of ['PROVIDER_LINK', 'SELECTED_FROM_PRODUCT']) {
    insert.run(`synthetic:${basis}`, basis, 'tiktok_shop:101', 'synthetic-s07');
    assert.throws(() => insert.run('synthetic:invalid', basis, null, 'synthetic-s07'), { code: 'SQLITE_CONSTRAINT_CHECK' });
  }
  assert.equal((db.prepare("SELECT platform FROM video WHERE video_url='synthetic:unknown'").get() as { platform: string }).platform, 'tiktok');
  assert.throws(() => insert.run('synthetic:invalid', 'GUESSED', 'tiktok_shop:101', 'synthetic-s07'), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.throws(() => insert.run('synthetic:invalid', 'PROVIDER_LINK', 'tiktok_shop:missing', 'synthetic-s07'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  assert.throws(() => insert.run('synthetic:invalid', 'UNKNOWN', null, 'missing'), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  assert.throws(() => insert.run('synthetic:unknown', 'UNKNOWN', null, 'synthetic-s07'), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  const before = db.prepare('SELECT * FROM video ORDER BY video_url').all();
  for (const statement of ["UPDATE video SET brand='changed'", 'DELETE FROM video']) {
    assert.throws(() => db.exec(statement), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.deepEqual(db.prepare('SELECT * FROM video ORDER BY video_url').all(), before);
  }
});
