import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

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
  assert.deepEqual(raw, [{ urlPath: '/api/synthetic', status: 200, body: { safe: 1 } }]);
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
  const page = fakePage({ ...form, appliedFilters: { ...spec, keywords: [] }, quota: {} }, result, dom, responses);
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  const snapshot = JSON.parse(await readFile(join(captureDir, 'snapshot.json'), 'utf8'));
  assert.equal(snapshot.groups.W4_monthly[0].platform, 'all');
  assert.match(await readFile(join(captureDir, 'snapshot.json'), 'utf8'), /Synthetic TikTok fallback/);
  await rm(directory, { recursive: true, force: true });
});

test('collectResults re-reads the selected tab before each platform screenshot', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-combined-view-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const fixture = await load('metric-results-response'); const baseDom = await load('metric-results-dom');
  const platformViews = (active: string) => ['shopee', 'all', 'tiktok'].map((platform, index) => ({
    label: platform === 'all' ? 'All platforms' : platform === 'tiktok' ? 'TikTok Shop' : 'Shopee',
    selected: active === platform, selector: 'platform-view', index,
  }));
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, result, baseDom, fixture.responses, {
    active: 'shopee',
    resultDom: (state: any, original: any) => ({ ...original, screenshotRegions: { overview: '#synthetic-overview' }, platformViews: platformViews(state.active || 'shopee') }),
    onClick: (_selector: string, state: any) => { state.active = ['all', 'shopee', 'tiktok'][state.platformSwitches - 1] || state.active; },
  });
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  const screenshotNames = page.screenshotCalls.map((options: any) => String(options.path));
  assert.ok(screenshotNames.some((name: string) => name.includes('platform-shopee-region-overview')));
  assert.ok(screenshotNames.some((name: string) => name.includes('platform-tiktok-region-overview')));
  assert.ok(screenshotNames.every((_name: string, index: number) => page.screenshotCalls[index].clip));
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
  assert.doesNotMatch(html, /synthetic-owner|synthetic-secret|logged-in account|identity-state|<script|<meta|account-area/i);
  assert.match(html, /Revenue 8/);
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

const commandSpec = {
  keywords: ['synthetic-keyword'], platforms: ['shopee', 'tiktok'],
  period: { startDate: '2025-09-15', endDate: '2026-09-20' }, category: null,
};

function fakePage(observation: any, result: any, resultDom: any = null, networkResponses: any[] = [], behavior: any = {}) {
  let searched = false;
  const state = { paginationClicks: 0, platformSwitches: 0 };
  const calls: string[] = [];
  const screenshotCalls: any[] = [];
  const maskCalls: string[] = [];
  const page: any = {
    calls,
    screenshotCalls,
    maskCalls,
    newTab: async () => 'synthetic-tab',
    selectTab: async (target: string) => calls.push(`select:${target}`),
    closeTab: async (target: string) => calls.push(`close:${target}`),
    wait: async () => {},
    evaluate: async (fn: Function, arg?: unknown) => {
      if (fn.name === 'observeMetricPage') {
        if (arg === false) return behavior.gateObservation ? behavior.gateObservation(state, observation) : observation;
        return behavior.searchObservation ? behavior.searchObservation(state, result) : result;
      }
      if (fn.name === 'readCommittedKeywords') return commandSpec.keywords;
      if (fn.name === 'observeResultPage') return behavior.resultDom ? behavior.resultDom(state, resultDom) : resultDom || { html: '<html></html>', regions: {}, screenshotRegions: {}, platformViews: [] };
      if (fn.name === 'prepareScreenshotClip') { maskCalls.push('prepare'); return behavior.screenshotClip ? behavior.screenshotClip(state) : { clip: { x: 12, y: 24, width: 320, height: 180 }, maskedCount: 1 }; }
      if (fn.name === 'restoreScreenshotMask') { maskCalls.push('restore'); return true; }
      if (fn.name === 'setCheckbox') return { selector: '#synthetic', index: 0 };
      if (fn.name === 'visibleOptionIndex' || fn.name === 'clickVisibleText') return 0;
      return 0;
    },
    click: async (selector: string, options?: any) => {
      calls.push(`click:${selector}`);
      if (selector === 'button,[role="button"]') searched = true;
      if (selector === 'next' || (typeof selector === 'string' && (selector.includes('ant-pagination-next') || selector.includes('Next Page')))) state.paginationClicks += 1;
      if (typeof selector === 'string' && (selector.includes('data-metric-platform') || selector.includes('data-platform-view') || selector === 'platform-view')) state.platformSwitches += 1;
      behavior.onClick?.(selector, state, options);
    },
    fillText: async (selector: string, text: string) => calls.push(`fill:${selector}:${text}`),
    pressKey: async (key: string) => calls.push(`key:${key}`),
    startNetworkCapture: async () => { calls.push('network:start'); },
    readNetworkCapture: async () => networkResponses,
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
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, searchObservation);
  const searched = await adapter.searchCommand.func(page, { spec: specPath, out: snapshotPath });
  assert.equal(searched[0].status, 'READY'); assert.equal(page.searched, true); assert.ok(page.calls.includes('close:synthetic-tab'));
  const captureDir = join(directory, 'capture');
  const results = await load('metric-results-response');
  const dom = { ...(await load('metric-results-dom')), html: '<html><body>synthetic results</body></html>', screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [] };
  const captured = await adapter.captureCommand.func(fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, searchObservation, dom, results.responses), { spec: specPath, out: captureDir, 'product-cap': 200 });
  assert.equal(captured[0].status, 'READY'); assert.match(await readFile(join(captureDir, 'manifest.json'), 'utf8'), /synthetic-keyword/);
  assert.match(await readFile(join(captureDir, 'snapshot.json'), 'utf8'), /Synthetic item A/);
  assert.ok(await readFile(join(captureDir, 'platform-all-region-overview.png')));
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
  const dom = { ...(await load('metric-results-dom')), html: '<html><head><meta name="identity" content="synthetic-owner@example.test"><script>Bearer synthetic-secret-token</script></head><body><header class="account-area">Synthetic logged-in account</header><main><div data-metric-region="overview">Revenue 8</div></main></body></html>', screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [{ label: 'Shopee', selected: true, selector: 'platform-view', index: 0 }, { label: 'TikTok Shop', selected: false, selector: 'platform-view', index: 1 }] };
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, dom, [...base.responses, ...sensitive.responses], {
    resultDom: (state: any, original: any) => ({ ...original, platformViews: original.platformViews.map((view: any) => ({ ...view, selected: view.label === (state.platformSwitches ? 'TikTok Shop' : 'Shopee') })) }),
  });
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  assert.ok(page.screenshotCalls.length > 0);
  assert.ok(page.screenshotCalls.every((options: any) => options.clip && options.fullPage === false));
  assert.ok(page.maskCalls.includes('prepare'));
  const markers = [/Synthetic logged-in account/i, /synthetic-owner@example\.test/i, /\+84901234567/, /Synthetic owner nickname/i, /https:\/\/example\.test\/avatar\.png/i, /synthetic-user-id/i, /Synthetic shop owner/i, /synthetic-secret-token/i, /synthetichead\.syntheticpayload\.syntheticsignature/i, /0123456789abcdef0123456789abcdef0123456789abcdef/i];
  for (const name of await readdir(captureDir)) {
    const text = (await readFile(join(captureDir, name))).toString('utf8');
    for (const marker of markers) assert.doesNotMatch(text, marker, `${name} retained sanitized fixture data`);
  }
  assert.ok(await readFile(join(captureDir, 'platform-shopee-region-overview.png')));
  assert.ok(await readFile(join(captureDir, 'platform-tiktok-region-overview.png')));
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
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, resultDomForGateTest([], true), [], {
    gateObservation: (state: any, observation: any) => state.paginationClicks ? { ...observation, url: 'https://redirect.example.test/results', metricRootVisible: true } : observation,
  });
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 }), /METRIC_UI_CHANGED/);
  await assert.rejects(() => access(captureDir), /ENOENT/);
  assert.ok(page.calls.includes('close:synthetic-tab'));
  await rm(directory, { recursive: true, force: true });
});

test('capture gates a captcha immediately after switching platform views and leaves no archive', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-gate-captcha-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const views = [{ label: 'Shopee', selected: true, selector: 'platform-view', index: 0 }, { label: 'TikTok Shop', selected: false, selector: 'platform-view', index: 1 }];
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, resultDomForGateTest(views), [], {
    gateObservation: (state: any, observation: any) => state.platformSwitches ? { ...observation, captchaVisible: true } : observation,
  });
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 }), /METRIC_CAPTCHA/);
  await assert.rejects(() => access(captureDir), /ENOENT/);
  assert.ok(page.calls.includes('close:synthetic-tab'));
  await rm(directory, { recursive: true, force: true });
});

test('capture gates a login page after search and leaves no archive', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-gate-login-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, resultDomForGateTest(), [], {
    searchObservation: (_state: any, searchResult: any) => ({ ...searchResult, loginVisible: true }),
  });
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 }), /METRIC_LOGIN_REQUIRED/);
  await assert.rejects(() => access(captureDir), /ENOENT/);
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
