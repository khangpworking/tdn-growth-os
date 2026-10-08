import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, TIKTOK_COMMENT_ACTORS, tikTokCommentActorInput, sanitizeTikTokCommentText, type TikTokCommentsTransport } from '../../src/platform/collectors/apify-tiktok-comments.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildTikTokCommentCorpus, citeTikTokCommentCorpus, tikTokLocatedRecords } from '../../src/modules/analysis/research-automation/tiktok-comment-intake.js';
import { CitationRegistry } from '../../src/modules/analysis/citation-registry.js';

const url = 'https://www.tiktok.com/@synthetic_creator/video/1234';
const salt = Buffer.from('synthetic-private-salt-only-for-test-0123456789');
const privacy = () => createTikTokCommentPrivacy({ salt, keyId: '11111111-1111-4111-8111-111111111111', sellerAuthorIds: ['444'] });
const row = (id: string, text = 'thạch dừa ngon') => ({ item_type: 'comment', video_id: '1234', comment_id: id, reply_to_comment_id: '0', text,
  like_count: 0, created_at_utc: '2026-10-01T00:00:00.000Z', user_id: '987654321', username: 'synthetic_reader', nickname: 'PRIVATE_AUTHOR_NAME', profile_pic_url: 'https://example.test/PRIVATE_PROFILE' });
function fake(values: unknown[], status = 'SUCCEEDED'): { transport: TikTokCommentsTransport; calls: string[] } {
  const calls: string[] = [];
  return { calls, transport: {
    start: async (actor, input, cap) => { calls.push('start'); assert.equal(cap, 3); assert.equal(actor, TIKTOK_COMMENT_ACTORS.default);
      assert.equal(input.scrape_replies, false); return { runId: 'synthetic-run', datasetId: 'synthetic-dataset', buildId: null,
        status: status as 'SUCCEEDED', retrievedAt: '2026-10-09T00:00:00.000Z', providerTotalRows: values.length, usageTotalUsd: 0 }; },
    readPage: async (_receipt, offset, limit) => { calls.push(`page:${offset}`); return Buffer.from(JSON.stringify(values.slice(offset, offset + limit))); },
  } };
}
const keywordData: KeywordMeaningFilterData = { contractVersion: 'l9-keyword-data-v1' as const, dataVersion: 'synthetic-terms-v1', category: 'thạch dừa',
  keywords: ['thạch dừa'], exclusions: [{ term: 'thạch dứa', reason: 'Synthetic other product' }], provenance: 'MODEL_DRAFTED' as const };
const selection = { contractVersion: 'tiktok-video-selection-v1' as const, workspaceId: '11111111-1111-4111-8111-111111111111', runId: '22222222-2222-4222-8222-222222222222',
  sourcePackage: { packageId: '33333333-3333-4333-8333-333333333333', manifestArtifactSha256: 'a'.repeat(64), packageContentSha256: 'b'.repeat(64) }, tableSha256: 'c'.repeat(64),
  option: 'A_TOP_20_PERCENT' as const, tieRule: 'EXACT_SOURCE_ORDER' as const, maximumVideos: 30 as const, sampleVideoCount: 1, excluded: [],
  videos: [{ videoId: '1234', url, kind: 'SELLER_VIDEO' as const, sourceLine: 'CSV row 2', revenue: '1' }] };
const selected = { selection, selectionSha256: createHash('sha256').update(canonicalJson(selection)).digest('hex') };

test('documented actor inputs disable replies, explicit fallback only, missing cap refuses', () => {
  assert.deepEqual(tikTokCommentActorInput(TIKTOK_COMMENT_ACTORS.default, [url]), { video_id_or_url: [url], max_comments: 200, scrape_replies: false });
  assert.deepEqual(tikTokCommentActorInput(TIKTOK_COMMENT_ACTORS.fallback, [url]), { postURLs: [url], commentsPerPost: 200, topLevelCommentsPerPost: 200, maxRepliesPerComment: 0 });
  const f = fake([]);
  assert.throws(() => new ApifyTikTokCommentsCollector({ transport: f.transport, privacy: privacy(), approvedMaxTotalChargeUsd: undefined as unknown as number }));
  assert.deepEqual(f.calls, []);
});

test('closed sanitized audit hashes only numeric author identity, strips contacts, preserves dates/zero likes and missing author states', () => {
  const p = privacy(); const values = [row('1', 'thạch dừa mail@example.test +84 912 345 678 @private_handle https://www.tiktok.com/@private_profile'),
    { ...row('2'), user_id: null }, { ...row('3'), user_id: undefined }, { ...row('4'), user_id: 987654321 }];
  const clean = p.sanitizePage(TIKTOK_COMMENT_ACTORS.default, Buffer.from(JSON.stringify(values)), [url], 0);
  const serialized = JSON.stringify(clean);
  for (const secret of ['PRIVATE_AUTHOR_NAME', 'PRIVATE_PROFILE', '987654321', 'mail@example.test', '912 345 678', '@private_handle', '@private_profile', salt.toString()]) assert.ok(!serialized.includes(secret), secret);
  assert.deepEqual(clean.map(v => v.authorIdentity.state), ['HASHED', 'INVALID', 'MISSING', 'INVALID']);
  assert.equal(clean[0]!.likeCount, 0); assert.equal(clean[0]!.createdAt, values[0]!.created_at_utc);
  assert.equal(p.sanitizePage(TIKTOK_COMMENT_ACTORS.default, Buffer.from(JSON.stringify([row('5')])), [url], 0)[0]!.authorIdentity.hash, clean[0]!.authorIdentity.hash);
  assert.notEqual(createTikTokCommentPrivacy({ salt: Buffer.alloc(32, 2), keyId: p.profile.keyId }).sanitizePage(TIKTOK_COMMENT_ACTORS.default, Buffer.from(JSON.stringify([row('5')])), [url], 0)[0]!.authorIdentity.hash, clean[0]!.authorIdentity.hash);
  assert.equal(sanitizeTikTokCommentText('thạch dừa 350g nguyên văn'), 'thạch dừa 350g nguyên văn');
});

test('fake collection -> dedupe/privacy/L9 located and cited projection preserves equal-text identities and reasoned exclusions', async () => {
  const same = row('1');
  const values = [same, same, row('2'), row('3', 'thạch dứa'), row('4', 'thach dua'), row('5', ''), row('6', '@friend'), row('7', '😍😃'),
    { ...row('8'), user_id: '444' }, { ...row('9'), username: 'synthetic_creator' }, { ...row('10'), item_type: 'reply', reply_to_comment_id: '1' },
    row('11'), row('11', 'changed thạch dừa')];
  const f = fake(values), collector = new ApifyTikTokCommentsCollector({ transport: f.transport, privacy: privacy(), approvedMaxTotalChargeUsd: 3 });
  const capture = await collector.collect([url], 'd'.repeat(64));
  const corpus = buildTikTokCommentCorpus(selected, capture, keywordData);
  assert.equal(corpus.accounting.included, 2); assert.equal(corpus.accounting.equalDuplicateRows, 1); assert.equal(corpus.accounting.conflictingCommentGroups, 1);
  assert.equal(corpus.accounting.unclear, 1); assert.deepEqual(corpus.accounting.byReason,
    { EXCLUDED_TERM: 1, UNRESOLVED_UNDIACRITICIZED: 1, EMPTY: 1, TAG_ONLY: 1, EMOJI_ONLY: 1, SELLER_OR_CREATOR: 2, REPLY: 1, UNRESOLVED_CONFLICT: 1 });
  assert.equal(tikTokLocatedRecords(corpus).filter(v => v.disposition === 'INCLUDED').length, 2);
  const registry = new CitationRegistry(); assert.equal(citeTikTokCommentCorpus(corpus, registry).length, 2);
  assert.equal(registry.entries().length, 2); assert.ok(registry.entries().every(c => c.url === url && c.label === 'bình luận công khai dưới video TikTok'));
  const before = [...f.calls]; assert.deepEqual(await collector.collect([url], 'd'.repeat(64)), capture); assert.deepEqual(f.calls, before);
});

test('bound200 top-level quota, failure, cancellation and conflicting retry never silently fall back or call twice', async () => {
  const f = fake(Array.from({ length: 201 }, (_, i) => row(String(i + 1))));
  await assert.rejects(new ApifyTikTokCommentsCollector({ transport: f.transport, privacy: privacy(), approvedMaxTotalChargeUsd: 3 }).collect([url], 'e'.repeat(64)));
  const failed = fake([], 'FAILED'), collector = new ApifyTikTokCommentsCollector({ transport: failed.transport, privacy: privacy(), approvedMaxTotalChargeUsd: 3 });
  await assert.rejects(collector.collect([url], 'f'.repeat(64))); await assert.rejects(collector.collect([url], 'f'.repeat(64))); assert.deepEqual(failed.calls, ['start']);
  const cancel = fake([]), cancelled = new ApifyTikTokCommentsCollector({ transport: cancel.transport, privacy: privacy(), approvedMaxTotalChargeUsd: 3 });
  await assert.rejects(cancelled.collect([url], 'a'.repeat(64), AbortSignal.abort())); assert.deepEqual(cancel.calls, []);
});

test('documented clockworks fields map uid/cid and repliesToId without names, profile or username fallback', () => {
  const clean = privacy().sanitizePage(TIKTOK_COMMENT_ACTORS.fallback, Buffer.from(JSON.stringify([
    { cid: '12', text: 'thạch dừa', uid: '777', uniqueId: 'someone', videoWebUrl: url, createTimeISO: null, diggCount: null, repliesToId: null },
    { cid: '13', text: 'reply', uniqueId: 'someone', videoWebUrl: url, repliesToId: '12' },
  ])), [url], 0);
  assert.equal(clean[0]!.authorIdentity.state, 'HASHED'); assert.equal(clean[0]!.likeCount, null); assert.equal(clean[0]!.createdAt, null);
  assert.equal(clean[1]!.authorIdentity.state, 'MISSING'); assert.equal(clean[1]!.exclusionReason, 'REPLY');
  assert.ok(!JSON.stringify(clean).includes('someone'));
});


test('contradictory locators and unknown metadata never become source evidence or retained receipt fields', async () => {
  assert.throws(() => privacy().sanitizePage(TIKTOK_COMMENT_ACTORS.default, Buffer.from(JSON.stringify([
    { ...row('12'), input_url: 'https://www.tiktok.com/@wrong/video/9999' },
  ])), [url], 0));
  const f = fake([row('1')]);
  const start = f.transport.start;
  f.transport.start = async (...args) => ({ ...await start(...args), authorName: 'PRIVATE_RUN_METADATA' });
  const captured = await new ApifyTikTokCommentsCollector({ transport: f.transport, privacy: privacy(), approvedMaxTotalChargeUsd: 3 }).collect([url], '1'.repeat(64));
  assert.ok(!JSON.stringify(captured).includes('PRIVATE_RUN_METADATA'));
  const empty = privacy().sanitizePage(TIKTOK_COMMENT_ACTORS.default, Buffer.from(JSON.stringify([row('13', '@friend 😍')])), [url], 0);
  assert.equal(empty[0]!.exclusionReason, 'TAG_ONLY');
});
