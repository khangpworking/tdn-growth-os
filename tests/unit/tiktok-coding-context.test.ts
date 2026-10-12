import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTikTokCodingContext, TikTokCodingContextError } from '../../src/modules/analysis/research-automation/tiktok-coding-context.js';
import type { TikTokCommentCorpus } from '../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { KeywordMeaningFilterData } from '../../src/modules/analysis/keyword-meaning-filter.js';

const keywordData = { contractVersion: 'keyword-meaning-filter-v1', dataVersion: 'l9-test', records: [] } as unknown as KeywordMeaningFilterData;

function record(overrides: Record<string, unknown> = {}) {
  return { recordId: 'r1', videoId: '1000', commentId: '2000', videoUrl: 'https://www.tiktok.com/@synthetic/video/1000',
    videoKind: 'REVIEW_VIDEO', sourceType: 'COMMENT_UNDER_REVIEW_VIDEO', voice: 'CUSTOMER', text: 'thạch dừa ngon',
    createdAt: '2026-09-03T00:00:00Z', likeCount: 3,
    authorIdentity: { state: 'HASHED', hash: 'aa'.repeat(32) }, occurrenceCount: 1, disposition: 'INCLUDED',
    dispositionReason: null, l9: {}, versions: [{ row: {}, sourceRefs: [{ pageSha256: 'bb'.repeat(32), pageIndex: 0, rowIndex: 0, textPointer: '/0/text' }] }],
    ...overrides };
}

function corpus(records: unknown[]): TikTokCommentCorpus {
  return { contractVersion: 'tiktok-comment-corpus-v1', registryId: 'S07', platform: 'tiktok',
    selectionSha256: 'cc'.repeat(32), sourcePackage: { packageId: '11111111-1111-4111-8111-111111111111',
      manifestArtifactSha256: 'dd'.repeat(32), packageContentSha256: 'ee'.repeat(32) },
    privacy: { profileVersion: 'tiktok-comment-privacy-v1', platform: 'tiktok', keyId: 'k', keyCommitment: 'c',
      voicePolicyCommitment: 'v', algorithm: 'HMAC-SHA256' }, auditForm: 'SANITIZED_ALLOWLIST', codingState: 'NOT_CODED', sampleLabel: 'bình luận thu được',
    keywordData, filterBatches: [], records: records as never[],
    accounting: { returnedRows: 1, uniqueComments: 1, equalDuplicateRows: 0, conflictingCommentGroups: 0,
      included: 1, excluded: 0, unclear: 0, byReason: {} },
    limitations: ['synthetic'] };
}

test('eligible INCLUDED CUSTOMER rows pass with lineage; author identity never crosses', () => {
  const context = buildTikTokCodingContext(corpus([record()]), 'f'.repeat(64), '0'.repeat(64), keywordData);
  assert.equal(context.rows.length, 1);
  assert.equal(context.rows[0]!.text, 'thạch dừa ngon');
  assert.equal(context.rows[0]!.pageSha256, 'bb'.repeat(32));
  assert.equal(context.rows[0]!.locator, 'bình luận 2000');
  assert.ok(!('authorIdentity' in context.rows[0]!));
  assert.ok(!JSON.stringify(context).includes('aa'.repeat(32)));
});

test('seller, replies, excluded, unclear, and null-text rows stay outside primary coding', () => {
  const context = buildTikTokCodingContext(corpus([
    record(),
    record({ voice: 'SELLER_OR_CREATOR' }),
    record({ disposition: 'EXCLUDED', dispositionReason: 'REPLY' }),
    record({ disposition: 'UNCLEAR' }),
    record({ text: null }),
  ]), 'f'.repeat(64), '0'.repeat(64), keywordData);
  assert.equal(context.rows.length, 1);
  assert.equal(context.rows[0]!.recordIndex, 0);
});

test('unknown or ineligible record selection refuses; empty eligibility refuses', () => {
  const c = corpus([record()]);
  assert.throws(() => buildTikTokCodingContext(c, 'f'.repeat(64), '0'.repeat(64), keywordData, [7]), TikTokCodingContextError);
  assert.throws(() => buildTikTokCodingContext(c, 'f'.repeat(64), '0'.repeat(64), keywordData, [1]), TikTokCodingContextError);
  assert.throws(() => buildTikTokCodingContext(corpus([record({ disposition: 'EXCLUDED' })]), 'f'.repeat(64), '0'.repeat(64), keywordData),
    TikTokCodingContextError);
  assert.throws(() => buildTikTokCodingContext(c, 'not-a-digest', '0'.repeat(64), keywordData), TikTokCodingContextError);
});
