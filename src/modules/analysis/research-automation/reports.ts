import fs from 'node:fs';
import type { AutomationBoundedMethodSnapshot } from '../../../../contracts/analysis/automation-bounded-method-snapshot.generated.js';
import type { AutomationQuoteMethodSnapshot } from '../../../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import type { AutomationDecisionPacket } from '../../../../contracts/analysis/automation-decision-packets.generated.js';
import { quoteMethodSection } from './quote-method-report.js';
import { renderReportMethodPacketSection } from '../report-method-packets-pages.js';
import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { AutomationSourceClaims } from '../../../../contracts/analysis/automation-source-claims.generated.js';
import type { AutomationM01EvidenceInventory } from '../../../../contracts/analysis/automation-m01-evidence-inventory.generated.js';
import type { AutomationI14EvidenceAdmission } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import { decisionPacketSection, m01InventorySection, i14AdmissionSection, i14SynthesisSection, SYNTHESIS_EVIDENCE_CSS } from './synthesis-evidence-report.js';
import type { AutomationI14ExecutionOutcome } from './i14-synthesis-execution.js';
import type { AutomationDecisionSectionId } from './decision-packets.js';
import type { AutomationDecisionExecutionOutcome } from './decision-synthesis-execution.js';
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import { reviewCorpusSection } from './review-corpus-report.js';
import { projectCorpusTrace } from './corpus-trace-projection.js';
import { projectMarketSourceScope, marketSourceScopeSection } from './market-scope-report.js';
import type { AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import type { AutomationMetricMethodSnapshot, MetricMethodFailureCode } from './metric-method-bridge.js';
import type { AutomationClassifiedMetricSnapshot } from '../../../../contracts/analysis/automation-classified-metric.generated.js';
import { metricMethodSection } from './metric-method-report.js';
import type { AutomationLocatedReviewSnapshot } from './located-review-bridge.js';
import type { NativeSourceReviewSnapshot } from './native-source-review-bridge.js';
import { renderLocatedInsightSection } from '../report-located-insight-pages.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { AutomationInsightCodingSnapshot } from '../../../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import type { LiteralFamily, LiteralPendingReason } from './literal-review-coding.js';
import { marketInventorySection } from './market-inventory-report.js';
import type { ResearchAutomationRun } from '../../../../contracts/api/research-automation-api.generated.js';
import { REPORT_KIT_CSS as REPORT_KIT_BASE_CSS } from '../report-kit-theme.js';
import { reportKitFontCss } from '../report-kit-fonts.js';
import { describeDescriptiveSection, descriptiveAppendix, escapeHtml, isDescriptiveSectionId, type DescriptiveSectionView } from './descriptive-report.js';
import type { CaptureRecord, ScopeSnapshot, StartSnapshot, StepResultDocument, TypedComparable } from './model.js';

const REPORT_KIT_CSS = REPORT_KIT_BASE_CSS + SYNTHESIS_EVIDENCE_CSS;

export interface AutomationReportInput {
  readonly boundedMethods?: AutomationBoundedMethodSnapshot;
  readonly quoteMethods?: AutomationQuoteMethodSnapshot;
  readonly run: ResearchAutomationRun;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
  readonly sourceClaims?: AutomationSourceClaims;
  readonly decisionPackets?: readonly AutomationDecisionPacket[];
  readonly decisionSourceClaims?: AutomationSourceClaims;
  /** Settled outcomes verified and retained by the decision synthesis owner; absent for historical reports. Presentation only. */
  readonly decisionSynthesis?: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionOutcome>>;
  readonly m01Inventory?: AutomationM01EvidenceInventory;
  readonly i14Admission?: AutomationI14EvidenceAdmission;
  readonly i14Synthesis?: AutomationI14ExecutionOutcome;
  /** Produced and verified by the production service; absent for runs without a connected descriptive method. */
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly descriptiveMethodFailure?: 'DESCRIPTIVE_METHOD_FAILED';
  readonly reviewCorpus?: ResearchReviewCorpus;
  readonly reviewCorpusFailure?: 'REVIEW_CORPUS_FAILED' | 'REVIEW_CORPUS_REPORT_TOO_LARGE';
  readonly locatedReview?: AutomationLocatedReviewSnapshot;
  readonly locatedReviewFallback?: { readonly sourcePackage: Extract<AutomationLocatedReviewSnapshot, { contractVersion: 'automation-located-review-snapshot-v2' }>['sourcePackage'] };
  readonly nativeReview?: NativeSourceReviewSnapshot;
  readonly nativeReviewFallback?: Pick<NativeSourceReviewSnapshot, 'sourcePackage'>;
  readonly nativeReviewFailure?: 'NATIVE_REVIEW_METHOD_FAILED' | 'NATIVE_REVIEW_REPORT_TOO_LARGE';
  readonly locatedReviewFailure?: 'LOCATED_REVIEW_METHOD_FAILED';
  /** Verified coding selections; v2 also supplies explicitly selected semantic families. Original source snapshots remain retained. */
  readonly insightCoding?: AutomationInsightCodingSnapshot;
  readonly marketInventory?: AutomationMarketMethodSnapshot;
  readonly marketInventoryFailure?: 'MARKET_INVENTORY_FAILED';
  readonly metricMethods?: AutomationMetricMethodSnapshot;
  readonly metricClassified?: AutomationClassifiedMetricSnapshot;
  readonly metricMethodsFailure?: MetricMethodFailureCode;
}
/** Fixed copy per closed code; the generic entry keeps the original wording so existing output is unchanged. */
const metricFailureCopy: Readonly<Record<MetricMethodFailureCode, { explanation: string; next: string }>> = {
  METRIC_SOURCE_AMBIGUOUS: {
    explanation: 'Lượt này có nhiều hơn một gói Metric được gắn. Hệ thống không tự chọn một gói nên chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Tạo lượt mới và chỉ gắn đúng một gói Metric cho lượt đó. Các gói đã gắn được giữ nguyên, không bị xóa hoặc gộp.',
  },
  METRIC_SOURCE_UNSUPPORTED: {
    explanation: 'Gói Metric được gắn có phiên bản, tệp mô tả, manifest hoặc hồ sơ tệp xuất chưa được hỗ trợ. Chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Tạo lại gói gắn từ tệp xuất Metric theo hồ sơ được hỗ trợ, có đủ tệp mô tả và manifest, rồi tạo lượt mới.',
  },
  METRIC_SOURCE_INTEGRITY_FAILED: {
    explanation: 'Dữ liệu đã lưu của gói Metric không khớp dấu kiểm toàn vẹn khi đọc lại. Chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Không sửa tệp đã lưu. Gắn lại tệp xuất gốc vào một lượt mới; nếu lỗi lặp lại, báo người vận hành kiểm tra kho lưu trữ.',
  },
  METRIC_SOURCE_RUN_MISMATCH: {
    explanation: 'Gói Metric được gắn không liên kết với đúng lượt, workspace hoặc keyword đã xác nhận này. Chưa tính M03/M04; không dùng số liệu chưa xác minh và không tự gọi lại nguồn.',
    next: 'Không dùng lại gói của lượt khác. Ở lượt mới, gắn tệp xuất Metric sau khi xác nhận phạm vi để gói được liên kết với đúng lượt đó.',
  },
  METRIC_SOURCE_PERIOD_CONFLICT: {
    explanation: 'Kỳ đo khai báo của tệp Metric nằm ngoài kỳ báo cáo yêu cầu. Hệ thống không cắt, kéo dài hoặc chia tỷ lệ số liệu theo ngày nên chưa tính M03/M04.',
    next: 'Xuất lại Metric với kỳ đo nằm trong kỳ yêu cầu, hoặc tạo lượt mới có kỳ yêu cầu bao trùm kỳ đo của tệp xuất.',
  },
  METRIC_SOURCE_INPUT_REJECTED: {
    explanation: 'Tệp xuất Metric hoặc manifest không khớp hồ sơ tệp xuất đã khai báo, ví dụ mã băm, tiêu đề cột, số dòng, kỳ khai báo hoặc mã định danh. Hệ thống không tự sửa hay bỏ dòng nên chưa tính M03/M04.',
    next: 'Dùng đúng tệp tải trực tiếp từ Metric, chưa chỉnh sửa hoặc lưu lại; kiểm tra manifest khai báo đúng tệp và số dòng đó, rồi tạo lượt mới.',
  },
  METRIC_CALCULATION_FAILED: {
    explanation: 'Đầu vào Metric đã qua kiểm tra hồ sơ, nhưng kết quả tính hoặc bản lưu không khớp khi kiểm tra lại. Không dùng kết quả chưa xác minh và không tự gọi lại nguồn.',
    next: 'Không cần sửa tệp nguồn. Báo người vận hành kèm mã đối chiếu này trước khi tạo lượt mới.',
  },
  METRIC_METHOD_FAILED: {
    explanation: 'Gói Metric được gắn với lượt này chưa vượt qua kiểm tra nguồn, kỳ hoặc phương pháp. Không dùng số liệu chưa xác minh; cần sửa gói đầu vào cho lượt mới. Không tự gọi lại nguồn.',
    next: 'Chưa tính được từ gói Metric gắn với lượt này. Kiểm tra nguồn, kỳ đo và liên kết phạm vi trước khi tạo lượt mới.',
  },
};
interface CatalogSection { sectionId: string; title: string; methodId: string; methodVersion: string; requiredInputs: string[] }
interface MethodOutputRef { methodOutputId: string; locatedRecordCount: number; unresolvedPointers: readonly string[]; blockers: readonly string[] }
interface DraftSection { sectionId: string; title: string; state: 'SOURCE_CONTEXT' | 'SOURCE_TABLE' | 'EVIDENCE_INVENTORY' | 'METHOD_OUTPUT' | 'METHOD_NO_USABLE_RECORDS' | 'BLOCKED'; method: string; explanation: string; rows: readonly TypedComparable[]; methodOutput?: MethodOutputRef }
const catalog = JSON.parse(fs.readFileSync(new URL('../../../../docs/research/report-section-catalog-v1.json', import.meta.url), 'utf8')) as { sections: CatalogSection[] };
const escape = escapeHtml;
const literalFamilies: readonly LiteralFamily[] = ['I02', 'I04', 'I05', 'I07', 'I08'];
const isLiteralFamily = (id: string): id is LiteralFamily => literalFamilies.some(family => family === id);

/** A retained source is not a usable coding result. Failure flags come from the source-owning service. */
function retainedReviewStatus(input: AutomationReportInput): string | null {
  if (input.reviewCorpusFailure === 'REVIEW_CORPUS_REPORT_TOO_LARGE' || input.nativeReviewFailure === 'NATIVE_REVIEW_REPORT_TOO_LARGE')
    return 'Nguồn review đã được lưu và vẫn được giữ đầy đủ, nhưng phần trích dẫn hoặc phương pháp vượt giới hạn kích thước bản báo cáo này. Chưa đưa phần đó vào kết quả hiển thị; không cắt dữ liệu hoặc tự thu lại nguồn.';
  if (input.reviewCorpusFailure || input.nativeReviewFailure || input.locatedReviewFailure)
    return 'Nguồn review đã được lưu, nhưng bước xử lý hoặc mã hóa chưa vượt qua kiểm tra. Chưa dùng phần chưa xác minh làm kết quả; cần kiểm tra phương pháp, không tự thu lại nguồn.';
  if (input.reviewCorpus || input.locatedReview || input.locatedReviewFallback || input.nativeReviewFallback || input.collection?.nativeReview || input.collection?.exactShopee)
    return 'Nguồn review đã được lưu nhưng chưa có lớp mã hóa đã kiểm tra cho mục này.';
  return null;
}

/**
 * Insight sections that read the review corpus, so a missing Shopee review collection affects them:
 * - I02, I04, I05, I07, I08: literal reading of located reviews (`literalFamilies`, `renderLocatedInsightSection`);
 * - I06, I09, I10, I13 (and the five above): coding families over the same records (`codingFamilies`, `semanticCodingFamilies`);
 * - I03, I17: review source status, corpus trace and quotes (`reviewCorpusSection`, `corpusTraceSection`, `retainedReviewStatus`).
 * No market section reads reviews.
 */
export const REVIEW_DEPENDENT_SECTIONS: readonly { readonly sectionId: string; readonly title: string }[] = [
  { sectionId: 'I02', title: 'Khách hàng và hoàn cảnh' }, { sectionId: 'I03', title: 'Phương pháp nghiên cứu' },
  { sectionId: 'I04', title: 'Hành vi' }, { sectionId: 'I05', title: 'Cảm nhận và thái độ' }, { sectionId: 'I06', title: 'Hành trình' },
  { sectionId: 'I07', title: 'Lý do lựa chọn' }, { sectionId: 'I08', title: 'Rào cản' }, { sectionId: 'I09', title: 'Nhu cầu chưa được đáp ứng' },
  { sectionId: 'I10', title: 'Chủ đề và mối quan tâm' }, { sectionId: 'I13', title: 'Thương hiệu và đối thủ' }, { sectionId: 'I17', title: 'Phụ lục và bằng chứng' },
];

type ReviewOutcome = NonNullable<StepResultDocument['exactShopeeOutcome']>;
/** A non-OK outcome bound to this report's exact collection; old runs, OK runs and replaced review sources show nothing. */
function missingReviewOutcome(input: AutomationReportInput): ReviewOutcome | null {
  const value = input.collection?.exactShopeeOutcome;
  return value && input.collection?.exactShopee && value.outcome !== 'OK' ? value : null;
}
/** dd/mm/yyyy in Vietnam time (UTC+7, no daylight saving). */
const vietnamDate = (iso: string): string => {
  const day = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString();
  return `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}`;
};
const reviewOutcomeLead = (value: ReviewOutcome): string => {
  const withReviews = value.listings.filter(row => row.reviews > 0).length;
  return value.outcome === 'PARTIAL_LISTINGS'
    ? `Lần thu ngày ${vietnamDate(value.attemptedAt)} chỉ lấy được đánh giá Shopee cho ${withReviews}/${value.listings.length} sản phẩm đã chọn. Phần ý kiến khách hàng chỉ dựa trên các sản phẩm có đánh giá.`
    : `Lần thu ngày ${vietnamDate(value.attemptedAt)} không lấy được đánh giá Shopee nào cho ${value.listings.length} sản phẩm đã chọn. Phần ý kiến khách hàng trong báo cáo này chưa có dữ liệu.`;
};
function reviewOutcomeNotice(value: ReviewOutcome, kind: 'MARKET' | 'INSIGHT'): string {
  const missing = value.listings.filter(row => row.reviews === 0);
  return `<div class="warning review-outcome-notice" role="note"><p><strong>${value.outcome === 'PARTIAL_LISTINGS' ? 'Thiếu một phần đánh giá khách hàng Shopee.' : 'Thiếu đánh giá khách hàng Shopee.'}</strong> ${escape(reviewOutcomeLead(value))}</p>`
    + `<p>Sản phẩm chưa có đánh giá:</p><ul>${missing.map(row => `<li><a href="${escape(row.listingUrl)}" rel="noopener noreferrer">${escape(row.listingUrl)}</a></li>`).join('')}</ul>`
    + `<p><strong>Phần bị ảnh hưởng${kind === 'MARKET' ? ' (trong báo cáo insight)' : ''}:</strong> ${escape(REVIEW_DEPENDENT_SECTIONS.map(section => `${section.sectionId} ${section.title}`).join('; '))}.</p>`
    + '<p><strong>Phần vẫn dùng được:</strong> doanh thu, giá, đối thủ, nhu cầu tìm kiếm.</p></div>';
}

type DeclarationSnapshot = Extract<AutomationLocatedReviewSnapshot, { contractVersion: 'automation-located-review-snapshot-v2' }> | NativeSourceReviewSnapshot;
function literalPendingSection(snapshot: DeclarationSnapshot, family: LiteralFamily): { notice: string; details: string } {
  const pending = snapshot.projection.pending.filter(row => row.family === family);
  const blocked = snapshot.projection.blocked.filter(row => row.family === family);
  const coverage = snapshot.projection.coverage.families[family];
  const notice = `<p class="warning">Kết quả từng phần: ${coverage.admittedCandidates} khai báo được đưa vào, thuộc ${coverage.admittedRecords} bản ghi nguồn; ${pending.length} mục còn chờ xử lý. Đây không phải số người hoặc tỷ lệ của thị trường. Chưa tìm thấy mẫu phù hợp với quy tắc không có nghĩa là nguồn phủ nhận hành vi hay cảm nhận đó.</p>`;
  if (pending.length === 0 && blocked.length === 0) return { notice, details: '' };
  const rows = pending.slice(0, 20).map(row => {
    const record = snapshot.output.input.records[row.recordIndex]!;
    return `<tr><td>${row.span ? `<q style="white-space:pre-wrap">${escape(row.span.quote)}</q>` : 'Chưa xác lập đoạn đọc; giữ nguyên toàn văn trong hồ sơ nguồn.'}</td><td>${escape(record.sourceAttribution)}<br><code class="loc">${escape(record.locator)}</code>${row.trigger ? `<details><summary>Từ đánh dấu, không thay thế đoạn đọc</summary><q style="white-space:pre-wrap">${escape(row.trigger.quote)}</q></details>` : ''}</td><td>${glossedCodes(row.reason, pendingReasonGloss)}</td></tr>`;
  }).join('');
  return { notice, details: `<details><summary>Xem phần còn chờ xử lý (${pending.length})</summary><p>Phần này chưa được đưa vào kết quả mã hóa. ${blocked.length} khai báo ứng viên bị giữ lại theo quy tắc đọc; con số này không cộng với số mục chờ thành số review.</p>${rows ? `<div class="table-wrap" role="region" aria-label="Các đoạn nguồn còn chờ xử lý" tabindex="0"><table><caption>Đoạn nguồn chưa đủ điều kiện mã hóa</caption><thead><tr><th scope="col">Đoạn đọc</th><th scope="col">Vị trí nguồn</th><th scope="col">Lý do chờ (mã đối chiếu)</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}${pending.length > 20 ? `<p>Trang này hiển thị 20 trong ${pending.length} mục chờ theo thứ tự nguồn. Toàn bộ được giữ trong hồ sơ phương pháp đã lưu.</p>` : ''}</details>` };
}

function nativeReviewContext(snapshot: NativeSourceReviewSnapshot): string {
  const records = snapshot.output.input.records;
  const counts = (disposition: string): number => records.filter(record => record.disposition === disposition).length;
  const selected = snapshot.nativeSource.selected;
  const summary = `<h3>Tập phản hồi nguồn đã lưu</h3><dl><dt>Nguồn</dt><dd>Dami · Tập con phản hồi của một mục sản phẩm Shopee</dd><dt>Sản phẩm đã chọn</dt><dd>Gian hàng ${escape(selected.shopId)} · Sản phẩm ${escape(selected.itemId)}</dd><dt>Thời điểm thu nguồn</dt><dd>${escape(snapshot.nativeSource.sourcePackage.manifest.sourceAcquiredAt ?? 'Chưa khai báo')}</dd><dt>Độ phủ bản ghi</dt><dd>${records.length} dòng nguồn: ${counts('INCLUDED')} đưa vào đọc, ${counts('EXCLUDED')} loại khỏi đọc, ${counts('UNREADABLE')} không đọc được.</dd></dl><p class="warning">Đây là bản thu có sẵn, không phải lượt gọi nhà cung cấp mới. Mã sản phẩm khớp cấu trúc; chưa xác thực tác giả, biến thể hay toàn bộ lịch sử phản hồi. Ngày nguồn không tự xác lập độ phủ kỳ báo cáo. Số dòng không phải số người. Nguồn này được giữ riêng, không đổi thành tập thu của nhà cung cấp Zen.</p>`;
  return summary;
}

function corpusTraceSection(trace: ReturnType<typeof projectCorpusTrace>, sectionId: 'I03' | 'I17'): string {
  const c = trace.counts;
  const summary = `<h3>Độ phủ của lớp mã hóa lời nguồn</h3><p>Đơn vị đếm là bản ghi ở đúng mã băm tệp và vị trí nguồn, không phải người dùng. Tập này có thể nhỏ hơn toàn bộ dữ liệu thu vì còn dòng tách riêng ở lớp nguồn thô.</p><dl><dt>Dòng đầu vào phương pháp</dt><dd>${c.inputRows}</dd><dt>Bản ghi duy nhất</dt><dd>${c.uniqueRecords} (${c.duplicateRows} dòng trùng đồng nhất)</dd><dt>Trạng thái đọc</dt><dd>${c.included} đưa vào đọc, ${c.excluded} loại khỏi đọc, ${c.unreadable} không đọc được</dd><dt>Khai báo được đưa vào</dt><dd>${c.admittedCandidates} khai báo thuộc ${c.admittedRecords} bản ghi</dd><dt>Còn chờ xử lý</dt><dd>${c.pendingItems} mục thuộc ${c.pendingRecords} bản ghi</dd><dt>Ứng viên bị giữ lại</dt><dd>${c.blockedCandidates} ứng viên thuộc ${c.blockedRecords} bản ghi</dd></dl><p class="warning">Một bản ghi có thể vừa có khai báo được đưa vào, vừa có mục chờ hoặc ứng viên bị giữ lại. Không cộng các nhóm này thành tổng review. Quy tắc được duyệt chỉ cho phép đọc khai báo bám lời nguồn; không có nghĩa OWNER đã duyệt từng nhãn hoặc nhận định phân tích. Chưa có tỷ lệ chủ đề hay mẫu số khách hàng.</p>`;
  if (sectionId === 'I03') return summary + `<div class="table-wrap" role="region" aria-label="Độ phủ theo nhóm mã hóa lời nguồn" tabindex="0"><table><caption>Các nhóm có thể dùng chung một bản ghi, không cộng dồn thành số người</caption><thead><tr><th scope="col">Mục báo cáo</th><th scope="col">Khai báo được đưa vào</th><th scope="col">Bản ghi duy nhất</th></tr></thead><tbody>${trace.families.map(row => `<tr><th scope="row"><a href="#${row.family}">${row.family}</a></th><td>${row.admittedCandidates}</td><td>${row.admittedRecords}</td></tr>`).join('')}</tbody></table></div>`;
  const rows = trace.records.map(record => `<tr><td><code>${escape(record.sourceSha256)}</code><br><code class="loc">${escape(record.locator)}</code><br>${escape(record.sourceAttribution)}</td><td>${record.text === null ? 'Không có văn bản đọc được' : `<q style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(record.text)}</q>`}<br>${record.timeText === null ? 'Ngày nguồn chưa có' : escape(record.timeText)}</td><td>${glossedCodes(record.disposition, dispositionGloss)}${record.dispositionReason ? `<br>${glossedCodes(record.dispositionReason, dispositionGloss)}` : ''}<br>${record.admitted} khai báo đưa vào; ${record.pending} mục chờ; ${record.blocked} ứng viên giữ lại${record.inputIndexes.length > 1 ? `<br>${record.inputIndexes.length} dòng đầu vào trùng đồng nhất` : ''}</td></tr>`).join('');
  return `<h3>Đối chiếu bản ghi với lớp mã hóa</h3><p>Gói phương pháp: <code>${escape(trace.sourcePackage.packageId)}</code>. Bản kê: <code>${escape(trace.sourcePackage.manifestArtifactSha256)}</code>. Kết quả: <code>${escape(trace.methodOutputId)}</code>. Bản chiếu khai báo: <code>${escape(trace.projectionSha256)}</code>. Quy tắc: <code>${escape(trace.policySha256)}</code>.</p><p>Giữ nguyên toàn văn, ngày nguồn và trạng thái đọc. Nội dung tự do có thể chứa thông tin cá nhân. Các số trong mỗi hàng đếm những loại mục khác nhau, không cộng thành số review hoặc số người. ${recordNumberNote}</p><details><summary>Đối chiếu ${c.uniqueRecords} bản ghi duy nhất trong lớp mã hóa</summary><div class="table-wrap" role="region" aria-label="Bản ghi và trạng thái mã hóa lời nguồn" tabindex="0"><table><caption>Vị trí nguồn chính xác và trạng thái từng bản ghi</caption><thead><tr><th scope="col">Mã băm / Vị trí / Ghi nguồn</th><th scope="col">Nguyên văn / Ngày nguồn</th><th scope="col">Trạng thái đọc và mã hóa</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Không có bản ghi đầu vào phương pháp; không suy ra không có phản hồi khách hàng.</td></tr>'}</tbody></table></div></details>`;
}

type CodingFamily = 'I02' | 'I04' | 'I05' | 'I06' | 'I07' | 'I08' | 'I09' | 'I10' | 'I13';
const codingFamilies: readonly CodingFamily[] = ['I06', 'I09', 'I10', 'I13'];
const semanticCodingFamilies: readonly CodingFamily[] = ['I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I13'];
const usesCodingFamily = (coding: AutomationInsightCodingSnapshot | undefined, id: string): boolean =>
  !!coding && (coding.selectionContractVersion === 'automation-insight-selection-v2' ? semanticCodingFamilies : codingFamilies).some(family => family === id);
const codingCaveat = 'Biên nhận chỉ ghi nhận lựa chọn trên đề xuất mã hóa. Không nâng cấp bằng chứng nguồn, không xác thực ý nghĩa, không thêm hoặc bỏ bản ghi; phần chưa chọn vẫn chờ xử lý.';

function codedRecordIndex(output: LocatedInsightMethods, pointer: string): number {
  const match = /^\/input\/(?:i13Mentions\/(0|[1-9]\d*)|corpora\/(0|[1-9]\d*)\/assignments\/(0|[1-9]\d*))$/.exec(pointer);
  const row = match?.[1] !== undefined ? output.input.i13Mentions[Number(match[1])] : match ? output.input.corpora[Number(match[2])]?.assignments[Number(match[3])] : undefined;
  if (!row) throw new Error('Report insight coding pointer mismatch');
  return row.recordIndex;
}

/** Usability comes from the calculated section contract, never from the mere presence of a selection snapshot. */
function insightCodingView(coding: AutomationInsightCodingSnapshot, family: CodingFamily): { usable: boolean; explanation: string; html: string; methodOutput: MethodOutputRef } {
  const output = coding.output;
  let usable: boolean, records: number, pending: readonly string[], blockers: readonly string[], completeRatio = false;
  if (family !== 'I10' && family !== 'I13') {
    const section = output.sections[family];
    usable = section.annotationPointers.length > 0; records = section.locatedRecordCount; pending = section.pendingAnnotationPointers; blockers = section.blockers;
  } else {
    const section = output.sections[family];
    const coded = new Set([...section.mentionPointers, ...section.corpora.flatMap(corpus => corpus.counts.flatMap(count => count.annotationPointers))].map(pointer => codedRecordIndex(output, pointer)));
    completeRatio = section.corpora.some(corpus => corpus.codingComplete && corpus.ratioStatus === 'COMPLETE');
    usable = coded.size > 0 || completeRatio; records = coded.size;
    pending = [...section.pendingMentionPointers, ...section.corpora.flatMap((corpus, index) => corpus.pendingCount > 0 ? [`/sections/${family}/corpora/${index}`] : [])];
    blockers = [...new Set([...section.blockers, ...section.corpora.flatMap(corpus => corpus.blockers)])];
  }
  const state = usable
    ? `Phần đã chọn có kết quả dùng được${pending.length ? '; phần chưa chọn vẫn chờ xử lý' : ''}.${completeRatio ? ' n/N chỉ tính trong tập bản ghi đã khai báo, không phải tỷ lệ thị trường.' : ''}`
    : pending.length ? 'Chưa có phần được chọn dùng được cho mục này; đề xuất chưa chọn vẫn chờ xử lý. Đây không phải kết quả bằng 0.'
    : blockers.length ? 'Chưa có kết quả dùng được vì hồ sơ phương pháp còn điều kiện chặn. Đây không phải kết quả bằng 0.'
    : 'Đề xuất không có mã hóa cho mục này. Không suy ra nguồn không nhắc tới nội dung đó.';
  const notice = `<p class="warning">Dựa trên ${coding.receipts.length} biên nhận lựa chọn cho một đề xuất mã hóa. Biên nhận xác nhận lựa chọn của người dùng, không xác thực lời kể hoặc khai báo của người mã hóa. Bản ghi gốc, tập mẫu và phần chờ được giữ nguyên; dấu vết đối chiếu ở <a href="#I17">I17</a>.</p><p class="sec-note">Trên màn hình hẹp, cuộn ngang bảng để xem đủ nội dung và tỷ lệ. Có thể dùng phím mũi tên khi bảng được chọn bằng Tab.</p>`;
  return {
    usable, html: notice + renderLocatedInsightSection(output, family, { bundleDownload: false })!,
    explanation: `Đoạn được chọn là mã hóa bám lời nguồn trên đề xuất, theo quy tắc đã duyệt; không phải quan sát độc lập và chưa phải mục phân tích hoàn chỉnh. ${state}`,
    methodOutput: { methodOutputId: output.methodOutputId, locatedRecordCount: records, unresolvedPointers: pending, blockers },
  };
}

function insightCodingTrace(coding: AutomationInsightCodingSnapshot, sectionId: 'I03' | 'I17'): string {
  const count = coding.receipts.length;
  const families = coding.selectionContractVersion === 'automation-insight-selection-v2' ? semanticCodingFamilies : codingFamilies;
  if (sectionId === 'I03') return `<h3>Mã hóa đã chọn cho ${families.join(', ')}</h3><p>Đề xuất <code>${escape(coding.selection.proposalId)}</code> được chọn theo quy tắc đã duyệt <code>${escape(coding.adoptionId)}</code>, ghi bằng ${count} biên nhận. ${codingCaveat} Dấu vết đối chiếu ở <a href="#I17">I17</a>.</p>`;
  const binding = coding.binding;
  const rows = coding.receipts.map(receipt => `<tr><td><code>${escape(receipt.receiptId)}</code></td><td><code>${escape(receipt.sha256)}</code></td></tr>`).join('');
  return `<h3>Dấu vết mã hóa đã chọn</h3><p class="warning">${codingCaveat}</p><dl><dt>Đề xuất</dt><dd><code>${escape(coding.selection.proposalId)}</code></dd><dt>SHA-256 đề xuất</dt><dd><code>${escape(coding.proposalSha256)}</code></dd><dt>Quy tắc đã duyệt</dt><dd><code>${escape(coding.adoptionId)}</code></dd><dt>Nguồn gắn</dt><dd>${binding.sourceKind === 'NATIVE' ? 'Review native của listing đã chọn' : 'Collection Shopee chính xác'}</dd><dt>SHA-256 gói nguồn</dt><dd><code>${escape(binding.sourcePackageSha256)}</code></dd><dt>SHA-256 đầu vào</dt><dd><code>${escape(binding.inputSha256)}</code></dd><dt>Cặp báo cáo nguồn</dt><dd><code>${escape(binding.pairId)}</code></dd><dt>Kết quả phương pháp</dt><dd><code>${escape(coding.output.methodOutputId)}</code></dd></dl><details><summary>Biên nhận lựa chọn (${count})</summary><div class="table-wrap" role="region" aria-label="Biên nhận lựa chọn mã hóa" tabindex="0"><table><caption>Biên nhận lựa chọn đã lưu cho đề xuất này</caption><thead><tr><th scope="col">Mã biên nhận</th><th scope="col">SHA-256</th></tr></thead><tbody>${rows}</tbody></table></div></details>`;
}
const inputLabels: Readonly<Record<string, string>> = {
  'validated-metrics': 'số liệu đã kiểm tra', 'source-bound-claims': 'nhận định có tham chiếu nguồn', 'owner-review': 'duyệt của người dùng',
  'source-manifest': 'bản kê nguồn', 'source-package-manifest': 'bản kê gói nguồn', 'verified-locators': 'vị trí bằng chứng đã xác minh',
  'normalized-metric-rows': 'số liệu thị trường đã chuẩn hóa', 'frozen-label-decisions': 'nhãn phân loại đã chốt', 'source-scope': 'phạm vi của nguồn',
  'metric-result': 'kết quả tính từ số liệu thị trường', 'denominators': 'mẫu số đã xác định', 'scope': 'phạm vi nghiên cứu',
  'verified-method-artifacts': 'kết quả phương pháp đã xác minh', 'comparable-groups': 'các nhóm có thể so sánh',
  'compatible-daily-series': 'chuỗi theo ngày cùng định nghĩa', 'normalization-receipt': 'biên nhận chuẩn hóa', 'owner-question': 'câu hỏi của người dùng',
  'resolved-fact-claim-pointers': 'liên kết dữ kiện và nhận định đã kiểm tra', 'domain-specific-evidence': 'bằng chứng chuyên ngành',
  'measurement-design': 'thiết kế đo lường', 'existing-relevant-outcomes': 'kết quả liên quan đã quan sát', 'held-out-horizon': 'kỳ kiểm tra độc lập',
  'adjudication-provenance': 'dấu vết xử lý bất đồng', 'case-locators': 'vị trí bằng chứng từng trường hợp',
  'canonical-tablet-quote-input': 'đầu vào báo giá viên theo hợp đồng', 'exact-raw-quote-source-and-locator': 'báo giá gốc và vị trí chính xác',
  'exact-source-package-lineage': 'dấu vết gói nguồn chính xác', 'explicit-price-state-and-observation-time': 'trạng thái giá và thời điểm quan sát',
  'optional-owner-declared-tablet-count': 'số viên do người dùng khai báo nếu có', 'verified-locators-and-denominators': 'vị trí bằng chứng và mẫu số đã xác minh',
};
/** Vietnamese gloss shown next to the raw code; the raw code stays visible for lookup. */
const pendingReasonGloss: Readonly<Record<LiteralPendingReason, string>> = {
  NON_NFC_TEXT: 'văn bản chưa ở dạng Unicode chuẩn', NO_RULE_MATCH: 'không khớp quy tắc đọc nào',
  INFORMAL_OR_UNACCENTED_MARKER: 'có từ viết tắt, không dấu hoặc khẩu ngữ', QUESTION_SENTENCE: 'câu hỏi, không phải khai báo',
  CONDITIONAL_SCOPE: 'nằm trong mệnh đề điều kiện', FUTURE_OR_INTENT_SCOPE: 'nói về dự định hoặc tương lai',
  TENSE_OR_MODALITY_MIXED: 'lẫn thì hoặc tình thái', NEGATION_SCOPE_UNCLEAR: 'chưa rõ phạm vi phủ định',
  POST_VERBAL_NEGATION_OR_QUESTION: 'phủ định hoặc hỏi đặt sau động từ', MULTIPLE_NEGATORS: 'có nhiều từ phủ định',
  NEGATED_ABILITY_ATTEMPT_OR_COMPLETION: 'phủ định khả năng, việc thử hoặc việc hoàn tất', NEGATED_VERB_AMBIGUOUS: 'động từ bị phủ định chưa rõ nghĩa',
  UNSUPPORTED_EVENT_PATTERN: 'mẫu sự kiện chưa được quy tắc hỗ trợ', THIRD_PARTY_ACTOR: 'người thực hiện là bên thứ ba',
  UNRECOGNIZED_SUBJECT: 'chưa nhận diện được chủ ngữ', MIXED_EVENT_READINGS_IN_CLAUSE: 'một mệnh đề có nhiều cách đọc sự kiện',
  MULTIPLE_EVENTS_IN_CLAUSE: 'một mệnh đề có nhiều sự kiện', INABILITY_WITHOUT_LOCATED_TASK: 'nói không làm được nhưng chưa định vị việc cần làm',
  NOT_YET_NEGATION: 'phủ định dạng “chưa”', MULTIPLE_TARGETS: 'có nhiều đối tượng được nhắc',
  UNRESOLVED_SPEECH_FRAME: 'chưa rõ ai đang nói', THIRD_PARTY_ATTITUDE_HOLDER: 'thái độ thuộc về bên thứ ba',
  REASON_WITHOUT_LOCATED_CHOICE: 'có lý do nhưng chưa định vị lựa chọn', NEGATED_OR_UNCLEAR_CHOICE: 'lựa chọn bị phủ định hoặc chưa rõ',
  NEGATED_CONDITIONAL_REASON: 'lý do bị phủ định hoặc có điều kiện', AMBIGUOUS_RESULT_LINKER: 'từ nối kết quả có nhiều cách hiểu',
  TASK_CLAUSE_UNRESOLVED: 'chưa xác định mệnh đề nhiệm vụ', NO_ACTION_TASK: 'nhiệm vụ không kèm hành động',
  NEGATED_CONTEXT: 'bối cảnh bị phủ định', HEARSAY_CONTEXT: 'bối cảnh là lời kể lại',
  CONFLICTING_RULE_READINGS: 'các quy tắc cho cách đọc trái nhau', QUOTED_TEXT_SCOPE: 'nằm trong phần trích dẫn',
  NEGATED_OBSTACLE: 'trở ngại bị phủ định', NEGATED_ATTITUDE: 'thái độ bị phủ định',
  TASK_OBSTACLE_RELATION_UNVERIFIED: 'chưa kiểm chứng quan hệ nhiệm vụ và trở ngại', ATTITUDE_HOLDER_UNRESOLVED: 'chưa xác định người có thái độ',
};
const dispositionGloss: Readonly<Record<string, string>> = {
  INCLUDED: 'đưa vào đọc', EXCLUDED: 'loại khỏi đọc', UNREADABLE: 'không đọc được',
  EMPTY_TEXT: 'văn bản trống', UNREADABLE_TEXT: 'không đọc được văn bản', QUARANTINED: 'bị cách ly theo quy tắc nguồn',
  WRONG_LISTING: 'không thuộc listing đã chọn', UNRESOLVED_LISTING: 'chưa xác định được listing',
  NON_REVIEW_ROW: 'dòng không phải review', UNRESOLVED_ROW_TYPE: 'chưa xác định loại dòng', UNRESOLVED_CONFLICT: 'xung đột phiên bản chưa xử lý',
  NATIVE_ID_TEXT_CONFLICT: 'cùng mã review nhưng nội dung khác', NATIVE_ID_RATING_CONFLICT: 'cùng mã review nhưng điểm khác',
  NATIVE_ID_LISTING_CONFLICT: 'cùng mã review nhưng listing khác',
};
const glossedCodes = (codes: string, gloss: Readonly<Record<string, string>>): string => codes.split(',').map(code =>
  `<code>${escape(code)}</code>${gloss[code] ? ` <small>(${escape(gloss[code])})</small>` : ''}`).join('<br>');
const recordNumberNote = 'Số “Bản ghi N” trên trang đếm từ 1; con trỏ trong hồ sơ phương pháp đếm từ 0, nên Bản ghi N ứng với chỉ số N − 1.';

function collectionCaptureMap(input: AutomationReportInput): ReadonlyMap<number, CaptureRecord> {
  const captures = new Map<number, CaptureRecord>();
  for (const capture of input.captures) {
    if (capture.stepId !== 'COLLECTION') continue;
    if (!Number.isSafeInteger(capture.ordinal) || capture.ordinal < 0 || captures.has(capture.ordinal)) throw new Error('Report capture ordinal mismatch');
    captures.set(capture.ordinal, capture);
  }
  return captures;
}

function observedRows(input: AutomationReportInput, captures: ReadonlyMap<number, CaptureRecord>): readonly TypedComparable[] {
  const selected = new Set([...input.scope.selectedProductIds, ...input.scope.peerProductIds]);
  return (input.collection?.comparables ?? []).filter(row => {
    const capture = captures.get(row.captureIndex);
    return selected.has(row.productId) && /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.value) &&
      capture?.provider === row.provider && !capture.truncated &&
      capture.window?.startDate === row.window.startDate && capture.window.endDate === row.window.endDate &&
      row.window.startDate <= row.window.endDate && row.window.startDate >= input.start.requestedPeriod.startDate && row.window.endDate <= input.start.requestedPeriod.endDate;
  });
}

function observationTable(rows: readonly TypedComparable[], captures: ReadonlyMap<number, CaptureRecord>): string {
  if (!rows.length) return '';
  return `<div class="table-wrap" role="region" aria-label="Giá trị nguồn theo từng sản phẩm và kỳ truy vấn" tabindex="0"><table class="observations"><caption>Giá trị nguồn theo từng sản phẩm và kỳ truy vấn. Không phải tổng thị trường.</caption><thead><tr><th scope="col">Sản phẩm nguồn</th><th scope="col">Phép đo / đơn vị</th><th scope="col">Giá trị nguồn</th><th scope="col">Kỳ đo</th><th scope="col">Bản thu nguồn</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.productId)}</td><td>${escape(row.provider)} · ${escape(row.metric)}</td><td>${escape(row.value)}</td><td>${escape(row.window.startDate)} đến ${escape(row.window.endDate)}</td><td><code>${escape(captures.get(row.captureIndex)!.artifactSha256)}</code></td></tr>`).join('')}</tbody></table></div>`;
}

/** Deliberately narrower than the complete M07 method: no universe, share or rank inference. */
function peerEvidence(input: AutomationReportInput, captures: ReadonlyMap<number, CaptureRecord>): readonly TypedComparable[] {
  const peers = input.scope.peerProductIds;
  if (peers.length < 2 || input.collection === null) return [];
  const candidates = input.collection.comparables.filter(row => peers.includes(row.productId));
  const groups = new Map<string, TypedComparable[]>();
  for (const row of candidates) {
    const key = JSON.stringify([row.provider, row.metric, row.window.startDate, row.window.endDate]);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups.entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).flatMap(([, matches]) => {
    if (matches.length !== peers.length || !peers.every(id => matches.filter(row => row.productId === id).length === 1)) return [];
    if (!matches.every(row => {
      const capture = captures.get(row.captureIndex);
      return /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.value) && capture?.provider === row.provider && !capture.truncated &&
        capture.window?.startDate === row.window.startDate && capture.window.endDate === row.window.endDate &&
        row.window.startDate <= row.window.endDate && row.window.startDate >= input.start.requestedPeriod.startDate && row.window.endDate <= input.start.requestedPeriod.endDate;
    })) return [];
    return peers.map(id => matches.find(row => row.productId === id)!);
  });
}

export function buildResearchAutomationReport(input: AutomationReportInput, kind: 'MARKET' | 'INSIGHT'): { semantic: object; html: Buffer } {
  if (input.run.runId !== input.scope.runId || input.run.workspaceId !== input.start.workspaceId || input.run.workspaceId !== input.scope.workspaceId) throw new Error('Report lineage mismatch');
  if (input.collection && (input.collection.runId !== input.run.runId || input.collection.stepId !== 'COLLECTION')) throw new Error('Report collection lineage mismatch');
  if (input.insightCoding) {
    const { binding, receipts, selection } = input.insightCoding;
    if (binding.workspaceId !== input.run.workspaceId || binding.runId !== input.run.runId) throw new Error('Report insight coding lineage mismatch');
    const receiptIds = new Set(receipts.map(receipt => receipt.receiptId));
    if (receiptIds.size !== receipts.length || selection.receiptIds.length !== receipts.length || !selection.receiptIds.every(id => receiptIds.has(id))) throw new Error('Report insight coding receipt mismatch');
    if (binding.sourceKind === 'NATIVE' ? input.locatedReview || input.locatedReviewFallback : input.nativeReview || input.nativeReviewFallback) throw new Error('Report insight coding source kind mismatch');
  }
  const insightCoding = kind === 'INSIGHT' ? input.insightCoding : undefined;
  const captures = collectionCaptureMap(input);
  const evidence = peerEvidence(input, captures);
  const observations = observedRows(input, captures);
  const prefix = kind === 'MARKET' ? 'M' : 'I';
  const contextSections = kind === 'MARKET' ? ['M02', 'M13'] : ['I01', 'I03', 'I17'];
  const descriptive = kind === 'MARKET' ? input.descriptiveMethods : undefined;
  if (input.nativeReview && (input.locatedReview || input.reviewCorpus)) throw new Error('Native and exact-collection review lineage cannot be substituted');
  const located = kind === 'INSIGHT' ? input.nativeReview ?? (input.locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? input.locatedReview : undefined) : undefined;
  if (located && located.runId !== input.run.runId) throw new Error('Report corpus trace lineage mismatch');
  const corpusTrace = located ? projectCorpusTrace(located) : undefined;
  const views = new Map<string, DescriptiveSectionView>();
  const locatedViews = new Map<string, string>();
  // Sections whose retained decision synthesis is VALID; candidate prose never makes a section analytically complete.
  const decisionGeneratedIds: string[] = [];
  const decisionProposedIds: string[] = [];
  // Catalog fallbacks: the stored method stays the catalog reference; the page says it did not run here.
  const fallbackIds = new Set<string>();
  const sourceObservationNote = observations.length
    ? ` Quan sát sản phẩm đã thu được giữ ở ${kind === 'MARKET' ? 'M13' : 'báo cáo thị trường'}; không đủ để tự suy ra quy mô thị trường hoặc insight khách hàng.`
    : ' Không tự suy ra quy mô thị trường hoặc insight khách hàng từ phần còn thiếu.';
  /** Display-only reason built from inputs actually present in this run; it never changes state or eligibility. */
  const blockedGuidance = (section: CatalogSection): string => {
    const needs = ` Mục cần: ${section.requiredInputs.map(id => inputLabels[id] ?? id).join(', ')}.`;
    const id = section.sectionId;
    if (kind === 'MARKET' && id === 'M08') return 'Lượt này chưa có gói báo giá bổ sung nên chưa chạy phép tính giá theo đơn vị generic-quote-unit-v1@1.0.0. '
      + 'Phép tính chỉ dùng giá, quy cách mỗi gói (khối lượng hoặc số món) và biến thể được nguồn ghi rõ kèm vị trí; không suy ra quy cách hay biến thể từ tên sản phẩm. '
      + `Danh mục còn ghi phương pháp ${section.methodId}@${section.methodVersion} với đầu vào riêng; chưa xác lập phương pháp đó áp dụng cho sản phẩm của lượt này. `
      + 'Đây chưa phải phân tích kinh tế đơn vị.' + sourceObservationNote;
    if (kind === 'MARKET' && isDescriptiveSectionId(id)) return `Phương pháp mô tả không có kết quả trong lượt này: ${input.collection?.comparables.length
      ? 'các quan sát sản phẩm đã thu chưa tạo được kết quả phương pháp được lưu'
      : 'lượt này không có quan sát sản phẩm từ bản thu nguồn mới'}.${needs}${sourceObservationNote}`;
    if (kind === 'MARKET' && (id === 'M03' || id === 'M04')) return `Lượt này không có gói Metric gắn kèm${id === 'M03' ? ' và không có inventory từ bản thu nguồn' : ''}, nên chưa tính mục này.${needs}${sourceObservationNote}`;
    if (['M10', 'I11', 'I12', 'I16'].includes(id)) return `Phương pháp kiểm tra điều kiện của mục này chỉ chạy trên hồ sơ nguồn bổ sung do người dùng chọn; lượt này chưa có hồ sơ đó.${needs}${sourceObservationNote}`;
    if (kind === 'INSIGHT' && (isLiteralFamily(id) || codingFamilies.some(family => family === id))) {
      const records = located?.output.input.records.length;
      return (records !== undefined
        ? `Lượt này có ${records} bản ghi review trong lớp mã hóa, nhưng chưa có kết quả cho ${id}: quy tắc đọc bám lời nguồn đã duyệt chỉ áp dụng cho ${literalFamilies.join(', ')}, và chưa có biên nhận lựa chọn mã hóa cho mục này.`
        : retainedReviewStatus(input) !== null
          ? `${retainedReviewStatus(input)} Xem trạng thái nguồn ở I03 và hồ sơ đối chiếu ở I17.`
          : 'Lượt này chưa có review nguồn gắn kèm.') + ` Không suy ra nguồn không nhắc tới nội dung này.${needs}`;
    }
    return `Chưa có kết quả cho mục này trong lượt. Bản nháp không đủ thông tin để xác định riêng nguyên nhân là thiếu đầu vào, còn chờ duyệt hay phương pháp chưa chạy.${needs}${sourceObservationNote}`;
  };
  const sections: DraftSection[] = catalog.sections.filter(section => section.sectionId.startsWith(prefix)).map(section => {
    const decisionPacket = input.decisionPackets?.find(packet => packet.sectionId === section.sectionId);
    if (decisionPacket && input.decisionSourceClaims) {
      const synthesis = input.decisionSynthesis?.[decisionPacket.sectionId];
      const proposed = synthesis?.status === 'VALID' && synthesis.candidates.artifact.aiCandidates.length > 0;
      if (synthesis?.status === 'VALID') decisionGeneratedIds.push(section.sectionId);
      if (proposed) decisionProposedIds.push(section.sectionId);
      locatedViews.set(section.sectionId, decisionPacketSection(decisionPacket, input.decisionSourceClaims, synthesis));
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
        method: `${decisionPacket.methodId}@${decisionPacket.methodVersion}`,
        explanation: !synthesis ? 'Đã nối bằng chứng của đúng phiên bản báo cáo. Chưa sinh giả thuyết, phương án hoặc hành động; không có quyết định thay người dùng.'
          : proposed ? 'Đã nối bằng chứng của đúng phiên bản báo cáo. Đề xuất AI đã lưu là bản nháp chờ người dùng xem xét, không phải phương án đã chọn; không có quyết định thay người dùng.'
          : synthesis.status === 'VALID' ? 'Đã nối bằng chứng của đúng phiên bản báo cáo. Lần xử lý AI đã lưu không đưa ra đề xuất; không có quyết định thay người dùng.'
          : 'Đã nối bằng chứng của đúng phiên bản báo cáo. Chưa có đề xuất AI được đưa vào báo cáo; không có quyết định thay người dùng.' };
    }
    if (kind === 'MARKET' && section.sectionId === 'M08' && input.quoteMethods) {
      const view = quoteMethodSection(input.quoteMethods);
      locatedViews.set(section.sectionId, view.html);
      return { sectionId: section.sectionId, title: section.title, state: view.usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: `${input.quoteMethods.output.methodId}@${input.quoteMethods.output.methodVersion}`,
        explanation: 'Đã kiểm tra trường nguồn và tính riêng từng cơ sở giá có đủ dữ liệu. Kết quả giới hạn trong các chào bán được chọn; chưa phải phân tích kinh tế đơn vị hoàn chỉnh.' };
    }
    if (input.boundedMethods && ['M10', 'I11', 'I12', 'I16'].includes(section.sectionId)) {
      const html = renderReportMethodPacketSection({ gates: input.boundedMethods.output }, section.sectionId, { evidenceAnchorId: 'bounded-method-evidence' });
      if (html !== undefined) locatedViews.set(section.sectionId, html);
      return { sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
        method: `${input.boundedMethods.output.methodId}@${input.boundedMethods.output.methodVersion}`,
        explanation: 'Đã xử lý hồ sơ nguồn được chọn cho phiên bản này. Chỉ kiểm tra điều kiện phương pháp; chưa thực hiện dự báo, suy luận nhân quả hoặc xác nhận insight. Kỳ và phạm vi của hồ sơ không mặc nhiên trùng kỳ báo cáo.' };
    }
    if (kind === 'MARKET' && section.sectionId === 'M01' && input.m01Inventory && input.sourceClaims) return {
      sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
      method: `${input.m01Inventory.methodId}@${input.m01Inventory.methodVersion}`,
      explanation: input.m01Inventory.items.length
        ? 'Bằng chứng đầu nguồn đã được chốt với phiên bản này. Danh sách không thay thế kết luận chính hoặc quyết định của người dùng.'
        : 'Đã kiểm tra nguồn đã chốt với phiên bản này; chưa có mục bằng chứng nào đủ điều kiện cho M01. Nguồn đã chốt vẫn được giữ; khoảng trống này không phải kết luận.',
    };
    if (kind === 'INSIGHT' && section.sectionId === 'I14' && input.i14Admission && input.sourceClaims) return {
      sectionId: section.sectionId, title: section.title, state: 'EVIDENCE_INVENTORY', rows: [],
      method: `${input.i14Admission.methodId}@${input.i14Admission.methodVersion}`,
      explanation: 'Đã kiểm tra điều kiện bằng chứng cho I14. Kiểm tra này không tự tạo hoặc duyệt một hướng cơ hội.',
    };
    if (located && isLiteralFamily(section.sectionId) && !usesCodingFamily(insightCoding, section.sectionId)) {
      const result = located.output.sections[section.sectionId];
      const pending = literalPendingSection(located, section.sectionId);
      locatedViews.set(section.sectionId, pending.notice + renderLocatedInsightSection(located.output, section.sectionId, { bundleDownload: false, showAnnotationPendingCount: false })! + pending.details);
      return {
        sectionId: section.sectionId, title: section.title,
        state: result.annotationPointers.length ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: `literal-source-bound-v1/${located.output.methodId}@${located.output.methodVersion}`,
        explanation: 'Khai báo bám sát lời nguồn được đưa vào theo quy tắc đã duyệt cho phạm vi hẹp. Giữ nguyên lời kể, điều chưa rõ và các phần chờ xử lý; chưa phải kết luận insight hoặc mục phân tích hoàn chỉnh.',
        methodOutput: { methodOutputId: located.output.methodOutputId, locatedRecordCount: result.locatedRecordCount,
          unresolvedPointers: located.projection.pending.flatMap((row, index) => row.family === section.sectionId ? [`/projection/pending/${index}`] : []), blockers: result.blockers },
      };
    }
    if (insightCoding && usesCodingFamily(insightCoding, section.sectionId)) {
      const view = insightCodingView(insightCoding, section.sectionId as CodingFamily);
      locatedViews.set(section.sectionId, view.html);
      return {
        sectionId: section.sectionId, title: section.title, state: view.usable ? 'METHOD_OUTPUT' : 'METHOD_NO_USABLE_RECORDS', rows: [],
        method: `source-bound-insight-coding-v1/${insightCoding.output.methodId}@${insightCoding.output.methodVersion}`,
        explanation: view.explanation, methodOutput: view.methodOutput,
      };
    }
    if (kind === 'MARKET' && input.metricMethods && (section.sectionId === 'M03' || section.sectionId === 'M04')) return {
      sectionId: section.sectionId, title: section.title, state: input.metricClassified ? 'METHOD_OUTPUT' : 'SOURCE_TABLE', rows: [],
      method: input.metricMethods.result.methodVersion,
      explanation: input.metricClassified ? 'Đã tính các phạm vi toàn bộ mẫu (ALL), rộng (WIDE) và cốt lõi (CORE) bằng phân loại được chủ dự án chấp nhận. Kết quả có giới hạn trong mẫu xuất, chưa chứng minh độ phủ toàn thị trường hoặc hoàn tất mọi yêu cầu của mục.' : 'Đã tính theo công thức đã chốt từ các dòng Metric gốc. Tổng và mức tập trung dưới đây chỉ áp dụng cho mẫu xuất theo từ khóa; chưa phải thị trường đã phân loại hoặc mục phân tích hoàn chỉnh.',
    };
    if (kind === 'MARKET' && input.metricMethodsFailure && (section.sectionId === 'M03' || section.sectionId === 'M04')) return {
      sectionId: section.sectionId, title: section.title, state: 'BLOCKED', rows: [], method: 'metric-scope-v1',
      explanation: metricFailureCopy[input.metricMethodsFailure].explanation,
    };
    if (kind === 'MARKET' && input.marketInventory && (section.sectionId === 'M03' || section.sectionId === 'M08')) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_TABLE', rows: [],
      method: section.sectionId === 'M03' ? 'source-compatible-temporal-v1@1.0.0' : 'generic-quote-unit-v1@1.0.0',
      explanation: 'Đã lập danh sách quan sát từ nguồn lưu sẵn. Chưa tính được vì thiếu điều kiện nguồn; danh sách này chưa phải kết quả phân tích hoàn chỉnh.',
    };
    if (contextSections.includes(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_CONTEXT', method: 'automation-source-context-v1', rows: section.sectionId === 'M13' ? observations : [],
      explanation: section.sectionId === 'I01' ? 'Yêu cầu nghiên cứu ghi lại từ phạm vi đã xác nhận; không phải nhận định AI hay insight đã duyệt.' : 'Phạm vi yêu cầu, độ phủ thực tế và dấu vết nguồn của lượt này. Không thay thế phương pháp tính chuyên biệt của từng mục.',
    };
    const view = descriptive && isDescriptiveSectionId(section.sectionId) ? describeDescriptiveSection(descriptive, section.sectionId) : undefined;
    if (view) views.set(section.sectionId, view);
    const methodOutput = view && descriptive ? { methodOutputId: descriptive.methodOutputId, locatedRecordCount: view.locatedRecordCount, unresolvedPointers: view.unresolvedPointers, blockers: view.blockers } : undefined;
    if (view?.usable && methodOutput) return {
      sectionId: section.sectionId, title: section.title, state: 'METHOD_OUTPUT', method: `${descriptive!.methodId}@${descriptive!.methodVersion}`, rows: [], methodOutput,
      explanation: 'Kết quả phương pháp mô tả có giới hạn từ gói nguồn đã lưu. Phương pháp đã chạy, nhưng mục này chưa phải phân tích hoàn chỉnh và chưa được duyệt.',
    };
    if (section.sectionId === 'M07' && evidence.length > 0) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_TABLE', method: 'automation-explicit-peer-evidence-v1', rows: evidence,
      explanation: 'Bảng quan sát cho nhóm sản phẩm đối chiếu được chọn rõ ràng, cùng nguồn, đơn vị và kỳ đo. Không đại diện toàn thị trường; chưa thực hiện đầy đủ phương pháp M07.',
    };
    if (methodOutput) return {
      sectionId: section.sectionId, title: section.title, state: 'METHOD_NO_USABLE_RECORDS', method: `${descriptive!.methodId}@${descriptive!.methodVersion}`, rows: [], methodOutput,
      explanation: `Phương pháp mô tả đã chạy nhưng không có bản ghi nguồn dùng được cho mục này. Đây không phải kết quả bằng 0. Mục vẫn cần: ${section.requiredInputs.map(id => inputLabels[id] ?? id).join(', ')}.`,
    };
    if (kind === 'MARKET' && input.descriptiveMethodFailure && isDescriptiveSectionId(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [],
      explanation: 'Đã thử chạy phương pháp mô tả nhưng đầu vào hoặc phương pháp không vượt qua kiểm tra. Không có kết quả dùng được cho mục này; xem mã lỗi và dấu vết nguồn tại phụ lục M13. Không tự động gọi lại nguồn.',
    };
    if (kind === 'MARKET' && input.marketInventoryFailure && (section.sectionId === 'M03' || section.sectionId === 'M08')) return {
      sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [],
      explanation: 'Phương pháp đã được nối nhưng dữ liệu nguồn không vượt qua kiểm tra inventory. Chưa có kết quả được xác minh; không tự gọi lại nguồn.',
    };
    fallbackIds.add(section.sectionId);
    return { sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [], explanation: blockedGuidance(section) };
  });
  const ids = (state: DraftSection['state']): string[] => sections.filter(section => section.state === state).map(section => section.sectionId);
  const completion = {
    completedAnalyticalSections: 0,
    boundedMethodOutputSections: ids('METHOD_OUTPUT').length, boundedMethodOutputSectionIds: ids('METHOD_OUTPUT'),
    boundedMethodNoUsableRecordSectionIds: ids('METHOD_NO_USABLE_RECORDS'),
    evidenceInventorySectionIds: ids('EVIDENCE_INVENTORY'),
    contextSections: ids('SOURCE_CONTEXT').length, sourceTableSections: ids('SOURCE_TABLE').length, blockedSections: ids('BLOCKED').length,
  };
  const sourceScope = kind === 'MARKET' ? projectMarketSourceScope(input) : undefined;
  const semantic = {
    ...(sourceScope ? { sourceScope } : {}),
    ...(kind === 'MARKET' && input.quoteMethods ? { quoteMethods: input.quoteMethods } : {}),
    ...(input.boundedMethods ? { boundedMethods: input.boundedMethods } : {}),
    contractVersion: 'research-automation-report-v1', rendererVersion: 'automation-report-kit-v11', kind, state: 'PARTIAL_UNREVIEWED_DRAFT',
    runId: input.run.runId, workspaceId: input.run.workspaceId, createdAt: input.run.createdAt,
    keyword: input.start.keyword, country: input.start.country, requestedPeriod: input.start.requestedPeriod,
    scope: input.scope, scopeApplication: 'OWNER_CONTEXT_ONLY_SOURCE_FILTER_MAPPING_PENDING', coverage: input.run.coverage, usage: input.run.usage,
    collectionOutcome: input.collection?.outcome ?? null, limitations: input.collection?.limitations ?? [],
    captures: input.captures, sections, ...(kind === 'INSIGHT' ? { reviewCorpus: input.reviewCorpus ?? null, locatedReview: input.locatedReview ?? null, nativeReview: input.nativeReview ?? null,
      ...(input.nativeReviewFallback ? { nativeReviewFallback: input.nativeReviewFallback } : {}),
      ...(input.insightCoding ? { insightCoding: input.insightCoding } : {}),
      ...(input.nativeReviewFailure ? { nativeReviewFailure: input.nativeReviewFailure } : {}),
      ...(input.locatedReviewFailure ? { locatedReviewFailure: input.locatedReviewFailure } : {}), ...(input.reviewCorpusFailure ? { reviewCorpusFailure: input.reviewCorpusFailure } : {}) } : {}), ...(kind === 'MARKET' ? { marketInventory: input.marketInventory ?? null, ...(input.marketInventoryFailure ? { marketInventoryFailure: input.marketInventoryFailure } : {}), descriptiveMethods: input.descriptiveMethods ?? null,
      ...(input.descriptiveMethodFailure ? { descriptiveMethodFailure: input.descriptiveMethodFailure } : {}),
      metricMethods: input.metricMethods ?? null, ...(input.metricClassified ? { metricClassified: input.metricClassified } : {}), ...(input.metricMethodsFailure ? { metricMethodsFailure: input.metricMethodsFailure } : {}) } : {}), completion,
  };
  const title = kind === 'MARKET' ? 'Báo cáo thị trường' : 'Báo cáo insight';
  const period = `${input.start.requestedPeriod.startDate} đến ${input.start.requestedPeriod.endDate} · ${input.start.requestedPeriod.dayCount} ngày`;
  const retainedSources = (kind === 'MARKET' ? [
    input.metricMethods || input.metricMethodsFailure ? 'gói Metric gắn kèm (M03, M04)' : '', input.quoteMethods ? 'gói báo giá bổ sung (M08)' : '',
    input.m01Inventory ? 'bằng chứng đầu nguồn (M01)' : '', input.boundedMethods ? 'hồ sơ nguồn bổ sung (M10)' : '',
  ] : [
    input.nativeReview || input.collection?.nativeReview ? 'review native đã lưu (I03, I17)' : '', input.reviewCorpus ? 'collection review đã lưu (I03, I17)' : '',
    input.i14Admission ? 'bằng chứng bối cảnh sử dụng (I14)' : '', input.boundedMethods ? 'hồ sơ nguồn bổ sung (I11, I12, I16)' : '',
  ]).filter(Boolean);
  const noCaptureRow = `<tr><td colspan="4">Lượt này không có bản thu từ truy vấn nguồn mới.${retainedSources.length ? ` Nguồn đã lưu và gắn với lượt vẫn được dùng ở: ${retainedSources.join('; ')}.` : ''}</td></tr>`;
  const sourceTable = `<p>Kỳ truy vấn là khoảng ngày đã gửi tới nguồn, không chứng minh đã thu đủ dữ liệu.</p><div class="table-wrap" role="region" aria-label="Bản thu từ truy vấn nguồn" tabindex="0"><table><caption>Bản thu từ truy vấn nguồn của lượt này</caption><thead><tr><th scope="col">Nguồn / thao tác</th><th scope="col">Kỳ truy vấn</th><th scope="col">Lượt gọi kết thúc</th><th scope="col">Dấu vết</th></tr></thead><tbody>${input.captures.map(capture => `<tr><td>${escape(capture.provider)}<br>${escape(capture.operation)}</td><td>${capture.window ? escape(`${capture.window.startDate} đến ${capture.window.endDate}`) : 'Không áp dụng kỳ truy vấn'}</td><td>${escape(capture.retrievedAt)}</td><td><code>${escape(capture.artifactSha256)}</code>${capture.truncated ? '<br>Bản thu bị cắt; không dùng để tính' : ''}</td></tr>`).join('') || noCaptureRow}</tbody></table></div>`;
  const scope = `<dl><dt>Thị trường</dt><dd>Việt Nam</dd><dt>Định nghĩa đã xác nhận</dt><dd>${escape(input.scope.definition)}</dd><dt>Kỳ báo cáo yêu cầu</dt><dd>${escape(period)}</dd><dt>Điều kiện bao gồm</dt><dd>${escape(input.scope.includeTerms.join(', ') || 'Không thêm điều kiện')}</dd><dt>Điều kiện loại trừ</dt><dd>${escape(input.scope.excludeTerms.join(', ') || 'Không thêm điều kiện')}</dd></dl><p class="warning">Điều kiện trên là ý định nghiên cứu đã lưu. Chưa xác nhận các truy vấn nguồn áp dụng đầy đủ điều kiện này. ${input.metricClassified ? 'Mẫu Metric đã được phân loại CORE/WIDE theo quy tắc và biên nhận được chốt; không suy rộng phân loại đó sang nguồn khác.' : 'Chưa phân loại CORE/WIDE.'} Kỳ yêu cầu không chứng minh mọi nguồn có đủ dữ liệu trong kỳ này. Kết quả tìm kiếm hiện tại và danh sách top sản phẩm không phải tổng doanh số thị trường.</p>`;
  const stateLabel: Readonly<Record<DraftSection['state'], string>> = {
    EVIDENCE_INVENTORY: 'Kiểm tra bằng chứng · Chưa có kết luận',
    BLOCKED: 'Chưa đủ dữ liệu / phương pháp', SOURCE_TABLE: 'Bảng bằng chứng · Chưa duyệt', SOURCE_CONTEXT: 'Ngữ cảnh nguồn · Chưa duyệt',
    METHOD_OUTPUT: kind === 'INSIGHT' ? 'Mã hóa lời nguồn · Kết quả từng phần' : 'Kết quả phương pháp mô tả · Chưa phải phân tích hoàn chỉnh', METHOD_NO_USABLE_RECORDS: 'Phương pháp đã chạy · Không có bản ghi dùng được',
  };
  const coverSummary = `Trong ${sections.length} mục: ${([
    [completion.boundedMethodOutputSections, 'có kết quả phương pháp từng phần'], [completion.evidenceInventorySectionIds.length, 'kiểm tra bằng chứng'],
    [completion.contextSections, 'ngữ cảnh nguồn'], [completion.sourceTableSections, 'bảng nguồn'],
    [completion.boundedMethodNoUsableRecordSectionIds.length, 'đã chạy phương pháp nhưng không có bản ghi dùng được'], [completion.blockedSections, 'chưa có kết quả'],
  ] as const).flatMap(([count, label]) => count ? [`${count} mục ${label}`] : []).join('; ')}. Mục phân tích hoàn chỉnh: ${completion.completedAnalyticalSections}; không tuyên bố báo cáo hoàn chỉnh.`;
  const methodIds = completion.boundedMethodOutputSectionIds;
  const emptyIds = completion.boundedMethodNoUsableRecordSectionIds;
  const literalIds = methodIds.filter(id => isLiteralFamily(id) && !usesCodingFamily(insightCoding, id));
  const codingIds = methodIds.filter(id => usesCodingFamily(insightCoding, id));
  const headline = [
    kind === 'MARKET' && input.metricMethods ? input.metricClassified ? 'Đã tính các phạm vi ALL/WIDE/CORE bằng phân loại đã duyệt. Kết quả giới hạn trong mẫu nguồn và kỳ đo đã lưu; chưa đánh dấu M03/M04 hoàn chỉnh.' : 'Đã tính tổng và độ tập trung từ các dòng Metric gốc của đúng lượt này. Mẫu theo keyword chưa được phân loại thành thị trường; không đánh dấu M03/M04 hoàn chỉnh.' : '',
    kind === 'MARKET' && input.descriptiveMethodFailure ? 'Chưa tính được các mục mô tả thị trường vì đầu vào hoặc phương pháp không vượt qua kiểm tra. Bản nháp này chỉ giữ ngữ cảnh và dấu vết nguồn. Cần kiểm tra lỗi trước khi tạo phiên bản mới; không tự động gọi lại nguồn.' : '',
    `Mục phân tích hoàn chỉnh: ${completion.completedAnalyticalSections}.`,
    completion.evidenceInventorySectionIds.length ? `Đã kiểm tra bằng chứng, chưa có kết luận: ${completion.evidenceInventorySectionIds.join(', ')}.` : '',
    decisionProposedIds.length ? `Đề xuất AI đã lưu ở ${decisionProposedIds.join(', ')} là bản nháp chưa duyệt, không tính là mục phân tích hoàn chỉnh.` : '',
    kind === 'MARKET' ? descriptive ? `Kết quả phương pháp mô tả có giới hạn, chưa duyệt: ${methodIds.length} mục${methodIds.length ? ` (${methodIds.join(', ')})` : ''}.` : input.descriptiveMethodFailure ? '' : `Không có kết quả phương pháp mô tả thị trường: ${input.collection?.comparables.length ? 'các quan sát sản phẩm đã thu chưa tạo được kết quả được lưu' : 'lượt này không có quan sát sản phẩm từ bản thu nguồn mới'}.` : '',
    located ? `Mã hóa lời nguồn có giới hạn: ${literalIds.length} mục${literalIds.length ? ` (${literalIds.join(', ')})` : ''}. ${located.projection.pending.length} mục chờ xử lý vẫn được giữ riêng. Chưa có kết luận hoặc tỷ lệ đại diện thị trường.` : '',
    insightCoding ? `Mã hóa đã chọn trên đề xuất (${(insightCoding.selectionContractVersion === 'automation-insight-selection-v2' ? semanticCodingFamilies : codingFamilies).join(', ')}): có kết quả dùng được ở ${codingIds.length ? codingIds.join(', ') : 'chưa mục nào'}. Đây là mã hóa bám lời nguồn, không phải quan sát độc lập${sections.some(section => usesCodingFamily(insightCoding, section.sectionId) && section.methodOutput?.unresolvedPointers.length) ? '; phần chưa chọn vẫn chờ xử lý' : ''}.` : '',
    emptyIds.length ? `Phương pháp đã chạy nhưng không có bản ghi dùng được: ${emptyIds.join(', ')}.` : '',
    `Ngữ cảnh hoặc bảng nguồn: ${completion.contextSections + completion.sourceTableSections} mục. Chưa có kết quả: ${completion.blockedSections + emptyIds.length} mục.`,
    'Ngữ cảnh, bảng nguồn, kết quả phương pháp từng phần và tệp PDF không đồng nghĩa với phân tích hoàn chỉnh.',
  ].filter(Boolean).join(' ');
  const reviewOutcome = missingReviewOutcome(input);
  const appendix = (sectionId: string): string =>
    (reviewOutcome && kind === 'INSIGHT' && (sectionId === 'I03' || sectionId === 'I17') ? `<p class="warning">${escape(reviewOutcomeLead(reviewOutcome))}</p>` : '') +
    baseAppendix(sectionId) +
    (kind === 'MARKET' && sectionId === 'M13' && input.quoteMethods
      ? `<details open id="quote-method-evidence"><summary>Hồ sơ giá M08: nguồn, điều kiện và phép tính</summary><p>Xuất xứ trong manifest là khai báo đã lưu, không phải chứng nhận độc lập. Dữ liệu tổng hợp thủ công hoặc giả lập không trở thành dữ liệu nhà cung cấp đã xác minh.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(JSON.stringify(input.quoteMethods, null, 2))}</pre></details>` : '') +
    (insightCoding && (sectionId === 'I03' || sectionId === 'I17') ? insightCodingTrace(insightCoding, sectionId) : '') +
    (input.boundedMethods && (sectionId === 'M13' || sectionId === 'I17')
      ? `<details open id="bounded-method-evidence"><summary>Hồ sơ phương pháp M10/I11/I12/I16 và vị trí nguồn</summary><p>Nguồn bổ sung do người dùng chọn, không phải dữ liệu tự thu hoặc xác nhận độ phủ. Hồ sơ giữ riêng kỳ, phạm vi và điều kiện còn thiếu; không cộng gộp với Metric hoặc review.</p><pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(JSON.stringify(input.boundedMethods, null, 2))}</pre></details>` : '');
  const baseAppendix = (sectionId: string): string => {
    if (sourceScope && sectionId === 'M02') return marketSourceScopeSection(sourceScope, 'M02');
    if (kind === 'MARKET' && sectionId === 'M01' && input.m01Inventory && input.sourceClaims) return m01InventorySection(input.m01Inventory, input.sourceClaims);
    if (kind === 'INSIGHT' && sectionId === 'I14' && input.i14Admission && input.sourceClaims) return i14SynthesisSection(input.i14Synthesis) + i14AdmissionSection(input.i14Admission, input.sourceClaims);
    if (kind === 'MARKET' && (sectionId === 'M03' || sectionId === 'M04')) {
      if (input.metricMethods) return metricMethodSection(input.metricMethods, sectionId, input.metricClassified) + (sectionId === 'M03' && input.marketInventory ? '<h3>Kalodata: bằng chứng riêng, không cộng vào Metric</h3>' + marketInventorySection(input.marketInventory, sectionId) : '');
      if (input.metricMethodsFailure) return `<p class="warning">${escape(metricFailureCopy[input.metricMethodsFailure].next)} Mã đối chiếu: ${escape(input.metricMethodsFailure)}.</p>`;
    }
    if (kind === 'MARKET' && (sectionId === 'M03' || sectionId === 'M08')) {
      if (input.marketInventory) return marketInventorySection(input.marketInventory, sectionId);
      if (input.marketInventoryFailure) return '<p class="warning">Đã thử xử lý inventory nhưng nguồn hoặc phương pháp không vượt qua kiểm tra. Mã MARKET_INVENTORY_FAILED; không tự gọi lại nguồn.</p>';
    }
    if (sourceScope && sectionId === 'M13') return marketSourceScopeSection(sourceScope, 'M13') + descriptiveAppendix(descriptive, input.descriptiveMethodFailure);
    if (kind === 'INSIGHT' && (sectionId === 'I03' || sectionId === 'I17')) {
      const codingNotice = located
        ? `<p class="warning">Đã áp dụng quy tắc đã duyệt để đưa các khai báo rõ nghĩa vào phạm vi hẹp, có vị trí nguyên văn. ${located.projection.pending.length} mục còn chờ được giữ cùng bản đề xuất ban đầu; không tính thành mục phân tích hoàn chỉnh. Khi mở lại, hệ thống đọc kết quả đã lưu, không chạy lại parser hoặc gọi nguồn.</p>`
        : input.locatedReview
          ? '<p class="warning">Bản này giữ đề xuất coding cùng phiên bản quy tắc và vị trí nguyên văn, chưa đưa ứng viên vào kết quả. Báo cáo cũ giữ nguyên bằng chứng và trạng thái đã lưu; không tự áp dụng quy tắc mới hoặc chạy lại parser khi mở.</p>'
        : input.locatedReviewFailure
          ? '<p class="warning">Dữ liệu review gốc vẫn được giữ, nhưng bước lưu đề xuất coding chưa vượt qua kiểm tra. Mã LOCATED_REVIEW_METHOD_FAILED; không dùng đề xuất chưa xác minh hoặc tự thu lại nguồn.</p>' : '';
      const trace = corpusTrace ? corpusTraceSection(corpusTrace, sectionId) : '';
      if (input.nativeReview) return codingNotice + nativeReviewContext(input.nativeReview) + trace;
      if (input.collection?.nativeReview) return `<p class="warning">Nguồn review native của đúng listing đã được gắn và giữ nguyên. ${input.nativeReviewFailure === 'NATIVE_REVIEW_REPORT_TOO_LARGE'
        ? 'Phần quote và phương pháp vượt giới hạn bản hiển thị này. Mã NATIVE_REVIEW_REPORT_TOO_LARGE; toàn bộ dữ liệu và pending vẫn có trong gói phương pháp đã lưu, không cắt ngắn hoặc tự thu lại.'
        : 'Bước mã hóa chưa vượt qua kiểm tra. Mã NATIVE_REVIEW_METHOD_FAILED; chưa đưa khai báo vào kết quả. Cần kiểm tra phương pháp, không thêm lại link hoặc tự gọi lại nguồn.'}</p>`;
      if (input.reviewCorpus) return codingNotice + trace + '<h3>Collection nguồn thô, tách khỏi lớp mã hóa</h3>' + reviewCorpusSection(input.reviewCorpus, sectionId);
      if (corpusTrace) return codingNotice + trace;
      if (input.reviewCorpusFailure === 'REVIEW_CORPUS_REPORT_TOO_LARGE') return '<p class="warning">Collection gốc vẫn được giữ đầy đủ nhưng phần quote vượt giới hạn kích thước báo cáo. Mã REVIEW_CORPUS_REPORT_TOO_LARGE; chưa đưa quote vào bản này, không cắt ngắn dữ liệu hoặc tự thu lại. Cần xuất phần bằng chứng theo trang ở bước xử lý tiếp theo.</p>';
      if (input.reviewCorpusFailure) return '<p class="warning">Đã lưu collection nhưng corpus không vượt qua kiểm tra. Cần kiểm tra REVIEW_CORPUS_FAILED; không tự thu lại và không dùng dữ liệu chưa xác minh.</p>';
      const retained = retainedReviewStatus(input);
      if (retained) return `<p class="warning">${escape(retained)} Việc lưu nguồn không có nghĩa nội dung hoặc nhãn phân tích đã được duyệt.</p>`;
      return '<p>Chưa có tập review gắn với lượt này. Thêm link Shopee chính xác ở bước duyệt phạm vi của lượt mới, rồi kiểm tra trạng thái nguồn. Không thay bằng review của sản phẩm gần giống.</p>';
    }
    return '';
  };
  const methodBody = (section: DraftSection): string => {
    if (section.state === 'EVIDENCE_INVENTORY') return locatedViews.get(section.sectionId) ?? '';
    if (section.state !== 'METHOD_OUTPUT' && section.state !== 'METHOD_NO_USABLE_RECORDS') return '';
    // Metric has its own scoped tables and source trace in appendix(), not a descriptive-method view.
    if (kind === 'MARKET' && input.metricMethods && (section.sectionId === 'M03' || section.sectionId === 'M04')) return '';
    return locatedViews.get(section.sectionId) ?? views.get(section.sectionId)!.html;
  };
  const body = `<p class="warning">${escape(headline)}</p>${reviewOutcome ? reviewOutcomeNotice(reviewOutcome, kind) : ''}<p class="reader-guide">Đọc trạng thái và phần diễn giải trước khi sử dụng số liệu. Bảng trình bày những gì nguồn hoặc phép tính đã ghi nhận; phần “Hồ sơ đối chiếu” giữ nguyên nội dung nguồn và thông tin kỹ thuật. Mục còn thiếu điều kiện chưa có kết luận, không phải kết quả bằng 0.</p>` + sections.map(section => `<section class="sheet" id="${section.sectionId}"><header class="sh-head"><div><span class="sh-id">${section.sectionId}</span><h2>${escape(section.title)}</h2></div><span class="state">${escape(stateLabel[section.state])}</span></header><p class="section-reading">${escape(section.explanation)}</p>${methodBody(section)}${section.state === 'SOURCE_CONTEXT' ? scope : ''}${section.sectionId === 'M13' || section.sectionId === 'I17' ? sourceTable : ''}${observationTable(section.rows, captures)}${appendix(section.sectionId)}<details class="method-reference"><summary>Hồ sơ đối chiếu phương pháp</summary><p><small>${fallbackIds.has(section.sectionId) ? 'Phương pháp ghi trong danh mục, chưa chạy trong lượt này' : 'Phương pháp'}: ${escape(section.method)}</small></p></details></section>`).join('');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><title>${escape(title)} · ${escape(input.start.keyword)}</title><style>${reportKitFontCss()}\n${REPORT_KIT_CSS}\n.sheet{break-before:page}.sheet h2{font-size:26px}.state{font-size:12px;color:var(--warn-ink)}.warning{padding:12px;background:var(--warn-bg);color:var(--warn-ink)}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px}dt{font-weight:700}dd{margin:0}.table-wrap{overflow-x:auto}.table-wrap table{min-width:720px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:10px;text-align:left;border:1px solid var(--bd);vertical-align:top}code{word-break:break-all}code.loc{word-break:normal;overflow-wrap:break-word}`
  // Desktop cover: keep text off the diagonal (yellow stripe spans 61.5%→39.6% of the cover width, top→bottom).
  + `@media screen and (min-width:901px){.cover{container-type:inline-size}.cv-left>div:nth-child(2){max-width:calc(46cqi - 40px)}.cv-meta{max-width:calc(38cqi - 40px)}.cv-right{padding-left:11cqi}}`
  // Narrow screens: tables keep their width and scroll; say so, show edge shadows and keep captions in view.
  + `@media screen and (max-width:800px){.table-wrap:not(:has(>.evidence-table)){container-type:inline-size;background:linear-gradient(90deg,#fff 30%,#fff0) left/24px 100% no-repeat local,linear-gradient(270deg,#fff 30%,#fff0) right/24px 100% no-repeat local,radial-gradient(farthest-side at 0 50%,#0f172a33,#0000) left/10px 100% no-repeat scroll,radial-gradient(farthest-side at 100% 50%,#0f172a33,#0000) right/10px 100% no-repeat scroll}.table-wrap:not(:has(>.evidence-table))::before{content:"Nếu bảng vượt chiều rộng màn hình, vuốt ngang để xem đủ cột. Bàn phím: Tab để chọn bảng, rồi dùng phím mũi tên.";display:block;position:sticky;left:0;padding:0 0 6px;color:var(--mut);font-size:12px}.table-wrap:not(:has(>.evidence-table)) caption{position:sticky;left:0;max-width:100cqi;box-sizing:border-box}.table-wrap:focus-visible{outline-offset:-3px}}`
  + `.reader-summary,.section-reading,.reader-guide{max-width:72ch}.reader-context{margin-bottom:24px}.method-reference{margin-top:24px;color:var(--mut)}.method-reference summary{cursor:pointer}.reader-summary{font-weight:500}td,dd{font-variant-numeric:tabular-nums}`
  + `@media(max-width:600px){dl{grid-template-columns:1fr}.sheet{padding:20px}.cover{display:block}.cv-right{background:var(--blue);padding:24px}.cv-left{padding:24px}}@media print{@page{size:A4;margin:14mm}body{background:white}main{padding:0}.cover{min-height:240mm}.toc{gap:4px}.toc a{min-height:0}#sections>.reader-guide+.sheet{break-before:auto}.sh-head{break-after:avoid}.sheet{padding:16px 0;border:0;break-inside:auto}.sheet:after{display:none}.table-wrap{overflow:visible}.table-wrap table{min-width:0}tr{break-inside:avoid}thead{display:table-header-group}.jump{display:none}.sheet h3,.sheet h4,caption,summary{break-after:avoid}thead{break-after:avoid}tbody>tr:first-child{break-before:avoid}details{break-inside:auto}summary+p{break-before:avoid}.limits li{break-inside:avoid}}</style></head><body><a class="skip" href="#sections">Đến nội dung báo cáo</a><main><section class="cover"><div class="cv-left"><div class="brand"><i></i><b>TDN GROWTH OS</b></div><div><p class="cv-eyebrow">Bản nháp từ nguồn · Chưa được duyệt</p><h1>${escape(title)}</h1><h2>${escape(input.start.keyword)}</h2><p class="cv-lede">Hai lớp tách biệt: dữ liệu đã thu và những điều chưa đủ bằng chứng.</p></div><div class="cv-meta"><b>Việt Nam</b><span>${escape(period)}</span><span>${escape(coverSummary)}</span></div></div><nav class="cv-right" aria-label="Mục lục"><h2>Nội dung</h2><ul class="toc">${sections.map(section => `<li><a href="#${section.sectionId}"><em>${section.sectionId}</em>${escape(section.title)}</a></li>`).join('')}</ul></nav></section><div id="sections">${body}</div><footer><p>${decisionGeneratedIds.length ? 'Kết quả xử lý AI được lưu riêng, chưa được người dùng duyệt; không phải sự thật đã xác minh, phương án đã chọn hoặc quyết định kinh doanh.' : input.i14Synthesis?.status === 'VALID' ? 'Nhận định AI được lưu riêng, chưa được người dùng duyệt; không phải sự thật đã xác minh hoặc quyết định kinh doanh.' : 'Không có nhận định AI hoặc quyết định kinh doanh tự động trong bản nháp này.'} Không có dữ liệu không đồng nghĩa với giá trị bằng 0.</p></footer></main></body></html>`;
  return { semantic, html: Buffer.from(html, 'utf8') };
}
