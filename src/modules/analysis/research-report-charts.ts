import { createResearchReportPacket } from './versioned-report-packet.js';
import type { FactObservation, VersionedReportPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';

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

export interface ResearchReportChartData {
  readonly contractVersion: 'research-report-charts-v1';
  readonly approvalState: 'UNREVIEWED';
  readonly resultSha256: string;
  readonly catalogSha256: string;
  readonly sourcePeriod: ResearchChartPeriod;
  readonly computation: ResearchChartComputation;
  readonly scopeKeys: readonly ScopeKey[];
  readonly totals: ResearchScopeTotalsChart;
  readonly topShopShare: ResearchTopShopShareChart;
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
  | { readonly section: null; readonly exact: false; readonly deliveryState: VersionedReportPacket['sections'][number]['deliveryState'] | null };

function sectionFor(
  packet: VersionedReportPacket,
  chart: keyof typeof exactMethods,
): SectionSelection {
  const definition = exactMethods[chart];
  const section = packet.sections.find(candidate => candidate.sectionId === definition.sectionId);
  const catalogDefinition = packet.catalog.sections.find(candidate => candidate.sectionId === definition.sectionId);
  if (!section || !catalogDefinition || catalogDefinition.methodId !== definition.methodId ||
      catalogDefinition.methodVersion !== '1.0.0' || section.deliveryState !== 'PARTIAL_DETERMINISTIC_DRAFT' ||
      section.claimIds.length === 0) return { section: null, exact: false, deliveryState: section?.deliveryState ?? null };
  return { section, exact: true, deliveryState: section.deliveryState };
}

function parseResult(resultBytes: Buffer): Record<string, unknown> {
  // createResearchReportPacket has already checked the exact digest, UTF-8,
  // schema and deterministic A1 replay before this read is used for pointers.
  return JSON.parse(resultBytes.toString('utf8')) as Record<string, unknown>;
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

function computation(packet: VersionedReportPacket, result: Record<string, unknown>): ResearchChartComputation {
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
  result: Record<string, unknown>,
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
  result: Record<string, unknown>,
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

/**
 * Build only the two bounded quantitative views emitted by the A3 packet.
 * Exact replay is performed by createResearchReportPacket before any chart
 * value is exposed; catalog metadata cannot promote an unimplemented section.
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
  return {
    contractVersion: 'research-report-charts-v1',
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
    blockers: [...new Set([...totalsBlockers, ...concentrationBlockers])],
  };
}
