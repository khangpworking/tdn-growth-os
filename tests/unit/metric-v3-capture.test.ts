import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { buildCaptureSpec } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { validateMetricV3CaptureSpec } from '../../src/modules/analysis/research-automation/metric-v3-capture-spec.js';

const adapter = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
const fixture = JSON.parse(
  await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'),
);
const formHtml = await readFile(new URL('../fixtures/metric-v3/form.html', import.meta.url), 'utf8');

// One owner at the publication gate: a UI match alone cannot publish wrong-scope responses.
// Existing v1 fixtures only cover two platforms, no child tree, and no parameter filter.
test('explicit preset contract rows preserve applied state and reject page or request drift', () => {
  const spec = buildCaptureSpec(validateMetricV3CaptureSpec(fixture.spec));
  for (const [i, window] of spec.windows.entries()) {
    const { observation, responses } = fixture.windows[i];
    const dom = new JSDOM(formHtml, { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
    const { document } = dom.window;
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', {
      get() {
        return this.textContent ?? '';
      },
    });
    const root = document.querySelector('#__nuxt') as any;
    const taxonomy = observation.taxonomy;
    root._vnode = {
      component: {
        type: { name: 'CategorySelector' },
        props: {
          value: observation.selectedCategoryIds,
          option: {
            options: [
              {
                value: taxonomy.id,
                label: taxonomy.label,
                en_label: taxonomy.displayLabel,
                children: taxonomy.children.map((c: any) => ({
                  value: c.id,
                  label: c.label,
                  en_label: c.displayLabel,
                })),
              },
            ],
          },
        },
      },
    };
    const inputs = document.querySelectorAll<HTMLInputElement>('.ant-picker input');
    inputs[0]!.value = window.period.startDate.split('-').reverse().join('-');
    inputs[1]!.value = window.period.endDate.split('-').reverse().join('-');
    const observed = JSON.parse(
      JSON.stringify(
        dom.window.eval(`(${adapter.readV3Page.toString()})(${JSON.stringify({ categoryId: taxonomy.id })})`),
      ),
    );
    dom.window.close();
    const manifest = adapter.buildV3WindowManifest(spec, window, observed, responses, '2026-10-26T07:00:00.000Z');
    assert.deepEqual(manifest.appliedState, fixture.spec.preset);
    assert.deepEqual(manifest.window, fixture.spec.windows[i]);
    assert.equal(manifest.captureGate, 'PASSED');
    assert.equal(Object.keys(manifest.sourceMap).length, 5);
  }
  const cases: [string, (row: any) => void, string][] = [
    ['one keyword', (r) => r.observation.appliedState.keywords.pop(), 'CAPTURE_APPLIED_STATE_MISMATCH'],
    [
      'smart off',
      (r) => {
        r.observation.appliedState.smartQuery = false;
      },
      'CAPTURE_APPLIED_STATE_MISMATCH',
    ],
    [
      'wrong parent',
      (r) => {
        r.observation.appliedState.category.id = 'c1';
      },
      'CAPTURE_APPLIED_STATE_MISMATCH',
    ],
    [
      'hidden category still selected',
      (r) => r.observation.selectedCategoryIds.push('c1144728673'),
      'CAPTURE_APPLIED_STATE_MISMATCH',
    ],
    [
      'gifts included',
      (r) => {
        r.observation.appliedState.usefulFilters.gifts = false;
      },
      'CAPTURE_APPLIED_STATE_MISMATCH',
    ],
    [
      '3% reviews',
      (r) => {
        r.observation.appliedState.advancedFilter.secondRate = 0.03;
      },
      'CAPTURE_APPLIED_STATE_MISMATCH',
    ],
    ['mall only', (r) => r.observation.appliedState.shopTypes.pop(), 'CAPTURE_APPLIED_STATE_MISMATCH'],
    ['missing platform', (r) => r.observation.appliedState.platforms.pop(), 'CAPTURE_APPLIED_STATE_MISMATCH'],
    [
      'wrong date',
      (r) => {
        r.observation.period.endDate = '2026-10-20';
      },
      'CAPTURE_APPLIED_STATE_MISMATCH',
    ],
    [
      'request retained All',
      (r) => r.responses[0].requestBody.include_query.bee_categories.push('c1144728673'),
      'CAPTURE_REQUEST_SCOPE_MISMATCH',
    ],
    [
      'request smart off',
      (r) => {
        r.responses[0].requestBody.include_query.is_smart_queries = false;
      },
      'CAPTURE_REQUEST_SCOPE_MISMATCH',
    ],
    [
      'earlier request smart off before correct latest response',
      (r) => {
        const later = structuredClone(r.responses[0]);
        later.responseOrder = r.responses.length;
        r.responses[0].requestBody.include_query.is_smart_queries = false;
        r.responses.push(later);
      },
      'CAPTURE_REQUEST_SCOPE_MISMATCH',
    ],
    [
      'request omits platform',
      (r) => r.responses[0].requestBody.include_query.platforms.pop(),
      'CAPTURE_REQUEST_SCOPE_MISMATCH',
    ],
    [
      'request deleted included',
      (r) => {
        r.responses[0].requestBody.notIncludeDeletedProduct = false;
      },
      'CAPTURE_REQUEST_SCOPE_MISMATCH',
    ],
    [
      'wrong trend bucket',
      (r) => {
        r.responses.find((x: any) => x.urlPath.endsWith('/insight/')).requestBody.interval_days = 30;
      },
      'CAPTURE_TREND_INTERVAL_MISMATCH',
    ],
    ['missing response', (r) => r.responses.pop(), 'CAPTURE_RESPONSE_MISSING'],
    [
      'latest headline loses metrics',
      (r) => {
        const later = structuredClone(r.responses[0]);
        later.body.data.search_basic.aggregations = [];
        r.responses.push(later);
      },
      'CAPTURE_RESPONSE_MISSING',
    ],
  ];
  for (const [name, mutate, code] of cases) {
    const row = structuredClone(fixture.windows[0]);
    mutate(row);
    assert.throws(
      () =>
        adapter.buildV3WindowManifest(
          spec,
          spec.windows[0],
          row.observation,
          row.responses,
          '2026-10-26T07:00:00.000Z',
        ),
      { message: code },
      name,
    );
  }
});

test('unknown parent or child stops at category resolution without falling back to All', () => {
  for (const change of ['parent-id', 'parent-label', 'child-id', 'child-label', 'missing-tree']) {
    const preset = structuredClone(fixture.spec.preset);
    if (change === 'parent-id') preset.category.id = 'c999999999';
    if (change === 'parent-label') preset.category.label = 'Unknown category';
    if (change === 'child-id') preset.category.children[0].id = 'c999999999';
    if (change === 'child-label') preset.category.children[0].label = 'Unknown child';
    assert.throws(
      () =>
        adapter.resolveV3Category(preset, change === 'missing-tree' ? null : fixture.windows[0].observation.taxonomy),
      { message: 'CAPTURE_CATEGORY_NOT_SELECTABLE' },
      change,
    );
  }
});

// The runner fixture checks the reference preset. This row protects new owner
// inputs from being replaced by recorded reference keywords or dates.
test('page requests use changed preset terms and dates for every mapped endpoint', () => {
  const spec = structuredClone(fixture.spec);
  spec.preset.keywords = ['another synthetic term', 'different synthetic term'];
  spec.windows[0].period = { startDate: '2026-09-21', endDate: '2026-10-20' };
  spec.windows[1].period = { startDate: '2025-10-21', endDate: '2026-10-20' };
  for (const [i, window] of spec.windows.entries()) {
    const requests = adapter.buildV3PageRequests(spec, window);
    assert.equal(requests.length, 5);
    for (const request of requests) {
      const expected = structuredClone(fixture.windows[i].responses.find((r: any) => r.urlPath === request.urlPath).requestBody);
      expected.include_query.queries = ['another synthetic term', 'different synthetic term'];
      expected.start_date = i === 0 ? '20260921' : '20251021';
      expected.end_date = '20261020';
      assert.deepEqual(request.requestBody, expected);
    }
  }
});
