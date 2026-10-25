import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { createKalodataProvider } from '../../src/modules/analysis/research-automation/provider-kalodata.js';
import { createTopSellingVideoSource } from '../../src/modules/analysis/research-automation/top-selling-videos.js';
import type { ProviderTransport } from '../../src/modules/analysis/research-automation/provider-common.js';
import { S14C_NOW, S14C_RUN, S14C_WORKSPACE, s14cCollection } from './research-automation-s14c.fixtures.js';

// Generated with this same synthetic fixture in git-archived origin/main (06a6658d), without a top-selling source.
const MAIN_COLLECTION_SHA256 = '78a5635a460b3e7387c996985425d13ea97ef12153ecafe2f2e0394285b1a033';
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const handles = ['synthetic.rank.one', 'synthetic.rank.two'];

function rankSource() {
  const paid: unknown[] = [];
  const transport: ProviderTransport = { now: () => S14C_NOW().getTime(), sleep: async () => {}, fetch: async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/openapi/v1/credit/balance') return Response.json({ success: true, data: { totalRemain: paid.length ? 9.9 : 10 } });
    assert.equal(url.pathname, '/openapi/v1/tiktok/video/rank');
    paid.push(JSON.parse(String(init?.body)));
    return Response.json({ success: true, data: handles.map((handle, i) => ({ video_id: String(94001 + i), belonged_creator_handle: handle,
      video_title: 'Synthetic ignored title', revenue: 200 - i, views: 10 + i })) });
  } };
  return { paid, source: createTopSellingVideoSource(createKalodataProvider('synthetic-s14c-offline-rank-auth', transport)) };
}

test('S14C row 7: only exactly "1" enables ranking; off values issue no rank call and preserve stored step bytes', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s14c-launcher-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'index.html'), '<!doctype html><title>Synthetic</title>');
  const results: { value: string | undefined; sha256: string }[] = [];
  for (const value of [undefined, '0', '', 'true', ' 1', '1 ', '2', '1']) {
    const config = operatorAppConfigurationFromEnvironment({ TDN_WORKSPACE_DB: path.join(root, 'unused.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts'),
      ...(value === undefined ? {} : { TDN_RESEARCH_TOP_SELLING_VIDEOS_ENABLED: value }) }, { frontendDist: root, version: 'synthetic' });
    const enabled = config.researchTopSellingVideos === true;
    assert.equal(enabled, value === '1', String(value));
    assert.equal('researchTopSellingVideos' in config, enabled, 'disabled flag omits the launcher option');
    if (enabled) continue; // The on control is exercised through COLLECTION below for both report kinds.
    const f = rankSource(), run = await s14cCollection(t, { ...(enabled ? { topSellingVideoSource: f.source } : {}) });
    assert.equal(f.paid.length, 0, String(value));
    assert.equal(run.step.videoWatch?.topSellingRank, undefined);
    assert.equal(run.step.videoWatch?.videos[0]?.reason, 'NOT_A_VIDEO');
    results.push({ value, sha256: sha(run.bytes) });
  }
  assert.equal(new Set(results.map(result => result.sha256)).size, 1, 'all off values store identical bytes');
  await t.test('flag-off collection bytes match origin/main', () => {
    for (const result of results) assert.equal(result.sha256, MAIN_COLLECTION_SHA256, String(result.value));
  });
});

test('S14C row 8: Market and Insight persist rank lineage; handles stay only in URLs and out of reader HTML and logs', async t => {
  const logs: string[] = [];
  for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) t.mock.method(console, method, (...args: unknown[]) => { logs.push(args.map(String).join(' ')); });
  for (const reports of [['MARKET'], ['INSIGHT']] as ('MARKET' | 'INSIGHT')[][]) {
    const f = rankSource();
    const run = await s14cCollection(t, { topSellingVideoSource: f.source, mode: 'subtitle', reports });
    assert.deepEqual(f.paid, [{ product_id: '12345', page_size: 10, page_number: 1, rank_field: 'revenue', asc: false }]);
    const watch = run.step.videoWatch; assert.ok(watch?.topSellingRank);
    assert.equal(watch.topSellingRank.kept, 2);
    assert.deepEqual(watch.candidates.slice(0, 2), handles.map((handle, i) => ({ videoId: String(94001 + i),
      url: `https://www.tiktok.com/@${handle}/video/${94001 + i}`, origin: 'TOP_SELLING' })));
    assert.ok(watch.videos.every(video => video.status === 'READ' && video.path === 'SUBTITLE'));
    assert.equal(run.calls.video, 0);
    assert.equal(run.calls.model, 3);
    assert.equal(run.step.limitations.some(item => item.code === 'TOP_SELLING_VIDEO_LOCATORS_UNAVAILABLE'), false);
    const captures = run.db.prepare("SELECT ordinal, operation, provider FROM analysis_research_automation_captures WHERE run_id=? AND step_id='COLLECTION' ORDER BY ordinal").all(S14C_RUN) as { ordinal: bigint; operation: string; provider: string }[];
    const rank = captures.find(capture => capture.operation === 'kalodata.video.rank'); assert.ok(rank);
    assert.equal(rank.provider, 'kalodata');
    assert.deepEqual(watch.topSellingRank.products, [{ productId: '12345', outcome: 'OK', captureIndex: Number(rank.ordinal) }]);
    assert.ok(watch.videos.every(video => video.captureIndex! > Number(rank.ordinal)), 'lookup captures precede model captures');
    const usage = run.db.prepare("SELECT request_count, cost_state, cost_unit, cost_amount FROM analysis_research_automation_usage WHERE run_id=? AND step_id='COLLECTION' AND ordinal=21").get(S14C_RUN) as { request_count: bigint; cost_state: string; cost_unit: string | null; cost_amount: string | null };
    // The provider's observed account delta is covered at its boundary; service policy keeps run-attributable cost unknown.
    assert.deepEqual([Number(usage.request_count), usage.cost_state, usage.cost_unit, usage.cost_amount], [3, 'UNKNOWN', null, null]);
    const textWithoutUrls = JSON.stringify(run.step, (_key, value) => typeof value === 'string' && /^https:\/\/www\.tiktok\.com\/@/u.test(value) ? '[exact video URL]' : value);
    for (const handle of handles) assert.equal(textWithoutUrls.includes(handle), false, 'handle is not copied to step text');
    assert.equal(textWithoutUrls.includes('Synthetic ignored title'), false);
    if (reports[0] === 'MARKET') {
      const html = await run.html();
      assert.ok(html.includes('Câu giả lập.'), 'the reader actually renders a verified subtitle reading');
      for (const handle of handles) assert.equal(html.includes(handle), false, 'handle absent from all HTML, including attributes');
      const callsBefore = { ...run.calls }, paidBefore = f.paid.length;
      assert.equal(await run.html(), html, 'stored native reading replay keeps exact HTML');
      const previousPairId = (await run.service.listReportVersions(S14C_WORKSPACE, S14C_RUN)).at(-1)!.pairId;
      await run.service.requestReportRevision(S14C_WORKSPACE, S14C_RUN, {
        contractVersion: 'automation-report-revision-v1', requestKey: '55555555-5555-4555-8555-555555555555', previousPairId,
        sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      });
      await run.service.processNext();
      assert.ok((await run.html()).includes('Câu giả lập.'), 'revision keeps the native subtitle reading');
      assert.deepEqual(run.calls, callsBefore, 'replay and revision make no subtitle, video or model call');
      assert.equal(f.paid.length, paidBefore, 'replay and revision never repeat the paid video rank');
    }
  }
  for (const handle of handles) assert.equal(logs.join('\n').includes(handle), false, 'handle absent from application logs');
  assert.equal(logs.join('\n').includes('Câu giả lập.'), false, 'raw subtitle text absent from application logs');
});
