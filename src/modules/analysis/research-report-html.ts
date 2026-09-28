import type { SourceBackedReportBundle } from './source-backed-report.js';
import type { ResearchChartValue } from './research-report-charts.js';

const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);
const anchor = (value: string): string => encodeURIComponent(value);
const scopeName = { all: 'ALL · Toàn bộ file', wide: 'WIDE · Phạm vi rộng', core: 'CORE · Nhóm lõi' };
const labels: Record<string, string> = {
  listings: 'Số listing', shops: 'Số shop', revenue: 'Doanh thu quan sát', units: 'Sản lượng quan sát',
  top1: 'Top 1 shop', top3: 'Top 3 shop', top10: 'Top 10 shop',
};
const states: Record<string, string> = {
  BLOCKED: 'Chưa đủ điều kiện', METHOD_ONLY: 'Mới có phương pháp',
  NOT_IMPLEMENTED: 'Chưa triển khai phương pháp', MANUAL_REVIEW_REQUIRED: 'Cần người xem xét',
  SCENARIO_ONLY: 'Chỉ là kịch bản giả định', PARTIAL_DETERMINISTIC_DRAFT: 'Một phần số liệu · bản nháp',
};
const limitations: Record<string, string> = {
  OBSERVED_EXPORT_SCOPE_NOT_MARKET_UNIVERSE: 'Chỉ phản ánh dữ liệu trong file xuất, không phải toàn thị trường.',
  ACQUISITION_TIME_UNCONFIRMED: 'Chưa xác nhận thời điểm thu nhận nguồn.',
  FULL_SECTION_METHOD_NOT_IMPLEMENTED: 'Chưa triển khai đầy đủ phương pháp của section.',
  RAW_SOURCE_NOT_REVERIFIED: 'Packet A3 riêng không đọc lại file gốc; xem biên bản nguồn của bản xuất này.',
  OWNER_REVIEW_REQUIRED: 'Chưa có quyết định duyệt của chủ sở hữu.',
  OVERLAPPING_SCOPE_MEMBERSHIP_NON_ADDITIVE: 'Các phạm vi có phần giao nhau; không cộng các thanh.',
  CUMULATIVE_TOP_K_SHARES_OVERLAP_NOT_DONUT: 'Top 1 nằm trong Top 3 và Top 10; không cộng các tỷ trọng.',
  MISSING_REVENUE: 'Thiếu doanh thu ở một số dòng.', MISSING_UNITS: 'Thiếu sản lượng ở một số dòng.',
  NON_EXACT_REVENUE: 'Nguồn có doanh thu làm tròn, ước tính hoặc chưa rõ độ chính xác.',
  NON_EXACT_UNITS: 'Nguồn có sản lượng làm tròn, ước tính hoặc chưa rõ độ chính xác.',
  BLOCKED_LABELS: 'Cần nhãn phân loại hợp lệ và khớp phiên bản dữ liệu.',
  NO_ELIGIBLE_DENOMINATOR: 'Chưa có mẫu số đủ điều kiện để tính tỷ trọng.',
  EMPTY_SCOPE: 'Phạm vi chưa có dòng dữ liệu.', ZERO_REVENUE: 'Doanh thu quan sát bằng 0.',
  NO_SOURCE_BOUND_SYNTHESIS: 'Cần bản tổng hợp nhận định gắn với bằng chứng.',
  A2_MANIFEST_AND_VERIFIED_INPUT_REQUIRED: 'Cần khai báo nguồn và dữ liệu đầu vào đã kiểm tra.',
  A1_RESULT_AND_EXPLICIT_SCOPE_REQUIRED: 'Cần kết quả tính toán và phạm vi đo rõ ràng.',
  A1_RESULT_AND_LABEL_FRESHNESS_REQUIRED: 'Cần kết quả tính toán cùng nhãn phân loại còn hiệu lực.',
  DOMAIN_EVIDENCE_REQUIRED: 'Cần bằng chứng về nhu cầu với phạm vi và mẫu số phù hợp.',
  NARROW_ENTITY_AND_IMPORT_PROFILE_REQUIRED: 'Cần xác định đúng sản phẩm và hồ sơ dữ liệu nhập khẩu.',
  COMPARABLE_ENTITY_UNIVERSE_REQUIRED: 'Cần tập sản phẩm hoặc shop có thể so sánh trong cùng kỳ.',
  SELLER_INPUTS_AND_FEE_VERSION_REQUIRED: 'Cần chi phí của người bán và đúng phiên bản biểu phí.',
  EVENT_TO_ENTITY_LINKAGE_REQUIRED: 'Cần liên kết sự kiện với đúng đối tượng và thời gian.',
  DAILY_SERIES_AND_HOLDOUT_REQUIRED: 'Cần chuỗi số liệu theo ngày và tập kiểm định giữ riêng.',
  SOURCE_BOUND_OPPORTUNITY_EVIDENCE_REQUIRED: 'Cần bằng chứng cụ thể cho cơ hội được đề xuất.',
  OWNER_DECISION_CONTEXT_REQUIRED: 'Cần mục tiêu, ràng buộc và bối cảnh quyết định của chủ dự án.',
  SOURCE_MANIFEST_AND_REPLAY_LINEAGE_REQUIRED: 'Cần danh mục nguồn và liên kết cho phép kiểm tra lại kết quả.',
  OWNER_QUESTION_REQUIRED: 'Cần câu hỏi kinh doanh do chủ dự án xác nhận.',
  CASE_OR_STUDY_LOCATORS_REQUIRED: 'Cần vị trí nguồn của từng trường hợp hoặc nghiên cứu.',
  SOURCE_METHOD_PACKET_REQUIRED: 'Cần hồ sơ phương pháp gắn với nguồn sử dụng.',
  EPISODE_LOCATORS_AND_OUTCOME_REQUIRED: 'Cần nguồn của chuỗi hành vi và kết quả tương ứng.',
  QUOTE_CONTEXT_AND_DENOMINATOR_REQUIRED: 'Cần ngữ cảnh trích dẫn và mẫu số phù hợp.',
  LINKED_JOURNEY_EPISODE_REQUIRED: 'Cần các sự kiện được liên kết thành cùng một hành trình.',
  CHOICE_CASE_AND_OUTCOME_CONTEXT_REQUIRED: 'Cần trường hợp lựa chọn cùng ngữ cảnh và kết quả.',
  BARRIER_CASE_AND_CONTEXT_REQUIRED: 'Cần trường hợp rào cản cụ thể và ngữ cảnh của nó.',
  ANSWER_GAP_EVIDENCE_AND_SCOPE_REQUIRED: 'Cần bằng chứng và phạm vi của câu hỏi chưa được giải đáp.',
  SOURCE_IDS_AND_DEDUP_RULE_REQUIRED: 'Cần định danh nguồn và quy tắc loại trùng.',
  COMPARABLE_GROUPS_AND_DENOMINATORS_REQUIRED: 'Cần nhóm có thể so sánh và mẫu số của từng nhóm.',
  EXPOSURE_AND_OUTCOME_COMPATIBILITY_REQUIRED: 'Cần dữ liệu tiếp xúc và kết quả có thể liên kết với nhau.',
  CONTENT_LOCATORS_AND_SAMPLING_SCOPE_REQUIRED: 'Cần vị trí nội dung nguồn và phạm vi lấy mẫu.',
  VALIDATED_SOURCE_BOUND_CLAIMS_REQUIRED: 'Cần nhận định đã kiểm tra và gắn với nguồn.',
  OWNER_BRIEF_AND_TRADEOFF_INPUTS_REQUIRED: 'Cần yêu cầu của chủ dự án và dữ liệu để so sánh đánh đổi.',
  RELEVANT_OUTCOME_MEASUREMENT_REQUIRED: 'Cần phép đo kết quả phù hợp với câu hỏi thử nghiệm.',
  EVIDENCE_LEDGER_AND_LOCATORS_REQUIRED: 'Cần danh mục bằng chứng và vị trí nguồn có thể kiểm tra.',
};
function explain(code: string): string {
  return limitations[code] ?? limitations[code.split(':').at(-1)!] ?? code;
}
function listLimits(codes: readonly string[]): string {
  return `<ul class="limits">${[...new Set(codes.map(explain))].map(text => `<li>${escape(text)}</li>`).join('')}</ul>`;
}
function number(value: string | number, unit: string): string {
  // String grouping preserves every digit; never convert financial values to Number.
  const [whole, decimal] = String(value).split('.');
  const formatted = whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${formatted}${decimal === undefined ? '' : `,${decimal}`} ${escape(unit === 'percent' ? '%' : unit === 'unit' ? 'đơn vị' : unit)}`;
}
function width(value: string | number, max: bigint): string {
  return max === 0n ? '0' : String(Number(BigInt(value) * 10000n / max) / 100);
}
function shortDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

/** Render only a bundle built through the raw-source verified application boundary. */
export function renderResearchReportHtml(bundle: SourceBackedReportBundle, semanticVersionId?: string): string {
  const { result, packet, charts, files } = bundle;
  const scope = result.input.scope;
  const workspace = JSON.parse(files.get('workspace.json')!.toString('utf8')) as { title: string };
  const allPoints = [...charts.totals.scopes, ...charts.topShopShare.scopes].flatMap(lane => lane.points);
  const factLink = (point: ResearchChartValue): string =>
    `<a class="value" href="#claim-${anchor(point.claimId)}" aria-label="${escape(`${labels[point.metric]} ${scopeName[point.source.scopeKey]}: ${point.valueText} ${point.unit}. Xem bằng chứng`)}">${number(point.valueText, point.unit)}</a>`;
  const metricChart = (metric: string): string => {
    const points = charts.totals.scopes.map(lane => lane.points.find(point => point.metric === metric));
    const max = points.reduce((prior, point) => point && BigInt(point.valueText) > prior ? BigInt(point.valueText) : prior, 0n);
    return `<figure><figcaption>${escape(labels[metric])}</figcaption>${charts.totals.scopes.map((lane, i) => {
      const point = points[i];
      return `<div class="plot-row"><span>${scopeName[lane.scopeKey]}</span>${point ? `${factLink(point)}<div class="track" aria-hidden="true"><span style="width:${width(point.valueText, max)}%"></span></div>` : `<p class="missing">Chưa có số đủ điều kiện. ${escape(lane.blockers.map(explain).join(' '))}</p>`}</div>`;
    }).join('')}<p class="caption">Cùng kỳ và đơn vị; các phạm vi giao nhau, không cộng lại. Độ dài thanh so với giá trị lớn nhất đang hiển thị.</p></figure>`;
  };
  const concentration = charts.topShopShare.scopes.map(lane => `<figure><figcaption>${scopeName[lane.scopeKey]}</figcaption>${lane.points.length ? lane.points.map(point => `<div class="plot-row"><span>${escape(labels[point.metric])}</span>${factLink(point)}<div class="track" aria-hidden="true"><span style="width:${(point.basisPoints ?? 0) / 100}%"></span></div><small>Mẫu số: ${number(point.denominator!.value, 'VND')} trong phạm vi này.</small></div>`).join('') : `<p class="missing">Chưa thể tính tỷ trọng.</p>${listLimits(lane.blockers)}`}<p class="caption">Thang 0–100%. Tỷ trọng lũy kế, không phải thị phần toàn thị trường.</p></figure>`).join('');
  const claims = allPoints.map(point => `<details class="claim"><summary>${escape(labels[point.metric])} · ${scopeName[point.source.scopeKey]} · ${number(point.valueText, point.unit)}</summary><div id="claim-${escape(point.claimId)}"><dl>
    <dt>Nhận diện quan sát</dt><dd><code>${escape(point.claimId)}</code></dd>
    <dt>Phép tính</dt><dd>${escape(result.methodVersion)} · làm tròn ${escape(result.rounding)}</dd>
    <dt>Giá trị trong kết quả</dt><dd><a href="metric-result.json" download>Result JSON</a> · <code>${escape(point.metricPointer)}</code></dd>
    <dt>Tập dòng được tính</dt><dd><a href="#members-${point.source.scopeKey}">Xem thành viên ${point.source.scopeKey.toUpperCase()}</a> · <code>${escape(point.membershipPointer)}</code></dd>
    ${point.numerator ? `<dt>Tử số</dt><dd>${number(point.numerator.value, point.numerator.unit)} · <code>${escape(point.numerator.pointer)}</code></dd>` : ''}
    ${point.denominator ? `<dt>Mẫu số</dt><dd>${number(point.denominator.value, point.denominator.unit)} · <code>${escape(point.denominator.pointer)}</code></dd>` : ''}
    <dt>Độ phủ</dt><dd><code>${escape(point.coveragePointer ?? 'Số đếm thành viên; không phải tỷ lệ phủ toàn thị trường')}</code></dd>
    <dt>Digest Result</dt><dd><code>${escape(point.resultSha256)}</code></dd>
    </dl>${listLimits(point.limits)}<p><a href="#charts">Quay về chart</a></p></div></details>`).join('');
  const memberships = result.scopes.map(lane => `<details><summary>${scopeName[lane.key]} · ${lane.recordIndices.length} dòng thành viên${lane.status === 'BLOCKED_LABELS' ? ' · bị chặn bởi nhãn' : ''}</summary><div id="members-${lane.key}"><p>Chỉ số trong dữ liệu chuẩn hóa (bắt đầu từ 0), không phải số dòng Excel.</p><p class="members">${lane.recordIndices.map(index => `<a href="#row-${index}">${index}</a>`).join(' ') || 'Không có thành viên đủ điều kiện.'}</p></div></details>`).join('');
  const observations = result.input.records.map((record, index) => `<tr id="row-${index}"><th scope="row">${index}</th><td>${escape(record.title)}<br><small>shop ${escape(record.shopId)} · listing ${escape(record.listingId)}</small></td><td>${record.revenue.value === null ? 'Thiếu' : number(record.revenue.value, 'VND')}<br><small>${escape(record.revenue.state)} · ${escape(record.revenue.precision)}<br>${escape(record.revenue.source.locator)}</small></td><td>${record.units.value === null ? 'Thiếu' : number(record.units.value, 'unit')}<br><small>${escape(record.units.state)} · ${escape(record.units.precision)}<br>${escape(record.units.source.locator)}</small></td><td>${escape(record.label?.classification ?? 'Chưa có nhãn')}<br><small>${escape(record.source.locator)}</small></td></tr>`).join('');
  const readiness = packet.sections.map(section => {
    const definition = packet.catalog.sections.find(item => item.sectionId === section.sectionId)!;
    return `<details class="section-readiness"${section.claimIds.length ? ' open' : ''}><summary class="readiness-summary"><span>${escape(section.sectionId)} · ${escape(definition.title)}</span><span class="section-state">${escape(states[section.deliveryState] ?? section.deliveryState)}</span></summary>${section.claimIds.length ? `<p>${section.claimIds.length} quan sát định lượng có thể truy nguồn.</p>` : ''}${listLimits(section.blockers)}<details><summary>Điều kiện gốc và mã phương pháp</summary><p>${escape(definition.reopenCondition)}</p><p><code>${escape(definition.methodId)} · ${escape(definition.methodVersion)}</code></p><ul>${section.blockers.map(code => `<li><code>${escape(code)}</code></li>`).join('')}</ul></details></details>`;
  }).join('');
  const readinessSummary = [...new Set(packet.sections.map(section => section.deliveryState))]
    .map(state => `${packet.sections.filter(section => section.deliveryState === state).length} mục: ${states[state] ?? state}`);
  const downloads = [
    ['raw-workbook.xlsx', 'Workbook gốc'], ['raw-manifest.json', 'Khai báo phạm vi gốc'],
    ['raw-labels.json', 'Nhãn phân loại gốc'], ['source-package-manifest.json', 'Danh mục gói nguồn'],
    ['normalized-input.json', 'Dữ liệu chuẩn hóa'], ['receipt.json', 'Biên bản ánh xạ ô nguồn'],
    ['metric-result.json', 'Kết quả tính toán'], ['charts.json', 'Chart và liên kết bằng chứng'],
    ['packet.json', 'Packet báo cáo'], ['section-catalog.json', 'Phương pháp / điều kiện section'],
    ['workspace.json', 'Workspace đã xác minh'],
    ['semantic-content.json', 'Phiên bản nội dung'], ['review-state.json', 'Trạng thái duyệt'],
  ].filter(([file]) => files.has(file!)).map(([file, label]) => `<li><a href="${file}" download>${label}</a></li>`).join('');
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(workspace.title)} · Báo cáo bằng chứng</title><style>
:root{color-scheme:light;--ink:#172e43;--muted:#536a7c;--line:#dfe7ed;--canvas:#dfe8ed;--teal:#087e8b;--blue:#2457c5}*{box-sizing:border-box}html{scroll-padding-top:20px}body{margin:0;background:var(--canvas);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}::selection{background:#e1ebff;color:var(--ink)}a{color:var(--blue);text-underline-offset:3px}a:hover{text-decoration-thickness:2px}:focus-visible{outline:3px solid var(--blue);outline-offset:4px}.skip{position:absolute;left:12px;top:-80px;padding:12px;background:white}.skip:focus{top:12px}main{max-width:1180px;margin:32px auto;background:white;padding:32px;border-radius:14px}h1{font-size:32px;line-height:1.2;letter-spacing:-.03em;margin:0 0 16px;text-wrap:balance}h2{font-size:24px;margin:0 0 12px}h3{font-size:18px}p{max-width:75ch}header{padding-bottom:24px;border-bottom:1px solid var(--line)}.status{display:inline-block;padding:5px 12px;border-radius:99px;background:#fff4d5;color:#79520e;font-weight:700}.meta{display:flex;flex-wrap:wrap;gap:8px 24px;color:var(--muted)}nav{display:flex;gap:16px;flex-wrap:wrap;margin:20px 0}section{margin-top:36px}.layers{display:flex;flex-wrap:wrap;padding:0;list-style:none;gap:12px 24px}.layers li{max-width:240px}.layers strong{display:block}.muted,small,.caption{color:var(--muted)}.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}figure{margin:0;padding:20px 0;border-top:1px solid var(--line)}figcaption{font-size:18px;font-weight:700;margin-bottom:16px}.plot-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 12px;margin:16px 0}.value{font-variant-numeric:tabular-nums;font-weight:700;overflow-wrap:anywhere}.track{grid-column:1/-1;height:12px;background:#edf2f5;overflow:hidden;border-radius:3px}.track span{display:block;height:100%;background:var(--teal)}.plot-row small,.plot-row .missing{grid-column:1/-1}.missing{color:#79520e;background:#fff4d5;padding:12px;margin:0}.caption{font-size:13px}.limits{padding-left:20px;max-width:75ch}.limits li{margin:6px 0}details{border-top:1px solid var(--line);padding:14px 0}summary{cursor:pointer;font-weight:600;min-height:24px}summary:hover{color:var(--blue)}details:target,tr:target{background:#e1ebff}dl{display:grid;grid-template-columns:190px minmax(0,1fr);gap:10px 16px}dt{font-weight:600}dd{margin:0;overflow-wrap:anywhere}code{font-size:13px;overflow-wrap:anywhere}.table-wrap{overflow:auto;max-width:100%;scrollbar-color:var(--muted) #edf2f5}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}th,td{padding:12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--line)}thead th{background:#edf2f5}td .limits{margin-top:0}#source-rows table{min-width:750px}.members{display:flex;gap:6px;flex-wrap:wrap}.members a{min-width:38px;padding:6px;text-align:center;background:#edf2f5;border-radius:8px}.downloads{display:flex;gap:12px 24px;flex-wrap:wrap;padding-left:20px}footer{border-top:1px solid var(--line);margin-top:36px;padding-top:20px;color:var(--muted)}@media(max-width:700px){main{margin:0;padding:20px;border-radius:0}h1{font-size:26px}.charts{grid-template-columns:1fr}.plot-row{grid-template-columns:1fr}.value{justify-self:start}dl{grid-template-columns:1fr;gap:4px}dd{margin-bottom:12px}.layers{display:block}.layers li{max-width:none;margin:12px 0}th,td{padding:8px}section{margin-top:28px}}@media print{body{background:white;font-size:10pt}main{max-width:none;margin:0;padding:0}.skip,nav{display:none}a{color:inherit}a.value{text-decoration:none}.charts{display:block}figure,tr{break-inside:avoid}section{break-before:auto}.table-wrap{overflow:visible}#source-rows table{min-width:0}details>*{display:block}details{break-inside:auto}summary{list-style:none}.track{-webkit-print-color-adjust:exact;print-color-adjust:exact}code{font-size:8pt}}
h2{font-size:20px}h3,figcaption{font-size:16px}summary{min-height:44px;padding:8px 0}.readiness-summary{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px 20px;align-items:baseline}.readiness-summary>span:first-child{flex:1 1 250px}.section-state{font-size:13px;color:var(--muted);font-weight:400}.section-readiness[open]>.readiness-summary{color:var(--blue)}.section-readiness details{margin-left:16px;font-size:13px}.members a{min-width:44px;min-height:44px}nav a,.downloads a{display:inline-flex;align-items:center;min-height:44px}.track{border-radius:0}@media(max-width:700px){.readiness-summary{display:block}.section-state{display:block;margin-top:4px}.section-readiness details{margin-left:0}}@media print{.section-state{color:var(--ink)}}
:focus-visible{outline-color:var(--teal)}.value{display:inline-flex;align-items:center;justify-content:flex-end;min-width:44px;min-height:44px}.plot-row{align-items:center}details:has(>:target){background:#e1ebff}.layer-overview{margin-top:20px}.layers li{flex:1 1 180px}.layers{margin-bottom:0}@media(max-width:700px){header{padding-bottom:8px}header details{padding:4px 0}header nav{gap:0 12px;margin:4px 0}header .status{margin:8px 0 12px}.layer-overview{margin-top:16px}.layer-overview h2{font-size:16px;margin-bottom:8px}.layers{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 16px;margin-top:0;font-size:13px}.layers li{margin:0}.plot-row .value{justify-content:flex-start}#charts{margin-top:20px}#charts>p{font-size:13px}}
@media(max-width:700px){.plot-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.plot-row .value{justify-self:end;justify-content:flex-end;text-align:right}}
</style></head><body><a class="skip" href="#charts">Đến số liệu và chart</a><main><header><h1>${escape(workspace.title)} · Báo cáo bằng chứng</h1><p class="status">Bản nháp nội bộ · Chưa duyệt</p><div class="meta"><span>${escape(scope.platform)} · bộ lọc ${escape(scope.selection)}</span><span>Kỳ đo: ${escape(shortDate(scope.start))} → ${escape(shortDate(scope.end))}</span><span>Thu nhận (theo nguồn): ${escape(scope.acquiredAt === null ? 'chưa xác nhận' : shortDate(scope.acquiredAt))}</span></div><details><summary>Thời gian và kiểm tra nguồn</summary><dl><dt>Kỳ đo</dt><dd><code>${escape(scope.start)} / ${escape(scope.end)}</code></dd><dt>Thu nhận</dt><dd><code>${escape(scope.acquiredAt ?? 'chưa xác nhận')}</code></dd><dt>Căn cứ kỳ đo</dt><dd>${escape(scope.periodBasis)}</dd></dl><p>Đã đọc lại các byte nguồn được lưu và tính lại bằng code. Việc này không xác nhận nhà cung cấp, độ đầy đủ thị trường hay tính đúng của nhãn phân loại.</p></details><nav aria-label="Mục báo cáo"><a href="#charts">Chart</a><a href="#readiness">Điều kiện section</a><a href="#claims">Truy nguồn con số</a><a href="#source-rows">Dòng nguồn</a><a href="#files">File và phiên bản</a></nav></header>
<section class="layer-overview" aria-labelledby="layer-title"><h2 id="layer-title">Bốn lớp bằng chứng</h2><ol class="layers"><li><strong>1 · Nguồn</strong>Giữ file và khai báo gốc.</li><li><strong>2 · Tính toán</strong>Bấm vào số để xem căn cứ.</li><li><strong>3 · Nhận định AI</strong>Chưa tạo.</li><li><strong>4 · Người duyệt</strong>Chưa có quyết định.</li></ol></section>
<section id="charts"><h2>Số liệu trong phạm vi quan sát</h2><p>Không phải quy mô toàn thị trường. ALL/WIDE/CORE là các tập giao nhau; nhãn thiếu hoặc lỗi sẽ chặn WIDE/CORE. UNKNOWN được ${result.input.wideUnknownPolicy === 'exclude' ? 'giữ để xem nhưng loại khỏi WIDE' : 'tính vào WIDE theo cấu hình của lần chạy này'}.</p><div class="charts">${['revenue', 'units', 'listings', 'shops'].map(metricChart).join('')}</div><h3>Mức tập trung doanh thu theo shop</h3><p>Top 1, Top 3 và Top 10 chứa lẫn nhau, không cộng các tỷ trọng. Chỉ tính khi mẫu số doanh thu đủ điều kiện.</p><div class="charts">${concentration}</div></section>
<section id="readiness"><h2>Điều kiện của ${packet.sections.length} section</h2><p>Một section có số liệu từng phần không có nghĩa toàn bộ phương pháp đã hoàn thành. Mở từng mục để xem điều kiện còn thiếu.</p><ul>${readinessSummary.map(text => `<li>${escape(text)}</li>`).join('')}</ul>${readiness}</section>
<section id="claims"><h2>Truy nguồn từng con số</h2><p>Mở một quan sát để xem phương pháp, tập thành viên, mẫu số và vị trí trong Result.</p>${claims}${memberships}</section>
<section id="source-rows"><h2>Dòng nguồn đã chuẩn hóa</h2><p>Giá trị thiếu không bằng 0. Ô nguồn dẫn về <a href="raw-workbook.xlsx" download>workbook giữ nguyên byte</a>; <a href="receipt.json" download>biên bản ánh xạ</a> giữ giá trị ô và dấu vết chuẩn hóa.</p><div class="table-wrap" role="region" aria-label="Các dòng nguồn" tabindex="0"><table><thead><tr><th>Index</th><th>Sản phẩm / ID nguồn</th><th>Doanh thu</th><th>Sản lượng</th><th>Phân loại / vị trí</th></tr></thead><tbody>${observations}</tbody></table></div></section>
<section id="files"><h2>File và phiên bản</h2><ul class="downloads">${downloads}<li><a href="evidence-envelope.json" download>Liên kết nguồn của bản xuất</a></li><li><a href="export-manifest.json" download>Danh mục byte của bản xuất</a></li></ul><details><summary>Nhận diện chính xác</summary><dl>${semanticVersionId ? `<dt>Nội dung</dt><dd><code>${escape(semanticVersionId)}</code></dd>` : ''}<dt>Packet</dt><dd><code>${escape(packet.packetId)}</code></dd><dt>Result</dt><dd><code>${escape(packet.metricResultSha256)}</code></dd><dt>Catalog</dt><dd><code>${escape(packet.catalogSha256)}</code></dd></dl></details><p>ID nội dung chỉ đổi khi nguồn, phép tính, chart hoặc section thay đổi; đổi renderer HTML/PDF không tự biến thành nội dung mới. Trạng thái duyệt được lưu riêng và hiện vẫn là UNREVIEWED.</p><p>Đây là gói nội bộ có dữ liệu nguồn. Không tự động chia sẻ ra ngoài. In / lưu PDF bằng trình duyệt không đồng nghĩa báo cáo đã được duyệt.</p></section><footer>TDN Growth OS · Dữ liệu → phép tính → nhận định → quyết định. Không có lời gọi AI, nhà cung cấp hoặc quyết định kinh doanh nào được thực hiện khi xuất bản nháp này.</footer></main></body></html>\n`;
}
