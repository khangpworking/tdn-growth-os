import { escapeHtml } from './research-automation/descriptive-report.js';
import type { CitationEntry } from './citation-registry.js';

/** "Nguồn tham khảo" register for web and PDF. Reader text only: no ids or digests. */

const displayDate = (iso: string): string => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function renderItem(entry: CitationEntry, format: 'web' | 'pdf'): string {
  const parts = [`<span class="cite-number">[${entry.number}]</span>`, `<span class="cite-label">${escapeHtml(entry.label)}</span>`];
  if (entry.retrievedAt !== null) parts.push(`<span class="cite-date">ngày ${escapeHtml(displayDate(entry.retrievedAt))}</span>`);
  if (entry.locatorText !== null) parts.push(`<span class="cite-locator">${escapeHtml(entry.locatorText)}</span>`);
  if (entry.url !== null) {
    const href = escapeHtml(entry.url);
    parts.push(format === 'pdf'
      ? `<a href="${href}">${href}</a>`
      : `<a href="${href}" rel="noopener noreferrer">Mở nguồn</a>`);
  }
  return `<li id="cite-${entry.number}">${parts.join(' · ')}</li>`;
}

export function renderCitationRegister(entries: readonly CitationEntry[], options: { readonly format: 'web' | 'pdf' }): string {
  if (entries.length === 0) return '';
  return `<section class="citation-register"><h2>Nguồn tham khảo</h2><ol>${entries.map(entry => renderItem(entry, options.format)).join('')}</ol></section>`;
}

export function renderCitationMark(n: number): string {
  return `<sup class="cite">[${n}]</sup>`;
}
