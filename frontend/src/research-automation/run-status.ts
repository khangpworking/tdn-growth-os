// Presentation only: lifecycle names are owned by the generated backend contract.
import type { ResearchAutomationRun } from './api';

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
  PROVIDER_NOT_CONFIGURED: 'Nguồn dữ liệu chưa được kết nối trong runtime này.',
  PROVIDER_FAILED: 'Nguồn dữ liệu gặp lỗi; hệ thống không tự chạy lại.',
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
  return ({ KALODATA: 'Kalodata', SERPAPI: 'tìm kiếm web', METRIC: 'Metric', APIFY_SHOPEE: 'Shopee' } as Record<string, string>)[provider.toUpperCase().replaceAll('-', '_')] ?? provider;
}
export function datasetLabel(dataset: string): string {
  return ({
    QUICK_SEARCH_PRODUCT_CARDS: 'Thẻ sản phẩm từ tìm nhanh',
    PRODUCT_PERIOD_DETAIL: 'Chi tiết sản phẩm theo kỳ',
    WEB_DISCOVERY_CURRENT: 'Kết quả tìm kiếm web hiện tại',
    METRIC_MARKET_EXPORT: 'Bản xuất Metric',
    SHOPEE_PRODUCT_DETAIL: 'Chi tiết sản phẩm Shopee',
  } as Record<string, string>)[dataset.toUpperCase().replaceAll('-', '_')] ?? dataset;
}
export function pdfUnavailableLabel(reason: string | null): string {
  if (!reason) return 'chưa có lý do từ máy chủ';
  const normalized = reason.toLowerCase();
  if (normalized.includes('not configured')) return limitationLabel('PDF_RENDERER_NOT_CONFIGURED');
  if (normalized.includes('rendering failed')) return limitationLabel('PDF_RENDER_FAILED');
  return 'chưa thể xuất PDF trên máy này.';
}
