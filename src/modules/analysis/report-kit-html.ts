import type { ReportAssemblySnapshot } from '../../../contracts/analysis/report-assembly-snapshot.generated.js';
import type { DescriptiveMarketMethods } from '../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { LocatedInsightMethods } from '../../../contracts/analysis/located-insight-methods.generated.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import type { VerifiedSectionArtifactRetention } from './section-artifact-retention-ledger.js';
import { renderResearchReportHtml } from './research-report-html.js';
import { renderReportAssemblyHtml } from './report-assembly-html.js';
import { REPORT_KIT_CSS } from './report-kit-theme.js';
import { reportKitFontCss } from './report-kit-fonts.js';
import {
  esc,
  renderInsightPanel,
  renderMarketSheet,
  renderOverviewKpis,
  shortDate,
  STATE_KEY,
  STATE_LABEL,
  type KitContext,
  type KitSection,
} from './report-section-pages.js';

export const REPORT_KIT_RENDERER_VERSION = 'report-kit-html-vi-v1';

export interface ReportKitInputs {
  readonly bundle: SourceBackedReportBundle;
  readonly snapshot?: ReportAssemblySnapshot;
  readonly retainedM03?: VerifiedSectionArtifactRetention;
  readonly semanticVersionId?: string;
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly locatedInsightMethods?: LocatedInsightMethods;
}

const fail = (code: string): never => { throw new TypeError(`report kit HTML: ${code}`); };

const STATE_ORDER = ['PARTIAL_DETERMINISTIC_DRAFT', 'METHOD_ONLY', 'BLOCKED', 'MANUAL_REVIEW_REQUIRED', 'NOT_IMPLEMENTED'] as const;
const REQUIRED_EVIDENCE_SECTIONS = ['readiness', 'claims', 'provenance', 'source-rows', 'files', 'chart-spec'] as const;

function buildSections(inputs: ReportKitInputs): KitSection[] {
  const { bundle, snapshot } = inputs;
  const { packet } = bundle;
  if (snapshot !== undefined && snapshot.sections.length !== packet.catalog.sections.length) fail('SNAPSHOT_SECTION_COUNT_MISMATCH');
  return packet.catalog.sections.map((definition, index) => {
    const packed = packet.sections.find(candidate => candidate.sectionId === definition.sectionId);
    if (packed === undefined) return fail(`PACKET_SECTION_MISSING:${definition.sectionId}`);
    const assembled = snapshot?.sections[index];
    if (snapshot !== undefined) {
      if (assembled === undefined || assembled.sectionId !== definition.sectionId) return fail(`SNAPSHOT_SECTION_ORDER_MISMATCH:${definition.sectionId}`);
      if (assembled.materialization.deliveryState !== packed.deliveryState) return fail(`SNAPSHOT_DELIVERY_STATE_MISMATCH:${definition.sectionId}`);
    }
    return {
      sectionId: definition.sectionId,
      title: definition.title,
      methodId: definition.methodId,
      methodVersion: definition.methodVersion,
      requiredInputs: definition.requiredInputs,
      reopenCondition: definition.reopenCondition,
      fallbackReasons: definition.fallbackReasons,
      deliveryState: packed.deliveryState,
      claimIds: packed.claimIds,
      blockers: packed.blockers,
      methodArtifactFile: packed.methodArtifact?.fileName ?? null,
      readiness: assembled?.readiness ?? null,
      readinessBlockedWhileMaterialized: assembled?.readinessBlockedWhileMaterialized ?? false,
    };
  });
}

/** The legacy evidence sections stay the detailed appendix; only their visual frame changes. */
function evidenceAppendix(inputs: ReportKitInputs): string {
  const { bundle, snapshot, retainedM03, semanticVersionId } = inputs;
  const legacy = snapshot !== undefined && retainedM03 !== undefined
    ? renderReportAssemblyHtml({ bundle, snapshot, retainedM03, ...(semanticVersionId === undefined ? {} : { semanticVersionId }) })
    : renderResearchReportHtml(bundle, semanticVersionId);
  const blocks = new Map<string, string>();
  for (const match of legacy.matchAll(/<section id="([a-z-]+)">[\s\S]*?<\/section>/g)) blocks.set(match[1]!, match[0]);
  for (const id of REQUIRED_EVIDENCE_SECTIONS) if (!blocks.has(id)) fail(`LEGACY_EVIDENCE_SECTION_MISSING:${id}`);
  const order = ['method', 'trace', 'quote', 'chart-spec', 'assembly', 'readiness', 'claims', 'provenance', 'source-rows', 'files'];
  const body = order.flatMap(id => blocks.has(id) ? [blocks.get(id)!] : []).join('\n');
  return `<div id="appendix" class="appendix"><h2>Phụ lục bằng chứng chi tiết</h2><p class="lede">Mọi con số ở các trang trên dẫn về đây: quan sát có nguồn, phép tính, membership, dòng nguồn đã chuẩn hóa và file tải về. Nội dung phụ lục giữ nguyên từ bản báo cáo bằng chứng.</p>
${body}
</div>`;
}

function statusOverview(sections: readonly KitSection[]): string {
  const counts = new Map<KitSection['deliveryState'], number>(STATE_ORDER.map(state => [state, 0] as const));
  for (const section of sections) counts.set(section.deliveryState, counts.get(section.deliveryState)! + 1);
  const bar = STATE_ORDER.filter(state => counts.get(state)! > 0)
    .map(state => `<span class="${STATE_KEY[state]}" style="flex:${counts.get(state)} 1 0" title="${esc(STATE_LABEL[state])}: ${counts.get(state)}">${counts.get(state)}</span>`).join('');
  const legend = STATE_ORDER.map(state => `<li><span class="chip ${STATE_KEY[state]}">${esc(STATE_LABEL[state])}</span> ${counts.get(state)}</li>`).join('');
  const tiles = sections.map(section => `<li class="${STATE_KEY[section.deliveryState]}"><a href="#section-${esc(section.sectionId)}"><b>${esc(section.sectionId)}</b><small>${esc(section.title)}</small>${esc(STATE_LABEL[section.deliveryState])}</a></li>`).join('');
  return `<section class="status" id="status" aria-labelledby="status-title"><div class="part-title"><p class="pt">Phần 3</p><h2 id="status-title">Trạng thái ${sections.length} mục</h2><p>Mỗi mục hiện đúng trạng thái giao hàng của nó. Đây là bảng kiểm kê đầu ra đã có, không phải điểm hoàn thành hay độ tin cậy của báo cáo.</p></div>
<div class="sbar" role="img" aria-label="${esc(STATE_ORDER.map(state => `${STATE_LABEL[state]}: ${counts.get(state)}`).join('; '))}">${bar}</div>
<ul class="legend">${legend}</ul>
<ul class="tiles">${tiles}</ul></section>`;
}

function cover(inputs: ReportKitInputs, title: string, sections: readonly KitSection[]): string {
  const scope = inputs.bundle.packet.scope;
  const partialCount = sections.filter(section => section.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT').length;
  const marketCount = sections.filter(section => section.sectionId.startsWith('M')).length;
  const acquired = scope.acquiredAt === null ? 'Thời điểm thu nhận chưa được xác nhận' : `Thu nhận theo nguồn: ${shortDate(scope.acquiredAt)}`;
  return `<header class="cover" id="cover">
<div class="cv-left"><div><span class="brand"><i></i><b>TDN</b> Research</span><p class="cv-eyebrow" style="margin-top:28px">Bản nháp nội bộ · Chưa duyệt · Chưa có nhận định AI</p><h1>${esc(title)}</h1><p class="cv-lede">Số liệu quan sát có nguồn, mỗi con số mở được bằng chứng.</p></div>
<div class="cv-meta"><b>${esc(scope.platform)} · bộ lọc ${esc(scope.selection)}</b><span>Kỳ đo: ${esc(shortDate(scope.start))} đến ${esc(shortDate(scope.end))}</span><span>${esc(acquired)}</span></div>
<div class="cv-kpi"><strong>${partialCount} / ${sections.length}</strong><span>mục có đầu ra một phần. Đếm đầu ra đã có, không phải phần trăm hoàn thành hay độ tin cậy.</span></div></div>
<nav class="cv-right" aria-label="Mục lục"><h2>Nội dung</h2><ol class="toc">
<li><a href="#market"><em>01</em><span>Bản tin thị trường<small>${marketCount} mục M01 đến M${marketCount}</small></span></a></li>
<li><a href="#insight"><em>02</em><span>Insight<small>${sections.length - marketCount} mục I01 đến I${sections.length - marketCount}</small></span></a></li>
<li><a href="#status"><em>03</em><span>Trạng thái ${sections.length} mục<small>Đã có, còn thiếu, chưa triển khai</small></span></a></li>
<li><a href="#appendix"><em>04</em><span>Phụ lục bằng chứng<small>Quan sát, phép tính, dòng nguồn, file tải</small></span></a></li></ol></nav></header>`;
}

/**
 * Deterministic, script-free report in the approved TDN report-kit look.
 * `snapshot` and `retainedM03` must be given together (prepared path) or both omitted (source-backed partial path).
 */
export function renderReportKitHtml(inputs: ReportKitInputs): string {
  const { bundle, snapshot, retainedM03, descriptiveMethods, locatedInsightMethods } = inputs;
  if ((snapshot === undefined) !== (retainedM03 === undefined)) fail('SNAPSHOT_AND_RETAINED_M03_MUST_BE_TOGETHER');
  const sections = buildSections(inputs);
  const ctx: KitContext = { bundle, snapshot, descriptive: descriptiveMethods, sections,
    ...(locatedInsightMethods === undefined ? {} : { located: locatedInsightMethods }) };
  const workspace = JSON.parse(bundle.files.get('workspace.json')!.toString('utf8')) as { title: string };
  const market = sections.filter(section => section.sectionId.startsWith('M'));
  const insight = sections.filter(section => !section.sectionId.startsWith('M'));
  const marketCount = market.length;
  const appendix = evidenceAppendix(inputs);
  // Expanded evidence tables must fragment across printed pages. Screen
  // layout and requests without located evidence keep their original CSS.
  const locatedPrint = locatedInsightMethods === undefined ? ''
    : '@media print{.ip-grid{display:block}.ip{break-inside:auto;margin-bottom:16px}.ip tr{break-inside:auto}}';

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="tdn-report-presentation" content="report-kit-v1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; base-uri 'none'; form-action 'none'"><title>${esc(workspace.title)} · Báo cáo TDN</title><style>${reportKitFontCss()}${REPORT_KIT_CSS}${locatedPrint}</style></head><body data-renderer="${REPORT_KIT_RENDERER_VERSION}"><a class="skip" href="#market">Đến nội dung báo cáo</a>
<main>
${cover(inputs, workspace.title, sections)}
<ul class="jump" aria-label="Chuyển nhanh"><li><a href="#market">Bản tin thị trường</a></li><li><a href="#insight">Insight</a></li><li><a href="#status">Trạng thái ${sections.length} mục</a></li><li><a href="#appendix">Phụ lục bằng chứng</a></li></ul>
<section id="market" aria-labelledby="market-title"><div class="part-title"><p class="pt">Phần 1</p><h2 id="market-title">Bản tin thị trường</h2><p>${marketCount} mục theo khung phương pháp. Mục có dữ kiện hiện số liệu và bằng chứng; mục chưa có hiện rõ điều kiện còn thiếu.</p></div>
${renderOverviewKpis(ctx)}
<div style="margin-top:24px">${market.map((section, index) => renderMarketSheet(ctx, section, index + 1)).join('\n')}</div></section>
<section class="ins" id="insight" aria-labelledby="insight-title"><div class="ins-head"><span class="brand"><i></i><b>TDN</b> Insight</span><p class="pt">Phần 2</p><h2 id="insight-title">Insight</h2><p>Các khung dưới đây chỉ hiện phần có dữ kiện. Khung còn thiếu nói rõ thiếu gì, không điền sẵn kết luận.</p></div><div class="ins-body"><div class="ip-grid">
${insight.map(section => renderInsightPanel(ctx, section)).join('\n')}
</div></div></section>
${statusOverview(sections)}
${appendix}
<footer class="kit-foot">Bản nháp nội bộ, chưa duyệt, chưa được phép công bố. Số liệu là quan sát từ file nguồn đã nạp, không đại diện cho toàn thị trường.</footer>
</main></body></html>
`;
}
