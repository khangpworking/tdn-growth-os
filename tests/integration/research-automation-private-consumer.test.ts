import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { ApifyShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { ShopeeCollectionService } from '../../src/modules/foundation/shopee-collection-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const now = () => new Date('2026-10-09T00:00:00.000Z');
const row = { reviewId: '101', authorId: '918273645', author: 'PRIVATE_AUTHOR_NAME', authorPortrait: 'PRIVATE_AVATAR',
  shopId: '2001', itemId: '3001', comment: 'Exact synthetic evidence.', ratingStar: 5, createdAt: '2024-01-02T00:00:00Z', region: 'VN' };
const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
async function allBytes(root: string): Promise<Buffer> {
  const buffers: Buffer[] = [];
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    const item = path.join(root, entry.name);
    buffers.push(entry.isDirectory() ? await allBytes(item) : await fs.readFile(item));
  }
  return Buffer.concat(buffers);
}
async function fixture(t: TestContext, status = 'SUCCEEDED', cancelled = false, mismatch = false, maxReviewsPerProduct = 20, withRenderer = true, reports: ('MARKET' | 'INSIGHT')[] = ['MARKET', 'INSIGHT']) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-consumer-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'private-source', title: 'Synthetic private source' });
  const privacy = createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId });
  const controller = new AbortController(); const calls: string[] = [];
  const { authorId: _author, ratingStar: _rating, ...absent } = row;
  const rows = [row, { ...row, reviewId: '102' }, { ...absent, reviewId: '103', comment: 'Second synthetic content.' },
    { ...row, reviewId: '104', authorId: 0, comment: 'Third synthetic content.', ratingStar: null },
    { ...row, reviewId: '105', ratingStar: 3.5, comment: 'Fourth synthetic content.' }];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/runs')) return Response.json({ data: { id: 'SyntheticRun01', defaultDatasetId: 'SyntheticData01',
      buildId: 'SyntheticBuild01', status, usageTotalUsd: 0.001, statusMessage: 'PRIVATE_STATUS authorId 918273645' } });
    assert.match(url.pathname, /\/datasets\/SyntheticData01\/items$/);
    if (cancelled) controller.abort();
    const offset = Number(url.searchParams.get('offset')); const limit = Number(url.searchParams.get('limit'));
    return Response.json(rows.slice(offset, offset + limit), { headers: { 'x-apify-pagination-total': String(rows.length) } });
  };
  const collector = new ApifyShopeeCollector({ token: 'synthetic-token', maxChargeUsd: 1, journalRoot: path.join(root, 'journal'),
    retainReturnedPages: true, maxReviewsPerProduct, fetch: transport }, mismatch
      ? createShopeePrivateIntake({ salt: Buffer.alloc(32, 8), keyId }) : privacy);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'synthetic-v1' }, privateShopee: { source: { contractVersion: 'automation-private-shopee-source-v1', profile: privacy.profile },
      factory: () => ({ collector, requestsIssued: () => calls.length }) }, ...(withRenderer ? { renderer: buildResearchAutomationReport } : {}) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'PRODUCT', keyword: 'Synthetic product', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    definition: 'Synthetic owner exact URL', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/2001/3001'] };
  return { root, db, artifacts, service, confirm, controller, calls };
}
async function semantic(f: Awaited<ReturnType<typeof fixture>>, pairId?: string) {
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
  return { report, value: JSON.parse((await f.artifacts.read(report.versionId)).toString()) };
}
function leakCheck(bytes: Buffer) {
  for (const forbidden of ['918273645', 'PRIVATE_AUTHOR_NAME', 'PRIVATE_AVATAR', 'PRIVATE_STATUS', 'synthetic-token', Buffer.alloc(32, 7).toString('hex')])
    assert.equal(bytes.includes(forbidden), false, forbidden);
}

test('actual configured fake collector -> Foundation3 -> frozen source set -> retained private corpus -> literal report/read', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  const confirmChanges = f.db.prepare('SELECT total_changes() n').get();
  assert.equal((await f.service.confirmScope(workspaceId, runId, f.confirm)).exactRetry, true);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), confirmChanges);
  await f.service.processNext(); await f.service.processNext();
  const first = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const original = await semantic(f, first.pairId);
  assert.equal(original.value.rendererVersion, 'automation-report-kit-v22');
  assert.equal(original.value.sourceEvidence.sourceAppendix.rows.some((r: { registryId: string }) => r.registryId === 'S05'), true);
  assert.equal(original.value.reviewCorpus, null); assert.equal(original.value.locatedReview, null);
  const view = original.value.privateReviewCorpus;
  assert.equal(view.contractVersion, 'private-review-report-view-v1'); assert.equal(view.records.length, 5);
  assert.deepEqual(view.records.map((r: { rating: { state: string } }) => r.rating.state), ['VALID', 'VALID', 'ABSENT', 'MISSING', 'INVALID']);
  assert.equal(view.records[4].rating.value, 3.5); assert.equal(view.records[0].createdAt, row.createdAt);
  assert.notEqual(view.records[0].recordId, view.records[1].recordId);
  const corpusBytes = await f.artifacts.read(view.corpus.artifactSha256);
  const corpus = JSON.parse(corpusBytes.toString());
  assert.equal(corpus.contractVersion, 'research-private-review-corpus-v2');
  assert.equal(corpus.binding.confirmedSourceSetSha256, original.value.confirmedSourceSetSha256);
  const source = await new ShopeeCollectionService(f.db, f.artifacts).readPrivateProjection(corpus.collection.collectionId);
  assert.equal(source.accounting.reportedAuthorHashes, 1); assert.equal(source.accounting.missingIdentityRecords, 1);
  assert.equal(source.accounting.invalidIdentityRecords, 1);
  assert.equal(f.calls.length, 2);
  leakCheck(await allBytes(path.join(f.root, 'artifacts'))); leakCheck(await allBytes(path.join(f.root, 'journal')));
  leakCheck(Buffer.from(JSON.stringify(await f.service.getRun(workspaceId, runId))));
  for (const forbidden of ['authorIdentity', 'keyCommitment', 'keyId', 'reportedAuthorHashes', 'privacy']) {
    assert.equal(JSON.stringify(original.value).includes(forbidden), false, forbidden); assert.equal(original.report.bytes.includes(forbidden), false);
  }
  let application: ReturnType<typeof openResearchAutomationApi> | undefined;
  const server = http.createServer((request, response) => application!.handler(request, response));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  application = openResearchAutomationApi({ databasePath: path.join(f.root, 'test.sqlite'), artifactRoot: path.join(f.root, 'artifacts'),
    origin, providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, pageIndex: { enabled: false } });
  try {
    const base = `/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    for (const route of [base, `${base}/report-versions`, `${base}/report-versions/${first.pairId}/reports/insight`]) {
      const response = await fetch(origin + route); assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer()); leakCheck(bytes);
      for (const forbidden of ['authorIdentity', 'keyCommitment', 'keyId', 'reportedAuthorHashes']) assert.equal(bytes.includes(forbidden), false);
    }
    const denied = await fetch(`${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-revisions`,
      { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(denied.status, 403); assert.equal(f.calls.length, 2);
  } finally { await application.close(); server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); }
  const request = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: first.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  await f.service.requestReportRevision(workspaceId, runId, request); await f.service.processNext();
  const current = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  const revised = await semantic(f, current.pairId);
  assert.equal(revised.value.rendererVersion, 'automation-report-kit-v22');
  assert.equal(revised.value.privateReviewCorpus.corpus.artifactSha256, view.corpus.artifactSha256);
  assert.equal(revised.value.insightLiteral.input.reviews.length, 5);
  assert.equal(revised.value.insightLiteral.duplicateTexts[0].recordPointers.length, 2);
  assert.equal(revised.value.insightLiteral.stars.absentField.recordCount, 1);
  assert.equal(revised.value.insightLiteral.stars.missingValue.recordCount, 1);
  assert.equal(revised.value.insightLiteral.stars.invalidValue.recordCount, 1);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.equal((await f.service.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
    now: () => { throw new Error('Replay must not request time'); } });
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'INSIGHT', false, current.pairId)).bytes, revised.report.bytes);
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'INSIGHT', false, first.pairId)).bytes, original.report.bytes);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(f.calls.length, 2);
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: randomUUID() }), /current/);
  const skip = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: current.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'SKIP' } } };
  await f.service.requestReportRevision(workspaceId, runId, skip); await f.service.processNext();
  const skipped = await semantic(f, (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId);
  assert.equal(skipped.value.privateReviewCorpus, undefined); assert.equal(skipped.value.insightLiteral, undefined);
  assert.equal(f.calls.length, 2); assert.equal(sha(JSON.parse(await f.artifacts.read(view.corpus.artifactSha256).then(b => b.toString()))), view.corpus.artifactSha256);
  const artifactPath = path.join(f.root, 'artifacts', 'sha256', view.corpus.artifactSha256.slice(0, 2), view.corpus.artifactSha256);
  await fs.writeFile(artifactPath, 'corrupt');
  await assert.rejects(reader.readReport(workspaceId, runId, 'INSIGHT', false, first.pairId));
});

test('service profile mismatch/failure/cancellation publishes no private corpus/report evidence or extra provider call', async t => {
  for (const mode of ['MISMATCH', 'FAILED', 'CANCELLED']) await t.test(mode, async t => {
    const f = await fixture(t, mode === 'FAILED' ? 'FAILED' : 'SUCCEEDED', mode === 'CANCELLED', mode === 'MISMATCH');
    await f.service.confirmScope(workspaceId, runId, f.confirm);
    await f.service.processNext(mode === 'CANCELLED' ? f.controller.signal : undefined);
    if (mode !== 'CANCELLED') await f.service.processNext();
    assert.equal((f.db.prepare('SELECT count(*) n FROM foundation_shopee_collections').get() as { n: bigint }).n, 0n);
    assert.equal(f.calls.length, mode === 'MISMATCH' ? 0 : 2);
    const run = await f.service.getRun(workspaceId, runId);
    if (run.status === 'DRAFT_READY') assert.equal((await semantic(f)).value.privateReviewCorpus, undefined);
    leakCheck(await allBytes(path.join(f.root, 'artifacts')));
    if (mode !== 'MISMATCH') leakCheck(await allBytes(path.join(f.root, 'journal')));
  });
});


test('service fail-closed retained source/marker/run/profile/collection/digest substitutions before read or retry', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const original = await semantic(f);
  const run = f.db.prepare('SELECT start_request_sha256 startSha,confirmed_source_set_sha256 sourceSha FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { startSha: string; sourceSha: string };
  const sourceSet = JSON.parse((await f.artifacts.read(run.sourceSha)).toString());
  const collectionRow = f.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { sha: string };
  const collection = JSON.parse((await f.artifacts.read(collectionRow.sha)).toString());
  async function put(value: unknown, mediaType = 'application/json') {
    const artifact = await f.artifacts.put(Buffer.from(canonicalJson(value)));
    f.db.prepare('INSERT INTO artifact_manifests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(artifact.sha256, artifact.byteSize, mediaType,
      artifact.relativePath, now().toISOString(), '1.0.0', 'active', now().toISOString());
    return artifact.sha256;
  }
  for (const change of ['OMITTED', 'KEY', 'PROFILE', 'NATIVE'] as const) {
    const tampered = structuredClone(sourceSet);
    if (change === 'OMITTED') delete tampered.privateShopeeSource;
    else if (change === 'KEY') tampered.privateShopeeSource.profile.keyId = workspaceId;
    else if (change === 'PROFILE') tampered.privateShopeeSource.profile.keyCommitment = 'f'.repeat(64);
    else tampered.nativeReview = { decision: 'RESOLVED', referenceSha256: 'f'.repeat(64) };
    const changed = await put(tampered);
    assert.throws(() => f.db.prepare('UPDATE analysis_research_automation_runs SET confirmed_source_set_sha256=? WHERE run_id=?').run(changed, runId), /immutable/);
    assert.throws(() => f.db.prepare('UPDATE analysis_research_automation_source_sets SET source_set_sha256=? WHERE run_id=?').run(changed, runId), /immutable/);
    const retainedPath = path.join(f.root, 'artifacts', 'sha256', run.sourceSha.slice(0, 2), run.sourceSha);
    const originalBytes = await fs.readFile(retainedPath);
    await fs.writeFile(retainedPath, canonicalJson(tampered));
    await assert.rejects(f.service.confirmScope(workspaceId, runId, f.confirm));
    await assert.rejects(f.service.readReport(workspaceId, runId, 'INSIGHT'));
    await fs.writeFile(retainedPath, originalBytes);
  }
  for (const change of ['RAW', 'NATIVE', 'COLLECTION', 'DIGEST', 'REQUEST'] as const) {
    const tampered = structuredClone(collection);
    if (change === 'RAW') { tampered.exactShopee = { ...tampered.privateShopee }; delete tampered.exactShopee.privateVersion; delete tampered.privateShopee; }
    else if (change === 'NATIVE') tampered.nativeReview = {};
    else if (change === 'COLLECTION') tampered.privateShopee.collectionId = keyId;
    else if (change === 'DIGEST') tampered.privateShopee.collectionSha256 = 'f'.repeat(64);
    else tampered.privateShopee.requestSha256 = 'f'.repeat(64);
    const changed = await put(tampered, 'application/vnd.tdn.research-automation.step+json');
    assert.throws(() => f.db.prepare("UPDATE analysis_research_automation_steps SET result_sha256=? WHERE run_id=? AND step_id='COLLECTION'").run(changed, runId), /settled/);
    const retainedPath = path.join(f.root, 'artifacts', 'sha256', collectionRow.sha.slice(0, 2), collectionRow.sha);
    const originalBytes = await fs.readFile(retainedPath);
    await fs.writeFile(retainedPath, canonicalJson(tampered));
    await assert.rejects(f.service.readReport(workspaceId, runId, 'INSIGHT'));
    await fs.writeFile(retainedPath, originalBytes);
  }
  const corpus = JSON.parse((await f.artifacts.read(original.value.privateReviewCorpus.corpus.artifactSha256)).toString());
  corpus.binding.runId = keyId;
  const { corpusId: _id, ...body } = corpus; corpus.corpusId = sha(body);
  const changedCorpus = await put(corpus);
  const badReport = { ...original.value, privateReviewCorpus: { ...original.value.privateReviewCorpus,
    corpus: { ...original.value.privateReviewCorpus.corpus, artifactSha256: changedCorpus, corpusId: corpus.corpusId } } };
  const changedReport = await put(badReport);
  assert.throws(() => f.db.prepare("UPDATE analysis_research_automation_outputs SET version_sha256=? WHERE run_id=? AND report_kind='INSIGHT'").run(changedReport, runId), /immutable/);
  const originalCorpusSha = original.value.privateReviewCorpus.corpus.artifactSha256;
  const corpusPath = path.join(f.root, 'artifacts', 'sha256', originalCorpusSha.slice(0, 2), originalCorpusSha);
  const originalCorpusBytes = await fs.readFile(corpusPath);
  await fs.writeFile(corpusPath, canonicalJson(corpus));
  await assert.rejects(f.service.readReport(workspaceId, runId, 'INSIGHT'));
  await fs.writeFile(corpusPath, originalCorpusBytes);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, original.report.bytes);
  assert.equal(f.calls.length, 2);
});


test('valid SUCCEEDED capped private capture stays PARTIAL/truncated and retains its exact corpus without another call', async t => {
  const f = await fixture(t, 'SUCCEEDED', false, false, 3);
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const run = await f.service.getRun(workspaceId, runId);
  const coverage = run.coverage.sources.find(source => source.provider === 'apify-shopee')!;
  assert.equal(coverage.state, 'PARTIAL'); assert.equal(coverage.truncated, true);
  const report = await semantic(f);
  const view = report.value.privateReviewCorpus;
  assert.equal(view.records.length, 3);
  const foundation = await new ShopeeCollectionService(f.db, f.artifacts).readExact(view.corpus.collectionId, { privacy: true });
  assert.equal(foundation.packet.actor.status, 'SUCCEEDED'); assert.equal(foundation.packet.actor.stopReason, 'collection_limit_reached');
  assert.equal(foundation.packet.actor.providerTotalRows, 5); assert.equal(foundation.packet.actor.settings.maxReviewsPerProduct, 3);
  assert.equal(foundation.pages.length, 1); assert.equal(JSON.parse(foundation.pages[0]!.bytes.toString()).length, 3);
  const corpusBytes = await f.artifacts.read(view.corpus.artifactSha256);
  assert.equal(JSON.parse(corpusBytes.toString()).projection.records.length, 3);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, report.report.bytes);
  assert.equal(await f.service.processNext(), false); assert.equal(f.calls.length, 2);
  leakCheck(await allBytes(path.join(f.root, 'artifacts'))); leakCheck(await allBytes(path.join(f.root, 'journal')));
});


test('private source-only renderer22 and literal replay work without an adapter; default coding stays unavailable without calls or writes', async t => {
  const f = await fixture(t, 'SUCCEEDED', false, false, 20, false);
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const first = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const original = await semantic(f, first.pairId);
  assert.equal(original.value.rendererVersion, 'automation-report-kit-v22');
  assert.equal(original.value.privateReviewCorpus.records.length, 5);
  const before = f.db.prepare('SELECT total_changes() n').get();
  await assert.rejects(f.service.readInsightSourceContext(workspaceId, runId, first.pairId), /no verified adopted review source/);
  let modelCalls = 0;
  const corpus = JSON.parse((await f.artifacts.read(original.value.privateReviewCorpus.corpus.artifactSha256)).toString());
  const request = { contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(),
    binding: { workspaceId, runId, pairId: first.pairId, scopeSha256: corpus.binding.scopeSha256,
      reportSha256: original.report.versionId, sourceKind: 'EXACT_SHOPEE', sourcePackageSha256: 'f'.repeat(64), inputSha256: 'e'.repeat(64) },
    defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] };
  await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, request, { actorId: 'owner:private-test', role: 'OWNER' },
    { configuration: { contractVersion: 'insight-model-configuration-v1', providerId: 'synthetic', modelId: 'fixture-model', temperature: null,
      maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 }, port: { async generateText() {
      modelCalls++; throw new Error('Private source must not dispatch default coding');
    } } }), /Insight source, rules or proposal changed/);
  assert.equal(modelCalls, 0); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1',
    requestKey: randomUUID(), previousPairId: first.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    literalInsight: { contractVersion: 'insight-literal-select-v1' } });
  await f.service.processNext();
  const current = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  const revised = await semantic(f, current.pairId);
  assert.equal(revised.value.rendererVersion, 'automation-report-kit-v22');
  assert.equal(revised.value.insightLiteral.input.reviews.length, 5);
  assert.equal(revised.value.privateReviewCorpus.corpus.artifactSha256, original.value.privateReviewCorpus.corpus.artifactSha256);
  assert.equal(revised.value.insightCoding, undefined);
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
    now: () => { throw new Error('Replay must not request time'); } });
  const replayChanges = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'INSIGHT', false, current.pairId)).bytes, revised.report.bytes);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), replayChanges);
  assert.equal(modelCalls, 0); assert.equal(f.calls.length, 2);
});

test('committed private literal and KEEP exact retries verify retained corpus and source pages without config, calls, time or writes', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const first = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const literal = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: first.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  await f.service.requestReportRevision(workspaceId, runId, literal); await f.service.processNext();
  const literalPair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  const keep = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: literalPair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  await f.service.requestReportRevision(workspaceId, runId, keep); await f.service.processNext();
  const keepPair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  const retained = await semantic(f, keepPair.pairId);
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1',
    requestKey: randomUUID(), previousPairId: keepPair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'SKIP' } } });
  await f.service.processNext();
  const skippedPair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.equal((await semantic(f, skippedPair.pairId)).value.privateReviewCorpus, undefined, 'current SKIP cannot replace historical private retry selection');
  const corpusSha = retained.value.privateReviewCorpus.corpus.artifactSha256;
  const corpus = JSON.parse((await f.artifacts.read(corpusSha)).toString());
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
    now: () => { throw new Error('Exact retry must not request time'); } });
  const changes = f.db.prepare('SELECT total_changes() n').get();
  const attempts = [{ request: literal, pairId: literalPair.pairId }, { request: keep, pairId: keepPair.pairId }];
  for (const attempt of attempts) assert.equal((await reader.requestReportRevision(workspaceId, runId, attempt.request)).exactRetry, true);
  for (const artifactSha of [corpusSha, corpus.projection.records[0].locator.pageSha256]) {
    const file = f.artifacts.pathForDigest(artifactSha);
    const bytes = await fs.readFile(file);
    await fs.writeFile(file, 'corrupt synthetic retained evidence');
    try {
      for (const attempt of attempts) {
        await assert.rejects(reader.readReport(workspaceId, runId, 'INSIGHT', false, attempt.pairId));
        await assert.rejects(reader.requestReportRevision(workspaceId, runId, attempt.request));
      }
      assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.calls.length, 2);
      if (artifactSha === corpusSha) {
        await assert.rejects(reader.requestReportRevision(workspaceId, runId, { ...literal, previousPairId: keepPair.pairId }), /request key is bound/);
        let application: ReturnType<typeof openResearchAutomationApi> | undefined;
        const server = http.createServer((request, response) => application!.handler(request, response));
        server.listen(0, '127.0.0.1'); await once(server, 'listening');
        const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        const token = 'SyntheticOwnerToken12345678901234567890';
        try {
          application = openResearchAutomationApi({ databasePath: path.join(f.root, 'test.sqlite'), artifactRoot: path.join(f.root, 'artifacts'),
            origin, providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, pageIndex: { enabled: false },
            owner: { writeEnabled: true, databasePath: path.join(f.root, 'test.sqlite'), artifactRoot: path.join(f.root, 'artifacts'),
              allowedOrigin: origin, actorId: 'synthetic:owner', token } });
          const fingerprint = () => {
            const tables = f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
            return JSON.stringify(tables.map(({ name }) => [name, f.db.prepare(`SELECT * FROM "${name}"`).all()]),
              (_, value) => typeof value === 'bigint' ? value.toString() : value);
          };
          const beforeApi = fingerprint();
          for (const attempt of attempts) {
            const response = await fetch(`${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-revisions`,
              { method: 'POST', headers: { Origin: origin, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(attempt.request) });
            assert.equal(response.status, 500);
            assert.equal((await response.json()).error.code, 'integrity_error');
          }
          assert.equal(fingerprint(), beforeApi); assert.equal(f.calls.length, 2);
        } finally {
          if (application) await application.close();
          server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
        }
      }
    } finally { await fs.writeFile(file, bytes); }
  }
  for (const attempt of attempts) assert.equal((await reader.requestReportRevision(workspaceId, runId, attempt.request)).exactRetry, true);
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'INSIGHT', false, keepPair.pairId)).bytes, retained.report.bytes);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.calls.length, 2);
});


test('committed Market-only private revision retries require no Insight report or runtime configuration', async t => {
  const f = await fixture(t, 'SUCCEEDED', false, false, 20, false, ['MARKET']);
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const first = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const request = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: first.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  await f.service.requestReportRevision(workspaceId, runId, request); await f.service.processNext();
  const pair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.deepEqual(pair.outputs.map(output => output.kind), ['MARKET']);
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
    now: () => { throw new Error('Market-only retry must not request time'); } });
  const changes = f.db.prepare('SELECT total_changes() n').get();
  assert.equal((await reader.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.calls.length, 2);
});
