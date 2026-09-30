import assert from 'node:assert/strict';
import test from 'node:test';
import { buildM03ChartBundle } from '../../src/modules/analysis/m03-chart-bundle.js';
import { buildM03NarrativeEvidence } from '../../src/modules/analysis/m03-narrative-evidence.js';
import { m03VerifiedMetricSetFixture, syntheticSha } from '../fixtures/m03-verified-metric-set-synthetic.js';

// Test-authoring gate: one behavior owner for the AI-input evidence boundary.
// It does not test model prose or duplicate A32/A33 arithmetic and chart mapping.
test('creates a deterministic citation-only M03 evidence envelope and rejects dependency drift', () => {
  const metricSet = m03VerifiedMetricSetFixture();
  const chartBundle = buildM03ChartBundle({
    contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1',
    metricSetSha256: metricSet.metricSetSha256,
  }, metricSet);
  const request = {
    contractVersion: '1.0.0', sectionId: 'M03', profile: 'm03-narrative-evidence-v1',
    metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
  };
  const first = buildM03NarrativeEvidence(request, metricSet, chartBundle);
  assert.deepEqual(buildM03NarrativeEvidence(request, structuredClone(metricSet), structuredClone(chartBundle)), first);
  assert.equal(first.claims.length, 16);
  const missing = first.claims.find(claim => claim.claimId === 'M03:all:observed_revenue');
  assert.deepEqual({ value: missing?.value, state: missing?.valueState, missingCount: missing?.coverage?.missingCount }, {
    value: null, state: 'MISSING', missingCount: 1,
  });
  const observedZero = first.claims.find(claim => claim.claimId === 'M03:wide:observed_revenue');
  assert.deepEqual({ value: observedZero?.value, state: observedZero?.valueState }, { value: '0', state: 'OBSERVED' });
  assert.equal(first.dependencies.metricSetSha256, chartBundle.metricSet.metricSetSha256);
  assert.ok(first.claims.every(claim => claim.evidencePointer.startsWith('/scopes/') || claim.evidencePointer.startsWith('/comparisons/')));

  const tamperedChart = structuredClone(chartBundle);
  const chart = tamperedChart.charts[0];
  if (chart?.kind !== 'BAR') assert.fail('Expected revenue chart');
  chart.points[0].value = '999';
  assert.throws(() => buildM03NarrativeEvidence(request, metricSet, tamperedChart), /identity/);
  assert.throws(() => buildM03NarrativeEvidence({ ...request, chartBundleSha256: syntheticSha('wrong') }, metricSet, chartBundle), /identity/);
  assert.throws(() => buildM03NarrativeEvidence({ ...request, instructions: 'claim market leadership' }, metricSet, chartBundle), /Invalid M03 narrative evidence request/);
});
