import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { reviewPolicyFixture, policyHash } from '../helpers/review-policy-fixture.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';

async function fixture(t: TestContext, configured = true, renderer?: ConstructorParameters<typeof ResearchAutomationService>[0]['renderer']) {
  const f = await reviewPolicyFixture(t, [29, 30, 300], 0.23);
  const now = () => new Date('2026-10-09T00:00:00.000Z');
  const discovery = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, now, uuid: () => f.input.start.workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'review-coverage', title: 'Synthetic review collection' });
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), metricAttachmentStore: new RequestScopedArtifactStore(path.join(f.root, 'artifacts')),
    uuid: () => f.input.runId, now, sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'synthetic-v1' },
    ...(renderer ? { renderer } : {}),
    ...(configured ? { reviewCollection: { policy: f.policy, factory: f.factory } } : {}) });
  const workspaceId = f.input.start.workspaceId, runId = f.input.runId;
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY',
    keyword: 'Synthetic reviews', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    definition: 'Owner-selected exact listing capture; authenticated revenue coverage unavailable', includeTerms: [], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [...f.input.scope.exactShopeeUrls!] };
  return { ...f, workspaceId, runId, service, confirm };
}
async function report(f: Awaited<ReturnType<typeof fixture>>, pairId?: string) {
  const result = await f.service.readReport(f.workspaceId, f.runId, 'INSIGHT', false, pairId);
  return { result, semantic: JSON.parse((await f.artifacts.read(result.versionId)).toString()) };
}
function closed(bytes: Buffer) {
  for (const forbidden of ['987654321', 'SYNTHETIC_AUTHOR', 'SYNTHETIC_PROFILE', 'keyCommitment', 'keyId', 'authorIdentity', 'synthetic-token', Buffer.alloc(32, 29).toString('hex')])
    assert.equal(bytes.includes(forbidden), false, forbidden);
}

test('actual owning start/confirm/private collection -> retained sample -> cited renderer27/history/API, cold replay no calls or writes', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(f.workspaceId, f.runId, f.confirm);
  const beforeConfirm = f.db.prepare('SELECT total_changes() n').get();
  assert.equal((await f.service.confirmScope(f.workspaceId, f.runId, f.confirm)).exactRetry, true);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeConfirm);
  await f.service.processNext(); await f.service.processNext();
  const pair = (await f.service.listReportVersions(f.workspaceId, f.runId))[0]!;
  assert.ok(pair, JSON.stringify(await f.service.getRun(f.workspaceId, f.runId)));
  const original = await report(f, pair.pairId);
  assert.equal(original.semantic.rendererVersion, 'automation-report-kit-v27');
  assert.equal(original.semantic.reviewSample.products.length, 3);
  assert.deepEqual(original.semantic.reviewSample.products.map((p: { retainedReviews: number }) => p.retainedReviews), [29, 30, 300]);
  assert.equal(original.semantic.reviewSample.coverageAvailable, false);
  assert.equal(original.semantic.reviewSample.receipt.usageTotalUsd, 0.23);
  assert.equal(original.semantic.sourceEvidence.sourceAppendix.rows.some((r: { registryId: string }) => r.registryId === 'S05'), true);
  assert.match(original.result.bytes.toString(), /Mẫu đánh giá đã thu/); assert.match(original.result.bytes.toString(), /chưa phải mẫu theo độ phủ doanh thu 50% hoặc 80%/);
  assert.equal(original.semantic.privateReviewCorpus.records.length, 359);
  assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1);
  const activity = await f.service.readSourceActivity(f.workspaceId);
  assert.equal(activity['apify-shopee'].dataCount, 1);
  assert.equal((await f.service.readSourceActivity(f.workspaceId))['apify-shopee'].dataCount, 1, 'repeated reads do not double count');
  closed(original.result.bytes); closed(Buffer.from(JSON.stringify(original.semantic)));
  const row = f.db.prepare('SELECT start_request_sha256 start,confirmed_source_set_sha256 source FROM analysis_research_automation_runs WHERE run_id=?').get(f.runId) as { start: string; source: string };
  const start = JSON.parse((await f.artifacts.read(row.start)).toString()), source = JSON.parse((await f.artifacts.read(row.source)).toString());
  assert.deepEqual(start.reviewCollectionPolicy, f.policy); assert.deepEqual(source.reviewCollectionPolicy, f.policy);
  assert.equal(original.semantic.reviewSample.binding.confirmedSourceSetSha256, row.source);
  const calls = f.calls.length, changes = f.db.prepare('SELECT total_changes() n').get();
  const put = f.artifacts.put; f.artifacts.put = async () => { throw new Error('Cold read cannot put'); };
  f.db.pragma('query_only=ON');
  try {
    const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
      workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('No current workspace'); } },
      now: () => { throw new Error('No clock'); } });
    assert.deepEqual((await reader.readReport(f.workspaceId, f.runId, 'INSIGHT', false, pair.pairId)).bytes, original.result.bytes);
    assert.equal((await reader.confirmScope(f.workspaceId, f.runId, f.confirm)).exactRetry, true);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.calls.length, calls);
  } finally { f.db.pragma('query_only=OFF'); f.artifacts.put = put; }
  let application: ReturnType<typeof openResearchAutomationApi> | undefined;
  const server = http.createServer((request, response) => application!.handler(request, response));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  application = openResearchAutomationApi({ databasePath: path.join(f.root, 'synthetic.sqlite'), artifactRoot: path.join(f.root, 'artifacts'), origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, pageIndex: { enabled: false } });
  try {
    const base = `/api/workspaces/${f.workspaceId}/research-automation/runs/${f.runId}`;
    for (const route of [base, `${base}/report-versions`, `${base}/report-versions/${pair.pairId}/reports/insight`]) {
      const response = await fetch(origin + route); assert.equal(response.status, 200); closed(Buffer.from(await response.arrayBuffer()));
    }
    const denied = await fetch(`${origin}/owner-api/workspaces/${f.workspaceId}/research-automation/runs/${f.runId}/report-revisions`,
      { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403); assert.equal(f.calls.length, calls);
  } finally { await application.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

test('KEEP retains original sample; SKIP drops it; historical pair exact retry authenticates original source without configuration', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(f.workspaceId, f.runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  const first = (await f.service.listReportVersions(f.workspaceId, f.runId))[0]!, original = await report(f, first.pairId);
  const request = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: first.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  await f.service.requestReportRevision(f.workspaceId, f.runId, request); await f.service.processNext();
  const kept = (await f.service.listReportVersions(f.workspaceId, f.runId)).at(-1)!, retained = await report(f, kept.pairId);
  assert.deepEqual(retained.semantic.reviewSample, original.semantic.reviewSample);
  assert.equal(retained.semantic.insightLiteral.input.reviews.length, 359);
  assert.equal(retained.semantic.rendererVersion, 'automation-report-kit-v27');
  const skip = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: kept.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'SKIP' } } };
  await f.service.requestReportRevision(f.workspaceId, f.runId, skip); await f.service.processNext();
  const skipped = (await f.service.listReportVersions(f.workspaceId, f.runId)).at(-1)!;
  assert.equal((await report(f, skipped.pairId)).semantic.reviewSample, undefined);
  assert.equal((await report(f, skipped.pairId)).semantic.privateReviewCorpus, undefined);
  const before = f.calls.length, changes = f.db.prepare('SELECT total_changes() n').get();
  f.db.pragma('query_only=ON');
  try {
    const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
      workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('No current workspace'); } }, now: () => { throw new Error('No clock'); } });
    assert.equal((await reader.requestReportRevision(f.workspaceId, f.runId, request)).exactRetry, true);
    assert.deepEqual((await reader.readReport(f.workspaceId, f.runId, 'INSIGHT', false, kept.pairId)).bytes, retained.result.bytes);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.calls.length, before);
  } finally { f.db.pragma('query_only=OFF'); }
});

test('OWNER HTTP injected policy -> real worker -> private capture27 -> verified source activity and existing report routes', async t => {
  const f = await reviewPolicyFixture(t, [30, 300]);
  const discovery = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, uuid: () => f.input.start.workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'u22-api', title: 'Synthetic owner API' });
  let application: ReturnType<typeof openResearchAutomationApi> | undefined;
  const server = http.createServer((request, response) => application!.handler(request, response));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token = 'SyntheticOwnerToken12345678901234567890';
  const config = { databasePath: path.join(f.root, 'synthetic.sqlite'), artifactRoot: path.join(f.root, 'artifacts'), origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, pageIndex: { enabled: false },
    reviewCollection: { policy: f.policy, factory: f.factory } };
  assert.throws(() => openResearchAutomationApi(config), /requires the OWNER writer/); assert.equal(f.calls.length, 0);
  application = openResearchAutomationApi({ ...config, owner: { writeEnabled: true, token, actorId: 'owner:synthetic',
    allowedOrigin: origin, databasePath: config.databasePath, artifactRoot: config.artifactRoot } }, { fetch: async () => { throw new Error('No application provider call'); },
    sleep: async () => { throw new Error('No provider sleep'); }, now: () => 0 });
  const root = `/api/workspaces/${f.input.start.workspaceId}/research-automation`;
  const owner = `/owner-api/workspaces/${f.input.start.workspaceId}/research-automation`;
  const post = (route: string, value: unknown, authorized = true) => fetch(origin + owner + route, { method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
  const awaitState = async (runId: string, state: string) => {
    for (let index = 0; index < 100; index++) {
      const response = await fetch(`${origin}${root}/runs/${runId}`); assert.equal(response.status, 200);
      const value = await response.json() as { status: string; revision: number };
      if (value.status === state) return value;
      assert.notEqual(value.status, 'FAILED'); await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Synthetic worker did not reach ${state}`);
  };
  try {
    const start = { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'Synthetic HTTP reviews',
      requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' }, reports: ['INSIGHT'] };
    assert.equal((await post('/runs', start, false)).status, 401); assert.equal(f.calls.length, 0);
    const response = await post('/runs', start); assert.equal(response.status, 202);
    const receipt = await response.json() as { run: { runId: string } }; f.input.runId = receipt.run.runId;
    const awaiting = await awaitState(receipt.run.runId, 'AWAITING_SCOPE');
    const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
      definition: 'Synthetic explicit exact URLs, no revenue coverage', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
      exactShopeeUrls: [...f.input.scope.exactShopeeUrls!] };
    assert.equal((await post(`/runs/${receipt.run.runId}/confirm-scope`, confirm)).status, 202);
    await awaitState(receipt.run.runId, 'DRAFT_READY');
    const versions = await fetch(`${origin}${root}/runs/${receipt.run.runId}/report-versions`); assert.equal(versions.status, 200);
    const listed = await versions.json() as { versions: { pairId: string }[] };
    const html = await fetch(`${origin}${root}/runs/${receipt.run.runId}/reports/insight`); assert.equal(html.status, 200);
    const bytes = Buffer.from(await html.arrayBuffer()); closed(bytes); assert.match(bytes.toString(), /Mẫu đánh giá đã thu/);
    assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1);
    const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery) });
    const activity = await service.readSourceActivity(f.input.start.workspaceId);
    assert.equal(activity['apify-shopee'].dataCount, 1); assert.notEqual(activity['apify-shopee'].lastDataAt, null);
    const status = await fetch(`${origin}${root}/source-status`); assert.equal(status.status, 200); closed(Buffer.from(await status.arrayBuffer()));
    const calls = f.calls.length;
    assert.equal((await post(`/runs/${receipt.run.runId}/confirm-scope`, confirm)).status, 200);
    assert.equal(f.calls.length, calls);
    assert.equal(listed.versions.length, 1);
  } finally { await application.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
});

test('cold owning sample/source/output corruption rejects before calls or writes; exact restoration and workspace isolation succeed', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(f.workspaceId, f.runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  const original = await report(f), run = f.db.prepare('SELECT start_request_sha256 start,scope_request_sha256 scope,confirmed_source_set_sha256 source FROM analysis_research_automation_runs WHERE run_id=?')
    .get(f.runId) as { start: string; scope: string; source: string };
  const step = f.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(f.runId) as { sha: string };
  const corpus = JSON.parse((await f.artifacts.read(original.semantic.privateReviewCorpus.corpus.artifactSha256)).toString());
  const collection = JSON.parse((await f.artifacts.read(corpus.collection.collectionSha256)).toString());
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('No current workspace'); } }, now: () => { throw new Error('No clock'); } });
  const calls = f.calls.length, changes = f.db.prepare('SELECT total_changes() n').get(), put = f.artifacts.put;
  f.artifacts.put = async () => { throw new Error('No CAS.put'); }; f.db.pragma('query_only=ON');
  try {
    for (const sha of [run.start, run.scope, run.source, step.sha, corpus.collection.collectionSha256, collection.pages[0].sha256,
      original.semantic.privateReviewCorpus.corpus.artifactSha256, original.result.versionId]) {
      const physical = f.artifacts.pathForDigest(sha), bytes = await fs.readFile(physical);
      try {
        await fs.writeFile(physical, 'corrupt'); await assert.rejects(reader.readReport(f.workspaceId, f.runId, 'INSIGHT'));
        if ([step.sha, corpus.collection.collectionSha256, collection.pages[0].sha256].includes(sha))
          await assert.rejects(f.service.readSourceActivity(f.workspaceId));
      } finally { await fs.writeFile(physical, bytes); }
      assert.deepEqual((await reader.readReport(f.workspaceId, f.runId, 'INSIGHT')).bytes, original.result.bytes);
    }
    assert.equal(f.calls.length, calls); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  } finally { f.db.pragma('query_only=OFF'); f.artifacts.put = put; }
  const otherId = '55555555-5555-4555-8555-555555555555';
  const other = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, uuid: () => otherId });
  await other.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'separate-u22', title: 'Separate synthetic workspace' });
  assert.equal((await f.service.readSourceActivity(otherId))['apify-shopee'].dataCount, 0);
  await assert.rejects(reader.readReport(otherId, f.runId, 'INSIGHT'));
  assert.equal(f.calls.length, calls);
});

test('marker-free starts remain unavailable without collector and keep historical source activity counts', async t => {
  const f = await fixture(t, false);
  await f.service.confirmScope(f.workspaceId, f.runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  assert.equal((await report(f)).semantic.reviewSample, undefined);
  assert.equal(f.calls.length, 0);
  assert.deepEqual((await f.service.readSourceActivity(f.workspaceId))['apify-shopee'], { dataCount: 0, lastDataAt: null,
    lastUsageAt: '2026-10-09T00:00:00.000Z' });
  const run = f.db.prepare('SELECT start_request_sha256 sha FROM analysis_research_automation_runs WHERE run_id=?').get(f.runId) as { sha: string };
  const start = JSON.parse((await f.artifacts.read(run.sha)).toString());
  assert.equal(start.reviewCollectionPolicy, undefined); assert.equal(start.privateShopeeSource, undefined);
});

test('policy27 retains optional valid PDF while authoritatively owning sample/HTML; altered adapter HTML refuses publication', async t => {
  const pdf = Buffer.from('%PDF-1.7\nSynthetic fixture only.');
  const good = await fixture(t, true, async (input, kind) => ({ ...buildResearchAutomationReport(input, kind), pdf }));
  await good.service.confirmScope(good.workspaceId, good.runId, good.confirm); await good.service.processNext(); await good.service.processNext();
  const original = await report(good);
  assert.equal(original.semantic.rendererVersion, 'automation-report-kit-v27');
  assert.deepEqual((await good.service.readReport(good.workspaceId, good.runId, 'INSIGHT', true)).bytes, pdf);
  assert.equal(original.semantic.reviewSample.products[2].retainedReviews, 300);
  const bad = await fixture(t, true, async (input, kind) => {
    const built = buildResearchAutomationReport(input, kind);
    return kind === 'INSIGHT' ? { ...built, html: Buffer.from('Untrusted replacement HTML'), pdf } : built;
  });
  await bad.service.confirmScope(bad.workspaceId, bad.runId, bad.confirm); await bad.service.processNext(); await bad.service.processNext();
  assert.equal((await bad.service.getRun(bad.workspaceId, bad.runId)).status, 'FAILED');
  assert.equal((await bad.service.listReportVersions(bad.workspaceId, bad.runId)).length, 0);
  assert.equal(bad.calls.filter(call => call.startsWith('POST')).length, 1);
});
