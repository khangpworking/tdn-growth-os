import type { CitationRegistry } from '../citation-registry.js';
import { orderReportCitations, renderCitationMark, renderCitationRegister } from '../citation-register-html.js';
import { canonicalJson } from '../../foundation/canonical-json.js';

/** Call only after saving the semantic and technical copies: reader-identical entries share one number. */
export function marketReaderCitations(page: string, registry: CitationRegistry): string {
  const start = page.indexOf('<section class="citation-register">');
  if (start < 0) return page;
  const end = page.indexOf('</section>', start) + '</section>'.length;
  const byDisplay = new Map<string, number>(), representative = new Map<number, number>();
  for (const entry of registry.entries()) {
    const { number, citationId: _id, ...display } = entry;
    const key = canonicalJson(display);
    const kept = byDisplay.get(key) ?? number;
    byDisplay.set(key, kept);
    representative.set(number, kept);
  }
  const mapped = page.slice(0, start).replace(/<sup class="cite">\[(\d+)\]<\/sup>/gu,
    (_mark, number: string) => renderCitationMark(representative.get(Number(number))!));
  const readerPage = orderReportCitations(mapped, registry);
  return readerPage + renderCitationRegister(registry.entries(), { format: 'web' }) + page.slice(end);
}
