import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readFile, realpath, writeFile } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { homedir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
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
  const session = `m3-${randomUUID()}`;
  const command = async (args: string[]) => {
    const { stdout } = await exec(executable, ['browser', session, ...args], {
      env: { ...process.env, CI: '1' },
      maxBuffer: 32 * 1024 * 1024,
      timeout: 60_000,
    });
    return JSON.parse(stdout) as unknown;
  };
  let tab: string | undefined;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
  };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  try {
    const opened = (await command(['tab', 'new', 'https://metric.vn/analytics'])) as { page?: unknown };
    if (typeof opened.page !== 'string' || !/^[A-Fa-f0-9]+$/.test(opened.page))
      throw new Error('CAPTURE_TAB_UNAVAILABLE');
    tab = opened.page;
    await writeFile(join(actualOutput, 'session.json'), `${JSON.stringify({ session, tab })}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    const moduleUrl = new URL('../tools/opencli-metric/clis/metric/v3-capture.js', import.meta.url);
    const { captureV3Preset } = await import(moduleUrl.href);
    const page = {
      evaluate: async (fn: (...args: never[]) => unknown, arg?: unknown) => {
        if (interrupted) throw new Error('CAPTURE_INTERRUPTED');
        const js = `(${fn.toString()})(${arg === undefined ? '' : JSON.stringify(arg)})`;
        return command(['eval', '--tab', tab!, js]);
      },
      wait: sleep,
    };
    // Initial navigation may still be loading. This wait does not retry login or a restriction.
    for (let i = 0; i < 30; i++) {
      const status = await page.evaluate(() => ({ ready: document.readyState !== 'loading' }));
      if ((status as { ready: boolean }).ready) break;
      await sleep(500);
    }
    const result = await captureV3Preset(page, spec, actualOutput, (message: string) =>
      process.stderr.write(`${message}\n`),
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    const code = error instanceof Error && /^CAPTURE_[A-Z_]+$/.test(error.message) ? error.message : 'CAPTURE_FAILED';
    const details = error instanceof Error && 'details' in error ? error.details : undefined;
    await writeFile(join(actualOutput, 'stopped.json'), `${JSON.stringify({ code, details })}\n`, {
      flag: 'wx',
      mode: 0o600,
    });
    throw error;
  } finally {
    try {
      if (tab) await command(['tab', 'close', tab]);
    } finally {
      process.off('SIGINT', interrupt);
      process.off('SIGTERM', interrupt);
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error && /^CAPTURE_[A-Z_]+$/.test(error.message) ? error.message : 'CAPTURE_FAILED';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
