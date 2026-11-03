import assert from 'node:assert/strict';
import test from 'node:test';
import Database from 'better-sqlite3';
import { applyMigrations } from '../../src/platform/db/index.js';

test('RAWDB-V V2: migration 0066 enforces STRICT, referenced, immutable S02b video snapshots', t => {
  const db = new Database(':memory:');
  t.after(() => db.close());
  db.pragma('foreign_keys = ON');
  applyMigrations(db);
  assert.deepEqual(db.prepare("SELECT type,strict FROM pragma_table_list WHERE name='video_snapshot'").get(), { type: 'table', strict: 1 });
  const columns = db.pragma('table_info(video_snapshot)') as { name: string; type: string; notnull: number; pk: number }[];
  assert.deepEqual(Object.fromEntries(columns.map(c => [c.name, c.type])), {
    capture_id: 'TEXT', video_url: 'TEXT', source_code: 'TEXT', window_start: 'TEXT', window_end: 'TEXT', rank: 'INTEGER',
    title: 'TEXT', published_at: 'TEXT', revenue_vnd: 'REAL', revenue_growth_rate: 'REAL', views: 'INTEGER', likes: 'INTEGER',
    shares: 'INTEGER', comments: 'INTEGER', is_ad: 'INTEGER', ad_revenue_share_pct: 'REAL', ad_view_share_pct: 'REAL',
    ads_roas: 'REAL', is_ai_video: 'INTEGER', precision: 'TEXT',
  });
  assert.deepEqual(columns.filter(c => c.pk).sort((a, b) => a.pk - b.pk).map(c => c.name), ['capture_id', 'video_url']);
  assert.deepEqual(columns.filter(c => c.notnull).map(c => c.name).sort(),
    ['capture_id', 'video_url', 'source_code', 'window_start', 'window_end', 'rank', 'precision'].sort());
  assert.deepEqual((db.pragma('foreign_key_list(video_snapshot)') as { table: string; from: string; to: string }[])
    .map(c => [c.table, c.from, c.to]).sort(), [['raw_capture', 'capture_id', 'capture_id'], ['video', 'video_url', 'video_url']]);
  db.exec(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome) VALUES
    ('synthetic-s02b','S02b','kalodata','kalodata.video.rank','2026-11-03T01:00:00Z','OK'),
    ('synthetic-s02b-next','S02b','kalodata','kalodata.video.rank','2026-11-03T01:00:01Z','OK');
    INSERT INTO video(video_url,link_basis,capture_id) VALUES
      ('synthetic:video','UNKNOWN','synthetic-s02b'), ('synthetic:second-video','UNKNOWN','synthetic-s02b');`);
  const base: Record<string, string | number | null> = {
    capture_id: 'synthetic-s02b', video_url: 'synthetic:video', source_code: 'S02b', window_start: '2026-09-01',
    window_end: '2026-09-30', rank: 1, precision: 'provider_estimate',
  };
  const insert = (changes: Record<string, string | number | null> = {}) => {
    const row = { ...base, ...changes }, keys = Object.keys(row);
    return db.prepare(`INSERT INTO video_snapshot(${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row));
  };
  // Every invalid insert starts from a valid row, so an unrelated constraint cannot satisfy the assertion.
  for (const changes of [
    { source_code: 'S07' }, { precision: 'exact' }, { rank: 0 }, { rank: -1 }, { revenue_growth_rate: -Infinity },
    ...['is_ad', 'is_ai_video'].flatMap(field => [{ [field]: -1 }, { [field]: 2 }]),
    ...['revenue_vnd', 'views', 'likes', 'shares', 'comments', 'ad_revenue_share_pct', 'ad_view_share_pct', 'ads_roas']
      .map(field => ({ [field]: -1 })),
    ...['revenue_vnd', 'revenue_growth_rate', 'ad_revenue_share_pct', 'ad_view_share_pct', 'ads_roas']
      .map(field => ({ [field]: Infinity })),
  ]) assert.throws(() => insert(changes), { code: 'SQLITE_CONSTRAINT_CHECK' }, JSON.stringify(changes));
  assert.throws(() => insert({ views: 'not-an-integer' }), { code: 'SQLITE_CONSTRAINT_DATATYPE' });
  for (const field of Object.keys(base)) assert.throws(() => insert({ [field]: null }), { code: 'SQLITE_CONSTRAINT_NOTNULL' }, field);
  assert.throws(() => insert({ capture_id: 'missing' }), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  assert.throws(() => insert({ video_url: 'missing' }), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
  insert({ revenue_vnd: 0, revenue_growth_rate: -0.5, is_ad: 0, is_ai_video: 1 });
  assert.throws(() => insert(), { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
  insert({ capture_id: 'synthetic-s02b-next' }); // Same video, independent capture, nullable metrics.
  insert({ video_url: 'synthetic:second-video' }); // Same capture, independent video.
  const before = db.prepare('SELECT * FROM video_snapshot ORDER BY capture_id').all();
  for (const sql of ["UPDATE video_snapshot SET title='changed'", 'DELETE FROM video_snapshot']) {
    assert.throws(() => db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
    assert.deepEqual(db.prepare('SELECT * FROM video_snapshot ORDER BY capture_id').all(), before);
  }
});
