import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { ArtifactIntegrityError } from '../../src/platform/artifacts/artifact-store.js';
import { loadKalodataVideosToDbV1 } from '../../src/modules/raw-db/kalodata-video-loader.js';
import { loadTikTokCommentsToDbV1 } from '../../src/modules/raw-db/tiktok-comments-loader.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { ANSWER, QUERY, googleFixture, saveGoogleCapture, snapshot } from '../fixtures/raw-db-v1-google.js';
import { S07_FILE, S07_RUN, S07_URLS, s07AuthorKey, s07Fixture, s07Hash, s07Privacy } from '../fixtures/raw-db-v1-s07.js';
import {
  S02B_DOCUMENT, S02B_FILE, S02B_RECEIPT, S02B_RUN, S02B_URLS,
  expectedVideoSnapshots, s02bCapturePrefix, saveKalodataCapture,
} from '../fixtures/raw-db-v1-s02b.js';

const input = { file: S02B_FILE, runId: S02B_RUN };
const tables = ['raw_capture', 'product', 'video', 'video_snapshot', 'review', 'run_review'] as const;
const snapshots = (db: Parameters<typeof snapshot>[0]) => db.prepare('SELECT * FROM video_snapshot ORDER BY video_url').all();

test('RAWDB-V V3: file maps five exact snapshots and three captures, skipping balance and failed rows', async t => {
  const f = await s07Fixture(t), prefix = await s02bCapturePrefix();
  assert.deepEqual(await loadKalodataVideosToDbV1(f.db, f.artifacts, input, f.privacy), S02B_RECEIPT);
  assert.deepEqual(f.db.prepare('SELECT video_url,video_id,platform,brand,capture_id FROM video ORDER BY video_id').all(),
    ['1001', '81002', '81003', '81004', '81005'].map((video_id, i) => ({
      video_url: S02B_URLS[i], video_id, platform: 'tiktok', brand: null, capture_id: `${prefix}:${i < 3 ? 0 : 2}`,
    })));
  assert.deepEqual(snapshots(f.db), expectedVideoSnapshots(`${prefix}:0`, `${prefix}:2`));
  const captures = f.db.prepare(`SELECT capture_id,run_id,source_code,provider,operation,request_params_json,
    requested_at,completed_at,http_status,outcome,cost_unit,cost_amount,response_sha256,raw_path
    FROM raw_capture ORDER BY capture_id`).all() as Record<string, unknown>[];
  assert.deepEqual(captures.map(({ request_params_json, ...row }) => row), [0, 2, 3].map((index, i) => ({
    capture_id: `${prefix}:${index}`, run_id: S02B_RUN, source_code: 'S02b', provider: 'kalodata', operation: 'kalodata.video.rank',
    requested_at: `2026-11-03T01:00:0${i * 2}Z`, completed_at: `2026-11-03T01:00:0${i * 2 + 1}Z`,
    http_status: 200n, outcome: i === 2 ? 'FAILED' : 'OK', cost_unit: 'kalodata_points', cost_amount: null,
    response_sha256: ['a', 'b', 'c'][i]!.repeat(64), raw_path: `file:tests/fixtures/raw-db-v1-s02b.synthetic.json#${index}`,
  })));
  assert.deepEqual(captures.map(row => JSON.parse(row.request_params_json as string)),
    [0, 2, 3].map(index => S02B_DOCUMENT.records[index]!.requestBody));
  assert.deepEqual(f.db.prepare('SELECT period_start,period_end,billing FROM raw_capture ORDER BY capture_id').all(), [
    { period_start: '2026-09-01', period_end: '2026-09-30', billing: 'PAID_CREDITS' },
    { period_start: '2026-10-01', period_end: '2026-10-30', billing: 'PAID_CREDITS' },
    { period_start: null, period_end: null, billing: 'PAID_CREDITS' },
  ]);
  const large = structuredClone(S02B_DOCUMENT);
  const last = large.records[2]!.response.data!.at(-1)! as Record<string, unknown>;
  last.views = 10000000000000000; // Exactly representable and within SQLite INTEGER, beyond JS's safe-integer bound.
  const file = path.join(f.root, 'large-count.json');
  await fs.writeFile(file, JSON.stringify(large));
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy);
  const captureId = `S02b:${s07Hash(await fs.readFile(file)).slice(0, 12)}:2`;
  assert.deepEqual(f.db.prepare('SELECT views FROM video_snapshot WHERE capture_id=? AND video_url=?').get(captureId, S02B_URLS[4]),
    { views: 10000000000000000n }, 'finite integer counts are preserved rather than silently dropped');
});

test('RAWDB-V V4: only a named explicit product creates PROVIDER_LINK; keyword and nameless queries stay UNKNOWN', async t => {
  const f = await s07Fixture(t);
  const changed = structuredClone(S02B_DOCUMENT);
  const nameless = structuredClone(changed.records[0]!);
  delete nameless.productName;
  nameless.productId = '79003';
  nameless.requestBody!.product_id = '79003';
  nameless.response.data = [{ video_id: '81006', belonged_creator_handle: 'synthetic_video_f',
    belonged_creator_id: 'synthetic-private-creator-f', creator_debut: '2016/07/08 09:10:11',
    video_title: 'Synthetic nameless product', revenue: 25, views: 50 }];
  changed.records.push(nameless);
  const file = path.join(f.root, 'product-links.json');
  await fs.writeFile(file, JSON.stringify(changed));
  const captureId = `S02b:${s07Hash(await fs.readFile(file)).slice(0, 12)}:0`;
  const result = await loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy);
  assert.equal(result.productsInserted, 1);
  assert.deepEqual(f.db.prepare('SELECT video_id,product_key,link_basis FROM video ORDER BY video_id').all(), [
    ...['1001', '81002', '81003'].map(video_id => ({ video_id, product_key: 'tiktok_shop:79001', link_basis: 'PROVIDER_LINK' })),
    ...['81004', '81005', '81006'].map(video_id => ({ video_id, product_key: null, link_basis: 'UNKNOWN' })),
  ]);
  const product = f.db.prepare('SELECT * FROM product').get() as Record<string, unknown>;
  assert.deepEqual(product, { product_key: 'tiktok_shop:79001', platform: 'tiktok_shop', item_id: '79001', shop_id: null,
    shop_name: null, product_name: 'Synthetic video product', brand: null, category_path: null, product_url: null,
    launch_date: null, first_capture_id: captureId });
  changed.records[0]!.productName = 'Synthetic later product name';
  await fs.writeFile(file, JSON.stringify(changed));
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy);
  assert.deepEqual(f.db.prepare('SELECT * FROM product').get(), product, 'existing products keep their first version');
});

test('RAWDB-V V5: creator keys share S07 identity; raw creator identities occur only in public video URLs', async t => {
  const f = await s07Fixture(t);
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, f.privacy);
  const s07Video = f.db.prepare('SELECT author_key FROM video WHERE video_url=?').get(S07_URLS[0]) as { author_key: string };
  await loadKalodataVideosToDbV1(f.db, f.artifacts, input, f.privacy);
  const videos = f.db.prepare('SELECT video_url,author_key FROM video WHERE video_url IN (?,?,?,?,?) ORDER BY video_id').all(...S02B_URLS);
  const rows = [S02B_DOCUMENT.records[0]!.response.data!, S02B_DOCUMENT.records[2]!.response.data!].flat();
  assert.deepEqual(videos, rows.map((row, i) => ({ video_url: S02B_URLS[i],
    author_key: s07AuthorKey('video-author-handle', row.belonged_creator_handle) })));
  assert.equal((videos[0] as { author_key: string }).author_key, s07Video.author_key);
  const storedTables = f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  let stored = JSON.stringify(storedTables.map(({ name }) => f.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()),
    (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  for (const videoUrl of [...S02B_URLS, ...S07_URLS]) stored = stored.replaceAll(videoUrl, '[public-video-url]');
  for (const row of rows) {
    assert.equal(stored.includes(row.belonged_creator_id), false, 'creator id absent from every stored column');
    assert.equal(stored.includes(row.creator_debut), false, 'creator debut date absent from every stored column');
    assert.equal(stored.includes(row.belonged_creator_handle), false, 'handle absent outside the public video URL');
  }
});

test('RAWDB-V V6: missing privacy precedes reads; invalid video identity rolls back all tables after valid rows', async t => {
  const f = await s07Fixture(t);
  const before = f.db.serialize();
  await assert.rejects(async () => Reflect.apply(loadKalodataVideosToDbV1, undefined,
    [f.db, f.artifacts, { file: path.join(f.root, 'missing.json'), runId: S02B_RUN }]), /^Error: RAW_DB_PRIVACY_KEY_MISSING/);
  assert.deepEqual(f.db.serialize(), before);
  for (const [field, value] of [
    ['video_id', undefined], ['video_id', 'not-numeric'],
    ['belonged_creator_handle', undefined], ['belonged_creator_handle', ''], ['belonged_creator_handle', 'invalid/handle'],
  ] as const) {
    const changed = structuredClone(S02B_DOCUMENT);
    const last = changed.records[2]!.response.data!.at(-1)! as Record<string, unknown>;
    if (value === undefined) delete last[field]; else last[field] = value;
    const file = path.join(f.root, 'invalid-video.json');
    await fs.writeFile(file, JSON.stringify(changed));
    await assert.rejects(loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy),
      /^Error: RAW_DB_S02B_INVALID_ROW/);
    assert.deepEqual(f.db.serialize(), before, `${field}: every table stays unchanged`);
  }
  for (const dateRange of [undefined, '2026-02-30~2026-03-01', '2026-10-30~2026-10-01']) {
    const changed = structuredClone(S02B_DOCUMENT);
    const request = changed.records[2]!.requestBody as Record<string, unknown>;
    if (dateRange === undefined) delete request.date_range; else request.date_range = dateRange;
    const file = path.join(f.root, 'invalid-window.json');
    await fs.writeFile(file, JSON.stringify(changed));
    await assert.rejects(loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy), /^Error: RAW_DB_S02B_INVALID_ROW/);
    assert.deepEqual(f.db.serialize(), before);
  }
  const repeated = structuredClone(S02B_DOCUMENT);
  const repeatedRows: unknown[] = repeated.records[2]!.response.data!;
  repeatedRows.push(repeatedRows[0]);
  const file = path.join(f.root, 'duplicate-row.json');
  await fs.writeFile(file, JSON.stringify(repeated));
  await assert.rejects(loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy), /^Error: RAW_DB_DUPLICATE_ROW/);
  assert.deepEqual(f.db.serialize(), before, 'a duplicate after successful inserts rolls back the transaction');
});

test('RAWDB-V V7: retries count zero; an S07 video id reuses its first URL and row while adding a new snapshot', async t => {
  const f = await s07Fixture(t);
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, f.privacy);
  const previous = snapshot(f.db, ['video', 'review', 'run_review']);
  const changed = structuredClone(S02B_DOCUMENT);
  changed.records[0]!.response.data![0]!.belonged_creator_handle = 'synthetic_later_handle';
  const file = path.join(f.root, 'existing-video.json');
  await fs.writeFile(file, JSON.stringify(changed));
  const nextInput = { file, runId: S02B_RUN };
  const first = await loadKalodataVideosToDbV1(f.db, f.artifacts, nextInput, f.privacy);
  assert.deepEqual(first, { ...S02B_RECEIPT, videos: 4, videosAlreadyPresent: 1 });
  assert.deepEqual(f.db.prepare('SELECT * FROM video WHERE video_id IN (?,?) ORDER BY video_id').all('1001', '1002'), previous.video);
  assert.deepEqual(f.db.prepare('SELECT video_url FROM video_snapshot WHERE video_url=?').all(S07_URLS[0]), [{ video_url: S07_URLS[0] }]);
  assert.equal(f.db.prepare('SELECT * FROM video WHERE video_id=?').all('1001').length, 1);
  assert.deepEqual(snapshot(f.db, ['review', 'run_review']), { review: previous.review, run_review: previous.run_review });
  const loaded = snapshot(f.db, tables);
  assert.deepEqual(await loadKalodataVideosToDbV1(f.db, f.artifacts, nextInput, f.privacy),
    { runId: S02B_RUN, captures: 0, videos: 0, videosAlreadyPresent: 0, snapshots: 0, productsInserted: 0, productNameSources: 0 });
  assert.deepEqual(snapshot(f.db, tables), loaded);
});

test('RAWDB-V V8: verified run captures map rows and product names; FAILED, EMPTY, corrupt and missing runs stay distinct', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const [product, , keyword, failed] = S02B_DOCUMENT.records;
  assert.ok(product?.requestBody && keyword?.requestBody && failed?.requestBody);
  for (const nameSource of [
    { operation: 'kalodata.product.rank', success: true },
    { operation: 'kalodata.product.detail', success: true },
    { operation: 'kalodata.product.rank', success: false },
  ] as const) {
    const f = await googleFixture(t), privacy = s07Privacy();
    const productRow = { product_id: '79001', product_name: 'Synthetic video product' };
    await saveKalodataCapture(f, 0, nameSource.operation, product.requestBody,
      { success: nameSource.success, data: nameSource.operation === 'kalodata.product.rank' ? [productRow] : productRow });
    const stored: Awaited<ReturnType<typeof saveKalodataCapture>>[] = [];
    for (const [ordinal, record] of [[1, product], [4, keyword], [5, failed]] as const) {
      stored.push(await saveKalodataCapture(f, ordinal, 'kalodata.video.rank', record.requestBody!, record.response,
        { requestedAt: record.requestedAt!, completedAt: record.completedAt!, httpStatus: record.httpStatus }));
    }
    await saveKalodataCapture(f, 6, 'kalodata.video.rank', product.requestBody, { success: true, data: [] });
    await saveKalodataCapture(f, 7, 'kalodata.product.detail', failed.requestBody,
      { success: true, data: { product_id: failed.productId, product_name: failed.productName } });
    assert.deepEqual(await loadKalodataVideosToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy),
      { ...S02B_RECEIPT, runId: f.runId, captures: 4, productsInserted: nameSource.success ? 1 : 0, productNameSources: 0 });
    assert.deepEqual(snapshots(f.db), expectedVideoSnapshots(`S02b:${f.runId}:1`, `S02b:${f.runId}:4`));
    assert.deepEqual(f.db.prepare('SELECT video_id,product_key,link_basis FROM video ORDER BY video_id').all(), [
      ...['1001', '81002', '81003'].map(video_id => ({ video_id,
        product_key: nameSource.success ? 'tiktok_shop:79001' : null, link_basis: nameSource.success ? 'PROVIDER_LINK' : 'UNKNOWN' })),
      ...['81004', '81005'].map(video_id => ({ video_id, product_key: null, link_basis: 'UNKNOWN' })),
    ]);
    assert.deepEqual(f.db.prepare('SELECT product_name FROM product').all(), nameSource.success ? [{ product_name: 'Synthetic video product' }] : []);
    const captures = f.db.prepare(`SELECT capture_id,outcome,requested_at,completed_at,http_status,response_sha256,request_params_json
      FROM raw_capture ORDER BY capture_id`).all() as Record<string, unknown>[];
    assert.deepEqual(captures.map(row => [row.capture_id, row.outcome]),
      [1, 4, 5, 6].map((ordinal, i) => [`S02b:${f.runId}:${ordinal}`, ['OK', 'OK', 'FAILED', 'EMPTY'][i]]));
    for (const [i, record] of [product, keyword, failed].entries()) {
      assert.equal(captures[i]!.response_sha256, stored[i]!.envelope.responseSha256);
      assert.equal(captures[i]!.requested_at, record.requestedAt);
      assert.equal(captures[i]!.completed_at, record.completedAt);
      assert.equal(captures[i]!.http_status, 200n);
      assert.deepEqual(JSON.parse(captures[i]!.request_params_json as string), record.requestBody);
    }
    const before = snapshot(f.db, tables);
    assert.deepEqual(await loadKalodataVideosToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy),
      { runId: f.runId, captures: 0, videos: 0, videosAlreadyPresent: 0, snapshots: 0, productsInserted: 0, productNameSources: 0 });
    assert.deepEqual(snapshot(f.db, tables), before);
  }
  for (const corruption of ['outer-bytes', 'inner-digest', 'truncated'] as const) {
    const f = await googleFixture(t);
    await saveKalodataCapture(f, 0, 'kalodata.video.rank', product.requestBody, product.response);
    const stored = await saveKalodataCapture(f, 1, 'kalodata.video.rank', keyword.requestBody, keyword.response,
      corruption === 'inner-digest' ? { responseSha256: '0'.repeat(64) } : corruption === 'truncated' ? { truncated: true } : {});
    if (corruption === 'outer-bytes') await fs.writeFile(stored.absolutePath, '{}');
    const before = f.db.serialize();
    await assert.rejects(loadKalodataVideosToDbV1(f.db, f.artifacts, { runId: f.runId }, s07Privacy()),
      corruption === 'outer-bytes' ? ArtifactIntegrityError :
        corruption === 'inner-digest' ? /^Error: RAW_DB_ARTIFACT_MISMATCH: response bytes differ/ : /^Error: RAW_DB_ARTIFACT_MISMATCH: truncated/);
    assert.deepEqual(f.db.serialize(), before, `${corruption}: no partial capture or video writes`);
  }
  const absent = await googleFixture(t);
  await saveGoogleCapture(absent, 'google.suggest', ['synthetic jar', ['synthetic unrelated capture']], 0);
  const before = absent.db.serialize();
  for (const runId of [absent.runId, 'synthetic-nonexistent-run']) {
    await assert.rejects(loadKalodataVideosToDbV1(absent.db, absent.artifacts, { runId }, s07Privacy()), /^Error: RAW_DB_RUN_NOT_FOUND/);
    assert.deepEqual(absent.db.serialize(), before);
  }
});

test('RAWDB-V V11: declared canonical response hashes are verified; unknown declarations fail before writes', async t => {
  const f = await s07Fixture(t);
  const record = structuredClone(S02B_DOCUMENT.records[0]);
  record.response = { success: true, data: [] };
  // Independent canonical bytes for this response, rather than the production canonicalizer.
  const digest = s07Hash('{"data":[],"success":true}');
  record.responseSha256 = digest;
  const document = { declare: { ...S02B_DOCUMENT.declare, responseSha256Basis: 'canonical-json' }, records: [record] };
  const file = path.join(f.root, 'canonical-response.json');
  await fs.writeFile(file, JSON.stringify(document));
  assert.deepEqual(await loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy),
    { runId: S02B_RUN, captures: 1, videos: 0, videosAlreadyPresent: 0, snapshots: 0, productsInserted: 0, productNameSources: 0 });
  assert.deepEqual(f.db.prepare('SELECT response_sha256,outcome FROM raw_capture').all(), [{ response_sha256: digest, outcome: 'EMPTY' }]);
  const before = f.db.serialize();
  record.response.success = false;
  await fs.writeFile(file, JSON.stringify(document));
  await assert.rejects(loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy),
    /^Error: RAW_DB_FILE_BAD_RECORD: .*response differs from its responseSha256/);
  assert.deepEqual(f.db.serialize(), before);
  record.response.success = true;
  document.declare.responseSha256Basis = 'unknown-encoding';
  await fs.writeFile(file, JSON.stringify(document));
  await assert.rejects(loadKalodataVideosToDbV1(f.db, f.artifacts, { file, runId: S02B_RUN }, f.privacy),
    /^Error: RAW_DB_FILE_BAD_RECORD: unsupported responseSha256Basis/);
  assert.deepEqual(f.db.serialize(), before);
});

test('RAWDB-V V9: CLI S02b --file --privacy-file --dry-run prints counts and preserves exact database bytes', async t => {
  const f = await s07Fixture(t);
  f.db.pragma('wal_checkpoint(TRUNCATE)');
  f.db.pragma('journal_mode = DELETE');
  const before = await fs.readFile(f.databasePath);
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts', '--source', 'S02b',
    '--run', S02B_RUN, '--file', S02B_FILE, '--privacy-file', f.privacyFile, '--db', f.databasePath,
    '--artifacts', f.artifactRoot, '--dry-run'], { encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: path.join(f.root, 'missing-env-key.json'),
      TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot } });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const lines = child.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), S02B_RECEIPT);
  assert.deepEqual(await fs.readFile(f.databasePath), before);
});

test('RAWDB-V V10: loading S02b preserves populated S05, Google and S07 rows, views and table definitions', async t => {
  const f = await rawDbFixture(t), privacy = s07Privacy();
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  await saveGoogleCapture(f, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: f.runId });
  await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId });
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, privacy);
  const preserved = ['review', 'run_review', 'search_suggestion', 'ai_overview_block', 'ai_overview_reference', 'video', 'writer_count'];
  const before = snapshot(f.db, [...preserved.filter(table => table !== 'writer_count'), 'raw_capture', 'product']);
  for (const rows of Object.values(before)) assert.ok((rows as unknown[]).length > 0, 'preservation fixture is nonempty');
  const writers = f.db.prepare('SELECT * FROM writer_count ORDER BY product_key').all();
  assert.ok(writers.length > 0);
  const schema = f.db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all();
  await loadKalodataVideosToDbV1(f.db, f.artifacts, input, privacy);
  const after = snapshot(f.db, preserved.filter(table => table !== 'writer_count'));
  for (const table of preserved.filter(table => table !== 'writer_count' && table !== 'video')) assert.deepEqual(after[table], before[table], table);
  assert.deepEqual(f.db.prepare('SELECT * FROM video WHERE capture_id IN (SELECT capture_id FROM raw_capture WHERE source_code=?) ORDER BY rowid').all('S07'), before.video);
  assert.deepEqual(f.db.prepare("SELECT * FROM raw_capture WHERE source_code<>'S02b' ORDER BY rowid").all(), before.raw_capture);
  assert.deepEqual(f.db.prepare("SELECT * FROM product WHERE platform='shopee' ORDER BY rowid").all(), before.product);
  assert.deepEqual(f.db.prepare('SELECT * FROM writer_count ORDER BY product_key').all(), writers);
  assert.deepEqual(f.db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all(), schema);
});
