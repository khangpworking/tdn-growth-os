import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import type BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, type ResearchAutomationServiceOptions } from '../../src/modules/analysis/research-automation/service.js';
import { autorunRequestKey } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import type { MetricCaptureRequest, MetricCaptureRunResult } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

// Synthetic fixtures only: no real keyword, product, shop or customer data; no process is spawned.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const now = () => new Date('2026-02-01T00:00:00.000Z');
const keyword = 'synthetic jar';
const capturePeriod = { startDate: '2026-01-01', endDate: '2026-01-29' };
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

function captureFiles(runId: string) {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as any;
  snapshot.captureId = `capture-synthetic-${runId.slice(0, 8)}`;
  snapshot.scope = { keywords: [keyword], platforms: ['shopee'], period: capturePeriod, category: null, ticks: [], advancedFilters: [], exclusions: [] };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
  const period = capturePeriod;
  const cell = (i: number, name: string, shop: string, revenue: number, units: number) => ({ cells: {
    name: { label: 'Tên', text: name, sourcePointer: `p[${i}].name` }, shop: { label: 'Shop', text: shop, sourcePointer: `p[${i}].shop` },
    platform: { label: 'Sàn', text: 'shopee', sourcePointer: `p[${i}].platform` },
    revenue: { label: 'Doanh thu', displayed: String(revenue), value: revenue, unit: 'VND', precision: 'exact', platform: 'shopee', period, sourcePointer: `p[${i}].revenue` },
    units: { label: 'Lượt bán', displayed: String(units), value: units, unit: 'COUNT', precision: 'exact', platform: 'shopee', period, sourcePointer: `p[${i}].units` } } });
  snapshot.groups.W12_topProducts = { columns: ['name', 'shop', 'platform', 'revenue', 'units'],
    rows: [cell(0, 'Synthetic A', 'Shop A', 1200, 3), cell(1, 'Synthetic B', 'Shop B', 800, 2), cell(2, 'Synthetic C', 'Shop C', 500, 1)] };
  const snapshotBytes = Buffer.from(JSON.stringify(snapshot, null, 2) + '\n');
  const manifest = { contractVersion: 'metric-results-capture-v1', captureId: snapshot.captureId, specDigest: snapshot.specDigest,
    appliedFilters: { ...snapshot.scope, smartQuery: true, aiNormalisation: false, usefulFilters: { fake: false, gifts: true, deleted: false } }, resultCount: 3,
    productPagination: { cap: 3, totalShown: 5, pageSize: 3, pagesRead: 1, rowsRead: 3, truncated: true },
    metricDataVersion: 'metric-results-data-v2', chartSeries: { contractVersion: 'metric-results-data-v2',
      series: [{ series: 'topProducts', platform: 'shopee', name: 'Synthetic A', revenue: 1200, units: 3, source: 'response:/v2/market/analytics/products' }],
      trendOffered: false, trendNote: 'not offered by the source' },
    views: [], sourceMap: {}, files: [{ path: 'snapshot.json', sha256: hash(snapshotBytes), byteSize: snapshotBytes.length, mediaType: 'application/json', role: 'normalized' }], screenshotSkips: [],
    archive: { rawResponses: 'raw/', normalizedSnapshot: 'snapshot.json', resultsHtml: 'results.html', screenshots: [] }, noReportFileRequested: true, captureGate: { cleared: true } };
  // Three synthetic Shopee rows (different brands and shops) plus one unrelated row the pick must skip.
  const rows = [
    { product_base_id: '1__101__201', product_name: 'Synthetic jar mini', shop_base_id: 'shop-a', revenue_custom: 3000, brand: 'Brand A' },
    { product_base_id: '1__102__202', product_name: 'Synthetic jar large', shop_base_id: 'shop-b', revenue_custom: 2000, brand: 'Brand B' },
    { product_base_id: '1__103__203', product_name: 'Synthetic jar set', shop_base_id: 'shop-c', revenue_custom: 1000, brand: 'Brand C' },
    { product_base_id: '1__104__204', product_name: 'Unrelated item', shop_base_id: 'shop-d', revenue_custom: 9000, brand: 'Brand D' },
  ];
  return { snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), rawBytes: Buffer.from(JSON.stringify({ responses: [{ body: { data: rows } }] })) };
}

type Behaviour = 'ok' | 'hold' | 'abortable' | MetricCaptureRunResult;
class FakeCapture {
  readonly calls: MetricCaptureRequest[] = [];
  readonly signals: AbortSignal[] = [];
  active = 0; maxActive = 0;
  readonly #held = new Map<string, (ok: boolean) => void>();
  constructor(readonly captureRoot: string, public behaviour: (runId: string) => Behaviour = () => 'ok') {}
  release(runId: string, ok = true): void { this.#held.get(runId)!(ok); }
  readonly run = async (_config: unknown, request: MetricCaptureRequest): Promise<MetricCaptureRunResult> => {
    this.calls.push(request); if (request.signal) this.signals.push(request.signal);
    this.active++; this.maxActive = Math.max(this.maxActive, this.active);
    try {
      const behaviour = this.behaviour(request.runId);
      if (typeof behaviour === 'object') return behaviour;
      if (behaviour === 'abortable') {
        await new Promise<void>(resolve => request.signal!.addEventListener('abort', () => resolve(), { once: true }));
        return { ok: false, code: 'CAPTURE_INTERRUPTED', detail: 'stopped', executorCalls: 1 };
      }
      if (behaviour === 'hold' && !(await new Promise<boolean>(resolve => this.#held.set(request.runId, resolve))))
        return { ok: false, code: 'METRIC_UI_CHANGED', detail: 'synthetic failure', executorCalls: 1 };
      const dir = path.join(this.captureRoot, request.runId, 'run1');
      const files = captureFiles(request.runId);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(path.join(dir, 'snapshot.json'), files.snapshotBytes);
      await fs.writeFile(path.join(dir, 'manifest.json'), files.manifestBytes);
      await fs.writeFile(path.join(dir, 'raw-responses.json'), files.rawBytes);
      return { ok: true, captureDir: dir, period: capturePeriod, executorCalls: 1 };
    } finally { this.active--; }
  };
}

class SpyService extends ResearchAutomationService {
  readonly confirms: unknown[] = [];
  hangAfterConfirm = false;
  override async confirmScope(workspace: string, run: string, value: unknown) {
    this.confirms.push(value);
    const receipt = await super.confirmScope(workspace, run, value);
    if (this.hangAfterConfirm) await new Promise(() => {}); // simulated process death after the accepted confirm
    return receipt;
  }
}

function sequence(): () => string {
  let n = 0;
  return () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

async function fixture(t: TestContext, autoRun: 'on' | 'off' | 'absent' = 'on', behaviour?: (runId: string) => Behaviour) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-autorun-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'autorun-synthetic', title: 'Synthetic auto-run' });
  const capture = new FakeCapture(path.join(root, 'metric-captures'), behaviour);
  const uuid = sequence();
  const make = (): SpyService => new SpyService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(path.join(root, 'artifacts')), uuid, now, readerReportFlint: false, source: syntheticProductSource(),
    ...(autoRun === 'absent' ? {} : { autoRun: { enabled: autoRun === 'on', runner: { enabledEnv: '1', captureRoot: capture.captureRoot }, runCapture: capture.run } }),
  } as ResearchAutomationServiceOptions);
  const service = make();
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  return { root, db, service, make, capture };
}

let requestCounter = 0;
async function startRun(service: ResearchAutomationService): Promise<string> {
  const requestKey = `33333333-3333-4333-8333-${String(++requestCounter).padStart(12, '0')}`;
  const receipt = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey, mode: 'CATEGORY', keyword,
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports: ['MARKET'] });
  return receipt.run.runId;
}
/** Runs every queued step and phase, waiting for detached captures, until nothing moves. */
async function drain(service: ResearchAutomationService): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await service.processNext()) continue;
    await service.settleAutoRunCaptures();
    if (!(await service.processNext())) return;
  }
  assert.fail('drain did not settle');
}
/** Runs queued work without waiting for a held capture. */
async function untilIdle(service: ResearchAutomationService): Promise<void> {
  for (let i = 0; i < 200 && await service.processNext(); i++);
}
function autorun(db: BetterSqlite3.Database, runId: string) {
  return db.prepare(`SELECT phase, phase_state state, stop_code stopCode, stop_detail stopDetail, package_id packageId, pick_artifact_id pickId FROM research_automation_autorun WHERE run_id=?`).get(runId) as
    { phase: string; state: string; stopCode: string | null; stopDetail: string | null; packageId: string | null; pickId: string | null } | undefined;
}
function dump(db: BetterSqlite3.Database) {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as Array<{ name: string }>;
  // Migration-seeded rows carry the wall-clock time of the database's creation; everything else uses the fixed clock.
  const fixed = now().toISOString().slice(0, 10);
  const mask = (row: unknown) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) =>
    [key, typeof value === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value) && !value.startsWith(fixed) ? '<wall-clock>' : value]));
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(mask)]));
}
function requestCount(db: BetterSqlite3.Database, key: string): number {
  return Number((db.prepare('SELECT count(*) n FROM analysis_research_automation_requests WHERE request_key=?').get(key) as { n: bigint }).n);
}

test('flag off: no auto-run row, no capture, and the projection and database match a service without the option', async t => {
  const off = await fixture(t, 'off');
  const absent = await fixture(t, 'absent');
  const offRun = await startRun(off.service); requestCounter--;
  const absentRun = await startRun(absent.service);
  await drain(off.service); await drain(absent.service);
  assert.equal(offRun, absentRun);
  assert.equal(off.capture.calls.length, 0);
  assert.equal((off.db.prepare('SELECT count(*) n FROM research_automation_autorun').get() as { n: bigint }).n, 0n);
  assert.deepEqual(await off.service.getRun(workspaceId, offRun), await absent.service.getRun(workspaceId, absentRun));
  assert.deepEqual(dump(off.db), dump(absent.db));
});

test('happy path: capture, prepare, pick and confirm with SKIP review, then DONE once the draft is ready', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  assert.equal(autorun(f.db, runId)!.phase, 'WAITING_SCOPE');
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual({ runId: f.capture.calls[0]!.runId, keyword: f.capture.calls[0]!.keyword }, { runId, keyword });
  const row = autorun(f.db, runId)!;
  assert.deepEqual({ phase: row.phase, state: row.state, stopCode: row.stopCode }, { phase: 'DONE', state: 'QUEUED', stopCode: null });
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  assert.equal(f.service.confirms.length, 1);
  const body = f.service.confirms[0] as { requestKey: string; sources: { nativeReview: string; metric: { decision: string; packageId: string } }; exactShopeeUrls: string[]; selectedProductIds: string[] };
  assert.equal(body.requestKey, autorunRequestKey(runId, 'confirm'));
  assert.equal(body.sources.nativeReview, 'SKIP');
  assert.deepEqual(body.sources.metric, { decision: 'USE_PREPARED', packageId: row.packageId });
  assert.deepEqual(body.selectedProductIds, [SYNTHETIC_CARD_ID]);
  // Fewer than five eligible links still continues; the unrelated row is never picked.
  assert.deepEqual(body.exactShopeeUrls, ['https://shopee.vn/product/201/101', 'https://shopee.vn/product/202/102', 'https://shopee.vn/product/203/103']);
  assert.ok(row.pickId && /^[0-9a-f]{64}$/.test(row.pickId));
  const manifest = f.db.prepare('SELECT media_type mediaType FROM artifact_manifests WHERE sha256=?').get(row.pickId) as { mediaType: string } | undefined;
  assert.equal(manifest?.mediaType, 'application/json', 'pick record is a registered content-addressed artifact');
});

test('restart during CAPTURE stops the row as CAPTURE_INTERRUPTED and never re-runs the capture', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.calls.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CAPTURE', 'RUNNING']);
  const restarted = f.make();
  await restarted.recoverOnStart();
  const stopped = autorun(f.db, runId)!;
  assert.deepEqual([stopped.phase, stopped.stopCode], ['STOPPED', 'CAPTURE_INTERRUPTED']);
  assert.ok(stopped.stopDetail!.length <= 300 && !/[\\/]/.test(stopped.stopDetail!), 'stop detail is short and path-free');
  await drain(restarted);
  // The old process finishing late cannot revive the stopped row.
  f.capture.release(runId); await f.service.settleAutoRunCaptures();
  assert.equal(autorun(f.db, runId)!.stopCode, 'CAPTURE_INTERRUPTED');
  assert.equal(f.capture.calls.length, 1);
});

test('restart during CONFIRM replays the same request key without a duplicate confirmation', async t => {
  const f = await fixture(t);
  const runId = await startRun(f.service);
  f.service.hangAfterConfirm = true;
  // Drive until the confirm is accepted but the process "dies" before the write-back.
  for (let i = 0; i < 50 && f.service.confirms.length === 0; i++) {
    const step = f.service.processNext();
    const moved = await Promise.race([step, new Promise<'hung'>(resolve => setTimeout(() => resolve('hung'), 200))]);
    if (moved === 'hung') break;
    if (!moved) await f.service.settleAutoRunCaptures();
  }
  assert.equal(f.service.confirms.length, 1);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CONFIRM', 'RUNNING']);
  const confirmKey = autorunRequestKey(runId, 'confirm');
  assert.equal(requestCount(f.db, confirmKey), 1);
  const restarted = f.make();
  await restarted.recoverOnStart();
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.state], ['CONFIRM', 'QUEUED']);
  await drain(restarted);
  assert.equal(restarted.confirms.length, 1);
  assert.equal((restarted.confirms[0] as { requestKey: string }).requestKey, confirmKey);
  assert.deepEqual(restarted.confirms[0], f.service.confirms[0], 'replay sends the exact recorded request');
  assert.equal(requestCount(f.db, confirmKey), 1);
  assert.equal(autorun(f.db, runId)!.phase, 'DONE');
  assert.equal(f.capture.calls.length, 1);
});

test('owner confirming by hand first stops the auto-run as SCOPE_CHANGED_BY_OWNER', async t => {
  const f = await fixture(t, 'on', () => 'hold');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  const awaiting = await f.service.getRun(workspaceId, runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic owner scope', includeTerms: [keyword], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  f.capture.release(runId);
  await drain(f.service);
  const row = autorun(f.db, runId)!;
  assert.deepEqual([row.phase, row.stopCode], ['STOPPED', 'SCOPE_CHANGED_BY_OWNER']);
  assert.equal(f.service.confirms.length, 1, 'only the owner confirmation was sent');
  assert.equal(requestCount(f.db, autorunRequestKey(runId, 'confirm')), 0);
});

test('cancel during capture aborts it and stops the row as CANCELLED', async t => {
  const f = await fixture(t, 'on', () => 'abortable');
  const runId = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.signals[0]!.aborted, false);
  const run = await f.service.getRun(workspaceId, runId);
  await f.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1', requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: run.revision });
  assert.equal(f.capture.signals[0]!.aborted, true);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'CANCELLED']);
  await drain(f.service);
  assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'CANCELLED'], 'the cancel wins over the late capture result');
  assert.equal(f.capture.calls.length, 1);
});

test('two runs: only one capture runs at a time', async t => {
  let first: string | undefined;
  const f = await fixture(t, 'on', runId => { first ??= runId; return runId === first ? 'hold' : 'ok'; });
  const a = await startRun(f.service);
  const b = await startRun(f.service);
  await untilIdle(f.service);
  assert.equal(f.capture.calls.length, 1);
  const waiting = f.capture.calls[0]!.runId === a ? b : a;
  assert.deepEqual([autorun(f.db, waiting)!.phase, autorun(f.db, waiting)!.state], ['CAPTURE', 'QUEUED']);
  f.capture.release(f.capture.calls[0]!.runId);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 2);
  assert.equal(f.capture.maxActive, 1);
  assert.equal(autorun(f.db, a)!.phase, 'DONE');
  assert.equal(autorun(f.db, b)!.phase, 'DONE');
});

test('a login stop also stops the other queued captures of the workspace', async t => {
  const f = await fixture(t, 'on', () => ({ ok: false, code: 'METRIC_LOGIN_REQUIRED', detail: 'login required', executorCalls: 1 }));
  const a = await startRun(f.service);
  const b = await startRun(f.service);
  await drain(f.service);
  assert.equal(f.capture.calls.length, 1);
  for (const runId of [a, b]) assert.deepEqual([autorun(f.db, runId)!.phase, autorun(f.db, runId)!.stopCode], ['STOPPED', 'METRIC_LOGIN_REQUIRED']);
  for (const runId of [a, b]) assert.equal((await f.service.getRun(workspaceId, runId)).status, 'AWAITING_SCOPE', 'the run stays open for the owner');
});
