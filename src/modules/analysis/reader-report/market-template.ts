// Generic market "bản đọc": one template for any product profile, one or two
// marketplaces. Narrative reaches numbers only through the bundle; labels that
// carry digits (segment names, price bands, brand or shop names) are collected
// into extraOk so the number gate can tell them from measurements.
import type { ReaderPlatform, ReaderReportData } from './build.js';
import { Narrator } from './bundle.js';
import type { Row } from './classify.js';
import { renderChart, type FlintChartInput, type FlintPalette } from './flint.js';
import { esc, num, sp } from './format.js';
import { cover, hlNum, makeExhibits, n as numberCell, page, plat, platIcons, PLATFORM_LABEL, section, type CoverImage } from './layout.js';
import { FORBIDDEN_PROVIDER_NAMES } from './lint.js';
import { NO_BRAND, type Scope } from './scope-metrics.js';
import { barChart, lineChart, paretoChart } from './svg-charts.js';
import { CITATION_FORBIDDEN_NAMES, CitationRegistry, containsTechnicalId, displayCitationUrl } from '../citation-registry.js';
import { orderReportCitations, renderCitationMark, renderCitationRegister } from '../citation-register-html.js';
import { DISPLAY_ROUNDED_NOTE, WEB_FAMILY_LABEL, WEB_MONTHLY_METHOD, webMonthlyStats } from './web-facts.js';

export const MARKET_PRICE_BANDS: readonly (readonly [string, number, number])[] = [
  ['Dưới 100.000đ', 0, 1e5], ['100.000–199.999đ', 1e5, 2e5], ['200.000–299.999đ', 2e5, 3e5],
  ['300.000–499.999đ', 3e5, 5e5], ['500.000–999.999đ', 5e5, 1e6], ['Từ 1 triệu đồng', 1e6, Infinity],
];
const COL: Record<ReaderPlatform, string> = { shopee: '#c2410c', tiktok: '#1d2327' };
const PALETTE: FlintPalette = { san: { Shopee: COL.shopee, 'TikTok Shop': COL.tiktok } };
export const MARKET_TOC: readonly (readonly [string, string])[] = [
  ['M01', 'Kết luận chính'], ['M02', 'Phạm vi và phương pháp'], ['M03', 'Quy mô và diễn biến'], ['M04', 'Cơ cấu thị trường'],
  ['M05', 'Nhu cầu (tín hiệu bán)'], ['M06', 'Nguồn cung'], ['M07', 'Đối thủ'], ['M08', 'Giá và kinh tế đơn vị'],
  ['M09', 'Động lực và rủi ro'], ['M10', 'Dự báo và kịch bản'], ['M11', 'Cơ hội'], ['M12', 'Khuyến nghị và hành động'],
  ['M13', 'Nguồn, thuật ngữ và danh sách sản phẩm'],
];

export type MarketReportOptions = {
  /** Plain-Vietnamese limits carried over from the draft; the reader report must restate every one. */
  limitations: readonly string[];
  /** dd/mm/yyyy, shown in the footer only. */
  builtOn: string;
  cover?: CoverImage | null;
  /** false renders the hand-drawn SVG charts only (no chart engine load). */
  flint?: boolean;
  /** Web search results of the run, cited in the appendix with a link to each page. */
  webResults?: readonly ReaderWebResult[];
};
/** site and published are the page name and date as the search engine shows them; older runs have neither. */
export type ReaderWebResult = { position: number; title: string; url: string; snippet: string | null; retrievedAt: string; site?: string | null; published?: string | null };
export type BuiltMarketReport = {
  html: string; narrator: Narrator; extraOk: string[];
  charts: { id: string; engine: 'flint' | 'svg-fallback'; error?: string }[];
  /** The web results actually cited, with data-provider names masked. */
  webResults: ReaderWebResult[];
};

// A report never names a data provider, even inside a quotation: the name is
// masked, and a page hosted by a provider is not cited at all. Other wording in
// a quotation is the page's own and stays as written.
const PROVIDER_NAME = new RegExp(`\\b(?:${[...FORBIDDEN_PROVIDER_NAMES, 'SerpApi'].join('|')})\\b`, 'gi');
const mask = (s: string): string => s.replace(PROVIDER_NAME, '[…]');
function citableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !new RegExp(PROVIDER_NAME.source, 'i').test(url.hostname);
  } catch { return false; }
}
/** Results that can be cited: https pages not hosted by a provider, provider names masked, in search order. */
export function readerWebResults(values: readonly ReaderWebResult[], citations = false): ReaderWebResult[] {
  const citationProviders = new RegExp(CITATION_FORBIDDEN_NAMES.join('|'), 'gi');
  const safe = (text: string): string => citations ? mask(text).replace(citationProviders, '[.]') : mask(text);
  const safeOrNull = (text: string | null | undefined): string | null => text ? safe(text) : null;
  return values.filter(v => citableUrl(v.url) && (!citations ||
    (!new RegExp(citationProviders.source, 'i').test(displayCitationUrl(v.url)) && !containsTechnicalId(displayCitationUrl(v.url)))))
    .map(v => ({ position: v.position, title: safe(v.title), url: v.url, snippet: safeOrNull(v.snippet), retrievedAt: v.retrievedAt,
      site: safeOrNull(v.site), published: safeOrNull(v.published) }))
    .sort((a, b) => a.position - b.position);
}

const vd = (s: string): string => s.split('-').reverse().join('/');
const sum = (a: readonly Row[]): number => a.reduce((s, r) => s + r.rev, 0);
const t1 = (v: number): string => sp(v.toFixed(1));
const ps = (v: number): string => sp(v.toFixed(1)) + '%';

/** Builds the generic market reader report. The caller gates and stores it with publishReaderReport. */
export async function buildMarketReport(d: ReaderReportData, options: MarketReportOptions): Promise<BuiltMarketReport> {
  const { input, profile: prof, bundle: B, rows } = d;
  const PLATS = input.platforms;
  const S = d.scopes as Record<ReaderPlatform, Scope>;
  const two = PLATS.length === 2;
  const N = new Narrator(B);
  const WEB = d.webFacts;
  const webRegistry = input.contractVersion === '1.1.0' ? new CitationRegistry() : null;
  const metricSources = new Map<string, string>();
  const sampleCitation = (row?: Row): number | null => {
    if (webRegistry === null || input.rowLineage === undefined) return null;
    return webRegistry.cite({ sourceKind: 'METRIC_ROW', identity: input.rowLineage.sha256,
      locator: row === undefined ? null : { kind: 'xlsx', sheet: 'Sheet1', cell: `A${row.i + 2}:T${row.i + 2}` },
      label: row === undefined ? 'Số liệu đã tính từ nguồn đã lưu' : 'Dòng số liệu nguồn',
      retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
  };
  const sampleMark = (row?: Row): string => {
    if (webRegistry === null) return '';
    const no = sampleCitation(row);
    return no === null ? '<span class="no-source">Chưa có nguồn</span>' : renderCitationMark(no);
  };
  const metricCitation = (id: string): number | null => {
    id = metricSources.get(id) ?? id;
    if (webRegistry === null || id.startsWith('cite.')) return null;
    if (id.startsWith('web.') || id.startsWith('src.hl.')) {
      const group = id.startsWith('web.kpi.') || /^src\.hl\.(rev|listings|shops|units)$/.test(id) ? 'kpi'
        : id.startsWith('src.hl.') ? 'split'
        : /\.(m\.|peak$|low$|last3vsPrev3$)/.test(id) ? 'monthly'
        : /^web\.(shopee|tiktok)\.(rev|share)$/.test(id) ? 'split'
        : id.startsWith('web.top10.brand') ? 'top10brand' : id.startsWith('web.top10.shop') ? 'top10shop'
        : id.startsWith('web.shopType.') ? 'shoptype' : id.startsWith('web.loc.') ? 'location'
        : id.startsWith('web.cat.') ? 'category' : id.startsWith('web.price.') ? 'price'
        : id.startsWith('web.bst.') ? 'brandshoptype' : id.startsWith('web.top.product.') ? 'topproducts'
        : id.startsWith('web.top.shop.') ? 'topshops' : id.startsWith('web.top.brand.') ? 'topbrands' : 'scope';
      return citeWeb(group);
    }
    return sampleCitation();
  };
  const metricMark = (id: string): string => {
    if (webRegistry === null || id.startsWith('cite.')) return '';
    const no = metricCitation(id);
    return (no === null ? '<span class="no-source">Chưa có nguồn</span>' : renderCitationMark(no)) + roundedNote(id);
  };
  const roundedNote = (id: string): string => {
    id = metricSources.get(id) ?? id;
    if (WEB === null || WEB === undefined) return '';
    const parts = id.split('.');
    let cell: unknown;
    const kpi = { rev: WEB.kpi.revenue, units: WEB.kpi.units, listings: WEB.kpi.soldListings, shops: WEB.kpi.shops };
    if (parts[0] === 'web' && parts[1] === 'kpi') {
      const fact = kpi[parts[2] as keyof typeof kpi];
      cell = parts[3] === 'chg' ? fact?.changePct : fact?.current;
    } else if (parts[0] === 'src' && parts[1] === 'hl' && parts.length === 3) cell = kpi[parts[2] as keyof typeof kpi]?.current;
    else if (parts[1] === 'shopee' || parts[1] === 'tiktok' || (parts[0] === 'src' && parts[1] === 'hl' && parts.length === 4)) {
      const platform = parts[0] === 'src' ? parts[2] : parts[1];
      const split = WEB.platformSplit.find(row => row.platform === platform);
      const field = parts[0] === 'src' ? parts[3] : parts[2];
      if (field === 'rev') cell = split?.revenue;
      else if (field === 'share') cell = split?.share;
      else if (!('absent' in WEB.monthly)) {
        const months = WEB.monthly[platform as ReaderPlatform];
        if (field === 'm') cell = months?.[parts[3]!]?.revenue;
        else if (months !== undefined) {
          const stats = webMonthlyStats(months);
          const month = field === 'peak' ? stats.peak?.month : field === 'low' ? stats.low?.month : undefined;
          cell = month === undefined ? undefined : months[month]?.revenue;
          if (field === 'last3vsPrev3') cell = Object.keys(months).sort().slice(-6).map(month => months[month]?.revenue);
        }
      }
    } else if (parts[1] === 'top10') {
      const group = WEB.top10Share[parts[2] as 'brand' | 'shop'];
      if (group !== undefined && !('absent' in group)) cell = group.top10;
    } else if (parts[1] === 'shopType' && !('absent' in WEB.shopType)) cell = WEB.shopType.find(row => row.shopType === parts[2])?.share;
    else {
      const groups = { loc: WEB.location, cat: WEB.category, price: WEB.priceLevel, bst: WEB.brandByShopType,
        product: WEB.topProducts, shop: WEB.topShops, brand: WEB.topBrands };
      const top = parts[1] === 'top';
      const group = groups[(top ? parts[2] : parts[1]) as keyof typeof groups];
      const rowIndex = Number(parts[top ? 3 : 2]);
      const suffix = parts[top ? 4 : 3];
      const columns: Record<string, string> = { rev: 'revenue', chg: 'revenueChg', units: 'units', unitsChg: 'unitsChg', price: 'price',
        normal: 'revenueNormal', mall: 'revenueMall', rankNew: 'rankNew', rankOld: 'rankOld' };
      if (group !== undefined && Array.isArray(group)) cell = group[rowIndex]?.[parts[1] === 'loc' ? 'share' : columns[suffix ?? 'rev'] ?? 'revenue'];
    }
    const rounded = (value: unknown): boolean => typeof value === 'object' && value !== null &&
      'precision' in value && value.precision === 'display_rounded';
    return (Array.isArray(cell) ? cell.some(rounded) : rounded(cell)) ? `<small class="web-precision">${DISPLAY_ROUNDED_NOTE}</small>` : '';
  };
  const bf = (id: string, format?: string): string => B.f(id, format) + metricMark(id);
  const nar = (t: string, where: string): string => N.nar(webRegistry === null ? t : t.replace(/\{\{([\w.:-]+)\}\}/g, (placeholder, key: string) => {
    const id = key.split(':')[0]!;
    if (id.startsWith('cite.')) return placeholder;
    const no = metricCitation(id);
    if (no === null) return placeholder + '<span class="no-source">Chưa có nguồn</span>';
    B.set(`cite.metric.${no}`, no, 'int');
    return placeholder + `<sup class="cite">[{{cite.metric.${no}}}]</sup>` + roundedNote(id);
  }), where);
  const n = (value: unknown): string => numberCell(value) + (webRegistry !== null && /\d/.test(String(value)) && !String(value).includes('class="cite"') ? sampleMark() : '');
  const extraOk = new Set<string>(MARKET_PRICE_BANDS.map(b => b[0]));
  const L = (s: string): string => { if (/\d/.test(s)) extraOk.add(s); return esc(s); };
  const segName = (k: string): string => prof.segments[k] ?? k;
  const charts: BuiltMarketReport['charts'] = [];
  const chart = async (id: string, spec: FlintChartInput, fallback: () => string, patch?: (spec: any) => void): Promise<string> => {
    if (options.flint === false) { charts.push({ id, engine: 'svg-fallback' }); return fallback(); }
    const r = await renderChart(spec, fallback, { palette: PALETTE, ...(patch ? { patch } : {}) });
    charts.push({ id, engine: r.engine, ...(r.error ? { error: r.error } : {}) });
    return r.svg;
  };
  const keepOrder = (field: string, order: readonly string[]) => (spec: any): void => {
    const walk = (o: any): void => {
      if (!o || typeof o !== 'object') return;
      for (const ch of ['x', 'y']) if (o.encoding?.[ch]?.field === field) o.encoding[ch].sort = order;
      for (const v of Object.values(o)) walk(v);
    };
    walk(spec);
  };
  const bars = (id: string, cats: readonly string[], val: (P: ReaderPlatform, j: number) => number, valName: string, fmt: (v: number) => string, digits = 1) =>
    chart(id, {
      data: { values: cats.flatMap((c, j) => PLATS.map(P => ({ hang_muc: c, san: PLATFORM_LABEL[P]!, gia_tri: +val(P, j).toFixed(digits) }))) },
      semantic_types: { hang_muc: 'Category', san: 'Category', gia_tri: 'Number' },
      field_display_names: { hang_muc: ' ', san: 'Sàn', gia_tri: valName },
      chart_spec: { chartType: 'Grouped Bar Chart', encodings: { y: 'hang_muc', x: 'gia_tri', group: 'san' }, chartProperties: { showValueLabels: true }, baseSize: { width: 560, height: Math.max(220, cats.length * 34) } },
    } as FlintChartInput, () => barChart(cats, PLATS.map(P => ({ name: PLATFORM_LABEL[P]!, values: cats.map((_, j) => val(P, j)), color: COL[P] })), { fmt }), keepOrder('hang_muc', cats));

  // ---------- extra metrics: price bands, new listings, brands on both platforms ----------
  const src = input.source;
  if (src === undefined) throw new Error('bản đọc thiếu nguồn số liệu');
  const period = src.measurementPeriod, P0 = vd(period.start), P1 = vd(period.end);
  const priceBands = {} as Record<ReaderPlatform, { n: number; rev: number }[]>;
  for (const P of PLATS) {
    const sc = S[P];
    priceBands[P] = MARKET_PRICE_BANDS.map(([, lo, hi], j) => {
      const a = sc.core.filter(r => r.asp >= lo && r.asp < hi), rev = sum(a);
      B.set(`${P}.pb.${j}.share`, 100 * rev / sc.cr, 'pct'); B.set(`${P}.pb.${j}.n`, a.length, 'num');
      return { n: a.length, rev };
    });
    const known = sc.core.filter(r => typeof r.start === 'string' && r.start > '1971'), fresh = known.filter(r => r.start! >= period.start);
    B.set(`${P}.coh.known`, known.length, 'num'); B.set(`${P}.coh.n`, fresh.length, 'num');
    B.set(`${P}.coh.nShare`, known.length ? 100 * fresh.length / known.length : 0, 'pct0');
    B.set(`${P}.coh.rev`, sum(fresh), 'ty'); B.set(`${P}.coh.revShare`, 100 * sum(fresh) / sc.cr, 'pct0');
    B.set(`${P}.coh.nodate`, sc.core.length - known.length, 'num');
  }
  const named = (P: ReaderPlatform) => S[P].brands.filter(b => b.brand !== NO_BRAND);
  if (two) {
    const keys = (P: ReaderPlatform) => new Set(named(P).map(b => b.brand.toLowerCase()));
    const a = keys('shopee'), b = keys('tiktok');
    B.set('brand.bothCount', [...a].filter(k => b.has(k)).length, 'num');
  }
  const coreSegs = prof.core, allSegs = [...prof.core, ...prof.non];
  const topSeg = (P: ReaderPlatform): string => [...coreSegs].sort((x, y) => B.v(`${P}.seg.${y}.rev`) - B.v(`${P}.seg.${x}.rev`))[0]!;
  const topBand = (P: ReaderPlatform): number => priceBands[P].reduce((best, x, j, arr) => x.rev > arr[best]!.rev ? j : best, 0);
  const each = (f: (P: ReaderPlatform) => string, joiner = ', '): string => PLATS.map(f).join(joiner);
  const onP = (P: ReaderPlatform): string => `trên ${PLATFORM_LABEL[P]}`;

  const SRC = `Dữ liệu bán hàng ước tính trên ${PLATS.map(P => PLATFORM_LABEL[P]).join(' và ')}, ${P0} – ${P1}; ${
    webRegistry === null ? 'tính trên' : 'trong mẫu'} ${num(rows.length)} sản phẩm doanh thu cao nhất.`;
  const exhibits = makeExhibits(SRC);
  const fig: typeof exhibits.fig = (no, title, unit, svg, options = {}) => exhibits.fig(no, title, unit, svg,
    webRegistry === null || options.src !== undefined ? options : { ...options, src: SRC + sampleMark() });
  const tbl: typeof exhibits.tbl = (no, title, unit, head, tableRows, options = {}) => {
    if (webRegistry === null || options.src?.startsWith('Trang kết quả')) return exhibits.tbl(no, title, unit, head, tableRows, options);
    const citedRows = tableRows.map(row => row.map((cell, i) => i === 0 ? String(cell) + sampleMark() : cell));
    return exhibits.tbl(no, title, unit, head, citedRows, { ...options, src: (options.src ?? SRC) + sampleMark() });
  };
  const statusLabel = prof.status === 'approved' ? 'đã được chủ duyệt' : 'đề xuất, chờ chủ duyệt';
  const product = L(prof.product);

  // ---------- web snapshot exhibits (1.1.0 only; absent keeps 1.0.0 bytes identical) ----------
  const WEB_GROUP_LABELS: Record<string, string> = {
    scope: 'phạm vi tìm kiếm', kpi: 'số liệu tổng quan', split: 'số liệu theo sàn', monthly: 'số liệu theo tháng',
    category: 'số liệu theo ngành hàng', price: 'số liệu theo mức giá', top10brand: 'tỷ trọng top 10 thương hiệu',
    top10shop: 'tỷ trọng top 10 gian hàng', brandshoptype: 'số liệu thương hiệu theo loại gian hàng',
    shoptype: 'số liệu theo loại gian hàng', location: 'số liệu theo khu vực', topproducts: 'bảng sản phẩm dẫn đầu',
    topshops: 'bảng gian hàng dẫn đầu', topbrands: 'bảng thương hiệu dẫn đầu', detail: 'lịch sử chi tiết theo tháng',
  };
  const webCites = new Map<string, number>();
  const webSha = d.input.webSnapshotSha256;
  /** Cite one snapshot group once; sets cite.web.<group> for {{}} marks. */
  const citeWeb = (group: string): number | null => {
    if (WEB === null || WEB === undefined || webRegistry === null || webSha === undefined) return null;
    const known = webCites.get(group);
    if (known !== undefined) return known;
    const label = WEB_GROUP_LABELS[group] ?? group;
    const no = webRegistry.cite({
      sourceKind: 'CAPTURE', identity: webSha, locator: { kind: 'source-locator', value: label },
      label: `Trang kết quả tìm kiếm: ${label}`, retrievedAt: WEB.capturedAt,
      url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
    });
    if (no === null) return null;
    webCites.set(group, no);
    B.set(`cite.web.${group}`, no, 'int');
    return no;
  };
  /** Narrator-safe citation mark: {{}} is stripped before the digit check. */
  const citeRef = (group: string): string => (citeWeb(group) === null ? '' : ` <sup class="cite">[{{cite.web.${group}}}]</sup>`);
  /** Plain-HTML citation mark for table cells and captions. */
  const citeCell = (group: string): string => {
    const no = citeWeb(group);
    return no === null ? '' : renderCitationMark(no);
  };
  const has = (id: string): boolean => B.has(id);
  /** Web number through the {{key}} gate; '–' when the page had no value. */
  const wn = (id: string, where: string): string => (has(id) ? nar(`{{${id}}}`, where) : '-');
  const roundedIn = (...items: readonly ({ readonly precision: string } | null | undefined)[]): boolean =>
    items.some(x => x !== null && x !== undefined && x.precision === 'display_rounded');
  const vmonth = (m: string): string => {
    const label = `tháng ${m.slice(5).replace(/^0/, '')}/${m.slice(0, 4)}`;
    extraOk.add(label);
    return esc(label);
  };
  /** Wraps one web exhibit so lint can require the family label beside web numbers. */
  const webex = (inner: string, labels: string): string =>
    `<div class="webex" data-web-label="${esc(labels)}">${inner}</div>`;
  const WEB_SRC = `Trang kết quả tìm kiếm (${WEB_FAMILY_LABEL})`;
  const webMonthlyGroups = WEB !== null && WEB !== undefined && !('absent' in WEB.monthly) ? WEB.monthly : null;
  /** Months carrying at least one page revenue value. */
  const observedMonths: string[] = webMonthlyGroups !== null
    ? [...new Set(Object.values(webMonthlyGroups).flatMap(m =>
      Object.keys(m ?? {}).filter(month => {
        const months = (m ?? {}) as Record<string, { revenue: { value: number | null } }>;
        const value = months[month]?.revenue.value;
        return value !== null && value !== undefined && Number.isFinite(value);
      })))].sort()
    : [];
  const webMonths: string[] = [];
  if (observedMonths.length > 0 && webMonthlyGroups !== null) {
    const allMonths = Object.values(webMonthlyGroups).flatMap(months => Object.keys(months ?? {})).sort();
    const first = allMonths[0]!, last = allMonths.at(-1)!;
    for (let year = Number(first.slice(0, 4)), month = Number(first.slice(5));
      `${year}-${String(month).padStart(2, '0')}` <= last;
      month === 12 ? (month = 1, year++) : month++) {
      webMonths.push(`${year}-${String(month).padStart(2, '0')}`);
    }
  }
  const webHasMonthly = observedMonths.length > 0;

  // ---------- cover and opening ----------
  const platNames = PLATS.map(P => PLATFORM_LABEL[P]).join(' và ');
  const coverHtml = cover(options.cover ?? null, `Dữ liệu ${P0} – ${P1} · ${platNames}`, ['Báo cáo thị trường sản phẩm', prof.product, 'Bản đọc cho chủ dự án']);
  const limits = options.limitations.length ? `<div class="box"><h3>Giới hạn của bản này</h3><ul>${options.limitations.map(s => `<li>${esc(s)}</li>`).join('')}</ul><p class="ex-note">Các giới hạn trên được chép lại từ bản nháp phân tích; bản đọc không bỏ bớt giới hạn nào.</p></div>` : '';
  const intro = `<div class="box"><h3>Mục tiêu báo cáo</h3><p>Báo cáo mô tả thị trường ${product} bán ${each(onP, ' và ')} trong kỳ số liệu: bán gì, ai bán, giá bao nhiêu${two ? ', và hai sàn khác nhau ở đâu' : ''}. Mục đích là cho chủ dự án một bức tranh dựa trên số liệu để chốt câu hỏi kinh doanh và nhóm đối thủ.</p>
<h3>Lưu ý khi đọc</h3><ol class="notes">
<li>Doanh thu, đơn vị bán là <b>số ước tính</b>. Mọi % là tỷ trọng trong mẫu, không phải thị phần.</li>
${two ? '<li><b>Mỗi sàn tính riêng.</b> Chỉ cộng hai sàn khi ghi rõ “hai sàn”.</li>' : ''}
<li>"Lõi" là các nhóm sản phẩm chính của ngành; phân nhóm theo tiêu đề, ${statusLabel} (Phần 2).</li>
<li>Giá trung bình = doanh thu ÷ đơn vị bán, đã gộp biến thể và khuyến mãi, không phải giá niêm yết.</li>
<li>Bảng gian hàng/thương hiệu sắp theo doanh thu quan sát, <b>không phải xếp hạng năng lực</b>.</li></ol></div>${limits}`;
  const kpi = (v: string, l: string): string => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`;
  const secs: string[] = [];

  // ---------- Phần 1 ----------
  const nonShare = two ? '{{both.non.share}}' : `{{${PLATS[0]}.non.share}}`;
  const m01WebKey = WEB !== null && WEB !== undefined && has('web.kpi.rev')
    ? `<li>${hlNum(nar(`<b>Toàn kết quả tìm kiếm.</b> Cả trang đạt {{web.kpi.rev}}${has('web.kpi.rev.chg') ? ' ({{web.kpi.rev.chg}} so với kỳ liền kề)' : ''}${citeRef('kpi')}.`, 'M01.web'))} <small>→ Bảng 3.2</small></li>`
    : '';
  const m01Trend = webHasMonthly
    ? `<li>Diễn biến theo tháng của ${WEB_FAMILY_LABEL}: có số theo tháng, xem Hình 3.2.</li>`
    : '<li>Thị trường đang tăng hay giảm, có mùa vụ không: chưa có số theo tháng.</li>';
  secs.push(section('M01', 'Kết luận chính',
    hlNum(nar(`Trong mẫu {{src.rows}} sản phẩm, phần lõi đạt ${each(P => `{{${P}.core.rev}} ${onP(P)}`, ' và ')} trong kỳ số liệu. Số liệu là một tổng cả kỳ, chưa có số theo tháng.`, 'M01.ans')),
    `<div class="grid4">${PLATS.map(P => kpi(bf(`${P}.core.rev`), `Doanh thu lõi ${PLATFORM_LABEL[P]}`)).join('')}${kpi(each(P => bf(`${P}.core.shops`), ' · '), `Gian hàng có doanh thu lõi (${platNames})`)}${kpi(each(P => bf(`${P}.core.asp`, 'dong'), ' · '), `Giá trung bình mỗi đơn vị (${platNames})`)}</div>
<h3>Điểm chính</h3><ol class="keys">
<li>${hlNum(nar(`<b>Mẫu có lẫn hàng ngoài lõi.</b> ${nonShare} doanh thu trong tệp là hàng ngoài lõi (phụ kiện, hàng khác). Mọi số trong báo cáo chỉ tính phần lõi.`, 'M01.k1'))} <small>→ Hình 3.1</small></li>
<li>${hlNum(PLATS.map(P => { const k = topSeg(P); return `${nar(`<b>${PLATFORM_LABEL[P]}:</b> nhóm lớn nhất chiếm {{${P}.seg.${k}.revShare}} doanh thu lõi`, `M01.k2.${P}`)} (${L(segName(k))}).`; }).join(' '))} <small>→ Hình 4.1</small></li>
<li>${hlNum(nar(`<b>Mức tập trung theo gian hàng.</b> ${each(P => `Gian hàng lớn nhất ${onP(P)} giữ {{${P}.conc.1}}, top 10 giữ {{${P}.conc.10}} doanh thu lõi`, '. ')}.`, 'M01.k3'))} <small>→ Hình 4.2</small></li>
<li>${hlNum(PLATS.map(P => { const j = topBand(P); return `${nar(`<b>Giá ${onP(P)}:</b> khoảng giá mang nhiều doanh thu nhất chiếm {{${P}.pb.${j}.share}} doanh thu lõi`, `M01.k4.${P}`)} (${L(MARKET_PRICE_BANDS[j]![0])}).`; }).join(' '))} <small>→ Hình 8.1</small></li>
<li>${hlNum(nar(`<b>Sản phẩm mới mở bán trong kỳ.</b> ${each(P => `{{${P}.coh.revShare}} doanh thu lõi ${onP(P)}`, '; ')}.`, 'M01.k5'))} <small>→ Bảng 6.2</small></li>${m01WebKey}</ol>
<p>${nar('<b>Đề xuất:</b> các phương án ở Phần 12 là đề xuất của TDN, chờ chủ duyệt. Việc làm ngay là viết câu hỏi kinh doanh và duyệt phân loại.', 'M01.rec')}</p>
<div class="box"><h3>Báo cáo này chưa trả lời được</h3><ul>
${m01Trend}
<li>Khách khen, chê gì: chưa có ý kiến khách hàng trong bản này.</li>
<li>Lãi gộp: chưa có giá vốn, phí sàn, chi phí vận chuyển.</li></ul>
<p class="ex-note">${nar(`Tệp chỉ gồm {{src.rows}} sản phẩm doanh thu cao nhất (giới hạn {{src.rowCap}} dòng); ${each(P => `phủ {{src.${P}.cover}} doanh thu ${PLATFORM_LABEL[P]}`)} của toàn bộ kết quả tìm kiếm.`, 'M01.box')}</p></div>`,
    'Số ước tính; % là tỷ trọng trong mẫu của từng sàn. Phân nhóm ' + statusLabel + ' (Phần 2).'));

  // ---------- Phần 2 ----------
  const reconciliationItems = d.webReconciliation.map(w => {
    const amount = (field: string, source?: string): string => {
      const id = `reconcile.${w.check}.${field}`;
      B.set(id, w.numbers[field]!, 'grouped');
      if (source !== undefined) metricSources.set(id, source);
      return `{{${id}}}`;
    };
    let template: string;
    switch (w.check) {
      case 'R1': template = `Doanh thu tệp mẫu vượt doanh thu ${WEB_FAMILY_LABEL}: mẫu ${amount('sampleRev')}, trang ${amount('webRev', 'web.kpi.rev')}.`; break;
      case 'R2': template = `Đơn vị bán tệp mẫu vượt đơn vị bán ${WEB_FAMILY_LABEL}: mẫu ${amount('sampleUnits')}, trang ${amount('webUnits', 'web.kpi.units')}.`; break;
      case 'R3': template = `Số sản phẩm tệp mẫu vượt số sản phẩm có lượt bán ${WEB_FAMILY_LABEL}: mẫu ${amount('sampleRows')}, trang ${amount('webListings', 'web.kpi.listings')}.`; break;
      case 'R4': template = `Doanh thu mẫu theo sàn vượt doanh thu ${WEB_FAMILY_LABEL} của sàn: ` +
        Object.keys(w.numbers).filter(key => !key.startsWith('web.')).sort().map(P =>
          `${PLATFORM_LABEL[P]}, mẫu ${amount(P)}, trang ${amount(`web.${P}`, `web.${P}.rev`)}`).join('; ') + '.'; break;
    }
    return `<li>${nar(template, `M02.reconcile.${w.check}`)}</li>`;
  }).join('');
  const ruleRows = prof.rules.map((r, k) => [k + 1, L(segName(r.seg)), esc(r.why ?? ''), n(num(d.ruleHits[k] ?? 0))]);
  const m02Web = WEB !== null && WEB !== undefined
    ? webex(
      `${tbl('2.3', `Phạm vi tìm kiếm trên trang (${WEB_FAMILY_LABEL})`, '', ['Hạng mục', 'Giá trị'], [
        ['Từ khóa', L(WEB.scope.keywords.join('; '))],
        ['Sàn', WEB.scope.platforms.map(p => PLATFORM_LABEL[p] ?? p).join(', ')],
        ['Kỳ số liệu', `${vd(WEB.scope.period.startDate)} – ${vd(WEB.scope.period.endDate)}`],
        ['Ngành hàng', WEB.scope.category === null ? '–' : L(WEB.scope.category)],
        ['Điều kiện áp dụng', WEB.scope.ticks.length ? L(WEB.scope.ticks.join('; ')) : '–'],
        ['Bộ lọc nâng cao', WEB.scope.advancedFilters.length
          ? L(WEB.scope.advancedFilters.map(f => `${f.label}: ${f.displayed}`).join('; '))
          : '–'],
        ['Loại trừ', WEB.scope.exclusions.length ? L(WEB.scope.exclusions.join('; ')) : '–'],
      ], { src: `${WEB_SRC}${citeCell('scope')}` })}
<p>${hlNum(nar(`Tệp trong mẫu {{src.rows}} sản phẩm phủ {{src.cover.listings}} số sản phẩm và {{src.cover.rev}} doanh thu ${WEB_FAMILY_LABEL}; mỗi sàn tính riêng, đây là tỷ lệ duy nhất so hai họ số.${citeRef('kpi')}`, 'M02.webcover'))}</p>
<p class="ex-note">Cách tính các mốc tháng: ${esc(WEB_MONTHLY_METHOD)}.</p>
${d.webReconciliation.length
    ? `<div class="box"><h3>Đối chiếu tệp mẫu với trang</h3><ul>${reconciliationItems}</ul></div>`
    : '<p class="ex-note">Đối chiếu tệp mẫu với trang: khớp, không chênh lệch.</p>'}`,
      [...WEB.scope.keywords, ...WEB.scope.ticks, ...WEB.scope.exclusions,
        ...WEB.scope.advancedFilters.map(f => `${f.label}: ${f.displayed}`),
        ...(WEB.scope.category === null ? [] : [WEB.scope.category])].join(' | '))
    : '';
  secs.push(section('M02', 'Phạm vi và phương pháp',
    hlNum(nar(`Một nguồn bán hàng (số ước tính), một tổng cả kỳ, {{src.rows}} sản phẩm; phân nhóm lõi/ngoài lõi theo luật đọc tiêu đề, ${statusLabel}.`, 'M02.ans')),
    `<h3>Quy trình xử lý 4 bước</h3><ol class="steps">
<li>${nar(`<b>Thu dữ liệu.</b> Lấy {{src.rows}} sản phẩm doanh thu cao nhất của kết quả tìm kiếm (${each(P => `${PLATFORM_LABEL[P]} {{src.${P}.rows}}`)}).`, 'M02.s1')}</li>
<li><b>Lọc hàng không đúng ngành.</b> Tách phụ kiện và hàng khác khỏi phần lõi.</li>
<li><b>Phân nhóm.</b> Mỗi sản phẩm vào nhóm của luật đầu tiên khớp tiêu đề (Bảng 2.2). Không dùng danh mục của sàn vì người bán tự chọn danh mục.</li>
<li><b>Tính chỉ số.</b> Doanh thu, đơn vị bán, tỷ trọng, giá trung bình, mức tập trung theo gian hàng – tính riêng từng sàn.</li></ol>
${tbl('2.1', 'Phạm vi dữ liệu theo sàn', '', ['Hạng mục', ...PLATS.map(P => PLATFORM_LABEL[P]!)], [
    ['Kỳ số liệu', ...PLATS.map(() => `${P0} – ${P1}`)],
    ['Sản phẩm trong tệp', ...PLATS.map(P => n(bf(`${P}.all.n`)))],
    ['Gian hàng trong tệp', ...PLATS.map(P => n(bf(`${P}.all.shops`)))],
    ['Doanh thu trong tệp (đồng)', ...PLATS.map(P => n(num(B.v(`${P}.all.rev`))))],
    ['Doanh thu toàn kết quả tìm kiếm, theo màn hình nguồn (làm tròn)', ...PLATS.map(P => n(bf(`src.hl.${P}.rev`)))],
    ['Tệp phủ bao nhiêu doanh thu', ...PLATS.map(P => n(bf(`src.${P}.cover`)))],
    ['Sản phẩm lõi / ngoài lõi', ...PLATS.map(P => n(`${bf(`${P}.core.n`)} / ${bf(`${P}.non.n`)}`))]],
    { note: nar('Màn hình nguồn ghi {{src.hl.rev}} cho {{src.hl.listings}} sản phẩm có lượt bán; tệp chỉ lấy {{src.rows}} sản phẩm đầu (khoảng {{src.cover.listings}} số sản phẩm).', 'T2.1') })}
${tbl('2.2', `Quy tắc phân loại (${statusLabel})`, 'số sản phẩm', ['Thứ tự', 'Gán vào nhóm', 'Khi nào', n('Số sản phẩm')], ruleRows,
     { note: 'Luật chạy từ trên xuống; sản phẩm khớp luật nào trước thì vào nhóm đó.', src: 'TDN.' })}${m02Web}`,
    'Phân nhóm bằng luật đọc tiêu đề, không phải nhãn của sàn; vẫn có thể sai lẻ. Danh sách đủ ở Phụ lục để tra lại.'));

  // ---------- Phần 3 ----------
  const webMonthlySeries = webMonthlyGroups !== null
    ? Object.keys(webMonthlyGroups).sort().map(platform => ({
      platform,
      points: webMonths.flatMap(month => {
        const perPlatform = webMonthlyGroups[platform as ReaderPlatform];
        const point = perPlatform === undefined ? undefined : perPlatform[month];
        const value = point?.revenue.value;
        return value === null || value === undefined || !Number.isFinite(value) ? [] : [{ month, value }];
      }),
    })).filter(s => s.points.length > 0)
    : [];
  const m03WebChart = webHasMonthly && webMonthlySeries.length > 0
    ? fig('3.2', `Doanh thu theo tháng, từng sàn (${WEB_FAMILY_LABEL})`, 'tỷ đồng', await chart('m03-web-monthly', {
      data: { values: webMonthlySeries.flatMap(s => webMonths.map(month => {
        const value = s.points.find(p => p.month === month)?.value;
        return { thang: month, san: PLATFORM_LABEL[s.platform] ?? s.platform,
          doanh_thu: value === undefined ? null : +(value / 1e9).toFixed(3) };
      })) },
      semantic_types: { thang: 'Category', san: 'Category', doanh_thu: 'Number' },
      field_display_names: { thang: 'Tháng', san: 'Sàn', doanh_thu: 'Doanh thu (tỷ đồng)' },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'thang', y: 'doanh_thu', color: 'san' } },
    } as FlintChartInput, () => lineChart(webMonths,
      webMonthlySeries.map(s => ({
        name: PLATFORM_LABEL[s.platform] ?? s.platform,
        values: webMonths.map(m => {
          const value = s.points.find(p => p.month === m)?.value;
          return value === undefined ? null : value / 1e9;
        }),
        color: COL[s.platform as ReaderPlatform],
      }))), spec => {
        keepOrder('thang', webMonths)(spec);
        const gaps = (node: any): void => {
          if (!node || typeof node !== 'object') return;
          if (node.mark === 'line') node.mark = { type: 'line', invalid: 'break-paths-show-domains' };
          else if (node.mark?.type === 'line') node.mark.invalid = 'break-paths-show-domains';
          for (const value of Object.values(node)) gaps(value);
        };
        gaps(spec);
      }),
    {
      note: webMonthlySeries.map(s => {
        if (webMonthlyGroups === null) return '';
        const months = webMonthlyGroups[s.platform as ReaderPlatform];
        if (months === undefined) return '';
        const stats = webMonthlyStats(months);
        const peak = stats.peak === null ? '' : `cao nhất ${vmonth(stats.peak.month)} (${n(bf(`web.${s.platform}.peak`))})`;
        const low = stats.low === null ? '' : `thấp nhất ${vmonth(stats.low.month)} (${n(bf(`web.${s.platform}.low`))})`;
        const drift = stats.last3vsPrev3 === null ? '' : `; 3 tháng cuối so 3 tháng trước đó ${n(bf(`web.${s.platform}.last3vsPrev3`))}`;
        return `<b>${esc(PLATFORM_LABEL[s.platform] ?? s.platform)}:</b> ${peak}, ${low}${drift}`;
      }).filter(Boolean).join('<br>') + (citeCell('monthly') ? `<br>Chú thích mang số tham chiếu${citeCell('monthly')}` : ''),
      src: `${WEB_SRC}${citeCell('monthly')}`,
    })
    : '';
  const m03Kpi = WEB !== null && WEB !== undefined && has('web.kpi.rev')
    ? webex(
      `${tbl('3.2', `Số liệu tổng quan (${WEB_FAMILY_LABEL})`, '', ['Chỉ số', `Giá trị ${WEB_FAMILY_LABEL}`, 'So với kỳ liền kề'], [
        ['Doanh thu', n(wn('web.kpi.rev', 'T3.2')), n(wn('web.kpi.rev.chg', 'T3.2'))],
        ['Đơn vị bán', n(wn('web.kpi.units', 'T3.2')), n(wn('web.kpi.units.chg', 'T3.2'))],
        ['Sản phẩm có lượt bán', n(wn('web.kpi.listings', 'T3.2')), n(wn('web.kpi.listings.chg', 'T3.2'))],
        ['Gian hàng có lượt bán', n(wn('web.kpi.shops', 'T3.2')), n(wn('web.kpi.shops.chg', 'T3.2'))],
        ...[...WEB.platformSplit].sort((a, b) => (a.platform < b.platform ? -1 : 1)).flatMap(e => [
          [`Doanh thu ${PLATFORM_LABEL[e.platform] ?? e.platform}`, n(wn(`web.${e.platform}.rev`, 'T3.2')), ''],
          [`Tỷ trọng ${PLATFORM_LABEL[e.platform] ?? e.platform}`, n(wn(`web.${e.platform}.share`, 'T3.2')), ''],
        ]),
      ], {
        ...(roundedIn(WEB.kpi.revenue.current, WEB.kpi.revenue.changePct, WEB.kpi.units.current,
          WEB.kpi.units.changePct, WEB.kpi.soldListings.current, WEB.kpi.soldListings.changePct,
          WEB.kpi.shops.current, WEB.kpi.shops.changePct,
          ...WEB.platformSplit.flatMap(e => [e.revenue, e.share]))
          ? { note: `Các số ${DISPLAY_ROUNDED_NOTE}.` } : {}),
        src: `${WEB_SRC}${citeCell('kpi')}${citeCell('split')}`,
      })}`,
      ['doanh thu', 'lượt bán', 'sản phẩm có lượt bán', 'gian hàng', ...WEB.platformSplit.map(e => e.platform)].join(' | '))
    : '';
  secs.push(section('M03', 'Quy mô và diễn biến',
    webHasMonthly
      ? hlNum(nar(`Lõi đạt ${each(P => `{{${P}.core.rev}} ${onP(P)}`, ' và ')}; diễn biến theo tháng của ${WEB_FAMILY_LABEL}${citeRef('monthly')}.`, 'M03.ans')) + ' <small>→ Hình 3.2</small>'
      : hlNum(nar(`Lõi đạt ${each(P => `{{${P}.core.rev}} ${onP(P)}`, ' và ')}; chưa có số theo tháng nên chưa biết xu hướng.`, 'M03.ans')),
    tbl('3.1', 'Số liệu cơ bản theo sàn', '', ['Chỉ số', ...PLATS.map(P => PLATFORM_LABEL[P]!)], [
      ['Doanh thu toàn mẫu', ...PLATS.map(P => n(bf(`${P}.all.rev`)))],
      ['Doanh thu lõi', ...PLATS.map(P => n(bf(`${P}.core.rev`)))],
      ['Đơn vị bán lõi', ...PLATS.map(P => n(bf(`${P}.core.units`)))],
      ['Sản phẩm lõi', ...PLATS.map(P => n(bf(`${P}.core.n`)))],
      ['Gian hàng có doanh thu lõi', ...PLATS.map(P => n(bf(`${P}.core.shops`)))],
      ['Giá trung bình lõi (đồng)', ...PLATS.map(P => n(bf(`${P}.core.asp`)))],
      ['Doanh thu ngoài lõi (tỷ trọng)', ...PLATS.map(P => n(`${bf(`${P}.non.rev`)} (${bf(`${P}.non.share`)})`))]]) +
    fig('3.1', 'Doanh thu theo nhóm, từng sàn', 'tỷ đồng', await bars('m03-segs', allSegs.map(segName), (P, j) => B.v(`${P}.seg.${allSegs[j]}.rev`) / 1e9, 'Doanh thu (tỷ đồng)', t1, 2),
       { fact: nar(`Hàng ngoài lõi chiếm ${each(P => `{{${P}.non.share}} doanh thu ${PLATFORM_LABEL[P]}`)}.`, 'F3.1') }) +
    m03Kpi + m03WebChart,
    webHasMonthly
      ? `Diễn biến theo tháng là số ${WEB_FAMILY_LABEL} (Hình 3.2); số trong mẫu không có chuỗi theo tháng. Số “${WEB_FAMILY_LABEL}” là số làm tròn trên màn hình nguồn, chỉ dùng để đo độ phủ.`
      : 'Không có chuỗi theo ngày/tháng; Phần 3 chỉ có quy mô, không có diễn biến. Số “toàn kết quả tìm kiếm” là số làm tròn trên màn hình nguồn, chỉ dùng để đo độ phủ.'));

  // ---------- Phần 4 ----------
  const cum = (P: ReaderPlatform): number[] => { let a = 0; return S[P].shops.map(s => (a += s.rev, 100 * a / S[P].cr)); };
  const wtext = (cell: unknown): string => {
    if (typeof cell === 'object' && cell !== null && 'text' in cell) return L(String((cell as { text: unknown }).text));
    return '–';
  };
  const wrounded = (cell: unknown): boolean =>
    typeof cell === 'object' && cell !== null && 'precision' in cell &&
    (cell as { precision: unknown }).precision === 'display_rounded';
  const m04Cat = WEB !== null && WEB !== undefined && !('absent' in WEB.category)
    ? webex(tbl('4.2', `Ngành hàng trên trang (${WEB_FAMILY_LABEL})`, 'doanh thu: tỷ đồng',
      ['Ngành hàng', 'Cấp', 'Sàn', 'Doanh thu'],
      WEB.category.map((row, i) => [wtext(row['category']), wtext(row['level']), wtext(row['platform']), n(wn(`web.cat.${i}.rev`, 'T4.2'))]),
      {
        ...(WEB.category.some(r => wrounded(r['revenue'])) ? { note: `Doanh thu ${DISPLAY_ROUNDED_NOTE}.` } : {}),
        src: `${WEB_SRC}${citeCell('category')}`,
      }),
    WEB.category.flatMap(r => [r['category'], r['level'], r['platform']]
      .filter(c => typeof c === 'object' && c !== null && 'text' in c)
      .map(c => String((c as { text: unknown }).text))).join(' | '))
    : '';
  const m04ShopType = WEB !== null && WEB !== undefined && !('absent' in WEB.shopType)
    ? webex(tbl('4.3', `Loại gian hàng trên trang (${WEB_FAMILY_LABEL})`, '', ['Loại gian hàng', 'Tỷ trọng'],
      WEB.shopType.map(e => [L(e.share.label),
        n(e.shopType === 'mall' ? wn('web.shopType.mall', 'T4.3') : wn('web.shopType.normal', 'T4.3'))]),
      {
        ...(WEB.shopType.some(e => e.share.precision === 'display_rounded') ? { note: `Tỷ trọng ${DISPLAY_ROUNDED_NOTE}.` } : {}),
        src: `${WEB_SRC}${citeCell('shoptype')}`,
      }),
    WEB.shopType.map(e => e.share.label).join(' | '))
    : '';
  const m04Loc = WEB !== null && WEB !== undefined && !('absent' in WEB.location)
    ? webex(tbl('4.4', `Khu vực kho hàng trên trang (${WEB_FAMILY_LABEL})`, '', ['Khu vực', 'Tỷ trọng'],
      WEB.location.map((row, i) => [wtext(row['location']), n(wn(`web.loc.${i}`, 'T4.4'))]),
      {
        ...(WEB.location.some(r => wrounded(r['share'])) ? { note: `Tỷ trọng ${DISPLAY_ROUNDED_NOTE}.` } : {}),
        src: `${WEB_SRC}${citeCell('location')}`,
      }),
    WEB.location.flatMap(r => {
      const c = r['location'];
      return typeof c === 'object' && c !== null && 'text' in c ? [String((c as { text: unknown }).text)] : [];
    }).join(' | '))
    : '';
  const segTbl = PLATS.flatMap(P => coreSegs.map(k => [plat(P), L(segName(k)), n(bf(`${P}.seg.${k}.n`)), n(bf(`${P}.seg.${k}.shops`)), n(bf(`${P}.seg.${k}.rev`, 'tynum')), n(bf(`${P}.seg.${k}.revShare`)), n(bf(`${P}.seg.${k}.unitShare`)), n(B.has(`${P}.seg.${k}.asp`) ? bf(`${P}.seg.${k}.asp`) : '–')]));
  const pareto = await chart('m04-pareto', {
    data: { values: PLATS.flatMap(P => cum(P).map((y, i) => ({ hang: i + 1, san: PLATFORM_LABEL[P]!, luy_ke: +y.toFixed(1) }))) },
    semantic_types: { hang: 'Rank', san: 'Category', luy_ke: 'Number' },
    field_display_names: { hang: 'Số gian hàng (theo doanh thu lõi giảm dần)', san: 'Sàn', luy_ke: '% doanh thu lõi cộng dồn' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'hang', y: 'luy_ke', color: 'san' } },
  } as FlintChartInput, () => paretoChart(PLATS.map(P => ({ name: PLATFORM_LABEL[P]!, ys: cum(P), color: COL[P] }))));
  secs.push(section('M04', 'Cơ cấu thị trường',
    hlNum(PLATS.map(P => { const k = topSeg(P); return `${nar(`Nhóm dẫn ${onP(P)} chiếm {{${P}.seg.${k}.revShare}} doanh thu lõi`, `M04.ans.${P}`)} (${L(segName(k))}).`; }).join(' ')),
    fig('4.1', 'Tỷ trọng doanh thu lõi theo nhóm, từng sàn', '% doanh thu lõi của sàn', await bars('m04-share', coreSegs.map(segName), (P, j) => B.v(`${P}.seg.${coreSegs[j]}.revShare`), 'Tỷ trọng doanh thu lõi (%)', ps)) +
    tbl('4.1', 'Số liệu theo nhóm lõi, từng sàn', 'doanh thu: tỷ đồng; giá: đồng', ['Sàn', 'Nhóm', n('Sản phẩm'), n('Gian hàng'), n('Doanh thu'), n('Tỷ trọng doanh thu'), n('Tỷ trọng đơn vị bán'), n('Giá trung bình')], segTbl) +
    fig('4.2', 'Mức tập trung doanh thu lõi theo gian hàng', '% doanh thu lõi cộng dồn', pareto,
       { fact: nar(`Top 3 gian hàng giữ ${each(P => `{{${P}.conc.3}} ${onP(P)}`)}; top 20 giữ ${each(P => `{{${P}.conc.20}} ${onP(P)}`)}.`, 'F4.2') }) +
    m04Cat + m04ShopType + m04Loc,
    'Tỷ trọng tính trong mẫu từng sàn, không phải thị phần. Gian hàng nhận diện theo đường dẫn gian hàng; một chủ có thể có nhiều gian hàng.'));

  // ---------- Phần 5 ----------
  const sigLabels = prof.signals.map(([label]) => L(label));
  secs.push(section('M05', 'Nhu cầu (tín hiệu bán)',
    prof.signals.length ? 'Phần này đọc tín hiệu từ tiêu đề của sản phẩm đang bán được: người bán ghi gì, sản phẩm ghi như vậy bán được bao nhiêu.' : 'Hồ sơ phân loại chưa khai báo tín hiệu tiêu đề nên phần này để trống.',
    prof.signals.length ? `<p class="lead">Nguồn không đo nhu cầu trực tiếp.</p>` +
      fig('5.1', 'Doanh thu lõi của sản phẩm có từng tín hiệu trong tiêu đề', '% doanh thu lõi của sàn', await bars('m05-signals', prof.signals.map(s => s[0]), (P, j) => B.v(`${P}.sig.${j}.revShare`), 'Tỷ trọng doanh thu lõi (%)', v => v.toFixed(0) + '%', 0),
        { note: 'Một sản phẩm có thể có nhiều tín hiệu nên các cột không cộng thành 100%.' }) +
      tbl('5.1', 'Tín hiệu tiêu đề theo sàn', '% doanh thu lõi của sàn', ['Tín hiệu', ...PLATS.map(P => n(PLATFORM_LABEL[P]!))], prof.signals.map((_, j) => [sigLabels[j], ...PLATS.map(P => n(bf(`${P}.sig.${j}.revShare`)))]))
      : '',
    'Tín hiệu tiêu đề cho biết người bán nhấn điều gì, không chứng minh khách mua vì điều đó.'));

  // ---------- Phần 6 ----------
  const brandRows = Array.from({ length: Math.max(...PLATS.map(P => Math.min(10, named(P).length))) }, (_, j) =>
    [j + 1, ...PLATS.flatMap(P => { const b = named(P)[j]; return b ? [L(b.brand), n(t1(b.rev / 1e9)), n(b.shops)] : ['', '', '']; })]);
  const coh = PLATS.map(P => [plat(P), n(bf(`${P}.coh.known`)), n(bf(`${P}.coh.n`)), n(bf(`${P}.coh.nShare`)), n(bf(`${P}.coh.rev`)), n(bf(`${P}.coh.revShare`))]);
  const m06Web = WEB !== null && WEB !== undefined && !('absent' in WEB.top10Share.shop)
    ? webex(tbl('6.3', `Top 10 gian hàng giữ bao nhiêu (${WEB_FAMILY_LABEL})`, '', ['Chỉ số', ...PLATS.map(P => `Trong mẫu ${PLATFORM_LABEL[P]}`), WEB_FAMILY_LABEL], [
      ['Top 10 gian hàng giữ (% doanh thu)', ...PLATS.map(P => n(bf(`${P}.conc.10`))), n(wn('web.top10.shop', 'T6.3'))],
    ], {
      ...(WEB.top10Share.shop.top10.precision === 'display_rounded' ? { note: `Tỷ trọng ${DISPLAY_ROUNDED_NOTE}.` } : {}),
      src: `${WEB_SRC}${citeCell('top10shop')}`,
    }), 'top 10 gian hàng')
    : '';
  secs.push(section('M06', 'Nguồn cung',
    hlNum(nar(`Hàng không ghi thương hiệu chiếm ${each(P => `{{${P}.brand.none.share}} doanh thu lõi ${PLATFORM_LABEL[P]}`)}; top 5 thương hiệu giữ ${each(P => `{{${P}.brand.top5share}} ${onP(P)}`)}.${two ? ' {{brand.bothCount}} thương hiệu bán trên cả hai sàn.' : ''}`, 'M06.ans')),
    tbl('6.1', 'Top 10 thương hiệu theo doanh thu lõi, từng sàn', 'doanh thu: tỷ đồng', ['#', ...PLATS.flatMap(P => [PLATFORM_LABEL[P]!, n('Doanh thu'), n('Gian hàng')])], brandRows,
      { note: 'Không tính sản phẩm không ghi thương hiệu. Tên thương hiệu theo cột thương hiệu của nguồn.' }) +
    tbl('6.2', 'Sản phẩm lõi mới mở bán trong kỳ', 'doanh thu: tỷ đồng', ['Sàn', n('Sản phẩm lõi có ngày mở bán'), n('Mở bán trong kỳ'), n('Tỷ trọng sản phẩm'), n('Doanh thu'), n('Tỷ trọng doanh thu lõi')], coh,
       { note: nar(`“Mở bán trong kỳ” = ngày bắt đầu bán từ ${P0}. Sản phẩm không có ngày hợp lệ không tính (${each(P => `{{${P}.coh.nodate}} ${onP(P)}`)}).`, 'T6.2') }) +
    m06Web,
    'Thương hiệu theo cột của nguồn, người bán tự khai; hàng “không ghi” có thể vẫn là hàng có thương hiệu.'));

  // ---------- Phần 7 ----------
  const brandOf = (brands: Record<string, number>): string => { const e = Object.entries(brands).sort((a, b) => b[1] - a[1])[0]?.[0]; return !e || e === NO_BRAND ? '–' : e; };
  /** Rank cell: bundle key when the page gave a number, captured text when not. */
  const wrank = (row: Record<string, unknown>, col: string, key: string, where: string): string => {
    if (has(key)) return wn(key, where);
    const c = row[col];
    if (typeof c === 'object' && c !== null && 'displayed' in c && !/\d/.test(String((c as { displayed: unknown }).displayed))) {
      return esc(String((c as { displayed: unknown }).displayed));
    }
    return '–';
  };
  const m07BrandShare = WEB !== null && WEB !== undefined && !('absent' in WEB.top10Share.brand)
    ? webex(tbl('7.2', `Top 10 thương hiệu giữ bao nhiêu (${WEB_FAMILY_LABEL})`, '', ['Chỉ số', 'Giá trị'],
      [['Top 10 thương hiệu giữ (% doanh thu)', n(wn('web.top10.brand', 'T7.2'))]],
      {
        ...(WEB.top10Share.brand.top10.precision === 'display_rounded' ? { note: `Tỷ trọng ${DISPLAY_ROUNDED_NOTE}.` } : {}),
        src: `${WEB_SRC}${citeCell('top10brand')}`,
      }), 'top 10 thương hiệu')
    : '';
  const m07BrandShop = WEB !== null && WEB !== undefined && !('absent' in WEB.brandByShopType)
    ? webex(tbl('7.3', `Thương hiệu theo loại gian hàng (${WEB_FAMILY_LABEL})`, 'doanh thu: tỷ đồng',
      ['Thương hiệu', 'Gian hàng thường', 'Gian hàng Mall'],
      WEB.brandByShopType.map((row, i) => [wtext(row['brand']) + citeCell('brandshoptype'),
        n(wn(`web.bst.${i}.normal`, 'T7.3')), n(wn(`web.bst.${i}.mall`, 'T7.3'))]),
      { src: `${WEB_SRC}${citeCell('brandshoptype')}`,
        ...(WEB.brandByShopType.some(row => Object.values(row).some(wrounded)) ? { note: DISPLAY_ROUNDED_NOTE } : {}) }),
    WEB.brandByShopType.flatMap(r => {
      const c = r['brand'];
      return typeof c === 'object' && c !== null && 'text' in c ? [String((c as { text: unknown }).text)] : [];
    }).join(' | '))
    : '';
  const m07Products = WEB !== null && WEB !== undefined && !('absent' in WEB.topProducts)
    ? webex(tbl('7.4', `Sản phẩm dẫn đầu trên trang (${WEB_FAMILY_LABEL})`, 'doanh thu: tỷ đồng',
      ['#', 'Sản phẩm', 'Gian hàng', 'Giá (đồng)', 'Doanh thu', '%doanh số', 'Đơn vị bán', '%đơn vị'],
      WEB.topProducts.map((row, i) => [i + 1, wtext(row['name']) + citeCell('topproducts'), wtext(row['shop']),
        n(wn(`web.top.product.${i}.price`, 'T7.4')), n(wn(`web.top.product.${i}.rev`, 'T7.4')),
        n(wn(`web.top.product.${i}.chg`, 'T7.4')), n(wn(`web.top.product.${i}.units`, 'T7.4')),
        n(wn(`web.top.product.${i}.unitsChg`, 'T7.4'))]),
      {
        note: 'Tăng trưởng so kỳ liền kề theo trang hiển thị.' +
          (WEB.topProducts.some(row => Object.values(row).some(wrounded)) ? ` ${DISPLAY_ROUNDED_NOTE}.` : ''),
        src: `${WEB_SRC}${citeCell('topproducts')}`,
      }),
    WEB.topProducts.flatMap(r => [r['name'], r['shop']]
      .filter(c => typeof c === 'object' && c !== null && 'text' in c)
      .map(c => String((c as { text: unknown }).text))).join(' | '))
    : '';
  const m07Shops = WEB !== null && WEB !== undefined && !('absent' in WEB.topShops)
    ? webex(tbl('7.5', `Gian hàng dẫn đầu trên trang (${WEB_FAMILY_LABEL})`, 'doanh thu: tỷ đồng',
      ['Hạng mới', 'Hạng cũ', 'Gian hàng', 'Sàn', 'Doanh thu', '%doanh số'],
      WEB.topShops.map((row, i) => {
        const cells = row as Record<string, unknown>;
        const shopCell = cells['shop'];
        const platCell = cells['platform'];
        return [n(wrank(cells, 'rankNew', `web.top.shop.${i}.rankNew`, 'T7.5')),
          n(wrank(cells, 'rankOld', `web.top.shop.${i}.rankOld`, 'T7.5')),
          wtext(shopCell) + citeCell('topshops'), wtext(platCell),
          n(wn(`web.top.shop.${i}.rev`, 'T7.5')), n(wn(`web.top.shop.${i}.chg`, 'T7.5'))];
      }),
      {
        note: 'Hạng cũ "Mới" nghĩa là gian hàng mới vào bảng.' +
          (WEB.topShops.some(row => Object.values(row).some(wrounded)) ? ` ${DISPLAY_ROUNDED_NOTE}.` : ''),
        src: `${WEB_SRC}${citeCell('topshops')}`,
      }),
    WEB.topShops.flatMap(r => {
      const c = (r as Record<string, unknown>)['shop'];
      return typeof c === 'object' && c !== null && 'text' in c ? [String((c as { text: unknown }).text)] : [];
    }).join(' | '))
    : '';
  const m07Brands = WEB !== null && WEB !== undefined && !('absent' in WEB.topBrands)
    ? webex(tbl('7.6', `Thương hiệu dẫn đầu trên trang (${WEB_FAMILY_LABEL})`, 'doanh thu: tỷ đồng',
      ['Hạng mới', 'Hạng cũ', 'Thương hiệu', 'Doanh thu'],
      WEB.topBrands.map((row, i) => {
        const cells = row as Record<string, unknown>;
        const brandCell = cells['brand'];
        return [n(wrank(cells, 'rankNew', `web.top.brand.${i}.rankNew`, 'T7.6')),
          n(wrank(cells, 'rankOld', `web.top.brand.${i}.rankOld`, 'T7.6')),
          wtext(brandCell) + citeCell('topbrands'), n(wn(`web.top.brand.${i}.rev`, 'T7.6'))];
      }),
      { src: `${WEB_SRC}${citeCell('topbrands')}`,
        ...(WEB.topBrands.some(row => Object.values(row).some(wrounded)) ? { note: DISPLAY_ROUNDED_NOTE } : {}) }),
    WEB.topBrands.flatMap(r => {
      const c = (r as Record<string, unknown>)['brand'];
      return typeof c === 'object' && c !== null && 'text' in c ? [String((c as { text: unknown }).text)] : [];
    }).join(' | '))
    : '';
  secs.push(section('M07', 'Đối thủ',
    hlNum(nar(`Gian hàng lớn nhất đạt ${each(P => `{{${P}.shop.top.0.rev}} ${onP(P)}`)}; gian hàng điển hình (trung vị) đạt ${each(P => `{{${P}.shop.median}} triệu đồng ${onP(P)}`)}.`, 'M07.ans')),
    tbl('7.1', 'Top 10 gian hàng theo doanh thu lõi, từng sàn', 'doanh thu: tỷ đồng', ['Sàn', '#', 'Gian hàng', 'Thương hiệu bán nhiều nhất', n('Sản phẩm lõi'), n('Doanh thu'), n('Tỷ trọng doanh thu lõi của sàn')],
      PLATS.flatMap(P => S[P].shops.slice(0, 10).map((s, j) => [plat(P), j + 1, L(s.name), L(brandOf(s.brands)), n(s.n), n(t1(s.rev / 1e9)), n(bf(`${P}.shop.top.${j}.share`))])),
      { note: 'Sắp theo doanh thu quan sát, không phải xếp hạng năng lực. Nhóm đối thủ để so trực tiếp chưa chốt (Phần 12).' }) +
    `<p>${hlNum(nar(`Số gian hàng dưới 100 triệu đồng doanh thu lõi: ${each(P => `{{${P}.shop.under100m}}/{{${P}.core.shops}} ${onP(P)}`)}.`, 'M07.p'))}</p>` +
    m07BrandShare + m07BrandShop + m07Products + m07Shops + m07Brands,
    'Doanh thu theo gian hàng chỉ tính sản phẩm có trong tệp; gian hàng có thể còn bán sản phẩm ngoài tệp.'));
  extraOk.add('100 triệu');

  // ---------- Phần 8 ----------
  const qRows = PLATS.flatMap(P => coreSegs.filter(k => B.has(`${P}.seg.${k}.aspMed`)).map(k => [plat(P), L(segName(k)), n(bf(`${P}.seg.${k}.n`)), n(bf(`${P}.seg.${k}.aspP25`, 'dong100')), n(bf(`${P}.seg.${k}.aspMed`, 'dong100')), n(bf(`${P}.seg.${k}.aspP75`, 'dong100'))]));
  const bench = prof.benchmark;
  const benchRows = bench ? PLATS.filter(P => B.has(`${P}.bench.n`)).map(P => [plat(P), L(bench.label), n(bf(`${P}.bench.n`)), n(bf(`${P}.bench.p25`)), n(bf(`${P}.bench.med`)), n(bf(`${P}.bench.p75`))]) : [];
  const m08Web = WEB !== null && WEB !== undefined && !('absent' in WEB.priceLevel)
    ? webex(tbl('8.3', `Mức giá trên trang (${WEB_FAMILY_LABEL})`, 'doanh thu: tỷ đồng',
      ['Mức giá trên trang', 'Sàn', 'Doanh thu'],
      WEB.priceLevel.map((row, i) => [wtext(row['priceLevel']), wtext(row['platform']), n(wn(`web.price.${i}.rev`, 'T8.3'))]),
      {
        note: `Bảng này giữ nguyên mức giá trang hiển thị, không gộp với khoảng giá mẫu (Hình 8.1).${
          WEB.priceLevel.some(r => wrounded(r['revenue'])) ? ` Doanh thu ${DISPLAY_ROUNDED_NOTE}.` : ''}`,
        src: `${WEB_SRC}${citeCell('price')}`,
      }),
    WEB.priceLevel.flatMap(r => [r['priceLevel'], r['platform']]
      .filter(c => typeof c === 'object' && c !== null && 'text' in c)
      .map(c => String((c as { text: unknown }).text))).join(' | '))
    : '';
  secs.push(section('M08', 'Giá và kinh tế đơn vị',
    hlNum(nar(`Giá trung bình lõi là ${each(P => `{{${P}.core.asp:dong100}} ${onP(P)}`)}. Chưa tính được lãi vì chưa có giá vốn.`, 'M08.ans')),
    `<p class="lead">Giá trung bình = doanh thu ÷ đơn vị bán của từng sản phẩm, đã gộp biến thể và khuyến mãi.</p>` +
    fig('8.1', 'Doanh thu lõi theo khoảng giá trung bình', '% doanh thu lõi của sàn', await bars('m08-price-bands', MARKET_PRICE_BANDS.map(b => b[0]), (P, j) => B.v(`${P}.pb.${j}.share`), 'Tỷ trọng doanh thu lõi (%)', ps)) +
    tbl('8.1', 'Mốc giá theo nhóm, từng sàn', 'đồng', ['Sàn', 'Nhóm', n('Sản phẩm'), n('Mốc 25%'), n('Trung vị'), n('Mốc 75%')], qRows) +
    (benchRows.length ? tbl('8.2', 'Mốc so giá', 'đồng', ['Sàn', 'Tập so sánh', n('Sản phẩm'), n('Mốc 25%'), n('Trung vị'), n('Mốc 75%')], benchRows) : '') +
    m08Web,
    'Không có giá vốn, phí sàn, chi phí vận chuyển và quảng cáo nên chưa tính được lãi gộp. Giá trung bình thấp có thể do khuyến mãi hoặc biến thể rẻ.'));

  // ---------- Phần 9 ----------
  const lead = PLATS.reduce((a, P) => B.v(`${P}.conc.3`) > B.v(`${a}.conc.3`) ? P : a, PLATS[0]!);
  const webHasDetail = WEB !== null && WEB !== undefined && !('absent' in WEB.detailHistory);
  const m09WebRows: (readonly unknown[])[] = webHasMonthly && webMonthlyGroups !== null
    ? Object.keys(webMonthlyGroups).sort().map(platform => {
      const months = webMonthlyGroups[platform as ReaderPlatform];
      const stats = months === undefined ? null : webMonthlyStats(months);
      const signal = stats !== null && has(`web.${platform}.last3vsPrev3`)
        ? hlNum(nar(`${PLATFORM_LABEL[platform] ?? platform} (${WEB_FAMILY_LABEL}): ba tháng cuối {{web.${platform}.last3vsPrev3}} so ba tháng trước đó${citeRef('monthly')}`, 'T9.1web'))
        : hlNum(nar(`${PLATFORM_LABEL[platform] ?? platform} (${WEB_FAMILY_LABEL}): có số theo tháng, chưa đủ sáu tháng để so ba tháng cuối với ba tháng trước đó${citeRef('monthly')}`, 'T9.1web'));
      return [signal, 'Đà theo mùa có thể lặp lại khi vào đúng đợt mua sắm',
        webHasDetail ? 'Lịch sử chi tiết từng đối tượng trên trang' : 'Chuỗi theo tháng của từng sản phẩm',
        webHasDetail ? 'Trung bình' : 'Thấp'];
    })
    : [];
  secs.push(section('M09', 'Động lực và rủi ro',
    'Các tín hiệu dưới đây mới ở mức giả thuyết, chưa phải kết luận nguyên nhân.',
    tbl('9.1', 'Tín hiệu, cơ chế có thể và mức chắc chắn', '', ['Tín hiệu quan sát được', 'Cơ chế có thể ảnh hưởng', 'Cần đối chiếu thêm', 'Mức chắc chắn'], [
      [hlNum(nar(`${PLATFORM_LABEL[lead]}: ba gian hàng lớn nhất giữ {{${lead}.conc.3}} doanh thu lõi`, 'T9.1a')), 'Doanh thu dựa vào vài gian hàng lớn; một gian hàng đổi giá hay ngừng bán là đổi cục diện', 'Lịch sử bán theo tháng của các gian hàng lớn', 'Thấp'],
      [hlNum(nar(`Sản phẩm mở bán trong kỳ: ${each(P => `{{${P}.coh.revShare}} doanh thu lõi ${PLATFORM_LABEL[P]}`)}`, 'T9.1b')), 'Mẫu xoay vòng nhanh thì sản phẩm mới phải liên tục ra mẫu', 'Chuỗi theo tháng của từng sản phẩm', 'Thấp'],
      [hlNum(nar(`Hàng không ghi thương hiệu: ${each(P => `{{${P}.brand.none.share}} doanh thu lõi ${PLATFORM_LABEL[P]}`)}`, 'T9.1c')), 'Khách chưa trung thành với thương hiệu, cạnh tranh bằng giá', 'Ý kiến khách hàng', 'Thấp'],
      ...m09WebRows],
      { src: 'Dữ liệu bán hàng ước tính (Phần 3–8).' }),
    'Không gán xác suất cho rủi ro. Doanh số cao không tự chứng minh nguyên nhân.'));

  // ---------- Phần 10 ----------
  const m10Web = webHasMonthly && webMonthlyGroups !== null
    ? `<p>Diễn biến đã qua của ${WEB_FAMILY_LABEL}: ${Object.keys(webMonthlyGroups).sort().map(platform => {
      const months = webMonthlyGroups[platform as ReaderPlatform];
      if (months === undefined) return '';
      const stats = webMonthlyStats(months);
      const peak = stats.peak === null || !has(`web.${platform}.peak`)
        ? '' : `${vmonth(stats.peak.month)} đạt ${n(bf(`web.${platform}.peak`))}`;
      const low = stats.low === null || !has(`web.${platform}.low`)
        ? '' : `${vmonth(stats.low.month)} ở mức ${n(bf(`web.${platform}.low`))}`;
      if (peak === '' && low === '') return '';
      return `${esc(PLATFORM_LABEL[platform] ?? platform)}: ${[peak, low].filter(Boolean).join('; ')}${
        Object.values(months).some(point => wrounded(point.revenue)) ? ` (${DISPLAY_ROUNDED_NOTE})` : ''}`;
    }).filter(Boolean).join('. ')}. Chỉ đọc xu hướng đã qua, không suy ra con số tương lai.</p>`
    : '';
  secs.push(section('M10', 'Dự báo và kịch bản',
    'Chưa dự báo: dữ liệu chỉ có một tổng cả kỳ, không có chuỗi theo ngày/tháng.',
    '<p>Để mở lại, cần chuỗi bán theo ngày của cùng một nhóm sản phẩm, đủ dài để kiểm ngoài mẫu, kèm giả định lượng bán, giá và chi phí. Khi đó mới lập được kịch bản có điều kiện (chậm / cơ sở / thuận lợi).</p>' + m10Web,
    'Dữ liệu sàn không đủ để dự báo cho toàn thị trường.'));

  // ---------- Phần 11 + 12: largest platform × core segment cells ----------
  const cells = PLATS.flatMap(P => coreSegs.map(k => ({ P, k, rev: B.v(`${P}.seg.${k}.rev`) }))).sort((a, b) => b.rev - a.rev).slice(0, 3);
  const st = (k: '' | 'pos', t: string): string => `<span class="st ${k}">${k === 'pos' ? 'Có tín hiệu' : 'Chưa có dữ liệu'}</span>${t ? '<br>' + t : ''}`;
  const hyp = (c: typeof cells[number]): string => `${L(segName(c.k))} ${onP(c.P)}`;
  secs.push(section('M11', 'Cơ hội',
    'Các giả thuyết dưới đây chưa đủ cả 3 điều kiện của một cơ hội.',
    `<p class="lead">Một cơ hội cần đủ 3 điều kiện: nhu cầu có thật, đối thủ phục vụ chưa tốt, và mình đáp ứng được.</p>` +
    tbl('11.1', 'Kiểm 3 điều kiện cơ hội', '', ['Giả thuyết', '① Nhu cầu có dấu hiệu', '② Đối thủ phục vụ chưa tốt', '③ Khả năng đáp ứng'],
      cells.map((c, j) => [`<b>Giả thuyết ${j + 1}.</b> ${hyp(c)}`, st('pos', hlNum(nar(`{{${c.P}.seg.${c.k}.rev}} ({{${c.P}.seg.${c.k}.revShare}} doanh thu lõi), {{${c.P}.seg.${c.k}.shops}} gian hàng`, `T11.1.${j}`))), st('', 'Chưa có ý kiến khách hàng'), st('', 'Chủ chưa khai báo')]),
      { src: 'Dữ liệu bán hàng ước tính (Phần 4–8).' }),
    'Thiếu một điều kiện thì vẫn là giả thuyết. Không ước mức tăng doanh số vì chưa có chuỗi theo tháng và giá vốn.'));
  const letters = ['A', 'B', 'C'];
  secs.push(section('M12', 'Khuyến nghị và hành động',
    'Các phương án dưới đây là đề xuất của TDN, chờ chủ duyệt. Việc làm ngay là viết câu hỏi kinh doanh và duyệt phân loại.',
    `<p class="lead">"Doanh thu liên quan" là doanh thu quan sát trong mẫu của nhóm mà phương án nhắm tới, không phải doanh thu kỳ vọng.</p>` +
    tbl('12.1', 'Phương án đề xuất', 'doanh thu: tỷ đồng, trong mẫu', ['Phương án', n('Doanh thu liên quan'), 'Còn thiếu', 'Bước kiểm đầu tiên'],
      cells.map((c, j) => [`<b>${letters[j]}. ${hyp(c)}</b> (giả thuyết ${j + 1})`, n(bf(`${c.P}.seg.${c.k}.rev`, 'tynum')), 'Điều kiện ② và ③', 'Lấy ý kiến khách của các sản phẩm lớn nhất trong nhóm']),
      { note: 'Thứ tự theo doanh thu liên quan, chưa tính chi phí và khả năng đáp ứng.', src: 'TDN đề xuất từ Phần 4–8 và 11.' }) +
    tbl('12.2', 'Kế hoạch hành động (đề xuất, chờ chủ duyệt)', '', ['Việc', 'Người phụ trách', 'Hạn', 'Đầu ra'], [
      ['1. Viết câu hỏi kinh doanh', 'Chủ dự án', 'Một tuần sau khi duyệt bản này', 'Câu hỏi kinh doanh bằng văn bản'],
      ['2. Duyệt quy tắc phân loại', 'Chủ dự án duyệt; TDN sửa', 'Một tuần sau khi duyệt bản này', 'Nhãn lõi/ngoài lõi chính thức'],
      ['3. Chốt nhóm đối thủ', 'Chủ dự án; TDN gợi ý từ Bảng 7.1', 'Hai tuần sau khi duyệt bản này', 'Danh sách gian hàng đối thủ'],
      ['4. Lấy ý kiến khách cho phương án A', 'TDN, sau khi chủ duyệt chi phí', 'Theo lịch chủ chốt', 'Báo cáo ý kiến khách hàng']]),
    'Đây là đề xuất, chờ chủ duyệt. Hạn là gợi ý; chủ dự án đổi theo lịch thật.'));

  // ---------- Phụ lục ----------
  const web = readerWebResults(options.webResults ?? [], webRegistry !== null);
  const webOn = web.length ? vd(new Date(Date.parse(web[0]!.retrievedAt) + 7 * 3_600_000).toISOString().slice(0, 10)) : '';
  const webSrc = web.length ? `<li>Kết quả tìm kiếm Google tại Việt Nam cho từ khóa của báo cáo, thu ngày ${webOn}</li>` : '';
  const webSnapshotSrc = WEB !== null && WEB !== undefined
    ? `<li>Trang kết quả tìm kiếm (${WEB_FAMILY_LABEL}) cho từ khóa của báo cáo, thu ngày ${vd(WEB.capturedAt.slice(0, 10))}</li>`
    : '';
  const webTable = web.length ? `
<div class="ex"><div class="exh"><span class="exn">Bảng PL.3</span><span class="ext">Kết quả tìm kiếm trên web</span></div><div class="tw"><table class="pl-web"><thead><tr><th>#</th><th>Trang tìm thấy</th><th>Đoạn mô tả Google hiển thị</th></tr></thead><tbody>${web.map(w => {
    const meta = [w.site, w.published ? `đăng ${w.published}` : null].filter(Boolean).map(s => esc(s)).join(' · ');
    const number = webRegistry?.cite({ sourceKind: 'WEB_RESULT', identity: w.url, locator: null,
      label: w.site || 'Kết quả tìm kiếm trên web', retrievedAt: w.retrievedAt, url: w.url,
      quote: null, quoteVerification: 'NOT_APPLICABLE' }) ?? null;
    const mark = number === null ? '' : renderCitationMark(number);
    return `<tr><td>${w.position}</td><td class="pl-cite" data-quote><a href="${esc(w.url)}" target="_blank" rel="noopener noreferrer">${esc(w.title)}</a>${mark}${meta ? `<span class="pl-meta">${meta}</span>` : ''}<span class="pl-url">${esc(mask(w.url))}</span></td><td data-quote>${esc(w.snippet ?? '')}${w.snippet ? mark : ''}</td></tr>`;
  }).join('')}</tbody></table></div><p class="ex-note">Bấm tiêu đề để mở trang gốc; bản in giữ địa chỉ trang dưới tiêu đề. Tên trang và ngày đăng ghi theo Google; Google không cho biết tác giả. Tiêu đề và đoạn mô tả chép theo kết quả tìm kiếm Google, không phải từ trang gốc: Google có thể cắt ngắn, tên nguồn số liệu (nếu có) được che bằng […], và báo cáo không mở trang gốc để đối chiếu. Đây không phải nhận định của báo cáo. Thứ tự theo kết quả tìm kiếm tại thời điểm thu; nội dung trang có thể đã đổi sau ngày thu.</p><p class="ex-src">Nguồn: Google, thu ngày ${webOn}.</p></div>` : '';
  const listRows = [...rows].sort((a, b) => b.rev - a.rev).map(r => `<tr><td>${r.i}${sampleMark(r)}</td><td>${plat(r.platform)}</td><td>${esc(segName(r.seg ?? ''))}</td><td>${esc(r.shopName || r.shop)}</td><td>${numberCell(num(r.rev))}${sampleMark(r)}</td><td>${numberCell(num(r.units))}${sampleMark(r)}</td><td>${numberCell(num(r.asp))}${sampleMark(r)}</td><td>${esc(r.title)}</td></tr>`).join('');
  const webRegister = webRegistry !== null ? '<div data-reader-citation-register></div>' : '';
  secs.push(section('M13', 'Nguồn, thuật ngữ và danh sách sản phẩm',
    hlNum(nar('Phụ lục liệt kê nguồn số liệu và nghĩa của các thuật ngữ. Cuối phụ lục có danh sách đủ {{src.rows}} sản phẩm để tra lại.', 'PL.ans')),
    `<div class="ex"><div class="exh"><span class="exn">Bảng PL.1</span><span class="ext">Nguồn số liệu</span></div><ul class="pl-srclist">${PLATS.map(P => `<li>Dữ liệu bán hàng ${PLATFORM_LABEL[P]} (số ước tính)</li>`).join('')}${webSnapshotSrc}${webSrc}</ul><p class="ex-src">Nguồn: TDN.</p></div>
<div class="ex"><div class="exh"><span class="exn">Bảng PL.2</span><span class="ext">Thuật ngữ</span></div><dl class="pl-terms">
<div><dt>Lõi</dt><dd>${coreSegs.map(k => L(segName(k))).join('; ')}. Mọi số chỉ tính phần lõi, trừ khi ghi khác.</dd></div>
<div><dt>Sản phẩm</dt><dd>Một trang bán hàng trên sàn; có thể gồm nhiều biến thể.</dd></div>
<div><dt>Gian hàng</dt><dd>Một người bán trên một sàn.</dd></div>
<div><dt>Giá trung bình</dt><dd>Doanh thu ÷ đơn vị bán. Đã gộp biến thể và khuyến mãi, nên khác giá niêm yết.</dd></div>
<div><dt>Trung vị, mốc 25% / 75%</dt><dd>Xếp các giá trị từ thấp đến cao: trung vị ở giữa; mốc 25% và 75% là mức mà một phần tư và ba phần tư số sản phẩm thấp hơn.</dd></div>
<div><dt>Trong mẫu</dt><dd>${nar('Tính trên tệp {{src.rows}} sản phẩm doanh thu cao nhất, không phải toàn thị trường.', 'PL.terms')}</dd></div>
<div><dt>TDN</dt><dd>Đơn vị thực hiện báo cáo.</dd></div></dl><p class="ex-src">Nguồn: TDN.</p></div>${webTable}
<div class="box pl-disc"><h3>Miễn trừ</h3><p>Số liệu bán hàng là số ước tính từ dữ liệu công khai trên sàn, chưa đối chiếu với số liệu của người bán. Người đọc tự đánh giá mức phù hợp trước khi dùng cho quyết định.</p></div>
<details class="pl-all"><summary>${nar('Xem đủ {{src.rows}} sản phẩm', 'PL.sum')}</summary><input class="pl-find" type="search" placeholder="Lọc theo tên, gian hàng, nhóm…" aria-label="Lọc danh sách sản phẩm"><div class="tw"><table class="pl-list"><thead><tr><th>#</th><th>Sàn</th><th>Nhóm</th><th>Gian hàng</th><th>${n('Doanh thu (đồng)')}</th><th>${n('Đơn vị bán')}</th><th>${n('Giá trung bình (đồng)')}</th><th>Tên sản phẩm</th></tr></thead><tbody>${listRows}</tbody></table></div></details>
<script>addEventListener('beforeprint',()=>document.querySelectorAll('details.pl-all').forEach(d=>d.open=true));(()=>{const i=document.querySelector('.pl-find'),tr=[...document.querySelectorAll('.pl-list tbody tr')];let t;i.addEventListener('input',()=>{clearTimeout(t);t=setTimeout(()=>{const v=i.value.trim().toLowerCase();for(const r of tr)r.style.display=!v||r.textContent.toLowerCase().includes(v)?'':'none'},150)})})()</script>${webRegister}`,
    'Cột # là số thứ tự của sản phẩm trong tệp dữ liệu gốc, dùng khi cần tra lại.'));

  const html0 = page({
    title: `Báo cáo thị trường – ${prof.product} – ${platNames}`, coverHtml, intro, toc: MARKET_TOC, sections: secs,
    foot: `Bản đọc dựng tự động bằng bộ dựng báo cáo của TDN ngày ${esc(options.builtOn)}. Không chạy nguồn trả phí khi dựng.`,
  });
  let html = html0;
  if (webRegistry !== null) {
    const before = webRegistry.entries();
    html = orderReportCitations(html, webRegistry);
    const finalById = new Map(webRegistry.entries().map(entry => [entry.citationId, entry.number]));
    const finalByOld = new Map(before.map(entry => [entry.number, finalById.get(entry.citationId)]));
    for (const metric of B.m.values()) {
      if (metric.id.startsWith('cite.')) {
        const number = finalByOld.get(metric.value);
        if (number !== undefined) B.set(metric.id, number, metric.fmt);
      }
    }
    for (const entry of N.entries) entry.text = entry.text.replace(/<sup class="cite">\[(\d+)\]<\/sup>/g,
      (mark, old: string) => finalByOld.get(Number(old)) === undefined ? mark : renderCitationMark(finalByOld.get(Number(old))!));
    html = html.replace(webRegister, renderCitationRegister(webRegistry.entries(), { format: 'pdf' }));
  }
  return { html: platIcons(html, COL).html, narrator: N, extraOk: [...extraOk], charts, webResults: web };
}

