import type { BoundedAnalysisGates, Source, Value, Scope, Period } from '../../../contracts/analysis/bounded-analysis-gates.generated.js';
import type { DecisionEvidencePackets, OwnerField, EvidenceGroup } from '../../../contracts/analysis/decision-evidence-packets.generated.js';
import { retainedEvidenceHtml, storedLiteral, technicalLiteral } from './research-automation/descriptive-report.js';

const LIMIT = 20;
const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
const download = '<a href="report-method-evidence.json" download>Tải toàn bộ hồ sơ phương pháp và bằng chứng</a>';
// Freeform declarations are projected only; the retained method input remains exact.
const text = (value: string | number | null): string => value === null ? 'Chưa khai báo (UNKNOWN)'
  : typeof value === 'number' ? esc(value) : storedLiteral(value, 'Nội dung được giữ trong bản lưu nguồn');
const pair = (name: string, html: string): string => `<dt>${esc(name)}</dt><dd>${html}</dd>`;
// Keep source context readable inside the approved report's narrow table cells.
const dl = (body: string): string => `<dl style="grid-template-columns:minmax(0,1fr);gap:4px">${body}</dl>`;
const disclosure = (title: string, body: string): string => `<details><summary>${esc(title)}</summary>${body}</details>`;
/** Owner-facing copy stays plain Vietnamese; the machine code stays in the HTML for the technical trace only. */
const codeMarker = (code: string, label = 'Mã trạng thái nguồn'): string =>
  `<details class="evidence-trace"><summary>${esc(label)}</summary><code>${esc(code)}</code></details>`;
const raw = retainedEvidenceHtml;
function at<T>(rows: readonly T[], pointer: string, prefix: string): T {
  const suffix = pointer.startsWith(prefix) ? pointer.slice(prefix.length) : '';
  const row = /^(0|[1-9]\d*)$/.test(suffix) ? rows[Number(suffix)] : undefined;
  if (row === undefined) throw new TypeError(`method packet HTML: UNRESOLVED_POINTER:${pointer}`);
  return row;
}
function source(value: Source | null): string {
  return value === null ? '<p>Chưa có tham chiếu nguồn.</p>' : dl(
    pair('Tệp nguồn', technicalLiteral(value.logicalPath)) + pair('Vị trí nguồn', `<code>${technicalLiteral(value.locator)}</code>`)
    + pair('SHA-256 nguồn', `<code>${esc(value.sha256)}</code>`));
}
const context = (value: unknown, reference: Source): string => disclosure('Ngữ cảnh đầy đủ và vị trí nguồn', source(reference) + raw(value));
const period = (value: Period | null): string => value === null ? 'Chưa khai báo (UNKNOWN)' : `${esc(value.start)} đến ${esc(value.end)}`;
function observation(value: Value | null): string {
  if (value === null) return 'Không có quan sát số được khai báo';
  if (value.state === 'missing') return 'Thiếu giá trị (missing)';
  if (value.state === 'UNKNOWN') return 'Chưa rõ (UNKNOWN)';
  return `${text(value.value)} <small>(${value.state === 'observed_zero' ? 'Số 0 được quan sát' : 'Giá trị được quan sát'})</small>`;
}
function scope(value: Scope): string {
  return dl(pair('Thước đo', text(value.measure)) + pair('Đơn vị', text(value.unit)) + pair('Kỳ', period(value.period))
    + pair('Múi giờ', text(value.timezone)) + pair('Phạm vi', text(value.universe)) + pair('Khung nguồn', text(value.frame))
    + pair('Quy tắc đưa vào', text(value.inclusionRule)));
}
const POLICY_LABELS: Readonly<Record<string, string>> = {
  revision: 'Phiên bản', modelId: 'Mô hình', baselineId: 'Baseline', historyMinimumDays: 'Số ngày lịch sử tối thiểu',
  horizonDays: 'Số ngày dự báo', gapPolicy: 'Xử lý khoảng trống', errorMetric: 'Thước đo sai số', selectionRule: 'Quy tắc chọn', refitRule: 'Quy tắc khớp lại',
};
const PROTOCOL_LABELS: Readonly<Record<string, string>> = {
  question: 'Câu hỏi', assignmentMechanism: 'Cơ chế phân bổ', assignmentUnit: 'Đơn vị phân bổ', treatment: 'Can thiệp', comparator: 'Đối chiếu',
  eligibility: 'Điều kiện đưa vào', instrumentation: 'Cách ghi nhận', outcome: 'Kết quả cần đo', unit: 'Đơn vị', window: 'Cửa sổ đo',
  exclusions: 'Loại trừ', attrition: 'Hao hụt', estimator: 'Phương pháp ước lượng', missingRule: 'Xử lý dữ liệu thiếu', uncertaintyRule: 'Quy tắc độ bất định', decisionRule: 'Quy tắc quyết định',
};
const owner = (value: OwnerField): string => value.state === 'UNSET' ? 'Chưa cung cấp (UNSET)' : `<span style="white-space:pre-wrap">${text(value.text)}</span>`;
const CONSTRAINT_LABELS: Readonly<Record<string, string>> = {
  cost: 'Chi phí', capability: 'Năng lực', time: 'Thời gian', risk: 'Rủi ro', accountableRole: 'Vai trò chịu trách nhiệm', criteria: 'Tiêu chí', reviewTrigger: 'Điều kiện xem xét lại',
};
function constraints(values: DecisionEvidencePackets['input']['constraints'] | DecisionEvidencePackets['input']['ownerOptions'][number]['constraints']): string {
  return dl(Object.entries(values).map(([key, value]) => pair(CONSTRAINT_LABELS[key] ?? key, owner(value))).join(''));
}
const statement: Readonly<Record<string, string>> = {
  LISTING_COUNT: 'Số listing quan sát', SHOP_COUNT: 'Số shop quan sát', OBSERVED_REVENUE: 'Doanh thu quan sát',
  OBSERVED_UNITS: 'Số đơn vị quan sát', TOP_SHOP_SHARE: 'Tỷ trọng shop trong phạm vi quan sát',
};
const anchorLink = (id: string): string => {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id)) throw new TypeError(`method packet HTML: INVALID_EVIDENCE_ANCHOR_ID:${id}`);
  return `<a href="#${esc(id)}">Xem toàn bộ hồ sơ phương pháp và bằng chứng</a>`;
};

/** Inputs are verified retained outputs; absence leaves the existing report path unchanged. */
export function renderReportMethodPacketSection(inputs: { gates?: BoundedAnalysisGates; decisions?: DecisionEvidencePackets }, sectionId: string, options?: { evidenceAnchorId: string }): string | undefined {
  const evidenceLink = options === undefined ? download : anchorLink(options.evidenceAnchorId);
  const remainderNote = options === undefined ? `Phần còn lại nằm trong bản tải đầy đủ. ${download}.` : `Phần còn lại nằm trong phần bằng chứng đầy đủ. ${evidenceLink}.`;
  const clipNote = (total: number): string => total > LIMIT
    ? `<p class="sec-note">Đang hiển thị ${LIMIT} trong ${total} mục theo thứ tự hồ sơ. ${remainderNote}</p>` : '';
  function list(values: readonly string[], empty = 'Không có mục được ghi nhận.'): string {
    return values.length ? `<ul class="limits">${values.slice(0, LIMIT).map(value => `<li>${text(value)}</li>`).join('')}</ul>${clipNote(values.length)}` : `<p>${esc(empty)}</p>`;
  }
  function table(caption: string, headings: readonly string[], rows: readonly string[], total = rows.length): string {
    return `<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0"><table class="obs${headings.length > 2 ? ' method-wide' : ''}"><caption>${esc(caption)}</caption><thead><tr>${headings.map(heading => `<th scope="col">${esc(heading)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>${clipNote(total)}`;
  }
  function footer(output: BoundedAnalysisGates | DecisionEvidencePackets, blockers: readonly string[]): string {
    return `<p class="sec-note">${evidenceLink}. Hồ sơ giữ nguyên khai báo và tham chiếu nguồn; vị trí đúng không xác thực ý nghĩa hoặc quyền phê duyệt.</p>`
      + disclosure('Điều kiện còn thiếu và giới hạn', list(blockers, 'Không có điều kiện thiếu được ghi nhận trong phép kiểm tra này.')
        + list(output.limitations) + dl(pair('Mã kết quả', `<code>${esc(output.methodOutputId)}</code>`)));
  }
  function m10(output: BoundedAnalysisGates): string {
    const section = output.sections.M10;
    const input = output.input.m10;
    let body = '<p><b>Chưa thực hiện dự báo (BLOCKED).</b> Chỉ kiểm tra cấu trúc chuỗi, lịch và cách chia kỳ. Không có dự báo, đánh giá baseline hay MAE.</p>';
    if (input === null || !section.partitions.length) body += '<p>Chưa có chuỗi nguồn để kiểm tra. Cần chuỗi theo ngày, đơn vị, khung nguồn và các kỳ chia dữ liệu.</p>';
    if (input !== null) {
      body += disclosure('Nguồn khai báo chuỗi', source(input.source));
      for (const partition of section.partitions.slice(0, LIMIT)) {
        const series = at(input.series, partition.seriesPointer, '/input/m10/series/');
        body += `<h4>${text(series.entityLiteral)}</h4><p>Cấu trúc: ${partition.structurallyComplete ? 'đầy đủ theo phép kiểm tra' : 'còn thiếu hoặc không tương thích'}. Trạng thái chia kỳ: ${esc(partition.splitStatus)}. Dự báo vẫn chưa được kích hoạt.</p>`
          + dl(pair('Thước đo', text(series.metric)) + pair('Đơn vị', text(series.unit)) + pair('Kỳ chuỗi', period(series.period))
            + pair('Múi giờ và ranh giới ngày', `${text(series.timezone)}; ${text(series.dailyBoundary)}`)
            + pair('Phạm vi', text(series.universe)) + pair('Khung nguồn', text(series.frame)) + pair('Quy tắc tổng hợp', text(series.aggregationRule)))
          + disclosure('Các kỳ chia dữ liệu', dl(pair('Huấn luyện', period(series.splits.train)) + pair('Xác thực', period(series.splits.validation)) + pair('Giữ lại để kiểm tra', period(series.splits.holdout))))
          + disclosure('Chính sách được khai báo, chưa phải cho phép thực thi', dl(Object.entries(series.policy).map(([key, value]) => pair(POLICY_LABELS[key] ?? key, text(value))).join('')))
          + disclosure('Ngày thiếu, chưa rõ và số 0', `<h5>Thiếu ngày trong lịch</h5>${list(partition.missingCalendarDates)}<h5>Thiếu giá trị</h5>${list(partition.missingValueDates)}<h5>Giá trị chưa rõ</h5>${list(partition.unknownValueDates)}<h5>Số 0 được quan sát</h5>${list(partition.observedZeroDates)}`)
          + table('Quan sát nguồn theo ngày', ['Ngày', 'Quan sát', 'Ngữ cảnh nguồn'], partition.recordPointers.slice(0, LIMIT).map(pointer => {
            const row = at(series.rows, pointer, `${partition.seriesPointer}/rows/`);
            return `<tr><th scope="row">${esc(row.date)}</th><td>${observation(row.observation)}</td><td>${context(row, row.source)}</td></tr>`;
          }), partition.recordPointers.length)
          + disclosure('Nguồn chuỗi và điều kiện còn thiếu', source(series.source) + list(partition.blockers));
      }
    }
    return body + clipNote(section.partitions.length) + footer(output, section.blockers);
  }
  /** Mirrors the gate's derived label so a derived cell shows exactly the group the gate counted. */
  const derivedGroupLabel = (cell: NonNullable<BoundedAnalysisGates['input']['i11']>['cells'][number]): string | null => {
    const basis = cell.groupBasis;
    if (!basis || basis.platform.state !== 'SOURCE_STATED' || basis.platform.value === null) return null;
    const buyer = basis.buyerType;
    const stated = buyer && buyer.state === 'SOURCE_STATED' && (buyer.value === 'RETAIL' || buyer.value === 'WHOLESALE');
    return stated ? `${basis.platform.value} / ${buyer.value}` : basis.platform.value;
  };
  function i11(output: BoundedAnalysisGates): string {
    const input = output.input.i11;
    const section = output.sections.I11;
    // U-04: 1.1.0 derives source-backed groups and may report a descriptive rate; 1.0.0 output stays byte-identical.
    const versioned = output.methodVersion !== '1.0.0';
    let body = versioned
      ? '<p><b>Danh mục nhóm nội bộ.</b> Nhóm chỉ được lấy từ nguồn nêu rõ nền tảng, kèm bán lẻ hoặc bán buôn khi nguồn tự khai báo; nguồn chỉ nêu nền tảng thì nhóm chỉ còn nền tảng, và nhóm nền tảng không bao giờ được hiểu là gộp mọi người mua hay đặt cạnh nhóm đã chia người mua. Tỷ lệ mô tả chỉ hiện khi mọi nhóm đủ ba mươi bản ghi văn bản, mẫu số tương thích và các bản ghi được đếm không trùng nhau; không suy diễn và không so sánh giữa các nhóm.</p>'
      : '<p><b>Danh mục nhóm nội bộ.</b> Giữ nguyên ô số và cách gán nhóm của nguồn. Không tính tỷ lệ hoặc chênh lệch; chưa có quyền công bố.</p>' + codeMarker('NOT_AUTHORIZED', 'Mã trạng thái công bố');
    if (input === null || !section.partitions.length) body += '<p>Chưa có ô dữ liệu nhóm. Cần nguồn gán nhóm, thước đo, đơn vị và phạm vi tương ứng.</p>';
    if (input !== null) {
      const policy = input.groupPolicy;
      body += policy === null
        ? (versioned ? '<p>Chưa có quy tắc nhóm được khai báo. Nhóm bên dưới lấy trực tiếp từ nguồn nêu rõ nền tảng và người mua.</p>' : '<p>Chưa có quy tắc nhóm được khai báo.</p>')
        : disclosure('Quy tắc và thứ tự nhóm của nguồn', dl(pair('Phiên bản', text(policy.revision)) + pair('Chồng lấn', esc(policy.overlap))
          + pair('Bao phủ', esc(policy.exhaustiveness)) + pair('Quy tắc ẩn ô', text(policy.suppressionRule)))
          + list(policy.groups.map(group => group.label)) + source(policy.source));
      for (const partition of section.partitions.slice(0, LIMIT)) {
        body += table('Ô nhóm trong cùng phạm vi, chưa tính so sánh', ['Nhóm nguồn', 'Ô số nguồn', 'Phạm vi và ngữ cảnh'], partition.cellPointers.slice(0, LIMIT).map(pointer => {
          const cell = at(input.cells, pointer, '/input/i11/cells/');
          const label = cell.group ?? (versioned ? derivedGroupLabel(cell) : null);
          const counted = versioned && cell.memberSources?.length ? `<small>Bản ghi nguồn được đếm: ${cell.memberSources.length}</small>` : '';
          return `<tr><th scope="row">${text(label)}<small>${cell.assignment.state === 'SOURCE_ASSIGNED' ? 'Nguồn gán nhóm' : 'Chưa rõ cách gán nhóm'}</small>${counted}${codeMarker(cell.assignment.state, 'Mã cách gán nhóm')}</th>`
            + `<td>${dl(pair('Tử số nguồn', observation(cell.numerator)) + pair('Mẫu số nguồn', observation(cell.denominator)) + pair('Đơn vị đếm', esc(cell.countUnit)))}</td>`
            + `<td>${scope(cell.scope)}${context(cell, cell.source)}</td></tr>`;
        }), partition.cellPointers.length) + disclosure('Điều kiện của phạm vi này', list(partition.blockers));
      }
      // Rates keep their owning partition index, so two compatible partitions are never merged into one comparison.
      if (versioned && section.rates !== null) body += table('Tỷ lệ mô tả theo nhóm, chỉ mô tả và không suy diễn', ['Phạm vi', 'Nhóm', 'Tử số', 'Mẫu số', 'Tỷ lệ'],
        section.rates.groups.map(group => `<tr><th scope="row">Phạm vi ${group.partition + 1}</th><td>${esc(group.group)}</td><td>${esc(group.numerator)}</td><td>${esc(group.denominator)}</td><td>${(group.rate * 100).toFixed(1)}%</td></tr>`));
      body += disclosure('Nguồn danh mục nhóm', source(input.source));
    }
    return body + clipNote(section.partitions.length) + footer(output, section.blockers);
  }
  function i12(output: BoundedAnalysisGates): string {
    const input = output.input.i12;
    const section = output.sections.I12;
    let body = '<p><b>Ba danh mục riêng.</b> Sự hiện diện không chứng minh tiếp xúc; tiếp xúc không chứng minh kết quả. Không nối các bản ghi, tính chuyển đổi hay hiệu quả.</p>';
    const inventories = [['Sự hiện diện (PRESENCE)', section.presencePointers], ['Tiếp xúc (EXPOSURE)', section.exposurePointers], ['Kết quả nguồn ghi nhận (OUTCOME)', section.outcomePointers]] as const;
    for (const [title, pointers] of inventories) {
      body += `<h4>${esc(title)}</h4>`;
      if (input === null || !pointers.length) { body += '<p>Chưa có bản ghi nguồn cho danh mục này.</p>'; continue; }
      body += table(title, ['Điểm tiếp xúc và lời quy thuộc', 'Quan sát riêng', 'Phạm vi và ngữ cảnh'], pointers.slice(0, LIMIT).map(pointer => {
        const row = at(input.records, pointer, '/input/i12/records/');
        return `<tr><th scope="row">${text(row.touchpoint)}<small>${text(row.attribution)}</small></th><td>${observation(row.observation)}`
          + dl(pair('Kênh', text(row.channel)) + pair('Ngày', text(row.date)) + pair('Cửa sổ quan sát', text(row.window)))
          + `</td><td>${scope(row.scope)}${context(row, row.source)}</td></tr>`;
      }), pointers.length);
    }
    if (input !== null) body += disclosure('Nguồn danh mục điểm tiếp xúc', source(input.source));
    return body + footer(output, section.blockers);
  }
  function i16(output: BoundedAnalysisGates): string {
    const input = output.input.i16;
    const section = output.sections.I16;
    let body = '<p><b>Chưa thực hiện.</b> Ước lượng và độ bất định chưa có (null).</p>' + codeMarker('NOT_EXECUTED', 'Mã trạng thái thực thi');
    if (input === null) body += '<p>Chưa có thiết kế hoặc hồ sơ kết quả có sẵn. Cần đề cương và các trường phương pháp trước khi kiểm tra điều kiện.</p>';
    else {
      body += (input.mode === 'DESIGN_ONLY'
        ? '<p>Chỉ lưu thiết kế, chưa có kết quả thực nghiệm.</p>' + codeMarker('DESIGN_ONLY', 'Mã chế độ thực thi')
        : '<p>Chỉ kiểm tra điều kiện hồ sơ kết quả có sẵn, không tạo kết quả hoặc ước lượng tác động.</p>' + codeMarker('ELIGIBILITY_ONLY', 'Mã chế độ thực thi'))
        + `<p>Cấu trúc: ${section.structurallyComplete ? 'đầy đủ theo phép kiểm tra' : 'còn thiếu hoặc không tương thích'}.</p>`
        + dl(Object.entries(input.fields).map(([key, value]) => pair(PROTOCOL_LABELS[key] ?? key, text(value))).join(''))
        + disclosure('Đề cương và nguồn khai báo', source(input.protocolRef) + source(input.source))
        + disclosure('Trường còn thiếu', list(section.missingFields));
      if (section.outcomePointers.length) body += table('Quan sát có sẵn, không phải ước lượng tác động', ['Nhánh và kết quả', 'Ô số nguồn', 'Ngữ cảnh'], section.outcomePointers.slice(0, LIMIT).map(pointer => {
        const row = at(input.outcomes, pointer, '/input/i16/outcomes/');
        return `<tr><th scope="row">${esc(row.arm)}<small>${text(row.outcome)}</small></th><td>`
          + dl(pair('Quan sát', observation(row.observation)) + pair('Mẫu số', observation(row.denominator)) + pair('Đơn vị', text(row.unit)))
          + `</td><td><p>${section.incompatibleOutcomePointers.includes(pointer) ? 'Không tương thích với đề cương.' : 'Chỉ là ô nguồn để kiểm tra điều kiện.'}</p>${context(row, row.source)}</td></tr>`;
      }), section.outcomePointers.length);
      else body += '<p>Chưa có quan sát kết quả được đưa vào phép kiểm tra.</p>';
    }
    return body + footer(output, section.blockers);
  }
  function claims(output: DecisionEvidencePackets, keys: readonly string[], title: string): string {
    if (!keys.length) return `<h5>${esc(title)}</h5><p>Chưa có quan sát được gắn vào mục này.</p>`;
    return table(title, ['Quan sát nguyên giá trị', 'Trạng thái và ngữ cảnh'], keys.slice(0, LIMIT).map(key => {
      const item = output.inventory.find(item => item.claimKey === key);
      const claim = item === undefined ? undefined : output.input.claims[item.inputIndex];
      if (claim === undefined) throw new TypeError('method packet HTML: UNKNOWN_CLAIM');
      const fact = claim.payload;
      const review = claim.reviewDeclaration.state === 'DECLARED_REVIEWED' ? 'Khai báo đã rà soát, chưa xác thực thành phê duyệt'
        : claim.reviewDeclaration.state === 'EXCLUDED' ? 'Được khai báo loại ra (EXCLUDED), không phải bằng chứng hỗ trợ đã duyệt' : 'Chưa rà soát';
      return `<tr><th scope="row">${esc(statement[fact.statementKind] ?? fact.statementKind)}<small>${esc(fact.sectionId)} · ${esc(fact.claimId)}</small>${codeMarker(claim.reviewDeclaration.state, 'Mã trạng thái rà soát')}</th><td>`
        + dl(pair('Giá trị nguồn', `${text(fact.value)} ${text(fact.unit)}`) + pair('Phạm vi', text(fact.scopeKey)) + pair('Rà soát', review)
          + pair('Phê duyệt của quan sát', esc(fact.approvalState)) + pair('Hỗ trợ quyết định', 'Cần người xem xét' + codeMarker('HUMAN_REVIEW_REQUIRED', 'Mã hỗ trợ quyết định')))
        + disclosure('Toàn bộ quan sát, mẫu số, giới hạn và tham chiếu', dl(pair('Tệp dữ liệu nền', technicalLiteral(claim.reference.fileName))
          + pair('SHA-256 metric-result.json', `<code>${esc(claim.reference.sha256)}</code>`)
          + pair('Vị trí claim hiện tại trong packet.json', `<code>${technicalLiteral(claim.reference.claimPointer)}</code>`)
          + pair('Vị trí metric trong metric-result.json', `<code>${technicalLiteral(fact.metricPointer)}</code>`)
          + pair('Tham chiếu mẫu số', fact.denominatorPointer === null ? 'Không có tham chiếu mẫu số (null)' : `<code>${technicalLiteral(fact.denominatorPointer)}</code>`)
          + pair('Ghi chú rà soát', text(claim.reviewDeclaration.reason))) + list(fact.limitations) + raw(claim)) + '</td></tr>';
    }), keys.length);
  }
  function group(output: DecisionEvidencePackets, value: EvidenceGroup): string {
    return `<h4>${text(value.label)}</h4><p>${value.basis === 'OWNER_DECLARATION' ? 'Nhóm do chủ dự án khai báo.' : 'Danh mục theo mục nguồn; chưa có giả thuyết do chủ dự án khai báo.'} Chưa xác lập ưu tiên; cần người xem xét.</p>`
      + claims(output, value.claimKeys, 'Quan sát được gắn vào nhóm') + claims(output, value.counterclaimKeys, 'Bằng chứng ngược được khai báo')
      + claims(output, value.excludedClaimKeys, 'Quan sát được khai báo loại ra') + disclosure('Bằng chứng còn thiếu', list(value.missingEvidence, 'Chưa khai báo phần bằng chứng còn thiếu; không có nghĩa hồ sơ đã đầy đủ.'));
  }
  function decisionsBody(output: DecisionEvidencePackets, id: 'M01' | 'M11' | 'M12' | 'I14' | 'I15'): string {
    let body = '<p class="sec-note">Danh mục bằng chứng chưa xếp hạng. Khai báo của chủ dự án và khai báo đã rà soát không xác thực quyền phê duyệt. Mọi quan sát vẫn cần người xem xét.</p>' + codeMarker('HUMAN_REVIEW_REQUIRED', 'Mã hỗ trợ quyết định')
      + dl(pair('Câu hỏi được khai báo', owner(output.input.question)));
    if (id === 'M01') {
      const result = output.sections.M01;
      body += '<p><b>Chưa có kết luận tổng hợp (null).</b> Các giá trị giữ nguyên phạm vi và đơn vị; không cộng hoặc xếp hạng.</p>'
        + `<p>${result.declaredReviewedClaimKeys.length} quan sát có khai báo đã rà soát; ${result.unreviewedClaimKeys.length} chưa rà soát; ${result.excludedClaimKeys.length} được khai báo loại ra.</p>`
        + claims(output, result.claimKeys, 'Danh mục quan sát nguyên bản')
        + disclosure('Liên hệ với câu hỏi được khai báo', claims(output, result.questionClaimKeys, 'Quan sát được gắn với câu hỏi')
          + claims(output, result.unassignedClaimKeys, 'Quan sát chưa gắn với câu hỏi'));
    } else if (id === 'M11' || id === 'I14') {
      const groups = id === 'M11' ? output.sections.M11.groups : output.sections.I14.directions;
      if (!groups.length) body += `<p>${id === 'M11' ? 'Chưa có nhóm bằng chứng hoặc giả thuyết.' : 'Chưa có hướng do chủ dự án khai báo.'} Cần khai báo nội dung và bằng chứng liên quan trước khi xem xét.</p>`;
      body += groups.slice(0, LIMIT).map(value => group(output, value)).join('') + clipNote(groups.length)
        + claims(output, output.sections[id].unassignedClaimKeys, 'Quan sát chưa được gắn vào nhóm');
      if (id === 'I14') {
        const ambiguous = output.sections.I14.ambiguousClaims;
        body += '<h4>Quan sát gắn với nhiều hướng</h4>' + (ambiguous.length ? table('Liên hệ còn nhập nhằng, chưa tự chọn hướng', ['Quan sát', 'Các hướng được khai báo'], ambiguous.slice(0, LIMIT).map(value =>
          `<tr><th scope="row"><code>${esc(value.claimKey)}</code></th><td>${list(value.directionIndexes.map(index => {
            const direction = output.sections.I14.directions[index];
            if (direction === undefined) throw new TypeError('method packet HTML: UNKNOWN_DIRECTION');
            return direction.label;
          }))}</td></tr>`), ambiguous.length) : '<p>Không có liên hệ nhiều hướng được ghi nhận; điều này chưa xác thực mức phù hợp của từng hướng.</p>');
      }
    } else if (id === 'I15') {
      const result = output.sections.I15;
      body += '<p><b>Chưa có phương án ưu tiên (null).</b> Thứ tự dưới đây là thứ tự khai báo của chủ dự án.</p>';
      if (!result.options.length) body += '<p>Chưa có phương án được khai báo. Chi phí, năng lực, thời gian và rủi ro chưa được suy đoán.</p>';
      for (const option of result.options.slice(0, LIMIT)) {
        body += `<h4>${text(option.label)}</h4>${constraints(option.constraints)}`
          + claims(output, option.claimKeys, 'Quan sát gắn với phương án') + claims(output, option.counterclaimKeys, 'Bằng chứng ngược được khai báo')
          + claims(output, option.excludedClaimKeys, 'Quan sát được khai báo loại ra')
          + disclosure('Bằng chứng còn thiếu', list(option.missingEvidence, 'Chưa khai báo phần còn thiếu; không có nghĩa phương án đã đủ bằng chứng.'));
      }
      body += clipNote(result.options.length) + claims(output, result.unassignedClaimKeys, 'Quan sát chưa gắn với phương án');
    } else {
      const result = output.sections.M12;
      body += '<p><b>Quyết định còn mở (OPEN).</b> Chưa chọn phương án (chosen: null); chưa có quyền thực thi (executionAuthorization: null).</p>'
        + constraints(result.constraints) + '<h4>Phương án do chủ dự án khai báo</h4>'
        + list(result.ownerOptionIndexes.map(index => {
          const option = output.input.ownerOptions[index];
          if (option === undefined) throw new TypeError('method packet HTML: UNKNOWN_OPTION');
          return option.label;
        }), 'Chưa có phương án được khai báo.') + claims(output, result.claimKeys, 'Quan sát để người có thẩm quyền xem xét');
    }
    return body + footer(output, output.sections[id].blockers);
  }

  if (inputs.gates !== undefined) {
    switch (sectionId) {
      case 'M10': return m10(inputs.gates);
      case 'I11': return i11(inputs.gates);
      case 'I12': return i12(inputs.gates);
      case 'I16': return i16(inputs.gates);
    }
  }
  if (inputs.decisions !== undefined) {
    switch (sectionId) {
      case 'M01': case 'M11': case 'M12': case 'I14': case 'I15': return decisionsBody(inputs.decisions, sectionId);
    }
  }
  return undefined;
}
