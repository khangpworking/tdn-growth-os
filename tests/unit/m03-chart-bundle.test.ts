import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { M03VerifiedMetricSet } from '../../contracts/analysis/m03-verified-metric-set.generated.js';
import { buildM03ChartBundle } from '../../src/modules/analysis/m03-chart-bundle.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

// Test-authoring gate: one behavior owner for chart data binding. Rendering is a
// later boundary; calculator arithmetic remains owned by its existing tests.
const sha = (label: string): string => createHash('sha256').update(label).digest('hex');

function metricSet(): M03VerifiedMetricSet {
  const preparationSha256 = sha('preparation');
  const readinessSha256 = sha('readiness');
  const catalogSha256 = sha('catalog');
  const inputSha256 = sha('input');
  const content: Omit<M03VerifiedMetricSet, 'metricSetSha256'> = {
    contractVersion: '1.0.0',
    request: {
      contractVersion: '1.0.0', sectionId: 'M03', recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
      preparationSha256, catalogSha256, readinessSha256,
    },
    section: {
      sectionId: 'M03', title: 'Quy mô và diễn biến', methodId: 'metric-scope-packet-totals', methodVersion: '1.0.0',
      recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
    },
    preparation: {
      preparationSha256, normalizedInputArtifactSha256: sha('input-artifact'), normalizedInputValueSha256: inputSha256,
    },
    readiness: {
      readinessSha256, profile: 'metric-preparation-readiness-v1', catalogId: 'synthetic-catalog',
      catalogVersion: '1.0.0', catalogSha256, state: 'READY_TO_CALCULATE',
    },
    calculation: {
      methodVersion: 'metric-scope-v1', rounding: 'percent-half-even-2-v1',
      verification: 'NORMALIZED_INPUT_ONLY', inputSha256,
    },
    scope: {
      key: 'synthetic', platform: 'shopee', selection: 'ON', start: '2026-01-01', end: '2026-01-31',
      periodBasis: 'Synthetic only', acquiredAt: null,
    },
    labelPolicy: {
      codebookVersion: 'synthetic-v1', wideUnknownPolicy: 'exclude',
      unknownRetention: 'RETAIN_IN_ALL_EXCLUDE_FROM_WIDE',
    },
    sources: [{
      sha256: sha('source'), label: 'Synthetic', representationRole: 'structured',
      evidenceFamily: 'synthetic', provenanceBasis: 'Test fixture only',
    }],
    scopes: [
      scope('all', [0, 1, 2], null, 2, 1, '12'),
      scope('wide', [0, 1], '0', 2, 0, '10'),
      scope('core', [0], '0', 1, 0, '5'),
    ],
    comparisons: [
      { from: 'all', to: 'wide', revenueDelta: null, unitsDelta: '-2', removedRecordIndices: [2] },
      { from: 'all', to: 'core', revenueDelta: null, unitsDelta: '-7', removedRecordIndices: [1, 2] },
    ],
    limitations: [
      'NORMALIZED_INPUT_ONLY',
      'MISSING_VALUES_ARE_NOT_ZERO',
      'ALL_WIDE_CORE_OVERLAP_AND_ARE_NOT_ADDITIVE',
      'UNKNOWN_IS_RETAINED_IN_ALL_AND_EXCLUDED_FROM_WIDE',
      'LISTING_IS_NOT_A_UNIQUE_PRODUCT',
      'MEMBERSHIP_DIFFERENCE_IS_NOT_MARKET_GROWTH_OR_CAUSATION',
    ],
  };
  return { ...content, metricSetSha256: sha(canonicalJson(content)) };
}

function scope(key: 'all' | 'wide' | 'core', recordIndices: number[], revenue: string | null, observed: number, missing: number, units: string) {
  return {
    key, recordIndices, listingCount: recordIndices.length, shopCount: recordIndices.length,
    revenue: { value: revenue, observedCount: observed, missingCount: missing, nonExactCount: 0, complete: missing === 0 },
    units: { value: units, observedCount: recordIndices.length, missingCount: 0, nonExactCount: 0, complete: true },
    warnings: missing ? ['MISSING_REVENUE' as const] : revenue === '0' ? ['ZERO_REVENUE' as const] : [],
  };
}

test('binds every M03 chart point to one exact verified metric set and preserves null as missing', () => {
  const metric = metricSet();
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
  assert.throws(() => buildM03ChartBundle({ ...request, metricSetSha256: sha('wrong') }, metric), /identity/);
  assert.throws(() => buildM03ChartBundle({ ...request, instructions: 'make the chart impressive' }, metric), /Invalid M03 chart request/);
});
