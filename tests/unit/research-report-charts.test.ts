import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildResearchReportChartData } from '../../src/modules/analysis/research-report-charts.js';

// Test-authoring gate: these tests own the chart builder's public boundary.
// They protect independently expected scope values and lineage, the credible
// regressions of plotting blocked denominators/labels, and exact replay
// rejection; packet tests do not exercise chart selection or chart geometry.
const bytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value) + '\n');
const sha = (value: Buffer): string => createHash('sha256').update(value).digest('hex');
const inputs = (input = metricFixture(), definition: unknown = catalog) => {
  const resultPayload = calculateMetricScopes(input);
  const result = bytes(resultPayload);
  const sectionCatalog = bytes(definition);
  return { resultPayload, result, resultSha256: sha(result), catalog: sectionCatalog, catalogSha256: sha(sectionCatalog) };
};

test('builds independent scope totals and cumulative top-shop shares with claim lineage', () => {
  const input = inputs();
  const chart = buildResearchReportChartData(input.result, input.resultSha256, input.catalog, input.catalogSha256);

  assert.equal(chart.approvalState, 'UNREVIEWED');
  assert.deepEqual(chart.computation, {
    inputSha256: input.resultPayload.inputSha256,
    methodVersion: 'metric-scope-v1',
    rounding: 'percent-half-even-2-v1',
    rendererVersion: 'metric-draft-vi-v1',
    profileId: 'synthetic-profile-v1',
    labelCodebookVersion: 'synthetic-codebook-v1',
    wideUnknownPolicy: 'include',
  });
  assert.deepEqual(chart.scopeKeys, ['all', 'wide', 'core']);
  assert.equal(chart.totals.state, 'READY');
  assert.equal(chart.totals.sectionId, 'M03');
  assert.equal(chart.totals.sectionDeliveryState, 'PARTIAL_DETERMINISTIC_DRAFT');
  assert.equal(chart.totals.relationship, 'OVERLAPPING_NON_ADDITIVE');
  assert.deepEqual(chart.totals.scopes.map(scope => scope.points.find(point => point.metric === 'revenue')?.value), ['185', '175', '150']);
  assert.deepEqual(chart.totals.scopes.map(scope => scope.points.find(point => point.metric === 'listings')?.value), [5, 4, 2]);

  assert.equal(chart.topShopShare.state, 'READY');
  assert.equal(chart.topShopShare.sectionId, 'M04');
  assert.equal(chart.topShopShare.sectionDeliveryState, 'PARTIAL_DETERMINISTIC_DRAFT');
  assert.equal(chart.topShopShare.relationship, 'CUMULATIVE_OVERLAPPING_NOT_DONUT');
  const allTop = chart.topShopShare.scopes[0]!;
  const top1 = allTop.points.find(point => point.metric === 'top1')!;
  assert.equal(top1.percentText, '81.08');
  assert.equal(top1.value, '81.08');
  assert.equal(top1.basisPoints, 8108);
  assert.deepEqual(top1.denominator, { value: '185', unit: 'VND', pointer: '/scopes/0/concentration/0/share/denominator' });
  assert.equal(top1.claimId, 'M04:all:top1');
  assert.equal(top1.sectionId, 'M04');
  assert.equal(top1.resultSha256, input.resultSha256);
  assert.equal(top1.metricPointer, '/scopes/0/concentration/0/share/percent');
  assert.equal(top1.membershipPointer, '/scopes/0/recordIndices');
  assert.equal(top1.coveragePointer, '/scopes/0/revenue');
  assert.equal(top1.denominatorPointer, '/scopes/0/concentration/0/share/denominator');
  assert.equal(top1.numeratorPointer, '/scopes/0/concentration/0/share/numerator');
  assert.deepEqual(top1.numerator, { value: '150', unit: 'VND', pointer: '/scopes/0/concentration/0/share/numerator' });
  assert.equal(top1.source.scopeKey, 'all');
  assert.deepEqual(top1.source.period, {
    start: '2026-08-17', end: '2026-09-15', periodBasis: 'Synthetic declared period', acquiredAt: '2026-09-16T00:00:00Z',
  });
  assert.ok(top1.limits.includes('OBSERVED_EXPORT_SCOPE_NOT_MARKET_UNIVERSE'));
  assert.ok(top1.limits.includes('CUMULATIVE_TOP_K_SHARES_OVERLAP_NOT_DONUT'));
});

test('keeps missing labels and zero denominators blocked with truthful empty lanes', () => {
  const missingLabel = metricFixture();
  missingLabel.records[0]!.label = null;
  const missing = inputs(missingLabel);
  const missingChart = buildResearchReportChartData(missing.result, missing.resultSha256, missing.catalog, missing.catalogSha256);
  assert.equal(missingChart.totals.scopes.find(scope => scope.scopeKey === 'all')?.state, 'READY');
  for (const scopeKey of ['wide', 'core'] as const) {
    const totals = missingChart.totals.scopes.find(scope => scope.scopeKey === scopeKey)!;
    const top = missingChart.topShopShare.scopes.find(scope => scope.scopeKey === scopeKey)!;
    assert.equal(totals.state, 'BLOCKED');
    assert.equal(top.state, 'BLOCKED');
    assert.ok(totals.blockers.includes(`${scopeKey}:BLOCKED_LABELS`));
    assert.equal(totals.points.length, 0);
    assert.equal(top.points.length, 0);
  }

  const zeroRevenue = metricFixture();
  for (const row of zeroRevenue.records) row.revenue = { ...row.revenue, state: 'observed_zero', value: '0', displayedValue: '0' };
  const zero = inputs(zeroRevenue);
  const zeroChart = buildResearchReportChartData(zero.result, zero.resultSha256, zero.catalog, zero.catalogSha256);
  assert.equal(zeroChart.totals.scopes[0]!.points.find(point => point.metric === 'revenue')?.value, '0');
  assert.equal(zeroChart.topShopShare.state, 'BLOCKED');
  assert.equal(zeroChart.topShopShare.scopes[0]!.points.length, 0);
  assert.ok(zeroChart.topShopShare.scopes[0]!.blockers.includes('all:top1:NO_ELIGIBLE_DENOMINATOR'));
  assert.ok(zeroChart.topShopShare.blockers.includes('top-shop-share:all:top1:NO_ELIGIBLE_DENOMINATOR'));
});

test('does not chart a section whose catalog method handler is not exact', () => {
  const changedCatalog = structuredClone(catalog);
  changedCatalog.sections.find(section => section.sectionId === 'M03')!.methodVersion = '2.0.0';
  const input = inputs(metricFixture(), changedCatalog);
  const chart = buildResearchReportChartData(input.result, input.resultSha256, input.catalog, input.catalogSha256);
  assert.equal(chart.totals.exactMethodHandler, false);
  assert.equal(chart.totals.state, 'BLOCKED');
  assert.ok(chart.totals.blockers.includes('scope-totals:SECTION_HANDLER_NOT_CHARTABLE'));
  assert.equal(chart.totals.scopes.every(scope => scope.points.length === 0), true);
  assert.equal(chart.topShopShare.exactMethodHandler, true);
  assert.equal(chart.topShopShare.state, 'READY');
});

test('rejects an untrusted changed result even when its changed bytes have a matching digest', () => {
  const calculated = calculateMetricScopes(metricFixture());
  const changed = structuredClone(calculated);
  changed.scopes[0]!.revenue.value = '999';
  const result = bytes(changed);
  const input = inputs();
  assert.throws(
    () => buildResearchReportChartData(result, sha(result), input.catalog, input.catalogSha256),
    /DETERMINISTIC_REPLAY_MISMATCH/,
  );
});
