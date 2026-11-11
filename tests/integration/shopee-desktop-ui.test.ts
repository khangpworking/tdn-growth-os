import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../../tools/shopee-desktop/index.html', import.meta.url), 'utf8');

const preset = (presetId: string, label: string) => ({
  presetId, label, keywords: [label], categoryLabel: 'Sức Khoẻ', source: 'manual',
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

async function waitFor(check: () => boolean, label: string, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for ' + label);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The real page, with a fake pywebview bridge whose preset refresh can be held open. */
function harness(options: {
  runInfo?: any; runInfoByRun?: Record<string, any>; runs?: any[]; sampling?: any;
  samplingByRun?: Record<string, any>; reviewGates?: Record<string, Deferred<void>>;
  saveGate?: Deferred<any> | undefined; refreshCountResult?: any;
  reviewData?: any; reviewDataByRun?: Record<string, any>;
  exportReviewResult?: (runId: string, input: any) => any;
} = {}) {
  const state: {
    addCalls: number; presetsCalls: number; newRunCalls: number; listRunsCalls: number;
    refreshCountCalls: number;
    presets: ReturnType<typeof preset>[];
    refresh: Deferred<any> | undefined;
    addResult: ((input: any) => any) | undefined;
    sampling: any;
    samplingByRun: Record<string, any> | undefined;
    reviewGates: Record<string, Deferred<void>> | undefined;
    reviewSamplingCalls: number;
    reviewSamplingCallsByRun: Record<string, number>;
    reviewDataCalls: number;
    reviewDataCallsByRun: Record<string, number>;
    reviewDataView: any;
    reviewDataByRun: Record<string, any>;
    saveReviewDataCalls: any[];
    exportReviewDataCalls: any[];
    exportReviewResult: ((runId: string, input: any) => any) | undefined;
    saveCalls: any[];
    launchCalls: any[];
    controlCalls: any[];
    refreshCountResult: any;
    saveGate: Deferred<any> | undefined;
  } = {
    addCalls: 0, presetsCalls: 0, newRunCalls: 0, listRunsCalls: 0, refreshCountCalls: 0,
    presets: [preset('kem', 'Kem chống nắng')],
    refresh: undefined,
    addResult: undefined,
    sampling: options.sampling ? clone(options.sampling) : undefined,
    samplingByRun: options.samplingByRun ? clone(options.samplingByRun) : undefined,
    reviewGates: options.reviewGates,
    reviewSamplingCalls: 0,
    reviewSamplingCallsByRun: {},
    reviewDataCalls: 0,
    reviewDataCallsByRun: {},
    reviewDataView: options.reviewData ? clone(options.reviewData) : undefined,
    reviewDataByRun: options.reviewDataByRun ? clone(options.reviewDataByRun) : {},
    saveReviewDataCalls: [],
    exportReviewDataCalls: [],
    exportReviewResult: options.exportReviewResult,
    saveCalls: [], launchCalls: [], controlCalls: [],
    refreshCountResult: options.refreshCountResult,
    saveGate: options.saveGate,
  };
  const planSha = () => (state.sampling.plans.length + 1).toString(16).padStart(64, '0');
  const api = {
    connection: async () => ({ ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic' } }),
    presets: async () => {
      state.presetsCalls++;
      if (state.refresh) return state.refresh.promise;
      return { ok: true, data: { format: 'presets-v1', presets: state.presets.slice() } };
    },
    listRuns: async () => {
      state.listRunsCalls++;
      return { ok: true, data: { format: 'runs-v1', runs: options.runs || [] } };
    },
    library: async () => ({ ok: true, data: { format: 'library-v1', modules: {}, skills: [] } }),
    newRun: async () => {
      state.newRunCalls++;
      return { ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } };
    },
    status: async (runId: string) => {
      const info = (options.runInfoByRun && options.runInfoByRun[runId]) || options.runInfo;
      if (info) return { ok: true, data: clone(info) };
      return { ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } };
    },
    runFlow: async () => ({ ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } }),
    reviewData: async (runId: string) => {
      state.reviewDataCalls++;
      state.reviewDataCallsByRun[runId] = (state.reviewDataCallsByRun[runId] || 0) + 1;
      const view = state.reviewDataByRun[runId] || state.reviewDataView;
      if (view) return { ok: true, data: clone(view) };
      return { ok: true, data: {
        format: 'review-data-view-v1', runId, readonly: false, tracking: null,
        db: { configured: false, schemaReady: false, blockedBy: null }, sources: [],
      } };
    },
    saveReviewData: async (runId: string, input: any) => {
      state.saveReviewDataCalls.push({ runId, input: clone(input) });
      return { ok: true, data: {
        format: 'review-data-saved-v1', runId, sourceSha256: input.sourceSha256,
        datasetId: 'dataset-synthetic', importPolicyVersion: 'module-m3-s05-v1',
        importedAt: '2026-11-11T04:30:00.000Z', rowCount: 12, reviewsInserted: 10,
        reviewsAlreadyPresent: 2, runReviewsInserted: 12, firstVersionDiffers: 0, reused: false,
      } };
    },
    exportReviewData: async (runId: string, input: any) => {
      state.exportReviewDataCalls.push({ runId, input: clone(input) });
      if (state.exportReviewResult) return state.exportReviewResult(runId, clone(input));
      return { ok: true, data: {
        receipt: {
          format: 'review-data-export-v1', runId, sourceSha256: input.sourceSha256,
          exportFormat: input.format, exportVersion: 'module-review-export-v1',
          exportSha256: 'd'.repeat(64), byteSize: 100,
          fileName: 'shopee-' + runId + '.' + input.format, rowCount: 12, reused: false,
        },
        fileName: 'shopee-' + runId + '.' + input.format, saved: true, cancelled: false,
      } };
    },
    reviewSampling: async (runId: string) => {
      state.reviewSamplingCalls++;
      state.reviewSamplingCallsByRun[runId] = (state.reviewSamplingCallsByRun[runId] || 0) + 1;
      const gate = state.reviewGates && state.reviewGates[runId];
      if (gate) await gate.promise;
      const view = state.samplingByRun && state.samplingByRun[runId] || state.sampling;
      if (!view || view.runId !== runId) {
        return { ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } };
      }
      return { ok: true, data: clone(view) };
    },
    saveReviewPlan: async (runId: string, input: any) => {
      state.saveCalls.push({ runId, input: clone(input) });
      if (state.saveGate) await state.saveGate.promise;
      const sha = planSha();
      const plan = {
        format: 'shopee-review-plan-v1', runId, requestSha256: 'b'.repeat(64),
        m2Digest: state.sampling.m2Digest,
        policy: {
          format: 'shopee-review-policy-v1', mode: input.mode, stars: input.stars.slice().sort(),
          totalPerLink: input.totalPerLink, allocation: input.allocation, textRule: 'comment-or-attributes-v1',
        },
        policySha256: sha, targets: [], links: clone(state.sampling.links),
      };
      state.sampling.plans.push({ planSha256: sha, plan });
      state.sampling.plans.sort((a: any, b: any) => a.planSha256.localeCompare(b.planSha256));
      return { ok: true, data: { format: 'review-plan-saved-v1', runId, planSha256: sha, plan } };
    },
    runModule: async (runId: string, module: string, sha?: string) => {
      state.launchCalls.push({ runId, module, sha });
      const saved = (state.sampling?.plans || []).find((entry: any) => entry.planSha256 === sha);
      if (module !== 'm3' || !saved) return { ok: false, error: { code: 'PLAN_NOT_SAVED', message: 'PLAN_NOT_SAVED' } };
      return { ok: true, data: {
        format: 'review-attempt-start-v1', runId, attemptId: 'attempt-synthetic',
        planSha256: sha, status: 'RUNNING', pid: 1234,
      } };
    },
    refreshReviewCounts: async () => {
      state.refreshCountCalls++;
      if (state.refreshCountResult) {
        const res = state.refreshCountResult;
        if (res.ok) {
          state.sampling.countRefresh = {
            attemptId: res.data.attemptId, status: 'RUNNING', errorCode: null,
            stopRequested: false, reconcilable: false,
          };
        }
        return res;
      }
      return { ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } };
    },
    stopReviewAttempt: async (runId: string, kind: string, attemptId: string) => {
      state.controlCalls.push({ action: 'stop', runId, kind, attemptId });
      if (kind === 'counts' && state.sampling.countRefresh) state.sampling.countRefresh.stopRequested = true;
      if (kind === 'custom' && state.sampling.attempts.length) {
        state.sampling.attempts[state.sampling.attempts.length - 1].stopRequested = true;
      }
      return { ok: true, data: {
        format: 'review-attempt-control-v1', runId, kind, attemptId,
        status: 'STOP_REQUESTED', pid: 1234, errorCode: null,
      } };
    },
    reconcileReviewAttempt: async (runId: string, kind: string, attemptId: string) => {
      state.controlCalls.push({ action: 'reconcile', runId, kind, attemptId });
      return { ok: true, data: {
        format: 'review-attempt-control-v1', runId, kind, attemptId,
        status: 'RUNNING', pid: 5678, errorCode: null,
      } };
    },
    addProduct: async (input: any) => {
      state.addCalls++;
      if (state.addResult) return state.addResult(input);
      state.presets.push(preset(input.presetId, input.label));
      return { ok: true, data: { format: 'add-product-v1', presetId: input.presetId, label: input.label } };
    },
  };
  const dom = new JSDOM(html, {
    url: 'file:///shopee-desktop/index.html',
    runScripts: 'dangerously',
    beforeParse(window) { (window as any).pywebview = { api }; },
  });
  return { dom, doc: dom.window.document, window: dom.window, state };
}

const element = <T extends HTMLElement>(doc: Document, id: string): T => doc.getElementById(id) as T;

function fill(doc: Document, label: string, keyword: string): void {
  element<HTMLInputElement>(doc, 'productLabel').value = label;
  element<HTMLInputElement>(doc, 'productKeyword').value = keyword;
  element<HTMLSelectElement>(doc, 'productCategory').value = 'c2035652732';
}

/** A user-like click on the submit button; the page owns the form submit handler. */
const save = (doc: Document) => element<HTMLButtonElement>(doc, 'btnProductSave').click();

async function booted(doc: Document): Promise<void> {
  await waitFor(() => element<HTMLButtonElement>(doc, 'btnProductSave').disabled === false, 'connected product form');
}

test('a slow preset refresh keeps the save pending, blocks edits and duplicate submits, then applies the saved product', async () => {
  const { dom, doc, state, window } = harness();
  try {
    await booted(doc);
    fill(doc, 'Viên uống vitamin C', 'vitamin C');
    state.refresh = deferred();
    save(doc);
    await waitFor(() => state.addCalls === 1, 'add-product started');
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === false, 'pending while the refresh is in flight');

    const label = element<HTMLInputElement>(doc, 'productLabel');
    const saveBtn = element<HTMLButtonElement>(doc, 'btnProductSave');
    assert.equal(saveBtn.disabled, true, 'save stays disabled through the whole operation');
    assert.equal(label.disabled, true, 'the form is protected while the save is in flight');
    assert.equal(element<HTMLInputElement>(doc, 'productKeyword').disabled, true);
    assert.equal(element<HTMLSelectElement>(doc, 'productCategory').disabled, true);
    assert.equal(element<HTMLButtonElement>(doc, 'btnNew').disabled, false, 'the new-run control is untouched');

    // A second user attempt and a direct submit event must not start another save.
    label.value = 'Viên uống vitamin C mới';
    save(doc);
    element<HTMLFormElement>(doc, 'productForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(state.addCalls, 1, 'a duplicate submission is refused while the operation is pending');
    assert.equal(state.newRunCalls, 0, 'saving a product never creates a run');
    assert.equal(state.listRunsCalls, 1, 'saving a product never refreshes runs');

    const refreshed = [preset('kem', 'Kem chống nắng'), preset('vien-uong-vitamin-c', 'Viên uống vitamin C')];
    state.refresh.resolve({ ok: true, data: { format: 'presets-v1', presets: refreshed } });
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === true, 'pending cleared after refresh');

    const select = element<HTMLSelectElement>(doc, 'presetSel');
    assert.equal(select.value, 'vien-uong-vitamin-c');
    assert.ok([...select.options].some((option) => option.value === 'kem'), 'the old preset is preserved');
    assert.match(element<HTMLElement>(doc, 'productSaved').textContent!, /Viên uống vitamin C/);
    assert.equal(label.value, '', 'the form resets only after the saved preset is selected');
    assert.equal(label.disabled, false, 'the form is restored after success');
    assert.equal(saveBtn.disabled, false, 'save is re-enabled after success');
  } finally { dom.window.close(); }
});

test('a failed preset refresh restores the form, keeps the saved product message and allows a retry', async () => {
  const { dom, doc, state } = harness();
  try {
    await booted(doc);
    fill(doc, 'Viên uống vitamin C', 'vitamin C');
    state.refresh = deferred();
    save(doc);
    await waitFor(() => state.addCalls === 1, 'add-product started');
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === false, 'pending while the refresh is in flight');

    state.refresh.resolve({ ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } });
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === true, 'pending cleared after the refresh failure');
    assert.match(element<HTMLElement>(doc, 'productSaved').textContent!, /Đã lưu “Viên uống vitamin C”/);
    assert.match(element<HTMLElement>(doc, 'errbar').textContent!, /SSH_TIMEOUT/);
    const label = element<HTMLInputElement>(doc, 'productLabel');
    assert.equal(label.value, 'Viên uống vitamin C', 'the values stay so the user can retry');
    assert.equal(label.disabled, false, 'the form is restored after the refresh failure');
    assert.equal(element<HTMLButtonElement>(doc, 'btnProductSave').disabled, false, 'save is restored after the refresh failure');

    state.refresh = undefined;
    state.presets = [preset('kem', 'Kem chống nắng'), preset('vien-uong-vitamin-c', 'Viên uống vitamin C')];
    save(doc);
    await waitFor(() => state.addCalls === 2 && element<HTMLElement>(doc, 'productPending').hidden === true, 'retry completes');
  } finally { dom.window.close(); }
});

test('a rejected save restores the form, shows the product error and does not refresh presets', async () => {
  const { dom, doc, state } = harness();
  try {
    await booted(doc);
    fill(doc, 'Viên uống vitamin C', 'vitamin C');
    const presetsBefore = state.presetsCalls;
    state.addResult = () => ({ ok: false, error: { code: 'PRESET_BUSY', message: 'PRESET_BUSY' } });
    save(doc);
    await waitFor(() => element<HTMLElement>(doc, 'productErr').hidden === false, 'product error');

    assert.match(element<HTMLElement>(doc, 'productErr').textContent!, /PRESET_BUSY/);
    assert.equal(element<HTMLElement>(doc, 'productPending').hidden, true);
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').value, 'Viên uống vitamin C');
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').disabled, false);
    assert.equal(element<HTMLElement>(doc, 'productSaved').hidden, true);
    assert.equal(element<HTMLButtonElement>(doc, 'btnProductSave').disabled, false);
    assert.equal(state.presetsCalls, presetsBefore, 'a rejected save does not refresh presets');
  } finally { dom.window.close(); }
});

const passSlip = (module: string) => ({
  format: 'handoff-v1', module, verdict: 'PASS', checks: [], errorCode: null,
  inputSha256: 'synthetic-in', outputSha256: 'synthetic-out', next: null,
});

/** Synthetic run-info for the M3 panel; no live source or native DOM is involved. */
function syntheticRunInfo(runId = 'run-synthetic') {
  const module = (id: string, inputGate: string, canRun: boolean) => ({
    id, title: id, skill: 'synthetic-module', inputGate, outputGate: id.toLowerCase(), canRun, blockedBy: null,
  });
  return {
    format: 'run-info-v1', runId, readonly: false,
    request: { format: 'request-v1', reviewCapPerLink: 300 },
    state: { status: 'IDLE', module: null, errorCode: null },
    modules: [module('M1', 'entry', false), module('M2', 'm1', false), module('M3', 'm2', true)],
    gates: { entry: passSlip('ENTRY'), m1: passSlip('M1'), m2: passSlip('M2'), m3: null },
    selection: {
      format: 'selection-v1', runId,
      links: [{ rank: 1, brand: 'Nhãn tổng hợp', revenue: 123456, reason: 'Dòng tổng hợp' }],
    },
  };
}

function fire(window: any, node: Element, type: string): void {
  node.dispatchEvent(new window.Event(type, { bubbles: true }));
}

/** A synthetic review-sampling view bound to the same validated M2 links. */
function syntheticSampling(overrides: any = {}) {
  return {
    format: 'review-sampling-view-v1', runId: 'run-synthetic', readonly: false,
    m2Digest: 'a'.repeat(64),
    links: [
      { shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200' },
      { shopId: '101', itemId: '201', url: 'https://shopee.vn/product/101/201' },
    ],
    defaultInput: { mode: 'with-comments', stars: [], totalPerLink: 300, allocation: 'pooled' },
    plans: [], counts: [], countRefresh: null, attempts: [], blockedBy: null,
    ...overrides,
  };
}

function syntheticReviewSource(overrides: any = {}) {
  return {
    sourceSha256: 'c'.repeat(64), kind: 'custom', attemptId: 'attempt-review',
    planSha256: 'b'.repeat(64), status: 'SUCCEEDED', gateVerdict: 'PASS',
    completedAt: '2026-11-11T04:30:00.000Z', rowBasis: 'published', rowCount: 12,
    links: [{
      shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200',
      requested: 12, actual: 12, shortfall: 0, complete: true, status: 'SUCCEEDED',
    }],
    canExport: true, exportBlockedBy: null,
    exportFormats: {
      json: { canExport: true, blockedBy: null, receipt: null },
      txt: { canExport: true, blockedBy: null, receipt: null },
    },
    canSaveDb: true, dbBlockedBy: null, importReceipt: null,
    ...overrides,
  };
}

function syntheticReviewData(overrides: any = {}) {
  return {
    format: 'review-data-view-v1', runId: 'run-synthetic', readonly: false,
    tracking: {
      primaryKeyword: 'kem', firstRunAt: '2026-11-11T04:26:00.000Z',
      timeBasis: 'recorded-first-accepted', displayTimezone: 'Asia/Ho_Chi_Minh',
      lastKnownStartedAt: null,
    },
    db: { configured: true, schemaReady: true, blockedBy: null },
    sources: [syntheticReviewSource()],
    ...overrides,
  };
}

async function samplingHarness(sampling: any = {}, options: {
  saveGate?: Deferred<any> | undefined; refreshCountResult?: any;
} = {}) {
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'IDLE' }],
    runInfo: syntheticRunInfo(),
    sampling: syntheticSampling(sampling),
    saveGate: options.saveGate,
    refreshCountResult: options.refreshCountResult,
  });
  await waitFor(() => result.doc.getElementById('rsPanel') !== null, 'sampling panel');
  await waitFor(() => result.doc.getElementById('rsN') !== null, 'sampling defaults');
  return result;
}

function buttonByText(doc: Document, text: string): HTMLButtonElement | undefined {
  return [...doc.querySelectorAll('#rsPanel button')]
    .find((button) => button.textContent === text) as HTMLButtonElement | undefined;
}

test('the M3 panel keeps legacy with-comments and one shared 300 input for a selected run', async () => {
  const { dom, doc, state } = await samplingHarness();
  try {
    assert.equal(element<HTMLInputElement>(doc, 'rsMode-with-comments').checked, true);
    assert.equal(element<HTMLInputElement>(doc, 'rsN').value, '300');
    assert.equal(element<HTMLInputElement>(doc, 'rsN').min, '1');
    assert.equal(element<HTMLInputElement>(doc, 'rsN').max, '2000');
    assert.equal(element<HTMLInputElement>(doc, 'rsBalanced').disabled, true);
    assert.equal(element<HTMLElement>(doc, 'rsStars').hidden, true);
    assert.equal(doc.querySelectorAll('#rsPanel input[type="number"]').length, 1);
    assert.equal(doc.querySelectorAll('#rsPanel input[data-star]').length, 5);
    assert.equal(doc.querySelectorAll('#rsStars input:checked').length, 0);
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Có bình luận · 300/);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Chỉ thu bình luận có chữ/);
    assert.doesNotMatch(doc.getElementById('rsPanel')!.textContent!, /ảnh|video|hình ảnh|media/i);
    assert.equal(state.refreshCountCalls, 0, 'opening the run must not refresh source counts');

    assert.equal(element<HTMLInputElement>(doc, 'cap').max, '300');
    assert.equal(element<HTMLInputElement>(doc, 'cap').value, '300');
  } finally { dom.window.close(); }
});

test('star mode uses OR selection and one shared total; equal quotas are read-only with an ascending remainder', async () => {
  const { dom, doc, window, state } = await samplingHarness();
  try {
    const starsMode = element<HTMLInputElement>(doc, 'rsMode-stars');
    starsMode.checked = true;
    fire(window, starsMode, 'change');
    assert.equal(element<HTMLElement>(doc, 'rsStars').hidden, false);
    assert.equal(element<HTMLInputElement>(doc, 'rsBalanced').disabled, false);
    assert.match(element<HTMLElement>(doc, 'rsHint').textContent!, /ít nhất một mức sao/);

    for (const star of [1, 2, 3, 4, 5]) {
      const box = doc.querySelector(`#rsStars input[data-star="${star}"]`) as HTMLInputElement;
      box.checked = true;
      fire(window, box, 'change');
    }
    assert.match(element<HTMLElement>(doc, 'rsOrder').textContent!, /từ sao thấp đến cao/,
      'pooled order is disclosed as deterministic low-star-first');
    const balanced = element<HTMLInputElement>(doc, 'rsBalanced');
    balanced.checked = true;
    fire(window, balanced, 'change');
    assert.match(element<HTMLElement>(doc, 'rsOrder').textContent!, /Chia đều/);
    assert.match(element<HTMLElement>(doc, 'rsOrder').textContent!, /không bù/);
    const n = element<HTMLInputElement>(doc, 'rsN');
    n.value = '302';
    fire(window, n, 'input');

    const quotas = [...doc.querySelectorAll('#rsQuota > div')].map((row) => [
      row.querySelector('dt')!.textContent,
      row.querySelector('dd')!.textContent,
    ]);
    assert.deepEqual(quotas, [
      ['Sao 1★', '61'], ['Sao 2★', '61'], ['Sao 3★', '60'], ['Sao 4★', '60'], ['Sao 5★', '60'],
    ]);
    assert.equal(doc.querySelectorAll('#rsPanel input[type="number"]').length, 1, 'one shared quantity input');
    assert.equal(doc.querySelectorAll('#rsQuota input').length, 0, 'quotas are read-only');
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Sao 1, 2, 3, 4, 5 · 302/);
    assert.equal(state.refreshCountCalls, 0, 'changing the selection must not refresh source counts');
  } finally { dom.window.close(); }
});

test('the shared M3 quantity accepts 1 and 2000 and refuses values outside that range', async () => {
  const { dom, doc, window } = await samplingHarness();
  try {
    const starsMode = element<HTMLInputElement>(doc, 'rsMode-stars');
    starsMode.checked = true;
    fire(window, starsMode, 'change');
    const star = doc.querySelector('#rsStars input[data-star="3"]') as HTMLInputElement;
    star.checked = true;
    fire(window, star, 'change');

    const n = element<HTMLInputElement>(doc, 'rsN');
    for (const invalid of ['2001', '0', '']) {
      n.value = invalid;
      fire(window, n, 'input');
      assert.equal(element<HTMLElement>(doc, 'rsHint').hidden, false, `${invalid || 'empty'} is refused`);
      assert.match(element<HTMLElement>(doc, 'rsHint').textContent!, /1 đến 2000/);
    }

    n.value = '2000';
    fire(window, n, 'input');
    assert.equal(element<HTMLElement>(doc, 'rsHint').hidden, true);
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /2000/);

    n.value = '1';
    fire(window, n, 'input');
    assert.equal(element<HTMLElement>(doc, 'rsHint').hidden, true);
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /1 bình luận/);
  } finally { dom.window.close(); }
});

test('switching source modes keeps stars exclusive and both plain modes text-only', async () => {
  const { dom, doc, window } = await samplingHarness();
  try {
    const starsMode = element<HTMLInputElement>(doc, 'rsMode-stars');
    starsMode.checked = true;
    fire(window, starsMode, 'change');
    const star = doc.querySelector('#rsStars input[data-star="4"]') as HTMLInputElement;
    star.checked = true;
    fire(window, star, 'change');
    const balanced = element<HTMLInputElement>(doc, 'rsBalanced');
    balanced.checked = true;
    fire(window, balanced, 'change');
    assert.equal(element<HTMLElement>(doc, 'rsQuota').hidden, false);

    const allMode = element<HTMLInputElement>(doc, 'rsMode-all');
    allMode.checked = true;
    fire(window, allMode, 'change');
    assert.equal(element<HTMLElement>(doc, 'rsStars').hidden, true);
    assert.equal(element<HTMLInputElement>(doc, 'rsBalanced').disabled, true);
    assert.equal(element<HTMLInputElement>(doc, 'rsBalanced').checked, false);
    assert.equal(element<HTMLElement>(doc, 'rsQuota').hidden, true);
    assert.equal(element<HTMLElement>(doc, 'rsOrder').hidden, true, 'order notes are stars-only');
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Tất cả đánh giá · 300/);

    const legacyMode = element<HTMLInputElement>(doc, 'rsMode-with-comments');
    legacyMode.checked = true;
    fire(window, legacyMode, 'change');
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Có bình luận · 300/);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Chỉ thu bình luận có chữ/);
  } finally { dom.window.close(); }
});

test('saving sends exactly the four contract keys and launch uses that saved plan', async () => {
  const { dom, doc, window, state } = await samplingHarness();
  try {
    assert.equal(buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled, true, 'no unsaved plan can launch');

    const starsMode = element<HTMLInputElement>(doc, 'rsMode-stars');
    starsMode.checked = true;
    fire(window, starsMode, 'change');
    for (const star of [3, 1, 2]) {
      const box = doc.querySelector(`#rsStars input[data-star="${star}"]`) as HTMLInputElement;
      box.checked = true;
      fire(window, box, 'change');
    }
    const balanced = element<HTMLInputElement>(doc, 'rsBalanced');
    balanced.checked = true;
    fire(window, balanced, 'change');
    const n = element<HTMLInputElement>(doc, 'rsN');
    n.value = '302';
    fire(window, n, 'input');

    assert.equal(buttonByText(doc, 'Lưu lựa chọn')!.disabled, false);
    buttonByText(doc, 'Lưu lựa chọn')!.click();
    await waitFor(() => state.saveCalls.length === 1, 'plan saved');
    assert.deepEqual(state.saveCalls[0].input, {
      mode: 'stars', stars: [1, 2, 3], totalPerLink: 302, allocation: 'equal-stars',
    });

    await waitFor(() => buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled === false, 'launch after save');
    const savedSha = state.sampling.plans[0].planSha256;
    buttonByText(doc, 'Thu bình luận theo lựa chọn')!.click();
    await waitFor(() => state.launchCalls.length === 1, 'custom M3 launch');
    assert.deepEqual(state.launchCalls[0], { runId: 'run-synthetic', module: 'm3', sha: savedSha });
    assert.equal(state.refreshCountCalls, 0, 'saving or launching never refreshes source counts');
  } finally { dom.window.close(); }
});

test('editing after saving invalidates launch until the new draft is saved', async () => {
  const { dom, doc, window, state } = await samplingHarness();
  try {
    buttonByText(doc, 'Lưu lựa chọn')!.click();
    await waitFor(() => state.sampling.plans.length === 1, 'first plan');
    await waitFor(() => buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled === false, 'launch after first save');

    const n = element<HTMLInputElement>(doc, 'rsN');
    n.value = '301';
    fire(window, n, 'input');
    assert.equal(buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled, true,
      'a changed draft must not reuse the older saved plan');
    assert.match(doc.querySelector('#rsPanel .rs-head .chip')!.textContent!, /Có thay đổi chưa lưu/);

    buttonByText(doc, 'Lưu lựa chọn')!.click();
    await waitFor(() => state.sampling.plans.length === 2, 'second plan');
    await waitFor(() => buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled === false, 'launch after second save');
    assert.equal(state.launchCalls.length, 0, 'an unsaved edit never reached the launch command');
  } finally { dom.window.close(); }
});

test('a late save completion keeps edits made while the save was in flight', async () => {
  const gate = deferred<any>();
  const { dom, doc, window, state } = await samplingHarness({}, { saveGate: gate });
  try {
    buttonByText(doc, 'Lưu lựa chọn')!.click();
    await waitFor(() => state.saveCalls.length === 1, 'save started');
    const n = element<HTMLInputElement>(doc, 'rsN');
    n.value = '301';
    fire(window, n, 'input');

    gate.resolve(undefined);
    await waitFor(() => state.sampling.plans.length === 1 && /Có thay đổi chưa lưu/.test(
      doc.querySelector('#rsPanel .rs-head .chip')!.textContent!), 'reload after late save');

    assert.equal(element<HTMLInputElement>(doc, 'rsN').value, '301', 'the newer edit survives the late completion');
    assert.equal(buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled, true,
      'the older saved policy does not authorize the edited draft');
  } finally { dom.window.close(); }
});

test('source counts show observed values and short reasons for unknown cells without leaking digests', async () => {
  const observedAt = '2026-11-01T02:03:04.000Z';
  const counts = [
    {
      format: 'shopee-review-counts-v1', shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200',
      observedAt, snapshotDigest: 'c'.repeat(64),
      stars: {
        '1': { status: 'observed', value: 3 }, '2': { status: 'observed', value: 2 },
        '3': { status: 'observed', value: 4 }, '4': { status: 'observed', value: 5 },
        '5': { status: 'observed', value: 10 },
      },
      withComments: { status: 'observed', value: 20 },
    },
    {
      format: 'shopee-review-counts-v1', shopId: '101', itemId: '201', url: 'https://shopee.vn/product/101/201',
      observedAt, snapshotDigest: 'd'.repeat(64),
      stars: {
        '1': { status: 'missing', value: null }, '2': { status: 'ambiguous', value: null },
        '3': { status: 'unavailable', value: null }, '4': { status: 'observed', value: 0 },
        '5': { status: 'observed', value: 7 },
      },
      withComments: { status: 'unavailable', value: null },
    },
  ];
  const { dom, doc, state } = await samplingHarness({ counts });
  try {
    const rows = [...doc.querySelectorAll('#rsPanel .rs-counts tbody tr')];
    assert.equal(rows.length, 2);
    assert.deepEqual([...rows[0]!.querySelectorAll('td')].slice(1, 7).map((cell) => cell.textContent), [
      '10', '5', '4', '2', '3', '20',
    ]);
    assert.deepEqual([...rows[1]!.querySelectorAll('td')].slice(1, 7).map((cell) => cell.textContent), [
      '7', '0', '— không đọc được', '— không rõ', '— không thấy', '— không đọc được',
    ]);
    const panelText = doc.getElementById('rsPanel')!.textContent!;
    assert.doesNotMatch(panelText, /snapshotDigest/);
    assert.ok(!panelText.includes('c'.repeat(64)) && !panelText.includes('d'.repeat(64)), 'digests stay internal');
    assert.match(panelText, /có thể gồm đánh giá không có chữ/);
    assert.equal(state.refreshCountCalls, 0, 'opening the view never refreshes source counts');
  } finally { dom.window.close(); }
});

test('a refresh start is running only; last counts stay and stop targets the exact counts attempt', async () => {
  const refreshCountResult = { ok: true, data: {
    format: 'review-counts-start-v1', runId: 'run-synthetic',
    attemptId: 'counts-attempt-1', status: 'RUNNING', pid: 4242,
  } };
  const { dom, doc, state } = await samplingHarness({}, { refreshCountResult });
  try {
    buttonByText(doc, 'Đọc số đánh giá trên Shopee')!.click();
    await waitFor(() => state.refreshCountCalls === 1, 'refresh started');
    await waitFor(() => /Đang đọc số đánh giá trên Shopee/.test(doc.getElementById('rsPanel')!.textContent!), 'running state');
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Chưa có số đánh giá/, 'a start is not completed counts');
    assert.ok(buttonByText(doc, 'Dừng đọc số đánh giá'), 'the counts attempt can be stopped by attempt id');

    buttonByText(doc, 'Dừng đọc số đánh giá')!.click();
    await waitFor(() => state.controlCalls.length === 1, 'counts stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'counts', attemptId: 'counts-attempt-1',
    });
    await waitFor(() => /Đang dừng đọc số đánh giá/.test(doc.getElementById('rsPanel')!.textContent!), 'stop requested');
    assert.equal(buttonByText(doc, 'Dừng đọc số đánh giá'), undefined);
  } finally { dom.window.close(); }
});

test('an unfinished attempt shows dash for unobserved star values and stops by exact attempt id', async () => {
  const attempt = {
    attemptId: 'attempt-live-1', planSha256: 'e'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{
      shopId: '100', itemId: '200', requested: 120, actual: null, shortfall: null, stopReason: '',
      stars: [
        { star: 1, target: 60, actual: null, shortfall: null },
        { star: 2, target: 60, actual: null, shortfall: null },
      ],
    }],
  };
  const { dom, doc, state } = await samplingHarness({ attempts: [attempt] });
  try {
    const text = doc.getElementById('rsPanel')!.textContent!;
    assert.match(text, /Sao 1: —\/60 \(thiếu —\)/, 'an unobserved star is a dash, never zero');
    assert.doesNotMatch(text, /\(thiếu 0\)|actual: 0/);
    assert.ok(!text.includes('attempt-live-1'), 'the attempt namespace stays internal');

    buttonByText(doc, 'Dừng lần chạy này')!.click();
    await waitFor(() => state.controlCalls.length === 1, 'custom stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-live-1',
    });
    await waitFor(() => /Đã yêu cầu dừng lần chạy này/.test(doc.getElementById('rsPanel')!.textContent!), 'stop requested');
    assert.equal(buttonByText(doc, 'Dừng lần chạy này'), undefined);
  } finally { dom.window.close(); }
});

test('an uncertain attempt stops the exact attempt before reconciling it', async () => {
  const attempt = {
    attemptId: 'attempt-uncertain-1', planSha256: 'f'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'UNCERTAIN', errorCode: null, gate: null, stopRequested: false, reconcilable: true,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  const { dom, doc, state } = await samplingHarness({ attempts: [attempt], blockedBy: { code: 'ATTEMPT_UNCERTAIN' } });
  try {
    assert.equal(buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled, true);
    buttonByText(doc, 'Dừng lần chạy này')!.click();
    await waitFor(() => state.controlCalls.length === 1, 'uncertain stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-uncertain-1',
    });
    await waitFor(() => /Đã yêu cầu dừng lần chạy này/.test(doc.getElementById('rsPanel')!.textContent!), 'stop requested');
    assert.equal(buttonByText(doc, 'Dừng lần chạy này'), undefined);
    buttonByText(doc, 'Đối soát lần chạy')!.click();
    await waitFor(() => state.controlCalls.length === 2, 'reconcile');
    assert.deepEqual(state.controlCalls[1], {
      action: 'reconcile', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-uncertain-1',
    });
    assert.equal(state.launchCalls.length, 0, 'reconcile never submits a new attempt');
  } finally { dom.window.close(); }
});

test('an uncertain counts refresh can be stopped by its exact attempt', async () => {
  const { dom, doc, state } = await samplingHarness({
    countRefresh: { attemptId: 'counts-uncertain', status: 'UNCERTAIN', errorCode: null, stopRequested: false, reconcilable: true },
  });
  try {
    assert.ok(buttonByText(doc, 'Dừng đọc số đánh giá'), 'an uncertain counts attempt remains stoppable');
    assert.ok(buttonByText(doc, 'Đối soát lần đọc'));
    buttonByText(doc, 'Dừng đọc số đánh giá')!.click();
    await waitFor(() => state.controlCalls.length === 1, 'counts stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'counts', attemptId: 'counts-uncertain',
    });
    await waitFor(() => /Đang dừng đọc số đánh giá/.test(doc.getElementById('rsPanel')!.textContent!), 'stop requested');
    assert.equal(buttonByText(doc, 'Dừng đọc số đánh giá'), undefined);
  } finally { dom.window.close(); }
});

test('a missing M2 still loads frozen recovery controls without showing the new-collection form', async () => {
  const gate = deferred<void>();
  const attempt = {
    attemptId: 'attempt-frozen-custom', planSha256: 'f'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'UNCERTAIN', errorCode: null, gate: null, stopRequested: false, reconcilable: true,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  const info: any = syntheticRunInfo();
  info.selection = null;
  info.modules[2]!.canRun = false;
  info.modules[2]!.blockedBy = 'GATE_NOT_PASSED';
  info.gates.m2 = null;
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'IDLE' }],
    runInfo: info,
    sampling: syntheticSampling({
      m2Digest: null, links: [], plans: [], blockedBy: { code: 'GATE_NOT_PASSED' },
      countRefresh: { attemptId: 'counts-frozen', status: 'UNCERTAIN', errorCode: null, stopRequested: false, reconcilable: true },
      attempts: [attempt],
    }),
    reviewGates: { 'run-synthetic': gate },
  });
  try {
    await waitFor(() => state.reviewSamplingCalls >= 1, 'sampling requested without M2');
    assert.equal(doc.getElementById('rsPanel'), null, 'the new-collection form waits for the recovery view');
    gate.resolve();
    await waitFor(() => doc.getElementById('rsPanel') !== null, 'recovery panel');
    assert.match(doc.getElementById('rsPanel')!.textContent!, /M2 hiện không đọc được/);
    assert.equal(doc.getElementById('rsN'), null, 'no total-per-link config without M2');
    assert.equal(buttonByText(doc, 'Lưu lựa chọn'), undefined);
    assert.equal(buttonByText(doc, 'Thu bình luận theo lựa chọn'), undefined);
    assert.equal(buttonByText(doc, 'Đọc số đánh giá trên Shopee'), undefined);
    assert.ok(buttonByText(doc, 'Dừng lần chạy này'), 'frozen custom attempt remains stoppable');
    assert.ok(buttonByText(doc, 'Đối soát lần chạy'), 'frozen custom attempt remains reconcilable');
    assert.ok(buttonByText(doc, 'Dừng đọc số đánh giá'), 'frozen counts attempt remains stoppable');
    assert.ok(buttonByText(doc, 'Đối soát lần đọc'), 'frozen counts attempt remains reconcilable');

    let calls = state.reviewSamplingCalls;
    buttonByText(doc, 'Dừng lần chạy này')!.click();
    await waitFor(() => state.controlCalls.length === 1 && state.reviewSamplingCalls > calls, 'custom stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-frozen-custom',
    });
    calls = state.reviewSamplingCalls;
    buttonByText(doc, 'Đối soát lần chạy')!.click();
    await waitFor(() => state.controlCalls.length === 2 && state.reviewSamplingCalls > calls, 'custom reconcile');
    assert.deepEqual(state.controlCalls[1], {
      action: 'reconcile', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-frozen-custom',
    });
    calls = state.reviewSamplingCalls;
    buttonByText(doc, 'Dừng đọc số đánh giá')!.click();
    await waitFor(() => state.controlCalls.length === 3 && state.reviewSamplingCalls > calls, 'counts stop');
    assert.deepEqual(state.controlCalls[2], {
      action: 'stop', runId: 'run-synthetic', kind: 'counts', attemptId: 'counts-frozen',
    });
    calls = state.reviewSamplingCalls;
    buttonByText(doc, 'Đối soát lần đọc')!.click();
    await waitFor(() => state.controlCalls.length === 4 && state.reviewSamplingCalls > calls, 'counts reconcile');
    assert.deepEqual(state.controlCalls[3], {
      action: 'reconcile', runId: 'run-synthetic', kind: 'counts', attemptId: 'counts-frozen',
    });
    assert.equal(state.saveCalls.length, 0, 'no plan can be saved without M2');
    assert.equal(state.launchCalls.length, 0, 'no collection can start without M2');
    assert.equal(state.refreshCountCalls, 0, 'no source refresh can start without M2');
  } finally { dom.window.close(); }
});

test('a late sampling response for an unselected run never stops the selected run poll', async () => {
  const gateA = deferred<void>();
  const running = (attemptId: string) => ({
    attemptId, planSha256: 'c'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  });
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-a', product: 'A', status: 'IDLE' }, { runId: 'run-b', product: 'B', status: 'IDLE' }],
    runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    samplingByRun: {
      'run-a': syntheticSampling({ runId: 'run-a', attempts: [running('attempt-a')] }),
      'run-b': syntheticSampling({ runId: 'run-b', attempts: [running('attempt-b')] }),
    },
    reviewGates: { 'run-a': gateA },
  });
  try {
    await waitFor(() => state.reviewSamplingCallsByRun['run-a'] === 1, 'A sampling in flight');
    const bButton = [...doc.querySelectorAll('#runList button')]
      .find((button) => button.textContent!.includes('run-b')) as HTMLButtonElement;
    bButton.click();
    await waitFor(() => state.reviewSamplingCallsByRun['run-b'] === 1, 'B sampling loaded');
    gateA.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const bBefore = state.reviewSamplingCallsByRun['run-b'] ?? 0;
    await waitFor(() => (state.reviewSamplingCallsByRun['run-b'] ?? 0) > bBefore, 'B poll survives the late A response', 4500);
  } finally { dom.window.close(); }
});

test('supported stop reasons are translated and an unknown code never leaks raw', async () => {
  const attempt = {
    attemptId: 'attempt-stops', planSha256: 'd'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'SUCCEEDED', errorCode: null, gate: passSlip('M3'), stopRequested: false, reconcilable: false,
    links: [
      { shopId: '100', itemId: '200', requested: 300, actual: 0, shortfall: 300, stopReason: 'exhausted', stars: [] },
      { shopId: '101', itemId: '201', requested: 300, actual: 0, shortfall: 300, stopReason: 'vendor_limit_7', stars: [] },
    ],
  };
  const { dom, doc } = await samplingHarness({ attempts: [attempt] });
  try {
    const panel = doc.getElementById('rsPanel')!.textContent!;
    assert.match(panel, /Dừng: Đã hết đánh giá/);
    assert.match(panel, /Dừng: Không rõ lý do dừng/);
    assert.doesNotMatch(panel, /vendor_limit_7/);
  } finally { dom.window.close(); }
});

test('run labels use the keyword and Vietnam first-launch time, and keep legacy and unstarted runs honest', async () => {
  const cases = [
    {
      name: 'recorded first launch',
      status: 'DONE',
      tracking: {
        primaryKeyword: 'viên uống kẽm', firstRunAt: '2026-11-11T04:26:00.000Z',
        timeBasis: 'recorded-first-accepted', displayTimezone: 'Asia/Ho_Chi_Minh',
        lastKnownStartedAt: null,
      },
      title: 'viên uống kẽm: 11/11/2026 11:26am',
      statusText: 'Xong',
    },
    {
      name: 'legacy first launch unknown',
      status: 'DONE',
      tracking: {
        primaryKeyword: 'kem', firstRunAt: null, timeBasis: 'legacy-first-unproven',
        displayTimezone: 'Asia/Ho_Chi_Minh', lastKnownStartedAt: null,
      },
      title: 'kem · chưa rõ giờ bắt đầu',
      statusText: 'Xong',
    },
    {
      name: 'honest unstarted run',
      status: 'IDLE',
      tracking: {
        primaryKeyword: 'kem', firstRunAt: null, timeBasis: 'not-started',
        displayTimezone: 'Asia/Ho_Chi_Minh', lastKnownStartedAt: null,
      },
      title: 'kem',
      statusText: 'Chưa chạy',
    },
  ];
  for (const sample of cases) {
    const info: any = syntheticRunInfo('run-label');
    info.state = { status: sample.status, module: null, errorCode: null };
    info.tracking = sample.tracking;
    const result = harness({
      runs: [{ runId: 'run-label', product: 'Sản phẩm nội bộ', status: sample.status, tracking: sample.tracking }],
      runInfo: info,
    });
    try {
      await waitFor(() => result.doc.querySelector('.rname')?.textContent === sample.title, `${sample.name} list label`);
      const head = result.doc.querySelector('#runDetail .dhead')!;
      assert.equal(head.querySelector('h2')!.textContent, sample.title, `${sample.name} detail label`);
      assert.match(head.textContent!, new RegExp(sample.statusText));
      assert.match(head.textContent!, /Lượt run-label/);
      if (sample.name === 'legacy first launch unknown') {
        assert.doesNotMatch(head.textContent!, /Chưa chạy/);
      }
    } finally { result.dom.window.close(); }
  }
});

test('the save and export panel stays available without M2, keeps the chosen source and sends exact inputs', async () => {
  const older = syntheticReviewSource({
    sourceSha256: 'a'.repeat(64), kind: 'legacy', attemptId: null, planSha256: null,
    completedAt: '2026-11-10T02:00:00.000Z', rowCount: 8,
  });
  const latest = syntheticReviewSource({
    exportFormats: {
      json: { canExport: true, blockedBy: null, receipt: { fileName: 'shopee-cached.json' } },
      txt: { canExport: false, blockedBy: { code: 'EXPORT_BLOCKED' }, receipt: null },
    },
  });
  const info: any = syntheticRunInfo();
  info.gates.m2 = null;
  info.selection = null;
  info.modules = info.modules.map((mod: any) => mod.id === 'M3' ? { ...mod, canRun: false } : mod);
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: info,
    reviewData: syntheticReviewData({ sources: [older, latest] }),
  });
  try {
    await waitFor(() => result.doc.getElementById('rdSource') !== null, 'review panel loaded without M2');
    assert.equal(result.doc.getElementById('rdPanel')!.textContent!.includes('Lưu và xuất bình luận'), true);
    assert.equal(element<HTMLSelectElement>(result.doc, 'rdSource').value, latest.sourceSha256,
      'the latest completed usable source is selected by default');
    assert.match(element<HTMLElement>(result.doc, 'rdSummary').textContent!, /12 bình luận/);
    assert.match(result.doc.getElementById('rdPanel')!.textContent!, /Đã tạo tệp JSON trước đó: shopee-cached\.json/);
    assert.match(result.doc.getElementById('rdPanel')!.textContent!, /Xuất TXT: Chưa xuất được kết quả này/);
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdSave').textContent, 'Lưu vào DB');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdJson').textContent, 'Xuất JSON');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdTxt').textContent, 'Xuất TXT');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdTxt').disabled, true,
      'the unavailable format is disabled');
    assert.equal(result.state.saveReviewDataCalls.length + result.state.exportReviewDataCalls.length, 0,
      'opening the panel never saves or downloads');

    element<HTMLButtonElement>(result.doc, 'rdSave').click();
    await waitFor(() => result.state.saveReviewDataCalls.length === 1, 'save action');
    assert.deepEqual(result.state.saveReviewDataCalls[0], {
      runId: 'run-synthetic', input: { sourceSha256: latest.sourceSha256 },
    });
    await waitFor(() => /Đã lưu 12 bình luận/.test(result.doc.getElementById('rdHint')!.textContent!), 'save notice');

    element<HTMLButtonElement>(result.doc, 'rdJson').click();
    await waitFor(() => result.state.exportReviewDataCalls.length === 1, 'JSON export action');
    assert.deepEqual(result.state.exportReviewDataCalls[0], {
      runId: 'run-synthetic', input: { sourceSha256: latest.sourceSha256, format: 'json' },
    });
    await waitFor(() => /Đã lưu tệp/.test(result.doc.getElementById('rdHint')!.textContent!), 'export notice');

    const calls = result.state.reviewDataCallsByRun['run-synthetic'] ?? 0;
    result.doc.querySelector<HTMLButtonElement>('.runbtn')!.click();
    await waitFor(() => (result.state.reviewDataCallsByRun['run-synthetic'] ?? 0) > calls, 'refresh after reselect');
    assert.equal(element<HTMLSelectElement>(result.doc, 'rdSource').value, latest.sourceSha256,
      'a refresh keeps the exact chosen source');

    result.state.reviewDataView.sources = [older];
    const beforeLoss = result.state.reviewDataCallsByRun['run-synthetic'] ?? 0;
    result.doc.querySelector<HTMLButtonElement>('.runbtn')!.click();
    await waitFor(() => (result.state.reviewDataCallsByRun['run-synthetic'] ?? 0) > beforeLoss, 'refresh after source loss');
    const sourceSelect = element<HTMLSelectElement>(result.doc, 'rdSource');
    assert.equal(sourceSelect.value, '', 'a vanished source requires a new selection');
    assert.match(element<HTMLElement>(result.doc, 'rdSummary').textContent!, /không còn trong danh sách/);
    sourceSelect.value = older.sourceSha256;
    fire(result.window, sourceSelect, 'change');
    assert.equal(sourceSelect.value, older.sourceSha256, 'the operator can select another stored source');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdSave').disabled, false);

    result.state.exportReviewResult = () => ({ ok: true, data: {
      receipt: null, fileName: 'shopee-run-synthetic.json', saved: false, cancelled: true,
    } });
    element<HTMLButtonElement>(result.doc, 'rdJson').click();
    await waitFor(() => /Đã hủy lưu tệp\./.test(result.doc.getElementById('rdHint')!.textContent!), 'cancel notice');
  } finally { result.dom.window.close(); }
});

test('a pending action refreshes the panel that replaced its original run selection', async () => {
  const runA = 'run-a';
  const runB = 'run-b';
  const sourceA = 'a'.repeat(64);
  const sourceB = 'b'.repeat(64);
  const result = harness({
    runs: [
      { runId: runA, product: 'Sản phẩm A', status: 'IDLE' },
      { runId: runB, product: 'Sản phẩm B', status: 'IDLE' },
    ],
    runInfoByRun: { [runA]: syntheticRunInfo(runA), [runB]: syntheticRunInfo(runB) },
    reviewDataByRun: {
      [runA]: syntheticReviewData({ runId: runA, sources: [syntheticReviewSource({ sourceSha256: sourceA })] }),
      [runB]: syntheticReviewData({ runId: runB, sources: [syntheticReviewSource({ sourceSha256: sourceB })] }),
    },
  });
  const doc = result.doc;
  const runButton = (runId: string): HTMLButtonElement => {
    const button = [...doc.querySelectorAll<HTMLButtonElement>('.runbtn')]
      .find(candidate => candidate.textContent!.includes(runId));
    assert.ok(button, 'run button for ' + runId);
    return button;
  };
  try {
    const failure = deferred<any>();
    result.state.exportReviewResult = () => failure.promise;
    await waitFor(() => doc.querySelectorAll('.runbtn').length === 2, 'run list');
    runButton(runA).click();
    await waitFor(() => element<HTMLSelectElement>(doc, 'rdSource').value === sourceA, 'run A panel');
    element<HTMLButtonElement>(doc, 'rdJson').click();
    await waitFor(() => result.state.exportReviewDataCalls.length === 1, 'pending JSON export');
    assert.equal(element<HTMLButtonElement>(doc, 'rdJson').disabled, true, 'the original panel is busy');

    runButton(runB).click();
    await waitFor(() => element<HTMLSelectElement>(doc, 'rdSource').value === sourceB, 'run B panel');
    runButton(runA).click();
    await waitFor(() => element<HTMLSelectElement>(doc, 'rdSource').value === sourceA, 'replacement run A panel');
    assert.equal(element<HTMLButtonElement>(doc, 'rdJson').disabled, true, 'the replacement panel is busy');

    failure.resolve({ ok: false, error: { code: 'EXPORT_FAILED', message: 'EXPORT_FAILED' } });
    await waitFor(() => !element<HTMLButtonElement>(doc, 'rdJson').disabled, 'failure re-enables the visible panel');
    assert.equal(doc.getElementById('errbar')!.hidden, false, 'the failure remains visible');
    assert.equal(result.state.exportReviewDataCalls.length, 1, 'the failure is not retried');

    const success = deferred<any>();
    result.state.exportReviewResult = () => success.promise;
    element<HTMLButtonElement>(doc, 'rdJson').click();
    await waitFor(() => result.state.exportReviewDataCalls.length === 2, 'second pending JSON export');
    runButton(runB).click();
    await waitFor(() => element<HTMLSelectElement>(doc, 'rdSource').value === sourceB, 'run B panel again');
    runButton(runA).click();
    await waitFor(() => element<HTMLSelectElement>(doc, 'rdSource').value === sourceA, 'run A panel again');
    assert.equal(element<HTMLButtonElement>(doc, 'rdJson').disabled, true, 'the visible panel is busy again');

    success.resolve({ ok: true, data: {
      receipt: null, fileName: 'shopee-run-a.json', saved: true, cancelled: false,
    } });
    await waitFor(() => !element<HTMLButtonElement>(doc, 'rdJson').disabled &&
      /Đã lưu tệp/.test(doc.getElementById('rdHint')!.textContent!), 'success re-enables and reports the visible panel');
    assert.equal(result.state.exportReviewDataCalls.length, 2, 'success does not retry the action');
  } finally { result.dom.window.close(); }
});

test('readonly blocks new DB save and new export while permitting an already created exact export', async () => {
  const cached = syntheticReviewSource({
    canSaveDb: false, dbBlockedBy: { code: 'READONLY_ON' },
    exportFormats: {
      json: { canExport: true, blockedBy: null, receipt: { fileName: 'shopee-cached.json' } },
      txt: { canExport: false, blockedBy: { code: 'READONLY_ON' }, receipt: null },
    },
  });
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    reviewData: syntheticReviewData({ readonly: true, sources: [cached] }),
  });
  try {
    await waitFor(() => result.doc.getElementById('rdSource') !== null, 'readonly review panel');
    const panel = result.doc.getElementById('rdPanel')!;
    assert.match(panel.textContent!, /Đang bật khóa chỉ-đọc/);
    assert.match(panel.textContent!, /Lưu vào DB: Đang bật khóa chỉ-đọc/);
    assert.match(panel.textContent!, /Xuất TXT: Đang bật khóa chỉ-đọc/);
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdSave').disabled, true,
      'the guard blocks a new DB save');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdTxt').disabled, true,
      'the guard blocks a new TXT generation');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdJson').disabled, false,
      'a previously created JSON file remains downloadable');

    element<HTMLButtonElement>(result.doc, 'rdSave').click();
    assert.equal(result.state.saveReviewDataCalls.length, 0, 'a disabled save sends nothing');
    element<HTMLButtonElement>(result.doc, 'rdJson').click();
    await waitFor(() => result.state.exportReviewDataCalls.length === 1, 'cached JSON download');
    assert.deepEqual(result.state.exportReviewDataCalls[0], {
      runId: 'run-synthetic', input: { sourceSha256: cached.sourceSha256, format: 'json' },
    });
  } finally { result.dom.window.close(); }
});

test('readonly keeps offline save and stop but refuses launch, refresh and reconcile', async () => {
  const { dom, doc, state } = await samplingHarness({
    readonly: true, blockedBy: { code: 'READONLY_ON' },
    countRefresh: { attemptId: 'counts-ro', status: 'RUNNING', errorCode: null, stopRequested: false, reconcilable: true },
    attempts: [{
      attemptId: 'attempt-ro', planSha256: 'a'.repeat(63) + 'b', createdAt: '2026-11-01T02:00:00.000Z',
      status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: true,
      links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
    }],
  });
  try {
    assert.equal(buttonByText(doc, 'Lưu lựa chọn')!.disabled, false, 'offline save may proceed with valid M2');
    assert.equal(buttonByText(doc, 'Thu bình luận theo lựa chọn')!.disabled, true);
    assert.equal(buttonByText(doc, 'Đọc số đánh giá trên Shopee')!.disabled, true);
    assert.ok(buttonByText(doc, 'Dừng đọc số đánh giá'), 'offline stop remains allowed');
    assert.equal(buttonByText(doc, 'Đối soát lần đọc'), undefined);
    assert.ok(buttonByText(doc, 'Dừng lần chạy này'), 'custom stop remains allowed');
    assert.equal(buttonByText(doc, 'Đối soát lần chạy'), undefined);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /khóa chỉ-đọc/);
    assert.equal(state.refreshCountCalls, 0);
  } finally { dom.window.close(); }
});
