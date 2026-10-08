import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { loadInsightCoding, proposeDefaultInsightCodingModel } from './insight-coding-api';
import { createReportRevision, type AutomationInsightReportRevisionRequest } from './report-revisions-api';
import type { InsightDefaultModelRequest } from '../../../contracts/analysis/automation-insight-model.generated';
import { defaultProposals, verifiedDefaultProposal } from './insight-default-ui';
import { modelCorpus, modelBatches } from './insight-model-batches';
import { proposalEntries, type View } from './insight-coding-ui';

type Props = { run: ResearchAutomationRun; pairId: string; view: View; ownerToken: string | null; block: string | null; reportBlock: string | null;
  inFlight: MutableRefObject<boolean>; onBusyChanged(value: boolean): void; onVerified(view: View): void; onActivityChanged(): void };
type Plan = { binding: View['context']['binding']; batches: number[][]; at: number; request: InsightDefaultModelRequest };
export default function InsightDefaultProposalPanel({ run, pairId, view, ownerToken, block, reportBlock, inFlight, onBusyChanged, onVerified, onActivityChanged }: Props) {
  const [running, setRunning] = useState(false), [held, setHeld] = useState<Plan | null>(null), [confirm, setConfirm] = useState(false);
  const [ready, setReady] = useState<Plan | null>(null);
  const [report, setReport] = useState<AutomationInsightReportRevisionRequest | null>(null), [reportRetry, setReportRetry] = useState<AutomationInsightReportRevisionRequest | null>(null);
  const [selected, setSelected] = useState(''), [notice, setNotice] = useState('');
  const active = useRef<AbortController | null>(null), mounted = useRef(true), stop = useRef(false), token = useRef<string | null>(null);
  const live = useRef({ ownerToken, block }); live.current = { ownerToken, block };
  const busy = running || held !== null || ready !== null || confirm || report !== null || reportRetry !== null;
  useEffect(() => { onBusyChanged(busy); }, [busy, onBusyChanged]);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop.current = true; active.current?.abort(); onBusyChanged(false); };
  }, [onBusyChanged]);
  useEffect(() => { if (token.current !== null && ownerToken !== token.current) { stop.current = true; active.current?.abort(); } }, [ownerToken]);
  const corpus = modelCorpus(view.context.input.records), batches = modelBatches(corpus.eligible), proposals = defaultProposals(view);
  const chosen = proposals.find(item => item.evidence.evidenceId === selected);
  const gate = block ?? (!ownerToken ? 'Mở khóa OWNER để tạo đề xuất.' : batches.length === 0 ? 'Chưa có bản ghi được đưa vào và có văn bản.' : null);
  const say = (text: string) => { if (mounted.current) setNotice(text); };
  const send = async (plan: Plan, retryOnly = false) => {
    if (inFlight.current || !live.current.ownerToken || live.current.block) return;
    const owner = live.current.ownerToken; token.current = owner; stop.current = false; inFlight.current = true;
    setRunning(true); setHeld(null); setReady(null); setConfirm(false); let body = plan.request;
    try {
      for (let at = plan.at; at < plan.batches.length; at++) {
        if (stop.current || live.current.ownerToken !== owner || live.current.block) { say('Đã dừng trước lô kế tiếp. Đề xuất đã lưu vẫn giữ nguyên.'); return; }
        const abort = new AbortController(); active.current = abort;
        // Retain the exact body before any transport or read-back may fail.
        const pending: Plan = { ...plan, at, request: body };
        let response;
        try { response = await proposeDefaultInsightCodingModel(run.workspaceId, run.runId, body, owner, abort.signal); }
        catch (error) {
          if (!mounted.current) return;
          if (error instanceof ResearchAutomationError && ['rejected', 'authorization', 'notFound'].includes(error.kind)) { say(error.message); return; }
          setHeld(pending); say('Chưa xác minh kết quả lô đang gửi. Giữ nguyên yêu cầu để thử lại; không tự gửi lô khác.'); return;
        }
        if (!mounted.current) return;
        if (response.status !== 'PROPOSED') {
          if (response.status === 'PREPARED') setHeld(pending);
          say(response.status === 'NOT_DISPATCHED' ? 'Chưa gọi model; kiểm tra cấu hình và bằng chứng.' : response.status === 'PREPARED' ? 'Đã chuẩn bị; thử lại đúng yêu cầu để tiếp tục.'
            : `Kết quả ${response.status}: ${response.code}. Không tạo đề xuất; thử lại cùng mã chỉ đọc kết quả đã lưu.`); return;
        }
        let fresh: View;
        try { fresh = await loadInsightCoding(run.workspaceId, run.runId, pairId, abort.signal); }
        catch { if (mounted.current) setHeld(pending); say('Đã nhận mã đề xuất nhưng chưa đọc lại được. Giữ yêu cầu cũ để thử lại.'); return; }
        const verified = verifiedDefaultProposal(fresh, body, response.proposal.evidenceId);
        if (!verified) { setHeld(pending); say('Đề xuất đọc lại không khớp nguồn, bộ quy tắc hoặc lô đã gửi. Chưa gửi lô sau.'); return; }
        onVerified(fresh); setSelected(verified.evidence.evidenceId);
        const newer = defaultProposals(fresh).some(item => item.request.defaultRuleId === verified.request.defaultRuleId && item.evidence.sequence > verified.evidence.sequence);
        if (newer) { say('Có đề xuất khác nối tiếp trong lúc đọc lại. Dừng trước lô sau; chọn chính xác đề xuất cần xem.'); return; }
        if (at + 1 < plan.batches.length) {
          body = { contractVersion: 'insight-default-model-request-v1', requestKey: crypto.randomUUID(), binding: plan.binding,
            defaultRuleId: verified.request.defaultRuleId, defaultRuleSha256: verified.request.defaultRuleSha256,
            previousProposalId: verified.evidence.evidenceId, previousProposalSha256: verified.evidence.sha256, recordIndexes: plan.batches[at + 1]! };
          if (retryOnly || stop.current) {
            setReady({ ...plan, at: at + 1, request: body });
            say(`Đã xác minh lô ${at + 1}/${plan.batches.length} bằng đúng yêu cầu cũ. Xác nhận lại trước khi gửi các lô còn lại.`); return;
          }
        }
        say(`Đã xác minh lô ${at + 1}/${plan.batches.length}; các mục là đề xuất, chờ chủ duyệt.`);
      }
    } finally { inFlight.current = false; active.current = null; token.current = null; if (mounted.current) setRunning(false); }
  };
  const start = () => send({ binding: view.context.binding, batches, at: 0, request: { contractVersion: 'insight-default-model-request-v1', requestKey: crypto.randomUUID(),
    binding: view.context.binding, defaultRuleId: null, defaultRuleSha256: null, previousProposalId: null, previousProposalSha256: null, recordIndexes: batches[0]! } });
  const build = async (body: AutomationInsightReportRevisionRequest) => {
    if (inFlight.current || !ownerToken || block || reportBlock) return;
    inFlight.current = true; setRunning(true); setReport(null); setReportRetry(null);
    try { await createReportRevision(run.workspaceId, run.runId, body, ownerToken); onActivityChanged(); say('Đã yêu cầu bản nháp từ đúng đề xuất đã chọn; chưa có duyệt hay phát hành.'); }
    catch (error) { if (error instanceof ResearchAutomationError && ['connection', 'unknown', 'conflict', 'integrity'].includes(error.kind)) setReportRetry(body); say(error instanceof Error ? error.message : 'Chưa xác minh yêu cầu tạo nháp.'); }
    finally { inFlight.current = false; if (mounted.current) setRunning(false); }
  };
  return <section className="ic-model"><h5>Mã hóa mặc định theo nguồn (đề xuất, chờ chủ duyệt)</h5>
    <p>Không cần duyệt quy tắc trước. Model đề xuất bộ mã và các mục bám nguồn đã lưu; chưa có mục nào được chấp nhận. Quy tắc do bạn soạn và biên nhận duyệt vẫn có thể dùng riêng bên dưới.</p>
    <p>Khi nguồn chưa khai báo cho phép nhiều mã, mỗi bản ghi trong từng tập I10/I13 chỉ nhận một mã khác nhau. Lô có nhiều mã xung đột không hợp lệ; giữ lời nguồn và kết quả không hợp lệ đã lưu, không tự bỏ mã. Đây là giới hạn bản nháp; kiểm chéo và phát hành U11 chưa khả dụng.</p>
    <p>{corpus.eligible.length} bản ghi có văn bản, gửi lần lượt theo {batches.length} lô. Không gửi {corpus.excluded} bản ghi bị loại, {corpus.unreadable} không đọc được và {corpus.withoutText} không có văn bản. Đọc lịch sử không gọi model.</p>
    <button type="button" className="button" disabled={Boolean(gate) || busy || inFlight.current} onClick={() => setConfirm(true)}>Tạo đề xuất AI mặc định</button>
    {gate && <p>{gate}</p>}
    {running && <button type="button" className="button" onClick={() => { stop.current = true; active.current?.abort(); }}>Ngắt lô đang gửi</button>}
    {held && <button type="button" className="button" disabled={Boolean(gate) || running} onClick={() => void send(held, true)}>Thử lại đúng yêu cầu mặc định</button>}
    {ready && <button type="button" className="button" disabled={Boolean(gate) || running} onClick={() => setConfirm(true)}>Gửi tiếp các lô mặc định còn lại</button>}
    <label className="ra-label">Đề xuất mặc định đã lưu<select value={selected} disabled={busy} onChange={event => setSelected(event.target.value)}>
      <option value="">Chọn chính xác đề xuất</option>{proposals.map(item => <option key={item.evidence.evidenceId} value={item.evidence.evidenceId}>Đề xuất {item.evidence.sequence} · {item.evidence.createdAt} · đề xuất, chờ chủ duyệt</option>)}
    </select></label>
    {chosen && <><details><summary>Xem đề xuất và lời nguồn</summary><p>Câu hỏi đề xuất: {chosen.request.rules.question}</p>
      {proposalEntries(chosen.request.annotations, chosen.request.rules, view.context.input.records).map(entry => <div key={entry.key}><p>{entry.title} — đề xuất, chờ chủ duyệt</p>{entry.lines.map((line, index) => <p key={index}>{line}</p>)}<blockquote>{view.context.input.records[entry.recordIndex]?.text}</blockquote></div>)}
    </details><button type="button" className="button" disabled={Boolean(block || reportBlock) || !ownerToken || busy} onClick={() => setReport({ contractVersion: 'automation-insight-default-report-revision-v1', requestKey: crypto.randomUUID(), previousPairId: pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } }, defaultInsight: { contractVersion: 'insight-default-draft-select-v1', proposalId: chosen.evidence.evidenceId, proposalSha256: chosen.evidence.sha256 } })}>Tạo báo cáo nháp từ đề xuất mặc định đã chọn</button></>}
    {reportRetry && <button type="button" disabled={running || Boolean(block || reportBlock)} onClick={() => void build(reportRetry)}>Thử lại đúng yêu cầu báo cáo nháp</button>}
    {notice && <p role="status">{notice}</p>}
    {confirm && <ConfirmDialog titleId="ic-default-title" title="Gọi model để đề xuất mã hóa mặc định?" confirmLabel="Gọi model và lưu đề xuất" onCancel={() => setConfirm(false)} onConfirm={() => void (ready ? send(ready) : start())}>
      <p>Gửi {(ready ? ready.batches.slice(ready.at) : batches).flat().length} bản ghi trong {ready ? ready.batches.length - ready.at : batches.length} lô bằng model đã cấu hình. Có thể phát sinh chi phí; chưa có ước tính. Mỗi lô giữ nguyên nguồn và nối tiếp đúng đề xuất đã đọc lại. Dừng nếu kết quả chưa rõ hoặc không hợp lệ. Không tạo báo cáo hay duyệt tự động.</p>
    </ConfirmDialog>}
    {report && <ConfirmDialog titleId="ic-default-report-title" title="Tạo bản nháp từ đúng đề xuất đã chọn?" confirmLabel="Tạo bản nháp" onCancel={() => setReport(null)} onConfirm={() => void build(report)}>
      <p>Các số đếm mang nhãn đề xuất, chờ chủ duyệt. Không dùng biên nhận chấp nhận; tỷ lệ, hoàn tất mã hóa và phát hành chưa khả dụng. Không gọi model hoặc thu thập lại nguồn.</p>
    </ConfirmDialog>}
  </section>;
}
