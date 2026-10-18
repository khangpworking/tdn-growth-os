import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FrontendMode } from '../data-source';
import { loadRuns, ResearchAutomationError } from './api';
import type { ResearchAutomationRunSummary } from './api';
import { researchAutomationHash } from './routes';
import { formatDay, formatTime, filterHistory, modeLabel, reportsLabel, statusLabel } from './run-status';
import SourceStatusBoard from './SourceStatusBoard';
import ResearchEditor from './ResearchEditor';
import RunView from './RunView';

export interface ResearchAutomationPageProps {
  readonly mode: FrontendMode;
  readonly workspaceId: string;
  readonly runId: string | null;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

const HISTORY_PREVIEW = 8;

export default function ResearchAutomationPage({ mode, workspaceId, runId, ownerToken, writesAvailable, navigate, notify }: ResearchAutomationPageProps) {
  const [historyData, setHistoryData] = useState<{ readonly workspaceId: string; readonly runs: readonly ResearchAutomationRunSummary[] } | null>(null);
  const [historyError, setHistoryError] = useState<{ readonly workspaceId: string; readonly message: string } | null>(null);
  const [historyLoadingWorkspace, setHistoryLoadingWorkspace] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const [filterText, setFilterText] = useState('');
  const [draftOnly, setDraftOnly] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const history = historyData?.workspaceId === workspaceId ? historyData.runs : [];
  const historyMessage = historyError?.workspaceId === workspaceId ? historyError.message : '';
  const historyLoading = historyLoadingWorkspace === workspaceId;
  const filtered = useMemo(() => filterHistory(history, filterText, draftOnly), [history, filterText, draftOnly]);
  const visible = showAll ? filtered : filtered.slice(0, HISTORY_PREVIEW);
  const onStatusChange = useCallback(() => setHistoryTick(value => value + 1), []);
  useEffect(() => {
    if (mode === 'demo') { setHistoryData(null); setHistoryError(null); setHistoryLoadingWorkspace(null); return; }
    const controller = new AbortController(); let active = true;
    setHistoryLoadingWorkspace(workspaceId);
    void loadRuns(workspaceId, controller.signal).then(value => { if (active) { setHistoryData({ workspaceId, runs: value.runs }); setHistoryError(null); setHistoryLoadingWorkspace(null); } }).catch(error => { if (active && !controller.signal.aborted) { setHistoryError({ workspaceId, message: error instanceof ResearchAutomationError ? error.message : 'Chưa tải được lịch sử nghiên cứu.' }); setHistoryLoadingWorkspace(null); } });
    return () => { active = false; controller.abort(); };
  }, [mode, workspaceId, historyTick]);

  const historySection = (
    <section className="ra-history surface" aria-labelledby="ra-history-title"><div className="ra-history-head"><div><h2 id="ra-history-title">Báo cáo và phiên nghiên cứu</h2><p className="ra-muted">Mở lại báo cáo thị trường và insight của một phiên theo đúng workspace và trạng thái đã lưu.</p></div>{mode !== 'demo' && <button type="button" className="button" onClick={() => setHistoryTick(value => value + 1)}>Tải lại</button>}</div>
      {mode === 'demo' ? <p className="ra-muted">Demo không tạo phiên hay kết quả giả. Chuyển sang dữ liệu thật để xem lịch sử.</p> : historyLoading ? <p className="ra-muted" role="status">Đang tải lịch sử nghiên cứu…</p> : historyMessage ? <div className="ra-message error" role="alert"><p>{historyMessage}</p><button type="button" className="button" onClick={() => setHistoryTick(value => value + 1)}>Thử lại</button></div> : history.length === 0 ? <p className="ra-muted">Workspace chưa có phiên nghiên cứu nào.</p> : <>
        <div className="ra-history-filter"><label>Tìm theo từ khóa <input type="search" value={filterText} onChange={event => { setFilterText(event.target.value); setShowAll(false); }} /></label><label><input type="checkbox" checked={draftOnly} onChange={event => { setDraftOnly(event.target.checked); setShowAll(false); }} /> Chỉ phiên đã có bản nháp</label></div>
        {filtered.length === 0 ? <p className="ra-muted" role="status">Không có phiên nào khớp. Bỏ bộ lọc để xem cả phiên đã dừng hoặc bị hủy.</p> : <ul className="ra-history-list">{visible.map(item => <li key={item.runId}><div><b>{item.keyword}</b><small>{modeLabel(item.mode)} · {formatDay(item.requestedPeriod.startDate)} → {formatDay(item.requestedPeriod.endDate)} · {reportsLabel(item.reports)}</small><small>Cập nhật {formatTime(item.updatedAt)}</small></div><span className="status-pill">{statusLabel(item.status)}</span><button type="button" className="button quiet" onClick={() => navigate(researchAutomationHash(workspaceId, item.runId))}>Mở phiên</button></li>)}</ul>}
        {filtered.length > HISTORY_PREVIEW && !showAll && <button type="button" className="button quiet" onClick={() => setShowAll(true)}>Hiện tất cả ({filtered.length})</button>}
      </>}
    </section>
  );

  return <>
    <div className="ra-crumb"><button type="button" className="button quiet" onClick={() => navigate(`#/markets/${encodeURIComponent(workspaceId)}`)}>← Về workspace</button><span aria-hidden="true">/</span><span>Nghiên cứu tự động</span></div>
    <div className="ra-page-head"><div><h1>Nghiên cứu tự động</h1><p>Tìm nhanh nguồn thật, chốt phạm vi bằng tay, rồi theo dõi bản nháp có giới hạn bằng chứng.</p></div><span className={`ra-environment ${mode === 'demo' ? 'demo' : ''}`}>{mode === 'demo' ? 'Demo · không gọi nguồn' : 'Dữ liệu thật · Việt Nam'}</span></div>
    {!runId && historySection}
    {runId ? mode === 'demo' ? <div className="ra-message" role="status"><b>Demo không mở phiên thật</b><p>Đường dẫn phiên chỉ có tác dụng trong dữ liệu thật. Demo không đọc lịch sử, không gọi nguồn và không tạo kết quả giả.</p><button type="button" className="button" onClick={() => navigate(researchAutomationHash(workspaceId))}>Về trình tạo nghiên cứu</button></div> : <RunView key={`${workspaceId}:${runId}`} workspaceId={workspaceId} runId={runId} ownerToken={ownerToken} writesAvailable={writesAvailable} notify={notify} onStatusChange={onStatusChange} /> : <ResearchEditor key={`${mode}:${workspaceId}`} mode={mode} workspaceId={workspaceId} ownerToken={ownerToken} writesAvailable={writesAvailable} navigate={navigate} notify={notify} />}
    <SourceStatusBoard mode={mode} workspaceId={workspaceId} ownerToken={ownerToken} writesAvailable={writesAvailable} />
    {runId && historySection}
  </>;
}
