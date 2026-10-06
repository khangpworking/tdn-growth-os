import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { selectExactShopeeListings, validateExactShopeeRequest } from '../../src/modules/foundation/shopee-exact-selection.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { jsonBytes } from '../../src/modules/foundation/shopee-selection.js';
import { buildResearchReviewCorpus, verifyResearchReviewCorpus } from '../../src/modules/analysis/research-automation/review-corpus.js';

const roots: string[] = [];
afterEach(async () => {
  for (const directory of roots.splice(0)) {
    assert.equal(path.dirname(directory), os.tmpdir());
    assert.ok(path.basename(directory).startsWith('tdn-review-corpus-'));
    await fs.rm(directory, { recursive: true, force: true });
  }
});
const review = (reviewId: string, comment = 'Synthetic readable review') => ({
  shopId: '78085196', itemId: '17678138164', reviewId, ratingStar: 5, comment,
});
async function fixture(pages: unknown[][]) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-review-corpus-')); roots.push(directory);
  const { db } = openDatabase({ databasePath: path.join(directory, 'test.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(directory, 'artifacts'));
  const foundation = new ShopeeCollectionService(db, artifacts);
  try {
    const request = validateExactShopeeRequest({ contractVersion: '2.0.0', runKey: 'synthetic-review-corpus', topic: 'Synthetic review capture',
      selectionBasis: 'OWNER_EXACT_URL', source: { label: 'Synthetic owner request', acquiredAt: '2026-10-02T00:00:00Z' },
      productUrls: ['https://shopee.vn/product/78085196/17678138164'] });
    const collected = await new FixtureShopeeCollector(jsonBytes(pages[0] ?? [])).collect(selectExactShopeeListings(request).selected);
    let offset = 0;
    collected.pages = pages.map(rows => { const page = { bytes: jsonBytes(rows), offset }; offset += rows.length; return page; });
    const source = await foundation.saveExact(jsonBytes(request), collected);
    return { db, foundation, source };
  } catch (error) { db.close(); throw error; }
}

test('raw review corpus conserves every row, retains invalid-rating text and quarantines listing mismatches without author projection', async () => {
  const text = '  Trải nghiệm nguyên văn 😀\nKhông rút gọn.  ';
  const state = await fixture([[{ ...review('1', text), ratingStar: 0, username: 'PRIVATE_AUTHOR_METADATA',
    createdAt: 'ORIGINAL_UNNORMALIZED_DATE', modelId: 'ORIGINAL_VARIANT_ONLY_IN_RAW' },
    { ...review('2'), shopId: '999', itemId: '888' },
    { ...review('3'), reviewId: null },
    { ...review('4'), comment: 42, ratingStar: true }, null,
    { ...review(''), comment: '' }]]);
  try {
    const before = state.db.prepare('SELECT total_changes() AS count').get();
    const { output, bytes } = buildResearchReviewCorpus(state.source);
    assert.deepEqual(output.coverage, { rawRows: 6, recordGroups: 6, collapsedEqualDuplicateRows: 0, conflictingRecordGroups: 0,
      selectedListingRawRows: 4, quarantinedRawRows: 2, readableRawRows: 3, emptyTextRawRows: 1,
      unreadableRawRows: 2, invalidRatingRawRows: 2, missingNativeIdRawRows: 2, unresolvedNativeIdRawRows: 1 });
    assert.equal(output.mappingRevision, 'apify-shopee-review-row-v1');
    assert.equal(output.collectionId, state.source.packet.collectionId);
    assert.equal(output.collectionSha256, state.source.sha256);
    assert.equal(output.codingState, 'NOT_CODED');
    assert.equal(output.corpusState, 'RAW_CAPTURE_ONLY');
    assert.equal(output.records[0]!.versions[0]!.text, text);
    assert.deepEqual(output.records[0]!.versions[0]!.rating, { state: 'INVALID', value: null });
    assert.equal(output.records[0]!.versions[0]!.sourceRefs[0]!.textPointer, '/0/comment');
    assert.equal(output.records[1]!.disposition, 'QUARANTINED');
    assert.equal(output.records[1]!.identity.listingKey, 'shopee:999:888');
    assert.equal(output.records[2]!.identity.kind, 'SOURCE_ROW_LOCATOR');
    assert.equal(output.records[2]!.identity.nativeReviewId, null);
    assert.match(output.records[2]!.identity.internalLocator!, /:page:0:row:2$/);
    assert.equal(output.records[5]!.identity.kind, 'UNRESOLVED');
    assert.equal(output.records[5]!.identity.internalLocator, null);
    assert.equal(output.records[5]!.versions[0]!.text, '');
    assert.ok(output.blockers.includes('SEMANTIC_CODING_NOT_PERFORMED'));
    for (const privateValue of ['PRIVATE_AUTHOR_METADATA', 'ORIGINAL_UNNORMALIZED_DATE', 'ORIGINAL_VARIANT_ONLY_IN_RAW']) {
      assert.equal(bytes.includes(privateValue), false);
    }
    assert.equal(verifyResearchReviewCorpus(JSON.parse(bytes.toString()), state.source).bytes.equals(bytes), true);
    assert.deepEqual(state.db.prepare('SELECT total_changes() AS count').get(), before);
  } finally { state.db.close(); }
});

test('native review identity deduplicates only equal full content and preserves conflicts, distinct IDs and missing-ID occurrences', async () => {
  const equal = review('10', 'Same synthetic text');
  const state = await fixture([[equal, review('11', 'Original content'), review('12', 'Same synthetic text'),
    { ...equal, reviewId: null }], [equal, review('11', 'Conflicting content'), { ...equal, reviewId: null },
    { ...equal, shopId: '999', itemId: '888' }]]);
  try {
    const { output } = buildResearchReviewCorpus(state.source);
    assert.equal(output.coverage.rawRows, 8);
    assert.equal(output.coverage.recordGroups, 6);
    assert.equal(output.coverage.collapsedEqualDuplicateRows, 1);
    assert.equal(output.coverage.conflictingRecordGroups, 1);
    const duplicate = output.records[0]!;
    assert.equal(duplicate.identity.nativeReviewId, '10');
    assert.equal(duplicate.identity.internalLocator, null);
    assert.equal(duplicate.occurrenceCount, 2);
    assert.equal(duplicate.versions.length, 1);
    assert.deepEqual(duplicate.versions[0]!.sourceRefs.map(ref => [ref.pageIndex, ref.rowIndex, ref.textPointer]),
      [[0, 0, '/0/comment'], [1, 0, '/0/comment']]);
    const conflict = output.records[1]!;
    assert.equal(conflict.disposition, 'UNRESOLVED_CONFLICT');
    assert.equal(conflict.occurrenceCount, 2);
    assert.deepEqual(conflict.versions.map(version => version.text), ['Original content', 'Conflicting content']);
    assert.equal(output.records[2]!.identity.nativeReviewId, '12');
    assert.equal(output.records[2]!.versions[0]!.text, duplicate.versions[0]!.text);
    const missing = output.records.filter(row => row.identity.kind === 'SOURCE_ROW_LOCATOR');
    assert.equal(missing.length, 2); assert.notEqual(missing[0]!.identity.internalLocator, missing[1]!.identity.internalLocator);
    assert.equal(output.records[5]!.identity.nativeReviewId, '10');
    assert.equal(output.records[5]!.listingAdmission, 'WRONG_LISTING');
    assert.equal(output.records.reduce((sum, row) => sum + row.versions.reduce((n, version) => n + version.sourceRefs.length, 0), 0), 8);
    assert.equal(output.codingState, 'NOT_CODED');
  } finally { state.db.close(); }
});

test('corpus source integrity and exact replay reject missing pages, changed text or pointers despite a reissued snapshot hash', async () => {
  const state = await fixture([[review('1')]]);
  try {
    assert.throws(() => buildResearchReviewCorpus({ ...state.source, pages: [] }), /SOURCE_PAGE_MEMBERSHIP_MISMATCH/);
    assert.throws(() => buildResearchReviewCorpus({ ...state.source,
      pages: [{ ...state.source.pages[0]!, bytes: Buffer.from('[]') }] }), /SOURCE_PAGE_INTEGRITY_MISMATCH/);
    const { output } = buildResearchReviewCorpus(state.source);
    for (const mutation of ['text', 'pointer'] as const) {
      const tampered = structuredClone(output);
      if (mutation === 'text') tampered.records[0]!.versions[0]!.text = 'Changed synthetic text';
      else tampered.records[0]!.versions[0]!.sourceRefs[0]!.textPointer = '/1/comment';
      const { corpusId: _old, ...body } = tampered;
      tampered.corpusId = createHash('sha256').update(canonicalJson(body)).digest('hex');
      assert.throws(() => verifyResearchReviewCorpus(tampered, state.source), /REVIEW_CORPUS_REPLAY_MISMATCH/, mutation);
    }
    assert.equal((await state.foundation.readExact(state.source.packet.collectionId)).sha256, state.source.sha256);
  } finally { state.db.close(); }
});

test('oversized corpus fails explicitly without shortening text or deleting the retained raw capture', async () => {
  const text = 'x'.repeat(3 * 1024 * 1024);
  const state = await fixture([[review('1', text)], [review('2', text)], [review('3', text)]]);
  try {
    assert.throws(() => buildResearchReviewCorpus(state.source), /REVIEW_CORPUS_OUTPUT_TOO_LARGE/);
    const retained = await state.foundation.readExact(state.source.packet.collectionId);
    assert.equal(retained.pages.length, 3);
    assert.equal((JSON.parse(retained.pages[2]!.bytes.toString()) as Array<{ comment: string }>)[0]!.comment.length, 3 * 1024 * 1024);
  } finally { state.db.close(); }
});
