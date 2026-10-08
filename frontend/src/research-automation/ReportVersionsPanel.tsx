import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import MetricSourcePanel from './MetricSourcePanel';
import MetricClassificationPanel from './MetricClassificationPanel';
import SupplementalSourcePanel from './SupplementalSourcePanel';
import { ResearchAutomationError, type ResearchAutomationRun } from './api';
import { cancelReportAttempt, loadReportAttempts, loadReportVersions, exactReportUrl as reportPairUrl, createReportRevision as requestReportRevision } from './report-revisions-api';
import type { AutomationReportRevisionRequest, ResearchAutomationReportPair, ResearchAutomationRevisionReceipt } from './report-revisions-api';

type Props = { readonly run: ResearchAutomationRun; readonly ownerToken: string | null; readonly writesAvailable: boolean; readonly onActivityChanged?: () => void };
type Operation = { readonly body: AutomationReportRevisionRequest };
const active = (attempt: ResearchAutomationRevisionReceipt) => attempt.state === 'QUEUED' || attempt.state === 'RUNNING';
// Loaded on demand so its scoped stylesheet stays out of the shared bundle until the owner opens coding.
const InsightCodingPanel = lazy(() => import('./InsightCodingPanel').catch(() => ({ default: () => <p role="alert" className="ra-problem">Chưa tải được phần mã hóa Insight. Tải lại trang.</p> })));
const InsightPersonaPanel = lazy(() => import('./InsightPersonaPanel').catch(() => ({ default: () => <p role="alert">Chưa tải được phần chân dung đề xuất. Tải lại trang.</p> })));
const stateLabel = (state: ResearchAutomationRevisionReceipt['state']) => ({ QUEUED: 'Đang chờ', RUNNING: 'Đang tính và dựng báo cáo', COMMITTED: 'Đã lưu phiên bản', FAILED: 'Không hoàn tất', CANCELLED: 'Đã hủy' })[state];

/** Explicit immutable pair selection; rereads restore work without another write. */
export default function ReportVersionsPanel({ run, ownerToken, writesAvailable, onActivityChanged }: Props) {
  const [versions, setVersions] = useState<ResearchAutomationReportPair[]>([]);
  const [attempts, setAttempts] = useState<ResearchAutomationRevisionReceipt[]>([]);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tick, setTick] = useState(0);
  const [metric, setMetric] = useState('KEEP');
  const [native, setNative] = useState<'KEEP' | 'SKIP'>('KEEP');
  const [source, setSource] = useState({ ready: false, held: false, label: 'Giữ nguồn của phiên bản trước' });
  const [dialog, setDialog] = useState<Operation | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<ResearchAutomationRevisionReceipt | null>(null);
  const [showClassification, setShowClassification] = useState(false);
  const [classificationBusy, setClassificationBusy] = useState(false);
  const classificationStatus = useCallback((value: boolean) => setClassificationBusy(value), []);
  const [showInsight, setShowInsight] = useState(false);
  const [insightBusy, setInsightBusy] = useState(false);
  const insightStatus = useCallback((value: boolean) => setInsightBusy(value), []);
  const [showPersona, setShowPersona] = useState(false);
  const [personaBusy, setPersonaBusy] = useState(false);
  const personaStatus = useCallback((value: boolean) => setPersonaBusy(value), []);
  const [supplementalBusy, setSupplementalBusy] = useState(false);
  const supplementalStatus = useCallback((value: boolean) => setSupplementalBusy(value), []);
  const mounted = useRef(false);
  const busy = useRef(false);
  const operation = useRef<Operation | null>(null);
  const cancellation = useRef<{ attemptId: string; requestKey: string } | null>(null);
  const reload = useCallback(() => setTick(value => value + 1), []);
  const sourceStatus = useCallback((value: typeof source) => setSource(value), []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const abort = new AbortController(); let alive = true; let timer: number | undefined;
    setLoading(true); setError('');
    const read = async () => {
      try {
        const [pairs, work] = await Promise.all([loadReportVersions(run.workspaceId, run.runId, abort.signal), loadReportAttempts(run.workspaceId, run.runId, abort.signal)]);
        if (!alive) return;
        setVersions(pairs.versions); setAttempts(work.attempts); setLoading(false); setError('');
        onActivityChanged?.();
        setSelected(prior => prior || pairs.versions[0]?.pairId || '');
        // Separate GETs can straddle a commit. Poll until its exact pair is visible.
        if (work.attempts.some(active) || work.attempts.some(item => item.state === 'COMMITTED' && !pairs.versions.some(pair => pair.pairId === item.pairId)))
          timer = window.setTimeout(() => void read(), 4000);
      } catch (failure) {
        if (!alive || abort.signal.aborted) return;
        setLoading(false); setError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa xác minh được các phiên bản báo cáo.');
      }
    };
    void read();
    return () => { alive = false; abort.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [run.workspaceId, run.runId, tick, onActivityChanged]);
  const current = versions.at(-1);
  const viewing = versions.find(pair => pair.pairId === selected);
  const running = attempts.find(active);
  const catchingUp = attempts.some(item => item.state === 'COMMITTED' && !versions.some(pair => pair.pairId === item.pairId));
  const otherHeld = pending || uncertain || source.held || classificationBusy || insightBusy || personaBusy;
  const held = otherHeld || supplementalBusy;
  const canWrite = writesAvailable && Boolean(ownerToken);
  const blocker = !canWrite ? 'Mở khóa OWNER để tạo hoặc hủy lượt bổ sung.' : error ? 'Tải lại và xác minh lịch sử trước khi tiếp tục.'
    : loading || catchingUp ? 'Đang xác minh các phiên bản đã lưu.' : !viewing ? 'Chọn một phiên bản đã lưu.' : viewing.pairId !== current?.pairId ? 'Muốn bổ sung, chọn phiên bản cuối trong danh sách làm bản trước. Bản đang xem vẫn giữ nguyên.'
    : running ? 'Một lượt bổ sung đang chạy. Chờ hoàn tất hoặc hủy đúng lượt đó.' : !source.ready ? 'Hoàn tất chọn nguồn hoặc xử lý lượt tải đang chờ.' : null;
  const classificationSourceBlock = !source.ready ? 'Chưa xác minh được nguồn. Hoàn tất hoặc tải lại danh sách nguồn trước khi duyệt phân loại.'
    : metric !== 'KEEP' ? 'Để duyệt phân loại của bản đang xem, chọn giữ nguồn số liệu của phiên bản trước. Muốn đổi nguồn, tạo phiên bản bổ sung trước.'
    : native !== 'KEEP' ? 'Để tạo bản từ phân loại, chọn giữ đúng nguồn review đã dùng. Muốn bỏ nguồn, tạo phiên bản bổ sung riêng.' : null;
  const openConfirmation = () => {
    if (blocker || held || !current) return;
    const body: AutomationReportRevisionRequest = { contractVersion: 'automation-report-revision-v1', requestKey: crypto.randomUUID(), previousPairId: current.pairId,
      sources: { metric: metric === 'KEEP' ? { decision: 'KEEP' } : metric === 'SKIPPED' ? { decision: 'SKIP' } : { decision: 'USE_PREPARED', packageId: metric }, nativeReview: { decision: native } } };
    setDialog({ body });
  };
  const submit = async (snapshot: Operation) => {
    if (busy.current || !canWrite || source.held || supplementalBusy || personaBusy) return;
    if (operation.current !== snapshot && (blocker || held || snapshot.body.previousPairId !== current?.pairId)) return;
    busy.current = true; operation.current = snapshot; setPending(true); setUncertain(false); setNotice('');
    try {
      const receipt = await requestReportRevision(run.workspaceId, run.runId, snapshot.body, ownerToken!);
      if (!mounted.current || operation.current !== snapshot) return;
      operation.current = null; setDialog(null);
      setNotice(receipt.state === 'COMMITTED' ? 'Phiên bản bổ sung đã lưu. Chọn đúng phiên bản trong danh sách để mở bản web hoặc PDF.' : 'Đã nhận lượt bổ sung. Trang chỉ đọc trạng thái; không gửi lại tự động.'); reload();
    } catch (failure) {
      if (!mounted.current || operation.current !== snapshot) return;
      setDialog(null);
      if (failure instanceof ResearchAutomationError && ['rejected', 'authorization', 'conflict'].includes(failure.kind)) { operation.current = null; setNotice(failure.message); reload(); }
      else { setUncertain(true); setNotice('Chưa biết máy chủ đã nhận lượt bổ sung hay chưa. Thử lại dùng đúng nguồn, phiên bản trước và mã yêu cầu cũ. Không tạo yêu cầu mới.'); }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const cancel = async () => {
    if (busy.current || !canWrite || supplementalBusy || personaBusy || !cancelTarget) return;
    if (cancellation.current?.attemptId !== cancelTarget.attemptId) cancellation.current = { attemptId: cancelTarget.attemptId, requestKey: crypto.randomUUID() };
    const snapshot = cancellation.current;
    busy.current = true; setPending(true);
    try {
      await cancelReportAttempt(run.workspaceId, run.runId, snapshot.attemptId, { contractVersion: 'automation-report-revision-cancel-v1', requestKey: snapshot.requestKey }, ownerToken!);
      if (!mounted.current) return;
      setCancelTarget(null); cancellation.current = null; setNotice('Đã xác minh kết quả hủy. Phiên bản đã lưu trước đó không thay đổi.'); reload();
    } catch (failure) { if (mounted.current) { setCancelTarget(null); setNotice(failure instanceof ResearchAutomationError ? failure.message : 'Chưa biết kết quả hủy. Tải lại trạng thái hoặc thử hủy cùng lượt.'); reload(); } }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const scope = run.definition;
  return <section className="ra-block ra-report-versions" aria-labelledby="ra-versions-title">
    <h3 id="ra-versions-title">Các phiên bản báo cáo</h3>
    <p className="ra-muted">Bản gốc không bị ghi đè. Chọn một phiên bản để xem hai báo cáo và tải PDF tương ứng. Mở hoặc xuất không chạy AI.</p>
    {loading && <p role="status">Đang xác minh lịch sử báo cáo…</p>}
    {error && <p role="alert" className="ra-problem">{error} Dữ liệu đang hiển thị có thể là lần tải trước.</p>}
    <button type="button" className="button" disabled={pending} onClick={reload}>Tải lại lịch sử</button>
    {!loading && !error && !versions.length && <p className="ra-muted">Chưa có cặp báo cáo đã lưu; không tạo lượt bổ sung lúc này.</p>}
    {!!versions.length && <label className="ra-label" htmlFor="ra-report-version">Phiên bản đang xem<select id="ra-report-version" className="ra-field" value={selected} disabled={held || Boolean(dialog)} onChange={event => setSelected(event.target.value)}>{versions.map(pair => <option key={pair.pairId} value={pair.pairId}>Phiên bản {pair.versionNumber}{pair.attemptId === null ? ' · Bản gốc' : ' · Bổ sung'}</option>)}</select></label>}
    {viewing && <div className="ra-outputs">{viewing.outputs.map(output => { const kind = output.kind === 'MARKET' ? 'market' : 'insight'; const title = kind === 'market' ? 'Báo cáo Thị trường' : 'Báo cáo Insight'; return <article className="ra-output" key={kind} aria-label={title}><h4>{title} · Phiên bản {viewing.versionNumber}</h4><p className="ra-muted">Bản nháp, chưa duyệt</p><div className="ra-actions"><a className="button primary" href={reportPairUrl(run.workspaceId, run.runId, viewing.pairId, kind, 'web')} target="_blank" rel="noopener noreferrer">Mở bản web<span className="ra-sr"> {title} (mở tab mới)</span></a>{output.pdfAvailable ? <a className="button" href={reportPairUrl(run.workspaceId, run.runId, viewing.pairId, kind, 'pdf')} download>Tải PDF<span className="ra-sr"> {title}</span></a> : <span className="ra-muted">PDF chưa sẵn sàng cho phiên bản này.</span>}</div></article>; })}</div>}
    {!!attempts.length && <div><h4>Lịch sử lượt bổ sung</h4><ol>{attempts.map(attempt => <li key={attempt.attemptId}>Lượt {attempt.attemptNumber}: {stateLabel(attempt.state)}{active(attempt) && <button type="button" className="button" disabled={!canWrite || held} onClick={() => setCancelTarget(attempt)}>Hủy lượt bổ sung {attempt.attemptNumber}</button>}</li>)}</ol><p className="ra-muted">Lượt lỗi hoặc đã hủy không tạo phiên bản thành công. Tải lại trang vẫn đọc được trạng thái đã lưu.</p></div>}
    {viewing && <>
      <button type="button" className="button" disabled={held || Boolean(dialog) || Boolean(cancelTarget)} onClick={() => setShowClassification(value => !value)}>{showClassification ? 'Đóng phân loại mẫu' : 'Duyệt phân loại mẫu'}</button>
      {showClassification && <MetricClassificationPanel key={`${run.runId}:${viewing.pairId}`} run={run} pairId={viewing.pairId} versionNumber={viewing.versionNumber}
        ownerToken={writesAvailable ? ownerToken : null} disabled={pending || uncertain || source.held || insightBusy || supplementalBusy || personaBusy || Boolean(classificationSourceBlock) || Boolean(dialog) || Boolean(cancelTarget) || loading || Boolean(error) || catchingUp || Boolean(running) || viewing.pairId !== current?.pairId}
        disabledReason={personaBusy ? 'Đang có thao tác chân dung dở dang. Hoàn tất hoặc bỏ thao tác đó trước.' : supplementalBusy ? 'Hoàn tất hoặc bỏ thao tác nguồn bổ sung đang chờ trước.' : insightBusy ? 'Đang có thao tác gán mã Insight dở dang. Hoàn tất hoặc bỏ thao tác đó trước.' : classificationSourceBlock}
        onActivityChanged={reload} onBusyChanged={classificationStatus} />}
      <button type="button" className="button" disabled={held || Boolean(dialog) || Boolean(cancelTarget)} onClick={() => setShowInsight(value => !value)}>{showInsight ? 'Đóng gán mã Insight' : 'Duyệt gán mã Insight'}</button>
      {showInsight && <Suspense fallback={<p role="status">Đang mở phần mã hóa Insight…</p>}><InsightCodingPanel key={`${run.runId}:${viewing.pairId}`} run={run} pairId={viewing.pairId} versionNumber={viewing.versionNumber}
        ownerToken={writesAvailable ? ownerToken : null} disabled={pending || uncertain || source.held || classificationBusy || supplementalBusy || personaBusy || Boolean(dialog) || Boolean(cancelTarget) || loading || Boolean(error) || catchingUp || Boolean(running) || viewing.pairId !== current?.pairId}
        disabledReason={personaBusy ? 'Đang có thao tác chân dung dở dang. Hoàn tất hoặc bỏ thao tác đó trước.' : viewing.pairId !== current?.pairId ? 'Chỉ mã hóa được trên phiên bản cuối. Bản đang xem chỉ để đọc lịch sử.' : classificationBusy ? 'Đang có thao tác phân loại mẫu dở dang. Hoàn tất hoặc bỏ thao tác đó trước.'
          : supplementalBusy ? 'Hoàn tất hoặc bỏ thao tác nguồn bổ sung đang chờ trước.' : running ? 'Một lượt bổ sung đang chạy. Chờ hoàn tất hoặc hủy đúng lượt đó.' : null}
        reportBlock={classificationSourceBlock} onActivityChanged={reload} onBusyChanged={insightStatus} /></Suspense>}
      {viewing.outputs.some(output => output.kind === 'INSIGHT') && <>
        <button type="button" className="button" disabled={held || Boolean(dialog) || Boolean(cancelTarget)} onClick={() => setShowPersona(value => !value)}>{showPersona ? 'Đóng thẻ và chân dung đề xuất' : 'Xem thẻ và chân dung đề xuất'}</button>
        {showPersona && <Suspense fallback={<p role="status">Đang mở phần chân dung đề xuất…</p>}><InsightPersonaPanel key={`${run.runId}:${viewing.pairId}`} run={run} pairId={viewing.pairId} versionNumber={viewing.versionNumber}
          ownerToken={writesAvailable ? ownerToken : null} disabled={pending || uncertain || source.held || classificationBusy || insightBusy || supplementalBusy || Boolean(dialog) || Boolean(cancelTarget) || loading || Boolean(error) || catchingUp || Boolean(running) || viewing.pairId !== current?.pairId || Boolean(classificationSourceBlock)}
          disabledReason={viewing.pairId !== current?.pairId ? 'Chỉ tạo đề xuất trên phiên bản cuối. Bản đang xem chỉ đọc lịch sử.' : classificationSourceBlock ?? (running ? 'Một lượt bổ sung đang chạy.' : 'Hoàn tất thao tác nguồn hoặc mã hóa khác trước.')}
          reportBlock={classificationSourceBlock} onActivityChanged={reload} onBusyChanged={personaStatus} /></Suspense>}
      </>}

    </>}
    {scope && <>
      <MetricSourcePanel run={run} scope={{ definition: scope.definition, includeTerms: scope.includeTerms, excludeTerms: scope.excludeTerms, selectedProductIds: scope.selectedProductIds, peerProductIds: scope.peerProductIds, ...(scope.exactShopeeUrls ? { exactShopeeUrls: scope.exactShopeeUrls } : {}) }} selected={metric} onSelect={setMetric} onStatus={sourceStatus} ownerToken={writesAvailable ? ownerToken : null} disabled={pending || uncertain || classificationBusy || insightBusy || supplementalBusy || personaBusy || Boolean(running) || catchingUp || Boolean(dialog) || loading || Boolean(error)} onConflict={reload} supplemental />
      <label className="ra-label" htmlFor="ra-revision-native">Review của phiên bản trước<select id="ra-revision-native" className="ra-field" value={native} disabled={held || Boolean(running) || Boolean(dialog)} onChange={event => setNative(event.target.value as typeof native)}><option value="KEEP">Giữ đúng nguồn review đã dùng</option><option value="SKIP">Chủ động bỏ qua ở phiên bản mới</option></select></label>
      <p className="ra-muted">Phạm vi không thay đổi. Muốn đổi sản phẩm, định nghĩa hoặc kỳ nghiên cứu phải tạo phiên nghiên cứu mới.</p>
      {blocker && <p className="ra-muted">{blocker}</p>}
      {supplementalBusy && <p className="ra-muted">Hoàn tất hoặc bỏ thao tác nguồn bổ sung đang chờ trước khi đổi nguồn hay tạo lượt khác.</p>}
      <div className="ra-actions"><button type="button" className="button primary" disabled={Boolean(blocker) || held} onClick={openConfirmation}>Tạo phiên bản báo cáo bổ sung</button>{uncertain && <button type="button" className="button" disabled={!canWrite || pending} onClick={() => { if (operation.current) void submit(operation.current); }}>Thử lại đúng lượt bổ sung</button>}</div>
    </>}
    <SupplementalSourcePanel key={run.runId} run={run} previousPairId={viewing?.pairId ?? null} previousVersion={viewing?.versionNumber ?? null}
      ownerToken={writesAvailable ? ownerToken : null} blocker={blocker ?? classificationSourceBlock}
      disabled={otherHeld || Boolean(dialog) || Boolean(cancelTarget) || loading || Boolean(error) || catchingUp || Boolean(running)}
      onBusyChanged={supplementalStatus} onRevisionSettled={reload} />
    {notice && <p role="status" className="ra-muted">{notice}</p>}
    {dialog && <ConfirmDialog titleId="ra-revision-title" descriptionId="ra-revision-description" title="Tạo phiên bản báo cáo mới?" confirmLabel="Xác nhận tạo phiên bản" pending={pending} onCancel={() => setDialog(null)} onConfirm={() => void submit(dialog)}><p id="ra-revision-description">Dùng phiên bản {viewing?.versionNumber} làm bản trước. Nguồn số liệu: {source.label}. Review: {native === 'KEEP' ? 'giữ nguồn cũ' : 'bỏ qua'}. Chỉ tính và dựng lại từ nguồn đã lưu; không thu dữ liệu trả phí. Nếu AI tổng hợp được bật, lượt này có thể phát sinh chi phí AI. Bản cũ giữ nguyên.</p></ConfirmDialog>}
    {cancelTarget && <ConfirmDialog titleId="ra-revision-cancel-title" descriptionId="ra-revision-cancel-description" title={`Hủy lượt bổ sung ${cancelTarget.attemptNumber}?`} confirmLabel="Xác nhận hủy lượt" pending={pending} onCancel={() => setCancelTarget(null)} onConfirm={() => void cancel()}><p id="ra-revision-cancel-description">Dừng lượt bổ sung chưa hoàn tất. Không xóa nguồn hoặc phiên bản báo cáo đã lưu. Nếu lượt đã lưu xong, không thể hủy phiên bản đó.</p></ConfirmDialog>}
  </section>;
}
