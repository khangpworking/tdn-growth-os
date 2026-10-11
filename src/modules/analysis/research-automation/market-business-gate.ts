import { CAPTURED_PROVIDER_NAMES, FORBIDDEN_PROVIDER_NAMES } from '../reader-report/lint.js';
import { lintVisibleReportText } from '../report-visible-text-lint.js';

export type MarketBusinessGateResult = { rule: string; ok: boolean; detail: string };

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

const PROPOSAL_TERMS = /(?:phương án|lựa chọn|\boption\b|\bproposal\b|\baction_option\b)/iu;
const E2_ALWAYS_TERMS = /(?:Thứ tự theo doanh thu|\btop\s*3\b)/giu;
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

  for (const token of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+/gu)) {
    const value = token[0] ?? '';
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
      quote: stack.some(item => item.quote) || name === 'q' || name === 'blockquote' || attrs.has('data-quote'),
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
const LIST_CLOSER = /(?<![\p{L}\p{N}_])(?:hay|hoặc)(?![\p{L}\p{N}_])/iu;

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
function e2Negated(text: string, start: number, end: number): boolean {
  const { before, after } = clauseAround(text, start, end);
  const negations = [...before.matchAll(NEGATION)];
  const last = negations.at(-1);
  if (!last) return false;
  const span = before.slice((last.index ?? 0) + last[0].length);
  if (span.length > 60) return false;
  if (!span.includes(',')) return true;
  return LIST_CLOSER.test(span.slice(span.lastIndexOf(',') + 1)) || LIST_CLOSER.test(after);
}

function e2Matches(text: string): string[] {
  const hits = matches(text, E2_ALWAYS_TERMS);
  for (const match of text.matchAll(E2_NEGATABLE_TERMS)) {
    const index = match.index ?? 0;
    if (!e2Negated(text, index, index + match[0].length)) hits.push(match[0] ?? '');
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

/** Drops plain inline tags so split words join, but keeps a data-quote/data-classified
 * element together with its own closing tag, so the quoted span ends where it ends. */
function normalizeInlineTagsForLint(html: string): string {
  const open = new Map<string, boolean[]>();
  return html.replace(/<!--[\s\S]*?-->|<[^>]*>/gu, token => {
    const name = TAG_NAME.exec(token)?.[1]?.toLowerCase();
    if (!name || !INLINE_TAGS.has(name)) return token;
    const stack = open.get(name) ?? [];
    open.set(name, stack);
    if (/^<\//u.test(token)) return stack.pop() ? token : '';
    const keep = /\bdata-(?:classified|quote)\b/iu.test(token);
    if (!/\/\s*>$/u.test(token)) stack.push(keep);
    return keep ? token : '';
  });
}

function result(rule: string, ok: boolean, detail: string): MarketBusinessGateResult { return { rule, ok, detail }; }

export function auditMarketReportHtml(html: string, options: { presentation?: boolean } = {}): MarketBusinessGateResult[] {
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
  const u13 = lintVisibleReportText(normalizeInlineTagsForLint(html));
  const content = [
    result('G08_PROVIDER_NAME', provider.length === 0, snippets(provider)),
    result('U32_NO_CROSS_PLATFORM_TOTAL', crossPlatform.length === 0, snippets(crossPlatform)),
    result('E2_NO_REVENUE_ORDER', e2.length === 0, snippets(e2)),
    result('NO_LEAK', leaks.length === 0, snippets(leaks)),
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

export function assertMarketBusinessGate(html: string, options: { presentation?: boolean } = {}): void {
  const failed = auditMarketReportHtml(html, options).filter(check => !check.ok);
  if (failed.length) throw new TypeError(`MARKET_BUSINESS_GATE_FAILED:${failed.map(check => check.rule).join(',')}`);
}
