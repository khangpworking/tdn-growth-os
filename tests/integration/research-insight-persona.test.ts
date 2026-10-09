import type { PersonaModelRequest } from '../../contracts/analysis/automation-insight-persona.generated.js';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import { insightCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { personaPendingPipeline, personaServiceRows, personaIndexes, PERSONA_KEY } from '../helpers/insight-persona-service-fixture.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { personaServiceFixture, personaStageRequest, personaFixtureResponse, personaOwner, personaConfiguration,
  PERSONA_WORKSPACE, PERSONA_RUN } from '../helpers/insight-persona-service-fixture.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { personaResponseValid } from '../../src/modules/analysis/research-automation/insight-persona-contracts.js';

test('actual source22 -> no-adoption taxonomy/classification -> three source-qualified pending personas; exact retained read/retry and old report stay unchanged', async t => {
  const f = await personaServiceFixture(t); let calls = 0;
  const ai = { configuration: personaConfiguration, port: { async generateText({ userText }: { userText: string }) {
    calls++; const input = JSON.parse(userText);
    for (const field of ['authorId', 'authorIdentity', 'keyId', 'profileUrl', 'reviewId']) assert.equal(userText.includes(`"${field}"`), false);
    return { text: JSON.stringify(personaFixtureResponse(input, f.context.source)) };
  } } };
  const first = personaStageRequest(f.context.binding); first.recordIndexes = personaIndexes(f.context.source.taxonomySample.recordIndexes);
  const taxonomy = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, first, personaOwner, ai);
  assert.equal(personaResponseValid(taxonomy), true); assert.equal(taxonomy.status, 'PROPOSED');
  if (taxonomy.status !== 'PROPOSED' || taxonomy.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Taxonomy unavailable');
  const second = personaStageRequest(f.context.binding, taxonomy.proposal, 'CLASSIFY'); second.recordIndexes = personaIndexes(f.context.source.eligibleRecordIndexes);
  const classified = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, second, personaOwner, ai);
  if (classified.status !== 'PROPOSED' || classified.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Classification unavailable');
  assert.equal(classified.proposal.evidence.snapshot.classificationComplete, true);
  const third = personaStageRequest(f.context.binding, classified.proposal, 'SYNTHESIZE');
  const result = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, third, personaOwner, ai);
  if (result.status !== 'PROPOSED' || result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Synthesis unavailable');
  const snapshot = result.proposal.evidence.snapshot;
  assert.equal(snapshot.personas.length, 3); assert.equal(snapshot.cards.length, 9);
  for (const persona of snapshot.personas) {
    assert.equal(persona.sampleSizeLabel, '6/18 bản ghi trong mẫu — đề xuất, chờ chủ duyệt');
    assert.equal(persona.authorEvidence, 'MET_WITH_SOURCE_AUTHOR_PROOF'); assert.equal(persona.releaseEligibility, 'UNAVAILABLE');
    assert.equal(persona.label, 'Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật');
  }
  const view = await f.service.listPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, f.pair.pairId);
  assert.equal(view.evidence.length, 4); assert.equal(view.evidence[0]!.evidence.contractVersion, 'insight-persona-rule-evidence-v1');
  assert.equal(calls, 3); assert.equal(f.collectorCalls(), 1);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, first, personaOwner, null), taxonomy);
  assert.deepEqual(await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, third, personaOwner, null), result);
  assert.deepEqual(await f.service.readPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, result.proposal.evidence.evidenceId), result.proposal);
  assert.deepEqual(await f.service.readReport(PERSONA_WORKSPACE, PERSONA_RUN, 'INSIGHT', false, f.pair.pairId), f.oldReport);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(calls, 3);
  assert.equal(canonicalJson(view).includes('PRIVATE_AUTHOR'), false);
});

test('missing model configuration and wrong source/owner/key fail before dispatch or mutation; invalid/unknown outcomes never retry a call', async t => {
  const f = await personaServiceFixture(t);
  const request = personaStageRequest(f.context.binding); request.recordIndexes = personaIndexes(f.context.source.taxonomySample.recordIndexes);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, personaOwner, null),
    { contractVersion: 'insight-persona-model-response-v1', status: 'NOT_DISPATCHED', reason: 'AI_NOT_CONFIGURED' });
  let calls = 0; const ai = { configuration: personaConfiguration, port: { async generateText() { calls++; return { text: '{}' }; } } };
  for (const key of ['workspaceId', 'runId', 'startSha256', 'scopeSha256', 'confirmedSourceSetSha256', 'pairId', 'semanticSha256', 'corpusSha256',
    'collectionId', 'collectionSha256', 'sourceRequestSha256', 'viewSha256', 'sourceSha256'] as const) {
    const binding = { ...request.binding, [key]: key.endsWith('Id') && key !== 'pairId' ? 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' : 'f'.repeat(64) };
    await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, { ...request, binding }, personaOwner, ai));
  }
  await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, { ...request, recordIndexes: [1, 0] }, personaOwner, ai));
  await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, { ...personaOwner, role: 'MEMBER' } as never, ai));
  await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, { ...request, semantic: {} }, personaOwner, ai));
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(calls, 0);
  const invalid = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, personaOwner, ai);
  assert.equal(invalid.status, 'INVALID'); assert.equal(calls, 1);
  const settled = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, personaOwner, null), invalid);
  await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, { ...personaOwner, actorId: 'another-owner' }, ai));
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), settled); assert.equal(calls, 1);
  const unknownRequest = personaStageRequest(f.context.binding); unknownRequest.recordIndexes = request.recordIndexes;
  const unknown = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, unknownRequest, personaOwner,
    { configuration: personaConfiguration, port: { async generateText() { calls++; throw new Error('Synthetic ambiguous response'); } } });
  assert.equal(unknown.status, 'DISPATCH_UNKNOWN');
  const afterUnknown = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, unknownRequest, personaOwner, null), unknown);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), afterUnknown); assert.equal(calls, 2);
});

test('fresh cold configless query-only source/evidence/list/retry uses no clock/workspace/provider/model/collector/CAS puts and all new artifacts stay private-identity-free', async t => {
  const f = await personaServiceFixture(t), pipeline = await personaPendingPipeline(f);
  const before = f.db.prepare('SELECT total_changes() n').get();
  const coldDb = new BetterSqlite3(f.databasePath); coldDb.pragma('query_only = ON'); coldDb.pragma('foreign_keys = ON');
  const artifacts = new ContentAddressedArtifactStore(f.artifactRoot), staging = new RequestScopedArtifactStore(f.artifactRoot);
  let attemptedPuts = 0, unexpected = 0;
  const unavailable = () => { unexpected++; throw new Error('Cold read accessed runtime dependency'); };
  artifacts.put = async () => { attemptedPuts++; throw new Error('Cold CAS put'); };
  staging.put = async () => { attemptedPuts++; throw new Error('Cold staging put'); };
  const service = new ResearchAutomationService({ db: coldDb, artifactStore: artifacts, metricAttachmentStore: staging,
    workspaceReader: { readVerifiedWorkspace: async () => unavailable() }, now: unavailable, uuid: unavailable,
    renderer: unavailable, shopeeCollectorFactory: unavailable });
  try {
    const coldChanges = coldDb.prepare('SELECT total_changes() n').get();
    assert.deepEqual(await service.readPersonaSourceContext(PERSONA_WORKSPACE, PERSONA_RUN, f.pair.pairId), f.context);
    const view = await service.listPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, f.pair.pairId);
    assert.equal(view.evidence.length, 4);
    for (const [index, request] of pipeline.requests.entries())
      assert.deepEqual(await service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, personaOwner, null), pipeline.responses[index]);
    assert.deepEqual(await service.readPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.result.proposal.evidence.evidenceId), pipeline.result.proposal);
    assert.deepEqual(await service.readReport(PERSONA_WORKSPACE, PERSONA_RUN, 'INSIGHT', false, f.pair.pairId), f.oldReport);
    assert.deepEqual(coldDb.prepare('SELECT total_changes() n').get(), coldChanges);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(attemptedPuts, 0); assert.equal(unexpected, 0);
    const semantic = JSON.parse((await artifacts.read(f.oldReport.versionId)).toString());
    const corpus = JSON.parse((await artifacts.read(semantic.privateReviewCorpus.corpus.artifactSha256)).toString());
    const secrets = [PERSONA_KEY, f.privacy.profile.keyCommitment, 'PRIVATE_AUTHOR', 'PRIVATE_PROFILE',
      ...personaServiceRows().flatMap(row => [row.authorId, row.reviewId]), ...corpus.projection.records.map((row: { authorIdentity: { hash: string } }) => row.authorIdentity.hash)];
    const executionRows = coldDb.prepare(`SELECT admission_sha256, input_sha256, prompt_sha256, configuration_sha256, candidates_sha256
      FROM analysis_research_automation_ai_executions WHERE section_id='INSIGHT_CODING'`).all() as Record<string, string>[];
    const buffers: Buffer[] = [Buffer.from(canonicalJson(view)), ...pipeline.captured.map(value => Buffer.from(value))];
    for (const row of executionRows) for (const sha of Object.values(row)) buffers.push(await artifacts.read(sha));
    for (const entry of view.evidence) buffers.push(await artifacts.read(entry.sha256));
    for (const bytes of buffers) for (const secret of secrets) assert.equal(bytes.includes(secret), false, secret);
    assert.equal(pipeline.modelCalls(), 3); assert.equal(f.collectorCalls(), 1);
  } finally { coldDb.close(); }
});

test('owning reads fail closed on source/manifest/candidate/proposal CAS corruption and cross-run/root/proposal/key bindings before calls/writes', async t => {
  const f = await personaServiceFixture(t), pipeline = await personaPendingPipeline(f);
  const request = pipeline.requests[2]!;
  const before = f.db.prepare('SELECT total_changes() n').get(); let calls = 0;
  const ai = { configuration: personaConfiguration, port: { async generateText() { calls++; return { text: '{}' }; } } };
  for (const change of [{ requestKey: pipeline.requests[0]!.requestKey }, { rootId: pipeline.result.proposal.evidence.evidenceId },
    { rootSha256: 'f'.repeat(64) }, { previousProposalId: pipeline.result.proposal.evidence.evidenceId },
    { previousProposalSha256: 'f'.repeat(64) }])
    await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, { ...request, requestKey: randomUUID(), ...change }, personaOwner, ai));
  await assert.rejects(f.service.readPersonaEvidence(PERSONA_WORKSPACE, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pipeline.result.proposal.evidence.evidenceId));
  await assert.rejects(f.service.readPersonaEvidence('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', PERSONA_RUN, pipeline.result.proposal.evidence.evidenceId));
  const row = f.db.prepare('SELECT candidates_sha256, admission_sha256 FROM analysis_research_automation_ai_executions WHERE execution_id=?')
    .get(pipeline.result.executionId) as { candidates_sha256: string; admission_sha256: string };
  for (const sha of [f.context.source.corpus.artifactSha256, f.context.source.records[0]!.locator.pageSha256,
    row.candidates_sha256, row.admission_sha256, pipeline.result.proposal.sha256]) {
    const original = await f.artifacts.read(sha);
    await fs.writeFile(f.artifacts.pathForDigest(sha), 'synthetic CAS corruption');
    await assert.rejects(f.service.readPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, pipeline.result.proposal.evidence.evidenceId));
    await assert.rejects(f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, personaOwner, ai));
    await fs.writeFile(f.artifacts.pathForDigest(sha), original);
  }
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(calls, 0); assert.equal(pipeline.modelCalls(), 3);
});

test('authenticated OWNER stage API reaches only fake configured model; exact pair/list/evidence and retry work without Metric/profile intake, wrong token/schema/old route reject', { timeout: 120000 }, async t => {
  const f = await personaServiceFixture(t); let calls = 0;
  const captured: string[] = [];
  const gateway = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', chunk => chunks.push(chunk)).on('end', () => {
      calls++; const envelope = JSON.parse(Buffer.concat(chunks).toString()); captured.push(envelope.messages[1].content);
      assert.equal(envelope.model, 'synthetic-persona-api');
      const modelInput = JSON.parse(envelope.messages[1].content);
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify(personaFixtureResponse(modelInput, f.context.source)) } }] }));
    });
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  let application: ReturnType<typeof openResearchAutomationApi> | undefined;
  const server = http.createServer((request, response) => application!.handler(request, response));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token = 'synthetic-persona-owner-token-abcdefghijklmnopqrstuvwxyz123456';
  application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: personaOwner.actorId },
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    insightCoding: { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-persona-key-123456' },
      configuration: insightCodingCliproxyConfiguration('synthetic-persona-api') } });
  try {
    const read = `${origin}/api/workspaces/${PERSONA_WORKSPACE}/research-automation/runs/${PERSONA_RUN}`;
    const write = `${origin}/owner-api/workspaces/${PERSONA_WORKSPACE}/research-automation/runs/${PERSONA_RUN}`;
    const post = (body: unknown, authorized = true, route = 'insight-persona-model-proposals') => fetch(`${write}/${route}`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const response = await fetch(`${read}/insight-personas/${f.pair.pairId}`); assert.equal(response.status, 200);
    const view = await response.json(); assert.equal(view.source.platform, 'SHOPEE'); assert.equal(view.evidence.length, 0);
    let request: PersonaModelRequest = personaStageRequest(view.binding); request.recordIndexes = personaIndexes(view.source.taxonomySample.recordIndexes);
    const beforeDenied = f.db.prepare('SELECT total_changes() n').get();
    assert.equal((await post(request, false)).status, 401);
    assert.equal((await post({ ...request, ownerApproved: true })).status, 400);
    assert.equal((await post(request, true, 'insight-coding-default-model-proposals')).status, 400);
    assert.equal((await post({ ...request, binding: { ...request.binding, corpusSha256: 'f'.repeat(64) } })).status, 409);
    assert.equal(calls, 0); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeDenied);
    for (const stage of ['TAXONOMY', 'CLASSIFY', 'SYNTHESIZE'] as const) {
      const result = await post(request); assert.equal(result.status, 201);
      const body = await result.json(); assert.equal(body.status, 'PROPOSED'); assert.equal(personaResponseValid(body), true);
      const readback = await fetch(`${read}/insight-persona-evidence/${body.proposal.evidence.evidenceId}`); assert.equal(readback.status, 200);
      assert.deepEqual(await readback.json(), body.proposal);
      const beforeRetry = f.db.prepare('SELECT total_changes() n').get();
      assert.deepEqual(await (await post(request)).json(), body);
      assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeRetry);
      if (stage === 'SYNTHESIZE') {
        assert.equal(body.proposal.evidence.snapshot.personas.length, 3);
        const history = await (await fetch(`${read}/insight-personas/${f.pair.pairId}`)).json(); assert.equal(history.evidence.length, 4);
        for (const secret of [PERSONA_KEY, 'PRIVATE_AUTHOR', 'PRIVATE_PROFILE', f.privacy.profile.keyCommitment,
          ...personaServiceRows().flatMap(row => [row.authorId, row.reviewId])]) assert.equal(JSON.stringify(history).includes(secret), false);
      } else {
        request = (stage === 'TAXONOMY' ? personaStageRequest(view.binding, body.proposal, 'CLASSIFY')
          : personaStageRequest(view.binding, body.proposal, 'SYNTHESIZE'));
        if (stage === 'TAXONOMY') request.recordIndexes = personaIndexes(view.source.eligibleRecordIndexes);
      }
    }
    assert.equal(calls, 3); assert.equal(captured.length, 3); assert.equal(f.collectorCalls(), 1);
    const report = await fetch(`${read}/report-versions/${f.pair.pairId}/reports/insight`);
    assert.equal(report.status, 200); assert.deepEqual(Buffer.from(await report.arrayBuffer()), f.oldReport.bytes);
    assert.equal((await fetch(`${read}/insight-personas/${'f'.repeat(64)}`)).status, 404);
  } finally {
    await application.close(); server.closeAllConnections(); gateway.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve())); await new Promise<void>(resolve => gateway.close(() => resolve()));
  }
});

test('actual owning taxonomy first300/all301 eligible records then exact100+100+100+1 classification excludes retained native alias before every model count', async t => {
  const seed = personaServiceRows();
  const rows = Array.from({ length: 301 }, (_, index) => ({ ...seed[index % seed.length]!, reviewId: String(8000000001 + index), authorId: String(918273640 + index) }));
  rows.push({ ...rows[0]! });
  const f = await personaServiceFixture(t, rows), safe = f.context.source;
  assert.equal(safe.records.length, 302); assert.equal(safe.eligibleRecordIndexes.length, 301);
  assert.equal(safe.records[301]!.exclusionReason, 'SOURCE_NATIVE_ALIAS'); assert.equal(safe.records[301]!.aliasOfRecordIndex, 0);
  let calls = 0; const sizes: number[] = [];
  const ai = { configuration: { ...personaConfiguration, maxResponseBytes: 256 * 1024 }, port: { async generateText({ userText }: { userText: string }) {
    calls++; const input = JSON.parse(userText); sizes.push(input.records.length);
    assert.equal(input.records.some((row: { recordIndex: number }) => row.recordIndex === 301), false);
    return { text: JSON.stringify(personaFixtureResponse(input, safe)) };
  } } };
  const taxonomyRequest = personaStageRequest(f.context.binding); taxonomyRequest.recordIndexes = personaIndexes(safe.taxonomySample.recordIndexes);
  let result = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, taxonomyRequest, personaOwner, ai);
  assert.equal(safe.taxonomySample.version, 'retained-source-order-first-300-v1'); assert.equal(safe.taxonomySample.recordIndexes.length, 300);
  for (let at = 0; at < 301; at += 100) {
    if (result.status !== 'PROPOSED' || result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Expected exact pending predecessor');
    const request = personaStageRequest(f.context.binding, result.proposal, 'CLASSIFY'); request.recordIndexes = personaIndexes(safe.eligibleRecordIndexes.slice(at, at + 100));
    result = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, request, personaOwner, ai);
  }
  assert.deepEqual(sizes, [300, 100, 100, 100, 1]); assert.equal(calls, 5);
  if (result.status !== 'PROPOSED' || result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Expected classification');
  assert.equal(result.proposal.evidence.snapshot.classifications.length, 301);
  assert.equal(result.proposal.evidence.snapshot.classificationComplete, true);
  assert.equal(result.proposal.evidence.snapshot.releaseEligibility, 'UNAVAILABLE');
  assert.equal(f.collectorCalls(), 1);
});
