import type { AutomationMarketPresentationMethod } from '../../../../contracts/analysis/automation-market-presentation-method.generated.js';
import type { AutomationMetricMethodSnapshot, CaptureMetricHeadlineValue, CaptureMetricMethodDetails } from './metric-method-bridge.js';
import { CAPTURE_ROW_REF_HEADER, TOP_GROUPS, UNKNOWN_SHOP, captureRowRefLabel, type CaptureCountChart, type MarketChartRow, type MarketShare } from '../reader-report/market-charts.js';
import { vnd, type PlatformSignal } from '../reader-report/market-actions.js';
import { sp } from '../reader-report/format.js';
import { readerPriceState, readerProductLabel, readerStoredOrJson } from './reader-plain-text.js';
import { escapeHtml as escape, readerPointer, storedLiteral, type ReportCitations } from './descriptive-report.js';
import { isCaptureRowProfile } from './capture-row-quality.js';

type Method = AutomationMarketPresentationMethod;
const number = (value: number | null): string => value === null ? 'Chưa rõ' : value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const literal = (value: string, readerPlainText = false): string => `<span data-quote>${escape(readerPlainText ? readerStoredOrJson(value, 'Nội dung nguyên văn được giữ trong hồ sơ nguồn') : storedLiteral(value, 'Nội dung nguyên văn được giữ trong hồ sơ nguồn'))}</span>`;
const mark = (ref: { sourceSha256: string; locator: string; label?: string }, citations: ReportCitations, readerPlainText = false): string => {
  const pointer = readerPointer(ref.locator, readerPlainText);
  return citations.mark({ sourceKind: 'CAPTURE', identity: ref.sourceSha256, locator: readerPlainText ? null : pointer.locator,
    label: ref.label ?? 'Quy cách và giá do người vận hành lưu', retrievedAt: null, url: null, quote: null,
    quoteVerification: 'NOT_APPLICABLE', technical: { locator: ref.locator } });
};
const table = (caption: string, headings: readonly string[], rows: readonly string[][]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headings.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export type MarketChartSource = { rows: MarketChartRow[]; titleLabels?: boolean; currentReader?: boolean; rowListNote?: string; sampleNote?: string };

/**
 * Rows the three Market charts are drawn from. Saved presentation rows are used
 * when there are any; otherwise the frozen Metric records are read as stored:
 * each workbook record, or each results-page row kept for one platform (numbered
 * by its row in the saved results table). Nothing is recalculated or inferred;
 * a missing revenue stays missing, so that platform draws no chart.
 */
export function marketChartSource(presentationRows: readonly MarketChartRow[], metric: AutomationMetricMethodSnapshot | undefined): MarketChartSource {
  if (presentationRows.length || !metric) return { rows: [...presentationRows] };
  const revenue = (value: string | null): number | null => value === null ? null : Number(value);
  if (metric.capture) return {
    rows: metric.capture.platforms.flatMap(({ platform, result }) => result.input.records.map((record, index) => ({
      i: Number(/^\/groups\/W12_topProducts\/rows\/(\d+)$/u.exec(record.source.locator)?.[1] ?? index), platform, shop: record.shopId, rev: revenue(record.revenue.value), ref: captureRowRefLabel(index), ...(metric.capture?.rowPolicyVersion ? { title: record.title } : {}) }))),
    ...(metric.capture.rowPolicyVersion ? { titleLabels: true } : {}),
    currentReader: true,
    rowListNote: `mỗi nhãn ghi sàn và mã dòng, đúng mã ở cột ${CAPTURE_ROW_REF_HEADER} của bảng mẫu cùng sàn; tên dài được rút gọn, tên đầy đủ nằm trong bảng mẫu`,
    sampleNote: ' Mẫu là các dòng đầu được giữ của bảng kết quả tìm kiếm, không phải số của cả tập kết quả theo bộ lọc.',
  };
  return { rows: metric.result.input.records.map((record, i) => ({ i, platform: record.measurement.platform, shop: record.shopId, rev: revenue(record.revenue.value) })) };
}

/** Frozen record counts of each platform whose whole-sample scope was calculated; never summed across platforms. */
export function captureSampleCounts(capture: CaptureMetricMethodDetails) {
  return capture.platforms.flatMap(({ platform, result }) => {
    const all = result.scopes.find(scope => scope.key === 'all');
    return all?.status === 'CALCULATED' && (!capture.rowPolicyVersion || all.listingCount > 0) ? [{ platform, result, count: all.listingCount }] : [];
  });
}

/**
 * Plot frozen record counts separately by platform; never derive a population or add platforms.
 * The bars are drawn by Flint before the synchronous build (see renderCaptureCountCharts); a
 * platform without a drawn chart keeps its count line and source, with no chart.
 */
export function renderCaptureSampleCharts(capture: CaptureMetricMethodDetails, citations: ReportCitations, charts: readonly CaptureCountChart[] = []): string {
  if (capture.rowPolicyVersion && capture.platforms.every(({ result }) => result.input.records.length === 0))
    return '<p>Chưa có số lượng mẫu phù hợp để phân tích sau khi lọc; không suy ra doanh số từ các dòng bị loại.</p>';
  return captureSampleCounts(capture).map(({ platform, result, count }) => {
    const label = platform === 'shopee' ? 'Shopee' : 'TikTok Shop';
    const chart = charts.find(item => item.platform === platform);
    const source = citations.mark({ sourceKind: 'METRIC_ROW', identity: result.inputSha256, locator: null,
      label: 'Số liệu đã tính từ nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return `<figure><figcaption>Bản ghi sản phẩm — ${label}</figcaption><p>Trong mẫu ${label}: n = ${count} bản ghi; kỳ ${escape(result.input.scope.start)} đến ${escape(result.input.scope.end)}.</p>` +
      (chart === undefined ? '' : `<div class="chart flint" data-engine="${escape(chart.engine)}">${chart.svg}</div>`) +
      `<p>Nguồn: ${source}</p><p class="lim"><b>Chú thích:</b> Mỗi sàn giữ riêng số bản ghi đã lưu; không suy rộng ra toàn thị trường. Bản ghi chưa chứng minh sản phẩm hoặc biến thể phân biệt.</p></figure>`;
  }).join('');
}

/**
 * Current reader only (M9): one sentence per platform instead of capture-count bars. Each states the platform's own
 * row count, its distinct product count when that differs, the capture date and a neutral source; counts are never
 * added across platforms and no shop count is claimed. A platform outside the capture is named as not in the sample.
 */
export function renderCaptureSampleSentences(capture: CaptureMetricMethodDetails, citations: ReportCitations): string {
  const results = new Map(capture.platforms.map(entry => [entry.platform, entry.result] as const));
  const rows = (P: Platform): number => results.get(P)?.input.records.length ?? 0;
  if ((['shopee', 'tiktok'] as const).every(P => rows(P) === 0))
    return '<div class="capture-sample" data-capture-sample="1"><p>Chưa có số lượng mẫu phù hợp để phân tích; bảng kết quả đã lưu chưa có dòng sản phẩm nào gán được cho một sàn. Báo cáo không suy ra doanh số từ các dòng bị loại.</p></div>';
  const sentences = (['shopee', 'tiktok'] as const).map(P => {
    const label = PLATFORM_LABELS[P], result = results.get(P);
    if (!capture.capture.platforms.includes(P)) return `<p>${label} không có trong mẫu của báo cáo này.</p>`;
    if (!result || result.input.records.length === 0) return `<p>Mẫu ${label}: chưa có dòng sản phẩm nào gán được cho sàn này trong bảng kết quả đã lưu.</p>`;
    // A product is a distinct listing identity (the row identity behind the sample table), never its title text.
    const records = result.input.records, distinct = new Set(records.map(record => JSON.stringify([record.shopId, record.listingId]))).size;
    const acquired = result.input.scope.acquiredAt ?? null;
    const day = acquired ? `ngày ${isoDay(acquired.slice(0, 10))}` : 'chưa ghi ngày lưu';
    const source = citations.mark({ sourceKind: 'METRIC_ROW', identity: result.inputSha256, locator: null,
      label: 'Số liệu đã tính từ nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    return `<p>Mẫu ${label}: n = ${records.length} dòng sản phẩm${distinct !== records.length ? `, gồm ${distinct} sản phẩm khác nhau` : ''}, lấy từ bảng kết quả tìm kiếm đã lưu, ${escape(day)}.${source}</p>`;
  });
  return `<div class="capture-sample" data-capture-sample="1">${sentences.join('')}<p class="lim"><b>Chú thích:</b> Mỗi sàn giữ riêng số dòng đã lưu và được đọc riêng; số dòng không suy rộng ra toàn thị trường.</p></div>`;
}

export type AdvertisingReferenceInput = {
  period: { start: string; end: string } | null;
  object: { kind: 'product' | 'shop' | 'video'; label: string };
  revenue: { value: string | number | null; source: { identity: string } | null };
  adCost: { value: string | number | null; source: { identity: string } | null };
  orders: { value: string | number | null; source: { identity: string } | null };
  unavailableReason?: string;
  readerPlainText?: boolean;
};

const decimal = (value: string | number | null): number | null => {
  if (value === null || (typeof value === 'number' && (!Number.isFinite(value) || value < 0))) return null;
  if (typeof value === 'string' && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const advertisingNumber = (value: number | null, suffix = ''): string => value === null
  ? 'chưa khả dụng'
  : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}${suffix}`;

const advertisingPeriod = (period: AdvertisingReferenceInput['period']): string => period === null
  ? 'chưa xác định trong bản lưu'
  : `${period.start} đến ${period.end}`;

const advertisingObject = (object: AdvertisingReferenceInput['object']): string => {
  const labels = { product: 'sản phẩm', shop: 'gian hàng', video: 'video' };
  return `${labels[object.kind]}: ${object.label}`;
};

/**
 * Renders advertising references without treating a retained export column as
 * authenticated advertising evidence. A number is calculated only when the
 * caller explicitly confirms the source semantics and all same-source inputs
 * needed by that metric are present. The output never exposes source field
 * names or the derived share metric.
 */
const completePeriod = (period: AdvertisingReferenceInput['period']): boolean => period !== null &&
  period.start.trim() !== '' && period.end.trim() !== '';

export function renderAutomationMarketAdvertising(input: AdvertisingReferenceInput): string {
  const period = completePeriod(input.period) ? advertisingPeriod(input.period) : 'chưa xác định trong bản lưu';
  const object = advertisingObject(input.object);
  const sources = [input.revenue.source, input.adCost.source, input.orders.source];
  const sourceIdentities = sources.map(source => source?.identity.trim() ?? '');
  const sameConfirmedSource = sourceIdentities.every(identity => identity !== '') && new Set(sourceIdentities).size === 1;
  const confirmed = sameConfirmedSource && completePeriod(input.period) && input.object.label.trim() !== '';
  const revenue = decimal(input.revenue.value), adCost = decimal(input.adCost.value), orders = decimal(input.orders.value);
  const unavailable = input.unavailableReason ?? 'thiếu trường nguồn đã xác nhận với ngữ nghĩa quảng cáo';
  const roas = confirmed && revenue !== null && adCost !== null && adCost > 0 ? revenue / adCost : null;
  const cpa = confirmed && adCost !== null && orders !== null && orders > 0 ? adCost / orders : null;
  const roasReason = roas === null
    ? confirmed && adCost === 0 ? 'chi phí quảng cáo bằng không nên không thể chia' : unavailable
    : '';
  const cpaReason = cpa === null
    ? confirmed && orders === 0 ? 'số đơn bằng không nên không thể chia' : unavailable
    : '';
  const disclaimer = 'Đây là số ước tính tham khảo theo cùng một nguồn và kỳ; không suy ra lợi nhuận hoặc “có lãi”, không so sánh kênh và không trộn với số liệu bán hàng từ nguồn khác.';
  const firstUse = input.readerPlainText
    ? '<p>ROAS (tỷ lệ doanh thu trên chi phí quảng cáo) và CPA (chi phí trên đơn) là các chỉ số tham khảo.</p>'
    : '';
  return `<div class="market-advertising-reference"><h4>Chỉ số quảng cáo tham khảo</h4>` +
    `<p>Kỳ: ${escape(period)} · Đối tượng: ${escape(object)}.</p>` +
    firstUse + `<ul><li>ROAS: ${advertisingNumber(roas, 'x')}${roas === null ? ` · Lý do: ${escape(roasReason)}` : ' · ước tính tham khảo'}</li>` +
    `<li>CPA: ${advertisingNumber(cpa, ' VND/đơn')}${cpa === null ? ` · Lý do: ${escape(cpaReason)}` : ' · ước tính tham khảo'}</li></ul>` +
    `<p class="warning">${escape(disclaimer)}</p></div>`;
}

const PLATFORM_LABELS = { shopee: 'Shopee', tiktok: 'TikTok Shop' } as const;
const isoDay = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
const grouped = (value: string): string => BigInt(value).toLocaleString('vi-VN');

/**
 * Reader findings of a results-page capture: two per platform, each read from
 * that platform's own retained figures. The platform figure is the one Phần 3
 * shows (the page's own figure when it has one, otherwise a complete row total);
 * a total with a missing row is never stated, and platforms are never summed.
 */
function capturePlatformFindings(capture: CaptureMetricMethodDetails, citations: ReportCitations): string[] {
  const results = new Map(capture.platforms.map(entry => [entry.platform, entry.result] as const));
  return capture.capture.platforms.flatMap(platform => {
    const label = PLATFORM_LABELS[platform], result = results.get(platform);
    const evidence = (text: string, marks: string): string => `<p><b>Bằng chứng:</b> <a href="#M03">${escape(text)}</a>${marks}.</p>`;
    const all = result?.scopes.find(scope => scope.key === 'all');
    const hasRows = result && all && all.status === 'CALCULATED' && all.listingCount > 0;
    const calculation = hasRows ? citations.mark({ sourceKind: 'METRIC_ROW', identity: result.inputSha256, locator: null, label: 'Số liệu đã tính từ nguồn đã lưu',
      retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE', technical: { methodVersion: result.methodVersion, rounding: result.rounding } })
      : citations.mark({ sourceKind: 'CAPTURE', identity: capture.snapshotSha256, locator: null, label: 'Bảng kết quả tìm kiếm đã lưu',
        retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
    const page = capture.platformHeadlines?.find(value => value.platform === platform && value.revenue.value !== null);
    const pageMark = (value: CaptureMetricHeadlineValue): string => citations.mark({ sourceKind: 'CAPTURE', identity: capture.snapshotSha256,
      locator: readerPointer(value.locator, true).locator, label: 'Số liệu nền tảng trong bản lưu nguồn', retrievedAt: null, url: null, quote: null,
      quoteVerification: 'NOT_APPLICABLE', technical: { sourceSha256: capture.snapshotSha256, locator: value.locator } });
    const shops = hasRows && !result.input.records.some(record => record.shopId === UNKNOWN_SHOP) ? ` của ${all.shopCount} gian hàng` : '';
    const sample = hasRows
      ? `${label}: mẫu đã lưu có ${all.listingCount} dòng sản phẩm${shops}, kỳ ${isoDay(result.input.scope.start)} đến ${isoDay(result.input.scope.end)}. Mẫu là các dòng đầu của bảng kết quả tìm kiếm, không phải toàn bộ sản phẩm của sàn.`
      : `${label}: chưa có dòng nào gán được cho sàn này trong bảng kết quả đã lưu; báo cáo không suy ra số liệu từ các dòng.`;
    let figures = '', marks = '';
    if (page) {
      const units = page.units?.value ?? null;
      figures = `${label}: bảng kết quả theo bộ lọc ghi doanh thu (ước tính) ${grouped(page.revenue.value!)} VND${units === null ? '; chưa có số đơn vị bán' : ` và ${grouped(units)} đơn vị bán`}. Đây là số của cả tập kết quả trên trang; phạm vi này khác với các dòng đã lưu.`;
      marks = pageMark(page.revenue) + (page.units?.value ? pageMark(page.units) : '');
    } else if (hasRows) {
      const total = (value: typeof all.revenue, unit: string): string => value.missingCount === 0 && value.value !== null ? `${grouped(value.value)}${unit}` : 'chưa xác định vì có dòng thiếu số liệu';
      figures = `${label}: doanh thu (ước tính) của các dòng đã lưu là ${total(all.revenue, ' VND')}; đơn vị bán (ước tính) là ${total(all.units, '')}.`;
      marks = calculation;
    }
    if (hasRows) {
      const missing = [all.revenue.missingCount ? `${all.revenue.missingCount} dòng thiếu doanh thu` : '', all.units.missingCount ? `${all.units.missingCount} dòng thiếu đơn vị bán` : ''].filter(Boolean);
      figures += missing.length ? ` Có ${missing.join(' và ')} trong các dòng đã lưu; phần thiếu không thay bằng số không.` : ' Không có dòng nào thiếu doanh thu hoặc đơn vị bán trong các dòng đã lưu.';
      // Row completeness is a calculation claim, separate from the page figures.
      if (page) marks += calculation;
    }
    return [`<li><p><b>Nhận định:</b> ${escape(sample)}</p>${evidence(`Bảng số liệu ${label} ở phần Quy mô và diễn biến`, calculation)}</li>`,
      ...(figures ? [`<li><p><b>Nhận định:</b> ${escape(figures)}</p>${evidence(`Số liệu ${label} ở phần Quy mô và diễn biến`, marks)}</li>`] : [])];
  });
}

/** Phần 1 so-what figures, each computed by the same function as the exhibit it points to; empty parts print nothing. */
export type MarketHeadline = {
  /** marketShares of the chart rows; `shops` is null where Hình 4.2 is not drawn. Empty when Hình 4.1 is not drawn, and then Phần 1 keeps its previous bytes. */
  readonly shares: readonly MarketShare[];
  /** Product shares supported by Hình 7.1; top5 is null unless all five products are displayed. */
  readonly products: readonly MarketShare[];
  /** Platforms with a Bảng 11.1 price group; n is that platform's sample row count. */
  readonly bands: readonly (PlatformSignal & { readonly n: number })[];
  /** The first highest week of Hình 5.2 and its count of weeks with a value. */
  readonly search: { readonly period: string; readonly index: number; readonly weeks: number } | null;
  /** True when Phần 12 states its options with sample figures. */
  readonly options: boolean;
};

type Platform = keyof typeof PLATFORM_LABELS;
const pct = (value: number): string => `${sp(value.toFixed(1))} phần trăm`;

/** One finding per exhibit, one sentence per platform; platforms are never summed and no product is named. */
function headlineFindings(headline: MarketHeadline, method: Method, capture: CaptureMetricMethodDetails, citations: ReportCitations): string[] {
  const results = new Map(capture.platforms.map(entry => [entry.platform, entry.result] as const)), measured = capture.capture.measurementPeriod;
  const label = (P: Platform): string => PLATFORM_LABELS[P];
  const sample = (P: Platform, n: number): string => {
    const scope = results.get(P)?.input.scope ?? method.input.metric?.input.scope;
    return ` (n = ${n} dòng, kỳ ${isoDay(scope?.start ?? measured.startDate)} đến ${isoDay(scope?.end ?? measured.endDate)})`;
  };
  // The same calculation mark Phần 3 cites for the platform; no new source is numbered.
  const marks = (platforms: readonly Platform[]): string => [...new Set(platforms.flatMap(P => {
    const result = results.get(P), all = result?.scopes.find(scope => scope.key === 'all');
    return result && all?.status === 'CALCULATED' && all.listingCount > 0 ? [citations.mark({ sourceKind: 'METRIC_ROW', identity: result.inputSha256, locator: null,
      label: 'Số liệu đã tính từ nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE', technical: { methodVersion: result.methodVersion, rounding: result.rounding } })] : [];
  }))].join('');
  const li = (sentences: readonly string[], links: readonly (readonly [string, string])[], cite: string): string => sentences.length
    ? `<li><p><b>Nhận định:</b> ${escape(sentences.join(' '))}</p><p><b>Bằng chứng:</b> ${links.map(([id, text]) => `<a href="#${id}">${escape(text)}</a>`).join(', ')}${cite}.</p></li>` : '';
  const shops = headline.shares.filter(share => share.shops?.[0] != null);
  return [
    li(headline.products.map(s => `${label(s.platform)}: 1 sản phẩm doanh thu cao giữ ${pct(s.top)} doanh thu trong mẫu của sàn${s.top5 === null ? '' : `; 5 sản phẩm doanh thu cao giữ ${pct(s.top5)}`}${sample(s.platform, s.n)}.`),
      [['M04', 'Hình 4.1 ở phần Cơ cấu trong mẫu'], ['M07', 'Hình 7.1 ở phần Đối thủ']], marks(headline.products.map(s => s.platform))),
    li(shops.map(s => {
      const j = [2, 1].find(j => s.shops![j] != null), wider = j === undefined ? '' : `; ${TOP_GROUPS[j]} gian hàng doanh thu cao giữ ${pct(s.shops![j]!)}`;
      return `${label(s.platform)}: 1 gian hàng doanh thu cao giữ ${pct(s.shops![0]!)} doanh thu trong mẫu của sàn${wider}${sample(s.platform, s.n)}.`;
    }), [['M04', 'Hình 4.2 ở phần Cơ cấu trong mẫu']], marks(shops.map(s => s.platform))),
    li(headline.bands.flatMap(({ platform, band, n }) => band ? [`${label(platform)}: nhóm giá ${band.low === band.high ? vnd(band.low) : `${vnd(band.low)}–${vnd(band.high)}`} VND mỗi đơn vị bán có doanh thu lớn trong ba nhóm giá của sàn, ${vnd(band.revenue)} VND từ ${band.count} sản phẩm${sample(platform, n)}.`] : []),
      [['M11', 'Bảng 11.1 ở phần Cơ hội']], marks(headline.bands.map(b => b.platform))),
    li(headline.search ? [`Mức quan tâm tìm kiếm của từ khóa cao ở tuần ${headline.search.period}, chỉ số ${sp(headline.search.index)} trên thang 0–100; đây là chỉ số tương đối, không phải số người tìm hay doanh số (n = ${headline.search.weeks} tuần có số).`] : [],
      [['M05', 'Hình 5.2 ở phần Nhu cầu (tín hiệu bán)']], ''),
  ].filter(Boolean);
}

/** Every statement is frozen by the owning method; rendering introduces no
 * calculation, interpretation, ordering by importance or provider execution.
 * A reader copy of a results-page capture states each platform's own figures
 * instead of the single-platform statements (see `capturePlatformFindings`);
 * with headline figures it leads with them and keeps those statements as trace. */
export function renderAutomationMarketFindings(method: Method, citations: ReportCitations, readerPlainText = false, capture?: CaptureMetricMethodDetails, headline?: MarketHeadline): string {
  const allScope = method.input.metric?.scopes.find(scope => scope.key === 'all');
  const sampleCount = allScope?.status === 'CALCULATED' ? allScope.listingCount : null;
  const emptySample = isCaptureRowProfile(method.input.metric?.input.profileId) && sampleCount === 0
    ? '<p>Chưa có số lượng mẫu phù hợp để phân tích sau khi lọc. Không suy ra doanh số, số người mua hoặc quy mô ngoài mẫu.</p>' : '';
  // An empty filtered sample does not erase the independently retained page figures.
  if (emptySample && !(readerPlainText && capture)) return emptySample;
  const sampleLabel = sampleCount === null ? 'trong mẫu (chưa có số lượng mẫu)' : `trong mẫu (n = ${sampleCount})`;
  const withSample = (text: string): string => readerPlainText
    ? text.replace(/\btrong mẫu\b/iu, sampleLabel)
    : text;
  const sampleStatement = readerPlainText ? ` ${sampleLabel}` : ' trong mẫu';
  const note = readerPlainText ? '<p class="lim"><b>Chú thích:</b> Số liệu chỉ mô tả mẫu đã lưu theo từng sàn; không suy rộng thành quy mô toàn thị trường.</p>' : '';
  const item = (finding: Method['findings'][number]): string =>
    `<li><p><b>Nhận định:</b> ${finding.pending ? `<span data-classified="pending">${escape(withSample(readerPlainText ? readerStoredOrJson(finding.statement.replace(/[.]$/, ''), 'Nhận định được giữ trong hồ sơ đối chiếu') : finding.statement.replace(/[.]$/, '')))} (đề xuất, chờ chủ duyệt).</span>` : escape(withSample(readerPlainText ? readerStoredOrJson(finding.statement, 'Nhận định được giữ trong hồ sơ đối chiếu') : finding.statement))}</p><p><b>Bằng chứng:</b> <a href="#${finding.sectionId}">Bảng ${finding.sectionId === 'M03' ? 'số liệu mẫu xuất ở phần Quy mô và diễn biến' : 'quy cách và đơn vị chuẩn ở phần Giá và kinh tế đơn vị'}</a>${finding.evidence.map(ref => mark(ref, citations, readerPlainText)).join('')}.</p><p><b>Trạng thái:</b> Bản nháp chưa được duyệt; ${finding.pending ? 'phân loại đề xuất, chờ chủ duyệt; ' : ''}${escape(readerPlainText ? readerStoredOrJson(finding.scope, 'Phạm vi được giữ trong hồ sơ đối chiếu') : finding.scope)}</p></li>`;
  if (readerPlainText && capture) {
    // Phần 3 statements are built first so citation numbers stay as before; without sample shares they stay the findings.
    const platformFindings = capturePlatformFindings(capture, citations).join(''), lead = headline?.shares.length ? headlineFindings(headline, method, capture, citations) : [];
    const pointer = lead.length && headline!.options ? '<li><p><b>Nhận định:</b> Ba phương án ở Phần 12 đọc từ các số trong mẫu này (đề xuất, chờ chủ duyệt).</p><p><b>Bằng chứng:</b> <a href="#M12">Bảng 12.1 ở phần Khuyến nghị và hành động</a>.</p></li>' : '';
    // Sources only the traced Phần 3 statements cite stay cited in the reader copy.
    const sups = (html: string): string[] => [...new Set(html.match(/<sup class="cite">[^<]*<\/sup>/gu) ?? [])];
    const kept = lead.length ? sups(platformFindings).filter(sup => !sups(lead.join('')).includes(sup)).join('') : '';
    return emptySample + `<p>Các phát hiện mô tả mẫu đã lưu của từng sàn, không sắp theo mức quan trọng.</p><ul class="market-findings"${lead.length ? ' data-market-headline="1"' : ''}>` +
      (lead.length ? lead.join('') + pointer : platformFindings) + method.findings.filter(finding => finding.sectionId !== 'M03').map(item).join('') + '</ul>' +
      `<p>Doanh thu và đơn vị bán là số ước tính của nguồn${kept}. Mỗi sàn đọc riêng; không suy số người mua, quy mô ngoài mẫu hoặc nguyên nhân.</p>` +
      '<p class="lim"><b>Chú thích:</b> Số liệu chỉ mô tả mẫu đã lưu theo từng sàn; không suy rộng ngoài phạm vi nguồn.</p>' +
      (lead.length ? `<details class="evidence-trace"><summary>Số liệu mẫu đã lưu từng sàn</summary><ul>${platformFindings}</ul></details>` : '') +
      '<details class="evidence-trace"><summary>Nhận định M03 đã lưu</summary><ul>' +
      method.findings.filter(finding => finding.sectionId === 'M03').map(item).join('') + '</ul></details>';
  }
  return '<p>Các phát hiện mô tả mẫu đã lưu, không sắp theo mức quan trọng.</p><ul class="market-findings">' + method.findings.map(item).join('') + '</ul>' +
    (method.findings.length < 4 ? '<p>Chưa đủ bằng chứng để có bốn nhận định; phần kết luận còn thiếu, không bổ sung nhận định không có nguồn.</p>' : '') +
    `<p>Số bán hàng là ước tính${sampleStatement}. Không suy số người mua, quy mô ngoài mẫu hoặc nguyên nhân.</p>${note}`;
}

export function renderAutomationMarketUnitPrices(method: Method, citations: ReportCitations, readerPlainText = false, capturedPrices = false): string {
  const groups = new Map<string, Method['unitPrices']>(), missing: Method['unitPrices'] = [];
  for (const row of method.unitPrices) {
    if (row.value === null) missing.push(row);
    else groups.set(row.comparisonKey, [...(groups.get(row.comparisonKey) ?? []), row]);
  }
  const titleByListing = new Map(method.input.rows.flatMap(row => row.title.trim() ? [[row.listing, row.title.trim()] as const] : []));
  const listingOrdinals = new Map<string, number>();
  const productLabel = (listing: string): string => {
    const ordinal = listingOrdinals.get(listing) ?? listingOrdinals.size + 1;
    listingOrdinals.set(listing, ordinal);
    return readerPlainText ? escape(readerProductLabel(listing, titleByListing.get(listing), ordinal)) : literal(listing, false);
  };
  const prices = { LISTED: 'Giá niêm yết', PAYMENT: 'Giá thanh toán', CONDITIONAL_PROMO: 'Giá khuyến mãi có điều kiện' };
  const headings = readerPlainText
    ? ['Sàn', 'Sản phẩm', 'Biến thể', 'Ngành hàng', 'Giá (VND)', 'Số lượng', 'Đơn vị nguồn', 'Giá theo đơn vị chuẩn (VND)', 'Đơn vị chuẩn / cơ sở', 'Loại giá', 'Kỳ giá', 'Trạng thái', 'Nguồn', 'Điều kiện giá']
    : ['Sàn', 'Listing', 'Biến thể', 'Ngành hàng', 'Giá (VND)', 'Số lượng', 'Đơn vị nguồn', 'Giá theo đơn vị chuẩn (VND)', 'Đơn vị chuẩn / cơ sở', 'Loại giá', 'Kỳ giá', 'Trạng thái', 'Nguồn', 'Điều kiện giá'];
  const cells = (row: Method['unitPrices'][number]): string[] => {
    const o = row.observation;
    return [o.platform === 'shopee' ? 'Shopee' : 'TikTok Shop', productLabel(o.listing), literal(o.variant, readerPlainText), literal(o.category.label, readerPlainText),
      number(o.price.value), number(o.quantity.value), escape(readerPlainText ? readerStoredOrJson(o.quantity.unit, 'Đơn vị được giữ trong hồ sơ đối chiếu') : o.quantity.unit), number(row.value), literal(row.standard, readerPlainText), prices[o.price.kind] ?? 'Loại giá được giữ trong hồ sơ đối chiếu',
      `${escape(readerPlainText ? readerStoredOrJson(o.period.start, 'Kỳ giá được giữ trong hồ sơ đối chiếu') : o.period.start)} đến ${escape(readerPlainText ? readerStoredOrJson(o.period.end, 'Kỳ giá được giữ trong hồ sơ đối chiếu') : o.period.end)}`, escape(row.missing === undefined || row.missing === null ? 'Khai báo đã đối chiếu bản lưu; chưa xác thực người bán' : readerPlainText ? readerPriceState(row.missing) : row.missing),
      (row.ownerDeclared ? 'Số lượng do chủ khai báo' : 'Quy cách trong bản lưu trang bán do người vận hành cung cấp') + row.sources.map(ref => mark(ref, citations, readerPlainText)).join(''),
      o.price.conditions.length ? o.price.conditions.map(value => literal(value, readerPlainText)).join('; ') : 'Không ghi điều kiện khuyến mãi'];
  };
  let html = [...groups.values()].map(group => table('Giá theo đơn vị chuẩn — sắp xếp tăng dần trong phạm vi tương thích', headings,
    [...group].sort((a, b) => a.value! - b.value! || a.rowI - b.rowI).map(cells))).join('');
  if (missing.length) html += table('Dòng chưa rõ — không đưa vào sắp xếp', headings, missing.map(cells));
  if (!method.unitPrices.length) html += readerPlainText ? '<p>Chưa quy đổi được giá theo đơn vị chuẩn vì nguồn chưa ghi rõ quy cách; báo cáo không đoán số lượng từ tiêu đề.</p>'
    : '<p>Chưa có biên nhận quy cách và giá tương thích đã xác minh cho bản nháp này. Chưa tính giá theo đơn vị chuẩn; không đoán số lượng từ tiêu đề.</p>';
  const observed = new Set(method.unitPrices.map(row => row.rowI));
  const absent = method.input.rows.filter(row => !observed.has(row.i));
  const metricBinding = method.binding.metric;
  // Workbook rows cite their saved sheet row; capture rows cite the retained
  // results-page snapshot row they were normalized from.
  const rowMark = (i: number): { sourceSha256: string; locator: string; label: string } | null => metricBinding === null ? null
    : 'kind' in metricBinding
      ? { sourceSha256: metricBinding.snapshotSha256, locator: `/groups/W12_topProducts/rows/${i}`, label: 'Dòng sản phẩm trong bản lưu capture' }
      : { sourceSha256: metricBinding.workbookSha256, locator: `Sheet1!A${i + 2}:T${i + 2}`, label: 'Dòng sản phẩm trong tệp đã lưu' };
  if (absent.length) html += table(readerPlainText ? 'Sản phẩm chưa có quy cách hoặc giá đã xác minh — không đưa vào sắp xếp' : 'Listing chưa có quy cách hoặc giá đã xác minh — không đưa vào sắp xếp', ['Sàn', readerPlainText ? 'Sản phẩm' : 'Listing', 'Tiêu đề nguồn', 'Trạng thái'],
    absent.map(row => {
      const sourceMark = rowMark(row.i);
      return [row.platform === 'shopee' ? 'Shopee' : 'TikTok Shop', productLabel(row.listing), literal(row.title, readerPlainText), 'Chưa rõ số lượng và giá niêm yết' +
        (sourceMark ? mark(sourceMark, citations, readerPlainText) : '')];
    }));
  const period = method.input.metric?.input.scope ?? null;
  // Owner reader: the sorting rules only matter when a standard-unit price table exists, and the advertising
  // reference has no cost or order field in Market input, so it is one plain line instead of a ROAS/CPA block.
  if (readerPlainText) {
    const reader = html + (method.unitPrices.length
    ? '<p>Chỉ so sánh giá trong cùng sàn, ngành hàng, đơn vị hoặc cơ sở, nhóm quy cách, loại giá, điều kiện và kỳ. Quy cách khác nhau (khối lượng, combo, hàng dùng lâu) giữ riêng, không chia nhỏ. Kỳ quan sát giá giữ riêng với kỳ doanh số.</p>' : '') +
    '<p>Giá niêm yết, thanh toán và khuyến mãi có điều kiện giữ riêng. Số doanh thu chia sản lượng bán (nếu có) chỉ là ước tính, không thay cho giá niêm yết. Đối chiếu khai báo với bản lưu không xác thực người bán; không suy chất lượng, giá vốn hoặc lợi nhuận.</p>' +
    '<p>Chưa có số liệu chi phí quảng cáo nên chưa tính ROAS (doanh thu trên chi phí quảng cáo) và CPA (chi phí cho mỗi đơn hàng).</p>' +
    '<p class="lim"><b>Chú thích:</b> Giá và quy cách được đối chiếu trong phạm vi bản lưu; phần thiếu giữ riêng và không được suy đoán.</p>';
    return capturedPrices && !method.unitPrices.length ? `<details class="evidence-trace"><summary>Quy cách và giá chưa xác minh</summary>${reader}</details>` : reader;
  }
  return html + '<p>Giá hiển thị tối đa ba chữ số thập phân; sắp xếp theo giá trị chưa làm tròn. Chỉ sắp xếp cùng sàn, ngành hàng, đơn vị hoặc cơ sở, nhóm quy cách, loại giá, điều kiện và kỳ. Khối lượng tịnh và khối lượng cái giữ riêng; hàng dùng lâu và combo không chia nhỏ. Kỳ quan sát giá giữ riêng với kỳ doanh số.</p><p>Giá niêm yết, thanh toán và khuyến mãi có điều kiện giữ riêng; không thay bằng giá bán trung bình từ doanh thu và đơn vị bán. Đối chiếu khai báo với bản lưu không xác thực người bán; không suy chất lượng, giá vốn hoặc lợi nhuận.</p>' +
    renderAutomationMarketAdvertising({ period: period ? { start: period.start, end: period.end } : null,
      object: { kind: 'video', label: 'chưa xác định trong đầu vào Market' },
      revenue: { value: null, source: null }, adCost: { value: null, source: null }, orders: { value: null, source: null },
      unavailableReason: 'Chưa có trường ROAS hoặc CPA với nguồn và ngữ nghĩa đã xác nhận; đầu vào Market chưa có trường chi phí quảng cáo và số đơn đã xác nhận', readerPlainText }) +
    '<p>Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế.</p>';
}
