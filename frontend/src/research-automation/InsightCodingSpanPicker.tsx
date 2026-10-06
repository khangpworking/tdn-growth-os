import { useId, useState, type RefObject } from 'react';
import { exactSpan, occurrenceContext, quoteOccurrences, recordStateLabels, type SourceRecord, type Span } from './insight-coding-ui';

const LIMIT = 50;

/** Shows one record exactly as stored: no trimming, folding or line-ending rewrite. */
export function SourceRecordView({ record, index, textRef }: { record: SourceRecord; index: number; textRef?: RefObject<HTMLParagraphElement | null> }) {
  return <div className="ic-record">
    <p className="ic-record-meta"><strong>Bản ghi {index + 1}</strong> · {record.sourceAttribution} · <span className={`ic-state ic-state-${record.disposition.toLowerCase()}`}>{recordStateLabels[record.disposition]}</span></p>
    <p className="ra-muted">Vị trí trong nguồn: {record.locator}{record.timeText ? ` · Thời điểm nguồn ghi: ${record.timeText}` : ''}</p>
    {record.dispositionReason && <p className="ra-muted">Lý do: {record.dispositionReason}</p>}
    {record.text === null ? <p className="ra-problem">Nguồn không có nội dung đọc được cho bản ghi này; không thể trích đoạn.</p>
      : <p className="ic-record-text" ref={textRef} lang="vi">{record.text}</p>}
  </div>;
}

type Props = { label: string; text: string; value: Span | null; onChange: (span: Span | null) => void;
  fixedQuote?: string; hint?: string; disabled?: boolean; textRef?: RefObject<HTMLParagraphElement | null> };

/** The owner names words, not offsets: type or highlight a quote, then choose which occurrence is meant. */
export default function InsightCodingSpanPicker({ label, text, value, onChange, fixedQuote, hint, disabled, textRef }: Props) {
  const name = useId();
  const [typed, setTyped] = useState(value?.quote ?? '');
  const [problem, setProblem] = useState('');
  const [visibleCount, setVisibleCount] = useState(LIMIT);
  const quote = fixedQuote ?? typed;
  const matches = quoteOccurrences(text, quote, visibleCount + 1);
  const found = matches.slice(0, visibleCount);
  const more = matches.length > visibleCount;
  const choose = (next: string) => {
    setTyped(next); setProblem(''); setVisibleCount(LIMIT);
    const at = quoteOccurrences(text, next, 2);
    onChange(at.length === 1 ? exactSpan(text, at[0]!, at[0]! + next.length) : null);
  };
  const takeSelection = () => {
    const selection = window.getSelection();
    const node = textRef?.current?.firstChild;
    if (!selection || selection.isCollapsed || !node) { setProblem('Bôi đen một đoạn trong bản ghi đang mở trước.'); return; }
    if (selection.anchorNode !== node || selection.focusNode !== node) { setProblem('Đoạn bôi đen nằm ngoài nội dung bản ghi đang mở. Bôi đen lại trong khung bản ghi.'); return; }
    const span = exactSpan(text, Math.min(selection.anchorOffset, selection.focusOffset), Math.max(selection.anchorOffset, selection.focusOffset));
    if (!span) { setProblem('Đoạn bôi đen cắt ngang một ký tự. Bôi đen lại trọn ký tự.'); return; }
    setTyped(span.quote); setProblem(''); onChange(span);
  };
  return <fieldset className="ic-span" disabled={disabled}>
    <legend>{label}</legend>
    {hint && <p className="ra-muted">{hint}</p>}
    <div className="ic-span-entry">
      <label className="ra-label">{fixedQuote === undefined ? 'Trích nguyên văn' : 'Cụm từ của mã (nguyên văn)'}
        <input className="ra-field" value={quote} readOnly={fixedQuote !== undefined} maxLength={10000} onChange={event => choose(event.target.value)} /></label>
      {fixedQuote === undefined && textRef && <button type="button" className="button" onMouseDown={event => event.preventDefault()} onClick={takeSelection}>Lấy đoạn đang bôi đen</button>}
    </div>
    {problem && <p className="ra-problem" role="alert">{problem}</p>}
    {quote && !found.length && <p className="ra-problem">Không thấy đúng nguyên văn này trong bản ghi. Kiểm tra dấu, khoảng trắng, chữ hoa và chữ thường; hệ thống không tự sửa.</p>}
    {found.length > 0 && <div className="ic-occurrences">
      <p className="ra-muted">{found.length === 1 ? value ? 'Xuất hiện 1 lần, đã chọn.' : 'Xuất hiện 1 lần. Chọn để xác nhận.' : `Xuất hiện ${found.length}${more ? '+' : ''} lần. Chọn đúng lần bạn muốn trích.`}</p>
      {found.map((at, position) => { const near = occurrenceContext(text, at, at + quote.length); return <label className="ic-occurrence" key={at}>
        <input type="radio" name={name} checked={value?.start === at && value.end === at + quote.length} onChange={() => onChange(exactSpan(text, at, at + quote.length))} />
        <span><span className="ra-sr">Lần {position + 1}: </span>{near.before}<mark>{near.match}</mark>{near.after}</span></label>; })}
      {more && <button type="button" className="button" onClick={() => setVisibleCount(count => count + LIMIT)}>Xem thêm lần xuất hiện</button>}
    </div>}
    {value && <button type="button" className="button" onClick={() => { onChange(null); if (fixedQuote === undefined) setTyped(''); }}>Bỏ đoạn đã chọn</button>}
  </fieldset>;
}
