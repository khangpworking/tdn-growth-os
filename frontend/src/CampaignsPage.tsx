import { useEffect, useReducer, useRef, useState } from 'react';
import type { Dispatch, FormEvent } from 'react';
import type {
  ContentBrandSummary,
  ContentCampaignSummary,
  ContentCatalogItemSummary,
} from '../../contracts/api/content-api.generated';
import { ContentDataSourceError, loadBrands } from './content-data-source';
import {
  loadCatalog,
  loadCatalogItem,
  type DemoCatalogItem,
} from './catalog-data-source';
import { OwnerWriteError } from './data-source';
import { noticeText } from './draft-editor';
import ConfirmDialog from './ConfirmDialog';
import {
  brandCounts,
  campaignDraftBlocker,
  campaignEditorReducer,
  campaignRequestFromDraft,
  changeDemoCampaignLifecycle,
  createDemoCampaign,
  demoCampaignDetail,
  demoCampaignList,
  draftFromCampaign,
  emptyCampaignDraft,
  generatedCampaignKey,
  itemLabel,
  loadCampaign,
  loadCampaigns,
  reviseDemoCampaign,
  sameCampaignContent,
  submitCampaignCreate,
  submitCampaignLifecycle,
  submitCampaignRevision,
  type CampaignDetail as CampaignDataDetail,
  type CampaignDraft,
  type CampaignEditor,
  type CampaignEditorEvent,
  type CampaignList,
  type DemoCampaign,
} from './campaign-data-source';
import { routeToHash } from './routing';

type LoadState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly message: string };

export interface CampaignCatalogOption {
  readonly itemId: string;
  readonly itemKey: string;
  readonly itemType: 'PHYSICAL' | 'SERVICE';
  readonly name: string;
  readonly version: number;
  readonly tiers: readonly { readonly tierKey: string; readonly name: string }[];
  readonly tiersUnavailable?: boolean;
}

type CampaignCatalogInput = CampaignCatalogOption | ContentCatalogItemSummary | DemoCatalogItem;

export interface ProductWorkspaceOption {
  readonly id: string;
  readonly name: string;
}

export interface CampaignsPageProps {
  readonly mode: 'real' | 'demo';
  readonly campaignId: string | null;
  readonly creating: boolean;
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly demoCampaigns: readonly DemoCampaign[];
  readonly setDemoCampaigns: (campaigns: DemoCampaign[]) => void;
  readonly demoBrands: readonly import('./content-data-source').DemoBrand[];
  readonly demoItems: readonly DemoCatalogItem[];
  readonly productWorkspaces: readonly ProductWorkspaceOption[];
  readonly navigate: (hash: string) => void;
  readonly notify: (message: string) => void;
}

export interface CampaignFormProps {
  readonly mode: 'real' | 'demo';
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly brands: readonly ContentBrandSummary[];
  readonly catalogItems: readonly CampaignCatalogInput[];
  readonly catalogLoading?: boolean;
  readonly catalogError?: string | null;
  readonly productWorkspaces: readonly ProductWorkspaceOption[];
  readonly editor: CampaignEditor;
  readonly dispatch: Dispatch<CampaignEditorEvent>;
  readonly onSaved: (campaignId: string) => void;
  readonly onConflict: () => void;
  readonly onCancel: () => void;
  readonly notify: (message: string) => void;
  readonly demoCampaigns: readonly DemoCampaign[];
  readonly setDemoCampaigns: (campaigns: DemoCampaign[]) => void;
}

export interface CampaignDetailProps {
  readonly mode: 'real' | 'demo';
  readonly ownerToken: string | null;
  readonly writesAvailable: boolean;
  readonly view: CampaignDataDetail;
  readonly brandName: string;
  readonly researchProductWorkspaceName?: string | null;
  readonly onEdit: () => void;
  readonly onLifecycle: (action: 'DELETE' | 'RESTORE') => void;
}

const formatDate = (value: string): string => new Date(value).toLocaleDateString('vi-VN');
const formatDateTime = (value: string): string => new Date(value).toLocaleDateString('vi-VN');
const DEMO_BANNER = 'Chế độ demo — dữ liệu chỉ lưu trong trình duyệt này.';
const CONFLICT_MESSAGE = 'Chiến dịch đã thay đổi ở nơi khác. Tải lại để xem bản mới — bản nháp của bạn vẫn được giữ.';

function failureMessage(error: unknown): string {
  if (error instanceof ContentDataSourceError && error.kind === 'connection') return 'Không thể kết nối API nội dung.';
  return 'Dữ liệu chiến dịch không vượt qua kiểm tra toàn vẹn.';
}

function canWrite(mode: 'real' | 'demo', ownerToken: string | null, writesAvailable: boolean): boolean {
  return mode === 'demo' || (writesAvailable && ownerToken !== null);
}

function brandSummary(brand: import('./content-data-source').DemoBrand): ContentBrandSummary {
  return { brandId: brand.brandId, brandKey: brand.brandKey, version: brand.version, brandName: brand.profile.brandName, updatedAt: brand.createdAt };
}

function demoCatalogOption(item: DemoCatalogItem): CampaignCatalogOption {
  return {
    itemId: item.itemId,
    itemKey: item.itemKey,
    itemType: item.item.itemType,
    name: item.item.name,
    version: item.version,
    tiers: item.item.tiers.map((tier) => ({ tierKey: tier.tierKey, name: tier.name })),
  };
}

function summaryCatalogOption(item: ContentCatalogItemSummary): CampaignCatalogOption {
  return {
    itemId: item.itemId,
    itemKey: item.itemKey,
    itemType: item.itemType,
    name: item.name,
    version: item.version,
    tiers: [],
    tiersUnavailable: true,
  };
}

function normalizeCatalogOption(item: CampaignCatalogInput): CampaignCatalogOption {
  if ('tiers' in item && Array.isArray(item.tiers)) return item as CampaignCatalogOption;
  if ('item' in item) return demoCatalogOption(item);
  return summaryCatalogOption(item as ContentCatalogItemSummary);
}

export function upgradeCampaignDraft(draft: CampaignDraft, item: Pick<CampaignCatalogOption, 'itemId' | 'version' | 'tiers'>): CampaignDraft {
  const keys = new Set(item.tiers.map((tier) => tier.tierKey));
  return { ...draft, items: draft.items.map((entry) => entry.itemId !== item.itemId ? entry : { ...entry, itemVersion: item.version, tierKeys: entry.tierKeys.filter((key) => keys.has(key)) }) };
}

function campaignTierOptions(item: CampaignCatalogOption, entry: CampaignDraft['items'][number], older: boolean, controlsDisabled: boolean, onToggle: (tierKey: string) => void) {
  if (item.tiersUnavailable) return <small className="muted">Không tải được danh sách gói — giữ nguyên lựa chọn gói hiện tại.</small>;
  if (older) return <small className="muted">Dùng phiên bản mới để đổi gói.</small>;
  if (item.tiers.length === 0) return null;
  return <><div className="tier-chips" role="group" aria-label={`Gói của ${item.name}`}>{item.tiers.map((tier) => <button key={tier.tierKey} className={entry.tierKeys.includes(tier.tierKey) ? 'on' : ''} disabled={controlsDisabled} type="button" aria-pressed={entry.tierKeys.includes(tier.tierKey)} onClick={() => onToggle(tier.tierKey)}>{tier.name}</button>)}</div>{entry.tierKeys.length === 0 && <small className="muted">Không chọn gói = tất cả các gói</small>}</>;
}

function findBrandName(brands: readonly ContentBrandSummary[], brandId: string): string {
  return brands.find((brand) => brand.brandId === brandId)?.brandName ?? brandId;
}

function listCampaigns(campaigns: readonly DemoCampaign[], items: readonly DemoCatalogItem[]): CampaignList {
  return demoCampaignList(campaigns, items as never);
}

function detailCampaign(campaigns: readonly DemoCampaign[], campaignId: string, items: readonly DemoCatalogItem[]): CampaignDataDetail | null {
  return demoCampaignDetail(campaigns, campaignId, items as never);
}

function CampaignListView(props: {
  readonly mode: 'real' | 'demo';
  readonly list: CampaignList | null;
  readonly brands: readonly ContentBrandSummary[];
  readonly filter: string | null;
  readonly onFilter: (brandId: string | null) => void;
  readonly canCreate: boolean;
  readonly onRestore: (campaign: ContentCampaignSummary) => void;
  readonly loading: boolean;
  readonly error: string | null;
}) {
  const { mode, list, brands, filter, onFilter, canCreate, onRestore, loading, error } = props;
  const campaigns = list?.campaigns ?? [];
  const active = campaigns.filter((campaign) => campaign.deleted === undefined);
  const deleted = campaigns.filter((campaign) => campaign.deleted !== undefined && (filter === null || campaign.brandId === filter));
  const visible = active.filter((campaign) => filter === null || campaign.brandId === filter);
  const counts = brandCounts(campaigns, brands);

  return <>
    {mode === 'demo' && <div className="demo-banner" role="note">{DEMO_BANNER}</div>}
    <div className="heading">
      <div><h1>Chiến dịch nội dung</h1><p>Chọn sản phẩm và gói để chuẩn bị cho các bước nội dung tiếp theo.</p></div>
      <a className="button primary" href={canCreate ? routeToHash.campaignNew() : undefined} aria-disabled={!canCreate} title={canCreate ? undefined : 'Chế độ OWNER đang khóa'}>+ Tạo chiến dịch</a>
    </div>
    {brands.length > 0 && <div className="campaign-filter" role="group" aria-label="Lọc theo thương hiệu">
      {counts.map((entry) => <button key={entry.brandId ?? 'all'} type="button" className={filter === entry.brandId ? 'on' : ''} aria-pressed={filter === entry.brandId} onClick={() => onFilter(entry.brandId)}>{entry.label} ({entry.count})</button>)}
    </div>}
    {loading && <p className="muted">Đang tải chiến dịch…</p>}
    {error && <div className="surface error" role="alert"><h2>Dữ liệu không vượt qua kiểm tra toàn vẹn</h2><p>{error}</p></div>}
    {!loading && !error && brands.length === 0
      ? <div className="surface empty"><h2>Chưa có thương hiệu. Hãy tạo thương hiệu trước khi tạo chiến dịch.</h2><a className="button" href={routeToHash.brands()}>Tạo thương hiệu</a></div>
      : !loading && !error && brands.length > 0 && visible.length === 0
        ? <div className="surface empty"><h2>Chưa có chiến dịch nào.</h2></div>
        : !loading && !error && visible.length > 0 && <div className="surface campaign-table"><table className="table"><thead><tr><th scope="col">Tên</th><th scope="col">Thương hiệu</th><th scope="col">Sản phẩm</th><th scope="col">Tiến độ</th><th scope="col">Cập nhật</th></tr></thead><tbody>{visible.map((campaign) => <tr key={campaign.campaignId}>
          <td><a href={routeToHash.campaign(campaign.campaignId)}><strong>{campaign.name}</strong></a><small>v{campaign.version}</small></td>
          <td>{findBrandName(brands, campaign.brandId)}</td>
          <td className="campaign-items">{campaign.items.map(itemLabel).join(', ')}</td>
          <td>Chưa có Insight</td>
          <td>{formatDateTime(campaign.updatedAt)}</td>
        </tr>)}</tbody></table></div>}
    {deleted.length > 0 && <section className="surface recently-deleted campaign-deleted" aria-labelledby="campaign-deleted-title">
      <div className="tools"><h2 id="campaign-deleted-title">Đã xóa gần đây</h2></div>
      <ul className="campaign-deleted-list">{deleted.map((campaign) => <li key={campaign.campaignId}><a href={routeToHash.campaign(campaign.campaignId)}><strong>{campaign.name}</strong><small>Khôi phục được đến {formatDate(campaign.deleted!.restorableUntil)}</small></a>{canCreate && <button className="button quiet" type="button" onClick={() => onRestore(campaign)}>Khôi phục</button>}</li>)}</ul>
    </section>}
  </>;
}

export function CampaignForm(props: CampaignFormProps) {
  const { mode, ownerToken, writesAvailable, brands, catalogItems, productWorkspaces, editor, dispatch } = props;
  const { draft, base: current, saving: pending, notice } = editor;
  const inFlight = useRef(false);
  const blocker = campaignDraftBlocker(draft);
  const unchanged = current !== null && sameCampaignContent(draft, current.draft);
  const writable = canWrite(mode, ownerToken, writesAvailable);
  const disabledReason = !writable
    ? mode === 'real' && !writesAvailable ? 'Ghi OWNER hiện không khả dụng trong runtime này.' : 'Mở khóa OWNER cục bộ ở thanh phía trên để bật lưu.'
    : pending ? 'Đang lưu…'
      : blocker ?? (unchanged ? 'Chưa có thay đổi so với phiên bản hiện tại.' : null);
  const brandName = findBrandName(brands, draft.brandId);
  const options = catalogItems.map(normalizeCatalogOption);
  const controlsDisabled = pending || !writable;
  const selected = (itemId: string) => draft.items.find((item) => item.itemId === itemId);
  const edit = (next: CampaignDraft) => { if (!pending) dispatch({ type: 'edit', draft: next }); };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current || disabledReason) return;
    if (mode === 'demo') {
      try {
        const id = current?.campaignId ?? crypto.randomUUID();
        const now = new Date().toISOString();
        props.setDemoCampaigns(current
          ? reviseDemoCampaign(props.demoCampaigns, id, current.version, draft, now)
          : createDemoCampaign(props.demoCampaigns, draft.brandId, draft, id, now));
        props.notify(current ? 'Đã lưu phiên bản chiến dịch minh họa mới.' : 'Đã tạo chiến dịch minh họa.');
        props.onSaved(id);
      } catch { dispatch({ type: 'failed', conflict: false, message: 'Chiến dịch minh họa đã thay đổi hoặc đã bị xóa.' }); }
      return;
    }
    inFlight.current = true;
    dispatch({ type: 'submitted' });
    try {
      const campaign = campaignRequestFromDraft(draft);
      const receipt = current
        ? await submitCampaignRevision({ campaignId: current.campaignId, expectedVersion: current.version, campaign, token: ownerToken! })
        : await submitCampaignCreate({ campaignKey: editor.newKey ?? generatedCampaignKey(), brandId: draft.brandId, campaign, token: ownerToken! });
      dispatch({ type: 'saved', version: receipt.version, id: receipt.campaignId });
      props.notify(receipt.exactRetry ? 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.' : current ? `Đã lưu phiên bản ${receipt.version}.` : 'Đã tạo chiến dịch.');
      props.onSaved(receipt.campaignId);
    } catch (error) {
      if (error instanceof OwnerWriteError && error.kind === 'conflict') { dispatch({ type: 'failed', conflict: true, message: '' }); props.onConflict(); }
      else if (error instanceof OwnerWriteError && error.kind === 'connection') dispatch({ type: 'failed', conflict: false, message: 'Kết nối không rõ kết quả. Form giữ nguyên nội dung; hãy gửi lại an toàn.' });
      else dispatch({ type: 'failed', conflict: false, message: error instanceof OwnerWriteError ? error.message : 'Không thể lưu chiến dịch.' });
    } finally { inFlight.current = false; }
  };

  const toggleItem = (item: CampaignCatalogOption) => {
    const currentItem = selected(item.itemId);
    edit({ ...draft, items: currentItem ? draft.items.filter((entry) => entry.itemId !== item.itemId) : [...draft.items, { itemId: item.itemId, itemVersion: item.version, tierKeys: [] }] });
  };
  const toggleTier = (itemId: string, tierKey: string) => {
    edit({ ...draft, items: draft.items.map((entry) => entry.itemId !== itemId ? entry : { ...entry, tierKeys: entry.tierKeys.includes(tierKey) ? entry.tierKeys.filter((key) => key !== tierKey) : [...entry.tierKeys, tierKey] }) });
  };
  const upgrade = (item: CampaignCatalogOption) => {
    if (item.tiersUnavailable) return;
    edit(upgradeCampaignDraft(draft, item));
  };

  return <form className="brand-form campaign-form" onSubmit={(event) => void submit(event)} noValidate>
    <header className="brand-form-head"><div><h2>{current ? `Sửa chiến dịch · tạo phiên bản ${current.version + 1}` : 'Chiến dịch mới'}</h2><p className="muted">{mode === 'demo' ? 'Dữ liệu minh họa, chỉ tồn tại trong phiên này.' : 'Chiến dịch dùng các phiên bản sản phẩm đã được ghim.'}</p></div></header>
    <fieldset className="catalog-fields" disabled={pending || !writable}>
      <legend className="visually-hidden">Thông tin chiến dịch</legend>
      {current ? <div className="field"><span>Thương hiệu</span><strong>{brandName}</strong></div> : <label className="field">Thương hiệu<select className="search" disabled={controlsDisabled} value={draft.brandId} onChange={(event) => edit({ ...draft, brandId: event.target.value, items: [] })}><option value="">Chọn thương hiệu</option>{brands.map((brand) => <option value={brand.brandId} key={brand.brandId}>{brand.brandName}</option>)}</select></label>}
      <label className="field">Tên chiến dịch<input className="search" disabled={controlsDisabled} value={draft.name} onChange={(event) => edit({ ...draft, name: event.target.value })} maxLength={120} required /></label>
      <label className="field">Mục tiêu<textarea className="search" disabled={controlsDisabled} value={draft.objective} onChange={(event) => edit({ ...draft, objective: event.target.value })} maxLength={1000} rows={4} /></label>
      <label className="field">Liên kết sản phẩm nghiên cứu<select className="search" disabled={controlsDisabled} value={draft.researchProductWorkspaceId} onChange={(event) => edit({ ...draft, researchProductWorkspaceId: event.target.value })}><option value="">Không liên kết</option>{productWorkspaces.map((workspace) => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</select></label>
    </fieldset>
    <fieldset className="campaign-items" disabled={pending || !writable}>
      <legend>Sản phẩm</legend>
      {!draft.brandId ? <p className="muted">Chọn thương hiệu để xem sản phẩm.</p>
        : props.catalogLoading ? <p className="muted">Đang tải sản phẩm…</p>
          : props.catalogError ? <p className="form-error" role="alert">{props.catalogError}</p>
              : options.length === 0 ? <p className="muted">Thương hiệu này chưa có sản phẩm. <a href={routeToHash.catalog(draft.brandId)}>Thêm sản phẩm</a></p>
              : <div className="campaign-item-picker">{options.map((item) => {
                const entry = selected(item.itemId);
                const older = entry !== undefined && entry.itemVersion < item.version;
                return <div className="campaign-item" key={item.itemId}>
                  <label><input type="checkbox" disabled={controlsDisabled} checked={entry !== undefined} onChange={() => toggleItem(item)} /> <strong>{item.name}</strong> <small>v{item.version}</small></label>
                  {entry && <div className="campaign-item-options">
                    {older && <div className="snapshot-warning"><span>Đang dùng phiên bản v{entry.itemVersion} — có phiên bản mới v{item.version}</span><button className="button quiet" disabled={controlsDisabled || item.tiersUnavailable} type="button" onClick={() => upgrade(item)}>Dùng phiên bản mới</button></div>}
                    {campaignTierOptions(item, entry, older, controlsDisabled, (tierKey) => toggleTier(item.itemId, tierKey))}
                  </div>}
                </div>;
              })}</div>}
    </fieldset>
    {notice && <div className="form-error brand-notice" role="alert">{notice.kind === 'stale' ? <><p>{CONFLICT_MESSAGE}</p><button className="button" type="button" onClick={props.onConflict}>Tải lại</button></> : <p>{noticeText(notice)}</p>}</div>}
    <div className="form-actions"><button className="button primary" type="submit" disabled={disabledReason !== null}>{pending ? 'Đang lưu…' : 'Lưu'}</button><button className="button" type="button" disabled={pending || !writable} onClick={props.onCancel}>Hủy</button></div>
    <p className="decision-note">{disabledReason ?? 'Sẵn sàng lưu.'}</p>
  </form>;
}

export function CampaignDetail(props: CampaignDetailProps) {
  const { view } = props;
  const [confirming, setConfirming] = useState(false);
  const writable = canWrite(props.mode, props.ownerToken, props.writesAvailable);
  const deleted = view.lifecycle.deleted;
  const expired = deleted ? Date.now() > Date.parse(deleted.restorableUntil) : false;
  return <article className="prompt-view campaign-detail-view">
    <header className="prompt-head"><div><h2>{view.campaign.campaign.name}</h2><p className="prompt-meta"><span>{props.brandName}</span><span>v{view.campaign.version}</span><span>{formatDateTime(view.campaign.createdAt)}</span></p></div><div className="prompt-actions">
      {!deleted && writable && <button className="button" type="button" onClick={props.onEdit}>Sửa</button>}
      {!deleted && writable && <details className="overflow-menu"><summary aria-label="Thêm thao tác">⋯</summary><button className="button quiet danger" type="button" onClick={() => setConfirming(true)}>Xóa</button></details>}
    </div></header>
    {!writable && <p className="decision-note">Mở khóa OWNER cục bộ ở thanh phía trên để sửa, xóa hoặc khôi phục chiến dịch.</p>}
    {confirming && !deleted && <ConfirmDialog titleId="campaign-delete-title" descriptionId="campaign-delete-description" title="Xóa chiến dịch này? Bạn có thể khôi phục trong 30 ngày." confirmLabel="Xóa" onCancel={() => setConfirming(false)} onConfirm={() => { setConfirming(false); props.onLifecycle('DELETE'); }}><p id="campaign-delete-description">Xóa chiến dịch này? Bạn có thể khôi phục trong 30 ngày.</p></ConfirmDialog>}
    {deleted && <div className="deleted-banner" role="status"><p>Chiến dịch đã bị xóa. Khôi phục được đến {formatDate(deleted.restorableUntil)}.</p>{!expired && writable && <button className="button" type="button" onClick={() => props.onLifecycle('RESTORE')}>Khôi phục</button>}</div>}
    <section className="campaign-objective"><h3>Mục tiêu</h3><p>{view.campaign.campaign.objective}</p></section>
    <section className="campaign-detail-items" aria-labelledby="campaign-products-title"><h3 id="campaign-products-title">Sản phẩm</h3><ul>{view.items.map((item) => <li key={item.itemId}><strong>{item.name}</strong> <small>v{item.itemVersion}</small><span>{item.tiers.length > 0 ? item.tiers.map((tier) => tier.name).join(', ') : 'Tất cả các gói'}</span></li>)}</ul></section>
    {props.researchProductWorkspaceName && <p className="muted">Liên kết sản phẩm nghiên cứu: <strong>{props.researchProductWorkspaceName}</strong></p>}
    <section className="campaign-steps" aria-label="Các bước chiến dịch">{[['Insight', 'có ở bước tiếp theo'], ['Big Idea', 'có ở bước tiếp theo'], ['Góc nội dung', 'có ở bước tiếp theo'], ['Caption & Poster', 'có ở bước tiếp theo']].map(([title, note]) => <button className="step" disabled type="button" key={title}><b>{title} — {note}</b></button>)}</section>
    <section className="brand-history" aria-labelledby="campaign-history-title"><h3 id="campaign-history-title">Lịch sử phiên bản</h3><ol className="timeline">{[...view.history].reverse().map((entry) => <li key={entry.version}>v{entry.version} · {entry.name} · {formatDateTime(entry.createdAt)}</li>)}</ol></section>
  </article>;
}

export default function CampaignsPage(props: CampaignsPageProps) {
  const { mode, campaignId, creating, demoCampaigns, demoItems, demoBrands } = props;
  const [brandsState, setBrandsState] = useState<LoadState<readonly ContentBrandSummary[]>>(mode === 'demo' ? { status: 'ready', value: [] } : { status: 'loading' });
  const [listState, setListState] = useState<LoadState<CampaignList>>(mode === 'demo' ? { status: 'ready', value: listCampaigns(demoCampaigns, demoItems) } : { status: 'loading' });
  const [detailState, setDetailState] = useState<LoadState<CampaignDataDetail | null>>({ status: 'loading' });
  const [editor, dispatch] = useReducer(campaignEditorReducer, null);
  const [editing, setEditing] = useState<'new' | 'edit' | null>(null);
  const [filter, setFilter] = useState<string | null>(null);
  const [catalogState, setCatalogState] = useState<LoadState<readonly CampaignCatalogOption[]>>({ status: 'ready', value: [] });
  const [reloadToken, setReloadToken] = useState(0);
  const reload = () => setReloadToken((value) => value + 1);
  const brandSummaries = mode === 'demo' ? demoBrands.map(brandSummary) : brandsState.status === 'ready' ? brandsState.value : [];
  const list = mode === 'demo' ? listCampaigns(demoCampaigns, demoItems) : listState.status === 'ready' ? listState.value : null;
  const detail = mode === 'demo' && campaignId ? detailCampaign(demoCampaigns, campaignId, demoItems) : detailState.status === 'ready' ? detailState.value : null;

  useEffect(() => {
    if (mode === 'demo') return;
    let active = true;
    setBrandsState({ status: 'loading' });
    loadBrands().then((value) => { if (active) setBrandsState({ status: 'ready', value }); }).catch((error: unknown) => { if (active) setBrandsState({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, reloadToken]);

  useEffect(() => {
    if (mode === 'demo') return;
    let active = true;
    setListState({ status: 'loading' });
    loadCampaigns().then((value) => { if (active) setListState({ status: 'ready', value }); }).catch((error: unknown) => { if (active) setListState({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, reloadToken]);

  useEffect(() => {
    if (!campaignId) { setDetailState({ status: 'ready', value: null }); return; }
    if (mode === 'demo') return;
    let active = true;
    setDetailState({ status: 'loading' });
    loadCampaign(campaignId).then((value) => { if (active) setDetailState({ status: 'ready', value }); }).catch((error: unknown) => { if (active) setDetailState({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, campaignId, reloadToken]);

  useEffect(() => {
    if (creating) {
      setEditing('new');
      dispatch({ type: 'new', key: generatedCampaignKey(), target: 'new' });
      dispatch({ type: 'edit', draft: emptyCampaignDraft() });
    } else setEditing(null);
  }, [creating, campaignId]);

  useEffect(() => {
    if (editing !== 'edit' || !campaignId || !detail) return;
    dispatch({ type: 'loaded', base: { campaignId: detail.campaign.campaignId, version: detail.campaign.version, draft: draftFromCampaign(detail), history: detail.history } });
  }, [editing, campaignId, detail?.campaign.version, mode, demoCampaigns, reloadToken]);

  const brandId = editor?.draft.brandId ?? '';
  useEffect(() => {
    if (!editor || !brandId) { setCatalogState({ status: 'ready', value: [] }); return; }
    if (mode === 'demo') { setCatalogState({ status: 'ready', value: demoItems.filter((item) => item.brandId === brandId).map(demoCatalogOption) }); return; }
    let active = true;
    setCatalogState({ status: 'loading' });
    loadCatalog(brandId).then(async (items) => {
      if (!items) return [];
      return Promise.all(items.map(async (item) => {
        try {
          const detailItem = await loadCatalogItem(brandId, item.itemId);
          if (detailItem) return { itemId: item.itemId, itemKey: item.itemKey, itemType: detailItem.item.item.itemType, name: detailItem.item.item.name, version: detailItem.item.version, tiers: detailItem.item.item.tiers.map((tier) => ({ tierKey: tier.tierKey, name: tier.name })) };
        } catch { /* the summary remains useful when a detail is unavailable */ }
        return summaryCatalogOption(item);
      }));
    }).then((items) => { if (active) setCatalogState({ status: 'ready', value: items }); }).catch((error: unknown) => { if (active) setCatalogState({ status: 'failed', message: failureMessage(error) }); });
    return () => { active = false; };
  }, [mode, brandId, demoItems, editor?.session, reloadToken]);

  const writable = canWrite(mode, props.ownerToken, props.writesAvailable);
  const restore = async (summary: ContentCampaignSummary) => {
    if (!writable) return;
    try {
      if (mode === 'demo') {
        const current = detailCampaign(demoCampaigns, summary.campaignId, demoItems);
        if (!current) throw new Error('Không tìm thấy chiến dịch.');
        props.setDemoCampaigns(changeDemoCampaignLifecycle(demoCampaigns, summary.campaignId, 'RESTORE', new Date().toISOString()));
      } else {
        const current = await loadCampaign(summary.campaignId);
        if (!current) throw new Error('Không tìm thấy chiến dịch.');
        await submitCampaignLifecycle({ campaignId: summary.campaignId, action: 'RESTORE', expectedSequence: current.lifecycle.sequence, token: props.ownerToken! });
      }
      props.notify('Đã khôi phục chiến dịch.');
      reload();
    } catch (error) { props.notify(error instanceof OwnerWriteError ? error.message : 'Không thể khôi phục chiến dịch.'); reload(); }
  };

  const changeLifecycle = async (action: 'DELETE' | 'RESTORE') => {
    if (!detail || !writable) return;
    try {
      if (mode === 'demo') props.setDemoCampaigns(changeDemoCampaignLifecycle(demoCampaigns, detail.campaign.campaignId, action, new Date().toISOString()));
      else await submitCampaignLifecycle({ campaignId: detail.campaign.campaignId, action, expectedSequence: detail.lifecycle.sequence, token: props.ownerToken! });
      props.notify(action === 'DELETE' ? 'Đã xóa chiến dịch. Có thể khôi phục trong 30 ngày.' : 'Đã khôi phục chiến dịch.');
      reload();
    } catch (error) { props.notify(error instanceof OwnerWriteError ? error.message : 'Không thể cập nhật chiến dịch.'); reload(); }
  };

  const formProps = editor ? {
    mode, ownerToken: props.ownerToken, writesAvailable: props.writesAvailable, brands: brandSummaries,
    catalogItems: catalogState.status === 'ready' ? catalogState.value : [], catalogLoading: catalogState.status === 'loading', catalogError: catalogState.status === 'failed' ? catalogState.message : null,
    productWorkspaces: props.productWorkspaces, editor, dispatch, demoCampaigns, setDemoCampaigns: props.setDemoCampaigns, notify: props.notify,
    onCancel: () => { setEditing(null); props.navigate(routeToHash.content()); }, onConflict: reload,
    onSaved: (id: string) => { setEditing(null); reload(); props.navigate(routeToHash.campaign(id)); },
  } satisfies CampaignFormProps : null;

  if (formProps && (creating || editing === 'new' || editing === 'edit')) return <CampaignForm {...formProps} />;
  if (creating || editing) return <p className="muted">Đang mở chiến dịch…</p>;
  if (campaignId) {
    if (mode === 'real' && detailState.status === 'loading') return <p className="muted">Đang tải chiến dịch…</p>;
    if (mode === 'real' && detailState.status === 'failed') return <section className="surface surface-pad prompt-detail"><p className="form-error" role="alert">{detailState.message}</p></section>;
    if (!detail) return <div className="surface empty"><h1>Không tìm thấy chiến dịch.</h1><a className="button" href={routeToHash.content()}>Về danh sách chiến dịch</a></div>;
    const researchName = detail.campaign.campaign.researchProductWorkspaceId ? props.productWorkspaces.find((workspace) => workspace.id === detail.campaign.campaign.researchProductWorkspaceId)?.name ?? detail.campaign.campaign.researchProductWorkspaceId : null;
    return <CampaignDetail mode={mode} ownerToken={props.ownerToken} writesAvailable={props.writesAvailable} view={detail} brandName={findBrandName(brandSummaries, detail.campaign.brandId)} researchProductWorkspaceName={researchName} onEdit={() => { setEditing('edit'); props.navigate(routeToHash.campaign(detail.campaign.campaignId)); }} onLifecycle={(action) => void changeLifecycle(action)} />;
  }
  return <CampaignListView mode={mode} list={list} brands={brandSummaries} filter={filter} onFilter={setFilter} canCreate={writable && brandSummaries.length > 0} onRestore={(summary) => void restore(summary)} loading={mode === 'real' && (brandsState.status === 'loading' || listState.status === 'loading')} error={mode === 'real' ? (brandsState.status === 'failed' ? brandsState.message : listState.status === 'failed' ? listState.message : null) : null} />;
}
