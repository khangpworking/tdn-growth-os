import type { Scope, Total, MetricScopeOutput, EvidenceRef } from '../../../../contracts/analysis/metric-scope-output.generated.js';
import type { AutomationMetricMethodSnapshot } from './metric-method-bridge.js';
import type { AutomationClassifiedMetricSnapshot } from '../../../../contracts/analysis/automation-classified-metric.generated.js';
import { escapeHtml as escape, readerPointer, type ReportCitations } from './descriptive-report.js';

// Presentation only: every amount, membership, ratio and sensitivity below is
// read from the frozen calculation. Opening a report never recalculates it.
const integer = (value: string | null): string => value === null ? 'Chưa có số liệu' : BigInt(value).toLocaleString('vi-VN');
const total = (value: Total, unit: string): string => `${integer(value.value)}${value.value === null ? '' : ` ${unit}`}<br><small>${value.observedCount} dòng có số liệu; ${value.missingCount} dòng thiếu; ${value.nonExactCount} dòng chưa được xác nhận có độ chính xác tuyệt đối.</small>`;
const table = (caption: string, headers: readonly string[], rows: readonly string[]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headers.map(header => `<th scope="col">${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const shopLabel = (key: string): string => {
  try { const value: unknown = JSON.parse(key); if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'string') return `gian hàng ${value[1]}`; } catch { /* Keep the exact identity if it is not a tuple. */ }
  return key;
};

/** One number per raw Metric row: the exact cell when it is known, otherwise "Chưa có nguồn". */
const rowMark = (ref: EvidenceRef, citations: ReportCitations): string => {
  const pointer = readerPointer(ref.locator);
  return citations.mark({
    sourceKind: 'METRIC_ROW', identity: ref.sourceSha256.trim() === '' ? null : ref.sourceSha256, locator: pointer.locator,
    label: 'Dòng số liệu nguồn', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { ...(ref.sourceSha256 === '' ? {} : { sourceSha256: ref.sourceSha256 }), ...(pointer.technical === null ? {} : { locator: pointer.technical }) },
  });
};
/** An aggregate is cited to the exact frozen calculation input it was read from. */
const calculationMark = (result: MetricScopeOutput, citations: ReportCitations): string => citations.mark({
  sourceKind: 'METRIC_ROW', identity: result.inputSha256, locator: null, label: 'Số liệu đã tính từ nguồn đã lưu',
  retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
  technical: { methodVersion: result.methodVersion, rounding: result.rounding },
});

function concentration(scope: Scope, result: MetricScopeOutput, citations: ReportCitations, caption = 'Mức tập trung gian hàng trong cùng mẫu doanh thu'): string {
  const source = calculationMark(result, citations);
  const rows = scope.concentration.map(row => `<tr><th scope="row">${row.k} gian hàng đứng đầu</th><td>${row.usedShopCount}</td><td>${row.share ? `${escape(row.share.percent)}%` : 'Chưa đủ điều kiện tính'}</td><td>${row.share ? integer(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? integer(row.share.denominator) : 'Chưa có số liệu'}</td><td>${source}</td></tr>`);
  const measured = scope.concentration.filter(row => row.share !== null);
  const chart = measured.length ? `<figure><style>@media(max-width:600px){.metric-concentration text{font-size:36px}}</style><svg class="metric-concentration" viewBox="0 0 840 170" role="img" aria-labelledby="metric-concentration-title metric-concentration-desc" style="width:100%;height:auto;max-width:840px"><title id="metric-concentration-title">Nhóm gian hàng đứng đầu chiếm bao nhiêu doanh thu trong mẫu xuất?</title><desc id="metric-concentration-desc">${escape(measured.map(row => `Nhóm ${row.k} đứng đầu, thực dùng ${row.usedShopCount} gian hàng: ${row.share!.percent}%`).join('; '))}. Các giá trị và mẫu số nằm trong bảng kế tiếp; không phải thị phần toàn thị trường.</desc>${measured.map((row, index) => `<g transform="translate(0 ${index * 50})"><text x="0" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">Nhóm ${row.k}</text><rect x="190" y="12" width="460" height="26" fill="var(--bd)"/><rect x="190" y="12" width="${Number(row.share!.percent) * 4.6}" height="26" fill="var(--blue)"/><text x="680" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">${escape(row.share!.percent)}%</text></g>`).join('')}</svg><figcaption>Tỷ trọng của các nhóm đứng đầu trong mẫu xuất. Biểu đồ chỉ trình bày tỷ lệ đã lưu, không bổ sung phép tính.</figcaption></figure>` : '';
  const first = measured[0];
  const reading = first ? `<p class="reader-summary">Nhóm đứng đầu gồm ${first.usedShopCount} gian hàng chiếm ${escape(first.share!.percent)}% doanh thu quan sát của mẫu này. Tỷ lệ đã lưu cho biết mức tập trung trong mẫu; chưa xác lập thị phần hoặc mức cạnh tranh của toàn thị trường.</p>` : '<p>Chưa đủ số liệu để xác lập tỷ trọng doanh thu của các nhóm gian hàng. Không hiểu giá trị thiếu là tỷ trọng bằng 0.</p>';
  return reading + chart + table(caption, ['Nhóm', 'Số gian hàng thực dùng', 'Tỷ trọng', 'Doanh thu nhóm (VND)', 'Doanh thu làm mẫu số (VND)', 'Nguồn'], rows);
}

export function metricMethodSection(snapshot: AutomationMetricMethodSnapshot, sectionId: 'M03' | 'M04', classified: AutomationClassifiedMetricSnapshot | undefined, citations: ReportCitations): string {
  const result = classified?.result ?? snapshot.result;
  const observed = result.scopes.find(scope => scope.key === 'all')!;
  const source = result.input.scope;
  const readiness = snapshot.readiness.sections.find(section => section.sectionId === sectionId);
  const limits = classified
    ? `<p class="warning">Đã phân loại đủ ${result.input.records.length} dòng trong mẫu xuất bằng các nhãn được chủ dự án chấp nhận. Toàn bộ mẫu (ALL) giữ mọi dòng; phạm vi rộng (WIDE) loại hàng ngoài phạm vi (OUTSIDE) và chưa rõ (UNKNOWN); phạm vi cốt lõi (CORE) chỉ giữ hàng thuộc nhóm cốt lõi. Đây vẫn là mẫu quan sát, không phải quy mô toàn ngành. Không cộng ba phạm vi lồng nhau hoặc cộng với nguồn sàn khác.</p>`
    : `<p class="warning">Đây là mẫu sản phẩm xuất theo từ khóa, chưa phải thị trường đã phân loại. Toàn bộ mẫu (ALL) gồm cả hàng ngoài phạm vi và hàng chưa rõ. Không dùng tổng mẫu làm quy mô toàn ngành, không cộng với nguồn sàn khác hoặc các phạm vi WIDE/CORE. ${result.labelIssues.length ? `Có ${result.labelIssues.length} dòng chưa có nhãn hợp lệ; WIDE và CORE chưa được tính, không phải bằng 0.` : 'Các phạm vi lồng nhau không được cộng thành tổng.'}</p>`;
  const context = `<dl class="reader-context"><dt>Nguồn / nền tảng</dt><dd>Nền tảng ${escape(source.platform)}. Bản xuất do người vận hành cung cấp; chưa xác minh độc lập nguồn gốc thu thập của nhà cung cấp.</dd><dt>Kỳ số liệu thực tế</dt><dd>${escape(source.start)} đến ${escape(source.end)}</dd><dt>Căn cứ sử dụng kỳ đo</dt><dd>Theo kỳ khai báo của tệp nguồn, không tự kéo dài hoặc chia tỷ lệ để khớp kỳ yêu cầu. Nội dung khai báo nguyên văn nằm trong hồ sơ đối chiếu bên dưới.</dd><dt>Thời điểm thu nguồn</dt><dd>${escape(source.acquiredAt ?? 'Chưa xác nhận; không suy từ ngày sửa tệp')}</dd></dl>`;
  const readinessText = classified
    ? `<p><strong>Kết quả ${sectionId} có giới hạn:</strong> Đã tính từ nguồn và phân loại đã chốt; chưa xác minh độ phủ toàn thị trường hoặc đủ chuỗi để kết luận tăng trưởng. Giá trị thiếu vẫn là thiếu, không đổi thành 0.</p>`
    : `<p><strong>Phương pháp chuyên biệt ${sectionId}:</strong> ${readiness?.state === 'BLOCKED' ? 'Chưa đủ điều kiện' : readiness?.state === 'INVALID' ? 'Đầu vào chưa hợp lệ' : readiness?.state === 'READY_TO_CALCULATE' ? 'Sẵn sàng tính, chưa phải kết quả hoàn chỉnh' : 'Chưa có trạng thái'}. Phép tính mẫu dưới đây không thay thế toàn bộ yêu cầu của mục này.</p>`;
  const remainingLimits = classified ? snapshot.limitations.filter(limit => !['CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED', 'CLASSIFIED_M03_M04_READINESS_REMAINS_BLOCKED'].includes(limit)) : snapshot.limitations;
  const details = `<details class="evidence-trace"><summary>Hồ sơ đối chiếu: khai báo gốc, phương pháp và giới hạn</summary><p>Chuẩn hóa từ ô bảng tính; không dùng một tổng số nhập sẵn thay cho các dòng nguồn.</p><dl><dt>Cơ sở kỳ đo, nguyên văn</dt><dd>${escape(source.periodBasis)}</dd><dt>Phương pháp / làm tròn</dt><dd><code>${escape(result.methodVersion)}</code> · <code>${escape(result.rounding)}</code></dd><dt>Bản kê nguồn</dt><dd><code>${escape(snapshot.originalSourcePackage.manifestArtifactSha256)}</code></dd></dl><ul>${remainingLimits.map(limit => `<li><code>${escape(limit)}</code></li>`).join('')}</ul><p>Đầu vào tính: <code>${escape(result.inputSha256)}</code>. Biên nhận chuẩn hóa: <code>${escape(snapshot.preparation.normalizationReceiptSha256)}</code>.</p>${classified ? `<p>Hồ sơ nhãn đã duyệt: <code>${escape(classified.proofSha256)}</code>; ${classified.selection.receiptIds.length} biên nhận, gắn quy tắc <code>${escape(classified.binding.adoptionSha256)}</code>.</p>` : ''}</details>`;
  if (sectionId === 'M03') {
    const reading = `<p class="reader-summary">Mẫu số liệu này gồm ${observed.listingCount} bản ghi sản phẩm của ${observed.shopCount} gian hàng. ${observed.revenue.value === null ? 'Chưa có tổng doanh thu dùng được.' : `Doanh thu quan sát là ${integer(observed.revenue.value)} VND, tính trên các dòng có số liệu trong kỳ nguồn khai báo.`} Đây là tổng của mẫu xuất, không phải ước tính quy mô toàn thị trường. Số bản ghi không nhất thiết là số sản phẩm hoặc biến thể riêng biệt.</p>`;
    const calculation = calculationMark(result, citations);
    const summary = table('Tổng trong mẫu xuất, giữ nguyên các dòng nguồn', ['Phạm vi', 'Bản ghi sản phẩm', 'Gian hàng', 'Doanh thu quan sát', 'Sản lượng nguồn', 'Nguồn'], [
      `<tr><th scope="row">Toàn bộ mẫu xuất (ALL)</th><td>${observed.listingCount}</td><td>${observed.shopCount}</td><td>${total(observed.revenue, 'VND')}</td><td>${total(observed.units, 'đơn vị nguồn')}</td><td>${calculation}</td></tr>`,
      ...result.scopes.filter(scope => scope.key !== 'all').map(scope => `<tr><th scope="row">${scope.key === 'wide' ? 'Phạm vi rộng (WIDE)' : 'Phạm vi cốt lõi (CORE)'}</th>${scope.status === 'BLOCKED_LABELS' ? '<td colspan="5">Chưa tính: cần nhãn phân loại đã chốt, khớp nội dung nguồn.</td>' : `<td>${scope.listingCount}</td><td>${scope.shopCount}</td><td>${total(scope.revenue, 'VND')}</td><td>${total(scope.units, 'đơn vị nguồn')}</td><td>${calculation}</td>`}</tr>`),
    ]);
    const records = result.input.records.slice(0, 10);
    const trace = table('Tối đa 10 dòng đầu theo thứ tự nguồn, không phải bảng xếp hạng', ['Mã sản phẩm / gian hàng', 'Tên theo nguồn', 'Doanh thu kỳ (VND)', 'Sản lượng kỳ (đơn vị nguồn)', 'Nguồn'], records.map(row => `<tr><td>${escape(row.listingId)}<br>Gian hàng ${escape(row.shopId)}</td><td>${escape(row.title)}</td><td>${integer(row.revenue.value)}</td><td>${integer(row.units.value)}</td><td>${rowMark(row.revenue.source, citations)}<br>${rowMark(row.units.source, citations)}</td></tr>`));
    return context + reading + limits + readinessText + summary + `<p>Không quy đổi sản lượng nguồn thành kg, số gói, số người mua hoặc doanh số từng biến thể.</p>` + `<details class="evidence-trace"><summary>Đối chiếu các dòng sản phẩm gốc</summary>${trace}<p>Hiển thị ${records.length}/${result.input.records.length} dòng; toàn bộ dòng, giá trị thiếu, độ chính xác và vị trí nguồn được giữ trong hồ sơ tính đã lưu.</p></details>` + details;
  }
  if (classified) {
    const calculation = calculationMark(result, citations);
    const groups = result.scopes.map(scope => `<h3>${escape(scope.key.toUpperCase())}: cấu trúc trong mẫu đã phân loại</h3>` +
      table(`Nhóm sản phẩm · ${scope.key.toUpperCase()}`, ['Nhóm đã duyệt', 'Bản ghi sản phẩm', 'Doanh thu quan sát', 'Tỷ trọng cùng phạm vi', 'Nguồn'],
        scope.groups.map(group => `<tr><th scope="row">${escape(group.group)}</th><td>${group.listingCount}</td><td>${total(group.revenue, 'VND')}</td><td>${group.revenueShare ? escape(group.revenueShare.percent) + '%' : 'Chưa đủ điều kiện tính'}</td><td>${calculation}</td></tr>`)) +
      concentration(scope, result, citations, `Mức tập trung gian hàng · ${scope.key.toUpperCase()}`) +
      (scope.withoutTopShop ? `<p>Độ nhạy ${escape(scope.key.toUpperCase())}: bỏ ${escape(shopLabel(scope.withoutTopShop.removedShopKey))}, còn ${scope.withoutTopShop.listingCount} bản ghi sản phẩm; doanh thu quan sát ${integer(scope.withoutTopShop.revenue.value)}${scope.withoutTopShop.revenue.value === null ? '' : ' VND'}. Không phải dự báo.</p>` : '<p>Chưa đủ điều kiện tính độ nhạy trong phạm vi này.</p>'));
    return limits + context + readinessText + concentration(observed, result, citations) + groups.join('') + details;
  }
  const sensitivity = observed.withoutTopShop;
  return context + limits + readinessText + concentration(observed, result, citations) + (sensitivity ? `<h3>Kiểm tra độ nhạy khi bỏ gian hàng đứng đầu</h3><p>Bỏ ${escape(shopLabel(sensitivity.removedShopKey))}, còn ${sensitivity.listingCount} bản ghi sản phẩm; doanh thu quan sát ${integer(sensitivity.revenue.value)}${sensitivity.revenue.value === null ? '' : ' VND'}. Đây là phép tính độ nhạy trên cùng mẫu, không phải dự báo hoặc tăng trưởng.</p>` + table('Tập trung trong mẫu còn lại, mẫu số khác với mẫu ban đầu', ['Nhóm', 'Số gian hàng thực dùng', 'Tỷ trọng', 'Doanh thu nhóm (VND)', 'Doanh thu làm mẫu số (VND)', 'Nguồn'], sensitivity.concentration.map(row => `<tr><th scope="row">${row.k} gian hàng đứng đầu</th><td>${row.usedShopCount}</td><td>${row.share ? escape(row.share.percent) + '%' : 'Chưa đủ điều kiện'}</td><td>${row.share ? integer(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? integer(row.share.denominator) : 'Chưa có số liệu'}</td><td>${calculationMark(result, citations)}</td></tr>`)) : '<p>Chưa đủ điều kiện kiểm tra độ nhạy bỏ gian hàng đứng đầu.</p>') + details;
}
