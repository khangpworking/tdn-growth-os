import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import type { InsightReportStatement } from '../../contracts/analysis/insight-report-statement.generated.js';
import { insightReaderFixture, readerOwner, readerRunId, readerWorkspaceId, readerNow } from './insight-reader-fixture.js';
import { fixtureDisplayRules } from './content-package-fixture.js';
import { AnalysisInsightReportStatementQuery, InsightReportStatementService } from '../../src/modules/analysis/insight-report-statements.js';
import { AutomationReaderReports } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { syntheticProductSource } from './research-synthetic-sources.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentCampaignService } from '../../src/modules/flow/content-campaign-service.js';
import { ContentInsightService, type ContentInsightB10Reader } from '../../src/modules/flow/content-insight-service.js';
import type { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import type { ProductWorkspaceArtifact } from '../../contracts/flow/product-workspace-artifact.generated.js';
import { createFakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';

export { id, at, fullSentence, statement } from '../fixtures/content-insight-handoff-statement.js';
import { id, at, statement } from '../fixtures/content-insight-handoff-statement.js';
export const handoff = (s: InsightReportStatement, expectedVersion = 0, confirmReplacement = false) => ({ contractVersion: '1.0.0', expectedVersion, revisionId: s.revisionId, statementId: s.statementId, confirmReplacement });
export const expectedInsight = (s: InsightReportStatement) => ({ customer: s.customer, painPoint: s.conflict, insight: s.insight,
  source: { kind: 'INSIGHT_REPORT' as const, revisionId: s.revisionId, statementId: s.statementId, snapshot: structuredClone(s) } });
export const campaignContent = { name: 'Synthetic campaign', objective: 'Synthetic explicit objective', items: [{ itemId: id(2), itemVersion: 1 }] };
export const typed = { customer: 'Typed customer', painPoint: 'Typed pain', insight: 'They value a reliable routine.', source: { kind: 'TYPED' as const } };
export const lockRequest = (campaignId: string, insightVersion = 1, campaignVersion = 1) => ({ contractVersion: '1.0.0', campaignId, insightVersion, campaignVersion });
export function rows(db: Database.Database, table: string) { return db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all(); }
export function inventory(root: string): string[] { return fs.existsSync(root) ? fs.readdirSync(root, { recursive: true, withFileTypes: true }).filter(e => e.isFile()).map(e => path.join(e.parentPath, e.name)).sort() : []; }

async function contentFixture(db: Database.Database, artifacts: ContentAddressedArtifactStore, reportStatements?: AnalysisInsightReportStatementQuery, b10Reader?: ContentInsightB10Reader) {
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => id(1), now: readerNow });
  const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid: () => id(2), now: readerNow });
  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'synthetic-cih', profile: { brandName: 'Synthetic CIH' }, displayRules: fixtureDisplayRules });
  await catalog.createItem({ contractVersion: '1.0.0', brandId: id(1), itemKey: 'synthetic-service', item: { itemType: 'SERVICE', name: 'Synthetic service', description: 'Synthetic description', tiers: [], photos: [] } });
  const campaigns = new ContentCampaignService({ db, artifactStore: artifacts, catalog, now: readerNow,
    workspaceReader: { async readVerifiedProductWorkspace(productWorkspaceId) { return { productWorkspaceId } as ProductWorkspaceArtifact; } } });
  const insights = new ContentInsightService({ db, artifactStore: artifacts, campaigns, now: readerNow, ...(reportStatements ? { reportStatements } : {}), ...(b10Reader ? { b10Reader } : {}) });
  const createCampaign = (key = `cih-${randomUUID()}`, patch = {}) => campaigns.createCampaign({ contractVersion: '1.0.0', campaignKey: key, brandId: id(1), campaign: { ...campaignContent, ...patch } });
  return { brands, catalog, campaigns, insights, createCampaign, gateway: createFakeCreativeGateway() };
}

export async function cihFixture(t: TestContext, options: { pre62?: boolean } = {}) {
  let migrationsDirectory: string | undefined;
  if (options.pre62) {
    migrationsDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'cih-migrations-'));
    for (const name of fs.readdirSync('migrations').filter(n => n.endsWith('.sql') && Number(n.slice(0, 4)) <= 61)) fs.copyFileSync(path.join('migrations', name), path.join(migrationsDirectory, name));
    t.after(() => fs.rmSync(migrationsDirectory!, { recursive: true, force: true }));
  }
  const f = await insightReaderFixture(t, false, migrationsDirectory ? { migrationsDirectory } : {});
  const built = await f.service.buildInsightReaderReport(readerWorkspaceId, readerRunId, { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT', requestKey: randomUUID(), draftPairId: f.pair.pairId, semanticSha256: f.report.versionId }, readerOwner);
  const readers = new AutomationReaderReports(f.db, f.artifacts, readerNow, { flint: false });
  const statements = new InsightReportStatementService(f.db);
  const query = new AnalysisInsightReportStatementQuery(f.db, f.artifacts);
  const content = await contentFixture(f.db, f.artifacts, query);
  const decide = async (revisionId: string, decision: 'APPROVED' | 'REJECTED') => {
    const row = f.db.prepare('SELECT run_id, html_sha256, report_kind FROM analysis_reader_report_revisions WHERE revision_id=?').get(revisionId) as { run_id: string; html_sha256: string; report_kind: string };
    return readers.decideV2({ workspaceId: readerWorkspaceId, runId: row.run_id }, { contractVersion: 'reader-report-decision-v2', reportKind: row.report_kind, requestKey: randomUUID(), revisionId, htmlSha256: row.html_sha256, decision, reason: decision === 'REJECTED' ? 'Synthetic rejection' : null }, readerOwner);
  };
  const approved = async (patch: Partial<InsightReportStatement> = {}) => {
    await decide(built.revision.revisionId, 'APPROVED');
    const s = statement(built.revision.revisionId, patch); statements.retainStatement(s); return s;
  };
  // Publish each additional report through the owning service in its own real run.
  // Multiple pending revisions may be built before the final one is approved.
  const appendReader = async (options: { kind?: 'INSIGHT' | 'MARKET'; runId?: string; createdAt?: string; keyword?: string; revisionCount?: number } = {}) => {
    const kind = options.kind ?? 'INSIGHT', runId = options.runId ?? randomUUID();
    const now = () => new Date(options.createdAt ?? at);
    const discovery = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, now });
    const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, now, uuid: () => runId,
      workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: syntheticProductSource(), readerReportFlint: false,
      metricAttachmentStore: new RequestScopedArtifactStore(f.artifactRoot) });
    const period = kind === 'MARKET' ? { startDate: '2026-01-01', endDate: '2026-01-29' } : { startDate: '2025-10-01', endDate: '2026-09-30' };
    await service.start(readerWorkspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'PRODUCT',
      keyword: options.keyword ?? 'Synthetic Insight reader', requestedPeriod: period, reports: [kind] });
    await service.processNext();
    const expectedRevision = (await service.getRun(readerWorkspaceId, runId)).revision;
    const scope = { definition: 'Synthetic native listing only', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
      exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] };
    let packageId: string | undefined;
    if (kind === 'MARKET') {
      const workbook = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2' }), maxBuffer: 4 * 1024 * 1024 });
      assert.equal(workbook.status, 0, workbook.stderr.toString());
      const prepared = await service.prepareMetricSource(readerWorkspaceId, runId, { contractVersion: 'automation-metric-prepare-v1', requestKey: randomUUID(),
        expectedRevision, scope, sourceLabel: 'Synthetic operator export', sourceContext: 'Synthetic fixture export',
        measurementPeriod: { ...period, basis: 'Synthetic declared period' }, selection: 'UNSPECIFIED', acquiredAt: null,
        precision: { revenue: 'unknown', units: 'unknown' } }, workbook.stdout);
      packageId = prepared.packageId;
    }
    await service.confirmScope(readerWorkspaceId, runId, packageId
      ? { contractVersion: 'research-automation-confirm-v2', requestKey: randomUUID(), expectedRevision, ...scope,
          sources: { metric: { decision: 'USE_PREPARED', packageId }, nativeReview: 'SKIP' } }
      : { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(), expectedRevision, ...scope });
    for (let i = 0; i < 10 && (await service.getRun(readerWorkspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
    assert.equal((await service.getRun(readerWorkspaceId, runId)).status, 'DRAFT_READY');
    if (packageId) {
      const built = await service.buildReaderReport(readerWorkspaceId, runId, { contractVersion: 'reader-report-build-v1', requestKey: randomUUID(),
        metricPackageId: packageId, platforms: ['shopee'], cover: null,
        profile: { slug: 'synthetic-jar', product: 'Hũ thử nghiệm', status: 'proposed', segments: { S1: 'Hũ nhỏ', N1: 'Hàng khác' },
          short: { S1: 'Nhỏ' }, core: ['S1'], non: ['N1'], rules: [{ seg: 'S1', when: {} }], signals: [] },
        source: { measurementPeriod: { start: period.startDate, end: period.endDate }, rowCap: 5000,
          displayedHeadlines: { revenueVnd: 200, soldListings: 2, shops: 2, units: 4 }, platformBreakdown: { shopee: { displayedRevenueVnd: 200 } } } }, readerOwner);
      return built.revision.revisionId;
    }
    const original = (await service.listReportVersions(readerWorkspaceId, runId))[0]!;
    const revision = await service.requestReportRevision(readerWorkspaceId, runId, { contractVersion: 'automation-insight-literal-report-revision-v1', requestKey: randomUUID(),
      previousPairId: original.pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, literalInsight: { contractVersion: 'insight-literal-select-v1' } });
    await service.processNext();
    const pair = (await service.listReportVersions(readerWorkspaceId, runId)).find(row => row.attemptId === revision.attemptId)!;
    const report = await service.readReport(readerWorkspaceId, runId, 'INSIGHT', false, pair.pairId);
    let revisionId = '';
    for (let i = 0; i < (options.revisionCount ?? 1); i++) {
      const built = await service.buildInsightReaderReport(readerWorkspaceId, runId, { contractVersion: 'insight-reader-build-v1', reportKind: 'INSIGHT',
        requestKey: randomUUID(), draftPairId: pair.pairId, semanticSha256: report.versionId }, readerOwner);
      revisionId = built.revision.revisionId;
    }
    return revisionId;
  };
  return { ...f, ...content, statements, query, readers, revisionId: built.revision.revisionId, approved, decide, appendReader };
}
