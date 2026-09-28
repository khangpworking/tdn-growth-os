import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

test('real packet CLI retains exact inputs, reuses only identical private bundles, and refuses overwrite after dependency changes or corruption', async () => {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-research-a3-'));
  const sha = (v: Buffer): string => createHash('sha256').update(v).digest('hex');
  try {
    const resultPath = path.join(temp, 'result.json'), catalogPath = path.join(root, 'docs/research/report-section-catalog-v1.json');
    const catalog = await fs.readFile(catalogPath), fixture = metricFixture();
    const initial = Buffer.from(canonicalJson(calculateMetricScopes(fixture)) + '\n');
    await fs.writeFile(resultPath, initial);
    const directory = path.join(temp, 'bundle');
    const run = (resultSha = sha(initial), output = directory) => spawnSync(process.execPath,
      ['--import', 'tsx', 'scripts/package-research-report.ts', resultPath, resultSha, catalogPath, sha(catalog), output],
      { cwd: root, encoding: 'utf8', timeout: 30_000 });
    const first = run(); assert.equal(first.status, 0, first.stderr);
    const firstReceipt = JSON.parse(first.stdout); assert.equal(firstReceipt.reused, false);
    const names = ['metric-result.json', 'section-catalog.json', 'packet.json', 'report.md'];
    const before = await Promise.all(names.map(name => fs.readFile(path.join(directory, name))));
    const stats = await Promise.all(names.map(name => fs.stat(path.join(directory, name))));
    assert.deepEqual(before[0], initial); assert.deepEqual(before[1], catalog);
    const retry = run(); assert.equal(retry.status, 0, retry.stderr);
    assert.equal(JSON.parse(retry.stdout).reused, true);
    for (const [i, name] of names.entries()) {
      assert.deepEqual(await fs.readFile(path.join(directory, name)), before[i]);
      assert.equal((await fs.stat(path.join(directory, name))).mtimeMs, stats[i]!.mtimeMs);
      if (process.platform !== 'win32') assert.equal(stats[i]!.mode & 0o777, 0o600);
    }
    if (process.platform !== 'win32') assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal(run(sha(initial), path.join(root, 'forbidden-a3-bundle')).status, 1);
    fixture.records[0]!.revenue.value = '200';
    const changed = Buffer.from(canonicalJson(calculateMetricScopes(fixture)) + '\n');
    await fs.writeFile(resultPath, changed);
    assert.equal(run().status, 1, 'stale expected digest must not be accepted');
    assert.equal(run(sha(changed)).status, 1, 'new content must not overwrite previous bundle');
    const second = run(sha(changed), path.join(temp, 'changed'));
    assert.equal(second.status, 0, second.stderr);
    assert.notEqual(JSON.parse(second.stdout).packetId, firstReceipt.packetId);
    assert.match(await fs.readFile(path.join(temp, 'changed', 'report.md'), 'utf8'), /285 VND/);
    for (const [i, name] of names.entries()) assert.deepEqual(await fs.readFile(path.join(directory, name)), before[i]);
    await fs.writeFile(resultPath, initial);
    await fs.writeFile(path.join(directory, 'packet.json'), 'corrupt');
    assert.equal(run().status, 1);
    assert.equal(await fs.readFile(path.join(directory, 'packet.json'), 'utf8'), 'corrupt');
    await fs.writeFile(path.join(directory, 'packet.json'), before[2]!);
    await fs.writeFile(path.join(directory, 'extra'), 'unrelated');
    assert.equal(run().status, 1);
    assert.equal(await fs.readFile(path.join(directory, 'extra'), 'utf8'), 'unrelated');
  } finally { await fs.rm(temp, { recursive: true, force: true }); }
});
