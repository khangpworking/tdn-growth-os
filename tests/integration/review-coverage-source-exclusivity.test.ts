import assert from 'node:assert/strict';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import test, { type TestContext } from 'node:test';
import { reviewPolicyFixture } from '../helpers/review-policy-fixture.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';

async function fixture(t: TestContext, mismatchedCollector = false) {
  const f = await reviewPolicyFixture(t, [30]);
  const now = () => new Date('2026-10-09T00:00:00.000Z');
  const discovery = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, now, uuid: () => f.input.start.workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'source-exclusivity', title: 'Synthetic source exclusivity' });
  const pdf = Buffer.from('%PDF-1.7\nSynthetic source-exclusivity fixture.');
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), now, uuid: () => f.input.runId,
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(f.root, 'artifacts')),
    reviewCollection: { policy: f.policy, factory: () => {
      const attempt = f.factory();
      if (mismatchedCollector) attempt.collector.options.maxReviewsPerProduct = 500;
      return attempt;
    } },
    renderer: (input, kind) => {
      const built = buildResearchAutomationReport(input, kind);
      // The optional PDF adapter cannot promote a source-free report to v27.
      return { ...built, semantic: { ...built.semantic, rendererVersion: 'automation-report-kit-v27' }, pdf };
    } });
  const { workspaceId } = f.input.start, runId = f.input.runId;
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'CATEGORY', keyword: 'Synthetic source exclusivity', reports: ['INSIGHT'],
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' } });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    definition: 'Explicit synthetic exact listings; no revenue coverage', selectedProductIds: [], peerProductIds: [],
    includeTerms: [], excludeTerms: [], exactShopeeUrls: [...f.input.scope.exactShopeeUrls!] };
  return { ...f, service, workspaceId, runId, confirm, pdf };
}

async function output(f: Awaited<ReturnType<typeof fixture>>, pairId?: string) {
  const report = await f.service.readReport(f.workspaceId, f.runId, 'INSIGHT', false, pairId);
  return { report, semantic: JSON.parse((await f.artifacts.read(report.versionId)).toString()) };
}

test('policy-marked empty selection publishes readable private22 fallback and matching PDF without dispatch', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(f.workspaceId, f.runId, { ...f.confirm, exactShopeeUrls: [] });
  await f.service.processNext(); await f.service.processNext();
  const result = await output(f);
  assert.equal((await f.service.getRun(f.workspaceId, f.runId)).status, 'DRAFT_READY');
  assert.equal(result.semantic.rendererVersion, 'automation-report-kit-v22');
  assert.equal(result.semantic.privateReviewCorpus, undefined); assert.equal(result.semantic.reviewSample, undefined);
  assert.deepEqual((await f.service.readReport(f.workspaceId, f.runId, 'INSIGHT', true)).bytes, f.pdf);
  assert.equal(f.calls.length, 0);
});

test('authentic sample and KEEP remain27; SKIP drops source/sample and cold retry reads private22 fallback', async t => {
  const f = await fixture(t);
  await f.service.confirmScope(f.workspaceId, f.runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  const first = (await f.service.listReportVersions(f.workspaceId, f.runId))[0]!, original = await output(f, first.pairId);
  assert.equal(original.semantic.rendererVersion, 'automation-report-kit-v27');
  assert.equal(original.semantic.reviewSample.products[0].retainedReviews, 30);
  const keep = { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(), previousPairId: first.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } };
  await f.service.requestReportRevision(f.workspaceId, f.runId, keep); await f.service.processNext();
  const kept = (await f.service.listReportVersions(f.workspaceId, f.runId)).at(-1)!, retained = await output(f, kept.pairId);
  assert.equal(retained.semantic.rendererVersion, 'automation-report-kit-v27');
  assert.deepEqual(retained.semantic.reviewSample, original.semantic.reviewSample);
  const skip = { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId: kept.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'SKIP' } } };
  await f.service.requestReportRevision(f.workspaceId, f.runId, skip); await f.service.processNext();
  const skipped = (await f.service.listReportVersions(f.workspaceId, f.runId)).at(-1)!, fallback = await output(f, skipped.pairId);
  assert.equal(fallback.semantic.rendererVersion, 'automation-report-kit-v22');
  assert.equal(fallback.semantic.privateReviewCorpus, undefined); assert.equal(fallback.semantic.reviewSample, undefined);
  assert.equal(f.calls.filter(call => call.startsWith('POST')).length, 1);
  const calls = f.calls.length, changes = f.db.prepare('SELECT total_changes() n').get();
  f.artifacts.put = async () => { throw new Error('No CAS.put'); }; f.db.pragma('query_only=ON');
  const reader = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: { readVerifiedWorkspace: async () => { throw new Error('No current workspace'); } }, now: () => { throw new Error('No clock'); } });
  try {
    assert.equal((await reader.requestReportRevision(f.workspaceId, f.runId, keep)).exactRetry, true);
    assert.equal((await reader.requestReportRevision(f.workspaceId, f.runId, skip)).exactRetry, true);
    for (const [pair, saved] of [[first, original], [kept, retained], [skipped, fallback]] as const) {
      assert.deepEqual((await reader.readReport(f.workspaceId, f.runId, 'INSIGHT', false, pair.pairId)).bytes, saved.report.bytes);
      assert.deepEqual((await reader.readReport(f.workspaceId, f.runId, 'INSIGHT', true, pair.pairId)).bytes, f.pdf);
    }
    assert.deepEqual(f.db.prepare('SELECT total_changes() n').get(), changes); assert.equal(f.calls.length, calls);
  } finally { f.db.pragma('query_only=OFF'); }
});

test('configured collector mismatch keeps unavailable private22 report and cannot fabricate a sample or dispatch', async t => {
  const f = await fixture(t, true);
  await f.service.confirmScope(f.workspaceId, f.runId, f.confirm); await f.service.processNext(); await f.service.processNext();
  const result = await output(f);
  assert.equal(result.semantic.rendererVersion, 'automation-report-kit-v22');
  assert.equal(result.semantic.privateReviewCorpus, undefined); assert.equal(result.semantic.reviewSample, undefined);
  assert.equal((await f.service.readSourceActivity(f.workspaceId))['apify-shopee'].dataCount, 0);
  assert.equal(f.calls.length, 0);
});
