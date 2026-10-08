import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
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
async function fixture(t: TestContext, native = false, seller = false, starsAbsent = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-insight-literal-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-literal', title: 'Synthetic literal evidence' });
  const raw = [
    { comment: 'Nguyên văn giống nhau', star: 5, id: '1' }, { comment: 'Nguyên văn giống nhau', star: 1, id: '2' },
    { comment: '', star: 4, id: '3' }, { comment: 'Không có số sao', star: undefined, id: '4' },
    { comment: 'Sao không hợp lệ', star: 0, id: '5' }, { comment: null, star: 2, id: '6' },
    { comment: 'Mâu thuẫn một', star: 3, id: '7' }, { comment: 'Mâu thuẫn hai', star: 3, id: '7' },
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
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), ...(source ? { source } : {}),
    shopeeCollectorFactory: () => { collectorStarts++; return { requestsIssued: () => 0, collector: new FixtureShopeeCollector(Buffer.from(JSON.stringify(exactRows))) }; },
    renderer: (input, kind) => { if (kind === 'INSIGHT') reportInput = input; return buildResearchAutomationReport(input, kind); } });
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
  return { db, artifacts, service, worker, pair, literalInput: (previousPairId: string) => {
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
  const f = await fixture(t, native);
  const oldReport = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId);
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
});

for (const native of [false, true]) test(`${native ? 'native' : 'exact'} literal bridge independently replays actual source and rejects count/provenance tampering`, async t => {
  const f = await fixture(t, native, true);
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
  const f = await fixture(t, native, true, true);
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
