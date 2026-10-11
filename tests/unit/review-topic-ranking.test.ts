import assert from 'node:assert/strict';
import test from 'node:test';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { createRequire } from 'node:module';
import shopeeModelSchema from '../../contracts/analysis/shopee-review-coding-model-v1.schema.json' with { type: 'json' };
import tiktokModelSchema from '../../contracts/analysis/tiktok-coding-model-v1.schema.json' with { type: 'json' };
import { rankReviewTopicMentions, rankReviewTopicsByPlatform, type ReviewTopicMention } from '../../src/modules/analysis/research-automation/review-topic-ranking.js';

const m = (recordIndex: number, topic: string | null, polarity: ReviewTopicMention['polarity'], platform: ReviewTopicMention['platform'] = 'SHOPEE'): ReviewTopicMention => ({ recordIndex, topic, polarity, platform, quote: `q${recordIndex}`, context: `context ${recordIndex}` });

test('strict competition ties and deterministic label ordering', () => {
  const rows: ReviewTopicMention[] = [];
  for (let i = 0; i < 6; i++) rows.push(m(i, 'A', 'KHEN'));
  for (let i = 0; i < 5; i++) rows.push(m(10 + i, 'B', 'CHE'));
  for (let i = 0; i < 5; i++) rows.push(m(20 + i, 'C', 'KHEN'));
  for (let i = 0; i < 3; i++) rows.push(m(30 + i, 'D', 'KHEN'));
  const result = rankReviewTopicMentions(rows);
  assert.deepEqual(result.rows.map(row => [row.rank, row.topic, row.polarity, row.mentionCount]), [[1, 'A', 'KHEN', 6], [2, 'B', 'CHE', 5], [2, 'C', 'KHEN', 5], [4, 'D', 'KHEN', 3]]);
});

test('exactly three stays ranked and two folds into Khác', () => {
  const result = rankReviewTopicMentions([m(1, 'A', 'KHEN'), m(2, 'A', 'KHEN'), m(3, 'A', 'KHEN'), m(4, 'B', 'KHEN'), m(5, 'B', 'KHEN')]);
  assert.equal(result.rows.length, 1);
  assert.equal(result.khac.mentionCount, 2);
});

test('khac share threshold and completed top up', () => {
  const mentions = [m(1, 'A', 'KHEN'), m(2, 'A', 'KHEN'), m(3, 'A', 'KHEN'), m(4, 'X', 'KHEN')];
  assert.equal(rankReviewTopicMentions(mentions).khacShare, 0.25);
  assert.equal(rankReviewTopicMentions(mentions).needsTopUp, true);
  assert.equal(rankReviewTopicMentions(mentions, { topUpRoundsDone: 1 }).needsTopUp, false);
  const exact = [m(1, 'A', 'KHEN'), m(2, 'A', 'KHEN'), m(3, 'A', 'KHEN'), m(4, 'A', 'KHEN'), m(5, 'B', 'KHEN')];
  assert.equal(rankReviewTopicMentions(exact).khacShare, 0.2);
  assert.equal(rankReviewTopicMentions(exact).needsTopUp, false);
});

test('one record may have several topics but repeats count once', () => {
  const result = rankReviewTopicMentions([m(1, 'A', 'KHEN'), m(1, 'A', 'KHEN'), m(1, 'B', 'CHE'), m(2, 'A', 'KHEN'), m(3, 'A', 'KHEN')]);
  assert.equal(result.rows.find(row => row.topic === 'A')?.mentionCount, 3);
  assert.equal(result.khac.mentionCount, 1);
});

test('empty and only KHONG_RO corpora', () => {
  assert.deepEqual(rankReviewTopicMentions([]), { platform: 'SHOPEE', rows: [], khac: { mentionCount: 0, quotes: [] }, khongRoCount: 0, khacShare: 0, needsTopUp: false });
  const result = rankReviewTopicMentions([m(1, 'A', 'KHONG_RO'), m(2, null, 'KHONG_RO')]);
  assert.equal(result.khongRoCount, 2);
  assert.equal(result.khacShare, 0);
});

test('platforms are never pooled and platform omission is rejected', () => {
  const both = rankReviewTopicsByPlatform([m(1, 'A', 'KHEN', 'SHOPEE'), m(2, 'A', 'KHEN', 'SHOPEE'), m(3, 'A', 'KHEN', 'SHOPEE'), m(4, 'A', 'KHEN', 'TIKTOK'), m(5, 'A', 'KHEN', 'TIKTOK'), m(6, 'A', 'KHEN', 'TIKTOK')]);
  assert.equal(both.SHOPEE.rows[0]?.mentionCount, 3);
  assert.equal(both.TIKTOK.rows[0]?.mentionCount, 3);
  assert.throws(() => rankReviewTopicsByPlatform([m(7, 'A', 'KHEN'), { ...m(8, 'A', 'KHEN'), platform: undefined } as unknown as ReviewTopicMention]), TypeError);
});

test('ordering and quotes are independent of input order and locale', () => {
  const mentions = [...[1, 2, 3].map(index => m(index, 'é', 'CHE')), ...[4, 5, 6].map(index => m(index, 'e\u0301', 'KHEN')), ...[7, 8, 9].map(index => m(index, 'a', 'CHE'))];
  const forward = rankReviewTopicMentions(mentions);
  const reverse = rankReviewTopicMentions([...mentions].reverse());
  assert.deepEqual(reverse, forward);
  assert.deepEqual(forward.rows.map(row => [row.topic, row.polarity]), [['a', 'CHE'], ['e\u0301', 'KHEN'], ['é', 'CHE']]);
});

test('model candidate schemas keep v1 valid and require v2 polarity/topic', () => {
  const ajv = new Ajv2020({ strict: true });
  const addFormats = createRequire(import.meta.url)('ajv-formats') as typeof import('ajv-formats').default;
  addFormats(ajv);
  ajv.addSchema(shopeeModelSchema);
  ajv.addSchema(tiktokModelSchema);
  const validateShopee = ajv.compile({ $ref: `${shopeeModelSchema.$id}#/$defs/candidates` });
  const validateTikTok = ajv.compile({ $ref: `${tiktokModelSchema.$id}#/$defs/candidates` });
  const v1 = { contractVersion: 'shopee-coding-candidates-v1', codes: [{ code: 'A', label: 'a', recordIndex: 0, quote: { text: 'a', start: 0, end: 1 } }] };
  assert.equal(validateShopee(v1), true);
  assert.equal(validateTikTok({ ...v1, contractVersion: 'tiktok-coding-candidates-v1' }), true);
  const missing = { contractVersion: 'shopee-coding-candidates-v2', codes: [{ code: 'A', label: 'a', topic: 'a', recordIndex: 0, quote: { text: 'a', start: 0, end: 1 } }] };
  assert.equal(validateShopee(missing), false);
  assert.equal(validateTikTok({ ...missing, contractVersion: 'tiktok-coding-candidates-v2' }), false);
});
