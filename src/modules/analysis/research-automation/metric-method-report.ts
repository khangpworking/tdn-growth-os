import type { Scope, Total, MetricScopeOutput, EvidenceRef } from '../../../../contracts/analysis/metric-scope-output.generated.js';
import type { AutomationMetricMethodSnapshot, CaptureMetricHeadlineValue, CaptureMetricPlatformHeadline } from './metric-method-bridge.js';
import type { AutomationClassifiedMetricSnapshot } from '../../../../contracts/analysis/automation-classified-metric.generated.js';
import { formatReaderCount, readerProductLabel, readerShopLabel, readerStoredOrJson } from './reader-plain-text.js';
import { escapeHtml as escape, readerPointer, storedLiteral, type ReportCitations } from './descriptive-report.js';

// Presentation only: every amount, membership, ratio and sensitivity below is
// read from the frozen calculation. Opening a report never recalculates it.
const integer = (value: string | null): string => value === null ? 'Chưa có số liệu' : BigInt(value).toLocaleString('vi-VN');
const readerCount = (value: string | number): string => formatReaderCount(value) ?? 'chưa rõ';
const readerScopeLabel = (key: string): string => key === 'wide' ? 'Phạm vi rộng' : key === 'core' ? 'Phạm vi cốt lõi' : 'Toàn bộ mẫu';
const readerPlatformLabel = (value: string): string => readerStoredOrJson(value, 'Nền tảng được giữ trong hồ sơ đối chiếu');
const total = (value: Total, unit: string): string => `${integer(value.value)}${value.value === null ? '' : ` ${unit}`}<br><small>${readerCount(value.observedCount)} dòng có số liệu; ${readerCount(value.missingCount)} dòng thiếu; ${readerCount(value.nonExactCount)} dòng chưa được xác nhận có độ chính xác tuyệt đối.</small>`;
const table = (caption: string, headers: readonly string[], rows: readonly string[]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headers.map(header => `<th scope="col">${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
const shopLabel = (key: string): string => {
  try { const value: unknown = JSON.parse(key); if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'string') return readerShopLabel(value[1]); } catch { /* Technical shop keys remain neutral labels. */ }
  return readerShopLabel(key);
};

const LIMITATION_COPY: Readonly<Record<string, string>> = {
  OPERATOR_ATTACHED_EXPORT_NOT_PROVIDER_AUTHENTICATED: 'Bản xuất do người vận hành cung cấp; nguồn gốc thu thập chưa được xác minh độc lập.',
  KEYWORD_EXPORT_CONTEXT_RETAINED_LITERALLY_NO_FILTER_CATEGORY_OR_COVERAGE_GUARANTEE: 'Ngữ cảnh theo từ khóa được giữ nguyên; chưa có bảo đảm về bộ lọc, phân loại hoặc độ bao phủ.',
  ALL_SCOPE_IS_BOUNDED_OBSERVED_KEYWORD_EXPORT_SAMPLE_NOT_WHOLE_MARKET: 'Phạm vi toàn mẫu là mẫu quan sát có giới hạn theo từ khóa, không đại diện cho toàn bộ thị trường.',
  CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED: 'Nhãn phân loại chưa được gắn xác nhận; phạm vi rộng và phạm vi cốt lõi chưa đủ điều kiện tính.',
  CLASSIFIED_M03_M04_READINESS_REMAINS_BLOCKED: 'M03 và M04 vẫn ở trạng thái chưa đủ điều kiện sau bước phân loại.',
  NO_ANNUAL_GROWTH_TAM_OR_WHOLE_MARKET_SHARE: 'Bản lưu không cung cấp quy mô thị trường, tăng trưởng năm hoặc thị phần toàn thị trường.',
  NOT_DIRECTLY_COMPARABLE_WITH_KALODATA_PERIODS: 'Kỳ đo của bản xuất này không so sánh trực tiếp được với kỳ của nguồn sàn khác.',
  DECLARED_PERIOD_AND_PRECISION_NOT_INDEPENDENTLY_VERIFIED: 'Kỳ đo và độ chính xác do bản xuất khai báo chưa được xác minh độc lập.',
  SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED: 'Kỳ đo của bản xuất ngắn hơn kỳ yêu cầu; không kéo dài hoặc chia tỷ lệ để bù.',
};
const GENERIC_LIMITATION_COPY = 'Một giới hạn kỹ thuật khác được giữ trong bản lưu';
const METHOD_COPY: Readonly<Record<string, string>> = {
  'metric-scope-v1': 'Phép tính trên mẫu số liệu đã lưu, phiên bản 1',
  'percent-half-even-2-v1': 'Làm tròn tỷ lệ phần trăm tới 2 chữ số thập phân (nửa về số chẵn)',
};
const limitationCopy = (code: string): string => Object.hasOwn(LIMITATION_COPY, code) ? LIMITATION_COPY[code]! : GENERIC_LIMITATION_COPY;
const methodCopy = (id: string): string => Object.hasOwn(METHOD_COPY, id) ? METHOD_COPY[id]! : 'Phiên bản được giữ trong bản lưu';

/** One number per raw Metric row: the exact cell when it is known, otherwise "Chưa có nguồn". */
const rowMark = (ref: EvidenceRef, citations: ReportCitations): string => {
  const pointer = readerPointer(ref.locator, true);
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

function concentration(scope: Scope, result: MetricScopeOutput, citations: ReportCitations, caption = 'Mức tập trung gian hàng trong cùng mẫu doanh thu', readerPlainText = false, handChart = true): string {
  const source = calculationMark(result, citations);
  const rows = scope.concentration.map(row => `<tr><th scope="row">${readerCount(row.k)} gian hàng đứng đầu</th><td>${readerCount(row.usedShopCount)}</td><td>${row.share ? `${escape(row.share.percent)}%` : 'Chưa đủ điều kiện tính'}</td><td>${row.share ? integer(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? integer(row.share.denominator) : 'Chưa có số liệu'}</td><td>${source}</td></tr>`);
  const measured = scope.concentration.filter(row => row.share !== null);
  const chart = measured.length && handChart ? `<figure><style>@media(max-width:600px){.market-concentration text{font-size:36px}}</style>${readerPlainText ? '<div class="chart flint" data-engine="svg-fallback">' : ''}<svg class="market-concentration" viewBox="0 0 840 170" role="img" aria-labelledby="market-concentration-title market-concentration-desc" style="width:100%;height:auto;max-width:840px"><title id="market-concentration-title">Nhóm gian hàng đứng đầu chiếm bao nhiêu doanh thu trong mẫu xuất?</title><desc id="market-concentration-desc">${escape(measured.map(row => `Nhóm ${readerCount(row.k)} đứng đầu, thực dùng ${readerCount(row.usedShopCount)} gian hàng: ${row.share!.percent}%`).join('; '))}. Các giá trị và mẫu số nằm trong bảng kế tiếp; không phải thị phần toàn thị trường.</desc>${measured.map((row, index) => `<g transform="translate(0 ${index * 50})"><text x="0" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">Nhóm ${readerCount(row.k)}</text><rect x="190" y="12" width="460" height="26" fill="var(--bd)"/><rect x="190" y="12" width="${Number(row.share!.percent) * 4.6}" height="26" fill="var(--blue)"/><text x="680" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">${escape(row.share!.percent)}%</text></g>`).join('')}</svg>${readerPlainText ? '</div>' : ''}<figcaption>Tỷ trọng của các nhóm đứng đầu trong mẫu xuất. Biểu đồ chỉ trình bày tỷ lệ đã lưu, không bổ sung phép tính.</figcaption></figure>` : '';
  const first = measured[0];
  const reading = first ? `<p class="reader-summary">Nhóm đứng đầu gồm ${readerCount(first.usedShopCount)} gian hàng chiếm ${escape(first.share!.percent)}% doanh thu quan sát của mẫu này. Tỷ lệ đã lưu cho biết mức tập trung trong mẫu; chưa xác lập thị phần hoặc mức cạnh tranh của toàn thị trường.</p>` : '<p>Chưa đủ số liệu để xác lập tỷ trọng doanh thu của các nhóm gian hàng. Không hiểu giá trị thiếu là tỷ trọng bằng 0.</p>';
  return reading + chart + table(caption, ['Nhóm', 'Số gian hàng thực dùng', 'Tỷ trọng', 'Doanh thu nhóm (VND)', 'Doanh thu làm mẫu số (VND)', 'Nguồn'], rows) +
    (readerPlainText ? '<p class="lim"><b>Chú thích:</b> Tỷ trọng chỉ phản ánh mức tập trung trong mẫu quan sát; không phải thị phần toàn thị trường.</p>' : '');
}

/**
 * A capture name is text copied from the source page, not the report's own
 * wording. It carries the same `data-quote` marker every other retained source
 * name uses, so the owned-wording rules judge the report's sentences and never
 * a source product title. Provider-name and leak rules still scan quoted text.
 */
const retainedSourceName = (value: string): string => `<q data-quote>${escape(value)}</q>`;

function legacyMetricMethodSection(snapshot: AutomationMetricMethodSnapshot, sectionId: 'M03' | 'M04', classified: AutomationClassifiedMetricSnapshot | undefined, citations: ReportCitations, neutralCopy = false): string {
const legacyInteger = (value: string | null): string => value === null ? 'Chưa có số liệu' : BigInt(value).toLocaleString('vi-VN');

const legacyTotal = (value: Total, unit: string): string => `${legacyInteger(value.value)}${value.value === null ? '' : ` ${unit}`}<br><small>${value.observedCount} dòng có số liệu; ${value.missingCount} dòng thiếu; ${value.nonExactCount} dòng chưa được xác nhận có độ chính xác tuyệt đối.</small>`;

const legacyTable = (caption: string, headers: readonly string[], rows: readonly string[]): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(caption)}" tabindex="0"><table><caption>${escape(caption)}</caption><thead><tr>${headers.map(header => `<th scope="col">${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;

const legacyShopLabel = (key: string): string => {
  try { const value: unknown = JSON.parse(key); if (Array.isArray(value) && value.length === 2 && typeof value[1] === 'string') return `gian hàng ${value[1]}`; } catch { /* Keep the exact identity if it is not a tuple. */ }
  return key;
};
/** One number per raw Metric row: the exact cell when it is known, otherwise "Chưa có nguồn". */
const legacyRowMark = (ref: EvidenceRef, citations: ReportCitations): string => {
  const pointer = readerPointer(ref.locator, false);
  return citations.mark({
    sourceKind: 'METRIC_ROW', identity: ref.sourceSha256.trim() === '' ? null : ref.sourceSha256, locator: pointer.locator,
    label: 'Dòng số liệu nguồn', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { ...(ref.sourceSha256 === '' ? {} : { sourceSha256: ref.sourceSha256 }), ...(pointer.technical === null ? {} : { locator: pointer.technical }) },
  });
};
/** An aggregate is cited to the exact frozen calculation input it was read from. */
const legacyCalculationMark = (result: MetricScopeOutput, citations: ReportCitations): string => citations.mark({
  sourceKind: 'METRIC_ROW', identity: result.inputSha256, locator: null, label: 'Số liệu đã tính từ nguồn đã lưu',
  retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
  technical: { methodVersion: result.methodVersion, rounding: result.rounding },
});
function legacyConcentration(scope: Scope, result: MetricScopeOutput, citations: ReportCitations, caption = 'Mức tập trung gian hàng trong cùng mẫu doanh thu'): string {
  const source = legacyCalculationMark(result, citations);
  const rows = scope.concentration.map(row => `<tr><th scope="row">${row.k} gian hàng đứng đầu</th><td>${row.usedShopCount}</td><td>${row.share ? `${escape(row.share.percent)}%` : 'Chưa đủ điều kiện tính'}</td><td>${row.share ? legacyInteger(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? legacyInteger(row.share.denominator) : 'Chưa có số liệu'}</td><td>${source}</td></tr>`);
  const measured = scope.concentration.filter(row => row.share !== null);
  const chart = measured.length ? `<figure><style>@media(max-width:600px){.market-concentration text{font-size:36px}}</style><svg class="market-concentration" viewBox="0 0 840 170" role="img" aria-labelledby="market-concentration-title market-concentration-desc" style="width:100%;height:auto;max-width:840px"><title id="market-concentration-title">Nhóm gian hàng đứng đầu chiếm bao nhiêu doanh thu trong mẫu xuất?</title><desc id="market-concentration-desc">${escape(measured.map(row => `Nhóm ${row.k} đứng đầu, thực dùng ${row.usedShopCount} gian hàng: ${row.share!.percent}%`).join('; '))}. Các giá trị và mẫu số nằm trong bảng kế tiếp; không phải thị phần toàn thị trường.</desc>${measured.map((row, index) => `<g transform="translate(0 ${index * 50})"><text x="0" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">Nhóm ${row.k}</text><rect x="190" y="12" width="460" height="26" fill="var(--bd)"/><rect x="190" y="12" width="${Number(row.share!.percent) * 4.6}" height="26" fill="var(--blue)"/><text x="680" y="25" dominant-baseline="middle" fill="var(--ink)" font-size="16">${escape(row.share!.percent)}%</text></g>`).join('')}</svg><figcaption>Tỷ trọng của các nhóm đứng đầu trong mẫu xuất. Biểu đồ chỉ trình bày tỷ lệ đã lưu, không bổ sung phép tính.</figcaption></figure>` : '';
  const first = measured[0];
  const reading = first ? `<p class="reader-summary">Nhóm đứng đầu gồm ${first.usedShopCount} gian hàng chiếm ${escape(first.share!.percent)}% doanh thu quan sát của mẫu này. Tỷ lệ đã lưu cho biết mức tập trung trong mẫu; chưa xác lập thị phần hoặc mức cạnh tranh của toàn thị trường.</p>` : '<p>Chưa đủ số liệu để xác lập tỷ trọng doanh thu của các nhóm gian hàng. Không hiểu giá trị thiếu là tỷ trọng bằng 0.</p>';
  return reading + chart + legacyTable(caption, ['Nhóm', 'Số gian hàng thực dùng', 'Tỷ trọng', 'Doanh thu nhóm (VND)', 'Doanh thu làm mẫu số (VND)', 'Nguồn'], rows);
}
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
  const details = `<details class="evidence-trace"><summary>Hồ sơ đối chiếu: khai báo gốc, phương pháp và giới hạn</summary><p>Chuẩn hóa từ ô bảng tính; không dùng một tổng số nhập sẵn thay cho các dòng nguồn.</p><dl><dt>Cơ sở kỳ đo, nguyên văn</dt><dd>${storedLiteral(source.periodBasis, 'Căn cứ kỳ được giữ trong bản lưu nguồn')}</dd><dt>Phương pháp / làm tròn</dt><dd><span>${escape(methodCopy(result.methodVersion))}</span> · <span>${escape(methodCopy(result.rounding))}</span></dd><dt>Bản kê nguồn</dt><dd><code>${escape(snapshot.originalSourcePackage.manifestArtifactSha256)}</code></dd></dl><ul>${remainingLimits.map(limit => `<li>${escape(limitationCopy(limit))}</li>`).join('')}</ul><p>Đầu vào tính: <code>${escape(result.inputSha256)}</code>. Biên nhận chuẩn hóa: <code>${escape(snapshot.preparation.normalizationReceiptSha256)}</code>.</p>${classified ? `<p>Hồ sơ nhãn đã duyệt: <code>${escape(classified.proofSha256)}</code>; ${classified.selection.receiptIds.length} biên nhận, gắn quy tắc <code>${escape(classified.binding.adoptionSha256)}</code>.</p>` : ''}</details>`;
  if (sectionId === 'M03') {
    const reading = `<p class="reader-summary">Mẫu số liệu này gồm ${observed.listingCount} bản ghi sản phẩm của ${observed.shopCount} gian hàng. ${observed.revenue.value === null ? 'Chưa có tổng doanh thu dùng được.' : `Doanh thu quan sát là ${legacyInteger(observed.revenue.value)} VND, tính trên các dòng có số liệu trong kỳ nguồn khai báo.`} Đây là tổng của mẫu xuất, không phải ước tính quy mô toàn thị trường. ${neutralCopy ? 'Số bản ghi chưa chứng minh số sản phẩm hoặc biến thể riêng biệt.' : 'Số bản ghi không nhất thiết là số sản phẩm hoặc biến thể riêng biệt.'}</p>`;
    const calculation = legacyCalculationMark(result, citations);
    const summary = legacyTable('Tổng trong mẫu xuất, giữ nguyên các dòng nguồn', ['Phạm vi', 'Bản ghi sản phẩm', 'Gian hàng', 'Doanh thu quan sát', 'Sản lượng nguồn', 'Nguồn'], [
      `<tr><th scope="row">Toàn bộ mẫu xuất (ALL)</th><td>${observed.listingCount}</td><td>${observed.shopCount}</td><td>${legacyTotal(observed.revenue, 'VND')}</td><td>${legacyTotal(observed.units, 'đơn vị nguồn')}</td><td>${calculation}</td></tr>`,
      ...result.scopes.filter(scope => scope.key !== 'all').map(scope => `<tr><th scope="row">${scope.key === 'wide' ? 'Phạm vi rộng (WIDE)' : 'Phạm vi cốt lõi (CORE)'}</th>${scope.status === 'BLOCKED_LABELS' ? '<td colspan="5">Chưa tính: cần nhãn phân loại đã chốt, khớp nội dung nguồn.</td>' : `<td>${scope.listingCount}</td><td>${scope.shopCount}</td><td>${legacyTotal(scope.revenue, 'VND')}</td><td>${legacyTotal(scope.units, 'đơn vị nguồn')}</td><td>${calculation}</td>`}</tr>`),
    ]);
    const records = result.input.records.slice(0, 10);
    const trace = legacyTable('Tối đa 10 dòng đầu theo thứ tự nguồn, không phải bảng xếp hạng', ['Mã sản phẩm / gian hàng', 'Tên theo nguồn', 'Doanh thu kỳ (VND)', 'Sản lượng kỳ (đơn vị nguồn)', 'Nguồn'], records.map(row => `<tr><td>${storedLiteral(row.listingId, 'Mã sản phẩm được giữ trong bản lưu nguồn')}<br>Gian hàng ${storedLiteral(row.shopId, 'Mã gian hàng được giữ trong bản lưu nguồn')}</td><td>${storedLiteral(row.title, 'Tên sản phẩm được giữ trong bản lưu nguồn')}</td><td>${legacyInteger(row.revenue.value)}</td><td>${legacyInteger(row.units.value)}</td><td>${legacyRowMark(row.revenue.source, citations)}<br>${legacyRowMark(row.units.source, citations)}</td></tr>`));
    return context + reading + limits + readinessText + summary + `<p>Không quy đổi sản lượng nguồn thành kg, số gói, số người mua hoặc doanh số từng biến thể.</p>` + `<details class="evidence-trace"><summary>Đối chiếu các dòng sản phẩm gốc</summary>${trace}<p>Hiển thị ${records.length}/${result.input.records.length} dòng; toàn bộ dòng, giá trị thiếu, độ chính xác và vị trí nguồn được giữ trong hồ sơ tính đã lưu.</p></details>` + details;
  }
  if (classified) {
    const calculation = legacyCalculationMark(result, citations);
    const groups = result.scopes.map(scope => `<h3>${escape(scope.key.toUpperCase())}: cấu trúc trong mẫu đã phân loại</h3>` +
      legacyTable(`Nhóm sản phẩm · ${scope.key.toUpperCase()}`, ['Nhóm đã duyệt', 'Bản ghi sản phẩm', 'Doanh thu quan sát', 'Tỷ trọng cùng phạm vi', 'Nguồn'],
        scope.groups.map(group => `<tr><th scope="row">${storedLiteral(group.group, 'Nhãn nhóm được giữ trong bản lưu nguồn')}</th><td>${group.listingCount}</td><td>${legacyTotal(group.revenue, 'VND')}</td><td>${group.revenueShare ? escape(group.revenueShare.percent) + '%' : 'Chưa đủ điều kiện tính'}</td><td>${calculation}</td></tr>`)) +
      legacyConcentration(scope, result, citations, `Mức tập trung gian hàng · ${scope.key.toUpperCase()}`) +
      (scope.withoutTopShop ? `<p>Độ nhạy ${escape(scope.key.toUpperCase())}: bỏ ${storedLiteral(legacyShopLabel(scope.withoutTopShop.removedShopKey), 'Gian hàng được giữ trong bản lưu nguồn')}, còn ${scope.withoutTopShop.listingCount} bản ghi sản phẩm; doanh thu quan sát ${legacyInteger(scope.withoutTopShop.revenue.value)}${scope.withoutTopShop.revenue.value === null ? '' : ' VND'}. Không phải dự báo.</p>` : '<p>Chưa đủ điều kiện tính độ nhạy trong phạm vi này.</p>'));
    return limits + context + readinessText + legacyConcentration(observed, result, citations) + groups.join('') + details;
  }
  const sensitivity = observed.withoutTopShop;
  return context + limits + readinessText + legacyConcentration(observed, result, citations) + (sensitivity ? `<h3>Kiểm tra độ nhạy khi bỏ gian hàng đứng đầu</h3><p>Bỏ ${storedLiteral(legacyShopLabel(sensitivity.removedShopKey), 'Gian hàng được giữ trong bản lưu nguồn')}, còn ${sensitivity.listingCount} bản ghi sản phẩm; doanh thu quan sát ${legacyInteger(sensitivity.revenue.value)}${sensitivity.revenue.value === null ? '' : ' VND'}. Đây là phép tính độ nhạy trên cùng mẫu, không phải dự báo hoặc tăng trưởng.</p>` + legacyTable('Tập trung trong mẫu còn lại, mẫu số khác với mẫu ban đầu', ['Nhóm', 'Số gian hàng thực dùng', 'Tỷ trọng', 'Doanh thu nhóm (VND)', 'Doanh thu làm mẫu số (VND)', 'Nguồn'], sensitivity.concentration.map(row => `<tr><th scope="row">${row.k} gian hàng đứng đầu</th><td>${row.usedShopCount}</td><td>${row.share ? escape(row.share.percent) + '%' : 'Chưa đủ điều kiện'}</td><td>${row.share ? legacyInteger(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? legacyInteger(row.share.denominator) : 'Chưa có số liệu'}</td><td>${legacyCalculationMark(result, citations)}</td></tr>`)) : '<p>Chưa đủ điều kiện kiểm tra độ nhạy bỏ gian hàng đứng đầu.</p>') + details;
}

export function metricMethodSection(snapshot: AutomationMetricMethodSnapshot, sectionId: 'M03' | 'M04', classified: AutomationClassifiedMetricSnapshot | undefined, citations: ReportCitations, neutralCopy = false, readerPlainText = false): string {
  if (snapshot.capture) return captureMetricMethodSection(snapshot, sectionId, citations);
  if (!readerPlainText) return legacyMetricMethodSection(snapshot, sectionId, classified, citations, neutralCopy);
  const result = classified?.result ?? snapshot.result;
  const observed = result.scopes.find(scope => scope.key === 'all')!;
  const source = result.input.scope;
  const readiness = snapshot.readiness.sections.find(section => section.sectionId === sectionId);
  const limits = classified
    ? `<p class="warning">Đã phân loại đủ ${readerCount(result.input.records.length)} dòng trong mẫu xuất bằng các nhãn được chủ dự án chấp nhận. Toàn bộ mẫu giữ mọi dòng; phạm vi rộng loại hàng ngoài phạm vi và chưa rõ; phạm vi cốt lõi chỉ giữ hàng thuộc nhóm cốt lõi. Đây vẫn là mẫu quan sát, không phải quy mô toàn ngành. Không cộng ba phạm vi lồng nhau hoặc cộng với nguồn sàn khác.</p>`
    : `<p class="warning">Đây là mẫu sản phẩm xuất theo từ khóa, chưa phải thị trường đã phân loại. Toàn bộ mẫu gồm cả hàng ngoài phạm vi và hàng chưa rõ, không phải 0. Không dùng tổng mẫu làm quy mô toàn ngành, không cộng với nguồn sàn khác hoặc các phạm vi rộng và cốt lõi. ${result.labelIssues.length ? `Có ${readerCount(result.labelIssues.length)} dòng chưa có nhãn hợp lệ; các phạm vi rộng và cốt lõi chưa được tính, không phải bằng 0.` : 'Các phạm vi lồng nhau không được cộng thành tổng.'}</p>`;
  const context = `<dl class="reader-context"><dt>Nguồn / nền tảng</dt><dd>Nền tảng ${escape(readerPlatformLabel(source.platform))}. Bản xuất do người vận hành cung cấp; chưa xác minh độc lập nguồn gốc thu thập của nhà cung cấp.</dd><dt>Kỳ số liệu thực tế</dt><dd>${escape(readerStoredOrJson(source.start, 'Kỳ số liệu được giữ trong hồ sơ đối chiếu'))} đến ${escape(readerStoredOrJson(source.end, 'Kỳ số liệu được giữ trong hồ sơ đối chiếu'))}</dd><dt>Căn cứ sử dụng kỳ đo</dt><dd>Theo kỳ khai báo của tệp nguồn, không tự kéo dài hoặc chia tỷ lệ để khớp kỳ yêu cầu. Nội dung khai báo nguyên văn nằm trong hồ sơ đối chiếu bên dưới.</dd><dt>Thời điểm thu nguồn</dt><dd>${escape(readerStoredOrJson(source.acquiredAt, 'Thời điểm thu nguồn được giữ trong hồ sơ đối chiếu'))}</dd></dl>`;
  const readinessText = classified
    ? `<p><strong>Kết quả ${sectionId} có giới hạn:</strong> Đã tính từ nguồn và phân loại đã chốt; chưa xác minh độ phủ toàn thị trường hoặc đủ chuỗi để kết luận tăng trưởng. Giá trị thiếu vẫn là thiếu, không đổi thành 0.</p>`
    : `<p><strong>Phương pháp chuyên biệt ${sectionId}:</strong> ${readiness?.state === 'BLOCKED' ? 'Chưa đủ điều kiện' : readiness?.state === 'INVALID' ? 'Đầu vào chưa hợp lệ' : readiness?.state === 'READY_TO_CALCULATE' ? 'Sẵn sàng tính, chưa phải kết quả hoàn chỉnh' : 'Chưa có trạng thái'}. Phép tính mẫu dưới đây không thay thế toàn bộ yêu cầu của mục này.</p>`;
  const remainingLimits = classified ? snapshot.limitations.filter(limit => !['CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED', 'CLASSIFIED_M03_M04_READINESS_REMAINS_BLOCKED'].includes(limit)) : snapshot.limitations;
  const legacyDetails = `<details class="evidence-trace"><summary>Hồ sơ đối chiếu: khai báo gốc, phương pháp và giới hạn</summary><p>Chuẩn hóa từ ô bảng tính; không dùng một tổng số nhập sẵn thay cho các dòng nguồn.</p><dl><dt>Cơ sở kỳ đo, nguyên văn</dt><dd>${storedLiteral(source.periodBasis, 'Căn cứ kỳ được giữ trong bản lưu nguồn')}</dd><dt>Phương pháp / làm tròn</dt><dd><span>${escape(methodCopy(result.methodVersion))}</span> · <span>${escape(methodCopy(result.rounding))}</span></dd><dt>Bản kê nguồn</dt><dd><code>${escape(snapshot.originalSourcePackage.manifestArtifactSha256)}</code></dd></dl><ul>${remainingLimits.map(limit => `<li>${escape(limitationCopy(limit))}</li>`).join('')}</ul><p>Đầu vào tính: <code>${escape(result.inputSha256)}</code>. Biên nhận chuẩn hóa: <code>${escape(snapshot.preparation.normalizationReceiptSha256)}</code>.</p>${classified ? `<p>Hồ sơ nhãn đã duyệt: <code>${escape(classified.proofSha256)}</code>; ${readerCount(classified.selection.receiptIds.length)} biên nhận, gắn quy tắc <code>${escape(classified.binding.adoptionSha256)}</code>.</p>` : ''}</details>`;
  const details = readerPlainText ? '<details class="evidence-trace"><summary>Hồ sơ đối chiếu</summary><p>Thông tin kỹ thuật đã được lưu trong hồ sơ đối chiếu.</p></details>' : legacyDetails;
  if (sectionId === 'M03') {
    const reading = `<p class="reader-summary">Mẫu số liệu này gồm ${readerCount(observed.listingCount)} bản ghi sản phẩm của ${readerCount(observed.shopCount)} gian hàng. ${observed.revenue.value === null ? 'Chưa có tổng doanh thu dùng được.' : `Doanh thu quan sát là ${integer(observed.revenue.value)} VND, tính trên các dòng có số liệu trong kỳ nguồn khai báo.`} Đây là tổng của mẫu xuất, không phải ước tính quy mô toàn thị trường. ${readerPlainText ? 'Số bản ghi chưa chứng minh số sản phẩm hoặc biến thể riêng biệt.' : 'Số bản ghi không nhất thiết là số sản phẩm hoặc biến thể riêng biệt.'}</p>`;
    const calculation = calculationMark(result, citations);
    const summary = table('Tổng trong mẫu xuất, giữ nguyên các dòng nguồn', ['Phạm vi', 'Bản ghi sản phẩm', 'Gian hàng', 'Doanh thu quan sát', 'Sản lượng nguồn', 'Nguồn'], [
      `<tr><th scope="row">Toàn bộ mẫu xuất</th><td>${readerCount(observed.listingCount)}</td><td>${readerCount(observed.shopCount)}</td><td>${total(observed.revenue, 'VND')}</td><td>${total(observed.units, 'đơn vị nguồn')}</td><td>${calculation}</td></tr>`,
      ...result.scopes.filter(scope => scope.key !== 'all').map(scope => `<tr><th scope="row">${scope.key === 'wide' ? 'Phạm vi rộng' : 'Phạm vi cốt lõi'}</th>${scope.status === 'BLOCKED_LABELS' ? '<td colspan="5">Chưa tính: cần nhãn phân loại đã chốt, khớp nội dung nguồn.</td>' : `<td>${readerCount(scope.listingCount)}</td><td>${readerCount(scope.shopCount)}</td><td>${total(scope.revenue, 'VND')}</td><td>${total(scope.units, 'đơn vị nguồn')}</td><td>${calculation}</td>`}</tr>`),
    ]);
    const records = result.input.records.slice(0, 10);
    const shopOrdinals = new Map<string, number>();
    const trace = table('Tối đa 10 dòng đầu theo thứ tự nguồn, không phải bảng xếp hạng', ['Mã sản phẩm / gian hàng', 'Tên theo nguồn', 'Doanh thu kỳ (VND)', 'Sản lượng kỳ (đơn vị nguồn)', 'Nguồn'], records.map((row, index) => {
      const shopOrdinal = shopOrdinals.get(row.shopId) ?? shopOrdinals.size + 1;
      shopOrdinals.set(row.shopId, shopOrdinal);
      return `<tr><td>${escape(readerProductLabel(row.listingId, row.title, index + 1))}<br>${escape(readerShopLabel(row.shopId, undefined, shopOrdinal))}</td><td>${escape(readerStoredOrJson(row.title, 'Tên sản phẩm được giữ trong bản lưu nguồn'))}</td><td>${integer(row.revenue.value)}</td><td>${integer(row.units.value)}</td><td>${rowMark(row.revenue.source, citations)}<br>${rowMark(row.units.source, citations)}</td></tr>`;
    }));
    return context + reading + limits + readinessText + summary + `<p>Không quy đổi sản lượng nguồn thành kg, số gói, số người mua hoặc doanh số từng biến thể.</p>` + `<details class="evidence-trace"><summary>Đối chiếu các dòng sản phẩm gốc</summary>${trace}<p>Hiển thị ${readerCount(records.length)}/${readerCount(result.input.records.length)} dòng; toàn bộ dòng, giá trị thiếu, độ chính xác và vị trí nguồn được giữ trong hồ sơ tính đã lưu.</p></details>` + details;
  }
  if (classified) {
    const calculation = calculationMark(result, citations);
    const groups = result.scopes.map(scope => `<h3>${escape(readerScopeLabel(scope.key))}: cấu trúc trong mẫu đã phân loại</h3>` +
      table(`Nhóm sản phẩm · ${readerScopeLabel(scope.key)}`, ['Nhóm đã duyệt', 'Bản ghi sản phẩm', 'Doanh thu quan sát', 'Tỷ trọng cùng phạm vi', 'Nguồn'],
        scope.groups.map(group => `<tr><th scope="row">${escape(readerStoredOrJson(group.group, 'Nhãn nhóm được giữ trong bản lưu nguồn'))}</th><td>${readerCount(group.listingCount)}</td><td>${total(group.revenue, 'VND')}</td><td>${group.revenueShare ? escape(group.revenueShare.percent) + '%' : 'Chưa đủ điều kiện tính'}</td><td>${calculation}</td></tr>`)) +
      concentration(scope, result, citations, `Mức tập trung gian hàng · ${readerScopeLabel(scope.key)}`, true, !neutralCopy) +
      (scope.withoutTopShop ? `<p>Độ nhạy ${escape(readerScopeLabel(scope.key))}: bỏ ${storedLiteral(shopLabel(scope.withoutTopShop.removedShopKey), 'Gian hàng được giữ trong bản lưu nguồn')}, còn ${readerCount(scope.withoutTopShop.listingCount)} bản ghi sản phẩm; doanh thu quan sát ${integer(scope.withoutTopShop.revenue.value)}${scope.withoutTopShop.revenue.value === null ? '' : ' VND'}. Không phải dự báo.</p>` : '<p>Chưa đủ điều kiện tính độ nhạy trong phạm vi này.</p>'));
    return limits + context + readinessText + concentration(observed, result, citations, undefined, true, !neutralCopy) + groups.join('') + details;
  }
  const sensitivity = observed.withoutTopShop;
  return context + limits + readinessText + concentration(observed, result, citations, undefined, true, !neutralCopy) + (sensitivity ? `<h3>Kiểm tra độ nhạy khi bỏ gian hàng đứng đầu</h3><p>Bỏ ${storedLiteral(shopLabel(sensitivity.removedShopKey), 'Gian hàng được giữ trong bản lưu nguồn')}, còn ${readerCount(sensitivity.listingCount)} bản ghi sản phẩm; doanh thu quan sát ${integer(sensitivity.revenue.value)}${sensitivity.revenue.value === null ? '' : ' VND'}. Đây là phép tính độ nhạy trên cùng mẫu, không phải dự báo hoặc tăng trưởng.</p>` + table('Tập trung trong mẫu còn lại, mẫu số khác với mẫu ban đầu', ['Nhóm', 'Số gian hàng thực dùng', 'Tỷ trọng', 'Doanh thu nhóm (VND)', 'Doanh thu làm mẫu số (VND)', 'Nguồn'], sensitivity.concentration.map(row => `<tr><th scope="row">${readerCount(row.k)} gian hàng đứng đầu</th><td>${readerCount(row.usedShopCount)}</td><td>${row.share ? escape(row.share.percent) + '%' : 'Chưa đủ điều kiện'}</td><td>${row.share ? integer(row.share.numerator) : 'Chưa có số liệu'}</td><td>${row.share ? integer(row.share.denominator) : 'Chưa có số liệu'}</td><td>${calculationMark(result, citations)}</td></tr>`)) : '<p>Chưa đủ điều kiện kiểm tra độ nhạy bỏ gian hàng đứng đầu.</p>') + details;
}

function captureMetricMethodSection(snapshot: AutomationMetricMethodSnapshot, sectionId: 'M03' | 'M04', citations: ReportCitations): string {
  const capture = snapshot.capture!;
  const number = (value: string | null, unit = ''): string => value === null ? 'không có số liệu' : `${BigInt(value).toLocaleString('vi-VN')}${unit ? ` ${unit}` : ''}`;
  const platformLabel = (platform: string): string => platform === 'shopee' ? 'Shopee' : platform === 'tiktok' ? 'TikTok Shop' : platform;
  const source = (result: MetricScopeOutput): string => calculationMark(result, citations);
  /** The capture's per-platform figure, cited to the exact cell it was read from. */
  const headlineValue = (value: CaptureMetricHeadlineValue | null, unit: string): string => value === null || value.value === null
    ? '<strong>không có số liệu</strong>'
    : `<strong>${number(value.value, unit)}</strong>${value.precision === 'exact' ? '' : ' <small>số làm tròn như trên trang</small>'} ${citations.mark({
      sourceKind: 'CAPTURE', identity: capture.snapshotSha256, locator: readerPointer(value.locator, true).locator,
      label: 'Số liệu nền tảng trong bản lưu nguồn', retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
      technical: { sourceSha256: capture.snapshotSha256, locator: value.locator } })}`;
  /** Only a platform the capture reports an observed revenue figure for replaces the retained rows. */
  const figureOf = (platform: string): CaptureMetricPlatformHeadline | null => {
    const figure = capture.platformHeadlines?.find(value => value.platform === platform);
    return figure === undefined || figure.revenue.value === null ? null : figure;
  };
  /**
   * Observed revenue for one platform: the capture's own per-platform figure
   * when it has one, otherwise the retained rows. The row list below keeps its
   * top-N limit, so a platform figure is never the sum of that list.
   */
  const platformSummary = (platform: string, result: MetricScopeOutput | null): string => {
    const figure = figureOf(platform);
    if (figure === null) {
      if (result === null) return `<p class="warning">${escape(platformLabel(platform))}: <strong>không có số liệu</strong> trong lượt này. Bảng kết quả có chọn nền tảng này nhưng không có dòng nào gán được cho nền tảng; báo cáo không suy ra và không ghi thành 0.</p>`;
      const observed = result.scopes.find(scope => scope.key === 'all')!;
      return `<p>Doanh thu quan sát: <strong>${number(observed.revenue.value, 'VND')}</strong>; sản lượng: <strong>${number(observed.units.value)}</strong>; ${observed.listingCount} dòng, ${observed.shopCount} gian hàng. ${source(result)}</p>`;
    }
    const rows = result === null
      ? ' Bảng kết quả có chọn nền tảng này nhưng không có dòng nào gán được cho nền tảng; báo cáo không suy ra và không ghi thành 0.'
      : ` Không phải tổng của danh sách giữ bên dưới. ${source(result)}`;
    return `<p>Doanh thu quan sát: ${headlineValue(figure.revenue, 'VND')}; sản lượng: ${headlineValue(figure.units, '')}. Đây là số của cả tập kết quả theo bộ lọc trên trang.${rows}</p>`;
  };
  const platformRows = capture.platforms.map(({ platform, result }) => {
    const records = result.input.records.map(row => `<tr><td>${escape(platformLabel(platform))}</td><td>${retainedSourceName(row.title)}</td><td>${number(row.revenue.value, 'VND')}</td><td>${number(row.units.value)}</td><td>${rowMark(row.revenue.source, citations)}<br>${rowMark(row.units.source, citations)}</td></tr>`);
    return `<h3>${escape(platformLabel(platform))}</h3>${platformSummary(platform, result)}${sectionId === 'M03'
      ? table(`${platformLabel(platform)} · số liệu từ bảng kết quả tìm kiếm đã lưu`, ['Nền tảng', 'Tên trên bảng kết quả', 'Doanh thu (VND)', 'Sản lượng', 'Nguồn'], records)
      : table(`${platformLabel(platform)} · cơ cấu trong bảng kết quả đã lưu`, ['Nền tảng', 'Tên trên bảng kết quả', 'Doanh thu (VND)', 'Sản lượng', 'Nguồn'], records)}`;
  }).join('') + capture.capture.platforms.filter(platform => !capture.platforms.some(value => value.platform === platform))
    .map(platform => `<h3>${escape(platformLabel(platform))}</h3>${platformSummary(platform, null)}`).join('');
  const unknown = capture.unattributedRows.length
    ? `<h3>Phụ lục: dòng không gán được sàn</h3><p>Các dòng sau không nêu được sàn, được đánh mã nội bộ ổn định trong bản lưu và <strong>không cộng vào Shopee hoặc TikTok Shop</strong>.</p>${table('Dòng không gán được sàn', ['Dòng nguồn', 'Tên trên bảng kết quả', 'Gian hàng', 'Doanh thu (VND)', 'Sản lượng'], capture.unattributedRows.map((row, index) => `<tr><td>${escape(readerProductLabel(row.listingId, null, index + 1))}</td><td>${retainedSourceName(row.title)}</td><td>${retainedSourceName(row.shop)}</td><td>${number(row.revenue, 'VND')}</td><td>${number(row.units)}</td></tr>`))}`
    : '<p>Không có dòng không gán được sàn.</p>';
  const truncation = capture.capture.truncation;
  const limitation = `Nguồn là <strong>bảng kết quả tìm kiếm đã lưu</strong>; danh sách bị giới hạn <strong>${truncation.cap} dòng đầu</strong> và giữ ${truncation.rowsRead} dòng trong ${truncation.pagesRead} trang${truncation.totalShown === null ? '' : ` trên ${truncation.totalShown} dòng hiển thị`}.${truncation.truncated ? ' Phần còn lại không được suy ra.' : ''}`;
  const context = `<p class="warning">${limitation} Đây là số liệu quan sát theo từng nền tảng từ bảng kết quả đã lưu, không phải quy mô toàn thị trường. Trường không có trong bảng kết quả được hiển thị là <strong>không có số liệu</strong>, không đổi thành 0.</p><dl class="reader-context"><dt>Nguồn gốc số liệu</dt><dd>Bảng kết quả tìm kiếm do người vận hành lưu lại · kỳ ${escape(capture.capture.measurementPeriod.startDate)} đến ${escape(capture.capture.measurementPeriod.endDate)}</dd><dt>Nền tảng</dt><dd>${capture.capture.platforms.map(platformLabel).map(escape).join(', ')}</dd></dl>`;
  return context + platformRows + unknown + `<details class="evidence-trace"><summary>Hồ sơ kỹ thuật của nguồn số liệu</summary><p>Không có tệp bảng tính trong nguồn này. Bảng kết quả tìm kiếm đã lưu, bản kê và mô tả nguồn được giữ trong gói phương pháp; mã kiểm tra toàn vẹn được đối chiếu khi dựng và mở báo cáo.</p><ul>${snapshot.limitations.map(limit => `<li>${escape(limit === 'CAPTURE_RESULTS_PAGE_TOP_N_LIMITED' ? 'Danh sách chỉ gồm các dòng đầu của bảng kết quả; không suy ra phần còn lại.' : limitationCopy(limit))}</li>`).join('')}</ul></details>`;
}
