import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { normalizeMetricWorkbook, MetricSourceRejection } from '../src/modules/analysis/metric-source-profile.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';
import { renderMetricScopeDraft } from '../src/modules/analysis/metric-scope-calculator.js';

const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
async function read(file: string): Promise<Buffer> {
  const handle = await fs.open(file, 'r');
  try {
    if (!(await handle.stat()).isFile()) throw new Error('Input must be a regular file');
    const bytes = Buffer.alloc(32 * 1024 * 1024 + 1);
    let size = 0;
    while (size < bytes.length) {
      const part = await handle.read(bytes, size, bytes.length - size);
      if (!part.bytesRead) break;
      size += part.bytesRead;
    }
    if (size === bytes.length) throw new Error('Input exceeds 32 MiB');
    return bytes.subarray(0, size);
  } finally { await handle.close(); }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 4) throw new Error('Usage: research:metric:normalize -- <workbook.xlsx> <manifest.json> <labels.json|-> <outside-git-bundle-directory>');
  const workbook = await read(args[0]!), manifest = await read(args[1]!);
  const labels = args[2] === '-' ? undefined : await read(args[2]!);
  let normalized: ReturnType<typeof normalizeMetricWorkbook>;
  try { normalized = normalizeMetricWorkbook(workbook, manifest, labels); }
  catch (error) {
    // No partial normalized result. The rejection report contains locators, not raw rows.
    console.error(JSON.stringify({ status: 'REJECTED', sourceSha256: sha(workbook), manifestSha256: sha(manifest),
      labelSha256: labels ? sha(labels) : null, locator: error instanceof MetricSourceRejection ? error.locator : 'normalized-input',
      code: error instanceof MetricSourceRejection ? error.code : 'NORMALIZED_CONTRACT_REJECTED' }));
    process.exitCode = 1;
    return;
  }
  const encode = (v: unknown): Buffer => Buffer.from(canonicalJson(v) + '\n');
  const files: readonly [string, Buffer][] = [
    ['normalized-input.json', encode(normalized.input)], ['receipt.json', encode(normalized.receipt)],
    ['result.json', encode(normalized.result)], ['report.md', Buffer.from(renderMetricScopeDraft(normalized.result))],
  ];
  const output = path.resolve(args[3]!), parent = await fs.realpath(path.dirname(output));
  for (let current = parent; ; current = path.dirname(current)) {
    try { await fs.lstat(path.join(current, '.git')); throw new Error('Output must be outside Git'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  const target = path.join(parent, path.basename(output));
  let created = false;
  const owned: string[] = [];
  try {
    try { await fs.mkdir(target, { mode: 0o700 }); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (!created) {
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o700)) throw new Error('Unsafe existing bundle');
      if ((await fs.readdir(target)).sort().join(',') !== files.map(([n]) => n).sort().join(',')) throw new Error('Incomplete or unexpected existing bundle');
      for (const [name, bytes] of files) {
        const file = path.join(target, name), info = await fs.lstat(file);
        if (!info.isFile() || info.isSymbolicLink() || info.size !== bytes.length ||
            (process.platform !== 'win32' && (info.mode & 0o777) !== 0o600) || !(await fs.readFile(file)).equals(bytes)) throw new Error('Bundle conflict; refusing overwrite');
      }
    } else {
      for (const [name, bytes] of files) {
        const file = path.join(target, name), handle = await fs.open(file, 'wx', 0o600);
        owned.push(file);
        try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
      }
    }
    console.log(JSON.stringify({ status: 'DRAFT', outputDirectory: target, inputSha256: normalized.result.inputSha256,
      sourceSha256: normalized.receipt.sourceSha256, reused: !created, databaseMutations: 0, aiCalls: 0 }));
  } catch (error) {
    if (created) {
      for (const file of owned) await fs.unlink(file).catch(() => undefined);
      await fs.rmdir(target).catch(() => undefined);
    }
    throw error;
  }
}
await main().catch(error => { console.error(error instanceof Error ? error.message : 'Normalization failed'); process.exitCode = 1; });
