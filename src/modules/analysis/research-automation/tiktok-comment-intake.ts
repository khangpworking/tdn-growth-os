import { createHash } from 'node:crypto';
import keywordFilterSchema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import { canonicalJson } from '../../foundation/canonical-json.js';
import { filterKeywordMeanings, type KeywordMeaningFilterData } from '../keyword-meaning-filter.js';
import { CitationRegistry } from '../citation-registry.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { TikTokCommentCapture, SanitizedTikTokComment } from '../../../platform/collectors/apify-tiktok-comments.js';
import type { selectTikTokVideos } from './tiktok-video-selection.js';

const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
function fail(): never { throw new Error('Không thể xác minh nguồn bình luận đã lưu.'); }
export type SelectedTikTokVideos = Awaited<ReturnType<typeof selectTikTokVideos>>;

/** Provisional deterministic projection while canonical ownership is queued.
 * Caller is the owning intake, not an operator-supplied string/name source.
 * No persistence or coding/model invocation occurs at this boundary. */
export function buildTikTokCommentCorpus(selected: SelectedTikTokVideos, capture: TikTokCommentCapture, keywords: KeywordMeaningFilterData) {
  if (sha(canonicalJson(selected.selection)) !== selected.selectionSha256 || capture.receipt.status !== 'SUCCEEDED' || capture.auditForm !== 'SANITIZED_ALLOWLIST') fail();
  const videos = new Map(selected.selection.videos.map(row => [row.videoId, row]));
  const groups = new Map<string, { row: SanitizedTikTokComment; versions: { row: SanitizedTikTokComment; sourceRefs: { pageSha256: string; pageIndex: number; rowIndex: number; textPointer: string }[] }[]; occurrenceCount: number }>();
  let offset = 0;
  for (const [pageIndex, page] of capture.pages.entries()) {
    if (sha(page.bytes) !== page.sha256 || !page.bytes.equals(Buffer.from(canonicalJson(page.rows))) || page.offset !== offset) fail();
    offset += page.rows.length;
    for (const [rowIndex, row] of page.rows.entries()) {
      if (row.pageIndex !== pageIndex || row.rowIndex !== rowIndex || row.textForm !== 'SANITIZED' ||
        row.videoUrl !== videos.get(row.videoId)?.url) fail();
      const key = `${row.videoId}:${row.commentId}`;
      const group = groups.get(key) ?? { row, versions: [], occurrenceCount: 0 };
      group.occurrenceCount++;
      const sourceRef = { pageSha256: page.sha256, pageIndex, rowIndex, textPointer: `/${rowIndex}/text` };
      const version = group.versions.find(entry => entry.row.evidenceCommitment === row.evidenceCommitment);
      if (version) {
        // Same keyed original-content witness must not hide changed sanitized
        // supported data. Coordinates alone do not make content a conflict.
        const supported = (value: SanitizedTikTokComment) => { const { pageIndex: _page, rowIndex: _row, ...rest } = value; return rest; };
        if (canonicalJson(supported(version.row)) !== canonicalJson(supported(row))) fail();
        version.sourceRefs.push(sourceRef);
      } else group.versions.push({ row, sourceRefs: [sourceRef] });
      groups.set(key, group);
    }
  }
  const frozenGroups = [...groups.entries()];
  // Reuse the existing canonical per-invocation bound. Batching preserves
  // every collected identity and the same frozen terms; it is not sampling.
  const candidates = frozenGroups.map(([recordId, group]) => ({ recordId, text: group.row.text ?? '', contextText: null }));
  const batchLimit = keywordFilterSchema.$defs.records.maxItems;
  const filterBatches: ReturnType<typeof filterKeywordMeanings>[] = [];
  for (let offset = 0; offset < candidates.length || offset === 0; offset += batchLimit)
    filterBatches.push(filterKeywordMeanings(keywords, candidates.slice(offset, offset + batchLimit)));
  const decisions = new Map(filterBatches.flatMap(batch => batch.results).map(row => [row.recordId, row]));
  const records = frozenGroups.map(([recordId, group]) => {
    const video = videos.get(group.row.videoId)!;
    const l9 = decisions.get(recordId)!;
    const reason = group.versions.length > 1 ? 'UNRESOLVED_CONFLICT' : group.row.exclusionReason ??
      (group.row.voice === 'SELLER_OR_CREATOR' ? 'SELLER_OR_CREATOR' : l9.decision === 'INCLUDED' ? null : l9.reason);
    const disposition = reason === null ? 'INCLUDED' as const : l9.decision === 'UNCLEAR' && !group.row.exclusionReason && group.row.voice === 'CUSTOMER' && group.versions.length === 1
      ? 'UNCLEAR' as const : 'EXCLUDED' as const;
    return { recordId, videoId: group.row.videoId, commentId: group.row.commentId, videoUrl: video.url, videoKind: video.kind,
      sourceType: video.kind === 'REVIEW_VIDEO' ? 'COMMENT_UNDER_REVIEW_VIDEO' as const : 'COMMENT_UNDER_SELLER_VIDEO' as const,
      voice: group.row.voice, text: group.row.text, createdAt: group.row.createdAt, likeCount: group.row.likeCount,
      authorIdentity: group.row.authorIdentity, occurrenceCount: group.occurrenceCount,
      disposition, dispositionReason: reason, l9, versions: group.versions };
  });
  const byReason: Record<string, number> = {};
  for (const row of records) if (row.dispositionReason) byReason[row.dispositionReason] = (byReason[row.dispositionReason] ?? 0) + 1;
  return { contractVersion: 'tiktok-comment-corpus-v1' as const, registryId: 'S07' as const, platform: 'tiktok' as const,
    selectionSha256: selected.selectionSha256, sourcePackage: selected.selection.sourcePackage, privacy: capture.privacy,
    auditForm: capture.auditForm, codingState: 'NOT_CODED' as const, sampleLabel: 'bình luận thu được' as const,
    keywordData: keywords, filterBatches, records,
    accounting: { returnedRows: offset, uniqueComments: records.length,
      equalDuplicateRows: records.reduce((total, group) => total + group.occurrenceCount - group.versions.length, 0),
      conflictingCommentGroups: records.filter(group => group.versions.length > 1).length,
      included: records.filter(row => row.disposition === 'INCLUDED').length,
      excluded: records.filter(row => row.disposition === 'EXCLUDED').length,
      unclear: records.filter(row => row.disposition === 'UNCLEAR').length, byReason },
    limitations: ['Sanitized allowlisted audit pages; original raw page reconstruction is unavailable.',
      'Collected comments are a bounded sample, not all platform comments or verified buyers.',
      'Author identity is key-scoped within TikTok only; missing/invalid author IDs do not identify people.',
      'No coding, persona, cross-platform total or release eligibility is established.'] };
}
export type TikTokCommentCorpus = ReturnType<typeof buildTikTokCommentCorpus>;

/** Existing generic located-record shape; no new codebook or source admission.
 * Real source-bound coding context integration remains a separately leased phase. */
export function tikTokLocatedRecords(corpus: TikTokCommentCorpus): LocatedInsightMethods['input']['records'] {
  return corpus.records.map(row => ({ sourceSha256: row.versions[0]!.sourceRefs[0]!.pageSha256,
    locator: row.versions[0]!.sourceRefs[0]!.textPointer, text: row.text,
    sourceAttribution: row.sourceType === 'COMMENT_UNDER_REVIEW_VIDEO' ? 'bình luận dưới video review' : 'bình luận dưới video bán hàng',
    timeText: row.createdAt, disposition: row.disposition === 'INCLUDED' ? 'INCLUDED' : 'EXCLUDED', dispositionReason: row.dispositionReason }));
}

/** Read projection uses only retained sanitized source evidence. Hashes and
 * author identity never enter the owner-facing citation entries or text. */
export function citeTikTokCommentCorpus(corpus: TikTokCommentCorpus, registry: CitationRegistry) {
  return corpus.records.filter(row => row.disposition === 'INCLUDED').map(row => ({
    text: row.text, sourceType: row.sourceType, voice: row.voice, createdAt: row.createdAt, likeCount: row.likeCount,
    citation: registry.cite({ sourceKind: 'REVIEW', identity: row.versions[0]!.sourceRefs[0]!.pageSha256,
      locator: `bình luận ${row.commentId}`, label: 'bình luận công khai dưới video TikTok',
      retrievedAt: row.createdAt, url: row.videoUrl, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { registryId: 'S07', sourceType: row.sourceType, auditForm: corpus.auditForm } }),
  }));
}
