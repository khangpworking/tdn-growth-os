import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { JSDOM } from 'jsdom';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import type { AutomationSourcePort } from '../../src/modules/analysis/research-automation/source-binding.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/providers.js';
import { createExpandedSearchSource, type ExpandedSearchSource } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import { VideoWatchLane } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { createVideoWatchModel, type VideoWatchModel } from '../../src/modules/analysis/research-automation/video-watch-gemini.js';
import type { ProcessRunner } from '../../src/modules/analysis/research-automation/video-watch-media.js';
import { assertMarketBusinessGate, auditMarketReportHtml } from '../../src/modules/analysis/research-automation/market-business-gate.js';
import { SELLER_VIDEO_AUTO_NOTE, SELLER_VIDEO_AUTO_TITLE, SELLER_VIDEO_READING_TITLE } from '../../src/modules/analysis/research-automation/seller-video.js';
import { SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource, SYNTHETIC_CARD_ID } from '../helpers/research-synthetic-sources.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';

const KEYWORD = 'bình giữ nhiệt';
const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const organic = [{ position: 1, title: 'Bình giữ nhiệt chính hãng', link: 'https://example.test/brand' }];
const KEY = 'synthetic-proxy-key-0123456789';
const MODEL = 'gemini-video-test-1';
const IDS = ['1234567890123456789', '1234567890123456790', '1234567890123456791', '1234567890123456792'];
/** Search order A, A, B, A: the lane spreads it to A, B, A, A (pinned as IDS[0], IDS[2], IDS[1], IDS[3]). */
const ACCOUNT = ['nguoiban.vidu', 'nguoiban.vidu', 'cuahang.vidu', 'nguoiban.vidu'];
const PINNED = [IDS[0]!, IDS[2]!, IDS[1]!, IDS[3]!];
const tiktokUrl = (id: string) => `https://www.tiktok.com/@${ACCOUNT[IDS.indexOf(id)]}/video/${id}`;

/** Extra searches whose TikTok answer holds exact public video links (and one plain page). */
function expandedWithVideos(): ExpandedSearchSource {
  const transport: ProviderTransport = {
    fetch: (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const q = url.searchParams.get('q') ?? '';
      const kind = q.includes('site:shopee.vn') ? 'shopee' : q.includes('site:tiktok.com') ? 'tiktok' : 'window';
      const rows = kind === 'tiktok'
        ? [...IDS.map((id, i) => ({ position: i + 1, title: `Bình giữ nhiệt video ${i + 1}`, link: tiktokUrl(id), snippet: 'Video' })),
          { position: 5, title: 'Trang cửa hàng', link: 'https://example.test/tiktok/shop', snippet: 'Trang' }]
        : [{ position: 1, title: `Bình giữ nhiệt ${kind}`, link: `https://example.test/${kind}/1`, snippet: 'Mô tả' }];
      return new Response(JSON.stringify({ search_parameters: { q }, organic_results: rows }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  return createExpandedSearchSource(SYNTHETIC_SERP_KEY, transport);
}

const SPEECH: Record<string, { aboutProduct: boolean; videoKind: string; speech: string }> = {
  [IDS[0]!]: { aboutProduct: true, videoKind: 'SELLER_VIDEO', speech: 'Bình này giữ nóng cả ngày luôn' },
  [IDS[1]!]: { aboutProduct: true, videoKind: 'REVIEW_VIDEO', speech: 'Mình dùng thử thấy nắp rất kín' },
  [IDS[2]!]: { aboutProduct: true, videoKind: 'SELLER_VIDEO', speech: 'Cửa hàng mình giao nhanh trong ngày' },
  [IDS[3]!]: { aboutProduct: false, videoKind: 'OTHER', speech: 'Hôm nay trời đẹp quá' },
};

/** Spy runners: count every download, probe and model call. */
function spies(mediaDir: string) {
  const calls = { downloads: 0, probes: 0, model: 0 };
  const runner: ProcessRunner = async (bin, args) => {
    if (bin === 'yt-dlp') {
      calls.downloads++;
      const template = args[args.indexOf('-o') + 1]!;
      const id = path.basename(template).split('.')[0]!;
      await fs.writeFile(template.replace('%(ext)s', 'mp4'), `synthetic-video-${id}`);
      return { code: 0, stdout: '', stderr: '', timedOut: false };
    }
    calls.probes++;
    return { code: 0, stdout: JSON.stringify({ format: { duration: '20', format_name: 'mov,mp4,m4a' }, streams: [{ codec_type: 'video' }] }), stderr: '', timedOut: false };
  };
  const transport: ProviderTransport = {
    fetch: (async (_input: string | URL | Request, init?: RequestInit) => {
      calls.model++;
      const body = JSON.parse(String(init?.body)) as { contents: { parts: { inlineData?: { data: string } }[] }[] };
      const id = Buffer.from(body.contents[0]!.parts[0]!.inlineData!.data, 'base64').toString().replace('synthetic-video-', '');
      const said = SPEECH[id]!;
      const answer = { aboutProduct: said.aboutProduct, videoKind: said.videoKind, segments: [{ startSecond: 1, endSecond: 4, speech: said.speech }], onScreenText: [{ startSecond: 0, endSecond: 2, text: 'SALE 50%' }] };
      return new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ thought: true, text: 'nghĩ' }, { text: JSON.stringify(answer) }] } }] }), { status: 200 });
    }) as typeof fetch,
    sleep: async () => {},
    now: () => Date.parse('2026-10-02T00:00:00.000Z'),
  };
  const model: VideoWatchModel = createVideoWatchModel({ cliproxy: { baseUrl: 'http://127.0.0.1:8317', apiKey: KEY }, modelId: MODEL, transport });
  const lane = new VideoWatchLane({ media: { mediaDir, ytdlpBin: 'yt-dlp', ffprobeBin: 'ffprobe' }, model, now, runner });
  return { calls, lane };
}

type Options = { videoWatch?: VideoWatchLane; source?: AutomationSourcePort; webSource?: AutomationSourcePort; expandedSource?: ExpandedSearchSource };
async function runToDraft(t: TestContext, withLane: boolean) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-video-watch-run-'));
  const mediaDir = path.join(root, 'media');
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'video-watch', title: 'Synthetic video watch run' });
  const workspaceReader = new FlowDiscoveryWorkspaceReader(discovery);
  const open = (options: Options) => new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader, uuid: () => runId, now,
    renderer: (input, kind) => buildResearchAutomationReport(input, kind),
    sourceEvidence: { modelIdentity: 'synthetic-model', promptVersion: 'synthetic-v1', transport: { draftLists: async () => ({ keywords: [KEYWORD], exclusions: [] }) } }, ...options });
  const spy = spies(mediaDir);
  const service = open({ source: syntheticProductSource(), webSource: syntheticWebSource(() => {}, organic), expandedSource: expandedWithVideos(), ...(withLane ? { videoWatch: spy.lane } : {}) });
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword: KEYWORD, requestedPeriod: { startDate: '2025-10-01', endDate: '2026-09-30' }, reports: ['MARKET'] });
  await service.processNext();
  await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
    expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [], selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  for (let i = 0; i < 10 && (await service.getRun(workspaceId, runId)).status !== 'DRAFT_READY'; i++) await service.processNext();
  assert.equal((await service.getRun(workspaceId, runId)).status, 'DRAFT_READY');
  const step = db.prepare(`SELECT state, result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { state: string; sha: string };
  const document = JSON.parse((await artifacts.read(step.sha)).toString('utf8')) as StepResultDocument;
  const usage = db.prepare(`SELECT ordinal, provider, request_count n FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(row => { const value = row as { ordinal: bigint | number; provider: string; n: bigint | number }; return [Number(value.ordinal), value.provider, Number(value.n)] as const; });
  const captures = db.prepare(`SELECT ordinal, provider, operation, artifact_sha256 sha FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal`).all(runId)
    .map(row => row as { ordinal: bigint | number; provider: string; operation: string; sha: string });
  const html = async (pairId?: string) => (await service.readReport(workspaceId, runId, 'MARKET', false, pairId)).bytes.toString('utf8');
  return { db, artifacts, workspaceReader, service, open, mediaDir, spy, step, document, usage, captures, html };
}

const m09 = (html: string): string => { const h = [...new JSDOM(html).window.document.querySelectorAll('h3')].find(e => e.textContent === SELLER_VIDEO_AUTO_TITLE); return h ? h.outerHTML + (h.nextElementSibling?.outerHTML ?? '') : ''; };

test('flag on: candidates from the stored TikTok rows, one inline model call each, off-product stored but not drawn, the block in M09', async t => {
  const f = await runToDraft(t, true);
  const watch = f.document.videoWatch!;
  assert.ok(watch);
  assert.deepEqual(watch.candidates.map(c => [c.videoId, c.origin]), PINNED.map(id => [id, 'EXPANDED_SEARCH']), 'spread across accounts, then pinned');
  assert.deepEqual(watch.videos.map(v => [v.videoId, v.status, v.reason]), PINNED.map(id => [id, 'READ', null]), 'the off-product reading is stored');
  assert.deepEqual(f.spy.calls, { downloads: 4, probes: 4, model: 4 });
  const videoCaptures = f.captures.filter(c => c.provider === 'video-watch');
  assert.equal(videoCaptures.length, 4);
  assert.deepEqual(watch.videos.map(v => v.captureIndex), videoCaptures.map(c => Number(c.ordinal)));
  assert.deepEqual(f.usage.filter(u => u[1] === 'video-watch'), [[8, 'video-watch', 4]]);
  for (const capture of videoCaptures) {
    const text = (await f.artifacts.read(capture.sha)).toString('utf8');
    assert.equal(text.includes(KEY), false, 'no key in a stored capture');
    assert.equal(text.includes(Buffer.from(`synthetic-video-${IDS[0]}`).toString('base64')), false, 'no video base64 in a stored capture');
  }
  const html = await f.html();
  const block = m09(html);
  assert.ok(block.includes(SELLER_VIDEO_AUTO_TITLE));
  assert.ok(html.includes(SELLER_VIDEO_AUTO_NOTE));
  assert.equal(block.includes(SELLER_VIDEO_READING_TITLE), false, 'no operator block without operator readings');
  assert.match(block, /Bình này giữ nóng cả ngày luôn/u);
  assert.match(block, /Mình dùng thử thấy nắp rất kín/u);
  const order = ['Bình này giữ nóng', 'Cửa hàng mình giao nhanh', 'Mình dùng thử'].map(text => block.indexOf(text));
  assert.ok(order.every((index, i) => index >= 0 && (i === 0 || index > order[i - 1]!)), 'M09 follows the pinned account-spread order');
  assert.match(block, /ghi lại tự động từ video, chưa xác minh/u);
  assert.doesNotMatch(block, /Hôm nay trời đẹp quá|SALE 50%|@nguoiban|tiktok\.com\/@|cuahang|Gemini|Google|yt-dlp|gemini-video/iu);
  assert.deepEqual(providerNameViolations(html), []);
  assert.doesNotThrow(() => assertMarketBusinessGate(html, { presentation: false }));
  assert.ok(auditMarketReportHtml(html, { presentation: false }).some(item => item.rule === 'SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL' && item.ok));
  const media = await fs.readdir(path.join(f.mediaDir, runId));
  assert.deepEqual(media.filter(name => name.endsWith('.mp4')).sort(), IDS.map(id => `${id}.mp4`).sort(), 'media stays in the media folder for the sweep');
});

test('replay and revision: 0 downloads and 0 model calls, byte-identical, also with the lane removed', async t => {
  const f = await runToDraft(t, true);
  const first = await f.html();
  const before = { ...f.spy.calls };
  assert.match(m09(first), /Bình này giữ nóng cả ngày luôn[\s\S]*Cửa hàng mình giao nhanh[\s\S]*Mình dùng thử/u, 'the replayed report keeps the pinned order');
  assert.equal(await f.html(), first);
  const cold = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts, workspaceReader: f.workspaceReader, now: () => { throw new Error('a stored read must not consult the clock'); } });
  assert.equal((await cold.readReport(workspaceId, runId, 'MARKET')).bytes.toString('utf8'), first, 'cold replay without the lane is byte-identical');
  const previousPairId = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!.pairId;
  await f.service.requestReportRevision(workspaceId, runId, { contractVersion: 'automation-report-revision-v1', requestKey: randomUUID(), previousPairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  await f.service.processNext();
  const revised = (await f.service.listReportVersions(workspaceId, runId)).at(-1)!;
  assert.notEqual(revised.pairId, previousPairId);
  assert.equal(m09(await f.html(revised.pairId)), m09(first), 'the revision shows the same pinned readings');
  assert.equal(await f.html(previousPairId), first);
  assert.deepEqual(f.spy.calls, before, 'no download and no model call on replay or revision');
});

test('flag off: no step field, no capture, no usage row, no block', async t => {
  const f = await runToDraft(t, false);
  assert.equal(JSON.stringify(f.document).includes('videoWatch'), false);
  assert.equal(f.captures.some(c => c.provider === 'video-watch'), false);
  assert.equal(f.usage.some(u => u[0] === 8), false);
  assert.deepEqual(f.spy.calls, { downloads: 0, probes: 0, model: 0 });
  const html = await f.html();
  assert.equal(html.includes(SELLER_VIDEO_AUTO_TITLE), false);
  assert.equal(html.includes('seller-video'), false);
});
