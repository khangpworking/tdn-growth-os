import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { canonical } from './insight-coding-ui';
import { loadPersonas, loadPersonaEvidence, proposePersona, createPersonaReport,
  type PersonaModelRequest, type ResearchPersonaView, type AutomationInsightPersonaReportRevisionRequest } from './persona-api';
type Props = { run: ResearchAutomationRun; pairId: string; versionNumber: number; ownerToken: string | null; disabled: boolean;
  disabledReason: string | null; reportBlock: string | null; onActivityChanged(): void; onBusyChanged(value: boolean): void };
type Operation = { kind: 'MODEL'; body: PersonaModelRequest } | { kind: 'REPORT'; body: AutomationInsightPersonaReportRevisionRequest };
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
const stageLabel = { TAXONOMY: 'Bộ mã', CLASSIFY: 'Phân loại', SYNTHESIZE: 'Thẻ và chân dung' };
const indexes = (values: readonly number[]): [number, ...number[]] => {
  if (!values.length) throw new Error('Chưa có bản ghi đủ điều kiện cho lô này.');
  return [values[0]!, ...values.slice(1)];
};

/** Exact pair keyed by the owning versions panel. Each stage and report action
 * needs its own confirmation; opening/reloading never dispatches a model. */
export default function InsightPersonaPanel({ run, pairId, versionNumber, ownerToken, disabled, disabledReason, reportBlock, onActivityChanged, onBusyChanged }: Props) {
  const [view, setView] = useState<ResearchPersonaView | null>(null), [loading, setLoading] = useState(true), [failure, setFailure] = useState('');
  const [selected, setSelected] = useState(''), [tick, setTick] = useState(0), [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState<Operation | null>(null), [held, setHeld] = useState<Operation | null>(null), [pending, setPending] = useState(false);
  const ownerAtDispatch = useRef<string | null>(null);
  const mounted = useRef(false), active = useRef<AbortController | null>(null), inFlight = useRef(false), operation = useRef<Operation | null>(null);
  const live = useRef({ ownerToken, disabled, reportBlock }); live.current = { ownerToken, disabled, reportBlock };
  const busy = pending || dialog !== null || held !== null;
  useEffect(() => { onBusyChanged(busy); }, [busy, onBusyChanged]);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); onBusyChanged(false); }; }, [onBusyChanged]);
  useEffect(() => { if (!ownerToken || disabled || (active.current && ownerAtDispatch.current !== ownerToken)) active.current?.abort(); }, [ownerToken, disabled]);
  useEffect(() => {
    const abort = new AbortController(); let alive = true; setLoading(true); setFailure('');
    void loadPersonas(run.workspaceId, run.runId, pairId, abort.signal).then(fresh => {
      if (alive) { setView(fresh); setLoading(false); }
    }).catch(error => { if (alive && !abort.signal.aborted) { setLoading(false); setFailure(error instanceof Error ? error.message : 'Chưa đọc được nguồn chân dung.'); } });
    return () => { alive = false; abort.abort(); };
  }, [run.workspaceId, run.runId, pairId, tick]);
  const proposals = view?.evidence.filter(item => item.evidence.contractVersion === 'insight-persona-proposal-evidence-v1') ?? [];
  const item = proposals.find(entry => entry.evidence.evidenceId === selected);
  const chosen = item?.evidence.contractVersion === 'insight-persona-proposal-evidence-v1' ? item.evidence : null;
  const latest = chosen ? !proposals.some(entry => entry.evidence.contractVersion === 'insight-persona-proposal-evidence-v1' &&
    entry.evidence.rootId === chosen.rootId && entry.evidence.sequence > chosen.sequence) : false;
  const gate = disabled ? disabledReason ?? 'Hoàn tất thao tác khác hoặc chọn phiên bản cuối trước.'
    : !ownerToken ? 'Mở khóa OWNER để gọi model hoặc tạo báo cáo.' : loading ? 'Đang xác minh nguồn và lịch sử.' : failure || !view ? failure || 'Chưa có nguồn chân dung được hỗ trợ.' : null;
  const openStage = (stage: PersonaModelRequest['stage']) => {
    if (gate || busy || !view || !view.source.eligibleRecordIndexes.length) return;
    let body: PersonaModelRequest;
    if (stage === 'TAXONOMY') body = { contractVersion: 'insight-persona-model-request-v1', requestKey: crypto.randomUUID(), binding: structuredClone(view.binding),
      rootId: null, rootSha256: null, previousProposalId: null, previousProposalSha256: null, stage, recordIndexes: indexes(view.source.taxonomySample.recordIndexes) };
    else {
      if (!chosen || !item || !latest) return;
      const common = { contractVersion: 'insight-persona-model-request-v1' as const, requestKey: crypto.randomUUID(), binding: structuredClone(view.binding),
        rootId: chosen.rootId, rootSha256: chosen.rootSha256, previousProposalId: chosen.evidenceId, previousProposalSha256: item.sha256 };
      if (stage === 'CLASSIFY') {
        const seen = new Set(chosen.snapshot.classifications.map(row => row.recordIndex));
        body = { ...common, stage, recordIndexes: indexes(view.source.eligibleRecordIndexes.filter(index => !seen.has(index)).slice(0, 100)) };
      } else body = { ...common, stage, recordIndexes: [] };
    }
    setNotice(''); setDialog({ kind: 'MODEL', body });
  };
  const openReport = () => {
    if (gate || reportBlock || busy || !view || !item || !chosen || chosen.request.stage !== 'SYNTHESIZE') return;
    setNotice(''); setDialog({ kind: 'REPORT', body: { contractVersion: 'automation-insight-persona-report-revision-v1', requestKey: crypto.randomUUID(),
      previousPairId: pairId, sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, personaInsight: {
        contractVersion: 'insight-persona-report-select-v1', proposalId: chosen.evidenceId, proposalSha256: item.sha256, binding: structuredClone(view.binding) } } });
  };
  const submit = async (op: Operation) => {
    if (inFlight.current || !live.current.ownerToken || live.current.disabled || (op.kind === 'REPORT' && live.current.reportBlock)) return;
    inFlight.current = true; operation.current = op; setPending(true); setDialog(null); setHeld(null); setNotice('');
    const abort = new AbortController(); active.current = abort; ownerAtDispatch.current = live.current.ownerToken;
    try {
      if (op.kind === 'REPORT') {
        await createPersonaReport(run.workspaceId, run.runId, op.body, live.current.ownerToken, abort.signal);
        if (!mounted.current) return;
        if (abort.signal.aborted) { setHeld(op); setNotice('Đã ngắt thao tác cục bộ; kết quả máy chủ chưa rõ. Giữ đúng yêu cầu để đọc lại.'); return; }
        setNotice('Đã nhận yêu cầu báo cáo từ đúng đề xuất đã chọn. Theo dõi phiên bản đã lưu; chưa có duyệt hay phát hành.'); onActivityChanged();
      } else {
        const result = await proposePersona(run.workspaceId, run.runId, op.body, live.current.ownerToken, abort.signal);
        if (!mounted.current) return;
        if (abort.signal.aborted) { setHeld(op); setNotice('Đã ngắt thao tác cục bộ; kết quả máy chủ chưa rõ. Giữ đúng yêu cầu để đọc lại.'); return; }
        if (result.status !== 'PROPOSED') {
          setHeld(op);
          setNotice(result.status === 'NOT_DISPATCHED' ? 'Chưa gọi model. Kiểm tra cấu hình và bằng chứng; thử lại chỉ dùng đúng yêu cầu cũ.'
            : result.status === 'PREPARED' ? 'Yêu cầu đã chuẩn bị; giữ nguyên nội dung để đọc lại hoặc thử lại.'
            : 'Kết quả đã lưu không tạo đề xuất hợp lệ. Đọc lại bằng đúng yêu cầu cũ; không tự gọi model khác.'); return;
        }
        const exact = await loadPersonaEvidence(run.workspaceId, run.runId, result.proposal.evidence.evidenceId, op.body.binding, abort.signal);
        if (exact.sha256 !== result.proposal.sha256 || !same(exact.evidence, result.proposal.evidence)) throw new ResearchAutomationError('integrity', 'Đề xuất đọc lại không khớp phản hồi đã lưu.');
        const fresh = await loadPersonas(run.workspaceId, run.runId, pairId, abort.signal);
        if (!fresh.evidence.some(entry => entry.sha256 === exact.sha256 && same(entry.evidence, exact.evidence))) throw new ResearchAutomationError('integrity', 'Đề xuất chưa có trong lịch sử đã xác minh.');
        if (!mounted.current) return;
        if (abort.signal.aborted) { setHeld(op); setNotice('Đã ngắt thao tác cục bộ; kết quả máy chủ chưa rõ. Giữ đúng yêu cầu để đọc lại.'); return; }
        setView(fresh); setSelected(exact.evidence.evidenceId); setNotice('Đã đọc lại đúng đề xuất và lời nguồn. Chọn bước kế tiếp rồi xác nhận riêng; chưa duyệt chân dung.');
      }
      setHeld(null); operation.current = null;
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ResearchAutomationError && ['rejected', 'authorization', 'conflict', 'notFound'].includes(error.kind)) {
        setHeld(null); operation.current = null; setNotice(error.message); setTick(value => value + 1);
      } else { setHeld(op); setNotice('Chưa xác minh được kết quả. Giữ nguyên nội dung và mã yêu cầu cũ; không tự gửi bước mới.'); }
    } finally { inFlight.current = false; active.current = null; if (mounted.current) setPending(false); }
  };
  return <section className="ra-block" aria-labelledby="persona-title"><h4 id="persona-title">Thẻ bằng chứng và chân dung đề xuất · phiên bản {versionNumber}</h4>
    <p>Chỉ dùng lời khách trên Shopee của nguồn đã lưu. Ngày từ nguồn chưa xác lập kỳ đo lường; chưa có thống kê độ tin cậy hoặc điều kiện đưa vào kết luận chính. Nội dung nguyên văn vẫn có thể chứa thông tin cá nhân.</p>
    {loading && <p role="status">Đang đọc nguồn và đề xuất đã lưu…</p>}{failure && <p role="alert">{failure}</p>}
    <button type="button" className="button" disabled={pending} onClick={() => setTick(value => value + 1)}>Đọc lại lịch sử chân dung</button>
    {gate && <p>{gate}</p>}
    <button type="button" className="button" disabled={Boolean(gate) || busy || !view?.source.eligibleRecordIndexes.length} onClick={() => openStage('TAXONOMY')}>Đề xuất bộ mã từ nguồn đã chọn</button>
    <label className="ra-label">Đề xuất chân dung đã lưu<select aria-label="Đề xuất chân dung đã lưu" value={selected} disabled={busy || loading || Boolean(failure)} onChange={event => setSelected(event.target.value)}><option value="">Chọn chính xác đề xuất</option>{proposals.map(entry => entry.evidence.contractVersion === 'insight-persona-proposal-evidence-v1' && <option key={entry.evidence.evidenceId} value={entry.evidence.evidenceId}>{stageLabel[entry.evidence.request.stage]} · lượt {entry.evidence.sequence} · đề xuất, chờ chủ duyệt</option>)}</select></label>
    {chosen && <><button type="button" className="button" disabled={Boolean(gate) || busy || !latest || chosen.snapshot.classificationComplete} onClick={() => openStage('CLASSIFY')}>Phân loại lô kế tiếp theo bộ mã đã chọn</button>
      <button type="button" className="button" disabled={Boolean(gate) || busy || !latest || !chosen.snapshot.classificationComplete || chosen.request.stage === 'SYNTHESIZE'} onClick={() => openStage('SYNTHESIZE')}>Đề xuất thẻ và chân dung từ phân loại đã chọn</button>
      <p>Mọi nội dung dưới đây là đề xuất, chờ chủ duyệt. {chosen.snapshot.insufficiency}</p>
      {chosen.snapshot.personas.map(persona => <article key={persona.personaId}><p>{persona.label} · Shopee: {persona.sampleSizeLabel}{persona.identityLimitation ? `; ${persona.identityLimitation}` : ''}.</p>{persona.attributes.map((attribute, index) => <div key={index}><p><q>{attribute.value}</q> — đề xuất, chờ chủ duyệt</p>{attribute.quotes.map((quote, at) => <details key={at}><summary>Vị trí lời nguồn cho thuộc tính</summary><p>{quote.locator.textPointer}</p><blockquote style={{ whiteSpace: 'pre-wrap' }}>{quote.span.quote}</blockquote><blockquote style={{ whiteSpace: 'pre-wrap' }}>{view?.source.records[quote.recordIndex]?.text}</blockquote></details>)}</div>)}</article>)}
      {chosen.snapshot.cards.map(card => <details key={card.cardId}><summary>Thẻ hoàn cảnh · đề xuất, chờ chủ duyệt</summary><p><q>{card.situation.value}</q></p>{card.identityLimitation && <p>{card.identityLimitation}</p>}{card.quotes.map((quote, index) => <div key={index}><blockquote style={{ whiteSpace: 'pre-wrap' }}>{quote.selectedSpan.quote}</blockquote><p>Toàn văn nguồn:</p><blockquote style={{ whiteSpace: 'pre-wrap' }}>{quote.text}</blockquote><p>Vị trí lời nguồn: {quote.locator.textPointer}</p><p>Ngày nguồn: {quote.sourceDate.literal ?? 'chưa rõ'}; kỳ đo lường chưa rõ.</p></div>)}</details>)}
      {chosen.request.stage === 'SYNTHESIZE' && <button type="button" className="button" disabled={Boolean(gate || reportBlock) || busy} onClick={openReport}>Tạo báo cáo nháp từ đề xuất chân dung đã chọn</button>}
    </>}
    {reportBlock && <p>{reportBlock}</p>}{pending && <p role="status">Đang gửi đúng yêu cầu đã xác nhận…</p>}
    {held && <><button type="button" className="button" disabled={Boolean(gate) || pending || (held.kind === 'REPORT' && Boolean(reportBlock))} onClick={() => void submit(held)}>Đọc lại hoặc thử lại đúng yêu cầu chân dung</button><button type="button" className="button" disabled={pending} onClick={() => { operation.current = null; setHeld(null); setNotice('Đã bỏ thao tác cục bộ. Bằng chứng và yêu cầu đã lưu trên máy chủ giữ nguyên; không gửi yêu cầu khác.'); }}>Bỏ thao tác cục bộ đang chờ</button></>}
    {notice && <p role="status">{notice}</p>}
    {dialog && <ConfirmDialog titleId="persona-confirm-title" title={dialog.kind === 'MODEL' ? 'Gọi model cho đúng bước đã chọn?' : 'Tạo bản nháp từ đúng đề xuất đã chọn?'} confirmLabel={dialog.kind === 'MODEL' ? 'Gọi model và lưu bước đề xuất' : 'Tạo bản nháp chân dung'} pending={pending} onCancel={() => setDialog(null)} onConfirm={() => void submit(dialog)}><p>{dialog.kind === 'MODEL' ? 'Gửi lời nguồn đã lưu qua model được cấu hình. Bước này có thể phát sinh chi phí; chưa có ước tính. Chỉ gọi đúng bước và lô đã chọn, không tự gửi bước sau. Không duyệt chân dung hoặc tạo báo cáo tự động.' : 'Giữ đúng nguồn và đề xuất cuối đã chọn. Bản nháp giữ nhãn đề xuất, chờ chủ duyệt cùng số bản ghi trong mẫu; không gọi model hoặc thu lại nguồn, không duyệt hay phát hành.'}</p></ConfirmDialog>}
  </section>;
}
