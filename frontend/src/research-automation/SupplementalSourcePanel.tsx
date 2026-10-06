import { useEffect, useRef, useState } from 'react';
import ConfirmDialog from '../ConfirmDialog';
import { loadPreparedSupplementalSources, prepareSupplementalSource, ResearchAutomationError } from './api';
import type { ResearchAutomationRun, ResearchAutomationSupplementalPrepareReceipt, ResearchAutomationSupplementalPrepareRequest, ResearchAutomationSupplementalPreparedList } from './api';
import { createReportRevision } from './report-revisions-api';
import type { AutomationBoundedReportRevisionRequest, AutomationQuoteReportRevisionRequest } from './report-revisions-api';
import { formatTime } from './run-status';
import './supplemental-source.css';

type Family = ResearchAutomationSupplementalPrepareRequest['family'];
type Prepared = ResearchAutomationSupplementalPreparedList['packages'][number];
type Chosen = { readonly key: number; readonly file: File; readonly path: string };
type Upload = { readonly request: ResearchAutomationSupplementalPrepareRequest; readonly files: ReadonlyMap<string, File> };
type Revision = { readonly body: AutomationQuoteReportRevisionRequest | AutomationBoundedReportRevisionRequest; readonly label: string; readonly family: Family; readonly versionNumber: number };
type Notice = { readonly text: string; readonly problem?: boolean };

export interface SupplementalSourcePanelProps {
  readonly run: ResearchAutomationRun;
  readonly previousPairId: string | null;
  readonly previousVersion: number | null;
  readonly ownerToken: string | null;
  /** Parent-owned reason a new pair cannot be requested now (lock, stale history, running attempt, changed sources). */
  readonly blocker: string | null;
  readonly disabled: boolean;
  readonly onBusyChanged: (value: boolean) => void;
  readonly onRevisionSettled: () => void;
}

const MIB = 1024 * 1024;
const PATH = /^(?!\/)(?![A-Za-z]:)(?!.*(?:^|\/)\.{1,2}(?:\/|$))(?!.*\\)(?!.*\/\/)[^\u0000]+$/;
const DEFINITIVE = ['rejected', 'authorization', 'conflict', 'notFound'];
const familyName: Record<Family, string> = { QUOTE: 'Báo giá có cấu trúc', BOUNDED: 'Phương pháp giới hạn' };
const familyMethods: Record<Family, string> = { QUOTE: 'M08', BOUNDED: 'M10, I11, I12, I16' };
const canonicalDescriptor: Record<Family, string> = { QUOTE: 'methods/quotes.json', BOUNDED: 'method-packets/input.json' };
const extension = (path: string) => path.toLowerCase().endsWith('.json') ? 'application/json' : path.toLowerCase().endsWith('.md') ? 'text/markdown' : null;
const size = (bytes: number) => bytes < 1024 ? `${bytes} B` : bytes < MIB ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / MIB).toFixed(1)} MB`;
// Folder picks carry the chosen folder as the first segment; the package root is inside it.
const logicalPath = (file: File, fromFolder: boolean) => {
  const relative = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
  return fromFolder && relative ? relative.split('/').slice(1).join('/') || file.name : file.name;
};
const folderAttributes = { webkitdirectory: '' } as Record<string, string>;

/** Storing a package and using it are separate owner actions; neither implies verified or accepted content. */
export default function SupplementalSourcePanel({ run, previousPairId, previousVersion, ownerToken, blocker, disabled, onBusyChanged, onRevisionSettled }: SupplementalSourcePanelProps) {
  const [packages, setPackages] = useState<Prepared[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tick, setTick] = useState(0);
  const [choice, setChoice] = useState('');
  const [family, setFamily] = useState<Family>('QUOTE');
  const [label, setLabel] = useState('');
  const [acquired, setAcquired] = useState('');
  const [chosen, setChosen] = useState<Chosen[]>([]);
  const [descriptor, setDescriptor] = useState<number | null>(null);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadUncertain, setUploadUncertain] = useState(false);
  const [dialog, setDialog] = useState<Revision | null>(null);
  const [revisionPending, setRevisionPending] = useState(false);
  const [revisionUncertain, setRevisionUncertain] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const mounted = useRef(false);
  const busy = useRef(false);
  const attempt = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const upload = useRef<Upload | null>(null);
  const revision = useRef<Revision | null>(null);
  const expected = useRef<ResearchAutomationSupplementalPrepareReceipt | null>(null);
  const keys = useRef(0);
  const held = uploadPending || uploadUncertain || revisionPending || revisionUncertain;
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; controller.current?.abort(); }; }, []);
  useEffect(() => { onBusyChanged(held || Boolean(dialog)); }, [held, dialog, onBusyChanged]);
  useEffect(() => () => onBusyChanged(false), [onBusyChanged]);
  useEffect(() => {
    const abort = new AbortController(); let alive = true;
    setLoading(true); setLoadError('');
    void loadPreparedSupplementalSources(run.workspaceId, run.runId, abort.signal).then(list => {
      if (!alive) return;
      setPackages(list.packages); setLoading(false);
      setChoice(prior => list.packages.some(item => item.packageId === prior) ? prior : '');
      const receipt = expected.current;
      if (receipt) {
        const found = list.packages.some(item => item.packageId === receipt.packageId && item.family === receipt.family && item.descriptorPath === receipt.descriptorPath &&
          item.manifestArtifactSha256 === receipt.manifestArtifactSha256 && item.packageContentSha256 === receipt.packageContentSha256 && item.sourceLabel === receipt.sourceLabel &&
          item.requestKey === receipt.requestKey && item.acquiredAt === receipt.acquiredAt && item.files.length === receipt.files.length &&
          receipt.files.every(file => item.files.some(stored => stored.path === file.path && stored.sha256 === file.sha256 && stored.byteSize === file.byteSize && stored.mediaType === file.mediaType)));
        if (found) expected.current = null;
        else setLoadError('Danh sách chưa xác minh được đúng gói máy chủ vừa nhận.');
        setNotice(found ? { text: 'Nguồn đã lưu. Chọn nguồn và tạo phiên bản mới để đưa vào báo cáo.' }
          : { problem: true, text: 'Máy chủ báo đã lưu nhưng danh sách chưa có đúng gói này. Tải lại danh sách; chưa dùng gói này để tạo báo cáo.' });
      }
    }).catch(failure => {
      if (alive && !abort.signal.aborted) { setLoadError(failure instanceof ResearchAutomationError ? failure.message : 'Chưa tải được nguồn bổ sung đã lưu.'); setLoading(false); }
    });
    return () => { alive = false; abort.abort(); };
  }, [run.workspaceId, run.runId, tick]);
  const reload = () => setTick(value => value + 1);

  const selected = packages.find(item => item.packageId === choice);
  const markdown = chosen.filter(item => extension(item.path) === 'text/markdown').length;
  const paths = chosen.map(item => item.path.trim());
  const acquiredAt = acquired ? new Date(acquired) : null;
  const problem = !chosen.length ? 'Chọn các tệp của gói nguồn.' : chosen.length > 16 ? 'Mỗi gói tối đa 16 tệp.'
    : chosen.some(item => item.file.size === 0 || item.file.size > 8 * MIB) ? 'Mỗi tệp phải có dữ liệu và không quá 8 MiB.'
    : chosen.reduce((sum, item) => sum + item.file.size, 0) > 32 * MIB ? 'Tổng các tệp không quá 32 MiB.'
    : paths.some(path => !path || path.length > 500 || !PATH.test(path)) ? 'Dùng đường dẫn tương đối trong gói, không có ổ đĩa, đoạn “.”, “..”, “\\” hoặc “//”.'
    : paths.some(path => path === 'automation-supplemental' || path.startsWith('automation-supplemental/')) ? 'Thư mục automation-supplemental/ do hệ thống dùng riêng. Đổi đường dẫn khác.'
    : new Set(paths).size !== paths.length ? 'Mỗi tệp cần một đường dẫn riêng.'
    : paths.some(path => !extension(path)) || (family === 'QUOTE' && markdown > 0) ? (family === 'QUOTE' ? 'Gói báo giá chỉ nhận tệp .json.' : 'Gói phương pháp chỉ nhận tệp .json và hai tệp .md phương pháp.')
    : family === 'BOUNDED' && markdown !== 2 ? 'Gói phương pháp giới hạn cần đúng hai tệp .md phương pháp.'
    : descriptor === null || !chosen.some(item => item.key === descriptor && extension(item.path) === 'application/json') ? 'Chọn một tệp JSON làm tệp mô tả phương pháp.'
    : !chosen.some(item => item.key !== descriptor && extension(item.path) === 'application/json') ? 'Cần ít nhất một tệp JSON nguồn ngoài tệp mô tả.'
    : !label.trim() ? 'Điền tên nguồn.' : acquiredAt && Number.isNaN(acquiredAt.getTime()) ? 'Thời điểm thu thập chưa hợp lệ.' : null;

  const pick = (list: FileList | null, fromFolder: boolean) => {
    const next = [...(list ?? [])].map(file => ({ key: ++keys.current, file, path: logicalPath(file, fromFolder) }));
    setChosen(next);
    setDescriptor(next.find(item => item.path === canonicalDescriptor[family])?.key ?? null);
  };
  const send = async () => {
    if (busy.current || disabled || !ownerToken || (!upload.current && problem)) return;
    const snapshot = upload.current ?? {
      files: new Map(chosen.map(item => [item.path.trim(), item.file])),
      request: { contractVersion: 'automation-supplemental-prepare-v1', requestKey: crypto.randomUUID(), family, sourceLabel: label.trim(),
        acquiredAt: acquiredAt ? acquiredAt.toISOString() : null, descriptorPath: chosen.find(item => item.key === descriptor)!.path.trim(),
        files: chosen.map(item => ({ path: item.path.trim(), mediaType: extension(item.path)!, representationRole: 'structured' as const })) },
    } satisfies Upload;
    const mine = ++attempt.current;
    upload.current = snapshot; busy.current = true; setUploadPending(true); setUploadUncertain(false); setNotice(null);
    const abort = new AbortController(); controller.current = abort;
    try {
      const receipt = await prepareSupplementalSource(run.workspaceId, run.runId, snapshot.request, snapshot.files, ownerToken, abort.signal);
      if (!mounted.current || attempt.current !== mine) return;
      upload.current = null; expected.current = receipt;
      setChosen([]); setDescriptor(null); setLabel(''); setAcquired('');
      setNotice({ text: 'Máy chủ đã nhận gói. Đang tải lại danh sách để xác minh…' }); reload();
    } catch (failure) {
      if (!mounted.current || attempt.current !== mine) return;
      if (failure instanceof ResearchAutomationError && DEFINITIVE.includes(failure.kind)) { upload.current = null; setNotice({ problem: true, text: failure.message }); }
      else { setUploadUncertain(true); setNotice({ problem: true, text: `${failure instanceof ResearchAutomationError && failure.kind === 'integrity' ? `${failure.message} ` : ''}Chưa biết máy chủ đã lưu gói hay chưa. Thử lại dùng đúng tệp và mã yêu cầu cũ, hoặc bỏ lượt chờ rồi tải lại danh sách.` }); }
    } finally { if (attempt.current === mine) { busy.current = false; if (mounted.current) setUploadPending(false); } }
  };
  // Stops waiting only. The server may still store the package; a late answer is ignored and only an explicit exact retry or reload follows.
  const stop = () => {
    attempt.current++; controller.current?.abort(); busy.current = false;
    setUploadPending(false); setUploadUncertain(true);
    setNotice({ problem: true, text: 'Đã dừng chờ. Máy chủ có thể đã lưu gói. Thử lại đúng lượt tải hoặc bỏ lượt chờ rồi tải lại danh sách.' });
  };
  const abandon = () => {
    upload.current = null; setUploadUncertain(false);
    setNotice({ text: 'Đã bỏ lượt chờ. Gói máy chủ đã lưu vẫn có thể xuất hiện trong danh sách; không được chọn tự động.' }); reload();
  };

  const revisionBlock = !ownerToken ? 'Mở khóa OWNER để tạo phiên bản báo cáo.' : blocker ? blocker
    : loading ? 'Đang xác minh nguồn bổ sung đã lưu.' : loadError ? 'Tải lại danh sách nguồn bổ sung trước khi tạo phiên bản.'
    : uploadPending || uploadUncertain ? 'Hoàn tất hoặc bỏ lượt tải gói đang chờ trước.' : revisionUncertain ? 'Lượt tạo phiên bản trước chưa rõ kết quả. Thử lại đúng lượt đó.'
    : !previousPairId ? 'Chưa có phiên bản đã lưu để làm bản trước.' : !selected ? 'Chọn một nguồn đã lưu để tạo phiên bản mới.' : null;
  useEffect(() => {
    if (dialog && !revisionPending && !revisionUncertain && (disabled || blocker || dialog.body.previousPairId !== previousPairId)) {
      setDialog(null);
      setNotice({ problem: true, text: 'Điều kiện hoặc phiên bản trước đã đổi. Tải lại, chọn nguồn và xác nhận lại trước khi tạo phiên bản.' });
    }
  }, [dialog, revisionPending, revisionUncertain, disabled, blocker, previousPairId]);
  const confirm = () => {
    if (revisionBlock || held || disabled || !selected || !previousPairId || previousVersion === null) return;
    const methods = { decision: 'USE_PACKAGE' as const, packageId: selected.packageId, manifestArtifactSha256: selected.manifestArtifactSha256,
      packageContentSha256: selected.packageContentSha256, descriptorPath: selected.descriptorPath };
    const common = { requestKey: crypto.randomUUID(), previousPairId, sources: { metric: { decision: 'KEEP' as const }, nativeReview: { decision: 'KEEP' as const } } };
    const body: Revision['body'] = selected.family === 'QUOTE' ? { contractVersion: 'automation-quote-report-revision-v1', ...common, quoteMethods: methods }
      : { contractVersion: 'automation-bounded-report-revision-v1', ...common, boundedMethods: methods };
    setDialog({ body, label: selected.sourceLabel, family: selected.family, versionNumber: previousVersion });
  };
  const submit = async (snapshot: Revision) => {
    if (busy.current || !ownerToken) return;
    if (revision.current !== snapshot && (revisionBlock || held || disabled || snapshot.body.previousPairId !== previousPairId)) return;
    busy.current = true; revision.current = snapshot; setRevisionPending(true); setRevisionUncertain(false); setNotice(null);
    try {
      const receipt = await createReportRevision(run.workspaceId, run.runId, snapshot.body, ownerToken);
      if (!mounted.current || revision.current !== snapshot) return;
      revision.current = null; setDialog(null); setChoice('');
      setNotice({ text: receipt.state === 'COMMITTED' ? 'Phiên bản mới đã lưu. Chọn phiên bản đó trong danh sách phía trên để mở bản web hoặc PDF.'
        : 'Đã nhận lượt tạo phiên bản. Theo dõi trong lịch sử lượt bổ sung; không gửi lại tự động.' });
      onRevisionSettled();
    } catch (failure) {
      if (!mounted.current || revision.current !== snapshot) return;
      setDialog(null);
      if (failure instanceof ResearchAutomationError && DEFINITIVE.includes(failure.kind)) { revision.current = null; setNotice({ problem: true, text: failure.message }); onRevisionSettled(); }
      else { setRevisionUncertain(true); setNotice({ problem: true, text: 'Chưa biết máy chủ đã nhận lượt tạo phiên bản hay chưa. Thử lại dùng đúng nguồn, phiên bản trước và mã yêu cầu cũ. Không tạo yêu cầu mới.' }); }
    } finally { busy.current = false; if (mounted.current) setRevisionPending(false); }
  };

  const fieldsDisabled = disabled || held || Boolean(dialog);
  return <section className="ra-block ra-source-panel ra-supplemental" aria-labelledby="ra-supplemental-title">
    <h3 id="ra-supplemental-title">Nguồn báo giá và phương pháp bổ sung</h3>
    <p className="ra-muted">Lưu gói chỉ cất tệp, chưa đưa vào báo cáo. Chọn một nguồn đã lưu rồi xác nhận để tạo phiên bản mới; bản cũ giữ nguyên. Mỗi lượt bổ sung chỉ chọn một loại nguồn.</p>
    {loading ? <p role="status" className="ra-muted">Đang xác minh nguồn bổ sung đã lưu…</p>
      : loadError ? <div role="alert"><p className="ra-problem">{loadError} Chưa thể tạo phiên bản từ nguồn bổ sung cho đến khi tải lại được danh sách.</p><button type="button" className="button" disabled={held} onClick={reload}>Tải lại nguồn bổ sung</button></div>
      : !packages.length ? <p className="ra-muted">Chưa có nguồn bổ sung nào được lưu cho phiên này. Mở “Tải gói nguồn bổ sung” bên dưới, chọn các tệp JSON theo đúng cấu trúc gói rồi lưu. Nếu chưa có báo giá hoặc phương pháp ở dạng này, báo cáo hiện tại giữ nguyên.</p>
      : <fieldset disabled={fieldsDisabled}><legend>Nguồn dùng cho phiên bản mới</legend>
        <label className="ra-check"><input type="radio" name={`ra-supplemental-${run.runId}`} value="" checked={choice === ''} onChange={() => setChoice('')} /><span>Chưa chọn nguồn</span></label>
        {packages.map(item => <label className="ra-check" key={item.packageId}><input type="radio" name={`ra-supplemental-${run.runId}`} value={item.packageId} checked={choice === item.packageId} onChange={() => setChoice(item.packageId)} />
          <span><b>{item.sourceLabel}</b><small>{familyName[item.family]} · {familyMethods[item.family]} · {item.files.length} tệp · {item.acquiredAt ? `Thu thập ${formatTime(item.acquiredAt)}` : 'Nguồn không ghi thời điểm thu thập'}</small><small>Do bạn cung cấp, chưa xác thực từ nhà cung cấp</small></span></label>)}
      </fieldset>}
    {selected && <p className="ra-muted">Phiên bản mới dùng {familyName[selected.family].toLowerCase()} từ “{selected.sourceLabel}” và giữ nguồn số liệu, review của bản trước. Máy chủ kiểm tra lại toàn bộ gói khi tạo phiên bản; gói thiếu dữ liệu cần thiết sẽ bị từ chối. Muốn thêm {familyName[selected.family === 'QUOTE' ? 'BOUNDED' : 'QUOTE'].toLowerCase()}, tạo thêm một phiên bản sau.</p>}
    {revisionBlock && <p className="ra-muted">{revisionBlock}</p>}
    <div className="ra-actions"><button type="button" className="button primary" disabled={Boolean(revisionBlock) || held || disabled} onClick={confirm}>Tạo phiên bản với nguồn đã chọn</button>
      {revisionUncertain && <button type="button" className="button" disabled={!ownerToken || revisionPending} onClick={() => { if (revision.current) void submit(revision.current); }}>Thử lại đúng lượt tạo phiên bản</button>}
      {revisionUncertain && <button type="button" className="button" disabled={revisionPending} onClick={() => { revision.current = null; setRevisionUncertain(false); setNotice({ text: 'Đã bỏ lượt chờ. Kiểm tra lịch sử lượt bổ sung trước khi tạo lượt khác.' }); onRevisionSettled(); }}>Bỏ lượt chờ, tải lại lịch sử</button>}</div>
    <details><summary>Tải gói nguồn bổ sung</summary>
      <p className="ra-muted">Chỉ nhận gói JSON đã chuẩn bị theo cấu trúc dưới đây: tối đa 16 tệp, mỗi tệp 8 MiB, tổng 32 MiB. Không nhận PDF, XLSX hoặc văn bản tự do. Mọi tệp tải lên phải được tệp mô tả dùng đến.</p>
      <fieldset disabled={fieldsDisabled}><legend>Thông tin gói do bạn cung cấp</legend>
        <label className="ra-label" htmlFor="ra-supplemental-family">Loại nguồn<select id="ra-supplemental-family" className="ra-field" value={family} onChange={event => { const next = event.target.value as Family; setFamily(next); setDescriptor(chosen.find(item => item.path === canonicalDescriptor[next])?.key ?? null); }}>
          <option value="QUOTE">Báo giá có cấu trúc (M08)</option><option value="BOUNDED">Phương pháp giới hạn (M10, I11, I12, I16)</option></select></label>
        <p className="ra-muted">{family === 'QUOTE'
          ? 'Gói báo giá gồm: tệp mô tả methods/quotes.json, hồ sơ báo giá profiles/quote.json, cấu hình config/mapping.json và tệp báo giá gốc quotes.json. Chỉ dùng giá và quy cách đã ghi trong tệp; không suy ra quy cách hay giá từ tên sản phẩm.'
          : 'Gói phương pháp gồm: tệp mô tả method-packets/input.json (chỉ khai báo các cổng điều kiện), tệp nguồn method-packets/gate-source.json và đúng hai tệp phương pháp đã ghim method-packets/advanced-profile.md, method-packets/adoption.md. Tệp .md chỉ là căn cứ phương pháp, không được đọc như dữ liệu.'}</p>
        <label className="ra-label" htmlFor="ra-supplemental-label">Tên nguồn<input id="ra-supplemental-label" className="ra-field" value={label} maxLength={200} onChange={event => setLabel(event.target.value)} /></label>
        <label className="ra-label" htmlFor="ra-supplemental-acquired">Thời điểm thu thập<small>Để trống nếu nguồn không ghi. Không dùng ngày tải lên.</small><input id="ra-supplemental-acquired" className="ra-field" type="datetime-local" value={acquired} onChange={event => setAcquired(event.target.value)} /></label>
        <div className="ra-two">
          <label className="ra-label" htmlFor="ra-supplemental-files">Chọn các tệp<input id="ra-supplemental-files" className="ra-field" type="file" multiple accept={family === 'QUOTE' ? '.json,application/json' : '.json,.md,application/json,text/markdown'} onChange={event => pick(event.target.files, false)} /></label>
          <label className="ra-label" htmlFor="ra-supplemental-folder">Hoặc chọn cả thư mục gói<input id="ra-supplemental-folder" className="ra-field" type="file" {...folderAttributes} onChange={event => pick(event.target.files, true)} /></label>
        </div>
        {!!chosen.length && <ul className="ra-supplemental-files" aria-label="Tệp trong gói">{chosen.map((item, index) => <li key={item.key}>
          <label className="ra-label" htmlFor={`ra-supplemental-path-${index}`}>Đường dẫn trong gói<small>{item.file.name} · {size(item.file.size)}</small><input id={`ra-supplemental-path-${index}`} className="ra-field" value={item.path} maxLength={500} onChange={event => { const path = event.target.value; setChosen(list => list.map(entry => entry.key === item.key ? { ...entry, path } : entry)); }} /></label>
          <label className="ra-check"><input type="radio" name="ra-supplemental-descriptor" checked={descriptor === item.key} disabled={extension(item.path) !== 'application/json'} onChange={() => setDescriptor(item.key)} /><span>Tệp mô tả phương pháp</span></label>
        </li>)}</ul>}
      </fieldset>
      {problem && !held && <p className="ra-muted">{problem}</p>}
      <div className="ra-actions"><button type="button" className="button" disabled={disabled || uploadPending || Boolean(dialog) || revisionPending || revisionUncertain || !ownerToken || (!uploadUncertain && Boolean(problem))} onClick={() => void send()}>{uploadPending ? 'Đang tải và kiểm tra…' : uploadUncertain ? 'Thử lại đúng lượt tải gói' : 'Lưu gói nguồn, chưa đưa vào báo cáo'}</button>
        {uploadPending && <button type="button" className="button" onClick={stop}>Dừng chờ tải gói</button>}
        {uploadUncertain && <button type="button" className="button" onClick={abandon}>Bỏ lượt chờ, tải lại nguồn bổ sung</button>}</div>
    </details>
    {notice && <p role="status" className={notice.problem ? 'ra-problem' : 'ra-muted'}>{notice.text}</p>}
    {!ownerToken && <p className="ra-muted">Mở khóa OWNER để lưu gói hoặc tạo phiên bản. Xem nguồn đã lưu không cần mở khóa.</p>}
    {dialog && <ConfirmDialog titleId="ra-supplemental-confirm-title" descriptionId="ra-supplemental-confirm-description" title="Tạo phiên bản với nguồn bổ sung?" confirmLabel="Xác nhận tạo phiên bản" pending={revisionPending} onCancel={() => setDialog(null)} onConfirm={() => void submit(dialog)}>
      <p id="ra-supplemental-confirm-description">Dùng phiên bản {dialog.versionNumber} làm bản trước. Nguồn: “{dialog.label}” ({familyName[dialog.family].toLowerCase()}, do bạn cung cấp, chưa xác thực). Giữ nguồn số liệu và review của bản trước; {familyName[dialog.family === 'QUOTE' ? 'BOUNDED' : 'QUOTE'].toLowerCase()} của bản trước, nếu có, được giữ nguyên. Không thu dữ liệu trả phí. Nếu AI tổng hợp được bật, lượt này có thể phát sinh chi phí AI. Bản cũ giữ nguyên.</p>
    </ConfirmDialog>}
  </section>;
}
