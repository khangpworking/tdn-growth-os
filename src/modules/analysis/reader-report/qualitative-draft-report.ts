import type {
  AutomationQualitativeDraft,
  QualitativeDraftClassification,
  QualitativeDraftEvidenceCard,
  QualitativeDraftQuote,
  QualitativeDraftSourceRecord,
} from '../../../../contracts/analysis/automation-qualitative-draft-v1.generated.js';
import type { ReportCitations } from '../research-automation/descriptive-report.js';
import { escapeHtml, readerPointer, technicalLiteral } from '../research-automation/descriptive-report.js';

export type QualitativeDraftReportSection = 'I02' | 'I05' | 'I06' | 'I10' | 'I17';

const escape = escapeHtml;

const platformName: Record<AutomationQualitativeDraft['source']['platform'], string> = {
  SHOPEE: 'Shopee', TIKTOK: 'TikTok',
};
const sourceName: Record<AutomationQualitativeDraft['source']['sourceType'], string> = {
  S05_LOCATED_REVIEW: 'review đã định vị', S07_TIKTOK_COMMENT: 'bình luận TikTok đã lưu',
};
const sentimentName: Record<NonNullable<QualitativeDraftClassification['statedSentiment']>, string> = {
  POSITIVE: 'Tích cực', NEGATIVE: 'Tiêu cực', MIXED: 'Pha trộn', NEUTRAL: 'Trung tính',
  NOT_STATED: 'Không nêu cảm nhận', AMBIGUOUS: 'Chưa rõ',
};
const confidenceName: Record<QualitativeDraftClassification['confidence'], string> = {
  HIGH: 'Cao', MEDIUM: 'Trung bình', LOW: 'Thấp', AMBIGUOUS: 'Mơ hồ', UNAVAILABLE: 'Chưa có',
};
const admissionName: Record<QualitativeDraftSourceRecord['admission'], string> = {
  INCLUDED: 'Đưa vào đọc', EXCLUDED: 'Loại khỏi đọc', UNCLEAR: 'Chưa rõ điều kiện đọc',
};
const classificationName: Record<QualitativeDraftClassification['status'], string> = {
  CLASSIFIED: 'Đã có đề xuất mã hóa', UNCLASSIFIED: 'Chưa phân loại', UNAVAILABLE: 'Chưa có dữ liệu mã hóa',
};

function canonicalHttps(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '' ? `${url.origin}${url.pathname}` : null;
  } catch { return null; }
}

function sourceMark(draft: AutomationQualitativeDraft, record: QualitativeDraftSourceRecord, citations: ReportCitations): string {
  const ownerUrl = canonicalHttps(record.locator.owner);
  const pointer = readerPointer(record.locator.textPointer);
  return citations.mark({
    sourceKind: 'REVIEW', identity: record.sourceHash, locator: pointer.locator,
    label: `Bản ghi ${platformName[draft.source.platform]} đã lưu`, retrievedAt: null, url: ownerUrl,
    quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: {
      platform: draft.source.platform, sourceType: draft.source.sourceType, sourceSha256: draft.source.sourceSha256,
      sourceHash: record.sourceHash, sourcePackageId: draft.source.sourcePackageId ?? '',
      sourceManifestSha256: draft.source.sourceManifestSha256 ?? '', sourceContentSha256: draft.source.sourceContentSha256 ?? '',
      owner: record.locator.owner, pageSha256: record.locator.pageSha256, pageIndex: String(record.locator.pageIndex),
      rowIndex: String(record.locator.rowIndex), textPointer: record.locator.textPointer,
    },
  });
}

function quoteMark(draft: AutomationQualitativeDraft, quote: QualitativeDraftQuote, citations: ReportCitations): string {
  const ownerUrl = canonicalHttps(quote.locator.owner);
  const pointer = readerPointer(quote.locator.textPointer);
  return citations.mark({
    sourceKind: 'REVIEW', identity: draft.records[quote.recordIndex]?.sourceHash ?? draft.source.sourceSha256,
    locator: pointer.locator, label: `Đoạn nguồn ${platformName[draft.source.platform]} đã lưu`, retrievedAt: null,
    url: ownerUrl, quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: {
      platform: draft.source.platform, sourceSha256: draft.source.sourceSha256, recordId: quote.recordId,
      quoteStart: String(quote.start), quoteEnd: String(quote.end), owner: quote.locator.owner,
      pageSha256: quote.locator.pageSha256, pageIndex: String(quote.locator.pageIndex), rowIndex: String(quote.locator.rowIndex),
      textPointer: quote.locator.textPointer,
    },
  });
}

function quoteHtml(draft: AutomationQualitativeDraft, quote: QualitativeDraftQuote, citations: ReportCitations): string {
  return `<blockquote data-quote style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(quote.text)}</blockquote> ${quoteMark(draft, quote, citations)} <small>(UTF-16 ${quote.start}–${quote.end})</small>`;
}

function recordContext(draft: AutomationQualitativeDraft, record: QualitativeDraftSourceRecord, citations: ReportCitations): string {
  const attribution = authorDisclosure(record);
  return `<details class="qualitative-context"><summary>Toàn văn và vị trí bản ghi ${escape(record.recordId)}</summary>`
    + `<p>${sourceMark(draft, record, citations)} · ${escape(admissionName[record.admission])}${record.admissionReason ? ` · ${escape(record.admissionReason)}` : ''}</p>`
    + `<p>${attribution}</p>${record.text === null ? '<p>Không có văn bản đọc được.</p>' : `<blockquote data-quote style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(record.text)}</blockquote>`}`
    + `<p><small>Vị trí: ${technicalLiteral(record.locator.owner)} · trang ${record.locator.pageIndex} · dòng ${record.locator.rowIndex} · ${technicalLiteral(record.locator.textPointer)} · mã băm bản ghi ${technicalLiteral(record.sourceHash)}</small></p></details>`;
}

function authorDisclosure(record: QualitativeDraftSourceRecord): string {
  if (record.author.state === 'VERIFIED_HASHED') return 'Tác giả đã có dấu kiểm ẩn danh trong hồ sơ nguồn; không hiển thị định danh.';
  if (record.author.state === 'MISSING') return 'Tác giả không có dấu kiểm trong hồ sơ nguồn; không suy ra số người.';
  if (record.author.state === 'INVALID') return 'Tác giả có dấu kiểm không hợp lệ; không suy ra số người.';
  return 'Tác giả không có dấu kiểm đủ điều kiện; không suy ra số người.';
}

function classificationFor(draft: AutomationQualitativeDraft): ReadonlyMap<number, QualitativeDraftClassification> {
  return new Map(draft.classifications.map(item => [item.recordIndex, item]));
}

function stateNotice(draft: AutomationQualitativeDraft): string {
  return `<div class="warning qualitative-policy"><p><strong>Đề xuất, chờ chủ duyệt.</strong> Đây là lớp đọc bám nguồn, chưa đủ điều kiện phát hành kết luận chính.</p>`
    + `<p><strong>U11_STATISTIC_UNAVAILABLE:</strong> độ tin cậy thống kê chưa khả dụng; không có tỷ lệ, kappa hoặc số liệu suy rộng. Tính đủ điều kiện phát hành: <strong>UNAVAILABLE</strong>. Dùng trong kết luận chính: <strong>EXCLUDED</strong>.</p>`
    + `<p>Chỉ có thể dùng để xem các khai báo trong bản ghi nguồn đã lưu. Không dùng để suy ra người dùng, quan hệ nhân quả, độ tin cậy hay tổng hợp giữa Shopee và TikTok.</p></div>`;
}

function readingGuide(see: string, use: string, dont: string): string {
  return `<div class="qualitative-guide"><p><strong>Thấy gì</strong> → ${see}</p><p><strong>Dùng để</strong> → ${use}</p><p><strong>Đừng hiểu là</strong> → ${dont}</p></div>`;
}

function classificationRow(draft: AutomationQualitativeDraft, record: QualitativeDraftSourceRecord,
  classification: QualitativeDraftClassification | undefined, citations: ReportCitations, field: 'situation' | 'journey' | 'topic' | 'sentiment'): string {
  const value = classification === undefined ? null
    : field === 'sentiment' ? (classification.statedSentiment === null ? null : sentimentName[classification.statedSentiment])
      : classification[field];
  const status = classification === undefined ? 'Không có mục mã hóa cho bản ghi này'
    : `${classificationName[classification.status]} · độ tin cậy ${confidenceName[classification.confidence]}`;
  const quotes = classification?.quotes.length ? `<div class="qualitative-quotes">${classification.quotes.map(quote => quoteHtml(draft, quote, citations)).join(' ')}</div>` : '';
  const uncertainty = classification?.uncertainty ? `<p class="warning">${escape(classification.uncertainty.state === 'AMBIGUOUS' ? 'Mơ hồ' : 'Chưa có dữ liệu')}: ${escape(classification.uncertainty.detail)}</p>` : '';
  return `<tr><td>${escape(record.recordId)}<br>${sourceMark(draft, record, citations)}</td><td>${value === null ? 'Chưa nêu hoặc chưa có dữ liệu' : escape(value)}</td><td>${escape(status)}${uncertainty}${quotes}${recordContext(draft, record, citations)}</td></tr>`;
}

function classificationTable(draft: AutomationQualitativeDraft, section: QualitativeDraftReportSection, citations: ReportCitations): string {
  const field = section === 'I02' ? 'situation' : section === 'I05' ? 'sentiment' : section === 'I06' ? 'journey' : 'topic';
  const heading = field === 'situation' ? 'Tình huống' : field === 'sentiment' ? 'Cảm nhận được nêu' : field === 'journey' ? 'Chặng hành trình được đề xuất' : 'Chủ đề';
  const map = classificationFor(draft);
  const rows = draft.records.map(record => classificationRow(draft, record, map.get(record.recordIndex), citations, field)).join('');
  const fieldDescription = field === 'sentiment' ? 'cảm nhận được nêu trong lời nguồn, không phải đánh giá độc lập' : `khai báo ${heading.toLowerCase()} được gắn vào từng bản ghi`;
  return `<h3>${escape(heading)} theo bản ghi</h3>${readingGuide(
    `Mỗi hàng giữ ${fieldDescription} của nguồn ${platformName[draft.source.platform]}.`,
    'đặt các đề xuất cạnh toàn văn và đoạn trích có vị trí; trạng thái mơ hồ hoặc chưa có dữ liệu vẫn được giữ nguyên.',
    'đây là số người, tỷ lệ thị trường, nguyên nhân hoặc kết luận đã duyệt.')}
    <div class="table-wrap" role="region" aria-label="${escape(heading)} theo bản ghi" tabindex="0"><table><caption>${escape(heading)} · ${platformName[draft.source.platform]} · từng bản ghi, không cộng dồn</caption><thead><tr><th scope="col">Bản ghi và nguồn</th><th scope="col">${escape(heading)}</th><th scope="col">Trạng thái, đoạn trích và toàn văn</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Chưa có bản ghi trong nguồn đã lưu.</td></tr>'}</tbody></table></div>`;
}

function cardHtml(draft: AutomationQualitativeDraft, card: QualitativeDraftEvidenceCard, citations: ReportCitations): string {
  const quotes = card.quotes.map(quote => `<li>${quoteHtml(draft, quote, citations)}</li>`).join('');
  const attributes = card.attributes.map(attribute => `<li>${escape(attribute.kind)}: ${escape(attribute.value)} · ${attribute.quotes.map(quote => quoteMark(draft, quote, citations)).join(' ')}</li>`).join('');
  return `<details class="qualitative-card"><summary>Thẻ bằng chứng đề xuất ${technicalLiteral(card.cardId)}</summary>`
    + `<p>Tình huống: ${escape(card.situation.value)}. ${card.journey ? `Hành trình: ${escape(card.journey.value)}.` : 'Hành trình: chưa có dữ liệu.'}</p>`
    + `<p>Trạng thái: đề xuất, chờ chủ duyệt. ${escape(card.identityLimitation)} Tình trạng tác giả: ${escape(card.authorEvidence)}.</p>`
    + `<p>Các bản ghi tham chiếu: ${card.recordIndexes.map(index => escape(String(index))).join(', ') || 'chưa có'}.</p>`
    + `<ul><li>Đoạn trích thuộc thẻ</li>${quotes}</ul>${attributes ? `<ul><li>Thuộc tính giữ trong thẻ</li>${attributes}</ul>` : ''}</details>`;
}

function sourceIdentityHtml(draft: AutomationQualitativeDraft): string {
  const platform = platformName[draft.source.platform];
  return `<h3>Nguồn, kỳ và độ phủ</h3><dl><dt>Nền tảng</dt><dd>${platform} · ${escape(sourceName[draft.source.sourceType])}; không gộp với nền tảng khác.</dd>`
    + `<dt>Kỳ yêu cầu</dt><dd>${escape(draft.binding.requestedPeriod.startDate)} đến ${escape(draft.binding.requestedPeriod.endDate)}</dd>`
    + `<dt>Độ phủ bản ghi</dt><dd>${draft.counts.included} đưa vào đọc; ${draft.counts.excluded} loại khỏi đọc; ${draft.counts.unclear} chưa rõ điều kiện; ${draft.counts.classified} có phân loại; ${draft.counts.unclassified} chưa phân loại. Đây là accounting theo bản ghi trong nguồn này, không phải số người.</dd>`
    + `<dt>Nguồn đã lưu</dt><dd><code>sourceSha256=${technicalLiteral(draft.source.sourceSha256)}</code>${draft.source.sourcePackageId ? `<br><code>sourcePackageId=${technicalLiteral(draft.source.sourcePackageId)}</code>` : ''}${draft.source.sourceManifestSha256 ? `<br><code>manifestSha256=${technicalLiteral(draft.source.sourceManifestSha256)}</code>` : ''}${draft.source.sourceContentSha256 ? `<br><code>contentSha256=${technicalLiteral(draft.source.sourceContentSha256)}</code>` : ''}</dd></dl>`;
}

function recordsAppendix(draft: AutomationQualitativeDraft, citations: ReportCitations): string {
  const map = classificationFor(draft);
  const rows = draft.records.map(record => {
    const classification = map.get(record.recordIndex);
    return `<tr><td>${escape(record.recordId)}<br>${sourceMark(draft, record, citations)}</td><td>${record.text === null ? 'Không có văn bản đọc được.' : `<blockquote data-quote style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(record.text)}</blockquote>`}<br><small>${escape(admissionName[record.admission])}${record.admissionReason ? ` · ${escape(record.admissionReason)}` : ''}<br>${escape(authorDisclosure(record))}</small></td><td>${classification ? `${escape(classificationName[classification.status])}<br>Độ tin cậy: ${escape(confidenceName[classification.confidence])}<br>Tình huống: ${classification.situation === null ? 'Chưa có' : escape(classification.situation)}<br>Hành trình: ${classification.journey === null ? 'Chưa có' : escape(classification.journey)}<br>Chủ đề: ${classification.topic === null ? 'Chưa có' : escape(classification.topic)}<br>Cảm nhận: ${classification.statedSentiment === null ? 'Chưa có' : escape(sentimentName[classification.statedSentiment])}${classification.uncertainty ? `<br>Mơ hồ/chưa có dữ liệu: ${escape(classification.uncertainty.detail)}` : ''}${classification.quotes.map(quote => `<br>${quoteHtml(draft, quote, citations)}`).join('')}` : 'Chưa có phân loại'}</td><td><small>owner=${technicalLiteral(record.locator.owner)}; pageSha256=${technicalLiteral(record.locator.pageSha256)}; trang=${record.locator.pageIndex}; dòng=${record.locator.rowIndex}; pointer=${technicalLiteral(record.locator.textPointer)}; sourceHash=${technicalLiteral(record.sourceHash)}</small></td></tr>`;
  }).join('');
  return `<h3>Toàn văn, con trỏ và trạng thái từng bản ghi</h3><p>Toàn văn được giữ riêng với diễn giải. Đoạn trích chỉ được trình bày khi thuộc đúng bản ghi, con trỏ và khoảng UTF-16 đã lưu; phần không đọc được hoặc mơ hồ không được thay bằng câu mới.</p><div class="table-wrap" role="region" aria-label="Toàn văn và trạng thái bản ghi qualitative" tabindex="0"><table><caption>${platformName[draft.source.platform]} · nguồn, toàn văn, mã hóa và locator</caption><thead><tr><th>Bản ghi và citation</th><th>Toàn văn nguồn</th><th>Phân loại đề xuất</th><th>Locator và mã băm</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Chưa có bản ghi.</td></tr>'}</tbody></table></div>`;
}

/** Presentation-only projection of the verified canonical draft. It never validates, calls a provider, or aggregates across platforms. */
export function qualitativeDraftSection(draft: AutomationQualitativeDraft, section: QualitativeDraftReportSection, citations: ReportCitations): string {
  if (section === 'I17') {
    return stateNotice(draft) + sourceIdentityHtml(draft) + recordsAppendix(draft, citations)
      + (draft.cards.length ? `<h3>Thẻ bằng chứng</h3>${draft.cards.map(card => cardHtml(draft, card, citations)).join('')}` : '<p>Chưa có thẻ bằng chứng; không suy ra thiếu bằng chứng là bằng chứng phủ định.</p>')
      + `<h3>Giới hạn giữ nguyên từ hợp đồng</h3><ul class="limits">${draft.limitations.map(limitation => `<li>${escape(limitation)}</li>`).join('')}</ul>`
      + readingGuide(`Nguồn ${platformName[draft.source.platform]} và các trạng thái đã lưu được trình bày nguyên trạng.`, 'đối chiếu phạm vi, ngày yêu cầu, độ phủ và từng vị trí trước khi chủ xem xét.', 'đây là độ phủ toàn kỳ, số người, tỷ lệ, reliability hoặc điều kiện phát hành.');
  }
  return stateNotice(draft) + sourceIdentityHtml(draft) + classificationTable(draft, section, citations);
}

export function qualitativeDraftSummary(draft: AutomationQualitativeDraft): string {
  return `Đã nối bản nháp qualitative source-bound của ${platformName[draft.source.platform]} vào các mục I02, I05, I06, I10 và I17. Đây là đề xuất bám bản ghi, chờ chủ duyệt; U11_STATISTIC_UNAVAILABLE, release eligibility UNAVAILABLE và main-conclusion use EXCLUDED.`;
}
