import type { TikTokCommentCorpus } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { KeywordMeaningFilterData } from '../keyword-meaning-filter.js';

/**
 * Eligible-only replay of a retained S07 corpus for draft coding. Only INCLUDED CUSTOMER
 * rows with non-null text reach the model; seller/creator/reply/tag/emoji/conflict/excluded/unclear
 * rows stay out with their reasons preserved in the corpus. Author identity and key material never
 * cross into the coding context: only the sanitized locator, page identity, video URL and text travel.
 */
export interface TikTokCodingEligibleRow {
  readonly recordIndex: number;
  readonly text: string;
  readonly videoKind: 'SELLER_VIDEO' | 'REVIEW_VIDEO';
  readonly sourceType: 'COMMENT_UNDER_REVIEW_VIDEO' | 'COMMENT_UNDER_SELLER_VIDEO';
  readonly createdAt: string | null;
  readonly likeCount: number | null;
  readonly locator: string;
  readonly pageSha256: string;
  readonly videoUrl: string;
}

export interface TikTokCodingContext {
  readonly corpusSha256: string;
  readonly keywordDigest: string;
  readonly keywordData: KeywordMeaningFilterData;
  readonly rows: readonly TikTokCodingEligibleRow[];
  readonly excluded: number;
  readonly unclear: number;
}

export class TikTokCodingContextError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TikTokCodingContextError';
  }
}

function fail(message: string): never {
  throw new TikTokCodingContextError(message);
}

/** Replay the retained corpus into an eligible-only coding context. Refuses before any model call. */
export function buildTikTokCodingContext(corpus: TikTokCommentCorpus, corpusSha256: string,
  keywordDigest: string, keywordData: KeywordMeaningFilterData, recordIndexes?: readonly number[]): TikTokCodingContext {
  if (!/^[a-f0-9]{64}$/.test(corpusSha256) || !/^[a-f0-9]{64}$/.test(keywordDigest)) fail('corrupt digest');
  if (corpus.contractVersion !== 'tiktok-comment-corpus-v1' || corpus.registryId !== 'S07') fail('not an S07 corpus');
  const wanted = recordIndexes === undefined ? undefined : new Set(recordIndexes);
  const rows: TikTokCodingEligibleRow[] = [];
  corpus.records.forEach((record, recordIndex) => {
    if (wanted !== undefined && !wanted.has(recordIndex)) return;
    if (record.disposition !== 'INCLUDED' || record.voice !== 'CUSTOMER' || record.text === null) return;
    const ref = record.versions[0]?.sourceRefs[0];
    if (!ref || !/^[a-f0-9]{64}$/.test(ref.pageSha256)) fail('record without retained source identity');
    if (typeof record.videoUrl !== 'string' || !record.videoUrl.startsWith('https://www.tiktok.com/')) fail('record without retained video locator');
    rows.push({ recordIndex, text: record.text, videoKind: record.videoKind, sourceType: record.sourceType,
      createdAt: record.createdAt, likeCount: record.likeCount,
      locator: `bình luận ${record.commentId}`, pageSha256: ref.pageSha256, videoUrl: record.videoUrl });
  });
  if (wanted !== undefined) {
    for (const index of wanted) {
      if (!Number.isInteger(index) || index < 0 || index >= corpus.records.length) fail('unknown record index');
      if (!rows.some(row => row.recordIndex === index)) fail('requested record is not eligible coding evidence');
    }
  }
  if (rows.length === 0) fail('no eligible INCLUDED CUSTOMER records to code');
  return { corpusSha256, keywordDigest, keywordData,
    rows, excluded: corpus.accounting.excluded, unclear: corpus.accounting.unclear };
}
