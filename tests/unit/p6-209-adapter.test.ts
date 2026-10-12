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

test('collectResults keeps the overview combined and does not switch result tabs', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-combined-view-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const fixture = await load('metric-results-response'); const baseDom = await load('metric-results-dom');
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, result, baseDom, fixture.responses, {
    resultDom: (_state: any, original: any) => ({ ...original, screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [{ label: 'Synthetic history', selected: true, selector: '[role="tab"]', index: 0 }] }),
  });
  await adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 });
  const screenshotNames = page.screenshotCalls.map((options: any) => String(options.path));
  assert.ok(screenshotNames.some((name: string) => name.includes('platform-all-region-overview')));
  assert.equal(page.platformSwitches, undefined);
  assert.equal(page.calls.some((call: string) => call.includes('platform-view') || call.includes('role="tab"')), false);
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
  const ordinaryCopy = withMetricDom('<nav>Plan feature: access denied is described here.</nav><footer title="tooltip">Limit reached is only footer copy.</footer>', () => adapter.__test__.observeMetricPage(false));
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
    const observation = adapter.__test__.observeMetricPage(false);
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

test('live platform chips are not observed as keywords when the keyword control is empty', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-live-form-states');
  const observation = withMetricDom(fixture.singlePlatformKeywordEmpty, () => adapter.__test__.observeMetricPage(false));
  assert.deepEqual(observation.appliedFilters.platforms, ['shopee']);
  assert.deepEqual(observation.appliedFilters.keywords, []);
  assert.deepEqual(withMetricDom(fixture.singlePlatformKeywordEmpty, () => adapter.__test__.readCommittedKeywords()), []);
});

test('live multiple-platform form keeps a stale keyword in the keyword control only', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-live-form-states');
  const observation = withMetricDom(fixture.multiplePlatformStaleKeyword, () => adapter.__test__.observeMetricPage(false));
  assert.deepEqual(observation.appliedFilters.platforms, ['shopee', 'tiktok']);
  assert.deepEqual(observation.appliedFilters.keywords, ['synthetic-stale-keyword']);
  assert.deepEqual(withMetricDom(fixture.multiplePlatformStaleKeyword, () => adapter.__test__.readCommittedKeywords()), ['synthetic-stale-keyword']);
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
  await adapter.__test__.applyMetricSpec(page, spec, initial);
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
      { via: 'selector', tag: 'div', role: 'alert', classSample: 'ant-alert-warning', phrase: 'access denied', text: 'access denied for nguyen.van.a@example.test +84901234567 on 20261012', reason: 'warning-class' },
    ],
  };
  const page = { wait: async () => {}, evaluate: async () => observation };
  await assert.rejects(() => adapter.__test__.readObservation(page, { includeResults: false }), (error: any) => {
    assert.deepEqual(error.details.warningMatches, [
      { via: 'selector', tag: 'div', elementKind: 'div', role: 'alert', classSample: 'ant-alert-info', reason: 'info-alert', phrase: null, text: null },
      { via: 'selector', tag: 'div', elementKind: 'div', role: 'alert', classSample: 'ant-alert-warning', reason: 'warning-class', phrase: 'access denied', text: 'access denied' },
    ]);
    assert.doesNotMatch(error.message, /warningMatches|nguyen\.van\.a|Nguyễn Văn A|84901234567|20261012/);
    return true;
  });
  await assert.rejects(() => adapter.__test__.readObservation(page, { includeResults: false, diagnose: true }), (error: any) => {
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

function fakePage(observation: any, result: any, resultDom: any = null, networkResponses: any[] = [], behavior: any = {}) {
  let searched = false;
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
        return behavior.searchObservation ? behavior.searchObservation(state, result) : result;
      }
      if (fn.name === 'readCommittedKeywords') return commandSpec.keywords;
      if (fn.name === 'resolveKeywordSelector') return { inputSelector: '#keyword-input', selectSelector: '#keyword-selector' };
      if (fn.name === 'resolvePlatformSelector') return behavior.platformSelector || {
        inputSelector: '#platform-input', rootSelector: '#QuerySearchBuilder .ant-select:has(#platform-input)',
        selectSelector: '#QuerySearchBuilder .ant-select:has(#platform-input) > .ant-select-selector', isMultiple: true,
      };
      if (fn.name === 'platformRemoveIndex') return behavior.platformRemoveIndex ?? null;
      if (fn.toString().includes('button.switch-button')) return behavior.platformMode || 'Multiple platforms';
      if (fn.toString().includes('optionIndex')) {
        if (behavior.missingOption === (arg as any)?.label) return null;
        if (behavior.selectedOption === (arg as any)?.label) return -1;
        return behavior.optionIndex ?? 0;
      }
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
      clickRecords.push({ selector, options });
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

test('capture archive contains no fixture identity or token in any archived file', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const directory = await mkdtemp(join(tmpdir(), 'p6-209-archive-sanitize-'));
  const specPath = join(directory, 'spec.json'); const captureDir = join(directory, 'capture');
  await writeFile(specPath, `${JSON.stringify(commandSpec)}\n`);
  const form = await load('metric-form'); const result = { ...(await load('metric-search')), appliedFilters: commandSpec };
  const base = await load('metric-results-response'); const sensitive = await load('metric-sensitive-archive');
  const dom = { ...(await load('metric-results-dom')), html: '<html><head><meta name="identity" content="synthetic-owner@example.test"><script>Bearer synthetic-secret-token</script></head><body><header class="account-area">Synthetic logged-in account</header><main><div data-metric-region="overview">Revenue 8</div></main></body></html>', screenshotRegions: { overview: '#synthetic-overview' }, platformViews: [{ label: 'Synthetic history', selected: true, selector: '[role="tab"]', index: 0 }] };
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
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] } }, result, resultDomForGateTest([], true), [], {
    gateObservation: (state: any, observation: any) => state.formReads > 1
      ? state.paginationClicks ? { ...observation, url: 'https://redirect.example.test/results', metricRootVisible: true } : { ...observation, appliedFilters: commandSpec }
      : observation,
  });
  await assert.rejects(() => adapter.captureCommand.func(page, { spec: specPath, out: captureDir, 'product-cap': 200 }), /METRIC_UI_CHANGED/);
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
  await adapter.__test__.applyMetricSpec(page, spec, initial);
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
  await adapter.__test__.applyMetricSpec(page, spec, initial);
  assert.equal(page.calls.filter((call: string) => call === 'click:#QuerySearchBuilder button.switch-button').length, 2);
  assert.ok(page.calls.includes('click:[role="option"],.ant-select-item-option'));
});

test('already-selected platform options are not clicked', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = platformOptionPage({ selected: ['shopee', 'tiktok'] });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await adapter.__test__.applyMetricSpec(page, spec, initial);
  assert.equal(page.clickRecords.filter((record: any) => record.selector === '[role="option"],.ant-select-item-option').length, 0);
});

test('missing platform option fails before the keyword step', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = platformOptionPage({ missingTiktok: true });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  const initial = { appliedFilters: { keywords: [], platforms: ['shopee'], period: spec.period, category: null } };
  await assert.rejects(() => adapter.__test__.applyMetricSpec(page, spec, initial), (error: any) => error.code === 'METRIC_UI_CHANGED');
  assert.ok(!page.calls.some((call: string) => call.startsWith('fill:') || call.startsWith('cdp:') || call === 'key:Escape'));
});

test('platform removal uses the scoped selected-item remove control', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const form = await load('metric-form');
  const page = fakePage({ ...form, appliedFilters: { keywords: [], platforms: ['shopee', 'lazada'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null } }, {}, null, [], { platformRemoveIndex: 1 });
  const spec = { keywords: ['synthetic-term'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-01-01', endDate: '2026-01-30' }, category: null };
  await adapter.__test__.applyMetricSpec(page, spec, { appliedFilters: { keywords: [], platforms: ['shopee', 'lazada'], period: spec.period, category: null } });
  const remove = page.clickRecords.find((record: any) => record.selector.endsWith('.ant-select-selection-item-remove'));
  assert.ok(remove);
  assert.equal(remove.selector, '#QuerySearchBuilder .ant-select:has(#platform-input) .ant-select-selection-item-remove');
  assert.equal(remove.options.nth, 1);
  assert.ok(!remove.selector.includes(' ~ '));
});

test('multi-platform read-back uses the selected item content from the Round 5 fixture', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const fixture = await load('metric-platform-control');
  const observation = withMetricDom(fixture.multiShopeeTiktok, () => adapter.__test__.observeMetricPage(false));
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
  await adapter.__test__.applyMetricSpec(page, spec, initial);
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
  await assert.rejects(() => adapter.__test__.applyMetricSpec(page, spec, initial), (error: any) => {
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
  const page = fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [], platforms: ['shopee'] }, quota: {} }, { ...(await load('metric-search')), appliedFilters: commandSpec }, null, [], {
    gateObservation: (_state: any, observation: any) => observation,
  });
  await assert.rejects(() => adapter.__test__.performSearch(page, commandSpec), (error: any) => {
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
    await assert.rejects(() => adapter.__test__.performSearch(page, commandSpec), (error: any) => {
      assert.equal(error.code, 'METRIC_UI_CHANGED', name);
      return true;
    }, name);
    assert.ok(!page.calls.some((call: string) => call.includes('#platform-input')), name);
  }
});

const round6SyntheticResultsMarkup = `
  <section class="market-overview-section">
    <div class="statistic-item"><div class="statistic-item__title">Revenue</div><div class="statistic-card__value">4,0 billion</div></div>
    <div class="statistic-item"><div class="statistic-item__title">Units sold</div><div class="statistic-card__value">109,8 thousand</div></div>
    <div class="statistic-item"><div class="statistic-item__title">Products</div><div class="statistic-card__value">1,1 thousand</div></div>
    <div class="statistic-item"><div class="statistic-item__title">Shops</div><div class="statistic-card__value">519</div></div>
  </section>
  <div class="platforms-chart"><svg><path d="synthetic" /></svg></div>
  <section class="platforms-table"><div class="platform-table"><table><thead><tr><th>Platform</th><th>Revenue</th></tr></thead><tbody>
    <tr><td>Synthetic Shopee</td><td>1,8 billion</td></tr><tr><td>Synthetic Tiktok</td><td>2,2 billion</td></tr>
  </tbody></table></div></section>
  <div id="growth-detail-chart" class="statistic-item"><div class="statistic-item__title">Growth over time</div><svg><path d="chart" /></svg></div>
  <div class="main-statistic"><button class="ant-btn-primary">Revenue</button><button>Sold products</button></div>
  <div class="statistic-item"><div class="statistic-item__title">Category</div></div>
  <div class="statistic-item"><div class="statistic-item__title">Price range</div></div>
  <div class="statistic-item"><div class="statistic-item__title">Top 10 Brands</div></div>
  <div class="statistic-item"><div class="statistic-item__title">Top 10 Shops</div></div>
  <div class="statistic-item"><div class="statistic-item__title">Top 10 brand by shop type</div></div>
  <div class="statistic-item"><div class="statistic-item__title">Shop type</div></div>
  <div class="statistic-item"><div class="statistic-item__title">Top Products</div>
    <div class="ant-table-header"><table><thead><tr><th>Product</th><th>Price</th><th>Revenue in time period</th><th>Sold products in time period</th></tr></thead></table></div>
    <div class="ant-table-body"><table><tbody>
      <tr class="ant-table-row"><td>Synthetic product one <img class="img-platform" src="/icons/tiktok.svg"></td><td>31.461₫</td><td>317,5 million</td><td>13,5 thousand</td></tr>
      <tr class="ant-table-row"><td>Synthetic product two</td><td>1.234₫</td><td>80,9 million</td><td>4,0 thousand</td></tr>
    </tbody></table></div>
    <div class="ant-pagination"><span>20 products / page</span><ul><li class="ant-pagination-item-active">1</li><li class="ant-pagination-next"><button class="ant-pagination-item-link"></button></li></ul></div>
  </div>
  <div class="statistic-item"><div class="statistic-item__title">Top Shops</div>
    <div class="ant-table-header"><table><thead><tr><th>Hạng</th><th>Shop name</th><th>Platform</th><th>Revenue in time period</th><th>Sold products in time period</th><th>Avg Price</th></tr></thead></table></div>
    <div class="ant-table-body"><table><tbody><tr class="ant-table-row"><td>1</td><td>Synthetic shop one</td><td><span class="shop-platform-icon"><img alt="Shopee" src="/icons/shopee.svg"></span></td><td>103,7 million</td><td>527</td><td>196.747₫</td></tr></tbody></table></div>
  </div>
  <div class="statistic-item"><div class="statistic-item__title">Top Brands</div><div class="ant-table-header"><table><thead><tr><th>Brand name</th></tr></thead></table></div><div class="ant-table-body"><table><tbody><tr><td>Synthetic brand one</td></tr></tbody></table></div></div>
  <div role="tab" aria-selected="true">Synthetic history tab</div>
`;

test('Round 6 labels support direct text and nested label forms, including prefixed controls', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = `<div id="QuerySearchBuilder">
    <div class="ant-space-item"><div class="filter-label">Time period</div><div class="ant-select"><input id="period-direct"><span class="ant-select-selection-item">30 days</span></div></div>
    <div class="ant-space-item"><div class="filter-label"><span class="label">Product category</span></div><div class="ant-select"><input id="category-nested"><span class="ant-select-selection-item">All</span></div></div>
    <label><input type="checkbox" checked>Exclude gifts ( Detail )</label>
    <div role="switch" aria-checked="true">AI chuẩn hoá dữ liệu NEW</div>
  </div>`;
  const observation = withMetricDom(html, () => adapter.__test__.observeMetricPage(false));
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
  await adapter.__test__.applyMetricSpec(page, spec, initial);
  assert.ok(page.calls.some((call: string) => call.includes('.ant-picker-cell-inner[title="2026-01-01"]')));
  assert.ok(page.calls.some((call: string) => call.includes('.ant-picker-cell-inner[title="2026-02-02"]')));
  assert.equal(page.calls.filter((call: string) => call === 'click:#QuerySearchBuilder .ant-picker input').length, 1);
  await assert.rejects(() => adapter.__test__.applyMetricSpec(dateApplyPage({ acceptDates: false }), spec, initial), (error: any) => error.code === 'METRIC_FILTER_MISMATCH');
});

test('live result markup exposes title KPIs, split tables, icon platforms, pagination and unavailable Highcharts', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const dom = withMetricDom(round6SyntheticResultsMarkup, () => adapter.__test__.observeResultPage());
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
  assert.deepEqual(dom.regions['top-products'].pagination, { page: 1, total: null, pageSize: 20, nextAvailable: true, nextSelector: 'li.ant-pagination-next .ant-pagination-item-link' });
  for (const name of ['overview', 'platform-split', 'monthly', 'category', 'price', 'top10-brand', 'top10-shop', 'brand-shop-type', 'shop-type', 'top-products', 'top-shops', 'top-brands']) assert.ok(dom.regions[name], name);
  assert.equal(dom.regions.monthly.reason, 'DOM_CHART_DATA_UNAVAILABLE');
  assert.ok(dom.regions['platform-chart']);
  assert.deepEqual(dom.platformViews, []);
  const unavailablePager = withMetricDom(round6SyntheticResultsMarkup.replace('ant-pagination-next"><button', 'ant-pagination-next ant-pagination-disabled"><button'), () => adapter.__test__.observeResultPage());
  assert.equal(unavailablePager.pagination.nextAvailable, false);
});

test('an unrelated image before the platform icon cannot win row attribution', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = round6SyntheticResultsMarkup.replace(
    '<td>Synthetic product one <img class="img-platform" src="/icons/tiktok.svg"></td>',
    '<td>Synthetic product one <img alt="Product photo" src="/images/product-thumbnail.svg"><img class="img-platform" src="/icons/tiktok.svg"></td>',
  );
  const dom = withMetricDom(html, () => adapter.__test__.observeResultPage());
  assert.equal(dom.regions['top-products'].rows[0].platform, 'tiktok');
});

test('fixed-header rows without a platform icon stay unknown even when a platform column exists', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const dom = withMetricDom(round6SyntheticResultsMarkup.replace(
    '<span class="shop-platform-icon"><img alt="Shopee" src="/icons/shopee.svg"></span>',
    'Synthetic platform text',
  ), () => adapter.__test__.observeResultPage());
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

test('a missing overview KPI card returns METRIC_UI_CHANGED', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const html = round6SyntheticResultsMarkup.replace(
    '<div class="statistic-item"><div class="statistic-item__title">Revenue</div><div class="statistic-card__value">4,0 billion</div></div>',
    '',
  );
  const dom = withMetricDom(html, () => adapter.__test__.observeResultPage());
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
  const collected = await adapter.__test__.collectResultPages(page, 10);
  assert.equal(collected.pagesRead, 2);
  assert.deepEqual(collected.domSnapshots.flatMap((snapshot: any) => snapshot.regions['top-products'].rows).map((row: any) => row.name), ['Synthetic page one', 'Synthetic page two']);
  assert.equal(page.calls.filter((call: string) => call.includes('ant-pagination-next')).length, 1);
  assert.equal(page.calls.some((call: string) => call.includes('role="tab"')), false);
});
