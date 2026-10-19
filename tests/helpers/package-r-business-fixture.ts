import { createHash } from 'node:crypto';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import type { CaptureMetricMethodDetails } from '../../src/modules/analysis/research-automation/metric-method-bridge.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { buildAutomationMarketPresentation, marketPresentationDigest } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import { renderMarketCharts, renderSearchInterestChart } from '../../src/modules/analysis/reader-report/market-charts.js';
import { renderWorldBankCharts } from '../../src/modules/analysis/reader-report/macro-charts.js';
import { searchInterestChartPoints } from '../../src/modules/analysis/research-automation/search-interest.js';
import { fullMarket14Input } from './market14-full-fixture.js';
import { headlineInput, headlineRows, type HeadlineRow } from './market-headline-fixture.js';
import { unitPriceFixture } from './market-unit-price-fixture.js';
import { periodInventory, type PeriodCapture } from './package-e-period-fixture.js';
import { syntheticSearchInterest } from './search-interest-synthetic.js';

export type BusinessShape = 'P1' | 'P2' | 'P3';
export const BUSINESS_SHAPES: readonly BusinessShape[] = ['P1', 'P2', 'P3'];
export const BUSINESS_CLOCK = '2026-10-19T00:00:00.000Z';
export const BUSINESS_CAPTURE_DAY = '02/10/2026';
export const BUSINESS_SERIES = [22, 24, 26, 28, 30, 100, 32, 30, 28, 26, 24, 23] as const;
export const businessListing = (platform: string, index: number) => platform === 'shopee'
  ? `https://shopee.vn/product/201/${101 + index}` : `sample-tiktok-${index}`;

/** Expected bands are hand calculated from the existing thirds rule (six priced rows minimum).
 * P1 Shopee prices: 10k,20k | 30k,40k | 50k,60k; winning middle band.
 * P1 TikTok prices: 70k,80k | 90k,100k | 110k,120k; winning high band.
 * These constants never call the implementation under test.
 */
export const BUSINESS_EXPECTED = {
  P1: { shopee: { retained: 7, eligible: 6, bands: [[10000, 20000, 2], [30000, 40000, 2], [50000, 60000, 2]], winner: [30000, 40000] },
    tiktok: { retained: 6, eligible: 6, bands: [[70000, 80000, 2], [90000, 100000, 2], [110000, 120000, 2]], winner: [110000, 120000] } },
  P2: { shopee: { retained: 3, eligible: 3, bands: [], winner: [] } },
  P3: { shopee: { retained: 3, eligible: 3, bands: [], winner: [] }, tiktok: { retained: 2, eligible: 2, bands: [], winner: [] } },
} as const;

export function businessRows(shape: BusinessShape): HeadlineRow[] {
  const templates = headlineRows();
  const counts = shape === 'P1' ? [6, 6] : shape === 'P2' ? [3, 0] : [3, 2];
  const rows: HeadlineRow[] = (['shopee', 'tiktok'] as const).flatMap((platform, p) => Array.from({ length: counts[p]! }, (_, j) => {
    const price = (p === 0 ? j + 1 : j + 7) * 10000;
    const rev = shape === 'P1' ? (p === 0 ? [100000, 200000, 3000000, 4000000, 500000, 600000]
      : [700000, 800000, 900000, 1000000, 11000000, 12000000])[j]! : price * 10;
    return { ...templates[p * 6 + j]!, i: p * 10 + j, platform, listing: businessListing(platform, j),
      title: `Sản phẩm mẫu ${p + 1}-${j + 1}`, shop: `sample-shop-${p}-${j % 3}`, shopName: `Cửa hàng mẫu ${j % 3 + 1}`,
      cat: 'Nhóm mẫu', brand: '', rev, units: rev / price, asp: price };
  }));
  if (shape === 'P1') {
    rows[5] = { ...rows[5]!, shop: '(không ghi)' };
    rows.push({ ...rows[0]!, i: 6, listing: businessListing('shopee', 6), title: 'Sản phẩm mẫu 1-7', rev: null, units: null, asp: null });
  }
  return rows;
}

export function businessReviewEvidence(input: AutomationReportInput, counts: readonly number[],
  { unrelated = false, blocked = false }: { unrelated?: boolean; blocked?: boolean } = {}): AutomationReportInput {
  return { ...input, scope: { ...input.scope, testReviewCap: 20 }, collection: { ...input.collection!,
    exactShopee: { collectionId: 'sample-reviews', collectionSha256: 'a'.repeat(64), requestSha256: 'b'.repeat(64) },
    exactShopeeOutcome: { outcome: blocked ? 'PROVIDER_BLOCKED' : 'PARTIAL_LISTINGS', testReviewCap: 20,
      listings: counts.map((reviews, i) => ({ listingUrl: businessListing('shopee', unrelated ? 90 + i : i), reviews })),
      attemptedAt: '2026-10-02T00:00:01.000Z', providerMessage: null, reused: false },
  } };
}

export function businessMonthlyCaptures(): PeriodCapture[] {
  return BUSINESS_SERIES.map((value, index) => {
    const month = String(index + 1).padStart(2, '0');
    const end = new Date(Date.UTC(2025, index + 1, 0)).toISOString().slice(0, 10);
    return { ordinal: index + 10, key: businessListing('shopee', 0), start: `2025-${month}-01`, end,
      revenue: String(value), price: '410041', retrievedAt: '2026-10-02T00:00:01.000Z', range: null };
  });
}

let full: Promise<AutomationReportInput> | undefined;
/** Reuses the checked public presentation/chart fixture, then replaces all item/shop identities.
 * No transport is instantiated or called. Each invocation returns independently mutable input.
 */
export async function businessInput(shape: BusinessShape, options: { sourceTitle?: string } = {}): Promise<AutomationReportInput> {
  const inherited = structuredClone(await (full ??= fullMarket14Input()));
  const rows = businessRows(shape);
  if (options.sourceTitle !== undefined) rows[0] = { ...rows[0]!, title: options.sourceTitle };
  const head = await headlineInput(rows);
  const datedPlatforms = head.metricMethods!.capture!.platforms.map(({ platform, result }) => ({ platform,
    result: calculateMetricScopes({ ...result.input, scope: { ...result.input.scope, acquiredAt: '2026-10-02T00:00:01.000Z' } }),
  }));
  const datedResult = datedPlatforms[0]!.result;
  const binding = { ...head.marketPresentation!.binding, metric: { ...head.marketPresentation!.binding.metric!,
    resultSha256: marketPresentationDigest(datedResult) } };
  const datedPresentation = buildAutomationMarketPresentation(binding, { ...head.marketPresentation!.input, metric: datedResult });
  const platforms = (['shopee', 'tiktok'] as const).filter(platform => rows.some(row => row.platform === platform));
  const capture: { -readonly [K in keyof CaptureMetricMethodDetails]: CaptureMetricMethodDetails[K] } = { ...head.metricMethods!.capture!, platforms: datedPlatforms.filter(row => platforms.includes(row.platform)),
    rowPolicyVersion: 'automation-metric-capture-v2' as const, excludedRows: [], unattributedRows: [],
    capture: { ...head.metricMethods!.capture!.capture, platforms, keyword: `Sản phẩm mẫu ${shape.slice(1)}`,
      truncation: { cap: shape === 'P3' ? 20 : 40, totalShown: shape === 'P3' ? 80 : null, rowsRead: shape === 'P3' ? 8 : rows.length,
        pagesRead: 1, truncated: shape === 'P3' } },
  };
  const metricMethods = { ...head.metricMethods!, result: datedResult, capture, limitations: ['CAPTURE_RESULTS_PAGE_TOP_N_LIMITED'] };
  let marketPresentation = datedPresentation;
  if (shape === 'P3') {
    const unit = unitPriceFixture(rows.slice(0, 1));
    const ownerObservation = structuredClone(unit.packet.records[0]!.observation);
    ownerObservation.quantity.value = 100;
    const ownerBytes = Buffer.from(canonicalJson({ declaration: ownerObservation }));
    const ownerSha = createHash('sha256').update(ownerBytes).digest('hex');
    unit.packet.sources.push({ sha256: ownerSha, role: 'OWNER_DECLARATION' });
    unit.packet.records[0]!.quantityOverride = { source: { sourceSha256: ownerSha, locator: '/declaration' }, observation: ownerObservation };
    unit.retained.push({ sha256: ownerSha, bytes: ownerBytes });
    const record = { ...inherited.marketPresentation!.input.unitSpec!.record,
      request: { ...inherited.marketPresentation!.input.unitSpec!.record.request, unitPrices: unit.packet } };
    marketPresentation = buildAutomationMarketPresentation(marketPresentation.binding,
      { ...marketPresentation.input, unitSpec: { sha256: marketPresentationDigest(record), record } }, unit.retained);
    const excluded = (platform: 'shopee' | 'tiktok', rowIndex: number) => ({ platform, rowIndex,
      listingId: `excluded-${rowIndex}`, title: `Sản phẩm mẫu loại ${rowIndex}`, shop: 'Cửa hàng mẫu',
      revenue: '10000', units: '1', reason: 'NOT_MAIN_PRODUCT' as const });
    capture.excludedRows = [excluded('shopee', 6), excluded('tiktok', 7)];
    capture.unattributedRows = [{ rowIndex: 8, listingId: 'unattributed-8', title: 'Sản phẩm mẫu chưa gán',
      shop: 'Cửa hàng mẫu', revenue: '17000', units: '1' }];
  }
  const searchInterest = syntheticSearchInterest({ keyword: `Sản phẩm mẫu ${shape.slice(1)}`,
    ...(shape === 'P2' ? { points: BUSINESS_SERIES.map((index, i) => ({
      period: new Date(Date.UTC(2025, 0, 5 + i * 7)).toISOString().slice(0, 10), index })) } : {}) });
  const storedStats = inherited.collection!.officialStats!;
  const original = storedStats.values[0]!;
  const officialStats = { ...storedStats, values: [
    { ...original, label: 'Chỉ số mẫu A', value: '102.25', shown: '102.25' },
    { ...original, label: 'Chỉ số mẫu B', row: 15, cell: 'C15', value: '108.75', shown: '108.75' },
  ], files: storedStats.files.map(file => ({ ...file, url: 'https://example.invalid/sample.xlsx' })) };
  // Neutral source locator; the stored source identity still resolves as a citation.
  const worldBank = { ...inherited.collection!.worldBank!, indicators: inherited.collection!.worldBank!.indicators.map((indicator, i) => ({ ...indicator,
    row: { ...indicator.row!, indicatorName: `Chỉ số mẫu ${i + 1}`, unit: 'điểm' } })) };
  let input: AutomationReportInput = { ...inherited, marketPresentation, metricMethods,
    run: { ...inherited.run, createdAt: BUSINESS_CLOCK },
    start: { ...inherited.start, keyword: `Sản phẩm mẫu ${shape.slice(1)}` },
    scope: { ...inherited.scope, selectedProductIds: rows.filter(row => row.platform === 'shopee').map(row => row.listing!), peerProductIds: [] },
    collection: { ...inherited.collection!, searchInterest, officialStats, worldBank,
      productCards: rows.map(row => ({ productId: row.listing, sourceProductId: row.listing, title: row.title, platform: row.platform })) as never[] },
    marketPresentationCharts: await renderMarketCharts(rows),
    searchInterestChart: await renderSearchInterestChart(searchInterestChartPoints(searchInterest)),
    worldBankCharts: await renderWorldBankCharts(worldBank),
    captures: inherited.captures.map(capture => ({ ...capture, retrievedAt: '2026-10-02T00:00:01.000Z' })),
  };
  if (shape === 'P2') input = { ...input, marketInventory: periodInventory(businessMonthlyCaptures()) };
  if (shape === 'P2') input = businessReviewEvidence(input, [7]);
  if (shape === 'P3') input = businessReviewEvidence(input, [7], { unrelated: true });
  return input;
}
