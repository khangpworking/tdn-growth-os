import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { loadInsightCoding, proposeInsightCodingModel, type InsightModelRequest, type ResearchInsightModelResponse } from './insight-coding-api';
import { canonical, codingHistory, type AdoptionItem, type View } from './insight-coding-ui';
import { chainProblem, declaredRowsOn, modelBatches, modelCorpus, proposalMatches } from './insight-model-batches';

type Props = { run: ResearchAutomationRun; pairId: string; versionNumber: number; ownerToken: string | null; view: View; adoption: AdoptionItem; ruleLabel: string;
  block: string | null; startBlock: string | null; inFlight: MutableRefObject<boolean>; onBusyChanged: (value: boolean) => void;
  onVerified: (view: View, proposalId: string) => void; onReload: () => void };
type Plan = { binding: string; adoptionId: string; batches: number[][]; corpus: ReturnType<typeof modelCorpus> };
/** Everything the owner confirmed: the plan, where to start, the predecessor and the batches already verified. */
type Start = { plan: Plan; from: number; predecessorId: string | null; predecessorLabel: string; done: ReadonlySet<number>; declared: number; receipts: number };
/** An ambiguous batch keeps its exact body; only an explicit retry may send it again. */
type Held = { plan: Plan; at: number; body: InsightModelRequest };
type Outcome = { text: string; problem: boolean };

const notDispatched = { AI_NOT_CONFIGURED: 'Máy chủ chưa cấu hình model.', INSUFFICIENT_EVIDENCE: 'Lô này chưa đủ nguyên văn để gửi model.' } as const;
const invalidCodes = { RESPONSE_NOT_TEXT: 'model không trả về văn bản', RESPONSE_TOO_LARGE: 'phản hồi của model vượt giới hạn', RESPONSE_NOT_JSON: 'phản hồi của model không phải JSON',
  INVALID_INSIGHT_CODING_RESPONSE: 'phản hồi của model không đúng cấu trúc mã hóa' } as const;
const unknownCodes = { INTERRUPTED_AFTER_CLAIM: 'máy chủ bị ngắt sau khi nhận lô', TRANSPORT_OUTCOME_AMBIGUOUS: 'kết nối tới model không cho biết kết quả', RESPONSE_NOT_RETAINED: 'máy chủ không lưu được phản hồi của model' } as const;
const range = (indexes: readonly number[]) => `bản ghi ${indexes[0]! + 1} đến ${indexes.at(-1)! + 1}`;
const batchSummary = (batches: readonly number[][]) => {
  const full = batches.filter(batch => batch.length === batches[0]!.length).length, last = batches.at(-1)!;
  return full === batches.length ? `${batches.length} lô × ${batches[0]!.length} bản ghi` : `${full} lô × ${batches[0]!.length} bản ghi, lô cuối ${last.length} bản ghi`;
};

/** Explicit model coding for every eligible record of one adopted rule. It only adds proposals to the existing review; nothing is accepted here. */
export default function InsightModelProposalPanel({ run, pairId, versionNumber, ownerToken, view, adoption, ruleLabel, block, startBlock, inFlight, onBusyChanged, onVerified, onReload }: Props) {
  const [start, setStart] = useState<Start | null>(null);
  const [held, setHeld] = useState<Held | null>(null);
  const [abandon, setAbandon] = useState(false);
  const [running, setRunning] = useState(false);
  const [sending, setSending] = useState<number | null>(null);
  const [stopping, setStopping] = useState(false);
  const [progress, setProgress] = useState<{ plan: Plan; done: ReadonlySet<number> } | null>(null);
  const [uncertain, setUncertain] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const mounted = useRef(false), stop = useRef(false), cut = useRef<'OWNER' | 'USER' | null>(null);
  const active = useRef<AbortController | null>(null), runToken = useRef<string | null>(null);
  const stopButton = useRef<HTMLButtonElement>(null), result = useRef<HTMLDivElement>(null), wasRunning = useRef(false);
  const dialogOpener = useRef<HTMLElement | null>(null);
  const live = useRef({ ownerToken, block });
  live.current = { ownerToken, block };

  const busy = running || held !== null || start !== null || abandon;
  useEffect(() => { onBusyChanged(busy); }, [busy, onBusyChanged]);
  useEffect(() => () => onBusyChanged(false), [onBusyChanged]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop.current = true; active.current?.abort(); }; }, []);
  useEffect(() => {
    if (start || abandon) return;
    // The opener is disabled before ConfirmDialog mounts; restore it after cancellation re-enables it.
    const opener = dialogOpener.current;
    dialogOpener.current = null;
    if (!running && opener?.isConnected) opener.focus();
  }, [start, abandon, running]);
  // A changed or removed OWNER token ends the sequence: no later batch, and the pending request is cut, not undone.
  useEffect(() => { if (runToken.current !== null && ownerToken !== runToken.current) { stop.current = true; cut.current = 'OWNER'; active.current?.abort(); } }, [ownerToken]);
  useEffect(() => {
    if (running) stopButton.current?.focus();
    else if (wasRunning.current && (document.activeElement === document.body || !document.activeElement?.isConnected)) result.current?.focus();
    wasRunning.current = running;
  }, [running]);

  const corpus = modelCorpus(view.context.input.records);
  const history = codingHistory(view);
  const latest = history.proposals.get(adoption.evidence.evidenceId)?.find(item => item.latest);
  const remaining = progress ? progress.plan.batches.findIndex((_, at) => !progress.done.has(at)) : -1;
  const resumable = progress !== null && remaining >= 0 && !held;
  const gate = block ?? startBlock ?? (!adoption.current ? 'Quy tắc này đã có bản mới hơn.' : !corpus.eligible.length ? 'Không có bản ghi nào được đưa vào và có văn bản để gửi model.' : null);

  const open = (plan: Plan, from: number, done: ReadonlySet<number>) => {
    if (gate || busy || inFlight.current) return;
    dialogOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const left = new Set(plan.batches.filter((_, at) => at >= from && !done.has(at)).flat());
    setOutcome(null);
    setStart({ plan, from, done, predecessorId: latest?.evidence.evidenceId ?? null,
      predecessorLabel: latest ? `${latest.label}, bản mới nhất của ${ruleLabel}` : `Đề xuất đầu tiên của ${ruleLabel}`,
      declared: latest ? declaredRowsOn(latest.request.annotations, left) : 0, receipts: latest ? history.receipts.get(latest.evidence.evidenceId)?.length ?? 0 : 0 });
  };
  const openFresh = () => open({ binding: canonical(view.context.binding), adoptionId: adoption.evidence.evidenceId, batches: modelBatches(corpus.eligible), corpus }, 0, new Set());

  const finish = (text: string, problem: boolean) => { if (mounted.current) setOutcome({ text, problem }); };
  /** Sends batches strictly one after another. Every exit says what is verified and what was not sent; nothing resumes on its own. */
  const sequence = async (plan: Plan, from: number, predecessorId: string | null, done: ReadonlySet<number>, retry: InsightModelRequest | null) => {
    const token = live.current.ownerToken;
    if (inFlight.current || !token) return;
    inFlight.current = true; stop.current = false; cut.current = null; runToken.current = token;
    const finished = new Set(done);
    setRunning(true); setStopping(false); setHeld(null); setOutcome(null); setUncertain(null); setProgress({ plan, done: new Set(finished) });
    let predecessor = predecessorId;
    const last = retry ? from + 1 : plan.batches.length;
    const hold = (at: number, body: InsightModelRequest, text: string) => {
      if (!mounted.current) return;
      setHeld({ plan, at, body }); finish(text, true);
    };
    try {
      for (let at = from; at < last; at++) {
        if (finished.has(at)) continue;
        const label = `lô ${at + 1}/${plan.batches.length}`, Label = `Lô ${at + 1}/${plan.batches.length}`;
        if (!mounted.current) return;
        const halt = stop.current ? (cut.current === 'OWNER' ? 'Khóa OWNER đã thay đổi.' : 'Đã dừng theo yêu cầu.') : live.current.ownerToken !== token ? 'Khóa OWNER đã thay đổi.' : live.current.block;
        if (halt) { finish(`${halt} Chưa gửi ${label} và các lô sau.`, false); return; }
        const body: InsightModelRequest = retry ?? { contractVersion: 'insight-model-request-v1', requestKey: crypto.randomUUID(), adoptionId: plan.adoptionId,
          previousProposalId: predecessor, recordIndexes: plan.batches[at]! };
        const abort = new AbortController(); active.current = abort;
        setSending(at);
        let response: ResearchInsightModelResponse;
        try { response = await proposeInsightCodingModel(run.workspaceId, run.runId, body, token, abort.signal); }
        catch (error) {
          if (!mounted.current) return;
          if (error instanceof ResearchAutomationError && ['rejected', 'authorization', 'notFound'].includes(error.kind)) {
            finish(`${error.message} Máy chủ từ chối ${label} trước khi gọi model; chưa gửi các lô sau.`, true); return;
          }
          if (error instanceof ResearchAutomationError && error.kind === 'conflict') {
            hold(at, body, `${error.message} ${Label} bị xung đột: lô này có thể đang được xử lý hoặc đề xuất trước đã đổi. Đã tải lại lịch sử. Chỉ thử lại đúng lô này với mã yêu cầu cũ, hoặc bỏ giữ rồi bắt đầu lại.`);
            onReload(); return;
          }
          const why = abort.signal.aborted ? `${cut.current === 'OWNER' ? 'Khóa OWNER đã thay đổi nên đã ngắt' : 'Đã ngắt'} chờ phản hồi của ${label}.`
            : `${error instanceof ResearchAutomationError ? error.message : 'Chưa nhận được phản hồi.'} Chưa rõ kết quả của ${label}.`;
          hold(at, body, `${why} Không biết máy chủ đã gọi model hay chưa; trang này không hoàn tác được gì trên máy chủ. Chỉ thử lại đúng lô này với mã yêu cầu cũ; máy chủ sẽ trả lại kết quả đã lưu nếu có.`);
          return;
        }
        if (!mounted.current) return;
        if (response.status === 'NOT_DISPATCHED') { finish(`${notDispatched[response.reason]} Chưa gọi model cho ${label} và các lô sau.`, true); return; }
        if (response.status === 'PREPARED') { hold(at, body, `Máy chủ đã nhận ${label} nhưng chưa gửi model. Thử lại đúng lô này với mã yêu cầu cũ để tiếp tục; không tạo yêu cầu mới.`); return; }
        if (response.status === 'INVALID' || response.status === 'DISPATCH_UNKNOWN') {
          const what = response.status === 'INVALID' ? `Model đã trả lời ${label} nhưng ${invalidCodes[response.code]}` : `Máy chủ đã ghi nhận ${label} là không rõ kết quả: ${unknownCodes[response.code]}`;
          setUncertain(`${Label} đã được ghi nhận là ${response.status === 'INVALID' ? 'phản hồi không hợp lệ' : 'không rõ kết quả'}; gửi lại bằng mã mới sẽ gọi model thêm lần nữa và có thể tính phí lại.`);
          finish(`${what}. Lô này có thể đã tính phí và không tạo đề xuất. Thử lại cùng mã chỉ nhận lại đúng kết quả này, nên không giữ để thử lại. Chưa gửi các lô sau.`, true); return;
        }
        const proposalId = response.proposal.evidenceId;
        let fresh: View;
        try { fresh = await loadInsightCoding(run.workspaceId, run.runId, pairId, abort.signal); }
        catch {
          if (!mounted.current) return;
          hold(at, body, `Máy chủ báo đã lưu đề xuất cho ${label} nhưng chưa đọc lại được để xác minh. Thử lại đúng lô này với mã yêu cầu cũ; máy chủ trả lại đề xuất đã lưu thay vì tạo bản mới.`); return;
        }
        if (!mounted.current) return;
        if (!proposalMatches(fresh, body, proposalId)) {
          hold(at, body, `Đề xuất đọc lại cho ${label} không khớp yêu cầu đã gửi. Chưa xác minh lô này và chưa gửi các lô sau. Yêu cầu cũ vẫn được giữ để thử lại chính xác; nếu tiếp tục không khớp, báo người vận hành kiểm tra.`);
          return;
        }
        finished.add(at); predecessor = proposalId;
        setProgress({ plan, done: new Set(finished) });
        onVerified(fresh, proposalId);
        const problem = chainProblem(fresh, plan.binding, plan.adoptionId, proposalId);
        const left = plan.batches.length - finished.size;
        if (problem && left) { finish(`Đã xác minh ${label}. ${problem} Dừng trước lô kế tiếp để không ghi đè thao tác khác; ${left} lô chưa gửi.`, true); return; }
        if (retry && left) { finish(`Đã xác minh ${label} bằng đúng yêu cầu cũ. ${left} lô còn lại chưa gửi; bấm gửi tiếp nếu muốn tiếp tục.`, false); return; }
      }
      finish('Đã xác minh mọi lô. Các mục vẫn chờ bạn duyệt trong đề xuất mới nhất; bản ghi model bỏ trống không có mục nào.', false);
    } finally {
      inFlight.current = false; active.current = null; runToken.current = null;
      if (mounted.current) { setRunning(false); setSending(null); setStopping(false); }
    }
  };

  const confirmStart = () => {
    if (!start) return;
    const problem = block ?? startBlock ?? chainProblem(view, start.plan.binding, start.plan.adoptionId, start.predecessorId);
    setStart(null);
    if (problem) { setOutcome({ text: `${problem} Chưa gửi lô nào; mở lại xác nhận để xem trạng thái mới.`, problem: true }); return; }
    void sequence(start.plan, start.from, start.predecessorId, start.done, null);
  };

  const doneRecords = progress ? progress.plan.batches.filter((_, at) => progress.done.has(at)).reduce((sum, batch) => sum + batch.length, 0) : 0;
  const left = start ? start.plan.batches.filter((_, at) => at >= start.from && !start.done.has(at)) : [];
  const leftRecords = left.reduce((sum, batch) => sum + batch.length, 0);

  return <div className="ic-model">
    <h5>Đề xuất AI cho toàn bộ bản ghi</h5>
    <p className="ra-muted">{corpus.eligible.length} bản ghi được đưa vào và có văn bản sẽ được gửi theo {modelBatches(corpus.eligible).length} lô, mỗi lô tối đa 100 bản ghi, lần lượt theo thứ tự nguồn.
      Không gửi {corpus.excluded} bản ghi bị loại và {corpus.unreadable} bản ghi không đọc được{corpus.withoutText ? `; ${corpus.withoutText} bản ghi được đưa vào nhưng không có văn bản cũng không gửi` : ''}.
      Kết quả là đề xuất mới để duyệt bên dưới; không mục nào tự được duyệt.</p>
    <div className="ra-actions">
      {!running && !resumable && !held && <button type="button" className="button" disabled={Boolean(gate) || busy} onClick={openFresh}>Tạo đề xuất AI cho toàn bộ bản ghi</button>}
      {!running && resumable && progress && <button type="button" className="button" disabled={Boolean(gate) || busy} onClick={() => open(progress.plan, remaining, progress.done)}>Gửi tiếp các lô còn lại</button>}
      {!running && held && <>
        <button type="button" className="button primary" disabled={Boolean(block) || !ownerToken || start !== null || abandon} onClick={() => void sequence(held.plan, held.at, held.body.previousProposalId, progress?.done ?? new Set<number>(), held.body)}>Thử lại đúng lô {held.at + 1}</button>
        <button type="button" className="button" disabled={start !== null || abandon} onClick={() => { dialogOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; setAbandon(true); }}>Bỏ giữ yêu cầu lô {held.at + 1}</button>
      </>}
      {running && <>
        <button ref={stopButton} type="button" className="button" disabled={stopping} onClick={() => { stop.current = true; cut.current = 'USER'; setStopping(true); }}>Dừng sau lô đang gửi</button>
        <button type="button" className="button" onClick={() => { stop.current = true; cut.current = 'USER'; active.current?.abort(); }}>Ngắt lô đang gửi</button>
      </>}
    </div>
    {!running && !held && gate && <p className="ra-muted">{gate}</p>}
    {running && sending !== null && progress && <p role="status">Đang gửi và xác minh lô {sending + 1}/{progress.plan.batches.length}{stopping ? '; sẽ dừng sau lô này' : ''}…</p>}
    {progress && <p className="ra-muted">Đã xác minh {progress.done.size}/{progress.plan.batches.length} lô · {doneRecords}/{progress.plan.corpus.eligible.length} bản ghi thuộc lô đã xác minh. Đây là bản ghi đã gửi và đọc lại được đề xuất, chưa phải đã duyệt.</p>}
    <div ref={result} tabIndex={-1}>{outcome && <p role={outcome.problem ? 'alert' : 'status'} className={outcome.problem ? 'ra-problem' : undefined}>{outcome.text}</p>}</div>

    {start && <ConfirmDialog titleId="ic-model-title" confirmLabel="Gọi model và lưu đề xuất" onCancel={() => setStart(null)} onConfirm={confirmStart}
      title={start.done.size || start.from ? `Gửi tiếp ${leftRecords} bản ghi trong ${left.length} lô còn lại?` : `Gọi model cho ${leftRecords} bản ghi trong ${left.length} lô?`}>
      <div className="ic-dialog-body">
        <p>Máy chủ gọi model đã cấu hình cho từng lô, lần lượt. Mỗi lô có thể phát sinh chi phí; hệ thống chưa có ước tính chi phí.</p>
        <dl className="ic-facts">
          <div><dt>Quy tắc</dt><dd>{ruleLabel}, phiên bản báo cáo {versionNumber}</dd></div>
          <div><dt>Nối tiếp</dt><dd>{start.predecessorLabel}</dd></div>
          <div><dt>Lô gửi</dt><dd>{batchSummary(left)} · {range(left.flat())}{start.done.size ? ` · bỏ qua ${start.done.size} lô đã xác minh` : ''}</dd></div>
          <div><dt>Không gửi</dt><dd>{start.plan.corpus.excluded} bị loại · {start.plan.corpus.unreadable} không đọc được{start.plan.corpus.withoutText ? ` · ${start.plan.corpus.withoutText} không có văn bản` : ''}</dd></div>
        </dl>
        <p>Mỗi lô lưu thành một đề xuất mới nối tiếp lô trước. Chưa duyệt mục nào và không tạo báo cáo; bản ghi model bỏ trống vẫn chờ. Dừng ngay ở lô đầu tiên có kết quả chưa rõ, xung đột hoặc không hợp lệ; không tự gửi lại.</p>
        {start.declared > 0 && <p className="ic-hold">Đề xuất đang nối tiếp có {start.declared} dòng do người khai báo trên các bản ghi sẽ gửi. Đề xuất mới thay các dòng đó bằng kết quả model; đề xuất cũ vẫn giữ trong lịch sử.</p>}
        {start.receipts > 0 && <p className="ic-hold">Đề xuất đang nối tiếp có {start.receipts} biên nhận duyệt. Biên nhận vẫn gắn với đề xuất cũ; mục trong đề xuất mới cần duyệt lại.</p>}
        {uncertain && <p className="ic-hold">{uncertain}</p>}
      </div>
    </ConfirmDialog>}
    {abandon && held && <ConfirmDialog titleId="ic-model-abandon-title" title={`Bỏ giữ yêu cầu lô ${held.at + 1}?`} confirmLabel="Bỏ giữ yêu cầu" onCancel={() => setAbandon(false)}
      onConfirm={() => { setUncertain(`Lô ${held.at + 1} trước đó chưa rõ kết quả; gửi lại bằng mã mới có thể gọi model thêm lần nữa và tính phí lại.`);
        setHeld(null); setAbandon(false); setOutcome(null); onReload(); }}>
      <p>Chỉ quên mã yêu cầu đang giữ trên trang này. Không hoàn tác gì trên máy chủ: lô này có thể vẫn đã gọi model và lưu đề xuất. Lịch sử được tải lại để bạn kiểm tra trước khi gửi tiếp.</p>
    </ConfirmDialog>}
  </div>;
}
