import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { insightCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { insightCodingDigest } from '../../src/modules/analysis/research-automation/insight-default-coding.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';
import type { InsightProposedAnnotations } from '../../contracts/analysis/automation-insight-coding.generated.js';
import type { InsightPrivateDefaultModelRequest } from '../../contracts/analysis/automation-insight-model.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const keyId = '33333333-3333-4333-8333-333333333333';
const owner = { actorId: 'owner:private-default', role: 'OWNER' as const };
const now = () => new Date('2026-10-09T00:00:00.000Z');
const configuration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic', modelId: 'private-fixture',
  temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 };
const row = { reviewId: '101', shopId: '2001', itemId: '3001', comment: 'Exact tasty size.', ratingStar: 5,
  authorId: '918273645', author: 'PRIVATE_AUTHOR_NAME', authorPortrait: 'PRIVATE_AVATAR', region: 'VN' };
const empty = (): InsightProposedAnnotations => ({ i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] });

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-default-service-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db, artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'private-default', title: 'Synthetic private coding' });
  const privacy = createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId });
  const { ratingStar: _rating, ...absent } = row;
  const rawRows = [row, row, { ...row, reviewId: '102' }, { ...row, reviewId: '103', comment: '  ' },
    { ...row, reviewId: '104', comment: null, ratingStar: null }, { ...absent, reviewId: '105' },
    { ...row, reviewId: '106', ratingStar: 3.5 }, { ...row, reviewId: '107', itemId: '3999' }, { ...row, reviewId: '108', shopId: null }];
  const collector = new FixtureShopeeCollector(Buffer.from(JSON.stringify(rawRows)), privacy); let collectionCalls = 0;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(artifactRoot), uuid: () => runId, now,
    privateShopee: { source: { contractVersion: 'automation-private-shopee-source-v1', profile: privacy.profile }, factory: () => ({ requestsIssued: () => 0,
      collector: { mode: collector.mode, privacyProfile: collector.privacyProfile, collect: async (...args) => { collectionCalls++; return collector.collect(...args); } } }) } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT',
    keyword: 'Synthetic private coding', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic owner exact source', includeTerms: [], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], exactShopeeUrls: ['https://shopee.vn/product/2001/3001'] });
  await service.processNext(); await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  const original = await service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  const semantic = JSON.parse((await artifacts.read(original.versionId)).toString());
  const corpus = JSON.parse((await artifacts.read(semantic.privateReviewCorpus.corpus.artifactSha256)).toString());
  const forbidden = ['918273645', 'PRIVATE_AUTHOR_NAME', 'PRIVATE_AVATAR', 'authorIdentity', 'reportedAuthorHashes', 'keyId', keyId,
    'keyCommitment', privacy.profile.keyCommitment, corpus.projection.records[0].authorIdentity.hash, 'privacy', 'reviewId', 'profileVersion'];
  const scan = (value: unknown) => {
    const bytes = Buffer.isBuffer(value) ? value.toString('utf8') : JSON.stringify(value);
    for (const token of forbidden) assert.equal(bytes.includes(token), false, token);
  };
  const reader = () => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(artifactRoot), now: () => { throw new Error('Settled retry/read must not request time'); } });
  return { root, databasePath, artifactRoot, db, artifacts, service, reader, pair, original, semantic, corpus, scan, collectionCalls: () => collectionCalls };
}

async function committed(f: Awaited<ReturnType<typeof fixture>>, attemptId: string) {
  for (let at = 0; at < 10; at++) {
    await f.service.processNext();
    const attempt = await f.service.getReportRevision(workspaceId, runId, attemptId);
    assert.notEqual(attempt.state, 'FAILED', JSON.stringify(attempt));
    if (attempt.state === 'COMMITTED') return (await f.service.listReportVersions(workspaceId, runId)).find(pair => pair.attemptId === attemptId)!;
  }
  throw new Error('Private coding revision did not commit');
}

const privateRequest = (binding: InsightPrivateDefaultModelRequest['binding'], indexes = [0, 2]): InsightPrivateDefaultModelRequest => ({
  contractVersion: 'insight-default-model-request-v2', requestKey: randomUUID(), binding, defaultRuleId: null, defaultRuleSha256: null,
  previousProposalId: null, previousProposalSha256: null, recordIndexes: indexes });

function fingerprint(f: Awaited<ReturnType<typeof fixture>>) {
  const names = f.db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return JSON.stringify(names.map(({ name }) => [name, f.db.prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`).all()]),
    (_key, value) => typeof value === 'bigint' ? value.toString() : value);
}

function candidates(userText: string) {
  const payload = JSON.parse(userText), annotations = empty();
  const code = payload.corpora[0].codes.find((entry: { code: string }) => entry.code === 'C1');
  annotations.corpora.push({ corpusIndex: 0, assignments: payload.records.map((record: { recordIndex: number; record: { text: string } }) => ({
    recordIndex: record.recordIndex, code: 'C1', span: locatedSpan(record.record.text, 'tasty size'),
    provenance: { basis: 'PENDING_AI', coderRole: 'synthetic', adjudication: null, disagreement: null } })),
    dispositions: payload.records.map((record: { recordIndex: number }) => ({ recordIndex: record.recordIndex, state: 'CODED',
      provenance: { basis: 'PENDING_AI', coderRole: 'synthetic', adjudication: null, disagreement: null } })) });
  const first = payload.records[0];
  return { codebooks: code ? [] : [{ corpusIndex: 0, codes: [{ code: 'C1', label: 'tasty size', phrase: 'tasty size',
    firstRecordIndex: first.recordIndex, firstSpan: locatedSpan(first.record.text, 'tasty size') }] }], annotations };
}

// This test follows the owning chain; it is not source-helper acceptance or a live model quality claim.
test('authentic private source22 -> no-adoption default model-v2 -> immutable pending snapshot5/report25 -> exact read/retry without calls or writes', async t => {
  const f = await fixture(t);
  assert.equal(f.semantic.rendererVersion, 'automation-report-kit-v22');
  const context = await f.service.readInsightSourceContext(workspaceId, runId, f.pair.pairId);
  assert.equal(context.binding.sourceKind, 'PRIVATE_SHOPEE');
  if (context.binding.sourceKind !== 'PRIVATE_SHOPEE') throw new Error('Wrong source fixture');
  assert.equal(context.binding.contractVersion, 'insight-source-binding-v2');
  assert.deepEqual(context.binding.corpus, f.semantic.privateReviewCorpus.corpus);
  assert.equal(context.binding.projectionSha256, insightCodingDigest(context.privateSource));
  assert.equal(context.binding.inputSha256, insightCodingDigest(context.input));
  assert.deepEqual(context.input.records.map(record => record.disposition), ['INCLUDED', 'EXCLUDED', 'INCLUDED', 'EXCLUDED', 'UNREADABLE', 'INCLUDED', 'INCLUDED', 'EXCLUDED', 'EXCLUDED']);
  f.scan(context);
  let modelCalls = 0; const captures: { userText: string; systemText: string }[] = [];
  const ai = { configuration, port: { async generateText(value: { userText: string; systemText: string }) {
    modelCalls++; captures.push(value); f.scan(value);
    const input = JSON.parse(value.userText);
    assert.equal(input.contractVersion, 'insight-model-input-v2');
    assert.deepEqual(input.sourceMembership.map((record: { rating: unknown }) => record.rating), f.semantic.privateReviewCorpus.records.map((record: { rating: unknown }) => record.rating));
    assert.equal(input.sourceMembership[1].duplicateOfRecordIndex, 0);
    assert.deepEqual(input.sourceMembership.map((record: { disposition: string }) => record.disposition), context.input.records.map(record => record.disposition));
    assert.match(value.systemText, /Private Shopee source projection-v1/);
    return { text: JSON.stringify(candidates(value.userText)) };
  } } };
  const body = privateRequest(context.binding);
  const first = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, body, owner, ai);
  assert.equal(first.execution.status, 'VALID'); assert.ok(first.proposal);
  assert.equal(first.proposal.evidence.contractVersion, 'insight-coding-default-evidence-v2');
  assert.equal(first.proposal.evidence.request.contractVersion, 'insight-coding-default-propose-v2');
  const view = await f.service.readInsightCoding(workspaceId, runId, f.pair.pairId);
  assert.equal(view.contractVersion, 'insight-coding-view-v3');
  assert.equal(view.evidence.filter(item => item.kind === 'ADOPTION' || item.kind === 'RECEIPT').length, 0);
  assert.equal(view.evidence.filter(item => item.kind === 'DEFAULT_RULE').length, 1); f.scan(view); f.scan(first.proposal);
  const beforeRetry = fingerprint(f);
  const retry = await f.reader().proposeDefaultModelInsightCoding(workspaceId, runId, body, owner, null);
  assert.equal(retry.proposal!.exactRetry, true); assert.equal(fingerprint(f), beforeRetry); assert.equal(modelCalls, 1);
  assert.deepEqual(await f.reader().readInsightCoding(workspaceId, runId, f.pair.pairId), view);
  const revision = { contractVersion: 'automation-insight-default-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: { contractVersion: 'insight-default-draft-select-v1',
      proposalId: first.proposal.evidence.evidenceId, proposalSha256: first.proposal.sha256 } };
  const receipt = await f.service.requestReportRevision(workspaceId, runId, revision), pair = await committed(f, receipt.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v25');
  assert.equal(semantic.insightCoding.contractVersion, 'automation-insight-coding-snapshot-v5');
  assert.deepEqual(semantic.insightCoding.binding, context.binding);
  assert.deepEqual(semantic.insightCoding.privateSource, context.privateSource);
  assert.deepEqual(semantic.insightCoding.receipts, []);
  assert.equal(semantic.insightCoding.groupCounts.rates, null);
  assert.equal(semantic.insightCoding.output.sections.I10.corpora[0].draftCounts[0].recordCount, 2);
  assert.equal(semantic.insightCoding.output.sections.I10.corpora[0].counts[0].recordCount, 0);
  assert.match(report.bytes.toString(), /đề xuất, chờ chủ duyệt/); f.scan(report.bytes); f.scan(semantic);
  const retained = f.db.prepare('SELECT admission_sha256,input_sha256,prompt_sha256,candidates_sha256 FROM analysis_research_automation_ai_executions WHERE execution_id=?')
    .get(first.execution.executionId) as { admission_sha256: string; input_sha256: string; prompt_sha256: string; candidates_sha256: string };
  for (const digest of Object.values(retained)) f.scan(await f.artifacts.read(digest));
  assert.equal(JSON.parse((await f.artifacts.read(retained.admission_sha256)).toString()).contractVersion, 'insight-default-model-source-v2');
  assert.equal(JSON.parse((await f.artifacts.read(retained.prompt_sha256)).toString()).contractVersion, 'insight-model-prompt-v6');
  const settled = fingerprint(f);
  assert.deepEqual(await f.reader().readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId), report);
  assert.deepEqual(await f.reader().readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId), f.original);
  assert.equal((await f.reader().requestReportRevision(workspaceId, runId, revision)).exactRetry, true);
  assert.equal(fingerprint(f), settled); assert.equal(modelCalls, 1); assert.equal(f.collectionCalls(), 1);
  const keep = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  const kept = await committed(f, (await f.service.requestReportRevision(workspaceId, runId, keep)).attemptId);
  const inherited = await f.reader().readReport(workspaceId, runId, 'INSIGHT', false, kept.pairId);
  assert.deepEqual(JSON.parse((await f.artifacts.read(inherited.versionId)).toString()).insightCoding, semantic.insightCoding);
  assert.equal(modelCalls, 1); assert.equal(f.collectionCalls(), 1);
});

test('private coding rejects binding/locator/membership/CAS substitutions before dispatch or ledger mutation', async t => {
  const f = await fixture(t), context = await f.service.readInsightSourceContext(workspaceId, runId, f.pair.pairId);
  if (context.binding.sourceKind !== 'PRIVATE_SHOPEE') throw new Error('Wrong source fixture');
  const body = privateRequest(context.binding); let calls = 0;
  const ai = { configuration, port: { async generateText() { calls++; throw new Error('Invalid source must not dispatch'); } } };
  const before = fingerprint(f);
  for (const field of ['workspaceId', 'runId', 'pairId', 'scopeSha256', 'reportSha256', 'sourcePackageSha256', 'inputSha256', 'projectionSha256'] as const) {
    const value = field === 'workspaceId' || field === 'runId' ? randomUUID() : '0'.repeat(64);
    await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, { ...body, binding: { ...body.binding, [field]: value } }, owner, ai));
    assert.equal(fingerprint(f), before);
  }
  for (const field of ['artifactSha256', 'corpusId', 'collectionId', 'collectionSha256', 'requestSha256'] as const) {
    const value = field === 'collectionId' ? randomUUID() : '0'.repeat(64);
    await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, { ...body, binding: { ...body.binding, corpus: { ...body.binding.corpus, [field]: value } } }, owner, ai));
    assert.equal(fingerprint(f), before);
  }
  for (const recordIndexes of [[1], [3], [4], [7], [8], [999]]) {
    await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, { ...body, recordIndexes }, owner, ai));
    assert.equal(fingerprint(f), before);
  }
  await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, { ...body, contractVersion: 'insight-default-model-request-v1' }, owner, ai));
  assert.equal(fingerprint(f), before); assert.equal(calls, 0);
  for (const digest of [context.binding.corpus.artifactSha256, f.corpus.projection.records[0].locator.pageSha256]) {
    const file = path.join(f.artifactRoot, 'sha256', digest.slice(0, 2), digest), saved = await fs.readFile(file);
    await fs.writeFile(file, 'synthetic corruption');
    try {
      await assert.rejects(f.service.readInsightSourceContext(workspaceId, runId, f.pair.pairId));
      await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, body, owner, ai));
      assert.equal(fingerprint(f), before); assert.equal(calls, 0);
    } finally { await fs.writeFile(file, saved); }
  }
  assert.deepEqual(await f.reader().readInsightSourceContext(workspaceId, runId, f.pair.pairId), context);
});


test('authenticated OWNER private default HTTP action uses exact version2 source, pending proposal and explicit report25; reads/retries stay query-only', { timeout: 120000 }, async t => {
  const f = await fixture(t); let calls = 0;
  const gateway = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(Buffer.from(chunk)));
    request.on('end', () => {
      calls++;
      const envelope = JSON.parse(Buffer.concat(chunks).toString());
      f.scan(envelope);
      const userText = envelope.messages[1].content;
      assert.equal(JSON.parse(userText).contractVersion, 'insight-model-input-v2');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(candidates(userText)) } }] }));
    });
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  const server = http.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const token = 'synthetic-private-owner-token-abcdefghijklmnopqrstuvwxyz123456';
  const application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: owner.actorId },
    insightCoding: { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-private-coding-key-123456' },
      configuration: insightCodingCliproxyConfiguration('synthetic-private-model') } });
  server.on('request', application.handler);
  const read = `${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
  const write = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
  const post = (action: string, body: unknown, authorized = true, suppliedOrigin = origin) => fetch(`${write}/${action}`, {
    method: 'POST', headers: { Origin: suppliedOrigin, 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  try {
    const contextResponse = await fetch(`${read}/insight-coding/${f.pair.pairId}`); assert.equal(contextResponse.status, 200);
    const view = await contextResponse.json(); f.scan(view); assert.equal(view.contractVersion, 'insight-coding-view-v3');
    const body = privateRequest(view.context.binding);
    assert.equal((await post('insight-coding-default-model-proposals', body, false)).status, 401);
    assert.equal((await post('insight-coding-default-model-proposals', body, true, 'http://wrong-origin.invalid')).status, 403);
    assert.equal((await post('insight-coding-model-proposals', body)).status, 400);
    assert.equal((await post('insight-coding-default-model-proposals', { ...body, contractVersion: 'insight-default-model-request-v1' })).status, 400);
    const before = fingerprint(f);
    assert.equal((await post('insight-coding-default-model-proposals', { ...body, binding: { ...body.binding, projectionSha256: '0'.repeat(64) } })).status, 409);
    assert.equal(fingerprint(f), before); assert.equal(calls, 0);
    const proposedResponse = await post('insight-coding-default-model-proposals', body); assert.equal(proposedResponse.status, 201);
    const proposed = await proposedResponse.json(); f.scan(proposed); assert.equal(proposed.status, 'PROPOSED');
    const fresh = await (await fetch(`${read}/insight-coding/${f.pair.pairId}`)).json(); f.scan(fresh);
    const proposal = fresh.evidence.find((item: { evidenceId: string }) => item.evidenceId === proposed.proposal.evidenceId);
    assert.equal(proposal.request.contractVersion, 'insight-coding-default-propose-v2');
    assert.equal(fresh.evidence.filter((item: { kind: string }) => item.kind === 'ADOPTION' || item.kind === 'RECEIPT').length, 0);
    const settledModel = fingerprint(f);
    const replay = await post('insight-coding-default-model-proposals', body); assert.equal(replay.status, 200);
    assert.equal((await replay.json()).proposal.exactRetry, true); assert.equal(fingerprint(f), settledModel); assert.equal(calls, 1);
    const revision = { contractVersion: 'automation-insight-default-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: { contractVersion: 'insight-default-draft-select-v1',
        proposalId: proposal.evidenceId, proposalSha256: proposal.sha256 } };
    const rejected = await post('report-revisions', { ...revision, defaultInsight: { ...revision.defaultInsight, proposalSha256: '0'.repeat(64) } });
    assert.equal(rejected.status, 400); assert.equal(fingerprint(f), settledModel);
    const receiptResponse = await post('report-revisions', revision); assert.equal(receiptResponse.status, 202);
    const receipt = await receiptResponse.json(); let pairId: string | undefined;
    for (let at = 0; at < 100; at++) {
      const attempt = await (await fetch(`${read}/report-attempts/${receipt.attemptId}`)).json();
      assert.notEqual(attempt.state, 'FAILED', JSON.stringify(attempt));
      if (attempt.state === 'COMMITTED') { pairId = attempt.pairId; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(pairId);
    const htmlResponse = await fetch(`${read}/report-versions/${pairId}/reports/insight`); assert.equal(htmlResponse.status, 200);
    const html = Buffer.from(await htmlResponse.arrayBuffer()); f.scan(html); assert.match(html.toString(), /đề xuất, chờ chủ duyệt/);
    const current = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
    const semantic = JSON.parse((await f.artifacts.read(current.versionId)).toString());
    assert.equal(semantic.rendererVersion, 'automation-report-kit-v25'); f.scan(semantic);
    const settled = fingerprint(f);
    assert.equal((await post('report-revisions', revision)).status, 200);
    assert.deepEqual(Buffer.from(await (await fetch(`${read}/report-versions/${pairId}/reports/insight`)).arrayBuffer()), html);
    assert.equal(fingerprint(f), settled); assert.equal(calls, 1); assert.equal(f.collectionCalls(), 1);
    const corpusDigest = semantic.privateReviewCorpus.corpus.artifactSha256;
    const corpusFile = path.join(f.artifactRoot, 'sha256', corpusDigest.slice(0, 2), corpusDigest), saved = await fs.readFile(corpusFile);
    await fs.writeFile(corpusFile, 'synthetic corrupted retained corpus');
    try {
      assert.equal((await fetch(`${read}/report-versions/${pairId}/reports/insight`)).status, 500);
      assert.equal((await post('report-revisions', revision)).status, 500);
      assert.equal((await post('insight-coding-default-model-proposals', body)).status, 500);
      assert.equal(fingerprint(f), settled); assert.equal(calls, 1);
    } finally { await fs.writeFile(corpusFile, saved); }
    assert.deepEqual(Buffer.from(await (await fetch(`${read}/report-versions/${pairId}/reports/insight`)).arrayBuffer()), html);
  } finally {
    await application.close(); server.closeAllConnections(); gateway.closeAllConnections();
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => gateway.close(() => resolve()))]);
  }
});
