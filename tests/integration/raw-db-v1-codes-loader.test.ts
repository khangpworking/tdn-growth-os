import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test, { afterEach, beforeEach, mock } from 'node:test';
import Database from 'better-sqlite3';
import { loadReviewCodesToDbV1 } from '../../src/modules/raw-db/review-code-loader.js';
import { loadShopeeReviewsToDbV1 } from '../../src/modules/raw-db/shopee-reviews-loader.js';
import { loadAiOverviewToDbV1, loadSearchSuggestionsToDbV1 } from '../../src/modules/raw-db/google-search-loader.js';
import { loadTikTokCommentsToDbV1 } from '../../src/modules/raw-db/tiktok-comments-loader.js';
import { loadKalodataVideosToDbV1 } from '../../src/modules/raw-db/kalodata-video-loader.js';
import { loadVideoReadingsToDbV1 } from '../../src/modules/raw-db/video-reading-loader.js';
import {
  CODES_AT, CODES_TEXT, CODES_VERSION, codesFixture, codesHash, codesLabel, codesReview, codesState, codesTarget,
  emptyCodesReceipt, seedCodeReview, writeCodeInputs,
} from '../fixtures/raw-db-v1-codes.js';
import { rawDbFixture } from '../fixtures/raw-db-v1-s05.js';
import { ANSWER, QUERY, saveGoogleCapture, snapshot } from '../fixtures/raw-db-v1-google.js';
import { S07_FILE, S07_RUN, s07Privacy } from '../fixtures/raw-db-v1-s07.js';
import { S02B_FILE, S02B_RUN } from '../fixtures/raw-db-v1-s02b.js';
import { S14_FILE, S14_RUN } from '../fixtures/raw-db-v1-s14.js';
import { startRun } from '../helpers/autorun-harness.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

test('RAWDB-X X3: import preserves exact coder fields and proves full and partial Vietnamese/emoji text with attributes', async t => {
  // Python/code-point offsets: start after 🧪, end after the attribute's 🍊.
  const span = 'vị dịu.\r\nCafe\u0301    Vị: ngọt 🍊';
  const f = await codesFixture(t, {
    labels: [codesLabel(), codesLabel({ theme_code: 'T-VI', polarity: 'che', status: 'unclear', p_yes: 0.57,
      step: 'Trong mua', text_start: 12, text_end: 40, text_sha256: codesHash(span) }),
    codesLabel({ theme_code: 'T-KHAC', polarity: 'ke', p_yes: 0, step: 'Trước mua' }),
    codesLabel({ theme_code: 'T-CHATLUONG', polarity: 'khong_ro_huong', p_yes: 1 })],
    targets: [
      codesTarget({ codebook_version: 'synthetic-other-version', started_at: '2026-11-01T00:00:00.000Z' }),
      codesTarget({ block_key: null, block_norm: '', started_at: '2026-11-01T00:00:01.000Z' }),
      codesTarget({ started_at: '2026-11-03T05:00:00.000Z' }), codesTarget(),
    ],
  });
  const warehouseBefore = await fs.readFile(f.mcpRunFile);
  assert.deepEqual(await loadReviewCodesToDbV1(f.db, f.input), { ...emptyCodesReceipt, codebookInserted: 1, labelsInserted: 4 });
  const shared = { review_key: 'S05:synthetic-codes-a', codebook_version: CODES_VERSION, block_key: 'thuc_pham',
    coder: 'synthetic-coder', coded_at: CODES_AT, origin: 'MCP_IMPORT', import_sha256: codesHash(warehouseBefore) };
  assert.deepEqual(f.db.prepare('SELECT * FROM review_code ORDER BY theme_code').all(), [
    { ...shared, theme_code: 'T-CHATLUONG', polarity: 'khong_ro_huong', journey_step: 'Sau mua', status: 'kept', confidence: 1, text_sha256: codesHash(CODES_TEXT) },
    { ...shared, theme_code: 'T-GIA', polarity: 'khen', journey_step: 'Sau mua', status: 'kept', confidence: 0.91, text_sha256: codesHash(CODES_TEXT) },
    { ...shared, theme_code: 'T-KHAC', polarity: 'ke', journey_step: 'Trước mua', status: 'kept', confidence: 0, text_sha256: codesHash(CODES_TEXT) },
    { ...shared, theme_code: 'T-VI', polarity: 'che', journey_step: 'Trong mua', status: 'unclear', confidence: 0.57, text_sha256: codesHash(span) },
  ]);
  const book = f.db.prepare('SELECT * FROM codebook').get() as Record<string, unknown>;
  const { loaded_at, ...definition } = book;
  assert.equal(typeof loaded_at, 'string');
  assert.ok(Number.isFinite(Date.parse(String(loaded_at))), 'load time is an ISO timestamp');
  assert.deepEqual(definition, { codebook_version: CODES_VERSION, contract_version: 'insight-theme-codebook-v1', status: 'DRAFT',
    approved_by: null, approved_at: null, definition_json: f.codebookText, definition_sha256: codesHash(f.codebookText) });
  assert.deepEqual(await fs.readFile(f.mcpRunFile), warehouseBefore, 'import does not mutate the read-only warehouse');
});

test('RAWDB-X X4: only a done, unlabelled review gets one NO_THEME row; uncoded reviews get none', async t => {
  const f = await codesFixture(t, {
    reviews: [codesReview(), codesReview({ review_id: 'shopee:synthetic-uncoded', source_review_id: 'synthetic-uncoded', text: 'Chưa chấm 🧪' })],
    labels: [],
    states: [codesState({ block_key: null, block_norm: '' }),
      codesState({ review_id: 'shopee:synthetic-uncoded', codebook_version: 'synthetic-other-version' }),
      codesState({ review_id: 'shopee:synthetic-uncoded', status: 'pending' })],
    targets: [codesTarget({ block_key: null, block_norm: '' })],
  });
  seedCodeReview(f.db, { review_key: 'S05:synthetic-uncoded', external_id: 'synthetic-uncoded', text: 'Chưa chấm 🧪', attributes_json: null });
  assert.deepEqual(await loadReviewCodesToDbV1(f.db, f.input), { ...emptyCodesReceipt, codebookInserted: 1, noThemeInserted: 1 });
  assert.deepEqual(f.db.prepare('SELECT * FROM review_code').all(), [{
    review_key: 'S05:synthetic-codes-a', codebook_version: CODES_VERSION, theme_code: 'NO_THEME', block_key: null,
    polarity: null, journey_step: null, status: 'kept', confidence: null, coder: 'synthetic-coder',
    text_sha256: codesHash(CODES_TEXT), coded_at: CODES_AT, origin: 'MCP_IMPORT', import_sha256: codesHash(await fs.readFile(f.mcpRunFile)),
  }]);
});

test('RAWDB-X X5: a DB text mismatch skips and counts that label while importing another review label', async t => {
  const text = 'Dữ liệu giả lập còn khớp 🍋';
  const different = 'Văn bản MCP khác với DB 🧪';
  const f = await codesFixture(t, {
    reviews: [codesReview({ text: different }), codesReview({ review_id: 'shopee:synthetic-codes-b', source_review_id: 'synthetic-codes-b', text })],
    labels: [codesLabel({ text_end: [...different].length, text_sha256: codesHash(different) }),
      codesLabel({ review_id: 'shopee:synthetic-codes-b', text_end: [...text].length, text_sha256: codesHash(text) })],
  });
  seedCodeReview(f.db, { review_key: 'S05:synthetic-codes-b', external_id: 'synthetic-codes-b', text, attributes_json: null });
  const result = await loadReviewCodesToDbV1(f.db, f.input);
  const { skipped, ...counts } = result;
  assert.deepEqual(counts, { codebookInserted: 1, labelsInserted: 1, noThemeInserted: 0, alreadyCoded: 0, reviewsMissing: 0, textMismatch: 1,
    reviewsSkipped: [{ reviewId: 'shopee:synthetic-codes-a', reason: 'TEXT_MISMATCH' }] });
  assert.equal(skipped.length, 1);
  assert.deepEqual(f.db.prepare('SELECT review_key,theme_code FROM review_code').all(), [{ review_key: 'S05:synthetic-codes-b', theme_code: 'T-GIA' }]);
});

test('RAWDB-X X6: missing reviews are counted skips; ambiguous platform/external-id matches roll back the entire load', async t => {
  const missing = await codesFixture(t, {
    reviews: [codesReview(), codesReview({ review_id: 'shopee:synthetic-missing', source_review_id: 'synthetic-missing' })],
    labels: [codesLabel(), codesLabel({ review_id: 'shopee:synthetic-missing' }),
      codesLabel({ review_id: 'shopee:synthetic-missing', theme_code: 'T-VI' })],
  });
  // A different platform must not create ambiguity; a comment must not satisfy the missing product review.
  seedCodeReview(missing.db, { review_key: 'S06:synthetic-codes-a', source_code: 'S06', platform: 'tiktok_shop' });
  seedCodeReview(missing.db, { review_key: 'S07:synthetic-missing', source_code: 'S07', external_id: 'synthetic-missing',
    kind: 'video_comment', video_url: 'https://example.invalid/synthetic-video' });
  const { skipped, ...counts } = await loadReviewCodesToDbV1(missing.db, missing.input);
  assert.deepEqual(counts, { codebookInserted: 1, labelsInserted: 1, noThemeInserted: 0, alreadyCoded: 0, reviewsMissing: 1, textMismatch: 0,
    reviewsSkipped: [{ reviewId: 'shopee:synthetic-missing', reason: 'REVIEW_MISSING' }] });
  assert.equal(skipped.length, 2, 'missing counts reviews, while skipped lists both labels');
  assert.deepEqual(missing.db.prepare('SELECT review_key FROM review_code').all(), [{ review_key: 'S05:synthetic-codes-a' }]);

  const ambiguous = await codesFixture(t, {
    reviews: [codesReview({ review_id: 'shopee:synthetic-codes-b', source_review_id: 'synthetic-codes-b' }), codesReview()],
    labels: [codesLabel({ review_id: 'shopee:synthetic-codes-b' }), codesLabel()],
  });
  seedCodeReview(ambiguous.db, { review_key: 'S05:synthetic-codes-b', external_id: 'synthetic-codes-b' });
  seedCodeReview(ambiguous.db, { review_key: 'S06:synthetic-codes-a', source_code: 'S06' });
  const before = ambiguous.db.serialize();
  await assert.rejects(async () => loadReviewCodesToDbV1(ambiguous.db, ambiguous.input), /^Error: RAW_DB_CODES_AMBIGUOUS_REVIEW/);
  assert.deepEqual(ambiguous.db.serialize(), before, 'no codebook or earlier valid label survives the failure');
});

test('RAWDB-X X7: wrong versions, changed codebook bytes and unknown themes fail atomically with their contract errors', async t => {
  for (const [label, error] of [
    [codesLabel({ theme_code: 'T-VI', codebook_version: 'synthetic-wrong-version' }), 'RAW_DB_CODES_CODEBOOK_MISMATCH'],
    [codesLabel({ theme_code: 'T-NOT-IN-CODEBOOK' }), 'RAW_DB_CODES_INVALID_ROW'],
    [codesLabel({ theme_code: 'T-VI', block_key: 'synthetic-unknown-block' }), 'RAW_DB_CODES_INVALID_ROW'],
    [codesLabel(), 'RAW_DB_CODES_INVALID_ROW'], // Same review/theme cannot be imported twice.
  ] as const) {
    const f = await codesFixture(t, { labels: [codesLabel(), label] });
    const before = f.db.serialize();
    await assert.rejects(async () => loadReviewCodesToDbV1(f.db, f.input), new RegExp(`^Error: ${error}`));
    assert.deepEqual(f.db.serialize(), before, error);
  }
  const changed = await codesFixture(t);
  await loadReviewCodesToDbV1(changed.db, changed.input);
  const before = changed.db.serialize();
  await fs.appendFile(changed.codebookFile, '\n'); // Same version and JSON value, different exact bytes.
  await assert.rejects(async () => loadReviewCodesToDbV1(changed.db, changed.input), /^Error: RAW_DB_CODES_CODEBOOK_CHANGED/);
  assert.deepEqual(changed.db.serialize(), before);

  for (const input of [{ targets: [] }, { codebookText: '{' },
    { labels: [], states: [codesState(), codesState({ block_key: null, block_norm: '' })],
      targets: [codesTarget(), codesTarget({ block_key: null, block_norm: '' })] }]) {
    const f = await codesFixture(t, input), before = f.db.serialize();
    await assert.rejects(() => loadReviewCodesToDbV1(f.db, f.input),
      new RegExp(`^Error: ${'codebookText' in input ? 'RAW_DB_CODES_CODEBOOK_INVALID' : 'RAW_DB_CODES_INVALID_ROW'}`));
    assert.deepEqual(f.db.serialize(), before);
  }
  // Fail inside the write transaction, after the codebook and first valid label were inserted.
  const writeFailure = await codesFixture(t, { labels: [codesLabel(), codesLabel({ theme_code: 'T-VI' })] });
  writeFailure.db.exec(`CREATE TEMP TRIGGER synthetic_codes_failure BEFORE INSERT ON review_code
    WHEN NEW.theme_code='T-VI' BEGIN SELECT RAISE(ABORT,'synthetic_write_failure'); END`);
  const writeBefore = writeFailure.db.serialize();
  await assert.rejects(() => loadReviewCodesToDbV1(writeFailure.db, writeFailure.input), /synthetic_write_failure/);
  assert.deepEqual(writeFailure.db.serialize(), writeBefore, 'storage failure rolls back the earlier codebook and label');
});

test('RAWDB-X X8: loading the identical warehouse twice returns all zeros and changes no DB bytes', async t => {
  const f = await codesFixture(t, {
    reviews: [codesReview(), codesReview({ review_id: 'shopee:synthetic-codes-b', source_review_id: 'synthetic-codes-b' })],
    states: [codesState(), codesState({ review_id: 'shopee:synthetic-codes-b' })],
  });
  seedCodeReview(f.db, { review_key: 'S05:synthetic-codes-b', external_id: 'synthetic-codes-b' });
  assert.deepEqual(await loadReviewCodesToDbV1(f.db, f.input), { ...emptyCodesReceipt, codebookInserted: 1, labelsInserted: 1, noThemeInserted: 1 });
  const before = f.db.serialize();
  assert.deepEqual(await loadReviewCodesToDbV1(f.db, f.input), emptyCodesReceipt);
  assert.deepEqual(f.db.serialize(), before);
  // Another MCP file with the same labels counts already coded reviews, while preserving their original provenance.
  const warehouse = new Database(f.mcpRunFile);
  try { warehouse.pragma('user_version=1'); } finally { warehouse.close(); }
  assert.deepEqual(await loadReviewCodesToDbV1(f.db, f.input), { ...emptyCodesReceipt, alreadyCoded: 2 });
  assert.deepEqual(f.db.serialize(), before);
});

test('RAWDB-X X10: CODES preserves populated S05, Google, S07, S02b and S14 rows', async t => {
  const f = await rawDbFixture(t), privacy = s07Privacy();
  await loadShopeeReviewsToDbV1(f.db, f.artifacts, { runId: f.runId });
  const googleRun = await startRun(f.service, ['INSIGHT']);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'google.suggest', ['synthetic jar', ['synthetic suggestion']], 0);
  await saveGoogleCapture({ ...f, runId: googleRun }, 'serpapi.google.search', { search_parameters: { q: QUERY }, ai_overview: ANSWER }, 1);
  await loadSearchSuggestionsToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadAiOverviewToDbV1(f.db, f.artifacts, { runId: googleRun });
  await loadTikTokCommentsToDbV1(f.db, f.artifacts, { file: S07_FILE, runId: S07_RUN }, privacy);
  await loadKalodataVideosToDbV1(f.db, f.artifacts, { file: S02B_FILE, runId: S02B_RUN }, privacy);
  await loadVideoReadingsToDbV1(f.db, f.artifacts, { file: S14_FILE, runId: S14_RUN }, privacy);
  const preserved = ['raw_capture', 'product', 'review', 'run_review', 'search_suggestion', 'ai_overview_block',
    'ai_overview_reference', 'video', 'video_snapshot', 'video_reading', 'video_segment'];
  const before = snapshot(f.db, preserved);
  for (const rows of Object.values(before)) assert.ok(rows.length > 0, 'every preservation fixture is populated');
  assert.deepEqual(f.db.prepare('SELECT DISTINCT source_code FROM raw_capture ORDER BY source_code').pluck().all(), ['S02b', 'S05', 'S07', 'S14', 'S19b', 'S29']);
  const text = '  Exact synthetic comment\n<&>    Synthetic material  Synthetic size';
  const { input } = await writeCodeInputs(f.root, {
    reviews: [codesReview({ review_id: 'shopee:synthetic-review-a', source_review_id: 'synthetic-review-a', text })],
    labels: [codesLabel({ review_id: 'shopee:synthetic-review-a', text_end: text.length, text_sha256: codesHash(text) })],
    states: [codesState({ review_id: 'shopee:synthetic-review-a', input_sha256: codesHash(text) })],
  });
  const result = await loadReviewCodesToDbV1(f.db, input);
  assert.equal(result.labelsInserted, 1, 'preservation must exercise a successful CODES import');
  assert.deepEqual(f.db.prepare('SELECT review_key,theme_code FROM review_code').all(), [{ review_key: 'S05:synthetic-review-a', theme_code: 'T-GIA' }]);
  assert.deepEqual(snapshot(f.db, preserved), before);
});
