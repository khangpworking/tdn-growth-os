import { useRef, useState } from 'react';
import InsightCodingSpanPicker, { SourceRecordView } from './InsightCodingSpanPicker';
import {
  basisLabels, corpusCoverage, dispositionLabels, fieldStateLabels, proposalEntries, provenanceProblem, recordLabel, recordStateLabels, relationProblem, removeEntry, sectionLabels,
  type Annotations, type Disposition, type FieldState, type Gap, type Journey, type Provenance, type Rules, type SourceRecord, type Span,
} from './insight-coding-ui';

type Props = { records: readonly SourceRecord[]; rules: Rules; draft: Annotations; disabled: boolean; onChange: (draft: Annotations) => void };
type Kind = '' | 'I06' | 'I09' | 'I13' | 'ASSIGN' | 'STATE';
type ProvenanceDraft = { basis: '' | Provenance['basis']; coderRole: string; adjudication: string; disagreement: string };
type Slot = 'first' | 'second' | 'desired' | 'current' | 'workaround' | 'context' | 'link' | 'mention' | 'assignment' | 'extra';
const kinds: Record<Exclude<Kind, ''>, string> = {
  I06: 'I06 · Hai sự kiện trong một hành trình', I09: 'I09 · Mong muốn, hiện trạng và cách xoay xở', I13: 'I13 · Một lần nhắc nguyên văn',
  ASSIGN: 'I10/I13 · Gán mã trong kho', STATE: 'I10/I13 · Trạng thái mã hóa của bản ghi trong kho',
};
const blankProvenance: ProvenanceDraft = { basis: '', coderRole: '', adjudication: '', disagreement: '' };
const toProvenance = (draft: ProvenanceDraft): Provenance | null => draft.basis ? { basis: draft.basis, coderRole: draft.coderRole,
  adjudication: draft.adjudication.trim() ? draft.adjudication : null, disagreement: draft.disagreement.trim() ? draft.disagreement : null } : null;

/** Builds a local draft of exact-quote annotations; nothing leaves the page until the owner saves a proposal. */
export default function InsightCodingDraftEditor({ records, rules, draft, disabled, onChange }: Props) {
  const [kind, setKind] = useState<Kind>('');
  const [corpusIndex, setCorpusIndex] = useState('');
  const [recordIndex, setRecordIndex] = useState('');
  const [query, setQuery] = useState('');
  const [spans, setSpans] = useState<Partial<Record<Slot, Span | null>>>({});
  const [extras, setExtras] = useState<{ qualifiers: Span[]; counterevidence: Span[] }>({ qualifiers: [], counterevidence: [] });
  const [relationOn, setRelationOn] = useState(false);
  const [workaround, setWorkaround] = useState<'' | FieldState>('');
  const [code, setCode] = useState('');
  const [state, setState] = useState<'' | Disposition['state']>('');
  const [provenance, setProvenance] = useState<ProvenanceDraft>(blankProvenance);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [round, setRound] = useState(0);
  const textRef = useRef<HTMLParagraphElement>(null);
  const corpus = corpusIndex === '' ? undefined : rules.corpora[Number(corpusIndex)];
  const inCorpus = kind === 'ASSIGN' || kind === 'STATE';
  const record = recordIndex === '' ? undefined : records[Number(recordIndex)];
  const chosenCode = corpus?.codebook.codes.find(item => item.code === code);
  const candidates = (inCorpus ? [...new Set(corpus?.recordIndexes ?? [])] : records.map((_, at) => at));
  const needle = query.toLocaleLowerCase('vi');
  const options = candidates.filter(at => String(at) === recordIndex || !needle || `${records[at]?.sourceAttribution} ${records[at]?.text ?? ''}`.toLocaleLowerCase('vi').includes(needle)).slice(0, 200);
  const unusable = (at: number) => kind === 'STATE' ? false : kind === 'ASSIGN' ? records[at]?.text === null : records[at]?.disposition !== 'INCLUDED';
  const resetItem = () => { setSpans({}); setExtras({ qualifiers: [], counterevidence: [] }); setRelationOn(false); setWorkaround(''); setCode(''); setState(''); setRound(value => value + 1); };
  const span = (slot: Slot) => spans[slot] ?? null;
  const picker = (slot: Slot, label: string, hint?: string, fixedQuote?: string) => record?.text != null && <InsightCodingSpanPicker key={`${round}:${recordIndex}:${slot}:${fixedQuote ?? ''}`}
    label={label} text={record.text} value={span(slot)} onChange={value => setSpans(prior => ({ ...prior, [slot]: value }))} textRef={textRef} disabled={disabled}
    {...(hint ? { hint } : {})} {...(fixedQuote !== undefined ? { fixedQuote } : {})} />;

  const add = () => {
    if (disabled) return;
    const fail = (text: string) => setMessage({ error: true, text });
    if (!kind) return fail('Chọn loại mục cần mã hóa.');
    if (inCorpus && !corpus) return fail('Chọn kho của quy tắc.');
    if (recordIndex === '' || !record) return fail('Chọn bản ghi nguồn.');
    if (unusable(Number(recordIndex))) return fail('Bản ghi này không dùng được cho loại mục đã chọn. Xem trạng thái bản ghi.');
    const owner = toProvenance(provenance);
    const ownerProblem = provenanceProblem(owner);
    if (ownerProblem) return fail(ownerProblem);
    const at = Number(recordIndex);
    const relation = relationOn ? span('context') && span('link') ? { context: span('context')!, link: span('link')! } : undefined : null;
    if (relation === undefined) return fail('Câu nối cần đoạn ngữ cảnh và từ nối, hoặc bỏ chọn câu nối.');
    let next: Annotations;
    if (kind === 'I06') {
      if (!span('first') || !span('second')) return fail('Chọn đoạn cho cả hai sự kiện.');
      const problem = relation && relationProblem(relation, [span('first'), span('second')], ['sự kiện thứ nhất', 'sự kiện thứ hai']);
      if (problem) return fail(problem);
      const row: Journey = { recordIndex: at, provenance: owner!, qualifiers: extras.qualifiers, counterevidence: extras.counterevidence, firstEvent: span('first')!, secondEvent: span('second')!, relation };
      next = { ...draft, i06: [...draft.i06, row] };
    } else if (kind === 'I09') {
      if (!workaround) return fail('Chọn tình trạng của cách xoay xở, kể cả khi nguồn không nêu.');
      if (workaround === 'SOURCE_STATED' && !span('workaround')) return fail('Nguồn có nêu cách xoay xở: chọn đoạn tương ứng.');
      const problem = relation && relationProblem(relation, [span('desired'), span('current')], ['trạng thái mong muốn', 'trạng thái hiện tại']);
      if (problem) return fail(problem);
      const located = workaround === 'SOURCE_STATED' || workaround === 'CONFLICTING';
      const row: Gap = { recordIndex: at, provenance: owner!, qualifiers: extras.qualifiers, counterevidence: extras.counterevidence, desiredState: span('desired'), currentState: span('current'),
        relation, workaround: { state: workaround, span: located ? span('workaround') : null } };
      next = { ...draft, i09: [...draft.i09, row] };
    } else if (kind === 'I13') {
      if (!span('mention')) return fail('Chọn đoạn nhắc nguyên văn.');
      next = { ...draft, i13Mentions: [...draft.i13Mentions, { recordIndex: at, span: span('mention')!, provenance: owner! }] };
    } else {
      const index = Number(corpusIndex);
      const existing = draft.corpora.find(item => item.corpusIndex === index) ?? { corpusIndex: index, assignments: [], dispositions: [] };
      let coding = existing;
      if (kind === 'ASSIGN') {
        if (!chosenCode) return fail('Chọn mã trong bộ mã của kho.');
        if (!span('assignment')) return fail('Chọn đoạn chứa mã trong bản ghi.');
        coding = { ...existing, assignments: [...existing.assignments, { recordIndex: at, code: chosenCode.code, span: span('assignment')!, provenance: owner! }] };
      } else {
        if (!state) return fail('Chọn trạng thái mã hóa của bản ghi.');
        coding = { ...existing, dispositions: [...existing.dispositions, { recordIndex: at, state, provenance: owner! }] };
      }
      next = { ...draft, corpora: [...draft.corpora.filter(item => item.corpusIndex !== index), coding].sort((a, b) => a.corpusIndex - b.corpusIndex) };
    }
    onChange(next); resetItem();
    setMessage({ error: false, text: 'Đã thêm vào bản nháp trên trang này. Chưa lưu lên máy chủ.' });
  };

  const entries = proposalEntries(draft, rules, records);
  const extraPicker = (kind === 'I06' || kind === 'I09') && record?.text != null;
  return <section className="ic-editor" aria-labelledby="ic-editor-title">
    <h5 id="ic-editor-title">Soạn mục mã hóa</h5>
    <fieldset className="ic-editor-form" disabled={disabled}>
      <legend className="ra-sr">Mục mã hóa mới</legend>
      <label className="ra-label">Loại mục<select className="ra-field" value={kind} onChange={event => { setKind(event.target.value as Kind); setRecordIndex(''); setCorpusIndex(''); resetItem(); }}>
        <option value="">Chọn loại mục</option>{(Object.keys(kinds) as Exclude<Kind, ''>[]).map(item => <option key={item} value={item} disabled={(item === 'ASSIGN' || item === 'STATE') && !rules.corpora.length}>{kinds[item]}</option>)}</select></label>
      {!rules.corpora.length && <p className="ra-muted">Quy tắc này không có kho I10/I13 nên chưa gán mã kho được. Muốn đếm theo kho, soạn bản quy tắc tiếp theo có kho.</p>}
      {inCorpus && <label className="ra-label">Kho<select className="ra-field" value={corpusIndex} onChange={event => { setCorpusIndex(event.target.value); setRecordIndex(''); resetItem(); }}>
        <option value="">Chọn kho</option>{rules.corpora.map((item, at) => <option key={at} value={at}>Kho {at + 1} · {sectionLabels[item.sectionId]} · {item.question.slice(0, 60)}</option>)}</select></label>}
      {kind && (!inCorpus || corpus) && <>
        <label className="ra-label">Lọc bản ghi<input className="ra-field" type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
        <label className="ra-label">Bản ghi nguồn<select className="ra-field" value={recordIndex} onChange={event => { setRecordIndex(event.target.value); resetItem(); }}>
          <option value="">Chọn bản ghi</option>{options.map(at => <option key={at} value={at} disabled={unusable(at)}>{recordLabel(records, at)} · {records[at] ? recordStateLabels[records[at]!.disposition] : 'không có'}</option>)}</select></label>
        {candidates.length > options.length && <p className="ra-muted">Đang hiện {options.length}/{candidates.length} bản ghi. Gõ vào ô lọc để tìm bản ghi khác.</p>}
        {inCorpus && !candidates.length && <p className="ra-muted">Kho này chưa có bản ghi nào trong quy tắc đã duyệt.</p>}
      </>}
      {record && <SourceRecordView record={record} index={Number(recordIndex)} textRef={textRef} />}
      {record && kind === 'I06' && <>{picker('first', 'Sự kiện thứ nhất')}{picker('second', 'Sự kiện thứ hai')}</>}
      {record && kind === 'I09' && <>
        {picker('desired', 'Trạng thái mong muốn (không bắt buộc)')}{picker('current', 'Trạng thái hiện tại (không bắt buộc)')}
        <label className="ra-label">Cách xoay xở<select className="ra-field" value={workaround} onChange={event => { setWorkaround(event.target.value as FieldState | ''); setSpans(prior => ({ ...prior, workaround: null })); }}>
          <option value="">Chọn tình trạng</option>{(Object.keys(fieldStateLabels) as FieldState[]).map(item => <option key={item} value={item}>{fieldStateLabels[item]}</option>)}</select></label>
        {(workaround === 'SOURCE_STATED' || workaround === 'CONFLICTING') && picker('workaround', workaround === 'SOURCE_STATED' ? 'Đoạn nêu cách xoay xở' : 'Đoạn mâu thuẫn về cách xoay xở (không bắt buộc)')}
      </>}
      {record && (kind === 'I06' || kind === 'I09') && <>
        <label className="ra-check"><input type="checkbox" checked={relationOn} onChange={event => { setRelationOn(event.target.checked); setSpans(prior => ({ ...prior, context: null, link: null })); }} /> Nguồn có câu nối hai phần này</label>
        {relationOn && <>{picker('context', 'Đoạn ngữ cảnh', 'Đoạn này phải bao trọn cả hai phần và từ nối.')}{picker('link', 'Từ hoặc cụm nối')}</>}
      </>}
      {record && kind === 'I13' && picker('mention', 'Đoạn nhắc nguyên văn')}
      {record && kind === 'ASSIGN' && corpus && <>
        <label className="ra-label">Mã<select className="ra-field" value={code} onChange={event => { setCode(event.target.value); setSpans(prior => ({ ...prior, assignment: null })); }}>
          <option value="">Chọn mã</option>{corpus.codebook.codes.map(item => <option key={item.code} value={item.code}>{item.label} ({item.code})</option>)}</select></label>
        {!corpus.codebook.codes.length && <p className="ra-muted">Bộ mã của kho này trống. Soạn bản quy tắc tiếp theo để thêm mã.</p>}
        {chosenCode && picker('assignment', 'Đoạn chứa mã', corpus.sectionId === 'I13' ? 'I13 chỉ nhận đúng nguyên văn cụm từ của mã.' : undefined, corpus.sectionId === 'I13' ? chosenCode.phrase : undefined)}
      </>}
      {record && kind === 'STATE' && <label className="ra-label">Trạng thái của bản ghi trong kho<select className="ra-field" value={state} onChange={event => setState(event.target.value as Disposition['state'] | '')}>
        <option value="">Chọn trạng thái</option>{(Object.keys(dispositionLabels) as Disposition['state'][]).map(item => <option key={item} value={item}>{dispositionLabels[item]}</option>)}</select></label>}
      {extraPicker && <div className="ic-extras">
        {picker('extra', 'Điều kiện đi kèm hoặc bằng chứng ngược (không bắt buộc)', 'Chọn một đoạn rồi chọn cách ghi. Đoạn phải nằm trong cùng bản ghi.')}
        <div className="ra-actions">
          <button type="button" className="button" disabled={!span('extra')} onClick={() => { setExtras(prior => ({ ...prior, qualifiers: [...prior.qualifiers, span('extra')!] })); setSpans(prior => ({ ...prior, extra: null })); setRound(value => value + 1); }}>Thêm làm điều kiện đi kèm</button>
          <button type="button" className="button" disabled={!span('extra')} onClick={() => { setExtras(prior => ({ ...prior, counterevidence: [...prior.counterevidence, span('extra')!] })); setSpans(prior => ({ ...prior, extra: null })); setRound(value => value + 1); }}>Thêm làm bằng chứng ngược</button>
        </div>
        {(['qualifiers', 'counterevidence'] as const).map(group => extras[group].length > 0 && <ul key={group} className="ic-chips" aria-label={group === 'qualifiers' ? 'Điều kiện đi kèm' : 'Bằng chứng ngược'}>
          {extras[group].map((item, at) => <li key={`${item.start}:${item.end}:${at}`}>{group === 'qualifiers' ? 'Điều kiện' : 'Ngược'}: “{item.quote}” <button type="button" className="button" onClick={() => setExtras(prior => ({ ...prior, [group]: prior[group].filter((_, other) => other !== at) }))}>Bỏ<span className="ra-sr"> “{item.quote}”</span></button></li>)}</ul>)}
      </div>}
      {kind && <fieldset className="ic-provenance"><legend>Ai khai báo mục này</legend>
        <p className="ra-muted">Đây là lời khai báo đi kèm mục mã hóa, không phải quyền duyệt. Duyệt là bước riêng sau khi lưu đề xuất.</p>
        <label className="ra-label">Cơ sở<select className="ra-field" value={provenance.basis} onChange={event => setProvenance({ ...provenance, basis: event.target.value as ProvenanceDraft['basis'] })}>
          <option value="">Chọn cơ sở</option>{(Object.keys(basisLabels) as Provenance['basis'][]).map(item => <option key={item} value={item}>{basisLabels[item]}</option>)}</select></label>
        <label className="ra-label">Vai trò người mã hóa<input className="ra-field" maxLength={10000} value={provenance.coderRole} onChange={event => setProvenance({ ...provenance, coderRole: event.target.value })} /></label>
        <label className="ra-label">Cách phân xử{provenance.basis === 'HUMAN_REVIEWED' ? '' : ' (không bắt buộc)'}<textarea className="ra-field" maxLength={10000} rows={2} value={provenance.adjudication} onChange={event => setProvenance({ ...provenance, adjudication: event.target.value })} /></label>
        <label className="ra-label">Bất đồng chưa giải quyết (nếu có)<textarea className="ra-field" maxLength={10000} rows={2} value={provenance.disagreement} onChange={event => setProvenance({ ...provenance, disagreement: event.target.value })} /></label>
        {provenance.disagreement.trim() && <p className="ra-muted">Mục còn bất đồng vẫn được lưu trong đề xuất nhưng không thể duyệt cho đến khi có đề xuất mới đã phân xử.</p>}
      </fieldset>}
      {message && <p className={message.error ? 'ra-problem' : 'ra-muted'} role={message.error ? 'alert' : 'status'}>{message.text}</p>}
      <button type="button" className="button" disabled={!kind || !record} onClick={add}>Thêm vào bản nháp</button>
    </fieldset>

    <h5>Bản nháp đề xuất ({entries.length} mục)</h5>
    {!entries.length ? <p className="ra-muted">Bản nháp trống. Mục chỉ được thêm khi bạn chọn đoạn nguyên văn.</p>
      : <ul className="ic-entries">{entries.map(entry => <li key={entry.key}><p><span className="ic-tag">{sectionLabels[entry.section]}</span> <strong>{entry.title}</strong></p>
        {entry.lines.map((line, at) => <p className="ra-muted" key={at}>{line}</p>)}{entry.blocked && <p className="ic-hold">{entry.blocked}</p>}
        <button type="button" className="button" disabled={disabled} onClick={() => onChange(removeEntry(draft, entry.key))}>Bỏ mục<span className="ra-sr"> {entry.title}</span></button></li>)}</ul>}
    {rules.corpora.map((item, at) => { const cover = corpusCoverage(item, draft.corpora.find(coding => coding.corpusIndex === at), records); return <p className="ra-muted" key={at}>
      Kho {at + 1}: {cover.members} bản ghi thuộc kho ({cover.included} được đưa vào, {cover.excluded} bị loại, {cover.unreadable} không đọc được). Bản nháp có trạng thái cho {cover.withState} bản ghi; {cover.withoutState} bản ghi chưa có trạng thái và vẫn là chờ, không tính là 0.</p>; })}
  </section>;
}
