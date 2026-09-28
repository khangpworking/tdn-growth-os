import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { publishPrivateReportBundle } from '../../src/platform/artifacts/private-report-bundle.js';

// Test-authoring gate: this boundary owns private flat-bundle publication.
// The lifecycle assertion protects exact bytes, owner-only modes, exact retry
// reuse and no-write behavior; the table independently exercises each safety
// rejection. Existing CLI tests do not call this publisher directly.
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) {
    assert.equal(path.dirname(root), os.tmpdir());
    assert.match(path.basename(root), /^tdn-private-bundle-/);
    await fs.rm(root, { recursive: true, force: true });
  }
});

const bundleFiles = (): ReadonlyMap<string, Buffer> => new Map([
  ['report.html', Buffer.from('<h1>synthetic report</h1>\n', 'utf8')],
  ['chart-data.json', Buffer.from('{"value":"9007199254740993"}\n', 'utf8')],
]);

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-bundle-'));
  roots.push(root);
  return root;
}

async function seedDirectory(directory: string, files: ReadonlyMap<string, Buffer>): Promise<void> {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  for (const [name, bytes] of files) await fs.writeFile(path.join(directory, name), bytes, { mode: 0o600 });
}

function withFile(files: ReadonlyMap<string, Buffer>, name: string, bytes: Buffer): ReadonlyMap<string, Buffer> {
  const copy = new Map(files);
  copy.set(name, bytes);
  return copy;
}

test('publishes exact private bytes, reuses exact bundle without writes, and rejects unsafe lifecycle states', async () => {
  const root = await tempRoot();
  const output = path.join(root, 'bundle');
  const files = bundleFiles();
  const first = await publishPrivateReportBundle(output, files);
  assert.equal(first.directory, output);
  assert.equal(first.reused, false);
  assert.deepEqual((await fs.readdir(output)).sort(), ['chart-data.json', 'report.html']);
  assert.deepEqual(await fs.readFile(path.join(output, 'report.html')), Buffer.from('<h1>synthetic report</h1>\n', 'utf8'));
  assert.deepEqual(await fs.readFile(path.join(output, 'chart-data.json')), Buffer.from('{"value":"9007199254740993"}\n', 'utf8'));
  if (process.platform !== 'win32') {
    assert.equal((await fs.stat(output)).mode & 0o777, 0o700);
    for (const name of files.keys()) assert.equal((await fs.stat(path.join(output, name))).mode & 0o777, 0o600);
  }
  const beforeDirectory = await fs.stat(output, { bigint: true });
  const beforeFiles = new Map<string, bigint>();
  for (const name of files.keys()) beforeFiles.set(name, (await fs.stat(path.join(output, name), { bigint: true })).mtimeNs);

  const second = await publishPrivateReportBundle(output, files);
  assert.equal(second.directory, output);
  assert.equal(second.reused, true);
  assert.equal((await fs.stat(output, { bigint: true })).mtimeNs, beforeDirectory.mtimeNs);
  for (const [name, bytes] of files) {
    assert.equal((await fs.stat(path.join(output, name), { bigint: true })).mtimeNs, beforeFiles.get(name));
    assert.deepEqual(await fs.readFile(path.join(output, name)), bytes);
  }

  const cases: Array<{
    name: string;
    files: ReadonlyMap<string, Buffer>;
    expected: RegExp;
    prepare: (caseRoot: string) => Promise<string>;
  }> = [
    {
      name: 'empty-input', files: new Map(), expected: /Cannot publish an empty report/,
      prepare: async caseRoot => path.join(caseRoot, 'bundle'),
    },
    {
      name: 'unsafe-member', files: new Map([['../escape.txt', Buffer.from('escape')]]), expected: /Unsafe report filename/,
      prepare: async caseRoot => path.join(caseRoot, 'bundle'),
    },
    {
      name: 'incomplete-membership', files, expected: /Incomplete or unexpected report bundle/,
      prepare: async caseRoot => {
        const directory = path.join(caseRoot, 'bundle');
        await seedDirectory(directory, new Map([['report.html', files.get('report.html')!]]));
        return directory;
      },
    },
    {
      name: 'extra-membership', files, expected: /Incomplete or unexpected report bundle/,
      prepare: async caseRoot => {
        const directory = path.join(caseRoot, 'bundle');
        await seedDirectory(directory, withFile(files, 'extra.txt', Buffer.from('extra')));
        return directory;
      },
    },
    {
      name: 'changed-bytes', files, expected: /Report bundle conflict/,
      prepare: async caseRoot => {
        const directory = path.join(caseRoot, 'bundle');
        await seedDirectory(directory, withFile(files, 'chart-data.json', Buffer.from('{"value":"changed"}\n')));
        return directory;
      },
    },
  ];
  if (process.platform !== 'win32') {
    cases.push({
      name: 'symlink-output', files, expected: /Unsafe existing report bundle/,
      prepare: async caseRoot => {
        const target = path.join(caseRoot, 'real-bundle');
        await seedDirectory(target, files);
        const link = path.join(caseRoot, 'bundle');
        await fs.symlink(target, link, 'dir');
        return link;
      },
    });
    cases.push({
      name: 'symlink-member', files, expected: /Report bundle conflict/,
      prepare: async caseRoot => {
        const directory = path.join(caseRoot, 'bundle');
        await fs.mkdir(directory, { recursive: true, mode: 0o700 });
        const target = path.join(caseRoot, 'outside.html');
        await fs.writeFile(target, files.get('report.html')!);
        await fs.symlink(target, path.join(directory, 'report.html'));
        await fs.writeFile(path.join(directory, 'chart-data.json'), files.get('chart-data.json')!, { mode: 0o600 });
        return directory;
      },
    });
    cases.push({
      name: 'git-ancestry', files, expected: /Report output must be outside Git/,
      prepare: async caseRoot => {
        const gitRoot = path.join(caseRoot, 'repository');
        await fs.mkdir(path.join(gitRoot, 'reports'), { recursive: true });
        await fs.writeFile(path.join(gitRoot, '.git'), 'gitdir: synthetic');
        return path.join(gitRoot, 'reports', 'bundle');
      },
    });
  }

  for (const failure of cases) {
    const caseRoot = path.join(root, failure.name);
    await fs.mkdir(caseRoot, { recursive: true });
    const target = await failure.prepare(caseRoot);
    await assert.rejects(() => publishPrivateReportBundle(target, failure.files), failure.expected, failure.name);
  }
});
