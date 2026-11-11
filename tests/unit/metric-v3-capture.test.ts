import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { createRequire } from 'node:module';
import test, { type TestContext } from 'node:test';
import { JSDOM, type DOMWindow } from 'jsdom';
import { buildCaptureSpec } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { validateMetricV3CaptureSpec } from '../../src/modules/analysis/research-automation/metric-v3-capture-spec.js';
import { main, hashFolder, sha256 } from '../../scripts/module-pick.js';
import { moduleOutputs } from '../../scripts/module-metric-output.js';
import { fakeEvidencePage, jsonBytes } from '../helpers/evr2-evidence-fixture.js';
import { distinctRows, requestBytes } from '../helpers/module-run-fixture.js';

const adapter = await import(new URL('../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url).href);
const fixture = JSON.parse(
  await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'),
);
const formHtml = await readFile(new URL('../fixtures/metric-v3/form.html', import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
require('ajv-formats')(ajv);
ajv.addSchema(JSON.parse(await readFile(new URL('../../contracts/analysis/metric-v3-capture-spec.schema.json', import.meta.url), 'utf8')));
const validateWindowManifest = ajv.compile<Record<string, unknown>>(JSON.parse(await readFile(new URL('../../contracts/analysis/metric-v3-window-capture.schema.json', import.meta.url), 'utf8')));

function stubVisibleLayout(window: DOMWindow) {
  Object.defineProperty(window.HTMLElement.prototype, 'getBoundingClientRect', {
    value(this: HTMLElement) {
      const hidden = this.style.visibility === 'hidden' || this.style.display === 'none';
      return { width: hidden ? 0 : 100, height: hidden ? 0 : 30 };
    },
  });
}

test('window manifest versions retain old captures and require method provenance for new captures', () => {
  const row = fixture.windows[0];
  const current = adapter.buildV3WindowManifest(fixture.spec, fixture.spec.windows[0], row.observation, row.responses, '2026-10-26T07:00:00.000Z');
  const legacy = { ...current, contractVersion: 'metric-v3-window-capture-v1' };
  delete legacy.captureMethod;
  assert.ok(validateWindowManifest(legacy), JSON.stringify(validateWindowManifest.errors));
  assert.equal(current.contractVersion, 'metric-v3-window-capture-v2');
  assert.ok(validateWindowManifest(current));
  assert.equal(validateWindowManifest({ ...legacy, contractVersion: 'metric-v3-window-capture-v2' }), false);
  assert.equal(validateWindowManifest({ ...legacy, captureMethod: 'ui' }), false);
  assert.equal(validateWindowManifest({ ...current, captureMethod: 'page-request' }), false);
  assert.ok(validateWindowManifest({ ...current, captureMethod: 'page-request', fallbackReason: 'CAPTURE_UI_CHANGED' }));
  assert.equal(validateWindowManifest({ ...current, fallbackReason: 'CAPTURE_UI_CHANGED' }), false);
});

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
    stubVisibleLayout(dom.window);
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
    ['missing UI response', (r) => r.responses.pop(), 'CAPTURE_UI_CHANGED'],
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
  // A missing insight response keeps bounded diagnostics that name the endpoint and stage.
  const missingInsight = structuredClone(fixture.windows[0]);
  missingInsight.responses = missingInsight.responses.filter((response: any) => !response.urlPath.endsWith('/insight/'));
  const diagnostics = { missingEndpoints: ['insight'], window: '30d', stage: 'response-readiness' };
  assert.throws(
    () => adapter.buildV3WindowManifest(spec, spec.windows[0], missingInsight.observation, missingInsight.responses, '2026-10-26T07:00:00.000Z'),
    (error: any) => {
      assert.equal(error.message, 'CAPTURE_UI_CHANGED');
      assert.deepEqual(error.details, diagnostics);
      return true;
    },
    'missing insight after a UI capture',
  );
  assert.throws(
    () => adapter.buildV3WindowManifest(spec, spec.windows[0], missingInsight.observation, missingInsight.responses, '2026-10-26T07:00:00.000Z', 'page-request', 'CAPTURE_UI_CHANGED'),
    (error: any) => {
      assert.equal(error.message, 'CAPTURE_RESPONSE_MISSING');
      assert.deepEqual(error.details, diagnostics);
      return true;
    },
    'missing insight after a page-request capture',
  );
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
  for (const [contractVersion, keywords] of [
    ['metric-v3-capture-spec-v1', ['another synthetic term', 'different synthetic term']],
    ['metric-v3-capture-spec-v2', ['another synthetic term', 'different synthetic term']],
    ['metric-v3-capture-spec-v2', ['another synthetic term']],
  ] as const) {
    const spec = structuredClone(fixture.spec);
    spec.contractVersion = contractVersion;
    spec.preset.keywords = [...keywords];
    spec.windows[0].period = { startDate: '2026-09-21', endDate: '2026-10-20' };
    spec.windows[1].period = { startDate: '2025-10-21', endDate: '2026-10-20' };
    for (const [i, window] of spec.windows.entries()) {
      const requests = adapter.buildV3PageRequests(spec, window);
      assert.equal(requests.length, 5);
      for (const request of requests) {
        const expected = structuredClone(fixture.windows[i].responses.find((r: any) => r.urlPath === request.urlPath).requestBody);
        expected.include_query.queries = [...keywords];
        expected.start_date = i === 0 ? '20260921' : '20251021';
        expected.end_date = '20261020';
        assert.deepEqual(request.requestBody, expected);
      }
    }
  }
});

test('date selection ignores hidden calendar arrows and commits both exact input dates without submitting', async () => {
  const dom = new JSDOM('<body><div id="QuerySearchBuilder"><div class="ant-picker"><input></div><div class="ant-picker"><input></div></div></body>',
    { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
  const w = dom.window, document = w.document;
  Object.defineProperty(w.HTMLElement.prototype, 'getBoundingClientRect', { value: function (this: HTMLElement) {
    return { width: this.style.visibility === 'hidden' ? 0 : 100, height: 30 };
  } });
  const inputs = [...document.querySelectorAll('input')];
  let index = 0, month = 10, disableEnd = false;
  function render() {
    document.querySelector('.ant-picker-dropdown')?.remove();
    const panel = document.createElement('div'); panel.className = 'ant-picker-dropdown';
    panel.innerHTML = `<button class="ant-picker-header-prev-btn" style="visibility:hidden"></button>
      <button class="ant-picker-header-prev-btn" data-move="-1"></button>
      <button class="ant-picker-header-next-btn" data-move="1"></button><table><tbody><tr>
      ${[1, 20, 21, 28].map(day => `<td class="ant-picker-cell ant-picker-cell-in-view" title="2026-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}"><span class="ant-picker-cell-inner">${day}</span></td>`).join('')}
      </tr></tbody></table>`;
    for (const button of panel.querySelectorAll<HTMLElement>('[data-move]')) button.onclick = () => { month += Number(button.dataset.move); render(); };
    for (const cell of panel.querySelectorAll<HTMLElement>('.ant-picker-cell-inner')) cell.onmousedown = () => {
      inputs[index]!.value = cell.parentElement!.getAttribute('title')!.split('-').reverse().join('-'); panel.remove();
    };
    if (disableEnd) panel.querySelector('[title="2026-10-20"]')?.classList.add('ant-picker-cell-disabled');
    document.body.append(panel);
  }
  for (const [i, input] of inputs.entries()) input.onclick = () => { index = i; month = 10; render(); };
  const page = {
    evaluate: async (fn: Function, arg: unknown) => w.eval(`(${fn.toString()})(${JSON.stringify(arg)})`),
    click: async (selector: string) => { (document.querySelector(selector) as HTMLElement).click(); },
    wait: async () => {},
  };
  try {
    await adapter.selectV3Dates(page, { startDate: '2026-09-21', endDate: '2026-10-20' });
    assert.deepEqual(inputs.map(i => i.value), ['21-09-2026', '20-10-2026']);
    disableEnd = true;
    await assert.rejects(adapter.selectV3Dates(page, { startDate: '2026-09-21', endDate: '2026-10-20' }), { message: 'CAPTURE_PERIOD_NOT_SELECTABLE' });
    dom.reconfigure({ url: 'https://untrusted.invalid/' });
    await assert.rejects(adapter.selectV3Dates(page, { startDate: '2026-09-21', endDate: '2026-10-20' }), { message: 'CAPTURE_ORIGIN_CHANGED' });
  } finally { w.close(); }
});


test('availability follows enabled calendar dates across months without submitting or selecting dates', async () => {
  const dom = new JSDOM('<body><div id="QuerySearchBuilder"><div class="ant-picker"><input value="01-01-2026"></div><div class="ant-picker"><input value="15-01-2026"></div><button id="submit">Analytics</button></div></body>',
    { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
  const w = dom.window, document = w.document;
  Object.defineProperty(w.HTMLElement.prototype, 'getBoundingClientRect', { value: function (this: HTMLElement) {
    return { width: this.style.visibility === 'hidden' ? 0 : 100, height: 30 };
  } });
  Object.defineProperty(document.body, 'innerText', { get: () => document.body.textContent || '' });
  let shown = '2026-01', latest = '2026-01-24', submissions = 0, selections = 0;
  document.querySelector<HTMLElement>('#submit')!.onclick = () => { submissions++; };
  function render() {
    document.querySelector('.ant-picker-dropdown')?.remove();
    const panel = document.createElement('div'); panel.className = 'ant-picker-dropdown';
    const days = new Date(Date.parse(shown + '-01') + 32 * 86400000); days.setUTCDate(0);
    panel.innerHTML = '<button class="ant-picker-header-prev-btn" style="visibility:hidden"></button><button class="ant-picker-header-prev-btn" data-move="-1"></button><button class="ant-picker-header-next-btn" data-move="1"></button>' +
      Array.from({ length: days.getUTCDate() }, (_, i) => {
        const date = shown + '-' + String(i + 1).padStart(2, '0');
        return `<div class="ant-picker-cell ${date > latest ? 'ant-picker-cell-disabled' : ''}" title="${date}"><span class="ant-picker-cell-inner">${i + 1}</span></div>`;
      }).join('');
    for (const b of panel.querySelectorAll<HTMLElement>('[data-move]')) b.onmousedown = () => {
      const date = new Date(shown + '-01'); date.setUTCMonth(date.getUTCMonth() + Number(b.dataset.move)); shown = date.toISOString().slice(0, 7); render();
    };
    for (const cell of panel.querySelectorAll<HTMLElement>('.ant-picker-cell-inner')) cell.onclick = () => { selections++; };
    document.body.append(panel);
  }
  // The source picker opens on mousedown; click-only automation leaves it closed.
  document.querySelectorAll<HTMLInputElement>('input')[1]!.onmousedown = () => render();
  const body = document.body; body.remove();
  const page = { evaluate: async (fn: Function, arg: unknown) => w.eval(`(${fn.toString()})(${JSON.stringify(arg)})`),
    click: async (selector: string) => { document.querySelector<HTMLElement>(selector)!.click(); },
    wait: async () => { if (!document.body) document.documentElement.append(body); } };
  try {
    assert.equal(await adapter.discoverV3AvailableEndDate(page, '2026-01-30'), '2026-01-24');
    latest = '2026-01-27';
    assert.equal(await adapter.discoverV3AvailableEndDate(page, '2026-01-30'), '2026-01-27');
    assert.equal(await adapter.discoverV3AvailableEndDate(page, '2026-01-20'), '2026-01-20');
    shown = '2026-02'; latest = '2026-01-24';
    assert.equal(await adapter.discoverV3AvailableEndDate(page, '2026-02-15'), '2026-01-24');
    assert.equal(submissions, 0); assert.equal(selections, 0);
    assert.deepEqual([...document.querySelectorAll('input')].map(i => i.value), ['01-01-2026', '15-01-2026']);
  } finally { w.close(); }
});

// Live labels carry mode buttons, help links and badges. These fixtures keep that
// structure in both languages so extraction is proven on the real DOM, not on flags.
const englishForm = await readFile(new URL('../fixtures/metric-v3/form.en.html', import.meta.url), 'utf8');
const vietnameseForm = await readFile(new URL('../fixtures/metric-v3/form.vi.html', import.meta.url), 'utf8');
const overviewKPIs = {
  English: [
    ['Revenue (VNĐ)', '1,350,000'],
    ['Sold products', '3,500'],
    ['Products', '250'],
    ['Shops', '50'],
  ],
  Vietnamese: [
    ['Doanh số (VNĐ)', '1,350,000'],
    ['Lượt bán', '3,500'],
    ['Sản phẩm có lượt bán', '250'],
    ['Gian hàng có lượt bán', '50'],
  ],
} as const;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Bind the fixture's Vue taxonomy, then read the page exactly as the capture does. */
function readBilingualObservation(html: string) {
  const dom = new JSDOM(html, { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
  try {
    const { document } = dom.window;
    Object.defineProperty(dom.window.HTMLElement.prototype, 'innerText', { get() { return this.textContent ?? ''; } });
    stubVisibleLayout(dom.window);
    const observation = fixture.windows[0].observation;
    const taxonomy = observation.taxonomy;
    const root = document.querySelector('#__nuxt') as any;
    root._vnode = {
      component: {
        type: { name: 'CategorySelector' },
        props: {
          value: observation.selectedCategoryIds,
          option: { options: [{
            value: taxonomy.id, label: taxonomy.label, en_label: taxonomy.displayLabel,
            children: taxonomy.children.map((c: any) => ({ value: c.id, label: c.label, en_label: c.displayLabel })),
          }] },
        },
      },
    };
    return JSON.parse(JSON.stringify(
      dom.window.eval(`(${adapter.readV3Page.toString()})(${JSON.stringify({ categoryId: taxonomy.id })})`),
    ));
  } finally { dom.window.close(); }
}

test('bilingual forms bind real DOM controls, results and trend interval to the preset gate', () => {
  const spec = buildCaptureSpec(validateMetricV3CaptureSpec(fixture.spec));
  const forms = [
    ['English', englishForm, 'Advanced', { week: 'Week', month: 'Month' }],
    ['Vietnamese', vietnameseForm, 'Nâng cao', { week: 'Tuần', month: 'Tháng' }],
  ] as const;
  for (const [language, html, categoryMode, trends] of forms) {
    for (const [bucket, intervalDays] of [['week', 7], ['month', 30]] as const) {
      const observed = readBilingualObservation(html.replace('TREND_LABEL', trends[bucket]));
      assert.equal(observed.stop, undefined, language + ': no stop');
      assert.equal(observed.formReady, true, language + ': form is ready from the DOM');
      assert.equal(observed.resultsReady, true, language + ': results are visible');
      const overviewHeading = language === 'English' ? 'Market Overview' : 'Tổng quan thị trường';
      assert.match(observed.displayedKPIs, new RegExp(`^${escapeRegExp(overviewHeading)}\\b`), language + ': exact heading');
      for (const [label, value] of overviewKPIs[language]) {
        assert.match(
          observed.displayedKPIs,
          new RegExp(`${escapeRegExp(label)}\\s*${escapeRegExp(value)}`),
          language + ': KPI evidence retains ' + label,
        );
      }
      assert.equal(observed.submitReady, true, language + ': submit is ready');
      assert.equal(observed.submitIdle, true, language + ': submit is idle');
      assert.equal(observed.trendIntervalDays, intervalDays, language + ': ' + bucket + ' interval');
      assert.equal(observed.categoryMode, categoryMode);
      assert.deepEqual(observed.period, { startDate: '2026-09-20', endDate: '2026-10-19' });
      assert.deepEqual(observed.selectedCategoryIds, fixture.windows[0].observation.selectedCategoryIds);
      assert.equal(observed.keywordInput, '');
      assert.equal(observed.multi, true);
      assert.equal(observed.comparisonDefault, true);
      assert.deepEqual(observed.appliedState, fixture.spec.preset, language + ': DOM controls bind every preset field');
      const manifest = adapter.buildV3WindowManifest(spec, spec.windows[0], observed, fixture.windows[0].responses, '2026-10-26T07:00:00.000Z');
      assert.equal(manifest.captureGate, 'PASSED', language + ': ' + bucket);
      assert.deepEqual(manifest.appliedState, fixture.spec.preset);
    }
    const unsupported = readBilingualObservation(html.replace('TREND_LABEL', language === 'English' ? 'Quarter' : 'Hàng quý'));
    assert.equal(unsupported.trendIntervalDays, null, language + ': an unlisted bucket is not guessed');
  }
});

test('overview readiness requires one visible exact heading in the scoped overview section', () => {
  const spec = buildCaptureSpec(validateMetricV3CaptureSpec(fixture.spec));
  const start = englishForm.indexOf('<!-- market-overview -->');
  const end = englishForm.indexOf('<!-- /market-overview -->') + '<!-- /market-overview -->'.length;
  assert.ok(start >= 0 && end > start, 'overview fixture markers are intact');
  const overviewBlock = englishForm.slice(start, end);
  const withoutOverview = englishForm.slice(0, start) + englishForm.slice(end);
  const duplicateOverview = englishForm.slice(0, end) + overviewBlock + englishForm.slice(end);
  const hiddenOverview = englishForm.replace(
    '<div class="market-overview-section">',
    '<div class="market-overview-section" style="visibility:hidden">',
  );
  const renamedHeading = englishForm.replace(
    '<h3 class="section-title">Market Overview</h3>',
    '<h3 class="section-title">Market summary</h3>',
  );
  const unrelatedBrand = englishForm.slice(0, start) +
    '<div class="brand-analysis-section"><div class="section-header"><h3 class="section-title">Market Overview</h3></div>' +
    '<div class="SummaryStatistic"><div class="statistic-cards"><div class="statistic-card">' +
    '<div class="statistic-card__value">9,999</div></div></div></div></div>' +
    englishForm.slice(end);
  const cases: [string, string][] = [
    ['missing overview', withoutOverview],
    ['duplicate overview', duplicateOverview],
    ['hidden overview', hiddenOverview],
    ['renamed heading', renamedHeading],
    ['unrelated brand-section heading', unrelatedBrand],
  ];
  for (const [name, html] of cases) {
    const observed = readBilingualObservation(html);
    assert.equal(observed.formReady, true, name + ': form remains ready');
    assert.equal(observed.resultsReady, false, name + ': results are not ready');
    assert.equal(observed.displayedKPIs, '', name + ': no unrelated text is published as KPIs');
    assert.throws(
      () => adapter.buildV3WindowManifest(spec, spec.windows[0], observed, fixture.windows[0].responses, '2026-10-26T07:00:00.000Z'),
      (error: any) => {
        assert.equal(error.message, 'CAPTURE_UI_CHANGED', name);
        assert.equal(error.details?.stage, 'results-readiness', name);
        return true;
      },
    );
  }
});

const SELECTED_WINDOW = {
  id: 'selected',
  period: { startDate: '2026-09-16', endDate: '2026-10-02' },
  intervalDays: 7,
};

function selectedV3Spec(overrides: { preset?: Record<string, unknown>; window?: Record<string, unknown> } = {}): any {
  return {
    contractVersion: 'metric-v3-capture-spec-v3',
    preset: {
      ...structuredClone(fixture.spec.preset),
      smartExclusion: false,
      ...(overrides.preset ?? {}),
    },
    windows: [structuredClone(overrides.window ?? SELECTED_WINDOW)],
  };
}

function selectedObservation(spec: any): any {
  const observation = structuredClone(fixture.windows[0].observation);
  const display = new Map<string, string>(
    observation.taxonomy.children.map((child: any) => [child.id, child.displayLabel]),
  );
  observation.taxonomy = {
    ...spec.preset.category,
    displayLabel: observation.taxonomy.displayLabel,
    children: spec.preset.category.children.map((child: any) => ({
      ...child,
      displayLabel: display.get(child.id) ?? child.label,
    })),
  };
  observation.period = structuredClone(spec.windows[0].period);
  observation.appliedState = structuredClone(spec.preset);
  observation.selectedCategoryIds = spec.preset.category.children.map((child: any) => child.id);
  return observation;
}

function selectedResponses(spec: any): any[] {
  const requests = adapter.buildV3PageRequests(spec, spec.windows[0]);
  return fixture.windows[0].responses.map((response: any) => ({
    ...structuredClone(response),
    requestBody: structuredClone(requests.find((request: any) => request.urlPath === response.urlPath).requestBody),
  }));
}

test('v3 selected window carries exact dates and every requested option into requests and the manifest gate', () => {
  const spec = validateMetricV3CaptureSpec(selectedV3Spec({
    preset: {
      smartQuery: false,
      usefulFilters: { fake: false, gifts: false, deleted: false },
      shopTypes: ['regular'],
      aiNormalisation: true,
      customizeCategory: false,
      smartExclusion: true,
      category: {
        id: 'c2035652732', label: 'Sức Khoẻ', children: [
          { id: 'c407923064', label: 'Chăm sóc sức khỏe' },
          { id: 'c2140822537', label: 'Thực phẩm chức năng' },
        ],
      },
    },
  })) as any;
  assert.deepEqual(spec.windows, [SELECTED_WINDOW], 'one selected window stays byte-exact');
  const requests = adapter.buildV3PageRequests(spec, spec.windows[0]);
  assert.equal(requests.length, 5);
  for (const request of requests) {
    const body = request.requestBody;
    assert.equal(body.start_date, '20260916');
    assert.equal(body.end_date, '20261002');
    assert.equal(body.include_query.is_smart_queries, false);
    assert.equal(body.include_query.is_remove_bad_product, false);
    assert.deepEqual(body.include_query.official_types, [0]);
    assert.deepEqual(body.include_query.bee_categories, ['c407923064', 'c2140822537']);
    assert.equal(body.exclude_query.is_smart_queries, true);
    assert.equal(body.use_ai_normalized, true);
    if (request.urlPath.endsWith('/insight/')) assert.equal(body.interval_days, 7);
    else {
      assert.equal(body.is_filter_gift, false);
      assert.equal(body.notIncludeDeletedProduct, false);
    }
  }
  const manifest = adapter.buildV3WindowManifest(
    spec, spec.windows[0], selectedObservation(spec), selectedResponses(spec), '2026-10-26T07:00:00.000Z',
  );
  assert.equal(manifest.contractVersion, 'metric-v3-window-capture-v3');
  assert.deepEqual(manifest.window, SELECTED_WINDOW);
  assert.deepEqual(manifest.appliedState, spec.preset);
  assert.equal(manifest.captureGate, 'PASSED');
});

test('v3 selected window keeps every native period-revenue product row in source order', () => {
  const spec = validateMetricV3CaptureSpec(selectedV3Spec()) as any;
  const observation = selectedObservation(spec);
  const responses = selectedResponses(spec);
  const index = responses.findIndex((response: any) => response.urlPath.endsWith('/products/'));
  assert.notEqual(index, -1);
  const rows = Array.from({ length: 20 }, (_, n) => ({
    product_base_id: `1__${1000 + n}__200`, product_name: `Synthetic product ${n + 1}`,
    revenue_custom: n === 6 ? 500 : 1000 - n * 10,
  }));
  responses[index].body.data.products = rows;
  const manifest = adapter.buildV3WindowManifest(spec, spec.windows[0], observation, responses, '2026-10-26T07:00:00.000Z');
  assert.equal(manifest.sourceMap.products, `raw-responses.json#/${index}/body/data`);
  const data = manifest.sourceMap.products.split('#')[1].split('/').slice(1)
    .reduce((value: any, key: string) => value[key], responses);
  assert.deepEqual(data.products, rows, 'all captured candidates, including the tie, keep the source order');
  const request = adapter.buildV3PageRequests(spec, spec.windows[0]).find((r: any) => r.urlPath.endsWith('/products/'));
  assert.equal(request.requestBody.page, 0);
  assert.equal(request.requestBody.limit, 20);
  assert.equal(request.requestBody.sort_by, 'revenue_custom__desc');
});

test('v3 rejects stale applied state or request scope for any saved option', () => {
  const cases: [string, (observation: any, responses: any[]) => void, string][] = [
    ['smart query', (observation) => { observation.appliedState.smartQuery = true; }, 'CAPTURE_APPLIED_STATE_MISMATCH'],
    ['fake filter', (observation) => { observation.appliedState.usefulFilters.fake = true; }, 'CAPTURE_APPLIED_STATE_MISMATCH'],
    ['shop type', (observation) => { observation.appliedState.shopTypes = ['mall', 'regular']; }, 'CAPTURE_APPLIED_STATE_MISMATCH'],
    ['AI normalisation', (observation) => { observation.appliedState.aiNormalisation = false; }, 'CAPTURE_APPLIED_STATE_MISMATCH'],
    ['smart exclusion', (observation) => { observation.appliedState.smartExclusion = false; }, 'CAPTURE_APPLIED_STATE_MISMATCH'],
    ['gift filter request', (_observation, responses) => {
      responses.find((response) => response.urlPath.endsWith('/search-basic/')).requestBody.is_filter_gift = true;
    }, 'CAPTURE_REQUEST_SCOPE_MISMATCH'],
    ['deleted filter request', (_observation, responses) => {
      responses.find((response) => response.urlPath.endsWith('/products/')).requestBody.notIncludeDeletedProduct = true;
    }, 'CAPTURE_REQUEST_SCOPE_MISMATCH'],
    ['request dates', (_observation, responses) => {
      responses.find((response) => response.urlPath.endsWith('/groups/')).requestBody.end_date = '20261003';
    }, 'CAPTURE_REQUEST_SCOPE_MISMATCH'],
    ['trend interval', (_observation, responses) => {
      responses.find((response) => response.urlPath.endsWith('/insight/')).requestBody.interval_days = 30;
    }, 'CAPTURE_TREND_INTERVAL_MISMATCH'],
  ];
  for (const [name, mutate, code] of cases) {
    const spec = validateMetricV3CaptureSpec(selectedV3Spec({
      preset: {
        smartQuery: false,
        usefulFilters: { fake: false, gifts: false, deleted: false },
        shopTypes: ['regular'],
        aiNormalisation: true,
        smartExclusion: true,
      },
    })) as any;
    const observation = selectedObservation(spec);
    const responses = selectedResponses(spec);
    mutate(observation, responses);
    assert.throws(
      () => adapter.buildV3WindowManifest(spec, spec.windows[0], observation, responses, '2026-10-26T07:00:00.000Z'),
      { message: code },
      name,
    );
  }
});

test('v3 refuses empty shop or group selections instead of restoring defaults', () => {
  for (const preset of [
    { shopTypes: [] },
    { category: { id: 'c2035652732', label: 'Sức Khoẻ', children: [] } },
  ]) {
    assert.throws(() => validateMetricV3CaptureSpec(selectedV3Spec({ preset })), /CAPTURE_PRESET_INVALID/);
  }
});

test('customize category refuses the page-request fallback before reading or submitting the page', async () => {
  const spec = validateMetricV3CaptureSpec(selectedV3Spec({ preset: { customizeCategory: true } }));
  let evaluations = 0;
  const page = {
    evaluate: async () => { evaluations += 1; return {}; },
  };
  await assert.rejects(
    adapter.captureV3PageRequests(page, spec, '/tmp/metric-v3-custom-category-unused', 'CAPTURE_UI_CHANGED'),
    { message: 'CAPTURE_CUSTOM_CATEGORY_FALLBACK_UNSUPPORTED' },
  );
  assert.equal(evaluations, 0);
});

function observeSubmits(document: Document) {
  // The adapter clicks inside page.evaluate, so only real DOM events can catch it.
  const events: string[] = [];
  document.addEventListener('click', (event) => {
    const button = (event.target as Element | null)?.closest?.('button');
    if (button && /Analytics|Phân tích/i.test(button.textContent ?? '')) events.push('click:' + button.textContent!.trim());
  }, true);
  document.addEventListener('submit', () => events.push('submit'), true);
  return events;
}

test('wrong, incomplete, ambiguous or loading controls stop before any submit click', async () => {
  const spec = buildCaptureSpec(validateMetricV3CaptureSpec(fixture.spec));
  const platformStart = englishForm.indexOf('<!-- platform-control -->');
  const platformClose = englishForm.indexOf('<!-- /platform-control -->');
  assert.ok(platformStart >= 0 && platformClose > platformStart, 'platform fixture markers are intact');
  const platformEnd = platformClose + '<!-- /platform-control -->'.length;
  const platformBlock = englishForm.slice(platformStart, platformEnd);
  const duplicatePlatforms = englishForm.replace(platformBlock, platformBlock + platformBlock);
  const busySubmit = englishForm.replace('<button>Analytics</button>', '<button aria-busy="true">Analytics<span class="anticon-loading"></span></button>');
  const disabledSubmit = englishForm.replace('<button>Analytics</button>', '<button aria-disabled="true">Analytics</button>');
  const duplicateSubmit = englishForm.replace('<button>Analytics</button>', '<button>Analytics</button><button>Analytics</button>');
  const wrongLabel = englishForm.replace('<div class="label">Platform</div>', '<div class="label">Channel</div>');

  // Calibrate the instrument: a real Analytics click must be observed.
  const calibrationDom = new JSDOM(englishForm, { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
  try {
    const calibration = observeSubmits(calibrationDom.window.document);
    const submit = [...calibrationDom.window.document.querySelectorAll('button')]
      .find((button) => /Analytics/.test(button.textContent ?? ''));
    submit!.click();
    assert.deepEqual(calibration, ['click:Analytics'], 'the observer sees a real Analytics click');
  } finally { calibrationDom.window.close(); }

  const busy = readBilingualObservation(busySubmit);
  assert.deepEqual({ formReady: busy.formReady, submitIdle: busy.submitIdle, submitReady: busy.submitReady }, { formReady: true, submitIdle: false, submitReady: false });
  const disabled = readBilingualObservation(disabledSubmit);
  assert.deepEqual({ submitIdle: disabled.submitIdle, submitReady: disabled.submitReady }, { submitIdle: true, submitReady: false });
  const ambiguous = readBilingualObservation(duplicateSubmit);
  assert.deepEqual({ formReady: ambiguous.formReady, submitIdle: ambiguous.submitIdle, submitReady: ambiguous.submitReady }, { formReady: false, submitIdle: false, submitReady: false });
  assert.equal(readBilingualObservation(duplicatePlatforms).formReady, false, 'two platform controls are ambiguous');
  assert.equal(readBilingualObservation(wrongLabel).formReady, false, 'a renamed control is not guessed');

  const cases: [string, string, string, string | undefined][] = [
    ['wrong platform label', wrongLabel, 'CAPTURE_UI_CHANGED', 'form-readiness'],
    ['ambiguous platform labels', duplicatePlatforms, 'CAPTURE_UI_CHANGED', 'form-readiness'],
    ['ambiguous submit buttons', duplicateSubmit, 'CAPTURE_UI_CHANGED', 'form-readiness'],
    ['loading submit', busySubmit, 'CAPTURE_CONTROL_NOT_SELECTABLE', undefined],
  ];
  for (const [name, html, code, stage] of cases) {
    const dom = new JSDOM(html, { url: 'https://metric.vn/analytics', runScripts: 'outside-only' });
    const w = dom.window, document = w.document;
    Object.defineProperty(w.HTMLElement.prototype, 'innerText', { get() { return this.textContent ?? ''; } });
    stubVisibleLayout(w);
    const submits = observeSubmits(document);
    const page = {
      evaluate: async (fn: Function, arg?: unknown) => w.eval(`(${fn.toString()})(${JSON.stringify(arg === undefined ? '' : arg)})`),
      wait: async () => {},
      click: async (selector: string) => { document.querySelector<HTMLElement>(selector)?.click(); },
    };
    try {
      await assert.rejects(
        adapter.captureV3Preset(page, spec, '/tmp/metric-v3-start-gate-unused', () => {}),
        (error: any) => {
          assert.equal(error.message, code, name);
          if (stage) assert.equal(error.details?.stage, stage, name);
          return true;
        },
      );
      assert.deepEqual(submits, [], name + ': no Analytics submission was triggered');
    } finally { w.close(); }
  }
});

type SortFinal = 'valid' | 'invalid' | 'absent';
type ProducerOptions = {
  initialRows: Record<string, unknown>[]; finalRows: Record<string, unknown>[];
  final: SortFinal; clipped?: boolean; initialSort?: [string, string];
};

/** Browser boundary for the real capture producer: real form observers, panel inspector and evidence code. */
async function captureProducer(t: TestContext, spec: any, options: ProducerOptions) {
  const browser = fakeEvidencePage(false);
  t.after(browser.close);
  const { document, window: pageWindow } = browser.dom.window;
  const panel = document.createElement('div');
  panel.className = 'statistic-item';
  const heading = document.createElement('h2');
  heading.className = 'statistic-item__title';
  heading.textContent = 'Sản phẩm bán chạy';
  panel.append(heading);
  const items: HTMLElement[] = [];
  const openMenu = (index: number) => {
    document.querySelectorAll('.ant-select-dropdown').forEach(node => node.remove());
    const menu = document.createElement('div');
    menu.className = 'ant-select-dropdown';
    for (const label of index === 0 ? ['Doanh số trong kỳ'] : ['Giảm dần']) {
      const option = document.createElement('div');
      option.className = 'ant-select-item-option';
      option.textContent = label;
      option.getBoundingClientRect = () => ({ x: 0, y: 60, left: 0, top: 60, right: 100, bottom: 70, width: 100, height: 10, toJSON() {} });
      option.addEventListener('click', () => { items[index]!.textContent = label; menu.remove(); });
      menu.append(option);
    }
    menu.getBoundingClientRect = () => ({ x: 0, y: 60, left: 0, top: 60, right: 100, bottom: 70, width: 100, height: 10, toJSON() {} });
    document.body.append(menu);
  };
  for (const [index, label] of (options.initialSort ?? ['Doanh số', 'Tăng dần']).entries()) {
    const select = document.createElement('div');
    select.className = 'ant-select';
    const selector = document.createElement('div');
    selector.className = 'ant-select-selector';
    const item = document.createElement('div');
    item.className = 'ant-select-selection-item';
    item.textContent = label;
    select.append(selector, item);
    selector.addEventListener('click', () => openMenu(index));
    select.addEventListener('click', () => openMenu(index));
    panel.append(select);
    items.push(item);
  }
  const wrapper = document.createElement('div');
  if (options.clipped) {
    wrapper.style.overflowY = 'auto';
    Object.defineProperty(wrapper, 'scrollHeight', { value: 200 });
    Object.defineProperty(wrapper, 'clientHeight', { value: 100 });
  }
  const rows = options.finalRows.map((row: any) => {
    const node = document.createElement('div');
    node.className = 'ant-table-row';
    node.setAttribute('data-row-key', row.product_base_id);
    node.textContent = row.product_base_id;
    wrapper.append(node);
    return node;
  });
  panel.append(wrapper);
  document.body.append(panel);
  const bounds = (element: Element, top: number, height: number) => {
    element.getBoundingClientRect = () => ({ x: 0, y: top, left: 0, top, right: 100, bottom: top + height, width: 100, height, toJSON() {} });
  };
  bounds(panel, 40, 150);
  bounds(heading, 42, 8);
  bounds(wrapper, 70, 100);
  [...panel.querySelectorAll('.ant-select')].forEach((select, i) => bounds(select, 52 + i * 8, 6));
  rows.forEach((row, i) => bounds(row, 72 + i * 5, 4));

  const selectedWindow = spec.windows[0];
  const base = selectedObservation(spec);
  const initialResponses = selectedResponses(spec);
  const initialProducts = initialResponses.find((response: any) => response.urlPath === '/v2/market/analytics/products/');
  const initialSorted = /^(Revenue in time period|Revenue|Doanh số trong kỳ|Doanh số)$/i.test((options.initialSort ?? ['Doanh số', 'Tăng dần'])[0]) &&
    /^(Descending|Giảm dần)$/i.test((options.initialSort ?? ['Doanh số', 'Tăng dần'])[1]);
  if (!initialSorted) initialProducts.requestBody.sort_by = 'order_custom__desc';
  initialProducts.body.data.products = options.initialRows;
  const finalProducts = structuredClone(initialProducts);
  finalProducts.requestBody.sort_by = options.final === 'invalid' ? 'order_custom__desc' : 'revenue_custom__desc';
  finalProducts.body.data.products = options.finalRows;
  let keywords: string[] = [];
  let categoriesApplied = false;
  let finalPushed = options.final === 'absent';
  const read = () => ({
    taxonomy: base.taxonomy, selectedCategoryIds: categoriesApplied ? spec.preset.category.children.map((child: any) => child.id) : [],
    advancedVisible: true, categoryMode: 'Advanced', breadcrumb: [], formReady: true, multi: true, keywordInput: '',
    period: structuredClone(selectedWindow.period), submitReady: true, submitIdle: true, resultsReady: true,
    trendIntervalDays: selectedWindow.intervalDays, comparisonDefault: true, displayedKPIs: 'synthetic producer capture',
    appliedState: { ...structuredClone(spec.preset), keywords: [...keywords] },
  });
  const pushFinal = () => {
    if (finalPushed) return;
    finalPushed = true;
    (pageWindow as any).__tdnV3Capture.responses.push(structuredClone(finalProducts));
  };
  const page = {
    evaluate: async (fn: Function, arg?: any) => {
      if (fn.name === 'readV3Page') return read();
      if (fn.name === 'installObserver') {
        (pageWindow as any).__tdnV3Capture = { responses: [], pending: 0, last: 0, overflow: false };
        return { ok: true };
      }
      if (fn.name === 'formAction') {
        if (arg.kind === 'submit') (pageWindow as any).__tdnV3Capture.responses = structuredClone(initialResponses);
        if (arg.kind === 'categoryRoot') categoriesApplied = false;
        if (arg.kind === 'categoryChild') categoriesApplied = true;
        if (arg.kind === 'keyword') keywords.push(arg.value);
        return arg.kind === 'date' ? { done: true } : { ok: true };
      }
      const result = await browser.page.evaluate(fn, arg);
      if (fn.name === 'inspectV3ProductsPanel' && arg?.action === 'option' &&
          /^(Revenue in time period|Revenue|Doanh số trong kỳ|Doanh số)$/i.test(items[0]!.textContent!) &&
          /^(Descending|Giảm dần)$/i.test(items[1]!.textContent!)) pushFinal();
      return result;
    },
    wait: async () => {},
    screenshot: browser.page.screenshot,
  };
  return { page, panel, pushFinal };
}

test('capture keeps pre-sort traffic as diagnostics and publishes the final sorted products source', async (t) => {
  const spec = validateMetricV3CaptureSpec(selectedV3Spec()) as any;
  const initialRows = Array.from({ length: 3 }, (_, i) => ({
    product_base_id: `1__${7000 + i}__801`, product_name: `Initial product ${i + 1}`, revenue_custom: 5_000 - i,
  }));
  const finalRows = Array.from({ length: 20 }, (_, i) => ({
    product_base_id: `1__${8000 + i}__801`, product_name: `Final product ${i + 1}`, revenue_custom: 10_000 - i,
  }));
  const { page } = await captureProducer(t, spec, { initialRows, finalRows, final: 'valid' });
  const output = await mkdtemp(join(tmpdir(), 'metric-producer-sort-'));
  t.after(() => rm(output, { recursive: true, force: true }));
  await adapter.captureV3Preset(page, spec, output, () => {},
    { moduleEvidence: { runId: 'synthetic-producer', requestSha256: 'a'.repeat(64) } });

  const observed = JSON.parse(await readFile(join(output, 'selected/observed-responses.json'), 'utf8'));
  const raw = JSON.parse(await readFile(join(output, 'selected/raw-responses.json'), 'utf8'));
  const manifest = JSON.parse(await readFile(join(output, 'selected/manifest.json'), 'utf8'));
  const observedProducts = observed.filter((response: any) => response.urlPath.endsWith('/products/'));
  const rawProducts = raw.filter((response: any) => response.urlPath.endsWith('/products/'));
  assert.deepEqual(observedProducts.map((response: any) => response.requestBody.sort_by),
    ['order_custom__desc', 'revenue_custom__desc'], 'the pre-sort response stays in observed diagnostics');
  assert.deepEqual(observedProducts[0].body.data.products, initialRows, 'diagnostics keep the initial candidates unchanged');
  assert.equal(rawProducts.length, 1, 'authoritative raw carries only the final products response');
  assert.deepEqual(rawProducts[0].body.data.products, finalRows, 'the full final candidate list is retained');
  assert.equal(manifest.sourceMap.products, `raw-responses.json#/${raw.indexOf(rawProducts[0])}/body/data`,
    'sourceMap addresses the final response inside authoritative bytes');
  assert.equal(raw.length, 5, 'every other endpoint response remains authoritative');
});

test('capture refuses a native sort change without a subsequent valid final products response', async (t) => {
  const spec = validateMetricV3CaptureSpec(selectedV3Spec()) as any;
  const rows = Array.from({ length: 5 }, (_, i) => ({
    product_base_id: `1__${8100 + i}__801`, product_name: `Final product ${i + 1}`, revenue_custom: 10_000 - i,
  }));
  for (const final of ['absent', 'invalid'] as SortFinal[]) {
    const { page } = await captureProducer(t, spec, { initialRows: rows, finalRows: rows, final });
    const output = await mkdtemp(join(tmpdir(), `metric-producer-${final}-`));
    t.after(() => rm(output, { recursive: true, force: true }));
    await assert.rejects(adapter.captureV3Preset(page, spec, output, () => {},
      { moduleEvidence: { runId: 'synthetic-producer', requestSha256: 'a'.repeat(64) } }),
      { message: 'CAPTURE_PRODUCT_SORT_UNAVAILABLE' }, final);
  }
});

test('capture accepts valid sorted data in a clipped panel while whole-panel evidence stays unavailable', async (t) => {
  const req = requestBytes(true);
  const request = JSON.parse(req.toString('utf8'));
  const spec = validateMetricV3CaptureSpec(request.captureSpec) as any;
  const rows = distinctRows(5);
  const { page } = await captureProducer(t, spec, {
    initialRows: rows, finalRows: rows, final: 'absent', clipped: true, initialSort: ['Doanh số', 'Giảm dần'],
  });
  const run = await mkdtemp(join(tmpdir(), 'metric-producer-clipped-'));
  t.after(() => rm(run, { recursive: true, force: true }));
  await mkdir(join(run, 'm1'), { recursive: true });
  await writeFile(join(run, 'request.json'), req);
  await adapter.captureV3Preset(page, spec, join(run, 'm1'), () => {},
    { evidence: true, moduleEvidence: { runId: basename(run), requestSha256: sha256(req) } });
  await mkdir(join(run, 'gates'), { recursive: true });
  await writeFile(join(run, 'gates/m1.json'), jsonBytes({ format: 'handoff-v1', module: 'M1', runId: basename(run),
    skillVersion: '1.0.0', verdict: 'PASS', inputSha256: null, outputSha256: await hashFolder(run, 'm1'),
    checks: [], errorCode: null, next: null }));
  await main(run);

  const evidence = JSON.parse(await readFile(join(run, 'm1/selected/evidence/manifest.json'), 'utf8'));
  assert.deepEqual([evidence.topProductsProof.status, evidence.topProductsProof.code],
    ['UNAVAILABLE', 'EVIDENCE_PRODUCTS_PANEL_CLIPPED'], 'clipping makes the whole-panel proof explicitly unavailable');
  const output = await moduleOutputs(run) as any;
  assert.deepEqual([output.m1.dataValid, output.m1.shopeeRowCount], [true, 5], 'valid sorted data still passes M1');
  assert.equal(output.m2.fiveDistinct, true);
  assert.equal(output.m2.errorCode, 'EVIDENCE_PRODUCTS_PANEL_CLIPPED', 'M2 cannot pass without retained panel coverage');
  assert.equal(output.m2.evidence.topProducts.available, false);
});
