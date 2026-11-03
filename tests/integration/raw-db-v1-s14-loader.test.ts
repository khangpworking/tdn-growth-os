import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { afterEach, beforeEach, mock } from 'node:test';
import { loadVideoReadingsToDbV1 } from '../../src/modules/raw-db/video-reading-loader.js';
import { loadKalodataVideosToDbV1 } from '../../src/modules/raw-db/kalodata-video-loader.js';
import { loadTikTokCommentsToDbV1 } from '../../src/modules/raw-db/tiktok-comments-loader.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { ANSWER, QUERY, googleFixture, saveGoogleCapture, snapshot } from '../fixtures/raw-db-v1-google.js';
import { S02B_FILE, S02B_RUN, S02B_URLS } from '../fixtures/raw-db-v1-s02b.js';
import { S07_FILE, S07_RUN, S07_URLS, s07AuthorKey, s07Fixture, s07Hash, s07Privacy } from '../fixtures/raw-db-v1-s07.js';
import { S14_CALLS, S14_DOCUMENT, S14_FILE, S14_READINGS, S14_RECEIPT, S14_RUN, s14CapturePrefix, saveVideoReadingRun } from '../fixtures/raw-db-v1-s14.js';
import { startRun } from '../helpers/autorun-harness.js';

const input = { file: S14_FILE, runId: S14_RUN };
const zero = (runId: string) => ({ runId, captures: 0, readings: 0, readingsAlreadyPresent: 0, videosInserted: 0, segments: 0 });
const tables = ['raw_capture', 'video', 'video_reading', 'video_segment'] as const;
beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());
const expectedSegments = (native: string, model: string) => [
  { capture_id: native, segment_type: 'speech', seq: 0n, start_s: 1, end_s: 3.5, text: '  Lời giả lập 😀 @synthetic_mention\r\nCafe\u0301  ' },
  { capture_id: native, segment_type: 'speech', seq: 1n, start_s: 5.25, end_s: 7.75, text: 'Không khẳng định tác dụng; còn thiếu dữ liệu.' },
  { capture_id: model, segment_type: 'on_screen', seq: 0n, start_s: 0, end_s: 2, text: '  Nhãn giả lập 🧴\r\n100%?  ' },
  { capture_id: model, segment_type: 'on_screen', seq: 1n, start_s: 0.5, end_s: 3, text: 'Giá giả lập: 0 ₫' },
  { capture_id: model, segment_type: 'speech', seq: 0n, start_s: 1, end_s: 3.5, text: 'Giọng đọc giả lập: tiếng Việt 🧪' },
  { capture_id: model, segment_type: 'speech', seq: 1n, start_s: 5.25, end_s: 7.75, text: '  Dòng thứ hai\nkhông đổi chữ.  ' },
];
const segments = (db: Parameters<typeof snapshot>[0]) => db.prepare('SELECT * FROM video_segment ORDER BY capture_id,segment_type,seq').all();

test('RAWDB-W W3: kem-raw-v1 maps each call, both caption sources, exact text bytes and UNKNOWN videos', async t => {
  const f = await s07Fixture(t), prefix = await s14CapturePrefix();
  assert.deepEqual(await loadVideoReadingsToDbV1(f.db, f.artifacts, input, f.privacy), S14_RECEIPT);
  assert.deepEqual(f.db.prepare('SELECT * FROM video_reading ORDER BY capture_id').all(), [
    { capture_id: `${prefix}:1`, video_url: S14_READINGS[0]!.video.videoUrl, origin: 'SELECTION', duration_s: 12.5,
      caption_source: 'NATIVE_SUBTITLE', model_id: 'gemini-synthetic-raw-s14', media_sha256: 'e'.repeat(64), media_bytes: 123n, read_at: '2026-11-03T01:00:00+07:00' },
    { capture_id: `${prefix}:3`, video_url: S14_READINGS[1]!.video.videoUrl, origin: 'EXPANDED_SEARCH', duration_s: 20.25,
      caption_source: 'MODEL_TRANSCRIBED', model_id: 'gemini-synthetic-raw-s14', media_sha256: 'f'.repeat(64), media_bytes: 456n, read_at: '2026-11-03T02:00:00+07:00' },
  ], 'off-product OTHER readings are retained without storing those judgements');
  assert.deepEqual(segments(f.db), expectedSegments(`${prefix}:1`, `${prefix}:3`));
  const captures = f.db.prepare(`SELECT capture_id,run_id,source_code,provider,operation,request_params_json,requested_at,
    completed_at,http_status,outcome,billing,cost_amount,response_sha256,raw_path FROM raw_capture ORDER BY capture_id`).all() as Record<string, unknown>[];
  assert.deepEqual(captures.map(({ request_params_json, ...row }) => row), [1, 3].map((recordIndex, i) => ({
    capture_id: `${prefix}:${recordIndex}`, run_id: S14_RUN, source_code: 'S14', provider: 'gemini', operation: 'videowatch.generate',
    requested_at: `2026-11-03T0${i + 1}:00:01Z`, completed_at: `2026-11-03T0${i + 1}:00:02Z`, http_status: 200n,
    outcome: 'OK', billing: 'PAID_CREDITS', cost_amount: null, response_sha256: ['a', 'b'][i]!.repeat(64),
    raw_path: `file:tests/fixtures/raw-db-v1-s14.synthetic.json#${recordIndex}`,
  })));
  assert.deepEqual(captures.map(c => JSON.parse(c.request_params_json as string)), S14_CALLS.map(c => c.requestParameters));
  assert.deepEqual(f.db.prepare('SELECT video_url,video_id,platform,product_key,link_basis FROM video ORDER BY video_id').all(),
    S14_READINGS.map(r => ({ video_url: r.video.videoUrl, video_id: r.video.videoId, platform: 'tiktok', product_key: null, link_basis: 'UNKNOWN' })));
  const authors = f.db.prepare('SELECT author_key FROM video').all() as { author_key: string }[];
  for (const row of authors) assert.match(row.author_key, /^[0-9a-f]{64}$/);
});

test('RAWDB-W W4: response digest pairs readings regardless of record order; unmatched reading rolls back the whole load', async t => {
  const f = await s07Fixture(t), changed = structuredClone(S14_DOCUMENT);
  [changed.records[1], changed.records[3]] = [changed.records[3]!, changed.records[1]!];
  const file = path.join(f.root, 'reordered-s14.json');
  await fs.writeFile(file, JSON.stringify(changed));
  const prefix = `S14:${s07Hash(await fs.readFile(file)).slice(0, 12)}`;
  await loadVideoReadingsToDbV1(f.db, f.artifacts, { file, runId: S14_RUN }, f.privacy);
  assert.deepEqual(f.db.prepare(`SELECT r.capture_id,r.caption_source,c.response_sha256
    FROM video_reading r JOIN raw_capture c USING(capture_id) ORDER BY r.capture_id`).all(), [
    { capture_id: `${prefix}:1`, caption_source: 'MODEL_TRANSCRIBED', response_sha256: 'b'.repeat(64) },
    { capture_id: `${prefix}:3`, caption_source: 'NATIVE_SUBTITLE', response_sha256: 'a'.repeat(64) },
  ]);
  const invalid = structuredClone(S14_DOCUMENT);
  invalid.records[2]!.files![0]!.content.model.responseSha256 = '0'.repeat(64);
  await fs.writeFile(file, JSON.stringify(invalid));
  const before = f.db.serialize();
  await assert.rejects(loadVideoReadingsToDbV1(f.db, f.artifacts, { file, runId: S14_RUN }, f.privacy), /^Error: RAW_DB_S14_INVALID_ROW/);
  assert.deepEqual(f.db.serialize(), before, 'valid earlier reading and calls must not partially publish');
});

test('RAWDB-W W5: creator keys equal S07 handle HMAC; missing key fails before opening input', async t => {
  const f = await s07Fixture(t), before = f.db.serialize();
  await assert.rejects(loadVideoReadingsToDbV1(f.db, f.artifacts, { file: path.join(f.root, 'absent.json'), runId: S14_RUN }, undefined),
    /^Error: RAW_DB_PRIVACY_KEY_MISSING/);
  assert.deepEqual(f.db.serialize(), before);
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, f.privacy);
  await loadVideoReadingsToDbV1(f.db, f.artifacts, input, f.privacy);
  const key = (url: string) => (f.db.prepare('SELECT author_key FROM video WHERE video_url=?').get(url) as { author_key: string }).author_key;
  assert.equal(key(S14_READINGS[0]!.video.videoUrl), s07AuthorKey('video-author-handle', 'synthetic_creator_a'));
  assert.equal(key(S14_READINGS[0]!.video.videoUrl), key(S07_URLS[0]!), 'same handle on different videos shares the S07 identity');
  assert.equal(key(S14_READINGS[1]!.video.videoUrl), s07AuthorKey('video-author-handle', 'synthetic_reading_b'));
});

test('RAWDB-W W6: same video id reuses the immutable S02b link; run TOP_SELLING requires S02b first with no writes', async t => {
  const f = await googleFixture(t), privacy = s07Privacy();
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file: S02B_FILE, runId: S02B_RUN }, privacy);
  const original = f.db.prepare('SELECT * FROM video WHERE video_id=?').get('1001');
  const file = path.join(f.root, 'existing-s02b-video.json'), changed = structuredClone(S14_DOCUMENT);
  changed.records[0]!.files![0]!.content.video.videoId = '1001';
  changed.records[0]!.files![0]!.content.video.videoUrl = 'https://www.tiktok.com/@synthetic_later_handle/video/1001';
  await fs.writeFile(file, JSON.stringify(changed));
  const loaded = await loadVideoReadingsToDbV1(f.db, f.artifacts, { file, runId: S14_RUN }, privacy);
  assert.equal(loaded.videosInserted, 1);
  assert.deepEqual(f.db.prepare('SELECT * FROM video WHERE video_id=?').get('1001'), original);
  assert.deepEqual(f.db.prepare('SELECT product_key,link_basis FROM video WHERE video_id=?').get('1001'),
    { product_key: 'tiktok_shop:79001', link_basis: 'PROVIDER_LINK' });
  assert.deepEqual(f.db.prepare('SELECT video_url FROM video_reading WHERE caption_source=?').all('NATIVE_SUBTITLE'), [{ video_url: S02B_URLS[0] }]);
  const fresh = await googleFixture(t), readings = structuredClone(S14_READINGS);
  readings[1]!.video.origin = 'TOP_SELLING';
  readings[1]!.video.videoId = '81002'; readings[1]!.video.videoUrl = S02B_URLS[1];
  await saveVideoReadingRun(fresh, readings);
  const before = fresh.db.serialize();
  await assert.rejects(loadVideoReadingsToDbV1(fresh.db, fresh.artifacts, { runId: fresh.runId }, privacy),
    /^Error: RAW_DB_S14_LOAD_S02B_FIRST:.*S02b/);
  assert.deepEqual(fresh.db.serialize(), before);
  await loadKalodataVideosToDbV1(fresh.db, fresh.artifacts, { file: S02B_FILE, runId: S02B_RUN }, privacy);
  const linked = fresh.db.prepare('SELECT * FROM video WHERE video_id=?').get('81002');
  assert.equal((await loadVideoReadingsToDbV1(fresh.db, fresh.artifacts, { runId: fresh.runId }, privacy)).readings, 2);
  assert.deepEqual(fresh.db.prepare('SELECT * FROM video WHERE video_id=?').get('81002'), linked);
});

test('RAWDB-W W7: exact file/run retries count zero; the same video in another run adds a reading', async t => {
  const f = await googleFixture(t), privacy = s07Privacy();
  await loadVideoReadingsToDbV1(f.db, f.artifacts, input, privacy);
  const fileRows = snapshot(f.db, tables);
  assert.deepEqual(await loadVideoReadingsToDbV1(f.db, f.artifacts, input, privacy), zero(S14_RUN));
  assert.deepEqual(snapshot(f.db, tables), fileRows);
  await saveVideoReadingRun(f);
  assert.deepEqual(await loadVideoReadingsToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy), { ...S14_RECEIPT, runId: f.runId, videosInserted: 0 });
  const first = snapshot(f.db, tables);
  assert.deepEqual(await loadVideoReadingsToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy), zero(f.runId));
  assert.deepEqual(snapshot(f.db, tables), first);
  const secondRun = await startRun(f.service, ['INSIGHT']);
  const stored = await saveVideoReadingRun({ ...f, runId: secondRun });
  assert.deepEqual(await loadVideoReadingsToDbV1(f.db, f.artifacts, { runId: secondRun }, privacy), { ...S14_RECEIPT, runId: secondRun, videosInserted: 0 });
  assert.deepEqual(f.db.prepare('SELECT * FROM video ORDER BY rowid').all(), fileRows.video);
  for (const [index, reading] of S14_READINGS.entries()) {
    const rows = f.db.prepare('SELECT capture_id FROM video_reading WHERE video_url=? ORDER BY capture_id').all(reading.video.videoUrl) as { capture_id: string }[];
    assert.equal(rows.length, 3, 'file plus two different runs retain three independent readings of the video');
    assert.ok(rows.some(row => row.capture_id === `S14:${secondRun}:${stored[index]!.ordinal}`));
  }
});

test('RAWDB-W W8: verified run packages and captures map rows; tampering fails verification; no readings is not found', async t => {
  const f = await googleFixture(t), privacy = s07Privacy(), stored = await saveVideoReadingRun(f);
  assert.deepEqual(await loadVideoReadingsToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy), { ...S14_RECEIPT, runId: f.runId });
  assert.deepEqual(f.db.prepare('SELECT video_url,video_id,platform,product_key,link_basis,author_key FROM video ORDER BY video_id').all(),
    S14_READINGS.map((reading, index) => ({ video_url: reading.video.videoUrl, video_id: reading.video.videoId, platform: 'tiktok',
      product_key: null, link_basis: 'UNKNOWN', author_key: s07AuthorKey('video-author-handle', index === 0 ? 'synthetic_creator_a' : 'synthetic_reading_b') })));
  const ids = stored.map(s => `S14:${f.runId}:${s.ordinal}`);
  assert.deepEqual(segments(f.db), expectedSegments(ids[0]!, ids[1]!));
  assert.deepEqual(f.db.prepare('SELECT * FROM video_reading ORDER BY capture_id').all(), stored.map((s, index) => ({
    capture_id: ids[index], video_url: S14_READINGS[index]!.video.videoUrl, origin: S14_READINGS[index]!.video.origin,
    duration_s: index === 0 ? 12.5 : 20.25, caption_source: index === 0 ? 'NATIVE_SUBTITLE' : 'MODEL_TRANSCRIBED',
    model_id: 'gemini-synthetic-raw-s14', media_sha256: (index === 0 ? 'e' : 'f').repeat(64), media_bytes: index === 0 ? 123n : 456n,
    read_at: index === 0 ? '2026-11-03T01:00:00+07:00' : '2026-11-03T02:00:00+07:00',
  })));
  const captures = f.db.prepare(`SELECT capture_id,run_id,source_code,provider,operation,request_params_json,requested_at,
    completed_at,http_status,outcome,billing,cost_amount,response_sha256,raw_path FROM raw_capture ORDER BY capture_id`).all() as Record<string, unknown>[];
  assert.deepEqual(captures.map(({ request_params_json, ...row }) => row), stored.map((s, index) => ({ capture_id: ids[index], run_id: f.runId, source_code: 'S14', provider: 'gemini',
    operation: 'videowatch.generate', requested_at: s.capture.requestedAt,
    completed_at: s.capture.completedAt, http_status: 200n, outcome: 'OK', billing: 'PAID_CREDITS', cost_amount: null,
    response_sha256: s.capture.responseSha256, raw_path: `artifact:${s.stored.sha256}` })));
  assert.deepEqual(captures.map(c => JSON.parse(c.request_params_json as string)), stored.map(s => s.capture.requestParameters));
  const cold = await googleFixture(t), coldStored = await saveVideoReadingRun(cold);
  const packages = new SourcePackageService({ db: cold.db, artifactStore: cold.artifacts });
  const pkg = await packages.readVerified(coldStored[1]!.ref.packageId), member = pkg.files[0]!;
  await fs.writeFile(cold.artifacts.pathForDigest(member.sha256), Buffer.alloc(member.bytes.length, 32));
  let readerError: Error | undefined;
  try { await packages.readVerified(coldStored[1]!.ref.packageId); }
  catch (error) { assert.ok(error instanceof Error); readerError = error; }
  assert.ok(readerError, 'same-size tampering must fail in the real verified package reader');
  const before = cold.db.serialize();
  await assert.rejects(loadVideoReadingsToDbV1(cold.db, cold.artifacts, { runId: cold.runId }, privacy),
    /^Error: RAW_DB_ARTIFACT_MISMATCH/);
  assert.deepEqual(cold.db.serialize(), before, 'no valid earlier package or capture is partially published');
  const absent = await googleFixture(t);
  await saveGoogleCapture(absent, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  const noReadings = absent.db.serialize();
  for (const runId of [absent.runId, 'synthetic-absent-run']) {
    await assert.rejects(loadVideoReadingsToDbV1(absent.db, absent.artifacts, { runId }, privacy), /^Error: RAW_DB_RUN_NOT_FOUND/);
    assert.deepEqual(absent.db.serialize(), noReadings);
  }
});

test('RAWDB-W W10: S14 preserves populated S05, Google, S07, S02b rows, views and schema', async t => {
  const f = await rawDbFixture(t), privacy = s07Privacy();
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const googleRun = await startRun(f.service, ['INSIGHT']);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, privacy);
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file: S02B_FILE, runId: S02B_RUN }, privacy);
  const preserved = ['product', 'review', 'run_review', 'search_suggestion', 'ai_overview_block', 'ai_overview_reference', 'video_snapshot', 'video'];
  const before = snapshot(f.db, [...preserved, 'raw_capture']);
  for (const rows of Object.values(before)) assert.ok(rows.length > 0, 'preservation fixtures must be populated');
  const writers = f.db.prepare('SELECT * FROM writer_count ORDER BY product_key').all();
  assert.ok(writers.length > 0);
  const schema = f.db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all();
  await loadVideoReadingsToDbV1(f.db, f.artifacts, input, privacy);
  assert.deepEqual(snapshot(f.db, preserved.filter(table => table !== 'video')),
    Object.fromEntries(preserved.filter(table => table !== 'video').map(table => [table, before[table]])));
  assert.deepEqual(f.db.prepare("SELECT * FROM raw_capture WHERE source_code<>'S14' ORDER BY rowid").all(), before.raw_capture);
  assert.deepEqual(f.db.prepare("SELECT * FROM video WHERE capture_id IN (SELECT capture_id FROM raw_capture WHERE source_code<>'S14') ORDER BY rowid").all(), before.video);
  assert.deepEqual(f.db.prepare('SELECT * FROM writer_count ORDER BY product_key').all(), writers);
  assert.deepEqual(f.db.prepare('SELECT type,name,tbl_name,sql FROM sqlite_schema ORDER BY type,name').all(), schema);
});
