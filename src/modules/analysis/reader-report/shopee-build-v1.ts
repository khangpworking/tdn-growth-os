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
import type { ShopeeDraftCoding, ShopeeCitedSynthesis } from '../../../../contracts/analysis/shopee-review-coding-v1.generated.js';
import { rankReviewTopicMentions, type ReviewTopicRanking } from '../research-automation/review-topic-ranking.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import { SOURCE_REGISTRY } from '../research-automation/source-status.js';
import { hasHiddenName } from '../report-language/index.js';
import { retainedQuoteHtml } from '../research-automation/descriptive-report.js';

const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

export type ShopeeReaderSourceIdentity = Pick<InsightReaderInput, 'workspaceId' | 'runId' | 'draftPairId' | 'semanticSha256' |
  'sourceReportSha256' | 'frozenStartSha256' | 'frozenScopeSha256' | 'sourceRendererVersion'>;

export interface ShopeeReaderScope {
  readonly keyword: string;
  readonly definition: string;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string };
}

/** Owning service only: draft, synthesis, view, and scope already passed exact retained replay.
 * Copies verified fields and renders retained views; never executes a method, model, or collector.
 * All model-supplied text is escaped; quotes are exact retained spans with their record context. */
export function prepareShopeeReaderBuild(identity: ShopeeReaderSourceIdentity, draft: ShopeeDraftCoding,
  report: ShopeeCitedSynthesis, view: PrivateReviewReportView, acquiredAt: string | null,
  scope: ShopeeReaderScope): { input: Extract<InsightReaderInput, { contractVersion: 'insight-reader-input-v8' }>; page: InsightReaderPage } {
  if (digest(draft) !== identity.draftPairId || digest(report) !== identity.semanticSha256 ||
      digest(report) !== identity.sourceReportSha256 || report.proposalId !== draft.proposalId ||
      report.draftSha256 !== identity.draftPairId ||
      draft.binding.workspaceId !== identity.workspaceId || draft.binding.runId !== identity.runId ||
      view.contractVersion !== 'private-review-report-view-v1' ||
      identity.sourceRendererVersion !== 'shopee-reader-kit-v1') {
    throw new ReaderReportInputError('Shopee reader methods differ from authenticated frozen binding.');
  }
  if (draft.status !== 'PROPOSED_AWAITING_REVIEW' || report.status !== 'PROPOSED_AWAITING_REVIEW') {
    throw new ReaderReportInputError('Shopee reader requires a proposed draft coding and cited synthesis.');
  }
  const input = { ...identity, contractVersion: 'insight-reader-input-v8', reportKind: 'INSIGHT',
    builderVersion: 'reader-report-insight-shopee-v1', scope: { ...scope, requestedPeriod: { ...scope.requestedPeriod } },
    retainedMethods: [{ kind: 'SHOPEE_CODING', sha256: digest(draft) }] } as InsightReaderInput;
  verifyInsightReaderInput(input, input);
  if (input.contractVersion !== 'insight-reader-input-v8') {
    throw new ReaderReportInputError('Shopee reader methods differ from authenticated frozen binding.');
  }
  const byIndex = new Map(view.records.map((record, recordIndex) => [recordIndex, record] as const));
  const citeRow = (recordIndex: number): CitationInput => {
    const record = byIndex.get(recordIndex);
    const ref = record?.locator;
    if (!record || !ref) throw new ReaderReportInputError('Shopee finding cites a record without retained identity.');
    return { sourceKind: 'REVIEW', identity: ref.pageSha256, locator: ref.textPointer,
      label: 'Đánh giá khách hàng trên Shopee', retrievedAt: acquiredAt, url: null,
      quote: null, quoteVerification: 'NOT_APPLICABLE' };
  };
  const draftByCode = new Map<string, { label: string; occurrences: { recordIndex: number; quote: string; context: string | null }[] }>();
  for (const entry of draft.codes) {
    const record = byIndex.get(entry.recordIndex);
    if (!record || record.text === null || record.text.slice(entry.quote.start, entry.quote.end) !== entry.quote.text) {
      throw new ReaderReportInputError('Shopee draft quote differs from its retained record.');
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
      throw new ReaderReportInputError('Shopee cited finding lacks retained coded occurrences.');
    }
    const distinct = new Set(renditions.occurrences.map(occurrence => occurrence.recordIndex)).size;
    const key = `shopee.codes.${finding.code}.records`;
    bundle.set(key, distinct, 'int', `shopee-cited-synthesis-v1/${finding.code}/distinct-records`);
    findings.push({ sectionId: finding.sectionId, status: finding.status, scope: finding.scope,
      citations: renditions.occurrences.map(occurrence => citeRow(occurrence.recordIndex)),
      template: esc(finding.template) });
  }
  bundle.set('shopee.records.coded', report.counts.recordsCoded, 'int', 'shopee-cited-synthesis-v1/counts/recordsCoded');
  bundle.set('shopee.codes.proposed', report.counts.codesProposed, 'int', 'shopee-cited-synthesis-v1/counts/codesProposed');
  const recordsCoded = String(report.counts.recordsCoded), codesProposed = String(report.counts.codesProposed);
  const mark = (recordIndex: number) => renderCitationMarkOrMissing(registry.cite(citeRow(recordIndex)));
  const quoteBlock = (occurrence: { recordIndex: number; quote: string; context: string | null }) =>
    (hasHiddenName(occurrence.quote, 'READER') ? retainedQuoteHtml(occurrence.quote, 'blockquote') : `<blockquote>${esc(occurrence.quote)}</blockquote>`) +
    (occurrence.context === null || occurrence.context === occurrence.quote ? ''
      : `<details><summary>Ngữ cảnh bản ghi</summary>${hasHiddenName(occurrence.context, 'READER') ? retainedQuoteHtml(occurrence.context, 'blockquote') : `<p>${esc(occurrence.context)}</p>`}</details>`);
  const exclusions: string[] = [];
  let unreadable = 0;
  for (const record of view.records) {
    if (record.textState === 'UNREADABLE' || (record.admission === 'SELECTED_TEXT' && record.text === null)) unreadable++;
  }
  exclusions.push(`EXCLUDED ${view.accounting.retainedRecords - view.accounting.selectedTextRecords}`);
  exclusions.push(`UNREADABLE ${unreadable}`);
  // Authenticated eligible total from the same retained view the coding context replays: partial
  // coding must never shrink the collected-source scope to the coded count.
  let eligibleTotal = 0;
  for (const record of view.records) {
    if (record.admission === 'SELECTED_TEXT' && record.textState === 'READABLE' && record.text !== null) eligibleTotal++;
  }
  const topicRanking: ReviewTopicRanking | null = draft.promptVersion.endsWith('-v2')
    ? rankReviewTopicMentions(draft.codes.map(entry => ({ platform: 'SHOPEE' as const, recordIndex: entry.recordIndex,
        topic: ('topic' in entry ? entry.topic : entry.label), polarity: entry.polarity ?? 'KHONG_RO', quote: entry.quote.text,
        context: byIndex.get(entry.recordIndex)?.text ?? null })), { platform: 'SHOPEE' })
    : null;
  const rankingHtml = topicRanking === null ? null : renderTopicRanking(topicRanking, mark, quoteBlock);
  const sections: InsightReaderSection[] = [
    { id: 'I02', body: `<p>Khách hàng đánh giá trên Shopee đã thu thập: ${eligibleTotal} bản ghi SELECTED_TEXT có chữ đọc được trong tập S05 đã lưu, trong đó ${recordsCoded} bản ghi có mã đề xuất (số lượng do ứng dụng đếm; mã là đề xuất, chờ chủ duyệt), giai đoạn nguồn không xác minh. Đơn vị là bản ghi, không phải số người.</p>`,
      explanation: 'Bối cảnh khách hàng từ tập S05 đã lưu; chưa xác thực độc lập.' },
    { id: 'I10', body: rankingHtml ?? (report.findings.map(finding => {
      const renditions = draftByCode.get(finding.code);
      const occurrences = (renditions?.occurrences ?? []).slice(0, 6);
      return `<p><b>${esc(finding.code)}</b> (${esc(finding.label)}): ` +
        `${occurrences.map(occurrence => `${mark(occurrence.recordIndex)}`).join(' ')}</p>` +
        occurrences.map(occurrence => quoteBlock(occurrence)).join('');
    }).join('') || `<p>Không có mã đề xuất nào trong bản nháp này.</p>`),
    explanation: 'Chủ đề và cảm nhận do mô hình đề xuất từ lời nguồn đã lưu, chờ chủ duyệt; chưa phải kết luận.' },
    { id: 'I17', body: `<p>Phụ lục: ${codesProposed} mã đề xuất trên ${recordsCoded} bản ghi có mã (số lượng do ứng dụng đếm từ bản ghi đã lưu; mã là đề xuất, chờ chủ duyệt). ` +
      `${sourceAppendixRow()} ` +
      `Bản ghi ngoài số lượng chính: ${exclusions.join('; ')}. ${report.limitations.map(line => esc(line)).join(' ')}</p>`,
    explanation: 'Phạm vi, giới hạn và số lượng đã đếm; chưa đủ điều kiện phát hành.' },
  ];
  return { input, page: { keyword: scope.keyword, period: { ...scope.requestedPeriod }, definition: scope.definition,
    sections, findings: { bundle, findings }, registry } };
}

function renderTopicRanking(ranking: ReviewTopicRanking, mark: (recordIndex: number) => string,
  quoteBlock: (occurrence: { recordIndex: number; quote: string; context: string | null }) => string): string {
  const quoteCells = (quotes: ReviewTopicRanking['khac']['quotes']) => quotes.map(q => `${mark(q.recordIndex)}${quoteBlock(q)}`).join('');
  const rows = ranking.rows.map(row => `<tr><td>${row.rank}</td><td>${esc(row.topic)}</td><td>${row.polarity}</td><td>${row.mentionCount}</td><td><details><summary>Xem ${row.quotes.length} trích dẫn</summary>${quoteCells(row.quotes)}</details></td></tr>`).join('');
  const khac = `<tr><td></td><td>Khác</td><td></td><td>${ranking.khac.mentionCount}</td><td><details><summary>Xem ${ranking.khac.quotes.length} trích dẫn</summary>${quoteCells(ranking.khac.quotes)}</details></td></tr>`;
  return `<table><thead><tr><th>Hạng</th><th>Chủ đề</th><th>Khen/chê</th><th>Số lượt nhắc</th><th>Trích dẫn</th></tr></thead><tbody>${rows}${khac}</tbody></table>` +
    `<p>Không khen không chê: ${ranking.khongRoCount} lượt nhắc.</p>`;
}

/** U-27 source appendix row: registry identity (S-ID, tier, report name). L9 has no Shopee
 * application: Shopee coding never depends on L9 terms, so no L9 count is shown here
 * (missing is never written as zero). Registry values come from the board's
 * SOURCE_REGISTRY read-only; this file never changes board behavior. */
function sourceAppendixRow(): string {
  const card = SOURCE_REGISTRY.APIFY_SHOPEE;
  return `Nguồn ${card.registryIds.join(', ')} · hạng ${card.tier} · ${card.reportName}. ` +
    `Lọc nghĩa L9 không áp dụng cho bằng chứng Shopee.`;
}
