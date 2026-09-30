import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import {
  m03SectionRetentionFixture,
  seedSyntheticPreparation,
  writeM03SectionRetentionInputs,
} from '../fixtures/m03-section-retention-synthetic.js';

// Distinct owner for the real CLI/database/filesystem boundary. Service replay
// and exact-byte conflict behavior stay in the A37 ledger integration owner.
test('A37 CLI retains one explicit M03 chain, rejects a wrong digest without partial writes, and reuses exact bytes', async () => {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'tdn-section-retention-cli-'));
  try {
    const fixture = m03SectionRetentionFixture();
    const databasePath = path.join(directory, 'retention.sqlite');
    const artifactRoot = path.join(directory, 'artifacts');
    await fsp.mkdir(artifactRoot, { mode: 0o700 });
    const opened = openDatabase({ databasePath });
    seedSyntheticPreparation(opened.db, fixture);
    const baselineManifests = count(opened.db, 'artifact_manifests');
    opened.db.close();
    const inputs = await writeM03SectionRetentionInputs(directory, fixture);
    const args = [
      databasePath, artifactRoot,
      inputs.metricSet, fixture.request.metricSetSha256,
      inputs.chartBundle, fixture.request.chartBundleSha256,
      inputs.envelope, fixture.request.envelopeSha256,
      inputs.narrative, fixture.request.narrativeSha256,
      inputs.receipt, fixture.request.sectionArtifactSha256,
      inputs.html, fixture.request.htmlSha256,
    ];
    const run = (override = args) => spawnSync(process.execPath, [
      '--import', 'tsx', 'scripts/retain-m03-section-artifact.ts', ...override,
    ], { cwd: path.resolve('.'), encoding: 'utf8' });

    const wrong = run([...args.slice(0, -1), '0'.repeat(64)]);
    assert.notEqual(wrong.status, 0);
    assert.match(wrong.stderr, /HTML identity/i);
    const afterWrong = openDatabase({ databasePath });
    assert.equal(count(afterWrong.db, 'analysis_section_artifacts'), 0n);
    assert.equal(count(afterWrong.db, 'analysis_section_artifact_members'), 0n);
    assert.equal(count(afterWrong.db, 'artifact_manifests'), baselineManifests);
    afterWrong.db.close();
    assert.deepEqual(await fsp.readdir(artifactRoot), []);

    const created = run();
    assert.equal(created.status, 0, created.stderr);
    const receipt = JSON.parse(created.stdout) as Record<string, unknown>;
    assert.equal(receipt.sectionArtifactSha256, fixture.request.sectionArtifactSha256);
    assert.equal(receipt.deduplicated, false);
    assert.equal(receipt.aiCalls, 0);
    assert.equal(receipt.providerCalls, 0);

    const retry = run();
    assert.equal(retry.status, 0, retry.stderr);
    assert.equal((JSON.parse(retry.stdout) as Record<string, unknown>).deduplicated, true);

    const verified = openDatabase({ databasePath });
    assert.equal(count(verified.db, 'analysis_section_artifacts'), 1n);
    assert.equal(count(verified.db, 'analysis_section_artifact_members'), 6n);
    verified.db.close();
    if (process.platform !== 'win32') {
      assert.equal((await fsp.stat(databasePath)).mode & 0o777, 0o600);
      const files = await artifactFiles(artifactRoot);
      assert.equal(files.length, 6);
      for (const file of files) assert.equal((await fsp.stat(file)).mode & 0o777, 0o600);
    }
  } finally {
    await fsp.rm(directory, { recursive: true, force: true });
  }
});

function count(db: ReturnType<typeof openDatabase>['db'], table: string): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}

async function artifactFiles(root: string): Promise<string[]> {
  const first = await fsp.readdir(path.join(root, 'sha256'), { withFileTypes: true });
  const files: string[] = [];
  for (const directory of first) {
    if (!directory.isDirectory()) continue;
    for (const name of await fsp.readdir(path.join(root, 'sha256', directory.name))) {
      files.push(path.join(root, 'sha256', directory.name, name));
    }
  }
  return files;
}
