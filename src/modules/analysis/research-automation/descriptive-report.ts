import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import { containsForbiddenProviderName, containsTechnicalId, type CitationInput } from '../citation-registry.js';

type Input = DescriptiveMarketMethods['input'];
type Observation = Input['m05'][number];
type Ref = Observation['source'];
type Partition = DescriptiveMarketMethods['sections']['M05']['partitions'][number];
export type DescriptiveSectionId = 'M05' | 'M06' | 'M07' | 'M09';

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
export const readerSafe = (text: string): boolean => !containsForbiddenProviderName(text) && !containsTechnicalId(text);

/** Stored literals of the retained package are reader text only while they stay clean; otherwise the part is withheld. */
const WITHHELD = {
  entity: 'đối tượng được giữ trong bản lưu nguồn', wording: 'lời nguồn được giữ trong bản lưu', measure: 'thước đo được giữ trong bản lưu',
  status: 'trạng thái được giữ trong bản lưu', person: 'người nêu được giữ trong bản lưu', basis: 'cơ sở được giữ trong bản lưu',
} as const;
export const storedLiteral = (value: string, withheld: string): string => readerSafe(value) ? escape(value) : withheld;

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
export function readerPointer(pointer: string | null): { locator: string | null; technical: string | null } {
  if (pointer === null || pointer === '') return { locator: null, technical: null };
  return readerSafe(pointer) && READER_POINTER.test(pointer)
    ? { locator: pointer, technical: pointer }
    : { locator: 'vị trí trong nguồn', technical: pointer };
}
const tag = (text: string, kind = ''): string => `<span class="tag${kind ? ` ${kind}` : ''}">${escape(text)}</span>`;

/** A source member key is `<provider>:<local id>`; only the source-local id is reader text. */
export const sourceMemberLabel = (key: string): string => {
  const separator = key.indexOf(':');
  return separator > 0 ? key.slice(separator + 1) : key;
};
export const isDescriptiveSectionId = (id: string): id is DescriptiveSectionId => id === 'M05' || id === 'M06' || id === 'M07' || id === 'M09';

const BLOCKER_TEXT: Readonly<Record<string, string>> = {
  NO_LOCATED_RECORDS: 'Chưa có bản ghi nguồn được định vị.', PERIOD_MISSING: 'Thiếu kỳ quan sát.', UNIT_MISSING: 'Thiếu đơn vị.',
  ADDITIVITY_UNDECLARED: 'Nguồn chưa khai báo các thành viên có thể cộng dồn.', AGGREGATION_OVERLAP_UNRESOLVED: 'Các thành viên có thể chồng lấn và chưa được giải quyết.',
  AGGREGATION_FRAME_INCOMPATIBLE: 'Khung đo của các thành viên không tương thích để cộng.', MEMBERSHIP_INCOMPLETE: 'Danh sách thành viên bắt buộc chưa đầy đủ.',
  VALUE_MISSING: 'Thiếu giá trị ở một số dòng.', VALUE_UNKNOWN: 'Có giá trị UNKNOWN.', NON_EXACT_VALUE: 'Có giá trị không chính xác tuyệt đối.',
  M07_PEER_SET_UNAPPROVED: 'Chưa có nhóm đối thủ do người dùng khai báo.', M07_IDENTITY_UNRESOLVED: 'Chưa xác định được bản ghi của mốc hoặc đối thủ.',
  M07_PERIOD_INCOMPATIBLE: 'Kỳ quan sát không tương thích.', M07_UNIVERSE_OR_MEASURE_INCOMPATIBLE: 'Phạm vi hoặc thước đo không tương thích.',
  M09_EVENT_DATE_UNKNOWN: 'Chưa rõ ngày của sự kiện.', M09_ENTITY_LINK_UNRESOLVED: 'Chưa liên kết sự kiện với đúng đối tượng.',
  M09_COUNTEREVIDENCE_CONFLICT: 'Có bằng chứng ngược chưa được giải quyết.',
};
const LIMITATION_TEXT: Readonly<Record<string, string>> = {
  NORMALIZED_SOURCE_DECLARATIONS_NOT_PROVIDER_AUTHENTICATION: 'Khai báo đã chuẩn hóa từ nguồn; không xác thực nhà cung cấp.',
  EXACT_PACKAGE_BYTES_AND_LOCATORS_REQUIRE_CALLER_VERIFICATION: 'Bytes gói nguồn và vị trí bằng chứng phải được kiểm tra ở lớp gọi phương pháp.',
  SOURCE_WORDING_IS_ATTRIBUTED_INERT_TEXT_NOT_A_CONCLUSION: 'Lời trong nguồn được trích và quy cho nguồn; không phải kết luận.',
  M05_LITERAL_SOURCE_MEASURES_NOT_DEMAND_OR_MARKET_SIZE: 'M05 giữ đúng thước đo của nguồn; không phải nhu cầu hay quy mô thị trường.',
  SUBTOTAL_COMPLETENESS_ONLY_FOR_DECLARED_SOURCE_MEMBER_FRAME: 'Tổng chỉ đầy đủ trong khung thành viên do nguồn khai báo.',
  M06_LOCATED_RECORDS_NOT_UNIQUE_ENTITIES_STOCK_OR_TOTAL_SUPPLY: 'M06 đếm bản ghi; không phải đối tượng duy nhất, tồn kho hay toàn bộ nguồn cung.',
  M07_OWNER_DECLARED_SIDE_BY_SIDE_NO_RANK_SCORE_DIFFERENCE_OR_RATIO: 'M07 chỉ đặt cạnh nhau nhóm đã khai báo; không xếp hạng, chấm điểm, tính chênh lệch hay tỷ lệ.',
  M09_ATTRIBUTED_EVENT_INVENTORY_NOT_CAUSAL_IMPACT_OR_FORECAST: 'M09 là danh mục sự kiện có nguồn; không phải tác động nhân quả hay dự báo.',
  NO_RATE_POPULATION_INFERENCE_OR_MARKET_SHARE: 'Không suy ra tỷ lệ, tổng thể hay thị phần.',
  UNREVIEWED_BOUNDED_METHOD_OUTPUT_NOT_COMPLETE_SECTION: 'Kết quả phương pháp có giới hạn, chưa duyệt; không phải mục hoàn chỉnh.',
};
const PROVENANCE_TEXT: Readonly<Record<Input['sources'][number]['providerProvenance'], string>> = {
  verified: 'Đã xác minh', provider_reported: 'Nhà cung cấp tự báo', operator_supplied_unverified: 'Người vận hành cung cấp, chưa xác minh', synthetic: 'Dữ liệu giả lập dùng kiểm thử',
};
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
const blockerList = (codes: readonly string[]): string => codes.length === 0 ? '' : `<ul class="limits">${[...new Set(codes)].map(code => `<li>${escape(BLOCKER_TEXT[code] ?? code)}</li>`).join('')}</ul>`;
const unresolvedRow = (pointer: string, columns: number): string => `<tr><td colspan="${columns}">${tag('Không phân giải được con trỏ', 'warn')}<code>${escape(pointer)}</code></td></tr>`;
const table = (label: string, head: readonly string[], rows: string): string =>
  `<div class="table-wrap" role="region" aria-label="${escape(label)}" tabindex="0"><table><caption>${escape(label)}</caption><thead><tr>${head.map(cell => `<th>${escape(cell)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;

function valueCell(row: Observation): string {
  const unit = row.unit === null ? tag('Thiếu đơn vị', 'warn') : escape(row.unit);
  const { state, value, precision } = row.observation;
  const exact = precision === 'non_exact' ? tag('Không chính xác tuyệt đối', 'warn') : '';
  if (state === 'missing') return tag('Thiếu giá trị · không phải 0', 'warn');
  if (state === 'UNKNOWN') return tag('Chưa rõ: UNKNOWN · không phải 0', 'warn');
  if (value === null) return tag('Thiếu giá trị · không phải 0', 'warn');
  return `${escape(value)} ${unit}${state === 'observed_zero' ? ` ${tag('Nguồn ghi bằng 0', 'zero')}` : ''}${exact}`;
}
const periodCell = (period: Observation['period']): string => period === null ? tag('Thiếu kỳ quan sát', 'warn')
  : `${escape(period.start)} đến ${escape(period.end)}<br><small>${escape(period.timezone)} · ${escape(period.basis)}</small>`;
/** A stored scope field may name the provider of the retained package; the reader sees a withheld note instead. */
const withheldScope = 'phạm vi được giữ trong bản lưu nguồn';
const scopeText = (scope: Input['scope']): string =>
  [scope.universe, scope.geography, scope.frame].map(part => readerSafe(part) ? escape(part) : withheldScope).join(' · ');
/** The reader sees a numbered source and its provenance gloss; the file path, family and raw locator stay technical. */
function sourceCell(input: Input, ref: Ref, citations: ReportCitations): string {
  const source = input.sources.find(item => item.sha256 === ref.sourceSha256);
  const pointer = readerPointer(ref.locator);
  const mark = citations.mark({ sourceKind: 'CAPTURE', identity: ref.sourceSha256, locator: pointer.locator, label: 'Nguồn dữ liệu đã lưu',
    retrievedAt: null, url: null, quote: null, quoteVerification: 'NOT_APPLICABLE',
    technical: { ...(source ? { logicalPath: source.logicalPath, evidenceFamily: source.evidenceFamily, provenance: source.providerProvenance } : {}),
      ...(pointer.technical === null ? {} : { locator: pointer.technical }) } });
  const provenance = source ? `<small>${escape(PROVENANCE_TEXT[source.providerProvenance])}</small>` : tag('Nguồn không có trong bản kê', 'warn');
  return `${mark} ${provenance}`;
}
const entityCell = (row: Observation): string => `${row.entityLabel === null ? tag('Nguồn không nêu đối tượng', 'warn') : storedLiteral(row.entityLabel, WITHHELD.entity)}<br><small>${storedLiteral(row.measureLiteral, WITHHELD.measure)}</small>`;

function limitations(methods: DescriptiveMarketMethods): string {
  return `<h3>Giới hạn của phương pháp</h3><ul class="limits">${methods.limitations.map(code => `<li>${escape(LIMITATION_TEXT[code] ?? code)}</li>`).join('')}</ul>`;
}
function methodNote(usable: boolean): string {
  return `<p class="sec-note">${usable ? 'Hồ sơ phương pháp và gói bằng chứng đã lưu nằm ở phụ lục M13.' : 'Không có bản ghi nguồn dùng được cho mục này; không có giá trị không đồng nghĩa với 0. Hồ sơ phương pháp nằm ở phụ lục M13.'}</p>`;
}

function subtotalText(partition: Partition): string {
  const unit = partition.unit === null ? tag('Thiếu đơn vị', 'warn') : escape(partition.unit);
  if (partition.subtotal === null) return `<p><b>Không tính tổng.</b> Chưa đủ điều kiện cộng các dòng; không hiển thị bằng 0.</p>`;
  if (partition.complete) return `<p><b>Tổng theo khung thành viên nguồn đã khai báo:</b> ${escape(partition.subtotal)} ${unit}. Chỉ áp dụng cho thước đo và khung này; không phải nhu cầu hay tổng thị trường.</p>`;
  return `<p><b>Tổng một phần của các dòng có số:</b> ${escape(partition.subtotal)} ${unit} ${tag('Chưa đủ dữ liệu bắt buộc', 'warn')}</p>`;
}

function m05(methods: DescriptiveMarketMethods, citations: ReportCitations): Omit<DescriptiveSectionView, 'html'> & { body: string } {
  const section = methods.sections.M05;
  const unresolved: string[] = [];
  let usable = false;
  const parts = section.partitions.map((partition, index) => {
    const rows = partition.recordPointers.map(pointer => {
      const row = recordAt(methods.input.m05, pointer, 'm05');
      if (!row) { unresolved.push(pointer); return unresolvedRow(pointer, 4); }
      usable ||= hasSourceValue(row);
      return `<tr><td>${entityCell(row)}</td><td>${storedLiteral(row.sourceWording, WITHHELD.wording)}</td><td>${valueCell(row)}</td><td>${sourceCell(methods.input, row.source, citations)}</td></tr>`;
    }).join('');
    const c = partition.coverage;
    return `<h3>${escape(`${index + 1}. `)}${storedLiteral(partition.measureLiteral, WITHHELD.measure)}</h3><dl><dt>Đơn vị</dt><dd>${partition.unit === null ? tag('Thiếu đơn vị', 'warn') : escape(partition.unit)}</dd><dt>Kỳ quan sát</dt><dd>${periodCell(partition.period)}</dd><dt>Phạm vi nguồn</dt><dd>${scopeText(partition.scope)}</dd><dt>Độ phủ dòng</dt><dd>Có số ${escape(c.observedCount)} · Bằng 0 ${escape(c.zeroCount)} · Thiếu ${escape(c.missingCount)} · UNKNOWN ${escape(c.unknownCount)} · Không chính xác ${escape(c.nonExactCount)}</dd></dl>${subtotalText(partition)}${blockerList(partition.blockers)}${table('Thước đo nguyên văn của nguồn theo từng dòng. Không phải nhu cầu hay quy mô thị trường.', ['Đối tượng / thước đo', 'Lời trong nguồn', 'Giá trị nguồn', 'Vị trí nguồn'], rows)}`;
  }).join('');
  const lead = `<p>${escape(section.locatedRecordCount)} bản ghi nguồn được định vị, chia theo thước đo nguyên văn, đơn vị, kỳ và phạm vi của nguồn. Số tìm kiếm hay doanh số giữ đúng tên nguồn; không đổi thành nhu cầu tổng.</p>`;
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
    return `<tr><td>${entityCell(row)}<br><small>${storedLiteral(record.objectLiteral, WITHHELD.entity)} · ${storedLiteral(row.sourceWording, WITHHELD.wording)}</small></td><td>${record.statusLiteral === null ? tag('Nguồn không nêu', 'warn') : storedLiteral(record.statusLiteral, WITHHELD.status)}</td><td>${storedLiteral(row.measureLiteral, WITHHELD.measure)}<br>${valueCell(row)}</td><td>${periodCell(row.period)}<br><small>Ý nghĩa ngày: ${storedLiteral(record.dateMeaning, WITHHELD.basis)}</small></td><td>${sourceCell(methods.input, row.source, citations)}</td></tr>`;
  }).join('');
  const lead = `<p>${escape(section.locatedRecordCount)} bản ghi cung do nguồn nêu. Số đối tượng duy nhất: chưa xác định. Bản ghi listing không phải sản phẩm độc lập, tồn kho, năng lực hay toàn bộ nguồn cung.</p>`;
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
    ? `<p>${escape(section.recordPointers.length)} quan sát theo thứ tự nhóm đối thủ do người dùng khai báo. Nhóm gần giống không tự trở thành đối thủ đã duyệt.</p>`
    : `<p>Danh mục chưa xếp hạng: ${escape(section.recordPointers.length)} quan sát theo thứ tự vị trí nguồn. Chưa có nhóm đối thủ được khai báo, nên không so sánh, xếp hạng hay tính thị phần.</p>`;
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
    const dates = `Ngày đăng: ${row.publicationDate === null ? 'chưa rõ' : escape(row.publicationDate)}<br>Ngày sự kiện: ${row.eventDate === null ? 'chưa rõ' : escape(row.eventDate)}<br><small>${storedLiteral(row.dateBasis, WITHHELD.basis)}</small>`;
    const target = `${storedLiteral(row.namedScope, WITHHELD.entity)}<br><small>Chỉ số nêu: ${row.affectedMetricLiteral === null ? 'không nêu' : storedLiteral(row.affectedMetricLiteral, WITHHELD.measure)} · ${row.targetLink === null ? 'chưa liên kết đối tượng' : 'đã liên kết đối tượng'}</small>`;
    const conflicts = row.conflictRefs.length ? `<br><small>${escape(row.conflictRefs.length)} bằng chứng mâu thuẫn được nguồn ghi nhận</small>` : '';
    return `<tr><td>${escape(EVENT_TYPE[row.statementType])}<br><small>Người nêu: ${storedLiteral(row.attribution, WITHHELD.person)}</small></td><td>${storedLiteral(row.sourceWording, WITHHELD.wording)}</td><td>${dates}</td><td>${target}</td><td>${sourceCell(methods.input, row.source, citations)}${conflicts}${blockerList(event.blockers)}</td></tr>`;
  }).join('');
  const lead = `<p>${escape(section.locatedRecordCount)} phát biểu hoặc sự kiện có nguồn, ngày và người nêu. Đây là lời được quy cho nguồn; không phải nguyên nhân, xác suất hay mức tác động.</p>`;
  const body = `${lead}${rows ? table('Sự kiện và phát biểu có nguồn.', ['Loại / người nêu', 'Lời trong nguồn', 'Ngày', 'Phạm vi nêu tên', 'Vị trí nguồn'], rows) : ''}${blockerList(section.blockers)}`;
  return { usable, locatedRecordCount: section.locatedRecordCount, unresolvedPointers: unresolved, blockers: section.blockers, body };
}

export function describeDescriptiveSection(methods: DescriptiveMarketMethods, sectionId: DescriptiveSectionId, citations: ReportCitations): DescriptiveSectionView {
  const { body, ...view } = { M05: m05, M06: m06, M07: m07, M09: m09 }[sectionId](methods, citations);
  return { ...view, html: `${methodNote(view.usable)}${body}${limitations(methods)}` };
}

/** Package and method identity belong in the M13 appendix, not in the analytical sections. */
export function descriptiveAppendix(methods: DescriptiveMarketMethods | undefined, failure?: 'DESCRIPTIVE_METHOD_FAILED'): string {
  if (methods === undefined && failure) return '<h3>Hồ sơ đối chiếu phương pháp mô tả thị trường</h3><p>Đã thử chạy phương pháp mô tả nhưng đầu vào hoặc phương pháp không vượt qua kiểm tra. Không có kết quả phương pháp dùng được cho M05, M06, M07 và M09. Bản thu nguồn vẫn được giữ trong bản kê phía trên; cần kiểm tra lỗi trước khi tạo phiên bản mới, không tự động gọi lại nguồn.</p>'
    + `<details class="evidence-trace"><summary>Mã đối chiếu của lần chạy lỗi</summary><p><code>${escape(failure)}</code></p></details>`;
  if (methods === undefined) return '<h3>Hồ sơ đối chiếu phương pháp mô tả thị trường</h3><p>Không có kết quả trong lượt này. Phương pháp chỉ chạy khi lượt có quan sát sản phẩm hợp lệ từ bản thu nguồn. Các mục M05, M06, M07 và M09 không có kết quả phương pháp.</p>';
  const pkg = methods.input.sourcePackage;
  const config = methods.input.configuration;
  const sources = methods.input.sources.map(source => `<tr><td>${storedLiteral(source.logicalPath, 'Tệp được giữ trong bản lưu nguồn')}</td><td>${storedLiteral(source.evidenceFamily, 'Nhóm nguồn được giữ trong bản lưu')}</td><td>${escape(PROVENANCE_TEXT[source.providerProvenance])}</td><td><code>${escape(source.sha256)}</code></td></tr>`).join('');
  return `<details class="evidence-trace"><summary>Hồ sơ đối chiếu phương pháp mô tả thị trường: gói nguồn, cấu hình và tệp</summary><dl><dt>Phương pháp</dt><dd>${escape(methods.methodId)}@${escape(methods.methodVersion)}</dd><dt>Mã kết quả</dt><dd><code>${escape(methods.methodOutputId)}</code></dd><dt>Gói nguồn</dt><dd>${escape(pkg.packageId)} · phiên bản ${escape(pkg.version)}</dd><dt>Bản kê gói</dt><dd><code>${escape(pkg.manifestArtifactSha256)}</code></dd><dt>Nội dung gói</dt><dd><code>${escape(pkg.packageContentSha256)}</code></dd><dt>Cấu hình</dt><dd>${escape(config.profileId)}@${escape(config.profileVersion)} · ${escape(config.policyRevision)}</dd><dt>Câu hỏi</dt><dd>${escape(methods.input.question)}</dd><dt>Phạm vi khai báo</dt><dd>${scopeText(methods.input.scope)}<br><small>Gồm: ${escape(methods.input.scope.inclusionRule)} · Loại: ${escape(methods.input.scope.exclusionRule)} · Biến thể: ${escape(methods.input.scope.variantRule)}</small></dd></dl>${table('Tệp nguồn của hồ sơ phương pháp. Hash chỉ chứng minh tính toàn vẹn, không chứng minh nội dung đúng.', ['Tệp logic', 'Nhóm bằng chứng', 'Nguồn gốc', 'SHA-256'], sources)}</details>`;
}
