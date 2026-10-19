import assert from 'node:assert/strict';
import test from 'node:test';
import { UNKNOWN_SHOP, concentrationPlatforms, marketChartRows, marketShopsUnrecorded, renderMarketCharts, type MarketChartRow } from '../../src/modules/analysis/reader-report/market-charts.js';
import { marketChartSource } from '../../src/modules/analysis/research-automation/market-presentation-report.js';
import type { AutomationMetricMethodSnapshot } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';

type SyntheticRecord = { shop: string; revenue: string | null; platform?: 'shopee' | 'tiktok'; row?: number };
const record = ({ shop, revenue, platform = 'shopee', row }: SyntheticRecord) => ({
  shopId: shop, listingId: `listing-${shop}-${revenue}`, title: 'synthetic', category: 'synthetic',
  source: { sourceSha256: 'a'.repeat(64), locator: row === undefined ? 'Sheet1!A2:T2' : `/groups/W12_topProducts/rows/${row}` },
  revenue: { state: revenue === null ? 'missing' : 'observed_value', value: revenue, precision: 'estimated', source: { sourceSha256: 'a'.repeat(64), locator: 'x' }, displayedValue: null },
  units: { state: 'missing', value: null, precision: 'unknown', source: { sourceSha256: 'a'.repeat(64), locator: 'x' }, displayedValue: null },
  label: null, measurement: { platform },
});
const workbook = (records: SyntheticRecord[]) => ({ result: { input: { records: records.map(record) } } }) as unknown as AutomationMetricMethodSnapshot;
const capture = (platforms: { platform: 'shopee' | 'tiktok'; records: SyntheticRecord[] }[]) => ({
  result: { input: { records: [] } },
  capture: { platforms: platforms.map(({ platform, records }) => ({ platform, result: { input: { records: records.map(value => record({ ...value, platform })) } } })) },
}) as unknown as AutomationMetricMethodSnapshot;

test('saved presentation rows win over the Metric records', () => {
  const rows: MarketChartRow[] = [{ i: 4, platform: 'tiktok', shop: 'p', rev: 9 }];
  assert.deepEqual(marketChartSource(rows, workbook([{ shop: 'a', revenue: '1' }])), { rows });
  assert.deepEqual(marketChartSource([], undefined), { rows: [] });
});

test('empty presentation rows fall back to the frozen workbook records and draw all three charts', async () => {
  const source = marketChartSource([], workbook([{ shop: 'a', revenue: '5000000' }, { shop: 'b', revenue: '3000000' }, { shop: 'a', revenue: '2000000' }]));
  assert.deepEqual(source.rows, [{ i: 0, platform: 'shopee', shop: 'a', rev: 5_000_000 }, { i: 1, platform: 'shopee', shop: 'b', rev: 3_000_000 }, { i: 2, platform: 'shopee', shop: 'a', rev: 2_000_000 }]);
  assert.equal(marketChartRows(source.rows).length, 3);
  const { rows, ...options } = source;
  const charts = await renderMarketCharts(rows, { ...options, flint: false });
  assert.deepEqual(charts.map(chart => chart.kind), ['concentration', 'platform-revenue', 'product-ranking']);
  assert.match(charts[2]!.note, /dữ liệu bán hàng đã lưu/);
});

test('a missing revenue stays missing: that platform draws no chart', async () => {
  const source = marketChartSource([], workbook([{ shop: 'a', revenue: '5' }, { shop: 'b', revenue: null }]));
  assert.equal(source.rows[1]!.rev, null);
  assert.equal(marketChartRows(source.rows).length, 0);
  assert.deepEqual(await renderMarketCharts(source.rows, { flint: false }), []);
});

test('capture rows keep their platform and saved results-table row, and every note says the list is limited', async () => {
  const source = marketChartSource([], capture([
    { platform: 'shopee', records: [{ shop: 's1', revenue: '4000000', row: 0 }, { shop: 's2', revenue: '1000000', row: 2 }] },
    { platform: 'tiktok', records: [{ shop: 't1', revenue: '2000000', row: 1 }] },
  ]));
  assert.deepEqual(source.rows.map(row => [row.i, row.platform, row.shop, row.rev]),
    [[0, 'shopee', 's1', 4_000_000], [2, 'shopee', 's2', 1_000_000], [1, 'tiktok', 't1', 2_000_000]]);
  const { rows, ...options } = source;
  const charts = await renderMarketCharts(rows, { ...options, flint: false });
  assert.equal(charts.length, 3);
  for (const chart of charts) assert.match(chart.note, /các dòng đầu được giữ của bảng kết quả tìm kiếm/);
  assert.match(charts[2]!.note, /mỗi nhãn ghi sàn và mã dòng, đúng mã ở cột Mã dòng của bảng mẫu cùng sàn/u);
  const revenue = charts.find(chart => chart.kind === 'platform-revenue')!;
  assert.doesNotMatch(revenue.svg, />7(?:[.,]0)?</, 'no cross-platform total');
});

test('capture rows without a recorded shop draw no concentration chart', async () => {
  const none = marketChartSource([], capture([
    { platform: 'shopee', records: [{ shop: UNKNOWN_SHOP, revenue: '4000000', row: 0 }, { shop: UNKNOWN_SHOP, revenue: '1000000', row: 1 }] },
  ]));
  assert.equal(marketShopsUnrecorded(none.rows), true);
  const { rows, ...options } = none;
  assert.deepEqual((await renderMarketCharts(rows, { ...options, flint: false })).map(chart => chart.kind), ['platform-revenue', 'product-ranking']);
});

test('a platform whose rows record no shop is left out of the concentration chart and named in its note', async () => {
  const mixed = marketChartSource([], capture([
    { platform: 'shopee', records: [{ shop: 's1', revenue: '4000000', row: 0 }, { shop: 's2', revenue: '1000000', row: 2 }] },
    { platform: 'tiktok', records: [{ shop: UNKNOWN_SHOP, revenue: '2000000', row: 1 }] },
  ]));
  assert.equal(marketShopsUnrecorded(mixed.rows), false);
  assert.deepEqual(concentrationPlatforms(mixed.rows), ['shopee']);
  const { rows, ...options } = mixed;
  const charts = await renderMarketCharts(rows, { ...options, flint: false });
  const concentration = charts.find(chart => chart.kind === 'concentration')!;
  assert.match(concentration.note, /TikTok Shop: nguồn không ghi gian hàng/);
  assert.doesNotMatch(concentration.svg, /TikTok/);
});

test('shop waiver requires chartable rows and no platform with complete shop identities', async () => {
  const row = { i: 0, platform: 'shopee', shop: UNKNOWN_SHOP, rev: 10 };
  for (const rows of [[], [{ ...row, rev: null }], [{ ...row, rev: 0 }], [{ ...row, platform: 'unknown' }], [{ ...row, shop: 'recorded' }]]) {
    assert.equal(marketShopsUnrecorded(rows), false);
  }
  const partial = [row, { ...row, i: 1, shop: 'recorded' }];
  assert.deepEqual(concentrationPlatforms(partial), [], 'one missing identity invalidates the whole platform denominator');
  assert.ok(!(await renderMarketCharts(partial, { flint: false })).some(chart => chart.kind === 'concentration'));
  const mixed = [...partial, { ...row, i: 2, platform: 'tiktok', shop: 'other' }];
  assert.equal(marketShopsUnrecorded(mixed), false);
  assert.deepEqual(concentrationPlatforms(mixed), ['tiktok']);
});
