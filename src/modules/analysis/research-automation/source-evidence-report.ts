import { checkSourceEvidence, type AutomationSourceEvidence } from './source-evidence.js';
const escape = (text: string): string => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!));
const reasonLabels: Record<string, string> = {
  EXCLUDED_TERM: 'Có từ thuộc danh sách loại trừ', EXCLUDED_CONTEXT: 'Ngữ cảnh thuộc danh sách loại trừ',
  UNRESOLVED_UNDIACRITICIZED: 'Viết không dấu, chưa đủ ngữ cảnh', UNLISTED_ACCENTED_LOOKALIKE: 'Dấu khác, chưa rõ đúng sản phẩm',
  NO_KEYWORD_MATCH: 'Chưa khớp từ khóa', EMPTY_TEXT: 'Không có nội dung để xác định nghĩa',
};
/** Deterministic method disclosure, not an AI interpretation. Original evidence text stays in retained artifacts. */
export function sourceEvidenceHtml(packet: AutomationSourceEvidence): string {
  checkSourceEvidence(packet);
  const missing = packet.unavailableReason === 'MODEL_NOT_CONFIGURED' ? 'Chưa cấu hình bước lập danh sách từ khóa.'
    : packet.unavailableReason === 'SALES_NAMES_UNAVAILABLE' ? 'Chưa có tên sản phẩm từ dữ liệu bán hàng đã xác minh.'
    : packet.unavailableReason ? 'Chưa giữ được danh sách từ khóa hợp lệ.' : null;
  const notice = missing ? `<p>${escape(missing)} Kết quả tìm kiếm được giữ trong hồ sơ nguồn; chưa dùng để đếm hoặc trích trong báo cáo.</p>`
    : `<p>Lọc nghĩa bằng danh sách từ khóa và loại trừ có phiên bản ${escape(packet.admission!.dataVersion)}. Bản ghi bị loại hoặc chưa rõ nghĩa không vào số đếm hay câu trích chính. Danh sách do AI lập từ tên sản phẩm trong dữ liệu bán hàng và phạm vi đã chốt, không phải quyết định của chủ.</p>`;
  const rows = packet.sourceAppendix.rows.map(row => `<tr><td>${escape(row.registryId)}</td><td>${escape(row.reportName)}${row.attribution && row.attribution !== row.reportName ? `<br>${escape(row.attribution)}` : ''}</td><td>${escape(row.tier ?? row.tierDetail ?? 'Chưa rõ hạng')}</td><td>${row.l9Excluded ?? 'Không áp dụng'}</td><td>${row.l9Unclear ?? 'Không áp dụng'}</td><td>${Object.entries(row.l9Reasons).map(([reason, count]) => `${escape(reasonLabels[reason] ?? 'Lý do được giữ trong hồ sơ nguồn')}: ${count}`).join('<br>') || 'Không có lý do loại được ghi'}</td><td>${row.l10SourceType === 'review-video' ? 'Bình luận dưới video review' : row.l10SourceType === 'seller-video' ? 'Bình luận dưới video bán hàng' : 'Không áp dụng'}</td></tr>`).join('');
  return `<div class="source-evidence"><h3>Nguồn đã dùng và kết quả lọc nghĩa</h3>${notice}<table><caption>Từng nguồn và bản lưu được dùng; không cộng số giữa các nguồn</caption><thead><tr><th>Mã nguồn</th><th>Tên trong báo cáo</th><th>Hạng</th><th>Bị loại</th><th>Chưa rõ nghĩa</th><th>Lý do</th><th>Loại bình luận</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Chưa có nguồn được dùng.</td></tr>'}</tbody></table></div>`;
}
