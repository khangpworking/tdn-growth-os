import type { AutomationReportInput } from './reports.js';
import { escapeHtml as escape, providerProvenanceLabel, readerSafe, storedLiteral, type ReportCitations } from './descriptive-report.js';
import { containsForbiddenProviderName } from '../citation-registry.js';
import type { AutomationMetricMethodSnapshot, CaptureMetricMethodDetails, MetricMethodSourceFile } from './metric-method-bridge.js';
import type { StartSnapshot } from './model.js';
import type { MarketTraceInput } from './market-trace-map.js';

type Input = Pick<AutomationReportInput, 'start' | 'captures' | 'metricMethods' | 'metricClassified'>;

/** Presentation of verified retained inputs, not a new coverage or classification decision. */
export function projectMarketSourceScope(input: Input): MarketSourceScope {
  const queries = new Map<string, { provider: string; operation: string; step: string;
    windows: Map<string, { startDate: string; endDate: string }>; captures: string[]; truncated: boolean }>();
  for (const capture of input.captures) {
    if (!capture.window) continue; // Credit/account checks are not research time coverage.
    const key = JSON.stringify([capture.provider, capture.operation, capture.stepId]);
    let group = queries.get(key);
    if (!group) {
      group = { provider: capture.provider, operation: capture.operation, step: capture.stepId,
        windows: new Map(), captures: [], truncated: false };
      queries.set(key, group);
    }
    group.windows.set(JSON.stringify([capture.window.startDate, capture.window.endDate]), { ...capture.window });
    group.captures.push(capture.artifactSha256);
    group.truncated ||= capture.truncated;
  }
  const metric = input.metricMethods;
  const classified = metric ? input.metricClassified : undefined;
  return {
    requestedPeriod: { ...input.start.requestedPeriod },
    metric: metric ? {
      declaredScope: metric.result.input.scope,
      sourcePackage: metric.originalSourcePackage,
      methodPackage: metric.sourcePackage,
      preparationSha256: metric.preparation.preparationSha256,
      sourceRowCount: metric.preparation.normalizedInput.rowCount,
      sourceFiles: metric.preparation.selectedSources,
      classification: classified ? { adoptionId: classified.selection.adoptionId,
        receiptIds: classified.selection.receiptIds, proofSha256: classified.proofSha256 } : null,
      scopes: (classified?.result ?? metric.result).scopes.map(scope => ({ scope: scope.key, status: scope.status })),
    } : null,
    queries: [...queries.values()].map(group => ({ ...group, windows: [...group.windows.values()].sort((a, b) =>
      a.startDate < b.startDate ? -1 : a.startDate > b.startDate ? 1 : a.endDate < b.endDate ? -1 : a.endDate > b.endDate ? 1 : 0) })),
    measuredCoverage: 'NOT_ESTABLISHED_BY_QUERY_WINDOWS' as const,
    reviewDateConstraint: 'NOT_ESTABLISHED_BY_LISTING_SELECTION_PERIOD' as const,
  };
}

/** Presentation-only projection of verified retained Market inputs; see `projectMarketSourceScope`. */
export interface MarketSourceScope {
  readonly requestedPeriod: StartSnapshot['requestedPeriod'];
  readonly metric: {
    readonly declaredScope: AutomationMetricMethodSnapshot['result']['input']['scope'];
    readonly sourcePackage: AutomationMetricMethodSnapshot['originalSourcePackage'];
    readonly methodPackage: AutomationMetricMethodSnapshot['sourcePackage'];
    readonly preparationSha256: string;
    readonly sourceRowCount: number;
    readonly sourceFiles: Readonly<Record<string, MetricMethodSourceFile | null>>;
    readonly classification: { readonly adoptionId: string; readonly receiptIds: readonly string[]; readonly proofSha256: string } | null;
    readonly scopes: readonly { readonly scope: string; readonly status: string }[];
  } | null;
  readonly queries: readonly {
    readonly provider: string; readonly operation: string; readonly step: string;
    readonly windows: readonly { readonly startDate: string; readonly endDate: string }[];
    readonly captures: readonly string[]; readonly truncated: boolean;
  }[];
  readonly measuredCoverage: 'NOT_ESTABLISHED_BY_QUERY_WINDOWS';
  readonly reviewDateConstraint: 'NOT_ESTABLISHED_BY_LISTING_SELECTION_PERIOD';
}

const code = (value: string): string => `<code>${containsForbiddenProviderName(value) ? 'Tham chiếu kỹ thuật được giữ trong bản lưu nguồn' : escape(value)}</code>`;
const stepLabel = (step: string): string => step === 'QUICK_SEARCH' ? 'Tìm sản phẩm' : 'Thu dữ liệu';
const periodBasisLabel = (value: string): string => value === 'Kỳ bộ lọc của results-page capture; giữ nguyên, không tự kéo dài hoặc chia tỷ lệ.'
  ? 'Kỳ lọc của bảng kết quả tìm kiếm đã lưu; giữ nguyên, không tự kéo dài hoặc chia tỷ lệ.'
  : storedLiteral(value, 'Căn cứ kỳ được giữ trong bản lưu nguồn');

const PLATFORM_LABELS = { shopee: 'Shopee', tiktok: 'TikTok Shop' } as const;
const isoDay = (value: string): string => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
};
const vietnamDay = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric' });
const acquiredDay = (value: string | null): string => {
  const time = value === null ? Number.NaN : Date.parse(value);
  return Number.isNaN(time) ? 'chưa xác nhận ngày lấy' : `lấy ngày ${vietnamDay.format(time)}`;
};

/** Reader lines of a results-page capture: one per platform, read separately (never summed). */
function capturePlatformScope(capture: CaptureMetricMethodDetails): string {
  const results = new Map(capture.platforms.map(entry => [entry.platform, entry.result] as const));
  const lines = capture.capture.platforms.map(platform => {
    const result = results.get(platform);
    const removed = capture.rowPolicyVersion === 'automation-metric-capture-v3' ? (capture.excludedRows ?? []).filter(row => row.platform === platform).length : 0;
    const removedNote = removed ? `; đã loại ${removed} dòng trước khi tính` : '';
    return result && result.input.records.length
      ? `<li>${PLATFORM_LABELS[platform]}: ${escape(acquiredDay(result.input.scope.acquiredAt))}; ${result.input.records.length} dòng sản phẩm; kỳ ${escape(isoDay(result.input.scope.start))} đến ${escape(isoDay(result.input.scope.end))}${removedNote}.</li>`
      : `<li>${PLATFORM_LABELS[platform]}: ${removed ? `không còn dòng phù hợp sau khi lọc${removedNote}` : 'chưa có dòng nào gán được cho sàn này'}.</li>`;
  });
  const unattributed = capture.unattributedRows.length
    ? `<p>${capture.unattributedRows.length} dòng không ghi rõ sàn nên không dùng trong số liệu; các dòng này được giữ trong hồ sơ đối chiếu.</p>` : '';
  return `<ul>${lines.join('')}</ul>${unattributed}`;
}

/** Plain statement of what a filtered capture sample holds; per-platform removed counts sit in the lines above. */
export function captureSampleSentence(capture: CaptureMetricMethodDetails): string {
  const rows = capture.excludedRows ?? [];
  const current = capture.rowPolicyVersion === 'automation-metric-capture-v3';
  const reasons = [...(rows.some(row => row.reason === 'NOT_MAIN_PRODUCT') ? [current ? 'dòng có dấu hiệu nằm ngoài nhóm sản phẩm đang xét' : 'phụ kiện, linh kiện hoặc sản phẩm khác'] : []),
    ...(rows.some(row => row.reason !== 'NOT_MAIN_PRODUCT') ? ['dòng có doanh thu hoặc đơn vị bán bất thường'] : [])];
  const removed = reasons.length ? `đã loại ${reasons.join(' và ')} trước khi tính` : current ? '' : 'không có dòng nào phải loại trước khi tính';
  const withheld = 'Từ khóa được giữ trong bản lưu';
  const keyword = containsForbiddenProviderName(capture.capture.keyword)
    ? withheld : storedLiteral(capture.capture.keyword, withheld, true);
  return `Mẫu gồm các sản phẩm trả về cho từ khóa “${keyword}”${removed ? `; ${removed}` : ''}; chưa chia nhóm sản phẩm.`;
}

/** Search settings the market capture ran with, as the run record holds them. */
export interface MarketCaptureScope {
  readonly keywords: readonly string[];
  /** Smart query (expanded search); null when the run record does not say. */
  readonly smartQuery: boolean | null;
  /** Category step hook: the chosen category, or the note kept when none was chosen. Absent until that step records one. */
  readonly category?: MarketCaptureCategory | null;
}

export type MarketCaptureCategory = (
  | { readonly chosen: string; readonly note?: undefined }
  | { readonly chosen: null; readonly note: string }) & {
  /** Capture pointer of the category text, so numbers inside it can be traced. */
  readonly source?: MarketTraceInput;
};

/**
 * Records the numbers inside a stored text before it is printed (`part` and `index` name the text);
 * returns the text to print, or null when its numbers have no pointer, so the text is withheld.
 */
export type MarketScopeTextTrace = (text: string, part: 'keyword' | 'category', index: number) => string | null;

/** Hook for the category step: the category line of the scope, or an unknown state while the run record has none. */
export function marketCaptureCategoryText(category: MarketCaptureCategory | null | undefined, trace?: MarketScopeTextTrace): string {
  const withheld = 'Ngành được giữ trong bản lưu';
  const text = (value: string): string => {
    const traced = containsForbiddenProviderName(value) ? null : trace ? trace(value, 'category', 0) : value;
    return traced === null ? withheld : escape(traced);
  };
  if (!category) return 'Ngành: chưa có trong bản lưu.';
  if (category.chosen !== null) return `Ngành: ${text(category.chosen)}.`;
  return `Ngành: chưa chọn. ${text(category.note)}`;
}

/** Scope line of the market numbers: keywords, expanded search, category. */
export function marketCaptureScopeLine(scope: MarketCaptureScope, trace?: MarketScopeTextTrace): string {
  const withheld = 'Từ khóa được giữ trong bản lưu';
  const keywords = scope.keywords.map((keyword, i) => {
    const traced = containsForbiddenProviderName(keyword) ? null : trace ? trace(keyword, 'keyword', i) : keyword;
    return `“<span data-quote>${traced === null ? withheld : escape(traced)}</span>”`;
  }).join(', ');
  const expanded = scope.smartQuery === true ? 'bật tìm mở rộng' : scope.smartQuery === false ? 'tắt tìm mở rộng, chỉ khớp đúng cụm từ' : 'chưa rõ có bật tìm mở rộng';
  return `<p class="market-capture-scope">Từ khóa: ${keywords || 'chưa có trong bản lưu'}; ${expanded}. ${marketCaptureCategoryText(scope.category, trace)}</p>`;
}

export interface MarketSourceScopeOptions {
  readonly reviewsPresent?: boolean;
  readonly currentReader?: boolean;
}

export function marketSourceScopeSection(scope: MarketSourceScope, section: 'M02' | 'M13', citations: ReportCitations, readerPlainText = false,
  capture?: CaptureMetricMethodDetails, { reviewsPresent, currentReader = false }: MarketSourceScopeOptions = {}): string {
  const metric = scope.metric;
  if (section === 'M13') {
    if (!metric) return '<details class="evidence-trace"><summary>Hồ sơ đối chiếu nguồn số liệu</summary><p>Chưa có gói số liệu đã xử lý trong bản báo cáo này; không có dấu vết tính toán để đối chiếu.</p></details>';
    const files = Object.values(metric.sourceFiles).filter(file => file !== null);
    // Keep archive paths in sourceScope's retained semantic, not reader prose.
    // Project only this metadata field; never replace text in source quotations.
    const fileLabel = (file: MetricMethodSourceFile): string => (citations.readerPlainText ?? readerPlainText) && !readerSafe(file.logicalPath)
      ? 'Tệp được giữ trong bản lưu nguồn' : code(file.logicalPath);
    return `<details class="evidence-trace"><summary>Hồ sơ đối chiếu nguồn số liệu và phân loại</summary><dl><dt>Gói nguồn</dt><dd>${code(metric.sourcePackage.packageId)}</dd><dt>Nội dung nguồn</dt><dd>${code(metric.sourcePackage.packageContentSha256)}</dd><dt>Bản kê nguồn</dt><dd>${code(metric.sourcePackage.manifestArtifactSha256)}</dd><dt>Chuẩn hóa đầu vào</dt><dd>${code(metric.preparationSha256)}</dd><dt>Gói phương pháp</dt><dd>${code(metric.methodPackage.packageId)}</dd></dl><ul>${files.map(file => `<li>${fileLabel(file)}: ${code(file.sha256)}. Xuất xứ ghi trong bản kê nguồn: ${escape(providerProvenanceLabel(file.providerProvenance))}.</li>`).join('')}</ul>${metric.classification
      ? `<p>Quy tắc đã chọn: ${code(metric.classification.adoptionId)}. Bằng chứng phân loại: ${code(metric.classification.proofSha256)}.</p><ul>${metric.classification.receiptIds.map(id => `<li>Biên nhận lựa chọn: ${code(id)}</li>`).join('')}</ul>`
      : '<p>Chưa có biên nhận phân loại được chọn cho bản báo cáo này.</p>'}<p>Kiểm tra tính toàn vẹn không chứng nhận nguồn do nhà cung cấp trực tiếp thu thập. Phân loại này chỉ áp dụng cho mẫu số liệu.</p></details>`;
  }
  const declared = metric
    ? `<dl><dt>Kỳ khai báo trong nguồn</dt><dd>${escape(metric.declaredScope.start)} đến ${escape(metric.declaredScope.end)}</dd><dt>Nền tảng</dt><dd>${escape(metric.declaredScope.platform)}</dd><dt>Thời điểm lấy nguồn</dt><dd>${metric.declaredScope.acquiredAt === null ? 'Chưa xác nhận' : escape(metric.declaredScope.acquiredAt)}</dd><dt>Số dòng chuẩn hóa</dt><dd>${metric.sourceRowCount}</dd></dl>` : '';
  const metricContent = metric
    ? `${capture ? capturePlatformScope(capture) : declared}<p>${metric.classification ? 'Đã áp dụng lựa chọn phân loại cho mẫu số liệu của bản này.' : capture?.rowPolicyVersion === 'automation-metric-capture-v3' ? captureSampleSentence(capture) : 'Chưa áp dụng phân loại đã duyệt; không suy phạm vi rộng hoặc phạm vi cốt lõi từ từ khóa.'}</p><p>Kỳ này do nguồn khai báo, chưa được xác minh độc lập. Không kéo dài hoặc chia tỷ lệ số liệu để khớp kỳ yêu cầu.</p><details class="evidence-trace"><summary>Hồ sơ đối chiếu kỳ đo và trạng thái tính</summary>${capture ? declared : ''}<p>Căn cứ kỳ khai báo, nguyên văn: ${periodBasisLabel(metric.declaredScope.periodBasis)}</p><p>Trạng thái phép tính: ${metric.scopes.map(s => `${escape(s.scope.toUpperCase())}: ${escape(s.status)}`).join('; ')}.</p></details>`
    : `<p>Chưa có gói số liệu đã xử lý trong bản này. Không xem thiếu nguồn là doanh số bằng ${currentReader ? 'không' : '0'}.</p>`;
  const queries = scope.queries.map(group => `<li><p>${stepLabel(group.step)}: ${group.windows.length} khoảng truy vấn khác nhau, ${group.captures.length} bản thu${group.truncated ? '; có bản thu bị cắt' : ''}.</p><details><summary>Xem các khoảng đã truy vấn</summary><ul>${group.windows.map(w => `<li>${escape(w.startDate)} đến ${escape(w.endDate)}</li>`).join('')}</ul></details><details><summary>Xem dấu vết các bản thu của nhóm này</summary><ul>${group.captures.map(sha => `<li>${citations.mark({ sourceKind: 'CAPTURE', identity: sha, locator: null, label: 'Bản thu dữ liệu nguồn',
    retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE', technical: { step: group.step } })}</li>`).join('')}</ul></details></li>`).join('');
  const queryList = `<h4>Truy vấn đã lưu</h4>${queries ? `<ul>${queries}</ul>` : '<p>Chưa có bản thu kèm khoảng truy vấn.</p>'}<p>Các khoảng trên là ngày gửi trong yêu cầu, không chứng minh nguồn có dữ liệu đo đủ cả kỳ hoặc các cửa sổ có thể cộng lại. Quy tắc phân loại của nguồn số liệu không tự áp dụng cho nguồn sàn khác, tìm kiếm hoặc review.</p>`;
  // A results-page capture states how the rows were taken; the query log stays in the technical copy.
  const queryContent = capture
    ? `<h4>Cách lấy dữ liệu</h4><p>Hệ thống tìm sản phẩm theo từ khóa và lưu bảng kết quả của từng sàn trong kỳ đã chọn; nhật ký truy vấn được giữ trong hồ sơ đối chiếu.</p><details class="evidence-trace"><summary>Nhật ký truy vấn đã lưu</summary>${queryList}</details>`
    : queryList;
  return `<h3>Phạm vi từng nguồn</h3><h4>Số liệu nguồn</h4>${metricContent}${queryContent}${reviewsPresent === false ? '' : '<p>Kỳ chọn listing không giới hạn ngày đăng review. Ngày review phải kiểm tra riêng trong bằng chứng gốc.</p>'}<a href="#M13">Đối chiếu nguồn và phương pháp tại M13</a>`;
}
