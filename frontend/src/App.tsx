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

function Portfolio({ state, onCreate }: { readonly state: DemoState; readonly onCreate: (id: string, name: string, keywords: string) => void }) {
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
    <div className="heading"><div><h1>Các thị trường đang nghiên cứu</h1><p>Mỗi thị trường là một workspace khám phá riêng.</p></div><button className="button primary" onClick={() => setShowCreate(true)}>Tạo nghiên cứu mới</button></div>
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
      }) : <tr><td colSpan={3}><div className="empty"><h3>Không tìm thấy thị trường</h3><p>Thử từ khóa khác hoặc xóa tìm kiếm.</p><button className="button" onClick={() => setSearch('')}>Xóa tìm kiếm</button></div></td></tr>}</tbody></table>
    </section><p className="caption">Chọn một thị trường để xem nghiên cứu chung, rổ cơ hội và các hồ sơ sản phẩm. Sản phẩm sau B7 giữ quyết định độc lập.</p>
  </>;
}

function MarketNavigation({ state, marketId }: { readonly state: DemoState; readonly marketId: string }) {
  return <div className="market-navigation"><button className="button quiet" onClick={() => navigate(routeToHash.portfolio())}>Tất cả thị trường</button><label htmlFor="market-switch">Chuyển thị trường</label><select id="market-switch" value={marketId} onChange={(event) => navigate(routeToHash.market(event.target.value))}>{state.markets.map((market) => <option value={market.id} key={market.id}>{market.name}</option>)}</select></div>;
}

function Discovery({ state, market }: { readonly state: DemoState; readonly market: Market }) {
  const candidates = candidatesForMarket(state, market.id);
  return <section className="surface surface-pad discovery-section"><h2>Khám phá và rổ cơ hội</h2><p className="muted">{market.note}</p><div className="candidate-list">{candidates.length > 0 ? candidates.map((candidate, index) => {
    const hasProduct = candidate.productId !== null && state.products.some((product) => product.id === candidate.productId && product.marketId === market.id && product.candidateId === candidate.id);
    return <div className="candidate-item" key={candidate.id}><div><strong>{candidate.name}</strong><small>Ứng viên minh họa {index + 1}</small></div><Badge state={hasProduct ? 'PASS' : 'NONE'}>{hasProduct ? 'Đã tách hồ sơ sau B7' : 'Đang khám phá'}</Badge></div>;
  }) : <p className="muted">Chưa có ứng viên. Bắt đầu bằng việc xác định phạm vi và bổ sung tài liệu nghiên cứu.</p>}</div><details><summary>Tài liệu và báo cáo nghiên cứu</summary><p>Chưa gắn báo cáo trong demo. Mỗi thị trường có phạm vi và nguồn riêng. Methodology B2 đang chờ hoàn thiện; không tự chạy thu thập khi tạo thị trường.</p></details></section>;
}

function MarketWorkspace({ state, market }: { readonly state: DemoState; readonly market: Market }) {
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
      <section className="surface"><div className="tools"><h2>Hồ sơ sản phẩm</h2><input className="search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} aria-label="Tìm workspace" placeholder="Tìm workspace…" /></div><table className="table"><thead><tr><th scope="col">Workspace</th><th scope="col">Trạng thái</th><th scope="col">Chi tiết</th></tr></thead><tbody>{filtered.length > 0 ? filtered.map((product) => <tr key={product.id}><td><strong>{product.name}</strong><small>B8 · {passCount(product)}/4 lane đạt</small></td><td><Badge state={passCount(product) === 4 ? 'PASS' : 'NONE'}>{passCount(product) === 4 ? '4 lane đạt' : Object.values(product.states).some((value) => value !== 'NONE') ? 'Đang thẩm định' : 'Chưa đánh giá'}</Badge></td><td><button className="button quiet" onClick={() => navigate(routeToHash.product(market.id, product.id))} aria-label={`Mở ${product.name}`}>Mở hồ sơ <Arrow /></button></td></tr>) : <tr><td colSpan={3}><div className="empty"><h3>{search ? 'Không tìm thấy workspace' : 'Chưa có hồ sơ sản phẩm'}</h3><p>{search ? 'Thử từ khóa khác hoặc xóa tìm kiếm.' : 'Các ứng viên vẫn có thể được nghiên cứu trong rổ cơ hội bên dưới. Hồ sơ sản phẩm chỉ xuất hiện sau bước chọn B7 và tạo workspace.'}</p>{search && <button className="button" onClick={() => setSearch('')}>Xóa tìm kiếm</button>}</div></td></tr>}</tbody></table></section>
    </div><Discovery state={state} market={market} />
  </>;
}

function ProductContent({ product, section, selected, onSelect }: { readonly product: Product; readonly section: ProductSection; readonly selected: LaneKey; readonly onSelect: (lane: LaneKey) => void }) {
  if (section === 'history') return <><h2>Lịch sử quyết định B8</h2><p>Các quyết định trước được giữ lại khi bạn đổi trạng thái.</p>{product.history.length > 0 ? <ol className="timeline">{product.history.map((event) => <li key={event.id}><strong>{laneLabels[event.lane]}</strong> · {stateLabels[event.state]}<small>Chủ dự án · {event.time}</small></li>)}</ol> : <div className="empty"><h3>Chưa có quyết định</h3><p>Chọn một lane ở B8 để bắt đầu.</p></div>}</>;
  if (section === 'sources') return <><h2>Bằng chứng của hồ sơ</h2><p>Các tài liệu được gắn với đúng hồ sơ sẽ xuất hiện tại đây.</p><div className="evidence"><h3>Chưa có báo cáo được gắn</h3><p>Không có số liệu thị trường hoặc review thật trong demo này. Methodology và định dạng báo cáo B2 đang được chủ dự án chuẩn bị.</p></div><details><summary>Xem nguồn hình thành workspace</summary><p>Ứng viên ID <code>{product.candidateId}</code> → Rổ cơ hội v1 → B7 Đạt → Workspace sản phẩm ID <code>{product.id}</code>. Chuỗi này chỉ minh họa cách hiển thị nguồn.</p></details></>;
  if (section === 'b9') return <><h2>B9 · Khóa STP</h2><div className="empty"><h3>{product.clearance ? 'Sẵn sàng chuẩn bị STP' : 'Cần xác nhận B8 trước'}</h3><p>{product.clearance ? 'B8 đã có snapshot xác nhận trong demo. B9 v1 gồm một bản STP đang soạn và một bản khóa chính thức. Form STP chưa được triển khai trong demo này.' : 'Hồ sơ cần bốn quyết định Đạt và thao tác xác nhận đủ điều kiện B9.'}</p><button className="button" onClick={() => navigate(routeToHash.product(product.marketId, product.id, 'b8'))}>Quay lại B8</button></div></>;
  if (section === 'b10') return <><h2>B10 · Danh mục và cấp vốn</h2><div className="empty"><h3>Chưa có STP đã khóa</h3><p>Sau B9, chủ dự án đưa ra một quyết định chung: Duyệt, Tạm giữ hoặc Từ chối. Có thể sửa quyết định và giữ lịch sử. Màn hình thao tác B10 chưa được triển khai.</p><button className="button" onClick={() => navigate(routeToHash.product(product.marketId, product.id, 'b9'))}>Xem điều kiện B9</button></div></>;
  return <><h2>B8 · Thẩm định sản phẩm</h2><p>Chọn một lane để xem và cập nhật quyết định.</p><div className="evidence"><h3>Tóm tắt ứng viên</h3><p>{product.summary}</p><div className="source-row"><span>Nguồn lựa chọn<b>B7 · Đạt · Ứng viên v1</b></span><span>Bản tóm tắt<b>Giữ nguyên từ lúc tạo</b></span></div></div><div className="lanes" aria-label="Bốn lane thẩm định">{laneOrder.map((lane) => <button className={`lane ${selected === lane ? 'selected' : ''}`} key={lane} onClick={() => onSelect(lane)} aria-pressed={selected === lane}><span><strong>{laneLabels[lane]}</strong><small>{lane}</small></span><Badge state={product.states[lane]} /></button>)}</div></>;
}

function ProductWorkspace({ state, product, section, dispatch, notify }: { readonly state: DemoState; readonly product: Product; readonly section: ProductSection; readonly dispatch: (action: Parameters<typeof demoReducer>[1]) => void; readonly notify: (message: string) => void }) {
  const [selected, setSelected] = useState<LaneKey>('LEGAL');
  const market = state.markets.find((item) => item.id === product.marketId)!;
  const decide = (decision: DecisionState) => {
    if (product.states[selected] === decision) return;
    dispatch({ type: 'decide', productId: product.id, lane: selected, decision, time: nowLabel() });
    notify(`Đã cập nhật ${laneLabels[selected]}: ${stateLabels[decision]} — chỉ trong demo.`);
  };
  const clearance = () => {
    dispatch({ type: 'create-clearance', productId: product.id, time: nowLabel() });
    notify('Đã tạo snapshot B8 minh họa. Bạn có thể xem bước B9.');
  };
  const sections: readonly [ProductSection, string][] = [['b8', 'B8 · Thẩm định'], ['sources', 'Bằng chứng'], ['history', 'Lịch sử B8'], ['b9', 'B9 · Khóa STP'], ['b10', 'B10 · Phê duyệt']];
  return <><MarketNavigation state={state} marketId={market.id} /><nav className="crumb" aria-label="Đường dẫn"><button onClick={() => navigate(routeToHash.market(market.id))}>{market.name}</button><span aria-hidden="true">/</span><span>{product.name}</span></nav><div className="heading"><div><h1>{product.name}</h1><p>Hồ sơ sản phẩm độc lập · Bắt đầu từ B7 Đạt</p></div><Badge state="NONE">Dữ liệu minh họa</Badge></div>
    <div className="steps" aria-label="Các bước hồ sơ"><div className="step done"><b>B7 · Đã chọn</b><small>Ứng viên v1</small></div><div className={`step ${section === 'b8' ? 'current' : product.clearance ? 'done' : ''}`}><b>B8 · Thẩm định</b><small>{passCount(product)}/4 lane đang Đạt</small></div><div className={`step ${section === 'b9' ? 'current' : ''}`}><b>B9 · Khóa STP</b><small>{product.clearance ? 'Chưa có bản STP' : 'Chờ xác nhận B8'}</small></div><div className={`step ${section === 'b10' ? 'current' : ''}`}><b>B10 · Phê duyệt</b><small>Chờ STP đã khóa</small></div></div>
    <div className="dossier"><aside className="side"><div className="candidate"><span>Ứng viên v1</span><h2>{product.name}</h2><p>Hồ sơ và quyết định được quản lý riêng.</p></div><nav aria-label="Các phần hồ sơ">{sections.map(([key, label]) => <button className={`nav-button ${section === key ? 'active' : ''}`} key={key} aria-current={section === key ? 'page' : undefined} onClick={() => navigate(routeToHash.product(market.id, product.id, key))}>{label}</button>)}</nav></aside>
      <section className="content"><ProductContent product={product} section={section} selected={selected} onSelect={setSelected} /></section>
      <aside className="decision"><h2>Quyết định lane</h2><label htmlFor="lane" className="muted">Lane đang xem</label><select id="lane" value={selected} onChange={(event) => setSelected(event.target.value as LaneKey)}>{laneOrder.map((lane) => <option value={lane} key={lane}>{laneLabels[lane]}</option>)}</select><p>Hiện tại: <Badge state={product.states[selected]} /></p><div className="decision-actions">{(['PASS', 'HOLD', 'REJECT'] as const).map((decision) => <button className={decision.toLowerCase()} key={decision} disabled={product.states[selected] === decision} onClick={() => decide(decision)}>{stateLabels[decision]}</button>)}</div><p className="decision-note">Không cần nhập lý do. Đổi trạng thái sẽ thêm một quyết định vào lịch sử demo.</p><div className="snapshot"><h3>Điều kiện chuyển bước</h3>{product.clearance ? <><p>Đã xác nhận B8 lúc {product.clearance.time}. Snapshot này giữ nguyên khi các lane được đánh giá lại.</p>{passCount(product) < 4 && <p className="snapshot-warning">Trạng thái hiện tại là {passCount(product)}/4 Đạt; clearance lịch sử vẫn được giữ.</p>}<button className="button primary" onClick={() => navigate(routeToHash.product(market.id, product.id, 'b9'))}>Xem B9 <Arrow /></button></> : <><p>Cần 4 lane Đạt để xác nhận B8. Hiện có {passCount(product)}/4.</p><button className="button primary" disabled={passCount(product) !== 4} onClick={clearance}>Xác nhận đủ điều kiện B9</button></>}</div></aside>
    </div></>;
}

function InvalidRoute({ hash }: { readonly hash: string }) {
  return <div className="surface empty invalid-route"><h1>Không tìm thấy workspace</h1><p>Đường dẫn <code>{hash || '#/'}</code> không khớp thị trường hoặc hồ sơ sản phẩm nào trong dữ liệu demo.</p><button className="button primary" onClick={() => navigate(routeToHash.portfolio())}>Về tất cả thị trường</button></div>;
}

export default function App() {
  const [state, dispatch] = useReducer(demoReducer, undefined, createSeedState);
  const route = useRoute(state);
  const [scenario, setScenario] = useState<Scenario>('normal');
  const [toast, setToast] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const main = useRef<HTMLElement>(null);
  const notify = (message: string) => {
    window.clearTimeout(timer.current);
    setToast(message);
    timer.current = window.setTimeout(() => setToast(''), 4500);
  };
  useEffect(() => () => window.clearTimeout(timer.current), []);
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
  if (scenario !== 'normal' && route.kind !== 'product' && route.kind !== 'invalid') content = <ScenarioPreview scenario={scenario} restore={() => setScenario('normal')} />;
  else if (route.kind === 'portfolio') content = <Portfolio state={state} onCreate={createMarket} />;
  else if (route.kind === 'market') content = <MarketWorkspace state={state} market={state.markets.find((market) => market.id === route.marketId)!} />;
  else if (route.kind === 'product') content = <ProductWorkspace state={state} product={state.products.find((product) => product.id === route.productId)!} section={route.section} dispatch={dispatch} notify={notify} />;
  else content = <InvalidRoute hash={route.hash} />;
  return <><button className="skip" type="button" onClick={() => { main.current?.focus(); main.current?.scrollIntoView(); }}>Bỏ qua điều hướng</button><header className="topbar"><div className="brand"><span className="mark">T</span><div><strong>TDN Growth OS</strong><small>Không gian phát triển sản phẩm</small></div></div><div className="owner"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="8" r="3" /><path d="M5 21v-3a7 7 0 0 1 14 0v3" /></svg>Chủ dự án</div></header><div className="demo-bar"><span>Dữ liệu minh họa · Không phải quyết định thật · Chỉ tồn tại trong phiên demo</span><button onClick={reset}>Đặt lại demo</button></div><main id="main" className="frame" tabIndex={-1} ref={main}><div className="view">{content}</div>{route.kind !== 'product' && route.kind !== 'invalid' && <div className="view-options"><label htmlFor="scenario">Xem trạng thái giao diện:</label><select id="scenario" value={scenario} onChange={(event) => setScenario(event.target.value as Scenario)}><option value="normal">Có dữ liệu demo</option><option value="empty">Chưa có workspace</option><option value="loading">Đang tải</option><option value="error">Lỗi tải dữ liệu</option></select></div>}<p className="caption">Frontend React tương tác · Mọi thao tác được đặt lại khi tải lại trang.</p></main><div className="toast" role="status" aria-live="polite">{toast}</div></>;
}
