import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, type ResearchAutomationServiceOptions } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { MAX_HTML_BYTES } from '../../src/modules/analysis/research-automation/model.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import type { AutomationI14ExecutionRequest } from '../../src/modules/analysis/research-automation/i14-synthesis-execution.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-02T01:00:00.000Z');
async function fixture(t: TestContext, oversizedView = false, invalidMainSource = false,
  i14SynthesisAi: AutomationI14ExecutionRequest['ai'] = null,
  decisionSynthesisAi: ResearchAutomationServiceOptions['decisionSynthesisAi'] = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-native-review-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-native-review', title: 'Synthetic native source acceptance' });
  let providerCalls = 0;
  const transport: ProviderTransport = { now: () => now().getTime(), sleep: async () => {}, fetch: (async (input, init) => {
    const endpoint = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const data = endpoint.pathname.endsWith('/credit/balance') ? { totalRemain: 100 }
      : endpoint.pathname.endsWith('/product/rank') ? [{ product_id: '101', product_name: 'Synthetic market product', unit_price: 100 }]
      : { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
        product_name: 'Synthetic market product', revenue: 100, sales_volumn: 1, unit_price: 100 };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }) as typeof fetch };
  const mainSource = invalidMainSource ? bindResearchAutomationProvider(createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-secret', serpApiKey: null, apifyTokenConfigured: false }, transport).get('KALODATA')) : undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    i14SynthesisAi, decisionSynthesisAi,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    ...(mainSource ? { source: { ...mainSource, collect: async (...args: Parameters<typeof mainSource.collect>) => {
      const bound = await mainSource.collect(...args);
      return { ...bound, step: { ...bound.step, comparables: bound.step.comparables.map(row => ({ ...row, captureIndex: 999 })) } };
    } } } : {}),
    shopeeCollectorFactory: () => ({ requestsIssued: () => providerCalls, collector: { mode: 'fixture', collect: async (...args) => {
      providerCalls++; return new FixtureShopeeCollector(Buffer.from('[]')).collect(...args);
    } } }),
    renderer: (input, kind) => {
      const result = buildResearchAutomationReport(input, kind);
      return oversizedView && kind === 'INSIGHT' && input.nativeReview ? { ...result, html: Buffer.alloc(MAX_HTML_BYTES + 1, 'x') } : result;
    } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic exact product', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic exact listing; no annual review admission',
    includeTerms: [], excludeTerms: [], selectedProductIds: invalidMainSource ? ['kalodata:101'] : [], peerProductIds: [], exactShopeeUrls: [url] };
  return { root, db, artifacts, packages, service, discovery, confirm, providerCalls: () => providerCalls };
}

// This owns raw source -> adopted context -> synthesis -> persisted report proof.
// Existing execution tests start with manually encoded I02 and cannot expose a
// mismatch between the adopted parser's qualifier representation and admission.
test('adopted context reaches four synthesis sections, retains exact report dependencies and never treats generated text as source', async t => {
  let calls = 0;
  let supportId = '';
  const decisionCalls: string[] = [];
  const counterIds = new Map<string, string>();
  const draftText = { M11: 'Cơ hội', M12: 'Hành động', I15: 'Chiến lược' } as const;
  const decisionSynthesisAi: NonNullable<ResearchAutomationServiceOptions['decisionSynthesisAi']> = {};
  for (const sectionId of ['M11', 'M12', 'I15'] as const) {
    decisionSynthesisAi[sectionId] = {
      configuration: { contractVersion: '1.0.0', methodId: 'automation-decision-synthesis-configuration', sectionId,
        providerId: 'synthetic', modelId: 'synthetic', temperature: null, maxOutputTokens: 1000, timeoutMs: 1000, maxResponseBytes: 10000 },
      port: { generateText: async request => {
        decisionCalls.push(sectionId);
        const input = JSON.parse(request.userText);
        assert.equal(input.sectionId, sectionId);
        assert.deepEqual(input.supportEligible.map((claim: { claimId: string }) => claim.claimId), [supportId]);
        assert.equal(request.userText.includes(proposedText), false, 'I14 prose cannot enter decision source input');
        const counterId = input.declarationContext[0].claimId as string;
        counterIds.set(sectionId, counterId);
        const candidateText = `${draftText[sectionId]}: kiểm tra giả thuyết <img src=x onerror=alert()>`;
        return { text: JSON.stringify({ aiCandidates: [{ candidateType: sectionId === 'M11' ? 'HYPOTHESIS' : sectionId === 'M12' ? 'ACTION_OPTION' : 'STRATEGY_OPTION',
          candidateStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
          text: candidateText,
          conciseEvidenceLinkedRationale: 'Nguồn ghi mua tặng; cần kiểm tra nhu cầu người nhận.',
          citedClaimRefs: [supportId], counterevidenceRefs: [counterId], counterevidenceRelations: [{
            claimRef: counterId, relationType: 'PROPOSED_COUNTEREVIDENCE', relationStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
            counteredTarget: candidateText,
            compatibility: { entity: 'Chưa xác lập cùng người.', measure: 'Hai lời khai riêng.', unit: 'Không có đơn vị đo.',
              period: 'Chưa xác lập cùng thời kỳ.', scope: 'Chưa xác lập cùng hoàn cảnh.', denominator: 'Không cộng gộp bản ghi.' },
            inferentialLimitations: ['Quan hệ phản chứng chỉ là đề xuất chưa được duyệt.'],
          }],
          assumptions: ['Cần xác minh hoàn cảnh sử dụng.'], unknowns: ['Chưa rõ nhu cầu người nhận.'],
          evidenceGaps: ['Thiếu ý kiến người nhận.'], limitations: ['Không đại diện toàn thị trường.'],
          ...(sectionId === 'M12' ? { prerequisites: ['Chỉ thực hiện sau khi người dùng duyệt.'] } : {}),
          ...(sectionId === 'I15' ? { conditions: ['Chỉ xét khi mục tiêu người dùng phù hợp.'] } : {}),
        }] }) };
      } },
    };
  }
  const proposedText = 'Có thể xem xét độ phù hợp khi dùng làm quà, với điều kiện xác minh nhu cầu của người nhận.';
  const f = await fixture(t, false, false, {
    configuration: { contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-configuration', providerId: 'synthetic',
      modelId: 'synthetic', temperature: null, maxOutputTokens: 1000, timeoutMs: 1000, maxResponseBytes: 10000 },
    port: { generateText: async request => {
      calls++;
      const input = JSON.parse(request.userText);
      assert.equal(input.supportEligible.length, 1);
      assert.deepEqual(input.supportEligible[0].contextFields, [{ field: 'situation', quote: 'mua tặng' }]);
      supportId = input.supportEligible[0].claimId;
      return { text: JSON.stringify({ aiCandidates: [{ candidateType: 'HYPOTHESIS', candidateStatus: 'HUMAN_REVIEW_REQUIRED', layer: 3,
        text: proposedText, conciseEvidenceLinkedRationale: 'Nguồn tự thuật nêu mua tặng; chưa biết nhu cầu của người nhận.',
        citedClaimRefs: [supportId], counterevidenceRefs: [], assumptions: ['Mục đích mua tặng trong nguồn còn phù hợp với câu hỏi nghiên cứu.'],
        unknowns: ['Người nhận có sử dụng sản phẩm hay không.'], evidenceGaps: ['Chưa có mô tả nhu cầu của người nhận.'],
        limitations: ['Một bản ghi không đại diện cho thị trường.'] }] }) };
    } },
  }, decisionSynthesisAi);
  await seedNativeDamiPackage(f.packages, { rawRows: [
    'Tôi mua tặng bình giữ nhiệt.',
    'Nếu có dịp tôi mua tặng bình giữ nhiệt.',
    'Tôi dùng bình giữ nhiệt hàng ngày.',
    'Tôi không mua tặng bình giữ nhiệt.',
    'Tôi mua tặng bình giữ nhiệt làm quà.',
  ].map((comment, index) => ({ type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: `context-${index}`, comment, rating_star: 5 })) });
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const ready = await f.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY', JSON.stringify(ready.blockers));
  assert.equal(calls, 1, 'The verified adopted context must reach the synthesis port once');
  assert.deepEqual(decisionCalls, ['I15', 'M11', 'M12']);
  assert.deepEqual(f.db.prepare("SELECT section_id, validation_status, validation_code, unknown_code FROM analysis_research_automation_ai_executions WHERE section_id <> 'I14' ORDER BY section_id").all(),
    ['I15', 'M11', 'M12'].map(section_id => ({ section_id, validation_status: 'VALID', validation_code: null, unknown_code: null })));
  assert.deepEqual(ready.aiActivity, Object.fromEntries(['m11', 'm12', 'i14', 'i15'].map(key => [key, {
    states: { prepared: 0, dispatching: 0, completed: 1, dispatchUnknown: 0 },
    outcomes: { valid: 1, invalid: 0 }, billing: { state: 'UNKNOWN' },
  }])), 'Each section has separate recorded activity, not a known charge');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await f.artifacts.read(ready.outputs.insight.versionId)).toString());
  const admission = JSON.parse((await f.artifacts.read(semantic.i14AdmissionArtifact.sha256)).toString());
  assert.equal(admission.status, 'USE_CONTEXT_ADMITTED');
  // Decision packets reuse the source statement, not the generated I14 text.
  // This is the owner-boundary proof of same-pair Market -> Insight lineage.
  assert.deepEqual(semantic.decisionPackets.map((packet: { sectionId: string }) => packet.sectionId), ['I15']);
  assert.equal(semantic.decisionPackets[0].strategy.preferredOption, null);
  const marketSemantic = JSON.parse((await f.artifacts.read(ready.outputs.market.versionId)).toString());
  assert.equal(marketSemantic.decisionPairedInsightVersionId, ready.outputs.insight.versionId);
  assert.deepEqual(Object.keys(semantic.decisionExecutionIds), ['I15']);
  assert.deepEqual(Object.keys(marketSemantic.decisionExecutionIds).sort(), ['M11', 'M12']);
  assert.equal(semantic.decisionSynthesis, undefined, 'Presentation must not serialize an unowned candidate blob');
  assert.deepEqual(marketSemantic.decisionPackets.map((packet: { sectionId: string }) => packet.sectionId), ['M11', 'M12']);
  for (const packet of marketSemantic.decisionPackets) {
    assert.ok(packet.items.some((item: { claimId: string }) => item.claimId === supportId));
    assert.equal(packet.ownerQuestion.state, 'UNSET');
  }
  const marketReport = await f.service.readReport(workspaceId, runId, 'MARKET');
  const marketDom = new JSDOM(marketReport.bytes.toString());
  try {
    for (const section of ['M11', 'M12'] as const) {
      const source = marketDom.window.document.getElementById(`decision-${section}-${supportId}`);
      assert.ok(source, `paired original claim must be visible in ${section}`);
      assert.match(source.textContent!, /mua tặng/);
      assert.ok(marketDom.window.document.getElementById(section)!.textContent!.includes(`${draftText[section]}: kiểm tra giả thuyết <img src=x onerror=alert()>`));
      assert.ok(marketDom.window.document.querySelector(`a[href="#decision-${section}-${supportId}"]`));
      assert.ok(marketDom.window.document.querySelector(`a[href="#decision-${section}-${counterIds.get(section)}"]`));
    }
    assert.match(marketDom.window.document.body.textContent!, /Chưa xác lập cùng người/);
    assert.equal(marketDom.window.document.querySelector('img[src="x"]'), null, 'Generated markup must remain inert text');
    assert.equal(marketDom.window.document.body.textContent!.includes(proposedText), false,
      'an I14 AI candidate must never become the source of a Market decision packet');
  } finally { marketDom.window.close(); }
  assert.deepEqual(admission.anchors.map((anchor: { claimId: string }) => anchor.claimId), [supportId]);
  assert.ok(semantic.nativeReview.projection.pending.some((row: { reason: string }) => row.reason === 'CONDITIONAL_SCOPE'));
  assert.ok(semantic.nativeReview.projection.pending.some((row: { reason: string }) => row.reason === 'NEGATED_CONTEXT'));
  assert.equal(semantic.nativeReview.output.input.i02[0].qualifiers[0].quote, 'mua tặng');
  assert.ok(admission.unassigned.some((row: { reason: string }) => row.reason === 'NO_SOURCE_STATED_USE_CONTEXT_FIELD'));
  assert.ok(admission.unassigned.some((row: { reason: string }) => row.reason === 'CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED'),
    'A second matcher phrase not represented by the admitted field must stay blocked, even for the adopted parser');
  const row = f.db.prepare("SELECT execution_id, state, validation_status FROM analysis_research_automation_ai_executions WHERE section_id='I14'").get();
  assert.deepEqual(row, { execution_id: semantic.i14ExecutionId, state: 'COMPLETED', validation_status: 'VALID' });
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT');
  const document = new JSDOM(report.bytes.toString());
  try {
    assert.ok(document.window.document.body.textContent?.includes(proposedText));
    assert.ok(document.window.document.body.textContent?.includes('Chưa được người dùng duyệt'));
    assert.ok(document.window.document.getElementById(`claim-${supportId}`));
    assert.ok(document.window.document.getElementById('I15')!.textContent?.includes('Chiến lược: kiểm tra giả thuyết <img src=x onerror=alert()>'));
    assert.ok(document.window.document.querySelector(`a[href="#decision-I15-${supportId}"]`));
    assert.ok(document.window.document.querySelector(`a[href="#decision-I15-${counterIds.get('I15')}"]`));
    assert.match(document.window.document.body.textContent!, /Chưa xác lập cùng người/);
    assert.equal(document.window.document.querySelector('img[src="x"]'), null);
  } finally { document.window.close(); }
  const originalPair = (await f.service.listReportVersions(workspaceId, runId))[0]!;
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-quote-report-revision-v1',
    requestKey: randomUUID(), previousPairId: originalPair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, quoteMethods: { decision: 'SKIP' } });
  await f.service.processNext();
  const quotePair = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.notEqual(quotePair.pairId, originalPair.pairId);
  const quoteInsight = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, quotePair.pairId);
  assert.deepEqual(quoteInsight.bytes, report.bytes, 'a Market quote-only revision keeps the frozen Insight and its candidate');
  assert.equal(JSON.parse((await f.artifacts.read(quoteInsight.versionId)).toString()).i14ExecutionId, semantic.i14ExecutionId);
  assert.equal(calls, 1, 'quote revision must not dispatch another I14 generation');
  assert.deepEqual(decisionCalls, ['I15', 'M11', 'M12'], 'Deterministic revisions must not authorize additional AI calls');
  const quoteMarket = await f.service.readReport(workspaceId, runId, 'MARKET', false, quotePair.pairId);
  assert.deepEqual(JSON.parse((await f.artifacts.read(quoteMarket.versionId)).toString()).decisionExecutionIds, marketSemantic.decisionExecutionIds);
  const changes = f.db.prepare('SELECT total_changes() n').get();
  f.db.pragma('query_only = ON');
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, now,
    workspaceReader: new FlowDiscoveryWorkspaceReader(f.discovery) });
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'INSIGHT')).bytes, report.bytes);
  assert.deepEqual((await reader.getRun(workspaceId, runId)).aiActivity, ready.aiActivity);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  assert.equal(calls, 1);
  assert.equal(f.providerCalls(), 0);
  assert.deepEqual((await reader.readReport(workspaceId, runId, 'MARKET', false, originalPair.pairId)).bytes, marketReport.bytes);
  const candidate = f.db.prepare("SELECT candidates_sha256 sha FROM analysis_research_automation_ai_executions WHERE section_id='I15'").get() as { sha: string };
  await fs.writeFile(f.artifacts.pathForDigest(candidate.sha), 'corrupt retained candidate');
  await assert.rejects(reader.readReport(workspaceId, runId, 'INSIGHT', false, originalPair.pairId), /decision packet failed exact source replay/);
  await assert.rejects(reader.readReport(workspaceId, runId, 'MARKET', false, originalPair.pairId), /decision packet failed exact source replay/,
    'Market cannot bypass its exact sibling Insight candidate dependency');
});

// Kernel tests own outcome classification. This checks the report worker does
// not abort both reports or display rejected provider text on those outcomes.
test('invalid, ambiguous and empty decision synthesis settle into readable reports without redispatch', async t => {
  const calls: string[] = [];
  const ai: NonNullable<ResearchAutomationServiceOptions['decisionSynthesisAi']> = {};
  for (const sectionId of ['M11', 'M12', 'I15'] as const) ai[sectionId] = {
    configuration: { contractVersion: '1.0.0', methodId: 'automation-decision-synthesis-configuration', sectionId,
      providerId: 'synthetic', modelId: 'synthetic', temperature: null, maxOutputTokens: 1000, timeoutMs: 1000, maxResponseBytes: 10000 },
    port: { generateText: async () => {
      calls.push(sectionId);
      if (sectionId === 'M12') throw new Error('private-provider-detail-not-for-report');
      return { text: sectionId === 'M11' ? 'invalid-provider-payload-not-for-report' : '{"aiCandidates":[]}' };
    } },
  };
  const f = await fixture(t, false, false, null, ai);
  await seedNativeDamiPackage(f.packages, { rawRows: [{ type: 'review', shopid: '78085196', itemid: '17678138164',
    cmtid: 'context', comment: 'Tôi mua tặng.', rating_star: 5 }] });
  await f.service.confirmScope(workspaceId, runId, f.confirm);
  await f.service.processNext(); await f.service.processNext();
  const ready = await f.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY', JSON.stringify(ready.blockers));
  assert.deepEqual(calls, ['I15', 'M11', 'M12']);
  assert.deepEqual(ready.aiActivity, {
    m11: { states: { prepared: 0, dispatching: 0, completed: 1, dispatchUnknown: 0 }, outcomes: { valid: 0, invalid: 1 }, billing: { state: 'UNKNOWN' } },
    m12: { states: { prepared: 0, dispatching: 0, completed: 0, dispatchUnknown: 1 }, outcomes: { valid: 0, invalid: 0 }, billing: { state: 'UNKNOWN' } },
    i15: { states: { prepared: 0, dispatching: 0, completed: 1, dispatchUnknown: 0 }, outcomes: { valid: 1, invalid: 0 }, billing: { state: 'UNKNOWN' } },
  }, 'Decision-only configuration exposes its three distinct outcomes without inventing I14 activity');
  assert.deepEqual(f.db.prepare('SELECT section_id, state, validation_status FROM analysis_research_automation_ai_executions ORDER BY section_id').all(), [
    { section_id: 'I15', state: 'COMPLETED', validation_status: 'VALID' },
    { section_id: 'M11', state: 'COMPLETED', validation_status: 'INVALID' },
    { section_id: 'M12', state: 'DISPATCH_UNKNOWN', validation_status: null },
  ]);
  const changes = f.db.prepare('SELECT total_changes() n').get();
  f.db.pragma('query_only = ON');
  for (const kind of ['MARKET', 'INSIGHT'] as const) {
    const report = await f.service.readReport(workspaceId, runId, kind);
    assert.doesNotMatch(report.bytes.toString(), /private-provider-detail|invalid-provider-payload|RESPONSE_NOT_JSON|TRANSPORT_OUTCOME_AMBIGUOUS/);
  }
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
  assert.deepEqual(calls, ['I15', 'M11', 'M12']);
  assert.equal(f.providerCalls(), 0);
});

test('source-bound confirmation freezes exact native reuse or skip before collection and preserves the report pair after later source arrival', async t => {
  for (const chosen of ['RESOLVED', 'SKIPPED', 'NONE'] as const) await t.test(chosen, async t => {
    const f = await fixture(t);
    const original = chosen === 'NONE' ? undefined : await seedNativeDamiPackage(f.packages, { rawRows: [
      { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '1', comment: 'Tôi dùng ở nhà.', rating_star: 5 },
    ] });
    const request = { ...f.confirm, contractVersion: 'research-automation-confirm-v2', sources: {
      metric: { decision: 'ABSENT' }, nativeReview: chosen === 'SKIPPED' ? 'SKIP' : 'AUTO_REUSE',
    } };
    await f.service.confirmScope(workspaceId, runId, request);
    const sourceRow = f.db.prepare('SELECT source_set_sha256 sha FROM analysis_research_automation_source_sets WHERE run_id=?').get(runId) as { sha: string };
    const frozen = JSON.parse((await f.artifacts.read(sourceRow.sha)).toString());
    assert.deepEqual(frozen.metric, { decision: 'ABSENT' });
    assert.equal(frozen.nativeReview.decision, chosen);
    assert.throws(() => f.db.prepare('UPDATE analysis_research_automation_source_sets SET confirmed_at=? WHERE run_id=?').run('later', runId), /immutable/);
    assert.throws(() => f.db.prepare('UPDATE analysis_research_automation_runs SET confirmed_source_set_sha256=NULL WHERE run_id=?').run(runId), /immutable/);
    await seedNativeDamiPackage(f.packages, { packageKey: 'native-source:another-original', rawRows: [
      { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '2', comment: 'Tôi dùng ở công ty.', rating_star: 4 },
    ] });
    const before = f.db.prepare('SELECT total_changes() n').get();
    assert.equal((await f.service.confirmScope(workspaceId, runId, request)).exactRetry, true);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
    await assert.rejects(f.service.confirmScope(workspaceId, runId, { ...request, sources: { ...request.sources, nativeReview: chosen === 'SKIPPED' ? 'AUTO_REUSE' : 'SKIP' } }), /request key/i);
    await f.service.processNext(); await f.service.processNext();
    const ready = await f.service.getRun(workspaceId, runId);
    assert.equal(ready.status, 'DRAFT_READY');
    assert.ok(ready.outputs?.market && ready.outputs.insight);
    const insight = JSON.parse((await f.artifacts.read(ready.outputs.insight.versionId)).toString());
    const market = JSON.parse((await f.artifacts.read(ready.outputs.market.versionId)).toString());
    assert.equal(insight.confirmedSourceSetSha256, sourceRow.sha);
    assert.equal(market.confirmedSourceSetSha256, sourceRow.sha);
    if (chosen === 'RESOLVED') assert.equal(insight.nativeReview.nativeSource.sourcePackage.packageId, original!.identity.packageId);
    else assert.equal(insight.nativeReview, null);
    assert.equal(market.metricMethods, null);
    assert.equal(f.providerCalls(), chosen === 'NONE' ? 1 : 0);
    const reads = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
      workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('No live workspace discovery on replay'); } } as never });
    f.db.pragma('query_only = ON');
    const saved = f.db.prepare('SELECT total_changes() n').get();
    await reads.readReport(workspaceId, runId, 'MARKET');
    await reads.readReport(workspaceId, runId, 'INSIGHT');
    if (chosen === 'SKIPPED') await assert.rejects(reads.readInsightSourceContext(workspaceId, runId, (await reads.listReportVersions(workspaceId, runId))[0]!.pairId),
      /no verified adopted review source/, 'a skipped review source is unavailable, not an empty accepted context');
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), saved);
    f.db.pragma('query_only = OFF');
  });
});

// The service owns pair publication and selection. Bridge-only replay cannot
// detect a new source accidentally being rendered into the original output rows.
test('a late exact native source creates a separate atomic report pair while original reports and usage remain unchanged', async t => {
  const f = await fixture(t);
  const original = await seedNativeDamiPackage(f.packages, { rawRows: [
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '1', comment: 'Tôi mua cho gia đình. Tôi dùng ở nhà.', rating_star: 5 },
  ] });
  await f.service.confirmScope(workspaceId, runId, { ...f.confirm, contractVersion: 'research-automation-confirm-v2',
    sources: { metric: { decision: 'ABSENT' }, nativeReview: 'AUTO_REUSE' } });
  await f.service.processNext(); await f.service.processNext();
  const [first] = await f.service.listReportVersions(workspaceId, runId);
  assert.ok(first);
  const previous = new Map(await Promise.all(first.outputs.map(async output => [output.kind, await f.service.readReport(workspaceId, runId, output.kind, false, first.pairId)] as const)));
  const runBefore = f.db.prepare('SELECT * FROM analysis_research_automation_runs WHERE run_id=?').get(runId);
  const usageBefore = f.db.prepare('SELECT * FROM analysis_research_automation_usage WHERE run_id=?').all(runId);
  const replacement = await seedNativeDamiPackage(f.packages, { packageKey: 'native-source:explicit-late', rawRows: [
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '2', comment: 'Tôi mua tặng. Tôi mang đi làm.', rating_star: 4 },
  ] });
  const request = { contractVersion: 'automation-report-revision-v1', requestKey: '77777777-7777-4777-8777-777777777777',
    previousPairId: first.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'USE_PACKAGE', packageId: replacement.identity.packageId } } };
  const queued = await f.service.requestReportRevision(workspaceId, runId, request);
  assert.equal(queued.state, 'QUEUED');
  const beforeRetry = f.db.prepare('SELECT total_changes() n').get() as { n: bigint };
  assert.deepEqual(await f.service.requestReportRevision(workspaceId, runId, request), { ...queued, exactRetry: true });
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), beforeRetry);
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '88888888-8888-4888-8888-888888888888' }), /pending/);
  assert.equal(await f.service.processNext(), true);
  const versions = await f.service.listReportVersions(workspaceId, runId);
  assert.deepEqual(versions.map(item => item.versionNumber), [1, 2]);
  const second = versions[1]!;
  assert.equal(second.outputs.length, 2);
  assert.notEqual(second.pairId, first.pairId);
  const insight = second.outputs.find(item => item.kind === 'INSIGHT')!;
  const semantic = JSON.parse((await f.artifacts.read(insight.versionId)).toString());
  assert.equal(semantic.nativeReview.contractVersion, 'automation-native-review-snapshot-v2');
  assert.equal(semantic.nativeReview.executionId, queued.attemptId);
  assert.equal(semantic.nativeReview.nativeSource.sourcePackage.packageId, replacement.identity.packageId);
  assert.notEqual(semantic.nativeReview.nativeSource.sourcePackage.packageId, original.identity.packageId);
  const newInsight = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, second.pairId);
  assert.match(newInsight.bytes.toString(), /Tôi mang đi làm/);
  assert.doesNotMatch(newInsight.bytes.toString(), /Tôi dùng ở nhà/);
  const newMarket = await f.service.readReport(workspaceId, runId, 'MARKET', false, second.pairId);
  // Only admitted spans cross into decision packets. The raw "mang đi làm"
  // clause is retained in Insight, but the current literal method does not code it.
  // Two distinct admitted contexts exercise old-versus-new pair selection.
  const currentDom = new JSDOM(newMarket.bytes.toString());
  const originalDom = new JSDOM(previous.get('MARKET')!.bytes.toString());
  try {
    for (const section of ['M11', 'M12']) {
      const text = (dom: JSDOM) => [...dom.window.document.querySelectorAll(`[id^="decision-${section}-"]`)]
        .map(node => node.textContent).join('\n');
      assert.match(text(currentDom), /mua tặng/);
      assert.doesNotMatch(text(currentDom), /mua cho gia đình|dùng ở nhà|mang đi làm/);
      assert.match(text(originalDom), /mua cho gia đình/);
      assert.doesNotMatch(text(originalDom), /mua tặng|mang đi làm/);
    }
    const market = second.outputs.find(item => item.kind === 'MARKET')!;
    const marketSemantic = JSON.parse((await f.artifacts.read(market.versionId)).toString());
    assert.equal(marketSemantic.decisionPairedInsightVersionId, insight.versionId);
  } finally { currentDom.window.close(); originalDom.window.close(); }
  for (const output of first.outputs)
    assert.deepEqual(await f.service.readReport(workspaceId, runId, output.kind, false, first.pairId), previous.get(output.kind));
  assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT'), previous.get('INSIGHT'), 'Legacy routes keep their original version; callers select a new pair explicitly.');
  assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_runs WHERE run_id=?').get(runId), runBefore);
  assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_usage WHERE run_id=?').all(runId), usageBefore);
  assert.equal(f.providerCalls(), 0);
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '99999999-9999-4999-8999-999999999999' }), /no longer current/);
  const packagesBefore = f.db.prepare('SELECT count(*) n FROM foundation_source_packages').get();
  const kept = await f.service.requestReportRevision(workspaceId, runId, { ...request, requestKey: '12121212-1212-4212-8212-121212121212', previousPairId: second.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  await f.service.processNext();
  const allVersions = await f.service.listReportVersions(workspaceId, runId);
  assert.deepEqual(allVersions.map(item => item.versionNumber), [1, 2, 3]);
  const thirdInsight = allVersions[2]!.outputs.find(item => item.kind === 'INSIGHT')!;
  const keptSemantic = JSON.parse((await f.artifacts.read(thirdInsight.versionId)).toString());
  assert.deepEqual(keptSemantic.nativeReview, semantic.nativeReview, 'KEEP reuses the exact verified method snapshot instead of recoding the same reviews.');
  assert.deepEqual(keptSemantic.sourceClaimsArtifact, semantic.sourceClaimsArtifact, 'KEEP retains exact source-claim identities without model regeneration.');
  assert.deepEqual(keptSemantic.i14AdmissionArtifact, semantic.i14AdmissionArtifact, 'KEEP retains exact I14 admission without a new inference or collection.');
  assert.notEqual(kept.attemptId, semantic.nativeReview.executionId);
  assert.deepEqual(f.db.prepare('SELECT count(*) n FROM foundation_source_packages').get(), packagesBefore);
  await f.service.readReport(workspaceId, runId, 'INSIGHT', false, allVersions[2]!.pairId);
  const insightOf = (pair: typeof first) => pair.outputs.find(item => item.kind === 'INSIGHT')!.versionId;
  const firstSemantic = JSON.parse((await f.artifacts.read(insightOf(first))).toString());
  const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
  const changes = f.db.prepare('SELECT total_changes() n').get();
  const pathBefore = process.env.PATH;
  f.db.pragma('query_only=ON');
  try {
    process.env.PATH = '/no-local-normalizer-for-report-replay';
    const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
      workspaceReader: { readVerifiedWorkspace: () => { throw new Error('No live workspace replay'); } } as unknown as FlowDiscoveryWorkspaceReader,
      now: () => { throw new Error('No clock during frozen replay'); } });
    for (const pair of allVersions) for (const output of pair.outputs)
      await reader.readReport(workspaceId, runId, output.kind, false, pair.pairId);
    const contexts = await Promise.all(allVersions.map(pair => reader.readInsightSourceContext(workspaceId, runId, pair.pairId)));
    for (const [index, snapshot] of [firstSemantic.nativeReview, semantic.nativeReview, keptSemantic.nativeReview].entries())
      assert.deepEqual(contexts[index], { binding: { workspaceId, runId, pairId: allVersions[index]!.pairId,
        scopeSha256: (runBefore as { scope_request_sha256: string }).scope_request_sha256, reportSha256: insightOf(allVersions[index]!),
        sourceKind: 'NATIVE', sourcePackageSha256: sha(snapshot.sourcePackage), inputSha256: sha(snapshot.output.input) },
      input: snapshot.output.input }, 'each explicit pair binds its own verified method package and unchanged adopted input');
    assert.notDeepEqual(contexts[0]!.input, contexts[1]!.input, 'a historical pair is not answered with the current source');
    contexts[1]!.input.records.length = 0;
    assert.deepEqual((await reader.readInsightSourceContext(workspaceId, runId, allVersions[1]!.pairId)).input, semantic.nativeReview.output.input,
      'returned input is an independent clone');
    await assert.rejects(reader.readInsightSourceContext(workspaceId, runId, 'f'.repeat(64)), /not found/, 'a missing pair has no latest substitute');
    await assert.rejects(f.service.readInsightSourceContext(workspaceId, '99999999-9999-4999-8999-999999999999', first.pairId), /not found/);
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes);
    assert.equal(f.providerCalls(), 0);
  } finally { process.env.PATH = pathBefore; f.db.pragma('query_only=OFF'); }
});

test('ambiguous native confirmation is rejected before admission; damage after freezing cannot trigger a replacement collection', async t => {
  const f = await fixture(t);
  const original = await seedNativeDamiPackage(f.packages);
  const request = { ...f.confirm, contractVersion: 'research-automation-confirm-v2', sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'AUTO_REUSE' } };
  await f.service.confirmScope(workspaceId, runId, request);
  const data = original.identity.manifest.files.find(file => file.path === 'capture/dataset.json')!.sha256;
  await fs.writeFile(path.join(f.root, 'artifacts', 'sha256', data.slice(0, 2), data), 'corrupt');
  await assert.rejects(f.service.confirmScope(workspaceId, runId, request));
  await f.service.processNext();
  assert.equal(f.providerCalls(), 0);
  assert.equal((f.db.prepare('SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id=\'COLLECTION\'').get(runId) as { state: string }).state, 'FAILED');
  await t.test('ambiguity before confirmation', async t => {
    const g = await fixture(t);
    await seedNativeDamiPackage(g.packages);
    await seedNativeDamiPackage(g.packages, { packageKey: 'native-source:ambiguous-other' });
    const before = g.db.prepare('SELECT total_changes() n').get();
    await assert.rejects(g.service.confirmScope(workspaceId, runId, { ...g.confirm, ...request }), /unambiguous/);
    assert.deepEqual(g.db.prepare('SELECT total_changes() n').get(), before);
    assert.equal((await g.service.getRun(workspaceId, runId)).status, 'AWAITING_SCOPE');
    assert.equal((g.db.prepare('SELECT count(*) n FROM analysis_research_automation_source_sets').get() as { n: bigint }).n, 0n);
    assert.equal(g.providerCalls(), 0);
  });
});

test('a native capture reaches adopted Insight declarations without Zen lineage or replay calls', async t => {
  const state = await fixture(t);
  const seeded = await seedNativeDamiPackage(state.packages, { rawRows: [
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '1', comment: 'Tôi đã dùng sản phẩm.', rating_star: 5,
      review_date: 'Metric reporting month' },
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '2', comment: '“Tôi đã mua sản phẩm. <script>bad()</script>”', rating_star: 5 },
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '3', comment: '', rating_star: 5 },
  ] });
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  assert.equal(state.providerCalls(), 0);
  assert.equal(ready.usage.requestCount, 0);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.reviewCorpus, null);
  assert.equal(semantic.locatedReview, null);
  assert.equal(semantic.nativeReview.contractVersion, 'automation-native-review-snapshot-v1');
  assert.equal(semantic.nativeReview.output.input.records[0].timeText, 'Metric reporting month');
  assert.deepEqual(semantic.nativeReview.nativeSource.sourcePackage, seeded.identity);
  assert.deepEqual(semantic.nativeReview.output.input.i04.map((row: { span: { quote: string }; provenance: { basis: string } }) =>
    [row.span.quote, row.provenance.basis]), [['Tôi đã dùng sản phẩm', 'DECLARED']]);
  assert.ok(semantic.nativeReview.projection.pending.some((row: { reason: string }) => row.reason === 'QUOTED_TEXT_SCOPE'));
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
  const retained = await state.packages.readVerified(semantic.nativeReview.sourcePackage.packageId);
  for (const [name, bytes] of seeded.files) assert.deepEqual(retained.files.find(file => file.path === name)!.bytes, bytes);
  const before = state.db.prepare('SELECT total_changes() n').get();
  const view = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  const dom = new JSDOM(view.bytes.toString());
  try {
    assert.equal(dom.window.document.querySelector('#I04 tbody q')?.textContent, 'Tôi đã dùng sản phẩm');
    assert.match(dom.window.document.getElementById('I03')!.textContent!, /3 dòng nguồn: 2 đưa vào đọc, 1 loại khỏi đọc/);
    assert.match(dom.window.document.getElementById('I17')!.textContent!, /Tập phản hồi nguồn đã lưu/);
    const coverage = dom.window.document.getElementById('I03')!;
    const uniqueCount = [...coverage.querySelectorAll('dt')].find(node => node.textContent === 'Bản ghi duy nhất');
    assert.equal(uniqueCount?.nextElementSibling?.textContent, '3 (0 dòng trùng đồng nhất)');
    assert.match(coverage.textContent!, /1 khai báo thuộc 1 bản ghi/);
    assert.match(coverage.textContent!, /không có nghĩa OWNER đã duyệt từng nhãn/);
    const trace = dom.window.document.querySelector('[aria-label="Bản ghi và trạng thái mã hóa lời nguồn"]')!;
    assert.equal(trace.querySelectorAll('tbody tr').length, 3);
    assert.equal(trace.querySelector('tbody q')?.textContent, 'Tôi đã dùng sản phẩm.');
    assert.ok(trace.textContent!.includes(semantic.nativeReview.output.input.records[0].sourceSha256));
    assert.ok(trace.textContent!.includes(semantic.nativeReview.output.input.records[0].locator));
    assert.ok(dom.window.document.getElementById('I17')!.textContent!.includes(semantic.nativeReview.projectionSha256));
    // Internal codes keep their raw bytes and gain a Vietnamese gloss; locators stay unbreakable tokens.
    const codeCell = (root: Element, code: string) => [...root.querySelectorAll('code')].find(node => node.textContent === code);
    const empty = codeCell(trace, 'EMPTY_TEXT');
    assert.equal(empty?.nextElementSibling?.textContent, '(văn bản trống)');
    assert.equal(codeCell(trace, 'INCLUDED')?.nextElementSibling?.textContent, '(đưa vào đọc)');
    assert.deepEqual([...trace.querySelectorAll('code.loc')].map(node => node.textContent),
      semantic.nativeReview.output.input.records.map((record: { locator: string }) => record.locator));
    const quoted = codeCell(dom.window.document.body, 'QUOTED_TEXT_SCOPE');
    assert.equal(quoted?.nextElementSibling?.textContent, '(nằm trong phần trích dẫn)');
    assert.ok(quoted!.closest('tr')!.querySelector('code.loc'));
    assert.match(dom.window.document.getElementById('I17')!.textContent!, /Bản ghi N ứng với chỉ số N − 1/);
    // A located corpus without coding for I06 says so instead of claiming the method is unconnected.
    const records = semantic.nativeReview.output.input.records.length;
    assert.match(dom.window.document.getElementById('I06')!.textContent!,
      new RegExp(`Lượt này có ${records} bản ghi review trong lớp mã hóa, nhưng chưa có kết quả cho I06`));
    assert.doesNotMatch(dom.window.document.body.textContent!, /Chưa nối phương pháp/);
    assert.equal(dom.window.document.querySelectorAll('script, img, [onerror]').length, 0);
    const reviewNumbers = new Set(semantic.citationEntries.filter((entry: { sourceKind: string }) => entry.sourceKind === 'REVIEW')
      .map((entry: { number: number }) => entry.number));
    const reviewEntries = semantic.citations.entries.filter((entry: { number: number }) => reviewNumbers.has(entry.number));
    assert.equal(reviewEntries.length, 3, 'each native retained record gets an exact-source review citation');
    assert.deepEqual(reviewEntries.map((entry: { identity: string; technical: { locator: string } }) => [entry.identity, entry.technical.locator]),
      semantic.nativeReview.output.input.records.map((record: { sourceSha256: string; locator: string }) => [record.sourceSha256, record.locator]));
    assert.equal(dom.window.document.querySelector('#I04 tbody .cite')?.textContent, `[${reviewEntries[0].number}]`, 'the admitted quote cites the same record as I17');
    assert.deepEqual(citationRegisterViolations(dom.window.document), []);
    assert.deepEqual(providerNameViolations(view.bytes.toString()), []);
    assert.deepEqual(visibleTextViolations(reportVisibleText(dom.window.document)), []);
  } finally { dom.window.close(); }
  assert.deepEqual((await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, view.bytes);
  const marketView = await state.service.readReport(workspaceId, runId, 'MARKET');
  assert.deepEqual(providerNameViolations(marketView.bytes.toString()), []);
  assert.deepEqual(visibleTextViolations(reportVisibleText(marketView.bytes.toString())), []);
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  const dataset = seeded.identity.manifest.files.find(file => file.path === 'capture/dataset.json')!.sha256;
  await fs.writeFile(path.join(state.root, 'artifacts', 'sha256', dataset.slice(0, 2), dataset), 'corrupt');
  await assert.rejects(state.service.readReport(workspaceId, runId, 'INSIGHT'));
  await assert.rejects(state.service.readReport(workspaceId, runId, 'MARKET'),
    'Market packets cannot replay if their exact paired Insight source is corrupt');
  assert.equal(state.providerCalls(), 0);
});

test('ambiguous or damaged native originals block paid fallback; unrelated listings and derived overlays are not reused', async t => {
  for (const mode of ['ambiguous', 'damaged-original', 'wrong-listing', 'derived-overlay'] as const) await t.test(mode, async sub => {
    const state = await fixture(sub);
    const seeded = await seedNativeDamiPackage(state.packages, mode === 'wrong-listing' ? { selected: { shopId: '99', itemId: '100' } }
      : mode === 'derived-overlay' ? { extraFiles: new Map([['methods/literal-declaration-projection.json', Buffer.from('{}')]]) } : {});
    if (mode === 'ambiguous') await seedNativeDamiPackage(state.packages, { packageKey: 'synthetic-source:second-capture', captureRunId: 'second-run' });
    // A candidate with the exact original shape that fails verification is not absence.
    if (mode === 'damaged-original') await fs.writeFile(state.artifacts.pathForDigest(seeded.identity.manifestArtifactSha256), 'damaged');
    await state.service.confirmScope(workspaceId, runId, state.confirm);
    await state.service.processNext(); await state.service.processNext();
    const ready = await state.service.getRun(workspaceId, runId);
    assert.equal(ready.status, 'DRAFT_READY');
    const semantic = JSON.parse((await state.artifacts.read(ready.outputs!.insight!.versionId)).toString());
    assert.equal(semantic.nativeReview, null);
    const blocker = mode === 'ambiguous' ? 'NATIVE_SOURCE_AMBIGUOUS' : mode === 'damaged-original' ? 'SOURCE_PACKAGE_RESOLUTION_FAILED' : undefined;
    assert.equal(state.providerCalls(), blocker ? 0 : 1);
    if (blocker) assert.ok(ready.blockers.some(row => row.code === blocker));
  });
});

test('a damaged package of another shape cannot block native resolution, and the run freezes the matching original', async t => {
  const state = await fixture(t);
  const seeded = await seedNativeDamiPackage(state.packages);
  const bytes = Buffer.from('{"synthetic":"another run attachment"}\n');
  const unrelated = await state.packages.intake({ contractVersion: '1.0.0', packageKey: 'automation-metric-source:66666666-6666-4666-8666-666666666666',
    version: 1, sourceLabel: 'Synthetic unrelated attachment', sourceAcquiredAt: null, files: [{ path: 'normalized/automation-metric-source.json',
      sha256: createHash('sha256').update(bytes).digest('hex'), byteSize: bytes.length, mediaType: 'application/json', representationRole: 'derived',
      evidenceFamily: 'synthetic-metric', independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
      provenanceBasis: 'Synthetic fixture for an unrelated package' }] }, new Map([['normalized/automation-metric-source.json', bytes]]));
  await fs.writeFile(state.artifacts.pathForDigest(unrelated.manifestArtifactSha256), 'damaged');
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(!ready.blockers.some(row => row.code === 'SOURCE_PACKAGE_RESOLUTION_FAILED'));
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs!.insight!.versionId)).toString());
  assert.deepEqual(semantic.nativeReview.nativeSource.sourcePackage, seeded.identity);
  assert.equal(state.providerCalls(), 0);
});

test('oversized native presentation preserves paired reports and the full frozen method package', async t => {
  const state = await fixture(t, true);
  await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.nativeReview, null);
  assert.equal(semantic.nativeReviewFailure, 'NATIVE_REVIEW_REPORT_TOO_LARGE');
  assert.ok(semantic.nativeReviewFallback.sourcePackage.packageId);
  const claims = JSON.parse((await state.artifacts.read(semantic.sourceClaimsArtifact.sha256)).toString());
  assert.equal(claims.claims.filter((claim: { sectionId: string }) => claim.sectionId === 'I04').length, 1,
    'A shortened presentation must retain the full adopted action claim');
  const before = state.db.prepare('SELECT total_changes() n').get();
  assert.match((await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes.toString(), /NATIVE_REVIEW_REPORT_TOO_LARGE/);
  await state.service.readReport(workspaceId, runId, 'MARKET');
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(state.providerCalls(), 0);
});

test('invalid market observation lineage does not discard an independently verified native source', async t => {
  const state = await fixture(t, false, true);
  await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.blockers.some(row => row.code === 'PROVIDER_OUTPUT_INVALID'));
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs!.insight!.versionId)).toString());
  assert.equal(semantic.nativeReview.authorityState, 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS');
  assert.equal(semantic.nativeReview.output.input.i04.length, 1);
  assert.equal(state.providerCalls(), 0);
});

test('native method publication failure describes the retained source instead of asking to recollect', async t => {
  const state = await fixture(t);
  await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext();
  const put = state.artifacts.put.bind(state.artifacts);
  state.artifacts.put = async (...args) => {
    if (Buffer.from(args[0]).includes(Buffer.from('automation-native-review-run-v1'))) throw new Error('Synthetic method publication failure');
    return put(...args);
  };
  try { await state.service.processNext(); } finally { state.artifacts.put = put; }
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  const html = (await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes.toString();
  assert.match(html, /NATIVE_REVIEW_METHOD_FAILED/);
  assert.match(html, /Nguồn review native của đúng listing đã được gắn/);
  assert.doesNotMatch(html, /Chưa có corpus review gắn với lượt này/);
  assert.equal(state.providerCalls(), 0);
});

test('cancellation during native inventory IO settles the claimed collection without provider fallback', { timeout: 10_000 }, async t => {
  const state = await fixture(t);
  const seeded = await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  const datasetSha = seeded.identity.manifest.files.find(file => file.path === 'capture/dataset.json')!.sha256;
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const read = state.artifacts.read.bind(state.artifacts);
  let held = false;
  state.artifacts.read = async (...args) => {
    const bytes = await read(...args);
    if (args[0] === datasetSha && !held) { held = true; entered(); await gate; }
    return bytes;
  };
  const processing = state.service.processNext();
  try {
    await waiting;
    const active = await state.service.getRun(workspaceId, runId);
    await state.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1',
      requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: active.revision });
  } finally { release(); }
  await processing;
  const cancelled = await state.service.getRun(workspaceId, runId);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.steps.find(row => row.stepId === 'COLLECTION')!.state, 'CANCELLED');
  assert.equal(state.providerCalls(), 0);
});
