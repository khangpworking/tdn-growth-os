import { calculateMetricScopes } from '../../src/modules/analysis/metric-scope-calculator.js';
import { renderMarketCharts } from '../../src/modules/analysis/reader-report/market-charts.js';
import { buildAutomationMarketPresentation, marketPresentationDigest } from '../../src/modules/analysis/research-automation/market-presentation-method.js';
import type { AutomationReportInput } from '../../src/modules/analysis/research-automation/reports.js';
import { metricFixture } from '../fixtures/metric-scope-synthetic.js';
import { fullMarket14Input } from './market14-full-fixture.js';

type Platform = 'shopee' | 'tiktok';
export type HeadlineRow = NonNullable<AutomationReportInput['marketPresentation']>['input']['rows'][number];

// Deliberately different distributions, prices, shop membership and periods.
// Shopee: 10m, top product 40%, five products 96%, five shops (top shop 65%).
// TikTok Shop: 16m, top product 56.25%, five products 96.875%, three shops.
export function headlineRows(): HeadlineRow[] {
  return (['shopee', 'tiktok'] as const).flatMap((platform, p) => {
    const revenues = p === 0 ? [4_000_000, 2_500_000, 1_500_000, 1_000_000, 600_000, 400_000]
      : [9_000_000, 3_000_000, 2_000_000, 1_000_000, 500_000, 500_000];
    const shops = p === 0 ? [0, 0, 1, 2, 3, 4] : [0, 1, 1, 2, 2, 2];
    return revenues.map((rev, j) => ({ i: p * 10 + j, platform, listing: `fixture-${platform}-${j}`,
      shop: `fixture-shop-${p}-${shops[j]}`, title: `Synthetic headline item ${p}-${j}`, cat: 'Synthetic category', brand: 'Synthetic brand',
      rev, units: p === 0 ? rev / 100_000 : 10, asp: p === 0 ? 100_000 : rev / 10, start: null }));
  });
}

function resultFor(platform: Platform, rows: readonly HeadlineRow[]) {
  const input = metricFixture(), template = input.records[0]!;
  input.scope = { ...input.scope, platform, ...(platform === 'tiktok' ? { start: '2026-08-01', end: '2026-08-30' } : {}) };
  const observation = (value: number | null | undefined, locator: string) => ({
    ...template.revenue, state: value == null ? 'missing' as const : value === 0 ? 'observed_zero' as const : 'observed_value' as const,
    value: value == null ? null : String(value), displayedValue: null, source: { ...template.source, locator },
  });
  input.records = rows.filter(row => row.platform === platform).map((row, j) => ({
    ...template, shopId: row.shop, listingId: row.listing!, title: row.title, label: null,
    source: { ...template.source, locator: `/rows/${j}` },
    revenue: observation(row.rev, `/rows/${j}/revenue`), units: observation(row.units, `/rows/${j}/units`),
    measurement: { ...template.measurement, platform, start: input.scope.start, end: input.scope.end },
  }));
  return calculateMetricScopes(input);
}

/** Frozen synthetic methods plus actual charts; no provider calls or stored user data. */
let base: Promise<AutomationReportInput> | undefined;
export async function headlineInput(rows = headlineRows(), { fallback = false } = {}): Promise<AutomationReportInput> {
  const input = await (base ??= fullMarket14Input());
  const shopee = resultFor('shopee', rows), tiktok = resultFor('tiktok', rows);
  const binding = { ...input.marketPresentation!.binding,
    metric: { ...input.marketPresentation!.binding.metric!, resultSha256: marketPresentationDigest(shopee) } };
  const marketPresentation = buildAutomationMarketPresentation(binding,
    { metric: shopee, rows: fallback ? [] : rows, unitSpec: null });
  return { ...input, marketPresentation,
    marketPresentationCharts: await renderMarketCharts(rows),
    metricMethods: { ...input.metricMethods!, result: shopee,
      capture: { ...input.metricMethods!.capture!, platforms: [{ platform: 'shopee', result: shopee }, { platform: 'tiktok', result: tiktok }] } },
  };
}

/** A valid filtered-empty capture has page figures but cannot draw Hình 4.1. */
export function filteredEmptyHeadlineInput(input: AutomationReportInput): AutomationReportInput {
  const empty = metricFixture();
  empty.profileId = 'automation-metric-capture-v2';
  empty.records = [];
  const result = calculateMetricScopes(empty);
  return { ...input, marketPresentationCharts: [],
    marketPresentation: buildAutomationMarketPresentation({ ...input.marketPresentation!.binding,
      metric: { ...input.marketPresentation!.binding.metric!, resultSha256: marketPresentationDigest(result) } },
    { metric: result, rows: [], unitSpec: null }),
    metricMethods: { ...input.metricMethods!, result,
      capture: { ...input.metricMethods!.capture!, rowPolicyVersion: 'automation-metric-capture-v2',
        platforms: (['shopee', 'tiktok'] as const).map(platform => ({ platform,
          result: calculateMetricScopes({ ...empty, scope: { ...empty.scope, platform } }) })),
        platformHeadlines: [
          { platform: 'shopee', revenue: { value: '12345', precision: 'exact', locator: '/groups/W3_platformSplit/0/revenue' }, units: null },
          { platform: 'tiktok', revenue: { value: '67890', precision: 'exact', locator: '/groups/W3_platformSplit/1/revenue' }, units: null },
        ] },
    },
  };
}
