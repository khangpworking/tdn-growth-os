import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { createTopSellingVideoSource, rankTopSellingVideos } from '../../src/modules/analysis/research-automation/top-selling-videos.js';
import { tiktokShopProductCandidates } from '../../src/modules/analysis/research-automation/tiktok-shop-reviews.js';
import { VideoWatchLane, videoWatchCandidates } from '../../src/modules/analysis/research-automation/video-watch-lane.js';
import { videoLane, type SaveStepContext, type VideoLaneFacts } from '../../src/modules/analysis/research-automation/collection-lanes-save-step.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import type { StepExpandedQuery, StepResultDocument, TypedComparable } from '../../src/modules/analysis/research-automation/model.js';

const RUN = '22222222-2222-4222-8222-222222222222';
const now = () => new Date('2026-10-02T00:00:00.000Z');
const url = (id: string, handle = 'synthetic.rank') => `https://www.tiktok.com/@${handle}/video/${id}`;
const row = (id: string, revenue: number | null, views: number | null, handle = 'synthetic.rank') =>
  ({ video_id: id, belonged_creator_handle: handle, revenue, views, video_title: 'Synthetic unused title' });

function videoRankTransport(options: { before?: number; after?: number; preflightStatus?: number;
  reply?: (id: string, index: number) => Response } = {}) {
  const paid: { method: string | undefined; body: unknown; url: URL }[] = [], events: string[] = [];
  let balances = 0;
  const transport: ProviderTransport = { now: () => now().getTime(), sleep: async () => {}, fetch: async (input, init) => {
    const target = new URL(String(input));
    if (target.pathname === '/openapi/v1/credit/balance') {
      events.push('balance'); balances++;
      return Response.json({ success: true, data: { totalRemain: balances === 1 ? options.before ?? 10 : options.after ?? 9.7 } },
        { status: balances === 1 ? options.preflightStatus ?? 200 : 200 });
    }
    assert.equal(target.pathname, '/openapi/v1/tiktok/video/rank');
    const body = JSON.parse(String(init?.body));
    paid.push({ method: init?.method, body, url: target }); events.push(body.product_id);
    return options.reply?.(body.product_id, paid.length - 1) ?? Response.json({ success: true, data: [row('91001', 1, 1)] });
  } };
  return { transport, paid, events };
}

test('S14C row 8: confirmed collected products, top-three revenue order, rank protocol, merge/dedupe and five-video cap', async () => {
  const comparable = (productId: string, metric: TypedComparable['metric'], value: string, provider = 'kalodata'): TypedComparable =>
    ({ productId, metric, value, provider, window: { startDate: '2026-09-01', endDate: '2026-09-30' }, captureIndex: 0 });
  const candidates = tiktokShopProductCandidates(new Set(['kalodata:101', 'kalodata:102', 'kalodata:103', 'kalodata:104', 'kalodata:105']),
    new Set(['kalodata:101', 'kalodata:102', 'kalodata:103', 'kalodata:104', 'kalodata:106']), [
      comparable('kalodata:101', 'GMV_VND', '50'), comparable('kalodata:101', 'GMV_VND', '60'), comparable('kalodata:102', 'GMV_VND', '300'),
      comparable('kalodata:103', 'UNITS_SOLD', '9999'), comparable('kalodata:104', 'GMV_VND', '200'),
      comparable('kalodata:105', 'GMV_VND', '1000'), comparable('kalodata:106', 'GMV_VND', '1000'), comparable('kalodata:107', 'GMV_VND', '1000', 'shopee')]);
  assert.deepEqual(candidates, [{ productId: '101', revenue: 110 }, { productId: '102', revenue: 300 }, { productId: '103', revenue: null }, { productId: '104', revenue: 200 }]);
  const data = [row('91001', 50, 100), row('91002', 100, 1), row('91001', 200, 2, 'synthetic.winner'), row('91003', 100, 30),
    row('91004', 0, 0), row('91005', null, 100), row('91006', 100, null), row('91007', 99, 10), row('bad-id', 999, 99), row('91008', 999, 99, 'bad/handle')];
  for (const c of [{ candidates, ids: ['102', '104', '101'] },
    { candidates: candidates.filter(item => item.productId !== '104'), ids: ['102', '101', '103'] }]) {
    const f = videoRankTransport({ reply: () => Response.json({ success: true, data }) });
    const source = createTopSellingVideoSource(createKalodataProvider('synthetic-s14c-offline-rank-auth', f.transport));
    const result = await source.collect(c.candidates); assert.ok(result);
    assert.deepEqual(f.paid.map(call => [call.method, call.url.origin, call.url.search, call.body]), c.ids.map(product_id =>
      ['POST', 'https://www.kalodata.com', '', { product_id, page_size: 10, page_number: 1, rank_field: 'revenue', asc: false }]));
    assert.deepEqual(f.events, ['balance', ...c.ids, 'balance']);
    assert.deepEqual(rankTopSellingVideos(result), ['91001', '91003', '91002', '91006', '91007'].map(id => ({ videoId: id, url: url(id, id === '91001' ? 'synthetic.winner' : 'synthetic.rank') })));
    assert.equal(result.usage.automaticRetries, 0);
    assert.equal(result.usage.credits.status, 'OBSERVED_ACCOUNT_BALANCE_DELTA');
    if (result.usage.credits.status === 'OBSERVED_ACCOUNT_BALANCE_DELTA') assert.equal(result.usage.credits.consumed, 0.3);
  }
  const f = videoRankTransport({ reply: () => Response.json({ success: true, data: [row('92001', null, 9999), row('92002', 0, null), row('92003', 0, 0)] }) });
  const source = createTopSellingVideoSource(createKalodataProvider('synthetic-s14c-offline-rank-auth', f.transport));
  assert.equal(await source.collect([]), null); assert.equal(f.events.length, 0);
  assert.deepEqual(rankTopSellingVideos(await source.collect([{ productId: '101', revenue: null }])).map(video => video.videoId), ['92003', '92002', '92001'], 'missing revenue/views sort last; zero stays observed');
});

test('S14C row 8: credit, auth/rate and ambiguous responses never retry paid requests', async () => {
  for (const c of [
    { name: 'zero balance', before: 0, expected: ['NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_CREDIT_EXHAUSTED'], paid: 0, exhausted: true },
    { name: '2016 after one OK', before: 10, expected: ['OK', 'NOT_RUN_CREDIT_EXHAUSTED', 'NOT_RUN_CREDIT_EXHAUSTED'], paid: 2, exhausted: true,
      reply: (_id: string, i: number) => Response.json(i === 0 ? { success: true, data: [row('91001', 1, 1)] } : { success: false, code: 2016 }) },
    ...[401, 403, 429].map(status => ({ name: `paid ${status}`, before: 10, expected: ['FAILED', 'NOT_RUN_STOPPED', 'NOT_RUN_STOPPED'], paid: 1, exhausted: false,
      reply: () => Response.json({ success: false }, { status }) })),
    ...[401, 403, 429].map(status => ({ name: `preflight ${status}`, before: 10, preflightStatus: status, expected: ['NOT_RUN_STOPPED', 'NOT_RUN_STOPPED', 'NOT_RUN_STOPPED'], paid: 0, exhausted: false })),
    { name: 'transport ambiguity', before: 10, expected: ['AMBIGUOUS_NO_RETRY', 'AMBIGUOUS_NO_RETRY', 'AMBIGUOUS_NO_RETRY'], paid: 3, exhausted: false,
      reply: () => { throw new Error('synthetic network refusal'); } },
  ]) {
    const f = videoRankTransport(c), result = await createKalodataProvider('synthetic-s14c-offline-rank-auth', f.transport).topSellingVideos(['101', '102', '103']);
    assert.deepEqual(result.products.map(product => product.outcome), c.expected, c.name);
    assert.equal(result.creditExhausted, c.exhausted, c.name);
    assert.equal(f.paid.length, c.paid, c.name);
    assert.deepEqual(f.paid.map(call => (call.body as { product_id: string }).product_id), ['101', '102', '103'].slice(0, c.paid), c.name);
    assert.equal(result.usage.paidRequestsIssued, c.paid, c.name);
    assert.equal(result.usage.automaticRetries, 0, c.name);
    assert.equal(f.events[0], 'balance', c.name);
  }
});

test('S14C row 9: first origin wins; selection, five uploaded/automated top-selling, search; total ten; gap only with neither source', async t => {
  const queries: StepExpandedQuery[] = [{ kind: 'TIKTOK', status: 'COLLECTED', reason: null, requestedWindow: null, retrievedAt: now().toISOString(), captureIndex: 0,
    results: ['1001', '2001', '3001', '4001', '4002', '4003', '4004', '4005'].map((id, i) => ({ url: url(id), position: i + 1, title: 'Synthetic', snippet: null, retrievedAt: now().toISOString(), captureIndex: 0 })) }];
  const uploaded = ['1001', '2001', '2002'].map(id => ({ url: url(id) }));
  const automated = ['2001', '3001', '3002', '3003', '3004', '3005'].map(id => ({ url: url(id) }));
  const plan = videoWatchCandidates([{ url: url('1001', 'synthetic.selection') }], queries, uploaded, automated);
  assert.deepEqual(plan.candidates.map(c => [c.videoId, c.origin]), [['1001', 'SELECTION'], ['2001', 'TOP_SELLING'], ['2002', 'TOP_SELLING'],
    ['3001', 'TOP_SELLING'], ['3002', 'TOP_SELLING'], ['3003', 'TOP_SELLING'], ['4001', 'EXPANDED_SEARCH'], ['4002', 'EXPANDED_SEARCH'], ['4003', 'EXPANDED_SEARCH'], ['4004', 'EXPANDED_SEARCH']]);
  assert.equal(plan.candidates[0]?.url, url('1001', 'synthetic.selection'));
  assert.deepEqual(plan.skipped, [{ videoId: '4005', reason: 'OVER_10_VIDEOS' }]);
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s14c-gap-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const c of [{ uploaded: false, automated: false, gap: true }, { uploaded: true, automated: false, gap: false },
    { uploaded: false, automated: true, gap: false }, { uploaded: true, automated: true, gap: false }]) {
    const f = videoRankTransport({ reply: () => Response.json({ success: true, data: c.automated ? [row('3001', 100, 10)] : [] }) });
    const source = createTopSellingVideoSource(createKalodataProvider('synthetic-s14c-offline-rank-auth', f.transport));
    const executor = new VideoWatchLane({ media: { mediaDir: root, ytdlpBin: 'unused', ffprobeBin: 'unused' }, model: null, now,
      runner: async () => { throw new Error('unconfigured model must prevent downloads'); } });
    const step: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: RUN, stepId: 'COLLECTION', outcome: 'SUCCEEDED', productCards: [], comparables: [], coverage: [], limitations: [] };
    const facts: VideoLaneFacts = { market: true, context: async () => ({ binding: { workspaceId: '11111111-1111-4111-8111-111111111111', runId: RUN, scopeSha256: 'a'.repeat(64), sourceSetSha256: null },
      productKeyword: 'synthetic product', selectionVideos: [], topSellingVideos: c.uploaded ? [{ url: url('2001') }] : [], topSellingGap: true, topSellingProducts: [{ productId: '101', revenue: 1 }] }),
      publish: async () => { throw new Error('no publication expected'); } };
    // No capture storage is claimed here; durable capture indexes are covered by the service integration test.
    const context: SaveStepContext = { stepId: 'COLLECTION', signal: undefined, check: () => {}, captures: { envelopes: () => [], put: async () => {}, rows: () => [], byteSize: () => 0 } };
    const result = await videoLane(executor, source).run(step, context, facts);
    assert.equal(result.step.limitations.some(item => item.code === 'TOP_SELLING_VIDEO_LOCATORS_UNAVAILABLE'), c.gap, JSON.stringify(c));
    assert.deepEqual(result.step.videoWatch?.candidates.map(item => item.videoId), [...(c.uploaded ? ['2001'] : []), ...(c.automated ? ['3001'] : [])]);
  }
});
