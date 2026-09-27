import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';

test('actual offline CLI saves a private deterministic bundle, reuses exact content and refuses changed/corrupt output', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-a1-'));
  try {
    const inputPath = path.join(temp, 'input.json'), bundle = path.join(temp, 'bundle');
    const fixture = metricFixture();
    await fs.writeFile(inputPath, JSON.stringify(fixture));
    const run = (output = bundle) => spawnSync(process.execPath, ['--import', 'tsx', 'scripts/calculate-metric-scope.ts', inputPath, output], { cwd: root, encoding: 'utf8' });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    assert.equal(JSON.parse(first.stdout).reused, false);
    const files = ['result.json', 'report.md'];
    const before = await Promise.all(files.map(f => fs.readFile(path.join(bundle, f))));
    const stats = await Promise.all(files.map(f => fs.stat(path.join(bundle, f))));
    const second = run(); assert.equal(second.status, 0, second.stderr);
    assert.equal(JSON.parse(second.stdout).reused, true);
    for (const [i, f] of files.entries()) {
      assert.deepEqual(await fs.readFile(path.join(bundle, f)), before[i]);
      assert.equal((await fs.stat(path.join(bundle, f))).mtimeMs, stats[i]!.mtimeMs);
      if (process.platform !== 'win32') assert.equal(stats[i]!.mode & 0o777, 0o600);
    }
    if (process.platform !== 'win32') assert.equal((await fs.stat(bundle)).mode & 0o777, 0o700);
    assert.equal(run(path.join(root, 'forbidden-a1-bundle')).status, 1);
    fixture.records[0]!.revenue.value = '200';
    await fs.writeFile(inputPath, JSON.stringify(fixture));
    const changed = run(); assert.equal(changed.status, 1); assert.match(changed.stderr, /conflict/);
    const different = run(path.join(temp, 'second-bundle')); assert.equal(different.status, 0, different.stderr);
    assert.match(await fs.readFile(path.join(temp, 'second-bundle', 'report.md'), 'utf8'), /285 VND/);
    await fs.writeFile(path.join(bundle, 'report.md'), 'corrupt');
    await fs.writeFile(inputPath, JSON.stringify(metricFixture()));
    assert.equal(run().status, 1);
    assert.equal(await fs.readFile(path.join(bundle, 'report.md'), 'utf8'), 'corrupt');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
