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
import { assertMarketBusinessGate } from '../../src/modules/analysis/research-automation/market-business-gate.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const owner = { actorId: 'owner:synthetic', role: 'OWNER' as const };
const period = { startDate: '2026-01-01', endDate: '2026-01-29' };
const profile = {
  slug: 'synthetic-jar', product: 'Hũ thử nghiệm', status: 'proposed',
  segments: { S1: 'Hũ nhỏ', N1: 'Hàng khác' }, short: { S1: 'Nhỏ' }, core: ['S1'], non: ['N1'],
  rules: [{ seg: 'S1', when: {} }], signals: [],
};

function workbook(): Buffer {
  const generated = spawnSync(process.platform === 'win32' ? 'python' : 'python3', ['-I', 'tests/fixtures/metric-workbook.py'], { input: JSON.stringify({ profile: 'v2', cells: {} }), maxBuffer: 4 * 1024 * 1024 });
  assert.equal(generated.status, 0, generated.stderr.toString());
  return generated.stdout;
}

async function draftReadyRun(t: TestContext) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-gate-209-reader-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'gate-209-reader', title: 'Synthetic reader gate' });
  const rows = [0, 1, 2].map(i => ({ i, platform: 'shopee' as const, listing: `listing-${i}`, shop: `shop-${i}`,
    cat: 'Hũ', title: `Hũ thử ${i}`, brand: '(không ghi)', rev: (i + 1) * 100, units: 2, asp: (i + 1) * 50, start: null }));
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid: () => runId, now,
    readerReportFlint: false, readerRows: () => rows });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic jar', requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const scope = { definition: 'Synthetic reader scope', includeTerms: ['synthetic jar'], excludeTerms: [], selectedProductIds: [], peerProductIds: [] };
  const prepared = await service.prepareMetricSource(workspaceId, runId, { contractVersion: 'automation-metric-prepare-v1',
    requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: awaiting.revision, scope,
    sourceLabel: 'Synthetic operator export', sourceContext: 'Keyword export; filters not independently verified.',
    measurementPeriod: { ...period, basis: 'Operator-declared export range, not authenticated' },
    selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' } }, workbook());
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v2', requestKey: '55555555-5555-4555-8555-555555555555',
    expectedRevision: awaiting.revision, ...scope, sources: { metric: { decision: 'USE_PREPARED', packageId: prepared.packageId }, nativeReview: 'SKIP' } });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const build = (requestKey: string, product = profile.product) => ({ contractVersion: 'reader-report-build-v1', requestKey,
    metricPackageId: prepared.packageId, platforms: ['shopee'], profile: { ...profile, product }, cover: null,
    source: { measurementPeriod: { start: period.startDate, end: period.endDate }, rowCap: 5000,
      displayedHeadlines: { revenueVnd: 200, soldListings: 2, shops: 2, units: 4 },
      platformBreakdown: { shopee: { displayedRevenueVnd: 200 } } } });
  return { db, service, build };
}

const revisionCount = (db: ReturnType<typeof openDatabase>['db']): number =>
  (db.prepare('SELECT count(*) n FROM analysis_reader_report_revisions').get() as { n: number }).n;

test('the Market reader revision path runs the business gate before storing a revision', async t => {
  const f = await draftReadyRun(t);
  const good = await f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000000002091'), owner);
  const html = (await f.service.readReaderReport(workspaceId, runId, good.revision.revisionId)).bytes.toString();
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  const before = revisionCount(f.db);
  // A provider name that the reader's own lint does not list is still caught by the shared Market gate.
  await assert.rejects(f.service.buildReaderReport(workspaceId, runId, f.build('10000000-0000-4000-8000-000000002092', 'Hũ OpenAI'), owner),
    /chưa đạt kiểm tra bằng chứng hoặc cách trình bày: Trang có tên nhà cung cấp số liệu hoặc công cụ\./);
  assert.equal(revisionCount(f.db), before);
});
