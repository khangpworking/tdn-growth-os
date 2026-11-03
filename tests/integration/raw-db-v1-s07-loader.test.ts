import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { loadTikTokCommentsToDbV1 } from '../../src/modules/raw-db/tiktok-comments-loader.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, TIKTOK_COMMENT_ACTORS } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { ANSWER, QUERY, saveGoogleCapture, snapshot } from '../fixtures/raw-db-v1-google.js';
import { tiktokFixture, workspaceId, runId, url } from '../fixtures/tiktok-coding-fixture.js';
import { startRun } from '../helpers/autorun-harness.js';
import {
  S07_COMPLETED, S07_DOCUMENT, S07_FILE, S07_ITEMS, S07_RUN, S07_URLS, s07AuthorKey, s07Fixture, s07Privacy,
} from '../fixtures/raw-db-v1-s07.js';

const fileInput = { file: S07_FILE, runId: S07_RUN };
const receipt = { runId: S07_RUN, captures: 1, videos: 2, reviewsInserted: 4, reviewsAlreadyPresent: 0, runReviewsInserted: 4 };
const rawTables = ['raw_capture', 'product', 'review', 'run_review', 'video'] as const;

test('RAWDB-T T2: file load maps four comments and two UNKNOWN videos with exact capture provenance', async t => {
  const f = await s07Fixture(t);
  assert.deepEqual(await loadTikTokCommentsToDbV1(f.db, f.artifacts, fileInput, f.privacy), receipt);
  const rows = f.db.prepare(`SELECT review_key,source_code,platform,kind,external_id,product_key,video_url,
    reviewer_name,reviewer_name_state,rating_star,variation,posted_at,like_count,reply_count,replies_to_external_id,
    media_count,state,collected_at,capture_id,source_position FROM review ORDER BY external_id`).all();
  const common = { source_code: 'S07', platform: 'tiktok', kind: 'video_comment', product_key: null,
    reviewer_name: null, reviewer_name_state: 'not_provided', rating_star: null, variation: null,
    state: 'VALID', collected_at: S07_COMPLETED, capture_id: f.captureId };
  assert.deepEqual(rows, [
    { ...common, review_key: 'S07:2001', external_id: '2001', video_url: S07_URLS[0], posted_at: '2026-11-03T03:04:05+07:00',
      like_count: 7n, reply_count: 2n, replies_to_external_id: null, media_count: 0n, source_position: 'video=1001,index=0' },
    { ...common, review_key: 'S07:2002', external_id: '2002', video_url: S07_URLS[1], posted_at: null,
      like_count: 0n, reply_count: 0n, replies_to_external_id: null, media_count: 0n, source_position: 'video=1002,index=0' },
    { ...common, review_key: 'S07:2003', external_id: '2003', video_url: S07_URLS[0], posted_at: '2026-11-01T08:02:03+07:00',
      like_count: 3n, reply_count: null, replies_to_external_id: null, media_count: 2n, source_position: 'video=1001,index=1' },
    { ...common, review_key: 'S07:2004', external_id: '2004', video_url: S07_URLS[1], posted_at: '2026-11-03T09:02:03+07:00',
      like_count: null, reply_count: null, replies_to_external_id: '2002', media_count: null, source_position: 'video=1002,index=1' },
  ]);
  const capture = f.db.prepare(`SELECT capture_id,run_id,source_code,provider,operation,request_params_json,
    requested_at,completed_at,http_status,outcome,cost_unit,cost_amount,response_sha256,raw_path FROM raw_capture`).get() as Record<string, unknown>;
  const { request_params_json, ...captureFields } = capture;
  assert.deepEqual(captureFields, {
    capture_id: f.captureId, run_id: S07_RUN, source_code: 'S07', provider: 'apify',
    operation: 'apify.clockworks~tiktok-comments-scraper', requested_at: '2026-11-03T01:00:00Z', completed_at: S07_COMPLETED,
    http_status: 200n, outcome: 'OK', cost_unit: 'USD', cost_amount: 0.012,
    response_sha256: 'a'.repeat(64), raw_path: 'file:tests/fixtures/raw-db-v1-s07.synthetic.json#1',
  });
  assert.deepEqual(JSON.parse(request_params_json as string), {
    input: S07_DOCUMENT.records[1]!.input, selectionOrigin: 'synthetic exact selection',
  });
  assert.deepEqual(f.db.prepare('SELECT * FROM video ORDER BY video_id').all(), S07_URLS.map((videoUrl, i) => ({
    video_url: videoUrl, video_id: String(1001 + i), platform: 'tiktok', product_key: null, brand: null,
    author_key: s07AuthorKey('video-author-handle', `synthetic_creator_${i === 0 ? 'a' : 'b'}`), link_basis: 'UNKNOWN', capture_id: f.captureId,
  })));
  assert.deepEqual(f.db.prepare('SELECT * FROM run_review ORDER BY review_key').all(), [
    ['2001', 'video=1001,index=0'], ['2002', 'video=1002,index=0'], ['2003', 'video=1001,index=1'], ['2004', 'video=1002,index=1'],
  ].map(([id, position]) => ({ run_id: S07_RUN, review_key: `S07:${id}`, capture_id: f.captureId, source_position: position })));
});

test('RAWDB-T T3: writer keys match the public collector, repeat by uid and retain no raw writer identity', async t => {
  const f = await s07Fixture(t);
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, fileInput, f.privacy);
  const sanitized = f.privacy.sanitizePage(TIKTOK_COMMENT_ACTORS.fallback, Buffer.from(JSON.stringify(S07_ITEMS)), S07_URLS, 0);
  const keys = f.db.prepare('SELECT reviewer_key FROM review ORDER BY external_id').all() as { reviewer_key: string | null }[];
  assert.deepEqual(keys.map(row => row.reviewer_key), sanitized.map(row => row.authorIdentity.hash));
  assert.match(keys[0]!.reviewer_key!, /^[a-f0-9]{64}$/);
  assert.notEqual(keys[0]!.reviewer_key, keys[1]!.reviewer_key);
  assert.equal(keys[1]!.reviewer_key, keys[2]!.reviewer_key);
  assert.equal(keys[3]!.reviewer_key, null);
  const tables = f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  let stored = JSON.stringify(tables.map(({ name }) => f.db.prepare(`SELECT * FROM "${name}"`).all()),
    (_key, value: unknown) => typeof value === 'bigint' ? value.toString() : value);
  // COMMON-T requires exact selected video URLs in review/video/request metadata.
  // Mask only those exact URLs before rejecting the creator's handle elsewhere.
  for (const selectedUrl of S07_URLS) stored = stored.replaceAll(selectedUrl, '[selected-video-url]');
  for (const row of S07_ITEMS) {
    if (row.uid) assert.equal(stored.includes(row.uid), false, 'raw uid must not occur in any stored row');
    assert.equal(stored.includes(row.uniqueId), false, 'writer handle must not occur outside required selected video URLs');
  }
  assert.equal(stored.includes('synthetic_mention'), false, 'mentioned handle must not be retained');
  const pseudonymisedUrl = 'https://www.tiktok.com/@anon-abcdef/video/1001';
  const pseudonymised = { ...S07_DOCUMENT, records: [
    { operation: 'video.selection', videos: [pseudonymisedUrl] },
    { ...S07_DOCUMENT.records[1], input: { postURLs: [pseudonymisedUrl] }, itemCount: 1,
      items: [{ ...S07_ITEMS[0], cid: 'anon-a1b2c3', uid: 'anon-deadbeef', uniqueId: 'anon-abcdef', videoWebUrl: pseudonymisedUrl }] },
  ] };
  const file = path.join(f.root, 'pseudonymised.json');
  await fs.writeFile(file, JSON.stringify(pseudonymised));
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file, runId: S07_RUN }, f.privacy);
  assert.deepEqual(f.db.prepare("SELECT reviewer_key,reviewer_name,reviewer_name_state FROM review WHERE review_key='S07:anon-a1b2c3'").get(),
    { reviewer_key: null, reviewer_name: null, reviewer_name_state: 'not_provided' });
});

test('RAWDB-T T4: text is sanitized and attributes preserve creator, empty and optional boolean facts', async t => {
  const f = await s07Fixture(t);
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, fileInput, f.privacy);
  const mention = f.db.prepare("SELECT text FROM review WHERE review_key='S07:2004'").get() as { text: string };
  assert.equal(mention.text.includes('@'), false, 'comment mentions must be redacted');
  assert.equal(mention.text, 'Ask [handle removed] for details');
  assert.deepEqual(f.db.prepare('SELECT text FROM review ORDER BY external_id').all(), [
    { text: 'Synthetic creator words' }, { text: '' }, { text: 'Synthetic photo words' }, { text: 'Ask [handle removed] for details' },
  ]);
  const attributes = f.db.prepare('SELECT attributes_json FROM review ORDER BY external_id').all() as { attributes_json: string }[];
  assert.deepEqual(attributes.map(row => JSON.parse(row.attributes_json)), [
    { textForm: 'SANITIZED', byVideoAuthor: true, likedByAuthor: true, pinnedByAuthor: false },
    { textForm: 'SANITIZED', exclusionReason: 'EMPTY' },
    { textForm: 'SANITIZED' },
    { textForm: 'SANITIZED', exclusionReason: 'REPLY' },
  ]);
  const cases = [[null, 'EMPTY'], ['@synthetic_tag', 'TAG_ONLY'], ['😀', 'EMOJI_ONLY'], ['Ordinary words', null]] as const;
  const file = path.join(f.root, 'exclusions.json');
  await fs.writeFile(file, JSON.stringify({ ...S07_DOCUMENT, records: [S07_DOCUMENT.records[0], {
    ...S07_DOCUMENT.records[1], items: cases.map(([text], i) => ({ ...S07_ITEMS[0], cid: String(2010 + i), text })),
  }] }));
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file, runId: S07_RUN }, f.privacy);
  for (const [i, [, reason]] of cases.entries()) {
    const row = f.db.prepare('SELECT text,attributes_json FROM review WHERE external_id=?').get(String(2010 + i)) as { text: string | null; attributes_json: string };
    assert.equal(JSON.parse(row.attributes_json).exclusionReason ?? null, reason);
    if (i === 0) assert.equal(row.text, null);
  }
});

test('RAWDB-T T5: missing privacy fails before file reads or writes, including CLI dry-run', async t => {
  const f = await s07Fixture(t);
  const input = { file: path.join(f.root, 'does-not-exist.json'), runId: S07_RUN };
  const before = f.db.serialize();
  // Deliberately omit configuration at the public boundary, independent of its TS optionality.
  await assert.rejects(async () => { await Reflect.apply(loadTikTokCommentsToDbV1, undefined, [f.db, f.artifacts, input]); },
    /^Error: RAW_DB_PRIVACY_KEY_MISSING/);
  assert.deepEqual(f.db.serialize(), before);
  const env = { ...process.env };
  delete env.TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE;
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts', '--source', 'S07',
    '--file', input.file, '--run', S07_RUN, '--db', f.databasePath, '--artifacts', f.artifactRoot, '--dry-run'],
  { env, encoding: 'utf8', timeout: 30_000 });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 1);
  assert.match(child.stderr, /RAW_DB_PRIVACY_KEY_MISSING/);
  assert.equal(child.stdout, '');
  assert.deepEqual(f.db.serialize(), before);
});

test('RAWDB-T T6: an unselected URL or missing/invalid cid rolls back every table after earlier valid rows', async t => {
  const f = await s07Fixture(t);
  for (const fault of ['unselected-video', 'missing-cid', 'invalid-cid'] as const) {
    const changed = structuredClone(S07_DOCUMENT);
    const last: Record<string, unknown> = changed.records[1]!.items!.at(-1)!;
    if (fault === 'unselected-video') last.videoWebUrl = 'https://www.tiktok.com/@synthetic_unselected/video/9999';
    else if (fault === 'missing-cid') delete last.cid;
    else last.cid = 'invalid';
    const file = path.join(f.root, `${fault}.json`);
    await fs.writeFile(file, JSON.stringify(changed));
    const before = f.db.serialize();
    await assert.rejects(loadTikTokCommentsToDbV1(f.db, f.artifacts, { file, runId: S07_RUN }, f.privacy),
      /^Error: RAW_DB_S07_INVALID_ROW/);
    assert.deepEqual(f.db.serialize(), before, `${fault}: all tables must remain unchanged`);
  }
});

test('RAWDB-T T7: exact retry returns zero counters; a new label links existing first-version reviews', async t => {
  const f = await s07Fixture(t);
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, fileInput, f.privacy);
  const before = snapshot(f.db, rawTables);
  assert.deepEqual(await loadTikTokCommentsToDbV1(f.db, f.artifacts, fileInput, f.privacy), {
    runId: S07_RUN, captures: 0, videos: 0, reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0,
  });
  assert.deepEqual(snapshot(f.db, rawTables), before);
  const nextRun = 'synthetic-s07-second-label';
  const second = await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: nextRun }, f.privacy);
  // Capture identity is file-based, not run-label-based; the second label adds membership only.
  assert.deepEqual(second, { runId: nextRun, captures: 0, videos: 0, reviewsInserted: 0, reviewsAlreadyPresent: 4, runReviewsInserted: 4 });
  assert.deepEqual(snapshot(f.db, ['raw_capture', 'product', 'review', 'video']),
    Object.fromEntries(Object.entries(before).filter(([table]) => table !== 'run_review')));
  assert.deepEqual(f.db.prepare('SELECT * FROM run_review WHERE run_id=? ORDER BY review_key').all(nextRun),
    (before.run_review as Record<string, unknown>[]).map(row => ({ ...row, run_id: nextRun })));
  const changed = structuredClone(S07_DOCUMENT);
  changed.records[1]!.items![0]!.text = 'Changed later source version';
  const file = path.join(f.root, 'later-version.json');
  await fs.writeFile(file, JSON.stringify(changed));
  assert.deepEqual(await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file, runId: S07_RUN }, f.privacy),
    { runId: S07_RUN, captures: 1, videos: 0, reviewsInserted: 0, reviewsAlreadyPresent: 0, runReviewsInserted: 0 });
  assert.deepEqual(snapshot(f.db, ['review', 'video']), { review: before.review, video: before.video });
});

test('RAWDB-T T8: stored S07 reads verified pages, rejects tampering and requires an S07 collection', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  await t.test('verified run maps sanitized rows and stored provider receipt', async t => {
    const f = await tiktokFixture(t);
    const privacy = s07Privacy(f.collector.privacyProfile.keyId);
    await f.service.readP9Source(workspaceId, runId, 'comments', f.corpusPackage.packageId);
    assert.deepEqual(await loadTikTokCommentsToDbV1(f.db, f.artifacts, { runId }, privacy), {
      runId, captures: 1, videos: 1, reviewsInserted: 10, reviewsAlreadyPresent: 0, runReviewsInserted: 10,
    });
    const rows = f.db.prepare('SELECT * FROM review ORDER BY external_id').all() as Record<string, unknown>[];
    assert.equal(rows.length, 10);
    for (const [index, row] of rows.entries()) {
      assert.equal(row.review_key, `S07:${2000 + index}`);
      assert.equal(row.external_id, String(2000 + index));
      assert.equal(row.kind, 'video_comment');
      assert.equal(row.source_code, 'S07');
      assert.equal(row.platform, 'tiktok');
      assert.equal(row.product_key, null);
      assert.equal(row.video_url, url(1000));
      assert.equal(row.reviewer_name, null);
      assert.equal(row.reviewer_name_state, 'not_provided');
      assert.equal(row.rating_star, null);
      assert.equal(row.posted_at, '2026-09-03T07:00:00+07:00');
      assert.equal(row.like_count, 0n);
      assert.equal(row.reply_count, null);
      assert.equal(row.media_count, null);
      assert.equal(row.collected_at, '2026-10-09T00:00:00.000Z');
      assert.equal(row.capture_id, `S07:${runId}:0`);
      assert.equal(row.source_position, `video=1000,index=${index}`);
      assert.equal(row.state, 'VALID');
      const attributes = JSON.parse(row.attributes_json as string) as Record<string, unknown>;
      assert.equal(attributes.textForm, 'SANITIZED');
    }
    assert.equal(rows[0]!.reviewer_key, s07AuthorKey('author', '998877'));
    assert.equal(rows[1]!.reviewer_key, rows[0]!.reviewer_key);
    assert.equal(rows[4]!.text, '[handle removed]');
    // Stored P9 v1 pages retain the reply flag/reason, but never the parent id.
    assert.equal(rows[6]!.replies_to_external_id, null);
    assert.deepEqual(JSON.parse(rows[6]!.attributes_json as string), { textForm: 'SANITIZED', exclusionReason: 'REPLY' });
    assert.deepEqual(JSON.parse(rows[3]!.attributes_json as string), { textForm: 'SANITIZED', byVideoAuthor: true });
    assert.deepEqual(JSON.parse(rows[4]!.attributes_json as string), { textForm: 'SANITIZED', exclusionReason: 'TAG_ONLY' });
    assert.deepEqual(f.db.prepare('SELECT video_url,product_key,link_basis,author_key FROM video').all(), [
      { video_url: url(1000), product_key: null, link_basis: 'UNKNOWN', author_key: s07AuthorKey('video-author-handle', 'synthetic_creator') },
    ]);
    assert.deepEqual(f.db.prepare('SELECT capture_id,provider,operation,cost_unit,cost_amount,outcome FROM raw_capture').all(), [
      { capture_id: `S07:${runId}:0`, provider: 'apify', operation: 'datadoping/tiktok-comment-reply-scraper', cost_unit: 'USD', cost_amount: 0.01, outcome: 'OK' },
    ]);
  });
  await t.test('a different privacy salt fails safely before any writes', async t => {
    const f = await tiktokFixture(t);
    const privacy = createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 29), keyId: f.collector.privacyProfile.keyId });
    const before = f.db.serialize();
    await assert.rejects(loadTikTokCommentsToDbV1(f.db, f.artifacts, { runId }, privacy),
      /^Error: RAW_DB_PRIVACY_KEY_MISMATCH: S07 package [0-9a-f-]+ was collected under another privacy key$/);
    assert.deepEqual(f.db.serialize(), before);
  });
  await t.test('later packages cannot renumber already loaded capture provenance', async t => {
    const f = await tiktokFixture(t);
    const privacy = s07Privacy(f.collector.privacyProfile.keyId);
    let calls = 0;
    const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaceReader,
      tikTokCommentsCollector: new ApifyTikTokCommentsCollector({ privacy, approvedMaxTotalChargeUsd: 0.1, transport: {
        start: async () => ({ runId: `syntheticAppend${++calls}`, datasetId: `syntheticData${calls}`, buildId: null,
          status: 'SUCCEEDED', retrievedAt: '2026-10-09T00:00:00.000Z', providerTotalRows: 1, usageTotalUsd: 0.01 }),
        readPage: async () => Buffer.from(JSON.stringify([{ video_id: '1000', comment_id: String(3000 + calls),
          item_type: 'comment', text: 'Synthetic later comment' }])),
      } }) });
    const collect = async (requestKey: string) => {
      const selected = await service.selectTikTokCommentVideos(workspaceId, runId, {
        contractVersion: 'tiktok-video-selection-request-v1', requestKey,
        expectedRevision: (await f.service.getRun(workspaceId, runId)).revision,
        sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [],
      });
      return service.collectTikTokComments(workspaceId, runId, selected);
    };
    const high = await collect('ffffffff-ffff-4fff-bfff-ffffffffffff');
    await loadTikTokCommentsToDbV1(f.db, f.artifacts, { runId }, privacy);
    const captures = () => f.db.prepare("SELECT capture_id,json_extract(request_params_json,'$.packageId') package_id FROM raw_capture WHERE source_code='S07' ORDER BY capture_id").all() as { capture_id: string; package_id: string }[];
    const before = captures();
    const low = await collect('00000000-0000-4000-8000-000000000000');
    await loadTikTokCommentsToDbV1(f.db, f.artifacts, { runId }, privacy);
    const after = captures();
    assert.deepEqual(after.map(row => row.package_id).sort(),
      [f.corpusPackage.packageId, high.package.packageId, low.package.packageId].sort());
    for (const row of before) assert.deepEqual(after.find(stored => stored.capture_id === row.capture_id), row);
    assert.deepEqual(f.db.prepare("SELECT json_extract(c.request_params_json,'$.packageId') package_id FROM review r JOIN raw_capture c USING(capture_id) WHERE r.review_key='S07:3002'").get(),
      { package_id: low.package.packageId });
  });
  await t.test('same-size artifact tampering propagates the verified reader error before any writes', async t => {
    // A fresh target proves verification happens before any S07 publication, even on a cold load.
    const target = await tiktokFixture(t);
    const privacy = s07Privacy(target.collector.privacyProfile.keyId);
    const targetPkg = await new SourcePackageService({ db: target.db, artifactStore: target.artifacts }).readVerified(target.corpusPackage.packageId);
    const targetPage = targetPkg.files.find(file => file.path === 'pages/0.json')!;
    await fs.writeFile(target.artifacts.pathForDigest(targetPage.sha256), Buffer.alloc(targetPage.bytes.length, 32));
    let readerError: Error | undefined;
    try { await target.service.readP9Source(workspaceId, runId, 'comments', target.corpusPackage.packageId); }
    catch (error) { assert.ok(error instanceof Error); readerError = error; }
    assert.ok(readerError, 'tampered same-size page must fail at the existing verified reader');
    const before = target.db.serialize();
    await assert.rejects(loadTikTokCommentsToDbV1(target.db, target.artifacts, { runId }, privacy),
      (error: unknown) => error instanceof Error && error.message === readerError.message);
    assert.deepEqual(target.db.serialize(), before);
  });
  await t.test('a real research run without S07 fails with RAW_DB_RUN_NOT_FOUND', async t => {
    const f = await rawDbFixture(t, false);
    const privacy = s07Privacy();
    const before = f.db.serialize();
    await assert.rejects(loadTikTokCommentsToDbV1(f.db, f.artifacts, { runId: f.runId }, privacy), /^Error: RAW_DB_RUN_NOT_FOUND/);
    assert.deepEqual(f.db.serialize(), before);
  });
});

test('RAWDB-T: invalid file errors never echo source identities', async t => {
  const f = await s07Fixture(t);
  const marker = '@test'; // Synthetic contact marker, never printed even on failure.
  const invalidInputs = [JSON.stringify([marker]).replace(']', ',]'),
    JSON.stringify({ declare: S07_DOCUMENT.declare, records: [{ operation: marker }] })];
  for (const [index, bytes] of invalidInputs.entries()) {
    const file = path.join(f.root, `invalid-private-${index}.json`);
    await fs.writeFile(file, bytes);
    const before = f.db.serialize();
    let message = '';
    try { await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file, runId: S07_RUN }, f.privacy); }
    catch (error) { assert.ok(error instanceof Error); message = error.message; }
    assert.equal(message.includes(marker), false, 'source identities must not be included in load errors');
    assert.ok(message.startsWith('RAW_DB_FILE_BAD_RECORD:'), 'invalid files must fail with a safe error');
    assert.deepEqual(f.db.serialize(), before);
  }
});

test('RAWDB-T T9: CLI S07 --file --privacy-file --dry-run prints counts and preserves exact DB bytes', async t => {
  const f = await s07Fixture(t);
  f.db.pragma('wal_checkpoint(TRUNCATE)');
  f.db.pragma('journal_mode = DELETE');
  const before = await fs.readFile(f.databasePath);
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/raw-db-load.ts', '--source', 'S07',
    '--run', S07_RUN, '--file', S07_FILE, '--privacy-file', f.privacyFile, '--db', f.databasePath,
    '--artifacts', f.artifactRoot, '--dry-run'], { encoding: 'utf8', timeout: 30_000,
    env: { ...process.env, TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: path.join(f.root, 'missing-env-key.json') } });
  assert.equal(child.error, undefined);
  assert.equal(child.status, 0, child.stderr);
  assert.equal(child.stderr, '');
  const lines = child.stdout.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]!), receipt);
  assert.deepEqual(await fs.readFile(f.databasePath), before);
});

test('RAWDB-T T10: an S07 load preserves populated S05 and Google tables and their existing captures', async t => {
  const f = await rawDbFixture(t), privacy = s07Privacy();
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const googleRun = await startRun(f.service, ['INSIGHT']);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'google.suggest', ['synthetic prefix', ['synthetic suggestion']], 0);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: googleRun });
  const tables = ['product', 'search_suggestion', 'ai_overview_block', 'ai_overview_reference'];
  const before = snapshot(f.db, [...tables, 'raw_capture', 'review', 'run_review']);
  for (const rows of Object.values(before)) assert.ok((rows as unknown[]).length > 0, 'preservation fixture must be populated');
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, fileInput, privacy);
  assert.deepEqual(snapshot(f.db, tables), Object.fromEntries(tables.map(table => [table, before[table]])));
  assert.deepEqual(f.db.prepare("SELECT * FROM raw_capture WHERE source_code<>'S07' ORDER BY rowid").all(), before.raw_capture);
  assert.deepEqual(f.db.prepare("SELECT * FROM review WHERE source_code<>'S07' ORDER BY rowid").all(), before.review);
  assert.deepEqual(f.db.prepare('SELECT * FROM run_review WHERE run_id<>? ORDER BY rowid').all(S07_RUN), before.run_review);
});
