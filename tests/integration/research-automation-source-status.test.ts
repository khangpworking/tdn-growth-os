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
import { FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/discovery-workspace-reader.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
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
      VALUES (?,'COLLECTION',?,?,'application/json',?,?,?,0,?)`);
    const usage = db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,recorded_at)
      VALUES (?,'COLLECTION',?,?,'synthetic.read',1,'UNKNOWN',?)`);
    const own = '22222222-2222-4222-8222-222222222222'; const other = '33333333-3333-4333-8333-333333333333';
    const sha = 'a'.repeat(64);
    run.run(own, workspaceId, sha, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    run.run(other, otherWorkspaceId, sha, '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    capture.run(own, 0, sha, 'kalodata', 'kalodata.product.rank', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    capture.run(own, 1, sha, 'kalodata', 'kalodata.product.detail', '2026-02-03T00:00:00.000Z', '2026-02-03T00:00:00.000Z');
    capture.run(own, 2, sha, 'apify-shopee', 'reviews', '2026-02-02T00:00:00.000Z', '2026-02-02T00:00:00.000Z');
    capture.run(own, 3, sha, 'serpapi', 'serpapi.google.search', '2026-02-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z');
    capture.run(own, 4, sha, 'serpapi', 'serpapi.google.search', '2026-02-04T00:00:00.000Z', '2026-02-04T00:00:00.000Z');
    usage.run(own, 0, 'kalodata', '2026-02-03T00:00:01.000Z');
    usage.run(own, 1, 'serpapi', '2026-02-04T00:00:01.000Z');
    // Another workspace's later history must never leak into this board.
    capture.run(other, 0, sha, 'kalodata', 'kalodata.product.rank', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    capture.run(other, 1, sha, 'serpapi', 'serpapi.google.search', '2026-03-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z');
    usage.run(other, 0, 'serpapi', '2026-03-01T00:00:01.000Z');
    // A retained P4 Kalodata video package bound to this workspace's run.
    const manifest = 'b'.repeat(64);
    db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,?, ?,?,'1.0.0','active',?)`)
      .run(manifest, 10, 'application/json', 'synthetic/video-manifest.json', '2026-02-02T00:00:00.000Z', '2026-02-02T00:00:00.000Z');
    const videoPackageId = '55555555-5555-4555-8555-555555555555';
    db.prepare(`INSERT INTO foundation_source_packages(package_id,package_key,version,source_acquired_at,source_label,request_sha256,package_content_sha256,manifest_artifact_sha256,finalized_at)
      VALUES (?,?,?,?,?,?,?,?,NULL)`).run(videoPackageId, `automation-video:${own}-66666666-6666-4666-8666-666666666666`, 1,
      '2026-02-02T00:00:00.000Z', 'synthetic video', sha, sha, manifest);
    db.prepare(`INSERT INTO foundation_source_attachment_origins(package_id,origin_kind,binding_sha256,manifest_artifact_sha256,marked_at)
      VALUES (?,'AUTOMATION_ATTACHMENT',?,?,?)`).run(videoPackageId, 'c'.repeat(64), manifest, '2026-02-02T00:00:00.000Z');
    db.prepare(`UPDATE foundation_source_packages SET finalized_at=? WHERE package_id=?`)
      .run('2026-02-02T00:00:00.000Z', videoPackageId);
    // One PDF attached to this workspace's run: workspace history, not an account total.
    db.prepare(`INSERT INTO analysis_pageindex_run_pdfs(run_id,source_sha256,file_name,package_id,manifest_sha256,logical_path)
      VALUES (?,?,?,?,?,?)`).run(own, manifest, 'workspace.pdf', videoPackageId, manifest, 'workspace.pdf');
  } finally { db.close(); }
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
}

async function withApi<T>(fixture: { databasePath: string; artifactRoot: string }, ownerEnabled: boolean,
  providers: ResearchAutomationProviderConfig, callback: (base: string) => Promise<T>,
  pageIndex: Parameters<typeof openResearchAutomationApi>[0]['pageIndex'] = { enabled: false, apiKey: '' }): Promise<T> {
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await closeServer(probe);
  const origin = `http://127.0.0.1:${port}`;
  const application = openResearchAutomationApi({
    databasePath: fixture.databasePath, artifactRoot: fixture.artifactRoot, origin, providers, pageIndex,
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

test('source status reports eleven cards with registry metadata, workspace history and no credential values', async () => {
  const fixture = await createFixture();
  seedHistory(fixture.databasePath);
  const providers: ResearchAutomationProviderConfig = { kalodataSecretKey: kalodataSecret, serpApiKey: serpApiSecret, apifyTokenConfigured: true };

  await withApi(fixture, true, providers, async base => {
    const { text, body } = await readStatus(base);
    for (const secret of [kalodataSecret, serpApiSecret, apifySecret, ownerToken]) assert.equal(text.includes(secret), false);
    assert.equal(body.workspaceId, workspaceId);
    assert.equal(body.executorEnabled, true);
    assert.deepEqual(body.sources.map((item: Record<string, any>) => item.source), ['METRIC', 'KALODATA', 'KALODATA_VIDEO_FILE',
      'APIFY_SHOPEE', 'APIFY_TIKTOK_COMMENTS', 'VIDEO_READING', 'META_AD_LIBRARY', 'SERPAPI', 'OFFICIAL_STATS', 'WORLD_BANK', 'PAGEINDEX']);
    const sources = bySource(body);
    assert.deepEqual(sources.KALODATA, { source: 'KALODATA', state: 'READY', credential: 'CONFIGURED', wiredIntoRuns: true, paid: true,
      lastDataAt: '2026-02-03T00:00:00.000Z', dataCount: 2, lastUsageAt: '2026-02-03T00:00:01.000Z',
      pendingPackage: null, registryIds: ['S02'], tier: 'C', tierDetail: null, group: 'SALES_MARKET',
      reportName: 'dữ liệu video bán hàng (ước tính)', spendCapUsd: null, operations: null });
    // P4 retained upload history surfaces on the video-file card with a null timestamp, never invented.
    assert.equal(sources.KALODATA_VIDEO_FILE.state, 'MANUAL_IMPORT');
    assert.equal(sources.KALODATA_VIDEO_FILE.dataCount, 1);
    assert.equal(sources.KALODATA_VIDEO_FILE.lastDataAt, null);
    assert.deepEqual(sources.KALODATA_VIDEO_FILE.registryIds, ['S02']);
    // SerpApi per-operation history: observed search captures plus an honest empty Trends row.
    assert.equal(sources.SERPAPI.state, 'READY');
    assert.equal(sources.SERPAPI.dataCount, 2, 'Another workspace history is not counted');
    assert.deepEqual(sources.SERPAPI.operations, [
      { operation: 'serpapi.google.search', count: 2, lastDataAt: '2026-02-04T00:00:00.000Z', lastUsageAt: null,
        registryIds: ['S19', 'S13', 'S26'], tier: null },
      { operation: 'serpapi.google.trends', count: 0, lastDataAt: null, lastUsageAt: null, registryIds: ['S20'], tier: 'B' },
    ]);
    assert.equal(sources.SERPAPI.lastUsageAt, '2026-02-04T00:00:01.000Z', 'Provider-level usage stays on the card, not the operations');
    // A token without a spending cap never starts a paid collection.
    assert.equal(sources.APIFY_SHOPEE.state, 'NOT_CONFIGURED');
    assert.equal(sources.APIFY_SHOPEE.credential, 'CONFIGURED');
    assert.equal(sources.APIFY_SHOPEE.dataCount, 1);
    assert.equal(sources.APIFY_SHOPEE.spendCapUsd, null);
    // Unbuilt cards name their owning package and show honest zeros.
    for (const id of ['APIFY_TIKTOK_COMMENTS', 'VIDEO_READING', 'META_AD_LIBRARY', 'OFFICIAL_STATS']) {
      assert.equal(sources[id].state, 'NOT_BUILT', `${id} must not pretend its collector exists`);
      assert.equal(sources[id].dataCount, 0);
      assert.ok(sources[id].pendingPackage, `${id} names its owning package`);
    }
    assert.equal(sources.WORLD_BANK.state, 'MANUAL_IMPORT');
    assert.equal(sources.WORLD_BANK.wiredIntoRuns, true);
    assert.equal(sources.WORLD_BANK.pendingPackage, null);
    assert.equal(sources.WORLD_BANK.dataCount, 0);
    assert.equal(sources.WORLD_BANK.lastDataAt, null);
    assert.equal(sources.WORLD_BANK.lastUsageAt, null);
    assert.equal(sources.APIFY_TIKTOK_COMMENTS.pendingPackage, 'P9');
    assert.equal(sources.APIFY_TIKTOK_COMMENTS.credential, 'CONFIGURED', 'Shared Apify token is honest credential evidence');
    assert.equal(sources.APIFY_TIKTOK_COMMENTS.spendCapUsd, null, 'An absent TikTok cap is never defaulted to $3');
    assert.deepEqual(sources.METRIC.registryIds, ['S01', 'S04']);
    assert.equal(sources.METRIC.tier, null, 'Mixed S01/S04 tiers have no scalar aggregate');
    assert.equal(sources.METRIC.tierDetail, 'S01: C; S04: B');
    // PageIndex reconciliation: workspace history apart from account-wide connector numbers.
    assert.equal(sources.PAGEINDEX.dataCount, 1, 'Workspace PDF history, not the account ledger');
    assert.equal(sources.PAGEINDEX.lastDataAt, null);
    assert.equal(sources.PAGEINDEX.pageindex.documentsSent, 0, 'Account ledger stays zero while one workspace PDF exists');
  });

  await withApi(fixture, true, { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: true,
    apifyReviews: { token: apifySecret, maxChargeUsd: 2 }, apifyTikTokComments: { maxChargeUsd: 3 } }, async base => {
    const { text, body } = await readStatus(base);
    assert.equal(text.includes(apifySecret), false);
    const sources = bySource(body);
    assert.equal(sources.KALODATA.state, 'NOT_CONFIGURED');
    assert.equal(sources.KALODATA.credential, 'MISSING');
    assert.equal(sources.SERPAPI.state, 'NOT_CONFIGURED');
    assert.equal(sources.APIFY_SHOPEE.state, 'READY');
    assert.equal(sources.APIFY_SHOPEE.spendCapUsd, 2);
    assert.equal(sources.APIFY_TIKTOK_COMMENTS.state, 'NOT_BUILT', 'A configured cap alone does not build the collector');
    assert.equal(sources.APIFY_TIKTOK_COMMENTS.spendCapUsd, 3);
  });

  await withApi(fixture, false, providers, async base => {
    const { body } = await readStatus(base);
    assert.equal(body.executorEnabled, false);
    assert.equal(body.sources.length, 11);
    assert.ok(body.sources.every((item: Record<string, any>) => item.state === 'EXECUTOR_DISABLED'),
      'Executor-disabled keeps precedence over every card including NOT_BUILT');
    assert.equal(bySource(body).KALODATA.credential, 'CONFIGURED');
    assert.equal(bySource(body).APIFY_TIKTOK_COMMENTS.pendingPackage, 'P9');
  });
});

test('old five-card payloads still validate against the extended contract', async () => {
  const legacy = { contractVersion: 'research-automation-source-status-v1', workspaceId,
    checkedAt: '2026-02-03T00:00:00.000Z', executorEnabled: true,
    sources: (['KALODATA', 'SERPAPI', 'APIFY_SHOPEE', 'METRIC', 'PAGEINDEX'] as const).map(source => ({
      source, state: 'READY', credential: 'CONFIGURED', wiredIntoRuns: true, paid: true,
      lastDataAt: null, dataCount: 0, lastUsageAt: null })) };
  assert.equal(validateStatus(legacy), true, JSON.stringify(validateStatus.errors));
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

// The HTTP boundary owns authentication, bounded multipart parsing, route reachability and free rechecks.
// Upload accounting and local quote verification belong to pageindex-upload.test.ts.
test('PDF HTTP intake and free recheck are reachable, owner-only, and GET states never contact the connector', async () => {
  const fixture = await createFixture();
  const opened = openDatabase({ databasePath: fixture.databasePath });
  let runId: string;
  try {
    const artifacts = new ContentAddressedArtifactStore(fixture.artifactRoot);
    const discovery = new DiscoveryWorkspaceService({ db: opened.db, artifactStore: artifacts });
    const service = new ResearchAutomationService({ db: opened.db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery) });
    const receipt = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1',
      requestKey: '44444444-4444-4444-8444-444444444444', mode: 'CATEGORY', keyword: 'synthetic PDF only',
      requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
    await service.processNext(); runId = receipt.run.runId;
    assert.equal((await service.getRun(workspaceId, runId)).status, 'AWAITING_SCOPE');
  } finally { opened.db.close(); }
  let uploads = 0; let lists = 0; let metadataReads = 0;
  const pageIndex: Parameters<typeof openResearchAutomationApi>[0]['pageIndex'] = {
    enabled: true, apiKey: 'synthetic-pdf-secret-only', startingCreditMicroDollars: 10_000_000,
    extractPdf: async () => [{ page: 1, text: 'Synthetic page for transport only' }],
    fetch: async (url) => {
      const pathname = new URL(String(url)).pathname;
      if (pathname === '/doc/upload') { uploads++; return Response.json({ id: 'synthetic-cloud-doc', name: 'fixture.pdf', pageNum: 1, status: 'processing' }); }
      if (pathname === '/doc/list') { lists++; return Response.json({ documents: [{ id: 'synthetic-cloud-doc', name: 'fixture.pdf', pageNum: 1, status: 'completed' }] }); }
      if (pathname.endsWith('/metadata')) { metadataReads++; return Response.json({ id: 'synthetic-cloud-doc', name: 'fixture.pdf', pageNum: 1, status: 'completed' }); }
      throw new Error('Unexpected paid question or other connector call');
    },
  };
  await withApi(fixture, true, { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, async base => {
    const statesUrl = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/pageindex`;
    const uploadUrl = `${base}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/source-pdfs`;
    const recheckUrl = `${base}/owner-api/workspaces/${workspaceId}/research-automation/source-status/pageindex/recheck`;
    const headers = { Origin: base, Authorization: `Bearer ${ownerToken}` };
    assert.equal((await fetch(statesUrl)).status, 200);
    assert.equal(uploads + lists + metadataReads, 0);
    assert.equal((await fetch(recheckUrl, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: '{}' })).status, 401);
    assert.equal((await fetch(uploadUrl, { method: 'POST', headers: { Origin: base } })).status, 401);
    assert.equal((await fetch(recheckUrl, { method: 'POST', headers: { ...headers, Origin: 'https://foreign.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
    assert.equal(uploads + lists + metadataReads, 0, 'Rejected authorization never calls a provider');
    const form = (fileName = 'fixture.pdf', bytes = '%PDF-1.7\nsynthetic only') => {
      const value = new FormData(); value.append('metadata', JSON.stringify({ contractVersion: 'research-automation-pdf-attach-v1', fileName }));
      value.append('pdf', new Blob([bytes], { type: 'application/pdf' }), 'fixture.pdf'); return value;
    };
    assert.equal((await fetch(uploadUrl, { method: 'POST', headers, body: form('../outside.pdf') })).status, 400);
    assert.equal((await fetch(uploadUrl, { method: 'POST', headers, body: form('fixture.pdf', 'not a PDF') })).status, 400);
    const oversize = form(); oversize.set('pdf', new Blob([new Uint8Array(32 * 1024 * 1024 + 1)], { type: 'application/pdf' }), 'oversize.pdf');
    assert.equal((await fetch(uploadUrl, { method: 'POST', headers, body: oversize })).status, 413);
    assert.equal(uploads, 0);
    const attachment = await fetch(uploadUrl, { method: 'POST', headers, body: form('fixture.PDF') });
    assert.equal(attachment.status, 200, await attachment.clone().text());
    const body = await attachment.json() as { runId: string; workspaceId: string; documents: { state: string; fileName: string }[] };
    assert.equal(body.workspaceId, workspaceId); assert.equal(body.runId, runId);
    assert.deepEqual(body.documents.map(document => [document.fileName, document.state]), [['fixture.PDF', 'READY']]);
    assert.equal(uploads, 1);
    const beforeRead = [uploads, lists, metadataReads];
    const read = await fetch(statesUrl); assert.equal(read.status, 200); assert.deepEqual(await read.json(), body);
    assert.deepEqual([uploads, lists, metadataReads], beforeRead);
    const recheck = await fetch(recheckUrl, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(recheck.status, 200); const board = await recheck.json() as Record<string, any>;
    assert.equal(validateStatus(board), true, JSON.stringify(validateStatus.errors));
    assert.equal(bySource(board).PAGEINDEX.pageindex.documentsSent, 1);
    assert.equal(bySource(board).PAGEINDEX.pageindex.balanceMicroDollars, 9_990_000);
    assert.equal(bySource(board).PAGEINDEX.dataCount, 1, 'Workspace PDF history counts this workspace upload');
    assert.equal(JSON.stringify(board).includes('synthetic-pdf-secret-only'), false);
    assert.equal(lists, 1); assert.equal(uploads, 1); assert.equal(metadataReads, beforeRead[2]);
  }, pageIndex);
});
