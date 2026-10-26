import assert from 'node:assert/strict';
import type { ChildProcess, SpawnOptions } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';
import {
  METRIC_CAPTURE_TIMEOUT_MS, runMetricCapture, type MetricCaptureRunnerConfig, type MetricCaptureRunnerDependencies,
} from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import { executeMetricOpenCli, type MetricOpenCliExecutorInput, type MetricOpenCliProcessOptions, type MetricOpenCliProcessResult } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { createMetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-process-runner.js';
import { withOpenCliBrowserLock } from '../../src/modules/analysis/research-automation/opencli-browser-lock.js';

// Synthetic only: no live process, no real adapter, no real product data.
const manifest = new TextEncoder().encode('synthetic adapter manifest for tests');
const sha = createHash('sha256').update(manifest).digest('hex');
const root = await mkdtemp(join(tmpdir(), 'autorun-capture-'));
after(async () => { await rm(root, { recursive: true, force: true }); });

let runCounter = 0;
const newRunId = () => `00000000-0000-4000-8000-${String(++runCounter).padStart(12, '0')}`;
const config = (overrides: Partial<MetricCaptureRunnerConfig> = {}): MetricCaptureRunnerConfig => ({
  enabledEnv: '1', captureRoot: root, adapterManifestPath: '/synthetic/adapter/manifest.json', adapterManifestSha256: sha, ...overrides,
});
const request = (overrides: Record<string, unknown> = {}) => ({
  runId: newRunId(), keyword: 'son môi', requestedPeriod: { startDate: '2025-10-05', endDate: '2026-10-02' }, ...overrides,
});
const READY: MetricOpenCliProcessResult = { exitCode: 0, stdout: '[{"status":"READY"}]', stderr: '' };
const periodFailure = (start: string, end: string): MetricOpenCliProcessResult => ({ exitCode: 1, stdout: '',
  stderr: `METRIC_PERIOD_UNSUPPORTED: Metric lookups currently support only the page default period; details={"observedPeriod":{"startDate":"${start}","endDate":"${end}"},"requestedPeriod":{"startDate":"x","endDate":"y"}}; debug folder: ${root}/secret-path/debug` });

/** The adapter's capture manifest with the Smart query toggle read back on, as a successful capture writes it. */
async function writeCaptureManifest(argv: readonly string[]): Promise<void> {
  await mkdir(argv[5]!, { recursive: true });
  await writeFile(join(argv[5]!, 'manifest.json'), JSON.stringify({ appliedFilters: { smartQuery: true } }));
}

interface Call { executable: string; argv: readonly string[]; options: MetricOpenCliProcessOptions; spec: any; input?: MetricOpenCliExecutorInput }

/** Fake runner: replays scripted results and records each call with the spec on disk at that moment. */
function fake(results: (MetricOpenCliProcessResult | Promise<MetricOpenCliProcessResult>)[], sourceEnv: Record<string, string> = { PATH: '/usr/bin' }) {
  const calls: Call[] = []; const inputs: MetricOpenCliExecutorInput[] = [];
  const deps: MetricCaptureRunnerDependencies = {
    sourceEnv,
    readManifest: async () => manifest,
    execute: (input, d) => { inputs.push(input); return executeMetricOpenCli(input, d); },
    createProcessRunner: () => async (executable, argv, options) => {
      const spec = JSON.parse(await readFile(argv[3]!, 'utf8'));
      await mkdir(join(argv[5]!, 'debug'), { recursive: true }); // the adapter writes run1/debug before searching
      await writeCaptureManifest(argv);
      calls.push({ executable, argv, options, spec });
      const next = results.shift() ?? READY;
      return { child: { pid: 1, kill: () => true }, completion: Promise.resolve(next) };
    },
  };
  return { calls, inputs, deps };
}

test('missing manifest path or digest stops as EXECUTOR_NOT_CONFIGURED without calling the executor', async () => {
  for (const missing of [{ adapterManifestPath: undefined }, { adapterManifestSha256: '' }]) {
    const f = fake([]);
    const result = await runMetricCapture(config(missing), request(), f.deps);
    assert.deepEqual({ ok: result.ok, code: !result.ok && result.code, calls: result.executorCalls }, { ok: false, code: 'EXECUTOR_NOT_CONFIGURED', calls: 0 });
    assert.equal(f.inputs.length, 0); assert.equal(f.calls.length, 0);
  }
  const relative = await runMetricCapture(config({ captureRoot: 'relative/dir' }), request(), fake([]).deps);
  assert.equal(!relative.ok && relative.code, 'EXECUTOR_NOT_CONFIGURED');
});

test('happy path: no shell, detached, explicit long timeout, allow-listed env, pinned sha from config', async () => {
  const f = fake([READY], { PATH: '/usr/bin', HOME: '/home/synthetic', DISPLAY: ':0', TDN_SERPAPI_KEY: 'k1', APIFY_TOKEN: 'k2', OPENAI_API_KEY: 'k3', TDN_OWNER_TOKEN: 'k4', CI: '0', CONTINUOUS_INTEGRATION: 'synthetic', OPENCLI_BROWSER_COMMAND_TIMEOUT: '1' });
  const req = request();
  const result = await runMetricCapture(config({ opencliExecutable: 'opencli-synthetic' }), req, f.deps);
  assert.ok(result.ok, JSON.stringify(result));
  const runDir = join(root, req.runId);
  assert.equal(result.captureDir, join(runDir, 'run1')); assert.equal(result.executorCalls, 1);
  const [call] = f.calls; const [input] = f.inputs;
  assert.equal(call!.executable, 'opencli-synthetic');
  assert.equal(call!.options.shell, false); assert.equal(call!.options.detached, true);
  assert.deepEqual(call!.argv, ['metric', 'capture', '--spec', join(runDir, 'spec.json'), '--out', join(runDir, 'run1'), '--product-cap', '200', '-f', 'json']);
  assert.deepEqual(call!.options.env, { PATH: '/usr/bin', HOME: '/home/synthetic', DISPLAY: ':0', OPENCLI_BROWSER_COMMAND_TIMEOUT: '1500', CI: '1' });
  assert.equal(input!.timeoutMs, METRIC_CAPTURE_TIMEOUT_MS); assert.equal(METRIC_CAPTURE_TIMEOUT_MS, 1_620_000);
  assert.equal(input!.expectedAdapterManifestSha256, sha); assert.equal(input!.adapterManifestPath, '/synthetic/adapter/manifest.json');
  assert.deepEqual(call!.spec, { keywords: ['son môi'], platforms: ['shopee', 'tiktok'], period: { startDate: '2026-09-03', endDate: '2026-10-02' }, category: null, smartQuery: true });
  if (process.platform !== 'win32') assert.equal((await stat(join(runDir, 'spec.json'))).mode & 0o777, 0o600);
});

test('a digest that does not match the manifest fails closed before any process starts', async () => {
  const f = fake([READY]);
  const result = await runMetricCapture(config({ adapterManifestSha256: '0'.repeat(64) }), request(), f.deps);
  assert.equal(!result.ok && result.code, 'MANIFEST_HASH_MISMATCH'); assert.equal(f.calls.length, 0);
});

test('a window outside the run stops before any lookup', async () => {
  const f = fake([READY]);
  const result = await runMetricCapture(config(), request({ requestedPeriod: { startDate: '2026-09-20', endDate: '2026-10-02' } }), f.deps);
  assert.equal(!result.ok && result.code, 'PERIOD_OUTSIDE_RUN'); assert.equal(f.inputs.length, 0);
});

test('D1: period probe-retry uses exactly the observed window and keeps the failed folder aside', async () => {
  const f = fake([periodFailure('2026-09-01', '2026-09-30'), READY]);
  const req = request();
  const result = await runMetricCapture(config(), req, f.deps);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.executorCalls, 2); assert.deepEqual(result.period, { startDate: '2026-09-01', endDate: '2026-09-30' });
  assert.deepEqual(f.calls.map(call => call.spec.period), [{ startDate: '2026-09-03', endDate: '2026-10-02' }, { startDate: '2026-09-01', endDate: '2026-09-30' }]);
  assert.ok((await stat(join(root, req.runId, 'run1.failed-1'))).isDirectory());
});

test('D1: observed window outside the run stops as PERIOD_OUTSIDE_RUN after one call, detail has no paths', async () => {
  const f = fake([periodFailure('2026-09-01', '2026-09-30')]);
  const result = await runMetricCapture(config(), request({ requestedPeriod: { startDate: '2026-09-03', endDate: '2026-10-02' } }), f.deps);
  assert.ok(!result.ok); if (result.ok) return;
  assert.equal(result.code, 'PERIOD_OUTSIDE_RUN'); assert.equal(result.executorCalls, 1);
  assert.ok(!result.detail.includes(root) && !result.detail.includes('/'), result.detail);
});

test('D1: an unparsable period error stops as METRIC_PERIOD_UNSUPPORTED after one call', async () => {
  const f = fake([{ exitCode: 1, stdout: '', stderr: 'METRIC_PERIOD_UNSUPPORTED: page default unknown' }]);
  const result = await runMetricCapture(config(), request(), f.deps);
  assert.deepEqual({ code: !result.ok && result.code, calls: result.executorCalls }, { code: 'METRIC_PERIOD_UNSUPPORTED', calls: 1 });
});

test('D1: never more than two executor calls', async () => {
  const f = fake([periodFailure('2026-09-01', '2026-09-30'), periodFailure('2026-08-31', '2026-09-29'), READY]);
  const result = await runMetricCapture(config(), request(), f.deps);
  assert.deepEqual({ code: !result.ok && result.code, calls: result.executorCalls }, { code: 'METRIC_PERIOD_UNSUPPORTED', calls: 2 });
  assert.equal(f.calls.length, 2);
});

test('other executor stops are returned as is with a short path-free detail', async () => {
  const f = fake([{ exitCode: 1, stdout: '', stderr: `METRIC_SEARCH_NOT_APPLIED: result region missing; debug folder: ${root}/x` }]);
  const result = await runMetricCapture(config(), request(), f.deps);
  assert.ok(!result.ok); if (result.ok) return;
  assert.equal(result.code, 'METRIC_SEARCH_NOT_APPLIED'); assert.equal(result.executorCalls, 1); assert.ok(!result.detail.includes(root));
});

test('the in-process lock serializes two captures', async () => {
  const events: string[] = [];
  let finishFirst!: (value: MetricOpenCliProcessResult) => void, firstStarted!: () => void;
  const first = new Promise<MetricOpenCliProcessResult>(resolve => { finishFirst = resolve; });
  const firstRunning = new Promise<void>(resolve => { firstStarted = resolve; });
  const deps = (name: string, completion: () => Promise<MetricOpenCliProcessResult>): MetricCaptureRunnerDependencies => ({
    sourceEnv: {}, readManifest: async () => manifest,
    createProcessRunner: () => async (_executable, argv) => { await writeCaptureManifest(argv); events.push(`${name}:start`); return { child: { kill: () => true }, completion: completion().then(r => { events.push(`${name}:end`); return r; }) }; },
  });
  const a = runMetricCapture(config(), request(), deps('a', () => { firstStarted(); return first; }));
  const b = runMetricCapture(config(), request(), deps('b', async () => READY));
  let probe: Promise<void> | undefined;
  try {
    const started = await Promise.race([firstRunning.then(() => true), a.then(() => false)]);
    assert.equal(started, true, 'first capture reached the fake process runner');
    // This waiter has no filesystem work: without serialization it must run on
    // this turn, even if the second capture is still preparing its directory.
    probe = withOpenCliBrowserLock(undefined, async () => { events.push('probe'); }, () => undefined);
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(events, ['a:start']);
  } finally {
    finishFirst(READY);
    await Promise.all([a, b, probe]);
  }
  const [ra, rb] = await Promise.all([a, b]);
  assert.ok(ra.ok && rb.ok);
  assert.deepEqual(events, ['a:start', 'a:end', 'b:start', 'b:end', 'probe']);
});

class FakeChild extends EventEmitter {
  readonly stdout = new EventEmitter(); readonly stderr = new EventEmitter();
  readonly kills: (NodeJS.Signals | number | undefined)[] = [];
  constructor(readonly pid: number | undefined) { super(); }
  kill(signal?: NodeJS.Signals | number) { this.kills.push(signal); return true; }
}

function fakeSpawn(pid: number | undefined = 4242) {
  const spawned: { command: string; args: readonly string[]; options: SpawnOptions; child: FakeChild }[] = [];
  const spawn = (command: string, args: readonly string[], options: SpawnOptions) => {
    const child = new FakeChild(pid); spawned.push({ command, args, options, child }); return child as unknown as ChildProcess;
  };
  return { spawn, spawned };
}

test('abort kills the process group and the child and reports CAPTURE_INTERRUPTED', async () => {
  const { spawn, spawned } = fakeSpawn();
  const groupKills: [number, NodeJS.Signals | number][] = [];
  const controller = new AbortController();
  const pending = runMetricCapture(config(), request({ signal: controller.signal }), {
    sourceEnv: {}, readManifest: async () => manifest,
    createProcessRunner: signal => createMetricOpenCliProcessRunner({ ...(signal ? { signal } : {}), spawn, platform: 'linux', killProcess: (pid, sig) => { groupKills.push([pid, sig]); } }),
  });
  while (spawned.length === 0) await new Promise(resolve => setTimeout(resolve, 5));
  controller.abort();
  const result = await pending;
  assert.deepEqual({ code: !result.ok && result.code, calls: result.executorCalls }, { code: 'CAPTURE_INTERRUPTED', calls: 1 });
  assert.deepEqual(groupKills, [[-4242, 'SIGKILL']]);
  assert.deepEqual(spawned[0]!.child.kills, ['SIGKILL']);
});

test('abort while waiting for the lock returns without starting a process', async () => {
  let finishFirst!: (value: MetricOpenCliProcessResult) => void;
  const first = new Promise<MetricOpenCliProcessResult>(resolve => { finishFirst = resolve; });
  let secondStarted = false;
  const a = runMetricCapture(config(), request(), { sourceEnv: {}, readManifest: async () => manifest,
    createProcessRunner: () => async (_executable, argv) => { await writeCaptureManifest(argv); return { child: { kill: () => true }, completion: first }; } });
  const controller = new AbortController();
  const b = runMetricCapture(config(), request({ signal: controller.signal }), { sourceEnv: {}, readManifest: async () => manifest,
    createProcessRunner: () => async () => { secondStarted = true; return { child: { kill: () => true }, completion: Promise.resolve(READY) }; } });
  try {
    await new Promise(resolve => setTimeout(resolve, 20));
    controller.abort();
    const rb = await b;
    assert.deepEqual({ code: !rb.ok && rb.code, calls: rb.executorCalls }, { code: 'CAPTURE_INTERRUPTED', calls: 0 });
  } finally {
    finishFirst(READY);
    await Promise.all([a, b]);
  }
  assert.ok((await a).ok); assert.equal(secondStarted, false);
});

test('process runner: spawn options, output collection, env filtering', async () => {
  const { spawn, spawned } = fakeSpawn();
  const run = createMetricOpenCliProcessRunner({ spawn, platform: 'linux', killProcess: () => {} });
  const execution = await run('opencli', ['metric', 'capture'], { shell: false, detached: true, env: { PATH: '/bin', DROP: undefined } });
  const [{ command, args, options, child }] = spawned as [typeof spawned[number]];
  assert.equal(command, 'opencli'); assert.deepEqual(args, ['metric', 'capture']);
  assert.deepEqual({ shell: options.shell, detached: options.detached, stdio: options.stdio, windowsHide: options.windowsHide, env: options.env },
    { shell: false, detached: true, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { PATH: '/bin' } });
  assert.equal(typeof execution.child.killGroup, 'function');
  child.stdout.emit('data', Buffer.from('[{"status":'));
  child.stdout.emit('data', Buffer.from('"READY"}]'));
  child.stderr.emit('data', Buffer.from('note'));
  child.emit('close', 0);
  assert.deepEqual(await execution.completion, { exitCode: 0, stdout: '[{"status":"READY"}]', stderr: 'note' });
});

test('process runner: over-cap output kills the group; spawn errors keep their code; no group kill on win32', async () => {
  const { spawn, spawned } = fakeSpawn(77);
  const groupKills: number[] = [];
  const run = createMetricOpenCliProcessRunner({ spawn, platform: 'linux', streamCapBytes: 8, killProcess: pid => { groupKills.push(pid); } });
  const capped = await run('opencli', [], { shell: false, detached: true, env: {} });
  spawned[0]!.child.stderr.emit('data', Buffer.from('0123456789'));
  await assert.rejects(capped.completion, (error: any) => error.code === 'OUTPUT_CAP_EXCEEDED');
  assert.deepEqual(groupKills, [-77]); assert.deepEqual(spawned[0]!.child.kills, ['SIGKILL']);

  const missing = await run('opencli', [], { shell: false, detached: true, env: {} });
  spawned[1]!.child.emit('error', Object.assign(new Error('spawn opencli ENOENT'), { code: 'ENOENT' }));
  await assert.rejects(missing.completion, (error: any) => error.code === 'ENOENT');

  const windows = createMetricOpenCliProcessRunner({ spawn, platform: 'win32', killProcess: () => assert.fail('no group kill on win32') });
  const winExecution = await windows('opencli', [], { shell: false, detached: true, env: {} });
  assert.equal(winExecution.child.killGroup, undefined);
  spawned[2]!.child.emit('close', 0);
  await winExecution.completion;
});

// The real adapter runs against a synthetic browser-CLI transcript. Existing legacy
// happy-path coverage above owns the absent-preset row; no live process is launched.
test('CAPTURE preset rows publish both applied-state manifests or stop without legacy fallback', async () => {
  const fixture = JSON.parse(await readFile(new URL('../fixtures/metric-v3/live-map-contract.json', import.meta.url), 'utf8'));
  for (const outcome of ['ready', 'unknown-category', 'logged-out'] as const) {
    const spec = structuredClone(fixture.spec);
    if (outcome === 'unknown-category') spec.preset.category.id = 'c9999999999';
    let windowIndex = 0;
    let selected: string[] = [];
    const keywords: string[] = [];
    let closed = false;
    let opened = false;
    const transport: MetricCaptureRunnerDependencies = {
      sourceEnv: {},
      createProcessRunner: () => async (_executable, argv) => {
        assert.equal(argv[0], 'browser', 'preset must never launch the legacy capture command');
        let response: unknown;
        if (argv[2] === 'tab') {
          if (argv[3] === 'new') { opened = true; response = { page: 'ABC123' }; }
          else { closed = true; response = { ok: true }; }
        } else {
          const js = argv[5]!;
          if (js.includes('function readV3Page(')) {
            response = outcome === 'logged-out' ? { stop: 'CAPTURE_LOGIN_REQUIRED' } : {
              ...structuredClone(fixture.windows[windowIndex].observation),
              advancedVisible: true, submitIdle: true, submitReady: true,
              selectedCategoryIds: [...selected],
              appliedState: { ...structuredClone(fixture.spec.preset), keywords: [...keywords] },
            };
          } else if (js.includes('function formAction(')) {
            const action = JSON.parse(js.slice(js.lastIndexOf('\n})(') + 4, -1));
            if (action.kind === 'categoryAll') selected = [];
            if (action.kind === 'categoryChild') selected.push(fixture.spec.preset.category.children.find((c: any) => action.labels.includes(c.label)).id);
            if (action.kind === 'keyword') keywords.push(action.value);
            if (action.kind === 'option' && action.labels.includes('365 days')) windowIndex = 1;
            response = action.kind === 'date' ? { done: true } : { ok: true };
          } else if (js.includes('ready:')) response = { ready: true };
          else if (js.includes('pending:')) response = { pending: 0, quiet: 1001, overflow: false };
          else if (js.includes('.filter((r)')) response = fixture.windows[windowIndex].responses.map((r: any) => r.urlPath);
          else if (js.includes('=> window.__tdnV3Capture.responses')) response = fixture.windows[windowIndex].responses;
          else response = { ok: true };
        }
        return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout: JSON.stringify(response), stderr: '' }) };
      },
    };
    const req = { runId: newRunId(), keyword: spec.preset.keywords[0], requestedPeriod: spec.windows[1].period, metricV3Preset: spec };
    const result = await runMetricCapture(config({ adapterManifestPath: undefined, adapterManifestSha256: undefined }), req, transport);
    assert.equal(opened, true); assert.equal(closed, true, 'owned tab must close even on control failure');
    assert.equal(result.executorCalls, 1);
    const dir = join(root, req.runId, 'run1');
    if (outcome === 'ready') {
      assert.ok(result.ok, JSON.stringify(result));
      const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8'));
      assert.deepEqual(manifest.windows.map((w: any) => w.window), ['30d', '12m']);
      for (const id of ['30d', '12m']) {
        const window = JSON.parse(await readFile(join(dir, id, 'manifest.json'), 'utf8'));
        assert.deepEqual(window.appliedState, fixture.spec.preset);
        assert.equal(window.captureGate, 'PASSED');
        assert.equal(window.window.id, id);
      }
    } else {
      assert.equal(!result.ok && result.code, outcome === 'logged-out' ? 'CAPTURE_LOGIN_REQUIRED' : 'CAPTURE_CATEGORY_NOT_SELECTABLE');
      if (outcome === 'logged-out') assert.match(!result.ok ? result.detail : '', /^DECISION NEEDED:/);
      await assert.rejects(readFile(join(dir, 'manifest.json')), { code: 'ENOENT' });
    }
  }
});
