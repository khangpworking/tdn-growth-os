import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildSourceAppendixProjection,
  E12_ATTRIBUTION,
  E13_ATTRIBUTION,
  SOURCE_APPENDIX_PROJECTION_CONTRACT,
  SourceAppendixProjectionError,
  type SourceAppendixProjectionInput,
  type SourceAppendixUsage,
} from '../../src/modules/analysis/source-appendix-projection.js';

function input(overrides: Partial<SourceAppendixProjectionInput> = {}): SourceAppendixProjectionInput {
  return {
    registry: {
      S07: { tiers: ['B'], reportName: 'bình luận công khai dưới video', group: 'CUSTOMER_VOICE' },
      S01: { tiers: ['C'], reportName: 'dữ liệu bán hàng ước tính trên sàn', group: 'SALES_MARKET' },
      S04: { tiers: ['B'], reportName: 'trang bán của người bán', group: 'SALES_MARKET' },
      S21: { tiers: ['A'], reportName: 'Cục Thống kê (nso.gov.vn)', group: 'MACRO' },
      S23: { tiers: ['A'], reportName: 'Ngân hàng Thế giới (World Bank Open Data)', group: 'MACRO' },
      S25: { tiers: ['B', 'C'], reportName: 'báo cáo đã công bố', group: 'DOCUMENTS' },
    },
    usages: [],
    ...overrides,
  };
}

function usage(overrides: Partial<SourceAppendixUsage> = {}): SourceAppendixUsage {
  return {
    registryId: 'S07', binding: { kind: 'capture', ref: 'a'.repeat(64) },
    l9: { excluded: 12, unclear: 3, byReason: { EXCLUDED_TERM: 12, UNRESOLVED_UNDIACRITICIZED: 3 } },
    l10SourceType: 'review-video', ...overrides,
  };
}

test('empty usages project zero rows without failure', () => {
  const projection = buildSourceAppendixProjection(input());
  assert.equal(projection.contractVersion, SOURCE_APPENDIX_PROJECTION_CONTRACT);
  assert.deepEqual(projection.rows, []);
});

test('rows derive tiers, names, L9, L10 and enforced attribution from the registry', () => {
  const projection = buildSourceAppendixProjection(input({ usages: [
    usage(),
    usage({ registryId: 'S21', binding: { kind: 'fetch', ref: 'nso-cpi-2026' }, l9: null, l10SourceType: null }),
    usage({ registryId: 'S23', binding: { kind: 'fetch', ref: 'wb-ny-gdp' }, l9: null, l10SourceType: null }),
    usage({ registryId: 'S25', binding: { kind: 'package', ref: 'pkg-1' }, l9: null, l10SourceType: null }),
  ] }));
  assert.deepEqual(projection.rows.map(row => row.registryId), ['S07', 'S21', 'S23', 'S25']);
  const s07 = projection.rows[0]!;
  assert.equal(s07.tier, 'B');
  assert.equal(s07.l9Excluded, 12);
  assert.equal(s07.l10SourceType, 'review-video');
  assert.equal(s07.attribution, null);
  assert.deepEqual(s07.binding, { kind: 'capture', ref: 'a'.repeat(64) });
  assert.equal(projection.rows[1]!.attribution, E12_ATTRIBUTION);
  assert.equal(projection.rows[2]!.attribution, E13_ATTRIBUTION);
  assert.equal(E12_ATTRIBUTION, 'Cục Thống kê (nso.gov.vn)');
  assert.equal(E13_ATTRIBUTION, 'Ngân hàng Thế giới (World Bank Open Data)');
  const s25 = projection.rows[3]!;
  assert.equal(s25.tier, null, 'Mixed tiers never collapse into a scalar aggregate');
  assert.equal(s25.tierDetail, 'S25: B; S25: C');
});

test('repeated IDs need distinct retained bindings and never share accounting', () => {
  const projection = buildSourceAppendixProjection(input({ usages: [
    usage({ binding: { kind: 'capture', ref: 'cap-1' }, l9: { excluded: 5, unclear: 0, byReason: { EXCLUDED_TERM: 5 } } }),
    usage({ binding: { kind: 'capture', ref: 'cap-2' }, l10SourceType: 'seller-video',
      l9: { excluded: 7, unclear: 1, byReason: { EXCLUDED_TERM: 7, NO_KEYWORD_MATCH: 1 } } }),
  ] }));
  assert.deepEqual(projection.rows.map(row => [row.registryId, row.l9Excluded, row.l10SourceType]),
    [['S07', 5, 'review-video'], ['S07', 7, 'seller-video']]);
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [
    usage({ binding: { kind: 'capture', ref: 'cap-1' } }),
    usage({ binding: { kind: 'capture', ref: 'cap-1' } }),
  ] })), /duplicate retained use/);
});

test('unknown IDs, tier D, bad bindings and malformed rows fail closed', () => {
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [usage({ registryId: 'S99' })] })), /unknown registry ID/);
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [usage({ registryId: 'S1' })] })), /unknown registry ID/);
  assert.throws(() => buildSourceAppendixProjection(input({
    registry: { S27: { tiers: ['D'], reportName: 'x', group: 'y' } }, usages: [usage({ registryId: 'S27' })],
  })), /keeps tier D out/);
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [usage({ binding: { kind: 'live' as never, ref: 'x' } })] })), /binding.kind/);
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [usage({ binding: { kind: 'capture', ref: '' } })] })), /binding.ref/);
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [usage({ l9: { excluded: -1, unclear: 0, byReason: {} } })] })), SourceAppendixProjectionError);
  assert.throws(() => buildSourceAppendixProjection(input({ usages: [usage({ l10SourceType: 'post' as never })] })), SourceAppendixProjectionError);
});
