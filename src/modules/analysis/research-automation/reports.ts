import fs from 'node:fs';
import type { ResearchAutomationRun } from '../../../../contracts/api/research-automation-api.generated.js';
import { REPORT_KIT_CSS } from '../report-kit-theme.js';
import { reportKitFontCss } from '../report-kit-fonts.js';
import type { CaptureRecord, ScopeSnapshot, StartSnapshot, StepResultDocument, TypedComparable } from './model.js';

export interface AutomationReportInput {
  readonly run: ResearchAutomationRun;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
}
interface CatalogSection { sectionId: string; title: string; methodId: string; methodVersion: string; requiredInputs: string[] }
interface DraftSection { sectionId: string; title: string; state: 'SOURCE_CONTEXT' | 'SOURCE_TABLE' | 'BLOCKED'; method: string; explanation: string; rows: readonly TypedComparable[] }
const catalog = JSON.parse(fs.readFileSync(new URL('../../../../docs/research/report-section-catalog-v1.json', import.meta.url), 'utf8')) as { sections: CatalogSection[] };
const escape = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
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

/** Deliberately narrower than the complete M07 method: no universe, share or rank inference. */
function peerEvidence(input: AutomationReportInput): readonly TypedComparable[] {
  const peers = input.scope.peerProductIds;
  if (peers.length < 2 || input.collection === null) return [];
  const collectionCaptures = input.captures.filter(capture => capture.stepId === 'COLLECTION');
  const candidates = input.collection.comparables.filter(row => peers.includes(row.productId));
  for (const first of candidates) {
    const matches = candidates.filter(row => row.provider === first.provider && row.metric === first.metric && row.window.startDate === first.window.startDate && row.window.endDate === first.window.endDate);
    if (matches.length !== peers.length || !peers.every(id => matches.filter(row => row.productId === id).length === 1)) continue;
    if (!matches.every(row => /^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(row.value) && collectionCaptures[row.captureIndex]?.provider === row.provider && !collectionCaptures[row.captureIndex]?.truncated)) continue;
    return peers.map(id => matches.find(row => row.productId === id)!);
  }
  return [];
}

export function buildResearchAutomationReport(input: AutomationReportInput, kind: 'MARKET' | 'INSIGHT'): { semantic: object; html: Buffer } {
  if (input.run.runId !== input.scope.runId || input.run.workspaceId !== input.start.workspaceId || input.run.workspaceId !== input.scope.workspaceId) throw new Error('Report lineage mismatch');
  const evidence = peerEvidence(input);
  const prefix = kind === 'MARKET' ? 'M' : 'I';
  const contextSections = kind === 'MARKET' ? ['M02', 'M13'] : ['I01', 'I03', 'I17'];
  const sections: DraftSection[] = catalog.sections.filter(section => section.sectionId.startsWith(prefix)).map(section => {
    if (contextSections.includes(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_CONTEXT', method: 'automation-source-context-v1', rows: [],
      explanation: section.sectionId === 'I01' ? 'Brief do hệ thống ghi lại từ phạm vi đã xác nhận; không phải nhận định AI hay insight đã duyệt.' : 'Phạm vi yêu cầu, độ phủ thực tế và dấu vết nguồn của lượt này. Không thay thế phương pháp tính chuyên biệt của từng mục.',
    };
    if (section.sectionId === 'M07' && evidence.length > 0) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_TABLE', method: 'automation-explicit-peer-evidence-v1', rows: evidence,
      explanation: 'Bảng quan sát cho nhóm sản phẩm đối chiếu được chọn rõ ràng, cùng nguồn, đơn vị và kỳ đo. Không đại diện toàn thị trường; chưa thực hiện đầy đủ phương pháp M07.',
    };
    return { sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [], explanation: `Chưa có bộ đầu vào đã xác minh và kết quả phương pháp cho mục này. Cần: ${section.requiredInputs.map(id => inputLabels[id] ?? id).join(', ')}. Không suy diễn từ ảnh chụp sản phẩm hoặc kết quả tìm kiếm.` };
  });
  const semantic = {
    contractVersion: 'research-automation-report-v1', rendererVersion: 'automation-report-kit-v1', kind, state: 'PARTIAL_UNREVIEWED_DRAFT',
    runId: input.run.runId, workspaceId: input.run.workspaceId, createdAt: input.run.createdAt,
    keyword: input.start.keyword, country: input.start.country, requestedPeriod: input.start.requestedPeriod,
    scope: input.scope, scopeApplication: 'OWNER_CONTEXT_ONLY_SOURCE_FILTER_MAPPING_PENDING', coverage: input.run.coverage, usage: input.run.usage,
    collectionOutcome: input.collection?.outcome ?? null, limitations: input.collection?.limitations ?? [],
    captures: input.captures, sections,
  };
  const title = kind === 'MARKET' ? 'Báo cáo thị trường' : 'Báo cáo insight';
  const period = `${input.start.requestedPeriod.startDate} đến ${input.start.requestedPeriod.endDate} · ${input.start.requestedPeriod.dayCount} ngày`;
  const sourceTable = `<div class="table-wrap"><table><thead><tr><th>Nguồn / thao tác</th><th>Kỳ quan sát</th><th>Thu thập lúc</th><th>Dấu vết</th></tr></thead><tbody>${input.captures.map(capture => `<tr><td>${escape(capture.provider)}<br>${escape(capture.operation)}</td><td>${capture.window ? escape(`${capture.window.startDate} — ${capture.window.endDate}`) : 'Không có kỳ đo đã xác minh'}</td><td>${escape(capture.retrievedAt)}</td><td><code>${escape(capture.artifactSha256)}</code>${capture.truncated ? '<br>Bản thu bị cắt; không dùng để tính' : ''}</td></tr>`).join('') || '<tr><td colspan="4">Chưa có bản thu nguồn.</td></tr>'}</tbody></table></div>`;
  const scope = `<dl><dt>Thị trường</dt><dd>Việt Nam</dd><dt>Định nghĩa đã xác nhận</dt><dd>${escape(input.scope.definition)}</dd><dt>Kỳ báo cáo yêu cầu</dt><dd>${escape(period)}</dd><dt>Điều kiện bao gồm</dt><dd>${escape(input.scope.includeTerms.join(', ') || 'Không thêm điều kiện')}</dd><dt>Điều kiện loại trừ</dt><dd>${escape(input.scope.excludeTerms.join(', ') || 'Không thêm điều kiện')}</dd></dl><p class="warning">Điều kiện trên là ý định nghiên cứu đã lưu. Chưa xác nhận các truy vấn nguồn áp dụng đầy đủ điều kiện này; chưa phân loại CORE/WIDE. Kỳ yêu cầu không chứng minh mọi nguồn có đủ dữ liệu trong kỳ này. Kết quả tìm kiếm hiện tại và danh sách top sản phẩm không phải tổng doanh số thị trường.</p>`;
  const body = sections.map(section => `<section class="sheet" id="${section.sectionId}"><header class="sh-head"><div><span class="sh-id">${section.sectionId}</span><h2>${escape(section.title)}</h2></div><span class="state">${section.state === 'BLOCKED' ? 'Chưa đủ dữ liệu / phương pháp' : section.state === 'SOURCE_TABLE' ? 'Bảng bằng chứng · Chưa duyệt' : 'Ngữ cảnh nguồn · Chưa duyệt'}</span></header><p>${escape(section.explanation)}</p>${section.state === 'SOURCE_CONTEXT' ? scope : ''}${section.sectionId === 'M13' || section.sectionId === 'I17' ? sourceTable : ''}${section.rows.length ? `<div class="table-wrap"><table><thead><tr><th>Sản phẩm nguồn</th><th>Phép đo / đơn vị</th><th>Giá trị nguồn</th><th>Kỳ đo</th></tr></thead><tbody>${section.rows.map(row => `<tr><td>${escape(row.productId)}</td><td>${escape(row.provider)} · ${escape(row.metric)}</td><td>${escape(row.value)}</td><td>${escape(row.window.startDate)} — ${escape(row.window.endDate)}</td></tr>`).join('')}</tbody></table></div>` : ''}<p><small>Phương pháp: ${escape(section.method)}</small></p></section>`).join('');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><title>${escape(title)} · ${escape(input.start.keyword)}</title><style>${reportKitFontCss()}\n${REPORT_KIT_CSS}\n.sheet{break-before:page}.sheet h2{font-size:26px}.state{font-size:12px;color:var(--warn-ink)}.warning{padding:12px;background:var(--warn-bg);color:var(--warn-ink)}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px}dt{font-weight:700}dd{margin:0}.table-wrap{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:10px;text-align:left;border:1px solid var(--bd);vertical-align:top}code{word-break:break-all}@media(max-width:600px){dl{grid-template-columns:1fr}.sheet{padding:20px}.cover{display:block}.cv-right{background:var(--blue);padding:24px}.cv-left{padding:24px}}@media print{@page{size:A4;margin:14mm}body{background:white}main{padding:0}.cover{min-height:240mm}.sheet{padding:16px 0;border:0;break-inside:auto}.sheet:after{display:none}.table-wrap{overflow:visible}tr{break-inside:avoid}thead{display:table-header-group}.jump{display:none}}</style></head><body><a class="skip" href="#sections">Đến nội dung báo cáo</a><main><section class="cover"><div class="cv-left"><div class="brand"><i></i><b>TDN GROWTH OS</b></div><div><p class="cv-eyebrow">Bản nháp từ nguồn · Chưa được duyệt</p><h1>${escape(title)}</h1><h2>${escape(input.start.keyword)}</h2><p class="cv-lede">Hai lớp tách biệt: dữ liệu đã thu và những điều chưa đủ bằng chứng.</p></div><div class="cv-meta"><b>Việt Nam</b><span>${escape(period)}</span><span>Chỉ ${sections.filter(section => section.state !== 'BLOCKED').length}/${sections.length} mục có ngữ cảnh hoặc bảng nguồn; không tuyên bố báo cáo hoàn chỉnh.</span></div></div><nav class="cv-right" aria-label="Mục lục"><h2>Nội dung</h2><ul class="toc">${sections.map(section => `<li><a href="#${section.sectionId}"><em>${section.sectionId}</em>${escape(section.title)}</a></li>`).join('')}</ul></nav></section><div id="sections">${body}</div><footer><p>Không có nhận định AI hoặc quyết định kinh doanh tự động trong bản nháp này. Không có dữ liệu không đồng nghĩa với giá trị bằng 0.</p></footer></main></body></html>`;
  return { semantic, html: Buffer.from(html, 'utf8') };
}
