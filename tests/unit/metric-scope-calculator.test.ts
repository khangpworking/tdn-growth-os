import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMetricScopes, metricLabelFingerprint, renderMetricScopeDraft } from '../../src/modules/analysis/metric-scope-calculator.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

test('independent methodology fixture: scopes, grouping, concentration, sensitivity and top-shop removal', () => {
  const result = calculateMetricScopes(metricFixture());
  const [all, wide, core] = result.scopes;
  assert.deepEqual(result.scopes.map(s => [s.listingCount, s.shopCount, s.revenue.value, s.units.value]), [[5, 3, '185', '23'], [4, 2, '175', '22'], [2, 1, '150', '15']]);
  assert.deepEqual(all.concentration[0]!.share, { numerator: '150', denominator: '185', percent: '81.08' });
  assert.equal(wide.concentration[0]!.share!.percent, '85.71');
  assert.equal(wide.concentration[1]!.usedShopCount, 2);
  assert.equal(core.concentration[0]!.share!.percent, '100.00');
  assert.deepEqual(core.groups.map(g => g.revenueShare!.percent), ['66.67', '33.33']);
  assert.equal(all.withoutTopShop!.revenue.value, '35');
  assert.equal(all.withoutTopShop!.concentration[0]!.share!.percent, '71.43');
  assert.equal(core.withoutTopShop!.revenue.value, null);
  assert.equal(core.withoutTopShop!.remainingRevenueShare, null);
  assert.deepEqual(result.comparisons.map(c => c.revenueDelta), ['-10', '-35']);
  assert.deepEqual(result.comparisons.map(c => c.unitsDelta), ['-1', '-8']);
  assert.deepEqual(result.comparisons[0]!.removedRecordIndices, [4]);
});

test('missing, zero, empty and non-exact observations preserve their distinct meaning', () => {
  const input = metricFixture();
  input.records[0]!.revenue = { ...input.records[0]!.revenue, state: 'missing', value: null, displayedValue: null };
  let all = calculateMetricScopes(input).scopes[0];
  assert.equal(all.revenue.value, '85');
  assert.equal(all.revenue.complete, false);
  assert.equal(all.revenue.missingCount, 1);
  assert.equal(all.concentration[0]!.share, null);
  assert.equal(all.withoutTopShop, null);
  assert.equal(calculateMetricScopes(input).comparisons[0]!.unitsDelta, '-1');
  const missingUnits = metricFixture();
  missingUnits.records[0]!.units = { ...missingUnits.records[0]!.units, state: 'missing', value: null };
  assert.equal(calculateMetricScopes(missingUnits).comparisons[0]!.unitsDelta, null);
  assert.equal(calculateMetricScopes(missingUnits).comparisons[0]!.revenueDelta, '-10');
  for (const r of input.records) r.revenue = { ...r.revenue, state: 'missing', value: null };
  assert.equal(calculateMetricScopes(input).scopes[0].revenue.value, null);
  for (const r of input.records) r.revenue = { ...r.revenue, state: 'observed_zero', value: '0' };
  all = calculateMetricScopes(input).scopes[0];
  assert.equal(all.revenue.value, '0'); assert.equal(all.revenue.complete, true); assert.equal(all.concentration[0]!.share, null);
  input.records[0]!.revenue.precision = 'estimated';
  assert.equal(calculateMetricScopes(input).scopes[0].revenue.nonExactCount, 1);
  input.records = [];
  assert.deepEqual(calculateMetricScopes(input).scopes[0].warnings, ['EMPTY_SCOPE']);
});

test('fresh UNKNOWN follows explicit profile; stale or mismatched labels block only classified scopes', () => {
  const input = metricFixture();
  input.wideUnknownPolicy = 'exclude';
  assert.equal(calculateMetricScopes(input).scopes[1].revenue.value, '150');
  input.records[0]!.title = 'Changed title';
  let output = calculateMetricScopes(input);
  assert.equal(output.scopes[0].revenue.value, '185');
  assert.ok(output.scopes[0].warnings.includes('LABELS_REQUIRE_ADJUDICATION'));
  assert.equal(output.scopes[1].status, 'BLOCKED_LABELS');
  assert.equal(output.scopes[2].revenue.value, null);
  assert.equal(output.labelIssues[0]!.reason, 'STALE_LABEL');
  input.records[0]!.label!.contentSha256 = metricLabelFingerprint(input.scope.platform, input.records[0]!);
  input.records[0]!.label!.methodVersion = 'different-method';
  output = calculateMetricScopes(input);
  assert.equal(output.labelIssues[0]!.reason, 'CODEBOOK_MISMATCH');
  input.records[0]!.label = null;
  assert.equal(calculateMetricScopes(input).labelIssues[0]!.reason, 'MISSING_LABEL');
});

test('invalid input cannot be silently dropped, merged, repaired or assigned a new period', () => {
  const mutations: ((i: ReturnType<typeof metricFixture>) => void)[] = [
    i => { i.records.push(structuredClone(i.records[0]!)); },
    i => { i.records[0]!.revenue.value = '-1'; },
    i => { i.records[0]!.revenue.value = '1.5'; },
    i => { i.records[0]!.revenue.value = '0'; },
    i => { i.records[0]!.source.sourceSha256 = 'b'.repeat(64); },
    i => { i.records[0]!.measurement.end = '2026-09-14'; },
    i => { i.records[0]!.measurement.platform = 'tiktok'; },
    i => { i.records[0]!.measurement.profileId = 'different'; },
    i => { i.records[0]!.measurement.selection = 'OFF'; },
    i => { i.scope.start = '2026-99-99'; },
    i => { i.scope.start = '2027-01-01'; },
  ];
  for (const mutate of mutations) { const input = metricFixture(); mutate(input); assert.throws(() => calculateMetricScopes(input)); }
  assert.throws(() => calculateMetricScopes({ ...metricFixture(), arbitraryInstructions: 'invent conclusions' }));
});

test('exact arithmetic, half-even rounding and stable tie order do not depend on floats or locale', () => {
  const input = metricFixture();
  input.records = input.records.slice(0, 3);
  for (const [i, r] of input.records.entries()) { r.shopId = `S${i}`; r.revenue.value = ['1', '3', '28'][i]!; r.label!.group = `G${i}`; r.label!.contentSha256 = metricLabelFingerprint(input.scope.platform, r); }
  assert.deepEqual(calculateMetricScopes(input).scopes[0].groups.map(g => g.revenueShare!.percent), ['3.12', '9.38', '87.50']);
  for (const r of input.records) r.revenue.value = '900719925474099312345';
  const all = calculateMetricScopes(input).scopes[0];
  assert.equal(all.revenue.value, '2702159776422297937035');
  assert.deepEqual(all.shops.map(s => s.shopKey), ['["shopee","S0"]', '["shopee","S1"]', '["shopee","S2"]']);
});

test('fixed narrative is replay-checked, inert, deterministic and linked to changed metrics', () => {
  const input = metricFixture();
  input.scope.key = '<img onerror=alert(1)>|[bad](https://example.test)';
  for (const row of input.records) row.measurement.scopeKey = input.scope.key;
  const first = calculateMetricScopes(input);
  assert.deepEqual(calculateMetricScopes(structuredClone(input)), first);
  const report = renderMetricScopeDraft(first);
  assert.ok(report.includes('185 VND')); assert.ok(!report.includes('<img'));
  assert.ok(report.includes('/scopes/0/revenue'));
  const changed = structuredClone(first); changed.scopes[0].revenue.value = '999';
  assert.throws(() => renderMetricScopeDraft(changed), /replay/);
  input.records[0]!.revenue.value = '200';
  const second = calculateMetricScopes(input);
  assert.notEqual(first.inputSha256, second.inputSha256);
  assert.ok(renderMetricScopeDraft(second).includes('285 VND'));
});
