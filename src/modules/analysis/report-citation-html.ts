import { renderReportKitHtml, type ReportKitInputs } from './report-kit-html.js';
import { buildReportCitationProjection, type ReportCitationEntry, type ReportCitationLocator, type ReportCitationProjection } from './report-citations.js';
import { esc, formatDecimal, SCOPE_NAME } from './report-section-pages.js';
import type { FactObservation } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import { reportKitFontCss } from './report-kit-fonts.js';
import { reportCitationFontCss } from './report-citation-fonts.js';

// A separate, offline rendition. Never registered as the v1 historical renderer.
export const REPORT_CITATION_PREVIEW_RENDERER = 'report-kit-citations-preview-vi-v1';

const CSS = `
.citation-badge{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:36px;min-width:36px;min-height:28px;margin-inline-start:5px;padding:0 3px;border-radius:4px;background:#edf0fc;color:#232e7a;font:700 12px Montserrat,sans-serif;text-decoration:none;vertical-align:middle;font-variant-numeric:tabular-nums}
.citation-badge:hover{background:#dce2fa;text-decoration:underline;text-underline-offset:3px}
.citation-badge:focus-visible,.citation-record:focus-visible{outline:3px solid #232e7a;outline-offset:3px}
.citation-preview-note{margin:20px 0;padding:12px 0;border-block:1px solid #d2d9e8;color:#232e7a;font-size:13px;line-height:1.65}
.citation-preview-note strong{display:block;font-size:14px}
.citation-register{margin-top:40px;scroll-margin-top:24px}
.citation-register>p{max-width:72ch}
.citation-record{padding:18px 0;border-bottom:1px solid #d2d9e8;scroll-margin-top:24px;overflow-wrap:anywhere}
.citation-record:target{background:#f3f6fa}
.citation-record h3{margin:0 0 8px;color:#232e7a;font-size:15px}
.citation-record p{margin:6px 0;max-width:72ch;font-size:13px;line-height:1.6}
.citation-record code{font-size:12px;white-space:normal;overflow-wrap:anywhere}
.citation-record details{font-size:12px;margin-top:8px}
.citation-record summary{cursor:pointer;min-height:28px;display:flex;align-items:center}
.citation-record blockquote{margin:10px 0;padding:0;white-space:pre-wrap}
@media print{.citation-badge{min-width:0;min-height:0;padding:0;background:none}.citation-record{break-inside:auto}.citation-record details{display:block}.citation-record details::details-content{content-visibility:visible}.citation-preview-note{font-size:11px}}
`;

function locatorLabel(locator: ReportCitationLocator): string {
  switch (locator.kind) {
    case 'pdf': return `Trang ${locator.page}${locator.fragment === null ? '' : ` · ${locator.fragment}`}`;
    case 'xlsx': return `${locator.sheet} · ô ${locator.cell}`;
    case 'json-pointer': return `Vị trí trong kết quả: ${locator.pointer}`;
    case 'source-locator': return `Vị trí nguồn: ${locator.value}`;
  }
}

// Bundle-relative downloads only. No URL scheme, traversal, absolute path or
// query/fragment supplied by source text can enter an href.
function fileHref(value: string): string {
  if (value.startsWith('/') || value.includes('\\') || value.includes(':') || value.includes('?') || value.includes('#') ||
    value.split('/').some(part => part === '' || part === '.' || part === '..')) {
    throw new TypeError('citation preview: UNSAFE_ARTIFACT_PATH');
  }
  return value.split('/').map(encodeURIComponent).join('/');
}

function claimLabel(claim: FactObservation, separator = ' — '): string {
  const labels: Record<FactObservation['statementKind'], string> = {
    LISTING_COUNT: 'Số listing', SHOP_COUNT: 'Số shop', OBSERVED_REVENUE: 'Doanh thu quan sát',
    OBSERVED_UNITS: 'Sản lượng quan sát', TOP_SHOP_SHARE: 'Tỷ trọng doanh thu của shop đứng đầu',
  };
  const top = /:top(1|3|10)$/.exec(claim.claimId);
  const label = claim.statementKind === 'TOP_SHOP_SHARE' && top ? `Tỷ trọng doanh thu Top ${top[1]} shop` : labels[claim.statementKind];
  return `${esc(label)} · ${esc(SCOPE_NAME[claim.scopeKey])}${separator}${formatDecimal(String(claim.value))}${claim.unit === 'percent' ? '%' : ` ${esc(claim.unit === 'unit' ? 'đơn vị' : claim.unit)}`}`;
}

function citationRecord(entry: ReportCitationEntry, projection: ReportCitationProjection, inputs: ReportKitInputs, claimSeparator = ' — '): string {
  const supporting = projection.references.filter(ref => ref.citationNumbers.includes(entry.number));
  const layer = entry.artifact.kind === 'calculation' ? 'Kết quả tính toán' : 'Nguồn được lưu';
  const claims = supporting.map(ref => inputs.bundle.packet.claims.find(claim => claim.claimId === ref.referenceId)!);
  const refs = claims.map(claim => `<a href="#claim-${encodeURIComponent(claim.claimId)}">${claimLabel(claim, claimSeparator)}</a>`).join('<br>');
  const sources = [...new Set(supporting.flatMap(ref => ref.sourceCitationNumbers))];
  const sections = [...new Set(claims.map(claim => claim.sectionId))];
  const returnLinks = sections.map(sectionId => {
    const section = inputs.bundle.packet.catalog.sections.find(section => section.sectionId === sectionId)!;
    return `<a href="#section-${encodeURIComponent(sectionId)}">Về ${esc(sectionId)} · ${esc(section.title)}</a>`;
  }).join(' · ');
  const heading = entry.artifact.kind === 'calculation' && claims[0] ? claimLabel(claims[0], claimSeparator)
    : `${esc(layer)} · ${esc(entry.source?.label ?? entry.artifact.logicalPath)}`;
  return `<article class="citation-record" id="citation-${entry.number}" tabindex="-1" aria-labelledby="citation-title-${entry.number}">
<h3 id="citation-title-${entry.number}">[${entry.number}] ${heading}</h3>
<p>${esc(layer)}${entry.artifact.kind === 'calculation' ? '' : ` · ${esc(locatorLabel(entry.locator))}`}</p>
${entry.quote === null ? '' : `<blockquote>${esc(entry.quote)}</blockquote>`}
<p><a href="${esc(fileHref(entry.artifact.logicalPath))}" download>Tải file bằng chứng</a>${refs ? ` · Quan sát liên quan: ${refs}` : ''}</p>
${entry.artifact.kind === 'calculation' && sources.length ? `<p>Nguồn gốc: ${sources.map(number => `<a href="#citation-${number}">[${number}]</a>`).join(' ')}</p>` : ''}
<p>${returnLinks}</p>
<details><summary>Xem dấu vết kiểm tra</summary><p>File: ${esc(entry.artifact.logicalPath)} · ${esc(locatorLabel(entry.locator))}</p><p>SHA-256: <code>${esc(entry.artifact.sha256)}</code></p><p>Phiên bản nội dung: <code>${esc(entry.reportSemanticVersionId)}</code></p></details>
</article>`;
}

/** Numbered links are added only beside existing retained claim links. No
 * arbitrary AI prose or retrieval candidates are accepted by this renderer. */
export function renderReportCitationPreview(inputs: ReportKitInputs): { readonly html: string; readonly projection: ReportCitationProjection } {
  const projection = buildReportCitationProjection({ bundle: inputs.bundle });
  const references = new Map(projection.references.map(ref => [ref.referenceId, ref]));
  let html = renderReportKitHtml(inputs);
  html = html.replace(/<a\b([^>]*\bhref="#claim-([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g, (anchor: string, _attributes: string, encodedId: string) => {
    const reference = references.get(decodeURIComponent(encodedId));
    if (!reference) throw new TypeError('citation preview: CLAIM_LINK_NOT_RETAINED');
    // A calculated total may bind many input cells: keep its one calculation
    // badge compact; the register preserves the full source-cell trail.
    const number = reference.calculationCitationNumbers[0];
    if (number === undefined) return anchor;
    return `${anchor.replace('Xem bằng chứng', 'Xem dòng quan sát')}<a class="citation-badge" href="#citation-${number}" aria-label="Mở bằng chứng ${number}: kết quả tính và nguồn">[${number}]</a>`;
  });
  const records = projection.citations.map(entry => citationRecord(entry, projection, inputs)).join('\n');
  const register = `<section class="citation-register" id="citation-register" aria-labelledby="citation-register-title"><h2 id="citation-register-title">Nguồn cho từng quan sát</h2>
<p>Số trong ngoặc vuông bên cạnh dữ kiện dẫn tới kết quả tính đã lưu, rồi tới vị trí dòng/ô nguồn. Số thứ tự chỉ cố định trong phiên bản nội dung này. Lưu được nguồn không có nghĩa nguồn đã được xác thực. Nhận định AI và quyết định của người dùng không được xem là bằng chứng nguồn.</p>
${records || '<p>Chưa có quan sát đủ điều kiện để đính kèm nguồn. Không tạo trích dẫn thay thế.</p>'}
<p><a href="citations.json" download>Tải toàn bộ chỉ mục trích nguồn</a> · <a href="#market">Về nội dung báo cáo</a></p></section>`;
  const note = '<aside class="citation-preview-note"><strong>Bản thử trích nguồn · Chưa duyệt thiết kế</strong>Chỉ thêm cách mở bằng chứng cho dữ kiện đã lưu; không thay đổi số liệu, phương pháp hoặc báo cáo lịch sử. <a href="#citation-register">Xem chỉ mục nguồn</a></aside>';
  if (!html.includes('</style>') || !html.includes('<ul class="jump"') || !html.includes('<footer class="kit-foot">')) {
    throw new TypeError('citation preview: BASE_RENDERER_LAYOUT_CHANGED');
  }
  html = html.replace(reportKitFontCss(), reportCitationFontCss()).replace('</style>', `${CSS}</style>`)
    .replace('data-renderer="report-kit-html-vi-v1"', `data-renderer="${REPORT_CITATION_PREVIEW_RENDERER}"`)
    .replace('<ul class="jump"', `${note}<ul class="jump"`)
    .replace('<footer class="kit-foot">', `${register}<footer class="kit-foot">`);
  return { html, projection };
}

/**
 * The retained, versioned citation presentation. This is intentionally a
 * separate renderer from both the historical report-kit HTML and the A46
 * preview: the latter keeps its design-review note while this renderer is the
 * explicit production request value accepted by the report version contracts.
 */
export const REPORT_CITATIONS_RENDERER_VERSION = 'report-kit-citations-html-vi-v1';

export function renderReportCitationHtml(inputs: ReportKitInputs): { readonly html: string; readonly projection: ReportCitationProjection } {
  const projection = buildReportCitationProjection({
    bundle: inputs.bundle,
    ...(inputs.semanticVersionId === undefined ? {} : { semanticVersionId: inputs.semanticVersionId }),
  });
  const references = new Map(projection.references.map(ref => [ref.referenceId, ref]));
  let html = renderReportKitHtml(inputs);
  html = html.replace(/<a\b([^>]*\bhref="#claim-([^"]+)"[^>]*)>([\s\S]*?)<\/a>/g, (anchor: string, _attributes: string, encodedId: string) => {
    const reference = references.get(decodeURIComponent(encodedId));
    if (!reference) throw new TypeError('citation report: CLAIM_LINK_NOT_RETAINED');
    const number = reference.calculationCitationNumbers[0];
    if (number === undefined) return anchor;
    return `${anchor.replace('Xem bằng chứng', 'Xem dòng quan sát')}<a class="citation-badge" href="#citation-${number}" aria-label="Mở bằng chứng ${number}: kết quả tính và nguồn">[${number}]</a>`;
  });
  const records = projection.citations.map(entry => citationRecord(entry, projection, inputs, ' · ')).join('\n');
  const register = `<section class="citation-register" id="citation-register" aria-labelledby="citation-register-title"><h2 id="citation-register-title">Nguồn cho từng quan sát</h2>
<p>Số trong ngoặc vuông bên cạnh dữ kiện dẫn tới kết quả tính đã lưu, rồi tới vị trí dòng/ô nguồn. Số thứ tự chỉ cố định trong phiên bản nội dung này. Lưu được nguồn không có nghĩa nguồn đã được xác thực. Nhận định AI và quyết định của người dùng không được xem là bằng chứng nguồn.</p>
${records || '<p>Chưa có quan sát đủ điều kiện để đính kèm nguồn. Không tạo trích dẫn thay thế.</p>'}
<p><a href="citations.json" download>Tải toàn bộ chỉ mục trích nguồn</a> · <a href="#market">Về nội dung báo cáo</a></p></section>`;
  if (!html.includes('</style>') || !html.includes('<ul class="jump"') || !html.includes('<footer class="kit-foot">')) {
    throw new TypeError('citation report: BASE_RENDERER_LAYOUT_CHANGED');
  }
  html = html.replace(reportKitFontCss(), reportCitationFontCss()).replace('</style>', `${CSS}</style>`)
    .replace('content="report-kit-v1"', 'content="report-kit-citations-v1"')
    .replace('data-renderer="report-kit-html-vi-v1"', `data-renderer="${REPORT_CITATIONS_RENDERER_VERSION}"`)
    .replace('<footer class="kit-foot">', `${register}<footer class="kit-foot">`);
  return { html, projection };
}
