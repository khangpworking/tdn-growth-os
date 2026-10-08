import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { ResearchAutomationService, type ResearchAutomationReportInput } from '../../src/modules/analysis/research-automation/service.js';
import { ResearchAutomationWorker } from '../../src/modules/analysis/research-automation/worker.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationInsightLiteralEvidence } from '../../src/modules/analysis/research-automation/insight-literal-bridge.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';
import { literalRunId as runId, literalWorkspaceId as workspaceId, literalSelected } from '../helpers/insight-literal-fixture.js';
import { buildInsightLiteralEvidence } from '../../src/modules/analysis/insight-literal-evidence.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
const now = () => new Date('2026-10-08T00:00:00.000Z');
const url = 'https://shopee.vn/product/78085196/17678138164';
async function fixture(t: TestContext, { native = false, seller = false, starsAbsent = false, injectUntrustedLiteral = false, defaultRenderer = false,
  extraRows = [] }: { native?: boolean; seller?: boolean; starsAbsent?: boolean; injectUntrustedLiteral?: boolean; defaultRenderer?: boolean;
  extraRows?: { comment: string | null; star: unknown; id: string }[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-insight-literal-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-literal', title: 'Synthetic literal evidence' });
  const raw: { comment: string | null; star: unknown; id: string }[] = [
    { comment: 'Tôi chọn sản phẩm vì dễ mang theo, nhưng giao hàng chậm. Tôi đặt hàng trước, rồi nhận hàng sau.', star: 5, id: '1' }, { comment: 'Tôi chọn sản phẩm vì dễ mang theo, nhưng giao hàng chậm. Tôi đặt hàng trước, rồi nhận hàng sau.', star: 1, id: '2' },
    { comment: '', star: 4, id: '3' }, { comment: 'Không có số sao', star: undefined, id: '4' },
    { comment: 'Sao không hợp lệ', star: 0, id: '5' }, { comment: null, star: 2, id: '6' },
    { comment: 'Mâu thuẫn một', star: 3, id: '7' }, { comment: 'Mâu thuẫn hai', star: 3, id: '7' }, ...extraRows,
  ];
  if (starsAbsent) raw.forEach(row => { row.star = undefined; });
  const exactRows = raw.map(row => ({ shopId: literalSelected.shopId, itemId: literalSelected.itemId,
    comment: row.comment, reviewId: row.id, ...(row.star === undefined ? {} : { ratingStar: row.star }) }));
  if (native) await seedNativeDamiPackage(new SourcePackageService({ db, artifactStore: artifacts, now }), { rawRows: raw.map(row => ({
    type: 'review', shopid: literalSelected.shopId, itemid: literalSelected.itemId, cmtid: row.id, comment: row.comment,
    ...(row.star === undefined ? {} : { rating_star: row.star }) })) });
  let providerCalls = 0, collectorStarts = 0;
  const transport: ProviderTransport = { now: () => now().getTime(), sleep: async () => {}, fetch: (async (input, init) => {
    providerCalls++;
    const endpoint = new URL(String(input)), body = init?.body ? JSON.parse(String(init.body)) : {};
    const data = endpoint.pathname.endsWith('/credit/balance') ? { totalRemain: 100 }
      : endpoint.pathname.endsWith('/product/rank') ? [{ product_id: '101', product_name: 'Tiêu đề người bán tốt nhất', unit_price: 100 }]
        : { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
          product_name: 'Tiêu đề người bán tốt nhất', product_description: [{ text: 'Người bán tự nêu: có an toàn không? Sản phẩm dành cho người bận rộn.' }],
          revenue: 100, sales_volumn: 1, unit_price: 100 };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }) as typeof fetch };
  const source = seller ? bindResearchAutomationProvider(createResearchAutomationProviderRegistry({ kalodataSecretKey: 'synthetic-secret', serpApiKey: null,
    apifyTokenConfigured: false }, transport).get('KALODATA')) : undefined;
  let reportInput: ResearchAutomationReportInput | undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), ...(source ? { source } : {}),
    shopeeCollectorFactory: () => { collectorStarts++; return { requestsIssued: () => 0, collector: new FixtureShopeeCollector(Buffer.from(JSON.stringify(exactRows))) }; },
    ...(defaultRenderer ? {} : { renderer: (input, kind) => {
      if (kind === 'INSIGHT') reportInput = input;
      const rendered = buildResearchAutomationReport(input, kind);
      return injectUntrustedLiteral ? { ...rendered, semantic: { ...rendered.semantic, insightLiteral: { fabricated: true, selectedRecordCount: 999 } } } : rendered;
    } }), });
  const worker = new ResearchAutomationWorker({ service, db });
  t.after(async () => { await worker.close(); db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await worker.start();
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT', keyword: 'Synthetic literal',
    requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic exact listing only', includeTerms: [], excludeTerms: [],
    selectedProductIds: seller ? ['kalodata:101'] : [], peerProductIds: [], exactShopeeUrls: [url] });
  await service.processNext(); await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  return { root, databasePath: path.join(root, 'test.sqlite'), artifactRoot: path.join(root, 'artifacts'), db, artifacts, service, worker, pair, literalInput: (previousPairId: string) => {
    assert.ok(reportInput);
    const confirmed = db.prepare('SELECT scope_confirmed_at confirmedAt FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { confirmedAt: string };
    return { runId, start: reportInput.start, scope: reportInput.scope, scopeConfirmedAt: confirmed.confirmedAt, previousPairId,
      collection: reportInput.collection, captures: reportInput.captures };
  }, providerCalls: () => providerCalls, collectorStarts: () => collectorStarts };
}
async function waitPair(service: ResearchAutomationService, attemptId: string) {
  for (let poll = 0; poll < 400; poll++) {
    const attempt = (await service.listReportAttempts(workspaceId, runId)).find(item => item.attemptId === attemptId)!;
    if (attempt.state === 'COMMITTED') return attempt.pairId!;
    assert.ok(['QUEUED', 'RUNNING'].includes(attempt.state), canonicalJson(attempt));
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Literal revision did not settle');
}
for (const native of [false, true]) test(`${native ? 'native' : 'exact'} source-backed literal revision retains stars and duplicate notes with no coding adoption or extra calls`, async t => {
  const f = await fixture(t, { native, injectUntrustedLiteral: true });
  const oldReport = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId);
  const oldSemantic = JSON.parse((await f.artifacts.read(oldReport.versionId)).toString('utf8'));
  assert.equal(Object.hasOwn(oldSemantic, 'insightLiteral'), false, 'renderer cannot insert an unrequested literal snapshot');
  const calls = [f.providerCalls(), f.collectorStarts()];
  const request = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  const queued = await f.service.requestReportRevision(workspaceId, runId, request); f.worker.wake();
  const pairId = await waitPair(f.service, queued.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString('utf8'));
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v19');
  const literal = semantic.insightLiteral;
  assert.equal(literal.contractVersion, 'insight-literal-evidence-v1');
  assert.equal(literal.input.binding.previousPairId, f.pair.pairId);
  assert.equal(literal.selectedRecordCount, 6);
  assert.deepEqual(literal.stars.bins.map((bin: { value: number; recordCount: number }) => [bin.value, bin.recordCount]), [[1, 1], [2, 1], [3, 0], [4, 1], [5, 1]]);
  assert.equal(literal.stars.textlessUnknown.recordCount, 1);
  assert.equal(literal.stars.unreadableText.recordCount, 1);
  assert.equal(literal.stars.absentField.recordCount, 1);
  assert.equal(literal.stars.invalidValue.recordCount, 1);
  assert.equal(literal.duplicateTexts.length, 1);
  assert.equal(literal.duplicateTexts[0].recordPointers.length, 2);
  assert.deepEqual(literal.sellerLayer.customerCodingMembership, []);
  assert.equal(literal.sellerLayer.state, 'UNAVAILABLE');
  const html = report.bytes.toString('utf8');
  assert.match(html, /Phân bố số sao/); assert.match(html, /cảm nhận chưa biết/); assert.match(html, /nguồn không có số sao/);
  assert.match(html, /trùng nguyên văn, có thể cùng một người/); assert.match(html, /Cần bản thu chi tiết sản phẩm đã chọn/);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.equal((await f.service.requestReportRevision(workspaceId, runId, request)).exactRetry, true);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId)).bytes, report.bytes);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId)).bytes, oldReport.bytes);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  assert.deepEqual([f.providerCalls(), f.collectorStarts()], calls);
  assert.equal(Number((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind IN ('ADOPTION','PROPOSAL','RECEIPT')").get() as { n: number }).n), 0);
  // Owning verification is tested through readReport; projection tamper is also
  // rejected before source-backed evidence can be treated as a retained method.
  const verifier = new AutomationInsightLiteralEvidence({ db: f.db, artifactStore: f.artifacts, now });
  const bound = f.literalInput(f.pair.pairId);
  assert.deepEqual(await verifier.verify(literal, bound), literal);
  const altered = structuredClone(literal); altered.stars.bins[0].recordCount++;
  await assert.rejects(verifier.verify(altered, bound), /LITERAL_METHOD_REPLAY_MISMATCH/);
  await assert.rejects(verifier.verify(literal, { ...bound, previousPairId: 'a'.repeat(64) }), /exact source replay/);
  const keep = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } };
  const inheritedQueued = await f.service.requestReportRevision(workspaceId, runId, keep); f.worker.wake();
  const inheritedPair = await waitPair(f.service, inheritedQueued.attemptId);
  const inheritedReport = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, inheritedPair);
  const inheritedSemantic = JSON.parse((await f.artifacts.read(inheritedReport.versionId)).toString('utf8'));
  assert.deepEqual(inheritedSemantic.insightLiteral, literal, 'KEEP retains original literal request/source binding, not the latest predecessor');
  assert.equal(inheritedSemantic.rendererVersion, 'automation-report-kit-v19');
  assert.deepEqual([f.providerCalls(), f.collectorStarts()], calls);
});

for (const native of [false, true]) test(`${native ? 'native' : 'exact'} literal bridge independently replays actual source and rejects count/provenance tampering`, async t => {
  const f = await fixture(t, { native, seller: true });
  const historical = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId);
  // These service artifacts contain freshly minted package/collection IDs.
  // Their exact bytes must replay within this retained run, rather than match a
  // different run's random identities. Deterministic historical renderer hashes
  // are covered separately by the existing version fixtures.
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId)).bytes, historical.bytes);
  const bound = f.literalInput(f.pair.pairId);
  assert.equal(Boolean(bound.collection?.nativeReview), native);
  assert.equal(Boolean(bound.collection?.exactShopee), !native);
  const verifier = new AutomationInsightLiteralEvidence({ db: f.db, artifactStore: f.artifacts, now });
  const before = f.db.prepare('SELECT total_changes() n').get();
  const calls = [f.providerCalls(), f.collectorStarts()];
  const output = await verifier.build(bound);
  assert.equal(output.selectedRecordCount, 6);
  assert.equal(output.sellerLayer.state, 'AVAILABLE');
  const details = bound.captures.filter(capture => capture.stepId === 'COLLECTION' && capture.operation === 'kalodata.product.detail');
  assert.ok(details.length > 0);
  assert.equal(output.input.sellerStatements.length, details.length * 2);
  for (const capture of details) assert.deepEqual(output.input.sellerStatements.filter(statement => statement.sourceSha256 === capture.artifactSha256)
    .map(statement => [statement.sourceType, statement.period]), [['LISTING_TITLE', capture.window], ['LISTING_DESCRIPTION', capture.window]]);
  assert.deepEqual(output.sellerLayer.customerCodingMembership, []);
  assert.equal(output.duplicateTexts[0]!.recordPointers.length, 2);
  assert.deepEqual(await verifier.verify(output, bound), output);
  const altered = structuredClone(output); altered.stars.bins[0]!.recordCount++;
  await assert.rejects(verifier.verify(altered, bound), /LITERAL_METHOD_REPLAY_MISMATCH/);
  const sellerAltered = structuredClone(output); sellerAltered.input.sellerStatements[1]!.text = 'Invented customer barrier';
  await assert.rejects(verifier.verify(buildInsightLiteralEvidence(sellerAltered.input), bound), /exact source replay/);
  const forgedLocator = structuredClone(output); forgedLocator.input.sellerStatements[0]!.locator = '/data/comment';
  await assert.rejects(verifier.verify(buildInsightLiteralEvidence(forgedLocator.input), bound), /exact source replay/);
  await assert.rejects(verifier.verify(output, { ...bound, previousPairId: 'a'.repeat(64) }), /exact source replay/);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  assert.deepEqual([f.providerCalls(), f.collectorStarts()], calls);
});

for (const native of [false, true]) test(`${native ? 'native' : 'exact'} literal revision reports absent star field without invented zero bins and separates retained seller voice`, async t => {
  const f = await fixture(t, { native, seller: true, starsAbsent: true });
  const calls = [f.providerCalls(), f.collectorStarts()];
  const request = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  const queued = await f.service.requestReportRevision(workspaceId, runId, request); f.worker.wake();
  const pairId = await waitPair(f.service, queued.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString('utf8'));
  assert.equal(semantic.insightLiteral.stars.state, 'SOURCE_FIELD_ABSENT');
  assert.deepEqual(semantic.insightLiteral.stars.bins, []);
  assert.equal(semantic.insightLiteral.stars.absentField.recordCount, 6);
  assert.equal(semantic.insightLiteral.sellerLayer.state, 'AVAILABLE');
  assert.deepEqual(semantic.insightLiteral.sellerLayer.customerCodingMembership, []);
  const html = report.bytes.toString('utf8');
  assert.match(html, /nguồn không có số sao; chưa có phân bố số sao, không thay bằng 0/);
  assert.match(html, /Tiêu đề người bán tốt nhất/);
  assert.match(html, /Người bán tự nêu: có an toàn không/);
  assert.match(html, /không đưa vào rào cản của khách/);
  assert.match(html, /Nguồn TikTok Shop được giữ riêng với review Shopee/);
  assert.deepEqual([f.providerCalls(), f.collectorStarts()], calls);
});

for (const accepted of [false, true]) test(`literal revision inherits explicitly selected ${accepted ? 'accepted' : 'draft-v3'} coding with adoption lineage and never recalls the fake model`, async t => {
  const f = await fixture(t, { native: true, seller: true });
  const source = await f.service.readInsightSourceContext(workspaceId, runId, f.pair.pairId);
  const owner = { actorId: 'owner:synthetic-literal', role: 'OWNER' as const };
  const text = source.input.records[0]!.text!;
  const span = (quote: string) => ({ start: text.indexOf(quote), end: text.indexOf(quote) + quote.length, quote });
  const rules = { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(), binding: source.binding,
    rules: { ruleId: 'synthetic-literal-unclear', revision: 1, question: 'Which explicit words occur?',
      inclusionRule: 'Selected retained source only', adjudicationRule: 'Unclear text remains unclear; never derive sentiment from stars',
      corpora: [{ sectionId: 'I10', recordIndexes: [0, 1], question: 'Which literal clauses occur?', unit: 'source-native record',
        period: 'Synthetic retained sample', frame: 'Two source locators', channel: 'synthetic Shopee review', inclusionRule: 'Two selected readable records',
        membershipComplete: true, multiCode: false, externalSampling: 'UNKNOWN',
        codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: 'Lời nguồn về việc mang theo', phrase: 'dễ mang theo', firstRecordIndex: 0, firstSpan: span('dễ mang theo') }] },
        assignments: [], dispositions: [] }] } };
  const adoption = await f.service.adoptInsightCodingRules(workspaceId, runId, rules, owner);
  const base = { recordIndex: 0, provenance: { basis: 'PENDING_AI', coderRole: 'synthetic coder', adjudication: null, disagreement: null }, qualifiers: [], counterevidence: [] };
  const absent = { state: 'NOT_STATED', span: null };
  const annotations = { i02: [], i04: [], i09: [],
    i06: [{ ...base, firstEvent: span('Tôi đặt hàng'), secondEvent: span('nhận hàng'), relation: { context: span(text), link: span('rồi') } }], i13Mentions: [],
    corpora: [{ corpusIndex: 0, assignments: [0, 1].map(recordIndex => ({ recordIndex, code: 'C1', span: span('dễ mang theo'), provenance: base.provenance })),
      dispositions: [0, 1].map(recordIndex => ({ recordIndex, state: 'CODED', provenance: base.provenance })) }],
    i07: [{ ...base, choiceText: span('Tôi chọn sản phẩm'), reasonClause: span('dễ mang theo'), relation: { context: span(text), link: span('vì') },
      reasonFacet: 'PRODUCT_ATTRIBUTE', reasonPolarity: 'AFFIRMED', speakerBasis: 'SELF_STATED', resultState: absent }],
    i08: [{ ...base, attemptedTask: span('Tôi chọn sản phẩm'), obstacleClause: span('giao hàng chậm'), relation: { context: span(text), link: span('nhưng') },
      barrierFacet: 'ACCESS_AVAILABILITY', resolutionState: absent }],
    i05: [{ recordIndex: 0, span: { start: 0, end: text.length, quote: text }, polarity: 'UNCLEAR',
      target: { state: 'NOT_STATED', span: null }, speakerAttribution: { state: 'NOT_STATED', span: null },
      provenance: { basis: 'PENDING_AI', coderRole: 'synthetic coder', adjudication: null, disagreement: null }, qualifiers: [], counterevidence: [] }] };
  let modelCalls = 0;
  const modelRequest = { contractVersion: 'insight-model-request-v1', requestKey: randomUUID(), adoptionId: adoption.evidence.evidenceId,
    previousProposalId: null, recordIndexes: [0, 1] };
  const proposed = await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest, owner, {
    configuration: { contractVersion: 'insight-model-configuration-v1', providerId: 'synthetic', modelId: 'fixture-model',
      temperature: null, maxOutputTokens: 4096, timeoutMs: 1000, maxResponseBytes: 65536 },
    port: { async generateText() { modelCalls++; return { text: JSON.stringify(annotations) }; } },
  });
  assert.ok(proposed.proposal, canonicalJson(proposed));
  assert.equal(modelCalls, 1);
  const receiptIds: string[] = [];
  if (accepted) {
    const view = await f.service.readInsightCoding(workspaceId, runId, f.pair.pairId);
    const proposalSha256 = view.evidence.find(item => item.evidenceId === proposed.proposal!.evidence.evidenceId)!.sha256;
    const receipt = await f.service.acceptInsightCoding(workspaceId, runId, { contractVersion: 'insight-coding-accept-v1',
      requestKey: randomUUID(), proposalId: proposed.proposal.evidence.evidenceId, proposalSha256,
      selection: { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [], i05: [0], i06: [0], i07: [0], i08: [0],
        i09: [], i13Mentions: [], corpora: [{ corpusIndex: 0, assignments: [0, 1], dispositions: [0, 1] }] } }, owner);
    receiptIds.push(receipt.evidence.evidenceId);
  }
  const codingRequest = { contractVersion: 'automation-insight-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    ...(accepted ? { acceptedInsight: { proposalId: proposed.proposal.evidence.evidenceId, receiptIds } }
      : { draftInsight: { contractVersion: 'insight-draft-select-v2', proposalId: proposed.proposal.evidence.evidenceId } }) };
  const codingQueued = await f.service.requestReportRevision(workspaceId, runId, codingRequest); f.worker.wake();
  const codingPair = await waitPair(f.service, codingQueued.attemptId);
  const codingReport = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, codingPair);
  const codingSemantic = JSON.parse((await f.artifacts.read(codingReport.versionId)).toString('utf8'));
  const calls = [modelCalls, f.providerCalls(), f.collectorStarts()];
  const literalRequest = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: codingPair,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  const literalQueued = await f.service.requestReportRevision(workspaceId, runId, literalRequest); f.worker.wake();
  const pairId = await waitPair(f.service, literalQueued.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString('utf8'));
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v19');
  assert.deepEqual(semantic.insightCoding, codingSemantic.insightCoding, 'literal projection preserves exact proposal/adoption/selection binding');
  assert.equal(semantic.insightLiteral.selectedRecordCount, 6);
  assert.deepEqual(semantic.insightLiteral.sellerLayer.customerCodingMembership, []);
  assert.equal(semantic.insightLiteral.sellerLayer.state, 'AVAILABLE');
  assert.equal(semantic.insightCoding.output.input.i08.length, 1);
  assert.equal(semantic.insightCoding.output.input.i08[0].obstacleClause.quote, 'giao hàng chậm');
  assert.equal(semantic.insightCoding.output.input.i08.some((row: { obstacleClause: { quote: string } }) => /an toàn/.test(row.obstacleClause.quote)), false);
  const barrierView = report.bytes.toString('utf8').split('id="I08"')[1]!.split('<section')[0]!;
  assert.match(barrierView, /giao hàng chậm/);
  assert.match(barrierView, /Người bán tự nêu: có an toàn không/);
  assert.match(barrierView, /không đưa vào rào cản của khách/);
  const before = f.db.prepare('SELECT total_changes() n').get();
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId)).bytes, report.bytes);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, codingPair)).bytes, codingReport.bytes);
  assert.equal((await f.service.requestReportRevision(workspaceId, runId, literalRequest)).exactRetry, true);
  await f.service.proposeModelInsightCoding(workspaceId, runId, modelRequest, owner, null);
  assert.deepEqual([modelCalls, f.providerCalls(), f.collectorStarts()], calls);
  assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(Number((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind='ADOPTION'").get() as { n: number }).n), 1);
  assert.equal(Number((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind='PROPOSAL'").get() as { n: number }).n), 1);
  assert.equal(Number((f.db.prepare("SELECT count(*) n FROM analysis_insight_coding_evidence WHERE kind='RECEIPT'").get() as { n: number }).n), accepted ? 1 : 0);
});

test('OWNER HTTP revision and read routes reach retained literal evidence and reject unauthorized or malformed requests', async t => {
  const f = await fixture(t, { native: true });
  await f.worker.close();
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port;
  await new Promise<void>((resolve, reject) => probe.close(error => error ? reject(error) : resolve()));
  const origin = `http://127.0.0.1:${port}`;
  const token = 'synthetic-owner-token-123456-abcdefghijklmnopqrstuvwxyz';
  const application = openResearchAutomationApi({ databasePath: f.databasePath, artifactRoot: f.artifactRoot, origin,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: f.databasePath, artifactRoot: f.artifactRoot, token, allowedOrigin: origin, actorId: 'owner:synthetic-literal-http' } });
  const server = http.createServer(application.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  try {
    const ownerRoot = `${origin}/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const readRoot = `${origin}/api/workspaces/${workspaceId}/research-automation/runs/${runId}`;
    const request = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
    const post = (value: unknown, authorized = true) => fetch(`${ownerRoot}/report-revisions`, { method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(value) });
    const attemptCount = f.db.prepare('SELECT count(*) n FROM analysis_research_automation_attempts').get();
    assert.equal((await post(request, false)).status, 401);
    assert.equal((await post({ ...request, literalInsight: { ...request.literalInsight, approval: true } })).status, 400);
    assert.deepEqual(f.db.prepare('SELECT count(*) n FROM analysis_research_automation_attempts').get(), attemptCount);
    const queued = await post(request); assert.equal(queued.status, 202, await queued.clone().text());
    const receipt = await queued.json() as { attemptId: string };
    const pairId = await waitPair(f.service, receipt.attemptId);
    const served = await fetch(`${readRoot}/report-versions/${pairId}/reports/insight`);
    assert.equal(served.status, 200, await served.clone().text());
    const html = await served.text();
    assert.match(html, /Phân bố số sao từ nguồn/);
    assert.match(html, /trùng nguyên văn, có thể cùng một người/);
    assert.match(html, /Chưa có tiêu đề, mô tả, video hoặc quảng cáo người bán/);
    const stored = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
    assert.equal(html, stored.bytes.toString('utf8'));
    const versionsBefore = await f.service.listReportVersions(workspaceId, runId);
    const retried = await post(request); assert.equal(retried.status, 200, await retried.clone().text());
    assert.equal((await retried.json() as { exactRetry: boolean }).exactRetry, true);
    assert.deepEqual(await f.service.listReportVersions(workspaceId, runId), versionsBefore);
    assert.equal(await (await fetch(`${readRoot}/report-versions/${pairId}/reports/insight`)).text(), html);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await application.close();
  }
});

test('service without a presentation adapter renders its explicitly requested literal method and preserves the old fallback bytes', async t => {
  const f = await fixture(t, { defaultRenderer: true });
  const old = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId);
  const queued = await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1',
    requestKey: randomUUID(), previousPairId: f.pair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    literalInsight: { contractVersion: 'insight-literal-select-v1' } }); f.worker.wake();
  const pairId = await waitPair(f.service, queued.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString('utf8'));
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v19');
  assert.equal(semantic.insightLiteral.selectedRecordCount, 6);
  assert.match(report.bytes.toString('utf8'), /Phân bố số sao từ nguồn/);
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId)).bytes, old.bytes);
});

for (const native of [false, true]) test(`${native ? 'native' : 'exact'} retained null star stays missing and is excluded from valid-star bins through the service`, async t => {
  const f = await fixture(t, { native, extraRows: [{ id: '8', comment: 'Nguồn có trường sao nhưng giá trị null.', star: null }] });
  const queued = await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1',
    requestKey: randomUUID(), previousPairId: f.pair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
    literalInsight: { contractVersion: 'insight-literal-select-v1' } }); f.worker.wake();
  const pairId = await waitPair(f.service, queued.attemptId);
  const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, pairId);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString('utf8'));
  assert.equal(semantic.insightLiteral.selectedRecordCount, 7);
  assert.equal(semantic.insightLiteral.stars.missingValue.recordCount, 1);
  assert.equal(semantic.insightLiteral.stars.absentField.recordCount, 1);
  assert.equal(semantic.insightLiteral.stars.invalidValue.recordCount, 1);
  assert.deepEqual(semantic.insightLiteral.stars.bins.map((bin: { value: number; recordCount: number }) => [bin.value, bin.recordCount]), [[1, 1], [2, 1], [3, 0], [4, 1], [5, 1]]);
  assert.match(report.bytes.toString('utf8'), /Nguồn có trường sao nhưng thiếu giá trị/);
});

test('exact-source literal projection preserves the established equal-native-ID collapse and both original occurrence references', async t => {
  const f = await fixture(t, { extraRows: [{ id: '1', comment: 'Tôi chọn sản phẩm vì dễ mang theo, nhưng giao hàng chậm. Tôi đặt hàng trước, rồi nhận hàng sau.', star: 5 }] });
  const verifier = new AutomationInsightLiteralEvidence({ db: f.db, artifactStore: f.artifacts, now });
  const output = await verifier.build(f.literalInput(f.pair.pairId));
  assert.equal(output.selectedRecordCount, 6);
  const collapsed = output.input.reviews.find(row => row.sourceRefs.length === 2)!;
  assert.ok(collapsed);
  assert.deepEqual(collapsed.sourceRefs.map(ref => ref.rowLocator), ['/0', '/8']);
  assert.equal(output.duplicateTexts[0]!.recordPointers.length, 2, 'distinct IDs with identical text still count separately');
  assert.equal(output.stars.bins[4]!.recordCount, 1, 'the equal same-ID occurrence does not inflate its count');
});
