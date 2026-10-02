import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { FixtureShopeeCollector } from '../../src/platform/collectors/apify-shopee.js';
import { MAX_HTML_BYTES } from '../../src/modules/analysis/research-automation/model.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { createResearchAutomationProviderRegistry, type ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { seedNativeDamiPackage } from '../helpers/native-dami-package-fixture.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const url = 'https://shopee.vn/product/78085196/17678138164';
const now = () => new Date('2026-10-02T01:00:00.000Z');
async function fixture(t: TestContext, oversizedView = false, invalidMainSource = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-native-review-run-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now, uuid: () => workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-native-review', title: 'Synthetic native source acceptance' });
  let providerCalls = 0;
  const transport: ProviderTransport = { now: () => now().getTime(), sleep: async () => {}, fetch: (async (input, init) => {
    const endpoint = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const data = endpoint.pathname.endsWith('/credit/balance') ? { totalRemain: 100 }
      : endpoint.pathname.endsWith('/product/rank') ? [{ product_id: '101', product_name: 'Synthetic market product', unit_price: 100 }]
      : { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
        product_name: 'Synthetic market product', revenue: 100, sales_volumn: 1, unit_price: 100 };
    return new Response(JSON.stringify({ success: true, data }), { status: 200 });
  }) as typeof fetch };
  const mainSource = invalidMainSource ? bindResearchAutomationProvider(createResearchAutomationProviderRegistry({
    kalodataSecretKey: 'synthetic-secret', serpApiKey: null, apifyTokenConfigured: false }, transport).get('KALODATA')) : undefined;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now, uuid: () => runId,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery),
    ...(mainSource ? { source: { ...mainSource, collect: async (...args: Parameters<typeof mainSource.collect>) => {
      const bound = await mainSource.collect(...args);
      return { ...bound, step: { ...bound.step, comparables: bound.step.comparables.map(row => ({ ...row, captureIndex: 999 })) } };
    } } } : {}),
    shopeeCollectorFactory: () => ({ requestsIssued: () => providerCalls, collector: { mode: 'fixture', collect: async (...args) => {
      providerCalls++; return new FixtureShopeeCollector(Buffer.from('[]')).collect(...args);
    } } }),
    renderer: (input, kind) => {
      const result = buildResearchAutomationReport(input, kind);
      return oversizedView && kind === 'INSIGHT' && input.nativeReview ? { ...result, html: Buffer.alloc(MAX_HTML_BYTES + 1, 'x') } : result;
    } });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'Synthetic exact product', requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  const confirm = { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic exact listing; no annual review admission',
    includeTerms: [], excludeTerms: [], selectedProductIds: invalidMainSource ? ['kalodata:101'] : [], peerProductIds: [], exactShopeeUrls: [url] };
  return { root, db, artifacts, packages, service, confirm, providerCalls: () => providerCalls };
}

test('a native capture reaches adopted Insight declarations without Zen lineage or replay calls', async t => {
  const state = await fixture(t);
  const seeded = await seedNativeDamiPackage(state.packages, { rawRows: [
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '1', comment: 'Tôi đã dùng sản phẩm.', rating_star: 5 },
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '2', comment: '“Tôi đã mua sản phẩm. <script>bad()</script>”', rating_star: 5 },
    { type: 'review', shopid: '78085196', itemid: '17678138164', cmtid: '3', comment: '', rating_star: 5 },
  ] });
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  assert.equal(state.providerCalls(), 0);
  assert.equal(ready.usage.requestCount, 0);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.reviewCorpus, null);
  assert.equal(semantic.locatedReview, null);
  assert.equal(semantic.nativeReview.contractVersion, 'automation-native-review-snapshot-v1');
  assert.deepEqual(semantic.nativeReview.nativeSource.sourcePackage, seeded.identity);
  assert.deepEqual(semantic.nativeReview.output.input.i04.map((row: { span: { quote: string }; provenance: { basis: string } }) =>
    [row.span.quote, row.provenance.basis]), [['Tôi đã dùng sản phẩm', 'DECLARED']]);
  assert.ok(semantic.nativeReview.projection.pending.some((row: { reason: string }) => row.reason === 'QUOTED_TEXT_SCOPE'));
  assert.equal(semantic.completion.completedAnalyticalSections, 0);
  const retained = await state.packages.readVerified(semantic.nativeReview.sourcePackage.packageId);
  for (const [name, bytes] of seeded.files) assert.deepEqual(retained.files.find(file => file.path === name)!.bytes, bytes);
  const before = state.db.prepare('SELECT total_changes() n').get();
  const view = await state.service.readReport(workspaceId, runId, 'INSIGHT');
  const dom = new JSDOM(view.bytes.toString());
  try {
    assert.equal(dom.window.document.querySelector('#I04 tbody q')?.textContent, 'Tôi đã dùng sản phẩm');
    assert.match(dom.window.document.getElementById('I03')!.textContent!, /3 dòng nguồn: 2 đưa vào đọc, 1 loại khỏi đọc/);
    assert.match(dom.window.document.getElementById('I17')!.textContent!, /Nguồn review native đã lưu/);
    assert.equal(dom.window.document.querySelectorAll('script, img, [onerror]').length, 0);
  } finally { dom.window.close(); }
  assert.deepEqual((await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes, view.bytes);
  await state.service.readReport(workspaceId, runId, 'MARKET');
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  const dataset = seeded.identity.manifest.files.find(file => file.path === 'capture/dataset.json')!.sha256;
  await fs.writeFile(path.join(state.root, 'artifacts', 'sha256', dataset.slice(0, 2), dataset), 'corrupt');
  await assert.rejects(state.service.readReport(workspaceId, runId, 'INSIGHT'));
  assert.equal(state.providerCalls(), 0);
});

test('ambiguous native originals block paid fallback; unrelated listings and derived overlays are not reused', async t => {
  for (const mode of ['ambiguous', 'wrong-listing', 'derived-overlay'] as const) await t.test(mode, async sub => {
    const state = await fixture(sub);
    await seedNativeDamiPackage(state.packages, mode === 'wrong-listing' ? { selected: { shopId: '99', itemId: '100' } }
      : mode === 'derived-overlay' ? { extraFiles: new Map([['methods/literal-declaration-projection.json', Buffer.from('{}')]]) } : {});
    if (mode === 'ambiguous') await seedNativeDamiPackage(state.packages, { packageKey: 'synthetic-source:second-capture', captureRunId: 'second-run' });
    await state.service.confirmScope(workspaceId, runId, state.confirm);
    await state.service.processNext(); await state.service.processNext();
    const ready = await state.service.getRun(workspaceId, runId);
    assert.equal(ready.status, 'DRAFT_READY');
    const semantic = JSON.parse((await state.artifacts.read(ready.outputs!.insight!.versionId)).toString());
    assert.equal(semantic.nativeReview, null);
    assert.equal(state.providerCalls(), mode === 'ambiguous' ? 0 : 1);
    if (mode === 'ambiguous') assert.ok(ready.blockers.some(row => row.code === 'NATIVE_SOURCE_AMBIGUOUS'));
  });
});

test('oversized native presentation preserves paired reports and the full frozen method package', async t => {
  const state = await fixture(t, true);
  await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.outputs?.market && ready.outputs.insight);
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs.insight.versionId)).toString());
  assert.equal(semantic.nativeReview, null);
  assert.equal(semantic.nativeReviewFailure, 'NATIVE_REVIEW_REPORT_TOO_LARGE');
  assert.ok(semantic.nativeReviewFallback.sourcePackage.packageId);
  const before = state.db.prepare('SELECT total_changes() n').get();
  assert.match((await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes.toString(), /NATIVE_REVIEW_REPORT_TOO_LARGE/);
  await state.service.readReport(workspaceId, runId, 'MARKET');
  assert.deepEqual(state.db.prepare('SELECT total_changes() n').get(), before);
  assert.equal(state.providerCalls(), 0);
});

test('invalid market observation lineage does not discard an independently verified native source', async t => {
  const state = await fixture(t, false, true);
  await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext(); await state.service.processNext();
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  assert.ok(ready.blockers.some(row => row.code === 'PROVIDER_OUTPUT_INVALID'));
  const semantic = JSON.parse((await state.artifacts.read(ready.outputs!.insight!.versionId)).toString());
  assert.equal(semantic.nativeReview.authorityState, 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS');
  assert.equal(semantic.nativeReview.output.input.i04.length, 1);
  assert.equal(state.providerCalls(), 0);
});

test('native method publication failure describes the retained source instead of asking to recollect', async t => {
  const state = await fixture(t);
  await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  await state.service.processNext();
  const put = state.artifacts.put.bind(state.artifacts);
  state.artifacts.put = async (...args) => {
    if (Buffer.from(args[0]).includes(Buffer.from('automation-native-review-run-v1'))) throw new Error('Synthetic method publication failure');
    return put(...args);
  };
  try { await state.service.processNext(); } finally { state.artifacts.put = put; }
  const ready = await state.service.getRun(workspaceId, runId);
  assert.equal(ready.status, 'DRAFT_READY');
  const html = (await state.service.readReport(workspaceId, runId, 'INSIGHT')).bytes.toString();
  assert.match(html, /NATIVE_REVIEW_METHOD_FAILED/);
  assert.match(html, /Nguồn review native của đúng listing đã được gắn/);
  assert.doesNotMatch(html, /Chưa có corpus review gắn với lượt này/);
  assert.equal(state.providerCalls(), 0);
});

test('cancellation during native inventory IO settles the claimed collection without provider fallback', { timeout: 10_000 }, async t => {
  const state = await fixture(t);
  const seeded = await seedNativeDamiPackage(state.packages);
  await state.service.confirmScope(workspaceId, runId, state.confirm);
  const datasetSha = seeded.identity.manifest.files.find(file => file.path === 'capture/dataset.json')!.sha256;
  let release!: () => void; let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const waiting = new Promise<void>(resolve => { entered = resolve; });
  const read = state.artifacts.read.bind(state.artifacts);
  let held = false;
  state.artifacts.read = async (...args) => {
    const bytes = await read(...args);
    if (args[0] === datasetSha && !held) { held = true; entered(); await gate; }
    return bytes;
  };
  const processing = state.service.processNext();
  try {
    await waiting;
    const active = await state.service.getRun(workspaceId, runId);
    await state.service.cancel(workspaceId, runId, { contractVersion: 'research-automation-cancel-v1',
      requestKey: '55555555-5555-4555-8555-555555555555', expectedRevision: active.revision });
  } finally { release(); }
  await processing;
  const cancelled = await state.service.getRun(workspaceId, runId);
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(cancelled.steps.find(row => row.stepId === 'COLLECTION')!.state, 'CANCELLED');
  assert.equal(state.providerCalls(), 0);
});
