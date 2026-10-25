import assert from 'node:assert/strict';
import crypto, { randomUUID } from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import test, { type TestContext } from 'node:test';
import type { AutomationInsightCodingAcceptedSnapshot } from '../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { locatedInsightFixture } from '../helpers/located-insight-fixture.js';
import type { InsightSourceBinding } from '../../contracts/analysis/automation-insight-coding.generated.js';
import type { AutomationInsightReportRevisionRequest } from '../../contracts/analysis/automation-insight-report-revision.generated.js';
import { projectPublicInsightSource } from '../../src/modules/analysis/research-automation/public-insight-source.js';
import { tiktokShopChannelDecision, type AutomationTikTokShopReviews } from '../../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import { codingApi, publicCodingFixture, sha, workspaceId, runId } from '../helpers/public-insight-coding-fixture.js';
import { PRIVATE_FIELDS, REVIEW_TEXTS } from '../unit/tiktok-shop-reviews.fixtures.js';
import { RAW_SENTINELS } from '../fixtures/shopee-public-results.js';

const modelRequest = (binding: InsightSourceBinding) => ({ contractVersion: 'insight-default-model-request-v1', requestKey: randomUUID(),
  binding, defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: [0] });
const receiptRequest = (proposal: { evidenceId: string; sha256: string }) => ({ contractVersion: 'insight-coding-accept-v1', requestKey: randomUUID(),
  proposalId: proposal.evidenceId, proposalSha256: proposal.sha256,
  selection: { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [], i05: [0], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] } });
const defaultRevisionRequest = (pairId: string, proposal: { evidenceId: string; sha256: string }) => ({
  contractVersion: 'automation-insight-default-report-revision-v1' as const, requestKey: randomUUID(), previousPairId: pairId,
  sources: { metric: { decision: 'KEEP' as const }, nativeReview: { decision: 'KEEP' as const } },
  defaultInsight: { contractVersion: 'insight-default-draft-select-v1' as const, proposalId: proposal.evidenceId, proposalSha256: proposal.sha256 },
});
const successfulView = async (api: Awaited<ReturnType<typeof codingApi>>, pairId?: string) => {
  const result = await api.get(pairId); assert.equal(result.status, 200, JSON.stringify(result.body)); return result.body;
};
const noSource = (result: { status: number; body: any }) => {
  assert.equal(result.status, 409); assert.equal(result.body.error.code, 'invalid_state');
  assert.equal(result.body.error.message, 'Research state changed; refresh before submitting');
};

const cases: { row: number; name: string; run: (t: TestContext) => Promise<void> }[] = [
  { row: 1, name: 'public Shopee GET binds verbatim records and all corpus dispositions', async run(t) {
    const f = await publicCodingFixture(t), api = await codingApi(t, f), view = await successfulView(api);
    const { binding, input } = view.context;
    assert.equal(binding.sourceKind, 'PUBLIC_REVIEWS'); assert.equal(binding.inputSha256, sha(input));
    assert.deepEqual(input.records.map((record: any) => [record.text, record.locator, record.disposition, record.dispositionReason]), [
      ['Synthetic lid fits.', '/0/comment', 'INCLUDED', null],
      [null, '/1', 'UNREADABLE', 'SOURCE_TEXT_UNREADABLE'],
      ['', '/2/comment', 'EXCLUDED', 'ATTRIBUTES_ONLY'],
      ['', '/3/comment', 'EXCLUDED', 'QUARANTINED'],
      ['Synthetic first version.', '/4/comment', 'EXCLUDED', 'UNRESOLVED_CONFLICT'],
      ['Synthetic row without identity.', '/6/comment', 'EXCLUDED', 'QUARANTINED'],
    ]);
    assert.ok(input.records.every((record: any) => record.sourceSha256 === input.sources[0].sha256 && record.timeText === null && record.sourceAttribution === 'SHOPEE_SOURCE_REPORTED_REVIEW'));
    const context = await f.context(); assert.equal(context.verifiedPlatform, 'SHOPEE');
    assert.deepEqual(context.publicSource!.records.map(row => row.rating), [4, 5, 5, 5, null, 5]);
  } },
  { row: 2, name: 'S06-only GET has no verified platform and preserves S06 mapping', async run(t) {
    const f = await publicCodingFixture(t, { source: 'NONE', s06: true }), api = await codingApi(t, f), view = await successfulView(api);
    assert.equal(view.context.binding.sourceKind, 'PUBLIC_REVIEWS');
    assert.deepEqual(view.context.input.records.map((row: any) => row.text), [...REVIEW_TEXTS, null]);
    const context = await f.context(); assert.equal('verifiedPlatform' in context, false);
    assert.equal(context.publicSource!.shopeePublic, null);
    assert.ok(context.publicSource!.records.every(row => row.platform === 'TIKTOK_SHOP' && row.productKey === 'tiktok-shop:12345' && row.rating === null));
    const pointer = f.collectedInputs[0]!.collection!.tiktokShopReviews!;
    const document = JSON.parse((await f.artifacts.read(pointer.documentSha256!)).toString()) as AutomationTikTokShopReviews;
    // A pure mapping table also covers duplicate/conflicting ids, blanks and product-local identity.
    document.products[0]!.reviews.push({ id: '905', text: '  ', dateRaw: ' ', sku: null },
      { ...document.products[0]!.reviews[0]! }, { ...document.products[0]!.reviews[0]!, text: 'Synthetic conflicting text.' });
    document.products[0]!.reviewCount = document.products[0]!.reviews.length;
    document.products.push({ ...structuredClone(document.products[0]!), productId: '67890', reviews: [document.products[0]!.reviews[0]!], reviewCount: 1 });
    const mapped = projectPublicInsightSource({ tiktokShop: { document, documentSha256: sha(document) } });
    assert.deepEqual(mapped.input.records.map(row => [row.disposition, row.dispositionReason, row.timeText]), [
      ['INCLUDED', null, '1789741801752'], ['INCLUDED', null, null], ['INCLUDED', null, null],
      ['UNREADABLE', 'SOURCE_TEXT_UNREADABLE', null], ['EXCLUDED', 'SOURCE_TEXT_EMPTY', null],
      ['EXCLUDED', 'DUPLICATE_SOURCE_NATIVE_RECORD', '1789741801752'],
      ['EXCLUDED', 'CONFLICTING_SOURCE_NATIVE_RECORD', '1789741801752'], ['INCLUDED', null, '1789741801752'],
    ]);
    assert.deepEqual(mapped.input.records.map(row => row.locator), [0, 1, 2, 3, 4, 5, 6].map(i => `/products/0/reviews/${i}/text`).concat('/products/1/reviews/0/text'));
  } },
  { row: 3, name: 'mixed sources preserve Shopee-first order and parallel platform/product metadata', async run(t) {
    const f = await publicCodingFixture(t, { s06: true }), api = await codingApi(t, f), view = await successfulView(api), context = await f.context();
    assert.deepEqual(context.publicSource!.records.map(row => [row.recordIndex, row.platform, row.productKey]), [
      ...Array.from({ length: 6 }, (_, i) => [i, 'SHOPEE', 'shopee:91001:92001']),
      ...Array.from({ length: 4 }, (_, i) => [i + 6, 'TIKTOK_SHOP', 'tiktok-shop:12345']),
    ]);
    assert.deepEqual(view.context.input.records.map((row: any) => row.sourceAttribution), [
      ...Array(6).fill('SHOPEE_SOURCE_REPORTED_REVIEW'), ...Array(4).fill('TIKTOK_SHOP_SOURCE_REPORTED_REVIEW'),
    ]);
    assert.equal('verifiedPlatform' in context, false);
  } },
  { row: 4, name: 'repeated reads have identical binding/input bytes and a canonical projection digest', async run(t) {
    const f = await publicCodingFixture(t, { s06: true }), api = await codingApi(t, f);
    const first = await successfulView(api), second = await successfulView(api);
    assert.equal(JSON.stringify(first.context), JSON.stringify(second.context));
    const context = await f.context(); assert.ok(context.publicSource);
    assert.equal(first.context.binding.sourcePackageSha256, sha(context.publicSource));
    assert.equal(first.context.binding.inputSha256, sha(first.context.input));
  } },
  { row: 5, name: 'default HTTP proposal reverifies and rejects receipts equally on NATIVE and PUBLIC_REVIEWS', async run(t) {
    for (const source of ['NATIVE', 'PUBLIC'] as const) {
      const f = await publicCodingFixture(t, { source }), api = await codingApi(t, f), view = await successfulView(api);
      assert.equal(view.context.binding.sourceKind, source === 'NATIVE' ? 'NATIVE' : 'PUBLIC_REVIEWS');
      const response = await api.post('insight-coding-default-model-proposals', modelRequest(view.context.binding));
      assert.equal(response.status, 201, JSON.stringify(response.body)); assert.equal(response.body.status, 'PROPOSED');
      const fresh = await successfulView(api), proposal = fresh.evidence.find((row: any) => row.evidenceId === response.body.proposal.evidenceId);
      assert.equal(proposal.request.contractVersion, 'insight-coding-default-propose-v1');
      assert.deepEqual(fresh.context.binding, view.context.binding);
      assert.deepEqual(proposal.binding, view.context.binding); assert.equal(api.modelCalls(), 1);
      const receipt = await api.post('insight-coding-receipts', receiptRequest(proposal));
      assert.equal(receipt.status, 400, JSON.stringify(receipt.body));
      assert.equal(receipt.body.error.code, 'bad_request');
      const after = await successfulView(api);
      assert.deepEqual(after.context.binding, view.context.binding);
      assert.deepEqual(after.evidence, fresh.evidence);
    }
  } },
  { row: 6, name: 'v2 default request on PUBLIC_REVIEWS is rejected before model dispatch', async run(t) {
    const f = await publicCodingFixture(t), api = await codingApi(t, f), view = await successfulView(api);
    const result = await api.post('insight-coding-default-model-proposals', { ...modelRequest(view.context.binding), contractVersion: 'insight-default-model-request-v2' });
    assert.equal(result.status, 400); assert.equal(api.modelCalls(), 0);
  } },
  { row: 7, name: 'newer pair blocks first proposal publication on an old binding', async run(t) {
    const f = await publicCodingFixture(t), api = await codingApi(t, f), view = await successfulView(api);
    await f.revise();
    const result = await api.post('insight-coding-default-model-proposals', modelRequest(view.context.binding));
    assert.equal(result.status, 409); assert.equal(result.body.error.code, 'revision_conflict'); assert.equal(api.modelCalls(), 0);
  } },
  { row: 9, name: 'mixed projection removes writer identity and HTTP view omits server metadata', async run(t) {
    const f = await publicCodingFixture(t, { s06: true }), api = await codingApi(t, f), view = await successfulView(api), context = await f.context();
    assert.ok(context.publicSource);
    assert.equal(context.publicSource.records.length, 10, 'privacy covers both retained sources');
    for (const row of context.publicSource.records) {
      assert.deepEqual(Object.keys(row).sort(), ['platform', 'productKey', 'rating', 'recordIndex', 'writerKey']);
      assert.equal(row.writerKey, null);
    }
    assert.deepEqual(Object.keys(view.context).sort(), ['binding', 'input']);
    assert.equal('publicSource' in view, false);
    for (const sentinel of [...Object.values(PRIVATE_FIELDS), ...RAW_SENTINELS]) {
      assert.equal(JSON.stringify(context.publicSource).includes(sentinel), false);
      assert.equal(JSON.stringify(view).includes(sentinel), false);
    }
  } },
  { row: 10, name: 'paid NATIVE and EXACT_SHOPEE bindings retain their main-branch digests', async run(t) {
    // The Foundation owners use the system clock/UUID outside the service's injected identities.
    const RealDate = Date;
    class FixedDate extends RealDate {
      constructor(value?: string | number) { super(value ?? '2026-02-01T00:00:00.000Z'); }
      static override now() { return RealDate.parse('2026-02-01T00:00:00.000Z'); }
    }
    globalThis.Date = FixedDate as DateConstructor;
    let serial = 0;
    const uuid = t.mock.method(crypto, 'randomUUID', () => `bbbbbbbb-0000-4000-8000-${String(++serial).padStart(12, '0')}`);
    syncBuiltinESMExports();
    t.after(() => { globalThis.Date = RealDate; uuid.mock.restore(); syncBuiltinESMExports(); });
    // Frozen from this deterministic fixture against origin/main; see tests-report.md.
    const expected = { NATIVE: '50f5a67398298cc45610b146247f167cd1a48b04d1aad95b5b9fdc541f4a04db',
      EXACT: '909bfdbe5a0d233167c5aa2224487c17c747bfe2efc5232157817a912a81cd60' };
    const actual: Record<string, string> = {};
    for (const source of ['NATIVE', 'EXACT'] as const) {
      const f = await publicCodingFixture(t, { source, s06: true }), api = await codingApi(t, f), view = await successfulView(api);
      assert.equal(view.context.binding.sourceKind, source === 'NATIVE' ? 'NATIVE' : 'EXACT_SHOPEE');
      actual[source] = sha(view.context.binding);
      assert.equal(view.context.input.records.length, 1, 'S06 is not appended to paid paths');
    }
    assert.deepEqual(actual, expected);
  } },
  { row: 11, name: 'no adopted or free records preserves the old invalid_state response', async run(t) {
    const f = await publicCodingFixture(t, { source: 'NONE' }), api = await codingApi(t, f); noSource(await api.get());
    await assert.rejects(f.context(), { code: 'invalid_state', message: 'This exact report has no verified adopted review source.' });
  } },
  { row: 12, name: 'S06 coding remains available below half of Metric revenue', async run(t) {
    const f = await publicCodingFixture(t, { source: 'NONE', s06: true, lowShare: true });
    const metric = f.collectedInputs.find(input => input.metricMethods)!.metricMethods!;
    const decision = tiktokShopChannelDecision(metric);
    assert.equal(decision.decision, 'CHANNEL_NOT_MAIN');
    assert.ok('share' in decision && decision.share > 0 && decision.share < 0.5);
    const api = await codingApi(t, f), view = await successfulView(api);
    assert.equal(view.context.binding.sourceKind, 'PUBLIC_REVIEWS'); assert.equal(view.context.input.records.length, 4);
  } },
  { row: 13, name: 'report rejects every PUBLIC_REVIEWS snapshot with or without native source input', async run(t: TestContext) {
    const f = await publicCodingFixture(t, { source: 'NATIVE' });
    const input = f.collectedInputs.find(input => input.nativeReview)!;
    const snapshot: AutomationInsightCodingAcceptedSnapshot = { contractVersion: 'automation-insight-coding-snapshot-v1',
      binding: { workspaceId: input.run.workspaceId, runId: input.run.runId, pairId: '1'.repeat(64), scopeSha256: '2'.repeat(64), reportSha256: '3'.repeat(64),
        sourceKind: 'PUBLIC_REVIEWS', sourcePackageSha256: '4'.repeat(64), inputSha256: '5'.repeat(64) },
      selection: { proposalId: '33333333-3333-4333-8333-333333333333', receiptIds: ['55555555-5555-4555-8555-555555555555'] },
      receipts: [{ receiptId: '55555555-5555-4555-8555-555555555555', sha256: '7'.repeat(64) }],
      adoptionId: '44444444-4444-4444-8444-444444444444', proposalSha256: '6'.repeat(64), output: buildLocatedInsightMethods(locatedInsightFixture()).output };
    // This direct builder input covers defence in depth; row 18 covers verified selection and persistence.
    assert.ok(input.nativeReview);
    const { nativeReview, nativeReviewFallback, ...withoutNative } = input;
    for (const reportInput of [input, withoutNative]) {
      assert.throws(() => buildResearchAutomationReport({ ...reportInput, insightCoding: snapshot }, 'INSIGHT'), {
        message: 'Public review coding is not yet supported in reports',
      });
    }
  } },
  { row: 14, name: 'KEEP revision preserves the public corpus and receipt-free default proposal lifecycle', async run(t) {
    const f = await publicCodingFixture(t, { s06: true }), base = await f.context(), next = await f.revise(), api = await codingApi(t, f);
    const view = await successfulView(api, next.pairId), context = await f.context(next.pairId);
    assert.equal(view.context.binding.sourceKind, 'PUBLIC_REVIEWS');
    assert.equal(base.input.records.length, 10, 'the base contains both Shopee and S06');
    assert.deepEqual(context.input.records, base.input.records); assert.deepEqual(context.publicSource, base.publicSource);
    assert.equal(context.binding.sourcePackageSha256, base.binding.sourcePackageSha256);
    assert.notEqual(context.binding.pairId, base.binding.pairId);
    const proposed = await api.post('insight-coding-default-model-proposals', modelRequest(view.context.binding));
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    const fresh = await successfulView(api, next.pairId);
    const proposal = fresh.evidence.find((row: any) => row.evidenceId === proposed.body.proposal.evidenceId);
    assert.equal(proposal.request.contractVersion, 'insight-coding-default-propose-v1');
    assert.deepEqual(fresh.context.binding, view.context.binding);
    assert.deepEqual(proposal.binding, view.context.binding);
    const receipt = await api.post('insight-coding-receipts', receiptRequest(proposal));
    assert.equal(receipt.status, 400, JSON.stringify(receipt.body));
    assert.equal(receipt.body.error.code, 'bad_request');
    const after = await successfulView(api, next.pairId);
    assert.deepEqual(after.context.binding, view.context.binding);
    assert.deepEqual(after.evidence, fresh.evidence);
  } },
  { row: 15, name: 'SKIP revision drops Shopee, leaving S06 or the old no-source conflict', async run(t) {
    for (const s06 of [true, false]) {
      const f = await publicCodingFixture(t, { s06 }), next = await f.revise('SKIP'), api = await codingApi(t, f);
      if (!s06) { noSource(await api.get(next.pairId)); continue; }
      const view = await successfulView(api, next.pairId), context = await f.context(next.pairId);
      assert.equal(context.publicSource!.shopeePublic, null); assert.equal(view.context.input.records.length, 4);
      assert.ok(context.publicSource!.records.every(row => row.platform === 'TIKTOK_SHOP'));
    }
  } },
  { row: 16, name: 'two consecutive KEEP revisions carry the verified public corpus', async run(t) {
    const f = await publicCodingFixture(t), base = await f.context(), first = await f.revise(), second = await f.revise('KEEP', first.pairId);
    const api = await codingApi(t, f), view = await successfulView(api, second.pairId), context = await f.context(second.pairId);
    assert.equal(view.context.binding.sourceKind, 'PUBLIC_REVIEWS');
    assert.deepEqual(context.input, base.input); assert.deepEqual(context.publicSource, base.publicSource);
  } },
  { row: 17, name: 'historical base stays readable but proposal continuation cannot publish after revision', async run(t) {
    const f = await publicCodingFixture(t), api = await codingApi(t, f), original = await successfulView(api);
    const proposed = await api.post('insight-coding-default-model-proposals', modelRequest(original.context.binding));
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    const before = await successfulView(api), proposal = before.evidence.find((row: any) => row.evidenceId === proposed.body.proposal.evidenceId);
    await f.revise();
    const after = await successfulView(api); assert.deepEqual(after.context, original.context);
    assert.deepEqual(after.evidence, before.evidence);
    const result = await api.post('insight-coding-default-model-proposals', { ...modelRequest(original.context.binding),
      defaultRuleId: proposal.request.defaultRuleId, defaultRuleSha256: proposal.request.defaultRuleSha256,
      previousProposalId: proposal.evidenceId, previousProposalSha256: proposal.sha256 });
    assert.equal(result.status, 409); assert.equal(result.body.error.code, 'revision_conflict'); assert.equal(api.modelCalls(), 1);
    assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  } },
  { row: 18, name: 'PUBLIC_REVIEWS default, draft and accepted report revisions reject before any commit, including retry', async run(t) {
    const f = await publicCodingFixture(t, { s06: true }), api = await codingApi(t, f), view = await successfulView(api);
    assert.equal(view.context.binding.sourceKind, 'PUBLIC_REVIEWS');
    const proposed = await api.post('insight-coding-default-model-proposals', modelRequest(view.context.binding));
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    const fresh = await successfulView(api);
    const proposal = fresh.evidence.find((row: any) => row.evidenceId === proposed.body.proposal.evidenceId);
    assert.ok(proposal);

    const rejectedWithoutWrites = async (request: AutomationInsightReportRevisionRequest) => {
      const versions = await f.service.listReportVersions(workspaceId, runId);
      const attempts = f.db.prepare('SELECT * FROM analysis_research_automation_attempts WHERE run_id=?').all(runId);
      for (let retry = 0; retry < 2; retry++) {
        // HTTP intentionally masks conflict messages; the owning service preserves the precise reason.
        noSource(await api.post('report-revisions', request));
        await assert.rejects(f.service.requestReportRevision(workspaceId, runId, request), {
          code: 'invalid_state', message: 'Public review coding is not yet supported in reports.',
        });
        assert.deepEqual(f.db.prepare('SELECT * FROM analysis_research_automation_attempts WHERE run_id=?').all(runId), attempts);
        assert.deepEqual(await f.service.listReportVersions(workspaceId, runId), versions);
        assert.equal(f.db.prepare('SELECT 1 FROM analysis_research_automation_attempt_requests WHERE request_key=?').get(request.requestKey), undefined);
      }
    };
    await rejectedWithoutWrites(defaultRevisionRequest(f.pair.pairId, proposal));

    // Legacy selections need a real owner-adopted proposal and receipt; default proposals cannot be accepted.
    const adopted = await api.post('insight-coding-adoptions', { contractVersion: 'insight-coding-adopt-v1', requestKey: randomUUID(),
      binding: view.context.binding, rules: { ruleId: 'synthetic-public-rules-v1', revision: 1, question: 'Which opinions are stated?',
        inclusionRule: 'Included synthetic records', adjudicationRule: 'Leave disagreements pending', corpora: [] } });
    assert.equal(adopted.status, 201, JSON.stringify(adopted.body));
    const authored = await api.post('insight-coding-proposals', { contractVersion: 'insight-coding-propose-v1', requestKey: randomUUID(),
      adoptionId: adopted.body.evidenceId, previousProposalId: null, annotations: proposal.request.annotations });
    assert.equal(authored.status, 201, JSON.stringify(authored.body));
    const authoredView = await successfulView(api);
    const authoredProposal = authoredView.evidence.find((row: any) => row.evidenceId === authored.body.evidenceId);
    assert.ok(authoredProposal);
    const common = { contractVersion: 'automation-insight-report-revision-v1' as const, previousPairId: f.pair.pairId,
      sources: { metric: { decision: 'KEEP' as const }, nativeReview: { decision: 'KEEP' as const } } };
    for (const contractVersion of ['insight-draft-select-v1', 'insight-draft-select-v2'] as const) {
      await rejectedWithoutWrites({ ...common, requestKey: randomUUID(), draftInsight: { contractVersion, proposalId: authoredProposal.evidenceId } });
    }
    const accepted = await api.post('insight-coding-receipts', receiptRequest(authoredProposal));
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    await rejectedWithoutWrites({ ...common, requestKey: randomUUID(),
      acceptedInsight: { proposalId: authoredProposal.evidenceId, receiptIds: [accepted.body.evidenceId] } });
    assert.equal(api.modelCalls(), 1);
  } },
  { row: 19, name: 'NATIVE default report revision commits and replays the main-branch draft contract', async run(t) {
    const f = await publicCodingFixture(t, { source: 'NATIVE' }), api = await codingApi(t, f), view = await successfulView(api);
    assert.equal(view.context.binding.sourceKind, 'NATIVE');
    const original = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId);
    const proposed = await api.post('insight-coding-default-model-proposals', modelRequest(view.context.binding));
    assert.equal(proposed.status, 201, JSON.stringify(proposed.body));
    const fresh = await successfulView(api);
    const proposal = fresh.evidence.find((row: any) => row.evidenceId === proposed.body.proposal.evidenceId);
    assert.ok(proposal);
    const request = defaultRevisionRequest(f.pair.pairId, proposal);
    const revision = await api.post('report-revisions', request);
    assert.equal(revision.status, 202, JSON.stringify(revision.body));
    let attempt = await f.service.getReportRevision(workspaceId, runId, revision.body.attemptId);
    for (let i = 0; i < 200 && attempt.state !== 'COMMITTED'; i++) {
      assert.notEqual(attempt.state, 'FAILED', JSON.stringify(attempt));
      await new Promise(resolve => setTimeout(resolve, 10));
      attempt = await f.service.getReportRevision(workspaceId, runId, revision.body.attemptId);
    }
    assert.equal(attempt.state, 'COMMITTED', JSON.stringify(attempt));
    const versions = await f.service.listReportVersions(workspaceId, runId);
    assert.equal(versions.length, 2);
    const next = versions[1]!;
    assert.equal(next.attemptId, revision.body.attemptId);
    const report = await f.service.readReport(workspaceId, runId, 'INSIGHT', false, next.pairId);
    const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
    // Pinned to the paid-source default contract on origin/main (c9bbbb95), not the new free-source policy.
    assert.equal(semantic.rendererVersion, 'automation-report-kit-v21');
    assert.equal(semantic.insightCoding.contractVersion, 'automation-insight-coding-snapshot-v4');
    assert.equal(semantic.insightCoding.binding.sourceKind, 'NATIVE');
    assert.deepEqual(semantic.insightCoding.draftSelection, request.defaultInsight);
    assert.deepEqual(semantic.insightCoding.selection, { proposalId: proposal.evidenceId, receiptIds: [] });
    assert.deepEqual(semantic.insightCoding.receipts, []);
    assert.match(report.bytes.toString(), /Quy tắc và bộ mã là đề xuất/);
    assert.match(report.bytes.toString(), /đề xuất, chờ chủ duyệt/);
    const replay = await api.post('report-revisions', request);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.equal(replay.body.exactRetry, true);
    assert.equal(replay.body.attemptId, revision.body.attemptId);
    assert.deepEqual(await f.service.listReportVersions(workspaceId, runId), versions);
    assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT', false, next.pairId), report);
    assert.deepEqual(await f.service.readReport(workspaceId, runId, 'INSIGHT', false, f.pair.pairId), original);
    assert.equal(api.modelCalls(), 1);
  } },
];

for (const contract of cases) test(`PUBLIC_REVIEWS row ${contract.row}: ${contract.name}`, contract.run);
