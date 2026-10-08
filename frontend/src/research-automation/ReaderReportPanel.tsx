import { useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { formatTime } from './run-status';
import { buildReaderWithUnitSpecs, MAX_READER_REQUEST_BYTES, decideReaderReport, loadReaderReports, readerReportUrl } from './reader-report-api';
import type { ResearchAutomationReaderBuildRequest, ResearchAutomationReaderRevision } from './reader-report-api';

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
  const [requestFile, setRequestFile] = useState<File | null>(null);
  const [listingFiles, setListingFiles] = useState<readonly File[]>([]);
  const [ownerFiles, setOwnerFiles] = useState<readonly File[]>([]);
  const [intakeError, setIntakeError] = useState('');
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
  const buildWithSpecs = async () => {
    if (!ownerToken || !requestFile || pending) return;
    setPending(true); setIntakeError(''); setNotice('');
    try {
      if (!requestFile.size || requestFile.size > MAX_READER_REQUEST_BYTES) throw new ResearchAutomationError('rejected', 'Tệp yêu cầu trống hoặc vượt giới hạn 4,5 MiB.');
      let request: ResearchAutomationReaderBuildRequest;
      try { request = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await requestFile.arrayBuffer())) as ResearchAutomationReaderBuildRequest; }
      catch { throw new ResearchAutomationError('rejected', 'Tệp yêu cầu phải là JSON UTF-8 hợp lệ.'); }
      const receipt = await buildReaderWithUnitSpecs(run.workspaceId, run.runId, request,
        [...listingFiles.map(file => ({ file, role: 'LISTING_SPEC' as const })), ...ownerFiles.map(file => ({ file, role: 'OWNER_DECLARATION' as const }))], ownerToken, () => {
          if (mounted.current) setNotice('Đã lưu quy cách của phiên này. Bản đọc chưa được dựng xong và chưa được duyệt.');
        });
      if (!mounted.current) return;
      setNotice(`Đã lưu quy cách và dựng bản đọc lần ${receipt.revision.revisionNumber}. Bản đọc vẫn chờ bạn duyệt.`); reload();
    } catch (failure) {
      if (mounted.current) setIntakeError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa lưu được quy cách và dựng bản đọc. Thử lại với cùng tệp yêu cầu.');
    } finally { if (mounted.current) setPending(false); }
  };

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
    {run.status === 'DRAFT_READY' && latest?.state !== 'APPROVED' && <details className="ra-reader-intake">
      <summary>Bổ sung quy cách và dựng bản đọc</summary>
      <p>Lưu tệp quy cách listing và khai báo số lượng của bạn riêng biệt. Hệ thống đối chiếu đúng sản phẩm, biến thể và vị trí trong tệp; việc lưu không xác thực lời người bán hay duyệt báo cáo.</p>
      <p>Giữ nguyên tệp JSON nguồn. Mỗi tệp không quá 2 MiB, tổng không quá 8 MiB và tối đa 16 tệp. Không suy số lượng từ tiêu đề hoặc giá bán trung bình.</p>
      <label className="ra-label">Tệp yêu cầu dựng bản đọc JSON<input className="ra-field" type="file" accept=".json,application/json" disabled={!canWrite || pending}
        onChange={event => { setRequestFile(event.target.files?.[0] ?? null); setIntakeError(''); }} /></label>
      <p className="ra-muted">Yêu cầu phải chọn tệp sản phẩm của phiên này và trỏ tới từng quan sát quy cách bằng mã kiểm tra, vị trí nguồn. Khi thử lại, dùng cùng tệp yêu cầu để tránh dựng lặp.</p>
      <label className="ra-label">Tệp quy cách listing JSON<input className="ra-field" type="file" multiple accept=".json,application/json" disabled={!canWrite || pending}
        onChange={event => { setListingFiles(Array.from(event.target.files ?? [])); setIntakeError(''); }} /></label>
      <label className="ra-label">Tệp khai báo số lượng của bạn JSON (không bắt buộc)<input className="ra-field" type="file" multiple accept=".json,application/json" disabled={!canWrite || pending}
        onChange={event => { setOwnerFiles(Array.from(event.target.files ?? [])); setIntakeError(''); }} /></label>
      {!canWrite && <p className="ra-muted">Mở khóa OWNER và bật quyền ghi để bổ sung quy cách.</p>}
      {intakeError && <p role="alert" className="ra-message error">{intakeError}</p>}
      <button type="button" className="button" disabled={!canWrite || pending || !requestFile || !listingFiles.length} onClick={() => void buildWithSpecs()}>
        {pending ? 'Đang xử lý…' : 'Lưu quy cách và dựng bản đọc'}</button>
    </details>}
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
