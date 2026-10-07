import type { AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import { escapeHtml as escape, readerPointer, sourceMemberLabel, type ReportCitations } from './descriptive-report.js';

export function marketInventorySection(snapshot: AutomationMarketMethodSnapshot, section: 'M03' | 'M08', citations: ReportCitations): string {
  const trace = (ref: { sourceSha256: string; fieldPointer: string }): string => {
    const pointer = readerPointer(ref.fieldPointer);
    return citations.mark({
      sourceKind: 'CAPTURE', identity: ref.sourceSha256.trim() === '' ? null : ref.sourceSha256, locator: pointer.locator,
      label: 'Số liệu nguồn đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { fieldPointer: ref.fieldPointer },
    });
  };
  if (section === 'M03') {
    const rows = snapshot.temporal.input.observations.map(row => `<tr><td>${row.subjectMemberKeys.map(key => escape(sourceMemberLabel(key))).join(', ')}</td><td>${escape(row.measure.literal)} / ${escape(row.measure.unit ?? row.measure.currency ?? 'Chưa rõ đơn vị')}</td><td>${escape(row.value.literal ?? 'Thiếu giá trị nguồn')}</td><td>${escape(row.requestedWindow.start ?? '?')} đến ${escape(row.requestedWindow.end ?? '?')}</td><td>${trace(row.source)}</td></tr>`).join('');
    return `<p class="warning">Đã giữ số liệu theo kỳ truy vấn cho các sản phẩm được chọn. Chưa xác minh đầy đủ định nghĩa phép đo, múi giờ, biên kỳ, tính cộng được và độ phủ. Không cộng thành tổng năm, tính tăng trưởng hay gọi đây là quy mô thị trường.</p><div class="table-wrap" role="region" aria-label="Quan sát theo kỳ" tabindex="0"><table><caption>Quan sát theo kỳ, chưa phải chuỗi thời gian đủ điều kiện tính</caption><thead><tr><th>Đối tượng nguồn</th><th>Phép đo nguồn</th><th>Giá trị nguồn</th><th>Kỳ truy vấn</th><th>Nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="5">Không có số liệu theo kỳ dùng được.</td></tr>'}</tbody></table></div>`;
  }
  const rows = snapshot.quotes.input.quotes.map(quote => `<tr><td>${escape(quote.quoteId)}</td><td>${quote.price.value !== null ? escape(quote.price.value) : quote.price.range ? `${escape(quote.price.range.minimum)} đến ${escape(quote.price.range.maximum)}` : 'Không có giá đọc được'} ${escape(quote.price.currency ?? '')}</td><td>${escape(quote.price.state)}<br>Chưa xác nhận giá pack/variant hoặc điều kiện thanh toán</td><td>${trace(quote.source)}</td></tr>`).join('');
  return `<p class="warning">Giá do nguồn trả về chỉ là quan sát. Chưa biết variant, số lượng mỗi pack, khối lượng tịnh/ráo hay điều kiện giá. Không tính giá mỗi đơn vị, biên lợi nhuận hoặc so sánh như cùng loại hàng.</p><div class="table-wrap" role="region" aria-label="Giá quan sát và khoảng giá nguồn" tabindex="0"><table><caption>Giá quan sát và khoảng giá nguồn, chưa chuẩn hóa đơn vị</caption><thead><tr><th>Bản ghi nguồn</th><th>Giá / khoảng giá</th><th>Giới hạn</th><th>Nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="4">Chưa có báo giá nguồn.</td></tr>'}</tbody></table></div>`;
}
