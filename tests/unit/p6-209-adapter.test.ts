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
      return adapter.__test__.observeMetricPage(false);
    } finally {
      if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
      if (previous.location === undefined) delete (globalThis as any).location; else (globalThis as any).location = previous.location;
      if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
      if (previous.getComputedStyle === undefined) delete (globalThis as any).getComputedStyle; else (globalThis as any).getComputedStyle = previous.getComputedStyle;
      dom.window.close();
    }
  };
  const benign = observe('<span class="warning-icon">!</span><span class="error-badge">3</span><i class="anticon anticon-warning"></i><svg class="error-dot"></svg><i class="material-icons">warning</i><div role="alert">Metric</div>');
  assert.equal(benign.warningVisible, false, JSON.stringify(benign.warningMatches));
  assert.ok(benign.warningMatches.some((match: any) => match.reason === 'icon-or-badge'));
  assert.ok(benign.warningMatches.filter((match: any) => match.reason === 'icon-or-badge').every((match: any) => match.text === null));
  for (const html of [
    '<div class="ant-alert ant-alert-warning ant-alert-no-icon" role="alert"><span class="anticon ant-alert-icon"></span>unrelated</div>',
    '<div class="ant-alert ant-alert-error"><span class="anticon ant-alert-icon"></span>unrelated</div>',
    '<span class="error-badge">Hết lượt phân tích</span>',
  ]) {
    assert.equal(observe(html).warningVisible, true, html);
  }
});

test('page warning observation is scoped, classified and identity-safe', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const dom = new JSDOM(`<!doctype html><html><head><title>Metric analytics</title></head><body>
    <header id="header"><div role="alert" class="header-alert">Nguyễn Văn A nguyen.van.a@example.test +84901234567</div></header>
    <main id="main-content"><div id="analytic-tab">
      <div role="alert" class="ant-alert-warning">unrelated text</div>
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
    const observation = adapter.__test__.observeMetricPage(false);
    assert.equal(observation.warningVisible, true);
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'warning-class'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'error-class'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'alert-role'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'title-announcer'));
    assert.ok(observation.warningMatches.some((match: any) => match.reason === 'bare-warning-text'));
    const serialized = JSON.stringify(observation.warningMatches);
    assert.doesNotMatch(serialized, /Nguyễn Văn A|nguyen\.van\.a@example\.test|84901234567/);
    for (const match of observation.warningMatches) {
      assert.ok(match.text === null || match.text.length <= 80);
    }
    assert.equal(observation.warningMatches.filter((match: any) => match.classSample.includes('header-alert')).length, 0);
  } finally {
    if (previous.document === undefined) delete (globalThis as any).document; else (globalThis as any).document = previous.document;
    if (previous.location === undefined) delete (globalThis as any).location; else (globalThis as any).location = previous.location;
    if (previous.window === undefined) delete (globalThis as any).window; else (globalThis as any).window = previous.window;
    if (previous.getComputedStyle === undefined) delete (globalThis as any).getComputedStyle; else (globalThis as any).getComputedStyle = previous.getComputedStyle;
    dom.window.close();
  }
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
  const observation = withMetricDom(html, () => adapter.__test__.observeMetricPage(false));
  assert.equal(observation.controls.find((control: any) => control.name === 'keywords').selector, '#rc_select_14');
  assert.deepEqual(observation.appliedFilters.keywords, ['thạch dừa']);
  assert.deepEqual(withMetricDom(html, () => adapter.__test__.readCommittedKeywords()), ['thạch dừa']);
});

test('keyword locator uses an input-only placeholder and Vietnamese labels', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const placeholderHtml = `<div id="QuerySearchBuilder"><div class="ant-select ant-select-multiple"><input id="keyword-placeholder" placeholder="Enter keywords separated by commas" value="placeholder-term" /></div><div class="ant-select ant-select-multiple"><input id="unrelated-multiple" /></div></div>`;
  const placeholderObservation = withMetricDom(placeholderHtml, () => adapter.__test__.observeMetricPage(false));
  assert.equal(placeholderObservation.controls.find((control: any) => control.name === 'keywords').selector, '#keyword-placeholder');
  assert.deepEqual(placeholderObservation.appliedFilters.keywords, ['placeholder-term']);
  const vietnameseHtml = `<div id="QuerySearchBuilder"><div class="ant-space-item"><div class="filter-label"><span class="label">Từ khóa</span></div><div class="ant-select ant-select-multiple"><input id="keyword-vietnamese" value="từ khóa mẫu" /></div></div><div class="ant-select ant-select-multiple"><input id="unrelated-vietnamese-multiple" /></div></div>`;
  const vietnameseObservation = withMetricDom(vietnameseHtml, () => adapter.__test__.observeMetricPage(false));
  assert.equal(vietnameseObservation.controls.find((control: any) => control.name === 'keywords').selector, '#keyword-vietnamese');
  assert.deepEqual(withMetricDom(vietnameseHtml, () => adapter.__test__.readCommittedKeywords()), []);
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
  assert.deepEqual(withMetricDom(html, () => adapter.__test__.readCommittedKeywords()), []);
  let attempts = 0;
  const page = {
    evaluate: async (fn: Function, argument?: unknown) => { attempts += 1; return withMetricDom(html, () => fn(argument)); },
    wait: async () => {},
  };
  await assert.rejects(adapter.__test__.waitForKeywordCommit(page, ['thạch dừa']), (error: any) => /METRIC_FILTER_MISMATCH/.test(String(error?.code || error?.message)));
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
  await assert.rejects(() => adapter.__test__.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
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
  await assert.rejects(() => adapter.__test__.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.equal(fillCalls, 0);
  assert.equal(keyCalls, 0);
});

test('ambiguous multiple-select structure is not treated as the keyword control', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder"><div class="ant-select ant-select-multiple"><input id="candidate-one" /></div><div class="ant-select ant-select-multiple"><input id="candidate-two" /></div></div>`;
  const observation = withMetricDom(html, () => adapter.__test__.observeMetricPage(false));
  assert.equal(observation.controls.find((control: any) => control.name === 'keywords').visible, false);
  assert.deepEqual(withMetricDom(html, () => adapter.__test__.readCommittedKeywords()), []);
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
  await assert.rejects(() => adapter.__test__.waitForKeywordCommit(page, ['expected-term']), (error: any) => {
    originalError = error;
    assert.deepEqual(Object.keys(error.details).sort(), ['chipCount', 'committedMatchesExpected', 'inputFound', 'inputValueMatchesExpected', 'locatedBy']);
    assert.deepEqual(error.details, { locatedBy: 'label', chipCount: 0, inputFound: true, inputValueMatchesExpected: false, committedMatchesExpected: false });
    return true;
  });
  const cliError = adapter.__test__.asCliError(originalError);
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
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-warning', text: 'access denied for nguyen.van.a@example.test +84901234567 on 20261012', reason: 'warning-class' },
    ],
  };
  const page = { wait: async () => {}, evaluate: async () => observation };
  await assert.rejects(() => adapter.__test__.readObservation(page, { includeResults: false }), (error: any) => {
    assert.equal(error.details, undefined);
    assert.doesNotMatch(error.message, /warningMatches|nguyen\.van\.a|Nguyễn Văn A|84901234567|20261012/);
    return true;
  });
  await assert.rejects(() => adapter.__test__.readObservation(page, { includeResults: false, diagnose: true }), (error: any) => {
    const serialized = JSON.stringify(error.details);
    assert.doesNotMatch(serialized, /nguyen\.van\.a@example\.test|84901234567|20261012|Nguyễn Văn A/);
    assert.deepEqual(error.details.warningMatches, [
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-info', reason: 'info-alert', text: null },
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-warning', reason: 'warning-class', text: 'access denied for [redacted-email] [redacted-phone] on [redacted-phone]' },
    ]);
    return true;
  });
});

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
      if (fn.name === 'dispatchSelectKey') { calls.push(`selectkey:${(arg as any).key}`); return true; }
      if (fn.name === 'resolveKeywordSelector') return { inputSelector: '#keyword-input', selectSelector: '#keyword-selector' };
      if (fn.toString().includes('document.activeElement === input')) return true;
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
    cdp: async (method: string, params: any) => calls.push(`cdp:${method}:${params.type}:${params.key}:${params.code}:${params.windowsVirtualKeyCode}:${params.nativeVirtualKeyCode}:${params.text}`),
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

test('platform select key carries the legacy key code and cannot submit a form', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<form id="synthetic-form"><div class="ant-select"><input id="synthetic-platform" /></div><button type="submit">Analyze</button></form>`;
  const seen = withMetricDom(html, () => {
    const events: string[] = [];
    const input = document.querySelector('#synthetic-platform')!;
    for (const type of ['keydown', 'keyup']) input.addEventListener(type, (event: any) => events.push(`${event.type}:${event.key}:${event.keyCode}:${event.which}:${event.isTrusted}`));
    document.querySelector('#synthetic-form')!.addEventListener('submit', () => events.push('submit'));
    const results = [
      adapter.__test__.dispatchSelectKey({ selector: '#synthetic-platform', key: 'Enter' }),
      adapter.__test__.dispatchSelectKey({ selector: '#synthetic-platform', key: 'Backspace' }),
      adapter.__test__.dispatchSelectKey({ selector: '#missing-input', key: 'Enter' }),
      adapter.__test__.dispatchSelectKey({ selector: '#synthetic-platform', key: 'Tab' }),
    ];
    return { events, results, focused: document.activeElement?.id };
  });
  assert.deepEqual(seen.results, [true, false, false, false]);
  assert.deepEqual(seen.events, ['keydown:Enter:13:13:false', 'keyup:Enter:13:13:false']);
  assert.equal(seen.focused, 'synthetic-platform');
});

const keywordFormHtml = `<div id="QuerySearchBuilder"><div class="ant-space-item"><div class="filter-label"><span class="label">Platform</span></div><div class="ant-select"><input id="platform-input" /></div></div><div class="ant-space-item"><div class="filter-label"><span class="label">Từ khóa</span></div><div class="ant-select ant-select-multiple"><div class="ant-select-selector"><div class="ant-select-selection-overflow"><div class="ant-select-selection-overflow-item"><span class="ant-tag ks-chip">old-term<span class="ant-tag-close-icon">×</span></span></div><div class="ant-select-selection-overflow-item ant-select-selection-overflow-item-suffix"><input id="keyword-input" /></div></div></div></div></div></div>`;

function keywordFormPage(fillResult: unknown, html = keywordFormHtml) {
  const calls: string[] = [];
  let keywordFocused = false;
  const page = {
    calls,
    evaluate: async (fn: Function, argument?: unknown) => {
      if (fn.name === 'dispatchSelectKey') calls.push(`selectkey:${(argument as any).selector}:${(argument as any).key}`);
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
  await adapter.__test__.applyMetricSpec(page, spec, initial);
  const fill = page.calls.indexOf('fill:#keyword-input:synthetic-term');
  assert.ok(fill >= 0);
  assert.equal(page.calls[fill - 1], 'click:#QuerySearchBuilder .ant-select:has(#keyword-input) > .ant-select-selector');
  assert.deepEqual(page.calls.slice(fill + 1, fill + 3), [
    'cdp:Input.dispatchKeyEvent:keyDown:,:Comma:188:188:,',
    'cdp:Input.dispatchKeyEvent:keyUp:,:Comma:188:188:,',
  ]);
  assert.ok(!page.calls.some(call => call.startsWith('selectkey:')));
  assert.ok(!page.calls.includes('key:Enter'));
  assert.ok(!page.calls.includes('key:Backspace'));
});

test('unverified keyword text stops before any comma is dispatched', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = keywordFormPage({ filled: true, verified: false, expected: 'synthetic-term', actual: '', mode: 'input' });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.__test__.applyMetricSpec(page, spec, initial), (error: any) => {
    assert.equal(error.code, 'METRIC_UI_CHANGED');
    assert.deepEqual(error.details, { filled: true, verified: false });
    return true;
  });
  assert.ok(!page.calls.some(call => call.startsWith('selectkey:') || call.startsWith('cdp:Input.dispatchKeyEvent')));
});

test('keyword commit stops before fill when the trusted comma path is unavailable', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page: any = keywordFormPage({ filled: true, verified: true, mode: 'input' });
  delete page.cdp;
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.__test__.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.ok(!page.calls.some((call: string) => call.startsWith('fill:') || call.startsWith('cdp:Input.dispatchKeyEvent')));
});

test('keyword removal clicks the matching nested close icon', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = keywordFormPage({ filled: true, verified: true, mode: 'input' });
  const spec = { keywords: ['new-term'], platforms: ['shopee'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: ['old-term'], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.__test__.applyMetricSpec(page, spec, initial);
  assert.ok(page.calls.some(call => call.includes('.ant-tag-close-icon')));
});

test('platform mismatch after the keyword commit blocks the search before any lookup', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [], platforms: ['shopee'] }, quota: {} }, { ...(await load('metric-search')), appliedFilters: commandSpec });
  await assert.rejects(() => adapter.__test__.performSearch(page, commandSpec), (error: any) => {
    assert.equal(error.code, 'METRIC_FILTER_MISMATCH');
    assert.deepEqual(error.details, { platformsMatchExpected: false, platformCount: 1 });
    return true;
  });
  assert.equal(page.searched, false);
  assert.ok(page.calls.includes('selectkey:Enter'));
  assert.ok(!page.calls.includes('key:Enter'));
});
