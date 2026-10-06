import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import test from 'node:test';

import BetterSqlite3 from 'better-sqlite3';
import sourceStatusSchema from '../../contracts/api/research-automation-source-status-api.schema.json' with { type: 'json' };
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import type { ResearchAutomationProviderConfig } from '../../src/modules/analysis/research-automation/providers.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/discovery-workspace-service.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { openDatabase } from '../../src/platform/db/database.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '99999999-9999-4999-8999-999999999999';
const ownerToken = 'owner-token-1234567890-abcdefghijklmnopqrstuvwxyz';
const kalodataSecret = 'synthetic-kalodata-secret-value-0001';
const serpApiSecret = 'synthetic-serpapi-secret-value-0002';
const apifySecret = 'synthetic-apify-secret-value-0003';
const roots: string[] = [];

const validateStatus = (() => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  ajv.addSchema(sourceStatusSchema);
  return ajv.getSchema(`${sourceStatusSchema.$id}#/$defs/status`)!;
})();

test.afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

async function createFixture(): Promise<{ databasePath: string; artifactRoot: string }> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'research-source-status-'));
  roots.push(root);
  const databasePath = path.join(root, 'research.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  await new DiscoveryWorkspaceService({
    db, artifactStore: new ContentAddressedArtifactStore(artifactRoot),
    uuid: () => workspaceId, now: () => new Date('2026-01-31T00:00:00.000Z'),
  }).createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'research-source-status-test', title: 'Source status test workspace' });
  db.close();
  return { databasePath, artifactRoot };
}

// Settled synthetic history only: the board reads stored rows, so lineage artifacts are not needed here.
function seedHistory(databasePath: string): void {
  const db = new BetterSqlite3(databasePath);
  try {
    db.pragma('foreign_keys = OFF');
    const run = db.prepare(`INSERT INTO analysis_research_automation_runs(run_id,workspace_id,revision,status,mode,keyword,period_start,period_end,reports,
      start_request_sha256,actor_id,created_at,updated_at) VALUES (?,?,1,'DRAFT_READY','CATEGORY','synthetic','2026-01-01','2026-01-30','MARKET',?,'owner:research',?,?)`);
    const capture = db.prepare(`INSERT INTO analysis_research_automation_captures(run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,truncated,retained_at)
      VALUES (?,'COLLECTION',?,?,'application/json',?,'synthetic.read',?,0,?)`);
    const usage = db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,recorded_at)
      VALUES (?,'COLLECTION',?,?,'synthetic.read',1,'UNKNOWN',?)`);
    const own = '22222222-2222-4222-8222-222222222222'; const other = '33333333-3333-4333-8333-333333333333';
    const sha = 'a'.repeat(64);
    run.run(own, workspaceId, sha, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    run.run(other, otherWorkspaceId, sha, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    capture.run(own, 0, sha, 'kalodata', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    capture.run(own, 1, sha, 'kalodata', '2026-02-03T00:00:00.000Z', '2026-02-03T00:00:00.000Z');
    capture.run(own, 2, sha, 'apify-shopee', '2026-02-02T00:00:00.000Z', '2026-02-02T00:00:00.000Z');
    usage.run(own, 0, 'kalodata', '2026-02-03T00:00:01.000Z');
    // Another workspace's later history must never leak into this board.
    capture.run(other, 0, sha, 'kalodata', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    capture.run(other, 1, sha, 'serpapi', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    usage.run(other, 0, 'serpapi', '2026-03-01T00:00:01.000Z');
  } finally { db.close(); }
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function withApi<T>(fixture: { databasePath: string; artifactRoot: string }, ownerEnabled: boolean,
  providers: ResearchAutomationProviderConfig, callback: (base: string) => Promise<T>): Promise<T> {
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await closeServer(probe);
  const origin = `http://127.0.0.1:${port}`;
  const application = openResearchAutomationApi({
    databasePath: fixture.databasePath, artifactRoot: fixture.artifactRoot, origin, providers,
    ...(ownerEnabled ? { owner: { writeEnabled: true, databasePath: fixture.databasePath, artifactRoot: fixture.artifactRoot,
      token: ownerToken, allowedOrigin: origin, actorId: 'owner:research' } } : {}),
  });
  const server = http.createServer(application.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  try { return await callback(origin); } finally { await closeServer(server); await application.close(); }
}

async function readStatus(base: string): Promise<{ text: string; body: Record<string, any> }> {
  const response = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/source-status`);
  assert.equal(response.status, 200);
  const text = await response.text(); const body = JSON.parse(text) as Record<string, any>;
  assert.equal(validateStatus(body), true, JSON.stringify(validateStatus.errors));
  return { text, body };
}

const bySource = (body: Record<string, any>) => Object.fromEntries((body.sources as Array<Record<string, any>>).map(item => [item.source, item]));

test('source status reports configuration and workspace history without exposing credential values', async () => {
  const fixture = await createFixture();
  seedHistory(fixture.databasePath);
  const providers: ResearchAutomationProviderConfig = { kalodataSecretKey: kalodataSecret, serpApiKey: serpApiSecret, apifyTokenConfigured: true };

  await withApi(fixture, true, providers, async base => {
    const { text, body } = await readStatus(base);
    for (const secret of [kalodataSecret, serpApiSecret, apifySecret, ownerToken]) assert.equal(text.includes(secret), false);
    assert.equal(body.workspaceId, workspaceId);
    assert.equal(body.executorEnabled, true);
    assert.deepEqual(body.sources.map((item: Record<string, any>) => item.source), ['KALODATA', 'SERPAPI', 'APIFY_SHOPEE', 'METRIC']);
    const sources = bySource(body);
    assert.deepEqual(sources.KALODATA, { source: 'KALODATA', state: 'READY', credential: 'CONFIGURED', wiredIntoRuns: true, paid: true,
      lastDataAt: '2026-02-03T00:00:00.000Z', dataCount: 2, lastUsageAt: '2026-02-03T00:00:01.000Z' });
    assert.equal(sources.SERPAPI.credential, 'CONFIGURED');
    assert.equal(sources.SERPAPI.dataCount, 0, 'Another workspace history is not counted');
    assert.equal(sources.SERPAPI.lastUsageAt, null);
    // A token without a spending cap never starts a paid collection.
    assert.equal(sources.APIFY_SHOPEE.state, 'NOT_CONFIGURED');
    assert.equal(sources.APIFY_SHOPEE.credential, 'CONFIGURED');
    assert.equal(sources.APIFY_SHOPEE.dataCount, 1);
    assert.deepEqual(sources.METRIC, { source: 'METRIC', state: 'MANUAL_IMPORT', credential: 'NOT_REQUIRED', wiredIntoRuns: true, paid: false,
      lastDataAt: null, dataCount: 0, lastUsageAt: null });
  });

  await withApi(fixture, true, { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: true,
    apifyReviews: { token: apifySecret, maxChargeUsd: 2 } }, async base => {
    const { text, body } = await readStatus(base);
    assert.equal(text.includes(apifySecret), false);
    const sources = bySource(body);
    assert.equal(sources.KALODATA.state, 'NOT_CONFIGURED');
    assert.equal(sources.KALODATA.credential, 'MISSING');
    assert.equal(sources.SERPAPI.state, 'NOT_CONFIGURED');
    assert.equal(sources.APIFY_SHOPEE.state, 'READY');
  });

  await withApi(fixture, false, providers, async base => {
    const { body } = await readStatus(base);
    assert.equal(body.executorEnabled, false);
    assert.deepEqual(body.sources.map((item: Record<string, any>) => item.state), ['EXECUTOR_DISABLED', 'EXECUTOR_DISABLED', 'EXECUTOR_DISABLED', 'EXECUTOR_DISABLED']);
    assert.equal(bySource(body).KALODATA.credential, 'CONFIGURED');
  });
});

test('source status is read-only and scoped to an existing workspace', async () => {
  const fixture = await createFixture();
  await withApi(fixture, true, { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, async base => {
    const missing = await fetch(`${base}/api/workspaces/${otherWorkspaceId}/research-automation/source-status`);
    assert.equal(missing.status, 404);
    const post = await fetch(`${base}/api/workspaces/${workspaceId}/research-automation/source-status`, { method: 'POST' });
    assert.equal(post.status, 405);
    assert.equal(post.headers.get('allow'), 'GET');
    const { body } = await readStatus(base);
    assert.ok(body.sources.every((item: Record<string, any>) => item.dataCount === 0 && item.lastDataAt === null && item.lastUsageAt === null));
  });
});
