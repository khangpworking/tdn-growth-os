// Search-suggestion lane (S19b) for runs that include Insight. Off unless the flag is exactly "1".
//
// For the run's keyword 1 and keyword 2, ask the free public search-suggestion endpoint for the base term and for the base
// term followed by each Vietnamese letter: at most 24 calls per base and 48 per run, at least 1 s apart, 10 s each, never
// retried. A 429/403 answer, a body that is not JSON or three failures in a row stop the lane (what was saved stays).
// Only a valid answer is kept, as the exact response bytes; a failed call keeps nothing. Suggestions are search intent only:
// no volume and never a count. Reports do not read this source yet.
import { boundedRequest, CaptureLog, defaultProviderTransport, parseJson, safeCaptureHeaders, type ProviderTransport } from './provider-common.js';
import type { ProviderCallOptions, ProviderRawCapture } from './providers.js';

export const SEARCH_SUGGEST_FLAG = 'TDN_RESEARCH_SEARCH_SUGGEST_ENABLED';
export const SEARCH_SUGGEST_PROVIDER = 'GOOGLE-SUGGEST' as const;
export const SEARCH_SUGGEST_OPERATION = 'google.suggest' as const;
/** Usage ordinal inside the collection step; 0–21 are taken by the other collection lanes. */
export const SEARCH_SUGGEST_USAGE_ORDINAL = 22;
export const SEARCH_SUGGEST_ORIGIN = 'https://suggestqueries.google.com';
export const SEARCH_SUGGEST_PATH = '/complete/search';
/** The letters after the base term, in this order (Vietnamese alphabet without f, j, w, z and without diacritic vowels). */
export const SEARCH_SUGGEST_LETTERS = Object.freeze(['a', 'b', 'c', 'd', 'đ', 'e', 'g', 'h', 'i', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'x', 'y']);
export const SEARCH_SUGGEST_MAX_BASES = 2;
export const SEARCH_SUGGEST_MAX_CALLS_PER_BASE = 1 + SEARCH_SUGGEST_LETTERS.length;
export const SEARCH_SUGGEST_MAX_CALLS = SEARCH_SUGGEST_MAX_BASES * SEARCH_SUGGEST_MAX_CALLS_PER_BASE;
export const SEARCH_SUGGEST_SPACING_MS = 1_000;
export const SEARCH_SUGGEST_TIMEOUT_MS = 10_000;
export const SEARCH_SUGGEST_MAX_BYTES = 256 * 1024;
export const SEARCH_SUGGEST_MAX_FAILURES_IN_A_ROW = 3;

export function searchSuggestEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[SEARCH_SUGGEST_FLAG] === '1';
}

/** Why the lane stopped before its last prefix; null when every planned prefix was asked. */
export type SearchSuggestStop = 'BLOCKED' | 'NOT_JSON' | 'FAILURES_IN_A_ROW' | 'CANCELLED';
export interface SearchSuggestCollection {
  /** Valid answers in call order; each response is stored as its exact bytes. */
  readonly captures: readonly ProviderRawCapture[];
  /** Calls issued (free), including failed ones. */
  readonly requests: number;
  readonly stop: SearchSuggestStop | null;
}
export interface SearchSuggestSource {
  collect(input: { readonly keywords: readonly string[] }, options?: ProviderCallOptions): Promise<SearchSuggestCollection>;
}

/** Base terms: keyword 1 then keyword 2 when present, trimmed, distinct, at most two. */
export function searchSuggestBases(keywords: readonly string[]): string[] {
  const out: string[] = [];
  for (const value of keywords) {
    const base = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
    if (base && !out.includes(base)) out.push(base);
    if (out.length === SEARCH_SUGGEST_MAX_BASES) break;
  }
  return out;
}

/** The prefixes of one base, in call order: the base itself, then the base, a space and each letter. */
export function searchSuggestPrefixes(base: string): string[] {
  return [base, ...SEARCH_SUGGEST_LETTERS.map(letter => `${base} ${letter}`)];
}

/** A valid answer is a JSON array whose first item is the asked prefix and whose second item is a list of texts. */
function validAnswer(value: unknown, prefix: string): boolean {
  return Array.isArray(value) && value[0] === prefix && Array.isArray(value[1]) && value[1].every(item => typeof item === 'string');
}

export function createSearchSuggestSource(transport: ProviderTransport = defaultProviderTransport): SearchSuggestSource {
  return {
    async collect(input, options = {}) {
      const signal = options.signal;
      const prefixes = searchSuggestBases(input.keywords).flatMap(searchSuggestPrefixes).slice(0, SEARCH_SUGGEST_MAX_CALLS);
      const log = new CaptureLog(SEARCH_SUGGEST_PROVIDER, transport, options.onProgress, prefixes.length);
      const captures: ProviderRawCapture[] = [];
      let requests = 0, failuresInARow = 0, lastEnd: number | null = null;
      const finish = (stop: SearchSuggestStop | null): SearchSuggestCollection => ({ captures, requests, stop });
      for (const prefix of prefixes) {
        if (signal?.aborted) return finish('CANCELLED');
        const wait = lastEnd === null ? 0 : lastEnd + SEARCH_SUGGEST_SPACING_MS - transport.now();
        if (wait > 0) {
          try { await transport.sleep(wait, signal); } catch { return finish('CANCELLED'); }
          if (signal?.aborted) return finish('CANCELLED');
        }
        const params = { client: 'firefox', hl: 'vi', gl: 'vn', q: prefix } as const;
        const url = new URL(SEARCH_SUGGEST_ORIGIN + SEARCH_SUGGEST_PATH);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        const context = { operation: SEARCH_SUGGEST_OPERATION, billing: 'FREE_ACCOUNT_QUERY' as const, method: 'GET' as const,
          endpoint: SEARCH_SUGGEST_ORIGIN + SEARCH_SUGGEST_PATH, requestParameters: params, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null };
        requests++;
        const requestedAt = log.timestamp();
        let response: Awaited<ReturnType<typeof boundedRequest>>;
        try {
          response = await boundedRequest(transport, { url, method: 'GET', headers: { Accept: 'application/json' }, body: null,
            timeoutMs: SEARCH_SUGGEST_TIMEOUT_MS, maxBytes: SEARCH_SUGGEST_MAX_BYTES, signal });
        } catch { response = { kind: 'TRANSPORT' }; }
        lastEnd = transport.now();
        if (response.kind === 'ABORTED' || signal?.aborted) return finish('CANCELLED');
        if ((response.kind === 'RECEIVED' || response.kind === 'OVERSIZE') && (response.status === 429 || response.status === 403)) return finish('BLOCKED');
        if (response.kind === 'RECEIVED') {
          const value = parseJson(response.bytes);
          if (value === undefined) return finish('NOT_JSON');
          if (response.status === 200 && validAnswer(value, prefix)) {
            captures.push(log.record(context, requestedAt, 'OK', 200, response.bytes, null, safeCaptureHeaders(response.headers)));
            failuresInARow = 0;
            continue;
          }
        }
        if (++failuresInARow >= SEARCH_SUGGEST_MAX_FAILURES_IN_A_ROW) return finish('FAILURES_IN_A_ROW');
      }
      return finish(null);
    },
  };
}

/** Free calls: a known zero cost whenever at least one call was issued. */
export function searchSuggestUsage(collection: Pick<SearchSuggestCollection, 'requests'>): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'NONE_USED' } };
} {
  return { provider: SEARCH_SUGGEST_PROVIDER, usage: { requestsIssued: collection.requests, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } } };
}
