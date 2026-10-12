import { CitationRegistry, type CitationTrace } from '../citation-registry.js';
import { orderReportCitations, renderCitationMarkOrMissing, renderCitationRegister } from '../citation-register-html.js';
import { storedLiteral } from '../research-automation/descriptive-report.js';
import { Narrator } from './bundle.js';
import { esc } from './format.js';
import { cover, page } from './layout.js';
import { INSIGHT_SECTION_IDS, INSIGHT_TITLES, type InsightFindings, type InsightSectionId } from './insight-projection.js';
import { SYNTHESIS_EVIDENCE_CSS } from '../research-automation/synthesis-evidence-report.js';

const INSIGHT_CSS = `${SYNTHESIS_EVIDENCE_CSS}
:root{--bd:var(--line);--blue:var(--acc)}
section,td,blockquote,code{overflow-wrap:anywhere}.table-wrap{overflow-x:auto;max-width:100%}
.table-wrap table{min-width:620px}.table-wrap:focus-visible,summary:focus-visible{outline:3px solid var(--acc);outline-offset:3px}
summary{min-height:44px;align-content:center}blockquote{margin:12px 0;padding:8px 16px;border-left:3px solid var(--acc2);white-space:pre-wrap}
caption{text-align:left;font-weight:600;margin:8px 0}.insight-findings{padding-left:22px}.insight-findings>li{margin:18px 0}
@media print{details::details-content{content-visibility:visible;display:block}details>summary{break-after:avoid}
.table-wrap{overflow:visible}.table-wrap table{min-width:0}thead{display:table-header-group}tr,blockquote{break-inside:avoid}}
`;

export interface InsightReaderSection {
  readonly id: InsightSectionId;
  readonly body: string;
  readonly explanation: string;
}
export interface InsightReaderPage {
  /** Reconstructed from authenticated frozen start/scope, never semantic.scope. */
  readonly keyword: string;
  readonly period: { readonly startDate: string; readonly endDate: string };
  readonly definition: string;
  readonly sections: readonly InsightReaderSection[];
  readonly findings: InsightFindings;
  readonly registry: CitationRegistry;
}

/** Presentation only. All section bodies come from existing verified method
 * renderers. Missing methods stay visible; rendering performs no calculation. */
export function buildInsightReaderTemplate(input: InsightReaderPage): { html: string; narrator: Narrator; citationTrace: CitationTrace } {
  // Section bodies already contain their original registry numbers. Reordering
  // that registry would invalidate those numbers on a repeat build of this page.
  const registry = new CitationRegistry(), trace = input.registry.technicalTrace();
  for (const entry of input.registry.entries()) {
    const source = trace.entries.find(item => item.citationId === entry.citationId);
    if (!source) throw new Error('Insight citation is missing its retained identity');
    registry.cite({ sourceKind: entry.sourceKind, identity: source.identity, locator: source.locator,
      label: entry.label, retrievedAt: entry.retrievedAt, url: entry.url, quote: entry.quote,
      quoteVerification: entry.quoteVerification, technical: source.technical });
  }
  const narrator = new Narrator(input.findings.bundle);
  const known = new Map<InsightSectionId, InsightReaderSection>();
  for (const section of input.sections) {
    if (!INSIGHT_SECTION_IDS.includes(section.id) || known.has(section.id)) throw new Error('Insight reader section identity mismatch');
    known.set(section.id, section);
  }
  const findings = input.findings.findings;
  const summary = findings.length ? `<ul class="insight-findings">${findings.map(finding => {
    if (!known.get(finding.sectionId)?.body) throw new Error('Insight finding requires its retained method section');
    const marks = finding.citations.map(citation => renderCitationMarkOrMissing(registry.cite(citation))).join(' ');
    if (!marks || marks.includes('cite-missing')) throw new Error('Insight finding requires exact source citations');
    return `<li><p${finding.template.includes('đề xuất, chờ chủ duyệt') ? ' data-classified="pending"' : ''}><b>Nhận định:</b> ${narrator.nar(finding.template, 'insight-findings')}</p><p><b>Bằng chứng:</b> <a href="#${finding.sectionId}">${esc(INSIGHT_TITLES[finding.sectionId])}</a> ${marks}</p><p><b>Trạng thái:</b> ${esc(finding.status)}</p><p><b>Phạm vi:</b> ${esc(finding.scope)}</p></li>`;
  }).join('')}</ul>` : '';
  const shortage = findings.length < 4 ? '<p class="warning">Chưa đủ bằng chứng được đưa vào để trình bày đủ bốn phát hiện mô tả. Phần thiếu không được thay bằng giả thuyết hoặc số không.</p>' : '';
  const scope = `<p><b>Phạm vi yêu cầu:</b> ${storedLiteral(input.definition, 'Phạm vi được giữ trong bản lưu')}.</p><p><b>Kỳ yêu cầu:</b> ${esc(input.period.startDate)} – ${esc(input.period.endDate)}. Ngày nguồn, cỡ mẫu và phạm vi thực tế được giữ riêng ở phương pháp và phụ lục; chưa xác lập độ phủ kỳ yêu cầu.</p>`;
  let body = `<section id="insight-findings"><div class="sh"><h2>Kết luận chính</h2></div>${scope}${summary}${shortage}<p>Các phát hiện được trình bày cạnh nhau theo mục báo cáo; không xác lập ưu tiên hoặc quan hệ nhân quả.</p></section>`;
  body += INSIGHT_SECTION_IDS.map(id => {
    const selected = known.get(id);
    const missing = id === 'I15'
      ? '<p>Chưa có phương án hoặc đề xuất đã lưu đủ điều kiện trình bày. Mọi đề xuất cần mang nhãn đề xuất, chờ chủ duyệt; người phụ trách và hạn chót cũng là đề xuất. Phương án của chủ giữ riêng.</p>'
      : '<p>Chưa có kết quả phương pháp đã xác minh cho mục này. Không suy ra không có hiện tượng trong nguồn.</p>';
    return `<section id="${id}"><div class="sh"><span class="sid">${id}</span><h2>${esc(INSIGHT_TITLES[id])}</h2></div><p class="ans">${esc(selected?.explanation ?? 'Chưa đủ bằng chứng cho mục này.')}</p>${selected?.body ?? missing}</section>`;
  }).join('\n');
  body = orderReportCitations(body, registry);
  body += renderCitationRegister(registry.entries(), { format: 'web' });
  const html = page({ title: 'Báo cáo insight', coverHtml: cover(null, storedLiteral(input.keyword, 'Từ khóa được giữ trong bản lưu'), ['Báo cáo', 'INSIGHT', 'Bản nháp · Chờ chủ duyệt']),
    extraCss: INSIGHT_CSS,
    intro: '<p>Bản đọc từ đúng nguồn và phương pháp đã lưu. Không có quyết định thay người dùng. Không cộng gộp nền tảng hoặc coi bản ghi là người.</p>',
    toc: [['insight-findings', 'Kết luận chính'], ...INSIGHT_SECTION_IDS.map(id => [id, INSIGHT_TITLES[id]] as const)],
    sections: [body], foot: '<p>Chưa được chủ duyệt. Quy tắc mã hóa hoặc biên nhận lựa chọn không xác nhận sự thật, độ đại diện hoặc điều kiện phát hành.</p>' });
  return { html, narrator, citationTrace: registry.technicalTrace() };
}
