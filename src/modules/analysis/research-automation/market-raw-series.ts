/**
 * Market numbers read straight from a capture's raw-responses.json, never from
 * chart text. Pure: no I/O, no HTML. Each value carries the response it came
 * from and a JSON pointer into that response entry so a later check can trace it
 * (`resolveMarketRawSource` replays it on the stored capture).
 *
 * - KPI totals and their PREVIOUS_* twins come from the search-basic
 *   aggregations, one row per platform id.
 * - Revenue/order intervals come from the market insight response
 *   (order_revenue_intervals), one series per platform, every window the
 *   response has (a rolling year has 13, with partial first and last months);
 *   windows are never dropped, merged or summed into KPI totals.
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
const DAY_MS = 86_400_000;

const SEARCH_BASIC_PATH = /\/market\/analytics\/search-basic\/?$/i;
const INSIGHT_PATH = /\/market\/analytics\/insight\/?$/i;

export interface MarketRawSource {
  /** Request URL path of the response, as stored in raw-responses.json. */
  readonly url: string;
  /** Index of the response in raw-responses.json. */
  readonly responseIndex: number;
  /** JSON pointer into that response's entry in raw-responses.json (`/body/...` or `/requestBody/...`). */
  readonly jsonPath: string;
  /**
   * Set when the value at `jsonPath` is stored as a JSON string (captures store
   * `requestBody` that way): decode that string, then follow `decodedPath`.
   */
  readonly encoding?: 'json-string';
  readonly decodedPath?: string;
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
  /**
   * True when the window is shorter than a full one: its calendar month for
   * monthly windows (interval_days >= 28), else interval_days. Null when the
   * dates or interval_days are missing.
   */
  readonly partial: boolean | null;
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
  /** Pointer to include_query.platforms of that request; null when the request does not say. */
  readonly requestedPlatformsSource: MarketRawSource | null;
  /** Keywords the search request sent (include_query.queries), each with its pointer; empty when the request does not say. */
  readonly requestedQueries: readonly { readonly text: string; readonly source: MarketRawSource }[];
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
type EntryField = 'body' | 'requestBody';
interface RawEntry {
  readonly index: number; readonly url: string; readonly body: unknown; readonly requestBody: unknown; readonly order: number; readonly ok: boolean;
  /** Fields whose stored value is a JSON string that was decoded. */
  readonly encoded: ReadonlySet<EntryField>;
}

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const pointerPart = (part: string | number): string => String(part).replace(/~/g, '~0').replace(/\//g, '~1');
const pointer = (...parts: (string | number)[]): string => parts.map(part => `/${pointerPart(part)}`).join('');
const missing = (reason: string, source: MarketRawSource | null = null): MarketRawValue => ({ value: null, source, reason });

function parseJsonish(value: unknown): { value: unknown; encoded: boolean } {
  if (typeof value !== 'string') return { value, encoded: false };
  try { return { value: JSON.parse(value), encoded: true }; } catch { return { value, encoded: false }; }
}

/** Source of a value inside an entry field, with the decode step when the field is stored as a JSON string. */
function sourceAt(entry: RawEntry, field: EntryField, ...parts: (string | number)[]): MarketRawSource {
  const base = { url: entry.url, responseIndex: entry.index };
  return entry.encoded.has(field)
    ? { ...base, jsonPath: pointer(field), encoding: 'json-string', decodedPath: pointer(...parts) }
    : { ...base, jsonPath: pointer(field, ...parts) };
}

function follow(value: unknown, path: string): unknown {
  if (path === '') return value;
  if (!path.startsWith('/')) return undefined;
  let node = value;
  for (const raw of path.slice(1).split('/')) {
    const part = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(node)) node = /^(0|[1-9]\d*)$/.test(part) ? node[Number(part)] : undefined;
    else if (isRecord(node)) node = Object.hasOwn(node, part) ? node[part] : undefined;
    else return undefined;
  }
  return node;
}

/** Replays a source on the stored raw-responses.json content; undefined when it does not resolve. */
export function resolveMarketRawSource(rawResponses: unknown, source: MarketRawSource): unknown {
  const list = Array.isArray(rawResponses) ? rawResponses : isRecord(rawResponses) && Array.isArray(rawResponses.responses) ? rawResponses.responses : [];
  const stored = follow(list[source.responseIndex], source.jsonPath);
  if (source.encoding !== 'json-string') return stored;
  if (typeof stored !== 'string') return undefined;
  const decoded = parseJsonish(stored);
  return decoded.encoded ? follow(decoded.value, source.decodedPath ?? '') : undefined;
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
    // Pointers name the stored field, so only `body` and `requestBody` are read.
    const body = parseJsonish(item.body); const requestBody = parseJsonish(item.requestBody);
    const encoded = new Set<EntryField>([...(body.encoded ? ['body' as const] : []), ...(requestBody.encoded ? ['requestBody' as const] : [])]);
    return [{ index, url, body: body.value, requestBody: requestBody.value, encoded,
      order: typeof item.responseOrder === 'number' && Number.isSafeInteger(item.responseOrder) ? item.responseOrder : index,
      ok: status === undefined || status === null || status === 200 }];
  });
}

/**
 * The latest completed response for a path. Captures can end with an in-flight
 * entry whose body is null; skip it, but keep completed empty results so they
 * never fall back to stale data.
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
    out.set(id, numberValue(item.value, sourceAt(entry, 'body', 'data', 'search_basic', 'aggregations', index, 'entity', 'platforms', key, 'value')));
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
  if (!isRecord(body)) return { startDate: null, endDate: null, days: null, source: null, reason: 'request-body-missing' };
  const scopes: [string[], Json][] = [[[], body], ...Object.entries(body).filter(([, value]) => isRecord(value)).map(([key, value]): [string[], Json] => [[key], value as Json])];
  for (const [prefix, scope] of scopes) {
    for (const [startKey, endKey] of PERIOD_KEYS) {
      const startDate = isoDate(scope[startKey]); const endDate = isoDate(scope[endKey]);
      if (!startDate || !endDate) continue;
      const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS) + 1;
      return { startDate, endDate, days, source: sourceAt(entry, 'requestBody', ...prefix, startKey) };
    }
  }
  return { startDate: null, endDate: null, days: null, source: null, reason: 'request-period-missing' };
}

/** Source of a period's end date: the end key paired with the start key `period.source` points at. */
export function marketRawPeriodEndSource(source: MarketRawSource): MarketRawSource | null {
  const path = source.encoding === 'json-string' ? source.decodedPath ?? '' : source.jsonPath;
  const startKey = path.slice(path.lastIndexOf('/') + 1);
  const endKey = PERIOD_KEYS.find(([start]) => start === startKey)?.[1];
  if (!endKey) return null;
  const endPath = `${path.slice(0, path.lastIndexOf('/'))}/${endKey}`;
  return source.encoding === 'json-string' ? { ...source, decodedPath: endPath } : { ...source, jsonPath: endPath };
}

function requestedPlatformIds(entry: RawEntry | null): number[] | null {
  const query = entry && isRecord(entry.requestBody) && isRecord(entry.requestBody.include_query) ? entry.requestBody.include_query : null;
  if (!query || !Array.isArray(query.platforms)) return null;
  const ids = query.platforms.map(platformIdOf);
  return ids.every((id): id is number => id !== null) ? [...new Set(ids)].sort((a, b) => a - b) : null;
}

function requestedQueries(entry: RawEntry | null): MarketRawSeries['requestedQueries'] {
  const query = entry && isRecord(entry.requestBody) && isRecord(entry.requestBody.include_query) ? entry.requestBody.include_query : null;
  if (!entry || !query || !Array.isArray(query.queries)) return [];
  return query.queries.flatMap((text, i) => typeof text === 'string' ? [{ text, source: sourceAt(entry, 'requestBody', 'include_query', 'queries', i) }] : []);
}

function intervalDaysOf(entry: RawEntry | null): MarketRawValue {
  if (!entry) return missing('insight-response-missing');
  const source = sourceAt(entry, 'requestBody', 'interval_days');
  return isRecord(entry.requestBody) ? numberValue(entry.requestBody.interval_days, source) : missing('request-body-missing');
}

/** Per-platform interval series from the market insight response; one series per platform id, never merged. */
function isPartial(startDate: string | null, endDate: string | null, intervalDays: number | null): boolean | null {
  if (!startDate || !endDate || intervalDays === null) return null;
  const start = Date.parse(`${startDate}T00:00:00Z`); const end = Date.parse(`${endDate}T00:00:00Z`);
  const days = Math.round((end - start) / DAY_MS) + 1;
  if (intervalDays < 28) return days < intervalDays;
  const [y, m] = [Number(startDate.slice(0, 4)), Number(startDate.slice(5, 7))];
  return days < new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function intervalsOf(entry: RawEntry | null, intervalDays: number | null): { byPlatform: Map<number, MarketRawInterval[]>; ambiguous: Set<number>; reason: string | null } {
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
        const at = (field: string): MarketRawSource => sourceAt(entry, 'body', ...path, 'order_revenue_intervals', i, field);
        const row = isRecord(interval) ? interval : {};
        const startDate = isoDate(row.start_date); const endDate = isoDate(row.end_date);
        return { startDate, endDate, partial: isPartial(startDate, endDate, intervalDays),
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
  const insight = latest(entries, INSIGHT_PATH, isRecord);
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
  const intervalDays = intervalDaysOf(insight);
  const intervals = intervalsOf(insight, intervalDays.value);
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
    requestedPlatformsSource: search && requested ? sourceAt(search, 'requestBody', 'include_query', 'platforms') : null,
    requestedQueries: requestedQueries(search),
    intervalDays,
    platforms: [...platforms.values()],
    totals: { scope: totalsFor(scopeIds, platforms), all: totalsFor(ids, platforms) },
    ...(reason ? { reason } : {}),
  };
}
