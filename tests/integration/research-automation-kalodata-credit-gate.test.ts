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
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';

// Synthetic documentation values only: no real product ids, keys, hosts or paths.
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const productId = 'kalodata:101';
// 60 days: two planned 30-day windows per product.
const period = { startDate: '2026-07-01', endDate: '2026-08-29' } as const;
const now = () => new Date('2026-10-02T00:00:00.000Z');
const BLOCKED = 'Báo cáo bị chặn: nguồn dữ liệu TikTok Shop hết lượt truy vấn giữa chừng, thiếu doanh thu theo tháng của 1 sản phẩm. Cần nạp thêm lượt rồi chạy lại.';

type Detail = 'OK' | 'EMPTY' | 'CREDIT_EXHAUSTED' | 'OTHER_REJECTION';

async function fixture(t: TestContext, options: { details?: readonly Detail[]; configured?: boolean; selected?: readonly string[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-kalodata-credit-gate-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  let collecting = false;
  let collectionDetails = 0;
  const transport: ProviderTransport = {
    now: () => now().getTime(),
    sleep: async () => {},
    fetch: (async (input, init) => {
      const url = new URL(String(input));
      let payload: unknown;
      if (url.pathname.endsWith('/credit/balance')) payload = { success: true, data: { totalRemain: 100 } };
      else if (url.pathname.endsWith('/product/rank')) payload = { success: true, data: [{ product_id: '101', product_name: 'Synthetic thermos', unit_price: 120000 }] };
      else if (url.pathname.endsWith('/product/detail')) {
        const body = JSON.parse(String(init?.body)) as { product_id: string; date_range: string };
        const kind = collecting ? options.details?.[collectionDetails++] ?? 'OK' : 'OK';
        payload = kind === 'CREDIT_EXHAUSTED' ? { success: false, code: 2016, message: 'Insufficient credit balance' }
          : kind === 'OTHER_REJECTION' ? { success: false, code: 1001, message: 'Synthetic rejection' }
          : kind === 'EMPTY' ? { success: true, data: null }
          : { success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
            product_name: 'Synthetic thermos', revenue: 1000, sales_volumn: 7, unit_price: 120000 } };
      } else throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  };
  const provider = createResearchAutomationProviderRegistry({
    kalodataSecretKey: options.configured === false ? null : 'synthetic-secret', serpApiKey: null, apifyTokenConfigured: false,
  }, transport).get('KALODATA');
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'credit-gate', title: 'Synthetic credit gate' });
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
  const awaiting = await service.getRun(workspaceId, runId);
  assert.equal(awaiting.status, 'AWAITING_SCOPE');
  collecting = true;
  await service.confirmScope(workspaceId, runId, {
    contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Vietnam thermos source observations',
    includeTerms: ['thermos'], excludeTerms: [], selectedProductIds: [...(options.selected ?? [productId])], peerProductIds: [],
  });
  await drain();
  return { db, artifacts, service, drain, run: () => service.getRun(workspaceId, runId), collectionDetails: () => collectionDetails };
}

function reportsStep(run: Awaited<ReturnType<ResearchAutomationService['getRun']>>) {
  return run.steps.find(step => step.stepId === 'REPORTS');
}

test('a selected product with a credit-exhausted window blocks the Market draft with the owner-facing reason', async t => {
  const state = await fixture(t, { details: ['OK', 'CREDIT_EXHAUSTED'] });
  const run = await state.run();
  assert.equal(run.status, 'FAILED', 'the run must not end DRAFT_READY');
  assert.equal(state.collectionDetails(), 2);
  assert.equal(reportsStep(run)?.message, BLOCKED);
  const blocker = run.blockers.find(row => row.code === 'MARKET_SOURCE_WINDOWS_MISSING_1');
  assert.equal(blocker?.message, BLOCKED);
  assert.doesNotMatch(BLOCKED, /kalodata|2016|[A-Z]{3,}_/i);
  assert.equal(run.outputs?.market ?? null, null);
});

test('a selected product with a failed window is blocked the same way', async t => {
  const state = await fixture(t, { details: ['OTHER_REJECTION', 'OK'] });
  const run = await state.run();
  assert.equal(state.collectionDetails(), 2, 'an ordinary rejection does not stop the loop');
  assert.equal(run.status, 'FAILED');
  assert.equal(reportsStep(run)?.message, BLOCKED);
});

test('all windows OK or EMPTY pass the completeness gate', async t => {
  const state = await fixture(t, { details: ['OK', 'EMPTY'] });
  const run = await state.run();
  assert.equal(run.status, 'DRAFT_READY', JSON.stringify(run.blockers));
  assert.ok(run.outputs?.market);
});

test('no paid collection attempt keeps today\'s behaviour', async t => {
  const state = await fixture(t, { selected: [] });
  const run = await state.run();
  assert.equal(run.status, 'DRAFT_READY', JSON.stringify(run.blockers));
  assert.equal(state.collectionDetails(), 0);
  assert.ok(!run.blockers.some(row => row.code.startsWith('MARKET_SOURCE_WINDOWS_MISSING')));
});

test('a regeneration or reader build from a stored incomplete collection is blocked', async t => {
  const state = await fixture(t, { details: ['OK', 'OK'] });
  const ready = await state.run();
  assert.equal(ready.status, 'DRAFT_READY', JSON.stringify(ready.blockers));
  // The regeneration is accepted while the stored pair is still intact.
  const previousPairId = (await state.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId;
  const receipt = await state.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', previousPairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  // Simulate a collection saved before the gate existed: rewrite the second
  // window's capture as the retained insufficient-credit exchange, keeping the
  // envelope lineage (provider, operation, window, completion time).
  const row = state.db.prepare(`SELECT ordinal,artifact_sha256 sha,media_type mediaType FROM analysis_research_automation_captures
    WHERE run_id=? AND step_id='COLLECTION' AND operation='kalodata.product.detail' ORDER BY ordinal DESC LIMIT 1`).get(runId) as { ordinal: number | bigint; sha: string; mediaType: string };
  const envelope = JSON.parse((await state.artifacts.read(row.sha)).toString('utf8')) as Record<string, unknown>;
  const rejected = await state.artifacts.put(Buffer.from(canonicalJson({ ...envelope, outcome: 'PROVIDER_REJECTED', providerCode: '2016' })));
  state.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,?,?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`)
    .run(rejected.sha256, rejected.byteSize, row.mediaType, rejected.relativePath, now().toISOString(), now().toISOString());
  const guard = state.db.prepare("SELECT sql FROM sqlite_master WHERE name='analysis_research_automation_captures_no_update'").get() as { sql: string };
  state.db.transaction(() => {
    state.db.exec('DROP TRIGGER analysis_research_automation_captures_no_update');
    state.db.prepare('UPDATE analysis_research_automation_captures SET artifact_sha256=? WHERE run_id=? AND step_id=? AND ordinal=?').run(rejected.sha256, runId, 'COLLECTION', row.ordinal);
    state.db.exec(guard.sql);
  })();

  // Reader build (replay of the stored draft for a new reader report).
  await assert.rejects(state.service.buildReaderReport(workspaceId, runId, { metricPackageId: 'synthetic-package' }, { actorId: 'owner', role: 'OWNER' }),
    (error: Error) => error.message === BLOCKED);

  // Regeneration: the queued attempt stops at the completeness gate.
  const failures: string[] = [];
  t.mock.method(console, 'error', (line: unknown) => { failures.push(String(line)); });
  await state.drain();
  const attempt = await state.service.getReportRevision(workspaceId, runId, receipt.attemptId);
  assert.equal(attempt.state, 'FAILED', 'a regeneration must not commit a Market draft from an incomplete collection');
  assert.ok(failures.some(line => line.includes('"errorName":"MarketSourceWindowsMissingError"')), failures.join('\n'));
  assert.equal((await state.service.listReportVersions(workspaceId, runId)).length, 1);
});
