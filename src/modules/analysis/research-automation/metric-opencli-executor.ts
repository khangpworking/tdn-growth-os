import { createHash } from 'node:crypto';

export const METRIC_OPENCLI_ARGV = Object.freeze([
  'metric', 'capture', '--spec', '__SPEC__', '--out', '__OUT__', '--export', 'true', '--pdf', 'true', '--max-rows', '5000', '-f', 'json',
] as const);

export type MetricOpenCliCode =
  | 'METRIC_LOGIN_REQUIRED'
  | 'METRIC_CAPTCHA'
  | 'METRIC_UI_CHANGED'
  | 'METRIC_FILTER_MISMATCH'
  | 'METRIC_ROW_CAP'
  | 'BRIDGE_DISCONNECTED'
  | 'EXECUTOR_DISABLED'
  | 'TIMEOUT'
  | 'MANIFEST_HASH_MISMATCH';

export interface MetricOpenCliProcessResult {
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut?: boolean;
}

export interface MetricOpenCliProcessOptions {
  readonly shell: false;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string | undefined>>;
}

export type MetricOpenCliProcessRunner = (
  executable: string,
  argv: readonly string[],
  options: MetricOpenCliProcessOptions,
) => Promise<MetricOpenCliProcessResult>;

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
  'METRIC_LOGIN_REQUIRED', 'METRIC_CAPTCHA', 'METRIC_UI_CHANGED', 'METRIC_FILTER_MISMATCH', 'METRIC_ROW_CAP',
] as const;

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function isManifestDigest(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

function argvFor(input: MetricOpenCliExecutorInput): readonly string[] {
  return METRIC_OPENCLI_ARGV.map(arg => arg === '__SPEC__' ? input.specPath : arg === '__OUT__' ? input.outputDir : arg);
}

function outputText(result: Pick<MetricOpenCliProcessResult, 'stdout' | 'stderr'>): string {
  return `${result.stdout}\n${result.stderr}`;
}

function codeInOutput(output: string): MetricOpenCliCode | undefined {
  for (const code of FAIL_CLOSED_CODES) if (output.includes(code)) return code;
  if (/BROWSER_CONNECT|BRIDGE_DISCONNECTED|extension.*connect|daemon.*(offline|not running)|ECONNREFUSED/i.test(output)) return 'BRIDGE_DISCONNECTED';
  if (/ETIMEDOUT|timed out|timeout/i.test(output)) return 'TIMEOUT';
  return undefined;
}

function codeFromError(error: unknown): MetricOpenCliCode | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string' && (
      FAIL_CLOSED_CODES.includes(code as (typeof FAIL_CLOSED_CODES)[number])
      || code === 'BRIDGE_DISCONNECTED'
      || code === 'TIMEOUT'
    )) return code as MetricOpenCliCode;
  }
  return undefined;
}

/**
 * Runs the fixed, no-shell OpenCLI capture command. All environment and I/O
 * are injected so this module can be tested without OpenCLI or Metric.
 */
export async function executeMetricOpenCli(
  input: MetricOpenCliExecutorInput,
  dependencies: MetricOpenCliExecutorDependencies,
): Promise<MetricOpenCliResult> {
  const argv = argvFor(input);
  if (input.enabledEnv !== '1') {
    return { ok: false, code: 'EXECUTOR_DISABLED', message: 'TDN_METRIC_OPENCLI_ENABLED is not exactly 1', argv };
  }
  if (!isManifestDigest(input.expectedAdapterManifestSha256)) {
    return { ok: false, code: 'MANIFEST_HASH_MISMATCH', message: 'expected adapter manifest digest is invalid', argv };
  }
  let manifestBytes: Uint8Array;
  try {
    manifestBytes = await dependencies.readManifest(input.adapterManifestPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, code: 'MANIFEST_HASH_MISMATCH', message: `adapter manifest could not be read: ${message}`, argv };
  }
  const actualDigest = sha256(manifestBytes);
  if (actualDigest !== input.expectedAdapterManifestSha256) {
    return { ok: false, code: 'MANIFEST_HASH_MISMATCH', message: 'adapter manifest digest does not match the pinned digest', argv };
  }
  const timeoutMs = input.timeoutMs ?? 120_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) {
    return { ok: false, code: 'TIMEOUT', message: 'executor timeout must be a positive integer', argv };
  }
  let result: MetricOpenCliProcessResult;
  try {
    result = await dependencies.runProcess(input.executable ?? 'opencli', argv, {
      shell: false,
      timeoutMs,
      env: input.env ?? {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = codeFromError(error) ?? (/ETIMEDOUT|timed out|timeout/i.test(message) ? 'TIMEOUT'
      : /BROWSER_CONNECT|bridge|daemon|ECONNREFUSED/i.test(message) ? 'BRIDGE_DISCONNECTED'
        : 'METRIC_UI_CHANGED');
    return { ok: false, code, message, argv };
  }
  if (result.timedOut === true) return { ok: false, code: 'TIMEOUT', message: 'OpenCLI capture timed out', argv };
  const output = outputText(result);
  const mapped = codeInOutput(output);
  if (mapped) return { ok: false, code: mapped, message: output.trim() || mapped, argv };
  if (result.exitCode !== 0) return { ok: false, code: 'METRIC_UI_CHANGED', message: output.trim() || `OpenCLI exited with code ${String(result.exitCode)}`, argv };
  return { ok: true, stdout: result.stdout, stderr: result.stderr, argv };
}
