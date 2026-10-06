import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { formatTime } from './run-status';
import { decideReaderReport, loadReaderReports, readerReportUrl } from './reader-report-api';
import type { ResearchAutomationReaderRevision } from './reader-report-api';

interface Props {
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
}
type Decision = 'APPROVED' | 'REJECTED';

const STATE_LABEL: Record<ResearchAutomationReaderRevision['state'], string> = {
  PENDING_OWNER_REVIEW: 'Chờ bạn duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối', SUPERSEDED: 'Đã có bản mới hơn',
};
const PLATFORM_LABEL = { shopee: 'Shopee', tiktok: 'TikTok Shop' } as const;

/** The only report surface the OWNER sees: the reader page and its Duyệt/Từ chối decision. The automated draft stays server-side. */
export default function ReaderReportPanel({ run, ownerToken, writesAvailable }: Props) {
  const [revisions, setRevisions] = useState<readonly ResearchAutomationReaderRevision[] | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const [dialog, setDialog] = useState<Decision | null>(null);
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const requestKeys = useRef(new Map<string, string>());
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const reload = useCallback(() => setTick(value => value + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    loadReaderReports(run.workspaceId, run.runId, controller.signal)
      .then(list => { if (!controller.signal.aborted) { setRevisions(list.revisions); setError(''); } })
      .catch((failure: unknown) => { if (!controller.signal.aborted) setError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa tải được bản đọc.'); });
    return () => controller.abort();
  }, [run.workspaceId, run.runId, tick]);

  const latest = revisions?.at(-1);
  const canWrite = writesAvailable && ownerToken !== null;
  const submit = async () => {
    if (!latest || !dialog || !ownerToken || pending) return;
    const trimmed = dialog === 'REJECTED' ? reason.trim() : '';
    // Same revision, decision and reason reuse one request key so a retry cannot record twice.
    const identity = `${latest.revisionId}:${dialog}:${trimmed}`;
    const requestKey = requestKeys.current.get(identity) ?? crypto.randomUUID();
    requestKeys.current.set(identity, requestKey);
    setPending(true);
    try {
      await decideReaderReport(run.workspaceId, run.runId, { contractVersion: 'reader-report-decision-v1', requestKey,
        revisionId: latest.revisionId, decision: dialog, reason: trimmed || null }, ownerToken);
      if (!mounted.current) return;
      setNotice(dialog === 'APPROVED' ? 'Đã duyệt bản đọc.' : 'Đã từ chối bản đọc. Bản mới sẽ hiện ở đây khi được dựng lại.');
      setDialog(null); setReason(''); reload();
    } catch (failure) {
      if (!mounted.current) return;
      setDialog(null);
      setNotice(failure instanceof ResearchAutomationError ? failure.message : 'Chưa gửi được quyết định. Thử lại; hệ thống dùng cùng mã yêu cầu.');
      if (failure instanceof ResearchAutomationError && failure.kind === 'conflict') reload();
    } finally { if (mounted.current) setPending(false); }
  };

  return <section className="ra-block ra-reader" aria-labelledby="ra-reader-title">
    <div className="ra-section-head"><h2 id="ra-reader-title" tabIndex={-1}>Bản đọc</h2>
      <p>Bản đọc tóm tắt kết quả phiên này bằng lời dễ hiểu, kèm các giới hạn của số liệu. Bạn xem rồi chọn Duyệt hoặc Từ chối.</p></div>
    {notice && <div className="ra-banner" role="status"><p>{notice}</p><button type="button" className="button" onClick={() => setNotice('')}>Đã hiểu</button></div>}
    {error ? <div className="ra-message error" role="alert"><p>{error}</p><button type="button" className="button" onClick={reload}>Thử lại</button></div>
      : revisions === null ? <p role="status">Đang tải bản đọc…</p>
      : !latest ? <div className="ra-message"><p>Bản đọc đang được chuẩn bị từ kết quả của phiên này. Khi xong, bản đọc sẽ hiện ở đây để bạn xem và duyệt.</p><button type="button" className="button" onClick={reload}>Tải lại</button></div>
      : <>
        <article className="ra-output" aria-label={`Bản đọc lần ${latest.revisionNumber}`}>
          <header><h3>Bản đọc lần {latest.revisionNumber}</h3><span className={`status-pill ${latest.state === 'APPROVED' ? 'good' : ''}`}>{STATE_LABEL[latest.state]}</span></header>
          <p className="ra-muted">Sàn: {latest.platforms.map(p => PLATFORM_LABEL[p]).join(' + ')} · Dựng lúc {formatTime(latest.createdAt)}
            {latest.profileStatus === 'proposed' ? ' · Phân loại sản phẩm do AI đề xuất, chưa được chủ duyệt.' : ''}</p>
          <div className="ra-actions">
            <a className="button primary" href={readerReportUrl(run.workspaceId, run.runId, latest.revisionId)} target="_blank" rel="noopener noreferrer">Mở bản đọc<span className="ra-sr"> lần {latest.revisionNumber} (mở tab mới)</span></a>
            {latest.state === 'PENDING_OWNER_REVIEW' && <>
              <button type="button" className="button primary" disabled={!canWrite || pending} onClick={() => setDialog('APPROVED')}>Duyệt</button>
              <button type="button" className="button" disabled={!canWrite || pending} onClick={() => setDialog('REJECTED')}>Từ chối</button>
            </>}
          </div>
          {latest.state === 'PENDING_OWNER_REVIEW' && !canWrite && <p className="ra-muted">Mở khóa OWNER để duyệt bản đọc.</p>}
          {latest.decision && <p className="ra-muted">{latest.decision.decision === 'APPROVED' ? 'Duyệt' : 'Từ chối'} lúc {formatTime(latest.decision.decidedAt)}{latest.decision.reason ? ` · Lý do: ${latest.decision.reason}` : ''}</p>}
        </article>
        {revisions.length > 1 && <details className="ra-reader-history"><summary>Các lần dựng trước ({revisions.length - 1})</summary><ul>
          {revisions.slice(0, -1).reverse().map(revision => <li key={revision.revisionId}>
            <a href={readerReportUrl(run.workspaceId, run.runId, revision.revisionId)} target="_blank" rel="noopener noreferrer">Bản đọc lần {revision.revisionNumber}</a>
            {' · '}{STATE_LABEL[revision.state]}{revision.decision?.reason ? ` · Lý do: ${revision.decision.reason}` : ''}</li>)}
        </ul></details>}
      </>}
    {dialog && latest && <ConfirmDialog titleId="ra-reader-decision-title" descriptionId="ra-reader-decision-description"
      title={dialog === 'APPROVED' ? `Duyệt bản đọc lần ${latest.revisionNumber}?` : `Từ chối bản đọc lần ${latest.revisionNumber}?`}
      confirmLabel={dialog === 'APPROVED' ? 'Duyệt' : 'Từ chối'} pending={pending} onCancel={() => setDialog(null)} onConfirm={() => void submit()}>
      <p id="ra-reader-decision-description">{dialog === 'APPROVED'
        ? 'Bạn xác nhận đã đọc bản này. Quyết định được lưu cố định, không sửa lại được.'
        : 'Bản này sẽ không được dùng. Ghi lý do để lần dựng sau sửa đúng chỗ.'}</p>
      {dialog === 'REJECTED' && <label className="ra-label">Lý do (không bắt buộc)<textarea className="ra-field" value={reason} maxLength={1000} rows={3} disabled={pending} onChange={event => setReason(event.target.value)} /></label>}
    </ConfirmDialog>}
  </section>;
}
