import { useState, type FormEvent } from 'react';
import InsightCodingSpanPicker from './InsightCodingSpanPicker';
import { recordStateLabels, ruleProblems, sectionLabels, type Code, type RuleCorpus, type Rules, type SourceRecord } from './insight-coding-ui';

type Props = { records: readonly SourceRecord[]; existing?: Rules; disabled: boolean; onPrepare: (rules: Rules) => void };
type CodeDraft = { key: string; value: Code };
// Codes live beside the corpus so each keeps a stable React key; toRules writes them back in order.
type CorpusDraft = { key: string; value: RuleCorpus; codes: CodeDraft[] };
const PAGE_SIZE = 20;
const key = () => crypto.randomUUID();
const blankCorpus = (sectionId: RuleCorpus['sectionId']): CorpusDraft => ({ key: key(), codes: [], value: { sectionId, recordIndexes: [], question: '', unit: '',
  period: null, frame: null, channel: null, inclusionRule: '', membershipComplete: false, multiCode: false, externalSampling: '', codebook: { revision: '', codes: [] }, assignments: [], dispositions: [] } });
const blankCode = (): CodeDraft => ({ key: key(), value: { code: '', label: '', phrase: '', firstRecordIndex: null, firstSpan: null } });
const nullable = (value: string) => value === '' ? null : value;
const toRules = (base: Omit<Rules, 'corpora'>, corpora: CorpusDraft[]): Rules => ({ ...base, corpora: corpora.map(({ value, codes }) =>
  ({ ...value, codebook: { revision: value.codebook.revision, codes: codes.map(code => value.sectionId === 'I13' ? { ...code.value, label: code.value.phrase } : code.value) } })) });

/** Starts blank. A next revision copies only the explicitly chosen adopted rule. */
export default function InsightCodingRuleForm({ records, existing, disabled, onPrepare }: Props) {
  const [base, setBase] = useState<Omit<Rules, 'corpora'>>(() => existing
    ? { ruleId: existing.ruleId, revision: existing.revision + 1, question: existing.question, inclusionRule: existing.inclusionRule, adjudicationRule: existing.adjudicationRule }
    : { ruleId: key(), revision: 1, question: '', inclusionRule: '', adjudicationRule: '' });
  const [corpora, setCorpora] = useState<CorpusDraft[]>(() => (existing?.corpora ?? []).map(corpus => ({ key: key(),
    value: structuredClone(corpus), codes: corpus.codebook.codes.map(code => ({ key: key(), value: structuredClone(code) })) })));
  const [errors, setErrors] = useState<string[]>([]);
  const update = (draftKey: string, change: (draft: CorpusDraft) => CorpusDraft) => setCorpora(list => list.map(item => item.key === draftKey ? change(item) : item));
  const submit = (event: FormEvent) => {
    event.preventDefault(); if (disabled) return;
    const rules = toRules(base, corpora);
    const problems = ruleProblems(rules, records);
    setErrors(problems);
    if (!problems.length) onPrepare(structuredClone(rules));
  };
  return <form className="ra-rule-form ic-rule-form" onSubmit={submit}>
    <fieldset disabled={disabled}><legend>{existing ? `Soạn quy tắc mã hóa bản ${base.revision}` : 'Quy tắc mã hóa mới'}</legend>
      <label className="ra-label">Câu hỏi nghiên cứu cho lượt mã hóa<textarea className="ra-field" required maxLength={4000} rows={2} value={base.question} onChange={event => setBase({ ...base, question: event.target.value })} /></label>
      <label className="ra-label">Tiêu chí đưa bản ghi vào<textarea className="ra-field" required maxLength={4000} rows={2} value={base.inclusionRule} onChange={event => setBase({ ...base, inclusionRule: event.target.value })} /></label>
      <label className="ra-label">Cách phân xử khi người mã hóa không thống nhất<textarea className="ra-field" required maxLength={4000} rows={2} value={base.adjudicationRule} onChange={event => setBase({ ...base, adjudicationRule: event.target.value })} /></label>
      <p className="ra-muted">I06 và I09 dùng chung câu hỏi và tiêu chí này. I10 và I13 cần kho riêng với danh sách bản ghi và bộ mã bạn tự đặt; hệ thống không gợi ý mã, nhãn ngành hay nhóm khách hàng.</p>
      {corpora.map((draft, index) => <CorpusEditor key={draft.key} index={index} draft={draft} records={records}
        onChange={change => update(draft.key, change)} onRemove={() => setCorpora(list => list.filter(item => item.key !== draft.key))} />)}
      <div className="ra-actions">
        <button type="button" className="button" disabled={corpora.length >= 100} onClick={() => setCorpora(list => [...list, blankCorpus('I10')])}>Thêm kho I10</button>
        <button type="button" className="button" disabled={corpora.length >= 100} onClick={() => setCorpora(list => [...list, blankCorpus('I13')])}>Thêm kho I13</button>
      </div>
      <p className="ra-muted">Bước tiếp theo chỉ xác nhận quy tắc. Chưa gán mã, chưa duyệt mục nào và chưa tạo báo cáo.</p>
      {errors.length > 0 && <div className="ra-problem" role="alert"><p>Chưa thể xem lại quy tắc:</p><ul>{errors.map(item => <li key={item}>{item}</li>)}</ul></div>}
      <button type="submit" className="button primary">Xem lại quy tắc mã hóa</button>
    </fieldset>
  </form>;
}

type EditorProps = { index: number; draft: CorpusDraft; records: readonly SourceRecord[]; onChange: (change: (draft: CorpusDraft) => CorpusDraft) => void; onRemove: () => void };

function CorpusEditor({ index, draft, records, onChange, onRemove }: EditorProps) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const corpus = draft.value;
  const name = `Kho ${index + 1}`;
  const set = (change: Partial<RuleCorpus>) => onChange(item => ({ ...item, value: { ...item.value, ...change } }));
  const setCode = (codeKey: string, change: Partial<Code>) => onChange(item => ({ ...item, codes: item.codes.map(code => code.key === codeKey ? { ...code, value: { ...code.value, ...change } } : code) }));
  const members = new Set(corpus.recordIndexes);
  const toggle = (indexes: readonly number[], on: boolean) => set({ recordIndexes: [...new Set(on ? [...corpus.recordIndexes, ...indexes] : corpus.recordIndexes.filter(item => !indexes.includes(item)))].sort((a, b) => a - b) });
  const needle = query.toLocaleLowerCase('vi');
  const matching = records.map((record, at) => ({ record, at })).filter(({ record }) => !needle || `${record.sourceAttribution} ${record.locator} ${record.text ?? ''}`.toLocaleLowerCase('vi').includes(needle));
  const pageCount = Math.max(1, Math.ceil(matching.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = matching.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
  const literal = corpus.sectionId === 'I13';
  return <fieldset className="ic-corpus"><legend>{name} · {sectionLabels[corpus.sectionId]}</legend>
    <label className="ra-label">Câu hỏi của kho<textarea className="ra-field" required maxLength={10000} rows={2} value={corpus.question} onChange={event => set({ question: event.target.value })} /></label>
    <label className="ra-label">Đơn vị được đếm<input className="ra-field" required maxLength={10000} value={corpus.unit} onChange={event => set({ unit: event.target.value })} /></label>
    <label className="ra-label">Tiêu chí đưa bản ghi vào kho<textarea className="ra-field" required maxLength={10000} rows={2} value={corpus.inclusionRule} onChange={event => set({ inclusionRule: event.target.value })} /></label>
    <label className="ra-label">Cách lấy mẫu bên ngoài nguồn<textarea className="ra-field" required maxLength={10000} rows={2} value={corpus.externalSampling} onChange={event => set({ externalSampling: event.target.value })} /></label>
    <div className="ic-grid">
      <label className="ra-label">Kỳ dữ liệu<input className="ra-field" maxLength={10000} value={corpus.period ?? ''} onChange={event => set({ period: nullable(event.target.value) })} /></label>
      <label className="ra-label">Khung chọn mẫu<input className="ra-field" maxLength={10000} value={corpus.frame ?? ''} onChange={event => set({ frame: nullable(event.target.value) })} /></label>
      <label className="ra-label">Kênh{literal ? '' : ' (không bắt buộc với I10)'}<input className="ra-field" maxLength={10000} value={corpus.channel ?? ''} onChange={event => set({ channel: nullable(event.target.value) })} /></label>
    </div>
    <p className="ra-muted">Để trống kỳ, khung{literal ? ' hoặc kênh' : ''} nghĩa là chưa khai báo: kho vẫn lưu được nhưng không ra tỷ lệ cho đến khi có đủ.</p>
    <label className="ra-check"><input type="checkbox" checked={corpus.multiCode} onChange={event => set({ multiCode: event.target.checked })} /> Cho phép một bản ghi nhận nhiều mã</label>

    <h5>Bản ghi thuộc {name.toLocaleLowerCase('vi')}</h5>
    <p className="ra-muted">Đã chọn {members.size}/{records.length} bản ghi. Chỉ bản ghi bạn đánh dấu mới thuộc kho; bản ghi bị loại hoặc không đọc được vẫn được đếm riêng, không thành 0.</p>
    <label className="ra-label">Tìm bản ghi<input className="ra-field" type="search" value={query} onChange={event => { setQuery(event.target.value); setPage(0); }} /></label>
    <div className="ra-actions">
      <button type="button" className="button" disabled={!matching.length} onClick={() => toggle(matching.map(item => item.at), true)}>Chọn {matching.length} bản ghi khớp bộ lọc</button>
      <button type="button" className="button" disabled={!members.size} onClick={() => set({ recordIndexes: [], membershipComplete: false })}>Bỏ chọn tất cả</button>
    </div>
    <ul className="ic-members">{visible.map(({ record, at }) => <li key={at}><label className="ra-check">
      <input type="checkbox" checked={members.has(at)} onChange={event => toggle([at], event.target.checked)} />
      <span><strong>Bản ghi {at + 1}</strong> · {record.sourceAttribution} · {recordStateLabels[record.disposition]}<span className="ic-snippet">{record.text === null ? 'Không đọc được' : record.text.slice(0, 160)}</span></span></label></li>)}</ul>
    {matching.length > PAGE_SIZE && <nav className="ra-actions" aria-label={`Trang bản ghi của ${name}`}><button className="button" type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>Trang trước</button><span>Trang {current + 1}/{pageCount}</span><button className="button" type="button" disabled={current + 1 >= pageCount} onClick={() => setPage(current + 1)}>Trang sau</button></nav>}
    <label className="ra-check"><input type="checkbox" checked={corpus.membershipComplete} onChange={event => set({ membershipComplete: event.target.checked })} /> Tôi xác nhận danh sách bản ghi của kho đã đầy đủ theo tiêu chí</label>

    <h5>Bộ mã</h5>
    <label className="ra-label">Tên bản bộ mã<input className="ra-field" required maxLength={10000} value={corpus.codebook.revision} onChange={event => set({ codebook: { revision: event.target.value, codes: [] } })} /></label>
    {literal && <p className="ra-muted">I13 đếm nhắc nguyên văn: nhãn của mỗi mã chính là cụm từ, và đoạn gán phải đúng cụm từ đó.</p>}
    {!draft.codes.length && <p className="ra-muted">Chưa có mã nào. Thêm mã bạn định nghĩa; hệ thống không tự đề xuất mã.</p>}
    {draft.codes.map((item, codeIndex) => {
      const code = item.value;
      const firstText = code.firstRecordIndex === null ? null : records[code.firstRecordIndex]?.text ?? null;
      return <div className="ra-rule-group" key={item.key}>
        <div className="ic-grid">
          <label className="ra-label">Mã {codeIndex + 1}<input className="ra-field" required maxLength={10000} value={code.code} onChange={event => setCode(item.key, { code: event.target.value })} /></label>
          {!literal && <label className="ra-label">Nhãn mã {codeIndex + 1}<input className="ra-field" required maxLength={10000} value={code.label} onChange={event => setCode(item.key, { label: event.target.value })} /></label>}
          <label className="ra-label">Cụm từ {literal ? 'nguyên văn' : 'mô tả'} của mã {codeIndex + 1}<input className="ra-field" required maxLength={10000} value={code.phrase} onChange={event => setCode(item.key, { phrase: event.target.value, firstSpan: null })} /></label>
        </div>
        <label className="ra-label">Lần xuất hiện đầu tiên (không bắt buộc)<select className="ra-field" value={code.firstRecordIndex ?? ''} onChange={event => setCode(item.key, { firstRecordIndex: event.target.value === '' ? null : Number(event.target.value), firstSpan: null })}>
          <option value="">Không khai báo</option>{corpus.recordIndexes.filter(at => records[at]?.text !== null && records[at] !== undefined).map(at => <option key={at} value={at}>Bản ghi {at + 1} · {records[at]!.sourceAttribution}</option>)}</select></label>
        {firstText !== null && code.phrase && <InsightCodingSpanPicker key={`${code.firstRecordIndex}:${code.phrase}`} label={`Vị trí đầu tiên của mã ${codeIndex + 1}`} text={firstText} fixedQuote={code.phrase}
          value={code.firstSpan} onChange={span => setCode(item.key, { firstSpan: span })} />}
        <button type="button" className="button" onClick={() => onChange(prior => ({ ...prior, codes: prior.codes.filter(other => other.key !== item.key) }))}>Bỏ mã {codeIndex + 1}</button>
      </div>;
    })}
    <div className="ra-actions">
      <button type="button" className="button" onClick={() => onChange(prior => ({ ...prior, codes: [...prior.codes, blankCode()] }))}>Thêm mã</button>
      <button type="button" className="button" onClick={onRemove}>Bỏ {name.toLocaleLowerCase('vi')}</button>
    </div>
  </fieldset>;
}
