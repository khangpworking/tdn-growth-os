import type { AutomationMarketPresentationMethod } from '../../../../contracts/analysis/automation-market-presentation-method.generated.js';
import { readerPriceState, readerProductLabel, readerStoredOrJson } from './reader-plain-text.js';
import { escapeHtml as escape, readerPointer, storedLiteral, type ReportCitations } from './descriptive-report.js';

type Method = AutomationMarketPresentationMethod;
const number = (value: number | null): string => value === null ? 'Chưa rõ' : value.toLocaleString('vi-VN', { maximumFractionDigits: 3 });
const literal = (value: string, readerPlainText = true): string => `<span data-quote>${escape(readerPlainText ? readerStoredOrJson(value, 'Nội dung nguyên văn được giữ trong hồ sơ nguồn') : storedLiteral(value, 'Nội dung nguyên văn được giữ trong hồ sơ nguồn'))}</span>`;
const mark = (ref: { sourceSha256: string; locator: string; label?: string }, citations: ReportCitations, readerPlainText = true): string => {
  const pointer = readerPointer(ref.locator, readerPlainText);
  return citations.mark({ sourceKind: 'CAPTURE', identity: ref.sourceSha256, locator: pointer.locator,
    label: ref.label ?? 'Quy cách và giá do người vận hành lưu', retrievedAt: null, url: null, quote: null,
    quoteVerification: 'NOT_APPLICABLE', technical: { locator: ref.locator } });
};
const table = (caption: string, headings: readonly string[], rows: readonly string[][]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headings.map(h => `<th scope="col">${escape(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

export type AdvertisingReferenceInput = {
  period: { start: string; end: string } | null;
  object: { kind: 'product' | 'shop' | 'video'; label: string };
  revenue: { value: string | number | null; source: { identity: string } | null };
  adCost: { value: string | number | null; source: { identity: string } | null };
  orders: { value: string | number | null; source: { identity: string } | null };
  unavailableReason?: string;
};

const decimal = (value: string | number | null): number | null => {
  if (value === null || (typeof value === 'number' && (!Number.isFinite(value) || value < 0))) return null;
  if (typeof value === 'string' && !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
};

const advertisingNumber = (value: number | null, suffix = ''): string => value === null
  ? 'chưa khả dụng'
  : `${value.toLocaleString('vi-VN', { maximumFractionDigits: 3 })}${suffix}`;

const advertisingPeriod = (period: AdvertisingReferenceInput['period']): string => period === null
  ? 'chưa xác định trong bản lưu'
  : `${period.start} đến ${period.end}`;

const advertisingObject = (object: AdvertisingReferenceInput['object']): string => {
  const labels = { product: 'sản phẩm', shop: 'gian hàng', video: 'video' };
  return `${labels[object.kind]}: ${object.label}`;
};

/**
 * Renders advertising references without treating a retained export column as
 * authenticated advertising evidence. A number is calculated only when the
 * caller explicitly confirms the source semantics and all same-source inputs
 * needed by that metric are present. The output never exposes source field
 * names or the derived share metric.
 */
const completePeriod = (period: AdvertisingReferenceInput['period']): boolean => period !== null &&
  period.start.trim() !== '' && period.end.trim() !== '';

export function renderAutomationMarketAdvertising(input: AdvertisingReferenceInput): string {
  const period = completePeriod(input.period) ? advertisingPeriod(input.period) : 'chưa xác định trong bản lưu';
  const object = advertisingObject(input.object);
  const sources = [input.revenue.source, input.adCost.source, input.orders.source];
  const sourceIdentities = sources.map(source => source?.identity.trim() ?? '');
  const sameConfirmedSource = sourceIdentities.every(identity => identity !== '') && new Set(sourceIdentities).size === 1;
  const confirmed = sameConfirmedSource && completePeriod(input.period) && input.object.label.trim() !== '';
  const revenue = decimal(input.revenue.value), adCost = decimal(input.adCost.value), orders = decimal(input.orders.value);
  const unavailable = input.unavailableReason ?? 'thiếu trường nguồn đã xác nhận với ngữ nghĩa quảng cáo';
  const roas = confirmed && revenue !== null && adCost !== null && adCost > 0 ? revenue / adCost : null;
  const cpa = confirmed && adCost !== null && orders !== null && orders > 0 ? adCost / orders : null;
  const roasReason = roas === null
    ? confirmed && adCost === 0 ? 'chi phí quảng cáo bằng không nên không thể chia' : unavailable
    : '';
  const cpaReason = cpa === null
    ? confirmed && orders === 0 ? 'số đơn bằng không nên không thể chia' : unavailable
    : '';
  const disclaimer = 'Đây là số ước tính tham khảo theo cùng một nguồn và kỳ; không suy ra lợi nhuận hoặc “có lãi”, không so sánh kênh và không trộn với số liệu bán hàng từ nguồn khác.';
  return `<div class="market-advertising-reference"><h4>Chỉ số quảng cáo tham khảo</h4>` +
    `<p>Kỳ: ${escape(period)} · Đối tượng: ${escape(object)}.</p>` +
    `<ul><li>ROAS: ${advertisingNumber(roas, 'x')}${roas === null ? ` · Lý do: ${escape(roasReason)}` : ' · ước tính tham khảo'}</li>` +
    `<li>CPA: ${advertisingNumber(cpa, ' VND/đơn')}${cpa === null ? ` · Lý do: ${escape(cpaReason)}` : ' · ước tính tham khảo'}</li></ul>` +
    `<p class="warning">${escape(disclaimer)}</p></div>`;
}

/** Every statement is frozen by the owning method; rendering introduces no
 * calculation, interpretation, ordering by importance or provider execution. */
export function renderAutomationMarketFindings(method: Method, citations: ReportCitations, readerPlainText = true): string {
  return '<p>Các phát hiện mô tả mẫu đã lưu, không sắp theo mức quan trọng.</p><ul class="market-findings">' + method.findings.map(finding =>
    `<li><p><b>Nhận định:</b> ${finding.pending ? `<span data-classified="pending">${escape(readerPlainText ? readerStoredOrJson(finding.statement.replace(/[.]$/, ''), 'Nhận định được giữ trong hồ sơ đối chiếu') : finding.statement.replace(/[.]$/, ''))} (đề xuất, chờ chủ duyệt).</span>` : escape(readerPlainText ? readerStoredOrJson(finding.statement, 'Nhận định được giữ trong hồ sơ đối chiếu') : finding.statement)}</p><p><b>Bằng chứng:</b> <a href="#${finding.sectionId}">Bảng ${finding.sectionId === 'M03' ? 'số liệu mẫu xuất ở phần Quy mô và diễn biến' : 'quy cách và đơn vị chuẩn ở phần Giá và kinh tế đơn vị'}</a>${finding.evidence.map(ref => mark(ref, citations, readerPlainText)).join('')}.</p><p><b>Trạng thái:</b> Bản nháp chưa được duyệt; ${finding.pending ? 'phân loại đề xuất, chờ chủ duyệt; ' : ''}${escape(readerPlainText ? readerStoredOrJson(finding.scope, 'Phạm vi được giữ trong hồ sơ đối chiếu') : finding.scope)}</p></li>`).join('') + '</ul>' +
    (method.findings.length < 4 ? '<p>Chưa đủ bằng chứng để có bốn nhận định; phần kết luận còn thiếu, không bổ sung nhận định không có nguồn.</p>' : '') +
    '<p>Số bán hàng là ước tính trong mẫu. Không suy số người mua, quy mô ngoài mẫu hoặc nguyên nhân.</p>';
}

export function renderAutomationMarketUnitPrices(method: Method, citations: ReportCitations, readerPlainText = true): string {
  const groups = new Map<string, Method['unitPrices']>(), missing: Method['unitPrices'] = [];
  for (const row of method.unitPrices) {
    if (row.value === null) missing.push(row);
    else groups.set(row.comparisonKey, [...(groups.get(row.comparisonKey) ?? []), row]);
  }
  const titleByListing = new Map(method.input.rows.flatMap(row => row.title.trim() ? [[row.listing, row.title.trim()] as const] : []));
  const listingOrdinals = new Map<string, number>();
  const productLabel = (listing: string): string => {
    const ordinal = listingOrdinals.get(listing) ?? listingOrdinals.size + 1;
    listingOrdinals.set(listing, ordinal);
    return readerPlainText ? escape(readerProductLabel(listing, titleByListing.get(listing), ordinal)) : literal(listing, false);
  };
  const prices = { LISTED: 'Giá niêm yết', PAYMENT: 'Giá thanh toán', CONDITIONAL_PROMO: 'Giá khuyến mãi có điều kiện' };
  const headings = ['Sàn', 'Listing', 'Biến thể', 'Ngành hàng', 'Giá (VND)', 'Số lượng', 'Đơn vị nguồn', 'Giá theo đơn vị chuẩn (VND)', 'Đơn vị chuẩn / cơ sở', 'Loại giá', 'Kỳ giá', 'Trạng thái', 'Nguồn', 'Điều kiện giá'];
  const cells = (row: Method['unitPrices'][number]): string[] => {
    const o = row.observation;
    return [o.platform === 'shopee' ? 'Shopee' : 'TikTok Shop', productLabel(o.listing), literal(o.variant, readerPlainText), literal(o.category.label, readerPlainText),
      number(o.price.value), number(o.quantity.value), escape(readerPlainText ? readerStoredOrJson(o.quantity.unit, 'Đơn vị được giữ trong hồ sơ đối chiếu') : o.quantity.unit), number(row.value), literal(row.standard, readerPlainText), prices[o.price.kind] ?? 'Loại giá được giữ trong hồ sơ đối chiếu',
      `${escape(readerPlainText ? readerStoredOrJson(o.period.start, 'Kỳ giá được giữ trong hồ sơ đối chiếu') : o.period.start)} đến ${escape(readerPlainText ? readerStoredOrJson(o.period.end, 'Kỳ giá được giữ trong hồ sơ đối chiếu') : o.period.end)}`, escape(row.missing === undefined || row.missing === null ? 'Khai báo đã đối chiếu bản lưu; chưa xác thực người bán' : readerPlainText ? readerPriceState(row.missing) : row.missing),
      (row.ownerDeclared ? 'Số lượng do chủ khai báo' : 'Quy cách trong bản lưu trang bán do người vận hành cung cấp') + row.sources.map(ref => mark(ref, citations, readerPlainText)).join(''),
      o.price.conditions.length ? o.price.conditions.map(value => literal(value, readerPlainText)).join('; ') : 'Không ghi điều kiện khuyến mãi'];
  };
  let html = [...groups.values()].map(group => table('Giá theo đơn vị chuẩn — sắp xếp tăng dần trong phạm vi tương thích', headings,
    [...group].sort((a, b) => a.value! - b.value! || a.rowI - b.rowI).map(cells))).join('');
  if (missing.length) html += table('Dòng chưa rõ — không đưa vào sắp xếp', headings, missing.map(cells));
  if (!method.unitPrices.length) html += '<p>Chưa có biên nhận quy cách và giá tương thích đã xác minh cho bản nháp này. Chưa tính giá theo đơn vị chuẩn; không đoán số lượng từ tiêu đề.</p>';
  const observed = new Set(method.unitPrices.map(row => row.rowI));
  const absent = method.input.rows.filter(row => !observed.has(row.i));
  if (absent.length) html += table('Listing chưa có quy cách hoặc giá đã xác minh — không đưa vào sắp xếp', ['Sàn', 'Listing', 'Tiêu đề nguồn', 'Trạng thái'],
    absent.map(row => [row.platform === 'shopee' ? 'Shopee' : 'TikTok Shop', productLabel(row.listing), literal(row.title, readerPlainText), 'Chưa rõ số lượng và giá niêm yết' +
      (method.binding.metric ? mark({ sourceSha256: method.binding.metric.workbookSha256, locator: `Sheet1!A${row.i + 2}:T${row.i + 2}`, label: 'Dòng sản phẩm trong tệp đã lưu' }, citations, readerPlainText) : '')]));
  const period = method.input.metric?.input.scope ?? null;
  return html + '<p>Giá hiển thị tối đa ba chữ số thập phân; sắp xếp theo giá trị chưa làm tròn. Chỉ sắp xếp cùng sàn, ngành hàng, đơn vị hoặc cơ sở, nhóm quy cách, loại giá, điều kiện và kỳ. Khối lượng tịnh và khối lượng cái giữ riêng; hàng dùng lâu và combo không chia nhỏ. Kỳ quan sát giá giữ riêng với kỳ doanh số.</p><p>Giá niêm yết, thanh toán và khuyến mãi có điều kiện giữ riêng; không thay bằng giá bán trung bình từ doanh thu và đơn vị bán. Đối chiếu khai báo với bản lưu không xác thực người bán; không suy chất lượng, giá vốn hoặc lợi nhuận.</p>' +
    renderAutomationMarketAdvertising({ period: period ? { start: period.start, end: period.end } : null,
      object: { kind: 'video', label: 'chưa xác định trong đầu vào Market' },
      revenue: { value: null, source: null }, adCost: { value: null, source: null }, orders: { value: null, source: null },
      unavailableReason: 'Chưa có trường ROAS hoặc CPA với nguồn và ngữ nghĩa đã xác nhận; đầu vào Market chưa có trường chi phí quảng cáo và số đơn đã xác nhận' }) +
    '<p>Dữ liệu được thu từ kênh công khai và xử lý bằng mô hình; doanh thu và chi tiêu quảng cáo có thể khác số thực tế.</p>';
}
