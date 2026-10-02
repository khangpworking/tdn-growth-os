import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { spawnSync } from 'node:child_process';
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import type { ResearchAutomationRun } from '../../contracts/api/research-automation-api.generated.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService, ResearchAutomationWorker, bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/index.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { MAX_CAPTURES_PER_STEP } from '../../src/modules/analysis/research-automation/model.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const productId = 'kalodata:101';
const period = { startDate: '2026-09-01', endDate: '2026-09-30' } as const;
const now = () => new Date('2026-10-02T00:00:00.000Z');

interface SavedSemantic {
  readonly kind: 'MARKET' | 'INSIGHT';
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly descriptiveMethodFailure?: string;
  readonly completion: {
    readonly completedAnalyticalSections: number;
    readonly boundedMethodOutputSectionIds: readonly string[];
    readonly boundedMethodNoUsableRecordSectionIds: readonly string[];
  };
  readonly state: string;
}

async function fixture(t: TestContext, kind: 'MARKET' | 'INSIGHT' | 'BOTH' = 'MARKET', fault?: 'method' | 'normalization' | 'step-lineage' | 'capture-bound' | 'unsettled', reviews = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-automation-methods-'));
  const db = openDatabase({ databasePath: path.join(root, 'db.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  let calls = 0;
  const transport: ProviderTransport = {
    now: () => now().getTime(),
    sleep: async () => {},
    fetch: (async (input, init) => {
      calls += 1;
      const url = new URL(String(input));
      let payload: unknown;
      if (url.pathname.endsWith('/credit/balance')) {
        payload = { success: true, data: { totalRemain: 100 } };
      } else if (url.pathname.endsWith('/product/rank')) {
        payload = { success: true, data: [{ product_id: '101', product_name: 'Synthetic thermos', unit_price: 120000 }] };
      } else if (url.pathname.endsWith('/product/detail')) {
        const body = JSON.parse(String(init?.body)) as { product_id: string; date_range: string };
        payload = { success: true, data: {
          product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: fault === 'method' ? 'unverified provider period' : body.date_range,
          product_name: 'Synthetic thermos', revenue: 0, sales_volumn: 7, unit_price: 120000,
        } };
      } else {
        throw new Error(`Unexpected fixture endpoint: ${url.pathname}`);
      }
      return new Response(JSON.stringify(payload), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
  };
  const provider = createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-secret', serpApiKey: null, apifyTokenConfigured: false,
  }, transport).get('KALODATA');
  const source = bindResearchAutomationProvider(fault === 'normalization' ? {
    ...provider,
    async collect(input, options) {
      const result = await provider.collect(input, options);
      return { ...result, productObservations: result.productObservations.map(row => ({ ...row, captureId: 'missing-response' })) };
    },
  } : provider);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'method-integration', title: 'Synthetic method integration' });
  const service = new ResearchAutomationService({
    db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    ...(reviews ? { shopeeCollectorFactory: () => ({ requestsIssued: () => 0, collector: new FixtureShopeeCollector(Buffer.from(JSON.stringify([
      { shopId: '78085196', itemId: '17678138164', reviewId: 'synthetic-independent', comment: 'Retained independent review', ratingStar: 5 },
    ]))) }) } : {}),
    source: fault === 'step-lineage' || fault === 'capture-bound' || fault === 'unsettled' ? { ...source, async collect(input, options) {
      const bound = await source.collect(input, options);
      if (fault === 'unsettled') throw new Error('simulated collector failure without receipt');
      if (fault === 'capture-bound') return { ...bound, result: { ...bound.result, captures: Array.from({ length: MAX_CAPTURES_PER_STEP + 1 }, () => bound.result.captures[0]!) } };
      return { ...bound, step: { ...bound.step, comparables: bound.step.comparables.map(row => ({ ...row, captureIndex: 999 })) } };
    } } : source, uuid: () => runId, now,
    renderer: (input, kind) => {
      const rendered = buildResearchAutomationReport(input, kind);
      // A presentation adapter can omit the method payload. Its retention must
      // still be owned by the service rather than depending on this adapter.
      const { descriptiveMethods: _methods, ...semantic } = rendered.semantic as Record<string, unknown>;
      return { ...rendered, semantic };
    },
  });
  const worker = new ResearchAutomationWorker({ service, db });
  t.after(async () => {
    await worker.close();
    db.close();
    await fs.rm(root, { recursive: true, force: true });
  });

  async function waitFor(status: ResearchAutomationRun['status']): Promise<ResearchAutomationRun> {
    for (let attempt = 0; attempt < 200; attempt += 1) {
      if (worker.lastError !== undefined) throw worker.lastError;
      const run = await service.getRun(workspaceId, runId);
      if (run.status === status) return run;
      assert.notEqual(run.status, 'FAILED', `Run failed before reaching ${status}: ${JSON.stringify(run.blockers)}`);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    throw new Error(`Timed out waiting for ${status}`);
  }

  await service.start(workspaceId, {
    contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'thermos', requestedPeriod: period, reports: kind === 'BOTH' ? ['MARKET', 'INSIGHT'] : [kind],
  });
  await worker.start();
  const awaiting = await waitFor('AWAITING_SCOPE');
  await service.confirmScope(workspaceId, runId, {
    contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Vietnam thermos source observations',
    includeTerms: ['thermos'], excludeTerms: [], selectedProductIds: [productId], peerProductIds: [],
    ...(reviews ? { exactShopeeUrls: ['https://shopee.vn/product/78085196/17678138164'] } : {}),
  });
  worker.wake();
  const ready = await waitFor('DRAFT_READY');
  await worker.close();
  const semanticSha = (kind !== 'INSIGHT' ? ready.outputs?.market : ready.outputs?.insight)?.versionId;
  assert.ok(semanticSha, `Worker must persist a ${kind} semantic version`);
  const semantic = JSON.parse((await artifacts.read(semanticSha)).toString('utf8')) as SavedSemantic;
  const changes = () => (db.prepare('SELECT total_changes() AS count').get() as { count: bigint }).count;
  const sourcePackages = new SourcePackageService({ db, artifactStore: artifacts, now });
  return { root, db, artifacts, service, semantic, ready, sourcePackages, changes, calls: () => calls };
}

// The owner boundary must generate, retain and replay method output; provider and
// renderer unit tests cannot detect a missing worker-to-method connection.
test('collection executes source-bound methods and saves zero-safe partial results that replay without writes or collection', async t => {
  const state = await fixture(t);
  const methods = state.semantic.descriptiveMethods;
  assert.ok(methods, 'REPORTS must execute and persist the existing descriptive method');
  assert.equal(methods.methodId, 'source-bound-descriptive-market');
  assert.equal(methods.methodVersion, '1.0.0');
  assert.deepEqual(methods.input.m05.map(row => [row.measureLiteral, row.observation.state, row.observation.value]), [
    ['revenue', 'observed_zero', '0'], ['sales_volumn', 'observed_value', '7'],
  ]);
  assert.equal(methods.sections.M05.locatedRecordCount, 2);
  assert.equal(methods.sections.M05.partitions.length, 2);
  assert.ok(methods.sections.M05.partitions.every(partition => partition.subtotal === null && partition.complete === false));
  assert.equal(methods.sections.M05.partitions.reduce((count, partition) => count + partition.coverage.zeroCount, 0), 1);
  assert.equal(methods.sections.M06.locatedRecordCount, 1);
  assert.equal(methods.sections.M06.uniqueEntityCount, null);
  assert.equal(methods.sections.M07.mode, 'UNRANKED_INVENTORY');
  assert.deepEqual(methods.sections.M07.comparisons, []);
  assert.equal(state.semantic.completion.completedAnalyticalSections, 0);
  assert.deepEqual(state.semantic.completion.boundedMethodOutputSectionIds, ['M05', 'M06', 'M07']);
  assert.deepEqual(state.semantic.completion.boundedMethodNoUsableRecordSectionIds, ['M09']);
  assert.equal(state.semantic.state, 'PARTIAL_UNREVIEWED_DRAFT');

  const retained = await state.sourcePackages.readVerified(methods.input.sourcePackage.packageId);
  assert.equal(retained.manifestArtifactSha256, methods.input.sourcePackage.manifestArtifactSha256);
  assert.equal(retained.packageContentSha256, methods.input.sourcePackage.packageContentSha256);
  assert.ok(retained.files.some(file => file.representationRole === 'primary' && file.mediaType === 'application/vnd.tdn.research-automation.capture+json'));
  assert.equal((state.db.prepare('SELECT count(*) AS count FROM analysis_metric_input_preparations').get() as { count: bigint }).count, 0n);

  const before = { changes: state.changes(), calls: state.calls() };
  const first = await state.service.readReport(workspaceId, runId, 'MARKET');
  const replay = await state.service.readReport(workspaceId, runId, 'MARKET');
  assert.equal(replay.versionId, first.versionId);
  assert.deepEqual(replay.bytes, first.bytes);
  assert.match(first.bytes.toString('utf8'), /revenue/);
  assert.match(first.bytes.toString('utf8'), /sales_volumn/);
  assert.deepEqual({ changes: state.changes(), calls: state.calls() }, before);
});

test('independent reviews and unknown-cost accounting survive main-source retention rejection or an unsettled collector', async t => {
  for (const fault of ['capture-bound', 'unsettled'] as const) await t.test(fault, async sub => {
    const state = await fixture(sub, 'BOTH', fault, true);
    assert.equal(state.ready.steps.find(row => row.stepId === 'COLLECTION')?.state, 'PARTIAL');
    const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
    assert.match(report.bytes.toString(), /Retained independent review/);
    assert.equal((state.db.prepare("SELECT count(*) n FROM analysis_research_automation_captures WHERE step_id='COLLECTION'").get() as { n: bigint }).n, 0n, 'invalid main capture set is not silently shortened');
    const rows = state.db.prepare("SELECT provider,cost_state AS state,operation FROM analysis_research_automation_usage WHERE step_id='COLLECTION' ORDER BY ordinal").all() as { provider: string; state: string; operation: string }[];
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.provider, 'kalodata');
    assert.equal(rows[0]?.state, 'UNKNOWN');
    assert.equal(rows[1]?.provider, 'apify-shopee');
    assert.equal(state.ready.usage.hasUnknownCost, true);
    if (fault === 'unsettled') assert.equal(rows[0]?.operation, 'unsettled-collection');
    const before = { calls: state.calls(), changes: state.changes() };
    await state.service.readReport(workspaceId, runId, 'INSIGHT');
    assert.deepEqual({ calls: state.calls(), changes: state.changes() }, before);
  });
});

test('a committed report remains readable when the active calculator and adoption change', async t => {
  const state = await fixture(t);
  const original = await state.service.readReport(workspaceId, runId, 'MARKET');
  const before = state.changes();
  const read = spawnSync(process.execPath, ['--import', 'tsx', 'tests/fixtures/research-historical-read.mjs',
    path.join(state.root, 'db.sqlite'), path.join(state.root, 'artifacts'), workspaceId, runId], { encoding: 'utf8' });
  assert.equal(read.status, 0, read.stderr);
  assert.equal(read.stdout.trim(), original.versionId);
  assert.equal(state.changes(), before);
});

test('a Market method admission failure leaves both source-context drafts readable without unchecked numeric fallback', async t => {
  const state = await fixture(t, 'BOTH', 'method');
  assert.equal(state.semantic.descriptiveMethodFailure, 'DESCRIPTIVE_METHOD_FAILED');
  assert.equal(state.semantic.descriptiveMethods, undefined);
  assert.deepEqual(state.semantic.completion.boundedMethodOutputSectionIds, []);
  assert.ok(state.ready.outputs?.insight);
  const market = await state.service.readReport(workspaceId, runId, 'MARKET');
  assert.match(market.bytes.toString(), /Chưa tính được các mục mô tả thị trường/);
  assert.doesNotMatch(market.bytes.toString(), /data-observation-table/);
  const insight = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  assert.match(insight.bytes.toString(), /Báo cáo insight/);
  assert.doesNotMatch(insight.bytes.toString(), /Chưa tính được các mục mô tả thị trường/);
});

test('invalid collection normalization retains paid exchanges and usage but excludes invalid observations', async t => {
  for (const [fault, reviews] of [['normalization', false], ['step-lineage', false], ['step-lineage', true]] as const) await t.test(`${fault}${reviews ? ' with independent reviews' : ''}`, async subtest => {
    const state = await fixture(subtest, 'BOTH', fault, reviews);
    const step = state.ready.steps.find(row => row.stepId === 'COLLECTION');
    assert.equal(step?.state, reviews ? 'PARTIAL' : 'FAILED');
    assert.ok(state.ready.blockers.some(row => row.code === 'PROVIDER_OUTPUT_INVALID'));
    assert.equal(state.semantic.descriptiveMethods, undefined);
    const rows = state.db.prepare("SELECT artifact_sha256 AS sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal").all(runId) as { sha: string }[];
    assert.equal(rows.length, 3, 'Two balance responses and the completed paid detail response must survive');
    const envelopes = await Promise.all(rows.map(async row => JSON.parse((await state.artifacts.read(row.sha)).toString())));
    const detail = envelopes.find(row => row.operation === 'kalodata.product.detail');
    assert.ok(detail);
    assert.deepEqual(JSON.parse(Buffer.from(detail.responseBytesBase64, 'base64').toString()), { success: true, data: {
      product_id: '101', product_region: 'vn', currency: 'VND', date_range: '2026-09-01~2026-09-30',
      product_name: 'Synthetic thermos', revenue: 0, sales_volumn: 7, unit_price: 120000,
    } });
    const usage = state.db.prepare("SELECT request_count AS count FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' AND ordinal=0").get(runId) as { count: bigint };
    assert.equal(usage.count, 3n);
    const result = state.db.prepare("SELECT result_sha256 AS sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(runId) as { sha: string };
    const saved = JSON.parse((await state.artifacts.read(result.sha)).toString());
    assert.deepEqual(saved.comparables, []);
    if (reviews) {
      assert.ok(saved.exactShopee, 'successful independent collection remains reachable from the frozen run');
      assert.equal(saved.coverage.length, 1);
      assert.equal(saved.coverage[0].provider, 'apify-shopee');
      const insight = await state.service.readReport(workspaceId, runId, 'INSIGHT');
      assert.match(insight.bytes.toString(), /Retained independent review/);
    } else assert.deepEqual(saved.coverage, []);
    await state.service.readReport(workspaceId, runId, 'MARKET');
    await state.service.readReport(workspaceId, runId, 'INSIGHT');
  });
});

test('Insight-only collection drafts and reads without creating a Market method package or output', async t => {
  const state = await fixture(t, 'INSIGHT');
  assert.equal(state.ready.steps.find(step => step.stepId === 'COLLECTION')?.state, 'SUCCEEDED');
  assert.equal(state.ready.outputs?.market, undefined);
  assert.equal(state.semantic.kind, 'INSIGHT');
  assert.equal(state.semantic.descriptiveMethods, undefined);
  assert.equal((state.db.prepare('SELECT count(*) AS count FROM foundation_source_packages').get() as { count: bigint }).count, 0n);
  assert.deepEqual(state.semantic.completion.boundedMethodOutputSectionIds, []);
  assert.equal(state.semantic.completion.completedAnalyticalSections, 0);

  const before = { changes: state.changes(), calls: state.calls() };
  const report = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  assert.equal(report.versionId, state.ready.outputs?.insight?.versionId);
  assert.equal(report.mediaType, 'text/html; charset=utf-8');
  assert.match(report.bytes.toString('utf8'), /Báo cáo insight/);
  assert.deepEqual({ changes: state.changes(), calls: state.calls() }, before);
});

// Corruption targets live artifacts produced by the service. Neither test supplies
// a normalized descriptor, source receipt, method result or admission callback.
test('saved report reads reject damaged raw and package-derived evidence without writing or recollecting', async t => {
  for (const target of ['raw capture', 'normalized source'] as const) {
    await t.test(target, async subtest => {
      const state = await fixture(subtest);
      const methods = state.semantic.descriptiveMethods;
      assert.ok(methods, 'Corruption must reach a report with real retained method output');
      const retained = await state.sourcePackages.readVerified(methods.input.sourcePackage.packageId);
      const file = retained.files.find(candidate => target === 'raw capture'
        ? candidate.representationRole === 'primary' && candidate.mediaType === 'application/vnd.tdn.research-automation.capture+json'
        : candidate.representationRole === 'derived' && candidate.evidenceFamily === 'kalodata-automation');
      assert.ok(file, `No retained ${target} to corrupt`);
      const before = { changes: state.changes(), calls: state.calls() };
      const damaged = Buffer.from(file.bytes);
      damaged[damaged.length - 1] = damaged[damaged.length - 1] === 32 ? 33 : 32;
      await fs.writeFile(state.artifacts.pathForDigest(file.sha256), damaged);
      await assert.rejects(() => state.service.readReport(workspaceId, runId, 'MARKET'), ArtifactIntegrityError);
      assert.deepEqual({ changes: state.changes(), calls: state.calls() }, before);
      assert.deepEqual(await fs.readFile(state.artifacts.pathForDigest(file.sha256)), damaged);
    });
  }
});
