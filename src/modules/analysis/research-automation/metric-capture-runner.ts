// Capture glue for the Market auto-runner (P6-209 follow-up, PR1).
//
// Writes the derived spec under <captureRoot>/<runId>/, runs the pinned OpenCLI
// executor with an explicit long timeout and an env allow-list, serializes
// captures in-process, and applies the D1 period probe-retry (at most two
// executor calls). Every deployment value (adapter manifest, digest, capture
// root, executable) comes from the injected config; nothing machine-specific is
// hard-coded. Not wired into the app yet.
import { chmod, mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { buildCaptureSpec, decidePeriodRetry, planCapturePeriod, type DatePeriod } from './autorun-derive.js';
import { executeMetricOpenCli, type MetricOpenCliCode, type MetricOpenCliProcessRunner, type MetricOpenCliResult } from './metric-opencli-executor.js';
import { createMetricOpenCliProcessRunner } from './metric-opencli-process-runner.js';
import { withOpenCliBrowserLock } from './opencli-browser-lock.js';

/** 1500 s adapter budget plus 120 s margin. The executor default (120 s) is far too short. */
export const METRIC_CAPTURE_TIMEOUT_MS = 1_620_000;
export const METRIC_CAPTURE_BROWSER_COMMAND_TIMEOUT = '1500';
const ENV_ALLOW_LIST = ['PATH', 'HOME', 'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR'] as const;
const MAX_EXECUTOR_CALLS = 2;
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface MetricCaptureRunnerConfig {
  /** Raw TDN_METRIC_OPENCLI_ENABLED value; the executor requires exactly "1". */
  readonly enabledEnv?: string | undefined;
  /** Absolute directory holding one folder per run. */
  readonly captureRoot: string;
  readonly adapterManifestPath?: string | undefined;
  readonly adapterManifestSha256?: string | undefined;
  readonly opencliExecutable?: string | undefined;
}

export interface MetricCaptureRequest {
  readonly runId: string;
  readonly keyword: string;
  readonly requestedPeriod: DatePeriod;
  readonly signal?: AbortSignal;
}

export type MetricCaptureStopCode =
  | MetricOpenCliCode | 'EXECUTOR_NOT_CONFIGURED' | 'PERIOD_OUTSIDE_RUN' | 'CAPTURE_INTERRUPTED' | 'CAPTURE_INPUT_INVALID' | 'CAPTURE_IO_FAILED';

export type MetricCaptureRunResult =
  | { readonly ok: true; readonly captureDir: string; readonly period: DatePeriod; readonly executorCalls: number }
  | { readonly ok: false; readonly code: MetricCaptureStopCode; readonly detail: string; readonly executorCalls: number };

export interface MetricCaptureRunnerDependencies {
  /** Source of the allow-listed variables; defaults to process.env. */
  readonly sourceEnv?: Readonly<Record<string, string | undefined>>;
  readonly readManifest?: (path: string) => Promise<Uint8Array>;
  readonly createProcessRunner?: (signal?: AbortSignal) => MetricOpenCliProcessRunner;
  readonly execute?: typeof executeMetricOpenCli;
}

/** Only the variables the CLI and its browser bridge need; never provider keys or app secrets. */
export function metricCaptureEnv(source: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env: Record<string, string> = {};
  for (const key of ENV_ALLOW_LIST) {
    const value = source[key] ?? (key === 'PATH' ? source.Path : undefined);
    if (typeof value === 'string' && value !== '') env[key] = value;
  }
  env.OPENCLI_BROWSER_COMMAND_TIMEOUT = METRIC_CAPTURE_BROWSER_COMMAND_TIMEOUT;
  return env;
}

// One browser-CLI user per process, shared with the Meta ad library lane.
const withCaptureLock = withOpenCliBrowserLock;

async function exists(path: string): Promise<boolean> {
  try { await stat(path); return true; } catch { return false; }
}

/** Keeps a prior attempt for audit, like the operator script, so run1 is always the live capture. */
async function moveAside(dir: string): Promise<void> {
  if (!(await exists(dir))) return;
  for (let n = 1; n < 1000; n++) {
    const target = `${dir}.failed-${n}`;
    if (!(await exists(target))) { await rename(dir, target); return; }
  }
  throw new Error('too many failed capture folders');
}

async function writeSpec(path: string, spec: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(spec, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600); // mode only applies on create; a rewritten spec keeps 0600 too.
}

function stop(code: MetricCaptureStopCode, detail: string, executorCalls: number): MetricCaptureRunResult {
  return { ok: false, code, detail, executorCalls };
}

/** Short, path-free detail for the card; the raw executor message may hold local paths. */
function detailFor(result: Extract<MetricOpenCliResult, { ok: false }>): string {
  return `capture stopped: ${result.code}`;
}

export async function runMetricCapture(config: MetricCaptureRunnerConfig, request: MetricCaptureRequest, dependencies: MetricCaptureRunnerDependencies = {}): Promise<MetricCaptureRunResult> {
  if (!config.adapterManifestPath || !config.adapterManifestSha256) return stop('EXECUTOR_NOT_CONFIGURED', 'adapter manifest path or digest is not configured', 0);
  if (!config.captureRoot || !isAbsolute(config.captureRoot)) return stop('EXECUTOR_NOT_CONFIGURED', 'capture directory is not an absolute path', 0);
  if (typeof request.runId !== 'string' || !RUN_ID.test(request.runId)) return stop('CAPTURE_INPUT_INVALID', 'run id is not a UUID', 0);
  const planned = planCapturePeriod(request.requestedPeriod);
  if (!planned.ok) return stop('PERIOD_OUTSIDE_RUN', 'the 30-day capture window is not inside the requested period', 0);
  let spec;
  try { spec = buildCaptureSpec(request.keyword, planned.period); } catch { return stop('CAPTURE_INPUT_INVALID', 'keyword or period is invalid', 0); }

  const { signal } = request;
  const interrupted = (calls: number) => stop('CAPTURE_INTERRUPTED', 'capture was aborted', calls);
  return withCaptureLock(signal, async () => {
    const runDir = join(config.captureRoot, request.runId);
    const specPath = join(runDir, 'spec.json');
    const outputDir = join(runDir, 'run1');
    const execute = dependencies.execute ?? executeMetricOpenCli;
    const readManifest = dependencies.readManifest ?? (async (path: string) => readFile(path));
    const env = metricCaptureEnv(dependencies.sourceEnv ?? process.env);
    let period = planned.period;
    let calls = 0;
    while (calls < MAX_EXECUTOR_CALLS) {
      if (signal?.aborted) return interrupted(calls);
      try {
        await mkdir(runDir, { recursive: true, mode: 0o700 });
        await writeSpec(specPath, { ...spec, period });
        await moveAside(outputDir);
      } catch {
        return stop('CAPTURE_IO_FAILED', 'capture folder could not be prepared', calls);
      }
      const runProcess = (dependencies.createProcessRunner ?? (s => createMetricOpenCliProcessRunner(s ? { signal: s } : {})))(signal);
      calls += 1;
      const result = await execute({
        ...(config.enabledEnv === undefined ? {} : { enabledEnv: config.enabledEnv }),
        executable: config.opencliExecutable ?? 'opencli',
        specPath, outputDir,
        adapterManifestPath: config.adapterManifestPath!, expectedAdapterManifestSha256: config.adapterManifestSha256!,
        timeoutMs: METRIC_CAPTURE_TIMEOUT_MS, env,
      }, { readManifest, runProcess });
      if (signal?.aborted) return interrupted(calls);
      if (result.ok) return { ok: true, captureDir: outputDir, period, executorCalls: calls };
      if (result.code !== 'METRIC_PERIOD_UNSUPPORTED' || calls >= MAX_EXECUTOR_CALLS) return stop(result.code, detailFor(result), calls);
      const decision = decidePeriodRetry(result.message, request.requestedPeriod, period);
      if (!decision.retry) {
        const seen = decision.observed ? `; page window ${decision.observed.startDate}..${decision.observed.endDate}` : '';
        return stop(decision.code, `capture stopped: ${decision.code}${seen}`, calls);
      }
      period = decision.period;
    }
    return stop('METRIC_PERIOD_UNSUPPORTED', 'capture stopped: METRIC_PERIOD_UNSUPPORTED', calls);
  }, () => interrupted(0));
}
