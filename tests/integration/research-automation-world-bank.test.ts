import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import type { PackageRef, PrepareReceipt, View } from '../../contracts/api/research-automation-macro-intake-api.generated.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', otherWorkspace = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token-0-not-a-live-credential';
const noProviders = { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false };
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
type Run = { runId: string; status: string; revision: number };
async function fixture(t: test.TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'macro-owning-synthetic-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  for (const id of [workspaceId, otherWorkspace]) await new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => id })
    .createWorkspace({ contractVersion: '1.0.0', workspaceKey: `macro-${id}`, title: 'Synthetic macro workspace' });
  let calls = 0, puts = 0;
  const originalBasePut = ContentAddressedArtifactStore.prototype.put;
  t.mock.method(ContentAddressedArtifactStore.prototype, 'put', async function (this: ContentAddressedArtifactStore, bytes: Uint8Array) {
    puts++; return originalBasePut.call(this, bytes);
  });
  const originalPut = RequestScopedArtifactStore.prototype.put;
  t.mock.method(RequestScopedArtifactStore.prototype, 'put', async function (this: RequestScopedArtifactStore, bytes: Uint8Array) {
    puts++; return originalPut.call(this, bytes);
  });
  const transport = { sleep: async () => {}, now: () => 0, fetch: (async () => { calls++; throw new Error('No application transport allowed'); }) as typeof fetch };
  let app: ReturnType<typeof openResearchAutomationApi>;
  const server = http.createServer((req, res) => app.handler(req, res));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  t.after(async () => {
    try { await app?.close(); }
    finally { await new Promise<void>(resolve => server.close(() => resolve())); db.close(); await fs.rm(root, { recursive: true, force: true }); }
  });
  app = openResearchAutomationApi({ databasePath, artifactRoot, origin, providers: noProviders,
    owner: { databasePath, artifactRoot, allowedOrigin: origin, token, actorId: 'synthetic-owner', writeEnabled: true } }, transport);
  const ownerRoot = (runId = '', workspace = workspaceId) => `${origin}/owner-api/workspaces/${workspace}/research-automation/runs${runId ? `/${runId}` : ''}`;
  const readRoot = (runId: string, workspace = workspaceId) => `${origin}/api/workspaces/${workspace}/research-automation/runs/${runId}`;
  const ownerHeaders = { Origin: origin, Authorization: `Bearer ${token}` };
  const post = (runId: string, action: string, body: unknown, workspace = workspaceId) => fetch(`${ownerRoot(runId, workspace)}${action ? `/${action}` : ''}`,
    { method: 'POST', headers: { ...ownerHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  async function awaitRun(runId: string, status: string): Promise<Run> {
    for (let attempt = 0; attempt < 100; attempt++) {
      const response = await fetch(readRoot(runId)); assert.equal(response.status, 200);
      const run = await response.json() as Run;
      if (run.status === status) return run;
      if (['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(run.status)) throw new Error(`Synthetic run stopped: ${run.status}`);
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error(`Synthetic run did not reach ${status}`);
  }
  async function createRun(versioned = true): Promise<string> {
    const started = await post('', '', { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
      keyword: 'synthetic product', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
    assert.equal(started.status, 202, await started.clone().text());
    const runId = ((await started.json()) as { run: Run }).run.runId;
    const awaiting = await awaitRun(runId, 'AWAITING_SCOPE');
    const confirmed = await post(runId, 'confirm-scope', { contractVersion: versioned ? 'research-automation-confirm-v2' : 'research-automation-confirm-v1',
      requestKey: randomUUID(), expectedRevision: awaiting.revision, definition: 'Synthetic existing confirmed scope',
      includeTerms: ['synthetic product'], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [],
      ...(versioned ? { sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } } : {}) });
    assert.equal(confirmed.status, 202, await confirmed.clone().text()); await awaitRun(runId, 'DRAFT_READY'); return runId;
  }
  const prepareInput = (requestKey: string, raw = worldBankFixture()) => ({ contractVersion: 'automation-world-bank-prepare-v1', requestKey,
    sourceLabel: 'Synthetic official indicator bytes', acquiredAt: '2026-07-14T00:00:00Z', sourceUrl: raw.sourceUrl, metadataUrl: raw.metadataUrl });
  const upload = (runId: string, input: unknown, raw = worldBankFixture(), headers = ownerHeaders) => {
    const form = new FormData(); form.set('metadata', JSON.stringify(input));
    form.set('observations', new File([new Uint8Array(raw.observations)], 'synthetic-observations.json', { type: 'application/json' }));
    form.set('indicator', new File([new Uint8Array(raw.metadata)], 'synthetic-indicator.json', { type: 'application/json' }));
    return fetch(`${ownerRoot(runId)}/sources/world-bank`, { method: 'POST', headers, body: form });
  };
  const selected = (runId: string, ref: PackageRef) => `${readRoot(runId)}/sources/world-bank/${ref.packageId}/${ref.manifestArtifactSha256}/${ref.packageContentSha256}`;
  const counts = () => ['foundation_source_packages', 'foundation_source_package_files', 'foundation_source_attachment_origins', 'artifact_manifests']
    .map(table => (db.prepare(`SELECT COUNT(*) n FROM ${table}`).get() as { n: bigint }).n);
  return { db, artifacts, artifactRoot, root, origin, ownerHeaders, readRoot, post, createRun, prepareInput, upload, selected, counts,
    counters: () => ({ calls, puts }), reopen: async () => { await app.close(); app = openResearchAutomationApi({ databasePath, artifactRoot, origin,
      providers: { kalodataSecretKey: 'changed-synthetic-setting', serpApiKey: 'changed-synthetic-setting', apifyTokenConfigured: true } }, transport); } };
}

test('actual OWNER HTTP upload/confirm/history/display retains two revisions, dedupes source activity, and preserves historical artifacts', async t => {
  const f = await fixture(t), oldRun = await f.createRun(false), runId = await f.createRun();
  const baselineRows = f.db.prepare('SELECT sha256 FROM artifact_manifests ORDER BY sha256').all() as { sha256: string }[];
  assert.ok(baselineRows.length >= 13);
  const baseline = new Map<string, Buffer>(); for (const row of baselineRows) baseline.set(row.sha256, await f.artifacts.read(row.sha256));
  const oldReports = new Map<string, string>();
  for (const run of [oldRun, runId]) for (const kind of ['market', 'insight']) oldReports.set(`${run}/${kind}`, await (await fetch(`${f.readRoot(run)}/reports/${kind}`)).text());
  const runBefore = await (await fetch(f.readRoot(runId))).json();
  const input = f.prepareInput('first');
  const upload = await f.upload(runId, input); assert.equal(upload.status, 201, await upload.clone().text());
  const prepared = await upload.json() as PrepareReceipt; assert.equal(prepared.state, 'PREPARED_NOT_ADMITTED');
  assert.deepEqual((await (await fetch(`${f.readRoot(runId)}/sources/world-bank`)).json() as { sources: unknown[] }).sources, []);
  assert.equal((await fetch(f.selected(runId, prepared.source))).status, 500, 'preparation cannot substitute for confirmation');
  const confirm = { contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'confirm-first', source: prepared.source };
  const response = await f.post(runId, 'sources/world-bank/confirm', confirm); assert.equal(response.status, 200, await response.clone().text());
  const view = await response.json() as View;
  const html = await (await fetch(`${f.selected(runId, view.confirmationSource)}/display`)).text();
  assert.match(html, /Ngân hàng Thế giới \(World Bank Open Data\)/); assert.match(html, /12345678901234567890\.123456789/);
  assert.match(html, /chưa có số liệu/); assert.match(html, /chưa có đơn vị trong nguồn/); assert.ok(!html.includes('synthetic-owner'));
  assert.equal((await fetch(`${f.selected(runId, view.confirmationSource)}/ratio`)).status, 400);
  const effects = f.counters(), counts = f.counts();
  assert.equal((await f.upload(runId, input)).status, 200); assert.deepEqual(await (await f.post(runId, 'sources/world-bank/confirm', confirm)).json(), view);
  assert.deepEqual(f.counters(), effects); assert.deepEqual(f.counts(), counts);
  assert.equal((await f.post(runId, 'sources/world-bank/confirm', { ...confirm, requestKey: 'same-source-new-confirmation' })).status, 200);
  let board = await (await fetch(`${f.origin}/api/workspaces/${workspaceId}/research-automation/source-status`)).json() as { sources: { source: string; state: string; dataCount: number; lastUsageAt: null; lastDataAt: string | null }[] };
  assert.equal(board.sources.find(card => card.source === 'WORLD_BANK')!.dataCount, 3, 'same exact source rows are not recounted');
  const raw = worldBankFixture(); raw.observations = Buffer.from(raw.observations.toString().replace('12345678901234567890.123456789', '19.25').replace('2026-07-13', '2026-08-13'));
  const revised = await f.upload(runId, f.prepareInput('revision-two', raw), raw); assert.equal(revised.status, 201);
  const second = await revised.json() as PrepareReceipt;
  const revision = await f.post(runId, 'sources/world-bank/confirm', { ...confirm, requestKey: 'confirm-revised', source: second.source }); assert.equal(revision.status, 200);
  const newer = await revision.json() as View;
  const history = await (await fetch(`${f.readRoot(runId)}/sources/world-bank`)).json() as { sources: View[] };
  assert.equal(history.sources.length, 3); assert.equal(await (await fetch(`${f.selected(runId, view.confirmationSource)}/display`)).text(), html);
  board = await (await fetch(`${f.origin}/api/workspaces/${workspaceId}/research-automation/source-status`)).json() as typeof board;
  const card = board.sources.find(row => row.source === 'WORLD_BANK')!;
  assert.equal(card.state, 'MANUAL_IMPORT'); assert.equal(card.dataCount, 6); assert.equal(card.lastUsageAt, null); assert.equal(card.lastDataAt, newer.confirmation.confirmedAt);
  assert.equal(board.sources.find(row => row.source === 'OFFICIAL_STATS')!.state, 'NOT_BUILT');
  const anotherRun = await f.createRun();
  const anotherPrepared = await (await f.upload(anotherRun, f.prepareInput('another-run'))).json() as PrepareReceipt;
  assert.equal((await f.post(anotherRun, 'sources/world-bank/confirm', { ...confirm, requestKey: 'confirm-another-run', source: anotherPrepared.source })).status, 200);
  board = await (await fetch(`${f.origin}/api/workspaces/${workspaceId}/research-automation/source-status`)).json() as typeof board;
  assert.equal(board.sources.find(row => row.source === 'WORLD_BANK')!.dataCount, 9, 'three actual source packages across two runs; no economic value sum');
  const otherBoard = await (await fetch(`${f.origin}/api/workspaces/${otherWorkspace}/research-automation/source-status`)).json() as typeof board;
  assert.equal(otherBoard.sources.find(row => row.source === 'WORLD_BANK')!.dataCount, 0);
  assert.deepEqual(await (await fetch(f.readRoot(runId))).json(), runBefore, 'source confirmation cannot rewrite the original run');
  for (const [sha, bytes] of baseline) assert.deepEqual(await f.artifacts.read(sha), bytes);
  for (const [key, bytes] of oldReports) { const [run, kind] = key.split('/'); assert.equal(await (await fetch(`${f.readRoot(run!)}/reports/${kind}`)).text(), bytes); }
  const beforeCold = f.counters(); await f.reopen();
  assert.deepEqual(await (await fetch(f.selected(runId, view.confirmationSource))).json(), view);
  assert.equal(await (await fetch(`${f.selected(runId, view.confirmationSource)}/display`)).text(), html);
  assert.deepEqual(f.counters(), beforeCold); assert.equal(f.counters().calls, 0);
  // A fresh owning read handle forbids current workspace, clock, model/provider and artifact writes.
  f.db.pragma('query_only=ON');
  const cold = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('No current workspace reads'); } }, now: () => { throw new Error('No retained clock'); } });
  const beforeChanges = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual((await cold.readWorldBankSource(workspaceId, runId, view.confirmationSource)).view, view);
  assert.equal((await cold.listWorldBankHistory(workspaceId, runId)).sources.length, 3);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeChanges);
  assert.deepEqual(f.counters(), beforeCold);
  t.diagnostic(`historical artifacts byte-identical: ${baseline.size}; original report views: ${oldReports.size}; no application transport calls`);
});

test('owning HTTP auth, endpoint/byte/size/binding/substitution corruption refuses without source writes', async t => {
  const f = await fixture(t), runId = await f.createRun(), secondRun = await f.createRun(), unbound = await f.createRun(false);
  const input = f.prepareInput('first'), before = f.counts(), effects = f.counters();
  assert.equal((await f.upload(runId, input, worldBankFixture(), { Origin: f.origin, Authorization: 'Bearer invalid' })).status, 401);
  assert.equal((await f.upload(runId, input, worldBankFixture(), { ...f.ownerHeaders, Origin: 'http://example.invalid' })).status, 403);
  for (const raw of [worldBankFixture('UNREVIEWED.CODE'), { ...worldBankFixture(), observations: Buffer.from('{}') },
    { ...worldBankFixture(), observations: Buffer.from(worldBankFixture().observations.toString().replace('"VN"', '"US"')) }])
    assert.equal((await f.upload(runId, f.prepareInput('bad', raw), raw)).status, 400);
  assert.equal((await f.upload(runId, input, { ...worldBankFixture(), observations: Buffer.alloc(8 * 1024 * 1024 + 1) })).status, 413);
  assert.equal((await f.upload(unbound, input)).status, 409, 'marker-free old run is not silently upgraded');
  const labelRejected = await f.upload(runId, { ...input, sourceLabel: 'L'.repeat(201) });
  assert.equal(labelRejected.status, 400, await labelRejected.clone().text());
  assert.equal((await labelRejected.json() as { error: { code: string } }).error.code, 'source_input_rejected');
  assert.deepEqual(f.counts(), before); assert.deepEqual(f.counters(), effects);
  assert.equal((await f.upload(runId, { ...input, requestKey: 'label-200-boundary', sourceLabel: 'L'.repeat(200) })).status, 201,
    'the existing Foundation exact 200-character boundary remains accepted');
  const prepared = await (await f.upload(runId, input)).json() as PrepareReceipt;
  const confirm = { contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'confirm-first', source: prepared.source };
  const counts = f.counts(), puts = f.counters();
  assert.equal((await f.post(secondRun, 'sources/world-bank/confirm', confirm)).status, 400);
  assert.equal((await f.post(runId, 'sources/world-bank/confirm', { ...confirm, source: { ...prepared.source, packageContentSha256: '9'.repeat(64) } })).status, 400);
  assert.equal((await f.post(runId, 'sources/world-bank/confirm', confirm, otherWorkspace)).status, 404);
  assert.deepEqual(f.counts(), counts); assert.deepEqual(f.counters(), puts);
  const packages = new SourcePackageService({ db: f.db, artifactStore: f.artifacts });
  const source = await packages.readVerified(prepared.source.packageId);
  const forged = await packages.intake({ contractVersion: '1.0.0', packageKey: 'synthetic:forged-macro', version: 1,
    sourceLabel: source.manifest.sourceLabel, sourceAcquiredAt: source.manifest.sourceAcquiredAt, files: source.manifest.files }, new Map(source.files.map(file => [file.path, file.bytes])));
  assert.equal((await f.post(runId, 'sources/world-bank/confirm', { ...confirm, source: { packageId: forged.packageId,
    manifestArtifactSha256: forged.manifestArtifactSha256, packageContentSha256: forged.packageContentSha256 } })).status, 400);
  const response = await f.post(runId, 'sources/world-bank/confirm', confirm); assert.equal(response.status, 200);
  const view = await response.json() as View;
  const confirmation = await packages.readVerified(view.confirmationSource.packageId);
  const protectedEffects = f.counters(), protectedCounts = f.counts();
  const frozen = f.db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope,confirmed_source_set_sha256 sources FROM analysis_research_automation_runs WHERE run_id=?')
    .get(runId) as { start: string; scope: string; sources: string };
  for (const sha of new Set([prepared.source.manifestArtifactSha256, view.confirmationSource.manifestArtifactSha256,
    ...source.files.map(file => file.sha256), ...confirmation.files.map(file => file.sha256), frozen.start, frozen.scope, frozen.sources])) {
    const filename = path.join(f.artifactRoot, 'sha256', sha.slice(0, 2), sha), original = await fs.readFile(filename);
    await fs.writeFile(filename, Buffer.from('synthetic retained corruption'));
    assert.equal((await fetch(f.selected(runId, view.confirmationSource))).status, 500);
    assert.equal((await fetch(`${f.readRoot(runId)}/sources/world-bank`)).status, 500);
    assert.equal((await fetch(`${f.origin}/api/workspaces/${workspaceId}/research-automation/source-status`)).status, 500);
    await fs.writeFile(filename, original); assert.equal(digest(original), sha);
    assert.deepEqual(await (await fetch(f.selected(runId, view.confirmationSource))).json(), view);
  }
  assert.deepEqual(f.counts(), protectedCounts); assert.deepEqual(f.counters(), protectedEffects); assert.equal(f.counters().calls, 0);
});

test('existing owning cancellation denies new macro preparation/confirmation without altering cancellation policy', async t => {
  const f = await fixture(t); await f.reopen(); // Stop the OWNER worker before deterministic direct service stepping.
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
    metricAttachmentStore: new RequestScopedArtifactStore(f.artifactRoot), actorId: 'synthetic-owner' });
  const started = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'synthetic product', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext(); const awaiting = await service.getRun(workspaceId, started.run.runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  const confirmed = await service.confirmScope(workspaceId, awaiting.runId, { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(),
    expectedRevision: awaiting.revision, definition: 'Synthetic original cancellation boundary', includeTerms: ['synthetic product'], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [], sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  const cancelled = await service.cancel(workspaceId, awaiting.runId, { contractVersion: 'research-automation-cancel-v1', requestKey: randomUUID(), expectedRevision: confirmed.run.revision });
  assert.equal(cancelled.run.status, 'CANCELLED');
  const raw = worldBankFixture(), changes = f.db.prepare('SELECT total_changes() n').get(), counts = f.counts(), calls = f.counters();
  await assert.rejects(service.prepareWorldBankSource(workspaceId, awaiting.runId, f.prepareInput('cancelled'), raw.observations, raw.metadata), /original reports/);
  await assert.rejects(service.confirmWorldBankSource(workspaceId, awaiting.runId, { contractVersion: 'automation-world-bank-confirm-v1', requestKey: 'cancelled',
    source: { packageId: randomUUID(), manifestArtifactSha256: '1'.repeat(64), packageContentSha256: '2'.repeat(64) } }), /original reports/);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.deepEqual(f.counts(), counts); assert.deepEqual(f.counters(), calls);
});
