// Search-trend reader for the research-automation lane (offline, not wired into a run yet).
//
// It can only be reached through the shared provider transport, so the paid call stays bounded
// (see SEARCH_TRENDS_LIMITS.maxCallsPerRun and SearchCallBudget in expanded-search-queries.ts).
// Values are Google Trends relative interest indexes (0-100), never an absolute count or traffic
// figure. A missing or "<1" value stays null; it is never replaced with 0.
import {
  CaptureLog, boundedRequest, boundedText, bytesContainSecret, isRecord, parseJson, safeProviderCode,
  type CaptureContext, type ProviderTransport,
} from './provider-common.js';
import { SERPAPI_LIMITS, type ProviderCallOptions, type ProviderRawCapture } from './providers.js';

export const SEARCH_TRENDS_LIMITS = Object.freeze({
  maxKeywords: 5,
  maxCallsPerRun: 4,
  geo: 'VN',
  hl: 'vi',
  date: 'today 12-m',
});

export type TrendsDataType = 'TIMESERIES' | 'RELATED_QUERIES' | 'GEO_MAP_0';

export interface TrendsRequest {
  readonly dataType: TrendsDataType;
  readonly keywords: readonly string[];
}

export interface TrendsSeriesPoint { readonly period: string; readonly index: number | null }
export interface TrendsSeries { readonly keyword: string; readonly points: readonly TrendsSeriesPoint[] }
export interface TrendsRelatedQuery { readonly query: string; readonly index: number }
export interface TrendsRisingQuery { readonly query: string; readonly label: string }
export interface TrendsRegion { readonly region: string; readonly index: number | null }

export type TrendsFacts =
  | { readonly kind: 'TIMESERIES'; readonly unit: 'INDEX_0_100'; readonly series: readonly TrendsSeries[] }
  | {
    readonly kind: 'RELATED_QUERIES'; readonly keyword: string;
    readonly top: readonly TrendsRelatedQuery[]; readonly rising: readonly TrendsRisingQuery[];
  }
  | { readonly kind: 'GEO_MAP_0'; readonly keyword: string; readonly unit: 'INDEX_0_100'; readonly regions: readonly TrendsRegion[] };

export type TrendsCallStatus = 'NOT_CONFIGURED' | 'CANCELLED' | 'FAILED' | 'OK';

export interface TrendsCallResult {
  readonly status: TrendsCallStatus;
  readonly facts: TrendsFacts | null;
  readonly captures: readonly ProviderRawCapture[];
}

const INDEX_MIN = 0;
const INDEX_MAX = 100;
const KEYWORD_MAX_CHARS = 200;
const LABEL_MAX_CHARS = 64;
const PERIOD_MAX_CHARS = 64;
const REGION_MAX_CHARS = 120;

/** NFC, trim and collapse internal whitespace. Empty keywords are dropped, never sent as an empty `q`. */
function normalizeKeyword(value: string): string {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

/**
 * Dedupe case- and whitespace-insensitively, keep the first 5, and lay out at most 4 calls:
 * 1 x TIMESERIES (all keywords joined with ","), RELATED_QUERIES for the first 2 keywords
 * (this data type takes a single query per call), and 1 x GEO_MAP_0 for the first keyword.
 */
export function planTrendsRequests(confirmedKeywords: readonly string[]): readonly TrendsRequest[] {
  const keywords: string[] = [];
  const seen = new Set<string>();
  for (const raw of confirmedKeywords) {
    const keyword = normalizeKeyword(raw);
    if (!keyword) continue;
    const key = keyword.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    keywords.push(keyword);
    if (keywords.length === SEARCH_TRENDS_LIMITS.maxKeywords) break;
  }
  if (keywords.length === 0) return [];
  const plan: TrendsRequest[] = [{ dataType: 'TIMESERIES', keywords }];
  for (const keyword of keywords.slice(0, 2)) plan.push({ dataType: 'RELATED_QUERIES', keywords: [keyword] });
  plan.push({ dataType: 'GEO_MAP_0', keywords: [keywords[0]!] });
  return plan;
}

/** Stable, secret-free cache identity: same params and retrieval day give the same key. */
export function trendsCacheKey(req: TrendsRequest, retrievedDate: string): string {
  return `google_trends|${req.dataType}|${JSON.stringify(req.keywords.map(normalizeKeyword))}|${retrievedDate}`;
}

function indexOrNull(value: unknown, extracted: unknown): number | null {
  if (value === '<1') return null;
  return typeof extracted === 'number' && Number.isInteger(extracted) && extracted >= INDEX_MIN && extracted <= INDEX_MAX
    ? extracted
    : null;
}

/** The attributed keyword is only trusted when the provider echoes it in `search_parameters.q`. */
function requestKeyword(data: Record<string, unknown>): string | null {
  const params = data.search_parameters;
  return isRecord(params) ? boundedText(params.q, KEYWORD_MAX_CHARS) : null;
}

function parseTimeseries(data: Record<string, unknown>): TrendsFacts | null {
  const interest = data.interest_over_time;
  if (!isRecord(interest) || !Array.isArray(interest.timeline_data)) return null;
  const series = new Map<string, TrendsSeriesPoint[]>();
  for (const entry of interest.timeline_data) {
    if (!isRecord(entry)) continue;
    const period = boundedText(entry.date, PERIOD_MAX_CHARS);
    if (!period || !Array.isArray(entry.values)) continue;
    for (const item of entry.values) {
      if (!isRecord(item)) continue;
      const keyword = boundedText(item.query, KEYWORD_MAX_CHARS);
      if (!keyword) continue;
      const points = series.get(keyword) ?? [];
      points.push({ period, index: indexOrNull(item.value, item.extracted_value) });
      series.set(keyword, points);
    }
  }
  return {
    kind: 'TIMESERIES', unit: 'INDEX_0_100',
    series: [...series].map(([keyword, points]) => ({ keyword, points })),
  };
}

function parseRelatedQueries(data: Record<string, unknown>): TrendsFacts | null {
  const keyword = requestKeyword(data);
  const related = data.related_queries;
  if (!keyword || !isRecord(related) || !Array.isArray(related.top) || !Array.isArray(related.rising)) return null;
  const top: TrendsRelatedQuery[] = [];
  for (const item of related.top) {
    if (!isRecord(item)) continue;
    const query = boundedText(item.query, KEYWORD_MAX_CHARS);
    const index = indexOrNull(item.value, item.extracted_value);
    if (!query || index === null) continue;
    top.push({ query, index });
  }
  const rising: TrendsRisingQuery[] = [];
  for (const item of related.rising) {
    if (!isRecord(item)) continue;
    const query = boundedText(item.query, KEYWORD_MAX_CHARS);
    const label = boundedText(item.value, LABEL_MAX_CHARS);
    if (!query || !label) continue;
    rising.push({ query, label });
  }
  return { kind: 'RELATED_QUERIES', keyword, top, rising };
}

function parseGeoMap(data: Record<string, unknown>): TrendsFacts | null {
  const keyword = requestKeyword(data);
  if (!keyword || !Array.isArray(data.interest_by_region)) return null;
  const regions: TrendsRegion[] = [];
  for (const item of data.interest_by_region) {
    if (!isRecord(item)) continue;
    const region = boundedText(item.location, REGION_MAX_CHARS) ?? boundedText(item.geo, REGION_MAX_CHARS);
    if (!region) continue;
    regions.push({ region, index: indexOrNull(item.value, item.extracted_value) });
  }
  return { kind: 'GEO_MAP_0', keyword, unit: 'INDEX_0_100', regions };
}

/** `null` means the response shape is not the confirmed one: the caller marks the call FAILED and keeps the raw capture. */
export function parseTrends(dataType: TrendsDataType, data: unknown): TrendsFacts | null {
  if (!isRecord(data)) return null;
  switch (dataType) {
    case 'TIMESERIES': return parseTimeseries(data);
    case 'RELATED_QUERIES': return parseRelatedQueries(data);
    case 'GEO_MAP_0': return parseGeoMap(data);
  }
}

/**
 * One bounded transport attempt. No key: no call. Aborted: no call. Any failure keeps exactly one
 * raw capture and is never retried. `api_key` is written to the URL only and never recorded.
 */
export async function fetchTrends(
  apiKey: string | null,
  transport: ProviderTransport,
  req: TrendsRequest,
  options: ProviderCallOptions,
): Promise<TrendsCallResult> {
  if (!apiKey) return { status: 'NOT_CONFIGURED', facts: null, captures: [] };
  if (options.signal?.aborted) return { status: 'CANCELLED', facts: null, captures: [] };

  const params: Record<string, string> = {
    engine: 'google_trends',
    q: req.keywords.join(','),
    data_type: req.dataType,
    geo: SEARCH_TRENDS_LIMITS.geo,
    hl: SEARCH_TRENDS_LIMITS.hl,
    date: SEARCH_TRENDS_LIMITS.date,
  };
  const endpoint = SERPAPI_LIMITS.origin + SERPAPI_LIMITS.endpointPath;
  const url = new URL(endpoint);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set('api_key', apiKey);

  const log = new CaptureLog('SERPAPI', transport, options.onProgress, 1);
  const context: CaptureContext = {
    // ProviderOperation has no google_trends member yet and this WP owns no provider types,
    // so the call is recorded as a generic exchange. The engine is carried in requestParameters.
    operation: 'none',
    billing: 'PAID_SEARCH_UNLESS_CACHED',
    method: 'GET',
    endpoint,
    requestParameters: params,
    requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null,
  };
  const requestedAt = log.timestamp();
  const response = await boundedRequest(transport, {
    url, method: 'GET', headers: { Accept: 'application/json' }, body: null,
    timeoutMs: SERPAPI_LIMITS.requestTimeoutMs, maxBytes: SERPAPI_LIMITS.maxResponseBytes, signal: options.signal,
  });

  let capture: ProviderRawCapture;
  let facts: TrendsFacts | null = null;
  if (response.kind === 'RECEIVED') {
    const value = parseJson(response.bytes);
    const providerCode = isRecord(value)
      ? safeProviderCode(value.error_code ?? (isRecord(value.search_metadata) ? value.search_metadata.id : undefined))
      : null;
    if (bytesContainSecret(response.bytes, apiKey)) {
      capture = log.record(context, requestedAt, 'CREDENTIAL_ECHO_REFUSED', response.status, null, null);
    } else if (response.status < 200 || response.status > 299) {
      capture = log.record(context, requestedAt, 'HTTP_ERROR', response.status, response.bytes, providerCode);
    } else {
      const parsed = parseTrends(req.dataType, value);
      if (!parsed) {
        capture = log.record(context, requestedAt, 'INVALID_PAYLOAD', response.status, response.bytes, providerCode);
      } else {
        capture = log.record(context, requestedAt, 'OK', response.status, response.bytes, providerCode);
        facts = parsed;
      }
    }
  } else if (response.kind === 'OVERSIZE') {
    capture = log.record(context, requestedAt, 'OVERSIZE', response.status, null, null);
  } else {
    const outcome = response.kind === 'TIMEOUT' ? 'TIMEOUT_AMBIGUOUS'
      : response.kind === 'ABORTED' ? 'ABORTED_AMBIGUOUS' : 'TRANSPORT_AMBIGUOUS';
    capture = log.record(context, requestedAt, outcome, null, null, null);
  }

  const status: TrendsCallStatus = options.signal?.aborted ? 'CANCELLED' : facts ? 'OK' : 'FAILED';
  return { status, facts, captures: log.captures };
}
