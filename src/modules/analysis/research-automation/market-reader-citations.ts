import type { CitationRegistry } from '../citation-registry.js';
import { orderReportCitations, renderCitationRegister } from '../citation-register-html.js';
import { readerText } from './market-reader-delivery.js';
import { filterReaderGlossary } from './market-reader-glossary.js';

/** Call only after saving the semantic and technical copies. Keep each retained citation identity. */
export function marketReaderCitations(page: string, registry: CitationRegistry, options: { readonly publicReviewSource?: boolean } = {}): string {
  const start = page.indexOf('<section class="citation-register">');
  if (start < 0) return page;
  const end = page.indexOf('</section>', start) + '</section>'.length;
  // A number already identifies source kind, retained identity and normalized locator.
  // Whitespace between marks belongs to the same claim; element/claim boundaries do not.
  const mapped = page.slice(0, start).replace(/(<sup class="cite">\[(\d+)\]<\/sup>)(?:\s*<sup class="cite">\[\2\]<\/sup>)+/gu,
    (_marks, mark: string) => mark);
  const readerPage = orderReportCitations(mapped, registry, { trace: true });
  return filterReaderGlossary(readerPage + readerText(renderCitationRegister(registry.entries(), { format: 'web', currentReader: true }), false, options) + page.slice(end), { currentReader: true });
}
