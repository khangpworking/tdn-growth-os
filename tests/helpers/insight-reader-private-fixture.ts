import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport, type AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { ApifyShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { createShopeePrivateIntake } from '../../src/platform/collectors/shopee-private-intake.js';
import { readerWorkspaceId as workspaceId, readerRunId as runId, readerNow as now } from './insight-reader-fixture.js';
const keyId = '33333333-3333-4333-8333-333333333333';
const row = { reviewId: '101', authorId: '918273645', author: 'PRIVATE_AUTHOR_NAME', authorPortrait: 'PRIVATE_AVATAR',
  shopId: '2001', itemId: '3001', comment: 'Exact synthetic evidence.', ratingStar: 5, createdAt: '2024-01-02T00:00:00Z', region: 'VN' };
/** Reviewed private184 synthetic path, no network or runtime source. */
export async function privateReaderFixture(t: TestContext, literal = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-private-consumer-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'private-source', title: 'Synthetic private source' });
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  let input: AutomationReportInput | undefined;
  const privacy = createShopeePrivateIntake({ salt: Buffer.alloc(32, 7), keyId });
  const calls: string[] = [];
  const { authorId: _author, ratingStar: _rating, ...absent } = row;
  const rows = [row, { ...row, reviewId: '102' }, { ...absent, reviewId: '103', comment: 'Second synthetic content.' },
    { ...row, reviewId: '104', authorId: 0, comment: 'Third synthetic content.', ratingStar: null },
    { ...row, reviewId: '105', ratingStar: 3.5, comment: 'Fourth synthetic content.' },
    { ...row, reviewId: '106', comment: '' }, { ...row, reviewId: '107', comment: null }];
  const transport: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(`${init?.method ?? 'GET'} ${url.pathname}`);
    if (url.pathname.endsWith('/runs')) return Response.json({ data: { id: 'SyntheticRun01', defaultDatasetId: 'SyntheticData01',
      buildId: 'SyntheticBuild01', status: 'SUCCEEDED', usageTotalUsd: 0.001, statusMessage: 'PRIVATE_STATUS authorId 918273645' } });
    assert.match(url.pathname, /\/datasets\/SyntheticData01\/items$/);
    const offset = Number(url.searchParams.get('offset')); const limit = Number(url.searchParams.get('limit'));
    return Response.json(rows.slice(offset, offset + limit), { headers: { 'x-apify-pagination-total': String(rows.length) } });
  };
  const collector = new ApifyShopeeCollector({ token: 'synthetic-token', maxChargeUsd: 1, journalRoot: path.join(root, 'journal'),
    retainReturnedPages: true, maxReviewsPerProduct: 20, fetch: transport }, privacy);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')),
    uuid: () => runId, now, sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'synthetic-v1' }, privateShopee: { source: { contractVersion: 'automation-private-shopee-source-v1', profile: privacy.profile },
      factory: () => ({ collector, requestsIssued: () => calls.length }) }, readerReportFlint: false, renderer: (value, kind) => { input = value; return buildResearchAutomationReport(value, kind); } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(),
    mode: 'PRODUCT', keyword: 'Synthetic product', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision: awaiting.revision,
    definition: 'Synthetic owner exact URL', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    exactShopeeUrls: ['https://shopee.vn/product/2001/3001'] };
  await service.confirmScope(workspaceId, runId, confirm);
  await service.processNext(); await service.processNext();
  const originalPair = (await service.listReportVersions(workspaceId, runId))[0]!;
  if (literal) {
    await service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1',
      requestKey: randomUUID(), previousPairId: originalPair.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      literalInsight: { contractVersion: 'insight-literal-select-v1' } });
    await service.processNext();
  }
  const pair = (await service.listReportVersions(workspaceId, runId)).at(-1)!;
  const report = await service.readReport(workspaceId, runId, 'INSIGHT', false, pair.pairId);
  const semantic = JSON.parse((await artifacts.read(report.versionId)).toString());
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v22'); assert.ok(input?.privateReviewCorpus);
  return { root, db, artifacts, service, calls, databasePath, artifactRoot, pair, report, semantic, input: input!, originalPair };

}