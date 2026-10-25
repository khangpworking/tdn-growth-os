/**
 * Plain-Vietnamese reasons the owner sees when a Reader publish fails a check
 * (owner Q2, 24/10/2026): never rule codes. Ops keep the ids in logs and in the
 * error's `cause`. One sentence per rule id; unknown ids fall back to one general line.
 */
const GATE: Readonly<Record<string, string>> = {
  G08_PROVIDER_NAME: 'Trang có tên nhà cung cấp số liệu hoặc công cụ.',
  U32_NO_CROSS_PLATFORM_TOTAL: 'Trang có tổng hai sàn thiếu nhãn «Cộng 2 sàn» hoặc thiếu số từng sàn đứng cạnh.',
  E2_NO_REVENUE_ORDER: 'Trang xếp hạng hoặc nói thị phần theo doanh thu.',
  SECTIONS_PRESENT: 'Trang thiếu hoặc lặp một phần của báo cáo.',
  M12_PROPOSAL_LABEL: 'Phương án trong phần đề xuất thiếu nhãn "đề xuất, chờ chủ duyệt".',
  PARTIAL_TOTAL_FORBIDDEN: 'Trang nêu một tổng còn thiếu thành phần như một con số đầy đủ.',
  NO_LEAK: 'Trang có đường dẫn máy, địa chỉ thư, khóa hoặc địa chỉ mạng nội bộ.',
  SEARCH_INTEREST_NOT_COUNT: 'Trang coi chỉ số quan tâm tìm kiếm là số lượt tìm hoặc tính chung với doanh số.',
  WORLD_BANK_NOT_ARITHMETIC: 'Trang tính hoặc so số liệu cả nước với doanh số mẫu.',
  PDF_EXCERPT_NOT_MARKET_NUMBER: 'Trang coi số trong trích đoạn tài liệu là quy mô thị trường hoặc ý kiến khách hàng.',
  SELLER_VIDEO_NOT_CUSTOMER_OR_TOTAL: 'Trang coi lời trong video bán hàng là ý kiến khách hàng, đã kiểm chứng, hoặc đem cộng với số liệu bán.',
  U13_SUPERLATIVE: 'Nhận định dùng so sánh nhất như "tốt nhất" hay "hàng đầu".',
  U13_PRIORITY: 'Thứ tự ưu tiên được nêu mà không ghi điều kiện phụ thuộc.',
  U13_PENDING_NUMBER: 'Số phân loại chưa duyệt thiếu nhãn "đề xuất, chờ chủ duyệt" trong cùng câu.',
  U13_METRIC_CODE: 'Trang hiện mã chỉ số như DT-1 hay GIA-2; báo cáo chỉ ghi tên chỉ số.',
  U13_REAL_PRICE: 'Trang dùng chữ «giá thật»; tên chỉ số là «giá bán trung bình».',
};
const FOURTEEN: Readonly<Record<string, string>> = {
  1: 'Thuật ngữ dùng trong trang chưa có giải thích trong bảng thuật ngữ.',
  2: 'Trang thiếu nhãn Phần/Phụ lục hoặc còn hiện mã kỹ thuật của phần.',
  3: 'Trang còn hiện mã hoặc tên kỹ thuật.',
  4: 'Trang có tên nhà cung cấp số liệu hoặc công cụ.',
  5: 'Chú thích chưa nằm trên dòng riêng.',
  7: 'Trang thiếu câu nêu cỡ mẫu, nêu cỡ mẫu sai, hoặc nêu quy mô thị trường.',
  9: 'Phần đề xuất thiếu bảng phương án, người phụ trách, hạn dd/mm/yyyy hoặc nhãn chờ duyệt.',
  10: 'Ảnh bìa không phải ảnh lưu sẵn hợp lệ.',
  11: 'Biểu đồ hoặc biểu tượng sàn chưa đúng mẫu.',
  12: 'Bảng số liệu chưa ghi rõ sàn.',
  13: 'Trang thiếu nhãn nguồn.',
};
const READER_LINT: Readonly<Record<string, string>> = {
  F0: 'Trang tải tài nguyên từ bên ngoài.',
  F1: 'Trang có tên nhà cung cấp số liệu.',
  F2: 'Hình hoặc bảng thiếu dòng "Nguồn:", hoặc chú thích lẫn vào dòng nguồn.',
  F3: 'Trang còn sót chữ máy như undefined, NaN hoặc null.',
  F5: 'Trang khẳng định toàn thị trường hoặc xếp hạng.',
  F6: 'Khuyến nghị hoặc phân loại thiếu nhãn "đề xuất, chờ chủ duyệt".',
  F7: 'Tham chiếu tới hình, bảng hoặc phần không có thật.',
  F8: 'Bìa không đúng mẫu.',
  W1: 'Số lấy từ trang web thiếu nhãn nguồn.',
  W2: 'Trang cộng trừ số mẫu với số trang web.',
  W3: 'Trang cộng gộp số của Shopee và TikTok Shop thành một tổng.',
  W4: 'Trang dùng từ "thị phần".',
  W5: 'Phần xu hướng có số dự báo.',
  W6: 'Nhãn thu thập có tên nhà cung cấp.',
  'Cấu trúc:': 'Trang thiếu một phần của báo cáo.',
};
const OTHER = 'Trang chưa đạt một kiểm tra trình bày.';
const unique = (values: readonly string[]): string[] => [...new Set(values)];

/** Reasons for a failed Market check, from its failure message (prefix plus ordered ids). */
export function marketCheckReasons(message: string): string[] {
  const [prefix = '', list = ''] = message.split(/:(.*)/su);
  const table = prefix === 'MARKET_14_RULES_FAILED' ? FOURTEEN : GATE;
  return unique(list.split(',').filter(Boolean).map(id => table[id] ?? OTHER));
}

/** Reasons for a failed Reader lint and number check (rule names start with their code). */
export function readerLintReasons(failedRules: readonly string[], hardcoded: number, notInBundle: number): string[] {
  return unique([
    ...failedRules.map(rule => READER_LINT[rule.startsWith('Cấu trúc:') ? 'Cấu trúc:' : rule.split(' ')[0] ?? ''] ?? GATE[rule] ?? OTHER),
    ...(hardcoded ? ['Có số viết tay trong mẫu trang thay vì lấy từ số liệu.'] : []),
    ...(notInBundle ? ['Có số trên trang không lấy được từ số liệu đã tính.'] : []),
  ]);
}
