// The three charts every Market reader report carries when its sample has the
// data: shop concentration, revenue by platform and the leading product rows.
// All numbers come from the saved product rows of the report; each platform is
// kept apart (no cross-platform total), and nothing is drawn for a platform
// whose in-sample revenue is unknown.
import { renderChart, type FlintChartInput, type FlintPalette, type RenderedChart } from './flint.js';
import { sp } from './format.js';
import { barChart, lineChart } from './svg-charts.js';

export type MarketChartPlatform = 'shopee' | 'tiktok';
export type MarketChartRow = { readonly i: number; readonly platform: string; readonly shop: string; readonly title?: string; readonly ref?: string; readonly refAt?: number; readonly rev: number | null | undefined };
export type MarketChartKind = 'concentration' | 'platform-revenue' | 'product-ranking';
export type MarketChart = RenderedChart & { id: string; kind: MarketChartKind; title: string; unit: string; note: string };

const LABEL: Record<MarketChartPlatform, string> = { shopee: 'Shopee', tiktok: 'TikTok Shop' };
const COLOR: Record<MarketChartPlatform, string> = { shopee: '#c2410c', tiktok: '#1d2327' };
const PALETTE: FlintPalette = { san: { Shopee: COLOR.shopee, 'TikTok Shop': COLOR.tiktok } };
export const TOP_GROUPS = [1, 3, 5, 10] as const;
const RANKED_ROWS = 10;
/** Shop value of a sales row whose source did not record its shop. */
export const UNKNOWN_SHOP = '(không ghi)';
/** Current reader: header of the visible row-ref column of each platform's capture sample table. */
export const CAPTURE_ROW_REF_HEADER = 'Mã dòng';
/** Current reader: the one count unit used by the sample, price and period tables. */
export const CAPTURE_UNIT_TERM = 'đơn vị bán';
/** Stable machine ref of a capture sample row (per platform, 1-based). */
export const captureRowRef = (platform: string, index: number): string => `${platform}:${index + 1}`;
/** Visible ref of a capture sample row, the same text in its table, its chart label and its interpretation. */
export const captureRowRefLabel = (index: number): string => `Dòng ${index + 1}`;
/** Current reader: longest product alias drawn on the ranking chart; the exact title stays in the sample table. */
export const RANKING_ALIAS_MAX = 40;
/** Current reader: most labelled ticks on a weekly search axis, first and last included. */
export const SEARCH_AXIS_LABEL_MAX = 13;
const rankingAlias = (title: string): string => title.length > RANKING_ALIAS_MAX ? title.slice(0, RANKING_ALIAS_MAX - 1) + '…' : title;

/**
 * Current reader only: keeps at most max evenly spaced x-axis labels (first and last included) of a drawn
 * discrete-axis line chart. Every point stays plotted; only label text is dropped. Other SVG is returned unchanged.
 */
export function thinSearchAxisLabels(svg: string, max: number = SEARCH_AXIS_LABEL_MAX): string {
  const axis = svg.search(/aria-label="X-axis for a discrete scale/u);
  if (axis < 0) return svg;
  const start = svg.indexOf('<g class="mark-text role-axis-label"', axis);
  if (start < 0) return svg;
  const end = svg.indexOf('</g>', start);
  if (end < 0) return svg;
  const group = svg.slice(start, end), texts = group.match(/<text\b[^>]*>[^<]*<\/text>/gu) ?? [];
  const n = texts.length;
  if (n <= max) return svg;
  const keep = new Set(Array.from({ length: max }, (_, j) => Math.round(j * (n - 1) / (max - 1))));
  let k = 0;
  const thinned = group.replace(/<text\b[^>]*>[^<]*<\/text>/gu, text => keep.has(k++) ? text : '');
  return svg.slice(0, start) + thinned + svg.slice(end);
}

/** Rows a chart may use: platforms whose every row has a revenue and whose in-sample total is above zero. */
export function marketChartRows<R extends MarketChartRow>(rows: readonly R[]): (R & { readonly platform: MarketChartPlatform })[] {
  const usable = new Set<MarketChartPlatform>();
  for (const P of ['shopee', 'tiktok'] as const) {
    const own = rows.filter(row => row.platform === P);
    if (own.length && own.every(row => typeof row.rev === 'number' && Number.isFinite(row.rev) && row.rev >= 0) && own.some(row => row.rev! > 0)) usable.add(P);
  }
  return rows.filter((row): row is R & { readonly platform: MarketChartPlatform } => usable.has(row.platform as MarketChartPlatform));
}

/** Chart platforms whose every row records its shop: only these get a concentration chart. */
export function concentrationPlatforms(rows: readonly MarketChartRow[]): MarketChartPlatform[] {
  const usable = marketChartRows(rows);
  return (['shopee', 'tiktok'] as const).filter(P => usable.some(row => row.platform === P) && usable.every(row => row.platform !== P || row.shop !== UNKNOWN_SHOP));
}
/** True when the sample has chartable rows but no platform records its shops, so no concentration chart is drawn. */
export const marketShopsUnrecorded = (rows: readonly MarketChartRow[]): boolean => marketChartRows(rows).length > 0 && concentrationPlatforms(rows).length === 0;

/** Exact product rows displayed by Hình 7.1, also used to bound its headline claims. */
export const marketRankedRows = (rows: readonly MarketChartRow[]) =>
  marketChartRows(rows).filter(row => row.rev! > 0).sort((a, b) => b.rev! - a.rev! || a.i - b.i).slice(0, RANKED_ROWS);

export type MarketShare = {
  readonly platform: MarketChartPlatform; readonly n: number; readonly total: number;
  readonly top: number; readonly top5: number | null; readonly shops: readonly (number | null)[] | null;
};
/**
 * Per chart platform, the percent of its own in-sample revenue held by its leading product, its five leading
 * products and its 1/3/5/10 leading shops (`shops` follows TOP_GROUPS; null when the platform does not record
 * shops, an entry is null when it has fewer shops). The one formula behind Hình 4.2 and the Phần 1 findings.
 */
export function marketShares(rows: readonly MarketChartRow[]): MarketShare[] {
  const usable = marketChartRows(rows), shopPlats = concentrationPlatforms(rows);
  return (['shopee', 'tiktok'] as const).filter(P => usable.some(row => row.platform === P)).map(P => {
    const own = usable.filter(row => row.platform === P), total = own.reduce((s, row) => s + row.rev!, 0);
    const lead = (sorted: readonly number[], k: number): number | null => k <= sorted.length ? 100 * sorted.slice(0, k).reduce((s, v) => s + v, 0) / total : null;
    const byShop = new Map<string, number>();
    for (const row of own) byShop.set(row.shop, (byShop.get(row.shop) ?? 0) + row.rev!);
    const shops = [...byShop.values()].sort((a, b) => b - a), products = own.map(row => row.rev!).sort((a, b) => b - a);
    return { platform: P, n: own.length, total, top: lead(products, 1)!, top5: lead(products, 5), shops: shopPlats.includes(P) ? TOP_GROUPS.map(k => lead(shops, k)) : null };
  });
}

/**
 * The rows behind one share of `marketShares`: `part` is the platform's leading `k` products (or the rows of its
 * leading `k` shops), `total` every usable row of the platform. Same order and ties as `marketShares`.
 */
export function marketShareMembers<R extends MarketChartRow>(rows: readonly R[], platform: MarketChartPlatform, by: 'products' | 'shops', k: number): { part: R[]; total: R[] } {
  const total = marketChartRows(rows).filter(row => row.platform === platform);
  if (by === 'products') return { part: [...total].sort((a, b) => b.rev! - a.rev!).slice(0, k), total };
  const byShop = new Map<string, R[]>();
  for (const row of total) byShop.set(row.shop, [...(byShop.get(row.shop) ?? []), row]);
  const sum = (members: readonly R[]): number => members.reduce((s, row) => s + row.rev!, 0);
  return { part: [...byShop.values()].sort((a, b) => sum(b) - sum(a)).slice(0, k).flat(), total };
}

/** Category label of a row on the product-ranking chart (Hình 7.1), as `renderMarketCharts` draws it. */
export function marketRankingRowLabel(row: MarketChartRow & { readonly platform: MarketChartPlatform }, { currentReader = false, titleLabels = false, rowNumber = (value: MarketChartRow) => value.i + 1 }: {
  currentReader?: boolean; titleLabels?: boolean; rowNumber?: (row: MarketChartRow) => number } = {}): string {
  return currentReader && row.ref
    ? (row.title ? `${rankingAlias(row.title)} · ${LABEL[row.platform]} · ${row.ref}` : `${LABEL[row.platform]} · ${row.ref}`)
    : titleLabels && row.title ? `${row.title.length > 64 ? row.title.slice(0, 61) + '…' : row.title} · ${LABEL[row.platform]} · ${rowNumber(row)}` : `Dòng ${rowNumber(row)}`;
}

/** Platform label as the Market charts print it. */
export const marketChartPlatformLabel = (platform: MarketChartPlatform): string => LABEL[platform];

export const keepOrder = (field: string, order: readonly string[]) => (spec: any): void => {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    for (const channel of ['x', 'y']) if (node.encoding?.[channel]?.field === field) node.encoding[channel].sort = order;
    for (const value of Object.values(node)) walk(value);
  };
  walk(spec);
};
/** Current reader: keeps a labelled legend on the colour series even when only one series is drawn. */
export const labelSeries = (field: string, title: string, shown: readonly string[]) => (spec: any): void => {
  const walk = (node: any): void => {
    if (!node || typeof node !== 'object') return;
    const color = node.encoding?.color;
    if (color?.field === field && !node.__themeSynthetic) {
      color.legend = { title };
      // The legend lists only the series drawn: a platform left out of the chart is not named.
      if (Array.isArray(color.scale?.domain)) {
        const keep: [string, unknown][] = color.scale.domain.map((k: string, i: number): [string, unknown] => [k, color.scale.range?.[i]]).filter(([k]: [string, unknown]) => shown.includes(k));
        color.scale = { ...color.scale, domain: keep.map(([k]) => k), range: keep.map(([, v]) => v) };
      }
    }
    for (const value of Object.values(node)) walk(value);
  };
  walk(spec);
};
const one = (v: number): string => sp(v.toFixed(1));

/**
 * Renders the three Market charts from the saved product rows. `flint: false`
 * is the unit-test opt-out and draws the hand-made SVG only (recorded as svg-fallback).
 * `sampleNote` is appended to every chart note when the rows are a limited list.
 * Returns no chart when no platform has a complete, non-zero in-sample revenue.
 */
export async function renderMarketCharts(rows: readonly MarketChartRow[], { flint = true, rowNumber = row => row.i + 1, rowListNote = 'số dòng là thứ tự dòng trong dữ liệu bán hàng đã lưu', sampleNote = '', titleLabels = false, currentReader = false }: {
  flint?: boolean; titleLabels?: boolean; currentReader?: boolean; rowNumber?: (row: MarketChartRow) => number; rowListNote?: string; sampleNote?: string;
} = {}): Promise<MarketChart[]> {
  const usable = marketChartRows(rows);
  if (!usable.length) return [];
  const plats = (['shopee', 'tiktok'] as const).filter(P => usable.some(row => row.platform === P));
  const draw = async (input: FlintChartInput, fallback: () => string, patch?: (spec: any) => void, legend?: boolean): Promise<RenderedChart> =>
    flint ? renderChart(input, fallback, { palette: PALETTE, ...(patch ? { patch } : {}), ...(legend === undefined ? {} : { legend }) }) : { svg: fallback(), engine: 'svg-fallback' };
  const out: MarketChart[] = [];

  // 1. Concentration: share of each platform's in-sample revenue held by its leading shops.
  // A platform with any row that does not record its shop is left out: its rows
  // would otherwise count as one shop holding the whole sample.
  const shared = marketShares(rows).filter(share => share.shops), shopPlats = shared.map(share => share.platform);
  const leftOut = plats.filter(P => !shopPlats.includes(P));
  const cols = TOP_GROUPS.flatMap((_, j) => shared.some(share => share.shops![j] !== null) ? [j] : []), groups = cols.map(j => TOP_GROUPS[j]!);
  const shares = Object.fromEntries(shared.map(share => [share.platform, cols.map(j => share.shops![j] ?? null)])) as Record<MarketChartPlatform, (number | null)[]>;
  const groupLabel = (k: number): string => `${k} gian hàng doanh thu cao`;
  const cats = groups.map(groupLabel);
  const values = shopPlats.flatMap(P => groups.flatMap((k, j) => shares[P][j] === null ? [] : [{ nhom: groupLabel(k), san: LABEL[P], ty_trong: +shares[P][j]!.toFixed(1) }]));
  const leftOutNote = leftOut.length ? ` ${leftOut.map(P => LABEL[P]).join(' và ')}: nguồn không ghi gian hàng cho từng sản phẩm nên không tính mức tập trung.` : '';
  const concentrationTitle = currentReader ? `Mức tập trung doanh thu theo gian hàng, ${shopPlats.map(P => LABEL[P]).join(' và ')}` : 'Mức tập trung doanh thu theo gian hàng, từng sàn';
  if (shopPlats.length) out.push({ id: 'market.concentration', kind: 'concentration', title: concentrationTitle, unit: titleLabels ? 'phần trăm doanh thu trong mẫu của từng sàn' : '% doanh thu trong mẫu của từng sàn',
    note: 'Mỗi sàn tính riêng trên doanh thu trong mẫu của sàn đó; gian hàng sắp theo doanh thu giảm dần. Chỉ phản ánh các gian hàng trong mẫu, không nói về cả thị trường.' + leftOutNote + sampleNote,
    ...await draw({
      data: { values },
      semantic_types: { nhom: 'Category', san: 'Category', ty_trong: 'Number' },
      field_display_names: { nhom: ' ', san: 'Sàn', ty_trong: titleLabels ? 'Tỷ trọng doanh thu trong mẫu (phần trăm)' : 'Tỷ trọng doanh thu trong mẫu (%)' },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { y: 'nhom', x: 'ty_trong', group: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(200, cats.length * 44) } },
    } as FlintChartInput, () => barChart(cats, shopPlats.map(P => ({ name: LABEL[P], values: shares[P].map(v => v ?? 0), color: COLOR[P] })), { fmt: v => one(v) + (titleLabels ? ' phần trăm' : '%') }),
    currentReader ? (spec: any) => { keepOrder('nhom', cats)(spec); labelSeries('san', 'Sàn', shopPlats.map(P => LABEL[P]))(spec); } : keepOrder('nhom', cats), currentReader ? true : undefined) });

  // 2. Revenue by platform: one labelled bar per platform, never summed across platforms.
  const millions = (revenue: number): number => titleLabels ? revenue / 1e6 : +(revenue / 1e6).toFixed(1);
  const revenueLabel = (value: number): string => titleLabels && value > 0 && value < 0.1 ? value.toLocaleString('vi-VN', { maximumFractionDigits: 20 }) : one(value);
  const byPlatform = plats.map(P => ({ san: LABEL[P], doanh_thu: millions(usable.filter(row => row.platform === P).reduce((s, row) => s + row.rev!, 0)) }));
  out.push({ id: 'market.platform-revenue', kind: 'platform-revenue', title: 'Doanh thu trong mẫu, từng sàn', unit: 'triệu đồng, ước tính trong mẫu',
    note: 'Mỗi thanh là doanh thu ước tính của các sản phẩm trong mẫu trên một sàn. Mỗi sàn đứng riêng, không gộp thành một con số chung; không phải quy mô thị trường.' + sampleNote,
    ...await draw({
      data: { values: byPlatform },
      semantic_types: { san: 'Category', doanh_thu: 'Number' },
      field_display_names: { san: ' ', doanh_thu: 'Doanh thu trong mẫu (triệu đồng)' },
      chart_spec: { chartType: 'Bar Chart', encodings: { y: 'san', x: 'doanh_thu', color: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(120, byPlatform.length * 60) } },
    } as FlintChartInput, () => barChart(byPlatform.map(p => p.san), plats.map((P, j) => ({ name: LABEL[P], values: byPlatform.map((_, k) => k === j ? byPlatform[j]!.doanh_thu : 0), color: COLOR[P] })), { stacked: true, fmt: revenueLabel }),
    keepOrder('san', byPlatform.map(p => p.san)), false) });

  // 3. Leading product rows by in-sample revenue, labelled by their source row number.
  const ranked = marketRankedRows(rows);
  const rowLabel = (row: MarketChartRow & { readonly platform: MarketChartPlatform }): string => marketRankingRowLabel(row, { currentReader, titleLabels, rowNumber });
  const rankedValues = ranked.map(row => ({ dong: rowLabel(row), san: LABEL[row.platform], doanh_thu: millions(row.rev!) }));
  const order = rankedValues.map(row => row.dong);
  out.push({ id: 'market.product-ranking', kind: 'product-ranking', title: 'Sản phẩm có doanh thu cao trong mẫu', unit: 'triệu đồng, ước tính trong mẫu',
    note: `Gồm tối đa mười dòng sản phẩm có doanh thu cao trong mẫu, sắp giảm dần; ${rowListNote}. Mỗi sàn giữ màu riêng; không cộng chéo sàn.${sampleNote}`,
    ...await draw({
      data: { values: rankedValues },
      semantic_types: { dong: 'Category', san: 'Category', doanh_thu: 'Number' },
      field_display_names: { dong: ' ', san: 'Sàn', doanh_thu: 'Doanh thu trong mẫu (triệu đồng)' },
      chart_spec: { chartType: 'Bar Chart', encodings: { y: 'dong', x: 'doanh_thu', color: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: currentReader ? Math.max(160, ranked.length * 36) : Math.max(160, ranked.length * 30) } },
    } as FlintChartInput, () => barChart(order, plats.map(P => ({ name: LABEL[P], values: ranked.map(row => row.platform === P ? row.rev! / 1e6 : 0), color: COLOR[P] })), { stacked: true, fmt: revenueLabel }),
    keepOrder('dong', order)) });
  return out;
}

/**
 * The relative search-interest line (0-100), drawn on its own axis: never beside, summed with or scaled against sales.
 * Weeks without a number stay gaps; `flint: false` is the unit-test opt-out (hand-made SVG, recorded as svg-fallback).
 */
export async function renderSearchInterestChart(points: readonly { readonly label: string; readonly value: number | null }[], { flint = true }: { flint?: boolean } = {}): Promise<RenderedChart> {
  const labels = points.map(point => point.label), tick = Math.max(1, Math.ceil(points.length / 12));
  const fallback = (): string => lineChart(labels.map((label, i) => i % tick === 0 ? label : ''), [{ name: 'Chỉ số tương đối', color: '#1d4ed8', values: points.map(point => point.value) }]);
  if (!flint) return { svg: fallback(), engine: 'svg-fallback' };
  return renderChart({
    data: { values: points.map(point => ({ tuan: point.label, chi_so: point.value })) },
    semantic_types: { tuan: 'Category', chi_so: 'Number' },
    field_display_names: { tuan: 'Tuần', chi_so: 'Chỉ số tương đối (0–100)' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'tuan', y: 'chi_so' }, baseSize: { width: 560, height: 240 } },
  } as FlintChartInput, fallback, { patch: keepOrder('tuan', labels), legend: false });
}

export type CaptureCountChart = RenderedChart & { platform: MarketChartPlatform };

/**
 * One record-count bar per platform for a capture sample, drawn by Flint on a shared
 * 0..largest-count axis. Counts stay per platform and are never added together.
 * `flint: false` is the unit-test opt-out (hand-made SVG, recorded as svg-fallback).
 */
export async function renderCaptureCountCharts(samples: readonly { platform: MarketChartPlatform; count: number }[], { flint = true }: { flint?: boolean } = {}): Promise<CaptureCountChart[]> {
  const maximum = Math.max(1, ...samples.map(sample => sample.count));
  const sharedAxis = (spec: any): void => {
    const walk = (node: any): void => {
      if (!node || typeof node !== 'object') return;
      if (node.encoding?.x?.field === 'so_ban_ghi') node.encoding.x.scale = { ...node.encoding.x.scale, domain: [0, maximum] };
      for (const value of Object.values(node)) walk(value);
    };
    walk(spec);
  };
  return Promise.all(samples.map(async ({ platform, count }): Promise<CaptureCountChart> => {
    const fallback = (): string => barChart([LABEL[platform]], [{ name: LABEL[platform], values: [count], color: COLOR[platform] }], { fmt: v => String(Math.round(v)) });
    const drawn: RenderedChart = flint ? await renderChart({
      data: { values: [{ san: LABEL[platform], so_ban_ghi: count }] },
      semantic_types: { san: 'Category', so_ban_ghi: 'Number' },
      field_display_names: { san: ' ', so_ban_ghi: 'Số bản ghi trong mẫu' },
      chart_spec: { chartType: 'Bar Chart', encodings: { y: 'san', x: 'so_ban_ghi', color: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 480, height: 80 } },
    } as FlintChartInput, fallback, { palette: PALETTE, patch: sharedAxis, legend: false }) : { svg: fallback(), engine: 'svg-fallback' };
    return { platform, ...drawn };
  }));
}
