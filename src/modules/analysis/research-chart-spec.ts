import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/research-chart-spec.schema.json' with { type: 'json' };
import type { ResearchChartSpec } from '../../../contracts/analysis/research-chart-spec.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { ResearchReportChartData } from './research-report-charts.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<ResearchChartSpec>(schema);
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const scopeOrder = ['all', 'wide', 'core'] as const;
const MAX_GROUP_CATEGORIES = 100;

function codeUnitCompare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function atPointer(value: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) return undefined;
  let current: unknown = value;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
      current = current[Number(key)];
    } else if (current !== null && typeof current === 'object' && Object.prototype.hasOwnProperty.call(current, key)) {
      current = (current as Record<string, unknown>)[key];
    } else return undefined;
  }
  return current;
}

function exact(actual: readonly unknown[], expected: readonly unknown[], code: string): void {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new TypeError(`chart spec: ${code}`);
  }
}

function assertChartDataOrder(charts: ResearchReportChartData): void {
  exact(charts.scopeKeys, scopeOrder, 'SCOPE_ORDER_MISMATCH');
  exact(charts.totals.scopes.map(item => item.scopeKey), scopeOrder, 'TOTAL_SCOPE_ORDER_MISMATCH');
  exact(charts.topShopShare.scopes.map(item => item.scopeKey), scopeOrder, 'TOP_SHARE_SCOPE_ORDER_MISMATCH');
  exact(charts.groupComposition.scopes.map(item => item.scopeKey), scopeOrder, 'GROUP_SCOPE_ORDER_MISMATCH');
  exact(charts.topShopRemoval.scopes.map(item => item.scopeKey), scopeOrder, 'REMOVAL_SCOPE_ORDER_MISMATCH');
  if (charts.scopeSensitivity.comparisons.length > 0) {
    exact(charts.scopeSensitivity.comparisons.map(item => item.toScopeKey), ['wide', 'core'], 'SENSITIVITY_ORDER_MISMATCH');
  }
  for (const lane of charts.topShopShare.scopes) {
    if (lane.points.length > 0) exact(lane.points.map(item => item.metric), ['top1', 'top3', 'top10'], 'TOP_K_ORDER_MISMATCH');
  }
  for (const lane of charts.groupComposition.scopes) {
    const groups = lane.points.map(item => item.group);
    if (new Set(groups).size !== groups.length) throw new TypeError('chart spec: DUPLICATE_GROUP_KEY');
    exact(groups, [...groups].sort(codeUnitCompare), 'GROUP_ORDER_MISMATCH');
  }
  for (const lane of charts.topShopRemoval.scopes) {
    if (lane.point !== null) exact(lane.point.concentrationAfterRemoval.map(item => item.k), [1, 3, 10], 'REMOVAL_TOP_K_ORDER_MISMATCH');
  }
}

type MarkEvidencePointers = ResearchChartSpec['views'][number]['marks'][number]['resultEvidencePointers'];

function compactPointers(values: readonly (string | null)[]): MarkEvidencePointers {
  const pointers = [...new Set(values.filter((value): value is string => value !== null))];
  if (pointers.length < 1 || pointers.length > 20) throw new TypeError('chart spec: INVALID_EVIDENCE_POINTER_COUNT');
  return pointers as MarkEvidencePointers;
}

function mark(value: Omit<ResearchChartSpec['views'][number]['marks'][number], 'markId'>) {
  return { ...value, markId: sha256(canonicalJson(value)) };
}

function axes(
  unit: 'VND' | 'unit' | 'listing' | 'shop' | 'percent',
  scale: 'LINEAR_ZERO_TO_LOCAL_MAX' | 'LINEAR_ZERO_TO_100' | 'LINEAR_SIGNED_ZERO_CENTERED',
  domainPolicy: 'LOCAL_MAX' | 'FIXED_0_100' | 'SYMMETRIC_LOCAL_MAX_ABSOLUTE',
  geometryPolicy: 'SOURCE_BASIS_POINTS' | 'LOCAL_MAX_EXACT_VALUE' | 'LOCAL_MAX_ABSOLUTE_SIGNED_VALUE',
  orderPolicy: 'FIXED_SCOPE_ORDER' | 'FIXED_TOP_K_ORDER' | 'FIXED_WIDE_CORE_ORDER' | 'SOURCE_GROUP_KEY_ORDER' | 'FIXED_REMOVAL_METRIC_ORDER',
  categoryOrder: readonly string[],
) {
  return {
    category: { orientation: 'VERTICAL' as const, orderPolicy, categoryOrder: [...categoryOrder] },
    value: { orientation: 'HORIZONTAL' as const, unit, scale, zeroBaseline: true as const, domainPolicy, geometryPolicy },
  };
}

function totalsViews(charts: ResearchReportChartData) {
  const definitions = [
    ['revenue', 'Doanh thu quan sát theo phạm vi', 'VND'],
    ['units', 'Sản lượng quan sát theo phạm vi', 'unit'],
    ['listings', 'Số listing quan sát theo phạm vi', 'listing'],
    ['shops', 'Số shop quan sát theo phạm vi', 'shop'],
  ] as const;
  return definitions.map(([metric, title, unit]) => {
    const marks = charts.totals.scopes.flatMap((lane, scopeIndex) => {
      const pointIndex = lane.points.findIndex(point => point.metric === metric);
      if (pointIndex < 0) return [];
      const point = lane.points[pointIndex]!;
      return [mark({
        seriesKey: metric, categoryKey: lane.scopeKey, valueText: point.valueText, unit,
        chartDataValuePointer: `/totals/scopes/${scopeIndex}/points/${pointIndex}/valueText`,
        chartDataGeometryPointer: null, chartDataMembershipPointer: null,
        claimId: point.claimId, resultSha256: point.resultSha256, resultValuePointer: point.metricPointer,
        resultMembershipPointer: point.membershipPointer, numeratorPointer: point.numeratorPointer,
        denominatorPointer: point.denominatorPointer,
        resultEvidencePointers: compactPointers([
          point.metricPointer, point.scopePointer, point.membershipPointer, point.coveragePointer,
          point.numeratorPointer, point.denominatorPointer,
        ]),
      })];
    });
    const blockers = charts.totals.scopes.flatMap(lane =>
      lane.points.some(point => point.metric === metric) ? [] : lane.blockers);
    return {
      viewId: `scope-totals-${metric}`,
      sourceChartId: 'scope-totals', sourcePointer: '/totals', sectionId: 'M03', title,
      state: marks.length === scopeOrder.length ? 'READY' : marks.length === 0 ? 'BLOCKED' : 'PARTIAL',
      markType: 'HORIZONTAL_BAR', orientation: 'HORIZONTAL',
      axes: axes(unit, 'LINEAR_ZERO_TO_LOCAL_MAX', 'LOCAL_MAX', 'LOCAL_MAX_EXACT_VALUE', 'FIXED_SCOPE_ORDER', scopeOrder),
      relationship: 'OVERLAPPING_NON_ADDITIVE', marks, annotations: [], blockers: [...new Set(blockers)],
      limitations: ['OBSERVED_EXPORT_SCOPE_NOT_MARKET_UNIVERSE', 'ALL_WIDE_CORE_SCOPES_OVERLAP_AND_ARE_NOT_ADDITIVE', 'LOCAL_MAX_BAR_GEOMETRY_IS_NOT_CROSS_PANEL_COMPARABLE'],
    };
  });
}

function topShareViews(charts: ResearchReportChartData) {
  return charts.topShopShare.scopes.map((lane, scopeIndex) => ({
    viewId: `top-shop-share-${lane.scopeKey}`,
    sourceChartId: 'top-shop-share', sourcePointer: `/topShopShare/scopes/${scopeIndex}`, sectionId: 'M04',
    title: `Tỷ trọng doanh thu quan sát lũy kế theo shop · ${lane.scopeKey.toUpperCase()}`,
    state: lane.state, markType: 'HORIZONTAL_BAR', orientation: 'HORIZONTAL',
    axes: axes('percent', 'LINEAR_ZERO_TO_100', 'FIXED_0_100', 'SOURCE_BASIS_POINTS', 'FIXED_TOP_K_ORDER', ['top1', 'top3', 'top10']),
    relationship: 'CUMULATIVE_OVERLAPPING_NOT_DONUT',
    marks: lane.points.map((point, pointIndex) => mark({
      seriesKey: point.metric, categoryKey: point.metric, valueText: point.valueText, unit: 'percent',
      chartDataValuePointer: `/topShopShare/scopes/${scopeIndex}/points/${pointIndex}/valueText`,
      chartDataGeometryPointer: `/topShopShare/scopes/${scopeIndex}/points/${pointIndex}/basisPoints`,
      chartDataMembershipPointer: null, claimId: point.claimId, resultSha256: point.resultSha256,
      resultValuePointer: point.metricPointer, resultMembershipPointer: point.membershipPointer,
      numeratorPointer: point.numeratorPointer, denominatorPointer: point.denominatorPointer,
      resultEvidencePointers: compactPointers([
        point.metricPointer, point.scopePointer, point.membershipPointer, point.coveragePointer,
        point.numeratorPointer, point.denominatorPointer,
      ]),
    })),
    annotations: [], blockers: lane.blockers,
    limitations: ['CUMULATIVE_TOP_K_SHARES_OVERLAP_AND_MUST_NOT_BE_SUMMED', 'WITHIN_SCOPE_DENOMINATOR_ONLY', 'NOT_MARKET_SHARE_OR_MARKET_COVERAGE'],
  }));
}

function sensitivityView(charts: ResearchReportChartData) {
  return {
    viewId: 'scope-membership-sensitivity-revenue',
    sourceChartId: 'scope-membership-sensitivity', sourcePointer: '/scopeSensitivity', sectionId: 'M03',
    title: 'Chênh doanh thu quan sát khi đổi membership từ ALL', state: charts.scopeSensitivity.state,
    markType: 'HORIZONTAL_BAR', orientation: 'HORIZONTAL',
    axes: axes('VND', 'LINEAR_SIGNED_ZERO_CENTERED', 'SYMMETRIC_LOCAL_MAX_ABSOLUTE', 'LOCAL_MAX_ABSOLUTE_SIGNED_VALUE', 'FIXED_WIDE_CORE_ORDER', ['wide', 'core']),
    relationship: 'FILTER_MEMBERSHIP_EFFECT_NOT_GROWTH',
    marks: charts.scopeSensitivity.comparisons.flatMap((comparison, index) => comparison.revenueDelta.value === null ? [] : [mark({
      seriesKey: 'revenue-delta', categoryKey: comparison.toScopeKey, valueText: comparison.revenueDelta.value,
      unit: 'VND', chartDataValuePointer: `/scopeSensitivity/comparisons/${index}/revenueDelta/value`,
      chartDataGeometryPointer: null,
      chartDataMembershipPointer: `/scopeSensitivity/comparisons/${index}/removedRecordIndices`,
      claimId: null, resultSha256: comparison.resultSha256, resultValuePointer: comparison.revenueDelta.pointer,
      resultMembershipPointer: comparison.removedRecordIndicesPointer, numeratorPointer: null, denominatorPointer: null,
      resultEvidencePointers: [comparison.revenueDelta.pointer, comparison.unitsDelta.pointer, comparison.removedRecordIndicesPointer],
    })]),
    annotations: charts.scopeSensitivity.comparisons.map((comparison, index) => ({
      categoryKey: comparison.toScopeKey,
      values: [
        ...(comparison.unitsDelta.value === null ? [] : [{
          key: 'unitsDelta' as const, valueText: comparison.unitsDelta.value, unit: 'unit' as const,
          derivation: 'DIRECT' as const,
          chartDataValuePointer: `/scopeSensitivity/comparisons/${index}/unitsDelta/value`,
          resultValuePointer: comparison.unitsDelta.pointer,
          resultEvidencePointers: [comparison.unitsDelta.pointer],
        }]),
        {
          key: 'removedRecordCount' as const, valueText: String(comparison.removedRecordCount), unit: 'record' as const,
          derivation: 'ARRAY_LENGTH' as const,
          chartDataValuePointer: `/scopeSensitivity/comparisons/${index}/removedRecordCount`,
          resultValuePointer: null,
          resultEvidencePointers: [comparison.removedRecordIndicesPointer],
        },
      ],
    })),
    blockers: charts.scopeSensitivity.blockers,
    limitations: ['SAME_PERIOD_MEMBERSHIP_FILTER_EFFECT_NOT_TEMPORAL_GROWTH', 'SIGNED_DIRECTION_MUST_REMAIN_VISIBLE', 'LOCAL_MAX_BAR_GEOMETRY_IS_NOT_CROSS_PANEL_COMPARABLE'],
  };
}

function groupViews(charts: ResearchReportChartData) {
  return charts.groupComposition.scopes.map((lane, scopeIndex) => {
    const exceedsVisualLimit = lane.points.length > MAX_GROUP_CATEGORIES;
    const points = exceedsVisualLimit ? [] : lane.points;
    return {
    viewId: `group-composition-${lane.scopeKey}`,
    sourceChartId: 'group-composition', sourcePointer: `/groupComposition/scopes/${scopeIndex}`, sectionId: 'M04',
    title: `Cơ cấu doanh thu quan sát theo nhóm · ${lane.scopeKey.toUpperCase()}`,
    state: exceedsVisualLimit ? 'BLOCKED' as const : lane.state,
    markType: 'HORIZONTAL_BAR', orientation: 'HORIZONTAL',
    axes: axes('percent', 'LINEAR_ZERO_TO_100', 'FIXED_0_100', 'SOURCE_BASIS_POINTS', 'SOURCE_GROUP_KEY_ORDER', points.map(point => point.group)),
    relationship: 'WITHIN_SCOPE_COMPOSITION_OVERLAPPING_SCOPES',
    marks: points.flatMap((point, pointIndex) => point.sharePercent === null || point.sharePointer === null ? [] : [mark({
      seriesKey: 'group-share', categoryKey: point.group, valueText: point.sharePercent, unit: 'percent',
      chartDataValuePointer: `/groupComposition/scopes/${scopeIndex}/points/${pointIndex}/sharePercent`,
      chartDataGeometryPointer: `/groupComposition/scopes/${scopeIndex}/points/${pointIndex}/basisPoints`,
      chartDataMembershipPointer: `/groupComposition/scopes/${scopeIndex}/points/${pointIndex}/recordPointers`,
      claimId: null, resultSha256: point.resultSha256, resultValuePointer: point.sharePointer,
      resultMembershipPointer: null, numeratorPointer: point.numeratorPointer, denominatorPointer: point.denominatorPointer,
      resultEvidencePointers: compactPointers([
        point.groupPointer, point.listingCountPointer, point.revenuePointer, point.sharePointer,
        point.numeratorPointer, point.denominatorPointer,
      ]),
    })]),
    annotations: points.map((point, pointIndex) => ({
      categoryKey: point.group,
      values: [
        {
          key: 'listingCount' as const, valueText: String(point.listingCount), unit: 'listing' as const,
          derivation: 'DIRECT' as const,
          chartDataValuePointer: `/groupComposition/scopes/${scopeIndex}/points/${pointIndex}/listingCount`,
          resultValuePointer: point.listingCountPointer,
          resultEvidencePointers: [point.listingCountPointer],
        },
        ...(point.revenueValue === null ? [] : [{
          key: 'observedRevenue' as const, valueText: point.revenueValue, unit: 'VND' as const,
          derivation: 'DIRECT' as const,
          chartDataValuePointer: `/groupComposition/scopes/${scopeIndex}/points/${pointIndex}/revenueValue`,
          resultValuePointer: point.revenuePointer,
          resultEvidencePointers: [point.revenuePointer],
        }]),
      ],
    })),
    blockers: [...lane.blockers, ...(exceedsVisualLimit
      ? [`GROUP_CARDINALITY_EXCEEDS_VISUAL_LIMIT:${lane.points.length}:${MAX_GROUP_CATEGORIES}`]
      : [])],
    limitations: [
      'WITHIN_SCOPE_SHARE_ONLY', 'UNKNOWN_GROUP_REMAINS_VISIBLE_WHEN_PRESENT',
      'ALL_WIDE_CORE_SCOPES_OVERLAP_AND_ARE_NOT_ADDITIVE',
      'GROUP_VISUAL_BLOCKS_ABOVE_100_CATEGORIES_WITHOUT_TRUNCATION',
    ],
  };
  });
}

function removalViews(charts: ResearchReportChartData) {
  return charts.topShopRemoval.scopes.map((lane, scopeIndex) => {
    const point = lane.point;
    const marks = point === null ? [] : [
      ...(point.remainingRevenueSharePercent === null || point.remainingRevenueSharePointer === null ? [] : [mark({
        seriesKey: 'remaining-share-original-denominator', categoryKey: 'remaining', valueText: point.remainingRevenueSharePercent,
        unit: 'percent' as const, chartDataValuePointer: `/topShopRemoval/scopes/${scopeIndex}/point/remainingRevenueSharePercent`,
        chartDataGeometryPointer: `/topShopRemoval/scopes/${scopeIndex}/point/remainingRevenueShareBasisPoints`,
        chartDataMembershipPointer: `/topShopRemoval/scopes/${scopeIndex}/point/removedRecordPointers`,
        claimId: null, resultSha256: point.resultSha256, resultValuePointer: point.remainingRevenueSharePointer,
        resultMembershipPointer: point.membershipPointer, numeratorPointer: point.remainingRevenueShareNumeratorPointer,
        denominatorPointer: point.remainingRevenueShareDenominatorPointer,
        resultEvidencePointers: compactPointers([
          point.remainingRevenueSharePointer, point.remainingRevenueShareNumeratorPointer,
          point.remainingRevenueShareDenominatorPointer, point.membershipPointer,
          point.removedShopKeyPointer, point.remainingListingCountPointer, point.remainingRevenuePointer,
        ]),
      })]),
      ...point.concentrationAfterRemoval.flatMap((value, valueIndex) => value.sharePercent === null || value.sharePointer === null ? [] : [mark({
        seriesKey: 'post-removal-top-k', categoryKey: `top${value.k}`, valueText: value.sharePercent, unit: 'percent' as const,
        chartDataValuePointer: `/topShopRemoval/scopes/${scopeIndex}/point/concentrationAfterRemoval/${valueIndex}/sharePercent`,
        chartDataGeometryPointer: `/topShopRemoval/scopes/${scopeIndex}/point/concentrationAfterRemoval/${valueIndex}/basisPoints`,
        chartDataMembershipPointer: `/topShopRemoval/scopes/${scopeIndex}/point/removedRecordPointers`,
        claimId: null, resultSha256: point.resultSha256, resultValuePointer: value.sharePointer,
        resultMembershipPointer: point.membershipPointer, numeratorPointer: value.numeratorPointer,
        denominatorPointer: value.denominatorPointer,
        resultEvidencePointers: compactPointers([
          value.sharePointer, value.numeratorPointer, value.denominatorPointer, value.usedShopCountPointer,
          point.membershipPointer, point.removedShopKeyPointer,
        ]),
      })]),
    ];
    const annotations = point === null ? [] : [
      {
        categoryKey: 'remaining',
        values: [
          {
            key: 'remainingListingCount' as const, valueText: String(point.remainingListingCount), unit: 'listing' as const,
            derivation: 'DIRECT' as const,
            chartDataValuePointer: `/topShopRemoval/scopes/${scopeIndex}/point/remainingListingCount`,
            resultValuePointer: point.remainingListingCountPointer,
            resultEvidencePointers: [point.remainingListingCountPointer],
          },
          ...(point.remainingRevenueValue === null ? [] : [{
            key: 'remainingObservedRevenue' as const, valueText: point.remainingRevenueValue, unit: 'VND' as const,
            derivation: 'DIRECT' as const,
            chartDataValuePointer: `/topShopRemoval/scopes/${scopeIndex}/point/remainingRevenueValue`,
            resultValuePointer: point.remainingRevenuePointer,
            resultEvidencePointers: [point.remainingRevenuePointer],
          }]),
        ],
      },
      ...point.concentrationAfterRemoval.map((value, valueIndex) => ({
        categoryKey: `top${value.k}`,
        values: [{
          key: 'usedShopCount' as const, valueText: String(value.usedShopCount), unit: 'shop' as const,
          derivation: 'DIRECT' as const,
          chartDataValuePointer: `/topShopRemoval/scopes/${scopeIndex}/point/concentrationAfterRemoval/${valueIndex}/usedShopCount`,
          resultValuePointer: value.usedShopCountPointer,
          resultEvidencePointers: [value.usedShopCountPointer],
        }],
      })),
    ];
    return {
      viewId: `top-shop-removal-${lane.scopeKey}`,
      sourceChartId: 'top-shop-removal-sensitivity', sourcePointer: `/topShopRemoval/scopes/${scopeIndex}`, sectionId: 'M04',
      title: `Độ nhạy khi bỏ shop đứng đầu · ${lane.scopeKey.toUpperCase()}`, state: lane.state,
      markType: 'HORIZONTAL_BAR', orientation: 'HORIZONTAL',
      axes: axes('percent', 'LINEAR_ZERO_TO_100', 'FIXED_0_100', 'SOURCE_BASIS_POINTS', 'FIXED_REMOVAL_METRIC_ORDER', ['remaining', 'top1', 'top3', 'top10']),
      relationship: 'LEADER_REMOVAL_SENSITIVITY_NOT_FORECAST', marks, annotations, blockers: lane.blockers,
      limitations: ['STATIC_SENSITIVITY_TEST_NOT_FORECAST_OR_RECOMMENDATION', 'REMAINING_SHARE_USES_ORIGINAL_REVENUE_DENOMINATOR', 'POST_REMOVAL_TOP_K_USES_POST_REMOVAL_DENOMINATOR'],
    };
  });
}

function materialize(charts: ResearchReportChartData, chartBytes: Buffer): ResearchChartSpec {
  assertChartDataOrder(charts);
  const views = [
    ...totalsViews(charts),
    ...topShareViews(charts),
    sensitivityView(charts),
    ...groupViews(charts),
    ...removalViews(charts),
  ];
  const payload = {
    contractVersion: '1.0.0', methodId: 'evidence-bound-chart-spec', methodVersion: '1.0.0',
    chartDataSha256: sha256(chartBytes), chartDataContractVersion: 'research-report-charts-v2', approvalState: 'UNREVIEWED',
    policies: {
      scopeOrder, scopeRelationship: 'OVERLAPPING_NON_ADDITIVE',
      missingValuePolicy: 'BLOCK_OR_UNAVAILABLE_NEVER_ZERO_IMPUTATION',
      observedZeroPolicy: 'VISIBLE_EXACT_ZERO_AT_ZERO_BASELINE',
      unknownPolicy: charts.computation.wideUnknownPolicy === 'exclude' ? 'VISIBLE_AND_EXCLUDED_FROM_WIDE' : 'VISIBLE_AND_INCLUDED_IN_WIDE',
      percentScale: 'LINEAR_ZERO_TO_100', nonPercentScale: 'LINEAR_ZERO_BASELINE',
      signedDeltaScale: 'LINEAR_SIGNED_WITH_VISIBLE_ZERO',
      crossPanelComparability: 'LOCAL_MAX_GEOMETRY_NOT_CROSS_PANEL_COMPARABLE',
    },
    views,
    limitations: [
      'OBSERVED_EXPORT_SCOPE_NOT_MARKET_UNIVERSE_SIZE_SHARE_OR_DEMAND',
      'ALL_WIDE_CORE_SCOPES_OVERLAP_AND_ARE_NOT_ADDITIVE',
      'CUMULATIVE_TOP_K_SHARES_OVERLAP_AND_MUST_NOT_USE_PIE_DONUT_OR_STACKED_PARTS',
      'SCOPE_MEMBERSHIP_DELTAS_ARE_NOT_TIME_SERIES_GROWTH',
      'MISSING_BLOCKED_OR_UNAVAILABLE_VALUES_ARE_NEVER_COERCED_TO_ZERO',
      'UNKNOWN_REMAINS_DISTINCT_AND_FOLLOWS_THE_FROZEN_WIDE_POLICY',
      'LOCAL_MAX_BAR_GEOMETRY_DOES_NOT_CREATE_CROSS_PANEL_COMPARABILITY',
      'NO_AI_SORTING_RANKING_CONCLUSION_CAUSALITY_RECOMMENDATION_OR_APPROVAL',
    ],
    reopenConditions: [
      'RESULT_INPUT_CATALOG_METHOD_ROUNDING_OR_SOURCE_DIGEST_CHANGES',
      'SCOPE_PERIOD_LABEL_CODEBOOK_OR_WIDE_UNKNOWN_POLICY_CHANGES',
      'CLAIM_CHART_DATA_OR_RESULT_POINTER_NO_LONGER_RESOLVES_EXACTLY',
      'DENOMINATOR_MEMBERSHIP_OR_ORDERING_RULE_CHANGES',
      'CHART_TYPE_SCALE_AXIS_UNIT_CAPTION_OR_MISSING_ZERO_UNKNOWN_SEMANTICS_CHANGE',
      'A_VISUAL_WOULD_IMPLY_MARKET_SHARE_GROWTH_CAUSALITY_RANKING_OR_CROSS_PANEL_COMPARABILITY',
    ],
  } as const;
  const candidate: unknown = { ...payload, chartSpecId: sha256(canonicalJson(payload)) };
  if (!validate(candidate)) throw new TypeError(`chart spec: INVALID_OUTPUT ${ajv.errorsText(validate.errors)}`);
  return candidate;
}

/** Verifies the exact v1 view set, ordering, policies, pointers and ChartData binding. */
export function verifyResearchChartSpec(spec: ResearchChartSpec, charts: ResearchReportChartData, chartBytes: Buffer): void {
  if (!chartBytes.equals(canonicalBytes(charts))) throw new TypeError('chart spec: NONCANONICAL_CHART_DATA');
  if (charts.contractVersion !== 'research-report-charts-v2') throw new TypeError('chart spec: UNSUPPORTED_CHART_DATA');
  if (!validate(spec)) throw new TypeError(`chart spec: INVALID_SPEC ${ajv.errorsText(validate.errors)}`);
  const { chartSpecId, ...payload } = spec;
  if (chartSpecId !== sha256(canonicalJson(payload))) throw new TypeError('chart spec: ID_MISMATCH');
  const expected = materialize(charts, chartBytes);
  if (canonicalJson(spec) !== canonicalJson(expected)) throw new TypeError('chart spec: SEMANTIC_DRIFT');
  for (const view of spec.views) {
    if (atPointer(charts, view.sourcePointer) === undefined) throw new TypeError(`chart spec: UNRESOLVED_VIEW_POINTER:${view.viewId}`);
    const categories = view.axes.category.categoryOrder;
    if (new Set(categories).size !== categories.length) throw new TypeError(`chart spec: DUPLICATE_CATEGORY:${view.viewId}`);
    for (const item of view.marks) {
      const { markId, ...markPayload } = item;
      if (markId !== sha256(canonicalJson(markPayload))) throw new TypeError(`chart spec: MARK_ID_MISMATCH:${view.viewId}`);
      if (!categories.includes(item.categoryKey) || item.resultSha256 !== charts.resultSha256) {
        throw new TypeError(`chart spec: MARK_BINDING_MISMATCH:${view.viewId}`);
      }
      for (const pointer of [item.chartDataValuePointer, item.chartDataGeometryPointer, item.chartDataMembershipPointer]) {
        if (pointer !== null && atPointer(charts, pointer) === undefined) throw new TypeError(`chart spec: UNRESOLVED_MARK_POINTER:${view.viewId}`);
      }
    }
    for (const annotation of view.annotations) {
      if (!categories.includes(annotation.categoryKey)) throw new TypeError(`chart spec: ANNOTATION_CATEGORY_MISMATCH:${view.viewId}`);
      for (const value of annotation.values) {
        const source = atPointer(charts, value.chartDataValuePointer);
        if (source === undefined) throw new TypeError(`chart spec: UNRESOLVED_ANNOTATION_POINTER:${view.viewId}`);
        const expectedText = source === null ? null : String(source);
        if (expectedText !== value.valueText) throw new TypeError(`chart spec: ANNOTATION_VALUE_MISMATCH:${view.viewId}`);
        if (value.derivation === 'DIRECT' && value.resultValuePointer === null) {
          throw new TypeError(`chart spec: ANNOTATION_RESULT_VALUE_MISSING:${view.viewId}`);
        }
        if (value.derivation === 'ARRAY_LENGTH' && value.resultValuePointer !== null) {
          throw new TypeError(`chart spec: ANNOTATION_DERIVATION_MISMATCH:${view.viewId}`);
        }
      }
    }
  }
}

/** Materializes presentation semantics only; it performs no new market calculation. */
export function buildResearchChartSpec(charts: ResearchReportChartData, chartBytes: Buffer): {
  readonly spec: ResearchChartSpec;
  readonly bytes: Buffer;
} {
  if (!chartBytes.equals(canonicalBytes(charts))) throw new TypeError('chart spec: NONCANONICAL_CHART_DATA');
  if (charts.contractVersion !== 'research-report-charts-v2') throw new TypeError('chart spec: UNSUPPORTED_CHART_DATA');
  const spec = materialize(charts, chartBytes);
  verifyResearchChartSpec(spec, charts, chartBytes);
  return { spec, bytes: canonicalBytes(spec) };
}
