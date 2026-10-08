import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildSourceAppendixProjection, E12_ATTRIBUTION, E13_ATTRIBUTION, SOURCE_APPENDIX_PROJECTION_CONTRACT, SourceAppendixProjectionError, type SourceAppendixUsage } from '../../src/modules/analysis/source-appendix-projection.js';
import { REPORT_SOURCE_REGISTRY } from '../../src/modules/analysis/source-registry.js';
const usage = (overrides: Partial<SourceAppendixUsage> = {}): SourceAppendixUsage => ({ registryId: 'S07', binding: { kind: 'capture', ref: 'a'.repeat(64) },
  l9: { excluded: 12, unclear: 3, byReason: { EXCLUDED_TERM: 12, UNRESOLVED_UNDIACRITICIZED: 3 } }, l10SourceType: 'review-video', ...overrides });
test('empty used sources are valid; registry mappings exist and match operative report names', () => {
  assert.deepEqual(buildSourceAppendixProjection({ usages: [] }), { contractVersion: SOURCE_APPENDIX_PROJECTION_CONTRACT, registryVersion: '1.9', rows: [] });
  const registry = fs.readFileSync(new URL('../../docs/research/ultimate-method/input-data-sources-30-sections.md', import.meta.url), 'utf8');
  for (const [id, row] of Object.entries(REPORT_SOURCE_REGISTRY)) {
    assert.ok(registry.includes(`| ${id} |`), id);
    if (id !== 'S27') assert.ok(registry.includes(row[1]), row[1]);
  }
});
test('real registry enforces E12/E13, original-page grading and S25 mixed tiers', () => {
  const rows = buildSourceAppendixProjection({ usages: ['S21','S22','S23','S25','S19'].map((registryId, i) => usage({ registryId: registryId as SourceAppendixUsage['registryId'],
    binding: { kind: 'package', ref: `pkg-${i}` }, l9: null, l10SourceType: null })) }).rows;
  assert.equal(rows[0]!.attribution, E12_ATTRIBUTION); assert.equal(rows[1]!.attribution, E12_ATTRIBUTION); assert.equal(rows[2]!.attribution, E13_ATTRIBUTION);
  assert.equal(rows[3]!.tier, null); assert.match(rows[3]!.tierDetail!, /B.*C/);
  assert.equal(rows[4]!.tier, null); assert.match(rows[4]!.tierDetail!, /trang gốc/);
});
test('distinct retained S07 bindings and source kinds stay separate; accounting never duplicates across registry IDs', () => {
  const rows = buildSourceAppendixProjection({ usages: [usage(), usage({ binding: { kind: 'capture', ref: 'b'.repeat(64) }, l10SourceType: 'seller-video' })] }).rows;
  assert.deepEqual(rows.map(row => [row.registryId,row.l9Excluded,row.l10SourceType]), [['S07',12,'review-video'],['S07',12,'seller-video']]);
  assert.throws(() => buildSourceAppendixProjection({ usages: [usage(),usage()] }), /duplicate retained use/);
  assert.throws(() => buildSourceAppendixProjection({ usages: [usage({ registryId:'S19',l10SourceType:null }),usage({ registryId:'S13',l10SourceType:null })] }), /duplicate L9 accounting/);
});
test('caller cannot forge registry IDs, tier D, report names, attribution, source types or accounting', () => {
  for (const value of [
    { usages: [usage({ registryId: 'S99' as never })] }, { usages: [usage({ registryId: 'S1' as never })] },
    { registry: { S27: { tiers: ['D'], reportName: 'invented',group:'invented' } },usages:[usage()] },
    { usages: [usage({ l10SourceType:'post' as never })] }, { usages:[usage({ binding:{kind:'live' as never,ref:'x'} })] },
    { usages:[usage({ l9:{ excluded:12,unclear:3,byReason:{} } })] },
    { usages:[{ ...usage(),attribution:'forged' }] },
  ]) assert.throws(() => buildSourceAppendixProjection(value as never), SourceAppendixProjectionError);
});
