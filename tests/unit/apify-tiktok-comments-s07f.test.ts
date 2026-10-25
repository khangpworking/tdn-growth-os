import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, createHmac } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, retainedPerVideoCapture,
  TIKTOK_COMMENT_ACTORS, TikTokCommentCollectorError, tikTokCommentActorInput,
  type TikTokCommentsTransport, type TikTokCommentRunReceipt } from '../../src/platform/collectors/apify-tiktok-comments.js';
import { ApifyTikTokCommentsHttpTransport, createFreeTikTokCommentsCollector } from '../../src/platform/collectors/apify-tiktok-comments-free.js';
import { openOperatorApp, operatorAppConfigurationFromEnvironment } from '../../src/api/operator-app.js';
import { openDatabase } from '../../src/platform/db/index.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildTikTokCommentCorpus } from '../../src/modules/analysis/research-automation/tiktok-comment-intake.js';
import { legacyCaptureBytes } from '../integration/research-automation-s07f.fixtures.js';

const url = (id = 1001) => `https://www.tiktok.com/@synthetic.seller/video/${id}`;
const keyId = '11111111-1111-4111-8111-111111111111';
const salt = Buffer.alloc(32, 71); // Synthetic fixture material only.
const privacy = () => createTikTokCommentPrivacy({ keyId, salt });
const request = 'a'.repeat(64);
const sha = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const row = (extra: Record<string, unknown> = {}) => ({ inputSource: url(), aweme_id: '1001', cid: '2001',
  text: 'Synthetic product @synthetic.contact mail fixture@example.test call 0901234567',
  create_time: 1704067200, digg_count: 7, reply_id: '0', reply_comment_total: 987,
  comment_language: 'PRIVATE_COMMENT_LANGUAGE', is_author_digged: true,
  user: { uid: '998877665544', unique_id: 'synthetic.customer', nickname: 'PRIVATE_NICKNAME', signature: 'PRIVATE_SIGNATURE',
    avatar_thumb: { url_list: ['https://example.test/PRIVATE_AVATAR'] }, region: 'PRIVATE_REGION', language: 'PRIVATE_LANGUAGE',
    has_email: 'PRIVATE_HAS_EMAIL', is_phone_binded: 'PRIVATE_PHONE_BOUND', cover_url: ['PRIVATE_COVER'] }, ...extra });

function fake(pages: unknown[][], usage = 0.002) {
  const starts: { actor: string; input: Readonly<Record<string, unknown>>; cap: number }[] = [];
  const receipts: TikTokCommentRunReceipt[] = [];
  const datasets = new Map<string, unknown[]>();
  const transport: TikTokCommentsTransport = {
    async start(actor, input, cap) {
      const index = starts.length, values = pages[index] ?? [];
      starts.push({ actor, input, cap });
      const receipt: TikTokCommentRunReceipt = { runId: `syntheticRun${index}`, datasetId: `syntheticDataset${index}`,
        buildId: `syntheticBuild${index}`, status: 'SUCCEEDED', retrievedAt: '2026-10-25T00:00:00Z',
        providerTotalRows: values.length, usageTotalUsd: usage };
      receipts.push(receipt); datasets.set(receipt.datasetId, values);
      return { ...receipt, providerPrivateExtra: 'PRIVATE_RECEIPT_EXTRA' };
    },
    async readPage(receipt, offset, limit) { return Buffer.from(JSON.stringify(datasets.get(receipt.datasetId)!.slice(offset, offset + limit))); },
  };
  const collector = createFreeTikTokCommentsCollector({ token: 'synthetic-unused', privacy: privacy(), transport });
  return { collector, transport, starts, receipts };
}

test('S07F row 1: free dispatch protocol and rejected selection/configuration table', async () => {
  const urls = Array.from({ length: 5 }, (_, i) => url(1001 + i));
  const f = fake(urls.map(() => []));
  await f.collector.collectPerVideo(urls, request);
  assert.deepEqual(f.starts, urls.map(value => ({ actor: 'epctex/tiktok-comment-scraper',
    input: { startUrls: [value], maxItems: 10, includeReplies: false }, cap: 0.05 })));
  for (const invalid of [[], [...urls, url(1006)], [url(), url()], [url(), 'https://www.tiktok.com/@other/video/1001'],
    [url() + '?tracking=1'], [url() + '/'], ['http://www.tiktok.com/@x/video/1001'], ['https://vm.tiktok.com/synthetic']]) {
    const rejected = fake([]);
    await assert.rejects(rejected.collector.collectPerVideo(invalid, request), TikTokCommentCollectorError);
    assert.equal(rejected.starts.length, 0, 'validation precedes dispatch');
  }
  for (const maximum of [0, 1, 9, 11, 200]) {
    assert.throws(() => tikTokCommentActorInput(TIKTOK_COMMENT_ACTORS.free, [url()], maximum), TikTokCommentCollectorError);
    assert.throws(() => new ApifyTikTokCommentsCollector({ actor: TIKTOK_COMMENT_ACTORS.free, transport: f.transport,
      privacy: privacy(), approvedMaxTotalChargeUsd: 0.05, maxCommentsPerVideo: maximum }), TikTokCommentCollectorError);
  }
  assert.throws(() => tikTokCommentActorInput(TIKTOK_COMMENT_ACTORS.free, [url(), url(1002)], 10), TikTokCommentCollectorError);
  for (const values of [
    Array.from({ length: 11 }, (_, i) => row({ cid: String(2001 + i) })),
    Array.from({ length: 11 }, (_, i) => row({ cid: String(2001 + i), reply_id: '1999' })),
    Array.from({ length: 11 }, () => row()),
  ]) {
    await assert.rejects(fake([values]).collector.collectPerVideo([url()], request), TikTokCommentCollectorError,
      'the free actor retains at most ten comment rows, including replies and duplicates');
  }
});

test('S07F row 2: mapping, allowlisted retained bytes, notices and contradictory locators table', async () => {
  const f = fake([[row(), row({ cid: '2002', reply_id: '2001' }), { message: 'PRIVATE_UPSELL_NOTICE' }]]);
  const capture = await f.collector.collectPerVideo([url()], request);
  const run = capture.runs[0]!;
  assert.deepEqual([run.returnedRows, run.providerNotices, run.comments, run.replies], [3, 1, 1, 1]);
  const first = run.pages[0]!.rows[0]!, { evidenceCommitment, ...mapped } = first;
  assert.deepEqual(Object.keys(first).sort(), ['videoId', 'commentId', 'videoUrl', 'pageIndex', 'rowIndex', 'text', 'textForm',
    'createdAt', 'likeCount', 'authorIdentity', 'voice', 'isReply', 'exclusionReason', 'evidenceCommitment'].sort());
  assert.deepEqual(mapped, { videoId: '1001', commentId: '2001', videoUrl: url(), pageIndex: 0, rowIndex: 0,
    text: 'Synthetic product [handle removed] mail [email removed] call [phone removed]', textForm: 'SANITIZED',
    createdAt: '2024-01-01T00:00:00Z', likeCount: 7,
    authorIdentity: { state: 'HASHED', hash: createHmac('sha256', salt).update('tdn:tiktok.com:author:v1\0').update('998877665544').digest('hex') },
    voice: 'CUSTOMER', isReply: false, exclusionReason: null });
  assert.match(evidenceCommitment, /^[a-f0-9]{64}$/);
  assert.deepEqual([run.pages[0]!.rows[1]!.isReply, run.pages[0]!.rows[1]!.exclusionReason], [true, 'REPLY']);
  const stored = canonicalJson(retainedPerVideoCapture(capture)) + run.pages.map(page => page.bytes.toString()).join('');
  // Both field names and distinctive synthetic values must be absent, including unused provider additions.
  for (const forbidden of ['"user"', '"uid"', '"unique_id"', '"nickname"', '"signature"', '"avatar_thumb"', '"region"', '"language"',
    '"has_email"', '"is_phone_binded"', '"cover_url"', 'comment_language', 'reply_comment_total', 'is_author_digged',
    'PRIVATE_', '998877665544', 'synthetic.customer', 'synthetic.contact', 'fixture@example.test', '0901234567']) {
    assert.equal(stored.includes(forbidden), false, `retained privacy allowlist: ${forbidden}`);
  }
  for (const changed of [{ aweme_id: '9999' }, { inputSource: url(1002) }, { inputSource: url() + '?tracking=1' }, { cid: '' }]) {
    await assert.rejects(fake([[row(changed)]]).collector.collectPerVideo([url()], request), TikTokCommentCollectorError);
  }
  for (const notice of [{ demo: true }, { cid: null, message: 'PRIVATE_NOTICE' }]) {
    const only = await fake([[notice]]).collector.collectPerVideo([url()], request);
    assert.deepEqual([only.runs[0]!.providerNotices, only.runs[0]!.comments, only.runs[0]!.pages.length], [1, 0, 0]);
  }
});

test('S07F row 3: URL-handle seller classification table', async () => {
  for (const [handle, expected] of [['synthetic.seller', 'SELLER_OR_CREATOR'], ['synthetic.customer', 'CUSTOMER']]) {
    const capture = await fake([[row({ user: { uid: '998877665544', unique_id: handle } })]]).collector.collectPerVideo([url()], request);
    assert.equal(capture.runs[0]!.pages[0]!.rows[0]!.voice, expected);
    assert.equal(capture.runs[0]!.sellerOrCreatorRows, expected === 'SELLER_OR_CREATOR' ? 1 : 0);
  }
});

test('S07F row 3 TODO: v2 corpus excludes seller comments from customer evidence', {
  todo: 'tiktok-comment-intake.ts:33-34 accepts only v1 captures; free v2 corpus integration is missing',
}, async () => {
  const capture = await fake([[row({ cid: '2001', text: 'synthetic product', user: { uid: '11', unique_id: 'synthetic.seller' } }),
    row({ cid: '2002', text: 'synthetic product', user: { uid: '12', unique_id: 'synthetic.customer' } })]]).collector.collectPerVideo([url()], request);
  const selection = { contractVersion: 'tiktok-video-selection-v1' as const, workspaceId: keyId, runId: '22222222-2222-4222-8222-222222222222',
    scopeSha256: 'd'.repeat(64), sourceSetSha256: 'e'.repeat(64), requestedPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' },
    sourcePeriod: { state: 'UNKNOWN_UNVERIFIED' as const, startDate: null, endDate: null },
    sourcePackage: { packageId: '33333333-3333-4333-8333-333333333333', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) },
    tableSha256: 'c'.repeat(64), option: 'A_TOP_20_PERCENT' as const, tieRule: 'EXACT_SOURCE_ORDER' as const, maximumVideos: 30 as const,
    sampleVideoCount: 1, excluded: [], videos: [{ videoId: '1001', url: url(), kind: 'SELLER_VIDEO' as const, sourceLine: 'csv:row:2', revenue: '1' }] };
  // The cast exposes the unsupported production contract; no fabricated v2->v1 adapter hides the defect.
  const corpus = buildTikTokCommentCorpus({ selection, selectionSha256: sha(canonicalJson(selection)) },
    capture as unknown as Parameters<typeof buildTikTokCommentCorpus>[1], { contractVersion: 'l9-keyword-data-v1',
      dataVersion: 'synthetic-v1', category: 'synthetic product', provenance: 'MODEL_DRAFTED', keywords: ['synthetic product'], exclusions: [] });
  assert.deepEqual(corpus.records.filter(record => record.disposition === 'INCLUDED').map(record => record.commentId), ['2002']);
  assert.equal(corpus.accounting.byReason.SELLER_OR_CREATOR, 1);
});

test('S07F row 4: every per-video receipt retained and per-run usage boundary table', async () => {
  for (const usage of [0, 0.002, 0.05, 0.050001]) {
    const f = fake([[], []], usage), observed: TikTokCommentRunReceipt[] = [];
    if (usage > 0.05) {
      await assert.rejects(f.collector.collectPerVideo([url(), url(1002)], request), TikTokCommentCollectorError);
      assert.equal(f.starts.length, 1, 'over-cap first run prevents another dispatch');
    } else {
      const capture = await f.collector.collectPerVideo([url(), url(1002)], request, undefined, async receipt => { observed.push(receipt); });
      assert.deepEqual(retainedPerVideoCapture(capture).runs.map(run => run.receipt), f.receipts);
      assert.deepEqual(observed, f.receipts);
      assert.equal(canonicalJson(retainedPerVideoCapture(capture)).includes('PRIVATE_RECEIPT_EXTRA'), false);
    }
  }
});

test('S07F HTTP receipts reject excess usage and cap drift throughout polling and settlement', async () => {
  for (const scenario of ['valid', 'start-usage', 'poll-usage', 'settled-usage', 'unsettled-usage', 'settled-cap'] as const) {
    let posts = 0, reads = 0, datasetReads = 0;
    const transport = new ApifyTikTokCommentsHttpTransport({ token: 'synthetic-http-auth', sleep: async () => {},
      fetch: async (input, init) => {
        const endpoint = new URL(String(input));
        assert.equal(endpoint.origin, 'https://api.apify.com');
        if (init?.method === 'POST') {
          posts++;
          assert.equal(endpoint.searchParams.get('maxTotalChargeUsd'), '0.05');
        } else if (endpoint.pathname.startsWith('/v2/actor-runs/')) reads++;
        else if (endpoint.pathname === '/v2/datasets/syntheticData') {
          datasetReads++;
          return Response.json({ data: { itemCount: scenario === 'unsettled-usage' ? datasetReads : 0 } });
        } else if (endpoint.pathname.endsWith('/items')) return Response.json([]);
        else assert.fail('unexpected provider endpoint');
        return Response.json({ data: { id: 'syntheticRun', defaultDatasetId: 'syntheticData', buildId: null,
          status: scenario === 'poll-usage' && posts === 1 && reads === 0 ? 'RUNNING' : 'SUCCEEDED',
          usageTotalUsd: (scenario === 'start-usage' && reads === 0) ||
            (['poll-usage', 'settled-usage', 'unsettled-usage'].includes(scenario) && reads > 0) ? 0.06 : 0.002,
          options: { maxTotalChargeUsd: scenario === 'settled-cap' && reads > 0 ? 5 : 0.05 } } });
      } });
    const collector = createFreeTikTokCommentsCollector({ token: 'synthetic-unused', privacy: privacy(), transport });
    if (scenario === 'valid') {
      const capture = await collector.collectPerVideo([url()], request);
      assert.equal(capture.runs[0]!.receipt.usageTotalUsd, 0.002);
    } else await assert.rejects(collector.collectPerVideo([url()], request), Error, scenario);
    assert.equal(posts, 1, 'a failed receipt never causes a second dispatch');
  }
});

test('S07F HTTP malformed responses and request failures expose no provider content or retries', async () => {
  const sentinel = 'S07PRIV'; // Short enough that JSON.parse includes it in a syntax error.
  for (const stage of ['start', 'poll', 'settled-run', 'dataset', 'http-error', 'network-error'] as const) {
    let posts = 0;
    const transport = new ApifyTikTokCommentsHttpTransport({ token: 'synthetic-http-auth', sleep: async () => {},
      fetch: async (input, init) => {
        const endpoint = new URL(String(input)), post = init?.method === 'POST';
        if (post) posts++;
        if (stage === 'network-error') throw new Error(sentinel);
        if (stage === 'http-error') return new Response(sentinel, { status: 500 });
        const bad = (post && stage === 'start') || (!post && stage === 'poll') ||
          (!post && stage === 'settled-run') || (endpoint.pathname.startsWith('/v2/datasets/') && stage === 'dataset');
        if (bad) return new Response(sentinel);
        return Response.json({ data: { id: 'syntheticRun', defaultDatasetId: 'syntheticData', buildId: null,
          status: stage === 'poll' ? 'RUNNING' : 'SUCCEEDED', usageTotalUsd: 0.002, options: { maxTotalChargeUsd: 0.05 } } });
      } });
    await assert.rejects(transport.start(TIKTOK_COMMENT_ACTORS.free, { startUrls: [url()], maxItems: 10, includeReplies: false }, 0.05),
      error => error instanceof Error && !String(error.stack).includes(sentinel) && !String(error.stack).includes('synthetic-http-auth'), stage);
    assert.equal(posts, 1, 'malformed metadata and failed HTTP are never retried');
  }
});

test('S07F row 4: legacy v1 capture bytes match origin/main', async () => {
  // Frozen independently in git-archived origin/main; see tests-s07f.md for revision and command.
  assert.equal(sha(await legacyCaptureBytes()), '7ccb634d59b65dd22c33714d5a70b021acafe91139bf1d630995475c88223eb4');
});

test('S07F row 5: strict flag and privacy startup validation table', async t => {
  let networkCalls = 0;
  t.mock.method(globalThis, 'fetch', async () => { networkCalls++; throw new Error('unexpected startup network'); });
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tdn-s07f-config-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const frontendDist = path.join(root, 'frontend'); await fs.mkdir(frontendDist);
  await fs.writeFile(path.join(frontendDist, 'index.html'), '<!doctype html><title>Synthetic</title>');
  const file = path.join(root, 'privacy.json');
  const base = { TDN_WORKSPACE_DB: path.join(root, 'test.sqlite'), TDN_ARTIFACT_ROOT: path.join(root, 'artifacts'),
    TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_TOKEN: 'synthetic-owner-auth-01234567890123456789', TDN_OWNER_API_ACTOR_ID: 'owner:synthetic',
    TDN_APIFY_TOKEN: 'synthetic-provider-auth', TDN_RESEARCH_TIKTOK_COMMENTS_MAX_CHARGE_USD: '5' };
  const defaults = { frontendDist, version: 'synthetic' };
  for (const flag of [undefined, '', '0', 'true', '01', ' 1', '1 ', '2']) {
    const config = operatorAppConfigurationFromEnvironment({ ...base, ...(flag === undefined ? {} : { TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED: flag }),
      TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: file }, defaults);
    assert.equal(Object.hasOwn(config, 'researchTikTokFreeComments'), false, 'off never reads the missing privacy file');
    assert.equal(Object.hasOwn(config.researchProviders!, 'apifyTikTokFreeComments'), false);
  }
  for (const invalid of [{ mode: 0o600, missing: true, length: 32 }, { mode: 0o644, length: 32 }, { mode: 0o600, length: 31 }]) {
    await fs.rm(file, { force: true });
    if (!invalid.missing) { await fs.writeFile(file, JSON.stringify({ keyId, salt: Buffer.alloc(invalid.length, 71).toString('base64') })); await fs.chmod(file, invalid.mode); }
    assert.throws(() => operatorAppConfigurationFromEnvironment({ ...base, TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED: '1',
      TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: file }, defaults), error => error instanceof TypeError &&
        error.message.startsWith('TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE') && !error.message.includes(file));
  }
  await fs.writeFile(file, JSON.stringify({ keyId, salt: salt.toString('base64') })); await fs.chmod(file, 0o600);
  const enabled = { ...base, TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED: '1', TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE: file };
  assert.ok(operatorAppConfigurationFromEnvironment(enabled, defaults).researchTikTokFreeComments);
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...enabled, TDN_APIFY_TOKEN: '' }, defaults), /requires the APIFY token/);
  assert.throws(() => operatorAppConfigurationFromEnvironment({ ...enabled, TDN_OWNER_API_ENABLED: 'false' }, defaults), /OWNER writes/);
  openDatabase({ databasePath: base.TDN_WORKSPACE_DB }).db.close();
  const app = openOperatorApp(operatorAppConfigurationFromEnvironment(enabled, defaults));
  await app.close();
  assert.equal(networkCalls, 0, 'prod-like flag-on startup constructs the collector without dispatching');
});
