import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { m03SectionArtifactChainFixture } from '../fixtures/m03-section-artifact-synthetic.js';

// Distinct owner for the filesystem/CLI boundary; renderer semantics stay in
// the unit owner and upstream A32-A35 tests.
test('M03 section CLI writes one owner-only exact artifact outside Git and refuses drift or overwrite', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-m03-section-'));
  try {
    const chain = m03SectionArtifactChainFixture();
    const inputs = await Promise.all([
      writeJson(directory, 'metric.json', chain.metricSet),
      writeJson(directory, 'charts.json', chain.chartBundle),
      writeJson(directory, 'evidence.json', chain.envelope),
      writeJson(directory, 'narrative.json', chain.narrative),
    ]);
    const output = path.join(directory, 'm03.html');
    const args = [
      inputs[0]!, chain.metricSet.metricSetSha256,
      inputs[1]!, chain.chartBundle.chartBundleSha256,
      inputs[2]!, chain.envelope.envelopeSha256,
      inputs[3]!, chain.narrative.narrativeSha256,
      output,
    ];
    const run = (override = args) => spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/render-m03-section-artifact.ts', ...override,
    ], { cwd: path.resolve('.'), encoding: 'utf8' });

    const created = run();
    assert.equal(created.status, 0, created.stderr);
    const receipt = JSON.parse(created.stdout) as Record<string, unknown>;
    assert.equal(receipt.aiCalls, 0);
    assert.equal(receipt.providerCalls, 0);
    assert.equal(receipt.narrativeSha256, chain.narrative.narrativeSha256);
    assert.match(await fs.readFile(output, 'utf8'), /M03 · Quy mô và diễn biến/);
    if (process.platform !== 'win32') assert.equal((await fs.stat(output)).mode & 0o777, 0o600);

    const second = run();
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /exist|EEXIST/i);

    const driftOutput = path.join(directory, 'drift.html');
    const drifted = run([...args.slice(0, 1), '0'.repeat(64), ...args.slice(2, -1), driftOutput]);
    assert.notEqual(drifted.status, 0);
    assert.match(drifted.stderr, /digests do not match/);
    await assert.rejects(fs.stat(driftOutput), /ENOENT/);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

async function writeJson(directory: string, name: string, value: unknown): Promise<string> {
  const target = path.join(directory, name);
  await fs.writeFile(target, JSON.stringify(value), { mode: 0o600 });
  return target;
}
