// SerpApi adapter for bounded current web discovery.
//
// SerpApi's documented Google organic-results endpoint is a search snapshot,
// not a period-sales source. This adapter therefore only exposes
// WEB_DISCOVERY_CURRENT and never turns result counts into market metrics.
import {
  CaptureLog, RateLimiter, boundedRequest, boundedText,
  bytesContainSecret, emptyUsage, httpsUrl, isAmbiguous, isRecord, parseJson,
  safeProviderCode, validateCountry, validateKeyword, validatePeriod,
  type CaptureContext, type ProviderTransport,
} from './provider-common.js';
import {
  RESEARCH_AUTOMATION_PROVIDER_CONTRACT,
  type CollectInput, type CollectResult, type DateWindow, type ProviderCallOptions,
  type ProviderCapabilityReport, type ProviderCoverage, type ProviderRawCapture,
  type QuickSearchInput, type QuickSearchResult, type ResearchAutomationProvider,
  type WebDiscoveryResult,
} from './providers.js';

export const SERPAPI_LIMITS = Object.freeze({
  origin: 'https://serpapi.com',
  endpointPath: '/search.json',
  requestTimeoutMs: 30_000,
  maxResponseBytes: 8 * 1024 * 1024,
  requestsPerSecond: 5,
  maxResults: 10,
});

const LIMITATIONS = [
  'CURRENT_WEB_SNAPSHOT_NOT_PERIOD_EVIDENCE',
  'NO_MARKET_TOTALS_OR_ANNUAL_SALES_INFERRED',
  'ORGANIC_RESULTS_ONLY',
  'RESULT_URLS_ARE_PROVIDER_REPORTED',
] as const;

type SearchPayload = { readonly results: readonly WebDiscoveryResult[]; readonly invalidRows: number };

function unsupportedCoverage(operation: ProviderCoverage['operation'], requestedPeriod: DateWindow | null): ProviderCoverage {
  return {
    provider: 'SERPAPI', operation, status: 'UNSUPPORTED', semantics: operation === 'WEB_DISCOVERY_CURRENT' ? 'CURRENT_WEB_SNAPSHOT' : 'NONE',
    requestedPeriod, queryWindows: [], truncated: false,
    continuation: { required: false, remainingWindows: [], remainingProductRefs: [] }, limitations: [...LIMITATIONS],
  };
}

function searchCoverage(requestedPeriod: DateWindow, status: ProviderCoverage['status'],
  query: { status: 'OK' | 'EMPTY' | 'FAILED' | 'AMBIGUOUS_NO_RETRY' | 'NOT_RUN_CANCELLED'; captureIds: readonly string[]; rows: number | null; truncated: boolean }): ProviderCoverage {
  return {
    provider: 'SERPAPI', operation: 'WEB_DISCOVERY_CURRENT', status, semantics: 'CURRENT_WEB_SNAPSHOT',
    requestedPeriod,
    queryWindows: [{ window: null, productRef: null, status: query.status, captureIds: query.captureIds, rows: query.rows, truncated: query.truncated }],
    truncated: query.truncated,
    continuation: { required: false, remainingWindows: [], remainingProductRefs: [] }, limitations: [...LIMITATIONS],
  };
}

function parseResults(data: unknown, retrievedAt: string, captureId: string): SearchPayload | undefined {
  if (!isRecord(data) || !Array.isArray(data.organic_results)) return undefined;
  const results: WebDiscoveryResult[] = [];
  let invalidRows = 0;
  for (const [index, row] of data.organic_results.entries()) {
    if (!isRecord(row)) { invalidRows++; continue; }
    const position = typeof row.position === 'number' && Number.isSafeInteger(row.position) && row.position > 0
      ? row.position : index + 1;
    const title = boundedText(row.title, 500);
    const url = httpsUrl(row.link, 2048);
    if (!title || !url) { invalidRows++; continue; }
    results.push({
      captureId, position, title, url,
      displayedLink: boundedText(row.displayed_link, 500),
      snippet: boundedText(row.snippet, 2_000),
      source: boundedText(row.source, 300), retrievedAt,
      semantics: 'CURRENT_WEB_SNAPSHOT_NOT_PERIOD_EVIDENCE',
    });
  }
  return { results, invalidRows };
}

export function createSerpApiProvider(apiKey: string | null, transport: ProviderTransport): ResearchAutomationProvider {
  const limiter = new RateLimiter(SERPAPI_LIMITS.requestsPerSecond, 1_000);
  const report: ProviderCapabilityReport = {
    provider: 'SERPAPI', displayName: 'SerpApi (Google organic search)', credentialEnv: 'TDN_SERPAPI_API_KEY',
    configured: apiKey !== null,
    operations: {
      QUICK_SEARCH_PRODUCT_CARDS: { status: 'UNSUPPORTED', reason: 'SerpApi web results do not provide verified product cards with provider identity.' },
      PRODUCT_PERIOD_DETAIL: { status: 'UNSUPPORTED', reason: 'SerpApi web snapshots are not product-period sales detail.' },
      WEB_DISCOVERY_CURRENT: apiKey
        ? { status: 'AVAILABLE', reason: 'Configured SerpApi Google organic-results request for a labelled current web snapshot.' }
        : { status: 'NOT_CONFIGURED', reason: 'TDN_SERPAPI_API_KEY is not set on the server.' },
      METRIC_MARKET_EXPORT: { status: 'UNSUPPORTED', reason: 'Not a Metric source.' },
      SHOPEE_PRODUCT_DETAIL: { status: 'UNSUPPORTED', reason: 'Google organic results are not a verified Shopee product-detail connector.' },
    },
    verification: apiKey ? 'OFFICIAL_DOCS_AND_SYNTHETIC_CONTRACT_TESTS' : 'NONE',
    limitations: [...LIMITATIONS],
  };

  async function search(input: CollectInput, options: ProviderCallOptions): Promise<CollectResult> {
    const requestedPeriod = validatePeriod(input.requestedPeriod);
    const keyword = validateKeyword(input.keyword);
    validateCountry(input.country);
    const base = {
      contractVersion: RESEARCH_AUTOMATION_PROVIDER_CONTRACT, provider: 'SERPAPI' as const,
      requestedPeriod, productObservations: [], productPeriodSummaries: [],
      webResults: [] as readonly WebDiscoveryResult[], limitations: [...LIMITATIONS],
    };
    if (!apiKey) {
      return { ...base, status: 'NOT_CONFIGURED', coverage: [{
        provider: 'SERPAPI', operation: 'WEB_DISCOVERY_CURRENT', status: 'NOT_CONFIGURED', semantics: 'CURRENT_WEB_SNAPSHOT',
        requestedPeriod, queryWindows: [], truncated: false,
        continuation: { required: false, remainingWindows: [], remainingProductRefs: [] }, limitations: [...LIMITATIONS],
      }], usage: emptyUsage('SERPAPI'), captures: [] };
    }

    const log = new CaptureLog('SERPAPI', transport, options.onProgress, 1);
    if (options.signal?.aborted) {
      const coverage = searchCoverage(requestedPeriod, 'CANCELLED', { status: 'NOT_RUN_CANCELLED', captureIds: [], rows: null, truncated: false });
      return { ...base, status: 'CANCELLED', coverage: [coverage], usage: emptyUsage('SERPAPI'), captures: [] };
    }
    if (!await limiter.acquire(transport, options.signal)) {
      const coverage = searchCoverage(requestedPeriod, 'CANCELLED', { status: 'NOT_RUN_CANCELLED', captureIds: [], rows: null, truncated: false });
      return { ...base, status: 'CANCELLED', coverage: [coverage], usage: emptyUsage('SERPAPI'), captures: [] };
    }

    const params = { engine: 'google', q: keyword, gl: 'vn', hl: 'vi', num: SERPAPI_LIMITS.maxResults } as const;
    const url = new URL(SERPAPI_LIMITS.origin + SERPAPI_LIMITS.endpointPath);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    url.searchParams.set('api_key', apiKey);
    const context: CaptureContext = {
      operation: 'serpapi.google.search', billing: 'PAID_SEARCH_UNLESS_CACHED', method: 'GET',
      endpoint: SERPAPI_LIMITS.origin + SERPAPI_LIMITS.endpointPath,
      requestParameters: params, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null,
    };
    const requestedAt = log.timestamp();
    const response = await boundedRequest(transport, {
      url, method: 'GET', headers: { Accept: 'application/json' }, body: null,
      timeoutMs: SERPAPI_LIMITS.requestTimeoutMs, maxBytes: SERPAPI_LIMITS.maxResponseBytes, signal: options.signal,
    });
    let capture: ProviderRawCapture;
    let payload: SearchPayload | null = null;
    if (response.kind === 'RECEIVED') {
      if (bytesContainSecret(response.bytes, apiKey)) {
        capture = log.record(context, requestedAt, 'CREDENTIAL_ECHO_REFUSED', response.status, null, null);
      } else {
        const value = parseJson(response.bytes);
        const parsed = response.status >= 200 && response.status <= 299
          ? parseResults(value, log.timestamp(), 'pending') : undefined;
        const providerCode = isRecord(value)
          ? safeProviderCode(value.error_code ?? (isRecord(value.search_metadata) ? value.search_metadata.id : undefined))
          : null;
        if (response.status < 200 || response.status > 299) {
          capture = log.record(context, requestedAt, 'HTTP_ERROR', response.status, response.bytes, providerCode);
        } else if (!parsed || (parsed.invalidRows > 0 && parsed.results.length === 0 && isRecord(value)
          && Array.isArray(value.organic_results) && value.organic_results.length > 0)) {
          capture = log.record(context, requestedAt, 'INVALID_PAYLOAD', response.status, response.bytes, providerCode);
        } else {
          capture = log.record(context, requestedAt, 'OK', response.status, response.bytes, providerCode);
          payload = parseResults(value, capture.completedAt, capture.captureId) ?? null;
        }
      }
    } else if (response.kind === 'OVERSIZE') {
      capture = log.record(context, requestedAt, 'OVERSIZE', response.status, null, null);
    } else {
      const outcome = response.kind === 'TIMEOUT' ? 'TIMEOUT_AMBIGUOUS'
        : response.kind === 'ABORTED' ? 'ABORTED_AMBIGUOUS' : 'TRANSPORT_AMBIGUOUS';
      capture = log.record(context, requestedAt, outcome, null, null, null);
    }

    const queryStatus: 'OK' | 'EMPTY' | 'FAILED' | 'AMBIGUOUS_NO_RETRY' | 'NOT_RUN_CANCELLED' =
      capture.outcome === 'OK' ? (payload?.results.length ? 'OK' : 'EMPTY')
        : isAmbiguous(capture.outcome) ? 'AMBIGUOUS_NO_RETRY'
          : 'FAILED';
    const truncated = (payload?.results.length ?? 0) >= SERPAPI_LIMITS.maxResults;
    const coverageStatus: ProviderCoverage['status'] = options.signal?.aborted ? 'CANCELLED'
      : queryStatus === 'OK' || queryStatus === 'EMPTY' ? 'QUERIES_COMPLETE' : 'FAILED';
    const coverage = searchCoverage(requestedPeriod, coverageStatus, {
      status: queryStatus, captureIds: [capture.captureId], rows: payload?.results.length ?? null, truncated,
    });
    const status = options.signal?.aborted ? 'CANCELLED'
      : coverageStatus === 'QUERIES_COMPLETE' ? 'SUCCEEDED' : isAmbiguous(capture.outcome) ? 'PARTIAL' : 'FAILED';
    return { ...base, status, webResults: payload?.results ?? [], coverage: [coverage], usage: log.usage({
      status: 'UNKNOWN', unit: 'SERPAPI_SEARCH_CREDITS', reason: 'SerpApi does not expose an observed per-request credit receipt in this response.'
    }), captures: log.captures };
  }

  return {
    id: 'SERPAPI', capability: () => report,
    async quickSearch(input: QuickSearchInput): Promise<QuickSearchResult> {
      validateKeyword(input.keyword); validateCountry(input.country); validatePeriod(input.requestedPeriod);
      // The provider is intentionally not presented as a product-card source.
      return {
        contractVersion: RESEARCH_AUTOMATION_PROVIDER_CONTRACT, provider: 'SERPAPI', status: 'UNSUPPORTED',
        searchWindow: null, cards: [], candidatePool: { rowsReturned: 0, validDistinctProducts: 0, duplicateRowsCollapsed: 0, invalidRows: 0 },
        coverage: [unsupportedCoverage('QUICK_SEARCH_PRODUCT_CARDS', input.requestedPeriod)], usage: emptyUsage('SERPAPI'), captures: [], limitations: [...LIMITATIONS],
      };
    },
    async collect(input: CollectInput, options: ProviderCallOptions = {}): Promise<CollectResult> {
      return search(input, options);
    },
  };
}
