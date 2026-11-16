/** Labelled comments file: every collected row of one result, each with its current Jev tags. Synthetic rows only. */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';
import { insightRowTags, labelledCommentsFile } from '../../scripts/module-review-data.js';
import { DEFAULT_CODEBOOK_FILE, codingText, parseLabelCodebook } from '../../src/modules/raw-db/review-labeller.js';
import type { ModuleReviewRow } from '../../src/modules/foundation/shopee-module-review-data.js';
import { LINKS, moduleRow, sha256 } from '../fixtures/shopee-module-review-data.js';

const BOOK = parseLabelCodebook(await fs.readFile(DEFAULT_CODEBOOK_FILE, 'utf8'));
const tag = { code: 'T-GIA', name: 'Giá, ưu đãi, quà kèm', polarity: 'che' as const, status: 'kept' as const, choice: 'DAT' };
/** A stored Jev label made for this row's exact text (as step 4 saves it). */
const storedFor = (row: ModuleReviewRow) => ({ ...tag, known: true,
  textSha256: sha256(codingText(row.comment, row.attributes.length ? JSON.stringify(row.attributes) : null)) });

test('the labelled file keeps every collected row past the 200 on-screen cap, with tags or an empty list', () => {
  const rows = Array.from({ length: 250 }, (_, i) => moduleRow(LINKS[i % 2]!, `review-${i}`,
    i === 7 ? { comment: null, attributes: ['Chất liệu: vải'], contentType: 'ATTRIBUTES_ONLY' } : { comment: `Bình luận ${i}` })) as ModuleReviewRow[];
  const file = labelledCommentsFile({ runId: 'run-x', sourceSha256: 'a'.repeat(64), rows }, BOOK,
    { labels: new Map([['review-3', [storedFor(rows[3]!)]], ['review-240', [storedFor(rows[240]!)]]]),
      productNames: new Map([['review-3', 'Kem A']]), available: true });
  assert.deepEqual([file.format, file.runId, file.sourceSha256, file.codebookVersion, file.labelsAvailable, file.total, file.labelled],
    ['shopee-labelled-comments-v1', 'run-x', 'a'.repeat(64), BOOK.version, true, 250, 2]);
  assert.deepEqual(file.comments.map(c => c.id), rows.map(r => r.reviewId), 'all rows, in collected order');
  assert.deepEqual(file.comments[3], { id: 'review-3', text: 'Bình luận 3', comment: 'Bình luận 3',
    attributes: ['Synthetic material', 'Synthetic size'], rating: 4, date: '2026-11-03T03:04:00+07:00', productName: 'Kem A',
    url: LINKS[1]!.url, tags: [tag] });
  assert.deepEqual(file.comments[240]!.tags, [tag], 'a row past 200 keeps its tags');
  assert.deepEqual([file.comments[0]!.tags, file.comments[0]!.productName], [[], null], 'an unlabelled row has an empty tag list');
  assert.deepEqual([file.comments[7]!.comment, file.comments[7]!.text, file.comments[7]!.attributes],
    [null, 'Chất liệu: vải', ['Chất liệu: vải']], 'an attributes-only row keeps its attributes');
});

test('a label applies per row: two results sharing a review id keep the tags of the row whose text was labelled', () => {
  const legacy = moduleRow(LINKS[0]!, 'review-shared', { comment: 'Bản cũ của bình luận' }) as ModuleReviewRow;
  const newer = moduleRow(LINKS[0]!, 'review-shared', { comment: 'Bản mới của bình luận' }) as ModuleReviewRow;
  const store = { labels: new Map([['review-shared', [storedFor(legacy)]]]), productNames: new Map(), available: true };
  assert.deepEqual(insightRowTags(legacy, store), [tag], 'the labelled text keeps its valid tag');
  assert.deepEqual(insightRowTags(newer, store), [], 'a different text with the same id gets no tag');
  const file = labelledCommentsFile({ runId: 'run-x', sourceSha256: 'b'.repeat(64), rows: [legacy] }, BOOK, store);
  assert.deepEqual(file.comments[0]!.tags, [tag]);
});
