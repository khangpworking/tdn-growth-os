import { useEffect, useRef, useState } from 'react';
import type { ReportHistoryResponse, WorkspaceReportIndexResponse } from '../../contracts/api/report-api.generated';
import type { ResearchGenerationReceipt } from '../../contracts/api/research-generation-api.generated';
import {
  loadReportHistory,
  loadWorkspaceReportIndex,
  reportArtifactUrl,
  WorkspaceDataSourceError,
  type FrontendMode,
} from './data-source';
import ReportInterpretations from './ReportInterpretations';
import ReportSectionReadiness from './ReportSectionReadiness';
import ResearchReportCreatePanel from './ResearchReportCreatePanel';

type LoadState = 'idle' | 'loading' | 'ready' | 'error';
class CreatedReportSelectionError extends Error {}

export default function ResearchReportsPanel({ mode, workspaceId, ownerToken = null, writesAvailable = false, navigate = () => undefined, notify = () => undefined }: { readonly mode: FrontendMode; readonly workspaceId: string; readonly ownerToken?: string | null; readonly writesAvailable?: boolean; readonly navigate?: (hash: string) => void; readonly notify?: (message: string) => void }) {
  const [indexState, setIndexState] = useState<LoadState>('idle');
  const [index, setIndex] = useState<WorkspaceReportIndexResponse | null>(null);
  const [indexError, setIndexError] = useState('');
  const [indexRetry, setIndexRetry] = useState(0);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [historyState, setHistoryState] = useState<LoadState>('idle');
  const [history, setHistory] = useState<ReportHistoryResponse | null>(null);
  const [historyError, setHistoryError] = useState('');
  const [historyRetry, setHistoryRetry] = useState(0);
  const [selectedVersion, setSelectedVersion] = useState('');
  const pendingCreated = useRef<ResearchGenerationReceipt | null>(null);
  if (pendingCreated.current?.workspaceId !== workspaceId || mode !== 'real') pendingCreated.current = null;

  useEffect(() => {
    setSelectedReportId(null);
    setHistory(null);
    setHistoryState('idle');
    setSelectedVersion('');
    if (mode === 'demo') {
      setIndex({ contractVersion: '1.0.0', workspaceId, reports: [] });
      setIndexState('ready');
      return;
    }
    let active = true;
    setIndexState('loading');
    setIndexError('');
    void loadWorkspaceReportIndex(workspaceId).then(value => {
      if (!active) return;
      const target = pendingCreated.current;
      if (target && (value.workspaceId !== target.workspaceId || !value.reports.some(report => report.reportId === target.reportId))) {
        throw new CreatedReportSelectionError('Đã nhận kết quả tạo, nhưng danh mục chưa có đúng báo cáo vừa lưu. Thử kiểm tra lại danh mục.');
      }
      setIndex(value);
      setIndexState('ready');
      if (target) setSelectedReportId(target.reportId);
    }).catch(error => {
      if (!active) return;
      setIndex(null);
      setIndexState('error');
      setIndexError(error instanceof CreatedReportSelectionError ? error.message : error instanceof WorkspaceDataSourceError && error.kind === 'integrity'
        ? 'Danh mục báo cáo không vượt qua kiểm tra toàn vẹn.'
        : 'Chưa kết nối được danh mục báo cáo.');
    });
    return () => { active = false; };
  }, [mode, workspaceId, indexRetry]);

  useEffect(() => {
    if (!selectedReportId) return;
    let active = true;
    setHistoryState('loading');
    setHistoryError('');
    setHistory(null);
    setSelectedVersion('');
    void loadReportHistory(selectedReportId).then(value => {
      if (!active) return;
      if (value.workspaceId !== workspaceId || value.reportId !== selectedReportId) throw new WorkspaceDataSourceError('integrity', 'Report không thuộc workspace đang xem.');
      const target = pendingCreated.current;
      if (target) {
        const createdVersion = value.versions.find(item => item.version === target.version);
        if (target.workspaceId !== value.workspaceId || target.reportId !== value.reportId || !createdVersion || createdVersion.semanticVersionId !== target.semanticVersionId) {
          throw new CreatedReportSelectionError('Lịch sử chưa xác nhận đúng phiên bản và nội dung vừa tạo. Chưa mở báo cáo; hãy kiểm tra lại.');
        }
        setSelectedVersion(String(target.version));
        pendingCreated.current = null;
      }
      setHistory(value);
      setHistoryState('ready');
    }).catch(error => {
      if (!active) return;
      setHistoryState('error');
      setHistoryError(error instanceof CreatedReportSelectionError ? error.message : error instanceof WorkspaceDataSourceError && error.kind === 'integrity'
        ? 'Lịch sử report không vượt qua replay toàn vẹn.'
        : 'Chưa tải được lịch sử report.');
    });
    return () => { active = false; };
  }, [selectedReportId, workspaceId, historyRetry]);

  const version = history?.versions.find(item => String(item.version) === selectedVersion);
  return <section className="research-reports" aria-labelledby="research-reports-title">
    <div className="heading compact">
      <div>
        <h3 id="research-reports-title">Báo cáo nghiên cứu</h3>
        <p>Chọn một series rồi chọn đúng phiên bản cần đọc. Hệ thống không tự mở bản mới nhất.</p>
      </div>
    </div>
    {mode === 'real' && <ResearchReportCreatePanel key={workspaceId} workspaceId={workspaceId} ownerToken={ownerToken} writesAvailable={writesAvailable} onCreated={receipt => {
      if (receipt.workspaceId !== workspaceId) return;
      pendingCreated.current = receipt;
      setIndexRetry(value => value + 1);
      notify('Đã lưu bản báo cáo chưa duyệt. Đang xác minh đúng phiên bản vừa tạo để mở.');
    }} />}
    {indexState === 'loading' && <div className="report-loading" role="status"><span className="report-skeleton" /><span>Đang kiểm tra danh mục report…</span></div>}
    {indexState === 'error' && <div className="report-message error" role="alert"><p>{indexError}</p><button className="button" onClick={() => setIndexRetry(value => value + 1)}>Thử lại</button></div>}
    {indexState === 'ready' && index?.reports.length === 0 && <div className="report-message">
      <strong>{mode === 'demo' ? 'Demo không tạo báo cáo nghiên cứu giả.' : 'Workspace chưa có report version đã lưu.'}</strong>
      <p>{mode === 'demo' ? 'Hãy chuyển sang dữ liệu thật để xem các phiên bản được kiểm tra toàn vẹn.' : 'Chọn nguồn đã nhập ở phần tạo báo cáo. Hệ thống không tự thu thập dữ liệu hoặc tự chọn bản mới nhất.'}</p>
    </div>}
    {indexState === 'ready' && index && index.reports.length > 0 && <div className="report-browser">
      <ul className="report-series-list" aria-label="Các series báo cáo">{index.reports.map(report => <li key={report.reportId}>
        <div><strong>{report.reportKey}</strong><small>Tạo lúc {formatDate(report.createdAt)}</small></div>
        <button className="button" aria-pressed={selectedReportId === report.reportId} onClick={() => {
          if (pendingCreated.current?.reportId !== report.reportId) pendingCreated.current = null;
          setSelectedReportId(report.reportId);
        }}>Kiểm tra lịch sử</button>
      </li>)}</ul>
      {selectedReportId && <div className="report-history" aria-live="polite">
        {historyState === 'loading' && <div className="report-loading" role="status"><span className="report-skeleton" /><span>Đang replay và xác minh từng phiên bản…</span></div>}
        {historyState === 'error' && <div className="report-message error" role="alert"><p>{historyError}</p><button className="button" onClick={() => setHistoryRetry(value => value + 1)}>Thử lại</button></div>}
        {historyState === 'ready' && history && <>
          <label className="report-version-picker" htmlFor={`report-version-${history.reportId}`}>
            Phiên bản muốn đọc
            <select id={`report-version-${history.reportId}`} value={selectedVersion} onChange={event => setSelectedVersion(event.target.value)}>
              <option value="">Chọn phiên bản…</option>
              {history.versions.map(item => <option key={item.versionId} value={item.version}>v{item.version} · {formatDate(item.createdAt)}</option>)}
            </select>
          </label>
          {!version && <p className="muted report-prompt">Chọn một phiên bản cụ thể để xem trạng thái và mở đúng artifact đã lưu.</p>}
          {version && <article className="report-version-summary">
            <header><div><h4>{history.reportKey} · v{version.version}</h4><p>{version.scope.platform.toUpperCase()} · {version.scope.start} → {version.scope.end}</p></div><span className="status-pill">Bản nháp chưa duyệt</span></header>
            <dl>
              <div><dt>Phương pháp đã chạy</dt><dd>{version.sectionCounts.partialDeterministicDraft}/{version.sectionCounts.total} phần</dd></div>
              <div><dt>Nhận định AI</dt><dd>Xem các lần đã lưu bên dưới</dd></div>
              <div><dt>Quyết định người dùng</dt><dd>Chưa có</dd></div>
              <div><dt>Nguồn đã chọn</dt><dd>{version.selectedSourceCount}</dd></div>
            </dl>
            <p className="report-limit">Các section còn lại vẫn giữ METHOD_ONLY, BLOCKED hoặc MANUAL_REVIEW_REQUIRED theo catalog; không được lấp bằng nội suy AI.</p>
            <div className="report-actions">
              <a className="button primary" href={reportArtifactUrl(history.reportId, version.version, 'report.html')} target="_blank" rel="noreferrer">Mở report và evidence</a>
              <a className="button" href={reportArtifactUrl(history.reportId, version.version, 'packet.json')}>Tải packet JSON</a>
            </div>
            <ReportSectionReadiness reportId={history.reportId} reportVersion={version.version} semanticVersionId={version.semanticVersionId} />
            <ReportInterpretations key={`${history.reportId}:${version.version}`} reportId={history.reportId} reportVersion={version.version} semanticVersionId={version.semanticVersionId} ownerToken={ownerToken} writesAvailable={writesAvailable} navigate={navigate} notify={notify} />
          </article>}
        </>}
      </div>}
    </div>}
  </section>;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}
