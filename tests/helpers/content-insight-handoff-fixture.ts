import { randomUUID } from 'node:crypto';
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
import { canonicalBytes, registerContentManifest } from '../../src/modules/flow/content-artifacts.js';
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
  // Independent synthetic ledger fixtures exercise query states, including states
  // that the existing publisher's approved-latest guard cannot currently produce.
  // These are not owner-service publication receipts. Decisions still use Box 2.
  const appendReader = async (options: { kind?: 'INSIGHT' | 'MARKET'; runId?: string; createdAt?: string; keyword?: string; period?: { startDate: string; endDate: string } | null } = {}) => {
    const base = f.db.prepare('SELECT * FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as Record<string, string | bigint | null>;
    const runId = options.runId ?? readerRunId;
    if (runId !== readerRunId && !f.db.prepare('SELECT 1 FROM analysis_research_automation_runs WHERE run_id=?').get(runId)) {
      const run = f.db.prepare('SELECT * FROM analysis_research_automation_runs WHERE run_id=?').get(readerRunId) as Record<string, string | bigint | null>;
      run.run_id = runId;
      insert(f.db, 'analysis_research_automation_runs', run);
    }
    const kind = options.kind ?? 'INSIGHT', revisionId = randomUUID();
    const n = f.db.prepare('SELECT coalesce(max(revision_number),0)+1 n FROM analysis_reader_report_revisions WHERE run_id=? AND report_kind=?').get(runId, kind) as { n: bigint };
    const createdAt = options.createdAt ?? at;
    const record = JSON.parse((await f.artifacts.read(String(base.input_sha256))).toString());
    Object.assign(record, { revisionId, createdAt }); record.input.runId = runId;
    if (options.keyword !== undefined) record.input.scope.keyword = options.keyword;
    if (options.period !== undefined) record.input.scope.requestedPeriod = options.period;
    const stored = await f.artifacts.put(canonicalBytes(record)); registerContentManifest(f.db, stored, createdAt, 'application/json');
    Object.assign(base, { revision_id: revisionId, run_id: runId, revision_number: n.n, request_key: randomUUID(), input_sha256: stored.sha256, created_at: createdAt, report_kind: kind });
    if (kind === 'MARKET') Object.assign(base, { semantic_sha256: null, source_report_sha256: null, metric_package_id: id(900), platforms: 'shopee', profile_status: 'proposed', profile_sha256: stored.sha256 });
    insert(f.db, 'analysis_reader_report_revisions', base);
    return revisionId;
  };
  return { ...f, ...content, statements, query, readers, revisionId: built.revision.revisionId, approved, decide, appendReader };
}
function insert(db: Database.Database, table: string, row: Record<string, string | bigint | null>) {
  const names = Object.keys(row); db.prepare(`INSERT INTO ${table}(${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`).run(...names.map(n => row[n]));
}
