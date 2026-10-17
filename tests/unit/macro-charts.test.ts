import { test } from 'node:test';
import assert from 'node:assert/strict';
import { comtradeMirrorChartRows, comtradeOwnChartRows, macroScale, renderComtradeCharts, renderWorldBankCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import type { StepComtrade, StepComtradeRow, StepWorldBank, StepWorldBankIndicator } from '../../src/modules/analysis/research-automation/model.js';
import { inspectWorldBankSource } from '../../src/modules/analysis/research-automation/world-bank-intake.js';
import { worldBankSeries } from '../../src/modules/analysis/research-automation/world-bank-lane.js';
import { worldBankFixture } from '../helpers/world-bank-source-fixture.js';

const SHA = 'a'.repeat(64);
function syntheticWorldBankIndicator(code: string, series: readonly { year: string; value: string | null }[] | undefined, name = 'Chỉ số tổng hợp A'): StepWorldBankIndicator {
  const last = series?.[series.length - 1];
  return { code, status: 'COLLECTED', reason: null, retrievedAt: '2026-01-01T00:00:00.000Z', captureIndex: 10, metadataCaptureIndex: 11, sourceSha256: SHA, metadataSha256: SHA,
    row: { indicatorName: name, value: last?.value ?? '123.5', unit: null, year: last?.year ?? '2024', lastUpdated: '2026-01-01', statusLiteral: '', footnote: null, locator: '/1/0' },
    ...(series ? { series } : {}) };
}
const years = (from: number, values: readonly (string | null)[]) => values.map((value, i) => ({ year: String(from + i), value }));

function svgText(svg: string): string[] {
  return [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map(m => m[1]!);
}
function assertNoSi(svg: string): void {
  for (const text of svgText(svg)) assert.doesNotMatch(text, /\d\s?[kKMGB]\b/u, `SI suffix in "${text}"`);
  assert.doesNotMatch(svg, /%/u);
}

test('macroScale names nghìn/triệu/tỷ and leaves small values unscaled', () => {
  assert.deepEqual(macroScale([12, 999]), { divisor: 1, word: null });
  assert.deepEqual(macroScale([2_500]), { divisor: 1e3, word: 'nghìn' });
  assert.deepEqual(macroScale([98_000_000]), { divisor: 1e6, word: 'triệu' });
  assert.deepEqual(macroScale([4_200_000_000]), { divisor: 1e9, word: 'tỷ' });
});

test('World Bank: the verified projection supplies a ten-year window with explicit and absent-year gaps and exact decimals', () => {
  const raw = worldBankFixture('SP.POP.TOTL', ['null', '1234.5000', 'null', '1111.2500', '99', '88', '77', '66', '55', '44', '33', '22']);
  const bytes = Buffer.from(raw.observations.toString().replace('"date":"2021"', '"date":"1998"').replaceAll('Viet Nam', 'Nước C'));
  const projection = inspectWorldBankSource(bytes, raw.metadata, raw.sourceUrl, raw.metadataUrl);
  const row = projection.rows.find(point => point.year === '2024')!;
  assert.ok(row.value !== null);
  const series = worldBankSeries(projection, 'SP.POP.TOTL', { ...row, value: row.value });
  assert.deepEqual(series, years(2015, ['33', '44', '55', '66', '77', '88', null, '1111.2500', null, '1234.5000']));
  assert.deepEqual(series.at(-1), { year: row.year, value: row.value });
});

test('World Bank: one Flint line per indicator with ≥2 values, gaps kept, no SI suffix; <2 values or no series draws nothing', async () => {
  const value: StepWorldBank = { profile: 'p', indicators: [
    syntheticWorldBankIndicator('SP.POP.TOTL', years(2015, ['91000000', null, '93000000', '94000000', null, '96000000', '97000000', '98000000', '99000000', '100300000']), 'Dân số cả nước'),
    syntheticWorldBankIndicator('NE.CON.PRVT.PC.KD', years(2023, [null, '2100.5'])),
  ] };
  const charts = await renderWorldBankCharts(value);
  assert.equal(charts.length, 1);
  const [chart] = charts;
  assert.equal(chart!.engine, 'flint', chart!.error);
  assert.equal(chart!.id, 'M05.world-bank.SP.POP.TOTL');
  assert.equal(chart!.title, 'Diễn biến theo năm: Dân số cả nước, cả nước Việt Nam');
  assert.match(chart!.unit, /^triệu/u);
  assert.match(chart!.svg, /2015/u);
  assert.match(chart!.svg, /2024/u);
  assertNoSi(chart!.svg);
  const old: StepWorldBank = { profile: 'p', indicators: [syntheticWorldBankIndicator('SP.POP.TOTL', undefined)] };
  assert.deepEqual(await renderWorldBankCharts(old), []);
  const fallback = await renderWorldBankCharts(value, { flint: false });
  assert.equal(fallback[0]!.engine, 'svg-fallback');
  assertNoSi(fallback[0]!.svg);
  assert.ok(svgText(fallback[0]!.svg).includes(`Giá trị (${fallback[0]!.unit})`), 'fallback axis names its scale');
});

test('World Bank: isolated values remain visible and a null year breaks the Flint and fallback paths', async () => {
  const value = { profile: 'p', indicators: [syntheticWorldBankIndicator('SP.POP.TOTL', years(2021, ['12', null, '24']))] };
  const [chart] = await renderWorldBankCharts(value);
  assert.equal(chart!.engine, 'flint');
  const points = [...chart!.svg.matchAll(/<path[^>]*aria-roledescription="point"[^>]*>/gu)].map(hit => hit[0]);
  assert.equal(points.length, 2, 'both isolated observations have point marks');
  assert.ok(points.some(point => point.includes('2021')) && points.some(point => point.includes('2023')));
  assert.ok(points.every(point => !point.includes('2022')), 'no zero placeholder at the gap');
  const path = chart!.svg.match(/<path[^>]*aria-roledescription="line mark"[^>]*\bd="([^"]+)"/u)![1]!;
  assert.equal((path.match(/M/gu) ?? []).length, 2, 'two disconnected subpaths');
  assert.doesNotMatch(path, /L/u, 'no connecting line through the missing year');
  const [fallback] = await renderWorldBankCharts(value, { flint: false });
  assert.equal((fallback!.svg.match(/<circle\b/gu) ?? []).length, 2);
  assert.doesNotMatch(fallback!.svg, /<polyline\b/u);
});

test('World Bank: a series that does not end at the table row draws nothing', async () => {
  const item = syntheticWorldBankIndicator('SP.POP.TOTL', years(2020, ['1', '2', '3']));
  const broken = { ...item, row: { ...item.row!, value: '4' } };
  assert.deepEqual(await renderWorldBankCharts({ profile: 'p', indicators: [broken] }), []);
});

const row = (side: 'OWN' | 'MIRROR', reporter: string, flow: 'M' | 'X', year: string, value: string, captureIndex = 20): StepComtradeRow => ({ side, reporter, flow, year, value, captureIndex });
function syntheticComtrade(rows: readonly StepComtradeRow[]): StepComtrade {
  return { profile: 'comtrade-v1', status: 'OK', hsCode: '999999', officialDescription: 'Synthetic goods', descriptionVi: 'Hàng tổng hợp', reasonVi: null, attempts: [],
    calls: [], rows, mirrorReporterCount: rows.filter(r => r.side === 'MIRROR').length };
}

test('Comtrade: mirror figure needs ≥2 rows, sorted by value; own figure needs both flows of one year; no sum anywhere', async () => {
  const many = syntheticComtrade([
    row('OWN', 'Nước C', 'M', '2023', '5130000'), row('OWN', 'Nước C', 'X', '2023', '1270000'),
    row('MIRROR', 'Nước B', 'X', '2023', '1270000'), row('MIRROR', 'Nước A', 'X', '2023', '3410000'),
  ]);
  assert.deepEqual(comtradeMirrorChartRows(many).map(r => r.reporter), ['Nước A', 'Nước B']);
  assert.equal(comtradeOwnChartRows(many).length, 2);
  const charts = await renderComtradeCharts(many);
  assert.deepEqual(charts.map(c => c.id), ['M06.comtrade.mirror', 'M06.comtrade.own']);
  for (const chart of charts) {
    assert.equal(chart.engine, 'flint', chart.error);
    assert.match(chart.title, /năm 2023/u);
    assert.equal(chart.unit, 'triệu USD');
    assertNoSi(chart.svg);
    const text = svgText(chart.svg).join(' ');
    // Sums and differences never appear: 4,68 (mirror sum), 6,4 (own sum), 3,86 (own difference).
    assert.doesNotMatch(text, /4,68|6,4|3,86/u);
  }
  assert.match(svgText(charts[0]!.svg).join(' '), /3,41/u);
  assert.match(svgText(charts[1]!.svg).join(' '), /5,13/u);

  const single = syntheticComtrade([row('MIRROR', 'Nước A', 'X', '2023', '3400000'), row('OWN', 'Nước C', 'M', '2023', '10'), row('OWN', 'Nước C', 'X', '2021', '20')]);
  assert.deepEqual(await renderComtradeCharts(single), []);
  assert.deepEqual(await renderComtradeCharts(undefined), []);
  const fallback = await renderComtradeCharts(many, { flint: false });
  assert.deepEqual(fallback.map(c => c.engine), ['svg-fallback', 'svg-fallback']);
  for (const chart of fallback) {
    assertNoSi(chart.svg);
    assert.ok(svgText(chart.svg).includes(`Giá trị (${chart.unit})`), 'fallback axis names its scale');
    assert.doesNotMatch(svgText(chart.svg).join(' '), /4,68|6,4|3,86/u, 'fallback never displays sums or differences');
  }
});
