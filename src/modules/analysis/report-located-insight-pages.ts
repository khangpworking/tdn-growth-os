import type {
  LocatedInsightMethods, Field, Provenance, Relation, Span,
} from '../../../contracts/analysis/located-insight-methods.generated.js';

type Input = LocatedInsightMethods['input'];
type LocatedId = 'I02' | 'I04' | 'I05' | 'I06' | 'I07' | 'I08' | 'I09';
type Annotation = Input['i02'][number] | Input['i04'][number] | Input['i05'][number]
  | Input['i06'][number] | Input['i07'][number] | Input['i08'][number] | Input['i09'][number];
type RenderContext = { output: LocatedInsightMethods; sectionId: string; records: Set<number> };

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

function sliceNote(total: number, noun: string): string {
  return total <= PAGE_LIMIT ? '' : `<p class="sec-note">Đang hiển thị ${PAGE_LIMIT} trong ${total} ${esc(noun)}, theo thứ tự của hồ sơ. Phần còn lại nằm trong bản tải đầy đủ. ${download}.</p>`;
}

function table(caption: string, headings: readonly string[], rows: readonly string[]): string {
  return `<div class="table-wrap" role="region" aria-label="${esc(caption)}" tabindex="0"><table class="obs"><caption>${esc(caption)}</caption><thead><tr>${headings.map(heading => `<th scope="col">${esc(heading)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

const quote = (span: Span | null): string => span === null ? '<span>Chưa có đoạn nguồn</span>'
  : `<q style="white-space:pre-wrap">${esc(span.quote)}</q>`;
const field = (value: Field): string => `${value.span === null ? '' : `${quote(value.span)}<br>`}<small>${label(value.state)}</small>`;
const textOrUnset = (value: string | null): string => value === null ? 'Chưa khai báo' : esc(value);
const definition = (name: string, html: string): string => `<dt>${esc(name)}</dt><dd>${html}</dd>`;
// Table cells cannot afford the theme's separate 120px label column.
const nestedDefinitions = '<dl style="grid-template-columns:minmax(0,1fr);gap:4px">';

function provenance(value: Provenance): string {
  const basis = value.basis === 'PENDING_AI' ? 'Gợi ý AI đang chờ xử lý'
    : value.basis === 'HUMAN_REVIEWED' ? 'Hồ sơ khai báo đã được người rà soát' : 'Mã hóa do hồ sơ khai báo';
  return `<details><summary>Nguồn gốc mã hóa</summary><p>${basis}. Khai báo này chưa được xác thực thành phê duyệt.</p>${nestedDefinitions}${definition('Vai trò người mã hóa', esc(value.coderRole))}${definition('Ghi chú phân xử', textOrUnset(value.adjudication))}${definition('Bất đồng còn lại', textOrUnset(value.disagreement))}</dl></details>`;
}

function source(ctx: RenderContext, recordIndex: number): string {
  const record = ctx.output.input.records[recordIndex];
  if (!record) throw new TypeError('located insight HTML: UNKNOWN_RECORD');
  ctx.records.add(recordIndex);
  return `<p>${esc(record.sourceAttribution)}<small>${textOrUnset(record.timeText)}</small></p><a href="#located-${ctx.sectionId}-record-${recordIndex}">Đọc toàn văn và vị trí nguồn của bản ghi ${recordIndex + 1}</a>`;
}

function annotationContext(ctx: RenderContext, row: Annotation): string {
  const qualifiers = row.qualifiers.length === 0 ? '' : `<h5>Điều kiện và giới hạn được giữ lại</h5><ul class="limits">${row.qualifiers.map(span => `<li>${quote(span)}</li>`).join('')}</ul>`;
  const counter = row.counterevidence.length === 0 ? '' : `<h5>Bằng chứng ngược trong bản ghi</h5><ul class="limits">${row.counterevidence.map(span => `<li>${quote(span)}</li>`).join('')}</ul>`;
  return `${source(ctx, row.recordIndex)}${qualifiers}${counter}${provenance(row.provenance)}`;
}

function relation(value: Relation | null): string {
  return value === null ? '<p>Chưa có đoạn nguồn nêu quan hệ giữa hai phần.</p>'
    : `${nestedDefinitions}${definition('Đoạn nối quan hệ', quote(value.link))}</dl><details><summary>Ngữ cảnh của quan hệ trong cùng bản ghi</summary><p>${quote(value.context)}</p></details>`;
}

function originalRecords(ctx: RenderContext): string {
  if (ctx.records.size === 0) return '';
  return `<h4>Toàn văn bản ghi được trích</h4>${[...ctx.records].map(index => {
    const record = ctx.output.input.records[index]!;
    const paths = ctx.output.input.sources.filter(item => item.sha256 === record.sourceSha256).map(item => item.logicalPath);
    return `<details id="located-${ctx.sectionId}-record-${index}"><summary>Bản ghi ${index + 1}: ${esc(record.sourceAttribution)}</summary><p class="sec-note">Giữ nguyên lời nguồn, kể cả phủ định, điều kiện và lời kể lại. Các mã hóa phía trên là khai báo cần được xem xét cùng toàn văn.</p><div style="white-space:pre-wrap">${record.text === null ? 'Bản ghi không đọc được.' : esc(record.text)}</div><dl>${definition('Tệp nguồn', paths.map(esc).join('<br>'))}${definition('Vị trí trong nguồn', `<code>${esc(record.locator)}</code>`)}${definition('SHA-256 nguồn', `<code>${esc(record.sourceSha256)}</code>`)}${definition('Thời điểm theo nguồn', textOrUnset(record.timeText))}</dl></details>`;
  }).join('')}`;
}

function footer(ctx: RenderContext, blockers: readonly string[]): string {
  return `${originalRecords(ctx)}<p class="sec-note">Các bản ghi và khai báo mã hóa có vị trí nguồn; vị trí đúng chưa chứng minh cách hiểu đúng hoặc quyền phê duyệt. ${download}.</p><details><summary>Giới hạn và thông tin đối chiếu</summary><p>Đơn vị là bản ghi định vị trong hồ sơ này. Không suy rộng thành số người, tỷ lệ dân số hay thị phần.</p><dl>${definition('Bộ mã', esc(ctx.output.input.codebookId))}${definition('Quy tắc đưa vào', esc(ctx.output.input.inclusionRule))}${definition('Quy tắc phân xử', esc(ctx.output.input.adjudicationRule))}${definition('Mã kết quả', `<code>${esc(ctx.output.methodOutputId)}</code>`)}</dl>${blockers.length ? `<p>Điều kiện còn thiếu hoặc cần xử lý:</p><ul class="limits">${blockers.map(code => `<li><code>${esc(code)}</code></li>`).join('')}</ul>` : ''}<ul class="limits">${ctx.output.limitations.map(item => `<li><code>${esc(item)}</code></li>`).join('')}</ul></details>`;
}

function briefBody(ctx: RenderContext): string {
  const brief = ctx.output.input.brief;
  const fields = BRIEF_FIELDS.map(([key, title]) => {
    const value = brief?.[key];
    return definition(title, value?.state === 'SUPPLIED' && value.text !== null
      ? `<div style="white-space:pre-wrap">${esc(value.text)}</div>` : '<span class="tag warn">Chưa cung cấp (UNSET)</span>');
  }).join('');
  return `<p class="sec-note">Brief do hồ sơ khai báo. Nội dung và phiên bản này chưa được xác thực thành phê duyệt của chủ dự án.</p>${brief === null ? '<p>Chưa có brief. Cần bổ sung các trường dưới đây trước khi dùng làm câu hỏi nghiên cứu đã chốt.</p>' : `<p>Phiên bản brief: ${esc(brief.version)}.</p>`}<dl>${fields}</dl>${brief ? `<p>Các mục được chọn trong brief: ${brief.selectedSectionIds.length ? brief.selectedSectionIds.map(esc).join(', ') : 'chưa chọn'}.</p>` : ''}${footer(ctx, ctx.output.sections.I01.blockers)}`;
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
  let body = `<p class="sec-note">${SECTION_LEAD[sectionId]}</p><p>${section.locatedRecordCount} bản ghi có mã hóa được hồ sơ đưa vào kết quả; ${section.pendingAnnotationPointers.length} chú giải đang chờ xử lý. Các khai báo này chưa được xác thực về ý nghĩa hay phê duyệt.</p>`;
  if (sectionId === 'I05' && ctx.output.sections.I05.recordPolarities.length) {
    const polarities = ctx.output.sections.I05.recordPolarities;
    body += table('Sắc thái theo bản ghi, không quy đổi thành tỷ lệ', ['Bản ghi nguồn', 'Sắc thái khai báo'], polarities.slice(0, PAGE_LIMIT).map(item => {
      locatedAt(ctx.output.input.records, item.recordPointer, '/input/records/');
      const index = Number(item.recordPointer.slice('/input/records/'.length));
      return `<tr><td>${source(ctx, index)}</td><td>${label(item.polarity)}</td></tr>`;
    })) + sliceNote(polarities.length, 'bản ghi');
  }
  body += section.annotationPointers.length === 0
    ? '<p>Chưa có chú giải được đưa vào kết quả cho mục này. Cần bổ sung mã hóa có vị trí nguồn và xử lý các mục đang chờ.</p>'
    : table('Chú giải được hồ sơ đưa vào kết quả', ['Nội dung và mã hóa', 'Nguồn và ngữ cảnh'], section.annotationPointers.slice(0, PAGE_LIMIT).map(pointer => annotationRow(ctx, sectionId, pointer))) + sliceNote(section.annotationPointers.length, 'chú giải');
  if (section.pendingAnnotationPointers.length) {
    body += `<details><summary>Chú giải đang chờ xử lý (${section.pendingAnnotationPointers.length})</summary><p>Gợi ý AI hoặc bất đồng chưa phân xử được giữ riêng, chưa đưa vào kết quả mã hóa.</p>${table('Chú giải đang chờ, chưa đưa vào kết quả', ['Nội dung đề xuất', 'Nguồn và điều còn chờ'], section.pendingAnnotationPointers.slice(0, PAGE_LIMIT).map(pointer => annotationRow(ctx, sectionId, pointer)))}${sliceNote(section.pendingAnnotationPointers.length, 'chú giải đang chờ')}</details>`;
  }
  return body + footer(ctx, section.blockers);
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
      return table(pending ? 'Cụm nhắc đang chờ xử lý' : 'Cụm nhắc nguyên văn, không xếp hạng', ['Cụm được nhắc', 'Nguồn và lời quy thuộc'], rows) + sliceNote(pointers.length, 'cụm nhắc');
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
    const state = result.ratioStatus === 'ZERO_DENOMINATOR' ? 'Mẫu số bằng 0; không có tỷ lệ.'
      : complete ? 'Đã hoàn tất mẫu số và mã hóa theo khai báo của hồ sơ.' : 'Mã hóa hoặc thành viên chưa đầy đủ; chưa công bố n/N.';
    body += `<h4>${esc(corpus.question)}</h4><p><b>${state}</b></p><p>${result.includedRecordCount} bản ghi thuộc diện đưa vào; ${result.pendingCount} bản ghi đang chờ mã hóa hoặc phân xử; ${result.unreadableCount} bản ghi không đọc được.</p><dl>${definition('Đơn vị khai báo', esc(corpus.unit))}${definition('Kỳ', textOrUnset(corpus.period))}${definition('Khung thu thập', textOrUnset(corpus.frame))}${definition('Kênh', textOrUnset(corpus.channel))}${definition('Quy tắc đưa vào', esc(corpus.inclusionRule))}${definition('Chọn mẫu bên ngoài', esc(corpus.externalSampling))}${definition('Phiên bản bộ mã', esc(corpus.codebook.revision))}</dl>`;
    const coverage = [
      ['Thành viên duy nhất', result.membershipCount], ['Đưa vào', result.includedRecordCount],
      ['Loại ra', result.excludedCount], ['Không đọc được', result.unreadableCount],
      ['Đang chờ', result.pendingCount], ['Chưa rõ mã (UNCLEAR)', result.unclearCount],
      ['Không gán mã (UNCODED)', result.uncodedCount], ['Đã có mã', result.codedCount],
      ['Có nhiều mã', result.multiCodedCount], ['Tham chiếu lặp đã loại trùng', result.duplicateReferenceCount],
    ] as const;
    body += `<details><summary>Phạm vi và mức hoàn tất mã hóa</summary><dl>${coverage.map(([name, value]) => definition(name, String(value))).join('')}</dl><p>Đang chờ, chưa rõ mã và không gán mã là các trạng thái khác nhau. Các số trên không cộng thành một tổng chung.</p></details>`;
    const rows = result.counts.slice(0, PAGE_LIMIT).map(count => {
      const code = corpus.codebook.codes.find(item => item.code === count.code);
      if (!code) throw new TypeError('located insight HTML: UNKNOWN_CODE');
      const refs = count.annotationPointers.slice(0, PAGE_LIMIT).map(pointer => {
        const assignment = locatedAt(corpus.assignments, pointer, `/input/corpora/${result.corpusIndex}/assignments/`);
        return `<li>${quote(assignment.span)}${source(ctx, assignment.recordIndex)}${provenance(assignment.provenance)}</li>`;
      }).join('');
      const evidence = refs ? `<details><summary>Đoạn nguồn cho mã này</summary><ul class="limits">${refs}</ul>${sliceNote(count.annotationPointers.length, 'chú giải nguồn')}</details>` : '';
      const ratio = complete && count.ratio !== null ? `${count.ratio.numerator}/${count.ratio.denominator}` : 'Chưa công bố';
      return `<tr><th scope="row">${esc(code.label)}<small>Mã: ${esc(code.code)}</small>${sectionId === 'I10' ? `<small>Cụm mô tả trong bộ mã: ${esc(code.phrase)}</small>` : ''}</th><td>${count.recordCount}${evidence}</td><td>${ratio}</td></tr>`;
    });
    body += table(complete ? 'Số bản ghi theo mã trong tập đã chốt' : 'Số bản ghi đã mã hóa, còn một phần', ['Mã hoặc cụm nguyên văn', 'Số bản ghi (n)', 'n/N trong tập này'], rows) + sliceNote(result.counts.length, 'mã');
    body += `<p class="sec-note">${corpus.multiCode ? 'Một bản ghi có thể mang nhiều mã; không cộng các n hoặc tỷ lệ thành 100%.' : 'Hồ sơ khai báo mỗi bản ghi có tối đa một mã.'} Thứ tự theo bộ mã, không phải thứ hạng hay mức ưu tiên.</p>`;
    if (result.blockers.length) body += `<details><summary>Điều kiện còn thiếu của tập bản ghi</summary><ul class="limits">${result.blockers.map(code => `<li><code>${esc(code)}</code></li>`).join('')}</ul></details>`;
  }
  return body + sliceNote(section.corpora.length, 'tập bản ghi') + footer(ctx, section.blockers);
}

/** Render verified located-method output only; the caller retains the old path when the optional bundle is absent. */
export function renderLocatedInsightSection(output: LocatedInsightMethods, sectionId: string): string | undefined {
  const ctx: RenderContext = { output, sectionId, records: new Set() };
  switch (sectionId) {
    case 'I01': return briefBody(ctx);
    case 'I02': case 'I04': case 'I05': case 'I06': case 'I07': case 'I08': case 'I09': return locatedBody(ctx, sectionId);
    case 'I10': case 'I13': return corpusBody(ctx, sectionId);
    default: return undefined;
  }
}
