// Owner rule R-L01: a report never names a data provider, tool, AI/search service or the public-review collector.
// This module owns that list and how each kind of text is matched. Pure: no I/O, no clock, no imports.

export type HiddenNameGroup = 'DATA' | 'TOOL' | 'AI_SEARCH' | 'PUBLIC_REVIEW';
/** READER: text a reader sees. CITATION: citation label, quote, locator, displayed URL.
 * COPIED: text copied from a web page, search result, PDF or review. TRACE: technical trace files (names allowed). */
export type TextAudience = 'READER' | 'CITATION' | 'COPIED' | 'TRACE';
export interface HiddenName { readonly name: string; readonly group: HiddenNameGroup }
export interface HiddenNameHit { readonly name: string; readonly group: HiddenNameGroup | 'MODEL_ID'; readonly match: string }

const GROUPS: readonly (readonly [HiddenNameGroup, readonly string[]])[] = [
  ['DATA', ['Metric', 'Kalodata', 'TradeInt', 'Dami']],
  ['TOOL', ['SerpApi', 'Apify', 'PageIndex', 'Agent-Reach', 'OpenCLI', 'zen-studio']],
  ['AI_SEARCH', ['Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM', 'Gemini', 'Google', 'Nemotron', 'NVIDIA']],
  // Same strings as PUBLIC_REVIEW_FORBIDDEN_NAMES in research-automation/public-review-report.ts.
  ['PUBLIC_REVIEW', ['CloakBrowser', 'Cloak Browser', 'cloak-browser', 'cloak_browser', 'ShopeePublicReviewCollector', 'shopee-public-review']],
];

/** Ordered table: groups DATA, TOOL, AI_SEARCH, PUBLIC_REVIEW; names in listed order. */
export const HIDDEN_NAMES: readonly HiddenName[] = Object.freeze(GROUPS.flatMap(([group, names]) => names.map(name => Object.freeze({ name, group }))));

const MODEL_ID_NAME = 'MODEL_ID';
const escape = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

// READER: whole word with Unicode edges. "Metric" is also a common word, so only "Metric" or "METRIC" match (owner Q2).
const readerPattern = (name: string): RegExp => name === 'Metric'
  ? new RegExp(`(?<![\\p{L}\\p{N}_])(?:${escape(name)}|${escape(name.toUpperCase())})(?![\\p{L}\\p{N}_])`, 'gu')
  : new RegExp(`(?<![\\p{L}\\p{N}_])${escape(name)}(?![\\p{L}\\p{N}_])`, 'giu');
const READER_MODEL_ID = /\b(?:gpt|claude)-[A-Za-z0-9][A-Za-z0-9._-]*\b/giu;

// CITATION: AI/search names are short and sit inside random ids ("glm" in a hash), so they match as whole words;
// every other name matches anywhere, case-insensitive.
const citationPattern = (entry: HiddenName): RegExp => entry.group === 'AI_SEARCH'
  ? new RegExp(`(?<![\\p{L}\\p{N}_])${escape(entry.name)}(?![\\p{L}\\p{N}_])`, 'giu')
  : new RegExp(escape(entry.name), 'giu');

// COPIED: any run of non-letters/digits may sit between the letters; "Google" also matches as a prefix (googleplay).
const copiedPattern = (name: string): RegExp => {
  const letters = [...name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')].map(escape).join('[^\\p{L}\\p{N}]*');
  return new RegExp(`(?<![\\p{L}\\p{N}])${letters}${name === 'Google' ? '' : '(?![\\p{L}\\p{N}])'}`, 'giu');
};
const COPIED_MODEL_ID = /(?<![\p{L}\p{N}])(?:gpt|claude)\s*-\s*[\p{L}\p{N}][\p{L}\p{N}._-]*/giu;

interface Table { readonly names: readonly (readonly [HiddenName, RegExp])[]; readonly model: RegExp }
const TABLES: Readonly<Record<'READER' | 'CITATION' | 'COPIED', Table>> = {
  READER: { names: HIDDEN_NAMES.map(entry => [entry, readerPattern(entry.name)] as const), model: READER_MODEL_ID },
  CITATION: { names: HIDDEN_NAMES.map(entry => [entry, citationPattern(entry)] as const), model: READER_MODEL_ID },
  COPIED: { names: HIDDEN_NAMES.map(entry => [entry, copiedPattern(entry.name)] as const), model: COPIED_MODEL_ID },
};

interface Span { readonly hit: HiddenNameHit; readonly start: number; readonly end: number }
function spans(text: string, table: Table): Span[] {
  const found: Span[] = [];
  const add = (name: string, group: HiddenNameHit['group'], pattern: RegExp): void => {
    for (const m of text.matchAll(pattern)) {
      if (m[0].length === 0) continue;
      found.push({ hit: { name, group, match: m[0] }, start: m.index, end: m.index + m[0].length });
    }
  };
  for (const [entry, pattern] of table.names) add(entry.name, entry.group, pattern);
  add(MODEL_ID_NAME, 'MODEL_ID', table.model);
  return found;
}

/** Numeric character references (&#100; &#x64;) decoded the way citation-registry.ts does. */
function decodeNumericReferences(text: string): string {
  return text.replace(/&#x([0-9a-f]+);?|&#(\d+);?/gi, (all, hex: string | undefined, dec: string | undefined) => {
    const n = parseInt(hex ?? dec ?? '', hex ? 16 : 10);
    return n <= 0x10ffff ? String.fromCodePoint(n) : all;
  });
}

function copiedForms(text: string): string[] {
  let decoded = text;
  try { decoded = decodeURIComponent(text); } catch { /* keep the raw text */ }
  return [text.normalize('NFKC'), decoded.normalize('NFKC')];
}

function located(text: string, audience: TextAudience): Span[] {
  if (typeof text !== 'string' || text === '' || audience === 'TRACE') return [];
  if (audience === 'READER') return spans(text, TABLES.READER);
  if (audience === 'CITATION') return spans(decodeNumericReferences(text), TABLES.CITATION);
  if (audience === 'COPIED') {
    for (const form of copiedForms(text)) {
      const found = spans(form, TABLES.COPIED);
      if (found.length > 0) return found;
    }
  }
  return [];
}

/** Every hidden name in `text` for this audience: table order, then model ids; within one name, text order. */
export function findHiddenNames(text: string, audience: TextAudience): readonly HiddenNameHit[] {
  try { return located(text, audience).map(span => span.hit); } catch { return []; }
}

export function hasHiddenName(text: string, audience: TextAudience): boolean {
  return findHiddenNames(text, audience).length > 0;
}

/** Replaces every hit with `replacement` (default '[…]'); every other character unchanged. For CITATION the decoded
 * text is masked and returned. Overlapping hits: the longest leftmost one wins. */
export function maskHiddenNames(text: string, audience: 'READER' | 'CITATION', replacement = '[…]'): string {
  if (typeof text !== 'string' || text === '') return text;
  const base = audience === 'CITATION' ? decodeNumericReferences(text) : text;
  let found: Span[];
  try { found = located(text, audience); } catch { return base; }
  const ordered = [...found].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  let out = '';
  let cursor = 0;
  for (const span of ordered) {
    if (span.start < cursor) continue;
    out += base.slice(cursor, span.start) + replacement;
    cursor = span.end;
  }
  return out + base.slice(cursor);
}
