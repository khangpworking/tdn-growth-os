import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { applyMigrations } from '../../src/platform/db/index.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { loadKalodataVideosToDbV1 } from '../../src/modules/raw-db/kalodata-video-loader.js';
import { loadTikTokCommentsToDbV1 } from '../../src/modules/raw-db/tiktok-comments-loader.js';
import { loadSearchSuggestionsToDbV1, loadAiOverviewToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { loadVideoReadingsToDbV1 } from '../../src/modules/raw-db/video-reading-loader.js';
import { captureFiles } from '../helpers/autorun-harness.js';
import { PRODUCTS, rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { S02B_DOCUMENT, S02B_FILE, saveKalodataCapture } from '../fixtures/raw-db-v1-s02b.js';
import { S07_FILE, s07Hash, s07Privacy } from '../fixtures/raw-db-v1-s07.js';
import { ANSWER, QUERY, googleFixture, saveGoogleCapture, SUGGESTION_FILE } from '../fixtures/raw-db-v1-google.js';
import { S14_FILE, saveVideoReadingRun } from '../fixtures/raw-db-v1-s14.js';
import { tiktokFixture, runId as tikTokRunId } from '../fixtures/tiktok-coding-fixture.js';
import { s06Fixture } from '../fixtures/raw-db-v1-autoload.js';
import { loadTikTokShopReviewsToDbV1 } from '../../src/modules/raw-db/tiktok-shop-reviews-loader.js';
import { AT, BASIS_ROWS, beforeFieldFixes, databaseRows, editPublicRows, historicalNameState, temporaryDirectory } from '../fixtures/raw-db-v1-field-fixes.js';

test('RAWDB-P4 F1: bad or missing stars keep VALID review state; migration rejects states outside VALID/HIDDEN/DELETED', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const f = await rawDbFixture(t);
  const source = await f.saveRun(false, collected => editPublicRows(collected, (row, i) => {
    if (i < 2) { row.ratingStar = null; row.ratingState = i === 0 ? 'MISSING' : 'INVALID'; }
  }));
  const result = await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: source.runId });
  assert.deepEqual(f.db.prepare('SELECT external_id,rating_star,state FROM review ORDER BY external_id').all(), [
    { external_id: 'synthetic-review-a', rating_star: null, state: 'VALID' },
    { external_id: 'synthetic-review-b', rating_star: 4n, state: 'VALID' },
    { external_id: 'synthetic-stars-only', rating_star: null, state: 'VALID' },
  ]);
  assert.equal((result as typeof result & { ratingInvalid: number }).ratingInvalid, 2, 'one count per invalid/missing star');

  const insert = (db: typeof f.db, id: string, state: string) => db.prepare(`INSERT INTO review
    (review_key,source_code,platform,kind,external_id,video_url,reviewer_name_state,state,collected_at,capture_id,source_position)
    VALUES (?,'S07','tiktok','video_comment',?,'synthetic:video','not_provided',?,?,'synthetic-state','row=0')`).run(id, id, state, AT);
  f.db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
    VALUES ('synthetic-state','S07','apify','apify.tiktok.comments',?,'OK')`).run(AT);
  for (const state of ['VALID', 'HIDDEN', 'DELETED']) insert(f.db, `synthetic-${state}`, state);
  for (const state of ['MISSING', 'INVALID', '', 'valid']) {
    assert.throws(() => insert(f.db, `synthetic-bad-${state}`, state), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  }
  for (const state of ['MISSING', 'INVALID', 'HIDDEN', 'DELETED']) {
    const db = await beforeFieldFixes(t);
    db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome)
      VALUES ('synthetic-state','S07','apify','apify.tiktok.comments',?,'OK')`).run(AT);
    insert(db, 'synthetic-legacy', state);
    if (state === 'HIDDEN' || state === 'DELETED') {
      applyMigrations(db);
      assert.equal(db.prepare('SELECT state FROM review').pluck().get(), state);
      continue;
    }
    const before = databaseRows(db), schema = db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all();
    const version = db.pragma('user_version', { simple: true });
    assert.throws(() => applyMigrations(db), /raw_db_0071_review_state/, `0071 must fail on legacy ${state}`);
    assert.deepEqual(databaseRows(db), before, 'failed migration preserves rows and ledger');
    assert.deepEqual(db.prepare('SELECT * FROM sqlite_schema ORDER BY name').all(), schema);
    assert.equal(db.pragma('user_version', { simple: true }), version);
  }
});

test('RAWDB-P4 F3: exact name provenance is append-only; same-run replay adds provenance alone and mismatch writes nothing', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  for (const kind of ['S05', 'S02b-file', 'S02b-rank', 'S02b-detail', 'S06'] as const) {
    const f = await rawDbFixture(t, kind === 'S05'), privacy = s07Privacy();
    let expected: { product_key: string; source_kind: string; artifact_sha256: string | null; capture_id: string | null; json_path: string }[];
    let nameCapture: { captureId: string; artifactSha256: string } | undefined;
    let load: () => Promise<object>;
    if (kind === 'S05') {
      load = () => loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
      expected = PRODUCTS.map((p, i) => ({ product_key: `shopee:${p.itemId}`, source_kind: 'METRIC_LIST',
        artifact_sha256: s07Hash(captureFiles(f.runId).rawBytes), capture_id: null, json_path: `$.responses[0].body.data[${i}]` }));
    } else if (kind === 'S06') {
      await saveKalodataCapture(f, 0, 'kalodata.product.detail', { product_id: '79001' },
        { success: true, data: { product_id: '79001', product_name: 'Synthetic video product' } });
      const { saveS06Capture } = await import('../fixtures/raw-db-v1-autoload.js');
      await saveS06Capture(f);
      const named = f.db.prepare("SELECT artifact_sha256 FROM analysis_research_automation_captures WHERE run_id=? AND ordinal=0").pluck().get(f.runId) as string;
      nameCapture = { captureId: `S06:${f.runId}:0`, artifactSha256: named };
      load = () => loadTikTokShopReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
      expected = [{ product_key: 'tiktok_shop:79001', source_kind: 'APP_CAPTURE', artifact_sha256: named, capture_id: null, json_path: '$.data' }];
    } else if (kind === 'S02b-file') {
      load = () => loadKalodataVideosToDbV1(f.db, f.artifacts, { file: S02B_FILE, runId: f.runId }, privacy);
      expected = [{ product_key: 'tiktok_shop:79001', source_kind: 'RAW_CAPTURE', artifact_sha256: null,
        capture_id: `S02b:${s07Hash(await fs.readFile(S02B_FILE)).slice(0, 12)}:0`, json_path: '$' }];
    } else {
      const product = S02B_DOCUMENT.records[0];
      const name = { product_id: '79001', product_name: 'Synthetic video product' };
      const operation = kind === 'S02b-rank' ? 'kalodata.product.rank' : 'kalodata.product.detail';
      const named = await saveKalodataCapture(f, 0, operation,
        product.requestBody, { success: true, data: kind === 'S02b-rank' ? [name] : name });
      nameCapture = { captureId: `S02b:${f.runId}:0`, artifactSha256: named.sha256 };
      await saveKalodataCapture(f, 1, 'kalodata.video.rank', product.requestBody, product.response);
      load = () => loadKalodataVideosToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy);
      expected = [{ product_key: 'tiktok_shop:79001', source_kind: 'APP_CAPTURE', artifact_sha256: named.sha256,
        capture_id: null, json_path: kind === 'S02b-rank' ? '$.data[0]' : '$.data' }];
    }
    await load();
    const provenance = () => f.db.prepare(`SELECT product_key,source_kind,artifact_sha256,capture_id,json_path
      FROM product_name_source ORDER BY product_key`).all();
    assert.deepEqual(provenance(), expected, kind);
    if (nameCapture) {
      assert.equal(f.db.prepare('SELECT 1 FROM raw_capture WHERE capture_id=?').get(nameCapture.captureId), undefined, 'app name captures do not become raw_capture rows');
      const envelope = JSON.parse((await f.artifacts.read(nameCapture.artifactSha256)).toString('utf8'));
      const payload = JSON.parse(Buffer.from(envelope.responseBytesBase64, 'base64').toString('utf8'));
      assert.equal((Array.isArray(payload.data) ? payload.data[0] : payload.data).product_name, 'Synthetic video product', 'provenance artifact contains the actual name record');
    }
    const dates = f.db.prepare('SELECT recorded_at FROM product_name_source').all() as { recorded_at: string }[];
    for (const row of dates) assert.ok(Number.isFinite(Date.parse(row.recorded_at)), 'recorded_at is a real timestamp');
    assert.deepEqual(f.db.prepare("SELECT strict FROM pragma_table_list WHERE name='product_name_source'").get(), { strict: 1n });
    for (const sql of ["UPDATE product_name_source SET json_path='$'", 'DELETE FROM product_name_source']) {
      assert.throws(() => f.db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
      assert.deepEqual(provenance(), expected);
    }
    if (kind === 'S05') {
      // A real legacy product without provenance lets FK/CHECK guards run before any duplicate-key guard.
      f.db.prepare(`INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id)
        VALUES ('shopee:990','shopee','990','Synthetic constraint product',?)`).run(`S05:${f.source.packet.collectionId}:0`);
      const insertSource = f.db.prepare(`INSERT INTO product_name_source(product_key,source_kind,artifact_sha256,capture_id,json_path,recorded_at)
        VALUES (?,?,?,?,?,?)`);
      for (const [source, artifact, capture] of [
        ['OTHER', 'a'.repeat(64), null], ['METRIC_LIST', null, null],
        ['METRIC_LIST', 'a'.repeat(64), `S05:${f.source.packet.collectionId}:0`],
        ['APP_CAPTURE', null, null], ['APP_CAPTURE', 'a'.repeat(64), `S05:${f.source.packet.collectionId}:0`],
        ['RAW_CAPTURE', null, null], ['RAW_CAPTURE', 'a'.repeat(64), `S05:${f.source.packet.collectionId}:0`],
      ] as const) assert.throws(() => insertSource.run('shopee:990', source, artifact, capture, '$', AT), { code: 'SQLITE_CONSTRAINT_CHECK' });
      assert.throws(() => insertSource.run('shopee:missing', 'METRIC_LIST', 'a'.repeat(64), null, '$', AT), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
      assert.throws(() => insertSource.run('shopee:990', 'RAW_CAPTURE', null, 'missing-capture', '$', AT), { code: 'SQLITE_CONSTRAINT_FOREIGNKEY' });
      assert.throws(() => insertSource.run('shopee:990', 'METRIC_LIST', 'a'.repeat(64), null, null, AT), { code: 'SQLITE_CONSTRAINT_NOTNULL' });
      assert.throws(() => insertSource.run('shopee:990', 'METRIC_LIST', 'a'.repeat(64), null, '$', null), { code: 'SQLITE_CONSTRAINT_NOTNULL' });
      const first = expected[0]!;
      assert.throws(() => insertSource.run(first.product_key, first.source_kind, first.artifact_sha256, null, first.json_path, AT),
        { code: 'SQLITE_CONSTRAINT_PRIMARYKEY' });
    }
    historicalNameState(f.db);
    const before = databaseRows(f.db, ['product_name_source']);
    const replay = await load();
    const counters = kind === 'S05' || kind === 'S06'
      ? ['captures', 'products', 'reviewsInserted', 'reviewsAlreadyPresent', 'runReviewsInserted']
      : ['captures', 'videos', 'videosAlreadyPresent', 'snapshots', 'productsInserted'];
    for (const key of counters) assert.equal((replay as Record<string, unknown>)[key], 0, `${kind} replay ${key}`);
    assert.equal((replay as Record<string, unknown>).productNameSources, expected.length);
    assert.deepEqual(provenance(), expected, `${kind} must repair provenance even when its captures already exist`);
    assert.deepEqual(databaseRows(f.db, ['product_name_source']), before, 'only provenance may change');
    const repaired = databaseRows(f.db);
    await load();
    assert.deepEqual(databaseRows(f.db), repaired, 'repaired provenance is idempotent');
    historicalNameState(f.db, true);
    const mismatch = databaseRows(f.db);
    await assert.rejects(load(), /^Error: RAW_DB_PRODUCT_NAME_MISMATCH/, kind);
    assert.deepEqual(databaseRows(f.db), mismatch, 'name mismatch must not add even one capture or provenance row');
  }
});

test('RAWDB-P4 F4: 0071 backfills every source basis, restores immutability, and loaders declare their fingerprint representation', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const db = await beforeFieldFixes(t);
  const insert = db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome,response_sha256,raw_path)
    VALUES (?,?,?,?,?,'OK',?,?)`);
  for (const [id, source, provider, operation, rawPath] of BASIS_ROWS) {
    for (const digest of [null, 'a'.repeat(64)]) insert.run(`${id}-${digest === null ? 'none' : 'sha'}`, source, provider, operation, AT, digest, rawPath);
  }
  // Preserve actual dependent data through the populated upgrade, not just empty schema metadata.
  db.exec(`INSERT INTO product(product_key,platform,item_id,product_name,first_capture_id)
    VALUES ('shopee:901','shopee','901','Synthetic legacy product','s05-sha');
    INSERT INTO review(review_key,source_code,platform,kind,external_id,product_key,reviewer_name_state,collected_at,capture_id,source_position)
    VALUES ('S05:legacy','S05','shopee','product_review','legacy','shopee:901','not_provided','${AT}','s05-sha','row=0');
    INSERT INTO run_review(run_id,review_key,capture_id) VALUES ('synthetic-legacy-run','S05:legacy','s05-sha');`);
  const before = databaseRows(db), triggers = db.prepare("SELECT name,sql FROM sqlite_schema WHERE type='trigger' AND tbl_name='raw_capture' ORDER BY name").all() as { name: string; sql: string }[];
  assert.ok(applyMigrations(db).applied.includes(71));
  for (const [id, , , , , basis] of BASIS_ROWS) {
    assert.deepEqual(db.prepare('SELECT response_sha256_basis FROM raw_capture WHERE capture_id=?').get(`${id}-sha`), { response_sha256_basis: basis }, id);
    assert.deepEqual(db.prepare('SELECT response_sha256_basis FROM raw_capture WHERE capture_id=?').get(`${id}-none`), { response_sha256_basis: null }, id);
  }
  const after = databaseRows(db);
  assert.deepEqual((after.raw_capture as Record<string, unknown>[]).map(({ response_sha256_basis, ...row }) => row), before.raw_capture);
  for (const table of ['product', 'review', 'run_review']) assert.deepEqual(after[table], before[table]);
  assert.deepEqual(after.product_name_source, [], 'migration cannot infer provenance from unavailable artifacts');
  for (const trigger of triggers) assert.deepEqual(db.prepare('SELECT name,sql FROM sqlite_schema WHERE name=?').get(trigger.name), trigger);
  for (const sql of ["UPDATE raw_capture SET provider='changed'", 'DELETE FROM raw_capture']) {
    assert.throws(() => db.exec(sql), { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  }
  assert.throws(() => insert.run('synthetic-missing-basis', 'S05', 'shopee-public-review', 'shopee.public_reviews.listing', AT, 'b'.repeat(64), 'artifact:synthetic'),
    { code: 'SQLITE_CONSTRAINT_TRIGGER' });
  const newCapture = db.prepare(`INSERT INTO raw_capture(capture_id,source_code,provider,operation,requested_at,outcome,response_sha256,response_sha256_basis)
    VALUES (?,'S05','synthetic','synthetic',?,'OK',?,?)`);
  for (const basis of ['ORIGINAL_BYTES', 'RETAINED_ENVELOPE', 'CANONICAL_JSON', 'SUPPLIED_FILE']) newCapture.run(basis, AT, 'b'.repeat(64), basis);
  assert.throws(() => newCapture.run('bad-basis', AT, 'b'.repeat(64), 'UNKNOWN'), { code: 'SQLITE_CONSTRAINT_CHECK' });
  assert.deepEqual(db.pragma('foreign_key_check'), []);

  const f = await rawDbFixture(t), privacy = s07Privacy();
  const check = async (load: () => Promise<unknown>, source: string, basis: string, file: boolean) => {
    await load();
    const rows = f.db.prepare(`SELECT response_sha256_basis FROM raw_capture WHERE source_code=? AND response_sha256 IS NOT NULL
      AND raw_path LIKE ?`).all(source, file ? 'file:%' : 'artifact:%');
    assert.ok(rows.length > 0, `${source} ${file ? 'file' : 'run'} must create captures`);
    assert.ok(rows.every(row => (row as { response_sha256_basis: string }).response_sha256_basis === basis), `${source}: ${basis}`);
  };
  await check(() => loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId }), 'S05', 'RETAINED_ENVELOPE', false);
  await check(() => loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: f.runId }, privacy), 'S07', 'SUPPLIED_FILE', true);
  await check(() => loadKalodataVideosToDbV1(f.db, f.artifacts, { file: S02B_FILE, runId: f.runId }, privacy), 'S02b', 'SUPPLIED_FILE', true);
  const canonicalFile = path.join(f.root, 'synthetic-canonical-video.json');
  const canonicalRecord = { ...S02B_DOCUMENT.records[0], response: { success: true, data: [] },
    responseSha256: s07Hash('{"data":[],"success":true}') };
  await fs.writeFile(canonicalFile, JSON.stringify({ declare: { ...S02B_DOCUMENT.declare, responseSha256Basis: 'canonical-json' }, records: [canonicalRecord] }));
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file: canonicalFile, runId: f.runId }, privacy);
  assert.deepEqual(f.db.prepare('SELECT response_sha256_basis FROM raw_capture WHERE capture_id=?')
    .get(`S02b:${s07Hash(await fs.readFile(canonicalFile)).slice(0, 12)}:0`), { response_sha256_basis: 'CANONICAL_JSON' });
  await check(() => loadVideoReadingsToDbV1(f.db, f.artifacts, { file: S14_FILE, runId: f.runId }, privacy), 'S14', 'SUPPLIED_FILE', true);
  await check(() => loadSearchSuggestionsToDbV1(f.db, f.artifacts, { file: SUGGESTION_FILE.pathname, runId: f.runId }), 'S19b', 'CANONICAL_JSON', true);
  await saveGoogleCapture(f, 'google.suggest', ['synthetic jar', ['synthetic jar uses']], 90);
  await check(() => loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: f.runId }), 'S19b', 'ORIGINAL_BYTES', false);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 91);
  await check(() => loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId }), 'S29', 'ORIGINAL_BYTES', false);
  const overviewFile = path.join(f.root, 'synthetic-overview.json');
  await fs.writeFile(overviewFile, JSON.stringify({ declare: { formatVersion: 'kem-raw-v1', sourceCode: 'S29', keyword: 'synthetic jar' },
    records: [{ query: QUERY, requestedAt: AT, httpStatus: 200, aiOverviewState: 'inline', ai_overview: ANSWER }] }));
  await check(() => loadAiOverviewToDbV1(f.db, f.artifacts, { file: overviewFile, runId: f.runId }), 'S29', 'RETAINED_ENVELOPE', true);
  const video = S02B_DOCUMENT.records[0];
  await saveKalodataCapture(f, 92, 'kalodata.video.rank', video.requestBody, video.response);
  await saveKalodataCapture(f, 93, 'kalodata.product.detail', video.requestBody, { success: true,
    data: { product_id: '79001', product_name: 'Synthetic video product' } });
  await check(() => loadKalodataVideosToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy), 'S02b', 'ORIGINAL_BYTES', false);
  const tikTok = await tiktokFixture(t);
  await loadTikTokCommentsToDbV1(tikTok.db, tikTok.artifacts, { runId: tikTokRunId }, s07Privacy(tikTok.collector.privacyProfile.keyId));
  assert.deepEqual(tikTok.db.prepare('SELECT DISTINCT response_sha256_basis FROM raw_capture').all(), [{ response_sha256_basis: 'RETAINED_ENVELOPE' }]);
  const readings = await googleFixture(t);
  await saveVideoReadingRun(readings);
  await loadVideoReadingsToDbV1(readings.db, readings.artifacts, { runId: readings.runId }, privacy);
  assert.deepEqual(readings.db.prepare('SELECT DISTINCT response_sha256_basis FROM raw_capture').all(), [{ response_sha256_basis: 'ORIGINAL_BYTES' }]);
  const shop = await s06Fixture(t);
  await loadTikTokShopReviewsToDbV1(shop.db, shop.artifacts, { runId: shop.runId });
  assert.deepEqual(shop.db.prepare('SELECT DISTINCT response_sha256_basis FROM raw_capture').all(), [{ response_sha256_basis: 'ORIGINAL_BYTES' }]);
});

test('RAWDB-P4 F5: source-specific attribute shapes reject invalid/unknown inputs and roll back a verified load', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  // Dynamic import keeps the other contract rows runnable before this new module lands.
  const modulePath = '../../src/modules/raw-db/attributes-shape.js';
  const { assertAttributesShape } = await import(modulePath) as { assertAttributesShape: (sourceCode: string, attributesJson: string | null) => void };
  for (const [source, value] of [
    ['S05', null], ['S05', '["Synthetic material"]'], ['S06', null],
    ['S07', '{"textForm":"SANITIZED"}'],
    ['S07', '{"textForm":"SANITIZED","byVideoAuthor":true,"likedByAuthor":false,"pinnedByAuthor":true,"exclusionReason":"REPLY"}'],
  ] as const) assert.doesNotThrow(() => assertAttributesShape(source, value));
  for (const [source, value] of [
    ['S05', '{}'], ['S05', '[""]'], ['S05', '[1]'], ['S05', 'not json'],
    ['S06', '[]'], ['S07', '[]'], ['S07', '{}'], ['S07', '{"textForm":"RAW"}'],
    ['S07', '{"textForm":"SANITIZED","byVideoAuthor":"yes"}'], ['S99', null],
  ] as const) assert.throws(() => assertAttributesShape(source, value), /^Error: RAW_DB_ATTRIBUTES_SHAPE/, `${source}: ${value}`);
  const f = await rawDbFixture(t);
  const source = await f.saveRun(false, collected => editPublicRows(collected, (row, i) => {
    if (i === 2) row.attributes = ['']; // Last row: prior products/captures/reviews must roll back too.
  }));
  await f.foundation.readPublicExact(source.source.packet.collectionId); // Prove the source reader accepts this shape.
  const before = databaseRows(f.db);
  await assert.rejects(loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: source.runId }), /^Error: RAW_DB_ATTRIBUTES_SHAPE/);
  assert.deepEqual(databaseRows(f.db), before);
});

test('RAWDB-P4 F6: the raw-file checker accepts S02b and alsoCovers while rejecting neighboring invalid codes', async t => {
  const root = await temporaryDirectory(t);
  const file = path.join(root, '02-S02b-synthetic.json');
  // Python defines recordsSha256 over json.dumps(..., sort_keys=True), including its default spaces.
  const records = [{ operation: 'synthetic.op', response: { value: 1 } }];
  const document = { declare: {
    formatVersion: 'raw-v1', sourceCode: 'S02b', alsoCovers: ['S02b'], sourceName: 'Synthetic ranked videos',
    provider: 'synthetic', reportName: 'Synthetic video observations', grade: 'B', usedBy: ['MARKET'], usedFor: 'Synthetic checker contract',
    evidenceFamily: 'seller_statement', keyword: 'synthetic jar', productTopic: 'synthetic jar', country: 'VN', timezone: 'Asia/Ho_Chi_Minh',
    origin: { method: 'FRESH_PULL_FOR_TEST_SET' }, period: { startDate: '2026-09-01', endDate: '2026-09-30', timezone: 'Asia/Ho_Chi_Minh', basis: 'synthetic' },
    recordShape: 'synthetic call', limits: [], recordCount: 1,
    recordsSha256: s07Hash('[{"operation": "synthetic.op", "response": {"value": 1}}]'),
  }, records };
  const validator = new URL('../../data/raw-sources/tools/validate_raw.py', import.meta.url);
  for (const [code, alsoCovers, status] of [
    ['S02b', ['S02b'], 0], ['S02', ['S02b'], 0], ['S02c', [], 1], ['S02bb', [], 1], ['S99', [], 1], ['S02b', ['S02c'], 1],
  ] as const) {
    await fs.writeFile(file, JSON.stringify({ ...document, declare: { ...document.declare, sourceCode: code, alsoCovers } }));
    const child = spawnSync(process.env.TDN_PYTHON ?? 'python3', [validator.pathname, root], { encoding: 'utf8', timeout: 10_000 });
    assert.equal(child.error, undefined);
    assert.equal(child.status, status, `${code} / ${JSON.stringify(alsoCovers)}: ${child.stderr}${child.stdout}`);
    assert.match(child.stdout, status === 0 ? /^OK / : /^FAIL /);
    if (code === 'S99') assert.match(child.stdout, /sourceCode.*S02b/, 'invalid-source guidance must list the newly supported code');
  }
});
