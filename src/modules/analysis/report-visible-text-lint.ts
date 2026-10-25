/** U13, opt-in for new renderer versions. Callers mark every pending classified
 * measurement with data-classified="pending"; a table row is one statement.
 * No method-module imports: Market, Insight and auto reports share this contract. */
import { balancedOpenings, hiddenElement, quoteElement, tagAttributes } from './report-visible-text.js';

export type VisibleTextLintResult = { rule: string; ok: boolean; detail: string };

type Chunk = { text: string; pending: boolean; own: boolean; cell: number | null };
const decode = (text: string): string => text.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos|nbsp);/gi,
  (all, hex: string | undefined, dec: string | undefined, name: string | undefined) => {
    if (hex || dec) { const n = hex ? parseInt(hex, 16) : Number(dec); return n <= 0x10ffff ? String.fromCodePoint(n) : all; }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name!.toLowerCase()]!;
  });

/** Metric code shape: two to four capital letters, a hyphen, one or two digits (DT-1, GIA-2). */
const METRIC_CODE = /(?<![\p{L}\p{N}-])\p{Lu}{2,4}-\d{1,2}(?![\p{L}\p{N}]|[.,]\d)/gu;
const REAL_PRICE = /(?<![\p{L}\p{M}])giá\s+thật(?![\p{L}\p{M}])/iu;

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);

function visibleBlocks(html: string): { chunks: Chunk[]; region: number }[] {
  const blocks: { chunks: Chunk[]; region: number }[] = [], stack: { tag: string; quote: boolean; hidden: boolean; pending: boolean; cell?: number }[] = [];
  let region = 0;
  let nextCell = 0;
  let block: Chunk[] = [];
  const flush = (): void => { if (block.length) blocks.push({ chunks: block, region }); block = []; };
  const activeCell = (): number | null => [...stack].reverse().find(frame => frame.cell !== undefined)?.cell ?? null;
  const tokens = [...html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)].map(token => token[0]);
  const balanced = balancedOpenings(tokens);
  for (const [tokenIndex, value] of tokens.entries()) {
    if (value.startsWith('<!--')) continue;
    if (!value.startsWith('<')) {
      if (!stack.some(f => f.hidden)) block.push({ text: decode(value), pending: stack.some(f => f.pending), own: !stack.some(f => f.quote), cell: activeCell() });
      continue;
    }
    const tag = /^<\/?([\w-]+)/.exec(value)?.[1]?.toLowerCase();
    if (!tag) continue;
    const row = stack.some(f => f.tag === 'tr');
    if (['p', 'li', 'tr', 'section', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'figcaption', 'caption'].includes(tag) || (['br', 'div'].includes(tag) && !row)) flush();
    if (value.startsWith('</')) {
      const index = stack.map(f => f.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      block.push({ text: ' ', pending: false, own: true, cell: activeCell() });
    } else if (!/\/$/.test(value.slice(0, -1)) && !VOID_TAGS.has(tag)) {
      if (tag === 'section') region++;
      // Hidden and quoted text as the shared visible-text reader defines them (c2 b5, owner Q3).
      const attrs = tagAttributes(value);
      stack.push({ tag,
        quote: balanced.has(tokenIndex) && quoteElement(tag, attrs),
        hidden: hiddenElement(tag, attrs),
        pending: /data-classified\s*=\s*(?:"pending"|'pending'|pending(?=\s|>))/i.test(value),
        ...(tag === 'td' || tag === 'th' ? { cell: nextCell++ } : {}),
      });
      block.push({ text: ' ', pending: false, own: true, cell: activeCell() });
    }
  }
  flush();
  return blocks;
}

// R-L20 (owner 24/10/2026): word lists, a number-plus-unit pattern and a full
// dd/mm/yyyy date. A ranking word passes only when its own sentence or title
// names the measure, a counted sample with its platform, and a dated period.
const LETTER = '[\\p{L}\\p{M}]';
const RANKING_BANNED = new RegExp(`(?<!${LETTER})(?:số\\s*1\\s+thị\\s+trường|tốt\\s+nhất|dẫn\\s+đầu\\s+ngành)(?!${LETTER})`, 'iu');
const RANKING_WORD = new RegExp(`(?<!${LETTER})(?:dẫn\\s+đầu|số\\s*1(?![\\d.,]*\\d)|nhiều\\s+nhất)(?!${LETTER})`, 'iu');
const RANKING_MEASURE = new RegExp(`(?<!${LETTER})(?:doanh\\s+thu|doanh\\s+số|lượt\\s+bán|đơn\\s+vị\\s+bán|số\\s+đơn|đơn\\s+hàng|lượt\\s+xem|lượt\\s+thích|lượt\\s+đánh\\s+giá|số\\s+đánh\\s+giá|nhắc)(?!${LETTER})`, 'iu');
// A citation marker such as «[3]» or «[3, 4]» may stand between the number and its unit.
const RANKING_SAMPLE = new RegExp(`\\d[\\d.,]*\\s+(?:\\[\\d+(?:\\s*[,–-]\\s*\\d+)*\\]\\s*)*(?:nghìn\\s+|triệu\\s+)?(?:sản\\s+phẩm|bản\\s+ghi|bình\\s+luận|đánh\\s+giá|review|dòng)(?!${LETTER})`, 'iu');
const RANKING_PLATFORM = /(?<![\p{L}\p{M}])(?:shopee|tiktok(?:\s+shop)?|lazada|tiki)(?![\p{L}\p{M}])/iu;
const RANKING_PERIOD = /(?<!\d)\d{1,2}\/\d{1,2}\/\d{4}(?!\d)/u;
const rankingComplete = (sentence: string): boolean => RANKING_MEASURE.test(sentence) && RANKING_SAMPLE.test(sentence)
  && RANKING_PLATFORM.test(sentence) && RANKING_PERIOD.test(sentence);
/** Sentences of one block; a dot between digits (7.4, 1.234) does not end one. */
const sentencesOf = (text: string): string[] => text.split(/(?<=[!?…])|(?<=(?<!\d)\.)|(?<=\.)(?!\d)/u).filter(s => s.trim());

export function lintVisibleReportText(html: string): VisibleTextLintResult[];
export function lintVisibleReportText(html: string, rawHtml: string): { gate: VisibleTextLintResult[]; raw: VisibleTextLintResult[] };
/** Reader U13 evaluates both historical inline views together. Separate finding
 * buckets preserve the gate's failure stage and the raw lint saved in claims. */
export function lintVisibleReportText(html: string, rawHtml?: string): VisibleTextLintResult[] | { gate: VisibleTextLintResult[]; raw: VisibleTextLintResult[] } {
  const views = rawHtml === undefined ? [html] : [html, rawHtml];
  const findingsByView = views.map(() => ({ superlatives: [] as string[], priorities: [] as string[], drafts: [] as string[], metricCodes: [] as string[], realPrices: [] as string[], rankings: [] as string[] }));
  const blocks = views.flatMap((markup, view) => visibleBlocks(markup).map(block => ({ ...block, view })));
  const regionText = new Map<string, string[]>();
  const isSuperlative = (text: string): boolean => {
    if (/(?<![\p{L}\p{M}])hàng\s+đầu(?![\p{L}\p{M}])/iu.test(text)) return true;
    for (const match of text.matchAll(/(?<![\p{L}\p{M}])nhất(?![\p{L}\p{M}])/giu)) {
      const index = match.index ?? 0;
      const before = text.slice(0, index).match(/([\p{L}\p{M}]+)\s*$/u)?.[1]?.toLowerCase();
      const after = text.slice(index + match[0].length).match(/^\s*([\p{L}\p{M}]+)/u)?.[1]?.toLowerCase();
      if (!['thống', 'đồng', 'hợp'].includes(before ?? '') && !['định', 'quán', 'trí', 'thiết'].includes(after ?? '')) return true;
    }
    return false;
  };
  for (const { chunks, region, view } of blocks) {
    const { superlatives, drafts, metricCodes, realPrices, rankings } = findingsByView[view]!;
    const own = chunks.map(c => c.own ? c.text : ' ').join('').replace(/\s+/g, ' ').trim();
    // R-M33: no metric code (DT-1, LB-1, GIA-2, SS-1 and the same shape); R-M34: no «giá thật».
    metricCodes.push(...(own.match(METRIC_CODE) ?? []));
    if (REAL_PRICE.test(own)) realPrices.push(own);
    const ownSentences = sentencesOf(own);
    for (const sentence of ownSentences) {
      if (RANKING_BANNED.test(sentence) || (RANKING_WORD.test(sentence) && !rankingComplete(sentence))) rankings.push(sentence.trim());
    }
    // Numeric lower bounds are measurement/method conditions, not a claim
    // that a product is superior (for example the frozen E11 threshold).
    // A counted product phrase is exempt only when its own sentence names a
    // sampling/counting context before it; a recommendation to choose top
    // products is not, even next to a sampling sentence.
    const countedSample = (input: string, offset: number): boolean => {
      let start = 0;
      for (const stop of input.slice(0, offset).matchAll(/[!?…]|\.(?!\d)/gu)) start = (stop.index ?? 0) + 1;
      return /(?<![\p{L}\p{M}])(?:tệp|mẫu|danh sách|kết quả tìm kiếm|gồm|lấy|xem đủ|thu thập)(?![\p{L}\p{M}])[\s\S]{0,160}$/iu.test(input.slice(start, offset));
    };
    // R-L20 allows «nhiều nhất» in a sentence that names measure, sample and period.
    const findings = ownSentences.map(s => rankingComplete(s) ? s.replace(/nhiều\s+nhất/giu, 'nhiều') : s).join('')
      .replace(/ít nhất(?=\s+\d)/giu, 'tối thiểu')
      .replace(/(\d[\d.,]*(?:\s*\[\d+\])*\s+sản phẩm\s+)doanh thu cao nhất/giu, (match, prefix: string, offset: number, input: string) =>
        countedSample(input, offset) ? `${prefix}theo ngưỡng doanh thu` : match)
      .replace(/(bản ghi|đối tượng)\s+duy nhất/giu, (match, kind: string, offset: number, input: string) => {
        const before = input.slice(0, offset).trimEnd();
        const countContext = kind.toLowerCase() === 'bản ghi' || /\bsố\s*$/iu.test(before) || /\bkhông\s+phải\s*$/iu.test(before);
        return countContext ? match.replace(/duy nhất$/iu, 'phân biệt') : match;
      })
      .replace(/dòng trùng đồng nhất/giu, 'dòng trùng hệt');
    if (isSuperlative(findings)) superlatives.push(own);
    const regionKey = `${view}:${region}`;
    regionText.set(regionKey, [...(regionText.get(regionKey) ?? []), own]);
    // Keep decimal points intact. Sentences separated by punctuation, including
    // across inline tags, cannot borrow a draft label from their neighbour.
    // A table cell is its own scope so a sibling cell cannot provide the label.
    const scopes = new Map<string, Chunk[]>();
    for (const chunk of chunks) {
      const key = chunk.cell === null ? 'block' : `cell:${chunk.cell}`;
      scopes.set(key, [...(scopes.get(key) ?? []), chunk]);
    }
    for (const scopedChunks of scopes.values()) {
      const chars = scopedChunks.flatMap(c => [...c.text].map(ch => ({ ch, pending: c.pending })));
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
  }
  for (const [regionKey, parts] of regionText) {
    const { priorities } = findingsByView[Number(regionKey.split(':')[0])]!;
    for (let i = 0; i < parts.length; i++) {
      const start = /làm ngay/iu.exec(parts[i] ?? '');
      if (!start) continue;
      let endBlock = i;
      let end = -1;
      for (; endBlock < parts.length; endBlock++) {
        const match = /tiếp theo/iu.exec(parts[endBlock] ?? '');
        if (match) { end = match.index + match[0].length; break; }
      }
      if (end < 0) continue;
      const first = parts[i]!.slice(start.index, endBlock === i ? end : undefined);
      const last = endBlock === i ? '' : parts[endBlock]!.slice(0, end);
      const tail = parts[endBlock]!.slice(end);
      const candidate = [first, ...parts.slice(i + 1, endBlock), ...(last ? [last] : [])].join(' ').replace(/\s+/g, ' ').trim();
      const directQualifier = /^[^.!?]*chỉ[^.!?]*sau khi/iu.test(tail.trim());
      if (!/phụ thuộc|điều kiện tiên quyết/iu.test(candidate) && !directQualifier) priorities.push(candidate);
      i = endBlock;
    }
    for (const text of parts) {
      if (/ưu tiên\s*(?:số\s*)?\d|ưu tiên hàng đầu/iu.test(text)
        && !/phụ thuộc|điều kiện tiên quyết|chỉ[^.!?]*sau khi/iu.test(text)) priorities.push(text);
    }
  }
  const results = findingsByView.map(({ superlatives, priorities, drafts, metricCodes, realPrices, rankings }) => [
    { rule: 'U13_SUPERLATIVE', ok: superlatives.length === 0, detail: superlatives.slice(0, 3).join(' | ') || 'Không có so sánh nhất trong nhận định.' },
    { rule: 'U13_PRIORITY', ok: priorities.length === 0, detail: priorities.slice(0, 3).join(' | ') || 'Không có thứ tự ưu tiên thiếu phụ thuộc.' },
    { rule: 'U13_PENDING_NUMBER', ok: drafts.length === 0, detail: drafts.slice(0, 3).join(' | ') || 'Số phân loại chưa duyệt có nhãn cùng câu.' },
    { rule: 'U13_METRIC_CODE', ok: metricCodes.length === 0, detail: [...new Set(metricCodes)].slice(0, 5).join(' | ') || 'Không hiện mã chỉ số.' },
    { rule: 'U13_REAL_PRICE', ok: realPrices.length === 0, detail: realPrices.slice(0, 3).join(' | ') || 'Không dùng chữ «giá thật».' },
    { rule: 'L20_RANKING_WORD', ok: rankings.length === 0, detail: rankings.slice(0, 3).join(' | ') || 'Từ xếp hạng có đủ thước đo, mẫu và kỳ.' },
  ]);
  return rawHtml === undefined ? results[0]! : { gate: results[0]!, raw: results[1]! };
}
