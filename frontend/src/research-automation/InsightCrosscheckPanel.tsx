import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import InsightCrosscheckConfirmation from './InsightCrosscheckConfirmation';
import { loadCrosscheckAvailability, loadRetainedCrosscheck, prepareCrosscheck, readCrosscheck, type InsightCrosscheckRequest, type ResearchInsightCrosscheckResponse, type ResearchInsightCrosscheckAvailability } from './insight-crosscheck-api';
import { canonical, type View } from './insight-coding-ui';
import { createReportRevision } from './report-revisions-api';
import type { AutomationInsightCrosscheckReportRevisionRequest } from '../../../contracts/analysis/automation-insight-report-revision.generated';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';

type Props = { run: ResearchAutomationRun; view: View; ownerToken: string | null; block: string | null; reportBlock: string | null;
  inFlight: MutableRefObject<boolean>; onBusyChanged: (busy: boolean) => void; onActivityChanged: () => void };
type Valid = Extract<ResearchInsightCrosscheckResponse, { status: 'VALID' }>;
export default function InsightCrosscheckPanel({ run, view, ownerToken, block, reportBlock, inFlight, onBusyChanged, onActivityChanged }: Props) {
  const [availability, setAvailability] = useState<ResearchInsightCrosscheckAvailability | null>(null);
  const [proposalId, setProposalId] = useState('');
  const [readKey, setReadKey] = useState('');
  const [confirm, setConfirm] = useState<InsightCrosscheckRequest | null>(null);
  const [held, setHeld] = useState<InsightCrosscheckRequest | null>(null);
  const [valid, setValid] = useState<Valid | null>(null);
  const [report, setReport] = useState<AutomationInsightCrosscheckReportRevisionRequest | null>(null);
  const [reportHeld, setReportHeld] = useState<AutomationInsightCrosscheckReportRevisionRequest | null>(null);
  const [running, setRunning] = useState(false), [notice, setNotice] = useState('');
  const mounted = useRef(false), active = useRef<AbortController | null>(null), liveToken = useRef(ownerToken), tokenAtDispatch = useRef<string | null>(null);
  liveToken.current = ownerToken;
  const busy = running || Boolean(confirm || held || report || reportHeld);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; active.current?.abort(); }; }, []);
  useEffect(() => { if (tokenAtDispatch.current && ownerToken !== tokenAtDispatch.current) active.current?.abort(); }, [ownerToken]);
  useEffect(() => { onBusyChanged(busy); return () => onBusyChanged(false); }, [busy, onBusyChanged]);
  const binding = canonical(view.context.binding);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    void loadCrosscheckAvailability(run.workspaceId, run.runId, view.context.binding.pairId, abort.signal).then(result => {
      if (alive && canonical(result.binding) === binding) setAvailability(result);
    }).catch(() => { if (alive) { setAvailability(null); setNotice('Chưa đọc được cấu hình độc lập cho lượt thứ hai.'); } });
    return () => { alive = false; abort.abort(); };
  }, [binding, run.workspaceId, run.runId, view.context.binding.pairId]);
  const proposals = view.evidence.filter(item => item.request.contractVersion === 'insight-coding-default-propose-v1');
  const proposal = proposals.find(item => item.evidenceId === proposalId);
  const selectedRuleId = proposal?.request.contractVersion === 'insight-coding-default-propose-v1' ? proposal.request.defaultRuleId : null;
  const latest = proposal && proposal.request.contractVersion === 'insight-coding-default-propose-v1' && !proposals.some(item => item.request.contractVersion === 'insight-coding-default-propose-v1' && item.request.defaultRuleId === selectedRuleId && item.sequence > proposal.sequence);
  const gate = block ?? (!ownerToken ? 'Cần khóa OWNER để gửi lượt thứ hai.' : !proposal ? 'Chọn đúng đề xuất mặc định đã lưu.' : !latest ? 'Đề xuất này đã có bản mới hơn; chỉ đọc bằng chứng cũ.' : !availability?.secondConfiguration ? 'Máy chủ chưa cấu hình model độc lập cho lượt thứ hai.' : null);
  // A verified retained selection needs no current second-model configuration or latest-proposal choice.
  const reportGate = block ?? (!ownerToken ? 'Cần khóa OWNER để tạo báo cáo nháp.' : null);
  const open = () => {
    const sourceBinding = view.context.binding;
    if (sourceBinding.sourceKind === 'PRIVATE_SHOPEE') return;
    if (gate || busy || inFlight.current || !proposal || proposal.request.contractVersion !== 'insight-coding-default-propose-v1' || !availability?.secondConfigurationSha256) return;
    const seed = [...crypto.getRandomValues(new Uint8Array(32))].map(byte => byte.toString(16).padStart(2, '0')).join('');
    setConfirm({ contractVersion: 'insight-crosscheck-request-v1', requestKey: crypto.randomUUID(), binding: structuredClone(sourceBinding),
      firstProposalId: proposal.evidenceId, firstProposalSha256: proposal.sha256, codebookSha256: proposal.request.codebookSha256, seed,
      secondConfigurationSha256: availability.secondConfigurationSha256 });
  };
  const execute = async (body: InsightCrosscheckRequest) => {
    const token = liveToken.current; if (!token || inFlight.current) return;
    inFlight.current = true; tokenAtDispatch.current = token; setRunning(true); setConfirm(null); setHeld(null); setNotice('');
    const abort = new AbortController(); active.current = abort;
    try {
      const response = await prepareCrosscheck(run.workspaceId, run.runId, body, token, abort.signal);
      if (!mounted.current) return;
      if (response.status === 'VALID') {
        const read = await readCrosscheck(run.workspaceId, run.runId, body, abort.signal);
        if (!mounted.current) return;
        if (read.status !== 'VALID' || read.snapshotSha256 !== response.snapshotSha256) throw new ResearchAutomationError('integrity', 'Bản đọc không khớp kết quả đã gửi.');
        setValid(read); setReadKey(body.requestKey); setNotice('Đã xác minh hai kết quả đã lưu. Đây là đề xuất AI chờ xem xét; thống kê U11 và phát hành chưa có.');
      } else if (response.status === 'PREPARED' || response.status === 'DISPATCHING' || response.status === 'INCOMPLETE') {
        setHeld(body); setNotice('Lượt thứ hai chưa kết thúc. Chỉ thử lại đúng yêu cầu và mẫu đã giữ; không tự gửi yêu cầu mới.');
      } else setNotice(response.status === 'INVALID' ? 'Phản hồi lượt thứ hai không hợp lệ; thực thi đã lưu, chưa có kết quả để lập phụ lục. Thử lại cùng mã chỉ đọc kết quả này.' : response.status === 'DISPATCH_UNKNOWN' ? 'Chưa rõ kết quả lượt thứ hai. Thực thi đã lưu; không tự gọi lại bằng mã mới.' : 'Chưa gọi model cho lượt thứ hai.');
    } catch (error) {
      if (!mounted.current) return;
      if (error instanceof ResearchAutomationError && ['authorization','rejected','notFound','conflict'].includes(error.kind)) setNotice(error.message);
      else { setHeld(body); setNotice('Chưa xác minh được kết quả. Thử lại giữ đúng mã, nội dung và mẫu cũ; không tạo lượt mới.'); }
    } finally { inFlight.current = false; tokenAtDispatch.current = null; active.current = null; if (mounted.current) setRunning(false); }
  };
  const reportAction = async (body: AutomationInsightCrosscheckReportRevisionRequest) => {
    if (!ownerToken || inFlight.current) return;
    inFlight.current = true; setRunning(true); setReport(null); setReportHeld(null);
    try { await createReportRevision(run.workspaceId, run.runId, body, ownerToken); if (mounted.current) { setNotice('Đã nhận yêu cầu tạo phiên bản với đúng phụ lục đã chọn. Theo dõi lịch sử phiên bản.'); onActivityChanged(); } }
    catch (error) { if (mounted.current) { if (error instanceof ResearchAutomationError && ['authorization','rejected','conflict','notFound'].includes(error.kind)) setNotice(error.message);
      else { setReportHeld(body); setNotice('Chưa xác minh được phiên bản. Chỉ thử lại đúng yêu cầu báo cáo đã giữ.'); } } }
    finally { inFlight.current = false; if (mounted.current) setRunning(false); }
  };
  const openReport = () => { if (!valid || reportGate || reportBlock || busy) return;
    const request = valid.snapshot.request;
    setReport({ contractVersion: 'automation-insight-crosscheck-report-revision-v1', requestKey: crypto.randomUUID(), previousPairId: request.binding.pairId,
      sources: { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } },
      defaultInsight: { contractVersion: 'insight-default-draft-select-v1', proposalId: request.firstProposalId, proposalSha256: request.firstProposalSha256 },
      crosscheckInsight: { contractVersion: 'insight-crosscheck-select-v1', requestKey: request.requestKey, snapshotSha256: valid.snapshotSha256,
        firstProposalId: request.firstProposalId, firstProposalSha256: request.firstProposalSha256 } }); };
  const readSaved = async () => {
    if (busy || !proposal || inFlight.current) return;
    const abort = new AbortController(); active.current = abort; inFlight.current = true; setRunning(true);
    try {
      const saved = await loadRetainedCrosscheck(run.workspaceId, run.runId, view.context.binding.pairId, readKey, abort.signal);
      if (!mounted.current) return;
      if (saved.status !== 'VALID') { setValid(null); setNotice('Yêu cầu đã lưu chưa có hai kết quả hợp lệ; thao tác đọc này chưa gọi model.'); return; }
      if (saved.snapshot.request.firstProposalId !== proposal.evidenceId || saved.snapshot.request.firstProposalSha256 !== proposal.sha256 ||
        canonical(saved.snapshot.request.binding) !== binding) throw new ResearchAutomationError('integrity', 'Bằng chứng đã lưu thuộc đề xuất hoặc nguồn khác.');
      setValid(saved); setNotice('Đã đọc đúng bằng chứng đã lưu; chưa gọi model hay tạo phiên bản mới.');
    } catch (error) { if (mounted.current) { setValid(null); setNotice(error instanceof ResearchAutomationError ? error.message : 'Chưa đọc được bằng chứng đã chọn.'); } }
    finally { active.current = null; inFlight.current = false; if (mounted.current) setRunning(false); }
  };
  const eligible = new Set(view.context.input.records.filter(row => row.disposition === 'INCLUDED' && row.text?.trim()).map(row => canonical([row.sourceSha256, row.locator]))).size;
  return <section className="ic-crosscheck"><h4>Chuẩn bị mẫu cho model thứ hai</h4><p>Giữ riêng hai lượt mã hóa và khác biệt nguyên dạng. Chưa có thống kê kiểm chéo U11 hay phát hành.</p>
    <label className="ra-label">Đề xuất mặc định cho lượt thứ hai<select aria-label="Đề xuất mặc định cho lượt thứ hai" className="ra-field" value={proposalId} disabled={busy || Boolean(block)} onChange={event => { setProposalId(event.target.value); setValid(null); setNotice(''); }}>
      <option value="">Chọn đề xuất đã lưu</option>{proposals.map(item => <option key={item.evidenceId} value={item.evidenceId}>Đề xuất {item.sequence} · {item.evidenceId}</option>)}</select></label>
    <p>{availability?.secondConfiguration ? `Model thứ hai: ${availability.secondConfiguration.providerId}/${availability.secondConfiguration.modelId}. Máy chủ xác minh cấu hình này khác toàn bộ lượt đầu trước khi gọi.` : 'Chưa có cấu hình độc lập cho model thứ hai.'}</p>
    <button type="button" className="button" disabled={busy || Boolean(gate)} onClick={open}>Xem lại mẫu cho model thứ hai</button>
    <label className="ra-label">Mã yêu cầu lượt thứ hai đã lưu<input className="ra-field" aria-label="Mã yêu cầu lượt thứ hai đã lưu" value={readKey} disabled={busy} onChange={event => setReadKey(event.target.value.trim())} /></label>
    <button type="button" className="button" disabled={busy || !proposal || !readKey} onClick={() => void readSaved()}>Đọc đúng bằng chứng lượt thứ hai đã lưu</button>
    {gate && <p className="ra-muted">{gate}</p>}
    {running && <button type="button" className="button" onClick={() => active.current?.abort()}>Ngắt chờ lượt thứ hai</button>}
    {held && <button type="button" className="button" disabled={running || !ownerToken || Boolean(block)} onClick={() => void execute(held)}>Thử lại đúng mẫu đã giữ</button>}
    {reportHeld && <button type="button" className="button" disabled={running || !ownerToken || Boolean(reportBlock)} onClick={() => void reportAction(reportHeld)}>Thử lại đúng báo cáo đã giữ</button>}
    {valid && <><p>Đã lưu {valid.snapshot.plan.sample.length} bản ghi nguồn trong mẫu. Đề xuất AI chờ xem xét; thống kê kiểm chéo và phát hành U11 chưa có.</p>
      <details><summary>Xem hai kết quả và vị trí nguồn đã lưu</summary>{valid.snapshot.literalRows.map(row => <details key={`${row.sourceSha256}:${row.locator}`}><summary>Bản ghi {row.recordIndex + 1}</summary>
        <p>Vị trí: {row.locator}</p><blockquote>{row.text}</blockquote><p>Lượt đầu — đề xuất AI chờ xem xét</p><pre>{JSON.stringify(row.first, null, 2)}</pre><p>Lượt thứ hai — đề xuất AI chờ xem xét</p><pre>{JSON.stringify(row.second, null, 2)}</pre>
        <p>Danh sách khác nguyên dạng: {row.literalDifferences.join(', ') || 'không có'}. Chưa đối chiếu thống kê hay phân xử nghĩa.</p></details>)}</details>
      <button type="button" className="button" disabled={busy || Boolean(reportGate || reportBlock)} onClick={openReport}>Tạo báo cáo nháp với phụ lục lượt thứ hai đã chọn</button></>}
    {notice && <p role="status">{notice}</p>}
    {confirm && <InsightCrosscheckConfirmation proposalLabel={`đề xuất ${proposal?.sequence}`} eligibleCount={eligible} firstExecutionIds={proposals.filter(item => item.request.contractVersion === 'insight-coding-default-propose-v1' && item.request.defaultRuleId === selectedRuleId && item.sequence <= (proposal?.sequence ?? 0)).map(item => item.request.contractVersion === 'insight-coding-default-propose-v1' ? item.request.executionId : '')} secondModel={`${availability!.secondConfiguration!.providerId}/${availability!.secondConfiguration!.modelId}`} onCancel={() => setConfirm(null)} onConfirm={() => void execute(confirm)} />}
    {report && <ConfirmDialog titleId="ic-crosscheck-report-title" title="Tạo báo cáo với phụ lục đã chọn?" confirmLabel="Tạo bản nháp có phụ lục" onCancel={() => setReport(null)} onConfirm={() => void reportAction(report)}><p>Dùng đúng đề xuất và hai kết quả đã lưu vừa xác minh. Không gọi model mới; chưa có thống kê kiểm chéo U11 hay phát hành.</p></ConfirmDialog>}
  </section>;
}
