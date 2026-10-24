/** One idea of hidden and quoted page text for the report wording rules (c2 b5).
 * Hidden text is not read, so it never counts for a wording rule (owner Q3, 24/10/2026);
 * names still count it (R-L01, report-language). Taken from the Market gate's reader:
 * hidden = `hidden` attribute, aria-hidden true|1|hidden, display:none or visibility:hidden,
 * or inside script/style/noscript/template; a quote = q, blockquote or data-quote, only
 * when its own closing tag balances it. The Market gate (U13 and statement rules), the
 * visible-text lint (U13; Market, Insight and auto reports) and the lane statement rules
 * read through it. No method-module imports. */
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const RAW_TEXT_TAGS = new Set(['script', 'style']);
export const HIDDEN_CONTAINER_TAGS: ReadonlySet<string> = new Set(['script', 'style', 'noscript', 'template']);

const decode = (text: string): string => text.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,
  (all, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex || dec) { const n = hex ? parseInt(hex, 16) : Number(dec); return n <= 0x10ffff ? String.fromCodePoint(n) : all; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name!.toLowerCase()]!;
  });

export function tagAttributes(value: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const match of value.matchAll(/\s([:\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+)))?/gu)) {
    out.set((match[1] ?? '').toLowerCase(), decode(match[2] ?? match[3] ?? match[4] ?? ''));
  }
  return out;
}

/** Whether an element with this tag name and these attributes hides its own text. */
export function hiddenElement(tag: string, attrs: ReadonlyMap<string, string>): boolean {
  return HIDDEN_CONTAINER_TAGS.has(tag) || attrs.has('hidden') || /^(?:true|1|hidden)$/iu.test(attrs.get('aria-hidden') ?? '') ||
    /(?:^|[;\s])(?:display\s*:\s*none|visibility\s*:\s*hidden)(?:\s*!important)?(?:[;\s]|$)/iu.test(attrs.get('style') ?? '');
}

/** Whether an element would quote copied text (it only does when `balancedOpenings` lists it). */
export function quoteElement(tag: string, attrs: ReadonlyMap<string, string>): boolean {
  return tag === 'q' || tag === 'blockquote' || attrs.has('data-quote');
}

// A quote exempts text only when its own closing tag appears before an
// enclosing element closes it implicitly; an unmatched quote quotes nothing.
export function balancedOpenings(tokens: readonly string[]): Set<number> {
  const open: { tag: string; index: number; hidden: boolean; raw: boolean }[] = [];
  const balanced = new Set<number>();
  tokens.forEach((value, index) => {
    if (!value.startsWith('<') || value.startsWith('<!--')) return;
    const rawFrame = open.at(-1)?.raw ? open.at(-1) : undefined;
    const tag = /^<\/?([\w:-]+)/.exec(value)?.[1]?.toLowerCase();
    if (!tag) return;
    if (value.startsWith('</')) {
      if (rawFrame) {
        if (tag === rawFrame.tag) open.pop();
        return;
      }
      const top = open.at(-1);
      if (!top || top.tag !== tag) return;
      open.pop();
      if (!top.hidden) balanced.add(top.index);
    } else if (!rawFrame && !/\/$/.test(value.slice(0, -1)) && !VOID_TAGS.has(tag)) {
      open.push({ tag, index, hidden: open.some(item => item.hidden) || hiddenElement(tag, tagAttributes(value)), raw: RAW_TEXT_TAGS.has(tag) });
    }
  });
  return balanced;
}

/** The page with every hidden element (tags and text) left out; everything else byte for byte. */
export function withoutHiddenText(html: string): string {
  const out: string[] = [];
  const stack: { tag: string; hidden: boolean }[] = [];
  for (const [token] of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+|</gu)) {
    // script/style are raw text; template/noscript still have nested HTML tags.
    const rawContainer = stack.findLast(frame => RAW_TEXT_TAGS.has(frame.tag));
    const hidden = stack.some(frame => frame.hidden);
    const tag = /^<\/?([\w:-]+)/u.exec(token)?.[1]?.toLowerCase();
    if (!tag) { if (!hidden) out.push(token); continue; }
    if (token.startsWith('</')) {
      if (rawContainer && tag !== rawContainer.tag) continue;
      const index = stack.map(frame => frame.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      if (!hidden) out.push(token);
      continue;
    }
    if (rawContainer) continue;
    const own = hiddenElement(tag, tagAttributes(token));
    if (!VOID_TAGS.has(tag) && !/\/\s*>$/u.test(token)) stack.push({ tag, hidden: own });
    if (!hidden && !own) out.push(token);
  }
  return out.join('');
}
