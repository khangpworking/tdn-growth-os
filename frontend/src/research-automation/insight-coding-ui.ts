// View helpers for exact-source Insight coding. Nothing here decides a code, a member or an
// approval: it finds literal quote occurrences, names history items in plain words and
// reports why a draft would be refused, so the owner never handles offsets, hashes or IDs.
import type { InsightCodingAcceptRequest, InsightCodingAdoptRequest, InsightCodingProposeRequest, ResearchInsightCodingView } from './insight-coding-api';

export type View = ResearchInsightCodingView;
export type Evidence = View['evidence'][number];
export type SourceRecord = View['context']['input']['records'][number];
export type Rules = InsightCodingAdoptRequest['rules'];
export type RuleCorpus = Rules['corpora'][number];
export type Code = RuleCorpus['codebook']['codes'][number];
export type Annotations = InsightCodingProposeRequest['annotations'];
export type Journey = Annotations['i06'][number];
export type Gap = Annotations['i09'][number];
export type Mention = Annotations['i13Mentions'][number];
export type CorpusCoding = Annotations['corpora'][number];
export type Assignment = CorpusCoding['assignments'][number];
export type Disposition = CorpusCoding['dispositions'][number];
export type Span = Journey['firstEvent'];
export type Relation = NonNullable<Journey['relation']>;
export type Provenance = Journey['provenance'];
export type FieldState = Gap['workaround']['state'];
export type Selection = InsightCodingAcceptRequest['selection'];

export const basisLabels: Record<Provenance['basis'], string> = {
  DECLARED: 'Người mã hóa khai báo', HUMAN_REVIEWED: 'Đã đối chiếu và có ghi phân xử', PENDING_AI: 'Gợi ý chờ duyệt',
};
export const dispositionLabels: Record<Disposition['state'], string> = {
  CODED: 'Đã gán mã', UNCODED: 'Không có mã phù hợp', UNCLEAR: 'Không rõ', PENDING: 'Chờ mã hóa',
};
export const fieldStateLabels: Record<FieldState, string> = {
  SOURCE_STATED: 'Nguồn có nêu', NOT_STATED: 'Nguồn không nêu', UNKNOWN: 'Chưa biết',
  CONFLICTING: 'Nguồn nêu mâu thuẫn', UNLOCATED: 'Có nêu nhưng không chỉ ra được vị trí',
};
export const recordStateLabels: Record<SourceRecord['disposition'], string> = {
  INCLUDED: 'Được đưa vào', EXCLUDED: 'Bị loại', UNREADABLE: 'Không đọc được',
};
export const sectionLabels = { I02: 'I02 · Bối cảnh', I04: 'I04 · Hành vi', I05: 'I05 · Thái độ', I06: 'I06 · Hành trình', I07: 'I07 · Lý do lựa chọn', I08: 'I08 · Rào cản', I09: 'I09 · Mong muốn, hiện trạng, cách xoay xở', I10: 'I10 · Kho mã hóa', I13: 'I13 · Nhắc nguyên văn' } as const;
const semanticFamilies = ['i02', 'i04', 'i05', 'i07', 'i08'] as const;

const high = (unit: number) => unit >= 0xd800 && unit <= 0xdbff;
const low = (unit: number) => unit >= 0xdc00 && unit <= 0xdfff;
/** An offset between the two UTF-16 units of one surrogate pair is never a valid span edge. */
export const splitsPair = (text: string, offset: number) => offset > 0 && offset < text.length && high(text.charCodeAt(offset - 1)) && low(text.charCodeAt(offset));

/** Every literal occurrence of quote in the unmodified text; no case, accent or whitespace folding. */
export function quoteOccurrences(text: string, quote: string, limit = 50): number[] {
  const found: number[] = [];
  if (!quote) return found;
  for (let at = text.indexOf(quote); at !== -1 && found.length < limit; at = text.indexOf(quote, at + 1)) {
    if (!splitsPair(text, at) && !splitsPair(text, at + quote.length)) found.push(at);
  }
  return found;
}

export function exactSpan(text: string, start: number, end: number): Span | null {
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > text.length) return null;
  if (splitsPair(text, start) || splitsPair(text, end)) return null;
  return { start, end, quote: text.slice(start, end) };
}

export const spanMatches = (text: string | null, span: Span) => text !== null && exactSpan(text, span.start, span.end)?.quote === span.quote;
export const sameSpan = (a: Span, b: Span) => a.start === b.start && a.end === b.end;
const inside = (outer: Span, inner: Span) => outer.start <= inner.start && inner.end <= outer.end;

/** Surrounding words for one occurrence, widened rather than cutting a surrogate pair. */
export function occurrenceContext(text: string, start: number, end: number, radius = 48) {
  let from = Math.max(0, start - radius), to = Math.min(text.length, end + radius);
  if (splitsPair(text, from)) from--;
  if (splitsPair(text, to)) to++;
  return { before: `${from > 0 ? '…' : ''}${text.slice(from, start)}`, match: text.slice(start, end), after: `${text.slice(end, to)}${to < text.length ? '…' : ''}` };
}

/** Mirrors the method owner: link and both evidence spans sit inside context, and the two evidence spans differ. */
export function relationProblem(relation: Relation, spans: readonly (Span | null)[], names: readonly [string, string]): string | null {
  if (spans.some(span => span === null)) return `Câu nối cần có cả ${names[0]} và ${names[1]}.`;
  const [first, second] = spans as Span[];
  if (sameSpan(first!, second!)) return `${names[0]} và ${names[1]} phải là hai đoạn khác nhau.`;
  if (![first!, second!, relation.link].every(span => inside(relation.context, span))) return `Đoạn ngữ cảnh phải bao trọn ${names[0]}, ${names[1]} và từ nối.`;
  return null;
}

export const unresolved = (provenance: Provenance) => provenance.basis === 'PENDING_AI' || provenance.disagreement !== null;

export function provenanceProblem(provenance: Provenance | null): string | null {
  if (!provenance) return 'Chọn cơ sở khai báo của người mã hóa.';
  if (!provenance.coderRole.trim()) return 'Ghi vai trò người mã hóa.';
  if (provenance.basis === 'HUMAN_REVIEWED' && !provenance.adjudication?.trim()) return 'Đã đối chiếu cần ghi cách phân xử.';
  return null;
}

export const recordLabel = (records: readonly SourceRecord[], index: number) =>
  records[index] ? `Bản ghi ${index + 1} · ${records[index]!.sourceAttribution}` : `Bản ghi ${index + 1} không còn trong nguồn`;

export const formatTime = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
};
const clip = (value: string, size = 80) => value.length > size ? `${value.slice(0, size - 1)}…` : value;

/** Sorted-key JSON, so read-back comparison does not depend on server key order. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

export type AdoptionItem = { evidence: Evidence; request: InsightCodingAdoptRequest; current: boolean; label: string };
export type ProposalItem = { evidence: Evidence; request: InsightCodingProposeRequest; latest: boolean; label: string };
export type ReceiptItem = { evidence: Evidence; request: InsightCodingAcceptRequest; label: string };

/** Groups the verified pair history. Flags only describe server rules; nothing is preselected. */
export function codingHistory(view: View) {
  const adoptions: AdoptionItem[] = [];
  const proposals = new Map<string, ProposalItem[]>();
  const receipts = new Map<string, ReceiptItem[]>();
  for (const evidence of view.evidence) {
    const request = evidence.request;
    if (evidence.kind === 'ADOPTION' && request.contractVersion === 'insight-coding-adopt-v1') {
      adoptions.push({ evidence, request, current: false, label: `Bản ${request.rules.revision} · ${clip(request.rules.question, 60)} · ${formatTime(evidence.createdAt)}` });
    } else if (evidence.kind === 'PROPOSAL' && request.contractVersion === 'insight-coding-propose-v1') {
      const list = proposals.get(request.adoptionId) ?? [];
      list.push({ evidence, request, latest: false, label: `Đề xuất ${evidence.sequence} · ${formatTime(evidence.createdAt)}` });
      proposals.set(request.adoptionId, list);
    } else if (evidence.kind === 'RECEIPT' && request.contractVersion === 'insight-coding-accept-v1') {
      const list = receipts.get(request.proposalId) ?? [];
      list.push({ evidence, request, label: `Biên nhận ${evidence.sequence} · ${selectionSize(request.selection)} mục · ${formatTime(evidence.createdAt)}` });
      receipts.set(request.proposalId, list);
    }
  }
  for (const item of adoptions) {
    item.current = !adoptions.some(other => other.request.rules.ruleId === item.request.rules.ruleId && other.request.rules.revision > item.request.rules.revision);
  }
  for (const list of proposals.values()) {
    const top = Math.max(...list.map(item => item.evidence.sequence));
    for (const item of list) item.latest = item.evidence.sequence === top;
    list.sort((a, b) => a.evidence.sequence - b.evidence.sequence);
  }
  for (const list of receipts.values()) list.sort((a, b) => a.evidence.sequence - b.evidence.sequence);
  return { adoptions, proposals, receipts };
}

export const selectionSize = (selection: Selection) => selection.i06.length + selection.i09.length + selection.i13Mentions.length
  + semanticFamilies.reduce((sum, family) => sum + (selection[family]?.length ?? 0), 0)
  + selection.corpora.reduce((sum, corpus) => sum + corpus.assignments.length + corpus.dispositions.length, 0);

/** Same order and de-duplication the server stores, so the read-back compares exactly. */
export function orderedSelection(selection: Selection): Selection {
  const order = (values: readonly number[]) => [...new Set(values)].sort((a, b) => a - b);
  return { ...selection, contractVersion: selection.contractVersion, i06: order(selection.i06), i09: order(selection.i09), i13Mentions: order(selection.i13Mentions),
    ...(selection.contractVersion === 'automation-insight-selection-v2' ? {
      i02: order(selection.i02!), i04: order(selection.i04!), i05: order(selection.i05!), i07: order(selection.i07!), i08: order(selection.i08!),
    } : {}),
    corpora: selection.corpora.map(corpus => ({ corpusIndex: corpus.corpusIndex, assignments: order(corpus.assignments), dispositions: order(corpus.dispositions) }))
      .sort((a, b) => a.corpusIndex - b.corpusIndex) };
}

export type Entry = { key: string; section: keyof typeof sectionLabels; title: string; lines: string[]; recordIndex: number; blocked: string | null };
const quoted = (span: Span | null | undefined) => span ? `“${span.quote}”` : 'không có';

/** One readable row per proposal or draft item. Keys carry the exact family and index used in the selection. */
export function proposalEntries(annotations: Annotations, rules: Rules, records: readonly SourceRecord[], accepted: ReadonlySet<string> = new Set()): Entry[] {
  const block = (key: string, provenance: Provenance, pending = false) => accepted.has(key) ? 'Đã có trong một biên nhận của đề xuất này.'
    : provenance.disagreement !== null ? 'Còn bất đồng chưa phân xử; không thể duyệt.' : pending ? 'Trạng thái chờ không thể duyệt; giữ là chờ.' : null;
  const who = (provenance: Provenance) => `${basisLabels[provenance.basis]} · ${provenance.coderRole}${provenance.disagreement ? ` · Bất đồng: ${provenance.disagreement}` : ''}`;
  const extras = (row: Pick<Journey, 'qualifiers' | 'counterevidence'>) => [
    ...(row.qualifiers.length ? [`Điều kiện đi kèm: ${row.qualifiers.map(quoted).join('; ')}`] : []),
    ...(row.counterevidence.length ? [`Bằng chứng ngược: ${row.counterevidence.map(quoted).join('; ')}`] : []),
  ];
  const entries: Entry[] = [];
  const field = (value: Gap['workaround']) => `${fieldStateLabels[value.state]}${value.span ? `: ${quoted(value.span)}` : ''}`;
  const codes: Record<string, string> = {
    ATTEMPT_REPORTED: 'Kể việc đã thử', ACTION_REPORTED: 'Kể hành động', COMPLETION_REPORTED: 'Kể việc đã hoàn tất',
    NO_ACTION_EXPLICIT: 'Nêu rõ chưa hành động', NOT_REPORTED: 'Không kể hành động', UNKNOWN: 'Chưa rõ',
    SOURCE_LOGGED: 'Nguồn ghi nhận', SELF_REPORTED: 'Tự thuật', OTHER_REPORTED: 'Kể lại từ người khác',
    POSITIVE: 'Tích cực', NEGATIVE: 'Tiêu cực', MIXED: 'Hỗn hợp', NEUTRAL: 'Trung tính', UNCLEAR: 'Chưa rõ', NOT_STATED: 'Không nêu',
    PRICE_COST: 'Giá và chi phí', ACCESS_AVAILABILITY: 'Tiếp cận và sẵn có', FIT_NEED: 'Phù hợp nhu cầu', PRODUCT_ATTRIBUTE: 'Thuộc tính sản phẩm', INFORMATION_TRUST: 'Thông tin và tin cậy', OTHER_EXPLICIT: 'Yếu tố khác được nêu rõ',
    AFFIRMED: 'Khẳng định', NEGATED: 'Phủ định', CONDITIONAL: 'Có điều kiện', SELF_STATED: 'Tự nêu', SOURCE_ATTRIBUTED: 'Có ghi nguồn',
  };
  for (const family of semanticFamilies) {
    (annotations[family] ?? []).forEach((row, index) => {
      const key = `${family}:${index}`;
      const detail = 'role' in row ? [
        `Vai trò: ${field(row.role)}`, `Tình huống: ${field(row.situation)}`, `Nhiệm vụ: ${field(row.task)}`, `Bối cảnh: ${field(row.setting)}`, `Thời gian: ${field(row.time)}`,
      ] : 'eventKind' in row ? [`${quoted(row.span)} · ${codes[row.eventKind]} · ${codes[row.attribution]}`]
        : 'polarity' in row ? [`${quoted(row.span)} · ${codes[row.polarity]}`, `Đối tượng: ${field(row.target)}`, `Người phát biểu: ${field(row.speakerAttribution)}`]
          : 'reasonClause' in row ? [`Lựa chọn: ${quoted(row.choiceText)}`, `Lý do: ${quoted(row.reasonClause)} · ${codes[row.reasonFacet]} · ${codes[row.reasonPolarity]} · ${codes[row.speakerBasis]}`, `Kết quả: ${field(row.resultState)}`]
            : [`Việc muốn làm: ${quoted(row.attemptedTask)}`, `Trở ngại: ${quoted(row.obstacleClause)} · ${codes[row.barrierFacet]}`, `Giải quyết: ${field(row.resolutionState)}`];
      if ('relation' in row) detail.push(`Từ nối ${quoted(row.relation.link)} trong ${quoted(row.relation.context)}`);
      entries.push({ key, section: family.toUpperCase() as Entry['section'], recordIndex: row.recordIndex, blocked: block(key, row.provenance),
        title: detail[0]!, lines: [recordLabel(records, row.recordIndex), ...detail.slice(1), ...extras(row), who(row.provenance)] });
    });
  }
  annotations.i06.forEach((row, index) => entries.push({ key: `i06:${index}`, section: 'I06', recordIndex: row.recordIndex, blocked: block(`i06:${index}`, row.provenance),
    title: `${quoted(row.firstEvent)} → ${quoted(row.secondEvent)}`,
    lines: [recordLabel(records, row.recordIndex), ...(row.relation ? [`Từ nối ${quoted(row.relation.link)} trong ${quoted(row.relation.context)}`] : ['Không khai báo câu nối']), ...extras(row), who(row.provenance)] }));
  annotations.i09.forEach((row, index) => entries.push({ key: `i09:${index}`, section: 'I09', recordIndex: row.recordIndex, blocked: block(`i09:${index}`, row.provenance),
    title: `Mong muốn ${quoted(row.desiredState)} · Hiện trạng ${quoted(row.currentState)}`,
    lines: [recordLabel(records, row.recordIndex), `Cách xoay xở: ${fieldStateLabels[row.workaround.state]}${row.workaround.span ? ` ${quoted(row.workaround.span)}` : ''}`,
      ...(row.relation ? [`Từ nối ${quoted(row.relation.link)} trong ${quoted(row.relation.context)}`] : []), ...extras(row), who(row.provenance)] }));
  annotations.i13Mentions.forEach((row, index) => entries.push({ key: `i13Mentions:${index}`, section: 'I13', recordIndex: row.recordIndex, blocked: block(`i13Mentions:${index}`, row.provenance),
    title: `Nhắc ${quoted(row.span)}`, lines: [recordLabel(records, row.recordIndex), who(row.provenance)] }));
  for (const coding of annotations.corpora) {
    const corpus = rules.corpora[coding.corpusIndex];
    const section = corpus?.sectionId ?? 'I10';
    const name = corpus ? `Kho ${coding.corpusIndex + 1}: ${clip(corpus.question, 50)}` : `Kho ${coding.corpusIndex + 1} không có trong quy tắc`;
    coding.assignments.forEach((row, index) => {
      const key = `a:${coding.corpusIndex}:${index}`;
      const code = corpus?.codebook.codes.find(item => item.code === row.code);
      entries.push({ key, section, recordIndex: row.recordIndex, blocked: block(key, row.provenance),
        title: `Mã ${code ? `${code.label} (${code.code})` : row.code} ← ${quoted(row.span)}`, lines: [name, recordLabel(records, row.recordIndex), who(row.provenance)] });
    });
    coding.dispositions.forEach((row, index) => {
      const key = `d:${coding.corpusIndex}:${index}`;
      entries.push({ key, section, recordIndex: row.recordIndex, blocked: block(key, row.provenance, row.state === 'PENDING'),
        title: `Trạng thái: ${dispositionLabels[row.state]}`, lines: [name, recordLabel(records, row.recordIndex), who(row.provenance)] });
    });
  }
  return entries;
}

export function selectionKeys(selection: Selection): string[] {
  return [...selection.i06.map(index => `i06:${index}`), ...selection.i09.map(index => `i09:${index}`), ...selection.i13Mentions.map(index => `i13Mentions:${index}`),
    ...semanticFamilies.flatMap(family => (selection[family] ?? []).map(index => `${family}:${index}`)),
    ...selection.corpora.flatMap(corpus => [...corpus.assignments.map(index => `a:${corpus.corpusIndex}:${index}`), ...corpus.dispositions.map(index => `d:${corpus.corpusIndex}:${index}`)])];
}

export function buildSelection(keys: Iterable<string>, semantic = false): Selection {
  const selection: Selection = { contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [], corpora: [] };
  if (semantic) Object.assign(selection, { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [], i05: [], i07: [], i08: [] });
  for (const key of keys) {
    const parts = key.split(':');
    if (semanticFamilies.some(family => family === parts[0])) {
      if (!semantic) throw new Error('Semantic proposal requires v2 selection');
      selection[parts[0] as typeof semanticFamilies[number]]!.push(Number(parts[1])); continue;
    }
    if (parts[0] === 'i06' || parts[0] === 'i09' || parts[0] === 'i13Mentions') { selection[parts[0]].push(Number(parts[1])); continue; }
    const corpusIndex = Number(parts[1]);
    let corpus = selection.corpora.find(item => item.corpusIndex === corpusIndex);
    if (!corpus) { corpus = { corpusIndex, assignments: [], dispositions: [] }; selection.corpora.push(corpus); }
    (parts[0] === 'a' ? corpus.assignments : corpus.dispositions).push(Number(parts[2]));
  }
  return orderedSelection(selection);
}

/** Membership and declared state, with absent declarations kept distinct from zero. */
export function corpusCoverage(corpus: RuleCorpus, coding: CorpusCoding | undefined, records: readonly SourceRecord[]) {
  const members = [...new Set(corpus.recordIndexes)];
  const count = (state: SourceRecord['disposition']) => members.filter(index => records[index]?.disposition === state).length;
  const stated = new Set(coding?.dispositions.map(item => item.recordIndex) ?? []);
  return { members: members.length, included: count('INCLUDED'), excluded: count('EXCLUDED'), unreadable: count('UNREADABLE'),
    withState: members.filter(index => stated.has(index)).length, withoutState: members.filter(index => !stated.has(index)).length };
}

/** Drops one draft item by its entry key; later indexes shift because a draft is not yet evidence. */
export function removeEntry(annotations: Annotations, key: string): Annotations {
  const [family, first, second] = key.split(':');
  const without = <T,>(rows: readonly T[], index: number) => rows.filter((_, at) => at !== index);
  if (semanticFamilies.some(item => item === family)) {
    return { ...annotations, [family!]: (annotations[family as typeof semanticFamilies[number]] ?? []).filter((_, at) => at !== Number(first)) };
  }
  if (family === 'i06') return { ...annotations, i06: without(annotations.i06, Number(first)) };
  if (family === 'i09') return { ...annotations, i09: without(annotations.i09, Number(first)) };
  if (family === 'i13Mentions') return { ...annotations, i13Mentions: without(annotations.i13Mentions, Number(first)) };
  return { ...annotations, corpora: annotations.corpora.map(coding => coding.corpusIndex !== Number(first) ? coding
    : family === 'a' ? { ...coding, assignments: without(coding.assignments, Number(second)) } : { ...coding, dispositions: without(coding.dispositions, Number(second)) })
    .filter(coding => coding.assignments.length || coding.dispositions.length) };
}

/** UTF-8 size of the exact JSON body; the server refuses larger owner writes rather than truncating them. */
export const MAX_WRITE_BYTES = 8 * 1024 * 1024;
export const bodyBytes = (body: unknown) => new TextEncoder().encode(JSON.stringify(body)).length;

export const emptyAnnotations = (): Annotations => ({ i06: [], i09: [], i13Mentions: [], corpora: [] });
export const annotationCount = (annotations: Annotations) => annotations.i06.length + annotations.i09.length + annotations.i13Mentions.length
  + semanticFamilies.reduce((sum, family) => sum + (annotations[family]?.length ?? 0), 0)
  + annotations.corpora.reduce((sum, corpus) => sum + corpus.assignments.length + corpus.dispositions.length, 0);

/** Readable refusals for a rule draft; the server remains the validating owner. */
export function ruleProblems(rules: Rules, records: readonly SourceRecord[]): string[] {
  const problems: string[] = [];
  if (![rules.question, rules.inclusionRule, rules.adjudicationRule].every(value => value.trim())) problems.push('Điền câu hỏi, tiêu chí đưa vào và cách phân xử.');
  rules.corpora.forEach((corpus, index) => {
    const name = `Kho ${index + 1}`;
    if (![corpus.question, corpus.unit, corpus.inclusionRule, corpus.externalSampling, corpus.codebook.revision].every(value => value.trim())) {
      problems.push(`${name}: điền câu hỏi, đơn vị, tiêu chí đưa vào, cách lấy mẫu bên ngoài và tên bản bộ mã.`);
    }
    for (const value of [corpus.period, corpus.frame, corpus.channel]) if (value !== null && !value.trim()) problems.push(`${name}: để trống hẳn hoặc điền nội dung cho kỳ, khung và kênh.`);
    const seen = new Set<string>();
    corpus.codebook.codes.forEach((code, codeIndex) => {
      const label = `${name}, mã ${codeIndex + 1}`;
      if (![code.code, code.label, code.phrase].every(value => value.trim())) problems.push(`${label}: điền mã, nhãn và cụm từ.`);
      if (seen.has(code.code)) problems.push(`${label}: mã “${code.code}” bị trùng.`);
      seen.add(code.code);
      if (corpus.sectionId === 'I13' && code.label !== code.phrase) problems.push(`${label}: với I13, nhãn phải đúng nguyên văn cụm từ.`);
      if ((code.firstRecordIndex === null) !== (code.firstSpan === null)) problems.push(`${label}: chọn cả bản ghi và vị trí xuất hiện đầu tiên, hoặc bỏ cả hai.`);
      if (code.firstRecordIndex !== null && !corpus.recordIndexes.includes(code.firstRecordIndex)) problems.push(`${label}: bản ghi xuất hiện đầu tiên phải thuộc kho.`);
      if (code.firstSpan && (code.firstSpan.quote !== code.phrase || !spanMatches(records[code.firstRecordIndex ?? -1]?.text ?? null, code.firstSpan))) {
        problems.push(`${label}: vị trí xuất hiện đầu tiên phải đúng nguyên văn cụm từ.`);
      }
    });
  });
  return problems;
}

/** Readable refusals for a proposal draft against its adopted rule and exact records. */
export function proposalProblems(annotations: Annotations, rules: Rules, records: readonly SourceRecord[]): string[] {
  const problems: string[] = [];
  if (!annotationCount(annotations)) problems.push('Bản nháp chưa có mục nào.');
  const included = (index: number) => records[index]?.disposition === 'INCLUDED';
  for (const [label, rows] of [['I02', annotations.i02 ?? []], ['I04', annotations.i04 ?? []], ['I05', annotations.i05 ?? []], ['I06', annotations.i06], ['I07', annotations.i07 ?? []], ['I08', annotations.i08 ?? []], ['I09', annotations.i09], ['I13', annotations.i13Mentions]] as const) {
    if (rows.some(row => !included(row.recordIndex))) problems.push(`${label}: chỉ mã hóa bản ghi được đưa vào.`);
  }
  for (const coding of annotations.corpora) {
    const corpus = rules.corpora[coding.corpusIndex];
    const name = `Kho ${coding.corpusIndex + 1}`;
    if (!corpus) { problems.push(`${name} không có trong quy tắc đã chọn.`); continue; }
    const members = new Set(corpus.recordIndexes);
    const states = new Map<number, Disposition['state']>();
    const codes = new Map<number, Set<string>>();
    for (const row of coding.assignments) {
      const code = corpus.codebook.codes.find(item => item.code === row.code);
      if (!members.has(row.recordIndex)) problems.push(`${name}: ${recordLabel(records, row.recordIndex)} không thuộc kho.`);
      if (!code) problems.push(`${name}: mã “${row.code}” không có trong bộ mã.`);
      else if (corpus.sectionId === 'I13' && row.span.quote !== code.phrase) problems.push(`${name}: với I13, đoạn gán phải đúng nguyên văn cụm từ của mã.`);
      if (!unresolved(row.provenance) && included(row.recordIndex)) codes.set(row.recordIndex, (codes.get(row.recordIndex) ?? new Set()).add(row.code));
    }
    for (const row of coding.dispositions) {
      if (!members.has(row.recordIndex)) problems.push(`${name}: ${recordLabel(records, row.recordIndex)} không thuộc kho.`);
      const prior = states.get(row.recordIndex);
      if (prior && prior !== row.state) problems.push(`${name}: ${recordLabel(records, row.recordIndex)} có hai trạng thái khác nhau.`);
      states.set(row.recordIndex, row.state);
      const coded = codes.get(row.recordIndex)?.size ?? 0;
      if (unresolved(row.provenance) || row.state === 'PENDING' || !included(row.recordIndex)) continue;
      if (row.state === 'CODED' && !coded) problems.push(`${name}: ${recordLabel(records, row.recordIndex)} ghi “Đã gán mã” nhưng chưa có mã đã khai báo.`);
      if (row.state !== 'CODED' && coded) problems.push(`${name}: ${recordLabel(records, row.recordIndex)} đã có mã nên không thể ghi “${dispositionLabels[row.state]}”.`);
    }
    if (!corpus.multiCode && [...codes.values()].some(set => set.size > 1)) problems.push(`${name}: quy tắc không cho một bản ghi nhận nhiều mã.`);
  }
  return [...new Set(problems)];
}
