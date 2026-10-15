import type { Total } from '../../../../contracts/analysis/metric-scope-output.generated.js';
import { CAPTURED_PROVIDER_NAMES, FORBIDDEN_PROVIDER_NAMES } from '../reader-report/lint.js';
import { balancedOpenings, lintVisibleReportText } from '../report-visible-text-lint.js';

export type MarketBusinessGateResult = { rule: string; ok: boolean; detail: string };
export type PartialRowTotal = { readonly measure: 'revenue' | 'units'; readonly value: string };
export type MarketBusinessGateOptions = { presentation?: boolean; partialTotals?: readonly PartialRowTotal[] };
type TotalsSource = { readonly scopes: readonly {
  readonly key: string; readonly revenue: Total; readonly units: Total;
  readonly groups: readonly { readonly revenue: Total; readonly units: Total }[];
  readonly withoutTopShop: { readonly revenue: Total } | null;
}[] };

/**
 * Row sums with a missing member. One missing member makes a total
 * undetermined, so such a sum may not be stated as a figure in the report,
 * whatever label surrounds it ("trong mẫu", "cả tập kết quả", ...).
 *
 * The gate matches by value, so a value the report also states in prose as a
 * complete figure is left out: the ALL scope revenue and units (M03 summary,
 * demand finding, capture fallback), a sensitivity revenue (M04 line per
 * scope) with no missing member, or a verified page figure passed in `stated`.
 * WIDE/CORE scope and group totals are only rendered in row tables, which the
 * gate does not read, so they never clear a partial value.
 */
export function partialRowTotals(results: readonly (TotalsSource | null | undefined)[], stated: readonly PartialRowTotal[] = []): PartialRowTotal[] {
  const key = (measure: PartialRowTotal['measure'], value: string): string => `${measure}:${BigInt(value)}`;
  const found = new Map<string, PartialRowTotal>();
  const complete = new Set(stated.filter(figure => /^\d+$/u.test(figure.value)).map(figure => key(figure.measure, figure.value)));
  const add = (measure: PartialRowTotal['measure'], total: Total, statedWhenComplete = false): void => {
    if (total.value === null || !/^\d+$/u.test(total.value) || BigInt(total.value) === 0n) return;
    if (total.missingCount > 0) found.set(key(measure, total.value), { measure, value: total.value });
    else if (statedWhenComplete) complete.add(key(measure, total.value));
  };
  for (const result of results) {
    for (const scope of result?.scopes ?? []) {
      add('revenue', scope.revenue, scope.key === 'all');
      add('units', scope.units, scope.key === 'all');
      for (const group of scope.groups) { add('revenue', group.revenue); add('units', group.units); }
      if (scope.withoutTopShop) add('revenue', scope.withoutTopShop.revenue, true);
    }
  }
  return [...found].filter(([value]) => !complete.has(value)).map(([, total]) => total);
}

const MARKET_SECTION_IDS = Array.from({ length: 13 }, (_, index) => `M${String(index + 1).padStart(2, '0')}`);

// This is intentionally an explicit list. Do not replace it with a fuzzy
// cross-platform or arithmetic heuristic: separate platform text is allowed.
const CROSS_PLATFORM_TOTAL_PHRASES: readonly string[] = [
  'tổng hai sàn',
  'cộng hai sàn',
  'tổng cộng hai nền tảng',
  'Shopee + TikTok',
  'Shopee + TikTok Shop',
  'gộp Shopee và TikTok',
  'gộp Shopee và TikTok Shop',
  'gộp TikTok và Shopee',
  'gộp TikTok Shop và Shopee',
  'cộng Shopee và TikTok',
  'cộng Shopee và TikTok Shop',
  'cộng TikTok và Shopee',
  'cộng TikTok Shop và Shopee',
];

const PROPOSAL_TERMS = /(?:phương án|lựa chọn|(?<![\p{L}\p{N}_])option(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])proposal(?![\p{L}\p{N}_])|(?<![\p{L}\p{N}_])action_option(?![\p{L}\p{N}_]))/iu;
const E2_ALWAYS_TERMS = /(?:Thứ tự theo doanh thu|(?<![\p{L}\p{N}_])top\s*3(?![\p{L}\p{N}_]))/giu;
const E2_NEGATABLE_TERMS = /(?:xếp hạng|thị phần)/giu;
const COMMON_WORD_PROVIDERS = new Set(['Metric']);
const MODEL_ID =/\b(?:gpt|claude)-[A-Za-z0-9][A-Za-z0-9._-]*\b/giu;
const TAG_NAME = /^<\/?([\w:-]+)/u;
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const BLOCK_TAGS = new Set(['address', 'article', 'aside', 'blockquote', 'caption', 'div', 'dl', 'dt', 'dd', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'p', 'pre', 'section', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul']);
const HIDDEN_CONTAINER_TAGS = new Set(['script', 'style', 'noscript', 'template']);
const INLINE_TAGS = new Set(['a', 'abbr', 'b', 'bdi', 'bdo', 'cite', 'code', 'del', 'dfn', 'em', 'i', 'ins', 'kbd', 'mark', 'q', 's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'time', 'u', 'var']);

type Frame = { tag: string; hidden: boolean; quote: boolean; heading: boolean; sectionId: string | null };
type Scan = { visible: string; authored: string; sections: Map<string, string>; sectionCounts: Map<string, number> };

function decodeHtml(value: string): string {
  const named: Record<string, string> = { amp: '&', apos: "'", gt: '>', lt: '<', nbsp: ' ', quot: '"' };
  return value.replace(/&#x([\da-f]+);?|&#(\d+);?|&([a-z]+);/giu, (all, hex?: string, dec?: string, name?: string) => {
    const code = hex ? parseInt(hex, 16) : dec ? Number(dec) : NaN;
    if (Number.isFinite(code)) return code <= 0x10ffff ? String.fromCodePoint(code) : all;
    return named[(name ?? '').toLowerCase()] ?? all;
  });
}

function attributes(tag: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of tag.matchAll(/\s([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/gu)) {
    out.set((match[1] ?? '').toLowerCase(), decodeHtml(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return out;
}

function appendBoundary(parts: string[]): void {
  if (parts.length && parts.at(-1) !== '\n') parts.push('\n');
}

function appendText(parts: string[], value: string, boundary = false): void {
  if (!value) return;
  if (boundary) appendBoundary(parts);
  parts.push(value);
}

function scanHtml(html: string): Scan {
  const stack: Frame[] = [];
  const visible: string[] = [];
  const authored: string[] = [];
  const sections = new Map<string, string[]>();
  const sectionCounts = new Map(MARKET_SECTION_IDS.map(id => [id, 0]));
  const addBoundary = (): void => {
    appendBoundary(visible);
    appendBoundary(authored);
    for (const parts of sections.values()) appendBoundary(parts);
  };
  const addText = (value: string, frame: Frame | undefined, boundary = false): void => {
    if (!value || frame?.hidden) return;
    const text = decodeHtml(value);
    if (!text) return;
    const sectionId = [...stack].reverse().find(item => item.sectionId !== null)?.sectionId ?? frame?.sectionId ?? null;
    appendText(visible, text, boundary);
    if (!stack.some(item => item.quote || item.heading)) appendText(authored, text, boundary);
    if (sectionId) {
      const parts = sections.get(sectionId) ?? [];
      appendText(parts, text, boundary);
      sections.set(sectionId, parts);
    }
  };

  const tokens = [...html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+/gu)].map(token => token[0] ?? '');
  const balanced = balancedOpenings(tokens);
  for (const [tokenIndex, value] of tokens.entries()) {
    if (value.startsWith('<!--') || value.startsWith('<!')) continue;
    if (!value.startsWith('<')) {
      if (!stack.some(frame => HIDDEN_CONTAINER_TAGS.has(frame.tag))) addText(value, stack.at(-1));
      continue;
    }
    const name = TAG_NAME.exec(value)?.[1]?.toLowerCase();
    if (!name) continue;
    const closing = /^<\//u.test(value);
    if (stack.some(frame => HIDDEN_CONTAINER_TAGS.has(frame.tag))) {
      if (closing) {
        const index = stack.map(frame => frame.tag).lastIndexOf(name);
        if (index >= 0 && HIDDEN_CONTAINER_TAGS.has(name)) stack.splice(index);
      }
      continue;
    }
    if (closing) {
      if (BLOCK_TAGS.has(name)) addBoundary();
      const index = stack.map(frame => frame.tag).lastIndexOf(name);
      if (index >= 0) stack.splice(index);
      continue;
    }
    const attrs = attributes(value);
    const parentHidden = stack.some(frame => frame.hidden);
    const hidden = parentHidden || HIDDEN_CONTAINER_TAGS.has(name) || attrs.has('hidden') ||
      /^(?:true|1|hidden)$/iu.test(attrs.get('aria-hidden') ?? '') ||
      /(?:^|[;\s])(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:[;\s]|$)/iu.test(attrs.get('style') ?? '');
    if (BLOCK_TAGS.has(name) || name === 'br') addBoundary();
    const ownSectionId = name === 'section' && /^M(?:0[1-9]|1[0-3])$/u.test(attrs.get('id') ?? '') ? attrs.get('id')!.toUpperCase() : null;
    if (ownSectionId) sectionCounts.set(ownSectionId, (sectionCounts.get(ownSectionId) ?? 0) + 1);
    const frame: Frame = { tag: name, hidden,
      quote: stack.some(item => item.quote) || (balanced.has(tokenIndex) && (name === 'q' || name === 'blockquote' || attrs.has('data-quote'))),
      heading: stack.some(item => item.heading) || /^h[1-6]$/u.test(name),
      sectionId: ownSectionId ?? [...stack].reverse().find(item => item.sectionId !== null)?.sectionId ?? null };
    if (!hidden) {
      for (const attr of ['title', 'alt', 'aria-label']) {
        const text = attrs.get(attr);
        if (text) addText(text, frame, true);
      }
    }
    if (!VOID_TAGS.has(name) && !/\/\s*>$/u.test(value)) stack.push(frame);
  }
  return { visible: visible.join(''), authored: authored.join(''), sections: new Map([...sections].map(([id, parts]) => [id, parts.join('')])), sectionCounts };
}

function snippets(values: Iterable<string>): string {
  const unique = [...new Set([...values].map(value => value.replace(/\s+/gu, ' ').trim().slice(0, 160)).filter(Boolean))].slice(0, 3);
  return unique.length ? unique.map(value => `snippet:${value}`).join(' | ') : 'clean';
}

function matches(text: string, pattern: RegExp): string[] {
  pattern.lastIndex = 0;
  return [...text.matchAll(pattern)].map(match => match[0] ?? '');
}

// A contrast word starts a new clause: a negation before it never governs a term after it.
const CLAUSE_BREAK = /[.;:!?…\n]|(?<![\p{L}\p{N}_])(?:nhưng|tuy nhiên|tuy vậy|song|mặc dù|vẫn|but|however)(?![\p{L}\p{N}_])/giu;
const NEGATION = /(?<![\p{L}\p{N}_])(?:không|chưa|chẳng)(?![\p{L}\p{N}_])/giu;
const DIRECT_NEGATED_RANKING = /^(?:phải\s*)?(?:bảng\s*)?$/iu;
const NEGATED_LIST_VERB = /(?:^|,|(?<![\p{L}\p{N}_])(?:hay|hoặc)(?![\p{L}\p{N}_]))\s*(?:so sánh|cộng|tính|chấm điểm)\s*(?:,|(?<![\p{L}\p{N}_])(?:hay|hoặc)(?![\p{L}\p{N}_]))?$/iu;
const NEGATED_VERB_OBJECT_LIST = /^(?:tính|so sánh|cộng|chấm điểm)\s+[^.;:!?…\d]{1,50}\s(?:(?:hay|hoặc))(?![\p{L}\p{N}_])$/iu;
const NEGATED_INFERENCE = /^suy\s+ra(?:\s+[^.;:!?…\n]{1,60}(?<![\p{L}\p{N}_])(?:hay|hoặc)(?![\p{L}\p{N}_]))?\s*$/iu;
const NEGATED_ABSENCE = /^(?:cung cấp|xác lập)(?:\s*$|\s+[^.;:!?…]{0,80}(?<![\p{L}\p{N}_])(?:hay|hoặc)(?![\p{L}\p{N}_])\s*$)/iu;

// The text after an exempted ranking/share noun must remain a noun phrase or
// the known continuation of the closed disclaimer list. A free-form tail is
// deliberately rejected: it may be a predicate even when its vocabulary is
// not in a finite affirmative-word list (for example, "cao hơn B").
const PLAIN_NOUN_TAIL = /^\s*(?:(?:(?:hay|hoặc)\s+)?(?:toàn\s+thị\s+trường|mức\s+cạnh\s+tranh(?:\s+của\s+toàn\s+thị\s+trường)?|mức\s+ưu\s+tiên|năng\s+lực|chào\s+bán)|(?:hay|hoặc)\s+của\s+(?:[\p{Lu}\p{Lt}\p{N}][\p{L}\p{N}._-]*(?:\s+[\p{Lu}\p{Lt}\p{N}][\p{L}\p{N}._-]*){0,3})|của\s+(?:[\p{Lu}\p{Lt}\p{N}][\p{L}\p{N}._-]*(?:\s+[\p{Lu}\p{Lt}\p{N}][\p{L}\p{N}._-]*){0,3}))?\s*$/u;
const CLOSED_LIST_TAIL = /^\s*(?:(?:hay|hoặc)\s+(?:tính\s+thị\s+phần|khuyến nghị)|,\s*chấm điểm(?:,\s*tính\s+chênh lệch\s+hay\s+(?:tỷ lệ|thị phần))?|và\s+chưa\s+có\s+kết\s+luận\s+chính)\s*$/iu;

function safeNegatedTail(after: string): boolean {
  return PLAIN_NOUN_TAIL.test(after) || CLOSED_LIST_TAIL.test(after);
}

function clauseAround(text: string, start: number, end: number): { before: string; after: string } {
  let from = 0;
  CLAUSE_BREAK.lastIndex = 0;
  for (const match of text.slice(0, start).matchAll(CLAUSE_BREAK)) from = (match.index ?? 0) + match[0].length;
  CLAUSE_BREAK.lastIndex = 0;
  const rest = text.slice(end);
  const next = CLAUSE_BREAK.exec(rest);
  CLAUSE_BREAK.lastIndex = 0;
  return { before: text.slice(from, start), after: rest.slice(0, next ? next.index : undefined) };
}

/** The term is negated only when a negation in its own clause governs it directly
 * ("không phải xếp hạng") or through a closed list ("không so sánh, xếp hạng hay …"). */
function e2Negated(text: string, start: number, end: number, term: string): boolean {
  const { before, after } = clauseAround(text, start, end);
  const negations = [...before.matchAll(NEGATION)];
  const last = negations.at(-1);
  if (!last) return false;
  const span = before.slice((last.index ?? 0) + last[0].length).trim().replace(/\s+/gu, ' ');
  if (span.length > 60) return false;
  return (DIRECT_NEGATED_RANKING.test(span) && safeNegatedTail(after)) ||
    (NEGATED_LIST_VERB.test(span) && safeNegatedTail(after)) ||
    (NEGATED_VERB_OBJECT_LIST.test(span) && safeNegatedTail(after)) ||
    (after.trim().length === 0 && NEGATED_INFERENCE.test(span)) ||
    (term.toLowerCase() === 'thị phần' && NEGATED_ABSENCE.test(span) && safeNegatedTail(after));
}

function e2Matches(text: string): string[] {
  const hits = matches(text, E2_ALWAYS_TERMS);
  for (const match of text.matchAll(E2_NEGATABLE_TERMS)) {
    const index = match.index ?? 0;
    if (!e2Negated(text, index, index + match[0].length, match[0] ?? '')) hits.push(match[0] ?? '');
  }
  return hits;
}

function providerMatches(text: string): string[] {
  const names = [...new Set([...FORBIDDEN_PROVIDER_NAMES, ...CAPTURED_PROVIDER_NAMES, 'Jev', 'TypeSafe', 'CLIProxy', 'OpenAI', 'Anthropic', 'GLM'])];
  const found = names.flatMap(name => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    // A brand that is also a common lowercase word matches only as written or in capitals,
    // so a method identifier such as "metric-scope-v1" is not a provider name.
    const pattern = COMMON_WORD_PROVIDERS.has(name) ? `(?:${escaped}|${escaped.toUpperCase()})` : escaped;
    return matches(text, new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, COMMON_WORD_PROVIDERS.has(name) ? 'gu' : 'giu'));
  });
  return [...found, ...matches(text, MODEL_ID)];
}

function privateIpv4Matches(value: string): string[] {
  return [...value.matchAll(/\b(?:\d{1,3}\.){3}\d{1,3}\b/gu)].map(match => match[0]!).filter(ip => {
    const octets = ip.split('.').map(Number);
    return octets.every(octet => octet <= 255) && (octets[0] === 10 || octets[0] === 192 && octets[1] === 168 || octets[0] === 172 && octets[1]! >= 16 && octets[1]! <= 31);
  });
}

function noLeakMatches(html: string, scan: Scan): string[] {
  const decodedAttributes = [...html.matchAll(/<[^>]*>/gu)].flatMap(match => [...attributes(match[0]!).values()]);
  const values = [html, decodeHtml(html), scan.visible, ...decodedAttributes];
  return values.flatMap(value => [
    ...matches(value, /[A-Za-z]:\\[^\s<>"']*/gu),
    ...matches(value, /\/(?:home|Users)\/[^\s<>"']*/giu),
    ...matches(value, /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu),
    ...matches(value, /\bBearer\s+[^\s<>"']+/giu),
    ...matches(value, /\bsk-[A-Za-z0-9][A-Za-z0-9_-]{5,}/gu),
    ...privateIpv4Matches(value),
  ]);
}

function isQuoteOpeningToken(token: string): boolean {
  return /^<(?:q|blockquote)\b/iu.test(token) || /\bdata-quote(?:\s|=|>)/iu.test(token);
}

function hasUnbalancedQuoteOpenings(html: string): boolean {
  const tokenMatches = [...html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/gu)];
  const tokens = tokenMatches.map(match => match[0] ?? '');
  const balanced = balancedOpenings(tokens);
  return tokenMatches.some((match, index) => isQuoteOpeningToken(match[0] ?? '') && !balanced.has(index));
}

function balancedQuoteTagOffsets(html: string): Set<number> {
  const tokenMatches = [...html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/gu)];
  const tokens = tokenMatches.map(match => match[0] ?? '');
  const balanced = balancedOpenings(tokens);
  return new Set(tokenMatches.flatMap((match, index) => {
    const token = match[0] ?? '';
    return isQuoteOpeningToken(token)
      ? (balanced.has(index) ? [match.index ?? -1] : [])
      : [];
  }));
}

/** Drops plain inline tags so split words join, but keeps balanced plain q and
 * data-quote/data-classified elements with their own closing tags. */
function normalizeInlineTagsForLint(html: string): string {
  if (hasUnbalancedQuoteOpenings(html)) return html;
  const balancedQuotes = balancedQuoteTagOffsets(html);
  const open = new Map<string, boolean[]>();
  return html.replace(/<!--[\s\S]*?-->|<[^>]*>/gu, (token, offset: number) => {
    const name = TAG_NAME.exec(token)?.[1]?.toLowerCase();
    if (!name || !INLINE_TAGS.has(name)) return token;
    const stack = open.get(name) ?? [];
    open.set(name, stack);
    if (/^<\//u.test(token)) return stack.pop() ? token : '';
    const keep = name === 'q' || /\bdata-quote\b/iu.test(token)
      ? balancedQuotes.has(offset)
      : /\bdata-classified\b/iu.test(token);
    if (!/\/\s*>$/u.test(token)) stack.push(keep);
    return keep ? token : '';
  });
}

/** Text of each statement block (paragraph, list item, description). Row tables
 * inside them are dropped: a table cell states one row's own value, not a total. */
function statementTexts(html: string): string[] {
  const body = html.replace(/<!--[\s\S]*?-->|<(script|style|template)\b[\s\S]*?<\/\1\s*>/giu, ' ');
  return [...body.matchAll(/<(p|li|dd)\b[^>]*>([\s\S]*?)<\/\1\s*>/giu)]
    .map(match => decodeHtml((match[2] ?? '').replace(/<table\b[\s\S]*?<\/table\s*>/giu, ' ').replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim());
}

/** A VND figure whose nearest measure word since the previous number is a price
 * ("giá niêm yết", "mức giá"; not "giá trị", "đánh giá") is a unit price. */
function unitPriceFigure(before: string): boolean {
  const words = [...before.replace(/^[\s\S]*\d/u, '').matchAll(/(?<![\p{L}\p{N}])(?:(?<!đánh\s)giá(?!\s*trị)|doanh thu|doanh số|tổng)(?!\p{L})/giu)];
  return /^giá$/iu.test(words.at(-1)?.[0] ?? '');
}

/** Statements that print a known partial row sum as revenue (VND) or as units. */
function partialTotalMatches(html: string, totals: readonly PartialRowTotal[]): string[] {
  if (!totals.length) return [];
  const texts = statementTexts(html).map(text => text.normalize('NFC'));
  return totals.flatMap(total => {
    const shown = BigInt(total.value).toLocaleString('vi-VN').replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const value = `(?<![\\d.,])${shown}(?![\\d]|[.,]\\d)`;
    if (total.measure === 'revenue') {
      const pattern = new RegExp(`${value}\\s*VND`, 'giu');
      return texts.filter(text => [...text.matchAll(pattern)].some(match => !unitPriceFigure(text.slice(0, match.index))));
    }
    const pattern = new RegExp(`(?:(?:sản lượng|đơn vị bán)[^.;:\\d]{0,40}:\\s*${value}|${value}\\s+đơn vị)`, 'iu');
    return texts.filter(text => pattern.test(text));
  });
}

const SEARCH_INTEREST_TERM = /(?<![\p{L}\p{N}_])(?:mức\s+quan\s+tâm\s+tìm\s+kiếm|chỉ\s+số\s+tìm\s+kiếm|chỉ\s+số\s+quan\s+tâm)(?![\p{L}\p{N}_])/giu;
const SEARCH_COUNT_PHRASE = /(?<![\p{L}\p{N}_])(?:lượt|lần)\s+tìm\s+kiếm(?![\p{L}\p{N}_])/giu;
const SALES_MEASURE_TERM = /(?<![\p{L}\p{N}_])(?:doanh\s+thu|doanh\s+số|đơn\s+vị\s+bán|số\s+bán|sản\s+lượng)(?![\p{L}\p{N}_])/giu;
const COMBINE_TERM = /(?<![\p{L}\p{N}_])(?:tổng|cộng|gộp|tỷ\s+lệ|chia|nhân)(?![\p{L}\p{N}_])|[÷×+]/giu;

/** Once the report shows the search-interest index, no statement may call it a number of searches
 * or add, divide or multiply it with a sales measure; a negation in the same clause allows the disclaimer. */
function searchInterestMisuse(html: string, scan: Scan): string[] {
  if (!matches(scan.visible, SEARCH_INTEREST_TERM).length) return [];
  return statementTexts(html).map(text => text.normalize('NFC')).flatMap(text => text.split(CLAUSE_BREAK).filter(clause => {
    const unnegated = (pattern: RegExp): boolean => [...clause.matchAll(pattern)].some(hit => !matches(clause.slice(0, hit.index ?? 0), NEGATION).length);
    return unnegated(SEARCH_COUNT_PHRASE) || matches(clause, SEARCH_INTEREST_TERM).length > 0 && matches(clause, SALES_MEASURE_TERM).length > 0 && unnegated(COMBINE_TERM);
  }));
}

const WORLD_BANK_TERM = /(?<![\p{L}\p{N}_])(?:bối\s+cảnh\s+vĩ\s+mô|số\s+liệu\s+cả\s+nước|dân\s+số\s+cả\s+nước|chi\s+tiêu\s+tiêu\s+dùng\s+hộ\s+gia\s+đình)(?![\p{L}\p{N}_])/giu;

/** Once the report shows country-level figures, no statement may add, divide or multiply them with a sales measure;
 * a negation in the same clause allows the disclaimer. The check exists only when the block is drawn, so other reports keep their rule list. */
function worldBankMisuse(html: string, scan: Scan): string[] | null {
  if (!matches(scan.visible, WORLD_BANK_TERM).length) return null;
  return statementTexts(html).map(text => text.normalize('NFC')).flatMap(text => text.split(CLAUSE_BREAK).filter(clause =>
    matches(clause, WORLD_BANK_TERM).length > 0 && matches(clause, SALES_MEASURE_TERM).length > 0
    && [...clause.matchAll(COMBINE_TERM)].some(hit => !matches(clause.slice(0, hit.index ?? 0), NEGATION).length)));
}

function result(rule: string, ok: boolean, detail: string): MarketBusinessGateResult { return { rule, ok, detail }; }

export function auditMarketReportHtml(html: string, options: MarketBusinessGateOptions = {}): MarketBusinessGateResult[] {
  const presentation = options.presentation ?? true;
  const scan = scanHtml(html);
  const provider = providerMatches(scan.visible);
  const crossPlatform = CROSS_PLATFORM_TOTAL_PHRASES.flatMap(phrase => matches(scan.visible, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'giu')));
  const e2 = e2Matches(scan.authored);
  const missingOrDuplicate = MARKET_SECTION_IDS.filter(id => scan.sectionCounts.get(id) !== 1).map(id => `${id}=${scan.sectionCounts.get(id)}`);
  const m12 = scan.sections.get('M12') ?? '';
  const m12Proposal = PROPOSAL_TERMS.test(m12);
  const m12Label = /đề xuất/iu.test(m12);
  const leaks = noLeakMatches(html, scan);
  const partial = partialTotalMatches(html, options.partialTotals ?? []);
  const interestMisuse = searchInterestMisuse(html, scan);
  const macroMisuse = worldBankMisuse(html, scan);
  const u13 = lintVisibleReportText(normalizeInlineTagsForLint(html));
  const content = [
    result('G08_PROVIDER_NAME', provider.length === 0, snippets(provider)),
    result('U32_NO_CROSS_PLATFORM_TOTAL', crossPlatform.length === 0, snippets(crossPlatform)),
    result('E2_NO_REVENUE_ORDER', e2.length === 0, snippets(e2)),
    result('PARTIAL_TOTAL_FORBIDDEN', partial.length === 0, snippets(partial)),
    result('NO_LEAK', leaks.length === 0, snippets(leaks)),
    result('SEARCH_INTEREST_NOT_COUNT', interestMisuse.length === 0, snippets(interestMisuse)),
    ...(macroMisuse ? [result('WORLD_BANK_NOT_ARITHMETIC', macroMisuse.length === 0, snippets(macroMisuse))] : []),
    ...u13.map(check => result(check.rule, check.ok, check.ok ? 'clean' : snippets([check.detail]))),
  ];
  if (!presentation) return content;
  return [
    ...content.slice(0, 3),
    result('SECTIONS_PRESENT', missingOrDuplicate.length === 0, snippets(missingOrDuplicate)),
    result('M12_PROPOSAL_LABEL', !m12Proposal || m12Label, m12Proposal ? (m12Label ? 'proposal-label-present' : 'proposal-label-missing') : 'no-proposal-text'),
    ...content.slice(3),
  ];
}

export function assertMarketBusinessGate(html: string, options: MarketBusinessGateOptions = {}): void {
  const failed = auditMarketReportHtml(html, options).filter(check => !check.ok);
  if (failed.length) throw new TypeError(`MARKET_BUSINESS_GATE_FAILED:${failed.map(check => check.rule).join(',')}`);
}
