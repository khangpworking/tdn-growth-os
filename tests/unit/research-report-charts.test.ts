import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import catalog from '../../docs/research/report-section-catalog-v1.json' with { type: 'json' };
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { calculateMetricScopes, metricLabelFingerprint } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildResearchReportChartData } from '../../src/modules/analysis/research-report-charts.js';
import { buildResearchChartSpec, verifyResearchChartSpec } from '../../src/modules/analysis/research-chart-spec.js';
import type { ResearchChartSpec } from '../../contracts/analysis/research-chart-spec.generated.js';

// Test-authoring gate: these tests own the chart builder's public boundary.
// They protect independently expected scope values and lineage, the credible
// regressions of plotting blocked denominators/labels, and exact replay
// rejection. ChartSpec coverage here uniquely owns the ChartData-to-visible-
// semantics boundary; package tests do not repeat exhaustive pointer mapping.
const bytes = (value: unknown): Buffer => Buffer.from(canonicalJson(value) + '\n');
const sha = (value: Buffer): string => createHash('sha256').update(value).digest('hex');
const pointerValue = (root: unknown, pointer: string): unknown => pointer.slice(1).split('/').reduce<unknown>((current, encoded) => {
  const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
  assert.ok(current !== null && typeof current === 'object' && key in current, pointer);
  return (current as Record<string, unknown>)[key];
}, root);
const inputs = (input = metricFixture(), definition: unknown = catalog) => {
  const resultPayload = calculateMetricScopes(input);
  const result = bytes(resultPayload);
  const sectionCatalog = bytes(definition);
  return { resultPayload, result, resultSha256: sha(result), catalog: sectionCatalog, catalogSha256: sha(sectionCatalog) };
};

test('builds independent scope totals and cumulative top-shop shares with claim lineage', () => {
  const input = inputs();
  const chart = buildResearchReportChartData(input.result, input.resultSha256, input.catalog, input.catalogSha256);
  assert.equal(chart.contractVersion, 'research-report-charts-v2');

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

  assert.equal(chart.scopeSensitivity.state, 'READY');
  assert.equal(chart.scopeSensitivity.relationship, 'FILTER_MEMBERSHIP_EFFECT_NOT_GROWTH');
  assert.deepEqual(chart.scopeSensitivity.comparisons.map(value => ({
    to: value.toScopeKey,
    revenueDelta: value.revenueDelta.value,
    unitsDelta: value.unitsDelta.value,
    removedCount: value.removedRecordCount,
    removed: value.removedRecordIndices,
  })), [
    { to: 'wide', revenueDelta: '-10', unitsDelta: '-1', removedCount: 1, removed: [4] },
    { to: 'core', revenueDelta: '-35', unitsDelta: '-8', removedCount: 3, removed: [2, 3, 4] },
  ]);
  assert.equal(chart.scopeSensitivity.comparisons[0]!.revenueDelta.pointer, '/comparisons/0/revenueDelta');
  assert.deepEqual(chart.scopeSensitivity.comparisons[0]!.blockers, []);
  for (const comparison of chart.scopeSensitivity.comparisons) {
    assert.equal(pointerValue(input.resultPayload, comparison.revenueDelta.pointer), comparison.revenueDelta.value);
    assert.equal(pointerValue(input.resultPayload, comparison.unitsDelta.pointer), comparison.unitsDelta.value);
    assert.deepEqual(pointerValue(input.resultPayload, comparison.removedRecordIndicesPointer), comparison.removedRecordIndices);
  }

  assert.equal(chart.groupComposition.state, 'READY');
  const allGroup = chart.groupComposition.scopes[0]!.points.find(point => point.group === 'G1')!;
  assert.equal(allGroup.revenueValue, '135');
  assert.equal(allGroup.sharePercent, '72.97');
  assert.equal(allGroup.basisPoints, 7297);
  assert.deepEqual(allGroup.recordIndices, [0, 2, 4]);
  assert.equal(allGroup.sharePointer, '/scopes/0/groups/0/revenueShare/percent');
  assert.equal(allGroup.numeratorValue, '135');
  assert.equal(allGroup.numeratorPointer, '/scopes/0/groups/0/revenueShare/numerator');
  assert.equal(allGroup.denominatorValue, '185');
  assert.equal(allGroup.denominatorPointer, '/scopes/0/groups/0/revenueShare/denominator');
  assert.deepEqual(allGroup.recordPointers, ['/input/records/0', '/input/records/2', '/input/records/4']);
  assert.equal(pointerValue(input.resultPayload, allGroup.revenuePointer), allGroup.revenueValue);
  assert.equal(pointerValue(input.resultPayload, allGroup.sharePointer!), allGroup.sharePercent);

  assert.equal(chart.topShopRemoval.state, 'PARTIAL');
  const removal = chart.topShopRemoval.scopes[0]!.point!;
  assert.equal(removal.removedShopKey, '["shopee","S1"]');
  assert.deepEqual(removal.removedRecordIndices, [0, 1]);
  assert.equal(removal.remainingRevenueValue, '35');
  assert.equal(removal.remainingRevenueSharePercent, '18.92');
  assert.equal(removal.concentrationAfterRemoval[0]!.sharePercent, '71.43');
  assert.equal(removal.remainingRevenueSharePointer, '/scopes/0/withoutTopShop/remainingRevenueShare/percent');
  assert.equal(removal.removedShopKeyPointer, '/scopes/0/withoutTopShop/removedShopKey');
  assert.equal(removal.membershipPointer, '/scopes/0/recordIndices');
  assert.equal(removal.remainingRevenueShareNumeratorPointer, '/scopes/0/withoutTopShop/remainingRevenueShare/numerator');
  assert.equal(removal.remainingRevenueShareDenominatorPointer, '/scopes/0/withoutTopShop/remainingRevenueShare/denominator');
  assert.equal(removal.remainingRevenueShareDenominatorValue, '185');
  assert.equal(removal.remainingListingCountPointer, '/scopes/0/withoutTopShop/listingCount');
  assert.equal(removal.concentrationAfterRemoval[0]!.denominatorPointer, '/scopes/0/withoutTopShop/concentration/0/share/denominator');
  assert.equal(removal.concentrationAfterRemoval[0]!.denominatorValue, '35');
  assert.equal(removal.concentrationAfterRemoval[0]!.usedShopCountPointer, '/scopes/0/withoutTopShop/concentration/0/usedShopCount');
  assert.equal(pointerValue(input.resultPayload, removal.removedShopKeyPointer), removal.removedShopKey);
  assert.equal(pointerValue(input.resultPayload, removal.remainingRevenueShareDenominatorPointer!), removal.remainingRevenueShareDenominatorValue);
  assert.equal(pointerValue(input.resultPayload, removal.concentrationAfterRemoval[0]!.denominatorPointer!), removal.concentrationAfterRemoval[0]!.denominatorValue);
  const coreRemoval = chart.topShopRemoval.scopes.find(scope => scope.scopeKey === 'core')!;
  assert.equal(coreRemoval.state, 'PARTIAL');
  assert.equal(coreRemoval.point?.remainingRevenueValue, null);
  assert.ok(coreRemoval.blockers.includes('core:REMAINING_REVENUE_UNAVAILABLE'));
});

test('materializes and replays the closed ChartSpec with exact evidence pointers', () => {
  const input = inputs();
  const chart = buildResearchReportChartData(input.result, input.resultSha256, input.catalog, input.catalogSha256);
  const chartBytes = bytes(chart);
  const built = buildResearchChartSpec(chart, chartBytes);
  assert.deepEqual(built.bytes, bytes(built.spec));
  const { chartSpecId, ...payload } = built.spec;
  assert.equal(chartSpecId, sha(Buffer.from(canonicalJson(payload))));
  assert.deepEqual(built.spec.views.map(view => view.viewId), [
    'scope-totals-revenue', 'scope-totals-units', 'scope-totals-listings', 'scope-totals-shops',
    'top-shop-share-all', 'top-shop-share-wide', 'top-shop-share-core',
    'scope-membership-sensitivity-revenue',
    'group-composition-all', 'group-composition-wide', 'group-composition-core',
    'top-shop-removal-all', 'top-shop-removal-wide', 'top-shop-removal-core',
  ]);
  assert.deepEqual(built.spec.policies.scopeOrder, ['all', 'wide', 'core']);
  assert.equal(built.spec.policies.unknownPolicy, 'VISIBLE_AND_INCLUDED_IN_WIDE');

  const revenue = built.spec.views.find(view => view.viewId === 'scope-totals-revenue')!;
  assert.deepEqual(revenue.marks.map(mark => mark.valueText), ['185', '175', '150']);
  assert.deepEqual(revenue.axes.category.categoryOrder, ['all', 'wide', 'core']);
  assert.equal(revenue.axes.value.domainPolicy, 'LOCAL_MAX');
  const top1 = built.spec.views.find(view => view.viewId === 'top-shop-share-all')!.marks[0]!;
  assert.equal(top1.claimId, 'M04:all:top1');
  assert.equal(top1.numeratorPointer, '/scopes/0/concentration/0/share/numerator');
  assert.equal(top1.denominatorPointer, '/scopes/0/concentration/0/share/denominator');
  const sensitivity = built.spec.views.find(view => view.viewId === 'scope-membership-sensitivity-revenue')!;
  assert.equal(sensitivity.axes.value.scale, 'LINEAR_SIGNED_ZERO_CENTERED');
  assert.deepEqual(sensitivity.annotations[0]!.values.map(value => [value.key, value.valueText]), [
    ['unitsDelta', '-1'], ['removedRecordCount', '1'],
  ]);
  const allGroups = built.spec.views.find(view => view.viewId === 'group-composition-all')!;
  assert.deepEqual(allGroups.axes.category.categoryOrder, ['G1', 'G2', 'UNKNOWN']);
  assert.deepEqual(allGroups.annotations[0]!.values.map(value => [value.key, value.valueText]), [
    ['listingCount', '3'], ['observedRevenue', '135'],
  ]);
  const removal = built.spec.views.find(view => view.viewId === 'top-shop-removal-all')!;
  assert.deepEqual(removal.annotations[0]!.values.map(value => value.key), [
    'remainingListingCount', 'remainingObservedRevenue',
  ]);
  assert.equal(removal.annotations[1]!.values[0]!.key, 'usedShopCount');

  for (const view of built.spec.views) {
    assert.notEqual(pointerValue(chart, view.sourcePointer), undefined);
    for (const mark of view.marks) {
      assert.equal(String(pointerValue(chart, mark.chartDataValuePointer)), mark.valueText);
      if (mark.chartDataGeometryPointer !== null) assert.notEqual(pointerValue(chart, mark.chartDataGeometryPointer), undefined);
      if (mark.chartDataMembershipPointer !== null) assert.notEqual(pointerValue(chart, mark.chartDataMembershipPointer), undefined);
      assert.equal(String(pointerValue(input.resultPayload, mark.resultValuePointer)), mark.valueText);
      for (const pointer of mark.resultEvidencePointers) assert.notEqual(pointerValue(input.resultPayload, pointer), undefined);
      if (mark.resultMembershipPointer !== null) assert.notEqual(pointerValue(input.resultPayload, mark.resultMembershipPointer), undefined);
      if (mark.numeratorPointer !== null) assert.notEqual(pointerValue(input.resultPayload, mark.numeratorPointer), undefined);
      if (mark.denominatorPointer !== null) assert.notEqual(pointerValue(input.resultPayload, mark.denominatorPointer), undefined);
    }
    for (const annotation of view.annotations) for (const value of annotation.values) {
      assert.equal(String(pointerValue(chart, value.chartDataValuePointer)), value.valueText);
      if (value.resultValuePointer !== null) {
        assert.equal(String(pointerValue(input.resultPayload, value.resultValuePointer)), value.valueText);
      } else {
        assert.equal(value.derivation, 'ARRAY_LENGTH');
        assert.equal((pointerValue(input.resultPayload, value.resultEvidencePointers[0]!) as unknown[]).length, Number(value.valueText));
      }
      for (const pointer of value.resultEvidencePointers) assert.notEqual(pointerValue(input.resultPayload, pointer), undefined);
    }
  }
  verifyResearchChartSpec(built.spec, chart, chartBytes);
  assert.throws(() => verifyResearchChartSpec(built.spec, chart, Buffer.from(canonicalJson(chart))), /NONCANONICAL_CHART_DATA/);

  const drifted = JSON.parse(canonicalJson(built.spec)) as ResearchChartSpec;
  drifted.views[0]!.title = 'Changed presentation meaning';
  const { chartSpecId: _oldId, ...driftPayload } = drifted;
  drifted.chartSpecId = sha(Buffer.from(canonicalJson(driftPayload)));
  assert.throws(() => verifyResearchChartSpec(drifted, chart, chartBytes), /SEMANTIC_DRIFT/);
});

test('keeps missing labels and zero denominators blocked with truthful empty lanes', () => {
  const missingLabel = metricFixture();
  missingLabel.records[0]!.label = null;
  const missing = inputs(missingLabel);
  const missingChart = buildResearchReportChartData(missing.result, missing.resultSha256, missing.catalog, missing.catalogSha256);
  const missingSpec = buildResearchChartSpec(missingChart, bytes(missingChart)).spec;
  assert.equal(missingChart.scopeSensitivity.state, 'BLOCKED');
  assert.equal(missingChart.scopeSensitivity.comparisons.length, 0);
  assert.equal(missingChart.groupComposition.state, 'BLOCKED');
  assert.equal(missingChart.groupComposition.scopes.every(scope => scope.points.length === 0), true);
  assert.equal(missingChart.topShopRemoval.state, 'PARTIAL');
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
  for (const metric of ['revenue', 'units', 'listings', 'shops']) {
    const view = missingSpec.views.find(item => item.viewId === `scope-totals-${metric}`)!;
    assert.deepEqual(view.marks.map(mark => mark.categoryKey), ['all']);
  }
  assert.equal(missingSpec.views.filter(view => view.viewId.startsWith('top-shop-share-') && view.viewId !== 'top-shop-share-all').every(view => view.marks.length === 0), true);
  assert.equal(missingSpec.views.filter(view => view.viewId.startsWith('group-composition-')).every(view => view.marks.length === 0), true);

  const zeroRevenue = metricFixture();
  for (const row of zeroRevenue.records) {
    row.revenue = { ...row.revenue, state: 'observed_zero', value: '0', displayedValue: '0' };
    row.label!.contentSha256 = metricLabelFingerprint(zeroRevenue.scope.platform, row);
  }
  const zero = inputs(zeroRevenue);
  const zeroChart = buildResearchReportChartData(zero.result, zero.resultSha256, zero.catalog, zero.catalogSha256);
  const zeroSpec = buildResearchChartSpec(zeroChart, bytes(zeroChart)).spec;
  assert.equal(zeroChart.totals.scopes[0]!.points.find(point => point.metric === 'revenue')?.value, '0');
  assert.equal(zeroChart.topShopShare.state, 'BLOCKED');
  assert.equal(zeroChart.topShopShare.scopes[0]!.points.length, 0);
  assert.ok(zeroChart.topShopShare.scopes[0]!.blockers.includes('all:top1:NO_ELIGIBLE_DENOMINATOR'));
  assert.ok(zeroChart.topShopShare.blockers.includes('top-shop-share:all:top1:NO_ELIGIBLE_DENOMINATOR'));
  // A zero denominator produces no eligible M04 fact claim in the verified
  // packet, so every M04-derived view must remain fail-closed rather than
  // exposing unclaimed group/removal observations.
  assert.equal(zeroChart.groupComposition.state, 'BLOCKED');
  assert.equal(zeroChart.groupComposition.scopes[0]!.state, 'BLOCKED');
  assert.equal(zeroChart.groupComposition.scopes[0]!.points.length, 0);
  assert.ok(zeroChart.groupComposition.scopes[0]!.blockers.includes('all:SECTION_HANDLER_NOT_CHARTABLE'));
  assert.equal(zeroChart.topShopRemoval.scopes[0]!.state, 'BLOCKED');
  assert.equal(zeroChart.topShopRemoval.scopes[0]!.point, null);
  assert.deepEqual(zeroSpec.views.find(view => view.viewId === 'scope-totals-revenue')!.marks.map(mark => mark.valueText), ['0', '0', '0']);
  assert.equal(zeroSpec.views.filter(view => view.viewId.startsWith('top-shop-share-') || view.viewId.startsWith('group-composition-') || view.viewId.startsWith('top-shop-removal-')).every(view => view.marks.length === 0), true);

  const incompleteRevenue = metricFixture();
  incompleteRevenue.records[0]!.revenue = {
    ...incompleteRevenue.records[0]!.revenue,
    state: 'missing', value: null, displayedValue: null,
  };
  incompleteRevenue.records[0]!.label!.contentSha256 = metricLabelFingerprint(
    incompleteRevenue.scope.platform, incompleteRevenue.records[0]!,
  );
  const incomplete = inputs(incompleteRevenue);
  const incompleteChart = buildResearchReportChartData(
    incomplete.result, incomplete.resultSha256, incomplete.catalog, incomplete.catalogSha256,
  );
  assert.equal(incompleteChart.scopeSensitivity.state, 'PARTIAL');
  assert.equal(incompleteChart.scopeSensitivity.comparisons[0]!.revenueDelta.value, null);
  assert.ok(incompleteChart.scopeSensitivity.comparisons[0]!.blockers.includes('wide:REVENUE_DELTA_UNAVAILABLE'));
  assert.equal(incompleteChart.groupComposition.state, 'BLOCKED');
  assert.equal(incompleteChart.groupComposition.scopes[0]!.state, 'BLOCKED');
  assert.equal(incompleteChart.groupComposition.scopes[0]!.points.length, 0);
  assert.ok(incompleteChart.groupComposition.scopes[0]!.blockers.includes('all:SECTION_HANDLER_NOT_CHARTABLE'));
  assert.equal(incompleteChart.topShopRemoval.scopes[0]!.point, null);
  assert.ok(incompleteChart.topShopRemoval.scopes[0]!.blockers.includes('all:TOP_SHOP_REMOVAL_UNAVAILABLE'));
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
  assert.equal(chart.scopeSensitivity.state, 'BLOCKED');
  assert.equal(chart.scopeSensitivity.comparisons.length, 0);
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
