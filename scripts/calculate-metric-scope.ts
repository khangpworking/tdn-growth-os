import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { calculateMetricScopes, renderMetricScopeDraft } from '../src/modules/analysis/metric-scope-calculator.js';
import { canonicalJson } from '../src/modules/foundation/canonical-json.js';

// Offline A1: no database, provider, dynamic method loading or implicit latest source.
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.length !== 2) throw new Error('Usage: npm run research:metric:calculate -- <normalized-input.json> <outside-git-bundle-directory>');
  const inputPath = path.resolve(args[0]!);
  const inputFile = await fs.open(inputPath, 'r');
  let raw: Buffer;
  try {
    if (!(await inputFile.stat()).isFile()) throw new Error('Input must be a regular file');
    // Bound the actual read as well as the metadata; never trust stat alone.
    const buffer = Buffer.alloc(32 * 1024 * 1024 + 1);
    let length = 0;
    while (length < buffer.length) {
      const read = await inputFile.read(buffer, length, buffer.length - length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length === buffer.length) throw new Error('Normalized input exceeds 32 MiB');
    raw = buffer.subarray(0, length);
  } finally { await inputFile.close(); }
  const result = calculateMetricScopes(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw)));
  const payload = Buffer.from(canonicalJson(result) + '\n');
  const report = Buffer.from(renderMetricScopeDraft(result));
  const target = path.resolve(args[1]!);
  const parent = await fs.realpath(path.dirname(target));
  // Refuse any existing Git ancestor, including other checkouts and worktree .git files.
  for (let current = parent; ; current = path.dirname(current)) {
    try { await fs.lstat(path.join(current, '.git')); throw new Error('Output must be outside Git'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (path.dirname(current) === current) break;
  }
  const directory = path.join(parent, path.basename(target));
  let created = false;
  const ownedFiles: string[] = [];
  const files: readonly [string, Buffer][] = [['result.json', payload], ['report.md', report]];
  try {
    try { await fs.mkdir(directory, { mode: 0o700 }); created = true; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    if (!created) {
      const stat = await fs.lstat(directory);
      if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Existing output is not a regular bundle directory');
      if (process.platform !== 'win32' && (stat.mode & 0o777) !== 0o700) throw new Error('Existing bundle directory must be owner-only');
      const names = (await fs.readdir(directory)).sort();
      if (names.join(',') !== 'report.md,result.json') throw new Error('Incomplete or unexpected existing bundle; refusing overwrite');
      for (const [name, bytes] of files) {
        const existing = path.join(directory, name);
        const info = await fs.lstat(existing);
        if (!info.isFile() || info.isSymbolicLink() || info.size !== bytes.length || !(await fs.readFile(existing)).equals(bytes)) throw new Error('Bundle identity/content conflict; refusing overwrite');
        if (process.platform !== 'win32' && (info.mode & 0o777) !== 0o600) throw new Error('Existing bundle files must be owner-only');
      }
    } else {
      for (const [name, bytes] of files) {
        const file = path.join(directory, name);
        const handle = await fs.open(file, 'wx', 0o600);
        ownedFiles.push(file);
        try { await handle.writeFile(bytes); await handle.sync(); }
        finally { await handle.close(); }
      }
    }
    console.log(JSON.stringify({ outputDirectory: directory, inputSha256: result.inputSha256,
      resultSha256: createHash('sha256').update(payload).digest('hex'), reportSha256: createHash('sha256').update(report).digest('hex'),
      reused: !created, aiCalls: 0, databaseMutations: 0, status: 'DRAFT' }));
  } catch (error) {
    if (created) {
      for (const file of ownedFiles) await fs.unlink(file).catch(() => undefined);
      await fs.rmdir(directory).catch(() => undefined);
    }
    throw error;
  }
}

await main().catch(error => { console.error(error instanceof Error ? error.message : 'Metric calculation failed'); process.exitCode = 1; });
