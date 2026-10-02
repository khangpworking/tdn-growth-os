import fs from 'node:fs';
import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import { reviewCorpusSection } from './review-corpus-report.js';
import type { AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import { marketInventorySection } from './market-inventory-report.js';
import type { ResearchAutomationRun } from '../../../../contracts/api/research-automation-api.generated.js';
import { REPORT_KIT_CSS } from '../report-kit-theme.js';
import { reportKitFontCss } from '../report-kit-fonts.js';
import { describeDescriptiveSection, descriptiveAppendix, escapeHtml, isDescriptiveSectionId, type DescriptiveSectionView } from './descriptive-report.js';
import type { CaptureRecord, ScopeSnapshot, StartSnapshot, StepResultDocument, TypedComparable } from './model.js';

export interface AutomationReportInput {
  readonly run: ResearchAutomationRun;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
  /** Produced and verified by the production service; absent for runs without a connected descriptive method. */
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly descriptiveMethodFailure?: 'DESCRIPTIVE_METHOD_FAILED';
  readonly reviewCorpus?: ResearchReviewCorpus;
  readonly reviewCorpusFailure?: 'REVIEW_CORPUS_FAILED' | 'REVIEW_CORPUS_REPORT_TOO_LARGE';
  readonly marketInventory?: AutomationMarketMethodSnapshot;
  readonly marketInventoryFailure?: 'MARKET_INVENTORY_FAILED';
}
interface CatalogSection { sectionId: string; title: string; methodId: string; methodVersion: string; requiredInputs: string[] }
interface MethodOutputRef { methodOutputId: string; locatedRecordCount: number; unresolvedPointers: readonly string[]; blockers: readonly string[] }
interface DraftSection { sectionId: string; title: string; state: 'SOURCE_CONTEXT' | 'SOURCE_TABLE' | 'METHOD_OUTPUT' | 'METHOD_NO_USABLE_RECORDS' | 'BLOCKED'; method: string; explanation: string; rows: readonly TypedComparable[]; methodOutput?: MethodOutputRef }
const catalog = JSON.parse(fs.readFileSync(new URL('../../../../docs/research/report-section-catalog-v1.json', import.meta.url), 'utf8')) as { sections: CatalogSection[] };
const escape = escapeHtml;
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
  return `<div class="table-wrap"><table class="observations"><caption>Giá trị nguồn theo từng sản phẩm và kỳ truy vấn. Không phải tổng thị trường.</caption><thead><tr><th>Sản phẩm nguồn</th><th>Phép đo / đơn vị</th><th>Giá trị nguồn</th><th>Kỳ đo</th><th>Bản thu nguồn</th></tr></thead><tbody>${rows.map(row => `<tr><td>${escape(row.productId)}</td><td>${escape(row.provider)} · ${escape(row.metric)}</td><td>${escape(row.value)}</td><td>${escape(row.window.startDate)} đến ${escape(row.window.endDate)}</td><td><code>${escape(captures.get(row.captureIndex)!.artifactSha256)}</code></td></tr>`).join('')}</tbody></table></div>`;
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
  const captures = collectionCaptureMap(input);
  const evidence = peerEvidence(input, captures);
  const observations = observedRows(input, captures);
  const prefix = kind === 'MARKET' ? 'M' : 'I';
  const contextSections = kind === 'MARKET' ? ['M02', 'M13'] : ['I01', 'I03', 'I17'];
  const descriptive = kind === 'MARKET' ? input.descriptiveMethods : undefined;
  const views = new Map<string, DescriptiveSectionView>();
  const sections: DraftSection[] = catalog.sections.filter(section => section.sectionId.startsWith(prefix)).map(section => {
    if (kind === 'MARKET' && input.marketInventory && (section.sectionId === 'M03' || section.sectionId === 'M08')) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_TABLE', rows: [],
      method: section.sectionId === 'M03' ? 'source-compatible-temporal-v1@1.0.0' : 'generic-quote-unit-v1@1.0.0',
      explanation: 'Phương pháp đã lập inventory từ nguồn đã lưu; các phép tính vẫn bị chặn vì thiếu điều kiện nguồn. Chưa phải kết quả phân tích hoàn chỉnh.',
    };
    if (contextSections.includes(section.sectionId)) return {
      sectionId: section.sectionId, title: section.title, state: 'SOURCE_CONTEXT', method: 'automation-source-context-v1', rows: section.sectionId === 'M13' ? observations : [],
      explanation: section.sectionId === 'I01' ? 'Brief do hệ thống ghi lại từ phạm vi đã xác nhận; không phải nhận định AI hay insight đã duyệt.' : 'Phạm vi yêu cầu, độ phủ thực tế và dấu vết nguồn của lượt này. Không thay thế phương pháp tính chuyên biệt của từng mục.',
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
    return { sectionId: section.sectionId, title: section.title, state: 'BLOCKED', method: `${section.methodId}@${section.methodVersion}`, rows: [], explanation: `Chưa nối phương pháp của mục này vào luồng tự động. Đầu vào còn phải được kiểm tra theo hợp đồng: ${section.requiredInputs.map(id => inputLabels[id] ?? id).join(', ')}. Số liệu sản phẩm đã thu được giữ trong phụ lục báo cáo thị trường; không đủ để tự suy ra quy mô thị trường hoặc insight khách hàng.` };
  });
  const ids = (state: DraftSection['state']): string[] => sections.filter(section => section.state === state).map(section => section.sectionId);
  const completion = {
    completedAnalyticalSections: 0,
    boundedMethodOutputSections: ids('METHOD_OUTPUT').length, boundedMethodOutputSectionIds: ids('METHOD_OUTPUT'),
    boundedMethodNoUsableRecordSectionIds: ids('METHOD_NO_USABLE_RECORDS'),
    contextSections: ids('SOURCE_CONTEXT').length, sourceTableSections: ids('SOURCE_TABLE').length, blockedSections: ids('BLOCKED').length,
  };
  const semantic = {
    contractVersion: 'research-automation-report-v1', rendererVersion: 'automation-report-kit-v4', kind, state: 'PARTIAL_UNREVIEWED_DRAFT',
    runId: input.run.runId, workspaceId: input.run.workspaceId, createdAt: input.run.createdAt,
    keyword: input.start.keyword, country: input.start.country, requestedPeriod: input.start.requestedPeriod,
    scope: input.scope, scopeApplication: 'OWNER_CONTEXT_ONLY_SOURCE_FILTER_MAPPING_PENDING', coverage: input.run.coverage, usage: input.run.usage,
    collectionOutcome: input.collection?.outcome ?? null, limitations: input.collection?.limitations ?? [],
    captures: input.captures, sections, ...(kind === 'INSIGHT' ? { reviewCorpus: input.reviewCorpus ?? null, ...(input.reviewCorpusFailure ? { reviewCorpusFailure: input.reviewCorpusFailure } : {}) } : {}), ...(kind === 'MARKET' ? { marketInventory: input.marketInventory ?? null, ...(input.marketInventoryFailure ? { marketInventoryFailure: input.marketInventoryFailure } : {}), descriptiveMethods: input.descriptiveMethods ?? null,
      ...(input.descriptiveMethodFailure ? { descriptiveMethodFailure: input.descriptiveMethodFailure } : {}) } : {}), completion,
  };
  const title = kind === 'MARKET' ? 'Báo cáo thị trường' : 'Báo cáo insight';
  const period = `${input.start.requestedPeriod.startDate} đến ${input.start.requestedPeriod.endDate} · ${input.start.requestedPeriod.dayCount} ngày`;
  const sourceTable = `<p>Kỳ truy vấn là khoảng ngày đã gửi tới nguồn, không chứng minh đã thu đủ dữ liệu.</p><div class="table-wrap"><table><thead><tr><th>Nguồn / thao tác</th><th>Kỳ truy vấn</th><th>Lượt gọi kết thúc</th><th>Dấu vết</th></tr></thead><tbody>${input.captures.map(capture => `<tr><td>${escape(capture.provider)}<br>${escape(capture.operation)}</td><td>${capture.window ? escape(`${capture.window.startDate} đến ${capture.window.endDate}`) : 'Không áp dụng kỳ truy vấn'}</td><td>${escape(capture.retrievedAt)}</td><td><code>${escape(capture.artifactSha256)}</code>${capture.truncated ? '<br>Bản thu bị cắt; không dùng để tính' : ''}</td></tr>`).join('') || '<tr><td colspan="4">Chưa có bản thu nguồn.</td></tr>'}</tbody></table></div>`;
  const scope = `<dl><dt>Thị trường</dt><dd>Việt Nam</dd><dt>Định nghĩa đã xác nhận</dt><dd>${escape(input.scope.definition)}</dd><dt>Kỳ báo cáo yêu cầu</dt><dd>${escape(period)}</dd><dt>Điều kiện bao gồm</dt><dd>${escape(input.scope.includeTerms.join(', ') || 'Không thêm điều kiện')}</dd><dt>Điều kiện loại trừ</dt><dd>${escape(input.scope.excludeTerms.join(', ') || 'Không thêm điều kiện')}</dd></dl><p class="warning">Điều kiện trên là ý định nghiên cứu đã lưu. Chưa xác nhận các truy vấn nguồn áp dụng đầy đủ điều kiện này; chưa phân loại CORE/WIDE. Kỳ yêu cầu không chứng minh mọi nguồn có đủ dữ liệu trong kỳ này. Kết quả tìm kiếm hiện tại và danh sách top sản phẩm không phải tổng doanh số thị trường.</p>`;
  const stateLabel: Readonly<Record<DraftSection['state'], string>> = {
    BLOCKED: 'Chưa đủ dữ liệu / phương pháp', SOURCE_TABLE: 'Bảng bằng chứng · Chưa duyệt', SOURCE_CONTEXT: 'Ngữ cảnh nguồn · Chưa duyệt',
    METHOD_OUTPUT: 'Kết quả phương pháp mô tả · Chưa phải phân tích hoàn chỉnh', METHOD_NO_USABLE_RECORDS: 'Phương pháp đã chạy · Không có bản ghi dùng được',
  };
  const methodIds = completion.boundedMethodOutputSectionIds;
  const emptyIds = completion.boundedMethodNoUsableRecordSectionIds;
  const headline = [
    kind === 'MARKET' && input.descriptiveMethodFailure ? 'Chưa tính được các mục mô tả thị trường vì đầu vào hoặc phương pháp không vượt qua kiểm tra. Bản nháp này chỉ giữ ngữ cảnh và dấu vết nguồn. Cần kiểm tra lỗi trước khi tạo phiên bản mới; không tự động gọi lại nguồn.' : '',
    `Mục phân tích hoàn chỉnh: ${completion.completedAnalyticalSections}.`,
    kind === 'MARKET' ? descriptive ? `Kết quả phương pháp mô tả có giới hạn, chưa duyệt: ${methodIds.length} mục${methodIds.length ? ` (${methodIds.join(', ')})` : ''}.` : input.descriptiveMethodFailure ? '' : 'Phương pháp mô tả thị trường chưa được nối vào lượt này.' : '',
    emptyIds.length ? `Phương pháp đã chạy nhưng không có bản ghi dùng được: ${emptyIds.join(', ')}.` : '',
    `Ngữ cảnh hoặc bảng nguồn: ${completion.contextSections + completion.sourceTableSections} mục. Chưa có kết quả: ${completion.blockedSections + emptyIds.length} mục.`,
    'Ngữ cảnh, bảng nguồn, kết quả phương pháp từng phần và tệp PDF không đồng nghĩa với phân tích hoàn chỉnh.',
  ].filter(Boolean).join(' ');
  const appendix = (sectionId: string): string => {
    if (kind === 'MARKET' && (sectionId === 'M03' || sectionId === 'M08')) {
      if (input.marketInventory) return marketInventorySection(input.marketInventory, sectionId);
      if (input.marketInventoryFailure) return '<p class="warning">Đã thử xử lý inventory nhưng nguồn hoặc phương pháp không vượt qua kiểm tra. Mã MARKET_INVENTORY_FAILED; không tự gọi lại nguồn.</p>';
    }
    if (kind === 'MARKET' && sectionId === 'M13') return descriptiveAppendix(descriptive, input.descriptiveMethodFailure);
    if (kind === 'INSIGHT' && (sectionId === 'I03' || sectionId === 'I17')) {
      if (input.reviewCorpus) return reviewCorpusSection(input.reviewCorpus, sectionId);
      if (input.reviewCorpusFailure === 'REVIEW_CORPUS_REPORT_TOO_LARGE') return '<p class="warning">Collection gốc vẫn được giữ đầy đủ nhưng phần quote vượt giới hạn kích thước báo cáo. Mã REVIEW_CORPUS_REPORT_TOO_LARGE; chưa đưa quote vào bản này, không cắt ngắn dữ liệu hoặc tự thu lại. Cần xuất phần bằng chứng theo trang ở bước xử lý tiếp theo.</p>';
      if (input.reviewCorpusFailure) return '<p class="warning">Đã lưu collection nhưng corpus không vượt qua kiểm tra. Cần kiểm tra REVIEW_CORPUS_FAILED; không tự thu lại và không dùng dữ liệu chưa xác minh.</p>';
      return '<p>Chưa có corpus review gắn với lượt này. Thêm link Shopee chính xác ở bước duyệt phạm vi của lượt mới, rồi kiểm tra trạng thái nguồn. Không thay bằng review của sản phẩm gần giống.</p>';
    }
    return '';
  };
  const body = `<p class="warning">${escape(headline)}</p>` + sections.map(section => `<section class="sheet" id="${section.sectionId}"><header class="sh-head"><div><span class="sh-id">${section.sectionId}</span><h2>${escape(section.title)}</h2></div><span class="state">${escape(stateLabel[section.state])}</span></header><p>${escape(section.explanation)}</p>${section.state === 'METHOD_OUTPUT' || section.state === 'METHOD_NO_USABLE_RECORDS' ? views.get(section.sectionId)!.html : ''}${section.state === 'SOURCE_CONTEXT' ? scope : ''}${section.sectionId === 'M13' || section.sectionId === 'I17' ? sourceTable : ''}${observationTable(section.rows, captures)}${appendix(section.sectionId)}<p><small>Phương pháp: ${escape(section.method)}</small></p></section>`).join('');
  const html = `<!doctype html><html lang="vi"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'"><title>${escape(title)} · ${escape(input.start.keyword)}</title><style>${reportKitFontCss()}\n${REPORT_KIT_CSS}\n.sheet{break-before:page}.sheet h2{font-size:26px}.state{font-size:12px;color:var(--warn-ink)}.warning{padding:12px;background:var(--warn-bg);color:var(--warn-ink)}dl{display:grid;grid-template-columns:180px minmax(0,1fr);gap:8px}dt{font-weight:700}dd{margin:0}.table-wrap{overflow-x:auto}.table-wrap table{min-width:720px}table{width:100%;border-collapse:collapse;font-size:12px}td,th{padding:10px;text-align:left;border:1px solid var(--bd);vertical-align:top}code{word-break:break-all}@media(max-width:600px){dl{grid-template-columns:1fr}.sheet{padding:20px}.cover{display:block}.cv-right{background:var(--blue);padding:24px}.cv-left{padding:24px}}@media print{@page{size:A4;margin:14mm}body{background:white}main{padding:0}.cover{min-height:240mm}.sheet{padding:16px 0;border:0;break-inside:auto}.sheet:after{display:none}.table-wrap{overflow:visible}.table-wrap table{min-width:0}tr{break-inside:avoid}thead{display:table-header-group}.jump{display:none}}</style></head><body><a class="skip" href="#sections">Đến nội dung báo cáo</a><main><section class="cover"><div class="cv-left"><div class="brand"><i></i><b>TDN GROWTH OS</b></div><div><p class="cv-eyebrow">Bản nháp từ nguồn · Chưa được duyệt</p><h1>${escape(title)}</h1><h2>${escape(input.start.keyword)}</h2><p class="cv-lede">Hai lớp tách biệt: dữ liệu đã thu và những điều chưa đủ bằng chứng.</p></div><div class="cv-meta"><b>Việt Nam</b><span>${escape(period)}</span><span>Chỉ ${sections.filter(section => section.state === 'SOURCE_CONTEXT' || section.state === 'SOURCE_TABLE' || section.state === 'METHOD_OUTPUT').length}/${sections.length} mục có ${kind === 'MARKET' ? 'kết quả phương pháp mô tả, ' : ''}ngữ cảnh hoặc bảng nguồn; không tuyên bố báo cáo hoàn chỉnh.</span></div></div><nav class="cv-right" aria-label="Mục lục"><h2>Nội dung</h2><ul class="toc">${sections.map(section => `<li><a href="#${section.sectionId}"><em>${section.sectionId}</em>${escape(section.title)}</a></li>`).join('')}</ul></nav></section><div id="sections">${body}</div><footer><p>Không có nhận định AI hoặc quyết định kinh doanh tự động trong bản nháp này. Không có dữ liệu không đồng nghĩa với giá trị bằng 0.</p></footer></main></body></html>`;
  return { semantic, html: Buffer.from(html, 'utf8') };
}
