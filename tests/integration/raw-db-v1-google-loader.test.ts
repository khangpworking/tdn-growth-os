import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { ArtifactIntegrityError } from '../../src/platform/artifacts/artifact-store.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { ANSWER, QUERY, RETRIEVED_AT, SUGGESTION_FILE, googleFixture, saveGoogleCapture, snapshot, suggestionFile } from '../fixtures/raw-db-v1-google.js';

const hash = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

test('RAWDB-G L2: run suggestions retain prefix, one-based rank, capture provenance and zero cost; empty stays EMPTY', async t => {
  const f = await googleFixture(t);
  const stored = await saveGoogleCapture(f, 'google.suggest', ['synthetic jar đ', ['first suggestion', 'second suggestion']], 0);
  await saveGoogleCapture(f, 'google.suggest', ['synthetic jar e', []], 1);
  const result = await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: f.runId });
  assert.equal(result.captures, 2);
  assert.equal(result.rows, 2);
  const captureId = `S19b:${f.runId}:0`;
  assert.deepEqual(f.db.prepare('SELECT * FROM search_suggestion ORDER BY rank').all(), [
    { prefix: 'synthetic jar đ', rank: 1n, suggestion: 'first suggestion', collected_at: RETRIEVED_AT, capture_id: captureId },
    { prefix: 'synthetic jar đ', rank: 2n, suggestion: 'second suggestion', collected_at: RETRIEVED_AT, capture_id: captureId },
  ]);
  assert.deepEqual(f.db.prepare(`SELECT capture_id,source_code,provider,operation,keyword,requested_at,completed_at,
    http_status,outcome,cost_unit,cost_amount,response_sha256,raw_path FROM raw_capture WHERE capture_id=?`).get(captureId), {
    capture_id: captureId, source_code: 'S19b', provider: 'google-suggest', operation: 'google.suggest', keyword: 'synthetic jar',
    requested_at: RETRIEVED_AT, completed_at: RETRIEVED_AT, http_status: 200n, outcome: 'OK', cost_unit: 'USD', cost_amount: 0,
    response_sha256: stored.sha256, raw_path: `artifact:${stored.sha256}`,
  });
  assert.deepEqual(f.db.prepare('SELECT capture_id,outcome FROM raw_capture WHERE capture_id=?').get(`S19b:${f.runId}:1`),
    { capture_id: `S19b:${f.runId}:1`, outcome: 'EMPTY' });
});

test('RAWDB-G L3: kem-raw-v1 file maps records, base keyword and failed HTTP without suggestion rows', async t => {
  const f = await googleFixture(t);
  const { bytes, value } = await suggestionFile();
  const file = fileURLToPath(SUGGESTION_FILE);
  const prefix = `S19b:${hash(bytes).slice(0, 12)}`;
  const result = await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { file, runId: 'synthetic-file-run' });
  assert.equal(result.captures, 3);
  assert.equal(result.rows, 3);
  assert.deepEqual(f.db.prepare('SELECT capture_id,prefix,rank,suggestion,collected_at FROM search_suggestion ORDER BY capture_id,rank').all(), [
    { capture_id: `${prefix}:0`, prefix: 'synthetic jar đ', rank: 1n, suggestion: 'synthetic jar đ one', collected_at: RETRIEVED_AT },
    { capture_id: `${prefix}:0`, prefix: 'synthetic jar đ', rank: 2n, suggestion: 'synthetic jar đ two', collected_at: RETRIEVED_AT },
    { capture_id: `${prefix}:2`, prefix: 'unrelated term', rank: 1n, suggestion: 'unrelated suggestion', collected_at: '2026-11-03T08:00:02+07:00' },
  ]);
  const captures = f.db.prepare('SELECT capture_id,keyword,http_status,outcome,response_sha256,raw_path FROM raw_capture ORDER BY capture_id').all();
  assert.deepEqual(captures, value.records.map((record, i) => ({
    capture_id: `${prefix}:${i}`, keyword: i === 2 ? null : 'synthetic jar', http_status: BigInt(record.httpStatus),
    outcome: i === 1 ? 'FAILED' : 'OK', response_sha256: hash(JSON.stringify(record.raw)),
    raw_path: `file:${path.relative(process.cwd(), file).split(path.sep).join('/')}#${i}`,
  })));
});

test('RAWDB-G L4: inline AI Overview flattens each list item in answer order with its own references and snippet', async t => {
  const f = await googleFixture(t);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 0);
  const result = await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId });
  const captureId = `S29:${f.runId}:COLLECTION:0`;
  assert.equal(result.captures, 1);
  assert.equal(result.rows, 4, 'heading + paragraph + two independent list items');
  assert.equal(result.references, 2);
  assert.deepEqual(f.db.prepare('SELECT * FROM ai_overview_block ORDER BY block_seq').all(), [
    { query: QUERY, block_seq: 0n, block_type: 'heading', text: 'Synthetic heading', reference_indexes: null, capture_id: captureId },
    { query: QUERY, block_seq: 1n, block_type: 'paragraph', text: 'Synthetic paragraph', reference_indexes: '[7]', capture_id: captureId },
    { query: QUERY, block_seq: 2n, block_type: 'list_item', text: 'Synthetic first item', reference_indexes: '[7,3]', capture_id: captureId },
    { query: QUERY, block_seq: 3n, block_type: 'list_item', text: 'Synthetic second item', reference_indexes: '[3]', capture_id: captureId },
  ]);
  assert.deepEqual(f.db.prepare('SELECT * FROM ai_overview_reference ORDER BY ref_index').all(), [
    { query: QUERY, ref_index: 3n, title: 'Synthetic source B', link: 'https://example.test/b', site: 'Example B', snippet: 'Exact reference B snippet', capture_id: captureId },
    { query: QUERY, ref_index: 7n, title: 'Synthetic source A', link: 'https://example.test/a', site: 'Example A', snippet: 'Exact reference A snippet', capture_id: captureId },
  ]);
});

test('RAWDB-G L5: token-only answers use only a matching follow-up; an unfetched token is NOT_COLLECTED', async t => {
  const f = await googleFixture(t);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: { page_token: 'synthetic-matched' } }, 0);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: 'unfetched query' }, ai_overview: { page_token: 'synthetic-unfetched' } }, 1);
  await saveGoogleCapture(f, 'serpapi.google_ai_overview', { search_parameters: { page_token: 'synthetic-other' }, ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'Wrong token' }] } }, 2);
  await saveGoogleCapture(f, 'serpapi.google_ai_overview', { search_parameters: { page_token: 'synthetic-matched' }, ai_overview: { text_blocks: [{ type: 'paragraph', snippet: 'Matched follow-up' }] } }, 3);
  const result = await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId });
  assert.equal(result.captures, 2);
  assert.equal(result.rows, 1);
  assert.equal(result.notCollected, 1);
  assert.deepEqual(f.db.prepare('SELECT query,text,capture_id FROM ai_overview_block').all(),
    [{ query: QUERY, text: 'Matched follow-up', capture_id: `S29:${f.runId}:COLLECTION:0` }]);
  const rows = f.db.prepare('SELECT capture_id,operation,outcome,billing,cost_amount,request_params_json FROM raw_capture ORDER BY capture_id').all() as {
    capture_id: string; operation: string; outcome: string; billing: string; cost_amount: null; request_params_json: string;
  }[];
  assert.deepEqual(rows.map(({ request_params_json, ...r }) => r), [
    { capture_id: `S29:${f.runId}:COLLECTION:0`, operation: 'serpapi.google_ai_overview', outcome: 'OK', billing: 'PAID_SEARCH_UNLESS_CACHED', cost_amount: null },
    { capture_id: `S29:${f.runId}:COLLECTION:1`, operation: 'serpapi.google.search', outcome: 'NOT_COLLECTED', billing: 'PAID_SEARCH_UNLESS_CACHED', cost_amount: null },
  ]);
  assert.equal(JSON.parse(rows[0]!.request_params_json).query, QUERY);
  assert.equal(JSON.parse(rows[0]!.request_params_json).pageTokenPresent, true);
  assert.equal(JSON.parse(rows[1]!.request_params_json).query, 'unfetched query');
});

test('RAWDB-G L6: an unknown block after a valid answer rejects the whole load without writes', async t => {
  const f = await googleFixture(t);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 0);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: 'bad answer' }, ai_overview: { text_blocks: [{ type: 'table', snippet: 'Unknown block' }] } }, 1);
  const before = snapshot(f.db);
  await assert.rejects(loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId }), /RAW_DB_AIO_UNKNOWN_BLOCK/);
  assert.deepEqual(snapshot(f.db), before);
});

test('RAWDB-G L7: both run loaders and the file loader are mutation-free with all-zero counts on second load', async t => {
  const f = await googleFixture(t);
  await saveGoogleCapture(f, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  for (const [load, input] of [
    [loadSearchSuggestionsToDbV1, { runId: f.runId }],
    [loadAiOverviewToDbV1, { runId: f.runId }],
    [loadSearchSuggestionsToDbV1, { runId: 'synthetic-file-run', file: fileURLToPath(SUGGESTION_FILE) }],
  ] as const) {
    const first = await load(f.db, f.artifacts, input);
    assert.ok(first.rows > 0, 'positive control: the first load inserted rows');
    const before = snapshot(f.db);
    const result = await load(f.db, f.artifacts, input);
    assert.equal(result.runId, input.runId);
    assert.equal(result.captures, 0);
    assert.equal(result.rows, 0);
    assert.equal(result.alreadyPresent, 0);
    for (const field of ['references', 'notCollected'] as const) if (result[field] !== undefined) assert.equal(result[field], 0, field);
    assert.deepEqual(snapshot(f.db), before);
  }
});

test('RAWDB-G L8: a tampered later artifact fails verified reading without changing any Google or raw_capture rows', async t => {
  for (const operation of ['google.suggest', 'serpapi.google.search'] as const) {
    const f = await googleFixture(t);
    await saveGoogleCapture(f, 'google.suggest', ['synthetic jar stored', ['already stored suggestion']], 0);
    await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: 'already stored query' }, ai_overview: ANSWER }, 1);
    await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: f.runId });
    await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId });
    const body = operation === 'google.suggest' ? ['synthetic jar', ['valid first']] : { search_parameters: { q: QUERY }, ai_overview: ANSWER };
    await saveGoogleCapture(f, operation, body, 2);
    const stored = await saveGoogleCapture(f, operation, operation === 'google.suggest'
      ? ['synthetic jar a', ['valid second']] : { search_parameters: { q: 'second query' }, ai_overview: ANSWER }, 3);
    await fs.writeFile(stored.absolutePath, '{}');
    const before = snapshot(f.db);
    const load = operation === 'google.suggest' ? loadSearchSuggestionsToDbV1 : loadAiOverviewToDbV1;
    await assert.rejects(load(f.db, f.artifacts, { runId: f.runId }), ArtifactIntegrityError);
    assert.deepEqual(snapshot(f.db), before);
  }
});

test('RAWDB-G L9: CLI S19b --file --dry-run prints insertion counts and leaves the database unchanged', async t => {
  const f = await googleFixture(t);
  const before = snapshot(f.db);
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts', '--source', 'S19b',
    '--run', 'synthetic-file-run', '--file', fileURLToPath(SUGGESTION_FILE), '--db', f.databasePath, '--artifacts', f.artifactRoot, '--dry-run'],
  { encoding: 'utf8', timeout: 30_000, env: { ...process.env, TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot } });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  const receipt = JSON.parse(child.stdout.trim());
  assert.equal(receipt.runId, 'synthetic-file-run');
  assert.equal(receipt.captures, 3);
  assert.equal(receipt.rows, 3);
  assert.equal(receipt.alreadyPresent, 0);
  assert.deepEqual(snapshot(f.db), before);
});

test('RAWDB-G L10: Google loads preserve nonempty S05 rows, writer_count and existing S05 table definitions', async t => {
  const f = await rawDbFixture(t);
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const tables = ['product', 'review', 'run_review', 'writer_count'];
  const s05 = () => ({ ...snapshot(f.db, tables.filter(x => x !== 'writer_count')),
    writer_count: f.db.prepare('SELECT * FROM writer_count ORDER BY product_key').all(),
    raw_capture: f.db.prepare("SELECT * FROM raw_capture WHERE source_code='S05' ORDER BY capture_id").all(),
    schema: f.db.prepare("SELECT name,sql FROM sqlite_schema WHERE tbl_name IN ('product','review','run_review','raw_capture','writer_count') ORDER BY name").all() });
  const before = s05();
  assert.ok(f.db.prepare('SELECT * FROM review').all().length > 0);
  await saveGoogleCapture(f, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  await saveGoogleCapture(f, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  assert.ok((await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: f.runId })).rows > 0);
  assert.ok((await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: f.runId })).rows > 0);
  assert.deepEqual(s05(), before);
});
