import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { setImmediate } from 'node:timers/promises';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { AutomationKalodataVideoIntake } from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { openResearchAutomationApi, type ResearchAutomationApiApplication, type ResearchAutomationApiConfiguration } from '../../src/api/research-automation-api.js';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, retainedTikTokCapture } from '../../src/platform/collectors/apify-tiktok-comments.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';

export const S07F_WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const S07F_RUN = '22222222-2222-4222-8222-222222222222';
export const S07F_NOW = () => new Date('2026-10-25T00:00:00Z');
export const s07fUrl = (id: number) => `https://www.tiktok.com/@synthetic.seller/video/${id}`;
export const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');

// This fixture deliberately imports only APIs already present on origin/main so its exact legacy bytes can be frozen there.
export async function legacyCaptureBytes() {
  const collector = new ApifyTikTokCommentsCollector({ privacy: createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 71), keyId: S07F_WORKSPACE }),
    approvedMaxTotalChargeUsd: 5, transport: {
      async start() { return { runId: 'syntheticLegacyRun', datasetId: 'syntheticLegacyDataset', buildId: null, status: 'SUCCEEDED',
        retrievedAt: '2026-10-25T00:00:00Z', providerTotalRows: 1, usageTotalUsd: 0.002 }; },
      async readPage() { return Buffer.from(JSON.stringify([{ item_type: 'comment', video_id: '1001', comment_id: '2001',
        reply_to_comment_id: '0', text: 'Synthetic product', like_count: 7, created_at_utc: '2024-01-01T00:00:00Z', user_id: '998877665544' }])); },
    } });
  const capture = await collector.collect([s07fUrl(1001)], 'a'.repeat(64));
  return Buffer.from(canonicalJson({ capture: retainedTikTokCapture(capture), pages: capture.pages.map(page => page.bytes.toString()) }));
}

/** A real API worker over an isolated SQLite database, with synthetic provider HTTP and no listening socket. */
export async function s07fQueuedRun(t: Pick<TestContext, 'after'>, options: {
  reports?: ('MARKET' | 'INSIGHT')[];
  videos?: { url: string; revenue: string }[];
  rankedTopSelling?: boolean;
} = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s07f-worker-'));
  const databasePath = path.join(root, 'test.sqlite'), artifactRoot = path.join(root, 'artifacts');
  const db = openDatabase({ databasePath, now: S07F_NOW }).db;
  let application: ResearchAutomationApiApplication | undefined;
  t.after(async () => { await application?.close(); db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, now: S07F_NOW, uuid: () => S07F_WORKSPACE });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 's07f-synthetic', title: 'Synthetic S07F workspace' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now: S07F_NOW, uuid: () => S07F_RUN,
    source: syntheticProductSource({ salesBytes: Buffer.from('{"data":[]}') }), renderer: buildResearchAutomationReport });
  await service.start(S07F_WORKSPACE, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: 'synthetic product', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: options.reports ?? ['INSIGHT'] });
  await service.processNext();
  if (options.videos?.length) {
    const csv = Buffer.from('video,creator,revenue,views,units,ad_spend,publish_date,product_link\n' + options.videos
      .map(video => `${video.url},synthetic,${video.revenue},,,,,${options.rankedTopSelling ? '' : 'https://www.kalodata.com/products/12345'}`).join('\n'));
    await new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(artifactRoot), db, S07F_NOW).prepare({
      contractVersion: 'automation-video-prepare-v1', requestKey: '55555555-5555-4555-8555-555555555555',
      table: 'video', sourceLabel: 'Synthetic sales videos', acquiredAt: null }, csv, 'synthetic.csv', { workspaceId: S07F_WORKSPACE, runId: S07F_RUN });
  }
  await service.confirmScope(S07F_WORKSPACE, S07F_RUN, { contractVersion: 'research-automation-confirm-v2',
    requestKey: '44444444-4444-4444-8444-444444444444', expectedRevision: (await service.getRun(S07F_WORKSPACE, S07F_RUN)).revision,
    definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [],
    sources: { metric: { decision: 'SKIPPED' }, nativeReview: 'SKIP' } });
  const providerCalls: string[] = [];
  const transport: ProviderTransport = { now: () => S07F_NOW().getTime(), sleep: async () => {}, async fetch(input, init) {
    const endpoint = new URL(String(input)); providerCalls.push(endpoint.pathname);
    assert.equal(endpoint.hostname, 'www.kalodata.com', 'unexpected HTTP never leaves the fake transport');
    if (endpoint.pathname.endsWith('/credit/balance')) return Response.json({ success: true, data: { totalRemain: 10 } });
    if (endpoint.pathname.endsWith('/video/rank') && options.rankedTopSelling) return Response.json({ success: true, data: [
      { video_id: '9001', belonged_creator_handle: 'synthetic.seller', revenue: 2, views: 10 },
      { video_id: '1002', belonged_creator_handle: 'synthetic.seller', revenue: 1, views: 10 },
    ] });
    assert.ok(endpoint.pathname.endsWith('/product/detail'), 'only the existing product collection is needed');
    const body = JSON.parse(String(init?.body));
    return Response.json({ success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND',
      date_range: body.date_range, product_name: 'Synthetic product', revenue: 100, sales_volumn: 5, unit_price: 1000 } });
  } };
  const origin = 'http://127.0.0.1:18787';
  const config = { databasePath, artifactRoot, origin,
    owner: { databasePath, artifactRoot, allowedOrigin: origin, writeEnabled: true, actorId: 'owner:synthetic', token: 'synthetic-owner-auth-01234567890123456789' },
    // The existing S14 lookup runs over the fake HTTP port. A missing video model skips media work entirely.
    ...(options.rankedTopSelling ? { topSellingVideos: true as const, videoWatch: { mediaDir: path.join(root, 'media'),
      modelId: 'gemini-synthetic-s07f', cliproxy: null, ytdlpBin: 'unused', ffprobeBin: 'unused' } } : {}),
    providers: { kalodataSecretKey: 'synthetic-product-auth', serpApiKey: null, apifyTokenConfigured: true,
      apifyTikTokComments: { maxChargeUsd: 5 }, apifyTikTokFreeComments: { token: 'synthetic-comment-auth' } } };
  const packages = new SourcePackageService({ db, artifactStore: artifacts });
  const files = async () => {
    const ids = db.prepare('SELECT package_id id FROM foundation_source_packages WHERE finalized_at IS NOT NULL ORDER BY package_key').all() as { id: string }[];
    return (await Promise.all(ids.map(id => packages.readVerified(id.id)))).flatMap(pkg => pkg.files.map(file => ({ ...file, packageId: pkg.packageId })));
  };
  return { root, db, artifacts, service, providerCalls, files,
    async execute(collector?: ApifyTikTokCommentsCollector, tiktokCoding?: ResearchAutomationApiConfiguration['tiktokCoding']) {
      application = openResearchAutomationApi({ ...config, ...(collector ? { tikTokFreeCommentsCollector: collector } : {}),
        ...(tiktokCoding ? { tiktokCoding } : {}) }, transport);
      // Yield I/O turns to the real worker; no elapsed-time assertion, sleeps, retry dispatch or race is under test.
      for (let turn = 0; turn < 10000; turn++) {
        const status = (await service.getRun(S07F_WORKSPACE, S07F_RUN)).status;
        if (['DRAFT_READY', 'FAILED', 'CANCELLED'].includes(status)) break;
        await setImmediate();
      }
      assert.equal((await service.getRun(S07F_WORKSPACE, S07F_RUN)).status, 'DRAFT_READY', 'S07 never blocks the run');
      await application.close(); application = undefined;
      const stored = db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(S07F_RUN) as { sha: string };
      const bytes = await artifacts.read(stored.sha);
      return { bytes, document: JSON.parse(bytes.toString()) as Record<string, unknown> };
    },
  };
}
