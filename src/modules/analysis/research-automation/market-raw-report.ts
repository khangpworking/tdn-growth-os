/**
 * Market scale blocks drawn from raw-response numbers (`readMarketRawSeries`):
 * KPI cards with the change against the previous period, the per-platform
 * split with «Cộng 2 sàn», and one interval chart per period with one line per
 * platform (never a summed line). Every printed number is recorded in the
 * trace map; every sentence comes from the rule functions below.
 *
 * Optional input: reports without `marketRawSeries` keep their current output.
 */
import { renderChart, type FlintChartInput, type RenderedChart } from '../reader-report/flint.js';
import { escapeHtml as escape } from './descriptive-report.js';
import { MARKET_RAW_PLATFORM_IDS, MARKET_RAW_SCOPE_PLATFORM_IDS, marketRawPeriodEndSource, type MarketRawInterval, type MarketRawKpiField,
  type MarketRawSeries, type MarketRawSource, type MarketRawTotalValue } from './market-raw-series.js';
import { marketCaptureScopeLine, type MarketCaptureScope } from './market-scope-report.js';
import type { MarketCaptureTrace, MarketNumberTraceCollector, MarketTraceInput, MarketTraceRole, MarketTraceValue } from './market-trace-map.js';

/** One captured period: the stored raw-responses capture and the series read from it. */
export interface MarketRawCapturePeriod {
  /** Identity of the stored raw-responses capture (e.g. its capture artifact sha256); every trace input names it. */
  readonly captureId: string;
  /** `readMarketRawSeries` output of that capture. */
  readonly series: MarketRawSeries;
  /** The stored raw-responses content itself, when the caller holds it: the number-trace gate re-reads every pointer in it. */
  readonly raw?: unknown;
}

export interface MarketRawReportInput {
  /** One entry per captured period (e.g. 30 days, 12 months), in print order. */
  readonly periods: readonly MarketRawCapturePeriod[];
  /** Search settings of the capture, from the run record. */
  readonly scope: MarketCaptureScope;
  /** Interval charts drawn before the synchronous build (`renderMarketRawCharts`); without them the hand-drawn SVG prints. */
  readonly charts?: readonly MarketRawChart[];
}

/** One interval chart, keyed by the block id of its period (e.g. `M03.30d.intervals`). */
export type MarketRawChart = RenderedChart & { readonly id: string };

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

/** A trace input: the pointer with the value read there and its role in the formula. */
const at = (source: MarketRawSource, value: MarketTraceValue, role?: MarketTraceRole): MarketRawSource & { value: MarketTraceValue; role?: MarketTraceRole } =>
  role ? { ...source, value, role } : { ...source, value };

/** Value of every KPI pointer of a series (current and previous), so a total's members carry their values. */
function kpiValues(series: MarketRawSeries): (source: MarketRawSource) => number {
  const values = new Map<MarketRawSource, number>();
  for (const platform of series.platforms) for (const kpi of [platform.kpi, platform.previous]) for (const value of Object.values(kpi)) {
    if (value.value !== null && value.source) values.set(value.source, value.value);
  }
  return source => {
    const value = values.get(source);
    if (value === undefined) throw new TypeError('MARKET_TRACE_MEMBER_VALUE_MISSING');
    return value;
  };
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

type DatedPeriod = Extract<MarketRawSeries['period'], { startDate: string }>;
const periodKey = (period: DatedPeriod): string => period.days >= 365 ? '12m' : `${period.days}d`;

function periodText(period: DatedPeriod, trace: MarketCaptureTrace): PeriodText {
  const end = marketRawPeriodEndSource(period.source);
  const inputs = end ? [at(period.source, period.startDate, 'start'), at(end, period.endDate, 'end')] : [at(period.source, period.startDate, 'start')];
  const year = period.days >= 365;
  const previous = marketPreviousPeriod(period.startDate, period.endDate);
  return {
    key: periodKey(period),
    text: blockId => `${trace.record(year ? '12' : String(period.days), blockId, 'computed', inputs,
      year ? 'inclusive days of the request period ≥ 365 → 12 tháng' : 'inclusive days from request start_date to end_date', 'period-length')} ${year ? 'tháng' : 'ngày'}`,
    range: blockId => trace.record(formatMarketRange(period.startDate, period.endDate), blockId, 'raw', inputs, 'request start_date–end_date, dd/mm[/yyyy]', 'date-range'),
    previous: blockId => trace.record(formatMarketRange(previous.startDate, previous.endDate), blockId, 'computed', inputs,
      'same length as the request period, ending the day before its start_date; dd/mm[/yyyy]', 'previous-range'),
  };
}

function totalCard(field: MarketRawKpiField, series: MarketRawSeries, period: PeriodText, trace: MarketCaptureTrace, blockId: string): string {
  const total: MarketRawTotalValue = series.totals.all.kpi[field];
  const name = KPI_LABELS[field];
  if (total.value === null) return `<div class="kpi" data-kpi="${field}"><b>Chưa có số</b><span>${escape(name.card)}</span></div>`;
  const format = name.money ? formatMarketMoney : formatMarketCount;
  const valueOf = kpiValues(series);
  const summed = total.members.length > 1;
  const value = trace.record(format(total.value), `${blockId}.${field}`, summed ? 'computed' : 'raw', total.members.map(member => at(member, valueOf(member))),
    `${summed ? 'sum(platform values); ' : ''}${SCALE_FORMULA}`, name.money ? summed ? 'sum-money' : 'money' : summed ? 'sum-count' : 'count-scaled');
  const change = series.totals.all.change[field];
  const previous = series.totals.all.previous[field];
  const changeHtml = change.value === null ? '' : (() => {
    const token = trace.record(formatMarketChange(change.value), `${blockId}.${field}.change`, 'computed',
      [...total.members.map(member => at(member, valueOf(member), 'current')), ...previous.members.map(member => at(member, valueOf(member), 'previous'))],
      'round((current - previous) / previous × 100)%, signed', 'change-percent');
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
  const valueOf = kpiValues(series);
  // The «2» of «Cộng 2 sàn» is data: the scope's platform count, one revenue pointer per scope platform.
  const countInputs = total ? total.members.map(member => at(member, valueOf(member))) : [];
  const totalLabel = (place: string): string => countInputs.length === scope.platformIds.length && countInputs.length
    ? `Cộng ${trace.record(String(scope.platformIds.length), `${blockId}.${place}.count`, 'computed', countInputs, 'count(scope platforms)', 'count')} sàn`
    : 'tổng các sàn trong phạm vi';
  const parts = PLATFORMS.map(platform => {
    const revenue = byId.get(platform.id)?.kpi.revenue;
    if (!revenue || revenue.value === null) return `${platform.label} chưa có số doanh thu`;
    const value = trace.record(formatMarketMoney(revenue.value), `${blockId}.${platform.key}`, 'raw', [at(revenue.source, revenue.value)], SCALE_FORMULA, 'money');
    const share = total && total.value !== null && total.value > 0
      ? ` (${trace.record(`${Math.round(revenue.value / total.value * 100)}%`, `${blockId}.${platform.key}.share`, 'computed',
        [at(revenue.source, revenue.value, 'part'), ...total.members.map(member => at(member, valueOf(member), 'total'))],
        'round(platform revenue / Cộng 2 sàn revenue × 100)%', 'share-percent')})` : '';
    return `${platform.label} ${escape(value)}${share}`;
  });
  const sum = total && total.value !== null
    ? ` · ${escape(totalLabel('scope'))} ${escape(trace.record(formatMarketMoney(total.value), `${blockId}.scope`, 'computed', total.members.map(member => at(member, valueOf(member))),
      `sum(Shopee, TikTok Shop revenue); ${SCALE_FORMULA}`, 'sum-money'))}`
    + ` <small class="cmp-note">${escape(`(tỷ lệ = doanh thu từng sàn ÷ doanh thu ${totalLabel('note')}, cùng kỳ ${period.text(`${blockId}.note`)}: ${period.range(`${blockId}.note`)})`)}</small>`
    // «Cộng 2 sàn» only stands with both platform numbers (R-M16, gate U32), so the missing total is said without it.
    : ' <small class="cmp-note">Chưa cộng doanh thu các sàn vì thiếu số doanh thu của một sàn.</small>';
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

/** One line per platform over the dated intervals of a series; `axis` is every dated interval, in date order. */
function intervalLines(series: MarketRawSeries) {
  const monthly = series.intervalDays.value !== null && series.intervalDays.value >= 28;
  // Missing interval metadata does not establish a weekly frequency.
  const frequency = series.intervalDays.value === null ? 'unknown' : monthly ? 'monthly' : 'weekly';
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
  const axis = [...new Set(lines.flatMap(line => [...line.points.keys()]))].sort();
  const sample = (key: string): Point => lines.map(line => line.points.get(key)).find(point => point?.source)
    ?? lines.map(line => line.points.get(key)).find(point => point !== undefined)!;
  // Interval dates print as stored; full months print as mm/yyyy.
  const labelText = (key: string): string => {
    const { interval } = sample(key);
    return monthly && !interval.partial ? `${interval.startDate!.slice(5, 7)}/${interval.startDate!.slice(0, 4)}` : formatMarketRange(interval.startDate!, interval.endDate!);
  };
  return { monthly, frequency, lines, axis, sample, labelText };
}

function intervalBlock(series: MarketRawSeries, period: PeriodText, trace: MarketCaptureTrace, blockId: string, charts: readonly MarketRawChart[] = []): string {
  const { monthly, frequency, lines, axis, sample, labelText } = intervalLines(series);
  const unit = frequency === 'unknown' ? 'kỳ' : monthly ? 'tháng' : 'tuần';
  if (!lines.some(line => line.points.size)) return `<p>Chưa có số doanh thu theo ${unit} của Shopee và TikTok Shop cho kỳ này.</p>`;
  const label = (key: string, block: string): string => {
    const { interval, source } = sample(key);
    const inputs = source ? [at(siblingSource(source, 'start_date'), interval.startDate!, 'start'), at(siblingSource(source, 'end_date'), interval.endDate!, 'end')] : [];
    return monthly && !interval.partial
      ? trace.record(labelText(key), block, 'raw', inputs, 'mm/yyyy of start_date', 'month-year')
      : trace.record(labelText(key), block, 'raw', inputs, 'start_date–end_date, dd/mm[/yyyy]', 'date-range');
  };
  const short = (block: string): string => monthly ? 'tháng' : series.intervalDays.value !== null && series.intervalDays.source
    ? `${trace.record(String(series.intervalDays.value), block, 'raw', [at(series.intervalDays.source, series.intervalDays.value)], 'interval_days of the request', 'as-stored')} ngày` : 'kỳ';
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
      return `<td>${escape(trace.record(formatMarketMoney(point.value), `${blockId}.table.${line.key}`, 'raw', [at(point.source, point.value)], SCALE_FORMULA, 'money'))}</td>`;
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
      `${trace.record(formatMarketMoney(entry.point.value!), block, 'raw', [at(entry.source, entry.point.value!)], SCALE_FORMULA, 'money')} (${label(entry.key, block)})`;
    return `${line.label}: ${word}, từ ${amount(first)} đến ${amount(last)} (doanh thu từng ${unit} đủ ngày).`;
  });
  const absent = lines.filter(line => !line.hasData).map(line => line.label);
  const notes = ['Mỗi sàn một đường riêng; biểu đồ không có đường tổng.',
    ...(absent.length ? [`${absent.join(', ')}: không có dữ liệu theo ${unit} trong kỳ này, nên không có đường.`] : []),
    ...(missing ? [`Chỗ đứt của đường là ${unit} thiếu doanh thu, ghi «thiếu» ở bảng; không phải bằng không.`] : []),
    ...(axis.some(key => sample(key).interval.partial) ? [`Điểm rỗng là ${unit} chưa đủ ngày, ghi đúng ngày ở bảng; không dùng để nói xu hướng.`] : [])];
  const missingPlatforms = lines.filter(line => !line.hasData).map(line => line.key).join(' ');
  // The pre-drawn chart has the same axis labels, so it prints in place of the hand-drawn SVG.
  const drawn = charts.find(chart => chart.id === blockId);
  const chart = drawn ? `<div class="chart flint" data-engine="${escape(drawn.engine)}" data-chart-id="${escape(drawn.id)}">${drawn.svg}</div>` : intervalSvg(axis, lines, axisLabels);
  return `<figure class="market-raw-line" data-market-raw-chart="${frequency}" data-series-count="${lines.length - absent.length}"${missingPlatforms ? ` data-platform-missing="${missingPlatforms}"` : ''}>`
    + `<div class="exh"><span class="ext">${escape(`Doanh thu theo ${unit}, từng sàn, kỳ ${period.text(`${blockId}.title`)}: ${period.range(`${blockId}.title`)}`)}</span></div>`
    + chart + '</figure>'
    + `<p class="lim"><b>Chú thích:</b> ${escape(notes.join(' '))}</p>`
    + `<div class="table-wrap" role="region" aria-label="${escape(`Doanh thu theo ${unit}, từng sàn`)}" tabindex="0"><table data-market-raw-intervals="${frequency}" data-reading=""><caption>${escape(`Doanh thu theo ${unit}, từng sàn`)}</caption>`
    + `<thead><tr><th>Kỳ</th>${PLATFORMS.map(platform => `<th>${platform.label} (doanh thu)</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
    + '<p class="lim"><b>Chú thích:</b> Doanh thu ước tính trên sàn của từng kỳ, đọc riêng từng sàn; ô «thiếu» là kỳ nguồn không ghi doanh thu, không phải bằng không.</p>'
    + `<p>${trends.map(escape).join(' ')}</p>`;
}

function periodBlock(entry: MarketRawCapturePeriod, collector: MarketNumberTraceCollector, charts?: readonly MarketRawChart[]): string {
  const { series } = entry;
  const trace = collector.forCapture(entry.captureId);
  if (series.period.startDate === null) return '<p>Chưa đọc được kỳ của số liệu thị trường; không in số của kỳ này.</p>';
  const period = periodText(series.period, trace);
  const blockId = `M03.${period.key}`;
  const count = series.totals.all.platformIds.length;
  // One pointer per platform in the response: the first KPI it returned.
  const countInputs = series.platforms.flatMap(platform => {
    const first = Object.values(platform.kpi).find(value => value.value !== null && value.source);
    return first ? [at(first.source!, first.value!)] : [];
  });
  const allLabel = count && countInputs.length === count
    ? `cả ${trace.record(String(count), `${blockId}.kpi`, 'computed', countInputs, 'count(platforms in the response)', 'count')} sàn` : 'các sàn';
  const cards = (Object.keys(KPI_LABELS) as MarketRawKpiField[]).map(field => totalCard(field, series, period, trace, `${blockId}.kpi`)).join('');
  return `<section class="market-raw-period" data-market-raw-period="${period.key}"><h3>${escape(`${period.text(`${blockId}.head`)} · ${period.range(`${blockId}.head`)}`)}</h3>`
    + `<p>${escape(`Số của ${allLabel}, ước tính trên sàn.`)}</p><div class="grid4">${cards}</div>`
    + platformSplit(series, period, trace, `${blockId}.split`)
    + intervalBlock(series, period, trace, `${blockId}.intervals`, charts) + '</section>';
}

/** Phần 3 scale blocks from raw-response numbers, one per captured period. */
export function marketRawScaleSection(input: MarketRawReportInput, trace: MarketNumberTraceCollector): string {
  const periods = input.periods.filter(entry => entry.series.platforms.length > 0);
  if (!periods.length) return '';
  return `<div class="market-raw-scale"><h3>Quy mô và diễn biến theo kỳ</h3>${periods.map(entry => periodBlock(entry, trace, input.charts)).join('')}</div>`;
}

/**
 * Interval charts of the scale blocks through Flint, the engine of the other Market charts (R-M11); a Flint
 * failure keeps the hand-drawn SVG, marked svg-fallback. Same lines, axis labels, gaps and hollow partial
 * points as the SVG; no value axis numbers and no value labels, since the numbers print in the table below.
 * `flint: false` is the unit-test opt-out.
 */
export async function renderMarketRawCharts(input: Pick<MarketRawReportInput, 'periods'>, { flint = true }: { flint?: boolean } = {}): Promise<MarketRawChart[]> {
  const charts: MarketRawChart[] = [];
  for (const { series } of input.periods) {
    if (!series.platforms.length || series.period.startDate === null) continue;
    const { lines, axis, sample, labelText } = intervalLines(series);
    if (!lines.some(line => line.points.size)) continue;
    const id = `M03.${periodKey(series.period)}.intervals`, labels = axis.map(labelText);
    const name = (line: Line): string => line.hasData ? line.label : `${line.label}: không có dữ liệu`;
    const fallback = (): string => intervalSvg(axis, lines, labels);
    const values = lines.flatMap(line => !line.hasData ? [] : axis.map((key, i) => {
      const point = line.points.get(key);
      return { ky: labels[i]!, san: name(line), doanh_thu: point?.value ?? null, chua_du: sample(key).interval.partial };
    }));
    const drawn: RenderedChart = !flint ? { svg: fallback(), engine: 'svg-fallback' } : await renderChart({
      data: { values },
      semantic_types: { ky: 'Category', san: 'Category', doanh_thu: 'Number' },
      field_display_names: { ky: 'Kỳ', san: 'Sàn', doanh_thu: 'Doanh thu' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'ky', y: 'doanh_thu', color: 'san' } },
    } as FlintChartInput, fallback, { palette: { san: Object.fromEntries(lines.map(line => [name(line), line.color])) }, patch: intervalPatch(labels) });
    charts.push({ id, ...drawn });
  }
  return charts;
}

/** Axis order as the table, no value-axis labels, no per-mark aria text with values; points hollow on partial intervals. */
const intervalPatch = (labels: readonly string[]) => (spec: any): void => {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    if ((node.mark === 'line' || node.mark?.type === 'line') && node.encoding?.color) {
      const color = node.encoding.color;
      node.encoding.x = { ...node.encoding.x, sort: [...labels] };
      node.encoding.y = { ...node.encoding.y, axis: { ...node.encoding.y.axis, labels: false, ticks: false } };
      node.layer = [{ mark: { type: 'line', strokeWidth: 2.5, aria: false } },
        { mark: { type: 'point', filled: true, size: 48, strokeWidth: 1.5, opacity: 1, aria: false },
          encoding: { color: null, stroke: { ...color, legend: null }, fill: { condition: { test: 'datum.chua_du', value: '#ffffff' }, field: color.field, type: color.type, scale: color.scale, legend: null } } }];
      delete node.mark;
      return;
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(spec);
};

/** Numbers inside stored text, cut as the HTML number scan cuts them («kẽm 50mg B12» -> 50, 12). */
const TEXT_NUMBER = /[+−-]?\d+(?:[.,]\d+)*(?:\s*(?:tỷ|triệu|nghìn|đồng|%|phần trăm))?/gu;

/**
 * Phần 2 scope line of the raw-response numbers. Each number inside a keyword is recorded against the
 * keyword the capture's search request sent; one inside the category text against the category's pointer.
 * A text whose numbers have no pointer is withheld rather than printed untraced.
 */
export function marketRawScopeSection(input: MarketRawReportInput, collector: MarketNumberTraceCollector): string {
  // The pointer of a text: the keyword in the capture's search request, or the stored category record (any store).
  const pointer = (text: string, part: 'keyword' | 'category'): MarketTraceInput | null => {
    if (part === 'category') return input.scope.category?.source ?? null;
    for (const entry of input.periods) {
      const query = entry.series.requestedQueries.find(candidate => candidate.text === text);
      if (query) return { ...query.source, captureId: entry.captureId };
    }
    return null;
  };
  return marketCaptureScopeLine(input.scope, (text, part, index) => {
    const numbers = text.match(TEXT_NUMBER) ?? [];
    if (!numbers.length) return text;
    const found = pointer(text, part);
    if (!found) return null;
    const block = part === 'keyword' ? `M02.scope.keyword.${index}` : 'M02.scope.category';
    const formula = part === 'keyword' ? 'number as written in the keyword the search request sent (include_query.queries)' : 'number as written in the stored category text';
    for (const number of numbers) collector.record(number, block, 'raw', [{ ...found, value: text }], formula, 'as-stored');
    return text;
  });
}
