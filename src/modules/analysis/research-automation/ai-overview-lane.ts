// AI Overview follow-up (S29) of the web searches (S19). Off unless the flag is exactly "1".
//
// A web-search answer may carry its AI Overview only as a page token (no text blocks). The token expires within minutes, so
// right after the plain and extra web searches, each such token is fetched once with the existing search key: at most two
// paid calls per run, never retried. An overview already inline in a web-search answer needs no call (it is stored inside
// that answer). Only a valid answer is kept, as the exact response bytes; a failed call keeps nothing. Every overview row is
// a hypothesis (weak), never evidence. Reports do not read this source yet.
import { boundedRequest, bytesContainSecret, CaptureLog, defaultProviderTransport, isAmbiguous, isRecord, parseJson, safeCaptureHeaders, safeProviderCode, type ProviderTransport } from './provider-common.js';
import { SearchCallBudget } from './expanded-search-queries.js';
import type { CaptureOutcome, ProviderCallOptions, ProviderRawCapture } from './providers.js';
import { SERPAPI_LIMITS } from './provider-serpapi.js';

export const AI_OVERVIEW_FLAG = 'TDN_RESEARCH_AI_OVERVIEW_ENABLED';
export const AI_OVERVIEW_PROVIDER = 'SERPAPI' as const;
export const AI_OVERVIEW_OPERATION = 'serpapi.google_ai_overview' as const;
/** Usage ordinal inside the collection step; 22 is the search-suggestion lane. */
export const AI_OVERVIEW_USAGE_ORDINAL = 23;
/** Paid follow-up calls per run. */
export const AI_OVERVIEW_MAX_CALLS = 2;

export function aiOverviewEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[AI_OVERVIEW_FLAG] === '1';
}

export interface AiOverviewCollection {
  /** Valid answers in call order; each response is stored as its exact bytes. */
  readonly captures: readonly ProviderRawCapture[];
  /** Every call issued (paid, including a failed or ambiguous one), for the usage row. */
  readonly calls: readonly ProviderRawCapture[];
}
export interface AiOverviewSource {
  /** `searches` are this run's web-search captures, in call order. */
  collect(input: { readonly searches: readonly ProviderRawCapture[] }, options?: ProviderCallOptions): Promise<AiOverviewCollection>;
}

/** The page tokens of web-search answers whose AI Overview has no text blocks, distinct, in call order. */
export function aiOverviewPageTokens(searches: readonly ProviderRawCapture[]): string[] {
  const tokens: string[] = [];
  for (const capture of searches) {
    if (capture.provider !== 'SERPAPI' || capture.operation !== 'serpapi.google.search' || capture.outcome !== 'OK' || !capture.responseBytes) continue;
    const value = parseJson(capture.responseBytes);
    const overview = isRecord(value) ? value.ai_overview : undefined;
    if (!isRecord(overview) || (Array.isArray(overview.text_blocks) && overview.text_blocks.length > 0)) continue;
    const token = overview.page_token;
    if (typeof token === 'string' && token.length > 0 && token.length <= 8_192 && !tokens.includes(token)) tokens.push(token);
  }
  return tokens;
}

/** apiKey is the existing search key; it is placed only on the request URL and never stored. */
export function createAiOverviewSource(apiKey: string, transport: ProviderTransport = defaultProviderTransport): AiOverviewSource {
  return {
    async collect(input, options = {}) {
      const signal = options.signal;
      const tokens = aiOverviewPageTokens(input.searches);
      const log = new CaptureLog(AI_OVERVIEW_PROVIDER, transport, options.onProgress, Math.min(tokens.length, AI_OVERVIEW_MAX_CALLS));
      const captures: ProviderRawCapture[] = [];
      // One budget per run: the ceiling holds even if more tokens were found.
      const budget = new SearchCallBudget({ trends: 0, search: AI_OVERVIEW_MAX_CALLS });
      for (const token of tokens) {
        if (signal?.aborted || !budget.take('search')) break;
        const params = { engine: 'google_ai_overview', page_token: token } as const;
        const url = new URL(SERPAPI_LIMITS.origin + SERPAPI_LIMITS.endpointPath);
        for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
        url.searchParams.set('api_key', apiKey);
        const context = { operation: AI_OVERVIEW_OPERATION, billing: 'PAID_SEARCH_UNLESS_CACHED' as const, method: 'GET' as const,
          endpoint: SERPAPI_LIMITS.origin + SERPAPI_LIMITS.endpointPath, requestParameters: { engine: params.engine }, requestBodyBytes: null,
          queryWindow: null, pageNumber: null, productRef: null };
        const requestedAt = log.timestamp();
        let response: Awaited<ReturnType<typeof boundedRequest>>;
        try {
          response = await boundedRequest(transport, { url, method: 'GET', headers: { Accept: 'application/json' }, body: null,
            timeoutMs: SERPAPI_LIMITS.requestTimeoutMs, maxBytes: SERPAPI_LIMITS.maxResponseBytes, signal });
        } catch { response = { kind: 'TRANSPORT' }; }
        if (response.kind !== 'RECEIVED') {
          const outcome: CaptureOutcome = response.kind === 'OVERSIZE' ? 'OVERSIZE' : response.kind === 'TIMEOUT' ? 'TIMEOUT_AMBIGUOUS'
            : response.kind === 'ABORTED' ? 'ABORTED_AMBIGUOUS' : 'TRANSPORT_AMBIGUOUS';
          log.record(context, requestedAt, outcome, response.kind === 'OVERSIZE' ? response.status : null, null, null);
          if (signal?.aborted) break;
          continue;
        }
        const headers = safeCaptureHeaders(response.headers, apiKey);
        if (bytesContainSecret(response.bytes, apiKey)) { log.record(context, requestedAt, 'CREDENTIAL_ECHO_REFUSED', response.status, null, null, headers); continue; }
        const value = parseJson(response.bytes);
        const providerCode = isRecord(value) ? safeProviderCode(value.error_code ?? (isRecord(value.search_metadata) ? value.search_metadata.id : undefined)) : null;
        if (response.status !== 200) { log.record(context, requestedAt, 'HTTP_ERROR', response.status, null, providerCode, headers); continue; }
        if (isRecord(value) && (value.error != null || (isRecord(value.search_metadata) && value.search_metadata.status === 'Error'))) {
          log.record(context, requestedAt, 'PROVIDER_REJECTED', 200, null, providerCode, headers); continue;
        }
        // The answer must name the token it was asked for: the loader matches it back to the web search by this field.
        if (!isRecord(value) || !isRecord(value.ai_overview) || !isRecord(value.search_parameters) || value.search_parameters.page_token !== token) {
          log.record(context, requestedAt, 'INVALID_PAYLOAD', 200, null, providerCode, headers); continue;
        }
        captures.push(log.record(context, requestedAt, 'OK', 200, response.bytes, providerCode, headers));
      }
      return { captures, calls: log.captures };
    },
  };
}

/** Paid calls with an unknown credit receipt, like the other search calls; an ambiguous call has an unknown outcome. */
export function aiOverviewUsage(collection: AiOverviewCollection): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'UNKNOWN' } };
} {
  const ambiguous = collection.calls.filter(call => isAmbiguous(call.outcome)).length;
  return { provider: AI_OVERVIEW_PROVIDER, usage: { requestsIssued: collection.calls.length, paidRequestsIssued: collection.calls.length, ambiguousPaidRequests: ambiguous,
    credits: { status: 'UNKNOWN' } } };
}
