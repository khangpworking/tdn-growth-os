/**
 * Market scale blocks drawn from raw-response numbers (`readMarketRawSeries`):
 * KPI cards with the change against the previous period, the per-platform
 * split with «Cộng 2 sàn», and one interval chart per period with one line per
 * platform (never a summed line). Every printed number is recorded in the
 * trace map; every sentence comes from the rule functions below.
 *
 * Optional input: reports without `marketRawSeries` keep their current output.
 */
import { escapeHtml as escape } from './descriptive-report.js';
import { MARKET_RAW_PLATFORM_IDS, MARKET_RAW_SCOPE_PLATFORM_IDS, marketRawPeriodEndSource, type MarketRawInterval, type MarketRawKpiField,
  type MarketRawSeries, type MarketRawSource, type MarketRawTotalValue } from './market-raw-series.js';
import { marketCaptureScopeLine, type MarketCaptureScope } from './market-scope-report.js';
import type { MarketCaptureTrace, MarketNumberTraceCollector } from './market-trace-map.js';

/** One captured period: the stored raw-responses capture and the series read from it. */
export interface MarketRawCapturePeriod {
  /** Identity of the stored raw-responses capture (e.g. its capture artifact sha256); every trace input names it. */
  readonly captureId: string;
  /** `readMarketRawSeries` output of that capture. */
  readonly series: MarketRawSeries;
}

export interface MarketRawReportInput {
  /** One entry per captured period (e.g. 30 days, 12 months), in print order. */
  readonly periods: readonly MarketRawCapturePeriod[];
  /** Search settings of the capture, from the run record. */
  readonly scope: MarketCaptureScope;
}

const DAY_MS = 86_400_000;
const PLATFORMS = [
  { id: MARKET_RAW_PLATFORM_IDS.shopee, key: 'shopee', label: 'Shopee', color: '#ee4d2d' },
  { id: MARKET_RAW_PLATFORM_IDS.tiktok, key: 'tiktok', label: 'TikTok Shop', color: '#111827' },
] as const;
const KPI_LABELS: Readonly<Record<MarketRawKpiField, { card: string; metric: string; money: boolean }>> = {
  revenue: { card: 'Doanh thu', metric: 'doanh thu', money: true },
  units: { card: 'Đơn vị bán', metric: 'đơn vị bán', money: false },
  products: { card: 'Sản phẩm có bán', metric: 'số sản phẩm có bán', money: false },
  shops: { card: 'Gian hàng có bán', metric: 'số gian hàng có bán', money: false },
};

// --- formatting (one place; the trace formulas name the same rules) ---

const SCALES = [[1e9, 'tỷ'], [1e6, 'triệu'], [1e3, 'nghìn']] as const;
const SCALE_FORMULA = '≥1e9 tỷ, ≥1e6 triệu, ≥1e3 nghìn, 1 chữ số thập phân (vi-VN); dưới 1e3 làm tròn số nguyên';
const decimal1 = (value: number): string => value.toLocaleString('vi-VN', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function scaled(value: number, below: string): string {
  const scale = SCALES.find(([divisor]) => Math.abs(value) >= divisor);
  return scale ? `${decimal1(value / scale[0])} ${scale[1]}` : `${Math.round(value).toLocaleString('vi-VN')}${below}`;
}
export const formatMarketMoney = (value: number): string => scaled(value, ' đồng');
export const formatMarketCount = (value: number): string => scaled(value, '');
/** Signed whole percent, e.g. «+12%», «−5%», «0%». */
export function formatMarketChange(change: number): string {
  const percent = Math.round(change * 100);
  return percent > 0 ? `+${percent}%` : percent < 0 ? `−${-percent}%` : '0%';
}
const arrow = (token: string): string => token.startsWith('+') ? '▲ ' : token.startsWith('−') ? '▼ ' : '';

const iso = (time: number): string => new Date(time).toISOString().slice(0, 10);
const dayTime = (date: string): number => Date.parse(`${date}T00:00:00Z`);
const dm = (date: string): string => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
const dmy = (date: string): string => `${dm(date)}/${date.slice(0, 4)}`;
/** «20/09–19/10/2026», or with both years when they differ. */
export const formatMarketRange = (start: string, end: string): string => start.slice(0, 4) === end.slice(0, 4) ? `${dm(start)}–${dmy(end)}` : `${dmy(start)}–${dmy(end)}`;

/** The period of the same length that ends the day before `start`. */
export function marketPreviousPeriod(start: string, end: string): { startDate: string; endDate: string } {
  const days = Math.round((dayTime(end) - dayTime(start)) / DAY_MS) + 1;
  const previousEnd = dayTime(start) - DAY_MS;
  return { startDate: iso(previousEnd - (days - 1) * DAY_MS), endDate: iso(previousEnd) };
}

/** A sibling field of a raw source (e.g. an interval's `start_date` next to its revenue). */
function siblingSource(source: MarketRawSource, field: string): MarketRawSource {
  const swap = (path: string): string => path.replace(/\/[^/]*$/u, `/${field}`);
  return source.encoding === 'json-string' ? { ...source, decodedPath: swap(source.decodedPath ?? '') } : { ...source, jsonPath: swap(source.jsonPath) };
}

// --- sentences by rule (one place) ---

export type MarketTrendWord = 'tăng đều' | 'giảm đều' | 'tăng nhưng dao động' | 'giảm nhưng dao động' | 'đi ngang';

/** Fixed sentence in place of a trend word when an interval of the series is missing. */
export const MARKET_TREND_MISSING = 'chưa đủ dữ liệu để nhận xét xu hướng';

/**
 * Trend of a series: «tăng đều» only when every step rises, «giảm đều» only
 * when every step falls; otherwise first against last decides «tăng/giảm nhưng
 * dao động», and equal first and last is «đi ngang». Null below two values or
 * when any value is missing: a gap never becomes a trend.
 */
export function marketTrendWord(series: readonly (number | null)[]): MarketTrendWord | null {
  if (series.length < 2 || series.some(value => value === null)) return null;
  const values = series as readonly number[];
  const steps = values.slice(1).map((value, i) => value - values[i]!);
  if (steps.every(step => step > 0)) return 'tăng đều';
  if (steps.every(step => step < 0)) return 'giảm đều';
  const first = values[0]!, last = values[values.length - 1]!;
  return last > first ? 'tăng nhưng dao động' : last < first ? 'giảm nhưng dao động' : 'đi ngang';
}

/** Comparison note of R-M35: which metric, against which period, with dates. */
export function marketChangeNote(metric: string, periodLabel: string, previousRange: string): string {
  return `(${metric}, so với ${periodLabel} trước: ${previousRange})`;
}

// --- blocks ---

type Point = { readonly interval: MarketRawInterval; readonly value: number | null; readonly source: MarketRawSource | null };
type Line = (typeof PLATFORMS)[number] & { readonly points: ReadonlyMap<string, Point>; readonly undated: number; readonly hasData: boolean };

/** The period as printed: «30 ngày» / «12 tháng», its dates and the previous period's dates, recorded at every place they print. */
interface PeriodText {
  readonly key: string;
  text(blockId: string): string;
  range(blockId: string): string;
  previous(blockId: string): string;
}

function periodText(period: Extract<MarketRawSeries['period'], { startDate: string }>, trace: MarketCaptureTrace): PeriodText {
  const end = marketRawPeriodEndSource(period.source);
  const inputs = end ? [period.source, end] : [period.source];
  const year = period.days >= 365;
  const previous = marketPreviousPeriod(period.startDate, period.endDate);
  return {
    key: year ? '12m' : `${period.days}d`,
    text: blockId => `${trace.record(year ? '12' : String(period.days), blockId, 'computed', inputs,
      year ? 'inclusive days of the request period ≥ 365 → 12 tháng' : 'inclusive days from request start_date to end_date')} ${year ? 'tháng' : 'ngày'}`,
    range: blockId => trace.record(formatMarketRange(period.startDate, period.endDate), blockId, 'raw', inputs, 'request start_date–end_date, dd/mm[/yyyy]'),
    previous: blockId => trace.record(formatMarketRange(previous.startDate, previous.endDate), blockId, 'computed', inputs,
      'same length as the request period, ending the day before its start_date; dd/mm[/yyyy]'),
  };
}

function totalCard(field: MarketRawKpiField, series: MarketRawSeries, period: PeriodText, trace: MarketCaptureTrace, blockId: string): string {
  const total: MarketRawTotalValue = series.totals.all.kpi[field];
  const name = KPI_LABELS[field];
  if (total.value === null) return `<div class="kpi" data-kpi="${field}"><b>Chưa có số</b><span>${escape(name.card)}</span></div>`;
  const format = name.money ? formatMarketMoney : formatMarketCount;
  const value = trace.record(format(total.value), `${blockId}.${field}`, total.members.length > 1 ? 'computed' : 'raw', total.members,
    `${total.members.length > 1 ? 'sum(platform values); ' : ''}${SCALE_FORMULA}`);
  const change = series.totals.all.change[field];
  const previous = series.totals.all.previous[field];
  const changeHtml = change.value === null ? '' : (() => {
    const token = trace.record(formatMarketChange(change.value), `${blockId}.${field}.change`, 'computed', [...total.members, ...previous.members],
      'round((current - previous) / previous × 100)%, signed');
    const note = `${blockId}.${field}.change.note`;
    return ` <span class="chg">${arrow(token)}${escape(token)}</span> <small class="cmp-note">${escape(marketChangeNote(name.metric, period.text(note), period.previous(note)))}</small>`;
  })();
  return `<div class="kpi" data-kpi="${field}"><b>${escape(value)}</b><span>${escape(name.card)}</span>${changeHtml}</div>`;
}

function platformSplit(series: MarketRawSeries, period: PeriodText, trace: MarketCaptureTrace, blockId: string): string {
  const byId = new Map(series.platforms.map(platform => [platform.platformId, platform] as const));
  const scope = series.totals.scope;
  const scoped = scope.platformIds.length === MARKET_RAW_SCOPE_PLATFORM_IDS.length && scope.platformIds.every(id => MARKET_RAW_SCOPE_PLATFORM_IDS.includes(id));
  const total = scoped ? scope.kpi.revenue : null;
  // The «2» of «Cộng 2 sàn» is data: the scope's platform count, traced to the request's platform list.
  const countInputs = series.requestedPlatformsSource ? [series.requestedPlatformsSource]
    : series.platforms.flatMap(platform => Object.values(platform.kpi).flatMap(value => value.source ? [value.source] : []));
  const totalLabel = (at: string): string => countInputs.length
    ? `Cộng ${trace.record(String(scope.platformIds.length), `${blockId}.${at}.count`, 'computed', countInputs, 'count(scope platforms)')} sàn`
    : 'tổng các sàn trong phạm vi';
  const parts = PLATFORMS.map(platform => {
    const revenue = byId.get(platform.id)?.kpi.revenue;
    if (!revenue || revenue.value === null) return `${platform.label} chưa có số doanh thu`;
    const value = trace.record(formatMarketMoney(revenue.value), `${blockId}.${platform.key}`, 'raw', [revenue.source], SCALE_FORMULA);
    const share = total && total.value !== null && total.value > 0
      ? ` (${trace.record(`${Math.round(revenue.value / total.value * 100)}%`, `${blockId}.${platform.key}.share`, 'computed', [revenue.source, ...total.members],
        'round(platform revenue / Cộng 2 sàn revenue × 100)%')})` : '';
    return `${platform.label} ${escape(value)}${share}`;
  });
  const sum = total && total.value !== null
    ? ` · ${escape(totalLabel('scope'))} ${escape(trace.record(formatMarketMoney(total.value), `${blockId}.scope`, 'computed', total.members, `sum(Shopee, TikTok Shop revenue); ${SCALE_FORMULA}`))}`
    + ` <small class="cmp-note">${escape(`(tỷ lệ = doanh thu từng sàn ÷ doanh thu ${totalLabel('note')}, cùng kỳ ${period.text(`${blockId}.note`)}: ${period.range(`${blockId}.note`)})`)}</small>`
    : ` <small class="cmp-note">Chưa nêu ${escape(totalLabel('missing'))} vì thiếu số doanh thu của một sàn.</small>`;
  return `<p data-market-raw-split="${escape(blockId)}">${parts.join(' · ')}${sum}</p>`;
}

/**
 * One line per platform over the same interval axis; partial intervals are hollow points. A missing interval
 * breaks the line at its date; a platform with no numbers keeps its legend entry, marked «không có dữ liệu».
 * No axis numbers: values are in the table below.
 */
function intervalSvg(axis: readonly string[], lines: readonly Line[], labels: readonly string[]): string {
  const w = 760, h = 260, left = 24, right = 24, top = 30, bottom = 46;
  const values = lines.flatMap(line => [...line.points.values()].flatMap(point => point.value === null ? [] : [point.value]));
  const max = Math.max(0, ...values) || 1;
  const X = (i: number): number => left + i * (w - left - right) / Math.max(1, axis.length - 1);
  const Y = (value: number): number => top + (h - top - bottom) * (1 - value / max);
  let body = '', legend = left;
  for (const line of lines) {
    const name = line.hasData ? line.label : `${line.label}: không có dữ liệu`;
    body += `<rect x="${legend}" y="6" width="11" height="11" fill="${line.hasData ? line.color : '#fff'}" stroke="${line.color}"/><text x="${legend + 15}" y="16" class="lg">${escape(name)}</text>`;
    legend += 40 + name.length * 7;
    if (!line.hasData) continue;
    const coords = axis.map((key, i) => { const point = line.points.get(key); return point && point.value !== null ? { i, point, value: point.value } : null; });
    // Each run of known intervals is its own segment, so a missing interval stays a gap at its date.
    let run: string[] = [];
    const flush = (): void => { if (run.length > 1) body += `<polyline data-platform="${line.key}" fill="none" stroke="${line.color}" stroke-width="2.5" points="${run.join(' ')}"/>`; run = []; };
    for (const coord of coords) if (coord) run.push(`${X(coord.i).toFixed(1)},${Y(coord.value).toFixed(1)}`); else flush();
    flush();
    for (const coord of coords) if (coord) body += `<circle data-platform="${line.key}" cx="${X(coord.i).toFixed(1)}" cy="${Y(coord.value).toFixed(1)}" r="3.5" fill="${coord.point.interval.partial ? '#fff' : line.color}" stroke="${line.color}"/>`;
  }
  axis.forEach((_, i) => { body += `<text x="${X(i).toFixed(1)}" y="${h - bottom + 20}" class="ax" text-anchor="middle">${escape(labels[i]!)}</text>`; });
  return `<svg viewBox="0 0 ${w} ${h}" role="img" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function intervalBlock(series: MarketRawSeries, period: PeriodText, trace: MarketCaptureTrace, blockId: string): string {
  const monthly = series.intervalDays.value !== null && series.intervalDays.value >= 28;
  // Missing interval metadata does not establish a weekly frequency.
  const frequency = series.intervalDays.value === null ? 'unknown' : monthly ? 'monthly' : 'weekly';
  const unit = frequency === 'unknown' ? 'kỳ' : monthly ? 'tháng' : 'tuần';
  const byId = new Map(series.platforms.map(platform => [platform.platformId, platform] as const));
  // Every interval stays, null revenue included; only an interval without dates has no place on the axis.
  const lines: Line[] = PLATFORMS.map(platform => {
    const points = new Map<string, Point>();
    let undated = 0;
    for (const interval of byId.get(platform.id)?.intervals ?? []) {
      if (interval.startDate && interval.endDate) points.set(`${interval.startDate}|${interval.endDate}`, { interval, value: interval.revenue.value, source: interval.revenue.source });
      else undated++;
    }
    return { ...platform, points, undated, hasData: [...points.values()].some(point => point.value !== null) };
  });
  if (!lines.some(line => line.points.size)) return `<p>Chưa có số doanh thu theo ${unit} của Shopee và TikTok Shop cho kỳ này.</p>`;
  const axis = [...new Set(lines.flatMap(line => [...line.points.keys()]))].sort();
  const sample = (key: string): Point => lines.map(line => line.points.get(key)).find(point => point?.source)
    ?? lines.map(line => line.points.get(key)).find(point => point !== undefined)!;
  // Interval dates print as stored; full months print as mm/yyyy.
  const label = (key: string, block: string): string => {
    const { interval, source } = sample(key);
    const inputs = source ? [siblingSource(source, 'start_date'), siblingSource(source, 'end_date')] : [];
    if (monthly && !interval.partial) return trace.record(`${interval.startDate!.slice(5, 7)}/${interval.startDate!.slice(0, 4)}`, block, 'raw', inputs, 'mm/yyyy of start_date');
    return trace.record(formatMarketRange(interval.startDate!, interval.endDate!), block, 'raw', inputs, 'start_date–end_date, dd/mm[/yyyy]');
  };
  const short = (block: string): string => monthly ? 'tháng' : series.intervalDays.value !== null && series.intervalDays.source
    ? `${trace.record(String(series.intervalDays.value), block, 'raw', [series.intervalDays.source], 'interval_days of the request')} ngày` : 'kỳ';
  const axisLabels = axis.map(key => label(key, `${blockId}.axis`));
  let missing = false;
  const rows = axis.map(key => {
    const interval = sample(key).interval;
    // A partial interval's label is already its exact dates.
    const partial = interval.partial ? ` <small>(chưa đủ ${short(`${blockId}.table.partial`)})</small>` : '';
    const cells = lines.map(line => {
      const point = line.points.get(key);
      if (!line.hasData) return '<td>không có dữ liệu</td>';
      if (!point || point.value === null || !point.source) { missing = true; return '<td>thiếu</td>'; }
      return `<td>${escape(trace.record(formatMarketMoney(point.value), `${blockId}.table.${line.key}`, 'raw', [point.source], SCALE_FORMULA))}</td>`;
    }).join('');
    return `<tr${interval.partial ? ' data-period-incomplete="true"' : ''}><td>${escape(label(key, `${blockId}.table`))}${partial}</td>${cells}</tr>`;
  }).join('');
  const trends = lines.map(line => {
    if (!line.hasData) return `${line.label}: không có dữ liệu theo ${unit} trong kỳ này.`;
    // Any missing interval (null revenue, no dates, or absent where the other platform has one) leaves the trend unsaid.
    const all = axis.map(key => line.points.get(key)?.value ?? null);
    if (line.undated || all.some(value => value === null)) return `${line.label}: ${MARKET_TREND_MISSING}.`;
    const full = axis.flatMap(key => { const point = line.points.get(key)!; return point.interval.partial === false && point.source ? [{ key, point, source: point.source }] : []; });
    const word = marketTrendWord(full.map(({ point }) => point.value));
    if (!word) return `${line.label}: chưa đủ ${unit} đủ ngày để nói xu hướng.`;
    const first = full[0]!, last = full[full.length - 1]!;
    const block = `${blockId}.trend.${line.key}`;
    const amount = (entry: typeof first): string =>
      `${trace.record(formatMarketMoney(entry.point.value!), block, 'raw', [entry.source], SCALE_FORMULA)} (${label(entry.key, block)})`;
    return `${line.label}: ${word}, từ ${amount(first)} đến ${amount(last)} (doanh thu từng ${unit} đủ ngày).`;
  });
  const absent = lines.filter(line => !line.hasData).map(line => line.label);
  const notes = ['Mỗi sàn một đường riêng; biểu đồ không có đường tổng.',
    ...(absent.length ? [`${absent.join(', ')}: không có dữ liệu theo ${unit} trong kỳ này, nên không có đường.`] : []),
    ...(missing ? [`Chỗ đứt của đường là ${unit} thiếu doanh thu, ghi «thiếu» ở bảng; không phải bằng không.`] : []),
    ...(axis.some(key => sample(key).interval.partial) ? [`Điểm rỗng là ${unit} chưa đủ ngày, ghi đúng ngày ở bảng; không dùng để nói xu hướng.`] : [])];
  const missingPlatforms = lines.filter(line => !line.hasData).map(line => line.key).join(' ');
  return `<figure class="market-raw-line" data-market-raw-chart="${frequency}" data-series-count="${lines.length - absent.length}"${missingPlatforms ? ` data-platform-missing="${missingPlatforms}"` : ''}>`
    + `<div class="exh"><span class="ext">${escape(`Doanh thu theo ${unit}, từng sàn, kỳ ${period.text(`${blockId}.title`)}: ${period.range(`${blockId}.title`)}`)}</span></div>`
    + intervalSvg(axis, lines, axisLabels) + '</figure>'
    + `<p class="lim"><b>Chú thích:</b> ${escape(notes.join(' '))}</p>`
    + `<div class="table-wrap" role="region" aria-label="${escape(`Doanh thu theo ${unit}, từng sàn`)}" tabindex="0"><table data-market-raw-intervals="${frequency}" data-reading=""><caption>${escape(`Doanh thu theo ${unit}, từng sàn`)}</caption>`
    + `<thead><tr><th>Kỳ</th>${PLATFORMS.map(platform => `<th>${platform.label} (doanh thu)</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
    + '<p class="lim"><b>Chú thích:</b> Doanh thu ước tính trên sàn của từng kỳ, đọc riêng từng sàn; ô «thiếu» là kỳ nguồn không ghi doanh thu, không phải bằng không.</p>'
    + `<p>${trends.map(escape).join(' ')}</p>`;
}

function periodBlock(entry: MarketRawCapturePeriod, collector: MarketNumberTraceCollector): string {
  const { series } = entry;
  const trace = collector.forCapture(entry.captureId);
  if (series.period.startDate === null) return '<p>Chưa đọc được kỳ của số liệu thị trường; không in số của kỳ này.</p>';
  const period = periodText(series.period, trace);
  const blockId = `M03.${period.key}`;
  const count = series.totals.all.platformIds.length;
  const countInputs = series.platforms.flatMap(platform => Object.values(platform.kpi).flatMap(value => value.source ? [value.source] : []));
  const allLabel = count && countInputs.length
    ? `cả ${trace.record(String(count), `${blockId}.kpi`, 'computed', countInputs, 'count(platforms in the response)')} sàn` : 'các sàn';
  const cards = (Object.keys(KPI_LABELS) as MarketRawKpiField[]).map(field => totalCard(field, series, period, trace, `${blockId}.kpi`)).join('');
  return `<section class="market-raw-period" data-market-raw-period="${period.key}"><h3>${escape(`${period.text(`${blockId}.head`)} · ${period.range(`${blockId}.head`)}`)}</h3>`
    + `<p>${escape(`Số của ${allLabel}, ước tính trên sàn.`)}</p><div class="grid4">${cards}</div>`
    + platformSplit(series, period, trace, `${blockId}.split`)
    + intervalBlock(series, period, trace, `${blockId}.intervals`) + '</section>';
}

/** Phần 3 scale blocks from raw-response numbers, one per captured period. */
export function marketRawScaleSection(input: MarketRawReportInput, trace: MarketNumberTraceCollector): string {
  const periods = input.periods.filter(entry => entry.series.platforms.length > 0);
  if (!periods.length) return '';
  return `<div class="market-raw-scale"><h3>Quy mô và diễn biến theo kỳ</h3>${periods.map(entry => periodBlock(entry, trace)).join('')}</div>`;
}

/** Numbers inside stored text, cut as the HTML number scan cuts them («kẽm 50mg B12» -> 50, 12). */
const TEXT_NUMBER = /[+−-]?\d+(?:[.,]\d+)*(?:\s*(?:tỷ|triệu|nghìn|đồng|%|phần trăm))?/gu;

/**
 * Phần 2 scope line of the raw-response numbers. Each number inside a keyword is recorded against the
 * keyword the capture's search request sent; one inside the category text against the category's pointer.
 * A text whose numbers have no pointer is withheld rather than printed untraced.
 */
export function marketRawScopeSection(input: MarketRawReportInput, collector: MarketNumberTraceCollector): string {
  const pointer = (text: string, part: 'keyword' | 'category'): { captureId: string; source: MarketRawSource } | null => {
    if (part === 'category') {
      const stored = input.scope.category?.source;
      if (!stored) return null;
      const { captureId, ...source } = stored;
      return { captureId, source };
    }
    for (const entry of input.periods) {
      const query = entry.series.requestedQueries.find(candidate => candidate.text === text);
      if (query) return { captureId: entry.captureId, source: query.source };
    }
    return null;
  };
  return marketCaptureScopeLine(input.scope, (text, part, index) => {
    const numbers = text.match(TEXT_NUMBER) ?? [];
    if (!numbers.length) return text;
    const found = pointer(text, part);
    if (!found) return null;
    const trace = collector.forCapture(found.captureId);
    const block = part === 'keyword' ? `M02.scope.keyword.${index}` : 'M02.scope.category';
    const formula = part === 'keyword' ? 'number as written in the keyword the search request sent (include_query.queries)' : 'number as written in the stored category text';
    for (const number of numbers) trace.record(number, block, 'raw', [found.source], formula);
    return text;
  });
}
