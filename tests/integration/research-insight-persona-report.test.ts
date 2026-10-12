import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import BetterSqlite3 from 'better-sqlite3';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
// Exercise the released browser client at runtime; its TS remains checked by the frontend configuration.
const { createPersonaReport, loadPersonas, loadPersonaEvidence } = await import(new URL('../../frontend/src/research-automation/persona-api.ts', import.meta.url).href);
import type { AutomationInsightPersonaReportRevisionRequest } from '../../contracts/analysis/automation-insight-persona-report.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';
import { personaServiceRows, personaServiceFixture, personaPendingPipeline, PERSONA_WORKSPACE as W, PERSONA_RUN as R, PERSONA_KEY } from '../helpers/insight-persona-service-fixture.js';

type Fixture = Awaited<ReturnType<typeof personaServiceFixture>>;
type Pipeline = Awaited<ReturnType<typeof personaPendingPipeline>>;
function selected(f: Fixture, p: Pipeline): AutomationInsightPersonaReportRevisionRequest {
  return { contractVersion: 'automation-insight-persona-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, personaInsight: {
      contractVersion: 'insight-persona-report-select-v1', proposalId: p.result.proposal.evidence.evidenceId,
      proposalSha256: p.result.proposal.sha256, binding: f.context.binding } };
}
function service(f: Fixture, renderer = buildResearchAutomationReport, unexpectedAi?: () => never) {
  return new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, metricAttachmentStore: f.staging,
    workspaceReader: { async readVerifiedWorkspace() { throw new Error('Report must not reread current workspace'); } },
    now: () => new Date('2026-10-09T01:00:00.000Z'), renderer,
    ...(unexpectedAi ? { i14SynthesisAi: { port: { async generateText() { return unexpectedAi(); } }, configuration: {
      contractVersion: '1.0.0' as const, methodId: 'automation-i14-synthesis-configuration' as const, providerId: 'synthetic', modelId: 'must-not-dispatch', temperature: null,
      maxOutputTokens: 100, timeoutMs: 1000, maxResponseBytes: 1000 } }, decisionSynthesisAi: { I15: {
        port: { async generateText() { return unexpectedAi(); } }, configuration: { contractVersion: '1.0.0' as const,
          methodId: 'automation-decision-synthesis-configuration' as const, sectionId: 'I15' as const, providerId: 'synthetic', modelId: 'must-not-dispatch', temperature: null,
          maxOutputTokens: 100, timeoutMs: 1000, maxResponseBytes: 1000 } } } } : {}) });
}
function tables(f: Fixture) {
  const names = f.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[];
  return JSON.stringify(names.map(({ name }) => [name, f.db.prepare(`SELECT * FROM "${name}"`).all()]), (_key, value) => typeof value === 'bigint' ? `bigint:${value}` : value);
}
async function cas(f: Fixture) { return (await fs.readdir(f.artifactRoot, { recursive: true })).sort(); }
async function commit(s: ResearchAutomationService, request: AutomationInsightPersonaReportRevisionRequest) {
  const receipt = await s.requestReportRevision(W, R, request); assert.equal(receipt.state, 'QUEUED');
  await s.processNext();
  const settled = await s.getReportRevision(W, R, receipt.attemptId); assert.equal(settled.state, 'COMMITTED');
  assert.ok(settled.pairId); return settled;
}

test('exact final proposal -> retained persona26 HTML/PDF/history with shared citations, authoritative optional semantics, unchanged source22 and no new model calls', async t => {
  const f = await personaServiceFixture(t), p = await personaPendingPipeline(f), request = selected(f, p);
  const pdf = Buffer.from('%PDF-synthetic-persona26'); let extraAiCalls = 0;
  const s = service(f, (input, kind) => ({ ...buildResearchAutomationReport(input, kind), pdf,
    semantic: { injected: 'PRIVATE_PROFILE', insightPersona: { fabricated: true } } }), () => { extraAiCalls++; throw new Error('Persona report must not dispatch extra AI'); });
  const result = await commit(s, request);
  const report = await s.readReport(W, R, 'INSIGHT', false, result.pairId!);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v26');
  assert.equal(p.result.proposal.evidence.contractVersion, 'insight-persona-proposal-evidence-v1');
  if (p.result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Expected final proposal');
  assert.deepEqual(semantic.insightPersona.snapshot, p.result.proposal.evidence.snapshot);
  assert.equal(semantic.insightPersona.executionId, p.result.executionId);
  assert.equal(semantic.injected, undefined); assert.deepEqual(semantic.insightPersona.selection, request.personaInsight);
  const html = report.bytes.toString();
  assert.match(html, /Chân dung do AI tổng hợp từ lời khách thật, không phải một khách hàng có thật/);
  assert.match(html, /6\/18 bản ghi trong mẫu — đề xuất, chờ chủ duyệt/);
  assert.match(html, /When I carry it to work I want no sweet drink; I worry about the bag\./);
  assert.doesNotMatch(html, /Không có nhận định AI hoặc quyết định kinh doanh tự động/);
  assert.ok(semantic.citationEntries.some((entry: { sourceKind: string }) => entry.sourceKind === 'REVIEW'));
  assert.equal(lintVisibleReportText(html).every(check => check.ok), true);
  assert.deepEqual((await s.readReport(W, R, 'INSIGHT', true, result.pairId!)).bytes, pdf);
  assert.deepEqual(await s.readReport(W, R, 'INSIGHT', false, f.pair.pairId), f.oldReport);
  assert.equal((await s.listReportVersions(W, R)).length, 2); assert.equal(extraAiCalls, 0); assert.equal(p.modelCalls(), 3); assert.equal(f.collectorCalls(), 1);
  const secrets = ['PRIVATE_AUTHOR', 'PRIVATE_PROFILE', PERSONA_KEY, ...JSON.parse((await f.artifacts.read(f.context.binding.corpusSha256)).toString()).projection.records.map((row: { authorIdentity: { hash: string } }) => row.authorIdentity.hash)];
  for (const secret of secrets) { assert.equal(html.includes(secret), false); assert.equal(canonicalJson(semantic).includes(secret), false); }
});

test('wrong source/proposal/digest/namespace/member and CAS corruption refuse before admission writes; source26 cannot become source authority', async t => {
  const f = await personaServiceFixture(t), p = await personaPendingPipeline(f), s = service(f), request = selected(f, p);
  const before = tables(f), files = await cas(f), changes = f.db.prepare('SELECT total_changes() n').get();
  const taxonomy = p.responses[0]!.proposal;
  const bad = [ { ...request, previousPairId: 'f'.repeat(64) },
    { ...request, personaInsight: { ...request.personaInsight, proposalId: taxonomy.evidence.evidenceId, proposalSha256: taxonomy.sha256 } },
    { ...request, personaInsight: { ...request.personaInsight, proposalSha256: 'f'.repeat(64) } },
    { ...request, personaInsight: { ...request.personaInsight, binding: { ...request.personaInsight.binding, collectionId: randomUUID() } } },
    { ...request, personaInsight: { ...request.personaInsight, binding: { ...request.personaInsight.binding, sourceSha256: 'f'.repeat(64) } } },
    { ...request, semantic: {} }, { ...request, sources: { ...request.sources, nativeReview: { decision: 'SKIP' } } } ];
  for (const body of bad) await assert.rejects(s.requestReportRevision(W, R, body));
  await assert.rejects(s.requestReportRevision(randomUUID(), R, request));
  await assert.rejects(s.requestReportRevision(W, randomUUID(), request));
  const row = f.db.prepare('SELECT candidates_sha256 FROM analysis_research_automation_ai_executions WHERE execution_id=?').get(p.result.executionId) as { candidates_sha256: string };
  for (const sha of [f.context.binding.corpusSha256, f.context.source.records[0]!.locator.pageSha256, p.result.proposal.sha256, row.candidates_sha256]) {
    const bytes = await f.artifacts.read(sha); await fs.writeFile(f.artifacts.pathForDigest(sha), 'corrupt synthetic evidence');
    try { await assert.rejects(s.requestReportRevision(W, R, request)); } finally { await fs.writeFile(f.artifacts.pathForDigest(sha), bytes); }
  }
  assert.equal(tables(f), before); assert.deepEqual(await cas(f), files); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  const result = await commit(s, request), after = tables(f);
  await assert.rejects(s.requestReportRevision(W, R, { ...request, requestKey: randomUUID(), previousPairId: result.pairId,
    personaInsight: { ...request.personaInsight, binding: { ...request.personaInsight.binding, pairId: result.pairId } } }));
  await assert.rejects(s.readPersonaSourceContext(W, R, result.pairId!));
  assert.equal(tables(f), after); assert.equal(p.modelCalls(), 3);
});

test('cold query-only configless exact HTML/PDF/list/retry verifies retained lineage without clock, renderer, model, collector or CAS writes; corruption fails closed', async t => {
  const f = await personaServiceFixture(t), p = await personaPendingPipeline(f), request = selected(f, p);
  const pdf = Buffer.from('%PDF-cold-persona26'), s = service(f, (input, kind) => ({ ...buildResearchAutomationReport(input, kind), pdf }));
  const result = await commit(s, request), expected = await s.readReport(W, R, 'INSIGHT', false, result.pairId!);
  const before = tables(f), files = await cas(f), db = new BetterSqlite3(f.databasePath); db.pragma('query_only=ON'); db.pragma('foreign_keys=ON');
  const artifacts = new ContentAddressedArtifactStore(f.artifactRoot), staging = new RequestScopedArtifactStore(f.artifactRoot);
  let accesses = 0; const absent = (): never => { accesses++; throw new Error('Unexpected cold dependency'); };
  artifacts.put = async () => absent(); staging.put = async () => absent();
  const cold = new ResearchAutomationService({ db, artifactStore: artifacts, metricAttachmentStore: staging,
    workspaceReader: { readVerifiedWorkspace: async () => absent() }, now: absent, uuid: absent, renderer: absent, shopeeCollectorFactory: absent });
  try {
    const initial = db.prepare('SELECT total_changes() n').get();
    assert.deepEqual(await cold.readReport(W, R, 'INSIGHT', false, result.pairId!), expected);
    assert.deepEqual((await cold.readReport(W, R, 'INSIGHT', true, result.pairId!)).bytes, pdf);
    assert.equal((await cold.listReportVersions(W, R)).length, 2);
    assert.equal((await cold.listReportAttempts(W, R)).length, 1);
    assert.deepEqual(await cold.requestReportRevision(W, R, request), { ...result, exactRetry: true });
    const bytes = await artifacts.read(p.result.proposal.sha256); await fs.writeFile(artifacts.pathForDigest(p.result.proposal.sha256), 'corrupt cold proposal');
    try { await assert.rejects(cold.readReport(W, R, 'INSIGHT', false, result.pairId!)); await assert.rejects(cold.requestReportRevision(W, R, request)); }
    finally { await fs.writeFile(artifacts.pathForDigest(p.result.proposal.sha256), bytes); }
    assert.deepEqual(db.prepare('SELECT total_changes() n').get(), initial); assert.equal(accesses, 0);
    assert.equal(tables(f), before); assert.deepEqual(await cas(f), files); assert.equal(p.modelCalls(), 3);
  } finally { db.close(); }
});

test('KEEP preserves exact persona selection; SKIP drops it; stale source cannot retain proposal and mismatched configured PDF HTML fails closed', async t => {
  const f = await personaServiceFixture(t), p = await personaPendingPipeline(f), s = service(f), request = selected(f, p);
  const first = await commit(s, request);
  const keep = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: first.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  const queued = await s.requestReportRevision(W, R, keep); await s.processNext(); const kept = await s.getReportRevision(W, R, queued.attemptId);
  assert.equal(kept.state, 'COMMITTED');
  const report = await s.readReport(W, R, 'INSIGHT', false, kept.pairId!);
  assert.equal(JSON.parse((await f.artifacts.read(report.versionId)).toString()).insightPersona.selection.proposalId, request.personaInsight.proposalId);
  const skipped = await s.requestReportRevision(W, R, { ...keep, requestKey: randomUUID(), previousPairId: kept.pairId, sources: { ...keep.sources, nativeReview: { decision: 'SKIP' } } });
  await s.processNext(); const skip = await s.getReportRevision(W, R, skipped.attemptId); assert.equal(skip.state, 'COMMITTED');
  const raw = JSON.parse((await f.artifacts.read((await s.readReport(W, R, 'INSIGHT', false, skip.pairId!)).versionId)).toString());
  assert.equal(raw.insightPersona, undefined); assert.equal(raw.privateReviewCorpus, undefined); assert.equal(raw.rendererVersion, 'automation-report-kit-v22');
  const before = tables(f); await assert.rejects(s.requestReportRevision(W, R, { ...request, requestKey: randomUUID(), previousPairId: skip.pairId })); assert.equal(tables(f), before);
  const f2 = await personaServiceFixture(t), p2 = await personaPendingPipeline(f2);
  const mismatch = service(f2, (input, kind) => ({ ...buildResearchAutomationReport(input, kind), html: Buffer.from('<p>different HTML</p>'), pdf: Buffer.from('%PDF-invalid-peer') }));
  const attempt = await mismatch.requestReportRevision(W, R, selected(f2, p2)); await mismatch.processNext();
  assert.equal((await mismatch.getReportRevision(W, R, attempt.attemptId)).state, 'FAILED');
  assert.equal((await mismatch.listReportVersions(W, R)).length, 1);
});

test('released frontend client sends exact OWNER selection to actual handler, authoritative26 is read/list/retried, wrong OWNER/schema refuse; no providers', async t => {
  const f = await personaServiceFixture(t), p = await personaPendingPipeline(f), body = selected(f, p);
  let app: ReturnType<typeof openResearchAutomationApi> | undefined;
  const server = http.createServer((req, res) => app!.handler(req, res)); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`, token = 'synthetic-persona-report-token-abcdefghijklmnopqrstuvwxyz123456';
  app = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: 'owner:persona-fixture' },
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false } });
  const actualFetch = globalThis.fetch;
  globalThis.fetch = ((url, init) => actualFetch(new URL(String(url), origin), { ...init, headers: { Origin: origin, ...init?.headers } })) as typeof fetch;
  try {
    const signal = new AbortController().signal, view = await loadPersonas(W, R, f.pair.pairId, signal);
    assert.equal(view.evidence.length, 4); assert.deepEqual(await loadPersonaEvidence(W, R, p.result.proposal.evidence.evidenceId, view.binding, signal), p.result.proposal);
    const endpoint = `/owner-api/workspaces/${W}/research-automation/runs/${R}/report-revisions`;
    const before = tables(f);
    const post = (value: unknown, authorized = true) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
    assert.equal((await post(body, false)).status, 401);
    assert.equal((await post({ ...body, personaInsight: { ...body.personaInsight, approved: true } })).status, 400);
    assert.equal(tables(f), before);
    const attempt = await createPersonaReport(W, R, body, token, signal);
    for (let i = 0; i < 100; i++) {
      const response = await fetch(`/api/workspaces/${W}/research-automation/runs/${R}/report-attempts/${attempt.attemptId}`);
      const receipt = await response.json(); if (receipt.state === 'COMMITTED') break;
      assert.notEqual(receipt.state, 'FAILED'); await new Promise(resolve => setTimeout(resolve, 20));
    }
    const retry = await createPersonaReport(W, R, body, token, signal); assert.equal(retry.state, 'COMMITTED'); assert.equal(retry.exactRetry, true);
    const response = await fetch(`/api/workspaces/${W}/research-automation/runs/${R}/report-versions/${retry.pairId}/reports/insight`);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /Chân dung do AI tổng hợp từ lời khách thật/);
    const versions = await fetch(`/api/workspaces/${W}/research-automation/runs/${R}/report-versions`); assert.equal(versions.status, 200);
    assert.equal((await versions.json()).versions.length, 2); assert.equal(p.modelCalls(), 3); assert.equal(f.collectorCalls(), 1);
  } finally { globalThis.fetch = actualFetch; await app.close(); server.close(); await once(server, 'close'); }
});


test('owning two-product source retains cards and explicit shortage without inventing three personas or broad industry coverage', async t => {
  const rows = personaServiceRows().map((row, i) => ({ ...row, itemId: String(3001 + i % 2) }));
  const f = await personaServiceFixture(t, rows, 2), p = await personaPendingPipeline(f), s = service(f);
  if (p.result.proposal.evidence.contractVersion !== 'insight-persona-proposal-evidence-v1') throw new Error('Expected final source proposal');
  assert.equal(p.result.proposal.evidence.snapshot.personas.length, 0); assert.equal(p.result.proposal.evidence.snapshot.cards.length, 9);
  assert.ok(p.result.proposal.evidence.snapshot.insufficiency);
  const revision = await commit(s, selected(f, p)); const report = await s.readReport(W, R, 'INSIGHT', false, revision.pairId!);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.insightPersona.snapshot.personas.length, 0); assert.equal(semantic.insightPersona.snapshot.cards.length, 9);
  assert.equal(semantic.insightPersona.snapshot.insufficiency, p.result.proposal.evidence.snapshot.insufficiency);
  assert.equal(p.modelCalls(), 3); assert.deepEqual(await s.readReport(W, R, 'INSIGHT', false, f.pair.pairId), f.oldReport);
});

test('persona history authenticates coexisting legacy envelopes without interpreting them, and unknown or disguised retained wrappers cannot disappear', async t => {
  const f = await personaServiceFixture(t), p = await personaPendingPipeline(f);
  // Canonical legacy envelope fixture tests namespace admission only. Private
  // S05 still cannot use the old native/located coding source reader.
  const binding = { workspaceId: W, runId: R, pairId: f.pair.pairId, scopeSha256: f.context.binding.scopeSha256,
    reportSha256: f.oldReport.versionId, sourceKind: 'NATIVE' as const, sourcePackageSha256: 'a'.repeat(64), inputSha256: 'b'.repeat(64) };
  const id = randomUUID(), key = randomUUID(), at = '2026-10-09T00:30:00.000Z';
  const legacy = { contractVersion: 'insight-coding-evidence-v1', evidenceId: id, sequence: 1, binding,
    request: { contractVersion: 'insight-coding-adopt-v1', requestKey: key, binding, rules: {
      ruleId: 'synthetic-legacy-envelope', revision: 1, question: 'Source context', inclusionRule: 'Synthetic source', adjudicationRule: 'Pending', corpora: [] } },
    parentSha256: null, actorId: 'owner:legacy-fixture', actorRole: 'OWNER', createdAt: at };
  const bytes = Buffer.from(canonicalJson(legacy)), artifact = await f.artifacts.put(bytes);
  f.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,'application/json',?,?,'1.0.0','active',?)`).run(artifact.sha256, bytes.length, artifact.relativePath, at, at);
  f.db.prepare(`INSERT INTO analysis_insight_coding_evidence(evidence_id,kind,run_id,pair_sha256,parent_id,request_key,sequence,artifact_sha256,artifact_json)
    VALUES (?,'ADOPTION',?,?,NULL,?,1,?,?)`).run(id, R, f.pair.pairId, key, artifact.sha256, bytes.toString());
  const view = await f.service.listPersonaEvidence(W, R, f.pair.pairId); assert.equal(view.evidence.length, 4);
  assert.equal(view.evidence.some(row => row.evidence.evidenceId === id), false);
  await assert.rejects(f.service.readInsightCoding(W, R, f.pair.pairId)); // No broadened private source authority.
  // Corruption injection is confined to this synthetic test database. Production
  // immutability remains unchanged; cold checks begin after the injected corruption.
  f.db.exec('DROP TRIGGER insight_coding_no_update');
  const original = f.db.prepare('SELECT artifact_json FROM analysis_insight_coding_evidence WHERE evidence_id=?').get(p.result.proposal.evidence.evidenceId) as { artifact_json: string };
  for (const version of ['unknown-persona-wrapper-v99', 'insight-coding-evidence-v1']) {
    const corrupted = { ...JSON.parse(original.artifact_json), contractVersion: version };
    f.db.prepare('UPDATE analysis_insight_coding_evidence SET artifact_json=? WHERE evidence_id=?').run(canonicalJson(corrupted), p.result.proposal.evidence.evidenceId);
    const before = tables(f), files = await cas(f), changes = f.db.prepare('SELECT total_changes() n').get();
    const db = new BetterSqlite3(f.databasePath); db.pragma('query_only=ON');
    const artifacts = new ContentAddressedArtifactStore(f.artifactRoot), staging = new RequestScopedArtifactStore(f.artifactRoot);
    let effects = 0; const forbidden = (): never => { effects++; throw new Error('History used a mutation/runtime dependency'); };
    artifacts.put = async () => forbidden(); staging.put = async () => forbidden();
    const cold = new ResearchAutomationService({ db, artifactStore: artifacts, metricAttachmentStore: staging,
      workspaceReader: { readVerifiedWorkspace: async () => forbidden() }, now: forbidden, uuid: forbidden, renderer: forbidden, shopeeCollectorFactory: forbidden });
    try { await assert.rejects(cold.listPersonaEvidence(W, R, f.pair.pairId)); assert.equal(effects, 0); }
    finally { db.close(); }
    assert.equal(tables(f), before); assert.deepEqual(await cas(f), files); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  }
  assert.equal(p.modelCalls(), 3);
});
