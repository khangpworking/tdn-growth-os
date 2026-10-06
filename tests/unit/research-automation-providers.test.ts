import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createResearchAutomationProviderRegistry,
  researchAutomationProviderConfigFromEnv,
  type ProductCard,
  type CollectInput,
  type ProviderRawCapture,
  type ProviderTransport,
  type QuickSearchInput,
  type QuickSearchResult,
  type ResearchAutomationProvider,
} from '../../src/modules/analysis/research-automation/providers.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';

const PERIOD = { startDate: '2026-01-01', endDate: '2026-01-31' } as const;

test('review collection configuration requires both a token and an explicit bounded charge cap', () => {
  const token = 'synthetic-apify-token-not-live';
  assert.equal(researchAutomationProviderConfigFromEnv({ TDN_APIFY_TOKEN: token }).apifyReviews, undefined);
  assert.deepEqual(researchAutomationProviderConfigFromEnv({ TDN_APIFY_TOKEN: token, TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '5' }).apifyReviews, { token, maxChargeUsd: 5 });
  for (const cap of ['0', '-1', 'NaN', 'Infinity', '10001']) {
    assert.throws(() => researchAutomationProviderConfigFromEnv({ TDN_APIFY_TOKEN: token, TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: cap }), error => error instanceof Error && !error.message.includes(token));
  }
  assert.throws(() => researchAutomationProviderConfigFromEnv({ TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '5' }), /requires/);
});

test('review collection accepts an optional per-listing review limit from 1 to 500', () => {
  const token = 'synthetic-apify-token-not-live';
  const base = { TDN_APIFY_TOKEN: token, TDN_RESEARCH_SHOPEE_MAX_CHARGE_USD: '5' };
  assert.deepEqual(researchAutomationProviderConfigFromEnv({ ...base, TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: '300' }).apifyReviews, { token, maxChargeUsd: 5, maxReviewsPerProduct: 300 });
  assert.equal(researchAutomationProviderConfigFromEnv(base).apifyReviews?.maxReviewsPerProduct, undefined);
  for (const limit of ['0', '501', '-1', '2.5', 'NaN', '1e2', ' 300']) {
    assert.throws(() => researchAutomationProviderConfigFromEnv({ ...base, TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: limit }), error => error instanceof Error && !error.message.includes(token));
  }
  assert.throws(() => researchAutomationProviderConfigFromEnv({ TDN_APIFY_TOKEN: token, TDN_RESEARCH_SHOPEE_MAX_REVIEWS_PER_PRODUCT: '300' }), /requires/);
});

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), { status, headers: { 'content-type': 'application/json' } });
}

function transport(handler: (url: URL, init: RequestInit) => Response | Promise<Response>, now = Date.parse('2026-10-02T00:00:00.000Z')): ProviderTransport {
  return {
    fetch: (async (input, init) => handler(new URL(String(input)), init ?? {})) as typeof fetch,
    sleep: async () => {},
    now: () => now,
  };
}

function quickInput(overrides: Partial<QuickSearchInput> = {}): QuickSearchInput {
  return {
    runId: 'run-synthetic-1', mode: 'PRODUCT', keyword: 'canxi', description: null,
    requestedPeriod: PERIOD, country: 'VN', asOf: '2026-10-02T00:00:00.000Z', ...overrides,
  };
}

function collectInput(overrides: Partial<CollectInput> = {}): CollectInput {
  return {
    runId: 'run-synthetic-1', mode: 'PRODUCT', keyword: 'canxi', requestedPeriod: PERIOD,
    country: 'VN', selectedProductRefs: ['kalodata:101'], peerProductRefs: [], ...overrides,
  };
}

const RANK_WINDOW = { startDate: '2026-09-02', endDate: '2026-10-01' } as const;

function syntheticRankCapture(outcome: ProviderRawCapture['outcome'] = 'OK', captureId = 'rank-0001'): ProviderRawCapture {
  return {
    captureId, provider: 'KALODATA', operation: 'kalodata.product.rank', billing: 'FREE_ACCOUNT_QUERY', method: 'POST',
    endpoint: 'https://www.kalodata.com/openapi/product/rank', requestParameters: { keyword: 'canxi' }, requestBodyBytes: Buffer.from('{}'),
    queryWindow: RANK_WINDOW, pageNumber: 1, productRef: null, requestedAt: '2026-10-02T00:00:00.000Z', completedAt: '2026-10-02T00:00:01.000Z',
    outcome, httpStatus: outcome === 'OK' ? 200 : 400, responseBytes: Buffer.from('{}'), responseSha256: 'a'.repeat(64), responseByteLength: 2, providerCode: null,
  };
}

function syntheticCard(rankCaptureId: string): ProductCard {
  return {
    ref: 'kalodata:101', provider: 'KALODATA', platform: 'TIKTOK_SHOP', country: 'VN', sourceProductId: '101', name: 'Synthetic calcium',
    image: { status: 'UNAVAILABLE', reason: 'NOT_RETURNED' }, description: { status: 'MISSING_EMPTY', captureId: null },
    providerPageUrl: 'https://www.kalodata.com/product/detail?id=101', listingUrl: { status: 'NOT_RETURNED_BY_PROVIDER' },
    price: { currency: 'VND', unitPrice: 100000, minSkuPrice: 100000, maxSkuPrice: 100000, observedWindow: RANK_WINDOW }, shopId: null,
    rank: { position: 1, sortField: 'revenue', window: RANK_WINDOW }, provenance: { rankCaptureId, detailCaptureId: null },
  };
}

function syntheticQuickResult(card: ProductCard, captures: readonly ProviderRawCapture[], coverage: QuickSearchResult['coverage'] = []): QuickSearchResult {
  return {
    contractVersion: 'research-automation-provider-v1', provider: 'KALODATA', status: 'SUCCEEDED',
    searchWindow: { window: RANK_WINDOW, label: 'QUICK_SEARCH_RECENT_WINDOW', basis: 'VN_DATE_BEFORE_AS_OF_30_DAYS', relationToRequestedPeriod: 'OUTSIDE' },
    cards: [card], candidatePool: { rowsReturned: 1, validDistinctProducts: 1, duplicateRowsCollapsed: 0, invalidRows: 0 }, coverage,
    usage: { provider: 'KALODATA', requestsIssued: captures.length, paidRequestsIssued: 0, ambiguousPaidRequests: 0, automaticRetries: 0, credits: { status: 'NONE_USED' }, monetaryCharge: { status: 'UNKNOWN', reason: 'synthetic' } },
    captures, limitations: [],
  };
}

function syntheticBindingProvider(result: QuickSearchResult): ResearchAutomationProvider {
  return {
    id: 'KALODATA', capability: () => { throw new Error('capability is not part of this binding boundary'); },
    quickSearch: async () => result,
    collect: async () => { throw new Error('collect is not part of this binding boundary'); },
  } as unknown as ResearchAutomationProvider;
}

function kalodataFixture() {
  let balanceCalls = 0;
  const seen: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
  const fixture = transport(async (url, init) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    seen.push({ path: url.pathname, method: init.method ?? 'GET', body });
    if (url.pathname.endsWith('/credit/balance')) {
      balanceCalls++;
      return response({ success: true, data: { totalRemain: balanceCalls === 1 ? 100 : 98 } });
    }
    if (url.pathname.endsWith('/product/rank')) {
      return response({ success: true, data: [
        { product_id: '101', product_name: 'Calcium A', master_image_url: 'https://cdn.example/101.jpg', unit_price: 120000 },
        { product_id: '101', product_name: 'Calcium A duplicate', master_image_url: 'https://cdn.example/101.jpg' },
        { product_id: '102', product_name: 'Calcium B', unit_price: 220000 },
      ] });
    }
    const productId = body?.product_id as string;
    return response({ success: true, data: {
      product_id: productId, product_region: 'VN', product_name: productId === '101' ? 'Calcium A detail' : 'Calcium B detail',
      product_description: [{ text: productId === '101' ? 'Mô tả nguyên văn' : '' }],
      master_image_url: productId === '101' ? 'https://cdn.example/detail-101.jpg' : null,
      revenue: 10, sales_volumn: 2, unit_price: 120000, min_price: 100000, max_price: 140000,
      video_revenue: 6, live_revenue: 4, shopping_mall_revenue: 0,
      product_shop_id: 'shop-1', pri_cate_id: '1', sec_cate_id: '2', ter_cate_id: '3',
    } });
  });
  return { fixture, seen };
}

test('registry reports honest configured and unavailable provider capabilities', async () => {
  let calls = 0;
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: true,
  }, transport(async () => { calls++; return response({}); }));
  const reports = registry.capabilities();
  const metric = reports.find(report => report.provider === 'METRIC')!;
  const apify = reports.find(report => report.provider === 'APIFY_SHOPEE')!;
  const serp = reports.find(report => report.provider === 'SERPAPI')!;
  assert.equal(metric.operations.METRIC_MARKET_EXPORT.status, 'WAITING_FOR_INPUT');
  assert.equal(apify.operations.SHOPEE_PRODUCT_DETAIL.status, 'UNSUPPORTED');
  assert.equal(serp.operations.WEB_DISCOVERY_CURRENT.status, 'NOT_CONFIGURED');
  const metricResult = await registry.get('METRIC').collect(collectInput());
  assert.equal(metricResult.status, 'WAITING_FOR_INPUT');
  assert.equal(calls, 0);
});

test('Kalodata quick search sends the recent 30-day window and preserves exact product provenance', async () => {
  const { fixture, seen } = kalodataFixture();
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false,
  }, fixture);
  const result = await registry.get('KALODATA').quickSearch(quickInput());
  assert.equal(result.status, 'SUCCEEDED');
  assert.deepEqual(result.searchWindow?.window, { startDate: '2026-09-02', endDate: '2026-10-01' });
  const rank = seen.find(call => call.path.endsWith('/product/rank'))!;
  assert.equal(rank.body?.date_range, '2026-09-02~2026-10-01');
  assert.equal(rank.body?.keyword, 'canxi');
  assert.equal(rank.body?.page_size, 10);
  assert.equal(result.candidatePool.duplicateRowsCollapsed, 1);
  assert.deepEqual(result.cards.map(card => card.sourceProductId), ['101', '102']);
  assert.equal(result.cards[0]?.description.status, 'AVAILABLE');
  assert.equal(result.cards[0]?.description.status === 'AVAILABLE' ? result.cards[0].description.text : '', 'Mô tả nguyên văn');
  assert.equal(result.cards[0]?.image.status, 'AVAILABLE');
  assert.equal(result.cards[0]?.provenance.rankCaptureId, 'kalodata-0002');
  assert.equal(result.usage.credits.status, 'OBSERVED_ACCOUNT_BALANCE_DELTA');
  assert.equal(result.usage.monetaryCharge.status, 'UNKNOWN');
});

test('source binding refuses cards without a successful matching rank capture', async () => {
  const input = quickInput();
  const validCapture = syntheticRankCapture();
  const valid = bindResearchAutomationProvider(syntheticBindingProvider(syntheticQuickResult(syntheticCard(validCapture.captureId), [validCapture])));
  const bound = await valid.quickSearch(input);
  assert.equal(bound.step.productCards[0]?.retrievedAt, validCapture.completedAt);

  const rejectedCapture = syntheticRankCapture('INVALID_PAYLOAD');
  for (const raw of [
    syntheticQuickResult(syntheticCard('missing-rank'), [validCapture]),
    syntheticQuickResult(syntheticCard(rejectedCapture.captureId), [rejectedCapture]),
  ]) {
    const rejected = await bindResearchAutomationProvider(syntheticBindingProvider(raw)).quickSearch(input);
    assert.equal(rejected.result, raw);
    assert.equal(rejected.step.outcome, 'FAILED');
    assert.deepEqual(rejected.step.productCards, []);
    assert.deepEqual(rejected.step.comparables, []);
    assert.deepEqual(rejected.step.coverage, []);
    assert.deepEqual(rejected.step.limitations.map(row => row.code), ['PROVIDER_OUTPUT_INVALID']);
  }
});

test('source binding sorts observed windows and marks holes or unexecuted windows partial', async () => {
  const capture = syntheticRankCapture();
  const coverage: QuickSearchResult['coverage'] = [{
    provider: 'KALODATA', operation: 'PRODUCT_PERIOD_DETAIL', status: 'QUERIES_COMPLETE', semantics: 'PRODUCT_PERIOD_WINDOWS',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-02-10' }, truncated: false,
    queryWindows: [
      { window: { startDate: '2026-01-20', endDate: '2026-01-31' }, productRef: 'kalodata:101', status: 'OK', captureIds: [capture.captureId], rows: 1, truncated: false },
      { window: { startDate: '2026-01-01', endDate: '2026-01-10' }, productRef: 'kalodata:101', status: 'OK', captureIds: [capture.captureId], rows: 1, truncated: false },
      { window: { startDate: '2026-02-01', endDate: '2026-02-10' }, productRef: 'kalodata:101', status: 'NOT_RUN_BOUND', captureIds: [], rows: null, truncated: false },
    ],
    continuation: { required: true, remainingWindows: [{ startDate: '2026-02-01', endDate: '2026-02-10' }], remainingProductRefs: ['kalodata:101'] }, limitations: [],
  }];
  const provider = bindResearchAutomationProvider(syntheticBindingProvider(syntheticQuickResult(syntheticCard(capture.captureId), [capture], coverage)));
  const result = await provider.quickSearch(quickInput());
  assert.deepEqual(result.step.coverage[0], {
    provider: 'kalodata', dataset: 'product_period_detail', state: 'PARTIAL', observedStartDate: '2026-01-01', observedEndDate: '2026-01-31', truncated: true, note: null,
  });
});

test('source binding observes only successful or empty windows and marks failed evidence incomplete', async () => {
  const capture = syntheticRankCapture();
  const coverage: QuickSearchResult['coverage'] = [{
    provider: 'KALODATA', operation: 'PRODUCT_PERIOD_DETAIL', status: 'PARTIAL', semantics: 'PRODUCT_PERIOD_WINDOWS',
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-04-29' }, truncated: false,
    queryWindows: [
      { window: { startDate: '2026-01-01', endDate: '2026-01-30' }, productRef: 'kalodata:101', status: 'OK', captureIds: [capture.captureId], rows: 1, truncated: false },
      { window: { startDate: '2026-01-31', endDate: '2026-02-28' }, productRef: 'kalodata:101', status: 'EMPTY', captureIds: [capture.captureId], rows: 0, truncated: false },
      { window: { startDate: '2026-03-01', endDate: '2026-03-30' }, productRef: 'kalodata:101', status: 'FAILED', captureIds: [capture.captureId], rows: null, truncated: false },
      { window: { startDate: '2026-03-31', endDate: '2026-04-29' }, productRef: 'kalodata:101', status: 'AMBIGUOUS_NO_RETRY', captureIds: [capture.captureId], rows: null, truncated: false },
    ],
    continuation: { required: false, remainingWindows: [], remainingProductRefs: [] }, limitations: [],
  }];
  const provider = bindResearchAutomationProvider(syntheticBindingProvider(syntheticQuickResult(syntheticCard(capture.captureId), [capture], coverage)));
  const result = await provider.quickSearch(quickInput());
  assert.deepEqual(result.step.coverage[0], {
    provider: 'kalodata', dataset: 'product_period_detail', state: 'PARTIAL', observedStartDate: '2026-01-01', observedEndDate: '2026-02-28', truncated: true, note: null,
  });
});

test('Kalodata collection splits exact requested periods and only sums one product after complete windows', async () => {
  let balanceCalls = 0;
  const seen: Record<string, unknown>[] = [];
  const fixture = transport(async (url, init) => {
    const body = typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null;
    if (url.pathname.endsWith('/credit/balance')) {
      balanceCalls++;
      return response({ success: true, data: { totalRemain: balanceCalls === 1 ? 50 : 48 } });
    }
    seen.push(body ?? {});
    const window = String(body?.date_range);
    const revenue = window.endsWith('2026-01-30') ? 100 : 50;
    return response({ success: true, data: {
      product_id: body?.product_id, product_name: 'Calcium A', product_description: [], revenue, sales_volumn: 1,
      unit_price: 120000, min_price: 100000, max_price: 140000, product_shop_id: 'shop-1',
    } });
  });
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false,
  }, fixture);
  const bound = await bindResearchAutomationProvider(registry.get('KALODATA')).collect(collectInput());
  const result = bound.result;
  assert.equal(result.status, 'SUCCEEDED');
  assert.deepEqual(seen.map(body => body.date_range), ['2026-01-01~2026-01-30', '2026-01-31~2026-01-31']);
  assert.equal(result.productObservations.length, 2);
  const summary = result.productPeriodSummaries[0]!;
  assert.equal(summary.scope, 'SINGLE_PRODUCT_NOT_MARKET_TOTAL');
  assert.deepEqual(summary.revenue, { status: 'SUM_OF_DISJOINT_PROVIDER_WINDOWS', value: 150 });
  assert.equal(result.coverage[0]?.status, 'QUERIES_COMPLETE');
  assert.deepEqual(bound.step.comparables.map(row => [row.productId, row.metric, row.value, row.window]), [
    ['kalodata:101', 'GMV_VND', '100', { startDate: '2026-01-01', endDate: '2026-01-30' }],
    ['kalodata:101', 'UNITS_SOLD', '1', { startDate: '2026-01-01', endDate: '2026-01-30' }],
    ['kalodata:101', 'GMV_VND', '50', { startDate: '2026-01-31', endDate: '2026-01-31' }],
    ['kalodata:101', 'UNITS_SOLD', '1', { startDate: '2026-01-31', endDate: '2026-01-31' }],
  ]);
  for (const row of bound.step.comparables) {
    const capture = result.captures[row.captureIndex]!;
    assert.equal(capture.operation, 'kalodata.product.detail');
    assert.equal(capture.productRef, row.productId);
    assert.deepEqual(capture.queryWindow, row.window);
  }
});

test('collection binding preserves observed zero, omits missing metrics and retains raw results when projection lineage is invalid', async () => {
  const provider = createResearchAutomationProviderRegistry({ kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false },
    transport(async url => url.pathname.endsWith('/credit/balance')
      ? response({ success: true, data: { totalRemain: 10 } })
      : response({ success: true, data: { product_id: '101', revenue: null, sales_volumn: 0 } }))).get('KALODATA');
  const bound = await bindResearchAutomationProvider(provider).collect(collectInput());
  assert.deepEqual(bound.step.comparables.map(row => [row.metric, row.value]), [['UNITS_SOLD', '0'], ['UNITS_SOLD', '0']]);
  for (const change of [
    { productRef: 'kalodata:999' },
    { window: { startDate: '2025-01-01', endDate: '2025-01-30' } },
    { captureId: 'not-retained' },
  ]) {
    const invalid = { ...bound.result, productObservations: [{ ...bound.result.productObservations[0]!, ...change }] };
    const rejected = await bindResearchAutomationProvider({ ...provider, collect: async () => invalid }).collect(collectInput());
    assert.equal(rejected.result, invalid);
    assert.equal(rejected.result.captures, bound.result.captures);
    assert.equal(rejected.result.usage, bound.result.usage);
    assert.deepEqual(rejected.step, {
      contractVersion: 'research-automation-step-result-v1', runId: collectInput().runId, stepId: 'COLLECTION', outcome: 'FAILED',
      productCards: [], comparables: [], coverage: [],
      limitations: [{ code: 'PROVIDER_OUTPUT_INVALID', provider: null,
        message: 'The provider returned data that failed validation; the result was rejected and nothing was inferred from it.' }],
    });
  }
});

test('Kalodata detail accepts the Vietnam region in either ASCII case and still rejects other regions or product IDs', async () => {
  const cases = [
    { productId: '101', region: 'vn', accepted: true },
    { productId: '101', region: 'VN', accepted: true },
    { productId: '101', region: 'th', accepted: false },
    { productId: '101', region: 'US', accepted: false },
    { productId: '999', region: 'vn', accepted: false },
  ] as const;
  for (const item of cases) {
    const label = `${item.productId}/${item.region}`;
    const registry = createResearchAutomationProviderRegistry({
      kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false,
    }, transport(async url => url.pathname.endsWith('/credit/balance')
      ? response({ success: true, data: { totalRemain: 10 } })
      : response({ success: true, data: {
        product_id: item.productId, product_region: item.region, product_name: 'Synthetic jelly', product_description: [],
        revenue: 10, sales_volumn: 2, unit_price: 5, min_price: 5, max_price: 5, video_revenue: 6, live_revenue: 4, shopping_mall_revenue: 0,
      } })));
    const result = await registry.get('KALODATA').collect(collectInput({ requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' } }));
    assert.equal(result.captures.find(capture => capture.operation === 'kalodata.product.detail')?.outcome, item.accepted ? 'OK' : 'INVALID_PAYLOAD', label);
    assert.equal(result.coverage[0]?.queryWindows[0]?.status, item.accepted ? 'OK' : 'FAILED', label);
    assert.deepEqual(result.productObservations.map(row => [row.revenue, row.salesVolume]), item.accepted ? [[10, 2]] : [], label);
  }
});

test('Kalodata collection without approved products requests nothing, while an empty detail response is an observed window', async () => {
  let calls = 0;
  const source = bindResearchAutomationProvider(createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false,
  }, transport(async url => {
    calls++;
    return url.pathname.endsWith('/credit/balance') ? response({ success: true, data: { totalRemain: 10 } }) : response({ success: true, data: null });
  })).get('KALODATA'));
  const requestedPeriod = { startDate: '2026-01-01', endDate: '2026-01-30' };
  const none = await source.collect(collectInput({ requestedPeriod, selectedProductRefs: [], peerProductRefs: [] }));
  assert.equal(calls, 0);
  assert.deepEqual(none.step.coverage, [{
    provider: 'kalodata', dataset: 'product_period_detail', state: 'WAITING_FOR_INPUT', observedStartDate: null, observedEndDate: null, truncated: false, note: 'NO_APPROVED_PRODUCT_REFS',
  }]);
  const empty = await source.collect(collectInput({ requestedPeriod }));
  assert.equal(empty.step.outcome, 'SUCCEEDED');
  assert.equal(empty.result.productObservations.length, 0);
  assert.deepEqual(empty.step.coverage, [{
    provider: 'kalodata', dataset: 'product_period_detail', state: 'COLLECTED', observedStartDate: '2026-01-01', observedEndDate: '2026-01-30', truncated: false, note: 'SINGLE_PRODUCT_WINDOWS_NOT_MARKET_TOTAL',
  }]);
});

test('malformed Kalodata payload is retained as an invalid capture and never retried', async () => {
  let rankCalls = 0;
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false,
  }, transport(async url => {
    if (url.pathname.endsWith('/credit/balance')) return response({ success: true, data: { totalRemain: 10 } });
    rankCalls++;
    return response({ success: true, data: { rows: 'not-an-array' } });
  }));
  const result = await registry.get('KALODATA').quickSearch(quickInput());
  assert.equal(result.status, 'FAILED');
  assert.equal(rankCalls, 1);
  assert.equal(result.captures.filter(capture => capture.operation === 'kalodata.product.rank').length, 1);
  assert.equal(result.captures.find(capture => capture.operation === 'kalodata.product.rank')?.outcome, 'INVALID_PAYLOAD');
});

test('SerpApi current discovery maps organic results, strips the key from captures, and keeps period semantics honest', async () => {
  const raw = JSON.stringify({ organic_results: [
    { position: 1, title: 'Calcium research', link: 'https://example.test/article', displayed_link: 'example.test', snippet: 'Current result', source: 'Example' },
    { position: 2, title: 'Unusable result', link: 'http://insecure.test/article' },
  ] });
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: null, serpApiKey: 'synthetic-serp-key', apifyTokenConfigured: false,
  }, transport(async (url, init) => {
    assert.equal(url.pathname, '/search.json');
    assert.equal(url.searchParams.get('engine'), 'google');
    assert.equal(url.searchParams.get('q'), 'canxi');
    assert.equal(url.searchParams.get('gl'), 'vn');
    assert.equal(url.searchParams.get('hl'), 'vi');
    assert.equal(url.searchParams.get('api_key'), 'synthetic-serp-key');
    assert.equal(init.method, 'GET');
    return new Response(raw, { status: 200 });
  }));
  const result = await registry.get('SERPAPI').collect(collectInput({
    requestedPeriod: { startDate: '2025-01-01', endDate: '2025-12-31' },
  }));
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.webResults.length, 1);
  assert.equal(result.webResults[0]?.semantics, 'CURRENT_WEB_SNAPSHOT_NOT_PERIOD_EVIDENCE');
  assert.equal(result.captures[0]?.endpoint, 'https://serpapi.com/search.json');
  assert.equal('api_key' in result.captures[0]!.requestParameters, false);
  assert.deepEqual(result.captures[0]?.responseBytes, Buffer.from(raw));
  assert.equal(result.productObservations.length, 0);
  assert.equal(result.productPeriodSummaries.length, 0);
});

test('SerpApi collect keeps web results without the removed period-evidence blocking labels', async () => {
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: null, serpApiKey: 'synthetic-serp-key', apifyTokenConfigured: false,
  }, transport(async () => response({ organic_results: [
    { position: 1, title: 'Calcium research', link: 'https://example.test/article' },
  ] })));
  const bound = await bindResearchAutomationProvider(registry.get('SERPAPI')).collect(collectInput());
  assert.equal(bound.result.status, 'SUCCEEDED');
  assert.equal(bound.result.webResults.length, 1);
  const expectedLimitations = ['ORGANIC_RESULTS_ONLY', 'RESULT_URLS_ARE_PROVIDER_REPORTED'];
  assert.deepEqual(bound.result.limitations, expectedLimitations);
  assert.deepEqual(bound.result.coverage[0]?.limitations, expectedLimitations);
  assert.deepEqual(bound.step.limitations.map(row => row.code), expectedLimitations);
});

test('SerpApi bounds returned organic rows at the requested result limit', async () => {
  const organicResults = Array.from({ length: 11 }, (_, index) => ({
    position: index + 1, title: `Result ${index + 1}`, link: `https://example.test/${index + 1}`,
  }));
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: null, serpApiKey: 'synthetic-serp-key', apifyTokenConfigured: false,
  }, transport(async () => response({ organic_results: organicResults })));
  const result = await registry.get('SERPAPI').collect(collectInput());
  assert.equal(result.status, 'SUCCEEDED');
  assert.equal(result.webResults.length, 10);
  assert.equal(result.coverage[0]?.truncated, true);
  assert.equal(result.coverage[0]?.queryWindows[0]?.rows, 10);
});

test('an aborted SerpApi call records ambiguous usage and does not retry', async () => {
  let calls = 0;
  const controller = new AbortController();
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: null, serpApiKey: 'synthetic-serp-key', apifyTokenConfigured: false,
  }, transport(async () => {
    calls++;
    controller.abort();
    throw new DOMException('aborted', 'AbortError');
  }));
  const result = await registry.get('SERPAPI').collect(collectInput(), { signal: controller.signal });
  assert.equal(calls, 1);
  assert.equal(result.status, 'CANCELLED');
  assert.equal(result.usage.ambiguousPaidRequests, 1);
  assert.equal(result.captures[0]?.outcome, 'ABORTED_AMBIGUOUS');
  assert.equal(result.usage.automaticRetries, 0);
});

test('credential echoes are rejected and raw response bytes are not retained', async () => {
  const credential = 'synthetic-serp-key';
  const unicodeEscapedCredential = [...credential]
    .map(character => `\\u${character.codePointAt(0)!.toString(16).padStart(4, '0')}`)
    .join('');
  const rawPayloads = [
    `{"organic_results":[],"diagnostic":"${unicodeEscapedCredential}"}`,
    `{"organic_results":[],"${unicodeEscapedCredential}":"ok"}`,
  ];
  for (const raw of rawPayloads) {
    const registry = createResearchAutomationProviderRegistry({
      kalodataSecretKey: null, serpApiKey: credential, apifyTokenConfigured: false,
    }, transport(async () => new Response(raw, { status: 200 })));
    const result = await registry.get('SERPAPI').collect(collectInput());
    assert.equal(result.status, 'FAILED');
    assert.equal(result.captures[0]?.outcome, 'CREDENTIAL_ECHO_REFUSED');
    assert.equal(result.captures[0]?.responseBytes, null);
    assert.equal(result.usage.ambiguousPaidRequests, 0);
  }
});

test('provider input validation rejects non-Vietnam and malformed product refs before transport', async () => {
  let calls = 0;
  const registry = createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-kalo-key', serpApiKey: null, apifyTokenConfigured: false,
  }, transport(async () => { calls++; return response({}); }));
  await assert.rejects(() => registry.get('KALODATA').collect(collectInput({ country: 'US' as unknown as 'VN' })), { code: 'INVALID_PROVIDER_INPUT' });
  await assert.rejects(() => registry.get('KALODATA').collect(collectInput({ selectedProductRefs: ['https://169.254.169.254/latest'] })), { code: 'INVALID_PROVIDER_INPUT' });
  assert.equal(calls, 0);
});
