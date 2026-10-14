// The three charts every Market reader report carries when its sample has the
// data: shop concentration, revenue by platform and the leading product rows.
// All numbers come from the saved product rows of the report; each platform is
// kept apart (no cross-platform total), and nothing is drawn for a platform
// whose in-sample revenue is unknown.
import { renderChart, type FlintChartInput, type FlintPalette, type RenderedChart } from './flint.js';
import { sp } from './format.js';
import { barChart } from './svg-charts.js';

export type MarketChartPlatform = 'shopee' | 'tiktok';
export type MarketChartRow = { readonly i: number; readonly platform: string; readonly shop: string; readonly rev: number | null | undefined };
export type MarketChartKind = 'concentration' | 'platform-revenue' | 'product-ranking';
export type MarketChart = RenderedChart & { id: string; kind: MarketChartKind; title: string; unit: string; note: string };

const LABEL: Record<MarketChartPlatform, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };
const COLOR: Record<MarketChartPlatform, string> = { shopee: '#c2410c', tiktok: '#1d2327' };
const PALETTE: FlintPalette = { san: { Shopee: COLOR.shopee, 'TikTok Shop': COLOR.tiktok } };
const TOP_GROUPS = [1, 3, 5, 10] as const;
const RANKED_ROWS = 10;

/** Rows a chart may use: platforms whose every row has a revenue and whose in-sample total is above zero. */
export function marketChartRows<R extends MarketChartRow>(rows: readonly R[]): (R & { readonly platform: MarketChartPlatform })[] {
  const usable = new Set<MarketChartPlatform>();
  for (const P of ['shopee', 'tiktok'] as const) {
    const own = rows.filter(row => row.platform === P);
    if (own.length && own.every(row => typeof row.rev === 'number' && Number.isFinite(row.rev) && row.rev >= 0) && own.some(row => row.rev! > 0)) usable.add(P);
  }
  return rows.filter((row): row is R & { readonly platform: MarketChartPlatform } => usable.has(row.platform as MarketChartPlatform));
}

const keepOrder = (field: string, order: readonly string[]) => (spec: any): void => {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    for (const channel of ['x', 'y']) if (node.encoding?.[channel]?.field === field) node.encoding[channel].sort = order;
    for (const value of Object.values(node)) walk(value);
  };
  walk(spec);
};
const one = (v: number): string => sp(v.toFixed(1));

/**
 * Renders the three Market charts from the saved product rows. `flint: false`
 * is the unit-test opt-out and draws the hand-made SVG only (recorded as svg-fallback).
 * Returns no chart when no platform has a complete, non-zero in-sample revenue.
 */
export async function renderMarketCharts(rows: readonly MarketChartRow[], { flint = true, rowNumber = row => row.i + 1, rowListNote = 'số dòng là thứ tự dòng trong dữ liệu bán hàng đã lưu' }: {
  flint?: boolean; rowNumber?: (row: MarketChartRow) => number; rowListNote?: string;
} = {}): Promise<MarketChart[]> {
  const usable = marketChartRows(rows);
  if (!usable.length) return [];
  const plats = (['shopee', 'tiktok'] as const).filter(P => usable.some(row => row.platform === P));
  const draw = async (input: FlintChartInput, fallback: () => string, patch?: (spec: any) => void, legend?: boolean): Promise<RenderedChart> =>
    flint ? renderChart(input, fallback, { palette: PALETTE, ...(patch ? { patch } : {}), ...(legend === undefined ? {} : { legend }) }) : { svg: fallback(), engine: 'svg-fallback' };
  const out: MarketChart[] = [];

  // 1. Concentration: share of each platform's in-sample revenue held by its leading shops.
  const groups = TOP_GROUPS.filter(k => plats.some(P => new Set(usable.filter(row => row.platform === P).map(row => row.shop)).size >= k));
  const shares = Object.fromEntries(plats.map(P => {
    const own = usable.filter(row => row.platform === P), total = own.reduce((s, row) => s + row.rev!, 0);
    const byShop = new Map<string, number>();
    for (const row of own) byShop.set(row.shop, (byShop.get(row.shop) ?? 0) + row.rev!);
    const sorted = [...byShop.values()].sort((a, b) => b - a);
    return [P, groups.map(k => k <= sorted.length ? 100 * sorted.slice(0, k).reduce((s, v) => s + v, 0) / total : null)];
  })) as Record<MarketChartPlatform, (number | null)[]>;
  const groupLabel = (k: number): string => `${k} gian hàng doanh thu cao`;
  const cats = groups.map(groupLabel);
  const values = plats.flatMap(P => groups.flatMap((k, j) => shares[P][j] === null ? [] : [{ nhom: groupLabel(k), san: LABEL[P], ty_trong: +shares[P][j]!.toFixed(1) }]));
  out.push({ id: 'market.concentration', kind: 'concentration', title: 'Mức tập trung doanh thu theo gian hàng, từng sàn', unit: '% doanh thu trong mẫu của từng sàn',
    note: 'Mỗi sàn tính riêng trên doanh thu trong mẫu của sàn đó; gian hàng sắp theo doanh thu giảm dần. Chỉ phản ánh các gian hàng trong mẫu, không nói về cả thị trường.',
    ...await draw({
      data: { values },
      semantic_types: { nhom: 'Category', san: 'Category', ty_trong: 'Number' },
      field_display_names: { nhom: ' ', san: 'Sàn', ty_trong: 'Tỷ trọng doanh thu trong mẫu (%)' },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { y: 'nhom', x: 'ty_trong', group: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(200, cats.length * 44) } },
    } as FlintChartInput, () => barChart(cats, plats.map(P => ({ name: LABEL[P], values: shares[P].map(v => v ?? 0), color: COLOR[P] })), { fmt: v => one(v) + '%' }), keepOrder('nhom', cats)) });

  // 2. Revenue by platform: one labelled bar per platform, never summed across platforms.
  const byPlatform = plats.map(P => ({ san: LABEL[P], doanh_thu: +(usable.filter(row => row.platform === P).reduce((s, row) => s + row.rev!, 0) / 1e6).toFixed(1) }));
  out.push({ id: 'market.platform-revenue', kind: 'platform-revenue', title: 'Doanh thu trong mẫu, từng sàn', unit: 'triệu đồng, ước tính trong mẫu',
    note: 'Mỗi thanh là doanh thu ước tính của các sản phẩm trong mẫu trên một sàn. Mỗi sàn đứng riêng, không gộp thành một con số chung; không phải quy mô thị trường.',
    ...await draw({
      data: { values: byPlatform },
      semantic_types: { san: 'Category', doanh_thu: 'Number' },
      field_display_names: { san: ' ', doanh_thu: 'Doanh thu trong mẫu (triệu đồng)' },
      chart_spec: { chartType: 'Bar Chart', encodings: { y: 'san', x: 'doanh_thu', color: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(120, byPlatform.length * 60) } },
    } as FlintChartInput, () => barChart(byPlatform.map(p => p.san), plats.map((P, j) => ({ name: LABEL[P], values: byPlatform.map((_, k) => k === j ? byPlatform[j]!.doanh_thu : 0), color: COLOR[P] })), { stacked: true, fmt: one }),
    keepOrder('san', byPlatform.map(p => p.san)), false) });

  // 3. Leading product rows by in-sample revenue, labelled by their source row number.
  const ranked = usable.filter(row => row.rev! > 0).sort((a, b) => b.rev! - a.rev! || a.i - b.i).slice(0, RANKED_ROWS);
  const rowLabel = (row: MarketChartRow & { readonly platform: MarketChartPlatform }): string => `Dòng ${rowNumber(row)}`;
  const rankedValues = ranked.map(row => ({ dong: rowLabel(row), san: LABEL[row.platform], doanh_thu: +(row.rev! / 1e6).toFixed(1) }));
  const order = rankedValues.map(row => row.dong);
  out.push({ id: 'market.product-ranking', kind: 'product-ranking', title: 'Sản phẩm có doanh thu cao trong mẫu', unit: 'triệu đồng, ước tính trong mẫu',
    note: `Gồm tối đa mười dòng sản phẩm có doanh thu cao trong mẫu, sắp giảm dần; ${rowListNote}. Mỗi sàn giữ màu riêng; không cộng chéo sàn.`,
    ...await draw({
      data: { values: rankedValues },
      semantic_types: { dong: 'Category', san: 'Category', doanh_thu: 'Number' },
      field_display_names: { dong: ' ', san: 'Sàn', doanh_thu: 'Doanh thu trong mẫu (triệu đồng)' },
      chart_spec: { chartType: 'Bar Chart', encodings: { y: 'dong', x: 'doanh_thu', color: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(160, ranked.length * 30) } },
    } as FlintChartInput, () => barChart(order, plats.map(P => ({ name: LABEL[P], values: ranked.map(row => row.platform === P ? row.rev! / 1e6 : 0), color: COLOR[P] })), { stacked: true, fmt: one }),
    keepOrder('dong', order)) });
  return out;
}
