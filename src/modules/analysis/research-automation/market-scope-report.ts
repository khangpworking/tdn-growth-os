import type { AutomationReportInput } from './reports.js';
import { escapeHtml as escape } from './descriptive-report.js';

type Input = Pick<AutomationReportInput, 'start' | 'captures' | 'metricMethods' | 'metricClassified'>;

/** Presentation of verified retained inputs, not a new coverage or classification decision. */
export function projectMarketSourceScope(input: Input) {
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

type Scope = ReturnType<typeof projectMarketSourceScope>;
const code = (value: string): string => `<code>${escape(value)}</code>`;

export function marketSourceScopeSection(scope: Scope, section: 'M02' | 'M13'): string {
  const metric = scope.metric;
  if (section === 'M13') {
    if (!metric) return '<h3>Hồ sơ Metric</h3><p>Chưa có gói Metric đã xử lý trong bản báo cáo này; không có dấu vết tính toán Metric để đối chiếu.</p>';
    const files = Object.values(metric.sourceFiles).filter(file => file !== null);
    return `<h3>Hồ sơ Metric và phân loại</h3><dl><dt>Gói nguồn</dt><dd>${code(metric.sourcePackage.packageId)}</dd><dt>Nội dung nguồn</dt><dd>${code(metric.sourcePackage.packageContentSha256)}</dd><dt>Manifest nguồn</dt><dd>${code(metric.sourcePackage.manifestArtifactSha256)}</dd><dt>Chuẩn hóa đầu vào</dt><dd>${code(metric.preparationSha256)}</dd><dt>Gói phương pháp</dt><dd>${code(metric.methodPackage.packageId)}</dd></dl><ul>${files.map(file => `<li>${code(file.logicalPath)}: ${code(file.sha256)}. Xuất xứ ghi trong manifest: ${escape(file.providerProvenance)}.</li>`).join('')}</ul>${metric.classification
      ? `<p>Quy tắc đã chọn: ${code(metric.classification.adoptionId)}. Bằng chứng phân loại: ${code(metric.classification.proofSha256)}.</p><ul>${metric.classification.receiptIds.map(id => `<li>Biên nhận lựa chọn: ${code(id)}</li>`).join('')}</ul>`
      : '<p>Chưa có biên nhận phân loại được chọn cho bản báo cáo này.</p>'}<p>Kiểm tra tính toàn vẹn không chứng nhận nguồn do nhà cung cấp trực tiếp thu thập. Phân loại này chỉ áp dụng cho mẫu Metric.</p>`;
  }
  const metricContent = metric
    ? `<dl><dt>Kỳ khai báo trong nguồn</dt><dd>${escape(metric.declaredScope.start)} đến ${escape(metric.declaredScope.end)}</dd><dt>Nền tảng</dt><dd>${escape(metric.declaredScope.platform)}</dd><dt>Thời điểm lấy nguồn</dt><dd>${metric.declaredScope.acquiredAt === null ? 'Chưa xác nhận' : escape(metric.declaredScope.acquiredAt)}</dd><dt>Số dòng chuẩn hóa</dt><dd>${metric.sourceRowCount}</dd></dl><p>${metric.classification ? 'Đã áp dụng lựa chọn phân loại cho mẫu Metric của bản này.' : 'Chưa áp dụng phân loại đã duyệt; không suy CORE/WIDE từ từ khóa.'}</p><p>Kỳ này do nguồn khai báo, chưa được xác minh độc lập. Không kéo dài hoặc chia tỷ lệ số liệu để khớp kỳ yêu cầu.</p><details class="evidence-trace"><summary>Hồ sơ đối chiếu kỳ đo và trạng thái tính</summary><p>Căn cứ kỳ khai báo, nguyên văn: ${escape(metric.declaredScope.periodBasis)}</p><p>Trạng thái phép tính: ${metric.scopes.map(s => `${escape(s.scope.toUpperCase())}: ${escape(s.status)}`).join('; ')}.</p></details>`
    : '<p>Chưa có gói Metric đã xử lý trong bản này. Không xem thiếu nguồn là doanh số bằng 0.</p>';
  const queries = scope.queries.map(group => `<li><p>${escape(group.provider)} · ${escape(group.operation)} · ${group.step === 'QUICK_SEARCH' ? 'Tìm sản phẩm' : 'Thu dữ liệu'}: ${group.windows.length} khoảng truy vấn khác nhau, ${group.captures.length} bản thu${group.truncated ? '; có bản thu bị cắt' : ''}.</p><details><summary>Xem các khoảng đã truy vấn</summary><ul>${group.windows.map(w => `<li>${escape(w.startDate)} đến ${escape(w.endDate)}</li>`).join('')}</ul></details></li>`).join('');
  return `<h3>Phạm vi từng nguồn</h3><h4>Metric</h4>${metricContent}<h4>Truy vấn đã lưu</h4>${queries ? `<ul>${queries}</ul>` : '<p>Chưa có bản thu kèm khoảng truy vấn.</p>'}<p>Các khoảng trên là ngày gửi trong yêu cầu, không chứng minh nguồn có dữ liệu đo đủ cả kỳ hoặc các cửa sổ có thể cộng lại. Quy tắc phân loại Metric không tự áp dụng cho Kalodata, tìm kiếm hoặc review.</p><p>Kỳ chọn listing không giới hạn ngày đăng review. Ngày review phải kiểm tra riêng trong bằng chứng gốc.</p><a href="#M13">Đối chiếu nguồn và phương pháp tại M13</a>`;
}
