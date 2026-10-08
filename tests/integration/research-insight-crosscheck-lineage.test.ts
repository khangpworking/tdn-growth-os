import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { AutomationInsightCoding } from '../../src/modules/analysis/research-automation/insight-coding.js';
import { insightCodingDigest } from '../../src/modules/analysis/research-automation/insight-default-coding.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';
import type { InsightDefaultModelRequest } from '../../contracts/analysis/automation-insight-model.generated.js';
import type { InsightProposedAnnotations } from '../../contracts/analysis/automation-insight-coding.generated.js';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-04T00:00:00.000Z');
const owner = { actorId: 'owner:synthetic-crosscheck', role: 'OWNER' as const };
const blank = (): InsightProposedAnnotations => ({ i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] });

test('owning default lineage reader verifies all predecessor model configurations and exact first artifacts without calls or writes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-crosscheck-lineage-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'crosscheck-lineage-synthetic', title: 'Synthetic lineage' });
  const raw = Buffer.from(JSON.stringify([0, 1].map(index => ({ shopId: '78085196', itemId: '17678138164', reviewId: `synthetic-${index}`, comment: 'Tôi thích kích thước.', ratingStar: 4 }))));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now,
    shopeeCollectorFactory: () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }) });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'Synthetic lineage',
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic lineage only', includeTerms: [], excludeTerms: [],
    selectedProductIds: [], peerProductIds: [], exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] });
  await service.processNext(); await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  const context = await service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const coding = new AutomationInsightCoding({ db, artifacts, now, context: (...args) => service.readInsightSourceContext(...args),
    assertCurrent: async binding => { assert.equal(binding.pairId, (await service.listReportVersions(workspaceId, runId)).at(-1)!.pairId); } });
  let calls = 0;
  const makeAi = (modelId: string) => ({ configuration: { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic-only', modelId,
    temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 }, port: { async generateText(request: { userText: string }) {
      calls++;
      const input = JSON.parse(request.userText), recordIndex = input.records[0].recordIndex as number;
      const span = locatedSpan(context.input.records[recordIndex]!.text!, 'kích thước');
      const annotations = blank();
      annotations.corpora.push({ corpusIndex: 0, assignments: [{ recordIndex, code: 'C1', span,
        provenance: { basis: 'PENDING_AI', coderRole: modelId, adjudication: null, disagreement: null } }], dispositions: [] });
      return { text: JSON.stringify({ codebooks: recordIndex === 0 ? [{ corpusIndex: 0, codes: [{ code: 'C1', label: 'size', phrase: 'kích thước', firstRecordIndex: 0, firstSpan: span }] }] : [], annotations }) };
    } } });
  const firstRequest: InsightDefaultModelRequest = { contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(), binding: context.binding,
    defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] };
  const first = await service.proposeDefaultModelInsightCoding(workspaceId, runId, firstRequest, owner, makeAi('first-a'));
  assert.ok(first.proposal);
  const firstEvidence = first.proposal.evidence;
  assert.equal(firstEvidence.request.contractVersion, 'insight-coding-default-propose-v1');
  if (firstEvidence.request.contractVersion !== 'insight-coding-default-propose-v1') throw new Error('missing default fixture');
  const second = await service.proposeDefaultModelInsightCoding(workspaceId, runId, { ...firstRequest, requestKey: randomUUID(), recordIndexes: [1],
    defaultRuleId: firstEvidence.request.defaultRuleId, defaultRuleSha256: firstEvidence.request.defaultRuleSha256,
    previousProposalId: firstEvidence.evidenceId, previousProposalSha256: insightCodingDigest(firstEvidence) }, owner, makeAi('first-b'));
  assert.ok(second.proposal);
  const selection = { contractVersion: 'insight-default-draft-select-v1' as const, proposalId: second.proposal.evidence.evidenceId, proposalSha256: second.proposal.sha256 };
  const before = db.prepare('SELECT total_changes() n').get();
  const lineage = await coding.readDefaultModelLineage(workspaceId, runId, context.binding, selection, true);
  assert.deepEqual(lineage.executions.map(row => row.configuration.value.modelId), ['first-a', 'first-b']);
  assert.deepEqual(lineage.executions.map(row => row.admission.value.request.recordIndexes), [[0], [1]]);
  assert.equal(lineage.proposal.evidenceId, selection.proposalId);
  assert.equal(lineage.codebookSha256, insightCodingDigest(lineage.input.corpora.map(row => row.codebook)));
  assert.deepEqual(lineage.input.corpora[0]!.assignments.map(row => row.recordIndex), [0, 1]);
  for (const execution of lineage.executions) {
    assert.ok(execution.prompt.value.systemText.includes('source-default-coding-v1'));
    assert.equal(execution.prompt.value.contractVersion, 'insight-model-prompt-v5');
    assert.ok(!execution.input.bytes.toString().includes('assignments'));
    assert.deepEqual(await artifacts.read(execution.candidates.sha256), execution.candidates.bytes);
    assert.deepEqual(await artifacts.read(execution.configuration.sha256), execution.configuration.bytes);
  }
  assert.deepEqual(await coding.readDefaultModelLineage(workspaceId, runId, context.binding, selection), lineage);
  await assert.rejects(coding.readDefaultModelLineage(workspaceId, runId, context.binding, { ...selection, proposalSha256: '0'.repeat(64) }));
  await assert.rejects(coding.readDefaultModelLineage(workspaceId, runId, { ...context.binding, inputSha256: '0'.repeat(64) }, selection));
  await assert.rejects(coding.readDefaultModelLineage(randomUUID(), runId, { ...context.binding, workspaceId: randomUUID() }, selection));
  await assert.rejects(coding.readDefaultModelLineage(workspaceId, randomUUID(), context.binding, selection));
  assert.equal(calls, 2); assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before);
  const oldSelection = { ...selection, proposalId: firstEvidence.evidenceId, proposalSha256: first.proposal.sha256 };
  assert.equal((await coding.readDefaultModelLineage(workspaceId, runId, context.binding, oldSelection)).executions.length, 1);
  await assert.rejects(coding.readDefaultModelLineage(workspaceId, runId, context.binding, oldSelection, true));
  const secondConfiguration = { ...makeAi('independent-second').configuration, providerId: 'synthetic-second' };
  const crosscheckRequest = { contractVersion: 'insight-crosscheck-request-v1', requestKey: randomUUID(), binding: context.binding,
    firstProposalId: selection.proposalId, firstProposalSha256: selection.proposalSha256, codebookSha256: lineage.codebookSha256,
    seed: 'a'.repeat(64), secondConfigurationSha256: insightCodingDigest(secondConfiguration) };
  let secondCalls = 0;
  const wireText = `  ${JSON.stringify(blank())}\n`;
  const captured: unknown[] = [];
  const secondAi = { configuration: secondConfiguration, port: { async generateText(request: { userText: string; systemText: string }) {
    secondCalls++; const projection = JSON.parse(request.userText); captured.push(projection);
    const forbidden = new Set(['firstRecordIndex','firstSpan','assignments','dispositions','provenance','examples','trace','i04','i05']);
    const inspect = (value: unknown) => { if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), `first leak ${key}`); inspect(child); } };
    inspect(projection); assert.ok(!request.userText.includes('first-a')); assert.ok(!request.userText.includes('first-b'));
    assert.equal(projection.codebookSha256, lineage.codebookSha256);
    assert.deepEqual(projection.records.map((row: { locator: string }) => row.locator), context.input.records.map(row => row.locator));
    assert.deepEqual(projection.corpora[0].codes, [{ code: 'C1', label: 'size', phrase: 'kích thước' }]);
    return { text: wireText };
  } } };
  const beforeRejected = db.prepare('SELECT total_changes() n').get();
  const sameAi = makeAi('first-a');
  await assert.rejects(service.prepareInsightCrosscheck(workspaceId, runId, { ...crosscheckRequest, requestKey: randomUUID(), secondConfigurationSha256: insightCodingDigest(sameAi.configuration) }, owner, sameAi));
  await assert.rejects(service.prepareInsightCrosscheck(workspaceId, runId, { ...crosscheckRequest, requestKey: randomUUID() }, owner, null));
  await assert.rejects(service.prepareInsightCrosscheck(workspaceId, runId, { ...crosscheckRequest, requestKey: randomUUID(), codebookSha256: '0'.repeat(64) }, owner, secondAi));
  for (const patch of [
    { firstProposalId: oldSelection.proposalId, firstProposalSha256: oldSelection.proposalSha256 },
    { firstProposalSha256: '0'.repeat(64) },
    { secondConfigurationSha256: '0'.repeat(64) },
    { binding: { ...context.binding, inputSha256: '0'.repeat(64) } },
    { binding: { ...context.binding, workspaceId: randomUUID() } },
    { binding: { ...context.binding, runId: randomUUID() } },
  ]) await assert.rejects(service.prepareInsightCrosscheck(workspaceId, runId, { ...crosscheckRequest, requestKey: randomUUID(), ...patch }, owner, secondAi));
  assert.deepEqual(db.prepare('SELECT total_changes() n').get(), beforeRejected); assert.equal(secondCalls, 0); assert.equal(calls, 2);
  const prepared = await service.prepareInsightCrosscheck(workspaceId, runId, crosscheckRequest, owner, secondAi);
  assert.equal(prepared.status, 'VALID');
  if (prepared.status !== 'VALID') throw new Error(JSON.stringify(prepared));
  assert.equal(prepared.snapshot.plan.sample.length, 2); assert.equal(prepared.snapshot.plan.eligible.length, 2);
  assert.equal(prepared.snapshot.releaseState, 'U11_STATISTIC_UNAVAILABLE');
  assert.deepEqual(prepared.snapshot.literalRows[0]!.second.corpora[0]!.dispositions, []);
  assert.ok(prepared.snapshot.literalRows[0]!.literalDifferences.includes('corpora'));
  const candidates = JSON.parse((await artifacts.read(prepared.snapshot.secondExecutions[0]!.candidatesSha256)).toString());
  assert.equal(candidates.completionText, wireText, 'actual wire whitespace retained exactly');
  const beforeReplay = db.prepare('SELECT total_changes() n').get();
  const replayed = await service.prepareInsightCrosscheck(workspaceId, runId, crosscheckRequest, owner, { ...secondAi, configuration: { ...secondConfiguration, modelId: 'changed-current-model' } });
  assert.deepEqual(replayed, { ...prepared, exactRetry: true });
  assert.deepEqual(await service.readInsightCrosscheck(workspaceId, runId, crosscheckRequest.requestKey), replayed);
  await assert.rejects(service.prepareInsightCrosscheck(workspaceId, runId, crosscheckRequest, { ...owner, actorId: 'owner:another-synthetic' }, secondAi));
  await assert.rejects(service.prepareInsightCrosscheck(workspaceId, runId, { ...crosscheckRequest, seed: 'b'.repeat(64) }, owner, secondAi));
  await assert.rejects(service.readInsightCrosscheck(randomUUID(), runId, crosscheckRequest.requestKey));
  await assert.rejects(service.readInsightCrosscheck(workspaceId, randomUUID(), crosscheckRequest.requestKey));
  assert.equal(secondCalls, 1); assert.deepEqual(db.prepare('SELECT total_changes() n').get(), beforeReplay);
  const revision = await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-crosscheck-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: selection,
    crosscheckInsight: { contractVersion: 'insight-crosscheck-select-v1', requestKey: crosscheckRequest.requestKey, snapshotSha256: prepared.snapshotSha256,
      firstProposalId: selection.proposalId, firstProposalSha256: selection.proposalSha256 } });
  await service.processNext();
  assert.equal((await service.getReportRevision(workspaceId, runId, revision.attemptId)).state, 'COMMITTED', JSON.stringify(await service.getReportRevision(workspaceId, runId, revision.attemptId)));
  const selectedPair = (await service.listReportVersions(workspaceId, runId)).find(pair => pair.attemptId === revision.attemptId)!;
  const report = await service.readReport(workspaceId, runId, 'INSIGHT', false, selectedPair.pairId);
  const semantic = JSON.parse((await artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v23');
  assert.deepEqual(semantic.insightCrosscheck, prepared.snapshot);
  const html = report.bytes.toString('utf8');
  assert.ok(html.includes('insight-crosscheck-evidence')); assert.ok(html.includes('Chưa có thống kê kiểm chéo U11'));
  assert.ok(html.includes('Tôi thích kích thước.')); assert.equal(secondCalls, 1);
  const beforeReportRead = db.prepare('SELECT total_changes() n').get();
  assert.deepEqual(await service.readReport(workspaceId, runId, 'INSIGHT', false, selectedPair.pairId), report);
  assert.deepEqual(await service.readInsightCrosscheck(workspaceId, runId, crosscheckRequest.requestKey), replayed);
  assert.deepEqual(db.prepare('SELECT total_changes() n').get(), beforeReportRead);
  assert.ok(revision.attemptId); assert.equal(captured.length, 1);
  const inherited = await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(),
    previousPairId: selectedPair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  await service.processNext();
  const inheritedPair = (await service.listReportVersions(workspaceId, runId)).find(pair => pair.attemptId === inherited.attemptId)!;
  assert.ok(inheritedPair, JSON.stringify(await service.getReportRevision(workspaceId, runId, inherited.attemptId)));
  const inheritedReport = await service.readReport(workspaceId, runId, 'INSIGHT', false, inheritedPair.pairId);
  const inheritedSemantic = JSON.parse((await artifacts.read(inheritedReport.versionId)).toString());
  assert.equal(inheritedSemantic.rendererVersion, 'automation-report-kit-v23');
  assert.deepEqual(inheritedSemantic.insightCrosscheck, prepared.snapshot, 'KEEP inherits the exact original selection, never latest');
  assert.equal(secondCalls, 1); assert.equal(calls, 2);
  const configurationSha = lineage.executions[0]!.configuration.sha256;
  db.prepare("UPDATE artifact_manifests SET retention_status='held' WHERE sha256=?").run(configurationSha);
  const beforeCorrupt = db.prepare('SELECT total_changes() n').get();
  await assert.rejects(coding.readDefaultModelLineage(workspaceId, runId, context.binding, selection));
  assert.equal(calls, 2); assert.deepEqual(db.prepare('SELECT total_changes() n').get(), beforeCorrupt);
});
