import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import type Database from 'better-sqlite3';
import { loadShopeeReviewsToDbV1, vietnamTime } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { ATTEMPTED_AT, COMPLETED_AT, PRODUCTS, rawDbFixture, seedExistingAnalysis } from '../fixtures/raw-db-v1-s05.js';

const tables = ['raw_capture', 'product', 'review', 'run_review'] as const;
function counts(db: Database.Database, names: readonly string[] = tables) {
  return Object.fromEntries(names.map(table => [table,
    Number((db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint | number }).n)]));
}
const empty = { raw_capture: 0, product: 0, review: 0, run_review: 0 };

test('RAWDB rule 4: verified fixture run stores per-product rows and the exact S05 mapping with +07:00 posted_at', async t => {
  const f = await rawDbFixture(t);
  const collectionId = f.source.packet.collectionId;
  const result = await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  assert.deepEqual(result, { runId: f.runId, collectionId, captures: 2, products: 2,
    reviewsInserted: 3, reviewsAlreadyPresent: 0, runReviewsInserted: 3 });
  assert.deepEqual(counts(f.db), { raw_capture: 2, product: 2, review: 3, run_review: 3 });
  assert.deepEqual(f.db.prepare('SELECT product_key,count(*) n FROM review GROUP BY product_key ORDER BY product_key').all(),
    [{ product_key: 'shopee:101', n: 2n }, { product_key: 'shopee:102', n: 1n }]);

  const stored = f.db.prepare("SELECT * FROM review WHERE review_key='S05:synthetic-review-a'").get() as Record<string, unknown>;
  const { posted_at, ...fields } = stored;
  assert.match(String(posted_at), /^2026-11-03T03:04:00(?:\.0+)?\+07:00$/, 'posted_at must use Asia/Ho_Chi_Minh');
  assert.deepEqual(fields, {
    review_key: 'S05:synthetic-review-a', source_code: 'S05', platform: 'shopee', kind: 'product_review',
    external_id: 'synthetic-review-a', product_key: 'shopee:101', video_url: null,
    reviewer_key: null, reviewer_name: null, reviewer_name_state: 'not_provided', rating_star: 4n,
    text: '  Exact synthetic comment\n<&>  ', variation: '  Synthetic variant\n',
    attributes_json: JSON.stringify(['Synthetic material', 'Synthetic size']),
    like_count: null, reply_count: null, replies_to_external_id: null, media_count: null,
    state: 'VALID', collected_at: COMPLETED_AT[0], capture_id: `S05:${collectionId}:0`, source_position: 'page=2,row=0',
  });
  assert.equal((f.db.prepare("SELECT text FROM review WHERE external_id='synthetic-stars-only'").get() as { text: string }).text, '');
  for (const [index, p] of PRODUCTS.entries()) {
    const captureId = `S05:${collectionId}:${index}`;
    const capture = f.db.prepare('SELECT * FROM raw_capture WHERE capture_id=?').get(captureId) as Record<string, unknown>;
    assert.equal(capture.run_id, f.runId);
    assert.equal(capture.source_code, 'S05');
    assert.equal(capture.provider, 'shopee-public-review');
    assert.equal(capture.operation, 'shopee.public_reviews.listing');
    assert.equal(capture.outcome, 'OK');
    assert.equal(capture.requested_at, ATTEMPTED_AT);
    assert.equal(capture.completed_at, COMPLETED_AT[index]);
    assert.equal(capture.cost_unit, 'USD');
    assert.equal(capture.cost_amount, null);
    assert.equal(capture.response_sha256, f.source.packet.listings[index]!.resultSha256);
    assert.equal(capture.raw_path, `artifact:${f.source.sha256}#listing=${index}`);
    assert.deepEqual(JSON.parse(capture.request_params_json as string), { collectionId, itemId: p.itemId, shopId: p.shopId,
      productUrl: p.productUrl, jobId: '10000000-0000-4000-8000-000000000001', maxReviewsPerProduct: 20,
      selectionBasis: 'OWNER_EXACT_URL', mode: 'fixture', requestCount: 5, usageTotalUsd: 0 });
    assert.deepEqual(f.db.prepare(`SELECT product_key,platform,item_id,shop_id,product_name,product_url,first_capture_id
      FROM product WHERE product_key=?`).get(`shopee:${p.itemId}`), {
      product_key: `shopee:${p.itemId}`, platform: 'shopee', item_id: p.itemId, shop_id: p.shopId,
      product_name: p.name, product_url: p.productUrl, first_capture_id: captureId,
    });
  }
  assert.deepEqual(f.db.prepare('SELECT * FROM run_review ORDER BY review_key').all(), [
    { run_id: f.runId, review_key: 'S05:synthetic-review-a', capture_id: `S05:${collectionId}:0`, source_position: 'page=2,row=0' },
    { run_id: f.runId, review_key: 'S05:synthetic-review-b', capture_id: `S05:${collectionId}:1`, source_position: 'page=3,row=0' },
    { run_id: f.runId, review_key: 'S05:synthetic-stars-only', capture_id: `S05:${collectionId}:0`, source_position: 'page=2,row=1' },
  ]);

  // Verified 4.0.0 rows only carry +07:00, so Z/+00:00 input is checked on the conversion itself.
  // Literal expectations also catch the UTC day changing after conversion.
  assert.equal(vietnamTime('2026-11-02T20:04:05Z'), '2026-11-03T03:04:05+07:00');
  assert.equal(vietnamTime('2026-11-01T01:02:03+00:00'), '2026-11-01T08:02:03+07:00');
  assert.equal(vietnamTime('2026-11-03T03:04:00+07:00'), '2026-11-03T03:04:00+07:00');
});

test('RAWDB rule 5: loading the same run twice returns all zero counters and preserves row counts', async t => {
  const f = await rawDbFixture(t);
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const before = counts(f.db);
  const second = await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  assert.deepEqual(second, { runId: f.runId, collectionId: f.source.packet.collectionId,
    captures: 0, products: 0, reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0 });
  assert.deepEqual(counts(f.db), before);
});

test('RAWDB rule 6: an overlapping second run appends membership while the first review and product versions win', async t => {
  const f = await rawDbFixture(t);
  // Prepare both application runs before loading, so no background work runs during either load.
  const next = await f.saveRun(true);
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const review = f.db.prepare("SELECT * FROM review WHERE external_id='synthetic-review-a'").get();
  const products = f.db.prepare('SELECT * FROM product ORDER BY product_key').all();
  const result = await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: next.runId });
  assert.deepEqual(result, { runId: next.runId, collectionId: next.source.packet.collectionId,
    captures: 2, products: 0, reviewsInserted: 0, reviewsAlreadyPresent: 1, runReviewsInserted: 1 });
  assert.deepEqual(counts(f.db), { raw_capture: 4, product: 2, review: 3, run_review: 4 });
  assert.deepEqual(f.db.prepare("SELECT * FROM review WHERE external_id='synthetic-review-a'").get(), review);
  assert.deepEqual(f.db.prepare('SELECT * FROM product ORDER BY product_key').all(), products);
  assert.deepEqual(f.db.prepare('SELECT * FROM run_review WHERE run_id=?').all(next.runId), [
    { run_id: next.runId, review_key: 'S05:synthetic-review-a', capture_id: `S05:${next.source.packet.collectionId}:0`, source_position: 'page=2,row=0' },
  ]);
  assert.equal((f.db.prepare('SELECT outcome FROM raw_capture WHERE capture_id=?').get(`S05:${next.source.packet.collectionId}:1`) as { outcome: string }).outcome, 'EMPTY');
});

test('RAWDB rule 7: a tampered or missing late-listing artifact propagates verification failure and writes nothing', async t => {
  for (const fault of ['tampered', 'missing'] as const) {
    const f = await rawDbFixture(t);
    const digest = f.source.packet.listings[1]!.resultSha256!;
    const file = f.artifacts.pathForDigest(digest);
    if (fault === 'tampered') await fs.writeFile(file, '{}');
    else await fs.unlink(file);
    let readerError: Error | undefined;
    try { await f.foundation.readPublicExact(f.source.packet.collectionId); }
    catch (error) { assert.ok(error instanceof Error); readerError = error; }
    assert.ok(readerError, 'fixture must fail at the existing verified reader');
    await assert.rejects(loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId }),
      (error: unknown) => error instanceof Error && error.message === readerError.message);
    assert.deepEqual(counts(f.db), empty, fault);
  }
});

test('RAWDB rule 8: a verified collection without selection or Metric product names fails without any writes', async t => {
  const f = await rawDbFixture(t, false);
  await assert.rejects(loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId }), /^Error: RAW_DB_PRODUCT_NAME_MISSING/);
  assert.deepEqual(counts(f.db), empty);
});

test('RAWDB rule 9: loading leaves existing collection, analysis and artifact-manifest row counts unchanged', async t => {
  const f = await rawDbFixture(t);
  await seedExistingAnalysis(f);
  const appTables = ['foundation_shopee_collections', 'analysis_shopee_review_results', 'artifact_manifests'];
  const before = counts(f.db, appTables);
  assert.ok(appTables.every(table => before[table]! > 0));
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  assert.deepEqual(counts(f.db, appTables), before);
});

test('RAWDB rule 10: CLI --dry-run prints one count receipt and rolls back all four tables', async t => {
  const f = await rawDbFixture(t);
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts',
    '--source', 'S05', '--run', f.runId, '--db', f.databasePath, '--dry-run'], {
    cwd: path.resolve('.'), encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot },
  });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  const lines = child.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), { runId: f.runId, collectionId: f.source.packet.collectionId,
    captures: 2, products: 2, reviewsInserted: 3, reviewsAlreadyPresent: 0, runReviewsInserted: 3 });
  assert.deepEqual(counts(f.db), empty);
});
