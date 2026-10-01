import assert from 'node:assert/strict';
import test from 'node:test';
import { buildM03ChartBundle } from '../../src/modules/analysis/m03-chart-bundle.js';
import { m03VerifiedMetricSetFixture, syntheticSha } from '../fixtures/m03-verified-metric-set-synthetic.js';

// Test-authoring gate: one behavior owner for chart data binding. Rendering is a
// later boundary; calculator arithmetic remains owned by its existing tests.
test('binds every M03 chart point to one exact verified metric set and preserves null as missing', () => {
  const metric = m03VerifiedMetricSetFixture();
  const request = {
    contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1', metricSetSha256: metric.metricSetSha256,
  };
  const first = buildM03ChartBundle(request, metric);
  assert.deepEqual(buildM03ChartBundle(request, structuredClone(metric)), first);
  assert.deepEqual(first.charts.map(chart => chart.chartId), [
    'm03-observed-revenue-by-scope', 'm03-observed-units-by-scope', 'm03-membership-revenue-sensitivity',
  ]);
  const revenue = first.charts[0];
  assert.equal(revenue?.kind, 'BAR');
  if (!revenue || revenue.kind !== 'BAR') assert.fail('Expected revenue scope chart');
  assert.equal(revenue.points[0].value, null);
  assert.equal(revenue.points[0].missingCount, 1);
  assert.equal(first.metricSet.metricSetSha256, metric.metricSetSha256);

  const tampered = structuredClone(metric);
  tampered.scopes[1].revenue.value = '999';
  assert.throws(() => buildM03ChartBundle(request, tampered), /identity/);
  assert.throws(() => buildM03ChartBundle({ ...request, metricSetSha256: syntheticSha('wrong') }, metric), /identity/);
  assert.throws(() => buildM03ChartBundle({ ...request, instructions: 'make the chart impressive' }, metric), /Invalid M03 chart request/);
});
