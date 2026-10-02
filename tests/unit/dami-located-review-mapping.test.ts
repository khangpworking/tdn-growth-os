import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import type { VerifiedSourcePackageFile } from '../../src/modules/foundation/source-package-service.js';
import { mapDamiLocatedReviewSource } from '../../src/modules/analysis/research-automation/dami-located-review-mapping.js';

const selected = { shopId: '100', itemId: '200' };
const row = (values: { [key: string]: unknown } = {}) => ({ type: 'review', shopid: '100', itemid: '200', cmtid: '1', comment: 'Original review', rating_star: 5, ...values });
const fileBytes = (bytes: Buffer): VerifiedSourcePackageFile => ({
  path: 'capture/dataset.json', bytes, byteSize: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'),
  mediaType: 'application/json', evidenceFamily: 'synthetic-dami-capture', representationRole: 'primary',
  independence: 'non_independent', providerProvenance: 'synthetic', provenanceBasis: 'Synthetic Dami transport fields; no provider call',
});
const file = (data: unknown) => fileBytes(Buffer.from(JSON.stringify(data)));

test('Dami transport preserves every original comment pointer, safe identity and review date without substituting acquisition time', () => {
  const date = '2025-06-03T09:10:11+07:00';
  const missingType: { [key: string]: unknown } = row({ cmtid: '8' }); delete missingType.type;
  const raw = [
    row({ shopid: 100, cmtid: '9007199254740993', comment: '😀 Exact original text <script>', review_date: date, ctime: 1748916611,
      collected_at: '2026-10-02T00:00:00Z', model_name: null }),
    row({ shopid: '999', cmtid: '2' }),
    row({ shopid: '0100', cmtid: '3' }),
    row({ cmtid: null, comment: ' \t ', ctime: 1748916611, collected_at: '2026-10-02T00:00:00Z' }),
    row({ cmtid: '4', comment: null, review_date: date }),
    row({ cmtid: '5', ctime: 1748916611, collected_at: '2026-10-02T00:00:00Z' }),
    row({ shopid: 9007199254740992, cmtid: 9007199254740992 }),
    row({ type: 'product', cmtid: '7' }), missingType, row({ type: null, cmtid: '9', comment: null }),
  ];
  const source = file(raw); const before = Buffer.from(source.bytes);
  const { records, mapping } = mapDamiLocatedReviewSource(source, selected);
  assert.deepEqual(records.map(record => [record.locator, record.text, record.disposition, record.timeText]), [
    ['/0/comment', raw[0]!.comment, 'INCLUDED', date], ['/1/comment', 'Original review', 'EXCLUDED', null],
    ['/2/comment', 'Original review', 'EXCLUDED', null], ['/3/comment', ' \t ', 'EXCLUDED', null],
    ['/4/comment', null, 'UNREADABLE', date], ['/5/comment', 'Original review', 'INCLUDED', null],
    ['/6/comment', 'Original review', 'EXCLUDED', null],
    ['/7/comment', 'Original review', 'EXCLUDED', null], ['/8/comment', 'Original review', 'EXCLUDED', null],
    ['/9/comment', null, 'UNREADABLE', null],
  ]);
  for (const [index, record] of records.entries()) {
    assert.equal(record.sourceSha256, source.sha256);
    assert.equal(record.text, raw[index]!.comment);
    assert.equal(mapping.rows[index]!.rowPointer, `/${index}`);
    assert.equal(mapping.rows[index]!.textPointer, record.locator);
  }
  assert.deepEqual(mapping.rows.map(mapped => [mapped.shopId, mapped.nativeReviewId, mapped.nativeIdState]),
    [['100', '9007199254740993', 'VALID'], ['999', '2', 'VALID'], [null, '3', 'VALID'], ['100', null, 'MISSING'],
      ['100', '4', 'VALID'], ['100', '5', 'VALID'], [null, null, 'UNRESOLVED'],
      ['100', '7', 'VALID'], ['100', '8', 'VALID'], ['100', '9', 'VALID']]);
  assert.deepEqual([mapping.rows[0]!.originalReviewDate, mapping.rows[0]!.ctime, mapping.rows[0]!.collectedAt,
    mapping.rows[0]!.modelNamePresent, mapping.rows[0]!.modelName], [date, 1748916611, '2026-10-02T00:00:00Z', true, null]);
  assert.deepEqual(mapping.rows.slice(7).map(mapped => [mapped.rowTypePresent, mapped.originalRowType, mapped.rowTypeAdmission, mapped.quarantined]),
    [[true, 'product', 'NON_REVIEW_ROW', true], [false, null, 'UNRESOLVED_ROW_TYPE', true], [true, null, 'UNRESOLVED_ROW_TYPE', true]]);
  assert.deepEqual(records.slice(7).map(record => record.dispositionReason),
    ['NON_REVIEW_ROW', 'UNRESOLVED_ROW_TYPE', 'UNRESOLVED_ROW_TYPE,UNREADABLE_TEXT']);
  assert.deepEqual(mapping.coverage, { rawRows: 10, includedRows: 2, excludedRows: 6, unreadableRows: 2,
    emptyTextRows: 1, wrongListingRows: 1, unresolvedListingRows: 2, nativeIdConflictRows: 0, nonReviewRows: 1, unresolvedRowTypeRows: 2 });
  assert.deepEqual(source.bytes, before);
});

test('Dami native-ID conflicts quarantine every affected row while equal duplicates remain separate located records', () => {
  const source = file([
    row(), row(),
    row({ cmtid: '2', comment: 'First text' }), row({ cmtid: '2', comment: 'Changed text' }),
    row({ cmtid: '3', rating_star: 5 }), row({ cmtid: '3', rating_star: '5' }),
    row({ cmtid: '4' }), row({ cmtid: '4', shopid: '999' }),
    row({ cmtid: '5', comment: null }), row({ cmtid: '5' }),
  ]);
  const { records, mapping } = mapDamiLocatedReviewSource(source, selected);
  assert.equal(records.length, 10);
  assert.deepEqual(records.map(record => record.disposition),
    ['INCLUDED', 'INCLUDED', 'EXCLUDED', 'EXCLUDED', 'EXCLUDED', 'EXCLUDED', 'EXCLUDED', 'EXCLUDED', 'UNREADABLE', 'EXCLUDED']);
  assert.deepEqual(mapping.rows.map(mapped => mapped.nativeIdConflicts), [[], [],
    ['NATIVE_ID_TEXT_CONFLICT'], ['NATIVE_ID_TEXT_CONFLICT'], ['NATIVE_ID_RATING_CONFLICT'], ['NATIVE_ID_RATING_CONFLICT'],
    ['NATIVE_ID_LISTING_CONFLICT'], ['NATIVE_ID_LISTING_CONFLICT'], ['NATIVE_ID_TEXT_CONFLICT'], ['NATIVE_ID_TEXT_CONFLICT']]);
  assert.deepEqual([mapping.rows[4]!.ratingStar, mapping.rows[5]!.ratingStar], [5, '5']);
  assert.equal(mapping.coverage.nativeIdConflictRows, 8);
  assert.equal(mapping.rows.slice(2).every(mapped => mapped.quarantined), true);
  assert.deepEqual(records.map(record => record.locator), Array.from({ length: 10 }, (_, index) => `/${index}/comment`));
});

test('Dami mapping rejects corrupt transport and nonexistent text pointers rather than fabricating null evidence', () => {
  const valid = file([row()]);
  const noComment: { [key: string]: unknown } = row(); delete noComment.comment;
  const cases: [VerifiedSourcePackageFile, RegExp][] = [
    [{ ...valid, mediaType: 'text/plain' }, /DAMI_JSON_SOURCE_REQUIRED/],
    [{ ...valid, sha256: 'f'.repeat(64) }, /DAMI_SOURCE_BYTES_MISMATCH/],
    [{ ...valid, byteSize: valid.byteSize + 1 }, /DAMI_SOURCE_BYTES_MISMATCH/],
    [fileBytes(Buffer.from([0xff])), /DAMI_SOURCE_NOT_UTF8/],
    [fileBytes(Buffer.from('[')), /DAMI_SOURCE_NOT_JSON/],
    [file({ records: [] }), /DAMI_SOURCE_NOT_ARRAY/],
    [file([null]), /DAMI_ROW_NOT_OBJECT:0/],
    [file([noComment]), /DAMI_COMMENT_POINTER_MISSING:0/],
    ...[42, false, [], {}].map(comment => [file([row({ comment })]), /DAMI_COMMENT_TYPE_UNSUPPORTED:0/] as [VerifiedSourcePackageFile, RegExp]),
    [fileBytes(Buffer.alloc(8 * 1024 * 1024 + 1, 32)), /DAMI_SOURCE_SIZE_INVALID/],
    [file(Array.from({ length: 10001 }, () => row())), /DAMI_SOURCE_RECORD_LIMIT/],
  ];
  for (const [source, expected] of cases) assert.throws(() => mapDamiLocatedReviewSource(source, selected), expected);
  for (const shopId of ['0100', '100 ', '0', '-100'])
    assert.throws(() => mapDamiLocatedReviewSource(valid, { shopId, itemId: '200' }), /DAMI_SELECTED_LISTING_ID_INVALID/);
});
