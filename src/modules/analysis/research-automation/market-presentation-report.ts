import type { AutomationMarketPresentationMethod } from '../../../../contracts/analysis/automation-market-presentation-method.generated.js';
import { escapeHtml as escape, readerPointer, storedLiteral, type ReportCitations } from './descriptive-report.js';

type Method = AutomationMarketPresentationMethod;
const number = (value: number | null): string => value === null ? 'Chưa rõ' : value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const literal = (value: string): string => `<span data-quote>${storedLiteral(value, 'Nội dung nguyên văn được giữ trong hồ sơ nguồn')}</span>`;
const mark = (ref: { sourceSha256: string; locator: string; label?: string }, citations: ReportCitations): string => {
  const pointer = readerPointer(ref.locator);
  return citations.mark({ sourceKind: 'CAPTURE', identity: ref.sourceSha256, locator: pointer.locator,
    label: ref.label ?? 'Quy cách và giá do người vận hành lưu', retrievedAt: null, url: null, quote: null,
    quoteVerification: 'NOT_APPLICABLE', technical: { locator: ref.locator } });
};
const table = (caption: string, headings: readonly string[], rows: readonly string[][]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headings.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

/** Every statement is frozen by the owning method; rendering introduces no
 * calculation, interpretation, ordering by importance or provider execution. */
export function renderAutomationMarketFindings(method: Method, citations: ReportCitations): string {
  return '<p>Các phát hiện mô tả mẫu đã lưu, không sắp theo mức quan trọng.</p><ul class="market-findings">' + method.findings.map(finding =>
    `<li><p><b>Nhận định:</b> ${finding.pending ? `<span data-classified="pending">${escape(finding.statement.replace(/[.]$/, ''))} (đề xuất, chờ chủ duyệt).</span>` : escape(finding.statement)}</p><p><b>Bằng chứng:</b> <a href="#${finding.sectionId}">Bảng ${finding.sectionId === 'M03' ? 'số liệu mẫu xuất ở phần Quy mô và diễn biến' : 'quy cách và đơn vị chuẩn ở phần Giá và kinh tế đơn vị'}</a>${finding.evidence.map(ref => mark(ref, citations)).join('')}.</p><p><b>Trạng thái:</b> Bản nháp chưa được duyệt; ${finding.pending ? 'phân loại đề xuất, chờ chủ duyệt; ' : ''}${escape(finding.scope)}</p></li>`).join('') + '</ul>' +
    (method.findings.length < 4 ? '<p>Chưa đủ bằng chứng để có bốn nhận định; phần kết luận còn thiếu, không bổ sung nhận định không có nguồn.</p>' : '') +
    '<p>Số bán hàng là ước tính trong mẫu. Không suy số người mua, quy mô ngoài mẫu hoặc nguyên nhân.</p>';
}

export function renderAutomationMarketUnitPrices(method: Method, citations: ReportCitations): string {
  const groups = new Map<string, Method['unitPrices']>(), missing: Method['unitPrices'] = [];
  for (const row of method.unitPrices) {
    if (row.value === null) missing.push(row);
    else groups.set(row.comparisonKey, [...(groups.get(row.comparisonKey) ?? []), row]);
  }
  const prices = { LISTED: 'Giá niêm yết', PAYMENT: 'Giá thanh toán', CONDITIONAL_PROMO: 'Giá khuyến mãi có điều kiện' };
  const headings = ['Sàn', 'Listing', 'Biến thể', 'Ngành hàng', 'Giá (VND)', 'Số lượng', 'Đơn vị nguồn', 'Giá theo đơn vị chuẩn (VND)', 'Đơn vị chuẩn / cơ sở', 'Loại giá', 'Kỳ giá', 'Trạng thái', 'Nguồn', 'Điều kiện giá'];
  const cells = (row: Method['unitPrices'][number]): string[] => {
    const o = row.observation;
    return [o.platform === 'shopee' ? 'Shopee' : 'TikTok Shop', literal(o.listing), literal(o.variant), literal(o.category.label),
      number(o.price.value), number(o.quantity.value), escape(o.quantity.unit), number(row.value), literal(row.standard), prices[o.price.kind],
      `${escape(o.period.start)} đến ${escape(o.period.end)}`, escape(row.missing ?? 'Khai báo đã đối chiếu bản lưu; chưa xác thực người bán'),
      (row.ownerDeclared ? 'Số lượng do chủ khai báo' : 'Quy cách trong bản lưu trang bán do người vận hành cung cấp') + row.sources.map(ref => mark(ref, citations)).join(''),
      o.price.conditions.length ? o.price.conditions.map(literal).join('; ') : 'Không ghi điều kiện khuyến mãi'];
  };
  let html = [...groups.values()].map(group => table('Giá theo đơn vị chuẩn — sắp xếp tăng dần trong phạm vi tương thích', headings,
    [...group].sort((a, b) => a.value! - b.value! || a.rowI - b.rowI).map(cells))).join('');
  if (missing.length) html += table('Dòng chưa rõ — không đưa vào sắp xếp', headings, missing.map(cells));
  if (!method.unitPrices.length) html += '<p>Chưa có biên nhận quy cách và giá tương thích đã xác minh cho bản nháp này. Chưa tính giá theo đơn vị chuẩn; không đoán số lượng từ tiêu đề.</p>';
  const observed = new Set(method.unitPrices.map(row => row.rowI));
  const absent = method.input.rows.filter(row => !observed.has(row.i));
  if (absent.length) html += table('Listing chưa có quy cách hoặc giá đã xác minh — không đưa vào sắp xếp', ['Sàn', 'Listing', 'Tiêu đề nguồn', 'Trạng thái'],
    absent.map(row => [row.platform === 'shopee' ? 'Shopee' : 'TikTok Shop', literal(row.listing), literal(row.title), 'Chưa rõ số lượng và giá niêm yết' +
      (method.binding.metric ? mark({ sourceSha256: method.binding.metric.workbookSha256, locator: `Sheet1!A${row.i + 2}:T${row.i + 2}`, label: 'Dòng sản phẩm trong tệp đã lưu' }, citations) : '')]));
  return html + '<p>Giá hiển thị tối đa ba chữ số thập phân; sắp xếp theo giá trị chưa làm tròn. Chỉ sắp xếp cùng sàn, ngành hàng, đơn vị hoặc cơ sở, nhóm quy cách, loại giá, điều kiện và kỳ. Khối lượng tịnh và khối lượng cái giữ riêng; hàng dùng lâu và combo không chia nhỏ. Kỳ quan sát giá giữ riêng với kỳ doanh số.</p><p>Giá niêm yết, thanh toán và khuyến mãi có điều kiện giữ riêng; không thay bằng giá bán trung bình từ doanh thu và đơn vị bán. Đối chiếu khai báo với bản lưu không xác thực người bán; không suy chất lượng, giá vốn hoặc lợi nhuận.</p><p>Chưa có trường ROAS hoặc CPA với nguồn và ngữ nghĩa đã xác nhận trong đầu vào đã lưu; chưa có số liệu quảng cáo (ước tính) để tham khảo. Không suy từ doanh thu hoặc chi tiêu quảng cáo.</p><p>Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế.</p>';
}
