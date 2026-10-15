// Real child-process runner for the OpenCLI Metric executor (P6-209 auto-run, PR1).
//
// Starts exactly one no-shell, detached child (its own process group on
// Linux), collects stdout/stderr up to a byte cap, and kills the whole group
// on overflow or abort. The executor owns the timeout; this runner only starts
// the child and reports completion. Not wired into the app yet.
import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { MetricOpenCliChild, MetricOpenCliProcessExecution, MetricOpenCliProcessOptions, MetricOpenCliProcessResult, MetricOpenCliProcessRunner } from './metric-opencli-executor.js';

export const METRIC_OPENCLI_STREAM_CAP_BYTES = 8 * 1024 * 1024;

export type MetricSpawn = (command: string, args: readonly string[], options: SpawnOptions) => ChildProcess;

export interface MetricOpenCliProcessRunnerOptions {
  /** Aborting kills the child and its process group and rejects completion. */
  readonly signal?: AbortSignal;
  readonly streamCapBytes?: number;
  /** Test seams; production uses node's spawn, process.kill and process.platform. */
  readonly spawn?: MetricSpawn;
  readonly killProcess?: (pid: number, signal: NodeJS.Signals | number) => void;
  readonly platform?: NodeJS.Platform;
}

function codedError(message: string, code: string): Error {
  return Object.assign(new Error(message), { code });
}

export function createMetricOpenCliProcessRunner(options: MetricOpenCliProcessRunnerOptions = {}): MetricOpenCliProcessRunner {
  const spawn = options.spawn ?? (nodeSpawn as unknown as MetricSpawn);
  const killProcess = options.killProcess ?? ((pid: number, signal: NodeJS.Signals | number) => { process.kill(pid, signal); });
  const platform = options.platform ?? process.platform;
  const cap = options.streamCapBytes ?? METRIC_OPENCLI_STREAM_CAP_BYTES;
  const { signal } = options;

  return async (executable: string, argv: readonly string[], processOptions: MetricOpenCliProcessOptions): Promise<MetricOpenCliProcessExecution> => {
    if (signal?.aborted) throw codedError('capture aborted before start', 'ABORT_ERR');
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(processOptions.env)) if (typeof value === 'string') env[key] = value;
    const child = spawn(executable, [...argv], {
      shell: false, detached: true, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });

    const pid = child.pid;
    const killGroup = platform !== 'win32'
      ? (sig: NodeJS.Signals | number = 'SIGKILL') => {
        // pid is only known once the OS started the child; a negative pid targets its group.
        if (child.pid && child.pid > 0) { killProcess(-child.pid, sig); return true; }
        return false;
      }
      : undefined;
    const handle: MetricOpenCliChild = {
      ...(pid === undefined ? {} : { pid }),
      kill: (sig?: NodeJS.Signals | number) => child.kill(sig),
      ...(killGroup ? { killGroup } : {}),
    };
    const killAll = () => {
      try { killGroup?.('SIGKILL'); } catch { /* group may already be gone */ }
      try { child.kill('SIGKILL'); } catch { /* child may already be gone */ }
    };

    let onAbort: (() => void) | undefined;
    const completion = new Promise<MetricOpenCliProcessResult>((resolve, reject) => {
      const out: Buffer[] = []; const err: Buffer[] = [];
      let outBytes = 0; let errBytes = 0; let settled = false;
      const finish = (action: () => void) => {
        if (settled) return;
        settled = true;
        if (onAbort) signal?.removeEventListener('abort', onAbort);
        action();
      };
      const collect = (target: Buffer[], stream: 'stdout' | 'stderr') => (chunk: Buffer | string) => {
        if (settled) return;
        const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
        const total = (stream === 'stdout' ? (outBytes += bytes.length) : (errBytes += bytes.length));
        if (total > cap) {
          killAll();
          finish(() => reject(codedError(`OpenCLI ${stream} exceeded the ${cap}-byte cap; the process was killed`, 'OUTPUT_CAP_EXCEEDED')));
          return;
        }
        target.push(bytes);
      };
      child.stdout?.on('data', collect(out, 'stdout'));
      child.stderr?.on('data', collect(err, 'stderr'));
      // The original error (e.g. ENOENT) keeps its code for the executor's mapping.
      child.once('error', error => finish(() => reject(error)));
      child.once('close', (code: number | null) => finish(() => resolve({
        exitCode: code, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8'),
      })));
      if (signal) {
        onAbort = () => { killAll(); finish(() => reject(codedError('capture aborted', 'ABORT_ERR'))); };
        signal.addEventListener('abort', onAbort, { once: true });
      }
    });
    // Callers always await completion; this only prevents an unhandled-rejection
    // report if the child fails before the executor starts awaiting.
    completion.catch(() => {});
    return { child: handle, completion };
  };
}
