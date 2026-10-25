import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import type BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, type ResearchAutomationServiceOptions } from '../../src/modules/analysis/research-automation/service.js';
import type { MetricCaptureRequest, MetricCaptureRunResult } from '../../src/modules/analysis/research-automation/metric-capture-runner.js';
import type { DatePeriod } from '../../src/modules/analysis/research-automation/autorun-derive.js';
import { syntheticProductSource } from './research-synthetic-sources.js';

// Shared harness for the Market auto-run tests. Synthetic fixtures only: no real keyword, product,
// shop or customer data; no process is spawned.
export const workspaceId = '11111111-1111-4111-8111-111111111111';
export const now = () => new Date('2026-02-01T00:00:00.000Z');
export const keyword = 'synthetic jar';
export const capturePeriod = { startDate: '2026-01-01', endDate: '2026-01-29' };
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

export function captureFiles(runId: string, period: DatePeriod = capturePeriod) {
  const snapshot = JSON.parse(readFileSync(new URL('../fixtures/metric-web-snapshot/full.json', import.meta.url), 'utf8')) as any;
  snapshot.captureId = `capture-synthetic-${runId.slice(0, 8)}`;
  snapshot.scope = { keywords: [keyword], platforms: ['shopee'], period, category: null, ticks: [], advancedFilters: [], exclusions: [] };
  snapshot.groups.W4_monthly = { absent: true, reason: 'NOT_CAPTURED' };
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
  // Rows carry units sold, as real search rows do; the pick rejects revenue rows without units.
  const rows = [
    { product_base_id: '1__101__201', product_name: 'Synthetic jar mini', shop_base_id: 'shop-a', revenue_custom: 3000, order_custom: 10, brand: 'Brand A' },
    { product_base_id: '1__102__202', product_name: 'Synthetic jar large', shop_base_id: 'shop-b', revenue_custom: 2000, order_custom: 8, brand: 'Brand B' },
    { product_base_id: '1__103__203', product_name: 'Synthetic jar set', shop_base_id: 'shop-c', revenue_custom: 1000, order_custom: 5, brand: 'Brand C' },
    { product_base_id: '1__104__204', product_name: 'Unrelated item', shop_base_id: 'shop-d', revenue_custom: 9000, order_custom: 30, brand: 'Brand D' },
  ];
  return { snapshotBytes, manifestBytes: Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), rawBytes: Buffer.from(JSON.stringify({ responses: [{ body: { data: rows } }] })) };
}

export async function writeCaptureFiles(dir: string, runId: string, period: DatePeriod = capturePeriod): Promise<void> {
  const files = captureFiles(runId, period);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, 'snapshot.json'), files.snapshotBytes);
  await fs.writeFile(path.join(dir, 'manifest.json'), files.manifestBytes);
  await fs.writeFile(path.join(dir, 'raw-responses.json'), files.rawBytes);
}

export type Behaviour = 'ok' | 'hold' | 'abortable' | MetricCaptureRunResult;
export type RunCapture = (config: unknown, request: MetricCaptureRequest) => Promise<MetricCaptureRunResult>;
export class FakeCapture {
  readonly calls: MetricCaptureRequest[] = [];
  readonly signals: AbortSignal[] = [];
  active = 0; maxActive = 0;
  readonly #held = new Map<string, (ok: boolean) => void>();
  constructor(readonly captureRoot: string, public behaviour: (runId: string) => Behaviour = () => 'ok') {}
  release(runId: string, ok = true): void { this.#held.get(runId)!(ok); }
  readonly run: RunCapture = async (_config, request) => {
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
      await writeCaptureFiles(dir, request.runId);
      return { ok: true, captureDir: dir, period: capturePeriod, executorCalls: 1 };
    } finally { this.active--; }
  };
}

export class SpyService extends ResearchAutomationService {
  readonly confirms: unknown[] = [];
  readonly revisions: unknown[] = [];
  hangAfterConfirm = false;
  hangAfterRevision = false;
  failRevision = false;
  private markHung: () => void = () => {};
  // Settles only once a hanging request has been accepted (its rows are written), so tests never guess with a timer.
  readonly hung = new Promise<'hung'>(resolve => { this.markHung = () => resolve('hung'); });
  override async confirmScope(workspace: string, run: string, value: unknown) {
    this.confirms.push(value);
    const receipt = await super.confirmScope(workspace, run, value);
    if (this.hangAfterConfirm) { this.markHung(); await new Promise(() => {}); } // simulated process death after the accepted confirm
    return receipt;
  }
  override async requestReportRevision(workspace: string, run: string, value: unknown) {
    this.revisions.push(value);
    if (this.failRevision) throw new Error('synthetic presentation failure');
    const receipt = await super.requestReportRevision(workspace, run, value);
    if (this.hangAfterRevision) { this.markHung(); await new Promise(() => {}); } // simulated process death after the accepted revision request
    return receipt;
  }
}

function sequence(): () => string {
  let n = 0;
  return () => `aaaaaaaa-0000-4000-8000-${String(++n).padStart(12, '0')}`;
}

export async function fixture(t: TestContext, autoRun: 'on' | 'off' | 'absent' = 'on', behaviour?: (runId: string) => Behaviour,
  runCapture?: (capture: FakeCapture) => RunCapture,
  reviews?: { cap?: number; factory?: ResearchAutomationServiceOptions['shopeeCollectorFactory'] },
  lanes: Pick<ResearchAutomationServiceOptions, 'searchAdsSource' | 'metaAutoSource'> = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-autorun-'));
  const databasePath = path.join(root, 'test.sqlite');
  const artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now }).db;
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'autorun-synthetic', title: 'Synthetic auto-run' });
  const capture = new FakeCapture(path.join(root, 'metric-captures'), behaviour);
  const run = runCapture ? runCapture(capture) : capture.run;
  const uuid = sequence();
  const make = (): SpyService => new SpyService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    metricAttachmentStore: new RequestScopedArtifactStore(artifactRoot), uuid, now, readerReportFlint: false, source: syntheticProductSource(),
    ...lanes,
    ...(reviews?.factory ? { shopeeCollectorFactory: reviews.factory } : {}),
    ...(autoRun === 'absent' ? {} : { autoRun: { enabled: autoRun === 'on', runner: { enabledEnv: '1', captureRoot: capture.captureRoot }, runCapture: run,
      ...(reviews?.cap !== undefined ? { testReviewCap: reviews.cap } : {}) } }),
  } as ResearchAutomationServiceOptions);
  const service = make();
  t.after(async () => { try { db.close(); } catch { /* already closed */ } await fs.rm(root, { recursive: true, force: true }); });
  return { root, databasePath, artifactRoot, artifacts, db, service, make, capture };
}

let requestCounter = 0;
/** Lets two fixtures start runs with the same request key (flag-off comparison). */
export function rewindStartKey(): void { requestCounter--; }
export async function startRun(service: ResearchAutomationService, reports: ('MARKET' | 'INSIGHT')[] = ['MARKET']): Promise<string> {
  const requestKey = `33333333-3333-4333-8333-${String(++requestCounter).padStart(12, '0')}`;
  const receipt = await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey, mode: 'CATEGORY', keyword,
    requestedPeriod: { startDate: '2026-01-01', endDate: '2026-01-30' }, reports });
  return receipt.run.runId;
}
/** Runs every queued step and phase, waiting for detached captures, until nothing moves. */
export async function drain(service: ResearchAutomationService): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (await service.processNext()) continue;
    await service.settleAutoRunCaptures();
    if (!(await service.processNext())) return;
  }
  assert.fail('drain did not settle');
}
/** Runs queued work without waiting for a held capture. */
export async function untilIdle(service: ResearchAutomationService): Promise<void> {
  for (let i = 0; i < 200 && await service.processNext(); i++);
}
/** Drives the worker one move at a time until the check holds. */
export async function driveUntil(service: ResearchAutomationService, check: () => boolean): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (check()) return;
    if (await service.processNext()) continue;
    await service.settleAutoRunCaptures();
  }
  assert.fail('driveUntil did not reach the state');
}
export type AutorunRow = { phase: string; state: string; stopCode: string | null; stopDetail: string | null; packageId: string | null; pickId: string | null; revisionAttemptId: string | null; captureReady: number | bigint };
export function autorun(db: BetterSqlite3.Database, runId: string) {
  return db.prepare(`SELECT phase, phase_state state, stop_code stopCode, stop_detail stopDetail, package_id packageId, pick_artifact_id pickId, revision_attempt_id revisionAttemptId, capture_ready captureReady FROM research_automation_autorun WHERE run_id=?`).get(runId) as AutorunRow | undefined;
}
export function dump(db: BetterSqlite3.Database) {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as Array<{ name: string }>;
  // Migration-seeded rows carry the wall-clock time of the database's creation; everything else uses the fixed clock.
  const fixed = now().toISOString().slice(0, 10);
  const mask = (row: unknown) => Object.fromEntries(Object.entries(row as Record<string, unknown>).map(([key, value]) =>
    [key, typeof value === 'string' && /^\d{4}-\d\d-\d\dT[\d:.]+Z$/.test(value) && !value.startsWith(fixed) ? '<wall-clock>' : value]));
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT * FROM "${name}"`).all().map(mask)]));
}
export function requestCount(db: BetterSqlite3.Database, key: string): number {
  return Number((db.prepare('SELECT count(*) n FROM analysis_research_automation_requests WHERE request_key=?').get(key) as { n: bigint }).n);
}
export function attemptRequestCount(db: BetterSqlite3.Database, key: string): number {
  return Number((db.prepare('SELECT count(*) n FROM analysis_research_automation_attempt_requests WHERE request_key=?').get(key) as { n: bigint }).n);
}
export function attemptCount(db: BetterSqlite3.Database, runId: string): number {
  return Number((db.prepare('SELECT count(*) n FROM analysis_research_automation_attempts WHERE run_id=?').get(runId) as { n: bigint }).n);
}
