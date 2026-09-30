import { createResearchReportPacket } from './versioned-report-packet.js';
import type { FactObservation, VersionedReportPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import type { MetricScopeOutput } from '../../../contracts/analysis/metric-scope-output.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

type ScopeKey = 'all' | 'wide' | 'core';
type ChartState = 'READY' | 'PARTIAL' | 'BLOCKED' | 'EMPTY';
type ChartMetricUnit = 'listing' | 'shop' | 'VND' | 'unit' | 'percent';
type ChartMetric = 'listings' | 'shops' | 'revenue' | 'units' | 'top1' | 'top3' | 'top10';

export interface ResearchChartPeriod {
  readonly start: string;
  readonly end: string;
  readonly periodBasis: string;
  readonly acquiredAt: string | null;
}

export interface ResearchChartSource {
  /** The scope membership that produced this plotted claim. */
  readonly scopeKey: ScopeKey;
  /** The report scope and period are shared by all A1 observations. */
  readonly reportScopeKey: string;
  readonly platform: 'shopee' | 'tiktok';
  readonly selection: 'ON' | 'OFF' | 'UNSPECIFIED';
  readonly period: ResearchChartPeriod;
}

export interface ResearchChartDenominator {
  readonly value: string;
  readonly unit: 'VND';
  readonly pointer: string;
}

export interface ResearchChartNumerator {
  readonly value: string;
  readonly unit: 'VND';
  readonly pointer: string;
}

export interface ResearchChartComputation {
  readonly inputSha256: string;
  readonly methodVersion: VersionedReportPacket['metricMethodVersion'];
  readonly rounding: VersionedReportPacket['metricRounding'];
  readonly rendererVersion: VersionedReportPacket['metricRendererVersion'];
  readonly profileId: string;
  readonly labelCodebookVersion: string;
  readonly wideUnknownPolicy: 'include' | 'exclude';
}

/**
 * A single plotted value is deliberately lineage-heavy.  In particular, the
 * display value is never a replacement for the exact metric value or its
 * denominator pointer.
 */
export interface ResearchChartValue {
  readonly metric: ChartMetric;
  readonly claimId: string;
  readonly sectionId: string;
  readonly resultSha256: string;
  readonly value: string | number;
  readonly valueText: string;
  readonly unit: ChartMetricUnit;
  readonly percentText: string | null;
  /** Safe chart geometry; the exact displayed percentage remains percentText. */
  readonly basisPoints: number | null;
  readonly source: ResearchChartSource;
  readonly metricPointer: string;
  readonly scopePointer: string;
  readonly membershipPointer: string;
  readonly coveragePointer: string | null;
  readonly denominatorPointer: string | null;
  readonly numeratorPointer: string | null;
  readonly denominator: ResearchChartDenominator | null;
  readonly numerator: ResearchChartNumerator | null;
  readonly limits: readonly string[];
}

export interface ResearchChartLane {
  readonly scopeKey: ScopeKey;
  readonly state: ChartState;
  readonly points: readonly ResearchChartValue[];
  readonly blockers: readonly string[];
}

export interface ResearchScopeTotalsChart {
  readonly chartId: 'scope-totals';
  readonly sectionId: 'M03';
  readonly sectionDeliveryState: VersionedReportPacket['sections'][number]['deliveryState'] | null;
  readonly state: ChartState;
  readonly exactMethodHandler: boolean;
  readonly relationship: 'OVERLAPPING_NON_ADDITIVE';
  readonly scopes: readonly ResearchChartLane[];
  readonly blockers: readonly string[];
}

export interface ResearchTopShopShareChart {
  readonly chartId: 'top-shop-share';
  readonly sectionId: 'M04';
  readonly sectionDeliveryState: VersionedReportPacket['sections'][number]['deliveryState'] | null;
  readonly state: ChartState;
  readonly exactMethodHandler: boolean;
  readonly relationship: 'CUMULATIVE_OVERLAPPING_NOT_DONUT';
  readonly scopes: readonly ResearchChartLane[];
  readonly blockers: readonly string[];
}

export interface ResearchScopeSensitivityComparison {
  readonly fromScopeKey: 'all';
  readonly toScopeKey: 'wide' | 'core';
  readonly state: ChartState;
  readonly resultSha256: string;
  readonly revenueDelta: { readonly value: string | null; readonly unit: 'VND'; readonly pointer: string };
  readonly unitsDelta: { readonly value: string | null; readonly unit: 'unit'; readonly pointer: string };
  readonly removedRecordIndices: readonly number[];
  readonly removedRecordCount: number;
  readonly removedRecordIndicesPointer: string;
  readonly period: ResearchChartPeriod;
  readonly blockers: readonly string[];
  readonly limits: readonly string[];
}

export interface ResearchScopeSensitivityChart {
  readonly chartId: 'scope-membership-sensitivity';
  readonly sectionId: 'M03';
  readonly state: ChartState;
  readonly exactMethodHandler: boolean;
  readonly relationship: 'FILTER_MEMBERSHIP_EFFECT_NOT_GROWTH';
  readonly comparisons: readonly ResearchScopeSensitivityComparison[];
  readonly blockers: readonly string[];
}

export interface ResearchGroupCompositionPoint {
  readonly scopeKey: ScopeKey;
  readonly group: string;
  readonly resultSha256: string;
  readonly listingCount: number;
  readonly revenueValue: string | null;
  readonly sharePercent: string | null;
  readonly basisPoints: number | null;
  readonly groupPointer: string;
  readonly listingCountPointer: string;
  readonly revenuePointer: string;
  readonly sharePointer: string | null;
  readonly numeratorValue: string | null;
  readonly numeratorPointer: string | null;
  readonly denominatorValue: string | null;
  readonly denominatorPointer: string | null;
  readonly recordIndices: readonly number[];
  readonly recordPointers: readonly string[];
  readonly source: ResearchChartSource;
  readonly limits: readonly string[];
}

export interface ResearchGroupCompositionLane {
  readonly scopeKey: ScopeKey;
  readonly state: ChartState;
  readonly points: readonly ResearchGroupCompositionPoint[];
  readonly blockers: readonly string[];
}

export interface ResearchGroupCompositionChart {
  readonly chartId: 'group-composition';
  readonly sectionId: 'M04';
  readonly state: ChartState;
  readonly exactMethodHandler: boolean;
  readonly relationship: 'WITHIN_SCOPE_COMPOSITION_OVERLAPPING_SCOPES';
  readonly scopes: readonly ResearchGroupCompositionLane[];
  readonly blockers: readonly string[];
}

export interface ResearchTopShopRemovalPoint {
  readonly scopeKey: ScopeKey;
  readonly resultSha256: string;
  readonly removedShopKey: string;
  readonly removedShopKeyPointer: string;
  readonly removedRecordIndices: readonly number[];
  readonly removedRecordPointers: readonly string[];
  readonly membershipPointer: string;
  readonly originalRevenueValue: string;
  readonly originalRevenuePointer: string;
  readonly remainingListingCount: number;
  readonly remainingListingCountPointer: string;
  readonly remainingRevenueValue: string | null;
  readonly remainingRevenuePointer: string;
  readonly remainingRevenueSharePercent: string | null;
  readonly remainingRevenueShareBasisPoints: number | null;
  readonly remainingRevenueSharePointer: string | null;
  readonly remainingRevenueShareNumeratorValue: string | null;
  readonly remainingRevenueShareNumeratorPointer: string | null;
  readonly remainingRevenueShareDenominatorValue: string | null;
  readonly remainingRevenueShareDenominatorPointer: string | null;
  readonly concentrationAfterRemoval: readonly {
    readonly k: 1 | 3 | 10;
    readonly usedShopCount: number;
    readonly usedShopCountPointer: string;
    readonly sharePercent: string | null;
    readonly basisPoints: number | null;
    readonly sharePointer: string | null;
    readonly numeratorValue: string | null;
    readonly numeratorPointer: string | null;
    readonly denominatorValue: string | null;
    readonly denominatorPointer: string | null;
  }[];
  readonly source: ResearchChartSource;
  readonly limits: readonly string[];
}

export interface ResearchTopShopRemovalLane {
  readonly scopeKey: ScopeKey;
  readonly state: ChartState;
  readonly point: ResearchTopShopRemovalPoint | null;
  readonly blockers: readonly string[];
}

export interface ResearchTopShopRemovalChart {
  readonly chartId: 'top-shop-removal-sensitivity';
  readonly sectionId: 'M04';
  readonly state: ChartState;
  readonly exactMethodHandler: boolean;
  readonly relationship: 'LEADER_REMOVAL_SENSITIVITY_NOT_FORECAST';
  readonly scopes: readonly ResearchTopShopRemovalLane[];
  readonly blockers: readonly string[];
}

export interface ResearchReportChartData {
  readonly contractVersion: 'research-report-charts-v2';
  readonly approvalState: 'UNREVIEWED';
  readonly resultSha256: string;
  readonly catalogSha256: string;
  readonly sourcePeriod: ResearchChartPeriod;
  readonly computation: ResearchChartComputation;
  readonly scopeKeys: readonly ScopeKey[];
  readonly totals: ResearchScopeTotalsChart;
  readonly topShopShare: ResearchTopShopShareChart;
  readonly scopeSensitivity: ResearchScopeSensitivityChart;
  readonly groupComposition: ResearchGroupCompositionChart;
  readonly topShopRemoval: ResearchTopShopRemovalChart;
  readonly blockers: readonly string[];
}

const scopeKeys: readonly ScopeKey[] = ['all', 'wide', 'core'];
const totalMetrics: readonly ChartMetric[] = ['listings', 'shops', 'revenue', 'units'];
const concentrationMetrics: readonly ChartMetric[] = ['top1', 'top3', 'top10'];
const exactMethods = {
  'scope-totals': { sectionId: 'M03', methodId: 'metric-scope-packet-totals' },
  'top-shop-share': { sectionId: 'M04', methodId: 'metric-scope-packet-concentration' },
} as const;

type SectionSelection =
  | { readonly section: VersionedReportPacket['sections'][number]; readonly exact: true; readonly deliveryState: VersionedReportPacket['sections'][number]['deliveryState'] }
  | { readonly section: VersionedReportPacket['sections'][number] | null; readonly exact: false; readonly deliveryState: VersionedReportPacket['sections'][number]['deliveryState'] | null };

function sectionFor(
  packet: VersionedReportPacket,
  chart: keyof typeof exactMethods,
): SectionSelection {
  const definition = exactMethods[chart];
  const section = packet.sections.find(candidate => candidate.sectionId === definition.sectionId);
  const catalogDefinition = packet.catalog.sections.find(candidate => candidate.sectionId === definition.sectionId);
  if (!section) return { section: null, exact: false, deliveryState: null };
  if (!catalogDefinition || catalogDefinition.methodId !== definition.methodId ||
      catalogDefinition.methodVersion !== '1.0.0' || section.deliveryState !== 'PARTIAL_DETERMINISTIC_DRAFT' ||
      section.claimIds.length === 0) return { section, exact: false, deliveryState: section.deliveryState };
  return { section, exact: true, deliveryState: section.deliveryState };
}

function parseResult(resultBytes: Buffer): MetricScopeOutput {
  // createResearchReportPacket has already checked the exact digest, UTF-8,
  // schema and deterministic A1 replay before this read is used for pointers.
  return JSON.parse(resultBytes.toString('utf8')) as MetricScopeOutput;
}

function pointerValue(root: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/')) throw new TypeError(`Invalid metric pointer: ${pointer}`);
  return pointer.slice(1).split('/').reduce<unknown>((current, encoded) => {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (current === null || typeof current !== 'object' || !(key in current)) {
      throw new TypeError(`Unresolvable metric pointer: ${pointer}`);
    }
    return (current as Record<string, unknown>)[key];
  }, root);
}

function asString(value: unknown, pointer: string): string {
  if (typeof value !== 'string') throw new TypeError(`Expected exact string at metric pointer: ${pointer}`);
  return value;
}

function computation(packet: VersionedReportPacket, result: unknown): ResearchChartComputation {
  const policy = asString(pointerValue(result, '/input/wideUnknownPolicy'), '/input/wideUnknownPolicy');
  if (policy !== 'include' && policy !== 'exclude') throw new TypeError(`Invalid wide UNKNOWN policy: ${policy}`);
  return {
    inputSha256: packet.inputSha256,
    methodVersion: packet.metricMethodVersion,
    rounding: packet.metricRounding,
    rendererVersion: packet.metricRendererVersion,
    profileId: asString(pointerValue(result, '/input/profileId'), '/input/profileId'),
    labelCodebookVersion: asString(pointerValue(result, '/input/labelCodebookVersion'), '/input/labelCodebookVersion'),
    wideUnknownPolicy: policy,
  };
}

function numeratorPointerFor(claim: FactObservation): string | null {
  if (claim.unit !== 'percent' || claim.denominatorPointer === null) return null;
  const metricParent = claim.metricPointer.endsWith('/percent') ? claim.metricPointer.slice(0, -'/percent'.length) : null;
  const denominatorParent = claim.denominatorPointer.endsWith('/denominator')
    ? claim.denominatorPointer.slice(0, -'/denominator'.length) : null;
  if (metricParent === null || denominatorParent === null || metricParent !== denominatorParent) {
    throw new TypeError(`Share claim pointers do not share a ratio object: ${claim.claimId}`);
  }
  return `${denominatorParent}/numerator`;
}

function basisPoints(percentText: string): number {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]{2}))$/.exec(percentText);
  if (!match) throw new TypeError(`Invalid exact percentage text: ${percentText}`);
  const whole = BigInt(match[1]!);
  const fraction = BigInt(match[2]!);
  const result = whole * 100n + fraction;
  if (result < 0n || result > 10000n) throw new TypeError(`Percentage outside chart geometry: ${percentText}`);
  return Number(result);
}

function scopeSource(packet: VersionedReportPacket, scopeKey: ScopeKey): ResearchChartSource {
  return {
    scopeKey,
    reportScopeKey: packet.scope.key,
    platform: packet.scope.platform,
    selection: packet.scope.selection,
    period: {
      start: packet.scope.start,
      end: packet.scope.end,
      periodBasis: packet.scope.periodBasis,
      acquiredAt: packet.scope.acquiredAt,
    },
  };
}

function claimFor(
  packet: VersionedReportPacket,
  section: VersionedReportPacket['sections'][number] | null,
  scopeKey: ScopeKey,
  metric: ChartMetric,
): FactObservation | null {
  if (!section) return null;
  const claimId = `${section.sectionId}:${scopeKey}:${metric}`;
  if (!section.claimIds.includes(claimId)) return null;
  const claim = packet.claims.find(candidate => candidate.claimId === claimId && candidate.sectionId === section.sectionId);
  return claim ?? null;
}

function scopedBlockers(
  section: VersionedReportPacket['sections'][number] | null,
  scopeKey: ScopeKey,
): string[] {
  if (!section) return [`${scopeKey}:SECTION_HANDLER_NOT_CHARTABLE`];
  const relevant = section.blockers.filter(blocker => blocker.startsWith(`${scopeKey}:`) || blocker === 'NO_ELIGIBLE_OBSERVATIONS');
  return relevant.length ? [...new Set(relevant)] : [];
}

function chartValue(
  packet: VersionedReportPacket,
  result: unknown,
  claim: FactObservation,
  metric: ChartMetric,
  limits: readonly string[],
): ResearchChartValue {
  const percent = claim.unit === 'percent' ? asString(claim.value, claim.metricPointer) : null;
  const numeratorPointer = numeratorPointerFor(claim);
  const denominator = claim.denominatorPointer === null ? null : {
    value: asString(pointerValue(result, claim.denominatorPointer), claim.denominatorPointer),
    unit: 'VND' as const,
    pointer: claim.denominatorPointer,
  };
  const numerator = numeratorPointer === null ? null : {
    value: asString(pointerValue(result, numeratorPointer), numeratorPointer),
    unit: 'VND' as const,
    pointer: numeratorPointer,
  };
  return {
    metric,
    claimId: claim.claimId,
    sectionId: claim.sectionId,
    resultSha256: packet.metricResultSha256,
    value: claim.value,
    valueText: typeof claim.value === 'string' ? claim.value : String(claim.value),
    unit: claim.unit,
    percentText: percent,
    basisPoints: percent === null ? null : basisPoints(percent),
    source: scopeSource(packet, claim.scopeKey),
    metricPointer: claim.metricPointer,
    scopePointer: claim.scopePointer,
    membershipPointer: claim.membershipPointer,
    coveragePointer: claim.coveragePointer,
    denominatorPointer: claim.denominatorPointer,
    numeratorPointer,
    denominator,
    numerator,
    limits: [...new Set([...claim.limitations, ...limits])],
  };
}

function laneState(points: readonly ResearchChartValue[], blockers: readonly string[], expected: number): ChartState {
  if (points.length === 0) return blockers.length ? 'BLOCKED' : 'EMPTY';
  return points.length === expected ? 'READY' : 'PARTIAL';
}

function makeLanes(
  packet: VersionedReportPacket,
  result: unknown,
  section: VersionedReportPacket['sections'][number] | null,
  metrics: readonly ChartMetric[],
  limits: readonly string[],
): readonly ResearchChartLane[] {
  return scopeKeys.map(scopeKey => {
    const points = metrics.flatMap(metric => {
      const claim = claimFor(packet, section, scopeKey, metric);
      return claim ? [chartValue(packet, result, claim, metric, limits)] : [];
    });
    const blockers = scopedBlockers(section, scopeKey);
    if (points.length === 0 && blockers.length === 0) blockers.push(`${scopeKey}:NO_CHARTABLE_CLAIMS`);
    return { scopeKey, state: laneState(points, blockers, metrics.length), points, blockers: [...new Set(blockers)] };
  });
}

function aggregateState(lanes: readonly ResearchChartLane[]): ChartState {
  if (lanes.some(lane => lane.points.length > 0)) return lanes.every(lane => lane.state === 'READY') ? 'READY' : 'PARTIAL';
  return lanes.some(lane => lane.state === 'BLOCKED') ? 'BLOCKED' : 'EMPTY';
}

function chartBlockers(chartId: string, lanes: readonly ResearchChartLane[], exact: boolean): readonly string[] {
  const blockers = exact ? [] : [`${chartId}:SECTION_HANDLER_NOT_CHARTABLE`];
  for (const lane of lanes) for (const blocker of lane.blockers) blockers.push(`${chartId}:${blocker}`);
  return [...new Set(blockers)];
}

function sourcePeriod(packet: VersionedReportPacket): ResearchChartPeriod {
  return {
    start: packet.scope.start,
    end: packet.scope.end,
    periodBasis: packet.scope.periodBasis,
    acquiredAt: packet.scope.acquiredAt,
  };
}

function assertPointerValue(root: unknown, pointer: string, expected: unknown): void {
  const actual = pointerValue(root, pointer);
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new TypeError(`Diagnostic pointer/value mismatch: ${pointer}`);
  }
}

function assertPointerResolves(root: unknown, pointer: string): void {
  pointerValue(root, pointer);
}

function verifyDiagnosticPointers(
  result: MetricScopeOutput,
  sensitivity: ResearchScopeSensitivityChart,
  composition: ResearchGroupCompositionChart,
  removal: ResearchTopShopRemovalChart,
): void {
  for (const comparison of sensitivity.comparisons) {
    assertPointerValue(result, comparison.revenueDelta.pointer, comparison.revenueDelta.value);
    assertPointerValue(result, comparison.unitsDelta.pointer, comparison.unitsDelta.value);
    assertPointerValue(result, comparison.removedRecordIndicesPointer, comparison.removedRecordIndices);
  }
  for (const lane of composition.scopes) for (const point of lane.points) {
    assertPointerValue(result, point.groupPointer, point.group);
    assertPointerValue(result, point.listingCountPointer, point.listingCount);
    assertPointerValue(result, point.revenuePointer, point.revenueValue);
    if (point.sharePointer !== null) assertPointerValue(result, point.sharePointer, point.sharePercent);
    if (point.numeratorPointer !== null) assertPointerValue(result, point.numeratorPointer, point.numeratorValue);
    if (point.denominatorPointer !== null) assertPointerValue(result, point.denominatorPointer, point.denominatorValue);
    for (const pointer of point.recordPointers) assertPointerResolves(result, pointer);
  }
  for (const lane of removal.scopes) {
    const point = lane.point;
    if (point === null) continue;
    assertPointerValue(result, point.removedShopKeyPointer, point.removedShopKey);
    assertPointerResolves(result, point.membershipPointer);
    for (const pointer of point.removedRecordPointers) assertPointerResolves(result, pointer);
    assertPointerValue(result, point.originalRevenuePointer, point.originalRevenueValue);
    assertPointerValue(result, point.remainingListingCountPointer, point.remainingListingCount);
    assertPointerValue(result, point.remainingRevenuePointer, point.remainingRevenueValue);
    if (point.remainingRevenueSharePointer !== null) {
      if (point.remainingRevenueShareNumeratorPointer === null || point.remainingRevenueShareDenominatorPointer === null) {
        throw new TypeError('Incomplete remaining-revenue ratio lineage');
      }
      assertPointerValue(result, point.remainingRevenueSharePointer, point.remainingRevenueSharePercent);
      assertPointerValue(result, point.remainingRevenueShareNumeratorPointer, point.remainingRevenueShareNumeratorValue);
      assertPointerValue(result, point.remainingRevenueShareDenominatorPointer, point.remainingRevenueShareDenominatorValue);
    }
    for (const value of point.concentrationAfterRemoval) {
      assertPointerValue(result, value.usedShopCountPointer, value.usedShopCount);
      if (value.sharePointer === null) continue;
      if (value.numeratorPointer === null || value.denominatorPointer === null) {
        throw new TypeError('Incomplete post-removal concentration lineage');
      }
      assertPointerValue(result, value.sharePointer, value.sharePercent);
      assertPointerValue(result, value.numeratorPointer, value.numeratorValue);
      assertPointerValue(result, value.denominatorPointer, value.denominatorValue);
    }
  }
}

function buildScopeSensitivity(
  packet: VersionedReportPacket,
  result: MetricScopeOutput,
  section: SectionSelection,
): ResearchScopeSensitivityChart {
  const blockers: string[] = [];
  const comparisons = section.exact ? result.comparisons.map((comparison, index): ResearchScopeSensitivityComparison => {
    const pointBlockers = [
      ...(comparison.revenueDelta === null ? [`${comparison.to}:REVENUE_DELTA_UNAVAILABLE`] : []),
      ...(comparison.unitsDelta === null ? [`${comparison.to}:UNITS_DELTA_UNAVAILABLE`] : []),
    ];
    blockers.push(...pointBlockers);
    return {
      fromScopeKey: 'all',
      toScopeKey: comparison.to,
      state: pointBlockers.length ? 'PARTIAL' : 'READY',
      resultSha256: packet.metricResultSha256,
      revenueDelta: { value: comparison.revenueDelta, unit: 'VND', pointer: `/comparisons/${index}/revenueDelta` },
      unitsDelta: { value: comparison.unitsDelta, unit: 'unit', pointer: `/comparisons/${index}/unitsDelta` },
      removedRecordIndices: [...comparison.removedRecordIndices],
      removedRecordCount: comparison.removedRecordIndices.length,
      removedRecordIndicesPointer: `/comparisons/${index}/removedRecordIndices`,
      period: sourcePeriod(packet),
      blockers: pointBlockers,
      limits: ['MEMBERSHIP_SENSITIVITY_NOT_GROWTH', 'OVERLAPPING_SCOPE_MEMBERSHIP_NON_ADDITIVE'],
    };
  }) : [];
  if (!section.exact) blockers.unshift('scope-membership-sensitivity:SECTION_HANDLER_NOT_CHARTABLE');
  else if (!comparisons.length) blockers.push('scope-membership-sensitivity:COMPARISONS_UNAVAILABLE');
  return {
    chartId: 'scope-membership-sensitivity',
    sectionId: 'M03',
    state: !comparisons.length ? 'BLOCKED' : comparisons.every(value => value.state === 'READY') ? 'READY' : 'PARTIAL',
    exactMethodHandler: section.exact,
    relationship: 'FILTER_MEMBERSHIP_EFFECT_NOT_GROWTH',
    comparisons,
    blockers: [...new Set(blockers)],
  };
}

function groupRecordIndices(result: MetricScopeOutput, scopeIndex: number, group: string): number[] {
  return result.scopes[scopeIndex]!.recordIndices.filter(index => result.input.records[index]!.label?.group === group);
}

function buildGroupComposition(
  packet: VersionedReportPacket,
  result: MetricScopeOutput,
  section: SectionSelection,
): ResearchGroupCompositionChart {
  const labelsBlocked = result.labelIssues.length > 0;
  const scopes = scopeKeys.map((scopeKey, scopeIndex): ResearchGroupCompositionLane => {
    const scope = result.scopes[scopeIndex]!;
    const blockers: string[] = [];
    if (!section.exact) blockers.push(`${scopeKey}:SECTION_HANDLER_NOT_CHARTABLE`);
    if (labelsBlocked || scope.status === 'BLOCKED_LABELS') blockers.push(`${scopeKey}:BLOCKED_LABELS`);
    if (blockers.length) return { scopeKey, state: 'BLOCKED', points: [], blockers };
    const points = scope.groups.map((group, groupIndex): ResearchGroupCompositionPoint => {
      const base = `/scopes/${scopeIndex}/groups/${groupIndex}`;
      const recordIndices = groupRecordIndices(result, scopeIndex, group.group);
      if (group.revenueShare === null) blockers.push(`${scopeKey}:GROUP_SHARE_UNAVAILABLE:${groupIndex}`);
      return {
        scopeKey,
        group: group.group,
        resultSha256: packet.metricResultSha256,
        listingCount: group.listingCount,
        revenueValue: group.revenue.value,
        sharePercent: group.revenueShare?.percent ?? null,
        basisPoints: group.revenueShare === null ? null : basisPoints(group.revenueShare.percent),
        groupPointer: `${base}/group`,
        listingCountPointer: `${base}/listingCount`,
        revenuePointer: `${base}/revenue/value`,
        sharePointer: group.revenueShare === null ? null : `${base}/revenueShare/percent`,
        numeratorValue: group.revenueShare?.numerator ?? null,
        numeratorPointer: group.revenueShare === null ? null : `${base}/revenueShare/numerator`,
        denominatorValue: group.revenueShare?.denominator ?? null,
        denominatorPointer: group.revenueShare === null ? null : `${base}/revenueShare/denominator`,
        recordIndices,
        recordPointers: recordIndices.map(index => `/input/records/${index}`),
        source: scopeSource(packet, scopeKey),
        limits: [...new Set([
          'WITHIN_SCOPE_COMPOSITION_ONLY',
          'OVERLAPPING_SCOPE_MEMBERSHIP_NON_ADDITIVE',
          ...scope.warnings,
          ...(group.revenueShare === null ? ['GROUP_SHARE_UNAVAILABLE'] : []),
        ])],
      };
    });
    if (!points.length) blockers.push(`${scopeKey}:NO_GROUPS`);
    return {
      scopeKey,
      state: !points.length ? 'EMPTY' : blockers.length ? 'PARTIAL' : 'READY',
      points,
      blockers: [...new Set(blockers)],
    };
  });
  const blockers = scopes.flatMap(lane => lane.blockers.map(value => `group-composition:${value}`));
  return {
    chartId: 'group-composition',
    sectionId: 'M04',
    state: scopes.some(lane => lane.points.length > 0)
      ? scopes.every(lane => lane.state === 'READY') ? 'READY' : 'PARTIAL'
      : scopes.some(lane => lane.state === 'BLOCKED') ? 'BLOCKED' : 'EMPTY',
    exactMethodHandler: section.exact,
    relationship: 'WITHIN_SCOPE_COMPOSITION_OVERLAPPING_SCOPES',
    scopes,
    blockers: [...new Set(blockers)],
  };
}

function buildTopShopRemoval(
  packet: VersionedReportPacket,
  result: MetricScopeOutput,
  section: SectionSelection,
): ResearchTopShopRemovalChart {
  const scopes = scopeKeys.map((scopeKey, scopeIndex): ResearchTopShopRemovalLane => {
    const scope = result.scopes[scopeIndex]!;
    const removed = scope.withoutTopShop;
    const blockers: string[] = [];
    if (!section.exact) blockers.push(`${scopeKey}:SECTION_HANDLER_NOT_CHARTABLE`);
    if (scope.status === 'BLOCKED_LABELS') blockers.push(`${scopeKey}:BLOCKED_LABELS`);
    if (scope.revenue.value === null) blockers.push(`${scopeKey}:ORIGINAL_REVENUE_UNAVAILABLE`);
    if (removed === null) blockers.push(`${scopeKey}:TOP_SHOP_REMOVAL_UNAVAILABLE`);
    if (blockers.length || removed === null || scope.revenue.value === null) {
      return { scopeKey, state: 'BLOCKED', point: null, blockers: [...new Set(blockers)] };
    }
    const base = `/scopes/${scopeIndex}/withoutTopShop`;
    const removedRecordIndices = scope.recordIndices.filter(index =>
      canonicalJson([result.input.scope.platform, result.input.records[index]!.shopId]) === removed.removedShopKey);
    if (removed.revenue.value === null) blockers.push(`${scopeKey}:REMAINING_REVENUE_UNAVAILABLE`);
    if (removed.remainingRevenueShare === null) blockers.push(`${scopeKey}:REMAINING_SHARE_UNAVAILABLE`);
    const concentrationAfterRemoval = removed.concentration.map((value, concentrationIndex) => ({
      k: value.k,
      usedShopCount: value.usedShopCount,
      usedShopCountPointer: `${base}/concentration/${concentrationIndex}/usedShopCount`,
      sharePercent: value.share?.percent ?? null,
      basisPoints: value.share === null ? null : basisPoints(value.share.percent),
      sharePointer: value.share === null ? null : `${base}/concentration/${concentrationIndex}/share/percent`,
      numeratorValue: value.share?.numerator ?? null,
      numeratorPointer: value.share === null ? null : `${base}/concentration/${concentrationIndex}/share/numerator`,
      denominatorValue: value.share?.denominator ?? null,
      denominatorPointer: value.share === null ? null : `${base}/concentration/${concentrationIndex}/share/denominator`,
    }));
    if (concentrationAfterRemoval.some(value => value.sharePercent === null)) {
      blockers.push(`${scopeKey}:POST_REMOVAL_CONCENTRATION_UNAVAILABLE`);
    }
    return {
      scopeKey,
      state: blockers.length ? 'PARTIAL' : 'READY',
      point: {
        scopeKey,
        resultSha256: packet.metricResultSha256,
        removedShopKey: removed.removedShopKey,
        removedShopKeyPointer: `${base}/removedShopKey`,
        removedRecordIndices,
        removedRecordPointers: removedRecordIndices.map(index => `/input/records/${index}`),
        membershipPointer: `/scopes/${scopeIndex}/recordIndices`,
        originalRevenueValue: scope.revenue.value,
        originalRevenuePointer: `/scopes/${scopeIndex}/revenue/value`,
        remainingListingCount: removed.listingCount,
        remainingListingCountPointer: `${base}/listingCount`,
        remainingRevenueValue: removed.revenue.value,
        remainingRevenuePointer: `${base}/revenue/value`,
        remainingRevenueSharePercent: removed.remainingRevenueShare?.percent ?? null,
        remainingRevenueShareBasisPoints: removed.remainingRevenueShare === null
          ? null : basisPoints(removed.remainingRevenueShare.percent),
        remainingRevenueSharePointer: removed.remainingRevenueShare === null
          ? null : `${base}/remainingRevenueShare/percent`,
        remainingRevenueShareNumeratorValue: removed.remainingRevenueShare?.numerator ?? null,
        remainingRevenueShareNumeratorPointer: removed.remainingRevenueShare === null
          ? null : `${base}/remainingRevenueShare/numerator`,
        remainingRevenueShareDenominatorValue: removed.remainingRevenueShare?.denominator ?? null,
        remainingRevenueShareDenominatorPointer: removed.remainingRevenueShare === null
          ? null : `${base}/remainingRevenueShare/denominator`,
        concentrationAfterRemoval,
        source: scopeSource(packet, scopeKey),
        limits: [...new Set(['LEADER_REMOVAL_SENSITIVITY_NOT_FORECAST', ...scope.warnings, ...blockers])],
      },
      blockers: [...new Set(blockers)],
    };
  });
  const blockers = scopes.flatMap(lane => lane.blockers.map(value => `top-shop-removal-sensitivity:${value}`));
  const pointCount = scopes.filter(lane => lane.point !== null).length;
  return {
    chartId: 'top-shop-removal-sensitivity',
    sectionId: 'M04',
    state: pointCount === 0 ? 'BLOCKED' : scopes.every(lane => lane.state === 'READY') ? 'READY' : 'PARTIAL',
    exactMethodHandler: section.exact,
    relationship: 'LEADER_REMOVAL_SENSITIVITY_NOT_FORECAST',
    scopes,
    blockers: [...new Set(blockers)],
  };
}

/**
 * Build bounded M03/M04 views from the exact A3 claims and already-computed A1
 * diagnostics. Exact replay is performed before any value is exposed; this
 * layer cannot promote an unimplemented section or invent new arithmetic.
 */
export function buildResearchReportChartData(
  resultBytes: Buffer,
  resultSha256: string,
  catalogBytes: Buffer,
  catalogSha256: string,
): ResearchReportChartData {
  const { packet } = createResearchReportPacket(resultBytes, resultSha256, catalogBytes, catalogSha256);
  const result = parseResult(resultBytes);
  const totalsSection = sectionFor(packet, 'scope-totals');
  const concentrationSection = sectionFor(packet, 'top-shop-share');
  const totalsLanes = makeLanes(packet, result, totalsSection.section, totalMetrics,
    ['OVERLAPPING_SCOPE_MEMBERSHIP_NON_ADDITIVE']);
  const concentrationLanes = makeLanes(packet, result, concentrationSection.section, concentrationMetrics,
    ['CUMULATIVE_TOP_K_SHARES_OVERLAP_NOT_DONUT']);
  const totalsBlockers = chartBlockers('scope-totals', totalsLanes, totalsSection.exact);
  const concentrationBlockers = chartBlockers('top-shop-share', concentrationLanes, concentrationSection.exact);
  const scopeSensitivity = buildScopeSensitivity(packet, result, totalsSection);
  const groupComposition = buildGroupComposition(packet, result, concentrationSection);
  const topShopRemoval = buildTopShopRemoval(packet, result, concentrationSection);
  verifyDiagnosticPointers(result, scopeSensitivity, groupComposition, topShopRemoval);
  return {
    contractVersion: 'research-report-charts-v2',
    approvalState: 'UNREVIEWED',
    resultSha256: packet.metricResultSha256,
    catalogSha256: packet.catalogSha256,
    sourcePeriod: {
      start: packet.scope.start,
      end: packet.scope.end,
      periodBasis: packet.scope.periodBasis,
      acquiredAt: packet.scope.acquiredAt,
    },
    computation: computation(packet, result),
    scopeKeys,
    totals: {
      chartId: 'scope-totals',
      sectionId: 'M03',
      sectionDeliveryState: totalsSection.deliveryState,
      state: aggregateState(totalsLanes),
      exactMethodHandler: totalsSection.exact,
      relationship: 'OVERLAPPING_NON_ADDITIVE',
      scopes: totalsLanes,
      blockers: totalsBlockers,
    },
    topShopShare: {
      chartId: 'top-shop-share',
      sectionId: 'M04',
      sectionDeliveryState: concentrationSection.deliveryState,
      state: aggregateState(concentrationLanes),
      exactMethodHandler: concentrationSection.exact,
      relationship: 'CUMULATIVE_OVERLAPPING_NOT_DONUT',
      scopes: concentrationLanes,
      blockers: concentrationBlockers,
    },
    scopeSensitivity,
    groupComposition,
    topShopRemoval,
    blockers: [...new Set([
      ...totalsBlockers,
      ...concentrationBlockers,
      ...scopeSensitivity.blockers,
      ...groupComposition.blockers,
      ...topShopRemoval.blockers,
    ])],
  };
}
