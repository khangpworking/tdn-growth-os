import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { AutomationMetricCaptureSourceIntake } from '../../src/modules/analysis/research-automation/metric-capture-intake.js';
import { AutomationMetricMethodBridge, type MetricRunInput, type AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { captureRelevanceKeyword, captureTitleSha256, readCaptureRelevanceRecord, type CaptureRelevanceLabel } from '../../src/modules/analysis/research-automation/capture-relevance.js';

export const relevanceKeyword = 'lumo pod';
export const relevanceNow = () => new Date('2026-02-01T00:00:00.000Z');
export const relevanceHash = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

/** Synthetic saved labels; this helper never executes a classifier or transport. */
export function retainedRelevance(rows: readonly { title: string }[], keyword: string, label: (title: string) => CaptureRelevanceLabel | null) {
  return readCaptureRelevanceRecord({
    contractVersion: 'capture-relevance-record-v1', promptVersion: 'capture-relevance-prompt-v1',
    modelIdentity: 'cliproxy:synthetic-lumo-model', configuration: captureRelevanceConfiguration('synthetic-lumo-model'),
    decisions: [...new Set(rows.map(row => row.title).filter(title => title.trim()))].map(title => ({
      keyword: captureRelevanceKeyword(keyword), titleSha256: captureTitleSha256(title), label: label(title),
    })), methodNotes: { batches: 1, retriedBatches: 0, failedBatches: 0, cappedTitles: 0 },
  }, rows, [keyword]);
}
export const relevanceRows = [
  { title: 'Lumo pod amber', platform: 'shopee', revenue: 100, units: 1 },
  { title: 'Sleeve dùng cho lumo pod', platform: 'shopee', revenue: 100, units: 1 },
  { title: 'Lumo pod uncertain', platform: 'shopee', revenue: 100, units: 1 },
  { title: 'Lumo pod rival', platform: 'shopee', revenue: 100, units: 1 },
  { title: 'Lumo pod no units', platform: 'shopee', revenue: 100, units: 0 },
  { title: 'Lumo pod high', platform: 'shopee', revenue: 4000, units: 1 },
  { title: 'Lumo pod amber', platform: 'tiktok', revenue: 9000, units: 1 },
  { title: 'Lumo pod violet', platform: 'tiktok', revenue: 9000, units: 1 },
] as const;

export async function relevanceArchive() {
  const snapshot = JSON.parse(await fs.readFile(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as AutomationMetricWebSnapshotV1;
  snapshot.captureId = 'capture-synthetic-lumo';
  const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
  snapshot.scope = { keywords: [relevanceKeyword], platforms: ['shopee', 'tiktok'], period, category: 'Invented lumoware', ticks: [], advancedFilters: [], exclusions: [] };
  for (const key of Object.keys(snapshot.groups)) if (key !== 'W2_kpi' && key !== 'W3_platformSplit') (snapshot.groups as unknown as Record<string, unknown>)[key] = { absent: true, reason: 'NOT_CAPTURED' };
  snapshot.groups.W12_topProducts = { columns: ['name', 'shop', 'platform', 'category', 'revenue', 'units'], rows: relevanceRows.map((row, i) => ({ cells: {
    name: { label: 'Title', text: row.title, sourcePointer: `rows[${i}].name` },
    shop: { label: 'Shop', text: `Synthetic shop ${i}`, sourcePointer: `rows[${i}].shop` },
    platform: { label: 'Platform', text: row.platform, sourcePointer: `rows[${i}].platform` },
    category: { label: 'Category', text: 'Invented lumoware', sourcePointer: `rows[${i}].category` },
    revenue: { label: 'Revenue', displayed: String(row.revenue), value: row.revenue, unit: 'VND', precision: 'exact', platform: row.platform, period, sourcePointer: `rows[${i}].revenue` },
    units: { label: 'Units', displayed: String(row.units), value: row.units, unit: 'COUNT', precision: 'exact', platform: row.platform, period, sourcePointer: `rows[${i}].units` },
  } })) };
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = { contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: snapshot.scope, resultCount: relevanceRows.length,
    productPagination: { cap: relevanceRows.length, totalShown: relevanceRows.length, pageSize: relevanceRows.length, pagesRead: 1, rowsRead: relevanceRows.length, truncated: false },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: relevanceHash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }],
    screenshotSkips: [], archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true, captureGate: { cleared: true } };
  return { snapshot, snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}

export function relevancePickRows() {
  return relevanceRows.map((row, i) => ({ product_base_id: `1__${101 + i}__${201 + i}`, product_name: row.title,
    shop_base_id: `synthetic-shop-${i}`, revenue_custom: row.revenue, order_custom: row.units, brand: `Synthetic brand ${i}` }));
}

type Stored = Record<string, string | number | null>;
export interface RelevanceMainFixture {
  revision: string; provenance?: string; input: MetricRunInput; workspace: Awaited<ReturnType<FlowDiscoveryWorkspaceReader['readVerifiedWorkspace']>>;
  method: AutomationMetricMethodSnapshot; methodFiles: { path: string; sha256: string; byteSize: number }[]; readerJson: string; pickJson: string;
  packages: Stored[]; files: Stored[]; origins: Stored[]; artifacts: { metadata: Stored; text: string }[];
}

export async function relevanceHarness(t: Pick<TestContext, 'after'>, fixture?: RelevanceMainFixture) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'synthetic-relevance-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: relevanceNow }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now: relevanceNow });
  const archive = await relevanceArchive();
  if (fixture) {
    const insert = (table: string, row: Stored) => { const keys = Object.keys(row); db.prepare(`INSERT INTO ${table} (${keys.join(',')}) VALUES (${keys.map(() => '?').join(',')})`).run(...Object.values(row)); };
    for (const a of fixture.artifacts) { assert.equal((await artifacts.put(Buffer.from(a.text))).sha256, a.metadata.sha256); insert('artifact_manifests', a.metadata); }
    for (const row of fixture.packages) insert('foundation_source_packages', { ...row, finalized_at: null });
    for (const row of fixture.files) insert('foundation_source_package_files', row);
    for (const row of fixture.origins) insert('foundation_source_attachment_origins', row);
    for (const row of fixture.packages) db.prepare('UPDATE foundation_source_packages SET finalized_at=? WHERE package_id=?').run(row.finalized_at, row.package_id);
    return { root, db, artifacts, packages, archive, input: structuredClone(fixture.input), workspaces: { readVerifiedWorkspace: async () => fixture.workspace } };
  }
  const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222';
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now: relevanceNow, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-lumo', title: 'Synthetic lumoware' });
  const workspaces = new FlowDiscoveryWorkspaceReader(discovery);
  const input: MetricRunInput = { runId, scopeConfirmedAt: relevanceNow().toISOString(),
    start: { contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: 'CATEGORY', keyword: relevanceKeyword,
      description: null, interview: null, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 }, reports: ['MARKET'] },
    scope: { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: 'Synthetic lumoware', includeTerms: [relevanceKeyword], excludeTerms: [], selectedProductIds: [], peerProductIds: [] } };
  const intake = new AutomationMetricCaptureSourceIntake(new RequestScopedArtifactStore(path.join(root, 'artifacts')), db, relevanceNow);
  const prepared = await intake.prepare({ contractVersion: 'automation-metric-capture-prepare-v1', requestKey: '33333333-3333-4333-8333-333333333333', expectedRevision: 1, sourceContext: 'Synthetic lumoware' }, archive.snapshotBytes, archive.manifestBytes, { runId, start: input.start, scope: input.scope });
  const source = await new AutomationMetricMethodBridge({ db, artifactStore: artifacts, workspaces, now: relevanceNow }).inspectPrepared(input, prepared.packageId);
  input.sourceSelection = { executionId: '44444444-4444-4444-8444-444444444444', sourcePackage: source };
  return { root, db, artifacts, packages, archive, input, workspaces };
}
