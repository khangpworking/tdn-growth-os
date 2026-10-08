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
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import type { InsightDefaultModelRequest } from '../../contracts/analysis/automation-insight-model.generated.js';
import { insightCodingDigest } from '../../src/modules/analysis/research-automation/insight-default-coding.js';
import type { InsightCodingAdoptRequest } from '../../contracts/analysis/automation-insight-coding.generated.js';
import type { InsightProposedAnnotations } from '../../contracts/analysis/automation-insight-coding.generated.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';

// Default coding exercises the actual owning service and authenticated API with synthetic
// sources/transports. Offline fixtures verify binding and lifecycle, not model quality.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-04T00:00:00.000Z');

async function fixture(t: TestContext, texts: string[], native = false, withRenderer = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-insight-prompt-retention-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'insight-prompt-retention', title: 'Synthetic insight prompt retention' });
  if (native) await seedNativeDamiPackage(new SourcePackageService({ db, artifactStore: artifacts }), { rawRows: texts.map((comment, index) => ({ type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: `default-native-${index}`, comment, rating_star: 4 })) });
  const raw = Buffer.from(JSON.stringify(texts.map((comment, index) => ({ shopId: '78085196', itemId: '17678138164', reviewId: `synthetic-${index}`, comment, ratingStar: 5 }))));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, shopeeCollectorFactory: () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }),
    ...(withRenderer ? { renderer: (input: Parameters<typeof buildResearchAutomationReport>[0], kind: 'MARKET' | 'INSIGHT') => buildResearchAutomationReport(input, kind) } : {}) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic prompt retention', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: native ? 'research-automation-confirm-v2' : 'research-automation-confirm-v1', ...(native ? { sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'AUTO_REUSE' } } : {}), requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic prompt-retention records, not pilot source',
    includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [url] });
  await service.processNext(); await service.processNext();
  return { db, artifacts, service, databasePath: path.join(root, 'test.sqlite'), artifactRoot: path.join(root, 'artifacts') };
}

const configuration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic', modelId: 'fixture-model', temperature: null,
  maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 };
const owner = { actorId: 'owner:default-test', role: 'OWNER' as const };
const emptyAnnotations = (): InsightProposedAnnotations => ({ i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] });

test('default runtime gates, conflicting multi-code INVALID and canceled dispatch retain identities without proposals or repeat calls', async t => {
  const f = await fixture(t, ['Tôi thích kích thước và hương vị.']);
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const context = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  assert.equal(context.input.corpora.length, 0, 'no source multi-code policy is present');
  const request = (): InsightDefaultModelRequest => ({ contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(), binding: context.binding,
    defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] });
  const gateRequest = request();
  const gate = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, gateRequest, owner, null);
  assert.equal(gate.execution.status, 'NOT_DISPATCHED');
  assert.equal(gate.proposal, undefined);
  const aborted = new AbortController(); aborted.abort();
  const beforeAbort = f.db.prepare('SELECT total_changes() n').get();
  await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, request(), owner, null, aborted.signal));
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeAbort);
  let calls = 0;
  const conflicting = request();
  const invalid = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, conflicting, owner, { configuration, port: { async generateText() {
    calls++;
    const annotations = emptyAnnotations(), text = context.input.records[0]!.text!;
    const codes = ['kích thước', 'hương vị'].map((phrase, index) => ({ code: `C${index}`, label: phrase, phrase, firstRecordIndex: 0, firstSpan: locatedSpan(text, phrase) }));
    annotations.corpora.push({ corpusIndex: 0, assignments: codes.map(code => ({ recordIndex: 0, code: code.code, span: code.firstSpan,
      provenance: { basis: 'PENDING_AI', coderRole: 'fixture-model', adjudication: null, disagreement: null } })), dispositions: [] });
    return { text: JSON.stringify({ codebooks: [{ corpusIndex: 0, codes }], annotations }) };
  } } });
  assert.equal(invalid.execution.status, 'INVALID'); assert.equal(invalid.proposal, undefined);
  const beforeRetry = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, conflicting, owner, null), { execution: { ...invalid.execution, dispatched: false } });
  assert.equal(calls, 1); assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeRetry);
  const cancel = new AbortController(), canceledRequest = request();
  const canceled = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, canceledRequest, owner, { configuration, port: { async generateText() {
    calls++; cancel.abort(); throw new Error('Synthetic in-flight cancellation');
  } } }, cancel.signal);
  assert.equal(canceled.execution.status, 'DISPATCH_UNKNOWN'); assert.equal(canceled.proposal, undefined);
  const settled = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, canceledRequest, owner, null), { execution: { ...canceled.execution, dispatched: false } });
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), settled); assert.equal(calls, 2);
  const view = await f.service.readInsightCoding(workspaceId, runId, pair.pairId);
  assert.equal(view.evidence.filter(item => item.kind === 'PROPOSAL' || item.kind === 'ADOPTION').length, 0);
  assert.deepEqual(view.context.input.records, context.input.records);
});
async function waitRevision(service: ResearchAutomationService, attemptId: string) {
  for (let at = 0; at < 50; at++) {
    await service.processNext();
    const attempt = await service.getReportRevision(workspaceId, runId, attemptId);
    if (attempt.state === 'COMMITTED') return (await service.listReportVersions(workspaceId, runId)).find(pair => pair.attemptId === attemptId)!;
    assert.notEqual(attempt.state, 'FAILED');
  }
  throw new Error('Synthetic revision did not commit');
}

test('actual service without a presentation adapter builds and reads only the explicit default report21 branch; old fallback replays unchanged', async t => {
  const f = await fixture(t, ['Tôi thích kích thước.'], false, false);
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const old = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  assert.match(old.bytes.toString(), /Draft, unreviewed/);
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const request: InsightDefaultModelRequest = { contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(), binding: source.binding,
    defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] };
  let calls = 0;
  const proposed = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, request, owner, { configuration, port: { async generateText() {
    calls++; return { text: JSON.stringify({ codebooks: [], annotations: emptyAnnotations() }) };
  } } });
  assert.ok(proposed.proposal);
  const body = { contractVersion: 'automation-insight-default-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: { contractVersion: 'insight-default-draft-select-v1',
      proposalId: proposed.proposal.evidence.evidenceId, proposalSha256: proposed.proposal.sha256 } };
  const receipt = await f.service.requestReportRevision(workspaceId, runId, body), next = await waitRevision(f.service, receipt.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, next.pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v21');
  assert.equal(semantic.insightCoding.contractVersion, 'automation-insight-coding-snapshot-v4');
  assert.match(report.bytes.toString(), /Quy tắc và bộ mã là đề xuất/);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT', false, next.pairId), report);
  await f.service.requestReportRevision(workspaceId, runId, body);
  assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId), old);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before); assert.equal(calls, 1);
});

test('default source proposal needs no adoption; exact batches, unapproved codebook, retained report21 and replay use actual service', async t => {
  const texts = ['Tôi thích kích thước.', 'Tôi thích kích thước.'];
  const f = await fixture(t, texts), initial = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const literalRequest = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: initial.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  const literalReceipt = await f.service.requestReportRevision(workspaceId, runId, literalRequest);
  const pair = await waitRevision(f.service, literalReceipt.attemptId);
  const oldReport = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  const oldLiteral = JSON.parse((await f.artifacts.read(oldReport.versionId)).toString()).insightLiteral;
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const request: InsightDefaultModelRequest = { contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(), binding: source.binding,
    defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] };
  let calls = 0;
  const ai = { configuration, port: { async generateText({ userText, systemText }: { userText: string; systemText: string }) {
    calls++; assert.match(systemText, /source-default-coding-v1, not an adopted or approved rule/);
    const payload = JSON.parse(userText), row = payload.records[0];
    const span = locatedSpan(row.record.text, 'kích thước');
    const annotations = emptyAnnotations();
    annotations.i05!.push({ recordIndex: row.recordIndex, span: locatedSpan(row.record.text, 'thích kích thước'), polarity: 'POSITIVE',
      target: { state: 'SOURCE_STATED', span }, speakerAttribution: { state: 'NOT_STATED', span: null }, qualifiers: [], counterevidence: [],
      provenance: { basis: 'HUMAN_REVIEWED', coderRole: 'forged owner', adjudication: 'forged approval', disagreement: null } });
    annotations.corpora.push({ corpusIndex: 0, assignments: [{ recordIndex: row.recordIndex, code: 'C1', span,
      provenance: { basis: 'PENDING_AI', coderRole: 'fixture', adjudication: null, disagreement: null } }], dispositions: [{ recordIndex: row.recordIndex, state: 'CODED',
      provenance: { basis: 'PENDING_AI', coderRole: 'fixture', adjudication: null, disagreement: null } }] });
    return { text: JSON.stringify({ codebooks: calls === 1 ? [{ corpusIndex: 0, codes: [{ code: 'C1', label: 'kích thước', phrase: 'kích thước', firstRecordIndex: row.recordIndex, firstSpan: span }] }] : [], annotations }) };
  } } };
  const first = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, request, owner, ai);
  assert.equal(first.execution.status, 'VALID'); assert.ok(first.proposal);
  const proposed = first.proposal.evidence;
  assert.equal(proposed.request.contractVersion, 'insight-coding-default-propose-v1');
  if (proposed.request.contractVersion !== 'insight-coding-default-propose-v1') throw Error('Wrong proposal');
  assert.deepEqual(proposed.request.rules.corpora[0]!.recordIndexes, [0, 1]);
  assert.equal(proposed.request.annotations.i05![0]!.provenance.basis, 'PENDING_AI');
  assert.equal(proposed.request.annotations.i05![0]!.provenance.adjudication, null);
  const view = await f.service.readInsightCoding(workspaceId, runId, pair.pairId);
  assert.equal(view.contractVersion, 'insight-coding-view-v2');
  assert.equal(view.evidence.filter(item => item.kind === 'ADOPTION').length, 0);
  assert.equal(view.evidence.filter(item => item.kind === 'DEFAULT_RULE').length, 1);
  const before = f.db.prepare('SELECT total_changes() n').get();
  const replay = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, request, owner, null);
  assert.deepEqual(replay.proposal, { ...first.proposal, exactRetry: true }); assert.equal(calls, 1);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  await assert.rejects(f.service.proposeModelInsightCoding(workspaceId, runId, { contractVersion: 'insight-model-request-v1', requestKey: randomUUID(),
    adoptionId: proposed.request.defaultRuleId, previousProposalId: null, recordIndexes: [0] }, owner, ai));
  await assert.rejects(f.service.acceptInsightCoding(workspaceId, runId, { contractVersion: 'insight-coding-accept-v1', requestKey: randomUUID(),
    proposalId: proposed.evidenceId, proposalSha256: first.proposal.sha256, selection: { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [], i05: [0], i07: [], i08: [], i06: [], i09: [], i13Mentions: [], corpora: [] } }, owner));
  const secondRequest: InsightDefaultModelRequest = { ...request, requestKey: randomUUID(), defaultRuleId: proposed.request.defaultRuleId,
    defaultRuleSha256: proposed.request.defaultRuleSha256, previousProposalId: proposed.evidenceId, previousProposalSha256: first.proposal.sha256, recordIndexes: [1] };
  await assert.rejects(f.service.proposeDefaultModelInsightCoding(workspaceId, runId, { ...secondRequest, previousProposalSha256: '0'.repeat(64) }, owner, ai));
  assert.equal(calls, 1);
  const second = await f.service.proposeDefaultModelInsightCoding(workspaceId, runId, secondRequest, owner, ai);
  assert.equal(second.execution.status, 'VALID'); assert.ok(second.proposal);
  if (second.proposal.evidence.request.contractVersion !== 'insight-coding-default-propose-v1') throw Error('Wrong continuation');
  assert.equal(second.proposal.evidence.request.annotations.i05!.length, 2);
  assert.deepEqual(second.proposal.evidence.request.rules.corpora[0]!.codebook, proposed.request.rules.corpora[0]!.codebook);
  const selected = { contractVersion: 'insight-default-draft-select-v1', proposalId: second.proposal.evidence.evidenceId, proposalSha256: second.proposal.sha256 } as const;
  const reportRequest = { contractVersion: 'automation-insight-default-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: selected };
  const receipt = await f.service.requestReportRevision(workspaceId, runId, reportRequest);
  const next = await waitRevision(f.service, receipt.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, next.pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v21');
  assert.equal(semantic.insightCoding.contractVersion, 'automation-insight-coding-snapshot-v4');
  assert.deepEqual(semantic.insightLiteral, oldLiteral, 'default21 preserves exact retained literal19 evidence');
  assert.equal('adoptionId' in semantic.insightCoding, false);
  assert.equal(semantic.insightCoding.defaultRuleId, proposed.request.defaultRuleId);
  assert.deepEqual(semantic.insightCoding.draftSelection, selected);
  assert.deepEqual(semantic.insightCoding.receipts, []);
  assert.equal(semantic.insightCoding.groupCounts.rates, null);
  assert.equal(semantic.insightCoding.output.sections.I10.corpora[0].draftCounts[0].recordCount, 2);
  assert.equal(semantic.insightCoding.output.sections.I10.corpora[0].draftCounts[0].label, 'đề xuất, chờ chủ duyệt');
  assert.equal(semantic.insightCoding.output.sections.I10.corpora[0].counts[0].recordCount, 0, 'unapproved rows never enter accepted counts');
  const retained = f.db.prepare('SELECT admission_sha256, prompt_sha256, configuration_sha256 FROM analysis_research_automation_ai_executions WHERE execution_id=?')
    .get(first.execution.executionId) as { admission_sha256: string; prompt_sha256: string; configuration_sha256: string };
  const retainedSource = JSON.parse((await f.artifacts.read(retained.admission_sha256)).toString());
  assert.deepEqual(retainedSource.request, request); assert.deepEqual(retainedSource.binding, source.binding);
  assert.equal(retainedSource.defaultRuleSha256, proposed.request.defaultRuleSha256);
  assert.equal(retainedSource.codebookSha256, insightCodingDigest(retainedSource.input.corpora.map((corpus: { codebook: unknown }) => corpus.codebook)));
  assert.equal(JSON.parse((await f.artifacts.read(retained.prompt_sha256)).toString()).contractVersion, 'insight-model-prompt-v5');
  assert.deepEqual(JSON.parse((await f.artifacts.read(retained.configuration_sha256)).toString()), configuration);
  const keep = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: next.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  const inheritedReceipt = await f.service.requestReportRevision(workspaceId, runId, keep), inherited = await waitRevision(f.service, inheritedReceipt.attemptId);
  const inheritedReport = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, inherited.pairId);
  const inheritedSemantic = JSON.parse((await f.artifacts.read(inheritedReport.versionId)).toString());
  assert.deepEqual(inheritedSemantic.insightCoding, semantic.insightCoding, 'KEEP preserves the exact selected proposal, not latest');
  assert.deepEqual(inheritedSemantic.insightLiteral, oldLiteral); assert.equal(inheritedSemantic.rendererVersion, 'automation-report-kit-v21');
  const html = report.bytes.toString();
  assert.match(html, /đề xuất, chờ chủ duyệt/); assert.match(html, /Quy tắc và bộ mã là đề xuất/);
  assert.match(html, /lô không hợp lệ/);
  assert.ok(semantic.insightCoding.output.sections.I10.corpora.every((corpus: { codingComplete: boolean }) => corpus.codingComplete === false));
  const settled = f.db.prepare('SELECT total_changes() n').get();
  await f.service.readReport(workspaceId, runId, 'INSIGHT', false, next.pairId);
  await f.service.requestReportRevision(workspaceId, runId, reportRequest);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), settled); assert.equal(calls, 2);
  assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId), oldReport);
  assert.equal(insightCodingDigest(source.input), source.binding.inputSha256);
});

test('authenticated native-source HTTP default action reaches fake model and selected draft report; wrong owner and old route reject', { timeout: 120000 }, async t => {
  const f = await fixture(t, ['Tôi thích kích thước.'], true);
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  let calls = 0;
  const gateway = http.createServer((request, response) => {
    const chunks: Buffer[] = []; request.on('data', chunk => chunks.push(chunk)).on('end', () => {
      calls++; const envelope = JSON.parse(Buffer.concat(chunks).toString());
      assert.equal(envelope.model, 'synthetic-default-model');
      const input = JSON.parse(envelope.messages[1].content);
      assert.equal(input.records.length, 1); assert.equal(input.records[0].record.text, 'Tôi thích kích thước.');
      const row = input.records[0], annotations = emptyAnnotations();
      annotations.i05!.push({ recordIndex: row.recordIndex, span: locatedSpan(row.record.text, 'thích kích thước'), polarity: 'POSITIVE',
        target: { state: 'NOT_STATED', span: null }, speakerAttribution: { state: 'NOT_STATED', span: null }, qualifiers: [], counterevidence: [],
        provenance: { basis: 'PENDING_AI', coderRole: 'fixture-model', adjudication: null, disagreement: null } });
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ codebooks: [], annotations }) } }] }));
    });
  });
  gateway.listen(0, '127.0.0.1'); await once(gateway, 'listening');
  t.after(async () => { await new Promise<void>(resolve => gateway.close(() => resolve())); });
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const origin = `http://127.0.0.1:${port}`, token = 'synthetic-default-owner-token-abcdefghijklmnopqrstuvwxyz123456';
  const application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: owner.actorId },
    insightCoding: { cliproxy: { baseUrl: `http://127.0.0.1:${(gateway.address() as AddressInfo).port}`, apiKey: 'synthetic-default-key-123456' }, configuration: insightCodingCliproxyConfiguration('synthetic-default-model') } });
  const server = http.createServer(application.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  try {
    const base = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`, read = `${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const post = (action: string, body: unknown, authorized = true) => fetch(`${base}/${action}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
    const view = await (await fetch(`${read}/insight-coding/${pair.pairId}`)).json();
    assert.equal(view.context.binding.sourceKind, 'NATIVE'); assert.equal(view.evidence.length, 0);
    const request = { contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(), binding: view.context.binding, defaultRuleId: null,
      defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] };
    assert.equal((await post('insight-coding-default-model-proposals', request, false)).status, 401);
    assert.equal((await post('insight-coding-model-proposals', request)).status, 400);
    assert.equal(calls, 0);
    const beforeBadSource = f.db.prepare('SELECT total_changes() n').get();
    assert.equal((await post('insight-coding-default-model-proposals', { ...request, binding: { ...request.binding, inputSha256: '0'.repeat(64) } })).status, 409);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeBadSource);
    const response = await post('insight-coding-default-model-proposals', request); assert.equal(response.status, 201);
    const proposed = await response.json(); assert.equal(proposed.status, 'PROPOSED');
    const fresh = await (await fetch(`${read}/insight-coding/${pair.pairId}`)).json();
    assert.equal(fresh.evidence.filter((item: { kind: string }) => item.kind === 'ADOPTION').length, 0);
    const proposal = fresh.evidence.find((item: { evidenceId: string }) => item.evidenceId === proposed.proposal.evidenceId);
    assert.equal(proposal.request.contractVersion, 'insight-coding-default-propose-v1');
    const beforeReplay = f.db.prepare('SELECT total_changes() n').get();
    const replay = await post('insight-coding-default-model-proposals', request); assert.equal(replay.status, 200);
    assert.equal((await replay.json()).proposal.exactRetry, true); assert.equal(calls, 1);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeReplay);
    const revisionBody = { contractVersion: 'automation-insight-default-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: { contractVersion: 'insight-default-draft-select-v1', proposalId: proposal.evidenceId, proposalSha256: proposal.sha256 } };
    assert.equal((await post('report-revisions', { ...revisionBody, defaultInsight: { ...revisionBody.defaultInsight, proposalSha256: '0'.repeat(64) } })).status, 400);
    const revision = await post('report-revisions', revisionBody);
    assert.equal(revision.status, 202);
    const receipt = await revision.json();
    let committed: { pairId: string } | null = null;
    for (let at = 0; at < 80; at++) {
      const attempts = await (await fetch(`${read}/report-attempts/${receipt.attemptId}`)).json();
      assert.notEqual(attempts.state, 'FAILED'); if (attempts.state === 'COMMITTED') { committed = attempts; break; }
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(committed);
    const html = await (await fetch(`${read}/report-versions/${committed.pairId}/reports/insight`)).text();
    assert.match(html, /Quy tắc và bộ mã là đề xuất/); assert.match(html, /đề xuất, chờ chủ duyệt/);
    const settled = f.db.prepare('SELECT total_changes() n').get();
    assert.equal((await post('report-revisions', revisionBody)).status, 200);
    assert.equal(await (await fetch(`${read}/report-versions/${committed.pairId}/reports/insight`)).text(), html);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), settled);
    assert.equal(calls, 1);
  } finally { await application.close(); await new Promise<void>(resolve => server.close(() => resolve())); await new Promise<void>(resolve => gateway.close(() => resolve())); }
});
