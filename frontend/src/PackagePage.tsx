import { useEffect, useRef, useState } from 'react';
import { mediaUrl } from './catalog-data-source';
import CampaignSteps from './CampaignSteps';
import ConfirmDialog from './ConfirmDialog';
import { ContentDataSourceError } from './content-data-source';
import { OwnerWriteError } from './data-source';
import { modelLabel } from './idea-data-source';
import {
  CAPTION_ELEMENTS,
  FACT_ELEMENTS,
  FACT_STATES,
  PACKAGE_RESTORE_DAYS,
  PART_LABELS,
  POSTER_ELEMENTS,
  POST_LIMIT,
  SOURCE_LABELS,
  DemoPackageError,
  PackageAiError,
  changeDemoPackageState,
  changeDemoPackageVersion,
  demoPackageDetail,
  demoPackageList,
  demoPosterDataUrl,
  formatLabel,
  generateDemoPart,
  lengthLabel,
  loadPackage,
  loadPackages,
  manualPostBlocker,
  packageRunPlan,
  posterModelLabel,
  posterUrl,
  styleLabel,
  submitPackageGenerate,
  submitPackageState,
  submitPackageVersion,
  type DemoPackage,
  type DemoPackageContext,
  type PackageDetail,
  type PackagePart,
  type PackageRunCall,
  type PackageVersionInput,
  type PosterVersion,
} from './package-data-source';
import { routeToHash } from './routing';

export interface PackagePageProps {
  readonly mode: 'real' | 'demo';
  readonly campaignId: string;
  readonly code: string;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly demoContext: DemoPackageContext | null;
  readonly demoPackages: readonly DemoPackage[];
  readonly setDemoPackages: (packages: DemoPackage[]) => void;
  /** sha256 → data URL of the demo media, for the logo and reference thumbnails. */
  readonly demoMedia: Readonly<Record<string, string>>;
  readonly notify: (message: string) => void;
}

type Loaded =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly detail: PackageDetail }
  | { readonly status: 'missing' }
  | { readonly status: 'failed'; readonly message: string };

type VersionAction = Omit<PackageVersionInput, 'requestId' | 'packageId'>;

const DEMO_BANNER = 'Chế độ demo — gói này được tạo bằng bộ sinh giả lập và chỉ lưu trong trình duyệt này.';
const ELEMENT_LABELS: Readonly<Record<(typeof POSTER_ELEMENTS)[number], string>> = { name: 'Tên thương hiệu', logo: 'Logo', tagline: 'Tagline', hotline: 'Hotline', web: 'Website & Fanpage', address: 'Địa chỉ' };
const VISIBILITY_LABELS = { ALWAYS: 'Luôn', OPTIONAL: 'Tùy', HIDDEN: 'Ẩn' } as const;
const ATTEMPT_STATES: Readonly<Record<string, string>> = { queued: 'Đang chờ', running: 'Đang chạy', succeeded: 'Thành công', failed: 'Lỗi', interrupted: 'Bị gián đoạn' };

const timeLabel = (value: string): string => new Date(value).toLocaleString('vi-VN');

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu gói không vượt qua kiểm tra toàn vẹn.';
}

export default function PackagePage(props: PackagePageProps) {
  const { mode, campaignId, code } = props;
  const [loaded, setLoaded] = useState<Loaded>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ readonly message: string; readonly reload: boolean } | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  /** A call or version write whose outcome was lost with the connection; resending it reuses the same request id. */
  const [resend, setResend] = useState<{ readonly label: string; readonly run: () => void } | null>(null);
  const versionIdRef = useRef<{ readonly key: string; readonly id: string } | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    const now = new Date().toISOString();
    if (mode === 'demo') {
      const context = props.demoContext;
      const entry = context ? demoPackageList(props.demoPackages, [], context, now).packages.find((candidate) => candidate.code === code) : undefined;
      const detail = context && entry ? demoPackageDetail(props.demoPackages, entry.packageId, context, now) : null;
      setLoaded(detail ? { status: 'ready', detail } : { status: 'missing' });
      return;
    }
    let active = true;
    const load = async (): Promise<PackageDetail | null> => {
      const list = await loadPackages(campaignId);
      const entry = list?.packages.find((candidate) => candidate.code === code);
      return entry ? loadPackage(entry.packageId) : null;
    };
    load().then((detail) => {
      if (!active) return;
      setLoaded((current) => detail ? { status: 'ready', detail } : current.status === 'ready' ? current : { status: 'missing' });
    }).catch((error: unknown) => { if (active) setLoaded((current) => current.status === 'ready' ? current : { status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, campaignId, code, reloadToken, props.demoContext, props.demoPackages]);

  if (loaded.status === 'loading') return <p className="muted">Đang tải gói…</p>;
  if (loaded.status === 'failed') return <section className="surface surface-pad"><p className="form-error" role="alert">{loaded.message}</p><button className="button" type="button" onClick={reload}>Thử lại</button></section>;
  if (loaded.status === 'missing') return <div className="surface empty"><h1>Không tìm thấy gói {code}.</h1><a className="button" href={routeToHash.packageNew(campaignId, [])}>Về Caption & Poster</a></div>;

  const { detail } = loaded;
  const { settings } = detail;
  const caption = detail.captions.at(-1);
  const poster = detail.posters.at(-1);
  const writable = mode === 'demo' || (props.writesAvailable && props.ownerToken !== null);
  const editable = writable && !detail.deleted && !detail.campaignDeleted && busy === null;
  const brandName = props.demoContext?.brand?.profile.brandName ?? '';
  const imageUrl = (sha: string): string | undefined => mode === 'demo' ? props.demoMedia[sha] : mediaUrl(settings.brandId, sha);
  const posterSrc = (version: PosterVersion): string => mode === 'demo' ? demoPosterDataUrl(detail, version, brandName) : posterUrl(detail.packageId, version.version);

  const fail = (error: unknown, fallback: string) => {
    if (!mountedRef.current) return;
    if (error instanceof OwnerWriteError && error.kind === 'conflict') setNotice({ message: error.message, reload: true });
    else if (error instanceof DemoPackageError) setNotice({ message: 'Gói minh họa đã thay đổi.', reload: true });
    else if (error instanceof PackageAiError || error instanceof OwnerWriteError) setNotice({ message: error.message, reload: false });
    else setNotice({ message: fallback, reload: false });
  };

  const after = async (message: string) => {
    props.notify(message);
    if (mode === 'real') reload();
  };

  const generate = async (call: PackageRunCall) => {
    setBusy(`generate:${call.part}`);
    setNotice(null);
    setResend(null);
    try {
      if (mode === 'demo') props.setDemoPackages(generateDemoPart(props.demoPackages, props.demoContext!, call, new Date().toISOString(), crypto.randomUUID()).packages);
      else await submitPackageGenerate({ call, token: props.ownerToken! });
      await after(`Đã tạo ${PART_LABELS[call.part]} mới.`);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'connection') {
        setNotice({ message: 'Mất kết nối — chưa rõ kết quả. Gửi lại dùng cùng mã yêu cầu nên không tạo phiên bản trùng.', reload: false });
        setResend({ label: `Gửi lại ${PART_LABELS[call.part]}`, run: () => void generate(call) });
      } else fail(error, `Không tạo được ${PART_LABELS[call.part]}.`);
    } finally { if (mountedRef.current) setBusy(null); }
  };

  const regenerate = (part: PackagePart, retryOfAttemptId?: string) => {
    const [call] = packageRunPlan([detail], [part], undefined, retryOfAttemptId);
    if (call) void generate(call);
  };

  const changeVersion = async (action: VersionAction, success: string) => {
    const key = JSON.stringify([detail.packageId, action]);
    const requestId = versionIdRef.current?.key === key ? versionIdRef.current.id : crypto.randomUUID();
    versionIdRef.current = { key, id: requestId };
    const input: PackageVersionInput = { ...action, packageId: detail.packageId, requestId };
    setBusy(`version:${action.part}`);
    setNotice(null);
    setResend(null);
    try {
      if (mode === 'demo') props.setDemoPackages(changeDemoPackageVersion(props.demoPackages, props.demoContext!, input, new Date().toISOString()));
      else await submitPackageVersion({ ...input, token: props.ownerToken! });
      versionIdRef.current = null;
      if (action.action === 'MANUAL' && mountedRef.current) setEditing(null);
      await after(success);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'connection') {
        setNotice({ message: 'Mất kết nối — chưa rõ kết quả. Gửi lại dùng cùng mã yêu cầu nên không tạo phiên bản trùng.', reload: false });
        setResend({ label: 'Gửi lại', run: () => void changeVersion(action, success) });
      } else fail(error, 'Không lưu được phiên bản.');
    } finally { if (mountedRef.current) setBusy(null); }
  };

  const changeState = async (action: 'DELETE' | 'RESTORE') => {
    setBusy(`state:${action}`);
    setNotice(null);
    setResend(null);
    try {
      const input = { packageId: detail.packageId, expectedSequence: detail.stateSequence, action };
      if (mode === 'demo') props.setDemoPackages(changeDemoPackageState(props.demoPackages, input, new Date().toISOString()));
      else await submitPackageState({ ...input, token: props.ownerToken! });
      if (mountedRef.current) setConfirmDelete(false);
      await after(action === 'DELETE' ? `Đã xóa gói ${detail.code}. Có thể khôi phục trong ${PACKAGE_RESTORE_DAYS} ngày.` : `Đã khôi phục gói ${detail.code}.`);
    } catch (error) {
      if (mountedRef.current) setConfirmDelete(false);
      fail(error, action === 'DELETE' ? 'Không xóa được gói.' : 'Không khôi phục được gói.');
    } finally { if (mountedRef.current) setBusy(null); }
  };

  const manualBlocker = editing === null ? null : manualPostBlocker(editing);
  const lastAttempt = (part: PackagePart) => detail.attempts.filter((attempt) => attempt.part === part).at(-1);
  const retryButton = (part: PackagePart) => {
    const attempt = lastAttempt(part);
    return attempt && (attempt.state === 'failed' || attempt.state === 'interrupted')
      ? <button className="button" type="button" disabled={!editable} onClick={() => regenerate(part, attempt.attemptId)}>Thử lại lần lỗi</button> : null;
  };

  return <article className="package-page">
    {mode === 'demo' && <div className="demo-banner" role="note">{DEMO_BANNER}</div>}
    <nav className="crumb" aria-label="Đường dẫn"><a href={routeToHash.content()}>Chiến dịch</a><span aria-hidden="true">/</span><a href={routeToHash.campaign(campaignId)}>{detail.campaignName}</a><span aria-hidden="true">/</span><a href={routeToHash.packageNew(campaignId, [])}>Caption & Poster</a><span aria-hidden="true">/</span><span>{detail.code}</span></nav>
    <div className="heading"><div><h1>Gói {detail.code}</h1><p>Tạo lúc {timeLabel(detail.createdAt)} · Caption v{detail.captions.length} · Poster v{detail.posters.length}</p></div>
      {!detail.deleted && <button className="button danger" type="button" disabled={!editable} onClick={() => setConfirmDelete(true)}>Xóa gói</button>}
    </div>
    <CampaignSteps campaignId={campaignId} current={3} />
    {detail.campaignDeleted && <div className="deleted-banner" role="status"><p>Chiến dịch đã bị xóa — gói chỉ còn để xem.</p></div>}
    {detail.deleted && detail.hiddenByParent && <div className="deleted-banner" role="status"><p>Gói bị ẩn vì góc nội dung hoặc Big Idea đã bị xóa — khôi phục chúng để hiện lại{detail.restorableUntil ? ` (đến ${timeLabel(detail.restorableUntil)})` : ''}.</p></div>}
    {detail.deleted && !detail.hiddenByParent && <div className="deleted-banner" role="status"><p>Gói đã bị xóa{detail.restorableUntil ? ` — khôi phục được đến ${timeLabel(detail.restorableUntil)}` : ''}.</p>
      <button className="button primary" type="button" disabled={!writable || detail.campaignDeleted || busy !== null} onClick={() => void changeState('RESTORE')}>{busy === 'state:RESTORE' ? 'Đang khôi phục…' : 'Khôi phục gói'}</button></div>}
    {!writable && <p className="decision-note">Cần mở khóa OWNER để tạo, sửa hoặc xóa.</p>}
    {notice && <div className="form-error brand-notice" role="alert"><p>{notice.message}</p>
      {notice.reload && <button className="button" type="button" onClick={reload}>Tải lại</button>}
      {resend && <button className="button" type="button" disabled={busy !== null} onClick={resend.run}>{resend.label}</button>}</div>}

    <section className="package-settings" aria-labelledby="package-settings-title">
      <h2 id="package-settings-title">Thiết lập</h2>
      <dl className="package-facts">
        <div><dt>Caption</dt><dd>{settings.captionPromptName} · {modelLabel(settings.captionModel)} · {styleLabel(settings.captionStyle)} · {lengthLabel(settings.captionLength)}</dd></div>
        <div><dt>Poster</dt><dd>{settings.posterPromptName} · {posterModelLabel(settings.posterModel)} · {formatLabel(settings.posterFormat)}{settings.includeLogo ? ' · có logo' : ''}</dd></div>
        <div><dt>Caption hiển thị</dt><dd>{CAPTION_ELEMENTS.map((element) => `${ELEMENT_LABELS[element]}: ${VISIBILITY_LABELS[settings.captionDisplay[element]]}`).join(' · ')}</dd></div>
        <div><dt>Poster hiển thị</dt><dd>{POSTER_ELEMENTS.filter((element) => settings.posterDisplay[element]).map((element) => ELEMENT_LABELS[element]).join(' · ') || 'Không có'}</dd></div>
      </dl>
      {settings.referenceMediaSha256s.length > 0 && <div className="package-refs" aria-label="Ảnh tham chiếu đã dùng">{settings.referenceMediaSha256s.map((sha) => {
        const src = imageUrl(sha);
        return <figure key={sha} className="package-ref">{src ? <img src={src} alt="Ảnh tham chiếu" loading="lazy" /> : <span className="muted">Ảnh không còn</span>}</figure>;
      })}</div>}
    </section>

    <div className="package-columns">
      <section aria-labelledby="package-caption-title">
        <div className="brand-form-head"><h2 id="package-caption-title">Caption</h2>
          <div className="form-actions">
            {retryButton('CAPTION')}
            <button className="button" type="button" disabled={!editable} onClick={() => regenerate('CAPTION')}>{busy === 'generate:CAPTION' ? 'Đang tạo…' : caption ? 'Tạo lại' : 'Tạo Caption'}</button>
            {caption && editing === null && <button className="button" type="button" disabled={!editable} onClick={() => setEditing(caption.post)}>Sửa tay</button>}
          </div>
        </div>
        {editing !== null ? <div className="package-edit">
          <label className="field" htmlFor="package-manual">Nội dung Caption (khối liên hệ được thêm tự động)<textarea id="package-manual" className="search" rows={10} value={editing} onChange={(event) => setEditing(event.target.value)} /></label>
          <p className="muted">{[...editing].length}/{POST_LIMIT} ký tự</p>
          {manualBlocker && <p className="decision-note">{manualBlocker}</p>}
          <div className="form-actions">
            <button className="button primary" type="button" disabled={manualBlocker !== null || !editable} onClick={() => void changeVersion({ part: 'CAPTION', action: 'MANUAL', expectedVersion: detail.captions.length, post: editing }, 'Đã lưu Caption sửa tay.')}>{busy === 'version:CAPTION' ? 'Đang lưu…' : 'Lưu phiên bản mới'}</button>
            <button className="button" type="button" disabled={busy !== null} onClick={() => setEditing(null)}>Hủy</button>
          </div>
        </div> : caption ? <>
          <p className="package-caption">{caption.post}</p>
          {caption.footer && <div className="package-footer" aria-label="Khối liên hệ"><b>Khối liên hệ</b><p>{caption.footer}</p></div>}
          <h3>Kiểm tra thông tin thương hiệu</h3>
          <ul className="package-checks">{caption.factCheck.map((row) => <li key={row.element} className={`fact-${row.state.toLowerCase()}`}>
            <b>{FACT_ELEMENTS[row.element]}</b> <span className="status-pill">{FACT_STATES[row.state]}</span>{row.found.length > 0 && <span className="muted"> · {row.found.join(', ')}</span>}
          </li>)}</ul>
        </> : <p className="muted">Chưa có Caption.</p>}
        {detail.captions.length > 0 && <details className="package-history"><summary>Phiên bản Caption ({detail.captions.length})</summary><ol reversed>{[...detail.captions].reverse().map((version) => <li key={version.version}>
          <div><b>v{version.version}</b> · {SOURCE_LABELS[version.source]}{version.restoredFromVersion ? ` từ v${version.restoredFromVersion}` : ''} · <span className="muted">{timeLabel(version.createdAt)}</span></div>
          <p className="package-preview">{version.post}</p>
          {version.version !== detail.captions.length && <button className="button quiet" type="button" disabled={!editable} onClick={() => void changeVersion({ part: 'CAPTION', action: 'RESTORE', expectedVersion: detail.captions.length, restoreVersion: version.version }, `Đã khôi phục Caption v${version.version}.`)}>Khôi phục</button>}
        </li>)}</ol></details>}
      </section>

      <section aria-labelledby="package-poster-title">
        <div className="brand-form-head"><h2 id="package-poster-title">Poster</h2>
          <div className="form-actions">
            {retryButton('POSTER')}
            <button className="button" type="button" disabled={!editable || !caption} title={caption ? undefined : 'Cần có Caption trước.'} onClick={() => regenerate('POSTER')}>{busy === 'generate:POSTER' ? 'Đang tạo…' : poster ? 'Tạo lại' : 'Tạo Poster'}</button>
          </div>
        </div>
        {poster ? <figure className="package-poster">
          <img src={posterSrc(poster)} alt={`Poster ${detail.code} v${poster.version}`} />
          <figcaption className="muted">v{poster.version} · {poster.width}×{poster.height} · theo Caption v{poster.captionVersion}</figcaption>
          {!poster.sizeMatchesFormat && <p className="decision-note">Kích thước ảnh khác khổ {formatLabel(settings.posterFormat)} đã chọn.</p>}
        </figure> : <p className="muted">Chưa có Poster.</p>}
        {detail.posters.length > 1 && <details className="package-history"><summary>Phiên bản Poster ({detail.posters.length})</summary><ul className="package-poster-history">{[...detail.posters].reverse().map((version) => <li key={version.version}>
          <img src={posterSrc(version)} alt={`Poster v${version.version}`} loading="lazy" />
          <span><b>v{version.version}</b> · {SOURCE_LABELS[version.source]}{version.restoredFromVersion ? ` từ v${version.restoredFromVersion}` : ''}</span>
          {version.version !== detail.posters.length && <button className="button quiet" type="button" disabled={!editable} onClick={() => void changeVersion({ part: 'POSTER', action: 'RESTORE', expectedVersion: detail.posters.length, restoreVersion: version.version }, `Đã khôi phục Poster v${version.version}.`)}>Khôi phục</button>}
        </li>)}</ul></details>}
      </section>
    </div>

    {detail.attempts.length > 0 && <details className="package-history"><summary>Lần gọi AI ({detail.attempts.length})</summary><ul className="package-attempts">{[...detail.attempts].reverse().map((attempt) => <li key={attempt.attemptId}>
      {PART_LABELS[attempt.part]} · {modelLabel(attempt.model) === attempt.model ? posterModelLabel(attempt.model) : modelLabel(attempt.model)} · <b>{ATTEMPT_STATES[attempt.state] ?? attempt.state}</b>{attempt.errorCode ? ` · ${attempt.errorCode}` : ''}{attempt.retryOf ? ' · thử lại' : ''} · <span className="muted">{timeLabel(attempt.createdAt)}</span>
    </li>)}</ul></details>}

    {confirmDelete && <ConfirmDialog titleId="package-delete-title" descriptionId="package-delete-description" title={`Xóa gói ${detail.code}?`} confirmLabel="Xóa gói" pending={busy === 'state:DELETE'} onCancel={() => setConfirmDelete(false)} onConfirm={() => void changeState('DELETE')}>
      <p id="package-delete-description">Có thể khôi phục trong {PACKAGE_RESTORE_DAYS} ngày.</p>
    </ConfirmDialog>}
  </article>;
}
