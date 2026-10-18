/**
 * Reader-only delivery for the market14 Market report (owner A7, D30, B13).
 * The page is built once with its technical trace; this pure string pass turns that page into the reader copy:
 * trace blocks (`<details>`) leave the reader (their cite marks stay), draft framing becomes reader wording, and every
 * table/figure in Phần 3–11 gets a standalone note and a deterministic "Diễn giải:" computed from the cells or chart
 * points it shows. The untouched page is stored separately as the hidden trace artifact.
 */

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
  [/\blisting\b/giu, 'sản phẩm'],
  // "người, sản phẩm, listing" reads twice once listing is localized.
  [/sản phẩm(?:, sản phẩm)+(?![\p{L}\p{N}])/gu, 'sản phẩm'],
  [/\bsearch events\b/giu, 'lượt ghi nhận tìm kiếm'],
  [/theo section gốc/gu, 'theo phần gốc'],
  [/danh sách top sản phẩm/gu, 'danh sách sản phẩm doanh thu cao'],
  [/\breview\b/giu, 'đánh giá'],
  [/\bexport\b/giu, 'tệp dữ liệu'],
  [/\bpeer set\b/giu, 'nhóm đối thủ'],
  // The reader writes zero in words wherever an empty state is explained; decimals such as "0,5" stay numbers.
  [/([Bb])ằng 0(?![\d]|[,.]\d)/gu, '$1ằng không'],
  [/([Kk])hông (?:tính là|đổi thành|ghi thành) 0(?![\d]|[,.]\d)/gu, '$1hông thay bằng số không'],
];

const CONTEXT = /Cục Thống kê|Ngân hàng Thế giới|vĩ mô|cả nước|mã hàng|tìm kiếm|quảng cáo|video|tỉnh|thành phố/iu;
/** A caption naming a sales platform first, or the in-sample measure, is the stored sales sample even when it mentions search. */
const SAMPLE_CAPTION = /^(?:Shopee|TikTok Shop)\b|trong mẫu/u;
const SAMPLE_NOTE = 'Số liệu lấy từ các dòng đã lưu của từng sàn trong kỳ báo cáo; mỗi sàn đọc riêng và không suy rộng ra toàn thị trường. Ô ghi “chưa có dữ liệu” không có nghĩa là bằng không.';
const CONTEXT_NOTE = 'Số liệu nền từ nguồn công khai, đọc riêng; không nói về riêng sản phẩm này. Ô ghi “chưa có dữ liệu” không có nghĩa là bằng không.';

/** Localize display dates without changing source quotes, identifiers or markup. */
function readerText(html: string): string {
  const protectedTags: string[] = [];
  return html.split(/(<[^>]+>)/gu).map((part, index) => {
    if (index % 2) {
      const tag = /^<\/?([\w-]+)/u.exec(part)?.[1]?.toLowerCase();
      if (!tag) return part;
      if (part.startsWith('</')) {
        if (tag === protectedTags.at(-1)) protectedTags.pop();
      } else if (!/\/>$/u.test(part) && !['br', 'hr', 'img', 'input', 'wbr'].includes(tag)
        && (protectedTags.length || ['q', 'blockquote', 'code', 'pre'].includes(tag) || /\bdata-quote(?:\s|=|>)/u.test(part) || /\bdata-glossary=/u.test(part))) {
        protectedTags.push(tag);
      }
      return part;
    }
    if (protectedTags.length) return part;
    return PHRASES.slice(1).reduce((value, [re, to]) => value.replace(re, to), part)
      .replace(/(?<![\p{L}\p{N}_./-])(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2}))?(?![\p{L}\p{N}_/-]|\.[\p{L}\p{N}])/gu,
        (all, year: string, month: string, day: string, time?: string, zone?: string) => {
          const iso = `${year}-${month}-${day}`;
          const parsed = Date.parse(`${iso}T00:00:00Z`);
          if (!Number.isFinite(parsed) || new Date(parsed).toISOString().slice(0, 10) !== iso) return all;
          return `${day}/${month}/${year}${time ? ` ${time} ${zone === 'Z' ? 'UTC' : zone}` : ''}`;
        });
  }).join('');
}

type Num = { value: number; shown: string };
const NUMBER = /^(?:chỉ số\s+)?(-?(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d+)?)(?=\s|$)/u;
const parseNum = (cell: string): Num | undefined => {
  const shown = NUMBER.exec(cell.trim())?.[1];
  return shown === undefined ? undefined : { value: Number(shown.replace(/\./gu, '').replace(',', '.')), shown };
};
const EMPTY = /^(?:|—|–|-|chưa có dữ liệu|không có|chưa rõ\b.*)$/iu;
const PLATFORM = /^(?:Sàn|Nền tảng)$/u;
const PREFERRED = [/^Doanh thu/u, /^Giá theo đơn vị chuẩn/u, /^Giá trị/u, /^Trung bình/u, /^Giá\b/u];
const NOT_MEASURE = /^(?:Năm|Kỳ|Tuần|Tháng|Nguồn|Vị trí|Cập nhật|Hạng|Thứ tự|Số lượng)/u;
const ROW_PER_MEASURE = /^(?:Chỉ số|Bên báo số|Bảng)/u;
const LABEL = /^(?:Tên|Sản phẩm|Chỉ số|Vùng|Dòng|Bên báo số|Đối tượng|Thương hiệu)/u;

function cells(row: string): string[] {
  return [...row.matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/giu)].map(match => text(match[1] ?? ''));
}

function rangeSentence(head: string, rows: readonly { label: string; num: Num }[]): string {
  if (rows.length === 0) return '';
  if (rows.length === 1) return `Cột “${head}” ghi ${rows[0]!.num.shown} (${rows[0]!.label}).`;
  const low = rows.reduce((a, b) => b.num.value < a.num.value ? b : a), high = rows.reduce((a, b) => b.num.value > a.num.value ? b : a);
  return low.num.value === high.num.value ? `Cột “${head}” có cùng giá trị ${low.num.shown} ở ${rows.length} dòng có số.`
    : `Ở cột “${head}”, mức thấp là ${low.num.shown} (${low.label}) và mức cao là ${high.num.shown} (${high.label}).`;
}

/** 1–3 sentences from the rows the table shows: row count, low–high of one measure column, rows with no data. */
export function tableInterpretation(block: string): string {
  const table = block.match(/<table\b[\s\S]*?<\/table>/iu)?.[0];
  if (!table) return '';
  const head = cells(table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/iu)?.[1] ?? '');
  const rows = [...(table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/iu)?.[1] ?? '').matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/giu)].map(match => cells(match[1] ?? ''));
  const count = `Bảng có ${rows.length} dòng.`;
  // Pending classification cells are not quoted as numbers anywhere outside their own cell.
  if (rows.length === 0 || /data-classified="pending"/u.test(table)) return count;
  const numeric = head.map((_h, i) => rows.some(row => parseNum(row[i] ?? '') !== undefined));
  const measures = head.map((h, i) => i).filter(i => numeric[i] && !NOT_MEASURE.test(head[i]!) && !PLATFORM.test(head[i]!));
  const measure = PREFERRED.map(re => measures.find(i => re.test(head[i]!))).find(i => i !== undefined) ?? (measures.length === 1 ? measures[0] : undefined);
  // Different columns can carry unrelated units; there is no meaningful range across them.
  if (measure === undefined) return count;
  const incompatible = head.some((h, i) => /^(?:Phép đo|Thước đo|Đơn vị|Kỳ(?:\s|$))/u.test(h)
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
  if (label >= 0 && ROW_PER_MEASURE.test(head[label]!)) {
    if (rows.length > 4) return `${count} Mỗi dòng là một thước đo riêng, đọc theo đơn vị của chính nó.`;
    const listed = rows.flatMap((row, r) => { const num = parseNum(row[measure] ?? ''); return num ? [`${named[r]}: ${num.shown}`] : []; });
    return listed.length ? `${count} Cột “${head[measure]}” ghi ${listed.join('; ')}. Mỗi dòng là một thước đo riêng, đọc theo đơn vị của chính nó.` : count;
  }
  const platform = head.findIndex(h => PLATFORM.test(h));
  const groups = new Map<string, number[]>();
  rows.forEach((row, r) => { const key = platform >= 0 ? row[platform] ?? '' : ''; groups.set(key, [...(groups.get(key) ?? []), r]); });
  const sentences = [count];
  // Each platform is read on its own; values of different platforms are never put in one range.
  for (const [key, members] of groups) {
    const withNumber = members.flatMap(r => { const num = parseNum(rows[r]![measure] ?? ''); return num ? [{ label: named[r]!, num }] : []; });
    const sentence = rangeSentence(head[measure]!, withNumber);
    if (sentence) sentences.push(groups.size > 1 && key ? `${key}: ${sentence.charAt(0).toLowerCase()}${sentence.slice(1)}` : sentence);
  }
  const missing = rows.filter(row => parseNum(row[measure] ?? '') === undefined && EMPTY.test(row[measure] ?? '')).length;
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
    const line = /^(Năm|Tuần|Tháng): ([^;]+); (.+): (-?[\d.,]+)$/u.exec(aria);
    const bar = line ? null : /^([^;]+): (-?[\d.,]+);\s+: ([^;]+)(?:;.*?\b[Ss](?:àn|an): ([^;]+))?/u.exec(aria);
    const point = line ? { label: line[2]!.trim(), shown: line[4]!, group: '', unit: '' }
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
    return `Hình có ${axis.count} mốc, từ ${axis.first} đến ${axis.last}; mỗi mốc là một giá trị đã lưu, đọc theo trục của hình.`;
  if (points.length === 0) return 'Hình vẽ lại đúng các giá trị đã lưu; đọc từng điểm theo trục của hình.';
  if (series === 'line') {
    const first = points[0]!, last = points[points.length - 1]!;
    const low = points.reduce((a, b) => b.value < a.value ? b : a), high = points.reduce((a, b) => b.value > a.value ? b : a);
    const move = last.value > first.value ? `lên ${last.shown}, chiều tăng` : last.value < first.value ? `xuống ${last.shown}, chiều giảm` : `và vẫn ở ${last.shown}, đi ngang`;
    const span = points.length === 1 ? `Hình có 1 mốc (${first.label}) ở mức ${first.shown}.`
      : `Hình có ${points.length} mốc${axis && Number(axis.count) > points.length ? ' có số' : ''}, từ ${first.label} đến ${last.label}; giá trị đi từ ${first.shown} ${move} giữa mốc đầu và mốc cuối.`;
    const extremes = points.length > 2 && (low !== first || high !== last) && (low !== last || high !== first)
      ? ` Mức thấp là ${low.shown} (${low.label}), mức cao là ${high.shown} (${high.label}).` : '';
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

/** Adds the standalone note (when the exhibit has none) and the interpretation right under every table/figure. */
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
      : figureInterpretation(block, /<span class="exn">Hình 5\.2<\/span>/u.test(block) ? searchPoints : undefined);
    out += section.slice(from, exhibit.end) + after + note + `<p class="interp"><b>Diễn giải:</b> ${esc(interp)}</p>`;
    from = exhibit.end + after.length;
  }
  return out + section.slice(from);
}

const PLATFORM_NAMES: Readonly<Record<string, string>> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };

/** Opening paragraph of the market14 reader: what the report covers, where the numbers come from, and that no data is not zero. */
export function marketReaderGuide(platforms: readonly string[]): string {
  const names = platforms.map(platform => PLATFORM_NAMES[platform] ?? platform);
  const from = names.length ? `của ${names.length > 1 ? `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}` : names[0]}` : 'của các sàn đã chọn';
  return `<p class="reader-guide"><b>Cách đọc báo cáo:</b> ${esc(`Báo cáo trình bày kết luận chính, phạm vi, số liệu bán hàng, nhu cầu, nguồn cung, đối thủ, giá, rủi ro, cơ hội và phương án đề xuất cho từ khóa đã chọn. Số liệu bán hàng lấy từ mẫu đã lưu ${from} trong kỳ báo cáo; mỗi sàn đọc riêng. Số liệu nền cả nước, nếu có, được đặt riêng và không nói về riêng sản phẩm này. Mục ghi “chưa có dữ liệu” nghĩa là chưa thu được, không phải bằng không. Dưới mỗi bảng và hình có một dòng chú thích về phạm vi và một dòng diễn giải.`)}</p>`;
}

const DATA_SECTIONS =/^M(?:0[3-9]|1[01])$/u;

/** Reader copy of a market14 page (before platform icons and label sanitising). Sections are never nested. */
export function deliverMarketReader(html: string, searchPoints?: readonly SearchPoint[]): string {
  const open = html.indexOf('<div id="sections">');
  if (open < 0) return html;
  const close = html.indexOf('<footer', open);
  const head = html.slice(0, open), tail = close < 0 ? '' : html.slice(close);
  let body = stripTraceDetails(close < 0 ? html.slice(open) : html.slice(open, close));
  body = readerText(body);
  body = body.replace(PHRASES[0]![0], PHRASES[0]![1]);
  body = body.replace(/<a\b[^>]*href="#bounded-method-evidence"[^>]*>([\s\S]*?)<\/a>/gu, '$1');
  // Keep an English definition only if a verbatim source quote still uses the term.
  body = body.replace(/<table data-glossary="true">[\s\S]*?<\/table>/gu, table => {
    const prose = text(body.replace(table, ''));
    return table.replace(/<tr><td>(listing|review|export|peer set)<\/td><td>[^<]*<\/td><\/tr>/gu,
      (row, term: string) => new RegExp(`\\b${term}\\b`, 'iu').test(prose) ? row : '');
  });
  body = body.replace(/<section class="sheet" id="(M\d\d)">([\s\S]*?)<\/section>/gu, (_all, id: string, inner: string) => {
    const annotated = DATA_SECTIONS.test(id) ? annotateExhibits(inner, searchPoints) : inner;
    const data = /<table\b|<figure\b/u.test(annotated.replace(/<div class="table-wrap market14-proposals[\s\S]*?<\/table><\/div>/u, ''));
    const chip = id === 'M02' || id === 'M13' ? '' : `<span class="state">${data ? 'Có số liệu' : 'Chưa đủ dữ liệu'}</span>`;
    return `<section class="sheet" id="${id}">${annotated.replace(/<span class="state">[^<]*<\/span>/u, chip)}</section>`;
  });
  return head + body + tail;
}
