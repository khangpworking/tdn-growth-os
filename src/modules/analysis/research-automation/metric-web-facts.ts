import type {
  Absent,
  AutomationMetricWebSnapshotV1,
  KpiMetric,
  Period,
  Platform,
  Scope,
  Table,
  Text,
  Top10Share,
  Value,
} from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';

// Pure and deterministic: copies and parses only. No sums across platforms,
// no computed shares, and a missing value stays null (missing is not 0).

export interface MetricWebValueFact {
  readonly label: string;
  readonly displayed: string;
  readonly value: number | null;
  readonly unit: Value['unit'];
  readonly precision: Value['precision'];
  readonly platform: Value['platform'];
  readonly period: Period;
  readonly sourcePointer: string;
}
export interface MetricWebTextFact { readonly label: string; readonly text: string; readonly sourcePointer: string }
export interface MetricWebAbsentFact { readonly absent: true; readonly reason: Absent['reason'] }
export type MetricWebCellFact = MetricWebValueFact | MetricWebTextFact;
export type MetricWebTableFact = readonly Readonly<Record<string, MetricWebCellFact>>[] | MetricWebAbsentFact;
export interface MetricWebKpiFact { readonly current: MetricWebValueFact; readonly changePct: MetricWebValueFact | null }
export interface MetricWebMonthFact { readonly revenue: MetricWebValueFact; readonly units: MetricWebValueFact | null; readonly partial: boolean }
export type MetricWebTop10Fact = { readonly top10: MetricWebValueFact; readonly others: MetricWebValueFact } | MetricWebAbsentFact;

export interface MetricWebFacts {
  readonly captureId: string;
  readonly specDigest: string;
  readonly capturedAt: string;
  readonly scope: Scope;
  readonly kpi: { readonly revenue: MetricWebKpiFact; readonly units: MetricWebKpiFact; readonly soldListings: MetricWebKpiFact; readonly shops: MetricWebKpiFact };
  readonly platformSplit: readonly { readonly platform: Platform; readonly revenue: MetricWebValueFact; readonly share: MetricWebValueFact }[];
  readonly monthly: Readonly<Partial<Record<Platform, Readonly<Record<string, MetricWebMonthFact>>>>> | MetricWebAbsentFact;
  readonly category: MetricWebTableFact;
  readonly priceLevel: MetricWebTableFact;
  readonly top10Share: { readonly brand: MetricWebTop10Fact; readonly shop: MetricWebTop10Fact };
  readonly brandByShopType: MetricWebTableFact;
  readonly shopType: readonly { readonly shopType: 'mall' | 'normal'; readonly share: MetricWebValueFact }[] | MetricWebAbsentFact;
  readonly location: MetricWebTableFact;
  readonly topProducts: MetricWebTableFact;
  readonly topShops: MetricWebTableFact;
  readonly topBrands: MetricWebTableFact;
  readonly detailHistory: MetricWebTableFact;
}

const MULTIPLIER: Readonly<Record<string, number>> = { 'tỷ': 1_000_000_000, 'triệu': 1_000_000, 'nghìn': 1_000 };
// Integer part with dot thousands separators (or plain digits), optional comma decimals, optional unit word or %.
const DISPLAY_NUMBER = /^(-?)(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?\s*(tỷ|triệu|nghìn|%)?$/u;

/**
 * Parses the number a results page prints. Supported: "12,3 tỷ", "4,5 triệu", "850 nghìn",
 * "37,8%", "1.234.567", "-5,2%". Anything else returns null; it never guesses.
 */
export function parseVietnameseDisplayNumber(displayed: string): { value: number; unit: 'VND' | 'COUNT' | 'PERCENT' } | null {
  const match = DISPLAY_NUMBER.exec(displayed.normalize('NFC').trim().toLowerCase());
  if (match === null) return null;
  const [, sign, integer, fraction = '', suffix] = match;
  const digits = Number(`${integer!.replaceAll('.', '')}${fraction}`);
  const scale = 10 ** fraction.length;
  const multiplier = suffix !== undefined && suffix !== '%' ? MULTIPLIER[suffix]! : 1;
  const magnitude = (digits * multiplier) / scale;
  const value = sign === '-' && magnitude !== 0 ? -magnitude : magnitude;
  if (!Number.isFinite(value)) return null;
  if (suffix === '%') return { value, unit: 'PERCENT' };
  return { value, unit: suffix === undefined ? 'COUNT' : 'VND' };
}

/** A parsed percent fits only a PERCENT value; a parsed amount fits VND, COUNT or RANK. Otherwise stay null. */
const unitFits = (declared: Value['unit'], parsed: 'VND' | 'COUNT' | 'PERCENT'): boolean =>
  declared === 'PERCENT' ? parsed === 'PERCENT' : parsed !== 'PERCENT';

function valueFact(value: Value): MetricWebValueFact {
  const base = {
    label: value.label,
    displayed: value.displayed,
    unit: value.unit,
    platform: value.platform,
    period: { startDate: value.period.startDate, endDate: value.period.endDate },
    sourcePointer: value.sourcePointer,
  };
  if (value.value !== null) return { ...base, value: value.value, precision: value.precision };
  const parsed = parseVietnameseDisplayNumber(value.displayed);
  if (parsed === null || !unitFits(value.unit, parsed.unit)) return { ...base, value: null, precision: value.precision };
  return { ...base, value: parsed.value, precision: 'display_rounded' };
}

const nullableValueFact = (value: Value | null): MetricWebValueFact | null => value === null ? null : valueFact(value);
const textFact = (text: Text): MetricWebTextFact => ({ label: text.label, text: text.text, sourcePointer: text.sourcePointer });
const isAbsent = (group: object): group is Absent => 'absent' in group;
const absentFact = (group: Absent): MetricWebAbsentFact => ({ absent: true, reason: group.reason });
const kpiFact = (metric: KpiMetric): MetricWebKpiFact => ({ current: valueFact(metric.current), changePct: nullableValueFact(metric.changePct) });

function tableFact(group: Table | Absent): MetricWebTableFact {
  if (isAbsent(group)) return absentFact(group);
  return group.rows.map(row => Object.fromEntries(group.columns
    .filter(column => row.cells[column] !== undefined)
    .map(column => {
      const cell = row.cells[column]!;
      return [column, 'text' in cell ? textFact(cell) : valueFact(cell)];
    })));
}

const top10Fact = (group: Top10Share | Absent): MetricWebTop10Fact =>
  isAbsent(group) ? absentFact(group) : { top10: valueFact(group.top10), others: valueFact(group.others) };

const lastDayOfMonth = (year: number, month: number): number => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** True when scope.period cuts the month: the first month not starting on the 1st, or the last month not ending on its last day. */
export function isPartialMonth(month: string, period: Period): boolean {
  const startMonth = period.startDate.slice(0, 7);
  const endMonth = period.endDate.slice(0, 7);
  if (month === startMonth && period.startDate.slice(8, 10) !== '01') return true;
  if (month === endMonth) {
    const endDay = Number(period.endDate.slice(8, 10));
    if (endDay !== lastDayOfMonth(Number(endMonth.slice(0, 4)), Number(endMonth.slice(5, 7)))) return true;
  }
  return false;
}

function monthlyFact(snapshot: AutomationMetricWebSnapshotV1): MetricWebFacts['monthly'] {
  const group = snapshot.groups.W4_monthly;
  if (isAbsent(group)) return absentFact(group);
  const byPlatform: Partial<Record<Platform, [string, MetricWebMonthFact][]>> = {};
  for (const point of group) {
    (byPlatform[point.platform] ??= []).push([point.month, {
      revenue: valueFact(point.revenue),
      units: nullableValueFact(point.units),
      partial: isPartialMonth(point.month, snapshot.scope.period),
    }]);
  }
  const platforms = (Object.keys(byPlatform) as Platform[]).sort();
  return Object.fromEntries(platforms.map(platform => [
    platform,
    Object.fromEntries(byPlatform[platform]!.sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)),
  ]));
}

export function normaliseMetricWebSnapshot(snapshot: AutomationMetricWebSnapshotV1): MetricWebFacts {
  const groups = snapshot.groups;
  return {
    captureId: snapshot.captureId,
    specDigest: snapshot.specDigest,
    capturedAt: snapshot.capturedAt,
    scope: structuredClone(snapshot.scope),
    kpi: {
      revenue: kpiFact(groups.W2_kpi.revenue),
      units: kpiFact(groups.W2_kpi.units),
      soldListings: kpiFact(groups.W2_kpi.soldListings),
      shops: kpiFact(groups.W2_kpi.shops),
    },
    platformSplit: groups.W3_platformSplit.map(entry => ({ platform: entry.platform, revenue: valueFact(entry.revenue), share: valueFact(entry.share) })),
    monthly: monthlyFact(snapshot),
    category: tableFact(groups.W5_category),
    priceLevel: tableFact(groups.W6_priceLevel),
    top10Share: { brand: top10Fact(groups.W7_top10Brand), shop: top10Fact(groups.W8_top10Shop) },
    brandByShopType: tableFact(groups.W9_brandByShopType),
    shopType: isAbsent(groups.W10_shopType)
      ? absentFact(groups.W10_shopType)
      : groups.W10_shopType.map(entry => ({ shopType: entry.shopType, share: valueFact(entry.share) })),
    location: tableFact(groups.W11_location),
    topProducts: tableFact(groups.W12_topProducts),
    topShops: tableFact(groups.W13_topShops),
    topBrands: tableFact(groups.W14_topBrands),
    detailHistory: tableFact(groups.W16_detailHistory),
  };
}
