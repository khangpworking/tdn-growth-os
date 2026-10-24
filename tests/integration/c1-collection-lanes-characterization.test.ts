import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test, { type TestContext } from 'node:test';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { MAX_CAPTURE_BYTES, type StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { CaptureLog } from '../../src/modules/analysis/research-automation/provider-common.js';
import type { ProviderTransport, ResearchAutomationProviderId, ProviderOperation } from '../../src/modules/analysis/research-automation/providers.js';
import { createWorldBankSource } from '../../src/modules/analysis/research-automation/world-bank-lane.js';
import { createComtradeSource } from '../../src/modules/analysis/research-automation/comtrade-lane.js';
import { createGoogleAdsSource } from '../../src/modules/analysis/research-automation/google-ads-lane.js';
import { createExpandedSearchSource } from '../../src/modules/analysis/research-automation/expanded-search-lane.js';
import { createMetaAutoSource, metaSearchUrl } from '../../src/modules/analysis/research-automation/meta-auto-lane.js';
import { createTikTokTopAdsSource } from '../../src/modules/analysis/research-automation/tiktok-top-ads-lane.js';
import { VideoWatchLane } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { createPdfDiscoverySource } from '../../src/modules/analysis/research-automation/pdf-discovery-lane.js';
import type { MetricOpenCliProcessRunner } from '../../src/modules/analysis/research-automation/metric-opencli-executor.js';
import { SYNTHETIC_CARD_ID, SYNTHETIC_SERP_KEY, syntheticProductSource, syntheticWebSource } from '../helpers/research-synthetic-sources.js';
import { syntheticTrendsSource } from '../helpers/search-interest-synthetic.js';
import { syntheticGeoSource } from '../helpers/search-geo-synthetic.js';
import { syntheticExpandedOrganic } from '../helpers/expanded-search-synthetic.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const keyword = 'bình giữ nhiệt';
const period = { startDate: '2025-10-01', endDate: '2026-09-30' };
const lanes = ['web', 'trends', 'geo', 'expanded', 'worldBank', 'comtrade', 'ads', 'stats', 'meta', 'tiktok', 'video', 'pdf'] as const;
type Lane = typeof lanes[number];
type Options = {
  lanes?: readonly Lane[];
  throwLane?: Lane;
  unstorable?: boolean;
  failCaptureWrite?: string;
  failCaptureWriteAt?: number;
  videoCaptureCount?: number;
  throwProduct?: boolean;
  abortBeforeWeb?: boolean;
};

// Independent persisted contract, including the three site-discovery calls. Product (0) and exact/public tail (1) are not lanes.
const usageTable: readonly (readonly [number, string])[] = [
  [2, 'serpapi'], [3, 'serpapi'], [4, 'serpapi'], [5, 'serpapi'], [6, 'serpapi'],
  [7, 'world-bank'], [8, 'video-watch'], [9, 'comtrade'], [10, 'serpapi'], [11, 'official-stats'],
  [12, 'meta-ad-library'], [13, 'tiktok-top-ads'], [14, 'serpapi'], [15, 'pdf-discovery'],
  [16, 'serpapi'], [17, 'serpapi'], [18, 'serpapi'], [19, 'serpapi'],
];

/** One synthetic service run; only public source/transport and artifact-store boundaries are substituted. */
async function fixture(t: TestContext, options: Options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-c1-lanes-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite'), now }).db;
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const put = artifacts.put.bind(artifacts);
  let matchingWrites = 0;
  artifacts.put = async bytes => {
    if (options.failCaptureWrite && Buffer.from(bytes).includes(Buffer.from(`"operation":"${options.failCaptureWrite}"`)) &&
      ++matchingWrites === (options.failCaptureWriteAt ?? 1))
      throw new Error('synthetic capture write failure');
    return put(bytes);
  };
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'c1-lanes', title: 'Synthetic collection lanes' });
  const calls: Record<Lane, number> = { web: 0, trends: 0, geo: 0, expanded: 0, worldBank: 0, comtrade: 0, ads: 0, stats: 0, meta: 0, tiktok: 0, video: 0, pdf: 0 };
  const exchanges = { web: 0, trends: 0, geo: 0, expanded: 0, worldBank: 0, comtrade: 0, ads: 0, stats: 0, meta: 0, tiktok: 0, video: 0, pdfSearch: 0, pdfDownload: 0 };
  const invoke = async <T>(name: Lane, work: () => Promise<T>): Promise<T> => {
    calls[name]++;
    if (options.throwLane === name) throw new Error(`synthetic ${name} collect failure`);
    return work();
  };
  const transport = (answer: (url: URL) => Response): ProviderTransport => ({
    fetch: (async input => answer(new URL(String(input)))) as typeof fetch,
    sleep: async () => {}, now: () => now().getTime(),
  });
  const capture = (provider: ResearchAutomationProviderId, operation: ProviderOperation, bytes = Buffer.from('{}')) => {
    const log = new CaptureLog(provider, transport(() => { throw new Error('unexpected fetch'); }), undefined, 1);
    return log.record({ operation, billing: 'FREE_ACCOUNT_QUERY', method: 'GET', endpoint: 'https://synthetic.example/capture',
      requestParameters: {}, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null },
    log.timestamp(), 'OK', 200, bytes, null);
  };
  const product = syntheticProductSource({ salesBytes: Buffer.from(JSON.stringify({ data: [{ product_id: '12345', product_name: keyword }] })) });
  const controller = new AbortController();
  const web = syntheticWebSource(() => { exchanges.web++; }, [{ position: 1, title: keyword, link: 'https://example.test/brand' }]);
  const trends = syntheticTrendsSource(() => { exchanges.trends++; });
  const geo = syntheticGeoSource(() => { exchanges.geo++; });
  const expanded = createExpandedSearchSource(SYNTHETIC_SERP_KEY, transport(url => {
    exchanges.expanded++;
    const rows = syntheticExpandedOrganic(url);
    if ((url.searchParams.get('q') ?? '').includes('site:tiktok.com'))
      rows[0] = { position: 1, title: keyword, link: 'https://www.tiktok.com/@synthetic/video/1234567890123456789', snippet: keyword };
    return Response.json({ search_parameters: { q: url.searchParams.get('q') }, organic_results: rows });
  }));
  const worldBank = createWorldBankSource(transport(url => {
    exchanges.worldBank++;
    const code = url.pathname.split('/').at(-1)!;
    const data = worldBankFixture(code, ['1000', '900']);
    return new Response(new Uint8Array(url.pathname.includes('/country/') ? data.observations : data.metadata));
  }));
  const comtrade = createComtradeSource({
    model: { generateText: async request => request.systemText.includes('map a product') ? '{"candidates":["123456"]}'
      : JSON.stringify({ typicalProductVi: 'Sản phẩm giả lập.', covers: true, reasonVi: 'Thuộc nhóm giả lập.', descriptionVi: 'Mô tả giả lập.' }) },
    transport: transport(url => {
      exchanges.comtrade++;
      return Response.json({ data: [{ period: Number(url.searchParams.get('period')), reporterDesc: 'Synthetic reporter',
        flowCode: url.searchParams.get('flowCode'), cmdCode: '123456', cmdDesc: 'Synthetic official description', primaryValue: 100 }] });
    }),
  });
  const brands = ['BrandAlpha', 'BrandBeta', 'BrandGamma'].map(label => ({ label, key: label.toLowerCase() }));
  const ads = createGoogleAdsSource(SYNTHETIC_SERP_KEY, transport(url => {
    exchanges.ads++;
    const brand = brands.find(item => (url.searchParams.get('q') ?? '').includes(item.label))!;
    return url.searchParams.get('engine') === 'google'
      ? Response.json({ search_parameters: { q: url.searchParams.get('q') }, organic_results: [{ position: 1, title: brand.label, link: `https://${brand.key}.example/` }] })
      : Response.json({ search_metadata: { status: 'Success' }, search_information: { total_results: 0 }, ad_creatives: [] });
  }));
  // Same logged-out CLI protocol fixture as the Meta/TikTok owner tests; no process is launched.
  const browser = (name: 'meta' | 'tiktok'): MetricOpenCliProcessRunner => {
    let currentUrl = '';
    return async (_executable, argv) => {
      const args = argv.slice(2, -2);
      let stdout = '';
      if (args[0] === 'open') { exchanges[name]++; currentUrl = args[1]!; }
      else if (args[0] === 'get' && args[1] === 'url') stdout = currentUrl;
      else if (args[0] === 'get' && args[1] === 'html') stdout = name === 'meta' && currentUrl === metaSearchUrl('BrandAlpha')
        ? '<html><body><a href="/ads/library/?view_all_page_id=111&country=VN">BrandAlpha</a><script>{"page_name":"BrandAlpha"}</script></body></html>' : '<html></html>';
      else if (args[0] === 'extract') {
        const text = name === 'meta' ? '~1 results\nActive\nLibrary ID: 5000000001\nStarted running on 1 Mar 2026\nPlatforms\n'
          : `Ad caption: ${keyword} mẫu A\nBrand: BrandAlpha\nIndustry: Đồ gia dụng\nObjective: Lượt xem video\nLikes: 1,2K\nCTR: 3%\n`;
        const start = Number(args[2]);
        stdout = JSON.stringify({ url: currentUrl, content: text.slice(start, start + 200), next_start_char: start + 200 < text.length ? start + 200 : null });
      }
      return { child: { kill: () => true }, completion: Promise.resolve({ exitCode: 0, stdout, stderr: '' }) };
    };
  };
  let elapsed = 0;
  const browserOptions = (name: 'meta' | 'tiktok') => {
    const runner = browser(name);
    return { createRunner: () => runner,
      clock: { monotonicMs: () => elapsed, sleep: async (ms: number) => { elapsed += ms; } }, now, env: { PATH: '/usr/bin' } };
  };
  const meta = createMetaAutoSource(browserOptions('meta'));
  const tiktok = createTikTokTopAdsSource(browserOptions('tiktok'));
  const video = new VideoWatchLane({ media: { mediaDir: path.join(root, 'media'), ytdlpBin: 'unused', ffprobeBin: 'unused' }, model: null, now });
  video.run = input => invoke('video', async () => {
    exchanges.video++;
    return input.candidates.map(candidate => ({ candidate, reason: 'MODEL_FAILED', media: null, reading: null,
      captures: Array.from({ length: options.videoCaptureCount ?? 1 }, () => capture('VIDEO-WATCH', 'videowatch.generate')),
      requests: 1, paidRequests: 1, downloads: 0 }));
  });
  const pdfTransport = transport(url => {
    if (url.pathname === '/search.json') {
      exchanges.pdfSearch++;
      return Response.json({ search_parameters: { q: url.searchParams.get('q') }, organic_results: [
        { position: 1, title: `Báo cáo ${keyword}`, snippet: keyword, link: 'https://reports.example/market.pdf' },
      ] });
    }
    exchanges.pdfDownload++;
    return new Response(Buffer.from('%PDF-1.4\n% synthetic c1\n%%EOF\n'), { headers: { 'content-type': 'application/pdf' } });
  });
  const pdf = createPdfDiscoverySource(SYNTHETIC_SERP_KEY, pdfTransport, async () => ['203.0.113.10'], pdfTransport.fetch);
  const enabled = new Set(options.lanes ?? lanes);
  const service = new ResearchAutomationService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => runId, now,
    source: { ...product, collect: async (input, opts) => {
      if (options.throwProduct) throw new Error('synthetic product collect failure');
      const bound = await product.collect(input, opts);
      if (options.abortBeforeWeb) controller.abort();
      return bound;
    } },
    sourceEvidence: { modelIdentity: 'synthetic', promptVersion: 'c1-v1', transport: { draftLists: async () => ({ keywords: [keyword], exclusions: [] }) } },
    pageIndex: { enabled: true, apiKey: 'synthetic-pdf-key', fetch: async () => { throw new Error('unexpected PageIndex call'); },
      extractPdf: async () => [{ page: 1, text: 'Synthetic PDF' }] },
    ...(enabled.has('web') ? { webSource: { ...web, collect: (input, opts) => invoke('web', () => web.collect(input, opts)) } } : {}),
    ...(enabled.has('trends') ? { trendsSource: { ...trends, collect: (input, opts, range) => invoke('trends', async () => {
      const result = await trends.collect(input, opts, range);
      return options.unstorable ? { ...result, captures: result.captures.map(c => ({ ...c, responseBytes: Buffer.alloc(MAX_CAPTURE_BYTES + 1) })) } : result;
    }) } } : {}),
    ...(enabled.has('geo') ? { trendsGeoSource: { ...geo, collect: (input, opts, range) => invoke('geo', async () => {
      const result = await geo.collect(input, opts, range);
      return options.unstorable ? { ...result, captures: result.captures.map(c => ({ ...c, responseBytes: Buffer.alloc(MAX_CAPTURE_BYTES + 1) })) } : result;
    }) } } : {}),
    ...(enabled.has('expanded') ? { expandedSource: { ...expanded, collect: (input, opts) => invoke('expanded', () => expanded.collect(input, opts)) } } : {}),
    ...(enabled.has('worldBank') ? { worldBankSource: { collect: opts => invoke('worldBank', () => worldBank.collect(opts)) } } : {}),
    ...(enabled.has('comtrade') ? { comtradeSource: { collect: (input, opts) => invoke('comtrade', () => comtrade.collect(input, opts)) } } : {}),
    ...(enabled.has('ads') ? { searchAdsSource: { collect: (input, opts) => invoke('ads', () => ads.collect({ ...input, brands, webUrls: [] }, opts)) } } : {}),
    ...(enabled.has('stats') ? { officialStatsSource: { collect: () => invoke('stats', async () => {
      exchanges.stats++;
      return { status: 'NO_DATA', categoryGroup: null, reasonVi: null, list: capture('OFFICIAL-STATS', 'officialstats.list'), files: [], tables: [], values: [], requests: 1 };
    }) } } : {}),
    ...(enabled.has('meta') ? { metaAutoSource: { collect: (_input, opts) => invoke('meta', () => meta.collect({ brands: [brands[0]!] }, opts)) } } : {}),
    ...(enabled.has('tiktok') ? { tiktokTopAdsSource: { collect: (input, opts) => invoke('tiktok', () => tiktok.collect(input, opts)) } } : {}),
    ...(enabled.has('video') ? { videoWatch: video } : {}),
    ...(enabled.has('pdf') ? { pdfDiscoverySource: { ...pdf, search: (input, opts) => invoke('pdf', () => pdf.search(input, opts)) } } : {}),
  });
  await service.start(workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: '33333333-3333-4333-8333-333333333333',
    mode: 'CATEGORY', keyword, requestedPeriod: period, reports: ['MARKET'] });
  const read = async (stepId = 'COLLECTION') => {
    const step = db.prepare('SELECT state, result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id=?').get(runId, stepId) as { state: string; sha: string | null };
    const document = step.sha ? JSON.parse((await artifacts.read(step.sha)).toString()) as StepResultDocument : null;
    const usage = db.prepare('SELECT ordinal, provider, operation, request_count, cost_state, cost_unit, cost_amount FROM analysis_research_automation_usage WHERE run_id=? AND step_id=? ORDER BY ordinal').all(runId, stepId)
      .map(row => { const r = row as { ordinal: number | bigint; provider: string; operation: string; request_count: number | bigint; cost_state: string; cost_unit: string | null; cost_amount: string | null }; return { ...r, ordinal: Number(r.ordinal), request_count: Number(r.request_count) }; });
    const captures = db.prepare('SELECT ordinal, provider, operation FROM analysis_research_automation_captures WHERE run_id=? AND step_id=? ORDER BY ordinal').all(runId, stepId)
      .map(row => { const r = row as { ordinal: number | bigint; provider: string; operation: string }; return { ...r, ordinal: Number(r.ordinal) }; });
    return { step, document, usage, captures };
  };
  const confirm = async () => {
    await service.processNext();
    await service.confirmScope(workspaceId, runId, { contractVersion: 'research-automation-confirm-v1', requestKey: '44444444-4444-4444-8444-444444444444',
      expectedRevision: (await service.getRun(workspaceId, runId)).revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [],
      selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [], exactShopeeUrls: [] });
  };
  return { service, calls, exchanges, read, confirm, controller, db };
}

const unsettledLanes = [
  ['web', 2, 'serpapi'], ['trends', 3, 'serpapi'], ['geo', 16, 'serpapi'], ['worldBank', 7, 'world-bank'],
  ['comtrade', 9, 'comtrade'], ['ads', 10, 'serpapi'], ['stats', 11, 'official-stats'],
  ['meta', 12, 'meta-ad-library'], ['tiktok', 13, 'tiktok-top-ads'], ['video', 8, 'video-watch'], ['pdf', 14, 'serpapi'],
] as const;
for (const [lane, ordinal, provider] of unsettledLanes) test(`row 1: ${lane} throw stores one UNKNOWN settlement; normal return stores none`, async t => {
  for (const thrown of [true, false]) {
    const f = await fixture(t, { lanes: lane === 'geo' ? ['trends', 'geo'] : [lane], ...(thrown ? { throwLane: lane } : {}) });
    await f.confirm();
    await f.service.processNext();
    const stored = await f.read();
    assert.ok(stored.document, 'COLLECTION was saved');
    assert.equal(f.calls[lane], 1, 'the lane actually ran');
    const unknown = stored.usage.filter(row => row.operation === 'unsettled-collection');
    assert.deepEqual(unknown, thrown ? [{ ordinal, provider, operation: 'unsettled-collection', request_count: 0, cost_state: 'UNKNOWN', cost_unit: null, cost_amount: null }] : []);
  }
});

test('row 2: whole expanded collect throw stores one UNKNOWN row; normal return stores none', async t => {
  for (const thrown of [true, false]) {
    const f = await fixture(t, { lanes: ['web', 'expanded'], ...(thrown ? { throwLane: 'expanded' } : {}) });
    await f.confirm(); await f.service.processNext();
    const stored = await f.read();
    assert.equal(f.calls.expanded, 1);
    assert.ok(stored.document);
    if (thrown) assert.equal(stored.document.expandedSearch, undefined);
    else assert.deepEqual(stored.document.expandedSearch?.queries.map(query => query.kind), ['WINDOW', 'SHOPEE', 'TIKTOK']);
    // c1 PR4 owner decision 24/10/2026: Q1
    assert.deepEqual(stored.usage.map(row => row.ordinal), thrown ? [0, 2, 4] : [0, 2, 4, 5, 6]);
    assert.deepEqual(stored.usage.filter(row => row.operation === 'unsettled-collection'), thrown
      ? [{ ordinal: 4, provider: 'serpapi', operation: 'unsettled-collection', request_count: 0, cost_state: 'UNKNOWN', cost_unit: null, cost_amount: null }] : []);
  }
});

test('row 3: unstorable trends/geo fallback keeps the requested range', async t => {
  for (const unstorable of [true, false]) {
    const f = await fixture(t, { lanes: ['trends', 'geo'], unstorable });
    await f.confirm(); await f.service.processNext();
    const { document, captures } = await f.read();
    assert.ok(document?.searchInterest); assert.ok(document.searchGeo);
    assert.deepEqual([f.calls.trends, f.calls.geo], [1, 1]);
    for (const series of [document.searchInterest, document.searchGeo]) {
      assert.equal(series.status, unstorable ? 'FAILED' : 'COLLECTED');
      // c1 PR4 owner decision 24/10/2026: bug 2
      assert.equal(series.window, 'REQUESTED_RANGE');
      assert.deepEqual(series.requestedRange, period);
      if (unstorable) { assert.equal(series.reason, 'PROVIDER_FAILED'); assert.equal(series.captureIndex, null); }
    }
    assert.equal(captures.length, unstorable ? 1 : 3);
  }
});

test('rows 4, 5, 8: all lanes retain usage ordinals, capture order and provider call counts', async t => {
  const f = await fixture(t);
  await f.confirm(); await f.service.processNext();
  const { document, usage, captures } = await f.read();
  assert.ok(document);
  await t.test('row 4: literal lane ordinal/provider table, with duplicate control', () => {
    const actual = usage.filter(row => row.ordinal >= 2).map(row => [row.ordinal, row.provider]);
    const check = (expected: readonly (readonly [number, string])[]) => {
      assert.equal(new Set(actual.map(row => row[0])).size, actual.length);
      assert.deepEqual(actual, expected);
    };
    check(usageTable);
    const duplicate = usageTable.map(row => [...row] as [number, string]);
    duplicate[1]![0] = duplicate[0]![0];
    assert.throws(() => check(duplicate), { code: 'ERR_ASSERTION' });
  });
  await t.test('row 5: saved lineage follows web, trends, geo, expanded, worldBank, comtrade, ads, stats, video, L9, pdf', () => {
    const expected = [
      'kalodata.product.rank', 'serpapi.google.search', 'serpapi.google.trends', 'serpapi.google.trends',
      ...Array<string>(3).fill('serpapi.google.search'),
      'worldbank.observations', 'worldbank.metadata', 'worldbank.observations', 'worldbank.metadata',
      ...Array<string>(3).fill('comtrade.data'),
      'serpapi.google.search', 'serpapi.google_ads.transparency',
      'serpapi.google.search', 'serpapi.google_ads.transparency',
      'serpapi.google.search', 'serpapi.google_ads.transparency',
      'officialstats.list', 'videowatch.generate', 'serpapi.google.search', 'pdfdiscovery.download',
    ];
    const check = (order: readonly string[]) => assert.deepEqual(captures.map(row => [row.ordinal, row.operation]), order.map((operation, ordinal) => [ordinal, operation]));
    check(expected);
    const swapped = [...expected];
    [swapped[1], swapped[2]] = [swapped[2]!, swapped[1]!];
    assert.throws(() => check(swapped), { code: 'ERR_ASSERTION' });
    assert.ok(document.metaAuto?.evidence, 'Meta publishes an attachment');
    assert.ok(document.tiktokTopAds?.evidence, 'TikTok publishes an attachment');
    assert.equal(captures.some(row => ['meta-ad-library', 'tiktok-top-ads'].includes(row.provider)), false);
    assert.equal(document.searchInterest?.captureIndex, 2);
    assert.equal(document.searchGeo?.captureIndex, 3);
    assert.deepEqual(document.expandedSearch?.queries.map(query => query.captureIndex), [4, 5, 6]);
    assert.deepEqual(document.worldBank?.indicators.map(indicator => [indicator.captureIndex, indicator.metadataCaptureIndex]), [[7, 8], [9, 10]]);
    assert.equal(document.videoWatch?.videos[0]?.captureIndex, 21);
    assert.equal(document.pdfDiscovery?.search.captureIndex, 22);
    assert.equal(document.pdfDiscovery?.files[0]?.captureIndex, 23);
    assert.ok(document.sourceEvidence, 'L9 admission precedes PDF search/download');
  });
  await t.test('row 8: each source once; expanded, ads and PDF retain their bounded provider exchanges', () => {
    assert.deepEqual(f.calls, { web: 1, trends: 1, geo: 1, expanded: 1, worldBank: 1, comtrade: 1, ads: 1, stats: 1, meta: 1, tiktok: 1, video: 1, pdf: 1 });
    assert.deepEqual(f.exchanges, { web: 1, trends: 1, geo: 1, expanded: 3, worldBank: 4, comtrade: 3, ads: 6, stats: 1, meta: 2, tiktok: 1, video: 1, pdfSearch: 1, pdfDownload: 1 });
    assert.deepEqual(usage.map(row => [row.ordinal, row.request_count]), [[0, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 4], [8, 1], [9, 3], [10, 3], [11, 1], [12, 2], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1], [18, 1], [19, 1]]);
  });
});

test('row 6: abort before web prevents collection and usage; flag off also prevents both', async t => {
  for (const abortBeforeWeb of [true, false]) {
    const f = await fixture(t, { lanes: abortBeforeWeb ? ['web'] : [], abortBeforeWeb });
    await f.confirm(); await f.service.processNext(f.controller.signal);
    const { document, usage } = await f.read();
    assert.equal(f.calls.web, 0);
    assert.deepEqual(usage.map(row => row.ordinal), [0]);
    assert.equal(document?.webResults, undefined);
    assert.equal((await f.service.getRun(workspaceId, runId)).status, abortBeforeWeb ? 'CANCELLED' : 'RENDERING');
  }
});

test('row 7: a capture write failure drops only that lane, keeps usage and saves later lanes', async t => {
  for (const lane of ['web', 'expanded'] as const) for (const failure of [true, false]) {
    const f = await fixture(t, { lanes: lane === 'web' ? ['web', 'trends'] : ['web', 'expanded', 'worldBank'],
      ...(failure ? { failCaptureWrite: 'serpapi.google.search', failCaptureWriteAt: lane === 'web' ? 1 : 3 } : {}) });
    await f.confirm();
    // c1 PR4 owner decision 24/10/2026: Q3
    assert.equal(await f.service.processNext(), true);
    const { step, document, usage, captures } = await f.read();
    assert.equal(step.state, failure && lane === 'web' ? 'PARTIAL' : 'SUCCEEDED'); assert.ok(document);
    assert.equal((await f.service.getRun(workspaceId, runId)).status, 'RENDERING');
    assert.equal((await f.read('REPORTS')).step.state, 'QUEUED');
    assert.deepEqual(usage.map(row => [row.ordinal, row.provider, row.operation, row.request_count, row.cost_state, row.cost_unit, row.cost_amount]), lane === 'web'
      ? [[0, 'kalodata', 'provider.run', 1, 'KNOWN', 'CREDITS', '0'], [2, 'serpapi', 'provider.run', 1, 'UNKNOWN', null, null], [3, 'serpapi', 'provider.run', 1, 'UNKNOWN', null, null]]
      : [[0, 'kalodata', 'provider.run', 1, 'KNOWN', 'CREDITS', '0'], ...[2, 4, 5, 6].map(ordinal => [ordinal, 'serpapi', 'provider.run', 1, 'UNKNOWN', null, null]), [7, 'world-bank', 'provider.run', 4, 'KNOWN', 'CREDITS', '0']]);
    const expected = ['kalodata.product.rank', ...(!failure || lane !== 'web' ? ['serpapi.google.search'] : []),
      ...(lane === 'web' ? ['serpapi.google.trends'] : [
        ...(!failure ? Array<string>(3).fill('serpapi.google.search') : []),
        'worldbank.observations', 'worldbank.metadata', 'worldbank.observations', 'worldbank.metadata',
      ])];
    assert.deepEqual(captures.map(row => [row.ordinal, row.operation]), expected.map((operation, ordinal) => [ordinal, operation]));
    if (lane === 'web') {
      assert.deepEqual(document.coverage.filter(row => row.provider === 'serpapi').map(row => [row.dataset, row.state]),
        [['web_discovery_current', failure ? 'FAILED' : 'COLLECTED']]);
      assert.deepEqual(document.limitations.filter(row => row.code === 'PROVIDER_FAILED').map(row => row.provider), failure ? ['serpapi'] : []);
      assert.equal(document.webResults?.length, failure ? undefined : 1);
      assert.equal(document.searchInterest?.status, 'COLLECTED');
      assert.equal(document.searchInterest?.captureIndex, failure ? 1 : 2);
      assert.equal(f.calls.trends, 1);
    } else {
      assert.deepEqual(document.expandedSearch?.queries.map(query => [query.kind, query.status, query.reason, query.captureIndex]), failure
        ? [['WINDOW', 'FAILED', 'PROVIDER_FAILED', null], ['SHOPEE', 'FAILED', 'PROVIDER_FAILED', null], ['TIKTOK', 'FAILED', 'PROVIDER_FAILED', null]]
        : [['WINDOW', 'COLLECTED', null, 2], ['SHOPEE', 'COLLECTED', null, 3], ['TIKTOK', 'COLLECTED', null, 4]]);
      assert.deepEqual(document.worldBank?.indicators.map(row => [row.captureIndex, row.metadataCaptureIndex]), failure ? [[2, 3], [4, 5]] : [[5, 6], [7, 8]]);
      assert.equal(document.webResults?.length, 1);
      assert.equal(f.calls.worldBank, 1);
    }
  }
  // Each fallback has its own document vocabulary; video also has a separate write/rewind branch.
  const groups: readonly (readonly [Lane | 'product', readonly string[]])[] = [
    ['product', ['kalodata.product.rank']], ['web', ['serpapi.google.search']],
    ['trends', ['serpapi.google.trends']], ['geo', ['serpapi.google.trends']],
    ['expanded', Array<string>(3).fill('serpapi.google.search')],
    ['worldBank', ['worldbank.observations', 'worldbank.metadata', 'worldbank.observations', 'worldbank.metadata']],
    ['comtrade', Array<string>(3).fill('comtrade.data')],
    ['ads', Array.from({ length: 3 }, () => ['serpapi.google.search', 'serpapi.google_ads.transparency']).flat()],
    ['stats', ['officialstats.list']], ['video', ['videowatch.generate', 'videowatch.generate']],
    ['pdf', ['serpapi.google.search', 'pdfdiscovery.download']],
  ];
  const attempts = [
    ['video', 'videowatch.generate', 2], ['trends', 'serpapi.google.trends', 1],
    ['geo', 'serpapi.google.trends', 2], ['worldBank', 'worldbank.metadata', 1],
    ['comtrade', 'comtrade.data', 2], ['ads', 'serpapi.google_ads.transparency', 1], ['stats', 'officialstats.list', 1],
  ] as const;
  const receipts = [
    [0, 'kalodata', 1], [2, 'serpapi', 1], [3, 'serpapi', 1], [4, 'serpapi', 1], [5, 'serpapi', 1], [6, 'serpapi', 1],
    [7, 'world-bank', 4], [8, 'video-watch', 1], [9, 'comtrade', 3], [10, 'serpapi', 3], [11, 'official-stats', 1],
    [12, 'meta-ad-library', 2], [13, 'tiktok-top-ads', 1], [14, 'serpapi', 1], [15, 'pdf-discovery', 1],
    [16, 'serpapi', 1], [17, 'serpapi', 1], [18, 'serpapi', 1], [19, 'serpapi', 1],
  ] as const;
  for (const [lane, operation, at] of attempts) for (const failure of [true, false]) {
    const f = await fixture(t, { videoCaptureCount: 2,
      ...(failure ? { failCaptureWrite: operation, failCaptureWriteAt: at } : {}) });
    await f.confirm();
    // c1 PR4 owner decision 24/10/2026: Q3
    assert.equal(await f.service.processNext(), true, lane);
    const { step, document, usage, captures } = await f.read();
    assert.ok(document);
    assert.equal(step.state, 'SUCCEEDED', lane);
    assert.equal((await f.service.getRun(workspaceId, runId)).status, 'RENDERING', lane);
    assert.equal((await f.read('REPORTS')).step.state, 'QUEUED', lane);
    const expected = groups.flatMap(([owner, operations]) => failure && owner === lane ? [] : operations);
    assert.deepEqual(captures.map(row => [row.ordinal, row.operation]), expected.map((op, ordinal) => [ordinal, op]), lane);
    assert.deepEqual(usage.map(row => [row.ordinal, row.provider, row.operation, row.request_count, row.cost_state, row.cost_unit, row.cost_amount]),
      receipts.map(([ordinal, provider, requests]) => {
        const paid = provider === 'serpapi' || provider === 'video-watch';
        return [ordinal, provider, 'provider.run', requests, paid ? 'UNKNOWN' : 'KNOWN', paid ? null : 'CREDITS', paid ? null : '0'];
      }), lane);
    // These later reads use the rewound ordinals, including after a partially written video attempt.
    assert.equal(document.pdfDiscovery?.search.captureIndex, expected.length - 2, lane);
    assert.deepEqual(document.pdfDiscovery?.files.map(file => [file.status, file.reason, file.captureIndex]),
      [['DOWNLOADED', null, expected.length - 1]], lane);
    assert.equal(f.calls[lane], 1, lane);
    assert.equal(f.calls.pdf, 1, lane);
    if (lane === 'trends' || lane === 'geo') {
      const series = lane === 'trends' ? document.searchInterest : document.searchGeo;
      assert.deepEqual([series?.status, series?.reason, series?.captureIndex, series?.requestedRange],
        [failure ? 'FAILED' : 'COLLECTED', failure ? 'PROVIDER_FAILED' : null, failure ? null : lane === 'trends' ? 2 : 3, period]);
    } else if (lane === 'worldBank') {
      const start = expected.indexOf('worldbank.observations');
      assert.deepEqual(document.worldBank?.indicators.map(row => [row.status, row.reason, row.captureIndex, row.metadataCaptureIndex, row.row === null]),
        [0, 1].map(i => failure ? ['FAILED', 'PROVIDER_FAILED', null, null, true] : ['COLLECTED', null, start + i * 2, start + i * 2 + 1, false]));
    } else if (lane === 'comtrade') {
      const start = expected.indexOf('comtrade.data');
      assert.deepEqual([document.comtrade?.status, document.comtrade?.calls.map(call => call.captureIndex)],
        failure ? ['FAILED', []] : ['OK', [start, start + 1, start + 2]]);
      if (failure) assert.deepEqual(document.comtrade?.rows, []);
    } else if (lane === 'ads') {
      const start = expected.indexOf('serpapi.google_ads.transparency');
      assert.deepEqual(document.searchAds?.brands.map(brand => {
        assert.ok('discoveryCaptureIndex' in brand);
        return [brand.captureIndex, brand.discoveryCaptureIndex];
      }),
        failure ? [] : [0, 2, 4].map(i => [start + i, start + i - 1]));
      if (failure) assert.equal(document.searchAds?.status, 'FAILED');
    } else if (lane === 'stats') {
      assert.deepEqual([document.officialStats?.status, document.officialStats?.listCaptureIndex,
        document.officialStats?.files, document.officialStats?.tables, document.officialStats?.values],
      [failure ? 'FAILED' : 'NO_DATA', failure ? null : expected.indexOf('officialstats.list'), [], [], []]);
    } else {
      assert.deepEqual(document.videoWatch?.videos.map(video => [video.status, video.reason, video.captureIndex, video.reading]),
        [['SKIPPED', failure ? 'PROVIDER_FAILED' : 'MODEL_FAILED', failure ? null : expected.indexOf('videowatch.generate') + 1, null]]);
    }
  }
});

test('c1 PR4 item 13: a product throw settles one UNKNOWN row with the failed step, or continues once with web', async t => {
  for (const path of ['terminal', 'web', 'rollback'] as const) {
    const f = await fixture(t, { lanes: path === 'web' ? ['web', 'stats'] : ['stats'], throwProduct: true });
    await f.confirm();
    if (path === 'rollback') {
      // Reject the durable step write: its cost row must roll back in the same transaction.
      f.db.exec(`CREATE TRIGGER reject_collection_settlement BEFORE UPDATE OF state ON analysis_research_automation_steps
        WHEN NEW.step_id='COLLECTION' AND NEW.state='FAILED'
        BEGIN SELECT RAISE(ABORT, 'synthetic collection settlement failure'); END`);
      await assert.rejects(f.service.processNext(), /synthetic collection settlement failure/);
    } else assert.equal(await f.service.processNext(), true);
    const { step, document, usage, captures } = await f.read();
    assert.deepEqual(usage.filter(row => row.ordinal === 0), path === 'rollback' ? [] : [{
      ordinal: 0, provider: 'kalodata', operation: 'unsettled-collection', request_count: 0,
      cost_state: 'UNKNOWN', cost_unit: null, cost_amount: null,
    }]);
    assert.deepEqual(usage.map(row => row.ordinal), path === 'web' ? [0, 2, 11] : path === 'terminal' ? [0] : []);
    assert.equal(step.state, path === 'web' ? 'PARTIAL' : path === 'terminal' ? 'FAILED' : 'RUNNING');
    assert.equal((await f.service.getRun(workspaceId, runId)).status, path === 'rollback' ? 'COLLECTING' : 'RENDERING');
    assert.equal(f.calls.stats, path === 'web' ? 1 : 0, 'terminal product failure stops before later lanes');
    if (path === 'web') {
      assert.equal(document?.limitations.filter(row => row.code === 'PROVIDER_FAILED').length, 1);
      assert.equal(f.calls.web, 1);
      assert.deepEqual(captures.map(row => row.provider), ['serpapi', 'official-stats']);
    } else { assert.equal(document, null); assert.deepEqual(captures, []); }
  }
});

test('row 7: pdf capture write failure is contained as TRANSPORT and collection is saved', async t => {
  const f = await fixture(t, { lanes: ['pdf'], failCaptureWrite: 'pdfdiscovery.download' });
  await f.confirm(); await f.service.processNext();
  const { document, captures } = await f.read();
  assert.equal(document?.pdfDiscovery?.files[0]?.reason, 'TRANSPORT');
  assert.equal(captures.some(row => row.operation === 'pdfdiscovery.download'), false);
  assert.equal(f.exchanges.pdfDownload, 1);
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'RENDERING');
});

test('row 9: QUICK_SEARCH with every lane configured calls no collection lane and stores no lane row', async t => {
  const f = await fixture(t);
  await f.service.processNext();
  const { document, usage, captures } = await f.read('QUICK_SEARCH');
  assert.equal(document?.stepId, 'QUICK_SEARCH');
  assert.equal((await f.service.getRun(workspaceId, runId)).status, 'AWAITING_SCOPE');
  assert.deepEqual(Object.values(f.calls), Array<number>(12).fill(0));
  assert.deepEqual(Object.values(f.exchanges), Array<number>(13).fill(0));
  assert.deepEqual(usage.map(row => [row.ordinal, row.provider]), [[0, 'kalodata']]);
  assert.deepEqual(captures.map(row => [row.ordinal, row.provider]), [[0, 'kalodata']]);
});
