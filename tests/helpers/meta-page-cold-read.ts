import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
const [databasePath, artifactRoot, workspaceId, runId, packageId] = process.argv.slice(2);
assert.ok(databasePath && artifactRoot && workspaceId && runId && packageId);
const db = new BetterSqlite3(databasePath, { readonly: true, fileMustExist: true }); db.pragma('query_only = ON'); db.defaultSafeIntegers(true);
const poison = (): never => { throw new Error('Cold retained read attempted a write/current runtime call'); };
const artifacts = new ContentAddressedArtifactStore(artifactRoot); artifacts.put = async () => poison();
const tables = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all();
const service = new ResearchAutomationService({ db, artifactStore: artifacts, now: poison, workspaceReader: { readVerifiedWorkspace: async () => poison() },
  sourceEvidence: { modelIdentity: 'changed-current-configuration', promptVersion: 'changed-current-v2', transport: { draftLists: async () => poison() } } });
const before = db.prepare('SELECT total_changes() n').get();
try {
  const view = await service.readMetaPageSource(workspaceId, runId, packageId);
  const history = await service.listMetaPageSources(workspaceId, runId);
  assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before);
  assert.deepEqual(db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").all(), tables);
  process.stdout.write(JSON.stringify({ viewSha256: createHash('sha256').update(JSON.stringify(view)).digest('hex'), historySha256: createHash('sha256').update(JSON.stringify(history)).digest('hex'),
    totalChanges: 0, casPuts: 0, clockCalls: 0, workspaceCalls: 0, modelCalls: 0, queryOnly: true }) + '\n');
} finally { db.close(); }
