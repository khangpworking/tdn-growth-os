import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import http from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openResearchAutomationApi } from '../../src/api/research-automation-api.js';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { readerLimitationsFromDraft, type ReaderRowsReader } from '../../src/modules/analysis/research-automation/reader-report-revisions.js';
import { webSnapshotDigest } from '../../src/modules/analysis/reader-report/web-facts.js';
import { ReaderMetricRowsError, readerRowsFromMetricWorkbook } from '../../src/modules/analysis/reader-report/metric-rows.js';
import { DEFAULT_MARKET_PEER_RULE, verifyDefaultMarketPeers } from '../../src/modules/analysis/default-market-peers.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { unitPriceFixture } from '../helpers/market-unit-price-fixture.js';
import { lintVisibleReportText } from '../../src/modules/analysis/report-visible-text-lint.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };

function workbook(cells: Record<string, unknown> = {}): Buffer {
  const generated = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells }), maxBuffer: 4 * 1024 * 1024 });
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

async function readyRun(t: TestContext, rows?: ReaderRowsReader, sources: { source?: AutomationSourcePort; webSource?: AutomationSourcePort } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-reader-report-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'reader-report', title: 'Synthetic reader report' });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now,
    readerReportFlint: false, ...(rows ? { readerRows: rows } : {}), ...sources });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const scope = { definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: sources.source ? [SYNTHETIC_CARD_ID] : [], peerProductIds: [] };
  const prepared = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1',
    requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision, scope,
    sourceLabel: 'Synthetic operator export', sourceContext: 'Keyword export; filters not independently verified.',
    measurementPeriod: { ...period, basis: 'Operator-declared export range, not authenticated' },
    selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' } }, workbook());
  const build = (requestKey: string, extra: Record<string, unknown> = {}) => ({ contractVersion: 'reader-report-build-v1', requestKey,
    metricPackageId: prepared.packageId, platforms: ['shopee'], profile, cover: null, source: source(), ...extra });
  // A run that is not DRAFT_READY never gets a reader page.
  await assert.rejects(service.buildReaderReport(workspaceId, runId, build('30000000-0000-4000-8000-000000000000'), owner), /bản nháp đã sẵn sàng/);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  return { root, db, service, artifacts, build, packageId: prepared.packageId };
}

test('reader owner build-v1.2 verifies retained unit prices, publishes findings and replays exact bytes beside old v1', async t => {
  const retainedRows = [0, 1, 2, 3, 4, 5].map(i => ({ i, platform: 'shopee' as const, listing: `listing-${i}`, shop: `shop-${i}`,
    cat: 'Hũ', title: `Hũ thử ${i}`, brand: '(không ghi)', rev: (i + 1) * 100, units: 2, asp: (i + 1) * 50, start: null }));
  const f = await readyRun(t, () => retainedRows);
  const legacyRequest = f.build('10000000-0000-4000-8000-000000000951');
  const legacy = await f.service.buildReaderReport(workspaceId, runId, legacyRequest, owner);
  const legacyBytes = (await f.service.readReaderReport(workspaceId, runId, legacy.revision.revisionId)).bytes;
  const units = unitPriceFixture(retainedRows);
  // The owning service receives hashes only and resolves the actual artifact.
  for (const retained of units.retained) assert.equal((await f.artifacts.put(retained.bytes)).sha256, retained.sha256);
  const request = { ...f.build('10000000-0000-4000-8000-000000000952'), contractVersion: 'reader-report-build-v1.2', unitPrices: units.packet };
  const built = await f.service.buildReaderReport(workspaceId, runId, request, owner);
  const row = f.db.prepare('SELECT input_sha256,builder_version,metrics_sha256,claims_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { input_sha256: string; builder_version: string; metrics_sha256: string; claims_sha256: string };
  assert.equal(row.builder_version, 'reader-report-market-v4');
  const recordBytes = await f.artifacts.read(row.input_sha256), record = JSON.parse(recordBytes.toString());
  assert.equal(record.input.contractVersion, '1.4.0');
  assert.deepEqual(record.input.unitPrices, units.packet);
  assert.deepEqual(record.input.peerRule, DEFAULT_MARKET_PEER_RULE);
  const published = await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId), html = published.bytes.toString();
  assert.equal((html.match(/<b>Nhận định:<\/b>/g) ?? []).length, 6);
  assert.match(html, /đồng\/100g/); assert.match(html, /đồng\/100ml/); assert.match(html, /đồng\/combo/);
  assert.ok(lintVisibleReportText(html).every(result => result.ok));
  const claims = JSON.parse((await f.artifacts.read(row.claims_sha256)).toString());
  assert.ok(claims.lint.some((result: { rule: string; ok: boolean }) => result.rule === 'U13_PENDING_NUMBER' && result.ok));
  const metrics = JSON.parse((await f.artifacts.read(row.metrics_sha256)).toString());
  assert.ok(metrics.some((metric: { id: string; value: number }) => metric.id === 'unitPrice.0.standard' && metric.value === 5000));
  const revisions = f.db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number };
  assert.deepEqual(await f.service.buildReaderReport(workspaceId, runId, request, owner), { ...built, exactRetry: true });
  assert.deepEqual((await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes, published.bytes);
  assert.deepEqual(await f.artifacts.read(row.input_sha256), recordBytes);
  assert.equal((f.db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number }).n, revisions.n);
  assert.deepEqual(await f.service.buildReaderReport(workspaceId, runId, legacyRequest, owner), {
    ...legacy, exactRetry: true, revision: { ...legacy.revision, state: 'SUPERSEDED' },
  });
  assert.deepEqual((await f.service.readReaderReport(workspaceId, runId, legacy.revision.revisionId)).bytes, legacyBytes);
  const invalid = structuredClone(request); (invalid.unitPrices as typeof units.packet).records[0]!.observation.variant = 'Wrong variant';
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, { ...invalid, requestKey: '10000000-0000-4000-8000-000000000953' }, owner), /Không xác minh được quy cách hoặc giá/);
  const absent = structuredClone(units.packet); absent.sources[0]!.sha256 = 'f'.repeat(64); absent.records.forEach(r => { r.source.sourceSha256 = 'f'.repeat(64); });
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000000000954', { contractVersion: 'reader-report-build-v1.2', unitPrices: absent }), owner), /Không đọc được/);
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, {
    ...request, requestKey: '10000000-0000-4000-8000-000000000955', profile: { ...profile, product: 'Sản phẩm tốt nhất' },
  }, owner), /chưa đạt kiểm tra bằng chứng hoặc cách trình bày/);
  assert.equal((f.db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number }).n, revisions.n);
});

test('new reader retains its frozen peer rule, eligible/excluded membership and selected result through exact retries and byte reads', async t => {
  const rows: ReaderRowsReader = () => [0, 1, 2].map(i => ({
    i, platform: 'shopee', listing: `listing-${i}`, shop: `shop-${i}`, shopName: `Gian hàng thử ${i}`,
    cat: 'Hũ', title: `Hũ thử ${i}`, brand: '(không ghi)', rev: [100, 60, 40][i]!, units: 2, asp: [50, 30, 20][i]!,
  }));
  const f = await readyRun(t, rows);
  const request = f.build('10000000-0000-4000-8000-000000000997');
  const built = await f.service.buildReaderReport(workspaceId, runId, request, owner);
  const row = f.db.prepare('SELECT input_sha256,builder_version FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { input_sha256: string; builder_version: string };
  const recordBytes = await f.artifacts.read(row.input_sha256);
  const record = JSON.parse(recordBytes.toString());
  assert.equal(row.builder_version, 'reader-report-market-v3');
  assert.equal(record.input.contractVersion, '1.3.0');
  assert.deepEqual(record.input.peerRule, DEFAULT_MARKET_PEER_RULE);
  const snapshot = verifyDefaultMarketPeers(record.defaultMarketPeers);
  assert.equal(snapshot.frames[0]!.totalRevenue, '200');
  assert.equal(snapshot.frames[0]!.selectedRevenue, '100');
  assert.equal(snapshot.frames[0]!.eligible.length, 3);
  assert.deepEqual(snapshot.frames[0]!.selected.map(member => member.identity.label), ['Gian hàng thử 0']);
  const first = await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId);
  assert.match(first.bytes.toString(), /Đối thủ mặc định/);
  assert.deepEqual(await f.service.buildReaderReport(workspaceId, runId, request, owner), { ...built, exactRetry: true });
  assert.deepEqual((await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes, first.bytes);
  assert.deepEqual(await f.artifacts.read(row.input_sha256), recordBytes);
});

const decide = (requestKey: string, revisionId: string, decision: 'APPROVED' | 'REJECTED', reason: string | null = null) =>
  ({ contractVersion: 'reader-report-decision-v1', requestKey, revisionId, decision, reason });

test('snapshot build reaches the service without source, retains exact retries and checks derived period and digest before writes', async t => {
  const f = await readyRun(t);
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8'));
  const periods = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('startDate' in object && 'endDate' in object) Object.assign(object, period);
    for (const entry of Object.values(object)) periods(entry);
  };
  periods(snapshot);
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_ON_PAGE' };
  const request = f.build('10000000-0000-4000-8000-000000000991', {
    contractVersion: 'reader-report-build-v1.1', webSnapshot: snapshot, webSnapshotSha256: webSnapshotDigest(snapshot),
  });
  delete (request as Record<string, unknown>).source;
  const built = await f.service.buildReaderReport(workspaceId, runId, request, owner);
  assert.equal(built.exactRetry, false);
  assert.deepEqual(await f.service.buildReaderReport(workspaceId, runId, request, owner), { ...built, exactRetry: true });
  const html = (await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes.toString('utf8');
  assert.match(html, /toàn kết quả tìm kiếm/);
  assert.match(html, /Số liệu đã tính từ nguồn đã lưu/);
  assert.match(html, /Dòng số liệu nguồn/);
  assert.doesNotMatch(html, /Chưa có nguồn/);
  const count = () => Number((f.db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number | bigint }).n);
  assert.equal(count(), 1);
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, { ...request, webSnapshotSha256: 'f'.repeat(64) }, owner),
    (error: Error & { code?: string }) => error.code === 'request_key_conflict');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, { ...request,
    requestKey: '10000000-0000-4000-8000-000000000992', webSnapshotSha256: 'f'.repeat(64) }, owner), /webSnapshotSha256/);
  const different = structuredClone(snapshot);
  different.scope.period.startDate = '2025-12-31';
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, { ...request,
    requestKey: '10000000-0000-4000-8000-000000000993', webSnapshot: different, webSnapshotSha256: webSnapshotDigest(different) }, owner), /Kỳ số liệu khai báo khác kỳ/);
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, { ...request,
    requestKey: '10000000-0000-4000-8000-000000000994', source: source() }, owner), /READER_SOURCE_MISMATCH/);
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, { ...request,
    requestKey: '10000000-0000-4000-8000-000000000995', unexpected: 'untrusted' }, owner), /không hợp lệ/);
  assert.equal(count(), 1);
});

test('reader page restates a ready draft: exact retry, deterministic rebuild, latest-only decisions and immutable rows', async t => {
  const f = await readyRun(t);
  const first = await f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303031'), owner);
  assert.equal(first.exactRetry, false);
  assert.equal(first.revision.revisionNumber, 1);
  assert.equal(first.revision.state, 'PENDING_OWNER_REVIEW');
  assert.deepEqual(first.revision.platforms, ['shopee']);
  const retry = await f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303031'), owner);
  assert.deepEqual(retry, { ...first, exactRetry: true });
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303031', { platforms: ['shopee', 'tiktok'] }), owner),
    (error: Error & { code?: string }) => error.code === 'request_key_conflict');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303032', { source: source('2025-12-31') }), owner),
    /Kỳ số liệu khai báo khác kỳ của tệp/);
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303033', { platforms: ['shopee', 'tiktok'],
    source: { ...source(), platformBreakdown: { shopee: { displayedRevenueVnd: 150 }, tiktok: { displayedRevenueVnd: 50 } } } }), owner),
  /không dùng được cho bản đọc \(tiktok\)/, 'a declared marketplace with no rows fails closed');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303034', { metricPackageId: '99999999-9999-4999-8999-999999999999' }), owner),
    /không thuộc lượt research/);

  const page = await f.service.readReaderReport(workspaceId, runId, first.revision.revisionId);
  const html = page.bytes.toString('utf8');
  assert.match(html, /Hũ thử nghiệm/);
  assert.match(html, /Phân loại sản phẩm do AI đề xuất, chưa được chủ duyệt\./);
  assert.doesNotMatch(html, /Metric|Kalodata|TradeInt|Dami/i, 'the reader page never names a data provider');

  const second = await f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303035'), owner);
  assert.equal(second.revision.revisionNumber, 2);
  assert.equal(second.revision.htmlSha256, first.revision.htmlSha256, 'same draft, file and profile rebuild the same page bytes');
  const listed = await f.service.listReaderReports(workspaceId, runId);
  assert.deepEqual(listed.revisions.map(r => r.state), ['SUPERSEDED', 'PENDING_OWNER_REVIEW']);

  await assert.rejects(f.service.decideReaderReport(workspaceId, runId, decide('20000000-0000-4000-8000-000030303031', first.revision.revisionId, 'APPROVED'), owner),
    (error: Error & { code?: string }) => error.code === 'revision_conflict' && /bản đọc mới hơn/.test(error.message));
  const rejected = await f.service.decideReaderReport(workspaceId, runId, decide('20000000-0000-4000-8000-000030303032', second.revision.revisionId, 'REJECTED', '  Sai nhóm sản phẩm  '), owner);
  assert.equal(rejected.exactRetry, false);
  assert.equal(rejected.revision.state, 'REJECTED');
  assert.equal(rejected.revision.decision?.reason, 'Sai nhóm sản phẩm');
  assert.deepEqual(await f.service.decideReaderReport(workspaceId, runId, decide('20000000-0000-4000-8000-000030303032', second.revision.revisionId, 'REJECTED', 'Sai nhóm sản phẩm'), owner),
    { ...rejected, exactRetry: true });
  await assert.rejects(f.service.decideReaderReport(workspaceId, runId, decide('20000000-0000-4000-8000-000030303032', second.revision.revisionId, 'APPROVED'), owner),
    (error: Error & { code?: string }) => error.code === 'request_key_conflict');
  await assert.rejects(f.service.decideReaderReport(workspaceId, runId, decide('20000000-0000-4000-8000-000030303033', second.revision.revisionId, 'APPROVED'), owner),
    /đã có quyết định/);

  const third = await f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303036', { profile: { ...profile, status: 'approved' } }), owner);
  assert.equal(third.revision.profileStatus, 'approved');
  assert.doesNotMatch((await f.service.readReaderReport(workspaceId, runId, third.revision.revisionId)).bytes.toString('utf8'), /do AI đề xuất, chưa được chủ duyệt/);
  const approved = await f.service.decideReaderReport(workspaceId, runId, decide('20000000-0000-4000-8000-000030303034', third.revision.revisionId, 'APPROVED'), owner);
  assert.equal(approved.revision.state, 'APPROVED');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000030303037'), owner), /Bản đọc mới nhất đã được chủ duyệt\./);
  assert.deepEqual((await f.service.listReaderReports(workspaceId, runId)).revisions.map(r => r.state), ['SUPERSEDED', 'REJECTED', 'APPROVED']);

  for (const sql of ["UPDATE analysis_reader_report_revisions SET actor_id='x'", 'DELETE FROM analysis_reader_report_revisions',
    "UPDATE analysis_reader_report_decisions SET reason='x'", 'DELETE FROM analysis_reader_report_decisions'])
    assert.throws(() => f.db.prepare(sql).run(), /immutable_reader_report/);
  assert.throws(() => f.db.prepare(`INSERT INTO analysis_reader_report_decisions(revision_id,run_id,decision,request_key,reason,actor_id,decided_at)
    VALUES (?,?,'APPROVED','20000000-0000-4000-8000-000072617731',NULL,'owner:x','2026-02-01T00:00:00.000Z')`).run(first.revision.revisionId, runId), /requires_latest_revision/);
  await assert.rejects(f.service.readReaderReport(workspaceId, runId, '99999999-9999-4999-8999-999999999999'), /Không tìm thấy bản đọc/);
});

test('reader build reads both marketplaces from one combined file and only accepts an OWNER actor', async t => {
  const rows: ReaderRowsReader = (bytes, platforms) => readerRowsFromMetricWorkbook(workbook({ J3: { type: 's', value: '8__102__20' } }), platforms)
    .map(row => ({ ...row, units: row.units || 1 }));
  const f = await readyRun(t, rows);
  const body = f.build('10000000-0000-4000-8000-0000626f7468', { platforms: ['tiktok', 'shopee'],
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
  assert.equal(rows[1]!.asp, null, 'zero units leave the average price undefined');
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

test('reader build stores the cover photo with its licence sidecar and refuses a non-photo cover', async t => {
  const f = await readyRun(t);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(24, 7)]);
  const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>', 'utf8');
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId,
    f.build('10000000-0000-4000-8000-000000000c01', { cover: { imageBase64: svg.toString('base64'), licence: 'CC0' } }), owner), /Ảnh bìa không dùng được/);
  const built = await f.service.buildReaderReport(workspaceId, runId,
    f.build('10000000-0000-4000-8000-000000000c02', { cover: { imageBase64: png.toString('base64'), licence: 'owner-supplied', credit: 'Ảnh của chủ' } }), owner);
  const row = f.db.prepare('SELECT cover_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { cover_sha256: string };
  const media = (sha: string) => (f.db.prepare('SELECT media_type FROM artifact_manifests WHERE sha256=?').get(sha) as { media_type: string } | undefined)?.media_type;
  assert.equal(media(row.cover_sha256), 'application/json', 'the revision names the licence sidecar');
  assert.equal(media(createHash('sha256').update(png).digest('hex')), 'image/png');
  assert.match((await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes.toString('utf8'), /data:image\/png;base64,/);
});

test('reader page cites the run web results in the appendix with links and never names the search provider', async t => {
  const organic = [
    { position: 1, title: 'Hũ thủy tinh nên mua', link: 'https://example.test/hu?a=1&b=2', snippet: 'So sánh nắp đậy', source: 'Báo Mẫu', date: '2 thg 9, 2026' },
    { position: 2, title: 'Thị phần hũ thủy tinh', link: 'https://example.test/share', snippet: null },
  ];
  const f = await readyRun(t, undefined, { source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic) });
  const built = await f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000000000e01'), owner);
  const html = (await f.service.readReaderReport(workspaceId, runId, built.revision.revisionId)).bytes.toString('utf8');
  assert.match(html, /Bảng PL\.3/);
  assert.ok(html.includes('<a href="https://example.test/hu?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">Hũ thủy tinh nên mua</a>'), 'the title links to the page');
  assert.match(html, /Báo Mẫu · đăng 2 thg 9, 2026/, 'site and publish date flow from the search result to the citation');
  assert.match(html, /Thị phần hũ thủy tinh/, 'a result is not dropped for its own wording');
  assert.doesNotMatch(html, /SerpApi|Kalodata/i);
});


test('authenticated HTTP unit-spec intake binds exact source bytes through v1.2 build and immutable read', async t => {
  const f = await readyRun(t);
  const rows = readerRowsFromMetricWorkbook(workbook(), ['shopee']);
  const units = unitPriceFixture(rows);
  // Preserve noncanonical whitespace. Owner quantity is a separate retained declaration.
  const listingBytes = Buffer.from(JSON.stringify(JSON.parse(units.retained[0]!.bytes.toString()), null, 2) + '\n');
  const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  const listingSha = digest(listingBytes);
  units.packet.sources[0]!.sha256 = listingSha;
  units.packet.records.forEach(record => { record.source.sourceSha256 = listingSha; });
  const declared = { ...units.packet.records[0]!.observation, quantity: { value: 400, unit: 'g' as const } };
  const ownerBytes = Buffer.from(JSON.stringify({ declaration: declared }, null, 4) + '\n');
  const ownerSha = digest(ownerBytes);
  units.packet.sources.push({ sha256: ownerSha, role: 'OWNER_DECLARATION' });
  units.packet.records[0]!.quantityOverride = { source: { sourceSha256: ownerSha, locator: '/declaration' }, observation: declared };
  const metadata = { contractVersion: 'reader-unit-spec-intake-v1', metricPackageId: f.packageId, platforms: ['shopee'], unitPrices: units.packet };
  const token = 'synthetic-reader-owner-token-123456-abcdefghijklmnopqrstuvwxyz';
  const probe = http.createServer(); probe.listen(0, '127.0.0.1'); await once(probe, 'listening');
  const port = (probe.address() as AddressInfo).port; await new Promise<void>(resolve => probe.close(() => resolve()));
  const base = `http://127.0.0.1:${port}`;
  const api = openResearchAutomationApi({ databasePath: path.join(f.root, 'test.sqlite'), artifactRoot: path.join(f.root, 'artifacts'), origin: base,
    providers: { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false },
    owner: { writeEnabled: true, databasePath: path.join(f.root, 'test.sqlite'), artifactRoot: path.join(f.root, 'artifacts'), token, allowedOrigin: base, actorId: owner.actorId } });
  const server = http.createServer(api.handler); server.listen(port, '127.0.0.1'); await once(server, 'listening');
  const root = (wid = workspaceId, rid = runId) => `${base}/owner-api/workspaces/${wid}/research-automation/runs/${rid}/reader-reports`;
  const upload = (input: unknown = metadata, files = new Map([[listingSha, listingBytes], [ownerSha, ownerBytes]]), authorized = true, wid = workspaceId, rid = runId) => {
    const form = new FormData(); form.set('metadata', JSON.stringify(input));
    for (const [sha, bytes] of files) form.set(`file:${sha}`, new Blob([new Uint8Array(bytes)], { type: 'application/json' }), '../../inert.json');
    return fetch(`${root(wid, rid)}/unit-spec-intakes`, { method: 'POST', headers: { Origin: base, ...(authorized ? { Authorization: `Bearer ${token}` } : {}) }, body: form });
  };
  const postBuild = (body: unknown, wid = workspaceId, rid = runId) => fetch(root(wid, rid), { method: 'POST',
    headers: { Origin: base, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const count = () => Number((f.db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number | bigint }).n);
  const manifests = () => Number((f.db.prepare('SELECT count(*) n FROM artifact_manifests').get() as { n: number | bigint }).n);
  try {
    const initial = manifests();
    assert.equal((await upload(metadata, undefined, false)).status, 401);
    assert.equal(manifests(), initial, 'unauthenticated bytes are never registered');
    assert.equal((await upload(metadata, undefined, true, '99999999-9999-4999-8999-999999999999')).status, 404);
    assert.equal((await upload(metadata, undefined, true, workspaceId, '99999999-9999-4999-8999-999999999999')).status, 404);
    const bad = structuredClone(metadata); bad.unitPrices.records[0]!.observation.variant = 'wrong';
    assert.equal((await upload(bad)).status, 400);
    const wrongLocator = structuredClone(metadata); wrongLocator.unitPrices.records[0]!.source.locator = '/observations/99';
    assert.equal((await upload(wrongLocator)).status, 400);
    const wrongListing = structuredClone(metadata); wrongListing.unitPrices.records[0]!.observation.listing = 'wrong-listing';
    assert.equal((await upload(wrongListing)).status, 400);
    assert.equal((await upload(metadata, new Map([[listingSha, Buffer.from('{}')], [ownerSha, ownerBytes]]))).status, 400);
    const malformed = Buffer.from('{ broken'); const malformedSha = digest(malformed);
    const invalidJson = structuredClone(metadata); invalidJson.unitPrices.sources[0]!.sha256 = malformedSha;
    invalidJson.unitPrices.records.forEach(record => { record.source.sourceSha256 = malformedSha; });
    assert.equal((await upload(invalidJson, new Map([[malformedSha, malformed], [ownerSha, ownerBytes]]))).status, 400);
    const invalidUtf8 = Buffer.from([0xff]); const utfSha = digest(invalidUtf8);
    const invalidEncoding = structuredClone(invalidJson); invalidEncoding.unitPrices.sources[0]!.sha256 = utfSha;
    invalidEncoding.unitPrices.records.forEach(record => { record.source.sourceSha256 = utfSha; });
    assert.equal((await upload(invalidEncoding, new Map([[utfSha, invalidUtf8], [ownerSha, ownerBytes]]))).status, 400);
    assert.equal((await upload(metadata, new Map([[listingSha, Buffer.alloc(2 * 1024 * 1024 + 1)], [ownerSha, ownerBytes]]))).status, 413);
    assert.equal(manifests(), initial, 'invalid uploads publish no manifests');
    await assert.rejects(fs.stat(f.artifacts.pathForDigest(listingSha)), /ENOENT/);
    assert.equal(count(), 0);
    const created = await upload(); assert.equal(created.status, 201); const receipt = await created.json() as any;
    assert.equal(receipt.workspaceId, workspaceId); assert.equal(receipt.runId, runId); assert.deepEqual(receipt.request, metadata);
    assert.deepEqual(await f.artifacts.read(listingSha), listingBytes); assert.deepEqual(await f.artifacts.read(ownerSha), ownerBytes);
    const record = JSON.parse((await f.artifacts.read(receipt.intakeSha256)).toString());
    assert.equal(record.actorId, owner.actorId); assert.equal(record.workbookSha256, digest(workbook()));
    assert.equal(record.draftPairId, (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId);
    const retry = await upload(); assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), { ...receipt, exactRetry: true });
    assert.equal(count(), 0, 'intake does not create a report or decision');
    const request = { ...f.build('10000000-0000-4000-8000-000000008001'), contractVersion: 'reader-report-build-v1.2', unitPrices: units.packet };
    const envelope = { contractVersion: 'reader-report-unit-spec-build-v1', intakeSha256: receipt.intakeSha256, request };
    const wrongPacket = structuredClone(envelope); (wrongPacket.request.unitPrices as typeof units.packet).records[0]!.observation.variant = 'wrong';
    assert.equal((await postBuild(wrongPacket)).status, 400);
    assert.equal((await postBuild({ ...envelope, intakeSha256: listingSha })).status, 400);
    assert.equal((await postBuild({ ...envelope, request: { ...request, metricPackageId: '99999999-9999-4999-8999-999999999999' } })).status, 400);
    assert.equal(count(), 0);
    const builtResponse = await postBuild(envelope); assert.equal(builtResponse.status, 201, await builtResponse.clone().text());
    const built = await builtResponse.json() as any;
    const url = `${base}/api/workspaces/${workspaceId}/research-automation/runs/${runId}/reader-reports/${built.revision.revisionId}/html`;
    const read = await fetch(url); assert.equal(read.status, 200); const html = Buffer.from(await read.arrayBuffer());
    assert.equal(digest(html), built.revision.htmlSha256); assert.match(html.toString(), /đồng\/100g/); assert.match(html.toString(), /chủ khai báo/);
    const saved = f.db.prepare('SELECT input_sha256 FROM analysis_reader_report_revisions WHERE revision_id=?').get(built.revision.revisionId) as { input_sha256: string };
    assert.equal(JSON.parse((await f.artifacts.read(saved.input_sha256)).toString()).unitSpecIntakeSha256, receipt.intakeSha256);
    const buildRetry = await postBuild(envelope); assert.equal(buildRetry.status, 200);
    assert.deepEqual(await buildRetry.json(), { ...built, exactRetry: true });
    assert.deepEqual(Buffer.from(await (await fetch(url)).arrayBuffer()), html); assert.equal(count(), 1);
    // Forging only bytes cannot mint an authenticated registered receipt.
    const forged = { ...record, runId: '99999999-9999-4999-8999-999999999999' };
    const forgedArtifact = await f.artifacts.put(Buffer.from(JSON.stringify(forged)));
    assert.equal((await postBuild({ ...envelope, intakeSha256: forgedArtifact.sha256, request: { ...request, requestKey: '10000000-0000-4000-8000-000000008002' } })).status, 400);
    // A registered receipt with a different context is still rejected by actual bindings.
    f.db.prepare(`INSERT INTO artifact_manifests SELECT ?,?,media_type,?,acquired_at,contract_version,retention_status,created_at FROM artifact_manifests WHERE sha256=?`)
      .run(forgedArtifact.sha256, forgedArtifact.byteSize, forgedArtifact.relativePath, receipt.intakeSha256);
    assert.equal((await postBuild({ ...envelope, intakeSha256: forgedArtifact.sha256 })).status, 400);
    assert.equal(count(), 1);
    assert.deepEqual(await fs.readdir(path.join(f.root, 'artifacts', '.owner-api-requests')), []);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await api.close(); }
});
