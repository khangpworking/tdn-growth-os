import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { MetricV3CaptureSpec } from './metric-v3-capture-spec.js';
import type { MetricOpenCliProcessRunner } from './metric-opencli-executor.js';

/** Checkout adapter, shared by autorun and the guarded operator command. Owns only its new tab. */
export async function captureMetricV3(spec: MetricV3CaptureSpec, outputDir: string, executable: string, options: {
  readonly env: Readonly<Record<string, string>>;
  readonly createProcessRunner: (signal?: AbortSignal) => MetricOpenCliProcessRunner;
  readonly signal?: AbortSignal;
  /** TDN_METRIC_EVIDENCE_ENABLED: screenshot evidence of each window; absent keeps the capture exactly as before. */
  readonly evidence?: boolean;
}): Promise<void> {
  const session = `m3-${randomUUID()}`;
  const deadline = Date.now() + 1_620_000;
  const signal = options.signal;
  const check = () => {
    signal?.throwIfAborted();
    if (Date.now() >= deadline) throw new Error('TIMEOUT');
  };
  const command = async (args: string[], cleanup = false, json = true): Promise<any> => {
    if (!cleanup) check();
    const run = options.createProcessRunner(cleanup ? undefined : signal);
    const execution = await run(executable, ['browser', session, ...args], { shell: false, detached: true, env: options.env });
    let timer: NodeJS.Timeout | undefined;
    try {
      const result = await Promise.race([
        execution.completion,
        new Promise<never>((_, reject) => { timer = setTimeout(() => {
          try { execution.child.killGroup?.('SIGKILL'); } catch { /* best effort */ }
          try { execution.child.kill('SIGKILL'); } catch { /* best effort */ }
          reject(new Error('CAPTURE_BRIDGE_TIMEOUT'));
        }, cleanup ? 60_000 : Math.min(60_000, Math.max(1, deadline - Date.now()))); }),
      ]);
      if (result.exitCode !== 0) {
        if (/bridge.*(?:timeout|timed out)|(?:timeout|timed out).*bridge|BROWSER_(?:COMMAND_)?TIMEOUT/i.test(result.stderr))
          throw new Error('CAPTURE_BRIDGE_TIMEOUT');
        if (/selector.*(?:timeout|timed out)|(?:timeout|timed out).*selector/i.test(result.stderr))
          throw new Error('CAPTURE_SELECTOR_TIMEOUT');
        throw new Error('CAPTURE_FAILED');
      }
      return json ? JSON.parse(result.stdout) : undefined;
    } finally { if (timer) clearTimeout(timer); }
  };
  let tab: string | undefined;
  let stopped: { code: string; errors?: object } | undefined;
  try {
    const opened = await command(['tab', 'new', 'https://metric.vn/analytics']);
    if (typeof opened.page !== 'string' || !/^[A-Fa-f0-9]+$/.test(opened.page)) throw new Error('CAPTURE_TAB_UNAVAILABLE');
    tab = opened.page;
    await writeFile(join(outputDir, 'session.json'), `${JSON.stringify({ session, tab })}\n`, { flag: 'wx', mode: 0o600 });
    const moduleUrl = new URL('../../../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url);
    const { captureV3WithFallback } = await import(moduleUrl.href);
    const page = {
      evaluate: async (fn: (...args: never[]) => unknown, arg?: unknown) => {
        check();
        return command(['eval', '--tab', tab!, `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`]);
      },
      wait: async (ms: number) => { check(); await delay(ms, undefined, signal ? { signal } : {}); },
      // Screenshot of our own tab only; the bridge writes the PNG to the given path.
      ...(options.evidence ? { screenshot: async ({ path, fullPage }: { path: string; fullPage?: boolean }) => {
        await command(['screenshot', '--tab', tab!, ...(fullPage ? ['--full-page'] : []), path], false, false);
      } } : {}),
    };
    await captureV3WithFallback(page, spec, outputDir, { evidence: options.evidence === true });
  } catch (error) {
    const code = signal?.aborted ? 'CAPTURE_INTERRUPTED' : error instanceof Error ? error.message : 'CAPTURE_FAILED';
    const errors = (error as { details?: object })?.details;
    stopped = { code, ...(errors ? { errors } : {}) };
    await writeFile(join(outputDir, 'stopped.json'), `${JSON.stringify(stopped)}\n`, { flag: 'wx', mode: 0o600 });
    throw error;
  } finally {
    if (tab) {
      try { await command(['tab', 'close', tab], true); }
      catch (error) {
        if (!stopped) throw error;
        const cleanupCode = error instanceof Error ? error.message : 'CAPTURE_FAILED';
        await writeFile(join(outputDir, 'stopped.json'), `${JSON.stringify({ ...stopped, cleanupCode })}\n`, { mode: 0o600 });
      }
    }
  }
}
