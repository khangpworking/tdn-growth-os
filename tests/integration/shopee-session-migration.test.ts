import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { AT } from '../fixtures/shopee-public-results.js';

for (const priorVersion of [0, 60]) test(`SHP migration 0061 applies from ${priorVersion} and preserves old run reads`, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-session-migration-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const databasePath = path.join(root, 'state.sqlite'), priorDirectory = path.join(root, 'migrations-60');
  const now = () => new Date(AT), artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const workspaceId = randomUUID();
  let before: unknown, oldReport: Buffer | undefined, runId: string | undefined;
  if (priorVersion === 60) {
    await fs.mkdir(priorDirectory);
    for (const name of (await fs.readdir('migrations')).filter(name => /^\d{4}_.*\.sql$/.test(name) && Number(name.slice(0, 4)) <= 60))
      await fs.copyFile(path.join('migrations', name), path.join(priorDirectory, name));
    const prior = openDatabase({ databasePath, migrationsDirectory: priorDirectory, now });
    assert.equal(prior.migration.currentVersion, 60);
    try {
      const discovery = new DiscoveryWorkspaceService({ db: prior.db, artifactStore: artifacts, now, uuid: () => workspaceId });
      await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-old-run', title: 'Synthetic old run' });
      const service = new ResearchAutomationService({ db: prior.db, artifactStore: artifacts, now,
        workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: syntheticProductSource() });
      const started = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
        mode: 'PRODUCT', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
      runId = started.run.runId;
      await service.processNext();
      await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
        expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic scope',
        includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] });
      for (let turn = 0; turn < 10 && await service.processNext(); turn++) { /* bounded offline drain */ }
      before = await service.getRun(workspaceId, runId);
      oldReport = Buffer.from((await service.readReport(workspaceId, runId, 'MARKET', false)).bytes);
    } finally { prior.db.close(); }
  }
  const upgraded = openDatabase({ databasePath, now });
  try {
    assert.equal(upgraded.migration.currentVersion, 61);
    assert.ok(upgraded.migration.applied.includes(61));
    if (priorVersion === 60) assert.deepEqual(upgraded.migration.applied, [61]);
    assert.deepEqual(upgraded.db.prepare('SELECT * FROM research_automation_shopee_sessions').all(), []);
    assert.deepEqual(upgraded.db.pragma('foreign_key_check'), []);
    if (runId) {
      const discovery = new DiscoveryWorkspaceService({ db: upgraded.db, artifactStore: artifacts, now });
      const service = new ResearchAutomationService({ db: upgraded.db, artifactStore: artifacts, now,
        workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: syntheticProductSource() });
      assert.deepEqual(await service.getRun(workspaceId, runId), before);
      assert.deepEqual(Buffer.from((await service.readReport(workspaceId, runId, 'MARKET', false)).bytes), oldReport);
    }
  } finally { upgraded.db.close(); }
  const replay = openDatabase({ databasePath, now });
  try { assert.deepEqual(replay.migration, { applied: [], currentVersion: 61 }); }
  finally { replay.db.close(); }
});
