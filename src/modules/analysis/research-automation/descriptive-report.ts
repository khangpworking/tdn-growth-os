import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import { containsForbiddenProviderName, containsTechnicalId, type CitationInput } from '../citation-registry.js';
import { formatReaderCount, formatReaderValue as formatReaderPlainValue, readerDateBasis as readerPlainDateBasis, readerLocator, readerMeasureName as readerPlainMeasureName, readerProductLabel, readerScopeText as readerPlainScopeText, readerStoredOrJson as readerPlainStoredOrJson, readerTextSafe } from './reader-plain-text.js';

type Input = DescriptiveMarketMethods['input'];
type Observation = Input['m05'][number];
type Ref = Observation['source'];
type Partition = DescriptiveMarketMethods['sections']['M05']['partitions'][number];
export type DescriptiveSectionId = 'M05' | 'M06' | 'M07' | 'M09';

/** Display context from the report, deliberately outside the hash-bound method input. */
export interface DescriptiveReaderContext {
  readonly productLabels?: ReadonlyMap<string, string>;
  readonly requestedPeriod?: { readonly startDate: string; readonly endDate: string };
  /** The report already prints the per-period rows of the selected products in Phần 3, so M05 points there instead of repeating them. */
  readonly periodRowsInM03?: boolean;
}

/** Rendering of one bounded method section. `usable` means a resolved record carries a source-stated value or event, not that the section is complete. */
export interface DescriptiveSectionView {
  readonly usable: boolean;
  readonly locatedRecordCount: number;
  readonly unresolvedPointers: readonly string[];
  readonly blockers: readonly string[];
  readonly html: string;
}

export const escapeHtml = (value: unknown): string => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
const escape = escapeHtml;

/** Reader text never names a provider and never carries a digest; those tokens stay in the retained source. */
export const readerSafe = (text: string): boolean => readerTextSafe(text);

/** Stored literals of the retained package are reader text only while they stay clean; otherwise the part is withheld. */
const WITHHELD = {
  entity: 'đối tượng được giữ trong bản lưu nguồn', wording: 'lời nguồn được giữ trong bản lưu', measure: 'thước đo được giữ trong bản lưu',
  status: 'trạng thái được giữ trong bản lưu', person: 'người nêu được giữ trong bản lưu', basis: 'cơ sở được giữ trong bản lưu',
} as const;
let activeReaderPlainText = false;
const readerCount = (value: string | number): string => formatReaderCount(value) ?? 'chưa rõ';
const displayCount = (value: string | number, readerPlainText = activeReaderPlainText): string => readerPlainText ? readerCount(value) : String(value);
const readerMeasureName = (field: string | null | undefined): string => activeReaderPlainText ? readerPlainMeasureName(field) : storedLiteral(field ?? '', WITHHELD.measure);
const readerStoredOrJson = (value: string | null | undefined, withheld: string): string => activeReaderPlainText ? readerPlainStoredOrJson(value, withheld) : value === null || value === undefined ? withheld : storedLiteral(value, withheld);
const readerStoredOrJsonHtml = (value: string | null | undefined, withheld: string): string => activeReaderPlainText
  ? escape(readerPlainStoredOrJson(value, withheld))
  : readerStoredOrJson(value, withheld);
const readerDateBasis = (value: string): string => activeReaderPlainText ? readerPlainDateBasis(value) : value;
const readerScopeText = (value: string | null | undefined, fallback: string): string => activeReaderPlainText ? readerPlainScopeText(value, fallback) : value !== null && value !== undefined && readerSafe(value) ? value : fallback;
const formatReaderValue = (value: string | null | undefined, options: { readonly measure?: string | undefined; readonly unit?: string | null | undefined; readonly currency?: string | null | undefined } = {}): string | null => formatReaderPlainValue(value, options);
const legacySafe = (text: string): boolean => !containsForbiddenProviderName(text) && !containsTechnicalId(text)
  && !/\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/.test(text);
export const storedLiteral = (value: string, withheld: string, readerPlainText = activeReaderPlainText): string => readerPlainText
  ? (readerSafe(value) ? escape(value) : withheld)
  : (legacySafe(value) ? escape(value) : withheld);

/** Technical codes and digests may be displayed in disclosures; provider identity remains in the semantic artifact. */
export const technicalLiteral = (value: string): string => containsForbiddenProviderName(value)
  ? 'Thông tin kỹ thuật được giữ trong bản lưu nguồn' : escape(value);

/** Omit an unsafe quotation as a whole; never rewrite it and present replacement words as source evidence. */
export const retainedQuoteHtml = (value: string, tag: 'q' | 'blockquote' = 'q'): string => readerSafe(value)
  ? `<${tag} style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(value)}</${tag}>`
  : '<span class="source-withheld">Nguyên văn được giữ trong bản lưu nguồn; không đưa vào bản đọc này.</span>';

/** A renderer projection may omit a provider-bearing machine dump; its original object remains in the semantic artifact. */
export function retainedEvidenceHtml(value: unknown): string {
  const serialized = JSON.stringify(value, null, 2) ?? 'null';
  return containsForbiddenProviderName(serialized)
    ? '<p>Hồ sơ kỹ thuật đầy đủ được giữ nguyên trong bản lưu nguồn; không đưa tên nhà cung cấp vào bản đọc.</p>'
    : `<pre style="white-space:pre-wrap;overflow-wrap:anywhere">${escape(serialized)}</pre>`;
}

/** A stored attribution is a sentence from the retained package; one that names the provider loses the sentence. */
export const attributionText = (value: string | null | undefined, fallback: string): string =>
  value === null || value === undefined ? fallback : storedLiteral(value, 'Ghi nhận nguồn được giữ trong bản lưu');

/**
 * How one report build numbers its sources. Every section renderer shares the
 * single instance owned by `buildResearchAutomationReport`, so `[n]` follows the
 * first appearance on the page and the register matches the marks exactly.
 */
export interface ReportCitations {
  /** New source-policy renderer only; default preserves historical method wording. */
  readonly distinctEntityWording?: boolean;
  /** Opt-in reader projection; false preserves the saved renderer bytes. */
  readonly readerPlainText?: boolean;
  /** The `[n]` mark for this source, or "Chưa có nguồn" when it has no lineage. */
  mark(input: CitationInput): string;
}

/** A source pointer is shown to the reader only when it is a plain JSON pointer or a spreadsheet cell. */
const READER_POINTER = /^(?:\/(?:[^/\r\n]+)(?:\/[^/\r\n]+)*|[^!\r\n]+!\$?[A-Z]{1,3}\$?[1-9][0-9]*(?::\$?[A-Z]{1,3}\$?[1-9][0-9]*)?)$/;
/**
 * Splits a raw source pointer into a reader locator and its technical form: a
 * path or a pointer carrying a digest becomes a neutral phrase, and the raw
 * pointer stays in the technical trace only.
 */
export function readerPointer(pointer: string | null, readerPlainText = false): { locator: string | null; technical: string | null } {
  if (pointer === null || pointer === '') return { locator: null, technical: null };
  const safe = readerPlainText ? readerSafe(pointer) : legacySafe(pointer);
  return safe && READER_POINTER.test(pointer)
    ? { locator: readerPlainText ? readerLocator(pointer) : pointer, technical: pointer }
    : { locator: 'vị trí trong nguồn', technical: pointer };
}

/** Native and located review renderers cite the retained source record, never the coding overlay. */
export function reviewRecordMark(record: { sourceSha256: string; locator: string | null }, citations: ReportCitations): string {
  const pointer = readerPointer(record.locator, citations.readerPlainText !== false);
  return citations.mark({ sourceKind: 'REVIEW', identity: record.sourceSha256.trim() === '' ? null : record.sourceSha256,
    locator: pointer.locator, label: 'Đánh giá khách hàng trên Shopee', retrievedAt: null, url: null,
    quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { sourceSha256: record.sourceSha256, ...(pointer.technical === null ? {} : { locator: pointer.technical }) } });
}
const tag = (text: string, kind = ''): string => `<span class="tag${kind ? ` ${kind}` : ''}">${escape(text)}</span>`;

/** A source member key is `<provider>:<local id>`; only the source-local id is reader text. */
export const sourceMemberLabel = (key: string, readerPlainText = false): string => {
  const separator = key.indexOf(':');
  const local = separator > 0 ? key.slice(separator + 1) : key;
  return (readerPlainText ? readerSafe(local) && !local.includes('_') : legacySafe(local)) ? local : 'Đối tượng được giữ trong bản lưu nguồn';
};
export const isDescriptiveSectionId = (id: string): id is DescriptiveSectionId => id === 'M05' || id === 'M06' || id === 'M07' || id === 'M09';

const BLOCKER_TEXT: Readonly<Record<string, string>> = {
  NO_LOCATED_RECORDS: 'Chưa có bản ghi nguồn được định vị.', PERIOD_MISSING: 'Thiếu kỳ quan sát.', UNIT_MISSING: 'Thiếu đơn vị.',
  ADDITIVITY_UNDECLARED: 'Nguồn chưa khai báo các thành viên có thể cộng dồn.', AGGREGATION_OVERLAP_UNRESOLVED: 'Các thành viên có thể chồng lấn và chưa được giải quyết.',
  AGGREGATION_FRAME_INCOMPATIBLE: 'Khung đo của các thành viên không tương thích để cộng.', MEMBERSHIP_INCOMPLETE: 'Danh sách thành viên bắt buộc chưa đầy đủ.',
  VALUE_MISSING: 'Thiếu giá trị ở một số dòng.', VALUE_UNKNOWN: 'Có giá trị UNKNOWN.', NON_EXACT_VALUE: 'Có giá trị không chính xác tuyệt đối.',
  M07_PEER_SET_UNAPPROVED: 'Chưa có nhóm đối thủ do người dùng khai báo.', M07_IDENTITY_UNRESOLVED: 'Chưa xác định được bản ghi của mốc hoặc đối thủ.',
  M07_PERIOD_INCOMPATIBLE: 'Kỳ quan sát không tương thích.', M07_UNIVERSE_OR_MEASURE_INCOMPATIBLE: 'Phạm vi hoặc thước đo không tương thích.',
  M07_FROZEN_SALES_GROUP_MEMBERSHIP_REQUIRED: 'Chưa có thành viên doanh số đã phân loại tương thích để chọn đối thủ mặc định.',
  M09_EVENT_DATE_UNKNOWN: 'Chưa rõ ngày của sự kiện.', M09_ENTITY_LINK_UNRESOLVED: 'Chưa liên kết sự kiện với đúng đối tượng.',
  M09_COUNTEREVIDENCE_CONFLICT: 'Có bằng chứng ngược chưa được giải quyết.',
};
const READER_BLOCKER_TEXT: Readonly<Record<string, string>> = { ...BLOCKER_TEXT, VALUE_UNKNOWN: 'Có giá trị chưa rõ.' };
const LIMITATION_TEXT: Readonly<Record<string, string>> = {
  NORMALIZED_SOURCE_DECLARATIONS_NOT_PROVIDER_AUTHENTICATION: 'Khai báo đã chuẩn hóa từ nguồn; không xác thực nhà cung cấp.',
  EXACT_PACKAGE_BYTES_AND_LOCATORS_REQUIRE_CALLER_VERIFICATION: 'Bytes gói nguồn và vị trí bằng chứng phải được kiểm tra ở lớp gọi phương pháp.',
  SOURCE_WORDING_IS_ATTRIBUTED_INERT_TEXT_NOT_A_CONCLUSION: 'Lời trong nguồn được trích và quy cho nguồn; không phải kết luận.',
  M05_LITERAL_SOURCE_MEASURES_NOT_DEMAND_OR_MARKET_SIZE: 'M05 giữ đúng thước đo của nguồn; không phải nhu cầu hay quy mô thị trường.',
  M05_ESTIMATED_SALES_IN_SAMPLE_DEMAND_PER_PLATFORM_SEARCH_SEPARATE: 'Nhu cầu, đo bằng doanh số (ước tính) trong mẫu; giữ kỳ, nguồn và từng sàn. Mức quan tâm tìm kiếm ghi riêng. Số ước tính chưa đối chiếu với người bán, chỉ dùng tham khảo. Không suy ra quy mô ngoài mẫu, số người mua, nhu cầu chưa được đáp ứng hay dự báo.',
  SUBTOTAL_COMPLETENESS_ONLY_FOR_DECLARED_SOURCE_MEMBER_FRAME: 'Tổng chỉ đầy đủ trong khung thành viên do nguồn khai báo.',
  M06_LOCATED_RECORDS_NOT_UNIQUE_ENTITIES_STOCK_OR_TOTAL_SUPPLY: 'M06 đếm bản ghi; không phải đối tượng duy nhất, tồn kho hay toàn bộ nguồn cung.',
  M07_OWNER_DECLARED_SIDE_BY_SIDE_NO_RANK_SCORE_DIFFERENCE_OR_RATIO: 'M07 chỉ đặt cạnh nhau nhóm đã khai báo; không xếp hạng, chấm điểm, tính chênh lệch hay tỷ lệ.',
  M07_DEFAULT_PEERS_FROM_RETAINED_CLASSIFIED_SALES_OR_EXPLICIT_GAP_OWNER_ADDITIONS_SEPARATE: 'Đối thủ mặc định chỉ được chọn từ doanh thu cùng nhóm, kỳ và khung nguồn đã phân loại. Phần thiếu giữ nguyên; bổ sung của chủ được giữ riêng.',
  M09_ATTRIBUTED_EVENT_INVENTORY_NOT_CAUSAL_IMPACT_OR_FORECAST: 'M09 là danh mục sự kiện có nguồn; không phải tác động nhân quả hay dự báo.',
  NO_RATE_POPULATION_INFERENCE_OR_MARKET_SHARE: 'Không suy ra tỷ lệ, tổng thể hay thị phần.',
  UNREVIEWED_BOUNDED_METHOD_OUTPUT_NOT_COMPLETE_SECTION: 'Kết quả phương pháp có giới hạn, chưa duyệt; không phải mục hoàn chỉnh.',
};
const PROVENANCE_TEXT: Readonly<Record<Input['sources'][number]['providerProvenance'], string>> = {
  verified: 'Đã xác minh', provider_reported: 'Nhà cung cấp tự báo', operator_supplied_unverified: 'Người vận hành cung cấp, chưa xác minh', synthetic: 'Dữ liệu giả lập dùng kiểm thử',
};
/** Stored provenance values never reach reader text raw; an unknown value stays withheld. */
export const providerProvenanceLabel = (value: string): string =>
  (PROVENANCE_TEXT as Readonly<Record<string, string>>)[value] ?? 'Xuất xứ được giữ trong bản lưu nguồn';
const EVENT_TYPE: Readonly<Record<Input['m09'][number]['statementType'], string>> = {
  DOCUMENTED_EVENT: 'Sự kiện có tài liệu', SOURCE_STATED_DIRECTION: 'Hướng do nguồn nêu', COUNTEREVIDENCE: 'Bằng chứng ngược', UNCLASSIFIED: 'Chưa phân loại',
};

/** Resolves only the exact pointer shape the method emits, and only into the retained input array of that section. */
function recordAt<T>(list: readonly T[], pointer: string, section: 'm05' | 'm06' | 'm07' | 'm09'): T | null {
  const match = new RegExp(`^/input/${section}/(0|[1-9][0-9]*)$`).exec(pointer);
  const index = match ? Number(match[1]) : -1;
  return index >= 0 && index < list.length ? list[index]! : null;
}
const hasSourceValue = (row: Observation): boolean => row.observation.state === 'observed_value' || row.observation.state === 'observed_zero';
const blockerList = (codes: readonly string[]): string => {
  const values = [...new Set(codes)].map(code => (activeReaderPlainText ? READER_BLOCKER_TEXT[code] : BLOCKER_TEXT[code] ?? code)).filter(Boolean);
  return values.length === 0 ? '' : `<ul class="limits">${values.map(value => `<li>${escape(value!)}</li>`).join('')}</ul>`;
};
const unresolvedRow = (pointer: string, columns: number): string => activeReaderPlainText
  ? `<tr><td colspan="${columns}">${tag('Không phân giải được bản ghi nguồn; xem dấu vết kỹ thuật.', 'warn')}</td></tr>`
  : `<tr><td colspan="${columns}">${tag('Không phân giải được con trỏ', 'warn')}<code>${escape(pointer)}</code></td></tr>`;
const table = (label: string, head: readonly string[], rows: string, readerPlainText = activeReaderPlainText): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(label)}" tabindex="0"><table><caption>${escape(label)}</caption><thead><tr>${head.map(cell => `<th>${escape(cell)}</th>`).join(readerPlainText ? ' ' : '')}</tr></thead><tbody>${readerPlainText ? rows.replaceAll('</td><td>', '</td> <td>') : rows}</tbody></table></div>`;

function valueCell(row: Observation, readerPlainText = activeReaderPlainText): string {
  const unit = row.unit === null ? tag('Thiếu đơn vị', 'warn') : storedLiteral(row.unit, 'Đơn vị được giữ trong bản lưu nguồn');
  const { state, value, precision } = row.observation;
  const exact = precision === 'non_exact' ? tag('Không chính xác tuyệt đối', 'warn') : '';
  if (state === 'missing') return tag('Thiếu giá trị · không phải 0', 'warn');
  if (state === 'UNKNOWN') return tag(readerPlainText ? 'Chưa rõ · không phải 0' : 'Chưa rõ: UNKNOWN · không phải 0', 'warn');
  if (value === null) return tag('Thiếu giá trị · không phải 0', 'warn');
  if (!readerPlainText) return `${escape(value)} ${unit}${state === 'observed_zero' ? ` ${tag('Nguồn ghi bằng 0', 'zero')}` : ''}${exact}`;
  const formatted = formatReaderValue(value, { measure: row.measureLiteral, unit: row.unit });
  return `${formatted === null ? tag('Thiếu giá trị · không phải 0', 'warn') : escape(formatted)} ${unit}${state === 'observed_zero' ? ` ${tag('Nguồn ghi bằng 0', 'zero')}` : ''}${exact}`;
}
const periodCell = (period: Observation['period'], readerPlainText = activeReaderPlainText): string => period === null ? tag('Thiếu kỳ quan sát', 'warn')
  : `${escape(period.start)} đến ${escape(period.end)}<br><small>${storedLiteral(period.timezone, WITHHELD.basis)} · ${readerPlainText ? readerDateBasis(storedLiteral(period.basis, WITHHELD.basis)) : storedLiteral(period.basis, WITHHELD.basis)}</small>`;
/** A stored scope field may name the provider of the retained package; the reader sees a withheld note instead. */
const withheldScope = 'phạm vi được giữ trong bản lưu nguồn';
const scopeText = (scope: Input['scope'], readerPlainText = activeReaderPlainText): string =>
  [scope.universe, scope.geography, scope.frame].map(part => escape(readerPlainText ? readerScopeText(part, withheldScope) : (readerSafe(part) ? part : withheldScope))).join(' · ');
/** The reader sees a numbered source and its provenance gloss; the file path, family and raw locator stay technical. */
function sourceCell(input: Input, ref: Ref, citations: ReportCitations, compact = false): string {
  const source = input.sources.find(item => item.sha256 === ref.sourceSha256);
  const pointer = readerPointer(ref.locator, activeReaderPlainText);
  const mark = citations.mark({ sourceKind: 'CAPTURE', identity: ref.sourceSha256, locator: pointer.locator, label: 'Nguồn dữ liệu đã lưu',
    retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { ...(source ? { logicalPath: source.logicalPath, evidenceFamily: source.evidenceFamily, provenance: source.providerProvenance } : {}),
      ...(pointer.technical === null ? {} : { locator: pointer.technical }) } });
  const provenance = source ? `<small>${escape(PROVENANCE_TEXT[source.providerProvenance])}</small>` : tag('Nguồn không có trong bản kê', 'warn');
  return compact ? mark : `${mark} ${provenance}`;
}
const entityCell = (row: Observation, readerPlainText = activeReaderPlainText): string => `${row.entityLabel === null ? tag('Nguồn không nêu đối tượng', 'warn') : storedLiteral(row.entityLabel, WITHHELD.entity)}<br><small>${readerPlainText ? escape(readerPlainMeasureName(row.measureLiteral)) : storedLiteral(row.measureLiteral, WITHHELD.measure)}</small>`;

function limitations(methods: DescriptiveMarketMethods, citations: ReportCitations): string {
  const values = methods.limitations.map(code => citations.distinctEntityWording && code === 'M06_LOCATED_RECORDS_NOT_UNIQUE_ENTITIES_STOCK_OR_TOTAL_SUPPLY'
    ? 'M06 đếm bản ghi; không phải đối tượng phân biệt, tồn kho hay toàn bộ nguồn cung.' : LIMITATION_TEXT[code]).filter((value): value is string => value !== undefined);
  return values.length ? `<h3>Giới hạn của phương pháp</h3><ul class="limits">${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul>` : '';
}
function methodNote(usable: boolean): string {
  return `<p class="sec-note">${usable ? 'Hồ sơ phương pháp và gói bằng chứng đã lưu nằm ở phụ lục M13.' : 'Không có bản ghi nguồn dùng được cho mục này; không có giá trị không đồng nghĩa với 0. Hồ sơ phương pháp nằm ở phụ lục M13.'}</p>`;
}

function subtotalText(partition: Partition, current = false, readerPlainText = activeReaderPlainText): string {
  const unit = partition.unit === null ? tag('Thiếu đơn vị', 'warn') : storedLiteral(partition.unit, 'Đơn vị được giữ trong bản lưu nguồn');
  if (partition.subtotal === null) return `<p><b>Không tính tổng.</b> Chưa đủ điều kiện cộng các dòng; không hiển thị bằng 0.</p>`;
  if (partition.complete && !readerPlainText) return `<p><b>Tổng theo khung thành viên nguồn đã khai báo:</b> ${escape(partition.subtotal)} ${unit}. Chỉ áp dụng cho thước đo và khung này; ${current ? 'không phải tổng thị trường ngoài mẫu.' : 'không phải nhu cầu hay tổng thị trường.'}</p>`;
  if (partition.complete) {
    const subtotal = formatReaderValue(partition.subtotal, { measure: partition.measureLiteral, unit: partition.unit });
    return `<p><b>Tổng theo khung thành viên nguồn đã khai báo:</b> ${escape(subtotal ?? 'Giá trị được giữ trong bản lưu nguồn')} ${unit}. Chỉ áp dụng cho thước đo và khung này; ${current ? 'không phải tổng thị trường ngoài mẫu.' : 'không phải nhu cầu hay tổng thị trường.'}</p>`;
  }
  if (!readerPlainText) return `<p><b>Tổng một phần của các dòng có số:</b> ${escape(partition.subtotal)} ${unit} ${tag('Chưa đủ dữ liệu bắt buộc', 'warn')}</p>`;
  const subtotal = formatReaderValue(partition.subtotal, { measure: partition.measureLiteral, unit: partition.unit });
  return `<p><b>Tổng một phần của các dòng có số:</b> ${escape(subtotal ?? 'Giá trị được giữ trong bản lưu nguồn')} ${unit} ${tag('Chưa đủ dữ liệu bắt buộc', 'warn')}</p>`;
}

function m05(methods: DescriptiveMarketMethods, citations: ReportCitations): Omit<DescriptiveSectionView, 'html'> & { body: string } {
  const section = methods.sections.M05;
  const current = methods.methodVersion !== '1.0.0';
  const unresolved: string[] = [];
  let usable = false;
  const parts = section.partitions.map((partition, index) => {
    const rows = partition.recordPointers.map(pointer => {
      const row = recordAt(methods.input.m05, pointer, 'm05');
      if (!row) { unresolved.push(pointer); return unresolvedRow(pointer, 4); }
      usable ||= hasSourceValue(row);
      return `<tr><td>${entityCell(row)}</td><td>${readerStoredOrJsonHtml(row.sourceWording, WITHHELD.wording)}</td><td>${valueCell(row)}</td><td>${sourceCell(methods.input, row.source, citations)}</td></tr>`;
    }).join('');
    const c = partition.coverage;
     return `<h3>${escape(`${index + 1}. `)}${escape(readerMeasureName(partition.measureLiteral))}</h3><dl><dt>Đơn vị</dt><dd>${partition.unit === null ? tag('Thiếu đơn vị', 'warn') : storedLiteral(partition.unit, 'Đơn vị được giữ trong bản lưu nguồn')}</dd><dt>Kỳ quan sát</dt><dd>${periodCell(partition.period)}</dd><dt>Phạm vi nguồn</dt><dd>${scopeText(partition.scope)}</dd><dt>Độ phủ dòng</dt><dd>Có số ${displayCount(c.observedCount)} · Bằng 0 ${displayCount(c.zeroCount)} · Thiếu ${displayCount(c.missingCount)} · ${activeReaderPlainText ? 'Chưa rõ' : 'UNKNOWN'} ${displayCount(c.unknownCount)} · Không chính xác ${displayCount(c.nonExactCount)}</dd></dl>${subtotalText(partition, current)}${blockerList(partition.blockers)}${table(current ? 'Thước đo nguồn theo từng dòng; doanh số đo nhu cầu trong mẫu, mức quan tâm tìm kiếm giữ riêng.' : 'Thước đo nguyên văn của nguồn theo từng dòng. Không phải nhu cầu hay quy mô thị trường.', ['Đối tượng / thước đo', 'Lời trong nguồn', 'Giá trị nguồn', 'Vị trí nguồn'], rows)}`;
  }).join('');
  const lead = current
    ? `<p>${displayCount(section.locatedRecordCount)} bản ghi nguồn được định vị, tách theo nguồn, thước đo, đơn vị, kỳ và phạm vi đã lưu. Nhu cầu, đo bằng doanh số (ước tính) trong mẫu, chỉ đọc cho từng sàn được nguồn khai báo; chưa rõ sàn thì giữ nguyên dòng nguồn, không cộng chéo sàn. Mức quan tâm tìm kiếm ghi riêng, không trộn với doanh số.</p><p>Số bán hàng ước tính chưa đối chiếu với người bán, chỉ dùng tham khảo. Không suy ra quy mô ngoài mẫu, số người mua, nhu cầu chưa được đáp ứng hay dự báo.</p>`
    : `<p>${displayCount(section.locatedRecordCount)} bản ghi nguồn được định vị, chia theo thước đo nguyên văn, đơn vị, kỳ và phạm vi của nguồn. Số tìm kiếm hay doanh số giữ đúng tên nguồn; không đổi thành nhu cầu tổng.</p>`;
  return { usable, locatedRecordCount: section.locatedRecordCount, unresolvedPointers: unresolved, blockers: section.blockers, body: `${lead}${parts}${blockerList(section.blockers)}` };
}

function m06(methods: DescriptiveMarketMethods, citations: ReportCitations): Omit<DescriptiveSectionView, 'html'> & { body: string } {
  const section = methods.sections.M06;
  const unresolved: string[] = [];
  let usable = false;
  const rows = section.recordPointers.map(pointer => {
    const record = recordAt(methods.input.m06, pointer, 'm06');
    if (!record) { unresolved.push(pointer); return unresolvedRow(pointer, 5); }
    const row = record.observation;
    usable ||= hasSourceValue(row);
    return `<tr><td>${entityCell(row)}<br><small>${readerStoredOrJsonHtml(record.objectLiteral, WITHHELD.entity)} · ${readerStoredOrJsonHtml(row.sourceWording, WITHHELD.wording)}</small></td><td>${record.statusLiteral === null ? tag('Nguồn không nêu', 'warn') : storedLiteral(record.statusLiteral, WITHHELD.status)}</td><td>${escape(readerMeasureName(row.measureLiteral))}<br>${valueCell(row)}</td><td>${periodCell(row.period)}<br><small>Ý nghĩa ngày: ${escape(readerDateBasis(storedLiteral(record.dateMeaning, WITHHELD.basis)))}</small></td><td>${sourceCell(methods.input, row.source, citations)}</td></tr>`;
  }).join('');
  const lead = `<p>${displayCount(section.locatedRecordCount)} bản ghi cung do nguồn nêu. Số đối tượng ${citations.distinctEntityWording ? 'phân biệt' : 'duy nhất'}: chưa xác định. Bản ghi listing không phải sản phẩm độc lập, tồn kho, năng lực hay toàn bộ nguồn cung.</p>`;
  const body = `${lead}${rows ? table('Bản ghi nguồn cung theo trạng thái nguồn nêu.', ['Đối tượng nguồn nêu', 'Trạng thái theo nguồn', 'Thước đo / giá trị nguồn', 'Kỳ', 'Vị trí nguồn'], rows) : ''}${blockerList(section.blockers)}`;
  return { usable, locatedRecordCount: section.locatedRecordCount, unresolvedPointers: unresolved, blockers: section.blockers, body };
}

function m07(methods: DescriptiveMarketMethods, citations: ReportCitations): Omit<DescriptiveSectionView, 'html'> & { body: string } {
  const section = methods.sections.M07;
  const unresolved: string[] = [];
  let usable = false;
  const rows = section.recordPointers.map(pointer => {
    const row = recordAt(methods.input.m07, pointer, 'm07');
    if (!row) { unresolved.push(pointer); return unresolvedRow(pointer, 5); }
    usable ||= hasSourceValue(row);
    return `<tr><td>${entityCell(row)}</td><td>${valueCell(row)}</td><td>${periodCell(row.period)}</td><td>${scopeText(row.scope)}</td><td>${sourceCell(methods.input, row.source, citations)}</td></tr>`;
  }).join('');
  const declared = section.mode === 'DECLARED_PEERS_SIDE_BY_SIDE' && methods.input.peerSet !== null;
  const side = (pointer: string | null, ref: Ref): string => {
    const row = pointer === null ? null : recordAt(methods.input.m07, pointer, 'm07');
    return row === null ? `${tag('Chưa xác định bản ghi', 'warn')}<br>${sourceCell(methods.input, ref, citations)}` : `${entityCell(row)}<br>${valueCell(row)}<br><small>${periodCell(row.period)}</small>`;
  };
  const comparisons = declared && section.comparisons.length
    ? `<h3>Đặt cạnh nhau theo nhóm đối thủ đã khai báo</h3><p>Cơ sở khai báo: ${storedLiteral(methods.input.peerSet!.membershipBasis, WITHHELD.basis)} · bản ${storedLiteral(methods.input.peerSet!.membershipRevision, WITHHELD.basis)}. Không xếp hạng, chấm điểm, tính chênh lệch hay thị phần.</p>${table('Mốc và từng đối thủ đã khai báo, cùng thước đo và kỳ khi so sánh được.', ['Mốc', 'Đối thủ khai báo', 'So sánh được', 'Lý do chặn'], section.comparisons.map(item => `<tr><td>${side(item.anchorPointer, item.anchorRef)}</td><td>${side(item.peerPointer, item.peerRef)}</td><td>${item.compatibility === 'COMPARABLE' ? tag('So sánh được', 'zero') : tag('Không so sánh được', 'warn')}</td><td>${blockerList(item.blockers) || 'Không có'}</td></tr>`).join(''))}`
    : '';
  const lead = declared
    ? `<p>${displayCount(section.recordPointers.length)} quan sát theo thứ tự nhóm đối thủ do người dùng khai báo. Nhóm gần giống không tự trở thành đối thủ đã duyệt.</p>`
    : `<p>Danh mục chưa xếp hạng: ${displayCount(section.recordPointers.length)} quan sát theo thứ tự vị trí nguồn. Chưa có nhóm đối thủ được khai báo, nên không so sánh, xếp hạng hay tính thị phần.</p>`;
  const inventory = rows ? `<h3>${declared ? 'Danh mục quan sát' : 'Danh mục chưa xếp hạng'}</h3>${table('Quan sát có nguồn; thứ tự không phải xếp hạng.', ['Đối tượng / thước đo', 'Giá trị nguồn', 'Kỳ', 'Phạm vi', 'Vị trí nguồn'], rows)}` : '';
  return { usable, locatedRecordCount: section.recordPointers.length, unresolvedPointers: unresolved, blockers: section.blockers, body: `${lead}${comparisons}${inventory}${blockerList(section.blockers)}` };
}

function m09(methods: DescriptiveMarketMethods, citations: ReportCitations): Omit<DescriptiveSectionView, 'html'> & { body: string } {
  const section = methods.sections.M09;
  const unresolved: string[] = [];
  let usable = false;
  const rows = section.events.map(event => {
    const row = recordAt(methods.input.m09, event.recordPointer, 'm09');
    if (!row) { unresolved.push(event.recordPointer); return unresolvedRow(event.recordPointer, 5); }
    usable = true;
    const dates = `Ngày đăng: ${row.publicationDate === null ? 'chưa rõ' : escape(row.publicationDate)}<br>Ngày sự kiện: ${row.eventDate === null ? 'chưa rõ' : escape(row.eventDate)}<br><small>${escape(readerDateBasis(row.dateBasis))}</small>`;
    const target = `${storedLiteral(row.namedScope, WITHHELD.entity)}<br><small>Chỉ số nêu: ${row.affectedMetricLiteral === null ? 'không nêu' : escape(readerMeasureName(row.affectedMetricLiteral))} · ${row.targetLink === null ? 'chưa liên kết đối tượng' : 'đã liên kết đối tượng'}</small>`;
    const conflicts = row.conflictRefs.length ? `<br><small>${displayCount(row.conflictRefs.length)} bằng chứng mâu thuẫn được nguồn ghi nhận</small>` : '';
    return `<tr><td>${escape(EVENT_TYPE[row.statementType])}<br><small>Người nêu: ${storedLiteral(row.attribution, WITHHELD.person)}</small></td><td>${readerStoredOrJsonHtml(row.sourceWording, WITHHELD.wording)}</td><td>${dates}</td><td>${target}</td><td>${sourceCell(methods.input, row.source, citations)}${conflicts}${blockerList(event.blockers)}</td></tr>`;
  }).join('');
  const lead = `<p>${displayCount(section.locatedRecordCount)} phát biểu hoặc sự kiện có nguồn, ngày và người nêu. Đây là lời được quy cho nguồn; không phải nguyên nhân, xác suất hay mức tác động.</p>`;
  const body = `${lead}${rows ? table('Sự kiện và phát biểu có nguồn.', ['Loại / người nêu', 'Lời trong nguồn', 'Ngày', 'Phạm vi nêu tên', 'Vị trí nguồn'], rows) : ''}${blockerList(section.blockers)}`;
  return { usable, locatedRecordCount: section.locatedRecordCount, unresolvedPointers: unresolved, blockers: section.blockers, body };
}

const readerDate = (value: string): string => value.replace(/^(\d{4})-(\d{2})-(\d{2})$/, '$3/$2/$1');
const plainCopy = (value: string): boolean => readerSafe(value) && !containsForbiddenProviderName(value) && !/\b(?:Google|Gemini)\b|%/i.test(value);
const readerPeriod = (period: Observation['period']): string => period === null
  ? 'Chưa rõ kỳ quan sát' : `${readerDate(period.start)} đến ${readerDate(period.end)}`;
const readerProduct = (id: string | null, ordinal: number, context: DescriptiveReaderContext): string => {
  const title = id === null ? undefined : context.productLabels?.get(id) ?? id;
  return readerProductLabel(id ?? '', title && plainCopy(title) && !/^\d+$|^[a-z][\w-]*:/i.test(title) ? title : undefined, ordinal);
};
const SUPPLY_MEASURES: Readonly<Record<string, string>> = {
  supply: 'Nguồn cung', supply_quantity: 'Lượng cung', stock: 'Tồn kho', stock_quantity: 'Tồn kho',
  inventory: 'Tồn kho', inventory_quantity: 'Tồn kho', available_units: 'Số lượng có sẵn',
  available_quantity: 'Số lượng có sẵn', production_capacity: 'Năng lực sản xuất', supply_capacity: 'Năng lực cung ứng',
  listing_count: 'Số mặt hàng được niêm yết', product_count: 'Số sản phẩm', seller_count: 'Số người bán',
};
function supplyMeasure(literal: string): string | null {
  const normalized = literal.trim().toLowerCase().replace(/[ -]+/g, '_');
  return Object.hasOwn(SUPPLY_MEASURES, normalized) ? SUPPLY_MEASURES[normalized]!
    : /^(?:nguồn cung|lượng cung|tồn kho|năng lực (?:sản xuất|cung ứng)|số (?:mặt hàng|sản phẩm|người bán))$/i.test(literal.trim()) ? literal.trim() : null;
}
function readerMeasure(literal: string): string {
  const supply = supplyMeasure(literal);
  if (supply !== null) return supply;
  if (/^(?:reported searches|search_count|search_volume)$/i.test(literal)) return 'Lượt tìm kiếm';
  if (plainCopy(literal) && /[\u00c0-\u024f\u1e00-\u1eff]/.test(literal)) return literal;
  const label = readerPlainMeasureName(literal);
  return typeof label === 'string' ? label : readerPlainMeasureName(null);
}
function readerUnit(unit: string | null): string | null {
  if (unit === null || !plainCopy(unit)) return null;
  if (/^(?:units?|count)$/i.test(unit)) return 'đơn vị';
  if (/^(?:search events|searches)$/i.test(unit)) return 'lượt tìm kiếm';
  return /[\u00c0-\u024f\u1e00-\u1eff]/.test(unit) || /^[A-Z]{3}$/.test(unit) ? unit : null;
}
function readerValue(row: Observation, includeUnit = false): string {
  const { state, value, precision } = row.observation;
  if (state === 'missing' || value === null) return state === 'UNKNOWN' ? 'Chưa rõ' : 'Chưa có dữ liệu';
  if (state === 'observed_zero') return `Không ghi nhận${precision === 'non_exact' ? ' (ước tính)' : ''}`;
  const formatted = formatReaderValue(value, { measure: row.measureLiteral, unit: row.unit });
  if (formatted === null) return 'Chưa có dữ liệu';
  const displayUnit = readerUnit(row.unit);
  const unit = includeUnit && displayUnit !== null ? ` ${escape(displayUnit)}` : '';
  return `${escape(formatted)}${unit}${precision === 'non_exact' ? ' (ước tính)' : ''}`;
}
const READER_SECTION_LIMITS: Readonly<Record<string, string>> = {
  M05_LITERAL_SOURCE_MEASURES_NOT_DEMAND_OR_MARKET_SIZE: 'Số liệu giữ đúng thước đo của nguồn; không suy ra quy mô thị trường.',
  M05_ESTIMATED_SALES_IN_SAMPLE_DEMAND_PER_PLATFORM_SEARCH_SEPARATE: 'Nhu cầu, đo bằng doanh số (ước tính) trong mẫu, được đọc riêng cho từng sàn. Mức quan tâm tìm kiếm ghi riêng. Số bán hàng chưa đối chiếu với người bán, chỉ dùng tham khảo; không suy ra quy mô ngoài mẫu, số người mua, nhu cầu chưa được đáp ứng hay dự báo.',
  M06_LOCATED_RECORDS_NOT_UNIQUE_ENTITIES_STOCK_OR_TOTAL_SUPPLY: 'Số liệu chỉ mô tả nguồn đã thu, chưa phản ánh toàn bộ nguồn cung.',
  M07_OWNER_DECLARED_SIDE_BY_SIDE_NO_RANK_SCORE_DIFFERENCE_OR_RATIO: 'Chỉ đặt các quan sát cạnh nhau; không xếp hạng, chấm điểm hay suy ra thị phần.',
  M07_DEFAULT_PEERS_FROM_RETAINED_CLASSIFIED_SALES_OR_EXPLICIT_GAP_OWNER_ADDITIONS_SEPARATE: 'Đối thủ mặc định chỉ được chọn từ doanh thu cùng nhóm, cùng kỳ và cùng phạm vi nguồn. Bổ sung của chủ được giữ riêng.',
  M09_ATTRIBUTED_EVENT_INVENTORY_NOT_CAUSAL_IMPACT_OR_FORECAST: 'Sự kiện do nguồn nêu; chưa đủ bằng chứng xác định nguyên nhân hay dự báo tác động.',
};
function readerNotes(methods: DescriptiveMarketMethods, section: DescriptiveSectionId, additiveWarning: boolean, extra: readonly string[] = []): string {
  const notes = [
    ...(/\bVN\b|Việt Nam|Vietnam/i.test(methods.input.scope.geography) ? ['Số liệu cho Việt Nam.'] : []),
    ...(additiveWarning ? ['Không cộng các dòng với nhau.'] : []),
    ...methods.limitations.filter(code => code.startsWith(`${section}_`)).flatMap(code => READER_SECTION_LIMITS[code] ? [READER_SECTION_LIMITS[code]!] : []),
    ...extra,
  ];
  return [...new Set(notes)].map(note => `<p class="sec-note">${escape(note)}</p>`).join('');
}
type ReaderSectionBody = Omit<DescriptiveSectionView, 'html'> & { body: string };
function readerCoverage(rows: readonly Observation[]): string {
  // Observed count includes recorded zero, as it does in the frozen method's coverage.
  const counts = [rows.filter(row => row.observation.value !== null).length,
    rows.filter(row => row.observation.state === 'observed_zero').length,
    rows.filter(row => row.observation.state === 'missing').length,
    rows.filter(row => row.observation.state === 'UNKNOWN').length,
    rows.filter(row => row.observation.value !== null && row.observation.precision === 'non_exact').length];
  if (counts[0] && counts.slice(1).every(count => count === 0)) return 'Mọi dòng đều có số.';
  const labels = ['dòng có số', 'dòng bằng không', 'dòng thiếu số', 'dòng chưa rõ', 'dòng có số chưa chính xác'];
  const parts = counts.flatMap((count, i) => count ? [`${readerCount(count)} ${labels[i]}`] : []);
  return parts.length ? `${parts.join('; ')}.` : 'Chưa có dữ liệu về độ phủ dòng.';
}
function readerM05(methods: DescriptiveMarketMethods, citations: ReportCitations, context: DescriptiveReaderContext): ReaderSectionBody {
  const section = methods.sections.M05;
  const unresolved: string[] = [];
  const measures = new Map<string, Observation[]>();
  for (const pointer of new Set(section.partitions.flatMap(partition => partition.recordPointers))) {
    const row = recordAt(methods.input.m05, pointer, 'm05');
    if (!row) { unresolved.push(pointer); continue; }
    const rows = measures.get(row.measureLiteral) ?? [];
    rows.push(row);
    measures.set(row.measureLiteral, rows);
  }
  if (context.periodRowsInM03 && measures.size) return {
    usable: [...measures.values()].flat().some(hasSourceValue), locatedRecordCount: section.locatedRecordCount, unresolvedPointers: unresolved, blockers: section.blockers,
    body: `<p>Số liệu bán từng kỳ của các sản phẩm được chọn nằm ở Phần 3; phần này không in lại.</p>${readerNotes(methods, 'M05', false)}`,
  };
  let usable = false;
  const tables = [...measures].map(([measure, observations]) => {
    const windows = [...new Set(observations.map(row => row.period === null ? '' : `${row.period.start}/${row.period.end}`))].sort();
    const products = new Map<string, { label: string; cells: Map<string, Observation[]> }>();
    for (const row of observations) {
      usable ||= hasSourceValue(row);
      // A name alone cannot join observations from different sources or scopes.
      const key = JSON.stringify([row.source.sourceSha256, row.entityLabel ?? row.source.locator, row.scope, row.measureDefinition]);
      let product = products.get(key);
      if (!product) {
        product = { label: readerProduct(row.entityLabel, products.size + 1, context), cells: new Map() };
        products.set(key, product);
      }
      const window = row.period === null ? '' : `${row.period.start}/${row.period.end}`;
      product.cells.set(window, [...(product.cells.get(window) ?? []), row]);
    }
    const units = [...new Set(observations.map(row => row.unit))];
    const unit = units.length === 1 ? readerUnit(units[0] ?? null) : null;
    const label = `${readerMeasure(measure)}${unit ? ` (${unit})` : ''}`;
    const heads = ['Sản phẩm', ...windows.map(window => {
      const row = observations.find(item => (item.period === null ? '' : `${item.period.start}/${item.period.end}`) === window)!;
      return `${readerPeriod(row.period)}${unit === 'VND' ? ' (VND)' : ''}`;
    })];
    const rows = [...products.values()].map(product => `<tr><td>${escape(product.label)}</td>${windows.map(window =>
      `<td>${product.cells.get(window)?.map(row => `${readerValue(row, units.length > 1)} ${sourceCell(methods.input, row.source, citations, true)}`).join('<br>') ?? 'Chưa có dữ liệu'}</td>`).join('')}</tr>`).join('');
    return `<p>${escape(readerCoverage(observations))}</p>` + table(label, heads, rows, true);
  }).join('');
  const body = tables ? `<p>${readerCount(section.locatedRecordCount)} quan sát theo sản phẩm và kỳ.</p>${tables}${readerNotes(methods, 'M05', true)}` : '<p>Chưa có dữ liệu quan sát.</p>';
  return { usable, locatedRecordCount: section.locatedRecordCount, unresolvedPointers: unresolved, blockers: section.blockers, body };
}
function readerM06(methods: DescriptiveMarketMethods, citations: ReportCitations, context: DescriptiveReaderContext): ReaderSectionBody {
  const section = methods.sections.M06;
  const unresolved: string[] = [];
  let usable = false;
  let count = 0;
  const rows = section.recordPointers.flatMap(pointer => {
    const record = recordAt(methods.input.m06, pointer, 'm06');
    if (!record) { unresolved.push(pointer); return []; }
    const row = record.observation;
    const measure = supplyMeasure(row.measureLiteral);
    if (measure === null) return [];
    count += 1;
    usable ||= hasSourceValue(row);
    return [`<tr><td>${escape(readerProduct(row.entityLabel, count, context))}</td><td>${escape(measure)}</td><td>${readerValue(row, true)}</td><td>${escape(readerPeriod(row.period))}</td><td>${sourceCell(methods.input, row.source, citations, true)}</td></tr>`];
  }).join('');
  const body = rows ? table('Số liệu nguồn cung', ['Sản phẩm', 'Chỉ số', 'Giá trị', 'Kỳ quan sát', 'Nguồn'], rows, true) + readerNotes(methods, 'M06', true)
    : '<p>Chưa có dữ liệu nguồn cung.</p>';
  return { usable, locatedRecordCount: count, unresolvedPointers: unresolved, blockers: section.blockers, body };
}
function readerM07(methods: DescriptiveMarketMethods, citations: ReportCitations, context: DescriptiveReaderContext): ReaderSectionBody {
  const section = methods.sections.M07;
  const unresolved: string[] = [];
  let usable = false;
  const declared = section.mode === 'DECLARED_PEERS_SIDE_BY_SIDE' && methods.input.peerSet !== null;
  const labels = new Map<string, string>();
  const cell = (row: Observation): string => {
    const key = JSON.stringify([row.source.sourceSha256, row.entityLabel ?? row.source.locator]);
    if (!labels.has(key)) labels.set(key, readerProduct(row.entityLabel, labels.size + 1, context));
    return `${escape(labels.get(key)!)}<br>${escape(readerMeasure(row.measureLiteral))}: ${readerValue(row, true)}<br>${escape(readerPeriod(row.period))} ${sourceCell(methods.input, row.source, citations, true)}`;
  };
  const rows = section.recordPointers.flatMap(pointer => {
    const row = recordAt(methods.input.m07, pointer, 'm07');
    if (!row) { unresolved.push(pointer); return []; }
    usable ||= hasSourceValue(row);
    return [`<tr><td>${cell(row)}</td></tr>`];
  }).join('');
  const side = (pointer: string | null): string => {
    const row = pointer === null ? null : recordAt(methods.input.m07, pointer, 'm07');
    return row === null ? 'Chưa đủ dữ liệu đối chiếu' : cell(row);
  };
  const comparisons = declared && section.comparisons.length ? table('Đối chiếu trong nhóm đã khai báo', ['Sản phẩm mốc', 'Đối thủ', 'Khả năng đối chiếu'],
    section.comparisons.map(item => `<tr><td>${side(item.anchorPointer)}</td><td>${side(item.peerPointer)}</td><td>${item.compatibility === 'COMPARABLE' ? 'Cùng thước đo, kỳ và phạm vi' : 'Chưa đủ điều kiện so sánh'}</td></tr>`).join(''), true) : '';
  const body = rows ? `${comparisons}${table('Quan sát theo sản phẩm; thứ tự không phải xếp hạng', ['Sản phẩm và số liệu nguồn'], rows, true)}${readerNotes(methods, 'M07', true,
    declared ? [] : ['Chưa có nhóm đối thủ được khai báo để so sánh.'])}` : '<p>Chưa đủ dữ liệu về đối thủ.</p>';
  return { usable, locatedRecordCount: section.recordPointers.length, unresolvedPointers: unresolved, blockers: section.blockers, body };
}
function readerM09(methods: DescriptiveMarketMethods, citations: ReportCitations, context: DescriptiveReaderContext): ReaderSectionBody {
  const section = methods.sections.M09;
  const unresolved: string[] = [];
  const period = context.requestedPeriod;
  let before = false;
  let after = false;
  let launches = false;
  let count = 0;
  const products = new Map<string, string>();
  const rows = section.events.flatMap(event => {
    const row = recordAt(methods.input.m09, event.recordPointer, 'm09');
    if (!row) { unresolved.push(event.recordPointer); return []; }
    if (!period || row.eventDate === null) return [];
    if (row.eventDate < period.startDate) { before = true; return []; }
    if (row.eventDate > period.endDate) { after = true; return []; }
    let wording: string;
    let launch = false;
    if (row.sourceWording.trimStart().startsWith('{')) {
      try {
        const value: unknown = JSON.parse(row.sourceWording);
        if (value === null || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== 1
          || !('launch_date' in value) || value.launch_date !== row.eventDate) return [];
        wording = 'Ngày ra mắt do nguồn khai báo';
        launch = true;
      } catch { return []; }
    } else {
      if (!plainCopy(row.sourceWording) || !/[\u00c0-\u024f\u1e00-\u1eff]/.test(row.sourceWording)) return [];
      wording = row.sourceWording;
    }
    launches ||= launch;
    count += 1;
    if (!products.has(row.namedScope)) products.set(row.namedScope, readerProduct(row.namedScope, products.size + 1, context));
    const conflict = row.conflictRefs.length ? '<br>Có thông tin mâu thuẫn, cần đối chiếu.' : '';
    const kind = !launch && row.statementType !== 'UNCLASSIFIED' ? `${escape(EVENT_TYPE[row.statementType])}<br>` : '';
    const attribution = !launch && plainCopy(row.attribution) && /[\u00c0-\u024f\u1e00-\u1eff]/.test(row.attribution) ? `<br><small>${escape(row.attribution)}</small>` : '';
    return [`<tr><td>${escape(products.get(row.namedScope)!)}</td><td>${kind}${launch ? escape(wording) : `<q>${escape(wording)}</q>`}${attribution}</td><td>${escape(readerDate(row.eventDate))}</td><td>${sourceCell(methods.input, row.source, citations, true)}${conflict}</td></tr>`];
  }).join('');
  const omitted = before || after ? `<p>Đã lược bỏ các sự kiện có ngày ${before && after ? 'trước hoặc sau' : before ? 'trước' : 'sau'} kỳ báo cáo.</p>` : '';
  const body = rows ? `${table('Sự kiện trong kỳ do nguồn nêu', ['Sản phẩm', 'Sự kiện', 'Ngày', 'Nguồn'], rows, true)}${omitted}${readerNotes(methods, 'M09', false,
    launches ? ['Chưa xác minh đây là ngày ra mắt thực tế.'] : [])}` : `<p>Chưa đủ dữ liệu về sự kiện trong kỳ.</p>${omitted}`;
  return { usable: count > 0, locatedRecordCount: count, unresolvedPointers: unresolved, blockers: section.blockers, body };
}

export function describeDescriptiveSection(methods: DescriptiveMarketMethods, sectionId: DescriptiveSectionId, citations: ReportCitations, readerPlainText = false, readerContext: DescriptiveReaderContext = {}): DescriptiveSectionView {
  const previous = activeReaderPlainText;
  activeReaderPlainText = readerPlainText;
  try {
    if (readerPlainText) {
      const { body, ...view } = { M05: readerM05, M06: readerM06, M07: readerM07, M09: readerM09 }[sectionId](methods, citations, readerContext);
      return { ...view, html: body };
    }
    const { body, ...view } = { M05: m05, M06: m06, M07: m07, M09: m09 }[sectionId](methods, citations);
    return { ...view, html: `${methodNote(view.usable)}${body}${limitations(methods, citations)}` };
  } finally {
    activeReaderPlainText = previous;
  }
}

/** Package and method identity belong in the M13 appendix, not in the analytical sections. */
export function descriptiveAppendix(methods: DescriptiveMarketMethods | undefined, failure?: 'DESCRIPTIVE_METHOD_FAILED', distinctEntityWording = false, readerPlainText = false): string {
  if (methods === undefined && failure) return '<h3>Hồ sơ đối chiếu phương pháp mô tả thị trường</h3><p>Đã thử chạy phương pháp mô tả nhưng đầu vào hoặc phương pháp không vượt qua kiểm tra. Không có kết quả phương pháp dùng được cho M05, M06, M07 và M09. Bản thu nguồn vẫn được giữ trong bản kê phía trên; cần kiểm tra lỗi trước khi tạo phiên bản mới, không tự động gọi lại nguồn.</p>'
    + `<details class="evidence-trace"><summary>Mã đối chiếu của lần chạy lỗi</summary><p><code>${escape(failure)}</code></p></details>`;
  if (methods === undefined) return '<h3>Hồ sơ đối chiếu phương pháp mô tả thị trường</h3><p>Không có kết quả trong lượt này. Phương pháp chỉ chạy khi lượt có quan sát sản phẩm hợp lệ từ bản thu nguồn. Các mục M05, M06, M07 và M09 không có kết quả phương pháp.</p>';
  const pkg = methods.input.sourcePackage;
  const config = methods.input.configuration;
  // Only this owning-bridge declaration has revised display copy; retained snapshots and source words are unchanged.
  const variantRule = distinctEntityWording && methods.input.scope.variantRule === 'Giữ mã sản phẩm của nguồn; chưa hợp nhất listing hoặc chuẩn hóa biến thể.'
    ? 'Giữ mã sản phẩm của nguồn; chưa gộp listing hoặc chuẩn hóa biến thể.' : methods.input.scope.variantRule;
  // Reader mode keeps the declared variant rule as reader-safe business wording; package, method and file identity stay in the technical trace.
  if (readerPlainText) return `<details class="evidence-trace"><summary>Hồ sơ đối chiếu kỹ thuật của phương pháp mô tả</summary><p>Quy tắc biến thể đã khai báo: ${escape(variantRule)}</p><p>Tệp nguồn, con trỏ, phiên bản phương pháp, mã kết quả và dấu kiểm được giữ trong dấu vết kỹ thuật riêng; không đưa vào bản đọc này.</p></details>`;
  const sources = methods.input.sources.map(source => `<tr><td>${storedLiteral(source.logicalPath, 'Tệp được giữ trong bản lưu nguồn')}</td><td>${storedLiteral(source.evidenceFamily, 'Nhóm nguồn được giữ trong bản lưu')}</td><td>${escape(PROVENANCE_TEXT[source.providerProvenance])}</td><td><code>${escape(source.sha256)}</code></td></tr>`).join('');
  const previous = activeReaderPlainText;
  activeReaderPlainText = readerPlainText;
  const html = `<details class="evidence-trace"><summary>Hồ sơ đối chiếu phương pháp mô tả thị trường: gói nguồn, cấu hình và tệp</summary><dl><dt>Phương pháp</dt><dd>${escape(methods.methodId)}@${escape(methods.methodVersion)}</dd><dt>Mã kết quả</dt><dd><code>${escape(methods.methodOutputId)}</code></dd><dt>Gói nguồn</dt><dd>${escape(pkg.packageId)} · phiên bản ${escape(pkg.version)}</dd><dt>Bản kê gói</dt><dd><code>${escape(pkg.manifestArtifactSha256)}</code></dd><dt>Nội dung gói</dt><dd><code>${escape(pkg.packageContentSha256)}</code></dd><dt>Cấu hình</dt><dd>${escape(config.profileId)}@${escape(config.profileVersion)} · ${storedLiteral(config.policyRevision, 'Phiên bản chính sách được giữ trong bản lưu nguồn')}</dd><dt>Câu hỏi</dt><dd>${storedLiteral(methods.input.question, 'Câu hỏi được giữ trong bản lưu')}</dd><dt>Phạm vi khai báo</dt><dd>${scopeText(methods.input.scope)}<br><small>Gồm: ${storedLiteral(methods.input.scope.inclusionRule, withheldScope)} · Loại: ${storedLiteral(methods.input.scope.exclusionRule, withheldScope)} · Biến thể: ${storedLiteral(variantRule, withheldScope)}</small></dd></dl>${table('Tệp nguồn của hồ sơ phương pháp. Hash chỉ chứng minh tính toàn vẹn, không chứng minh nội dung đúng.', ['Tệp logic', 'Nhóm bằng chứng', 'Nguồn gốc', 'SHA-256'], sources)}</details>`;
  activeReaderPlainText = previous;
  return html;
}
