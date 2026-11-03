import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { afterEach, beforeEach, mock } from 'node:test';
import { loadReviewCodesToDbV1 } from '../../src/modules/raw-db/review-code-loader.js';
import {
  CODES_AT, CODES_VERSION, codesFixture, codesHash, codesLabel, codesReview, codesState,
  seedCodeReview, writeCodeInputs,
} from '../fixtures/raw-db-v1-codes.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

// Y2 adds review-level decisions to the existing X tests' single-label text proof.
// These tests own group admission, non-merging and failed-proof sentinel behavior once each.
test('RAWDB-Y2 B1: one bad proof rejects every label of that review, once, while another review imports', async t => {
  for (const badTheme of ['T-GIA', 'T-VI']) {
    const f = await codesFixture(t, {
      reviews: [codesReview(), codesReview({ review_id: 'shopee:synthetic-good', source_review_id: 'synthetic-good' })],
      labels: ['T-GIA', 'T-VI', 'T-CHATLUONG'].map(theme_code => codesLabel({ theme_code,
        ...(theme_code === badTheme || theme_code === 'T-CHATLUONG' ? { text_sha256: codesHash('Sai lời thử 🧪') } : {}) }))
        .concat([codesLabel({ review_id: 'shopee:synthetic-good' })]),
      states: [codesState(), codesState({ review_id: 'shopee:synthetic-good' })],
    });
    seedCodeReview(f.db, { review_key: 'S05:synthetic-good', external_id: 'synthetic-good' });
    const result = await loadReviewCodesToDbV1(f.db, f.input);
    assert.deepEqual(f.db.prepare('SELECT review_key,theme_code FROM review_code').all(),
      [{ review_key: 'S05:synthetic-good', theme_code: 'T-GIA' }], 'no partial group survives either label ordering');
    assert.equal(result.labelsInserted, 1);
    assert.equal((result as unknown as { reviewsSkipped: number }).reviewsSkipped, 1, 'two rejected proofs count as one review');
    const skipped = result.skipped.filter(row => row.reviewId === 'shopee:synthetic-codes-a');
    assert.ok(skipped.some(row => row.reason === 'TEXT_MISMATCH'), 'the skipped review has a text-proof reason');
  }
});

test('RAWDB-Y2 B2: any existing origin or NO_THEME closes the review/version group; exact-file replays count zero', async t => {
  for (const origin of ['MCP_IMPORT', 'APP_JEV']) {
    for (const theme of ['T-GIA', 'NO_THEME']) {
      const f = await codesFixture(t, { labels: [codesLabel(), codesLabel({ theme_code: 'T-VI' })] });
      f.db.prepare(`INSERT INTO codebook VALUES (?, 'insight-theme-codebook-v1', 'DRAFT', NULL, NULL, ?, ?, ?)`)
        .run(CODES_VERSION, f.codebookText, codesHash(f.codebookText), CODES_AT);
      f.db.prepare(`INSERT INTO review_code VALUES (?, ?, ?, NULL, ?, ?, 'kept', NULL, ?, ?, ?, ?, ?)`)
        .run('S05:synthetic-codes-a', CODES_VERSION, theme, theme === 'NO_THEME' ? null : 'khen',
          theme === 'NO_THEME' ? null : 'Sau mua', 'synthetic-prior-coder', codesHash('prior evidence'),
          CODES_AT, origin, 'b'.repeat(64));
      const prior = f.db.prepare('SELECT * FROM review_code').all();
      const result = await loadReviewCodesToDbV1(f.db, f.input);
      assert.deepEqual(f.db.prepare('SELECT * FROM review_code').all(), prior, `${origin}/${theme}: never extend or replace a group`);
      assert.equal(result.labelsInserted, 0);
      assert.equal(result.noThemeInserted, 0);
      assert.equal((result as unknown as { alreadyCoded: number }).alreadyCoded, 1, 'count the review once');
    }
  }
  // Unlike an arbitrary already-coded group, the exact same source file is a mutation-free, zero-count retry.
  const f = await codesFixture(t, { labels: [codesLabel(), codesLabel({ theme_code: 'T-VI' })] });
  const initial = await loadReviewCodesToDbV1(f.db, f.input);
  assert.equal(initial.labelsInserted, 2);
  const before = f.db.serialize(), replay = await loadReviewCodesToDbV1(f.db, f.input);
  assert.deepEqual(f.db.serialize(), before);
  assert.equal((replay as unknown as { alreadyCoded: number }).alreadyCoded, 0);
  assert.equal((replay as unknown as { reviewsSkipped: number }).reviewsSkipped, 0);
  assert.equal(replay.labelsInserted + replay.noThemeInserted + replay.alreadyPresent, 0);
});

test('RAWDB-Y2 B3: a done state cannot turn a rejected label into NO_THEME, and corrected evidence remains importable', async t => {
  const f = await codesFixture(t, { labels: [codesLabel({ text_sha256: codesHash('Nội dung không khớp 🍊') })] });
  const rejected = await loadReviewCodesToDbV1(f.db, f.input);
  assert.equal(rejected.noThemeInserted, 0);
  assert.deepEqual(f.db.prepare('SELECT * FROM review_code').all(), [], 'failed proof leaves the review uncoded, including its done state');
  // A new synthetic source file repairs the proof; no deletion or overwrite of immutable app rows is needed.
  const correctedRoot = path.join(f.root, 'corrected');
  await fs.mkdir(correctedRoot);
  const corrected = await writeCodeInputs(correctedRoot);
  const accepted = await loadReviewCodesToDbV1(f.db, corrected.input);
  assert.equal(accepted.labelsInserted, 1);
  assert.deepEqual(f.db.prepare('SELECT theme_code FROM review_code').pluck().all(), ['T-GIA']);
});
