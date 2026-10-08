import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { ResearchAutomationWorker } from '../../src/modules/analysis/research-automation/worker.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import revisionSchema from '../../contracts/analysis/automation-insight-report-revision.schema.json' with { type: 'json' };
import classifiedRevisionSchema from '../../contracts/analysis/automation-classified-report-revision.schema.json' with { type: 'json' };
import { locatedSpan } from '../helpers/located-insight-fixture.js';

// U-03 real receipt-free draft flow through the owning service: one exact
// retained AI proposal, zero acceptance receipts, nonzero labelled counts,
// immutable replay. Owner HTTP/API boundary coverage stays in
// research-automation-api.test.ts; this file owns the service path only.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-08T00:00:00.000Z');

const validateRevision = (() => {
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false });
addFormats(ajv);
ajv.addSchema(classifiedRevisionSchema);
ajv.addSchema(revisionSchema);
  return ajv.compile({ $ref: `${(revisionSchema as { $id: string }).$id}` });
})();

async function fixture(t: TestContext, texts: string[]) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-insight-draft-revision-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'insight-draft-revision', title: 'Synthetic draft revision' });
  const raw = Buffer.from(JSON.stringify(texts.map((comment, index) => ({ shopId: '78085196', itemId: '17678138164', reviewId: `synthetic-${index}`, comment, ratingStar: 5 }))));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, shopeeCollectorFactory: () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }),
    renderer: (input, kind) => buildResearchAutomationReport(input, kind) });
  const worker = new ResearchAutomationWorker({ service, db });
  t.after(async () => { await worker.close(); db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await worker.start();
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic draft revision', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic draft records, not pilot source',
    includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [url] });
  await service.processNext(); await service.processNext();
  return { db, artifacts, service, worker };
}

async function waitCommitted(service: ResearchAutomationService, attemptId: string): Promise<string> {
  for (let poll = 0; poll < 400; poll++) {
    const attempts = await service.listReportAttempts(workspaceId, runId);
    const attempt = attempts.find(item => item.attemptId === attemptId);
    if (attempt?.state === 'COMMITTED' && attempt.pairId) return attempt.pairId;
    assert.ok(!attempt || attempt.state === 'QUEUED' || attempt.state === 'RUNNING', JSON.stringify(attempt?.state));
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Draft revision worker did not settle');
}

test('receipt-free draft revision retains one exact proposal with zero receipts and labelled counts', async t => {
  const texts = ['Sản phẩm đóng gói cẩn thận, hộp còn nguyên seal.', 'Giao hàng nhanh, đóng gói kỹ.'];
  const f = await fixture(t, texts);
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const owner = { actorId: 'owner:draft-revision', role: 'OWNER' as const };
  const recordIndexes = [0, 1];
  const phrase = 'đóng gói';
  const span = (recordIndex: number) => {
    const text = source.input.records[recordIndex]!.text!;
    return locatedSpan(text, phrase);
  };
  const pending = { basis: 'PENDING_AI', coderRole: 'synthetic proposal', adjudication: null, disagreement: null };
  const rules = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
    rules: { ruleId: 'synthetic-draft-codes', revision: 1, question: 'Which explicit source-local statements occur?',
      inclusionRule: 'All retained synthetic records', adjudicationRule: 'Leave unresolved disagreements pending',
      corpora: [{ sectionId: 'I10', recordIndexes, question: 'Which literal references occur?', unit: 'source-native record',
        period: 'Synthetic retained sample', frame: 'Two supplied records', channel: 'synthetic review',
        inclusionRule: 'All supplied records', membershipComplete: true, multiCode: false, externalSampling: 'UNKNOWN',
        codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: 0, firstSpan: span(0) }] },
        assignments: [], dispositions: [] }] } };
  const adoption = await f.service.adoptInsightCodingRules(workspaceId, runId, rules, owner);
  const proposal = await f.service.proposeInsightCoding(workspaceId, runId, { contractVersion: 'insight-coding-propose-v1',
    requestKey: randomUUID(), adoptionId: adoption.evidence.evidenceId, previousProposalId: null,
    annotations: { i06: [], i09: [], i13Mentions: [],
      corpora: [{ corpusIndex: 0,
        assignments: recordIndexes.map(recordIndex => ({ recordIndex, code: 'C1', span: span(recordIndex), provenance: { ...pending } })),
        dispositions: recordIndexes.map(recordIndex => ({ recordIndex, state: 'CODED', provenance: { ...pending } })) }] } }, owner);
  const proposalId = proposal.evidence.evidenceId;

  const revision = { contractVersion: 'automation-insight-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    draftInsight: { contractVersion: 'insight-draft-select-v1', proposalId } };
  assert.equal(validateRevision(revision), true, 'Draft revision validates canonically');
  const receipt = await f.service.requestReportRevision(workspaceId, runId, revision);
  assert.equal(receipt.exactRetry, false);
  f.worker.wake();
  const nextPairId = await waitCommitted(f.service, receipt.attemptId);
  assert.notEqual(nextPairId, pair.pairId);

  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, nextPairId);
  const html = report.bytes.toString('utf8');
  assert.match(html, /2 \(đề xuất, chờ chủ duyệt\)/, 'Draft corpus count renders nonzero with the same-sentence label');
  assert.equal(html.includes('APPROVED'), false, 'No release claim leaks into the draft report');

  const stored = f.db.prepare(`SELECT count(*) n FROM analysis_insight_coding_evidence WHERE run_id=? AND kind='RECEIPT'`).get(runId) as { n: number | bigint };
  assert.equal(Number(stored.n), 0, 'Zero acceptance receipts exist on this flow');

  // Immutable replay: the same request key replays byte-identically with no new writes.
  const before = f.db.prepare('SELECT total_changes() n').get();
  const replay = await f.service.requestReportRevision(workspaceId, runId, revision);
  assert.equal(replay.exactRetry, true);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);

  // Legacy v1 acceptance payloads still validate byte-identically.
  const { draftInsight: _dropped, ...legacyBase } = revision;
  assert.equal(validateRevision({ ...legacyBase, acceptedInsight: { proposalId, receiptIds: [randomUUID()] } }), true,
    'Legacy v1 acceptance still validates');
  assert.equal(validateRevision({ ...legacyBase, acceptedInsight: { proposalId, receiptIds: [] } }), false,
    'Empty receipt lists never pass as v1 acceptance');
  assert.equal(validateRevision({ ...legacyBase, draftInsight: { contractVersion: 'insight-draft-select-v1', proposalId },
    acceptedInsight: { proposalId, receiptIds: [randomUUID()] } }), false, 'Both branches never validate together');
  assert.equal(validateRevision(legacyBase), false, 'Neither branch never validates');

  // Wrong workspace/run/pair/proposal fail without touching retained evidence.
  // Note: the committed draft revision advanced the current pair, so negatives
  // target the new head except the stale-pair case, which must conflict.
  const otherWorkspace = '99999999-9999-4999-8999-999999999999';
  await assert.rejects(f.service.requestReportRevision(otherWorkspace, runId, { ...revision, requestKey: randomUUID() }), /not found|NOT_FOUND|found/i);
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId,
    { ...revision, requestKey: randomUUID(), previousPairId: pair.pairId }), /conflict|current|CONFLICT/i);
  const headRevision = { ...revision, previousPairId: nextPairId };
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId,
    { ...headRevision, requestKey: randomUUID(), draftInsight: { contractVersion: 'insight-draft-select-v1', proposalId: randomUUID() } }),
    /not found|NOT_FOUND|found/i);
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId,
    { ...headRevision, requestKey: randomUUID(), draftInsight: { contractVersion: 'insight-draft-select-v1', proposalId }, acceptedInsight: { proposalId, receiptIds: [randomUUID()] } }),
    /invalid|VALIDATION/i);
  const receiptsAfter = f.db.prepare(`SELECT count(*) n FROM analysis_insight_coding_evidence WHERE run_id=? AND kind='RECEIPT'`).get(runId) as { n: number | bigint };
  assert.equal(Number(receiptsAfter.n), 0, 'Rejected requests retain nothing');
});
