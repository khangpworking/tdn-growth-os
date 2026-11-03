import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test, { beforeEach, afterEach, mock } from 'node:test';
import { fixture, startRun } from '../helpers/autorun-harness.js';
import { saveKalodataCapture } from '../fixtures/raw-db-v1-s02b.js';
import { A_AT, A_TEXT, aCli, aLoad, aReviews, s06Fixture, saveS06Capture } from '../fixtures/raw-db-v1-autoload.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

test('RAWDB-A S06 mapping: exact display_text, native identity and nullable reviewer fields survive the verified capture', async t => {
  const f = await s06Fixture(t), { loadTikTokShopReviewsToDbV1: load } = await aLoad();
  await load(f.db, f.artifacts, { runId: f.runId });
  const rows = f.db.prepare('SELECT * FROM review ORDER BY external_id').all() as Record<string, unknown>[];
  assert.equal(rows.length, 2);
  for (const [index, row] of rows.entries()) {
    // The provider returns a display name on both rows. Neither a name nor a derived writer key is allowed.
    assert.equal(row.reviewer_name, null, 'S06 must not persist a display name');
    assert.equal(row.reviewer_key, null, 'a display name is not a native author identity');
    assert.equal(row.reviewer_name_state, index === 0 ? 'masked_by_source' : 'not_provided');
    assert.equal(row.review_key, `S06:${79001000 + index}`);
    assert.equal(row.external_id, String(79001000 + index));
    assert.equal(row.source_code, 'S06');
    assert.equal(row.platform, 'tiktok_shop');
    assert.equal(row.kind, 'product_review');
    assert.equal(row.product_key, 'tiktok_shop:79001');
    assert.equal(row.text, index === 0 ? A_TEXT : 'Mẫu giả lập 1 🧪');
    assert.equal(row.attributes_json, null);
    assert.equal(row.variation, '  Xanh thử nghiệm 🧪  ');
    assert.equal(Number(row.like_count), index);
    assert.equal(row.state, 'VALID');
    assert.equal(row.collected_at, A_AT);
    assert.equal(row.posted_at, '2026-09-18T21:30:01.752+07:00');
    assert.equal(row.source_position, `product=79001,index=${index}`);
  }
  const capture = f.db.prepare("SELECT * FROM raw_capture WHERE source_code='S06'").get() as Record<string, unknown>;
  assert.equal(capture.run_id, f.runId);
  assert.equal(String(capture.provider).toLowerCase(), 'kalodata');
  assert.equal(capture.operation, 'kalodata.product.comment.insight');
  assert.equal(capture.outcome, 'OK');
  assert.equal(capture.billing, 'PAID_CREDITS');
  assert.equal(capture.response_sha256, f.capture.responseSha256);
  assert.equal((f.db.prepare("SELECT product_name FROM product WHERE product_key='tiktok_shop:79001'").get() as { product_name: string }).product_name,
    'Sản phẩm giả lập 🧪');
  assert.deepEqual(f.db.prepare('SELECT review_key,capture_id,source_position FROM run_review WHERE run_id=? ORDER BY review_key').all(f.runId),
    rows.map(row => ({ review_key: row.review_key, capture_id: capture.capture_id, source_position: row.source_position })));
  const writers = f.db.prepare("SELECT * FROM writer_count WHERE platform='tiktok_shop'").get() as Record<string, unknown>;
  assert.ok(writers, 'S06 appears in the per-review writer-count view');
  assert.equal(Number(writers.writers), 2);
  assert.equal(Number(writers.counted_by_review), 1);
});

test('RAWDB-A rating: only integer numbers or numeric strings in 1–5 survive; every other value increments ratingInvalid', async t => {
  const cases: [unknown, number | null][] = [
    [1, 1], [5, 5], ['1', 1], ['5', 5], ['3.0', 3], [0, null], [6, null], [-1, null],
    [2.5, null], ['2.5', null], ['', null], [' ', null], ['five', null], [null, null], [true, null], [false, null], [[], null], [{}, null],
  ];
  const f = await s06Fixture(t, aReviews(cases.map(([input]) => input)));
  const { loadTikTokShopReviewsToDbV1: load } = await aLoad();
  const result = await load(f.db, f.artifacts, { runId: f.runId });
  assert.equal(result.ratingInvalid, cases.filter(([, expected]) => expected === null).length);
  for (const [index, [, expected]] of cases.entries()) {
    const row = f.db.prepare('SELECT rating_star FROM review WHERE review_key=?').get(`S06:${79001000 + index}`) as { rating_star: bigint | null };
    assert.equal(row.rating_star, expected === null ? null : BigInt(expected), `rating case ${index}`);
  }
});

test('RAWDB-A membership: same-run retry counts zero; another run appends run_review without replacing the first review or product', async t => {
  const f = await s06Fixture(t), { loadTikTokShopReviewsToDbV1: load } = await aLoad();
  await load(f.db, f.artifacts, { runId: f.runId });
  const before = Object.fromEntries(['review', 'product', 'run_review', 'raw_capture'].map(table => [table, f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()]));
  const retry = await load(f.db, f.artifacts, { runId: f.runId });
  for (const field of ['captures', 'products', 'reviewsInserted', 'reviewsAlreadyPresent', 'runReviewsInserted'] as const) assert.equal(retry[field], 0, field);
  for (const [table, rows] of Object.entries(before)) assert.deepEqual(f.db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(), rows);
  const nextId = await startRun(f.service), changed = aReviews();
  changed[0]!.review.display_text = 'Bản sau không thay bản đầu 🧪';
  await saveKalodataCapture({ ...f, runId: nextId }, 19, 'kalodata.product.detail', { product_id: '79001' },
    { success: true, data: { product_id: '79001', product_name: 'Tên giả lập khác 🧪' } });
  await saveS06Capture({ ...f, runId: nextId }, changed);
  const next = await load(f.db, f.artifacts, { runId: nextId });
  assert.equal(next.reviewsInserted, 0);
  assert.equal(next.reviewsAlreadyPresent, 2);
  assert.equal(next.runReviewsInserted, 2);
  assert.deepEqual(f.db.prepare('SELECT * FROM review ORDER BY rowid').all(), before.review);
  assert.deepEqual(f.db.prepare('SELECT * FROM product ORDER BY rowid').all(), before.product);
  assert.equal(Number(f.db.prepare('SELECT count(*) FROM run_review WHERE run_id=?').pluck().get(nextId)), 2);
  const capture = f.db.prepare("SELECT capture_id FROM raw_capture WHERE run_id=? AND source_code='S06'").pluck().get(nextId);
  assert.deepEqual(f.db.prepare('SELECT DISTINCT capture_id FROM run_review WHERE run_id=?').pluck().all(nextId), [capture]);
});

test('RAWDB-A verified atomic load: corrupt stored bytes or a late row write failure leaves no partial S06 data', async t => {
  for (const fault of ['artifact', 'late-write'] as const) {
    const f = await s06Fixture(t), { loadTikTokShopReviewsToDbV1: load } = await aLoad();
    if (fault === 'artifact') await fs.writeFile(f.artifacts.pathForDigest(f.capture.sha256), '{}');
    else f.db.exec(`CREATE TRIGGER a_reject_late_review BEFORE INSERT ON review WHEN NEW.external_id='79001001'
      BEGIN SELECT RAISE(ABORT,'A_SYNTHETIC_LATE_REVIEW'); END`);
    const before = f.db.serialize();
    const loading = load(f.db, f.artifacts, { runId: f.runId });
    if (fault === 'late-write') await assert.rejects(loading, /A_SYNTHETIC_LATE_REVIEW/);
    else await assert.rejects(loading);
    assert.deepEqual(f.db.serialize(), before, `${fault}: no partial capture, product, review or membership`);
  }
});

test('RAWDB-A S06 empty capture: preserve the stored OK outcome even when the response has no reviews', async t => {
  const f = await s06Fixture(t, []), { loadTikTokShopReviewsToDbV1: load } = await aLoad();
  const result = await load(f.db, f.artifacts, { runId: f.runId });
  assert.equal(result.captures, 1);
  assert.equal(result.reviewsInserted, 0);
  assert.equal(f.db.prepare("SELECT outcome FROM raw_capture WHERE source_code='S06'").pluck().get(), 'OK');
});

test('RAWDB-A S06 CLI dry-run: prints planned rows, rolls back and rejects file input', async t => {
  const f = await s06Fixture(t), before = f.db.serialize();
  const result = await aCli(f, ['--source', 'S06', '--run', f.runId, '--dry-run']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.value?.reviewsInserted, 2);
  assert.deepEqual(f.db.serialize(), before);
  assert.deepEqual(result.calls, []);
  const file = await aCli(f, ['--source', 'S06', '--run', f.runId, '--file', 'synthetic-unused.json']);
  assert.notEqual(file.status, 0);
  assert.deepEqual(f.db.serialize(), before);
});

test('RAWDB-A product evidence: a run without a stored product name cannot invent a product or partially load reviews', async t => {
  const f = await fixture(t, 'off'), runId = await startRun(f.service);
  await saveS06Capture({ ...f, runId });
  const { loadTikTokShopReviewsToDbV1: load } = await aLoad(), before = f.db.serialize();
  await assert.rejects(load(f.db, f.artifacts, { runId }));
  assert.deepEqual(f.db.serialize(), before);
});
