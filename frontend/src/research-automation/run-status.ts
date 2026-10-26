// Presentation only: lifecycle names are owned by the generated backend contract.
import type { ResearchAutomationRun, ResearchAutomationRunSummary } from './api';

export type RunPhase = 'searching' | 'scope' | 'running' | 'finished';

const phaseByStatus: Readonly<Record<string, RunPhase>> = {
  QUICK_SEARCH_QUEUED: 'searching', QUICK_SEARCH_RUNNING: 'searching',
  AWAITING_SCOPE: 'scope', COLLECTION_QUEUED: 'running', COLLECTING: 'running',
  RENDERING: 'running', CANCELLING: 'running', DRAFT_READY: 'finished',
  FAILED: 'finished', CANCELLED: 'finished', INTERRUPTED: 'finished',
};

const labels: Readonly<Record<string, string>> = {
  QUICK_SEARCH_QUEUED: 'Đang xếp hàng tìm nhanh', QUICK_SEARCH_RUNNING: 'Đang tìm nhanh sản phẩm thật',
  AWAITING_SCOPE: 'Chờ bạn duyệt phạm vi', COLLECTION_QUEUED: 'Đang xếp hàng thu thập',
  COLLECTING: 'Đang thu thập dữ liệu', RENDERING: 'Đang dựng bản nháp', CANCELLING: 'Đang dừng',
  DRAFT_READY: 'Đã có bản nháp', FAILED: 'Đã dừng do lỗi', CANCELLED: 'Đã hủy', INTERRUPTED: 'Đã gián đoạn',
};

const stepStates: Readonly<Record<string, string>> = {
  PENDING: 'Chưa chạy', QUEUED: 'Đang xếp hàng', RUNNING: 'Đang chạy', SUCCEEDED: 'Xong',
  PARTIAL: 'Một phần', UNAVAILABLE: 'Chưa hỗ trợ', FAILED: 'Lỗi', CANCELLED: 'Đã hủy',
  INTERRUPTED: 'Đã gián đoạn', SKIPPED: 'Bỏ qua',
};

const limitationLabels: Readonly<Record<string, string>> = {
  PUBLIC_REVIEW_NOT_CONFIGURED: 'Nguồn review công khai trên Shopee chưa sẵn sàng cho lượt đọc đã xác nhận.',
  PUBLIC_REVIEW_RAW_CAPTURE_ONLY: 'Số đánh giá không phải số người. Nội dung chưa được mã hóa.',
  PROVIDER_NOT_CONFIGURED: 'Nguồn dữ liệu chưa được kết nối trong runtime này.',
  PROVIDER_FAILED: 'Nguồn dữ liệu gặp lỗi; hệ thống không tự chạy lại.',
  PROVIDER_UNAVAILABLE: 'Máy chủ nguồn dữ liệu trả lỗi nên bước này dừng. Thường chỉ xảy ra một lần; tạo lượt mới để thử lại.',
  PROVIDER_CREDIT_EXHAUSTED: 'Nguồn số liệu bán hàng TikTok Shop đã hết lượt tra cứu. Cần nạp thêm lượt rồi chạy lại; hệ thống không tự chạy lại.',
  KALODATA_REPLAY_MISS: 'Bản chạy thử: không có dữ liệu bán hàng đã lưu cho yêu cầu này nên không gửi đi nguồn thật; phần số liệu đó bị thiếu.',
  KALODATA_REPLAY_SCOPE_MISMATCH: 'Bản chạy thử: từ khóa hoặc khoảng thời gian khác lần chạy gốc nên phiên đã dừng trước khi gọi nguồn.',
  PROVIDER_OUTPUT_INVALID: 'Dữ liệu nguồn không vượt qua kiểm tra; không có số liệu nào được suy diễn.',
  SCOPE_FILTERS_NOT_APPLIED: 'Định nghĩa và cụm từ đã lưu nhưng chưa được áp dụng bộ lọc ở phía nguồn trong phiên này.',
  STEP_TIMEOUT: 'Nguồn chạy quá thời hạn và đã được dừng; không tự chạy lại.',
  KALODATA_NOT_EXECUTED: 'Nguồn Kalodata chưa được chạy trong phiên này.',
  SERPAPI_NOT_EXECUTED: 'Tìm kiếm web chưa được chạy trong phiên này.',
  METRIC_MANUAL_EXPORT_REQUIRED: 'Số liệu Metric cần file xuất thủ công đã xác thực.',
  SHOPEE_PRODUCT_DETAIL_CONNECTOR_UNVERIFIED: 'Kết nối chi tiết sản phẩm Shopee chưa được xác minh.',
  PDF_RENDERER_NOT_CONFIGURED: 'Máy này chưa có bộ xuất PDF.',
  PDF_RENDER_FAILED: 'Bộ xuất PDF gặp lỗi; bản web không bị ảnh hưởng.',
  REPORT_RENDER_FAILED: 'Không dựng được bản nháp; dữ liệu đã thu vẫn được giữ lại.',
  CANCELLED_BY_OWNER: 'Phiên đã được chủ sở hữu hủy.',
  CANCELLED_DURING_PROVIDER_OPERATION: 'Phiên bị hủy khi nguồn đang chạy; chi phí thao tác đó chưa xác định.',
  OPERATOR_STOPPED: 'Operator đã dừng khi nguồn đang chạy; không tự chạy lại.',
  EXECUTOR_RESTARTED: 'Operator đã khởi động lại khi nguồn đang chạy; không tự chạy lại.',
  SKIPPED_AFTER_STOP: 'Bước này không chạy vì bước trước đã dừng.',
  NO_APPROVED_PRODUCT_REFS: 'Không có sản phẩm nào được duyệt nên chưa thu thập chi tiết sản phẩm theo kỳ.',
  EXACT_SHOPEE_REVIEWS_BLOCKED: 'Không lấy được đánh giá khách hàng Shopee. Báo cáo vẫn được tạo nhưng thiếu phần ý kiến khách hàng.',
  EXACT_SHOPEE_REVIEWS_TIMEOUT: 'Không lấy được đánh giá khách hàng Shopee. Báo cáo vẫn được tạo nhưng thiếu phần ý kiến khách hàng.',
  EXACT_SHOPEE_REVIEWS_PARTIAL: 'Chỉ lấy được đánh giá Shopee cho một phần sản phẩm. Phần ý kiến khách hàng trong báo cáo chưa đủ.',
  SHOPEE_LOGIN_REQUIRED: 'Bộ thu đánh giá Shopee mất đăng nhập Shopee nên chưa lấy được đánh giá. Vào trang lần chạy, bấm «Đăng nhập Shopee», rồi «Thu lại đánh giá».',
  SHOPEE_VERIFICATION_REQUIRED: 'Shopee yêu cầu xác minh phiên đăng nhập của bộ thu đánh giá Shopee nên chưa lấy được đánh giá. Vào trang lần chạy, bấm «Đăng nhập Shopee», rồi «Thu lại đánh giá».',
  SHOPEE_COLLECTOR_DOWN: 'Bộ thu đánh giá Shopee không phản hồi nên chưa lấy được đánh giá. Hệ thống không tự chạy lại; kiểm tra bộ thu rồi mở lại trang lần chạy.',
};

export function runPhase(status: ResearchAutomationRun['status'] | string): RunPhase { return phaseByStatus[status] ?? 'running'; }
export function statusLabel(status: string): string { return labels[status] ?? status; }
export function stepStateLabel(status: string): string { return stepStates[status] ?? status; }
export function shouldPoll(status: ResearchAutomationRun['status'] | string): boolean {
  const phase = phaseByStatus[status];
  return phase === undefined || phase === 'searching' || phase === 'running';
}
export function formatDay(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : iso;
}
export function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}
export function reportsLabel(reports: readonly string[]): string {
  const market = reports.includes('MARKET'), insight = reports.includes('INSIGHT');
  return market && insight ? 'Thị trường và Insight' : market ? 'Chỉ Thị trường' : insight ? 'Chỉ Insight' : 'Chưa chọn';
}
export function modeLabel(mode: string): string { return mode === 'PRODUCT' ? 'Sản phẩm cụ thể' : 'Khám phá ngành'; }
export function coverageStateLabel(state: string): string {
  return ({ COLLECTED: 'Đã thu thập', PARTIAL: 'Một phần', WAITING_FOR_INPUT: 'Chờ bổ sung', UNSUPPORTED: 'Chưa hỗ trợ', UNAVAILABLE: 'Nguồn chưa khả dụng', FAILED: 'Lỗi', CANCELLED: 'Đã hủy' } as Record<string, string>)[state] ?? state;
}
export function limitationLabel(code: string): string {
  if (limitationLabels[code]) return limitationLabels[code];
  if (code.startsWith('COVERAGE_')) return 'Độ phủ của nguồn chưa đủ cho bước này.';
  return 'Nguồn hoặc phương pháp chưa đủ điều kiện để hoàn thành phần này.';
}
export function providerLabel(provider: string | null): string {
  if (!provider) return '';
  return ({ KALODATA: 'Kalodata', SERPAPI: 'tìm kiếm web', METRIC: 'Metric', APIFY_SHOPEE: 'Shopee', SHOPEE_PUBLIC_REVIEW: 'bộ thu đánh giá Shopee' } as Record<string, string>)[provider.toUpperCase().replaceAll('-', '_')] ?? provider;
}
export function datasetLabel(dataset: string): string {
  return ({
    QUICK_SEARCH_PRODUCT_CARDS: 'Thẻ sản phẩm từ tìm nhanh',
    PRODUCT_PERIOD_DETAIL: 'Chi tiết sản phẩm theo kỳ',
    WEB_DISCOVERY_CURRENT: 'Kết quả tìm kiếm web hiện tại',
    METRIC_MARKET_EXPORT: 'Bản xuất Metric',
    SHOPEE_PRODUCT_DETAIL: 'Chi tiết sản phẩm Shopee',
    REVIEWS: 'Đánh giá công khai trên Shopee',
  } as Record<string, string>)[dataset.toUpperCase().replaceAll('-', '_')] ?? dataset;
}
export function pdfUnavailableLabel(reason: string | null): string {
  if (!reason) return 'chưa có lý do từ máy chủ';
  const normalized = reason.toLowerCase();
  if (normalized.includes('not configured')) return limitationLabel('PDF_RENDERER_NOT_CONFIGURED');
  if (normalized.includes('rendering failed')) return limitationLabel('PDF_RENDER_FAILED');
  return 'chưa thể xuất PDF trên máy này.';
}

/** Filter sessions by keyword and by "has a draft"; failed or cancelled sessions stay reachable by unchecking the box. */
export function filterHistory(runs: readonly ResearchAutomationRunSummary[], keyword: string, draftOnly: boolean): readonly ResearchAutomationRunSummary[] {
  const needle = keyword.trim().toLocaleLowerCase('vi');
  return runs.filter(item => (!draftOnly || item.status === 'DRAFT_READY') && (needle === '' || item.keyword.toLocaleLowerCase('vi').includes(needle)));
}

export interface FailureTodo {
  readonly failed: readonly string[];
  readonly usable: readonly string[];
  readonly next: readonly string[];
}

const todoStepNames: Readonly<Record<string, string>> = { QUICK_SEARCH: 'Tìm nhanh', COLLECTION: 'Thu thập', REPORT: 'Báo cáo' };

/** "Việc cần làm" for a stopped (failed or interrupted) session: what broke, what is still kept, who does what next. No provider names. */
export function failureTodo(run: Pick<ResearchAutomationRun, 'runId' | 'steps' | 'coverage'>, canWrite: boolean): FailureTodo {
  const failed = run.steps.filter(step => step.state === 'FAILED' || step.state === 'INTERRUPTED' || step.state === 'CANCELLED')
    .map(step => `${todoStepNames[step.stepId] ?? step.stepId}: ${stepStateLabel(step.state)}${step.code ? ` · ${limitationLabel(step.code)}` : ''}`);
  const full = run.coverage.sources.filter(source => source.state === 'COLLECTED').length;
  const part = run.coverage.sources.filter(source => source.state === 'PARTIAL').length;
  const usable = full + part === 0 ? [] : [`${full} nguồn đã thu thập xong${part > 0 ? `, ${part} nguồn thu được một phần` : ''}. Dữ liệu này được giữ lại.`];
  const next = canWrite
    ? ['Phần lỗi không tự chạy lại. Mở trang Nghiên cứu tự động để bắt đầu một phiên mới với cùng từ khóa.']
    : [`Bạn đang ở chế độ chỉ xem nên chưa bắt đầu được phiên mới. Gửi mã phiên ${run.runId} cho người có quyền OWNER để xử lý.`];
  return { failed, usable, next };
}
