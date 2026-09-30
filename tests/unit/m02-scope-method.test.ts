import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildM02ScopeMethod } from '../../src/modules/analysis/m02-scope-method.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

const workbook = '1'.repeat(64);
const manifest = '2'.repeat(64);
const sources = [
  { role: 'workbook' as const, logicalPath: 'metric/workbook.xlsx', exportPath: 'raw-workbook.xlsx', sha256: workbook,
    byteSize: 100, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', evidenceFamily: 'metric',
    representationRole: 'primary' as const, independence: 'independent' as const, providerProvenance: 'synthetic' as const,
    provenanceBasis: 'synthetic fixture', period: { start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' } },
  { role: 'manifest' as const, logicalPath: 'metric/manifest.json', exportPath: 'raw-manifest.json', sha256: manifest,
    byteSize: 50, mediaType: 'application/json', evidenceFamily: 'metric', representationRole: 'structured' as const,
    independence: 'non_independent' as const, providerProvenance: 'synthetic' as const, provenanceBasis: 'synthetic fixture' },
];
const mappings = sources.map(source => ({ role: source.role, packageId: '00000000-0000-4000-8000-000000000001',
  logicalPath: source.logicalPath, packageFileSha256: source.sha256, rawByteSha256: source.sha256,
  byteSize: source.byteSize, mediaType: source.mediaType, evidenceFamily: source.evidenceFamily,
  providerProvenance: source.providerProvenance, provenanceBasis: source.provenanceBasis, exportPath: source.exportPath }));

test('M02 records exact scope, source membership and missing-versus-zero coverage deterministically', () => {
  const input = metricFixture();
  input.wideUnknownPolicy = 'exclude';
  input.records[0]!.revenue = { ...input.records[0]!.revenue, state: 'missing', value: null, displayedValue: null };
  input.records[1]!.revenue = { ...input.records[1]!.revenue, state: 'observed_zero', value: '0', displayedValue: '0' };
  input.records[0]!.label = null;
  const result = calculateMetricScopes(input);
  const first = buildM02ScopeMethod(input, result, sources, mappings);
  const second = buildM02ScopeMethod(input, result, sources, mappings);

  assert.deepEqual(second, first);
  assert.equal(first.output.scope.start, input.scope.start);
  assert.equal(first.output.measurement.wideUnknownPolicy, 'exclude');
  assert.equal(first.output.measurement.revenue.missing, 1);
  assert.equal(first.output.measurement.revenue.observedZero, input.records.filter(record => record.revenue.state === 'observed_zero').length);
  assert.equal(first.output.measurement.labels.unlabeled, 1);
  assert.equal(first.output.measurement.labelIssueCount, 1);
  assert.equal(first.output.sources[0]!.sha256, workbook);
  assert.equal(first.output.rawByteMappings[1]!.rawByteSha256, manifest);
});

test('M02 rejects source-to-raw membership drift and result/input drift', () => {
  const input = metricFixture();
  const result = calculateMetricScopes(input);
  assert.throws(() => buildM02ScopeMethod(input, result, sources, [{ ...mappings[0]!, rawByteSha256: '3'.repeat(64) }, mappings[1]!]), /RAW_MAPPING_MISMATCH/);
  const changed = metricFixture();
  changed.scope.key = 'changed';
  assert.throws(() => buildM02ScopeMethod(changed, result, sources, mappings), /RESULT_INPUT_MISMATCH/);
});
