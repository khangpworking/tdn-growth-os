import type { Scope, Total } from '../../../../contracts/analysis/metric-scope-output.generated.js';
import type { AutomationMetricMethodSnapshot } from './metric-method-bridge.js';
import { escapeHtml as escape } from './descriptive-report.js';

// Presentation only: every amount, membership, ratio and sensitivity below is
// read from the frozen calculation. Opening a report never recalculates it.
const integer = (value: string | null): string => value === null ? 'Chưa có số liệu' : BigInt(value).toLocaleString('vi-VN');
const total = (value: Total, unit: string): string => `${integer(value.value)}${value.value === null ? '' : ` ${unit}`}<br><small>${value.observedCount} dòng quan sát; ${value.missingCount} dòng thiếu; ${value.nonExactCount} dòng chưa có độ chính xác exact.</small>`;
const table = (caption: string, headers: readonly string[], rows: readonly string[]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headers.map(header => `<th scope="col">${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const shopLabel = (key: string): string => {
  try { const value: unknown = JSON.parse(key); if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'string') return `Shop ${value[1]}`; } catch { /* Keep the exact identity if it is not a tuple. */ }
  return key;
};

function concentration(scope: Scope): string {
  const rows = scope.concentration.map(row => `<tr><th scope="row">Top ${row.k} shop</th><td>${row.usedShopCount}</td><td>${row.share ? `${escape(row.share.percent)}%` : 'Chưa đủ điều kiện tính'}</td><td>${row.share ? integer(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? integer(row.share.denominator) : 'Chưa có số liệu'}</td></tr>`);
  const measured = scope.concentration.filter(row => row.share !== null);
  const chart = measured.length ? `<figure><style>@media(max-width:600px){.metric-concentration text{font-size:44px}}</style><svg class="metric-concentration" viewBox="0 0 840 170" role="img" aria-labelledby="metric-concentration-title metric-concentration-desc" style="width:100%;height:auto;max-width:840px"><title id="metric-concentration-title">Top shop chiếm bao nhiêu doanh thu trong mẫu xuất?</title><desc id="metric-concentration-desc">${escape(measured.map(row => `Top ${row.k}, thực dùng ${row.usedShopCount} shop: ${row.share!.percent}%`).join('; '))}. Các giá trị và mẫu số nằm trong bảng kế tiếp; không phải thị phần toàn thị trường.</desc>${measured.map((row, index) => `<g transform="translate(0 ${index * 50})"><text x="0" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">Top ${row.k}</text><rect x="190" y="12" width="460" height="26" fill="var(--bd)"/><rect x="190" y="12" width="${Number(row.share!.percent) * 4.6}" height="26" fill="var(--blue)"/><text x="680" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">${escape(row.share!.percent)}%</text></g>`).join('')}</svg><figcaption>Tỷ trọng trong mẫu xuất. Biểu đồ chỉ trình bày tỷ lệ đã lưu, không bổ sung phép tính.</figcaption></figure>` : '';
  return chart + table('Tập trung shop trong cùng mẫu số doanh thu quan sát', ['Nhóm', 'Shop thực dùng', 'Tỷ trọng', 'Tử số (VND)', 'Mẫu số (VND)'], rows);
}

export function metricMethodSection(snapshot: AutomationMetricMethodSnapshot, sectionId: 'M03' | 'M04'): string {
  const result = snapshot.result;
  const observed = result.scopes.find(scope => scope.key === 'all')!;
  const source = result.input.scope;
  const readiness = snapshot.readiness.sections.find(section => section.sectionId === sectionId);
  const limits = `<p class="warning">Đây là mẫu listing xuất theo keyword, chưa phải thị trường đã phân loại. ALL gồm cả hàng ngoài phạm vi và hàng chưa rõ. Không dùng tổng mẫu làm quy mô toàn ngành, không cộng với Kalodata hoặc các phạm vi WIDE/CORE. ${result.labelIssues.length ? `Có ${result.labelIssues.length} dòng chưa có nhãn hợp lệ; WIDE và CORE chưa được tính, không phải bằng 0.` : 'Các phạm vi lồng nhau không được cộng thành tổng.'}</p>`;
  const context = `<dl><dt>Nguồn / nền tảng</dt><dd>Metric · ${escape(source.platform)} · Bản xuất do người vận hành cung cấp, chưa xác minh provenance nhà cung cấp.</dd><dt>Kỳ số liệu thực tế</dt><dd>${escape(source.start)} đến ${escape(source.end)}</dd><dt>Cơ sở kỳ đo</dt><dd>${escape(source.periodBasis)}</dd><dt>Thời điểm thu nguồn</dt><dd>${escape(source.acquiredAt ?? 'Chưa xác nhận; không suy từ ngày sửa file')}</dd><dt>Phương pháp / làm tròn</dt><dd>${escape(result.methodVersion)} · ${escape(result.rounding)}</dd></dl>`;
  const readinessText = `<p><strong>Phương pháp chuyên biệt ${sectionId}:</strong> ${readiness?.state === 'BLOCKED' ? 'Chưa đủ điều kiện' : readiness?.state === 'INVALID' ? 'Đầu vào chưa hợp lệ' : readiness?.state === 'READY_TO_CALCULATE' ? 'Sẵn sàng tính, chưa phải kết quả hoàn chỉnh' : 'Chưa có trạng thái'}. Phép tính mẫu dưới đây không thay thế toàn bộ yêu cầu của mục này.</p>`;
  const details = `<details><summary>Dấu vết nguồn và giới hạn đã lưu</summary><p>Chuẩn hóa từ ô workbook; không dùng một tổng số nhập sẵn thay cho các dòng nguồn.</p><code>${escape(snapshot.originalSourcePackage.manifestArtifactSha256)}</code><ul>${snapshot.limitations.map(limit => `<li>${escape(limit)}</li>`).join('')}</ul><p>Đầu vào tính: <code>${escape(result.inputSha256)}</code>. Biên nhận chuẩn hóa: <code>${escape(snapshot.preparation.normalizationReceiptSha256)}</code>.</p></details>`;
  if (sectionId === 'M03') {
    const summary = table('Tổng trong mẫu xuất đã giữ nguyên membership', ['Phạm vi', 'Listing', 'Shop', 'Doanh thu quan sát', 'Sản lượng nguồn'], [
      `<tr><th scope="row">ALL · Mẫu xuất theo keyword</th><td>${observed.listingCount}</td><td>${observed.shopCount}</td><td>${total(observed.revenue, 'VND')}</td><td>${total(observed.units, 'đơn vị nguồn')}</td></tr>`,
      ...result.scopes.filter(scope => scope.key !== 'all').map(scope => `<tr><th scope="row">${escape(scope.key.toUpperCase())}</th>${scope.status === 'BLOCKED_LABELS' ? '<td colspan="4">Chưa tính: cần nhãn phân loại đã chốt, khớp nội dung nguồn.</td>' : `<td>${scope.listingCount}</td><td>${scope.shopCount}</td><td>${total(scope.revenue, 'VND')}</td><td>${total(scope.units, 'đơn vị nguồn')}</td>`}</tr>`),
    ]);
    const records = result.input.records.slice(0, 10);
    const trace = table('Tối đa 10 dòng đầu theo thứ tự nguồn, không phải bảng xếp hạng', ['Listing / shop', 'Tên nguồn', 'Doanh thu kỳ', 'Sản lượng kỳ', 'Ô bằng chứng'], records.map(row => `<tr><td>${escape(row.listingId)}<br>Shop ${escape(row.shopId)}</td><td>${escape(row.title)}</td><td>${integer(row.revenue.value)}</td><td>${integer(row.units.value)}</td><td><code>${escape(row.revenue.source.locator)}</code><br><code>${escape(row.units.source.locator)}</code></td></tr>`));
    return limits + context + readinessText + summary + `<p>Không quy đổi sản lượng nguồn thành kg, số gói, số người mua hoặc doanh số từng biến thể.</p>` + trace + `<p>Hiển thị ${records.length}/${result.input.records.length} dòng; toàn bộ dòng, giá trị thiếu, độ chính xác và locator được giữ trong hồ sơ tính đã lưu.</p>` + details;
  }
  const sensitivity = observed.withoutTopShop;
  return limits + context + readinessText + concentration(observed) + (sensitivity ? `<h3>Kiểm tra độ nhạy khi bỏ shop đứng đầu</h3><p>Bỏ ${escape(shopLabel(sensitivity.removedShopKey))}, còn ${sensitivity.listingCount} listing; doanh thu quan sát ${integer(sensitivity.revenue.value)} VND. Đây là phép tính độ nhạy trên cùng mẫu, không phải dự báo hoặc tăng trưởng.</p>` + table('Tập trung trong mẫu còn lại, mẫu số khác với mẫu ban đầu', ['Nhóm', 'Shop thực dùng', 'Tỷ trọng', 'Tử số (VND)', 'Mẫu số (VND)'], sensitivity.concentration.map(row => `<tr><th scope="row">Top ${row.k}</th><td>${row.usedShopCount}</td><td>${row.share ? escape(row.share.percent) + '%' : 'Chưa đủ điều kiện'}</td><td>${row.share ? integer(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? integer(row.share.denominator) : 'Chưa có số liệu'}</td></tr>`)) : '<p>Chưa đủ điều kiện kiểm tra độ nhạy bỏ shop đứng đầu.</p>') + details;
}
