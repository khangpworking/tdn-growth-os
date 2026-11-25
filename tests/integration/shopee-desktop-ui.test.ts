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

/** The server's review-insights-v2 from a v1 view: each comment list becomes its size, buckets get their key. */
function insightBuckets(view: any, each: (key: string, bucket: any, put: (next: any) => void) => void): void {
  for (const source of view.sources || []) {
    each(source.sourceSha256 + ':all', source.all, (next) => { source.all = next; });
    for (const link of source.links || []) {
      each(source.sourceSha256 + ':' + link.shopId + '.' + link.itemId, link.insights, (next) => { link.insights = next; });
    }
  }
}
function insightsSummaryOf(v1: any): any {
  const view = clone(v1);
  view.format = 'review-insights-v2';
  insightBuckets(view, (key, bucket, put) => put({
    key, summary: bucket.summary, commentCount: (bucket.comments || []).length,
    themes: (bucket.themes || []).map(({ comments, ...theme }: any) => ({ ...theme, commentCount: (comments || []).length })),
  }));
  return view;
}
function insightCommentsOf(v1: any, bucketKey: string, theme: string | null): any[] | null {
  let found: any[] | null = null;
  insightBuckets(clone(v1), (key, bucket) => {
    if (key !== bucketKey || found) return;
    if (theme === null) { found = bucket.comments || []; return; }
    const match = (bucket.themes || []).find((item: any) => item.code === theme);
    if (match) found = match.comments || [];
  });
  return found;
}

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
  reviewDataHold?: (runId: string) => Promise<void> | undefined;
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
  statusError?: (runId: string) => any;
  reviewProcessResult?: (runId: string) => any;
  processReviewDataResult?: (runId: string, sourceSha256: string) => any;
  runsProgressResults?: any[];
  runsProgressFor?: (call: number) => any | Promise<any>;
  listRunsHold?: () => Promise<void> | undefined;
  listRunsError?: () => any;
  listRunsReply?: (call: number) => any | Promise<any> | undefined;
  libraryResult?: any;
  hasFocus?: boolean;
  runSortSaved?: string;
  oldServer?: boolean;      // run-view and the insights summary answer USAGE (a server before F647 wave 2)
  runViewHold?: (runId: string, result: boolean) => Promise<void> | undefined;   // a run-view answers when this settles
  reviewProcessHold?: () => Promise<void> | undefined;
  insightCommentsHold?: () => Promise<void> | undefined;
  insightCommentsError?: boolean;   // every comment read fails
  fastStep4?: boolean;              // the 10 s step 4 poll (a setTimeout) fires at once
  rememberRunSortHold?: (value: string) => Promise<void> | undefined;
  fastProgress?: boolean;
  fastPoll?: boolean;
  bridge?: 'complete' | 'partial';
  localShots?: Record<string, boolean>;
  localShotResult?: (runId: string) => any | Promise<any> | undefined;   // localMetricShot's own answer
  metricShotStateResult?: (runId: string) => any;
  viewShotResult?: (runId: string, sha256: string | null, oldKnown: boolean) => unknown;
  shotClock?: { now: number };
  saveShotResult?: (runId: string, name: string, sha256: string | null, online: boolean, oldKnown: boolean) => any;
  deleteRunResult?: (runId: string) => any;
  runViewCopy?: (runId: string) => any;     // the bridge's disk copy of a run's view (null: none)
  runViewCopyHold?: () => Promise<void> | undefined;   // the disk copy answers when this settles
  reviewDataError?: (runId: string) => any; // the review data read fails with this reply
  appBuild?: { version: string | null; dismissed?: string | null };   // the bridge's appVersion (none: USAGE)
  appLatestResult?: () => any;              // the bridge's appLatest reply (none: USAGE, an older server)
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
    openLocalShotCalls: string[];
    viewShotCalls: [string, string | null, boolean][];
    shotStateCalls: string[];
    shotStartCalls: string[];
    saveShotCalls: [string, string, string | null, boolean, boolean][];
    deleteRunCalls: string[];
    openLinkCalls: string[];
    reviewProcessCalls: string[];
    processReviewDataCalls: { runId: string; sourceSha256: string }[];
    runsProgressCalls: number;
    notifyCalls: { title: string; body: string }[];
    runSortSaved: string | null;
    runSortCalls: string[];
    runViewCalls: { runId: string; result: boolean }[];
    runViewMaxOut: number;    // the most run-view calls out at once
    runViewCachedCalls: string[];
    runViewJoins: boolean[];  // the `join` flag of each run-view call
    prefetchCalls: { runId: string; sig: string }[][];
    insightCommentCalls: { runId: string; bucket: string; theme: string | null }[];
    appLatestCalls: number;
    dismissCalls: string[];
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
    openLocalShotCalls: [],
    viewShotCalls: [],
    shotStateCalls: [],
    shotStartCalls: [],
    saveShotCalls: [],
    deleteRunCalls: [],
    openLinkCalls: [],
    reviewProcessCalls: [],
    processReviewDataCalls: [],
    runsProgressCalls: 0,
    notifyCalls: [],
    runSortSaved: options.runSortSaved || null,
    runSortCalls: [],
    runViewCalls: [],
    runViewMaxOut: 0,
    runViewCachedCalls: [],
    runViewJoins: [],
    prefetchCalls: [],
    insightCommentCalls: [],
    appLatestCalls: 0,
    dismissCalls: [],
  };
  let runViewOut = 0;
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
    lastRunSort: async () => ({ ok: true, data: { runSort: state.runSortSaved } }),
    rememberRunSort: async (value: string) => {
      state.runSortCalls.push(value);
      const held = options.rememberRunSortHold && options.rememberRunSortHold(value);
      if (held) await held;
      state.runSortSaved = value;
      return { ok: true, data: { runSort: value } };
    },
    presets: async () => {
      state.presetsCalls++;
      return { ok: true, data: { format: 'presets-v1', presets: state.presets.slice() } };
    },
    listRuns: async () => {
      state.listRunsCalls++;
      if (options.listRunsGate && state.flowCalls.length > 0) await options.listRunsGate.promise;
      const hold = options.listRunsHold && options.listRunsHold();
      if (hold) await hold;
      const failure = options.listRunsError && options.listRunsError();
      if (failure) return clone(failure);
      const own = options.listRunsReply && await options.listRunsReply(state.listRunsCalls);
      if (own) return clone(own);
      return { ok: true, data: { format: 'runs-v1', runs: state.runsView.slice() } };
    },
    library: async () => clone(options.libraryResult || ({ ok: true, data: { format: 'library-v1', modules: {}, skills: [] } })),
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
      const failure = options.statusError && options.statusError(runId);
      if (failure) return clone(failure);
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
    localMetricShot: async (runId: string) => {
      const own = options.localShotResult && await options.localShotResult(runId);
      return own || { ok: true,
        data: { format: 'local-metric-shot-v1', runId, exists: !!(options.localShots && options.localShots[runId]) } };
    },
    openLocalMetricShot: async (runId: string) => {
      state.openLocalShotCalls.push(runId);
      return { ok: true, data: { format: 'local-metric-shot-open-v1', runId, opened: true } };
    },
    metricShotState: async (runId: string) => {
      state.shotStateCalls.push(runId);
      return options.metricShotStateResult ? options.metricShotStateResult(runId)
        : { ok: true, data: { format: 'metric-shot-state-v1', runId,
          local: !!options.localShots?.[runId], state: null, uploading: false } };
    },
    viewMetricShot: async (runId: string, sha256: string | null, oldKnown: boolean) => {
      state.viewShotCalls.push([runId, sha256, oldKnown]);
      if (options.viewShotResult) return options.viewShotResult(runId, sha256, oldKnown);
      if (options.localShots?.[runId]) return { ok: true, data: { format: 'metric-shot-open-v1', runId,
        state: 'LOCAL', src: 'data:image/webp;base64,c3ludGhldGlj' } };
      if (sha256) return { ok: true, data: { format: 'module-evidence-open-v1', runId, kind: 'full-page', sha256, opened: true } };
      return { ok: true, data: { format: 'metric-shot-open-v1', runId, state: 'NOT_UPLOADED' } };
    },
    uploadMetricShot: async (runId: string) => {
      state.shotStartCalls.push(runId);
      return { ok: true, data: { format: 'metric-shot-upload-start-v1', runId, started: false } };
    },
    saveMetricShot: async (runId: string, name: string, sha256: string | null, online: boolean, oldKnown: boolean) => {
      state.saveShotCalls.push([runId, name, sha256, online, oldKnown]);
      if (options.saveShotResult) return options.saveShotResult(runId, name, sha256, online, oldKnown);
      return { ok: true, data: { format: 'metric-shot-save-v1', runId, saved: true, cancelled: false, fileName: 'a.png' } };
    },
    deleteRun: async (runId: string) => {
      state.deleteRunCalls.push(runId);
      const res = options.deleteRunResult
        ? options.deleteRunResult(runId)
        : { ok: true, data: { format: 'run-delete-v1', runId, deleted: true, localShotDeleted: true } };
      if (res.ok) state.runsView = state.runsView.filter((run: any) => run.runId !== runId);
      return res;
    },
    openShopeeLink: async (url: string) => {
      state.openLinkCalls.push(url);
      return { ok: true, data: { opened: true } };
    },
    reviewProcess: async (runId: string) => {
      state.reviewProcessCalls.push(runId);
      const held = options.reviewProcessHold && options.reviewProcessHold();
      if (held) await held;
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
      if (options.runsProgressFor) return clone(await options.runsProgressFor(state.runsProgressCalls));
      const replies = options.runsProgressResults;
      if (!replies) return { ok: true, data: { format: 'runs-progress-v1', generatedAt: '2026-11-16T09:00:00Z', runs: [] } };
      const reply = clone(replies[Math.min(state.runsProgressCalls - 1, replies.length - 1)]);
      if (reply.ok) reply.data.runs = reply.data.runs.filter((run: any) => !state.deleteRunCalls.includes(run.runId));
      return reply;
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
    // F647 wave 2, built from the single answers above (so their counters and holds still apply).
    reviewInsightsSummary: async (runId: string) => {
      if (options.oldServer) return { ok: false, error: { code: 'USAGE', message: 'USAGE' } };
      const v1: any = await api.reviewInsights(runId);
      return v1.ok ? { ok: true, data: insightsSummaryOf(v1.data) } : v1;
    },
    reviewInsightComments: async (runId: string, bucket: string, theme: string | null) => {
      state.insightCommentCalls.push({ runId, bucket, theme });
      const held = options.insightCommentsHold && options.insightCommentsHold();
      if (held) await held;
      if (options.insightCommentsError) return { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } };
      const v1: any = await api.reviewInsights(runId);
      const comments = v1.ok ? insightCommentsOf(v1.data, bucket, theme) : null;
      return comments ? { ok: true, data: { format: 'review-insight-comments-v1', bucket, theme, comments } }
        : { ok: false, error: { code: 'REVIEW_DATA_INVALID', message: 'REVIEW_DATA_INVALID' } };
    },
    runViewCached: async (runId: string) => {
      state.runViewCachedCalls.push(runId);
      const copyHeld = options.runViewCopyHold && options.runViewCopyHold();
      if (copyHeld) await copyHeld;
      const copy = options.runViewCopy ? options.runViewCopy(runId) : null;
      return { ok: true, data: copy ? clone(copy) : null };
    },
    appVersion: async () => (options.appBuild ? { ok: true, data: { commit: 'abc1234', dismissed: null, ...options.appBuild } }
      : { ok: false, error: { code: 'USAGE', message: 'USAGE' } }),
    appLatest: async () => {
      state.appLatestCalls += 1;
      return options.appLatestResult ? clone(options.appLatestResult()) : { ok: false, error: { code: 'USAGE', message: 'USAGE' } };
    },
    dismissAppUpdate: async (version: string) => {
      state.dismissCalls.push(version);
      return { ok: true, data: { dismissed: version } };
    },
    prefetchRunViews: async (rows: { runId: string; sig: string }[]) => {
      state.prefetchCalls.push(clone(rows));
      return { ok: true, data: { format: 'run-view-prefetch-v1', queued: rows.length } };
    },
    runView: async (runId: string, result: boolean, join?: boolean) => {
      state.runViewCalls.push({ runId, result });
      state.runViewJoins.push(!!join);
      const held = options.runViewHold && options.runViewHold(runId, result);
      if (options.oldServer) {
        if (held) await held;
        return { ok: false, error: { code: 'USAGE', message: 'USAGE' } };
      }
      const single: Record<string, (id: string) => Promise<any>> = {
        info: api.status, sampling: api.reviewSampling, reviewData: api.reviewData, outputs: api.moduleOutputs,
        process: api.reviewProcess, stats: api.reviewStats, insights: api.reviewInsightsSummary,
      };
      const names = ['info', 'sampling', 'reviewData', 'outputs', 'process', ...(result ? ['stats', 'insights'] : [])];
      runViewOut += 1;
      state.runViewMaxOut = Math.max(state.runViewMaxOut, runViewOut);
      const replies = await Promise.all(names.map((name) => single[name]!(runId)))
        .then(async (answered) => { if (held) await held; return answered; })
        .finally(() => { runViewOut -= 1; });
      if (!replies[0].ok) return replies[0];
      const parts: Record<string, any> = {};
      names.forEach((name, index) => { parts[name] = replies[index]; });
      return { ok: true, data: { format: 'run-view-v1', runId, parts } };
    },
    runFlow: async (runId: string) => {
      state.flowCalls.push(runId);
      if (options.runFlowGate) await options.runFlowGate.promise;
      return options.runFlowResult || { ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } };
    },
    reviewData: async (runId: string) => {
      state.reviewDataCalls++;
      state.reviewDataCallsByRun[runId] = (state.reviewDataCallsByRun[runId] || 0) + 1;
      const held = options.reviewDataHold && options.reviewDataHold(runId);
      if (held) await held;
      const failure = options.reviewDataError && options.reviewDataError(runId);
      if (failure) return clone(failure);
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
  const shotTimers = new Map<number, { at: number; fire: () => void }>();
  let nextShotTimer = -1;
  const dom = new JSDOM(html, {
    url: 'file:///shopee-desktop/index.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      (window as any).pywebview = { api: options.bridge === 'partial' ? {} : api };
      if (options.shotClock) {
        const clock = options.shotClock;
        window.Date.now = () => clock.now;
        const nativeSetTimeout = window.setTimeout.bind(window);
        const nativeClearTimeout = window.clearTimeout.bind(window);
        window.setTimeout = (handler: any, delay = 0, ...args: any[]) => {
          if (delay < 3000) return nativeSetTimeout(handler, delay, ...args);
          const id = nextShotTimer--;
          shotTimers.set(id, { at: clock.now + delay, fire: () => handler(...args) });
          return id;
        };
        window.clearTimeout = (id) => {
          if (id !== undefined && !shotTimers.delete(id)) nativeClearTimeout(id);
        };
      }
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
      if (options.fastStep4) {
        const innerSetTimeout = window.setTimeout.bind(window);
        (window as any).setTimeout = (handler: any, delay?: number, ...args: any[]) =>
          innerSetTimeout(handler, delay === 10000 ? 25 : delay, ...args);
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
  const advanceShotTime = (ms: number) => {
    assert.ok(options.shotClock);
    options.shotClock.now += ms;
    for (const [id, timer] of shotTimers) {
      if (timer.at > options.shotClock.now) continue;
      shotTimers.delete(id);
      timer.fire();
    }
  };
  return { dom, doc: dom.window.document, window: dom.window, state, api, advanceShotTime };
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
        // A status failure that is not RUN_NOT_FOUND (that one means the run is gone).
        ...(info ? { runInfoByRun: { [runId]: info } }
          : { statusError: () => ({ ok: false, error: { code: 'REMOTE_OUTPUT_INVALID', message: 'REMOTE_OUTPUT_INVALID' } }) }),
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

  for (const status of ['FAILED', 'STOPPED']) {
    const failedInfo: any = syntheticRunInfo();
    failedInfo.state = { status, module: 'M3', errorCode: 'RUN_INTERRUPTED' };
    const failed = harness({
      runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status }],
      runInfo: failedInfo, sampling: syntheticSampling(),
    });
    try {
      await waitFor(() => failed.doc.getElementById('techDetails') !== null, status + ' detail');
      assert.equal((failed.doc.getElementById('techDetails') as HTMLDetailsElement).open, true,
        status + ' opens the step section');
      const notice = failed.doc.querySelector<HTMLElement>('#runDetail > .local-error');
      assert.ok(notice, status + ' keeps the failure notice');
      assert.equal(notice.title, 'RUN_INTERRUPTED');
      assert.ok(notice.textContent?.trim(), status + ' explains why work stopped');
    } finally { failed.dom.window.close(); }
  }
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
      { runId: 'run-stopped', product: 'Sản phẩm đã dừng', status: 'STOPPED', request: configuredRequest },
      { runId: 'run-owner', product: 'Sản phẩm chờ', status: 'WAIT_OWNER', request: { format: 'request-v1', reviewCapPerLink: 300 } },
    ],
    runInfoByRun: {
      'run-idle': syntheticRunInfo('run-idle'), 'run-failed': syntheticRunInfo('run-failed'),
      'run-owner': syntheticRunInfo('run-owner'),
      'run-stopped': syntheticRunInfo('run-stopped'),
    },
    runsProgressResults: [progressReply([
      progressRun('run-stopped', ['PASS', 'PASS', 'FAIL', 'IDLE']),
    ])],
  });
  try {
    await waitFor(() => result.doc.querySelectorAll('#runList .runbtn').length === 4 &&
      result.state.runsProgressCalls > 0, 'run list and stopped progress');
    assert.match(runListButton(result.doc, 'run-failed').textContent!, /Tối đa 500 mỗi link/);
    assert.match(runListButton(result.doc, 'run-owner').textContent!, /Tối đa 300 mỗi link/);
    assert.deepEqual(result.state.statusCalls, ['run-idle'],
      'only the initially selected run is read; list metadata comes from the saved request');
    const filter = element<HTMLSelectElement>(result.doc, 'runFilter');
    const labels = [...filter.options].map((option) => option.textContent);
    assert.ok(labels.includes('Bị lỗi'), 'the actual failure state is selectable');
    assert.ok(labels.includes('Cần bạn xử lý'), 'the needs-user state is selectable');
    assert.ok(labels.includes('Đã dừng'), 'the stopped state is selectable');
    assert.equal(runListButton(result.doc, 'run-stopped').querySelector('.chip')?.textContent, 'Đã dừng',
      'a stopped collection keeps its run status');

    filter.value = 'stopped';
    fire(result.window, filter, 'change');
    await waitFor(() => result.doc.querySelectorAll('#runList .runbtn').length === 1, 'stopped filter');
    assert.match(runListButton(result.doc, 'run-stopped').title, /run-stopped/);

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
    assert.equal(element(doc, 'moM1FullPage').textContent, 'Xem ảnh Metric');
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
    await waitFor(() => state.viewShotCalls.length === 1, 'evidence open');
    assert.deepEqual(state.viewShotCalls, [['run-synthetic', 'a'.repeat(64), true]], 'the bridge gets the known old picture digest');
    assert.deepEqual(state.openEvidenceCalls, []);
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
      'Có thể trùng với sản phẩm đã chọn, chưa chắc chắn nên bỏ qua.',
      'Không đọc được mã sản phẩm nên bỏ qua.']);
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
    oldServer: true,      // single calls: run A's detail shows while its outputs are still on their way
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
      assert.equal(line.querySelector('.cl')!.textContent, 'Metric trả sản phẩm theo doanh thu giảm dần');
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
  const insights = (sourceSha256: string) => ({ format: 'review-insights-v1', runId, codebookVersion: 'synthetic', sources: [{
    sourceSha256, kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z',
    all: { summary: { status: 'EMPTY', text: null, model: null, generatedAt: null }, themes: [], comments: sample }, links: [] }] });
  const open = async (insightsSource: string) => {
    const opened = harness({
      runs: [{ runId, product: 'Sản phẩm tổng hợp', status: 'DONE' }],
      runInfoByRun: { [runId]: syntheticRunInfo(runId) },
      moduleOutputsResult: (id) => ({ ok: true, data: moduleOutputView(id) }),
      reviewStatsResult: () => ({ ok: true, data: syntheticReviewStats(runId, 1234) }),
      reviewInsightsResult: () => ({ ok: true, data: insights(insightsSource) }),
    });
    const { doc } = opened;
    await waitFor(() => doc.querySelectorAll('#runList button').length === 1, 'run list');
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();
    await waitFor(() => doc.querySelectorAll('#resultRunList button').length === 1, 'result run list');
    doc.querySelector<HTMLButtonElement>('#resultRunList button')!.click();
    await waitFor(() => doc.getElementById('resultCommentDownload') !== null &&
      [...doc.querySelectorAll<HTMLElement>('.refresh-mark')].every((mark) => mark.hidden), 'comment download, no read out');
    return opened;
  };

  const { doc, state } = await open('c'.repeat(64));
  try {
    const card = element(doc, 'resultCommentDrilldown');
    assert.equal(card.querySelector('h3')!.textContent, 'Chi tiết bình luận');
    assert.equal(element(doc, 'resultCommentDownload').textContent, 'Tải 1.234 bình luận (JSON)', 'the collected total, not the 200 sample');
    assert.equal(element<HTMLButtonElement>(doc, 'resultCommentDownload').disabled, false);
    assert.doesNotMatch(card.textContent || '', /bình luận mẫu/);
    assert.equal(card.querySelector('details'), null, 'no on-screen sample list');
    element<HTMLButtonElement>(doc, 'resultCommentDownload').click();
    await waitFor(() => (element(doc, 'resultCommentDownloadNote').textContent || '').startsWith('Đã lưu'), 'saved note');
    assert.deepEqual(state.exportReviewFilesCalls.at(-1), { runId, input: { sourceSha256: 'c'.repeat(64), formats: ['labelled-json'] } });
    assert.equal(element(doc, 'resultCommentDownloadNote').textContent, 'Đã lưu “shopee-run-synthetic.labelled-json”.');
  } finally { doc.defaultView!.close(); }

  // The shown result has no matching numbers: the size is unknown, so nothing can be downloaded.
  const unknown = await open('d'.repeat(64));
  try {
    const button = element<HTMLButtonElement>(unknown.doc, 'resultCommentDownload');
    assert.deepEqual([button.disabled, button.textContent], [true, 'Tải bình luận (JSON)']);
    assert.equal(element(unknown.doc, 'resultCommentDownloadNote').textContent, 'Chưa có số bình luận, thử tải lại trang kết quả.');
    button.click();
    assert.equal(unknown.state.exportReviewFilesCalls.length, 0);
  } finally { unknown.doc.defaultView!.close(); }
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
    assert.equal(doc.getElementById('resultAiSummary'), null, 'app 1.3.3: no «AI Tóm tắt» card');
    assert.equal(doc.getElementById('resultThemeTags'), null, 'app 1.3.3: no «10 nhãn chủ đề» card');
    assert.notEqual(doc.getElementById('resultCommentDrilldown'), null, 'the comment download stays');

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
    assert.match(element<HTMLElement>(doc, 'reviewSummary').textContent!, /Đánh giá 2 và 3 sao · tối đa 12 trang mỗi link/);

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
    assert.match(element<HTMLElement>(back.doc, 'reviewSummary').textContent!, /Lấy tất cả bình luận · tối đa 300 mỗi link/);
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
      ['Cách lấy bình luận', 'Lấy tất cả bình luận · tối đa 10 trang mỗi link']);
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
    await waitFor(() => doc.querySelectorAll('#runList .runbtn').length === 11, 'created run listed (10 seeded, F656 v3 sample included)');
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

  for (const status of ['FAILED', 'STOPPED']) {
    const runId = 'run-resumable';
    const info: any = collectedRunInfo(runId);
    info.state = { status: 'STOPPED', module: 'M3', errorCode: 'RUN_INTERRUPTED' };
    info.execution = { format: 'run-execution-view-v1', revision: 1, status,
      currentModule: 'M3', currentExecutionId: 'exec-resumable',
      modules: { M3: { status: 'FAILED', errorCode: 'RUN_INTERRUPTED', currentGate: null } } };
    const run = harness({
      runs: [{ runId, product: 'Sản phẩm đã dừng', status, execution: info.execution }],
      runInfo: info,
      reviewProcessResult: (id) => reviewProcessReply(id, 'FAIL'),
    });
    try {
      await waitFor(() => run.doc.getElementById('s4Resume') !== null, status + ' resumable detail');
      const resume = element<HTMLButtonElement>(run.doc, 's4Resume');
      assert.equal(resume.disabled, false, status + ' keeps «Chạy tiếp» enabled');
      assert.match(step4Card(run.doc).textContent || '', /Phần đã xong được giữ lại/,
        status + ' keeps the failure explanation');
      assert.equal(run.doc.querySelector<HTMLElement>('#runDetail > .local-error')?.title, 'RUN_INTERRUPTED',
        status + ' keeps the run failure notice');
      resume.click();
      await waitFor(() => run.state.processReviewDataCalls.length === 1, status + ' resume sent');
      assert.deepEqual(run.state.processReviewDataCalls, [{ runId, sourceSha256: STEP4_SHA }]);
    } finally { run.dom.window.close(); }
  }
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

// Owner 25/11 (app 1.3.0): the window allows text selection; controls stay non-selectable.
// | rendered element                                      | user-select   |
// |-------------------------------------------------------|---------------|
// | button, tab, summary, status chip, step chip (.seqch) | none          |
// | heading, lead text, check heading in the log, input   | not none      |
test('controls are not selectable while text and inputs are', async () => {
  const { dom, doc } = step4Harness();
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 4, 'run list');
    runListButton(doc, 'run-fail').click();
    await waitFor(() => !!step4Card(doc)?.querySelector('#s4Resume') && doc.querySelectorAll('#techDetails .seqch').length > 0,
      'run view with step chips');
    const style = (el: Element) => dom.window.getComputedStyle(el).userSelect;
    for (const selector of ['button', '[role="tab"]', 'summary', '.chip', '.seqch']) {
      const found = [...doc.querySelectorAll(selector)];
      assert.ok(found.length > 0, selector + ' is rendered');
      assert.deepEqual([...new Set(found.map(style))], ['none'], selector);
    }
    for (const el of [doc.querySelector('h1'), doc.querySelector('p.lead'), doc.querySelector('#techDetails article.gate h3'), doc.querySelector('input')]) {
      assert.ok(el, 'text element rendered');
      assert.notEqual(style(el!), 'none', el!.outerHTML.slice(0, 60));
    }
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
      ['run-running', 'Bước 4 đang chạy: mới gắn chủ đề cho một phần bình luận. Số liệu đủ khi bước 4 xong.'],
      ['run-fail', 'Bước 4 dừng giữa chừng: mới gắn chủ đề cho 312/498 bình luận. Mở «Chi tiết lịch sử lượt chạy» để chạy tiếp.'],
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

// | progress (run state DONE)                         | chip        |
// |---------------------------------------------------|-------------|
// | step 3 RUNNING                                    | Đang chạy   |
// | step 4 RUNNING                                    | Đang chạy   |
// | step 4 IDLE but an active step (M3 -> 4 handoff)  | Đang chạy   |
// | finished                                          | Hoàn tất    |
// | step 4 FAIL                                       | Bị lỗi      |
// | M1, M2 PASS, nothing active, not finished         | Chưa xong   |
// | M1-M3 PASS, step 4 IDLE, nothing active           | Chưa xong   |
const CHIP_ROWS: [string, string[], any, string][] = [
  ['step 3 running', ['PASS', 'PASS', 'RUNNING', 'IDLE'], { active: { step: 3, stage: null, done: 320, total: 1500 } }, 'Đang chạy'],
  ['step 4 running', ['PASS', 'PASS', 'PASS', 'RUNNING'], { active: { step: 4, stage: 'filter', done: 240, total: 531 } }, 'Đang chạy'],
  ['step 4 handoff', ['PASS', 'PASS', 'PASS', 'IDLE'], { active: { step: 4, stage: null, done: null, total: null } }, 'Đang chạy'],
  ['finished', ['PASS', 'PASS', 'PASS', 'PASS'], { finished: true }, 'Hoàn tất'],
  ['step 4 failed', ['PASS', 'PASS', 'PASS', 'FAIL'], {}, 'Bị lỗi'],
  ['stopped after step 2', ['PASS', 'PASS', 'IDLE', 'IDLE'], {}, 'Chưa xong'],
  ['stopped after step 3', ['PASS', 'PASS', 'PASS', 'IDLE'], {}, 'Chưa xong'],
];

test('run status chips: «Đang chạy» only while a step runs; a run stopped part-way is «Chưa xong» and has its filter', async () => {
  const ids = Object.keys(STEP4_RUN_KINDS);
  for (let start = 0; start < CHIP_ROWS.length; start += ids.length) {
    const rows = CHIP_ROWS.slice(start, start + ids.length);
    const { dom, doc, window } = step4Harness({
      runsProgressResults: [progressReply(rows.map(([, steps, extra], k) => progressRun(ids[k]!, steps, extra)))],
    });
    try {
      const chip = (runId: string) => runListButton(doc, runId).querySelector('.chip')!.textContent;
      const first = rows[0]!;
      await waitFor(() => doc.querySelectorAll('#runList button').length === 4 && chip(ids[0]!) === first[3], 'progress applied');
      rows.forEach(([label, , , expected], k) => assert.equal(chip(ids[k]!), expected, label));
      const unfinished = rows.map(([, , , expected], k) => expected === 'Chưa xong' ? ids[k] : null).filter(Boolean);
      const filter = element<HTMLSelectElement>(doc, 'runFilter');
      assert.ok([...filter.options].some((option) => option.value === 'unfinished' && option.textContent === 'Chưa xong'));
      filter.value = 'unfinished';
      fire(window, filter, 'change');
      await waitFor(() => doc.querySelectorAll('#runList .runbtn').length === unfinished.length, 'unfinished filter');
      for (const runId of unfinished) assert.ok(runListButton(doc, runId!), runId + ' found by «Chưa xong»');
    } finally { dom.window.close(); }
  }
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
  // The server lists every run its progress has (a run missing from a later list counts as deleted).
  const runs = ['run-running', 'run-pass', 'run-fail', 'run-old', 'run-new']
    .map((runId) => ({ runId, product: 'Sản phẩm ' + runId, status: 'DONE' }));

  const background = step4Harness({ runs, runsProgressResults: replies, hasFocus: false, fastProgress: true });
  try {
    await waitFor(() => background.state.runsProgressCalls >= 2, 'first two polls');
    assert.deepEqual(background.state.notifyCalls, [], 'nothing for the state seen at start');
    await waitFor(() => background.state.runsProgressCalls >= 6 && background.state.notifyCalls.length >= 2, 'later polls');
    assert.deepEqual(background.state.notifyCalls, [
      { title: 'Bước 4 dừng vì lỗi', body: 'Sản phẩm run-fail: Jev không trả lời sau 3 lần thử lại. Phần đã xong được giữ lại. Mở lượt để bấm «Chạy tiếp».' },
      { title: 'Lượt bắt đầu chạy', body: 'Sản phẩm run-new: bước 1 Lấy số liệu bán hàng đã bắt đầu.' },
    ]);
    assert.equal(element(background.doc, 'noticeBox').children.length, 0, 'no in-app notice behind other windows');
  } finally { background.dom.window.close(); }

  const front = step4Harness({ runs, runsProgressResults: replies, hasFocus: true, fastProgress: true });
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

test('the technical-docs tab shows the 4-step guide from modules.json first, then each module with its gate checks', async () => {
  const root = new URL('../../skills/', import.meta.url);
  const modules = JSON.parse(await readFile(new URL('tdn-shopee-flow/modules.json', root), 'utf8'));
  const skills = await Promise.all([modules.flow, ...modules.modules].map(async (m: any) => ({
    name: m.skill, version: m.skillVersion, text: await readFile(new URL(`${m.skill}/SKILL.md`, root), 'utf8') })));
  const { dom, doc, state } = harness({ libraryResult: { ok: true, data: { format: 'library-v1', modules, skills } } });
  try {
    await waitFor(() => state.listRunsCalls > 0, 'connected');
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][3]!.click();
    await waitFor(() => doc.querySelectorAll('#libBody .libcard').length === 1 + modules.modules.length, 'library cards');
    const cards = [...doc.querySelectorAll('#libBody .libcard')];
    assert.equal(cards[0]!.querySelector('h2')!.textContent, 'Cả 4 bước (tdn-shopee-4-buoc)');
    assert.equal(cards[0]!.querySelector('pre')!.textContent, skills[0]!.text);
    const m2 = cards[1 + modules.modules.findIndex((m: any) => m.id === 'M2')]!;
    assert.deepEqual([...m2.querySelectorAll('.chklist code')].map((c) => c.textContent).slice(0, 2),
      ['links_match_source_order', 'requested_distinct_products']);
  } finally { dom.window.close(); }
});

// Dead Shopee links (CONTRACT-link-check §5-6): module-outputs-v1 `linkIssues`, one contract table.
// Step 3 shows ALL m3 issues of the run, one group per attempt, newest first, labelled with the
// attempt end time; it is not tied to the review source on display.
// | case                                   | sources       | m3 linkIssues | step 3 groups                     | latest M3 attempt           | visible step 3 chip  | M3 gate chip         |
// |----------------------------------------|---------------|---------------|-----------------------------------|-----------------------------|----------------------|----------------------|
// | a. clean then partial (latest partial) | first, second | second        | 12:00: link 5                     | PASS, links_skipped 1       | Xong, có link bị bỏ  | Xong, có link bị bỏ  |
// | a2. partial then clean (latest clean)  | first, second | first         | 11:00: link 4                     | PASS, links_skipped 0       | Đạt kiểm tra dữ liệu | Đạt kiểm tra dữ liệu |
// | b. two partial attempts                | first, second | first, second | 12:00: link 5; then 11:00: link 4 | PASS, links_skipped 1       | Xong, có link bị bỏ  | Xong, có link bị bỏ  |
// | c. stopped attempt, no source for it   | first (clean) | stopped       | 13:00: link 6                     | FAILED on session, FAIL gate| Đạt kiểm tra dữ liệu | Không đạt            |
// | old run                                | first, second | absent        | none                              | PASS, links_skipped 0       | Đạt kiểm tra dữ liệu | Đạt kiểm tra dữ liệu |
// | d. partial source shown, new attempt   | first, second | second        | 12:00: link 5                     | RUNNING, no gate yet        | Xong, có link bị bỏ  | Chưa kiểm tra        |
// | e. no-text link skipped                 | no-text       | no-text       | 14:00: link 7                     | PASS, links_skipped 1       | Xong, có link bị bỏ  | Xong, có link bị bỏ  |
// The visible chip follows the displayed source's own attempt (second = latest completed), never the current gate.
// Every case with linkIssues also has the 3 m2 items (3 reasons; «đã thay bằng link khác» only with replacedBy).
const DEAD = (n: number) => `https://shopee.vn/product/900/${n}`;
const linkIssue = (n: number, stage: string, reason: string, extra: any = {}) =>
  ({ stage, productBaseId: `1__${n}__900`, url: DEAD(n), reason, at: '2026-11-18T05:30:00Z', replacedBy: null,
    attemptId: null, ...extra });
const M2_ISSUES = [
  linkIssue(1, 'm2', 'PRODUCT_UNAVAILABLE', { replacedBy: '1__500__900' }),
  linkIssue(2, 'm2', 'RATINGS_MISSING'),
  linkIssue(3, 'm2', 'NO_TARGET_STAR_REVIEWS', { replacedBy: '1__501__900' }),
];
const M2_LINES = [
  { url: DEAD(1), text: 'Sản phẩm không còn trên Shopee, đã thay bằng link khác' },
  { url: DEAD(2), text: 'Trang sản phẩm không có phần đánh giá' },
  { url: DEAD(3), text: 'Không có đánh giá ở các mức sao cần lấy, đã thay bằng link khác' },
];
const FIRST_ISSUE = linkIssue(4, 'm3', 'PRODUCT_UNAVAILABLE', { attemptId: 'attempt-first', at: '2026-11-18T04:00:00Z' });
const SECOND_ISSUE = linkIssue(5, 'm3', 'RATINGS_MISSING', { attemptId: 'attempt-second', at: '2026-11-18T05:00:00Z' });
const STOPPED_ISSUE = linkIssue(6, 'm3', 'PRODUCT_UNAVAILABLE', { attemptId: 'attempt-stopped', at: '2026-11-18T06:00:00Z' });
const FIRST_GROUP = { label: 'Lần thu lúc 11:00 ngày 18/11/2026', lines: [{ url: DEAD(4), text: 'Sản phẩm không còn trên Shopee' }] };
const SECOND_GROUP = { label: 'Lần thu lúc 12:00 ngày 18/11/2026', lines: [{ url: DEAD(5), text: 'Trang sản phẩm không có phần đánh giá' }] };
const STOPPED_GROUP = { label: 'Lần thu lúc 13:00 ngày 18/11/2026', lines: [{ url: DEAD(6), text: 'Sản phẩm không còn trên Shopee' }] };
const NO_TEXT_ISSUE = linkIssue(7, 'm3', 'NO_TEXT_REVIEWS', { attemptId: 'attempt-no-text', at: '2026-11-18T07:00:00Z' });
const NO_TEXT_GROUP = { label: 'Lần thu lúc 14:00 ngày 18/11/2026', lines: [{ url: DEAD(7), text: 'Không có bình luận có chữ trong phạm vi thu' }] };

const lineOf = (li: Element) => ({
  url: li.querySelector('a')?.getAttribute('href') ?? null,
  text: li.querySelector('.link-issue-reason')!.textContent,
});
const m2Lines = (doc: Document) => [...doc.querySelectorAll('#linkIssues-m2 li')].map(lineOf);
const m3Groups = (doc: Document) => [...doc.querySelectorAll('#linkIssues-m3 .link-issue-group')].map((group) => ({
  label: group.querySelector('.link-issue-when')!.textContent,
  lines: [...group.querySelectorAll('li')].map(lineOf),
}));

function withM3Gate(info: any, skipped: number, stopped = false, running = false) {
  const errorCode = stopped ? 'HUMAN_LOGIN_REQUIRED' : null;
  const gate = running ? null : { ...passSlip('M3'), verdict: stopped ? 'FAIL' : 'PASS', errorCode,
    checks: [{ id: 'links_skipped', ok: skipped === 0, level: 'warn', got: skipped }] };
  info.modules = info.modules.map((module: any) => module.id === 'M3' ? { ...module, execution: {
    status: running ? 'RUNNING' : stopped ? 'FAILED' : 'SUCCEEDED', executionId: 'exec-3', sequence: 3,
    attemptId: running ? 'attempt-third' : null, startedAt: null, endedAt: null, basis: 'none',
    currentGate: gate, historicalGate: null, errorCode,
  } } : module);
  return info;
}

test('dead links: «Link bị bỏ» for step 2 and every step 3 attempt, newest first; old runs unchanged; new texts', async () => {
  const source = (attemptId: string, sha: string, completedAt: string, rowCount: number) =>
    syntheticReviewSource({ attemptId, sourceSha256: sha.repeat(64), completedAt, rowCount });
  const first = source('attempt-first', 'd', '2026-11-18T04:00:00.000Z', 7);
  const second = source('attempt-second', 'e', '2026-11-18T05:00:00.000Z', 9);
  const rows: { label: string; sources: any[]; m3?: any[]; skipped: number; stopped?: boolean; running?: boolean; groups: any[];
    chip: string; chipCls: string; verdict: string }[] = [
    { label: 'a. latest attempt partial', sources: [first, second], m3: [SECOND_ISSUE], skipped: 1,
      groups: [SECOND_GROUP], chip: 'Xong, có link bị bỏ', chipCls: 's-warn', verdict: 'Xong, có link bị bỏ' },
    { label: 'a2. latest attempt clean', sources: [first, second], m3: [FIRST_ISSUE], skipped: 0,
      groups: [FIRST_GROUP], chip: 'Đạt kiểm tra dữ liệu', chipCls: 's-pass', verdict: 'Đạt kiểm tra dữ liệu' },
    { label: 'b. two partial attempts', sources: [first, second], m3: [FIRST_ISSUE, SECOND_ISSUE], skipped: 1,
      groups: [SECOND_GROUP, FIRST_GROUP], chip: 'Xong, có link bị bỏ', chipCls: 's-warn', verdict: 'Xong, có link bị bỏ' },
    { label: 'c. stopped attempt without a source', sources: [first], m3: [STOPPED_ISSUE], skipped: 1, stopped: true,
      groups: [STOPPED_GROUP], chip: 'Đạt kiểm tra dữ liệu', chipCls: 's-pass', verdict: 'Không đạt' },
    { label: 'old run', sources: [first, second], skipped: 0, groups: [], chip: 'Đạt kiểm tra dữ liệu',
      chipCls: 's-pass', verdict: 'Đạt kiểm tra dữ liệu' },
    { label: 'd. partial source shown while a new attempt runs', sources: [first, second], m3: [SECOND_ISSUE], skipped: 0,
      running: true, groups: [SECOND_GROUP], chip: 'Xong, có link bị bỏ', chipCls: 's-warn', verdict: 'Chưa kiểm tra' },
    { label: 'e. no-text link skipped', sources: [source('attempt-no-text', 'f', '2026-11-18T07:00:00.000Z', 5)],
      m3: [NO_TEXT_ISSUE], skipped: 1, groups: [NO_TEXT_GROUP], chip: 'Xong, có link bị bỏ', chipCls: 's-warn',
      verdict: 'Xong, có link bị bỏ' },
  ];
  for (const row of rows) {
    const run = harness({
      runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
      runInfo: withM3Gate(collectedRunInfo(), row.skipped, row.stopped, row.running), sampling: syntheticSampling(),
      reviewData: syntheticReviewData({ sources: row.sources }),
      moduleOutputsResult: (runId) => ({ ok: true, data: row.m3
        ? { ...moduleOutputView(runId), linkIssues: [...M2_ISSUES, ...row.m3] } : moduleOutputView(runId) }),
    });
    try {
      await waitFor(() => run.doc.getElementById('moM2Chip') !== null && run.doc.getElementById('techDetails') !== null &&
        run.doc.getElementById('rdSummary') !== null, row.label);
      assert.deepEqual(m2Lines(run.doc), row.m3 ? M2_LINES : [], row.label + ': step 2');
      assert.deepEqual(m3Groups(run.doc), row.groups, row.label + ': step 3');
      if (row.groups.length) assert.ok(run.doc.getElementById('rdPanel')!.contains(run.doc.getElementById('linkIssues-m3')));
      if (!row.m3) assert.equal(run.doc.querySelector('.link-issues'), null, 'old run shows nothing new');
      const visible = run.doc.getElementById('rdChip')!;
      assert.equal(visible.textContent, row.chip, row.label + ': visible step 3 chip');
      assert.equal(visible.className, 'chip ' + row.chipCls, row.label + ': chip colour');
      const chips = [...run.doc.querySelectorAll('#techDetails .chip')].map((chip) => chip.textContent);
      assert.ok(chips.includes(row.verdict), row.label + ': verdict ' + chips.join(' | '));
    } finally { run.dom.window.close(); }
  }

  const failedInfo: any = syntheticRunInfo();
  failedInfo.state = { status: 'FAILED', module: 'M2', errorCode: 'LINK_CHECK_FAILED' };
  const failed = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'FAILED' }],
    runInfo: failedInfo, sampling: syntheticSampling(),
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId) }),
  });
  try {
    await waitFor(() => [...failed.doc.querySelectorAll('#runDetail .local-error')].some((node) =>
      node.textContent === 'Không kiểm được link Shopee. Thử lại sau ít phút.'), 'LINK_CHECK_FAILED text');
  } finally { failed.dom.window.close(); }
});

test('dead links: an attempt that finishes while the run is open shows its group and the yellow chip without reopening', async () => {
  const second = syntheticReviewSource({ attemptId: 'attempt-second', sourceSha256: 'e'.repeat(64),
    completedAt: '2026-11-18T05:00:00.000Z', rowCount: 9 });
  const attempt = (status: string) => ({
    attemptId: 'attempt-second', executionId: null, sequence: null, status, errorCode: null, gate: null,
    stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 12, actual: status === 'RUNNING' ? 3 : 9, shortfall: null,
      stopReason: '', stars: [] }],
  });
  let finished = false;
  const run = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: collectedRunInfo(), sampling: syntheticSampling({ attempts: [attempt('RUNNING')] }),
    reviewData: syntheticReviewData({ sources: [] }), fastPoll: true,
    moduleOutputsResult: (runId) => ({ ok: true, data: { ...moduleOutputView(runId),
      linkIssues: finished ? [...M2_ISSUES, SECOND_ISSUE] : [...M2_ISSUES] } }),
  });
  try {
    await waitFor(() => /Chưa có kết quả bình luận/.test(run.doc.getElementById('rdPanel')?.textContent ?? '') &&
      run.doc.getElementById('moM2Chip') !== null, 'run open, attempt running');
    assert.deepEqual(m3Groups(run.doc), [], 'no step 3 group while the attempt runs');
    assert.equal(run.doc.getElementById('rdChip')!.textContent, 'Chưa có kết quả');
    const opened = run.state.moduleOutputsCalls.length;

    finished = true;                                    // the attempt ends with one skipped link
    run.state.sampling = syntheticSampling({ attempts: [attempt('SUCCEEDED')] });
    run.state.reviewDataView = syntheticReviewData({ sources: [second] });
    await waitFor(() => m3Groups(run.doc).length === 1 && /9 bình luận/.test(run.doc.getElementById('rdSummary')?.textContent ?? ''),
      'new group after the attempt finished', 3000);
    assert.ok(run.state.moduleOutputsCalls.length > opened, 'module outputs reloaded with review data');
    assert.deepEqual(m3Groups(run.doc), [SECOND_GROUP]);
    const chip = run.doc.getElementById('rdChip')!;
    assert.equal(chip.textContent, 'Xong, có link bị bỏ');
    assert.equal(chip.className, 'chip s-warn');
  } finally { run.dom.window.close(); }
});

/** Lets the start-up opening of `first` finish (the app counts as connected only after it), then opens `runId`. */
async function openAfterStartup(run: ReturnType<typeof harness>, first: string, runId: string): Promise<void> {
  await waitFor(() => run.state.shotStateCalls.includes(first), 'start-up opening of ' + first);
  await new Promise((resolve) => setTimeout(resolve, 20));
  runListButton(run.doc, runId).click();
}

// One owner for picture actions, click answers and the per-opening state lifecycle.
test('the full-page Metric picture: local viewer, online retention, old evidence and missing states', async () => {
  const missing = { available: false, kind: 'full-page', sha256: null, byteSize: null, mediaType: 'image/png',
    fileName: 'full-page.png', errorCode: 'EVIDENCE_FILES_MISSING' };
  const outputs = (runId: string, fullPage = missing) => ({ ok: true, data: moduleOutputView(runId,
    { evidence: { fullPage, raw: evidenceDescriptor('raw', 'raw-responses.json', 'application/json') } }) });
  const old = evidenceDescriptor('full-page', 'full-page.png', 'image/png');
  // `opens` is the bridge's click answer; the page always sends the old picture's digest when the run has one.
  const rows: { label: string; local: boolean; fullPage: any; enabled: boolean; offline?: boolean;
    opens: 'local' | 'online' | 'server' | null; state?: string; hint?: string; note?: string }[] = [
    { label: 'local shot', local: true, fullPage: missing, enabled: true, opens: 'local' },
    { label: 'local shot with old evidence', local: true, fullPage: old, enabled: true, opens: 'local' },
    { label: 'server picture', local: false, fullPage: old, enabled: true, opens: 'server' },
    { label: 'neither', local: false, fullPage: missing, enabled: true, opens: null },
    { label: 'online picture', local: false, fullPage: missing, enabled: true, opens: 'online',
      state: 'AVAILABLE', hint: 'Ảnh lưu đến 04/12/2026' },
    { label: 'expired picture', local: false, fullPage: missing, enabled: true, opens: null,
      state: 'EXPIRED', hint: 'Ảnh Metric đã tự xóa sau 10 ngày.' },
    { label: 'no uploaded picture', local: false, fullPage: missing, enabled: true, opens: null,
      state: 'NOT_UPLOADED', hint: 'Lượt này không có ảnh Metric.' },
    { label: 'server error', local: false, fullPage: { ...missing, errorCode: 'EVIDENCE_HASH_MISMATCH' },
      enabled: true, opens: null, note: 'Tệp bằng chứng đã lưu không khớp mã kiểm tra.' },
    { label: 'offline without local', local: false, fullPage: missing, enabled: false, opens: null, offline: true,
      hint: 'Ảnh chỉ lưu trên máy đã lấy dữ liệu' },
    { label: 'offline local', local: true, fullPage: missing, enabled: true, opens: 'local', offline: true },
  ];
  for (const row of rows) {
    const run = harness({
      runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
      runInfo: syntheticRunInfo(), localShots: { 'run-synthetic': row.local },
      connectionResultFor: (call) => ({ ok: true,
        data: { connected: !(row.offline && call > 1), readonly: false, runsRoot: '/synthetic/runs' } }),
      shotClock: { now: Date.parse('2026-11-24T12:00:00Z') },
      metricShotStateResult: (runId) => ({ ok: true, data: { format: 'metric-shot-state-v1', runId,
        local: row.local, uploading: false, state: row.state || null, deleteAfter: '2026-12-04T12:00:00Z' } }),
      viewShotResult: (runId, sha256) => row.opens === 'server'
        ? { ok: true, data: { format: 'module-evidence-open-v1', runId, kind: 'full-page', sha256, opened: true } }
        : { ok: true, data: { format: 'metric-shot-open-v1', runId,
          state: row.opens === 'local' ? 'LOCAL' : row.opens === 'online' ? 'AVAILABLE' : row.state || 'NOT_UPLOADED',
          src: row.opens === 'local' ? 'data:image/webp;base64,c3ludGhldGlj' : 'https://synthetic.invalid/picture.webp',
          deleteAfter: '2026-12-04T12:00:00Z' } },
      saveShotResult: () => row.opens
        ? { ok: true, data: { saved: true } }
        : { ok: false, error: { code: row.state === 'EXPIRED' ? 'METRIC_SHOT_EXPIRED' : 'METRIC_SHOT_NOT_UPLOADED' } },
      moduleOutputsResult: (runId) => outputs(runId, row.fullPage),
    });
    try {
      await waitFor(() => run.doc.getElementById('moM1FullPage') !== null && run.state.shotStateCalls.length === 1,
        row.label + ': loaded');
      if (row.local) await waitFor(() => !element<HTMLButtonElement>(run.doc, 'moM1FullPage').disabled, row.label + ': local');
      if (row.offline) {
        run.advanceShotTime(15000);
        await waitFor(() => element(run.doc, 'connText').textContent === 'Chưa kết nối máy chủ.', row.label + ': disconnected');
      }
      if (row.hint) await waitFor(() => run.doc.getElementById('moM1FullPageHint')?.textContent === row.hint, row.label + ': hint');
      assert.equal(element(run.doc, 'moM1FullPage').textContent, 'Xem ảnh Metric', row.label);
      assert.equal(element<HTMLButtonElement>(run.doc, 'moM1FullPage').disabled, !row.enabled, row.label + ': enabled');
      assert.equal(element(run.doc, 'moM1SaveShot').textContent, 'Tải ảnh', row.label);
      assert.equal(element<HTMLButtonElement>(run.doc, 'moM1SaveShot').disabled, !row.enabled, row.label + ': save enabled');
      if (row.note) {
        assert.equal(element(run.doc, 'moM1FullPage').parentElement!.querySelector('.rs-note')!.textContent, row.note);
        continue;
      }
      const clickHint = row.state === 'EXPIRED' ? 'Ảnh Metric đã tự xóa sau 10 ngày.' : 'Lượt này không có ảnh Metric.';
      element<HTMLButtonElement>(run.doc, 'moM1SaveShot').click();
      if (row.enabled) {
        await waitFor(() => run.state.saveShotCalls.length === 1 &&
          !element<HTMLButtonElement>(run.doc, 'moM1SaveShot').disabled, row.label + ': save answered');
        assert.deepEqual(run.state.saveShotCalls, [['run-synthetic', 'Sản phẩm tổng hợp', row.fullPage.sha256, true, true]],
          row.label + ': save source');
        if (row.opens) assert.equal(element(run.doc, 'toast').textContent, 'Đã lưu ảnh');
        else assert.equal(run.doc.getElementById('moM1FullPageHint')?.textContent, clickHint, row.label + ': save note');
      } else assert.equal(run.state.saveShotCalls.length, 0, row.label + ': disabled save');
      element<HTMLButtonElement>(run.doc, 'moM1FullPage').click();
      if (row.enabled) await waitFor(() => run.state.viewShotCalls.length === 1 &&
        !element<HTMLButtonElement>(run.doc, 'moM1FullPage').disabled, row.label + ': view answered');
      assert.deepEqual(run.state.openLocalShotCalls, [], row.label + ': stays in app');
      assert.deepEqual(run.state.viewShotCalls, row.enabled ? [['run-synthetic', row.fullPage.sha256, true]] : [], row.label + ': viewer source');
      assert.deepEqual(run.state.openEvidenceCalls, [], row.label + ': the bridge chooses the old evidence');
      const dialog = element<HTMLDialogElement>(run.doc, 'shotDialog');
      if (row.opens === 'local' || row.opens === 'online') {
        await waitFor(() => dialog.open, row.label + ': viewer visible');
        assert.equal(element(run.doc, 'shotDialogTitle').textContent, 'Ảnh Metric');
        assert.equal(element(run.doc, 'shotCloseBtn').textContent, 'Đóng');
        assert.equal(element(run.doc, 'shotDialogNote').textContent, row.opens === 'online' ? row.hint : '');
        const image = element<HTMLImageElement>(run.doc, 'shotImg');
        assert.equal(image.alt, 'Ảnh toàn trang Metric');
        assert.equal(image.getAttribute('src'), row.opens === 'local'
          ? 'data:image/webp;base64,c3ludGhldGlj' : 'https://synthetic.invalid/picture.webp');
        if (row.opens === 'local') element<HTMLButtonElement>(run.doc, 'shotCloseBtn').click();
        else dialog.dispatchEvent(new run.dom.window.Event('cancel', { cancelable: true }));
        assert.equal(dialog.open, false, row.label + ': close or Esc');
        assert.equal(image.hasAttribute('src'), false, row.label + ': image released');
      } else {
        assert.equal(dialog.open, false, row.label + ': no viewer');
        if (row.enabled && !row.opens) assert.equal(run.doc.getElementById('moM1FullPageHint')?.textContent, clickHint, row.label + ': view note');
      }
    } finally { run.dom.window.close(); }
  }

  const localShots = { 'run-synthetic': true };
  let remoteState = 'NOT_UPLOADED';
  let clickState = 'AVAILABLE';
  const lifecycle = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(), localShots, shotClock: { now: Date.parse('2026-11-24T12:00:00Z') },
    metricShotStateResult: (runId) => ({ ok: true, data: { format: 'metric-shot-state-v1', runId,
      local: localShots['run-synthetic'], state: remoteState, uploading: localShots['run-synthetic'],
      deleteAfter: '2099-01-11T00:00:00Z' } }),
    viewShotResult: (runId) => ({ ok: true, data: { format: 'metric-shot-open-v1', runId, state: clickState,
      src: 'https://synthetic.invalid/fresh-click.webp', deleteAfter: '2099-01-11T00:00:00Z' } }),
    saveShotResult: () => clickState === 'AVAILABLE' ? { ok: true, data: { saved: true } }
      : { ok: false, error: { code: 'METRIC_SHOT_' + clickState } },
    moduleOutputsResult: (runId) => outputs(runId),
  });
  try {
    await waitFor(() => lifecycle.state.shotStateCalls.length === 1 &&
      lifecycle.doc.getElementById('moM1FullPage') !== null &&
      !element<HTMLButtonElement>(lifecycle.doc, 'moM1FullPage').disabled, 'opening: local picture');
    lifecycle.advanceShotTime(130000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(lifecycle.state.shotStateCalls, ['run-synthetic'], 'no read without an opening');
    localShots['run-synthetic'] = false;               // upload removed it since the opening
    remoteState = 'AVAILABLE';
    element<HTMLButtonElement>(lifecycle.doc, 'moM1SaveShot').click();
    await waitFor(() => lifecycle.state.saveShotCalls.length === 1 &&
      !element<HTMLButtonElement>(lifecycle.doc, 'moM1FullPage').disabled, 'click-time save');
    assert.deepEqual(lifecycle.state.saveShotCalls, [['run-synthetic', 'Sản phẩm tổng hợp', null, true, true]],
      'local gone: save still asks the bridge for online fallback');
    element<HTMLButtonElement>(lifecycle.doc, 'moM1FullPage').click();
    await waitFor(() => element<HTMLDialogElement>(lifecycle.doc, 'shotDialog').open, 'click-time online view');
    assert.equal(element<HTMLImageElement>(lifecycle.doc, 'shotImg').getAttribute('src'),
      'https://synthetic.invalid/fresh-click.webp', 'local gone: use the fresh click answer');
    element<HTMLButtonElement>(lifecycle.doc, 'shotCloseBtn').click();
    for (const [action, state] of [['view', 'EXPIRED'], ['save', 'NOT_UPLOADED'],
      ['save', 'EXPIRED'], ['view', 'NOT_UPLOADED']] as const) {
      clickState = state;
      element<HTMLButtonElement>(lifecycle.doc, action === 'view' ? 'moM1FullPage' : 'moM1SaveShot').click();
      const hint = state === 'EXPIRED' ? 'Ảnh Metric đã tự xóa sau 10 ngày.' : 'Lượt này không có ảnh Metric.';
      await waitFor(() => lifecycle.doc.getElementById('moM1FullPageHint')?.textContent === hint &&
        !element<HTMLButtonElement>(lifecycle.doc, 'moM1FullPage').disabled, action + ': click-time ' + state);
      assert.equal(element<HTMLDialogElement>(lifecycle.doc, 'shotDialog').open, false, action + ': no picture');
      assert.equal(element<HTMLButtonElement>(lifecycle.doc, 'moM1SaveShot').disabled, false, action + ': still clickable');
    }
    assert.equal(lifecycle.state.shotStateCalls.length, 1, 'clicks do not reload the opening state');
    for (const [index, state] of ['AVAILABLE', 'EXPIRED'].entries()) {
      remoteState = state;
      runListButton(lifecycle.doc, 'run-synthetic').click();
      await waitFor(() => lifecycle.state.shotStateCalls.length === index + 2 &&
        lifecycle.doc.getElementById('moM1FullPageHint')?.textContent ===
          (state === 'AVAILABLE' ? 'Ảnh lưu đến 11/01/2099' : 'Ảnh Metric đã tự xóa sau 10 ngày.'),
      'one fresh read on each opening');
    }
    lifecycle.advanceShotTime(130000);
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.deepEqual(lifecycle.state.shotStateCalls, ['run-synthetic', 'run-synthetic', 'run-synthetic'],
      'no throttle on reopening and no automatic re-read');
    assert.deepEqual(lifecycle.state.shotStartCalls, [], 'page never starts an upload from the state answer');
  } finally { lifecycle.dom.window.close(); }

  const oldAnswer = deferred<unknown>();
  const freshAnswer = deferred<unknown>();
  let first = true;
  const late = harness({
    runs: ['run-synthetic', 'run-other'].map((runId) => ({ runId, product: runId, status: 'DONE' })),
    runInfoByRun: { 'run-synthetic': syntheticRunInfo(), 'run-other': { ...syntheticRunInfo(), runId: 'run-other' } },
    metricShotStateResult: (runId) => {
      if (runId === 'run-other') return { ok: true, data: { runId, local: false, state: 'EXPIRED' } };
      if (first) { first = false; return oldAnswer.promise; }
      return freshAnswer.promise;
    },
    moduleOutputsResult: (runId) => outputs(runId),
  });
  try {
    await waitFor(() => late.state.shotStateCalls.length === 1 && late.doc.getElementById('moM1FullPage') !== null, 'late: first opening held');
    runListButton(late.doc, 'run-other').click();
    await waitFor(() => late.doc.getElementById('moM1FullPageHint')?.textContent === 'Ảnh Metric đã tự xóa sau 10 ngày.',
      'late: another run is open');
    oldAnswer.resolve({ ok: true, data: { runId: 'run-synthetic', local: false, state: 'NOT_UPLOADED' } });
    await new Promise((resolve) => setTimeout(resolve, 5));
    assert.equal(element(late.doc, 'moM1FullPageHint').textContent, 'Ảnh Metric đã tự xóa sau 10 ngày.', 'late: current run unchanged');
    runListButton(late.doc, 'run-synthetic').click();
    await waitFor(() => late.state.shotStateCalls.length === 3 && late.doc.getElementById('moM1FullPage') !== null, 'late: new opening held');
    assert.equal(late.doc.getElementById('moM1FullPageHint'), null, 'late answer for the closed run was not cached');
    freshAnswer.resolve({ ok: true, data: { runId: 'run-synthetic', local: false, state: 'AVAILABLE', deleteAfter: '2099-01-11T00:00:00Z' } });
    await waitFor(() => late.doc.getElementById('moM1FullPageHint')?.textContent === 'Ảnh lưu đến 11/01/2099', 'late: fresh opening wins');
    assert.deepEqual(late.state.shotStateCalls, ['run-synthetic', 'run-other', 'run-synthetic']);
  } finally {
    oldAnswer.resolve(null);
    freshAnswer.resolve(null);
    late.dom.window.close();
  }

  // The first opening's local-file lookup answers «no file» only after a reopening found the file, offline.
  // Single calls (an older server): a reopening does not wait for the first opening's lookup.
  const heldLocal = deferred<unknown>();
  let localLookups = 0;
  let offline = false;
  const stale = harness({
    runs: ['run-other', 'run-synthetic'].map((runId) => ({ runId, product: runId, status: 'DONE' })),
    runInfoByRun: { 'run-synthetic': syntheticRunInfo(), 'run-other': { ...syntheticRunInfo(), runId: 'run-other' } },
    localShots: { 'run-synthetic': true }, shotClock: { now: Date.parse('2026-11-24T12:00:00Z') },
    connectionResultFor: () => ({ ok: true, data: { connected: !offline, readonly: false, runsRoot: '/synthetic/runs' } }),
    localShotResult: (runId) => (runId === 'run-synthetic' && ++localLookups === 1 ? heldLocal.promise : undefined),
    moduleOutputsResult: (runId) => outputs(runId), oldServer: true,
  });
  const reads = () => stale.state.shotStateCalls.filter((runId) => runId === 'run-synthetic').length;
  try {
    await openAfterStartup(stale, 'run-other', 'run-synthetic');
    await waitFor(() => localLookups === 1 && reads() === 1 && stale.doc.getElementById('moM1FullPage') !== null,
      'stale: first lookup held');
    runListButton(stale.doc, 'run-synthetic').click();
    await waitFor(() => localLookups >= 2 && reads() === 2 &&
      !element<HTMLButtonElement>(stale.doc, 'moM1FullPage').disabled, 'stale: reopening found the local file');
    offline = true;
    stale.advanceShotTime(15000);
    await waitFor(() => element(stale.doc, 'connText').textContent === 'Chưa kết nối máy chủ.', 'stale: disconnected');
    heldLocal.resolve({ ok: true, data: { format: 'local-metric-shot-v1', runId: 'run-synthetic', exists: false } });
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const id of ['moM1FullPage', 'moM1SaveShot']) {
      assert.equal(element<HTMLButtonElement>(stale.doc, id).disabled, false, 'stale: older lookup dropped, ' + id + ' stays on offline');
    }
  } finally {
    heldLocal.resolve(null);
    stale.dom.window.close();
  }

  // A click started in an earlier opening must leave the newer opening's picture alone.
  for (const row of [
    { action: 'view', answer: 'NOT_UPLOADED', unknown: true, local: false },
    { action: 'view', answer: 'EXPIRED', unknown: false, local: false },
    { action: 'save', answer: 'NOT_UPLOADED', unknown: true, local: false },
    { action: 'save', answer: 'EXPIRED', unknown: false, local: true },
    { action: 'view', answer: 'AVAILABLE', unknown: false, local: false },
    { action: 'view', answer: 'LOCAL', unknown: true, local: false },
    { action: 'view', answer: 'EVIDENCE_LOCAL_MISSING', unknown: true, local: true },
    { action: 'save', answer: 'saved', unknown: true, local: false },
  ] as const) {
    const answer = deferred<unknown>();
    const freshState = deferred<unknown>();
    const local = { 'run-synthetic': false };
    let openings = 0;
    let offline = false;
    const label = 'reopened ' + row.action + ' ' + row.answer;
    const run = harness({
      runs: ['run-other', 'run-synthetic'].map((runId) => ({ runId, product: runId, status: 'DONE' })),
      runInfoByRun: { 'run-synthetic': syntheticRunInfo(), 'run-other': syntheticRunInfo('run-other') },
      localShots: local, shotClock: { now: Date.parse('2026-11-24T12:00:00Z') },
      connectionResultFor: () => ({ ok: true, data: { connected: !offline, readonly: false, runsRoot: '/synthetic/runs' } }),
      metricShotStateResult: (runId) => runId === 'run-synthetic' && ++openings === 2 ? freshState.promise
        : { ok: true, data: { runId, local: false, state: 'NOT_UPLOADED' } },
      moduleOutputsResult: (runId) => runId === 'run-synthetic' && row.unknown
        ? { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } } : outputs(runId),
      viewShotResult: () => answer.promise,
      saveShotResult: () => answer.promise,
    });
    try {
      await openAfterStartup(run, 'run-other', 'run-synthetic');
      await waitFor(() => openings === 1 && run.doc.getElementById('moM1FullPage') !== null &&
        (row.unknown ? run.doc.getElementById('moduleOutputsErr') !== null : run.doc.getElementById('moM1Capture') !== null),
      label + ': first opening');
      element<HTMLButtonElement>(run.doc, row.action === 'view' ? 'moM1FullPage' : 'moM1SaveShot').click();
      await waitFor(() => run.state.viewShotCalls.length + run.state.saveShotCalls.length === 1, label + ': click held');
      local['run-synthetic'] = row.local;
      runListButton(run.doc, 'run-synthetic').click();
      await waitFor(() => openings === 2, label + ': fresh state read started');
      freshState.resolve({ ok: true, data: { runId: 'run-synthetic', local: row.local,
        state: row.unknown ? 'NOT_UPLOADED' : 'AVAILABLE', deleteAfter: '2099-01-11T00:00:00Z' } });
      await new Promise((resolve) => setTimeout(resolve, 20));
      const hint = !row.unknown && !row.local ? 'Ảnh lưu đến 11/01/2099' : null;
      assert.equal(run.doc.getElementById('moM1FullPageHint')?.textContent ?? null, hint, label + ': fresh opening note');
      answer.resolve(row.action === 'save'
        ? row.answer === 'saved' ? { ok: true, data: { saved: true } }
          : { ok: false, error: { code: 'METRIC_SHOT_' + row.answer } }
        : row.answer === 'EVIDENCE_LOCAL_MISSING' ? { ok: false, error: { code: row.answer } }
          : { ok: true, data: { format: 'metric-shot-open-v1', runId: 'run-synthetic', state: row.answer,
            src: row.answer === 'LOCAL' ? 'data:image/webp;base64,c3ludGhldGlj' : 'https://synthetic.invalid/stale.webp',
            deleteAfter: '2099-02-11T00:00:00Z' } });
      await waitFor(() => !element<HTMLButtonElement>(run.doc, 'moM1FullPage').disabled, label + ': click completed');
      assert.equal(run.doc.getElementById('moM1FullPageHint')?.textContent ?? null, hint, label + ': fresh note survives');
      assert.equal(element<HTMLDialogElement>(run.doc, 'shotDialog').open, false, label + ': stale answer cannot open viewer');
      assert.equal(element<HTMLImageElement>(run.doc, 'shotImg').hasAttribute('src'), false, label + ': no stale image');
      if (row.answer === 'saved') {
        assert.equal(element(run.doc, 'toast').textContent, 'Đã lưu ảnh', label + ': completed file save is acknowledged');
        assert.equal(element(run.doc, 'toast').hidden, false);
      }
      offline = true;
      run.advanceShotTime(15000);
      await waitFor(() => element(run.doc, 'connText').textContent === 'Chưa kết nối máy chủ.', label + ': disconnected');
      for (const id of ['moM1FullPage', 'moM1SaveShot']) {
        const button = run.doc.getElementById(id) as HTMLButtonElement | null;
        assert.equal(button !== null && !button.disabled, row.local, label + ': fresh local-file state survives, ' + id);
      }
    } finally {
      answer.resolve(null);
      freshState.resolve(null);
      run.dom.window.close();
    }
  }
});

// The actions do not wait for the step results: shown while they load or after they fail, whenever there is
// a picture here or the app is connected (the upload may finish after the opening read said NOT_UPLOADED).
// An old run (server full-page.png, no online copy) opens its old picture through the bridge, never «không có ảnh».
test('the Metric picture actions stay reachable while the step results load or fail', async () => {
  const cases = [
    { label: 'local picture, outputs failed', local: true, outputs: 'failed', opens: 'LOCAL',
      src: 'data:image/webp;base64,c3ludGhldGlj' },
    { label: 'connected, outputs failed', local: false, outputs: 'failed', opens: 'AVAILABLE',
      src: 'https://synthetic.invalid/uploaded.webp' },
    { label: 'connected, outputs loading', local: false, outputs: 'loading', opens: 'AVAILABLE',
      src: 'https://synthetic.invalid/uploaded.webp' },
    { label: 'old picture, outputs failed', local: false, outputs: 'failed', opens: 'OLD', src: null },
    { label: 'old picture, outputs loading', local: false, outputs: 'loading', opens: 'OLD', src: null },
    { label: 'no picture, outputs failed', local: false, outputs: 'failed', opens: 'NOT_UPLOADED', src: null },
    { label: 'no picture, outputs loading', local: false, outputs: 'loading', opens: 'NOT_UPLOADED', src: null },
    { label: 'expired picture, outputs failed', local: false, outputs: 'failed', opens: 'EXPIRED', src: null },
    { label: 'expired picture, outputs loading', local: false, outputs: 'loading', opens: 'EXPIRED', src: null },
  ] as const;
  for (const item of cases) {
    const held = deferred<unknown>();
    const missing = item.opens === 'NOT_UPLOADED' || item.opens === 'EXPIRED';
    const hint = item.opens === 'EXPIRED' ? 'Ảnh Metric đã tự xóa sau 10 ngày.' : 'Lượt này không có ảnh Metric.';
    const run = harness({
      runs: ['run-other', 'run-synthetic'].map((runId) => ({ runId, product: runId, status: 'DONE' })),
      runInfoByRun: { 'run-synthetic': syntheticRunInfo(), 'run-other': { ...syntheticRunInfo(), runId: 'run-other' } },
      localShots: { 'run-synthetic': item.local }, oldServer: item.outputs === 'loading',
      metricShotStateResult: (runId) => ({ ok: true, data: { format: 'metric-shot-state-v1', runId,
        local: item.local, uploading: false, state: item.local ? null : missing ? item.opens : 'NOT_UPLOADED' } }),
      viewShotResult: (runId) => (item.opens === 'OLD'      // what the bridge answers after it opened the old picture
        ? { ok: true, data: { format: 'module-evidence-open-v1', runId, kind: 'full-page', sha256: 'a'.repeat(64), opened: true } }
        : { ok: true, data: { format: 'metric-shot-open-v1', runId, state: item.opens, src: item.src,
          deleteAfter: missing ? null : '2099-01-11T00:00:00Z' } }),
      saveShotResult: () => missing ? { ok: false, error: { code: 'METRIC_SHOT_' + item.opens } }
        : { ok: true, data: { saved: true } },
      moduleOutputsResult: (runId) => (runId === 'run-other' ? { ok: true, data: moduleOutputView(runId) }
        : item.outputs === 'loading' ? held.promise : { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } }),
    });
    try {
      await openAfterStartup(run, 'run-other', 'run-synthetic');   // outputs loading: only after start-up
      const panelReady = () => item.outputs === 'failed' ? run.doc.getElementById('moduleOutputsErr') !== null
        : /Đang tải kết quả các bước/.test(run.doc.getElementById('moduleOutputsPanel')?.textContent ?? '');
      await waitFor(() => panelReady() && run.state.shotStateCalls.includes('run-synthetic') &&
        run.doc.getElementById('moM1FullPage') !== null, item.label + ': actions shown');
      for (const id of ['moM1FullPage', 'moM1SaveShot']) {
        assert.equal(element<HTMLButtonElement>(run.doc, id).disabled, false, item.label + ': ' + id + ' enabled');
      }
      assert.equal(run.doc.getElementById('moM1FullPageHint'), null, item.label + ': opening read alone stays silent');
      const reopen = async () => {
        const reads = run.state.shotStateCalls.length;
        runListButton(run.doc, 'run-synthetic').click();
        await waitFor(() => panelReady() && run.state.shotStateCalls.length === reads + 1 &&
          run.doc.getElementById('moM1FullPage') !== null && run.doc.getElementById('moM1FullPageHint') === null,
        item.label + ': reopening clears the click note');
      };
      element<HTMLButtonElement>(run.doc, 'moM1FullPage').click();
      if (missing) {
        await waitFor(() => run.doc.getElementById('moM1FullPageHint')?.textContent === hint &&
          !element<HTMLButtonElement>(run.doc, 'moM1FullPage').disabled, item.label + ': view click note');
        assert.equal(element<HTMLDialogElement>(run.doc, 'shotDialog').open, false, item.label + ': no viewer');
        await reopen();
      } else if (item.src === null) {
        await waitFor(() => run.state.viewShotCalls.length === 1 &&
          run.doc.getElementById('moM1FullPage')?.textContent === 'Xem ảnh Metric', item.label + ': click answered');
        assert.doesNotMatch(run.doc.getElementById('runDetail')?.textContent ?? '', /Lượt này không có ảnh Metric\./,
          item.label + ': no «không có ảnh»');
        assert.equal(element<HTMLDialogElement>(run.doc, 'shotDialog').open, false, item.label + ': no viewer');
      } else {
        await waitFor(() => element<HTMLDialogElement>(run.doc, 'shotDialog').open, item.label + ': picture opened');
        assert.equal(element<HTMLImageElement>(run.doc, 'shotImg').getAttribute('src'), item.src, item.label);
        element<HTMLButtonElement>(run.doc, 'shotCloseBtn').click();
      }
      assert.deepEqual(run.state.viewShotCalls, [['run-synthetic', null, false]], item.label + ': outputs unknown');
      element<HTMLButtonElement>(run.doc, 'moM1SaveShot').click();
      await waitFor(() => run.state.saveShotCalls.length === 1 &&
        !element<HTMLButtonElement>(run.doc, 'moM1SaveShot').disabled, item.label + ': save answered');
      assert.deepEqual(run.state.saveShotCalls, [['run-synthetic', 'run-synthetic', null, true, false]], item.label + ': outputs unknown');
      if (missing) {
        assert.equal(run.doc.getElementById('moM1FullPageHint')?.textContent, hint, item.label + ': save click note');
        await reopen();
      }
      assert.deepEqual(run.state.openLocalShotCalls, [], item.label);
      assert.deepEqual(run.state.openEvidenceCalls, [], item.label);
    } finally {
      held.resolve(null);
      run.dom.window.close();
    }
  }

  // Cached no-picture results stay visible while their replacement is pending or has failed.
  for (const oldServer of [false, true]) {
    const refresh = deferred<unknown>();
    const retry = deferred<unknown>();
    let nextRead: Promise<unknown> | null = null;
    const label = oldServer ? 'single reads' : 'run-view reads';
    const noPicture = (runId: string) => ({ ok: true, data: moduleOutputView(runId, { evidence: {
      fullPage: { available: false, kind: 'full-page', sha256: null, byteSize: null, mediaType: 'image/png',
        fileName: 'full-page.png', errorCode: 'EVIDENCE_FILES_MISSING' },
      raw: evidenceDescriptor('raw', 'raw-responses.json', 'application/json'),
    } }) });
    const run = harness({
      runs: ['run-other', 'run-synthetic'].map((runId) => ({ runId, product: runId, status: 'DONE' })),
      runInfoByRun: { 'run-synthetic': syntheticRunInfo(), 'run-other': syntheticRunInfo('run-other') }, oldServer,
      moduleOutputsResult: (runId) => runId === 'run-synthetic' && nextRead ? nextRead : noPicture(runId),
      metricShotStateResult: (runId) => ({ ok: true, data: { runId, local: false, state: 'NOT_UPLOADED' } }),
      viewShotResult: (runId) => ({ ok: true, data: { format: 'module-evidence-open-v1', runId,
        kind: 'full-page', sha256: 'b'.repeat(64), opened: true } }),
      saveShotResult: () => ({ ok: true, data: { saved: true } }),
    });
    const clicks = async (phase: string, known: boolean) => {
      const count = run.state.viewShotCalls.length;
      element<HTMLButtonElement>(run.doc, 'moM1FullPage').click();
      await waitFor(() => run.state.viewShotCalls.length === count + 1 &&
        !element<HTMLButtonElement>(run.doc, 'moM1FullPage').disabled, label + ': ' + phase + ' view answered');
      assert.deepEqual(run.state.viewShotCalls.at(-1), ['run-synthetic', null, known], label + ': ' + phase + ' View oldKnown');
      element<HTMLButtonElement>(run.doc, 'moM1SaveShot').click();
      await waitFor(() => run.state.saveShotCalls.length === count + 1 &&
        !element<HTMLButtonElement>(run.doc, 'moM1SaveShot').disabled, label + ': ' + phase + ' save answered');
      assert.deepEqual(run.state.saveShotCalls.at(-1), ['run-synthetic', 'run-synthetic', null, true, known],
        label + ': ' + phase + ' Save oldKnown');
    };
    try {
      await openAfterStartup(run, 'run-other', 'run-synthetic');
      await waitFor(() => run.doc.getElementById('moM1Capture') !== null, label + ': initial no-picture results');
      await clicks('fresh initial read', true);
      nextRead = refresh.promise;
      const outputReads = () => run.state.moduleOutputsCalls.filter((runId) => runId === 'run-synthetic').length;
      const reads = outputReads();
      runListButton(run.doc, 'run-synthetic').click();
      await waitFor(() => outputReads() === reads + 1 &&
        run.doc.getElementById('moM1FullPage') !== null, label + ': reopening refresh pending');
      assert.notEqual(run.doc.getElementById('moM1Capture'), null, label + ': cached results remain shown');
      await clicks('cached results, refresh pending', false);
      refresh.resolve({ ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } });
      await waitFor(() => run.doc.getElementById('moduleOutputsErr') !== null, label + ': refresh failed');
      assert.notEqual(run.doc.getElementById('moM1Capture'), null, label + ': failed refresh keeps cached results');
      await clicks('cached results, refresh failed', false);
      nextRead = retry.promise;
      runListButton(run.doc, 'run-synthetic').click();
      await waitFor(() => outputReads() === reads + 2, label + ': retry pending');
      await clicks('cached results, retry pending', false);
      retry.resolve(noPicture('run-synthetic'));
      await waitFor(() => run.doc.getElementById('moduleOutputsErr') === null &&
        run.doc.getElementById('moM1Capture') !== null, label + ': fresh read succeeded');
      await clicks('fresh successful retry', true);
    } finally {
      refresh.resolve(null);
      retry.resolve(null);
      run.dom.window.close();
    }
  }
});

// «Xóa lượt» (F644 §4), one row each:
// | step                       | bridge                  | page                                                  |
// |----------------------------|-------------------------|-------------------------------------------------------|
// | «Xóa lượt», then «Hủy»     | nothing                 | the run stays open                                    |
// | «Xóa», server RUN_ACTIVE   | deleteRun once          | «Lượt đang chạy. Dừng trước khi xóa.» in the box      |
// | «Xóa», deleted             | deleteRun again         | run left, list refreshed without it, «Đã xóa lượt»    |
test('«Xóa lượt» asks first, explains a running run, and leaves the deleted run', async () => {
  let active = true;
  const run = harness({
    runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }],
    runInfo: syntheticRunInfo(),
    deleteRunResult: () => (active ? { ok: false, error: { code: 'RUN_ACTIVE', message: 'RUN_ACTIVE' } }
      : { ok: true, data: { format: 'run-delete-v1', runId: 'run-synthetic', deleted: true, localShotDeleted: true } }),
  });
  try {
    await waitFor(() => run.doc.querySelectorAll('#runList button').length === 1, 'run list');
    runListButton(run.doc, 'run-synthetic').click();
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, 'run open');
    const del = element<HTMLButtonElement>(run.doc, 'btnDeleteRun');
    assert.equal(del.textContent, 'Xóa lượt');
    assert.match(del.className, /danger/);
    const dialog = element<HTMLDialogElement>(run.doc, 'deleteDialog');
    assert.equal(element(run.doc, 'deleteDialogTitle').textContent, 'Xóa lượt này?');
    assert.match(dialog.textContent!, /Xóa cả bình luận\. Không khôi phục được\./);
    del.click();
    assert.ok(dialog.open || dialog.hasAttribute('open'));
    element<HTMLButtonElement>(run.doc, 'deleteCancelBtn').click();
    assert.ok(!(dialog.open || dialog.hasAttribute('open')));
    assert.deepEqual(run.state.deleteRunCalls, []);

    del.click();
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => !element(run.doc, 'deleteErr').hidden, 'running refusal');
    assert.equal(element(run.doc, 'deleteErr').textContent, 'Lượt đang chạy. Dừng trước khi xóa.');
    assert.ok(run.doc.getElementById('btnDeleteRun') !== null);

    active = false;
    const listed = run.state.listRunsCalls;
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => run.doc.getElementById('btnDeleteRun') === null, 'run left');
    assert.deepEqual(run.state.deleteRunCalls, ['run-synthetic', 'run-synthetic']);
    assert.ok(run.state.listRunsCalls > listed);
    assert.equal(run.doc.querySelectorAll('#runList button.runbtn').length, 0);
    assert.ok(!(dialog.open || dialog.hasAttribute('open')));
    assert.equal(element(run.doc, 'toast').textContent, 'Đã xóa lượt');
    assert.equal(element(run.doc, 'toast').hidden, false);
  } finally { run.dom.window.close(); }
});

test('a null-execution UNKNOWN row stays listed, filters as unknown, opens and can be deleted despite progress', async (t) => {
  const good = 'run-good';
  const damaged = 'run-damaged';
  for (const steps of [null, ['PASS', 'PASS', 'RUNNING', 'IDLE'], ['PASS', 'PASS', 'PASS', 'FAIL']]) {
    await t.test(steps ? steps.join('/') : 'no progress', async () => {
      const run = harness({
        runs: [
          { runId: good, product: 'Sản phẩm tốt', status: 'IDLE' },
          { runId: damaged, product: 'Sản phẩm hỏng', status: 'UNKNOWN', execution: null,
            tracking: null, lastGate: null, lastVerdict: null, errorCode: 'EXECUTION_RECORD_INVALID' },
        ],
        runInfoByRun: { [good]: syntheticRunInfo(good) },
        runsProgressResults: [progressReply(steps ? [progressRun(damaged, steps)] : [])],
        statusError: (runId) => runId === damaged
          ? { ok: false, error: { code: 'EXECUTION_RECORD_INVALID', message: 'EXECUTION_RECORD_INVALID' } }
          : undefined,
      });
      try {
        await waitFor(() => run.doc.querySelectorAll('#runList .runbtn').length === 2 &&
          run.state.runsProgressCalls > 0, 'both rows and progress');
        await new Promise((resolve) => setTimeout(resolve, 20));
        const bad = runListButton(run.doc, damaged);
        assert.equal(bad.querySelector('.chip')?.textContent, 'Chưa xác định được trạng thái');
        assert.ok(runListButton(run.doc, good));
        const filter = element<HTMLSelectElement>(run.doc, 'runFilter');
        for (const value of ['running', 'failed']) {
          filter.value = value;
          fire(run.window, filter, 'change');
          assert.equal(run.doc.querySelectorAll('#runList .runbtn').length, 0,
            'an UNKNOWN row never enters the ' + value + ' filter: ' + steps);
        }
        filter.value = 'all';
        fire(run.window, filter, 'change');
        assert.deepEqual(run.state.notifyCalls, [], 'an unreadable view is not a completion event');
        assert.ok(run.state.prefetchCalls.every((rows) => rows.every((row) => row.runId !== damaged)),
          'a null execution never supplies a prefetch signature');
        runListButton(run.doc, damaged).click();
        await waitFor(() => run.state.statusCalls.includes(damaged) &&
          run.doc.getElementById('btnDeleteRun') !== null, 'damaged run opened');
        assert.match(element(run.doc, 'runDetail').textContent || '', /Sản phẩm hỏng/);
        assert.equal(run.doc.querySelector('#runDetail .dhead .chip')?.textContent, 'Chưa xác định được trạng thái',
          'the fallback detail preserves UNKNOWN: ' + steps);
        const remove = element<HTMLButtonElement>(run.doc, 'btnDeleteRun');
        assert.equal(remove.disabled, false, 'damaged execution does not disable delete');
        remove.click();
        assert.equal(element<HTMLDialogElement>(run.doc, 'deleteDialog').open, true);
        assert.deepEqual(run.state.deleteRunCalls, [], 'opening the confirmation never deletes');
        element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
        await waitFor(() => run.state.deleteRunCalls.length === 1 &&
          run.doc.querySelectorAll('#runList .runbtn').length === 1, 'damaged run deleted');
        assert.deepEqual(run.state.deleteRunCalls, [damaged]);
        assert.ok(runListButton(run.doc, good), 'the good row survives');
        assert.deepEqual(run.state.launchCalls, []);
        assert.deepEqual(run.state.controlCalls, []);
      } finally { run.dom.window.close(); }
    });
  }
});

// Step 2 card from the run's frozen productSelection (F644, Terra r1 #1 and #2), one row each:
// | run                                   | m2 gate check (want)            | picked | same-product line | count line                                    | error bar                                           |
// |---------------------------------------|---------------------------------|--------|-------------------|-----------------------------------------------|-----------------------------------------------------|
// | old run, no productSelection          | five_distinct_products          | 5      | yes               | Đã chọn đủ 5 sản phẩm khác nhau               | –                                                   |
// | top 8                                 | requested_distinct_products (8) | 8      | yes               | Đã chọn đủ 8/8 sản phẩm khác nhau             | –                                                   |
// | all                                   | requested_distinct_products (1) | 3      | no                | Đã chọn 3 sản phẩm                            | –                                                   |
// | top 8, FEWER_PRODUCTS_THAN_REQUESTED  | requested_distinct_products (8) | 6      | yes               | Chỉ chọn được 6/8 sản phẩm: nguồn không đủ …  | Không đủ 8 sản phẩm khác nhau. Giảm số Top hoặc …   |
// | v3 top 8 (F656)                       | requested_products (8)          | 8      | no                | Đã chọn đủ 8/8 sản phẩm                       | –                                                   |
// | v3 all                                | requested_products (1)          | 3      | no                | Đã lấy 3 sản phẩm Shopee                      | –                                                   |
// | v3 top 8, FEWER_PRODUCTS_THAN_REQUESTED | requested_products (8)        | 6      | no                | Chỉ chọn được 6/8 sản phẩm: nguồn không đủ sản phẩm Shopee | Không đủ 8 sản phẩm Shopee. Giảm số Top hoặc … |
// | v3 top 8, no count or gate result yet  | – (no check)                    | –      | no                | ? Chưa có kết quả chọn sản phẩm               | –                                                   |
// A v3 card's check lines and error bar never say «5», «khác nhau», «trùng» or «Jev». Its skipped table
// («Mục bị bỏ qua và lý do») has no «Trùng với thứ tự» column; the v2 table keeps it (Terra r1 #1).
// (outputs projects that code into both shortageReason and errorCode; the bar shows all the same, r2 #1)
test('the step 2 card follows the run\'s Top N or all choice', async () => {
  const slip = (id: string, want: number, ok: boolean) => ({ ...passSlip('M2'), verdict: ok ? 'PASS' : 'FAIL',
    checks: [{ id, ok, want }] });
  const v2 = (count: number, extra: any = {}) => ({ policy: 'metric-products-unique-v2', selectedCount: count,
    fiveDistinct: null, links: moduleOutputView('x').m2.links.slice(0, Math.min(count, 5)), ...extra });
  const v3 = (count: number, extra: any = {}) => v2(count, { policy: 'metric-products-top-v3', ...extra });
  const dead = { sourceRank: 2, productBaseId: '1__2002__801', reason: 'PRODUCT_UNAVAILABLE', duplicateOfRank: null };
  const rows: { label: string; selection?: any; gate: any; m2: any; same: boolean; line: string; bar: string | null;
    skippedHead?: string }[] = [
    { label: 'old', selection: undefined, gate: slip('five_distinct_products', 5, true), m2: { fiveDistinct: true },
      same: true, line: '✓Đã chọn đủ 5 sản phẩm khác nhau', bar: null },
    { label: 'top 8', selection: { mode: 'top', count: 8 }, gate: slip('requested_distinct_products', 8, true), m2: v2(8),
      same: true, line: '✓Đã chọn đủ 8/8 sản phẩm khác nhau', bar: null },
    { label: 'all', selection: { mode: 'all' }, gate: slip('requested_distinct_products', 1, true), m2: v2(3),
      same: false, line: '✓Đã chọn 3 sản phẩm', bar: null },
    { label: 'top 8 short', selection: { mode: 'top', count: 8 }, gate: slip('requested_distinct_products', 8, false),
      m2: v2(6, { shortageReason: 'FEWER_PRODUCTS_THAN_REQUESTED', errorCode: 'FEWER_PRODUCTS_THAN_REQUESTED', skipped: [dead] }),
      skippedHead: 'Hạng nguồn|Mã sản phẩm|Lý do|Trùng với thứ tự',
      same: true, line: '!Chỉ chọn được 6/8 sản phẩm: nguồn không đủ sản phẩm khác nhau',
      bar: 'Không đủ 8 sản phẩm khác nhau. Giảm số Top hoặc mở rộng bộ lọc.' },
    { label: 'v3 top 8', selection: { mode: 'top', count: 8 }, gate: slip('requested_products', 8, true), m2: v3(8),
      same: false, line: '✓Đã chọn đủ 8/8 sản phẩm', bar: null },
    { label: 'v3 all', selection: { mode: 'all' }, gate: slip('requested_products', 1, true), m2: v3(3),
      same: false, line: '✓Đã lấy 3 sản phẩm Shopee', bar: null },
    { label: 'v3 top 8 short', selection: { mode: 'top', count: 8 }, gate: slip('requested_products', 8, false),
      m2: v3(6, { shortageReason: 'FEWER_PRODUCTS_THAN_REQUESTED', errorCode: 'FEWER_PRODUCTS_THAN_REQUESTED', skipped: [dead] }),
      skippedHead: 'Hạng nguồn|Mã sản phẩm|Lý do',
      same: false, line: '!Chỉ chọn được 6/8 sản phẩm: nguồn không đủ sản phẩm Shopee',
      bar: 'Không đủ 8 sản phẩm Shopee. Giảm số Top hoặc mở rộng bộ lọc.' },
    { label: 'v3 top 8 pending', selection: { mode: 'top', count: 8 }, gate: { ...passSlip('M2'), verdict: 'FAIL', checks: [] },
      m2: v3(0, { selectedCount: null, links: [] }), same: false, line: '?Chưa có kết quả chọn sản phẩmChưa xác định.', bar: null },
  ];
  for (const row of rows) {
    const info: any = syntheticRunInfo();
    if (row.selection) info.request.productSelection = row.selection;
    if (row.label.startsWith('v3')) info.request.selectionPolicy = 'metric-products-top-v3';
    info.gates.m2 = row.gate;
    const run = harness({
      runs: [{ runId: 'run-synthetic', product: 'Sản phẩm tổng hợp', status: 'DONE' }], runInfo: info,
      moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId, {}, row.m2) }),
    });
    try {
      await waitFor(() => run.doc.querySelectorAll('#runList button').length === 1, row.label + ': list');
      runListButton(run.doc, 'run-synthetic').click();
      await waitFor(() => run.doc.getElementById('moM2Distinct') !== null, row.label + ': card');
      assert.equal(run.doc.getElementById('moM2Same') !== null, row.same, row.label + ': same line');
      assert.equal(element(run.doc, 'moM2Distinct').textContent, row.line, row.label + ': count line');
      const bar = run.doc.querySelector('.errbar.local-error[title="FEWER_PRODUCTS_THAN_REQUESTED"]');
      assert.equal(bar ? bar.textContent : null, row.bar, row.label + ': error bar');
      if (row.skippedHead) {
        const heads = [...element(run.doc, 'moM2Distinct').closest('article')!.querySelectorAll('details.tech-details th')].map((th) => th.textContent);
        assert.equal(heads.join('|'), row.skippedHead, row.label + ': skipped table columns');
      }
      if (row.label.startsWith('v3')) {
        const said = element(run.doc, 'moM2Distinct').closest('ul')!.textContent! + (bar ? bar.textContent : '');
        assert.doesNotMatch(said, /5|khác nhau|trùng|Jev/, row.label + ': no old rule words');
      }
    } finally { run.dom.window.close(); }
  }
});

// A deleted run shows nowhere (F645), one row each:
// | case                                                      | status bar                 | both run lists | detail / result | message                 |
// |-----------------------------------------------------------|----------------------------|----------------|-----------------|-------------------------|
// | a. «Xóa lượt» on the running run shown on the status bar  | the run is gone at once    | without it     | empty           | «Đã xóa lượt»           |
// | b. a coworker deleted it: list without it, progress stale | the run is gone            | without it     | empty           | –                       |
// | c. opening a run whose info says RUN_NOT_FOUND            | –                          | –              | empty, no other | «Lượt này đã bị xóa.», no red bar |
test('a deleted run leaves the status bar, both run lists and both tabs', async () => {
  const running = progressRun('run-a', ['PASS', 'PASS', 'RUNNING', 'IDLE'],
    { active: { step: 3, stage: null, done: 10, total: 100 } });
  const bar = (doc: Document) => element<HTMLElement>(doc, 'runStatus').textContent!;
  const listed = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => b.textContent!).join('|');
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'RUNNING' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const setup = (gone = false) => harness({
    runs: gone ? [runB, runA] : [runA, runB],     // c: the first run (opened at start) is the live one
    runInfoByRun: gone ? { 'run-b': syntheticRunInfo('run-b') }
      : { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    runsProgressResults: [progressReply([running])],
  });
  const idle = 'Không có lượt nào đang chạy';

  // a
  let run = setup();
  try {
    await waitFor(() => bar(run.doc).includes('Sản phẩm A'), 'a: bar shows run-a');
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, 'a: run open');
    element<HTMLButtonElement>(run.doc, 'btnDeleteRun').click();
    const polls = run.state.runsProgressCalls;
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(run.doc, 'toast').textContent === 'Đã xóa lượt', 'a: deleted');
    assert.equal(bar(run.doc), idle, 'a: status bar at once');
    await waitFor(() => !listed(run.doc, 'runList').includes('Sản phẩm A'), 'a: track list');
    assert.doesNotMatch(listed(run.doc, 'resultRunList'), /Sản phẩm A/, 'a: result list');
    assert.equal(run.doc.getElementById('btnDeleteRun'), null, 'a: detail left');
    assert.doesNotMatch(element(run.doc, 'resultDetail').textContent!, /Sản phẩm A/, 'a: result tab');
    await waitFor(() => run.state.runsProgressCalls > polls, 'a: progress polled at once');
    assert.equal(bar(run.doc), idle, 'a: still gone after the poll');
  } finally { run.dom.window.close(); }

  // b
  run = setup();
  try {
    await waitFor(() => bar(run.doc).includes('Sản phẩm A') && listed(run.doc, 'runList').includes('Sản phẩm A'), 'b: shown');
    run.state.runsView = run.state.runsView.filter((item: any) => item.runId !== 'run-a');     // deleted elsewhere
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();               // «Kết quả chạy»
    await waitFor(() => !listed(run.doc, 'resultRunList').includes('Sản phẩm A'), 'b: list refreshed');
    assert.equal(bar(run.doc), idle, 'b: status bar pruned');
    assert.doesNotMatch(listed(run.doc, 'resultRunList'), /Sản phẩm A/, 'b: result list');
  } finally { run.dom.window.close(); }

  // c
  run = setup(true);
  try {
    await waitFor(() => run.doc.querySelectorAll('#runList button.runbtn').length === 2, 'c: list');
    run.state.runsView = run.state.runsView.filter((item: any) => item.runId !== 'run-a');
    runListButton(run.doc, 'run-a').click();     // the list still shows it; the server no longer has it
    await waitFor(() => element(run.doc, 'toast').textContent === 'Lượt này đã bị xóa.', 'c: told');
    assert.equal(element(run.doc, 'errbar').hidden, true, 'c: no red bar');
    assert.equal(run.doc.getElementById('btnDeleteRun'), null, 'c: no run open, not another one');
    await waitFor(() => !listed(run.doc, 'runList').includes('Sản phẩm A'), 'c: list refreshed');
  } finally { run.dom.window.close(); }
});

// Late replies never bring a deleted run back (F645, Terra r1 on #508), one row each:
// | # | situation                                                              | expected                                              |
// |---|------------------------------------------------------------------------|-------------------------------------------------------|
// | 1 | «Xem lượt» on a notice of a run a coworker deleted                     | «Lượt này đã bị xóa.», empty detail, no other run     |
// | 2 | a progress reply sent before «Xóa lượt» arrives after it               | status bar stays idle, no notice                      |
// | 2 | a step 2 event waiting for the run's status when it is deleted         | no notice                                             |
// | 4 | «Xóa lượt» succeeds, the list refresh is slow                          | both lists without the run at once                    |
// (#3 is in shopee-desktop-step1-ui.test.ts; #5 in test_metric_browser.py; #6, the local picture reply, uses the
// same isGone check as #2 and is not visible on the page.)
test('late replies never bring a deleted run back', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'RUNNING' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const infos = { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') };
  const idleA = progressRun('run-a', ['PASS', 'RUNNING', 'IDLE', 'IDLE'], { active: { step: 2, stage: null, done: null, total: null } });
  const passA = progressRun('run-a', ['PASS', 'PASS', 'RUNNING', 'IDLE'], { active: { step: 3, stage: null, done: 1, total: 9 } });
  const bar = (doc: Document) => element<HTMLElement>(doc, 'runStatus').textContent!;
  const idle = 'Không có lượt nào đang chạy';
  const listed = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => b.textContent!).join('|');
  const deleteOpenRun = async (run: ReturnType<typeof harness>) => {
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, 'run-a open');
    element<HTMLButtonElement>(run.doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
  };

  // 1
  let phase = 'before';
  const infos1: Record<string, any> = { ...infos };
  let run = harness({ runs: [runA, runB], runInfoByRun: infos1, hasFocus: true, fastProgress: true,
    runsProgressFor: () => progressReply([phase === 'before' ? idleA : passA]) });
  try {
    await waitFor(() => run.state.runsProgressCalls >= 2, '1: first polls');
    phase = 'after';
    await waitFor(() => run.doc.querySelector('#noticeBox .notice-go') !== null, '1: notice');
    delete infos1['run-a'];                                                                   // deleted elsewhere
    run.doc.querySelector<HTMLAnchorElement>('#noticeBox .notice-go')!.click();
    await waitFor(() => element(run.doc, 'toast').textContent === 'Lượt này đã bị xóa.', '1: told');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(run.doc.getElementById('btnDeleteRun'), null, '1: no other run opened');
    assert.equal(element(run.doc, 'runDetail').textContent, 'Chọn một lượt bên trái.');
    assert.equal(element(run.doc, 'errbar').hidden, true);
  } finally { run.dom.window.close(); }

  // 2: a progress reply in flight across the delete
  let held: Deferred<void> | null = null;
  run = harness({ runs: [runA, runB], runInfoByRun: infos, hasFocus: true,
    runsProgressFor: async (call) => {
      if (held) await held.promise;
      return progressReply([call < 3 ? idleA : passA]);
    } });
  try {
    await waitFor(() => bar(run.doc).includes('Sản phẩm A'), '2: bar shows run-a');
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => listed(run.doc, 'runList').includes('Sản phẩm A'), '2: list');
    held = deferred<void>();
    await deleteOpenRun(run);
    await waitFor(() => element(run.doc, 'toast').textContent === 'Đã xóa lượt', '2: deleted');
    held.resolve();                                     // the replies captured with run-a arrive now
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(bar(run.doc), idle, '2: stale progress dropped');
    assert.equal(element(run.doc, 'noticeBox').children.length, 0, '2: no notice from stale progress');
  } finally { run.dom.window.close(); }

  // 2: a queued event waiting for the deleted run's status
  let statusHold: Deferred<void> | null = null;
  let progressPhase = 'before';
  run = harness({ runs: [runA, runB], runInfoByRun: infos, hasFocus: true, fastProgress: true,
    statusGate: (runId) => (runId === 'run-a' && statusHold ? statusHold : undefined),
    runsProgressFor: () => progressReply([progressPhase === 'before' ? idleA : passA]) });
  try {
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => listed(run.doc, 'runList').includes('Sản phẩm A'), '2b: list');
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, '2b: run-a open');
    statusHold = deferred<void>();
    const asked = run.state.statusCalls.length;
    progressPhase = 'after';                            // step 2 PASS: the event asks run-a's status, held
    await waitFor(() => run.state.statusCalls.length > asked, '2b: event waits for the status');
    element<HTMLButtonElement>(run.doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(run.doc, 'toast').textContent === 'Đã xóa lượt', '2b: deleted');
    statusHold.resolve();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(element(run.doc, 'noticeBox').children.length, 0, '2b: no notice for the deleted run');
  } finally { run.dom.window.close(); }

  // 4
  let listHold: Deferred<void> | null = null;
  run = harness({ runs: [runA, runB], runInfoByRun: infos, listRunsHold: () => listHold?.promise });
  try {
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => listed(run.doc, 'runList').includes('Sản phẩm A'), '4: list');
    listHold = deferred<void>();
    await deleteOpenRun(run);
    await waitFor(() => element(run.doc, 'toast').textContent === 'Đã xóa lượt', '4: deleted');
    assert.doesNotMatch(listed(run.doc, 'runList'), /Sản phẩm A/, '4: track list at once');
    assert.doesNotMatch(listed(run.doc, 'resultRunList'), /Sản phẩm A/, '4: result list at once');
    listHold.resolve();
  } finally { run.dom.window.close(); }
});

// When a run counts as gone (F645, Terra r2 on #508), one row each:
// | # | situation                                                           | expected                                                    |
// |---|---------------------------------------------------------------------|-------------------------------------------------------------|
// | 1 | info says RUN_NOT_FOUND, the list refresh is slow                   | both lists without the run at once, «Lượt này đã bị xóa.»   |
// | 2 | a new run in progress while the run list fails                      | no notice, not «đã bị xóa»; listed once the list works      |
// (#3 is in shopee-desktop-step1-ui.test.ts. #4, a late local-picture open or save after the delete, writes no
// per-run state; nothing of it is visible on the page.)
test('a run is gone only on delete, RUN_NOT_FOUND or a successful list without it', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'DONE' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const runC = { runId: 'run-c', product: 'Sản phẩm C', status: 'RUNNING' };
  const listed = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => b.textContent!).join('|');

  // 1
  let listHold: Deferred<void> | null = null;
  let run = harness({ runs: [runB, runA], runInfoByRun: { 'run-b': syntheticRunInfo('run-b') },
    listRunsHold: () => listHold?.promise });
  try {
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => listed(run.doc, 'runList').includes('Sản phẩm A'), '1: list');
    listHold = deferred<void>();
    runListButton(run.doc, 'run-a').click();      // the server no longer has it
    await waitFor(() => element(run.doc, 'toast').textContent === 'Lượt này đã bị xóa.', '1: told');
    assert.doesNotMatch(listed(run.doc, 'runList'), /Sản phẩm A/, '1: track list at once');
    assert.doesNotMatch(listed(run.doc, 'resultRunList'), /Sản phẩm A/, '1: result list at once');
    listHold.resolve();
  } finally { run.dom.window.close(); }

  // 2
  let phase = 'before';
  let listFails = false;
  run = harness({ runs: [runB], runInfoByRun: { 'run-b': syntheticRunInfo('run-b'), 'run-c': syntheticRunInfo('run-c') },
    hasFocus: true, fastProgress: true,
    listRunsError: () => (listFails ? { ok: false, error: { code: 'REMOTE_OUTPUT_INVALID', message: 'REMOTE_OUTPUT_INVALID' } } : undefined),
    runsProgressFor: () => progressReply(phase === 'before' ? []
      : [progressRun('run-c', ['RUNNING', 'IDLE', 'IDLE', 'IDLE'], { active: { step: 1, stage: null, done: null, total: null } })]) });
  try {
    await waitFor(() => run.state.runsProgressCalls >= 2, '2: first polls');
    listFails = true;                              // run-c is new: not in any successful list yet
    phase = 'after';
    await waitFor(() => !element(run.doc, 'errbar').hidden, '2: list error shown');
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(run.doc.querySelectorAll('#noticeBox .notice').length, 0, '2: no notice for an unlisted run');
    assert.notEqual(element(run.doc, 'toast').textContent, 'Lượt này đã bị xóa.', '2: not told gone');
    listFails = false;
    run.state.runsView = [runC, runB];
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => listed(run.doc, 'runList').includes('Sản phẩm C'), '2: run-c shows once listed');
  } finally { run.dom.window.close(); }
});

// The screen shows only runs in the latest successful list (F645, Terra r6 on #508), one row each:
// | # | situation                                                                     | expected                              |
// |---|-------------------------------------------------------------------------------|---------------------------------------|
// | 1 | run A only in progress, the latest list does not have it                      | no notice, bar idle, not listed       |
// | 2 | a list asked before A was seen answers late without it; a newer list has A    | A kept: listed, its notice stays      |
// | 3 | A missing from one successful list, back in the next                          | A listed and on the bar again         |
test('the screen shows only runs in the latest successful list, and a run back in a list shows again', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'RUNNING' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const startA = progressRun('run-a', ['RUNNING', 'IDLE', 'IDLE', 'IDLE'], { active: { step: 1, stage: null, done: null, total: null } });
  const bar = (doc: Document) => element<HTMLElement>(doc, 'runStatus').textContent!;
  const listed = (doc: Document) => [...doc.querySelectorAll<HTMLButtonElement>('#runList button.runbtn')]
    .map((b) => b.textContent!).join('|');
  const runsReply = (runs: any[]) => ({ ok: true, data: { format: 'runs-v1', runs } });

  // 1
  let phase = 'before';
  let run = harness({ runs: [runB], runInfoByRun: { 'run-b': syntheticRunInfo('run-b') }, hasFocus: true, fastProgress: true,
    runsProgressFor: () => progressReply(phase === 'before' ? [] : [startA]) });
  try {
    await waitFor(() => run.state.runsProgressCalls >= 2, '1: first polls');
    const lists = run.state.listRunsCalls;
    phase = 'after';
    await waitFor(() => run.state.listRunsCalls > lists, '1: a list asked after A was seen');
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.equal(element(run.doc, 'noticeBox').children.length, 0, '1: no notice');
    assert.equal(bar(run.doc), 'Không có lượt nào đang chạy', '1: bar idle');
    assert.doesNotMatch(listed(run.doc), /Sản phẩm A/, '1: not listed');
  } finally { run.dom.window.close(); }

  // 2
  phase = 'before';
  let early: Deferred<void> | null = null;
  let earlyCall = 0;
  run = harness({ runs: [runB], runInfoByRun: { 'run-b': syntheticRunInfo('run-b') }, hasFocus: true, fastProgress: true,
    runsProgressFor: () => progressReply(phase === 'before' ? [] : [startA]),
    listRunsReply: async (call) => {
      if (call === earlyCall && early) { await early.promise; return runsReply([runB]); }   // asked before A existed
      return phase === 'after' ? runsReply([runA, runB]) : undefined;
    } });
  try {
    await waitFor(() => run.state.runsProgressCalls >= 2, '2: first polls');
    early = deferred<void>();
    earlyCall = run.state.listRunsCalls + 1;
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();     // the early list, held
    await waitFor(() => run.state.listRunsCalls >= earlyCall, '2: early list asked');
    phase = 'after';
    await waitFor(() => listed(run.doc).includes('Sản phẩm A'), '2: newer list has A');
    early.resolve();
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert.match(listed(run.doc), /Sản phẩm A/, '2: A kept in the list');
    assert.ok(run.doc.querySelector('#noticeBox .notice') !== null, '2: its notice stays');
  } finally { run.dom.window.close(); }

  // 3
  let hideA = false;
  run = harness({ runs: [runB, runA], runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    hasFocus: true, runsProgressFor: () => progressReply([startA]),
    listRunsReply: async () => (hideA ? runsReply([runB]) : undefined) });
  try {
    const tab = (index: number) => [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
    tab(1);
    await waitFor(() => listed(run.doc).includes('Sản phẩm A') && bar(run.doc).includes('Sản phẩm A'), '3: A shown');
    hideA = true;
    tab(2);
    tab(1);
    await waitFor(() => !listed(run.doc).includes('Sản phẩm A') && !bar(run.doc).includes('Sản phẩm A'), '3: A not shown');
    hideA = false;
    tab(2);
    tab(1);
    await waitFor(() => listed(run.doc).includes('Sản phẩm A') && bar(run.doc).includes('Sản phẩm A'), '3: A shown again');
  } finally { run.dom.window.close(); }
});

// Delete and step 4 «Chạy tiếp» against a run that is going away (F645, Terra r4 on #508), one row each:
// | # | situation                                                          | expected                                            |
// |---|--------------------------------------------------------------------|-----------------------------------------------------|
// | 1 | «Xóa» answers RUN_NOT_FOUND (a coworker deleted it first)          | box closed, run gone from both lists, told once     |
// | 2 | «Chạy tiếp» is still on its way when the run is deleted             | its late reply loads nothing for the deleted run    |
// (Every other per-run request is checked the same way right after it returns; one row is not kept per request.)
test('delete and step 4 resume replies for a run that is going away', async () => {
  const listed = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => b.textContent!).join('|');

  // 1
  let run = step4Harness({ deleteRunResult: () => ({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } }) });
  try {
    await waitFor(() => run.doc.querySelectorAll('#runList button').length === 4, '1: list');
    runListButton(run.doc, 'run-pass').click();
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, '1: open');
    element<HTMLButtonElement>(run.doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(run.doc, 'toast').textContent === 'Lượt này đã bị xóa.', '1: told');
    const dialog = element<HTMLDialogElement>(run.doc, 'deleteDialog');
    assert.ok(!(dialog.open || dialog.hasAttribute('open')), '1: box closed');
    assert.equal(element(run.doc, 'deleteErr').hidden, true, '1: no error in the box');
    assert.doesNotMatch(listed(run.doc, 'runList'), /run-pass/, '1: track list');
    assert.doesNotMatch(listed(run.doc, 'resultRunList'), /run-pass/, '1: result list');
    assert.equal(run.doc.getElementById('btnDeleteRun'), null, '1: detail left');
  } finally { run.dom.window.close(); }

  // 2
  const resume = deferred<void>();
  run = step4Harness({
    processReviewDataResult: (runId, sourceSha256) => resume.promise.then(() =>
      ({ ok: true, data: { format: 'review-process-start-v1', runId, sourceSha256, status: 'RUNNING', pid: 4321 } })),
  });
  try {
    await waitFor(() => run.doc.querySelectorAll('#runList button').length === 4, '2: list');
    runListButton(run.doc, 'run-fail').click();
    await waitFor(() => run.doc.getElementById('s4Resume') !== null, '2: «Chạy tiếp»');
    element<HTMLButtonElement>(run.doc, 's4Resume').click();
    await waitFor(() => run.state.processReviewDataCalls.length === 1, '2: resume sent');
    element<HTMLButtonElement>(run.doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(run.doc, 'toast').textContent === 'Đã xóa lượt', '2: deleted');
    const loads = run.state.reviewProcessCalls.length;
    resume.resolve();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.deepEqual(run.state.reviewProcessCalls.slice(loads).filter((id) => id === 'run-fail'), [],
      '2: nothing loaded for the deleted run');
  } finally { run.dom.window.close(); }
});

// Gone-run evidence and cleanup (F645, Terra r5 on #508), one row each:
// | # | situation                                                                      | expected                                  |
// |---|--------------------------------------------------------------------------------|-------------------------------------------|
// | 2 | a step 2 completion event asks X's status and gets RUN_NOT_FOUND               | no notice; X gone from the lists          |
// | 3 | X, open with a sampling poll running, drops out of a successful list           | the sampling poll for X stops             |
test('gone-run evidence from a status, and the polls of a run no longer listed stop', async () => {
  const runX = { runId: 'run-x', product: 'Sản phẩm X', status: 'DONE' };
  const runY = { runId: 'run-y', product: 'Sản phẩm Y', status: 'DONE' };
  const listed = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => b.textContent!).join('|');
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();

  // 2
  let phase = 'before';
  let run = harness({ runs: [runY, runX], runInfoByRun: { 'run-y': syntheticRunInfo('run-y') }, hasFocus: true, fastProgress: true,
    runsProgressFor: () => progressReply([progressRun('run-x', phase === 'before' ? ['PASS', 'RUNNING', 'IDLE', 'IDLE']
      : ['PASS', 'PASS', 'RUNNING', 'IDLE'], { active: phase === 'before' ? { step: 2, stage: null, done: null, total: null }
      : { step: 3, stage: null, done: 1, total: 9 } })]) });
  try {
    await waitFor(() => run.state.runsProgressCalls >= 2 && listed(run.doc, 'runList').includes('Sản phẩm X'), '2: first polls');
    phase = 'after';                                   // step 2 PASS: the event asks X's status -> RUN_NOT_FOUND
    await waitFor(() => run.state.statusCalls.includes('run-x'), '2: status asked');
    await waitFor(() => !listed(run.doc, 'runList').includes('Sản phẩm X'), '2: X gone');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(run.doc.querySelectorAll('#noticeBox .notice').length, 0, '2: no notice');
  } finally { run.dom.window.close(); }

  // 3
  const attempt = {
    attemptId: 'attempt-x', planSha256: 'c'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  let newRun = false;
  run = harness({ runs: [runX, runY], runInfoByRun: { 'run-x': syntheticRunInfo('run-x'), 'run-y': syntheticRunInfo('run-y') },
    samplingByRun: { 'run-x': syntheticSampling({ runId: 'run-x', attempts: [attempt] }) }, fastPoll: true, fastProgress: true,
    // A run the list does not have yet makes the app list again by itself (no tab switch, no new selection).
    runsProgressFor: () => progressReply(newRun ? [progressRun('run-z', ['RUNNING', 'IDLE', 'IDLE', 'IDLE'])] : []) });
  try {
    tab(run.doc, 1);
    await waitFor(() => (run.state.reviewSamplingCallsByRun['run-x'] || 0) >= 3, '3: sampling poll runs for X');
    run.state.runsView = [runY];                       // deleted elsewhere
    const lists = run.state.listRunsCalls;
    newRun = true;
    await waitFor(() => run.state.listRunsCalls > lists && !listed(run.doc, 'runList').includes('Sản phẩm X'), '3: X gone');
    const calls = run.state.reviewSamplingCallsByRun['run-x'] || 0;
    await new Promise((resolve) => setTimeout(resolve, 150));
    assert.equal(run.state.reviewSamplingCallsByRun['run-x'] || 0, calls, '3: no more sampling calls for X');
  } finally { run.dom.window.close(); }
});

// Our own «Xóa lượt» on the run just created in «Tạo lượt mới» (F645, Terra r6 #3 on #508):
// | situation                                          | expected                                                  |
// |----------------------------------------------------|-----------------------------------------------------------|
// | create run-bound, open it in «Theo dõi», delete it | the new-run panel names no run and its form is editable   |
test('deleting the run just created frees the new-run panel', async () => {
  const { dom, doc } = harness({
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-bound' } }),
    runInfoByRun: { 'run-bound': createdRunInfo('run-bound') },
  });
  try {
    await booted(doc);
    chooseStars(doc, [2, 3], 500);
    create(doc);
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === false, 'binding shown');
    assertDraftFrozen(doc);
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => [...doc.querySelectorAll<HTMLButtonElement>('#runList button')].some((b) => (b.title || '').includes('Mã lượt run-bound')), 'listed');
    runListButton(doc, 'run-bound').click();
    await waitFor(() => doc.getElementById('btnDeleteRun') !== null, 'open');
    element<HTMLButtonElement>(doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(doc, 'toast').textContent === 'Đã xóa lượt', 'deleted');
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][0]!.click();
    await waitFor(() => element<HTMLElement>(doc, 'newResult').hidden === true, 'the panel names no run');
    assertDraftEditable(doc);
  } finally { dom.window.close(); }
});

// A create reply for a run deleted before it came (F645, Terra r7 #3 on #508):
// | situation                                                              | expected                              |
// |------------------------------------------------------------------------|---------------------------------------|
// | form changed, the new run listed and deleted, then the create reply    | no notice names the deleted run       |
test('a create reply for a run already deleted names nothing', async () => {
  const gate = deferred<any>();
  const { dom, doc, state } = harness({
    newRunGate: gate,
    newRunResult: () => ({ ok: true, data: { format: 'new-run-v1', runId: 'run-late' } }),
    runInfoByRun: { 'run-late': createdRunInfo('run-late') },
  });
  try {
    await booted(doc);
    create(doc);
    await waitFor(() => state.newRunCalls === 1, 'new-run in flight');
    element<HTMLInputElement>(doc, 'newTotal').value = '501';
    element<HTMLInputElement>(doc, 'newTotal').dispatchEvent(new (doc.defaultView as any).Event('input', { bubbles: true }));
    state.runsView = [{ runId: 'run-late', product: 'Sản phẩm mới', status: 'IDLE' }, ...state.runsView];
    [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => [...doc.querySelectorAll<HTMLButtonElement>('#runList button')]
      .some((b) => (b.title || '').includes('Mã lượt run-late')), 'listed');
    runListButton(doc, 'run-late').click();
    await waitFor(() => doc.getElementById('btnDeleteRun') !== null, 'open');
    element<HTMLButtonElement>(doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(doc, 'toast').textContent === 'Đã xóa lượt', 'deleted');
    gate.resolve({ ok: true, data: { format: 'new-run-v1', runId: 'run-late' } });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.doesNotMatch(element<HTMLElement>(doc, 'newNotice').textContent || '', /run-late/, 'no notice names it');
  } finally { dom.window.close(); }
});

// Opening a run and overlapping lists follow the latest successful list (F645, Terra r8 on #508), one row each:
// | # | situation                                                                  | expected                                      |
// |---|----------------------------------------------------------------------------|-----------------------------------------------|
// | 1 | «Xem lượt» on A's notice; the list it asks omits A, A's status still works | empty detail; A opens once a later list has it |
// | 2 | list 1 answers without X after list 2 (asked later) failed                 | X gone from the shown list all the same        |
test('opening a run and overlapping lists follow the latest successful list', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'RUNNING' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const runX = { runId: 'run-x', product: 'Sản phẩm X', status: 'DONE' };
  const runY = { runId: 'run-y', product: 'Sản phẩm Y', status: 'DONE' };
  const listed = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => b.textContent!).join('|');
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
  const runsReply = (runs: any[]) => ({ ok: true, data: { format: 'runs-v1', runs } });

  // 1
  let phase = 'before';
  let hideA = false;
  let run = harness({ runs: [runB, runA], runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    hasFocus: true, fastProgress: true,
    runsProgressFor: () => progressReply([progressRun('run-a', phase === 'before' ? ['PASS', 'RUNNING', 'IDLE', 'IDLE']
      : ['PASS', 'PASS', 'RUNNING', 'IDLE'], { active: phase === 'before' ? { step: 2, stage: null, done: null, total: null }
      : { step: 3, stage: null, done: 1, total: 9 } })]),
    listRunsReply: async () => (hideA ? runsReply([runB]) : undefined) });
  try {
    await waitFor(() => run.state.runsProgressCalls >= 2, '1: first polls');
    phase = 'after';
    await waitFor(() => run.doc.querySelector('#noticeBox .notice-go') !== null, '1: notice');
    hideA = true;
    await new Promise((resolve) => setTimeout(resolve, 30));
    const asked = run.state.statusCalls.filter((id) => id === 'run-a').length;
    run.doc.querySelector<HTMLAnchorElement>('#noticeBox .notice-go')!.click();
    await waitFor(() => !listed(run.doc, 'runList').includes('Sản phẩm A'), '1: list without A');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(run.state.statusCalls.filter((id) => id === 'run-a').length, asked, '1: A not opened');
    assert.equal(element(run.doc, 'runDetail').textContent, 'Chọn một lượt bên trái.', '1: empty detail');
    hideA = false;
    tab(run.doc, 2);
    tab(run.doc, 1);
    await waitFor(() => (run.doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-a') &&
      run.doc.getElementById('btnDeleteRun') !== null, '1: A opens once listed');
  } finally { run.dom.window.close(); }

  // 2
  const held = deferred<void>();
  let aCall = 0;
  let bCall = 0;
  run = harness({ runs: [runX, runY], runInfoByRun: { 'run-x': syntheticRunInfo('run-x'), 'run-y': syntheticRunInfo('run-y') },
    listRunsError: () => (run && run.state.listRunsCalls === bCall
      ? { ok: false, error: { code: 'REMOTE_OUTPUT_INVALID', message: 'REMOTE_OUTPUT_INVALID' } } : undefined),
    listRunsReply: async (call) => {
      if (call !== aCall) return undefined;
      await held.promise;
      return runsReply([runY]);
    } });
  try {
    await waitFor(() => listed(run.doc, 'runList').includes('Sản phẩm X'), '2: X listed');
    aCall = run.state.listRunsCalls + 1;
    tab(run.doc, 1);                                   // list 1, held
    await waitFor(() => run.state.listRunsCalls >= aCall, '2: list 1 asked');
    bCall = run.state.listRunsCalls + 1;
    tab(run.doc, 2);                                   // list 2, fails
    await waitFor(() => !element(run.doc, 'errbar').hidden, '2: list 2 failed');
    held.resolve();
    await waitFor(() => listed(run.doc, 'resultRunList').includes('Sản phẩm Y') &&
      !listed(run.doc, 'resultRunList').includes('Sản phẩm X'), '2: X gone from the shown list');
  } finally { run.dom.window.close(); }
});

// The run list order (F648), one row each:
// | # | situation                                                     | expected order (newest = C)               |
// |---|---------------------------------------------------------------|-------------------------------------------|
// | 1 | first open                                                    | «Mới tạo trước» pressed: C, B, A          |
// | 2 | «Cũ nhất trước»                                               | A, B, C on both tabs; kept on this PC     |
// | 3 | «Cũ nhất trước» with «Lọc theo trạng thái» = done             | A, C                                      |
// | 4 | the app opened again                                          | «Cũ nhất trước» pressed: A, B, C          |
// | 5 | «Kết quả chạy»: «Lọc theo trạng thái» (the same choices) =    | B there; the track tab keeps done: A, C   |
// |   | running, with «Cũ nhất trước»                                 |                                           |
test('the run lists sort newest or oldest first, with the status filter, and keep the choice', async () => {
  const runs = [
    { runId: 'run-b', product: 'Sản phẩm B', status: 'RUNNING', createdAt: '2026-11-02T03:00:00.000Z' },
    { runId: 'run-a', product: 'Sản phẩm A', status: 'DONE', createdAt: '2026-11-01T03:00:00.000Z' },
    { runId: 'run-c', product: 'Sản phẩm C', status: 'DONE', createdAt: '2026-11-03T03:00:00.000Z' },
  ];
  const infos = { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b'), 'run-c': syntheticRunInfo('run-c') };
  const order = (doc: Document, list: string) => [...doc.querySelectorAll<HTMLButtonElement>('#' + list + ' button.runbtn')]
    .map((b) => (b.title.match(/run-(\w)/) || [])[1]).join('');
  const pressed = (doc: Document, screen: string) => doc.querySelector('#scr-' + screen + ' [data-run-sort][aria-pressed="true"]')!
    .getAttribute('data-run-sort');
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();

  let run = harness({ runs, runInfoByRun: infos });
  try {
    tab(run.doc, 1);
    // 1
    await waitFor(() => order(run.doc, 'runList') === 'cba', '1: newest first');
    assert.equal(pressed(run.doc, 'track'), 'newest');
    // 2
    run.doc.querySelector<HTMLButtonElement>('#scr-track [data-run-sort="oldest"]')!.click();
    assert.equal(order(run.doc, 'runList'), 'abc', '2: oldest first');
    assert.equal(pressed(run.doc, 'track'), 'oldest');
    await waitFor(() => run.state.runSortSaved === 'oldest', '2: kept on this PC');
    tab(run.doc, 2);
    await waitFor(() => order(run.doc, 'resultRunList') === 'abc', '2: the result tab too');
    assert.equal(pressed(run.doc, 'result'), 'oldest');
    // 3
    tab(run.doc, 1);
    const filter = element<HTMLSelectElement>(run.doc, 'runFilter');
    filter.value = 'done';
    filter.dispatchEvent(new (run.dom.window as any).Event('change', { bubbles: true }));
    await waitFor(() => order(run.doc, 'runList') === 'ac', '3: filter and order together');
    // 5
    tab(run.doc, 2);
    const resultFilter = element<HTMLSelectElement>(run.doc, 'resultRunFilter');
    const choices = (select: HTMLSelectElement) => [...select.options].map((option) => option.value + '=' + option.textContent);
    assert.deepEqual(choices(resultFilter), choices(filter), '5: the same choices');
    assert.equal(resultFilter.value, 'all', '5: its own choice');
    await waitFor(() => order(run.doc, 'resultRunList') === 'abc', '5: every run until chosen');
    resultFilter.value = 'running';
    resultFilter.dispatchEvent(new (run.dom.window as any).Event('change', { bubbles: true }));
    await waitFor(() => order(run.doc, 'resultRunList') === 'b', '5: filtered');
    tab(run.doc, 1);
    await waitFor(() => order(run.doc, 'runList') === 'ac', '5: the track tab keeps its choice');
  } finally { run.dom.window.close(); }

  // 4
  run = harness({ runs, runInfoByRun: infos, runSortSaved: 'oldest' });
  try {
    tab(run.doc, 1);
    await waitFor(() => order(run.doc, 'runList') === 'abc' && pressed(run.doc, 'track') === 'oldest', '4: restored');
  } finally { run.dom.window.close(); }
});

// Opening the track and result tabs fast (F647 change 1), one row each:
// | # | situation                                              | expected before the slow reply comes                     |
// |---|--------------------------------------------------------|-----------------------------------------------------------|
// | 1 | open run A again while its run-info is slow            | A's last detail is shown, with «Đang cập nhật…»           |
// | 2 | open run A while its run-info is slow                  | sampling, review data, outputs and step 4 are asked       |
// | 3 | click «Chi tiết lịch sử lượt chạy» while the list is slow | the open run's run-info is asked; «Đang cập nhật…» shown |
test('the run tabs show what they have at once and ask everything together', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'DONE' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  let statusHold: Deferred<void> | null = null;
  let listHold: Deferred<void> | null = null;
  const run = harness({ runs: [runA, runB], runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    statusGate: (runId) => (runId === 'run-a' && statusHold ? statusHold : undefined),
    listRunsHold: () => listHold?.promise });
  const tab = (index: number) => [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
  const heading = () => run.doc.querySelector('#runDetail h2')?.textContent || '';
  const marked = () => [...run.doc.querySelectorAll<HTMLElement>('.refresh-mark')].some((mark) => !mark.hidden);
  try {
    tab(1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && !marked(), 'run-a open');
    const headA = heading();
    runListButton(run.doc, 'run-b').click();
    await waitFor(() => heading() !== headA && !marked(), 'run-b open');

    // 1 and 2
    statusHold = deferred<void>();
    const asked = {
      sampling: run.state.reviewSamplingCallsByRun['run-a'] || 0,
      data: run.state.reviewDataCallsByRun['run-a'] || 0,
      outputs: run.state.moduleOutputsCalls.filter((id) => id === 'run-a').length,
      process: run.state.reviewProcessCalls.filter((id) => id === 'run-a').length,
    };
    runListButton(run.doc, 'run-a').click();
    assert.equal(heading(), headA, '1: the last detail at once');
    assert.equal(marked(), true, '1: «Đang cập nhật…»');
    await waitFor(() => (run.state.reviewSamplingCallsByRun['run-a'] || 0) > asked.sampling &&
      (run.state.reviewDataCallsByRun['run-a'] || 0) > asked.data &&
      run.state.moduleOutputsCalls.filter((id) => id === 'run-a').length > asked.outputs &&
      run.state.reviewProcessCalls.filter((id) => id === 'run-a').length > asked.process, '2: all asked with run-info');
    assert.equal(heading(), headA, '1: still shown while run-info is slow');
    statusHold.resolve();
    statusHold = null;
    await waitFor(() => !marked(), 'run-a fresh');

    // 3
    tab(2);
    listHold = deferred<void>();
    const statusAsked = run.state.statusCalls.length;
    tab(1);
    await waitFor(() => run.state.statusCalls.length > statusAsked, '3: run-info asked while the list is slow');
    assert.equal(run.state.statusCalls.at(-1), 'run-a');
    assert.equal(marked(), true, '3: «Đang cập nhật…»');
    listHold.resolve();
    await waitFor(() => !marked(), '3: mark gone after the list');
  } finally { run.dom.window.close(); }
});

// «Đang cập nhật…» follows the whole refresh of the open run (F647, Terra r1 minor on #510), one row each:
// | # | situation                                                                  | expected                          |
// |---|----------------------------------------------------------------------------|-----------------------------------|
// | 1 | run-info and the list answered, review data still on its way              | the mark stays until it answers   |
// | 2 | single calls: a running run reopened; the poll asks run-info again while the first is slow | the mark goes once both answer |
test('the refresh mark follows every call of the open run and never sticks', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'RUNNING' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const running: any = syntheticRunInfo('run-a');
  running.state = { status: 'RUNNING', module: 'M3', errorCode: null };
  const marked = (doc: Document) => [...doc.querySelectorAll<HTMLElement>('.refresh-mark')].some((mark) => !mark.hidden);
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();

  // 1
  let dataHold: Deferred<void> | null = null;
  let run = harness({ runs: [runB, runA], runInfoByRun: { 'run-a': syntheticRunInfo('run-a'), 'run-b': syntheticRunInfo('run-b') },
    reviewDataHold: (runId) => (runId === 'run-a' && dataHold ? dataHold.promise : undefined) });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && !marked(run.doc), '1: run-b open');
    dataHold = deferred<void>();
    const statusAsked = run.state.statusCalls.length;
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => run.state.statusCalls.length > statusAsked && run.state.listRunsCalls > 0, '1: run-info asked');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(marked(run.doc), true, '1: review data still on its way');
    dataHold.resolve();
    await waitFor(() => !marked(run.doc), '1: gone once it answers');
  } finally { run.dom.window.close(); }

  // 2
  let statusHold: Deferred<void> | null = null;
  run = harness({ runs: [runA, runB], runInfoByRun: { 'run-a': running, 'run-b': syntheticRunInfo('run-b') }, fastPoll: true,
    oldServer: true, statusGate: (runId) => (runId === 'run-a' && statusHold ? statusHold : undefined) });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && !marked(run.doc), '2: run-a open, polled');
    statusHold = deferred<void>();
    const asked = run.state.statusCalls.filter((id) => id === 'run-a').length;
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => run.state.statusCalls.filter((id) => id === 'run-a').length >= asked + 2, '2: the poll asks again');
    const hold = statusHold;
    statusHold = null;
    hold.resolve();
    await waitFor(() => !marked(run.doc), '2: the mark goes');
  } finally { run.dom.window.close(); }
});

// Follow-ups of #512 and #513 (Terra minors), one row each:
// | # | situation                                                                     | expected                              |
// |---|-------------------------------------------------------------------------------|---------------------------------------|
// | 1 | «Cũ nhất trước» then «Mới tạo trước» while the first save is slow             | saved in click order; newest kept     |
// | 2 | single calls: a running run reopened, its run-info slow, the poll's answers come | the mark goes; the slow one retired |
// | 3 | a running run reopened: its own calls answered, the poll's review data is slow | the mark stays until that answers     |
// | 4 | the open run is deleted while its review data is on its way                   | the mark goes at once                 |
test('the sort save keeps the last click and the refresh mark follows only the latest calls', async () => {
  const runA = { runId: 'run-a', product: 'Sản phẩm A', status: 'RUNNING' };
  const runB = { runId: 'run-b', product: 'Sản phẩm B', status: 'DONE' };
  const running: any = syntheticRunInfo('run-a');
  running.state = { status: 'RUNNING', module: 'M3', errorCode: null };
  const marked = (doc: Document) => [...doc.querySelectorAll<HTMLElement>('.refresh-mark')].some((mark) => !mark.hidden);
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();

  // 1
  const firstSave = deferred<void>();
  let run = harness({ runs: [runB, runA], runInfoByRun: { 'run-a': running, 'run-b': syntheticRunInfo('run-b') },
    rememberRunSortHold: (value) => (value === 'oldest' ? firstSave.promise : undefined) });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.querySelector('#scr-track [data-run-sort="oldest"]') !== null, '1: buttons');
    run.doc.querySelector<HTMLButtonElement>('#scr-track [data-run-sort="oldest"]')!.click();
    run.doc.querySelector<HTMLButtonElement>('#scr-track [data-run-sort="newest"]')!.click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    firstSave.resolve();
    await waitFor(() => run.state.runSortCalls.length === 2, '1: both saved');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.deepEqual(run.state.runSortCalls, ['oldest', 'newest'], '1: in click order');
    assert.equal(run.state.runSortSaved, 'newest', '1: the last click is kept');
  } finally { run.dom.window.close(); }

  // 2
  let holdInfo = false;
  const slowInfo = deferred<void>();
  run = harness({ runs: [runA, runB], runInfoByRun: { 'run-a': running, 'run-b': syntheticRunInfo('run-b') }, fastPoll: true,
    oldServer: true, statusGate: (runId) => {
      if (runId !== 'run-a' || !holdInfo) return undefined;
      holdInfo = false;
      return slowInfo;
    } });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && !marked(run.doc), '2: run-a open, polled');
    holdInfo = true;
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => !holdInfo, '2: the reopen run-info is held');
    await waitFor(() => !marked(run.doc), '2: the poll answered, the mark goes');
    slowInfo.resolve();
  } finally { run.dom.window.close(); }

  // 3
  let holdData = false;
  let slowData = deferred<void>();
  run = harness({ runs: [runA, runB], runInfoByRun: { 'run-a': running, 'run-b': syntheticRunInfo('run-b') }, fastPoll: true,
    reviewDataHold: (runId) => (runId === 'run-a' && holdData ? slowData.promise : undefined) });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && !marked(run.doc), '3: run-a open, polled');
    const asked = run.state.reviewDataCallsByRun['run-a'] || 0;
    runListButton(run.doc, 'run-a').click();
    await waitFor(() => (run.state.reviewDataCallsByRun['run-a'] || 0) > asked, '3: its own review data, not held');
    const own = run.state.reviewDataCallsByRun['run-a'] || 0;
    holdData = true;                                      // the poll's are held
    await waitFor(() => (run.state.reviewDataCallsByRun['run-a'] || 0) > own, '3: the poll asks review data');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(marked(run.doc), true, '3: the poll\'s review data is on its way');
    holdData = false;
    slowData.resolve();
    await waitFor(() => !marked(run.doc), '3: the mark goes once it answers');
  } finally { run.dom.window.close(); }

  // 4
  holdData = false;
  slowData = deferred<void>();
  run = harness({ runs: [runB, runA], runInfoByRun: { 'run-a': running, 'run-b': syntheticRunInfo('run-b') },
    reviewDataHold: (runId) => (runId === 'run-b' && holdData ? slowData.promise : undefined) });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && !marked(run.doc), '4: run-b open');
    holdData = true;
    runListButton(run.doc, 'run-b').click();
    await waitFor(() => marked(run.doc), '4: review data on its way');
    element<HTMLButtonElement>(run.doc, 'btnDeleteRun').click();
    element<HTMLButtonElement>(run.doc, 'deleteConfirmBtn').click();
    await waitFor(() => element(run.doc, 'toast').textContent === 'Đã xóa lượt', '4: deleted');
    await waitFor(() => !marked(run.doc), '4: the mark goes at once');
    slowData.resolve();
  } finally { run.dom.window.close(); }
});

// F647 wave 2: one run-view per open, insights summary first (CONTRACT-F647-wave2 §4), one row each:
// | # | situation                                                         | expected                                                  |
// |---|-------------------------------------------------------------------|-----------------------------------------------------------|
// | 1 | open a settled run on «Chi tiết lịch sử lượt chạy»                | one run-view, with --result; run-info asked once          |
// | 2 | open it on «Kết quả chạy»                                         | its result parts at once (same read); no comment list read |
// | 4 | the outputs part fails                                            | the same panel text as the single call's failure          |
// | 5 | an older server (USAGE)                                           | the single calls; run-view not asked again                |
// | 6 | a running run's 10 s poll                                         | run-view again                                            |
test('a run opens with one run-view, insights summary first', async () => {
  const runId = 'run-w2';
  const sha = 'c'.repeat(64);
  const comment = (id: string, text: string) => ({ id, text, rating: 5, date: null, productName: null,
    url: 'https://shopee.vn/product/801/100', tags: [] });
  const theme = { code: 'T-CONGDUNG', name: 'Công dụng', count: 2, unclearCount: 0, share: 1,
    polarityCounts: { khen: 2, che: 0, ke: 0, khong_ro_huong: 0 },
    summary: { status: 'EMPTY', text: null, model: null, generatedAt: null },
    comments: [comment('r1', 'Dùng tốt'), comment('r2', 'Hiệu quả rõ')] };
  const insights = { format: 'review-insights-v1', runId, codebookVersion: 'synthetic', sources: [{
    sourceSha256: sha, kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z',
    all: { summary: { status: 'EMPTY', text: null, model: null, generatedAt: null }, themes: [theme],
      comments: theme.comments }, links: [] }] };
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
  const download = (doc: Document) => doc.getElementById('resultCommentDrilldown');
  const setup = (extra: Record<string, any> = {}) => harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }, { runId: 'run-other', product: 'Khác', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId), 'run-other': syntheticRunInfo('run-other') },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    reviewStatsResult: () => ({ ok: true, data: syntheticReviewStats(runId, 2) }),
    reviewInsightsResult: () => ({ ok: true, data: clone(insights) }),
    ...extra,
  });

  // 1 and 2
  let run = setup();
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, '1: open');
    assert.deepEqual(run.state.runViewCalls, [{ runId, result: true }], '1: one run-view (--result: a settled run)');
    assert.deepEqual(run.state.statusCalls, [runId], '1: run-info once, inside it');
    tab(run.doc, 2);
    assert.notEqual(download(run.doc), null, '2: result parts at once, from the --result read of the open');
    assert.ok(run.state.runViewCalls.every((call) => call.result), '2: --result on «Kết quả chạy»');
    assert.deepEqual(run.state.insightCommentCalls, [], '2: no comment list');
  } finally { run.dom.window.close(); }

  // 4
  const failing = { moduleOutputsResult: () => ({ ok: false, error: { code: 'MODULE_OUTPUT_INVALID', message: 'MODULE_OUTPUT_INVALID' } }) };
  const panelText = async (extra: Record<string, any>) => {
    const opened = setup({ ...failing, ...extra });
    try {
      tab(opened.doc, 1);
      await waitFor(() => /không đúng dạng/.test(opened.doc.getElementById('moduleOutputsPanel')?.textContent || ''),
        '4: outputs error shown');
      return opened.doc.getElementById('moduleOutputsPanel')!.textContent;
    } finally { opened.dom.window.close(); }
  };
  assert.equal(await panelText({}), await panelText({ oldServer: true }), '4: the same error path');

  // 5
  run = setup({ oldServer: true });
  try {
    tab(run.doc, 2);
    await waitFor(() => download(run.doc) !== null, '5: result parts shown');
    const asked = run.state.runViewCalls.length;
    [...run.doc.querySelectorAll<HTMLButtonElement>('#resultRunList button')]
      .find((button) => button.title.includes('run-other'))!.click();
    await waitFor(() => run.state.statusCalls.includes('run-other'), '5: the other run opens');
    assert.equal(run.state.runViewCalls.length, asked, '5: run-view not asked again');
    assert.deepEqual(run.state.insightCommentCalls, []);
  } finally { run.dom.window.close(); }

  // 6
  const running: any = syntheticRunInfo(runId);
  running.state = { status: 'RUNNING', module: 'M3', errorCode: null };
  run = setup({ runInfoByRun: { [runId]: running, 'run-other': syntheticRunInfo('run-other') }, fastPoll: true });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.state.runViewCalls.filter((call) => call.runId === runId).length >= 3, '6: the poll uses run-view');
  } finally { run.dom.window.close(); }
});

// #516 Terra r1, one row each:
// | # | situation                                                                   | expected                                        |
// |---|-----------------------------------------------------------------------------|-------------------------------------------------|
// | 3 | sampling and step 4 finish, seen by their own polls, while a refresh is out | ONE run-view at a time, no separate part calls  |
test('a change of sampling and step 4 asks one run-view at a time', async () => {
  const runId = 'run-r1';
  const sha = 'd'.repeat(64);
  const comment = (id: string) => ({ id, text: 'Bình luận ' + id, rating: 5, date: null, productName: null,
    url: 'https://shopee.vn/product/801/100', tags: [] });
  const themeComments = [comment('r1'), comment('r2')];
  const insights = () => ({ format: 'review-insights-v1', runId, codebookVersion: 'synthetic', sources: [{
    sourceSha256: sha, kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z',
    all: { summary: { status: 'EMPTY', text: null, model: null, generatedAt: null },
      themes: [{ code: 'T-CONGDUNG', name: 'Công dụng', count: 2, unclearCount: 0, share: 1,
        polarityCounts: { khen: 2, che: 0, ke: 0, khong_ro_huong: 0 },
        summary: { status: 'EMPTY', text: null, model: null, generatedAt: null }, comments: themeComments }],
      comments: themeComments }, links: [] }] });
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
  const download = (doc: Document) => doc.getElementById('resultCommentDrilldown');
  const base = (extra: Record<string, any> = {}) => harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    reviewStatsResult: () => ({ ok: true, data: syntheticReviewStats(runId, 2) }),
    reviewInsightsResult: () => ({ ok: true, data: insights() }),
    ...extra,
  });

  // 3
  const attempt = {
    attemptId: 'attempt-r1', planSha256: 'c'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  let step4 = 'RUNNING' as 'RUNNING' | 'PASS';
  let statsCalls = 0;
  let statusHold: Deferred<void> | null = null;
  const run = base({
    samplingByRun: { [runId]: syntheticSampling({ runId, attempts: [attempt] }) },
    reviewProcessResult: (id: string) => reviewProcessReply(id, step4),
    reviewStatsResult: () => { statsCalls += 1; return { ok: true, data: syntheticReviewStats(runId, 2) }; },
    statusGate: () => statusHold || undefined,
    fastPoll: true, fastStep4: true,
  });
  try {
    await booted(run.doc);                               // connected: the step 4 poll starts on the next open
    tab(run.doc, 2);
    await waitFor(() => download(run.doc) !== null && (run.state.reviewSamplingCallsByRun[runId] || 0) >= 3 &&
      run.state.reviewProcessCalls.length >= 3, '3: open, sampling and step 4 polls running');
    const before = { views: run.state.runViewCalls.length, data: run.state.reviewDataCallsByRun[runId] || 0,
      outputs: run.state.moduleOutputsCalls.length, stats: statsCalls };
    statusHold = deferred<void>();                       // every run-view now waits
    run.state.samplingByRun![runId].attempts[0].status = 'SUCCEEDED';
    step4 = 'PASS';
    await waitFor(() => run.state.runViewCalls.length === before.views + 1, '3: one refresh asked');
    await new Promise((resolve) => setTimeout(resolve, 150));   // the step 4 poll sees its change too
    assert.equal(run.state.runViewCalls.length, before.views + 1, '3: never two at once');
    const hold3 = statusHold;
    statusHold = null;
    hold3.resolve();
    await waitFor(() => run.state.runViewCalls.length === before.views + 2, '3: the queued one after it');
    await new Promise((resolve) => setTimeout(resolve, 150));
    const views = run.state.runViewCalls.length - before.views;
    assert.equal(views, 2, '3: one follow-up for both polls');
    assert.equal((run.state.reviewDataCallsByRun[runId] || 0) - before.data, views, '3: review data only inside run-view');
    assert.equal(run.state.moduleOutputsCalls.length - before.outputs, views, '3: outputs only inside run-view');
    assert.equal(statsCalls - before.stats, views, '3: stats only inside run-view');
  } finally { run.dom.window.close(); }
});

// #516 Terra r2, one row each:
// | # | situation                                                                        | expected                                    |
// |---|----------------------------------------------------------------------------------|---------------------------------------------|
// | 1 | older server: a reopen's sampling answer shows the attempt finished, after the   | the review data is read again               |
// |   | other single calls answered                                                      |                                             |
// | 2 | run-view: step 2 of the open run passes (a progress change and its notice)       | the change's run-view and the notice's one  |
// |   |                                                                                  | follow-up, no other command, never 2 out    |
test('single calls keep their completion refresh and a progress change asks run-views only', async () => {
  const runId = 'run-r2';
  const attempt = {
    attemptId: 'attempt-r2', planSha256: 'c'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();

  // 1
  let run = harness({ runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) }, oldServer: true,
    samplingByRun: { [runId]: syntheticSampling({ runId, attempts: [attempt] }) } });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && (run.state.reviewDataCallsByRun[runId] || 0) >= 1,
      '1: open with the attempt running');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const data = run.state.reviewDataCallsByRun[runId] || 0;
    const gate = deferred<void>();
    run.state.reviewGates = { [runId]: gate };
    run.state.samplingByRun![runId].attempts[0].status = 'SUCCEEDED';
    runListButton(run.doc, runId).click();                 // reopen: the single calls
    await waitFor(() => (run.state.reviewDataCallsByRun[runId] || 0) === data + 1, '1: review data asked');
    await new Promise((resolve) => setTimeout(resolve, 30));   // it answered; sampling still held
    run.state.reviewGates = undefined;
    gate.resolve();
    await waitFor(() => (run.state.reviewDataCallsByRun[runId] || 0) === data + 2, '1: read again after the finished attempt');
  } finally { run.dom.window.close(); }

  // 2
  let phase = 'before';
  run = harness({ runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) }, hasFocus: true, fastProgress: true,
    runsProgressFor: () => progressReply([progressRun(runId, phase === 'before' ? ['PASS', 'RUNNING', 'IDLE', 'IDLE']
      : ['PASS', 'PASS', 'RUNNING', 'IDLE'], { active: phase === 'before' ? { step: 2, stage: null, done: null, total: null }
      : { step: 3, stage: null, done: 1, total: 9 } })]) });
  try {
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && run.state.runsProgressCalls >= 2, '2: open, polled');
    await new Promise((resolve) => setTimeout(resolve, 60));
    const before = { views: run.state.runViewCalls.length, status: run.state.statusCalls.length,
      process: run.state.reviewProcessCalls.length, data: run.state.reviewDataCallsByRun[runId] || 0 };
    phase = 'after';
    await waitFor(() => run.doc.querySelector('#noticeBox .notice-go') !== null, '2: notice');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(run.state.runViewCalls.length - before.views, 2, '2: the change and one follow-up');
    assert.equal(run.state.statusCalls.length - before.status, 2, '2: run-info only inside them');
    assert.equal(run.state.reviewProcessCalls.length - before.process, 2, '2: step 4 state only inside them');
    assert.equal((run.state.reviewDataCallsByRun[runId] || 0) - before.data, 2, '2: review data only inside them');
    assert.equal(run.state.runViewMaxOut, 1, '2: never two at once');
  } finally { run.dom.window.close(); }
});

// #516 Terra r3: the per-part loaders decide (run-view or the single call), one row each:
// | # | situation                                                                       | expected                                  |
// |---|---------------------------------------------------------------------------------|-------------------------------------------|
// | 1 | run-view: the open run's sampling timer and step 4 timer fire, one run-view held | ONE run-view, no other command            |
// | 2 | run-view: «Hoàn tất» bar of the open run without step 4 data (progressDetail)   | ONE run-view at a time, no other command  |
// | 3 | a «Lượt hoàn tất» notice while the first run-view is unanswered; it is USAGE     | the notice waits for the single step 4    |
// |   | and the single step 4 read is slow                                              | read and shows its count                  |
test('the per-part loaders of the open run use its one run-view or, on an older server, their single call', async () => {
  const runId = 'run-r3';
  const attempt = {
    attemptId: 'attempt-r3', planSha256: 'c'.repeat(64), createdAt: '2026-11-01T02:00:00.000Z',
    status: 'RUNNING', errorCode: null, gate: null, stopRequested: false, reconcilable: false,
    links: [{ shopId: '100', itemId: '200', requested: 300, actual: null, shortfall: null, stopReason: '', stars: [] }],
  };
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
  const counts = (run: ReturnType<typeof harness>) => ({ views: run.state.runViewCalls.length,
    status: run.state.statusCalls.length, process: run.state.reviewProcessCalls.length,
    sampling: run.state.reviewSamplingCallsByRun[runId] || 0, data: run.state.reviewDataCallsByRun[runId] || 0 });
  const onlyRunView = (run: ReturnType<typeof harness>, before: ReturnType<typeof counts>, label: string) => {
    const now = counts(run);
    const views = now.views - before.views;
    assert.ok(views >= 1, label + ': a run-view was asked');
    assert.deepEqual({ status: now.status - before.status, process: now.process - before.process,
      sampling: now.sampling - before.sampling, data: now.data - before.data },
    { status: views, process: views, sampling: views, data: views }, label + ': every read inside a run-view');
    assert.equal(run.state.runViewMaxOut, 1, label + ': never two at once');
    return views;
  };
  let hold: Deferred<void> | null = null;

  // 1
  let run = harness({ runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) }, fastPoll: true, fastStep4: true,
    samplingByRun: { [runId]: syntheticSampling({ runId, attempts: [attempt] }) },
    reviewProcessResult: (id: string) => reviewProcessReply(id, 'RUNNING'), runViewHold: () => hold?.promise });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.state.runViewCalls.length >= 3, '1: open, the timers read');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const before = counts(run);
    hold = deferred<void>();
    await waitFor(() => run.state.runViewCalls.length === before.views + 1, '1: one run-view held');
    await new Promise((resolve) => setTimeout(resolve, 150));          // both timers fire many times meanwhile
    assert.equal(onlyRunView(run, before, '1'), 1, '1: they share it');
    const held = hold;
    hold = null;
    held.resolve();
    await new Promise((resolve) => setTimeout(resolve, 150));
    onlyRunView(run, before, '1 after');
  } finally { hold?.resolve(); hold = null; run.dom.window.close(); }

  // 2
  run = harness({ runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) }, hasFocus: true, fastProgress: true,
    runsProgressFor: (call: number) => progressReply([progressRun(runId, ['PASS', 'PASS', 'PASS', 'PASS'],
      { finished: true, changedAt: '2026-11-16T08:59:' + String(10 + (call % 40)) + 'Z' })]) });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null && run.state.runsProgressCalls >= 2, '2: open');
    await new Promise((resolve) => setTimeout(resolve, 30));
    const before = counts(run);
    await waitFor(() => run.state.runsProgressCalls >= 8, '2: the bar redrawn');
    await new Promise((resolve) => setTimeout(resolve, 60));
    onlyRunView(run, before, '2');
  } finally { run.dom.window.close(); }

  // 3
  let step4 = 'RUNNING' as 'RUNNING' | 'PASS';
  let phase = 'before';
  let processHold: Deferred<void> | null = null;
  let listed = false;                                      // no run at the start: run-view not asked yet
  run = harness({ runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    listRunsReply: async () => (listed ? undefined : { ok: true, data: { format: 'runs-v1', runs: [] } }),
    runInfoByRun: { [runId]: syntheticRunInfo(runId) }, oldServer: true, hasFocus: true, fastProgress: true,
    runViewHold: () => hold?.promise, reviewProcessHold: () => processHold?.promise,
    reviewProcessResult: (id: string) => reviewProcessReply(id, step4),
    runsProgressFor: () => progressReply([progressRun(runId, phase === 'before' ? ['PASS', 'PASS', 'PASS', 'RUNNING']
      : ['PASS', 'PASS', 'PASS', 'PASS'], phase === 'before'
      ? { active: { step: 4, stage: 'label', done: 10, total: 498 } } : { finished: true })]) });
  try {
    await booted(run.doc);
    await waitFor(() => run.state.runsProgressCalls >= 2, '3: progress polled');
    assert.equal(run.state.runViewCalls.length, 0, '3: nothing open yet');
    hold = deferred<void>();
    listed = true;
    tab(run.doc, 1);                                       // the run is listed and opens: the first run-view
    await waitFor(() => run.state.runViewCalls.length === 1, '3: the first run-view out');
    const polled = run.state.runsProgressCalls;
    step4 = 'PASS';
    phase = 'after';
    await waitFor(() => run.state.runsProgressCalls >= polled + 3, '3: «finished» seen');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(run.doc.querySelector('#noticeBox .notice'), null, '3: the notice waits for run-view support');
    processHold = deferred<void>();
    const held = hold;
    hold = null;
    held.resolve();                                        // USAGE
    await waitFor(() => run.state.reviewProcessCalls.length >= 1, '3: the single step 4 read');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(run.doc.querySelector('#noticeBox .notice'), null, '3: still waiting for that read');
    processHold.resolve();
    processHold = null;
    await waitFor(() => run.doc.querySelector('#noticeBox .notice') !== null, '3: notice');
    assert.match(run.doc.querySelector('#noticeBox .notice')!.textContent || '', /498 bình luận đã gắn chủ đề/);
  } finally { hold?.resolve(); processHold?.resolve(); run.dom.window.close(); }
});

// #516 Terra r4: a per-part read is answered by a run-view started after it, one row:
// | # | situation                                                                   | expected                                    |
// |---|-----------------------------------------------------------------------------|---------------------------------------------|
// | 1 | «Chạy tiếp» of step 4 answers while a run-view asked before it is still out | its step 4 read waits for the follow-up and |
// |   |                                                                             | shows the new state; 2 run-views in all     |
test('a read asked while a run-view is out is answered by the follow-up', async () => {
  let kind = 'FAIL' as 'FAIL' | 'RUNNING';
  let hold: Deferred<void> | null = null;
  const resume = deferred<void>();
  const run = step4Harness({
    reviewProcessResult: (runId) => reviewProcessReply(runId,
      runId === 'run-fail' ? kind : STEP4_RUN_KINDS[runId as keyof typeof STEP4_RUN_KINDS]),
    processReviewDataResult: (runId, sourceSha256) => resume.promise.then(() =>
      ({ ok: true, data: { format: 'review-process-start-v1', runId, sourceSha256, status: 'RUNNING', pid: 4321 } })),
    runViewHold: () => hold?.promise,
  });
  try {
    await waitFor(() => run.doc.querySelectorAll('#runList button').length === 4, 'list');
    runListButton(run.doc, 'run-fail').click();
    await waitFor(() => run.doc.getElementById('s4Resume') !== null, '«Chạy tiếp»');
    await new Promise((resolve) => setTimeout(resolve, 30));
    element<HTMLButtonElement>(run.doc, 's4Resume').click();
    await waitFor(() => run.state.processReviewDataCalls.length === 1, 'resume sent');
    const views = run.state.runViewCalls.length;
    hold = deferred<void>();
    runListButton(run.doc, 'run-fail').click();          // a run-view out: its step 4 part is from before the resume
    await waitFor(() => run.state.runViewCalls.length === views + 1, 'a run-view out');
    kind = 'RUNNING';
    resume.resolve();                                    // the resume answers: its step 4 read is asked now
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(run.state.runViewCalls.length, views + 1, 'never two at once');
    const held = hold;
    hold = null;
    held.resolve();
    await waitFor(() => run.state.runViewCalls.length === views + 2, 'the follow-up');
    await waitFor(() => run.doc.getElementById('s4Resume') === null, 'the running state shown');
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.equal(run.state.runViewCalls.length, views + 2, '2 run-views in all');
    assert.equal(run.state.runViewMaxOut, 1);
  } finally { hold?.resolve(); run.dom.window.close(); }
});

// F647 wave 3, the open run's reads (UI), one row each:
// | # | situation                                                                       | expected                                   |
// |---|---------------------------------------------------------------------------------|--------------------------------------------|
// | A | «Kết quả chạy» clicked while a read without --result (a run in progress) is out | the --result read is sent at once; its     |
// |   |                                                                                 | parts show before the older read answers   |
// | C | one run-view answer                                                             | one redraw of the open run                 |
// | 1 | a read fails (its answer cannot be drawn) while another read waits behind it    | the waiting read is still sent             |
// | 2 | the connection is made again while the first run-view is out and a notice waits | the notice goes on once that read answers  |
// | 3 | a run-view fails on the way (SSH_TIMEOUT)                                       | the open run keeps its last copy and shows |
// |   |                                                                                 | the error line                             |
// | 4 | the --result read fails (SSH_TIMEOUT) BEFORE the first read of the run answers  | that first read's answer still shows       |
// | 5 | the --result read answers good info but an outputs error BEFORE the first read  | the first read's outputs show              |
// |   | (good outputs) answers                                                          |                                            |
// | 6 | a run-view fails with a non-transport error (REMOTE_OUTPUT_INVALID) after a     | the run detail stays; the error line shows |
// |   | good open                                                                       |                                            |
// | 7 | after a good open, a run-view answers good info but an outputs error            | the last outputs stay, with the error mark |
test('wave 3: the open run reads at once on «Kết quả chạy», redraws once and survives failures', async () => {
  const runId = 'run-w3';
  const sha = 'e'.repeat(64);
  const comment = (id: string) => ({ id, text: 'Bình luận ' + id, rating: 5, date: null, productName: null,
    url: 'https://shopee.vn/product/801/100', tags: [] });
  const insights = () => ({ format: 'review-insights-v1', runId, codebookVersion: 'synthetic', sources: [{
    sourceSha256: sha, kind: 'legacy', status: 'SUCCEEDED', completedAt: '2026-11-11T08:00:00Z',
    all: { summary: { status: 'EMPTY', text: null, model: null, generatedAt: null },
      themes: [{ code: 'T-CONGDUNG', name: 'Công dụng', count: 2, unclearCount: 0, share: 1,
        polarityCounts: { khen: 2, che: 0, ke: 0, khong_ro_huong: 0 },
        summary: { status: 'EMPTY', text: null, model: null, generatedAt: null }, comments: [comment('a'), comment('b')] }],
      comments: [comment('a'), comment('b')] }, links: [] }] });
  const tab = (doc: Document, index: number) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][index]!.click();
  const download = (doc: Document) => doc.getElementById('resultCommentDrilldown');
  let hold: Deferred<void> | null = null;
  let holdTrackOnly = false;
  const base = (extra: Record<string, any> = {}) => harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    reviewStatsResult: () => ({ ok: true, data: syntheticReviewStats(runId, 2) }),
    reviewInsightsResult: () => ({ ok: true, data: insights() }),
    runViewHold: (_id: string, result: boolean) => (holdTrackOnly && result ? undefined : hold?.promise),
    ...extra,
  });
  const release = () => { const held = hold; hold = null; held?.resolve(); };

  // A
  let run = base({ runs: [{ runId, product: 'Sản phẩm', status: 'RUNNING' }] });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, 'A: open');
    const views = run.state.runViewCalls.length;
    hold = deferred<void>();
    holdTrackOnly = true;
    runListButton(run.doc, runId).click();                // a track read, held
    await waitFor(() => run.state.runViewCalls.length === views + 1, 'A: a track read out');
    tab(run.doc, 2);
    await waitFor(() => download(run.doc) !== null, 'A: the result parts, before the track read answers');
    assert.deepEqual(run.state.runViewCalls.slice(views).map((call) => call.result), [false, true]);
    release();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.notEqual(download(run.doc), null, 'A: the older answer draws nothing over them');
    assert.equal(run.state.runViewCalls.length, views + 2, 'A: nothing more');
  } finally { release(); holdTrackOnly = false; run.dom.window.close(); }

  // C
  run = base();
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, 'C: open');
    await new Promise((resolve) => setTimeout(resolve, 30));
    let redraws = 0;
    const watch = new (run.dom.window as any).MutationObserver((records: MutationRecord[]) => {
      records.forEach((record) => record.addedNodes.forEach((node: any) => {
        if (node.classList && node.classList.contains('dhead')) redraws += 1;
      }));
    });
    watch.observe(run.doc.getElementById('runDetail')!, { childList: true });
    hold = deferred<void>();
    const views = run.state.runViewCalls.length;
    runListButton(run.doc, runId).click();
    await waitFor(() => run.state.runViewCalls.length === views + 1, 'C: a read out');
    await new Promise((resolve) => setTimeout(resolve, 30));
    redraws = 0;
    release();
    await waitFor(() => run.state.runViewCalls.length === views + 1 && redraws > 0, 'C: drawn');
    await new Promise((resolve) => setTimeout(resolve, 60));
    watch.disconnect();
    assert.equal(redraws, 1, 'C: one redraw for the answer');
  } finally { release(); run.dom.window.close(); }

  // 1
  const infos: Record<string, any> = { [runId]: syntheticRunInfo(runId) };
  // The broken answer rejects the read; the page leaves that rejection unhandled, which is harmless there.
  const listeners = process.listeners('unhandledRejection');
  process.removeAllListeners('unhandledRejection');
  process.on('unhandledRejection', (reason: any) => {
    if (reason && /info.modules/.test(String(reason.message))) return;   // the page's own TypeError
    listeners.forEach((listener) => (listener as any)(reason));
  });
  run = base({ runInfoByRun: infos });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, '1: open');
    const views = run.state.runViewCalls.length;
    hold = deferred<void>();
    infos[runId] = { ...syntheticRunInfo(runId), modules: 'broken' };   // this answer cannot be drawn
    runListButton(run.doc, runId).click();
    await waitFor(() => run.state.runViewCalls.length === views + 1, '1: the read out');
    infos[runId] = syntheticRunInfo(runId);
    runListButton(run.doc, runId).click();                // waits behind it
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(run.state.runViewCalls.length, views + 1);
    release();
    await waitFor(() => run.state.runViewCalls.length === views + 2, '1: the waiting read is sent');
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null, '1: drawn again');
  } finally {
    release();
    run.dom.window.close();
    process.removeAllListeners('unhandledRejection');
    listeners.forEach((listener) => process.on('unhandledRejection', listener as any));
  }

  // 2
  let step4 = 'RUNNING' as 'RUNNING' | 'PASS';
  let phase = 'before';
  let listed = false;
  let network = 'online';
  run = base({
    listRunsReply: async () => (listed ? undefined : { ok: true, data: { format: 'runs-v1', runs: [] } }),
    hasFocus: true, fastProgress: true, fastReconnect: true,
    reviewProcessResult: (id: string) => reviewProcessReply(id, step4),
    connectionResultFor: () => (network === 'drop'
      ? (network = 'online', { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } })
      : { ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic' } }),
    runsProgressFor: () => progressReply([progressRun(runId, phase === 'before' ? ['PASS', 'PASS', 'PASS', 'RUNNING']
      : ['PASS', 'PASS', 'PASS', 'PASS'], phase === 'before'
      ? { active: { step: 4, stage: 'label', done: 10, total: 498 } } : { finished: true })]),
  });
  try {
    await booted(run.doc);
    await waitFor(() => run.state.runsProgressCalls >= 2, '2: progress polled');
    assert.equal(run.state.runViewCalls.length, 0, '2: nothing open yet');
    hold = deferred<void>();
    listed = true;
    tab(run.doc, 1);                                      // the first run-view of this connection, held
    await waitFor(() => run.state.runViewCalls.length === 1, '2: the first run-view out');
    const polled = run.state.runsProgressCalls;
    step4 = 'PASS';
    phase = 'after';
    await waitFor(() => run.state.runsProgressCalls >= polled + 3, '2: «finished» seen');
    const calls = run.state.connectionCalls;
    network = 'drop';
    await waitFor(() => run.state.connectionCalls >= calls + 2, '2: connected again');
    await new Promise((resolve) => setTimeout(resolve, 60));
    release();
    await waitFor(() => run.doc.querySelector('#noticeBox .notice') !== null, '2: the notice goes on');
    assert.match(run.doc.querySelector('#noticeBox .notice')!.textContent || '', /498 bình luận đã gắn chủ đề/);
  } finally { release(); run.dom.window.close(); }

  // 3
  let failing = false;
  run = base({ statusError: () => (failing ? { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } } : undefined) });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('btnDeleteRun') !== null &&
      !/Đang tải/.test(run.doc.getElementById('moduleOutputsPanel')?.textContent || ''), '3: open');
    const outputs = run.doc.getElementById('moduleOutputsPanel')!.textContent;
    const views = run.state.runViewCalls.length;
    let shown = '';                                       // the error line (a reconnect then clears it)
    const watch = new (run.dom.window as any).MutationObserver(() => {
      if (!element(run.doc, 'errbar').hidden) shown = element(run.doc, 'errbar').title;
    });
    watch.observe(element(run.doc, 'errbar'), { attributes: true, childList: true });
    failing = true;
    runListButton(run.doc, runId).click();
    await waitFor(() => run.state.runViewCalls.length >= views + 1 && shown === 'SSH_TIMEOUT', '3: the error line');
    await new Promise((resolve) => setTimeout(resolve, 30));
    watch.disconnect();
    assert.notEqual(run.doc.getElementById('btnDeleteRun'), null, '3: the open run stays');
    assert.equal(run.doc.getElementById('moduleOutputsPanel')!.textContent, outputs, '3: its parts stay');
  } finally { run.dom.window.close(); }

  // 4
  failing = false;
  listed = false;
  run = base({
    runs: [{ runId, product: 'Sản phẩm', status: 'RUNNING' }],      // its first read has no --result
    statusError: () => (failing ? { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } } : undefined),
    listRunsReply: async () => (listed ? undefined : { ok: true, data: { format: 'runs-v1', runs: [] } }),
  });
  try {
    await booted(run.doc);
    assert.equal(run.state.runViewCalls.length, 0, '4: no copy of the run yet');
    hold = deferred<void>();
    holdTrackOnly = true;
    listed = true;
    tab(run.doc, 1);                                      // the first read of the run, held
    await waitFor(() => run.state.runViewCalls.length >= 1, '4: the first read out');
    assert.doesNotMatch(run.doc.getElementById('runDetail')?.textContent || '', /Kết quả các bước/);
    failing = true;
    tab(run.doc, 2);                                      // the --result read, which fails
    await waitFor(() => run.state.runViewCalls.some((call) => call.result), '4: the --result read out');
    await new Promise((resolve) => setTimeout(resolve, 60));
    release();
    await waitFor(() => /Kết quả các bước/.test(run.doc.getElementById('runDetail')?.textContent || ''),
      '4: the first read shows');
  } finally { release(); holdTrackOnly = false; run.dom.window.close(); }

  // 5
  let outputsFail = false;
  listed = false;
  run = base({
    runs: [{ runId, product: 'Sản phẩm', status: 'RUNNING' }],      // its first read has no --result
    listRunsReply: async () => (listed ? undefined : { ok: true, data: { format: 'runs-v1', runs: [] } }),
    moduleOutputsResult: (id: string) => (outputsFail
      ? { ok: false, error: { code: 'REMOTE_OUTPUT_INVALID', message: 'REMOTE_OUTPUT_INVALID' } }
      : { ok: true, data: moduleOutputView(id) }),
  });
  try {
    await booted(run.doc);
    hold = deferred<void>();
    holdTrackOnly = true;
    listed = true;
    tab(run.doc, 1);                                      // the first read of the run, held (its outputs are good)
    await waitFor(() => run.state.runViewCalls.length >= 1, '5: the first read out');
    outputsFail = true;
    tab(run.doc, 2);                                      // the --result read: info good, outputs an error
    await waitFor(() => run.state.runViewCalls.some((call) => call.result), '5: the --result read out');
    await new Promise((resolve) => setTimeout(resolve, 60));
    release();
    await waitFor(() => run.doc.getElementById('moduleOutputsErr') === null &&
      !/Đang tải/.test(run.doc.getElementById('moduleOutputsPanel')?.textContent || 'Đang tải'), '5: the outputs show');
  } finally { release(); holdTrackOnly = false; run.dom.window.close(); }

  // 6
  failing = false;
  run = base({ statusError: () => (failing
    ? { ok: false, error: { code: 'REMOTE_OUTPUT_INVALID', message: 'REMOTE_OUTPUT_INVALID' } } : undefined) });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => /Kết quả các bước/.test(run.doc.getElementById('runDetail')?.textContent || ''), '6: open');
    const views = run.state.runViewCalls.length;
    failing = true;
    runListButton(run.doc, runId).click();
    await waitFor(() => run.state.runViewCalls.length >= views + 1 && element(run.doc, 'errbar').title === 'REMOTE_OUTPUT_INVALID',
      '6: the error line');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.match(run.doc.getElementById('runDetail')?.textContent || '', /Kết quả các bước/, '6: the detail stays');
  } finally { run.dom.window.close(); }

  // 7
  outputsFail = false;
  run = base({
    moduleOutputsResult: (id: string) => (outputsFail
      ? { ok: false, error: { code: 'REMOTE_OUTPUT_INVALID', message: 'REMOTE_OUTPUT_INVALID' } }
      : { ok: true, data: moduleOutputView(id) }),
  });
  try {
    await booted(run.doc);
    tab(run.doc, 1);
    await waitFor(() => run.doc.getElementById('moduleOutputsPanel') !== null &&
      !/Đang tải/.test(run.doc.getElementById('moduleOutputsPanel')!.textContent || ''), '7: open');
    const shown = run.doc.getElementById('moduleOutputsPanel')!.textContent;
    outputsFail = true;
    runListButton(run.doc, runId).click();
    await waitFor(() => run.doc.getElementById('moduleOutputsErr') !== null, '7: the error mark');
    const panel = run.doc.getElementById('moduleOutputsPanel')!.cloneNode(true) as HTMLElement;
    panel.querySelector('#moduleOutputsErr')!.remove();
    assert.equal(panel.textContent, shown, '7: the last good outputs stay under the mark');
  } finally { run.dom.window.close(); }
});

// F651 (rank 1 and 2): an old run opens from the bridge's disk copy, one row each:
// | # | situation                                                        | expected                                          |
// |---|------------------------------------------------------------------|---------------------------------------------------|
// | 1 | open a settled run with a disk copy while the fresh read is slow | the copy shows at once; its delete button is      |
// |   |                                                                  | held; the fresh read (--result) replaces the copy |
// | 2 | the fresh read fails (SSH_TIMEOUT)                               | the error line; the copy goes; nothing held       |
// | 3 | a list answer                                                    | the first 12 visible settled rows go to prefetch  |
// |   |                                                                  | in screen order, with status:revision; no running |
// | 4 | a row open, then the 10 s poll                                   | the open's read may join a prefetch read          |
// |   |                                                                  | (`join`); the poll's reads do not                 |
// | 5 | the fresh read answers info but its review data fails            | the copy hold ends: delete back                   |
// | 6 | the status filter changes (to none of the rows, then back)       | the prefetch queue is sent again: [] then the rows |
// | 7 | the copy shows, then run-view answers USAGE (a server rollback)  | the single calls' answers replace it; delete back |
// |   | a late copy answer after that                                    | changes nothing                                   |
// | 8 | a full 7-part copy on «Chi tiết lịch sử lượt chạy», then USAGE   | delete back; stats and insights of the copy are   |
// |   | and the 5 single calls                                           | gone (not shown on «Kết quả chạy»)                |
// | 9 | connected on another run; the server rolls back; the copy run    | one redraw after it, with delete back; no part    |
// |   | opens, its single run-info answering last                        | from the copy                                     |
test('an old run opens from its disk copy at once, the fresh read replaces it, and the list is prefetched', async () => {
  const runId = 'run-copy';
  const copyName = 'Bản lưu trên máy';
  const copy = (id: string) => ({ format: 'run-view-v1', runId: id, parts: {
    info: { ok: true, data: syntheticRunInfo(id) },
    outputs: { ok: true, data: moduleOutputView(id, {}, { links: moduleOutputView(id).m2.links.map((link: any, i: number) =>
      (i === 0 ? { ...link, productName: copyName } : link)) }) },
  } });
  let hold: Deferred<void> | null = null;
  let failing = false;
  const open = () => harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    runViewCopy: copy,
    runViewHold: () => hold?.promise,
    statusError: () => (failing ? { ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } } : undefined),
  });
  const outputs = (doc: Document) => doc.getElementById('moduleOutputsPanel')?.textContent || '';
  const held = (doc: Document) => (doc.getElementById('btnDeleteRun') as HTMLButtonElement | null)?.disabled;
  const trackTab = (doc: Document) => [...doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();

  // 1
  hold = deferred<void>();
  let run = open();
  try {
    trackTab(run.doc);
    await waitFor(() => outputs(run.doc).includes(copyName), '1: the copy at once');
    assert.equal(held(run.doc), true, '1: delete held on the copy');
    assert.deepEqual(run.state.runViewCalls, [{ runId, result: true }], '1: the fresh read is out, with --result');
    hold.resolve();
    await waitFor(() => !outputs(run.doc).includes(copyName) && /DHC Kẽm 60 ngày/.test(outputs(run.doc)), '1: replaced');
    assert.equal(held(run.doc), false, '1: delete back');
  } finally { hold?.resolve(); run.dom.window.close(); }

  // 2
  hold = deferred<void>();
  failing = true;
  run = open();
  try {
    let shown = '';
    const watch = new (run.dom.window as any).MutationObserver(() => {
      if (!element(run.doc, 'errbar').hidden) shown = element(run.doc, 'errbar').title;
    });
    watch.observe(element(run.doc, 'errbar'), { attributes: true, childList: true });
    trackTab(run.doc);
    await waitFor(() => outputs(run.doc).includes(copyName), '2: the copy');
    hold.resolve();
    await waitFor(() => shown === 'SSH_TIMEOUT', '2: the error line');
    watch.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.ok(!outputs(run.doc).includes(copyName), '2: the copy goes');
    assert.notEqual(held(run.doc), true, '2: nothing held');
  } finally { hold?.resolve(); failing = false; run.dom.window.close(); }

  // 3
  const row = (id: string, status: string, createdAt: string, revision: number) =>
    ({ runId: id, product: id, status, createdAt, execution: { status, revision } });
  const runs = [row('run-r', 'RUNNING', '2026-11-05T00:00:00Z', 9), row('run-a', 'DONE', '2026-11-01T00:00:00Z', 3),
    row('run-b', 'FAILED', '2026-11-04T00:00:00Z', 5),
    ...Array.from({ length: 12 }, (_, i) =>
      row('run-o' + String(i).padStart(2, '0'), 'DONE', '2026-10-' + String(10 + i) + 'T00:00:00Z', i))];
  run = harness({ runs, runInfoByRun: Object.fromEntries(runs.map((entry) => [entry.runId, syntheticRunInfo(entry.runId)])) });
  try {
    await waitFor(() => (run.state.prefetchCalls.at(-1) || []).length > 0, '3: prefetch asked');
    const rows = run.state.prefetchCalls.at(-1)!;
    assert.equal(rows.length, 12, '3: at most 12');
    assert.deepEqual(rows.slice(0, 3), [{ runId: 'run-b', sig: 'FAILED:5' }, { runId: 'run-a', sig: 'DONE:3' },
      { runId: 'run-o11', sig: 'DONE:11' }], '3: newest first, the running row left out');
    assert.ok(!rows.some((entry) => entry.runId === 'run-r'));
    // 6
    const sent = run.state.prefetchCalls.length;
    const filter = element<HTMLSelectElement>(run.doc, 'runFilter');
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    filter.value = 'stopped';
    filter.dispatchEvent(new (run.dom.window as any).Event('change', { bubbles: true }));
    await waitFor(() => run.state.prefetchCalls.length > sent, '6: sent again');
    assert.deepEqual(run.state.prefetchCalls.at(-1), [], '6: no visible settled row: the queue is cleared');
    filter.value = 'failed';
    filter.dispatchEvent(new (run.dom.window as any).Event('change', { bubbles: true }));
    await waitFor(() => run.state.prefetchCalls.length > sent + 1, '6: sent again');
    assert.deepEqual(run.state.prefetchCalls.at(-1), [{ runId: 'run-b', sig: 'FAILED:5' }], '6: the visible rows only');
  } finally { run.dom.window.close(); }

  // 4
  run = harness({ runs: [{ runId: 'run-live', product: 'Đang chạy', status: 'RUNNING' }],
    runInfoByRun: { 'run-live': { ...syntheticRunInfo('run-live'), state: { status: 'RUNNING', module: 'M1', errorCode: null } } },
    fastPoll: true });
  try {
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][1]!.click();
    await waitFor(() => run.state.runViewJoins.length >= 3, '4: the open and the poll read');
    assert.equal(run.state.runViewJoins.filter(Boolean).length >= 1, true, '4: the open joins');
    const firstOpen = run.state.runViewJoins.indexOf(true);
    assert.deepEqual(run.state.runViewJoins.slice(firstOpen + 1).filter(Boolean), [], '4: no poll read joins');
  } finally { run.dom.window.close(); }

  // 5
  hold = deferred<void>();
  run = harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    runViewCopy: (id: string) => {
      const value: any = copy(id);
      value.parts.reviewData = { ok: true, data: { format: 'review-data-view-v1', runId: id, readonly: false, tracking: null,
        db: { configured: false, schemaReady: false, blockedBy: null }, sources: [] } };
      return value;
    },
    runViewHold: () => hold?.promise,
    reviewDataError: () => ({ ok: false, error: { code: 'REVIEW_DATA_INVALID', message: 'REVIEW_DATA_INVALID' } }),
  });
  try {
    trackTab(run.doc);
    await waitFor(() => outputs(run.doc).includes(copyName), '5: the copy');
    hold.resolve();
    await waitFor(() => !outputs(run.doc).includes(copyName), '5: info and outputs from the fresh read');
    await new Promise((resolve) => setTimeout(resolve, 30));
    assert.equal(held(run.doc), false, '5: delete back');
  } finally { hold?.resolve(); run.dom.window.close(); }

  // 7
  hold = deferred<void>();
  let copyHold: Deferred<void> | null = null;
  const rollback = () => harness({
    runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }],
    runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    runViewCopy: copy, oldServer: true,
    runViewHold: () => hold?.promise,
    runViewCopyHold: () => copyHold?.promise,
  });
  run = rollback();
  try {
    trackTab(run.doc);
    await waitFor(() => outputs(run.doc).includes(copyName), '7: the copy');
    hold.resolve();
    await waitFor(() => !outputs(run.doc).includes(copyName) && /DHC Kẽm 60 ngày/.test(outputs(run.doc)), '7: the single calls');
    await waitFor(() => held(run.doc) === false, '7: delete back');
  } finally { hold?.resolve(); run.dom.window.close(); }
  hold = null;
  copyHold = deferred<void>();
  run = rollback();
  try {
    trackTab(run.doc);
    await waitFor(() => /DHC Kẽm 60 ngày/.test(outputs(run.doc)) && held(run.doc) === false, '7: the single calls first');
    copyHold.resolve();
    await new Promise((resolve) => setTimeout(resolve, 60));
    assert.ok(!outputs(run.doc).includes(copyName), '7: the late copy changes nothing');
    assert.equal(held(run.doc), false);
  } finally { copyHold?.resolve(); run.dom.window.close(); }

  // 8 and 9: a full copy, as the bridge saves it (the 7 parts of a --result read)
  const live = { runs: [{ runId, product: 'Sản phẩm', status: 'DONE' }], runInfoByRun: { [runId]: syntheticRunInfo(runId) },
    moduleOutputsResult: (id: string) => ({ ok: true, data: moduleOutputView(id) }),
    reviewStatsResult: () => ({ ok: true, data: syntheticReviewStats(runId, 2) }),
    reviewInsightsResult: () => ({ ok: true, data: { format: 'review-insights-v1', runId, codebookVersion: 'synthetic',
      sources: [] } }) };
  const source = harness(live);
  const full: any = await source.api.runView(runId, true);
  source.dom.window.close();
  assert.equal(full.ok, true);
  assert.deepEqual(Object.keys(full.data.parts).sort(), ['info', 'insights', 'outputs', 'process', 'reviewData', 'sampling', 'stats']);
  full.data.parts.outputs = copy(runId).parts.outputs;
  full.data.parts.stats = { ok: true, data: syntheticReviewStats(runId, 777) };
  let infoHold: Deferred<void> | null = null;
  hold = deferred<void>();
  const fullCopy = () => harness({ ...live, oldServer: true, runViewCopy: () => full.data, runViewHold: () => hold?.promise,
    statusGate: () => infoHold || undefined });
  run = fullCopy();
  try {
    trackTab(run.doc);
    await waitFor(() => outputs(run.doc).includes(copyName), '8: the copy');
    hold.resolve();
    await waitFor(() => held(run.doc) === false && /DHC Kẽm 60 ngày/.test(outputs(run.doc)), '8: delete back');
    [...run.doc.querySelectorAll<HTMLButtonElement>('.tabs button')][2]!.click();
    assert.doesNotMatch(run.doc.getElementById('resultDetail')!.textContent || '', /777/, '8: the copy stats are gone');
  } finally { hold?.resolve(); run.dom.window.close(); }

  // 9: connected on another run first (the connect redraws are not this row's); then the server rolls back
  const other = 'run-other';
  let copyOn = false;
  const rolling: any = { ...live, runs: [{ runId: other, product: 'Sản phẩm khác', status: 'DONE' }, ...live.runs],
    runInfoByRun: { ...live.runInfoByRun, [other]: syntheticRunInfo(other) },
    runViewCopy: (id: string) => (copyOn && id === runId ? full.data : null), runViewHold: () => hold?.promise,
    statusGate: (id: string) => (id === runId ? infoHold || undefined : undefined) };
  hold = null;
  run = harness(rolling);
  try {
    trackTab(run.doc);
    await booted(run.doc);
    runListButton(run.doc, other).click();
    await waitFor(() => /Sản phẩm khác/.test(run.doc.querySelector('#runDetail h2')?.textContent || '') &&
      held(run.doc) === false, '9: the other run open, connected');
    rolling.oldServer = true;
    copyOn = true;
    hold = deferred<void>();
    infoHold = deferred<void>();
    runListButton(run.doc, runId).click();
    await waitFor(() => outputs(run.doc).includes(copyName), '9: the copy');
    hold.resolve();
    await waitFor(() => run.state.statusCalls.includes(runId), '9: the single run-info out');
    await new Promise((resolve) => setTimeout(resolve, 60));      // every other single call has answered
    assert.equal(held(run.doc), true, '9: still held');
    const draws: (boolean | undefined)[] = [];        // delete held, at each redraw of the run
    const watch = new (run.dom.window as any).MutationObserver((records: MutationRecord[]) => {
      records.forEach((record) => record.addedNodes.forEach((node: any) => {
        if (node.classList && node.classList.contains('dhead')) draws.push(held(run.doc));
      }));
    });
    watch.observe(run.doc.getElementById('runDetail')!, { childList: true });
    infoHold.resolve();
    await waitFor(() => held(run.doc) === false, '9: delete back');
    await new Promise((resolve) => setTimeout(resolve, 60));
    watch.disconnect();
    assert.deepEqual(draws, [false], '9: one redraw, with delete back');
    assert.ok(!outputs(run.doc).includes(copyName), '9: no part from the copy');
  } finally { hold?.resolve(); infoHold?.resolve(); run.dom.window.close(); }
});

// F654: «Có bản mới» (notify only), checked after the connect.
// | own   | server says (app-latest)                  | closed before | shown                                      |
// |-------|-------------------------------------------|---------------|--------------------------------------------|
// | 1.9.0 | 1.10.0                                    | -             | «v1.9.0»; «Có bản mới 1.10.0. Liên hệ …» |
// | 1.9.0 | 1.10.0, × clicked                         | -             | gone; the bridge keeps 1.10.0              |
// | 1.9.0 | 1.10.0                                    | 1.10.0        | nothing                                    |
// | 1.9.0 | 1.11.0                                    | 1.10.0        | the banner (closing hides one version)     |
// | 1.10.0| 1.10.0 (equal) / 1.9.0 / null             | -             | nothing                                    |
// | 1.9.0 | USAGE (older server or relay) / SSH_FAILED | -             | nothing, and no error line                 |
test('a newer app version on the server shows one banner, closed per version; anything else shows nothing', async () => {
  const bar = (doc: Document) => (doc.getElementById('updateBar')!.hidden ? null : doc.getElementById('updateText')!.textContent);
  const shown = async (build: { version: string; dismissed?: string | null }, reply: (() => any) | undefined) => {
    const run = harness({ appBuild: build, ...(reply ? { appLatestResult: reply } : {}) });
    await booted(run.doc);
    await waitFor(() => run.state.appLatestCalls > 0, 'the check after the connect');
    await new Promise((resolve) => setTimeout(resolve, 30));
    return run;
  };
  const latest = (version: string | null) => () => ({ ok: true, data: { format: 'app-latest-v1', version } });

  let run = await shown({ version: '1.9.0' }, latest('1.10.0'));
  try {
    assert.equal(run.doc.getElementById('appVer')!.textContent, 'v1.9.0');
    assert.equal(bar(run.doc), 'Có bản mới 1.10.0. Liên hệ IT để cập nhật.');
    run.doc.getElementById('updateClose')!.click();
    assert.equal(bar(run.doc), null, 'closed');
    await waitFor(() => run.state.dismissCalls.join(' ') === '1.10.0', 'the bridge keeps the closed version');
  } finally { run.dom.window.close(); }

  for (const [build, reply, expected] of [
    [{ version: '1.9.0', dismissed: '1.10.0' }, latest('1.10.0'), null],
    [{ version: '1.9.0', dismissed: '1.10.0' }, latest('1.11.0'), 'Có bản mới 1.11.0. Liên hệ IT để cập nhật.'],
    [{ version: '1.10.0' }, latest('1.10.0'), null],
    [{ version: '1.10.0' }, latest('1.9.0'), null],
    [{ version: '1.10.0' }, latest(null), null],
    [{ version: '1.9.0' }, undefined, null],
    [{ version: '1.9.0' }, () => ({ ok: false, error: { code: 'SSH_FAILED', message: 'SSH_FAILED' } }), null],
  ] as const) {
    run = await shown(build, reply);
    try {
      assert.equal(bar(run.doc), expected, JSON.stringify(build) + ' ' + JSON.stringify(reply && reply()));
      assert.equal(run.doc.getElementById('errbar')!.hidden, true, 'no error line');
    } finally { run.dom.window.close(); }
  }
});

// Owner 25/11 (side chat «có, gửi đi»), steps 1–2 on runs made from the user's Metric page. The request and
// the step 1 view below copy real runs: c35e93b0 (no keyword, category filter) and d6b4b951 (step 1 UNKNOWN).
// | # | situation                                                     | expected                                                        |
// |---|---------------------------------------------------------------|-----------------------------------------------------------------|
// | 1 | user-page run, step 1 execution UNKNOWN, gates.m1 = PASS      | «Kiểm tra sau bước 1» card and step chip show the PASS slip      |
// | 2 | same run, «Kiểm tra đầu vào»                                  | box «Bộ lọc đã lấy trên Metric»: period, keyword, Shopee, picture|
// |   |                                                               | no «capture specs» text and no «?» rows anywhere in the detail   |
// | 3 | keyword list from Metric / none                               | «thuốc mọc tóc biotin · biotin» / «Không có (chỉ lọc theo ngành hàng)» |
// | 4 | an old preset run                                             | the old «Xem thông tin đã ghi trong capture specs» box stays     |
function userPageRunInfo(runId: string, queries: string[], m1Status = 'UNKNOWN') {
  const info: any = syntheticRunInfo(runId);
  info.request = {
    format: 'request-v2', preset: { keywords: [queries[0] ?? 'Metric 21/10–19/11/2026'] },
    windows: [{ id: 'selected', period: { startDate: '2026-10-21', endDate: '2026-11-19' }, intervalDays: 7 }],
    collectionPolicy: { format: 'shopee-review-policy-v1', mode: 'with-comments', stars: [], totalPerLink: 30, allocation: 'pooled' },
    metricSource: { format: 'user-page-v1', scope: {
      start_date: '20261021', end_date: '20261119', exclude_query: {}, fields: [], is_filter_gift: false,
      include_query: { platforms: [1], queries, categories: ['1__100635', '1__100631'] },
    } },
  };
  info.gates = { entry: { ...passSlip('ENTRY'), checks: [] }, m1: passSlip('M1'), m2: passSlip('M2'), m3: null };
  info.execution = { format: 'run-execution-view-v1', revision: 2, status: 'SUCCEEDED', currentModule: 'M3',
    modules: { M1: { status: m1Status, currentGate: null, historicalGate: null } } };
  return info;
}

test('a run from the user\'s Metric page shows its saved step 1 check and the Metric filter, never capture specs', async () => {
  const failM1 = { ...passSlip('M1'), verdict: 'FAIL', errorCode: 'M1_NOT_PASSED' };
  // Terra r1: an older failed slip must not hide the saved one; a slip of the step's own run still wins.
  const hist = userPageRunInfo('run-hist', []);
  hist.execution.modules.M1.historicalGate = failM1;
  const cur = userPageRunInfo('run-cur', [], 'SUCCEEDED');
  cur.execution.modules.M1.currentGate = failM1;
  // Terra r1: missing Metric data is «Chưa có», not «no keyword»; an unknown platform shows no number.
  const missing = userPageRunInfo('run-missing', []);
  missing.request.metricSource.scope.include_query = { platforms: [1, 99] };
  // Terra r1: a failed entry check on a Metric-page run shows no technical words.
  const entryFail = userPageRunInfo('run-entry-fail', []);
  entryFail.gates.entry = { ...passSlip('ENTRY'), verdict: 'FAIL', errorCode: 'SOME_NEW_CODE', checks: [
    { id: 'collection_policy', ok: false, got: false, errorCode: 'REVIEW_POLICY_INVALID' },
    { id: 'some_new_check', ok: false, got: false, errorCode: 'SOME_NEW_CHECK_FAILED' }] };
  // Terra r2: no execution record at all; all four Metric platforms; no requested window (the Metric filter dates are used).
  const noExec = userPageRunInfo('run-bare', []);
  noExec.execution = null;
  const plat = userPageRunInfo('run-plat', []);
  plat.request.windows = [];
  plat.request.metricSource.scope.include_query.platforms = [1, 2, 3, 8];
  // Terra r2: a failed entry slip with a known reason and no failed check shows that reason's wording.
  const entryKnown = userPageRunInfo('run-entry-known', []);
  entryKnown.gates.entry = { ...passSlip('ENTRY'), verdict: 'FAIL', errorCode: 'CONFIG_MISSING', checks: [] };
  // An old preset run keeps main's behaviour: no saved-slip fallback.
  const presetSaved: any = syntheticRunInfo('run-preset-saved');
  presetSaved.execution = { format: 'run-execution-view-v1', revision: 1, status: 'SUCCEEDED', currentModule: 'M3',
    modules: { M1: { status: 'UNKNOWN', currentGate: null, historicalGate: null } } };
  const runs = { 'run-page': userPageRunInfo('run-page', []), 'run-kw': userPageRunInfo('run-kw', ['thuốc mọc tóc biotin', 'biotin']),
    'run-old': syntheticRunInfo('run-old'), 'run-hist': hist, 'run-cur': cur, 'run-missing': missing,
    'run-entry-fail': entryFail, 'run-preset-saved': presetSaved, 'run-bare': noExec, 'run-plat': plat,
    'run-entry-known': entryKnown };
  const { dom, doc, state } = harness({
    runs: Object.keys(runs).map((runId) => ({ runId, product: runId, status: 'DONE' })),
    runInfoByRun: runs, localShots: { 'run-page': true },
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId) }),
  });
  const detail = () => doc.getElementById('runDetail')!;
  const open = async (runId: string) => {
    runListButton(doc, runId).click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes(runId), runId);
    await waitFor(() => detail().querySelector('.entry-summary') !== null, runId + ' entry card');
    await new Promise((resolve) => setTimeout(resolve, 30));
  };
  const gateCardOf = (title: string) => [...detail().querySelectorAll<HTMLElement>('article.gate')]
    .find((card) => card.querySelector('h3')?.textContent === title);
  const chipText = () => [...detail().querySelectorAll('.seqch')]
    .find((item) => item.querySelector('b')?.textContent === 'Kiểm tra sau bước 1')?.querySelector('span')?.textContent;
  const m1Verdict = async (runId: string) => {
    await open(runId);
    const card = gateCardOf('Kiểm tra sau bước 1');
    assert.ok(card, runId + ': step 1 check card');
    return { card: card!.textContent!, chip: chipText(), previous: /Kết quả lần trước/.test(detail().textContent!) };
  };
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === Object.keys(runs).length, 'run list');
    // 1
    for (const [runId, verdict, note] of [['run-page', 'Đạt', 'saved slip'], ['run-hist', 'Đạt', 'saved slip over an older one'],
      ['run-cur', 'Không đạt', 'the step\'s own slip wins'], ['run-bare', 'Đạt', 'no execution record']] as const) {
      const seen = await m1Verdict(runId);
      assert.equal(seen.chip, verdict, '1 chip: ' + note);
      assert.match(seen.card, new RegExp(verdict), '1 card: ' + note);
      if (verdict === 'Đạt') assert.doesNotMatch(seen.card, /Không đạt|Chưa kiểm tra/, '1 card: ' + note);
      assert.equal(seen.previous, false, '1: no «Kết quả lần trước» ' + note);
    }
    const preset = await m1Verdict('run-preset-saved');
    assert.equal(preset.chip, 'Chưa có phiếu', '1: preset runs unchanged');
    assert.match(preset.card, /Chưa kiểm tra/, '1: preset runs unchanged');
    await open('run-page');
    // 2
    const box = element(doc, 'entryMetricFilters');
    assert.equal(box.querySelector('h3')!.textContent, 'Bộ lọc đã lấy trên Metric', '2');
    assert.match(box.textContent!, /21\/10\/2026/, '2: period start');
    assert.match(box.textContent!, /19\/11\/2026/, '2: period end');
    assert.match(box.textContent!, /Shopee/, '2: platform from include_query');
    assert.doesNotMatch(box.textContent!, /Chưa có/, '2: every fact is filled');
    assert.equal(element(doc, 'entryMetricShot').textContent, 'Xem ảnh Metric', '2');
    element<HTMLButtonElement>(doc, 'entryMetricShot').click();
    await waitFor(() => state.viewShotCalls.some(([runId]) => runId === 'run-page'), '2: the button opens this run\'s Metric picture');
    assert.doesNotMatch(detail().textContent!, /capture specs/i, '2: no capture specs text anywhere');
    assert.equal(detail().querySelector('.entry-summary .c-warn'), null, '2: no «?» rows');
    // 3
    assert.match(box.textContent!, /Không có \(chỉ lọc theo ngành hàng\)/, '3: no Metric keyword');
    assert.doesNotMatch(box.textContent!, /Metric 21\/10–19\/11\/2026/, '3: the run name is not a keyword');
    await open('run-kw');
    assert.match(element(doc, 'entryMetricFilters').textContent!, /thuốc mọc tóc biotin · biotin/, '3');
    await open('run-missing');
    const missingBox = element(doc, 'entryMetricFilters');
    const facts = Object.fromEntries([...missingBox.querySelectorAll('dt')].map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));
    assert.equal(facts['Từ khóa'], 'Chưa có', '3: missing keyword data');
    assert.equal(facts['Sàn'], 'Shopee · Sàn khác', '3: unknown platform, no number');
    await open('run-plat');
    const platFacts = Object.fromEntries([...element(doc, 'entryMetricFilters').querySelectorAll('dt')]
      .map((dt) => [dt.textContent, dt.nextElementSibling?.textContent]));
    assert.equal(platFacts['Sàn'], 'Shopee · Lazada · Tiki · TikTok Shop', '3: platform names');
    assert.match(platFacts['Khoảng thời gian']!, /21\/10\/2026.*19\/11\/2026/, '2: no requested window → the Metric filter dates');
    await open('run-entry-known');
    const knownText = detail().textContent!;
    assert.match(knownText, /Máy này chưa được cài đặt để dùng app\./, '2: a known reason shows its wording');
    assert.doesNotMatch(knownText, /CONFIG_MISSING|capture specs/i, '2: no code');
    await open('run-entry-fail');
    const failText = detail().textContent!;
    assert.match(failText, /Điều kiện thu bình luận của bước 3 chưa đạt:/, '2: failed policy still shown');
    assert.doesNotMatch(failText, /capture specs|SOME_NEW|REVIEW_POLICY|some_new_check/i, '2: no technical words on a failure');
    // 4
    await open('run-old');
    assert.equal(doc.getElementById('entryMetricFilters'), null, '4');
    assert.match(detail().textContent!, /Xem thông tin đã ghi trong capture specs/, '4: old runs keep the old box');
  } finally { dom.window.close(); }
});

// | # | situation                                                     | expected                                                        |
// |---|---------------------------------------------------------------|-----------------------------------------------------------------|
// | 5 | step 1 result rows                                            | «Có sản phẩm Shopee trong dữ liệu đã lấy» / «Metric trả sản phẩm theo doanh thu giảm dần» |
// | 6 | step 2 RUNNING, no saved selection yet (SELECTION_MISSING)    | chip «Đang chạy», no failure text                               |
// | 7 | step 2 ended (FAILED) with SELECTION_MISSING                  | chip «Không đạt kiểm tra» (a real failure still shows)          |
test('step 1 rows read as business text, and step 2 shows «Đang chạy» while it runs', async () => {
  const running: any = syntheticRunInfo('run-m2-running');
  running.state = { status: 'RUNNING', module: 'M2', errorCode: null };
  running.execution = { format: 'run-execution-view-v1', revision: 1, status: 'RUNNING', currentModule: 'M2',
    modules: { M2: { status: 'RUNNING', currentGate: null, historicalGate: null } } };
  running.gates.m2 = null;
  const ended: any = syntheticRunInfo('run-m2-failed');
  ended.state = { status: 'FAILED', module: 'M2', errorCode: 'SELECTION_MISSING' };
  ended.execution = { format: 'run-execution-view-v1', revision: 1, status: 'FAILED', currentModule: 'M2',
    modules: { M2: { status: 'FAILED', currentGate: null, historicalGate: null } } };
  ended.gates.m2 = null;
  // Terra r1: a running step 2 with no execution record yet (only the run state says RUNNING).
  const noExec: any = syntheticRunInfo('run-m2-noexec');
  noExec.state = { status: 'RUNNING', module: 'M2', errorCode: null };
  noExec.gates.m2 = null;
  const missing = { errorCode: 'SELECTION_MISSING', selectedCount: 0, links: [], skipped: [] };
  const { dom, doc } = harness({
    runs: [{ runId: 'run-m2-running', product: 'Đang chạy', status: 'RUNNING' }, { runId: 'run-m2-failed', product: 'Hỏng', status: 'FAILED' },
      { runId: 'run-m2-noexec', product: 'Chưa có bản ghi', status: 'RUNNING' }],
    runInfoByRun: { 'run-m2-running': running, 'run-m2-failed': ended, 'run-m2-noexec': noExec },
    moduleOutputsResult: (runId) => ({ ok: true, data: moduleOutputView(runId, {}, missing) }),
  });
  try {
    await waitFor(() => doc.querySelectorAll('#runList button').length === 3, 'run list');
    runListButton(doc, 'run-m2-running').click();
    await waitFor(() => doc.getElementById('moM2Chip') !== null, 'step 2 card');
    // 5
    assert.equal(element(doc, 'moM1Data').querySelector('.cl')!.textContent, 'Có sản phẩm Shopee trong dữ liệu đã lấy', '5');
    // 6
    assert.equal(element(doc, 'moM2Chip').textContent, 'Đang chạy', '6');
    const card = element(doc, 'moM2Chip').closest('article')!;
    assert.doesNotMatch(card.textContent!, /Bước 2 chưa có kết quả đã lưu|Không đạt/, '6: no failure while it runs');
    assert.equal([...card.querySelectorAll<HTMLElement>('.errbar')].filter((bar) => !bar.hidden).length, 0, '6: no error bar');
    runListButton(doc, 'run-m2-noexec').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-m2-noexec'), 'no-execution run');
    // No step 2 record yet: the card is not drawn (main's rule), so nothing reads as a failure.
    await waitFor(() => doc.getElementById('moduleOutputsPanel')?.textContent?.includes('Bước 1') === true, 'no-execution panel');
    assert.equal(doc.getElementById('moM2Chip'), null, '6: no step 2 card before step 2 has a record');
    assert.doesNotMatch(element(doc, 'moduleOutputsPanel').textContent!, /Bước 2 chưa có kết quả đã lưu|Không đạt kiểm tra/,
      '6: no failure, no execution record');
    // 7
    runListButton(doc, 'run-m2-failed').click();
    await waitFor(() => (doc.querySelector('#runList button.on')?.getAttribute('title') || '').includes('run-m2-failed'), 'failed run');
    await waitFor(() => doc.getElementById('moM2Chip')?.textContent === 'Không đạt kiểm tra', '7: a real failure still shows');
    assert.match(element(doc, 'moM2Chip').closest('article')!.textContent!, /Bước 2 chưa có kết quả đã lưu/, '7: the failure reason shows');
  } finally { dom.window.close(); }
});
