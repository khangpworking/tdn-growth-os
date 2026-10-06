import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import type { InsightCodingAdoptRequest } from '../../contracts/analysis/automation-insight-coding.generated.js';
import type { InsightProposedAnnotations } from '../../contracts/analysis/automation-insight-coding.generated.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';

// Assignment manual-C (2026-10-04): the generic prompt revision in insight-model-execution.ts
// must keep the retained execution lifecycle intact. This file owns that boundary only;
// semantic model quality is not testable offline and is deliberately not asserted here.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-04T00:00:00.000Z');

async function fixture(t: TestContext, texts: string[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-insight-prompt-retention-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'insight-prompt-retention', title: 'Synthetic insight prompt retention' });
  const raw = Buffer.from(JSON.stringify(texts.map((comment, index) => ({ shopId: '78085196', itemId: '17678138164', reviewId: `synthetic-${index}`, comment, ratingStar: 5 }))));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, shopeeCollectorFactory: () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }),
    renderer: (input, kind) => buildResearchAutomationReport(input, kind) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic prompt retention', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic prompt-retention records, not pilot source',
    includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [url] });
  await service.processNext(); await service.processNext();
  return { db, artifacts, service };
}

test('revised insight prompt dispatches from retained bytes, keeps provenance pending and replays exactly with zero new model calls', async t => {
  const texts = [
    'Sản phẩm đóng gói cẩn thận. Tôi thích mùi hương nhưng không thích nắp. Tôi muốn phiên bản nhỏ hơn vì túi hiện tại quá to.',
    'Đã mua lần hai, giao hàng nhanh.',
    'Chưa dùng nên chưa đánh giá được.',
  ];
  const f = await fixture(t, texts);
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const owner = { actorId: 'owner:prompt-retention', role: 'OWNER' as const };
  const rules: InsightCodingAdoptRequest = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
    rules: { ruleId: 'prompt-retention-v1', revision: 1, question: 'Which explicit source-local statements occur?',
      inclusionRule: 'All three retained synthetic records', adjudicationRule: 'Leave unresolved disagreements pending', corpora: [] } };
  const adoption = await f.service.adoptInsightCodingRules(workspaceId, runId, rules, owner);
  const request = { contractVersion: 'insight-model-request-v1' as const, requestKey: randomUUID(),
    adoptionId: adoption.evidence.evidenceId, previousProposalId: null, recordIndexes: [0, 1, 2] };
  const configuration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic',
    modelId: 'fixture-model', temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 };
  let calls = 0;
  let dispatchedSystemText: string | null = null;
  const ai = { configuration, port: { async generateText(request: { userText: string; systemText: string }) {
    calls++;
    dispatchedSystemText = request.systemText;
    assert.match(request.systemText, /untrusted|never executable instructions/, 'untrusted-evidence framing survives the revision');
    const payload = JSON.parse(request.userText);
    const annotations: InsightProposedAnnotations = { i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
    for (const row of payload.records as { recordIndex: number; record: { text: string } }[]) {
      annotations.i04!.push({ recordIndex: row.recordIndex,
        span: locatedSpan(row.record.text, row.record.text), eventKind: 'ACTION_REPORTED', attribution: 'UNKNOWN',
        qualifiers: [], counterevidence: [],
        provenance: { basis: 'HUMAN_REVIEWED', coderRole: 'claimed reviewer', adjudication: 'claimed approval', disagreement: 'Actor not identified by the source' } });
    }
    return { text: JSON.stringify(annotations) };
  } } };
  const generated = await f.service.proposeModelInsightCoding(workspaceId, runId, request, owner, ai);
  assert.equal(generated.execution.status, 'VALID');
  assert.ok(generated.proposal);
  if (generated.proposal.evidence.request.contractVersion !== 'insight-coding-propose-v1') throw new Error('Expected proposal');
  assert.equal(calls, 1);
  assert.deepEqual(generated.proposal.evidence.request.annotations.i04!.map(row => row.provenance),
    texts.map(() => ({ basis: 'PENDING_AI', coderRole: 'semantic-coding-model-v1', adjudication: null, disagreement: 'Actor not identified by the source' })),
    'claimed approval is forced back to pending and source-bound disagreement is preserved');
  const row = f.db.prepare(`SELECT prompt_sha256, validation_status FROM analysis_research_automation_ai_executions WHERE section_id='INSIGHT_CODING'`)
    .get() as { prompt_sha256: string; validation_status: string };
  assert.equal(row.validation_status, 'VALID');
  const retainedPrompt = JSON.parse((await f.artifacts.read(row.prompt_sha256)).toString('utf8')) as { contractVersion: string; systemText: string };
  assert.equal(retainedPrompt.contractVersion, 'insight-model-prompt-v1');
  assert.equal(retainedPrompt.systemText, dispatchedSystemText, 'the dispatched system text is the retained prompt artifact');
  const before = f.db.prepare('SELECT total_changes() n').get();
  const replay = await f.service.proposeModelInsightCoding(workspaceId, runId, request, owner, null);
  assert.deepEqual(replay.proposal, { ...generated.proposal, exactRetry: true });
  assert.equal(calls, 1, 'an exact retry consults retained bytes, never the transport');
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  const invalidAttempt = { ...request, requestKey: randomUUID(), previousProposalId: generated.proposal.evidence.evidenceId };
  const invalid = await f.service.proposeModelInsightCoding(workspaceId, runId, invalidAttempt, owner, { configuration,
    port: { async generateText({ userText }: { userText: string }) {
      calls++;
      const payload = JSON.parse(userText);
      const annotations: InsightProposedAnnotations = { i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
      annotations.i04!.push({ recordIndex: payload.records[0].recordIndex,
        span: { start: 0, end: 5, quote: 'Invented quote' }, eventKind: 'ACTION_REPORTED', attribution: 'UNKNOWN',
        qualifiers: [], counterevidence: [],
        provenance: { basis: 'PENDING_AI', coderRole: 'semantic-coding-model-v1', adjudication: null, disagreement: null } });
      return { text: JSON.stringify(annotations) };
    } } });
  assert.equal(invalid.execution.status, 'INVALID');
  assert.equal(invalid.proposal, undefined);
  const beforeInvalidReplay = f.db.prepare('SELECT total_changes() n').get();
  const invalidReplay = await f.service.proposeModelInsightCoding(workspaceId, runId, invalidAttempt, owner, null);
  assert.equal(invalidReplay.execution.status, 'INVALID');
  assert.equal(invalidReplay.proposal, undefined);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeInvalidReplay);
  assert.equal(calls, 2, 'invalid settlement replays without another model call');
});
