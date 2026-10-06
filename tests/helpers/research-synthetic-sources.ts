import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { bindResearchAutomationProvider, type AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';

export const SYNTHETIC_CARD_ID = 'kalodata:12345';
export const SYNTHETIC_SERP_KEY = 'synthetic-serp-key-not-live';

/** A product source with one quick-search card and one successful period collection; no network. */
export function syntheticProductSource(): AutomationSourcePort {
  const capture = {
    captureId: 'kalodata-0001', provider: 'KALODATA', operation: 'kalodata.product.rank', billing: 'FREE_ACCOUNT_QUERY', method: 'POST',
    endpoint: 'https://www.kalodata.com/openapi/product/rank', requestParameters: { keyword: 'synthetic' }, requestBodyBytes: Buffer.from('{"keyword":"synthetic"}'),
    queryWindow: { startDate: '2026-09-01', endDate: '2026-09-30' }, pageNumber: 1, productRef: SYNTHETIC_CARD_ID, requestedAt: '2026-10-02T00:00:00.000Z', completedAt: '2026-10-02T00:00:01.000Z',
    outcome: 'OK', httpStatus: 200, responseBytes: Buffer.from('{"data":[]}'), responseSha256: 'a'.repeat(64), responseByteLength: 13, providerCode: null,
  } as const;
  const card = {
    productId: SYNTHETIC_CARD_ID, provider: 'kalodata', sourceProductId: '12345', role: 'PRINCIPAL', title: 'Synthetic product', sourceUrl: 'https://www.kalodata.com/products/12345', imageUrl: null,
    description: null, descriptionState: 'EMPTY', observedWindow: { startDate: '2026-09-01', endDate: '2026-09-30', label: 'QUICK_SEARCH_RECENT_WINDOW' }, retrievedAt: capture.completedAt,
  } as const;
  const usage = { provider: 'KALODATA', requestsIssued: 1, paidRequestsIssued: 0, ambiguousPaidRequests: 0, automaticRetries: 0, credits: { status: 'NONE_USED' }, monetaryCharge: { status: 'UNKNOWN', reason: 'synthetic' } };
  return {
    id: 'KALODATA',
    async quickSearch(input) {
      const step: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: input.runId, stepId: 'QUICK_SEARCH', outcome: 'SUCCEEDED', productCards: [card], comparables: [], coverage: [{ provider: 'kalodata', dataset: 'quick_search_product_cards', state: 'COLLECTED', observedStartDate: '2026-09-01', observedEndDate: '2026-09-30', truncated: false, note: null }], limitations: [] };
      return { result: { contractVersion: 'research-automation-provider-v1', provider: 'KALODATA', status: 'SUCCEEDED', searchWindow: null, cards: [], candidatePool: { rowsReturned: 1, validDistinctProducts: 1, duplicateRowsCollapsed: 0, invalidRows: 0 }, coverage: [], usage, captures: [capture], limitations: [] } as any, step };
    },
    async collect(input) {
      const step: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: input.runId, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], comparables: [], coverage: [{ provider: 'kalodata', dataset: 'product_period_detail', state: 'COLLECTED', observedStartDate: '2026-09-01', observedEndDate: '2026-09-30', truncated: false, note: null }], limitations: [] };
      return { result: { contractVersion: 'research-automation-provider-v1', provider: 'KALODATA', status: 'SUCCEEDED', requestedPeriod: input.requestedPeriod, productObservations: [], productPeriodSummaries: [], webResults: [], coverage: [], usage, captures: [capture], limitations: [] } as any, step };
    },
  };
}

/** The real web-search provider and binding over a synthetic transport that answers with `organic`. */
export function syntheticWebSource(onCall: (url: URL) => void, organic: unknown[]): AutomationSourcePort {
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      onCall(new URL(String(input)));
      return new Response(JSON.stringify({ organic_results: organic }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return bindResearchAutomationProvider(createResearchAutomationProviderRegistry({ kalodataSecretKey: null, serpApiKey: SYNTHETIC_SERP_KEY, apifyTokenConfigured: false }, transport).get('SERPAPI'));
}
