import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch, FormEvent } from 'react';
import type { ContentBrandSummary, ContentVisibility } from '../../contracts/api/content-api.generated';
import {
  BRAND_ELEMENTS,
  BRAND_PURPOSES,
  ContentDataSourceError,
  VISIBILITY_OPTIONS,
  brandDraftBlocker,
  brandRequestFromDraft,
  createDemoBrand,
  draftFromBrand,
  generatedBrandKey,
  loadBrand,
  loadBrands,
  reviseDemoBrand,
  submitBrandCreate,
  submitBrandRevision,
  type BrandDraft,
  type DemoBrand,
  type ElementKey,
  type PurposeKey,
} from './content-data-source';
import { OwnerWriteError } from './data-source';
import { routeToHash } from './routing';
import { brandEditorReducer, sameContent, type BrandBase, type BrandEditor, type BrandEditorEvent } from './brand-editor';
import { mediaUrl, type DemoCatalogItem } from './catalog-data-source';
import CatalogPanel from './CatalogPanel';
import { noticeText, UPLOAD_PENDING_MESSAGE, uploadCallbacks } from './draft-editor';
import MediaUpload from './MediaUpload';

type LoadState<T> = { readonly status: 'loading' } | { readonly status: 'ready'; readonly value: T } | { readonly status: 'failed'; readonly message: string };

export interface BrandsPageProps {
  readonly mode: 'real' | 'demo';
  readonly brandId: string | null;
  readonly view: 'profile' | 'catalog';
  readonly itemId: string | null;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly demoBrands: readonly DemoBrand[];
  readonly setDemoBrands: (brands: DemoBrand[]) => void;
  readonly demoItems: readonly DemoCatalogItem[];
  readonly setDemoItems: (items: DemoCatalogItem[]) => void;
  readonly demoMedia: Readonly<Record<string, string>>;
  readonly addDemoMedia: (mediaSha256: string, dataUrl: string) => void;
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

export default function BrandsPage(props: BrandsPageProps) {
  const { mode, brandId, demoBrands } = props;
  const mediaSrc = (owner: string) => (mediaSha256: string) => mode === 'demo' ? props.demoMedia[mediaSha256] ?? '' : mediaUrl(owner, mediaSha256);
  const [list, setList] = useState<LoadState<readonly ContentBrandSummary[]>>(mode === 'demo' ? { status: 'ready', value: [] } : { status: 'loading' });
  const [detail, setDetail] = useState<LoadState<BrandBase | null>>({ status: 'loading' });
  const [editor, dispatch] = useReducer(brandEditorReducer, null);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    if (mode === 'demo') return;
    let active = true; setList({ status: 'loading' });
    loadBrands().then((value) => { if (active) setList({ status: 'ready', value }); })
      .catch((error: unknown) => { if (active) setList({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, reloadToken]);

  useEffect(() => {
    if (!brandId) { setDetail({ status: 'ready', value: null }); return; }
    if (mode === 'demo') {
      const brand = demoBrands.find((item) => item.brandId === brandId);
      const value = brand ? { brandId: brand.brandId, version: brand.version, draft: draftFromBrand(brand), history: brand.history } : null;
      setDetail({ status: 'ready', value });
      if (value) dispatch({ type: 'loaded', base: value });
      return;
    }
    let active = true; setDetail({ status: 'loading' });
    loadBrand(brandId).then((value) => {
      if (!active) return;
      const base = value ? { brandId: value.brand.brandId, version: value.brand.version, draft: draftFromBrand(value.brand), history: value.history } : null;
      setDetail({ status: 'ready', value: base });
      if (base) dispatch({ type: 'loaded', base });
    }).catch((error: unknown) => { if (active) setDetail({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, brandId, demoBrands, reloadToken]);

  useEffect(() => { if (brandId) setCreating(false); }, [brandId]);
  useEffect(() => { if (creating) dispatch({ type: 'new', key: generatedBrandKey() }); }, [creating]);

  const summaries: readonly ContentBrandSummary[] = mode === 'demo'
    ? demoBrands.map((brand) => ({ brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, brandName: brand.profile.brandName, updatedAt: brand.createdAt }))
    : list.status === 'ready' ? list.value : [];

  return <>
    <div className="heading">
      <div><h1>Thương hiệu</h1><p>Hồ sơ thương hiệu dùng cho Caption và Poster: thông tin nhận diện, liên hệ và quy tắc hiển thị theo mục đích nội dung.</p></div>
      <button className="button primary" type="button" onClick={() => { setCreating(true); props.navigate(routeToHash.brands()); }}>+ Thêm thương hiệu</button>
    </div>
    <div className="brand-layout">
      <nav className="surface brand-list" aria-label="Danh sách thương hiệu">
        {mode === 'real' && list.status === 'loading' && <p className="muted">Đang tải thương hiệu…</p>}
        {mode === 'real' && list.status === 'failed' && <p className="form-error" role="alert">{list.message}</p>}
        {(mode === 'demo' || list.status === 'ready') && summaries.length === 0 && <p className="muted">Chưa có thương hiệu nào. Tạo thương hiệu đầu tiên để dùng cho các chiến dịch nội dung.</p>}
        {summaries.map((brand) => <a key={brand.brandId} className={`nav-button brand-link${brand.brandId === brandId ? ' active' : ''}`} href={routeToHash.brand(brand.brandId)} aria-current={brand.brandId === brandId ? 'page' : undefined}>
          <span>{brand.brandName}</span><small>Phiên bản {brand.version}</small>
        </a>)}
      </nav>
      <section className="surface surface-pad brand-detail">
        {creating || !brandId
          ? creating
            ? editor?.target === 'new' && <BrandForm {...props} editor={editor} dispatch={dispatch} mediaSrc={() => ''} onSaved={(savedId) => { setCreating(false); reload(); props.navigate(routeToHash.brand(savedId)); }} onConflict={reload} />
            : <div className="empty"><h2>Chọn một thương hiệu</h2><p>Chọn thương hiệu ở danh sách bên trái hoặc tạo thương hiệu mới.</p></div>
          : detail.status === 'ready' && detail.value === null ? <div className="empty"><h2>Không tìm thấy thương hiệu</h2><p>Thương hiệu này không có trong dữ liệu đang hiển thị.</p></div>
          : <>
            <nav className="brand-tabs" aria-label="Mục của thương hiệu">
              <a href={routeToHash.brand(brandId)} aria-current={props.view === 'profile' ? 'page' : undefined}>Hồ sơ thương hiệu</a>
              <a href={routeToHash.catalog(brandId)} aria-current={props.view === 'catalog' ? 'page' : undefined}>Sản phẩm &amp; dịch vụ</a>
            </nav>
            {props.view === 'catalog'
              ? <CatalogPanel mode={mode} brandId={brandId} brandName={detail.status === 'ready' && detail.value ? detail.value.draft.brandName : null} itemId={props.itemId} ownerToken={props.ownerToken} writesAvailable={props.writesAvailable}
                demoItems={props.demoItems} setDemoItems={props.setDemoItems} mediaSrc={mediaSrc(brandId)} addDemoMedia={props.addDemoMedia} navigate={props.navigate} notify={props.notify} />
              : editor?.target === brandId ? <>
                {detail.status === 'failed' && <p className="form-error" role="alert">{detail.message}</p>}
                <BrandForm {...props} editor={editor} dispatch={dispatch} mediaSrc={mediaSrc(brandId)} onSaved={() => reload()} onConflict={reload} />
              </>
              : detail.status === 'failed' ? <p className="form-error" role="alert">{detail.message}</p>
              : <p className="muted">Đang tải hồ sơ thương hiệu…</p>}
          </>}
      </section>
    </div>
  </>;
}

export function BrandForm(props: BrandsPageProps & { readonly editor: BrandEditor; readonly dispatch: Dispatch<BrandEditorEvent>; readonly mediaSrc: (mediaSha256: string) => string; readonly onSaved: (brandId: string) => void; readonly onConflict: () => void }) {
  const { mode, ownerToken, writesAvailable, editor, dispatch } = props;
  const { draft, base: current, saving: pending, notice } = editor;
  const [purpose, setPurpose] = useState<PurposeKey>('sales');
  const inFlight = useRef(false);
  const blocker = brandDraftBlocker(draft);
  const unchanged = current !== null && sameContent(draft, current.draft);
  const disabledReason = mode === 'real' && !writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này.'
    : mode === 'real' && !ownerToken ? 'Mở khóa OWNER cục bộ ở thanh phía trên để bật lưu.'
    : pending ? 'Đang gửi yêu cầu…'
    : editor.uploads > 0 ? UPLOAD_PENDING_MESSAGE
    : blocker ?? (unchanged ? 'Chưa có thay đổi so với phiên bản hiện tại.' : null);
  const set = (key: keyof Omit<BrandDraft, 'displayRules'>, value: string) => dispatch({ type: 'edit', draft: { ...draft, [key]: value } });
  const setRule = (element: ElementKey, value: ContentVisibility) => dispatch({ type: 'edit', draft: { ...draft, displayRules: { ...draft.displayRules, [purpose]: { ...draft.displayRules[purpose], [element]: value } } } });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabledReason) return;
    if (mode === 'demo') {
      try {
        const id = current?.brandId ?? crypto.randomUUID(); const now = new Date().toISOString();
        props.setDemoBrands(current ? reviseDemoBrand(props.demoBrands, id, current.version, draft, now) : createDemoBrand(props.demoBrands, draft, id, now));
        props.notify(current ? 'Đã lưu phiên bản minh họa mới.' : 'Đã tạo thương hiệu minh họa.');
        props.onSaved(id);
      } catch { dispatch({ type: 'failed', conflict: false, message: 'Thương hiệu minh họa đã thay đổi. Hãy tải lại trang demo.' }); }
      return;
    }
    inFlight.current = true; dispatch({ type: 'submitted' });
    try {
      const request = brandRequestFromDraft(draft);
      const receipt = current
        ? await submitBrandRevision({ ...request, brandId: current.brandId, expectedVersion: current.version, token: ownerToken! })
        : await submitBrandCreate({ ...request, brandKey: editor.newKey ?? generatedBrandKey(), token: ownerToken! });
      dispatch({ type: 'saved', version: receipt.version, id: receipt.brandId });
      props.notify(receipt.exactRetry ? 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.' : current ? `Đã lưu phiên bản ${receipt.version}.` : 'Đã tạo thương hiệu.');
      props.onSaved(receipt.brandId);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'conflict') { dispatch({ type: 'failed', conflict: true, message: '' }); props.onConflict(); }
      else if (error instanceof OwnerWriteError && error.kind === 'connection') dispatch({ type: 'failed', conflict: false, message: 'Kết nối không rõ kết quả. Form giữ nguyên nội dung; hãy gửi lại an toàn.' });
      else dispatch({ type: 'failed', conflict: false, message: error instanceof OwnerWriteError ? error.message : 'Không thể lưu thương hiệu.' });
    } finally { inFlight.current = false; }
  };

  const rules = draft.displayRules[purpose];
  return <form className="brand-form" onSubmit={(event) => void submit(event)} noValidate>
    <header className="brand-form-head">
      <div><h2>{current ? draft.brandName || 'Thương hiệu' : 'Thương hiệu mới'}</h2><p className="muted">{current ? `Phiên bản ${current.version}. Lưu sẽ tạo phiên bản mới; các gói đã tạo không thay đổi.` : 'Tạo hồ sơ phiên bản 1.'}{mode === 'demo' ? ' Dữ liệu minh họa, chỉ tồn tại trong phiên này.' : ''}</p></div>
    </header>
    <section className="logo-field" aria-labelledby="logo-title">
      <h3 id="logo-title">Logo</h3>
      <div className="logo-row">
        <div className="logo-preview">{draft.logoMediaSha256 ? <img src={props.mediaSrc(draft.logoMediaSha256)} alt={`Logo ${draft.brandName}`} /> : <span>Chưa có logo</span>}</div>
        <div className="logo-actions">
          {current
            ? <MediaUpload mode={mode} brandId={current.brandId} kind="LOGO" token={ownerToken} disabled={pending || (mode === 'real' && !writesAvailable)} label={draft.logoMediaSha256 ? 'Đổi logo' : 'Tải logo lên'}
              onDemoMedia={props.addDemoMedia} callbacks={uploadCallbacks(dispatch, editor.session, (latest, mediaSha256) => ({ ...latest, logoMediaSha256: mediaSha256 }))} />
            : <p className="muted">Lưu thương hiệu trước, rồi thêm logo.</p>}
          {draft.logoMediaSha256 && <button className="button quiet" type="button" disabled={pending} onClick={() => set('logoMediaSha256', '')}>Bỏ logo</button>}
          <p className="muted">PNG hoặc JPEG · tối đa 2 MB. Logo mới được dùng từ phiên bản hồ sơ bạn lưu tiếp theo.</p>
        </div>
      </div>
    </section>
    <fieldset className="brand-fields" disabled={pending}><legend>Hồ sơ</legend>
      <label>Tên thương hiệu<input className="search" value={draft.brandName} onChange={(event) => set('brandName', event.target.value)} maxLength={120} required /></label>
      <label>Tagline<input className="search" value={draft.tagline} onChange={(event) => set('tagline', event.target.value)} maxLength={240} /></label>
      <label>Hotline<input className="search" value={draft.hotline} onChange={(event) => set('hotline', event.target.value)} maxLength={64} inputMode="tel" /></label>
      <label>Website<input className="search" value={draft.website} onChange={(event) => set('website', event.target.value)} maxLength={512} inputMode="url" /></label>
      <label>Fanpage<input className="search" value={draft.fanpage} onChange={(event) => set('fanpage', event.target.value)} maxLength={512} inputMode="url" /></label>
      <label className="wide">Địa chỉ thương hiệu<textarea className="search" value={draft.address} onChange={(event) => set('address', event.target.value)} maxLength={1000} /></label>
    </fieldset>
    <section className="display-rules" aria-labelledby="display-rules-title">
      <h3 id="display-rules-title">Hiển thị thông tin theo mục đích</h3>
      <p className="muted">Quyết định thông tin nào xuất hiện trong Caption và Poster theo mục đích của góc nội dung. Luôn: bắt buộc có. Tùy: AI được thêm nếu tự nhiên. Ẩn: không gửi cho AI.</p>
      <div className="segmented" role="radiogroup" aria-label="Mục đích">
        {BRAND_PURPOSES.map((item) => <button key={item.key} type="button" role="radio" aria-checked={purpose === item.key} className={purpose === item.key ? 'on' : ''} onClick={() => setPurpose(item.key)}>{item.label}</button>)}
      </div>
      <fieldset className="rules-lock" disabled={pending}><legend>Quy tắc hiển thị · {BRAND_PURPOSES.find((item) => item.key === purpose)!.label}</legend><table className="rules-table">
        <tbody>
          {(['identity', 'contact'] as const).map((group) => [
            <tr key={group} className="rules-group"><th colSpan={2} scope="colgroup">{group === 'identity' ? 'Nhận diện' : 'Liên hệ'}</th></tr>,
            ...BRAND_ELEMENTS.filter((element) => element.group === group).map((element) => <tr key={element.key}>
              <th scope="row">{element.label}{element.key === 'logo' && !draft.logoMediaSha256 && <small>Chưa có logo</small>}</th>
              <td><div className="segmented compact" role="radiogroup" aria-label={`${element.label} · ${BRAND_PURPOSES.find((item) => item.key === purpose)!.label}`}>
                {VISIBILITY_OPTIONS.map((option) => <button key={option.key} type="button" role="radio" aria-checked={rules[element.key] === option.key} className={rules[element.key] === option.key ? `on v-${option.key.toLowerCase()}` : ''} onClick={() => setRule(element.key, option.key)}>{option.label}</button>)}
              </div></td>
            </tr>),
          ])}
        </tbody>
      </table></fieldset>
    </section>
    {notice && <div className="form-error brand-notice" role="alert">{noticeText(notice)}
      {notice.kind === 'rebased' && <button className="button" type="button" onClick={() => dispatch({ type: 'discard' })}>Bỏ thay đổi, dùng phiên bản {notice.toVersion}</button>}
    </div>}
    <div className="form-actions">
      <button className="button primary" type="submit" disabled={disabledReason !== null} aria-describedby="brand-save-note">{pending ? 'Đang lưu…' : current ? 'Lưu phiên bản mới' : 'Tạo thương hiệu'}</button>
      {current && <button className="button" type="button" disabled={pending || unchanged} onClick={() => dispatch({ type: 'discard' })}>Hoàn tác thay đổi</button>}
    </div>
    <p id="brand-save-note" className="decision-note">{disabledReason ?? 'Sẵn sàng lưu.'}</p>
    {current && current.history.length > 0 && <section className="brand-history" aria-labelledby="brand-history-title">
      <h3 id="brand-history-title">Lịch sử phiên bản</h3>
      <ol className="timeline">{[...current.history].reverse().map((item) => <li key={item.version}><strong>Phiên bản {item.version}</strong> · {item.brandName}<small>{new Date(item.createdAt).toLocaleString('vi-VN')}</small></li>)}</ol>
    </section>}
  </form>;
}

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu thương hiệu không vượt qua kiểm tra toàn vẹn.';
}
