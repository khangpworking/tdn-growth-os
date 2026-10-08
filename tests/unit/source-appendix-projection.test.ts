import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSourceAppendixProjection,
  SOURCE_APPENDIX_PROJECTION_CONTRACT,
  SourceAppendixProjectionError,
  type SourceAppendixSourceInput,
} from '../../src/modules/analysis/source-appendix-projection.js';

function entry(overrides: Partial<SourceAppendixSourceInput> = {}): SourceAppendixSourceInput {
  return {
    registryIds: ['S07'], tier: 'B', tierDetail: null, group: 'CUSTOMER_VOICE',
    reportName: 'bình luận công khai dưới video',
    l9: { excluded: 12, unclear: 3, byReason: { EXCLUDED_TERM: 12, UNRESOLVED_UNDIACRITICIZED: 3 } },
    l10SourceType: 'review-video', attribution: null, ...overrides,
  };
}

test('appendix expands one row per registry ID with tiers, names, L9, L10 and attribution', () => {
  const projection = buildSourceAppendixProjection([
    entry(),
    { registryIds: ['S01', 'S04'], tier: null, tierDetail: 'S01: C; S04: B', group: 'SALES_MARKET',
      reportName: 'dữ liệu bán hàng ước tính trên sàn; trang bán của người bán', l9: null, l10SourceType: null, attribution: null },
    { registryIds: ['S21'], tier: 'A', tierDetail: null, group: 'MACRO', reportName: 'Cục Thống kê (nso.gov.vn)',
      l9: null, l10SourceType: null, attribution: 'Cục Thống kê (nso.gov.vn)' },
  ]);
  assert.equal(projection.contractVersion, SOURCE_APPENDIX_PROJECTION_CONTRACT);
  assert.deepEqual(projection.rows.map(row => row.registryId), ['S07', 'S01', 'S04', 'S21']);
  const s07 = projection.rows[0]!;
  assert.equal(s07.tier, 'B');
  assert.equal(s07.reportName, 'bình luận công khai dưới video');
  assert.equal(s07.l9Excluded, 12);
  assert.equal(s07.l9Unclear, 3);
  assert.deepEqual(s07.l9Reasons, { EXCLUDED_TERM: 12, UNRESOLVED_UNDIACRITICIZED: 3 });
  assert.equal(s07.l10SourceType, 'review-video');
  const s01 = projection.rows[1]!;
  assert.equal(s01.tier, null, 'Mixed tiers never collapse into a scalar aggregate');
  assert.equal(s01.tierDetail, 'S01: C; S04: B');
  assert.equal(s01.l9Excluded, null, 'Non keyword-collected sources carry no L9 counts');
  const s21 = projection.rows[3]!;
  assert.equal(s21.attribution, 'Cục Thống kê (nso.gov.vn)', 'E12 attribution retained verbatim');
});

test('appendix rejects malformed, duplicate and invented rows', () => {
  assert.throws(() => buildSourceAppendixProjection([]), SourceAppendixProjectionError);
  assert.throws(() => buildSourceAppendixProjection([entry({ registryIds: ['X1'] })]), SourceAppendixProjectionError);
  assert.throws(() => buildSourceAppendixProjection([entry(), entry({ registryIds: ['S07'] })]), /duplicate registry ID/);
  assert.throws(() => buildSourceAppendixProjection([entry({ tier: 'E' as unknown as null })]), SourceAppendixProjectionError);
  assert.throws(() => buildSourceAppendixProjection([entry({ l9: { excluded: -1, unclear: 0, byReason: {} } })]), SourceAppendixProjectionError);
  assert.throws(() => buildSourceAppendixProjection([entry({ reportName: '' })]), SourceAppendixProjectionError);
});

test('projection is deterministic across reruns', () => {
  const sources = [entry()];
  assert.deepEqual(buildSourceAppendixProjection(sources), buildSourceAppendixProjection(sources));
});
