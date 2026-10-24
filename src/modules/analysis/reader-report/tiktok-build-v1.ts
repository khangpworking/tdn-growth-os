import { createHash } from 'node:crypto';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { CitationRegistry, type CitationInput } from '../citation-registry.js';
import { renderCitationMarkOrMissing } from '../citation-register-html.js';
import { ReaderReportInputError } from './build.js';
import { verifyInsightReaderInput, type InsightReaderInput } from './insight-input-v1.js';
import type { InsightFinding, InsightSectionId } from './insight-projection.js';
import type { InsightReaderPage, InsightReaderSection } from './insight-template.js';
import { Bundle } from './bundle.js';
import { esc } from './format.js';
import type { TikTokDraftCoding, TikTokCodedReport } from '../../../../contracts/analysis/tiktok-coding-proposal-v1.generated.js';
import { rankReviewTopicMentions, type ReviewTopicRanking } from '../research-automation/review-topic-ranking.js';
import type { TikTokCommentCorpus } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import { SOURCE_REGISTRY } from '../research-automation/source-status.js';
import { hasHiddenName } from '../report-language/index.js';
import { retainedQuoteHtml } from '../research-automation/descriptive-report.js';

const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

export type TikTokReaderSourceIdentity = Pick<InsightReaderInput, 'workspaceId' | 'runId' | 'draftPairId' | 'semanticSha256' |
  'sourceReportSha256' | 'frozenStartSha256' | 'frozenScopeSha256' | 'sourceRendererVersion'>;

export interface TikTokReaderScope {
  readonly keyword: string;
  readonly definition: string;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string };
}

/** Owning service only: draft, report, corpus, and scope already passed exact retained replay.
 * Copies verified fields and renders retained views; never executes a method, model, or collector.
 * All model-supplied text is escaped; quotes are exact retained spans with their record context. */
export function prepareTikTokReaderBuild(identity: TikTokReaderSourceIdentity, draft: TikTokDraftCoding,
  report: TikTokCodedReport, corpus: TikTokCommentCorpus, acquiredAt: string | null,
  scope: TikTokReaderScope): { input: Extract<InsightReaderInput, { contractVersion: 'insight-reader-input-v7' }>; page: InsightReaderPage } {
  if (digest(draft) !== identity.draftPairId || digest(report) !== identity.semanticSha256 ||
      digest(report) !== identity.sourceReportSha256 || report.proposalId !== draft.proposalId ||
      report.draftSha256 !== identity.draftPairId ||
      draft.binding.workspaceId !== identity.workspaceId || draft.binding.runId !== identity.runId ||
      corpus.contractVersion !== 'tiktok-comment-corpus-v1' || corpus.registryId !== 'S07' ||
      identity.sourceRendererVersion !== 'tiktok-reader-kit-v1') {
    throw new ReaderReportInputError('TikTok reader methods differ from authenticated frozen binding.');
  }
  if (draft.status !== 'PROPOSED_AWAITING_REVIEW' || report.status !== 'PROPOSED_AWAITING_REVIEW') {
    throw new ReaderReportInputError('TikTok reader requires a proposed draft coding and cited report.');
  }
  const input = { ...identity, contractVersion: 'insight-reader-input-v7', reportKind: 'INSIGHT',
    builderVersion: 'reader-report-insight-tiktok-v1', scope: { ...scope, requestedPeriod: { ...scope.requestedPeriod } },
    retainedMethods: [{ kind: 'TIKTOK_CODING', sha256: digest(draft) }] } as InsightReaderInput;
  verifyInsightReaderInput(input, input);
  if (input.contractVersion !== 'insight-reader-input-v7') {
    throw new ReaderReportInputError('TikTok reader methods differ from authenticated frozen binding.');
  }
  const byIndex = new Map(corpus.records.map((record, recordIndex) => [recordIndex, record] as const));
  const citeRow = (recordIndex: number): CitationInput => {
    const record = byIndex.get(recordIndex);
    const ref = record?.versions[0]?.sourceRefs[0];
    if (!record || !ref) throw new ReaderReportInputError('TikTok finding cites a record without retained identity.');
    return { sourceKind: 'REVIEW', identity: ref.pageSha256, locator: `bình luận ${record.commentId}`,
      label: 'bình luận công khai dưới video TikTok', retrievedAt: record.createdAt, url: hasHiddenName(record.videoUrl, 'CITATION') ? null : record.videoUrl,
      quote: null, quoteVerification: 'NOT_APPLICABLE' };
  };
  const draftByCode = new Map<string, { label: string; occurrences: { recordIndex: number; quote: string; context: string }[] }>();
  for (const entry of draft.codes) {
    const record = byIndex.get(entry.recordIndex);
    if (!record || record.text === null || record.text.slice(entry.quote.start, entry.quote.end) !== entry.quote.text) {
      throw new ReaderReportInputError('TikTok draft quote differs from its retained record.');
    }
    const group = draftByCode.get(entry.code) ?? { label: entry.label, occurrences: [] };
    group.occurrences.push({ recordIndex: entry.recordIndex, quote: entry.quote.text, context: record.text });
    draftByCode.set(entry.code, group);
  }
  const registry = new CitationRegistry();
  const bundle = new Bundle(), findings: InsightFinding[] = [];
  for (const finding of report.findings) {
    const renditions = draftByCode.get(finding.code);
    if (!renditions || renditions.occurrences.length === 0) {
      throw new ReaderReportInputError('TikTok cited finding lacks retained coded occurrences.');
    }
    const distinct = new Set(renditions.occurrences.map(occurrence => occurrence.recordIndex)).size;
    const key = `tiktok.codes.${finding.code}.records`;
    bundle.set(key, distinct, 'int', `tiktok-coded-report-v1/${finding.code}/distinct-records`);
    findings.push({ sectionId: finding.sectionId, status: finding.status, scope: finding.scope,
      citations: renditions.occurrences.map(occurrence => citeRow(occurrence.recordIndex)),
      template: esc(finding.template) });
  }
  bundle.set('tiktok.records.coded', report.counts.recordsCoded, 'int', 'tiktok-coded-report-v1/counts/recordsCoded');
  bundle.set('tiktok.codes.proposed', report.counts.codesProposed, 'int', 'tiktok-coded-report-v1/counts/codesProposed');
  const recordsCoded = String(report.counts.recordsCoded), codesProposed = String(report.counts.codesProposed);
  const mark = (recordIndex: number) => renderCitationMarkOrMissing(registry.cite(citeRow(recordIndex)));
  const quoteBlock = (occurrence: { recordIndex: number; quote: string; context: string }) =>
    (hasHiddenName(occurrence.quote, 'READER') ? retainedQuoteHtml(occurrence.quote, 'blockquote') : `<blockquote>${esc(occurrence.quote)}</blockquote>`) +
    `<details><summary>Ngữ cảnh bản ghi</summary>${hasHiddenName(occurrence.context, 'READER') ? retainedQuoteHtml(occurrence.context, 'blockquote') : `<p>${esc(occurrence.context)}</p>`}</details>`;
  const rankingQuoteBlock = (occurrence: { recordIndex: number; quote: string; context: string | null }) =>
    (hasHiddenName(occurrence.quote, 'READER') ? retainedQuoteHtml(occurrence.quote, 'blockquote') : `<blockquote>${esc(occurrence.quote)}</blockquote>`) +
    (occurrence.context === null ? '' : `<details><summary>Ngữ cảnh bản ghi</summary>${hasHiddenName(occurrence.context, 'READER') ? retainedQuoteHtml(occurrence.context, 'blockquote') : `<p>${esc(occurrence.context)}</p>`}</details>`);
  const topicRanking: ReviewTopicRanking | null = draft.promptVersion.endsWith('-v2')
    ? rankReviewTopicMentions(draft.codes.map(entry => ({ platform: 'TIKTOK' as const, recordIndex: entry.recordIndex,
        topic: ('topic' in entry ? entry.topic : entry.label), polarity: entry.polarity ?? 'KHONG_RO', quote: entry.quote.text,
        context: byIndex.get(entry.recordIndex)?.text ?? null })), { platform: 'TIKTOK' })
    : null;
  const rankingHtml = topicRanking === null ? null : renderTopicRanking(topicRanking, mark, rankingQuoteBlock);
  const sections: InsightReaderSection[] = [
    { id: 'I02', body: `<p>Khách hàng bình luận dưới video TikTok đã thu thập: ${recordsCoded} bản ghi INCLUDED CUSTOMER trong tập S07 đã lưu (số lượng đề xuất, chờ chủ duyệt), giai đoạn nguồn không xác minh. Đơn vị là bản ghi thu được, không phải số người.</p>`,
      explanation: 'Bối cảnh khách hàng từ tập S07 đã lưu; chưa xác thực độc lập.' },
    { id: 'I10', body: rankingHtml ?? (report.findings.map(finding => {
      const renditions = draftByCode.get(finding.code);
      const occurrences = (renditions?.occurrences ?? []).slice(0, 6);
      return `<p><b>${esc(finding.code)}</b> (${esc(finding.label)}): ` +
        `${occurrences.map(occurrence => `${mark(occurrence.recordIndex)}`).join(' ')}</p>` +
        occurrences.map(occurrence => quoteBlock(occurrence)).join('');
    }).join('') || `<p>Không có mã đề xuất nào trong bản nháp này.</p>`),
    explanation: 'Chủ đề do mô hình đề xuất từ lời nguồn đã lưu, chờ chủ duyệt; chưa phải kết luận.' },
    { id: 'I17', body: `<p>Phụ lục: ${codesProposed} mã đề xuất trên ${recordsCoded} bản ghi (số lượng đề xuất, chờ chủ duyệt). ` +
      `${sourceAppendixRow(corpus)} ` +
      `Bản ghi ngoài số lượng chính: ${reasonedExclusions(corpus)} ${report.limitations.map(line => esc(line)).join(' ')}</p>`,
    explanation: 'Phạm vi, giới hạn và số lượng đề xuất; chưa đủ điều kiện phát hành.' },
  ];
  return { input, page: { keyword: scope.keyword, period: { ...scope.requestedPeriod }, definition: scope.definition,
    sections, findings: { bundle, findings }, registry } };
}

/** Deterministic reasoned exclusion summary from retained accounting; unknown stays unknown. */
function reasonedExclusions(corpus: TikTokCommentCorpus): string {
  const reasons = Object.keys(corpus.accounting.byReason).sort()
    .map(reason => `${reason}: ${corpus.accounting.byReason[reason]}`).join('; ');
  const parts = [`EXCLUDED ${corpus.accounting.excluded}`, `UNCLEAR ${corpus.accounting.unclear}`];
  if (reasons) parts.push(reasons);
  return parts.join('; ') + '.';
}

function renderTopicRanking(ranking: ReviewTopicRanking, mark: (recordIndex: number) => string,
  quoteBlock: (occurrence: { recordIndex: number; quote: string; context: string | null }) => string): string {
  const quoteCells = (quotes: ReviewTopicRanking['khac']['quotes']) => quotes.map(q => `${mark(q.recordIndex)}${quoteBlock(q)}`).join('');
  const rows = ranking.rows.map(row => `<tr><td>${row.rank}</td><td>${esc(row.topic)}</td><td>${row.polarity}</td><td>${row.mentionCount}</td><td><details><summary>Xem ${row.quotes.length} trích dẫn</summary>${quoteCells(row.quotes)}</details></td></tr>`).join('');
  const khac = `<tr><td></td><td>Khác</td><td></td><td>${ranking.khac.mentionCount}</td><td><details><summary>Xem ${ranking.khac.quotes.length} trích dẫn</summary>${quoteCells(ranking.khac.quotes)}</details></td></tr>`;
  return `<table><thead><tr><th>Hạng</th><th>Chủ đề</th><th>Khen/chê</th><th>Số lượt nhắc</th><th>Trích dẫn</th></tr></thead><tbody>${rows}${khac}</tbody></table>` +
    `<p>Không khen không chê: ${ranking.khongRoCount} lượt nhắc.</p>`;
}

/** U-27 source appendix row: registry identity (S-ID, tier, report name) plus the L10
 * source-type split counted from retained records. Kinds absent from the retained corpus
 * stay absent (missing is never written as zero). Registry values come from the board's
 * SOURCE_REGISTRY read-only; this file never changes board behavior. */
function sourceAppendixRow(corpus: TikTokCommentCorpus): string {
  const card = SOURCE_REGISTRY.APIFY_TIKTOK_COMMENTS;
  const kinds: { readonly sourceType: 'COMMENT_UNDER_REVIEW_VIDEO' | 'COMMENT_UNDER_SELLER_VIDEO'; readonly label: string }[] = [
    { sourceType: 'COMMENT_UNDER_REVIEW_VIDEO', label: 'bình luận dưới video review' },
    { sourceType: 'COMMENT_UNDER_SELLER_VIDEO', label: 'bình luận dưới video bán hàng' },
  ];
  const present = kinds.map(kind => ({ ...kind,
    count: corpus.records.filter(record => record.sourceType === kind.sourceType).length,
  })).filter(kind => kind.count > 0);
  const split = present.map(kind => `${kind.label}: ${kind.count} bản ghi`).join('; ');
  const keywordVersion = corpus.keywordData.dataVersion;
  const l9 = keywordVersion !== ''
    ? ` Lọc nghĩa L9 theo bộ từ khóa đã lưu ${keywordVersion}.` : '';
  return `Nguồn ${card.registryIds.join(', ')} · hạng ${card.tier} · ${card.reportName}.` +
    (split === '' ? '' : ` Loại nguồn: ${split}.`) + l9;
}
