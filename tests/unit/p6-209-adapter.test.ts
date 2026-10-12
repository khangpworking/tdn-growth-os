import assert from 'node:assert/strict';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const load = async (name: string): Promise<any> => JSON.parse(await readFile(new URL(`../fixtures/p6-209/${name}.json`, import.meta.url), 'utf8'));
const parserUrl = new URL('../../tools/opencli-metric/clis/metric/parser.js', import.meta.url);

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
    status: 'READY', plan: 'synthetic', analysisLookupsRemaining: 456, downloadRowsRemaining: 5000,
  });
});

test('whoami preserves an unavailable quota and rejects an unclassified session', async () => {
  const { parseWhoamiObservation } = await import(parserUrl.href);
  const observation = { ...(await load('metric-whoami')), accountState: 'logged_in', quota: {} };
  assert.deepEqual(parseWhoamiObservation(observation), {
    status: 'READY', plan: 'synthetic', analysisLookupsRemaining: null, downloadRowsRemaining: null,
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

function fakePage(observation: any, result: any) {
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
      if (fn.name === 'setCheckbox') return { selector: '#synthetic', index: 0 };
      if (fn.name === 'visibleOptionIndex' || fn.name === 'clickVisibleText') return 0;
      return 0;
    },
    click: async (selector: string) => { calls.push(`click:${selector}`); if (selector === 'button,[role="button"]') searched = true; },
    fillText: async (selector: string, text: string) => calls.push(`fill:${selector}:${text}`),
    pressKey: async (key: string) => calls.push(`key:${key}`),
    startNetworkCapture: async () => { calls.push('network:start'); },
    readNetworkCapture: async () => [],
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
  const searched = await adapter.searchCommand.func(page, { spec: specPath, out: snapshotPath, 'max-rows': 5000 });
  assert.equal(searched[0].status, 'READY'); assert.equal(page.searched, true); assert.ok(page.calls.includes('close:synthetic-tab'));
  const captureDir = join(directory, 'capture');
  const captured = await adapter.captureCommand.func(fakePage({ ...form, appliedFilters: { ...commandSpec, keywords: [] }, quota: {} }, searchObservation), { spec: specPath, out: captureDir, export: false, pdf: false, 'max-rows': 5000 });
  assert.equal(captured[0].status, 'READY'); assert.match(await readFile(join(captureDir, 'manifest.json'), 'utf8'), /synthetic-keyword/);
  await rm(directory, { recursive: true, force: true });
});

test('a tab-close failure fails the adapter command', async () => {
  await installOpenCliTestStub();
  const adapter: any = await import(new URL('../../tools/opencli-metric/clis/metric/metric.js', import.meta.url).href);
  const page = fakePage(await load('metric-whoami'), await load('metric-search'));
  page.closeTab = async () => { throw new Error('synthetic close failure'); };
  await assert.rejects(() => adapter.whoamiCommand.func(page), /synthetic close failure/);
});
