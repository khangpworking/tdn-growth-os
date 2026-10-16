import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/index.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { pathToFileURL } from 'node:url';

// The frontend module is typechecked by the frontend build; load it by path so the backend typecheck stays separate.
const runStatusUrl = pathToFileURL(path.resolve('frontend/src/research-automation/run-status.ts')).href;
const { limitationLabel } = await import(runStatusUrl) as { limitationLabel: (code: string) => string };

// Synthetic documentation values only: no real product ids, keys, hosts or paths.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const period = { startDate: '2026-07-01', endDate: '2026-08-29' } as const;
const now = () => new Date('2026-10-02T00:00:00.000Z');

type Rank = 'OK' | 'CREDIT_EXHAUSTED' | 'OTHER_REJECTION';

async function fixture(t: TestContext, options: { balance?: number | 'MISSING'; rank?: Rank; confirm?: boolean; collectBalance?: number } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-credit-message-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  let collecting = false;
  const paid = { rank: 0, detail: 0 };
  const transport: ProviderTransport = {
    now: () => now().getTime(),
    sleep: async () => {},
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      let payload: unknown;
      if (url.pathname.endsWith('/credit/balance')) {
        const balance = collecting ? options.collectBalance ?? 100 : options.balance ?? 100;
        payload = balance === 'MISSING' ? { success: true, data: {} } : { success: true, data: { totalRemain: balance } };
      } else if (url.pathname.endsWith('/product/rank')) {
        paid.rank += 1;
        payload = options.rank === 'CREDIT_EXHAUSTED' ? { success: false, code: 2016, message: 'Insufficient credit balance' }
          : options.rank === 'OTHER_REJECTION' ? { success: false, code: 1001, message: 'Synthetic rejection' }
          : { success: true, data: [{ product_id: '101', product_name: 'Synthetic thermos', unit_price: 120000 }] };
      } else if (url.pathname.endsWith('/product/detail')) {
        paid.detail += 1;
        const body = JSON.parse(String(init?.body)) as { product_id: string; date_range: string };
        payload = { success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
          product_name: 'Synthetic thermos', revenue: 1000, sales_volumn: 7, unit_price: 120000 } };
      } else throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  };
  const provider = createResearchAutomationProviderRegistry({ kalodataSecretKey: 'synthetic-secret', serpApiKey: null, apifyTokenConfigured: false }, transport).get('KALODATA');
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'credit-message', title: 'Synthetic credit message' });
  let nextUuid = 0;
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    source: bindResearchAutomationProvider(provider), now,
    uuid: () => nextUuid++ === 0 ? runId : `99999999-9999-4999-8999-${String(nextUuid).padStart(12, '0')}`,
  });
  const drain = async () => { for (let step = 0; step < 20 && await service.processNext(); step += 1) { /* drain */ } };
  await service.start(workspaceId, {
    contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'thermos', requestedPeriod: period, reports: ['MARKET'],
  });
  await drain();
  if (options.confirm) {
    const awaiting = await service.getRun(workspaceId, runId);
    collecting = true;
    await service.confirmScope(workspaceId, runId, {
      contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
      expectedRevision: awaiting.revision, definition: 'Vietnam thermos source observations',
      includeTerms: ['thermos'], excludeTerms: [], selectedProductIds: ['kalodata:101'], peerProductIds: [],
    });
    await drain();
  }
  return { db, artifacts, service, paid, run: () => service.getRun(workspaceId, runId) };
}

const CREDIT_TEXT = 'Nguồn số liệu bán hàng TikTok Shop đã hết lượt tra cứu. Cần nạp thêm lượt rồi chạy lại; hệ thống không tự chạy lại.';

async function assertQuickCredit(t: TestContext, options: Parameters<typeof fixture>[1], expectedRankCalls: number) {
  const state = await fixture(t, options);
  const run = await state.run();
  assert.equal(run.status, 'AWAITING_SCOPE', 'the run status is unchanged versus today');
  assert.equal(state.paid.rank, expectedRankCalls);
  assert.equal(state.paid.detail, 0, 'no detail call after a credit stop');
  const quick = run.steps.find(step => step.stepId === 'QUICK_SEARCH')!;
  assert.equal(quick.state, 'FAILED');
  assert.equal(quick.code, 'PROVIDER_CREDIT_EXHAUSTED');
  assert.equal(limitationLabel(quick.code!), CREDIT_TEXT);
  assert.doesNotMatch(limitationLabel(quick.code!), /kalodata|2016|[A-Z]{3,}_/i);
  const row = state.db.prepare(`SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='QUICK_SEARCH'`).get(runId) as { sha: string };
  const stored = JSON.parse((await state.artifacts.read(row.sha)).toString('utf8')) as { limitations: { code: string }[] };
  assert.ok(stored.limitations.some(item => item.code === 'PROVIDER_CREDIT_EXHAUSTED'), 'the stored step document says why');
  return { run, state };
}

test('zero balance at QUICK_SEARCH settles with the credit code and plain text', async t => {
  await assertQuickCredit(t, { balance: 0 }, 0);
});

test('a 2016 answer on the first rank call settles the same way', async t => {
  await assertQuickCredit(t, { rank: 'CREDIT_EXHAUSTED' }, 1);
});

test('another provider failure keeps PROVIDER_FAILED and today\'s text', async t => {
  const state = await fixture(t, { rank: 'OTHER_REJECTION' });
  const run = await state.run();
  assert.equal(run.status, 'AWAITING_SCOPE');
  const quick = run.steps.find(step => step.stepId === 'QUICK_SEARCH')!;
  assert.equal(quick.state, 'FAILED');
  assert.equal(quick.code, 'PROVIDER_FAILED');
  assert.equal(limitationLabel('PROVIDER_FAILED'), 'Nguồn dữ liệu gặp lỗi; hệ thống không tự chạy lại.');
});

test('an unobserved balance does not claim a credit stop', async t => {
  const state = await fixture(t, { balance: 'MISSING' });
  const run = await state.run();
  assert.equal(run.status, 'AWAITING_SCOPE');
  assert.notEqual(run.steps.find(step => step.stepId === 'QUICK_SEARCH')!.code, 'PROVIDER_CREDIT_EXHAUSTED');
});

test('COLLECTION with a zero balance records what the code does today and keeps the completeness gate', async t => {
  const state = await fixture(t, { confirm: true, collectBalance: 0 });
  const run = await state.run();
  assert.equal(state.paid.detail, 1, 'only the quick-search detail call; no paid collection call at a zero balance');
  const collection = run.steps.find(step => step.stepId === 'COLLECTION')!;
  assert.equal(collection.code, 'PROVIDER_CREDIT_EXHAUSTED');
  assert.notEqual(run.status, 'DRAFT_READY', 'the #269 gate still blocks the draft');
  assert.ok(run.blockers.some(row => row.code.startsWith('MARKET_SOURCE_WINDOWS_MISSING')), JSON.stringify(run.blockers));
});

test('an old stored step with PROVIDER_FAILED still reads and keeps its text', async t => {
  const state = await fixture(t, { rank: 'CREDIT_EXHAUSTED' });
  // Simulate a step stored before the new code existed.
  const triggers = state.db.prepare(`SELECT name,sql FROM sqlite_master WHERE type='trigger' AND tbl_name='analysis_research_automation_steps'`).all() as { name: string; sql: string }[];
  state.db.transaction(() => {
    for (const trigger of triggers) state.db.exec(`DROP TRIGGER ${trigger.name}`);
    state.db.prepare(`UPDATE analysis_research_automation_steps SET message_code='PROVIDER_FAILED' WHERE run_id=? AND step_id='QUICK_SEARCH'`).run(runId);
    for (const trigger of triggers) state.db.exec(trigger.sql);
  })();
  const run = await state.run();
  assert.equal(run.steps.find(step => step.stepId === 'QUICK_SEARCH')!.code, 'PROVIDER_FAILED');
  assert.equal(limitationLabel('PROVIDER_FAILED'), 'Nguồn dữ liệu gặp lỗi; hệ thống không tự chạy lại.');
});
