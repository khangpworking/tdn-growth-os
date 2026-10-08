import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { createRequire } from 'node:module';
import { JSDOM } from 'jsdom';
import apiSchema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector, CollectionPendingError } from '../../src/platform/collectors/apify-shopee.js';
import { AutomationExactShopeeBridge, type ShopeeCollectorFactory } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { MAX_HTML_BYTES } from '../../src/modules/analysis/research-automation/model.js';
import { AutomationLocatedReviewBridge, locatedScopeWorkingQuestion } from '../../src/modules/analysis/research-automation/located-review-bridge.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import type { InsightCodingAdoptRequest, InsightCodingProposeRequest } from '../../contracts/analysis/automation-insight-coding.generated.js';
import type { AutomationInsightSelection } from '../../contracts/analysis/automation-insight-selection.generated.js';
import type { AutomationInsightCodingSnapshot } from '../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import { locatedSpan } from '../helpers/located-insight-fixture.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true, allErrors: true });
(require('ajv-formats') as typeof import('ajv-formats')).default(ajv);
ajv.addSchema(apiSchema);
const validateRun = ajv.getSchema(`${apiSchema.$id}#/$defs/run`)!;
const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
function assertRunContract(run: unknown) { assert.equal(validateRun(run), true, JSON.stringify(validateRun.errors)); }
type ReportInput = Parameters<typeof buildResearchAutomationReport>[0];
async function fixture(t: TestContext, factory?: ShopeeCollectorFactory, oversizedView = false, keyword = 'Synthetic coconut jelly',
  onRender?: (input: ReportInput, kind: 'MARKET' | 'INSIGHT') => void) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-exact-review-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'exact-review', title: 'Synthetic exact review acceptance' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, ...(factory ? { shopeeCollectorFactory: factory } : {}), renderer: (input, kind) => {
      onRender?.(input, kind);
      const rendered = buildResearchAutomationReport(input, kind);
      return oversizedView && kind === 'INSIGHT' && input.reviewCorpus ? { ...rendered, html: Buffer.alloc(MAX_HTML_BYTES + 1, 'x') } : rendered;
    } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword, requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision,
    definition: 'Synthetic exact listing, not a TikTok substitute', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], exactShopeeUrls: [url] };
  return { root, db, artifacts, service, confirm };
}

// Primary owner proof: persisted source -> selections -> immutable report revision and replay.
test('Insight coding persists selected evidence against one exact source without changing old reports or shrinking its corpus', async t => {
  for (const product of ['thạch dừa', 'bình giữ nhiệt', 'quạt cầm tay']) await t.test(product, async t => {
    let calls = 0;
    const texts = [`Tôi đã mua ${product} rồi dùng. Tôi muốn nhỏ hơn nhưng hiện còn to. Tôi mua vì dễ mang. Tôi muốn đặt thêm nhưng hết hàng. Tôi thích màu nhưng không thích nắp.`, `Tôi đã dùng ${product}, muốn nhỏ hơn.`, 'Tôi đã mua sản phẩm, chưa nêu chủ đề.'];
    const raw = Buffer.from(JSON.stringify(texts.map((comment, index) => ({ shopId: '78085196', itemId: '17678138164', reviewId: `synthetic-${index}`, comment, ratingStar: 5 }))));
    const f = await fixture(t, () => ({ requestsIssued: () => calls, collector: { mode: 'fixture', collect: async (...args) => { calls++; return new FixtureShopeeCollector(raw).collect(...args); } } }), false, `Synthetic ${product}`);
    await f.service.confirmScope(workspaceId, runId, f.confirm);
    await f.service.processNext(); await f.service.processNext();
    const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
    const original = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
    const originalMarket = await f.service.readReport(workspaceId, runId, 'MARKET', false, pair.pairId);
    const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
    assert.equal(source.input.records.length, 3);
    const index = (text: string) => source.input.records.findIndex(record => record.text === text);
    const first = index(texts[0]!); const second = index(texts[1]!); const third = index(texts[2]!);
    assert.ok(first >= 0 && second >= 0 && third >= 0);
    const span = (recordIndex: number, quote: string) => locatedSpan(source.input.records[recordIndex]!.text!, quote);
    const provenance = { basis: 'PENDING_AI' as const, coderRole: 'synthetic proposal', adjudication: null, disagreement: null };
    const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
    const rules: InsightCodingAdoptRequest = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
      rules: { ruleId: 'synthetic-literal-codes', revision: 1, question: 'Which explicit source-local statements occur?', inclusionRule: 'All three retained synthetic records',
        adjudicationRule: 'Leave unresolved disagreements pending', corpora: (['I10', 'I13'] as const).map(sectionId => {
          const phrase = sectionId === 'I10' ? 'nhỏ hơn' : product;
          return { sectionId, recordIndexes: [first, second, third, first], question: 'Which literal references occur?', unit: 'source-native record',
            period: 'Synthetic retained sample', frame: 'Three supplied records', channel: 'synthetic review', inclusionRule: 'All supplied records',
            membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
            codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: first, firstSpan: span(first, phrase) }] }, assignments: [], dispositions: [] };
        }) } };
    const before = f.db.prepare('SELECT total_changes() n').get();
    await assert.rejects(f.service.adoptInsightCodingRules(workspaceId, runId, rules, { ...owner, role: 'VIEWER' as 'OWNER' }), /Invalid/);
    await assert.rejects(f.service.adoptInsightCodingRules(workspaceId, runId, { ...rules, binding: { ...rules.binding, inputSha256: 'f'.repeat(64) } }, owner), /changed/);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
    const adopted = await f.service.adoptInsightCodingRules(workspaceId, runId, rules, owner);
    const proposal: InsightCodingProposeRequest = { contractVersion: 'insight-coding-propose-v1', requestKey: randomUUID(), adoptionId: adopted.evidence.evidenceId, previousProposalId: null,
      annotations: {
      i02: [{ recordIndex: first, provenance, qualifiers: [], counterevidence: [],
        role: { state: 'NOT_STATED', span: null }, situation: { state: 'UNKNOWN', span: null },
        task: { state: 'SOURCE_STATED', span: span(first, 'muốn đặt thêm') }, setting: { state: 'NOT_STATED', span: null }, time: { state: 'NOT_STATED', span: null } }],
      i04: [{ recordIndex: first, provenance, qualifiers: [], counterevidence: [], span: span(first, `đã mua ${product}`), eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }],
      i05: (['thích màu', 'không thích nắp'] as const).map((quote, index) => ({ recordIndex: first, provenance, qualifiers: [], counterevidence: [],
        span: span(first, quote), polarity: index === 0 ? 'POSITIVE' as const : 'NEGATIVE' as const,
        target: { state: 'SOURCE_STATED' as const, span: span(first, index === 0 ? 'màu' : 'nắp') }, speakerAttribution: { state: 'UNKNOWN' as const, span: null } })),
      i07: [{ recordIndex: first, provenance, qualifiers: [], counterevidence: [], choiceText: span(first, 'Tôi mua'), reasonClause: span(first, 'dễ mang'),
        relation: { context: span(first, 'Tôi mua vì dễ mang.'), link: span(first, 'vì') }, reasonFacet: 'PRODUCT_ATTRIBUTE', reasonPolarity: 'AFFIRMED', speakerBasis: 'SELF_STATED', resultState: { state: 'NOT_STATED', span: null } }],
      i08: [{ recordIndex: first, provenance, qualifiers: [], counterevidence: [], attemptedTask: span(first, 'muốn đặt thêm'), obstacleClause: span(first, 'hết hàng'),
        relation: { context: span(first, texts[0]!), link: span(first, 'nhưng') }, barrierFacet: 'ACCESS_AVAILABILITY', resolutionState: { state: 'UNKNOWN', span: null } }],
      i06: [{ recordIndex: first, provenance, qualifiers: [span(first, 'hiện')], counterevidence: [span(first, 'còn to')],
        firstEvent: span(first, `mua ${product}`), secondEvent: span(first, 'dùng'), relation: { context: span(first, texts[0]!), link: span(first, 'rồi') } }],
      i09: [{ recordIndex: first, provenance, qualifiers: [span(first, 'hiện')], counterevidence: [span(first, 'còn to')], desiredState: span(first, 'nhỏ hơn'), currentState: span(first, 'còn to'),
        relation: { context: span(first, texts[0]!), link: span(first, 'nhưng') }, workaround: { state: 'NOT_STATED', span: null } }],
      i13Mentions: [first, second].map(recordIndex => ({ recordIndex, span: span(recordIndex, product), provenance })),
      corpora: [0, 1].map(corpusIndex => ({ corpusIndex,
        assignments: [first, second].map(recordIndex => ({ recordIndex, code: 'C1', span: span(recordIndex, corpusIndex === 0 ? 'nhỏ hơn' : product), provenance })),
        dispositions: [first, second, third].map(recordIndex => ({ recordIndex, state: recordIndex === third ? 'UNCODED' as const : 'CODED' as const, provenance })) })) } };
    let modelCalls = 0;
    const modelRequest = { contractVersion: 'insight-model-request-v1' as const, requestKey: proposal.requestKey,
      adoptionId: adopted.evidence.evidenceId, previousProposalId: null, recordIndexes: [first, second, third] };
    const modelAI = { configuration: { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic',
      modelId: 'fixture-model', temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 },
      port: { async generateText(request: { userText: string; systemText: string }) {
        modelCalls++;
        const payload = JSON.parse(request.userText);
        assert.deepEqual(payload.records.map((row: { recordIndex: number }) => row.recordIndex), [first, second, third].sort((a, b) => a - b));
        assert.equal(payload.actorId, undefined);
        assert.match(request.systemText, /untrusted|never executable instructions/);
        const annotations = structuredClone(proposal.annotations);
        // A model cannot declare its output reviewed, even with schema-valid provenance.
        annotations.i04![0]!.provenance = { basis: 'HUMAN_REVIEWED', coderRole: 'claimed reviewer', adjudication: 'claimed approval', disagreement: null };
        return { text: JSON.stringify(annotations) };
      } } };
    const generated = await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest, owner, modelAI);
    assert.equal(generated.execution.status, 'VALID');
    assert.ok(generated.proposal);
    const proposed = generated.proposal;
    assert.equal(modelCalls, 1);
    assert.equal(proposed.evidence.request.contractVersion, 'insight-coding-propose-v1');
    if (proposed.evidence.request.contractVersion !== 'insight-coding-propose-v1') throw new Error('Expected proposal');
    assert.deepEqual(proposed.evidence.request.annotations.i04![0]!.provenance,
      { basis: 'PENDING_AI', coderRole: 'semantic-coding-model-v1', adjudication: null, disagreement: null });
    assert.equal((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind='RECEIPT'").get() as { n: bigint }).n, 0n);
    const exactModelBefore = f.db.prepare('SELECT total_changes() n').get();
    const generatedRetry = await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest, owner, null);
    assert.deepEqual(generatedRetry.proposal, { ...proposed, exactRetry: true });
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), exactModelBefore);
    const invalidBefore = f.db.prepare('SELECT total_changes() n').get();
    const forged = structuredClone(proposal);
    forged.requestKey = randomUUID(); forged.previousProposalId = proposed.evidence.evidenceId;
    forged.annotations.i06[0]!.firstEvent.quote = 'Invented source text';
    await assert.rejects(f.service.proposeInsightCoding(workspaceId, runId, forged, owner), /SPAN_QUOTE_MISMATCH/);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), invalidBefore);
    const partial: AutomationInsightSelection = { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [0], i05: [], i07: [], i08: [], i06: [0], i09: [], i13Mentions: [], corpora: [{ corpusIndex: 0, assignments: [0], dispositions: [0] }] };
    const request = { contractVersion: 'insight-coding-accept-v1', requestKey: randomUUID(), proposalId: proposed.evidence.evidenceId, proposalSha256: proposed.sha256, selection: partial };
    await assert.rejects(f.service.acceptInsightCoding(workspaceId, runId, { ...request,
      selection: { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [], i13Mentions: [], corpora: [] } }, owner), /Invalid/);
    const accepted = await f.service.acceptInsightCoding(workspaceId, runId, request, owner);
    const projected = await f.service.resolveInsightCoding(workspaceId, runId, proposed.evidence.evidenceId, [accepted.evidence.evidenceId]);
    assert.equal(projected.output.sections.I06.sequences.length, 1);
    assert.equal(projected.output.sections.I09.candidates.length, 0);
    assert.equal(projected.output.sections.I04.locatedRecordCount, 1);
    for (const family of ['I02', 'I05', 'I07', 'I08'] as const) {
      assert.equal(projected.output.sections[family].locatedRecordCount, 0, `${family} cannot bypass selection`);
      assert.ok(projected.output.sections[family].pendingAnnotationPointers.length > 0);
    }
    assert.equal(projected.output.sections.I10.corpora[0]!.pendingCount, 2);
    assert.equal(projected.output.sections.I10.corpora[0]!.counts[0]!.ratio, null);
    assert.deepEqual(projected.output.input.records, source.input.records);
    const complete: AutomationInsightSelection = { contractVersion: 'automation-insight-selection-v2', i02: [0], i04: [0], i05: [0], i07: [0], i08: [0], i06: [0], i09: [0], i13Mentions: [0, 1],
      corpora: [0, 1].map(corpusIndex => ({ corpusIndex, assignments: [0, 1], dispositions: [0, 1, 2] })) };
    const completeRequest = { ...request, requestKey: randomUUID(), selection: complete };
    const full = await f.service.acceptInsightCoding(workspaceId, runId, completeRequest, owner);
    await assert.rejects(f.service.acceptInsightCoding(workspaceId, runId, { ...completeRequest, selection: partial }, owner), /changed/);
    const combined = await f.service.resolveInsightCoding(workspaceId, runId, proposed.evidence.evidenceId, [full.evidence.evidenceId, accepted.evidence.evidenceId]);
    assert.deepEqual(combined.output.sections.I10.corpora[0]!.counts[0]!.ratio, { numerator: 2, denominator: 3 });
    assert.deepEqual(combined.output.sections.I13.corpora[0]!.counts[0]!.ratio, { numerator: 2, denominator: 3 });
    assert.deepEqual(combined.output.input.i06[0]!.counterevidence, proposal.annotations.i06[0]!.counterevidence);
    assert.equal(combined.output.input.i06[0]!.provenance.basis, 'DECLARED');
    for (const family of ['I02', 'I04', 'I05', 'I07', 'I08'] as const) assert.equal(combined.output.sections[family].locatedRecordCount, 1);
    assert.deepEqual(combined.output.sections.I05.pendingAnnotationPointers, ['/input/i05/1']);
    assert.equal(combined.output.sections.I05.recordPolarities[0]!.polarity, 'POSITIVE', 'unselected negative clause is not silently counted');
    const revision = { contractVersion: 'automation-insight-report-revision-v1', requestKey: randomUUID(), previousPairId: pair.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      acceptedInsight: { proposalId: proposed.evidence.evidenceId, receiptIds: [full.evidence.evidenceId, accepted.evidence.evidenceId] } };
    const queued = await f.service.requestReportRevision(workspaceId, runId, revision);
    const queueRetryBefore = f.db.prepare('SELECT total_changes() n').get();
    assert.deepEqual(await f.service.requestReportRevision(workspaceId, runId, { ...revision, acceptedInsight: { ...revision.acceptedInsight, receiptIds: [...revision.acceptedInsight.receiptIds].reverse() } }), { ...queued, exactRetry: true });
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), queueRetryBefore);
    const aiBefore = f.db.prepare('SELECT * FROM analysis_research_automation_ai_executions ORDER BY execution_id').all();
    const newer = await f.service.proposeInsightCoding(workspaceId, runId, { ...proposal, requestKey: randomUUID(), previousProposalId: proposed.evidence.evidenceId }, owner);
    await assert.rejects(f.service.acceptInsightCoding(workspaceId, runId, { ...request, requestKey: randomUUID() }, owner), /changed/);
    await assert.rejects(f.service.acceptInsightCoding(workspaceId, runId, { ...request, requestKey: randomUUID(), proposalId: newer.evidence.evidenceId }, owner), /changed/);
    const retryBefore = f.db.prepare('SELECT total_changes() n').get();
    assert.deepEqual(await f.service.acceptInsightCoding(workspaceId, runId, completeRequest, owner), { ...full, exactRetry: true });
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), retryBefore);
    // Later proposal edits do not change the exact queued selection or redispatch AI.
    await f.service.processNext();
    const versions = await f.service.listReportVersions(workspaceId, runId);
    assert.equal(versions.length, 2);
    const current = versions.at(-1)!;
    assert.equal(current.versionNumber, 2);
    const revised = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, current.pairId);
    const semantic = JSON.parse((await f.artifacts.read(revised.versionId)).toString()) as { insightCoding: AutomationInsightCodingSnapshot; completion: { completedAnalyticalSections: number } };
    assert.equal(semantic.insightCoding.selection.proposalId, proposed.evidence.evidenceId);
    assert.deepEqual(semantic.insightCoding.output, combined.output);
    assert.equal(semantic.completion.completedAnalyticalSections, 0);
    const document = new JSDOM(revised.bytes.toString());
    try {
      for (const section of ['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I13']) {
        const content = document.window.document.getElementById(section)!.textContent!;
        assert.match(content, /Mã hóa lời nguồn · Kết quả từng phần/);
        assert.match(content, /biên nhận lựa chọn/, `${section} must use selected coding, not the original literal snapshot`);
      }
    } finally { document.window.close(); }
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false, current.pairId)).bytes, originalMarket.bytes);
    assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_ai_executions ORDER BY execution_id').all(), aiBefore);
    await assert.rejects(f.service.requestReportRevision(workspaceId, runId, { ...revision, requestKey: randomUUID(), previousPairId: current.pairId }), /changed/);
    assert.deepEqual(await f.service.requestReportRevision(workspaceId, runId, revision), { ...queued, state: 'COMMITTED', exactRetry: true, pairId: current.pairId });
    // One recovery/corruption proof, not repeated for each industry's identical storage path.
    if (product === 'thạch dừa') {
      const artifactPath = path.join(f.root, 'artifacts', 'sha256', full.sha256.slice(0, 2), full.sha256);
      const saved = await fs.readFile(artifactPath);
      const repairedBefore = f.db.prepare('SELECT total_changes() n').get();
      await fs.unlink(artifactPath);
      await assert.rejects(f.service.readInsightCodingEvidence(workspaceId, runId, full.evidence.evidenceId), /ENOENT/);
      assert.deepEqual(await f.service.acceptInsightCoding(workspaceId, runId, completeRequest, owner), { ...full, exactRetry: true });
      assert.deepEqual(await fs.readFile(artifactPath), saved, 'exact retry restores only exact registered bytes');
      assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), repairedBefore);
      await fs.writeFile(artifactPath, Buffer.from('corrupt'));
      await assert.rejects(f.service.acceptInsightCoding(workspaceId, runId, completeRequest, owner), /integrity|mismatch|size/i);
      await assert.rejects(f.service.readReport(workspaceId, runId, 'INSIGHT', false, current.pairId), /integrity|mismatch|size/i);
      await assert.rejects(f.service.requestReportRevision(workspaceId, runId, revision), /integrity|mismatch|size/i);
      assert.deepEqual(await fs.readFile(artifactPath), Buffer.from('corrupt'), 'corrupt existing artifacts are never repaired over');
      await fs.writeFile(artifactPath, saved);
      // One source lifecycle proof: KEEP retains selected coding; SKIP removes it
      // from the new report without removing history or silently switching corpora.
      await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: current.pairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
      await f.service.processNext();
      const keptPair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
      const kept = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, keptPair.pairId);
      assert.deepEqual(JSON.parse((await f.artifacts.read(kept.versionId)).toString()).insightCoding, semantic.insightCoding);
      await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: keptPair.pairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'SKIP' } } });
      await f.service.processNext();
      const skippedPair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
      assert.equal(skippedPair.versionNumber, 4);
      const skipped = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, skippedPair.pairId);
      assert.equal(JSON.parse((await f.artifacts.read(skipped.versionId)).toString()).insightCoding, undefined);
      assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, current.pairId)).bytes, revised.bytes);
    }
    assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId)).bytes, original.bytes);
    assert.equal(calls, 1, 'coding never recollects source data');
    const historicalModelBefore = f.db.prepare('SELECT total_changes() n').get();
    const historicalModel = await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest, owner, null);
    assert.deepEqual(historicalModel.proposal, { ...proposed, exactRetry: true });
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), historicalModelBefore);
    assert.equal(modelCalls, 1, 'report revision and historical retry never redispatch the model');
    const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
      now: () => { throw new Error('Readonly replay must not request time'); } });
    f.db.pragma('query_only=ON');
    assert.deepEqual((await reader.resolveInsightCoding(workspaceId, runId, proposed.evidence.evidenceId, [accepted.evidence.evidenceId, full.evidence.evidenceId])).bytes, combined.bytes);
    assert.deepEqual((await reader.readReport(workspaceId, runId, 'INSIGHT', false, current.pairId)).bytes, revised.bytes);
    f.db.pragma('query_only=OFF');
    assert.deepEqual(f.db.prepare('SELECT COUNT(*) n FROM analysis_insight_coding_evidence').get(), { n: 5n });
  });
});

test('model coding batches preserve other records and retain stale, invalid and unknown outcomes without repeat calls', async t => {
  const texts = ['Tôi đã mua sản phẩm.', 'Tôi đã dùng sản phẩm.'];
  const raw = Buffer.from(JSON.stringify(texts.map((comment, index) => ({ shopId: '78085196', itemId: '17678138164', reviewId: `batch-${index}`, comment, ratingStar: 5 }))));
  const f = await fixture(t, () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }));
  await f.service.confirmScope(workspaceId, runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const owner = { actorId: 'owner:model-batch', role: 'OWNER' as const };
  const ruleRequest = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
    rules: { ruleId: 'batch-v1', revision: 1, question: 'Explicit reported actions?', inclusionRule: 'All retained records', adjudicationRule: 'Human review required', corpora: [] } };
  const adoption = await f.service.adoptInsightCodingRules(workspaceId, runId, ruleRequest, owner);
  const configuration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic', modelId: 'batch-model', temperature: null,
    maxOutputTokens: 1000, timeoutMs: 1000, maxResponseBytes: 65536 };
  const annotations = (recordIndex: number) => ({ i02: [], i04: [{ recordIndex,
    span: locatedSpan(source.input.records[recordIndex]!.text!, source.input.records[recordIndex]!.text!), eventKind: 'ACTION_REPORTED' as const,
    attribution: 'SELF_REPORTED' as const, qualifiers: [], counterevidence: [],
    provenance: { basis: 'PENDING_AI' as const, coderRole: 'model', adjudication: null, disagreement: null } }],
    i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] });
  const request = (index: number, previousProposalId: string | null) => ({ contractVersion: 'insight-model-request-v1', requestKey: randomUUID(),
    adoptionId: adoption.evidence.evidenceId, previousProposalId, recordIndexes: [index] });
  let calls = 0;
  const ai = (index: number) => ({ configuration, port: { async generateText({ userText }: { userText: string }) {
    calls++; assert.deepEqual(JSON.parse(userText).records.map((row: { recordIndex: number }) => row.recordIndex), [index]);
    return { text: JSON.stringify(annotations(index)) };
  } } });
  const firstRequest = request(0, null);
  await assert.rejects(f.service.proposeModelInsightCoding(workspaceId, runId, firstRequest, { ...owner, role: 'VIEWER' as 'OWNER' }, ai(0)), /Invalid/);
  assert.equal(calls, 0);
  const first = await f.service.proposeModelInsightCoding(workspaceId, runId, firstRequest, owner, ai(0));
  assert.ok(first.proposal);
  const second = await f.service.proposeModelInsightCoding(workspaceId, runId, request(1, first.proposal.evidence.evidenceId), owner, ai(1));
  assert.ok(second.proposal);
  if (second.proposal.evidence.request.contractVersion !== 'insight-coding-propose-v1') throw new Error('Expected proposal');
  assert.deepEqual(second.proposal.evidence.request.annotations.i04!.map(row => row.recordIndex), [0, 1]);
  assert.equal(calls, 2);
  let winningId = '';
  const winningKey = randomUUID();
  const stale = request(0, second.proposal.evidence.evidenceId);
  // Exercise stale publication independently of wall-clock filesystem latency.
  // The separate timeout test below owns deadline/late-response behavior.
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await assert.rejects(async () => {
      const result = await f.service.proposeModelInsightCoding(workspaceId, runId, stale, owner, { configuration,
        port: { async generateText() {
          calls++;
          const winner = await f.service.proposeInsightCoding(workspaceId, runId, { contractVersion: 'insight-coding-propose-v1', requestKey: winningKey,
            adoptionId: adoption.evidence.evidenceId, previousProposalId: second.proposal!.evidence.evidenceId, annotations: annotations(1) }, owner);
          winningId = winner.evidence.evidenceId;
          return { text: JSON.stringify(annotations(0)) };
        } } });
      assert.fail(`Expected stale proposal rejection; execution=${JSON.stringify(result.execution)}`);
    }, /changed/);
  } finally {
    t.mock.timers.reset();
  }
  assert.equal((f.db.prepare("SELECT evidence_id FROM analysis_insight_coding_evidence WHERE parent_id=? AND kind='PROPOSAL' ORDER BY sequence DESC LIMIT 1")
    .get(adoption.evidence.evidenceId) as { evidence_id: string }).evidence_id, winningId);
  assert.equal(f.db.prepare('SELECT evidence_id FROM analysis_insight_coding_evidence WHERE request_key=?').get(stale.requestKey), undefined);
  assert.equal(calls, 3);
  await assert.rejects(f.service.proposeModelInsightCoding(workspaceId, runId, { ...request(0, winningId), requestKey: winningKey }, owner, ai(0)), /changed/);
  assert.equal(calls, 3, 'a key consumed by a manual action never starts a paid model call');
  const staleBefore = f.db.prepare('SELECT total_changes() n').get();
  await assert.rejects(f.service.proposeModelInsightCoding(workspaceId, runId, stale, owner, null), /changed/);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), staleBefore);
  assert.equal((f.db.prepare('SELECT validation_status FROM analysis_research_automation_ai_executions WHERE coding_request_key=?').get(stale.requestKey) as { validation_status: string }).validation_status, 'VALID');
  for (const variant of ['invalid', 'unknown'] as const) {
    const attempt = request(0, winningId);
    const result = await f.service.proposeModelInsightCoding(workspaceId, runId, attempt, owner, { configuration, port: { async generateText() {
      calls++;
      if (variant === 'unknown') throw new Error('synthetic disconnected transport');
      const wrong = annotations(0); wrong.i04[0]!.span.quote = 'Invented quote'; return { text: JSON.stringify(wrong) };
    } } });
    assert.equal(result.execution.status, variant === 'invalid' ? 'INVALID' : 'DISPATCH_UNKNOWN');
    assert.equal(result.proposal, undefined);
    const before = f.db.prepare('SELECT total_changes() n').get();
    const retry = await f.service.proposeModelInsightCoding(workspaceId, runId, attempt, owner, null);
    assert.equal(retry.execution.status, result.execution.status);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  }
  assert.equal(calls, 5);
  await f.service.adoptInsightCodingRules(workspaceId, runId, { ...ruleRequest, requestKey: randomUUID(), rules: { ...ruleRequest.rules, revision: 2 } }, owner);
  await assert.rejects(f.service.proposeModelInsightCoding(workspaceId, runId, request(0, winningId), owner, ai(0)), /EXECUTION_IDENTITY_CONFLICT/);
  const retry = await f.service.proposeModelInsightCoding(workspaceId, runId, firstRequest, owner, null);
  assert.deepEqual(retry.proposal, { ...first.proposal, exactRetry: true });
  await assert.rejects(f.service.proposeModelInsightCoding(workspaceId, runId, firstRequest, { ...owner, actorId: 'different-owner' }, null), /EXECUTION_IDENTITY_CONFLICT/);
  assert.equal(calls, 5);
  assert.equal((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind='RECEIPT'").get() as { n: bigint }).n, 0n);
});

test('model coding timeout retains unknown and ignores a late valid response after a manual winner', async t => {
  const text = 'Tôi đã mua sản phẩm.';
  const raw = Buffer.from(JSON.stringify([{ shopId: '78085196', itemId: '17678138164', reviewId: 'timeout-0', comment: text, ratingStar: 5 }]));
  const f = await fixture(t, () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(raw) }));
  await f.service.confirmScope(workspaceId, runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  const pair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  const source = await f.service.readInsightSourceContext(workspaceId, runId, pair.pairId);
  const owner = { actorId: 'owner:model-timeout', role: 'OWNER' as const };
  const adoption = await f.service.adoptInsightCodingRules(workspaceId, runId, {
    contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
    rules: { ruleId: 'timeout-v1', revision: 1, question: 'Explicit reported actions?', inclusionRule: 'All retained records', adjudicationRule: 'Human review required', corpora: [] },
  }, owner);
  const annotations = { i02: [], i04: [{ recordIndex: 0, span: locatedSpan(text, text), eventKind: 'ACTION_REPORTED' as const,
    attribution: 'SELF_REPORTED' as const, qualifiers: [], counterevidence: [],
    provenance: { basis: 'PENDING_AI' as const, coderRole: 'model', adjudication: null, disagreement: null } }],
    i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
  const request = { contractVersion: 'insight-model-request-v1', requestKey: randomUUID(), adoptionId: adoption.evidence.evidenceId,
    previousProposalId: null, recordIndexes: [0] };
  const configuration = { contractVersion: 'insight-model-configuration-v1' as const, providerId: 'synthetic', modelId: 'timeout-model',
    temperature: null, maxOutputTokens: 1000, timeoutMs: 1000, maxResponseBytes: 65536 };
  let enter!: (signal: AbortSignal) => void;
  let failEntry!: (error: unknown) => void;
  const entered = new Promise<AbortSignal>((resolve, reject) => { enter = resolve; failEntry = reject; });
  let release!: (value: { text: string }) => void;
  const response = new Promise<{ text: string }>(resolve => { release = resolve; });
  let markReturned!: () => void;
  const returned = new Promise<void>(resolve => { markReturned = resolve; });
  let calls = 0;
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const pending = f.service.proposeModelInsightCoding(workspaceId, runId, request, owner, { configuration,
      port: { async generateText({ signal }) {
        calls++;
        assert.ok(signal);
        enter(signal);
        const value = await response;
        markReturned();
        return value;
      } },
    });
    // Observe failures immediately while the test coordinates the synthetic port.
    pending.catch(failEntry);
    const signal = await entered;
    const winner = await f.service.proposeInsightCoding(workspaceId, runId, {
      contractVersion: 'insight-coding-propose-v1', requestKey: randomUUID(), adoptionId: adoption.evidence.evidenceId,
      previousProposalId: null, annotations,
    }, owner);
    t.mock.timers.tick(configuration.timeoutMs - 1);
    assert.equal(signal.aborted, false);
    t.mock.timers.tick(1);
    assert.equal(signal.aborted, true);
    assert.match(String(signal.reason), /INSIGHT_CODING_DISPATCH_TIMEOUT/);
    const result = await pending;
    assert.equal(result.execution.status, 'DISPATCH_UNKNOWN');
    if (result.execution.status !== 'DISPATCH_UNKNOWN') assert.fail('Expected unknown timeout outcome');
    assert.equal(result.execution.unknownCode, 'TRANSPORT_OUTCOME_AMBIGUOUS');
    assert.equal(result.execution.dispatched, true);
    assert.equal(result.proposal, undefined);
    assert.equal(calls, 1);
    const before = f.db.prepare('SELECT total_changes() n').get();
    release({ text: JSON.stringify(annotations) });
    await returned;
    // Drain the real event loop after the late transport resolves, without advancing timers.
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
    assert.equal((f.db.prepare("SELECT evidence_id FROM analysis_insight_coding_evidence WHERE parent_id=? AND kind='PROPOSAL' ORDER BY sequence DESC LIMIT 1")
      .get(adoption.evidence.evidenceId) as { evidence_id: string }).evidence_id, winner.evidence.evidenceId);
    assert.equal(f.db.prepare('SELECT evidence_id FROM analysis_insight_coding_evidence WHERE request_key=?').get(request.requestKey), undefined);
    assert.deepEqual(f.db.prepare('SELECT state, validation_status, candidates_sha256, unknown_code FROM analysis_research_automation_ai_executions WHERE coding_request_key=?')
      .get(request.requestKey), { state: 'DISPATCH_UNKNOWN', validation_status: null, candidates_sha256: null, unknown_code: 'TRANSPORT_OUTCOME_AMBIGUOUS' });
    const retry = await f.service.proposeModelInsightCoding(workspaceId, runId, request, owner, null);
    assert.deepEqual(retry.execution, { ...result.execution, dispatched: false });
    assert.equal(retry.proposal, undefined);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
    assert.equal(calls, 1, 'timeout replay never redispatches the model');
  } finally {
    release({ text: JSON.stringify(annotations) });
    t.mock.timers.reset();
  }
});

test('explicit listing scope flows through collection and frozen corpus to both reports without a discovery substitute', async t => {
  let calls = 0;
  const raw = Buffer.from(JSON.stringify([
    { shopId: '78085196', itemId: '17678138164', reviewId: 'synthetic-1', comment: 'Tôi đã dùng sản phẩm.', ratingStar: 9, author: 'Do not project me' },
    { shopId: '78085196', itemId: '17678138164', reviewId: 'synthetic-2', comment: '“Tôi đã mua sản phẩm. <script>bad()</script>”', ratingStar: 5 },
    { shopId: '99', itemId: '1', reviewId: 'foreign', comment: 'Wrong product', ratingStar: 5 },
  ]));
  const state = await fixture(t, () => ({ requestsIssued: () => 0, collector: { mode: 'fixture', collect: async (...args) => { calls++; return new FixtureShopeeCollector(raw).collect(...args); } } }));
  await assert.rejects(state.service.confirmScope(workspaceId, runId, { ...state.confirm, exactShopeeUrls: [url, 'https://shopee.vn/x-i.78085196.17678138164'] }), /distinct/);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  assert.equal((await state.service.confirmScope(workspaceId, runId, state.confirm)).exactRetry, true);
  assert.equal(calls, 0, 'confirmation only queues the bounded collection');
  await state.service.processNext();
  await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assertRunContract(ready);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.deepEqual(ready.definition?.exactShopeeUrls, [url]);
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.reviewCorpus.coverage.rawRows, 3);
  assert.equal(semantic.reviewCorpus.coverage.invalidRatingRawRows, 1);
  assert.equal(semantic.reviewCorpus.coverage.quarantinedRawRows, 1);
  assert.equal(semantic.reviewCorpus.codingState, 'NOT_CODED');
  assert.equal(semantic.locatedReview.contractVersion, 'automation-located-review-snapshot-v2');
  assert.equal(semantic.locatedReview.authorityState, 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS');
  assert.equal(semantic.locatedReview.proposal.contractVersion, 'automation-located-review-snapshot-v1');
  assert.equal(semantic.locatedReview.proposal.authorityState, 'RULE_PROPOSAL_ONLY');
  assert.deepEqual(semantic.locatedReview.proposal.output.input.i04, [], 'the original proposal is retained without analytical admission');
  // U-02 producer path: the run's own located descriptor is prepared with the new semantics, so I01 reports the
  // labelled working question awaiting the owner instead of the historical hard blocker.
  assert.equal(semantic.locatedReview.proposal.output.methodVersion, '1.1.0');
  assert.equal(semantic.locatedReview.proposal.output.input.semanticsVersion, '1.1.0');
  assert.deepEqual(semantic.locatedReview.proposal.output.sections.I01.workingQuestion, {
    state: 'AI_PROPOSED_AWAITING_OWNER', label: 'câu hỏi làm việc do AI đề xuất, chờ chủ duyệt',
    // The run supplies no owner question and no model proposal, so the normal caller retains the deterministic
    // scope template as a labelled proposal: non-empty, and derived only from the frozen scope.
    text: locatedScopeWorkingQuestion(state.confirm.definition),
    ownerFieldsToAdd: ['questionText', 'decisionToInform', 'intendedAudience', 'scope', 'knownConstraints'] });
  assert.deepEqual(semantic.locatedReview.proposal.output.input.brief, null, 'the proposal never becomes an owner brief');
  const proposalCoding = JSON.parse((await state.artifacts.read(semantic.locatedReview.proposal.codingSha256)).toString());
  assert.deepEqual(semantic.locatedReview.proposal.output.input.records.map((row: { text: string }) => row.text),
    proposalCoding.records.map((row: { text: string }) => row.text), 'the proposal changes no evidence membership');
  assert.ok(!semantic.locatedReview.proposal.output.sections.I01.blockers.includes('I01_OWNER_QUESTION_REQUIRED'),
    'a missing owner question is no longer a hard stop for a new located run');
  assert.equal(semantic.locatedReview.output.input.semanticsVersion, '1.1.0');
  assert.deepEqual(semantic.locatedReview.output.input.i04.map((row: { span: { quote: string }; provenance: { basis: string } }) =>
    [row.span.quote, row.provenance.basis]), [['Tôi đã dùng sản phẩm', 'DECLARED']]);
  assert.ok(semantic.locatedReview.projection.pending.some((row: { reason: string }) => row.reason === 'QUOTED_TEXT_SCOPE'));
  const coding = JSON.parse((await state.artifacts.read(semantic.locatedReview.proposal.codingSha256)).toString());
  assert.equal(coding.executionAuthority, 'NONE_RULE_PROPOSAL_ONLY');
  assert.equal(coding.corpus.corpusId, semantic.reviewCorpus.corpusId);
  assert.equal(coding.coverage.quarantinedUnits, 1);
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
  const before = state.db.prepare('SELECT total_changes() n').get();
  const packages = new SourcePackageService({ db: state.db, artifactStore: state.artifacts, now });
  const original = await packages.readVerified(semantic.locatedReview.proposal.sourcePackage.packageId);
  const originalInput = JSON.parse(original.files.find(row => row.path === 'normalized/run.json')!.bytes.toString());
  const { contractVersion: _version, authorityState: _authority, ...frozenInput } = originalInput;
  const bridge = new AutomationLocatedReviewBridge({ db: state.db, artifactStore: state.artifacts, now });
  assert.deepEqual(await bridge.verify(semantic.locatedReview.proposal, frozenInput), semantic.locatedReview.proposal,
    'historical v1 reads preserve the actual retained proposal without projection');
  const proposalOutput = original.files.find(row => row.path === 'methods/located-output.json')!;
  assert.equal(proposalOutput.bytes.toString(), `${canonicalJson(semantic.locatedReview.proposal.output)}\n`);
  const overlay = await packages.readVerified(semantic.locatedReview.sourcePackage.packageId);
  for (const file of original.files) {
    const copied = overlay.files.find(row => row.path === file.path)!;
    assert.deepEqual(copied, file, 'v2 retains original proposal bytes and metadata exactly');
  }
  assert.deepEqual(await bridge.verify(semantic.locatedReview, frozenInput), semantic.locatedReview);
  for (const mutate of [
    (value: typeof semantic.locatedReview) => { value.projection.pending[0].reason = 'changed'; },
    (value: typeof semantic.locatedReview) => { value.output.input.i04[0].span.quote = 'invented action'; },
    (value: typeof semantic.locatedReview) => { value.projectionId = 'f'.repeat(64); },
    (value: typeof semantic.locatedReview) => { value.sourcePackage.packageContentSha256 = 'f'.repeat(64); },
  ]) {
    const changed = structuredClone(semantic.locatedReview); mutate(changed);
    await assert.rejects(bridge.verify(changed, frozenInput), /Located projection/, 'replay binds sidecar, output and package identities');
  }
  const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  const html = report.bytes.toString();
  assert.match(html, /Tôi đã dùng sản phẩm/);
  assert.match(html, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /Do not project me|<script>/);
  assert.match(html, /Tách riêng/);
  assert.match(html, /Chưa mã hóa/);
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    const behavior = document.getElementById('I04')!;
    assert.equal(behavior.querySelector('tbody q')?.textContent, 'Tôi đã dùng sản phẩm',
      'admitted source words render in their analytical section, not only the raw appendix');
    assert.match(behavior.textContent!, /Mã hóa lời nguồn · Kết quả từng phần/);
    assert.match(behavior.textContent!, /khai báo được đưa vào, thuộc 1 bản ghi nguồn/);
    assert.match(behavior.textContent!, /QUOTED_TEXT_SCOPE/);
    assert.doesNotMatch(behavior.textContent!, /0 chú giải đang chờ xử lý/,
      'the annotation-only pending count must not contradict the retained reading sidecar');
    assert.doesNotMatch(document.getElementById('I05')!.textContent!, /Mã hóa lời nguồn · Kết quả từng phần/);
    assert.equal(document.querySelector('a[href="located-insight-bundle.json"]'), null,
      'automation must not advertise a bundle file it does not serve');
    assert.match(document.getElementById('I03')!.textContent!, /Collection nguồn thô, tách khỏi lớp mã hóa/);
    assert.match(document.getElementById('I03')!.textContent!, /Độ phủ của lớp mã hóa lời nguồn/);
    const trace = document.querySelector('[aria-label="Bản ghi và trạng thái mã hóa lời nguồn"]')!;
    assert.ok(trace.textContent!.includes(semantic.locatedReview.output.input.records[0].sourceSha256));
    assert.ok(trace.textContent!.includes(semantic.locatedReview.output.input.records[0].locator));
    assert.ok(document.getElementById('I17')!.textContent!.includes(semantic.locatedReview.projectionSha256));
    assert.match(document.getElementById('I17')!.textContent!, /Wrong product/,
      'projection coverage must not remove quarantined collection evidence');
    assert.match(document.querySelector('#sections > .warning')!.textContent!, /Mục phân tích hoàn chỉnh: 0/);
    assert.equal(document.querySelectorAll('script, img, [onerror]').length, 0);
    for (const link of behavior.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'))
      assert.ok(document.getElementById(link.getAttribute('href')!.slice(1)), 'every source disclosure link resolves');
  } finally { dom.window.close(); }
  assert.deepEqual((await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, report.bytes);
  const [pair] = await state.service.listReportVersions(workspaceId, runId);
  const context = await state.service.readInsightSourceContext(workspaceId, runId, pair!.pairId);
  assert.deepEqual(context.input, semantic.locatedReview.output.input);
  assert.equal(context.binding.sourcePackageSha256, sha(semantic.locatedReview.sourcePackage), 'binds the adopted package, not the v1 proposal');
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(calls, 1);
  const page = semantic.reviewCorpus.sourcePages[0].sha256 as string;
  await fs.writeFile(path.join(state.root, 'artifacts', 'sha256', page.slice(0, 2), page), 'corrupt');
  await assert.rejects(state.service.readReport(workspaceId, runId, 'INSIGHT'), /./, 'report replay verifies its original raw pages');
  await assert.rejects(state.service.readInsightSourceContext(workspaceId, runId, pair!.pairId), /./, 'source context fails closed on the same damage');
});

test('unconfigured or ambiguous review collection remains explicit, does not retry, and preserves two partial reports', async t => {
  for (const mode of ['unconfigured', 'ambiguous'] as const) await t.test(mode, async sub => {
    let calls = 0;
    const state = await fixture(sub, mode === 'unconfigured' ? undefined : () => ({ requestsIssued: () => calls,
      collector: { mode: 'live', collect: async () => { calls++; throw new CollectionPendingError('Secret provider response must not appear'); } } }));
    await state.service.confirmScope(workspaceId, runId, state.confirm);
    await state.service.processNext(); await state.service.processNext();
    const ready = await state.service.getRun(workspaceId, runId);
    assertRunContract(ready);
    assert.equal(ready.steps.find(row => row.stepId === 'COLLECTION')?.state, mode === 'ambiguous' ? 'FAILED' : 'UNAVAILABLE');
    assert.equal(ready.status, 'DRAFT_READY');
    assert.ok(ready.blockers.some(row => row.code === (mode === 'unconfigured' ? 'EXACT_SHOPEE_NOT_CONFIGURED' : 'EXACT_SHOPEE_PENDING_RECONCILIATION')));
    assert.doesNotMatch(JSON.stringify(ready), /Secret provider/);
    assert.equal(ready.usage.hasUnknownCost, mode === 'ambiguous');
    await state.service.readReport(workspaceId, runId, 'MARKET'); await state.service.readReport(workspaceId, runId, 'INSIGHT');
    assert.equal(await state.service.processNext(), false);
    assert.equal(calls, mode === 'ambiguous' ? 1 : 0);
  });
});

test('an oversized quote view preserves the independent Market report and full raw collection without truncation or recollection', async t => {
  let calls = 0;
  const raw = Buffer.from(JSON.stringify([{ shopId: '78085196', itemId: '17678138164', comment: 'Tôi đã dùng sản phẩm.', ratingStar: 5 }]));
  const state = await fixture(t, () => ({ requestsIssued: () => 0, collector: { mode: 'fixture', collect: async (...args) => { calls++; return new FixtureShopeeCollector(raw).collect(...args); } } }), true);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.reviewCorpusFailure, 'REVIEW_CORPUS_REPORT_TOO_LARGE');
  assert.equal(semantic.reviewCorpus, null);
  assert.ok(semantic.locatedReviewFallback.sourcePackage.packageId);
  const claims = JSON.parse((await state.artifacts.read(semantic.sourceClaimsArtifact.sha256)).toString());
  assert.equal(claims.claims.filter((claim: { sectionId: string }) => claim.sectionId === 'I04').length, 1,
    'The exact-collection fallback reader preserves adopted action claims, not only the raw pages');
  const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  assert.match(report.bytes.toString(), /vượt giới hạn kích thước báo cáo/);
  await state.service.readReport(workspaceId, runId, 'MARKET');
  const pageSha = (await import('node:crypto')).createHash('sha256').update(raw).digest('hex');
  assert.deepEqual(await state.artifacts.read(pageSha), raw);
  const first = (await state.service.listReportVersions(workspaceId, runId))[0]!;
  await state.service.requestReportRevision(workspaceId, runId, {
    contractVersion: 'automation-report-revision-v1', requestKey: '55555555-5555-4555-8555-555555555555',
    previousPairId: first.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
  });
  await state.service.processNext();
  const versions = await state.service.listReportVersions(workspaceId, runId);
  assert.deepEqual(versions.map(version => version.versionNumber), [1, 2]);
  const keptInsight = versions[1]!.outputs.find(output => output.kind === 'INSIGHT')!;
  const keptSemantic = JSON.parse((await state.artifacts.read(keptInsight.versionId)).toString());
  assert.deepEqual(keptSemantic.sourceClaimsArtifact, semantic.sourceClaimsArtifact,
    'KEEP reconstructs adopted declarations retained by the located fallback instead of publishing empty claims');
  assert.deepEqual(keptSemantic.i14AdmissionArtifact, semantic.i14AdmissionArtifact,
    'KEEP reuses the same I14 admission over the full frozen located output, not the shortened presentation');
  await state.service.readReport(workspaceId, runId, 'INSIGHT', false, versions[1]!.pairId);
  const retained = await new SourcePackageService({ db: state.db, artifactStore: state.artifacts, now }).readVerified(semantic.locatedReviewFallback.sourcePackage.packageId);
  const adoptedInput = JSON.parse(retained.files.find(row => row.path === 'methods/literal-declaration-input.json')!.bytes.toString());
  assert.deepEqual(adoptedInput.i04.map((row: { span: { quote: string } }) => row.span.quote), ['Tôi đã dùng sản phẩm']);
  const scopeSha256 = (state.db.prepare('SELECT scope_request_sha256 sha FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { sha: string }).sha;
  const before = state.db.prepare('SELECT total_changes() n').get();
  for (const pair of versions)
    assert.deepEqual(await state.service.readInsightSourceContext(workspaceId, runId, pair.pairId), { binding: { workspaceId, runId, pairId: pair.pairId, scopeSha256,
      reportSha256: pair.outputs.find(output => output.kind === 'INSIGHT')!.versionId, sourceKind: 'EXACT_SHOPEE',
      sourcePackageSha256: sha(semantic.locatedReviewFallback.sourcePackage), inputSha256: sha(adoptedInput) }, input: adoptedInput, verifiedPlatform: 'SHOPEE' },
    'the fallback pair and its KEEP successor bind the full retained adopted input, not the shortened presentation');
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(calls, 1);
});

test('a terminal Actor failure is not an empty-review success and any returned rows remain available without recollection', async t => {
  for (const returnedRows of [0, 1]) await t.test(`${returnedRows} retained rows`, async sub => {
    let calls = 0;
    const raw = Buffer.from(JSON.stringify(returnedRows ? [{ shopId: '78085196', itemId: '17678138164', comment: 'Đã ăn với sữa chua.', ratingStar: 5 }] : []));
    const state = await fixture(sub, () => ({ requestsIssued: () => calls, collector: { mode: 'fixture', collect: async (...args) => {
      calls++;
      const collected = await new FixtureShopeeCollector(raw).collect(...args);
      return { ...collected, actor: { ...collected.actor, status: 'FAILED', stopReason: 'actor_terminal_failed', usageTotalUsd: 0.008 }, warnings: ['actor_terminal_failed'] };
    } } }));
    await state.service.confirmScope(workspaceId, runId, state.confirm);
    await state.service.processNext(); await state.service.processNext();
    const ready = await state.service.getRun(workspaceId, runId);
    assertRunContract(ready);
    assert.equal(ready.steps.find(row => row.stepId === 'COLLECTION')?.state, returnedRows ? 'PARTIAL' : 'FAILED');
    assert.equal(ready.coverage.sources.find(row => row.provider === 'apify-shopee')?.state, returnedRows ? 'PARTIAL' : 'FAILED');
    assert.ok(ready.blockers.some(row => row.code === 'EXACT_SHOPEE_ACTOR_FAILED'));
    assert.ok(ready.outputs?.market && ready.outputs.insight);
    const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
    assert.equal(semantic.reviewCorpus.coverage.rawRows, returnedRows);
    assert.equal(semantic.reviewCorpus.capture.actorStatus, 'FAILED');
    assert.equal(semantic.completion.completedAnalyticalSections, 0);
    const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
    assert.match(report.bytes.toString(), /lỗi|thất bại/);
    await state.service.readReport(workspaceId, runId, 'MARKET');
    assert.equal(await state.service.processNext(), false);
    assert.equal(calls, 1);
  });
});

// #123: the four real failure shapes, classified once, logged once, and explained to the owner without provider names or codes.
test('exact review outcome is classified, logged once, shown on the run page and noticed in both reports', async t => {
  const listings = ['17678138164', '17678138165', '17678138166', '17678138167', '17678138168'];
  const urls = listings.map(itemId => `https://shopee.vn/product/78085196/${itemId}`);
  const rows = (itemIds: readonly string[]) => itemIds.map((itemId, index) => ({ shopId: '78085196', itemId, reviewId: `synthetic-${index}`, comment: 'Synthetic review text', ratingStar: 5 }));
  const cases = [
    { name: 'blocked', failed: true, message: 'Reviews could not be retrieved right now. Please try again later.', rows: [] as string[],
      outcome: 'PROVIDER_BLOCKED', code: 'EXACT_SHOPEE_REVIEWS_BLOCKED', level: 'warn' },
    { name: 'timeout', failed: true, message: 'This run hit its time limit before any reviews were collected', rows: [] as string[],
      outcome: 'PROVIDER_TIMEOUT_NO_REVIEWS', code: 'EXACT_SHOPEE_REVIEWS_TIMEOUT', level: 'warn' },
    { name: 'partial', failed: false, message: null, rows: [listings[0]!, listings[0]!, listings[3]!],
      outcome: 'PARTIAL_LISTINGS', code: 'EXACT_SHOPEE_REVIEWS_PARTIAL', level: 'warn' },
    { name: 'ok', failed: false, message: null, rows: listings, outcome: 'OK', code: null, level: 'info' },
  ] as const;
  for (const c of cases) await t.test(c.name, async sub => {
    const logs: Array<{ level: string; line: string }> = [];
    for (const level of ['info', 'warn'] as const) sub.mock.method(console, level, (...args: unknown[]) => { logs.push({ level, line: args.map(String).join(' ') }); });
    const rendered: Array<{ input: ReportInput; kind: 'MARKET' | 'INSIGHT' }> = [];
    let calls = 0;
    const state = await fixture(sub, () => ({ requestsIssued: () => calls, collector: { mode: 'fixture', collect: async (...args) => {
      calls++;
      const collected = await new FixtureShopeeCollector(Buffer.from(JSON.stringify(rows(c.rows)))).collect(...args);
      return c.failed ? { ...collected, actor: { ...collected.actor, status: 'FAILED', stopReason: 'actor_terminal_failed', usageTotalUsd: 0.008 },
        warnings: ['actor_terminal_failed'], actorStatusMessage: c.message } : collected;
    } } }), false, 'Synthetic coconut jelly', (input, kind) => rendered.push({ input, kind }));
    await state.service.confirmScope(workspaceId, runId, { ...state.confirm, exactShopeeUrls: urls });
    await state.service.processNext(); await state.service.processNext();
    const ready = await state.service.getRun(workspaceId, runId);
    assertRunContract(ready);

    const expectedCounts = urls.map((listingUrl, index) => ({ listingUrl, reviews: c.rows.filter(itemId => itemId === listings[index]).length }));
    const { resultSha } = state.db.prepare(`SELECT result_sha256 resultSha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { resultSha: string };
    const step = JSON.parse((await state.artifacts.read(resultSha)).toString());
    assert.equal(step.exactShopeeOutcome.outcome, c.outcome);
    assert.deepEqual(step.exactShopeeOutcome.listings, expectedCounts);
    assert.equal(step.exactShopeeOutcome.providerMessage, c.message);
    assert.equal(step.exactShopeeOutcome.reused, false);
    assert.equal(step.exactShopeeOutcome.attemptedAt, now().toISOString());

    const lines = logs.filter(entry => entry.line.includes('exact_shopee_collection'));
    assert.equal(lines.length, 1);
    assert.equal(lines[0]!.level, c.level);
    const logged = JSON.parse(lines[0]!.line);
    assert.deepEqual(logged, { event: 'exact_shopee_collection', runId, outcome: c.outcome,
      listings: listings.map((itemId, index) => ({ listing: `78085196:${itemId}`, reviews: expectedCounts[index]!.reviews })),
      actorStatus: c.failed ? 'FAILED' : 'FIXTURE', usageUsd: c.failed ? 0.008 : null, reused: false });
    assert.doesNotMatch(lines[0]!.line, /token|http|Synthetic review text|could not|time limit/i);

    assert.equal(ready.blockers.some(row => row.code === c.code), c.code !== null);
    assert.equal(ready.blockers.filter(row => row.code.startsWith('EXACT_SHOPEE_REVIEWS_')).length, c.code === null ? 0 : 1);
    if (c.failed) assert.ok(ready.blockers.some(row => row.code === 'EXACT_SHOPEE_ACTOR_FAILED'), 'the existing limitation is kept');

    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const html = (await state.service.readReport(workspaceId, runId, kind)).bytes.toString();
      const body = new JSDOM(html).window.document.body;
      const notice = body.querySelector('.review-outcome-notice');
      const input = rendered.find(entry => entry.kind === kind)!.input;
      const { exactShopeeOutcome: _outcome, ...oldCollection } = input.collection!;
      const before = buildResearchAutomationReport({ ...input, collection: oldCollection }, kind).html.toString();
      if (c.outcome === 'OK') {
        assert.equal(notice, null);
        assert.equal(html, before, 'an OK outcome renders byte-identically to a run without the field');
        continue;
      }
      assert.ok(notice);
      assert.match(notice.textContent!, /02\/10\/2026/);
      assert.deepEqual([...notice.querySelectorAll('li a')].map(link => link.getAttribute('href')),
        expectedCounts.filter(row => row.reviews === 0).map(row => row.listingUrl));
      assert.match(notice.textContent!, /Phần bị ảnh hưởng/);
      for (const section of ['I02 Khách hàng và hoàn cảnh', 'I03 Phương pháp nghiên cứu', 'I17 Phụ lục và bằng chứng']) assert.ok(notice.textContent!.includes(section), section);
      assert.match(notice.textContent!, /Phần vẫn dùng được: doanh thu, giá, đối thủ, nhu cầu tìm kiếm\./);
      assert.doesNotMatch(notice.textContent!, /Apify|apify|zen-studio|SerpApi|Kalodata|Metric|EXACT_SHOPEE|PROVIDER_|FAILED/);
      // Only the notice and the plain review sentence are new; the rest of the page is byte-identical.
      // (Older copy elsewhere on the page already carries method codes; this change adds none.)
      const added = /<div class="warning review-outcome-notice"[^>]*>[\s\S]*?<\/div>|<p class="warning">Lần thu ngày [^<]*<\/p>/g;
      assert.equal(html.replace(added, ''), before, 'nothing outside the notice and review sentence changes');
      const addedText = (html.match(added) ?? []).join(' ');
      assert.equal((html.match(added) ?? []).length, kind === 'INSIGHT' ? 3 : 1, 'one notice, plus the review sentence in I03 and I17');
      assert.doesNotMatch(addedText, /Apify|apify|zen-studio|SerpApi|Kalodata|Metric|EXACT_SHOPEE|PROVIDER_|FAILED/);
      if (kind === 'INSIGHT') for (const id of ['#I03', '#I17']) {
        const review = body.querySelector(id)!.textContent!;
        assert.match(review, c.outcome === 'PARTIAL_LISTINGS' ? /chỉ lấy được đánh giá Shopee cho 2\/5 sản phẩm/ : /không lấy được đánh giá Shopee nào cho 5 sản phẩm/, id);
      }
    }
    assert.equal(calls, 1);
    if (c.name !== 'blocked') return;

    // Removing the review source in a revision removes the notice from BOTH reports; the original pair keeps it.
    const firstPair = (await state.service.listReportVersions(workspaceId, runId))[0]!;
    await state.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(),
      previousPairId: firstPair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'SKIP' } } });
    await state.service.processNext();
    const skippedPair = (await state.service.listReportVersions(workspaceId, runId)).at(-1)!;
    assert.notEqual(skippedPair.pairId, firstPair.pairId);
    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const skipped = (await state.service.readReport(workspaceId, runId, kind, false, skippedPair.pairId)).bytes.toString();
      assert.doesNotMatch(skipped, /review-outcome-notice|Lần thu ngày/, `${kind} after the review source is skipped`);
      const original = (await state.service.readReport(workspaceId, runId, kind, false, firstPair.pairId)).bytes.toString();
      assert.match(original, /review-outcome-notice/, `${kind} history is unchanged`);
    }

    // Reuse path: the frozen collection is read back, classified again, logged once, and never recollected.
    logs.length = 0;
    const bridge = new AutomationExactShopeeBridge(state.db, state.artifacts, () => ({ requestsIssued: () => calls, collector: { mode: 'fixture', collect: async () => {
      calls++; throw new Error('a reused collection must not be collected again');
    } } }));
    const reused = await bridge.collect({ runId, start: rendered[0]!.input.start, scope: rendered[0]!.input.scope, scopeConfirmedAt: now().toISOString() }, undefined, now);
    assert.deepEqual(reused.exactShopeeOutcome, { outcome: 'PROVIDER_BLOCKED', listings: expectedCounts, providerMessage: null, attemptedAt: now().toISOString(), reused: true });
    assert.equal(reused.outcomeLimitation?.code, 'EXACT_SHOPEE_REVIEWS_BLOCKED');
    assert.deepEqual(logs.filter(entry => entry.line.includes('exact_shopee_collection')).map(entry => [entry.level, JSON.parse(entry.line).reused, JSON.parse(entry.line).usageUsd]), [['warn', true, 0]]);
    assert.equal(calls, 1);

    // A stored outcome with a bad shape is rejected when the step is read back; old documents without it still load.
    // Simulate storage-level tampering in this disposable database by lifting the settled-step guard.
    state.db.exec('DROP TRIGGER analysis_research_automation_steps_settled');
    const tampered = await state.artifacts.put(Buffer.from(canonicalJson({ ...step, exactShopeeOutcome: { ...step.exactShopeeOutcome, outcome: 'MAYBE' } })));
    state.db.prepare('INSERT INTO artifact_manifests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(tampered.sha256, tampered.byteSize,
      'application/vnd.tdn.research-automation.step+json', tampered.relativePath, now().toISOString(), '1.0.0', 'active', now().toISOString());
    state.db.prepare(`UPDATE analysis_research_automation_steps SET result_sha256=? WHERE run_id=? AND step_id='COLLECTION'`).run(tampered.sha256, runId);
    await assert.rejects(state.service.getRun(workspaceId, runId), /Stored exact review outcome is invalid/);
    const { exactShopeeOutcome: _dropped, ...old } = step;
    const legacy = await state.artifacts.put(Buffer.from(canonicalJson(old)));
    state.db.prepare('INSERT INTO artifact_manifests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(legacy.sha256, legacy.byteSize,
      'application/vnd.tdn.research-automation.step+json', legacy.relativePath, now().toISOString(), '1.0.0', 'active', now().toISOString());
    state.db.prepare(`UPDATE analysis_research_automation_steps SET result_sha256=? WHERE run_id=? AND step_id='COLLECTION'`).run(legacy.sha256, runId);
    assertRunContract(await state.service.getRun(workspaceId, runId));
  });
});

// P1-15: the stored drafts of this fixture own the reader-text rules; a renderer
// change that leaks a provider name, a digest or a status code fails here.
test('both stored drafts keep provider names, digests and status codes out while retaining original source quotations', async t => {
  let calls = 0;
  const sourceQuote = 'Tôi đã dùng sản phẩm từ Metric và Kalodata.';
  const raw = Buffer.from(JSON.stringify([{ shopId: '78085196', itemId: '17678138164', comment: 'Tôi đã dùng sản phẩm.', ratingStar: 5 },
    { shopId: '78085196', itemId: '17678138164', comment: sourceQuote, ratingStar: 5 }]));
  const retained: string[] = [];
  const state = await fixture(t, () => ({ requestsIssued: () => calls,
    collector: { mode: 'fixture', collect: async (...args: Parameters<FixtureShopeeCollector['collect']>) => { calls++; return new FixtureShopeeCollector(raw).collect(...args); } } }), false, 'Synthetic clean reader text', input => { retained.push(JSON.stringify(input)); });
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  assert.equal((await state.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  for (const kind of ['MARKET', 'INSIGHT'] as const) {
    const stored = await state.service.readReport(workspaceId, runId, kind);
    const html = stored.bytes.toString();
    if (kind === 'INSIGHT') assert.ok((await state.artifacts.read(stored.versionId)).toString().includes(sourceQuote),
      'stored semantic evidence keeps the source quote byte-for-byte');
    const document = new JSDOM(html).window.document;
    assert.deepEqual(visibleTextViolations(reportVisibleText(document)), [], `${kind}: reader text keeps provider names, digests and status codes out`);
    assert.deepEqual(providerNameViolations(html), [], `${kind}: no disclosure may name the provider`);
    assert.deepEqual(citationRegisterViolations(document), [], `${kind}: one register holds exactly the cited sources`);
  }
  const insight = (await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes.toString();
  assert.match(insight, /Đánh giá khách hàng trên Shopee/, 'the review register entry carries the exact reader label');
  assert.equal(calls, 1);
  assert.ok(retained.some(value => value.includes(sourceQuote)), 'verified render input keeps the exact source quote');
});
