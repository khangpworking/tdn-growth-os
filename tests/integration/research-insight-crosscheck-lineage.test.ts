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
  const configurationSha = lineage.executions[0]!.configuration.sha256;
  db.prepare("UPDATE artifact_manifests SET retention_status='held' WHERE sha256=?").run(configurationSha);
  const beforeCorrupt = db.prepare('SELECT total_changes() n').get();
  await assert.rejects(coding.readDefaultModelLineage(workspaceId, runId, context.binding, selection));
  assert.equal(calls, 2); assert.deepEqual(db.prepare('SELECT total_changes() n').get(), beforeCorrupt);
});
