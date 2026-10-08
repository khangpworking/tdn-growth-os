import { createHash } from 'node:crypto';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { CitationRegistry } from '../citation-registry.js';
import { renderCitationMarkOrMissing } from '../citation-register-html.js';
import { renderLocatedInsightSection } from '../report-located-insight-pages.js';
import { renderReportMethodPacketSection } from '../report-method-packets-pages.js';
import type { AutomationReportInput } from '../research-automation/reports.js';
import { attributionText, retainedEvidenceHtml, retainedQuoteHtml, storedLiteral, technicalLiteral, type ReportCitations } from '../research-automation/descriptive-report.js';
import { insightLiteralSection, reviewCorpusSection } from '../research-automation/review-corpus-report.js';
import { sourceEvidenceHtml } from '../research-automation/source-evidence-report.js';
import { decisionPacketSection, i14AdmissionSection, i14SynthesisSection } from '../research-automation/synthesis-evidence-report.js';
import { ReaderReportInputError } from './build.js';
import { verifyInsightReaderInput, type InsightReaderInput } from './insight-input-v1.js';
import { projectInsightFindings, type InsightSectionId } from './insight-projection.js';
import type { InsightReaderPage, InsightReaderSection } from './insight-template.js';

export type InsightReaderSourceIdentity = Pick<InsightReaderInput, 'workspaceId' | 'runId' | 'draftPairId' | 'semanticSha256' |
  'sourceReportSha256' | 'frozenStartSha256' | 'frozenScopeSha256' | 'sourceRendererVersion'>;
const digest = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');

/** Owning service only: all dependencies have passed exact retained-source replay.
 * Generic renderer sections/scope are deliberately absent from this interface.
 * Copies method fields and renders existing views; never executes a method or AI. */
export function prepareInsightReaderBuild(identity: InsightReaderSourceIdentity, methods: AutomationReportInput): {
  input: InsightReaderInput; page: InsightReaderPage;
} {
  if (methods.run.workspaceId !== identity.workspaceId || methods.run.runId !== identity.runId || methods.start.workspaceId !== identity.workspaceId ||
      methods.scope.workspaceId !== identity.workspaceId || methods.scope.runId !== identity.runId || !methods.start.reports.includes('INSIGHT') ||
      digest(methods.start) !== identity.frozenStartSha256 || digest(methods.scope) !== identity.frozenScopeSha256)
    throw new ReaderReportInputError('Insight reader methods differ from authenticated frozen scope.');
  if (methods.nativeReview && (methods.locatedReview || methods.reviewCorpus)) throw new ReaderReportInputError('Insight reader cannot substitute native and collected sources.');
  // The coding renderer helpers are a separately reviewed main dependency.
  // Until that dependency is placed, no substitute coding summary is admitted.
  if (methods.insightCoding) throw new ReaderReportInputError('Reviewed coding renderer integration is pending.');
  const scope = { keyword: methods.start.keyword, definition: methods.scope.definition,
    requestedPeriod: { startDate: methods.start.requestedPeriod.startDate, endDate: methods.start.requestedPeriod.endDate } };
  const references: InsightReaderInput['retainedMethods'] = [];
  const ref = (kind: InsightReaderInput['retainedMethods'][number]['kind'], value: unknown) => {
    if (value !== undefined) {
      const sha256 = digest(value);
      if (!references.some(reference => reference.kind === kind && reference.sha256 === sha256)) references.push({ kind, sha256 });
    }
  };
  ref('NATIVE', methods.nativeReview); ref('LOCATED', methods.locatedReview); ref('CORPUS', methods.reviewCorpus);
  ref('LITERAL', methods.insightLiteral); ref('BOUNDED', methods.boundedMethods); ref('SOURCE_EVIDENCE', methods.sourceEvidence);
  ref('SOURCE_CLAIMS', methods.sourceClaims); ref('SOURCE_CLAIMS', methods.decisionSourceClaims);
  ref('I14_ADMISSION', methods.i14Admission); ref('I14_SYNTHESIS', methods.i14Synthesis);
  for (const packet of methods.decisionPackets ?? []) ref('DECISION_PACKET', packet);
  for (const outcome of Object.values(methods.decisionSynthesis ?? {})) ref('DECISION_SYNTHESIS', outcome);
  const input: InsightReaderInput = { ...identity, contractVersion: 'insight-reader-input-v1', reportKind: 'INSIGHT',
    builderVersion: 'reader-report-insight-v1', scope, retainedMethods: references };
  verifyInsightReaderInput(input, input);
  const registry = new CitationRegistry();
  const citations: ReportCitations = { mark: value => renderCitationMarkOrMissing(registry.cite(value)) };
  const sections = new Map<InsightSectionId, InsightReaderSection>();
  const append = (id: InsightSectionId, body: string, explanation: string) => {
    const prior = sections.get(id); sections.set(id, { id, body: (prior?.body ?? '') + body, explanation: prior?.explanation ?? explanation });
  };
  const source = methods.nativeReview ?? (methods.locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? methods.locatedReview : undefined);
  if (source) {
    for (const id of ['I01', 'I02', 'I04', 'I05', 'I07', 'I08'] as const) {
      const body = renderLocatedInsightSection(source.output, id, { bundleDownload: false, showAnnotationPendingCount: false, citations });
      if (body) append(id, body, 'Khai báo bám lời nguồn; chưa xác thực độc lập và chưa phải mục phân tích hoàn chỉnh.');
    }
    append('I03', '<p>Đơn vị là bản ghi định vị trong tập nguồn đã lưu, không phải số người. Quy tắc đọc chỉ cho phép khai báo bám lời nguồn; không xác nhận OWNER đã duyệt từng nhãn. Ngày nguồn không tự xác lập độ phủ kỳ yêu cầu.</p>',
      'Giữ riêng nguồn, trạng thái đọc và giới hạn phương pháp.');
    const rows = source.output.input.records.map(record => {
      const mark = citations.mark({ sourceKind: 'REVIEW', identity: record.sourceSha256, locator: record.locator, label: 'Bản ghi lời nguồn',
        retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE' });
      return `<tr><td>${mark}<br><code>${technicalLiteral(record.sourceSha256)}</code><br><code>${technicalLiteral(record.locator)}</code><br>${attributionText(record.sourceAttribution, 'Chưa có ghi nhận nguồn')}</td><td>${record.text === null ? 'Không có văn bản đọc được' : retainedQuoteHtml(record.text, 'blockquote')}</td><td>${storedLiteral(record.disposition, 'Trạng thái giữ trong bản lưu')}<br>${record.timeText === null ? 'Chưa có ngày nguồn' : storedLiteral(record.timeText, 'Ngày giữ trong bản lưu')}</td></tr>`;
    }).join('');
    append('I17', `<h3>Bản ghi và vị trí nguồn</h3><p>Các bản ghi giữ nguyên vị trí và phần chữ. Không nối tác giả hoặc cộng số giữa các nguồn. Toàn văn có thể chứa thông tin cá nhân.</p><div class="table-wrap" role="region" aria-label="Bản ghi lời nguồn đã lưu" tabindex="0"><table><caption>Bản ghi nguồn, tách khỏi diễn giải AI</caption><thead><tr><th>Truy nguồn</th><th>Nguyên văn</th><th>Trạng thái và ngày nguồn</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Không có bản ghi trong đầu vào phương pháp; không suy ra nguồn không có phản hồi.</td></tr>'}</tbody></table></div>`, 'Phụ lục giữ nguyên nguồn và giới hạn của bản lưu.');
  }
  if (methods.reviewCorpus) for (const id of ['I03', 'I17'] as const)
    append(id, reviewCorpusSection(methods.reviewCorpus, id, citations), 'Tập thu nguồn giữ riêng với phần mã hóa.');
  if (methods.insightLiteral) for (const id of ['I05', 'I07', 'I08', 'I13', 'I17'] as const)
    append(id, insightLiteralSection(methods.insightLiteral, id, citations), 'Số sao, nguyên văn trùng và lời người bán giữ riêng theo nguồn.');
  if (methods.boundedMethods) {
    for (const id of ['I11', 'I12', 'I16'] as const) {
      const body = renderReportMethodPacketSection({ gates: methods.boundedMethods.output }, id, { evidenceAnchorId: 'bounded-method-evidence' });
      if (body) append(id, body, 'Chỉ trình bày kiểm tra điều kiện của hồ sơ đã lưu, chưa xác nhận insight hoặc quan hệ nhân quả.');
    }
    // This is the retained packet's own evidence, not another method execution.
    append('I17', `<details open id="bounded-method-evidence"><summary>Hồ sơ phương pháp và vị trí nguồn</summary><p>Nguồn bổ sung do người dùng chọn giữ riêng kỳ, phạm vi và điều kiện còn thiếu; không xác nhận độ phủ hoặc cộng gộp với review.</p>${retainedEvidenceHtml(methods.boundedMethods)}</details>`, 'Đối chiếu hồ sơ phương pháp bổ sung đã lưu.');
  }
  if (methods.i14Admission && methods.sourceClaims) append('I14', i14AdmissionSection(methods.i14Admission, methods.sourceClaims, citations) +
    i14SynthesisSection(methods.i14Synthesis, citations), 'Bối cảnh dùng để đề xuất giả thuyết; chưa phải hướng đã được chọn.');
  const packet = methods.decisionPackets?.find(item => item.sectionId === 'I15');
  if (packet && methods.decisionSourceClaims) {
    const outcome = methods.decisionSynthesis?.I15;
    if (outcome?.status === 'VALID' && outcome.candidates.artifact.aiCandidates.length > 3)
      throw new ReaderReportInputError('Insight reader admits at most three retained proposed actions.');
    append('I15', '<p>Mọi đề xuất AI đều là đề xuất, chờ chủ duyệt. Người phụ trách và hạn chót giữ trạng thái đề xuất; phương án của chủ giữ riêng.</p>' +
      decisionPacketSection(packet, methods.decisionSourceClaims, outcome, citations), 'Bằng chứng, giả thuyết và phương án chưa duyệt được giữ riêng; không có quyết định thay chủ.');
  }
  if (methods.sourceEvidence) append('I17', sourceEvidenceHtml(methods.sourceEvidence), 'Nguồn, hạng và kết quả lọc nghĩa được giữ riêng theo từng nguồn.');
  return { input, page: { keyword: scope.keyword, definition: scope.definition, period: scope.requestedPeriod,
    registry, sections: [...sections.values()], findings: projectInsightFindings(methods) } };
}
