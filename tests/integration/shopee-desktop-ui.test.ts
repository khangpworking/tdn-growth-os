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
  saveReviewPlanResult?: ((runId: string, input: any, sha: string, plan: any) => any) | undefined;
  runModuleResult?: ((runId: string, module: string, sha?: string) => any) | undefined;
  reviewData?: any; reviewDataByRun?: Record<string, any>;
  saveReviewDataResult?: (runId: string, input: any) => any;
  exportReviewResult?: (runId: string, input: any) => any;
  newRunGate?: Deferred<any> | undefined;
  newRunResult?: (input: any) => any | Promise<any>;
  addProductGate?: Deferred<any> | undefined;
  addProductResult?: (input: any) => any;
  runFlowResult?: any;
  runFlowGate?: Deferred<any> | undefined;
  presets?: ReturnType<typeof preset>[];
  connectionResult?: any;
} = {}) {
  const state: {
    addCalls: number; presetsCalls: number; newRunCalls: number; listRunsCalls: number;
    refreshCountCalls: number;
    newRunInputs: any[]; flowCalls: string[]; statusCalls: string[];
    presets: ReturnType<typeof preset>[];
    runsView: any[];
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
    newRunInputs: [], flowCalls: [], statusCalls: [],
    presets: options.presets ? options.presets.slice() : [preset('kem', 'Kem chống nắng')],
    runsView: options.runs ? options.runs.slice() : [],
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
    connection: async () => options.connectionResult || ({ ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic' } }),
    presets: async () => {
      state.presetsCalls++;
      return { ok: true, data: { format: 'presets-v1', presets: state.presets.slice() } };
    },
    listRuns: async () => {
      state.listRunsCalls++;
      return { ok: true, data: { format: 'runs-v1', runs: state.runsView.slice() } };
    },
    library: async () => ({ ok: true, data: { format: 'library-v1', modules: {}, skills: [] } }),
    newRun: async (input: any) => {
      state.newRunCalls++;
      state.newRunInputs.push(clone(input));
      if (options.newRunGate) await options.newRunGate.promise;
      const res = options.newRunResult
        ? await options.newRunResult(clone(input))
        : { ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } };
      if (res && res.ok && res.data && res.data.runId &&
          !state.runsView.some((run: any) => run.runId === res.data.runId)) {
        const saved = state.presets.find((entry) => entry.presetId === input.presetId);
        state.runsView = [{ runId: res.data.runId, product: saved ? saved.label : input.presetId, status: 'IDLE' },
          ...state.runsView];
      }
      return res;
    },
    status: async (runId: string) => {
      state.statusCalls.push(runId);
      const info = (options.runInfoByRun && options.runInfoByRun[runId]) || options.runInfo;
      if (info) return { ok: true, data: clone(info) };
      return { ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } };
    },
    runFlow: async (runId: string) => {
      state.flowCalls.push(runId);
      if (options.runFlowGate) await options.runFlowGate.promise;
      return options.runFlowResult || { ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } };
    },
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
      if (options.saveReviewDataResult) return options.saveReviewDataResult(runId, clone(input));
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
      if (options.saveReviewPlanResult) {
        return options.saveReviewPlanResult(runId, clone(input), sha, clone(plan));
      }
      return { ok: true, data: { format: 'review-plan-saved-v1', runId, planSha256: sha, plan } };
    },
    runModule: async (runId: string, module: string, sha?: string) => {
      state.launchCalls.push({ runId, module, sha });
      if (options.runModuleResult) return options.runModuleResult(runId, module, sha);
      if (module !== 'm3') return { ok: false, error: { code: 'MODULE_INVALID', message: 'MODULE_INVALID' } };
      if (sha === undefined) {
        return { ok: true, data: {
          format: 'review-attempt-start-v1', runId, attemptId: 'attempt-automatic',
          planSha256: null, status: 'RUNNING', pid: 1234,
        } };
      }
      const saved = (state.sampling?.plans || []).find((entry: any) => entry.planSha256 === sha);
      if (!saved) return { ok: false, error: { code: 'PLAN_NOT_SAVED', message: 'PLAN_NOT_SAVED' } };
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
      if (options.addProductGate) await options.addProductGate.promise;
      const res = options.addProductResult
        ? options.addProductResult(clone(input))
        : { ok: true, data: { format: 'add-product-v1', presetId: input.presetId, label: input.label } };
      if (res.ok) state.presets.push(preset(res.data.presetId, res.data.label));
      return res;
    },
  };
  const dom = new JSDOM(html, {
    url: 'file:///shopee-desktop/index.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as any).pywebview = { api };
      const dialog = window.HTMLDialogElement && window.HTMLDialogElement.prototype;
      if (dialog && !dialog.showModal) {
        dialog.showModal = function (this: HTMLDialogElement) { this.open = true; };
      }
      if (dialog && !dialog.close) {
        dialog.close = function (this: HTMLDialogElement) {
          this.open = false;
          this.dispatchEvent(new window.Event('close'));
        };
      }
    },
  });
  return { dom, doc: dom.window.document, window: dom.window, state };
}

const element = <T extends HTMLElement>(doc: Document, id: string): T => doc.getElementById(id) as T;

/** Local calendar day, deliberately not UTC subtraction. */
function localDay(offset: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  const pad = (value: number) => String(value).padStart(2, '0');
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
}

function runListButton(doc: Document, runId: string): HTMLButtonElement {
  const button = [...doc.querySelectorAll<HTMLButtonElement>('#runList button')]
    .find((candidate) => (candidate.title || '').includes('Mã lượt ' + runId));
  assert.ok(button, 'run list button for ' + runId);
  return button;
}

function summaryValue(doc: Document, label: string): string {
  const rows = [...doc.querySelectorAll('#reviewSummary > div')];
  const row = rows.find((entry) => entry.querySelector('dt')!.textContent === label);
  return row ? row.querySelector('dd')!.textContent || '' : '';
}

function fillProduct(doc: Document, label: string, keyword: string): void {
  element<HTMLSelectElement>(doc, 'presetSel').value = '__new__';
  element<HTMLSelectElement>(doc, 'presetSel').dispatchEvent(new (doc.defaultView as any).Event('change', { bubbles: true }));
  element<HTMLInputElement>(doc, 'productLabel').value = label;
  element<HTMLInputElement>(doc, 'productKeyword').value = keyword;
  element<HTMLSelectElement>(doc, 'productCategory').value = 'c2035652732';
}

function chooseStars(doc: Document, stars: number[], total: number): void {
  const window = doc.defaultView as any;
  const mode = doc.querySelector('input[name="newPolicyMode"][value="stars"]') as HTMLInputElement;
  mode.checked = true;
  mode.dispatchEvent(new window.Event('change', { bubbles: true }));
  for (const box of doc.querySelectorAll<HTMLInputElement>('[data-new-star]')) {
    box.checked = stars.includes(Number(box.dataset.newStar));
  }
  element<HTMLInputElement>(doc, 'newTotal').value = String(total);
  element<HTMLInputElement>(doc, 'newTotal').dispatchEvent(new window.Event('input', { bubbles: true }));
}

const create = (doc: Document) => element<HTMLButtonElement>(doc, 'btnNew').click();

const isUnavailable = (node: HTMLElement): boolean =>
  (node as HTMLButtonElement).disabled === true || node.hidden || node.matches(':disabled');

function assertDraftFrozen(doc: Document): void {
  for (const id of ['presetSel', 'endDate', 'newTotal']) {
    assert.equal(element(doc, id).matches(':disabled'), true, id + ' is frozen after create');
  }
  for (const control of doc.querySelectorAll<HTMLInputElement>('input[name="newPolicyMode"]')) {
    assert.equal(control.matches(':disabled'), true, 'the policy mode is frozen after create');
  }
  assert.equal(isUnavailable(element(doc, 'btnNew')), true, 'the create action is frozen');
  assert.equal(element<HTMLButtonElement>(doc, 'btnNewAnother').hidden, false,
    'an explicit new-draft action is offered');
}

function assertDraftEditable(doc: Document): void {
  for (const id of ['presetSel', 'endDate', 'newTotal']) {
    assert.equal(element(doc, id).matches(':disabled'), false, id + ' is editable again');
  }
  for (const control of doc.querySelectorAll<HTMLInputElement>('input[name="newPolicyMode"]')) {
    assert.equal(control.matches(':disabled'), false, 'the policy mode is editable again');
  }
  assert.equal(isUnavailable(element(doc, 'btnNew')), false, 'the create action is available again');
  assert.equal(element<HTMLButtonElement>(doc, 'btnNewAnother').hidden, true);
}

async function assertEditableFocus(doc: Document): Promise<void> {
  await waitFor(() => {
    const active = doc.activeElement as HTMLElement | null;
    return !!active && active !== doc.body && active.matches('input:not([type="hidden"]), select, textarea') &&
      !active.matches(':disabled');
  }, 'focus moves to an editable field');
}

async function openFlowConfirmation(doc: Document): Promise<HTMLDialogElement> {
  const dialog = element<HTMLDialogElement>(doc, 'flowDialog');
  element<HTMLButtonElement>(doc, 'btnFlow').click();
  await waitFor(() => dialog.open, 'whole-flow confirmation');
  return dialog;
}

async function booted(doc: Document): Promise<void> {
  await waitFor(() => element<HTMLButtonElement>(doc, 'btnNew').disabled === false, 'connected new-run form');
  await waitFor(() => element<HTMLSelectElement>(doc, 'presetSel').options.length > 0, 'presets loaded');
}

/** A real status reply for a run the fake bridge just created. */
function createdRunInfo(runId: string) {
  return {
    format: 'run-info-v1', runId, readonly: false,
    request: {
      format: 'request-v2', preset: { keywords: ['son'] },
      windows: [{ id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-11' }, intervalDays: 7 }],
      collectionPolicy: {
        format: 'shopee-review-policy-v1', mode: 'stars', stars: [2, 3], totalPerLink: 500,
        allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1',
      },
    },
    state: { status: 'IDLE', module: null, errorCode: null },
    modules: [
      { id: 'M1', title: 'M1', skill: 'synthetic', inputGate: 'entry', outputGate: 'm1', canRun: false, blockedBy: null },
      { id: 'M2', title: 'M2', skill: 'synthetic', inputGate: 'm1', outputGate: 'm2', canRun: false, blockedBy: null },
      { id: 'M3', title: 'M3', skill: 'synthetic', inputGate: 'm2', outputGate: 'm3', canRun: false, blockedBy: null },
    ],
    gates: { entry: passSlip('ENTRY'), m1: null, m2: null, m3: null },
    selection: null,
  };
}

test('creating a run with 500 stars 2,3 sends the frozen policy once and binds the entry PASS', async () => {
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-frozen' } }),
    runInfoByRun: { 'run-frozen': createdRunInfo('run-frozen') },
  });
  try {
    await booted(doc);
    chooseStars(doc, [3, 2], 500);
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'new-run sent');

    assert.deepEqual(state.newRunInputs[0], {
      presetId: 'kem', endDate: element<HTMLInputElement>(doc, 'endDate').value,
      collectionPolicy: { mode: 'stars', stars: [2, 3], totalPerLink: 500, allocation: 'pooled' },
    });
    assert.equal('reviewCapPerLink' in state.newRunInputs[0]!, false, 'the UI never sends the legacy cap');
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'bound create result');
    assert.equal(element<HTMLButtonElement>(doc, 'btnFlow').disabled, false, 'entry PASS unlocks the flow');
    assert.match(element<HTMLElement>(doc, 'frozenSummary').textContent!, /Đánh giá 2 và 3 sao · tối đa 500 mỗi link/);
    assert.equal(state.flowCalls.length, 0, 'creating a run never launches collection');
    assert.equal(state.addCalls, 0, 'an existing product is not saved again');
  } finally { dom.window.close(); }
});

test('a saved product followed by a failed create is not saved a second time on retry', async () => {
  let fail = true;
  const { dom, doc, state } = harness({
    newRunResult: () => fail
      ? { ok: false, error: { code: 'REVIEW_POLICY_INVALID', message: 'REVIEW_POLICY_INVALID' } }
      : { ok: true, data: { format: 'new-run-v1', runId: 'run-retry' } },
    runInfoByRun: { 'run-retry': createdRunInfo('run-retry') },
  });
  try {
    await booted(doc);
    fillProduct(doc, 'Viên uống vitamin C', 'vitamin C');
    const endDate = element<HTMLInputElement>(doc, 'endDate').value;
    element<HTMLInputElement>(doc, 'newTotal').value = '500';
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newErr').hidden === false, 'create failure shown');

    assert.equal(state.newRunCalls, 1);
    assert.equal(state.newRunInputs[0]!.presetId, 'vien-uong-vitamin-c', 'the saved product id is used');
    assert.equal(state.newRunInputs[0]!.endDate, endDate);
    assert.equal((state.newRunInputs[0]!.collectionPolicy as any).totalPerLink, 500);
    assert.match(element<HTMLElement>(doc, 'newNotice').textContent!, /Đã lưu sản phẩm “Viên uống vitamin C”/);
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /nhưng chưa tạo được lượt/);
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /thử lại/i,
      'the failure carries an actionable recovery');
    assert.doesNotMatch(element<HTMLElement>(doc, 'newErr').textContent!, /REVIEW_POLICY_INVALID/,
      'the raw code stays out of the primary error');
    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, 'vien-uong-vitamin-c');
    assert.equal(element<HTMLElement>(doc, 'newResult').hidden, true);
    assertDraftEditable(doc);
    assert.equal(element<HTMLButtonElement>(doc, 'btnNewAnother').hidden, true,
      'a failed create never locks the draft');

    fail = false;
    create(doc);
    await waitFor(() => state.newRunCalls === 2 && element<HTMLElement>(doc, 'newResult').hidden === false, 'retry created');
    assert.equal(state.addCalls, 1, 'the retry does not save the product again');
    assertDraftFrozen(doc);
  } finally { dom.window.close(); }
});

test('a product saved while N changes keeps the exact product and continues with the newer N once', async () => {
  const gate = deferred<any>();
  const { dom, doc, window, state } = harness({
    addProductGate: gate,
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-after-save' } }),
    runInfoByRun: { 'run-after-save': createdRunInfo('run-after-save') },
  });
  try {
    await booted(doc);
    fillProduct(doc, 'Viên uống vitamin C', 'vitamin C');
    element<HTMLInputElement>(doc, 'newTotal').value = '500';
    element<HTMLInputElement>(doc, 'newTotal').dispatchEvent(new window.Event('input', { bubbles: true }));
    create(doc);
    await waitFor(() => state.addCalls === 1, 'save in flight');

    element<HTMLInputElement>(doc, 'newTotal').value = '501';
    element<HTMLInputElement>(doc, 'newTotal').dispatchEvent(new window.Event('input', { bubbles: true }));
    gate.resolve(undefined);
    await waitFor(() => /đã được lưu|Đã lưu sản phẩm/.test(element<HTMLElement>(doc, 'newNotice').textContent || ''), 'save notice');

    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, 'vien-uong-vitamin-c',
      'the exact saved product stays selected');
    assert.equal(element<HTMLInputElement>(doc, 'newTotal').value, '501', 'the newer N is not lost');
    assert.equal(element<HTMLElement>(doc, 'newResult').hidden, true, 'the changed form is not bound in the same click');
    assert.equal(state.newRunCalls, 0);

    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'continuation creates the run');
    assert.equal(state.newRunInputs[0]!.presetId, 'vien-uong-vitamin-c');
    assert.equal((state.newRunInputs[0]!.collectionPolicy as any).totalPerLink, 501, 'the newer N continues');
    assert.equal(state.addCalls, 1, 'the continuation never saves the product again');
  } finally { dom.window.close(); }
});

test('a failed product save while the form changes never claims the product was saved', async () => {
  const gate = deferred<any>();
  const { dom, doc, window, state } = harness({
    addProductGate: gate,
    addProductResult: () => ({ ok: false, error: { code: 'PRESET_BUSY', message: 'PRESET_BUSY' } }),
  });
  try {
    await booted(doc);
    fillProduct(doc, 'Viên uống vitamin C', 'vitamin C');
    create(doc);
    await waitFor(() => state.addCalls === 1, 'save in flight');

    element<HTMLInputElement>(doc, 'newTotal').value = '501';
    element<HTMLInputElement>(doc, 'newTotal').dispatchEvent(new window.Event('input', { bubbles: true }));
    gate.resolve(undefined);
    await waitFor(() => !element<HTMLElement>(doc, 'newErr').hidden || (element<HTMLElement>(doc, 'newNotice').textContent || '').length > 0, 'save outcome');

    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /Chưa lưu được sản phẩm/);
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /lưu lại/,
      'the failure carries an actionable recovery');
    assert.doesNotMatch(element<HTMLElement>(doc, 'newErr').textContent!, /PRESET_BUSY/,
      'the raw bridge code stays out of the primary error');
    assert.doesNotMatch(element<HTMLElement>(doc, 'newNotice').textContent || '', /đã được lưu|Đã lưu sản phẩm/i,
      'a failed save is never claimed as saved');
    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, '__new__', 'no saved id is bound');
    assert.equal(state.presets.some((p: any) => p.presetId === 'vien-uong-vitamin-c'), false);
    assert.equal(element<HTMLElement>(doc, 'newResult').hidden, true);
  } finally { dom.window.close(); }
});

test('a product draft edited while it is saving is never replaced by the older submitted product', async () => {
  const gate = deferred<any>();
  const { dom, doc, window, state } = harness({ addProductGate: gate });
  try {
    await booted(doc);
    fillProduct(doc, 'Viên uống vitamin C', 'vitamin C');
    create(doc);
    await waitFor(() => state.addCalls === 1, 'save in flight');

    element<HTMLInputElement>(doc, 'productLabel').value = 'Viên uống vitamin C loại mới';
    element<HTMLInputElement>(doc, 'productLabel').dispatchEvent(new window.Event('input', { bubbles: true }));
    gate.resolve(undefined);
    await waitFor(() => (element<HTMLElement>(doc, 'newNotice').textContent || '').length > 0 || !element<HTMLElement>(doc, 'newErr').hidden, 'save outcome');

    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, '__new__', 'the newer draft stays selected');
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').value, 'Viên uống vitamin C loại mới',
      'the older submitted product never overwrites the newer draft');
    create(doc);
    await waitFor(() => state.addCalls === 2, 'the newer draft is saved on its own click');
  } finally { dom.window.close(); }
});

test('a selection changed while a product saves is not replaced by the saved product', async () => {
  const gate = deferred<any>();
  const { dom, doc, window, state } = harness({
    addProductGate: gate,
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-selected' } }),
    runInfoByRun: { 'run-selected': createdRunInfo('run-selected') },
  });
  try {
    await booted(doc);
    fillProduct(doc, 'Viên uống vitamin C', 'vitamin C');
    create(doc);
    await waitFor(() => state.addCalls === 1, 'save in flight');

    element<HTMLSelectElement>(doc, 'presetSel').value = 'kem';
    element<HTMLSelectElement>(doc, 'presetSel').dispatchEvent(new window.Event('change', { bubbles: true }));
    gate.resolve(undefined);
    await waitFor(() => (element<HTMLElement>(doc, 'newNotice').textContent || '').length > 0 || !element<HTMLElement>(doc, 'newErr').hidden, 'save outcome');

    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, 'kem', 'the newer selection is kept');
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'continuation creates with the newer selection');
    assert.equal(state.newRunInputs[0]!.presetId, 'kem');
    assert.equal(state.addCalls, 1, 'the saved product is not re-saved by the continuation');
  } finally { dom.window.close(); }
});

test('a create reply that lands after a form change is never bound to the changed form', async () => {
  const gate = deferred<any>();
  const { dom, doc, state } = harness({
    newRunGate: gate,
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-late' } }),
    runInfoByRun: { 'run-late': createdRunInfo('run-late') },
  });
  try {
    await booted(doc);
    element<HTMLInputElement>(doc, 'newTotal').value = '500';
    const runsBefore = state.listRunsCalls;
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'new-run in flight');

    element<HTMLInputElement>(doc, 'newTotal').value = '501';
    element<HTMLInputElement>(doc, 'newTotal').dispatchEvent(new (doc.defaultView as any).Event('input', { bubbles: true }));
    gate.resolve({ ok: true, data: { format: 'new-run-v1', runId: 'run-late' } });
    await waitFor(() => /run-late/.test(element<HTMLElement>(doc, 'newNotice').textContent || ''), 'stale create notice');

    assert.equal(element<HTMLElement>(doc, 'newResult').hidden, true, 'no binding is shown');
    assert.equal(element<HTMLButtonElement>(doc, 'btnFlow').disabled, true, 'the changed form cannot launch it');
    assert.match(element<HTMLElement>(doc, 'newNotice').textContent!, /biểu mẫu đã thay đổi/);
    assert.ok(state.listRunsCalls > runsBefore, 'the created run is still listed for tracking');
    assert.equal(element<HTMLButtonElement>(doc, 'btnNewAnother').hidden, true,
      'a late reply never offers the new-draft action for the changed form');
    assertDraftEditable(doc);
    assert.equal(element<HTMLInputElement>(doc, 'newTotal').value, '501', 'the newer draft is untouched');
  } finally { dom.window.close(); }
});

test('a successful create locks its draft until Tạo lượt khác starts a new editable one', async () => {
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-bound' } }),
    runInfoByRun: { 'run-bound': createdRunInfo('run-bound') },
  });
  try {
    await booted(doc);
    chooseStars(doc, [2, 3], 500);
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'binding shown');
    assert.match(element<HTMLElement>(doc, 'newRunLine').textContent!, /run-bound/);
    assert.equal(element<HTMLButtonElement>(doc, 'btnFlow').disabled, false);
    const frozen = element<HTMLElement>(doc, 'frozenSummary').textContent!;
    assert.match(frozen, /Khoảng thời gian/);
    assert.match(frozen, /Nội dung lấy/);
    assert.doesNotMatch(frozen, /Kỳ dữ liệu|Phạm vi/, 'the frozen summary uses the approved labels');
    assertDraftFrozen(doc);

    element<HTMLButtonElement>(doc, 'btnNewAnother').click();
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === true, 'binding cleared for a new draft');

    assertDraftEditable(doc);
    await assertEditableFocus(doc);
    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, 'kem', 'the saved product stays selected');
    assert.equal(element<HTMLInputElement>(doc, 'newTotal').value, '500', 'the draft values are retained');
    assert.equal(isUnavailable(element(doc, 'btnFlow')), true, 'the old run cannot be launched from the new draft');
    assert.equal(element<HTMLDialogElement>(doc, 'flowDialog').open, false);
    assert.equal(state.flowCalls.length, 0, 'starting a draft never starts a source call');
    assert.equal(state.newRunCalls, 1, 'starting a draft never creates a run');
    assert.equal(state.addCalls, 0, 'the already saved product is not saved again');
  } finally { dom.window.close(); }
});

test('a created run with a failed entry gate stays bound and retained until another draft is requested', async () => {
  const info = createdRunInfo('run-entry-fail');
  info.gates.entry = {
    ...passSlip('ENTRY'), verdict: 'FAIL', errorCode: 'ENTRY_NOT_PASSED',
    checks: [{ id: 'period_dates', ok: false, got: 'invalid', level: 'error' }],
  } as any;
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-entry-fail' } }),
    runInfoByRun: { 'run-entry-fail': info },
  });
  try {
    await booted(doc);
    const runsBefore = state.listRunsCalls;
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'failed-gate run still bound');

    assert.match(element<HTMLElement>(doc, 'newRunLine').textContent!, /run-entry-fail/);
    assert.ok((element<HTMLElement>(doc, 'entrySlip').textContent || '').trim().length > 0,
      'the failed entry evidence stays visible');
    assert.equal(element<HTMLButtonElement>(doc, 'btnFlow').disabled, true, 'a failed entry gate cannot start the flow');
    assertDraftFrozen(doc);
    assert.ok(state.listRunsCalls > runsBefore, 'the created run is refreshed into retained history');
    assert.equal(state.flowCalls.length, 0, 'binding a failed gate never starts the source');

    element<HTMLButtonElement>(doc, 'btnNewAnother').click();
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === true, 'failed-gate binding cleared on request');
    assertDraftEditable(doc);
    assert.equal(state.flowCalls.length, 0);
  } finally { dom.window.close(); }
});

test('the whole-flow confirmation shows the frozen run; cancel makes no source call', async () => {
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-confirm' } }),
    runInfoByRun: { 'run-confirm': createdRunInfo('run-confirm') },
  });
  try {
    await booted(doc);
    chooseStars(doc, [2, 3], 500);
    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'launch enabled');

    const dialog = await openFlowConfirmation(doc);
    const facts = dialog.querySelector('#flowDialogFacts')!.textContent || '';
    assert.match(facts, /Kem chống nắng/, 'the exact product is shown');
    assert.match(facts, /30 ngày/, 'the 30-day window is shown');
    assert.match(facts, /12 tháng/, 'the 12-month window is shown');
    assert.match(facts, /Đánh giá 2 và 3 sao/, 'the exact star policy is shown');
    assert.match(facts, /500/, 'the exact shared total is shown');
    assert.match(facts, /Khoảng thời gian/, 'the interval uses the approved plain label');
    assert.doesNotMatch(facts, /Kỳ dữ liệu|Phạm vi/, 'retired summary labels stay out of the confirmation');
    const consequence = dialog.querySelector('#flowDialogNote')!.textContent || '';
    assert.match(consequence, /lượt tra số liệu bán hàng/,
      'starting a run names the sales-data lookup it uses');
    assert.match(consequence, /bắt đầu lấy bình luận/, 'the consequence says collection starts');
    assert.doesNotMatch(consequence, /gọi dữ liệu/, 'the consequence does not use a vague technical phrase');
    assert.doesNotMatch(consequence, /%|phút|giây|ETA/, 'no invented completion estimate');
    assert.match(dialog.textContent || '', /không báo trước/, 'no completion ETA is promised');
    assert.equal(state.flowCalls.length, 0, 'opening confirmation makes no source call');

    element<HTMLButtonElement>(doc, 'flowCancelBtn').click();
    await waitFor(() => dialog.open === false, 'confirmation cancelled');
    assert.equal(state.flowCalls.length, 0, 'cancel makes no source call');

    element<HTMLButtonElement>(doc, 'btnFlow').click();
    await waitFor(() => dialog.open, 'confirmation reopened');
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => state.flowCalls.length === 1, 'confirmed launch');
    assert.deepEqual(state.flowCalls, ['run-confirm']);
    assert.equal(dialog.open, false, 'the confirmation closes after launch');
    assert.equal(state.newRunCalls, 1, 'confirmation never creates another run');
  } finally { dom.window.close(); }
});

test('starting another draft invalidates an open confirmation and only the new binding can launch', async () => {
  let created = 0;
  const { dom, doc, state } = harness({
    newRunResult: () => {
      created += 1;
      return { ok: true, data: { format: 'new-run-v1', runId: created === 1 ? 'run-first' : 'run-second' } };
    },
    runInfoByRun: {
      'run-first': createdRunInfo('run-first'),
      'run-second': createdRunInfo('run-second'),
    },
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'first binding');
    const dialog = await openFlowConfirmation(doc);

    element<HTMLButtonElement>(doc, 'btnNewAnother').click();
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === true,
      'new draft invalidates the launch binding');
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => dialog.open === false, 'confirmation closes without launching');
    assert.equal(state.flowCalls.length, 0, 'the old confirmation cannot launch the abandoned binding');

    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'second binding');
    assert.equal(element<HTMLElement>(doc, 'newRunLine').textContent!.includes('run-second'), true);
    await openFlowConfirmation(doc);
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => state.flowCalls.length === 1, 'confirmed second binding');
    assert.deepEqual(state.flowCalls, ['run-second'], 'only the exact current binding is launched');
  } finally { dom.window.close(); }
});

test('a pending whole-flow launch never yanks back a new draft when it answers', async () => {
  const gate = deferred<any>();
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-flow' } }),
    runInfoByRun: { 'run-flow': createdRunInfo('run-flow') },
    runFlowGate: gate,
    runFlowResult: { ok: true, data: { format: 'flow-start-v1', runId: 'run-flow' } },
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'binding');
    await openFlowConfirmation(doc);
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => state.flowCalls.length === 1, 'flow pending');
    element<HTMLButtonElement>(doc, 'btnNewAnother').click();
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === true, 'new editable draft');

    gate.resolve({ ok: true, data: { format: 'flow-start-v1', runId: 'run-flow' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.deepEqual(state.flowCalls, ['run-flow'], 'the dispatched flow is neither retried nor cancelled');
    assert.equal(element<HTMLElement>(doc, 'scr-new').hidden, false, 'the new draft stays in front');
    assert.equal(element<HTMLElement>(doc, 'scr-track').hidden, true, 'a late reply never navigates to tracking');
    assert.equal(doc.querySelector('#runList button.on'), null, 'a late reply selects no run');
    assertDraftEditable(doc);
    assert.deepEqual(state.controlCalls, [], 'the already-started run is not stopped or reconciled');
  } finally { dom.window.close(); }
});

test('a pending whole-flow launch leaves the run the user is tracking selected', async () => {
  const gate = deferred<any>();
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-older', product: 'Lượt cũ', status: 'DONE', request: { format: 'request-v1', reviewCapPerLink: 300 } }],
    runInfoByRun: {
      'run-older': syntheticRunInfo('run-older'), 'run-flow': createdRunInfo('run-flow'),
    },
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-flow' } }),
    runFlowGate: gate,
    runFlowResult: { ok: true, data: { format: 'flow-start-v1', runId: 'run-flow' } },
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'binding');
    await openFlowConfirmation(doc);
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => state.flowCalls.length === 1, 'flow pending');

    (doc.querySelector('button[data-screen="track"]') as HTMLButtonElement).click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-flow'),
      'the bound run is preferred on arrival');
    runListButton(doc, 'run-older').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-older'),
      'the user selected another run');
    const readsBefore = state.statusCalls.filter((runId) => runId === 'run-flow').length;

    gate.resolve({ ok: true, data: { format: 'flow-start-v1', runId: 'run-flow' } });
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal((doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-older'), true,
      'the late reply does not switch the tracked run');
    assert.equal(state.statusCalls.filter((runId) => runId === 'run-flow').length, readsBefore,
      'the late reply does not re-read or re-select the launched run');
    assert.equal(state.newRunCalls, 1, 'no competing create is made');
    assert.deepEqual(state.controlCalls, [], 'the already-started run is not stopped or reconciled');

    (doc.querySelector('button[data-screen="new"]') as HTMLButtonElement).click();
    await waitFor(() => element<HTMLElement>(doc, 'scr-new').hidden === false, 'back on the form');
    assert.match(element<HTMLElement>(doc, 'newRunLine').textContent || '', /run-flow/,
      'the original binding is preserved when the user returns');
  } finally { dom.window.close(); }
});

test('an invalid policy is refused inline before any bridge call', async () => {
  const { dom, doc, state } = harness();
  try {
    await booted(doc);
    const window = doc.defaultView as any;
    const stars = doc.querySelector('input[name="newPolicyMode"][value="stars"]') as HTMLInputElement;
    stars.checked = true;
    stars.dispatchEvent(new window.Event('change', { bubbles: true }));
    create(doc);
    assert.equal(state.newRunCalls, 0, 'no star selected is refused');
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /ít nhất một mức sao/);

    element<HTMLInputElement>(doc, 'newTotal').value = '2001';
    create(doc);
    assert.equal(state.newRunCalls, 0, 'out of range total is refused');
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /2000/);
  } finally { dom.window.close(); }
});

const passSlip = (module: string) => ({
  format: 'handoff-v1', module, verdict: 'PASS', checks: [], errorCode: null,
  inputSha256: 'synthetic-in', outputSha256: 'synthetic-out', next: null,
});

/** Synthetic run-info for the M3 panel; no live source or native DOM is involved. */
type SyntheticRunRequest =
  | { format: 'request-v1'; reviewCapPerLink: number }
  | {
      format: 'request-v2'; preset: { keywords: string[] };
      windows: Array<{ id: string; period: { startDate: string; endDate: string }; intervalDays: number }>;
      collectionPolicy: Record<string, unknown>;
    };

function syntheticRunInfo(runId = 'run-synthetic') {
  const module = (id: string, inputGate: string, canRun: boolean) => ({
    id, title: id, skill: 'synthetic-module', inputGate, outputGate: id.toLowerCase(), canRun, blockedBy: null,
  });
  return {
    format: 'run-info-v1', runId, readonly: false,
    request: { format: 'request-v1', reviewCapPerLink: 300 } as SyntheticRunRequest,
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
  saveReviewPlanResult?: ((runId: string, input: any, sha: string, plan: any) => any) | undefined;
  runModuleResult?: ((runId: string, module: string, sha?: string) => any) | undefined;
} = {}) {
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'IDLE' }],
    runInfo: syntheticRunInfo(),
    sampling: syntheticSampling(sampling),
    saveGate: options.saveGate,
    refreshCountResult: options.refreshCountResult,
    saveReviewPlanResult: options.saveReviewPlanResult,
    runModuleResult: options.runModuleResult,
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
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Đánh giá có bình luận · tối đa 300 mỗi link/);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /chỉ lấy phần chữ/);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /không tải ảnh và video/,
      'text-only eligibility is explicit and media is not downloaded');
    assert.equal(state.refreshCountCalls, 0, 'opening the run must not refresh source counts');

    assert.match(doc.getElementById('rsPanel')!.textContent!, /Lượt tạo bằng bản cũ · tối đa 300 mỗi link/,
      'a request-v1 run is labelled legacy, never rewritten');
    assert.doesNotMatch(doc.getElementById('rsPanel')!.textContent!, /1–300/,
      'the legacy label never hard-codes the obsolete 1-300 range');

    assert.equal(element<HTMLInputElement>(doc, 'newTotal').min, '1');
    assert.equal(element<HTMLInputElement>(doc, 'newTotal').max, '2000');
    assert.equal(element<HTMLInputElement>(doc, 'newTotal').value, '300');
    assert.equal((doc.querySelector('input[name="newPolicyMode"][value="with-comments"]') as HTMLInputElement).checked, true);
  } finally { dom.window.close(); }
});

test('a legacy run keeps one visible direct M3 route beside its closed extra route', async () => {
  const { dom, doc, state } = await samplingHarness();
  try {
    const panel = doc.getElementById('rsPanel')!;
    const m3Card = [...doc.querySelectorAll('#techDetails article.mod')]
      .find((card) => /Lấy bình luận/.test(card.querySelector('h3')?.textContent || ''));
    assert.ok(m3Card, 'the M3 step card is still present');
    assert.equal([...m3Card!.querySelectorAll('button')]
      .filter((button) => button.textContent === 'Chạy bước này').length, 0,
    'the legacy card does not duplicate the original route');
    const original = element<HTMLButtonElement>(doc, 'samplingRunBtn');
    assert.equal(original.textContent, 'Lấy bình luận theo thiết lập lúc tạo lượt');
    assert.equal(original.closest('details'), null, 'the legacy original route stays visible, not tucked in extras');
    const extras = panel.querySelectorAll('details.extra-collection');
    assert.equal(extras.length, 1, 'legacy keeps exactly one explicit extra section');
    assert.equal((extras[0] as HTMLDetailsElement).open, false);
    assert.ok(extras[0]!.querySelector('#samplingCustomRunBtn'), 'the closed extra section owns the save route');

    original.click();
    await waitFor(() => state.launchCalls.length === 1, 'legacy original dispatches once');
    assert.equal(state.saveCalls.length, 0,
      'the legacy original route never writes a replacement plan');
    assert.deepEqual(state.launchCalls[0], { runId: 'run-synthetic', module: 'm3', sha: undefined },
      'the legacy original route dispatches the original module binding');
  } finally { dom.window.close(); }
});

test('a request-v2 run opens the first collection with its frozen policy and launches the original route', async () => {
  const info = syntheticRunInfo();
  info.request = {
    format: 'request-v2', preset: { keywords: ['son'] },
    windows: [{ id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-11' }, intervalDays: 7 }],
    collectionPolicy: {
      format: 'shopee-review-policy-v1', mode: 'stars', stars: [2, 3], totalPerLink: 500,
      allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1',
    },
  };
  // The sampler's defaultInput is the real legacy default even for a configured run.
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'IDLE' }],
    runInfo: info, sampling: syntheticSampling(),
  });
  try {
    await waitFor(() => doc.getElementById('rsN') !== null, 'sampling defaults');
    const panel = doc.getElementById('rsPanel')!;
    assert.match(panel.querySelector('.policy-frozen')!.textContent!, /Cách lấy đã chọn lúc tạo lượt/);
    assert.match(panel.querySelector('.policy-frozen')!.textContent!, /Đánh giá 2 và 3 sao · tối đa 500 mỗi link/);

    assert.equal(element<HTMLInputElement>(doc, 'rsMode-stars').checked, true,
      'the first collection starts from the saved star policy, not the legacy sampler default');
    const checkedStars = [...doc.querySelectorAll<HTMLInputElement>('#rsStars input:checked')]
      .map((box) => Number(box.dataset.star)).sort();
    assert.deepEqual(checkedStars, [2, 3], 'the saved star levels are preselected');
    assert.equal(element<HTMLInputElement>(doc, 'rsN').value, '500', 'the saved per-link total is used');
    assert.equal(element<HTMLInputElement>(doc, 'rsBalanced').checked, false);
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!,
      /Đánh giá 2 và 3 sao · tối đa 500 mỗi link/);
    const extra = panel.querySelector('details.extra-collection') as HTMLDetailsElement;
    assert.ok(extra, 'a custom collection stays an explicit opt-in');
    assert.equal(extra.open, false, 'the custom route is closed until the user opts in');
    const m3Card = [...doc.querySelectorAll('#techDetails article.mod')]
      .find((card) => /Lấy bình luận/.test(card.querySelector('h3')?.textContent || ''));
    assert.ok(m3Card, 'the M3 step card is still present');
    assert.equal([...m3Card!.querySelectorAll('button')]
      .filter((button) => button.textContent === 'Chạy bước này').length, 0,
    'the configured run has no second generic M3 execution control');
    assert.match(extra.querySelector('summary')!.textContent || '', /^Lấy thêm theo cách khác$/,
      'the extra attempt uses the same wording before and after the original attempt');
    assert.match(extra.textContent || '', /không thay đổi thiết lập đã lưu/,
      'the extra attempt never rewrites the stored original policy');
    assert.ok(extra.querySelector('#samplingCustomRunBtn'), 'the custom route owns its own action');
    assert.ok(panel.querySelector('.rs-actions #samplingRunBtn'), 'the primary first-collection action is visible');
    assert.equal(doc.querySelectorAll('#rsPanel > .rs-actions #samplingRunBtn').length, 1,
      'exactly one visible original M3 control');
    assert.equal(state.saveCalls.length + state.launchCalls.length, 0, 'opening the run starts no collection');

    element<HTMLButtonElement>(doc, 'samplingRunBtn').click();
    await waitFor(() => state.launchCalls.length === 1, 'the frozen automatic route launches once');
    assert.equal(state.saveCalls.length, 0,
      'the initial action never writes a replacement plan for the frozen request policy');
    assert.deepEqual(state.launchCalls[0], { runId: 'run-synthetic', module: 'm3', sha: undefined },
      'the bridge receives the original run and module with no plan SHA');
  } finally { dom.window.close(); }
});

test('a completed automatic attempt is retained without starting another source action', async () => {
  const info = syntheticRunInfo();
  info.request = {
    format: 'request-v2', preset: { keywords: ['son'] },
    windows: [{ id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-11' }, intervalDays: 7 }],
    collectionPolicy: {
      format: 'shopee-review-policy-v1', mode: 'stars', stars: [2, 3], totalPerLink: 500,
      allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1',
    },
  };
  const automaticAttempt = {
    attemptId: '00000000-0000-4000-8000-0000000000aa', automatic: true,
    executionId: '00000000-0000-4000-8000-0000000000ab', sequence: 2,
    createdAt: '2026-11-11T04:30:00.000Z', status: 'SUCCEEDED', errorCode: null,
    planSha256: 'b'.repeat(64), requestSha256: 'c'.repeat(64), m2Digest: 'a'.repeat(64),
    gate: passSlip('M3'), stopRequested: false, reconcilable: false,
    links: [
      { shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200', requested: 500, actual: 2, shortfall: 498, complete: true, status: 'exhausted' },
      { shopId: '101', itemId: '201', url: 'https://shopee.vn/product/101/201', requested: 500, actual: 2, shortfall: 498, complete: true, status: 'exhausted' },
    ],
  };
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: info, sampling: syntheticSampling({ attempts: [automaticAttempt] }),
  });
  try {
    await waitFor(() => doc.getElementById('rsPanel') !== null, 'sampling panel');
    assert.match(doc.getElementById('rsPanel')!.textContent!,
      /Lượt này đã lấy bình luận theo thiết lập trên/);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Hoàn tất/, 'the automatic attempt status is shown');
    assert.equal((doc.querySelector('details.extra-collection') as HTMLDetailsElement).open, false,
      'a second collection starts as an explicit extra choice');
    assert.equal(doc.querySelector('#rsPanel > .rs-actions'), null,
      'the completed automatic attempt exposes no repeated original launch');
    assert.equal([...doc.querySelectorAll('#rsPanel button')]
      .filter((button) => button.textContent === 'Lấy bình luận theo thiết lập lúc tạo lượt').length, 0);
    assert.equal(state.saveCalls.length + state.launchCalls.length, 0,
      'opening the completed attempt never dispatches it again');
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
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Đánh giá 1 và 2 và 3 và 4 và 5 sao · tối đa 302 mỗi link · chia đều/);
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
      assert.match(element<HTMLElement>(doc, 'rsHint').textContent!, /1 đến 2\.000/);
    }

    n.value = '2000';
    fire(window, n, 'input');
    assert.equal(element<HTMLElement>(doc, 'rsHint').hidden, true);
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /2\.000/);

    n.value = '1';
    fire(window, n, 'input');
    assert.equal(element<HTMLElement>(doc, 'rsHint').hidden, true);
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /tối đa 1 mỗi link/);
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
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Mọi mức sao, chỉ phần chữ · tối đa 300 mỗi link/);

    const legacyMode = element<HTMLInputElement>(doc, 'rsMode-with-comments');
    legacyMode.checked = true;
    fire(window, legacyMode, 'change');
    assert.match(element<HTMLElement>(doc, 'rsSummary').textContent!, /Đánh giá có bình luận · tối đa 300 mỗi link/);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /chỉ lấy phần chữ/);
  } finally { dom.window.close(); }
});

test('one extra action saves exactly the four contract keys and launches that returned plan', async () => {
  const { dom, doc, window, state } = await samplingHarness();
  try {
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

    (doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    const runBtn = element<HTMLButtonElement>(doc, 'samplingCustomRunBtn');
    assert.equal(runBtn.disabled, false);
    runBtn.click();
    await waitFor(() => state.saveCalls.length === 1 && state.launchCalls.length === 1,
      'save then exact launch');
    assert.deepEqual(state.saveCalls[0].input, {
      mode: 'stars', stars: [1, 2, 3], totalPerLink: 302, allocation: 'equal-stars',
    });
    const savedSha = state.sampling.plans.find(
      (entry: any) => entry.plan.policy.totalPerLink === 302)!.planSha256;
    assert.deepEqual(state.launchCalls[0], { runId: 'run-synthetic', module: 'm3', sha: savedSha });
    assert.equal(state.refreshCountCalls, 0, 'saving or launching never refreshes source counts');
  } finally { dom.window.close(); }
});

test('double click saves once and launches the one returned plan once', async () => {
  const gate = deferred<any>();
  const { dom, doc, state } = await samplingHarness({}, { saveGate: gate });
  try {
    (doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    const runBtn = element<HTMLButtonElement>(doc, 'samplingCustomRunBtn');
    runBtn.click();
    runBtn.click();
    await waitFor(() => state.saveCalls.length === 1, 'single in-flight save');
    assert.equal(state.saveCalls.length, 1, 'the second click is ignored while saving');

    gate.resolve(undefined);
    await waitFor(() => state.launchCalls.length === 1, 'single launch after save');
    assert.equal(state.saveCalls.length, 1);
    assert.equal(state.launchCalls.length, 1);
    assert.equal(state.launchCalls[0].sha, state.sampling.plans[0].planSha256);
  } finally { dom.window.close(); }
});

test('editing while the plan saves blocks launch until a fresh save', async () => {
  const gate = deferred<any>();
  const { dom, doc, window, state } = await samplingHarness({}, { saveGate: gate });
  try {
    (doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    element<HTMLButtonElement>(doc, 'samplingCustomRunBtn').click();
    await waitFor(() => state.saveCalls.length === 1, 'save started');
    const n = element<HTMLInputElement>(doc, 'rsN');
    n.value = '301';
    fire(window, n, 'input');

    gate.resolve(undefined);
    await waitFor(() => !element<HTMLElement>(doc, 'samplingErr').hidden &&
      /thay đổi/i.test(element<HTMLElement>(doc, 'samplingErr').textContent || ''), 'edited-save refusal');
    assert.equal(state.launchCalls.length, 0, 'the older saved policy never launches the edited draft');
    assert.equal(element<HTMLInputElement>(doc, 'rsN').value, '301', 'the newer edit survives');

    element<HTMLButtonElement>(doc, 'samplingCustomRunBtn').click();
    await waitFor(() => state.saveCalls.length === 2 && state.launchCalls.length === 1, 'fresh save launches');
    assert.equal((state.saveCalls[1].input as any).totalPerLink, 301);
    const fresh = state.sampling.plans.find((entry: any) => entry.plan.policy.totalPerLink === 301)!;
    assert.equal(state.launchCalls[0].sha, fresh.planSha256);
  } finally { dom.window.close(); }
});

test('a saved response that does not match the captured draft never launches', async () => {
  const { dom, doc, state } = await samplingHarness({}, {
    saveReviewPlanResult: (runId, input, sha, plan) => ({
      ok: true, data: {
        format: 'review-plan-saved-v1', runId, planSha256: sha,
        plan: { ...plan, policy: { ...plan.policy, totalPerLink: 999 } },
      },
    }),
  });
  try {
    (doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    element<HTMLButtonElement>(doc, 'samplingCustomRunBtn').click();
    await waitFor(() => state.saveCalls.length === 1, 'save returned');
    await waitFor(() => !element<HTMLElement>(doc, 'samplingErr').hidden &&
      /không khớp/i.test(element<HTMLElement>(doc, 'samplingErr').textContent || ''), 'mismatch refusal');
    assert.equal(state.launchCalls.length, 0, 'a mismatched saved plan never launches');
    assert.equal(element<HTMLButtonElement>(doc, 'samplingCustomRunBtn').disabled, false,
      'the user can save the current draft again');
  } finally { dom.window.close(); }
});

test('a pending extra save that resolves after leaving and returning never launches it', async () => {
  const saveGate = deferred<any>();
  const automaticAttempt = (runId: string) => ({
    attemptId: 'attempt-auto-' + runId, automatic: true,
    executionId: 'exec-auto-' + runId, sequence: 1,
    createdAt: '2026-11-11T04:30:00.000Z', status: 'SUCCEEDED', errorCode: null,
    planSha256: 'b'.repeat(64), requestSha256: 'c'.repeat(64), m2Digest: 'a'.repeat(64),
    gate: passSlip('M3'), stopRequested: false, reconcilable: false,
    links: [
      { shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200', requested: 500, actual: 2, shortfall: 498, complete: true, status: 'exhausted' },
      { shopId: '101', itemId: '201', url: 'https://shopee.vn/product/101/201', requested: 500, actual: 2, shortfall: 498, complete: true, status: 'exhausted' },
    ],
  });
  const viewA = syntheticSampling({ runId: 'run-a', m2Digest: 'a'.repeat(64), attempts: [automaticAttempt('run-a')] });
  const viewB = syntheticSampling({ runId: 'run-b', m2Digest: 'b'.repeat(64) });
  const { dom, doc, state } = harness({
    runs: [
      { runId: 'run-a', product: 'Sản phẩm A', status: 'DONE' },
      { runId: 'run-b', product: 'Sản phẩm B', status: 'IDLE' },
    ],
    runInfoByRun: { 'run-a': createdRunInfo('run-a'), 'run-b': createdRunInfo('run-b') },
    sampling: viewA,
    samplingByRun: { 'run-a': viewA, 'run-b': viewB },
    saveGate,
  });
  try {
    await waitFor(() => doc.getElementById('rsN') !== null, 'run A sampling');
    const extraA = doc.querySelector('details.extra-collection') as HTMLDetailsElement;
    assert.ok(extraA, 'run A offers the explicit extra route');
    extraA.open = true;
    element<HTMLButtonElement>(doc, 'samplingRunBtn').click();
    await waitFor(() => state.saveCalls.length === 1, 'extra save pending');

    runListButton(doc, 'run-b').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-b'),
      'run B selected');
    runListButton(doc, 'run-a').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-a'),
      'run A selected again');

    const stalePlans = state.sampling.plans.map((entry: any) => entry.planSha256);
    saveGate.resolve(undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(state.launchCalls.length, 0,
      'an extra save that resolves after the selection session changed must not dispatch');
    assert.equal(state.saveCalls.length, 1, 'the stale extra save is not repeated');

    (doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    element<HTMLButtonElement>(doc, 'samplingRunBtn').click();
    await waitFor(() => state.saveCalls.length === 2 && state.launchCalls.length === 1,
      'a fresh extra save in the current session launches once');
    assert.equal(state.launchCalls.length, 1, 'neither save launches twice');
    assert.ok(!stalePlans.includes(state.launchCalls[0].sha),
      'the launch uses the SHA returned by the current save, not the stale result');
    assert.ok(state.sampling.plans.some((entry: any) => entry.planSha256 === state.launchCalls[0].sha));
    assert.deepEqual(state.saveCalls[1].input,
      { mode: 'stars', stars: [2, 3], totalPerLink: 500, allocation: 'pooled' },
      'the extra route still saves exactly the four contract keys');
  } finally { dom.window.close(); }
});

test('a dispatch error is shown and never retried automatically', async () => {
  const { dom, doc, state } = await samplingHarness({}, {
    runModuleResult: () => ({ ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } }),
  });
  try {
    element<HTMLButtonElement>(doc, 'samplingRunBtn').click();
    await waitFor(() => state.launchCalls.length === 1 && !element<HTMLElement>(doc, 'samplingErr').hidden,
      'dispatch failure shown');
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(state.launchCalls.length, 1, 'the dispatched attempt is not silently retried');
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
      '7', '0', 'Không đọc được', 'Không rõ', 'Không thấy', 'Không đọc được',
    ], 'unknown cells say why without a double negative or a fabricated number');
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
    buttonByText(doc, 'Xem số đánh giá hiện có trên Shopee')!.click();
    await waitFor(() => state.refreshCountCalls === 1, 'refresh started');
    await waitFor(() => /Đang xem số đánh giá/.test(doc.getElementById('rsPanel')!.textContent!), 'running state');
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Chưa xem số đánh giá/,
      'a start is not completed counts');
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
    assert.match(text, /1 sao: chưa có số liệu/, 'an unobserved star is not a number');
    assert.match(text, /2 sao: chưa có số liệu/, 'an unobserved star is not a number');
    assert.doesNotMatch(text, /\(thiếu 0\)|actual: 0/);
    assert.ok(!text.includes('attempt-live-1'), 'the attempt namespace stays internal');

    buttonByText(doc, 'Dừng lần lấy này')!.click();
    await waitFor(() => state.controlCalls.length === 1, 'custom stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-live-1',
    });
    await waitFor(() => /Đã gửi lệnh dừng/.test(doc.getElementById('rsPanel')!.textContent!), 'stop requested');
    assert.equal(buttonByText(doc, 'Dừng lần lấy này'), undefined);
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
    assert.equal(element<HTMLButtonElement>(doc, 'samplingRunBtn').disabled, true);
    buttonByText(doc, 'Dừng lần lấy này')!.click();
    await waitFor(() => state.controlCalls.length === 1, 'uncertain stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-uncertain-1',
    });
    await waitFor(() => /Đã gửi lệnh dừng/.test(doc.getElementById('rsPanel')!.textContent!), 'stop requested');
    assert.equal(buttonByText(doc, 'Dừng lần lấy này'), undefined);
    buttonByText(doc, 'Kiểm tra lại kết quả lần này')!.click();
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
    assert.ok(buttonByText(doc, 'Kiểm tra lại lần đọc'));
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
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Không đọc được kết quả bước 2/);
    assert.equal(doc.getElementById('rsN'), null, 'no total-per-link config without M2');
    assert.equal(buttonByText(doc, 'Lấy bình luận theo thiết lập này'), undefined);
    assert.equal(buttonByText(doc, 'Xem số đánh giá hiện có trên Shopee'), undefined);
    assert.ok(buttonByText(doc, 'Dừng lần lấy này'), 'frozen custom attempt remains stoppable');
    assert.ok(buttonByText(doc, 'Kiểm tra lại kết quả lần này'), 'frozen custom attempt remains reconcilable');
    assert.ok(buttonByText(doc, 'Dừng đọc số đánh giá'), 'frozen counts attempt remains stoppable');
    assert.ok(buttonByText(doc, 'Kiểm tra lại lần đọc'), 'frozen counts attempt remains reconcilable');

    let calls = state.reviewSamplingCalls;
    buttonByText(doc, 'Dừng lần lấy này')!.click();
    await waitFor(() => state.controlCalls.length === 1 && state.reviewSamplingCalls > calls, 'custom stop');
    assert.deepEqual(state.controlCalls[0], {
      action: 'stop', runId: 'run-synthetic', kind: 'custom', attemptId: 'attempt-frozen-custom',
    });
    calls = state.reviewSamplingCalls;
    buttonByText(doc, 'Kiểm tra lại kết quả lần này')!.click();
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
    buttonByText(doc, 'Kiểm tra lại lần đọc')!.click();
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
    const bButton = runListButton(doc, 'run-b');
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
    assert.match(panel, /Dừng vì: Shopee không còn đánh giá nào/);
    assert.match(panel, /Dừng vì: không rõ lý do/);
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
      title: 'viên uống kẽm: 11/11/2026 11:26',
      statusText: 'Hoàn tất',
    },
    {
      name: 'legacy first launch unknown',
      status: 'DONE',
      tracking: {
        primaryKeyword: 'kem', firstRunAt: null, timeBasis: 'legacy-first-unproven',
        displayTimezone: 'Asia/Ho_Chi_Minh', lastKnownStartedAt: null,
      },
      title: 'kem · không có giờ bắt đầu (lượt cũ)',
      statusText: 'Hoàn tất',
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
      assert.doesNotMatch(sample.title, /\b(am|pm)\b/i, 'time labels stay on one 24-hour format');
      assert.match(head.textContent!, new RegExp(sample.statusText));
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
    assert.equal(result.doc.getElementById('rdPanel')!.getAttribute('aria-label'), 'Kết quả và tải file bình luận',
      'the results region has a plain accessible name');
    assert.equal(result.doc.getElementById('rdPanel')!.textContent!.includes('Kết quả và tải file'), true);
    assert.equal(element<HTMLSelectElement>(result.doc, 'rdSource').value, latest.sourceSha256,
      'the latest completed usable source is selected by default');
    assert.match(element<HTMLElement>(result.doc, 'rdSummary').textContent!, /12 bình luận/);
    assert.match(result.doc.getElementById('rdPanel')!.textContent!, /Đã tạo file JSON trước đó: shopee-cached\.json/);
    assert.match(result.doc.getElementById('rdPanel')!.textContent!, /Tải file TXT: Chưa tải được file cho kết quả này/);
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdSave').textContent, 'Lưu vào hệ thống');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdJson').textContent, 'Tải file JSON');
    assert.equal(element<HTMLButtonElement>(result.doc, 'rdTxt').textContent, 'Tải file TXT');
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
    await waitFor(() => /Đã lưu file /.test(result.doc.getElementById('rdHint')!.textContent!), 'export notice');

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
    await waitFor(() => /Đã hủy tải file\./.test(result.doc.getElementById('rdHint')!.textContent!), 'cancel notice');
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
  const runButton = (runId: string): HTMLButtonElement => runListButton(doc, runId);
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
    await waitFor(() => !element<HTMLElement>(doc, 'reviewDataErr').hidden, 'failure re-enables the visible panel');
    assert.match(element<HTMLElement>(doc, 'reviewDataErr').textContent!, /thử lại|Chưa tải được/,
      'the failure remains visible with a plain message');
    assert.doesNotMatch(element<HTMLElement>(doc, 'reviewDataErr').textContent!, /EXPORT_FAILED/,
      'the raw failure code stays out of the primary alert');
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
      /Đã lưu file /.test(doc.getElementById('rdHint')!.textContent!), 'success re-enables and reports the visible panel');
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
    assert.match(panel.textContent!, /Hệ thống đang tạm khóa để bảo trì\./);
    assert.match(panel.textContent!, /Lưu vào hệ thống: Hệ thống đang tạm khóa/);
    assert.match(panel.textContent!, /Tải file TXT: Hệ thống đang tạm khóa/);
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

test('readonly blocks launch and a new count read while offline stop and reconcile stay unavailable', async () => {
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
    assert.equal(element<HTMLButtonElement>(doc, 'samplingRunBtn').disabled, true,
      'the maintenance lock blocks a new collection');
    assert.equal(element<HTMLButtonElement>(doc, 'samplingCountsBtn').disabled, true,
      'the maintenance lock blocks a new count read');
    assert.ok(buttonByText(doc, 'Dừng đọc số đánh giá'), 'an offline stop remains reachable');
    assert.equal(buttonByText(doc, 'Kiểm tra lại lần đọc'), undefined);
    assert.ok(buttonByText(doc, 'Dừng lần lấy này'), 'a custom attempt stop remains reachable');
    assert.equal(buttonByText(doc, 'Kiểm tra lại kết quả lần này'), undefined);
    assert.match(doc.getElementById('rsPanel')!.textContent!, /Hệ thống đang tạm khóa/);
    assert.equal(state.refreshCountCalls, 0);
  } finally { dom.window.close(); }
});

test('the initial summary follows the loaded product and names the frozen period plainly', async () => {
  const { dom, doc, window } = harness({
    presets: [preset('kem', 'Kem chống nắng'), preset('son', 'Son môi')],
  });
  try {
    await booted(doc);
    assert.equal(summaryValue(doc, 'Sản phẩm'), 'Kem chống nắng');
    assert.match(summaryValue(doc, 'Khoảng thời gian'),
      /^30 ngày: từ \d{2}\/\d{2}\/\d{4} đến \d{2}\/\d{2}\/\d{4}; 12 tháng: từ \d{2}\/\d{2}\/\d{4} đến \d{2}\/\d{2}\/\d{4} \(tính cả hai đầu\)\.$/);
    assert.match(summaryValue(doc, 'Nội dung lấy'), /^Chỉ lấy phần chữ/);
    assert.match(summaryValue(doc, 'Bước tiếp'), /Tạo lượt chỉ kiểm tra đầu vào/);
    assert.doesNotMatch(element<HTMLElement>(doc, 'reviewSummary').textContent!,
      /Khung 30 ngày|Kỳ dữ liệu|Phạm vi|Sau khi tạo/);

    const select = element<HTMLSelectElement>(doc, 'presetSel');
    select.value = 'son';
    fire(window, select, 'change');
    await waitFor(() => summaryValue(doc, 'Sản phẩm') === 'Son môi', 'summary follows the product');
  } finally { dom.window.close(); }
});

test('the end date defaults to local yesterday and later dates are refused locally', async () => {
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-date' } }),
    runInfoByRun: { 'run-date': createdRunInfo('run-date') },
  });
  try {
    await booted(doc);
    const end = element<HTMLInputElement>(doc, 'endDate');
    assert.equal(end.value, localDay(-1));
    assert.equal(end.max, localDay(-1));

    end.value = localDay(0);
    create(doc);
    await waitFor(() => !element<HTMLElement>(doc, 'newErr').hidden, 'today refused');
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!,
      /Chọn ngày hôm qua hoặc sớm hơn; hôm nay chưa kết thúc\./);
    assert.equal(state.newRunCalls, 0, 'today never reaches the bridge');

    end.value = localDay(1);
    create(doc);
    assert.equal(state.newRunCalls, 0, 'tomorrow never reaches the bridge');

    end.value = localDay(-1);
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'yesterday is accepted');
  } finally { dom.window.close(); }
});

test('a created run is selected for tracking and older runs stay listed', async () => {
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-older', product: 'Lượt cũ', status: 'DONE', request: { format: 'request-v1', reviewCapPerLink: 300 } }],
    runInfoByRun: { 'run-older': syntheticRunInfo('run-older'), 'run-new': createdRunInfo('run-new') },
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-new' } }),
    runFlowResult: { ok: true, data: { format: 'flow-start-v1', runId: 'run-new' } },
  });
  try {
    await booted(doc);
    chooseStars(doc, [2, 3], 500);
    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'binding');
    await openFlowConfirmation(doc);
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => state.flowCalls.length === 1, 'flow dispatch');
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-new'),
      'the new run is tracked');
    assert.ok(runListButton(doc, 'run-older'), 'older history is preserved');
  } finally { dom.window.close(); }
});

test('a late create reply never steals the run currently being tracked', async () => {
  const gate = deferred<any>();
  const { dom, doc, state } = harness({
    runs: [
      { runId: 'run-a', product: 'Sản phẩm A', status: 'DONE', request: { format: 'request-v1', reviewCapPerLink: 300 } },
      { runId: 'run-b', product: 'Sản phẩm B', status: 'IDLE', request: { format: 'request-v1', reviewCapPerLink: 300 } },
    ],
    runInfoByRun: {
      'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b'),
      'run-late': createdRunInfo('run-late'),
    },
    newRunGate: gate,
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-late' } }),
  });
  try {
    await booted(doc);
    runListButton(doc, 'run-a').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-a'),
      'run A selected');
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'create in flight');
    element<HTMLInputElement>(doc, 'newTotal').value = '501';
    fire(doc.defaultView as any, element<HTMLInputElement>(doc, 'newTotal'), 'input');
    gate.resolve({ ok: true, data: { format: 'new-run-v1', runId: 'run-late' } });
    await waitFor(() => /run-late/.test(element<HTMLElement>(doc, 'newNotice').textContent || ''), 'late create notice');
    assert.equal((doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-a'), true,
      'the late reply does not change the tracked run');
    assert.ok(runListButton(doc, 'run-late'), 'the late-created run stays in history');
  } finally { dom.window.close(); }
});

test('M3 save and launch failures stay in the local plain alert', async () => {
  const saveFail = await samplingHarness({}, {
    saveReviewPlanResult: () => ({ ok: false, error: { code: 'REVIEW_POLICY_INVALID', message: 'REVIEW_POLICY_INVALID' } }),
  });
  try {
    assert.equal(element<HTMLElement>(saveFail.doc, 'samplingErr').getAttribute('role'), 'alert');
    (saveFail.doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    element<HTMLButtonElement>(saveFail.doc, 'samplingCustomRunBtn').click();
    await waitFor(() => {
      const node = saveFail.doc.getElementById('samplingErr');
      return !!node && node.hidden === false && (node.textContent || '').length > 0;
    }, 'save failure alert');
    const text = element<HTMLElement>(saveFail.doc, 'samplingErr').textContent!;
    assert.doesNotMatch(text, /REVIEW_POLICY_INVALID/, 'the raw save code stays out of the primary alert');
    assert.match(text, /thử lại|Hãy|Chưa/);
    assert.equal(saveFail.state.launchCalls.length, 0, 'a failed save never dispatches');
  } finally { saveFail.dom.window.close(); }

  const launchFail = await samplingHarness({}, {
    runModuleResult: () => ({ ok: false, error: { code: 'BRIDGE_ERROR', message: 'BRIDGE_ERROR' } }),
  });
  try {
    (launchFail.doc.querySelector('details.extra-collection') as HTMLDetailsElement).open = true;
    element<HTMLButtonElement>(launchFail.doc, 'samplingCustomRunBtn').click();
    await waitFor(() => {
      const node = launchFail.doc.getElementById('samplingErr');
      return !!node && node.hidden === false && (node.textContent || '').length > 0;
    }, 'launch failure alert');
    const text = element<HTMLElement>(launchFail.doc, 'samplingErr').textContent!;
    assert.doesNotMatch(text, /BRIDGE_ERROR/, 'the raw launch code stays out of the primary alert');
    assert.match(text, /thử lại|lỗi/i);
    assert.equal(launchFail.state.launchCalls.length, 1, 'the failed dispatch is not retried');
  } finally { launchFail.dom.window.close(); }
});

test('review-data failures stay in the local plain alert without raw codes', async () => {
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    reviewData: syntheticReviewData(),
    exportReviewResult: () => ({ ok: false, error: { code: 'EXPORT_FAILED', message: 'EXPORT_FAILED' } }),
  });
  try {
    await waitFor(() => result.doc.getElementById('rdSource') !== null, 'review panel');
    assert.equal(element<HTMLElement>(result.doc, 'reviewDataErr').getAttribute('role'), 'alert');
    element<HTMLButtonElement>(result.doc, 'rdJson').click();
    await waitFor(() => !element<HTMLElement>(result.doc, 'reviewDataErr').hidden, 'export failure alert');
    const text = element<HTMLElement>(result.doc, 'reviewDataErr').textContent!;
    assert.doesNotMatch(text, /EXPORT_FAILED/, 'the raw export code stays out of the primary alert');
    assert.match(text, /thử lại|Chưa/);
    assert.equal(result.state.exportReviewDataCalls.length, 1, 'the failed export is not retried');
  } finally { result.dom.window.close(); }
});

test('results stay above one closed step section and a failed run opens it', async () => {
  const done = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(), sampling: syntheticSampling(), reviewData: syntheticReviewData(),
  });
  try {
    await waitFor(() => done.doc.getElementById('rdPanel') !== null &&
      done.doc.getElementById('techDetails') !== null, 'detail panels');
    const review = done.doc.getElementById('rdPanel')!;
    const tech = done.doc.getElementById('techDetails') as HTMLDetailsElement;
    assert.ok(review.compareDocumentPosition(tech) & 4, 'results come before the step section');
    assert.equal(tech.open, false, 'a completed run keeps the step section closed');
    assert.equal(tech.firstElementChild!.textContent, 'Các bước thực hiện');
    const raw = [...tech.querySelectorAll('summary')].filter((node) => node.textContent === 'Chi tiết kỹ thuật');
    assert.ok(raw.length > 0, 'raw diagnostics stay in their own closed details');
  } finally { done.dom.window.close(); }

  const failedInfo: any = syntheticRunInfo();
  failedInfo.state = { status: 'FAILED', module: 'M3', errorCode: 'GATE_FAILED' };
  const failed = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'FAILED' }],
    runInfo: failedInfo, sampling: syntheticSampling(),
  });
  try {
    await waitFor(() => failed.doc.getElementById('techDetails') !== null, 'failed detail');
    assert.equal((failed.doc.getElementById('techDetails') as HTMLDetailsElement).open, true,
      'a failed run opens the step section');
  } finally { failed.dom.window.close(); }
});

test('progress uses only the current execution and same-attempt observed counts', async () => {
  const info: any = syntheticRunInfo('run-progress');
  info.state = { status: 'RUNNING', module: 'M3', errorCode: null };
  const emptyModule = (status: string) => ({
    status, executionId: null, sequence: 1, attemptId: null, startedAt: null, endedAt: null,
    basis: 'none', currentGate: null, historicalGate: null, errorCode: null,
  });
  info.execution = {
    format: 'run-execution-view-v1', runId: 'run-progress', revision: 3, status: 'RUNNING',
    currentModule: 'M3', currentExecutionId: 'exec-1',
    modules: {
      M1: emptyModule('SUCCEEDED'), M2: emptyModule('SUCCEEDED'),
      M3: { ...emptyModule('RUNNING'), executionId: 'exec-1', sequence: 2, attemptId: 'attempt-progress' },
    },
  };
  const attempt = {
    attemptId: 'attempt-progress', status: 'RUNNING', errorCode: null, gate: null,
    stopRequested: false, reconcilable: false,
    links: [
      { shopId: '100', itemId: '200', requested: 500, actual: null, shortfall: null, stopReason: '', stars: [] },
      { shopId: '101', itemId: '201', requested: 500, actual: 7, shortfall: null, stopReason: '', stars: [] },
    ],
  };
  const running = harness({
    runs: [{ runId: 'run-progress', product: 'Sản phẩm', status: 'RUNNING' }],
    runInfo: info,
    sampling: syntheticSampling({ runId: 'run-progress', attempts: [attempt] }),
    reviewData: syntheticReviewData({ runId: 'run-progress' }),
  });
  try {
    await waitFor(() => /Đã ghi nhận 7 bình luận ở 1\/2 link/
      .test(running.doc.getElementById('progressLine')?.textContent || ''), 'authoritative progress');
    const text = running.doc.getElementById('progressLine')!.textContent!;
    assert.doesNotMatch(text, /0 bình luận|%|ETA|phút|giây/,
      'an unobserved link is not counted and no rate is promised');
  } finally { running.dom.window.close(); }

  const completedInfo: any = syntheticRunInfo('run-done');
  completedInfo.execution = {
    format: 'run-execution-view-v1', runId: 'run-done', revision: 4, status: 'SUCCEEDED',
    currentModule: null, currentExecutionId: null,
    modules: { M1: emptyModule('SUCCEEDED'), M2: emptyModule('SUCCEEDED'), M3: emptyModule('SUCCEEDED') },
  };
  const completed = harness({
    runs: [{ runId: 'run-done', product: 'Sản phẩm', status: 'DONE' }],
    runInfo: completedInfo,
  });
  try {
    await waitFor(() => completed.doc.getElementById('techDetails') !== null, 'completed detail');
    assert.equal(completed.doc.getElementById('progressLine'), null, 'a settled run never shows progress');
  } finally { completed.dom.window.close(); }
});

test('progress ignores a cached running attempt that the authoritative execution does not name', async () => {
  const attempt = (attemptId: string | null, executionId: string | null, sequence: number | null, value: number) => ({
    attemptId, executionId, sequence, status: 'RUNNING', errorCode: null, gate: null,
    stopRequested: false, reconcilable: false,
    links: [
      { shopId: '100', itemId: '200', requested: 500, actual: value, shortfall: null, stopReason: '', stars: [] },
      { shopId: '101', itemId: '201', requested: 500, actual: null, shortfall: null, stopReason: '', stars: [] },
    ],
  });
  const started = (runId: string, currentAttemptId: string | null, attempts: any[]) => {
    const settled = (status: string) => ({
      status, executionId: null, sequence: 1, attemptId: null, startedAt: null, endedAt: null,
      basis: 'none', currentGate: null, historicalGate: null, errorCode: null,
    });
    const info: any = syntheticRunInfo(runId);
    info.state = { status: 'RUNNING', module: 'M3', errorCode: null };
    info.execution = {
      format: 'run-execution-view-v1', runId, revision: 3, status: 'RUNNING',
      currentModule: 'M3', currentExecutionId: 'exec-current',
      modules: {
        M1: settled('SUCCEEDED'), M2: settled('SUCCEEDED'),
        M3: { ...settled('RUNNING'), executionId: 'exec-current', sequence: 3, attemptId: currentAttemptId },
      },
    };
    return harness({
      runs: [{ runId, product: 'Sản phẩm', status: 'RUNNING' }],
      runInfo: info,
      sampling: syntheticSampling({ runId, attempts }),
      reviewData: syntheticReviewData({ runId }),
    });
  };

  const stale = started('run-stale', 'attempt-current', [
    attempt('attempt-old', 'exec-old', 2, 9),
  ]);
  try {
    await waitFor(() => stale.state.reviewSamplingCallsByRun['run-stale'] === 1, 'stale sampling loaded');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const line = stale.doc.getElementById('progressLine')?.textContent || '';
    assert.match(line, /Đang chờ số liệu/, 'an attempt from an older execution is not current evidence');
    assert.doesNotMatch(line, /9 bình luận/, 'a stale RUNNING attempt never supplies current counts');
  } finally { stale.dom.window.close(); }

  const matched = started('run-matched', 'attempt-current', [
    attempt('attempt-current', 'exec-current', 3, 9),
  ]);
  try {
    await waitFor(() => /Đã ghi nhận 9 bình luận ở 1\/2 link/
      .test(matched.doc.getElementById('progressLine')?.textContent || ''), 'matching attempt counts');
  } finally { matched.dom.window.close(); }

  const unknown = started('run-unknown', 'attempt-current', [
    attempt(null, null, null, 9),
  ]);
  try {
    await waitFor(() => unknown.state.reviewSamplingCallsByRun['run-unknown'] === 1, 'anonymous sampling loaded');
    await new Promise((resolve) => setTimeout(resolve, 20));
    const line = unknown.doc.getElementById('progressLine')?.textContent || '';
    assert.match(line, /Đang chờ số liệu/, 'missing attempt identity stays unknown');
    assert.doesNotMatch(line, /9 bình luận/, 'an unidentifiable attempt supplies no current counts');
  } finally { unknown.dom.window.close(); }
});

test('the run list shows the saved quantity and filters real failure states', async () => {
  const configuredRequest = clone(createdRunInfo('cfg').request);
  const result = harness({
    runs: [
      { runId: 'run-idle', product: 'Sản phẩm mới', status: 'IDLE', request: configuredRequest },
      { runId: 'run-failed', product: 'Sản phẩm lỗi', status: 'FAILED', request: configuredRequest },
      { runId: 'run-owner', product: 'Sản phẩm chờ', status: 'WAIT_OWNER', request: { format: 'request-v1', reviewCapPerLink: 300 } },
    ],
    runInfoByRun: {
      'run-idle': syntheticRunInfo('run-idle'), 'run-failed': syntheticRunInfo('run-failed'),
      'run-owner': syntheticRunInfo('run-owner'),
    },
  });
  try {
    await waitFor(() => result.doc.querySelectorAll('#runList .runbtn').length === 3, 'run list');
    assert.match(runListButton(result.doc, 'run-failed').textContent!, /Tối đa 500 mỗi link/);
    assert.match(runListButton(result.doc, 'run-owner').textContent!, /Tối đa 300 mỗi link/);
    assert.deepEqual(result.state.statusCalls, ['run-idle'],
      'only the initially selected run is read; list metadata comes from the saved request');
    const filter = element<HTMLSelectElement>(result.doc, 'runFilter');
    const labels = [...filter.options].map((option) => option.textContent);
    assert.ok(labels.includes('Bị lỗi'), 'the actual failure state is selectable');
    assert.ok(labels.includes('Cần bạn xử lý'), 'the needs-user state is selectable');

    filter.value = 'failed';
    fire(result.window, filter, 'change');
    await waitFor(() => result.doc.querySelectorAll('#runList .runbtn').length === 1, 'failed filter');
    assert.match(runListButton(result.doc, 'run-failed').title, /run-failed/);

    filter.value = 'needs_owner';
    fire(result.window, filter, 'change');
    await waitFor(() => result.doc.querySelectorAll('#runList .runbtn').length === 1, 'needs-owner filter');
    assert.match(runListButton(result.doc, 'run-owner').title, /run-owner/);

    filter.value = 'idle';
    fire(result.window, filter, 'change');
    await waitFor(() => result.doc.querySelectorAll('#runList .runbtn').length === 1, 'idle filter');
    assert.match(runListButton(result.doc, 'run-idle').title, /run-idle/);
    assert.deepEqual(result.state.statusCalls, ['run-idle'], 'filtering reads no run status');
  } finally { result.dom.window.close(); }
});

test('a legacy run with stored results is never labelled as never collected', async () => {
  const info: any = syntheticRunInfo();
  info.gates.m3 = passSlip('M3');
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Áo thun mẫu', status: 'DONE' }],
    runInfo: info,
    sampling: syntheticSampling({ attempts: [] }),
    reviewData: syntheticReviewData({
      sources: [syntheticReviewSource({ kind: 'legacy', attemptId: null, planSha256: null, rowCount: 531 })],
    }),
  });
  try {
    await waitFor(() => result.doc.getElementById('rsPanel') !== null, 'sampling panel');
    const panel = result.doc.getElementById('rsPanel')!.textContent!;
    assert.match(panel, /Đã có kết quả cũ/);
    assert.doesNotMatch(panel, /Chưa lấy bình luận/,
      'stored legacy results are not described as no collection at all');
    await waitFor(() => /531 bình luận/.test(result.doc.getElementById('rdPanel')?.textContent || ''),
      'the stored review count stays visible');
  } finally { result.dom.window.close(); }
});

test('connection and disabled create states explain themselves without the data path', async () => {
  const off = harness({
    connectionResult: { ok: true, data: { connected: false, readonly: false, runsRoot: '/synthetic/runs' } },
  });
  try {
    await waitFor(() => element<HTMLElement>(off.doc, 'connText').textContent === 'Chưa kết nối máy chủ.',
      'disconnected text');
    assert.doesNotMatch(element<HTMLElement>(off.doc, 'connText').textContent!, /synthetic\/runs/);
    assert.equal(element<HTMLButtonElement>(off.doc, 'btnNew').disabled, true);
    assert.equal(element<HTMLElement>(off.doc, 'newHint').hidden, false);
    assert.match(element<HTMLElement>(off.doc, 'newHint').textContent!, /Chưa kết nối máy chủ/);
  } finally { off.dom.window.close(); }

  const on = harness({
    connectionResult: { ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic/runs' } },
  });
  try {
    await booted(on.doc);
    assert.equal(element<HTMLElement>(on.doc, 'connText').textContent, 'Đã kết nối máy chủ');
    assert.doesNotMatch(element<HTMLElement>(on.doc, 'connText').textContent!, /synthetic/,
      'the visible connection line is plain language');
    assert.match(element<HTMLElement>(on.doc, 'connText').title, /\/synthetic\/runs/,
      'the data path stays in the tooltip only');
  } finally { on.dom.window.close(); }
});
