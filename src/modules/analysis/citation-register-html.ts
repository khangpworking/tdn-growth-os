import { escapeHtml } from './research-automation/descriptive-report.js';
import { assertReaderSafeCitation, type CitationEntry, type CitationRegistry } from './citation-registry.js';
import { marketNumberTokens } from './research-automation/market-number-trace.js';
import { traceMarketNumber } from './research-automation/market-trace-map.js';
import { storedInput } from './research-automation/market-trace-inputs.js';

/** "Nguồn tham khảo" register for web and PDF. Reader text only: no ids or digests. */

const displayDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

/** Labels a report writes itself when a web result has no usable site name. Any other web label is the site's own name. */
const AUTHORED_WEB_LABELS: ReadonlySet<string> = new Set(['Kết quả tìm kiếm trên web', 'Trang web liên quan']);

const SOURCE_FAMILY: Readonly<Record<CitationEntry['sourceKind'], string>> = {
  CAPTURE: 'Bản thu dữ liệu', METRIC_ROW: 'Số liệu bán hàng', REVIEW: 'Đánh giá khách hàng',
  WEB_RESULT: 'Trang web', PDF_PAGE: 'Tài liệu PDF', UPSTREAM_CLAIM: 'Nhận định nguồn',
};

/** Market number trace (P5): a register field prints as stored on its citation entry; each number in it is recorded. No-op outside a traced build. */
function traceField(entry: CitationEntry, field: 'label' | 'locatorText', text: string): string {
  for (const number of marketNumberTokens(text)) traceMarketNumber(number, 'page.citations', 'raw', [storedInput('stored-source', `citation:${entry.citationId}`, `/${field}`, text)], `citation ${field}, as stored`, 'as-stored');
  return text;
}

function renderItem(entry: CitationEntry, format: 'web' | 'pdf', currentReader: boolean): string {
  // A PDF page reads as one name with its page: "<document name>, trang N".
  const pdfPage = entry.sourceKind === 'PDF_PAGE' && entry.locatorText !== null;
  const name = pdfPage && entry.label.endsWith(`, ${entry.locatorText}`) ? entry.label.slice(0, -`, ${entry.locatorText}`.length) : entry.label;
  // A copied site name is shown as copied text, so the owned-wording rules do not read it as the report's claim.
  const copied = entry.sourceKind === 'WEB_RESULT' && !AUTHORED_WEB_LABELS.has(name);
  const label = `<span class="cite-label">${copied ? `<q data-quote>${escapeHtml(traceField(entry, 'label', name))}</q>` : escapeHtml(traceField(entry, 'label', name))}</span>`;
  const number = (): string => traceMarketNumber(String(entry.number), 'page.citations', 'raw', [storedInput('stored-source', `citation:${entry.citationId}`, '/number', entry.number)],
    'register entry number, as stored', 'as-stored');
  const parts = [`<span class="cite-number">[${number()}]</span>`, pdfPage ? `${label}, <span class="cite-locator">${escapeHtml(traceField(entry, 'locatorText', entry.locatorText!))}</span>` : label];
  // This ordinal identifies the register entry, never an inferred source filename or date.
  if (currentReader) parts.push(`<span class="cite-family">${SOURCE_FAMILY[entry.sourceKind]} · mục nguồn ${number()}</span>`);
  if (entry.retrievedAt !== null) parts.push(`<span class="cite-date">ngày ${escapeHtml(traceMarketNumber(displayDate(entry.retrievedAt), 'page.citations', 'raw',
    [storedInput('stored-source', `citation:${entry.citationId}`, '/retrievedAt', entry.retrievedAt)], 'citation retrieval day dd/mm/yyyy', 'vi-date'))}</span>`);
  if (entry.locatorText !== null && !pdfPage) parts.push(`<span class="cite-locator">${escapeHtml(traceField(entry, 'locatorText', entry.locatorText))}</span>`);
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

/** Report block of each position: the id of the enclosing `section.sheet`, or `page`. */
function sheetAt(html: string): (at: number) => string {
  const opens: { at: number; block: string | null }[] = [];
  const stack: (string | null)[] = [];
  for (const match of html.matchAll(/<section\b([^>]*)>|<\/section>/gu)) {
    if (match[0] === '</section>') stack.pop();
    else stack.push(/\bclass="sheet"/u.test(match[1]!) ? /\bid="([^"]+)"/u.exec(match[1]!)?.[1] ?? null : null);
    opens.push({ at: match.index, block: stack.findLast(block => block !== null) ?? null });
  }
  return at => opens.findLast(open => open.at < at)?.block ?? 'page';
}

/**
 * Resolve eager section rendering against the completed body before writing its register or semantic trace.
 * `trace` (the final numbering of a traced Market build): each mark records its number as the stored number of its register entry.
 */
export function orderReportCitations(body: string, registry: CitationRegistry, options: { readonly trace?: boolean } = {}): string {
  const mark = /<sup class="cite">\[(\d+)\]<\/sup>/g;
  const mapping = registry.orderByAppearance([...body.matchAll(mark)].map(match => Number(match[1])));
  const block = options.trace ? sheetAt(body) : null;
  const entries = options.trace ? new Map(registry.entries().map(entry => [entry.number, entry])) : null;
  return body.replace(mark, (_match, number: string, at: number) => {
    const next = mapping.get(Number(number))!, entry = entries?.get(next);
    if (block && entry) traceMarketNumber(String(next), `${block(at)}.citations`, 'raw', [storedInput('stored-source', `citation:${entry.citationId}`, '/number', next)],
      'citation mark: the number of its register entry, as stored', 'as-stored');
    return renderCitationMark(next);
  });
}

/** A value the viewer cannot trace to a retained source shows the missing-source phrase instead of a number. */
export function renderCitationMarkOrMissing(number: number | null): string {
  return number === null ? '<span class="cite-missing">Chưa có nguồn</span>' : renderCitationMark(number);
}
