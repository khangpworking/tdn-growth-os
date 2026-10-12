import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
  assert.equal(result.sourceMap.W15.source, 'dom');
  assert.equal(validateMetricWebSnapshot(result.snapshot), result.snapshot);
  const raw = sanitizeNetworkResponses([{ url: 'https://metric.vn/api/synthetic?token=secret', status: 200, body: { safe: 1, accessToken: 'must-not-survive' } }]);
  assert.deepEqual(raw, [{ urlPath: '/api/synthetic', status: 200, body: { safe: 1 } }]);
});

test('adapter parser fails closed for domain, login, captcha, filter and row cap', async () => {
  const parser = await import(parserUrl.href);
  assert.throws(() => parser.assertMetricUrl('https://example.test/'), /METRIC_UI_CHANGED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: 'Login', loginVisible: true, metricRootVisible: true }), /METRIC_LOGIN_REQUIRED/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: 'captcha', captchaVisible: true, metricRootVisible: true }), /METRIC_CAPTCHA/);
  assert.throws(() => parser.gateMetricPage({ url: 'https://metric.vn/analytics', bodyText: '', metricRootVisible: false }), /METRIC_UI_CHANGED/);
  const spec = { keywords: ['x'], platforms: ['shopee'], period: { startDate: '2025-01-01', endDate: '2025-01-31' }, category: null };
  const observation = { ...(await load('metric-search')), appliedFilters: spec };
  assert.throws(() => parser.parseSearchObservation(observation, spec, 10), /METRIC_ROW_CAP/);
  assert.throws(() => parser.parseSearchObservation({ ...observation, appliedFilters: { ...spec, category: 'Khác' } }, spec), /METRIC_FILTER_MISMATCH/);
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

function fakePage(observation: any, result: any, resultDom: any = null, networkResponses: any[] = []) {
  let searched = false;
  const calls: string[] = [];
  const page: any = {
    calls,
    newTab: async () => 'synthetic-tab',
    selectTab: async (target: string) => calls.push(`select:${target}`),
    closeTab: async (target: string) => calls.push(`close:${target}`),
    wait: async () => {},
    evaluate: async (fn: Function, arg?: unknown) => {
      if (fn.name === 'observeMetricPage') return arg === false ? observation : result;
      if (fn.name === 'readCommittedKeywords') return commandSpec.keywords;
      if (fn.name === 'observeResultPage') return resultDom || { html: '<html></html>', regions: {}, screenshotRegions: {}, platformViews: [] };
      if (fn.name === 'setCheckbox') return { selector: '#synthetic', index: 0 };
      if (fn.name === 'visibleOptionIndex' || fn.name === 'clickVisibleText') return 0;
      return 0;
    },
    click: async (selector: string) => { calls.push(`click:${selector}`); if (selector === 'button,[role="button"]') searched = true; },
    fillText: async (selector: string, text: string) => calls.push(`fill:${selector}:${text}`),
    pressKey: async (key: string) => calls.push(`key:${key}`),
    startNetworkCapture: async () => { calls.push('network:start'); },
    readNetworkCapture: async () => networkResponses,
    screenshot: async ({ path }: { path: string }) => { await writeFile(path, Buffer.from('synthetic-png')); },
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
  assert.ok(await readFile(join(captureDir, 'region-overview.png')));
  await rm(directory, { recursive: true, force: true });
});

test('a tab-close failure fails the adapter command', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = fakePage(await load('metric-whoami'), await load('metric-search'));
  page.closeTab = async () => { throw new Error('synthetic close failure'); };
  await assert.rejects(() => adapter.whoamiCommand.func(page), /synthetic close failure/);
});
