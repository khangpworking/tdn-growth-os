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
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';

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
    `<blockquote>${esc(occurrence.quote)}</blockquote>` +
    (occurrence.context === null || occurrence.context === occurrence.quote ? ''
      : `<details><summary>Ngữ cảnh bản ghi</summary><p>${esc(occurrence.context)}</p></details>`);
  const exclusions: string[] = [];
  let unreadable = 0;
  for (const record of view.records) {
    if (record.textState === 'UNREADABLE' || (record.admission === 'SELECTED_TEXT' && record.text === null)) unreadable++;
  }
  exclusions.push(`EXCLUDED ${view.accounting.retainedRecords - view.accounting.selectedTextRecords}`);
  exclusions.push(`UNREADABLE ${unreadable}`);
  const sections: InsightReaderSection[] = [
    { id: 'I02', body: `<p>Khách hàng đánh giá trên Shopee đã thu thập: ${recordsCoded} bản ghi SELECTED_TEXT có chữ đọc được trong tập S05 đã lưu (số lượng đề xuất, chờ chủ duyệt), giai đoạn nguồn không xác minh. Đơn vị là bản ghi thu được, không phải số người.</p>`,
      explanation: 'Bối cảnh khách hàng từ tập S05 đã lưu; chưa xác thực độc lập.' },
    { id: 'I10', body: report.findings.map(finding => {
      const renditions = draftByCode.get(finding.code);
      const occurrences = (renditions?.occurrences ?? []).slice(0, 6);
      return `<p><b>${esc(finding.code)}</b> (${esc(finding.label)}): ` +
        `${occurrences.map(occurrence => `${mark(occurrence.recordIndex)}`).join(' ')}</p>` +
        occurrences.map(occurrence => quoteBlock(occurrence)).join('');
    }).join('') || `<p>Không có mã đề xuất nào trong bản nháp này.</p>`,
    explanation: 'Chủ đề và cảm nhận do mô hình đề xuất từ lời nguồn đã lưu, chờ chủ duyệt; chưa phải kết luận.' },
    { id: 'I17', body: `<p>Phụ lục: ${codesProposed} mã đề xuất trên ${recordsCoded} bản ghi (số lượng đề xuất, chờ chủ duyệt). ` +
      `Bản ghi ngoài số lượng chính: ${exclusions.join('; ')}. ${report.limitations.map(line => esc(line)).join(' ')}</p>`,
    explanation: 'Phạm vi, giới hạn và số lượng đề xuất; chưa đủ điều kiện phát hành.' },
  ];
  return { input, page: { keyword: scope.keyword, period: { ...scope.requestedPeriod }, definition: scope.definition,
    sections, findings: { bundle, findings }, registry } };
}
