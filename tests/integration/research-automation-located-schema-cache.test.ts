import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
test('warm located proposal/projection validators cannot bypass retained dependency authentication', async t => {
  const store = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-located-further-'));
  const dbPath = path.join(store, 'test.sqlite'), artifactRoot = path.join(store, 'artifacts');
  const now = () => new Date('2026-10-02T00:00:00.000Z');
  const db = openDatabase({ databasePath: dbPath, now }).db;
  t.after(async () => { db.close(); await fs.rm(store, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'located-cache-proof', title: 'Synthetic located proof' });
  let collections = 0;
  const raw = Buffer.from(JSON.stringify([{ shopId: '78085196', itemId: '17678138164', reviewId: 'synthetic-source', comment: 'Tôi đã dùng sản phẩm.', ratingStar: 5 }]));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    shopeeCollectorFactory: () => ({ requestsIssued: () => collections, collector: { mode: 'fixture', collect: async (...args) => {
      collections++; return new FixtureShopeeCollector(raw).collect(...args);
    } } }) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic located source', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic original source', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] });
  await service.processNext(); await service.processNext();
  const ready = await service.getRun(workspaceId, runId); assert.equal(ready.status, 'DRAFT_READY'); assert.equal(collections, 1);
  const original = await service.readReport(workspaceId, runId, 'INSIGHT');
  assert.ok(ready.outputs?.insight);
  const semantic = JSON.parse((await artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.locatedReview.contractVersion, 'automation-located-review-snapshot-v2');
  assert.equal(semantic.locatedReview.proposal.authorityState, 'RULE_PROPOSAL_ONLY');
  const ids = [semantic.locatedReview.proposal.sourcePackage.packageId, semantic.locatedReview.sourcePackage.packageId];
  const rows = db.prepare(`SELECT logical_path path,artifact_sha256 sha256 FROM foundation_source_package_files WHERE package_id IN (?,?) ORDER BY package_id,logical_path`).all(...ids) as { path: string; sha256: string }[];
  assert.ok(rows.some(row => row.path === 'profiles/located-insight-methods.schema.json'));
  const sourceRows: { path: string; sha256: string }[] = [
    { path: 'original collection', sha256: semantic.reviewCorpus.collectionSha256 },
    { path: 'original request', sha256: semantic.reviewCorpus.requestSha256 },
    ...semantic.reviewCorpus.sourcePages.map((page: { sha256: string }, index: number) => ({ path: `original page ${index}`, sha256: page.sha256 })),
  ];
  assert.equal(sourceRows.length, 3);
  const unique = [...new Map([...rows, ...sourceRows].map(row => [row.sha256, row])).values()];
  const tables = () => JSON.stringify(db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map(({ name }: any) => [name, db.prepare('SELECT * FROM ' + JSON.stringify(name)).all()]), (_, v) => typeof v === 'bigint' ? v.toString() : v);
  const cas = async () => {
    const result: [string, string][] = [];
    for (const f of await fs.readdir(artifactRoot, { recursive: true })) if ((await fs.stat(path.join(artifactRoot, f))).isFile()) result.push([f, hash(await fs.readFile(path.join(artifactRoot, f)))]);
    return result.sort();
  };
  let puts = 0, clocks = 0, workspaces = 0, providers = 0;
  artifacts.put = async () => { puts++; throw Error('No retained puts'); };
  const unavailable = new ResearchAutomationService({ db, artifactStore: artifacts,
    now: () => { clocks++; throw Error('No retained clock'); }, workspaceReader: { readVerifiedWorkspace: () => { workspaces++; throw Error('No retained workspace'); } },
    shopeeCollectorFactory: () => { providers++; throw Error('No retained provider'); } });
  db.pragma('query_only=ON');
  const before = tables(), tree = await cas(), changes = db.prepare('SELECT total_changes() n').get();
  assert.deepEqual((await unavailable.readReport(workspaceId, runId, 'INSIGHT')).bytes, original.bytes);
  for (const row of unique) {
    const target = artifacts.pathForDigest(row.sha256), saved = await fs.readFile(target), damaged = Buffer.from(saved);
    damaged[0] = damaged[0]! ^ 1;
    await fs.writeFile(target, damaged);
    try { await assert.rejects(unavailable.readReport(workspaceId, runId, 'INSIGHT'), { message: `Artifact digest mismatch: ${row.sha256}` }, row.path); }
    finally { await fs.writeFile(target, saved); }
    assert.deepEqual((await unavailable.readReport(workspaceId, runId, 'INSIGHT')).bytes, original.bytes, row.path);
  }
  assert.equal(tables(), before); assert.deepEqual(await cas(), tree); assert.deepEqual(db.prepare('SELECT total_changes() n').get(), changes);
  assert.deepEqual({ puts, clocks, workspaces, providers }, { puts: 0, clocks: 0, workspaces: 0, providers: 0 }); assert.equal(collections, 1);
  t.diagnostic(JSON.stringify({ corruptions: unique.length, proposalProjectionMembers: rows.length, originalHtml: hash(original.bytes) }));
});
