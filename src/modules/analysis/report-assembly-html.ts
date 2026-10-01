import type { ReportAssemblySnapshot } from '../../../contracts/analysis/report-assembly-snapshot.generated.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import type { VerifiedSectionArtifactRetention } from './section-artifact-retention-ledger.js';
import { renderResearchReportHtml } from './research-report-html.js';

const READINESS_ANCHOR = '<section id="readiness">';
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);
const scopeName = { all: 'ALL · Toàn bộ file', wide: 'WIDE · Phạm vi rộng', core: 'CORE · Nhóm lõi' };
const fallbackLabel = {
  BLOCKED: 'Cần thêm dữ liệu', METHOD_ONLY: 'Mới có phương pháp',
  MANUAL_REVIEW_REQUIRED: 'Cần người xem xét', NOT_IMPLEMENTED: 'Chưa triển khai phương pháp',
};
const readinessLabel = {
  READY_TO_CALCULATE: 'Đủ điều kiện tính', BLOCKED: 'Thiếu điều kiện', INVALID: 'Đầu vào không hợp lệ',
};
type Total = ReportAssemblySnapshot['m03']['scopeTotals'][number]['revenue'];

function totalHtml(total: Total, unit: string): string {
  const value = total.value === null ? 'Thiếu' : (() => {
    const [whole, decimal] = total.value.split('.');
    return `${escape(whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))}${decimal === undefined ? '' : `,${escape(decimal)}`} ${escape(unit)}`;
  })();
  const coverage = `${total.observedCount} dòng có số liệu; ${total.missingCount} dòng thiếu`;
  const zero = total.value === '0' && total.observedCount > 0 ? '<br><small>Tổng quan sát bằng 0, không phải thiếu dữ liệu.</small>' : '';
  const partial = total.missingCount > 0 ? '<br><small>Tổng chỉ gồm các dòng có số liệu.</small>' : '';
  const precision = total.nonExactCount > 0 ? `<br><small>${total.nonExactCount} dòng chưa xác nhận độ chính xác.</small>` : '';
  return `${value}<br><small>${coverage}</small>${zero}${partial}${precision}`;
}

function scopeTotalsRows(totals: ReportAssemblySnapshot['m03']['scopeTotals']): string {
  return totals.map(scope => `<tr><th scope="row">${escape(scopeName[scope.key])}</th><td>${scope.listingCount}</td><td>${scope.shopCount}</td><td>${totalHtml(scope.revenue, 'VND')}</td><td>${totalHtml(scope.units, 'đơn vị')}</td></tr>`).join('');
}

function partialExplanation(section: ReportAssemblySnapshot['sections'][number]): string {
  if (!section.readinessBlockedWhileMaterialized) return 'Xem giới hạn và đầu vào ở phần điều kiện từng mục.';
  if (section.sectionId === 'M08') return 'Có phép chuẩn hóa từ báo giá bổ sung. Kiểm tra bộ dữ liệu chuẩn bị chưa bao gồm đầu vào bổ sung này; phạm vi M08 đầy đủ vẫn chưa được thực hiện.';
  if (section.sectionId === 'I03') return 'Có hồ sơ cách xử lý nguồn. Chưa có đầy đủ đầu vào nghiên cứu người tiêu dùng.';
  return 'Có đầu ra một phần; các điều kiện cho toàn bộ phương pháp vẫn chưa đủ.';
}

function sectionRows(sections: ReportAssemblySnapshot['sections']): string {
  return sections.map(section => `<tr id="assembly-${escape(section.sectionId)}"><th scope="row">${escape(section.sectionId)}<br><small>${escape(section.title)}</small></th><td>${section.materialization.materialized ? 'Có đầu ra một phần' : 'Chưa có đầu ra'}</td><td>${escape(readinessLabel[section.readiness.state])}</td><td>${escape(fallbackLabel[section.catalog.fallbackState])}</td><td>${escape(partialExplanation(section))}</td></tr>`).join('');
}

function memberRow(label: string, member: ReportAssemblySnapshot['m03']['members']['metricSet']): string {
  return `<dt>${escape(label)}</dt><dd><code>${escape(member.artifactSha256)}</code> · ${member.byteSize} byte</dd>`;
}

function assemblyPanel(snapshot: ReportAssemblySnapshot, retainedM03: VerifiedSectionArtifactRetention): string {
  const partialCount = snapshot.sections.filter(section => section.materialization.materialized).length;
  return `<section id="assembly">
<h2>Phạm vi nội dung của bản nháp</h2>
<p>${partialCount} / ${snapshot.sections.length} mục có đầu ra từng phần. Đây không phải số mục đã hoàn tất. Bản nháp chưa có nhận định AI, chưa được duyệt và chưa được phép công bố.</p>
<details><summary>Xem trạng thái ${snapshot.sections.length} mục</summary>
<p>Đầu ra đã có, điều kiện đầu vào và trạng thái trong khung phương pháp là ba thông tin riêng. Hồ sơ phương pháp hoặc phép tính giới hạn chưa thay thế được nghiên cứu đầy đủ.</p>
<div class="table-wrap" role="region" aria-label="Trạng thái nội dung từng mục" tabindex="0"><table><thead><tr><th>Mục</th><th>Đầu ra trong bản này</th><th>Kiểm tra bộ dữ liệu chuẩn bị</th><th>Trạng thái gốc trong khung</th><th>Giới hạn</th></tr></thead><tbody>${sectionRows(snapshot.sections)}</tbody></table></div>
<p><a href="#readiness">Xem điều kiện còn thiếu của từng mục</a></p></details>
<details><summary>Đối chiếu số liệu M03 đã lưu</summary>
<p>Các tổng dưới đây khớp với bản M03 đã lưu. ALL, WIDE và CORE giao nhau, không cộng ba phạm vi lại. Tổng quan sát không đại diện cho toàn thị trường.</p>
<div class="table-wrap" role="region" aria-label="Số liệu M03 đã lưu theo phạm vi" tabindex="0"><table><thead><tr><th>Phạm vi</th><th>Listing</th><th>Shop</th><th>Doanh thu quan sát</th><th>Sản lượng quan sát</th></tr></thead><tbody>${scopeTotalsRows(snapshot.m03.scopeTotals)}</tbody></table></div></details>
<details><summary>Mã truy vết và bản chụp dữ liệu</summary>
<p>Các mã này dùng để kiểm tra đúng phiên bản và nội dung đã lưu, không chứng nhận độ tin cậy của nhà cung cấp.</p>
<dl><dt>Bản chụp báo cáo</dt><dd><code>${escape(snapshot.assemblySha256)}</code></dd>
<dt>Bộ dữ liệu chuẩn bị</dt><dd><code>${escape(snapshot.preparationSha256)}</code></dd>
<dt>Kiểm tra điều kiện</dt><dd><code>${escape(snapshot.readinessSha256)}</code></dd>
<dt>Khung phương pháp</dt><dd>${escape(snapshot.catalog.catalogId)} · ${escape(snapshot.catalog.catalogVersion)}<br><code>${escape(snapshot.catalog.sha256)}</code></dd>
<dt>Workspace</dt><dd><code>${escape(snapshot.source.workspaceId)}</code></dd>
<dt>Gói nguồn</dt><dd><code>${escape(snapshot.source.sourcePackageId)}</code></dd>
<dt>Chính sách nhãn</dt><dd>${escape(snapshot.source.labelPolicy.codebookVersion)} · UNKNOWN ${snapshot.source.labelPolicy.wideUnknownPolicy === 'exclude' ? 'vẫn có trong ALL và không tính vào WIDE' : 'được tính vào WIDE'}.</dd>
<dt>Bản M03 đã lưu</dt><dd><code>${escape(retainedM03.record.sectionArtifactSha256)}</code></dd>
${memberRow('Metric set', retainedM03.record.members.metricSet)}${memberRow('Chart bundle', retainedM03.record.members.chartBundle)}${memberRow('Evidence envelope', retainedM03.record.members.envelope)}${memberRow('Factual narrative', retainedM03.record.members.narrative)}${memberRow('Receipt', retainedM03.record.members.receipt)}${memberRow('HTML', retainedM03.record.members.html)}</dl>
<p><a href="assembly-snapshot.json" download>Tải bản chụp dữ liệu báo cáo (JSON)</a></p></details>
</section>`;
}

/** Keep the existing charts first; disclose preparation detail before section prerequisites. */
export function renderReportAssemblyHtml(inputs: {
  readonly bundle: SourceBackedReportBundle;
  readonly snapshot: ReportAssemblySnapshot;
  readonly retainedM03: VerifiedSectionArtifactRetention;
  readonly semanticVersionId?: string;
}): string {
  const { bundle, snapshot, retainedM03, semanticVersionId } = inputs;
  const parts = renderResearchReportHtml(bundle, semanticVersionId).split(READINESS_ANCHOR);
  if (parts.length !== 2) throw new TypeError('report assembly HTML: READINESS_ANCHOR_MISMATCH');
  return `${parts[0]}${assemblyPanel(snapshot, retainedM03)}${READINESS_ANCHOR}${parts[1]}`;
}
