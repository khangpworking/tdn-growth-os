import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { readerLimitationsFromDraft, type ReaderRowsReader } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { ReaderMetricRowsError, readerRowsFromMetricWorkbook } from '../../src/modules/analysis/reader-report/metric-rows.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };

function workbook(cells: Record<string, unknown> = {}): Buffer {
  const generated = spawnSync('python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  return generated.stdout;
}

const profile = {
  slug: 'synthetic-jar', product: 'Hũ thử nghiệm', status: 'proposed',
  segments: { S1: 'Hũ nhỏ', N1: 'Hàng khác' }, short: { S1: 'Nhỏ' }, core: ['S1'], non: ['N1'],
  rules: [{ seg: 'S1', when: {} }], signals: [],
};
const source = (start = period.startDate) => ({
  measurementPeriod: { start, end: period.endDate }, rowCap: 5000,
  displayedHeadlines: { revenueVnd: 200, soldListings: 2, shops: 2, units: 4 },
  platformBreakdown: { shopee: { displayedRevenueVnd: 200 } },
});

async function readyRun(t: TestContext, rows?: ReaderRowsReader) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-reader-report-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'reader-report', title: 'Synthetic reader report' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now,
    readerReportFlint: false, ...(rows ? { readerRows: rows } : {}) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const scope = { definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  const prepared = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1',
    requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision, scope,
    sourceLabel: 'Synthetic operator export', sourceContext: 'Keyword export; filters not independently verified.',
    measurementPeriod: { ...period, basis: 'Operator-declared export range, not authenticated' },
    selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' } }, workbook());
  const build = (requestKey: string, extra: Record<string, unknown> = {}) => ({ contractVersion: 'reader-report-build-v1', requestKey,
    metricPackageId: prepared.packageId, platforms: ['shopee'], profile, cover: null, source: source(), ...extra });
  // A run that is not DRAFT_READY never gets a reader page.
  await assert.rejects(service.buildReaderReport(workspaceId, runId, build('early-build-key'), owner), /bản nháp đã sẵn sàng/);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  return { db, service, build, packageId: prepared.packageId };
}

const decide = (requestKey: string, revisionId: string, decision: 'APPROVED' | 'REJECTED', reason: string | null = null) =>
  ({ contractVersion: 'reader-report-decision-v1', requestKey, revisionId, decision, reason });

test('reader page restates a ready draft: exact retry, deterministic rebuild, latest-only decisions and immutable rows', async t => {
  const f = await readyRun(t);
  const first = await f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0001'), owner);
  assert.equal(first.exactRetry, false);
  assert.equal(first.revision.revisionNumber, 1);
  assert.equal(first.revision.state, 'PENDING_OWNER_REVIEW');
  assert.deepEqual(first.revision.platforms, ['shopee']);
  const retry = await f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0001'), owner);
  assert.deepEqual(retry, { ...first, exactRetry: true });
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0001', { platforms: ['shopee', 'tiktok'] }), owner),
    (error: Error & { code?: string }) => error.code === 'request_key_conflict');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0002', { source: source('2025-12-31') }), owner),
    /Kỳ số liệu khai báo khác kỳ của tệp/);
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0003', { platforms: ['shopee', 'tiktok'],
    source: { ...source(), platformBreakdown: { shopee: { displayedRevenueVnd: 150 }, tiktok: { displayedRevenueVnd: 50 } } } }), owner),
  /không dùng được cho bản đọc \(tiktok\)/, 'a declared marketplace with no rows fails closed');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0004', { metricPackageId: '99999999-9999-4999-8999-999999999999' }), owner),
    /không thuộc lượt research/);

  const page = await f.service.readReaderReport(workspaceId, runId, first.revision.revisionId);
  const html = page.bytes.toString('utf8');
  assert.match(html, /Hũ thử nghiệm/);
  assert.match(html, /Phân loại sản phẩm do AI đề xuất, chưa được chủ duyệt\./);
  assert.doesNotMatch(html, /Metric|Kalodata|TradeInt|Dami/i, 'the reader page never names a data provider');

  const second = await f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0005'), owner);
  assert.equal(second.revision.revisionNumber, 2);
  assert.equal(second.revision.htmlSha256, first.revision.htmlSha256, 'same draft, file and profile rebuild the same page bytes');
  const listed = await f.service.listReaderReports(workspaceId, runId);
  assert.deepEqual(listed.revisions.map(r => r.state), ['SUPERSEDED', 'PENDING_OWNER_REVIEW']);

  await assert.rejects(f.service.decideReaderReport(workspaceId, runId, decide('decide-key-0001', first.revision.revisionId, 'APPROVED'), owner),
    (error: Error & { code?: string }) => error.code === 'revision_conflict' && /bản đọc mới hơn/.test(error.message));
  const rejected = await f.service.decideReaderReport(workspaceId, runId, decide('decide-key-0002', second.revision.revisionId, 'REJECTED', '  Sai nhóm sản phẩm  '), owner);
  assert.equal(rejected.exactRetry, false);
  assert.equal(rejected.revision.state, 'REJECTED');
  assert.equal(rejected.revision.decision?.reason, 'Sai nhóm sản phẩm');
  assert.deepEqual(await f.service.decideReaderReport(workspaceId, runId, decide('decide-key-0002', second.revision.revisionId, 'REJECTED', 'Sai nhóm sản phẩm'), owner),
    { ...rejected, exactRetry: true });
  await assert.rejects(f.service.decideReaderReport(workspaceId, runId, decide('decide-key-0002', second.revision.revisionId, 'APPROVED'), owner),
    (error: Error & { code?: string }) => error.code === 'request_key_conflict');
  await assert.rejects(f.service.decideReaderReport(workspaceId, runId, decide('decide-key-0003', second.revision.revisionId, 'APPROVED'), owner),
    /đã có quyết định/);

  const third = await f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0006', { profile: { ...profile, status: 'approved' } }), owner);
  assert.equal(third.revision.profileStatus, 'approved');
  assert.doesNotMatch((await f.service.readReaderReport(workspaceId, runId, third.revision.revisionId)).bytes.toString('utf8'), /do AI đề xuất, chưa được chủ duyệt/);
  const approved = await f.service.decideReaderReport(workspaceId, runId, decide('decide-key-0004', third.revision.revisionId, 'APPROVED'), owner);
  assert.equal(approved.revision.state, 'APPROVED');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('build-key-0007'), owner), /Bản đọc mới nhất đã được chủ duyệt\./);
  assert.deepEqual((await f.service.listReaderReports(workspaceId, runId)).revisions.map(r => r.state), ['SUPERSEDED', 'REJECTED', 'APPROVED']);

  for (const sql of ["UPDATE analysis_reader_report_revisions SET actor_id='x'", 'DELETE FROM analysis_reader_report_revisions',
    "UPDATE analysis_reader_report_decisions SET reason='x'", 'DELETE FROM analysis_reader_report_decisions'])
    assert.throws(() => f.db.prepare(sql).run(), /immutable_reader_report/);
  assert.throws(() => f.db.prepare(`INSERT INTO analysis_reader_report_decisions(revision_id,run_id,decision,request_key,reason,actor_id,decided_at)
    VALUES (?,?,'APPROVED','decide-key-raw1',NULL,'owner:x','2026-02-01T00:00:00.000Z')`).run(first.revision.revisionId, runId), /requires_latest_revision/);
  await assert.rejects(f.service.readReaderReport(workspaceId, runId, '99999999-9999-4999-8999-999999999999'), /Không tìm thấy bản đọc/);
});

test('reader build reads both marketplaces from one combined file and only accepts an OWNER actor', async t => {
  const rows: ReaderRowsReader = (bytes, platforms) => readerRowsFromMetricWorkbook(workbook({ J3: { type: 's', value: '8__102__20' } }), platforms)
    .map(row => ({ ...row, units: row.units || 1 }));
  const f = await readyRun(t, rows);
  const body = f.build('build-key-both', { platforms: ['tiktok', 'shopee'],
    source: { ...source(), platformBreakdown: { shopee: { displayedRevenueVnd: 120 }, tiktok: { displayedRevenueVnd: 60 } } } });
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, body, { actorId: ' ', role: 'OWNER' }), /OWNER actor/);
  const built = await f.service.buildReaderReport(workspaceId, runId, body, owner);
  assert.deepEqual(built.revision.platforms, ['shopee', 'tiktok'], 'platforms are stored in one canonical order');
  assert.match((await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes.toString('utf8'), /TikTok Shop/);
});

test('combined product-list rows split by product-code prefix and fail closed on unknown or undeclared marketplaces', () => {
  const rows = readerRowsFromMetricWorkbook(workbook({ J3: { type: 's', value: '8__102__20' } }), ['shopee', 'tiktok']);
  assert.deepEqual(rows.map(r => [r.i, r.platform, r.listing, r.rev, r.units]), [[0, 'shopee', '1__101__10', 100, 2], [1, 'tiktok', '8__102__20', 50, 0]]);
  assert.equal(rows[0]!.asp, 50);
  assert.equal(rows[1]!.asp, 0, 'zero units never divide');
  const code = (fn: () => unknown) => { try { fn(); } catch (error) { assert.ok(error instanceof ReaderMetricRowsError); return `${error.code} ${error.locator}`; } return 'none'; };
  assert.equal(code(() => readerRowsFromMetricWorkbook(workbook({ J2: { type: 's', value: '5__101__10' } }), ['shopee'])), 'UNKNOWN_PLATFORM_PREFIX Sheet1!J2');
  assert.equal(code(() => readerRowsFromMetricWorkbook(workbook({ J3: { type: 's', value: '8__102__20' } }), ['shopee'])), 'UNDECLARED_PLATFORM Sheet1!J3');
  assert.equal(code(() => readerRowsFromMetricWorkbook(workbook(), ['shopee', 'tiktok'])), 'DECLARED_PLATFORM_HAS_NO_ROWS tiktok');
  assert.equal(code(() => readerRowsFromMetricWorkbook(workbook({ A1: { type: 's', value: 'wrong header' } }), ['shopee'])), 'HEADER_MISMATCH Sheet1!A1:T1');
});

test('limits carried from the draft are restated in plain words without section codes', () => {
  const lines = readerLimitationsFromDraft({ sections: [{ sectionId: 'M05', state: 'BLOCKED' }, { sectionId: 'M01', state: 'READY' }, { sectionId: 'M10', state: 'BLOCKED' }],
    collectionOutcome: 'PARTIAL', limitations: [] }, 'proposed');
  assert.deepEqual(lines, [
    'Bản nháp tự động chưa đủ dữ liệu cho các phần: Nhu cầu; Dự báo và kịch bản. Bản đọc chỉ nói tới phần đó trong giới hạn của tệp danh sách sản phẩm.',
    'Lượt thu dữ liệu tự động chưa thu đủ mọi nguồn; bản đọc chỉ dùng tệp danh sách sản phẩm đã gắn vào lượt.',
    'Phân loại sản phẩm do AI đề xuất, chưa được chủ duyệt.',
  ]);
  assert.deepEqual(readerLimitationsFromDraft({ sections: [], collectionOutcome: 'SUCCEEDED', limitations: [] }, 'approved'), []);
  assert.doesNotMatch(lines.join(' '), /M\d\d/);
});
