import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  candidatesForMarket,
  createSeedState,
  demoReducer,
  laneOrder,
  marketMatches,
  passCount,
  productsForMarket,
} from './model';
import type { Candidate, CandidateBasket, DecisionState, DemoState, LaneKey, LaneState, Market, Product, ProductSection, Scenario } from './model';
import { clearanceMatchesCurrent, exactCurrentPassDecisionIds, frontendMode, loadFrontendAvailability, loadRealWorkspaceState, ownerClearanceDisabled, ownerDecisionDisabled, OwnerWriteError, submitOwnerClearanceAndReload, submitOwnerDecisionAndReload, WorkspaceDataSourceError } from './data-source';
import type { FrontendMode, LoadFailure } from './data-source';
import ConfirmDialog from './ConfirmDialog';
import B9Editor from './B9Editor';
import B10DecisionPanel from './B10DecisionPanel';
import WorkspaceCreatePanel from './WorkspaceCreatePanel';
import CandidateEditor from './CandidateEditor';
import CandidateBasketPanel from './CandidateBasketPanel';
import B7DecisionPanel from './B7DecisionPanel';
import ProductWorkspaceCreatePanel from './ProductWorkspaceCreatePanel';
import BrandsPage from './BrandsPage';
import { createDemoBrand, emptyBrandDraft, type DemoBrand } from './content-data-source';
import { createDemoItem, emptyCatalogDraft, type DemoCatalogItem } from './catalog-data-source';
import PromptsPage from './PromptsPage';
import type { DemoPrompt } from './prompt-data-source';
import CampaignsPage from './CampaignsPage';
import InsightPage from './InsightPage';
import type { DemoInsight, DemoResearchProduct } from './insight-data-source';
import { createDemoCampaign, emptyCampaignDraft, type DemoCampaign } from './campaign-data-source';
import { parseRoute, routeToHash } from './routing';
import type { Route } from './routing';

const laneLabels: Record<LaneKey, string> = { LEGAL: 'Pháp lý', SCIENTIFIC: 'Khoa học', QUALITY: 'Chất lượng', FINANCE: 'Tài chính' };
const stateLabels: Record<LaneState, string> = { PASS: 'Đạt', HOLD: 'Tạm giữ', REJECT: 'Không đạt', NONE: 'Chưa đánh giá' };

function nowLabel(): string {
  return `${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · trong demo`;
}

function Badge({ state, children }: { readonly state: LaneState; readonly children?: ReactNode }) {
  return <span className={`badge ${state.toLowerCase()}`}>{children ?? stateLabels[state]}</span>;
}

function Arrow() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 12h14m-6-6 6 6-6 6" /></svg>;
}

function navigate(hash: string): void {
  if (window.location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else window.location.hash = hash;
}

function useRoute(state: DemoState): Route {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  useEffect(() => {
    if (parseRoute(hash, state).kind === 'invalid' && parseRoute(window.location.hash, state).kind !== 'invalid') setHash(window.location.hash);
  }, [hash, state]);
  return useMemo(() => parseRoute(hash, state), [hash, state]);
}

function Stats({ items }: { readonly items: readonly { label: string; value: number; note: string }[] }) {
  return <div className="stats">{items.map((item) => <div className="stat" key={item.label}><span>{item.label}</span><strong>{item.value.toString().padStart(2, '0')}</strong><small>{item.note}</small></div>)}</div>;
}

function ScenarioPreview({ scenario, restore }: { readonly scenario: Scenario; readonly restore: () => void }) {
  if (scenario === 'loading') return <div className="surface loading" role="status"><h1>Đang tải workspace</h1><progress aria-label="Đang tải" /><p>Đây là trạng thái chờ minh họa.</p></div>;
  if (scenario === 'error') return <div className="surface error"><h1>Chưa tải được workspace</h1><p>Không thể đọc dữ liệu lúc này. Hãy thử tải lại.</p><button className="button" onClick={restore}>Thử lại</button></div>;
  return <div className="surface empty"><h1>Chưa có workspace sản phẩm</h1><p>Sau khi chọn ứng viên ở B7, bạn có thể tạo hồ sơ sản phẩm độc lập. Dùng demo có sẵn để xem trước luồng này.</p><button className="button primary" onClick={restore}>Xem dữ liệu demo</button></div>;
}

function Portfolio({ state, mode, ownerToken, reloadReal, onCreate }: { readonly state: DemoState; readonly mode: FrontendMode; readonly ownerToken: string | null; readonly reloadReal: () => Promise<DemoState>; readonly onCreate: (id: string, name: string, description: string) => void }) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const filtered = state.markets.filter((market) => marketMatches(market, search));
  return <>
    <div className="heading"><div><h1>Các thị trường đang nghiên cứu</h1><p>Mỗi thị trường là một workspace khám phá riêng.</p></div><button className="button primary" onClick={() => setShowCreate(true)}>Create new research</button></div>
    {showCreate && <WorkspaceCreatePanel mode={mode} ownerToken={ownerToken} reloadReal={reloadReal} onCreated={(id) => { setShowCreate(false); navigate(routeToHash.market(id)); }} onCancel={() => setShowCreate(false)} onDemoCreate={onCreate} />}
    <Stats items={[
      { label: 'Thị trường', value: state.markets.length, note: 'Workspace khám phá' },
      { label: 'Ứng viên', value: state.candidates.length, note: 'Đang được khám phá' },
      { label: 'Hồ sơ sản phẩm', value: state.products.length, note: 'Đã tách sau B7' },
    ]} />
    <section className="surface market-table"><div className="tools"><h2>Danh sách thị trường</h2><input className="search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm thị trường hoặc từ khóa…" aria-label="Tìm thị trường" /></div>
      <table className="table"><thead><tr><th scope="col">Thị trường</th><th scope="col">Khám phá và sản phẩm</th><th scope="col">Chi tiết</th></tr></thead><tbody>{filtered.length > 0 ? filtered.map((market) => {
        const products = productsForMarket(state, market.id);
        const candidates = candidatesForMarket(state, market.id);
        return <tr key={market.id}><td><strong>{market.name}</strong><small>{market.keywords || 'Chưa có từ khóa'}</small></td><td><span className="market-counts">{candidates.length} ứng viên · {products.length} hồ sơ sản phẩm</span><small>{products.length ? 'Đang khám phá và thẩm định' : 'Khám phá cơ hội'}</small></td><td><button className="button quiet" onClick={() => navigate(routeToHash.market(market.id))} aria-label={`Mở ${market.name}`}>Mở thị trường <Arrow /></button></td></tr>;
      }) : <tr><td colSpan={3}><div className="empty"><h3>{search ? 'Không tìm thấy thị trường' : 'Portfolio đang trống'}</h3><p>{search ? 'Thử từ khóa khác hoặc xóa tìm kiếm.' : mode === 'real' ? 'Database hiện không có workspace khám phá đã xác minh. Dữ liệu demo không được tự động thay thế.' : 'Tạo workspace minh họa đầu tiên để bắt đầu.'}</p>{search && <button className="button" onClick={() => setSearch('')}>Xóa tìm kiếm</button>}</div></td></tr>}</tbody></table>
    </section><p className="caption">Chọn một thị trường để xem nghiên cứu chung, rổ cơ hội và các hồ sơ sản phẩm. Sản phẩm sau B7 giữ quyết định độc lập.</p>
  </>;
}

function MarketNavigation({ state, marketId, go = navigate }: { readonly state: DemoState; readonly marketId: string; readonly go?: (hash: string) => void }) {
  return <div className="market-navigation"><button className="button quiet" onClick={() => go(routeToHash.portfolio())}>Tất cả thị trường</button><label htmlFor="market-switch">Chuyển thị trường</label><select id="market-switch" value={marketId} onChange={(event) => go(routeToHash.market(event.target.value))}>{state.markets.map((market) => <option value={market.id} key={market.id}>{market.name}</option>)}</select></div>;
}

function Discovery({ state, market, mode, ownerToken, reloadReal, dispatch, notify }: { readonly state: DemoState; readonly market: Market; readonly mode: FrontendMode; readonly ownerToken:string|null; readonly reloadReal:()=>Promise<DemoState>; readonly dispatch:(action:Parameters<typeof demoReducer>[1])=>void; readonly notify:(message:string)=>void }) {
  const candidates = candidatesForMarket(state, market.id);
  const baskets = state.baskets.filter((basket) => basket.marketId === market.id);
  const [editing,setEditing]=useState<Candidate|'new'|null>(null);
  const [basketDraft,setBasketDraft]=useState<{familyKey?:string;candidateIds?:readonly string[]}|null>(null);
  const demoSave=(input:{id:string;key:string;name:string;summary:string;revision:boolean})=>{dispatch(input.revision?{type:'revise-candidate',id:input.id,name:input.name,summary:input.summary}:{type:'create-candidate',id:input.id,marketId:market.id,key:input.key,name:input.name,summary:input.summary});setEditing(null);notify(input.revision?'Đã tạo phiên bản ứng viên mới — chỉ trong demo.':'Đã tạo ứng viên tổng hợp — chỉ trong demo.');};
  const demoFreeze=(input:{id:string;key:string;version:number;candidateIds:readonly string[]})=>{dispatch({type:'freeze-basket',...input,marketId:market.id,time:nowLabel()});setBasketDraft(null);notify(`Đã đóng băng rổ ứng viên v${input.version} — chỉ trong demo.`);};
  return <section className="surface surface-pad discovery-section"><div className="heading compact"><div><h2>Khám phá và rổ cơ hội</h2><p className="muted">{market.note}</p></div><div className="heading-actions"><button className="button" disabled={candidates.length===0} onClick={()=>{setEditing(null);setBasketDraft({});}}>Đóng băng rổ ứng viên</button><button className="button primary" onClick={()=>{setBasketDraft(null);setEditing('new');}}>Thêm ứng viên</button></div></div>{editing&&<CandidateEditor key={editing==='new'?'new':editing.id} mode={mode} marketId={market.id} {...(editing==='new'?{}:{candidate:editing})} ownerToken={ownerToken} reloadReal={reloadReal} onSaved={()=>{setEditing(null);notify(editing==='new'?'Đã tạo ứng viên từ dữ liệu đã xác minh.':'Đã lưu phiên bản ứng viên mới từ dữ liệu đã xác minh.');}} onCancel={()=>setEditing(null)} onDemoSave={demoSave}/>} {basketDraft&&<CandidateBasketPanel key={`${basketDraft.familyKey ?? 'new'}-${basketDraft.candidateIds?.join('-') ?? ''}`} mode={mode} marketId={market.id} candidates={candidates} baskets={baskets} {...(basketDraft.familyKey ? { initialFamilyKey: basketDraft.familyKey } : {})} {...(basketDraft.candidateIds ? { initialCandidateIds: basketDraft.candidateIds } : {})} ownerToken={ownerToken} reloadReal={reloadReal} onSaved={()=>{setBasketDraft(null);notify('Đã đóng băng rổ ứng viên và tải lại snapshot từ dữ liệu đã xác minh.');}} onCancel={()=>setBasketDraft(null)} onDemoFreeze={demoFreeze}/>}<div className="candidate-list">{candidates.length > 0 ? candidates.map((candidate, index) => {
    const product = candidate.productId===null?undefined:state.products.find(item=>item.id===candidate.productId&&item.marketId===market.id&&item.candidateId===candidate.id);
    return <div className="candidate-item" key={candidate.id}><div><strong>{candidate.name}</strong><small>{mode === 'demo' ? `Ứng viên minh họa ${index + 1} · v${candidate.version}` : `Phiên bản đã xác minh · v${candidate.version}`}</small>{candidate.summary&&<small>{candidate.summary}</small>}{product&&<small>Workspace sản phẩm hiện có vẫn giữ snapshot của phiên bản ứng viên đã dùng tại B7. Phiên bản snapshot: v{candidate.productCandidateVersion}.</small>}</div><div className="candidate-actions"><Badge state="NONE">EXPLORING</Badge>{product && <Badge state="PASS">Đã có workspace sản phẩm độc lập</Badge>}<button className="button quiet" onClick={()=>{setBasketDraft(null);setEditing(candidate);}}>Chỉnh sửa</button>{product&&<button className="button quiet" onClick={()=>navigate(routeToHash.product(market.id,product.id))}>Mở hồ sơ từ v{product.candidateVersion}</button>}</div></div>;
  }) : <p className="muted">Chưa có ứng viên. Hãy thêm một ứng viên để ghi lại cơ hội đang khám phá.</p>}</div><BasketHistory mode={mode} marketId={market.id} baskets={baskets} candidates={candidates} ownerToken={ownerToken} reloadReal={reloadReal} onReconsider={(familyKey,candidateId)=>{setEditing(null);setBasketDraft({familyKey,candidateIds:[candidateId]});}} onSaved={()=>notify('Đã ghi quyết định B7 và tải lại trạng thái đã xác minh.')} onDemoDecision={(basketId,candidateId,candidateVersion,decision)=>{dispatch({type:'b7-decide',basketId,candidateId,candidateVersion,decision,time:nowLabel()});notify(`Đã ghi ${decision} — dữ liệu B7 tổng hợp chỉ trong demo.`);}} onDemoCreate={(basketId,candidateId,candidateVersion,decisionId,key)=>{dispatch({type:'create-product-workspace',workspaceId:market.id,key,basketId,candidateId,candidateVersion,decisionId,time:nowLabel()});notify('Đã tạo workspace sản phẩm — dữ liệu tổng hợp chỉ trong demo.');}}/><details><summary>Tài liệu và báo cáo nghiên cứu</summary><p>{mode === 'real' ? 'API hiện không cung cấp tài liệu hoặc báo cáo nghiên cứu; màn hình này không suy diễn rằng workspace không có báo cáo.' : 'Chưa gắn báo cáo trong demo. Mọi ứng viên, rổ và chỉnh sửa chỉ là dữ liệu tổng hợp trong phiên này; không gọi API hoặc nhà cung cấp.'}</p></details></section>;
}

function BasketHistory({ mode, marketId, baskets, candidates, ownerToken, reloadReal, onSaved, onReconsider, onDemoDecision, onDemoCreate }: { readonly mode:FrontendMode; readonly marketId:string; readonly baskets: readonly CandidateBasket[]; readonly candidates: readonly Candidate[]; readonly ownerToken:string|null; readonly reloadReal:()=>Promise<DemoState>; readonly onSaved:()=>void; readonly onReconsider:(familyKey:string,candidateId:string)=>void; readonly onDemoDecision:(basketId:string,candidateId:string,candidateVersion:number,decision:DecisionState)=>void; readonly onDemoCreate:(basketId:string,candidateId:string,candidateVersion:number,decisionId:string,key:string)=>void }) {
  const families = [...new Set(baskets.map((basket) => basket.key))].sort();
  return <section className="basket-history" aria-labelledby="basket-history-title"><div className="heading compact"><div><h3 id="basket-history-title">Các snapshot rổ ứng viên</h3><p>Mỗi nhóm rổ có lịch sử phiên bản riêng. Chỉnh sửa ứng viên sau này không thay đổi snapshot cũ.</p></div><Badge state={baskets.length ? 'PASS' : 'NONE'}>{baskets.length} snapshot</Badge></div>{baskets.length === 0 ? <p className="muted">Chưa có rổ ứng viên được đóng băng. Không có quyết định B7 nào được suy ra.</p> : <div className="basket-families">{families.map((key, familyIndex) => {
    const versions = baskets.filter((basket) => basket.key === key).sort((left, right) => right.version - left.version);
    return <section className="basket-family-history" key={key} aria-labelledby={`basket-family-${familyIndex}`}><header><h4 id={`basket-family-${familyIndex}`}>Rổ {familyIndex + 1}</h4><span>{versions.length} phiên bản bất biến</span></header><div className="basket-grid">{versions.map((basket, index) => <details className="basket-card" key={basket.id} open={index === 0}><summary><span><strong>Phiên bản {basket.version}</strong><small>{basket.frozenAt} · {basket.candidates.length} ứng viên</small></span>{index === 0 && <Badge state="NONE">Mới nhất</Badge>}</summary><ul>{basket.candidates.map((candidate) => <li key={candidate.candidateId}><div className="basket-member-main"><span className="field-label">Ứng viên</span><strong>{candidate.name}</strong>{candidate.summary && <p>{candidate.summary}</p>}<dl className="basket-metadata"><div><dt>Phiên bản đóng băng</dt><dd>v{candidate.candidateVersion}</dd></div><div><dt>Phiên bản hiện tại</dt><dd>{candidates.find((current) => current.id === candidate.candidateId) ? `v${candidates.find((current) => current.id === candidate.candidateId)!.version}` : 'Không khả dụng'}</dd></div></dl></div><div className="basket-member-actions"><span className="field-label">Quyết định B7</span><Badge state={candidate.b7State==='NO_DECISION'?'NONE':candidate.b7State}>{candidate.b7State==='NO_DECISION'?'Chưa quyết định':stateLabels[candidate.b7State]}</Badge>{candidate.b7DecidedAt&&<small>{candidate.b7DecidedAt}</small>}<B7DecisionPanel mode={mode} workspaceId={marketId} basket={basket} member={candidate} ownerToken={ownerToken} reloadReal={reloadReal} onSaved={onSaved} onReconsider={onReconsider} onDemoDecision={(decision)=>onDemoDecision(basket.id,candidate.candidateId,candidate.candidateVersion,decision)}/><ProductWorkspaceCreatePanel mode={mode} workspaceId={marketId} basket={basket} member={candidate} ownerToken={ownerToken} reloadReal={reloadReal} onSaved={onSaved} onDemoCreate={({productWorkspaceKey,decisionId})=>onDemoCreate(basket.id,candidate.candidateId,candidate.candidateVersion,decisionId,productWorkspaceKey)} onOpen={(id)=>navigate(routeToHash.product(marketId,id))}/></div></li>)}</ul><p>Snapshot bất biến · B7 và workspace sản phẩm luôn gắn với đúng phiên bản đóng băng</p></details>)}</div></section>;
  })}</div>}</section>;
}

function MarketWorkspace({ state, market, mode, ownerToken, reloadReal, dispatch, notify }: { readonly state: DemoState; readonly market: Market; readonly mode: FrontendMode; readonly ownerToken:string|null; readonly reloadReal:()=>Promise<DemoState>; readonly dispatch:(action:Parameters<typeof demoReducer>[1])=>void; readonly notify:(message:string)=>void }) {
  const [search, setSearch] = useState('');
  const products = productsForMarket(state, market.id);
  const filtered = products.filter((product) => product.name.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi')));
  const states = products.flatMap((product) => Object.values(product.states));
  const totals = { PASS: states.filter((value) => value === 'PASS').length, HOLD: states.filter((value) => value === 'HOLD').length, REJECT: states.filter((value) => value === 'REJECT').length, NONE: states.filter((value) => value === 'NONE').length };
  const distribution: readonly LaneState[] = ['PASS', 'HOLD', 'REJECT', 'NONE'];
  return <><MarketNavigation state={state} marketId={market.id} /><div className="heading"><div><h1>{market.name}</h1><p>Nghiên cứu chung, rổ cơ hội và hồ sơ sản phẩm của thị trường này.</p></div><Badge state="NONE">{products.length} workspace sản phẩm</Badge></div>
    <Stats items={[
      { label: 'Workspace sản phẩm', value: products.length, note: 'Tách biệt sau B7' },
      { label: 'Lane chưa đạt', value: states.length - totals.PASS, note: `Trong ${states.length} lane B8` },
      { label: 'B8 hiện có 4 Đạt', value: products.filter((product) => passCount(product) === 4).length, note: 'Có thể kiểm tra bước B9' },
    ]} />
    <div className="overview-grid"><section className="surface surface-pad"><h2>Bức tranh thẩm định</h2><p className="muted compact">Trạng thái hiện hành của {states.length} lane B8.</p><div className="distribution" role="img" aria-label={`${totals.PASS} đạt, ${totals.HOLD} tạm giữ, ${totals.REJECT} không đạt, ${totals.NONE} chưa đánh giá`}>{distribution.map((stateKey) => <div className="distribution-row" key={stateKey}><span>{stateLabels[stateKey]}</span><span className="track"><i className={`bar-${stateKey.toLowerCase()}`} style={{ width: `${states.length ? totals[stateKey] / states.length * 100 : 0}%` }} /></span><b>{totals[stateKey]}</b></div>)}</div><p className="legend-note">Mỗi sản phẩm có 4 lane độc lập. Biểu đồ đếm quyết định, không đánh giá chất lượng sản phẩm.</p></section>
      <section className="surface"><div className="tools"><h2>Hồ sơ sản phẩm</h2><input className="search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Tìm workspace" placeholder="Tìm workspace…" /></div><table className="table"><thead><tr><th scope="col">Workspace</th><th scope="col">Trạng thái</th><th scope="col">Chi tiết</th></tr></thead><tbody>{filtered.length > 0 ? filtered.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>B8 · {passCount(product)}/4 lane đạt</small></td><td><Badge state={passCount(product) === 4 ? 'PASS' : 'NONE'}>{passCount(product) === 4 ? '4 lane đạt' : Object.values(product.states).some((value) => value !== 'NONE') ? 'Đang thẩm định' : 'Chưa đánh giá'}</Badge></td><td><button className="button quiet" onClick={() => navigate(routeToHash.product(market.id, product.id))} aria-label={`Mở ${product.name}`}>Mở hồ sơ <Arrow /></button></td></tr>) : <tr><td colSpan={3}><div className="empty"><h3>{search ? 'Không tìm thấy workspace' : 'Chưa có hồ sơ sản phẩm'}</h3><p>{search ? 'Thử từ khóa khác hoặc xóa tìm kiếm.' : mode === 'real' ? 'Workspace khám phá này hiện chưa có hồ sơ sản phẩm độc lập đã xác minh. Không dùng dữ liệu demo để lấp trạng thái trống này.' : 'Các ứng viên vẫn có thể được nghiên cứu trong rổ cơ hội bên dưới. Hồ sơ sản phẩm chỉ xuất hiện sau bước chọn B7 và tạo workspace.'}</p>{search && <button className="button" onClick={() => setSearch('')}>Xóa tìm kiếm</button>}</div></td></tr>}</tbody></table></section>
    </div><Discovery state={state} market={market} mode={mode} ownerToken={ownerToken} reloadReal={reloadReal} dispatch={dispatch} notify={notify} />
  </>;
}

function ProductContent({ product, section, mode, selected, onSelect, b9Editor, b10Panel }: { readonly product: Product; readonly section: ProductSection; readonly mode: FrontendMode; readonly selected: LaneKey; readonly onSelect: (lane: LaneKey) => void; readonly b9Editor?: ReactNode; readonly b10Panel?: ReactNode }) {
  if (section === 'history') return <><h2>{mode === 'real' ? 'Quyết định B8 hiện hành' : 'Lịch sử quyết định B8'}</h2><p>{mode === 'real' ? 'API chỉ trả quyết định hiệu lực hiện tại của từng lane; lịch sử đầy đủ chưa được expose.' : 'Các quyết định trước được giữ lại khi bạn đổi trạng thái.'}</p>{product.history.length > 0 ? <ol className="timeline">{product.history.map((event) => <li key={event.id}><strong>{laneLabels[event.lane]}</strong> · {stateLabels[event.state]}<small>Chủ dự án · {event.time}</small></li>)}</ol> : <div className="empty"><h3>Chưa có quyết định</h3><p>Chọn một lane ở B8 để bắt đầu.</p></div>}</>;
  if (section === 'sources') return <><h2>Bằng chứng của hồ sơ</h2><p>Các tài liệu được gắn với đúng hồ sơ sẽ xuất hiện tại đây.</p><div className="evidence"><h3>Chưa có báo cáo được gắn</h3><p>{mode === 'real' ? 'API Task 034 chưa expose báo cáo thị trường hoặc review.' : 'Không có số liệu thị trường hoặc review thật trong demo này. Methodology và định dạng báo cáo B2 đang được chủ dự án chuẩn bị.'}</p></div><details><summary>Xem chi tiết kỹ thuật nguồn workspace</summary><p>Ứng viên kỹ thuật <code>{product.candidateId}</code> → B7 Đạt → workspace kỹ thuật <code>{product.id}</code>. {mode === 'real' ? 'Quan hệ định danh đã được backend xác minh.' : 'Chuỗi này chỉ minh họa cách hiển thị nguồn.'}</p></details></>;
  if (section === 'b9') return b9Editor ?? <B9View product={product} />;
  if (section === 'b10') return b10Panel ?? <B10View product={product} />;
  return <><h2>B8 · Thẩm định sản phẩm</h2><p>{mode === 'real' ? 'Chọn một lane để xem quyết định hiệu lực hiện tại. Khi OWNER khả dụng và được mở khóa, bạn có thể ghi quyết định tại bảng bên phải.' : 'Chọn một lane để xem và cập nhật quyết định minh họa.'}</p><div className="evidence"><h3>Tóm tắt ứng viên</h3><p>{product.summary}</p><div className="source-row"><span>Nguồn lựa chọn<b>Rổ v{product.basketVersion} · B7 Đạt · Ứng viên v{product.candidateVersion}</b></span><span>Bản tóm tắt<b>Giữ nguyên từ lúc tạo</b></span></div></div><div className="lanes" aria-label="Bốn lane thẩm định">{laneOrder.map((lane) => <button className={`lane ${selected === lane ? 'selected' : ''}`} key={lane} onClick={() => onSelect(lane)} aria-pressed={selected === lane}><span><strong>{laneLabels[lane]}</strong><small>{lane}</small></span><Badge state={product.states[lane]} /></button>)}</div></>;
}

function B9View({ product }: { readonly product: Product }) {
  const b9 = product.b9;
  if (b9.state === 'NOT_STARTED') return <><h2>B9 · STP</h2><div className="empty"><h3>Chưa có bản nháp</h3><p>Workspace chưa có bản nháp STP hoặc STP chính thức đã khóa.</p></div></>;
  const working = b9.working; const primary = working.segments.find((segment) => segment.key === working.primaryTargetKey)!; const secondary = working.secondaryTargetKeys.map((key) => working.segments.find((segment) => segment.key === key)!);
  return <><div className="heading compact"><div><h2>B9 · {b9.state === 'LOCKED' ? 'STP chính thức đã khóa' : 'Bản nháp đã lưu · Chưa khóa'}</h2><p>{b9.state === 'LOCKED' ? 'Nội dung bất biến được đóng băng tại thời điểm khóa.' : 'Bản nháp đã lưu nhưng chưa khóa. Lưu không tạo STP chính thức.'}</p></div><Badge state={b9.state === 'LOCKED' ? 'PASS' : 'HOLD'}>{b9.state === 'LOCKED' ? 'STP chính thức' : 'Bản nháp'}</Badge></div><div className="source-row"><span>Tạo lúc<b>{working.createdAt}</b></span><span>{b9.state === 'LOCKED' ? 'Khóa lúc' : 'Cập nhật lúc'}<b>{b9.state === 'LOCKED' ? b9.locked.lockedAt : working.updatedAt}</b></span></div><h3>Phân khúc theo thứ tự</h3><div className="segment-grid">{working.segments.map((segment, index) => <article className="segment-card" key={segment.key}><small>Phân khúc {index + 1}</small><strong>{segment.label}</strong>{segment.description && <p>{segment.description}</p>}{segment.key === primary.key && <span className="target-label">Mục tiêu chính</span>}{secondary.some((item) => item.key === segment.key) && <span className="target-label secondary">Mục tiêu phụ</span>}</article>)}</div><div className="evidence"><h3>Tuyên bố định vị</h3><p>{working.positioning}</p></div>{secondary.length === 0 && <p className="muted">Không có phân khúc mục tiêu phụ.</p>}</>;
}
function B10View({ product }: { readonly product: Product }) {
  const b10 = product.b10;
  if (!b10.effective) return <><h2>B10 · Danh mục và cấp vốn</h2><div className="empty"><h3>Chưa có quyết định B10</h3><p>Không có quyết định B10 hiệu lực hoặc lịch sử correction đã xác minh cho workspace này.</p></div></>;
  const labels = { APPROVE: 'Duyệt', HOLD: 'Tạm giữ', REJECT: 'Từ chối' } as const;
  return <><div className="heading compact"><div><h2>B10 · Quyết định hiệu lực</h2><p>Quyết định chung về danh mục và quyền đủ điều kiện nhận cấp vốn.</p></div><Badge state={b10.effective.decision === 'APPROVE' ? 'PASS' : b10.effective.decision}>{labels[b10.effective.decision]}</Badge></div><div className="evidence"><h3>{b10.readyForB11 ? 'Đã duyệt · Đủ điều kiện B11' : 'Chưa đủ điều kiện B11'}</h3><p>{b10.effective.decision === 'APPROVE' ? 'B11 chưa được triển khai. Duyệt chỉ cấp quyền tiếp tục quy trình; không chứng minh tiền đã được chuyển, ngân sách đã phân bổ hay việc thực thi đã xảy ra.' : 'Chỉ quyết định Duyệt hiệu lực mới tạo trạng thái đủ điều kiện B11; màn hình này không thực hiện hành động.'}</p></div><h3>Lịch sử quyết định bất biến</h3><ol className="timeline">{b10.history.map((event) => <li key={event.id}><strong>#{event.number} · {labels[event.decision]}</strong><small>{event.decidedAt}{event.previousId ? ' · correction của quyết định trước' : ' · quyết định đầu tiên'}</small></li>)}</ol></>;
}

function ProductWorkspace({ state, product, section, mode, writesAvailable, dispatch, notify, ownerToken, reloadReal }: { readonly state: DemoState; readonly product: Product; readonly section: ProductSection; readonly mode: FrontendMode; readonly writesAvailable: boolean; readonly dispatch: (action: Parameters<typeof demoReducer>[1]) => void; readonly notify: (message: string) => void; readonly ownerToken: string | null; readonly reloadReal: () => Promise<void> }) {
  const [selected, setSelected] = useState<LaneKey>('LEGAL');
  const [pending, setPending] = useState(false);
  const [writeMessage, setWriteMessage] = useState('');
  const [confirmClearance, setConfirmClearance] = useState(false);
  const [b9Dirty, setB9Dirty] = useState(false);
  const activeNav = useRef<HTMLButtonElement>(null);
  useEffect(() => { const button=activeNav.current,parent=button?.parentElement;if(!button||!parent)return;const left=button.offsetLeft-(parent.clientWidth-button.offsetWidth)/2;parent.scrollTo({left,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'}); }, [section]);
  const market = state.markets.find((item) => item.id === product.marketId)!;
  const decide = (decision: DecisionState) => {
    if (product.states[selected] === decision) return;
    dispatch({ type: 'decide', productId: product.id, lane: selected, decision, time: nowLabel() });
    notify(`Đã cập nhật ${laneLabels[selected]}: ${stateLabels[decision]} — chỉ trong demo.`);
  };
  const submitReal = async (decision: DecisionState) => {
    if (!ownerToken || pending || product.states[selected] === decision) return;
    setPending(true); setWriteMessage('');
    try {
      const outcome = await submitOwnerDecisionAndReload({ productWorkspaceId: product.id, lane: selected, expectedVersion: product.versions[selected], decision, token: ownerToken }, reloadReal);
      if (outcome === 'conflict') setWriteMessage('Một quyết định khác đã thay đổi lane. Trạng thái hiện tại đã được tải lại; hãy xem lại trước khi gửi.');
      else notify(`Đã ghi ${laneLabels[selected]}: ${stateLabels[decision]}. Dữ liệu đã được tải lại từ API chỉ đọc.`);
    } catch (error) {
      setWriteMessage(error instanceof OwnerWriteError ? error.message : 'Không thể ghi quyết định. Không có dữ liệu demo thay thế.');
    } finally { setPending(false); }
  };
  const clearance = () => { dispatch({ type: 'create-clearance', productId: product.id, time: nowLabel() }); notify('Đã tạo snapshot B8 minh họa. Bạn có thể xem bước B9.'); };
  const unmetLanes = laneOrder.filter((lane) => product.states[lane] !== 'PASS');
  const closeClearance = useCallback(() => setConfirmClearance(false), []);
  const submitClearance = async () => {
    const decisionIds = exactCurrentPassDecisionIds(product);
    if (!ownerToken || pending || !decisionIds) return;
    setPending(true); setConfirmClearance(false); setWriteMessage('');
    try {
      const outcome = await submitOwnerClearanceAndReload({ productWorkspaceId: product.id, decisionIds, token: ownerToken }, reloadReal);
      if (outcome === 'conflict') setWriteMessage('Một hoặc nhiều quyết định lane đã thay đổi. Trạng thái B8 hiện tại đã được tải lại; hãy xem lại trước khi xác nhận.');
      else notify('Đã xác nhận đủ điều kiện B9 bất biến. Dữ liệu đã xác minh đã được tải lại.');
    } catch (error) { setWriteMessage(error instanceof OwnerWriteError ? error.message : 'Không thể xác nhận clearance. Không có dữ liệu demo thay thế.'); }
    finally { setPending(false); }
  };
  const guardedNavigate = (hash: string) => { if (!b9Dirty || window.confirm('Bạn có thay đổi STP chưa lưu. Rời trang và bỏ các thay đổi này?')) navigate(hash); };
  const sections: readonly [ProductSection, string][] = [['b8', 'B8 · Thẩm định'], ['sources', 'Bằng chứng'], ['history', 'Lịch sử B8'], ['b9', 'B9 · Khóa STP'], ['b10', 'B10 · Phê duyệt']];
  return <><MarketNavigation state={state} marketId={market.id} go={guardedNavigate} /><nav className="crumb" aria-label="Đường dẫn"><button onClick={() => guardedNavigate(routeToHash.market(market.id))}>{market.name}</button><span aria-hidden="true">/</span><span>{product.name}</span></nav><div className="heading"><div><h1>{product.name}</h1><p>Hồ sơ sản phẩm độc lập · Bắt đầu từ B7 Đạt</p></div><Badge state="NONE">{mode === 'demo' ? 'Dữ liệu minh họa' : writesAvailable ? ownerToken ? 'Dữ liệu đã xác minh · Có quyền ghi OWNER' : 'Dữ liệu đã xác minh · OWNER đang khóa' : 'Dữ liệu đã xác minh · Chỉ xem'}</Badge></div>
    <div className="steps" aria-label="Các bước hồ sơ"><div className="step done"><b>B7 · Đã chọn</b><small>Ứng viên v{product.candidateVersion}</small></div><div className={`step ${section === 'b8' ? 'current' : product.clearance ? 'done' : ''}`}><b>B8 · Thẩm định</b><small>{passCount(product)}/4 lane đang Đạt</small></div><div className={`step ${section === 'b9' ? 'current' : product.b9.state === 'LOCKED' ? 'done' : ''}`}><b>B9 · Khóa STP</b><small>{product.b9.state === 'LOCKED' ? 'STP chính thức đã khóa' : product.b9.state === 'WORKING' ? 'Bản nháp đã lưu · Chưa khóa' : 'Chưa có bản nháp'}</small></div><div className={`step ${section === 'b10' ? 'current' : product.b10.readyForB11 ? 'done' : ''}`}><b>B10 · Phê duyệt</b><small>{product.b10.effective ? `${product.b10.effective.decision === 'APPROVE' ? 'Đã duyệt' : product.b10.effective.decision === 'HOLD' ? 'Tạm giữ' : 'Từ chối'} · hiệu lực` : 'Chưa có quyết định'}</small></div></div>
    <div className="dossier"><aside className="side"><div className="candidate"><span>Ứng viên v{product.candidateVersion}</span><h2>{product.name}</h2><p>Hồ sơ và quyết định được quản lý riêng.</p></div><nav className="product-nav" aria-label="Các phần hồ sơ">{sections.map(([key, label]) => <button ref={section === key ? activeNav : undefined} className={`nav-button ${section === key ? 'active' : ''}`} key={key} aria-current={section === key ? 'page' : undefined} onClick={() => guardedNavigate(routeToHash.product(market.id, product.id, key))}>{label}</button>)}</nav></aside>
      <section className="content"><ProductContent product={product} section={section} mode={mode} selected={selected} onSelect={setSelected} b9Editor={section === 'b9' && mode === 'real' ? <B9Editor product={product} ownerToken={ownerToken} writesAvailable={writesAvailable} reloadReal={reloadReal} notify={notify} onDirtyChange={setB9Dirty} navigateB10={() => guardedNavigate(routeToHash.product(market.id, product.id, 'b10'))} /> : undefined} b10Panel={section === 'b10' && mode === 'real' ? <B10DecisionPanel product={product} ownerToken={ownerToken} writesAvailable={writesAvailable} reloadReal={reloadReal} notify={notify} navigateB9={() => guardedNavigate(routeToHash.product(market.id, product.id, 'b9'))} /> : undefined} /></section>
      {section === 'b8' && <aside className="decision"><h2>{mode === 'real' ? 'Trạng thái B8' : 'Quyết định lane'}</h2><label htmlFor="lane" className="muted">Lane đang xem</label><select id="lane" value={selected} onChange={(event) => setSelected(event.target.value as LaneKey)}>{laneOrder.map((lane) => <option value={lane} key={lane}>{laneLabels[lane]}</option>)}</select><p>Hiện tại: <Badge state={product.states[selected]} /> · phiên bản {product.versions[selected]}</p><div className="decision-actions" aria-describedby="b8-action-guidance">{(['PASS', 'HOLD', 'REJECT'] as const).map((decision) => <button className={decision.toLowerCase()} key={decision} disabled={mode === 'demo' ? product.states[selected] === decision : !writesAvailable || ownerDecisionDisabled({ unlocked: ownerToken !== null, pending, effective: product.states[selected], decision })} onClick={() => mode === 'demo' ? decide(decision) : void submitReal(decision)}>{pending && mode === 'real' ? 'Đang gửi…' : stateLabels[decision]}</button>)}</div><p id="b8-action-guidance" className="decision-note">{mode === 'real' ? !writesAvailable ? 'Chức năng ghi OWNER không khả dụng trong runtime này.' : pending ? 'Yêu cầu đang được xử lý.' : ownerToken ? 'Đã mở khóa OWNER. Không nhập lý do; mỗi lần gửi dùng đúng phiên bản lane hiện tại.' : 'OWNER đang khóa. Mở khóa OWNER để ghi quyết định.' : 'Không cần nhập lý do. Đổi trạng thái sẽ thêm một quyết định vào lịch sử demo.'}</p>{writeMessage && <p className="snapshot-warning" role="alert">{writeMessage}</p>}<div className="snapshot"><h3>Điều kiện chuyển bước</h3><p><strong>{passCount(product)}/4 lane hiện đang Đạt</strong></p>{product.clearance ? <><p>Đã xác nhận đủ điều kiện B9 lúc {product.clearance.time}. Đây là snapshot lịch sử bất biến.</p>{!clearanceMatchesCurrent(product) && <p className="snapshot-warning">Lịch sử đánh giá B8 đã thay đổi sau khi xác nhận được ghi. Các lane hiện tại có thể vẫn đều Đạt nhưng dùng quyết định khác; xác nhận lịch sử, STP và quyết định sau đó vẫn được giữ nguyên. Không có yêu cầu duyệt lại được suy ra.</p>}<button className="button primary" onClick={() => guardedNavigate(routeToHash.product(market.id, product.id, 'b9'))}>Sang B9 <Arrow /></button></> : <><p>{unmetLanes.length ? <>Chưa đạt điều kiện: {unmetLanes.map((lane) => laneLabels[lane]).join(', ')} chưa có quyết định Đạt hiện hành.</> : 'Cả bốn lane đang Đạt. Cần xác nhận snapshot chính xác trước khi soạn B9.'}</p>{unmetLanes.map((lane)=><button key={lane} className="button quiet lane-link" onClick={()=>setSelected(lane)}>Xem {laneLabels[lane]}</button>)}{mode === 'demo' ? <button className="button primary" disabled={passCount(product) !== 4} onClick={clearance}>Xác nhận đủ điều kiện B9</button> : <button className="button primary" disabled={!writesAvailable || ownerClearanceDisabled({ unlocked: ownerToken !== null, pending, product })} onClick={() => setConfirmClearance(true)}>{pending ? 'Đang xác nhận…' : 'Xác nhận đủ điều kiện B9'}</button>}</>}</div>{confirmClearance && mode === 'real' && <ConfirmDialog titleId="clearance-confirm-title" descriptionId="clearance-confirm-description" title="Đóng băng bốn quyết định Đạt hiện tại?" confirmLabel="Xác nhận chính xác 4 lane Đạt" pending={pending} onCancel={closeClearance} onConfirm={() => void submitClearance()}><p id="clearance-confirm-description">Hành động này giữ chính xác bốn quyết định Đạt đang hiển thị làm xác nhận đủ điều kiện B9 bất biến. Nó không tạo STP, không tự chuyển bước và không thể thay thế.</p></ConfirmDialog>}</aside>}
      {section === 'b9' && <aside className="decision route-guidance"><h2>Hướng dẫn B9</h2><p><strong>{product.b9.state === 'LOCKED' ? 'STP chính thức đã khóa' : product.b9.state === 'WORKING' ? 'Bản nháp đã lưu · Chưa khóa' : 'Chưa có bản nháp'}</strong></p><p>{product.clearance ? 'Đã có xác nhận đủ điều kiện B9. Lưu chỉ cập nhật bản nháp; khóa mới cho phép quyết định B10.' : 'Chưa có xác nhận đủ điều kiện B9 từ B8. Về B8 để xem điều kiện còn thiếu.'}</p><button className="button" onClick={() => guardedNavigate(routeToHash.product(market.id, product.id, product.clearance ? 'b10' : 'b8'))}>{product.clearance ? 'Xem B10' : 'Về B8'}</button></aside>}
      {section === 'b10' && <aside className="decision route-guidance"><h2>Hướng dẫn B10</h2><p><strong>{product.b9.state === 'LOCKED' ? 'STP đã khóa' : 'STP chưa khóa'}</strong></p><p>{product.b10.readyForB11 ? 'Đã duyệt · Đủ điều kiện B11. B11 chưa được triển khai.' : product.b9.state !== 'LOCKED' ? 'Chưa thể quyết định B10 vì STP chưa khóa.' : 'Có thể xem hoặc ghi quyết định B10 khi OWNER khả dụng và đã mở khóa.'}</p>{product.b9.state !== 'LOCKED' && <button className="button" onClick={() => guardedNavigate(routeToHash.product(market.id, product.id, 'b9'))}>Về B9</button>}</aside>}
    </div></>;
}

function InvalidRoute({ hash }: { readonly hash: string }) {
  return <div className="surface empty invalid-route"><h1>Không tìm thấy workspace</h1><p>Đường dẫn <code>{hash || '#/'}</code> không khớp thị trường hoặc hồ sơ sản phẩm nào trong dữ liệu đang hiển thị.</p><button className="button primary" onClick={() => navigate(routeToHash.portfolio())}>Về tất cả thị trường</button></div>;
}

/** In-memory content for the synthetic demo; "Đặt lại demo" returns to exactly this. */
/** Research product view the Insight page needs: effective B10 decision and the locked STP primary target. */
export function researchProduct(product: Product): DemoResearchProduct & { readonly name: string } {
  const b10 = product.b10.effective?.decision ?? null;
  if (product.b9.state !== 'LOCKED') return { id: product.id, name: product.name, b10, stp: null };
  const working = product.b9.working;
  const primary = working.segments.find((segment) => segment.key === working.primaryTargetKey);
  return { id: product.id, name: product.name, b10, stp: primary ? { lockedStpId: product.b9.locked.id, customer: primary.label, insight: working.positioning } : null };
}

export function seedDemoContent(mode: FrontendMode): { brands: DemoBrand[]; items: DemoCatalogItem[]; media: Readonly<Record<string, string>>; prompts: DemoPrompt[]; campaigns: DemoCampaign[] } {
  if (mode !== 'demo') return { brands: [], items: [], media: {}, prompts: [], campaigns: [] };
  const seededBrandId = '00000000-0000-4000-8000-00000000b001';
  const seededItemId = '00000000-0000-4000-8000-00000000c001';
  const brands = createDemoBrand([], { ...emptyBrandDraft(), brandName: 'Canxi Việt (minh họa)', tagline: 'Xương chắc mỗi ngày', hotline: '0900 000 000', website: 'canxiviet.example' }, seededBrandId, '2026-09-01T00:00:00.000Z');
  const items = createDemoItem([], seededBrandId, { ...emptyCatalogDraft(), itemType: 'PHYSICAL', name: 'Canxi Nano D3K2 (minh họa)', description: 'Viên uống bổ sung canxi, vitamin D3 và K2.', tiers: [{ tierKey: 'hop-30', name: 'Hộp 30 viên', priceText: '320.000đ', inclusionsText: '30 viên' }, { tierKey: 'hop-60', name: 'Hộp 60 viên', priceText: '590.000đ', inclusionsText: '60 viên\nMiễn phí giao hàng' }] }, seededItemId, '2026-09-01T00:00:00.000Z');
  const campaigns = createDemoCampaign([], seededBrandId, { ...emptyCampaignDraft(seededBrandId), name: 'Chiến dịch canxi minh họa', objective: 'Tăng số cuộc tư vấn về sản phẩm.', items: [{ itemId: seededItemId, itemVersion: items[0]!.version, tierKeys: [] }] }, '00000000-0000-4000-8000-00000000d001', '2026-09-01T00:00:00.000Z');
  return { brands, items, media: {}, prompts: [], campaigns };
}

export default function App() {
  const mode = frontendMode(window.location.search);
  const [state, dispatch] = useReducer(demoReducer, undefined, () => mode === 'demo' ? createSeedState() : { markets: [], candidates: [], baskets: [], products: [], sequence: 1 });
  const [loadState, setLoadState] = useState<'loading' | 'ready' | LoadFailure>(mode === 'demo' ? 'ready' : 'loading');
  const route = useRoute(state);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [toast, setToast] = useState('');
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [ownerAvailability, setOwnerAvailability] = useState<'checking' | 'available' | 'unavailable'>(mode === 'demo' ? 'unavailable' : 'checking');
  const [tokenDraft, setTokenDraft] = useState('');
  const [demoBrands, setDemoBrands] = useState<DemoBrand[]>(() => seedDemoContent(mode).brands);
  const [demoItems, setDemoItems] = useState<DemoCatalogItem[]>(() => seedDemoContent(mode).items);
  const [demoMedia, setDemoMedia] = useState<Readonly<Record<string, string>>>({});
  const [demoPrompts, setDemoPrompts] = useState<DemoPrompt[]>([]);
  const [demoCampaigns, setDemoCampaigns] = useState<DemoCampaign[]>(() => seedDemoContent(mode).campaigns);
  const [demoInsights, setDemoInsights] = useState<DemoInsight[]>([]);
  const researchProducts = useMemo(() => state.products.map(researchProduct), [state.products]);
  const timer = useRef<number | undefined>(undefined);
  const main = useRef<HTMLElement>(null);
  const notify = (message: string) => {
    window.clearTimeout(timer.current);
    setToast(message);
    timer.current = window.setTimeout(() => setToast(''), 4500);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const reloadReal = async (): Promise<DemoState> => {
    const loaded = await loadRealWorkspaceState();
    dispatch({ type: 'replace', state: loaded }); setLoadState('ready'); return loaded;
  };
  useEffect(() => {
    if (mode === 'demo') return;
    let active = true; setLoadState('loading'); setOwnerAvailability('checking');
    loadRealWorkspaceState().then((loaded) => { if (active) { dispatch({ type: 'replace', state: loaded }); setLoadState('ready'); } }).catch((error: unknown) => { if (active) setLoadState(error instanceof WorkspaceDataSourceError ? error.kind : 'connection'); });
    loadFrontendAvailability().then((availability) => { if (active) setOwnerAvailability(availability.ownerWritesEnabled ? 'available' : 'unavailable'); }).catch(() => { if (active) setOwnerAvailability('unavailable'); });
    return () => { active = false; };
  }, [mode]);
  useEffect(() => { if (ownerAvailability !== 'available') { setOwnerToken(null); setTokenDraft(''); } }, [ownerAvailability]);
  useEffect(() => { main.current?.focus(); window.scrollTo(0, 0); }, [route.kind, route.kind === 'market' ? route.marketId : route.kind === 'product' ? `${route.productId}-${route.section}` : '']);
  const reset = () => {
    dispatch({ type: 'reset' });
    const seeded = seedDemoContent(mode);
    setDemoBrands(seeded.brands); setDemoItems(seeded.items); setDemoMedia(seeded.media); setDemoPrompts(seeded.prompts); setDemoCampaigns(seeded.campaigns); setDemoInsights([]);
    setScenario('normal');
    navigate(routeToHash.portfolio());
    notify('Đã đặt lại toàn bộ dữ liệu demo.');
  };
  const createMarket = (id: string, name: string, description: string) => {
    dispatch({ type: 'create-market', id, name, keywords: description });
    navigate(routeToHash.market(id));
    notify('Đã tạo thị trường minh họa. Chưa chạy nghiên cứu hoặc thu thập dữ liệu.');
  };
  let content: ReactNode;
  if (route.kind === 'prompts') content = <PromptsPage mode={mode} promptType={route.promptType} promptRef={route.promptRef} ownerToken={ownerToken} writesAvailable={mode === 'demo' || ownerAvailability === 'available'} demoPrompts={demoPrompts} setDemoPrompts={setDemoPrompts} navigate={navigate} notify={notify} />;
  else if (route.kind === 'content' || route.kind === 'campaign-new' || route.kind === 'campaign') content = <CampaignsPage mode={mode} campaignId={route.kind === 'campaign' ? route.campaignId : null} creating={route.kind === 'campaign-new'} ownerToken={ownerToken} writesAvailable={mode === 'demo' || ownerAvailability === 'available'} demoCampaigns={demoCampaigns} setDemoCampaigns={setDemoCampaigns} demoBrands={demoBrands} demoItems={demoItems} productWorkspaces={state.products.map((product) => ({ id: product.id, name: product.name }))} navigate={navigate} notify={notify} />;
  else if (route.kind === 'campaign-insight') content = <InsightPage key={route.campaignId} mode={mode} campaignId={route.campaignId} ownerToken={ownerToken} writesAvailable={mode === 'demo' || ownerAvailability === 'available'} demoCampaigns={demoCampaigns} demoItems={demoItems} demoInsights={demoInsights} setDemoInsights={setDemoInsights} researchProducts={researchProducts} notify={notify} />;
  else if (route.kind === 'brands' || route.kind === 'brand' || route.kind === 'catalog') content = <BrandsPage mode={mode} brandId={route.kind === 'brands' ? null : route.brandId} view={route.kind === 'catalog' ? 'catalog' : 'profile'} itemId={route.kind === 'catalog' ? route.itemId : null} ownerToken={ownerToken} writesAvailable={mode === 'demo' || ownerAvailability === 'available'} demoBrands={demoBrands} setDemoBrands={setDemoBrands} demoItems={demoItems} setDemoItems={setDemoItems} demoMedia={demoMedia} addDemoMedia={(mediaSha256, dataUrl) => setDemoMedia((prior) => ({ ...prior, [mediaSha256]: dataUrl }))} navigate={navigate} notify={notify} />;
  else if (mode === 'real' && loadState === 'loading') content = <ScenarioPreview scenario="loading" restore={() => undefined} />;
  else if (mode === 'real' && loadState !== 'ready') content = <div className="surface error"><h1>{loadState === 'integrity' ? 'Dữ liệu không vượt qua kiểm tra toàn vẹn' : 'Không thể kết nối API workspace'}</h1><p>{loadState === 'integrity' ? 'Ứng dụng đã đóng an toàn, không hiển thị dữ liệu một phần.' : 'Hãy kiểm tra API nội bộ và tải lại trang. Dữ liệu demo không được tự động thay thế.'}</p><a className="button" href="?mode=demo#/">Mở demo rõ nhãn</a></div>;
  else if (scenario !== 'normal' && route.kind !== 'product' && route.kind !== 'invalid') content = <ScenarioPreview scenario={scenario} restore={() => setScenario('normal')} />;
  else if (route.kind === 'portfolio') content = <Portfolio state={state} mode={mode} ownerToken={ownerToken} reloadReal={reloadReal} onCreate={createMarket} />;
  else if (route.kind === 'market') content = <MarketWorkspace state={state} market={state.markets.find((market) => market.id === route.marketId)!} mode={mode} ownerToken={ownerToken} reloadReal={reloadReal} dispatch={dispatch} notify={notify} />;
  else if (route.kind === 'product') content = <ProductWorkspace state={state} product={state.products.find((product) => product.id === route.productId)!} section={route.section} mode={mode} writesAvailable={mode === 'demo' || ownerAvailability === 'available'} dispatch={dispatch} notify={notify} ownerToken={ownerToken} reloadReal={async () => { await reloadReal(); }} />;
  else content = <InvalidRoute hash={route.hash} />;
  return <><button className="skip" type="button" onClick={() => { main.current?.focus(); main.current?.scrollIntoView(); }}>Bỏ qua điều hướng</button><header className="topbar"><div className="brand"><span className="mark">T</span><div><strong>TDN Growth OS</strong><small>Không gian phát triển sản phẩm</small></div></div><nav className="topnav" aria-label="Khu vực chính"><a href={routeToHash.portfolio()} aria-current={route.kind === 'portfolio' || route.kind === 'market' || route.kind === 'product' ? 'page' : undefined}>Thị trường</a><a href={routeToHash.content()} aria-current={route.kind === 'content' || route.kind === 'campaign-new' || route.kind === 'campaign' || route.kind === 'campaign-insight' ? 'page' : undefined}>Nội dung</a><a href={routeToHash.brands()} aria-current={route.kind === 'brands' || route.kind === 'brand' || route.kind === 'catalog' ? 'page' : undefined}>Thương hiệu</a><a href={routeToHash.prompts('BIG_IDEA')} aria-current={route.kind === 'prompts' ? 'page' : undefined}>Thư viện prompt</a></nav><div className="owner"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></svg>Chủ dự án</div></header><div className={`demo-bar ${mode === 'real' ? 'real-bar' : ''}`}><span>{mode === 'demo' ? 'Dữ liệu minh họa · Không phải quyết định thật · Chỉ tồn tại trong phiên demo' : ownerAvailability === 'checking' ? 'Dữ liệu thật · Đang kiểm tra khả năng ghi OWNER' : ownerAvailability === 'unavailable' ? 'Dữ liệu thật · Ghi OWNER hiện không khả dụng' : ownerToken ? 'OWNER cục bộ đã mở khóa trong bộ nhớ · Không phải đăng nhập production' : loadState === 'ready' ? 'Dữ liệu SQLite đã xác minh · OWNER cục bộ đang khóa' : 'OWNER API cục bộ khả dụng · Dữ liệu SQLite chưa sẵn sàng'}</span>{mode === 'demo' ? <button onClick={reset}>Đặt lại demo</button> : ownerAvailability !== 'available' ? null : ownerToken ? <button onClick={() => { setOwnerToken(null); setTokenDraft(''); notify('Đã khóa OWNER cục bộ và xóa token khỏi bộ nhớ.'); }}>Khóa</button> : <form className="unlock-form" onSubmit={(event) => { event.preventDefault(); if (tokenDraft.length < 32 || !/[A-Za-z]/.test(tokenDraft) || !/\d/.test(tokenDraft)) { notify('Token cục bộ phải có ít nhất 32 ký tự, gồm chữ và số.'); return; } setOwnerToken(tokenDraft); setTokenDraft(''); notify('Đã mở khóa OWNER cục bộ trong bộ nhớ phiên trang.'); }}><label htmlFor="owner-token">Unlock local OWNER actions</label><input id="owner-token" type="password" autoComplete="off" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="Token cục bộ" /><button type="submit">Mở khóa</button></form>}</div><main id="main" className="frame" tabIndex={-1} ref={main}><div className="view">{content}</div>{mode === 'demo' && route.kind !== 'product' && route.kind !== 'invalid' && route.kind !== 'brands' && route.kind !== 'brand' && route.kind !== 'catalog' && route.kind !== 'prompts' && route.kind !== 'content' && route.kind !== 'campaign-new' && route.kind !== 'campaign' && route.kind !== 'campaign-insight' && <div className="view-options"><label htmlFor="scenario">Xem trạng thái giao diện:</label><select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}><option value="normal">Có dữ liệu demo</option><option value="empty">Chưa có workspace</option><option value="loading">Đang tải</option><option value="error">Lỗi tải dữ liệu</option></select></div>}<p className="caption">{mode === 'demo' ? 'Frontend React demo · Mọi thao tác được đặt lại khi tải lại trang.' : 'Frontend React · Đọc dữ liệu qua API nội bộ; thao tác OWNER chỉ khả dụng khi runtime cục bộ cho phép và đã mở khóa trong bộ nhớ.'}</p></main><div className="toast" role="status" aria-live="polite">{toast}</div></>;
}
