import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { runMetricCapture } from '../src/modules/analysis/research-automation/metric-capture-runner.js';
import { buildCaptureSpec } from '../src/modules/analysis/research-automation/autorun-derive.js';
import { validateMetricV3CaptureSpec } from '../src/modules/analysis/research-automation/metric-v3-capture-spec.js';

const exec = promisify(execFile);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const inside = (parent: string, child: string) => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r));
};

async function main() {
  const [specPath, outputArg, guardDb, executable = 'opencli'] = process.argv.slice(2);
  if (!specPath || !outputArg || !guardDb || process.argv.length > 6) throw new Error('CAPTURE_ARGUMENTS_INVALID');
  const spec = buildCaptureSpec(validateMetricV3CaptureSpec(JSON.parse(await readFile(specPath, 'utf8'))));
  const outputDir = resolve(outputArg);
  const parent = await realpath(dirname(outputDir));
  const actualOutput = join(parent, basename(outputDir));
  const repo = fileURLToPath(new URL('..', import.meta.url));
  if (
    !isAbsolute(outputArg) ||
    [repo, join(homedir(), '.local/state/tdn-growth-os'), join(homedir(), '.local/share/tdn-growth-os')].some((p) =>
      inside(p, actualOutput),
    )
  ) {
    throw new Error('CAPTURE_OUTPUT_FORBIDDEN');
  }
  // Python opens an existing file read-only. No migrations, PRAGMAs that write, or app requests.
  const query =
    'import sqlite3,sys,pathlib; c=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+"?mode=ro",uri=True); print(c.execute("SELECT count(*) FROM research_automation_autorun WHERE phase=\'CAPTURE\' AND phase_state=\'RUNNING\'").fetchone()[0]); c.close()';
  while (true) {
    const { stdout } = await exec('python3', ['-c', query, guardDb]);
    if (stdout.trim() === '0') break;
    if (!/^\d+$/.test(stdout.trim())) throw new Error('CAPTURE_GUARD_UNAVAILABLE');
    process.stderr.write('Waiting for active capture to finish.\n');
    await sleep(5000);
  }
  await mkdir(actualOutput, { mode: 0o700 }); // Existing output is never overwritten.
  await writeFile(join(actualOutput, 'spec.json'), `${JSON.stringify(spec, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const result = await runMetricCapture({ enabledEnv: '1', captureRoot: actualOutput, opencliExecutable: executable }, {
      runId: randomUUID(), keyword: spec.preset.keywords[0],
      requestedPeriod: spec.windows[1].period, metricV3Preset: spec, signal: controller.signal,
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!result.ok) throw new Error(result.code);
  } finally {
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error && /^CAPTURE_[A-Z_]+$/.test(error.message) ? error.message : 'CAPTURE_FAILED';
  if (message === 'CAPTURE_LOGIN_REQUIRED')
    process.stderr.write('DECISION NEEDED: The owner must log in before capture can continue.\n');
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
