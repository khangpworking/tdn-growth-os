// Expanded web-search query builder and per-run call budget (offline, not wired into a run yet).
//
// The builder only ever recombines words the owner already confirmed as products or brands with a
// fixed set of template words. It never invents a name, model or competitor, and it never emits a
// query it was not handed. The budget is the only thing that limits how many paid calls a run makes.
import { SEARCH_TRENDS_LIMITS } from './search-trends.js';
import { ProviderInputError, validatePeriod } from './provider-common.js';
import type { DateWindow } from './providers.js';

export const EXPANDED_SEARCH_MAX_QUERIES = 10;

const NAME_MAX_CHARS = 80;

/** Trim, collapse spaces, drop empty or over-long names, and dedupe case-insensitively keeping input order. */
function normalizeNames(values: readonly string[]): string[] {
  const names: string[] = [];
  const seen = new Set<string>();
  for (const raw of values) {
    const name = raw.normalize('NFC').trim().replace(/\s+/g, ' ');
    if (name.length < 1 || name.length > NAME_MAX_CHARS) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    names.push(name);
  }
  return names;
}

/**
 * Fill in order: every product template first, then brand templates, then adjacent product pairs.
 * Dedupe case-insensitively and cap at EXPANDED_SEARCH_MAX_QUERIES.
 */
export function buildExpandedQueries(input: {
  confirmedProducts: readonly string[];
  confirmedBrands: readonly string[];
}): readonly string[] {
  const products = normalizeNames(input.confirmedProducts);
  const brands = normalizeNames(input.confirmedBrands);
  const queries: string[] = [];
  for (const product of products) queries.push(`${product} review`, `${product} có tốt không`, `${product} lỗi`);
  for (const brand of brands) queries.push(`${brand} review`);
  for (let index = 0; index + 1 < products.length; index += 1) {
    queries.push(`${products[index]!} hay ${products[index + 1]!}`);
  }
  const expanded: string[] = [];
  const seen = new Set<string>();
  for (const query of queries) {
    const key = query.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    expanded.push(query);
    if (expanded.length === EXPANDED_SEARCH_MAX_QUERIES) break;
  }
  return expanded;
}

/** Stable, secret-free cache identity: same query and retrieval day give the same key. */
export function expandedSearchCacheKey(q: string, retrievedDate: string): string {
  return `expanded_search|${JSON.stringify(q)}|${retrievedDate}`;
}

/** Internal explicit sidepath input, not a public API or persisted contract. */
export interface ExpandedSearchRequest {
  readonly version: 'expanded-search-request-v1';
  readonly confirmedProducts: readonly string[];
  readonly confirmedBrands: readonly string[];
  readonly requestedWindow: DateWindow | null;
  readonly siteDomain: string | null;
}

export interface ExpandedSearchQuery {
  readonly query: string;
  readonly requestedWindow: DateWindow | null;
  readonly siteDomain: string | null;
  readonly parameters: Readonly<{ engine: 'google'; q: string; gl: 'vn'; hl: 'vi'; num: 10; tbs?: string }>;
}

function confirmedWords(values: readonly string[]): string[] {
  if (!Array.isArray(values) || values.length > 100) throw new ProviderInputError('Confirmed names must be a bounded list');
  for (const value of values) {
    // Names are data, never Google operators, URLs, wildcards, or exclusions.
    if (typeof value !== 'string' || value.length > NAME_MAX_CHARS || /[\r\n\t]/u.test(value)
      || !/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .&'’\-]*$/u.test(value)
      || /\b(?:OR|AND|NOT)\b/u.test(value) || /\s-/u.test(value)) {
      throw new ProviderInputError('Confirmed names must contain plain product or brand words');
    }
  }
  return normalizeNames(values);
}

/** Fail closed before transport; a window/domain is supplied explicitly, never inferred. */
export function planExpandedSearch(request: ExpandedSearchRequest): readonly ExpandedSearchQuery[] {
  if (!request || request.version !== 'expanded-search-request-v1') throw new ProviderInputError('Unsupported expanded-search request');
  const confirmedProducts = confirmedWords(request.confirmedProducts);
  const confirmedBrands = confirmedWords(request.confirmedBrands);
  const requestedWindow = request.requestedWindow === null ? null : validatePeriod(request.requestedWindow);
  let siteDomain: string | null = null;
  if (request.siteDomain !== null) {
    if (typeof request.siteDomain !== 'string' || request.siteDomain.length > 253 || /[^a-z0-9.-]/i.test(request.siteDomain)
      || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(request.siteDomain)) {
      throw new ProviderInputError('Site must be one plain DNS domain');
    }
    siteDomain = request.siteDomain.toLowerCase();
  }
  const googleDate = (date: string): string => `${date.slice(5, 7)}/${date.slice(8, 10)}/${date.slice(0, 4)}`;
  return buildExpandedQueries({ confirmedProducts, confirmedBrands }).map(query => ({
    query, requestedWindow, siteDomain,
    parameters: {
      engine: 'google', q: siteDomain ? `${query} site:${siteDomain}` : query, gl: 'vn', hl: 'vi', num: 10,
      ...(requestedWindow ? { tbs: `cdr:1,cd_min:${googleDate(requestedWindow.startDate)},cd_max:${googleDate(requestedWindow.endDate)}` } : {}),
    },
  }));
}

/** Exact wire identity, without api_key; retrieval day is distinct from the requested window. */
export function expandedSearchRequestCacheKey(query: ExpandedSearchQuery, retrievedDate: string): string {
  validatePeriod({ startDate: retrievedDate, endDate: retrievedDate });
  return `expanded_search_v1|${JSON.stringify({
    parameters: Object.entries(query.parameters).sort(([a], [b]) => a.localeCompare(b)),
    requestedWindow: query.requestedWindow, siteDomain: query.siteDomain, retrievedDate,
  })}`;
}

export interface SearchCallLimits { readonly trends: number; readonly search: number }

const DEFAULT_SEARCH_CALL_LIMITS: SearchCallLimits = Object.freeze({
  trends: SEARCH_TRENDS_LIMITS.maxCallsPerRun,
  search: EXPANDED_SEARCH_MAX_QUERIES,
});

/**
 * Per-run ceiling for paid provider calls. Once a kind is exhausted `take` returns false and the
 * caller skips the call: nothing is queued, deferred or retried.
 */
export class SearchCallBudget {
  readonly #remaining: { trends: number; search: number };

  constructor(limits: SearchCallLimits = DEFAULT_SEARCH_CALL_LIMITS) {
    this.#remaining = { trends: limits.trends, search: limits.search };
  }

  take(kind: 'trends' | 'search'): boolean {
    if (this.#remaining[kind] <= 0) return false;
    this.#remaining[kind] -= 1;
    return true;
  }
}
