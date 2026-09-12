export const laneOrder = ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'] as const;
export type LaneKey = (typeof laneOrder)[number];
export type DecisionState = 'PASS' | 'HOLD' | 'REJECT';
export type LaneState = DecisionState | 'NONE';
export type Scenario = 'normal' | 'empty' | 'loading' | 'error';
export type ProductSection = 'b8' | 'sources' | 'history' | 'b9' | 'b10';

export interface DecisionEvent {
  readonly id: string;
  readonly lane: LaneKey;
  readonly state: DecisionState;
  readonly time: string;
}

export interface ClearanceSnapshot {
  readonly id: string;
  readonly time: string;
  readonly decisionIds: Readonly<Record<LaneKey, string>>;
}

export interface StpSegment {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

export interface B9WorkingStp {
  readonly id: string;
  readonly clearanceId: string;
  readonly segments: readonly StpSegment[];
  readonly primaryTargetKey: string;
  readonly secondaryTargetKeys: readonly string[];
  readonly positioning: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly workingRevision: string;
}

export type B9State =
  | { readonly state: 'NOT_STARTED'; readonly working: null; readonly locked: null }
  | { readonly state: 'WORKING'; readonly working: B9WorkingStp; readonly locked: null }
  | { readonly state: 'LOCKED'; readonly working: B9WorkingStp; readonly locked: { readonly id: string; readonly lockedAt: string } };

export type B10Decision = 'APPROVE' | 'HOLD' | 'REJECT';
export interface B10DecisionEvent {
  readonly id: string;
  readonly number: number;
  readonly previousId: string | null;
  readonly decision: B10Decision;
  readonly decidedAt: string;
}
export interface B10State {
  readonly history: readonly B10DecisionEvent[];
  readonly effective: B10DecisionEvent | null;
  readonly readyForB11: boolean;
}

export interface BasketMember {
  readonly candidateId: string;
  readonly candidateKey: string;
  readonly candidateVersion: number;
  readonly name: string;
  readonly summary: string;
}

export interface CandidateBasket {
  readonly id: string;
  readonly marketId: string;
  readonly key: string;
  readonly version: number;
  readonly frozenAt: string;
  readonly candidates: readonly BasketMember[];
}

export interface Product {
  readonly id: string;
  readonly marketId: string;
  readonly basketId: string;
  readonly basketKey: string;
  readonly basketVersion: number;
  readonly candidateId: string;
  readonly candidateVersion: number;
  readonly name: string;
  readonly summary: string;
  readonly states: Readonly<Record<LaneKey, LaneState>>;
  readonly versions: Readonly<Record<LaneKey, number>>;
  readonly decisionIds: Readonly<Record<LaneKey, string | null>>;
  readonly history: readonly DecisionEvent[];
  readonly clearance: ClearanceSnapshot | null;
  readonly b9: B9State;
  readonly b10: B10State;
}

export interface Candidate {
  readonly id: string;
  readonly marketId: string;
  readonly key: string;
  readonly version: number;
  readonly name: string;
  readonly summary: string;
  /** A product remains linked to the candidate identity even after later candidate revisions. */
  readonly productId: string | null;
  readonly productCandidateVersion: number | null;
}

export interface Market {
  readonly id: string;
  readonly name: string;
  readonly keywords: string;
  readonly note: string;
}

export interface DemoState {
  readonly markets: readonly Market[];
  readonly candidates: readonly Candidate[];
  readonly baskets: readonly CandidateBasket[];
  readonly products: readonly Product[];
  readonly sequence: number;
}

export type DemoAction =
  | { readonly type: 'replace'; readonly state: DemoState }
  | { readonly type: 'create-market'; readonly id: string; readonly name: string; readonly keywords: string }
  | { readonly type: 'create-candidate'; readonly id: string; readonly marketId: string; readonly key: string; readonly name: string; readonly summary: string }
  | { readonly type: 'revise-candidate'; readonly id: string; readonly name: string; readonly summary: string }
  | { readonly type: 'freeze-basket'; readonly id: string; readonly marketId: string; readonly key: string; readonly version: number; readonly candidateIds: readonly string[]; readonly time: string }
  | { readonly type: 'decide'; readonly productId: string; readonly lane: LaneKey; readonly decision: DecisionState; readonly time: string }
  | { readonly type: 'create-clearance'; readonly productId: string; readonly time: string }
  | { readonly type: 'reset' };

const emptyStates = (): Record<LaneKey, LaneState> => ({ LEGAL: 'NONE', SCIENTIFIC: 'NONE', QUALITY: 'NONE', FINANCE: 'NONE' });
const emptyVersions = (): Record<LaneKey, number> => ({ LEGAL: 0, SCIENTIFIC: 0, QUALITY: 0, FINANCE: 0 });
const emptyDecisionIds = (): Record<LaneKey, string | null> => ({ LEGAL: null, SCIENTIFIC: null, QUALITY: null, FINANCE: null });

export function createSeedState(): DemoState {
  return {
    markets: [
      { id: 'calcium', name: 'Thị trường canxi', keywords: 'canxi, calcium', note: 'Hai ứng viên minh họa đã qua B7; tiếp tục khám phá thêm cơ hội.' },
      { id: 'collagen', name: 'Thị trường collagen', keywords: 'collagen', note: 'Một ứng viên đã qua B7, một ứng viên tiếp tục khám phá.' },
      { id: 'sleep', name: 'Chăm sóc giấc ngủ', keywords: 'giấc ngủ, sleep', note: 'Đang khám phá cơ hội; chưa có quyết định B7 hoặc hồ sơ sản phẩm.' },
    ],
    candidates: [
      { id: 'candidate-calcium-adult', marketId: 'calcium', key: 'calcium-adult', version: 2, name: 'Canxi cho người lớn', summary: 'Ý tưởng canxi cho người trưởng thành đang được khám phá.', productId: 'adult', productCandidateVersion: 1 },
      { id: 'candidate-calcium-child', marketId: 'calcium', key: 'calcium-child', version: 1, name: 'Canxi cho trẻ em', summary: 'Ý tưởng dành cho trẻ em cần tiếp tục xác minh.', productId: 'child', productCandidateVersion: 1 },
      { id: 'candidate-collagen-liquid', marketId: 'collagen', key: 'collagen-liquid', version: 1, name: 'Collagen dạng nước', summary: 'Ứng viên dạng nước minh họa.', productId: 'collagen-liquid', productCandidateVersion: 1 },
      { id: 'candidate-collagen-powder', marketId: 'collagen', key: 'collagen-powder', version: 1, name: 'Collagen dạng bột', summary: 'Ứng viên dạng bột đang khám phá.', productId: null, productCandidateVersion: null },
      { id: 'candidate-sleep-habit', marketId: 'sleep', key: 'sleep-habit', version: 1, name: 'Sản phẩm hỗ trợ thói quen ngủ', summary: 'Ý tưởng tổng hợp hỗ trợ thói quen ngủ.', productId: null, productCandidateVersion: null },
    ],
    baskets: [
      { id: 'basket-calcium-1', marketId: 'calcium', key: 'calcium-shortlist', version: 1, frozenAt: '01/10/2026 08:00 · minh họa', candidates: [
        { candidateId: 'candidate-calcium-adult', candidateKey: 'calcium-adult', candidateVersion: 1, name: 'Canxi cho người lớn', summary: 'Ý tưởng canxi cho người trưởng thành đang được khám phá.' },
        { candidateId: 'candidate-calcium-child', candidateKey: 'calcium-child', candidateVersion: 1, name: 'Canxi cho trẻ em', summary: 'Ý tưởng dành cho trẻ em cần tiếp tục xác minh.' },
      ] },
      { id: 'basket-calcium-2', marketId: 'calcium', key: 'calcium-shortlist', version: 2, frozenAt: '02/10/2026 08:00 · minh họa', candidates: [
        { candidateId: 'candidate-calcium-adult', candidateKey: 'calcium-adult', candidateVersion: 2, name: 'Canxi cho người lớn', summary: 'Ý tưởng canxi cho người trưởng thành đang được khám phá.' },
      ] },
      { id: 'basket-calcium-alt-1', marketId: 'calcium', key: 'calcium-alternative', version: 1, frozenAt: '02/10/2026 08:15 · minh họa', candidates: [
        { candidateId: 'candidate-calcium-child', candidateKey: 'calcium-child', candidateVersion: 1, name: 'Canxi cho trẻ em', summary: 'Ý tưởng dành cho trẻ em cần tiếp tục xác minh.' },
      ] },
      { id: 'basket-collagen-1', marketId: 'collagen', key: 'collagen-shortlist', version: 1, frozenAt: '01/10/2026 08:30 · minh họa', candidates: [
        { candidateId: 'candidate-collagen-liquid', candidateKey: 'collagen-liquid', candidateVersion: 1, name: 'Collagen dạng nước', summary: 'Ứng viên dạng nước minh họa.' },
      ] },
    ],
    products: [
      {
        id: 'adult', marketId: 'calcium', basketId: 'basket-calcium-1', basketKey: 'calcium-shortlist', basketVersion: 1, candidateId: 'candidate-calcium-adult', candidateVersion: 1, name: 'Canxi cho người lớn',
        summary: 'Ứng viên dành cho người trưởng thành. Nội dung này minh họa bản tóm tắt được giữ lại khi tạo workspace sản phẩm.',
        states: { LEGAL: 'NONE', SCIENTIFIC: 'PASS', QUALITY: 'HOLD', FINANCE: 'NONE' }, versions: { LEGAL: 0, SCIENTIFIC: 1, QUALITY: 1, FINANCE: 0 }, decisionIds: { LEGAL: null, SCIENTIFIC: 'seed-scientific-pass', QUALITY: 'seed-quality-hold', FINANCE: null },
        history: [
          { id: 'seed-quality-hold', lane: 'QUALITY', state: 'HOLD', time: '09:40 · minh họa' },
          { id: 'seed-scientific-pass', lane: 'SCIENTIFIC', state: 'PASS', time: '09:20 · minh họa' },
        ],
        clearance: null,
        b9: { state: 'LOCKED', working: { id: 'demo-stp-adult', clearanceId: 'demo-clearance-adult', segments: [{ key: 'active-adult', label: 'Người trưởng thành vận động thường xuyên' }, { key: 'office-adult', label: 'Nhân viên văn phòng quan tâm sức khỏe xương' }, { key: 'senior', label: 'Người lớn tuổi cần tư vấn chuyên môn' }], primaryTargetKey: 'active-adult', secondaryTargetKeys: ['office-adult'], positioning: 'Giải pháp canxi tiện dụng cho người trưởng thành chủ động chăm sóc sức khỏe xương.', createdAt: '01/10/2026 09:00 · minh họa', updatedAt: '01/10/2026 10:30 · minh họa', workingRevision: 'demo-working-revision' }, locked: { id: 'demo-lock-adult', lockedAt: '01/10/2026 11:00 · minh họa' } },
        b10: { history: [{ id: 'demo-b10-1', number: 1, previousId: null, decision: 'HOLD', decidedAt: '01/10/2026 13:00 · minh họa' }, { id: 'demo-b10-2', number: 2, previousId: 'demo-b10-1', decision: 'APPROVE', decidedAt: '02/10/2026 09:00 · minh họa' }], effective: { id: 'demo-b10-2', number: 2, previousId: 'demo-b10-1', decision: 'APPROVE', decidedAt: '02/10/2026 09:00 · minh họa' }, readyForB11: true },
      },
      {
        id: 'child', marketId: 'calcium', basketId: 'basket-calcium-1', basketKey: 'calcium-shortlist', basketVersion: 1, candidateId: 'candidate-calcium-child', candidateVersion: 1, name: 'Canxi cho trẻ em',
        summary: 'Ứng viên dành cho trẻ em, có hồ sơ và các quyết định độc lập với sản phẩm cho người lớn.',
        states: emptyStates(), versions: emptyVersions(), decisionIds: emptyDecisionIds(), history: [], clearance: null,
        b9: { state: 'NOT_STARTED', working: null, locked: null }, b10: { history: [], effective: null, readyForB11: false },
      },
      {
        id: 'collagen-liquid', marketId: 'collagen', basketId: 'basket-collagen-1', basketKey: 'collagen-shortlist', basketVersion: 1, candidateId: 'candidate-collagen-liquid', candidateVersion: 1, name: 'Collagen dạng nước',
        summary: 'Ứng viên dạng nước trong thị trường collagen. Đây là nội dung minh họa, chưa phải kết luận nghiên cứu.',
        states: emptyStates(), versions: emptyVersions(), decisionIds: emptyDecisionIds(), history: [], clearance: null,
        b9: { state: 'NOT_STARTED', working: null, locked: null }, b10: { history: [], effective: null, readyForB11: false },
      },
    ],
    sequence: 1,
  };
}

export function demoReducer(state: DemoState, action: DemoAction): DemoState {
  if (action.type === 'replace') return action.state;
  if (action.type === 'reset') return createSeedState();
  if (action.type === 'create-market') {
    const name = action.name.trim();
    if (!name || state.markets.some((market) => market.id === action.id)) return state;
    return {
      ...state,
      markets: [...state.markets, { id: action.id, name, keywords: action.keywords.trim(), note: 'Workspace mới chưa có dữ liệu nghiên cứu hoặc ứng viên.' }],
    };
  }
  if (action.type === 'create-candidate') {
    if (!state.markets.some((market) => market.id === action.marketId) || state.candidates.some((candidate) => candidate.id === action.id || (candidate.marketId === action.marketId && candidate.key === action.key))) return state;
    return { ...state, candidates: [...state.candidates, { id: action.id, marketId: action.marketId, key: action.key, version: 1, name: action.name.trim(), summary: action.summary.trim(), productId: null, productCandidateVersion: null }] };
  }
  if (action.type === 'revise-candidate') {
    if (!state.candidates.some((candidate) => candidate.id === action.id)) return state;
    return { ...state, candidates: state.candidates.map((candidate) => candidate.id === action.id ? { ...candidate, version: candidate.version + 1, name: action.name.trim(), summary: action.summary.trim() } : candidate) };
  }
  if (action.type === 'freeze-basket') {
    const members = action.candidateIds.map((id) => state.candidates.find((candidate) => candidate.id === id && candidate.marketId === action.marketId));
    const latestVersion = latestBasketVersion(state.baskets, action.marketId, action.key);
    if (members.length === 0 || members.some((member) => !member) || new Set(action.candidateIds).size !== action.candidateIds.length || action.version !== (latestVersion ?? 0) + 1 || state.baskets.some((basket) => basket.id === action.id)) return state;
    return { ...state, baskets: [...state.baskets, { id: action.id, marketId: action.marketId, key: action.key, version: action.version, frozenAt: action.time, candidates: members.map((member) => ({ candidateId: member!.id, candidateKey: member!.key, candidateVersion: member!.version, name: member!.name, summary: member!.summary })) }] };
  }
  const product = state.products.find((item) => item.id === action.productId);
  if (!product) return state;
  if (action.type === 'decide') {
    if (product.states[action.lane] === action.decision) return state;
    const event: DecisionEvent = { id: `decision-${state.sequence}`, lane: action.lane, state: action.decision, time: action.time };
    return {
      ...state,
      sequence: state.sequence + 1,
      products: state.products.map((item) => item.id === product.id ? {
        ...item,
        states: { ...item.states, [action.lane]: action.decision },
        versions: { ...item.versions, [action.lane]: item.versions[action.lane] + 1 },
        decisionIds: { ...item.decisionIds, [action.lane]: event.id },
        history: [event, ...item.history],
      } : item),
    };
  }
  if (product.clearance || !laneOrder.every((lane) => product.states[lane] === 'PASS')) return state;
  const decisionIds = Object.fromEntries(laneOrder.map((lane) => [lane, product.decisionIds[lane] ?? `seed-${product.id}-${lane.toLowerCase()}-pass`])) as Record<LaneKey, string>;
  return {
    ...state,
    sequence: state.sequence + 1,
    products: state.products.map((item) => item.id === product.id ? {
      ...item,
      clearance: { id: `clearance-${state.sequence}`, time: action.time, decisionIds },
    } : item),
  };
}

export function latestBasketVersion(baskets: readonly CandidateBasket[], marketId: string, basketKey: string): number | null {
  let latest: number | null = null;
  for (const basket of baskets) {
    if (basket.marketId === marketId && basket.key === basketKey && (latest === null || basket.version > latest)) latest = basket.version;
  }
  return latest;
}

export function productsForMarket(state: DemoState, marketId: string): readonly Product[] {
  return state.products.filter((product) => product.marketId === marketId);
}

export function candidatesForMarket(state: DemoState, marketId: string): readonly Candidate[] {
  return state.candidates.filter((candidate) => candidate.marketId === marketId);
}

export function passCount(product: Product): number {
  return laneOrder.filter((lane) => product.states[lane] === 'PASS').length;
}

export function marketMatches(market: Market, search: string): boolean {
  const query = search.trim().toLocaleLowerCase('vi');
  return !query || `${market.name} ${market.keywords}`.toLocaleLowerCase('vi').includes(query);
}
