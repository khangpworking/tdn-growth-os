/**
 * Machine number-trace gate of a Market report (P5, owner plan F201, 25/10/2026).
 *
 * 1. Every number on the visible page is cut out of the delivered HTML (CSS,
 *    attributes, hidden text and the trace appendix are not read).
 * 2. Each one must match an entry of the report's trace map in the same block,
 *    one entry per printed occurrence (an unrecorded, hand-written number has none).
 * 3. Every entry is replayed: its registered formula, run on the input values
 *    with the same rounding and formatting the template uses, must give the
 *    printed token; with a resolver, each input value is re-read at its pointer.
 *
 * Covered blocks block delivery on any untraced number. The blocks listed in
 * `MARKET_TRACE_NOT_COVERED` are counted and listed, not blocking yet.
 */
import { hiddenElement, tagAttributes } from '../report-visible-text.js';
import { sp } from '../reader-report/format.js';
import { formatMarketChange, formatMarketCount, formatMarketMoney, formatMarketRange, marketPreviousPeriod } from './market-raw-report.js';
import { marketVietnamDay } from './market-scope-report.js';
import { searchInterestPeriodText } from './search-interest.js';
import { formatReaderNumber } from './reader-plain-text.js';
import type { MarketNumberTrace, MarketNumberTraceEntry, MarketTraceFormulaId, MarketTraceInput, MarketTraceRole, MarketTraceValue } from './market-trace-map.js';

export const MARKET_NUMBER_TRACE_GATE_VERSION = 'market-number-trace-gate-v1';

/** Blocks whose numbers are not instrumented yet: counted, listed, never blocking. Every other block is covered. */
export const MARKET_TRACE_NOT_COVERED: Readonly<Record<string, string>> = {
  M05: 'search interest, search volume, World Bank and official statistics records',
  M06: 'trade (Comtrade) records',
  M08: 'unit prices from the capture table and stored quotes',
  M09: 'source evidence: launch dates, drivers, PDF excerpts, seller videos',
  M10: 'forecast and scenario method outputs',
  M11: 'opportunity rows from the capture table',
};

/** Parts of the page that are the trace appendix, not report text (T5): never scanned. */
const APPENDIX_SECTIONS: ReadonlySet<string> = new Set(['M13']);
const APPENDIX_CLASSES: ReadonlySet<string> = new Set(['citation-register', 'evidence-trace']);

/** Allow-list of numbers that are template text, each with its reason (brief item 5). */
export const MARKET_TRACE_ALLOWED: Readonly<Record<string, string>> = {
  'section-label': 'section number of the report template («Phần 3», «Phụ lục 1»)',
  'exhibit-label': 'figure and table numbers given at delivery («Hình 4.1», «Bảng 3.1»)',
  'row-label': 'row label of the stored sample table («Dòng 3»)',
  citation: 'citation numbers and source-register entries',
  'axis-tick': 'axis scale mark placed by the chart engine; the plotted values are traced in the table or text beside it',
  'quoted-text': 'source text quoted verbatim (product titles), cited by its source mark',
  'index-scale': 'fixed 0–100 scale of the search-interest index',
  'top-group': 'group size of the template’s leading-product and leading-shop shares (TOP_GROUPS 1/3/5/10)',
  'pack-default': 'template rule: a title without a pack size counts as 1 product',
  'short-period': 'template rule: a period shorter than 30 days is incomplete (the 30-day search sample)',
};

/** Spans of a text node that are template labels, matched before numbers are cut out. */
const LABELS: readonly (readonly [RegExp, string])[] = [
  [/(?:Phần|Phụ lục)\s+\d+/gu, 'section-label'],
  [/(?:Hình|Bảng)\s+\d+(?:\.\d+)*/gu, 'exhibit-label'],
  [/Dòng\s+\d+/gu, 'row-label'],
  [/mục nguồn\s+\d+/gu, 'citation'],
  [/0–100/gu, 'index-scale'],
  [/\b(?:1|3|5|10) (?:sản phẩm|gian hàng) doanh thu cao/gu, 'top-group'],
  [/tính 1 sản phẩm/gu, 'pack-default'],
  [/(?:mẫu tìm kiếm|chưa đủ) 30 ngày/gu, 'short-period'],
];

/**
 * A number as the template prints it: a stored day («2026-10-19», read as «19/10/2026»), a date range («20/09–19/10/2026», «21–27/09»), a date («19/10/2026», «10/2026»),
 * or a signed number with its scale or percent («35,0 tỷ», «+12%», «1.234», «12 phần trăm»). Digits inside words count («B12»).
 */
const NUMBER = /\d{4}-\d{2}-\d{2}(?!\d)|\d{1,2}(?:\/\d{1,2})?(?:\/\d{4})?\s*–\s*\d{1,2}\/\d{1,2}(?:\/\d{4})?|\d{1,2}\/\d{1,2}\/\d{4}|\d{1,2}\/\d{4}|\d{1,2}\/\d{1,2}(?!\d)|(?<![\p{N}.,])[+−-]?\d+(?:[.,]\d+)*(?:\s*(?:tỷ|triệu|nghìn|đồng|%|phần trăm))?/gu;

/** One spelling per printed number: no-break spaces, «phần trăm» read as «%». */
export function normalizeMarketNumber(token: string): string {
  return token.replace(/^(\d{4})-(\d{2})-(\d{2})$/u, '$3/$2/$1').replace(/[  ]/gu, ' ').replace(/\s*(?:%|phần trăm)/gu, '%').replace(/\s*–\s*/gu, '–').replace(/\s+/gu, ' ').trim();
}

/** The numbers in a piece of text, normalized, in order. */
export function marketNumberTokens(text: string): string[] {
  return (text.match(NUMBER) ?? []).map(normalizeMarketNumber);
}

export interface MarketScannedNumber {
  readonly token: string;
  /** Report block: the section id (`M03`), or `page` for the cover, contents and footer. */
  readonly block: string;
  /** Up to 40 characters each side, for the owner's list. */
  readonly context: string;
  /** Allow-list id when the number is template text. */
  readonly allowed?: string;
}

interface Frame { readonly tag: string; readonly hidden: boolean; readonly appendix: boolean; readonly allowed?: string; readonly block?: string }

const ELEMENT_ALLOWED = (tag: string, attrs: ReadonlyMap<string, string>): string | undefined => {
  const classes = new Set((attrs.get('class') ?? '').split(/\s+/u).filter(Boolean));
  if (tag === 'q' || tag === 'blockquote' || attrs.has('data-quote')) return 'quoted-text';
  if (classes.has('cite') || [...classes].some(name => name.startsWith('cite-'))) return 'citation';
  if (classes.has('sh-id')) return 'section-label';
  if (classes.has('exn')) return 'exhibit-label';
  if (classes.has('row-ref')) return 'row-label';
  if (classes.has('role-axis-label')) return 'axis-tick';
  return undefined;
};

/** Every number on the visible page with its block; the appendix, hidden text, CSS and attributes are left out. */
export function scanMarketReportNumbers(html: string): MarketScannedNumber[] {
  const out: MarketScannedNumber[] = [];
  const stack: Frame[] = [];
  for (const [part] of html.matchAll(/<!--[\s\S]*?-->|<![^>]*>|<[^>]*>|[^<]+|</gu)) {
    const top = stack.at(-1);
    if (top && (top.tag === 'style' || top.tag === 'script') && !part.toLowerCase().startsWith(`</${top.tag}`)) continue;
    if (part.startsWith('<!')) continue;
    const tag = /^<\/?([\w:-]+)/u.exec(part)?.[1]?.toLowerCase();
    if (!tag) {
      if (top?.hidden || top?.appendix) continue;
      const text = part.replace(/&#x([\da-f]+);|&#(\d+);|&(amp|lt|gt|quot|apos|nbsp);/giu, (_all, hex: string | undefined, dec: string | undefined, name: string | undefined) =>
        hex || dec ? String.fromCodePoint(hex ? parseInt(hex, 16) : Number(dec)) : ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' } as Record<string, string>)[name!.toLowerCase()]!);
      const labels: { start: number; end: number; id: string }[] = [];
      for (const [pattern, id] of LABELS) for (const match of text.matchAll(pattern)) labels.push({ start: match.index, end: match.index + match[0].length, id });
      const block = stack.findLast(frame => frame.block)?.block ?? 'page';
      const element = stack.findLast(frame => frame.allowed)?.allowed;
      for (const match of text.matchAll(NUMBER)) {
        const token = normalizeMarketNumber(match[0]);
        const label = labels.find(span => match.index >= span.start && match.index < span.end)?.id;
        // An axis label that is a date or a category stays data; only bare scale numbers are ticks.
        const allowed = label ?? (element === 'axis-tick' && !/^[+−-]?\d+(?:[.,]\d+)*$/u.test(token) ? undefined : element);
        const context = text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 40).replace(/\s+/gu, ' ').trim();
        out.push({ token, block, context, ...(allowed ? { allowed } : {}) });
      }
      continue;
    }
    if (part.startsWith('</')) {
      const index = stack.map(frame => frame.tag).lastIndexOf(tag);
      if (index >= 0) stack.splice(index);
      continue;
    }
    if (/\/\s*>$/u.test(part) || /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/u.test(tag)) continue;
    const attrs = tagAttributes(part.slice(tag.length + 1, -1));
    const classes = (attrs.get('class') ?? '').split(/\s+/u);
    const id = attrs.get('id') ?? '';
    const block = tag === 'section' && classes.includes('sheet') && id ? id : undefined;
    stack.push({
      tag,
      hidden: Boolean(top?.hidden) || hiddenElement(tag, attrs),
      appendix: Boolean(top?.appendix) || tag === 'details' || tag === 'head' || (block !== undefined && APPENDIX_SECTIONS.has(block)) || classes.some(name => APPENDIX_CLASSES.has(name)),
      ...(ELEMENT_ALLOWED(tag, attrs) ? { allowed: ELEMENT_ALLOWED(tag, attrs)! } : {}),
      ...(block ? { block } : {}),
    });
  }
  return out;
}

// --- formulas (one table; each runs the template's own formatting) ---

const DAY_MS = 86_400_000;
const isoDay = (value: MarketTraceValue | undefined): string | null => {
  const text = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '';
  const match = /^(\d{4})-?(\d{2})-?(\d{2})/u.exec(text);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
};
const num = (value: MarketTraceValue | undefined): number | null => {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
};

/** dd/mm/yyyy of a stored day (`2026-09-20` or `20260920`). */
export const marketViDate = (day: string): string => `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
/** Signed share or percent with one decimal, as the Phần 1 findings print it («28,6 phần trăm»). */
export const marketPercent1 = (value: number): string => `${sp(value.toFixed(1))} phần trăm`;
/** Whole millions of đồng, as the chart readings print them («21 triệu đồng»). */
export const marketMillionsVnd = (value: number): string => `${Math.round(value / 1e6).toLocaleString('vi-VN')} triệu đồng`;

/** The quarter holding most of the period's inclusive days, the later one on a tie (cover and Phần 2). */
export function marketMainQuarter(start: string, end: string): { quarter: number; year: number } {
  const days = new Map<string, { quarter: number; year: number; count: number }>();
  for (let day = Date.parse(`${start}T00:00:00Z`), last = Date.parse(`${end}T00:00:00Z`); day <= last; day += DAY_MS) {
    const date = new Date(day);
    const quarter = Math.floor(date.getUTCMonth() / 3) + 1, year = date.getUTCFullYear();
    const key = `${year}-${quarter}`;
    days.set(key, { quarter, year, count: (days.get(key)?.count ?? 0) + 1 });
  }
  const main = [...days.values()].reduce((best, item) => item.count >= best.count ? item : best,
    { quarter: Math.floor((Number(end.slice(5, 7)) - 1) / 3) + 1, year: Number(end.slice(0, 4)), count: 0 });
  return { quarter: main.quarter, year: main.year };
}

type Formula = (inputs: readonly MarketTraceInput[], token: string) => string | null;
const byRole = (inputs: readonly MarketTraceInput[], role: MarketTraceRole): MarketTraceInput[] => inputs.filter(input => input.role === role);
const sum = (inputs: readonly MarketTraceInput[]): number | null => {
  const values = inputs.map(input => num(input.value));
  return values.length && values.every(value => value !== null) ? (values as number[]).reduce((a, b) => a + b, 0) : null;
};
const one = <T>(value: T | null, format: (value: T) => string): string | null => value === null ? null : format(value);
const range = (inputs: readonly MarketTraceInput[]): { start: string; end: string } | null => {
  const start = isoDay(byRole(inputs, 'start')[0]?.value), end = isoDay(byRole(inputs, 'end')[0]?.value);
  return start && end ? { start, end } : null;
};

/** The registered computations: inputs → the text the template prints. */
export const MARKET_TRACE_FORMULAS: Readonly<Record<MarketTraceFormulaId, Formula>> = {
  // A stored text or number printed as stored: the token is that value, or one of the numbers written in it.
  // A stored text or number printed as stored: the token is a stored value, or one of the numbers written in one.
  'as-stored': (inputs, token) => {
    const texts = inputs.flatMap(input => input.value === undefined || Array.isArray(input.value) ? [] : [String(input.value)]);
    if (!texts.length) return null;
    const printed = normalizeMarketNumber(token);
    return texts.some(text => normalizeMarketNumber(text) === printed || marketNumberTokens(text).includes(printed)) ? token : texts[0]!;
  },
  money: inputs => one(num(inputs[0]?.value), formatMarketMoney),
  'count-scaled': inputs => one(num(inputs[0]?.value), formatMarketCount),
  'sum-money': inputs => one(sum(inputs), formatMarketMoney),
  'sum-count': inputs => one(sum(inputs), formatMarketCount),
  'change-percent': inputs => {
    const current = sum(byRole(inputs, 'current')), previous = sum(byRole(inputs, 'previous'));
    return current === null || previous === null || previous === 0 ? null : formatMarketChange((current - previous) / previous);
  },
  'share-percent': inputs => {
    const part = sum(byRole(inputs, 'part')), total = sum(byRole(inputs, 'total'));
    return part === null || !total ? null : `${Math.round(part / total * 100)}%`;
  },
  'share-percent-1': inputs => {
    const part = sum(byRole(inputs, 'part')), total = sum(byRole(inputs, 'total'));
    return part === null || !total ? null : marketPercent1(part / total * 100);
  },
  count: inputs => {
    const list = inputs.length === 1 ? inputs[0]!.value : undefined;
    return String(Array.isArray(list) ? list.length : inputs.length);
  },
  'date-range': inputs => one(range(inputs), ({ start, end }) => formatMarketRange(start, end)),
  'previous-range': inputs => one(range(inputs), ({ start, end }) => {
    const previous = marketPreviousPeriod(start, end);
    return formatMarketRange(previous.startDate, previous.endDate);
  }),
  'period-length': inputs => one(range(inputs), ({ start, end }) => {
    const days = Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1;
    return days >= 365 ? '12' : String(days);
  }),
  'month-year': inputs => one(isoDay(byRole(inputs, 'start')[0]?.value), day => `${day.slice(5, 7)}/${day.slice(0, 4)}`),
  'vi-date': inputs => one(isoDay(inputs[0]?.value), marketViDate),
  'vi-date-range': inputs => one(range(inputs), ({ start, end }) => `${marketViDate(start)}–${marketViDate(end)}`),
  'reader-money': inputs => typeof inputs[0]?.value === 'string' ? formatReaderNumber(inputs[0].value, 'money') : null,
  'reader-count': inputs => typeof inputs[0]?.value === 'string' ? formatReaderNumber(inputs[0].value, 'count') : null,
  'reader-decimal': inputs => typeof inputs[0]?.value === 'string' ? formatReaderNumber(inputs[0].value, 'decimal') : null,
  quarter: inputs => one(range(inputs), ({ start, end }) => String(marketMainQuarter(start, end).quarter)),
  year: inputs => one(range(inputs), ({ start, end }) => String(marketMainQuarter(start, end).year)),
  'vi-number': inputs => one(num(inputs[0]?.value), value => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })),
  'search-week': inputs => typeof inputs[0]?.value === 'string' ? searchInterestPeriodText(inputs[0].value, false) : null,
  'search-day': inputs => typeof inputs[0]?.value === 'string' ? searchInterestPeriodText(inputs[0].value, true) : null,
  'sum-number': inputs => one(sum(inputs), value => value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })),
  'millions-vnd': inputs => one(num(inputs[0]?.value), marketMillionsVnd),
  'vn-day': inputs => {
    const value = inputs[0]?.value, time = typeof value === 'string' ? Date.parse(value) : Number.NaN;
    return Number.isNaN(time) ? null : marketVietnamDay(value as string);
  },
  'day-count': inputs => one(range(inputs), ({ start, end }) => String(Math.round((Date.parse(end) - Date.parse(start)) / DAY_MS) + 1)),
  // A value label drawn by the chart engine: the plotted value (sum of `part` ÷ 1e6, or 100 × part ÷ total) rounded at the label's own precision.
  'chart-label': (inputs, token) => {
    const part = sum(byRole(inputs, 'part')), total = byRole(inputs, 'total').length ? sum(byRole(inputs, 'total')) : null;
    if (part === null || total === 0) return null;
    const plotted = total === null ? part / 1e6 : 100 * part / total;
    // The label may carry the chart's unit («21 triệu»): its number is read before the unit.
    const text = /^-?[\d.,]+/u.exec(normalizeMarketNumber(token))?.[0] ?? '', decimals = /,(\d+)$/u.exec(text)?.[1]?.length ?? 0;
    const printed = Number(text.replace(/\./gu, '').replace(',', '.'));
    return Number.isFinite(printed) && Math.abs(printed - plotted) <= 0.5 * 10 ** -decimals + 1e-9 ? token : plotted.toLocaleString('vi-VN', { maximumFractionDigits: decimals });
  },
  // A timestamp base (the run's creation time) counts from its Vietnam calendar day (UTC+7).
  'date-plus-days': inputs => {
    const stored = byRole(inputs, 'base')[0]?.value, time = typeof stored === 'string' && stored.includes('T') ? Date.parse(stored) : Number.NaN;
    const base = Number.isFinite(time) ? new Date(time + 7 * 3_600_000).toISOString().slice(0, 10) : isoDay(stored), offset = num(byRole(inputs, 'offset')[0]?.value);
    return base === null || offset === null ? null : marketViDate(new Date(Date.parse(`${base}T00:00:00Z`) + offset * DAY_MS).toISOString().slice(0, 10));
  },
};

// --- the gate ---

export interface MarketUntracedNumber { readonly token: string; readonly block: string; readonly context: string }
export interface MarketTraceMismatch { readonly token: string; readonly blockId: string; readonly reason: string }
export interface MarketTraceBlockCount {
  readonly block: string;
  readonly numbers: number;
  readonly traced: number;
  readonly allowed: number;
  readonly untraced: number;
  /** Not-covered blocks: where their numbers come from (the follow-up package). */
  readonly source?: string;
}

export interface MarketNumberTraceGateResult {
  readonly contractVersion: typeof MARKET_NUMBER_TRACE_GATE_VERSION;
  readonly ok: boolean;
  /** Untraced numbers in covered blocks; must be 0 to deliver. */
  readonly coveredUntraced: number;
  /** Untraced numbers in not-covered blocks; counted, not blocking. */
  readonly notCoveredUntraced: number;
  readonly covered: readonly MarketTraceBlockCount[];
  readonly notCovered: readonly MarketTraceBlockCount[];
  /** Covered-block numbers with no trace entry: token, block and context. */
  readonly untraced: readonly MarketUntracedNumber[];
  readonly notCoveredList: readonly MarketUntracedNumber[];
  /** Entries whose formula does not give the printed token, or whose input value differs at its pointer. */
  readonly mismatches: readonly MarketTraceMismatch[];
  /** Entries whose inputs were re-read at their pointers (a resolver was given for their store). */
  readonly replayedPointers: number;
}

export interface MarketNumberTraceGateOptions {
  /** Re-reads an input at its pointer; undefined when this store is not available to the check. */
  readonly resolve?: (input: MarketTraceInput) => unknown;
}

const sameValue = (stored: unknown, recorded: MarketTraceValue | undefined): boolean => {
  if (recorded === undefined) return false;
  if (Array.isArray(recorded)) return Array.isArray(stored) && stored.length === recorded.length && stored.every((item, i) => sameValue(item, recorded[i]));
  const day = isoDay(recorded);
  if (day && /^\d{4}-?\d{2}-?\d{2}$/u.test(String(recorded))) return isoDay(stored as MarketTraceValue) === day;
  if (typeof recorded === 'number') return num(stored as MarketTraceValue) === recorded;
  return String(stored) === recorded;
};

function replay(entry: MarketNumberTraceEntry, options: MarketNumberTraceGateOptions): { reason: string | null; resolved: boolean } {
  if (!entry.inputs.length) return { reason: 'no input', resolved: false };
  if (!entry.formulaId) return { reason: 'no registered formula', resolved: false };
  const formula = MARKET_TRACE_FORMULAS[entry.formulaId];
  if (!formula) return { reason: `unknown formula ${entry.formulaId}`, resolved: false };
  let resolved = false;
  for (const input of entry.inputs) {
    const stored = options.resolve?.(input);
    if (stored === undefined) continue;
    resolved = true;
    if (!sameValue(stored, input.value)) return { reason: `input value differs at its pointer (${'store' in input ? input.pointer : input.jsonPath})`, resolved };
  }
  const expected = formula(entry.inputs, entry.token);
  if (expected === null) return { reason: `${entry.formulaId}: inputs incomplete`, resolved };
  return { reason: normalizeMarketNumber(expected) === normalizeMarketNumber(entry.token) ? null : `${entry.formulaId} gives «${expected}»`, resolved };
}

/**
 * Checks the delivered page against its trace map: every visible number of a covered block must
 * consume one entry with the same token in the same block, and every entry must replay.
 */
export function checkMarketNumberTrace(html: string, trace: MarketNumberTrace, options: MarketNumberTraceGateOptions = {}): MarketNumberTraceGateResult {
  const mismatches: MarketTraceMismatch[] = [];
  let replayedPointers = 0;
  const pool = new Map<string, Map<string, number>>();
  for (const entry of trace.entries) {
    const { reason, resolved } = replay(entry, options);
    if (resolved) replayedPointers++;
    if (reason) { mismatches.push({ token: entry.token, blockId: entry.blockId, reason }); continue; }
    const block = entry.blockId.split('.')[0]!;
    const tokens = pool.get(block) ?? new Map<string, number>();
    pool.set(block, tokens);
    for (const token of marketNumberTokens(entry.token)) tokens.set(token, (tokens.get(token) ?? 0) + 1);
  }
  const counts = new Map<string, { numbers: number; traced: number; allowed: number; untraced: number }>();
  const untraced: MarketUntracedNumber[] = [], notCoveredList: MarketUntracedNumber[] = [];
  for (const number of scanMarketReportNumbers(html)) {
    const count = counts.get(number.block) ?? { numbers: 0, traced: 0, allowed: 0, untraced: 0 };
    counts.set(number.block, count);
    count.numbers++;
    if (number.allowed) { count.allowed++; continue; }
    const tokens = pool.get(number.block);
    const left = tokens?.get(number.token) ?? 0;
    if (left > 0) { tokens!.set(number.token, left - 1); count.traced++; continue; }
    count.untraced++;
    (number.block in MARKET_TRACE_NOT_COVERED ? notCoveredList : untraced).push({ token: number.token, block: number.block, context: number.context });
  }
  const rows = [...counts].map(([block, count]) => ({ block, ...count }));
  const covered = rows.filter(row => !(row.block in MARKET_TRACE_NOT_COVERED));
  const notCovered = rows.filter(row => row.block in MARKET_TRACE_NOT_COVERED).map(row => ({ ...row, source: MARKET_TRACE_NOT_COVERED[row.block]! }));
  return {
    contractVersion: MARKET_NUMBER_TRACE_GATE_VERSION,
    ok: untraced.length === 0 && mismatches.length === 0,
    coveredUntraced: untraced.length,
    notCoveredUntraced: notCoveredList.length,
    covered, notCovered, untraced, notCoveredList, mismatches, replayedPointers,
  };
}

/** Gate rows for the Market check: N01 (untraced number in a covered block) and N02 (entry does not replay). */
export function marketNumberTraceRows(result: MarketNumberTraceGateResult): { rule: string; ok: boolean; detail: string }[] {
  const list = (items: readonly { token: string }[], describe: (item: never) => string): string => items.slice(0, 20).map(item => describe(item as never)).join('; ');
  return [
    { rule: 'N01_UNTRACED_NUMBER', ok: result.coveredUntraced === 0, detail: result.coveredUntraced === 0
      ? `0 untraced in covered blocks; ${result.notCoveredUntraced} untraced in not-covered blocks (not blocking)`
      : `${result.coveredUntraced} untraced: ${list(result.untraced, (item: MarketUntracedNumber) => `${item.block} «${item.token}» in «${item.context}»`)}` },
    { rule: 'N02_TRACE_REPLAY', ok: result.mismatches.length === 0, detail: result.mismatches.length === 0
      ? `every entry replays (${result.replayedPointers} re-read at their pointers)`
      : `${result.mismatches.length} entries do not replay: ${list(result.mismatches, (item: MarketTraceMismatch) => `${item.blockId} «${item.token}»: ${item.reason}`)}` },
  ];
}
