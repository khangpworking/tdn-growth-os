import type { ReportAssemblySnapshot } from '../../../contracts/analysis/report-assembly-snapshot.generated.js';
import type {
  AttributedMarketEvent,
  DescriptiveMarketMethods,
  EvidenceRef,
  LiteralMarketObservation,
  LiteralMarketPartition,
  LiteralMarketValue,
  MarketObservationPeriod,
  MarketObservationScope,
  SourceStatedSupplyRecord,
} from '../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { M08TabletQuoteMethod } from '../../../contracts/analysis/m08-tablet-quote-method.generated.js';
import type { I03ResearchMethod } from '../../../contracts/analysis/i03-research-method.generated.js';
import type { I17EvidenceTrace } from '../../../contracts/analysis/i17-evidence-trace.generated.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import type { ResearchChartValue } from './research-report-charts.js';

type DeliveryState = ReportAssemblySnapshot['sections'][number]['materialization']['deliveryState'];
type ScopeKey = 'all' | 'wide' | 'core';

/** One of the 30 catalog sections with every fact this renderer is allowed to show. */
export interface KitSection {
  readonly sectionId: string;
  readonly title: string;
  readonly methodId: string;
  readonly methodVersion: string;
  readonly requiredInputs: readonly string[];
  readonly reopenCondition: string;
  readonly fallbackReasons: readonly string[];
  readonly deliveryState: DeliveryState;
  readonly claimIds: readonly string[];
  readonly blockers: readonly string[];
  readonly methodArtifactFile: string | null;
  readonly readiness: ReportAssemblySnapshot['sections'][number]['readiness'] | null;
  readonly readinessBlockedWhileMaterialized: boolean;
}

export interface KitContext {
  readonly bundle: SourceBackedReportBundle;
  readonly snapshot: ReportAssemblySnapshot | undefined;
  readonly descriptive: DescriptiveMarketMethods | undefined;
  readonly sections: readonly KitSection[];
}

export const esc = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]!);
const anchor = (value: string): string => encodeURIComponent(value);

export const SCOPE_NAME: Record<ScopeKey, string> = {
  all: 'ALL · Toàn bộ file', wide: 'WIDE · Phạm vi rộng', core: 'CORE · Nhóm lõi',
};
const METRIC_NAME: Record<string, string> = {
  listings: 'Số listing', shops: 'Số shop', revenue: 'Doanh thu quan sát', units: 'Sản lượng quan sát',
  top1: 'Top 1 shop', top3: 'Top 3 shop', top10: 'Top 10 shop',
};

export const STATE_KEY: Record<DeliveryState, 'partial' | 'method' | 'blocked' | 'manual' | 'none'> = {
  PARTIAL_DETERMINISTIC_DRAFT: 'partial', METHOD_ONLY: 'method', BLOCKED: 'blocked',
  MANUAL_REVIEW_REQUIRED: 'manual', NOT_IMPLEMENTED: 'none',
};
export const STATE_LABEL: Record<DeliveryState, string> = {
  PARTIAL_DETERMINISTIC_DRAFT: 'Có đầu ra một phần', METHOD_ONLY: 'Mới có phương pháp', BLOCKED: 'Thiếu đầu vào',
  MANUAL_REVIEW_REQUIRED: 'Cần người xem xét', NOT_IMPLEMENTED: 'Chưa triển khai',
};
const READINESS_LABEL = {
  READY_TO_CALCULATE: 'Đủ điều kiện tính', BLOCKED: 'Thiếu điều kiện', INVALID: 'Đầu vào không hợp lệ',
};

const INPUT_LABEL: Record<string, string> = {
  'validated-metrics': 'Số liệu đã kiểm tra', 'source-bound-claims': 'Nhận định gắn với nguồn', 'owner-review': 'Quyết định duyệt của chủ dự án',
  'source-manifest': 'Danh mục nguồn', 'verified-locators': 'Vị trí nguồn đã kiểm tra', 'normalized-metric-rows': 'Dòng số liệu đã chuẩn hóa',
  'frozen-label-decisions': 'Quyết định nhãn đã đóng băng', 'source-scope': 'Phạm vi nguồn', 'domain-specific-evidence': 'Bằng chứng riêng của lĩnh vực',
  'exact-raw-quote-source-and-locator': 'Byte quote nguồn và vị trí', 'canonical-tablet-quote-input': 'Đầu vào quote viên đã chuẩn hóa',
  'explicit-price-state-and-observation-time': 'Trạng thái giá và thời điểm quan sát', 'optional-owner-declared-tablet-count': 'Số viên do chủ dự án khai báo (tùy chọn)',
  'compatible-daily-series': 'Chuỗi theo ngày tương thích', 'held-out-horizon': 'Đoạn kiểm định giữ riêng', 'owner-question': 'Câu hỏi do chủ dự án xác nhận',
  scope: 'Phạm vi', 'case-locators': 'Vị trí nguồn của từng trường hợp', 'adjudication-provenance': 'Nguồn gốc của quyết định phân loại',
  'exact-source-package-lineage': 'Chuỗi gói nguồn chính xác', 'normalization-receipt': 'Biên bản chuẩn hóa', 'metric-result': 'Kết quả tính',
  'verified-locators-and-denominators': 'Vị trí nguồn và mẫu số đã kiểm tra', 'comparable-groups': 'Nhóm có thể so sánh', denominators: 'Mẫu số',
  'existing-relevant-outcomes': 'Kết quả đã có và phù hợp', 'measurement-design': 'Thiết kế phép đo', 'source-package-manifest': 'Danh mục gói nguồn',
  'verified-method-artifacts': 'Hồ sơ phương pháp đã kiểm chứng', 'resolved-fact-claim-pointers': 'Con trỏ quan sát đã phân giải',
};

const CODE_TEXT: Record<string, string> = {
  BLOCKED_LABELS: 'Cần nhãn phân loại hợp lệ và khớp phiên bản dữ liệu.',
  NO_ELIGIBLE_DENOMINATOR: 'Chưa có mẫu số đủ điều kiện để tính tỷ trọng.',
  EMPTY_SCOPE: 'Phạm vi chưa có dòng dữ liệu.', ZERO_REVENUE: 'Doanh thu quan sát bằng 0.',
  MISSING_REVENUE: 'Thiếu doanh thu ở một số dòng.', MISSING_UNITS: 'Thiếu sản lượng ở một số dòng.',
  NON_EXACT_REVENUE: 'Nguồn có doanh thu làm tròn, ước tính hoặc chưa rõ độ chính xác.',
  NON_EXACT_UNITS: 'Nguồn có sản lượng làm tròn, ước tính hoặc chưa rõ độ chính xác.',
  GROUP_SHARE_UNAVAILABLE: 'Chưa có mẫu số đủ điều kiện để tính tỷ trọng nhóm.',
  REVENUE_DELTA_UNAVAILABLE: 'Chưa đủ dữ liệu để tính chênh doanh thu giữa hai membership.',
  UNITS_DELTA_UNAVAILABLE: 'Chưa đủ dữ liệu để tính chênh sản lượng giữa hai membership.',
  COMPARISONS_UNAVAILABLE: 'Chưa thể so sánh membership khi nhãn chưa đủ điều kiện.',
  TOP_SHOP_REMOVAL_UNAVAILABLE: 'Chưa có shop đứng đầu đủ điều kiện cho phép thử loại bỏ.',
  ORIGINAL_REVENUE_UNAVAILABLE: 'Chưa có tổng doanh thu gốc đủ điều kiện.',
  REMAINING_REVENUE_UNAVAILABLE: 'Không còn doanh thu quan sát đủ điều kiện sau khi bỏ shop đứng đầu.',
  REMAINING_SHARE_UNAVAILABLE: 'Không thể tính tỷ trọng doanh thu còn lại.',
  POST_REMOVAL_CONCENTRATION_UNAVAILABLE: 'Không thể tính mức tập trung sau khi bỏ shop đứng đầu.',
  NO_LOCATED_RECORDS: 'Chưa có bản ghi nguồn được định vị.', PERIOD_MISSING: 'Thiếu kỳ quan sát.', UNIT_MISSING: 'Thiếu đơn vị.',
  ADDITIVITY_UNDECLARED: 'Nguồn chưa khai báo các thành viên có thể cộng dồn.',
  AGGREGATION_OVERLAP_UNRESOLVED: 'Các thành viên có thể chồng lấn và chưa được giải quyết.',
  AGGREGATION_FRAME_INCOMPATIBLE: 'Khung đo của các thành viên không tương thích để cộng.',
  MEMBERSHIP_INCOMPLETE: 'Danh sách thành viên bắt buộc chưa đầy đủ.',
  VALUE_MISSING: 'Thiếu giá trị ở một số dòng.', VALUE_UNKNOWN: 'Có giá trị UNKNOWN.', NON_EXACT_VALUE: 'Có giá trị không exact.',
  M07_PEER_SET_UNAPPROVED: 'Nhóm đối thủ chưa được duyệt.', M07_IDENTITY_UNRESOLVED: 'Chưa xác định hai quan sát nói về cùng một đối tượng.',
  M07_PERIOD_INCOMPATIBLE: 'Kỳ quan sát không tương thích.', M07_UNIVERSE_OR_MEASURE_INCOMPATIBLE: 'Phạm vi hoặc thước đo không tương thích.',
  M09_EVENT_DATE_UNKNOWN: 'Chưa rõ ngày của sự kiện.', M09_ENTITY_LINK_UNRESOLVED: 'Chưa liên kết sự kiện với đúng đối tượng.',
  M09_COUNTEREVIDENCE_CONFLICT: 'Có bằng chứng ngược chưa được giải quyết.',
};

function codeText(code: string): string {
  const cardinality = /^GROUP_CARDINALITY_EXCEEDS_VISUAL_LIMIT:(\d+):(\d+)$/.exec(code);
  if (cardinality) return `Có ${cardinality[1]} nhóm, vượt giới hạn hiển thị ${cardinality[2]} nhóm; biểu đồ bị chặn để không cắt hoặc gộp dữ liệu âm thầm.`;
  return CODE_TEXT[code] ?? CODE_TEXT[code.split(':').at(-1)!] ?? code;
}
function codeList(codes: readonly string[]): string {
  const unique = [...new Set(codes)];
  return unique.length === 0 ? '' : `<ul class="limits">${unique.map(code => `<li>${esc(codeText(code))}</li>`).join('')}</ul>`;
}

export function formatDecimal(value: string): string {
  if (!/^-?\d+(?:\.\d+)?$/.test(value)) return esc(value);
  const [whole, decimal] = value.split('.');
  return esc(`${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${decimal === undefined ? '' : `,${decimal}`}`);
}
function withUnit(value: string, unit: string): string {
  if (unit === 'percent') return `${formatDecimal(value)}%`;
  return `${formatDecimal(value)} ${esc(unit === 'unit' ? 'đơn vị' : unit)}`;
}
export function shortDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

const integerOf = (text: string): bigint | null => /^-?\d+$/.test(text) ? BigInt(text) : null;
const basisText = (basisPoints: number): string => `${Math.floor(basisPoints / 100)}.${String(basisPoints % 100).padStart(2, '0')}%`;
const ratioBasis = (value: bigint, max: bigint): number => max <= 0n || value < 0n ? 0 : Number(value * 10000n / max);

/** Zero and unknown draw no fill; positive widths preserve the calculated proportion. */
function track(basisPoints: number | null, variant = ''): string {
  const fill = basisPoints !== null && Number.isInteger(basisPoints) && basisPoints > 0
    ? `<i style="width:${basisText(Math.min(basisPoints, 10000))}"></i>` : '';
  return `<div class="trk${variant ? ` ${variant}` : ''}" aria-hidden="true">${fill}</div>`;
}
function signedTrack(halfBasisPoints: number, negative: boolean): string {
  const fill = halfBasisPoints > 0 ? `<i class="${negative ? 'neg' : 'pos'}" style="width:${basisText(Math.min(halfBasisPoints, 5000))}"></i>` : '';
  return `<div class="trk sg" aria-hidden="true">${fill}</div>`;
}
const plotRow = (label: string, value: string, bar: string, note = ''): string =>
  `<div class="pr"><span class="lb">${label}</span>${bar}<span class="val">${value}</span>${note ? `<small class="nt">${note}</small>` : ''}</div>`;
const missingRow = (label: string, text: string): string =>
  `<div class="pr"><span class="lb">${label}</span><p class="miss">${text}</p></div>`;
const axis100 = (): string => '<div class="pr"><span></span><div class="axis" aria-hidden="true"><span>0%</span><span>50%</span><span>100%</span></div><span></span></div>';
const card = (title: string, inner: string, source: string): string =>
  `<div class="card"><div class="cp">${esc(title)}</div><div class="cb">${inner}</div><p class="sr">${source}</p></div>`;
const tag = (text: string, kind = ''): string => `<span class="tag${kind ? ` ${kind}` : ''}">${esc(text)}</span>`;

export const stateChip = (state: DeliveryState): string => `<span class="chip ${STATE_KEY[state]}">${esc(STATE_LABEL[state])}</span>`;

function sourceLine(ctx: KitContext): string {
  const scope = ctx.bundle.packet.scope;
  return `Nguồn: <a href="metric-result.json" download>metric-result.json</a> · ${esc(scope.platform)} · bộ lọc ${esc(scope.selection)} · kỳ ${esc(shortDate(scope.start))} đến ${esc(shortDate(scope.end))}`;
}

function factLink(point: ResearchChartValue): string {
  const label = `${METRIC_NAME[point.metric]} ${SCOPE_NAME[point.source.scopeKey]}: ${point.valueText} ${point.unit}. Xem bằng chứng`;
  return `<a href="#claim-${anchor(point.claimId)}" aria-label="${esc(label)}">${withUnit(point.valueText, point.unit)}</a>`;
}
function pointNotes(point: ResearchChartValue): string {
  const notes: string[] = [];
  if (point.valueText === '0' && point.unit !== 'listing' && point.unit !== 'shop') notes.push('Tổng quan sát bằng 0, không phải thiếu dữ liệu.');
  if (point.limits.some(code => code === 'MISSING_REVENUE' || code === 'MISSING_UNITS')) notes.push('Tổng chỉ gồm các dòng có số liệu; một số dòng thiếu.');
  if (point.limits.some(code => code === 'NON_EXACT_REVENUE' || code === 'NON_EXACT_UNITS')) notes.push('Có dòng chưa xác nhận độ chính xác.');
  return notes.join(' ');
}

/* ---------- KPI overview ---------- */

export function renderOverviewKpis(ctx: KitContext): string {
  const all = ctx.bundle.charts.totals.scopes.find(lane => lane.scopeKey === 'all');
  const scope = ctx.bundle.packet.scope;
  const items = [
    ['listings', 'Listing trong file', 'Không phải số listing của toàn thị trường'],
    ['shops', 'Shop trong file', 'Không phải số shop của toàn thị trường'],
    ['revenue', 'Doanh thu quan sát', 'Chỉ gồm dòng có số liệu trong file'],
    ['units', 'Sản lượng quan sát', 'Chỉ gồm dòng có số liệu trong file'],
  ] as const;
  return `<div class="kpis" aria-label="Số liệu quan sát trong phạm vi ALL">${items.map(([metric, title, caveat]) => {
    const point = all?.points.find(candidate => candidate.metric === metric);
    if (!point) {
      return `<div class="kpi gap"><h4>${esc(title)} · ALL</h4><strong>Chưa có số đủ điều kiện</strong><p>${esc((all?.blockers ?? []).map(codeText).join(' ') || 'Chưa có số liệu trong phạm vi ALL.')}</p></div>`;
    }
    return `<div class="kpi"><h4>${esc(title)} · ALL</h4><strong>${factLink(point)}</strong><p>${esc(scope.platform)} · ${esc(shortDate(scope.start))} đến ${esc(shortDate(scope.end))}</p>${pointNotes(point) ? `<p>${esc(pointNotes(point))}</p>` : ''}<em>${esc(caveat)}</em></div>`;
  }).join('')}</div>`;
}

/* ---------- M03 and M04 ---------- */

function m03Body(ctx: KitContext): string {
  const { charts } = ctx.bundle;
  const metrics = [['revenue', 'VND', 'Doanh thu quan sát (VND)'], ['units', 'unit', 'Sản lượng quan sát'], ['listings', 'listing', 'Số listing'], ['shops', 'shop', 'Số shop']] as const;
  const cards = metrics.map(([metric, , title]) => {
    const points = charts.totals.scopes.map(lane => lane.points.find(point => point.metric === metric));
    const max = points.reduce<bigint>((prior, point) => {
      const value = point ? integerOf(point.valueText) : null;
      return value !== null && value > prior ? value : prior;
    }, 0n);
    const rows = charts.totals.scopes.map((lane, index) => {
      const point = points[index];
      const label = esc(SCOPE_NAME[lane.scopeKey]);
      if (!point) return missingRow(label, `Chưa có số đủ điều kiện. ${esc(lane.blockers.map(codeText).join(' '))}`);
      const value = integerOf(point.valueText);
      return plotRow(label, factLink(point), track(value === null ? null : ratioBasis(value, max), `b${index + 1}`), esc(pointNotes(point)));
    }).join('');
    return card(title, `<div class="plot">${rows}</div>`, sourceLine(ctx));
  }).join('');

  const comparisons = charts.scopeSensitivity.comparisons;
  const sensitivityMax = comparisons.reduce<bigint>((prior, comparison) => {
    const value = comparison.revenueDelta.value === null ? null : integerOf(comparison.revenueDelta.value);
    const magnitude = value === null ? 0n : value < 0n ? -value : value;
    return magnitude > prior ? magnitude : prior;
  }, 0n);
  const sensitivityRows = comparisons.map((comparison, index) => {
    const id = `diagnostic-scope-${comparison.toScopeKey}-${index}`;
    const label = `ALL → ${comparison.toScopeKey.toUpperCase()}`;
    const revenue = comparison.revenueDelta.value;
    const units = comparison.unitsDelta.value;
    const note = `${comparison.removedRecordCount} dòng bị loại khỏi membership · chênh sản lượng ${units === null ? 'chưa tính được' : withUnit(units, 'unit')} · <a href="#${anchor(id)}">Xem toàn bộ căn cứ</a>`;
    if (revenue === null) return missingRow(esc(label), `Chưa tính được chênh doanh thu. ${esc([...comparison.blockers].map(codeText).join(' '))}`) + `<div class="pr"><small class="nt">${note}</small></div>`;
    const value = integerOf(revenue);
    const half = value === null || sensitivityMax === 0n ? 0 : Number((value < 0n ? -value : value) * 5000n / sensitivityMax);
    return plotRow(esc(label), `<a href="#${anchor(id)}">${withUnit(revenue, 'VND')}</a>`, signedTrack(half, value !== null && value < 0n), note);
  }).join('');
  const sensitivity = comparisons.length
    ? card('Đổi membership làm doanh thu quan sát thay đổi thế nào', `<div class="plot">${sensitivityRows}</div><p class="fig-c">Cùng một kỳ đo. Vạch giữa là mốc 0; thanh trái là chênh âm, thanh phải là chênh dương. Đây là độ nhạy của bộ lọc, không phải tăng trưởng theo thời gian.</p>`, sourceLine(ctx))
    : card('Đổi membership làm doanh thu quan sát thay đổi thế nào', `<div class="miss-box"><p><b>Chưa thể so sánh membership.</b></p>${codeList(charts.scopeSensitivity.blockers)}</div>`, sourceLine(ctx));

  return `<div id="charts" class="two">${cards}${sensitivity}</div>
<p class="rule"><b>Quy tắc đọc:</b> ALL, WIDE và CORE là ba tập lọc giao nhau trên cùng một file, không phải nhóm shop hàng đầu hoặc nước xuất xứ, và không cộng lại. Giá trị thiếu không được vẽ thành 0. UNKNOWN được giữ để xem và ${ctx.bundle.chartSpec.policies.unknownPolicy === 'VISIBLE_AND_EXCLUDED_FROM_WIDE' ? 'loại khỏi WIDE' : 'tính vào WIDE'} theo chính sách đã đóng băng của lần chạy này. Độ dài thanh so với giá trị lớn nhất đang hiển thị trong từng biểu đồ.</p>`;
}

function shopCountByScope(ctx: KitContext, scopeKey: ScopeKey): bigint | null {
  const point = ctx.bundle.charts.totals.scopes.find(lane => lane.scopeKey === scopeKey)?.points.find(candidate => candidate.metric === 'shops');
  return point ? integerOf(point.valueText) : null;
}

function m04Body(ctx: KitContext): string {
  const { charts } = ctx.bundle;
  const shareCards = charts.topShopShare.scopes.map(lane => {
    const shops = shopCountByScope(ctx, lane.scopeKey);
    const rows = lane.points.map(point => {
      const k = BigInt(point.metric.replace('top', ''));
      const label = esc(METRIC_NAME[point.metric]);
      const denominator = point.denominator;
      const covered = shops !== null && shops < k ? `Phạm vi này chỉ có ${shops} shop nên ${METRIC_NAME[point.metric]} gồm toàn bộ shop. ` : '';
      if (denominator === null) return missingRow(label, 'Chưa có mẫu số doanh thu đủ điều kiện nên không vẽ tỷ trọng.');
      return plotRow(label, factLink(point), track(point.basisPoints, `b${Number(point.metric === 'top1' ? 1 : point.metric === 'top3' ? 2 : 3)}`), `${esc(covered)}Mẫu số: ${withUnit(denominator.value, 'VND')} trong phạm vi này.`);
    }).join('');
    const body = lane.points.length
      ? `<div class="plot">${rows}${axis100()}</div><p class="fig-c">Thang 0 đến 100%. Top 1 nằm trong Top 3 và Top 10 nên không cộng các thanh; đây không phải thị phần toàn thị trường.</p>`
      : `<div class="miss-box"><p><b>Chưa thể tính tỷ trọng.</b></p>${codeList(lane.blockers)}</div>`;
    return card(`Mức tập trung doanh thu theo shop · ${SCOPE_NAME[lane.scopeKey]}`, body, sourceLine(ctx));
  }).join('');

  const groupCards = charts.groupComposition.scopes.map(lane => {
    const excluded = ctx.bundle.chartSpec.policies.unknownPolicy === 'VISIBLE_AND_EXCLUDED_FROM_WIDE';
    const rows = lane.points.map((point, index) => {
      const id = `diagnostic-group-${point.scopeKey}-${index}`;
      const label = `${esc(point.group)} · ${point.listingCount} listing`;
      const unknown = point.group === 'UNKNOWN' ? ` ${excluded ? 'UNKNOWN được giữ để xem và không tính vào WIDE.' : 'UNKNOWN được tính vào WIDE theo chính sách của lần chạy này.'}` : '';
      const note = `Doanh thu quan sát: ${point.revenueValue === null ? 'thiếu' : withUnit(point.revenueValue, 'VND')} · ${point.recordIndices.length} dòng nguồn · <a href="#${anchor(id)}">Xem toàn bộ căn cứ</a>${esc(unknown)}`;
      if (point.sharePercent === null) return missingRow(esc(label), 'Chưa tính được tỷ trọng vì chưa có mẫu số đủ điều kiện.') + `<div class="pr"><small class="nt">${note}</small></div>`;
      return plotRow(esc(label), `<a href="#${anchor(id)}">${withUnit(point.sharePercent, 'percent')}</a>`, track(point.basisPoints), note);
    }).join('');
    const body = lane.points.length
      ? `<div class="plot">${rows}${axis100()}</div><p class="fig-c">Mỗi biểu đồ dùng mẫu số của đúng phạm vi. ALL, WIDE và CORE giao nhau nên không cộng tỷ trọng giữa các biểu đồ.</p>`
      : `<div class="miss-box"><p><b>Chưa thể lập cơ cấu nhóm.</b></p>${codeList([...lane.blockers])}</div>`;
    return card(`Cơ cấu nhóm theo doanh thu quan sát · ${SCOPE_NAME[lane.scopeKey]}`, body, sourceLine(ctx));
  }).join('');

  const removalCards = charts.topShopRemoval.scopes.map((lane, index) => {
    const title = `Nếu bỏ shop đứng đầu · ${SCOPE_NAME[lane.scopeKey]}`;
    const point = lane.point;
    if (point === null) return card(title, `<div class="miss-box"><p><b>Chưa thể chạy phép thử bỏ shop đứng đầu.</b></p>${codeList(lane.blockers)}</div>`, sourceLine(ctx));
    const id = `diagnostic-removal-${lane.scopeKey}-${index}`;
    const link = `<a href="#${anchor(id)}">Xem toàn bộ căn cứ</a>`;
    const remaining = point.remainingRevenueSharePercent === null
      ? missingRow('Doanh thu còn lại', 'Chưa tính được tỷ trọng còn lại.')
      : plotRow('Doanh thu còn lại', `<a href="#${anchor(id)}">${withUnit(point.remainingRevenueSharePercent, 'percent')}</a>`, track(point.remainingRevenueShareBasisPoints),
        `${point.remainingRevenueValue === null ? 'Không còn doanh thu quan sát đủ điều kiện' : withUnit(point.remainingRevenueValue, 'VND')} · còn ${point.remainingListingCount} listing · ${link}`);
    const after = point.concentrationAfterRemoval.map(value => value.sharePercent === null
      ? missingRow(`Top ${value.k} trong phần còn lại`, 'Chưa tính được tỷ trọng.')
      : plotRow(`Top ${value.k} trong phần còn lại`, `<a href="#${anchor(id)}">${withUnit(value.sharePercent, 'percent')}</a>`, track(value.basisPoints, 'b2'),
        value.usedShopCount < value.k ? `Phần còn lại chỉ có ${value.usedShopCount} shop nên gồm toàn bộ shop còn lại.` : `${value.usedShopCount} shop được dùng trong phép tính này.`)).join('');
    return card(title, `<div class="plot">${remaining}${after}${axis100()}</div><p class="fig-c">Giả lập loại đúng shop đang đứng đầu trong tập quan sát; tỷ trọng còn lại dùng doanh thu gốc làm mẫu số. Đây là phép thử độ nhạy, không phải dự báo hay khuyến nghị loại shop.</p>`, sourceLine(ctx));
  }).join('');

  return `<div class="two">${shareCards}</div><h4 class="fig-t" style="margin-top:20px">Cơ cấu nhóm trong từng phạm vi</h4><div class="two">${groupCards}</div><h4 class="fig-t" style="margin-top:20px">Độ nhạy khi bỏ shop đứng đầu</h4><div class="two">${removalCards}</div>`;
}

/* ---------- other sections with real data ---------- */

function parseFile<T>(ctx: KitContext, name: string): T | null {
  const bytes = ctx.bundle.files.get(name);
  return bytes === undefined ? null : JSON.parse(bytes.toString('utf8')) as T;
}

function m02Body(ctx: KitContext): string {
  const scope = ctx.bundle.packet.scope;
  const sources = ctx.bundle.envelope.selectedSources.map(source => `<tr><th scope="row">${esc(source.role)}</th><td><a href="${esc(source.exportPath)}" download>${esc(source.logicalPath)}</a><small>${source.byteSize} byte</small></td><td>${esc(source.evidenceFamily)}<small>${esc(source.representationRole)} · ${esc(source.independence)}</small></td><td>${esc(source.providerProvenance)}<small>${esc(source.provenanceBasis)}</small></td></tr>`).join('');
  return `<div class="two"><div class="card"><div class="cp">Phạm vi đo</div><div class="cb"><dl><dt>Kênh và bộ lọc</dt><dd>${esc(scope.platform)} · ${esc(scope.selection)}</dd><dt>Kỳ đo</dt><dd>${esc(shortDate(scope.start))} đến ${esc(shortDate(scope.end))}</dd><dt>Căn cứ kỳ đo</dt><dd>${esc(scope.periodBasis)}</dd><dt>Thu nhận (theo nguồn)</dt><dd>${scope.acquiredAt === null ? tag('Chưa xác nhận', 'warn') : esc(shortDate(scope.acquiredAt))}</dd></dl></div></div>
<div class="card"><div class="cp">Nguồn đã chọn</div><div class="cb"><div class="table-wrap" role="region" aria-label="Nguồn đã chọn" tabindex="0"><table><thead><tr><th>Vai trò</th><th>File</th><th>Họ bằng chứng</th><th>Provenance</th></tr></thead><tbody>${sources}</tbody></table></div></div><p class="sr">Byte và digest của từng nguồn nằm ở <a href="#provenance">phụ lục nguồn</a>.</p></div></div>`;
}

function m13Body(ctx: KitContext): string {
  const appendix = parseFile<{ coverage: Record<'recordCount' | 'recordLocatorCount' | 'revenueLocatorCount' | 'unitsLocatorCount' | 'labelLocatorCount' | 'unlabeledRecordCount', number> }>(ctx, 'm13-provenance-appendix.json');
  if (appendix === null) return requirementBody(sectionOf(ctx, 'M13'));
  const c = appendix.coverage;
  return `<div class="card"><div class="cp">Độ phủ truy nguồn</div><div class="cb"><dl><dt>Dòng chuẩn hóa</dt><dd>${c.recordCount}</dd><dt>Vị trí dòng</dt><dd>${c.recordLocatorCount}</dd><dt>Vị trí doanh thu / sản lượng</dt><dd>${c.revenueLocatorCount} / ${c.unitsLocatorCount}</dd><dt>Vị trí nhãn</dt><dd>${c.labelLocatorCount}; ${c.unlabeledRecordCount} dòng chưa có nhãn vẫn được giữ rõ ràng</dd></dl></div><p class="sr">Hash và locator giúp phát hiện sai khác, không xác nhận nhà cung cấp. Chi tiết ở <a href="#provenance">phụ lục nguồn M13</a>.</p></div>`;
}

function m08Body(ctx: KitContext, section: KitSection): string {
  const method = parseFile<M08TabletQuoteMethod>(ctx, 'm08-tablet-quote-method.json');
  if (method === null) return requirementBody(section);
  const price = (value: M08TabletQuoteMethod['quote']['pricePerPack']): string => value.state === 'AVAILABLE'
    ? `${withUnit(value.displayValue!.value, 'VND')}<small>exact ${esc(value.exactValue!.numerator)}/${esc(value.exactValue!.denominator)}</small>`
    : `${tag('Chưa tính được', 'warn')}<small>thiếu ${esc(value.missingInputs.join(', '))}</small>`;
  const q = method.quote;
  return `<div class="card"><div class="cp">Một quote giá viên</div><div class="cb"><dl><dt>Sản phẩm được khai báo</dt><dd>${esc(q.entityTitle)}<small>${esc(q.packText)} · ${esc(q.identityTier)}</small></dd><dt>Giá mỗi pack</dt><dd>${price(q.pricePerPack)}</dd><dt>Giá mỗi viên theo số học</dt><dd>${price(q.pricePerTabletArithmetic)}</dd><dt>Trạng thái giá</dt><dd>${esc(q.priceState)}</dd></dl></div><p class="sr">Chỉ một quote; không so sánh, xếp hạng hay kinh tế đơn vị đầy đủ. Chi tiết ở <a href="#quote">phần M08/P4</a>.</p></div>`;
}

function i03Body(ctx: KitContext, section: KitSection): string {
  const method = parseFile<I03ResearchMethod>(ctx, 'i03-research-method.json');
  if (method === null) return requirementBody(section);
  const c = method.coverage;
  const f = method.measurementFrame;
  return `<dl><dt>Phạm vi đo</dt><dd>${esc(f.platform)} · ${esc(f.selection)} · ${esc(shortDate(f.start))} đến ${esc(shortDate(f.end))}</dd><dt>Nguồn đã chọn</dt><dd>${c.selectedSourceCount} file · ${c.denominatorRecordCount} dòng đầu vào</dd><dt>Doanh thu</dt><dd>${c.revenueMissingCount} thiếu · ${c.revenueObservedZeroCount} bằng 0 · ${c.revenueNonExactCount} không exact</dd><dt>Sản lượng</dt><dd>${c.unitsMissingCount} thiếu · ${c.unitsObservedZeroCount} bằng 0 · ${c.unitsNonExactCount} không exact</dd><dt>Nhãn</dt><dd>${c.labeledRecordCount} có nhãn · ${c.unlabeledRecordCount} chưa có</dd></dl><p class="sec-note">Mô tả cách nguồn được chuẩn hóa và tính. Chưa phải nghiên cứu người tiêu dùng. Chi tiết ở <a href="#method">phụ lục phương pháp I03</a>.</p>`;
}

function i17Body(ctx: KitContext, section: KitSection): string {
  const trace = parseFile<I17EvidenceTrace>(ctx, 'i17-evidence-trace.json');
  if (trace === null) return requirementBody(section);
  const s = trace.summary;
  return `<dl><dt>Mục đã phân giải</dt><dd>${s.resolvedEntryCount} / ${s.entryCount}; ${s.unresolvedEntryCount} chưa phân giải</dd><dt>Thành phần</dt><dd>${s.methodArtifactCount} hồ sơ phương pháp · ${s.claimCount} quan sát</dd></dl><p class="sec-note">Đã phân giải chỉ nghĩa con trỏ tồn tại, chưa xác nhận bằng chứng đúng. Chi tiết ở <a href="#trace">phụ lục dấu vết I17</a>.</p>`;
}

/* ---------- requirement (missing) state ---------- */

const MISSING_HEAD: Record<DeliveryState, string> = {
  PARTIAL_DETERMINISTIC_DRAFT: 'Có đầu ra một phần, chưa có trang riêng cho mục này.',
  METHOD_ONLY: 'Mới có phương pháp. Chưa có nội dung cho mục này.',
  BLOCKED: 'Chưa có nội dung. Còn thiếu đầu vào bên dưới.',
  MANUAL_REVIEW_REQUIRED: 'Cần người xem xét trước khi có nội dung.',
  NOT_IMPLEMENTED: 'Chưa triển khai phương pháp cho mục này.',
};

function sectionOf(ctx: KitContext, sectionId: string): KitSection {
  const found = ctx.sections.find(section => section.sectionId === sectionId);
  if (!found) throw new TypeError(`report kit HTML: SECTION_NOT_FOUND:${sectionId}`);
  return found;
}

function requirementBody(section: KitSection, lead = ''): string {
  const items = section.requiredInputs.map(id => {
    const label = esc(INPUT_LABEL[id] ?? id);
    const check = section.readiness?.inputChecks.find(candidate => candidate.inputId === id);
    if (!check) return `<li>${label}<small>Cần có</small></li>`;
    if (check.state === 'PRESENT') return `<li class="ok">${label}<small>Đã có</small></li>`;
    return `<li>${label}<small>${check.state === 'INVALID' ? 'Không hợp lệ' : 'Chưa có'}</small></li>`;
  }).join('');
  const codes = [...new Set([...section.fallbackReasons, ...section.blockers, ...(section.readiness?.blockingCodes ?? [])])];
  const readiness = section.readiness === null ? '' : `<p>Kiểm tra bộ dữ liệu chuẩn bị: <b>${esc(READINESS_LABEL[section.readiness.state])}</b>.</p>`;
  return `<div class="miss-box"><p><b>${esc(MISSING_HEAD[section.deliveryState])}</b></p>${lead ? `<p>${esc(lead)}</p>` : ''}${readiness}<ul class="need">${items}</ul></div><details><summary>Điều kiện mở lại và mã kỹ thuật</summary><p lang="en">${esc(section.reopenCondition)}</p><p><code>${esc(section.methodId)} · ${esc(section.methodVersion)}</code></p><ul class="limits">${codes.map(code => `<li><code>${esc(code)}</code></li>`).join('')}</ul></details>`;
}

/* ---------- descriptive market methods (M05, M06, M07, M09) ---------- */

type Input = DescriptiveMarketMethods['input'];

function recordAt<T>(list: readonly T[], pointer: string, prefix: string): T | null {
  if (!pointer.startsWith(prefix)) return null;
  const rest = pointer.slice(prefix.length);
  return /^(0|[1-9]\d*)$/.test(rest) ? list[Number(rest)] ?? null : null;
}
const unresolved = (pointer: string): string => `${tag('Không phân giải được con trỏ', 'warn')}<small><code>${esc(pointer)}</code></small>`;
const refCode = (ref: EvidenceRef): string => `<code>${esc(ref.sourceSha256)}#${esc(ref.locator)}</code>`;

function valueHtml(value: LiteralMarketValue, unit: string | null): string {
  const unitText = unit === null ? ` ${tag('Thiếu đơn vị', 'warn')}` : ` ${esc(unit)}`;
  switch (value.state) {
    case 'observed_value': {
      if (value.value === null) return tag('Thiếu giá trị', 'warn');
      return `${formatDecimal(value.value)}${unitText}${value.precision === 'non_exact' ? ` ${tag('Không exact', 'warn')}` : ''}`;
    }
    case 'observed_zero': return `0${unitText} ${tag('Quan sát bằng 0', 'zero')}`;
    case 'missing': return tag('Thiếu', 'warn');
    case 'UNKNOWN': return tag('UNKNOWN', 'warn');
  }
}
function periodHtml(period: MarketObservationPeriod | null): string {
  return period === null ? tag('Thiếu kỳ quan sát', 'warn')
    : `${esc(shortDate(period.start))} đến ${esc(shortDate(period.end))}<small>${esc(period.timezone)} · ${esc(period.basis)}</small>`;
}
function scopeHtml(scope: MarketObservationScope): string {
  return `${esc(scope.universe)} · ${esc(scope.geography)} · ${esc(scope.frame)}<small>Gồm: ${esc(scope.inclusionRule)} · Loại: ${esc(scope.exclusionRule)} · Biến thể: ${esc(scope.variantRule)}</small>`;
}

/** Exact decimals to one common integer scale; any non-digit, negative or unsafe value disables the bar chart. */
function scaleDecimals(values: readonly string[]): bigint[] | null {
  const parts: Array<[string, string]> = [];
  for (const value of values) {
    const match = /^(\d+)(?:\.(\d+))?$/.exec(value);
    if (!match) return null;
    parts.push([match[1]!, match[2] ?? '']);
  }
  const scale = Math.max(0, ...parts.map(([, fraction]) => fraction.length));
  return parts.map(([whole, fraction]) => BigInt(whole + fraction.padEnd(scale, '0')));
}

function descriptiveFooter(descriptive: DescriptiveMarketMethods): string {
  return `<details><summary>Giới hạn của hồ sơ mô tả thị trường</summary><ul class="limits">${descriptive.limitations.map(item => `<li>${esc(item)}</li>`).join('')}</ul><p><code>${esc(descriptive.methodOutputId)}</code></p></details>`;
}

function noRecords(ctx: KitContext, section: KitSection, what: string): string {
  const reason = ctx.descriptive === undefined
    ? `Hồ sơ mô tả thị trường chưa được cung cấp cho bản xuất này, nên chưa có ${what}.`
    : `Hồ sơ mô tả thị trường có mặt nhưng không có ${what} (NO_LOCATED_RECORDS).`;
  return requirementBody(section, reason);
}

function observationRows(pointers: readonly string[], list: readonly LiteralMarketObservation[], prefix: string, includeContext = false): string {
  return pointers.map(pointer => {
    const record = recordAt(list, pointer, prefix);
    if (!record) return `<tr><td colspan="${includeContext ? 6 : 4}">${unresolved(pointer)}</td></tr>`;
    const context = includeContext ? `<td>${periodHtml(record.period)}</td><td>${scopeHtml(record.scope)}</td>` : '';
    return `<tr><th scope="row">${record.entityLabel === null ? tag('Không nêu đối tượng', 'warn') : esc(record.entityLabel)}<small>${esc(record.measureLiteral)}</small></th><td>${esc(record.sourceWording)}</td><td>${valueHtml(record.observation, record.unit)}</td>${context}<td>${refCode(record.source)}</td></tr>`;
  }).join('');
}
const observationHead = '<thead><tr><th>Đối tượng và thước đo</th><th>Lời trong nguồn</th><th>Giá trị</th><th>Vị trí nguồn</th></tr></thead>';

function partitionCard(input: Input, partition: LiteralMarketPartition, index: number): string {
  const records = partition.recordPointers.map(pointer => ({ pointer, record: recordAt(input.m05, pointer, '/input/m05/') }));
  const drawable = records.filter(({ record }) => record !== null && record.unit !== null && record.period !== null && record.observation.precision === 'exact'
    && (record.observation.state === 'observed_zero' || (record.observation.state === 'observed_value' && record.observation.value !== null)));
  const scaled = scaleDecimals(drawable.map(({ record }) => record!.observation.state === 'observed_zero' ? '0' : record!.observation.value!));
  const max = scaled === null ? 0n : scaled.reduce((prior, value) => value > prior ? value : prior, 0n);
  const chart = partition.unit !== null && partition.period !== null && scaled !== null && drawable.length >= 2
    ? `<div class="plot">${drawable.map(({ record }, position) => plotRow(record!.entityLabel === null ? esc(`Bản ghi ${position + 1}`) : esc(record!.entityLabel), valueHtml(record!.observation, record!.unit), track(ratioBasis(scaled[position]!, max), 'b1'))).join('')}</div><p class="fig-c">Mỗi thanh là một quan sát có nguồn cùng thước đo, đơn vị và kỳ. Không cộng các thanh; đây không phải quy mô toàn thị trường. Dòng thiếu, UNKNOWN hoặc không exact nằm trong bảng, không được vẽ.</p>` : '';
  const c = partition.coverage;
  const coverage = [tag(`Có số ${c.observedCount}`), tag(`Bằng 0 ${c.zeroCount}`, c.zeroCount ? 'zero' : ''), tag(`Thiếu ${c.missingCount}`, c.missingCount ? 'warn' : ''), tag(`UNKNOWN ${c.unknownCount}`, c.unknownCount ? 'warn' : ''), tag(`Không exact ${c.nonExactCount}`, c.nonExactCount ? 'warn' : '')].join('');
  const subtotal = partition.subtotal !== null && partition.unit !== null
    ? partition.complete
      ? `<p><b>Tổng hợp theo khai báo:</b> ${withUnit(partition.subtotal, partition.unit)} ${tag('Đủ thành viên bắt buộc', 'zero')}</p>`
      : `<p><b>Tổng quan sát một phần:</b> ${withUnit(partition.subtotal, partition.unit)} ${tag('Chưa đủ dữ liệu bắt buộc', 'warn')}</p><p>Chỉ cộng các dòng có số liệu; chưa đủ toàn bộ thành viên hoặc giá trị bắt buộc.</p>${codeList(partition.blockers)}`
    : `<p><b>Chưa có tổng hợp.</b> Không cộng các dòng khi chưa đủ điều kiện.</p>${codeList(partition.blockers)}`;
  const title = `${index + 1}. ${partition.measureLiteral}`;
  return card(title, `<dl><dt>Đơn vị</dt><dd>${partition.unit === null ? tag('Thiếu đơn vị', 'warn') : esc(partition.unit)}</dd><dt>Kỳ</dt><dd>${periodHtml(partition.period)}</dd><dt>Phạm vi</dt><dd>${scopeHtml(partition.scope)}</dd></dl><p>${coverage}</p>${subtotal}${chart}<div class="table-wrap" role="region" aria-label="Quan sát nhóm ${index + 1}" tabindex="0"><table class="obs">${observationHead}<tbody>${observationRows(partition.recordPointers, input.m05, '/input/m05/')}</tbody></table></div>`, 'Nguồn: hồ sơ mô tả thị trường, các dòng được định vị theo con trỏ trong hồ sơ.');
}

function m05Body(ctx: KitContext, section: KitSection): string {
  const d = ctx.descriptive;
  if (d === undefined || d.sections.M05.locatedRecordCount === 0) return noRecords(ctx, section, 'bản ghi nhu cầu có nguồn');
  const m = d.sections.M05;
  return `<p class="sec-note">${m.locatedRecordCount} bản ghi nguồn trong ${m.partitions.length} nhóm thước đo. Đây là danh mục các quan sát có nguồn, không phải quy mô hay nhu cầu của toàn thị trường.</p><div class="stack">${m.partitions.map((partition, index) => partitionCard(d.input, partition, index)).join('')}</div>${codeList(m.blockers)}${descriptiveFooter(d)}`;
}

function m06Body(ctx: KitContext, section: KitSection): string {
  const d = ctx.descriptive;
  if (d === undefined || d.sections.M06.locatedRecordCount === 0) return noRecords(ctx, section, 'bản ghi nguồn cung');
  const m = d.sections.M06;
  const rows = m.recordPointers.map(pointer => {
    const record: SourceStatedSupplyRecord | null = recordAt(d.input.m06, pointer, '/input/m06/');
    if (!record) return `<tr><td colspan="5">${unresolved(pointer)}</td></tr>`;
    const o = record.observation;
    return `<tr><th scope="row">${esc(record.objectLiteral)}<small>${esc(o.measureLiteral)}</small></th><td>${record.statusLiteral === null ? tag('Không nêu', 'warn') : esc(record.statusLiteral)}</td><td>${valueHtml(o.observation, o.unit)}</td><td>${periodHtml(o.period)}<small>Ý nghĩa ngày: ${esc(record.dateMeaning)}</small></td><td>${refCode(o.source)}</td></tr>`;
  }).join('');
  return `<p class="sec-note">${m.locatedRecordCount} bản ghi nguồn cung. Số bản ghi không phải số đối tượng duy nhất vì chưa có quy tắc loại trùng; số đối tượng duy nhất chưa được xác định.</p><div class="table-wrap" role="region" aria-label="Bản ghi nguồn cung" tabindex="0"><table class="obs"><thead><tr><th>Đối tượng nêu trong nguồn</th><th>Trạng thái theo nguồn</th><th>Giá trị</th><th>Kỳ</th><th>Vị trí nguồn</th></tr></thead><tbody>${rows}</tbody></table></div>${codeList(m.blockers)}${descriptiveFooter(d)}`;
}

function m07Body(ctx: KitContext, section: KitSection): string {
  const d = ctx.descriptive;
  if (d === undefined || d.sections.M07.recordPointers.length === 0) return noRecords(ctx, section, 'bản ghi đối thủ có nguồn');
  const m = d.sections.M07;
  const inventoryHead = '<thead><tr><th>Đối tượng và thước đo</th><th>Lời trong nguồn</th><th>Giá trị</th><th>Kỳ quan sát</th><th>Phạm vi</th><th>Vị trí nguồn</th></tr></thead>';
  const inventory = `<div class="table-wrap" role="region" aria-label="Quan sát đối thủ" tabindex="0"><table class="obs">${inventoryHead}<tbody>${observationRows(m.recordPointers, d.input.m07, '/input/m07/', true)}</tbody></table></div>`;
  const side = (pointer: string | null, ref: EvidenceRef): string => {
    const record = pointer === null ? null : recordAt(d.input.m07, pointer, '/input/m07/');
    return record === null ? `${tag('Chưa xác định bản ghi', 'warn')}<small>${refCode(ref)}</small>` : `${record.entityLabel === null ? tag('Không nêu đối tượng', 'warn') : esc(record.entityLabel)}<small>${esc(record.measureLiteral)}: ${valueHtml(record.observation, record.unit)}</small><dl><dt>Kỳ quan sát</dt><dd>${periodHtml(record.period)}</dd><dt>Phạm vi</dt><dd>${scopeHtml(record.scope)}</dd></dl>`;
  };
  const comparisons = m.comparisons.length === 0 ? '' : `<h4 class="fig-t">Đối chiếu song song nhóm đã khai báo</h4><div class="table-wrap" role="region" aria-label="Đối chiếu song song" tabindex="0"><table class="obs"><thead><tr><th>Mốc</th><th>Đối thủ khai báo</th><th>So sánh được</th><th>Chặn</th></tr></thead><tbody>${m.comparisons.map(item => `<tr><th scope="row">${side(item.anchorPointer, item.anchorRef)}</th><td>${side(item.peerPointer, item.peerRef)}</td><td>${item.compatibility === 'COMPARABLE' ? tag('Có thể so sánh', 'zero') : tag('Không thể so sánh', 'warn')}</td><td>${codeList(item.blockers) || 'Không có'}</td></tr>`).join('')}</tbody></table></div>`;
  const mode = m.mode === 'DECLARED_PEERS_SIDE_BY_SIDE' ? 'Đặt cạnh nhau theo nhóm đối thủ đã khai báo' : 'Danh mục quan sát, không xếp hạng';
  const order = m.mode === 'DECLARED_PEERS_SIDE_BY_SIDE' ? 'Thứ tự theo nhóm đối thủ do chủ dự án khai báo' : 'Thứ tự trình bày ổn định theo vị trí nguồn';
  return `<p class="sec-note">${tag(mode)} ${m.recordPointers.length} quan sát. ${order}, không phải xếp hạng hay thị phần.</p>${comparisons}<h4 class="fig-t">Danh mục quan sát</h4>${inventory}${codeList(m.blockers)}${descriptiveFooter(d)}`;
}

const EVENT_TYPE: Record<AttributedMarketEvent['statementType'], string> = {
  DOCUMENTED_EVENT: 'Sự kiện có tài liệu', SOURCE_STATED_DIRECTION: 'Hướng do nguồn nêu', COUNTEREVIDENCE: 'Bằng chứng ngược', UNCLASSIFIED: 'Chưa phân loại',
};

function m09Body(ctx: KitContext, section: KitSection): string {
  const d = ctx.descriptive;
  if (d === undefined || d.sections.M09.locatedRecordCount === 0) return noRecords(ctx, section, 'phát biểu hay sự kiện có nguồn');
  const m = d.sections.M09;
  const rows = m.events.map(event => {
    const record = recordAt(d.input.m09, event.recordPointer, '/input/m09/');
    if (!record) return `<tr><td colspan="5">${unresolved(event.recordPointer)}</td></tr>`;
    const dates = `${record.publicationDate === null ? 'Ngày đăng chưa rõ' : esc(shortDate(record.publicationDate))} · ${record.eventDate === null ? 'ngày sự kiện chưa rõ' : esc(shortDate(record.eventDate))}<small>${esc(record.dateBasis)}</small>`;
    return `<tr><th scope="row">${esc(EVENT_TYPE[record.statementType])}<small>${esc(record.attribution)}</small></th><td>${esc(record.sourceWording)}</td><td>${dates}</td><td>${esc(record.namedScope)}<small>Chỉ số nêu: ${record.affectedMetricLiteral === null ? 'không nêu' : esc(record.affectedMetricLiteral)}</small><small>${record.targetLink === null ? 'Chưa liên kết đối tượng' : refCode(record.targetLink)}</small></td><td>${refCode(record.source)}${record.conflictRefs.length ? `<small>${record.conflictRefs.length} bằng chứng mâu thuẫn</small>` : ''}${codeList(event.blockers)}</td></tr>`;
  }).join('');
  return `<p class="sec-note">${m.locatedRecordCount} phát biểu hay sự kiện có nguồn. Đây là lời được quy cho nguồn, không phải kết luận về nguyên nhân.</p><div class="table-wrap" role="region" aria-label="Phát biểu và sự kiện có nguồn" tabindex="0"><table class="obs"><thead><tr><th>Loại và người nêu</th><th>Lời trong nguồn</th><th>Ngày</th><th>Phạm vi nêu tên</th><th>Vị trí nguồn</th></tr></thead><tbody>${rows}</tbody></table></div>${codeList(m.blockers)}${descriptiveFooter(d)}`;
}

/* ---------- dispatch ---------- */

/** Descriptive methods arrive beside the packet, so the packet's delivery state can lag the rows shown; say so instead of hiding either. */
function withDescriptiveNote(section: KitSection, body: string): string {
  if (section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT' || body.includes('class="miss-box"')) return body;
  return `<p class="sec-note">Hồ sơ mô tả thị trường được nạp riêng. Trạng thái giao hàng trong packet của mục này chưa ghi nhận hồ sơ đó.</p>${body}`;
}

function bodyFor(ctx: KitContext, section: KitSection): string {
  switch (section.sectionId) {
    case 'M02': return m02Body(ctx);
    case 'M03': return section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT' ? m03Body(ctx) : requirementBody(section);
    case 'M04': return section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT' ? m04Body(ctx) : requirementBody(section);
    case 'M05': return withDescriptiveNote(section, m05Body(ctx, section));
    case 'M06': return withDescriptiveNote(section, m06Body(ctx, section));
    case 'M07': return withDescriptiveNote(section, m07Body(ctx, section));
    case 'M08': return m08Body(ctx, section);
    case 'M09': return withDescriptiveNote(section, m09Body(ctx, section));
    case 'M13': return m13Body(ctx);
    case 'I03': return i03Body(ctx, section);
    case 'I17': return i17Body(ctx, section);
    default: return requirementBody(section);
  }
}

function subtitle(section: KitSection): string {
  const parts: string[] = [STATE_LABEL[section.deliveryState]];
  if (section.claimIds.length) parts.push(`${section.claimIds.length} quan sát định lượng có nguồn`);
  if (section.readinessBlockedWhileMaterialized) parts.push('điều kiện của toàn bộ phương pháp chưa đủ');
  return parts.join(' · ');
}

export function renderMarketSheet(ctx: KitContext, section: KitSection, position: number): string {
  const id = esc(section.sectionId);
  return `<article class="sheet" id="section-${id}" aria-labelledby="h-${id}"><header class="sh-head"><div><span class="sh-id">${id}</span><h3 id="h-${id}">${esc(section.title)}</h3><p class="sh-sub">${esc(subtitle(section))}</p></div><div>${stateChip(section.deliveryState)}</div></header>${bodyFor(ctx, section)}<footer class="sh-foot"><b>${String(position).padStart(2, '0')}</b> | Bản tin thị trường · mục ${id}</footer></article>`;
}

const WIDE_PANELS = new Set(['I03', 'I17']);

export function renderInsightPanel(ctx: KitContext, section: KitSection): string {
  const id = esc(section.sectionId);
  return `<article class="ip${WIDE_PANELS.has(section.sectionId) ? ' wide' : ''}" id="section-${id}" aria-labelledby="h-${id}"><header class="ph"><div><small>${id}</small><h3 id="h-${id}">${esc(section.title)}</h3></div>${stateChip(section.deliveryState)}</header><p class="sub">${esc(subtitle(section))}</p>${bodyFor(ctx, section)}</article>`;
}
