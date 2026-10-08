import type {
  LocatedInsightMethods, Field, Provenance, Relation, Span,
} from '../../../contracts/analysis/located-insight-methods.generated.js';
import { attributionText, retainedQuoteHtml, reviewRecordMark, storedLiteral, technicalLiteral, type ReportCitations } from './research-automation/descriptive-report.js';

type Input = LocatedInsightMethods['input'];
type LocatedId = 'I02' | 'I04' | 'I05' | 'I06' | 'I07' | 'I08' | 'I09';
type Annotation = Input['i02'][number] | Input['i04'][number] | Input['i05'][number]
  | Input['i06'][number] | Input['i07'][number] | Input['i08'][number] | Input['i09'][number];
type RenderContext = { output: LocatedInsightMethods; sectionId: string; records: Set<number>; bundleDownload: boolean; showAnnotationPendingCount: boolean; citations: ReportCitations | undefined };

const PAGE_LIMIT = 20;
const esc = (value: string | number): string => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]!);
const download = '<a href="located-insight-bundle.json" download>Tải toàn bộ hồ sơ Insight định vị</a>';
const label = (value: string): string => esc(LABELS[value] ?? value);
const LABELS: Readonly<Record<string, string>> = {
  SOURCE_STATED: 'Nguồn có nêu', NOT_STATED: 'Nguồn không nêu', UNKNOWN: 'Chưa rõ',
  CONFLICTING: 'Có mâu thuẫn', UNLOCATED: 'Chưa định vị',
  POSITIVE: 'Tích cực', NEGATIVE: 'Tiêu cực', MIXED: 'Hỗn hợp', NEUTRAL: 'Trung tính', UNCLEAR: 'Chưa rõ',
  ATTEMPT_REPORTED: 'Nguồn kể về việc thử', ACTION_REPORTED: 'Nguồn kể về hành động',
  COMPLETION_REPORTED: 'Nguồn kể đã hoàn tất', NO_ACTION_EXPLICIT: 'Nguồn nói rõ không hành động',
  NOT_REPORTED: 'Chưa được kể', SOURCE_LOGGED: 'Theo ghi chép của nguồn',
  SELF_REPORTED: 'Tự thuật', OTHER_REPORTED: 'Người khác kể lại',
  SELF_STATED: 'Người nói tự nêu', SOURCE_ATTRIBUTED: 'Nguồn quy lời',
  PRICE_COST: 'Giá và chi phí', ACCESS_AVAILABILITY: 'Tiếp cận và sẵn có', FIT_NEED: 'Phù hợp nhu cầu',
  PRODUCT_ATTRIBUTE: 'Thuộc tính sản phẩm', INFORMATION_TRUST: 'Thông tin và niềm tin', OTHER_EXPLICIT: 'Khác, được nêu rõ',
  AFFIRMED: 'Khẳng định', NEGATED: 'Phủ định', CONDITIONAL: 'Có điều kiện',
  EXPLICIT_GAP: 'Cặp chênh lệch được nêu', DESIRE_ONLY: 'Chỉ có mong muốn',
  CURRENT_STATE_ONLY: 'Chỉ có hiện trạng', RELATION_UNCLEAR: 'Quan hệ chưa rõ',
};
/** Vietnamese gloss beside a raw blocker or limitation code; the code itself stays visible for lookup. */
const CODE_GLOSS: Readonly<Record<string, string>> = {
  NO_LOCATED_ANNOTATIONS: 'chưa có mã hóa định vị được chấp nhận', CODING_PENDING: 'còn mã hóa chờ xử lý',
  QUESTION_UNSET: 'chưa có câu hỏi nghiên cứu', I01_OWNER_QUESTION_REQUIRED: 'cần câu hỏi do người dùng đặt',
  WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER: 'câu hỏi làm việc do AI đề xuất, chờ chủ dự án xác nhận',
  I06_EVENT_ORDER_UNRESOLVED: 'chưa xác lập thứ tự sự kiện', I09_INCOMPLETE_GAP_EVIDENCE: 'bằng chứng chênh lệch chưa đủ cả hai vế',
  NORMALIZED_DECLARATIONS_REQUIRE_RETAINED_SOURCE_BYTE_VERIFICATION: 'khai báo đã chuẩn hóa cần đối chiếu với byte nguồn đã lưu',
  POINTER_VALIDATION_IS_NOT_SEMANTIC_VERIFICATION_OR_OWNER_APPROVAL: 'con trỏ hợp lệ không có nghĩa nội dung đúng hay đã được duyệt',
  DECLARED_AND_HUMAN_REVIEWED_ARE_RETAINED_PROVENANCE_NOT_AUTHENTICATED_AUTHORITY: 'nhãn khai báo hoặc người xem là dấu vết được giữ, không phải thẩm quyền đã xác thực',
  PENDING_AI_AND_UNRESOLVED_DISAGREEMENTS_ARE_NOT_ACCEPTED_CODES: 'đề xuất AI chờ duyệt và bất đồng chưa xử lý không phải mã đã chấp nhận',
  FULL_RECORD_CONTEXT_RETAINS_NEGATION_CONDITIONS_HEARSAY_AND_ATTRIBUTION: 'toàn văn giữ phủ định, điều kiện, lời kể lại và người nói',
  RECORD_LOCAL_RELATIONS_ARE_DECLARED_CODING_NOT_INDEPENDENTLY_OBSERVED_JOURNEYS: 'quan hệ trong một bản ghi là mã hóa khai báo, không phải hành trình quan sát độc lập',
  LOCATED_RECORDS_NOT_PEOPLE_POPULATION_PREVALENCE_MARKET_SIZE_OR_CAUSAL_EFFECT: 'bản ghi định vị không phải số người, mức phổ biến, quy mô thị trường hay tác động nhân quả',
  CORPUS_RATIOS_ONLY_FOR_THE_EXPLICIT_FROZEN_CORPUS: 'tỷ lệ chỉ áp dụng trong tập bản ghi đã chốt',
  I13_EXACT_LITERAL_PHRASE_COUNTS_ONLY_NO_ALIAS_OR_SEMANTIC_CATEGORY_MAPPING: 'chỉ đếm cụm từ nguyên văn, không gộp từ đồng nghĩa hay nhóm ý nghĩa',
};
const codeItem = (code: string): string => `<li><code>${technicalLiteral(code)}</code>${CODE_GLOSS[code] ? ` <small>${esc(CODE_GLOSS[code])}</small>` : ''}</li>`;
const BRIEF_FIELDS = [
  ['questionText', 'Câu hỏi kinh doanh'], ['decisionToInform', 'Quyết định cần thông tin'],
  ['intendedAudience', 'Người đọc dự kiến'], ['scope', 'Phạm vi'], ['knownConstraints', 'Ràng buộc đã biết'],
] as const;

function locatedAt<T>(rows: readonly T[], pointer: string, prefix: string): T {
  const suffix = pointer.startsWith(prefix) ? pointer.slice(prefix.length) : '';
  const row = /^(0|[1-9]\d*)$/.test(suffix) ? rows[Number(suffix)] : undefined;
  if (row === undefined) throw new TypeError(`located insight HTML: UNRESOLVED_POINTER:${pointer}`);
  return row;
}

function sliceNote(ctx: RenderContext, total: number, noun: string): string {
  return total <= PAGE_LIMIT ? '' : `<p class="sec-note">Đang hiển thị ${PAGE_LIMIT} trong ${total} ${esc(noun)}, theo thứ tự của hồ sơ. ${ctx.bundleDownload ? `Phần còn lại nằm trong bản tải đầy đủ. ${download}.` : 'Phần còn lại được giữ trong hồ sơ phương pháp đã lưu; trang này không hiển thị toàn bộ.'}</p>`;
}

function table(caption: string, headings: readonly string[], rows: readonly string[]): string {
  return `<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0"><table class="obs"><caption>${esc(caption)}</caption><thead><tr>${headings.map(heading => `<th scope="col">${esc(heading)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

const quote = (span: Span | null): string => span === null ? '<span>Chưa có đoạn nguồn</span>'
  : retainedQuoteHtml(span.quote);
const field = (value: Field): string => `${value.span === null ? '' : `${quote(value.span)}<br>`}<small>${label(value.state)}</small>`;
const textOrUnset = (value: string | null): string => value === null ? 'Chưa khai báo' : storedLiteral(value, 'Thông tin được giữ trong bản lưu nguồn');
const definition = (name: string, html: string): string => `<dt>${esc(name)}</dt><dd>${html}</dd>`;
// Table cells cannot afford the theme's separate 120px label column.
const nestedDefinitions = '<dl style="grid-template-columns:minmax(0,1fr);gap:4px">';

function provenance(value: Provenance): string {
  const basis = value.basis === 'PENDING_AI' ? 'Gợi ý AI đang chờ xử lý'
    : value.basis === 'HUMAN_REVIEWED' ? 'Hồ sơ khai báo đã được người rà soát' : 'Mã hóa do hồ sơ khai báo';
  return `<details><summary>Nguồn gốc mã hóa</summary><p>${basis}. Khai báo này chưa được xác thực thành phê duyệt.</p>${nestedDefinitions}${definition('Vai trò người mã hóa', textOrUnset(value.coderRole))}${definition('Ghi chú phân xử', textOrUnset(value.adjudication))}${definition('Bất đồng còn lại', textOrUnset(value.disagreement))}</dl></details>`;
}

function source(ctx: RenderContext, recordIndex: number): string {
  const record = ctx.output.input.records[recordIndex];
  if (!record) throw new TypeError('located insight HTML: UNKNOWN_RECORD');
  ctx.records.add(recordIndex);
  return `<p>Bản ghi ${recordIndex + 1} ${ctx.citations ? reviewRecordMark(record, ctx.citations) : ''}<br><small>Thời điểm theo nguồn: ${textOrUnset(record.timeText)}</small></p><a href="#located-${ctx.sectionId}-record-${recordIndex}">Đọc toàn văn và vị trí nguồn của bản ghi ${recordIndex + 1}</a>`;
}

function annotationContext(ctx: RenderContext, row: Annotation): string {
  const qualifiers = row.qualifiers.length === 0 ? '' : `<h5>Điều kiện và giới hạn được giữ lại</h5><ul class="limits">${row.qualifiers.map(span => `<li>${quote(span)}</li>`).join('')}</ul>`;
  const counter = row.counterevidence.length === 0 ? '' : `<h5>Bằng chứng ngược trong bản ghi</h5><ul class="limits">${row.counterevidence.map(span => `<li>${quote(span)}</li>`).join('')}</ul>`;
  return `${source(ctx, row.recordIndex)}${qualifiers}${counter}${provenance(row.provenance)}<details><summary>Ghi nguồn, nguyên văn</summary><p>${attributionText(ctx.output.input.records[row.recordIndex]!.sourceAttribution, 'Chưa có ghi nhận nguồn')}</p></details>`;
}

function relation(value: Relation | null): string {
  return value === null ? '<p>Chưa có đoạn nguồn nêu quan hệ giữa hai phần.</p>'
    : `${nestedDefinitions}${definition('Đoạn nối quan hệ', quote(value.link))}</dl><details><summary>Ngữ cảnh của quan hệ trong cùng bản ghi</summary><p>${quote(value.context)}</p></details>`;
}

function originalRecords(ctx: RenderContext): string {
  if (ctx.records.size === 0) return '';
  return `<h4>Toàn văn bản ghi được trích</h4><p class="sec-note">Số “Bản ghi N” đếm từ 1; chỉ số bản ghi trong con trỏ của hồ sơ phương pháp đếm từ 0, nên Bản ghi N ứng với chỉ số N − 1. Vị trí trong nguồn được giữ đúng như nguồn ghi.</p>${[...ctx.records].map(index => {
    const record = ctx.output.input.records[index]!;
    const paths = ctx.output.input.sources.filter(item => item.sha256 === record.sourceSha256).map(item => item.logicalPath);
    return `<details id="located-${ctx.sectionId}-record-${index}"><summary>Bản ghi ${index + 1}: nguyên văn và thông tin nguồn</summary><p class="sec-note">Giữ nguyên lời nguồn, kể cả phủ định, điều kiện và lời kể lại. Các mã hóa phía trên là khai báo cần được xem xét cùng toàn văn.</p><div style="white-space:pre-wrap">${record.text === null ? 'Bản ghi không đọc được.' : storedLiteral(record.text, 'Nguyên văn được giữ trong bản lưu nguồn; không đưa vào bản đọc này.')}</div><dl>${definition('Ghi nguồn, nguyên văn', attributionText(record.sourceAttribution, 'Chưa có ghi nhận nguồn'))}${definition('Tệp nguồn', paths.map(technicalLiteral).join('<br>'))}${definition('Vị trí trong nguồn', `<code>${technicalLiteral(record.locator)}</code>`)}${definition('SHA-256 nguồn', `<code>${esc(record.sourceSha256)}</code>`)}${definition('Thời điểm theo nguồn', textOrUnset(record.timeText))}</dl></details>`;
  }).join('')}`;
}

function footer(ctx: RenderContext, blockers: readonly string[]): string {
  return `${originalRecords(ctx)}<p class="sec-note">Các bản ghi và khai báo mã hóa có vị trí nguồn; vị trí đúng chưa chứng minh cách hiểu đúng hoặc quyền phê duyệt. ${ctx.bundleDownload ? `${download}.` : 'Hồ sơ đầy đủ được giữ cùng kết quả phương pháp đã lưu.'}</p><details><summary>Giới hạn và thông tin đối chiếu</summary><p>Đơn vị là bản ghi định vị trong hồ sơ này. Không suy rộng thành số người, tỷ lệ dân số hay thị phần.</p><dl>${definition('Bộ mã', textOrUnset(ctx.output.input.codebookId))}${definition('Quy tắc đưa vào', textOrUnset(ctx.output.input.inclusionRule))}${definition('Quy tắc phân xử', textOrUnset(ctx.output.input.adjudicationRule))}${definition('Mã kết quả', `<code>${esc(ctx.output.methodOutputId)}</code>`)}</dl>${blockers.length ? `<p>Điều kiện còn thiếu hoặc cần xử lý:</p><ul class="limits">${blockers.map(codeItem).join('')}</ul>` : ''}<ul class="limits">${ctx.output.limitations.map(codeItem).join('')}</ul></details>`;
}

function briefBody(ctx: RenderContext): string {
  const brief = ctx.output.input.brief;
  const fields = BRIEF_FIELDS.map(([key, title]) => {
    const value = brief?.[key];
    return definition(title, value?.state === 'SUPPLIED' && value.text !== null
      ? `<div style="white-space:pre-wrap">${textOrUnset(value.text)}</div>` : '<span class="tag warn">Chưa cung cấp (UNSET)</span>');
  }).join('');
  // U-02: the working question is separate from the owner brief. An AI-proposed one is labelled and never owner-authored.
  const working = ctx.output.sections.I01.workingQuestion;
  const workingBlock = working?.state === 'AI_PROPOSED_AWAITING_OWNER'
    ? `<div class="sec-note"><p><span class="tag warn">${esc(working.label ?? CODE_GLOSS.WORKING_QUESTION_AI_PROPOSED_AWAITING_OWNER!)}</span></p>${working.text === null
      ? '<p>Chưa có nội dung câu hỏi đề xuất; chủ dự án cần bổ sung câu hỏi.</p>'
      : `<div style="white-space:pre-wrap">${storedLiteral(working.text, 'Nội dung được giữ trong bản lưu nguồn; không đưa vào bản đọc này.')}</div>`}<p>Câu hỏi này do hệ thống hoặc mô hình đề xuất, chưa được chủ dự án xác nhận, và không được dùng để chọn lọc hay loại bỏ bằng chứng.</p></div>`
    : working?.state === 'OWNER_SUPPLIED' ? '<p>Câu hỏi làm việc do chủ dự án cung cấp trong brief.</p>' : '';
  return `<p class="sec-note">Brief do hồ sơ khai báo. Nội dung và phiên bản này chưa được xác thực thành phê duyệt của chủ dự án.</p>${workingBlock}${brief === null ? '<p>Chưa có brief. Cần bổ sung các trường dưới đây trước khi dùng làm câu hỏi nghiên cứu đã chốt.</p>' : `<p>Phiên bản brief: ${textOrUnset(brief.version)}.</p>`}<dl>${fields}</dl>${brief ? `<p>Các mục được chọn trong brief: ${brief.selectedSectionIds.length ? brief.selectedSectionIds.map(esc).join(', ') : 'chưa chọn'}.</p>` : ''}${footer(ctx, ctx.output.sections.I01.blockers)}`;
}

function annotationRow(ctx: RenderContext, sectionId: LocatedId, pointer: string): string {
  const input = ctx.output.input;
  let body: string;
  let annotation: Annotation;
  switch (sectionId) {
    case 'I02': {
      const row = locatedAt(input.i02, pointer, '/input/i02/'); annotation = row;
      body = `${nestedDefinitions}${definition('Vai trò', field(row.role))}${definition('Hoàn cảnh', field(row.situation))}${definition('Việc cần làm', field(row.task))}${definition('Bối cảnh', field(row.setting))}${definition('Thời gian', field(row.time))}</dl>`;
      break;
    }
    case 'I04': {
      const row = locatedAt(input.i04, pointer, '/input/i04/'); annotation = row;
      body = `<p>${quote(row.span)}</p><p><b>${label(row.eventKind)}</b><br>${label(row.attribution)}</p>`;
      break;
    }
    case 'I05': {
      const row = locatedAt(input.i05, pointer, '/input/i05/'); annotation = row;
      body = `<p>${quote(row.span)}</p><p><b>${label(row.polarity)}</b></p>${nestedDefinitions}${definition('Đối tượng được nói tới', field(row.target))}${definition('Người phát biểu', field(row.speakerAttribution))}</dl>`;
      break;
    }
    case 'I06': {
      const row = locatedAt(input.i06, pointer, '/input/i06/'); annotation = row;
      const ordered = ctx.output.sections.I06.sequences.some(item => item.annotationPointer === pointer);
      body = ordered ? `<p>Thứ tự do nguồn nêu trong cùng bản ghi:</p><ol><li>${quote(row.firstEvent)}</li><li>${quote(row.secondEvent)}</li></ol>`
        : `<p><b>Chưa xác lập thứ tự.</b></p>${nestedDefinitions}${definition('Sự kiện thứ nhất trong khai báo', quote(row.firstEvent))}${definition('Sự kiện thứ hai trong khai báo', quote(row.secondEvent))}</dl>`;
      body += relation(row.relation);
      break;
    }
    case 'I07': {
      const row = locatedAt(input.i07, pointer, '/input/i07/'); annotation = row;
      body = `${nestedDefinitions}${definition('Lựa chọn được nêu', quote(row.choiceText))}${definition('Mệnh đề lý do', quote(row.reasonClause))}${definition('Nhóm lý do khai báo', label(row.reasonFacet))}${definition('Cách nêu lý do', label(row.reasonPolarity))}${definition('Cơ sở lời nói', label(row.speakerBasis))}${definition('Kết quả được nêu', field(row.resultState))}</dl>${relation(row.relation)}`;
      break;
    }
    case 'I08': {
      const row = locatedAt(input.i08, pointer, '/input/i08/'); annotation = row;
      body = `${nestedDefinitions}${definition('Việc định làm hoặc đã thử', quote(row.attemptedTask))}${definition('Mệnh đề trở ngại', quote(row.obstacleClause))}${definition('Nhóm rào cản khai báo', label(row.barrierFacet))}${definition('Tình trạng giải quyết', field(row.resolutionState))}</dl>${relation(row.relation)}`;
      break;
    }
    case 'I09': {
      const row = locatedAt(input.i09, pointer, '/input/i09/'); annotation = row;
      const candidate = ctx.output.sections.I09.candidates.find(item => item.annotationPointer === pointer);
      body = `<p><b>${candidate ? label(candidate.state) : 'Mã hóa đang chờ xử lý'}</b></p>${nestedDefinitions}${definition('Mong muốn', quote(row.desiredState))}${definition('Hiện trạng', quote(row.currentState))}${definition('Cách xoay xở được nêu', field(row.workaround))}</dl>${relation(row.relation)}<p class="sec-note">${candidate === undefined ? 'Chờ xử lý mã hóa; chưa đưa ra ứng viên từ chú giải này.' : candidate.unmetNeedCandidate ? 'Ứng viên nhu cầu chưa đáp ứng từ cặp chênh lệch đã khai báo; cần xem xét ý nghĩa trong nguồn.' : 'Chưa đủ cặp chênh lệch để ghi nhận ứng viên nhu cầu chưa đáp ứng.'}</p>`;
      break;
    }
  }
  return `<tr><td>${body}</td><td>${annotationContext(ctx, annotation)}</td></tr>`;
}

const SECTION_LEAD: Readonly<Record<LocatedId, string>> = {
  I02: 'Vai trò, hoàn cảnh và việc cần làm chỉ lấy từ trường có đoạn nguồn. Trường chưa rõ được giữ riêng.',
  I04: 'Các hành động được nguồn kể hoặc ghi lại. Mã trạng thái giữ riêng việc thử, hành động, hoàn tất và không hành động.',
  I05: 'Cảm nhận được giữ theo từng mệnh đề và đối tượng. Các sắc thái trái chiều trong cùng bản ghi vẫn hiện cùng nhau.',
  I06: 'Chỉ hiện thứ tự khi hồ sơ có quan hệ được nêu trong cùng bản ghi. Không nối các bản ghi thành hành trình của một người.',
  I07: 'Lựa chọn và mệnh đề lý do phải nằm trong cùng bản ghi. Phủ định, điều kiện và lời kể lại được giữ riêng.',
  I08: 'Việc định làm và trở ngại được đặt cạnh đoạn nối quan hệ trong cùng bản ghi.',
  I09: 'Mong muốn và hiện trạng được đặt cạnh nhau để xem xét chênh lệch. Một lời phàn nàn riêng lẻ chưa xác lập nhu cầu chưa đáp ứng.',
};

function locatedBody(ctx: RenderContext, sectionId: LocatedId): string {
  const section = ctx.output.sections[sectionId];
  const flagged = ctx.output.input.draftCountsVersion === 'draft-counts-v1';
  let body = `<p class="sec-note">${SECTION_LEAD[sectionId]}</p>`;
  if (draftMode(section) && 'draftAnnotationPointers' in section) {
    // Draft mode: the leading totals ARE the eligible draft numbers with the
    // same-sentence label, including zero. No competing unlabelled accepted
    // totals precede them.
    const pointers = section.draftAnnotationPointers ?? [];
    const label = 'draftLabel' in section ? section.draftLabel ?? 'đề xuất, chờ chủ duyệt' : 'đề xuất, chờ chủ duyệt';
    const count = 'draftLocatedRecordCount' in section ? section.draftLocatedRecordCount ?? pointers.length : pointers.length;
    body += `<p>${count} bản ghi (${label}). Các khai báo này chưa được xác thực về ý nghĩa hay phê duyệt.</p>`;
  } else if (flagged) {
    // Unsupported family in a draft view: withhold classified totals with an
    // explicit unavailable explanation instead of showing bare accepted
    // numbers. Pending details and polarities below are not totals and stay.
    body += `<p>Bản nháp này chưa tính số đề xuất cho mục ${sectionId} (chỉ hỗ trợ I02/I10/I13); số chi tiết không hiển thị ở đây.</p>`;
  } else {
    body += `<p>${section.locatedRecordCount} bản ghi có mã hóa được hồ sơ đưa vào kết quả${ctx.showAnnotationPendingCount ? `; ${section.pendingAnnotationPointers.length} chú giải đang chờ xử lý` : ''}. Các khai báo này chưa được xác thực về ý nghĩa hay phê duyệt.</p>`;
  }
  if (sectionId === 'I05' && ctx.output.sections.I05.recordPolarities.length) {
    const polarities = ctx.output.sections.I05.recordPolarities;
    body += table('Sắc thái theo bản ghi, không quy đổi thành tỷ lệ', ['Bản ghi nguồn', 'Sắc thái khai báo'], polarities.slice(0, PAGE_LIMIT).map(item => {
      locatedAt(ctx.output.input.records, item.recordPointer, '/input/records/');
      const index = Number(item.recordPointer.slice('/input/records/'.length));
      return `<tr><td>${source(ctx, index)}</td><td>${label(item.polarity)}</td></tr>`;
    })) + sliceNote(ctx, polarities.length, 'bản ghi');
  }
  body += section.annotationPointers.length === 0 && !draftMode(section) && !flagged
    ? '<p>Chưa có chú giải được đưa vào kết quả cho mục này. Cần bổ sung mã hóa có vị trí nguồn và xử lý các mục đang chờ.</p>'
    : draftMode(section) ? draftSummaryTable(ctx, sectionId, section)
    : flagged ? ''
    : table('Chú giải được hồ sơ đưa vào kết quả', ['Nội dung và mã hóa', 'Nguồn và ngữ cảnh'], section.annotationPointers.slice(0, PAGE_LIMIT).map(pointer => annotationRow(ctx, sectionId, pointer))) + sliceNote(ctx, section.annotationPointers.length, 'chú giải');
  if (section.pendingAnnotationPointers.length) body += pendingDetails(ctx, sectionId, section);
  return body + footer(ctx, section.blockers);
}

/** Draft-mode display switch. Present draft fields mean the builder ran flagged; absent means legacy bytes. */
function draftMode(section: { readonly annotationPointers: readonly string[]; readonly draftAnnotationPointers?: readonly string[] }): boolean {
  return section.draftAnnotationPointers !== undefined;
}

/**
 * Version-gated draft display: the shown totals ARE the mixed eligible draft
 * counts with the same-sentence label, including zero. Accepted-only numbers
 * are not shown as competing totals; disagreements stay in the pending list.
 * The leading count line is rendered by the caller; this renders the table.
 */
function draftSummaryTable(ctx: RenderContext, sectionId: LocatedId, section: { readonly annotationPointers: readonly string[]; readonly pendingAnnotationPointers: readonly string[]; readonly draftAnnotationPointers?: readonly string[]; readonly draftLocatedRecordCount?: number; readonly draftLabel?: string }): string {
  const pointers = section.draftAnnotationPointers ?? [];
  const label = section.draftLabel ?? 'đề xuất, chờ chủ duyệt';
  return table(`Chú giải ${label} (${pointers.length})`,
    ['Nội dung đề xuất', 'Nguồn và ngữ cảnh'],
    pointers.slice(0, PAGE_LIMIT).map(pointer => annotationRow(ctx, sectionId, pointer))) +
    sliceNote(ctx, pointers.length, 'chú giải đề xuất');
}

function pendingDetails(ctx: RenderContext, sectionId: LocatedId, section: { readonly annotationPointers: readonly string[]; readonly pendingAnnotationPointers: readonly string[]; readonly draftAnnotationPointers?: readonly string[] }): string {
  const draft = new Set(section.draftAnnotationPointers ?? []);
  const remaining = section.pendingAnnotationPointers.filter(pointer => !draft.has(pointer));
  const copy = section.draftAnnotationPointers === undefined
    ? `<details><summary>Chú giải đang chờ xử lý (${section.pendingAnnotationPointers.length})</summary><p>Gợi ý AI hoặc bất đồng chưa phân xử được giữ riêng, chưa đưa vào kết quả mã hóa.</p>${table('Chú giải đang chờ, chưa đưa vào kết quả', ['Nội dung đề xuất', 'Nguồn và điều còn chờ'], section.pendingAnnotationPointers.slice(0, PAGE_LIMIT).map(pointer => annotationRow(ctx, sectionId, pointer)))}${sliceNote(ctx, section.pendingAnnotationPointers.length, 'chú giải đang chờ')}</details>`
    : !remaining.length ? '' : `<details><summary>Bất đồng chưa phân xử (${remaining.length})</summary><p>Các chú giải này còn bất đồng về mã hóa, được giữ riêng và chưa đưa vào kết quả đề xuất.</p>${table('Bất đồng chưa phân xử', ['Nội dung đề xuất', 'Nguồn và điều còn chờ'], remaining.slice(0, PAGE_LIMIT).map(pointer => annotationRow(ctx, sectionId, pointer)))}${sliceNote(ctx, remaining.length, 'bất đồng')}</details>`;
  return copy;
}

function corpusBody(ctx: RenderContext, sectionId: 'I10' | 'I13'): string {
  const section = ctx.output.sections[sectionId];
  let body = `<p class="sec-note">${sectionId === 'I10' ? 'Số bản ghi mang từng mã trong phạm vi khai báo.' : 'Danh mục tên hoặc cụm nhắc nguyên văn, giữ thứ tự nguồn và vị trí, không xếp hạng thương hiệu.'} Chỉ hiện n/N khi việc mã hóa và mẫu số đã đầy đủ.</p>`;
  if (sectionId === 'I13') {
    const mentions = (pointers: readonly string[], pending: boolean): string => {
      if (!pointers.length) return '';
      const rows = pointers.slice(0, PAGE_LIMIT).map(pointer => {
        const item = locatedAt(ctx.output.input.i13Mentions, pointer, '/input/i13Mentions/');
        return `<tr><td>${quote(item.span)}</td><td>${source(ctx, item.recordIndex)}${provenance(item.provenance)}</td></tr>`;
      });
      return table(pending ? 'Cụm nhắc đang chờ xử lý' : 'Cụm nhắc nguyên văn, không xếp hạng', ['Cụm được nhắc', 'Nguồn và lời quy thuộc'], rows) + sliceNote(ctx, pointers.length, 'cụm nhắc');
    };
    body += section.mentionPointers.length ? mentions(section.mentionPointers, false) : '<p>Chưa có cụm nhắc nguyên văn được đưa vào danh mục.</p>';
    body += `<p>${section.pendingMentionPointers.length} cụm nhắc đang chờ xử lý.</p>`;
    if (section.pendingMentionPointers.length) body += `<details><summary>Xem cụm nhắc đang chờ (${section.pendingMentionPointers.length})</summary>${mentions(section.pendingMentionPointers, true)}</details>`;
  }
  if (!section.corpora.length) body += '<p>Chưa có tập bản ghi và bộ mã cho bảng đếm. Cần khai báo phạm vi, thành viên và tình trạng mã hóa trước khi có tỷ lệ.</p>';
  for (const result of section.corpora.slice(0, PAGE_LIMIT)) {
    const corpus = ctx.output.input.corpora[result.corpusIndex];
    if (!corpus) throw new TypeError('located insight HTML: UNKNOWN_CORPUS');
    const complete = result.codingComplete && result.ratioStatus === 'COMPLETE';
    const state = result.draftCounts !== undefined
      ? 'Bản nháp chưa đối chiếu xong; chưa công bố n/N.'
      : result.ratioStatus === 'ZERO_DENOMINATOR' ? 'Mẫu số bằng 0; không có tỷ lệ.'
      : complete ? 'Đã hoàn tất mẫu số và mã hóa theo khai báo của hồ sơ.' : 'Mã hóa hoặc thành viên chưa đầy đủ; chưa công bố n/N.';
    body += `<h4>${textOrUnset(corpus.question)}</h4><p><b>${state}</b></p>`;
    if (result.draftCounts === undefined) {
      body += `<p>${result.includedRecordCount} bản ghi thuộc diện đưa vào; ${result.pendingCount} bản ghi đang chờ mã hóa hoặc phân xử; ${result.unreadableCount} bản ghi không đọc được.</p><dl>${definition('Đơn vị khai báo', textOrUnset(corpus.unit))}${definition('Kỳ', textOrUnset(corpus.period))}${definition('Khung thu thập', textOrUnset(corpus.frame))}${definition('Kênh', textOrUnset(corpus.channel))}${definition('Quy tắc đưa vào', textOrUnset(corpus.inclusionRule))}${definition('Chọn mẫu bên ngoài', textOrUnset(corpus.externalSampling))}${definition('Phiên bản bộ mã', textOrUnset(corpus.codebook.revision))}</dl>`;
    } else {
      // Draft mode withholds accepted-state tallies instead of showing bare
      // classified numbers; the draft per-code table below carries the labels.
      body += `<p class="sec-note">Số tổng hợp chi tiết của tập này không hiển thị ở bản nháp; số đề xuất theo mã ở bảng dưới (${result.draftLabel ?? 'đề xuất, chờ chủ duyệt'}).</p><dl>${definition('Đơn vị khai báo', textOrUnset(corpus.unit))}${definition('Kỳ', textOrUnset(corpus.period))}${definition('Khung thu thập', textOrUnset(corpus.frame))}${definition('Kênh', textOrUnset(corpus.channel))}${definition('Quy tắc đưa vào', textOrUnset(corpus.inclusionRule))}${definition('Chọn mẫu bên ngoài', textOrUnset(corpus.externalSampling))}${definition('Phiên bản bộ mã', textOrUnset(corpus.codebook.revision))}</dl>`;
    }
    const coverage = [
      ['Thành viên duy nhất', result.membershipCount], ['Đưa vào', result.includedRecordCount],
      ['Loại ra', result.excludedCount], ['Không đọc được', result.unreadableCount],
      ['Đang chờ', result.pendingCount], ['Chưa rõ mã (UNCLEAR)', result.unclearCount],
      ['Không gán mã (UNCODED)', result.uncodedCount], ['Đã có mã', result.codedCount],
      ['Có nhiều mã', result.multiCodedCount], ['Tham chiếu lặp đã loại trùng', result.duplicateReferenceCount],
    ] as const;
    if (result.draftCounts === undefined) {
      body += `<details><summary>Phạm vi và mức hoàn tất mã hóa</summary><dl>${coverage.map(([name, value]) => definition(name, String(value))).join('')}</dl><p>Đang chờ, chưa rõ mã và không gán mã là các trạng thái khác nhau. Các số trên không cộng thành một tổng chung.</p></details>`;
    }
    const rows = result.counts.slice(0, PAGE_LIMIT).map(count => {
      const code = corpus.codebook.codes.find(item => item.code === count.code);
      if (!code) throw new TypeError('located insight HTML: UNKNOWN_CODE');
      const refs = count.annotationPointers.slice(0, PAGE_LIMIT).map(pointer => {
        const assignment = locatedAt(corpus.assignments, pointer, `/input/corpora/${result.corpusIndex}/assignments/`);
        return `<li>${quote(assignment.span)}${source(ctx, assignment.recordIndex)}${provenance(assignment.provenance)}</li>`;
      }).join('');
      const evidence = refs ? `<details><summary>Đoạn nguồn cho mã này</summary><ul class="limits">${refs}</ul>${sliceNote(ctx, count.annotationPointers.length, 'chú giải nguồn')}</details>` : '';
      const ratio = complete && count.ratio !== null ? `${count.ratio.numerator}/${count.ratio.denominator}` : 'Chưa công bố';
      return `<tr><th scope="row">${textOrUnset(code.label)}<small>Mã: ${textOrUnset(code.code)}</small>${sectionId === 'I10' ? `<small>Cụm mô tả trong bộ mã: ${textOrUnset(code.phrase)}</small>` : ''}</th><td>${count.recordCount}${evidence}</td><td>${ratio}</td></tr>`;
    });
    if (result.draftCounts === undefined) {
      body += table(complete ? 'Số bản ghi theo mã trong tập đã chốt' : 'Số bản ghi đã mã hóa, còn một phần', ['Mã hoặc cụm nguyên văn', 'Số bản ghi (n)', 'n/N trong tập này'], rows) + sliceNote(ctx, result.counts.length, 'mã');
    } else {
      // Draft mode: the displayed per-code totals ARE the mixed eligible draft
      // counts with the same-sentence label, including zero. Ratios are never
      // published from a draft view. Accepted-only numbers are not shown as
      // competing totals; disagreements stay in the pending list.
      const draftRows = result.draftCounts.slice(0, PAGE_LIMIT).map(count => {
        const code = corpus.codebook.codes.find(item => item.code === count.code);
        if (!code) throw new TypeError('located insight HTML: UNKNOWN_CODE');
        const refs = count.annotationPointers.slice(0, PAGE_LIMIT).map(pointer => {
          const assignment = locatedAt(corpus.assignments, pointer, `/input/corpora/${result.corpusIndex}/assignments/`);
          return `<li>${quote(assignment.span)}${source(ctx, assignment.recordIndex)}${provenance(assignment.provenance)}</li>`;
        }).join('');
        const evidence = refs ? `<details><summary>Đoạn nguồn cho mã này</summary><ul class="limits">${refs}</ul>${sliceNote(ctx, count.annotationPointers.length, 'chú giải nguồn')}</details>` : '';
        return `<tr><th scope="row">${textOrUnset(code.label)}<small>Mã: ${textOrUnset(code.code)}</small>${sectionId === 'I10' ? `<small>Cụm mô tả trong bộ mã: ${textOrUnset(code.phrase)}</small>` : ''}</th><td>${count.recordCount} (${count.label})${evidence}</td><td>Chưa công bố</td></tr>`;
      });
      body += table(`Số bản ghi theo mã (${result.draftLabel ?? 'đề xuất, chờ chủ duyệt'})`, ['Mã hoặc cụm nguyên văn', 'Số bản ghi (n)', 'n/N trong tập này'], draftRows) + sliceNote(ctx, result.draftCounts.length, 'mã đề xuất');
    }
    body += `<p class="sec-note">${corpus.multiCode ? 'Một bản ghi có thể mang nhiều mã; không cộng các n hoặc tỷ lệ thành 100%.' : 'Hồ sơ khai báo mỗi bản ghi có tối đa một mã.'} Thứ tự theo bộ mã, không phải thứ hạng hay mức ưu tiên.</p>`;
    if (result.blockers.length) body += `<details><summary>Điều kiện còn thiếu của tập bản ghi</summary><ul class="limits">${result.blockers.map(codeItem).join('')}</ul></details>`;
  }
  return body + sliceNote(ctx, section.corpora.length, 'tập bản ghi') + footer(ctx, section.blockers);
}

/** Render verified located-method output only; the caller retains the old path when the optional bundle is absent. */
export function renderLocatedInsightSection(output: LocatedInsightMethods, sectionId: string, options: { bundleDownload?: boolean; showAnnotationPendingCount?: boolean; citations?: ReportCitations } = {}): string | undefined {
  const ctx: RenderContext = { output, sectionId, records: new Set(), bundleDownload: options.bundleDownload !== false, showAnnotationPendingCount: options.showAnnotationPendingCount !== false, citations: options.citations };
  switch (sectionId) {
    case 'I01': return briefBody(ctx);
    case 'I02': case 'I04': case 'I05': case 'I06': case 'I07': case 'I08': case 'I09': return locatedBody(ctx, sectionId);
    case 'I10': case 'I13': return corpusBody(ctx, sectionId);
    default: return undefined;
  }
}
