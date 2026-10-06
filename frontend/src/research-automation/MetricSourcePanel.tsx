import { useEffect, useRef, useState } from 'react';
import { loadPreparedMetricSources, prepareMetricSource, ResearchAutomationError } from './api';
import type { ResearchAutomationMetricPrepareRequest, ResearchAutomationPreparedMetricEntry, ResearchAutomationRun } from './api';
import { formatDay } from './run-status';

type Scope = ResearchAutomationMetricPrepareRequest['scope'];
type Upload = { readonly request: ResearchAutomationMetricPrepareRequest; readonly file: File };
export interface MetricSourcePanelProps {
  readonly run: ResearchAutomationRun;
  readonly scope: Scope;
  readonly selected: string;
  readonly onSelect: (value: string) => void;
  readonly onStatus: (value: { ready: boolean; held: boolean; label: string }) => void;
  readonly ownerToken: string | null;
  readonly disabled: boolean;
  readonly onConflict: () => void;
  readonly supplemental?: boolean;
}

/** Inventory is persisted evidence; the local upload receipt never implies admission. */
export default function MetricSourcePanel({ run, scope, selected, onSelect, onStatus, ownerToken, disabled, onConflict, supplemental = false }: MetricSourcePanelProps) {
  const [sources, setSources] = useState<ResearchAutomationPreparedMetricEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);
  const [file, setFile] = useState<File | null>(null);
  const [label, setLabel] = useState('');
  const [context, setContext] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [basis, setBasis] = useState('');
  const [selection, setSelection] = useState<ResearchAutomationMetricPrepareRequest['selection']>('UNSPECIFIED');
  const [revenue, setRevenue] = useState<ResearchAutomationMetricPrepareRequest['precision']['revenue']>('unknown');
  const [units, setUnits] = useState<ResearchAutomationMetricPrepareRequest['precision']['units']>('unknown');
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [notice, setNotice] = useState('');
  const operation = useRef<Upload | null>(null);
  const controller = useRef<AbortController | null>(null);
  const busy = useRef(false);
  const mounted = useRef(false);
  const selectedSource = sources.find(source => source.packageId === selected);
  const compatible = (entry: ResearchAutomationPreparedMetricEntry) => scopeKey(entry.request.scope) === scopeKey(scope);
  const selectedValid = (supplemental ? selected === 'KEEP' : selected === 'ABSENT') || selected === 'SKIPPED' || (selectedSource !== undefined && compatible(selectedSource));
  const held = pending || uncertain;
  const ready = !loading && !loadError && !held && selectedValid;
  const selectedLabel = selectedSource?.request.sourceLabel ?? (selected === 'SKIPPED' ? 'Chủ động bỏ qua' : selected === 'KEEP' ? 'Giữ nguồn của phiên bản trước' : 'Chưa có tệp');
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { onStatus({ ready: Boolean(ready), held, label: selectedLabel }); }, [ready, held, selectedLabel, onStatus]);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    setLoading(true); setLoadError('');
    void loadPreparedMetricSources(run.workspaceId, run.runId, abort.signal).then(value => {
      if (alive) { setSources(value.sources); setLoading(false); }
    }).catch(error => {
      if (alive && !abort.signal.aborted) { setLoadError(error instanceof ResearchAutomationError ? error.message : 'Chưa tải được nguồn đã lưu.'); setLoading(false); }
    });
    return () => { alive = false; abort.abort(); };
  }, [run.workspaceId, run.runId, tick]);

  const periodIssue = !start || !end ? 'Nhập đúng kỳ đo được ghi trên nguồn.' : start > end ? 'Ngày kết thúc phải từ ngày bắt đầu trở đi.'
    : start < run.requestedPeriod.startDate || end > run.requestedPeriod.endDate ? 'Kỳ của tệp phải nằm trong kỳ nghiên cứu đã chọn.' : null;
  const problem = !scope.definition.trim() ? 'Hoàn thiện định nghĩa phạm vi trước khi tải nguồn.' : !file ? 'Chọn tệp XLSX gốc.'
    : file.size === 0 || file.size > 32 * 1024 * 1024 ? 'Tệp phải có dữ liệu và không quá 32 MiB.'
    : !label.trim() || !context.trim() || !basis.trim() ? 'Điền tên nguồn, bối cảnh và căn cứ kỳ đo.' : periodIssue;
  const upload = async () => {
    if (busy.current || disabled || !ownerToken || (!operation.current && problem)) return;
    const current = operation.current ?? { file: file!, request: { contractVersion: 'automation-metric-prepare-v1', requestKey: crypto.randomUUID(),
      expectedRevision: run.revision, scope: structuredClone(scope), sourceLabel: label.trim(), sourceContext: context.trim(),
      measurementPeriod: { startDate: start, endDate: end, basis: basis.trim() }, selection, acquiredAt: null, precision: { revenue, units } } satisfies ResearchAutomationMetricPrepareRequest };
    operation.current = current; busy.current = true; setPending(true); setUncertain(false); setNotice('');
    const abort = new AbortController(); controller.current = abort;
    try {
      const receipt = await prepareMetricSource(run.workspaceId, run.runId, current.request, current.file, ownerToken, abort.signal);
      if (!mounted.current || operation.current !== current) return;
      operation.current = null;
      setNotice(`Đã lưu ${receipt.recordCount} dòng. Tệp chưa được chọn cho báo cáo; ${supplemental ? 'chọn trong danh sách rồi xác nhận tạo phiên bản mới.' : 'chọn trong danh sách rồi duyệt phạm vi.'}`);
      setTick(value => value + 1);
    } catch (error) {
      if (!mounted.current || operation.current !== current) return;
      if (error instanceof ResearchAutomationError && ['rejected', 'authorization', 'conflict'].includes(error.kind)) {
        operation.current = null;
        setNotice(error.message);
        if (error.kind === 'conflict') onConflict();
      } else {
        setUncertain(true);
        setNotice('Chưa biết máy chủ đã lưu tệp hay chưa. Thử lại dùng đúng tệp và mã yêu cầu cũ. Dừng chờ không xóa nguồn đã lưu.');
      }
    } finally { busy.current = false; if (mounted.current) setPending(false); }
  };
  const fieldsDisabled = disabled || held;
  return <section className="ra-block ra-source-panel" aria-labelledby="ra-sources-title">
    <h3 id="ra-sources-title">{supplemental ? 'Nguồn cho phiên bản bổ sung' : 'Nguồn số liệu cho báo cáo'}</h3>
    <p className="ra-muted">{supplemental ? 'Phạm vi đã cố định. Tải tệp chỉ lưu nguồn; xác nhận bên dưới mới tạo phiên bản báo cáo mới. Không thu dữ liệu trả phí hoặc sửa bản cũ.' : 'Tải tệp chỉ lưu nguồn, chưa bắt đầu nghiên cứu. Nguồn được chốt cùng phạm vi; bổ sung sau đó phải tạo phiên bản báo cáo mới.'}</p>
    {loading ? <p role="status" className="ra-muted">Đang xác minh nguồn đã lưu…</p> : loadError ? <div role="alert"><p className="ra-problem">{loadError}</p><button type="button" className="button" disabled={disabled || held} onClick={() => setTick(value => value + 1)}>Tải lại danh sách nguồn</button></div> : <>
      <label className="ra-label" htmlFor="ra-metric-choice">Tệp dùng cho lượt này<select id="ra-metric-choice" className="ra-field" value={selected} disabled={fieldsDisabled} onChange={event => onSelect(event.target.value)}>
        {supplemental ? <option value="KEEP">Giữ nguồn của phiên bản trước</option> : <option value="ABSENT">Chưa có tệp số liệu</option>}<option value="SKIPPED">Chủ động bỏ qua tệp số liệu</option>
        {sources.map(source => <option key={source.packageId} value={source.packageId} disabled={!compatible(source)}>{source.request.sourceLabel} · {source.recordCount} dòng{compatible(source) ? '' : ' · khác phạm vi'}</option>)}
      </select></label>
      {!sources.length && <p className="ra-muted">Chưa có tệp nào được lưu cho phiên này. {supplemental ? 'Bạn có thể giữ nguồn cũ hoặc tải tệp gốc bên dưới.' : 'Bạn có thể tải tệp gốc bên dưới hoặc tiếp tục với nguồn còn khả dụng.'}</p>}
      {!selectedValid && <p className="ra-problem" role="alert">Nguồn đã chọn không khớp phạm vi hiện tại. Chọn lại hoặc tải nguồn cho đúng phạm vi.</p>}
      {selectedSource && <p className="ra-muted">Kỳ do người tải khai báo: {formatDay(selectedSource.request.measurementPeriod.startDate)} đến {formatDay(selectedSource.request.measurementPeriod.endDate)}. Chưa xác thực từ nhà cung cấp. Không suy rộng thành toàn thị trường.</p>}
    </>}
    <details><summary>Tải tệp số liệu gốc</summary><p className="ra-muted">Chỉ hỗ trợ XLSX theo mẫu xuất đã kiểm tra, tối đa 32 MiB. Giữ nguyên file; không dùng báo cáo đã hoàn thiện làm nguồn. Ngày tải không được xem là ngày thu thập.</p>
      <fieldset disabled={fieldsDisabled}><legend>Thông tin nguồn do bạn cung cấp</legend>
        <label className="ra-label" htmlFor="ra-metric-file">Tệp XLSX<input id="ra-metric-file" className="ra-field" type="file" accept=".xlsx" onChange={event => setFile(event.target.files?.[0] ?? null)} /></label>
        <label className="ra-label" htmlFor="ra-metric-label">Tên nguồn<input id="ra-metric-label" className="ra-field" value={label} maxLength={200} onChange={event => setLabel(event.target.value)} /></label>
        <label className="ra-label" htmlFor="ra-metric-context">Bối cảnh xuất tệp<textarea id="ra-metric-context" className="ra-field" value={context} maxLength={2000} rows={2} onChange={event => setContext(event.target.value)} /></label>
        <div className="ra-two"><label className="ra-label" htmlFor="ra-metric-start">Kỳ đo từ<input id="ra-metric-start" className="ra-field" type="date" min={run.requestedPeriod.startDate} max={run.requestedPeriod.endDate} value={start} onChange={event => setStart(event.target.value)} /></label><label className="ra-label" htmlFor="ra-metric-end">Đến<input id="ra-metric-end" className="ra-field" type="date" min={start || run.requestedPeriod.startDate} max={run.requestedPeriod.endDate} value={end} onChange={event => setEnd(event.target.value)} /></label></div>
        <label className="ra-label" htmlFor="ra-metric-basis">Căn cứ kỳ đo<small>Ví dụ: bộ lọc ngày trên trang xuất. Không đoán ngày khi nguồn không ghi.</small><input id="ra-metric-basis" className="ra-field" value={basis} maxLength={1000} onChange={event => setBasis(event.target.value)} /></label>
        <label className="ra-label" htmlFor="ra-metric-filter">Bộ lọc lựa chọn trên nguồn<select id="ra-metric-filter" className="ra-field" value={selection} onChange={event => setSelection(event.target.value as typeof selection)}><option value="UNSPECIFIED">Không rõ</option><option value="ON">Đang bật</option><option value="OFF">Đang tắt</option></select></label>
        <div className="ra-two"><PrecisionField id="ra-metric-revenue" label="Độ chính xác doanh thu" value={revenue} onChange={setRevenue}/><PrecisionField id="ra-metric-units" label="Độ chính xác sản lượng" value={units} onChange={setUnits}/></div>
      </fieldset>
      {problem && !held && <p className="ra-muted">{problem}</p>}
      <div className="ra-actions"><button type="button" className="button" disabled={disabled || pending || !ownerToken || (!uncertain && Boolean(problem))} onClick={() => void upload()}>{pending ? 'Đang tải và kiểm tra…' : uncertain ? 'Thử lại đúng lượt tải' : 'Lưu nguồn, chưa đưa vào báo cáo'}</button>
        {pending && <button type="button" className="button" onClick={() => controller.current?.abort()}>Dừng chờ tải</button>}
        {uncertain && <button type="button" className="button" onClick={() => { operation.current = null; setUncertain(false); setNotice('Đã bỏ lượt chờ. Nguồn máy chủ đã lưu vẫn có thể xuất hiện trong danh sách; chưa được chọn tự động.'); setTick(value => value + 1); }}>Bỏ lượt chờ, tải lại danh sách</button>}</div>
    </details>
    {notice && <p className="ra-muted" role="status">{notice}</p>}
    {!ownerToken && <p className="ra-muted">Mở khóa OWNER để tải nguồn. Xem nguồn đã lưu không cần mở khóa.</p>}
  </section>;
}

function scopeKey(scope: Scope): string {
  return JSON.stringify([scope.definition.normalize('NFC').trim(), scope.includeTerms.map(value => value.normalize('NFC').trim()), scope.excludeTerms.map(value => value.normalize('NFC').trim()),
    scope.selectedProductIds, scope.peerProductIds, scope.exactShopeeUrls ?? []]);
}
function PrecisionField({ id, label, value, onChange }: { readonly id: string; readonly label: string; readonly value: ResearchAutomationMetricPrepareRequest['precision']['revenue']; readonly onChange: (value: ResearchAutomationMetricPrepareRequest['precision']['revenue']) => void }) {
  return <label className="ra-label" htmlFor={id}>{label}<select id={id} className="ra-field" value={value} onChange={event => onChange(event.target.value as typeof value)}><option value="unknown">Không rõ</option><option value="exact">Số chính xác</option><option value="display_rounded">Số đã làm tròn khi hiển thị</option><option value="estimated">Số ước tính</option></select></label>;
}
