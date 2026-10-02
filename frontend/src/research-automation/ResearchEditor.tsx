import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import type { FrontendMode } from '../data-source';
import { ResearchAutomationError, startRun } from './api';
import { draftProblem, emptyDraft, interviewQuestions, looksDetailed, splitPastedKeyword, startBody } from './form';
import type { InterviewIntent, ReportChoice, ResearchDraft } from './form';
import { defaultPeriod, editPeriodDate, inclusiveDays, periodPresets, periodProblem, presetLabel, resolvePreset, vietnamToday } from './period';
import type { PeriodDraft, PeriodPreset } from './period';
import { researchAutomationHash } from './routes';
import { formatDay, modeLabel } from './run-status';
import StepNav from './StepNav';
import type { StepItem } from './StepNav';

type EditorStep = 1 | 2 | 3;

export interface ResearchEditorProps {
  readonly mode: FrontendMode;
  readonly workspaceId: string;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

/** Steps 1–3 stay in the browser. Nothing is sent until the owner presses Start. */
export default function ResearchEditor({ mode, workspaceId, ownerToken, writesAvailable, navigate, notify }: ResearchEditorProps) {
  const today = useMemo(() => vietnamToday(), []);
  const [draft, setDraft] = useState<ResearchDraft>(() => emptyDraft(defaultPeriod(today)));
  const [step, setStep] = useState<EditorStep>(1);
  const [reached, setReached] = useState<EditorStep>(1);
  const [splitUndo, setSplitUndo] = useState<Pick<ResearchDraft, 'keyword' | 'description' | 'mode'> | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const operation = useRef<{ readonly fingerprint: string; readonly requestKey: string } | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const tokenNow = useRef(ownerToken);
  tokenNow.current = ownerToken;
  const heading = useRef<HTMLHeadingElement>(null);
  const firstRender = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (firstRender.current) { firstRender.current = false; return; } heading.current?.focus(); }, [step]);

  const product = draft.mode === 'PRODUCT';
  const keywordProblem = draftProblem(draft);
  const datesProblem = periodProblem(draft.period, today);
  const days = inclusiveDays(draft.period.startDate, draft.period.endDate);
  const update = (patch: Partial<ResearchDraft>) => { setDraft(prior => ({ ...prior, ...patch })); setMessage(''); };
  const setPeriod = (period: PeriodDraft) => update({ period });
  const answer = (intent: InterviewIntent, patch: Partial<ResearchDraft['interview'][InterviewIntent]>) =>
    setDraft(prior => ({ ...prior, interview: { ...prior.interview, [intent]: { ...prior.interview[intent], ...patch } } }));
  const goTo = (next: EditorStep) => { setStep(next); setReached(prior => (next > prior ? next : prior)); };
  const afterKeyword: EditorStep = product ? 3 : 2;

  const applySplit = (text: string) => {
    setSplitUndo({ keyword: draft.keyword, description: draft.description, mode: draft.mode });
    const split = splitPastedKeyword(text);
    update({ keyword: split.keyword, description: split.description, mode: 'PRODUCT' });
  };
  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData('text');
    if (!looksDetailed(text)) return;
    event.preventDefault();
    applySplit(text);
  };

  const blockedReason = mode === 'demo' ? 'Demo không gửi yêu cầu nghiên cứu và không tạo kết quả giả. Chuyển sang dữ liệu thật để chạy.'
    : !writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này, nên chưa thể bắt đầu.'
      : !ownerToken ? 'Mở khóa OWNER ở đầu trang để bắt đầu.' : null;

  const start = async () => {
    if (busy.current || blockedReason || keywordProblem || datesProblem || !ownerToken) return;
    const fingerprint = JSON.stringify(startBody(draft, ''));
    if (operation.current?.fingerprint !== fingerprint) operation.current = { fingerprint, requestKey: crypto.randomUUID() };
    const current = operation.current;
    if (!current) return;
    const token = ownerToken;
    busy.current = true;
    setPending(true);
    setMessage('');
    try {
      const run = await startRun(workspaceId, startBody(draft, current.requestKey), token);
      if (!mounted.current || operation.current !== current || tokenNow.current !== token) return;
      operation.current = null;
      notify('Đã bắt đầu tìm nhanh. Trang theo dõi phiên nghiên cứu đang mở.');
      navigate(researchAutomationHash(workspaceId, run.runId));
    } catch (error) {
      if (!mounted.current || operation.current !== current) return;
      setMessage(startErrorMessage(error));
    } finally {
      busy.current = false;
      if (mounted.current) setPending(false);
    }
  };

  const steps: readonly StepItem[] = [
    { label: 'Từ khóa', state: step === 1 ? 'current' : 'done', onSelect: () => goTo(1) },
    product
      ? { label: 'Phỏng vấn', note: 'Bỏ qua · đã có mô tả', state: reached > 2 ? 'done' : 'upcoming' }
      : { label: 'Phỏng vấn', state: step === 2 ? 'current' : reached > 2 ? 'done' : 'upcoming', ...(reached >= 2 ? { onSelect: () => goTo(2) } : {}) },
    { label: 'Kỳ và báo cáo', state: step === 3 ? 'current' : 'upcoming', ...(reached >= 3 ? { onSelect: () => goTo(3) } : {}) },
    { label: 'Tìm nhanh', note: 'Sau khi bấm Bắt đầu', state: 'upcoming' },
    { label: 'Chọn thẻ và phạm vi', state: 'upcoming' },
    { label: 'Thu thập và báo cáo', state: 'upcoming' },
  ];

  return <div className="ra-dossier">
    <aside className="ra-side"><StepNav steps={steps} /></aside>
    <section className="ra-main" aria-labelledby="ra-editor-title">
      {step === 1 && <>
        <div className="ra-section-head"><h2 id="ra-editor-title" ref={heading} tabIndex={-1}>Bạn muốn nghiên cứu gì?</h2><p>Gõ một ngành, một loại sản phẩm, hoặc tên sản phẩm của bạn.</p></div>
        <label className="ra-label" htmlFor="ra-keyword">Từ khóa
          <input id="ra-keyword" className="ra-field ra-big" value={draft.keyword} autoComplete="off" disabled={pending} placeholder="ví dụ: giày chạy bộ, đồ chơi gỗ, canxi cho bà bầu"
            onChange={event => { setSplitUndo(null); update({ keyword: event.target.value }); }} onPaste={onPaste}
            onBlur={() => { if (looksDetailed(draft.keyword)) applySplit(draft.keyword); }} />
        </label>
        {splitUndo && <div className="ra-banner" role="status"><div><b>Đã tách đoạn bạn dán</b><p>Tên sản phẩm dùng làm từ khóa. Cả đoạn văn chuyển xuống ô mô tả, và chế độ chuyển sang Sản phẩm cụ thể.</p></div>
          <button type="button" className="button" onClick={() => { update(splitUndo); setSplitUndo(null); }}>Hoàn tác</button></div>}
        <div className="ra-panel">
          <div className="ra-panel-row"><div><h3>Chế độ nghiên cứu</h3><p>Bạn đã có sẵn sản phẩm trong đầu, hay đang muốn tìm hiểu cả ngành?</p></div>
            <div className="ra-seg" role="group" aria-label="Chế độ nghiên cứu">
              <button type="button" aria-pressed={product} disabled={pending} onClick={() => update({ mode: 'PRODUCT' })}>Sản phẩm cụ thể</button>
              <button type="button" aria-pressed={!product} disabled={pending} onClick={() => update({ mode: 'CATEGORY' })}>Khám phá ngành</button>
            </div></div>
          <p className="ra-muted">{product ? 'Mô tả sản phẩm bên dưới. Không cần phỏng vấn: hệ thống tìm sản phẩm thật giống mô tả để bạn chọn.' : 'Không cần mô tả thêm. Hệ thống hỏi vài câu để hiểu đúng ý bạn, rồi cho bạn xem sản phẩm thật để chọn.'}</p>
        </div>
        {product && <label className="ra-label" htmlFor="ra-description">Mô tả sản phẩm của bạn<small>Dán mô tả hoặc link sản phẩm. Tên, dạng, dành cho ai, giá: càng rõ càng khớp.</small>
          <textarea id="ra-description" className="ra-field" rows={4} value={draft.description} disabled={pending} placeholder="ví dụ: Viên canxi nano cho bà bầu, hộp 60 viên, giá 320.000đ" onChange={event => update({ description: event.target.value })} />
        </label>}
        <div className="ra-actions"><button type="button" className="button primary" disabled={keywordProblem !== null} onClick={() => goTo(afterKeyword)}>Tiếp tục</button>{keywordProblem && draft.keyword.trim() && <span className="ra-muted">{keywordProblem}</span>}</div>
      </>}

      {step === 2 && <>
        <div className="ra-section-head"><h2 id="ra-editor-title" ref={heading} tabIndex={-1}>Làm rõ ý bạn về “{draft.keyword.trim()}”</h2><p>Mỗi câu đều có thể trả lời Không biết. Câu trả lời chỉ ghi lại bối cảnh bạn cung cấp; phần chưa biết không được tự điền, và nguồn thực tế có thể vẫn chưa đủ dữ liệu.</p></div>
        <div className="ra-questions">{interviewQuestions.map(question => {
          const value = draft.interview[question.intent];
          const id = `ra-q-${question.intent}`;
          return <div className="ra-question" key={question.intent}>
            <label htmlFor={id}>{question.question}<small>{question.hint}</small></label>
            <div className="ra-question-input">
              <input id={id} className="ra-field" value={value.unknown ? '' : value.text} disabled={value.unknown} autoComplete="off" onChange={event => answer(question.intent, { text: event.target.value })} />
              <button type="button" className="button" aria-pressed={value.unknown} onClick={() => answer(question.intent, { unknown: !value.unknown })}>Không biết</button>
            </div>
          </div>;
        })}</div>
        <div className="ra-actions"><button type="button" className="button" onClick={() => goTo(1)}>Quay lại</button><button type="button" className="button primary" onClick={() => goTo(3)}>Tiếp tục</button></div>
      </>}

      {step === 3 && <>
        <div className="ra-section-head"><h2 id="ra-editor-title" ref={heading} tabIndex={-1}>Kỳ nghiên cứu và báo cáo</h2><p>Thị trường cố định là Việt Nam. Kỳ đã chọn được giữ nguyên cho cả phiên; muốn đổi kỳ cần tạo phiên mới.</p></div>
        <fieldset className="ra-period" disabled={pending}>
          <legend>Kỳ nghiên cứu</legend>
          <label className="ra-label" htmlFor="ra-period-preset">Chọn nhanh kỳ nghiên cứu
            <select id="ra-period-preset" className="ra-field ra-preset" value={draft.period.preset} onChange={event => { const preset = event.target.value as PeriodPreset; setPeriod(preset === 'CUSTOM' ? { ...draft.period, preset } : resolvePreset(preset, today)); }}>
              {periodPresets.map(preset => <option value={preset} key={preset}>{presetLabel(preset, today)}{preset === 'D365' ? ' · mặc định' : ''}</option>)}
            </select>
          </label>
          <div className="ra-dates">
            <label htmlFor="ra-start">Từ ngày<input id="ra-start" type="date" className="ra-field" max={today} value={draft.period.startDate} onChange={event => setPeriod(editPeriodDate(draft.period, 'startDate', event.target.value))} /></label>
            <label htmlFor="ra-end">Đến ngày<input id="ra-end" type="date" className="ra-field" max={today} value={draft.period.endDate} onChange={event => setPeriod(editPeriodDate(draft.period, 'endDate', event.target.value))} /></label>
            <output className="ra-count" htmlFor="ra-start ra-end" aria-live="polite">{days === null ? 'Chưa tính được số ngày' : <><b>{days}</b> ngày, tính cả ngày đầu và ngày cuối</>}</output>
          </div>
          {datesProblem && <p className="ra-problem" role="alert">{datesProblem}</p>}
          <p className="ra-muted">Thị trường: <b>Việt Nam</b> (cố định). Kỳ dữ liệu thực tế của từng nguồn có thể ngắn hơn và sẽ được ghi riêng.</p>
        </fieldset>
        <fieldset className="ra-period" disabled={pending}>
          <legend>Báo cáo cần soạn</legend>
          <div className="ra-seg" role="group" aria-label="Báo cáo cần soạn">{(['BOTH', 'MARKET', 'INSIGHT'] as const satisfies readonly ReportChoice[]).map(choice => <button type="button" key={choice} aria-pressed={draft.reports === choice} onClick={() => update({ reports: choice })}>{choice === 'BOTH' ? 'Cả hai' : choice === 'MARKET' ? 'Chỉ Thị trường' : 'Chỉ Insight'}</button>)}</div>
          <p className="ra-muted">Chọn trước khi bắt đầu; bước duyệt phạm vi sẽ hiển thị lại lựa chọn này.</p>
        </fieldset>
        <div className="ra-start">
          <p>Bấm Bắt đầu để hệ thống tìm nhanh sản phẩm thật trên nguồn đã kết nối. Chưa thu thập đầy đủ cho tới khi bạn duyệt phạm vi.</p>
          {blockedReason && <p className="ra-muted" role="note">{blockedReason}</p>}
          {message && <p className="ra-problem" role="alert">{message}</p>}
          <div className="ra-actions">
            <button type="button" className="button" disabled={pending} onClick={() => goTo(product ? 1 : 2)}>Quay lại</button>
            <button type="button" className="button primary" disabled={pending || blockedReason !== null || keywordProblem !== null || datesProblem !== null} onClick={() => void start()}>{pending ? 'Đang gửi…' : 'Bắt đầu tìm nhanh'}</button>
          </div>
        </div>
      </>}
    </section>
    <aside className="ra-inspector" aria-labelledby="ra-understood-title">
      <h2 id="ra-understood-title">Hệ thống đã hiểu</h2>
      <dl className="ra-kv">
        <div><dt>Chế độ</dt><dd>{modeLabel(draft.mode)}</dd></div>
        <div><dt>Từ khóa</dt><dd>{draft.keyword.trim() || 'Chưa nhập'}</dd></div>
        {product && <div><dt>Mô tả</dt><dd className="ra-clamp">{draft.description.trim() || 'Chưa có mô tả'}</dd></div>}
        {!product && interviewQuestions.map(question => {
          const value = draft.interview[question.intent];
          return value.unknown || value.text.trim() ? <div key={question.intent}><dt>{question.label}</dt><dd>{value.unknown ? 'Không biết · giữ nguyên là chưa biết' : value.text.trim()}</dd></div> : null;
        })}
        <div><dt>Kỳ</dt><dd>{formatDay(draft.period.startDate)} → {formatDay(draft.period.endDate)}{days !== null && ` · ${days} ngày`}</dd></div>
        <div><dt>Thị trường</dt><dd>Việt Nam</dd></div>
        <div><dt>Báo cáo</dt><dd>{draft.reports === 'BOTH' ? 'Thị trường và Insight' : draft.reports === 'MARKET' ? 'Chỉ Thị trường' : 'Chỉ Insight'}</dd></div>
      </dl>
      <p className="ra-muted">Đây là điều bạn đã nhập, chưa được kiểm chứng. Câu trả lời “Không biết” vẫn giữ nguyên; nguồn thực tế có thể không đủ dữ liệu.</p>
    </aside>
  </div>;
}

function startErrorMessage(error: unknown): string {
  if (!(error instanceof ResearchAutomationError)) return 'Chưa gửi được yêu cầu. Bấm Bắt đầu lại: hệ thống dùng lại cùng mã yêu cầu nên không tạo phiên trùng.';
  if (error.kind === 'authorization') return 'OWNER chưa mở khóa hoặc token không còn hợp lệ. Mở khóa ở đầu trang rồi bấm Bắt đầu lại.';
  if (error.kind === 'conflict') return 'Máy chủ báo yêu cầu này trùng với một phiên khác. Xem lịch sử nghiên cứu bên dưới trước khi gửi lại.';
  if (error.kind === 'rejected') return 'Máy chủ không nhận yêu cầu. Kiểm tra từ khóa, kỳ nghiên cứu và báo cáo đã chọn.';
  if (error.kind === 'integrity') return 'Đã gửi nhưng chưa xác minh được phản hồi. Xem lịch sử nghiên cứu bên dưới; bấm Bắt đầu lại sẽ dùng cùng mã yêu cầu.';
  return 'Chưa gửi được yêu cầu. Bấm Bắt đầu lại: hệ thống dùng lại cùng mã yêu cầu nên không tạo phiên trùng.';
}
