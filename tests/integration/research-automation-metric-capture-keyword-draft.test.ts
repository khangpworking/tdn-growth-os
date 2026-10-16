import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import type { KeywordListDraftTransport } from '../../src/modules/analysis/keyword-list-drafting.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationMetricMethodBridge, type MetricRunInput } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { readMetricSalesNameEvidence } from '../../src/modules/analysis/research-automation/metric-sales-name-evidence.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import type { AutomationConfirmedSourceSet } from '../../contracts/analysis/automation-confirmed-source-set.generated.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const salesBytes = Buffer.from('{"data":[{"product_id":"12345","product_name":"Synthetic jar product"}]}');
const organic = [
  { position: 1, title: 'Synthetic jar buying guide', link: 'https://example.com/guide', snippet: 'Synthetic jar sizes compared' },
  { position: 2, title: 'Unrelated garden tools', link: 'https://example.vn/tools', snippet: 'Rakes and hoes' },
];

/** Same capture shape as the existing capture integration test (W12 rows, one shopee row attributed). */
function captureSnapshot(): AutomationMetricWebSnapshotV1 {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as any;
  snapshot.captureId = 'capture-synthetic-draft-209';
  snapshot.scope = { keywords: ['synthetic jar'], platforms: ['shopee'], period, category: null, ticks: [], advancedFilters: [], exclusions: [] };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
  snapshot.groups.W12_topProducts = {
    columns: ['name', 'shop', 'platform', 'revenue', 'units'],
    rows: [
      { cells: { name: { label: 'Tên', text: 'Synthetic A', sourcePointer: 'p[0].name' }, shop: { label: 'Shop', text: 'Shop A', sourcePointer: 'p[0].shop' }, platform: { label: 'Sàn', text: 'shopee', sourcePointer: 'p[0].platform' }, revenue: { label: 'Doanh thu', displayed: '1200', value: 1200, unit: 'VND', precision: 'exact', platform: 'shopee', period, sourcePointer: 'p[0].revenue' }, units: { label: 'Lượt bán', displayed: '3', value: 3, unit: 'COUNT', precision: 'exact', platform: 'shopee', period, sourcePointer: 'p[0].units' } } },
      { cells: { name: { label: 'Tên', text: 'Synthetic B', sourcePointer: 'p[1].name' }, shop: { label: 'Shop', text: 'Shop B', sourcePointer: 'p[1].shop' }, platform: { label: 'Sàn', text: 'unknown', sourcePointer: 'p[1].platform' }, revenue: { label: 'Doanh thu', displayed: '800', value: 800, unit: 'VND', precision: 'exact', platform: 'unknown', period, sourcePointer: 'p[1].revenue' }, units: { label: 'Lượt bán', displayed: '2', value: 2, unit: 'COUNT', precision: 'exact', platform: 'unknown', period, sourcePointer: 'p[1].units' } } },
    ],
  };
  return snapshot as AutomationMetricWebSnapshotV1;
}

function captureArchive(snapshot: AutomationMetricWebSnapshotV1) {
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = { contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: { ...snapshot.scope, smartQuery: true, aiNormalisation: false, usefulFilters: { fake: false, gifts: true, deleted: false } }, resultCount: 2, productPagination: { cap: 2, totalShown: 2, pageSize: 2, pagesRead: 1, rowsRead: 2, truncated: false },
    metricDataVersion: 'metric-results-data-v2', chartSeries: { contractVersion: 'metric-results-data-v2',
      series: [{ series: 'topProducts', platform: 'shopee', name: 'Synthetic A', revenue: 1200, units: 3, source: 'response:/v2/market/analytics/products' }],
      trendOffered: false, trendNote: 'not offered by the source' },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: hash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }], screenshotSkips: [],
    archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true,
    captureGate: { cleared: true } };
  return { snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}

async function captureRun(t: TestContext, transport: KeywordListDraftTransport) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-capture-keyword-draft-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'capture-keyword-draft', title: 'Synthetic capture keyword draft' });
  const webCalls: URL[] = [];
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now, readerReportFlint: false,
    renderer: buildResearchAutomationReport, source: syntheticProductSource({ salesBytes }), webSource: syntheticWebSource(url => webCalls.push(url), organic),
    sourceEvidence: { modelIdentity: 'synthetic:model', promptVersion: 'synthetic-prompt-v1', transport } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const archive = captureArchive(captureSnapshot());
  const receipt = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', expectedRevision: awaiting.revision, sourceContext: 'Synthetic capture fixture' },
  archive.snapshotBytes, archive.manifestBytes);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [],
    sources: { metric: { decision: 'USE_PREPARED', packageId: receipt.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const packet = await service.readSourceEvidence(workspaceId, runId);
  const keywordDrafts = Number((db.prepare(`SELECT COUNT(*) n FROM artifact_manifests WHERE media_type='application/vnd.tdn.keyword-draft+json'`).get() as { n: number | bigint }).n);
  return { service, packet, keywordDrafts, webCalls, db, artifacts, workspaces: new FlowDiscoveryWorkspaceReader(discovery) };
}

test('a capture-confirmed Market run drafts keywords from the retained sales names and admits web rows', async t => {
  let modelCalls = 0;
  const f = await captureRun(t, { draftLists: async () => { modelCalls++; return { keywords: ['synthetic jar'], exclusions: [] }; } });
  assert.ok(f.packet);
  assert.equal(f.packet.unavailableReason, null);
  assert.equal(f.packet.draftFailureCode, undefined);
  assert.ok(f.packet.draftDigest);
  assert.equal(modelCalls, 1, 'the single existing model call happens');
  assert.equal(f.keywordDrafts, 1, 'the keyword draft is registered');
  const record = await f.service.readSourceKeywordDraft(workspaceId, runId, f.packet.draftDigest);
  assert.equal(record.contractVersion, 'l9-keyword-list-draft-record-v2', 'capture names are not referenced; the draft uses sales names only');
  assert.deepEqual(record.seeds.productNames, ['Synthetic jar product']);
  assert.equal(f.webCalls.length, 1, 'the existing single web search');
  assert.ok(f.packet.admission);
  assert.equal(f.packet.admission.includedRecordIds.length, 1, 'only the on-topic web row is admitted');
  const again = await f.service.draftSourceKeywords(workspaceId, runId);
  assert.ok(again.digest, 'a later draft over the frozen capture method package does not throw');
  assert.equal(again.unavailableReason, null);
});

test('a failing keyword transport leaves DRAFT_FAILED with a closed code and no message text', async t => {
  const logged: unknown[][] = [];
  t.mock.method(console, 'error', (...args: unknown[]) => { logged.push(args); });
  const f = await captureRun(t, { draftLists: async () => { throw new Error('synthetic transport boom at /srv/secret/path'); } });
  assert.ok(f.packet);
  assert.equal(f.packet.unavailableReason, 'DRAFT_FAILED');
  assert.equal(f.packet.draftFailureCode, 'MODEL_TRANSPORT_FAILED');
  assert.equal(f.packet.draftDigest, null);
  assert.equal(f.keywordDrafts, 0);
  const bytes = JSON.stringify(f.packet);
  assert.equal(bytes.includes('boom'), false);
  assert.equal(bytes.includes('/srv/'), false);
  const draftLogs = logged.map(args => String(args[0])).filter(line => line.includes('research_automation_keyword_draft_failed'));
  assert.deepEqual(draftLogs.map(line => JSON.parse(line)), [{ event: 'research_automation_keyword_draft_failed', runId, code: 'MODEL_TRANSPORT_FAILED' }]);
});

test('capture packages have no exact workbook title refs: Metric names are absent, never an error', async t => {
  const f = await captureRun(t, { draftLists: async () => ({ keywords: ['synthetic jar'], exclusions: [] }) });
  const row = f.db.prepare('SELECT start_request_sha256 startSha,scope_request_sha256 scopeSha,confirmed_source_set_sha256 sourceSha,scope_confirmed_at confirmedAt FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { startSha: string; scopeSha: string; sourceSha: string; confirmedAt: string };
  const sources = JSON.parse((await f.artifacts.read(row.sourceSha)).toString()) as AutomationConfirmedSourceSet;
  assert.equal(sources.metric.decision, 'ADMITTED');
  const input: MetricRunInput = { runId, start: JSON.parse((await f.artifacts.read(row.startSha)).toString()),
    scope: JSON.parse((await f.artifacts.read(row.scopeSha)).toString()), scopeConfirmedAt: row.confirmedAt };
  const authority = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts, workspaces: f.workspaces, now });
  const options = { artifacts: f.artifacts, reader: new FoundationSourcePackageReader(new SourcePackageService({ db: f.db, artifactStore: f.artifacts })), authority };
  assert.equal(await readMetricSalesNameEvidence(options, input, sources, row.sourceSha), null);
  assert.equal(await authority.readFrozenSalesNames({ ...input, sourceSelection: { executionId: sources.executionId,
    sourcePackage: sources.metric.decision === 'ADMITTED' ? sources.metric.sourcePackage : null } }), undefined);
});
