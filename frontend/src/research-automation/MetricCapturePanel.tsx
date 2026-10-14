import { useEffect, useRef, useState } from 'react';
import { loadPreparedMetricCaptureSources, prepareMetricCapture, ResearchAutomationError } from './api';
import type { ResearchAutomationMetricCapturePrepareRequest, ResearchAutomationPreparedMetricCaptureEntry, ResearchAutomationRun } from './api';
import { formatDay } from './run-status';

const MAX_FILE_BYTES = 8 * 1024 * 1024;
type Upload = { readonly request: ResearchAutomationMetricCapturePrepareRequest; readonly snapshot: File; readonly manifest: File };
export interface MetricCapturePanelProps {
  readonly run: ResearchAutomationRun;
  readonly ownerToken: string | null;
  readonly disabled: boolean;
  readonly onConflict: () => void;
}

/** A capture is stored evidence only (PREPARED_NOT_ADMITTED): this panel never admits or selects it. */
export default function MetricCapturePanel({ run, ownerToken, disabled, onConflict }: MetricCapturePanelProps) {
  const [captures, setCaptures] = useState<readonly ResearchAutomationPreparedMetricCaptureEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);
  const [snapshot, setSnapshot] = useState<File | null>(null);
  const [manifest, setManifest] = useState<File | null>(null);
  const [context, setContext] = useState('');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef<Upload | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const held = pending || uncertain;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    setLoading(true); setLoadError('');
    void loadPreparedMetricCaptureSources(run.workspaceId, run.runId, abort.signal).then(value => {
      if (alive) { setCaptures(value.sources); setLoading(false); }
    }).catch(error => {
      if (alive && !abort.signal.aborted) { setLoadError(error instanceof ResearchAutomationError ? error.message : 'Chưa tải được danh sách bản ghi trang kết quả.'); setLoading(false); }
    });
    return () => { alive = false; abort.abort(); };
  }, [run.workspaceId, run.runId, tick]);

  const tooBig = (file: File) => file.size === 0 || file.size > MAX_FILE_BYTES;
  const problem = !snapshot || !manifest ? 'Chọn đủ hai tệp JSON: bản ghi trang kết quả và tệp kê khai.'
    : tooBig(snapshot) || tooBig(manifest) ? 'Mỗi tệp phải có dữ liệu và không quá 8 MiB.'
    : !context.trim() ? 'Điền bối cảnh thu thập bản ghi.' : null;
  const upload = async () => {
    if (busy.current || disabled || !ownerToken || (!operation.current && problem)) return;
    const current = operation.current ?? { snapshot: snapshot!, manifest: manifest!, request: { contractVersion: 'automation-metric-capture-prepare-v1',
      requestKey: crypto.randomUUID(), expectedRevision: run.revision, sourceContext: context.trim() } satisfies ResearchAutomationMetricCapturePrepareRequest };
    operation.current = current; busy.current = true; setPending(true); setUncertain(false); setNotice('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const receipt = await prepareMetricCapture(run.workspaceId, run.runId, current.request, current.snapshot, current.manifest, ownerToken, abort.signal);
      if (!mounted.current || operation.current !== current) return;
      operation.current = null;
      setNotice(`Đã lưu ${receipt.recordCount} dòng từ trang kết quả${receipt.exactRetry ? ' (lượt gửi trùng, không lưu thêm)' : ''}. Trạng thái: ${receipt.state}. Bản ghi chưa được đưa vào báo cáo.`);
      setTick(value => value + 1);
    } catch (error) {
      if (!mounted.current || operation.current !== current) return;
      if (error instanceof ResearchAutomationError && ['rejected', 'authorization', 'conflict'].includes(error.kind)) {
        operation.current = null;
        setNotice(error.message);
        if (error.kind === 'conflict') onConflict();
      } else {
        setUncertain(true);
        setNotice('Chưa biết máy chủ đã lưu bản ghi hay chưa. Thử lại dùng đúng hai tệp và mã yêu cầu cũ.');
      }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  return <section className="ra-block" aria-labelledby="ra-capture-title">
    <h4 id="ra-capture-title">Bản ghi từ trang kết quả</h4>
    <p className="ra-muted">Tải bản ghi đã thu từ trang kết quả để lưu làm bằng chứng. Việc tải chỉ lưu tệp: chưa gọi nhà cung cấp, chưa đưa vào báo cáo.</p>
    {loading ? <p role="status" className="ra-muted">Đang tải danh sách bản ghi…</p> : loadError ? <div role="alert"><p className="ra-problem">{loadError}</p>
      <button type="button" className="button" disabled={held} onClick={() => setTick(value => value + 1)}>Tải lại danh sách bản ghi</button></div>
      : captures.length === 0 ? <p className="ra-muted">Chưa có bản ghi trang kết quả nào được lưu cho phiên này.</p>
      : <ul className="ra-muted">{captures.map(entry => <li key={entry.packageId}>{entry.capture.keyword} · {entry.recordCount} dòng · {entry.capture.platforms.join(', ')} · {formatDay(entry.capture.measurementPeriod.startDate)} đến {formatDay(entry.capture.measurementPeriod.endDate)}{entry.capture.truncation.truncated ? ' · danh sách bị cắt bớt' : ''} · đã lưu, chưa đưa vào báo cáo</li>)}</ul>}
    <fieldset disabled={disabled || held}><legend>Tệp bản ghi do bạn cung cấp</legend>
      <label className="ra-label" htmlFor="ra-capture-snapshot">Tệp bản ghi trang kết quả (JSON)<input id="ra-capture-snapshot" className="ra-field" type="file" accept=".json,application/json" onChange={event => setSnapshot(event.target.files?.[0] ?? null)} /></label>
      <label className="ra-label" htmlFor="ra-capture-manifest">Tệp kê khai (JSON)<input id="ra-capture-manifest" className="ra-field" type="file" accept=".json,application/json" onChange={event => setManifest(event.target.files?.[0] ?? null)} /></label>
      <label className="ra-label" htmlFor="ra-capture-context">Bối cảnh thu thập<textarea id="ra-capture-context" className="ra-field" value={context} maxLength={2000} rows={2} onChange={event => setContext(event.target.value)} /></label>
    </fieldset>
    {problem && !held && <p className="ra-muted">{problem}</p>}
    <div className="ra-actions"><button type="button" className="button" disabled={disabled || pending || !ownerToken || (!uncertain && Boolean(problem))} onClick={() => void upload()}>{pending ? 'Đang tải và kiểm tra…' : uncertain ? 'Thử lại đúng lượt tải' : 'Lưu bản ghi, chưa đưa vào báo cáo'}</button>
      {pending && <button type="button" className="button" onClick={() => controller.current?.abort()}>Dừng chờ tải</button>}
      {uncertain && <button type="button" className="button" onClick={() => { operation.current = null; setUncertain(false); setNotice('Đã bỏ lượt chờ. Bản ghi có thể đã được lưu; kiểm tra lại danh sách.'); setTick(value => value + 1); }}>Bỏ lượt chờ, tải lại danh sách</button>}</div>
    {notice && <p className="ra-muted" role="status">{notice}</p>}
    {!ownerToken && <p className="ra-muted">Mở khóa OWNER để tải bản ghi.</p>}
  </section>;
}
