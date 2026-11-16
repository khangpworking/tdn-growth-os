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
  listRunsGate?: Deferred<any> | undefined;
  presets?: ReturnType<typeof preset>[];
  connectionResult?: any;
  connectionResults?: any[];
  connectionResultFor?: (call: number) => any | Promise<any>;
  fastReconnect?: boolean;
  captureSpecsResult?: (runId: string, call: number) => any | Promise<any> | undefined;
  moduleOutputsResult?: (runId: string, call: number) => any | Promise<any> | undefined;
  openModuleEvidenceResult?: (runId: string, kind: string, sha256: string) => any;
  reviewStatsResult?: (runId: string) => any;
  reviewInsightsResult?: (runId: string) => any;
  statusGate?: (runId: string) => Deferred<void> | undefined;
  reviewProcessResult?: (runId: string) => any;
  processReviewDataResult?: (runId: string, sourceSha256: string) => any;
  runsProgressResults?: any[];
  hasFocus?: boolean;
  fastProgress?: boolean;
  fastPoll?: boolean;
  bridge?: 'complete' | 'partial';
} = {}) {
  const state: {
    addCalls: number; presetsCalls: number; newRunCalls: number; listRunsCalls: number;
    refreshCountCalls: number; connectionCalls: number;
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
    exportReviewFilesCalls: any[];
    exportReviewResult: ((runId: string, input: any) => any) | undefined;
    saveCalls: any[];
    launchCalls: any[];
    controlCalls: any[];
    refreshCountResult: any;
    saveGate: Deferred<any> | undefined;
    captureSpecsCalls: string[];
    captureSpecsCallsByRun: Record<string, number>;
    captureSpecsResult: ((runId: string, call: number) => any | Promise<any> | undefined) | undefined;
    moduleOutputsCalls: string[];
    openEvidenceCalls: { runId: string; kind: string; sha256: string }[];
    openLinkCalls: string[];
    reviewProcessCalls: string[];
    processReviewDataCalls: { runId: string; sourceSha256: string }[];
    runsProgressCalls: number;
    notifyCalls: { title: string; body: string }[];
  } = {
    addCalls: 0, presetsCalls: 0, newRunCalls: 0, listRunsCalls: 0, refreshCountCalls: 0, connectionCalls: 0,
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
    exportReviewFilesCalls: [],
    exportReviewResult: options.exportReviewResult,
    saveCalls: [], launchCalls: [], controlCalls: [],
    refreshCountResult: options.refreshCountResult,
    saveGate: options.saveGate,
    captureSpecsCalls: [],
    captureSpecsCallsByRun: {},
    captureSpecsResult: options.captureSpecsResult,
    moduleOutputsCalls: [],
    openEvidenceCalls: [],
    openLinkCalls: [],
    reviewProcessCalls: [],
    processReviewDataCalls: [],
    runsProgressCalls: 0,
    notifyCalls: [],
  };
  const planSha = () => (state.sampling.plans.length + 1).toString(16).padStart(64, '0');
  const api = {
    connection: async () => {
      state.connectionCalls++;
      if (options.connectionResultFor) return clone(await options.connectionResultFor(state.connectionCalls));
      if (options.connectionResults) {
        const index = Math.min(state.connectionCalls - 1, options.connectionResults.length - 1);
        return clone(options.connectionResults[index]);
      }
      return options.connectionResult || ({ ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic' } });
    },
    presets: async () => {
      state.presetsCalls++;
      return { ok: true, data: { format: 'presets-v1', presets: state.presets.slice() } };
    },
    listRuns: async () => {
      state.listRunsCalls++;
      if (options.listRunsGate && state.flowCalls.length > 0) await options.listRunsGate.promise;
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
      const gate = options.statusGate && options.statusGate(runId);
      if (gate) await gate.promise;
      const info = (options.runInfoByRun && options.runInfoByRun[runId]) || options.runInfo;
      if (info) return { ok: true, data: clone(info) };
      return { ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } };
    },
    moduleOutputs: async (runId: string) => {
      state.moduleOutputsCalls.push(runId);
      const call = state.moduleOutputsCalls.filter((entry) => entry === runId).length;
      const reply = options.moduleOutputsResult ? await options.moduleOutputsResult(runId, call) : undefined;
      if (reply) return reply;
      return { ok: false, error: { code: 'MODULE_OUTPUT_INVALID', message: 'MODULE_OUTPUT_INVALID' } };
    },
    openModuleEvidence: async (runId: string, kind: string, sha256: string) => {
      state.openEvidenceCalls.push({ runId, kind, sha256 });
      if (options.openModuleEvidenceResult) return options.openModuleEvidenceResult(runId, kind, sha256);
      return { ok: true, data: { format: 'module-evidence-open-v1', runId, kind, sha256, opened: true } };
    },
    openShopeeLink: async (url: string) => {
      state.openLinkCalls.push(url);
      return { ok: true, data: { opened: true } };
    },
    reviewProcess: async (runId: string) => {
      state.reviewProcessCalls.push(runId);
      if (options.reviewProcessResult) return clone(options.reviewProcessResult(runId));
      return { ok: true, data: { format: 'review-process-view-v1', runId, autoRun: true, labelUnresolved: false, sources: [] } };
    },
    processReviewData: async (runId: string, sourceSha256: string) => {
      state.processReviewDataCalls.push({ runId, sourceSha256 });
      if (options.processReviewDataResult) return options.processReviewDataResult(runId, sourceSha256);
      return { ok: true, data: { format: 'review-process-start-v1', runId, sourceSha256, status: 'RUNNING', pid: 4321 } };
    },
    runsProgress: async () => {
      state.runsProgressCalls++;
      const replies = options.runsProgressResults;
      if (!replies) return { ok: true, data: { format: 'runs-progress-v1', generatedAt: '2026-11-16T09:00:00Z', runs: [] } };
      return clone(replies[Math.min(state.runsProgressCalls - 1, replies.length - 1)]);
    },
    notify: async (title: string, body: string) => {
      state.notifyCalls.push({ title, body });
      return { ok: true, data: { shown: false } };
    },
    reviewStats: async (runId: string) => options.reviewStatsResult
      ? options.reviewStatsResult(runId)
      : { ok: true, data: { format: 'review-stats-v1', runId, sources: [] } },
    reviewInsights: async (runId: string) => options.reviewInsightsResult
      ? options.reviewInsightsResult(runId)
      : { ok: true, data: { format: 'review-insights-v1', runId, codebookVersion: 'synthetic', sources: [] } },
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
    captureSpecs: async (runId: string) => {
      state.captureSpecsCalls.push(runId);
      state.captureSpecsCallsByRun[runId] = (state.captureSpecsCallsByRun[runId] || 0) + 1;
      const reply = state.captureSpecsResult
        ? await state.captureSpecsResult(runId, state.captureSpecsCallsByRun[runId])
        : undefined;
      if (reply) return reply;
      return { ok: false, error: { code: 'FLOW_INPUT_INVALID', message: 'FLOW_INPUT_INVALID' } };
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
    exportReviewFiles: async (runId: string, input: any) => {
      state.exportReviewFilesCalls.push({ runId, input: clone(input) });
      if (state.exportReviewResult) return state.exportReviewResult(runId, clone(input));
      return { ok: true, data: { cancelled: false, files: input.formats.map((format: string) => ({
        format, saved: true, fileName: 'shopee-' + runId + '.' + format, errorCode: null,
      })) } };
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
      (window as any).pywebview = { api: options.bridge === 'partial' ? {} : api };
      if (options.fastPoll) {
        const nativeSetInterval = window.setInterval.bind(window);
        (window as any).setInterval = (handler: any, delay?: number, ...args: any[]) =>
          nativeSetInterval(handler, delay === 10000 || delay === 3000 ? 25 : delay, ...args);
      }
      if (options.hasFocus !== undefined) {
        const focused = options.hasFocus;
        window.document.hasFocus = () => focused;
      }
      if (options.fastProgress) {
        const nativeSetTimeout = window.setTimeout.bind(window);
        (window as any).setTimeout = (handler: any, delay?: number, ...args: any[]) =>
          nativeSetTimeout(handler, delay === 15000 ? 20 : delay, ...args);
      }
      if (options.fastReconnect) {
        const nativeSetTimeout = window.setTimeout.bind(window);
        (window as any).setTimeout = (handler: any, delay?: number, ...args: any[]) =>
          nativeSetTimeout(handler, delay && delay >= 250 ? 5 : delay, ...args);
      }
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
  return { dom, doc: dom.window.document, window: dom.window, state, api };
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
    gates: { entry: entryPassSlip(), m1: null, m2: null, m3: null },
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
      presetId: 'kem',
      startDate: element<HTMLInputElement>(doc, 'startDate').value,
      endDate: element<HTMLInputElement>(doc, 'endDate').value,
      metricOptions: {
        smartQuery: true,
        usefulFilters: { fake: true, gifts: true, deleted: true },
        shopTypes: ['mall', 'regular'],
        categoryIds: ['c407923064', 'c1221630203', 'c1110582659', 'c2140822537'],
        aiNormalisation: false, customizeCategory: false, smartExclusion: false,
      },
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

test('a created run with unverified entry stays bound and locked when status cannot authorize it', async () => {
  const staticEntryError = { code: 'ENTRY_UNAVAILABLE', message: 'ENTRY_UNAVAILABLE' };
  const entryCases = [
    { label: 'partial entry', data: { entry: null, entryError: staticEntryError } },
    { label: 'bridge entry PASS', data: { entry: entryPassSlip() } },
  ];
  const statusCases = [
    { label: 'status failure', info: null },
    { label: 'missing entry', info: (runId: string) => ({ format: 'run-info-v1', runId }) },
  ];
  let caseIndex = 0;
  for (const entryCase of entryCases) {
    for (const statusCase of statusCases) {
      const runId = 'run-unverified-' + (++caseIndex);
      const info = statusCase.info ? statusCase.info(runId) : null;
      const label = entryCase.label + ' + ' + statusCase.label;
      const { dom, doc, state } = harness({
        newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId, ...entryCase.data } }),
        ...(info ? { runInfoByRun: { [runId]: info } } : {}),
      });
      try {
        await booted(doc);
        create(doc);
        await waitFor(() => state.newRunCalls === 1, label + ': create sent');
        await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false,
          label + ': created identity remains bound');
        assert.match(element<HTMLElement>(doc, 'newRunLine').textContent!, new RegExp(runId),
          label + ': exact created run identity');
        assertDraftFrozen(doc);
        assert.match(element<HTMLElement>(doc, 'newErr').textContent!,
          /Đã tạo lượt nhưng chưa đọc được kết quả kiểm tra đầu vào/,
          label + ': truthful created-but-unverified notice');
        assert.equal(element<HTMLButtonElement>(doc, 'btnFlow').disabled, true,
          label + ': bridge entry is not execution authorization');
        element<HTMLFormElement>(doc, 'newRunForm').dispatchEvent(
          new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(state.newRunCalls, 1, label + ': retry gesture never creates a second run');
      } finally { dom.window.close(); }
    }
  }
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
    assert.match(facts, /Từ \d{2}\/\d{2}\/\d{4} đến \d{2}\/\d{2}\/\d{4} \(tính cả hai đầu\)/,
      'the exact selected interval is shown');
    assert.doesNotMatch(facts, /30 ngày|12 tháng/, 'the confirmation never claims two derived windows');
    assert.match(facts, /Đánh giá 2 và 3 sao/, 'the exact star policy is shown');
    assert.match(facts, /500/, 'the exact shared total is shown');
    assert.match(facts, /Khoảng thời gian/, 'the interval uses the approved plain label');
    assert.doesNotMatch(facts, /Kỳ dữ liệu|Phạm vi/, 'retired summary labels stay out of the confirmation');
    const consequence = dialog.querySelector('#flowDialogNote')!.textContent || '';
    assert.match(consequence, /lượt tra số liệu bán hàng/,
      'starting a run names the sales-data lookup it uses');
    assert.match(consequence, /bắt đầu lấy bình luận rồi tự lưu và phân loại bình luận/,
      'the consequence says collection starts and step 4 follows');
    assert.match(dialog.querySelector('.lead')!.textContent || '', /lần lượt 4 bước/, 'the flow has four steps');
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

test('a flow success whose run list reloads late never steals the run selected meanwhile', async () => {
  const listGate = deferred<any>();
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-older', product: 'Lượt cũ', status: 'DONE', request: { format: 'request-v1', reviewCapPerLink: 300 } }],
    runInfoByRun: {
      'run-older': syntheticRunInfo('run-older'), 'run-flow': createdRunInfo('run-flow'),
    },
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-flow' } }),
    runFlowResult: { ok: true, data: { format: 'flow-start-v1', runId: 'run-flow' } },
    listRunsGate: listGate,
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnFlow').disabled === false, 'binding');
    await openFlowConfirmation(doc);
    element<HTMLButtonElement>(doc, 'flowConfirmBtn').click();
    await waitFor(() => state.flowCalls.length === 1, 'flow dispatched');
    await waitFor(() => element<HTMLElement>(doc, 'scr-track').hidden === false,
      'the successful flow opens tracking');

    runListButton(doc, 'run-older').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-older'),
      'the user selects another run while the list reload is pending');
    const flowReads = state.statusCalls.filter((runId) => runId === 'run-flow').length;

    listGate.resolve(undefined);
    await new Promise((resolve) => setTimeout(resolve, 50));

    assert.equal((doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-older'), true,
      'the late list reply never reselects the launched run over the user choice');
    assert.equal(element<HTMLElement>(doc, 'scr-track').hidden, false, 'the user stays on tracking');
    assert.equal(state.statusCalls.filter((runId) => runId === 'run-flow').length, flowReads,
      'the late handler neither reads nor selects the launched run');
    assert.deepEqual(state.flowCalls, ['run-flow'], 'the already-dispatched flow is not retried');
    assert.deepEqual(state.controlCalls, [], 'the running flow is not stopped or reconciled');
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
  | { format: 'request-v1'; reviewCapPerLink: number; selectionPolicy?: string }
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
    gates: { entry: entryPassSlip(), m1: passSlip('M1'), m2: passSlip('M2'), m3: null },
    selection: {
      format: 'selection-v1', runId,
      links: [{ rank: 1, brand: 'Nhãn tổng hợp', revenue: 123456, reason: 'Dòng tổng hợp' }],
    },
  };
}

/** A run whose step 3 already ran (M3 gate written), so its result card shows. */
function collectedRunInfo(runId = 'run-synthetic') {
  const info: any = syntheticRunInfo(runId);
  info.gates.m3 = passSlip('M3');
  return info;
}

/** A run whose M1 action is enabled, used by selection and singleflight regressions. */
function runnableModuleInfo(runId: string) {
  const info: any = syntheticRunInfo(runId);
  info.modules = info.modules.map((module: any) =>
    module.id === 'M1' ? { ...module, canRun: true, blockedBy: null } : { ...module, canRun: false });
  info.gates = { entry: entryPassSlip(), m1: null, m2: null, m3: null };
  info.selection = null;
  return info;
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

function syntheticReviewStats(runId: string, count: number) {
  if (!count) return { format: 'review-stats-v1', runId, sources: [] };
  const numbers = {
    commentCount: count, averageStar: 5,
    starCounts: { 1: 0, 2: 0, 3: 0, 4: 0, 5: count },
    firstCommentAt: '2026-11-01T09:00:00+07:00', lastCommentAt: '2026-11-05T09:00:00+07:00',
  };
  return { format: 'review-stats-v1', runId, sources: [{
    sourceSha256: 'c'.repeat(64), kind: 'legacy', status: 'SUCCEEDED',
    completedAt: '2026-11-11T08:00:00Z', all: numbers,
    links: [{ shopId: '801', itemId: '100', url: 'https://shopee.vn/product/801/100', ...numbers }],
  }] };
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

const CAPTURE_SPEC_SUFFIXES = [
  'present', 'schema', 'confirmed_input', 'keywords', 'platforms', 'category', 'filters', 'shops',
  'smart_query', 'ai', 'custom_category', 'smart_exclusion', 'advanced_filter', 'exclusions', 'window',
];
const CAPTURE_CHECK_IDS = CAPTURE_SPEC_SUFFIXES.map((suffix) => 'capture_spec_' + suffix);

/** Producer-shaped capture-spec-v3 preset: option flags live directly on the preset. */
function canonicalCaptureSpec() {
  return {
    contractVersion: 'metric-v3-capture-spec-v3',
    preset: {
      keywords: ['kem chống nắng'],
      platforms: ['shopee', 'lazada', 'tiki', 'tiktok'],
      category: {
        id: 'c2035652732', label: 'Sức Khoẻ',
        children: [
          { id: 'c2140822537', label: 'Thực phẩm chức năng' },
          { id: 'c407923064', label: 'Chăm sóc sức khỏe' },
        ],
      },
      advancedFilter: {
        firstField: 'rating_count', operator: '>', firstRate: 1,
        secondField: 'order_count', secondRate: 0.02,
      },
      exclusions: ['quà tặng kèm'],
      smartQuery: true,
      usefulFilters: { fake: false, gifts: true, deleted: true },
      shopTypes: ['mall'],
      aiNormalisation: false,
      customizeCategory: false,
      smartExclusion: true,
    },
    windows: [{
      id: 'selected',
      period: { startDate: '2026-10-12', endDate: '2026-10-28' },
      intervalDays: 7,
    }],
  };
}

function captureChecks(overrides: Record<string, boolean> = {}) {
  return [
    ...CAPTURE_SPEC_SUFFIXES.map((suffix) => ({
      id: 'capture_spec_' + suffix,
      ok: overrides[suffix] !== false,
      got: overrides[suffix] !== false,
      errorCode: overrides[suffix] === false ? 'CAPTURE_' + suffix.toUpperCase() + '_MISMATCH' : null,
    })),
    { id: 'capture_spec_request_identity', ok: true, got: true, errorCode: null },
  ];
}

/** Entry handoff whose capture checks satisfy the full r3 confirmation set. */
function entryPassSlip() {
  return {
    ...passSlip('ENTRY'),
    checks: [
      { id: 'product_text', ok: true, got: true },
      { id: 'period_dates', ok: true, got: true },
      { id: 'readonly_off', ok: true, got: true },
      { id: 'collection_policy', ok: true, got: true },
      ...captureChecks(),
    ],
  };
}

/** Real CLI review envelope shape, retained JSON member included as text. */
function captureEnvelope(runId: string, spec: any, overrides: any = {}) {
  const specJson = JSON.stringify(spec, null, 2);
  return {
    ok: true,
    data: {
      format: 'capture-specs-view-v1', runId,
      requestSha256: '1'.repeat(64), specSha256: '2'.repeat(64),
      specDigestBasis: 'request-member-utf8',
      captureSpec: clone(spec), captureSpecJson: specJson,
      inputsMatch: true, checks: captureChecks(), errorCode: null,
      ...overrides,
    },
  };
}

/** Reads one labeled row from the capture-spec reader, not from any form state. */
function captureRow(doc: Document, label: string): string {
  const body = element(doc, 'captureSpecBody');
  const row = [...body.querySelectorAll('dl > div')]
    .find((entry) => entry.querySelector('dt')?.textContent === label);
  assert.ok(row, 'capture-spec row ' + label);
  return row.querySelector('dd')!.textContent || '';
}

function captureReader(doc: Document, scope: ParentNode = doc): HTMLDetailsElement {
  const details = [...scope.querySelectorAll<HTMLDetailsElement>('details')]
    .find((entry) => entry.querySelector('summary')?.textContent === 'Xem thông tin đã ghi trong capture specs');
  assert.ok(details, 'capture-spec reader offered by the page');
  return details;
}

/** JSDOM queues the native toggle event when `open` flips; dispatch again would double-load. */
function openReader(details: HTMLDetailsElement): void {
  details.open = true;
}

/** An entry slip with the producer's r3 capture checks plus ordinary entry checks. */
function entrySlipWith(checks: any[], overrides: any = {}, collectionPolicy: any = { ok: true, got: true }) {
  return {
    format: 'handoff-v1', module: 'ENTRY', verdict: 'PASS',
    checks: [
      { id: 'product_text', ok: true, got: true },
      { id: 'period_dates', ok: true, got: true },
      { id: 'readonly_off', ok: true, got: true },
      { id: 'collection_policy', ...collectionPolicy },
      ...checks,
    ],
    errorCode: null,
    inputSha256: 'synthetic-in', outputSha256: 'synthetic-out', next: null,
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

function moduleAction(doc: Document, moduleId: string): HTMLButtonElement | undefined {
  const prefix = 'Bước ' + moduleId.slice(1);
  const card = [...doc.querySelectorAll('#techDetails article.mod')]
    .find((entry) => entry.querySelector('h3')?.textContent?.startsWith(prefix));
  return (card?.querySelector('button.abtn') as HTMLButtonElement | null) || undefined;
}

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

test('selecting a run clears the old detail instead of leaving its actions while status is pending', async () => {
  const gateB = deferred<void>();
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-a', product: 'Sản phẩm A', status: 'IDLE' },
      { runId: 'run-b', product: 'Sản phẩm B', status: 'IDLE' }],
    runInfoByRun: { 'run-a': runnableModuleInfo('run-a'), 'run-b': runnableModuleInfo('run-b') },
    statusGate: (runId) => runId === 'run-b' ? gateB : undefined,
  });
  try {
    await waitFor(() => /Sản phẩm A/.test(element<HTMLElement>(doc, 'runDetail').textContent || ''), 'run A detail');
    runListButton(doc, 'run-b').click();
    await waitFor(() => state.statusCalls.filter((runId) => runId === 'run-b').length === 1, 'B status pending');
    const detail = element<HTMLElement>(doc, 'runDetail');
    assert.match(detail.textContent || '', /Đang tải/, 'the pending selection is shown immediately');
    assert.doesNotMatch(detail.textContent || '', /Sản phẩm A/, 'run A detail is cleared before B answers');
    assert.equal(doc.getElementById('rdPanel'), null, 'run A stored results are not left visible');
    gateB.resolve();
    await waitFor(() => /Sản phẩm B/.test(detail.textContent || ''), 'B detail');
  } finally { gateB.resolve(); dom.window.close(); }
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

test('the history panel shows stored collection results read-only and never saves or downloads', async () => {
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
  const info: any = collectedRunInfo();
  info.gates.m2 = null;
  info.selection = null;
  info.modules = info.modules.map((mod: any) => mod.id === 'M3' ? { ...mod, canRun: false } : mod);
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: info,
    reviewData: syntheticReviewData({ sources: [older, latest] }),
  });
  try {
    await waitFor(() => result.doc.getElementById('rdPanel') !== null, 'review panel loaded without M2');
    const panel = result.doc.getElementById('rdPanel')!;
    assert.equal(panel.getAttribute('aria-label'), 'Kết quả bình luận',
      'the history region has a plain accessible name');
    assert.equal(panel.querySelector('h3')!.textContent, 'Bước 3 Lấy bình luận');
    assert.match(element<HTMLElement>(result.doc, 'rdSummary').textContent!, /12 bình luận/,
      'the latest completed source is shown without a selector');
    assert.match(panel.textContent!, /Đã tạo file JSON trước đó: shopee-cached\.json/);
    for (const id of ['rdSource', 'rdDownload', 'rdSave', 'rdHint', 'rdDownloadNote', 'reviewDataErr']) {
      assert.equal(result.doc.getElementById(id), null, id + ' is not rendered in the history tab');
    }
    assert.equal(result.state.saveReviewDataCalls.length + result.state.exportReviewFilesCalls.length, 0,
      'opening the panel never saves or downloads');

    const calls = result.state.reviewDataCallsByRun['run-synthetic'] ?? 0;
    result.doc.querySelector<HTMLButtonElement>('.runbtn')!.click();
    await waitFor(() => (result.state.reviewDataCallsByRun['run-synthetic'] ?? 0) > calls, 'refresh after reselect');
    assert.equal(result.doc.querySelectorAll('#rdPanel').length, 1, 'one read-only panel per selected run');
    assert.equal(result.state.saveReviewDataCalls.length + result.state.exportReviewFilesCalls.length, 0,
      'reselection still never saves or downloads');
  } finally { result.dom.window.close(); }
});

test('the initial summary follows the loaded product and names the frozen period plainly', async () => {
  const { dom, doc, window } = harness({
    presets: [preset('kem', 'Kem chống nắng'), preset('son', 'Son môi')],
  });
  try {
    await booted(doc);
    assert.equal(summaryValue(doc, 'Sản phẩm'), 'Kem chống nắng');
    assert.match(summaryValue(doc, 'Khoảng thời gian'),
      /^Từ \d{2}\/\d{2}\/\d{4} đến \d{2}\/\d{2}\/\d{4} \(tính cả hai đầu\)$/,
      'one selected window is named plainly instead of two legacy periods');
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

test('an unavailable Metric latest date keeps the draft and only an explicit suggestion changes the next request', async () => {
  const requestedStart = localDay(-30);
  const requestedEnd = localDay(-1);
  const lastSelectable = localDay(-3);
  const suggestedStart = localDay(-32);
  let creates = 0;
  const { dom, doc, state } = harness({
    newRunResult: () => {
      creates += 1;
      if (creates === 1) {
        return { ok: false, error: {
          code: 'CAPTURE_PERIOD_NOT_SELECTABLE', message: 'CAPTURE_PERIOD_NOT_SELECTABLE',
          detail: { format: 'metric-date-availability-v1', requestedEndDate: requestedEnd,
            lastSelectableDate: lastSelectable, available: false,
            errorCode: 'CAPTURE_PERIOD_NOT_SELECTABLE' },
        } };
      }
      return { ok: true, data: { format: 'new-run-v1', runId: 'run-corrected' } };
    },
    runInfoByRun: { 'run-corrected': createdRunInfo('run-corrected') },
  });
  try {
    await booted(doc);
    const start = element<HTMLInputElement>(doc, 'startDate');
    const end = element<HTMLInputElement>(doc, 'endDate');
    start.value = requestedStart;
    end.value = requestedEnd;
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'unavailable create reaches the bridge once');

    assert.equal(state.newRunInputs[0]!.presetId, 'kem');
    assert.equal(state.newRunInputs[0]!.startDate, requestedStart, 'the rejected create sends the requested start date');
    assert.equal(state.newRunInputs[0]!.endDate, requestedEnd, 'the rejected create sends the requested end date');
    assert.equal(start.value, requestedStart, 'the requested start date is not shifted');
    assert.equal(end.value, requestedEnd, 'the requested end date is not shifted');
    assertDraftEditable(doc);
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!,
      /Ngày kết thúc vượt quá ngày Metric còn cho chọn/);
    const suggestion = element<HTMLElement>(doc, 'newDateSuggestion');
    assert.equal(suggestion.hidden, false, 'the actual Metric maximum and suggestion are shown');
    const lastText = lastSelectable.split('-').reverse().join('/');
    const suggestedStartText = suggestedStart.split('-').reverse().join('/');
    assert.match(element<HTMLElement>(doc, 'newDateSuggestionText').textContent!,
      new RegExp('Ngày còn chọn được: ' + lastText + '\\. Gợi ý kỳ 30 ngày: từ ' +
        suggestedStartText + ' đến ' + lastText));

    element<HTMLButtonElement>(doc, 'btnApplyDateSuggestion').click();
    assert.equal(start.value, suggestedStart, 'only the explicit suggestion fills the start date');
    assert.equal(end.value, lastSelectable, 'only the explicit suggestion fills the end date');
    assert.equal(state.newRunCalls, 1, 'applying the suggestion does not create a run');
    assert.equal(element<HTMLElement>(doc, 'newErr').hidden, true);
    assert.equal(suggestion.hidden, true);
    assert.match(element<HTMLElement>(doc, 'newNotice').textContent!, /Đã điền gợi ý ngày/);

    create(doc);
    await waitFor(() => state.newRunCalls === 2, 'the corrected explicit create is sent');
    assert.equal(state.newRunInputs[1]!.startDate, suggestedStart);
    assert.equal(state.newRunInputs[1]!.endDate, lastSelectable);
    assert.equal(state.newRunInputs[1]!.metricOptions.smartQuery, true);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'corrected run is bound');
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

test('results stay above one closed step section and a failed run opens it', async () => {
  const done = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: collectedRunInfo(), sampling: syntheticSampling(), reviewData: syntheticReviewData(),
  });
  try {
    await waitFor(() => done.doc.getElementById('rdPanel') !== null &&
      done.doc.getElementById('techDetails') !== null, 'detail panels');
    const review = done.doc.getElementById('rdPanel')!;
    const tech = done.doc.getElementById('techDetails') as HTMLDetailsElement;
    assert.ok(review.compareDocumentPosition(tech) & 4, 'results come before the step section');
    assert.equal(tech.open, false, 'a completed run keeps the step section closed');
    assert.equal(tech.firstElementChild!.textContent, 'Log kĩ thuật lịch sử chạy');
    const raw = [...tech.querySelectorAll('summary')].filter((node) => node.textContent === 'Thông tin kỹ thuật');
    assert.ok(raw.length > 0, 'raw diagnostics stay in their own closed details');
    assert.equal((raw[0]!.parentElement as HTMLDetailsElement).open, false,
      'raw diagnostics stay closed on a completed run');
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
    await waitFor(() => /Đang thu 7 bình luận ở 1\/2 link/
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
    await waitFor(() => /Đang thu 9 bình luận ở 1\/2 link/
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

test('a legacy run with stored results keeps its stored count visible', async () => {
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
    await waitFor(() => /531 bình luận/.test(result.doc.getElementById('rdPanel')?.textContent || ''),
      'the stored review count stays visible');
    assert.doesNotMatch(result.doc.getElementById('rdPanel')!.textContent!, /Chưa có kết quả bình luận/,
      'stored legacy results are not described as no collection at all');
  } finally { result.dom.window.close(); }
});

test('the saved capture reader reads the producer v3 preset flags, categories and execution settings', async () => {
  const runId = 'run-spec-v3';
  const { dom, doc, window, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId } }),
    runInfoByRun: { [runId]: createdRunInfo(runId) },
    captureSpecsResult: (asked) => asked === runId ? captureEnvelope(runId, canonicalCaptureSpec()) : undefined,
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'bound create result');
    openReader(element<HTMLDetailsElement>(doc, 'captureSpecReview'));
    await waitFor(() => state.captureSpecsCalls.length === 1, 'saved capture read');
    await waitFor(() => element(doc, 'captureSpecBody').textContent!.includes('Từ khóa gửi Metric'),
      'saved capture rendered');

    assert.equal(captureRow(doc, 'Từ khóa gửi Metric'), 'kem chống nắng');
    assert.equal(captureRow(doc, 'Sàn'), 'Shopee · Lazada · Tiki · TikTok');
    assert.equal(captureRow(doc, 'Khoảng ngày đã chọn'),
      '12/10/2026 - 28/10/2026 · bước biểu đồ 7 ngày',
      'the selected window is read from the saved spec, not the creation form');
    assert.equal(captureRow(doc, 'Danh mục'), 'Sức Khoẻ',
      'the readable parent category label comes from preset.category');
    assert.equal(captureRow(doc, 'Nhóm ngành đã chọn'),
      'Thực phẩm chức năng · Chăm sóc sức khỏe',
      'the saved child labels come from preset.category.children, not form categoryIds');
    assert.equal(captureRow(doc, 'Loại shop đã chọn'), 'Shop Chính hãng (Mall)',
      'shop types come from preset.shopTypes');
    assert.equal(captureRow(doc, 'Tìm kiếm thông minh'), 'Bật');
    assert.equal(captureRow(doc, 'Lọc sản phẩm ảo/bất thường'), 'Tắt',
      'a disabled saved usefulFilter is not shown as enabled or as missing');
    assert.equal(captureRow(doc, 'Lọc sản phẩm quà tặng'), 'Bật');
    assert.equal(captureRow(doc, 'Lọc bỏ sản phẩm đã bị xóa'), 'Bật');
    assert.equal(captureRow(doc, 'AI chuẩn hóa dữ liệu'), 'Tắt');
    assert.equal(captureRow(doc, 'Tùy chỉnh danh mục'), 'Tắt');
    assert.equal(captureRow(doc, 'Loại trừ thông minh'), 'Bật');
    assert.equal(captureRow(doc, 'Từ khóa loại trừ'), 'quà tặng kèm');
    assert.equal(captureRow(doc, 'Thiết lập lọc nâng cao'),
      '1 × Tổng đánh giá > 0,02 × Tổng đã bán',
      'the saved advanced filter keeps the Metric weighted comparison, not two separate minimum counts');

    const bodyNode = element(doc, 'captureSpecBody');
    const body = bodyNode.textContent!;
    assert.match(body, /khớp yêu cầu đã xác nhận/);
    const metaLine = bodyNode.querySelector('p.muted')!.textContent!;
    assert.doesNotMatch(metaLine, /requestSha256|specSha256|111111111111/,
      'hex digests are not primary table metadata');
    const rawDetails = bodyNode.querySelector('details')!;
    assert.match(rawDetails.textContent!, /requestSha256 1111111111111111111111111111111111111111111111111111111111111111/);
    assert.match(rawDetails.textContent!, /specSha256 2222222222222222222222222222222222222222222222222222222222222222/);
    assert.match(rawDetails.textContent!, /c2035652732/,
      'the readable category labels keep their internal IDs in the raw JSON');
    assert.match(rawDetails.textContent!, /c2140822537/,
      'selected child category IDs are retained even when the table shows labels only');
    assert.deepEqual(state.flowCalls, [], 'viewing saved specs never starts collection');
    assert.deepEqual(state.launchCalls, [], 'viewing saved specs never runs a module');
  } finally { dom.window.close(); }
});

test('the saved capture reader keeps both legacy windows readable without inventing a selected one', async () => {
  const runId = 'run-spec-legacy';
  const legacy = {
    contractVersion: 'metric-v3-capture-spec-v2',
    preset: {
      keywords: ['son môi'], platforms: ['shopee', 'lazada', 'tiki', 'tiktok'],
      category: { id: 'c2035652732', label: 'Sức Khoẻ', children: [{ id: 'c1110582659', label: 'Sức khỏe khác' }] },
      advancedFilter: { firstField: 'rating_count', operator: '>', firstRate: 1 },
      exclusions: [], smartQuery: false,
      usefulFilters: { fake: true, gifts: false, deleted: false },
      shopTypes: ['regular'], aiNormalisation: true, customizeCategory: false, smartExclusion: false,
    },
    windows: [
      { id: '30d', period: { startDate: '2026-10-12', endDate: '2026-11-10' }, intervalDays: 7 },
      { id: '12m', period: { startDate: '2025-11-11', endDate: '2026-11-10' }, intervalDays: 30 },
    ],
  };
  const { dom, doc, window, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId } }),
    runInfoByRun: { [runId]: createdRunInfo(runId) },
    captureSpecsResult: () => captureEnvelope(runId, legacy),
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'bound create result');
    const details = element<HTMLDetailsElement>(doc, 'captureSpecReview');
    openReader(details);
    await waitFor(() => state.captureSpecsCalls.length === 1, 'legacy saved capture read');
    await waitFor(() => element(doc, 'captureSpecBody').textContent!.includes('Từ khóa gửi Metric'),
      'legacy saved capture rendered');

    assert.equal(captureRow(doc, 'Khoảng ngày 1 (30d)'),
      '12/10/2026 - 10/11/2026 · bước biểu đồ 7 ngày');
    assert.equal(captureRow(doc, 'Khoảng ngày 2 (12m)'),
      '11/11/2025 - 10/11/2026 · bước biểu đồ 30 ngày',
      'both legacy windows stay readable in order');
    const labels = [...element(doc, 'captureSpecBody').querySelectorAll('dl dt')]
      .map((node) => node.textContent);
    assert.equal(labels.includes('Khoảng ngày đã chọn'), false,
      'a two-window legacy spec never invents a single selected window');
    const raw = element(doc, 'captureSpecBody').textContent!;
    assert.match(raw, /"12m"/, 'the second legacy window remains readable in the retained JSON');
    assert.match(raw, /2025-11-11/);
  } finally { dom.window.close(); }
});

test('a history run opens its own saved capture view and stale or wrong-run replies never land', async () => {
  const runA = 'run-history-a';
  const runB = 'run-history-b';
  const runC = 'run-history-c';
  const gateA1 = deferred<any>();
  const gateB1 = deferred<any>();
  const specA: any = canonicalCaptureSpec();
  specA.preset.keywords = ['kênh A'];
  const specB: any = canonicalCaptureSpec();
  specB.preset.keywords = ['kênh B'];
  const queues: Record<string, Deferred<any>[]> = { [runA]: [gateA1], [runB]: [gateB1], [runC]: [] };
  const result = harness({
    runs: [
      { runId: runA, product: 'Sản phẩm A', status: 'DONE' },
      { runId: runB, product: 'Sản phẩm B', status: 'DONE' },
      { runId: runC, product: 'Sản phẩm C', status: 'DONE' },
    ],
    runInfoByRun: {
      [runA]: syntheticRunInfo(runA), [runB]: syntheticRunInfo(runB), [runC]: syntheticRunInfo(runC),
    },
    captureSpecsResult: (runId, call) => {
      if (runId === runA && call === 2) {
        return captureEnvelope(runB, specB);
      }
      if (runId === runC) {
        return { ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } };
      }
      const queued = queues[runId] && queues[runId][call - 1];
      return queued ? queued.promise : undefined;
    },
  });
  const { doc } = result;
  const entryWrap = () => {
    const card = doc.querySelector('#runDetail .entry-summary');
    assert.ok(card, 'the selected run shows its entry gate');
    return card!.parentElement!;
  };
  // Loading a run re-renders the detail twice (status, then review data); open the reader after
  // both renders so the toggle targets the node the user actually sees.
  const selectRun = async (runId: string, expectedLoads: number) => {
    runListButton(doc, runId).click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes(runId),
      runId + ' selected');
    await waitFor(() => (result.state.reviewDataCallsByRun[runId] || 0) >= expectedLoads &&
      (result.state.reviewSamplingCallsByRun[runId] || 0) >= expectedLoads, runId + ' detail loads settle');
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  try {
    await waitFor(() => doc.querySelector('#runList button') !== null, 'history list');
    await selectRun(runA, 1);
    const readerA = captureReader(doc, entryWrap());
    openReader(readerA);
    await waitFor(() => result.state.captureSpecsCallsByRun[runA] === 1, 'run A saved capture requested');

    await selectRun(runB, 1);
    const readerB = captureReader(doc, entryWrap());
    openReader(readerB);
    await waitFor(() => result.state.captureSpecsCallsByRun[runB] === 1, 'run B saved capture requested');
    gateB1.resolve(captureEnvelope(runB, specB));
    await waitFor(() => readerB.textContent!.includes('kênh B'), 'run B capture rendered');

    gateA1.resolve(captureEnvelope(runA, specA));
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(readerB.textContent!, /kênh B/, 'the late run A reply never replaces run B');
    assert.doesNotMatch(readerB.textContent!, /kênh A/);

    await selectRun(runA, 2);
    const readerA2 = captureReader(doc, entryWrap());
    openReader(readerA2);
    await waitFor(() => result.state.captureSpecsCallsByRun[runA] === 2, 'run A reader reloads');
    await waitFor(() => /không có đúng mã lượt/.test(readerA2.textContent!), 'a wrong-run reply is refused');
    assert.doesNotMatch(readerA2.textContent!, /Từ khóa gửi Metric/);

    await selectRun(runC, 1);
    const readerC = captureReader(doc, entryWrap());
    openReader(readerC);
    await waitFor(() => /Không tìm thấy lượt này trên máy chủ/.test(readerC.textContent!),
      'a missing run is an explicit read error');

    assert.deepEqual(result.state.flowCalls, [], 'reading saved specs never starts the flow');
    assert.deepEqual(result.state.launchCalls, [], 'reading saved specs never runs a module');
    assert.deepEqual(result.state.controlCalls, [], 'reading saved specs never mutates the run');
  } finally { result.dom.window.close(); }
});

test('entry confirmation needs the full capture check set and keeps an M3 policy failure separate', async () => {
  const runId = 'run-entry-spec';
  async function boundEntry(entry: any) {
    const info: any = createdRunInfo(runId);
    info.gates.entry = entry;
    const result = harness({
      newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId } }),
      runInfoByRun: { [runId]: info },
    });
    await booted(result.doc);
    create(result.doc);
    await waitFor(() => element<HTMLElement>(result.doc, 'newResult').hidden === false, 'entry binding');
    await waitFor(() => documentEntry(result.doc).textContent!.length > 0, 'entry card');
    return result;
  }
  function documentEntry(doc: Document): HTMLElement {
    const card = doc.querySelector<HTMLElement>('#entrySlip .entry-summary');
    assert.ok(card, 'the bound run shows its entry card');
    return card!;
  }
  const fullChecks = CAPTURE_CHECK_IDS.map((id) => ({ id, ok: true, got: true, errorCode: null }));

  const policyFail = await boundEntry(entrySlipWith(
    fullChecks, { verdict: 'FAIL', errorCode: 'REVIEW_POLICY_INVALID' },
    { ok: false, got: false, errorCode: 'REVIEW_POLICY_INVALID' }));
  try {
    const card = documentEntry(policyFail.doc).textContent!;
    assert.match(card, /Thông tin bạn nhập đã được nạp chính xác vào capture specs\./,
      'all capture checks pass even though the separate M3 policy check fails');
    assert.doesNotMatch(card, /Thông tin bạn nhập chưa được nạp đúng/);
    assert.match(card, /Cách lấy bình luận hợp lệ/, 'the M3 policy failure is shown separately');
    assert.equal(element<HTMLButtonElement>(policyFail.doc, 'btnFlow').disabled, true,
      'a failed M3 policy still blocks starting');
  } finally { policyFail.dom.window.close(); }

  const presenceOnly = await boundEntry(entrySlipWith(
    [{ id: 'capture_spec_present', ok: true, got: true }], { verdict: 'PASS' }));
  try {
    const card = documentEntry(presenceOnly.doc).textContent!;
    assert.doesNotMatch(card, /Thông tin bạn nhập đã được nạp chính xác vào capture specs\./,
      'a presence-only check set never claims full confirmation');
    assert.match(card, /Chưa kiểm tra đủ thông tin capture specs\./,
      'missing capture checks are reported as unchecked, not as a mismatch');
    assert.equal(element<HTMLButtonElement>(presenceOnly.doc, 'btnFlow').disabled, true,
      'starting needs the full r3 capture check set');
  } finally { presenceOnly.dom.window.close(); }

  const readonly = entrySlipWith([], { verdict: 'WAIT_OWNER', errorCode: 'READONLY_ON' });
  readonly.checks = readonly.checks.map((check: any) =>
    check.id === 'readonly_off' ? { ...check, ok: false } : check);
  const readonlyRun = await boundEntry(readonly);
  try {
    const card = documentEntry(readonlyRun.doc).textContent!;
    assert.match(card, /Hệ thống đang tạm dừng lấy dữ liệu\./);
    assert.doesNotMatch(card, /Đang có tiến trình khác chạy/,
      'the maintenance lock is not described as a busy process');
    assert.equal(element<HTMLButtonElement>(readonlyRun.doc, 'btnFlow').disabled, true);
  } finally { readonlyRun.dom.window.close(); }

  const busy = await boundEntry(entrySlipWith([], { verdict: 'FAIL', errorCode: 'RUN_BUSY' }));
  try {
    const card = documentEntry(busy.doc).textContent!;
    assert.match(card, /Đang có tiến trình khác chạy cho lượt này/);
    assert.doesNotMatch(card, /Hệ thống đang tạm dừng lấy dữ liệu/, 'busy is distinct from the readonly lock');
    assert.equal(element<HTMLButtonElement>(busy.doc, 'btnFlow').disabled, true);
  } finally { busy.dom.window.close(); }
});

test('a short link marked complete is reported by derived counts, not the source flag', async () => {
  const source = syntheticReviewSource({
    rowCount: 2,
    links: [{
      shopId: '100', itemId: '200', url: 'https://shopee.vn/product/100/200',
      requested: 300, actual: 2, shortfall: 298, complete: true, status: 'exhausted',
    }],
  });
  const result = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: collectedRunInfo(),
    reviewData: syntheticReviewData({ sources: [source] }),
  });
  try {
    await waitFor(() => result.doc.getElementById('rdLinks') !== null, 'review links');
    await waitFor(() => result.doc.querySelector('#rdLinks table tbody tr') !== null, 'link table');
    const table = result.doc.querySelector('#rdLinks table')!;
    const headers = [...table.querySelectorAll('thead th')].map((cell) => cell.textContent!.trim());
    assert.deepEqual(headers, ['Link', 'Cần lấy', 'Đã lấy', 'Kết quả', 'Lý do dừng']);
    const cells = [...table.querySelectorAll('tbody tr:first-child td')].map((cell) => cell.textContent!.trim());
    assert.equal(cells[1], '300');
    assert.equal(cells[2], '2');
    assert.equal(cells[3], 'Thiếu 298', '2 of 300 is a shortfall even when complete=true is sent');
    assert.equal(cells[4], 'Shopee không còn đánh giá nào để lấy');
    assert.match(element<HTMLElement>(result.doc, 'rdSummary').textContent!, /0\/1 link đạt số lượng đặt/);
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

test('native recovery retries automatically and enables create only after read-only hydration', async () => {
  const { dom, doc, state } = harness({
    connectionResults: [
      { ok: true, data: { connected: false, readonly: null, runsRoot: null, reason: 'SSH_FAILED' } },
      { ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic/runs' } },
    ],
    fastReconnect: true,
  });
  try {
    await waitFor(() => state.connectionCalls >= 2, 'automatic connection retry');
    await booted(doc);
    assert.equal(state.newRunCalls, 0, 'reconnect does not replay create');
    assert.equal(state.launchCalls.length, 0, 'reconnect does not replay module actions');
    assert.equal(state.presetsCalls, 1, 'reconnect hydrates presets once');
    assert.equal(element<HTMLElement>(doc, 'connText').textContent, 'Đã kết nối máy chủ');
  } finally { dom.window.close(); }
});

test('an idle online session notices network loss, preserves the draft and selection, and blocks writes until fresh hydration', async () => {
  const gate = deferred<void>();
  let statusCalls = 0;
  let phase: 'online' | 'drop' = 'online';
  const online = { ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic/runs' } };
  const runInfo = (runId: string) => {
    const info: any = collectedRunInfo(runId);
    info.modules = info.modules.map((module: any) =>
      module.id === 'M1' ? { ...module, canRun: true, blockedBy: null } : module);
    return info;
  };
  const sourceA = 'a'.repeat(64);
  const sourceB = 'b'.repeat(64);
  const { dom, doc, state } = harness({
    runs: [
      { runId: 'run-a', product: 'Sản phẩm A', status: 'IDLE' },
      { runId: 'run-b', product: 'Sản phẩm B', status: 'IDLE' },
    ],
    runInfoByRun: { 'run-a': runInfo('run-a'), 'run-b': runInfo('run-b') },
    reviewDataByRun: {
      'run-a': syntheticReviewData({ runId: 'run-a', sources: [syntheticReviewSource({ sourceSha256: sourceA })] }),
      'run-b': syntheticReviewData({ runId: 'run-b', sources: [syntheticReviewSource({ sourceSha256: sourceB })] }),
    },
    statusGate: () => {
      statusCalls += 1;
      return statusCalls >= 3 ? gate : undefined;
    },
    connectionResultFor: () => {
      if (phase === 'drop') {
        phase = 'online';
        return { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } };
      }
      return online;
    },
    fastReconnect: true,
  });
  try {
    await booted(doc);
    runListButton(doc, 'run-b').click();
    await waitFor(() => runListButton(doc, 'run-b').classList.contains('on'), 'explicit selection');
    fillProduct(doc, 'Sản phẩm nháp', 'kem nháp');
    const presetsBefore = state.presetsCalls;

    phase = 'drop';
    await waitFor(() => element<HTMLButtonElement>(doc, 'btnNew').disabled === true,
      'writes disabled after the idle health check fails');
    assert.equal(state.connectionCalls > 1, true,
      'health failure noticed without a click: calls=' + state.connectionCalls +
      ' status=' + statusCalls + ' presets=' + state.presetsCalls);
    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, '__new__');
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').value, 'Sản phẩm nháp');
    assert.equal(element<HTMLInputElement>(doc, 'productKeyword').value, 'kem nháp');
    assert.equal(runListButton(doc, 'run-b').classList.contains('on'), true, 'selection preserved');

    await waitFor(() => statusCalls >= 3, 'the recovered selected-run status call reached the held gate');
    assert.equal(element<HTMLButtonElement>(doc, 'btnNew').disabled, true,
      'create stays disabled while fresh hydration is pending');
    assert.ok(doc.getElementById('rdPanel'), 'the selected run still shows its stored results while hydration is pending');
    assert.equal(element<HTMLSelectElement>(doc, 'presetSel').value, '__new__');
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').value, 'Sản phẩm nháp');
    assert.equal(element<HTMLInputElement>(doc, 'productKeyword').value, 'kem nháp');
    assert.equal(runListButton(doc, 'run-b').classList.contains('on'), true,
      'selection preserved while hydration is pending');

    gate.resolve();
    await booted(doc);
    assert.equal(element<HTMLButtonElement>(doc, 'btnNew').disabled, false,
      'create re-enabled after authoritative hydration');
    assert.ok(doc.getElementById('rdPanel'), 'the selected run still shows its stored results after hydration');
    assert.equal(state.presetsCalls, presetsBefore + 1, 'recovery hydrates once');
    const callsAfterRecovery = state.connectionCalls;
    await waitFor(() => state.connectionCalls > callsAfterRecovery, 'periodic health check while online');
    assert.equal(state.presetsCalls, presetsBefore + 1, 'healthy polls never rehydrate');
    assert.equal(state.newRunCalls, 0, 'no pending action is replayed');
    assert.equal(state.launchCalls.length, 0, 'no module action is replayed');
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').value, 'Sản phẩm nháp');
    assert.equal(runListButton(doc, 'run-b').classList.contains('on'), true, 'selection survives recovery');
    assert.equal(state.presetsCalls, presetsBefore + 1, 'healthy polls never rehydrate after recovery');
  } finally { gate.resolve(); dom.window.close(); }
});

const evidenceDescriptor = (kind: string, fileName: string, mediaType: string) => ({
  available: true, kind, sha256: 'a'.repeat(64), byteSize: 123, mediaType, fileName, errorCode: null,
});
const M2_HEADERS = ['Hạng trên nguồn Metric', 'Tên sản phẩm', 'Shop', 'Thương hiệu', 'Ngành hàng', 'Giá',
  'Khoảng giá', 'Doanh số trong kỳ', 'Doanh số kỳ trước', 'Đã bán trong kỳ', 'Đã bán kỳ trước', 'Tổng doanh số',
  'Tổng đã bán', 'Điểm đánh giá', 'Số đánh giá', 'Ngày đăng bán', 'Link Shopee'];

function moduleOutputView(runId: string, m1: any = {}, m2: any = {}) {
  const titles = ['DHC Kẽm 60 ngày', 'DHC Vitamin C 60 ngày', 'DHC Biotin 60 ngày',
    'DHC Magiê 60 ngày', 'DHC Canxi 60 ngày'];
  return {
    format: 'module-outputs-v1', runId,
    m1: {
      captureSuccess: true, dataValid: true, errorCode: null, keywords: ['kẽm'],
      period: { startDate: '2026-10-01', endDate: '2026-10-31' }, shopeeRowCount: 12,
      evidence: {
        fullPage: evidenceDescriptor('full-page', 'full-page.png', 'image/png'),
        raw: evidenceDescriptor('raw', 'raw-responses.json', 'application/json'),
      },
      ...m1,
    },
    m2: {
      policy: 'metric-products-unique-v1', legacyVerdict: null, linksMatchSourceOrder: true,
      fiveDistinct: true, selectedCount: 5, shortageReason: null, errorCode: null,
      links: titles.map((productName, i) => ({
        rank: i + 1, sourceRank: i + 3, productBaseId: `1__10${i}__801`, shopId: '801', itemId: `10${i}`,
        url: `https://shopee.vn/product/801/10${i}`, productName, shopName: 'Synthetic shop', brand: 'DHC',
        revenue: 10_000 - i * 100, groupKey: '["dhc",[]]', groupingBasis: 'finite-title-components-v1',
        reason: 'Hạng nguồn ' + (i + 3) + '.',
      })),
      skipped: [{ sourceRank: 2, productBaseId: '1__99__801', reason: 'SAME_TITLE_COMPONENT_GROUP', duplicateOfRank: 1 }],
      evidence: { topProducts: evidenceDescriptor('top-products', 'top-products.png', 'image/png') },
      ...m2,
    },
  };
}

test('a new-policy run shows both M1 results, the five picks and opens only the saved panel', async () => {
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId) }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    runListButton(doc, 'run-synthetic').click();
    await waitFor(() => doc.getElementById('moM1Capture') !== null, 'module outputs');
    assert.match(element(doc, 'moM1Capture').className, /c-ok/);
    assert.match(element(doc, 'moM1Data').className, /c-ok/);
    const m1 = doc.getElementById('moduleOutputsPanel')!.querySelector('article.mod')!;
    assert.match(m1.textContent!, /kẽm/);
    assert.match(m1.textContent!, /01\/10\/2026/);
    assert.match(m1.textContent!, /31\/10\/2026/);
    assert.match(m1.textContent!, /12/);
    assert.equal(element(doc, 'moM1FullPage').textContent, 'Xem ảnh toàn trang Metric');
    for (const id of ['moM1Specs', 'moM1Raw']) assert.equal(doc.getElementById(id), null, id);
    assert.equal(element(doc, 'moM2Chip').textContent, 'Đạt kiểm tra');
    for (const id of ['moM2Source', 'moM2Shopee', 'moM2Same', 'moM2Distinct']) {
      assert.match(element(doc, id).className, /c-ok/, id);
    }
    assert.match(element(doc, 'moM2Distinct').textContent!, /Đã chọn đủ 5 sản phẩm khác nhau/);
    const table = doc.querySelector('#moduleOutputsPanel table')!;
    assert.deepEqual([...table.querySelectorAll('thead th')].map((th) => th.textContent), M2_HEADERS);
    const rows = [...table.querySelectorAll('tbody tr')];
    assert.equal(rows.length, 5);
    assert.equal(rows[0]!.querySelector('td')!.textContent, '3');
    assert.match(rows[0]!.textContent!, /DHC Kẽm 60 ngày/);
    rows[0]!.querySelector<HTMLAnchorElement>('a.rs-url')!.click();
    await waitFor(() => state.openLinkCalls.length === 1, 'link opened outside the app');
    assert.deepEqual(state.openLinkCalls, ['https://shopee.vn/product/801/100']);
    const skipped = doc.querySelector('#moduleOutputsPanel details.tech-details')!;
    assert.match(skipped.querySelector('summary')!.textContent!, /Mục bị bỏ qua và lý do/);
    assert.match(skipped.textContent!, /Trùng với sản phẩm đã chọn ở thứ tự 1/);
    assert.equal(doc.getElementById('moM2Evidence'), null, 'the step-2 image button is gone');
    element<HTMLButtonElement>(doc, 'moM1FullPage').click();
    await waitFor(() => state.openEvidenceCalls.length === 1, 'evidence open');
    assert.deepEqual(state.openEvidenceCalls[0],
      { runId: 'run-synthetic', kind: 'full-page', sha256: 'a'.repeat(64) });
    await waitFor(() => /Đã mở bằng chứng đã lưu/.test(doc.getElementById('moduleOutputsPanel')!.textContent || ''),
      'saved evidence notice');
  } finally { dom.window.close(); }
});

test('a legacy selection keeps its old-policy label and never shows new-policy outcomes', async () => {
  const legacy = moduleOutputView('run-synthetic', {}, {
    policy: 'legacy', legacyVerdict: 'PASS', linksMatchSourceOrder: null, fiveDistinct: null,
    selectedCount: 1, shortageReason: null, errorCode: null,
    links: [{ rank: 1, sourceRank: null, productBaseId: '1__1__2', shopId: '2', itemId: '1',
      url: 'https://shopee.vn/product/2/1', productName: null, shopName: null, brand: 'Synthetic brand',
      revenue: 100, groupKey: null, groupingBasis: null, reason: 'Hạng 1' }],
    skipped: [],
    evidence: { topProducts: { available: false, kind: 'top-products', sha256: null, byteSize: null,
      mediaType: null, fileName: null, errorCode: 'LEGACY_EVIDENCE_UNBOUND' } },
  });
  const { dom, doc } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    moduleOutputsResult: (runId) => ({ ok: true, data: legacy }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    runListButton(doc, 'run-synthetic').click();
    await waitFor(() => doc.getElementById('moM2Chip') !== null, 'legacy module outputs');
    assert.equal(element(doc, 'moM2Chip').textContent, 'Kiểm tra cũ: Đạt');
    assert.match(doc.querySelector('#moduleOutputsPanel .legacy-label')!.textContent!, /quy tắc chọn cũ/);
    assert.equal(doc.getElementById('moM2Source'), null);
    assert.equal(doc.getElementById('moM2Distinct'), null);
    assert.equal(doc.getElementById('moM2Evidence'), null);
    const panel = doc.getElementById('moduleOutputsPanel')!;
    assert.match(panel.textContent!, /không áp dụng cách chọn 5 sản phẩm khác nhau mới/);
    assert.doesNotMatch(panel.textContent!, /5 sản phẩm khác nhau, không trùng lặp/);
    const cells = [...panel.querySelectorAll('tbody tr td')].map((td) => td.textContent);
    assert.ok(cells.includes('Chưa có'), 'legacy-only unknown fields stay visibly unknown');
  } finally { dom.window.close(); }
});

test('C1: a v2 run is a known rule and shows the approved skip, shortage and step-2 texts', async () => {
  const v2Link = (link: any) => ({ ...link, groupKey: null, groupingBasis: null });
  const passed = moduleOutputView('run-a', {}, {
    policy: 'metric-products-unique-v2',
    links: moduleOutputView('run-a').m2.links.map(v2Link),
    skipped: [
      { sourceRank: 2, productBaseId: '1__98__801', reason: 'SAME_PRODUCT', duplicateOfRank: 1 },
      { sourceRank: 4, productBaseId: '1__99__801', reason: 'PRODUCT_MATCH_UNSURE', duplicateOfRank: null },
      { sourceRank: 6, productBaseId: null, reason: 'PICK_LISTING_ID_UNRESOLVED', duplicateOfRank: null },
    ],
  });
  const short = moduleOutputView('run-b', {}, {
    policy: 'metric-products-unique-v2', fiveDistinct: false, selectedCount: 3, shortageReason: 'PICK_PRODUCT_UNRESOLVED',
    errorCode: 'PICK_PRODUCT_UNRESOLVED', links: moduleOutputView('run-b').m2.links.slice(0, 3).map(v2Link),
  });
  const stopped = (runId: string, errorCode: string) => ({ ...syntheticRunInfo(runId),
    state: { status: 'STOPPED', module: 'M2', errorCode } });
  const runs = ['run-a', 'run-b', 'run-c'].map((runId) => ({ runId, product: 'Sản phẩm ' + runId, status: 'DONE' }));
  const { dom, doc } = harness({
    runs,
    runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': stopped('run-b', 'PICK_PRODUCT_UNRESOLVED'),
      'run-c': stopped('run-c', 'PICK_JEV_UNAVAILABLE') },
    moduleOutputsResult: (runId) => ({ ok: true, data: runId === 'run-a' ? passed : runId === 'run-b' ? short : moduleOutputView(runId) }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 3, 'run list');
    runListButton(doc, 'run-a').click();
    await waitFor(() => doc.getElementById('moM2Chip') !== null, 'v2 outputs');
    assert.equal(element(doc, 'moM2Chip').textContent, 'Đạt kiểm tra');
    const reasons = [...doc.querySelectorAll('#moduleOutputsPanel details.tech-details tbody tr')]
      .map((row) => row.querySelectorAll('td')[2]!.textContent);
    assert.deepEqual(reasons, ['Trùng với sản phẩm đã chọn ở thứ tự 1.',
      'Không rõ phân loại trùng/khác với sản phẩm đã chọn nên không lấy.',
      'Không đọc được mã sản phẩm của dòng này nên không lấy.']);
    assert.doesNotMatch(doc.getElementById('moduleOutputsPanel')!.textContent!, /Jev/);

    runListButton(doc, 'run-b').click();
    await waitFor(() => doc.querySelector('#moduleOutputsPanel')?.textContent?.includes('3/5') === true, 'v2 shortage');
    assert.equal(element(doc, 'moM2Distinct').textContent,
      '!Chỉ chọn được 3/5 sản phẩm: có sản phẩm chưa xác định được là trùng hay khác');
    assert.equal(doc.querySelector('.errbar.local-error[title="PICK_PRODUCT_UNRESOLVED"]')!.textContent,
      'Có sản phẩm chưa xác định được là trùng hay khác nên chưa chọn đủ 5 sản phẩm.');

    runListButton(doc, 'run-c').click();
    await waitFor(() => doc.querySelector('.errbar.local-error[title="PICK_JEV_UNAVAILABLE"]') !== null, 'Jev failure');
    assert.equal(doc.querySelector('.errbar.local-error[title="PICK_JEV_UNAVAILABLE"]')!.textContent,
      'Chưa kiểm tra được sản phẩm trùng vì dịch vụ kiểm tra chưa phản hồi. Hãy chạy lại bước 2.');
  } finally { dom.window.close(); }
});

test('a module-output reply for a run left meanwhile never repaints the selected run', async () => {
  const gate = deferred<any>();
  const view = (runId: string, keyword: string) => moduleOutputView(runId, { keywords: [keyword] });
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-a', product: 'Sản phẩm A', status: 'DONE' },
      { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' }],
    runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    moduleOutputsResult: (runId) => runId === 'run-a'
      ? gate.promise
      : { ok: true, data: view(runId, 'beta') },
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 2, 'run list');
    runListButton(doc, 'run-a').click();
    await waitFor(() => /Đang tải kết quả/.test(doc.getElementById('moduleOutputsPanel')?.textContent || ''),
      'run A outputs pending');
    runListButton(doc, 'run-b').click();
    await waitFor(() => /beta/.test(doc.getElementById('moduleOutputsPanel')?.textContent || ''), 'run B outputs');
    gate.resolve({ ok: true, data: view('run-a', 'alpha') });
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.match(doc.querySelector('#runList button.on')?.getAttribute('title') || '', /run-b/);
    assert.match(doc.getElementById('moduleOutputsPanel')!.textContent!, /beta/);
    assert.doesNotMatch(doc.getElementById('moduleOutputsPanel')!.textContent!, /alpha/);
  } finally { dom.window.close(); }
});

test('B1: step 1 shows the revenue order line as passed, failed or unknown', async () => {
  const order: Record<string, boolean | null | undefined> = { 'run-a': true, 'run-b': false, 'run-c': null, 'run-d': undefined };
  const runs = Object.keys(order).map((runId) => ({ runId, product: 'Sản phẩm ' + runId, status: 'DONE' }));
  const { dom, doc } = harness({
    runs, runInfoByRun: Object.fromEntries(runs.map((run) => [run.runId, syntheticRunInfo(run.runId)])),
    moduleOutputsResult: (runId) => ({ ok: true, data: order[runId] === undefined
      ? moduleOutputView(runId, { keywords: [runId] })
      : moduleOutputView(runId, { keywords: [runId], revenueOrderDescending: order[runId] }) }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4, 'run list');
    for (const [runId, icon, cls] of [['run-a', '✓', /c-ok/], ['run-b', '✕', /c-fail/], ['run-c', '?', /c-warn/],
      ['run-d', '?', /c-warn/]] as const) {
      runListButton(doc, runId).click();
      await waitFor(() => doc.querySelector('#moduleOutputsPanel')?.textContent?.includes(runId) === true &&
        doc.getElementById('moM1Order') !== null, 'order line ' + runId);
      const line = element(doc, 'moM1Order');
      assert.match(line.className, cls, runId);
      assert.equal(line.querySelector('.ci')!.textContent, icon, runId);
      assert.equal(line.querySelector('.cl')!.textContent, 'Xếp doanh số top sản phẩm bán chạy theo thứ tự giảm dần');
      assert.equal(line.previousElementSibling!.id, 'moM1Data', 'third line, after the two existing lines');
    }
  } finally { dom.window.close(); }
});

test('B2: step 2 shows the 17 Metric columns, scrolls sideways and keeps the clickable link', async () => {
  const product = {
    rank: 7, productName: 'Tên từ Metric', shopName: 'Shop từ Metric', officialType: 1, brand: 'Nhãn từ Metric',
    categories: ['Nhóm A', 'Nhóm B'], price: 350000, priceMin: 266600, priceMax: 419000, periodRevenue: 55650000,
    previousRevenue: 26445000, periodSold: 159, previousSold: 78, totalRevenue: 158090400, totalSold: 448,
    ratingAvg: 4.93, ratingCount: 46, listedAt: '2026-01-20 10:00:00',
  };
  const base = moduleOutputView('run-synthetic');
  const links = base.m2.links.map((link: any, i: number) => ({ ...link,
    metricProduct: i === 0 ? product : i === 1 ? { ...product, categories: null } : null }));
  const { dom, doc, state } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId, {}, { links }) }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    runListButton(doc, 'run-synthetic').click();
    await waitFor(() => doc.getElementById('moM2Scroll') !== null, 'wide table');
    const table = doc.querySelector('#moM2Scroll table')!;
    assert.deepEqual([...table.querySelectorAll('thead th')].map((th) => th.textContent), M2_HEADERS);
    const cells = (row: number) => [...table.querySelectorAll('tbody tr')[row]!.querySelectorAll('td')].map((td) => td.textContent);
    assert.deepEqual(cells(0), ['7', 'Tên từ Metric', 'Shop từ Metric', 'Nhãn từ Metric', 'Nhóm A › Nhóm B',
      '350.000 đ', '266.600 – 419.000 đ', '55.650.000 đ', '26.445.000 đ', '159', '78', '158.090.400 đ', '448', '4,9', '46',
      '20/01/2026', 'https://shopee.vn/product/801/100']);
    assert.equal(cells(1)[4], 'Chưa có');
    const fallback = cells(2);
    assert.deepEqual(fallback.slice(0, 3), ['5', 'DHC Biotin 60 ngày', 'Synthetic shop'], 'without a Metric row the link fields stay');
    assert.deepEqual(fallback.slice(8, 16), Array(8).fill('Chưa có'));
    assert.equal(element(doc, 'moM2Scroll').nextElementSibling!.textContent, 'Kéo ngang để xem đủ các cột.');
    table.querySelectorAll<HTMLAnchorElement>('tbody tr a.rs-url')[0]!.click();
    await waitFor(() => state.openLinkCalls.length === 1, 'link opened outside the app');
  } finally { dom.window.close(); }
});

test('B2: a legacy run shows the looked-up Metric row without new-policy check lines', async () => {
  const legacy = moduleOutputView('run-synthetic', {}, {
    policy: 'legacy', legacyVerdict: 'PASS', linksMatchSourceOrder: null, fiveDistinct: null,
    selectedCount: 1, shortageReason: null, errorCode: null, skipped: [],
    links: [{ rank: 1, sourceRank: null, productBaseId: '1__1__2', shopId: '2', itemId: '1',
      url: 'https://shopee.vn/product/2/1', productName: null, shopName: null, brand: 'Synthetic brand',
      revenue: 100, groupKey: null, groupingBasis: null, reason: 'Hạng 1',
      metricProduct: { rank: 19, productName: 'Tên cũ tra lại', shopName: 'Shop cũ', officialType: null, brand: null,
        categories: null, price: null, priceMin: null, priceMax: null, periodRevenue: null, previousRevenue: null,
        periodSold: null, previousSold: null, totalRevenue: null, totalSold: null, ratingAvg: null, ratingCount: null,
        listedAt: null } }],
  });
  const { dom, doc } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    moduleOutputsResult: () => ({ ok: true, data: legacy }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    runListButton(doc, 'run-synthetic').click();
    await waitFor(() => doc.getElementById('moM2Scroll') !== null, 'legacy wide table');
    assert.equal(element(doc, 'moM2Chip').textContent, 'Kiểm tra cũ: Đạt');
    for (const id of ['moM2Source', 'moM2Shopee', 'moM2Same', 'moM2Distinct']) assert.equal(doc.getElementById(id), null, id);
    const cells = [...doc.querySelectorAll('#moM2Scroll tbody tr td')].map((td) => td.textContent);
    assert.deepEqual(cells.slice(0, 4), ['19', 'Tên cũ tra lại', 'Shop cũ', 'Synthetic brand']);
    assert.equal(cells[7], '100 đ', 'period revenue falls back to the saved link revenue');
  } finally { dom.window.close(); }
});

test('B3: each sentiment bar segment is as wide as its own percentage of starred comments', async () => {
  const all = { commentCount: 10, averageStar: 3.2, starCounts: { 1: 0, 2: 0, 3: 9, 4: 1, 5: 0 },
    firstCommentAt: '2026-11-01T09:00:00+07:00', lastCommentAt: '2026-11-05T09:00:00+07:00' };
  const stats = { format: 'review-stats-v1', runId: 'run-synthetic', sources: [{
    sourceSha256: 'c'.repeat(64), kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z', all,
    links: [{ shopId: '801', itemId: '100', url: 'https://shopee.vn/product/801/100', ...all }],
  }] };
  const { doc } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfoByRun: { 'run-synthetic': syntheticRunInfo('run-synthetic') },
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId) }),
    reviewStatsResult: () => ({ ok: true, data: stats }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();
    await waitFor(() => doc.querySelectorAll('#resultRunList button').length === 1, 'result run list');
    doc.querySelector<HTMLButtonElement>('#resultRunList button')!.click();
    await waitFor(() => doc.getElementById('resultSentiment') !== null, 'overview');
    assert.equal(element(doc, 'resultSentiment').textContent, 'Đánh giá tích cực 10%Đánh giá tiêu cực 0%Đánh giá trung lập 90%');
    assert.deepEqual([...doc.querySelectorAll<HTMLElement>('#resultOverview .kd-bar i')].map((segment) => segment.style.width), ['10%', '0%', '90%']);
  } finally { doc.defaultView!.close(); }
});

test('the comment card downloads every collected comment and its button shows the real count', async () => {
  const runId = 'run-synthetic';
  const sample = Array.from({ length: 200 }, (_, i) => ({ id: 'r' + i, text: 'Bình luận ' + i, rating: 5, date: null,
    productName: null, url: 'https://shopee.vn/product/801/100', tags: [] }));
  const insights = { format: 'review-insights-v1', runId, codebookVersion: 'synthetic', sources: [{
    sourceSha256: 'c'.repeat(64), kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z',
    all: { summary: { status: 'EMPTY', text: null, model: null, generatedAt: null }, themes: [], comments: sample }, links: [] }] };
  const { doc, state } = harness({
    runs: [{ runId, product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id) => ({ ok: true, data: moduleOutputView(id) }),
    reviewStatsResult: () => ({ ok: true, data: syntheticReviewStats(runId, 1234) }),
    reviewInsightsResult: () => ({ ok: true, data: insights }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();
    await waitFor(() => doc.querySelectorAll('#resultRunList button').length === 1, 'result run list');
    doc.querySelector<HTMLButtonElement>('#resultRunList button')!.click();
    await waitFor(() => doc.getElementById('resultCommentDownload') !== null, 'comment download');
    const card = element(doc, 'resultCommentDrilldown');
    assert.equal(card.querySelector('h3')!.textContent, 'Chi tiết bình luận');
    assert.equal(element(doc, 'resultCommentDownload').textContent, 'Tải 1.234 bình luận (JSON)', 'the collected total, not the 200 sample');
    assert.doesNotMatch(card.textContent || '', /bình luận mẫu/);
    assert.equal(card.querySelector('details'), null, 'no on-screen sample list');
    element<HTMLButtonElement>(doc, 'resultCommentDownload').click();
    await waitFor(() => (element(doc, 'resultCommentDownloadNote').textContent || '').startsWith('Đã lưu'), 'saved note');
    assert.deepEqual(state.exportReviewFilesCalls.at(-1), { runId, input: { sourceSha256: 'c'.repeat(64), formats: ['labelled-json'] } });
    assert.equal(element(doc, 'resultCommentDownloadNote').textContent, 'Đã lưu “shopee-run-synthetic.labelled-json”.');
  } finally { doc.defaultView!.close(); }
});

test('B3: the results tab shows numbers for the run and changes them per product link', async () => {
  const numbers = (count: number, stars: number[], first: string, last: string) => ({
    commentCount: count, averageStar: stars.reduce((sum, n, i) => sum + n * (i + 1), 0) / stars.reduce((a, b) => a + b, 0),
    starCounts: { 1: stars[0], 2: stars[1], 3: stars[2], 4: stars[3], 5: stars[4] }, firstCommentAt: first, lastCommentAt: last,
  });
  const linkA = 'https://shopee.vn/product/801/100';
  const linkB = 'https://shopee.vn/product/801/101';
  const stats = { format: 'review-stats-v1', runId: 'run-synthetic', sources: [{
    sourceSha256: 'c'.repeat(64), kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z',
    all: numbers(24, [0, 1, 0, 0, 23], '2026-02-14T09:00:00+07:00', '2026-11-05T09:00:00+07:00'),
    links: [{ shopId: '801', itemId: '100', url: linkA, ...numbers(21, [0, 1, 0, 0, 20], '2026-03-01T09:00:00+07:00', '2026-11-05T09:00:00+07:00') },
      { shopId: '801', itemId: '101', url: linkB, ...numbers(3, [0, 0, 0, 0, 3], '2026-02-14T09:00:00+07:00', '2026-06-01T09:00:00+07:00') }],
  }] };
  const { dom, doc } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' },
      { runId: 'run-empty', product: 'Sản phẩm trống', status: 'DONE' }],
    runInfoByRun: { 'run-synthetic': syntheticRunInfo('run-synthetic'), 'run-empty': syntheticRunInfo('run-empty') },
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId) }),
    reviewStatsResult: (runId) => ({ ok: true, data: runId === 'run-synthetic' ? stats
      : { format: 'review-stats-v1', runId, sources: [] } }),
  });
  try {
    const tabs = [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')];
    assert.deepEqual(tabs.map((tab) => tab.textContent),
      ['Tạo lượt mới', 'Chi tiết lịch sử lượt chạy', 'Kết quả chạy', 'Tài liệu kỹ thuật']);
    await waitFor(() => doc.querySelectorAll('#runList button').length === 2, 'run list');
    tabs[2]!.click();
    await waitFor(() => doc.querySelectorAll('#resultRunList button').length === 2, 'result run list');
    assert.equal(element(doc, 'scr-result').hidden, false);
    assert.equal(element(doc, 'scr-track').hidden, true);
    const resultButton = (runId: string) => [...doc.querySelectorAll<HTMLButtonElement>('#resultRunList button')]
      .find((button) => button.title.includes(runId))!;
    resultButton('run-synthetic').click();
    await waitFor(() => doc.getElementById('resultOverview') !== null &&
      /Tên|DHC/.test(element(doc, 'resultLinkSelect').textContent || ''), 'overview');
    const detail = element(doc, 'resultDetail');
    assert.equal(detail.querySelector('.dhead h2')!.textContent, 'Sản phẩm tổng hợp');
    assert.ok(detail.querySelector('.dhead .chip'), 'status chip');
    assert.equal(detail.querySelector('#resultOverview h3')!.textContent, 'Tổng quan bình luận Shopee');
    assert.equal(detail.querySelector('.kd-score b')!.textContent, '4,9');
    assert.equal(element(doc, 'resultCount').textContent, '24 bình luận từ 2 link sản phẩm · 14/02/2026 - 05/11/2026');
    assert.equal(element(doc, 'resultSentiment').textContent, 'Đánh giá tích cực 95,8%Đánh giá tiêu cực 4,2%Đánh giá trung lập 0%');
    const select = element<HTMLSelectElement>(doc, 'resultLinkSelect');
    assert.deepEqual([...select.options].map((option) => option.textContent),
      ['Tất cả 2 link sản phẩm', 'DHC Kẽm 60 ngày (21 bình luận)', 'DHC Vitamin C 60 ngày (3 bình luận)']);
    select.value = linkB;
    select.dispatchEvent(new dom.window.Event('change'));
    assert.equal(element(doc, 'resultCount').textContent, '3 bình luận từ 1 link sản phẩm · 14/02/2026 - 01/06/2026');
    assert.equal(element(doc, 'resultSentiment').textContent, 'Đánh giá tích cực 100%Đánh giá tiêu cực 0%Đánh giá trung lập 0%');
    assert.deepEqual([...detail.querySelectorAll<HTMLElement>('.kd-bar i')].map((segment) => segment.style.width), ['100%', '0%', '0%']);
    assert.equal(detail.querySelector('.kd-score b')!.textContent, '5,0');
    await waitFor(() => doc.getElementById('resultInsights') !== null, 'result insights');
    assert.equal(doc.getElementById('resultAiSummary')!.querySelector('h3')!.textContent, 'AI Tóm tắt');
    assert.equal(doc.getElementById('resultThemeTags')!.querySelector('h3')!.textContent, '10 nhãn chủ đề');

    resultButton('run-empty').click();
    await waitFor(() => doc.getElementById('resultEmpty') !== null, 'empty run');
    assert.equal(element(doc, 'resultEmpty').textContent, 'Lượt này chưa có bình luận.');
  } finally { dom.window.close(); }
});

test('result stats refresh on the terminal status poll and replace a cached zero', async () => {
  const runId = 'run-terminal';
  const info: any = syntheticRunInfo(runId);
  info.state = { status: 'RUNNING', module: 'M3', errorCode: null };
  let collected = false;
  let statsCalls = 0;
  const { dom, doc, state } = harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'RUNNING' }],
    runInfoByRun: { [runId]: info },
    fastPoll: true,
    reviewStatsResult: () => {
      statsCalls += 1;
      return { ok: true, data: syntheticReviewStats(runId, collected ? 12 : 0) };
    },
  });
  try {
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();
    await waitFor(() => statsCalls >= 1 && doc.getElementById('resultEmpty') !== null, 'zero cached while running');
    const statusBefore = state.statusCalls.filter((id) => id === runId).length;
    const statsBefore = statsCalls;
    info.state = { status: 'DONE', module: null, errorCode: null };
    collected = true;
    await waitFor(() => state.statusCalls.filter((id) => id === runId).length > statusBefore, 'terminal poll');
    await waitFor(() => statsCalls > statsBefore, 'terminal stats refresh');
    await waitFor(() => element(doc, 'resultCount').textContent?.includes('12 bình luận') === true,
      'terminal result counts');
    assert.equal(doc.getElementById('resultEmpty'), null, 'the cached zero is replaced');
  } finally { dom.window.close(); }
});

test('custom collection completion refreshes review data and result stats without run polling', async () => {
  const runId = 'run-custom-done';
  const info: any = syntheticRunInfo(runId);
  info.state = { status: 'IDLE', module: null, errorCode: null };
  const attempt = {
    attemptId: 'attempt-custom', planSha256: 'c'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  let collected = false;
  let statsCalls = 0;
  const { dom, doc, state } = harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'IDLE' }],
    runInfoByRun: { [runId]: info },
    samplingByRun: { [runId]: syntheticSampling({ runId, attempts: [attempt] }) },
    fastPoll: true,
    reviewStatsResult: () => {
      statsCalls += 1;
      return { ok: true, data: syntheticReviewStats(runId, collected ? 12 : 0) };
    },
  });
  try {
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();
    await waitFor(() => statsCalls >= 1 && doc.getElementById('resultEmpty') !== null, 'zero cached while collecting');
    const samplingBefore = state.reviewSamplingCallsByRun[runId] || 0;
    const dataBefore = state.reviewDataCallsByRun[runId] || 0;
    const statsBefore = statsCalls;
    state.samplingByRun![runId].attempts[0].status = 'SUCCEEDED';
    collected = true;
    await waitFor(() => (state.reviewSamplingCallsByRun[runId] || 0) > samplingBefore,
      'sampling poll observes terminal completion');
    await waitFor(() => (state.reviewDataCallsByRun[runId] || 0) > dataBefore,
      'stored review data refresh');
    await waitFor(() => statsCalls > statsBefore, 'stored result stats refresh');
    await waitFor(() => element(doc, 'resultCount').textContent?.includes('12 bình luận') === true,
      'delivered result counts');
    assert.equal(doc.getElementById('resultEmpty'), null, 'the cached empty result is replaced');
  } finally { dom.window.close(); }
});

test('a step that has not run shows no result card: stopped at step 1, step 3 not started, step 3 started', async () => {
  const stoppedAtM1: any = syntheticRunInfo('run-m1');
  stoppedAtM1.gates.m1 = { ...passSlip('M1'), verdict: 'FAIL', errorCode: 'CAPTURE_PERIOD_NOT_SELECTABLE' };
  stoppedAtM1.gates.m2 = null;
  stoppedAtM1.selection = null;
  stoppedAtM1.state = { status: 'STOPPED', module: 'M1', errorCode: 'CAPTURE_PERIOD_NOT_SELECTABLE' };
  const m3Started: any = syntheticRunInfo('run-m3');
  m3Started.modules = m3Started.modules.map((mod: any) => mod.id === 'M3'
    ? { ...mod, execution: { status: 'FAILED', errorCode: 'RUN_INTERRUPTED' } } : mod);
  const cases: [string, any, string[]][] = [
    ['run-m1', stoppedAtM1, ['Bước 1 Lấy số liệu bán hàng']],
    ['run-m2', syntheticRunInfo('run-m2'), ['Bước 1 Lấy số liệu bán hàng', 'Bước 2 Chọn link bán chạy']],
    ['run-m3', m3Started, ['Bước 1 Lấy số liệu bán hàng', 'Bước 2 Chọn link bán chạy', 'Bước 3 Lấy bình luận',
      'Bước 4 Lưu và phân loại bình luận']],
  ];
  const { dom, doc } = harness({
    runs: cases.map(([runId]) => ({ runId, product: 'Sản phẩm ' + runId, status: 'DONE' })),
    runInfoByRun: Object.fromEntries(cases.map(([runId, info]) => [runId, info])),
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId, { keywords: [runId] }) }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === cases.length, 'run list');
    for (const [runId, , cards] of cases) {
      runListButton(doc, runId).click();
      await waitFor(() => doc.querySelector('#moduleOutputsPanel')?.textContent?.includes(runId) === true,
        'step results ' + runId);
      const titles = [...doc.querySelectorAll('#moduleOutputsPanel article.mod > .mh > h3')].map((node) => node.textContent);
      assert.deepEqual(titles, cards, runId);
      assert.equal(doc.getElementById('rdPanel') !== null, cards.includes('Bước 3 Lấy bình luận'), runId + ' step 3 card');
    }
  } finally { dom.window.close(); }
});

const PAGES_POLICY = {
  format: 'shopee-review-policy-v2', limitBy: 'pages', mode: 'with-comments', stars: [], pagesPerLink: 10,
  totalPerLink: 2000, allocation: 'pooled', textRule: 'comment-or-attributes-v1', order: 'native-filter-ascending-stars-v1',
};

function limitBy(doc: Document, value: 'count' | 'pages'): void {
  const radio = doc.querySelector(`input[name="newLimitBy"][value="${value}"]`) as HTMLInputElement;
  radio.checked = true;
  radio.dispatchEvent(new (doc.defaultView as any).Event('change', { bubbles: true }));
}

test('C2: limiting by Shopee review pages swaps the count field for a page field and sends the pages input', async () => {
  const { dom, doc, state } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-pages' } }),
    runInfoByRun: { 'run-pages': createdRunInfo('run-pages') },
  });
  try {
    await booted(doc);
    const shown = () => ['newTotalField', 'newBalancedRow', 'newPagesField'].map((id) => !element(doc, id).hidden);
    assert.equal((doc.querySelector('input[name="newLimitBy"]:checked') as HTMLInputElement).value, 'count');
    assert.equal(element<HTMLInputElement>(doc, 'newPages').value, '10');
    chooseStars(doc, [3, 2], 300);
    assert.deepEqual(shown(), [true, true, false], 'count mode keeps today’s fields');
    element<HTMLInputElement>(doc, 'newBalanced').checked = true;

    limitBy(doc, 'pages');
    assert.deepEqual(shown(), [false, false, true], 'pages mode hides the count and the equal split');
    element<HTMLInputElement>(doc, 'newPages').value = '12';
    fire(dom.window, element(doc, 'newPages'), 'input');
    assert.equal(element<HTMLElement>(doc, 'newPolicySummary').textContent, 'Đánh giá 2 và 3 sao · tối đa 12 trang mỗi link');

    element<HTMLInputElement>(doc, 'newPages').value = '101';
    create(doc);
    assert.equal(state.newRunCalls, 0, 'more than 100 pages is refused inline');
    assert.match(element<HTMLElement>(doc, 'newErr').textContent!, /từ 1 đến 100/);

    element<HTMLInputElement>(doc, 'newPages').value = '12';
    fire(dom.window, element(doc, 'newPages'), 'input');
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'new-run sent');
    assert.deepEqual(state.newRunInputs[0]!.collectionPolicy,
      { mode: 'stars', stars: [2, 3], limitBy: 'pages', pagesPerLink: 12, allocation: 'pooled' });
  } finally { dom.window.close(); }

  const back = harness();
  try {
    await booted(back.doc);
    limitBy(back.doc, 'pages');
    limitBy(back.doc, 'count');
    assert.equal(element(back.doc, 'newTotalField').hidden, false);
    assert.equal(element(back.doc, 'newPagesField').hidden, true);
    assert.equal(element<HTMLElement>(back.doc, 'newPolicySummary').textContent, 'Đánh giá có bình luận · tối đa 300 mỗi link');
  } finally { back.dom.window.close(); }
});

test('C2: a pages-mode run shows its page limit in the run list and the run meta', async () => {
  const info: any = syntheticRunInfo();
  info.request = { ...clone(createdRunInfo('run-synthetic').request), collectionPolicy: clone(PAGES_POLICY) };
  const { dom, doc } = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'IDLE', request: info.request }],
    runInfo: info, sampling: syntheticSampling(),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    assert.match(runListButton(doc, 'run-synthetic').textContent!, /Tối đa 10 trang mỗi link/);
    runListButton(doc, 'run-synthetic').click();
    await waitFor(() => doc.querySelectorAll('dl.run-meta > div').length > 0, 'run meta');
    const meta = [...doc.querySelectorAll('dl.run-meta > div')]
      .map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent]);
    assert.deepEqual(meta.find(([label]) => label === 'Số lượng mỗi link'), ['Số lượng mỗi link', 'Tối đa 10 trang mỗi link']);
    assert.deepEqual(meta.find(([label]) => label === 'Cách lấy bình luận'),
      ['Cách lấy bình luận', 'Đánh giá có bình luận · tối đa 10 trang mỗi link']);
  } finally { dom.window.close(); }
});

test('C2: the mock API lists a pages-mode run and creates one from the pages form', async () => {
  const dom = new JSDOM(html, { url: 'file:///shopee-desktop/index.html?mock=1', runScripts: 'dangerously' });
  const doc = dom.window.document;
  try {
    await booted(doc);
    await waitFor(() => doc.querySelectorAll('#runList .runbtn').length > 0, 'mock run list');
    assert.match(runListButton(doc, 'c9d0e1f2').textContent!, /Tối đa 10 trang mỗi link/);
    limitBy(doc, 'pages');
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'mock create result');
    await waitFor(() => doc.querySelectorAll('#runList .runbtn').length === 10, 'created run listed');
    const created = [...doc.querySelectorAll<HTMLButtonElement>('#runList .runbtn')]
      .filter((button) => /trang mỗi link/.test(button.textContent || ''));
    assert.equal(created.length, 2, 'the seeded and the created pages-mode runs');
  } finally { dom.window.close(); }
});

test('a partial bridge at boot that finishes later recovers readiness', async () => {
  // pywebview exposes window.pywebview.api = {} before it adds the methods and fires
  // pywebviewready; a first launch can boot between those two phases.
  const { dom, doc, window, state, api: bridgeApi } = harness({ bridge: 'partial' });
  try {
    await new Promise((resolve) => setTimeout(resolve, 20));
    const startupCode = element<HTMLElement>(doc, 'errbar').title;

    Object.assign((window as any).pywebview.api, bridgeApi);
    window.dispatchEvent(new window.Event('pywebviewready'));

    const deadline = Date.now() + 3000;
    while (state.connectionCalls < 1 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    assert.ok(state.connectionCalls >= 1,
      'the completed bridge was never used after startup; startup surface=' + startupCode);
    await waitFor(() => !element<HTMLButtonElement>(doc, 'btnNew').disabled,
      'create enabled after the bridge finished');
    assert.equal(element<HTMLElement>(doc, 'errbar').hidden, true,
      'the startup bridge error is cleared after recovery');
  } finally { dom.window.close(); }
});

// Step 4: fixtures follow CONTRACT-STEP4 (review-process-view-v1, runs-progress-v1) exactly.
const STEP4_SHA = 'c'.repeat(64);

function step4Source(kind: 'RUNNING' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE') {
  const source: any = {
    sourceSha256: STEP4_SHA, state: kind, errorCode: null,
    startedAt: '2026-11-08T02:31:00Z', finishedAt: null, retries: 0, canResume: false,
    fee: { currency: 'USD', filter: 0.31, label: 2.6, total: 2.91, basis: 'ESTIMATE' },
    stages: {
      save: { state: 'PASS', total: 531, done: 531, inserted: 412, alreadyPresent: 119 },
      filter: { state: 'RUNNING', total: 531, done: 240, keep: 228, exclude: 5, unresolved: 3, noContent: 4 },
      label: { state: 'IDLE', total: null, done: 0, unresolvedSkipped: null },
    },
    gates: { in: { verdict: 'PASS', checks: [{ id: 'source_unchanged', ok: true, level: 'error', got: 'match' }] }, out: null },
  };
  if (kind === 'PASS' || kind === 'FAIL') {
    source.stages.filter = { state: 'PASS', total: 531, done: 531, keep: 498, exclude: 12, unresolved: 9, noContent: 12 };
    source.stages.label = { state: 'PASS', total: 498, done: 498, unresolvedSkipped: 9 };
    source.finishedAt = '2026-11-08T02:39:00Z';
    source.gates.out = { verdict: 'PASS', checks: [
      { id: 'all_rows_saved', ok: true, level: 'error', got: '531/531' },
      { id: 'kept_all_labelled', ok: true, level: 'error', got: '498/498' },
    ] };
  }
  if (kind === 'FAIL') {
    Object.assign(source, { errorCode: 'JEV_CALL_FAILED', finishedAt: '2026-11-08T02:37:00Z', retries: 3, canResume: true });
    source.stages.label = { state: 'FAIL', total: 498, done: 312, unresolvedSkipped: 9 };
    source.gates.out = { verdict: 'FAIL', checks: [
      { id: 'all_rows_saved', ok: true, level: 'error', got: '531/531' },
      { id: 'kept_all_labelled', ok: false, level: 'error', got: '312/498' },
    ] };
  }
  if (kind === 'NOT_APPLICABLE') {
    Object.assign(source, { startedAt: null, canResume: true, gates: { in: null, out: null } });
    source.stages = {
      save: { state: 'IDLE', total: 531, done: 0, inserted: null, alreadyPresent: null },
      filter: { state: 'IDLE', total: null, done: 0, keep: null, exclude: null, unresolved: null, noContent: null },
      label: { state: 'IDLE', total: null, done: 0, unresolvedSkipped: null },
    };
  }
  return source;
}

function reviewProcessReply(runId: string, kind: 'RUNNING' | 'PASS' | 'FAIL' | 'NOT_APPLICABLE') {
  return { ok: true, data: {
    format: 'review-process-view-v1', runId, autoRun: kind !== 'NOT_APPLICABLE', labelUnresolved: false,
    sources: [step4Source(kind)],
  } };
}

function progressReply(runs: any[], generatedAt = '2026-11-16T09:00:00Z') {
  return { ok: true, data: { format: 'runs-progress-v1', generatedAt, runs } };
}

function progressRun(runId: string, steps: string[], extra: any = {}) {
  return { runId, steps, active: null, finished: false, changedAt: '2026-11-16T08:59:40Z', ...extra };
}

const STEP4_RUN_KINDS = { 'run-running': 'RUNNING', 'run-pass': 'PASS', 'run-fail': 'FAIL', 'run-old': 'NOT_APPLICABLE' } as const;

function step4Harness(extra: Parameters<typeof harness>[0] = {}) {
  const ids = Object.keys(STEP4_RUN_KINDS) as (keyof typeof STEP4_RUN_KINDS)[];
  return harness({
    runs: ids.map((runId) => ({ runId, product: 'Sản phẩm ' + runId, status: 'DONE' })),
    runInfoByRun: Object.fromEntries(ids.map((runId) => [runId, collectedRunInfo(runId)])),
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId) }),
    reviewProcessResult: (runId) => reviewProcessReply(runId, STEP4_RUN_KINDS[runId as keyof typeof STEP4_RUN_KINDS]),
    ...extra,
  });
}

const step4Card = (doc: Document) => doc.getElementById('s4card') as HTMLElement;
const lines = (node: Element | null, selector: string) =>
  [...(node ? node.querySelectorAll(selector) : [])].map((entry) => (entry.textContent || '').trim());

test('step 4 card follows step 3 and shows the running, pass, fail and old states; only a resumable stop offers «Chạy tiếp»', async () => {
  const { dom, doc, state } = step4Harness();
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4, 'run list');
    const expected: Record<string, { chip: string; rows: string[]; text: RegExp[]; resume: boolean }> = {
      'run-running': { chip: 'Đang chạy', resume: false, rows: [
        'Đã lưu 531/531 bình luận (412 mới, 119 đã có từ trước). Không tốn phí.', 'Đang lọc 240/531…',
        'Chưa chạy. Bắt đầu khi phần lọc xong.'], text: [/khoảng 2,9 USD \(lọc 0,3 \+ gắn chủ đề 2,6\)/, /Tự cập nhậtmỗi 10 giây/] },
      'run-pass': { chip: 'Đạt kiểm tra', resume: false, rows: [
        'Đã lưu 531/531 bình luận (412 mới, 119 đã có từ trước). Không tốn phí.',
        'Đã lọc 531/531: giữ 498 · loại 12 · chưa rõ 9 · không có chữ 12.',
        'Đã gắn chủ đề cho 498/498 bình luận được giữ.'],
      text: [/Bắt đầu08\/11\/2026 09:31/, /Xong08\/11\/2026 09:39/,
        /9 bình luận «chưa rõ» \(có khiếu nại hoặc sao thấp\) chưa được gắn chủ đề, chờ anh quyết định\./] },
      'run-fail': { chip: 'Dừng vì lỗi', resume: true, rows: [
        'Đã lưu 531/531 bình luận (412 mới, 119 đã có từ trước). Không tốn phí.',
        'Đã lọc 531/531: giữ 498 · loại 12 · chưa rõ 9 · không có chữ 12.',
        'Dừng ở 312/498 sau 3 lần tự thử lại: Jev không trả lời.'],
      text: [/Dừng08\/11\/2026 09:37/, /Bước 4 dừng ở phần gắn chủ đề\. Phần đã xong được giữ lại\. Bấm «Chạy tiếp» chỉ xử lý 186 bình luận còn lại, không tính phí lại phần đã xong\./] },
      'run-old': { chip: 'Không tự chạy', resume: false, rows: ['Chưa chạy.', 'Chưa chạy.', 'Chưa chạy.'],
        text: [/Lượt này được tạo trước khi có bước 4 nên không tự chạy\. Muốn phân loại lượt này thì làm riêng một lần, có báo phí trước\./] },
    };
    for (const [runId, want] of Object.entries(expected)) {
      runListButton(doc, runId).click();
      await waitFor(() => step4Card(doc)?.querySelector('.mh .chip')?.textContent === want.chip, 'step 4 card ' + runId);
      const titles = lines(doc.getElementById('moduleOutputsPanel'), ':scope > article.mod > .mh > h3');
      assert.deepEqual(titles.slice(-2), ['Bước 3 Lấy bình luận', 'Bước 4 Lưu và phân loại bình luận'], runId);
      assert.deepEqual(lines(step4Card(doc), '.cks .cl'),
        ['Lưu bình luận vào hệ thống', 'Lọc bình luận không liên quan', 'Gắn chủ đề cho bình luận'], runId);
      assert.deepEqual(lines(step4Card(doc), '.cks .ck > div > div:nth-child(2)'), want.rows, runId);
      for (const pattern of want.text) assert.match(step4Card(doc).textContent || '', pattern, runId);
      assert.equal(doc.getElementById('s4Resume') !== null, want.resume, runId + ' «Chạy tiếp»');
      if (runId === 'run-old') assert.doesNotMatch(step4Card(doc).textContent || '', /Phí Jev ước tính/);
    }
    runListButton(doc, 'run-fail').click();
    await waitFor(() => doc.getElementById('s4Resume') !== null, 'fail card again');
    element<HTMLButtonElement>(doc, 's4Resume').click();
    await waitFor(() => state.processReviewDataCalls.length === 1, 'resume sent');
    assert.deepEqual(state.processReviewDataCalls, [{ runId: 'run-fail', sourceSha256: STEP4_SHA }]);
  } finally { dom.window.close(); }
});

test('step 4 card with several sources: any stop wins and resumes that source, «Đạt kiểm tra» needs every source', async () => {
  const second = 'd'.repeat(64);
  const withSha = (source: any, sha: string) => ({ ...source, sourceSha256: sha });
  const views: Record<string, any[]> = {
    'run-fail': [step4Source('PASS'), withSha(step4Source('FAIL'), second)],
    'run-running': [step4Source('PASS'), withSha(step4Source('RUNNING'), second)],
    'run-pass': [step4Source('PASS'), withSha(step4Source('PASS'), second)],
    'run-old': [step4Source('NOT_APPLICABLE')],
  };
  const { dom, doc, state } = step4Harness({
    reviewProcessResult: (runId) => ({ ok: true, data: {
      format: 'review-process-view-v1', runId, autoRun: runId !== 'run-old', labelUnresolved: false, sources: views[runId],
    } }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4, 'run list');
    for (const [runId, chip, note] of [
      ['run-fail', 'Dừng vì lỗi', 'Lượt này có 2 nguồn bình luận: 1 dừng vì lỗi, 1 đạt kiểm tra. Số liệu bên trên là của nguồn dừng vì lỗi.'],
      ['run-running', 'Đang chạy', 'Lượt này có 2 nguồn bình luận: 1 đang chạy, 1 đạt kiểm tra. Số liệu bên trên là của nguồn đang chạy.'],
      ['run-pass', 'Đạt kiểm tra', 'Lượt này có 2 nguồn bình luận, cả 2 đều đạt kiểm tra. Số liệu bên trên là của nguồn đầu tiên.'],
    ] as const) {
      runListButton(doc, runId).click();
      await waitFor(() => step4Card(doc)?.querySelector('.mh .chip')?.textContent === chip, 'step 4 card ' + runId);
      assert.equal(doc.getElementById('s4Sources')?.textContent, note, runId);
      assert.equal(doc.getElementById('s4Resume') !== null, runId === 'run-fail', runId + ' «Chạy tiếp»');
    }
    runListButton(doc, 'run-fail').click();
    await waitFor(() => doc.getElementById('s4Resume') !== null, 'fail card again');
    element<HTMLButtonElement>(doc, 's4Resume').click();
    await waitFor(() => state.processReviewDataCalls.length === 1, 'resume sent');
    assert.deepEqual(state.processReviewDataCalls, [{ runId: 'run-fail', sourceSha256: second }]);
  } finally { dom.window.close(); }
});

test('the technical log adds the step 4 chips after M3 and both step 4 checks with technical details', async () => {
  const { dom, doc } = step4Harness();
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4, 'run list');
    for (const [runId, chips, out] of [
      ['run-fail', ['PASS', 'Dừng vì lỗi', 'FAIL'], 'Không đạt'],
      ['run-running', ['PASS', 'Đang chạy', 'Chưa chạy'], 'Chưa chạy'],
      ['run-old', ['Không áp dụng', 'Không tự chạy', 'Không áp dụng'], 'Không áp dụng'],
    ] as const) {
      runListButton(doc, runId).click();
      await waitFor(() => !!step4Card(doc)?.querySelector('.cks'), 'step 4 loaded ' + runId);
      const seq = [...doc.querySelectorAll('#techDetails .seq .seqch')].map((chip) =>
        [chip.querySelector('b')!.textContent, chip.querySelector('span')!.textContent]);
      assert.deepEqual(seq.slice(-4).map((pair) => pair[0]),
        ['Kiểm tra sau bước 3', 'Kiểm tra trước bước 4', 'M4', 'Kiểm tra sau bước 4'], runId);
      assert.deepEqual(seq.slice(-3).map((pair) => pair[1]), [...chips], runId);
      const gates = [...doc.querySelectorAll('#techDetails > article.gate')].slice(-2);
      assert.deepEqual(gates.map((gate) => gate.querySelector('h3')!.textContent), ['Kiểm tra trước bước 4', 'Kiểm tra sau bước 4']);
      assert.equal(gates[1]!.querySelector('.gh .chip')!.textContent, out, runId);
    }
    runListButton(doc, 'run-fail').click();
    await waitFor(() => !!step4Card(doc)?.querySelector('#s4Resume'), 'fail loaded');
    assert.equal(element<HTMLDetailsElement>(doc, 'techDetails').open, true, 'a step 4 stop opens the technical log');
    const out = [...doc.querySelectorAll('#techDetails > article.gate')].pop()!;
    assert.deepEqual(lines(out, '.ck-tech code'), ['all_rows_saved', 'kept_all_labelled']);
    assert.deepEqual(lines(out, '.ck .cl'), ['Đã lưu đủ bình luận của bước 3, không bỏ dòng nào',
      'Mọi bình luận được giữ đều có chủ đề (kể cả «không có chủ đề»)']);
    assert.equal(out.querySelectorAll('.ck.c-fail').length, 1);
    assert.deepEqual(lines(out, '.ck-tech summary'), ['Chi tiết kỹ thuật', 'Chi tiết kỹ thuật']);
    assert.equal(lines(out, '.ck-tech .got')[1], 'Kết quả: 312/498');
  } finally { dom.window.close(); }
});

test('the results tab says in one line when step 4 is not done', async () => {
  const { dom, doc, window } = step4Harness({ reviewStatsResult: (runId) => ({ ok: true, data: syntheticReviewStats(runId, 5) }) });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4, 'run list');
    (doc.querySelector('.tabs button[data-screen="result"]') as HTMLButtonElement).click();
    await waitFor(() => doc.querySelectorAll('#resultRunList button').length === 4, 'result run list');
    const resultLine = () => doc.getElementById('step4ResultLine');
    for (const [runId, text] of [
      ['run-running', 'Bước 4 đang chạy: 10 chủ đề bên dưới mới có một phần bình luận. Số liệu đủ khi bước 4 xong.'],
      ['run-fail', 'Bước 4 dừng giữa chừng: 10 chủ đề bên dưới mới có 312/498 bình luận. Mở «Chi tiết lịch sử lượt chạy» để chạy tiếp.'],
      ['run-old', 'Lượt cũ: chủ đề chỉ có cho những bình luận đã được gắn từ trước.'],
      ['run-pass', null],
    ] as const) {
      const button = [...doc.querySelectorAll<HTMLButtonElement>('#resultRunList button')]
        .find((candidate) => (candidate.title || '').includes(runId))!;
      button.click();
      await waitFor(() => window.document.querySelector('#resultDetail .dhead h2')?.textContent === 'Sản phẩm ' + runId &&
        (text === null ? !!doc.querySelector('#resultDetail .rv, #resultDetail article, #resultDetail section') : resultLine()?.textContent === text),
      'result line ' + runId);
      if (text === null) {
        await new Promise((resolve) => setTimeout(resolve, 30));
        assert.equal(resultLine(), null, 'no line once step 4 passed');
      }
    }
  } finally { dom.window.close(); }
});

test('run status chips: step 4 running or stopped wins over a DONE state, and «Hoàn tất» needs finished', async () => {
  const { dom, doc } = step4Harness({
    runsProgressResults: [progressReply([
      progressRun('run-running', ['PASS', 'PASS', 'PASS', 'RUNNING'], { active: { step: 4, stage: 'filter', done: 240, total: 531 } }),
      progressRun('run-fail', ['PASS', 'PASS', 'PASS', 'FAIL']),
      progressRun('run-pass', ['PASS', 'PASS', 'PASS', 'IDLE']),
      progressRun('run-old', ['PASS', 'PASS', 'PASS', 'NOT_APPLICABLE'], { finished: true }),
    ])],
  });
  try {
    const chip = (runId: string) => runListButton(doc, runId).querySelector('.chip')!.textContent;
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4 && chip('run-fail') === 'Bị lỗi', 'progress applied');
    assert.deepEqual(['run-running', 'run-fail', 'run-pass', 'run-old'].map(chip),
      ['Đang chạy', 'Bị lỗi', 'Đang chạy', 'Hoàn tất']);
    runListButton(doc, 'run-fail').click();
    await waitFor(() => doc.querySelector('#runDetail .dhead .chip')?.textContent === 'Bị lỗi', 'detail chip');
  } finally { dom.window.close(); }
});

test('the header status line shows the most recently changed active run, its pills and how many others run; click opens it', async () => {
  const { dom, doc } = step4Harness({
    runsProgressResults: [progressReply([
      progressRun('run-running', ['PASS', 'PASS', 'PASS', 'RUNNING'],
        { active: { step: 4, stage: 'filter', done: 240, total: 531 }, changedAt: '2026-11-16T08:59:40Z' }),
      progressRun('run-pass', ['PASS', 'PASS', 'RUNNING', 'IDLE'],
        { active: { step: 3, stage: null, done: 320, total: 1500 }, changedAt: '2026-11-16T08:50:00Z' }),
    ])],
  });
  try {
    const status = () => element<HTMLElement>(doc, 'runStatus');
    await waitFor(() => !status().hidden && !!doc.getElementById('runStatusLink'), 'status line');
    assert.equal(doc.querySelector('header .sub')!.textContent, '4 bước. Mỗi bước được kiểm tra xong mới sang bước sau.');
    assert.equal(element(doc, 'runStatusLink').textContent, 'Bước 4/4 Lưu và phân loại: đang lọc 240/531');
    assert.deepEqual(lines(status(), '.pill'), ['B1 ✓', 'B2 ✓', 'B3 ✓', 'B4 …']);
    assert.match(status().textContent || '', /Sản phẩm run-running:/);
    assert.match(status().textContent || '', /và 1 lượt khác đang chạy/);
    (doc.querySelector('.tabs button[data-screen="new"]') as HTMLButtonElement).click();
    element<HTMLAnchorElement>(doc, 'runStatusLink').click();
    await waitFor(() => !element<HTMLElement>(doc, 'scr-track').hidden &&
      (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-running') && !!step4Card(doc),
    'the run opens on its history with the step 4 card');
  } finally { dom.window.close(); }
});

test('a progress transition notifies once: never on the first poll, a Windows toast when not in front, an in-app notice when in front', async () => {
  const before = progressReply([
    progressRun('run-fail', ['PASS', 'PASS', 'PASS', 'RUNNING'], { active: { step: 4, stage: 'label', done: 312, total: 498 } }),
    progressRun('run-pass', ['PASS', 'PASS', 'PASS', 'NOT_APPLICABLE'], { finished: true }),
    progressRun('run-new', ['IDLE', 'IDLE', 'IDLE', 'IDLE']),
  ]);
  const after = progressReply([
    progressRun('run-fail', ['PASS', 'PASS', 'PASS', 'FAIL'], { changedAt: '2026-11-16T09:00:10Z' }),
    progressRun('run-pass', ['PASS', 'PASS', 'PASS', 'NOT_APPLICABLE'], { finished: true }),
    progressRun('run-new', ['RUNNING', 'IDLE', 'IDLE', 'IDLE'], { active: { step: 1, stage: null, done: null, total: null } }),
  ], '2026-11-16T09:00:15Z');
  const replies = [before, before, after];

  const background = step4Harness({ runsProgressResults: replies, hasFocus: false, fastProgress: true });
  try {
    await waitFor(() => background.state.runsProgressCalls >= 2, 'first two polls');
    assert.deepEqual(background.state.notifyCalls, [], 'nothing for the state seen at start');
    await waitFor(() => background.state.runsProgressCalls >= 6 && background.state.notifyCalls.length >= 2, 'later polls');
    assert.deepEqual(background.state.notifyCalls, [
      { title: 'Bước 4 dừng vì lỗi', body: 'Sản phẩm run-fail: Jev không trả lời sau 3 lần thử lại. Phần đã xong được giữ lại. Mở lượt để bấm «Chạy tiếp».' },
      { title: 'Lượt bắt đầu chạy', body: 'Lượt run-new: bước 1 Lấy số liệu bán hàng đã bắt đầu.' },
    ]);
    assert.equal(element(background.doc, 'noticeBox').children.length, 0, 'no in-app notice behind other windows');
  } finally { background.dom.window.close(); }

  const front = step4Harness({ runsProgressResults: replies, hasFocus: true, fastProgress: true });
  try {
    await waitFor(() => front.state.runsProgressCalls >= 6 && element(front.doc, 'noticeBox').children.length === 2, 'notices');
    assert.deepEqual(front.state.notifyCalls, [], 'no Windows toast while the window is in front');
    const notice = element(front.doc, 'noticeBox').firstElementChild as HTMLElement;
    assert.equal(notice.querySelector('b')!.textContent, 'Bước 4 dừng vì lỗi');
    assert.equal(notice.querySelector('.notice-go')!.textContent, 'Xem lượt');
    (notice.querySelector('.notice-close') as HTMLButtonElement).click();
    assert.equal(element(front.doc, 'noticeBox').children.length, 1, 'closing removes that notice');
  } finally { front.dom.window.close(); }
});

test('mock mode: each approved scenario shows its status line and fires its one notification within seconds', async () => {
  const expected: Record<string, [string, string | null]> = {
    s1run: ['Bước 1/4 Lấy số liệu bán hàng: đang lấy số liệu Metric', 'Lượt bắt đầu chạy'],
    s3run: ['Bước 3/4 Lấy bình luận: đang lấy 320/1.500', 'Bước 2 đạt'],
    running: ['Bước 4/4 Lưu và phân loại: đang lọc 240/531', 'Bước 3 đạt'],
    pass: ['Hoàn tất 4/4 bước · 498 bình luận đã gắn chủ đề', 'Lượt hoàn tất'],
    fail: ['Bước 4/4 Lưu và phân loại: dừng vì lỗi. Bấm để xem', 'Bước 4 dừng vì lỗi'],
    old: ['Không có lượt nào đang chạy', null],
  };
  for (const [scenario, [text, title]] of Object.entries(expected)) {
    const dom = new JSDOM(html, {
      url: 'file:///shopee-desktop/index.html?mock=1&s4=' + scenario, runScripts: 'dangerously',
      beforeParse(window) {
        window.document.hasFocus = () => true;
      },
    });
    const doc = dom.window.document;
    try {
      const shown = () => (doc.getElementById('runStatusLink') || doc.querySelector('#runStatus .st-idle'))?.textContent;
      await waitFor(() => shown() === text && (title === null || !!doc.querySelector('#noticeBox .notice')), 'status ' + scenario);
      await new Promise((resolve) => setTimeout(resolve, 80));
      assert.deepEqual(lines(doc.getElementById('noticeBox'), '.notice b'), title === null ? [] : [title], scenario);
      if (scenario === 's3run') {
        assert.match(doc.querySelector('#noticeBox .notice-body > div')!.textContent || '', /đã chọn 5 link bán chạy\. Bước 3 Lấy bình luận đã bắt đầu\./);
      }
    } finally { dom.window.close(); }
  }
});
