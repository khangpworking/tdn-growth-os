// Verified PDF document excerpts in the Market report (S25). Read-only: the excerpts are selected from the quotes the run already
// stored, never asked for again. No reworded text, no guessed metadata, no grade: every excerpt is shown as "chưa xếp hạng độ tin cậy".
import { CitationRegistry, type CitationInput } from '../citation-registry.js';
import { PAGEINDEX_ELIGIBLE_SECTIONS, toCitationInput, type PageIndexQuotesArtifact } from '../pageindex-questions.js';
import { CAPTURED_PROVIDER_NAMES, FORBIDDEN_PROVIDER_NAMES } from '../reader-report/lint.js';
import { readerTextSafe } from './reader-plain-text.js';

/** The Market section that holds the block: "Động lực và rủi ro" is the context section for outside documents. */
export const PDF_EXCERPT_SECTION = 'M09' as const;
export const PDF_EXCERPT_MAX_PER_DOCUMENT = 3;
export const PDF_EXCERPT_MAX_WORDS = 30;
export const PDF_EXCERPT_TITLE = 'Trích đoạn nguyên văn từ tài liệu PDF của lượt này';
export const PDF_EXCERPT_UNRECORDED = 'chưa ghi';
export const PDF_EXCERPT_UNRATED = 'chưa xếp hạng độ tin cậy';
export const PDF_EXCERPT_NOTE = 'Các đoạn trích này lấy nguyên văn từ tài liệu PDF trong hồ sơ nguồn của lượt này (do chủ đính kèm hoặc tải về khi thu thập). Mỗi đoạn nói về phạm vi của chính tài liệu đó, không nói về sản phẩm này; số trong đó không so sánh được với số liệu mẫu và không được cộng vào số liệu mẫu.';
export const PDF_EXCERPT_SRC = 'Tài liệu PDF đã lưu trong hồ sơ nguồn của lượt này.';
/** Shown instead of a file name that is empty or could expose a provider, link, path or command. */
export const PDF_EXCERPT_WITHHELD_NAME = 'không hiển thị tên tệp';

export type PdfExcerptLeftOutReason = 'NOT_ATTESTED' | 'NOT_MARKET_SECTION' | 'OVER_30_WORDS' | 'OVER_3_PER_DOCUMENT' | 'NOT_FOR_THIS_RUN' | 'NOT_READER_SAFE' | 'EMPTY_QUOTE';

/** One verbatim excerpt as stored with the report. The label is the reader text; the grade, publisher and year are fixed wording at render time. */
export interface PdfExcerpt {
  readonly sourceSha256: string;
  readonly page: number;
  readonly text: string;
  readonly label: string;
}
export interface PdfExcerptLeftOut { readonly sourceSha256: string; readonly page: number; readonly reason: PdfExcerptLeftOutReason }
export interface PdfExcerptSelection { readonly excerpts: readonly PdfExcerpt[]; readonly leftOut: readonly PdfExcerptLeftOut[] }

const PROVIDER_WORDS = [...new Set([...FORBIDDEN_PROVIDER_NAMES, ...CAPTURED_PROVIDER_NAMES, 'PageIndex', 'Google', 'Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM'])];
const providerPattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${PROVIDER_WORDS.map(name => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|')})(?![\\p{L}\\p{N}_])`, 'iu');
/**
 * Text that could expose a path, link, address, account or secret is not shown. The report's own leak gates do not catch every
 * shape (an ordinary `/tmp/...` path passes them), so these are checked here, beside the shared reader-text check.
 */
const LEAK_PATTERNS: readonly RegExp[] = [
  /[A-Za-z]:[\\/]|\\\\[\w.-]+\\|(?<![\p{L}\p{N}])[A-Za-z]:(?=[\p{L}\p{N}_.~-])/u, // Windows drive, drive-relative or network path
  /(?:^|[^\p{L}\p{N}_.\/\\-])(?:~|\.{1,2})?[\/\\](?=[\p{L}\p{N}_.~-])|(?:^|[\s(["'])(?:~|\.{1,2})[\/\\]/u, // absolute, home or dot-relative path, one part is enough; a slash between words or numbers (đồng/chiếc, 6/2025) passes
  /\b[\w.-]+\/[\w.-]+\.(?:html?|php|aspx?|jsp|pdf|json|xml|csv|xlsx?|docx?|txt|png|jpe?g|gif|svg|js|css)\b|\b(?:href|src)\s*=|[?&][\w-]+=[\w%.-]/iu, // relative link
  /[a-z][a-z0-9+.-]*:\/\/|\bwww\.|(?<![\p{L}\p{N}_@.-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|gov|edu|info|biz|io|vn|asia|int)\b/iu, // web address
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu, // e-mail
  /(?<!\d\.?)(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(?!\.?\d)|(?:\b[0-9a-f]{1,4})?::(?:[0-9a-f]{1,4}\b)?|\b(?:[0-9a-f]{1,4}:){5,}[0-9a-f]{1,4}\b/iu, // IP address
  /\bBearer\s|\b(?:sk|pk|rk)-[A-Za-z0-9]|\b(?:ghp|gho|ghu|ghs|github_pat|xox[abprs])[_-]|\bAKIA[0-9A-Z]{12,}|\beyJ[\w-]{8,}|\b(?:api[_\s-]?key|access[_\s-]?token|secret|password|passwd)\b\s*[:=]/iu, // secret
  /(?<![\p{L}\p{N}])(?=[\w+\/=]*\d)(?=[\w+\/=]*[A-Za-z])[\w+\/=]{24,}/u, // token-shaped run of letters and digits; hyphenated file names pass
];
const leaks = (text: string): boolean => LEAK_PATTERNS.some(pattern => pattern.test(text));

const words = (text: string): number => text.trim().split(/\s+/u).filter(Boolean).length;

/** A file name is shown only when it is plain text: no provider, link, path separator or operator text. */
export function pdfExcerptFileNameShown(fileName: unknown): fileName is string {
  if (typeof fileName !== 'string') return false;
  const name = fileName.trim();
  return name.length > 0 && name.length <= 120 && !/[\\/|;&<>$`"'=\u0000-\u001f]/u.test(name) && !providerPattern.test(name) && !leaks(name) && readerTextSafe(name) && !/\.\./u.test(name);
}

/** The citation entry of one excerpt, built the way every PDF citation is built (`toCitationInput`). */
export function pdfExcerptCitation(excerpt: PdfExcerpt): CitationInput {
  return { sourceKind: 'PDF_PAGE', identity: excerpt.sourceSha256, locator: { kind: 'pdf', page: excerpt.page, fragment: null },
    label: excerpt.label, retrievedAt: null, url: null, quote: excerpt.text, quoteVerification: 'EXTERNAL_VERIFIER_ATTESTED' };
}

function readerSafe(text: string, citation: CitationInput): boolean {
  if (providerPattern.test(text) || leaks(text) || !readerTextSafe(text)) return false;
  try { new CitationRegistry().cite(citation); return true; } catch { return false; }
}

/**
 * Pure selection over the run's stored verified quotes: Market sections only, attested only, verbatim only, at most 3 per document
 * in stored order, at most 30 words each. A quote that does not qualify is left out with a reason code; none is cut or reworded.
 */
export function selectPdfExcerpts(artifact: PageIndexQuotesArtifact | null | undefined, runId: string, fileNames: ReadonlyMap<string, string>): PdfExcerptSelection {
  const excerpts: PdfExcerpt[] = [], leftOut: PdfExcerptLeftOut[] = [];
  if (!artifact || artifact.contractVersion !== 'pageindex-verified-quotes-v1' || !Array.isArray(artifact.quotes)) return { excerpts, leftOut };
  const perDocument = new Map<string, number>(), ordinals = new Map<string, number>();
  const out = (sourceSha256: string, page: number, reason: PdfExcerptLeftOutReason): void => { leftOut.push({ sourceSha256, page, reason }); };
  for (const quote of artifact.quotes) {
    if (artifact.runId !== runId || !fileNames.has(quote.sourceSha256)) { out(quote.sourceSha256, quote.page, 'NOT_FOR_THIS_RUN'); continue; }
    if (quote.quoteVerification !== 'EXTERNAL_VERIFIER_ATTESTED') { out(quote.sourceSha256, quote.page, 'NOT_ATTESTED'); continue; }
    if (!quote.sectionId.startsWith('M') || !PAGEINDEX_ELIGIBLE_SECTIONS.includes(quote.sectionId)) { out(quote.sourceSha256, quote.page, 'NOT_MARKET_SECTION'); continue; }
    if (typeof quote.quote !== 'string' || !quote.quote.trim()) { out(quote.sourceSha256, quote.page, 'EMPTY_QUOTE'); continue; }
    if (words(quote.quote) > PDF_EXCERPT_MAX_WORDS) { out(quote.sourceSha256, quote.page, 'OVER_30_WORDS'); continue; }
    if ((perDocument.get(quote.sourceSha256) ?? 0) >= PDF_EXCERPT_MAX_PER_DOCUMENT) { out(quote.sourceSha256, quote.page, 'OVER_3_PER_DOCUMENT'); continue; }
    const fileName = fileNames.get(quote.sourceSha256);
    if (!ordinals.has(quote.sourceSha256)) ordinals.set(quote.sourceSha256, ordinals.size + 1);
    const shown = pdfExcerptFileNameShown(fileName) ? fileName : `số ${ordinals.get(quote.sourceSha256)}, ${PDF_EXCERPT_WITHHELD_NAME}`;
    let citation: CitationInput;
    try { citation = toCitationInput(quote, shown); } catch { out(quote.sourceSha256, quote.page, 'NOT_READER_SAFE'); continue; }
    if (!readerSafe(quote.quote, citation)) { out(quote.sourceSha256, quote.page, 'NOT_READER_SAFE'); continue; }
    perDocument.set(quote.sourceSha256, (perDocument.get(quote.sourceSha256) ?? 0) + 1);
    excerpts.push({ sourceSha256: quote.sourceSha256, page: quote.page, text: quote.quote, label: citation.label });
  }
  return { excerpts, leftOut };
}

/** Distinct documents in stored order: the S25 registry bindings. */
export const pdfExcerptDocuments = (excerpts: readonly PdfExcerpt[]): string[] => [...new Set(excerpts.map(excerpt => excerpt.sourceSha256))];

/**
 * The block, shared by both Market renderers. `mark` adds a citation number after an excerpt. The excerpt, its label and its fixed
 * metadata sit inside one `data-quote` blockquote, so they are copied source text and never read as the report's own statements.
 */
export function pdfExcerptBlockHtml(excerpts: readonly PdfExcerpt[], esc: (value: string) => string, mark: (excerpt: PdfExcerpt) => string = () => ''): string {
  if (excerpts.length === 0) return '';
  return `<h3>${esc(PDF_EXCERPT_TITLE)}</h3><ul class="pdf-excerpts">${excerpts.map(excerpt =>
    `<li><blockquote data-quote><p>${esc(excerpt.text)}</p><footer>${esc(excerpt.label)}; nhà xuất bản: ${PDF_EXCERPT_UNRECORDED}; năm: ${PDF_EXCERPT_UNRECORDED}; độ tin cậy: ${PDF_EXCERPT_UNRATED}.</footer></blockquote>${mark(excerpt)}</li>`).join('')}</ul>`;
}

/** The excerpts stored with a verified Market draft; only a draft whose packet carries the marker has any. */
export function storedPdfExcerpts(semantic: Readonly<Record<string, unknown>>): readonly PdfExcerpt[] {
  const marked = (semantic.sourceEvidence as { pdfExcerpts?: unknown } | undefined)?.pdfExcerpts === true;
  return marked && Array.isArray(semantic.pdfExcerpts) ? semantic.pdfExcerpts as PdfExcerpt[] : [];
}
