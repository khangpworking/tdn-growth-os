import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import {
  candidatesForMarket,
  createSeedState,
  demoReducer,
  laneOrder,
  marketMatches,
  passCount,
  productsForMarket,
} from './model';
import type { DecisionState, DemoState, LaneKey, LaneState, Market, Product, ProductSection, Scenario } from './model';
import { clearanceMatchesCurrent, exactCurrentPassDecisionIds, frontendMode, loadRealWorkspaceState, ownerClearanceDisabled, ownerDecisionDisabled, OwnerWriteError, submitOwnerClearanceAndReload, submitOwnerDecisionAndReload, WorkspaceDataSourceError } from './data-source';
import type { FrontendMode, LoadFailure } from './data-source';
import B9Editor from './B9Editor';
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

function Portfolio({ state, mode, onCreate }: { readonly state: DemoState; readonly mode: FrontendMode; readonly onCreate: (id: string, name: string, keywords: string) => void }) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [formError, setFormError] = useState('');
  const filtered = state.markets.filter((market) => marketMatches(market, search));
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') ?? '').trim();
    if (!name) {
      setFormError('Tên thị trường không được chỉ chứa khoảng trắng.');
      return;
    }
    setFormError('');
    const id = `market-${state.sequence}-${Date.now().toString(36)}`;
    onCreate(id, name, String(data.get('keywords') ?? ''));
  };
  return <>
    <div className="heading"><div><h1>Các thị trường đang nghiên cứu</h1><p>Mỗi thị trường là một workspace khám phá riêng.</p></div>{mode === 'demo' && <button className="button primary" onClick={() => setShowCreate(true)}>Tạo nghiên cứu mới</button>}</div>
    {showCreate && <section className="surface surface-pad create-research"><h2>Tạo nghiên cứu minh họa</h2><p className="muted">Tạo workspace trống trong demo; chưa thu thập dữ liệu.</p><form onSubmit={submit}><label>Tên thị trường<input className="search" name="name" required maxLength={100} autoFocus placeholder="Ví dụ: Dinh dưỡng thể thao" /></label><label>Từ khóa ban đầu<input className="search" name="keywords" maxLength={180} placeholder="Ví dụ: protein, whey" /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="form-actions"><button className="button primary" type="submit">Tạo workspace demo</button><button className="button" type="button" onClick={() => setShowCreate(false)}>Hủy</button></div></form></section>}
    <Stats items={[
      { label: 'Thị trường', value: state.markets.length, note: 'Workspace khám phá' },
      { label: 'Ứng viên', value: state.candidates.length, note: 'Trong các rổ cơ hội' },
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

function Discovery({ state, market, mode }: { readonly state: DemoState; readonly market: Market; readonly mode: FrontendMode }) {
  const candidates = candidatesForMarket(state, market.id);
  return <section className="surface surface-pad discovery-section"><h2>Khám phá và rổ cơ hội</h2><p className="muted">{market.note}</p><div className="candidate-list">{candidates.length > 0 ? candidates.map((candidate, index) => {
    const hasProduct = candidate.productId !== null && state.products.some((product) => product.id === candidate.productId && product.marketId === market.id && product.candidateId === candidate.id);
    return <div className="candidate-item" key={candidate.id}><div><strong>{candidate.name}</strong><small>{mode === 'demo' ? `Ứng viên minh họa ${index + 1}` : `Phiên bản đã xác minh · v${candidate.version}`}</small></div><Badge state={hasProduct ? 'PASS' : 'NONE'}>{hasProduct ? 'Đã tách hồ sơ sau B7' : 'Đang khám phá'}</Badge></div>;
  }) : <p className="muted">Chưa có ứng viên. Bắt đầu bằng việc xác định phạm vi và bổ sung tài liệu nghiên cứu.</p>}</div><details><summary>Tài liệu và báo cáo nghiên cứu</summary><p>{mode === 'real' ? 'API Task 034 không cung cấp tài liệu hoặc báo cáo nghiên cứu; màn hình này không suy diễn rằng workspace không có báo cáo.' : 'Chưa gắn báo cáo trong demo. Mỗi thị trường có phạm vi và nguồn riêng. Methodology B2 đang chờ hoàn thiện; không tự chạy thu thập khi tạo thị trường.'}</p></details></section>;
}

function MarketWorkspace({ state, market, mode }: { readonly state: DemoState; readonly market: Market; readonly mode: FrontendMode }) {
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
    </div><Discovery state={state} market={market} mode={mode} />
  </>;
}

function ProductContent({ product, section, mode, selected, onSelect, b9Editor }: { readonly product: Product; readonly section: ProductSection; readonly mode: FrontendMode; readonly selected: LaneKey; readonly onSelect: (lane: LaneKey) => void; readonly b9Editor?: ReactNode }) {
  if (section === 'history') return <><h2>{mode === 'real' ? 'Quyết định B8 hiện hành' : 'Lịch sử quyết định B8'}</h2><p>{mode === 'real' ? 'API chỉ trả quyết định hiệu lực hiện tại của từng lane; lịch sử đầy đủ chưa được expose.' : 'Các quyết định trước được giữ lại khi bạn đổi trạng thái.'}</p>{product.history.length > 0 ? <ol className="timeline">{product.history.map((event) => <li key={event.id}><strong>{laneLabels[event.lane]}</strong> · {stateLabels[event.state]}<small>Chủ dự án · {event.time}</small></li>)}</ol> : <div className="empty"><h3>Chưa có quyết định</h3><p>Chọn một lane ở B8 để bắt đầu.</p></div>}</>;
  if (section === 'sources') return <><h2>Bằng chứng của hồ sơ</h2><p>Các tài liệu được gắn với đúng hồ sơ sẽ xuất hiện tại đây.</p><div className="evidence"><h3>Chưa có báo cáo được gắn</h3><p>{mode === 'real' ? 'API Task 034 chưa expose báo cáo thị trường hoặc review.' : 'Không có số liệu thị trường hoặc review thật trong demo này. Methodology và định dạng báo cáo B2 đang được chủ dự án chuẩn bị.'}</p></div><details><summary>Xem nguồn hình thành workspace</summary><p>Ứng viên ID <code>{product.candidateId}</code> → B7 Đạt → Workspace sản phẩm ID <code>{product.id}</code>. {mode === 'real' ? 'Quan hệ ID đã được backend xác minh.' : 'Chuỗi này chỉ minh họa cách hiển thị nguồn.'}</p></details></>;
  if (section === 'b9') return b9Editor ?? <B9View product={product} />;
  if (section === 'b10') return <B10View product={product} />;
  return <><h2>B8 · Thẩm định sản phẩm</h2><p>{mode === 'real' ? 'Chọn một lane để xem quyết định hiệu lực hiện tại. Chế độ này không cập nhật dữ liệu.' : 'Chọn một lane để xem và cập nhật quyết định minh họa.'}</p><div className="evidence"><h3>Tóm tắt ứng viên</h3><p>{product.summary}</p><div className="source-row"><span>Nguồn lựa chọn<b>B7 · Đạt · Ứng viên v{product.candidateVersion}</b></span><span>Bản tóm tắt<b>Giữ nguyên từ lúc tạo</b></span></div></div><div className="lanes" aria-label="Bốn lane thẩm định">{laneOrder.map((lane) => <button className={`lane ${selected === lane ? 'selected' : ''}`} key={lane} onClick={() => onSelect(lane)} aria-pressed={selected === lane}><span><strong>{laneLabels[lane]}</strong><small>{lane}</small></span><Badge state={product.states[lane]} /></button>)}</div></>;
}

function B9View({ product }: { readonly product: Product }) {
  const b9 = product.b9;
  if (b9.state === 'NOT_STARTED') return <><h2>B9 · STP</h2><div className="empty"><h3>Chưa bắt đầu STP</h3><p>Workspace chưa có bản STP đang soạn hoặc bản khóa chính thức đã xác minh.</p></div></>;
  const working = b9.working; const primary = working.segments.find((segment) => segment.key === working.primaryTargetKey)!; const secondary = working.secondaryTargetKeys.map((key) => working.segments.find((segment) => segment.key === key)!);
  return <><div className="heading compact"><div><h2>B9 · {b9.state === 'LOCKED' ? 'STP chính thức đã khóa' : 'Bản STP đang soạn'}</h2><p>{b9.state === 'LOCKED' ? 'Nội dung bất biến được đóng băng tại thời điểm khóa.' : 'Đây là working draft có thể thay đổi ở quy trình khác; màn hình này hoàn toàn chỉ đọc.'}</p></div><Badge state={b9.state === 'LOCKED' ? 'PASS' : 'HOLD'}>{b9.state === 'LOCKED' ? 'LOCKED_STP' : 'WORKING'}</Badge></div><div className="source-row"><span>Tạo lúc<b>{working.createdAt}</b></span><span>{b9.state === 'LOCKED' ? 'Khóa lúc' : 'Cập nhật lúc'}<b>{b9.state === 'LOCKED' ? b9.locked.lockedAt : working.updatedAt}</b></span></div><h3>Phân khúc theo thứ tự</h3><div className="segment-grid">{working.segments.map((segment, index) => <article className="segment-card" key={segment.key}><small>Phân khúc {index + 1}</small><strong>{segment.label}</strong>{segment.description && <p>{segment.description}</p>}{segment.key === primary.key && <span className="target-label">Mục tiêu chính</span>}{secondary.some((item) => item.key === segment.key) && <span className="target-label secondary">Mục tiêu phụ</span>}</article>)}</div><div className="evidence"><h3>Tuyên bố định vị</h3><p>{working.positioning}</p></div>{secondary.length === 0 && <p className="muted">Không có phân khúc mục tiêu phụ.</p>}</>;
}
function B10View({ product }: { readonly product: Product }) {
  const b10 = product.b10;
  if (!b10.effective) return <><h2>B10 · Danh mục và cấp vốn</h2><div className="empty"><h3>Chưa có quyết định B10</h3><p>Không có quyết định B10 hiệu lực hoặc lịch sử correction đã xác minh cho workspace này.</p></div></>;
  const labels = { APPROVE: 'Duyệt', HOLD: 'Tạm giữ', REJECT: 'Từ chối' } as const;
  return <><div className="heading compact"><div><h2>B10 · Quyết định hiệu lực</h2><p>Quyết định chung về danh mục và quyền đủ điều kiện nhận cấp vốn.</p></div><Badge state={b10.effective.decision === 'APPROVE' ? 'PASS' : b10.effective.decision}>{labels[b10.effective.decision]}</Badge></div><div className="evidence"><h3>{b10.readyForB11 ? 'Sẵn sàng cho B11' : 'Chưa sẵn sàng cho B11'}</h3><p>{b10.effective.decision === 'APPROVE' ? 'APPROVE chỉ cấp quyền tiếp tục quy trình. Nó không chứng minh tiền đã được chuyển, ngân sách đã được phân bổ hay việc thực thi đã xảy ra.' : 'Chỉ quyết định APPROVE hiệu lực mới tạo trạng thái sẵn sàng cho B11; màn hình này không thực hiện hành động.'}</p></div><h3>Lịch sử correction bất biến</h3><ol className="timeline">{b10.history.map((event) => <li key={event.id}><strong>#{event.number} · {labels[event.decision]}</strong><small>{event.decidedAt}{event.previousId ? ' · correction của quyết định trước' : ' · quyết định đầu tiên'}</small></li>)}</ol></>;
}

function ProductWorkspace({ state, product, section, mode, dispatch, notify, ownerToken, reloadReal }: { readonly state: DemoState; readonly product: Product; readonly section: ProductSection; readonly mode: FrontendMode; readonly dispatch: (action: Parameters<typeof demoReducer>[1]) => void; readonly notify: (message: string) => void; readonly ownerToken: string | null; readonly reloadReal: () => Promise<void> }) {
  const [selected, setSelected] = useState<LaneKey>('LEGAL');
  const [pending, setPending] = useState(false);
  const [writeMessage, setWriteMessage] = useState('');
  const [confirmClearance, setConfirmClearance] = useState(false);
  const [b9Dirty, setB9Dirty] = useState(false);
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
  const submitClearance = async () => {
    const decisionIds = exactCurrentPassDecisionIds(product);
    if (!ownerToken || pending || !decisionIds) return;
    setPending(true); setConfirmClearance(false); setWriteMessage('');
    try {
      const outcome = await submitOwnerClearanceAndReload({ productWorkspaceId: product.id, decisionIds, token: ownerToken }, reloadReal);
      if (outcome === 'conflict') setWriteMessage('Một hoặc nhiều quyết định lane đã thay đổi. Trạng thái B8 hiện tại đã được tải lại; hãy xem lại trước khi xác nhận.');
      else notify('Đã xác nhận clearance B8 bất biến. Dữ liệu đã được tải lại từ API chỉ đọc.');
    } catch (error) { setWriteMessage(error instanceof OwnerWriteError ? error.message : 'Không thể xác nhận clearance. Không có dữ liệu demo thay thế.'); }
    finally { setPending(false); }
  };
  const guardedNavigate = (hash: string) => { if (!b9Dirty || window.confirm('Bạn có thay đổi STP chưa lưu. Rời trang và bỏ các thay đổi này?')) navigate(hash); };
  const sections: readonly [ProductSection, string][] = [['b8', 'B8 · Thẩm định'], ['sources', 'Bằng chứng'], ['history', 'Lịch sử B8'], ['b9', 'B9 · Khóa STP'], ['b10', 'B10 · Phê duyệt']];
  return <><MarketNavigation state={state} marketId={market.id} go={guardedNavigate} /><nav className="crumb" aria-label="Đường dẫn"><button onClick={() => guardedNavigate(routeToHash.market(market.id))}>{market.name}</button><span aria-hidden="true">/</span><span>{product.name}</span></nav><div className="heading"><div><h1>{product.name}</h1><p>Hồ sơ sản phẩm độc lập · Bắt đầu từ B7 Đạt</p></div><Badge state="NONE">{mode === 'demo' ? 'Dữ liệu minh họa' : 'Dữ liệu đã xác minh · chỉ đọc'}</Badge></div>
    <div className="steps" aria-label="Các bước hồ sơ"><div className="step done"><b>B7 · Đã chọn</b><small>Ứng viên v{product.candidateVersion}</small></div><div className={`step ${section === 'b8' ? 'current' : product.clearance ? 'done' : ''}`}><b>B8 · Thẩm định</b><small>{passCount(product)}/4 lane đang Đạt</small></div><div className={`step ${section === 'b9' ? 'current' : product.b9.state === 'LOCKED' ? 'done' : ''}`}><b>B9 · Khóa STP</b><small>{product.b9.state === 'LOCKED' ? 'Đã khóa chính thức' : product.b9.state === 'WORKING' ? 'Đang soạn' : 'Chưa bắt đầu'}</small></div><div className={`step ${section === 'b10' ? 'current' : product.b10.readyForB11 ? 'done' : ''}`}><b>B10 · Phê duyệt</b><small>{product.b10.effective ? `${product.b10.effective.decision} hiệu lực` : 'Chưa có quyết định'}</small></div></div>
    <div className="dossier"><aside className="side"><div className="candidate"><span>Ứng viên v{product.candidateVersion}</span><h2>{product.name}</h2><p>Hồ sơ và quyết định được quản lý riêng.</p></div><nav aria-label="Các phần hồ sơ">{sections.map(([key, label]) => <button className={`nav-button ${section === key ? 'active' : ''}`} key={key} aria-current={section === key ? 'page' : undefined} onClick={() => guardedNavigate(routeToHash.product(market.id, product.id, key))}>{label}</button>)}</nav></aside>
      <section className="content"><ProductContent product={product} section={section} mode={mode} selected={selected} onSelect={setSelected} b9Editor={section === 'b9' && mode === 'real' ? <B9Editor product={product} ownerToken={ownerToken} reloadReal={reloadReal} notify={notify} onDirtyChange={setB9Dirty} navigateB10={() => guardedNavigate(routeToHash.product(market.id, product.id, 'b10'))} /> : undefined} /></section>
      <aside className="decision"><h2>{mode === 'real' ? 'Trạng thái B8' : 'Quyết định lane'}</h2><label htmlFor="lane" className="muted">Lane đang xem</label><select id="lane" value={selected} onChange={(event) => setSelected(event.target.value as LaneKey)}>{laneOrder.map((lane) => <option value={lane} key={lane}>{laneLabels[lane]}</option>)}</select><p>Hiện tại: <Badge state={product.states[selected]} /> · phiên bản {product.versions[selected]}</p><div className="decision-actions">{(['PASS', 'HOLD', 'REJECT'] as const).map((decision) => <button className={decision.toLowerCase()} key={decision} disabled={mode === 'demo' ? product.states[selected] === decision : ownerDecisionDisabled({ unlocked: ownerToken !== null, pending, effective: product.states[selected], decision })} onClick={() => mode === 'demo' ? decide(decision) : void submitReal(decision)}>{pending && mode === 'real' ? 'Đang gửi…' : stateLabels[decision]}</button>)}</div><p className="decision-note">{mode === 'real' ? ownerToken ? 'Đã mở khóa cục bộ. Không nhập lý do; mỗi lần gửi dùng đúng phiên bản lane hiện tại.' : 'Đang khóa · mở khóa OWNER cục bộ để bật ba nút quyết định.' : 'Không cần nhập lý do. Đổi trạng thái sẽ thêm một quyết định vào lịch sử demo.'}</p>{writeMessage && <p className="snapshot-warning" role="alert">{writeMessage}</p>}<div className="snapshot"><h3>Điều kiện chuyển bước</h3><p><strong>{passCount(product)}/4 PASS hiện tại</strong></p>{product.clearance ? <><p>Clearance bốn-PASS bất biến đã được xác nhận lúc {product.clearance.time}. Đây là bằng chứng lịch sử, không thay đổi theo đánh giá lane sau này.</p>{!clearanceMatchesCurrent(product) && <p className="snapshot-warning">B8 hiện tại đã khác bộ bốn quyết định PASS được đóng băng. Clearance lịch sử vẫn được giữ và không thể thay thế.</p>}<button className="button primary" onClick={() => navigate(routeToHash.product(market.id, product.id, 'b9'))}>Xem B9 <Arrow /></button></> : <><p>Cần bốn lane PASS và đủ bốn decision ID hiện tại để xác nhận.</p>{mode === 'demo' ? <button className="button primary" disabled={passCount(product) !== 4} onClick={clearance}>Xác nhận đủ điều kiện B9</button> : <button className="button primary" disabled={ownerClearanceDisabled({ unlocked: ownerToken !== null, pending, product })} onClick={() => setConfirmClearance(true)}>{pending ? 'Đang xác nhận…' : 'Confirm eligible for B9'}</button>}</>}</div>{confirmClearance && mode === 'real' && <div className="confirm-backdrop" role="presentation"><div className="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clearance-confirm-title"><h3 id="clearance-confirm-title">Đóng băng bốn quyết định PASS hiện tại?</h3><p>Hành động này xác nhận chính xác bốn decision ID đang hiển thị và tạo clearance READY_FOR_B9 bất biến. Nó không tạo STP, không chuyển workspace và không thể thay thế.</p><div className="confirm-actions"><button disabled={pending} onClick={() => setConfirmClearance(false)}>Hủy</button><button className="button primary" disabled={pending} onClick={() => void submitClearance()}>Xác nhận chính xác 4 PASS</button></div></div></div>}</aside>
    </div></>;
}

function InvalidRoute({ hash }: { readonly hash: string }) {
  return <div className="surface empty invalid-route"><h1>Không tìm thấy workspace</h1><p>Đường dẫn <code>{hash || '#/'}</code> không khớp thị trường hoặc hồ sơ sản phẩm nào trong dữ liệu đang hiển thị.</p><button className="button primary" onClick={() => navigate(routeToHash.portfolio())}>Về tất cả thị trường</button></div>;
}

export default function App() {
  const mode = frontendMode(window.location.search);
  const [state, dispatch] = useReducer(demoReducer, undefined, () => mode === 'demo' ? createSeedState() : { markets: [], candidates: [], products: [], sequence: 1 });
  const [loadState, setLoadState] = useState<'loading' | 'ready' | LoadFailure>(mode === 'demo' ? 'ready' : 'loading');
  const route = useRoute(state);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [toast, setToast] = useState('');
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  const [tokenDraft, setTokenDraft] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const main = useRef<HTMLElement>(null);
  const notify = (message: string) => {
    window.clearTimeout(timer.current);
    setToast(message);
    timer.current = window.setTimeout(() => setToast(''), 4500);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const reloadReal = async (): Promise<void> => {
    const loaded = await loadRealWorkspaceState();
    dispatch({ type: 'replace', state: loaded }); setLoadState('ready');
  };
  useEffect(() => {
    if (mode === 'demo') return;
    let active = true; setLoadState('loading');
    loadRealWorkspaceState().then((loaded) => { if (active) { dispatch({ type: 'replace', state: loaded }); setLoadState('ready'); } }).catch((error: unknown) => { if (active) setLoadState(error instanceof WorkspaceDataSourceError ? error.kind : 'connection'); });
    return () => { active = false; };
  }, [mode]);
  useEffect(() => { main.current?.focus(); window.scrollTo(0, 0); }, [route.kind, route.kind === 'market' ? route.marketId : route.kind === 'product' ? `${route.productId}-${route.section}` : '']);
  const reset = () => {
    dispatch({ type: 'reset' });
    setScenario('normal');
    navigate(routeToHash.portfolio());
    notify('Đã đặt lại toàn bộ dữ liệu demo.');
  };
  const createMarket = (id: string, name: string, keywords: string) => {
    dispatch({ type: 'create-market', id, name, keywords });
    navigate(routeToHash.market(id));
    notify('Đã tạo thị trường minh họa. Chưa chạy nghiên cứu hoặc thu thập dữ liệu.');
  };
  let content: ReactNode;
  if (mode === 'real' && loadState === 'loading') content = <ScenarioPreview scenario="loading" restore={() => undefined} />;
  else if (mode === 'real' && loadState !== 'ready') content = <div className="surface error"><h1>{loadState === 'integrity' ? 'Dữ liệu không vượt qua kiểm tra toàn vẹn' : 'Không thể kết nối API workspace'}</h1><p>{loadState === 'integrity' ? 'Ứng dụng đã đóng an toàn, không hiển thị dữ liệu một phần.' : 'Hãy kiểm tra API nội bộ và tải lại trang. Dữ liệu demo không được tự động thay thế.'}</p><a className="button" href="?mode=demo#/">Mở demo rõ nhãn</a></div>;
  else if (scenario !== 'normal' && route.kind !== 'product' && route.kind !== 'invalid') content = <ScenarioPreview scenario={scenario} restore={() => setScenario('normal')} />;
  else if (route.kind === 'portfolio') content = <Portfolio state={state} mode={mode} onCreate={createMarket} />;
  else if (route.kind === 'market') content = <MarketWorkspace state={state} market={state.markets.find((market) => market.id === route.marketId)!} mode={mode} />;
  else if (route.kind === 'product') content = <ProductWorkspace state={state} product={state.products.find((product) => product.id === route.productId)!} section={route.section} mode={mode} dispatch={dispatch} notify={notify} ownerToken={ownerToken} reloadReal={reloadReal} />;
  else content = <InvalidRoute hash={route.hash} />;
  return <><button className="skip" type="button" onClick={() => { main.current?.focus(); main.current?.scrollIntoView(); }}>Bỏ qua điều hướng</button><header className="topbar"><div className="brand"><span className="mark">T</span><div><strong>TDN Growth OS</strong><small>Không gian phát triển sản phẩm</small></div></div><div className="owner"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></svg>Chủ dự án</div></header><div className={`demo-bar ${mode === 'real' ? 'real-bar' : ''}`}><span>{mode === 'demo' ? 'Dữ liệu minh họa · Không phải quyết định thật · Chỉ tồn tại trong phiên demo' : ownerToken ? 'OWNER cục bộ đã mở khóa trong bộ nhớ · Không phải đăng nhập production' : 'Dữ liệu SQLite đã xác minh · OWNER cục bộ đang khóa'}</span>{mode === 'demo' ? <button onClick={reset}>Đặt lại demo</button> : ownerToken ? <button onClick={() => { setOwnerToken(null); setTokenDraft(''); notify('Đã khóa OWNER cục bộ và xóa token khỏi bộ nhớ.'); }}>Khóa</button> : <form className="unlock-form" onSubmit={(event) => { event.preventDefault(); if (tokenDraft.length < 32 || !/[A-Za-z]/.test(tokenDraft) || !/\d/.test(tokenDraft)) { notify('Token cục bộ phải có ít nhất 32 ký tự, gồm chữ và số.'); return; } setOwnerToken(tokenDraft); setTokenDraft(''); notify('Đã mở khóa OWNER cục bộ trong bộ nhớ phiên trang.'); }}><label htmlFor="owner-token">Unlock local OWNER actions</label><input id="owner-token" type="password" autoComplete="off" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="Token cục bộ" /><button type="submit">Mở khóa</button></form>}</div><main id="main" className="frame" tabIndex={-1} ref={main}><div className="view">{content}</div>{mode === 'demo' && route.kind !== 'product' && route.kind !== 'invalid' && <div className="view-options"><label htmlFor="scenario">Xem trạng thái giao diện:</label><select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}><option value="normal">Có dữ liệu demo</option><option value="empty">Chưa có workspace</option><option value="loading">Đang tải</option><option value="error">Lỗi tải dữ liệu</option></select></div>}<p className="caption">{mode === 'demo' ? 'Frontend React demo · Mọi thao tác được đặt lại khi tải lại trang.' : 'Frontend React · Dữ liệu thật chỉ đọc qua API nội bộ.'}</p></main><div className="toast" role="status" aria-live="polite">{toast}</div></>;
}
