import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readRequest, sha256 } from './module-pick.js';
import { runMetricCapture } from '../src/modules/analysis/research-automation/metric-capture-runner.js';
import { buildCaptureSpec } from '../src/modules/analysis/research-automation/autorun-derive.js';
import { metricCapturePeriod, validateMetricV3CaptureSpec } from '../src/modules/analysis/research-automation/metric-v3-capture-spec.js';

const exec = promisify(execFile);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const inside = (parent: string, child: string) => {
  const r = relative(parent, child);
  return r === '' || (!r.startsWith(`..${sep}`) && r !== '..' && !isAbsolute(r));
};

async function main() {
  const args = process.argv.slice(2);
  const moduleIndex = args.indexOf('--module-run');
  const moduleRun = moduleIndex < 0 ? undefined : args[moduleIndex + 1];
  if (moduleIndex >= 0 && (!moduleRun || moduleIndex !== args.length - 2)) throw new Error('CAPTURE_ARGUMENTS_INVALID');
  const positional = moduleIndex < 0 ? args : args.slice(0, moduleIndex);
  const [specPath, outputArg, guardDb, executable = 'opencli'] = positional;
  if (!specPath || !outputArg || !guardDb || positional.length > 4) throw new Error('CAPTURE_ARGUMENTS_INVALID');
  const spec = buildCaptureSpec(validateMetricV3CaptureSpec(JSON.parse(await readFile(specPath, 'utf8'))));
  const outputDir = resolve(outputArg);
  let moduleEvidence: { runId: string; requestSha256: string } | undefined;
  if (moduleRun) {
    const run = resolve(moduleRun), request = await readRequest(run);
    if (!request.selectionPolicy || spec.contractVersion !== 'metric-v3-capture-spec-v3' ||
        JSON.stringify(spec) !== JSON.stringify(request.captureSpec) || outputDir !== join(run, 'm1') ||
        resolve(specPath) !== join(run, 'capture-spec.json')) throw new Error('CAPTURE_MODULE_BINDING_INVALID');
    moduleEvidence = { runId: basename(run), requestSha256: sha256(await readFile(join(run, 'request.json'))) };
  }
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
    const result = await runMetricCapture({ enabledEnv: '1', captureRoot: actualOutput, opencliExecutable: executable,
      ...(moduleEvidence ? { evidence: true, moduleEvidence } : {}) }, {
      runId: randomUUID(), keyword: spec.preset.keywords[0],
      requestedPeriod: metricCapturePeriod(spec), metricV3Preset: spec, signal: controller.signal,
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
