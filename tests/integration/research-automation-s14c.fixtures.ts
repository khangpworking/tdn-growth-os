import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { createExpandedSearchSource } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import { VideoWatchLane } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { createVideoWatchModel } from '../../src/modules/analysis/research-automation/video-watch-gemini.js';
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { bindResearchAutomationProvider } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { ProcessRunner } from '../../src/modules/analysis/research-automation/video-watch-media.js';
import type { TopSellingVideoSource } from '../../src/modules/analysis/research-automation/top-selling-videos.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticWebSource } from '../helpers/research-synthetic-sources.js';

export const S14C_NOW = () => new Date('2026-10-02T00:00:00.000Z');
export const S14C_RUN = '22222222-2222-4222-8222-222222222222';
export const S14C_WORKSPACE = '11111111-1111-4111-8111-111111111111';
export const S14C_SEARCH_URL = 'https://www.tiktok.com/@synthetic.search/video/93001';

// This fixture also runs against an exported origin/main tree: the new source is a type-only dependency and omitted there.
export async function s14cCollection(t: Pick<TestContext, 'after'>, options: { topSellingVideoSource?: TopSellingVideoSource;
  mode?: 'no-video' | 'subtitle'; reports?: ('MARKET' | 'INSIGHT')[] } = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s14c-service-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now: S14C_NOW }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => S14C_WORKSPACE, now: S14C_NOW });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 's14c-synthetic', title: 'Synthetic S14C workspace' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const calls = { subtitle: 0, video: 0, model: 0 };
  const runner: ProcessRunner = async (bin, args) => {
    assert.equal(bin, 'synthetic-ytdlp', 'no ffprobe is needed by this fixture');
    if (args.includes('--skip-download')) {
      calls.subtitle++;
      if (options.mode === 'subtitle') {
        const template = args[args.indexOf('-o') + 1]!, id = path.basename(template).split('.')[0]!;
        await fs.writeFile(template.replace('%(ext)s', 'vie-VN.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nCâu giả lập.\n');
        return { code: 0, stdout: `${id} 10\n`, stderr: '', timedOut: false };
      }
      return { code: 0, stdout: '', stderr: '', timedOut: false };
    }
    calls.video++;
    return { code: 1, stdout: '', stderr: 'Requested format is not available', timedOut: false };
  };
  const transport: ProviderTransport = { now: () => S14C_NOW().getTime(), sleep: async () => {}, fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.hostname === 'www.kalodata.com') {
      if (url.pathname.endsWith('/credit/balance')) return Response.json({ success: true, data: { totalRemain: 10 } });
      const body = JSON.parse(String(init?.body));
      if (url.pathname.endsWith('/product/rank')) return Response.json({ success: true, data: [{ product_id: '12345', product_name: 'Synthetic product', unit_price: 1000 }] });
      assert.ok(url.pathname.endsWith('/product/detail'));
      return Response.json({ success: true, data: { product_id: body.product_id, product_region: 'vn', currency: 'VND', date_range: body.date_range,
        product_name: 'Synthetic product', revenue: 100, sales_volumn: 5, unit_price: 1000 } });
    }
    if (url.pathname === '/search.json') {
      const q = url.searchParams.get('q') ?? '';
      return Response.json({ search_parameters: { q }, organic_results: q.includes('site:tiktok.com')
        ? [{ position: 1, title: 'Synthetic product video', snippet: 'Synthetic product', link: S14C_SEARCH_URL }]
        : [{ position: 1, title: 'Synthetic product', snippet: 'Synthetic product', link: 'https://example.test/product' }] });
    }
    assert.equal(url.hostname, '127.0.0.1');
    const body = JSON.parse(String(init?.body));
    assert.ok(body.contents[0].parts.every((part: object) => Object.keys(part).join() === 'text'));
    calls.model++;
    return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ aboutProduct: true, videoKind: 'SELLER_VIDEO' }) }] } }] });
  } };
  const source = bindResearchAutomationProvider(createKalodataProvider('synthetic-s14c-offline-product-auth', transport));
  const model = createVideoWatchModel({ modelId: 'gemini-synthetic-s14c', cliproxy: { baseUrl: 'http://127.0.0.1:8317', apiKey: 'synthetic-s14c-offline-model-auth' }, transport });
  const videoWatch = new VideoWatchLane({ media: { mediaDir: path.join(root, 'media'), ytdlpBin: 'synthetic-ytdlp', ffprobeBin: 'synthetic-ffprobe' }, model, runner, now: S14C_NOW });
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, now: S14C_NOW, uuid: () => S14C_RUN,
    renderer: (input, kind) => buildResearchAutomationReport(input, kind),
    source, webSource: syntheticWebSource(() => {}, [{ position: 1, title: 'Synthetic product', link: 'https://example.test/product' }]),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => ({ keywords: ['synthetic product'], exclusions: [] }) } },
    expandedSource: createExpandedSearchSource(SYNTHETIC_SERP_KEY, transport), videoWatch,
    ...(options.topSellingVideoSource ? { topSellingVideoSource: options.topSellingVideoSource } : {}) });
  await service.start(S14C_WORKSPACE, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333', mode: 'CATEGORY',
    keyword: 'synthetic product', requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, reports: options.reports ?? ['MARKET'] });
  await service.processNext();
  await service.confirmScope(S14C_WORKSPACE, S14C_RUN, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(S14C_WORKSPACE, S14C_RUN)).revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  await service.processNext();
  const stored = db.prepare("SELECT state, result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(S14C_RUN) as { state: string; sha: string };
  assert.ok(stored.sha, `collection persisted (${stored.state})`);
  const bytes = await artifacts.read(stored.sha), step = JSON.parse(bytes.toString()) as StepResultDocument;
  return { db, artifacts, service, bytes, step, calls, async html() {
    for (let i = 0; i < 10 && (await service.getRun(S14C_WORKSPACE, S14C_RUN)).status !== 'DRAFT_READY'; i++) await service.processNext();
    assert.equal((await service.getRun(S14C_WORKSPACE, S14C_RUN)).status, 'DRAFT_READY');
    return (await service.readReport(S14C_WORKSPACE, S14C_RUN, 'MARKET')).bytes.toString('utf8');
  } };
}
