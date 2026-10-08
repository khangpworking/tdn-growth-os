import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { attachRunPdf, cancelRun, loadRun, loadRunPdfs, reportUrl, ResearchAutomationError } from './api';
import type { ResearchAutomationReportKind, ResearchAutomationRun, ResearchAutomationRunPdfStates } from './api';
import { coverageStateLabel, datasetLabel, formatDay, formatTime, limitationLabel, modeLabel, pdfUnavailableLabel, providerLabel, reportsLabel, runPhase, shouldPoll, statusLabel, stepStateLabel } from './run-status';
import type { RunPhase } from './run-status';
import ScopeConfirm from './ScopeConfirm';
import StepNav from './StepNav';
import ReaderReportPanel from './ReaderReportPanel';
import PageIndexPdfNotice from './PageIndexPdfNotice';

const POLL_MS = 4000;

export interface RunViewProps {
  readonly workspaceId: string;
  readonly runId: string;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly notify: (message: string) => void;
  readonly onStatusChange: (status: string) => void;
}

/** Server-driven steps 4–6. Polling is GET-only and aborts on unmount or route change. */
export default function RunView({ workspaceId, runId, ownerToken, writesAvailable, notify, onStatusChange }: RunViewProps) {
  const [run, setRun] = useState<ResearchAutomationRun | null>(null);
  const [loadError, setLoadError] = useState<{ readonly message: string; readonly notFound: boolean } | null>(null);
  const [notice, setNotice] = useState('');
  const [reloadTick, setReloadTick] = useState(0);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelPending, setCancelPending] = useState(false);
  const cancelOperation = useRef<{ readonly revision: number; readonly requestKey: string } | null>(null);
  const mounted = useRef(false);
  const lastStatus = useRef<string | null>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = useCallback(() => setReloadTick(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    let timer: number | undefined;
    let alive = true;
    const load = async () => {
      try {
        const value = await loadRun(workspaceId, runId, controller.signal);
        if (!alive || controller.signal.aborted) return;
        setRun(value); setLoadError(null);
        if (lastStatus.current !== value.status) { lastStatus.current = value.status; onStatusChange(value.status); }
        if (shouldPoll(value.status)) timer = window.setTimeout(() => void load(), POLL_MS);
      } catch (error) {
        if (!alive || controller.signal.aborted) return;
        setLoadError({ message: error instanceof ResearchAutomationError ? error.message : 'Chưa tải được trạng thái nghiên cứu.', notFound: error instanceof ResearchAutomationError && error.kind === 'notFound' });
      }
    };
    void load();
    return () => { alive = false; controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [workspaceId, runId, reloadTick, onStatusChange]);

  const conflict = useCallback(() => { setNotice('Phiên nghiên cứu đã thay đổi trên máy chủ. Đã tải lại trạng thái mới nhất; xem lại trước khi gửi.'); reload(); }, [reload]);
  const cancel = async () => {
    if (!run || !writesAvailable || !ownerToken || cancelPending || runPhase(run.status) === 'finished') return;
    if (cancelOperation.current?.revision !== run.revision) cancelOperation.current = { revision: run.revision, requestKey: crypto.randomUUID() };
    const current = cancelOperation.current;
    if (!current) return;
    setCancelPending(true);
    try {
      await cancelRun(workspaceId, run.runId, { contractVersion: 'research-automation-cancel-v1', requestKey: current.requestKey, expectedRevision: run.revision }, ownerToken);
      if (!mounted.current) return;
      setCancelOpen(false); notify('Đã gửi yêu cầu hủy. Trạng thái đang được tải lại từ máy chủ.'); reload();
    } catch (error) {
      if (!mounted.current) return;
      setCancelOpen(false);
      if (error instanceof ResearchAutomationError && error.kind === 'conflict') conflict();
      else setNotice(error instanceof ResearchAutomationError ? error.message : 'Chưa gửi được yêu cầu hủy. Thử lại; hệ thống dùng cùng mã yêu cầu.');
    } finally { if (mounted.current) setCancelPending(false); }
  };

  if (!run) {
    if (loadError) return <div className="ra-message error" role="alert"><b>{loadError.notFound ? 'Không tìm thấy phiên nghiên cứu' : 'Chưa tải được phiên nghiên cứu'}</b><p>{loadError.message}</p>{!loadError.notFound && <button type="button" className="button" onClick={reload}>Thử lại</button>}</div>;
    return <div className="report-loading" role="status"><span className="report-skeleton" /><span>Đang tải trạng thái phiên nghiên cứu…</span></div>;
  }

  const phase = runPhase(run.status);
  const canWrite = writesAvailable && ownerToken !== null;
  return <div className="ra-dossier"><aside className="ra-side"><StepNav steps={runSteps(run, phase)} /></aside><section className="ra-main" aria-labelledby="ra-run-title">
    {notice && <div className="ra-banner" role="alert"><p>{notice}</p><button type="button" className="button" onClick={() => setNotice('')}>Đã hiểu</button></div>}
    {loadError && <div className="ra-message error" role="alert"><p>Mất kết nối khi cập nhật trạng thái. Dữ liệu bên dưới là lần tải gần nhất.</p><button type="button" className="button" onClick={reload}>Tải lại</button></div>}
    {/* The automated draft stays server-side for AI and audit; the OWNER sees only the reader page. */}
    {run.status === 'DRAFT_READY' && <ReaderReportPanel key={run.runId} run={run} ownerToken={ownerToken} writesAvailable={writesAvailable} />}
    {phase === 'scope' ? <ScopeConfirm key={`${run.runId}:${run.revision}`} run={run} ownerToken={ownerToken} writesAvailable={writesAvailable} onConfirmed={() => { notify('Đã xác nhận phạm vi. Hệ thống bắt đầu thu thập.'); reload(); }} onConflict={conflict} /> : <RunProgress run={run} phase={phase} workspaceId={workspaceId} />}
    <RunPdfPanel key={`${workspaceId}:${runId}`} workspaceId={workspaceId} runId={runId} ownerToken={ownerToken} writesAvailable={writesAvailable} attachmentAllowed={run.status === 'AWAITING_SCOPE' || run.status === 'DRAFT_READY'} />
  </section><aside className="ra-inspector" aria-labelledby="ra-run-facts"><h2 id="ra-run-facts">Phiên nghiên cứu</h2><p className={`status-pill ${phase === 'finished' && run.status !== 'FAILED' && run.status !== 'CANCELLED' && run.status !== 'INTERRUPTED' ? 'good' : ''}`}>{statusLabel(run.status)}</p><dl className="ra-kv"><div><dt>Từ khóa</dt><dd>{run.keyword}</dd></div><div><dt>Chế độ</dt><dd>{modeLabel(run.mode)}</dd></div><div><dt>Kỳ yêu cầu</dt><dd>{formatDay(run.requestedPeriod.startDate)} → {formatDay(run.requestedPeriod.endDate)} · {run.requestedPeriod.dayCount} ngày</dd></div><div><dt>Thị trường</dt><dd>Việt Nam</dd></div><div><dt>Báo cáo</dt><dd>{reportsLabel(run.reports)}</dd></div><div><dt>Bắt đầu</dt><dd>{formatTime(run.createdAt)}</dd></div><div><dt>Cập nhật</dt><dd>{formatTime(run.updatedAt)}</dd></div></dl><h3>Chi phí và lượt gọi</h3><UsageSummary run={run}/><p className="ra-muted">Ưu tiên đủ dữ liệu · Không đặt trần chi phí. Chưa có số liệu nghĩa là nguồn chưa báo, không phải bằng 0.</p>{phase !== 'finished' && <><button type="button" className="button danger" disabled={!canWrite || cancelPending} onClick={() => setCancelOpen(true)}>{cancelPending ? 'Đang hủy…' : 'Hủy phiên nghiên cứu'}</button>{!canWrite && <p className="ra-muted">Mở khóa OWNER để hủy phiên.</p>}</>}{cancelOpen && <ConfirmDialog titleId="ra-cancel-title" descriptionId="ra-cancel-description" title="Hủy phiên nghiên cứu này?" confirmLabel="Hủy phiên" pending={cancelPending} onCancel={() => setCancelOpen(false)} onConfirm={() => void cancel()}><p id="ra-cancel-description">Hệ thống dừng các bước còn lại. Dữ liệu và chi phí đã phát sinh vẫn được ghi lại. Muốn chạy lại cần tạo phiên mới.</p></ConfirmDialog>}</aside></div>;
}

function RunPdfPanel({ workspaceId, runId, ownerToken, writesAvailable, attachmentAllowed }: Pick<RunViewProps, 'workspaceId' | 'runId' | 'ownerToken' | 'writesAvailable'> & { readonly attachmentAllowed: boolean }) {
  const [data, setData] = useState<ResearchAutomationRunPdfStates | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [tick, setTick] = useState(0);
  const upload = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const active = useRef(true);
  const inFlight = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; upload.current?.abort(); }; }, []);
  useEffect(() => {
    const controller = new AbortController(); let alive = true; let timer: number | undefined;
    const load = async () => {
      try {
        const result = await loadRunPdfs(workspaceId, runId, controller.signal);
        if (!alive) return;
        setData(result); setError('');
        if (result.documents.some(document => document.state === 'INDEXING')) timer = window.setTimeout(() => void load(), POLL_MS);
      } catch (failure) {
        if (alive && !controller.signal.aborted) setError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa tải được trạng thái PDF.');
      }
    };
    void load();
    return () => { alive = false; controller.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [workspaceId, runId, tick]);
  const attach = async () => {
    if (!attachmentAllowed || !file || !ownerToken || !writesAvailable || inFlight.current) return;
    inFlight.current = true; setUploading(true); setError('');
    const controller = new AbortController(); upload.current = controller;
    try {
      const result = await attachRunPdf(workspaceId, runId, file, ownerToken, controller.signal);
      if (!active.current) return;
      setData(result); setFile(null); if (fileInput.current) fileInput.current.value = ''; setTick(value => value + 1);
    } catch (failure) {
      if (active.current && !controller.signal.aborted) setError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa biết máy chủ đã lưu PDF. Tải lại trạng thái trước khi gửi lại.');
    } finally { if (active.current) { inFlight.current = false; setUploading(false); } }
  };
  return <div>
    {data && <PageIndexPdfNotice documents={data.documents} paused={data.paused}
      pausedCopy={data.usageLimited ? 'Đã tạm dừng gửi PDF mới. Dịch vụ lập chỉ mục báo đã hết số dư.'
        : data.documents.some(document => document.state === 'DISABLED') ? 'Lập chỉ mục tự động đang tắt; PDF mới không được gửi.'
          : data.documents.some(document => document.state === 'SKIPPED_LOW_BALANCE') ? 'Đã tạm dừng gửi PDF mới vì số dư thấp.'
            : 'Đã tạm dừng gửi PDF mới. Kiểm tra kết nối và số dư ở bảng Nguồn dữ liệu.'} />}
    <section className="ra-block" aria-labelledby="ra-pdf-attach-title">
      <h3 id="ra-pdf-attach-title">Đính kèm PDF cho phiên này</h3>
      <p className="ra-muted">Tối đa 32 MiB. Tệp có thể được gửi lập chỉ mục và phát sinh chi phí nếu kết nối đang bật. Chỉ trích dẫn đã kiểm chứng mới được lưu; báo cáo hiện có không tự thay đổi.</p>
      {!data && !error && <p role="status">Đang tải trạng thái PDF.</p>}
      {error && <div className="ra-message error" role="alert"><p>{error}</p><button type="button" className="button" disabled={uploading} onClick={() => setTick(value => value + 1)}>Tải lại trạng thái PDF</button></div>}
      <div className="ra-label"><label htmlFor="ra-run-pdf">Tệp PDF</label>
        <input id="ra-run-pdf" className="ra-field" type="file" accept="application/pdf,.pdf" disabled={!attachmentAllowed || !ownerToken || !writesAvailable || uploading}
          ref={fileInput} onChange={event => setFile(event.currentTarget.files?.[0] ?? null)} /></div>
      <div className="ra-actions"><button type="button" className="button" disabled={!attachmentAllowed || !ownerToken || !writesAvailable || !file || uploading} onClick={() => void attach()}>{uploading ? 'Đang đính kèm PDF…' : 'Đính kèm PDF'}</button></div>
      {!attachmentAllowed && <p className="ra-muted">Đính kèm PDF khi phiên đang chờ xác nhận phạm vi hoặc đã có bản nháp.</p>}
      {(!ownerToken || !writesAvailable) && <p className="ra-muted">Mở khóa OWNER để đính kèm PDF.</p>}
    </section>
  </div>;
}

function runSteps(run: ResearchAutomationRun, phase: RunPhase) {
  return [
    { label: 'Từ khóa', note: run.keyword, state: 'done' },
    { label: 'Phỏng vấn', ...(run.mode === 'PRODUCT' ? { note: 'Bỏ qua · đã có mô tả' } : {}), state: 'done' },
    { label: 'Kỳ và báo cáo', state: 'done' },
    { label: 'Tìm nhanh', state: phase === 'searching' ? 'current' : 'done' },
    { label: 'Chọn thẻ và phạm vi', state: phase === 'scope' ? 'current' : phase === 'searching' ? 'upcoming' : 'done' },
    { label: 'Thu thập và báo cáo', state: phase === 'running' || phase === 'finished' ? 'current' : 'upcoming' },
  ] as const;
}

function UsageSummary({ run }: { readonly run: ResearchAutomationRun }) {
  const known = run.usage.knownCosts;
  const activities = ([['m11', 'M11 · Cơ hội'], ['m12', 'M12 · Hành động'],
    ['i14', 'I14 · Hướng cơ hội'], ['i15', 'I15 · Định hướng chiến lược']] as const)
    .flatMap(([id, title]) => {
      const activity = run.aiActivity?.[id];
      return activity ? [{ id, title, activity }] : [];
    });
  return <>
    <dl className="ra-kv"><div><dt>Lượt gọi thu nguồn</dt><dd>{run.usage.requestCount}</dd></div>{known.map(cost => <div key={`${cost.unit}:${cost.amount}`}><dt>Thu nguồn ({cost.unit})</dt><dd>{cost.amount}</dd></div>)}{run.usage.hasUnknownCost && <div><dt>Chi phí thu nguồn</dt><dd>Chưa có đủ số liệu</dd></div>}</dl>
    {activities.length ? <>
      <h4>Hoạt động AI theo mục</h4>
      <p className="ra-muted">Gồm lần tạo đầu và các phiên bản bổ sung của phiên nghiên cứu này.</p>
      {activities.map(({ id, title, activity: ai }) => <details key={id} className="ra-ai-activity" aria-label={title}>
        <summary>{title}</summary>
        <dl className="ra-kv">
        <div><dt>Đã chuẩn bị, chưa bắt đầu gửi</dt><dd>{ai.states.prepared}</dd></div>
        <div><dt>Đang xử lý</dt><dd>{ai.states.dispatching}</dd></div>
        <div><dt>Đã xử lý phản hồi</dt><dd>{ai.states.completed}</dd></div>
        <div><dt>Phản hồi qua kiểm tra máy</dt><dd>{ai.outcomes.valid}</dd></div>
        <div><dt>Phản hồi không đạt kiểm tra</dt><dd>{ai.outcomes.invalid}</dd></div>
        <div><dt>Chưa rõ kết quả gửi</dt><dd>{ai.states.dispatchUnknown}</dd></div>
        <div><dt>Chi phí AI</dt><dd>{ai.billing.state === 'UNKNOWN' ? 'Chưa có số liệu xác nhận' : 'Chưa bắt đầu gửi yêu cầu'}</dd></div>
        </dl>
      </details>)}
      <p className="ra-muted">Đây là trạng thái xử lý, không phải số lượt được tính tiền hay số mục đã hoàn tất. Phản hồi qua kiểm tra máy vẫn cần xem xét nội dung. Mục không xuất hiện chưa có thống kê được ghi nhận.</p>
    </> : <p className="ra-muted">Chưa có thống kê hoạt động AI trong dữ liệu này. Lượt gọi thu nguồn không bao gồm AI.</p>}
  </>;
}

function RunProgress({ run, phase, workspaceId }: { readonly run: ResearchAutomationRun; readonly phase: RunPhase; readonly workspaceId: string }) {
  const active = phase === 'searching' || phase === 'running';
  const blockerGroups = groupBlockers(run.blockers);
  return <div className="ra-progress"><div className="ra-section-head"><h2 id="ra-run-title" tabIndex={-1}>{statusLabel(run.status)}</h2><p>{phase === 'searching' ? 'Hệ thống đang tìm nhanh sản phẩm thật để bạn chọn. Trang tự cập nhật; bạn có thể rời trang và quay lại sau.' : active ? 'Hệ thống đang chạy nền. Trang tự cập nhật; bạn có thể rời trang và quay lại sau.' : 'Phiên đã dừng. Mỗi phần chưa đủ dữ liệu được ghi rõ lý do, không lấp bằng số giả.'}</p></div>{active && <div className="ra-live" role="status"><StatusWord/><progress aria-label={statusLabel(run.status)}/></div>}
    <section className="ra-block" aria-labelledby="ra-steps-title"><h3 id="ra-steps-title">Tiến độ các bước</h3><ol className="ra-run-steps" aria-label="Các bước máy chủ">{run.steps.map(step => <li key={step.stepId}><span>{step.stepId === 'QUICK_SEARCH' ? 'Tìm nhanh' : step.stepId === 'COLLECTION' ? 'Thu thập' : 'Báo cáo'}</span><span className={`ra-state ${step.state.toLowerCase()}`}>{stepStateLabel(step.state)}{step.code ? ` · ${limitationLabel(step.code)}` : ''}{step.code && <details><summary>Chi tiết kỹ thuật</summary><code>{step.code}</code>{step.message && <span>{step.message}</span>}</details>}</span></li>)}</ol></section>
    <section className="ra-block" aria-labelledby="ra-coverage-title"><h3 id="ra-coverage-title">Độ phủ dữ liệu</h3><dl className="ra-kv wide"><div><dt>Kỳ yêu cầu</dt><dd>{formatDay(run.coverage.requestedPeriod.startDate)} → {formatDay(run.coverage.requestedPeriod.endDate)} · {run.coverage.requestedPeriod.dayCount} ngày</dd></div></dl><div className="ra-source-list">{run.coverage.sources.map(source => <article key={`${source.provider}:${source.dataset}`}><div><b>{providerLabel(source.provider)}</b><span>{datasetLabel(source.dataset)}</span></div><span className="status-pill">{coverageStateLabel(source.state)}</span><p>{source.observedStartDate && source.observedEndDate ? `Quan sát: ${formatDay(source.observedStartDate)} → ${formatDay(source.observedEndDate)}` : 'Chưa có kỳ quan sát được báo'}{source.truncated ? ' · Kết quả bị cắt.' : ''}</p><details><summary>Chi tiết kỹ thuật</summary><code>{source.provider} · {source.dataset}</code>{source.note && <span>{source.note}</span>}</details></article>)}</div></section>
    {blockerGroups.length > 0 && <section className="ra-block" aria-labelledby="ra-blockers-title"><h3 id="ra-blockers-title">Phần chưa thể hoàn thành</h3><ul className="ra-blockers">{blockerGroups.map(group => <li key={`${group.code}:${group.provider ?? ''}`}><b>{group.provider ? providerLabel(group.provider) : 'Nguồn'}</b><div><span>{limitationLabel(group.code)}</span><details><summary>Chi tiết kỹ thuật{group.entries.length > 1 ? ` (${group.entries.length} ghi nhận)` : ''}</summary>{group.entries.map((entry, index) => <div key={`${entry.scope}:${entry.message}:${index}`}><code>{entry.code}</code><span>Phạm vi: {entry.scope === 'RUN' ? 'Cả phiên' : entry.scope === 'SOURCE' ? 'Nguồn' : entry.scope}</span>{entry.provider && <span>Nhà cung cấp: {entry.provider}</span>}<span>{entry.message}</span></div>)}</details></div></li>)}</ul></section>}
    {run.status !== 'DRAFT_READY' && <Outputs run={run} workspaceId={workspaceId}/>}
  </div>;
}

type Blocker = ResearchAutomationRun['blockers'][number];
type BlockerGroup = { readonly code: string; readonly provider: string | null; readonly entries: readonly Blocker[] };

function groupBlockers(blockers: readonly Blocker[]): readonly BlockerGroup[] {
  const groups = new Map<string, { code: string; provider: string | null; entries: Blocker[] }>();
  for (const blocker of blockers) {
    // One readable explanation can cover several section-specific codes; keep
    // every original code/scope/message in the expandable evidence list.
    const key = `${limitationLabel(blocker.code)}:${blocker.provider ?? ''}`;
    const group = groups.get(key);
    if (group) group.entries.push(blocker);
    else groups.set(key, { code: blocker.code, provider: blocker.provider, entries: [blocker] });
  }
  return [...groups.values()];
}

function Outputs({ run, workspaceId }: { readonly run: ResearchAutomationRun; readonly workspaceId: string }) {
  if (!run.outputs) return null;
  return <section className="ra-block" aria-labelledby="ra-outputs-title"><h3 id="ra-outputs-title">Báo cáo</h3><p className="ra-muted">Bản web và PDF lấy từ đúng một phiên bản đã lưu. Xuất PDF không chạy AI.</p><div className="ra-outputs">{(['market', 'insight'] as const).filter(kind => run.reports.includes(kind === 'market' ? 'MARKET' : 'INSIGHT')).map(kind => <OutputCard key={kind} kind={kind} output={run.outputs?.[kind]} workspaceId={workspaceId} runId={run.runId}/>)}</div></section>;
}

function OutputCard({ kind, output, workspaceId, runId }: { readonly kind: ResearchAutomationReportKind; readonly output: NonNullable<ResearchAutomationRun['outputs']>[ResearchAutomationReportKind] | undefined; readonly workspaceId: string; readonly runId: string }) {
  const title = kind === 'market' ? 'Báo cáo Thị trường' : 'Báo cáo Insight';
  const webAction = output?.web
    ? <a className="button primary" href={reportUrl(workspaceId, runId, kind, 'web')} target="_blank" rel="noopener noreferrer">Mở bản web<span className="ra-sr"> {title} (mở tab mới)</span></a>
    : <span className="ra-muted">Bản web chưa sẵn sàng</span>;
  const pdfAction = output?.pdf.available
    ? <a className="button" href={reportUrl(workspaceId, runId, kind, 'pdf')} download>Tải PDF<span className="ra-sr"> {title}</span></a>
    : output
      ? <span className="ra-muted">PDF chưa xuất được: {pdfUnavailableLabel(output.pdf.reason)}{output.pdf.reason && <details><summary>Chi tiết kỹ thuật</summary><code>{output.pdf.reason}</code></details>}</span>
      : null;
  return <article className="ra-output" aria-label={title}>
    <header><h4>{title}</h4><span className="status-pill">Bản nháp, chưa duyệt</span></header>
    {output ? <>
      <div className="ra-actions">{webAction}{pdfAction}</div>
      <details><summary>Chi tiết kỹ thuật</summary><code>versionId: {output.versionId}</code></details>
    </> : <p className="ra-muted">Chưa có phiên bản lưu cho báo cáo này.</p>}
  </article>;
}

const statusWords = ['thinking', 'working', 'loading'] as const;
function StatusWord() {
  const [index, setIndex] = useState(0);
  useEffect(() => { if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return; const id = window.setInterval(() => setIndex(prior => (prior + 1 + Math.floor(Math.random() * 2)) % statusWords.length), 2400); return () => window.clearInterval(id); }, []);
  return <span className="ra-word" aria-hidden="true">{statusWords[index]}…</span>;
}
