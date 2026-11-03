import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import test, { afterEach, beforeEach, mock, type TestContext } from 'node:test';
import Database from 'better-sqlite3';
import { openOperatorApp, operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { MarketNumberTraceBlockedError } from '../../src/modules/analysis/research-automation/market-report-check.js';
import { checkMarketNumberTrace } from '../../src/modules/analysis/research-automation/market-number-trace.js';
import { MarketNumberTraceCollector } from '../../src/modules/analysis/research-automation/market-trace-map.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { fixture, startRun, workspaceId, now } from '../helpers/autorun-harness.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import { aAttempt, aResult, aReviews } from '../fixtures/raw-db-v1-autoload.js';
import { exists, snapshotPath, until } from '../fixtures/raw-db-v1-y2.js';

beforeEach(() => { mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); }); });
afterEach(() => mock.restoreAll());

async function configuration(f: { root: string; databasePath: string; artifactRoot: string }, flag?: string) {
  const frontendDist = path.join(f.root, 'frontend');
  await fs.mkdir(frontendDist);
  await fs.writeFile(path.join(frontendDist, 'index.html'), '<!doctype html><title>Synthetic A</title>');
  return operatorAppConfigurationFromEnvironment({
    TDN_WORKSPACE_DB: f.databasePath, TDN_ARTIFACT_ROOT: f.artifactRoot,
    TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'synthetic-a-owner-token-abcdefghijklmnopqrstuvwxyz-12345',
    TDN_OWNER_API_ACTOR_ID: 'owner:synthetic-a', TDN_KALODATA_SECRET_KEY: 'synthetic-a-not-live',
    TDN_RESEARCH_TIKTOK_SHOP_REVIEWS_ENABLED: '1', TDN_RESEARCH_JEV_ENABLED: 'false',
    ...(flag === undefined ? {} : { TDN_RAW_DB_AUTOLOAD_ENABLED: flag }),
  }, { frontendDist, version: 'synthetic-a' });
}

/** Start/confirm through the real service, then let the operator's real worker finish collection and reports.
 * The server never listens. All outbound calls use synthetic fetch responses only. */
async function queuedRun(t: TestContext) {
  const f = await fixture(t, 'off'), runId = await startRun(f.service, ['MARKET', 'INSIGHT']);
  await f.service.processNext();
  const run = await f.service.getRun(workspaceId, runId);
  await f.service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: run.revision, definition: 'Synthetic A lifecycle', includeTerms: [], excludeTerms: [],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  let reviewCaptures = 0;
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'www.kalodata.com', 'no endpoint outside the synthetic provider');
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (url.pathname.endsWith('/credit/balance')) return Response.json({ success: true, data: { totalRemain: 100 - reviewCaptures } });
    if (url.pathname.endsWith('/comment/insight')) {
      reviewCaptures++;
      return Response.json({ success: true, data: { product_id: '12345', original_comments: aReviews().map(row => ({ ...row, product_id: '12345' })) } });
    }
    if (url.pathname.endsWith('/product/detail')) return Response.json({ success: true, data: {
      product_id: body.product_id, product_name: 'Synthetic A product 🧪', product_region: 'vn', currency: 'VND',
      date_range: body.date_range, revenue: 1000, sales_volumn: 5, unit_price: 200,
    } });
    assert.fail(`unexpected synthetic endpoint ${url.pathname}`);
  });
  return { ...f, runId, reviewCaptures: () => reviewCaptures };
}

test('RAWDB-A flag off: unset and false complete a run with stored S06 captures and create no load, label, attempt or snapshot', async t => {
  for (const flag of [undefined, 'false']) {
    const f = await queuedRun(t), application = openOperatorApp(await configuration(f, flag), { clock: now });
    try {
      await until(async () => (await f.service.getRun(workspaceId, f.runId)).status === 'DRAFT_READY', 'flag-off run completes');
    } finally { await application.close(); }
    assert.ok(f.reviewCaptures() > 0, 'off test reaches a nonempty S06 collection');
    for (const table of ['raw_capture', 'review', 'review_code'])
      assert.equal(Number(f.db.prepare(`SELECT count(*) FROM ${table}`).pluck().get()), 0, table);
    if (f.db.prepare("SELECT 1 FROM sqlite_schema WHERE name='raw_db_autoload' AND type='table'").get())
      assert.equal(Number(f.db.prepare('SELECT count(*) FROM raw_db_autoload').pluck().get()), 0);
    assert.equal(await exists(snapshotPath(f)), false);
  }
});

test('RAWDB-A finalisation: automatic load observes final COLLECTION; a source failure cannot alter run status, outcome or reports', async t => {
  const f = await queuedRun(t);
  f.db.exec(`CREATE TABLE a_run_before AS SELECT * FROM analysis_research_automation_runs WHERE 0;
    CREATE TABLE a_steps_before AS SELECT * FROM analysis_research_automation_steps WHERE 0;
    CREATE TABLE a_attempt_state(collection_state TEXT);
    CREATE TRIGGER a_run_final AFTER UPDATE ON analysis_research_automation_steps
      WHEN NEW.step_id='REPORTS' AND NEW.state='SUCCEEDED' BEGIN
      INSERT INTO a_run_before SELECT * FROM analysis_research_automation_runs WHERE run_id=NEW.run_id;
      INSERT INTO a_steps_before SELECT * FROM analysis_research_automation_steps WHERE run_id=NEW.run_id;
    END;
    CREATE TRIGGER a_before_attempt BEFORE INSERT ON raw_db_autoload BEGIN
      INSERT INTO a_attempt_state SELECT state FROM analysis_research_automation_steps
        WHERE run_id=NEW.run_id AND step_id='COLLECTION';
    END;
    CREATE TRIGGER a_source_failure BEFORE INSERT ON raw_capture WHEN NEW.source_code='S06'
      BEGIN SELECT RAISE(ABORT,'A_FINALISATION_FAILURE'); END`);
  const application = openOperatorApp(await configuration(f, 'true'), { clock: now });
  try {
    await until(async () => Number(f.db.prepare('SELECT count(*) FROM raw_db_autoload').pluck().get()) === 1,
      'operator records the automatic attempt after collection finishes');
    await until(async () => (await f.service.getRun(workspaceId, f.runId)).status === 'DRAFT_READY', 'reports finish independently');
  } finally { await application.close(); }
  const run = f.db.prepare('SELECT * FROM analysis_research_automation_runs WHERE run_id=?').get(f.runId);
  assert.deepEqual(f.db.prepare('SELECT * FROM a_attempt_state').all(), [{ collection_state: 'SUCCEEDED' }]);
  assert.deepEqual(f.db.prepare('SELECT * FROM a_run_before').get(), run, 'autoload preserves every finalized run field');
  assert.deepEqual(f.db.prepare('SELECT * FROM a_steps_before ORDER BY step_id').all(),
    f.db.prepare('SELECT * FROM analysis_research_automation_steps WHERE run_id=? ORDER BY step_id').all(f.runId),
    'autoload cannot move, retime or rewrite report steps');
  assert.equal((run as { status: string }).status, 'DRAFT_READY');
  assert.match(JSON.stringify(aResult(aAttempt(f.db), 's06')), /A_FINALISATION_FAILURE|FAILED|ERROR|SQLITE_CONSTRAINT_TRIGGER/i);
  for (const kind of ['MARKET', 'INSIGHT'] as const) assert.ok((await f.service.readReport(workspaceId, f.runId, kind)).bytes.length > 0);
});

test('RAWDB-A hook: committed SUCCEEDED/PARTIAL collection fires once despite later report failure; other outcomes never fire', async t => {
  for (const outcome of ['SUCCEEDED', 'PARTIAL', 'FAILED', 'UNAVAILABLE', 'CANCELLED'] as const) await t.test(outcome, async t => {
    const f = await fixture(t, 'off'), source = syntheticProductSource();
    const calls: { runId: string; state: string; inTransaction: boolean }[] = [];
    const numberTrace = checkMarketNumberTrace('<section id="M03">12345</section>', new MarketNumberTraceCollector().snapshot());
    assert.equal(numberTrace.ok, false);
    const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, now,
      workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts })),
      source: { ...source, collect: async (...args) => {
        const collected = await source.collect(...args);
        return { ...collected, step: { ...collected.step, outcome } };
      } },
      renderer: () => { throw new MarketNumberTraceBlockedError('MARKET_NUMBER_TRACE_FAILED: synthetic untraced number', numberTrace); },
      onCollectionFinal: runId => {
        const state = f.db.prepare("SELECT state FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").pluck().get(runId) as string;
        calls.push({ runId, state, inTransaction: f.db.inTransaction });
        throw new Error('A_SYNTHETIC_HOOK_FAILURE');
      },
    });
    const runId = await startRun(service);
    await service.processNext();
    const awaiting = await service.getRun(workspaceId, runId);
    await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
      expectedRevision: awaiting.revision, definition: 'Synthetic hook scope', includeTerms: [], excludeTerms: [],
      selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
    await service.processNext();
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(calls, outcome === 'SUCCEEDED' || outcome === 'PARTIAL' ? [{ runId, state: outcome, inTransaction: false }] : []);
    await service.processNext();
    await new Promise<void>(resolve => setImmediate(resolve));
    const run = await service.getRun(workspaceId, runId);
    assert.equal(run.status, outcome === 'CANCELLED' ? 'CANCELLED' : 'FAILED');
    assert.equal(run.steps.find(step => step.stepId === 'COLLECTION')?.state, outcome);
    if (outcome !== 'CANCELLED') assert.equal(run.steps.find(step => step.stepId === 'REPORTS')?.code, 'MARKET_NUMBER_TRACE_BLOCKED');
    assert.equal(calls.length, outcome === 'SUCCEEDED' || outcome === 'PARTIAL' ? 1 : 0, 'report claiming/failure cannot fire the hook again');
  });
});

test('RAWDB-A periodic snapshot: every ten minutes, skipping busy publishes and surviving a failed backup without a run attempt', async t => {
  const f = await fixture(t, 'off');
  f.db.exec("CREATE TABLE a_timer(value TEXT); INSERT INTO a_timer VALUES ('first synthetic generation')");
  t.mock.timers.enable({ apis: ['setInterval'] });
  const application = openOperatorApp(await configuration(f, 'true'), { clock: now });
  const generation = async () => {
    if (!await exists(snapshotPath(f))) return null;
    const copy = new Database(snapshotPath(f), { readonly: true, fileMustExist: true });
    try { return copy.prepare('SELECT value FROM a_timer').pluck().get(); }
    finally { copy.close(); }
  };
  try {
    await new Promise<void>(resolve => setImmediate(resolve));
    t.mock.timers.tick(600_000);
    await until(async () => await generation() === 'first synthetic generation', 'ten-minute snapshot');
    f.db.exec("UPDATE a_timer SET value='second synthetic generation'");
    t.mock.timers.tick(600_000);
    await until(async () => await generation() === 'second synthetic generation', 'next ten-minute snapshot');
    const backup = Database.prototype.backup;
    let started = 0, release!: () => void, failNext = false;
    const gate = new Promise<void>(resolve => { release = resolve; });
    t.mock.method(Database.prototype, 'backup', async function(this: Database.Database, ...args: Parameters<typeof backup>) {
      started++;
      await gate;
      if (failNext) { failNext = false; throw new Error('A_SYNTHETIC_BACKUP_FAILURE'); }
      return backup.apply(this, args);
    });
    f.db.exec("UPDATE a_timer SET value='third synthetic generation'");
    try {
      t.mock.timers.tick(600_000);
      await until(async () => started === 1, 'backup starts');
      t.mock.timers.tick(1_200_000);
      await new Promise<void>(resolve => setImmediate(resolve));
      assert.equal(started, 1, 'busy ticks must not queue or overlap another publish');
    } finally { release(); }
    await until(async () => await generation() === 'third synthetic generation', 'held backup finishes');
    failNext = true;
    f.db.exec("UPDATE a_timer SET value='fourth synthetic generation'");
    t.mock.timers.tick(600_000);
    await until(async () => started === 2, 'failed backup attempted');
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.equal(await generation(), 'third synthetic generation', 'failed backup preserves the previous snapshot');
    t.mock.timers.tick(600_000);
    await until(async () => await generation() === 'fourth synthetic generation', 'timer recovers after backup failure');
    assert.equal(Number(f.db.prepare('SELECT count(*) FROM raw_db_autoload').pluck().get()), 0);
  } finally { await application.close(); }
});
