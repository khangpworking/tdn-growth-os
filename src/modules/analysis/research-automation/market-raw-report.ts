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
import { MARKET_RAW_PLATFORM_IDS, MARKET_RAW_SCOPE_PLATFORM_IDS, type MarketRawInterval, type MarketRawKpiField,
  type MarketRawSeries, type MarketRawSource, type MarketRawTotalValue } from './market-raw-series.js';
import { marketCaptureScopeLine, type MarketCaptureScope } from './market-scope-report.js';
import type { MarketNumberTraceCollector } from './market-trace-map.js';

export interface MarketRawReportInput {
  /** `readMarketRawSeries` output, one per captured period (e.g. 30 days, 12 months), in print order. */
  readonly periods: readonly MarketRawSeries[];
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

/**
 * Trend of a series: «tăng đều» only when every step rises, «giảm đều» only
 * when every step falls; otherwise first against last decides «tăng/giảm nhưng
 * dao động», and equal first and last is «đi ngang». Null below two values.
 */
export function marketTrendWord(values: readonly number[]): MarketTrendWord | null {
  if (values.length < 2) return null;
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

type Point = { readonly interval: MarketRawInterval; readonly value: number; readonly source: MarketRawSource };

function periodLabel(series: MarketRawSeries, trace: MarketNumberTraceCollector, blockId: string): { text: string; key: string } | null {
  const period = series.period;
  if (period.startDate === null) return null;
  const year = period.days >= 365;
  const count = trace.record(year ? '12' : String(period.days), blockId, 'computed', [period.source],
    year ? 'inclusive days of the request period ≥ 365 → 12 tháng' : 'inclusive days of the request period');
  return { text: `${count} ${year ? 'tháng' : 'ngày'}`, key: year ? '12m' : `${period.days}d` };
}

function recordRange(trace: MarketNumberTraceCollector, blockId: string, start: string, end: string, inputs: readonly MarketRawSource[], formula: string): string {
  return trace.record(formatMarketRange(start, end), blockId, inputs.length ? 'raw' : 'computed', inputs, formula);
}

function totalCard(field: MarketRawKpiField, series: MarketRawSeries, previousLabel: string, previousRange: string, trace: MarketNumberTraceCollector, blockId: string): string {
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
    return ` <span class="chg">${arrow(token)}${escape(token)}</span> <small class="cmp-note">${escape(marketChangeNote(name.metric, previousLabel, previousRange))}</small>`;
  })();
  return `<div class="kpi" data-kpi="${field}"><b>${escape(value)}</b><span>${escape(name.card)}</span>${changeHtml}</div>`;
}

function platformSplit(series: MarketRawSeries, periodText: string, range: string, trace: MarketNumberTraceCollector, blockId: string): string {
  const byId = new Map(series.platforms.map(platform => [platform.platformId, platform] as const));
  const scope = series.totals.scope;
  const scoped = scope.platformIds.length === MARKET_RAW_SCOPE_PLATFORM_IDS.length && scope.platformIds.every(id => MARKET_RAW_SCOPE_PLATFORM_IDS.includes(id));
  const total = scoped ? scope.kpi.revenue : null;
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
    ? ` · Cộng 2 sàn ${escape(trace.record(formatMarketMoney(total.value), `${blockId}.scope`, 'computed', total.members, `sum(Shopee, TikTok Shop revenue); ${SCALE_FORMULA}`))}`
    + ` <small class="cmp-note">${escape(`(tỷ lệ = doanh thu từng sàn ÷ doanh thu Cộng 2 sàn, cùng kỳ ${periodText}: ${range})`)}</small>`
    : ' <small class="cmp-note">Chưa nêu Cộng 2 sàn vì thiếu số doanh thu của một sàn.</small>';
  return `<p data-market-raw-split="${escape(blockId)}">${parts.join(' · ')}${sum}</p>`;
}

/** One line per platform over the same interval axis; partial intervals are hollow points. No axis numbers: values are in the table below. */
function intervalSvg(axis: readonly string[], lines: readonly { key: string; label: string; color: string; points: ReadonlyMap<string, Point> }[], labels: readonly string[]): string {
  const w = 760, h = 260, left = 24, right = 24, top = 30, bottom = 46;
  const values = lines.flatMap(line => [...line.points.values()].map(point => point.value));
  const max = Math.max(0, ...values) || 1;
  const X = (i: number): number => left + i * (w - left - right) / Math.max(1, axis.length - 1);
  const Y = (value: number): number => top + (h - top - bottom) * (1 - value / max);
  let body = '', legend = left;
  for (const line of lines) {
    body += `<rect x="${legend}" y="6" width="11" height="11" fill="${line.color}"/><text x="${legend + 15}" y="16" class="lg">${escape(line.label)}</text>`;
    legend += 40 + line.label.length * 7;
    const coords = axis.flatMap((key, i) => { const point = line.points.get(key); return point ? [{ i, point }] : []; });
    body += `<polyline data-platform="${line.key}" fill="none" stroke="${line.color}" stroke-width="2.5" points="${coords.map(({ i, point }) => `${X(i).toFixed(1)},${Y(point.value).toFixed(1)}`).join(' ')}"/>`;
    for (const { i, point } of coords) body += `<circle data-platform="${line.key}" cx="${X(i).toFixed(1)}" cy="${Y(point.value).toFixed(1)}" r="3.5" fill="${point.interval.partial ? '#fff' : line.color}" stroke="${line.color}"/>`;
  }
  axis.forEach((_, i) => { body += `<text x="${X(i).toFixed(1)}" y="${h - bottom + 20}" class="ax" text-anchor="middle">${escape(labels[i]!)}</text>`; });
  return `<svg viewBox="0 0 ${w} ${h}" role="img" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
}

function intervalBlock(series: MarketRawSeries, periodText: string, range: string, trace: MarketNumberTraceCollector, blockId: string): string {
  const monthly = series.intervalDays.value !== null && series.intervalDays.value >= 28;
  const byId = new Map(series.platforms.map(platform => [platform.platformId, platform] as const));
  const lines = PLATFORMS.flatMap(platform => {
    const intervals = byId.get(platform.id)?.intervals ?? [];
    const points = new Map<string, Point>();
    for (const interval of intervals) if (interval.startDate && interval.endDate && interval.revenue.value !== null)
      points.set(`${interval.startDate}|${interval.endDate}`, { interval, value: interval.revenue.value, source: interval.revenue.source });
    return points.size ? [{ ...platform, points }] : [];
  });
  if (!lines.length) return `<p>Chưa có số doanh thu theo ${monthly ? 'tháng' : 'tuần'} của từng sàn cho kỳ này.</p>`;
  const axis = [...new Set(lines.flatMap(line => [...line.points.keys()]))].sort();
  const sample = (key: string): Point => lines.map(line => line.points.get(key)).find(point => point !== undefined)!;
  // Interval dates print as stored; full months print as mm/yyyy.
  const label = (key: string, block: string): string => {
    const { interval, source } = sample(key);
    const inputs = [siblingSource(source, 'start_date'), siblingSource(source, 'end_date')];
    if (monthly && !interval.partial) return trace.record(`${interval.startDate!.slice(5, 7)}/${interval.startDate!.slice(0, 4)}`, block, 'raw', inputs, 'mm/yyyy of start_date');
    return recordRange(trace, block, interval.startDate!, interval.endDate!, inputs, 'start_date–end_date, dd/mm[/yyyy]');
  };
  const axisLabels = axis.map(key => label(key, `${blockId}.axis`));
  const rows = axis.map(key => {
    const interval = sample(key).interval;
    // A partial interval's label is already its exact dates.
    const partial = interval.partial ? ` <small>(chưa đủ ${monthly ? 'tháng' : '7 ngày'})</small>` : '';
    const cells = PLATFORMS.map(platform => {
      const point = lines.find(line => line.id === platform.id)?.points.get(key);
      return `<td>${point ? escape(trace.record(formatMarketMoney(point.value), `${blockId}.table.${platform.key}`, 'raw', [point.source], SCALE_FORMULA)) : 'Chưa có số'}</td>`;
    }).join('');
    return `<tr${interval.partial ? ' data-period-incomplete="true"' : ''}><td>${escape(label(key, `${blockId}.table`))}${partial}</td>${cells}</tr>`;
  }).join('');
  const unit = monthly ? 'tháng' : 'tuần';
  const trends = lines.map(line => {
    const full = axis.flatMap(key => { const point = line.points.get(key); return point && point.interval.partial === false ? [{ key, point }] : []; });
    const word = marketTrendWord(full.map(({ point }) => point.value));
    if (!word) return `${line.label}: chưa đủ ${unit} đủ ngày để nói xu hướng.`;
    const first = full[0]!, last = full[full.length - 1]!;
    const block = `${blockId}.trend.${line.key}`;
    const amount = (entry: { key: string; point: Point }): string =>
      `${trace.record(formatMarketMoney(entry.point.value), block, 'raw', [entry.point.source], SCALE_FORMULA)} (${label(entry.key, block)})`;
    return `${line.label}: ${word}, từ ${amount(first)} đến ${amount(last)} (doanh thu từng ${unit} đủ ngày).`;
  });
  const partialNote = axis.some(key => sample(key).interval.partial)
    ? ` Điểm rỗng là ${unit} chưa đủ ngày, ghi đúng ngày ở bảng; không dùng để nói xu hướng.` : '';
  return `<figure class="market-raw-line" data-market-raw-chart="${monthly ? 'monthly' : 'weekly'}" data-series-count="${lines.length}"><figcaption>${escape(`Doanh thu theo ${unit}, từng sàn, kỳ ${periodText}: ${range}`)}</figcaption>`
    + intervalSvg(axis, lines, axisLabels) + '</figure>'
    + `<div class="table-wrap" role="region" aria-label="${escape(`Doanh thu theo ${unit}, từng sàn`)}" tabindex="0"><table data-market-raw-intervals="${monthly ? 'monthly' : 'weekly'}"><caption>${escape(`Doanh thu theo ${unit}, từng sàn`)}</caption>`
    + `<thead><tr><th>Kỳ</th>${PLATFORMS.map(platform => `<th>${platform.label} (doanh thu)</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`
    + `<p>${trends.map(escape).join(' ')}</p>`
    + `<p class="lim"><b>Chú thích:</b> Mỗi sàn một đường riêng; biểu đồ không có đường tổng.${escape(partialNote)}</p>`;
}

function periodBlock(series: MarketRawSeries, trace: MarketNumberTraceCollector): string {
  const head = periodLabel(series, trace, 'M03.period');
  if (!head || series.period.startDate === null) return '<p>Chưa đọc được kỳ của số liệu thị trường; không in số của kỳ này.</p>';
  const blockId = `M03.${head.key}`;
  const { startDate, endDate, source } = series.period;
  const range = recordRange(trace, `${blockId}.period`, startDate, endDate, [source], 'request start_date–end_date');
  const previous = marketPreviousPeriod(startDate, endDate);
  const previousRange = recordRange(trace, `${blockId}.previous`, previous.startDate, previous.endDate, [],
    'same length as the request period, ending the day before its start');
  const count = series.totals.all.platformIds.length;
  const allLabel = count ? `cả ${trace.record(String(count), `${blockId}.kpi`, 'computed', series.totals.all.kpi.revenue.members, 'count(platforms in the response)')} sàn` : 'các sàn';
  const cards = (Object.keys(KPI_LABELS) as MarketRawKpiField[]).map(field => totalCard(field, series, head.text, previousRange, trace, `${blockId}.kpi`)).join('');
  return `<section class="market-raw-period" data-market-raw-period="${head.key}"><h3>${escape(`${head.text} · ${range}`)}</h3>`
    + `<p>${escape(`Số của ${allLabel}, ước tính trên sàn.`)}</p><div class="grid4">${cards}</div>`
    + platformSplit(series, head.text, range, trace, `${blockId}.split`)
    + intervalBlock(series, head.text, range, trace, `${blockId}.intervals`) + '</section>';
}

/** Phần 3 scale blocks from raw-response numbers, one per captured period. */
export function marketRawScaleSection(input: MarketRawReportInput, trace: MarketNumberTraceCollector): string {
  const periods = input.periods.filter(series => series.platforms.length > 0);
  if (!periods.length) return '';
  return `<div class="market-raw-scale"><h3>Quy mô và diễn biến theo kỳ</h3>${periods.map(series => periodBlock(series, trace)).join('')}</div>`;
}

/** Phần 2 scope line of the raw-response numbers. */
export function marketRawScopeSection(input: MarketRawReportInput): string {
  return marketCaptureScopeLine(input.scope);
}
