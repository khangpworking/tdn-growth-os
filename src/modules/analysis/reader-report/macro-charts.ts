// Country-level background figures of the Market report (S23 World Bank yearly lines, S24 UN Comtrade bars).
// Each figure stands on its own axis: never beside, summed with or scaled against the sample numbers, and never summed across
// reporting sides. Axes use triệu / tỷ for large totals; per-person figures stay unscaled. Tables use retained source precision.
// `flint: false` is the unit-test opt-out (hand-made SVG, recorded as svg-fallback).
import type { StepComtrade, StepComtradeRow, StepWorldBankIndicator, StepWorldBankRow } from '../research-automation/model.js';
import { comtradeRenderableRows, comtradeSideText, COMTRADE_SRC } from '../research-automation/comtrade-lane.js';
import { formatWorldBankValue, roundWorldBankValue, worldBankChartSeries, worldBankPerPerson, worldBankRenderableRows, worldBankUnitText, WORLD_BANK_SRC, WORLD_BANK_UNKNOWN_UNIT } from '../research-automation/world-bank-lane.js';
import { renderChart, type FlintChartInput, type RenderedChart } from './flint.js';
import { esc, sp } from './format.js';
import { keepOrder } from './market-charts.js';
import { barChart, lineChart } from './svg-charts.js';

/** Plain grouped digits (1.234,5), never an SI suffix such as k, M, G or B. */
const PLAIN_FORMAT = ',.6~r';
const SCALES = [[1e9, 'tỷ'], [1e6, 'triệu']] as const;
/** Values below one million stay unscaled. */
export function macroScale(values: readonly number[]): { readonly divisor: number; readonly word: string | null } {
  const max = Math.max(0, ...values.map(Math.abs));
  for (const [divisor, word] of SCALES) if (max >= divisor) return { divisor, word };
  return { divisor: 1, word: null };
}
const plain = (value: number): string => sp(String(+value.toFixed(3)));

/** Axis and label formats are fixed to grouped plain digits after Flint assembles the spec. */
const plainNumbers = (spec: any, exactPointLabels = false): void => {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    for (const channel of ['x', 'y']) {
      const enc = node.encoding?.[channel];
      if (enc?.type === 'quantitative') enc.axis = enc.axis === null ? null : { ...(enc.axis ?? {}), format: PLAIN_FORMAT, formatType: 'number' };
    }
    const text = node.encoding?.text;
    if (text?.type === 'quantitative') { text.format = PLAIN_FORMAT; text.formatType = 'number'; }
    if (exactPointLabels && node.encoding?.y?.field === 'gia_tri') {
      node.encoding.description = { field: 'mo_ta', type: 'nominal' };
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(spec);
};
const patches = (...list: ((spec: any) => void)[]) => (spec: any): void => { for (const patch of list) patch(spec); };
/** A line break after each label keeps adjacent tick labels (2015, 2016, ...) from reading as one long digit run in the page text. */
const separateLabels = <T extends { svg: string }>(chart: T): T => ({ ...chart, svg: chart.svg.replace(/<\/text>(?!\n)/gu, '</text>\n') });

export interface MacroChart extends RenderedChart {
  readonly id: string;
  readonly title: string;
  readonly unit: string;
  readonly note: string;
  readonly src: string;
}

/** Only these country-background figures permit the required SVG fallback in production. */
export const isMacroChartId = (id: string): boolean =>
  /^(?:M05\.world-bank\.(?:NE\.CON\.PRVT\.PC\.KD|SP\.POP\.TOTL)|M06\.comtrade\.(?:mirror|own))$/u.test(id);

export const WORLD_BANK_CHART_NOTE = 'Số liệu của cả nước Việt Nam theo từng năm, chỉ để làm nền: không nói về sản phẩm này và không so sánh được với số liệu mẫu trong báo cáo. Năm nguồn không có số để trống, không lấy số năm khác bù vào.';
export const COMTRADE_MIRROR_NOTE = 'Mỗi thanh là số một nước tự báo về hàng xuất sang Việt Nam theo mã hàng ước tính; các thanh không cộng với nhau. Đây không phải quy mô thị trường của sản phẩm này và không so sánh được với số liệu mẫu trong báo cáo.';
export const COMTRADE_OWN_NOTE = 'Mỗi thanh là số Việt Nam tự báo cho một chiều theo mã hàng ước tính; hai chiều không cộng, không trừ với nhau. Đây không phải quy mô thị trường của sản phẩm này và không so sánh được với số liệu mẫu trong báo cáo.';

const unitWithScale = (word: string | null, unit: string, known: boolean): string =>
  word === null ? unit : known ? `${word} ${unit}` : `${word}; ${unit}`;

/** One line per collected indicator whose stored window has at least 2 values; indicators without a series draw nothing. */
export async function renderWorldBankCharts(value: Parameters<typeof worldBankRenderableRows>[0], { flint = true }: { flint?: boolean } = {}): Promise<MacroChart[]> {
  const out: MacroChart[] = [];
  for (const item of worldBankRenderableRows(value)) {
    const series = worldBankChartSeries(item);
    if (series === null) continue;
    out.push(separateLabels(await renderWorldBankChart(item, item.row, series, flint)));
  }
  return out;
}

async function renderWorldBankChart(item: StepWorldBankIndicator, row: StepWorldBankRow, series: NonNullable<ReturnType<typeof worldBankChartSeries>>, flint: boolean): Promise<MacroChart> {
  // Round before converting to chart coordinates, using the same exact decimal arithmetic as the table.
  const rounded = series.map(point => point.value === null ? null : roundWorldBankValue(point.value, row.decimal));
  const numbers = rounded.flatMap(value => value === null ? [] : [Number(value)]);
  const { divisor, word } = worldBankPerPerson(row, item.code) ? { divisor: 1, word: null } : macroScale(numbers);
  const sourceUnit = worldBankUnitText(row, item.code);
  const known = (row.unit !== null && row.unit.trim() !== '') || sourceUnit !== WORLD_BANK_UNKNOWN_UNIT;
  const unit = unitWithScale(word, sourceUnit, known);
  const years = series.map(point => point.year);
  const values = rounded.map(value => value === null ? null : Number(value) / divisor);
  // Source-precision documents carry exact point labels; the chart engine's six significant digits are only for axis ticks.
  const labels = row.decimal === undefined ? undefined : rounded.map((value, i) =>
    value === null ? null : `Năm: ${years[i]}; Giá trị: ${formatWorldBankValue(value)} ${sourceUnit}`);
  const fallback = (): string => {
    const svg = lineChart(years, [{ name: row.indicatorName, color: '#1d4ed8', values }], { yTitle: `Giá trị (${unit})` });
    return labels ? svg.replace(/<circle data-month="([^"]+)"/gu, (tag, year: string) =>
      `${tag} aria-label="${esc(labels[years.indexOf(year)])}"`) : svg;
  };
  const meta = { id: `M05.world-bank.${item.code}`, title: `Diễn biến theo năm: ${row.indicatorName}, cả nước Việt Nam`, unit, note: WORLD_BANK_CHART_NOTE, src: WORLD_BANK_SRC };
  if (!flint) return { ...meta, svg: fallback(), engine: 'svg-fallback' };
  return { ...meta, ...await renderChart({
    data: { values: series.map((point, i) => ({ nam: point.year, gia_tri: values[i], ...(labels ? { mo_ta: labels[i] } : {}) })) },
    semantic_types: { nam: 'Category', gia_tri: 'Number' },
    field_display_names: { nam: 'Năm', gia_tri: `Giá trị (${unit})` },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'nam', y: 'gia_tri' }, chartProperties: { showPoints: true }, baseSize: { width: 560, height: 240 } },
  } as FlintChartInput, fallback, { patch: patches(keepOrder('nam', years), spec => plainNumbers(spec, labels !== undefined)), legend: false }) };
}

/** Mirror rows of one year (the year of the first stored mirror row), largest first. */
export function comtradeMirrorChartRows(value: StepComtrade | null | undefined): StepComtradeRow[] {
  const mirror = comtradeRenderableRows(value).filter(row => row.side === 'MIRROR');
  const year = mirror[0]?.year;
  const rows = mirror.filter(row => row.year === year).sort((a, b) => Number(b.value) - Number(a.value));
  return rows.length >= 2 ? rows : [];
}
/** Việt Nam's own import and export rows, only when both exist for the same year. */
export function comtradeOwnChartRows(value: StepComtrade | null | undefined): StepComtradeRow[] {
  const own = comtradeRenderableRows(value).filter(row => row.side === 'OWN');
  const imports = own.find(row => row.flow === 'M');
  const exports = imports ? own.find(row => row.flow === 'X' && row.year === imports.year) : undefined;
  return imports && exports ? [imports, exports] : [];
}

async function bars(meta: Omit<MacroChart, 'svg' | 'engine' | 'error' | 'unit'>, cats: readonly string[], raw: readonly number[], flint: boolean): Promise<MacroChart> {
  const { divisor, word } = macroScale(raw);
  const unit = word === null ? 'USD' : `${word} USD`;
  const values = raw.map(v => v / divisor);
  const fallback = (): string => barChart(cats, [{ name: 'Giá trị', values, color: '#0f766e' }], { fmt: plain, xTitle: `Giá trị (${unit})` });
  const full = { ...meta, unit };
  if (!flint) return separateLabels<MacroChart>({ ...full, svg: fallback(), engine: 'svg-fallback' });
  return separateLabels({ ...full, ...await renderChart({
    data: { values: cats.map((cat, i) => ({ ben: cat, gia_tri: values[i] })) },
    semantic_types: { ben: 'Category', gia_tri: 'Number' },
    field_display_names: { ben: ' ', gia_tri: `Giá trị (${unit})` },
    chart_spec: { chartType: 'Bar Chart', encodings: { y: 'ben', x: 'gia_tri' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(120, cats.length * 44) } },
  } as FlintChartInput, fallback, { patch: patches(keepOrder('ben', cats), plainNumbers), legend: false }) });
}

/** Synchronous counts of the figures the renderers above would draw, for the sync report builder's pre-render check. */
export const worldBankChartCount = (value: Parameters<typeof worldBankRenderableRows>[0]): number =>
  worldBankRenderableRows(value).filter(item => worldBankChartSeries(item) !== null).length;
export const comtradeChartCount = (value: StepComtrade | null | undefined): number =>
  (comtradeMirrorChartRows(value).length ? 1 : 0) + (comtradeOwnChartRows(value).length ? 1 : 0);

/** Up to two bar figures (mirror reporters; Việt Nam's own two flows). Each bar is one reporting side's number; nothing is summed. */
export async function renderComtradeCharts(value: StepComtrade | null | undefined, { flint = true }: { flint?: boolean } = {}): Promise<MacroChart[]> {
  const out: MacroChart[] = [];
  const mirror = comtradeMirrorChartRows(value);
  if (mirror.length) out.push(await bars({ id: 'M06.comtrade.mirror', title: `Hàng xuất sang Việt Nam theo số từng nước tự báo, năm ${mirror[0]!.year}`,
    note: COMTRADE_MIRROR_NOTE, src: COMTRADE_SRC }, mirror.map(comtradeSideText), mirror.map(row => Number(row.value)), flint));
  const own = comtradeOwnChartRows(value);
  if (own.length) out.push(await bars({ id: 'M06.comtrade.own', title: `Nhập khẩu và xuất khẩu theo số Việt Nam tự báo, năm ${own[0]!.year}`,
    note: COMTRADE_OWN_NOTE, src: COMTRADE_SRC }, ['Nhập khẩu', 'Xuất khẩu'], own.map(row => Number(row.value)), flint));
  return out;
}
