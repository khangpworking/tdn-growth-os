import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch, FormEvent } from 'react';
import {
  ITEM_TYPES,
  catalogDraftBlocker,
  catalogEditorReducer,
  catalogRequestFromDraft,
  createDemoItem,
  draftFromItem,
  generatedItemKey,
  generatedTierKey,
  loadCatalog,
  loadCatalogItem,
  reviseDemoItem,
  sameCatalogContent,
  submitCatalogCreate,
  submitCatalogRevision,
  type CatalogBase,
  type CatalogDraft,
  type CatalogEditor,
  type CatalogEditorEvent,
  type CatalogSummary,
  type DemoCatalogItem,
  type TierDraft,
} from './catalog-data-source';
import { ContentDataSourceError } from './content-data-source';
import { OwnerWriteError } from './data-source';
import { noticeText } from './draft-editor';
import MediaUpload from './MediaUpload';
import { routeToHash } from './routing';

type LoadState<T> = { readonly status: 'loading' } | { readonly status: 'ready'; readonly value: T } | { readonly status: 'failed'; readonly message: string };

export interface CatalogPanelProps {
  readonly mode: 'real' | 'demo';
  readonly brandId: string;
  readonly brandName: string | null;
  readonly itemId: string | null;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly demoItems: readonly DemoCatalogItem[];
  readonly setDemoItems: (items: DemoCatalogItem[]) => void;
  readonly mediaSrc: (mediaSha256: string) => string;
  readonly addDemoMedia: (mediaSha256: string, dataUrl: string) => void;
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

export default function CatalogPanel(props: CatalogPanelProps) {
  const { mode, brandId, itemId, demoItems } = props;
  const [list, setList] = useState<LoadState<readonly CatalogSummary[]>>({ status: 'loading' });
  const [detail, setDetail] = useState<LoadState<CatalogBase | null>>({ status: 'loading' });
  const [editor, dispatch] = useReducer(catalogEditorReducer, null);
  const [creating, setCreating] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((value) => value + 1);

  useEffect(() => {
    if (mode === 'demo') {
      setList({ status: 'ready', value: demoItems.filter((item) => item.brandId === brandId).map((item) => ({ itemId: item.itemId, itemKey: item.itemKey, version: item.version, itemType: item.item.itemType, name: item.item.name, tierNames: item.item.tiers.map((tier) => tier.name), photoCount: item.item.photos.length, updatedAt: item.createdAt })) });
      return;
    }
    let active = true; setList({ status: 'loading' });
    loadCatalog(brandId).then((value) => { if (active) setList(value === null ? { status: 'failed', message: 'Không tìm thấy thương hiệu này.' } : { status: 'ready', value }); })
      .catch((error: unknown) => { if (active) setList({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, brandId, demoItems, reloadToken]);

  useEffect(() => {
    if (!itemId) { setDetail({ status: 'ready', value: null }); return; }
    if (mode === 'demo') {
      const item = demoItems.find((entry) => entry.itemId === itemId && entry.brandId === brandId);
      const value = item ? { itemId: item.itemId, version: item.version, draft: draftFromItem(item.item), history: item.history } : null;
      setDetail({ status: 'ready', value });
      if (value) dispatch({ type: 'loaded', base: value });
      return;
    }
    let active = true; setDetail({ status: 'loading' });
    loadCatalogItem(brandId, itemId).then((value) => {
      if (!active) return;
      const base = value ? { itemId: value.item.itemId, version: value.item.version, draft: draftFromItem(value.item.item), history: value.history } : null;
      setDetail({ status: 'ready', value: base });
      if (base) dispatch({ type: 'loaded', base });
    }).catch((error: unknown) => { if (active) setDetail({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, brandId, itemId, demoItems, reloadToken]);

  useEffect(() => { if (itemId) setCreating(false); }, [itemId]);
  useEffect(() => { if (creating) dispatch({ type: 'new', key: generatedItemKey(), target: `new:${brandId}` }); }, [creating, brandId]);

  const items = list.status === 'ready' ? list.value : [];
  const formProps = { ...props, dispatch, onConflict: reload };
  return <div className="catalog-layout">
    <section className="catalog-list" aria-labelledby="catalog-title">
      <header className="catalog-head">
        <div><h2 id="catalog-title">Sản phẩm &amp; dịch vụ</h2><p className="muted">Dùng lại cho mọi chiến dịch của {props.brandName ?? 'thương hiệu này'}.</p></div>
        <button className="button" type="button" onClick={() => { setCreating(true); props.navigate(routeToHash.catalog(brandId)); }}>+ Thêm</button>
      </header>
      {list.status === 'loading' && <p className="muted">Đang tải danh mục…</p>}
      {list.status === 'failed' && <p className="form-error" role="alert">{list.message}</p>}
      {list.status === 'ready' && items.length === 0 && <p className="muted">Chưa có sản phẩm hay dịch vụ nào. Thêm mục đầu tiên để chọn khi tạo chiến dịch.</p>}
      <ul className="catalog-cards">
        {items.map((item) => <li key={item.itemId}><a className={`catalog-card${item.itemId === itemId ? ' active' : ''}`} href={routeToHash.catalogItem(brandId, item.itemId)} aria-current={item.itemId === itemId ? 'page' : undefined}>
          <span className={`type-badge t-${item.itemType.toLowerCase()}`}>{ITEM_TYPES.find((type) => type.key === item.itemType)!.badge}</span>
          <strong>{item.name}</strong>
          <small>{item.tierNames.length === 0 ? 'Chưa có gói' : `${item.tierNames.length} gói: ${item.tierNames.join(', ')}`} · {item.photoCount} ảnh · Phiên bản {item.version}</small>
        </a></li>)}
      </ul>
    </section>
    <section className="catalog-editor" aria-label="Chi tiết sản phẩm hoặc dịch vụ">
      {creating || !itemId
        ? creating
          ? editor?.target === `new:${brandId}` && <CatalogForm {...formProps} editor={editor} onSaved={(savedId) => { setCreating(false); reload(); props.navigate(routeToHash.catalogItem(brandId, savedId)); }} />
          : <div className="empty"><h2>Chọn một sản phẩm hoặc dịch vụ</h2><p>Chọn ở danh sách hoặc bấm “+ Thêm”.</p></div>
        : detail.status === 'ready' && detail.value === null ? <div className="empty"><h2>Không tìm thấy mục này</h2><p>Sản phẩm/dịch vụ không thuộc thương hiệu đang xem.</p></div>
        : editor?.target === itemId ? <>
          {detail.status === 'failed' && <p className="form-error" role="alert">{detail.message}</p>}
          <CatalogForm {...formProps} editor={editor} onSaved={() => reload()} />
        </>
        : detail.status === 'failed' ? <p className="form-error" role="alert">{detail.message}</p>
        : <p className="muted">Đang tải…</p>}
    </section>
  </div>;
}

export function CatalogForm(props: CatalogPanelProps & { readonly editor: CatalogEditor; readonly dispatch: Dispatch<CatalogEditorEvent>; readonly onSaved: (itemId: string) => void; readonly onConflict: () => void }) {
  const { mode, brandId, ownerToken, writesAvailable, editor, dispatch } = props;
  const { draft, base: current, saving: pending, notice } = editor;
  const inFlight = useRef(false);
  const blocker = catalogDraftBlocker(draft);
  const unchanged = current !== null && sameCatalogContent(draft, current.draft);
  const canWrite = mode === 'demo' || (writesAvailable && ownerToken !== null);
  const disabledReason = mode === 'real' && !writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này.'
    : mode === 'real' && !ownerToken ? 'Mở khóa OWNER cục bộ ở thanh phía trên để bật lưu và tải ảnh.'
    : pending ? 'Đang gửi yêu cầu…'
    : blocker ?? (unchanged ? 'Chưa có thay đổi so với phiên bản hiện tại.' : null);
  const edit = (patch: Partial<CatalogDraft>) => dispatch({ type: 'edit', draft: { ...draft, ...patch } });
  const editTier = (index: number, patch: Partial<TierDraft>) => edit({ tiers: draft.tiers.map((tier, position) => position === index ? { ...tier, ...patch } : tier) });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabledReason) return;
    if (mode === 'demo') {
      try {
        const id = current?.itemId ?? crypto.randomUUID(); const now = new Date().toISOString();
        props.setDemoItems(current ? reviseDemoItem(props.demoItems, id, current.version, draft, now) : createDemoItem(props.demoItems, brandId, draft, id, now));
        props.notify(current ? 'Đã lưu phiên bản minh họa mới.' : 'Đã thêm sản phẩm/dịch vụ minh họa.');
        props.onSaved(id);
      } catch { dispatch({ type: 'failed', conflict: false, message: 'Dữ liệu minh họa đã thay đổi. Hãy đặt lại demo.' }); }
      return;
    }
    inFlight.current = true; dispatch({ type: 'submitted' });
    try {
      const item = catalogRequestFromDraft(draft);
      const receipt = current
        ? await submitCatalogRevision({ brandId, itemId: current.itemId, expectedVersion: current.version, item, token: ownerToken! })
        : await submitCatalogCreate({ brandId, itemKey: editor.newKey ?? generatedItemKey(), item, token: ownerToken! });
      dispatch({ type: 'saved' });
      props.notify(receipt.exactRetry ? 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.' : current ? `Đã lưu phiên bản ${receipt.version}.` : 'Đã thêm sản phẩm/dịch vụ.');
      props.onSaved(receipt.itemId);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'conflict') { dispatch({ type: 'failed', conflict: true, message: '' }); props.onConflict(); }
      else if (error instanceof OwnerWriteError && error.kind === 'connection') dispatch({ type: 'failed', conflict: false, message: 'Kết nối không rõ kết quả. Form giữ nguyên nội dung; hãy gửi lại an toàn.' });
      else dispatch({ type: 'failed', conflict: false, message: error instanceof OwnerWriteError ? error.message : 'Không thể lưu sản phẩm/dịch vụ.' });
    } finally { inFlight.current = false; }
  };

  return <form className="brand-form catalog-form" onSubmit={(event) => void submit(event)} noValidate>
    <header className="brand-form-head">
      <div><h2>{current ? draft.name || 'Sản phẩm/dịch vụ' : 'Sản phẩm/dịch vụ mới'}</h2><p className="muted">{current ? `Phiên bản ${current.version}. Lưu sẽ tạo phiên bản mới; chiến dịch đã dùng phiên bản cũ không thay đổi.` : 'Tạo phiên bản 1.'}{mode === 'demo' ? ' Dữ liệu minh họa, chỉ tồn tại trong phiên này.' : ''}</p></div>
    </header>
    <fieldset className="catalog-fields" disabled={pending}>
      <legend className="visually-hidden">Thông tin chung</legend>
      <div className="field"><span id="item-type-label">Loại</span>
        <div className="segmented" role="radiogroup" aria-labelledby="item-type-label">
          {ITEM_TYPES.map((type) => <button key={type.key} type="button" role="radio" aria-checked={draft.itemType === type.key} className={draft.itemType === type.key ? 'on' : ''} onClick={() => edit({ itemType: type.key })}>{type.label}</button>)}
        </div>
      </div>
      <label className="field">Tên<input className="search" value={draft.name} onChange={(event) => edit({ name: event.target.value })} maxLength={120} required /></label>
      <label className="field">Mô tả chung<textarea className="search" value={draft.description} onChange={(event) => edit({ description: event.target.value })} maxLength={2000} /></label>
    </fieldset>
    <fieldset className="tiers" disabled={pending}>
      <legend>Gói / phiên bản</legend>
      {draft.tiers.length === 0 ? <p className="muted">Chưa có gói. Thêm gói khi sản phẩm có nhiều quy cách hoặc dịch vụ có nhiều mức (ví dụ 30 viên / 60 viên, Go / Plus / Pro).</p>
        : <div className="table-scroll"><table className="tiers-table">
          <thead><tr><th scope="col">Gói</th><th scope="col">Giá</th><th scope="col">Bao gồm <small>(mỗi dòng một ý)</small></th><th scope="col"><span className="visually-hidden">Xóa</span></th></tr></thead>
          <tbody>{draft.tiers.map((tier, index) => <tr key={tier.tierKey}>
            <td><input className="search" aria-label={`Tên gói ${index + 1}`} value={tier.name} onChange={(event) => editTier(index, { name: event.target.value })} maxLength={80} /></td>
            <td><input className="search" aria-label={`Giá gói ${index + 1}`} value={tier.priceText} onChange={(event) => editTier(index, { priceText: event.target.value })} maxLength={80} placeholder="Ví dụ 99.000đ" /></td>
            <td><textarea className="search" aria-label={`Bao gồm của gói ${index + 1}`} value={tier.inclusionsText} onChange={(event) => editTier(index, { inclusionsText: event.target.value })} rows={2} /></td>
            <td><button className="icon-button" type="button" aria-label={`Bỏ gói ${tier.name || index + 1}`} onClick={() => edit({ tiers: draft.tiers.filter((_, position) => position !== index) })}>×</button></td>
          </tr>)}</tbody>
        </table></div>}
      <button className="button quiet" type="button" disabled={draft.tiers.length >= 8} onClick={() => edit({ tiers: [...draft.tiers, { tierKey: generatedTierKey(), name: '', priceText: '', inclusionsText: '' }] })}>+ Thêm gói</button>
    </fieldset>
    <fieldset className="photos" disabled={pending}>
      <legend>Ảnh sản phẩm</legend>
      <p className="muted">Ảnh thật của sản phẩm/dịch vụ. Ảnh bật “Dùng cho Poster” được chọn sẵn làm ảnh tham chiếu khi tạo Poster. PNG hoặc JPEG · tối đa 8 MB.</p>
      {draft.photos.length > 0 && <ul className="photo-grid">
        {draft.photos.map((photo, index) => <li key={photo.mediaSha256} className="photo-card">
          <img src={props.mediaSrc(photo.mediaSha256)} alt={`Ảnh ${index + 1} của ${draft.name || 'sản phẩm'}`} loading="lazy" />
          <label className="switch"><input type="checkbox" checked={photo.posterDefault} onChange={(event) => edit({ photos: draft.photos.map((entry, position) => position === index ? { ...entry, posterDefault: event.target.checked } : entry) })} /><span>Dùng cho Poster</span></label>
          <button className="button quiet" type="button" onClick={() => edit({ photos: draft.photos.filter((_, position) => position !== index) })}>Bỏ ảnh</button>
        </li>)}
      </ul>}
      <MediaUpload mode={mode} brandId={brandId} kind="PHOTO" token={ownerToken} multiple disabled={pending || !canWrite || draft.photos.length >= 12} label="+ Thêm ảnh"
        onDemoMedia={props.addDemoMedia}
        onUploaded={(mediaSha256) => dispatch({ type: 'update', update: (latest) => ({ ...latest, photos: addPhoto(latest.photos, mediaSha256) }) })} />
    </fieldset>
    {notice && <div className="form-error brand-notice" role="alert">{noticeText(notice)}
      {notice.kind === 'rebased' && <button className="button" type="button" onClick={() => dispatch({ type: 'discard' })}>Bỏ thay đổi, dùng phiên bản {notice.toVersion}</button>}
    </div>}
    <div className="form-actions">
      <button className="button primary" type="submit" disabled={disabledReason !== null} aria-describedby="catalog-save-note">{pending ? 'Đang lưu…' : current ? 'Lưu phiên bản mới' : 'Tạo sản phẩm/dịch vụ'}</button>
      {current && <button className="button" type="button" disabled={pending || unchanged} onClick={() => dispatch({ type: 'discard' })}>Hoàn tác thay đổi</button>}
    </div>
    <p id="catalog-save-note" className="decision-note">{disabledReason ?? 'Sẵn sàng lưu.'}</p>
    {current && current.history.length > 0 && <section className="brand-history" aria-labelledby="catalog-history-title">
      <h3 id="catalog-history-title">Lịch sử phiên bản</h3>
      <ol className="timeline">{[...current.history].reverse().map((entry) => <li key={entry.version}><strong>Phiên bản {entry.version}</strong> · {entry.name}<small>{new Date(entry.createdAt).toLocaleString('vi-VN')}</small></li>)}</ol>
    </section>}
  </form>;
}

function addPhoto(photos: CatalogDraft['photos'], mediaSha256: string): CatalogDraft['photos'] {
  return photos.some((photo) => photo.mediaSha256 === mediaSha256) ? photos : [...photos, { mediaSha256, posterDefault: true }];
}

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu danh mục không vượt qua kiểm tra toàn vẹn.';
}
