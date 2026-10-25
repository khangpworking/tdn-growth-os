import assert from 'node:assert/strict';
import test from 'node:test';
import { readMarketRawSeries, type MarketRawSeries, type MarketRawSource } from '../../src/modules/analysis/research-automation/market-raw-series.js';
import canxi30 from '../fixtures/market-raw-series/canxi-30d-dev.raw-responses.json' with { type: 'json' };
import zinc30 from '../fixtures/market-raw-series/zinc-30d-4platform.synthetic.raw-responses.json' with { type: 'json' };
import zinc12 from '../fixtures/market-raw-series/zinc-12m-4platform.synthetic.raw-responses.json' with { type: 'json' };

// Zinc totals are synthetic canaries, not real-source acceptance. Only canxi30
// is a retained dev capture; the 12-month boundaries and other platform IDs
// remain unconfirmed (see the fixtures' README).
function assertSource(raw: readonly unknown[], source: MarketRawSource | null, expected: unknown) {
  assert.ok(source, 'an observed value has a source');
  let value = raw[source.responseIndex];
  assert.ok(value && typeof value === 'object');
  assert.equal(source.url, (value as { urlPath: string }).urlPath);
  for (const part of source.jsonPath.split('/').slice(1)) {
    assert.ok(value !== null && typeof value === 'object', 'source pointer resolves through the capture');
    value = (value as Record<string, unknown>)[part.replace(/~1/g, '/').replace(/~0/g, '~')];
  }
  assert.equal(value, expected, 'source pointer resolves to the original request/response value');
}

function assertR1(series: MarketRawSeries) {
  // Keep this first so the negative control proves failure on the scope number.
  assert.equal(series.totals.scope.kpi.revenue.value, 34_900_000_000, 'R1 scope revenue excludes the other platforms');
  assert.equal(series.totals.all.kpi.revenue.value, 35_000_000_000);
  assert.deepEqual(series.totals.scope.platformIds, [1, 8]);
  assert.deepEqual(series.totals.all.platformIds, [1, 2, 3, 8]);
  assert.deepEqual(series.platforms.map(platform => [platform.platformId, platform.kpi.revenue.value]), [
    [1, 7_900_000_000], [2, 60_000_000], [3, 40_000_000], [8, 27_000_000_000],
  ]);
}

test('R1 30-day zinc canary keeps 35.0 billion across four platforms separate from the 34.9 billion scope', () => {
  const series = readMarketRawSeries(zinc30);
  assertR1(series);
  assert.deepEqual([series.period.startDate, series.period.endDate, series.period.days], ['2026-09-21', '2026-10-20', 30]);
  assertSource(zinc30, series.period.source, '20260921');
  for (const platform of series.platforms) assertSource(zinc30, platform.kpi.revenue.source, platform.kpi.revenue.value);
  assert.equal(series.totals.scope.kpi.revenue.members.length, 2);
  assert.equal(series.totals.all.kpi.revenue.members.length, 4);
  for (const [i, value] of [7_900_000_000, 27_000_000_000].entries()) {
    assertSource(zinc30, series.totals.scope.kpi.revenue.members[i]!, value);
  }
});

test('R2 12-month zinc canary reads 380.3 billion across four platforms from the requested year', () => {
  const series = readMarketRawSeries(zinc12);
  assert.equal(series.totals.all.kpi.revenue.value, 380_300_000_000);
  assert.equal(series.totals.scope.kpi.revenue.value, 375_000_000_000);
  assert.deepEqual([series.period.startDate, series.period.endDate, series.period.days], ['2025-11-01', '2026-10-31', 365]);
  assertSource(zinc12, series.period.source, '20251101');
  assert.deepEqual(series.platforms.map(platform => [platform.platformId, platform.kpi.revenue.value]), [
    [1, 90_000_000_000], [2, 3_800_000_000], [3, 1_500_000_000], [8, 285_000_000_000],
  ]);
  for (const platform of series.platforms) assertSource(zinc12, platform.kpi.revenue.source, platform.kpi.revenue.value);
});

test('R3 reads each PREVIOUS twin from the completed dev search and computes (current - previous) / previous', () => {
  const series = readMarketRawSeries(canxi30);
  const expected = [
    { id: 1, current: { revenue: 72_117_856_247, units: 332_160, products: 6_986, shops: 3_312 },
      previous: { revenue: 77_930_226_374, units: 373_030, products: 7_616, shops: 3_572 } },
    { id: 8, current: { revenue: 103_235_446_593, units: 452_266, products: 3_740, shops: 1_848 },
      previous: { revenue: 94_841_063_850, units: 433_163, products: 3_861, shops: 1_928 } },
  ];
  assert.deepEqual(series.requestedPlatformIds, [1, 8]);
  for (const row of expected) {
    const platform = series.platforms.find(item => item.platformId === row.id);
    assert.ok(platform);
    for (const field of ['revenue', 'units', 'products', 'shops'] as const) {
      assert.equal(platform.kpi[field].value, row.current[field]);
      assert.equal(platform.previous[field].value, row.previous[field]);
      assert.equal(platform.change[field].value, (row.current[field] - row.previous[field]) / row.previous[field]);
      assertSource(canxi30, platform.kpi[field].source, row.current[field]);
      assertSource(canxi30, platform.previous[field].source, row.previous[field]);
    }
  }
  assert.equal(series.totals.scope.previous.revenue.value, 172_771_290_224);
  assert.equal(series.totals.scope.change.revenue.value, (175_353_302_840 - 172_771_290_224) / 172_771_290_224);
});

test('R4 preserves per-platform 7-day intervals for 30 days and twelve monthly intervals for the synthetic year', () => {
  const weeklyWindows = [
    ['2026-09-21', '2026-09-27'], ['2026-09-28', '2026-10-04'], ['2026-10-05', '2026-10-11'],
    ['2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-20'],
  ];
  const monthlyWindows = [
    '2025-11-30', '2025-12-31', '2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30',
    '2026-05-31', '2026-06-30', '2026-07-31', '2026-08-31', '2026-09-30', '2026-10-31',
  ].map(end => [`${end.slice(0, 7)}-01`, end]);
  for (const row of [
    { raw: canxi30, days: 7, windows: weeklyWindows, values: [
      { id: 1, revenue: [15_318_235_845, 13_553_476_354, 15_862_222_806, 20_715_194_547, 6_668_726_695],
        units: [76_611, 67_007, 75_352, 86_842, 26_348] },
      { id: 8, revenue: [22_426_775_853, 22_827_135_270, 24_400_293_965, 27_286_922_940, 6_294_318_565],
        units: [103_741, 102_984, 105_024, 110_917, 29_600] },
    ] },
    { raw: zinc12, days: 30, windows: monthlyWindows, values: [
      { id: 1, revenue: Array(12).fill(7_500_000_000), units: [...Array(11).fill(39_166), 39_174] },
      { id: 2, revenue: [...Array(11).fill(316_666_666), 316_666_674], units: [...Array(11).fill(1_666), 1_674] },
      { id: 3, revenue: Array(12).fill(125_000_000), units: [...Array(11).fill(666), 674] },
      { id: 8, revenue: Array(12).fill(23_750_000_000), units: [...Array(11).fill(133_333), 133_337] },
    ] },
  ]) {
    const series = readMarketRawSeries(row.raw);
    assert.equal(series.intervalDays.value, row.days);
    assertSource(row.raw, series.intervalDays.source, row.days);
    assert.deepEqual(series.platforms.map(platform => platform.platformId), row.values.map(value => value.id));
    for (const expected of row.values) {
      const platform = series.platforms.find(item => item.platformId === expected.id);
      assert.ok(platform?.intervals);
      assert.deepEqual(platform.intervals.map(interval => [interval.startDate, interval.endDate]), row.windows);
      assert.deepEqual(platform.intervals.map(interval => interval.revenue.value), expected.revenue);
      assert.deepEqual(platform.intervals.map(interval => interval.units.value), expected.units);
      for (const interval of platform.intervals) {
        assertSource(row.raw, interval.revenue.source, interval.revenue.value);
        assertSource(row.raw, interval.units.source, interval.units.value);
      }
    }
  }
});

test('R5 missing current or previous aggregations stay null with a reason, while an observed zero stays zero', () => {
  const raw = structuredClone(zinc30);
  const data = raw[0]!.body.data;
  assert.ok(!Array.isArray(data));
  data.search_basic.aggregations = data.search_basic.aggregations.filter(item =>
    item.aggregation !== 'REVENUE_TOTAL_CUSTOM' && item.aggregation !== 'PREVIOUS_PRODUCT_TOTAL');
  const shops = data.search_basic.aggregations.find(item => item.aggregation === 'SHOP_TOTAL');
  assert.ok(shops);
  shops.entity.platforms[0]!.value = 0;

  const series = readMarketRawSeries(raw);
  assert.deepEqual(series.platforms.map(platform => platform.platformId), [1, 2, 3, 8]);
  for (const platform of series.platforms) {
    assert.equal(platform.kpi.revenue.value, null);
    assert.match(platform.kpi.revenue.reason ?? '', /\S/);
    assert.equal(platform.previous.products.value, null);
    assert.match(platform.previous.products.reason ?? '', /\S/);
    assert.equal(platform.change.revenue.value, null);
    assert.equal(platform.change.products.value, null);
    assert.ok(platform.previous.revenue.value !== null, 'missing current revenue never falls back to its previous twin');
  }
  for (const total of [series.totals.scope, series.totals.all]) {
    assert.equal(total.kpi.revenue.value, null);
    assert.match(total.kpi.revenue.reason ?? '', /\S/);
    assert.equal(total.previous.products.value, null);
    assert.match(total.previous.products.reason ?? '', /\S/);
  }
  const shopee = series.platforms.find(platform => platform.platformId === 1)!;
  assert.equal(shopee.kpi.shops.value, 0);
  assert.equal(shopee.kpi.shops.reason, undefined);
  assertSource(raw, shopee.kpi.shops.source, 0);
});

test('R1 negative control rejects a reader that sums all four platforms into the scope total', () => {
  const wrong = readMarketRawSeries(zinc30, { scopePlatformIds: [1, 2, 3, 8] });
  assert.equal(wrong.totals.scope.kpi.revenue.value, 35_000_000_000);
  assert.throws(() => assertR1(wrong), {
    name: 'AssertionError', message: /R1 scope revenue excludes the other platforms/,
    actual: 35_000_000_000, expected: 34_900_000_000,
  });
});

test('R5 a completed search with missing aggregations preserves its request and never falls back to a stale search', () => {
  const raw = structuredClone(canxi30);
  const body = raw[1]!.body;
  assert.ok(body && !Array.isArray(body.data));
  body.data.search_basic.aggregations = [];

  const series = readMarketRawSeries(raw);
  assert.equal(series.totals.all.kpi.revenue.value, null);
  assert.deepEqual(series.requestedPlatformIds, [1, 8]);
  assert.deepEqual([series.period.startDate, series.period.endDate], ['2026-09-21', '2026-10-20']);
  assert.equal(series.period.source?.responseIndex, 1);
  assert.equal(series.reason, 'search-basic-aggregations-missing');
  assert.deepEqual(series.platforms.map(platform => platform.platformId), [1, 8]);
  for (const platform of series.platforms) {
    for (const field of ['revenue', 'units', 'products', 'shops'] as const) {
      assert.equal(platform.kpi[field].value, null);
      assert.match(platform.kpi[field].reason ?? '', /\S/);
      assert.equal(platform.previous[field].value, null);
      assert.match(platform.previous[field].reason ?? '', /\S/);
    }
    assert.equal(platform.intervals?.length, 5, 'available interval data survives missing headline aggregations');
  }
  assert.equal(series.totals.scope.kpi.revenue.value, null);
});

test('R4/R5 interval platforms survive an absent search response with missing KPIs and no partial totals', () => {
  const raw = zinc30.filter(entry => entry.urlPath === '/v2/market/analytics/insight/');
  const series = readMarketRawSeries(raw);
  assert.deepEqual(series.platforms.map(platform => platform.platformId), [1, 2, 3, 8]);
  assert.equal(series.reason, 'search-basic-response-missing');
  for (const platform of series.platforms) {
    assert.equal(platform.kpi.revenue.value, null);
    assert.match(platform.kpi.revenue.reason ?? '', /\S/);
    assert.equal(platform.intervals?.length, 5);
    for (const interval of platform.intervals ?? []) assertSource(raw, interval.revenue.source, interval.revenue.value);
  }
  assert.equal(series.totals.scope.kpi.revenue.value, null);
  assert.equal(series.totals.all.kpi.revenue.value, null);
});
