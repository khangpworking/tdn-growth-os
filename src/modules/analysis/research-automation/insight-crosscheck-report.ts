import type { InsightCrosscheckSnapshot } from '../../../../contracts/analysis/automation-insight-crosscheck.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { escapeHtml, storedLiteral, technicalLiteral } from './descriptive-report.js';

/** Raw evidence beside raw evidence. It never aligns annotations, computes agreement or declares release. */
export function insightCrosscheckAppendix(snapshot: InsightCrosscheckSnapshot): string {
  const firstModels = [...new Set(snapshot.plan.firstExecutions.map(row => `${row.configuration.providerId}/${row.configuration.modelId}`))];
  return `<details open id="insight-crosscheck-evidence"><summary>Mẫu mã hóa bởi model thứ hai: hai kết quả và khác biệt nguyên dạng</summary>
    <p class="warning">Đề xuất AI chờ xem xét. Chưa có thống kê kiểm chéo U11; chưa được duyệt hay phát hành. Danh sách dưới đây giữ nguyên thứ tự và trường của hai lượt, chưa ghép cặp hay phân xử các nhãn.</p>
    <p>Mẫu gồm ${snapshot.plan.sample.length} bản ghi nguồn đủ điều kiện trong ${snapshot.plan.eligible.length} bản ghi. Hạt và danh sách mẫu đã lưu trước lượt thứ hai; thử lại giữ đúng mẫu.</p>
    <p>Model lượt đầu: ${escapeHtml(firstModels.join('; '))}. Model thứ hai: ${escapeHtml(`${snapshot.plan.secondConfiguration.providerId}/${snapshot.plan.secondConfiguration.modelId}`)}.</p>
    <p>Lượt đầu giữ nguyên artifact đầu ra đã lưu; hệ thống cũ chưa lưu văn bản phản hồi trên đường truyền. Lượt thứ hai giữ nguyên văn bản phản hồi hợp lệ. Mục vắng mặt vẫn là thiếu đề xuất, không phải kết luận âm đã duyệt.</p>
    <details><summary>Định danh mẫu và xuất xứ thực thi đã lưu</summary>${technicalLiteral(canonicalJson({ request: snapshot.request, plan: snapshot.plan, secondExecutions: snapshot.secondExecutions }))}</details>
    ${snapshot.literalRows.map(row => `<details><summary>Bản ghi nguồn ${row.recordIndex + 1}: ${row.literalDifferences.length ? 'có khác biệt nguyên dạng' : 'hai danh sách nguyên dạng bằng nhau'}</summary>
      <p>Nguồn ${technicalLiteral(row.sourceSha256)} · Vị trí ${technicalLiteral(row.locator)}</p>
      <blockquote>${storedLiteral(row.text, 'Nguyên văn được giữ trong artifact nguồn; không đưa vào bản đọc này.')}</blockquote>
      <table><thead><tr><th>Lượt đầu — đề xuất AI chờ xem xét</th><th>Lượt thứ hai — đề xuất AI chờ xem xét</th></tr></thead><tbody><tr><td><pre data-quote>${technicalLiteral(canonicalJson(row.first))}</pre></td><td><pre data-quote>${technicalLiteral(canonicalJson(row.second))}</pre></td></tr></tbody></table>
      <p>Các danh sách khác nguyên dạng: ${technicalLiteral(row.literalDifferences.join(', ') || 'không có')}. Đây là đối chiếu biểu diễn, chưa phải mức đồng thuận về nghĩa hay thống kê.</p></details>`).join('')}
    </details>`;
}
