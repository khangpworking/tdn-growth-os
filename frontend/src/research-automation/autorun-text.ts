// Owner-facing wording for the Market auto-run card (design section 6). Plain Vietnamese only:
// never name a data provider or the capture tool; only Shopee and TikTok Shop may be named.
// No percentages and no progress bar: the phase says enough.
// Self-contained (no imports) so the backend coverage test can load it next to the stop-code list;
// the card passes the generated `autoRun` type here, so a schema change still fails the typecheck.
export type AutoRunPhase = 'WAITING_SCOPE' | 'CAPTURE' | 'PREPARE' | 'PICK' | 'CONFIRM' | 'WAIT_DRAFT' | 'PRESENT' | 'DONE' | 'STOPPED';
export interface AutoRunView {
  readonly phase: AutoRunPhase;
  readonly state: 'QUEUED' | 'RUNNING';
  readonly stopCode?: string;
  readonly linksFound?: number;
  readonly canRetry: boolean;
}

/** Words that must never appear in owner-facing auto-run text. */
export const AUTORUN_DENY_LIST = ['Metric', 'Kalodata', 'TradeInt', 'Dami', 'Apify', 'SerpApi', 'OpenCLI', 'Chrome'] as const;

export const AUTORUN_FALLBACK_TEXT = 'Phần tự động đã dừng. Bạn có thể làm tiếp thủ công như trước.';

/**
 * The projection does not say whether a queued capture waits for another report's capture or only
 * for the worker, so a queued CAPTURE row uses one generic waiting text.
 */
export const AUTORUN_CAPTURE_QUEUED_TEXT = 'Đang chờ đến lượt tự lấy số liệu bán hàng Shopee và TikTok Shop. Nếu một báo cáo khác đang lấy số liệu, báo cáo này sẽ xếp hàng sau.';

const CHECKING = 'Đang kiểm tra số liệu và chọn 5 sản phẩm Shopee bán chạy.';

/** Text for every running phase; STOPPED uses the stop-code text below. */
export const AUTORUN_PHASE_TEXT: Readonly<Record<Exclude<AutoRunPhase, 'STOPPED'>, string>> = {
  WAITING_SCOPE: 'Đang chờ tìm sản phẩm xong để tự lấy số liệu.',
  CAPTURE: 'Đang tự lấy số liệu bán hàng Shopee và TikTok Shop (có thể mất đến 25 phút).',
  PREPARE: CHECKING,
  PICK: CHECKING,
  CONFIRM: CHECKING,
  WAIT_DRAFT: 'Đang viết báo cáo nháp.',
  PRESENT: 'Đang làm bìa và biểu đồ cho báo cáo.',
  DONE: 'Phần tự động đã xong: bản nháp, bìa và biểu đồ. Bản đọc để xem và duyệt nằm ở mục "Bản đọc" phía trên.',
};

/** An Insight-only run has no presentation phase: no cover and no charts. */
export const AUTORUN_INSIGHT_DONE_TEXT = 'Phần tự động đã xong: bản nháp. Bản đọc để xem và duyệt nằm ở mục "Bản đọc" phía trên.';

const LOGIN = 'Cần đăng nhập lại công cụ số liệu trên máy chạy. Báo cáo đã dừng, chưa tốn thêm lượt tra cứu.';
const DISABLED = 'Chế độ tự lấy số liệu đang tắt hoặc chưa cài đặt xong. Có thể làm thủ công như trước.';
const PERIOD = 'Khoảng thời gian của báo cáo không khớp 30 ngày gần nhất nên không tự lấy được.';
const FILTER = 'Bộ lọc tìm kiếm không áp dụng đúng. Số liệu không được dùng.';
const CHANGED = 'Trang số liệu đã thay đổi hoặc bộ công cụ không đúng phiên bản. Cần kỹ thuật kiểm tra.';
const INCOMPLETE = 'Số liệu thu được không đầy đủ hoặc không hợp lệ nên không được dùng.';
const INTERRUPTED = 'Lấy số liệu bị gián đoạn. Bấm "Thử lại" sẽ tốn thêm một lượt tra cứu.';
const OWNER = 'Bạn đã tự xác nhận hoặc chỉnh báo cáo, nên phần tự động dừng lại.';
const RUN_ENDED = 'Phiên nghiên cứu đã kết thúc hoặc bị hủy, nên phần tự động dừng lại.';
const STEP_FAILED = 'Bước tự kiểm tra số liệu chưa làm được. Bạn có thể làm tiếp thủ công như trước.';

/** Text for every stop code the auto-run can record. */
export const AUTORUN_STOP_TEXT: Readonly<Record<string, string>> = {
  // Capture runner and executor codes (the "Thử lại" family).
  METRIC_LOGIN_REQUIRED: LOGIN,
  METRIC_CAPTCHA: 'Trang số liệu yêu cầu xác minh người dùng. Cần người mở máy xử lý.',
  BRIDGE_DISCONNECTED: 'Trình duyệt trên máy chạy chưa kết nối. Cần mở lại trình duyệt rồi bấm "Thử lại".',
  EXECUTOR_DISABLED: DISABLED,
  EXECUTOR_NOT_CONFIGURED: DISABLED,
  METRIC_PERIOD_UNSUPPORTED: PERIOD,
  PERIOD_OUTSIDE_RUN: PERIOD,
  METRIC_FILTER_MISMATCH: FILTER,
  METRIC_SEARCH_NOT_APPLIED: FILTER,
  METRIC_UI_CHANGED: CHANGED,
  MANIFEST_HASH_MISMATCH: CHANGED,
  METRIC_ROW_CAP: INCOMPLETE,
  TIMEOUT: INTERRUPTED,
  CAPTURE_INTERRUPTED: INTERRUPTED,
  CAPTURE_INPUT_INVALID: INCOMPLETE,
  CAPTURE_IO_FAILED: INTERRUPTED,
  // Intake rejections and later automatic steps.
  CAPTURE_OVERSIZE: INCOMPLETE,
  CAPTURE_INVALID_JSON: INCOMPLETE,
  CAPTURE_SCHEMA_INVALID: INCOMPLETE,
  CAPTURE_MANIFEST_INVALID: INCOMPLETE,
  CAPTURE_GATE_NOT_CLEARED: INCOMPLETE,
  CAPTURE_DIGEST_MISMATCH: INCOMPLETE,
  CAPTURE_SCOPE_MISMATCH: INCOMPLETE,
  CAPTURE_PRODUCTS_MISSING: INCOMPLETE,
  CAPTURE_INTEGRITY_FAILED: INCOMPLETE,
  CAPTURE_FILES_MISSING: INCOMPLETE,
  CAPTURE_PREPARE_FAILED: STEP_FAILED,
  PICK_FAILED: STEP_FAILED,
  CONFIRM_FAILED: STEP_FAILED,
  CONFIRM_REJECTED: STEP_FAILED,
  NO_PRINCIPAL_PRODUCTS: 'Không có sản phẩm chính để xác nhận phạm vi.',
  SCOPE_CHANGED_BY_OWNER: OWNER,
  OWNER_REVISION_EXISTS: OWNER,
  PRESENTATION_FAILED: 'Báo cáo nháp đã có, nhưng chưa làm được bìa và biểu đồ.',
  RUN_FAILED: RUN_ENDED,
  RUN_CANCELLED: RUN_ENDED,
  RUN_INTERRUPTED: RUN_ENDED,
  CANCELLED: RUN_ENDED,
};

export function autoRunStopText(code: string | undefined): string {
  return code !== undefined && Object.hasOwn(AUTORUN_STOP_TEXT, code) ? AUTORUN_STOP_TEXT[code]! : AUTORUN_FALLBACK_TEXT;
}

/** Shown after PICK when fewer than five matching Shopee links were found. */
export function autoRunLinksText(found: number): string {
  return `Chỉ tìm được ${found}/5 liên kết Shopee phù hợp.`;
}

export const AUTORUN_RETRY_LABEL = 'Thử lại (dùng thêm một lượt tra cứu)';

/** The main line of the card for one projection. */
export function autoRunText(autoRun: AutoRunView, reports: readonly string[] = []): string {
  if (autoRun.phase === 'STOPPED') return autoRunStopText(autoRun.stopCode);
  if (autoRun.phase === 'DONE' && reports.includes('INSIGHT') && !reports.includes('MARKET')) return AUTORUN_INSIGHT_DONE_TEXT;
  if (autoRun.phase === 'CAPTURE' && autoRun.state === 'QUEUED') return AUTORUN_CAPTURE_QUEUED_TEXT;
  return AUTORUN_PHASE_TEXT[autoRun.phase] ?? AUTORUN_FALLBACK_TEXT;
}
