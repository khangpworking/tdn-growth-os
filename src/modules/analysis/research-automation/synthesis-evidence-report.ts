import type { AutomationM01EvidenceInventory } from '../../../../contracts/analysis/automation-m01-evidence-inventory.generated.js';
import type { AutomationI14EvidenceAdmission, UnassignedClaim } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import type { AutomationSourceClaims, Claim } from '../../../../contracts/analysis/automation-source-claims.generated.js';
import { attributionText, escapeHtml as escape, readerSafe, type ReportCitations } from './descriptive-report.js';
import type { AutomationI14ExecutionOutcome } from './i14-synthesis-execution.js';
import type { AutomationDecisionCandidates, AutomationDecisionPacket, DecisionCounterevidenceRelation } from '../../../../contracts/analysis/automation-decision-packets.generated.js';
import type { AutomationDecisionExecutionOutcome } from './decision-synthesis-execution.js';

/** Renderers used directly in unit tests keep working: a citation mark is an addition, never a requirement. */
const NO_CITATIONS: ReportCitations = { mark: () => '' };
/**
 * Retained source text (a label, a measure definition) that names the provider or carries
 * a digest stays in the stored artifact; the reader sees the withheld note instead.
 */
function storedText(value: string | null | undefined, fallback: string, withheld: string): string {
  if (value === undefined || value === null) return fallback;
  return readerSafe(value) ? escape(value) : withheld;
}
const claimMark = (claimId: string, citations: ReportCitations): string => citations.mark({
  sourceKind: 'UPSTREAM_CLAIM', identity: claimId, locator: null, label: 'Nhận định nguồn đã lưu',
  retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE', technical: { claimId },
});

function methodLimits(limits: readonly string[], summary = 'Giới hạn và mã phương pháp'): string {
  return `<details class="evidence-trace evidence-method-limits"><summary>${summary}</summary><ul>${limits.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details>`;
}

const list = (title: string, values: readonly string[]) => values.length ? `<h4>${title}</h4><ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : '';

export function i14SynthesisSection(outcome: AutomationI14ExecutionOutcome | undefined, citations: ReportCitations = NO_CITATIONS): string {
  if (!outcome) return '';
  if (outcome.status === 'NOT_DISPATCHED') return outcome.reason === 'AI_NOT_CONFIGURED'
    ? '<p class="warning">Đã có bối cảnh nguồn đủ điều kiện, nhưng chưa cấu hình bước đề xuất AI. Báo cáo này chỉ trình bày bằng chứng đã lưu.</p>' : '';
  if (outcome.status === 'PREPARED') return '<p class="warning">Đầu vào đã lưu nhưng chưa gửi xử lý. Chưa có nhận định AI.</p>';
  if (outcome.status === 'DISPATCH_UNKNOWN') return '<p class="warning">Lần xử lý AI bị gián đoạn hoặc chưa xác định được kết quả. Hệ thống không tự gọi lại và không dùng một nhận định chưa được lưu.</p>';
  if (outcome.status === 'INVALID') return '<p class="warning">Phản hồi AI không đạt kiểm tra cấu trúc hoặc tham chiếu nguồn, nên không được đưa vào báo cáo. Bằng chứng gốc vẫn được giữ lại.</p>';
  const candidates = outcome.candidates.artifact.aiCandidates;
  const refs = (values: readonly string[]) => values.map((id, index) => `<a href="#claim-${escape(id)}">Nguồn ${index + 1}</a>${claimMark(id, citations)}`).join(' · ');
  return '<h3>Nhận định AI đã lưu · Chưa được người dùng duyệt</h3><p>Chỉ cấu trúc và tham chiếu nguồn đã qua kiểm tra. Nội dung chưa được xác minh là đúng, không phải kết luận thị trường hoặc quyết định kinh doanh.</p>' +
    (candidates.length ? candidates.map(candidate => `<article class="evidence-entry"><h4>Giả thuyết có điều kiện</h4><p>${escape(candidate.text)}</p><p>${escape(candidate.conciseEvidenceLinkedRationale)}</p><p>Căn cứ: ${refs(candidate.citedClaimRefs)}</p>${candidate.counterevidenceRefs.length ? `<p>Phản chứng: ${refs(candidate.counterevidenceRefs)}</p>` : '<p>Chưa ghi nhận tham chiếu phản chứng, không có nghĩa là không tồn tại phản chứng.</p>'}${list('Giả định', candidate.assumptions)}${list('Điều chưa biết', candidate.unknowns)}${list('Bằng chứng còn thiếu', candidate.evidenceGaps)}${list('Giới hạn', candidate.limitations)}</article>`).join('') : '<p>Lần xử lý đã lưu không đề xuất giả thuyết nào.</p>');
}

// Presentation only: these inputs are admitted and retained by the service.
// This renderer never selects evidence, ranks it, or calls a model.
function sourceDetails(claim: Claim, anchorPrefix = 'claim', citations: ReportCitations = NO_CITATIONS): string {
  const limitations = [...new Set([...claim.observation.limitations, ...claim.limitations])];
  return `<details class="evidence-trace" id="${escape(anchorPrefix)}-${claim.claimId}"><summary>Xem nguồn và giới hạn ${claimMark(claim.claimId, citations)}</summary><p><b>Ghi nhận nguồn:</b> ${storedText(claim.source.attribution, 'Chưa có thông tin', 'Ghi nhận nguồn được giữ trong bản lưu')}</p>${claim.source.statement === null ? '' : `<blockquote>${escape(claim.source.statement)}</blockquote>`}${claim.source.spans.length ? `<ul>${claim.source.spans.map(span => `<li><q>${escape(span.quote)}</q> <small>(vị trí ${span.start} đến ${span.end})</small></li>`).join('')}</ul>` : ''}<details class="evidence-metadata"><summary>Tệp nguồn và phương pháp</summary><dl><dt>Tệp nguồn</dt><dd>${escape(claim.source.logicalPath)}</dd><dt>Vị trí</dt><dd><code>${escape(claim.source.locator)}</code>${claim.source.recordLocator === null ? '' : `<br><code>${escape(claim.source.recordLocator)}</code>`}</dd><dt>Phương pháp đã lưu</dt><dd>${escape(claim.method.methodId)} · ${escape(claim.method.methodVersion)}<br><code>${escape(claim.method.outputPointer)}</code></dd><dt>Dấu kiểm tệp nguồn</dt><dd><code>${escape(claim.source.sha256)}</code></dd></dl></details>${limitations.length ? `<details class="evidence-limitations"><summary>Giới hạn của bằng chứng (${limitations.length})</summary><ul>${limitations.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details>` : ''}</details>`;
}

type DecisionCandidate = AutomationDecisionCandidates['aiCandidates'][number];
const decisionCandidateLabels: Readonly<Record<DecisionCandidate['candidateType'], string>> = {
  HYPOTHESIS: 'Giả thuyết cần kiểm chứng', OPPORTUNITY_DIRECTION: 'Hướng cơ hội cần kiểm chứng',
  STRATEGY_OPTION: 'Phương án chiến lược để cân nhắc', ACTION_OPTION: 'Phương án hành động để cân nhắc',
};
const compatibilityLabels: Readonly<Record<keyof DecisionCounterevidenceRelation['compatibility'], string>> = {
  entity: 'Đối tượng', measure: 'Chỉ số', unit: 'Đơn vị', period: 'Kỳ đo', scope: 'Phạm vi', denominator: 'Mẫu số',
};

// Presentation only: the owning service has replay-verified these retained candidates against this exact packet.
// Every reference links to the packet's own evidence entry; nothing here chooses, ranks or quantifies an option.
function decisionCandidateEntry(candidate: DecisionCandidate, packet: AutomationDecisionPacket, citations: ReportCitations): string {
  const origin = new Map(packet.items.map(item => [item.claimId, item.sectionId]));
  const link = (claimId: string, label: string) => {
    const sectionId = origin.get(claimId);
    if (!sectionId) throw new Error('Decision synthesis display claim missing');
    return `<a href="#decision-${escape(packet.sectionId)}-${escape(claimId)}">${label} (${escape(sectionId)})</a>${claimMark(claimId, citations)}`;
  };
  const refs = (values: readonly string[], label: string) => values.map((id, index) => link(id, `${label} ${index + 1}`)).join(' · ');
  const relation = (value: DecisionCounterevidenceRelation) => {
    const label = `Phản chứng ${candidate.counterevidenceRefs.indexOf(value.claimRef) + 1}`;
    return `<details class="evidence-trace"><summary>${label} · Quan hệ AI đề xuất</summary><p>Quan hệ chưa xác minh. Hệ thống chỉ kiểm tra claim được tham chiếu và nội dung bị phản bác khớp nguyên văn trong đề xuất; chưa kiểm tra claim có thực sự phản bác hay không.</p><p><b>Bằng chứng:</b> ${link(value.claimRef, label)}</p><p><b>Nội dung có thể bị phản bác:</b> ${escape(value.counteredTarget)}</p><p><b>Mức tương thích AI nêu, chưa xác minh:</b></p><dl>${(Object.keys(compatibilityLabels) as (keyof typeof compatibilityLabels)[]).map(key => `<dt>${compatibilityLabels[key]}</dt><dd>${escape(value.compatibility[key])}</dd>`).join('')}</dl><p><b>Giới hạn suy luận:</b></p><ul>${value.inferentialLimitations.map(text => `<li>${escape(text)}</li>`).join('')}</ul></details>`;
  };
  return `<article class="evidence-entry"><h4>${decisionCandidateLabels[candidate.candidateType]} · Bản nháp chờ xem xét</h4><p>${escape(candidate.text)}</p><p><b>Lý do AI nêu:</b> ${escape(candidate.conciseEvidenceLinkedRationale)}</p><p>Bối cảnh nguồn được dẫn: ${refs(candidate.citedClaimRefs, 'Nguồn')}. Tham chiếu cho biết đề xuất dựa vào đâu, không chứng minh đề xuất đúng.</p>${candidate.counterevidenceRefs.length ? `<p>Phản chứng AI đề xuất: ${refs(candidate.counterevidenceRefs, 'Phản chứng')}</p>${candidate.counterevidenceRelations.map(relation).join('')}` : '<p>Chưa ghi nhận tham chiếu phản chứng, không có nghĩa là không tồn tại phản chứng.</p>'}${'conditions' in candidate ? list('Điều kiện phụ thuộc', candidate.conditions) : ''}${'prerequisites' in candidate ? list('Điều cần có hoặc cần quyết định trước', candidate.prerequisites) : ''}${list('Giả định', candidate.assumptions)}${list('Điều chưa biết', candidate.unknowns)}${list('Bằng chứng còn thiếu', candidate.evidenceGaps)}${list('Giới hạn', candidate.limitations)}</article>`;
}

/** Retained M11/I15/M12 synthesis state. Internal error codes stay in the execution ledger, not the report. */
function decisionSynthesisBlock(outcome: AutomationDecisionExecutionOutcome, packet: AutomationDecisionPacket, citations: ReportCitations): string {
  if (outcome.status === 'NOT_DISPATCHED') return outcome.reason === 'AI_NOT_CONFIGURED'
    ? '<p class="warning">Đã có bối cảnh nguồn đủ điều kiện, nhưng chưa cấu hình bước đề xuất AI. Mục này chỉ trình bày bằng chứng đã lưu.</p>'
    : '<p>Chưa gửi bước đề xuất AI cho mục này vì chưa có bối cảnh sử dụng theo lời nguồn đủ điều kiện.</p>';
  if (outcome.status === 'PREPARED') return '<p class="warning">Đầu vào đã lưu nhưng chưa gửi xử lý. Chưa có đề xuất AI cho mục này.</p>';
  if (outcome.status === 'DISPATCH_UNKNOWN') return '<p class="warning">Lần xử lý AI cho mục này bị gián đoạn hoặc chưa xác định được kết quả. Hệ thống không tự gọi lại và không dùng một đề xuất chưa được lưu.</p>';
  if (outcome.status === 'INVALID') return '<p class="warning">Phản hồi AI cho mục này không đạt kiểm tra cấu trúc hoặc tham chiếu nguồn, nên không được đưa vào báo cáo. Bằng chứng gốc vẫn được giữ lại.</p>';
  const artifact = outcome.candidates.artifact;
  if (artifact.sectionId !== packet.sectionId || artifact.runId !== packet.runId || artifact.workspaceId !== packet.workspaceId || artifact.scopeSha256 !== packet.scopeSha256)
    throw new Error('Decision synthesis display packet mismatch');
  const candidates: readonly DecisionCandidate[] = artifact.aiCandidates;
  const body = candidates.length
    ? '<p>Đây là bản nháp để người dùng xem xét. Chỉ cấu trúc và tham chiếu claim đã qua kiểm tra; nội dung chưa được xác minh là đúng. Đề xuất không phải bằng chứng nguồn, kết luận thị trường, phương án đã chọn hay hành động được phép thực hiện.</p><p>Thứ tự hiển thị là thứ tự phản hồi, không phải xếp hạng hoặc mức ưu tiên. Hệ thống không tạo ước tính quy mô, ngân sách, chi phí hay lợi nhuận; mức độ hoặc số lượng viết bằng chữ trong đề xuất đều chưa được kiểm chứng. Bằng chứng không được dẫn vẫn là bối cảnh riêng, không phải phản chứng.</p>' +
      candidates.map(candidate => decisionCandidateEntry(candidate, packet, citations)).join('')
    : `<p>Lần xử lý đã lưu không đưa ra đề xuất nào cho mục này${artifact.insufficientEvidence === null ? '' : ' vì chưa có bối cảnh sử dụng theo lời nguồn đủ điều kiện'}. Điều đó không có nghĩa là không có hướng nào đáng xem xét.</p>`;
  return `<h3>Đề xuất AI đã lưu · Chưa được người dùng duyệt</h3>${body}${methodLimits(artifact.limitations, 'Giới hạn và mã kiểm tra của đề xuất AI')}`;
}

/**
 * Source-backed inventory, not a synthesized recommendation or business decision. When the owning service supplies
 * a retained synthesis outcome it is shown beside, never instead of, the inventory; without one the historical copy stays.
 */
export function decisionPacketSection(packet: AutomationDecisionPacket, claims: AutomationSourceClaims, synthesis?: AutomationDecisionExecutionOutcome, citations: ReportCitations = NO_CITATIONS): string {
  if (packet.sourceClaims.claimsSha256 !== claims.claimsSha256) throw new Error('Decision display source mismatch');
  const byId = new Map(claims.claims.map(claim => [claim.claimId, claim]));
  const proposed = synthesis?.status === 'VALID' && synthesis.candidates.artifact.aiCandidates.length > 0;
  const purpose = packet.sectionId === 'M11' ? proposed ? 'Cơ hội chưa được người dùng duyệt hoặc xếp ưu tiên.' : 'Cơ hội chưa được đề xuất hoặc xếp ưu tiên.'
    : packet.sectionId === 'I15' ? 'Chưa có phương án chiến lược được chọn.' : 'Chưa có hành động được chọn hoặc cho phép thực thi.';
  const ownerMissing = packet.sectionId === 'M11' ? 'Định nghĩa cơ hội, quy mô, mức ưu tiên và mức rủi ro'
    : packet.sectionId === 'I15' ? 'Mục tiêu, phương án của người dùng, năng lực, chi phí và thời hạn'
    : 'Phương án của người dùng, người phụ trách, ngân sách, tiêu chí và thời hạn';
  const entries = packet.items.map(item => {
    const claim = byId.get(item.claimId);
    if (!claim) throw new Error('Decision display claim missing');
    const observation = claim.observation;
    const value = observation.value === null ? '' : `<p>Quan sát gốc: ${escape(observation.measure?.literal ?? 'Chưa có định nghĩa')} · ${escape(observation.value)} ${escape(observation.unit ?? '')}.</p>`;
    const support = item.currentAdapterSupport === 'USE_CONTEXT_ANCHOR' ? 'Có bối cảnh sử dụng đủ điều kiện cho bộ xử lý hiện tại; chưa chứng minh cơ hội.'
      : item.currentAdapterSupport === 'OBSERVED_LITERAL' ? 'Có thể dùng quan sát nguyên văn để đề xuất bản nháp; chưa chứng minh xu hướng, nhu cầu hoặc cơ hội.'
      : item.currentAdapterSupport === 'BEHAVIOR_WITH_USE_CONTEXT' ? 'Có hoàn cảnh nằm trong đoạn khai báo hành vi; chưa chứng minh lý do, mục đích hoặc kết quả.'
      : 'Giữ làm bối cảnh; chưa đủ điều kiện riêng để sinh đề xuất bằng bộ xử lý hiện tại.';
    const contextLinks = item.contextClaimRefs?.map(ref => `<a href="#decision-${escape(packet.sectionId)}-${escape(ref)}">Bối cảnh nguồn đi kèm</a>${claimMark(ref, citations)}`).join(' · ') ?? '';
    return `<article class="evidence-entry"><h4>Bằng chứng từ ${escape(item.sectionId)}</h4>${value}<p>${item.basis === 'DECLARED' ? 'Lời tự thuật được định vị, chưa xác thực độc lập.' : 'Quan sát nguồn, không tự suy thành nhu cầu thị trường.'} ${support}</p>${contextLinks ? `<p>${contextLinks}</p>` : ''}${sourceDetails(claim, `decision-${packet.sectionId}`, citations)}</article>`;
  }).join('');
  const intro = `<p>${purpose} Các bằng chứng dưới đây được giữ theo section gốc, không xếp hạng.</p><p><strong>Chưa cung cấp:</strong> ${ownerMissing}. Hệ thống không tự điền thay người dùng.</p><p>Cùng lượt nghiên cứu không chứng minh cùng người, sản phẩm, listing hoặc kỳ đo. Không cộng gộp mẫu số hay tính lại bằng chứng tái dùng như nguồn độc lập.</p>`;
  const inventory = entries || '<p>Chưa có claim nguồn phù hợp trong phiên bản này.</p>';
  const closing = 'Danh sách bằng chứng không phải phân tích hoàn chỉnh; không có phản chứng đã mã hóa cũng không có nghĩa là không tồn tại phản chứng.';
  if (!synthesis) return `${intro}${inventory}<p>Chưa có bước sinh đề xuất AI cho mục này. ${closing}</p>${methodLimits(packet.limitations)}`;
  return `${intro}${decisionSynthesisBlock(synthesis, packet, citations)}${synthesis.status === 'VALID' ? '<h3>Bằng chứng đã lưu của mục</h3>' : ''}${inventory}<p>${closing}</p>${methodLimits(packet.limitations, 'Giới hạn và mã của danh sách bằng chứng')}`;
}

// Keep the table's comparison columns on desktop, and read each complete record vertically on narrow screens.
// On paper every disclosure is open, so the short columns stay side by side and the provenance takes the full width;
// a record may break between its parts instead of starting a new page for each row.
export const SYNTHESIS_EVIDENCE_CSS = `
.evidence-table{table-layout:fixed}.evidence-table td{overflow-wrap:anywhere}
.evidence-cell-label{display:none}.evidence-trace summary{min-height:44px;align-content:center;cursor:pointer}
.evidence-trace p,.evidence-trace blockquote{margin:12px 0}.evidence-trace dl{grid-template-columns:1fr;gap:4px}
.evidence-trace dd{margin:0 0 12px}.evidence-trace details{margin:12px 0 0}
.evidence-limitations li{overflow-wrap:anywhere;margin-bottom:8px}
.evidence-trace summary:focus-visible{outline:3px solid var(--blue);outline-offset:3px}
@media screen and (max-width:600px){
  .table-wrap:has(>.evidence-table){overflow:visible}
  .table-wrap .evidence-table{min-width:0;display:block;font-size:14px}
  .evidence-table caption,.evidence-table tbody,.evidence-table tr,.evidence-table td{display:block;width:100%;box-sizing:border-box}
  .evidence-table thead{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%)}
  .evidence-table tr{padding:16px 0;border-bottom:1px solid var(--bd)}
  .evidence-table td{padding:8px 0;border:0}
  .evidence-cell-label{display:block;font-weight:700;margin-bottom:4px}
}
@media print{
  .table-wrap:has(>.evidence-table){overflow:visible}
  .table-wrap .evidence-table{min-width:0;display:block}
  .evidence-table caption,.evidence-table tbody{display:block}
  .evidence-table caption{break-after:avoid}
  .evidence-table thead{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip-path:inset(50%)}
  .evidence-table tr{display:flex;flex-wrap:wrap;gap:0 16px;padding:12px 0;border-bottom:1px solid var(--bd);break-inside:auto}
  .evidence-table td{flex:1 1 0;min-width:0;padding:0;border:0;break-inside:avoid}
  .evidence-table td:has(>.evidence-trace){flex-basis:100%;break-before:avoid;break-inside:auto}
  .evidence-cell-label{display:block;font-weight:700;margin-bottom:2px}
  .evidence-trace summary{min-height:0;break-after:avoid}
  .evidence-trace p,.evidence-trace blockquote{margin:6px 0}
  .evidence-trace dl{grid-template-columns:180px minmax(0,1fr);gap:2px 16px}
  .evidence-trace dd{margin:0}
  .evidence-trace ul{padding-left:20px}
  .evidence-limitations li{margin-bottom:2px}
  .evidence-trace li,.evidence-trace dt,.evidence-trace dd,.evidence-trace blockquote{break-inside:avoid}
}
`;

function claimById(claims: ReadonlyMap<string, Claim>, claimId: string): Claim {
  const claim = claims.get(claimId);
  if (!claim) throw new Error('Report evidence claim is missing');
  return claim;
}

export function m01InventorySection(inventory: AutomationM01EvidenceInventory, claims: AutomationSourceClaims, citations: ReportCitations = NO_CITATIONS): string {
  const claimIndex = new Map(claims.claims.map(claim => [claim.claimId, claim]));
  const intro = '<p>Đây là danh sách bằng chứng đã lưu, chưa xếp hạng và chưa có kết luận chính. Người dùng chưa đặt câu hỏi quyết định cụ thể; hệ thống không tự chọn ưu tiên.</p>';
  const rows = inventory.items.map(item => {
    const claim = claimById(claimIndex, item.claimId);
    const value = item.value === null ? 'Không có giá trị số' : `${escape(item.value)} ${escape(item.unit ?? 'Chưa rõ đơn vị')}`;
    const period = item.period ? `${escape(item.period.start)} đến ${escape(item.period.end)}<br>${escape(item.period.basis)}` : escape(item.periodText ?? 'Chưa xác lập kỳ đo');
    return `<tr><td><span class="evidence-cell-label" aria-hidden="true">Bằng chứng</span>${storedText(item.measure?.entityLabel ?? item.source.attribution, 'Chưa có nhãn nguồn', 'Nhãn nguồn được giữ trong bản lưu')}<br>${storedText(item.measure?.definition, 'Lời khai từ nguồn', 'Định nghĩa đo lường được giữ trong bản lưu')}<br><small>${escape(item.sectionId)}</small></td><td><span class="evidence-cell-label" aria-hidden="true">Giá trị và trạng thái</span>${value}<br><small>${item.state === 'observed_zero' ? 'Nguồn ghi nhận bằng 0' : item.state === 'DECLARED' ? 'Lời khai, không phải phép đo' : 'Giá trị nguồn'} · ${item.precision === 'non_exact' ? 'Không chính xác tuyệt đối' : item.precision === 'exact' ? 'Giá trị chính xác theo nguồn' : 'Không áp dụng độ chính xác số'}</small></td><td><span class="evidence-cell-label" aria-hidden="true">Kỳ đo và phạm vi</span>${period}<br><small>${storedText(item.scope.description, 'Chưa xác lập phạm vi', 'Phạm vi nguồn được giữ trong bản lưu')}</small></td><td>${sourceDetails(claim, 'claim', citations)}</td></tr>`;
  }).join('');
  return intro + (rows ? `<div class="table-wrap" role="region" aria-label="Danh sách bằng chứng chưa xếp hạng" tabindex="0"><table class="evidence-table"><caption>${inventory.items.length} mục bằng chứng, không phải số khách hàng hoặc tổng thị trường</caption><thead><tr><th scope="col">Bằng chứng</th><th scope="col">Giá trị và trạng thái</th><th scope="col">Kỳ đo và phạm vi</th><th scope="col">Truy nguồn</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="warning">Chưa có bằng chứng đầu nguồn đủ điều kiện cho M01. Không thể viết kết luận từ khoảng trống này.</p>') + methodLimits(inventory.limitations);
}

const unassignedCopy: Readonly<Record<UnassignedClaim['reason'], string>> = {
  NOT_A_LOCATED_DECLARATION: 'Đây là phép đo nguồn, không phải lời khai có bối cảnh sử dụng.',
  I04_BEHAVIOR_ALONE_IS_NOT_USE_CONTEXT: 'Lời kể về mua hoặc dùng chưa nêu bối cảnh sử dụng.',
  NO_SOURCE_STATED_USE_CONTEXT_FIELD: 'Chưa có lời nguồn nêu tình huống, nhiệm vụ hoặc nơi sử dụng.',
  CONTEXT_FIELD_CONFLICTING: 'Khai báo bối cảnh có phần mâu thuẫn; cần xem lại nguồn.',
  CONTEXT_QUALIFIER_SEMANTICS_NOT_ENCODED: 'Có điều kiện đi kèm chưa được phương pháp hiện tại diễn giải; cần xem lại nguyên văn.',
};
const contextLabels = { role: 'Vai trò', situation: 'Tình huống', task: 'Nhiệm vụ', setting: 'Nơi sử dụng', time: 'Thời điểm' } as const;

export function i14AdmissionSection(admission: AutomationI14EvidenceAdmission, claims: AutomationSourceClaims, citations: ReportCitations = NO_CITATIONS): string {
  const claimIndex = new Map(claims.claims.map(claim => [claim.claimId, claim]));
  const intro = '<p>Phần này kiểm tra lời nguồn có nêu bối cảnh sử dụng hay không. Bối cảnh có thể giúp đặt giả thuyết để người dùng xem xét; không chứng minh nhu cầu thị trường, mức phổ biến hoặc hướng đã được chọn.</p><p>Chưa có câu hỏi quyết định của người dùng. Chưa có hướng cơ hội hoặc giả thuyết AI được duyệt trong bản này.</p>';
  const anchors = admission.anchors.map(anchor => `<article class="evidence-entry"><h3>Bối cảnh theo lời nguồn</h3><dl>${anchor.contextFields.map(field => `<dt>${contextLabels[field.field]}</dt><dd><q>${escape(field.span.quote)}</q></dd>`).join('')}</dl><p>${attributionText(anchor.declaration.sourceAttribution, 'Chưa có ghi nhận nguồn')}</p>${anchor.counterevidenceSpans.length ? `<p>Đoạn phản chứng được ghi nhận:</p><ul>${anchor.counterevidenceSpans.map(span => `<li><q>${escape(span.quote)}</q></li>`).join('')}</ul>` : '<p>Hồ sơ này chưa ghi nhận đoạn phản chứng. Điều đó không có nghĩa là không tồn tại phản chứng.</p>'}${sourceDetails(claimById(claimIndex, anchor.claimId), 'claim', citations)}</article>`).join('');
  const unassigned = admission.unassigned.map(row => {
    const claim = claimById(claimIndex, row.claimId);
    const excerpt = claim.source.statement === null
      ? claim.source.spans.filter(span => span.role === 'DECLARATION').map(span => `<q>${escape(span.quote)}</q>`).join('<br>') || storedText(claim.observation.measure?.definition, 'Bằng chứng nguồn đã lưu', 'Định nghĩa đo lường được giữ trong bản lưu')
      : `<q>${escape(claim.source.statement)}</q>`;
    return `<tr><td><span class="evidence-cell-label" aria-hidden="true">Bằng chứng</span>${excerpt}</td><td><span class="evidence-cell-label" aria-hidden="true">Điều còn thiếu</span>${escape(unassignedCopy[row.reason])}</td><td>${sourceDetails(claim, 'claim', citations)}</td></tr>`;
  }).join('');
  return intro + (anchors || '<p class="warning">Chưa đủ bằng chứng về bối cảnh sử dụng để đặt hướng cơ hội. Lời kể chỉ nói đã mua hoặc đã dùng được giữ lại, nhưng không đủ điều kiện cho I14.</p>') + (unassigned ? `<details><summary>Xem bằng chứng chưa đủ điều kiện (${admission.unassigned.length})</summary><div class="table-wrap" role="region" aria-label="Bằng chứng chưa đủ điều kiện cho hướng cơ hội" tabindex="0"><table class="evidence-table"><caption>Giữ nguyên bằng chứng và lý do chưa đưa vào I14</caption><thead><tr><th scope="col">Bằng chứng</th><th scope="col">Điều còn thiếu</th><th scope="col">Truy nguồn</th></tr></thead><tbody>${unassigned}</tbody></table></div></details>` : '') + methodLimits(admission.limitations);
}
