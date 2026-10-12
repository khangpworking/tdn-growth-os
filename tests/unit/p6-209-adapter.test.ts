import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const load = (name: string): any => JSON.parse(readFileSync(new URL(`../fixtures/p6-209/${name}.json`, import.meta.url), 'utf8'));
const parserUrl = new URL('../../tools/opencli-metric/clis/metric/parser.js', import.meta.url);

test('adapter parser accepts the synthetic form map and preserves visible controls', async () => {
  const { parseMetricForm } = await import(parserUrl.href);
  const controls = parseMetricForm(load('metric-form'));
  assert.deepEqual(controls.map((control: any) => control.name), ['platform', 'period', 'category', 'keywords', 'smartQuery', 'usefulFilters']);
  assert.deepEqual(controls[0].options, ['Shopee', 'Lazada', 'Tiki', 'Tiktok']);
});

test('adapter parser maps a read-only search observation and scope', async () => {
  const { parseSearchObservation } = await import(parserUrl.href);
  const spec = { keywords: ['synthetic-keyword'], platforms: ['tiktok', 'shopee'], period: { startDate: '2025-09-15', endDate: '2026-09-20' }, category: null };
  const parsed = parseSearchObservation(load('metric-search'), spec, 5000);
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
  const observation = { ...load('metric-search'), appliedFilters: spec };
  assert.throws(() => parser.parseSearchObservation(observation, spec, 10), /METRIC_ROW_CAP/);
  assert.throws(() => parser.parseSearchObservation({ ...observation, appliedFilters: { ...spec, category: 'Khác' } }, spec), /METRIC_FILTER_MISMATCH/);
});

test('whoami maps only displayed synthetic quota fields', async () => {
  const { parseWhoamiObservation } = await import(parserUrl.href);
  assert.deepEqual(parseWhoamiObservation(load('metric-whoami')), {
    status: 'READY', plan: 'synthetic', analysisLookupsRemaining: 456, downloadRowsRemaining: 5000,
  });
});

test('whoami preserves an unavailable quota and rejects an unclassified session', async () => {
  const { parseWhoamiObservation } = await import(parserUrl.href);
  const observation = { ...load('metric-whoami'), accountState: 'logged_in', quota: {} };
  assert.deepEqual(parseWhoamiObservation(observation), {
    status: 'READY', plan: 'synthetic', analysisLookupsRemaining: null, downloadRowsRemaining: null,
  });
  assert.throws(() => parseWhoamiObservation({ ...observation, accountState: 'unknown' }), /METRIC_LOGIN_REQUIRED/);
});
