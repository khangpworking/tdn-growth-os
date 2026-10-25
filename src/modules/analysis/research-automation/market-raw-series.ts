/**
 * Market numbers read straight from a capture's raw-responses.json, never from
 * chart text. Pure: no I/O, no HTML. Each value carries the response it came
 * from and a JSON pointer into that response entry so a later check can trace it.
 *
 * - KPI totals and their PREVIOUS_* twins come from the search-basic
 *   aggregations, one row per platform id.
 * - Revenue/order intervals come from the market insight response
 *   (order_revenue_intervals), one series per platform; series are never summed.
 * - Cross-platform totals are separate fields: the selected scope (default
 *   Shopee + TikTok Shop) and every platform in the response. A total with a
 *   missing member is null with a reason (R-M18), never a partial sum.
 * - A missing field is null with a reason, never 0.
 */

export const MARKET_RAW_SERIES_VERSION = 'market-raw-series-v1';

export const MARKET_RAW_PLATFORM_IDS = Object.freeze({ shopee: 1, tiktok: 8 } as const);
export const MARKET_RAW_SCOPE_PLATFORM_IDS: readonly number[] = Object.freeze([MARKET_RAW_PLATFORM_IDS.shopee, MARKET_RAW_PLATFORM_IDS.tiktok]);

export const MARKET_RAW_KPI_AGGREGATIONS = Object.freeze({
  revenue: 'REVENUE_TOTAL_CUSTOM',
  units: 'ORDER_TOTAL_CUSTOM',
  products: 'PRODUCT_TOTAL',
  shops: 'SHOP_TOTAL',
} as const);

export type MarketRawKpiField = keyof typeof MARKET_RAW_KPI_AGGREGATIONS;
const KPI_FIELDS = Object.keys(MARKET_RAW_KPI_AGGREGATIONS) as MarketRawKpiField[];

const SEARCH_BASIC_PATH = /\/market\/analytics\/search-basic\/?$/i;
const INSIGHT_PATH = /\/market\/analytics\/insight\/?$/i;

export interface MarketRawSource {
  /** Request URL path of the response, as stored in raw-responses.json. */
  readonly url: string;
  /** Index of the response in raw-responses.json. */
  readonly responseIndex: number;
  /** JSON pointer into that response's entry in raw-responses.json (`/body/...` or `/requestBody/...`). */
  readonly jsonPath: string;
}

export type MarketRawValue =
  | { readonly value: number; readonly source: MarketRawSource; readonly reason?: undefined }
  | { readonly value: null; readonly source: MarketRawSource | null; readonly reason: string };

export type MarketRawKpi = Readonly<Record<MarketRawKpiField, MarketRawValue>>;

export type MarketRawChange =
  | { readonly value: number; readonly reason?: undefined }
  | { readonly value: null; readonly reason: string };

export interface MarketRawInterval {
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly revenue: MarketRawValue;
  readonly units: MarketRawValue;
}

export interface MarketRawPlatform {
  readonly platformId: number;
  readonly kpi: MarketRawKpi;
  readonly previous: MarketRawKpi;
  /** (current - previous) / previous, per KPI field. */
  readonly change: Readonly<Record<MarketRawKpiField, MarketRawChange>>;
  readonly intervals: readonly MarketRawInterval[] | null;
  readonly intervalsReason?: string;
}

export type MarketRawTotalValue =
  | { readonly value: number; readonly members: readonly MarketRawSource[]; readonly reason?: undefined }
  | { readonly value: null; readonly members: readonly MarketRawSource[]; readonly reason: string };

export interface MarketRawTotal {
  readonly platformIds: readonly number[];
  readonly kpi: Readonly<Record<MarketRawKpiField, MarketRawTotalValue>>;
  readonly previous: Readonly<Record<MarketRawKpiField, MarketRawTotalValue>>;
  readonly change: Readonly<Record<MarketRawKpiField, MarketRawChange>>;
}

export type MarketRawPeriod =
  | { readonly startDate: string; readonly endDate: string; readonly days: number; readonly source: MarketRawSource; readonly reason?: undefined }
  | { readonly startDate: null; readonly endDate: null; readonly days: null; readonly source: MarketRawSource | null; readonly reason: string };

export interface MarketRawSeries {
  readonly contractVersion: typeof MARKET_RAW_SERIES_VERSION;
  /** Period of the search request, from the request body. */
  readonly period: MarketRawPeriod;
  /** Platform ids the search request asked for (include_query.platforms); null when the request does not say. */
  readonly requestedPlatformIds: readonly number[] | null;
  /** Interval length the insight request asked for (7 for a 30-day period, 30 for a 12-month period). */
  readonly intervalDays: MarketRawValue;
  /** Requested and returned platforms in id order. */
  readonly platforms: readonly MarketRawPlatform[];
  readonly totals: { readonly scope: MarketRawTotal; readonly all: MarketRawTotal };
  /** Set when the search-basic response is absent or has no aggregations. */
  readonly reason?: string;
}

export interface MarketRawSeriesOptions {
  /** Platform ids of the 2-platform scope total. Defaults to Shopee (1) and TikTok Shop (8). */
  readonly scopePlatformIds?: readonly number[];
}

type Json = Record<string, unknown>;
interface RawEntry { readonly index: number; readonly url: string; readonly body: unknown; readonly requestBody: unknown; readonly order: number; readonly ok: boolean }

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const pointerPart = (part: string | number): string => String(part).replace(/~/g, '~0').replace(/\//g, '~1');
const pointer = (...parts: (string | number)[]): string => parts.map(part => `/${pointerPart(part)}`).join('');
const missing = (reason: string, source: MarketRawSource | null = null): MarketRawValue => ({ value: null, source, reason });

function parseJsonish(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return value; }
}

function entriesOf(rawResponses: unknown): RawEntry[] {
  const list = Array.isArray(rawResponses) ? rawResponses : isRecord(rawResponses) && Array.isArray(rawResponses.responses) ? rawResponses.responses : [];
  return list.flatMap((item: unknown, index: number): RawEntry[] => {
    if (!isRecord(item)) return [];
    const rawUrl = [item.urlPath, item.path, item.url].find(value => typeof value === 'string' && value.trim()) as string | undefined;
    if (!rawUrl) return [];
    let url = rawUrl.trim();
    try { url = new URL(url, 'https://invalid.local').pathname; } catch { url = url.split('?')[0]!; }
    const status = item.status ?? item.responseStatus;
    return [{ index, url, body: parseJsonish(item.body ?? item.response ?? item.data), requestBody: parseJsonish(item.requestBody ?? item.requestBodyPreview),
      order: typeof item.responseOrder === 'number' && Number.isSafeInteger(item.responseOrder) ? item.responseOrder : index,
      ok: status === undefined || status === null || status === 200 }];
  });
}

/**
 * The latest completed response for a path that carries data. Captures hold a
 * stale pre-search response first and can end with an empty one, so neither
 * capture order alone nor the last entry is enough.
 */
function latest(entries: readonly RawEntry[], path: RegExp, hasData: (body: unknown) => boolean): RawEntry | null {
  return entries.filter(entry => path.test(entry.url) && entry.ok && hasData(entry.body))
    .reduce<RawEntry | null>((best, entry) => !best || entry.order >= best.order ? entry : best, null);
}

const searchAggregations = (body: unknown): unknown[] => {
  const data = isRecord(body) && isRecord(body.data) ? body.data : null;
  const basic = data && isRecord(data.search_basic) ? data.search_basic : null;
  return basic && Array.isArray(basic.aggregations) ? basic.aggregations : [];
};

function hasIntervals(node: unknown): boolean {
  if (Array.isArray(node)) return node.some(hasIntervals);
  if (!isRecord(node)) return false;
  return Array.isArray(node.order_revenue_intervals) || Object.values(node).some(hasIntervals);
}

function numberValue(raw: unknown, source: MarketRawSource): MarketRawValue {
  if (raw === null || raw === undefined) return missing('field-missing', source);
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  return Number.isFinite(value) ? { value, source } : missing('field-not-a-number', source);
}

const platformIdOf = (raw: unknown): number | null => {
  const id = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  return Number.isSafeInteger(id) ? id : null;
};

/** Platform id -> value for one headline aggregation; entries without an id are skipped, never relabelled. */
function aggregationByPlatform(entry: RawEntry, aggregations: readonly unknown[], name: string): Map<number, MarketRawValue> | null {
  const index = aggregations.findIndex(item => isRecord(item) && typeof item.aggregation === 'string' && item.aggregation.trim().toUpperCase() === name);
  if (index < 0) return null;
  const platforms = (aggregations[index] as Json).entity;
  const raw = isRecord(platforms) ? platforms.platforms : undefined;
  const list: [string | number, unknown][] = Array.isArray(raw) ? raw.map((item, i) => [i, item]) : isRecord(raw) ? Object.entries(raw) : [];
  const out = new Map<number, MarketRawValue>();
  for (const [key, item] of list) {
    if (!isRecord(item)) continue;
    const id = platformIdOf(item.platform_id);
    if (id === null || out.has(id)) continue;
    out.set(id, numberValue(item.value, { url: entry.url, responseIndex: entry.index,
      jsonPath: pointer('body', 'data', 'search_basic', 'aggregations', index, 'entity', 'platforms', key, 'value') }));
  }
  return out;
}

function change(current: number | null, previous: number | null): MarketRawChange {
  if (current === null) return { value: null, reason: 'current-missing' };
  if (previous === null) return { value: null, reason: 'previous-missing' };
  if (previous === 0) return { value: null, reason: 'previous-is-zero' };
  return { value: (current - previous) / previous };
}

function total(values: readonly (MarketRawValue | undefined)[], ids: readonly number[]): MarketRawTotalValue {
  const members = values.flatMap(value => value?.source ? [value.source] : []);
  if (!ids.length) return { value: null, members, reason: 'no-platforms' };
  const absent = ids.filter((_, i) => values[i] === undefined || values[i]!.value === null);
  if (absent.length) return { value: null, members, reason: `member-missing:${absent.join(',')}` };
  return { value: values.reduce((sum, value) => sum + (value!.value as number), 0), members };
}

const isoDate = (raw: unknown): string | null => {
  if (typeof raw !== 'string' && typeof raw !== 'number') return null;
  const text = String(raw).trim();
  // The search request sends YYYYMMDD; interval rows use YYYY-MM-DD.
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text) ?? /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!match) return null;
  const [y, m, d] = [match[1], match[2], match[3]];
  const date = `${y}-${m}-${d}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
};

const PERIOD_KEYS: readonly (readonly [string, string])[] = [['start_date', 'end_date'], ['startDate', 'endDate'], ['from_date', 'to_date'], ['date_from', 'date_to']];

/** Period of a request: the first known start/end key pair at the body root or one object level down. */
function periodOf(entry: RawEntry | null): MarketRawPeriod {
  if (!entry) return { startDate: null, endDate: null, days: null, source: null, reason: 'search-basic-response-missing' };
  const body = entry.requestBody;
  const source = (path: string): MarketRawSource => ({ url: entry.url, responseIndex: entry.index, jsonPath: path });
  if (!isRecord(body)) return { startDate: null, endDate: null, days: null, source: null, reason: 'request-body-missing' };
  const scopes: [string[], Json][] = [[[], body], ...Object.entries(body).filter(([, value]) => isRecord(value)).map(([key, value]): [string[], Json] => [[key], value as Json])];
  for (const [prefix, scope] of scopes) {
    for (const [startKey, endKey] of PERIOD_KEYS) {
      const startDate = isoDate(scope[startKey]); const endDate = isoDate(scope[endKey]);
      if (!startDate || !endDate) continue;
      const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86_400_000) + 1;
      return { startDate, endDate, days, source: source(pointer('requestBody', ...prefix, startKey)) };
    }
  }
  return { startDate: null, endDate: null, days: null, source: null, reason: 'request-period-missing' };
}

function requestedPlatformIds(entry: RawEntry | null): number[] | null {
  const query = entry && isRecord(entry.requestBody) && isRecord(entry.requestBody.include_query) ? entry.requestBody.include_query : null;
  if (!query || !Array.isArray(query.platforms)) return null;
  const ids = query.platforms.map(platformIdOf);
  return ids.every((id): id is number => id !== null) ? [...new Set(ids)].sort((a, b) => a - b) : null;
}

function intervalDaysOf(entry: RawEntry | null): MarketRawValue {
  if (!entry) return missing('insight-response-missing');
  const source: MarketRawSource = { url: entry.url, responseIndex: entry.index, jsonPath: pointer('requestBody', 'interval_days') };
  return isRecord(entry.requestBody) ? numberValue(entry.requestBody.interval_days, source) : missing('request-body-missing');
}

/** Per-platform interval series from the market insight response; one series per platform id, never merged. */
function intervalsOf(entry: RawEntry | null): { byPlatform: Map<number, MarketRawInterval[]>; ambiguous: Set<number>; reason: string | null } {
  const byPlatform = new Map<number, MarketRawInterval[]>(); const ambiguous = new Set<number>();
  if (!entry) return { byPlatform, ambiguous, reason: 'insight-response-missing' };
  const stack: [unknown, (string | number)[]][] = [[entry.body, []]];
  while (stack.length) {
    const [node, path] = stack.pop()!;
    if (Array.isArray(node)) { node.forEach((item, i) => stack.push([item, [...path, i]])); continue; }
    if (!isRecord(node)) continue;
    if (Array.isArray(node.order_revenue_intervals)) {
      const id = platformIdOf(node.platform_id);
      if (id === null) continue;
      if (byPlatform.has(id)) { ambiguous.add(id); continue; }
      byPlatform.set(id, node.order_revenue_intervals.map((interval: unknown, i: number) => {
        const at = (field: string): MarketRawSource => ({ url: entry.url, responseIndex: entry.index, jsonPath: pointer('body', ...path, 'order_revenue_intervals', i, field) });
        const row = isRecord(interval) ? interval : {};
        return { startDate: isoDate(row.start_date), endDate: isoDate(row.end_date),
          revenue: numberValue(row.revenue_custom_sum, at('revenue_custom_sum')), units: numberValue(row.order_custom_sum, at('order_custom_sum')) };
      }));
      continue;
    }
    for (const [key, value] of Object.entries(node)) stack.push([value, [...path, key]]);
  }
  for (const id of ambiguous) byPlatform.delete(id);
  return { byPlatform, ambiguous, reason: byPlatform.size || ambiguous.size ? null : 'order-revenue-intervals-missing' };
}

function totalsFor(ids: readonly number[], platforms: ReadonlyMap<number, MarketRawPlatform>): MarketRawTotal {
  const kpi = {} as Record<MarketRawKpiField, MarketRawTotalValue>;
  const previous = {} as Record<MarketRawKpiField, MarketRawTotalValue>;
  const changes = {} as Record<MarketRawKpiField, MarketRawChange>;
  for (const field of KPI_FIELDS) {
    kpi[field] = total(ids.map(id => platforms.get(id)?.kpi[field]), ids);
    previous[field] = total(ids.map(id => platforms.get(id)?.previous[field]), ids);
    changes[field] = change(kpi[field].value, previous[field].value);
  }
  return { platformIds: [...ids], kpi, previous, change: changes };
}

/** Reads typed Market numbers from a capture's raw-responses.json content. */
export function readMarketRawSeries(rawResponses: unknown, options: MarketRawSeriesOptions = {}): MarketRawSeries {
  const entries = entriesOf(rawResponses);
  // A completed search without aggregations is missing data for that request,
  // not permission to reuse an older query's numbers.
  const search = latest(entries, SEARCH_BASIC_PATH, isRecord);
  const insight = latest(entries, INSIGHT_PATH, hasIntervals);
  const aggregations = search ? searchAggregations(search.body) : [];
  const reason = aggregations.length ? undefined : entries.some(entry => SEARCH_BASIC_PATH.test(entry.url)) ? 'search-basic-aggregations-missing' : 'search-basic-response-missing';
  const requested = requestedPlatformIds(search);

  const current = new Map<MarketRawKpiField, Map<number, MarketRawValue> | null>();
  const prior = new Map<MarketRawKpiField, Map<number, MarketRawValue> | null>();
  for (const field of KPI_FIELDS) {
    const name = MARKET_RAW_KPI_AGGREGATIONS[field];
    current.set(field, search ? aggregationByPlatform(search, aggregations, name) : null);
    prior.set(field, search ? aggregationByPlatform(search, aggregations, `PREVIOUS_${name}`) : null);
  }
  const intervals = intervalsOf(insight);
  // Requested and interval-only platforms retain missing KPIs and block totals.
  const ids = [...new Set([...(requested ?? []), ...intervals.byPlatform.keys(), ...intervals.ambiguous,
    ...[...current.values(), ...prior.values()].flatMap(map => map ? [...map.keys()] : [])])].sort((a, b) => a - b);
  const read = (maps: Map<MarketRawKpiField, Map<number, MarketRawValue> | null>, id: number, prefix: string) =>
    Object.fromEntries(KPI_FIELDS.map(field => {
      const map = maps.get(field);
      const name = `${prefix}${MARKET_RAW_KPI_AGGREGATIONS[field]}`;
      return [field, !map ? missing(`aggregation-missing:${name}`) : map.get(id) ?? missing(`platform-missing:${name}`)];
    })) as MarketRawKpi;

  const platforms = new Map<number, MarketRawPlatform>();
  for (const id of ids) {
    const kpi = read(current, id, ''); const previous = read(prior, id, 'PREVIOUS_');
    const series = intervals.byPlatform.get(id);
    const intervalsReason = series ? undefined : intervals.ambiguous.has(id) ? 'order-revenue-intervals-ambiguous' : intervals.reason ?? 'platform-missing:order_revenue_intervals';
    platforms.set(id, { platformId: id, kpi, previous,
      change: Object.fromEntries(KPI_FIELDS.map(field => [field, change(kpi[field].value, previous[field].value)])) as MarketRawPlatform['change'],
      intervals: series ?? null, ...(intervalsReason ? { intervalsReason } : {}) });
  }

  const scopeIds = [...new Set(options.scopePlatformIds ?? MARKET_RAW_SCOPE_PLATFORM_IDS)].sort((a, b) => a - b);
  return {
    contractVersion: MARKET_RAW_SERIES_VERSION,
    period: periodOf(search),
    requestedPlatformIds: requested,
    intervalDays: intervalDaysOf(insight),
    platforms: [...platforms.values()],
    totals: { scope: totalsFor(scopeIds, platforms), all: totalsFor(ids, platforms) },
    ...(reason ? { reason } : {}),
  };
}
