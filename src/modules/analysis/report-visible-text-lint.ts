/** U13, opt-in for new renderer versions. Callers mark every pending classified
 * measurement with data-classified="pending"; a table row is one statement.
 * No method-module imports: Market, Insight and auto reports share this contract. */
export type VisibleTextLintResult = { rule: string; ok: boolean; detail: string };

type Chunk = { text: string; pending: boolean; own: boolean };
const decode = (text: string): string => text.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,
  (all, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex || dec) { const n = hex ? parseInt(hex, 16) : Number(dec); return n <= 0x10ffff ? String.fromCodePoint(n) : all; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name!.toLowerCase()]!;
  });

export function lintVisibleReportText(html: string): VisibleTextLintResult[] {
  const blocks: { chunks: Chunk[]; region: number }[] = [], stack: { tag: string; quote: boolean; title: boolean; hidden: boolean; pending: boolean }[] = [];
  let region = 0;
  let block: Chunk[] = [];
  const flush = (): void => { if (block.length) blocks.push({ chunks: block, region }); block = []; };
  for (const token of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    const value = token[0];
    if (value.startsWith('<!--')) continue;
    if (!value.startsWith('<')) {
      if (!stack.some(f => f.hidden)) block.push({ text: decode(value), pending: stack.some(f => f.pending), own: !stack.some(f => f.quote || f.title) });
      continue;
    }
    const tag = /^<\/?([\w-]+)/.exec(value)?.[1]?.toLowerCase();
    if (!tag) continue;
    const row = stack.some(f => f.tag === 'tr');
    if (['p', 'li', 'tr', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption'].includes(tag) || (tag === 'br' && !row)) flush();
    if (value.startsWith('</')) {
      const index = stack.map(f => f.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      block.push({ text: ' ', pending: false, own: true });
    } else if (!/\/$/.test(value.slice(0, -1)) && !['br', 'img', 'meta', 'link', 'input', 'hr'].includes(tag)) {
      if (tag === 'section') region++;
      stack.push({ tag,
        quote: /\bdata-quote(?:\s|=|>)/i.test(value) || tag === 'q' || tag === 'blockquote',
        title: /^h[1-6]$/.test(tag) || tag === 'title',
        hidden: ['script', 'style'].includes(tag) || /\shidden(?:\s|=|>)/i.test(value) || /aria-hidden\s*=\s*["']true["']/i.test(value)
          || /style\s*=\s*["'][^"']*(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(value),
        pending: /data-classified\s*=\s*(?:"pending"|'pending'|pending(?=\s|>))/i.test(value),
      });
      block.push({ text: ' ', pending: false, own: true });
    }
  }
  flush();
  const superlatives: string[] = [], priorities: string[] = [], drafts: string[] = [];
  const regionText = new Map<number, string[]>();
  for (const { chunks, region } of blocks) {
    const own = chunks.map(c => c.own ? c.text : ' ').join('').replace(/\s+/g, ' ').trim();
    // Numeric lower bounds are measurement/method conditions, not a claim
    // that a product is superior (for example the frozen E11 threshold).
    const findings = own.replace(/ít nhất(?=\s+\d)/giu, 'tối thiểu');
    if (/(?:^|\s)(?:nhất|hàng đầu|tốt nhất|rẻ nhất)(?=\s|[.,;:!?]|$)/iu.test(findings)) superlatives.push(own);
    regionText.set(region, [...(regionText.get(region) ?? []), own]);
    // Keep decimal points intact. Sentences separated by punctuation, including
    // across inline tags, cannot borrow a draft label from their neighbour.
    const chars = chunks.flatMap(c => [...c.text].map(ch => ({ ch, pending: c.pending })));
    let sentence: typeof chars = [];
    const check = (): void => {
      const s = sentence.map(c => c.ch).join('');
      if (sentence.some(c => c.pending && /\d/u.test(c.ch)) && !/đề xuất,\s*chờ chủ duyệt/iu.test(s)) drafts.push(s.trim());
      sentence = [];
    };
    chars.forEach((c, i) => {
      sentence.push(c);
      if (/[!?…]/u.test(c.ch) || (c.ch === '.' && !( /\d/.test(chars[i - 1]?.ch ?? '') && /\d/.test(chars[i + 1]?.ch ?? '')))) check();
    });
    check();
  }
  for (const parts of regionText.values()) {
    const text = parts.join(' ');
    if (/làm ngay[\s\S]*tiếp theo|ưu tiên\s*(?:số\s*)?\d|ưu tiên hàng đầu/iu.test(text)
      && !/phụ thuộc|điều kiện tiên quyết|chỉ[^.!?]*sau khi/iu.test(text)) priorities.push(text);
  }
  return [
    { rule: 'U13_SUPERLATIVE', ok: superlatives.length === 0, detail: superlatives.slice(0, 3).join(' | ') || 'Không có so sánh nhất trong nhận định.' },
    { rule: 'U13_PRIORITY', ok: priorities.length === 0, detail: priorities.slice(0, 3).join(' | ') || 'Không có thứ tự ưu tiên thiếu phụ thuộc.' },
    { rule: 'U13_PENDING_NUMBER', ok: drafts.length === 0, detail: drafts.slice(0, 3).join(' | ') || 'Số phân loại chưa duyệt có nhãn cùng câu.' },
  ];
}
