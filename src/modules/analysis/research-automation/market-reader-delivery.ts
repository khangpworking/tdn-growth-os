/**
 * Reader-only delivery for the market14 Market report (owner A7, D30, B13).
 * The page is built once with its technical trace; this pure string pass turns that page into the reader copy:
 * trace blocks (`<details>`) leave the reader (their cite marks stay), draft framing becomes reader wording, and every
 * table/figure in Phần 3–11 gets a standalone note and, when useful, a deterministic "Diễn giải:" from the cells or chart
 * points it shows. The untouched page is stored separately as the hidden trace artifact.
 */

import { filterReaderGlossary } from './market-reader-glossary.js';

const ESCAPES: Readonly<Record<string, string>> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value: string): string => value.replace(/[&<>"']/gu, char => ESCAPES[char]!);
const decode = (value: string): string => value.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos|nbsp);/giu,
  (_all, hex?: string, dec?: string, name?: string) => hex ? String.fromCodePoint(Number.parseInt(hex, 16)) : dec ? String.fromCodePoint(Number(dec))
    : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name!.toLowerCase()]!);
const text = (html: string): string => decode(html.replace(/<sup class="cite">[\s\S]*?<\/sup>/gu, ' ').replace(/<svg\b[\s\S]*?<\/svg>/giu, ' ')
  .replace(/<[^>]+>/gu, ' ')).replace(/\s+/gu, ' ').trim();

/** End index (exclusive) of the element whose open tag starts at `start`, balancing nested tags of the same name. */
function elementEnd(html: string, start: number, tag: string): number {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'giu');
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return match.index + match[0].length;
  }
  return html.length;
}

/** Every `<details>` block leaves the reader; the cite marks of its summary stay in place so [n] still points at the register. */
export function stripTraceDetails(html: string): string {
  let out = '', from = 0;
  for (let start = html.indexOf('<details', from); start >= 0; start = html.indexOf('<details', from)) {
    const end = elementEnd(html, start, 'details');
    const block = html.slice(start, end);
    const summary = block.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/iu)?.[1] ?? '';
    out += html.slice(from, start) + (summary.match(/<sup class="cite">[\s\S]*?<\/sup>/gu) ?? []).join('');
    from = end;
  }
  return out + html.slice(from);
}

/** Draft wording printed by shared renderers, replaced with reader wording. M12's "đề xuất, chờ chủ duyệt" is never touched. */
const PHRASES: readonly [RegExp, string][] = [
  [/<p class="sec-note">Hồ sơ phương pháp[^<]*<\/p>/gu, ''],
  [/Bản nháp chưa được duyệt;\s*/gu, ''],
  // The method trace it points to is no longer in the reader copy.
  [/\s*Hồ sơ phương pháp nằm ở phụ lục[^.<]*\./gu, ''],
  [/Kết quả phương pháp có giới hạn, chưa duyệt; không phải mục hoàn chỉnh\./gu, 'Kết quả chỉ mô tả dữ liệu đã lưu, có giới hạn trong phạm vi đã thu.'],
  [/Đề xuất AI đã lưu · Chưa được người dùng duyệt/gu, 'Đề xuất AI đã lưu · đề xuất, chờ chủ duyệt'],
  [/để đề xuất bản nháp;/gu, 'làm căn cứ cho đề xuất;'],
  [/Danh sách bằng chứng không phải phân tích hoàn chỉnh;/gu, 'Danh sách bằng chứng chỉ liệt kê điều nguồn ghi;'],
  [/cho bản nháp này/gu, 'cho báo cáo này'],
  [/trong bản nháp này/gu, 'trong báo cáo này'],
  [/Bản nháp không đủ thông tin để xác định riêng nguyên nhân là thiếu đầu vào, còn chờ duyệt hay phương pháp chưa chạy\./gu, 'Chưa có dữ liệu cho mục này; đây không phải kết quả bằng không.'],
  [/;?\s*chưa phải (?:mục )?phân tích (?:kinh tế đơn vị )?hoàn chỉnh/gu, ''],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])listing(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'sản phẩm'],
  // "người, sản phẩm, listing" reads twice once listing is localized.
  [/sản phẩm(?:, sản phẩm)+(?![\p{L}\p{N}])/gu, 'sản phẩm'],
  [/\bsearch events\b/giu, 'lượt ghi nhận tìm kiếm'],
  [/theo section gốc/gu, 'theo phần gốc'],
  [/danh sách top sản phẩm/gu, 'danh sách sản phẩm doanh thu cao'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])pack\/variant(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'gói/biến thể'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])review(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'đánh giá'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])reviews(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'đánh giá'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])variant(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'biến thể'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])pack(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'gói'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])insight(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'hiểu biết'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])section(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'phần'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])export(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'tệp dữ liệu'],
  [/(?<![\p{L}\p{M}\p{N}_./\\:@#=-])peer set(?![\p{L}\p{M}\p{N}_/\\@#=-]|[.:][\p{L}\p{N}])/giu, 'nhóm đối thủ'],
  // The reader writes zero in words wherever an empty state is explained; decimals such as "0,5" stay numbers.
  [/([Bb])ằng 0(?![\d]|[,.]\d)/gu, '$1ằng không'],
  [/([Kk])hông (?:tính là|đổi thành|ghi thành) 0(?![\d]|[,.]\d)/gu, '$1hông thay bằng số không'],
];

// Only results-page copies use this wording; other report inputs retain their bytes.
const CURRENT_READER_PHRASES: readonly [RegExp, string][] = [
  [/Giá và kinh tế đơn vị/gu, 'Giá và quy cách sản phẩm'],
  [/(?<![\p{L}\p{N}_./-])(?:combo pack|bundle|combo)(?![\p{L}\p{N}_/-])/giu, 'gói kết hợp'],
];

const CAPTURE_PHRASES: readonly [RegExp, string][] = [
  [/(?<![\p{L}\p{N}])([Mm])ẫu xuất(?: đã lưu)?(?![\p{L}\p{N}])/gu, '$1ẫu đã lưu'],
];

const CONTEXT = /Cục Thống kê|Ngân hàng Thế giới|vĩ mô|cả nước|mã hàng|tìm kiếm|quảng cáo|video|tỉnh|thành phố/iu;
/** A caption naming a sales platform first, or the in-sample measure, is the stored sales sample even when it mentions search. */
const SAMPLE_CAPTION = /^(?:Shopee|TikTok Shop)\b|trong mẫu/u;
const SAMPLE_NOTE = 'Số liệu lấy từ các dòng đã lưu của từng sàn trong kỳ báo cáo; mỗi sàn đọc riêng và không suy rộng ra toàn thị trường. Ô ghi “chưa có dữ liệu” không có nghĩa là bằng không.';
const CONTEXT_NOTE = 'Số liệu nền từ nguồn công khai, đọc riêng; không nói về riêng sản phẩm này. Ô ghi “chưa có dữ liệu” không có nghĩa là bằng không.';

export interface ReaderTextOptions {
  readonly currentReader?: boolean;
  readonly publicReviewSource?: boolean;
}

/** Localize display dates without changing source quotes, identifiers or markup. */
export function readerText(html: string, captureCopy = false, { currentReader = false, publicReviewSource = false }: ReaderTextOptions = {}): string {
  const protectedTags: string[] = [];
  const phrases = [...PHRASES.slice(1), ...(captureCopy ? CAPTURE_PHRASES : []), ...(currentReader ? CURRENT_READER_PHRASES : [])];
  // Keep quoted attribute values and raw CSS/JS intact, even when they contain angle brackets.
  const tokens = /(<!--[\s\S]*?-->|<script\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/script\s*>|<style\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/style\s*>|<(?:[^<>"']|"[^"]*"|'[^']*')+>)/giu;
  return html.split(tokens).map((part, index) => {
    if (index % 2) {
      if (/^<!--|^<(?:script|style)\b/iu.test(part)) return part;
      const tag = /^<\/?([\w-]+)/u.exec(part)?.[1]?.toLowerCase();
      if (!tag) return part;
      if (part.startsWith('</')) {
        if (tag === protectedTags.at(-1)) protectedTags.pop();
      } else if (!/\/>$/u.test(part) && !['br', 'hr', 'img', 'input', 'wbr', 'area', 'base', 'col', 'embed', 'link', 'meta', 'param', 'source', 'track'].includes(tag)
        && (protectedTags.length || ['q', 'blockquote', 'code', 'pre', 'style', 'script', 'svg'].includes(tag) || /\bdata-(?:quote|glossary)(?:\s|=|>)/iu.test(part) || /\bpl-terms-table\b/u.test(part))) {
        protectedTags.push(tag);
      }
      return part;
    }
    if (protectedTags.length) return part;
    const paired = (value: string): string => value.replace(/(?<![\p{L}\p{N}_./-])(biến thể variant|gói pack|phần section|đánh giá reviews?|hiểu biết insight|nhóm peer set|tệp export)(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/giu,
      label => ({ 'biến thể variant': 'biến thể', 'gói pack': 'gói', 'phần section': 'phần', 'đánh giá review': 'đánh giá', 'đánh giá reviews': 'đánh giá', 'hiểu biết insight': 'hiểu biết', 'nhóm peer set': 'nhóm đối thủ', 'tệp export': 'tệp dữ liệu' } as Record<string, string>)[label.toLowerCase()]!);
    // A URL's query and fragment are identifiers too, not prose to translate.
    return part.split(/((?:[a-z][a-z\d+.-]*:\/\/|www\.)[^\s<>"']+)/giu).map((chunk, i) => i % 2 ? chunk : phrases.reduce((value, [re, to]) => publicReviewSource && to === 'đánh giá' ? value.split('review công khai trên Shopee').map(part => part.replace(re, to)).join('review công khai trên Shopee') : value.replace(re, to), paired(chunk))
      .replace(/(?<![\p{L}\p{N}_./-])(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2}))?(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/gu,
        (all, year: string, month: string, day: string, time?: string, zone?: string) => {
          const iso = `${year}-${month}-${day}`;
          const parsed = Date.parse(`${iso}T00:00:00Z`);
          if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== iso) return all;
          return `${day}/${month}/${year}${time ? ` ${time} ${zone === 'Z' ? 'UTC' : zone}` : ''}`;
        })).join('');
  }).join('');
}

type Num = { value: number; shown: string; unit: string };
const NUMBER = /^(?:chỉ số\s+)?(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)(?=\s|$)/u;
const parseNum = (cell: string): Num | undefined => {
  const match = NUMBER.exec(cell.trim()), shown = match?.[1];
  return shown === undefined ? undefined : { value: Number(shown.replace(/\./gu, '').replace(',', '.')), shown, unit: cell.trim().slice(match![0].length).trim() };
};
const EMPTY = /^(?:|—|–|-|chưa có dữ liệu|không có|chưa rõ\b.*)$/iu;
const PLATFORM = /^(?:Sàn|Nền tảng)$/u;
const PREFERRED = [/^Doanh thu/u, /^Giá theo đơn vị chuẩn/u, /^Giá trị/u, /^Trung bình/u, /^Giá\b/u];
const NOT_MEASURE = /^(?:Năm|Kỳ|Tuần|Tháng|Nguồn|Vị trí|Cập nhật|Hạng|Thứ tự|Số lượng)/u;
const ROW_PER_MEASURE = /^(?:Chỉ số|Dòng|Bên báo số|Bảng)/u;
const LABEL = /^(?:Tên|Sản phẩm|Chỉ số|Vùng|Dòng|Bên báo số|Đối tượng|Thương hiệu)/u;

function cells(row: string): string[] {
  return [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/giu)]
    .map(match => text((match[1] ?? '').replace(/<small\b[^>]*>[\s\S]*?<\/small>/giu, ' ')));
}

function rangeSentence(head: string, rows: readonly { label: string; num: Num }[]): string {
  if (rows.length === 0) return '';
  if (rows.length === 1) return `Cột “${head}” ghi ${rows[0]!.num.shown} (${rows[0]!.label}).`;
  const low = rows.reduce((a, b) => b.num.value < a.num.value ? b : a), high = rows.reduce((a, b) => b.num.value > a.num.value ? b : a);
  return low.num.value === high.num.value ? `Cột “${head}” có cùng giá trị ${low.num.shown} ở ${rows.length} dòng có số.`
    : `Ở cột “${head}”, mức thấp là ${low.num.shown} (${low.label}) và mức cao là ${high.num.shown} (${high.label}).`;
}

/** At most three sentences from displayed cells; omit the reading when no useful statement is available. */
export function tableInterpretation(block: string): string {
  const table = block.match(/<table\b[\s\S]*?<\/table>/iu)?.[0];
  if (!table) return '';
  // A table that carries its own reading (e.g. Phần 11) says how it was built; no generic sentence is derived for it.
  const own = /^<table\b[^>]*\sdata-reading="([^"]*)"/u.exec(table)?.[1];
  if (own !== undefined) return decode(own);
  const head = cells(table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/iu)?.[1] ?? '');
  const priceTable = /data-market-prices=/u.test(table);
  const periodTable = /data-market-periods="true"/u.test(table);
  // Short capture windows remain visible evidence, but never enter a numeric reading, including prices.
  const rows = [...(table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu)?.[1] ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)]
    .filter(match => !(periodTable || priceTable) || !/^<tr\b[^>]*\bdata-period-incomplete="true"/u.test(match[0]))
    .map(match => cells(match[1] ?? ''));
  const number = (cell: string): Num | undefined => {
    const num = parseNum(cell);
    return priceTable && num && num.value <= 0 ? undefined : num;
  };
  const count = (periodTable || priceTable) && /data-period-incomplete="true"/u.test(table)
    ? `Diễn giải dùng ${rows.length} dòng đủ kỳ.` : `Bảng có ${rows.length} dòng.`;
  // Pending classification cells are not quoted as numbers anywhere outside their own cell.
  if (rows.length === 0 || /data-classified="pending"/u.test(table)) return '';
  const numeric = head.map((_h, i) => rows.some(row => number(row[i] ?? '') !== undefined));
  const measures = head.map((h, i) => i).filter(i => numeric[i] && !NOT_MEASURE.test(head[i]!) && !PLATFORM.test(head[i]!)
    && (!priceTable || /^Giá(?:\s|\()/u.test(head[i]!)));
  const measure = PREFERRED.map(re => measures.find(i => re.test(head[i]!))).find(i => i !== undefined) ?? measures[0];
  // Different columns can carry unrelated units; there is no meaningful range across them.
  if (measure === undefined) {
    for (let i = 0; i < head.length; i++) {
      const dates = rows.map(row => row[i] ?? '').filter(value => /^\d{2}\/\d{2}\/\d{4}$/u.test(value));
      if (!dates.length) continue;
      const ordered = dates.sort((a, b) => a.split('/').reverse().join('').localeCompare(b.split('/').reverse().join('')));
      return `Cột “${head[i]}” ghi ngày từ ${ordered[0]} đến ${ordered[ordered.length - 1]}.`;
    }
    return '';
  }
  const values = rows.flatMap(row => { const num = number(row[measure] ?? ''); return num ? [num] : []; });
  // A cell can print its own unit (or several observations). Do not infer a shared scale from its heading alone.
  if (values.some(num => /\d/u.test(num.unit.replace(/\(kỳ gốc = [\d.,]+\)/u, '')))) return '';
  const incompatible = new Set(values.map(num => num.unit)).size > 1 || head.some((h, i) => /^(?:Phép đo|Thước đo|Đơn vị|Kỳ(?:\s|$))/u.test(h)
    && new Set(rows.map(row => row[i])).size > 1);
  if (incompatible) return `${count} Các dòng có thước đo, đơn vị hoặc kỳ khác nhau; đọc riêng từng dòng.`;
  const labelIndex = head.findIndex((h, i) => i !== measure && LABEL.test(h) && !numeric[i]);
  const fallbackLabel = head.findIndex((_h, i) => i !== measure && !numeric[i] && !PLATFORM.test(head[i]!) && new Set(rows.map(row => row[i])).size > 1);
  const label = labelIndex >= 0 ? labelIndex : fallbackLabel;
  const second = head.findIndex((_h, i) => i !== measure && i !== label && !numeric[i] && !PLATFORM.test(head[i]!) && !NOT_MEASURE.test(head[i]!) && new Set(rows.map(row => row[i])).size > 1);
  const labels = rows.map((row, r) => label >= 0 ? (row[label] || `dòng ${r + 1}`) : `dòng ${r + 1}`);
  const duplicate = labels.some((value, i) => labels.indexOf(value) !== i);
  const named = rows.map((row, r) => !duplicate ? labels[r]! : second >= 0 ? `${labels[r]} · ${row[second]}` : `dòng ${r + 1}`);
  // Rows that are different measures or reporters (macro indicators, trade sides) are listed one by one, never ranged together.
  if (head.some((heading, index) => ROW_PER_MEASURE.test(heading) && new Set(rows.map(row => row[index])).size > 1 && !numeric[index])) {
    if (rows.length > 4 || head.some(heading => /^Dòng/u.test(heading))) return `${count} Mỗi dòng là một thước đo riêng, đọc theo đơn vị của chính nó.`;
    const listed = rows.flatMap((row, r) => { const num = number(row[measure] ?? ''); return num ? [`${named[r]}: ${num.shown}`] : []; });
    return listed.length ? `${count} Cột “${head[measure]}” ghi ${listed.join('; ')}. Mỗi dòng là một thước đo riêng, đọc theo đơn vị của chính nó.` : '';
  }
  const platform = head.findIndex(h => PLATFORM.test(h));
  const groups = new Map<string, number[]>();
  rows.forEach((row, r) => { const key = platform >= 0 ? row[platform] ?? '' : ''; groups.set(key, [...(groups.get(key) ?? []), r]); });
  const sentences = [count];
  // Each platform is read on its own; values of different platforms are never put in one range.
  for (const [key, members] of groups) {
    const withNumber = members.flatMap(r => { const num = number(rows[r]![measure] ?? ''); return num ? [{ label: named[r]!, num }] : []; });
    const sentence = rangeSentence(head[measure]!, withNumber);
    if (sentence) sentences.push(groups.size > 1 && key ? `${key}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : sentence);
  }
  const missing = rows.filter(row => number(row[measure] ?? '') === undefined && (EMPTY.test(row[measure] ?? '') || (priceTable && row[measure] === 'Chưa có giá đọc được'))).length;
  if (missing) sentences[sentences.length - 1] = `${sentences[sentences.length - 1]!.replace(/\.$/u, '')}; ${missing} dòng chưa có dữ liệu ở cột này.`;
  return sentences.join(' ');
}

type SearchPoint = { readonly period: string; readonly index: number | null };
type Point = { label: string; value: number; shown: string; group: string; unit: string };
type Chart = { points: Point[]; series: 'bar' | 'line' | 'none'; share: boolean; axis?: { count: string; first: string; last: string } };
const SALES_PLATFORMS = /^(?:Shopee|TikTok Shop)$/u;
/** One vi-VN spelling per value ("5621,7" and "5.621,7" are the same bar), keeping the decimals the chart printed. */
const viNumber = (value: number, shown: string): string => {
  const decimals = shown.split(',')[1]?.length ?? 0;
  return value.toLocaleString('vi-VN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
function chartPoints(svg: string): Chart {
  const byKey = new Map<string, Point>();
  let series: Chart['series'] = 'none', share = false, axis: Chart['axis'];
  for (const match of svg.matchAll(/aria-label="([^"]*)"/gu)) {
    const aria = decode(match[1] ?? '');
    const scale = /^X-axis for a discrete scale with (\d+) values: ([^,]+),.*ending with (.+)$/u.exec(aria);
    if (scale) axis = { count: scale[1]!, first: scale[2]!.trim(), last: scale[3]!.trim() };
    const line = /^(Năm|Tuần|Tháng): ([^;]+); (.+): (-?[\d.,]+)(?: (.+))?$/u.exec(aria);
    const bar = line ? null : /^([^;]+): (-?[\d.,]+);\s+: ([^;]+)(?:;.*?\b[Ss](?:àn|an): ([^;]+))?/u.exec(aria);
    const point = line ? { label: line[2]!.trim(), shown: line[4]!, group: '', unit: line[5] ?? /\(([^()]+)\)\s*$/u.exec(line[3]!)?.[1]?.trim() ?? '' }
      : bar ? { label: bar[3]!.trim(), shown: bar[2]!, group: (bar[4] ?? '').trim(), unit: /\(([^()]+)\)\s*$/u.exec(bar[1]!)?.[1]?.trim() ?? '' } : undefined;
    if (!point) continue;
    series = line ? 'line' : 'bar';
    if (bar && /%/u.test(bar[1]!)) share = true;
    // The same bar is described by several marks, with or without thousands dots; one per label/value, keeping the platform when any mark names it.
    const value = Number(point.shown.replace(/\./gu, '').replace(',', '.'));
    const key = `${point.label}|${value}|${point.group}`, loose = `${point.label}|${value}|`;
    if (byKey.has(key) || (point.group === '' && [...byKey.keys()].some(k => k.startsWith(loose)))) continue;
    if (point.group) byKey.delete(loose);
    byKey.set(key, { ...point, group: point.group === point.label ? '' : point.group, value, shown: bar ? viNumber(value, point.shown) : point.shown });
  }
  return { points: [...byKey.values()], series, share, ...(axis ? { axis } : {}) };
}

/** Figures: capture counts, or low/high (bars, per platform) and first→last direction (series) read from the drawn points. */
export function figureInterpretation(block: string, searchPoints?: readonly SearchPoint[]): string {
  const caption = block.match(/<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/iu)?.[1];
  if (caption !== undefined) {
    const n = /n = (\d+) bản ghi/u.exec(text(block))?.[1];
    return n === undefined ? 'Hình ghi số bản ghi đã lưu của sàn này; đọc riêng từng sàn.'
      : `Hình ghi ${n} bản ghi sản phẩm đã lưu của ${text(caption).replace(/^Bản ghi sản phẩm\s*—\s*/u, '')}; số này chỉ nói về dữ liệu đã thu, đọc riêng từng sàn.`;
  }
  let { points, series, share, axis } = chartPoints(block.match(/<svg\b[\s\S]*?<\/svg>/iu)?.[0] ?? '');
  const chartUnit = decode(/class="exu"[^>]*>\(([^<]+)\)</u.exec(block)?.[1] ?? '');
  points = points.map(point => point.unit ? point : { ...point, unit: chartUnit });
  if (searchPoints?.length) {
    // The SVG line can expose just its first point. Use the same stored series, preserving gaps and years.
    const withYear = new Set(searchPoints.map(point => point.period.slice(0, 4))).size > 1;
    const label = (period: string): string => period.replace(/^(\d{4})-(\d{2})-(\d{2})$/u,
      (_all, year: string, month: string, day: string) => `${day}/${month}${withYear ? `/${year}` : ''}`);
    points = searchPoints.flatMap(point => point.index === null ? [] : [{ label: label(point.period), value: point.index,
      shown: point.index.toLocaleString('vi-VN'), group: '', unit: '' }]);
    series = 'line'; share = false;
    axis = { count: String(searchPoints.length), first: label(searchPoints[0]!.period), last: label(searchPoints[searchPoints.length - 1]!.period) };
  }
  // A line drawn as one mark carries only its first point; the axis still says how many periods it spans.
  if (series === 'line' && axis && points.length <= 1 && Number(axis.count) > 1)
    return `Hình có ${axis.count} mốc, từ ${axis.first} đến ${axis.last}; mỗi mốc là một giá trị đã lưu${/USD\/người/u.test(chartUnit) ? `, đơn vị ${chartUnit}` : ''}, đọc theo trục của hình.`;
  if (points.length === 0) return `Hình vẽ lại đúng các giá trị đã lưu${/USD\/người/u.test(chartUnit) ? `, đơn vị ${chartUnit}` : ''}; đọc từng điểm theo trục của hình.`;
  if (series === 'line') {
    if (new Set(points.map(point => point.unit)).size > 1 || new Set(points.map(point => point.group)).size > 1)
      return 'Các điểm có đơn vị hoặc nhóm khác nhau; đọc riêng từng chuỗi theo trục của hình.';
    const first = points[0]!, last = points[points.length - 1]!;
    const low = points.reduce((a, b) => b.value < a.value ? b : a), high = points.reduce((a, b) => b.value > a.value ? b : a);
    const amount = (point: Point): string => `${point.shown}${point.unit ? ` ${point.unit}` : ''}`;
    // An interior extreme is more informative than an endpoint direction.
    if (points.length > 2 && ((high !== first && high !== last) || (low !== first && low !== last))) {
      const peak = high !== first && high !== last ? `Đỉnh của chuỗi là ${amount(high)} (${high.label}).` : '';
      const trough = low !== first && low !== last ? `Đáy của chuỗi là ${amount(low)} (${low.label}).` : '';
      const gaps = axis && Number(axis.count) > points.length ? ` ${Number(axis.count) - points.length} mốc chưa có dữ liệu, không phải bằng không.` : '';
      const extremes = [peak, trough].filter(Boolean).join(' ');
      // Keep both extrema and the missing-data caveat within the three-sentence limit.
      return `Hình có ${points.length} mốc có số, từ ${first.label} đến ${last.label}. ${gaps && peak && trough ? extremes.replace(/\.$/u, ';') : extremes}${gaps}`;
    }
    const move = last.value > first.value ? `lên ${amount(last)}, chiều tăng` : last.value < first.value ? `xuống ${amount(last)}, chiều giảm` : `và vẫn ở ${amount(last)}, đi ngang`;
    const span = points.length === 1 ? `Hình có 1 mốc (${first.label}) ở mức ${amount(first)}.`
      : `Hình có ${points.length} mốc${axis && Number(axis.count) > points.length ? ' có số' : ''}, từ ${first.label} đến ${last.label}; giá trị đi từ ${amount(first)} ${move} giữa mốc đầu và mốc cuối.`;
    const extremes = points.length > 2 && (low !== first || high !== last) && (low !== last || high !== first)
      ? ` Mức thấp là ${amount(low)} (${low.label}), mức cao là ${amount(high)} (${high.label}).` : '';
    const gaps = axis && Number(axis.count) > points.length ? ` ${Number(axis.count) - points.length} mốc chưa có dữ liệu, không phải bằng không.` : '';
    return span + extremes + gaps;
  }
  // Bar values carry the unit of the chart's measure ("5.621,7 triệu đồng").
  const amount = (point: Point): string => `${point.shown}${point.unit ? ` ${point.unit}` : ''}`;
  if (points.every(point => SALES_PLATFORMS.test(point.label)))
    return `${points.map((point, i) => `${i ? 'thanh' : 'Thanh'} ${point.label} ở mức ${amount(point)}`).join('; ')} theo trục của hình. Mỗi sàn đọc riêng.`;
  const groups = new Map<string, Point[]>();
  for (const point of points) groups.set(point.group, [...(groups.get(point.group) ?? []), point]);
  const parts = [...groups].map(([group, members]) => {
    const low = members.reduce((a, b) => b.value < a.value ? b : a), high = members.reduce((a, b) => b.value > a.value ? b : a);
    const value = (point: Point): string => share ? '' : ` (${amount(point)})`;
    const body = members.length === 1 ? `một thanh ${high.label}${share ? '' : ` ở mức ${amount(high)}`}`
      : low.value === high.value ? `${members.length} thanh cùng mức${share ? '' : ` ${amount(high)}`}` : `${members.length} thanh, thanh dài là ${high.label}${value(high)}, thanh ngắn là ${low.label}${value(low)}`;
    return group ? `${group}: ${body}.` : `Hình có ${body}.`;
  });
  return `${parts.join(' ')} Giá trị đọc theo trục của hình; ${groups.size > 1 ? 'mỗi sàn đọc riêng' : 'mỗi thanh đọc riêng'}.`;
}

type Exhibit = { start: number; end: number; kind: 'table' | 'figure' };
function exhibits(section: string): Exhibit[] {
  const found: Exhibit[] = [];
  for (const match of section.matchAll(/<figure\b[^>]*>|<div class="table-wrap[^"]*"[^>]*>|<table\b[^>]*>/gu)) {
    if (found.some(item => match.index! < item.end)) continue;
    const figure = match[0].startsWith('<figure');
    const end = elementEnd(section, match.index!, figure ? 'figure' : match[0].startsWith('<table') ? 'table' : 'div');
    const block = section.slice(match.index!, end);
    if (!figure && !/<table\b/u.test(block)) continue;
    found.push({ start: match.index!, end, kind: figure ? 'figure' : 'table' });
  }
  return found;
}

/** Adds a standalone note and any useful cell/point-based reading right under the exhibit. */
export function annotateExhibits(section: string, searchPoints?: readonly SearchPoint[]): string {
  let out = '', from = 0;
  for (const exhibit of exhibits(section)) {
    const block = section.slice(exhibit.start, exhibit.end);
    const after = /^\s*<p class="lim"><b>Chú thích:<\/b>[\s\S]*?<\/p>/u.exec(section.slice(exhibit.end))?.[0] ?? '';
    const hasNote = /<p class="(?:lim|ex-note)"><b>Chú thích:<\/b>/u.test(block) || after !== '';
    const caption = text(block.match(/<div class="exh">[\s\S]*?<\/div>|<caption\b[^>]*>[\s\S]*?<\/caption>|<figcaption\b[^>]*>[\s\S]*?<\/figcaption>/u)?.[0] ?? '');
    const context = (!SAMPLE_CAPTION.test(caption) && CONTEXT.test(caption)) || /data-chart-id="M0[56]\./u.test(block);
    const note = hasNote ? '' : `<p class="lim"><b>Chú thích:</b> ${esc(context ? CONTEXT_NOTE : SAMPLE_NOTE)}</p>`;
    const interp = exhibit.kind === 'table' ? tableInterpretation(block)
      : figureInterpretation(block, /^<figure\b[^>]*\sdata-search-interest="1"|<span class="exn"[^>]*>Hình 5\.2<\/span>/u.test(block) ? searchPoints : undefined);
    const marks = /data-market-prices=/u.test(block) ? [...new Set(block.match(/<sup class="cite"[\s\S]*?<\/sup>/gu) ?? [])].join('') : '';
    out += section.slice(from, exhibit.end) + after + note + (interp ? `<p class="interp"><b>Diễn giải:</b> ${esc(interp)}${marks}</p>` : '');
    from = exhibit.end + after.length;
  }
  return out + section.slice(from);
}

const PLATFORM_NAMES: Readonly<Record<string, string>> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };

/** Opening paragraph of the market14 reader: what the report covers, where the numbers come from, and that no data is not zero. */
export function marketReaderGuide(platforms: readonly string[]): string {
  const names = platforms.map(platform => PLATFORM_NAMES[platform] ?? platform);
  const from = names.length ? `của ${names.length > 1 ? `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}` : names[0]}` : 'của các sàn đã chọn';
  return `<p class="reader-guide"><b>Cách đọc báo cáo:</b> ${esc(`Báo cáo trình bày kết luận chính, phạm vi, số liệu bán hàng, nhu cầu, nguồn cung, đối thủ, giá, rủi ro, cơ hội và phương án đề xuất cho từ khóa đã chọn. Số liệu bán hàng lấy từ mẫu đã lưu ${from} trong kỳ báo cáo; mỗi sàn đọc riêng. Số liệu nền cả nước, nếu có, được đặt riêng và không nói về riêng sản phẩm này. Mục ghi “chưa có dữ liệu” nghĩa là chưa thu được, không phải bằng không. Dưới mỗi bảng và hình có chú thích về phạm vi; diễn giải đi kèm khi dữ liệu cho phép.`)}</p>`;
}

const DATA_SECTIONS =/^M(?:0[3-9]|1[01])$/u;

/** Standard-unit tables have no capture marker: only a positive price cell establishes a readable price. */
function hasReadablePrice(html: string): boolean {
  return [...html.matchAll(/<table\b[\s\S]*?<\/table>/giu)].some(([table]) => {
    const head = cells(table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/iu)?.[1] ?? '');
    const prices = head.flatMap((label, index) => /^Giá(?:\s|\()/u.test(label) ? [index] : []);
    const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu)?.[1] ?? '';
    return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].some(([, row]) => {
      const values = cells(row ?? '');
      return prices.some(index => {
        const value = parseNum(values[index] ?? '');
        return value !== undefined && value.value > 0 && /^(?:VND|đồng)?$/iu.test(value.unit);
      });
    });
  });
}

/** Reader copy of a market14 page (before platform icons and label sanitising). Sections are never nested. */
export function deliverMarketReader(html: string, searchPoints?: readonly SearchPoint[], captureCopy = false, publicReviewSource = false): string {
  const open = html.indexOf('<div id="sections">');
  if (open < 0) return html;
  // Quoted excerpts carry their own <footer> inside a section: the page footer is the first one after the last section.
  const close = html.indexOf('<footer', Math.max(open, html.lastIndexOf('</section>')));
  const head = html.slice(0, open), tail = close < 0 ? '' : html.slice(close);
  let body = stripTraceDetails(close < 0 ? html.slice(open) : html.slice(open, close));
  body = readerText(body, captureCopy, { currentReader: true, publicReviewSource });
  body = body.replace(PHRASES[0]![0], PHRASES[0]![1]);
  body = body.replace(/<a\b[^>]*href="#bounded-method-evidence"[^>]*>([\s\S]*?)<\/a>/gu, '$1');
  body = body.replace(/<section class="sheet" id="(M\d\d)">([\s\S]*?)<\/section>/gu, (_all, id: string, inner: string) => {
    const annotated = DATA_SECTIONS.test(id) ? annotateExhibits(inner, searchPoints) : inner;
    // Proposal tables only count as data when they cite in-sample figures.
    let proposalFigures = false;
    const evidence = id === 'M12' ? annotated.replace(/<div class="table-wrap market14-proposals(?: has-figures)?">[\s\S]*?<\/table><\/div>/gu, block => {
      proposalFigures ||= block.startsWith('<div class="table-wrap market14-proposals has-figures">');
      return '';
    }) : annotated;
    // Country-level background is not data about this product: a section holding only that says so instead of "Có số liệu".
    const data = /<table\b(?![^>]*data-exhibit-scope="national")|<figure\b(?![^>]*data-exhibit-scope="national")/u.test(evidence) || proposalFigures
      || (id === 'M01' && /data-market-headline="1"/u.test(evidence));
    const national = /data-exhibit-scope="national"/u.test(evidence);
    // The report marks a section whose method found no usable records (or Phần 9 holding launch dates only) as a gap.
    const gap = /<span class="state"[^>]*\sdata-section-gap="1"/u.test(inner);
    const priceState = /data-market-prices="reference"/u.test(evidence) || hasReadablePrice(evidence) ? 'Có giá tham khảo, chưa xác minh'
      : /data-market-prices="unavailable"/u.test(evidence) ? 'Chưa có giá đọc được' : 'Chưa đủ dữ liệu';
    const label = id === 'M08' ? priceState : data ? gap ? 'Có một phần số liệu' : 'Có số liệu' : national ? 'Chỉ có số liệu nền cả nước' : 'Chưa đủ dữ liệu';
    const chip = id === 'M02' || id === 'M13' ? '' : `<span class="state">${label}</span>`;
    return `<section class="sheet" id="${id}">${annotated.replace(/<span class="state"[^>]*>[^<]*<\/span>/u, chip)}</section>`;
  });
  return filterReaderGlossary(head + body + tail);
}

/** Separator printed between an exhibit number and its title ("Bảng 5.1: Tên"). */
export const EXHIBIT_LABEL_SEPARATOR = ': ';

type NumberedExhibit = { start: number; end: number; open: string; kind: 'Bảng' | 'Hình'; inBox: boolean; bare: boolean };

/** Visible tables and figures of one section in order of appearance; a sources box (`div.ex`) may hold its own captioned table. */
function numberedExhibits(section: string): NumberedExhibit[] {
  const found: NumberedExhibit[] = [];
  for (const match of section.matchAll(/<figure\b[^>]*>|<div class="(?:table-wrap|ex)(?=[\s"])[^"]*"[^>]*>|<table\b[^>]*>/gu)) {
    const at = match.index!, open = match[0];
    const outer = found.filter(item => at >= item.start && at < item.end).at(-1);
    if (outer && !outer.open.startsWith('<div class="ex')) continue;
    const figure = open.startsWith('<figure'), table = open.startsWith('<table');
    const end = elementEnd(section, at, figure ? 'figure' : table ? 'table' : 'div');
    const block = section.slice(at, end);
    const box = open.startsWith('<div class="ex');
    if (box ? !/^<div\b[^>]*>\s*<div class="exh"/u.test(block) && !/<table\b/u.test(block) : !figure && !/<table\b/u.test(block)) continue;
    // Inside a sources box only a table with its own caption is a separate exhibit.
    if (outer && !/<caption\b/u.test(block)) continue;
    // A box whose only table content is its own captioned tables (or a plain list) is not a table: it keeps its heading unnumbered.
    const bare = box && ![...block.matchAll(/<table\b[\s\S]*?<\/table>/gu)].some(t => !/<caption\b/u.test(t[0]));
    found.push({ start: at, end, open, kind: figure && /<svg\b|<img\b/u.test(block) ? 'Hình' : figure && /<table\b/u.test(block) ? 'Bảng' : figure ? 'Hình' : 'Bảng', inBox: Boolean(outer), bare });
  }
  return found;
}

const EXN_SPAN = /<span class="exn"[^>]*>([^<]*)<\/span>(?:\s*<span class="exs">[^<]*<\/span>)?\s*/u;

/**
 * Current Market reader only: every visible table and figure carries exactly one label `<Bảng|Hình> <phần>.<n>`, counted
 * separately per type and per section in order of appearance (the appendix uses `PL`), with a literal separator before its
 * title. A caption that repeats the heading leaves the visible text (the table keeps it as its accessible name), and in-text
 * references to a renumbered exhibit follow it. Anchors, citations and omitted exhibits are untouched; running it twice is a no-op.
 */
export function numberMarketExhibits(html: string): string {
  const relabel = new Map<string, string>();
  const numbered = html.replace(/<section class="sheet" id="(M\d\d)">([\s\S]*?)<\/section>/gu, (_all, id: string, inner: string) => {
    const prefix = id === 'M13' ? 'PL' : String(Number(id.slice(1)));
    const counts = { Bảng: 0, Hình: 0 };
    const edits: { start: number; end: number; to: string }[] = [];
    for (const exhibit of numberedExhibits(inner)) {
      if (exhibit.bare) {
        const own = inner.slice(exhibit.start, exhibit.end), head = /<div class="exh"[^>]*>([\s\S]*?)<\/div>/u.exec(own.slice(0, Math.max(0, own.search(/<(?:div class="table-wrap|table\b)/u)) || own.length));
        if (head && EXN_SPAN.test(head[1]!))
          edits.push({ start: exhibit.start + head.index, end: exhibit.start + head.index + head[0].length, to: `<div class="exh">${head[1]!.replace(EXN_SPAN, '').trim()}</div>` });
        continue;
      }
      const no =`${prefix}.${++counts[exhibit.kind]}`, label = `${exhibit.kind} ${no}`;
      const elementId = `exh-${prefix.toLowerCase()}-${exhibit.kind === 'Bảng' ? 'b' : 'h'}${counts[exhibit.kind]}`;
      const exn = `<span class="exn" data-exhibit-no="${no}">${label}</span>`;
      const block = inner.slice(exhibit.start, exhibit.end);
      // The exhibit's own parts stop at its first nested exhibit (a captioned table inside a sources box).
      const own = exhibit.open.startsWith('<div class="ex') ? block.slice(0, Math.max(0, block.search(/<(?:div class="table-wrap|table\b)/u)) || block.length) : block;
      const head = /<div class="exh"[^>]*>([\s\S]*?)<\/div>/u.exec(own);
      const tableOpen = /<table\b[^>]*>/u.exec(own);
      const caption = tableOpen ? /<caption\b[^>]*>([\s\S]*?)<\/caption>/u.exec(own.slice(tableOpen.index)) : null;
      const figcaption = /<figcaption\b[^>]*>([\s\S]*?)<\/figcaption>/u.exec(own);
      const oldLabel = (head ? EXN_SPAN.exec(head[1]!) : null)?.[1]?.trim() ?? (caption ? EXN_SPAN.exec(caption[1]!)?.[1]?.trim() : undefined);
      if (oldLabel && oldLabel !== label && !relabel.has(oldLabel)) relabel.set(oldLabel, label);
      const at = exhibit.start;
      const titled = (rest: string): string => rest ? `${exn}<span class="exs">${EXHIBIT_LABEL_SEPARATOR}</span>${rest}` : exn;
      // A figure titled by its heading (no figcaption of its own) gets the same accessible name association as a table.
      const labelFigure = (): void => {
        if (exhibit.open.startsWith('<figure') && !/\saria-label(?:ledby)?=/u.test(exhibit.open))
          edits.push({ start: at + exhibit.open.length - 1, end: at + exhibit.open.length - 1, to: ` aria-labelledby="${elementId}"` });
      };
      if (head) {
        const rest = head[1]!.replace(EXN_SPAN, '').trim();
        edits.push({ start: at + head.index, end: at + head.index + head[0].length, to: `<div class="exh" id="${elementId}">${titled(rest)}</div>` });
        const title = text(rest.replace(/<span class="exu"[\s\S]*?<\/span>/u, ''));
        if (caption && tableOpen) {
          const capAt = at + tableOpen.index + caption.index;
          edits.push({ start: capAt, end: capAt + caption[0].length, to: '' });
          if (!/\saria-label(?:ledby)?=/u.test(tableOpen[0]))
            edits.push({ start: at + tableOpen.index + tableOpen[0].length - 1, end: at + tableOpen.index + tableOpen[0].length - 1, to: ` aria-labelledby="${elementId}"` });
        }
        if (figcaption && text(figcaption[1]!) === title) edits.push({ start: at + figcaption.index, end: at + figcaption.index + figcaption[0].length, to: '' });
        if (!figcaption || text(figcaption[1]!) === title) labelFigure();
      } else if (caption && tableOpen) {
        const body = caption[1]!.replace(EXN_SPAN, '').replace(/^<span class="ext">([\s\S]*)<\/span>$/u, '$1').trim();
        const capAt = at + tableOpen.index + caption.index, openEnd = caption[0].indexOf('>') + 1;
        edits.push({ start: capAt + openEnd, end: capAt + caption[0].length - '</caption>'.length, to: titled(body ? `<span class="ext">${body}</span>` : '') });
      } else if (figcaption) {
        const body = figcaption[1]!.replace(EXN_SPAN, '').replace(/^<span class="ext">([\s\S]*)<\/span>$/u, '$1').trim();
        const capAt = at + figcaption.index, openEnd = figcaption[0].indexOf('>') + 1;
        edits.push({ start: capAt + openEnd, end: capAt + figcaption[0].length - '</figcaption>'.length, to: titled(body ? `<span class="ext">${body}</span>` : '') });
      } else if (exhibit.open.startsWith('<table')) {
        edits.push({ start: at + exhibit.open.length, end: at + exhibit.open.length, to: `<caption>${exn}</caption>` });
      } else {
        edits.push({ start: at + exhibit.open.length, end: at + exhibit.open.length, to: `<div class="exh" id="${elementId}">${exn}</div>` });
        labelFigure();
      }
    }
    let out = inner;
    for (const edit of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, edit.start) + edit.to + out.slice(edit.end);
    return `<section class="sheet" id="${id}">${out}</section>`;
  });
  if (!relabel.size) return numbered;
  // References in prose follow their exhibit; labels, drawn charts, styles and quotes keep their bytes.
  let quotedUntil = 0;
  return numbered.replace(/<span class="exn"[^>]*>[^<]*<\/span>|<svg\b[\s\S]*?<\/svg>|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>|<q\b[\s\S]*?<\/q>|<blockquote\b[\s\S]*?<\/blockquote>|<(?:[^<>"']|"[^"]*"|'[^']*')+>|[^<]+/gu,
    (part: string, at: number) => {
      if (at < quotedUntil) return part;
      const quote = /^<([\w-]+)\b[^>]*\sdata-quote(?:\s|=|>)/u.exec(part);
      if (quote) quotedUntil = elementEnd(numbered, at, quote[1]!);
      return part.startsWith('<') ? part : part.replace(/(?<![\p{L}\p{N}])(Bảng|Hình) (\d+|PL)\.(\d+)(?![\d.]*\d)/gu, all => relabel.get(all) ?? all);
    });
}
