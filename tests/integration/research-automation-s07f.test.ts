import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createTikTokCommentPrivacy, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { createFreeTikTokCommentsCollector } from '../../src/platform/collectors/apify-tiktok-comments-free.js';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { tiktokCodingCliproxyConfiguration } from '../../src/modules/analysis/research-automation/i14-cliproxy-transport.js';
import { fakeCodingPort } from '../fixtures/tiktok-coding-fixture.js';
import { providerNameViolations } from '../helpers/report-visible-text.js';
import { s14cCollection } from './research-automation-s14c.fixtures.js';
import { S07F_NOW, S07F_RUN, S07F_WORKSPACE, s07fQueuedRun, s07fUrl, sha } from './research-automation-s07f.fixtures.js';

const gaps = 'research-automation-api.ts:463-486 never passes the free collector to the worker; service.ts:378-465 has no S07 lane';
const videos = [{ url: s07fUrl(1001), revenue: '20' }, { url: s07fUrl(1002), revenue: '90' },
  { url: s07fUrl(1002), revenue: '80' }, { url: s07fUrl(1003), revenue: '60' }, { url: s07fUrl(1004), revenue: '50' },
  { url: s07fUrl(1005), revenue: '40' }, { url: s07fUrl(1006), revenue: '30' }, { url: s07fUrl(1007) + '?tracking=1', revenue: '1000' }];

function collector(onStart?: (url: string) => Promise<void>) {
  const starts: string[] = [];
  const transport: TikTokCommentsTransport = {
    async start(_actor, input) {
      const url = (input.startUrls as string[])[0]!; starts.push(url); await onStart?.(url);
      return { runId: 'syntheticRun' + starts.length, datasetId: 'syntheticData' + starts.length, buildId: null,
        status: 'SUCCEEDED', retrievedAt: S07F_NOW().toISOString(), providerTotalRows: 2, usageTotalUsd: 0.002 };
    },
    async readPage(_receipt, offset) {
      if (offset) return Buffer.from('[]');
      const current = starts.at(-1)!, videoId = current.split('/').at(-1)!;
      return Buffer.from(JSON.stringify([
        { inputSource: current, aweme_id: videoId, cid: '2001', text: 'synthetic product RAW_CUSTOMER_SENTINEL',
          create_time: 1704067200, digg_count: 1, reply_id: '0', user: { uid: '445566', unique_id: 'synthetic.customer' } },
        { inputSource: current, aweme_id: videoId, cid: '2002', text: 'synthetic product RAW_SELLER_SENTINEL',
          create_time: 1704067200, digg_count: 1, reply_id: '0', user: { uid: '778899', unique_id: 'synthetic.seller' } },
      ]));
    },
  };
  return { starts, value: createFreeTikTokCommentsCollector({ token: 'synthetic-unused', transport,
    privacy: createTikTokCommentPrivacy({ keyId: S07F_WORKSPACE, salt: Buffer.alloc(32, 71) }) }) };
}

// Look at the stored contract, without requiring a particular new step property name.
function objects(value: unknown): Record<string, unknown>[] {
  if (value === null || typeof value !== 'object') return [];
  return Array.isArray(value) ? value.flatMap(objects) : [value as Record<string, unknown>, ...Object.values(value).flatMap(objects)];
}

test('S07F row 5: off flag table constructs no collector, adds no S07 step and matches main bytes', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s07f-off-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><title>Synthetic</title>');
  for (const flag of [undefined, '0', 'true']) {
    const config = operatorAppConfigurationFromEnvironment({ TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'),
      TDN_ARTIFACT_ROOT: path.join(root, 'artifacts'), ...(flag === undefined ? {} : { TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED: flag }) },
    { frontendDist: root, version: 'synthetic' });
    assert.equal(config.researchTikTokFreeComments, undefined);
    const run = await s14cCollection(t, { reports: ['INSIGHT'] });
    assert.equal(JSON.stringify(run.step).includes('S07'), false);
    // Frozen by running this fixture in archived origin/main, independently of this branch.
    assert.equal(sha(run.bytes), '877de38d63c6183797726c12c60613ac5336641fe576aa761cc8a87964959072');
  }
});

for (const scenario of [
  { name: 'Insight without videos stores NO_VIDEOS', reports: ['INSIGHT'], videos: [], outcome: 'NO_VIDEOS', dispatches: 0, todo: gaps },
  { name: 'Insight takes TOP_SELLING before S02 revenue, deduplicates exact videos, caps five and marks selection automatic', reports: ['INSIGHT'], videos,
    outcome: 'COLLECTED', dispatches: 5, todo: gaps },
  { name: 'Market-only never dispatches S07', reports: ['MARKET'], videos, outcome: null, dispatches: 0, todo: false },
  { name: 'transport failure stores PROVIDER_FAILED and leaves the run usable', reports: ['INSIGHT'], videos: videos.slice(0, 1),
    outcome: 'PROVIDER_FAILED', dispatches: 1, todo: gaps },
] as const) {
  test(`S07F row 6: ${scenario.name}`, { todo: scenario.todo }, async t => {
    t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
    const f = await s07fQueuedRun(t, { reports: [...scenario.reports], videos: [...scenario.videos], rankedTopSelling: scenario.outcome === 'COLLECTED' });
    const free = collector(scenario.outcome === 'PROVIDER_FAILED' ? async () => { throw new Error('synthetic transport failure'); } : undefined);
    const run = await f.execute(free.value); // Also exercises startup with the existing paid cap of 5.
    if (scenario.outcome === 'COLLECTED') assert.ok(objects(run.document).some(value => value.videoId === '9001' && value.origin === 'TOP_SELLING'),
      'the fixture must retain the existing S14 candidate before checking the S07 gap');
    assert.equal(free.starts.length, scenario.dispatches, 'free dispatch count');
    if (scenario.outcome === null) {
      assert.equal(JSON.stringify(run.document).includes('S07'), false);
      return;
    }
    assert.ok(objects(run.document).some(value => Object.values(value).includes(scenario.outcome)), `stored S07 outcome ${scenario.outcome}`);
    if (scenario.outcome === 'COLLECTED') {
      assert.deepEqual(free.starts, [9001, 1002, 1003, 1004, 1005].map(s07fUrl));
      assert.equal(f.providerCalls.filter(endpoint => endpoint.endsWith('/video/rank')).length, 1, 'S07 reuses the already fetched S14 list');
      const files = await f.files();
      const documents = files.filter(file => file.path.endsWith('.json')).flatMap(file => objects(JSON.parse(file.bytes.toString())));
      assert.ok(documents.some(value => value.selectedBy === 'AUTOMATIC_TOP_SELLING'), 'retained automatic selection');
      const capture = documents.find(value => value.contractVersion === 'tiktok-comment-capture-v2');
      assert.equal((capture?.runs as unknown[] | undefined)?.length, 5, 'every receipt is durably packaged');
    }
  });
}

test('S07F row 7 TODO: automatic dispatch retains intent first and unfinished recovery never redispatches', { todo: gaps }, async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const f = await s07fQueuedRun(t, { videos: videos.slice(0, 1) });
  let intentAtDispatch = false;
  const free = collector(async () => {
    intentAtDispatch = (await f.files()).some(file => file.path === 'intent.json' &&
      objects(JSON.parse(file.bytes.toString())).some(value => value.actor === 'epctex/tiktok-comment-scraper'));
    throw new Error('synthetic dispatch ended without a receipt');
  });
  await f.execute(free.value);
  const before = free.starts.length;
  const cold = collector();
  await f.execute(cold.value); // A new worker and collector must rely on the persisted unfinished intent.
  assert.equal(cold.starts.length, 0, 'recovery cannot redispatch an unfinished retained intent');
  assert.equal(before, 1, 'the first worker must reach dispatch');
  assert.equal(intentAtDispatch, true, 'owning intent must exist before dispatch');
});

test('S07F row 7 TODO: retained automatic comments replay and revision use zero network calls', { todo: gaps }, async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected network'); });
  const f = await s07fQueuedRun(t, { reports: ['MARKET', 'INSIGHT'], videos: videos.slice(0, 1) });
  const free = collector(); await f.execute(free.value);
  const starts = free.starts.length, providerCalls = f.providerCalls.length;
  const original = await f.service.readReport(S07F_WORKSPACE, S07F_RUN, 'INSIGHT');
  assert.ok((await f.service.readReport(S07F_WORKSPACE, S07F_RUN, 'INSIGHT')).bytes.equals(original.bytes));
  const pair = (await f.service.listReportVersions(S07F_WORKSPACE, S07F_RUN)).at(-1)!;
  await f.service.requestReportRevision(S07F_WORKSPACE, S07F_RUN, { contractVersion: 'automation-report-revision-v1',
    requestKey: '66666666-6666-4666-8666-666666666666', previousPairId: pair.pairId,
    sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } } });
  await f.service.processNext();
  await f.service.readReport(S07F_WORKSPACE, S07F_RUN, 'INSIGHT');
  assert.equal(free.starts.length, starts);
  assert.equal(f.providerCalls.length, providerCalls);
  assert.ok((await f.files()).some(file => file.path === 'capture.json' &&
    JSON.parse(file.bytes.toString()).contractVersion === 'tiktok-comment-capture-v2'), 'replay proof requires actual retained free evidence');
});

test('S07F row 8 TODO: coded customer themes and sample limitation reach Insight; raw fields stay out of HTML/logs', {
  todo: 'service.ts:3820-4000 has no automatic TikTok coding/report input (R-I05; NH-2 still records stopped status)',
}, async t => {
  const logs: string[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
  const configuration = tiktokCodingCliproxyConfiguration('synthetic-coding-model'), port = fakeCodingPort();
  t.mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    assert.equal(new URL(String(input)).hostname, '127.0.0.1', 'all model traffic terminates in this fake');
    const body = JSON.parse(String(init?.body));
    const response = await port.generateText({ configuration, signal: new AbortController().signal,
      systemText: body.messages[0].content, userText: body.messages[1].content });
    return Response.json({ choices: [{ message: { content: response.text }, finish_reason: 'stop' }] });
  });
  const f = await s07fQueuedRun(t, { videos: videos.slice(0, 1) }), free = collector();
  await f.execute(free.value, { cliproxy: { baseUrl: 'http://127.0.0.1:8317', apiKey: 'synthetic-model-auth' }, configuration });
  const html = (await f.service.readReport(S07F_WORKSPACE, S07F_RUN, 'INSIGHT')).bytes.toString();
  assert.deepEqual(providerNameViolations(html), []);
  for (const bytes of [html, logs.join('\n')]) assert.equal(/RAW_CUSTOMER_SENTINEL|RAW_SELLER_SENTINEL|synthetic\.(?:seller|customer)|445566|778899/iu.test(bytes), false, 'no raw comment or identity in presentation/logs');
  assert.ok(/Mẫu nhỏ:[\s\S]*10 bình luận[\s\S]*5 video/u.test(html), 'Insight must disclose the free comment sample limitation');
  assert.ok(port.dispatches() > 0, 'customer themes must use the configured coding path');
  assert.ok(/chủ đề 0/u.test(html), 'the coded theme label must appear in the reader');
  assert.ok(/ý kiến khách hàng|tiếng nói khách hàng/iu.test(html), 'coded comments must be identified as customer voice');
});
