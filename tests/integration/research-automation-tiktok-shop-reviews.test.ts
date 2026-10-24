import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { createTikTokShopReviewsSource, TIKTOK_SHOP_REVIEWS_DOCUMENT_MEDIA_TYPE, validTikTokShopReviewsStep } from '../../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { offlineTransport, PRIVATE_FIELDS, REVIEW_TEXT, REVIEW_TEXTS, reviewPayload } from '../unit/tiktok-shop-reviews.fixtures.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');

async function runToDraft(t: TestContext, flag: string | undefined, reject = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s06-test-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const frontendDist = path.join(root, 'frontend');
  await fs.mkdir(frontendDist);
  await fs.writeFile(path.join(frontendDist, 'index.html'), '<!doctype html><title>Synthetic</title>');
  const configuration = (value: string | undefined) => operatorAppConfigurationFromEnvironment({
    TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts'),
    ...(value === undefined ? {} : { TDN_RESEARCH_TIKTOK_SHOP_REVIEWS_ENABLED: value }),
  }, { frontendDist, version: 'synthetic' });
  const reviews = offlineTransport({ paidReply: productId => ({ status: reject ? 500 : 200,
    payload: reject ? { success: false, message: REVIEW_TEXT, ...PRIVATE_FIELDS } : reviewPayload(productId) }) });
  const transport: ProviderTransport = {
    now: reviews.transport.now, sleep: reviews.transport.sleep,
    fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname.endsWith('/comment/insight') || url.pathname.endsWith('/credit/balance')) return reviews.transport.fetch(input, init);
      const body = JSON.parse(String(init?.body)) as { product_id: string; date_range: string };
      const payload = url.pathname.endsWith('/product/rank')
        ? { success: true, data: [{ product_id: '101', product_name: 'Synthetic container', unit_price: 1000 }] }
        : url.pathname.endsWith('/product/detail')
          ? { success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
            product_name: 'Synthetic container', revenue: 1000, sales_volumn: 5, unit_price: 1000 } }
          : assert.fail('Unexpected offline endpoint');
      return new Response(JSON.stringify(payload), { status: 200 });
    },
  };
  const provider = createKalodataProvider('s06-synthetic-offline-auth', transport);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 's06', title: 'Synthetic S06 run' });
  let nextUuid = 0;
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, now,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), source: bindResearchAutomationProvider(provider),
    renderer: (input, kind) => buildResearchAutomationReport(input, kind),
    uuid: () => nextUuid++ === 0 ? runId : `99999999-9999-4999-8999-${String(nextUuid).padStart(12, '0')}`,
    ...(configuration(flag).researchTikTokShopReviews ? { tiktokShopReviewsSource: createTikTokShopReviewsSource(provider) } : {}),
  });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'PRODUCT', keyword: 'synthetic container', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: ['MARKET', 'INSIGHT'] });
  await service.processNext();
  const awaiting = await service.getRun(workspaceId, runId);
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: awaiting.revision, definition: 'Synthetic container scope', includeTerms: [], excludeTerms: [],
    selectedProductIds: ['kalodata:101'], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 15 && await service.processNext(); i++) { /* drain this synthetic run */ }
  const run = await service.getRun(workspaceId, runId);
  assert.equal(run.status, 'DRAFT_READY', JSON.stringify(run.blockers));
  const steps = await Promise.all((db.prepare('SELECT step_id id,result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND result_sha256 IS NOT NULL ORDER BY step_id').all(runId) as { id: string; sha: string }[])
    .map(async row => ({ id: row.id, bytes: await artifacts.read(row.sha) })));
  const collection = JSON.parse(steps.find(s => s.id === 'COLLECTION')!.bytes.toString()) as StepResultDocument;
  const html = await Promise.all((['MARKET', 'INSIGHT'] as const).map(async kind => (await service.readReport(workspaceId, runId, kind)).bytes));
  return { db, artifacts, service, configuration, reviews, steps, collection, html };
}

test('S06 row 1: exact flag configuration; off has no lane, step field or changed stored bytes', async t => {
  const baseline = await runToDraft(t, undefined);
  for (const [value, enabled] of [[undefined, false], ['0', false], ['1', true], ['', false], ['true', false], ['2', false], [' 1', false], ['1 ', false]] as const) {
    const config = baseline.configuration(value);
    assert.equal(config.researchTikTokShopReviews === true, enabled, String(value));
    assert.equal('researchTikTokShopReviews' in config, enabled, 'disabled flag omits the lane configuration');
  }
  const off = await runToDraft(t, '0');
  for (const result of [baseline, off]) {
    assert.equal('tiktokShopReviews' in result.collection, false);
    assert.equal(result.reviews.calls.filter(c => c.url.pathname.endsWith('/comment/insight')).length, 0);
    assert.equal((result.db.prepare('SELECT count(*) n FROM analysis_research_automation_usage WHERE run_id=? AND ordinal=20').get(runId) as { n: number | bigint }).n.toString(), '0');
    for (const [i, kind] of (['MARKET', 'INSIGHT'] as const).entries()) {
      assert.ok((await result.service.readReport(workspaceId, runId, kind)).bytes.equals(result.html[i]!), 'stored report bytes replay exactly');
    }
  }
  assert.deepEqual(off.steps, baseline.steps, 'all retained step bytes match with flag unset or zero');
});

test('S06 row 6: review text is private to capture/artifact, absent from every step, report and log', async t => {
  const logs: string[] = [];
  for (const method of ['log', 'warn', 'error', 'info', 'debug'] as const)
    t.mock.method(console, method, (...args: unknown[]) => { logs.push(args.map(value => typeof value === 'string' ? value : JSON.stringify(value)).join(' ')); });
  for (const reject of [false, true]) {
    const result = await runToDraft(t, '1', reject);
    const summary = result.collection.tiktokShopReviews;
    assert.ok(summary);
    assert.equal(validTikTokShopReviewsStep(summary), true);
    assert.equal(summary.status, reject ? 'FAILED' : 'COLLECTED');
    const captures = result.db.prepare("SELECT artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND operation='kalodata.product.comment.insight'").all(runId) as { sha: string }[];
    assert.equal(captures.length, 1, 'the real lane ran and retained a private review capture');
    const capture = (await result.artifacts.read(captures[0]!.sha)).toString();
    // Captures retain original bytes encoded in the envelope.
    const envelope = JSON.parse(capture) as { responseBytesBase64: string };
    assert.ok(Buffer.from(envelope.responseBytesBase64, 'base64').toString().includes(REVIEW_TEXT), 'raw review is retained privately');
    assert.ok(summary.documentSha256);
    const document = (await result.artifacts.read(summary.documentSha256)).toString();
    const manifest = result.db.prepare('SELECT media_type media FROM artifact_manifests WHERE sha256=?').get(summary.documentSha256) as { media: string };
    assert.equal(manifest.media, TIKTOK_SHOP_REVIEWS_DOCUMENT_MEDIA_TYPE);
    assert.equal(document.includes(REVIEW_TEXT), !reject);
    for (const bytes of [...result.steps.map(s => s.bytes), ...result.html]) {
      const text = bytes.toString();
      for (const value of [...REVIEW_TEXTS, ...Object.values(PRIVATE_FIELDS)]) assert.ok(!text.includes(value), 'private content leaked outside private artifact');
    }
    const callsBeforeReplay = result.reviews.calls.length;
    for (const kind of ['MARKET', 'INSIGHT'] as const) await result.service.readReport(workspaceId, runId, kind);
    assert.equal(result.reviews.calls.length, callsBeforeReplay, 'reading stored reports issues no requests');
  }
  assert.ok(logs.some(line => line.includes('research_automation_tiktok_shop_reviews_channel')), 'report build evaluated the channel gate');
  for (const line of logs) for (const value of [...REVIEW_TEXTS, ...Object.values(PRIVATE_FIELDS)]) assert.ok(!line.includes(value), 'private content leaked to console');
  const channelLogs = logs.filter(line => line.includes('research_automation_tiktok_shop_reviews_channel'));
  assert.ok(channelLogs.every(line => !line.includes('"share"')), 'only the decision code is logged');
});
