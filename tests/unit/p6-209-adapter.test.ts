import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const load = async (name: string): Promise<any> => JSON.parse(await readFile(new URL(`../fixtures/p6-209/${name}.json`, import.meta.url), 'utf8'));
const parserUrl = new URL('../../tools/opencli-metric/clis/metric/parser.js', import.meta.url);
const captureUrl = new URL('../../tools/opencli-metric/clis/metric/capture.js', import.meta.url);

test('adapter parser accepts the synthetic form map and preserves visible controls', async () => {
  const { parseMetricForm } = await import(parserUrl.href);
  const controls = parseMetricForm(await load('metric-form'));
  assert.deepEqual(controls.map((control: any) => control.name), ['platform', 'period', 'category', 'keywords', 'smartQuery', 'usefulFilters']);
  assert.deepEqual(controls[0].options, ['Shopee', 'Lazada', 'Tiki', 'Tiktok']);
});

test('adapter parser maps a read-only search observation and scope', async () => {
  const { parseSearchObservation } = await import(parserUrl.href);
  const spec = { keywords: ['synthetic-keyword'], platforms: ['tiktok', 'shopee'], period: { startDate: '2025-09-15', endDate: '2026-09-20' }, category: null };
  const parsed = parseSearchObservation(await load('metric-search'), spec, 5000);
  assert.equal(parsed.rowCount, 128);
  assert.equal(parsed.snapshot.synthetic, true);
});

test('adapter accepts the synthetic multi-platform read-back shape and rejects scope drift', async () => {
  const { parseSearchObservation } = await import(parserUrl.href);
  const observation = await load('metric-multi-platform-readback');
  const spec = {
    keywords: ['synthetic-dual-platform-term'], platforms: ['shopee', 'tiktok'],
    period: { startDate: '2026-08-01', endDate: '2026-08-30' }, category: null,
  };
  const parsed = parseSearchObservation(observation, spec, 5000);
  assert.equal(parsed.rowCount, 73);
  assert.deepEqual(parsed.appliedFilters, observation.appliedFilters);
  for (const appliedFilters of [
    { ...observation.appliedFilters, platforms: ['shopee'] },
    { ...observation.appliedFilters, keywords: ['synthetic-other-term'] },
    { ...observation.appliedFilters, period: { startDate: '2026-08-02', endDate: '2026-08-30' } },
  ]) {
    assert.throws(() => parseSearchObservation({ ...observation, appliedFilters }, spec), /METRIC_FILTER_MISMATCH/);
  }
});

test('keyword chip read-back is retained and cannot silently become empty', async () => {
  const { parseSearchObservation } = await import(parserUrl.href);
  const observation = await load('metric-keyword-chip-readback');
  const spec = { keywords: ['synthetic-chip-term'], platforms: ['shopee'], period: { startDate: '2026-08-01', endDate: '2026-08-30' }, category: null };
  assert.deepEqual(parseSearchObservation(observation, spec).appliedFilters.keywords, ['synthetic-chip-term']);
  assert.throws(() => parseSearchObservation({ ...observation, appliedFilters: { ...observation.appliedFilters, keywords: [] } }, spec), /METRIC_FILTER_MISMATCH/);
});

test('results extractor prefers response JSON, captures both platforms, and records paginated products', async () => {
  const { extractResultsPage, sanitizeNetworkResponses } = await import(captureUrl.href);
  const { validateMetricWebSnapshot } = await import('../../src/modules/analysis/research-automation/metric-web-snapshot.js');
  const fixture = await load('metric-results-response');
  const scope = { keywords: ['synthetic-chip-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-07-01', endDate: '2026-08-31' }, category: null };
  const result = extractResultsPage({ responses: fixture.responses, dom: await load('metric-results-dom'), scope, captureId: 'synthetic-capture', specDigest: 'a'.repeat(64), capturedAt: '2026-10-12T00:00:00.000Z', pageCap: 200 });
  assert.equal(result.snapshot.groups.W2_kpi.revenue.current.value, 12500000000);
  assert.deepEqual(result.snapshot.groups.W3_platformSplit.map((row: any) => row.platform), ['shopee', 'tiktok']);
  assert.equal(result.snapshot.groups.W12_topProducts.rows.length, 3);
  assert.equal(result.pagination.W12_topProducts.totalShown, 5);
  assert.equal(result.pagination.W12_topProducts.pagesRead, 2);
  assert.equal(result.pagination.W12_topProducts.truncated, true);
  assert.equal(result.pagination.W12_topProducts.byPlatform.all.totalShown, 5);
  assert.match(result.snapshot.groups.W12_topProducts.rows[0].cells.revenue.sourcePointer, /^response:/);
  assert.deepEqual(result.snapshot.groups.W11_location.rows.map((row: any) => row.cells.location.text), ['Synthetic province A', 'Synthetic province B']);
  assert.deepEqual(result.snapshot.groups.W4_monthly.map((row: any) => row.platform), ['shopee', 'shopee', 'tiktok', 'tiktok']);
  assert.equal(result.sourceMap.W15.source, 'dom');
  assert.equal(validateMetricWebSnapshot(result.snapshot), result.snapshot);
  const raw = sanitizeNetworkResponses([{ url: 'https://metric.vn/api/synthetic?token=secret', status: 200, body: { safe: 1, accessToken: 'must-not-survive' } }]);
  assert.deepEqual(raw, [{ urlPath: '/api/synthetic', responseOrder: 0, status: 200, body: { safe: 1 } }]);
});

test('results extractor accepts object-shaped response platform maps', async () => {
  const { extractResultsPage } = await import(captureUrl.href);
  const platformAggregation = (aggregation: string, first: number, second: number) => ({
    aggregation,
    entity: { platforms: { first: { platform_id: 1, value: first }, second: { platform_id: 8, value: second } } },
  });
  const result = extractResultsPage({
    responses: [{ urlPath: '/v2/market/analytics/search-basic/', body: { data: { search_basic: { aggregations: [
      platformAggregation('REVENUE_TOTAL_CUSTOM', 11, 22), platformAggregation('ORDER_TOTAL_CUSTOM', 3, 4),
      platformAggregation('PRODUCT_TOTAL', 5, 6), platformAggregation('SHOP_TOTAL', 7, 8),
    ] } } } }],
    dom: null,
    scope: { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
    captureId: 'synthetic-object-platforms', specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z',
    platformIdMap: { 1: 'shopee', 8: 'tiktok' },
  });
  assert.deepEqual(result.snapshot.groups.W3_platformSplit.map((row: any) => [row.platform, row.revenue.value, row.units.value]), [
    ['shopee', 11, 3], ['tiktok', 22, 4],
  ]);
});

test('malformed platform entries surface and never promote one platform to a combined KPI', async () => {
  const { extractResultsPage } = await import(captureUrl.href);
  const aggregation = (name: string, platforms: any) => ({ aggregation: name, entity: { platforms } });
  const response = (platforms: any) => ({ urlPath: '/v2/market/analytics/search-basic/', body: { data: { search_basic: { aggregations: [
    aggregation('REVENUE_TOTAL_CUSTOM', platforms), aggregation('ORDER_TOTAL_CUSTOM', platforms),
    aggregation('PRODUCT_TOTAL', platforms), aggregation('SHOP_TOTAL', platforms),
  ] } } } });
  const input = (platforms: any, captureId: string) => ({ responses: [response(platforms)], dom: null,
    scope: { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
    captureId, specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z', platformIdMap: { 1: 'shopee', 8: 'tiktok' } });
  assert.throws(() => extractResultsPage(input({ good: { platform_id: 1, value: 10 }, malformed: { value: 20 } }, 'synthetic-platform-error')),
    (error: any) => error.code === 'METRIC_PLATFORM_ENTRY_MALFORMED' && error.details.entries.length === 4);
  const onlyShopee = input({ good: { platform_id: 1, value: 10 } }, 'synthetic-single-platform');
  const onePlatform = extractResultsPage(onlyShopee);
  for (const field of ['revenue', 'units', 'soldListings', 'shops']) assert.equal(onePlatform.snapshot.groups.W2_kpi[field].current.value, null);
  assert.deepEqual(onePlatform.snapshot.groups.W3_platformSplit.map((row: any) => [row.platform, row.revenue.value]), [['shopee', 10], ['tiktok', null]]);
  const singleRequested = extractResultsPage({ ...onlyShopee, scope: { ...onlyShopee.scope, platforms: ['shopee'] } });
  assert.equal(singleRequested.snapshot.groups.W2_kpi.revenue.current.value, 10);
});

const salesDataInput = (aggregations: any[]) => ({
  responses: [{ urlPath: '/v2/market/analytics/search-basic/', body: { data: { search_basic: { aggregations } } } }],
  dom: { regions: { overview: { kpi: { revenue: null, units: null, soldListings: null, shops: null } } } },
  scope: { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
  captureId: 'synthetic-sales-data', specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z', platformIdMap: { 1: 'shopee', 8: 'tiktok' },
});

test('sales-data validation does not depend on a non-null revenue entry', async t => {
  const { extractResultsPage } = await import(captureUrl.href);
  for (const aggregation of ['ORDER_TOTAL_CUSTOM', 'PRODUCT_TOTAL', 'SHOP_TOTAL']) {
    await t.test(aggregation, () => {
      assert.throws(() => extractResultsPage(salesDataInput([
        { aggregation: 'REVENUE_TOTAL_CUSTOM', entity: { platforms: [{ platform_id: 1, value: null }] } },
        { aggregation, entity: { platforms: [{ value: 7 }] } },
      ])), (error: any) => error.code === 'METRIC_PLATFORM_ENTRY_MALFORMED');
    });
  }
  for (const aggregation of ['REVENUE__BY__PRICE_RANGE_CUSTOM', 'REVENUE__BY__LOCATION_CUSTOM', 'REVENUE__BY__SHOP_TYPE_CUSTOM', 'REVENUE__BY__CATEGORIES_CUSTOM']) {
    await t.test(aggregation, () => {
      assert.throws(() => extractResultsPage(salesDataInput([
        { aggregation, entities: [{ key: 'synthetic-bucket', platforms: 7 }] },
      ])), (error: any) => error.code === 'METRIC_PLATFORM_ENTRY_MALFORMED');
    });
  }
});

test('sales-data keeps independent platform values when revenue or a breakdown value is missing', async t => {
  const { extractResultsPage } = await import(captureUrl.href);
  const result = extractResultsPage(salesDataInput([
    { aggregation: 'REVENUE_TOTAL_CUSTOM', entity: { platforms: [{ platform_id: 1, value: 11 }, { platform_id: 8, value: null }] } },
    { aggregation: 'ORDER_TOTAL_CUSTOM', entity: { platforms: [{ platform_id: 1, value: 3 }, { platform_id: 8, value: 4 }] } },
    { aggregation: 'REVENUE__BY__PRICE_RANGE_CUSTOM', entities: [{ from: 0, to: 100, value: 99,
      platforms: [{ platform_id: 1, value: 0 }, { platform_id: 8, value: null }] }] },
  ]));
  await t.test('units remain available without platform revenue', () => {
    assert.deepEqual(result.snapshot.groups.W3_platformSplit.map((row: any) => [row.platform, row.revenue.value, row.units?.value ?? null]), [
      ['shopee', 11, 3], ['tiktok', null, 4],
    ]);
  });
  await t.test('a missing platform breakdown cannot inherit the parent total', () => {
    assert.deepEqual(result.snapshot.groups.W6_priceLevel.rows.map((row: any) => [row.cells.platform.text, row.cells.revenue.value]), [
      ['shopee', 0], ['tiktok', null],
    ]);
  });
  for (const field of ['revenue', 'units', 'soldListings', 'shops']) assert.equal(result.snapshot.groups.W2_kpi[field].current.value, null);
});

test('unlabelled monthly rows stay all and DOM fills a platform missing from responses', async () => {
  const { extractResultsPage, sanitizeNetworkResponses } = await import(captureUrl.href);
  const fixture = await load('metric-results-response');
  const monthly = fixture.responses.find((response: any) => response.body.region === 'monthly');
  const withoutPlatform = { ...monthly, viewPlatform: 'shopee', body: { ...monthly.body, items: [{ ...monthly.body.items[0], platform: undefined }] } };
  const topProducts = fixture.responses.filter((response: any) => response.body.region === 'top-products')[0];
  const shopeeResponse = { ...topProducts, body: { ...topProducts.body, platform: 'shopee' } };
  const dom = {
    platform: 'shopee',
    regions: {
      'top-products': {
        platform: 'tiktok', selector: '#synthetic-tiktok-products',
        items: [{ name: 'Synthetic TikTok item', shop: 'Synthetic TikTok shop', revenue: { value: 10, unit: 'VND' } }],
      },
    },
  };
  const responses = fixture.responses.filter((response: any) => response.body.region !== 'monthly' && response.body.region !== 'top-products');
  responses.push(withoutPlatform, shopeeResponse);
  const result = extractResultsPage({ responses, dom, scope: { keywords: ['x'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-07-01', endDate: '2026-08-31' }, category: null }, captureId: 'synthetic', specDigest: 'a'.repeat(64), capturedAt: '2026-10-12T00:00:00.000Z' });
  assert.equal(result.snapshot.groups.W4_monthly[0].platform, 'all');
  assert.deepEqual(result.snapshot.groups.W12_topProducts.rows.map((row: any) => row.cells.name.text), ['Synthetic item A', 'Synthetic item B', 'Synthetic TikTok item']);
  assert.deepEqual(result.sourceMap.W12.platforms.sort(), ['shopee', 'tiktok']);
  assert.deepEqual(sanitizeNetworkResponses([{ body: { userId: 'identity', tokenLike: 'Bearer identity-token', revenue: 2 } }])[0].body, { revenue: 2 });
});

test('live capture view metadata never labels an otherwise unlabelled response', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-unlabelled-live-'));
  const spec = { keywords: ['synthetic-keyword'], platforms: ['shopee'], period: { startDate: '2025-09-15', endDate: '2026-09-09' }, category: null };
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(spec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: spec };
  const fixture = await load('metric-results-response');
  const responses = fixture.responses.map((response: any) => response.body.region === 'monthly'
    ? { ...response, body: { ...response.body, items: response.body.items.map((row: any) => ({ ...row, platform: undefined })) } }
    : response);
  const baseDom = await load('metric-results-dom');
  const dom = {
    ...baseDom, screenshotRegions: { overview: '#synthetic-overview' },
    platformViews: [{ label: 'Shopee', selected: true, selector: 'platform-view', index: 0 }],
    regions: { ...baseDom.regions, 'top-products': { platform: 'tiktok', selector: '#synthetic-tiktok-products', items: [{ name: 'Synthetic TikTok fallback', shop: 'Synthetic TikTok shop', revenue: { value: 9, unit: 'VND' } }] } },
  };
  const page = fakePage({ ...form, appliedFilters: { ...spec, keywords: [] }, quota: {} }, result, dom, [...gateResponsesFor(spec.platforms), ...responses]);
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  const snapshot = JSON.parse(await readFile(join(captureDir, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.groups.W4_monthly[0].platform, 'all');
  assert.match(await readFile(join(captureDir, 'snapshot.json'), 'utf8'), /Synthetic TikTok fallback/);
  await rm(directory, { recursive: true, force: true });
});

test('collectResults keeps the overview combined and does not switch result tabs', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-combined-view-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const fixture = await load('metric-results-response'); const baseDom = await load('metric-results-dom');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, result, baseDom, [...gateResponsesFor(commandSpec.platforms), ...fixture.responses], {
    resultDom: (_state: any, original: any) => ({ ...original, screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [{ label: 'Synthetic history', selected: true, selector: '[role="tab"]', index: 0 }] }),
  });
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  const screenshotNames = page.screenshotCalls.map((options: any) => String(options.path));
  assert.ok(screenshotNames.some((name: string) => name.includes('platform-all-region-overview')));
  assert.equal(page.platformSwitches, undefined);
  assert.equal(page.calls.some((call: string) => call.includes('platform-view') || call.includes('role="tab"')), false);
  const regionScreenshots = page.screenshotCalls.filter((options: any) => options.fullPage === false);
  assert.ok(regionScreenshots.length > 0);
  assert.ok(regionScreenshots.every((options: any) => options.clip));
  assert.ok(page.screenshotCalls.some((options: any) => options.fullPage === true));
  await rm(directory, { recursive: true, force: true });
});

test('archive sanitization removes identity and token-like values from every saved file', async () => {
  const { sanitizeNetworkResponses, sanitizeResultsHtml } = await import(captureUrl.href);
  const sensitive = await load('metric-sensitive-archive');
  const clean = sanitizeNetworkResponses(sensitive.responses);
  const serialized = JSON.stringify(clean);
  for (const marker of ['Synthetic logged-in account', 'synthetic-owner@example.test', '+84901234567', 'Synthetic owner nickname', 'https://example.test/avatar.png', 'synthetic-user-id', 'Synthetic shop owner', 'synthetic-secret-token', 'synthetichead.syntheticpayload.syntheticsignature', '0123456789abcdef0123456789abcdef0123456789abcdef']) assert.doesNotMatch(serialized, new RegExp(marker.replace(/[+?.]/g, '\\$&')));
  assert.match(JSON.stringify(clean), /"business"/);
  const html = sanitizeResultsHtml('<html><head><meta name="identity" content="synthetic-owner@example.test"><script>Bearer synthetic-secret-token</script></head><body><header class="account-area">Synthetic logged-in account</header><main data-state="identity-state"><div data-metric-region="overview">Revenue 8</div></main></body></html>');
  assert.doesNotMatch(html, /synthetic-owner|synthetic-secret|logged-in account|account-area/i);
  assert.match(html, /<meta|<script|data-state="identity-state"/i);
  assert.match(html, /Revenue 8/);
});

test('search submit inspection is scoped to the form and ignores the sidebar Analytics link', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const inspection = withMetricDom(`
    <aside><a href="/analytics">Analytics</a></aside>
    <div id="QuerySearchBuilder">
      <div class="ant-space-item"><label>Platform</label><div class="ant-select"><span>Shopee</span></div></div>
      <div class="ant-space-item"><label>Keywords</label><div class="ant-select ant-select-multiple"><input /></div></div>
      <button class="ant-btn ant-btn-primary">Analytics</button>
    </div>
  `, () => adapter.describeSearchSubmit());
  assert.equal(inspection.candidateCount, 1);
  assert.equal(inspection.pageWideAnalyticsCount, 2);
  assert.deepEqual(inspection.descriptor, {
    candidateIndex: 0,
    tag: 'button',
    classes: 'ant-btn ant-btn-primary',
    text: 'Analytics',
    domPath: 'button:nth-child(3)',
    clickSelector: '#QuerySearchBuilder button:nth-child(3)',
  });
  assert.throws(() => adapter.assertSearchSubmitInspection({ ...inspection, candidateCount: 2, descriptor: null }), /METRIC_UI_CHANGED/);
});

test('sanitized full DOM keeps the app form and results while dropping account nodes', async () => {
  const { sanitizeResultsHtml } = await import(captureUrl.href);
  const clean = sanitizeResultsHtml('<header class="account-area">Synthetic owner</header><nav><a>Analytics</a></nav><main id="app"><form id="QuerySearchBuilder"><input name="keyword" /></form><section data-metric-region="overview">Revenue 8</section></main>');
  assert.match(clean, /QuerySearchBuilder/);
  assert.match(clean, /data-metric-region="overview"/);
  assert.match(clean, /Revenue 8/);
  assert.match(clean, />Analytics</);
  assert.doesNotMatch(clean, /Synthetic owner|account-area/);
});

test('search-applied gate distinguishes missing search, wrong platforms, missing result endpoints, and success', async () => {
  const { assertSearchAppliedGate, buildMetricPlatformMap } = await import(captureUrl.href);
  const spec = { platforms: ['shopee', 'tiktok'] };
  const platformList = { responseOrder: 0, urlPath: '/market/search_basic', body: { data: { platforms: [{ platform_id: 1 }, { platform_id: 2 }, { platform_id: 3 }, { platform_id: 8 }] } } };
  const map = buildMetricPlatformMap([platformList], ['Shopee', 'Lazada', 'Tiki', 'Tiktok']);
  const body = (ids: number[]) => ({ data: { search_basic: { aggregations: [{ aggregation: 'GATE', entity: { platforms: Object.fromEntries(ids.map((id: number, index: number) => [String(index), { platform_id: id, value: index + 1 }])) } }] } } });
  const products = { responseOrder: 3, urlPath: '/v2/market/analytics/products/', body: { data: { products: [] } } };
  const shops = { responseOrder: 4, urlPath: '/v2/market/analytics/shops/', body: { data: { shops: [] } } };
  assert.throws(() => assertSearchAppliedGate({ responses: [platformList, products, shops], spec, baselineResponseOrder: 0, platformMap: map }), (error: any) => error.code === 'METRIC_SEARCH_NOT_APPLIED' && error.details.missingResponses.includes('search-basic'));
  assert.throws(() => assertSearchAppliedGate({ responses: [platformList, { responseOrder: 2, urlPath: '/v2/market/analytics/search-basic/', body: body([1]) }, products, shops], spec, baselineResponseOrder: 0, platformMap: map }), (error: any) => error.code === 'METRIC_SEARCH_NOT_APPLIED' && error.details.platformSetsSeen[0].platforms.length === 1);
  assert.throws(() => assertSearchAppliedGate({ responses: [platformList, { responseOrder: 2, urlPath: '/v2/market/analytics/search-basic/', body: body([1, 8]) }, shops], spec, baselineResponseOrder: 0, platformMap: map }), (error: any) => error.code === 'METRIC_SEARCH_NOT_APPLIED' && error.details.missingResponses.includes('products'));
  const applied = assertSearchAppliedGate({ responses: [platformList, { responseOrder: 2, urlPath: '/v2/market/analytics/search-basic/', body: body([1, 8]) }, products, shops], spec, baselineResponseOrder: 0, platformMap: map });
  assert.equal(applied.applied, true);
  assert.deepEqual(applied.platformSet, ['shopee', 'tiktok']);
  assert.equal(applied.searchBasicResponseOrder, 2);
  assert.deepEqual(applied.productsResponseOrders, [3]);
  assert.deepEqual(applied.shopsResponseOrders, [4]);
  assert.throws(() => assertSearchAppliedGate({
    responses: [platformList, { responseOrder: 1, urlPath: '/v2/market/analytics/search-basic/', body: body([1, 8]) },
      { ...products, responseOrder: 2 }, { ...shops, responseOrder: 3 }],
    spec, baselineResponseOrder: 1, platformMap: map,
  }), (error: any) => error.code === 'METRIC_SEARCH_NOT_APPLIED' && error.details.missingResponses.includes('search-basic'));
});

test('network bridge repeats without an order stay stale instead of becoming post-click responses', async () => {
  const metric = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const { assertSearchAppliedGate, buildMetricPlatformMap } = await import(captureUrl.href);
  const platformList = { urlPath: '/market/search_basic', body: { data: { platforms: [{ platform_id: 1 }, { platform_id: 8 }] } } };
  const gateBody = { data: { search_basic: { aggregations: [{ aggregation: 'GATE', entity: { platforms: { first: { platform_id: 1, value: 1 }, second: { platform_id: 8, value: 1 } } } }] } } };
  const staleBatch = [platformList, { urlPath: '/v2/market/analytics/search-basic/', body: gateBody },
    { urlPath: '/v2/market/analytics/products/', body: { data: { products: [] } } },
    { urlPath: '/v2/market/analytics/shops/', body: { data: { shops: [] } } }];
  let reads = 0;
  const page = { readNetworkCapture: async () => { reads += 1; return staleBatch; } };
  const state = metric.createNetworkState();
  await metric.readNetworkChunk(page, state);
  const baseline = state.nextResponseOrder - 1;
  const repeated = await metric.readNetworkChunk(page, state);
  assert.equal(reads, 2);
  assert.deepEqual(repeated, []);
  const platformMap = buildMetricPlatformMap(state.all, ['Shopee', 'Tiktok']);
  assert.throws(() => assertSearchAppliedGate({
    responses: state.all, spec: { platforms: ['shopee', 'tiktok'] }, baselineResponseOrder: baseline, platformMap,
  }), (error: any) => error.code === 'METRIC_SEARCH_NOT_APPLIED' && error.details.missingResponses.includes('search-basic'));
});

test('search-applied gate counts only completed responses and reports the drained ones', async () => {
  const { assertSearchAppliedGate, buildMetricPlatformMap, responseCompleted } = await import(captureUrl.href);
  assert.equal(responseCompleted({ urlPath: '/v2/market/analytics/products/', method: 'POST' }), false);
  assert.equal(responseCompleted({ responseStatus: 500, responsePreview: '{"error":"synthetic"}' }), false);
  assert.equal(responseCompleted({ responseStatus: 200, responsePreview: '{"data":{"products":[]}}' }), true);
  assert.equal(responseCompleted({ body: { data: { shops: [] } } }), true);
  const spec = { platforms: ['shopee', 'tiktok'] };
  const platformList = { responseOrder: 0, urlPath: '/market/search_basic', body: { data: { platforms: [{ platform_id: 1 }, { platform_id: 8 }] } } };
  const map = buildMetricPlatformMap([platformList], ['Shopee', 'Tiktok']);
  const gateBody = { data: { search_basic: { aggregations: [{ aggregation: 'GATE', entity: { platforms: { first: { platform_id: 1, value: 1 }, second: { platform_id: 8, value: 1 } } } }] } } };
  const search = { responseOrder: 2, urlPath: '/v2/market/analytics/search-basic/', responseStatus: 200, body: gateBody };
  const drainedProducts = { responseOrder: 3, urlPath: '/v2/market/analytics/products/', method: 'POST' };
  const failedShops = { responseOrder: 4, urlPath: '/v2/market/analytics/shops/', responseStatus: 500, responsePreview: '{"error":"synthetic"}' };
  assert.throws(() => assertSearchAppliedGate({ responses: [platformList, search, drainedProducts, failedShops], spec, baselineResponseOrder: 0, platformMap: map }), (error: any) => {
    assert.equal(error.code, 'METRIC_SEARCH_NOT_APPLIED');
    assert.deepEqual(error.details.missingResponses, ['products', 'shops']);
    assert.deepEqual(error.details.incompleteResponses, [
      { path: '/v2/market/analytics/products/', responseOrder: 3, status: null },
      { path: '/v2/market/analytics/shops/', responseOrder: 4, status: 500 },
    ]);
    return true;
  });
  const completedProducts = { responseOrder: 5, urlPath: '/v2/market/analytics/products/', responseStatus: 200, responsePreview: '{"data":{"products":[]}}' };
  const completedShops = { responseOrder: 6, urlPath: '/v2/market/analytics/shops/', body: { data: { shops: [] } } };
  const applied = assertSearchAppliedGate({ responses: [platformList, search, drainedProducts, failedShops, completedProducts, completedShops], spec, baselineResponseOrder: 0, platformMap: map });
  assert.deepEqual(applied.productsResponseOrders, [5]);
  assert.deepEqual(applied.shopsResponseOrders, [6]);
  const drainedSearch = { responseOrder: 2, urlPath: '/v2/market/analytics/search-basic/' };
  assert.throws(() => assertSearchAppliedGate({ responses: [platformList, drainedSearch, completedProducts, completedShops], spec, baselineResponseOrder: 0, platformMap: map }), (error: any) =>
    error.code === 'METRIC_SEARCH_NOT_APPLIED' && error.details.missingResponses.includes('search-basic')
    && error.details.incompleteResponses[0]?.path === '/v2/market/analytics/search-basic/');
});

test('network reads wait until in-flight Metric requests settle and stay quiet', async () => {
  const metric = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const states = [
    { inflight: 2, started: 2, settled: 0, lastSettledAt: 0, now: 1_000 },
    { inflight: 1, started: 2, settled: 1, lastSettledAt: 1_100, now: 1_200 },
    { inflight: 0, started: 2, settled: 2, lastSettledAt: 1_300, now: 1_500 },
    { inflight: 0, started: 2, settled: 2, lastSettledAt: 1_300, now: 2_400 },
  ];
  let trackerReads = 0;
  const calls: string[] = [];
  const page = {
    evaluate: async (fn: Function) => {
      if (fn.name !== 'readMetricRequestTracker') return 0;
      calls.push('tracker');
      return states[Math.min(trackerReads++, states.length - 1)];
    },
    wait: async () => { calls.push('wait'); },
    readNetworkCapture: async () => { calls.push('read'); return [{ urlPath: '/v2/market/analytics/products/', responseStatus: 200, body: { data: { products: [] } } }]; },
  };
  const state = metric.createNetworkState();
  const chunk = await metric.readNetworkChunk(page, state);
  assert.deepEqual(calls, ['tracker', 'wait', 'tracker', 'wait', 'tracker', 'wait', 'tracker', 'read']);
  assert.equal(chunk.length, 1);
  assert.deepEqual({ reads: state.idle.reads, untracked: state.idle.untracked, timeouts: state.idle.timeouts }, { reads: 1, untracked: 0, timeouts: 0 });

  const quietCalls: string[] = [];
  const neverSettled = {
    evaluate: async (fn: Function) => fn.name === 'readMetricRequestTracker' ? (quietCalls.push('tracker'), { inflight: 0, started: 0, settled: 0, lastSettledAt: 0, now: 5 }) : 0,
    wait: async () => { quietCalls.push('wait'); },
    readNetworkCapture: async () => { quietCalls.push('read'); return []; },
  };
  await metric.readNetworkChunk(neverSettled, metric.createNetworkState());
  assert.deepEqual(quietCalls, ['tracker', 'read']);

  for (const missing of [0, null, { inflight: 'x', now: 1 }]) {
    const untrackedCalls: string[] = [];
    const untrackedState = metric.createNetworkState();
    const untracked = {
      evaluate: async () => missing,
      wait: async () => { untrackedCalls.push('wait'); },
      readNetworkCapture: async () => { untrackedCalls.push('read'); return []; },
    };
    await metric.readNetworkChunk(untracked, untrackedState);
    assert.deepEqual(untrackedCalls, ['read']);
    assert.equal(untrackedState.idle.untracked, 1);
  }
});

test('a Metric request that never settles ends the idle wait at the timeout', async t => {
  const metric = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  t.mock.timers.enable({ apis: ['Date'], now: 0 });
  let waits = 0;
  const page = {
    evaluate: async (fn: Function) => fn.name === 'readMetricRequestTracker' ? { inflight: 1, started: 1, settled: 0, lastSettledAt: 0, now: Date.now() } : 0,
    wait: async ({ time }: { time: number }) => { waits += 1; t.mock.timers.tick(time * 1000); },
  };
  const state = metric.createNetworkState();
  assert.deepEqual(await metric.waitForMetricNetworkIdle(page, state), { tracked: true, idle: false, inflight: 1 });
  assert.equal(waits, 80);
  assert.equal(state.idle.timeouts, 1);
  assert.equal(state.idle.maxWaitMs, 20_000);
});

test('in-page request tracker counts only Metric API requests and leaves responses readable', async () => {
  const metric = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  class SyntheticXhr {
    listeners: Record<string, Array<() => void>> = {};
    sent = 0;
    open(_method: string, _url: string) { return undefined; }
    send(_body?: unknown) { this.sent += 1; }
    addEventListener(type: string, listener: () => void) { (this.listeners[type] ||= []).push(listener); }
    fire(type: string) { for (const listener of this.listeners[type] || []) listener(); }
  }
  let resolveFetch = () => {};
  let fetchResult: () => Promise<unknown> = () => new Promise(resolve => { resolveFetch = () => resolve(new Response('{"data":{"shops":[]}}')); });
  const syntheticWindow: any = {
    XMLHttpRequest: SyntheticXhr,
    fetch: () => fetchResult(),
  };
  const previous = (globalThis as any).window;
  (globalThis as any).window = syntheticWindow;
  try {
    assert.equal(metric.readMetricRequestTracker(), null);
    assert.deepEqual(metric.installMetricRequestTracker(), { installed: true, existing: false });
    assert.deepEqual(metric.installMetricRequestTracker(), { installed: true, existing: true });
    const api = new syntheticWindow.XMLHttpRequest();
    api.open('POST', '/v2/market/analytics/products/'); api.send('{}');
    const asset = new syntheticWindow.XMLHttpRequest();
    asset.open('GET', '/static/app.js'); asset.send();
    const pending = syntheticWindow.fetch('https://metric.vn/market/search_basic');
    assert.equal(api.sent, 1); assert.equal(asset.sent, 1);
    let state = metric.readMetricRequestTracker();
    assert.deepEqual({ inflight: state.inflight, started: state.started, settled: state.settled }, { inflight: 2, started: 2, settled: 0 });
    api.fire('loadend'); api.fire('loadend');
    state = metric.readMetricRequestTracker();
    assert.deepEqual({ inflight: state.inflight, settled: state.settled }, { inflight: 1, settled: 1 });
    assert.ok(state.lastSettledAt > 0);
    resolveFetch();
    const response = await pending;
    assert.deepEqual(await response.json(), { data: { shops: [] } });
    for (let tick = 0; tick < 20 && metric.readMetricRequestTracker().inflight; tick += 1) await new Promise(resolve => setImmediate(resolve));
    state = metric.readMetricRequestTracker();
    assert.deepEqual({ inflight: state.inflight, settled: state.settled }, { inflight: 0, settled: 2 });
    const lockedBody = { clone() { throw new TypeError('body already used'); } };
    fetchResult = () => Promise.resolve(lockedBody);
    assert.equal(await syntheticWindow.fetch('/v2/market/analytics/shops/'), lockedBody);
    state = metric.readMetricRequestTracker();
    assert.deepEqual({ inflight: state.inflight, started: state.started, settled: state.settled }, { inflight: 0, started: 3, settled: 3 });
  } finally {
    if (previous === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous;
  }
});

test('adapter parser fails closed for domain, login, captcha, filter and row cap', async () => {
  const parser = await import(parserUrl.href);
  assert.throws(() => parser.assertMetricUrl('https://example.test/'), /METRIC_UI_CHANGED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: 'Login', loginVisible: true, metricRootVisible: true }), /METRIC_LOGIN_REQUIRED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: 'captcha', captchaVisible: true, metricRootVisible: true }), /METRIC_CAPTCHA/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: 'Logged out', logoutVisible: true, metricRootVisible: true }), /METRIC_LOGIN_REQUIRED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: 'Warning', warningVisible: true, metricRootVisible: true }), /METRIC_UI_CHANGED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: '', metricRootVisible: false }), /METRIC_UI_CHANGED/);
  const spec = { keywords: ['x'], platforms: ['shopee'], period: { startDate: '2025-01-01', endDate: '2025-01-31' }, category: null };
  const observation = { ...(await load('metric-search')), appliedFilters: spec };
  assert.throws(() => parser.parseSearchObservation(observation, spec, 10), /METRIC_ROW_CAP/);
  assert.throws(() => parser.parseSearchObservation({ ...observation, appliedFilters: { ...spec, category: 'Khác' } }, spec), /METRIC_FILTER_MISMATCH/);
});

test('warning gate ignores benign alert-like UI but keeps real restrictions and dedicated auth gates', async () => {
  const { gateMetricPage } = await import(parserUrl.href);
  const base = {
    url: 'https://metric.vn/analytics', bodyText: '', warningText: '', warningVisible: false, metricRootVisible: true,
  };
  assert.doesNotThrow(() => gateMetricPage({ ...base, bodyText: 'Metric information banner and notification badge' }));
  assert.doesNotThrow(() => gateMetricPage({ ...base, warningMatches: [{ via: 'selector', tag: 'span', role: 'alert', classSample: 'ant-alert-info icon-alert', text: 'Information' }] }));
  assert.throws(() => gateMetricPage({ ...base, warningVisible: true }), /METRIC_UI_CHANGED/);
  assert.throws(() => gateMetricPage({ ...base, warningText: 'Lookup limit reached' }), /METRIC_UI_CHANGED/);
  assert.throws(() => gateMetricPage({ ...base, captchaVisible: true }), /METRIC_CAPTCHA/);
  assert.throws(() => gateMetricPage({ ...base, loginVisible: true }), /METRIC_LOGIN_REQUIRED/);
});

test('restriction gate fails closed for Vietnamese, reordered, normalized and English restriction phrases', async () => {
  const { gateMetricPage } = await import(parserUrl.href);
  const base = { url: 'https://metric.vn/analytics', bodyText: '', warningVisible: false, metricRootVisible: true };
  const phrases = [
    'Quyền truy cập bị từ chối',
    'bị từ chối — truy cập quyền',
    'Bạn đã đạt giới hạn lượt phân tích',
    'lượt phân tích đã vượt quá giới hạn',
    'hết lượt phân tích',
    'Phiên đăng nhập đã hết hạn',
    'hết hạn, phiên đăng nhập',
    'hết phiên',
    'tài khoản bị khóa',
    'tạm khóa tài khoản',
    'không có quyền',
    'quyền không có',
    'tạm thời không khả dụng',
    'access denied',
    'unauthorized',
    'forbidden',
    'blocked',
    'limit reached',
    'limit exceeded',
    'reached limit',
    'exceeded limit',
    'session expired',
    'suspended',
  ];
  for (const phrase of phrases) {
    assert.throws(() => gateMetricPage({ ...base, warningText: phrase }), /METRIC_UI_CHANGED/, phrase);
  }
  assert.throws(() => gateMetricPage({ ...base, warningText: '  QUYỀN\nTRUY   CẬP bị từ chối  ' }), /METRIC_UI_CHANGED/);
  assert.throws(() => gateMetricPage({ ...base, warningText: 'quyen truy cap bi tu choi' }), /METRIC_UI_CHANGED/);
  assert.throws(() => gateMetricPage({ ...base, warningText: 'Warning' }), /METRIC_UI_CHANGED/);
  assert.throws(() => gateMetricPage({ ...base, warningText: 'cảnh báo' }), /METRIC_UI_CHANGED/);
});

test('warning gate keeps the observed benign title announcer, info/success alerts, icons and badges', async () => {
  const { gateMetricPage } = await import(parserUrl.href);
  const base = { url: 'https://metric.vn/analytics', bodyText: '', warningVisible: false, metricRootVisible: true };
  assert.doesNotThrow(() => gateMetricPage({ ...base, title: 'Metric analytics', warningMatches: [
    { via: 'selector', tag: 'div', role: 'alert', classSample: '', text: 'Metric', reason: 'title-announcer' },
  ] }));
  assert.doesNotThrow(() => gateMetricPage({ ...base, warningMatches: [
    { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-info', text: null, reason: 'info-alert' },
    { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-success', text: null, reason: 'success-alert' },
  ] }));
  assert.doesNotThrow(() => gateMetricPage({ ...base, warningMatches: [
    { via: 'selector', tag: 'span', role: null, classSample: 'icon-alert', text: null, reason: 'icon-or-badge' },
    { via: 'selector', tag: 'span', role: null, classSample: 'notification-badge', text: null, reason: 'icon-or-badge' },
  ] }));
  assert.doesNotThrow(() => gateMetricPage({ ...base, warningMatches: [
    { via: 'selector', tag: 'div', role: 'alert', classSample: '', text: null, reason: 'title-announcer' },
  ] }));
  assert.throws(() => gateMetricPage({ ...base, warningMatches: [
    { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-warning', text: null, reason: 'warning-class' },
  ] }), /METRIC_UI_CHANGED/);
  assert.throws(() => gateMetricPage({ ...base, warningMatches: [
    { via: 'selector', tag: 'div', role: 'alert', classSample: '', text: 'Unexpected alert', reason: 'alert-role' },
  ] }), /METRIC_UI_CHANGED/);
});

test('warning gate treats warning/error icons and badges as benign but keeps alert containers fail-closed', async () => {
  const { gateMetricPage } = await import(parserUrl.href);
  const base = { url: 'https://metric.vn/analytics', bodyText: '', warningVisible: false, metricRootVisible: true };
  for (const match of [
    { via: 'selector', tag: 'span', role: null, classSample: 'warning-icon', text: null, reason: 'icon-or-badge' },
    { via: 'selector', tag: 'span', role: null, classSample: 'error-badge', text: null, reason: 'icon-or-badge' },
    { via: 'selector', tag: 'span', role: null, classSample: 'warning-icon', text: null },
    { via: 'selector', tag: 'span', role: null, classSample: 'error-badge', text: null },
    { via: 'selector', tag: 'span', role: null, classSample: 'anticon anticon-warning', text: null },
    { via: 'selector', tag: 'svg', role: null, classSample: 'error', text: null },
  ]) {
    assert.doesNotThrow(() => gateMetricPage({ ...base, warningMatches: [match] }), JSON.stringify(match));
  }
  for (const match of [
    { via: 'selector', tag: 'div', role: null, classSample: 'ant-alert ant-alert-warning', text: null },
    { via: 'selector', tag: 'div', role: null, classSample: 'ant-alert ant-alert-error', text: null },
    { via: 'selector', tag: 'div', role: null, classSample: 'ant-alert ant-alert-warning ant-alert-no-icon', text: null },
    { via: 'selector', tag: 'span', role: 'alert', classSample: 'warning-icon', text: null },
    { via: 'selector', tag: 'div', role: null, classSample: 'warning-box', text: null },
    { via: 'selector', tag: 'span', role: null, classSample: 'error-badge', text: 'Hết lượt phân tích' },
    { via: 'selector', tag: 'span', role: null, classSample: 'error-badge', text: 'Hết lượt phân tích', reason: 'icon-or-badge' },
    { via: 'selector', tag: 'div', role: null, classSample: 'ant-alert-warning icon', text: null, reason: 'icon-or-badge' },
    { via: 'selector', tag: 'div', role: 'alert', classSample: 'warning-icon', text: null, reason: 'icon-or-badge' },
    { via: 'selector', tag: 'div', role: null, classSample: 'warning-box', text: null, reason: 'icon-or-badge' },
  ]) {
    assert.throws(() => gateMetricPage({ ...base, warningMatches: [match] }), /METRIC_UI_CHANGED/, JSON.stringify(match));
  }
});

test('page warning observation classifies warning/error icons and badges as benign', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const observe = (html: string) => {
    const dom = new JSDOM(`<!doctype html><html><head><title>Metric analytics</title></head><body><main id="main-content"><div id="analytic-tab">${html}</div></main></body></html>`, { url: 'https://metric.vn/analytics' });
    const previous = { document: (globalThis as any).document, location: (globalThis as any).location, window: (globalThis as any).window, getComputedStyle: (globalThis as any).getComputedStyle };
    (globalThis as any).document = dom.window.document;
    (globalThis as any).location = dom.window.location;
    (globalThis as any).window = dom.window;
    (globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    dom.window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}) });
    try {
      return adapter.observeMetricPage(false);
    } finally {
      if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
      if (previous.location === undefined) delete (globalThis as any).location; else (globalThis as any).location = previous.location;
      if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
      if (previous.getComputedStyle === undefined) delete (globalThis as any).getComputedStyle; else (globalThis as any).getComputedStyle = previous.getComputedStyle;
      dom.window.close();
    }
  };
  const benign = observe('<div class="ant-alert ant-alert-info"><span class="warning-icon">!</span><span class="error-badge">3</span><i class="anticon anticon-warning"></i><svg class="error-dot"></svg><i class="material-icons">warning</i><div role="alert">Metric</div></div>');
  assert.equal(benign.warningVisible, false, JSON.stringify(benign.warningMatches));
  assert.ok(benign.warningMatches.some((match: any) => match.reason === 'icon-or-badge'));
  assert.ok(benign.warningMatches.filter((match: any) => match.reason === 'icon-or-badge').every((match: any) => match.text === null));
  for (const html of [
    '<div class="ant-alert ant-alert-warning ant-alert-no-icon" role="alert"><span class="anticon ant-alert-icon"></span>unrelated</div>',
    '<div class="ant-alert ant-alert-error"><span class="anticon ant-alert-icon"></span>unrelated</div>',
    '<div role="alert" class="ant-alert-error">Hết lượt phân tích</div>',
  ]) {
    assert.equal(observe(html).warningVisible, true, html);
  }
});

test('page warning observation is scoped, classified and identity-safe', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const { gateMetricPage } = await import(parserUrl.href);
  const ordinaryCopy = withMetricDom('<nav>Plan feature: access denied is described here.</nav><footer title="tooltip">Limit reached is only footer copy.</footer>', () => adapter.observeMetricPage(false));
  assert.equal(ordinaryCopy.warningVisible, false);
  assert.doesNotThrow(() => gateMetricPage(ordinaryCopy));
  const dom = new JSDOM(`<!doctype html><html><head><title>Metric analytics</title></head><body>
    <header id="header"><div role="alert" class="header-alert">Nguyễn Văn A nguyen.van.a@example.test +84901234567</div></header>
    <nav>Plan feature copy: limit reached is described here; menu tooltip: access denied is not an error.</nav>
    <footer>Footer copy may mention access denied without representing a live alert.</footer>
    <main id="main-content"><div id="analytic-tab">
      <div role="alert" class="ant-alert-warning">access denied for nguyen.van.a@example.test +84901234567</div>
      <div role="alert" class="ant-alert-error">unrelated error</div>
      <div role="alert" class="ant-alert-info">Information</div>
      <div role="alert">Unexpected alert</div>
      <div role="alert">Metric</div>
      <span class="icon-alert">icon</span><span class="notification-badge">badge</span>
      <div>cảnh báo</div>
    </div></main>
  </body></html>`, { url: 'https://metric.vn/analytics' });
  const previous = { document: (globalThis as any).document, location: (globalThis as any).location, window: (globalThis as any).window, getComputedStyle: (globalThis as any).getComputedStyle };
  (globalThis as any).document = dom.window.document;
  (globalThis as any).location = dom.window.location;
  (globalThis as any).window = dom.window;
  (globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  dom.window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 20, width: 100, height: 20, toJSON: () => ({}) });
  try {
    const observation = adapter.observeMetricPage(false);
    assert.equal(observation.warningVisible, true);
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'warning-class'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'error-class'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'alert-role'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'title-announcer'));
    assert.equal(observation.warningMatches.some((match: any) => match.reason === 'bare-warning-text'), false);
    const restriction = observation.warningMatches.find((match: any) => match.reason === 'warning-class');
    assert.equal(restriction.phrase, 'access denied');
    assert.equal(restriction.tag, 'div');
    assert.equal(restriction.role, 'alert');
    const serialized = JSON.stringify(observation.warningMatches);
    assert.doesNotMatch(serialized, /Nguyễn Văn A|nguyen\.van\.a@example\.test|84901234567/);
    for (const match of observation.warningMatches) {
      assert.ok(match.text === null || match.text.length <= 80);
    }
    assert.equal(observation.warningMatches.filter((match: any) => match.classSample.includes('header-alert')).length, 1);
    assert.equal(observation.warningMatches.find((match: any) => match.classSample.includes('header-alert'))?.reason, 'alert-role');
  } finally {
    if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
    if (previous.location === undefined) delete (globalThis as any).location; else (globalThis as any).location = previous.location;
    if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
    if (previous.getComputedStyle === undefined) delete (globalThis as any).getComputedStyle; else (globalThis as any).getComputedStyle = previous.getComputedStyle;
    dom.window.close();
  }
});

test('semantic header restrictions trip the gate while non-semantic warning classes do not', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const { gateMetricPage } = await import(parserUrl.href);
  const classOnly = withMetricDom('<header class="account-area"><div class="ks-warning-panel">Account panel</div></header>', () => adapter.observeMetricPage(false));
  assert.equal(classOnly.warningVisible, false);
  assert.doesNotThrow(() => gateMetricPage(classOnly));
  const headerAlert = withMetricDom('<header class="account-area"><div role="alert">Access denied</div></header>', () => adapter.observeMetricPage(false));
  assert.equal(headerAlert.warningVisible, true);
  assert.ok(headerAlert.warningMatches.some((match: any) => match.role === 'alert'));
  assert.throws(() => gateMetricPage(headerAlert), /METRIC_UI_CHANGED/);
});

test('whoami maps only displayed synthetic quota fields', async () => {
  const { parseWhoamiObservation } = await import(parserUrl.href);
  assert.deepEqual(parseWhoamiObservation(await load('metric-whoami')), {
    status: 'READY', plan: 'synthetic', analysisLookupsRemaining: 456,
  });
});

test('whoami preserves an unavailable quota and rejects an unclassified session', async () => {
  const { parseWhoamiObservation } = await import(parserUrl.href);
  const observation = { ...(await load('metric-whoami')), accountState: 'logged_in', quota: {} };
  assert.deepEqual(parseWhoamiObservation(observation), {
    status: 'READY', plan: 'synthetic', analysisLookupsRemaining: null,
  });
  assert.throws(() => parseWhoamiObservation({ ...observation, accountState: 'unknown' }), /METRIC_LOGIN_REQUIRED/);
});

test('adapter rejects missing page state and missing filter fields, while accepting the Metric subdomain', async () => {
  const parser = await import(parserUrl.href);
  assert.equal(parser.assertMetricUrl('https://www.metric.vn/analytics').hostname, 'www.metric.vn');
  assert.throws(() => parser.assertMetricUrl('https://metric.vn.evil.test/analytics'), /METRIC_UI_CHANGED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: '' }), /METRIC_UI_CHANGED/);
  const spec = { keywords: ['x'], platforms: ['shopee'], period: { startDate: '2025-01-01', endDate: '2025-01-31' }, category: null };
  const observation = await load('metric-search');
  assert.throws(() => parser.parseSearchObservation({ ...observation, appliedFilters: { ...spec, category: undefined } }, spec), /METRIC_FILTER_MISMATCH/);
  assert.throws(() => parser.parseSearchObservation({ ...observation, appliedFilters: { keywords: spec.keywords, platforms: spec.platforms, period: spec.period } }, spec), /METRIC_FILTER_MISMATCH/);
  assert.throws(() => parser.parseSearchObservation({ ...observation, url: 'https://other.test/analytics', appliedFilters: spec }, spec), /METRIC_UI_CHANGED/);
});

async function installOpenCliTestStub(): Promise<void> {
  const root = join(process.cwd(), 'node_modules', '@jackwener', 'opencli');
  try { await access(join(root, 'package.json')); return; } catch { /* test stub is needed */ }
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module', exports: { './registry': './registry.js', './errors': './errors.js' } }));
  await writeFile(join(root, 'registry.js'), 'export const Strategy = Object.freeze({ UI: "ui" }); export function cli(options) { return options; }\n');
  await writeFile(join(root, 'errors.js'), 'export class CliError extends Error { constructor(code, message) { super(message); this.code = code; } }\n');
}

function withMetricDom<T>(html: string, callback: () => T): T {
  const dom = new JSDOM(`<!doctype html><html><head><title>Metric analytics</title></head><body><main id="main-content"><div id="analytic-tab">${html}</div></main></body></html>`, { url: 'https://metric.vn/analytics' });
  const previous = {
    document: (globalThis as any).document,
    location: (globalThis as any).location,
    window: (globalThis as any).window,
    CSS: (globalThis as any).CSS,
    getComputedStyle: (globalThis as any).getComputedStyle,
  };
  (globalThis as any).document = dom.window.document;
  (globalThis as any).location = dom.window.location;
  (globalThis as any).window = dom.window;
  (globalThis as any).CSS = dom.window.CSS;
  (globalThis as any).getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
  dom.window.Element.prototype.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 100, right: 320, bottom: 132, width: 320, height: 32, toJSON: () => ({}) });
  try {
    return callback();
  } finally {
    if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
    if (previous.location === undefined) delete (globalThis as any).location; else (globalThis as any).location = previous.location;
    if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
    if (previous.CSS === undefined) delete (globalThis as any).CSS; else (globalThis as any).CSS = previous.CSS;
    if (previous.getComputedStyle === undefined) delete (globalThis as any).getComputedStyle; else (globalThis as any).getComputedStyle = previous.getComputedStyle;
    dom.window.close();
  }
}

test('keyword locator follows the labelled select after a multi-platform re-render', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `
    <div id="QuerySearchBuilder">
      <div class="ant-space-item"><div class="filter-label"><span class="label">Platform</span></div><div class="ant-select"><input id="platform-input" /></div></div>
      <div class="ant-space-item"><div class="filter-label"><span class="label">Keywords (keywords or shop link/product link)</span></div>
        <div class="ant-select ant-select-multiple"><div class="ant-select-selector"><div class="ant-select-selection-overflow"><div class="ant-select-selection-overflow-item"><span class="ant-tag ks-chip">thạch dừa<span class="ant-tag-close-icon">×</span></span></div><div class="ant-select-selection-overflow-item ant-select-selection-overflow-item-suffix"><input id="rc_select_14" /></div></div></div></div>
      </div>
      <div class="ant-select"><input id="rc_select_4" value="wrong-control" /></div>
    </div>`;
  const observation = withMetricDom(html, () => adapter.observeMetricPage(false));
  assert.equal(observation.controls.find((control: any) => control.name === 'keywords').selector, '#rc_select_14');
  assert.deepEqual(observation.appliedFilters.keywords, ['thạch dừa']);
  assert.deepEqual(withMetricDom(html, () => adapter.readCommittedKeywords()), ['thạch dừa']);
});

test('keyword locator uses an input-only placeholder and Vietnamese labels', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const placeholderHtml = `<div id="QuerySearchBuilder"><div class="ant-select ant-select-multiple"><input id="keyword-placeholder" placeholder="Enter keywords separated by commas" value="placeholder-term" /></div><div class="ant-select ant-select-multiple"><input id="unrelated-multiple" /></div></div>`;
  const placeholderObservation = withMetricDom(placeholderHtml, () => adapter.observeMetricPage(false));
  assert.equal(placeholderObservation.controls.find((control: any) => control.name === 'keywords').selector, '#keyword-placeholder');
  assert.deepEqual(placeholderObservation.appliedFilters.keywords, ['placeholder-term']);
  const vietnameseHtml = `<div id="QuerySearchBuilder"><div class="ant-space-item"><div class="filter-label"><span class="label">Từ khóa</span></div><div class="ant-select ant-select-multiple"><input id="keyword-vietnamese" value="từ khóa mẫu" /></div></div><div class="ant-select ant-select-multiple"><input id="unrelated-vietnamese-multiple" /></div></div>`;
  const vietnameseObservation = withMetricDom(vietnameseHtml, () => adapter.observeMetricPage(false));
  assert.equal(vietnameseObservation.controls.find((control: any) => control.name === 'keywords').selector, '#keyword-vietnamese');
  assert.deepEqual(withMetricDom(vietnameseHtml, () => adapter.readCommittedKeywords()), []);
});

test('live platform chips are not observed as keywords when the keyword control is empty', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-live-form-states');
  const observation = withMetricDom(fixture.singlePlatformKeywordEmpty, () => adapter.observeMetricPage(false));
  assert.deepEqual(observation.appliedFilters.platforms, ['shopee']);
  assert.deepEqual(observation.appliedFilters.keywords, []);
  assert.deepEqual(withMetricDom(fixture.singlePlatformKeywordEmpty, () => adapter.readCommittedKeywords()), []);
});

test('live multiple-platform form keeps a stale keyword in the keyword control only', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-live-form-states');
  const observation = withMetricDom(fixture.multiplePlatformStaleKeyword, () => adapter.observeMetricPage(false));
  assert.deepEqual(observation.appliedFilters.platforms, ['shopee', 'tiktok']);
  assert.deepEqual(observation.appliedFilters.keywords, ['synthetic-stale-keyword']);
  assert.deepEqual(withMetricDom(fixture.multiplePlatformStaleKeyword, () => adapter.readCommittedKeywords()), ['synthetic-stale-keyword']);
});

test('stale keyword removal on the live multiple-platform shape uses the keyword close icon', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-live-form-states');
  const calls: string[] = [];
  const page: any = {
    evaluate: async (fn: Function, argument?: unknown) => {
      if (fn.toString().includes('document.activeElement === input')) return true;
      return withMetricDom(fixture.multiplePlatformStaleKeyword, () => fn(argument));
    },
    click: async (selector: string) => calls.push(`click:${selector}`),
    fillText: async (selector: string, value: string) => calls.push(`fill:${selector}:${value}`),
    cdp: async (method: string, params: any) => calls.push(`cdp:${method}:${params.key}`),
    pressKey: async (key: string) => calls.push(`key:${key}`),
  };
  const spec = { keywords: ['synthetic-current-keyword'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: ['synthetic-stale-keyword'], platforms: ['shopee', 'tiktok'], period: spec.period, category: null } };
  await adapter.applyMetricSpec(page, spec, initial);
  assert.ok(calls.some((call: string) => call.includes('#synthetic-keyword-stale') && call.includes('.ant-tag-close-icon')));
  assert.ok(calls.includes('fill:#synthetic-keyword-stale:synthetic-current-keyword'));
});

test('uncommitted keyword input text is never read back as a committed chip', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `
    <div id="QuerySearchBuilder">
      <div class="ant-space-item"><div class="filter-label"><span class="label">Keywords (keywords or shop link/product link)</span></div>
        <div class="ant-select ant-select-multiple"><div class="ant-select-selector"><div class="ant-select-selection-overflow"><div class="ant-select-selection-overflow-item ant-select-selection-overflow-item-suffix"><input id="rc_select_4" value="thạch dừa" /></div></div></div></div>
      </div>
    </div>`;
  assert.deepEqual(withMetricDom(html, () => adapter.readCommittedKeywords()), []);
  let attempts = 0;
  const page = {
    evaluate: async (fn: Function, argument?: unknown) => { attempts += 1; return withMetricDom(html, () => fn(argument)); },
    wait: async () => {},
  };
  await assert.rejects(adapter.waitForKeywordCommit(page, ['thạch dừa']), (error: any) => /METRIC_FILTER_MISMATCH/.test(String(error?.code || error?.message)));
  assert.ok(attempts > 1);
});

test('keyword fill fails before fillText when no keyword select exists', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder"><div class="ant-space-item"><div class="filter-label"><span class="label">Platform</span></div><div class="ant-select"><input id="platform-input" /></div></div></div>`;
  let fillCalls = 0;
  const page = {
    evaluate: async (fn: Function, argument?: unknown) => withMetricDom(html, () => fn(argument)),
    click: async () => {},
    pressKey: async () => {},
    fillText: async () => { fillCalls += 1; },
  };
  const spec = { keywords: ['missing-control-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.equal(fillCalls, 0);
});

test('multi-platform keyword precheck fails before any platform typing', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder"><div class="ant-space-item"><div class="filter-label"><span class="label">Platform</span></div><div class="ant-select ant-select-multiple"><input id="platform-multi-input" /></div></div></div>`;
  let fillCalls = 0;
  let keyCalls = 0;
  const page = {
    evaluate: async (fn: Function, argument?: unknown) => withMetricDom(html, () => fn(argument)),
    click: async () => {},
    pressKey: async () => { keyCalls += 1; },
    fillText: async () => { fillCalls += 1; },
  };
  const spec = { keywords: ['missing-control-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.equal(fillCalls, 0);
  assert.equal(keyCalls, 0);
});

test('ambiguous multiple-select structure is not treated as the keyword control', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder"><div class="ant-select ant-select-multiple"><input id="candidate-one" /></div><div class="ant-select ant-select-multiple"><input id="candidate-two" /></div></div>`;
  const observation = withMetricDom(html, () => adapter.observeMetricPage(false));
  assert.equal(observation.controls.find((control: any) => control.name === 'keywords').visible, false);
  assert.deepEqual(withMetricDom(html, () => adapter.readCommittedKeywords()), []);
});

test('keyword commit mismatch has only safe diagnostics and preserves them in CLI errors', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = {
    evaluate: async (fn: Function) => fn.name === 'readCommittedKeywords' ? [] : ({
      locatedBy: 'label', chipCount: 0, inputFound: true,
      inputValueMatchesExpected: false, committedMatchesExpected: false,
      secretId: 'must-not-survive', pageText: 'must-not-survive',
    }),
    wait: async () => {},
  };
  let originalError: any;
  await assert.rejects(() => adapter.waitForKeywordCommit(page, ['expected-term']), (error: any) => {
    originalError = error;
    assert.deepEqual(Object.keys(error.details).sort(), ['chipCount', 'committedMatchesExpected', 'inputFound', 'inputValueMatchesExpected', 'locatedBy']);
    assert.deepEqual(error.details, { locatedBy: 'label', chipCount: 0, inputFound: true, inputValueMatchesExpected: false, committedMatchesExpected: false });
    return true;
  });
  const cliError = adapter.asCliError(originalError);
  assert.deepEqual(cliError.details, originalError.details);
  assert.match(cliError.message, /details=\{"locatedBy":"label","chipCount":0,"inputFound":true,"inputValueMatchesExpected":false,"committedMatchesExpected":false\}/);
});

test('diagnostics are opt-in and identity-safe for warning matches', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const observation = {
    url: 'https://metric.vn/analytics', bodyText: '', metricRootVisible: true,
    warningVisible: true, warningMatches: [
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'header account-alert', text: 'Nguyễn Văn A nguyen.van.a@example.test +84901234567 20261012', reason: 'alert-role' },
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-info', text: 'Nguyễn Văn A', reason: 'info-alert' },
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-warning', phrase: 'access denied', text: 'access denied for nguyen.van.a@example.test +84901234567 on 20261012', reason: 'warning-class' },
    ],
  };
  const page = { wait: async () => {}, evaluate: async () => observation };
  await assert.rejects(() => adapter.readObservation(page, { includeResults: false }), (error: any) => {
    assert.deepEqual(error.details.warningMatches, [
      { via: 'selector', tag: 'div', elementKind: 'div', role: 'alert', classSample: 'ant-alert-info', reason: 'info-alert', phrase: null, text: null },
      { via: 'selector', tag: 'div', elementKind: 'div', role: 'alert', classSample: 'ant-alert-warning', reason: 'warning-class', phrase: 'access denied', text: 'access denied' },
    ]);
    assert.doesNotMatch(error.message, /warningMatches|nguyen\.van\.a|Nguyễn Văn A|84901234567|20261012/);
    return true;
  });
  await assert.rejects(() => adapter.readObservation(page, { includeResults: false, diagnose: true }), (error: any) => {
    const serialized = JSON.stringify(error.details);
    assert.doesNotMatch(serialized, /nguyen\.van\.a@example\.test|84901234567|20261012|Nguyễn Văn A/);
    assert.deepEqual(error.details.warningMatches, [
      { via: 'selector', tag: 'div', elementKind: 'div', role: 'alert', classSample: 'ant-alert-info', reason: 'info-alert', phrase: null, text: null },
      { via: 'selector', tag: 'div', elementKind: 'div', role: 'alert', classSample: 'ant-alert-warning', reason: 'warning-class', phrase: 'access denied', text: 'access denied' },
    ]);
    return true;
  });
});

const commandSpec = {
  keywords: ['synthetic-keyword'], platforms: ['shopee', 'tiktok'],
  period: { startDate: '2025-09-15', endDate: '2026-09-20' }, category: null,
};

const syntheticSearchGateResponses = [
  { urlPath: '/market/search_basic', body: { data: { platforms: [{ platform_id: 1 }, { platform_id: 2 }, { platform_id: 3 }, { platform_id: 8 }] } } },
  { urlPath: '/v2/market/analytics/search-basic/', body: { data: { search_basic: { aggregations: [{ aggregation: 'GATE', entity: { platforms: { shopee: { platform_id: 1, value: 1 }, tiktok: { platform_id: 8, value: 1 } } } }] } } } },
  { urlPath: '/v2/market/analytics/products/', body: { data: { products: [] } } },
  { urlPath: '/v2/market/analytics/shops/', body: { data: { shops: [] } } },
];

function gateResponsesFor(platforms: string[]) {
  const ids = platforms.includes('tiktok') ? [1, 8] : [1];
  return syntheticSearchGateResponses.map(response => response.urlPath === '/v2/market/analytics/search-basic/'
    ? { ...response, body: { data: { search_basic: { aggregations: [{ aggregation: 'GATE', entity: { platforms: Object.fromEntries(ids.map((id, index) => [String(index), { platform_id: id, value: index + 1 }])) } }] } } } }
    : response);
}

function fakePage(observation: any, result: any, resultDom: any = null, networkResponses: any[] = [], behavior: any = {}) {
  let searched = false;
  let networkReadCount = 0;
  const state = { paginationClicks: 0, platformSwitches: 0, formReads: 0 };
  const calls: string[] = [];
  const clickRecords: Array<{ selector: string; options?: any }> = [];
  const screenshotCalls: any[] = [];
  const maskCalls: string[] = [];
  const page: any = {
    calls,
    clickRecords,
    screenshotCalls,
    maskCalls,
    newTab: async () => 'synthetic-tab',
    selectTab: async (target: string) => calls.push(`select:${target}`),
    closeTab: async (target: string) => calls.push(`close:${target}`),
    wait: async () => {},
    evaluate: async (fn: Function, arg?: unknown) => {
      if (fn.name === 'observeMetricPage') {
        if (arg === false) {
          state.formReads = (state.formReads || 0) + 1;
          if (behavior.gateObservation) return behavior.gateObservation(state, observation);
          return state.formReads > 1 && result?.appliedFilters ? { ...observation, appliedFilters: result.appliedFilters } : observation;
        }
        if (behavior.searchObservation) return behavior.searchObservation(state, result);
        return result;
      }
      if (fn.name === 'readCommittedKeywords') return commandSpec.keywords;
      if (fn.name === 'resolveKeywordSelector') return { inputSelector: '#keyword-input', selectSelector: '#keyword-selector' };
      if (fn.name === 'resolvePlatformSelector') return behavior.platformSelector || {
        inputSelector: '#platform-input', rootSelector: '#QuerySearchBuilder .ant-select:has(#platform-input)',
        selectSelector: '#QuerySearchBuilder .ant-select:has(#platform-input) > .ant-select-selector', isMultiple: true,
      };
      if (fn.name === 'describeSearchSubmit') return behavior.submitInspection || {
        candidateCount: 1,
        descriptor: { candidateIndex: 0, tag: 'button', classes: 'ant-btn ant-btn-primary', text: 'Analytics', domPath: 'button:nth-child(1)', clickSelector: '#QuerySearchBuilder button:nth-child(1)' },
        candidates: [{ candidateIndex: 0, tag: 'button', classes: 'ant-btn ant-btn-primary', text: 'Analytics', domPath: 'button:nth-child(1)', clickSelector: '#QuerySearchBuilder button:nth-child(1)' }],
        pageWideAnalyticsCount: 2,
      };
      if (fn.name === 'platformRemoveIndex') return behavior.platformRemoveIndex ?? null;
      if (fn.toString().includes('button.switch-button')) return behavior.platformMode || 'Multiple platforms';
      if (fn.toString().includes('optionIndex')) {
        if (behavior.missingOption === (arg as any)?.label) return null;
        if (behavior.selectedOption === (arg as any)?.label) return -1;
        return behavior.optionIndex ?? 0;
      }
      if (fn.name === 'readMetricSelectOptionLabels') return ['Shopee', 'Lazada', 'Tiki', 'Tiktok'];
      if (fn.toString().includes('document.activeElement === input')) return true;
      if (fn.name === 'observeResultPage') return behavior.resultDom ? behavior.resultDom(state, resultDom) : resultDom || { html: '<html></html>', regions: {}, screenshotRegions: {}, platformViews: [] };
      if (fn.name === 'prepareScreenshotClip') { maskCalls.push('prepare'); return behavior.screenshotClip ? behavior.screenshotClip(state) : { clip: { x: 12, y: 24, width: 320, height: 180 }, maskedCount: 1 }; }
      if (!fn.name && fn.toString().includes('getBoundingClientRect') && fn.toString().includes('querySelector(selector)')) return true;
      if (fn.name === 'restoreScreenshotMask') { maskCalls.push('restore'); return true; }
      if (fn.name === 'setCheckbox') return { selector: '#synthetic', index: 0 };
      if (fn.name === 'visibleOptionIndex' || fn.name === 'clickVisibleText') return 0;
      if (fn.name === 'repairMetricFunctionDefaults') {
        if (behavior.pageRepair === undefined) return 0;
        calls.push('page-repair');
        return behavior.pageRepair;
      }
      return 0;
    },
    click: async (selector: string, options?: any) => {
      calls.push(`click:${selector}`);
      clickRecords.push({ selector, options });
      if (selector === 'button,[role="button"]' || (typeof selector === 'string' && selector.includes('#QuerySearchBuilder') && selector.includes('button'))) searched = true;
      if (selector === 'next' || (typeof selector === 'string' && (selector.includes('ant-pagination-next') || selector.includes('Next Page')))) state.paginationClicks += 1;
      if (typeof selector === 'string' && (selector.includes('data-metric-platform') || selector.includes('data-platform-view') || selector === 'platform-view')) state.platformSwitches += 1;
      behavior.onClick?.(selector, state, options);
      return { matches_n: 1, match_level: 'exact', click_method: 'cdp', hit: 'target', retargeted: false };
    },
    fillText: async (selector: string, text: string) => calls.push(`fill:${selector}:${text}`),
    cdp: async (method: string, params: any) => calls.push(`cdp:${method}:${params.type}:${params.key}:${params.code}:${params.windowsVirtualKeyCode}:${params.nativeVirtualKeyCode}:${params.text}`),
    pressKey: async (key: string) => calls.push(`key:${key}`),
    startNetworkCapture: async () => { calls.push('network:start'); },
    readNetworkCapture: async () => {
      networkReadCount += 1;
      if (!searched && state.paginationClicks > 0) return [{ urlPath: '/v2/market/analytics/products/', body: { data: { products: [] } } }];
      if (!searched) return behavior.initialNetworkResponses || [{ urlPath: '/market/search_basic', body: { data: { platforms: [{ platform_id: 1 }, { platform_id: 2 }, { platform_id: 3 }, { platform_id: 8 }] } } }];
      if (networkReadCount === 2) return networkResponses;
      if (state.paginationClicks > 0 && networkReadCount === 3) return [{ urlPath: '/v2/market/analytics/products/', body: { data: { products: [] } } }];
      return behavior.networkResponsesAfterSearch || [];
    },
    screenshot: async (options: any) => { screenshotCalls.push(options); await writeFile(options.path, Buffer.from('synthetic-png')); },
    get searched() { return searched; },
  };
  return page;
}

test('whoami, search, and capture commands use a fake page and clean up their owned tab', async () => {
  await installOpenCliTestStub();
  const adapterUrl = new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url);
  const adapter: any = await import(adapterUrl.href);
  const observation = await load('metric-whoami');
  const searchObservation = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const whoami = await adapter.whoamiCommand.func(fakePage(observation, searchObservation));
  assert.equal(whoami[0].status, 'READY');
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-adapter-'));
  const specPath = join(directory, 'spec.json'); const snapshotPath = join(directory, 'snapshot.json');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, searchObservation, null, gateResponsesFor(commandSpec.platforms));
  const searched = await adapter.searchCommand.func(page, { spec: specPath, out: snapshotPath });
  assert.equal(searched[0].status, 'READY'); assert.equal(page.searched, true); assert.ok(page.calls.includes('close:synthetic-tab'));
  const captureDir = join(directory, 'capture');
  const results = await load('metric-results-response');
  const dom = { ...(await load('metric-results-dom')), html: '<html><body>synthetic results</body></html>', screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [] };
  const captured = await adapter.captureCommand.func(fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, searchObservation, dom, [...gateResponsesFor(commandSpec.platforms), ...results.responses]), { spec: specPath, out: captureDir, 'product-cap': 200 });
  assert.equal(captured[0].status, 'READY'); assert.match(await readFile(join(captureDir, 'manifest.json'), 'utf8'), /synthetic-keyword/);
  assert.match(await readFile(join(captureDir, 'snapshot.json'), 'utf8'), /Synthetic item A/);
  assert.ok(await readFile(join(captureDir, 'platform-all-region-overview.png')));
  await rm(directory, { recursive: true, force: true });
});

test('replay rebuilds an archive from saved debug input without touching the supplied page', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-replay-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture'); const replayDir = join(directory, 'replay');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const fixture = await load('metric-results-response');
  const dom = { ...(await load('metric-results-dom')), html: '<html><body><main>synthetic results</main></body></html>', screenshotRegions: { overview: '#synthetic-overview' } };
  await adapter.captureCommand.func(fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, result, dom, [...gateResponsesFor(commandSpec.platforms), ...fixture.responses]), { spec: specPath, out: captureDir, 'product-cap': 200 });
  const calls: string[] = [];
  const replayed = await adapter.captureCommand.func({ click: async () => calls.push('click'), evaluate: async () => calls.push('evaluate') }, { spec: specPath, replay: join(captureDir, 'debug'), out: replayDir, 'product-cap': 200 });
  assert.equal(replayed[0].replay, true);
  assert.equal(calls.length, 0);
  assert.match(await readFile(join(replayDir, 'snapshot.json'), 'utf8'), /Synthetic item A/);
  // Only the live capture is cleared as a run's sales source; the app refuses the replay archive.
  assert.deepEqual(JSON.parse(await readFile(join(captureDir, 'manifest.json'), 'utf8')).captureGate, { cleared: true });
  assert.deepEqual(JSON.parse(await readFile(join(replayDir, 'manifest.json'), 'utf8')).captureGate, { cleared: false, status: 'REPLAY' });
  await rm(directory, { recursive: true, force: true });
});

test('capture dry-run returns a matching read-back without reaching submit or search click', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-dry-run-'));
  const specPath = join(directory, 'spec.json');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form');
  let readCount = 0;
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, {}, null, [], {
    gateObservation: (_state: any, observation: any) => {
      readCount += 1;
      return readCount === 1 ? observation : { ...observation, appliedFilters: commandSpec };
    },
  });
  const result = await adapter.captureCommand.func(page, { spec: specPath, 'dry-run': true });
  assert.equal(result.length, 1);
  assert.equal(result[0].outcome, 'DRY_RUN_OK');
  assert.deepEqual(result[0].startState, {
    platforms: commandSpec.platforms,
    keywords: [],
    period: commandSpec.period,
    category: null,
  });
  assert.deepEqual(result[0].appliedReadBack, commandSpec);
  assert.deepEqual(result[0].mismatches, []);
  assert.equal(page.searched, false);
  assert.equal(page.calls.some((call: string) => call === 'click:button,[role="button"]'), false);
  assert.equal(page.calls.includes('network:start'), false);
  await rm(directory, { recursive: true, force: true });
});

function withRepairGlobals<T>(windowValue: any, documentValue: any, callback: () => T): T {
  const previous = { window: (globalThis as any).window, document: (globalThis as any).document };
  (globalThis as any).window = windowValue;
  (globalThis as any).document = documentValue;
  try {
    return callback();
  } finally {
    if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
    if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
  }
}

function replacedFunction(): Function {
  return function Function() { /* stands in for the stealth replacement */ };
}

test('page repair restores the intrinsic Function and resets wrongly resolved function defaults only', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const getDocument = () => 'document';
  const getPopupContainer = () => 'container';
  const getContainer = () => 'drawer';
  const suppliedContainer = () => 'supplied';
  const suppliedDocument = () => 'supplied-document';
  const childDefault = () => 'child';
  const suspended = {
    type: { props: { getTriggerDOMNode: { type: Function, default: childDefault } } },
    vnode: { props: null },
    props: { getTriggerDOMNode: 'factory-result' },
    subTree: null,
  };
  const child = {
    type: { props: { getDocument: { type: Function, default: getDocument } } },
    vnode: { props: { getDocument: suppliedDocument } },
    props: { getDocument: suppliedDocument },
    subTree: { suspense: { activeBranch: { component: suspended } } },
  };
  const trigger = {
    type: {
      props: {
        getDocument: { type: Function, default: getDocument },
        getPopupContainer: { type: Function, default: getPopupContainer },
        getContainer: { type: Function, default: getContainer },
        placement: { type: String, default: () => 'bottomLeft' },
        mixed: { type: [Function, String], default: () => 'mixed' },
      },
    },
    vnode: { props: { 'get-popup-container': suppliedContainer } },
    props: { getDocument: 'factory-result', getPopupContainer: suppliedContainer, getContainer, placement: 'bottomLeft', mixed: 'factory-result' },
    subTree: { children: [{ component: child }, 'text', null] },
  };
  const root = { _vnode: { children: [{ component: trigger }, { component: trigger }] } };
  const documentValue = { querySelector: (selector: string) => selector === '#__nuxt' ? root : null };
  const windowValue: any = { Function: replacedFunction() };
  const first = withRepairGlobals(windowValue, documentValue, () => adapter.repairMetricFunctionDefaults());
  assert.deepEqual(first, { restored: true, repairedProps: 2, vue: true });
  assert.equal(windowValue.Function, Function);
  assert.equal(trigger.props.getDocument, getDocument);
  assert.equal(trigger.props.getPopupContainer, suppliedContainer);
  assert.equal(trigger.props.getContainer, getContainer);
  assert.equal(trigger.props.mixed, 'factory-result');
  assert.equal(child.props.getDocument, suppliedDocument);
  assert.equal(suspended.props.getTriggerDOMNode, childDefault);
  const second = withRepairGlobals(windowValue, documentValue, () => adapter.repairMetricFunctionDefaults());
  assert.deepEqual(second, { restored: false, repairedProps: 0, vue: true });
});

test('page repair reports a page without a Vue root and fails when Function cannot be restored', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const noRoot = { querySelector: () => null };
  const windowValue: any = { Function: replacedFunction() };
  assert.deepEqual(withRepairGlobals(windowValue, noRoot, () => adapter.repairMetricFunctionDefaults()), { restored: true, repairedProps: 0, vue: false });
  assert.deepEqual(withRepairGlobals({ Function }, noRoot, () => adapter.repairMetricFunctionDefaults()), { restored: false, repairedProps: 0, vue: false });
  const readOnly = Object.defineProperty({}, 'Function', { value: replacedFunction(), writable: false });
  const ignored = { get Function() { return replacedFunction(); }, set Function(_value: unknown) { /* the page keeps its replacement */ } };
  for (const blockedWindow of [readOnly, ignored]) {
    assert.deepEqual(withRepairGlobals(blockedWindow, noRoot, () => adapter.repairMetricFunctionDefaults()), { restored: false, failed: true, repairedProps: 0, vue: false });
  }
  await assert.rejects(adapter.repairMetricPage({ evaluate: async () => ({ restored: false, failed: true, repairedProps: 0, vue: false }) }), (error: any) => {
    assert.equal(error.code, 'METRIC_UI_CHANGED');
    assert.deepEqual(error.details.pageRepair, { restored: false, failed: true });
    return true;
  });
  assert.equal(await adapter.repairMetricPage({ evaluate: async () => 0 }), null);
  assert.deepEqual(await adapter.repairMetricPage({ evaluate: async () => ({ restored: true, repairedProps: '7', vue: true, extra: 'dropped' }) }), { restored: true, repairedProps: 7, vue: true });
});

test('dry-run repairs the page before any form action and reports the repair', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-page-repair-'));
  const specPath = join(directory, 'spec.json');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form');
  const dryRunPage = (pageRepair: any) => {
    let readCount = 0;
    return fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, {}, null, [], {
      pageRepair,
      gateObservation: (_state: any, observation: any) => {
        readCount += 1;
        return readCount === 1 ? observation : { ...observation, appliedFilters: commandSpec };
      },
    });
  };
  const repaired = dryRunPage({ restored: true, repairedProps: 12, vue: true });
  const ok = await adapter.captureCommand.func(repaired, { spec: specPath, 'dry-run': true });
  assert.equal(ok[0].outcome, 'DRY_RUN_OK');
  assert.deepEqual(ok[0].pageRepair, { restored: true, repairedProps: 12, vue: true });
  const firstFormAction = repaired.calls.findIndex((call: string) => call.startsWith('click:') || call.startsWith('fill:') || call.startsWith('key:') || call.startsWith('cdp:'));
  assert.ok(firstFormAction > repaired.calls.indexOf('page-repair'));
  assert.ok(repaired.calls.indexOf('page-repair') >= 0);
  const blocked = dryRunPage({ restored: false, failed: true, repairedProps: 0, vue: false });
  const failed = await adapter.captureCommand.func(blocked, { spec: specPath, 'dry-run': true });
  assert.equal(failed[0].outcome, 'METRIC_UI_CHANGED');
  assert.equal(failed[0].pageRepair, undefined);
  assert.deepEqual(failed[0].mismatches[0].details.pageRepair, { restored: false, failed: true });
  assert.equal(blocked.calls.some((call: string) => call.startsWith('click:') || call.startsWith('fill:')), false);
  await rm(directory, { recursive: true, force: true });
});

test('non-default periods fail closed in dry-run before any form action and retain both periods', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-period-unsupported-dry-run-'));
  const spec = { ...commandSpec, period: { startDate: '2026-08-01', endDate: '2026-08-31' } };
  const specPath = join(directory, 'spec.json');
  await writeFile(specPath, `${JSON.stringify(spec)}\n`);
  const observedPeriod = commandSpec.period;
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [], period: observedPeriod } }, {});
  const result = await adapter.captureCommand.func(page, { spec: specPath, 'dry-run': true });
  assert.equal(result[0].outcome, 'METRIC_PERIOD_UNSUPPORTED');
  assert.deepEqual(result[0].mismatches[0].details, { observedPeriod, requestedPeriod: spec.period });
  assert.equal(page.searched, false);
  assert.equal(page.calls.some((call: string) => call.includes('#platform-input') || call.includes('.ant-picker')), false);
  assert.equal(page.calls.includes('network:start'), false);
  await rm(directory, { recursive: true, force: true });
});

test('non-default periods fail closed in capture before form actions or submit', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-period-unsupported-capture-'));
  const spec = { ...commandSpec, period: { startDate: '2026-08-01', endDate: '2026-08-31' } };
  const specPath = join(directory, 'spec.json'); const outputDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(spec)}\n`);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [], period: commandSpec.period } }, {});
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: outputDir }), (error: any) => {
    assert.equal(error.code, 'METRIC_PERIOD_UNSUPPORTED');
    assert.deepEqual({ observedPeriod: error.details.observedPeriod, requestedPeriod: error.details.requestedPeriod }, { observedPeriod: commandSpec.period, requestedPeriod: spec.period });
    return true;
  });
  assert.equal(page.searched, false);
  assert.equal(page.calls.some((call: string) => call.includes('#platform-input') || call.includes('.ant-picker')), false);
  assert.ok(page.calls.includes('close:synthetic-tab'));
  await rm(directory, { recursive: true, force: true });
});

test('capture archive contains no fixture identity or token in any archived file', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-archive-sanitize-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const base = await load('metric-results-response'); const sensitive = await load('metric-sensitive-archive');
  const dom = { ...(await load('metric-results-dom')), html: '<html><head><meta name="identity" content="synthetic-owner@example.test"><script>Bearer synthetic-secret-token</script></head><body><header class="account-area">Synthetic logged-in account</header><main><div data-metric-region="overview">Revenue 8</div></main></body></html>', screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [{ label: 'Synthetic history', selected: true, selector: '[role="tab"]', index: 0 }] };
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, dom, [...gateResponsesFor(commandSpec.platforms), ...base.responses, ...sensitive.responses], {
    resultDom: (state: any, original: any) => ({ ...original, platformViews: original.platformViews.map((view: any) => ({ ...view, selected: view.label === (state.platformSwitches ? 'TikTok Shop' : 'Shopee') })) }),
  });
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  assert.ok(page.screenshotCalls.length > 0);
  assert.ok(page.screenshotCalls.some((options: any) => options.fullPage === true));
  assert.ok(page.screenshotCalls.filter((options: any) => options.fullPage === false).every((options: any) => options.clip));
  assert.ok(page.maskCalls.includes('prepare'));
  const markers = [/Synthetic logged-in account/i, /synthetic-owner@example\.test/i, /\+84901234567/, /Synthetic owner nickname/i, /https:\/\/example\.test\/avatar\.png/i, /synthetic-user-id/i, /Synthetic shop owner/i, /synthetic-secret-token/i, /synthetichead\.syntheticpayload\.syntheticsignature/i, /0123456789abcdef0123456789abcdef0123456789abcdef/i];
  const archiveFiles = (await readdir(captureDir)).filter(name => name !== 'debug');
  const debugFiles = (await readdir(join(captureDir, 'debug'))).filter(name => !name.endsWith('.png'))
    .map(name => join('debug', name));
  for (const name of [...archiveFiles, ...debugFiles]) {
    const text = (await readFile(join(captureDir, name))).toString('utf8');
    for (const marker of markers) assert.doesNotMatch(text, marker, `${name} retained sanitized fixture data`);
  }
  assert.ok(await readFile(join(captureDir, 'platform-all-region-overview.png')));
  assert.match(await readFile(join(captureDir, 'snapshot.json'), 'utf8'), /Synthetic item A/);
  await rm(directory, { recursive: true, force: true });
});

function resultDomForGateTest(platformViews: any[] = [], paginated = false) {
  const pagination = paginated ? { page: 1, total: 2, pageSize: 1, nextAvailable: true, nextSelector: 'next' } : { page: 1, total: 1, pageSize: 1, nextAvailable: false };
  return {
    html: '<html><body><main data-metric-region="overview">Synthetic results</main></body></html>',
    screenshotRegions: { overview: '#synthetic-overview' }, platformViews, pagination,
    regions: {
      overview: { selector: '#synthetic-overview', kpi: { revenue: { value: 1 } } },
      'platform-split': { selector: '#synthetic-platform', items: [{ platform: 'shopee', revenue: { value: 1 }, share: { value: 100 } }] },
      'top-products': { selector: '#synthetic-products', items: [{ name: 'Synthetic item', shop: 'Synthetic shop', revenue: { value: 1 } }], pagination },
    },
  };
}

test('capture gates a redirect before reading the next pagination page and leaves no archive', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-gate-redirect-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, resultDomForGateTest([], true), gateResponsesFor(commandSpec.platforms), {
    gateObservation: (state: any, observation: any) => state.formReads > 1
      ? state.paginationClicks ? { ...observation, url: 'https://redirect.example.test/results', metricRootVisible: true } : { ...observation, appliedFilters: commandSpec }
      : observation,
  });
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 }), /METRIC_UI_CHANGED/);
  await assert.rejects(() => access(join(captureDir, 'manifest.json')), /ENOENT/);
  await access(join(captureDir, 'debug', 'manifest.json'));
  assert.ok(page.calls.includes('close:synthetic-tab'));
  await rm(directory, { recursive: true, force: true });
});

test('capture gates a login page after search and preserves debug without an archive', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-gate-login-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, resultDomForGateTest(), gateResponsesFor(commandSpec.platforms), {
    searchObservation: (_state: any, searchResult: any) => ({ ...searchResult, loginVisible: true }),
  });
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 }), /METRIC_LOGIN_REQUIRED/);
  await assert.rejects(() => access(join(captureDir, 'manifest.json')), /ENOENT/);
  await access(join(captureDir, 'debug', 'manifest.json'));
  assert.ok(page.calls.includes('close:synthetic-tab'));
  await rm(directory, { recursive: true, force: true });
});

test('a tab-close failure fails the adapter command', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = fakePage(await load('metric-whoami'), await load('metric-search'));
  page.closeTab = async () => { throw new Error('synthetic close failure'); };
  await assert.rejects(() => adapter.whoamiCommand.func(page), /synthetic close failure/);
});

const keywordFormHtml = `<div id="QuerySearchBuilder"><div class="ant-space-item"><div class="filter-label"><span class="label">Platform</span></div><div class="ant-select"><input id="platform-input" /></div></div><div class="ant-space-item"><div class="filter-label"><span class="label">Từ khóa</span></div><div class="ant-select ant-select-multiple"><div class="ant-select-selector"><div class="ant-select-selection-overflow"><div class="ant-select-selection-overflow-item"><span class="ant-tag ks-chip">old-term<span class="ant-tag-close-icon">×</span></span></div><div class="ant-select-selection-overflow-item ant-select-selection-overflow-item-suffix"><input id="keyword-input" /></div></div></div></div></div></div>`;

function platformOptionPage(options: { selected?: string[]; missingTiktok?: boolean; removeIndex?: number; switchLag?: number } = {}) {
  const fixture = (name: string) => load('metric-platform-control').then(value => value[name]);
  let mode: 'single' | 'multi' = 'single';
  let switchClicks = 0;
  let dropdownOpen = false;
  const selected = new Set(options.selected || ['shopee']);
  const calls: string[] = [];
  const clickRecords: Array<{ selector: string; options?: any }> = [];
  const page: any = {
    calls,
    clickRecords,
    wait: async () => {},
    evaluate: async (fn: Function, argument?: unknown) => {
      if (fn.name === 'observeMetricPage') return { url: 'https://metric.vn/analytics', bodyText: '', metricRootVisible: true, warningVisible: false };
      if (fn.name === 'platformRemoveIndex') return options.removeIndex ?? null;
      if (fn.toString().includes('document.activeElement === input')) return true;
      const controls = await fixture(mode === 'single' ? 'single' : selected.has('tiktok') ? 'multiShopeeTiktok' : 'multiShopee');
      let html = controls;
      if (dropdownOpen) {
        let dropdown = await fixture(options.missingTiktok ? 'dropdownWithoutTiktok' : 'dropdown');
        if (selected.has('tiktok')) dropdown = dropdown.replace('ant-select-item-option" aria-selected="false">Tiktok', 'ant-select-item-option ant-select-item-option-selected" aria-selected="true">Tiktok');
        html += dropdown;
      }
      return withMetricDom(html, () => fn(argument));
    },
    click: async (selector: string, clickOptions?: any) => {
      calls.push(`click:${selector}`);
      clickRecords.push({ selector, options: clickOptions });
      if (selector === '#QuerySearchBuilder button.switch-button') { switchClicks += 1; if (switchClicks > (options.switchLag ?? 0)) mode = 'multi'; return; }
      if (selector.includes('> .ant-select-selector')) { dropdownOpen = true; return; }
      if (selector === '[role="option"],.ant-select-item-option') {
        const labels = options.missingTiktok ? ['Shopee', 'Lazada', 'Tiki'] : ['Shopee', 'Lazada', 'Tiki', 'Tiktok'];
        const label = labels[clickOptions?.nth];
        if (label) selected.add(label.toLowerCase() === 'tiktok' ? 'tiktok' : label.toLowerCase());
      }
    },
    fillText: async (selector: string, text: string) => calls.push(`fill:${selector}:${text}`),
    cdp: async (method: string, params: any) => calls.push(`cdp:${method}:${params.type}:${params.key}`),
    pressKey: async (key: string) => calls.push(`key:${key}`),
  };
  return page;
}

test('multi-platform option clicks use the re-rendered Platform root and never fill or press Enter', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = platformOptionPage();
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.applyMetricSpec(page, spec, initial);
  assert.deepEqual(page.calls.slice(0, 3), [
    'click:#QuerySearchBuilder button.switch-button',
    'click:#QuerySearchBuilder .ant-select:has(#rc_select_14) > .ant-select-selector',
    'click:[role="option"],.ant-select-item-option',
  ]);
  assert.equal(page.clickRecords[2].options.nth, 3);
  assert.ok(!page.calls.some((call: string) => call.startsWith('fill:#rc_select_')));
  assert.ok(!page.calls.some((call: string) => call.includes('Enter')));
});

test('multi-platform switch waits for the re-rendered mode and retries once', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = platformOptionPage({ switchLag: 1 });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.applyMetricSpec(page, spec, initial);
  assert.equal(page.calls.filter((call: string) => call === 'click:#QuerySearchBuilder button.switch-button').length, 2);
  assert.ok(page.calls.includes('click:[role="option"],.ant-select-item-option'));
});

test('already-selected platform options are not clicked', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = platformOptionPage({ selected: ['shopee', 'tiktok'] });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.applyMetricSpec(page, spec, initial);
  assert.equal(page.clickRecords.filter((record: any) => record.selector === '[role="option"],.ant-select-item-option').length, 0);
});

test('missing platform option fails before the keyword step', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = platformOptionPage({ missingTiktok: true });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.ok(!page.calls.some((call: string) => call.startsWith('fill:') || call.startsWith('cdp:') || call === 'key:Escape'));
});

test('platform removal uses the scoped selected-item remove control', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { keywords: [], platforms: ['shopee', 'lazada'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null } }, {}, null, [], { platformRemoveIndex: 1 });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  await adapter.applyMetricSpec(page, spec, { appliedFilters: { keywords: [], platforms: ['shopee', 'lazada'], period: spec.period, category: null } });
  const remove = page.clickRecords.find((record: any) => record.selector.endsWith('.ant-select-selection-item-remove'));
  assert.ok(remove);
  assert.equal(remove.selector, '#QuerySearchBuilder .ant-select:has(#platform-input) .ant-select-selection-item-remove');
  assert.equal(remove.options.nth, 1);
  assert.ok(!remove.selector.includes(' ~ '));
});

test('unknown selected platforms remain observable, are removed before apply, and cannot pass the scope gate', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const parser = await import(parserUrl.href);
  const fixture = await load('metric-platform-control');
  const observation = withMetricDom(fixture.multiShopeeLazada, () => adapter.observeMetricPage(false));
  assert.deepEqual(observation.appliedFilters.platforms, ['shopee', 'Lazada']);
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const search = { ...(await load('metric-search')), appliedFilters: { ...spec, platforms: ['shopee', 'Lazada'] } };
  assert.throws(() => parser.parseSearchObservation(search, spec), /METRIC_FILTER_MISMATCH/);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { ...spec, platforms: ['shopee', 'Lazada'], keywords: [] } }, {}, null, [], { platformRemoveIndex: 1 });
  await adapter.applyMetricSpec(page, spec, { appliedFilters: { ...spec, platforms: ['shopee', 'Lazada'], keywords: [] } });
  const remove = page.clickRecords.find((record: any) => record.selector.endsWith('.ant-select-selection-item-remove'));
  assert.ok(remove);
  assert.equal(remove.options.nth, 1);
  assert.ok(page.calls.includes('click:[role="option"],.ant-select-item-option'));
});

test('multi-platform read-back uses the selected item content from the Round 5 fixture', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-platform-control');
  const observation = withMetricDom(fixture.multiShopeeTiktok, () => adapter.observeMetricPage(false));
  assert.deepEqual(observation.appliedFilters.platforms, ['shopee', 'tiktok']);
});

function keywordFormPage(fillResult: unknown, html = keywordFormHtml) {
  const calls: string[] = [];
  let keywordFocused = false;
  const page = {
    calls,
    evaluate: async (fn: Function, argument?: unknown) => {
      if (fn.toString().includes('document.activeElement === input')) return keywordFocused;
      return withMetricDom(html, () => fn(argument));
    },
    click: async (selector: string) => { calls.push(`click:${selector}`); keywordFocused = selector.includes('.ant-select-selector'); },
    pressKey: async (key: string) => { calls.push(`key:${key}`); },
    fillText: async (selector: string, text: string) => { calls.push(`fill:${selector}:${text}`); return fillResult; },
    cdp: async (method: string, params: any) => { calls.push(`cdp:${method}:${params.type}:${params.key}:${params.code}:${params.windowsVirtualKeyCode}:${params.nativeVirtualKeyCode}:${params.text}`); },
  };
  return page;
}

test('keyword commit uses a native selector click, verified fill, and trusted comma', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = keywordFormPage({ filled: true, verified: true, mode: 'input' });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.applyMetricSpec(page, spec, initial);
  const fill = page.calls.indexOf('fill:#keyword-input:synthetic-term');
  assert.ok(fill >= 0);
  assert.equal(page.calls[fill - 1], 'click:#QuerySearchBuilder .ant-select:has(#keyword-input) > .ant-select-selector');
  assert.deepEqual(page.calls.slice(fill + 1, fill + 3), [
    'cdp:Input.dispatchKeyEvent:keyDown:,:Comma:188:188:,',
    'cdp:Input.dispatchKeyEvent:keyUp:,:Comma:188:188:,',
  ]);
  assert.ok(!page.calls.includes('key:Enter'));
  assert.ok(!page.calls.includes('key:Backspace'));
});

test('unverified keyword text stops before any comma is dispatched', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = keywordFormPage({ filled: true, verified: false, expected: 'synthetic-term', actual: '', mode: 'input' });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.applyMetricSpec(page, spec, initial), (error: any) => {
    assert.equal(error.code, 'METRIC_UI_CHANGED');
    assert.deepEqual(error.details, { filled: true, verified: false });
    return true;
  });
  assert.ok(!page.calls.some(call => call.startsWith('cdp:Input.dispatchKeyEvent')));
});

test('keyword commit stops before fill when the trusted comma path is unavailable', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page: any = keywordFormPage({ filled: true, verified: true, mode: 'input' });
  delete page.cdp;
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.ok(!page.calls.some((call: string) => call.startsWith('fill:') || call.startsWith('cdp:Input.dispatchKeyEvent')));
});

function visibilityDomPage(html: string, visibilityState: string) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url: 'https://metric.vn/analytics' });
  Object.defineProperty(dom.window.document, 'visibilityState', { configurable: true, get: () => visibilityState });
  const calls: string[] = [];
  const page: any = {
    dom,
    calls,
    newTab: async () => 'synthetic-tab',
    selectTab: async () => {},
    closeTab: async () => {},
    evaluate: async (fn: Function, argument?: unknown) => {
      const previous = { document: (globalThis as any).document, window: (globalThis as any).window };
      (globalThis as any).document = dom.window.document;
      (globalThis as any).window = dom.window;
      try {
        return fn(argument);
      } finally {
        if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
        if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
      }
    },
    click: async (selector: string) => {
      calls.push(`native-click:${selector}`);
      return { matches_n: 1, match_level: 'exact', click_method: 'cdp', hit: 'target', retargeted: false };
    },
  };
  return page;
}

const pointerSequence = ['pointerover', 'mouseover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'];

test('hidden Metric tab dispatches the pointer sequence at the element centre', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = visibilityDomPage('<div id="QuerySearchBuilder"><button class="go"><span>Analytics</span></button><button class="go">Other</button></div>', 'hidden');
  const document = page.dom.window.document;
  const button = document.querySelector('button.go');
  const label = button.querySelector('span');
  document.elementFromPoint = () => label;
  const events: string[] = [];
  for (const type of pointerSequence) button.addEventListener(type, (event: any) => events.push(`${type}:${event.target === label}`));
  const result = await adapter.withMetricTab(page, (target: any) => target.click('#QuerySearchBuilder button.go', { nth: 0 }));
  assert.deepEqual(result, { matches_n: 2, match_level: 'exact', click_method: 'dom-background', hit: 'target', retargeted: false });
  assert.deepEqual(events, pointerSequence.map(type => `${type}:true`));
  assert.equal(document.activeElement, button);
  assert.deepEqual(page.calls, []);
});

test('hidden Metric tab reports a covered target and fails closed on ambiguous or missing targets', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = visibilityDomPage('<button class="go">A</button><button class="go">B</button><div id="overlay"></div>', 'hidden');
  const document = page.dom.window.document;
  document.elementFromPoint = () => document.querySelector('#overlay');
  const clicked: string[] = [];
  document.querySelectorAll('button.go').forEach((button: any) => button.addEventListener('click', () => clicked.push(button.textContent)));
  const covered = await adapter.withMetricTab(page, (target: any) => target.click('button.go', { nth: 1 }));
  assert.equal(covered.click_method, 'dom-background');
  assert.equal(covered.hit, 'other');
  assert.deepEqual(clicked, ['B']);
  for (const [selector, options] of [['button.go', undefined], ['button.go', { nth: 2 }], ['#missing', undefined]] as const) {
    await assert.rejects(() => adapter.withMetricTab(page, (target: any) => target.click(selector, options)), (error: any) => error.code === 'METRIC_UI_CHANGED');
  }
  assert.deepEqual(page.calls, []);
});

test('visible or prerendered Metric tabs keep the native click path', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  for (const state of ['visible', 'prerender']) {
    const page = visibilityDomPage('<button class="go">A</button>', state);
    const result = await adapter.withMetricTab(page, (target: any) => target.click('button.go'));
    assert.equal(result.click_method, 'cdp', state);
    assert.deepEqual(page.calls, ['native-click:button.go'], state);
  }
});

test('hidden comma commit inserts the separator through input events on the focused keyword input', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = visibilityDomPage('<input id="kw" value="synthetic term"><input id="other">', 'hidden');
  const input = page.dom.window.document.querySelector('#kw');
  const events: string[] = [];
  for (const type of ['keydown', 'keypress', 'beforeinput', 'input', 'keyup']) input.addEventListener(type, (event: any) => events.push(`${type}:${event.data ?? event.key}`));
  assert.deepEqual(await page.evaluate(adapter.commitMetricKeywordComma, '#kw'), { ok: false, reason: 'not-focused' });
  assert.equal(input.value, 'synthetic term');
  input.focus();
  assert.deepEqual(await page.evaluate(adapter.commitMetricKeywordComma, '#kw'), { ok: true, inserted: true });
  assert.equal(input.value, 'synthetic term,');
  assert.deepEqual(events, ['keydown:,', 'keypress:,', 'beforeinput:,', 'input:,']);
  events.length = 0;
  assert.deepEqual(await page.evaluate(adapter.releaseMetricKeywordComma, '#kw'), { ok: true });
  assert.deepEqual(events, ['keyup:,']);
  assert.deepEqual(await page.evaluate(adapter.releaseMetricKeywordComma, '#missing'), { ok: false, reason: 'missing' });
  events.length = 0;
  input.addEventListener('keydown', (event: any) => event.preventDefault());
  assert.deepEqual(await page.evaluate(adapter.commitMetricKeywordComma, '#kw'), { ok: true, inserted: false });
  assert.equal(input.value, 'synthetic term,');
  assert.deepEqual(events, ['keydown:,']);
});

test('hidden keyword commit uses the in-page comma instead of CDP keys and fails closed', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  for (const ok of [true, false]) {
    const page: any = keywordFormPage({ filled: true, verified: true, mode: 'input' });
    const evaluate = page.evaluate;
    page.evaluate = async (fn: Function, argument?: unknown) => {
      if (fn.name === 'metricDocumentHidden') return true;
      if (fn.name === 'commitMetricKeywordComma') { page.calls.push(`comma:${argument}`); return ok ? { ok: true, inserted: true } : { ok: false, reason: 'not-focused' }; }
      if (fn.name === 'releaseMetricKeywordComma') { page.calls.push(`keyup:${argument}`); return { ok: true }; }
      return evaluate(fn, argument);
    };
    page.wait = async (options: any) => { page.calls.push(`wait:${options.time ?? options.selector}`); };
    if (ok) await adapter.applyMetricSpec(page, spec, initial);
    else await assert.rejects(() => adapter.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
    const fill = page.calls.indexOf('fill:#keyword-input:synthetic-term');
    if (ok) assert.deepEqual(page.calls.slice(fill + 1, fill + 4), ['comma:#keyword-input', 'wait:0.3', 'keyup:#keyword-input']);
    else assert.deepEqual(page.calls.slice(fill + 1), ['comma:#keyword-input']);
    assert.ok(!page.calls.some((call: string) => call.startsWith('cdp:')));
  }
});

test('submit state reads the inline Analytics spinner as loading', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder">
    <button id="busy" class="ant-btn ant-btn-primary" disabled><span class="anticon anticon-loading"></span><span>Analytics</span></button>
    <button id="ready" class="ant-btn ant-btn-primary"><span>Analytics</span></button>
    <button id="blocked" class="ant-btn ant-btn-primary" aria-disabled="true"><span>Analytics</span></button>
  </div>`;
  const page = visibilityDomPage(html, 'hidden');
  assert.deepEqual(await page.evaluate(adapter.readMetricSubmitState, '#busy'), { found: true, disabled: true, loading: true });
  assert.deepEqual(await page.evaluate(adapter.readMetricSubmitState, '#ready'), { found: true, disabled: false, loading: false });
  assert.deepEqual(await page.evaluate(adapter.readMetricSubmitState, '#blocked'), { found: true, disabled: true, loading: false });
  assert.deepEqual(await page.evaluate(adapter.readMetricSubmitState, '#missing'), { found: false, disabled: true, loading: false });
});

test('hidden tab closes an open Metric select with Escape and an outside press', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder">
    <div class="ant-select ant-select-multiple ant-select-open ant-select-focused"><input id="platform-open"></div>
    <div class="ant-select ant-select-multiple"><input id="keyword-closed"></div>
  </div>`;
  const page = visibilityDomPage(html, 'hidden');
  const document = page.dom.window.document;
  const events: string[] = [];
  for (const id of ['platform-open', 'keyword-closed']) {
    for (const type of ['keydown', 'keyup']) document.querySelector(`#${id}`).addEventListener(type, (event: any) => events.push(`${id}:${type}:${event.key}`));
  }
  for (const type of ['mousedown', 'mouseup']) document.body.addEventListener(type, (event: any) => events.push(`body:${type}:${event.target === document.body}`));
  const input = document.querySelector('#platform-open');
  input.focus();
  assert.deepEqual(await page.evaluate(adapter.closeMetricOpenSelects), { open: 1 });
  assert.deepEqual(events, ['platform-open:keydown:Escape', 'platform-open:keyup:Escape', 'body:mousedown:true', 'body:mouseup:true']);
  assert.notEqual(document.activeElement, input);
  events.length = 0;
  document.querySelector('.ant-select-open').classList.remove('ant-select-open');
  assert.deepEqual(await page.evaluate(adapter.closeMetricOpenSelects), { open: 0 });
  assert.deepEqual(events, []);
});

test('platform labels come only from the platform dropdown, not a keyword dropdown stuck in its leave transition', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const { buildMetricPlatformMap } = await import(captureUrl.href);
  const option = (label: string) => `<div class="ant-select-item ant-select-item-option"><div class="ant-select-item-option-content">${label}</div></div>`;
  const html = `<div id="QuerySearchBuilder">
    <div class="ant-select ant-select-multiple"><input id="platform-input" aria-controls="platform-input_list"></div>
    <div class="ant-select ant-select-multiple"><input id="keyword-input" aria-owns="keyword-input_list"></div>
  </div>
  <div class="ant-select-dropdown ant-slide-up-leave ant-slide-up-leave-active"><div role="listbox" id="keyword-input_list"><div role="option">synthetic-term</div></div>${option('synthetic-term')}</div>
  <div class="ant-select-dropdown ant-slide-up-enter ant-slide-up-enter-prepare"><div role="listbox" id="platform-input_list"><div role="option">Shopee</div></div>${['Shopee', 'Lazada', 'Tiki', 'Tiktok'].map(option).join('')}</div>`;
  const dom = visibilityDomPage(html, 'hidden');
  assert.deepEqual(await dom.evaluate(adapter.readMetricSelectOptionLabels, '#platform-input'), ['Shopee', 'Lazada', 'Tiki', 'Tiktok']);
  assert.deepEqual(await dom.evaluate(adapter.readMetricSelectOptionLabels, '#keyword-input'), ['synthetic-term']);
  assert.deepEqual(await dom.evaluate(adapter.readMetricSelectOptionLabels, '#missing'), []);

  const calls: string[] = [];
  const page: any = {
    pressKey: async (key: string) => { calls.push(`key:${key}`); },
    click: async (selector: string) => { calls.push(`click:${selector}`); return { click_method: 'dom-background', hit: 'target' }; },
    evaluate: async (fn: Function, argument?: unknown) => {
      if (fn.name === 'resolvePlatformSelector') return { inputSelector: '#platform-input', selectSelector: '#platform-root > .ant-select-selector' };
      if (fn.name === 'metricDocumentHidden') return true;
      if (fn.name === 'closeMetricOpenSelects') { calls.push('close-selects'); return { open: 1 }; }
      if (fn.name === 'readMetricSelectOptionLabels') calls.push(`labels:${argument}`);
      return dom.evaluate(fn, argument);
    },
  };
  const labels = await adapter.readMetricPlatformOptionLabels(page);
  assert.deepEqual(labels, ['Shopee', 'Lazada', 'Tiki', 'Tiktok']);
  assert.deepEqual(calls, ['click:#platform-root > .ant-select-selector', 'labels:#platform-input', 'key:Escape', 'close-selects']);
  const responses = [{ urlPath: '/market/search_basic', body: JSON.stringify({ data: { platforms: [1, 2, 3, 8].map(platform_id => ({ platform_id })) } }) }];
  const platformMap = buildMetricPlatformMap(responses, labels);
  assert.deepEqual(platformMap.byId, { 1: 'shopee', 2: 'lazada', 3: 'tiki', 8: 'tiktok' });
  assert.equal(platformMap.source, 'search_basic_order_with_live_form_labels');
});

function submitIdlePage(states: any[], preflight: any = {}) {
  const calls: string[] = [];
  let reads = 0;
  const page: any = {
    calls,
    pressKey: async (key: string) => { calls.push(`key:${key}`); },
    wait: async (options: any) => { calls.push(`wait:${options.time}`); },
    evaluate: async (fn: Function, argument?: unknown) => {
      if (fn.name === 'metricDocumentHidden') return true;
      if (fn.name === 'closeMetricOpenSelects') { calls.push('close-selects'); return { open: 1 }; }
      if (fn.name === 'describeSearchSubmit') {
        const descriptor = { clickSelector: '#QuerySearchBuilder button:nth-child(1)' };
        return { candidateCount: 1, descriptor, candidates: [descriptor], pageWideAnalyticsCount: 1 };
      }
      if (fn.name === 'readMetricSubmitState') {
        calls.push(`state:${argument}`);
        return states[Math.min(reads++, states.length - 1)];
      }
      if (fn.toString().includes('elementFromPoint')) {
        const last = states[Math.min(reads, states.length) - 1] || {};
        return { popups: [], popupVisible: false, disabled: last.disabled === true, loading: last.loading === true, hit: 'target', hitElement: null, ...preflight };
      }
      return undefined;
    },
  };
  return page;
}

test('submit preflight waits for the landing report spinner and closes hidden-tab selects first', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const busy = { found: true, disabled: true, loading: true };
  const ready = { found: true, disabled: false, loading: false };
  const page = submitIdlePage([busy, busy, ready]);
  const prepared = await adapter.prepareSearchSubmit(page);
  assert.deepEqual(prepared.preflight.submitIdle, { polls: 2, loading: false, disabled: false });
  assert.equal(prepared.preflight.documentHidden, true);
  assert.ok(page.calls.indexOf('close-selects') < page.calls.findIndex((call: string) => call.startsWith('state:')));
  assert.equal(page.calls.filter((call: string) => call === 'wait:1').length, 2);
  const stuck = submitIdlePage([busy]);
  await assert.rejects(() => adapter.prepareSearchSubmit(stuck), (error: any) => {
    assert.equal(error.code, 'METRIC_UI_CHANGED');
    assert.deepEqual(error.details.preflight.submitIdle, { polls: 120, loading: true, disabled: true });
    return true;
  });
});

test('a disabled Analytics button without a spinner is not waited on for long', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const blocked = { found: true, disabled: true, loading: false };
  const page = submitIdlePage([blocked]);
  assert.deepEqual(await adapter.waitForMetricSubmitIdle(page), { polls: 4, loading: false, disabled: true });
  assert.equal(page.calls.filter((call: string) => call === 'wait:1').length, 4);
  const formStart = submitIdlePage([blocked]);
  assert.deepEqual(await adapter.waitForMetricSubmitIdle(formStart, { requireEnabled: false }), { polls: 0, loading: false, disabled: true });
  assert.ok(!formStart.calls.some((call: string) => call.startsWith('wait:')));
});

test('submit gate accepts a hidden-tab DOM click only on the target', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-hidden-submit-'));
  const specPath = join(directory, 'spec.json');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form');
  const searchObservation = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const submitWith = (clickResult: any) => {
    const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, searchObservation, null, gateResponsesFor(commandSpec.platforms));
    const click = page.click;
    page.click = async (selector: string, options?: any) => {
      const result = await click(selector, options);
      return selector.includes('#QuerySearchBuilder') && selector.includes('button:nth-child') ? { ...result, ...clickResult } : result;
    };
    return page;
  };
  const accepted = await adapter.searchCommand.func(submitWith({ click_method: 'dom-background', hit: 'target' }), { spec: specPath, out: join(directory, 'snapshot.json') });
  assert.equal(accepted[0].status, 'READY');
  for (const clickResult of [{ click_method: 'dom-background', hit: 'other' }, { click_method: 'js', hit: 'target' }]) {
    await assert.rejects(() => adapter.searchCommand.func(submitWith(clickResult), { spec: specPath, out: join(directory, 'rejected.json') }), /did not prove a native target click/);
  }
  await rm(directory, { recursive: true, force: true });
});

test('keyword removal clicks the matching nested close icon', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = keywordFormPage({ filled: true, verified: true, mode: 'input' });
  const spec = { keywords: ['new-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: ['old-term'], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.applyMetricSpec(page, spec, initial);
  assert.ok(page.calls.some(call => call.includes('.ant-tag-close-icon')));
});

test('platform mismatch after the keyword commit blocks the search before any lookup', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [], platforms: ['shopee'] }, quota: {} }, { ...(await load('metric-search')), appliedFilters: commandSpec }, null, [], {
    gateObservation: (_state: any, observation: any) => observation,
  });
  await assert.rejects(() => adapter.performSearch(page, commandSpec), (error: any) => {
    assert.equal(error.code, 'METRIC_FILTER_MISMATCH');
    assert.equal(error.details.platformsMatchExpected, false);
    assert.equal(error.details.platformCount, 1);
    assert.deepEqual(error.details.mismatches.map((mismatch: any) => mismatch.field), ['platforms', 'keywords']);
    return true;
  });
  assert.equal(page.searched, false);
  assert.ok(page.calls.includes('click:#QuerySearchBuilder .ant-select:has(#platform-input) > .ant-select-selector'));
  assert.ok(page.calls.includes('click:[role="option"],.ant-select-item-option'));
  assert.ok(!page.calls.some((call: string) => call.startsWith('fill:#platform-input:')));
  assert.ok(!page.calls.includes('key:Enter'));
});

test('missing, invisible, or blank Product category fails closed before platform typing', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const form = await load('metric-form');
  const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const cases = [
    ['missing', (controls: any[]) => controls.filter(control => control.name !== 'category')],
    ['invisible', (controls: any[]) => controls.map(control => control.name === 'category' ? { ...control, visible: false } : control)],
    ['blank', (controls: any[]) => controls.map(control => control.name === 'category' ? { ...control, selected: [] } : control)],
  ] as const;
  for (const [name, change] of cases) {
    const page = fakePage({ ...form, controls: change(form.controls), appliedFilters: { ...commandSpec } }, result);
    await assert.rejects(() => adapter.performSearch(page, commandSpec), (error: any) => {
      assert.equal(error.code, 'METRIC_UI_CHANGED', name);
      return true;
    }, name);
    assert.ok(!page.calls.some((call: string) => call.includes('#platform-input')), name);
  }
});

const round6SyntheticResultsMarkup = (await load('metric-results-real-dom')).html;

test('Round 6 labels support direct text and nested label forms, including prefixed controls', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder">
    <div class="ant-space-item"><div class="filter-label">Time period</div><div class="ant-select"><input id="period-direct"><span class="ant-select-selection-item">30 days</span></div></div>
    <div class="ant-space-item"><div class="filter-label"><span class="label">Product category</span></div><div class="ant-select"><input id="category-nested"><span class="ant-select-selection-item">All</span></div></div>
    <label><input type="checkbox" checked>Exclude gifts ( Detail )</label>
    <div role="switch" aria-checked="true">AI chuẩn hoá dữ liệu NEW</div>
  </div>`;
  const observation = withMetricDom(html, () => adapter.observeMetricPage(false));
  assert.equal(observation.controls.find((control: any) => control.name === 'period').selector, '#period-direct');
  assert.equal(observation.controls.find((control: any) => control.name === 'category').selector, '#category-nested');
  assert.equal(observation.appliedFilters.usefulFilters.gifts, true);
  assert.equal(observation.appliedFilters.aiNormalisation, true);
});

function dateApplyPage(options: { acceptDates?: boolean } = {}) {
  const state = { start: '01-01-2026', end: '02-01-2026', opened: false, selected: [] as string[], calls: [] as string[] };
  const html = () => `<div id="QuerySearchBuilder">
    <div class="ant-space-item"><div class="filter-label">Platform</div><div class="ant-select"><input id="platform-date-test"></div></div>
    <div class="ant-space-item"><div class="filter-label"><span class="label">Keywords</span></div><div class="ant-select ant-select-multiple"><div class="ant-select-selector"><input id="keyword-date-test"></div></div></div>
    <div class="ant-space-item"><div class="filter-label">Time period</div><div class="ant-select"><input id="period-date-test"></div><div class="ant-picker"><input value="${state.start}"></div><div class="ant-picker"><input value="${state.end}"></div></div>
    <div class="ant-space-item"><div class="filter-label">Product category</div><div class="ant-select"><input id="category-date-test"><span class="ant-select-selection-item">All</span></div></div>
    <div class="ant-picker-dropdown"><button class="ant-picker-header-prev-btn"></button><button class="ant-picker-header-next-btn"></button>
      <div class="ant-picker-panel"><div class="ant-picker-cell"><div class="ant-picker-cell-inner" title="2026-01-01">1</div></div><div class="ant-picker-cell"><div class="ant-picker-cell-inner" title="2026-01-02">2</div></div></div>
      <div class="ant-picker-panel"><div class="ant-picker-cell"><div class="ant-picker-cell-inner" title="2026-02-01">1</div></div><div class="ant-picker-cell"><div class="ant-picker-cell-inner" title="2026-02-02">2</div></div></div>
    </div></div>`;
  const page: any = {
    calls: state.calls,
    evaluate: async (fn: Function, argument?: unknown) => withMetricDom(html(), () => fn(argument)),
    click: async (selector: string, clickOptions?: any) => {
      state.calls.push(`click:${selector}`);
      if (selector === '#platform-date-test') return;
      if (selector === '#QuerySearchBuilder .ant-picker input') { state.opened = true; return; }
      const target = /title="([^"]+)"/.exec(selector)?.[1];
      if (target && state.opened && options.acceptDates !== false) {
        state.selected.push(target);
        if (state.selected.length === 1) state.start = target.split('-').reverse().join('-');
        else state.end = target.split('-').reverse().join('-');
      }
    },
    pressKey: async (key: string) => state.calls.push(`key:${key}`),
    fillText: async () => {},
  };
  return page;
}

test('custom date range uses native picker clicks and fails closed on displayed mismatch', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null };
  const initial = { appliedFilters: { ...spec, period: { startDate: '2026-01-01', endDate: '2026-01-02' } } };
  const page = dateApplyPage();
  await adapter.applyMetricSpec(page, spec, initial);
  assert.ok(page.calls.some((call: string) => call.includes('.ant-picker-cell-inner[title="2026-01-01"]')));
  assert.ok(page.calls.some((call: string) => call.includes('.ant-picker-cell-inner[title="2026-02-02"]')));
  assert.equal(page.calls.filter((call: string) => call === 'click:#QuerySearchBuilder .ant-picker input').length, 1);
  await assert.rejects(() => adapter.applyMetricSpec(dateApplyPage({ acceptDates: false }), spec, initial), (error: any) => error.code === 'METRIC_FILTER_MISMATCH');
});

test('live result markup exposes title KPIs, split tables, icon platforms, pagination and unavailable Highcharts', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const dom = withMetricDom(round6SyntheticResultsMarkup, () => adapter.observeResultPage());
  assert.deepEqual(dom.regions.overview.kpi, {
    revenue: { displayed: '4,0 billion', label: 'Revenue' },
    units: { displayed: '109,8 thousand', label: 'Units' },
    soldListings: { displayed: '1,1 thousand', label: 'Sold listings' },
    shops: { displayed: '519', label: 'Shops' },
  });
  assert.deepEqual(dom.regions['platform-split'].rows.map((row: any) => row.platform), ['Synthetic Shopee', 'Synthetic Tiktok']);
  assert.equal(dom.regions['platform-split'].rows[0].revenue, '1,8 billion');
  assert.equal(dom.regions['top-products'].rows[0].platform, 'tiktok');
  assert.equal(dom.regions['top-products'].rows[1].platform, 'unknown');
  assert.equal(dom.regions['top-shops'].rows[0].platform, 'shopee');
  assert.deepEqual(dom.regions['top-products'].pagination, { page: 1, total: 2, pageSize: 20, nextAvailable: false, nextSelector: 'li.ant-pagination-next .ant-pagination-item-link' });
  for (const name of ['overview', 'platform-split', 'monthly', 'category', 'price', 'top10-brand', 'top10-shop', 'brand-shop-type', 'shop-type', 'top-products', 'top-shops', 'top-brands']) assert.ok(dom.regions[name], name);
  assert.equal(dom.regions.monthly.reason, 'DOM_CHART_DATA_UNAVAILABLE');
  assert.ok(dom.regions['platform-chart']);
  assert.deepEqual(dom.platformViews, []);
  const unavailablePager = withMetricDom(round6SyntheticResultsMarkup.replace('ant-pagination-next"><button', 'ant-pagination-next ant-pagination-disabled"><button'), () => adapter.observeResultPage());
  assert.equal(unavailablePager.pagination.nextAvailable, false);
});

test('real results class fixture extracts card KPIs, platform split, and ProductTable/ShopTable rows', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-results-real-dom');
  const dom = withMetricDom(fixture.html, () => adapter.observeResultPage());
  assert.deepEqual(dom.regions.overview.kpi, {
    revenue: { displayed: '4,0 billion', label: 'Revenue' },
    units: { displayed: '109,8 thousand', label: 'Units' },
    soldListings: { displayed: '1,1 thousand', label: 'Sold listings' },
    shops: { displayed: '519', label: 'Shops' },
  });
  assert.deepEqual(dom.regions['platform-split'].rows.map((row: any) => [row.platform, row.revenue, row.units]), [
    ['Synthetic Shopee', '1,8 billion', '31,0 thousand'], ['Synthetic Tiktok', '2,2 billion', '50,2 thousand'],
  ]);
  assert.deepEqual(dom.regions['top-products'].rows.map((row: any) => [row.name, row.platform]), [
    ['Synthetic product A', 'tiktok'], ['Synthetic product B', 'unknown'],
  ]);
  assert.deepEqual(dom.regions['top-shops'].rows.map((row: any) => [row.shop, row.platform]), [['Synthetic shop A', 'shopee']]);
  assert.deepEqual(dom.regions['top-products'].pagination, { page: 1, total: 2, pageSize: 20, nextAvailable: false, nextSelector: 'li.ant-pagination-next .ant-pagination-item-link' });
});

test('an unrelated image before the platform icon cannot win row attribution', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = round6SyntheticResultsMarkup.replace(
    '<td>Synthetic product one <img class="img-platform" src="/icons/tiktok.svg"></td>',
    '<td>Synthetic product one <img alt="Product photo" src="/images/product-thumbnail.svg"><img class="img-platform" src="/icons/tiktok.svg"></td>',
  );
  const dom = withMetricDom(html, () => adapter.observeResultPage());
  assert.equal(dom.regions['top-products'].rows[0].platform, 'tiktok');
});

test('fixed-header rows without a platform icon stay unknown even when a platform column exists', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const dom = withMetricDom(round6SyntheticResultsMarkup.replace(
    '<span class="shop-platform-icon"><img alt="Shopee" src="/icons/shopee.svg"></span>',
    'Synthetic platform text',
  ), () => adapter.observeResultPage());
  assert.equal(dom.regions['top-shops'].rows[0].platform, 'unknown');
});

test('capture groups parse live displayed units and platform rows without summing platforms', async () => {
  const { extractResultsPage, parseMetricDisplay } = await import(captureUrl.href);
  assert.deepEqual([
    ['4,0 billion', 4_000_000_000], ['109,8 thousand', 109_800], ['317,5 million', 317_500_000],
    ['1,1 thousand', 1_100], ['31.461₫', 31_461], ['12 tỷ', 12_000_000_000], ['3 tr', 3_000_000], ['7k', 7_000], ['8 nghìn', 8_000], ['9đ', 9],
  ].map(([display]) => parseMetricDisplay(display as string)), [4_000_000_000, 109_800, 317_500_000, 1_100, 31_461, 12_000_000_000, 3_000_000, 7_000, 8_000, 9]);
  const result = extractResultsPage({
    responses: [],
    dom: { regions: {
      overview: { selector: '.market-overview-section', kpi: { revenue: { displayed: '4,0 billion' }, units: { displayed: '109,8 thousand' }, soldListings: { displayed: '1,1 thousand' }, shops: { displayed: '519' } } },
      'platform-split': { selector: '.platforms-table', rows: [
        { platform: 'shopee', revenue: '1,8 billion', units: '36,0 thousand' },
        { platform: 'tiktok', revenue: '2,2 billion', units: '73,8 thousand' },
      ] },
      monthly: { selector: '#growth-detail-chart', unavailable: true, reason: 'DOM_CHART_DATA_UNAVAILABLE' },
      'top-products': { selector: '.statistic-item', rows: [{ name: 'Synthetic product', platform: 'unknown', revenue: '317,5 million', units: '13,5 thousand' }] },
    } },
    scope: { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
    captureId: 'synthetic-capture', specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z', pageCap: 10,
  });
  assert.deepEqual(result.snapshot.groups.W3_platformSplit.map((row: any) => [row.platform, row.revenue.value, row.units.value]), [['shopee', 1_800_000_000, 36_000], ['tiktok', 2_200_000_000, 73_800]]);
  assert.equal(result.snapshot.groups.W12_topProducts.rows[0].cells.platform.text, 'unknown');
  assert.equal(result.snapshot.groups.W4_monthly.reason, 'DOM_CHART_DATA_UNAVAILABLE');
  assert.equal(result.snapshot.groups.W2_kpi.revenue.current.value, 4_000_000_000);
});

test('platform split emits a null-valued row for every requested platform absent from the page', async () => {
  const { extractResultsPage } = await import(captureUrl.href);
  const result = extractResultsPage({
    responses: [],
    dom: { regions: {
      overview: { selector: '#overview', kpi: { revenue: { displayed: '1' }, units: { displayed: '2' }, soldListings: { displayed: '3' }, shops: { displayed: '4' } } },
      'platform-split': { selector: '#platform', rows: [{ platform: 'shopee', revenue: '1', share: '100%' }] },
    } },
    scope: { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
    captureId: 'synthetic-missing-platform', specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z',
  });
  const tiktok = result.snapshot.groups.W3_platformSplit.find((row: any) => row.platform === 'tiktok');
  assert.ok(tiktok);
  assert.equal(tiktok.revenue.value, null);
  assert.equal(tiktok.share.value, null);
  assert.match(tiktok.revenue.sourcePointer, /scope:platforms\/tiktok\/revenue/);
});

test('a missing overview KPI card returns METRIC_UI_CHANGED', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = round6SyntheticResultsMarkup.replace(
    '<div class="statistic-card statistic-card--revenue"><div class="statistic-card__value">4,0 billion</div></div>',
    '',
  );
  const dom = withMetricDom(html, () => adapter.observeResultPage());
  const { extractResultsPage } = await import(captureUrl.href);
  assert.throws(() => extractResultsPage({
    responses: [], dom, scope: { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
    captureId: 'synthetic-kpi-missing', specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z', pageCap: 10,
  }), /METRIC_UI_CHANGED/);
});

test('an absent pagination total remains null rather than becoming zero', async () => {
  const { extractResultsPage } = await import(captureUrl.href);
  const result = extractResultsPage({
    responses: [],
    dom: { regions: {
      overview: { selector: '#overview', kpi: { revenue: { displayed: '1' }, units: { displayed: '2' }, soldListings: { displayed: '3' }, shops: { displayed: '4' } } },
      'platform-split': { selector: '#platform', rows: [{ platform: 'shopee', revenue: '1', share: '100%' }] },
      'top-products': { selector: '#products', rows: [{ name: 'Synthetic product', platform: 'unknown', revenue: '1' }] },
    } },
    scope: { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-02-02' }, category: null },
    captureId: 'synthetic-pagination-total', specDigest: 'a'.repeat(64), capturedAt: '2026-10-13T00:00:00.000Z', pageCap: 10,
  });
  assert.equal(result.pagination.W12_topProducts.totalShown, null);
});

test('collectResultPages reads two real pages, stops on disabled next, and deduplicates rows', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const base = await load('metric-search');
  const pageOne = { pagination: { page: 1, pageSize: 20, nextAvailable: true, nextSelector: 'li.ant-pagination-next .ant-pagination-item-link' }, regions: { 'top-products': { rows: [{ name: 'Synthetic page one', platform: 'unknown' }] } } };
  const pageTwo = { pagination: { page: 2, pageSize: 20, nextAvailable: false, nextSelector: 'li.ant-pagination-next .ant-pagination-item-link' }, regions: { 'top-products': { rows: [{ name: 'Synthetic page one', platform: 'unknown' }, { name: 'Synthetic page two', platform: 'tiktok' }] } } };
  const page = fakePage(base, {}, null, [], { resultDom: (state: any) => state.paginationClicks ? pageTwo : pageOne });
  const collected = await adapter.collectResultPages(page, 10);
  assert.equal(collected.pagesRead, 2);
  assert.deepEqual(collected.domSnapshots.flatMap((snapshot: any) => snapshot.regions['top-products'].rows).map((row: any) => row.name), ['Synthetic page one', 'Synthetic page two']);
  assert.equal(page.calls.filter((call: string) => call.includes('ant-pagination-next')).length, 1);
  assert.equal(page.calls.some((call: string) => call.includes('role="tab"')), false);
});
