import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { conditionalEconomicsFixture } from '../helpers/conditional-economics-fixture.js';
import { replayConditionalEconomics } from '../../src/modules/analysis/conditional-economics.js';

// The pure unit suite owns equations. This test owns only the real CLI's
// input/output wiring, private immutable publication and exact-byte retry.
test('conditional economics CLI publishes replayable scenario bytes without altering input or conflicting output', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-economics-cli-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const inputFile = path.join(root, 'scenario.json');
  const output = path.join(root, 'export');
  const scenario = conditionalEconomicsFixture();
  const original = Buffer.from(JSON.stringify(scenario, null, 2) + '\n');
  await fs.writeFile(inputFile, original, { mode: 0o600 });
  const invoke = () => spawnSync(process.execPath,
    ['--import', 'tsx', 'scripts/calculate-conditional-economics.ts', inputFile, output],
    { cwd: process.cwd(), encoding: 'utf8', timeout: 30_000 });
  const first = invoke();
  assert.equal(first.status, 0, first.stderr);
  assert.equal(JSON.parse(first.stdout).reused, false);
  assert.deepEqual(await fs.readFile(inputFile), original);
  assert.deepEqual(await fs.readFile(path.join(output, 'raw-input.json')), original);
  const input = JSON.parse(await fs.readFile(path.join(output, 'input.json'), 'utf8'));
  const result = JSON.parse(await fs.readFile(path.join(output, 'result.json'), 'utf8'));
  assert.deepEqual(replayConditionalEconomics(input, result), result);
  assert.equal(result.approvalState, 'UNREVIEWED');
  const manifest = JSON.parse(await fs.readFile(path.join(output, 'manifest.json'), 'utf8')) as {
    files: { name: string; byteSize: number; sha256: string }[];
  };
  for (const file of manifest.files) {
    const bytes = await fs.readFile(path.join(output, file.name));
    assert.equal(bytes.length, file.byteSize);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256);
  }
  const before = new Map<string, { bytes: Buffer; mtime: number }>();
  for (const name of await fs.readdir(output)) {
    const target = path.join(output, name), stat = await fs.stat(target);
    before.set(name, { bytes: await fs.readFile(target), mtime: stat.mtimeMs });
    if (process.platform !== 'win32') assert.equal(stat.mode & 0o777, 0o600);
  }
  if (process.platform !== 'win32') assert.equal((await fs.stat(output)).mode & 0o777, 0o700);
  const retry = invoke();
  assert.equal(retry.status, 0, retry.stderr);
  assert.equal(JSON.parse(retry.stdout).reused, true);
  scenario.inputs.pricePerUnit!.value = '160001';
  await fs.writeFile(inputFile, JSON.stringify(scenario), { mode: 0o600 });
  const conflict = invoke();
  assert.notEqual(conflict.status, 0);
  assert.match(conflict.stderr, /conflict|refusing overwrite/);
  for (const [name, saved] of before) {
    const target = path.join(output, name);
    assert.deepEqual(await fs.readFile(target), saved.bytes);
    assert.equal((await fs.stat(target)).mtimeMs, saved.mtime);
  }
});
