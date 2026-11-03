import assert from 'node:assert/strict';
import test, { beforeEach, afterEach, mock } from 'node:test';
import Database from 'better-sqlite3';
import { A_SOURCES, aAttempt, aCli, aHasCode, aResult, aReviews, autoloadFixture, s06Fixture } from '../fixtures/raw-db-v1-autoload.js';
import { LABEL_CAP, seedLabelReview } from '../fixtures/raw-db-v1-labels.js';
import { seedCodeReview } from '../fixtures/raw-db-v1-codes.js';
import { holdLabelsLock, snapshotPath } from '../fixtures/raw-db-v1-y2.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());
const args = (runId: string) => ['--source', 'AUTOLOAD', '--run', runId];
const count = (db: Database.Database, table: string) => Number(db.prepare(`SELECT count(*) FROM ${table}`).pluck().get());

test('RAWDB-A AUTOLOAD order: all seven stored sources commit in order, then both platforms receive Jev labels', async t => {
  const f = await autoloadFixture(t);
  f.db.exec(`CREATE TABLE a_order(seq INTEGER PRIMARY KEY,source TEXT NOT NULL);
    CREATE TRIGGER a_observe_capture AFTER INSERT ON raw_capture BEGIN INSERT INTO a_order(source) VALUES (NEW.source_code); END;
    CREATE TRIGGER a_observe_label AFTER INSERT ON review_code BEGIN INSERT INTO a_order(source) VALUES ('LABELS'); END`);
  const result = await aCli(f, args(f.runId), { jev: true, privacyFile: f.privacyFile });
  assert.equal(result.status, 0, result.stderr);
  const seen = f.db.prepare('SELECT source FROM a_order GROUP BY source ORDER BY min(seq)').pluck().all();
  assert.deepEqual(seen, [...A_SOURCES, 'LABELS']);
  assert.deepEqual(f.db.prepare('SELECT DISTINCT r.platform FROM review_code c JOIN review r USING(review_key) ORDER BY r.platform').pluck().all(),
    ['shopee', 'tiktok_shop']);
  for (const source of A_SOURCES) assert.ok(aResult(aAttempt(f.db), source.toLowerCase()), `${source} has its own result`);
  assert.equal(count(f.db, 'video_reading'), 2);
  assert.ok(count(f.db, 'video_snapshot') > 0);
  assert.ok(count(f.db, 'search_suggestion') > 0);
  assert.ok(count(f.db, 'ai_overview_block') > 0);
  assert.ok(result.calls.length > 0);
  for (const platform of ['shopee', 'tiktok_shop'])
    assert.ok(result.calls.some(call => (JSON.stringify(call.body) ?? '').includes(`Nền tảng: ${platform}`)), `${platform} reaches Jev with its own platform`);
});

test('RAWDB-A source isolation: each failing source records its own error and every remaining source still commits', async t => {
  // One table owns isolation for every source, including S29 (labelling must still follow it).
  for (const failed of A_SOURCES) {
    const f = await autoloadFixture(t);
    f.db.exec(`CREATE TRIGGER a_reject_source BEFORE INSERT ON raw_capture WHEN NEW.source_code='${failed}'
      BEGIN SELECT RAISE(ABORT,'A_SYNTHETIC_SOURCE_FAILURE'); END`);
    const result = await aCli(f, args(f.runId), { jev: true, privacyFile: f.privacyFile });
    assert.equal(result.status, 0, `${failed}: ${result.stderr}`);
    const attempt = aAttempt(f.db), recorded = JSON.stringify(aResult(attempt, failed.toLowerCase()));
    assert.match(recorded, /A_SYNTHETIC_SOURCE_FAILURE|FAILED|ERROR|SQLITE_CONSTRAINT_TRIGGER/i, failed);
    const loaded = f.db.prepare('SELECT DISTINCT source_code FROM raw_capture WHERE run_id=? ORDER BY source_code').pluck().all(f.runId);
    assert.deepEqual(loaded, A_SOURCES.filter(s => s !== failed).sort(), `${failed}: unrelated source commits survive`);
    assert.ok(count(f.db, 'review_code') > 0, `${failed}: labelling still runs`);
  }
});

test('RAWDB-A privacy: no key skips only S07, S02b and S14 while unkeyed sources and labels continue', async t => {
  const f = await autoloadFixture(t), result = await aCli(f, args(f.runId), { jev: true });
  assert.equal(result.status, 0, result.stderr);
  const attempt = aAttempt(f.db);
  for (const source of ['s07', 's02b', 's14']) assert.ok(aHasCode(aResult(attempt, source), 'SKIPPED_NO_PRIVACY_KEY'), source);
  assert.deepEqual(f.db.prepare('SELECT DISTINCT source_code FROM raw_capture WHERE run_id=? ORDER BY source_code').pluck().all(f.runId),
    ['S05', 'S06', 'S19b', 'S29']);
  assert.ok(count(f.db, 'review_code') > 0);
});

test('RAWDB-A Jev disabled: all available source loads still commit and labelling records SKIPPED_JEV_DISABLED', async t => {
  const f = await autoloadFixture(t), result = await aCli(f, args(f.runId), { privacyFile: f.privacyFile });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(f.db.prepare('SELECT DISTINCT source_code FROM raw_capture WHERE run_id=? ORDER BY source_code').pluck().all(f.runId), [...A_SOURCES].sort());
  assert.ok(aHasCode(aResult(aAttempt(f.db), 'labelling'), 'SKIPPED_JEV_DISABLED'));
  assert.deepEqual(result.calls, []);
  assert.equal(count(f.db, 'review_code'), 0);
});

test('RAWDB-A label cap and run scope: codebook limit applies to S05/S06 product reviews, excluding S07 and another run', async t => {
  const f = await s06Fixture(t, aReviews(Array.from({ length: LABEL_CAP + 2 }, () => 5)));
  seedLabelReview(f.db, f.runId, 'a-cap-shopee');
  seedLabelReview(f.db, 'a-other-run', 'a-outside-run', { collected_at: '2026-01-01T00:00:00Z' });
  seedCodeReview(f.db, { review_key: 'S07:a-video-comment', external_id: 'a-video-comment', source_code: 'S07',
    platform: 'tiktok', kind: 'video_comment', product_key: null, video_url: 'https://www.tiktok.com/@synthetic/video/123',
    collected_at: '2026-01-01T00:00:00Z' });
  f.db.prepare(`INSERT INTO run_review(run_id,review_key,capture_id,source_position)
    SELECT ?,review_key,capture_id,source_position FROM review WHERE review_key='S07:a-video-comment'`).run(f.runId);
  const result = await aCli(f, args(f.runId), { jev: true, responses: LABEL_CAP });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls.length, LABEL_CAP);
  assert.equal(count(f.db, 'review_code'), LABEL_CAP);
  assert.deepEqual(f.db.prepare(`SELECT review_key FROM review_code WHERE review_key IN ('S05:a-outside-run','S07:a-video-comment')`).all(), []);
});

test('RAWDB-A LABELS_BUSY: contention is recorded after committed loads and a subsequent attempt can label them', async t => {
  const f = await s06Fixture(t), release = holdLabelsLock(f);
  try {
    const busy = await aCli(f, args(f.runId), { jev: true });
    assert.equal(busy.status, 0, busy.stderr);
    assert.ok(aHasCode(aResult(aAttempt(f.db), 'labelling'), 'LABELS_BUSY'));
    assert.equal(count(f.db, 'review'), 2);
    assert.equal(count(f.db, 'review_code'), 0);
    assert.deepEqual(busy.calls, []);
  } finally { release(); }
  const retry = await aCli(f, args(f.runId), { jev: true });
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(count(f.db, 'review_code'), 2);
  assert.equal(count(f.db, 'raw_db_autoload'), 2);
});

test('RAWDB-A snapshot after attempt: the standalone published DB includes committed rows and that attempt, including on source failure', async t => {
  for (const fails of [false, true]) {
    const f = await s06Fixture(t);
    if (fails) f.db.exec(`CREATE TRIGGER a_fail_s06 BEFORE INSERT ON raw_capture WHEN NEW.source_code='S06'
      BEGIN SELECT RAISE(ABORT,'A_SNAPSHOT_FAILURE'); END`);
    const result = await aCli(f, args(f.runId));
    assert.equal(result.status, 0, result.stderr);
    const copy = new Database(snapshotPath(f), { readonly: true, fileMustExist: true });
    copy.defaultSafeIntegers(true);
    try {
      assert.equal(copy.pragma('journal_mode', { simple: true }), 'delete');
      assert.equal(copy.pragma('integrity_check', { simple: true }), 'ok');
      assert.equal(count(copy, 'review'), fails ? 0 : 2);
      assert.deepEqual(copy.prepare('SELECT * FROM raw_db_autoload ORDER BY started_at,finished_at').all(),
        f.db.prepare('SELECT * FROM raw_db_autoload ORDER BY started_at,finished_at').all(), 'attempt is persisted before publishing');
      assert.equal(count(copy, 'raw_db_autoload'), 1);
    } finally { copy.close(); }
  }
});

test('RAWDB-A attempt ledger: one STRICT insert-only row per retry stores timestamps and all eight JSON results', async t => {
  const f = await s06Fixture(t), started = Date.now();
  for (let index = 0; index < 2; index++) {
    const result = await aCli(f, args(f.runId));
    assert.equal(result.status, 0, result.stderr);
  }
  const rows = f.db.prepare('SELECT * FROM raw_db_autoload ORDER BY started_at,finished_at').all() as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.run_id, f.runId);
    assert.ok(Date.parse(String(row.started_at)) >= started - 1000);
    assert.ok(Date.parse(String(row.finished_at)) >= Date.parse(String(row.started_at)));
    assert.ok(Date.parse(String(row.finished_at)) <= Date.now() + 1000);
    for (const source of [...A_SOURCES.map(s => s.toLowerCase()), 'labelling']) assert.notEqual(aResult(row, source), undefined);
    for (const source of ['s05', 's07', 's02b', 's14', 's19b', 's29'])
      assert.doesNotMatch(JSON.stringify(aResult(row, source)), /ERROR|FAILED|RAW_DB_RUN_NOT_FOUND/i, `${source}: absent captures are skipped`);
  }
  assert.deepEqual(f.db.prepare('SELECT DISTINCT source_code FROM raw_capture').pluck().all(), ['S06']);
  const table = (f.db.pragma('table_list') as { name: string; strict: bigint }[]).find(r => r.name === 'raw_db_autoload');
  assert.equal(Number(table?.strict), 1);
  assert.throws(() => f.db.prepare('UPDATE raw_db_autoload SET finished_at=finished_at WHERE run_id=?').run(f.runId));
  assert.throws(() => f.db.prepare('DELETE FROM raw_db_autoload WHERE run_id=?').run(f.runId));
  assert.deepEqual(f.db.prepare('SELECT * FROM raw_db_autoload ORDER BY started_at,finished_at').all(), rows);
});
