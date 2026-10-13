import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import type { AutomationMarketPresentationMethod } from '../../contracts/analysis/automation-market-presentation-method.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationMetricMethodBridge, type AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { ResearchAutomationIntegrityError, ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
const profile = { slug: 'synthetic-jar', product: 'Hũ thử nghiệm', status: 'proposed' as const,
  segments: { S1: 'Hũ nhỏ', N1: 'Hàng khác' }, short: { S1: 'Nhỏ' }, core: ['S1'], non: ['N1'], rules: [{ seg: 'S1', when: {} }], signals: [] };
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function captureSnapshot(): AutomationMetricWebSnapshotV1 {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as any;
  snapshot.captureId = 'capture-synthetic-e2e-209';
  snapshot.scope = { keywords: ['synthetic jar'], platforms: ['shopee'], period, category: null, ticks: [], advancedFilters: [], exclusions: [] };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
  snapshot.groups.W12_topProducts = {
    columns: ['name', 'shop', 'platform', 'revenue', 'units'],
    rows: [
      { cells: { name: { label: 'Tên', text: 'Synthetic A', sourcePointer: 'p[0].name' }, shop: { label: 'Shop', text: 'Shop A', sourcePointer: 'p[0].shop' }, platform: { label: 'Sàn', text: 'shopee', sourcePointer: 'p[0].platform' }, revenue: { label: 'Doanh thu', displayed: '1200', value: 1200, unit: 'VND', precision: 'exact', platform: 'shopee', period, sourcePointer: 'p[0].revenue' }, units: { label: 'Lượt bán', displayed: '3', value: 3, unit: 'COUNT', precision: 'exact', platform: 'shopee', period, sourcePointer: 'p[0].units' } } },
      { cells: { name: { label: 'Tên', text: 'Synthetic B', sourcePointer: 'p[1].name' }, shop: { label: 'Shop', text: 'Shop B', sourcePointer: 'p[1].shop' }, platform: { label: 'Sàn', text: 'unknown', sourcePointer: 'p[1].platform' }, revenue: { label: 'Doanh thu', displayed: '800', value: 800, unit: 'VND', precision: 'exact', platform: 'unknown', period, sourcePointer: 'p[1].revenue' }, units: { label: 'Lượt bán', displayed: '2', value: 2, unit: 'COUNT', precision: 'exact', platform: 'unknown', period, sourcePointer: 'p[1].units' } } },
      { cells: { name: { label: 'Tên', text: 'Synthetic unknown', sourcePointer: 'p[2].name' }, shop: { label: 'Shop', text: 'Shop ?', sourcePointer: 'p[2].shop' }, platform: { label: 'Sàn', text: 'unknown', sourcePointer: 'p[2].platform' }, revenue: { label: 'Doanh thu', displayed: '500', value: 500, unit: 'VND', precision: 'exact', platform: 'unknown', period, sourcePointer: 'p[2].revenue' }, units: { label: 'Lượt bán', displayed: '–', value: null, unit: 'COUNT', precision: 'exact', platform: 'unknown', period, sourcePointer: 'p[2].units' } } },
    ],
  };
  return snapshot as AutomationMetricWebSnapshotV1;
}

function captureArchive(snapshot: AutomationMetricWebSnapshotV1) {
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = { contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: { ...snapshot.scope, smartQuery: true, aiNormalisation: false, usefulFilters: { fake: false, gifts: true, deleted: false } }, resultCount: 3, productPagination: { cap: 3, totalShown: 5, pageSize: 3, pagesRead: 1, rowsRead: 3, truncated: true },
    metricDataVersion: 'metric-results-data-v2', chartSeries: { contractVersion: 'metric-results-data-v2',
      series: [{ series: 'topProducts', platform: 'shopee', name: 'Synthetic A', revenue: 1200, units: 3, source: 'response:/v2/market/analytics/products' }],
      trendOffered: false, trendNote: 'not offered by the source' },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: hash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }], screenshotSkips: [],
    archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true,
    captureGate: { cleared: true } };
  return { snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n') };
}

async function fixture(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-capture-209-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-capture-209', title: 'Synthetic Metric capture' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now, readerReportFlint: false });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const scope = { definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  const workbook = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2' }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(workbook.status, 0, workbook.stderr.toString());
  const workbookReceipt = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1',
    requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision, scope, sourceLabel: 'Synthetic workbook', sourceContext: 'Synthetic workbook fixture',
    measurementPeriod: { ...period, basis: 'Synthetic fixture' }, selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' } }, workbook.stdout);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'USE_PREPARED', packageId: workbookReceipt.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  return { service, db, artifacts };
}

test('capture source prepares with provenance, exact retry, and capture-backed Market reader preserves missing fields', async t => {
  const f = await fixture(t);
  const snapshot = captureSnapshot();
  const archive = captureArchive(snapshot);
  const request = { contractVersion: 'automation-metric-capture-prepare-v1' as const, requestKey: '66666666-6666-4666-8666-666666666666',
    expectedRevision: (await f.service.getRun(workspaceId, runId)).revision, sourceContext: 'Synthetic capture fixture' };
  const receipt = await f.service.prepareMetricCapture(workspaceId, runId, request, archive.snapshotBytes, archive.manifestBytes);
  assert.equal(receipt.sourceLabel, 'results-page capture');
  assert.equal(receipt.provenance, 'RESULTS_PAGE_CAPTURE');
  assert.equal(receipt.exactRetry, false);
  const retry = await f.service.prepareMetricCapture(workspaceId, runId, request, archive.snapshotBytes, archive.manifestBytes);
  assert.equal(retry.exactRetry, true);
  assert.deepEqual(await f.artifacts.read(hash(archive.manifestBytes)), archive.manifestBytes, 'manifest bytes retain chart series and all page toggles');
  const inventory = await f.service.listPreparedMetricCaptureSources(workspaceId, runId);
  assert.equal(inventory.sources[0]!.provenance, 'RESULTS_PAGE_CAPTURE');
  assert.deepEqual(inventory.sources[0]!.capture.truncation, { cap: 3, totalShown: 5, pagesRead: 1, rowsRead: 3, truncated: true });

  const build = await f.service.buildReaderReport(workspaceId, runId, {
    contractVersion: 'reader-report-build-v1.1', requestKey: '77777777-7777-4777-8777-777777777777', metricPackageId: receipt.packageId,
    platforms: ['shopee'], profile, cover: null, webSnapshot: snapshot, webSnapshotSha256: webSnapshotDigest(snapshot),
  }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const row = f.db.prepare('SELECT input_sha256 inputSha FROM analysis_reader_report_revisions WHERE revision_id=?').get(build.revision.revisionId) as { inputSha: string };
  const record = JSON.parse((await f.artifacts.read(row.inputSha)).toString('utf8'));
  assert.equal(record.input.rowLineage.sha256, hash(archive.snapshotBytes));
  assert.equal(record.input.rows[0].listingSynthetic, true);
  assert.equal(record.input.rows[0].start, null);
  assert.equal(record.input.rows[0].brand, '(không ghi)');
  assert.ok(build.revision.revisionId);
  const html = (await f.service.readReaderReport(workspaceId, runId, build.revision.revisionId)).bytes.toString('utf8');
  assert.match(html, /results-page capture/);
  assert.match(html, /không có số liệu/);
  assert.deepEqual(record.input.rows.map((entry: { platform: string }) => entry.platform), ['shopee']);
  assert.ok(row.inputSha);
});

interface CaptureRun {
  service: ResearchAutomationService;
  db: Database.Database;
  artifacts: ContentAddressedArtifactStore;
  pair: { pairId: string };
  archive: { snapshotBytes: Buffer; manifestBytes: Buffer };
  receipt: { packageId: string };
}

/** Capture-only run: the admitted Metric source is a results-page capture. */
async function captureRun(t: TestContext): Promise<CaptureRun> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-capture-pres-209-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-capture-pres-209', title: 'Synthetic Metric capture presentation' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now, readerReportFlint: false });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const archive = captureArchive(captureSnapshot());
  const receipt = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', expectedRevision: awaiting.revision, sourceContext: 'Synthetic capture fixture' },
  archive.snapshotBytes, archive.manifestBytes);
  const scope = { definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'USE_PREPARED', packageId: receipt.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  return { service, db, artifacts, pair, archive, receipt };
}

const presentationRequest = (previousPairId: string, extra: Record<string, unknown> = {}) => ({ contractVersion: 'automation-market-presentation-revision-v1' as const,
  requestKey: randomUUID(), previousPairId, sources: { metric: { decision: 'KEEP' as const }, nativeReview: { decision: 'KEEP' as const } }, ...extra });

/** Mirrors the workbook-backed presentation test's rule expectation, rule by rule. */
const machineRuleFailures = (html: string): string[] => auditMarket14(html)
  .filter(rule => rule.kind === 'machine' && !rule.ok).map(rule => `${rule.rule}: ${rule.detail}`);

/** The stored report version these cases read back, limited to the fields they assert. */
interface PresentationSemantic {
  rendererVersion: string;
  marketPresentationArtifact: { sha256: string };
}

async function commitPresentation(f: CaptureRun, previousPairId: string) {
  const receipt = await f.service.requestReportRevision(workspaceId, runId, presentationRequest(previousPairId));
  await f.service.processNext();
  const committed = await f.service.getReportRevision(workspaceId, runId, receipt.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString()) as PresentationSemantic;
  const method = JSON.parse((await f.artifacts.read(semantic.marketPresentationArtifact.sha256)).toString()) as AutomationMarketPresentationMethod;
  return { pairId: committed.pairId!, report, html: report.bytes.toString('utf8'), semantic, method };
}

test('capture-backed Market presentation revision passes the same machine rules as the workbook path', async t => {
  const f = await captureRun(t);
  const { pairId, html, semantic, method } = await commitPresentation(f, f.pair.pairId);
  assert.equal(semantic.rendererVersion, 'automation-report-kit-v20');
  // The binding pins the capture archive exactly; the workbook form stays the other shape.
  const metric = method.binding.metric;
  assert.ok(metric !== null && 'kind' in metric, 'a capture source stores the capture binding form');
  assert.deepEqual(metric, { kind: 'capture', sourcePackage: metric.sourcePackage, snapshotSha256: hash(f.archive.snapshotBytes),
    manifestSha256: hash(f.archive.manifestBytes), resultSha256: hash(Buffer.from(canonicalJson(method.input.metric))) });
  assert.equal(metric.sourcePackage.packageId, f.receipt.packageId);
  assert.equal(method.binding.previousPairId, f.pair.pairId);
  // No workbook, so no unit-spec rows and no fabricated fields.
  assert.equal(method.input.unitSpec, null);
  assert.deepEqual(method.input.rows, []);
  assert.equal(method.unitPrices.length, 0);
  assert.equal(method.findings.length, 4);
  assert.deepEqual(machineRuleFailures(html), []);
  assert.match(html, /results-page capture/);
  assert.doesNotMatch(html, /\b[0-9a-f]{64}\b/iu, 'no digest reaches the reader page');
  assert.doesNotMatch(html, /tmp\/tdn-/, 'no machine path reaches the reader page');
  // Re-reading the committed pair replays the capture binding without a provider or clock.
  assert.equal((await f.service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8'), html);
});

test('capture presentation rejects a changed snapshot or manifest byte on read-back and on the next revision', async t => {
  const f = await captureRun(t);
  const { pairId, html } = await commitPresentation(f, f.pair.pairId);
  const attempts = (await f.service.listReportAttempts(workspaceId, runId)).length;
  assert.equal(attempts, 1);
  for (const sha of [hash(f.archive.snapshotBytes), hash(f.archive.manifestBytes)]) {
    const target = f.artifacts.pathForDigest(sha), original = await fs.readFile(target);
    await fs.writeFile(target, Buffer.from('{"tampered":true}'));
    const integrityFailure = (error: unknown) => error instanceof ResearchAutomationIntegrityError;
    await assert.rejects(f.service.readReport(workspaceId, runId, 'MARKET', false, pairId), integrityFailure);
    await assert.rejects(f.service.requestReportRevision(workspaceId, runId, presentationRequest(pairId)), integrityFailure);
    await fs.writeFile(target, original);
    assert.equal((await f.service.listReportAttempts(workspaceId, runId)).length, attempts, 'a tampered archive queues nothing');
    assert.equal((await f.service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8'), html);
  }
});

test('capture presentation refuses a unit-spec receipt in plain words and still runs without one', async t => {
  const f = await captureRun(t);
  await assert.rejects(f.service.requestReportRevision(workspaceId, runId,
    presentationRequest(f.pair.pairId, { unitSpecIntakeSha256: 'f'.repeat(64) })),
  (error: unknown) => error instanceof ResearchAutomationValidationError &&
    /Unit-spec receipt is not supported for a results-page Metric capture/.test(error.message));
  assert.equal((await f.service.listReportAttempts(workspaceId, runId)).length, 0, 'a refused unit spec queues nothing');
  const receipt = await f.service.requestReportRevision(workspaceId, runId, presentationRequest(f.pair.pairId));
  await f.service.processNext();
  assert.equal((await f.service.getReportRevision(workspaceId, runId, receipt.attemptId)).state, 'COMMITTED');
});

test('capture revenue survives presentation revision while legacy captures reveal retained platform figures', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-metric-capture-pres-209-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'metric-capture-pres-209', title: 'Synthetic Metric capture presentation' });
  // The served Market draft is the same renderer the API uses; the capture
  // fixture needs it to see what a reader actually receives.
  let marketInput: Parameters<typeof buildResearchAutomationReport>[0] | undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now, readerReportFlint: false,
    renderer: (input, kind) => { marketInput = input; return buildResearchAutomationReport(input, kind); } });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const snapshot = captureSnapshot();
  snapshot.scope.platforms = ['shopee', 'tiktok'];
  const metricValue = (value: number, unit: 'VND' | 'COUNT' | 'PERCENT', platform: 'shopee' | 'tiktok', sourcePointer: string,
    displayed = String(value), raw: number | null = value) =>
    ({ label: 'Số liệu theo nền tảng', displayed, value: raw, unit, precision: raw === null ? 'display_rounded' as const : 'exact' as const, platform, period, sourcePointer });
  snapshot.groups.W3_platformSplit = [
    { platform: 'shopee', revenue: metricValue(1234567890, 'VND', 'shopee', 'platform.shopee.revenue', '1,2 tỷ', null), units: metricValue(42000, 'COUNT', 'shopee', 'platform.shopee.units'), share: metricValue(65.1, 'PERCENT', 'shopee', 'platform.shopee.share') },
    { platform: 'tiktok', revenue: metricValue(9876543210, 'VND', 'tiktok', 'platform.tiktok.revenue'), units: null, share: metricValue(34.9, 'PERCENT', 'tiktok', 'platform.tiktok.share') },
  ];
  const archive = captureArchive(snapshot);
  const receipt = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', expectedRevision: awaiting.revision, sourceContext: 'Synthetic capture fixture' },
  archive.snapshotBytes, archive.manifestBytes);
  const scope = { definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'USE_PREPARED', packageId: receipt.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const draft = (await service.readReport(workspaceId, runId, 'MARKET')).bytes.toString('utf8');
  for (const platform of ['Shopee', 'TikTok Shop'])
    assert.equal((draft.match(new RegExp(`<h3>${platform}</h3><p>Doanh thu quan sát: `, 'g')) ?? []).length, 2,
      `${platform} capture figures appear in both the M03 and M04 sections`);
  const CITE = ' <sup class="cite">\\[\\d+\\]<\\/sup>';
  assert.match(draft, new RegExp(`<h3>Shopee<\\/h3><p>Doanh thu quan sát: <strong>1\\.200\\.000\\.000 VND<\\/strong> <small>số làm tròn như trên trang<\\/small>${CITE}; sản lượng: <strong>42\\.000<\\/strong>${CITE}\\. Đây là số của cả tập kết quả theo bộ lọc trên trang\\. Không phải tổng của danh sách giữ bên dưới\\.`));
  assert.match(draft, new RegExp(`<h3>TikTok Shop<\\/h3><p>Doanh thu quan sát: <strong>9\\.876\\.543\\.210 VND<\\/strong>${CITE}; sản lượng: <strong>không có số liệu<\\/strong>\\. Đây là số của cả tập kết quả theo bộ lọc trên trang\\. Capture có chọn nền tảng này nhưng không có dòng nào gán được cho nền tảng; báo cáo không suy ra và không ghi thành 0\\.`));
  assert.match(draft, /1\.200 VND/, 'the retained row list still shows its own row value');
  assert.doesNotMatch(draft, /Doanh thu quan sát: <strong>1\.200 VND/);
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  // A run frozen before the per-platform figures existed still has to report the
  // figures the retained page holds: the gap is reproduced first, then closed by
  // reading those figures back from the retained capture.
  const frozen = marketInput!.metricMethods!;
  const { platformHeadlines: _figures, ...legacyCapture } = frozen.capture!;
  const legacy = { ...frozen, capture: legacyCapture } as AutomationMetricMethodSnapshot;
  assert.match(buildResearchAutomationReport({ ...marketInput!, metricMethods: legacy }, 'MARKET').html.toString('utf8'), /Doanh thu quan sát: <strong>1\.200 VND/);
  const bridge = new AutomationMetricMethodBridge({ db, artifactStore: artifacts, workspaces: new FlowDiscoveryWorkspaceReader(discovery), now });
  const revealed = await bridge.revealCapturePlatformHeadlines(legacy);
  const revised = buildResearchAutomationReport({ ...marketInput!, metricMethods: revealed }, 'MARKET').html.toString('utf8');
  assert.match(revised, new RegExp(`<h3>Shopee<\\/h3><p>Doanh thu quan sát: <strong>1\\.200\\.000\\.000 VND<\\/strong> <small>số làm tròn như trên trang<\\/small>${CITE}`));
  assert.match(revised, new RegExp(`<h3>TikTok Shop<\\/h3><p>Doanh thu quan sát: <strong>9\\.876\\.543\\.210 VND<\\/strong>${CITE}`));
  assert.doesNotMatch(revised, /Doanh thu quan sát: <strong>1\.200 VND/);
  const revision = await service.requestReportRevision(workspaceId, runId, presentationRequest(pair.pairId));
  await service.processNext();
  const committed = await service.getReportRevision(workspaceId, runId, revision.attemptId);
  assert.equal(committed.state, 'COMMITTED');
  const presented = (await service.readReport(workspaceId, runId, 'MARKET', false, committed.pairId!)).bytes.toString('utf8');
  assert.match(presented, /Doanh thu quan sát: <strong>1\.200\.000\.000 VND/);
  assert.match(presented, /Doanh thu quan sát: <strong>9\.876\.543\.210 VND/);
  assert.doesNotMatch(presented, /Doanh thu quan sát: <strong>1\.200 VND/);
  assert.deepEqual(machineRuleFailures(presented), []);
});
