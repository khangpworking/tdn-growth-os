import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { buildAutomationMarketPresentation, marketPresentationDigest } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { renderCaptureCountCharts, renderMarketCharts, renderSearchInterestChart, UNKNOWN_SHOP } from '../../src/modules/analysis/reader-report/market-charts.js';
import { renderComtradeCharts, renderWorldBankCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { sync1ReaderFixture } from './sync1-reader-fixture.js';
import { unitPriceFixture } from './market-unit-price-fixture.js';
import { periodInventory } from './package-e-period-fixture.js';
import { gAdsUnchecked, gByteInput, gEvidenceInput, gWithQuoteContexts } from './package-g-evidence-fixture.js';
import { syntheticSearchInterest, syntheticWeeks } from './search-interest-synthetic.js';
import { fullMarket14Input } from './market14-full-fixture.js';

export const F_SHAPES = ['F1', 'F2', 'F3'] as const;
export type FShape = typeof F_SHAPES[number];
export const F_CLOCK = '2026-10-19T00:00:00.000Z';
export const F_CAPTURE_DAY = '02/10/2026';
export const F_QUOTED_TITLE = '/ Mẫu -- Shopee -- 7% -- mô tả tổng hợp được giữ nguyên để kiểm tra trích dẫn và nhãn rút gọn trong biểu đồ';
export const F_DUPLICATE_TITLE = 'Sản phẩm mẫu lặp có mô tả dài để kiểm tra nhãn hiển thị trong bảng và biểu đồ theo dữ liệu đã lưu';
const INDICES = [41, 8, 73, 12, 105, 20, 146, 24, 183, 32] as const;
const REVENUES = [110000000, 92000000, 73000000, 54000000, 35000000, 26000000, 17000000, 8000000, 6000000, 4000000] as const;
type Row = NonNullable<AutomationReportInput['marketPresentation']>['input']['rows'][number];

// Distinct products use retained shop/listing identity pairs, independently of title.
// Contract constants, not outputs read from the F+ implementation.
export const F_EXPECTED = {
  F1: { rows: [5, 5], products: [5, 5], knownShops: ['shopee'], weeks: 52, revenue: [241000000, 184000000] },
  F2: { rows: [3, 0], products: [3, 0], knownShops: [], weeks: 8, revenue: [26000000, 0] },
  F3: { rows: [2, 2], products: [2, 2], knownShops: ['shopee', 'tiktok'], weeks: 6, revenue: [16000000, 10000000] },
} as const;

export function fRows(shape: FShape): Row[] {
  const templates = sync1ReaderFixture('1.4.0').rows;
  const count = shape === 'F1' ? 10 : shape === 'F2' ? 3 : 4;
  return Array.from({ length: count }, (_, j) => {
    const platform = shape === 'F2' || j % 2 === 0 ? 'shopee' : 'tiktok';
    const rev = shape === 'F1' ? REVENUES[j]! : [12000000, 8000000, 6000000, 2000000][j]!;
    // F1 also repeats a title across two distinct listing identities on the unknown-shop platform.
    // F2 is one platform: 12m + 8m + 6m. F3 uses 12m+6m, 8m+2m.
    const adjustedRev = shape === 'F3' && j === 2 ? 4000000 : rev;
    const title = shape === 'F1' ? j === 0 || j === 2 ? F_DUPLICATE_TITLE : j === 4 ? F_QUOTED_TITLE
      : `Sản phẩm mẫu ${j === 3 ? 2 : j + 1} với mô tả nguồn dài được giữ nguyên trong bảng bằng chứng để đối chiếu từng dòng chính xác`
      : `Sản phẩm mẫu ${shape.slice(1)}-${j + 1}`;
    return { ...templates[j]!, i: INDICES[j]!, platform, title, rev: adjustedRev, units: adjustedRev / 10000, asp: 10000,
      listing: shape === 'F1' && j === 4 ? 'shopee:sample-0' : `${platform}:sample-${j}`,
      shop: shape === 'F2' || shape === 'F1' && platform === 'tiktok' ? UNKNOWN_SHOP : `sample-shop-${j}`,
      shopName: `Cửa hàng mẫu ${j + 1}`, brand: j % 2 ? 'Nhãn mẫu B' : 'Nhãn mẫu A', cat: 'Nhóm mẫu' };
  });
}

/** Adaptation of market-capture-reader's local platformResult: same normalized input,
 * calculated by the existing public calculator; explicit distinct listing/shop pairs.
 * Importing that test file would register its tests, so reuse its recipe here.
 */
function platformResult(platform: 'shopee' | 'tiktok', rows: readonly Row[]) {
  const input = metricFixture(), template = input.records[0]!;
  input.scope = { ...input.scope, platform, start: '2026-01-01', end: '2026-01-31', acquiredAt: '2026-10-02T03:04:05.678Z' };
  input.records = rows.filter(row => row.platform === platform).map(row => {
    const ref = (suffix = '') => ({ ...template.source, locator: `/groups/W12_topProducts/rows/${row.i}${suffix}` });
    return { ...template, listingId: row.listing!, title: row.title, shopId: row.shop, label: null, source: ref(),
      measurement: { ...template.measurement, platform, start: input.scope.start, end: input.scope.end },
      revenue: { ...template.revenue, state: 'observed_value', value: String(row.rev), displayedValue: null, source: ref('/revenue') },
      units: { ...template.units, state: 'observed_value', value: String(row.units), displayedValue: null, source: ref('/units') } };
  });
  return calculateMetricScopes(input);
}

/** Reuses dedup's withInventory boundary through E's exported periodInventory recipe.
 * Ten product/window rows in F1, two in the partial shapes; no retained user data.
 */
function withInventory(base: AutomationReportInput, rows: readonly Row[]): AutomationReportInput {
  return { ...base, marketInventory: periodInventory(rows.slice(0, rows.length === 10 ? 10 : 2).map((row, j) => ({
    ordinal: 100 + j, key: row.listing!, start: j === 4 ? '2026-02-01' : '2026-01-01',
    end: j === 4 ? '2026-02-28' : '2026-01-31', revenue: String(row.rev), price: '410041',
    acquiredAt: '2026-10-02T03:04:05.678Z', retrievedAt: '2026-10-02T03:04:05.678Z',
  }))) };
}

/** F1/F2/F3 share the main E/R/G evidence fixtures and fullMarket14Input transitively.
 * Capture shapes deliberately have no workbook presentation rows, exercising the
 * capture source selected by marketChartSource. The inventory still supplies prices.
 * All transports remain unused; all ids, source names and amounts are synthetic.
 */
export async function fInput(shape: FShape, empty = false, presentationRows = false): Promise<AutomationReportInput> {
  const inherited = structuredClone(await gEvidenceInput(shape === 'F1' ? 'G1' : shape === 'F2' ? 'G2' : 'G3'));
  const rows = empty ? [] : fRows(shape);
  const platforms = shape === 'F2' ? ['shopee'] as const : ['shopee', 'tiktok'] as const;
  const results = platforms.map(platform => ({ platform, result: platformResult(platform, rows) }));
  const result = results[0]!.result;
  const unit = unitPriceFixture(rows);
  const full = await fullMarket14Input();
  const record = { ...full.marketPresentation!.input.unitSpec!.record,
    request: { ...full.marketPresentation!.input.unitSpec!.record.request, unitPrices: unit.packet } };
  const binding = { ...inherited.marketPresentation!.binding, metric: { ...inherited.marketPresentation!.binding.metric!,
    resultSha256: marketPresentationDigest(result) } };
  const marketPresentation = buildAutomationMarketPresentation(binding, { metric: result, rows: presentationRows ? rows : [],
    unitSpec: presentationRows && rows.length ? { sha256: marketPresentationDigest(record), record } : null }, unit.retained);
  const series = syntheticWeeks(F_EXPECTED[shape].weeks, '2025-09-21');
  const searchInterest = syntheticSearchInterest({ keyword: `Sản phẩm mẫu ${shape.slice(1)}`, points: series });
  const { worldBank, officialStats, comtrade, searchAds, ...collection } = inherited.collection!;
  const macro = shape === 'F2' && worldBank ? { ...worldBank, indicators: worldBank.indicators.slice(0, 1) } : worldBank;
  const capture = { ...inherited.metricMethods!.capture!, platforms: results,
    rowPolicyVersion: 'automation-metric-capture-v2' as const, excludedRows: [], unattributedRows: [],
    capture: { ...inherited.metricMethods!.capture!.capture, platforms: [...platforms],
      measurementPeriod: { startDate: '2026-01-01', endDate: '2026-01-31' },
      truncation: { cap: 40, totalShown: null, pagesRead: 1, rowsRead: rows.length, truncated: false } } };
  let input: AutomationReportInput = { ...inherited, marketPresentation,
    metricMethods: { ...inherited.metricMethods!, result, capture },
    collection: { ...collection, searchInterest, ...(macro ? { worldBank: macro } : {}),
      ...(shape === 'F1' ? { officialStats, comtrade, searchAds } : {}),
      productCards: rows.map(row => ({ productId: row.listing, title: row.title, platform: row.platform })) as never[] },
    scope: { ...inherited.scope, selectedProductIds: rows.map(row => row.listing!), peerProductIds: [] },
    marketPresentationCharts: await renderMarketCharts(rows),
    // Counts are deliberately prepared as service.ts does today. F+ must stop displaying them.
    marketCaptureCharts: await renderCaptureCountCharts(results.filter(row => row.result.input.records.length)
      .map(row => ({ platform: row.platform, count: row.result.input.records.length }))),
    searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)),
    worldBankCharts: await renderWorldBankCharts(macro),
    comtradeCharts: await renderComtradeCharts(shape === 'F1' ? comtrade : undefined, { currentReader: true }),
  };
  input = withInventory(input, rows);
  if (shape === 'F1') input = fAfterTableMetadata(gWithQuoteContexts(input));
  return input;
}

/** Same trusted prepared-fragment seam as G's quote contexts. This short block
 * occurs after the long M03 sample tables, in the next section's first figure.
 * The input has no CSS keep rule: grouping and print policy belong to the reader.
 */
export function fAfterTableMetadata(input: AutomationReportInput): AutomationReportInput {
  return { ...input, marketPresentationCharts: input.marketPresentationCharts!.map((chart, i) => i ? chart : {
    ...chart, svg: chart.svg + '</div><dl id="f-short-metadata"><dt>Phạm vi mẫu</dt><dd>Chỉ các dòng đã lưu</dd>'
      + '<dt>Kỳ quan sát</dt><dd>01/01/2026 đến 31/01/2026</dd></dl><div>',
  }) };
}

// Two independently valid retained results cover checked-empty, checked-unknown,
// failed, unchecked and no-site states; the three-brand retained cap is preserved.
export async function fAdsVariants(): Promise<AutomationReportInput[]> {
  const input = await fInput('F1');
  return [input, { ...input, collection: { ...input.collection!, searchAds: gAdsUnchecked() } }];
}

export const fByteInput = gByteInput;
