import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { VideoWatchLane, videoWatchCandidates, buildAutomatedVideoReading, publishAutomatedVideoReading, verifyAutomatedVideoReading } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import type { StepExpandedQuery } from '../../src/modules/analysis/research-automation/model.js';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { openDatabase } from '../../src/platform/db/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { RequestScopedArtifactStore } from '../../src/platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService } from '../../src/modules/foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../src/modules/foundation/source-package-reader.js';
import { AutomationKalodataVideoIntake } from '../../src/modules/analysis/research-automation/kalodata-video-intake.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/index.js';
import { ResearchAutomationService } from '../../src/modules/analysis/research-automation/service.js';
import { buildResearchAutomationReport } from '../../src/modules/analysis/research-automation/reports.js';
import { SYNTHETIC_CARD_ID, syntheticProductSource } from '../helpers/research-synthetic-sources.js';
import type { StepResultDocument } from '../../src/modules/analysis/research-automation/model.js';
import { selectTikTokVideos, topSellingTikTokVideos, exactTikTokVideoUrl } from '../../src/modules/analysis/research-automation/tiktok-video-selection.js';

const url = (id: number) => `https://www.tiktok.com/@synthetic_creator/video/${1000 + id}`;
const productUrl = 'https://www.kalodata.com/products/12345';
const unconfirmedId = 'kalodata:23456';
const unconfirmedUrl = 'https://www.kalodata.com/products/23456';
const uncollectedId = 'kalodata:34567';
const uncollectedUrl = 'https://www.kalodata.com/products/34567';
async function fixture(t: test.TestContext, revenues: (string | null)[], videos = revenues.map((_, index) => url(index)), units: (string | null)[] = [], productLinks = revenues.map(() => productUrl)) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-p9-selection-'));
  const db = openDatabase({ databasePath: path.join(root, 'test.sqlite') }).db;
  t.after(async () => { db.close(); await fs.rm(root, { recursive: true, force: true }); });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const reader = new FoundationSourcePackageReader(new SourcePackageService({ db, artifactStore: artifacts }));
  const intake = new AutomationKalodataVideoIntake(new RequestScopedArtifactStore(path.join(root, 'artifacts')), db, () => new Date('2026-10-09T00:00:00Z'));
  const binding = { workspaceId: randomUUID(), runId: randomUUID(), scopeSha256: 'd'.repeat(64), sourceSetSha256: 'e'.repeat(64), requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' } };
  const csv = Buffer.from(['video,creator,revenue,views,units,ad_spend,publish_date,product_link',
    ...revenues.map((value, index) => `${videos[index]},synthetic,${value ?? ''},,${units[index] ?? ''},,,${productLinks[index] ?? ''}`)].join('\n'));
  const prepared = await intake.prepare({ contractVersion: 'automation-video-prepare-v1', requestKey: randomUUID(), table: 'video',
    sourceLabel: 'Synthetic video sample', acquiredAt: null }, csv, 'synthetic.csv', { workspaceId: binding.workspaceId, runId: binding.runId });
  return { db, artifacts, reader, binding, sourcePackage: { packageId: prepared.packageId,
    manifestArtifactSha256: prepared.manifestArtifactSha256, packageContentSha256: prepared.packageContentSha256 } };
}

async function collectVideos(f: Awaited<ReturnType<typeof fixture>>, withSales = true) {
  const discovery = new DiscoveryWorkspaceService({ db: f.db, artifactStore: f.artifacts, uuid: () => f.binding.workspaceId });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-video-seeding', title: 'Synthetic video run' });
  const source = syntheticProductSource({ salesBytes: Buffer.from('{"synthetic":"sales"}') });
  const service = new ResearchAutomationService({ db: f.db, artifactStore: f.artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), uuid: () => f.binding.runId,
    now: () => new Date('2026-10-09T00:00:00Z'), source: {
      ...source,
      async quickSearch(input, options) {
        const bound = await source.quickSearch(input, options);
        const card = bound.step.productCards[0]!;
        return { ...bound, step: { ...bound.step, productCards: [card,
          { ...card, productId: unconfirmedId, sourceProductId: '23456', sourceUrl: unconfirmedUrl },
          { ...card, productId: uncollectedId, sourceProductId: '34567', sourceUrl: uncollectedUrl }] } };
      },
      async collect(input, options) {
        const bound = await source.collect(input, options);
        const captures = [SYNTHETIC_CARD_ID, unconfirmedId].map((productRef, index) => ({ ...bound.result.captures[0]!,
          captureId: `synthetic-sales-${index}`, productRef, operation: 'kalodata.product.detail' as const }));
        return { result: { ...bound.result, captures }, step: { ...bound.step, comparables: withSales ? captures.map((capture, captureIndex) => ({
          productId: capture.productRef, provider: 'kalodata', metric: 'GMV_VND' as const,
          value: '100', window: f.binding.requestedPeriod, captureIndex })) : [] } };
      },
    },
    renderer: (input, kind) => buildResearchAutomationReport(input, kind),
    videoWatch: new VideoWatchLane({ media: { mediaDir: path.join(os.tmpdir(), `synthetic-unused-${f.binding.runId}`), ytdlpBin: 'unused', ffprobeBin: 'unused' }, model: null, now: () => new Date('2026-10-09T00:00:00Z') }) });
  await service.start(f.binding.workspaceId, { contractVersion: 'research-automation-start-v1', requestKey: randomUUID(), mode: 'CATEGORY', keyword: 'synthetic',
    requestedPeriod: f.binding.requestedPeriod, reports: ['MARKET'] });
  await service.processNext();
  await service.confirmScope(f.binding.workspaceId, f.binding.runId, { contractVersion: 'research-automation-confirm-v1', requestKey: randomUUID(),
    expectedRevision: (await service.getRun(f.binding.workspaceId, f.binding.runId)).revision, definition: 'Synthetic scope', includeTerms: [], excludeTerms: [],
    selectedProductIds: [SYNTHETIC_CARD_ID], peerProductIds: [uncollectedId], exactShopeeUrls: [] });
  await service.processNext();
  const row = f.db.prepare("SELECT result_sha256 sha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'").get(f.binding.runId) as { sha: string };
  assert.ok(row.sha, 'COLLECTION must retain its evidence and candidate plan');
  return JSON.parse((await f.artifacts.read(row.sha)).toString()) as StepResultDocument;
}

test('actual prepared P4 selection freezes A/C, source-order ties, distinct review additions and exact row lineage', async t => {
  const f = await fixture(t, ['40', '40', '10', '5', '5']);
  const before = Buffer.from(f.db.serialize());
  const a = await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [url(90)] });
  assert.deepEqual(a.selection.videos.map(v => [v.videoId, v.kind, v.sourceLine]), [['1000', 'SELLER_VIDEO', 'csv:row:2'], ['1090', 'REVIEW_VIDEO', null]]);
  const c = await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [] });
  assert.deepEqual(c.selection.videos.map(v => v.videoId), ['1000', '1001']);
  assert.deepEqual((await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [url(90)] })), a);
  assert.deepEqual(Buffer.from(f.db.serialize()), before);
});

test('source exclusions remain explicit and zero/missing alone cannot manufacture coverage', async t => {
  const f = await fixture(t, ['10', null, '0', '20'], [url(0), url(1), url(2), 'plain source title']);
  const a = await selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT', reviewVideoUrls: [] });
  assert.deepEqual(a.selection.excluded.map(r => r.reason), ['MISSING_REVENUE', 'ZERO_REVENUE', 'INVALID_VIDEO_URL']);
  assert.equal(a.selection.sampleVideoCount, 1);
  const empty = await fixture(t, [null, '0']);
  await assert.rejects(selectTikTokVideos(empty.reader, empty.binding, { sourcePackage: empty.sourcePackage, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [url(99)] }));
});

test('reject wrong package/run/workspace/digest and duplicate URL before exposing membership', async t => {
  const f = await fixture(t, ['10', '20']);
  const request = { sourcePackage: f.sourcePackage, option: 'A_TOP_20_PERCENT' as const, reviewVideoUrls: [] };
  for (const field of ['runId', 'workspaceId'] as const) await assert.rejects(selectTikTokVideos(f.reader, { ...f.binding, [field]: randomUUID() }, request));
  for (const field of ['manifestArtifactSha256', 'packageContentSha256'] as const) await assert.rejects(selectTikTokVideos(f.reader, f.binding,
    { ...request, sourcePackage: { ...f.sourcePackage, [field]: 'f'.repeat(64) } }));
  await assert.rejects(selectTikTokVideos(f.reader, f.binding, { ...request, reviewVideoUrls: [url(0)] }));
  const duplicate = await fixture(t, ['10', '10'], [url(0), url(0)]);
  await assert.rejects(selectTikTokVideos(duplicate.reader, duplicate.binding, { ...request, sourcePackage: duplicate.sourcePackage }));
});

test('overflow30 refuses rather than truncating and URLs are exact inert public video locators', async t => {
  const f = await fixture(t, Array(40).fill('1'));
  await assert.rejects(selectTikTokVideos(f.reader, f.binding, { sourcePackage: f.sourcePackage, option: 'C_CUMULATIVE_80_PERCENT', reviewVideoUrls: [] }));
  for (const bad of ['http://www.tiktok.com/@x/video/123', 'https://www.tiktok.com/@x/video/123?key=secret', 'https://example.test/@x/video/123', 'https://www.tiktok.com/@x', 'https://www.tiktok.com/@x/video/123/']) assert.throws(() => exactTikTokVideoUrl(bad));
});


test('SRC3 S14 Valid top-selling TikTok URL: TOP_SELLING input; malformed or missing URL excluded', async t => {
  const f = await fixture(t, ['10', '20', '900', '800'], [url(0), url(1), '', 'plain source title']);
  const result = await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: f.binding.runId }, [productUrl]);
  assert.deepEqual(result.videos.map(v => v.videoId), ['1001', '1000']);
  assert.equal(result.rowsWithoutUsableVideo, 2, 'unusable locators never manufacture videos');
  assert.equal(result.tablesNotVerified, 0);
  const unbound = await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: f.binding.runId });
  assert.equal(unbound.tablesNotVerified, 0);
  assert.deepEqual(unbound.videos, [], 'a same-run upload without product binding cannot supply candidates');
  assert.deepEqual((await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: randomUUID() }, [productUrl])).videos, [], 'another run cannot supply candidates');
  const wrongWorkspace = await topSellingTikTokVideos(f.reader, { runId: f.binding.runId, workspaceId: randomUUID() }, [productUrl]);
  assert.deepEqual(wrongWorkspace.videos, []);
  assert.equal(wrongWorkspace.tablesNotVerified, 1);
});

test('SRC3 S14 Sales ranking: exact revenue then units, stable ties; source order cannot override sales', async t => {
  const f = await fixture(t, ['9007199254740992', '9007199254740993', '12', '12', null, '12'], undefined, [null, null, '1', '2', '999', '2']);
  assert.deepEqual((await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: f.binding.runId }, [productUrl])).videos.map(v => v.videoId), ['1001', '1000', '1003', '1005', '1002', '1004']);
});

test('SRC3 S14 Duplicate A at revenues 1 and 1000 survives the cap once in either input order; its low-sales row cannot cause exclusion', async t => {
  const highestUrl = url(0).replace('@synthetic_creator', '@synthetic_top_seller');
  const rows = [{ revenue: '1', url: url(0) },
    ...Array.from({ length: 10 }, (_, i) => ({ revenue: String(i + 2), url: url(i + 1) })),
    { revenue: '1000', url: highestUrl }];
  const expectedIds = ['1000', ...Array.from({ length: 10 }, (_, i) => String(1010 - i))];
  for (const input of [rows, [...rows].reverse()]) {
    const f = await fixture(t, input.map(row => row.revenue), input.map(row => row.url));
    const ranked = await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: f.binding.runId }, [productUrl]);
    assert.deepEqual(ranked.videos.map(video => video.videoId), expectedIds);
    assert.equal(ranked.videos[0]!.url, highestUrl, 'retain the highest-ranked row of a duplicate video ID');
    const document = await collectVideos(f);
    assert.deepEqual(document.videoWatch?.candidates.map(video => [video.videoId, video.origin]),
      expectedIds.slice(0, 10).map(id => [id, 'TOP_SELLING']));
    assert.equal(document.videoWatch?.candidates.filter(video => video.videoId === '1000').length, 1,
      'a low-sales duplicate cannot evict the best seller or consume a second slot');
    assert.equal(document.videoWatch?.candidates[0]!.url, highestUrl);
    assert.deepEqual(document.videoWatch?.skipped, [{ videoId: '1001', reason: 'OVER_10_VIDEOS' }]);
  }
});

test('SRC3 S14 Observed zero ranks above missing; higher units cannot promote missing revenue above zero', async t => {
  const f = await fixture(t, [null, '0', '0', null, '0', null], undefined, ['999', '1', null, '0', '0', null]);
  const ranked = await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: f.binding.runId }, [productUrl]);
  assert.deepEqual(ranked.videos.map(video => video.videoId), ['1001', '1004', '1002', '1000', '1003', '1005'],
    'zero revenue precedes missing revenue regardless of units; zero units precedes missing units at equal revenue');
  assert.equal(ranked.rowsWithoutUsableVideo, 0, 'zero or missing sales cannot discard a usable confirmed video');
  assert.equal(ranked.tablesNotVerified, 0);
});


test('SRC3 S14 Candidate order: SELECTION then TOP_SELLING then EXPANDED_SEARCH; deduplicate and cap', () => {
  const query: StepExpandedQuery = { kind: 'TIKTOK', status: 'COLLECTED', reason: null, requestedWindow: null, retrievedAt: null, captureIndex: null,
    results: [{ position: 1, url: url(2), title: 'Synthetic', snippet: null, retrievedAt: '2026-10-09T00:00:00.000Z', captureIndex: 0 }, { position: 2, url: url(3), title: 'Synthetic', snippet: null, retrievedAt: '2026-10-09T00:00:00.000Z', captureIndex: 0 }] };
  const plan = videoWatchCandidates([{ url: url(0) }], [query], [{ url: url(0) }, { url: url(1) }, { url: url(2) }, { url: 'invalid' }]);
  assert.deepEqual(plan.candidates.map(c => [c.videoId, c.origin]), [['1000', 'SELECTION'], ['1001', 'TOP_SELLING'], ['1002', 'TOP_SELLING'], ['1003', 'EXPANDED_SEARCH']]);
  assert.equal(plan.candidatesSha256, createHash('sha256').update(canonicalJson(plan.candidates)).digest('hex'));
  const capped = videoWatchCandidates([], [], Array.from({ length: 12 }, (_, index) => ({ url: url(index) })));
  assert.equal(capped.candidates.length, 10);
  assert.deepEqual(capped.skipped, [{ videoId: '1010', reason: 'OVER_10_VIDEOS' }, { videoId: '1011', reason: 'OVER_10_VIDEOS' }]);
  // Different accounts must not move expanded search ahead of retained selection or sales-ranked videos.
  const mixed = videoWatchCandidates([{ url: url(0) }, { url: url(1) }], [{ ...query, results: [{ ...query.results[0]!, url: url(3).replace('@synthetic_creator', '@another_synthetic') }] }], [{ url: url(2) }]);
  assert.deepEqual(mixed.candidates.map(c => c.origin), ['SELECTION', 'SELECTION', 'TOP_SELLING', 'EXPANDED_SEARCH']);
  const priority = videoWatchCandidates([0, 1, 2, 3].map(i => ({ url: url(i) })), [query],
    Array.from({ length: 9 }, (_, i) => ({ url: url(i + 4) })));
  assert.deepEqual(priority.candidates.map(c => c.videoId), Array.from({ length: 10 }, (_, i) => String(1000 + i)));
  assert.deepEqual(priority.candidates.map(c => c.origin), [...Array(4).fill('SELECTION'), ...Array(6).fill('TOP_SELLING')], 'search cannot displace retained or sales-ranked videos at the cap');

});

test('SRC3 S14 Existing origins continue verifying, TOP_SELLING verifies; candidate hash or origin mismatch is NOT_VERIFIED', async t => {
  const f = await fixture(t, ['1']);
  const writer = new SourcePackageService({ db: f.db, artifactStore: f.artifacts });
  for (const origin of ['SELECTION', 'TOP_SELLING', 'EXPANDED_SEARCH'] as const) {
    const candidate = { videoId: '1000', url: url(0), origin };
    const candidates = [candidate];
    const binding = { ...f.binding, candidatesSha256: createHash('sha256').update(canonicalJson(candidates)).digest('hex') };
    const prepared = buildAutomatedVideoReading(binding, candidate,
      { aboutProduct: true, videoKind: 'SELLER_VIDEO', segments: [{ startSecond: 1, endSecond: 2, speech: 'Synthetic speech' }], onScreenText: [] },
      { sha256: 'a'.repeat(64), byteSize: 20, durationSeconds: 10, downloadedAt: '2026-10-09T00:00:00.000Z' },
      { modelId: 'synthetic-model', responseSha256: 'b'.repeat(64) });
    const ref = await publishAutomatedVideoReading(writer, binding, prepared);
    const expected = { ...binding, candidates };
    assert.equal(typeof await verifyAutomatedVideoReading(f.reader, ref, expected), 'object', origin);
    assert.equal(await verifyAutomatedVideoReading(f.reader, ref, { ...expected, candidatesSha256: 'f'.repeat(64) }), 'NOT_VERIFIED');
    const changed = [{ ...candidate, origin: origin === 'SELECTION' ? 'EXPANDED_SEARCH' as const : 'SELECTION' as const }];
    assert.equal(await verifyAutomatedVideoReading(f.reader, ref, { ...expected, candidates: changed,
      candidatesSha256: createHash('sha256').update(canonicalJson(changed)).digest('hex') }), 'NOT_VERIFIED');
  }
});


test('SRC3 S14 COLLECTION seeds ranked TOP_SELLING candidates from this run; unusable and foreign rows never propagate', async t => {
  const f = await fixture(t, ['10', '30', '999'], [url(0), url(1), 'unusable locator']);
  const document = await collectVideos(f);
  assert.deepEqual(document.videoWatch?.candidates.map(v => [v.videoId, v.origin]), [['1001', 'TOP_SELLING'], ['1000', 'TOP_SELLING']]);
  assert.equal(document.videoWatch?.candidatesSha256, createHash('sha256').update(canonicalJson(document.videoWatch?.candidates)).digest('hex'));
  assert.ok(!document.videoWatch?.candidates.some(v => v.videoId === '1002'), 'an unusable locator never becomes a stored candidate');
  assert.deepEqual((await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: randomUUID() }, [productUrl])).videos, [], 'another run cannot reuse these videos');
});

test('SRC3 S14 Exclude higher-revenue unconfirmed rows before the cap; eligible confirmed rows remain candidates', async t => {
  const revenues = ['999999', '888888', ...Array.from({ length: 10 }, (_, i) => String(i + 1))];
  const links = [unconfirmedUrl, uncollectedUrl, ...Array(10).fill(productUrl)];
  const f = await fixture(t, revenues, undefined, [], links);
  const document = await collectVideos(f);
  assert.ok(document.comparables.some(row => row.productId === unconfirmedId), 'the unconfirmed product has collection evidence');
  assert.ok(!document.comparables.some(row => row.productId === uncollectedId), 'the confirmed peer has no collection evidence');
  assert.deepEqual(document.videoWatch?.candidates.map(v => [v.videoId, v.origin]),
    Array.from({ length: 10 }, (_, i) => [String(1011 - i), 'TOP_SELLING']));
  assert.deepEqual(document.videoWatch?.skipped, [], 'ineligible rows cannot take slots or evict eligible videos at the cap');
  assert.ok(!document.limitations.some(row => row.code === 'TOP_SELLING_VIDEO_LOCATORS_UNAVAILABLE'));
  const unbound = await fixture(t, ['10']);
  const noSales = await collectVideos(unbound, false);
  assert.deepEqual(noSales.videoWatch?.candidates, [], 'confirmed product links require COLLECTION evidence');
});

test('SRC3 S14 Missing usable locators records a limitation; no invented candidate', async t => {
  const f = await fixture(t, ['10', '20', '999'], ['', 'plain source title', url(2)], [], [productUrl, productUrl, unconfirmedUrl]);
  const document = await collectVideos(f);
  assert.deepEqual(document.videoWatch?.candidates, []);
  assert.deepEqual(document.videoWatch?.videos, []);
  const gap = document.limitations.filter(row => row.code === 'TOP_SELLING_VIDEO_LOCATORS_UNAVAILABLE');
  assert.equal(gap.length, 1);
  assert.match(gap[0]!.message, /thiếu đường dẫn video/u);
  assert.doesNotMatch(gap[0]!.message, /PageIndex|Google|Kalodata|Gemini|SerpApi|Apify|TradeInt|Dami|OpenCLI|zen-studio|Agent-Reach|%/iu);
  const result = await topSellingTikTokVideos(f.reader, { workspaceId: f.binding.workspaceId, runId: f.binding.runId }, [productUrl]);
  assert.equal(result.tablesNotVerified, 0);
  assert.equal(result.rowsWithoutUsableVideo, 2);
  assert.deepEqual(result.videos, [], 'a valid video for an unconfirmed product cannot fill the locator gap');
});
