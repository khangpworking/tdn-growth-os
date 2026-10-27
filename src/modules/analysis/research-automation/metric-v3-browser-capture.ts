import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { MetricV3CaptureSpec } from './metric-v3-capture-spec.js';
import type { MetricOpenCliProcessRunner } from './metric-opencli-executor.js';

/** Checkout adapter, shared by autorun and the guarded operator command. Owns only its new tab. */
export async function captureMetricV3(spec: MetricV3CaptureSpec, outputDir: string, executable: string, options: BrowserOptions): Promise<void> {
  await withMetricV3Page(executable, options, async (page) => {
    const moduleUrl = new URL('../../../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url);
    const { captureV3WithFallback } = await import(moduleUrl.href);
    await captureV3WithFallback(page, spec, outputDir, { evidence: options.evidence === true });
  }, outputDir);
}

/** Calendar-only preflight: never presses Analytics or changes an existing run. */
export async function readMetricAvailableEndDate(endDate: string, executable: string, options: BrowserOptions): Promise<string> {
  return withMetricV3Page(executable, options, async (page) => {
    const moduleUrl = new URL('../../../../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url);
    const { discoverV3AvailableEndDate } = await import(moduleUrl.href);
    return discoverV3AvailableEndDate(page, endDate);
  });
}

type BrowserOptions = {
  readonly env: Readonly<Record<string, string>>;
  readonly createProcessRunner: (signal?: AbortSignal) => MetricOpenCliProcessRunner;
  readonly signal?: AbortSignal;
  /** TDN_METRIC_EVIDENCE_ENABLED: screenshot evidence of each window; absent keeps the capture exactly as before. */
  readonly evidence?: boolean;
};
interface MetricBrowserPage {
  evaluate(fn: (...args: never[]) => unknown, arg?: unknown): Promise<any>;
  wait(ms: number): Promise<void>;
  click(selector: string): Promise<void>;
  screenshot?: (options: { path: string; fullPage?: boolean }) => Promise<void>;
}
async function withMetricV3Page<T>(executable: string, options: BrowserOptions,
  operation: (page: MetricBrowserPage) => Promise<T>, outputDir?: string): Promise<T> {
  const session = `m3-${randomUUID()}`;
  const deadline = Date.now() + (outputDir ? 1_620_000 : 60_000);
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
        }, cleanup ? (outputDir ? 60_000 : 10_000) : Math.min(60_000, Math.max(1, deadline - Date.now()))); }),
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
    if (outputDir) await writeFile(join(outputDir, 'session.json'), `${JSON.stringify({ session, tab })}\n`, { flag: 'wx', mode: 0o600 });
    const page = {
      evaluate: async (fn: (...args: never[]) => unknown, arg?: unknown) => {
        check();
        return command(['eval', '--tab', tab!, `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`]);
      },
      wait: async (ms: number) => { check(); await delay(ms, undefined, signal ? { signal } : {}); },
      click: async (selector: string) => { await command(['click', '--tab', tab!, selector]); },
      // Screenshot of our own tab only; the bridge writes the PNG to the given path.
      ...(options.evidence ? { screenshot: async ({ path, fullPage }: { path: string; fullPage?: boolean }) => {
        await command(['screenshot', '--tab', tab!, ...(fullPage ? ['--full-page'] : []), path], false, false);
      } } : {}),
    };
    return await operation(page);
  } catch (error) {
    const code = signal?.aborted ? 'CAPTURE_INTERRUPTED' : error instanceof Error ? error.message : 'CAPTURE_FAILED';
    const errors = (error as { details?: object })?.details;
    stopped = { code, ...(errors ? { errors } : {}) };
    if (outputDir) await writeFile(join(outputDir, 'stopped.json'), `${JSON.stringify(stopped)}\n`, { flag: 'wx', mode: 0o600 });
    throw error;
  } finally {
    if (tab) {
      try { await command(['tab', 'close', tab], true); }
      catch (error) {
        if (!stopped) throw error;
        const cleanupCode = error instanceof Error ? error.message : 'CAPTURE_FAILED';
        if (outputDir) await writeFile(join(outputDir, 'stopped.json'), `${JSON.stringify({ ...stopped, cleanupCode })}\n`, { mode: 0o600 });
      }
    }
  }
}
