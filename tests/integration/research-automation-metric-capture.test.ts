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
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { ResearchAutomationValidationError } from '../../src/modules/analysis/research-automation/model.js';
import { JSDOM } from 'jsdom';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import type { ShopeeCollectorFactory } from '../../src/modules/analysis/research-automation/exact-shopee-bridge.js';
import { auditMarket14 } from '../../src/modules/analysis/research-automation/market-14-rules.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { providerNameViolations, reportVisibleText, visibleTextViolations } from '../helpers/report-visible-text.js';

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
async function confirmedCaptureRun(t: TestContext, decision: 'USE_PREPARED' | 'SKIPPED', partialReviews = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `tdn-metric-capture-209-${decision.toLowerCase()}-`));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: `metric-capture-209-${decision.toLowerCase()}`, title: 'Synthetic Metric capture confirmation' });
  let collectionCalls = 0;
  const shopeeCollectorFactory: ShopeeCollectorFactory = () => ({ requestsIssued: () => 1,
    collector: { mode: 'fixture', collect: async (...args) => {
      collectionCalls++;
      return new FixtureShopeeCollector(Buffer.from(JSON.stringify([
        { shopId: '100', itemId: '200', reviewId: 'synthetic-review', comment: 'Lời đánh giá giả lập.', ratingStar: 5 },
      ]))).collect(...args);
    } } });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now, readerReportFlint: false,
    ...(partialReviews ? { shopeeCollectorFactory } : {}), renderer: buildResearchAutomationReport });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const archive = captureArchive(captureSnapshot());
  const receipt = await service.prepareMetricCapture(workspaceId, runId, { contractVersion: 'automation-metric-capture-prepare-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', expectedRevision: awaiting.revision, sourceContext: 'Synthetic capture fixture' },
  archive.snapshotBytes, archive.manifestBytes);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [], peerProductIds: [],
    ...(partialReviews ? { exactShopeeUrls: ['https://shopee.vn/product/100/200', 'https://shopee.vn/product/100/201'] } : {}),
    sources: { metric: decision === 'USE_PREPARED' ? { decision: 'USE_PREPARED', packageId: receipt.packageId } : { decision: 'SKIPPED' }, nativeReview: partialReviews ? 'AUTO_REUSE' : 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  const pair = (await service.listReportVersions(workspaceId, runId))[0]!;
  return { service, artifacts, pair, root, collectionCalls: () => collectionCalls };
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

test('capture-backed Market presentation passes rules 1, 2, 3, 5, 7, 9 and 11 with absent or partial reviews', async t => {
  for (const partialReviews of [false, true]) await t.test(partialReviews ? 'partial reviews' : 'absent reviews', async t => {
    const f = await confirmedCaptureRun(t, 'USE_PREPARED', partialReviews);
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
    assert.ok(semantic.marketPresentationArtifact, 'the stored revision carries its presentation binding');
    assert.ok(Object.values(semantic.sourceScope.metric.sourceFiles).some((file: any) => file?.logicalPath === 'capture/snapshot.json'),
      'the separate semantic artifact keeps exact archive paths');
    const dom = new JSDOM(html);
    try {
      const notice = dom.window.document.querySelector('.review-outcome-notice');
      if (partialReviews) {
        assert.ok(notice);
        assert.deepEqual([...notice.querySelectorAll('li a')].map(link => [link.textContent, link.getAttribute('href')]),
          [['Sản phẩm #1', 'https://shopee.vn/product/100/201']]);
        assert.match(notice.textContent!, /0\/300 bình luận/);
        assert.doesNotMatch(notice.textContent!, /https?:|product\/\d|shopee\.vn/);
      } else {
        assert.equal(notice, null);
        assert.match(dom.window.document.querySelector('.market14-sources')!.textContent!, /Bình luận đã thu thậpChưa có trong lượt này/);
      }
    } finally { dom.window.close(); }
    assert.equal(f.collectionCalls(), partialReviews ? 1 : 0, 'presentation never recollects reviews');
    const output = path.join(f.root, 'presented.html');
    await fs.writeFile(output, html);
    const audit = spawnSync('./node_modules/.bin/tsx', ['scripts/audit-market-14.ts', output], { encoding: 'utf8' });
    assert.equal(audit.status, 0, audit.stdout + audit.stderr);
  });
});
