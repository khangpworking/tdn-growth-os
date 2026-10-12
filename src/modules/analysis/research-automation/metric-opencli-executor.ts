import { createHash } from 'node:crypto';

export const METRIC_OPENCLI_ARGV = Object.freeze([
  'metric', 'capture', '--spec', '__SPEC__', '--out', '__OUT__', '--product-cap', '200', '-f', 'json',
] as const);

export type MetricOpenCliCode =
  | 'METRIC_LOGIN_REQUIRED' | 'METRIC_CAPTCHA' | 'METRIC_PERIOD_UNSUPPORTED' | 'METRIC_UI_CHANGED' | 'METRIC_FILTER_MISMATCH' | 'METRIC_ROW_CAP'
  | 'BRIDGE_DISCONNECTED' | 'EXECUTOR_DISABLED' | 'TIMEOUT' | 'MANIFEST_HASH_MISMATCH';

export interface MetricOpenCliProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

export interface MetricOpenCliChild {
  readonly pid?: number;
  kill(signal?: NodeJS.Signals | number): boolean | void;
  /** The injected runner may provide the platform-specific process-group kill. */
  killGroup?(signal?: NodeJS.Signals | number): boolean | void;
}

export interface MetricOpenCliProcessExecution {
  readonly child: MetricOpenCliChild;
  readonly completion: Promise<MetricOpenCliProcessResult>;
}

export interface MetricOpenCliProcessOptions {
  readonly shell: false;
  readonly detached: true;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export type MetricOpenCliProcessRunner = (
  executable: string,
  argv: readonly string[],
  options: MetricOpenCliProcessOptions,
) => Promise<MetricOpenCliProcessExecution>;

export interface MetricOpenCliExecutorInput {
  readonly enabledEnv?: string;
  readonly executable?: string;
  readonly specPath: string;
  readonly outputDir: string;
  readonly adapterManifestPath: string;
  readonly expectedAdapterManifestSha256: string;
  readonly timeoutMs?: number;
  readonly env?: Readonly<Record<string, string | undefined>>;
}

export interface MetricOpenCliExecutorDependencies {
  readonly readManifest: (path: string) => Promise<Uint8Array>;
  readonly runProcess: MetricOpenCliProcessRunner;
}

export type MetricOpenCliResult =
  | { readonly ok: true; readonly stdout: string; readonly stderr: string; readonly argv: readonly string[] }
  | { readonly ok: false; readonly code: MetricOpenCliCode; readonly message: string; readonly argv: readonly string[] };

const FAIL_CLOSED_CODES = [
  'METRIC_LOGIN_REQUIRED', 'METRIC_CAPTCHA', 'METRIC_PERIOD_UNSUPPORTED', 'METRIC_UI_CHANGED', 'METRIC_FILTER_MISMATCH', 'METRIC_ROW_CAP',
] as const;

function sha256(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
function isManifestDigest(value: string): boolean { return /^[0-9a-f]{64}$/.test(value); }
function argvFor(input: MetricOpenCliExecutorInput): readonly string[] {
  return METRIC_OPENCLI_ARGV.map(arg => arg === '__SPEC__' ? input.specPath : arg === '__OUT__' ? input.outputDir : arg);
}
function outputText(result: Pick<MetricOpenCliProcessResult, 'stdout' | 'stderr'>): string { return `${result.stdout}\n${result.stderr}`; }

function codeInOutput(output: string): MetricOpenCliCode | undefined {
  for (const code of FAIL_CLOSED_CODES) if (output.includes(code)) return code;
  if (/BROWSER_CONNECT|BRIDGE_DISCONNECTED|extension.*connect|daemon.*(offline|not running)|ECONNREFUSED/i.test(output)) return 'BRIDGE_DISCONNECTED';
  if (/ETIMEDOUT|timed out|timeout/i.test(output)) return 'TIMEOUT';
  return undefined;
}

function codeFromError(error: unknown): MetricOpenCliCode | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && (FAIL_CLOSED_CODES.includes(code as (typeof FAIL_CLOSED_CODES)[number]) || code === 'BRIDGE_DISCONNECTED' || code === 'TIMEOUT')) return code as MetricOpenCliCode;
  }
  return undefined;
}

function isAdapterResult(stdout: string): boolean {
  try {
    const value: unknown = JSON.parse(stdout);
    if (!Array.isArray(value) || value.length !== 1 || !value[0] || typeof value[0] !== 'object' || Array.isArray(value[0])) return false;
    return typeof (value[0] as { status?: unknown }).status === 'string'
      && (value[0] as { status: string }).status === 'READY';
  } catch {
    return false;
  }
}

/** Only framework startup/connection lines known to be emitted outside JSON. */
function isKnownBenignStderr(stderr: string): boolean {
  const known = [
    /^\s*$/,
    /^ℹ\s+\[daemon\] Extension connected(?:\s+profile connected)?\s*$/,
    /^⏳\s+Starting daemon\.\.\.\s*$/,
    /^⏳\s+Waiting for Chrome\/Chromium extension to connect\.\.\.\s*$/,
    /^\s+Make sure Chrome or Chromium is open and the OpenCLI extension is enabled\.\s*$/,
    /^\s+Connected to (?:daemon|browser bridge)\.\s*$/,
  ];
  return stderr.split(/\r?\n/).every(line => known.some(pattern => pattern.test(line)));
}

function killChildAndGroup(child: MetricOpenCliChild): void {
  try { child.killGroup?.('SIGKILL'); } catch { /* best-effort second kill follows */ }
  if (child.pid && child.pid > 0 && !child.killGroup && process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL'); } catch { /* process may already have exited */ }
  }
  try { child.kill('SIGKILL'); } catch { /* process may already have exited */ }
}

function messageFor(result: MetricOpenCliProcessResult): string {
  return outputText(result).trim() || `OpenCLI exited with code ${String(result.exitCode)}`;
}

/**
 * Runs one fixed, no-shell OpenCLI capture command. The runner only starts a
 * child and exposes its completion promise; this executor owns the timer and
 * kills the child and its process group when that timer expires.
 */
export async function executeMetricOpenCli(input: MetricOpenCliExecutorInput, dependencies: MetricOpenCliExecutorDependencies): Promise<MetricOpenCliResult> {
  const argv = argvFor(input);
  if (input.enabledEnv !== '1') return { ok: false, code: 'EXECUTOR_DISABLED', message: 'TDN_METRIC_OPENCLI_ENABLED is not exactly 1', argv };
  if (!isManifestDigest(input.expectedAdapterManifestSha256)) return { ok: false, code: 'MANIFEST_HASH_MISMATCH', message: 'expected adapter manifest digest is invalid', argv };
  let manifestBytes: Uint8Array;
  try { manifestBytes = await dependencies.readManifest(input.adapterManifestPath); } catch (error) {
    return { ok: false, code: 'MANIFEST_HASH_MISMATCH', message: `adapter manifest could not be read: ${error instanceof Error ? error.message : String(error)}`, argv };
  }
  if (sha256(manifestBytes) !== input.expectedAdapterManifestSha256) return { ok: false, code: 'MANIFEST_HASH_MISMATCH', message: 'adapter manifest digest does not match the pinned digest', argv };
  const timeoutMs = input.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) return { ok: false, code: 'TIMEOUT', message: 'executor timeout must be a positive integer', argv };

  let execution: MetricOpenCliProcessExecution;
  try {
    execution = await dependencies.runProcess(input.executable ?? 'opencli', argv, { shell: false, detached: true, env: input.env ?? {} });
    if (!execution?.child || !(execution.completion instanceof Promise)) throw new Error('process runner returned no child handle or completion promise');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = codeFromError(error) ?? (/ETIMEDOUT|timed out|timeout/i.test(message) ? 'TIMEOUT' : /BROWSER_CONNECT|bridge|daemon|ECONNREFUSED/i.test(message) ? 'BRIDGE_DISCONNECTED' : 'METRIC_UI_CHANGED');
    return { ok: false, code, message, argv };
  }

  let timer: NodeJS.Timeout | undefined;
  let timedOut = false;
  const timeout = new Promise<MetricOpenCliProcessResult>(resolve => {
    timer = setTimeout(() => {
      timedOut = true;
      killChildAndGroup(execution.child);
      resolve({ exitCode: null, stdout: '', stderr: 'executor timeout' });
    }, timeoutMs);
  });
  let result: MetricOpenCliProcessResult;
  try {
    result = await Promise.race([execution.completion, timeout]);
  } catch (error) {
    if (timer) clearTimeout(timer);
    const message = error instanceof Error ? error.message : String(error);
    const code = codeFromError(error) ?? (/BROWSER_CONNECT|bridge|daemon|ECONNREFUSED/i.test(message) ? 'BRIDGE_DISCONNECTED' : 'METRIC_UI_CHANGED');
    return { ok: false, code, message, argv };
  }
  if (timer) clearTimeout(timer);
  if (timedOut) return { ok: false, code: 'TIMEOUT', message: 'OpenCLI capture timed out; child and process group were killed', argv };

  const output = outputText(result);
  const mapped = codeInOutput(output);
  if (mapped) return { ok: false, code: mapped, message: output.trim() || mapped, argv };
  if (result.exitCode !== 0) return { ok: false, code: 'METRIC_UI_CHANGED', message: messageFor(result), argv };
  if (!isKnownBenignStderr(result.stderr) || !isAdapterResult(result.stdout)) return { ok: false, code: 'METRIC_UI_CHANGED', message: 'OpenCLI result was not exactly one READY adapter row with recognized stderr', argv };
  return { ok: true, stdout: result.stdout, stderr: result.stderr, argv };
}
