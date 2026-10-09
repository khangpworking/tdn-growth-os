// Reader-report rule lint on the final HTML (F1–F8, plus offline assets).
// Display checks at desktop, 375 px and A4 run separately in a browser.
import { lintVisibleReportText } from '../report-visible-text-lint.js';
export type LintResult = { rule: string; ok: boolean; detail: string };
export type LintOptions = {
  providers?: readonly string[];
  sectionIds?: readonly string[];
  /** Family label every web number must carry; defaults to the snapshot wording. */
  familyLabel?: string;
  /** New versioned renderers only. Historical gates remain byte-identical. */
  visibleTextRules?: boolean;
  /** Opt-in Insight v1; defaults preserve the historical Market gate. */
  reportKind?: 'MARKET' | 'INSIGHT';
};

// Data providers that must never be named in a report (owner rule).
export const FORBIDDEN_PROVIDER_NAMES: readonly string[] = ['Metric', 'Kalodata', 'TradeInt', 'Dami'];
const CAPTURED_PROVIDER_NAMES: readonly string[] = [...FORBIDDEN_PROVIDER_NAMES, 'SerpApi', 'Apify', 'PageIndex', 'Agent-Reach', 'OpenCLI', 'zen-studio'];

export function visibleText(html: string): string {
  return html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
}

// Cells marked data-quote hold text copied from a web search result.
// The report's own wording rules (F3, F5, F7) do not apply to a quotation;
// provider names (F1) are still checked everywhere.
const QUOTED = /<(\w+)\b[^>]*\sdata-quote\b[^>]*>[\s\S]*?<\/\1>/g;

// Attribute values as the browser reads them (character references decoded).
const NAMED: Record<string, string> = { quot: '"', apos: "'", amp: '&', colon: ':', sol: '/', bsol: '\\', lpar: '(', rpar: ')', tab: '\t', newline: '\n' };
function decodeAttr(value: string): string {
  return value.replace(/&#x([0-9a-f]+);?|&#(\d+);?|&([a-z]+);/gi, (all, hex?: string, dec?: string, name?: string) => {
    const code = hex ? parseInt(hex, 16) : dec ? Number(dec) : NaN;
    if (Number.isFinite(code)) return code <= 0x10ffff ? String.fromCodePoint(code) : all;
    return NAMED[(name ?? '').toLowerCase()] ?? all;
  });
}

// CSS as the browser reads it: comments dropped, escapes (\2f, \/) decoded.
function decodeCss(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\\([0-9a-f]{1,6})\s?|\\([^\n0-9a-f])/gi, (all, hex?: string, ch?: string) => {
    if (ch !== undefined) return ch;
    const code = parseInt(hex ?? '', 16);
    return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
  });
}

export function lint(html: string, { providers = FORBIDDEN_PROVIDER_NAMES, sectionIds = [], familyLabel = 'toàn kết quả tìm kiếm', visibleTextRules = false, reportKind = 'MARKET' }: LintOptions = {}): LintResult[] {
  const out: LintResult[] = [], add = (rule: string, ok: boolean, detail: string) => { out.push({ rule, ok, detail }); };
  const all = visibleText(html), vis = visibleText(html.replace(QUOTED, ' ')), svgText = [...html.matchAll(/<svg[\s\S]*?<\/svg>/g)].map(m => m[0].replace(/<[^>]+>/g, ' ')).join(' ');
  const titleTag = html.match(/<title>[\s\S]*?<\/title>/)?.[0] ?? '';
  const prov = providers.filter(p => new RegExp(`\\b${p}\\b`, 'i').test(all + ' ' + svgText + ' ' + titleTag));
  add('F1 tên nhà cung cấp số liệu', prov.length === 0, prov.length ? 'thấy: ' + prov.join(', ') : 'không thấy ' + providers.join('/'));

  const ex = [...html.matchAll(/<(figure|div) class="ex">([\s\S]*?)(?=<(figure|div) class="ex">|<\/section>)/g)];
  const noSrc = ex.filter(m => !/class="ex-src">Nguồn:/.test(m[2] ?? '')).map(m => ((m[2] ?? '').match(/class="exn">([^<]+)/) ?? [])[1]);
  const noteInSrc = [...html.matchAll(/class="ex-src">([^<]*)/g)].filter(m => /Chú thích/i.test(m[1] ?? '')).length;
  add('F2 hình/bảng có "Nguồn:", "Chú thích:" tách dòng', noSrc.length === 0 && noteInSrc === 0, `${ex.length} hình/bảng; thiếu nguồn: ${noSrc.join(', ') || 0}; chú thích lẫn trong nguồn: ${noteInSrc}`);

  const junk = vis.match(/\bundefined\b|\bNaN\b|\bnull\b|\{\{|\}\}|Infinity/g) ?? [];
  add('F3 không sót undefined/NaN/null/{{}}', junk.length === 0, junk.length ? junk.slice(0, 5).join(', ') : 'sạch');

  const rank = [...vis.matchAll(/(.{0,30})xếp hạng/g)].filter(m => !/không\s*(phải\s*)?$/i.test(m[1] ?? '')).length;
  // These retained located/corpus disclaimers exceed the historical lookback.
  // Recognize only their exact limitation wording, and only in Insight.
  const insightDisclaimer = (before: string, term = 'thị phần'): boolean => reportKind === 'INSIGHT' &&
    (/Không suy rộng thành số người, tỷ lệ dân số hay[^\S\r\n]*$/iu.test(before) ||
      (term === 'toàn thị trường' && /Chưa mã hóa nội dung; số dòng không phải số khách hàng, tỷ lệ chủ đề hay độ phủ[^\S\r\n]*$/iu.test(before)));
  // Insight checks the negation governing this claim, not an unrelated earlier
  // sentence/clause. Keep HTML block and literal line boundaries before the
  // existing visible-text whitespace normalization. Source quotes stay inert.
  const insightText = reportKind === 'INSIGHT' ? html.replace(QUOTED, ' ')
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<svg[\s\S]*?<\/svg>/g, ' ')
    .split(/<\/?(?:p|li|tr|td|th|h[1-6]|section|div|figcaption|title|article|header|footer|main|aside|blockquote|dl|dt|dd|ul|ol|details|summary|br|hr)\b[^>]*>|[\r\n]+/i)
    .map(visibleText).join('\n') : '';
  const insightNegated = (before: string, term: string): boolean => {
    if (insightDisclaimer(before, term)) return true;
    const clause = before.split(/[.;!?…\n]|(?<![\p{L}\p{N}])(?:nhưng|tuy nhiên|song|but|however)(?![\p{L}\p{N}])/iu).at(-1) ?? '';
    // Bounded direct limitations, including the existing source wording.
    return /(?:không|chưa)\s+(?:(?:phải(?:\s+là)?|là)\s+)?$/iu.test(clause) ||
      /(?:không|chưa)\s+(?:đại diện(?:\s+cho)?|bao phủ|chứng minh độ phủ|xác nhận độ phủ|khẳng định|(?:tự\s+)?suy ra)\s*$/iu.test(clause) ||
      /(?:không|chưa)\s+(?:có|đủ)\s+(?:dữ liệu|bằng chứng)\s+(?:về|cho|để (?:xác nhận|khẳng định|ước tính))\s*$/iu.test(clause) ||
      (term === 'quy mô thị trường' && /bản ghi định vị không phải số người, mức phổ biến,\s*$/iu.test(clause));
  };
  const insightClaims = (terms: RegExp) => [...insightText.matchAll(terms)]
    .filter(match => !insightNegated(insightText.slice(0, match.index ?? 0), match[0]));
  const whole = reportKind === 'INSIGHT' ? insightClaims(/thị phần|toàn thị trường|quy mô thị trường/gi).length
    : [...vis.matchAll(/(.{0,40})(thị phần|toàn thị trường|quy mô thị trường)/g)].filter(m => !/không|chưa|không phải/.test(m[1] ?? '')).length;
  add('F5 không khẳng định toàn thị trường; "sắp xếp" thay "xếp hạng"', rank === 0 && whole === 0, `xếp hạng không phủ định: ${rank}; thị phần/toàn thị trường không phủ định: ${whole}`);

  const m12 = reportKind === 'INSIGHT' ? html.match(/<section id="I15">[\s\S]*?<\/section>/)?.[0] ?? '' : html.match(/<section id="phan-12">[\s\S]*?<\/section>/)?.[0] ?? '';
  const okRec = /đề xuất/i.test(m12) && /chờ chủ duyệt/i.test(m12), okCls = /đề xuất, chờ (chủ )?duyệt|chờ duyệt/.test(vis);
  add('F6 khuyến nghị và phân loại mang nhãn đề xuất, chờ duyệt', okRec && okCls, `Phần ${reportKind === 'INSIGHT' ? '15' : '12'}: ${okRec ? 'có' : 'THIẾU'}; phân loại: ${okCls ? 'có' : 'THIẾU'}`);

  const have = new Set([...html.matchAll(/class="exn">(Hình|Bảng) ([\w.]+)</g)].map(m => `${m[1]} ${m[2]}`));
  const refs = [...vis.matchAll(/(Hình|Bảng) (\d+\.\d+|PL\.\d+)((?:,\s*\d+\.\d+)*)/g)]
    .flatMap(m => [`${m[1]} ${m[2]}`, ...(m[3] ?? '').split(',').map(s => s.trim()).filter(Boolean).map(s => `${m[1]} ${s}`)]);
  const dangling = [...new Set(refs.filter(r => !have.has(r)))];
  const maxPart = reportKind === 'INSIGHT' ? 17 : 12;
  const parts = [...vis.matchAll(/Phần (\d+)/g)].map(m => Number(m[1])).filter(x => x < 1 || x > maxPart);
  const pl = [...have].filter(x => /PL\./.test(x)).map(x => Number(x.split('.')[1])).sort((a, b) => a - b);
  const plOk = pl.every((v, i) => v === i + 1);
  add('F7 tham chiếu chéo trỏ tới thứ có thật; PL liên tục', dangling.length === 0 && parts.length === 0 && plOk, `${refs.length} tham chiếu; treo: ${dangling.join(', ') || 0}; Phần ngoài 1–${maxPart}: ${parts.length}; PL: ${pl.join(',')}`);

  const cov = html.match(/<header class="cover"[\s\S]*?<\/header>/)?.[0].replace(/style="[^"]*"/, '') ?? '';
  const covTxt = cov.replace(/<[^>]+>/g, ' ');
  const covBad = /\d[\d.]*\s*(sản phẩm|gian hàng)|Nguồn ảnh|ảnh:|badge/.test(covTxt + cov.replace(/class="cover[^"]*"/g, ''));
  add('F8 bìa đúng mẫu (không số sản phẩm, nhãn, nguồn ảnh)', !!cov && !covBad, cov ? (covBad ? 'bìa có chữ cấm' : 'đúng mẫu') : 'không có bìa');

  // Only real tags load anything: attributes are read inside tags (double,
  // single or no quotes) and CSS inside <style> blocks and style attributes.
  // The same words in escaped page text (e.g. a quoted web snippet) load nothing.
  // A link the reader clicks (<a href>) loads nothing either; any other remote address does.
  const tags = [...html.matchAll(/<[a-z][\w:-]*(?:"[^"]*"|'[^']*'|[^'">])*>/gi)].map(m => m[0]);
  const attrs = (name: string) => tags.flatMap(tag => [...tag.matchAll(new RegExp(`\\s(${name})\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'gi'))]
    .map(m => ({ tag, name: (m[1] ?? '').toLowerCase(), value: decodeAttr(m[2] ?? m[3] ?? m[4] ?? '').trim() })));
  const css = decodeCss([...[...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1] ?? ''), ...attrs('style').map(a => a.value)].join('\n'));
  const remote = [
    ...[...html.matchAll(/<link\b[^>]*>|<script\b[^>]*\bsrc\s*=/gi)].map(m => m[0]),
    ...attrs('(?:[\\w-]+:)?(?:src|srcset|href|poster|data|action|formaction|ping)')
      .filter(a => /^(?:https?:)?[\\/]{2}/i.test(a.value) && !(/^<a\s/i.test(a.tag) && a.name === 'href')).map(a => a.tag),
    // url(...), or a quoted address as in @import "..." and image-set("...").
    ...[...css.matchAll(/url\(\s*['"]?\s*(?:https?:)?[\\/]{2}|['"]\s*(?:https?:)?[\\/]{2}|@import\b/gi)].map(m => m[0]),
  ].map(s => s.slice(0, 40));
  add('F0 không tải tài nguyên ngoài (font, ảnh, script cục bộ)', remote.length === 0, remote.length ? remote.slice(0, 3).join(' | ') : 'cục bộ');

  const secs = [...html.matchAll(/<section id="([^"]+)"/g)].map(m => m[1] ?? '');
  if (sectionIds.length) add(reportKind === 'INSIGHT' ? 'Cấu trúc: đủ I01–I17 và Kết luận chính' : 'Cấu trúc: đủ Phần 1–12 và Phụ lục', sectionIds.every(s => secs.includes(s)), secs.join(' '));
  if (reportKind === 'INSIGHT') {
    const citationIds = [...html.matchAll(/\bid="cite-(\d+)"/g)].map(m => m[1]);
    const marks = [...html.matchAll(/<sup class="cite">\[(\d+)\]<\/sup>/g)].map(m => m[1]);
    const targets = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    const links = [...html.matchAll(/\bhref="#([^"]+)"/g)].map(m => m[1]);
    add('I_CITATIONS nguồn và vị trí chính xác', new Set(citationIds).size === citationIds.length && marks.every(n => citationIds.includes(n)) && links.every(id => targets.includes(id)), 'Tham chiếu phải có đúng vị trí trên bản đọc.');
    const declaredCounts = [...m12.matchAll(/data-insight-action-count="([^"]*)"/g)].map(match => match[1]);
    add('I_ACTIONS tối đa ba đề xuất', declaredCounts.length <= 1 && declaredCounts.every(count => /^[0-3]$/.test(count ?? '')) &&
      [...m12.matchAll(/data-insight-action="candidate"/g)].length <= 3, 'Phương án của chủ giữ riêng với đề xuất AI.');
  }

  // Web snapshot rules (W1–W6). Pages without a snapshot have no webex block
  // and pass all of them unchanged.
  const family = familyLabel.toLowerCase();
  const webexOpens = [...html.matchAll(/<div class="webex"[^>]*>/g)];
  const webexBad: string[] = [];
  webexOpens.forEach((m, i) => {
    const start = (m.index ?? 0) + m[0].length;
    const rest = html.slice(start);
    let depth = 1, end = rest.length;
    for (const tag of rest.matchAll(/<\/?div\b[^>]*>/gi)) {
      depth += tag[0].startsWith('</') ? -1 : 1;
      if (depth === 0) { end = tag.index; break; }
    }
    if (!visibleText(rest.slice(0, end)).toLowerCase().includes(family)) webexBad.push(`webex ${i + 1}`);
  });
  add('W1 số web mang nhãn họ', webexBad.length === 0,
    webexBad.length ? 'thiếu nhãn: ' + webexBad.join(', ') : `${webexOpens.length} khối web đều có nhãn`);

  const sentencesIn = (markup: string): string[] => markup.replace(QUOTED, ' ')
    .split(/<\/(?:p|li|tr|h[1-6]|section|div|figcaption)>|<br\s*\/?>/i)
    .flatMap(block => visibleText(block).split(/[!?…\n]+|(?<!\d)\.|\.(?!\d)/));
  const sentences = sentencesIn(html);
  const mixed = sentences.filter(s => /trong mẫu/i.test(s) && s.toLowerCase().includes(family) &&
    /[+−-]|\btổng\b/i.test(s));
  add('W2 không cộng trừ hai họ số', mixed.length === 0,
    mixed.length ? mixed.slice(0, 2).map(s => s.trim().slice(0, 80)).join(' | ') : 'không lẫn hai họ số');

  const summed = sentences.filter(s =>
    /tổng\s+(hai sàn|cả hai sàn|shopee và tiktok|tiktok và shopee)/i.test(s));
  add('W3 không cộng gộp sàn khi trang không ghi tổng', summed.length === 0,
    summed.length ? summed.slice(0, 2).map(s => s.trim().slice(0, 80)).join(' | ') : 'không cộng gộp sàn');

  const shareHits = reportKind === 'INSIGHT' ? insightClaims(/thị phần/gi)
    : [...vis.matchAll(/(.{0,40})thị phần/gi)].filter(m => !/không|chưa|không phải/i.test(m[1] ?? ''));
  add('W4 không dùng từ "thị phần"', shareHits.length === 0,
    shareHits.length ? `thấy ${shareHits.length} lần không phủ định` : 'không thấy thị phần');

  const m10 = html.match(/<section id="phan-10">[\s\S]*?<\/section>/)?.[0] ?? '';
  const forecastBad = sentencesIn(m10).some(sentence => {
    if (!/\d[\d.,]*\s*(tỷ|triệu|nghìn|%|đồng|đ\b)/i.test(sentence)) return false;
    return [...sentence.matchAll(/(dự báo|dự kiến)/gi)].some(m => {
      const before = sentence.slice(Math.max(0, (m.index ?? 0) - 25), m.index ?? 0);
      return !/không|chưa/i.test(before);
    });
  });
  add('W5 M10 không có số dự báo', !forecastBad, forecastBad ? 'M10 có số kèm từ dự báo' : 'M10 chỉ xu hướng đã qua');

  const captured = [...html.matchAll(/data-web-label="([^"]*)"/g)].map(m => m[1] ?? '');
  const hitLabels = captured.filter(l => [...providers, ...CAPTURED_PROVIDER_NAMES].some(p =>
    new RegExp(`\\b${p}\\b`, 'i').test(decodeAttr(l))));
  add('W6 nhãn thu thập không nêu tên nhà cung cấp', hitLabels.length === 0,
    hitLabels.length ? 'thấy: ' + hitLabels.slice(0, 2).map(s => s.slice(0, 60)).join(' | ') : `${captured.length} nhãn đã kiểm`);
  if (visibleTextRules) out.push(...lintVisibleReportText(html));
  return out;
}
