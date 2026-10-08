import type { AutomationQuoteMethodSnapshot } from '../../../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import type { Result } from '../../../../contracts/analysis/generic-quote-unit.generated.js';
import { escapeHtml as escape, readerPointer, storedLiteral, type ReportCitations } from './descriptive-report.js';

const readerText = (value: string): string => storedLiteral(value, 'Nội dung được giữ trong bản lưu nguồn');

const reasons: Record<Result['reasons'][number], string> = {
  PRICE_NOT_EXACT: 'Chưa có một mức giá chính xác', CURRENCY_UNKNOWN: 'Chưa rõ tiền tệ',
  IDENTITY_UNRESOLVED: 'Chưa xác định đúng mặt hàng', VARIANT_UNRESOLVED: 'Chưa xác định biến thể',
  OFFER_LINKAGE_UNRESOLVED: 'Chưa liên kết giá và quy cách cùng chào bán',
  COUNT_NOT_EXACT: 'Chưa có số lượng chính xác', COUNT_UNIT_NOT_PHYSICAL: 'Đơn vị không phải số món hàng',
  UNSUPPORTED_PHYSICAL_COUNT_UNIT: 'Chưa hỗ trợ đơn vị đếm này', INVALID_COUNT_VALUE: 'Số lượng phải là số nguyên dương',
  PACK_NOT_HOMOGENEOUS: 'Chưa xác nhận các món trong gói đồng nhất', MASS_BASIS_NOT_SELECTED: 'Chưa chọn cơ sở khối lượng này',
  MASS_NOT_EXACT: 'Chưa có khối lượng chính xác', INVALID_MASS_VALUE: 'Khối lượng phải lớn hơn 0',
  MASS_LINKAGE_UNRESOLVED: 'Chưa liên kết khối lượng với đúng chào bán', MASS_BASIS_UNKNOWN: 'Chưa rõ khối lượng của mỗi món hay cả gói',
  UNSUPPORTED_MASS_UNIT: 'Chỉ tính khối lượng đã xác định bằng g hoặc kg',
};
const operations = [
  ['pricePerPurchasedPack', 'Mỗi gói mua'], ['pricePerPhysicalItem', 'Mỗi món hàng'],
  ['pricePer100gNet', 'Mỗi 100 g tịnh'], ['pricePer100gDrained', 'Mỗi 100 g ráo'],
] as const;
const priceLabels = { LISTED: 'Giá niêm yết', STRUCK_THROUGH: 'Giá gạch ngang', PROMO_CONDITIONAL: 'Giá có điều kiện',
  OBSERVED_CHECKOUT: 'Giá tại bước thanh toán', UNKNOWN: 'Chưa rõ loại giá' };

/** Usability is read from the stored calculation; the caller needs it before the (lazy) HTML is composed. */
export function quoteMethodUsable(snapshot: AutomationQuoteMethodSnapshot): boolean {
  return snapshot.output.quotes.some(row => operations.some(([key]) => row[key].status === 'AVAILABLE'));
}

/** Read-only presentation of verified arithmetic; no parsing, selection or recomputation. */
export function quoteMethodSection(snapshot: AutomationQuoteMethodSnapshot, citations: ReportCitations): string {
  const output = snapshot.output;
  const html = output.quotes.slice(0, 20).map((row, index) => {
    const quote = output.input.quotes[index]!;
    const source = snapshot.sourceMetadata.find(file => file.sha256 === quote.source.sourceSha256 && quote.source.locator === file.path + quote.source.fieldPointer)!;
    const pointer = readerPointer(quote.source.fieldPointer);
    const mark = citations.mark({
      sourceKind: 'CAPTURE', identity: quote.source.sourceSha256.trim() === '' ? null : quote.source.sourceSha256, locator: pointer.locator,
      label: 'Bản ghi giá đã lưu', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { fieldPointer: quote.source.fieldPointer, provenance: source.providerProvenance, provenanceBasis: source.provenanceBasis },
    });
    const amount = quote.price.value ?? (quote.price.range ? `${quote.price.range.minimum} đến ${quote.price.range.maximum}` : 'Chưa có giá');
    const rows = operations.map(([key, label]) => {
      const result = row[key];
      return `<tr><th scope="row">${label}</th><td>${result.status === 'AVAILABLE'
        ? `${escape(result.display!)} ${readerText(quote.price.currency!)}<br><small>Giá trị chính xác: ${escape(result.exact!.numerator)} / ${escape(result.exact!.denominator)}</small>`
        : 'Chưa tính được'}</td><td>${result.status === 'AVAILABLE'
          ? result.basis === 'SCENARIO' ? 'Kịch bản dùng mẫu số người dùng khai báo' : 'Từ trường trong bản ghi nguồn, chưa xác minh thực tế'
          : escape(result.reasons.map(reason => reasons[reason]).join('; '))}</td></tr>`;
    }).join('');
    return `<h3>${readerText(quote.offerText ?? quote.quoteId)}</h3><p>${readerText(quote.packText ?? 'Chưa có mô tả quy cách')}. ${escape(priceLabels[quote.price.priceState])}: ${escape(amount)} ${readerText(quote.price.currency ?? '(chưa rõ tiền tệ)')}.</p>
      <p>Biến thể: ${readerText(quote.identity.variantId ?? quote.identity.variantState)}. Điều kiện: ${readerText(quote.price.conditions.map(condition => condition.literal).join('; ') || 'Không có điều kiện được ghi trong nguồn; chưa xác nhận vô điều kiện')}. Thuế: ${escape(quote.price.tax)}; vận chuyển: ${escape(quote.price.shipping)}.</p>
      <p>Thời điểm quan sát: ${escape(quote.observedAt ?? 'Chưa xác định, không coi là giá hiện tại')}. Thời điểm thu nhận được khai báo: ${escape(quote.acquiredAt)}.</p>
      <div class="table-wrap" role="region" aria-label="Phép tính giá chào bán ${index + 1}" tabindex="0"><table><caption>Giá theo từng cơ sở, giữ riêng khối lượng tịnh và ráo</caption><thead><tr><th scope="col">Cơ sở</th><th scope="col">Kết quả</th><th scope="col">Điều kiện và phần thiếu</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p>Nguồn: ${mark}. Xuất xứ khai báo trong gói: ${storedLiteral(source.providerProvenance, 'xuất xứ được giữ trong bản lưu nguồn')}; ${storedLiteral(source.provenanceBasis, 'cơ sở xuất xứ được giữ trong bản lưu nguồn')}. <a href="#quote-method-evidence">Xem trường nguồn và phép tính tại M13</a>.</p>`;
  }).join('');
  return `<p class="warning">Tính từ bản ghi có cấu trúc đã lưu, không tự suy quy cách từ tên sản phẩm. Kiểm tra này chứng minh phép tính và sự khớp trường, không xác nhận nội dung của trang bán hàng, giao dịch hay việc người dùng đã duyệt. Không tính chi phí, lợi nhuận hoặc xếp hạng chào bán.</p>${html || '<p>Gói đã chọn không có bản ghi giá.</p>'}${output.quotes.length > 20 ? `<p>Hiển thị 20 trong ${output.quotes.length} bản ghi theo thứ tự nguồn. Toàn bộ bản ghi và kết quả được giữ tại M13.</p>` : ''}<p>Số hiển thị làm tròn đến hai chữ số thập phân theo half-even; phân số chính xác được giữ riêng. Giá có điều kiện không trở thành giá thanh toán vô điều kiện.</p>`;
}
