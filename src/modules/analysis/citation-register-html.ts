import { escapeHtml } from './research-automation/descriptive-report.js';
import { assertReaderSafeCitation, type CitationEntry, type CitationRegistry } from './citation-registry.js';

/** "Nguồn tham khảo" register for web and PDF. Reader text only: no ids or digests. */

const displayDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Labels a report writes itself when a web result has no usable site name. Any other web label is the site's own name. */
const AUTHORED_WEB_LABELS: ReadonlySet<string> = new Set(['Kết quả tìm kiếm trên web', 'Trang web liên quan']);

const SOURCE_FAMILY: Readonly<Record<CitationEntry['sourceKind'], string>> = {
  CAPTURE: 'Bản thu dữ liệu', METRIC_ROW: 'Số liệu bán hàng', REVIEW: 'Đánh giá khách hàng',
  WEB_RESULT: 'Trang web', PDF_PAGE: 'Tài liệu PDF', UPSTREAM_CLAIM: 'Nhận định nguồn',
};

function renderItem(entry: CitationEntry, format: 'web' | 'pdf', currentReader: boolean): string {
  // A PDF page reads as one name with its page: "<document name>, trang N".
  const pdfPage = entry.sourceKind === 'PDF_PAGE' && entry.locatorText !== null;
  const name = pdfPage && entry.label.endsWith(`, ${entry.locatorText}`) ? entry.label.slice(0, -`, ${entry.locatorText}`.length) : entry.label;
  // A copied site name is shown as copied text, so the owned-wording rules do not read it as the report's claim.
  const copied = entry.sourceKind === 'WEB_RESULT' && !AUTHORED_WEB_LABELS.has(name);
  const label = `<span class="cite-label">${copied ? `<q data-quote>${escapeHtml(name)}</q>` : escapeHtml(name)}</span>`;
  const parts = [`<span class="cite-number">[${entry.number}]</span>`, pdfPage ? `${label}, <span class="cite-locator">${escapeHtml(entry.locatorText!)}</span>` : label];
  // This ordinal identifies the register entry, never an inferred source filename or date.
  if (currentReader) parts.push(`<span class="cite-family">${SOURCE_FAMILY[entry.sourceKind]} · mục nguồn ${entry.number}</span>`);
  if (entry.retrievedAt !== null) parts.push(`<span class="cite-date">ngày ${escapeHtml(displayDate(entry.retrievedAt))}</span>`);
  if (entry.locatorText !== null && !pdfPage) parts.push(`<span class="cite-locator">${escapeHtml(entry.locatorText)}</span>`);
  if (entry.url !== null) {
    const href = escapeHtml(entry.url);
    // The current reader keeps the short link text; the PDF renderer alone prints the exact address once.
    parts.push(format === 'pdf'
      ? `<a href="${href}">${href}</a>`
      : `<a href="${href}" rel="noopener noreferrer">Mở nguồn</a>`);
  }
  return `<li id="cite-${entry.number}">${parts.join(' · ')}</li>`;
}

export function renderCitationRegister(entries: readonly CitationEntry[], options: { readonly format: 'web' | 'pdf'; readonly currentReader?: boolean }): string {
  if (entries.length === 0) return '';
  // Entries may be built outside the registry; nothing reader-unsafe is rendered either way.
  for (const entry of entries) assertReaderSafeCitation(entry);
  return `<section class="citation-register"><h2>Nguồn tham khảo</h2><ol>${entries.map(entry => renderItem(entry, options.format, options.currentReader === true)).join('')}</ol></section>`;
}

export function renderCitationMark(n: number): string {
  return `<sup class="cite">[${n}]</sup>`;
}

/** Resolve eager section rendering against the completed body before writing its register or semantic trace. */
export function orderReportCitations(body: string, registry: CitationRegistry): string {
  const mark = /<sup class="cite">\[(\d+)\]<\/sup>/g;
  const mapping = registry.orderByAppearance([...body.matchAll(mark)].map(match => Number(match[1])));
  return body.replace(mark, (_match, number: string) => renderCitationMark(mapping.get(Number(number))!));
}

/** A value the viewer cannot trace to a retained source shows the missing-source phrase instead of a number. */
export function renderCitationMarkOrMissing(number: number | null): string {
  return number === null ? '<span class="cite-missing">Chưa có nguồn</span>' : renderCitationMark(number);
}
