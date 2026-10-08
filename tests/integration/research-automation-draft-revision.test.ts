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
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { AutomationInsightCoding } from '../../src/modules/analysis/research-automation/insight-coding.js';
import type { AutomationInsightCodingFamilyDraftSnapshot } from '../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';
import { JSDOM } from 'jsdom';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';

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
  let collectorStarts = 0;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, shopeeCollectorFactory: () => { collectorStarts++; return { requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }; },
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
  return { db, artifacts, service, worker, collectorStarts: () => collectorStarts };
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

async function adoptAndPropose(t: TestContext, withFamilies = false) {
  const semanticFixture = nextInsightFixture();
  const texts = withFamilies ? semanticFixture.records.slice(0, 2).map(row => row.text!) : ['Sản phẩm đóng gói cẩn thận, hộp còn nguyên seal.', 'Giao hàng nhanh, đóng gói kỹ.'];
  const f = await fixture(t, texts);
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const owner = { actorId: 'owner:draft-revision', role: 'OWNER' as const };
  const recordIndexes = [0, 1];
  const phrase = withFamilies ? 'size' : 'đóng gói';
  const span = (recordIndex: number) => {
    const text = source.input.records[recordIndex]!.text!;
    return locatedSpan(text, phrase);
  };
  const pending = { basis: 'PENDING_AI', coderRole: 'synthetic proposal', adjudication: null, disagreement: null };
  const corpusEntry = (sectionId: string) => ({ sectionId, recordIndexes, question: 'Which literal references occur?', unit: 'source-native record',
    period: 'Synthetic retained sample', frame: 'Two supplied records', channel: 'synthetic review',
    inclusionRule: 'All supplied records', membershipComplete: true, multiCode: false, externalSampling: 'UNKNOWN',
    codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: 0, firstSpan: span(0) }] },
    assignments: [], dispositions: [] });
  const rules = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
    rules: { ruleId: 'synthetic-draft-codes', revision: 1, question: 'Which explicit source-local statements occur?',
      inclusionRule: 'All retained synthetic records', adjudicationRule: 'Leave unresolved disagreements pending',
      corpora: [corpusEntry('I10'), corpusEntry('I13')] } };
  const adoption = await f.service.adoptInsightCodingRules(workspaceId, runId, rules, owner);
  const proposeRequest = { contractVersion: 'insight-coding-propose-v1',
    requestKey: randomUUID(), adoptionId: adoption.evidence.evidenceId, previousProposalId: null,
    annotations: { i06: [], i09: [], i13Mentions: [],
      i02: [{ recordIndex: 0, provenance: { ...pending }, qualifiers: [], counterevidence: [],
        role: { state: 'NOT_STATED', span: null }, situation: { state: 'NOT_STATED', span: null },
        task: { state: 'NOT_STATED', span: null }, setting: { state: 'NOT_STATED', span: null },
        time: { state: 'NOT_STATED', span: null } }],
      i04: [], i05: [], i07: [], i08: [],
      corpora: [0, 1].map(corpusIndex => ({ corpusIndex,
        assignments: [...recordIndexes.map(recordIndex => ({ recordIndex, code: 'C1', span: span(recordIndex), provenance: { ...pending } })),
          // Duplicate pending assignment: the same record and code count once.
          ...(corpusIndex === 0 ? [{ recordIndex: 0, code: 'C1', span: span(0), provenance: { ...pending } }] : [])],
        dispositions: recordIndexes.map(recordIndex => ({ recordIndex, state: 'CODED', provenance: { ...pending } })),
      })),
    } };
  let modelCalls = 0;
  let modelRequest: object | undefined;
  let modelAI: Parameters<typeof f.service.proposeModelInsightCoding>[4] | undefined;
  if (withFamilies) {
    for (const family of ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09'] as const)
      Object.assign(proposeRequest.annotations, { [family]: semanticFixture[family].filter(row => row.recordIndex < 2) });
    modelRequest = { contractVersion: 'insight-model-request-v1', requestKey: randomUUID(), adoptionId: adoption.evidence.evidenceId,
      previousProposalId: null, recordIndexes: [0, 1] };
    modelAI = { configuration: { contractVersion: 'insight-model-configuration-v1', providerId: 'synthetic', modelId: 'fixture-model',
      temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 },
      port: { async generateText() { modelCalls++; return { text: JSON.stringify(proposeRequest.annotations) }; } } };
  }
  const proposal = withFamilies
    ? (await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest!, owner, modelAI!)).proposal!
    : await f.service.proposeInsightCoding(workspaceId, runId, proposeRequest, owner);
  const proposalId = proposal.evidence.evidenceId;
  const revision = { contractVersion: 'automation-insight-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    draftInsight: { contractVersion: withFamilies ? 'insight-draft-select-v2' : 'insight-draft-select-v1', proposalId } };
  return { f, pair, owner, proposalId, revision, modelCalls: () => modelCalls, modelRequest, modelAI };
}

async function semanticOf(f: Awaited<ReturnType<typeof fixture>>, pairId: string, kind: 'MARKET' | 'INSIGHT'): Promise<Record<string, unknown>> {
  const versions = await f.service.listReportVersions(workspaceId, runId);
  const version = versions.find(item => item.pairId === pairId)!;
  const output = version.outputs.find(item => item.kind === kind)!;
  return JSON.parse((await f.artifacts.read(output.versionId)).toString('utf8')) as Record<string, unknown>;
}

test('receipt-free draft revision retains one exact proposal with zero receipts and labelled counts', async t => {
  const { f, pair, proposalId, revision } = await adoptAndPropose(t);

  assert.equal(validateRevision(revision), true, 'Draft revision validates canonically');
  const receipt = await f.service.requestReportRevision(workspaceId, runId, revision);
  assert.equal(receipt.exactRetry, false);
  f.worker.wake();
  const nextPairId = await waitCommitted(f.service, receipt.attemptId);
  assert.notEqual(nextPairId, pair.pairId);

  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, nextPairId);
  const html = report.bytes.toString('utf8');
  assert.match(html, /2 \(đề xuất, chờ chủ duyệt\)/, 'Draft corpus count renders nonzero with the same-sentence label');
  assert.match(html, /1 bản ghi \(đề xuất, chờ chủ duyệt\)\./, 'Draft I02 summary routes with the same-sentence label');
  assert.match(html, /Bản nháp này không dùng biên nhận chấp nhận; biên nhận đã lưu \(nếu có\) vẫn được giữ nguyên\./, 'Draft trace states no receipt use with history preserved');
  assert.match(html, /Số cho mục I04 là số cũ theo khai báo đã lưu, không phải số đề xuất của bản nháp và chưa được chủ duyệt\./, 'Unsupported draft family explanation qualifies retained counts');
  assert.match(html, /Bản nháp chưa tính số đề xuất cho mục I04 \(chỉ hỗ trợ I02\/I10\/I13\)\./, 'Unsupported draft family state says unavailable, not usable');
  assert.equal(html.includes('APPROVED'), false, 'No release claim leaks into the draft report');
  const i13Html = html.split('id="I13"')[1] ?? '';
  assert.match(i13Html, /Số bản ghi theo mã \(đề xuất, chờ chủ duyệt\)/, 'Draft I13 corpus table routes with the label');
  const semantic = await semanticOf(f, nextPairId, 'INSIGHT');
  assert.equal((semantic as { rendererVersion: string }).rendererVersion, 'automation-report-kit-v15',
    'Draft Insight reports carry the explicit draft renderer identity');
  const snapshot = (semantic as { insightCoding: Record<string, unknown> }).insightCoding as Record<string, unknown>;
  assert.equal(snapshot.contractVersion, 'automation-insight-coding-snapshot-v2', 'Retained snapshot is the explicit v2 branch');
  assert.deepEqual(snapshot.receipts, [], 'Retained draft snapshot carries zero receipts');
  assert.deepEqual(snapshot.draftSelection, { contractVersion: 'insight-draft-select-v1', proposalId });

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

test('optional receipt-before-draft works on the same pair without touching retained evidence', async t => {
  const { f, pair, owner, proposalId, revision } = await adoptAndPropose(t);
  const view = await f.service.readInsightCoding(workspaceId, runId, pair.pairId);
  const proposalSha256 = view.evidence.find(item => item.evidenceId === proposalId)!.sha256;
  const accepted = await f.service.acceptInsightCoding(workspaceId, runId, { contractVersion: 'insight-coding-accept-v1',
    requestKey: randomUUID(), proposalId, proposalSha256,
    selection: { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [], i05: [], i07: [], i08: [],
      i06: [], i09: [], i13Mentions: [],
      corpora: [{ corpusIndex: 0, assignments: [0], dispositions: [0] }] } }, owner);
  assert.equal(accepted.evidence.request.contractVersion, 'insight-coding-accept-v1');
  const draft = await f.service.requestReportRevision(workspaceId, runId, revision);
  assert.equal(draft.exactRetry, false);
  f.worker.wake();
  const nextPairId = await waitCommitted(f.service, draft.attemptId);
  const html = (await f.service.readReport(workspaceId, runId, 'INSIGHT', false, nextPairId)).bytes.toString('utf8');
  assert.match(html, /2 \(đề xuất, chờ chủ duyệt\)/, 'Draft counts survive optional acceptance');
  const receiptRows = f.db.prepare(`SELECT count(*) n FROM analysis_insight_coding_evidence WHERE run_id=? AND kind='RECEIPT'`).all(runId) as { n: number | bigint }[];
  assert.equal(Number(receiptRows[0]!.n), 1, 'The optional receipt row is retained untouched');
  const reread = await f.service.readInsightCoding(workspaceId, runId, pair.pairId);
  const rereadProposal = reread.evidence.find(item => item.evidenceId === proposalId)!;
  assert.equal(rereadProposal.request.contractVersion, 'insight-coding-propose-v1');
  assert.deepEqual(rereadProposal.request.contractVersion === 'insight-coding-propose-v1'
    ? rereadProposal.request.annotations.corpora[0]!.assignments[0]!.provenance : null,
    { basis: 'PENDING_AI', coderRole: 'synthetic proposal', adjudication: null, disagreement: null },
    'Proposal provenance never rewritten');
});

test('v2 fake-model proposal flows through service revision to all draft families and authenticated I11 counts with exact replay', async t => {
  const { f, pair, owner, proposalId, revision, modelCalls, modelRequest } = await adoptAndPropose(t, true);
  assert.equal(modelCalls(), 1);
  const collectorStarts = f.collectorStarts();
  const oldHtml = (await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId)).bytes;
  assert.equal(validateRevision(revision), true);
  const receipt = await f.service.requestReportRevision(workspaceId, runId, revision);
  f.worker.wake();
  const nextPairId = await waitCommitted(f.service, receipt.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, nextPairId);
  const semantic = await semanticOf(f, nextPairId, 'INSIGHT');
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v17');
  const snapshot = semantic.insightCoding as AutomationInsightCodingFamilyDraftSnapshot;
  assert.equal(snapshot.contractVersion, 'automation-insight-coding-snapshot-v3');
  assert.deepEqual(snapshot.draftSelection, { contractVersion: 'insight-draft-select-v2', proposalId });
  assert.equal(snapshot.binding.pairId, pair.pairId);
  assert.deepEqual(snapshot.receipts, []);
  assert.equal(snapshot.output.input.draftCountsVersion, 'draft-counts-v2');
  for (const id of ['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09'] as const) {
    assert.ok(snapshot.output.sections[id].draftLocatedRecordCount! > 0, id);
    const html = report.bytes.toString('utf8').split(`id="${id}"`)[1]!.split('<section')[0]!;
    assert.match(html, /data-classified="pending">[12] bản ghi \(đề xuất, chờ chủ duyệt\)\./, id);
    assert.ok(!html.includes('chỉ hỗ trợ I02/I10/I13'));
  }
  assert.equal(snapshot.output.sections.I05.draftRecordPolarities![0]!.polarity, 'MIXED');
  assert.equal(snapshot.output.sections.I06.draftSequences!.length, 1);
  assert.deepEqual(snapshot.output.sections.I09.draftCandidates!.map(row => row.unmetNeedCandidate), [true, false]);
  assert.equal(snapshot.groupCounts.platform, 'SHOPEE');
  assert.equal(snapshot.groupCounts.groups.length, 2, 'Distinct I10 and I13 corpora stay separate');
  for (const group of snapshot.groupCounts.groups) {
    assert.equal(group.memberCount, 2);
    assert.deepEqual(group.memberRecordPointers, ['/input/records/0', '/input/records/1']);
    assert.equal(group.counts[0]!.recordCount, 2);
    assert.equal(group.buyerType, null);
  }
  assert.equal(snapshot.groupCounts.rates, null);
  assert.equal(snapshot.groupCounts.differences, null);
  assert.ok(snapshot.groupCounts.blockers.includes('I11_CROSS_CHECK_UNAVAILABLE'));
  const rendered = report.bytes.toString('utf8');
  assert.ok(lintVisibleReportText(rendered).every(check => check.ok), 'v17 invokes the same shared visible-text lint');
  const document = new JSDOM(rendered).window.document;
  for (const id of ['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I11', 'I13']) {
    const section = document.getElementById(id)!;
    const counts = [...section.querySelectorAll('p, td, caption, summary')].filter(node =>
      /^(?:[0-9]+ bản ghi|[0-9]+ \(đề xuất|Chú giải đề xuất, chờ chủ duyệt \([0-9]+\)|Phạm vi nhóm có [0-9]+)/.test(node.textContent ?? ''));
    assert.ok(counts.length > 0, `${id}: actual classified numeric nodes exist`);
    for (const node of counts) {
      assert.equal(node.getAttribute('data-classified') ?? node.querySelector('[data-classified]')?.getAttribute('data-classified'), 'pending', `${id}: each generated numeric cell/span is marked`);
      assert.match(node.textContent!, /đề xuất, chờ chủ duyệt/, `${id}: label belongs to the measurement node`);
    }
  }
  const unlabelled = rendered.replace(/(<p data-classified="pending">[12] bản ghi) \(đề xuất, chờ chủ duyệt\)/, '$1');
  assert.equal(lintVisibleReportText(unlabelled).find(check => check.rule === 'U13_PENDING_NUMBER')!.ok, false);
  assert.equal(lintVisibleReportText(rendered.replace('Số đề xuất từ cùng hồ sơ', 'Tốt nhất trong mẫu. Số đề xuất từ cùng hồ sơ')).find(check => check.rule === 'U13_SUPERLATIVE')!.ok, false);
  const i11 = report.bytes.toString('utf8').split('id="I11"')[1]!.split('<section')[0]!;
  assert.match(i11, /2 bản ghi \(đề xuất, chờ chủ duyệt\)/);
  assert.match(i11, /Chưa công bố tỷ lệ/);
  assert.match(i11, /chưa có bằng chứng|Chưa có bằng chứng/);
  assert.equal(Number((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind='RECEIPT'").get() as { n: number }).n), 0);

  const verifier = new AutomationInsightCoding({ db: f.db, artifacts: f.artifacts, now,
    context: (...args) => f.service.readInsightSourceContext(...args), assertCurrent: async () => {} });
  const before = f.db.prepare('SELECT total_changes() n').get();
  const selected = { contractVersion: 'insight-draft-select-v2' as const, proposalId };
  const replay = await verifier.verifyReportDraftSnapshot(snapshot, workspaceId, runId, pair.pairId, selected);
  assert.deepEqual(replay, snapshot);
  const forged = structuredClone(snapshot); forged.groupCounts.groups[0]!.counts[0]!.recordCount = 99;
  await assert.rejects(verifier.verifyReportDraftSnapshot(forged, workspaceId, runId, pair.pairId, selected), /verification|Integrity/i);
  await assert.rejects(verifier.verifyReportDraftSnapshot(snapshot, workspaceId, runId, pair.pairId, { contractVersion: 'insight-draft-select-v1', proposalId }), /verification|Integrity/i);
  const retried = await f.service.requestReportRevision(workspaceId, runId, revision);
  assert.equal(retried.exactRetry, true);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, nextPairId)).bytes, report.bytes);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId)).bytes, oldHtml);
  await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest!, owner, null);
  assert.equal(modelCalls(), 1, 'Retained execution and report replay never call the fake model again');
  assert.equal(f.collectorStarts(), collectorStarts, 'Draft revision and replay never start another collector');
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before, 'Replay/rejected forged snapshots perform no writes');
});
