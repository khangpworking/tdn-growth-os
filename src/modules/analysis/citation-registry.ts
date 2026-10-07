import { createHash } from 'node:crypto';
import { canonicalJson } from '../foundation/canonical-json.js';
import { normalizeReportCitationLocator, type ReportCitationLocator } from './report-citations.js';
import { FORBIDDEN_PROVIDER_NAMES } from './reader-report/lint.js';

/**
 * Shared [n] numbering for report citations. Pure and deterministic: numbers
 * follow the first cite() call, identity is the source plus its normalized
 * locator, and a source without lineage never gets a number. Provider and
 * package identity live only in technicalTrace(), never in reader text.
 */

export type CitationSourceKind = 'CAPTURE' | 'METRIC_ROW' | 'REVIEW' | 'WEB_RESULT' | 'PDF_PAGE' | 'UPSTREAM_CLAIM';
export type QuoteVerification = 'NOT_APPLICABLE' | 'APP_VERIFIED' | 'UNVERIFIED' | 'EXTERNAL_VERIFIER_ATTESTED';

export interface CitationInput {
  readonly sourceKind: CitationSourceKind;
  /** Artifact sha256, canonical URL or upstream claim id. null/blank = no lineage. */
  readonly identity: string | null;
  readonly locator: string | ReportCitationLocator | null;
  /** Plain Vietnamese, shown to the reader. */
  readonly label: string;
  readonly retrievedAt: string | null;
  /** https only, shown as a link without query or fragment. */
  readonly url: string | null;
  readonly quote: string | null;
  readonly quoteVerification: QuoteVerification;
  /** Provider, packageId… goes ONLY to the technical trace. */
  readonly technical?: Readonly<Record<string, string>>;
}

export interface CitationEntry {
  readonly number: number;
  readonly citationId: string;
  readonly sourceKind: CitationSourceKind;
  readonly label: string;
  readonly retrievedAt: string | null;
  readonly url: string | null;
  readonly locatorText: string | null;
  readonly quote: string | null;
  readonly quoteVerification: QuoteVerification;
}

export interface CitationTraceEntry {
  readonly number: number;
  readonly citationId: string;
  readonly identity: string;
  readonly locator: ReportCitationLocator | null;
  readonly technical: Readonly<Record<string, string>>;
}

export interface CitationTrace {
  readonly contractVersion: 'citation-trace-v1';
  readonly entries: readonly CitationTraceEntry[];
}

export type CitationLabelErrorCode = 'PROVIDER_NAME_IN_LABEL' | 'TECHNICAL_ID_IN_LABEL' | 'INVALID_URL' | 'INVALID_INPUT';

export class CitationLabelError extends Error {
  constructor(readonly code: CitationLabelErrorCode) {
    super(code);
    this.name = 'CitationLabelError';
  }
}

const SOURCE_KINDS: ReadonlySet<string> = new Set<CitationSourceKind>(['CAPTURE', 'METRIC_ROW', 'REVIEW', 'WEB_RESULT', 'PDF_PAGE', 'UPSTREAM_CLAIM']);
const VERIFICATIONS: ReadonlySet<string> = new Set<QuoteVerification>(['NOT_APPLICABLE', 'APP_VERIFIED', 'UNVERIFIED', 'EXTERNAL_VERIFIER_ATTESTED']);
const EXTRA_FORBIDDEN_NAMES = ['SerpApi', 'Apify', 'PageIndex', 'Agent-Reach', 'OpenCLI', 'zen-studio'] as const;
/** Lower-cased; matched as a substring of the lower-cased text. */
export const CITATION_FORBIDDEN_NAMES: readonly string[] = [...FORBIDDEN_PROVIDER_NAMES, ...EXTRA_FORBIDDEN_NAMES].map(name => name.toLowerCase());
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

const sha256 = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');

export function containsForbiddenProviderName(text: string): boolean {
  const lower = text.toLowerCase();
  return CITATION_FORBIDDEN_NAMES.some(name => lower.includes(name));
}

/** A digest-like run of 32+ hex characters (sha256, artifact or package ids) is technical identity, never reader text. */
const TECHNICAL_ID = /(?<![0-9a-f])[0-9a-f]{32,}(?![0-9a-f])/i;
export function containsTechnicalId(text: string): boolean {
  return TECHNICAL_ID.test(text);
}

/** Every field a reader sees: label, quote, locator text and the displayed URL. Throws on a provider name or a digest. */
export function assertReaderSafeCitation(entry: Pick<CitationEntry, 'label' | 'quote' | 'locatorText' | 'url'>): void {
  for (const text of [entry.label, entry.quote, entry.locatorText, entry.url]) {
    if (text === null) continue;
    if (containsForbiddenProviderName(text)) throw new CitationLabelError('PROVIDER_NAME_IN_LABEL');
    if (containsTechnicalId(text)) throw new CitationLabelError('TECHNICAL_ID_IN_LABEL');
  }
}

/** https URL for display: no credentials, query string or fragment. */
export function displayCitationUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new CitationLabelError('INVALID_URL'); }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') throw new CitationLabelError('INVALID_URL');
  return `${url.origin}${url.pathname}`;
}

export function citationLocatorText(locator: ReportCitationLocator | null): string | null {
  if (locator === null) return null;
  switch (locator.kind) {
    case 'pdf': return `trang ${locator.page}`;
    case 'xlsx': return `bảng ${locator.sheet}, ô ${locator.cell}`;
    case 'json-pointer': return `mục ${locator.pointer}`;
    case 'source-locator': return locator.value;
  }
}

function normalizeLocator(locator: CitationInput['locator']): ReportCitationLocator | null {
  if (locator === null) return null;
  try { return normalizeReportCitationLocator(locator); } catch { throw new CitationLabelError('INVALID_INPUT'); }
}

export class CitationRegistry {
  readonly #entries: CitationEntry[] = [];
  readonly #trace: CitationTraceEntry[] = [];
  readonly #numberById = new Map<string, number>();

  /** Returns the [n] number for this source, or null when it has no lineage. */
  cite(input: CitationInput): number | null {
    if (input.identity === null || input.identity.trim() === '') return null;
    if (!SOURCE_KINDS.has(input.sourceKind) || !VERIFICATIONS.has(input.quoteVerification)) throw new CitationLabelError('INVALID_INPUT');
    if (typeof input.label !== 'string' || input.label.trim() === '') throw new CitationLabelError('INVALID_INPUT');
    if (input.retrievedAt !== null && (!ISO_DATE.test(input.retrievedAt) || Number.isNaN(Date.parse(input.retrievedAt)))) {
      throw new CitationLabelError('INVALID_INPUT');
    }
    const url = input.url === null ? null : displayCitationUrl(input.url);
    const locator = normalizeLocator(input.locator);
    const locatorText = citationLocatorText(locator);
    assertReaderSafeCitation({ label: input.label, quote: input.quote, locatorText, url });
    const citationId = sha256(canonicalJson({ sourceKind: input.sourceKind, identity: input.identity, locator }));

    const known = this.#numberById.get(citationId);
    if (known !== undefined) return known;
    const number = this.#entries.length + 1;
    this.#numberById.set(citationId, number);
    this.#entries.push(Object.freeze({
      number,
      citationId,
      sourceKind: input.sourceKind,
      label: input.label,
      retrievedAt: input.retrievedAt,
      url,
      locatorText,
      quote: input.quote,
      quoteVerification: input.quoteVerification,
    }));
    this.#trace.push(Object.freeze({
      number,
      citationId,
      identity: input.identity,
      locator,
      technical: Object.freeze({ ...(input.technical ?? {}) }),
    }));
    return number;
  }

  /** Sorted by number, 1..n with no gaps. */
  entries(): readonly CitationEntry[] {
    return [...this.#entries];
  }

  technicalTrace(): CitationTrace {
    return { contractVersion: 'citation-trace-v1', entries: [...this.#trace] };
  }
}
