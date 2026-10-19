import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type { AutomationMetricWebSnapshotV1 } from '../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { AutomationMetricMethodBridge, type AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { JSDOM } from 'jsdom';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { CAPTURE_ROW_PROFILE, CAPTURE_ROW_PROFILE_V2 } from '../../src/modules/analysis/research-automation/capture-row-quality.js';
import type { CaptureRelevanceAi } from '../../src/modules/analysis/research-automation/capture-relevance.js';
import { captureRelevanceConfiguration } from '../../src/modules/analysis/research-automation/capture-relevance-cliproxy-transport.js';
import { readerRowsFromMetricCapture } from '../../src/modules/analysis/reader-report/metric-capture-rows.js';
import { marketChartSource } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { verifyReaderReportInput } from '../../src/modules/analysis/reader-report/build.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
const profile = { slug: 'synthetic-jar', product: 'Hũ thử nghiệm', status: 'proposed' as const,
  segments: { S1: 'Hũ nhỏ', N1: 'Hàng khác' }, short: { S1: 'Nhỏ' }, core: ['S1'], non: ['N1'], rules: [{ seg: 'S1', when: {} }], signals: [] };
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function captureSnapshot(shops = true): AutomationMetricWebSnapshotV1 {
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
  // Some results pages list products without a shop column.
  if (!shops) {
    snapshot.groups.W12_topProducts.columns = snapshot.groups.W12_topProducts.columns.filter((column: string) => column !== 'shop');
    for (const row of snapshot.groups.W12_topProducts.rows) delete row.cells.shop;
  }
  return snapshot as AutomationMetricWebSnapshotV1;
}

function captureArchive(snapshot: AutomationMetricWebSnapshotV1) {
  const count = 'absent' in snapshot.groups.W12_topProducts ? 0 : snapshot.groups.W12_topProducts.rows.length;
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = { contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: { ...snapshot.scope, smartQuery: true, aiNormalisation: false, usefulFilters: { fake: false, gifts: true, deleted: false } }, resultCount: count, productPagination: { cap: count, totalShown: count + 2, pageSize: count, pagesRead: 1, rowsRead: count, truncated: true },
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
  assert.match(html, /bảng kết quả tìm kiếm đã lưu/);
  assert.equal(html.includes('results-page capture'), false);
  assert.match(html, /không có số liệu/);
  assert.deepEqual(record.input.rows.map((entry: { platform: string }) => entry.platform), ['shopee']);
  assert.ok(row.inputSha);
});

test('capture-confirmed Market run refuses the workbook-only presentation revision in plain words before queuing', async t => {
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
  await assert.rejects(service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-market-presentation-revision-v1',
    requestKey: '88888888-8888-4888-8888-888888888888', previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, unitSpecIntakeSha256: 'f'.repeat(64) }),
  (error: unknown) => error instanceof ResearchAutomationValidationError && /results-page Metric capture/.test(error.message));
  assert.equal((await service.listReportAttempts(workspaceId, runId)).length, 0);
});

/** Fresh Market run confirmed either with the prepared capture or with no Metric source at all. */
async function confirmedCaptureRun(t: TestContext, decision: 'USE_PREPARED' | 'SKIPPED', shops = true, suppliedSnapshot?: AutomationMetricWebSnapshotV1, captureRelevance?: CaptureRelevanceAi) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `tdn-metric-capture-209-${decision.toLowerCase()}-`));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: `metric-capture-209-${decision.toLowerCase()}`, title: 'Synthetic Metric capture confirmation' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now, readerReportFlint: false,
    ...(captureRelevance ? { captureRelevance } : {}),
    renderer: buildResearchAutomationReport });
  const confirmedKeyword = suppliedSnapshot?.scope.keywords[0] ?? 'synthetic jar';
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: confirmedKeyword, requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const archive = captureArchive(suppliedSnapshot ?? captureSnapshot(shops));
  const receipt = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', expectedRevision: awaiting.revision, sourceContext: 'Synthetic capture fixture' },
  archive.snapshotBytes, archive.manifestBytes);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, definition: 'Synthetic reader scope', includeTerms: [confirmedKeyword], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    sources: { metric: decision === 'USE_PREPARED' ? { decision: 'USE_PREPARED', packageId: receipt.packageId } : { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  return { service, artifacts, pair, root, db, discovery };
}

test('a capture-confirmed Market run counts Metric as executed and keeps capture jargon out of reader text', async t => {
  const { service } = await confirmedCaptureRun(t, 'USE_PREPARED');
  const run = await service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY');
  assert.equal(run.blockers.some(blocker => blocker.code === 'METRIC_MANUAL_EXPORT_REQUIRED'), false);
  const html = (await service.readReport(workspaceId, runId, 'MARKET', false)).bytes.toString('utf8');
  const visible = reportVisibleText(html);
  for (const token of ['results-page capture', 'Provenance', 'top-N', 'Metric']) assert.equal(visible.includes(token), false, token);
  assert.deepEqual(visibleTextViolations(visible), []);
  assert.deepEqual(providerNameViolations(html), []);
  assert.match(html, /bảng kết quả tìm kiếm đã lưu/);
  assert.match(html, /Shopee/);
  assert.match(html, /TikTok Shop/);
  assert.match(html, /không có số liệu/);
});

test('a confirmed Market run with no Metric source keeps the manual-export blocker', async t => {
  const { service } = await confirmedCaptureRun(t, 'SKIPPED');
  const run = await service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY');
  assert.ok(run.blockers.some(blocker => blocker.code === 'METRIC_MANUAL_EXPORT_REQUIRED'));
});

test('capture-backed Market presentation passes rules 1, 2, 3, 5, 7, 9 and 11 with reviews skipped for this run', async t => {
  const f = await confirmedCaptureRun(t, 'USE_PREPARED');
  const draft = await f.service.readReport(workspaceId, runId, 'MARKET', false);
  const queued = await f.service.requestReportRevision(workspaceId, runId, {
    contractVersion: 'automation-market-presentation-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
  });
  await f.service.processNext();
  const attempt = await f.service.getReportRevision(workspaceId, runId, queued.attemptId);
  assert.equal(attempt.state, 'COMMITTED');
  const report = await f.service.readReport(workspaceId, runId, 'MARKET', false, attempt.pairId!);
  const html = report.bytes.toString('utf8');
  assert.notEqual(report.versionId, draft.versionId, 'audit the presentation, not the default draft');
  assert.deepEqual((await f.service.readReport(workspaceId, runId, 'MARKET', false)).bytes, draft.bytes);
  const audited = auditMarket14(html);
  for (const rule of ['1', '2', '3', '5', '7', '9', '11']) assert.equal(audited.find(row => row.rule === rule)?.ok, true, `rule ${rule}`);
  assert.deepEqual(audited.filter(rule => rule.kind === 'machine' && !rule.ok), []);
  assert.deepEqual(providerNameViolations(html), []);
  assert.doesNotMatch(reportVisibleText(html), /results-page capture|capture\/\w+\.json|\b[0-9a-f]{64}\b/iu);
  const semantic = JSON.parse((await f.artifacts.read(report.versionId)).toString());
  const logicalPath = (file: unknown): unknown => typeof file === 'object' && file !== null && 'logicalPath' in file ? file.logicalPath : undefined;
  assert.ok(semantic.marketPresentationArtifact, 'the stored revision carries its presentation binding');
  assert.ok(Object.values(semantic.sourceScope.metric.sourceFiles).some(file => logicalPath(file) === 'capture/snapshot.json'),
    'the separate semantic artifact keeps exact archive paths');
  const dom = new JSDOM(html);
  try {
    // Reviews were skipped at scope confirmation, so the reader sees the truth:
    // no shortfall notice, both review types are named as missing in this run,
    // and no listing locator reaches reader text.
    assert.equal(dom.window.document.querySelector('.review-outcome-notice'), null);
    const sources = dom.window.document.querySelector('.market14-sources')!.textContent!;
    assert.match(sources, /Báo cáo chưa có [^.;]*dữ liệu đánh giá sản phẩm/u);
    assert.match(sources, /Báo cáo chưa có [^.;]*dữ liệu bình luận của khách/u);
    assert.doesNotMatch(sources, /Dữ liệu đánh giá sản phẩm trên Shopee|Dữ liệu bình luận của khách trên Shopee/u, 'a skipped review source is not listed as used');
    assert.doesNotMatch(reportVisibleText(dom.window.document), /shopee\.vn|product\/\d/iu, 'a skipped review scope keeps listing locators out of reader text');
    // No owner-accepted classification, so M03 is a source table; the per-platform
    // record-count figure still has to reach the reader, once, drawn by Flint.
    assert.equal(semantic.metricClassified ?? null, null);
    const captions = [...dom.window.document.querySelectorAll('figcaption')].filter(caption => /^Bản ghi sản phẩm — /u.test(caption.textContent!));
    assert.deepEqual(captions.map(caption => [caption.closest('section.sheet')?.id, caption.textContent]), [['M03', 'Bản ghi sản phẩm — Shopee']]);
    assert.equal(captions[0]!.parentElement!.querySelector('.chart')?.getAttribute('data-engine'), 'flint');
  } finally { dom.window.close(); }
  const output = path.join(f.root, 'presented.html');
  await fs.writeFile(output, html);
  const audit = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/audit-market-14.ts', output], { encoding: 'utf8' });
  assert.equal(audit.status, 0, audit.stdout + audit.stderr);
});

test('a capture whose results page lists no shop is presented without a shop count or concentration chart', async t => {
  const f = await confirmedCaptureRun(t, 'USE_PREPARED', false);
  const queued = await f.service.requestReportRevision(workspaceId, runId, {
    contractVersion: 'automation-market-presentation-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
  });
  await f.service.processNext();
  const attempt = await f.service.getReportRevision(workspaceId, runId, queued.attemptId);
  assert.equal(attempt.state, 'COMMITTED');
  const html = (await f.service.readReport(workspaceId, runId, 'MARKET', false, attempt.pairId!)).bytes.toString('utf8');
  const visible = reportVisibleText(html);
  assert.doesNotMatch(visible, /\b1 gian hàng\b|của \d+ gian hàng/u);
  assert.match(visible, /không đếm số gian hàng/u);
  assert.match(visible, /Không có hình mức tập trung theo gian hàng: nguồn không ghi gian hàng/u);
  assert.match(html, /data-market-shops-unrecorded="1"/);
  assert.deepEqual(auditMarket14(html).filter(rule => rule.kind === 'machine' && !rule.ok), []);
});

const presentationRequest = (previousPairId: string, extra: Record<string, unknown> = {}) => ({ contractVersion: 'automation-market-presentation-revision-v1' as const, requestKey: randomUUID(), previousPairId, sources: { metric: { decision: 'KEEP' as const }, nativeReview: { decision: 'KEEP' as const } }, ...extra });
const machineRuleFailures = (html: string): string[] => auditMarket14(html)
  .filter(rule => rule.kind === 'machine' && !rule.ok).map(rule => `${rule.rule}: ${rule.detail}`);

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
  assert.match(draft, new RegExp(`<h3>TikTok Shop<\\/h3><p>Doanh thu quan sát: <strong>9\\.876\\.543\\.210 VND<\\/strong>${CITE}; sản lượng: <strong>không có số liệu<\\/strong>\\. Đây là số của cả tập kết quả theo bộ lọc trên trang\\. Không có dòng phù hợp để tính tổng mẫu trong lượt này\\.`));
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


test('new captures clean both parsers, restore shops, and exclude irrelevant and implausible rows from reports and charts', async t => {
  assert.equal(process.env.TDN_RESEARCH_CAPTURE_RELEVANCE_AI_MODEL, undefined, 'this new capture runs with the model flag unset');
  const snapshot = captureSnapshot();
  snapshot.scope.platforms = ['shopee', 'tiktok'];
  const table = snapshot.groups.W12_topProducts;
  assert.ok(!('absent' in table));
  const base = table.rows[0]!;
  const specs: [string, string, number, number | null][] = [
    ['Synthetic jar A remote Phụ Kiện 7 cánh', 'shopee', 1000000, 10],
    ['TOP 1 SHOPEE BH 2NĂM Synthetic jar B', 'shopee', 2000000, 20],
    ['Hàng Loại 1 Synthetic jar C', 'shopee', 3000000, 30],
    ['Moter Synthetic jar', 'shopee', 9000000, 1],
    ['Power Bank cho Synthetic jar', 'shopee', 8000000, 1],
    ['Synthetic jar D', 'shopee', 57200000, 1],
    ['Synthetic jar E', 'shopee', 2000000, 0],
    ['Synthetic jar F', 'tiktok', 100000000, 1],
    ['Synthetic jar G', 'tiktok', 200000000, 2],
    ['Synthetic jar H', 'tiktok', 300000000, 3],
    ['Dây Synthetic jar', 'tiktok', 70000000, 1],
    ['Synthetic jar I', 'tiktok', 60000000, null],
    ['Synthetic unknown', 'unknown', 1000, 1],
  ];
  table.rows = specs.map(([title, platform, revenue, units], i) => {
    const row = structuredClone(base);
    row.cells.name = { label: 'Tên', text: `${title} 340 reviews Total sold products: 1.496 Created date: 03/2024 Gian hàng Mẫu ${i}`, sourcePointer: `p[${i}].name` };
    row.cells.shop = { label: 'Gian hàng', text: i === 1 ? 'Gian hàng riêng' : '', sourcePointer: `p[${i}].shop` };
    row.cells.platform = { label: 'Sàn', text: platform, sourcePointer: `p[${i}].platform` };
    row.cells.revenue = { label: 'Doanh thu', displayed: String(revenue), value: revenue, unit: 'VND', precision: 'exact', platform: platform as 'shopee', period, sourcePointer: `p[${i}].revenue` };
    row.cells.units = { label: 'Lượt bán', displayed: units === null ? '–' : String(units), value: units, unit: 'COUNT', precision: 'exact', platform: platform as 'shopee', period, sourcePointer: `p[${i}].units` };
    return row;
  });
  const f = await confirmedCaptureRun(t, 'USE_PREPARED', true, snapshot);
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const draft = await f.service.readReport(workspaceId, runId, 'MARKET');
  const semantic = JSON.parse((await f.artifacts.read(draft.versionId)).toString('utf8'));
  const methods = semantic.metricMethods as AutomationMetricMethodSnapshot;
  assert.equal(methods.result.input.profileId, CAPTURE_ROW_PROFILE_V2);
  assert.equal(methods.capture!.rowPolicyVersion, CAPTURE_ROW_PROFILE_V2);
  assert.equal(methods.capture!.relevance, undefined, 'flag-off captures retain no AI relevance record');
  assert.equal(methods.capture!.excludedRows!.length, 6);
  // Exact outputs for this synthetic input on main 71128df977bdca765486a61455e6b1be87de1dd0.
  // JSON is canonicalized; HTML and SVG content are compared without normalization.
  assert.equal(hash(Buffer.from(canonicalJson(methods.capture!.excludedRows))),
    'e28d55ac60bb9bc6ab1fb9b1fa513b2be805ae12eea75e09785cb1368b38102c', 'excluded rows match main');
  const configFile = f.db.prepare("SELECT artifact_sha256 sha FROM foundation_source_package_files WHERE package_id=? AND logical_path='methods/metric-run.json'").get(methods.sourcePackage.packageId) as { sha: string };
  const config = JSON.parse((await f.artifacts.read(configFile.sha)).toString());
  const bridge = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts, workspaces: new FlowDiscoveryWorkspaceReader(f.discovery), now });
  assert.deepEqual(await bridge.verify(methods, config.input), methods);
  const tampered = structuredClone(methods);
  (tampered.capture!.excludedRows![0] as { reason: string }).reason = 'UNIT_REVENUE_OUTLIER';
  await assert.rejects(bridge.verify(tampered, config.input), /provenance or row attribution/);
  const withoutPolicy = structuredClone(methods);
  delete (withoutPolicy.capture as { rowPolicyVersion?: string }).rowPolicyVersion;
  await assert.rejects(bridge.verify(withoutPolicy, config.input), /provenance or row attribution/);

  assert.deepEqual(methods.capture!.platforms.map(({result}) => result.scopes.find(scope => scope.key === 'all')!.revenue.value), ['6000000', '600000000']);
  assert.deepEqual(methods.capture!.platforms.map(({result}) => result.scopes.find(scope => scope.key === 'all')!.shopCount), [3, 3]);
  const parsed = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], methods.capture!.rowPolicyVersion!);
  assert.equal(parsed.excluded.length, 6);
  assert.equal(parsed.unattributed.length, 1);
  assert.deepEqual(parsed.rows.map(row => row.title), methods.capture!.platforms.flatMap(({result}) => result.input.records.map(row => row.title)));
  assert.deepEqual(parsed.rows.map(row => row.listing), methods.capture!.platforms.flatMap(({result}) => result.input.records.map(row => row.listingId)));
  assert.equal(parsed.rows[0]!.units, 10, 'lifetime sold is never substituted for period units');
  assert.equal(parsed.rows[1]!.shopName, 'Gian hàng riêng');
  assert.equal(parsed.rows[0]!.shopName, 'Gian hàng Mẫu 0');
  assert.equal(hash(Buffer.from(canonicalJson(parsed))),
    'a52d86c92567a9bb50701e1676c86557fa5f99761e316e07ed8def991b710b56', 'reader rows, exclusions and unattributed rows match main');
  const html = draft.bytes.toString('utf8');
  assert.doesNotMatch(html, /reviews|Total sold products|Created date|nguồn không ghi gian hàng/iu);
  const dom = new JSDOM(html);
  try {
    const lines = [...dom.window.document.querySelectorAll('#M03 p')].map(p => p.textContent!).filter(text => text.startsWith('Đã loại'));
    assert.equal(lines.length, 2);
    assert.match(lines[0]!, /Đã loại 2 dòng không phải sản phẩm chính.*và 2 dòng có doanh thu/);
    assert.match(lines[1]!, /Đã loại 1 dòng không phải sản phẩm chính.*và 1 dòng có doanh thu/);
    for (const line of lines) assert.doesNotMatch(line, /0|%|Metric|Google/);
    assert.equal(hash(Buffer.from(canonicalJson(lines))),
      'b059f5840126fceca8da3312af7a04663e717b4302f4d833d3b3c1f774fa2364', 'M03 exclusion lines match main');
  } finally { dom.window.close(); }
  const source = marketChartSource([], methods);
  const charts = await renderMarketCharts(source.rows, { ...source, flint: false });
  assert.ok(charts.some(chart => chart.kind === 'concentration'));
  assert.match(charts.find(chart => chart.kind === 'product-ranking')!.svg, /Synthetic jar/);
  assert.doesNotMatch(charts.map(chart => chart.svg).join(''), /Moter|Power Bank|reviews/);
  assert.equal(hash(Buffer.from(canonicalJson(charts))),
    'ffe7c87f4a0b88fd8399f474a874f9f8527459604bc9b6d584c9e85845421182', 'chart metadata and SVG bytes match main');
  const queued = await f.service.requestReportRevision(workspaceId, runId, {
    contractVersion: 'automation-market-presentation-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
  });
  await f.service.processNext();
  const attempt = await f.service.getReportRevision(workspaceId, runId, queued.attemptId);
  assert.equal(attempt.state, 'COMMITTED');
  const presented = (await f.service.readReport(workspaceId, runId, 'MARKET', false, attempt.pairId!)).bytes.toString();
  assert.match(presented, /Mức tập trung doanh thu theo gian hàng/);
  assert.doesNotMatch(presented, /reviews|Total sold products|Created date|nguồn không ghi gian hàng/iu);

  const build = await f.service.buildReaderReport(workspaceId, runId, {
    contractVersion: 'reader-report-build-v1.1', requestKey: '77777777-7777-4777-8777-777777777777', metricPackageId: methods.originalSourcePackage.packageId,
    platforms: ['shopee', 'tiktok'], profile, cover: null, webSnapshot: snapshot, webSnapshotSha256: webSnapshotDigest(snapshot),
  }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const recordRow = f.db.prepare('SELECT input_sha256 inputSha FROM analysis_reader_report_revisions WHERE revision_id=?').get(build.revision.revisionId) as { inputSha: string };
  const record = JSON.parse((await f.artifacts.read(recordRow.inputSha)).toString());
  assert.equal(record.captureRowPolicy, CAPTURE_ROW_PROFILE_V2);
  assert.equal(record.captureExcludedRows.length, 6);
  assert.deepEqual(record.input.rows, parsed.rows);
  assert.deepEqual(record.captureExcludedRows, parsed.excluded);
  assert.deepEqual(record.defaultMarketPeers.input.records.map((row: { title: string }) => row.title), parsed.rows.map(row => row.title));
  const readerHtml = (await f.service.readReaderReport(workspaceId, runId, build.revision.revisionId)).bytes.toString('utf8');
  assert.doesNotMatch(readerHtml, /reviews|Total sold products|Created date|nguồn không ghi gian hàng/iu);
  assert.match(readerHtml, /Shopee: Đã loại 2 dòng/);
  assert.match(readerHtml, /TikTok Shop: Đã loại 1 dòng/);
  assert.equal((readerHtml.match(/Shopee: Đã loại/g) ?? []).length, 1);
  assert.equal((readerHtml.match(/TikTok Shop: Đã loại/g) ?? []).length, 1);
  assert.deepEqual(reportVisibleText(readerHtml).match(/.{0,45}%.{0,45}/gu) ?? [], []);
  assert.deepEqual((await f.service.readReaderReport(workspaceId, runId, build.revision.revisionId)).bytes, Buffer.from(readerHtml));
  assert.equal(hash(Buffer.from(readerHtml)),
    '5330ea7e8f960f28becf0c417999e660ec76274c899af89eb1a380e776eb39f9', 'reader HTML bytes match main');
});

for (const item of ['jar', 'slipper', 'biscuit']) test(`a new ${item} capture with the configured fake classifier freezes v3 through reader build and replay`, async t => {
  const snapshot = captureSnapshot();
  const keyword = `synthetic ${item}`;
  const title = (suffix: string) => suffix === 'main' ? `Synthetic ${item} main` : suffix === 'unsure' ? `Sleeve dùng cho synthetic ${item}` : `Pouch tặng synthetic ${item}`;
  snapshot.scope.keywords = [keyword];
  snapshot.scope.platforms = ['shopee', 'tiktok'];
  const table = snapshot.groups.W12_topProducts;
  assert.ok(!('absent' in table));
  const base = table.rows[0]!;
  const specs = [
    [title('main'), 'shopee'], [title('unsure'), 'shopee'],
    [title('rival'), 'shopee'], [title('main'), 'tiktok'],
  ] as const;
  table.rows = specs.map(([title, platform], i) => {
    const row = structuredClone(base);
    row.cells.name = { label: 'Tên', text: title, sourcePointer: `p[${i}].name` };
    row.cells.platform = { label: 'Sàn', text: platform, sourcePointer: `p[${i}].platform` };
    for (const key of ['revenue', 'units']) {
      const cell = row.cells[key]!;
      assert.ok('value' in cell);
      cell.platform = platform;
      cell.sourcePointer = `p[${i}].${key}`;
    }
    return row;
  });
  let calls = 0;
  // Inject the configured flag-on dependency directly; no transport or model runs.
  const ai: CaptureRelevanceAi = { configuration: captureRelevanceConfiguration('synthetic-jar-model'), classifier: { async classify({ keyword, items }) {
    calls++;
    assert.equal(keyword, `synthetic ${item}`);
    assert.deepEqual(items.map(item => item.title), [title('main'), title('unsure'), title('rival')]);
    return items.map(({ id, title }) => ({ id, label: title.startsWith('Pouch') ? 'NOT_MAIN' : title.startsWith('Sleeve') ? 'UNSURE' : 'MAIN' }));
  } } };
  const f = await confirmedCaptureRun(t, 'USE_PREPARED', true, snapshot, ai);
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const draft = await f.service.readReport(workspaceId, runId, 'MARKET');
  const methods = JSON.parse((await f.artifacts.read(draft.versionId)).toString()).metricMethods as AutomationMetricMethodSnapshot;
  assert.equal(methods.result.input.profileId, CAPTURE_ROW_PROFILE);
  assert.equal(methods.capture!.rowPolicyVersion, CAPTURE_ROW_PROFILE);
  assert.equal(calls, 1);
  assert.deepEqual(methods.capture!.relevance!.decisions.map(row => row.label), ['MAIN', 'UNSURE', 'NOT_MAIN']);
  assert.deepEqual(methods.capture!.excludedRows!.map(row => [row.title, row.reason]), [[title('rival'), 'NOT_MAIN_PRODUCT']]);
  assert.deepEqual(methods.capture!.platforms.flatMap(({ platform, result }) => result.input.records.map(row => [platform, row.title])), [
    ['shopee', title('main')], ['shopee', title('unsure')], ['tiktok', title('main')],
  ]);
  const parsed = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], methods.capture!.rowPolicyVersion!, methods.capture!.relevance);
  const configFile = f.db.prepare("SELECT artifact_sha256 sha FROM foundation_source_package_files WHERE package_id=? AND logical_path='methods/metric-run.json'").get(methods.sourcePackage.packageId) as { sha: string };
  const config = JSON.parse((await f.artifacts.read(configFile.sha)).toString());
  const replay = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts, workspaces: new FlowDiscoveryWorkspaceReader(f.discovery), now });
  assert.deepEqual(await replay.verify(methods, config.input), methods);
  assert.deepEqual(await replay.execute(config.input), methods, 'replay keeps the frozen v3 labels after the classifier is removed');
  const build = await f.service.buildReaderReport(workspaceId, runId, {
    contractVersion: 'reader-report-build-v1.1', requestKey: '77777777-7777-4777-8777-777777777777', metricPackageId: methods.originalSourcePackage.packageId,
    platforms: ['shopee', 'tiktok'], profile, cover: null, webSnapshot: snapshot, webSnapshotSha256: webSnapshotDigest(snapshot),
  }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const saved = f.db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE revision_id=?').get(build.revision.revisionId) as { sha: string };
  const record = JSON.parse((await f.artifacts.read(saved.sha)).toString());
  assert.equal(record.captureRowPolicy, CAPTURE_ROW_PROFILE);
  assert.deepEqual(record.input.rows, parsed.rows);
  assert.deepEqual(record.captureExcludedRows, parsed.excluded);
  const reader = await f.service.readReaderReport(workspaceId, runId, build.revision.revisionId);
  assert.doesNotMatch(reportVisibleText(reader.bytes.toString()), new RegExp(`Pouch tặng synthetic ${item}|synthetic-jar-model`, 'u'));
  assert.deepEqual((await f.service.readReaderReport(workspaceId, runId, build.revision.revisionId)).bytes, reader.bytes);
  assert.equal(calls, 1, 'verification, reader build and reads never classify again');
});

test('one shop\'s separate listings that share a cleaned title both stay in the capture methods and the reader rows', async t => {
  const snapshot = captureSnapshot();
  snapshot.scope.platforms = ['shopee', 'tiktok'];
  const table = snapshot.groups.W12_topProducts;
  assert.ok(!('absent' in table));
  const base = table.rows[0]!;
  const specs: [string, string, number, number][] = [
    ['shopee', 'Synthetic jar A 12 reviews Total sold products: 40 Created date: 02/2025 Gian hàng Mẫu', 1000000, 10],
    ['tiktok', 'Synthetic jar B 545 reviews Total sold products: 1.496 Created date: 08/2025 Gian hàng Trùng', 3000000, 30],
    ['tiktok', 'Synthetic jar C 9 reviews Total sold products: 20 Created date: 01/2026 Gian hàng Khác', 2000000, 20],
    ['tiktok', 'Synthetic jar B 15 reviews Total sold products: 31 Created date: 06/2026 Gian hàng Trùng', 1000000, 10],
  ];
  table.rows = specs.map(([platform, name, revenue, units], i) => {
    const row = structuredClone(base);
    row.cells.name = { label: 'Tên', text: name, sourcePointer: `p[${i}].name` };
    row.cells.shop = { label: 'Gian hàng', text: '', sourcePointer: `p[${i}].shop` };
    row.cells.platform = { label: 'Sàn', text: platform, sourcePointer: `p[${i}].platform` };
    row.cells.revenue = { label: 'Doanh thu', displayed: String(revenue), value: revenue, unit: 'VND', precision: 'exact', platform: platform as 'shopee', period, sourcePointer: `p[${i}].revenue` };
    row.cells.units = { label: 'Lượt bán', displayed: String(units), value: units, unit: 'COUNT', precision: 'exact', platform: platform as 'shopee', period, sourcePointer: `p[${i}].units` };
    return row;
  });
  const f = await confirmedCaptureRun(t, 'USE_PREPARED', true, snapshot);
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const draft = await f.service.readReport(workspaceId, runId, 'MARKET');
  const semantic = JSON.parse((await f.artifacts.read(draft.versionId)).toString('utf8'));
  assert.equal(semantic.metricMethodsFailure, undefined);
  const methods = semantic.metricMethods as AutomationMetricMethodSnapshot;
  const tiktok = methods.capture!.platforms.find(({platform}) => platform === 'tiktok')!.result;
  assert.deepEqual(tiktok.input.records.map(row => [row.title, row.shopId]),
    [['Synthetic jar B', 'Gian hàng Trùng'], ['Synthetic jar C', 'Gian hàng Khác'], ['Synthetic jar B', 'Gian hàng Trùng']]);
  const ids = tiktok.input.records.map(row => row.listingId);
  assert.equal(new Set(ids).size, 3, 'the repeated title and shop keep two listing identities');
  assert.equal(tiktok.scopes.find(scope => scope.key === 'all')!.revenue.value, '6000000');
  const configFile = f.db.prepare("SELECT artifact_sha256 sha FROM foundation_source_package_files WHERE package_id=? AND logical_path='methods/metric-run.json'").get(methods.sourcePackage.packageId) as { sha: string };
  const config = JSON.parse((await f.artifacts.read(configFile.sha)).toString());
  const bridge = new AutomationMetricMethodBridge({ db: f.db, artifactStore: f.artifacts, workspaces: new FlowDiscoveryWorkspaceReader(f.discovery), now });
  assert.deepEqual(await bridge.verify(methods, config.input), methods);
  const parsed = readerRowsFromMetricCapture(snapshot, ['shopee', 'tiktok'], CAPTURE_ROW_PROFILE);
  assert.deepEqual(parsed.rows.map(row => row.listing), methods.capture!.platforms.flatMap(({result}) => result.input.records.map(row => row.listingId)));
  const build = await f.service.buildReaderReport(workspaceId, runId, {
    contractVersion: 'reader-report-build-v1.1', requestKey: randomUUID(), metricPackageId: methods.originalSourcePackage.packageId,
    platforms: ['shopee', 'tiktok'], profile, cover: null, webSnapshot: snapshot, webSnapshotSha256: webSnapshotDigest(snapshot),
  }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const recordRow = f.db.prepare('SELECT input_sha256 inputSha FROM analysis_reader_report_revisions WHERE revision_id=?').get(build.revision.revisionId) as { inputSha: string };
  const record = JSON.parse((await f.artifacts.read(recordRow.inputSha)).toString());
  assert.equal(record.defaultMarketPeers.input.records.filter((row: { title: string }) => row.title === 'Synthetic jar B').length, 2);
});

for (const emptyAll of [false, true]) test(`filtered capture retains an honest ${emptyAll ? 'empty sample' : 'empty platform'}`, async t => {
  const snapshot = captureSnapshot();
  snapshot.scope.platforms = ['shopee', 'tiktok'];
  if (emptyAll) for (const item of snapshot.groups.W3_platformSplit) {
    item.revenue = { ...item.revenue, value: null, displayed: '–' };
  }
  const table = snapshot.groups.W12_topProducts;
  assert.ok(!('absent' in table));
  const base = table.rows[0]!;
  table.rows = ['shopee', 'tiktok'].map((platform, i) => {
    const row = structuredClone(base);
    row.cells.name = { label: 'Tên', text: emptyAll || i === 1 ? 'Motor Synthetic jar' : 'Synthetic jar', sourcePointer: `p[${i}].name` };
    row.cells.platform = { label: 'Sàn', text: platform, sourcePointer: `p[${i}].platform` };
    for (const key of ['revenue', 'units']) {
      const cell = row.cells[key]!;
      assert.ok('value' in cell);
      cell.platform = platform as 'shopee' | 'tiktok';
      cell.sourcePointer = `p[${i}].${key}`;
    }
    return row;
  });
  const f = await confirmedCaptureRun(t, 'USE_PREPARED', true, snapshot);
  const draft = await f.service.readReport(workspaceId, runId, 'MARKET');
  const semantic = JSON.parse((await f.artifacts.read(draft.versionId)).toString());
  const methods = semantic.metricMethods as AutomationMetricMethodSnapshot;
  assert.equal(methods.capture!.platforms.find(p => p.platform === 'tiktok')!.result.scopes[0]!.revenue.value, null);
  assert.doesNotMatch(reportVisibleText(draft.bytes.toString()), /Motor Synthetic jar|khỏi tổng/u);
  const build = await f.service.buildReaderReport(workspaceId, runId, {
    contractVersion: 'reader-report-build-v1.1', requestKey: randomUUID(), metricPackageId: methods.originalSourcePackage.packageId,
    platforms: ['shopee', 'tiktok'], profile, cover: null, webSnapshot: snapshot, webSnapshotSha256: webSnapshotDigest(snapshot),
  }, { actorId: 'owner:synthetic', role: 'OWNER' });
  const reader = (await f.service.readReaderReport(workspaceId, runId, build.revision.revisionId)).bytes.toString();
  assert.match(reportVisibleText(reader), /TikTok Shop: không có dòng phù hợp/u);
  const readerDom = new JSDOM(reader);
  try {
    // Source quotes and locators such as detail[0].name are evidence, not empty states.
    for (const node of readerDom.window.document.querySelectorAll('[data-quote], .citation-register')) node.remove();
    assert.deepEqual(reportVisibleText(readerDom.window.document).match(/.{0,45}(?:%|(?<![\p{L}\p{N}.,])0(?![\p{L}\p{N}.,])).{0,45}/gu) ?? [], []);
  } finally { readerDom.window.close(); }
  assert.doesNotMatch(reportVisibleText(reader), /Motor Synthetic jar|Sản phẩm trên trang|khỏi tổng/u);
  const row = f.db.prepare('SELECT input_sha256 sha FROM analysis_reader_report_revisions WHERE revision_id=?').get(build.revision.revisionId) as { sha: string };
  const record = JSON.parse((await f.artifacts.read(row.sha)).toString());
  assert.equal(record.input.rows.length, emptyAll ? 0 : 1);
  if (emptyAll) {
    const { captureRowPolicy: _policy, ...legacyInput } = record.input;
    assert.throws(() => verifyReaderReportInput(legacyInput), /rows/u, 'unversioned empty inputs still fail closed');
  }
  const queued = await f.service.requestReportRevision(workspaceId, runId, {
    contractVersion: 'automation-market-presentation-revision-v1', requestKey: randomUUID(), previousPairId: f.pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
  });
  await f.service.processNext();
  const attempt = await f.service.getReportRevision(workspaceId, runId, queued.attemptId);
  assert.equal(attempt.state, 'COMMITTED');
  const presented = (await f.service.readReport(workspaceId, runId, 'MARKET', false, attempt.pairId!)).bytes.toString();
  assert.deepEqual(reportVisibleText(presented).match(/.{0,45}(?:%|(?<![\p{L}\p{N}.,])0(?![\p{L}\p{N}.,])).{0,45}/gu) ?? [], []);
  assert.deepEqual(auditMarket14(presented).filter(rule => rule.kind === 'machine' && !rule.ok), []);
});
