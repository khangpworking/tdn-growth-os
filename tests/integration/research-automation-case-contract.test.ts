import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import fixture from '../fixtures/research-three-case-contract.json' with { type: 'json' };
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import type { AutomationSourceClaims } from '../../contracts/analysis/automation-source-claims.generated.js';
import type { AutomationSourceClaimsReference } from '../../contracts/analysis/automation-source-claims-reference.generated.js';
import type { AutomationM01InventoryReference } from '../../contracts/analysis/automation-m01-inventory-reference.generated.js';
import type { AutomationM01EvidenceInventory } from '../../contracts/analysis/automation-m01-evidence-inventory.generated.js';
import type { AutomationI14AdmissionReference } from '../../contracts/analysis/automation-i14-admission-reference.generated.js';
import type { AutomationI14EvidenceAdmission } from '../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import type { NativeSourceReviewSnapshot } from '../../src/modules/analysis/research-automation/native-source-review-bridge.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';
import { citationRegisterViolations, providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const now = () => new Date('2026-10-02T01:00:00.000Z');
interface SavedMarket {
  kind: 'MARKET'; requestedPeriod: { startDate: string; endDate: string; dayCount: number };
  descriptiveMethods: DescriptiveMarketMethods;
  sourceClaimsArtifact: AutomationSourceClaimsReference;
  m01InventoryArtifact: AutomationM01InventoryReference;
}
interface SavedInsight { kind: 'INSIGHT'; nativeReview: NativeSourceReviewSnapshot; sourceClaimsArtifact: AutomationSourceClaimsReference; i14AdmissionArtifact: AutomationI14AdmissionReference }

// Owner-boundary proof for generic listing identity and evidence routing. This
// is not a live benchmark, a whole-market estimate or an R1 synthesis test.
test('one database routes three industries to their own retained review source and 365-day query inventory', { timeout: 30_000 }, async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-three-case-contract-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'three-case-contract', title: 'Synthetic cross-industry acceptance' });
  const sources = new Map<string, Awaited<ReturnType<typeof seedNativeDamiPackage>>>();
  for (const c of fixture.cases) {
    sources.set(c.id, await seedNativeDamiPackage(packages, {
      packageKey: `synthetic-source:three-case-${c.id}`, captureRunId: `synthetic-native-${c.id}`, selected: c.nativeListing,
      rawRows: [c.reviewText, c.quotedReviewText, ''].map((comment, index) => ({ type: 'review',
        shopid: c.nativeListing.shopId, itemid: c.nativeListing.itemId, cmtid: `${c.id}-${index}`, comment, rating_star: 5 })),
    }));
  }
  let calls = 0;
  let transportTime = now().getTime();
  const requestedWindows = new Map<string, string[]>();
  const transport: ProviderTransport = { now: () => transportTime,
    sleep: async milliseconds => { transportTime += milliseconds; }, fetch: (async (input, init) => {
    calls++;
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) as { keyword?: string; product_id?: string; date_range?: string } : {};
    let data: unknown;
    if (url.pathname.endsWith('/credit/balance')) data = { totalRemain: 100 };
    else if (url.pathname.endsWith('/product/rank')) {
      const c = fixture.cases.find(row => row.keyword === body.keyword);
      assert.ok(c, 'Unexpected keyword must not fall back to another industry');
      data = [{ product_id: c.marketProductId, product_name: c.marketProductName, unit_price: c.detailFields.unit_price }];
    } else {
      assert.ok(url.pathname.endsWith('/product/detail'), 'Only fixture detail/rank/balance requests are supported');
      const c = fixture.cases.find(row => row.marketProductId === body.product_id);
      assert.ok(c, 'Unknown provider object must not reuse another case');
      requestedWindows.set(c.id, [...(requestedWindows.get(c.id) ?? []), body.date_range!]);
      data = { product_id: c.marketProductId, product_name: c.marketProductName, product_region: 'vn', currency: 'VND',
        date_range: body.date_range, ...c.detailFields };
    }
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }) as typeof fetch };
  const source = bindResearchAutomationProvider(createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-no-network-secret', serpApiKey: null, apifyTokenConfigured: false,
  }, transport).get('KALODATA'));
  const retainedReads: Array<{ runId: string; kind: 'MARKET' | 'INSIGHT'; bytes: Buffer; claimsSha256: string; m01Sha256?: string; i14Sha256?: string }> = [];

  for (const c of fixture.cases) await t.test(c.id, async () => {
    if (c.mode !== 'PRODUCT' && c.mode !== 'CATEGORY') throw new TypeError('Invalid pinned fixture mode');
    const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => c.runId,
      i14SynthesisAi: { configuration: { contractVersion: '1.0.0', methodId: 'automation-i14-synthesis-configuration', providerId: 'synthetic', modelId: 'synthetic', temperature: null, maxOutputTokens: 1000, timeoutMs: 1000, maxResponseBytes: 10000 },
        port: { generateText: async () => { assert.fail('Bare-action fixtures must never dispatch an I14 model call'); } } },
      workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source, renderer: (input, kind) => {
        const rendered = buildResearchAutomationReport(input, kind);
        // An optional presentation adapter cannot replace the service's claims.
        return { ...rendered, semantic: { ...rendered.semantic, sourceClaims: { contractVersion: 'renderer-authored-untrusted' },
          m01Inventory: { conclusion: 'Renderer-authored unsupported conclusion' },
          m01InventoryArtifact: { contractVersion: 'renderer-authored-untrusted' },
          i14Admission: { status: 'USE_CONTEXT_ADMITTED', anchors: ['renderer-authored'] },
          i14AdmissionArtifact: { contractVersion: 'renderer-authored-untrusted' },
          i14ExecutionId: '99999999-9999-4999-8999-999999999999', i14Synthesis: { status: 'VALID' } } };
      },
      shopeeCollectorFactory: () => { throw new Error('A matching retained original must not invoke a collector'); } });
    await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: c.startKey,
      keyword: c.keyword, mode: c.mode, requestedPeriod: fixture.requestedPeriod, reports: ['MARKET', 'INSIGHT'] });
    await service.processNext();
    const awaiting = await service.getRun(workspaceId, c.runId);
    assert.equal(awaiting.status, 'AWAITING_SCOPE');
    assert.deepEqual(awaiting.productCards.map(card => card.productId), [`kalodata:${c.marketProductId}`]);
    // TikTok market object and Shopee review listing are explicitly separate;
    // selecting both never asserts that their physical products are identical.
    await service.confirmScope(workspaceId, c.runId, { contractVersion: 'research-automation-confirm-v1', requestKey: c.confirmKey,
      expectedRevision: awaiting.revision, definition: 'Synthetic independent TikTok observations and exact Shopee review listing',
      includeTerms: [], excludeTerms: [], selectedProductIds: [`kalodata:${c.marketProductId}`], peerProductIds: [],
      exactShopeeUrls: [`https://shopee.vn/product/${c.nativeListing.shopId}/${c.nativeListing.itemId}`] });
    await service.processNext(); await service.processNext();
    const ready = await service.getRun(workspaceId, c.runId);
    assert.equal(ready.status, 'DRAFT_READY', JSON.stringify(ready.blockers));
    assert.ok(ready.outputs?.market && ready.outputs.insight);
    const market = JSON.parse((await artifacts.read(ready.outputs.market.versionId)).toString()) as SavedMarket;
    const insight = JSON.parse((await artifacts.read(ready.outputs.insight.versionId)).toString()) as SavedInsight;
    assert.equal('i14ExecutionId' in insight, false, 'Presentation cannot fabricate a retained AI call');
    assert.equal('i14Synthesis' in insight, false, 'Presentation cannot fabricate AI candidates');
    assert.deepEqual(db.prepare('SELECT execution_id FROM analysis_research_automation_ai_executions').all(), []);
    const marketClaims = JSON.parse((await artifacts.read(market.sourceClaimsArtifact.sha256)).toString()) as AutomationSourceClaims;
    const insightClaims = JSON.parse((await artifacts.read(insight.sourceClaimsArtifact.sha256)).toString()) as AutomationSourceClaims;
    const i14Bytes = await artifacts.read(insight.i14AdmissionArtifact.sha256);
    const i14 = JSON.parse(i14Bytes.toString()) as AutomationI14EvidenceAdmission;
    assert.equal(i14Bytes.length, insight.i14AdmissionArtifact.byteSize);
    assert.equal(i14.runId, c.runId);
    assert.equal(i14.workspaceId, workspaceId);
    assert.equal(i14.scopeSha256, insightClaims.scopeSha256);
    assert.equal(i14.sourceClaims.claimsSha256, insightClaims.claimsSha256);
    assert.equal(i14.locatedMethodOutputId, insight.nativeReview.output.methodOutputId);
    assert.deepEqual(i14.ownerQuestion, { state: 'UNSET', text: null });
    assert.equal(i14.status, 'INSUFFICIENT_EVIDENCE', 'Pinned bare-use fixtures do not become use-context evidence');
    assert.equal(i14.insufficientEvidence, 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT');
    assert.deepEqual(i14.anchors, []);
    assert.deepEqual(i14.unassigned, insightClaims.claims.map(claim => ({ claimId: claim.claimId, sectionId: 'I04', reason: 'I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT' })));
    assert.equal('i14Admission' in insight, false, 'Presentation cannot invent eligible I14 anchors');
    assert.equal('i14AdmissionArtifact' in market, false, 'I14 belongs to Insight, not Market');
    const m01Bytes = await artifacts.read(market.m01InventoryArtifact.sha256);
    const m01 = JSON.parse(m01Bytes.toString()) as AutomationM01EvidenceInventory;
    assert.equal(m01Bytes.length, market.m01InventoryArtifact.byteSize);
    assert.equal(m01.runId, c.runId);
    assert.equal(m01.workspaceId, workspaceId);
    assert.equal(m01.scopeSha256, marketClaims.scopeSha256);
    assert.equal(m01.sourceClaims.claimsSha256, marketClaims.claimsSha256);
    assert.deepEqual(m01.ownerQuestion, { state: 'UNSET', text: null });
    assert.equal(m01.status, 'UNRANKED_INVENTORY');
    assert.equal(m01.conclusion, null);
    assert.equal(m01.items.length, c.expected.m05ObservationCount);
    assert.equal('m01Inventory' in market, false, 'Presentation cannot author an inline M01 conclusion');
    assert.equal('m01InventoryArtifact' in insight, false, 'M01 belongs to Market, not the independent Insight report');
    for (const item of m01.items) {
      const upstream = marketClaims.claims.find(claim => claim.claimId === item.claimId)!;
      assert.ok(upstream, 'Every M01 item must resolve to its exact eligible upstream claim');
      assert.equal(item.basis, 'SOURCE_OBSERVED');
      assert.equal(item.evidenceKind, 'SOURCE_OBSERVATION');
      assert.deepEqual([item.value, item.unit, item.period, item.scope, item.coverage],
        [upstream.observation.value, upstream.observation.unit, upstream.observation.period, upstream.observation.scope, upstream.observation.coverage]);
      assert.deepEqual(item.method, upstream.method);
      assert.equal(item.source.sha256, upstream.source.sha256);
      assert.equal(item.source.locator, upstream.source.locator);
    }
    assert.deepEqual(market.requestedPeriod, { ...fixture.requestedPeriod, dayCount: 365 });
    const observations = market.descriptiveMethods.input.m05;
    assert.equal(observations.length, c.expected.m05ObservationCount);
    for (const [measure, state, value] of [
      ['revenue', c.expected.revenueState, c.expected.revenue], ['sales_volumn', c.expected.unitsState, c.expected.units],
    ]) {
      const rows = observations.filter(row => row.measureLiteral === measure);
      assert.equal(rows.length, c.expected.queryWindowCount);
      assert.ok(rows.every(row => row.observation.state === state && row.observation.value === value));
    }
    assert.ok(market.descriptiveMethods.sections.M05.partitions.every(row => row.subtotal === null && row.complete === false),
      'Complete request windows alone cannot establish additive measurement semantics');
    const queryWindows = requestedWindows.get(c.id)!;
    assert.deepEqual(queryWindows.slice(1), fixture.expectedQueryWindows.map(window => window.join('~')),
      'The first detail is discovery; subsequent details must preserve every literal annual query window');
    const native = insight.nativeReview;
    assert.deepEqual(native.nativeSource.selected, c.nativeListing);
    assert.deepEqual(native.nativeSource.sourcePackage, sources.get(c.id)!.identity);
    assert.equal(native.output.input.records.length, c.expected.rawReviewRows);
    assert.equal(native.output.input.records.filter(row => row.disposition === 'INCLUDED').length, c.expected.readableReviewRows);
    assert.deepEqual(native.output.input.i04.map(row => [row.span.quote, row.eventKind, row.provenance.basis]),
      [[c.expected.i04Quote, c.expected.i04EventKind, 'DECLARED']]);
    assert.equal(native.output.sections.I04.locatedRecordCount, c.expected.i04LocatedRecords);
    assert.ok(native.projection.pending.some(row => row.reason === 'QUOTED_TEXT_SCOPE'));
    // The service, not presentation or a model, owns this eligible claim set.
    assert.equal('sourceClaims' in market, false, 'Renderer-authored claims never enter authoritative semantic storage');
    assert.equal(marketClaims.runId, c.runId);
    assert.equal(insightClaims.runId, c.runId);
    assert.equal(marketClaims.workspaceId, workspaceId);
    assert.equal(marketClaims.claims.length, c.expected.m05ObservationCount);
    for (const claim of marketClaims.claims) {
      assert.equal(claim.sectionId, 'M05');
      assert.equal(claim.observation.basis, 'SOURCE_OBSERVED');
      assert.equal(claim.observation.precision, 'non_exact');
      assert.equal(claim.declaration, null);
      assert.equal(claim.method.methodOutputId, market.descriptiveMethods.methodOutputId);
      assert.equal(claim.observation.scope.scopeSha256, marketClaims.scopeSha256);
      assert.ok(claim.observation.period);
      assert.ok(fixture.expectedQueryWindows.some(([start, end]) => claim.observation.period!.start === start && claim.observation.period!.end === end));
      const index = Number(claim.method.outputPointer.split('/').at(-1));
      const row = observations[index]!;
      assert.equal(claim.observation.measure!.literal, row.measureLiteral);
      assert.equal(claim.observation.measure!.entityLabel, c.marketProductName);
      assert.equal(claim.source.sha256, row.source.sourceSha256);
      assert.equal(claim.source.locator, row.source.locator);
      assert.equal(claim.observation.unit, row.measureLiteral === 'revenue' ? 'VND' : 'đơn vị bán theo nguồn');
      const expected = row.measureLiteral === 'revenue' ? [c.expected.revenueState, c.expected.revenue] : [c.expected.unitsState, c.expected.units];
      assert.deepEqual([claim.observation.state, claim.observation.value], expected);
    }
    const actions = insightClaims.claims.filter(claim => claim.sectionId === 'I04');
    assert.equal(actions.length, 1, 'Quoted/pending source text cannot become an eligible action claim');
    assert.equal(actions[0]!.observation.basis, 'DECLARED');
    assert.equal(actions[0]!.declaration!.provenance.basis, 'DECLARED');
    assert.equal(actions[0]!.observation.value, null);
    assert.equal(actions[0]!.observation.period, null, 'Requested annual windows are not declared review dates');
    assert.equal(actions[0]!.observation.coverage.unit, 'LOCATED_RECORDS');
    assert.equal(actions[0]!.source.spans[0]!.quote, c.expected.i04Quote);
    assert.equal(actions[0]!.method.methodOutputId, native.output.methodOutputId);
    assert.equal(actions[0]!.source.sha256, native.output.input.records[0]!.sourceSha256);
    assert.equal(actions[0]!.source.locator, native.output.input.records[0]!.locator);
    assert.equal(ready.usage.entries.filter(row => row.provider === 'apify-shopee').length, 0);
    for (const kind of ['MARKET', 'INSIGHT'] as const) {
      const report = await service.readReport(workspaceId, c.runId, kind);
      const dom = new JSDOM(report.bytes.toString());
      try {
        const section = dom.window.document.getElementById(kind === 'MARKET' ? c.expected.marketCheckpointSection : c.expected.insightCheckpointSection)!;
        assert.ok(section);
        if (kind === 'INSIGHT') assert.equal(section.querySelector('tbody q')?.textContent, c.expected.i04Quote);
        // The retained report must expose, not merely store, the admitted evidence.
        // Own this at the production report boundary; an omitted renderer input
        // or an empty presentation helper otherwise passes the storage assertions.
        const evidenceSection = dom.window.document.getElementById(kind === 'MARKET' ? 'M01' : 'I14')!;
        assert.ok(evidenceSection);
        assert.match(evidenceSection.querySelector('.state')!.textContent!, /Chưa có kết luận/);
        if (kind === 'MARKET') {
          const rows = [...evidenceSection.querySelectorAll('tbody tr')];
          assert.equal(rows.length, c.expected.m05ObservationCount, 'Every inventory item remains readable');
          assert.ok(rows.some(row => row.querySelectorAll('td')[1]!.textContent!.includes(`${c.expected.revenue} VND`)));
          assert.ok(rows.some(row => row.querySelectorAll('td')[1]!.textContent!.includes(`${c.expected.units} đơn vị bán theo nguồn`)));
          if (c.expected.revenueState === 'observed_zero' || c.expected.unitsState === 'observed_zero')
            assert.ok(rows.some(row => row.querySelectorAll('td')[1]!.textContent!.includes('Nguồn ghi nhận bằng 0')));
          for (const claim of marketClaims.claims) {
            const trace = evidenceSection.querySelector(`#claim-${claim.claimId}`)!;
            assert.ok(trace);
            assert.ok(trace.textContent!.includes(claim.source.locator));
            assert.ok(trace.textContent!.includes(claim.source.sha256));
          }
        } else {
          assert.match(evidenceSection.textContent!, /Chưa đủ bằng chứng về bối cảnh sử dụng/);
          assert.equal(evidenceSection.querySelectorAll('.evidence-entry').length, 0);
          assert.equal(evidenceSection.querySelector('tbody q')!.textContent, c.expected.i04Quote);
          assert.match(evidenceSection.querySelector('tbody tr')!.textContent!, /chưa nêu bối cảnh sử dụng/);
          const trace = evidenceSection.querySelector(`#claim-${actions[0]!.claimId}`)!;
          assert.equal(trace.querySelector('q')!.textContent, c.expected.i04Quote);
          assert.ok(trace.textContent!.includes(actions[0]!.source.locator));
        }
        assert.ok(!dom.window.document.querySelector('script, iframe, [onerror]'));
        for (const other of fixture.cases.filter(row => row.id !== c.id))
          assert.ok(!section.textContent?.includes(other.expected.i04Quote), 'Another industry quote must not contaminate this report');
        const html = report.bytes.toString();
        const visible = reportVisibleText(dom.window.document);
        assert.deepEqual(visibleTextViolations(visible), [], `${kind}: reader text keeps provider names, digests and status codes out`);
        assert.deepEqual(providerNameViolations(html), [], `${kind}: no disclosure may name the provider`);
        assert.deepEqual(citationRegisterViolations(dom.window.document), [], `${kind}: one register holds exactly the cited sources`);
      } finally { dom.window.close(); }
      retainedReads.push({ runId: c.runId, kind, bytes: report.bytes,
        claimsSha256: (kind === 'MARKET' ? market : insight).sourceClaimsArtifact.sha256,
        ...(kind === 'MARKET' ? { m01Sha256: market.m01InventoryArtifact.sha256 } : { i14Sha256: insight.i14AdmissionArtifact.sha256 }) });
    }
  });

  const before = { changes: db.prepare('SELECT total_changes() n').get(), calls };
  db.pragma('query_only = ON');
  const historical = new ResearchAutomationService({ db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now: () => { throw new Error('Historical reads cannot use a current clock'); } });
  for (const saved of retainedReads)
    assert.deepEqual((await historical.readReport(workspaceId, saved.runId, saved.kind)).bytes, saved.bytes);
  // Claims, M01 and I14 are independently retained dependencies. No write or source
  // recollection may repair a missing/corrupt dependency during a report read.
  const dependencyReads = retainedReads.slice(0, 2).flatMap(saved =>
    [saved.claimsSha256, ...(saved.m01Sha256 ? [saved.m01Sha256] : []), ...(saved.i14Sha256 ? [saved.i14Sha256] : [])].map(sha256 => ({ ...saved, sha256 })));
  for (const saved of dependencyReads) {
    const claimPath = artifacts.pathForDigest(saved.sha256);
    const recoveryPath = `${claimPath}.test-recovery`;
    await fs.rename(claimPath, recoveryPath);
    try {
      await assert.rejects(historical.readReport(workspaceId, saved.runId, saved.kind));
    } finally { await fs.rename(recoveryPath, claimPath); }
    const original = await artifacts.read(saved.sha256);
    const corrupt = Buffer.from(original);
    corrupt[0] = corrupt[0] === 123 ? 91 : 123;
    try {
      await fs.writeFile(claimPath, corrupt);
      await assert.rejects(historical.readReport(workspaceId, saved.runId, saved.kind));
    } finally { await fs.writeFile(claimPath, original); }
    assert.deepEqual((await historical.readReport(workspaceId, saved.runId, saved.kind)).bytes, saved.bytes);
  }
  assert.deepEqual(db.prepare('SELECT total_changes() n').get(), before.changes);
  assert.equal(calls, before.calls);
});
