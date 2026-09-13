import { laneOrder, latestBasketVersion } from './model';
import type { Candidate, CandidateBasket, DemoState, LaneKey, LaneState, Market, Product } from './model';
import type { DiscoveryWorkspaceDetailResponse, ProductB10Response, ProductB9Response, ProductWorkspaceDetailResponse, WorkspaceCandidateBasketB7Response, WorkspaceCandidateBasketsResponse, WorkspacePortfolioResponse } from '../../contracts/api/workspace-api.generated';

export type FrontendMode = 'real' | 'demo';
export type LoadFailure = 'connection' | 'integrity';
export class WorkspaceDataSourceError extends Error {
  constructor(readonly kind: LoadFailure, message: string) { super(message); }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const laneStates = new Set(['NO_DECISION', 'PASS', 'HOLD', 'REJECT']);

export function frontendMode(search: string): FrontendMode {
  return new URLSearchParams(search).get('mode') === 'demo' ? 'demo' : 'real';
}

export async function loadRealWorkspaceState(fetcher: typeof fetch = fetch): Promise<DemoState> {
  const portfolioValue = await requestJson('/api/workspaces', fetcher);
  assertPortfolio(portfolioValue);
  const portfolio: WorkspacePortfolioResponse = portfolioValue;
  const details = await Promise.all(portfolio.workspaces.map(async (workspace) => {
    const value = await requestJson(`/api/workspaces/${encodeURIComponent(workspace.workspaceId)}`, fetcher);
    assertDiscovery(value, workspace.workspaceId);
    if (!samePortfolioItem(value.workspace, workspace)) invalid('Chi tiết discovery không khớp portfolio.');
    return value;
  }));
  const basketValues = await Promise.all(details.map(async (detail) => {
    const value = await requestJson(`/api/workspaces/${encodeURIComponent(detail.workspace.workspaceId)}/candidate-baskets`, fetcher);
    assertBaskets(value, detail.workspace.workspaceId);
    return value;
  }));
  const basketB7Values = await Promise.all(basketValues.flatMap((value) => value.baskets.map(async (basket) => {
    const b7 = await requestJson(`/api/workspaces/${encodeURIComponent(value.workspaceId)}/candidate-baskets/${encodeURIComponent(basket.basketId)}/b7`, fetcher);
    assertBasketB7(b7, value.workspaceId, basket);
    return b7;
  })));
  const baskets: CandidateBasket[] = basketB7Values.map((basket) => ({ id: basket.basketId, marketId: basket.workspaceId, key: basket.basketKey, version: basket.basketVersion, frozenAt: formatTime(basket.frozenAt), candidates: basket.candidates.map((candidate) => ({ candidateId: candidate.candidateId, candidateKey: candidate.candidateKey, candidateVersion: candidate.candidateVersion, name: candidate.label, summary: candidate.summary ?? '', b7State: candidate.effectiveState, b7DecisionId: candidate.decisionId ?? null, b7DecidedAt: candidate.decidedAt ? formatTime(candidate.decidedAt) : null, productWorkspace: candidate.productWorkspace ? { id: candidate.productWorkspace.productWorkspaceId, key: candidate.productWorkspace.productWorkspaceKey, title: candidate.productWorkspace.title, state: candidate.productWorkspace.state, entryStep: candidate.productWorkspace.entryStep, createdAt: formatTime(candidate.productWorkspace.createdAt) } : null })) }));
  for (const basket of baskets) {
    const detail = details.find((item) => item.workspace.workspaceId === basket.marketId)!;
    for (const member of basket.candidates) {
      const current = detail.candidates.find((candidate) => candidate.candidateId === member.candidateId);
      if (!current || current.candidateKey !== member.candidateKey || member.candidateVersion > current.version || (member.candidateVersion === current.version && (member.name !== current.label || member.summary !== (current.summary ?? '')))) invalid('Snapshot rổ không khớp lịch sử ứng viên đã xác minh.');
    }
  }
  const summaries = details.flatMap((detail) => detail.products.map((product) => ({ product, detail })));
  const productDetails = await Promise.all(summaries.map(async ({ product, detail }) => {
    const base = `/api/product-workspaces/${encodeURIComponent(product.productWorkspaceId)}`;
    const [value, b9Value, b10Value] = await Promise.all([requestJson(base, fetcher), requestJson(`${base}/b9`, fetcher), requestJson(`${base}/b10`, fetcher)]);
    assertProduct(value, product.productWorkspaceId);
    assertB9(b9Value, product.productWorkspaceId);
    assertB10(b10Value, product.productWorkspaceId);
    const candidate = detail.candidates.find((item) => item.candidateId === value.product.sourceCandidateId);
    const sourceBasket = baskets.find((basket) => basket.id === value.product.sourceBasketId && basket.marketId === detail.workspace.workspaceId);
    const sourceMember = sourceBasket?.candidates.find((member) => member.candidateId === value.product.sourceCandidateId && member.candidateVersion === value.product.sourceCandidateVersion);
    if (!sameProductSummary(value.product, product) || value.product.sourceWorkspaceId !== detail.workspace.workspaceId || !candidate || !sameSourceCandidate(value.product, candidate) || !sourceBasket || sourceBasket.key !== value.product.sourceBasketKey || sourceBasket.version !== value.product.sourceBasketVersion || !sourceMember || sourceMember.candidateKey !== value.product.sourceCandidateKey || sourceMember.name !== value.product.sourceCandidateLabel || sourceMember.summary !== (value.product.sourceCandidateSummary ?? '') || sourceMember.b7State !== 'PASS' || sourceMember.b7DecisionId !== value.product.sourceB7DecisionId || sourceMember.b7DecidedAt !== formatTime(value.product.sourceB7DecidedAt)) invalid('Chi tiết product workspace không khớp discovery, snapshot rổ và quyết định B7 nguồn.');
    return { ...value, journeyB9: b9Value, journeyB10: b10Value };
  }));
  const productById = uniqueMap(productDetails, (detail) => detail.product.productWorkspaceId, 'Product workspace bị lặp.');
  for (const basket of baskets) for (const member of basket.candidates) {
    const linked = productDetails.filter((detail) => detail.product.sourceB7DecisionId === member.b7DecisionId);
    if (member.productWorkspace === null) { if (linked.length !== 0) invalid('B7 PASS thiếu product workspace projection có thẩm quyền.'); continue; }
    if (member.b7State !== 'PASS' || linked.length !== 1) invalid('Product workspace projection không có đúng một nguồn B7 PASS.');
    const product = linked[0]!.product;
    if (member.productWorkspace.id !== product.productWorkspaceId || member.productWorkspace.key !== product.productWorkspaceKey || member.productWorkspace.title !== product.title || member.productWorkspace.state !== product.state || member.productWorkspace.entryStep !== product.entryStep || member.productWorkspace.createdAt !== formatTime(product.createdAt) || product.sourceWorkspaceId !== basket.marketId || product.sourceBasketId !== basket.id || product.sourceBasketKey !== basket.key || product.sourceBasketVersion !== basket.version || product.sourceCandidateId !== member.candidateId || product.sourceCandidateKey !== member.candidateKey || product.sourceCandidateVersion !== member.candidateVersion || product.sourceCandidateLabel !== member.name || (product.sourceCandidateSummary ?? '') !== member.summary) invalid('Product workspace projection không khớp frozen B7 lineage.');
  }
  const markets: Market[] = details.map((detail) => ({ id: detail.workspace.workspaceId, name: detail.workspace.title, keywords: '', note: detail.workspace.description ?? 'Chưa có mô tả workspace.' }));
  const products: Product[] = [];
  const candidates: Candidate[] = [];
  for (const detail of details) {
    for (const candidate of detail.candidates) {
      // Link by immutable identity, not latest version: a product may legitimately retain an older candidate snapshot.
      const linked = productDetails.find((product) => product.product.sourceWorkspaceId === detail.workspace.workspaceId && product.product.sourceCandidateId === candidate.candidateId);
      candidates.push({ id: candidate.candidateId, marketId: detail.workspace.workspaceId, key: candidate.candidateKey, version: candidate.version, name: candidate.label, summary: candidate.summary ?? '', productId: linked?.product.productWorkspaceId ?? null, productCandidateVersion: linked?.product.sourceCandidateVersion ?? null });
    }
    for (const summary of detail.products) {
      const source = productById.get(summary.productWorkspaceId);
      if (!source) invalid('Thiếu chi tiết product workspace.');
      const states = Object.fromEntries(laneOrder.map((lane) => { const value = source.b8.lanes.find((item) => item.lane === lane)!.effectiveState; return [lane, value === 'NO_DECISION' ? 'NONE' : value]; })) as Record<LaneKey, LaneState>;
      products.push({
        id: source.product.productWorkspaceId,
        marketId: source.product.sourceWorkspaceId,
        basketId: source.product.sourceBasketId,
        basketKey: source.product.sourceBasketKey,
        basketVersion: source.product.sourceBasketVersion,
        candidateId: source.product.sourceCandidateId,
        candidateVersion: source.product.sourceCandidateVersion,
        name: source.product.title,
        summary: source.product.sourceCandidateSummary ?? source.product.sourceCandidateLabel,
        states,
        versions: Object.fromEntries(laneOrder.map((lane) => [lane, source.b8.lanes.find((item) => item.lane === lane)!.decisionVersion ?? 0])) as Record<LaneKey, number>,
        decisionIds: Object.fromEntries(laneOrder.map((lane) => [lane, source.b8.lanes.find((item) => item.lane === lane)!.decisionId ?? null])) as Record<LaneKey, string | null>,
        history: source.b8.lanes.filter((lane) => lane.effectiveState !== 'NO_DECISION').map((lane) => ({ id: lane.decisionId!, lane: lane.lane, state: lane.effectiveState as Exclude<LaneState, 'NONE'>, time: formatTime(lane.decidedAt!) })),
        clearance: source.clearance ? { id: source.clearance.clearanceId, time: formatTime(source.clearance.clearedAt), decisionIds: Object.fromEntries(source.clearance.decisions.map((decision) => [decision.lane, decision.decisionId])) as Record<LaneKey, string> } : null,
        b9: mapB9(source.journeyB9),
        b10: { history: source.journeyB10.history.map((item) => ({ id: item.decisionId, number: item.decisionNumber, previousId: item.previousDecisionId, decision: item.decision, decidedAt: formatTime(item.decidedAt) })), effective: source.journeyB10.effective ? { id: source.journeyB10.effective.decisionId, number: source.journeyB10.effective.decisionNumber, previousId: source.journeyB10.effective.previousDecisionId, decision: source.journeyB10.effective.decision, decidedAt: formatTime(source.journeyB10.effective.decidedAt) } : null, readyForB11: source.journeyB10.readyForB11 },
      });
    }
  }
  return { markets, candidates, baskets, products, sequence: 1 };
}

async function requestJson(url: string, fetcher: typeof fetch): Promise<unknown> {
  let response: Response;
  try { response = await fetcher(url, { headers: { Accept: 'application/json' } }); }
  catch { throw new WorkspaceDataSourceError('connection', 'Không thể kết nối API workspace.'); }
  if (!response.ok) {
    const kind: LoadFailure = response.status >= 500 ? 'integrity' : 'connection';
    throw new WorkspaceDataSourceError(kind, kind === 'integrity' ? 'Dữ liệu lưu trữ không vượt qua kiểm tra toàn vẹn.' : 'API workspace không khả dụng.');
  }
  try { return await response.json(); }
  catch { throw new WorkspaceDataSourceError('integrity', 'API trả về JSON không hợp lệ.'); }
}

function assertPortfolio(value: unknown): asserts value is WorkspacePortfolioResponse {
  if (!record(value) || value.contractVersion !== '1.0.0' || !Array.isArray(value.workspaces)) invalid('Phản hồi portfolio không đúng contract.');
  value.workspaces.forEach(assertPortfolioItem);
  uniqueMap(value.workspaces, (item) => item.workspaceId, 'Workspace bị lặp.');
}
function assertPortfolioItem(value: unknown): asserts value is WorkspacePortfolioResponse['workspaces'][number] {
  if (!record(value) || !uuid(value.workspaceId) || !text(value.workspaceKey) || value.state !== 'ACTIVE' || !text(value.title) || (value.description !== undefined && typeof value.description !== 'string') || !dateTime(value.createdAt) || !count(value.candidateCount) || !count(value.productCount)) invalid('Workspace summary không đúng contract.');
}
function assertDiscovery(value: unknown, id: string): asserts value is DiscoveryWorkspaceDetailResponse {
  if (!record(value) || value.contractVersion !== '1.0.0' || !record(value.workspace) || value.workspace.workspaceId !== id || !Array.isArray(value.candidates) || !Array.isArray(value.products)) invalid('Phản hồi discovery workspace không đúng contract.');
  assertPortfolioItem(value.workspace);
  value.candidates.forEach((candidate) => {
    if (!record(candidate) || !uuid(candidate.candidateId) || !text(candidate.candidateKey) || candidate.state !== 'EXPLORING' || !version(candidate.version) || !text(candidate.label) || (candidate.summary !== undefined && typeof candidate.summary !== 'string') || !dateTime(candidate.createdAt)) invalid('Candidate summary không đúng contract.');
  });
  value.products.forEach(assertProductSummary);
  uniqueMap(value.candidates, (candidate) => candidate.candidateId, 'Candidate bị lặp.');
  uniqueMap(value.products, (product) => product.productWorkspaceId, 'Product workspace bị lặp.');
  if (value.workspace.candidateCount !== value.candidates.length || value.workspace.productCount !== value.products.length) invalid('Số lượng workspace không khớp chi tiết đã xác minh.');
}
function assertBaskets(value: unknown, workspaceId: string): asserts value is WorkspaceCandidateBasketsResponse {
  if (!record(value) || value.contractVersion !== '1.0.0' || value.workspaceId !== workspaceId || !Array.isArray(value.baskets)) invalid('Phản hồi rổ ứng viên không đúng contract.');
  const identities = new Set<string>(); const familyVersions = new Map<string, number>(); let previousOrder = '';
  for (const basket of value.baskets) {
    if (!record(basket) || !uuid(basket.basketId) || basket.workspaceId !== workspaceId || !candidateKey(basket.basketKey) || !version(basket.version) || !dateTime(basket.frozenAt) || !Array.isArray(basket.candidates) || basket.candidates.length === 0) invalid('Rổ ứng viên không đúng contract.');
    const identity = `${basket.basketKey}:${basket.version}`; if (identities.has(identity)) invalid('Phiên bản rổ ứng viên bị lặp.'); identities.add(identity);
    const expectedVersion = (familyVersions.get(basket.basketKey) ?? 0) + 1; if (basket.version !== expectedVersion) invalid('Lịch sử phiên bản rổ ứng viên không nối tiếp.'); familyVersions.set(basket.basketKey, basket.version);
    const order = `${basket.basketKey}\u0000${basket.version.toString().padStart(16, '0')}\u0000${basket.basketId}`; if (order <= previousOrder) invalid('Thứ tự rổ ứng viên không ổn định.'); previousOrder = order;
    const members = new Set<string>(); let previousMember = '';
    for (const candidate of basket.candidates) { if (!record(candidate) || !uuid(candidate.candidateId) || !candidateKey(candidate.candidateKey) || !version(candidate.candidateVersion) || !text(candidate.label) || (candidate.summary !== undefined && typeof candidate.summary !== 'string') || candidate.state !== 'EXPLORING' || members.has(candidate.candidateId) || candidate.candidateId <= previousMember) invalid('Snapshot ứng viên trong rổ không đúng contract.'); members.add(candidate.candidateId); previousMember = candidate.candidateId; }
  }
}
function assertBasketB7(value: unknown, workspaceId: string, basket: WorkspaceCandidateBasketsResponse['baskets'][number]): asserts value is WorkspaceCandidateBasketB7Response {
  if (!record(value) || value.contractVersion !== '1.0.0' || value.workspaceId !== workspaceId || value.basketId !== basket.basketId || value.basketKey !== basket.basketKey || value.basketVersion !== basket.version || value.frozenAt !== basket.frozenAt || !Array.isArray(value.candidates) || value.candidates.length !== basket.candidates.length) invalid('Phản hồi B7 không khớp metadata rổ đóng băng.');
  value.candidates.forEach((member, index) => {
    const frozen = basket.candidates[index];
    if (!record(member) || !frozen || member.candidateId !== frozen.candidateId || member.candidateKey !== frozen.candidateKey || member.candidateVersion !== frozen.candidateVersion || member.label !== frozen.label || member.summary !== frozen.summary || member.state !== frozen.state || !laneStates.has(String(member.effectiveState))) invalid('Phản hồi B7 không giữ đúng thứ tự và trường snapshot ứng viên.');
    const undecided = member.effectiveState === 'NO_DECISION';
    if (undecided ? member.decisionId !== undefined || member.decidedAt !== undefined : !uuid(member.decisionId) || !dateTime(member.decidedAt)) invalid('Trạng thái, ID hoặc thời gian B7 không đúng contract.');
    if (member.productWorkspace !== undefined) {
      if (member.effectiveState !== 'PASS' || !record(member.productWorkspace) || Object.keys(member.productWorkspace).sort().join(',') !== 'createdAt,entryStep,productWorkspaceId,productWorkspaceKey,state,title') invalid('Liên kết product workspace không đúng contract.');
      assertProductSummary(member.productWorkspace);
    }
  });
}
function assertProductSummary(value: unknown): void {
  if (!record(value) || !uuid(value.productWorkspaceId) || !text(value.productWorkspaceKey) || value.state !== 'ACTIVE' || value.entryStep !== 'B8' || !text(value.title) || !dateTime(value.createdAt)) invalid('Product summary không đúng contract.');
}
function assertProduct(value: unknown, id: string): asserts value is ProductWorkspaceDetailResponse {
  if (!record(value) || value.contractVersion !== '1.0.0' || !record(value.product) || value.product.productWorkspaceId !== id || !record(value.b8) || !Array.isArray(value.b8.lanes) || typeof value.b8.readyForB9 !== 'boolean') invalid('Phản hồi product workspace không đúng contract.');
  assertProductSummary(value.product);
  const product = value.product;
  if (![product.sourceWorkspaceId, product.sourceBasketId, product.sourceCandidateId, product.sourceB7DecisionId].every(uuid) || !text(product.sourceBasketKey) || !version(product.sourceBasketVersion) || !text(product.sourceCandidateKey) || !version(product.sourceCandidateVersion) || !text(product.sourceCandidateLabel) || (product.sourceCandidateSummary !== undefined && typeof product.sourceCandidateSummary !== 'string') || !dateTime(product.sourceB7DecidedAt)) invalid('Nguồn product workspace không đúng contract.');
  if (value.b8.lanes.length !== laneOrder.length) invalid('B8 lanes không đúng contract.');
  for (const lane of value.b8.lanes) {
    if (!record(lane) || !laneOrder.includes(lane.lane as LaneKey) || !laneStates.has(String(lane.effectiveState))) invalid('B8 lane không đúng contract.');
    const noDecision = lane.effectiveState === 'NO_DECISION';
    if (noDecision ? lane.decisionId !== undefined || lane.decisionVersion !== undefined || lane.decidedAt !== undefined : !uuid(lane.decisionId) || !version(lane.decisionVersion) || !dateTime(lane.decidedAt)) invalid('B8 decision không đúng contract.');
  }
  if (laneOrder.some((lane) => value.b8.lanes.filter((item: Record<string, any>) => item.lane === lane).length !== 1)) invalid('B8 lane bị thiếu hoặc lặp.');
  const allPass = value.b8.lanes.every((lane) => lane.effectiveState === 'PASS');
  if (value.b8.readyForB9 !== allPass) invalid('readyForB9 không khớp lane hiệu lực.');
  if (value.clearance !== undefined) {
    const clearance = value.clearance;
    if (!record(clearance) || !uuid(clearance.clearanceId) || clearance.state !== 'READY_FOR_B9' || !dateTime(clearance.clearedAt) || !Array.isArray(clearance.decisions) || clearance.decisions.length !== laneOrder.length) invalid('B8 clearance không đúng contract.');
    for (const decision of clearance.decisions) if (!record(decision) || !laneOrder.includes(decision.lane as LaneKey) || !uuid(decision.decisionId) || !version(decision.decisionVersion) || !dateTime(decision.decidedAt)) invalid('Clearance decision không đúng contract.');
    if (laneOrder.some((lane) => clearance.decisions.filter((decision: Record<string, any>) => decision.lane === lane).length !== 1)) invalid('Clearance lane bị thiếu hoặc lặp.');
  }
}

function samePortfolioItem(left: WorkspacePortfolioResponse['workspaces'][number], right: WorkspacePortfolioResponse['workspaces'][number]): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function sameProductSummary(left: ProductWorkspaceDetailResponse['product'], right: DiscoveryWorkspaceDetailResponse['products'][number]): boolean { return left.productWorkspaceId === right.productWorkspaceId && left.productWorkspaceKey === right.productWorkspaceKey && left.state === right.state && left.entryStep === right.entryStep && left.title === right.title && left.createdAt === right.createdAt; }
function sameSourceCandidate(product: ProductWorkspaceDetailResponse['product'], candidate: DiscoveryWorkspaceDetailResponse['candidates'][number]): boolean { if (product.sourceCandidateId !== candidate.candidateId || product.sourceCandidateKey !== candidate.candidateKey || product.sourceCandidateVersion > candidate.version) return false; return product.sourceCandidateVersion < candidate.version || (product.sourceCandidateLabel === candidate.label && product.sourceCandidateSummary === candidate.summary); }
function uniqueMap<T>(values: readonly T[], key: (value: T) => string, message: string): Map<string, T> { const result = new Map<string, T>(); for (const value of values) { const id = key(value); if (result.has(id)) invalid(message); result.set(id, value); } return result; }
function invalid(message: string): never { throw new WorkspaceDataSourceError('integrity', message); }
function record(value: unknown): value is Record<string, any> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function candidateKey(value: unknown): value is string { return typeof value === 'string' && /^[a-z][a-z0-9_-]{2,79}$/.test(value); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 1; }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function dateTime(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)); }
function formatTime(value: string): string { return new Date(value).toLocaleString('vi-VN'); }
function workingRevision(value: unknown): value is string { return typeof value === 'string' && /^wr1_[A-Za-z0-9_-]{43}$/.test(value); }

function assertB9(value: unknown, id: string): asserts value is ProductB9Response {
  if (!record(value) || value.contractVersion !== '1.0.0' || value.productWorkspaceId !== id || !['NOT_STARTED', 'WORKING', 'LOCKED'].includes(String(value.state))) invalid('Phản hồi B9 không đúng contract.');
  if (value.state === 'NOT_STARTED') { if (value.working !== undefined || value.locked !== undefined) invalid('B9 chưa bắt đầu có dữ liệu mâu thuẫn.'); return; }
  if (!record(value.working) || !uuid(value.working.workingStpId) || !uuid(value.working.b8ClearanceId) || !workingRevision(value.working.workingRevision) || !record(value.working.content) || !Array.isArray(value.working.content.segments) || !text(value.working.content.primaryTargetSegmentKey) || !Array.isArray(value.working.content.secondaryTargetSegmentKeys ?? []) || !text(value.working.content.positioningStatement) || !dateTime(value.working.createdAt) || !dateTime(value.working.updatedAt)) invalid('B9 working STP không đúng contract.');
  const keys = new Set<string>(); for (const segment of value.working.content.segments) { if (!record(segment) || !text(segment.key) || !text(segment.label) || keys.has(segment.key)) invalid('Phân khúc STP không đúng contract.'); keys.add(segment.key); }
  if (!keys.has(value.working.content.primaryTargetSegmentKey) || (value.working.content.secondaryTargetSegmentKeys ?? []).some((key: string) => !keys.has(key) || key === value.working!.content.primaryTargetSegmentKey)) invalid('Target STP không tham chiếu phân khúc hợp lệ.');
  if (value.state === 'WORKING' && value.locked !== undefined) invalid('B9 working có lock mâu thuẫn.');
  if (value.state === 'LOCKED' && (!record(value.locked) || !uuid(value.locked.lockId) || value.locked.state !== 'LOCKED_STP' || !dateTime(value.locked.lockedAt))) invalid('B9 lock không đúng contract.');
}
function assertB10(value: unknown, id: string): asserts value is ProductB10Response {
  if (!record(value) || value.contractVersion !== '1.0.0' || value.productWorkspaceId !== id || !Array.isArray(value.history) || typeof value.readyForB11 !== 'boolean') invalid('Phản hồi B10 không đúng contract.');
  let previous: string | null = null; let lockedStpId: string | null = null;
  value.history.forEach((item, index) => { if (!record(item) || !uuid(item.decisionId) || !uuid(item.lockedStpId) || item.decisionNumber !== index + 1 || item.previousDecisionId !== previous || !['APPROVE','HOLD','REJECT'].includes(String(item.decision)) || !dateTime(item.decidedAt) || (lockedStpId !== null && item.lockedStpId !== lockedStpId)) invalid('Lịch sử B10 không đúng contract.'); previous = item.decisionId; lockedStpId = item.lockedStpId; });
  const final = value.history.at(-1) ?? null;
  if ((value.effective === null) !== (final === null) || (final && (!record(value.effective) || JSON.stringify(value.effective) !== JSON.stringify(final))) || value.readyForB11 !== (final?.decision === 'APPROVE')) invalid('Quyết định B10 hiệu lực không khớp lịch sử.');
}
function mapB9(value: ProductB9Response): Product['b9'] {
  if (value.state === 'NOT_STARTED') return { state: 'NOT_STARTED', working: null, locked: null };
  const working = value.working!;
  const mapped = { id: working.workingStpId, clearanceId: working.b8ClearanceId, segments: working.content.segments, primaryTargetKey: working.content.primaryTargetSegmentKey, secondaryTargetKeys: working.content.secondaryTargetSegmentKeys ?? [], positioning: working.content.positioningStatement, createdAt: formatTime(working.createdAt), updatedAt: formatTime(working.updatedAt), workingRevision: working.workingRevision };
  return value.state === 'LOCKED' ? { state: 'LOCKED', working: mapped, locked: { id: value.locked!.lockId, lockedAt: formatTime(value.locked!.lockedAt) } } : { state: 'WORKING', working: mapped, locked: null };
}

export type OwnerWriteFailure = 'unauthorized' | 'forbidden' | 'conflict' | 'not_found' | 'invalid' | 'integrity' | 'connection';
export class OwnerWriteError extends Error { constructor(readonly kind: OwnerWriteFailure, message: string) { super(message); } }
export interface OwnerDecisionReceipt { readonly decisionId: string; readonly decisionVersion: number; readonly lane: LaneKey; readonly decision: Exclude<LaneState, 'NONE'>; readonly decidedAt: string; readonly exactRetry: boolean }
export async function submitOwnerB8Decision(input: { readonly productWorkspaceId: string; readonly lane: LaneKey; readonly expectedVersion: number; readonly decision: Exclude<LaneState, 'NONE'>; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerDecisionReceipt> {
  let response: Response;
  try { response = await fetcher(`/owner-api/product-workspaces/${encodeURIComponent(input.productWorkspaceId)}/b8-decisions`, { method: 'POST', headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ contractVersion: '1.0.0', lane: input.lane, expectedVersion: input.expectedVersion, decision: input.decision }) }); }
  catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    throw new OwnerWriteError(kind, kind === 'conflict' ? 'Lane đã thay đổi bởi một quyết định khác.' : 'OWNER API từ chối yêu cầu.');
  }
  let value: unknown; try { value = await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
  if (!record(value) || value.contractVersion !== '1.0.0' || !uuid(value.decisionId) || !version(value.decisionVersion) || value.lane !== input.lane || value.decision !== input.decision || !dateTime(value.decidedAt) || typeof value.exactRetry !== 'boolean') throw new OwnerWriteError('integrity', 'Biên nhận OWNER API không đúng contract.');
  return { decisionId: value.decisionId, decisionVersion: value.decisionVersion, lane: value.lane, decision: value.decision, decidedAt: value.decidedAt, exactRetry: value.exactRetry };
}

export function ownerDecisionDisabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly effective: LaneState; readonly decision: Exclude<LaneState, 'NONE'> }): boolean { return !input.unlocked || input.pending || input.effective === input.decision; }
export async function submitOwnerDecisionAndReload(input: Parameters<typeof submitOwnerB8Decision>[0], reload: () => Promise<void>, fetcher: typeof fetch = fetch): Promise<'success' | 'conflict'> {
  try { await submitOwnerB8Decision(input, fetcher); await reload(); return 'success'; }
  catch (error) { if (error instanceof OwnerWriteError && error.kind === 'conflict') { await reload(); return 'conflict'; } throw error; }
}

export interface OwnerClearanceReceipt { readonly clearanceId: string; readonly state: 'READY_FOR_B9'; readonly clearedAt: string; readonly exactRetry: boolean }
export type ExactDecisionIds = Readonly<Record<LaneKey, string>>;
export function exactCurrentPassDecisionIds(product: Product): ExactDecisionIds | null {
  if (product.clearance || !laneOrder.every((lane) => product.states[lane] === 'PASS' && uuid(product.decisionIds[lane]))) return null;
  return Object.fromEntries(laneOrder.map((lane) => [lane, product.decisionIds[lane]!])) as Record<LaneKey, string>;
}
export function ownerClearanceDisabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly product: Product }): boolean { return !input.unlocked || input.pending || exactCurrentPassDecisionIds(input.product) === null; }
export function clearanceMatchesCurrent(product: Product): boolean { return product.clearance !== null && laneOrder.every((lane) => product.states[lane] === 'PASS' && product.decisionIds[lane] === product.clearance!.decisionIds[lane]); }
export async function submitOwnerB8Clearance(input: { readonly productWorkspaceId: string; readonly decisionIds: ExactDecisionIds; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerClearanceReceipt> {
  let response: Response;
  try { response = await fetcher(`/owner-api/product-workspaces/${encodeURIComponent(input.productWorkspaceId)}/b8-clearance`, { method: 'POST', headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ contractVersion: '1.0.0', decisionIds: input.decisionIds }) }); }
  catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); }
  if (!response.ok) { const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid'; throw new OwnerWriteError(kind, kind === 'conflict' ? 'Một hoặc nhiều quyết định lane đã thay đổi.' : 'OWNER API từ chối xác nhận clearance.'); }
  let value: unknown; try { value = await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
  if (!record(value) || value.contractVersion !== '1.0.0' || !uuid(value.clearanceId) || value.state !== 'READY_FOR_B9' || !dateTime(value.clearedAt) || typeof value.exactRetry !== 'boolean') throw new OwnerWriteError('integrity', 'Biên nhận clearance không đúng contract.');
  return { clearanceId: value.clearanceId, state: value.state, clearedAt: value.clearedAt, exactRetry: value.exactRetry };
}
export async function submitOwnerClearanceAndReload(input: Parameters<typeof submitOwnerB8Clearance>[0], reload: () => Promise<void>, fetcher: typeof fetch = fetch): Promise<'success' | 'conflict'> {
  try { await submitOwnerB8Clearance(input, fetcher); await reload(); return 'success'; }
  catch (error) { if (error instanceof OwnerWriteError && error.kind === 'conflict') { await reload(); return 'conflict'; } throw error; }
}

export interface StpDraftInput { readonly b8ClearanceId: string; readonly expectedWorkingRevision: string | null; readonly segments: readonly { readonly key: string; readonly label: string; readonly description?: string }[]; readonly primaryTargetSegmentKey: string; readonly secondaryTargetSegmentKeys?: readonly string[]; readonly positioningStatement: string }
export interface OwnerWorkingReceipt { readonly workingStpId: string; readonly productWorkspaceId: string; readonly workingRevision: string; readonly createdAt: string; readonly updatedAt: string; readonly exactRetry: boolean }
export interface OwnerLockReceipt { readonly lockId: string; readonly state: 'LOCKED_STP'; readonly lockedAt: string; readonly exactRetry: boolean }
async function ownerPost(url: string, token: string, body: unknown, fetcher: typeof fetch): Promise<unknown> { let response: Response; try { response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); } catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); } if (!response.ok) { const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid'; throw new OwnerWriteError(kind, kind === 'conflict' ? 'Bản STP đã thay đổi hoặc không còn đủ điều kiện.' : 'OWNER API từ chối yêu cầu B9.'); } try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); } }
export async function submitOwnerB9Working(productWorkspaceId: string, input: StpDraftInput, token: string, fetcher: typeof fetch = fetch): Promise<OwnerWorkingReceipt> { const value = await ownerPost(`/owner-api/product-workspaces/${encodeURIComponent(productWorkspaceId)}/b9/working`, token, { contractVersion: '1.0.0', ...input }, fetcher); if (!record(value) || value.contractVersion !== '1.0.0' || !uuid(value.workingStpId) || value.productWorkspaceId !== productWorkspaceId || !workingRevision(value.workingRevision) || !dateTime(value.createdAt) || !dateTime(value.updatedAt) || typeof value.exactRetry !== 'boolean') throw new OwnerWriteError('integrity', 'Biên nhận working STP không đúng contract.'); return value as OwnerWorkingReceipt; }
export async function submitOwnerB9Lock(productWorkspaceId: string, expectedWorkingRevision: string, token: string, fetcher: typeof fetch = fetch): Promise<OwnerLockReceipt> { const value = await ownerPost(`/owner-api/product-workspaces/${encodeURIComponent(productWorkspaceId)}/b9/lock`, token, { contractVersion: '1.0.0', expectedWorkingRevision }, fetcher); if (!record(value) || value.contractVersion !== '1.0.0' || !uuid(value.lockId) || value.state !== 'LOCKED_STP' || !dateTime(value.lockedAt) || typeof value.exactRetry !== 'boolean') throw new OwnerWriteError('integrity', 'Biên nhận locked STP không đúng contract.'); return value as OwnerLockReceipt; }
export async function submitB9AndReload<T>(submit: () => Promise<T>, reload: () => Promise<void>): Promise<'success' | 'conflict'> { try { await submit(); await reload(); return 'success'; } catch (error) { if (error instanceof OwnerWriteError && error.kind === 'conflict') { await reload(); return 'conflict'; } throw error; } }
export function b9SaveDisabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly locked: boolean; readonly valid: boolean }): boolean { return !input.unlocked || input.pending || input.locked || !input.valid; }
export function b9LockDisabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly locked: boolean; readonly dirty: boolean; readonly revision: string | null }): boolean { return !input.unlocked || input.pending || input.locked || input.dirty || !workingRevision(input.revision); }
export function stableSegmentKey(sequence: number, existing: readonly string[]): string { let key = `segment-${sequence}`; while (existing.includes(key)) key = `segment-${++sequence}`; return key; }

export interface OwnerB10Input { readonly productWorkspaceId: string; readonly lockedStpId: string; readonly previousDecisionId: string | null; readonly decision: 'APPROVE' | 'HOLD' | 'REJECT'; readonly token: string }
export interface OwnerB10Receipt { readonly contractVersion: '1.0.0'; readonly decisionId: string; readonly decisionNumber: number; readonly previousDecisionId: string | null; readonly decision: 'APPROVE' | 'HOLD' | 'REJECT'; readonly decidedAt: string; readonly readyForB11: boolean; readonly exactRetry: boolean }
export async function submitOwnerB10Decision(input: OwnerB10Input, fetcher: typeof fetch = fetch): Promise<OwnerB10Receipt> { let response: Response; try { response = await fetcher(`/owner-api/product-workspaces/${encodeURIComponent(input.productWorkspaceId)}/b10-decisions`, { method: 'POST', headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ contractVersion: '1.0.0', lockedStpId: input.lockedStpId, previousDecisionId: input.previousDecisionId, decision: input.decision }) }); } catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); } if (!response.ok) { const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid'; throw new OwnerWriteError(kind, kind === 'conflict' ? 'Quyết định B10 hiệu lực đã thay đổi.' : 'OWNER API từ chối quyết định B10.'); } let value: unknown; try { value = await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); } if (!record(value) || value.contractVersion !== '1.0.0' || !uuid(value.decisionId) || !version(value.decisionNumber) || !(value.previousDecisionId === null || uuid(value.previousDecisionId)) || !['APPROVE','HOLD','REJECT'].includes(String(value.decision)) || !dateTime(value.decidedAt) || typeof value.readyForB11 !== 'boolean' || typeof value.exactRetry !== 'boolean' || value.readyForB11 !== (value.decision === 'APPROVE')) throw new OwnerWriteError('integrity', 'Biên nhận B10 không đúng contract.'); return value as OwnerB10Receipt; }
export async function submitOwnerB10AndReload(input: OwnerB10Input, reload: () => Promise<void>, fetcher: typeof fetch = fetch): Promise<'success' | 'conflict'> { try { await submitOwnerB10Decision(input, fetcher); await reload(); return 'success'; } catch (error) { if (error instanceof OwnerWriteError && error.kind === 'conflict') { await reload(); return 'conflict'; } throw error; } }
export function ownerB10Disabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly lockedStpId: string | null; readonly effective: 'APPROVE' | 'HOLD' | 'REJECT' | null; readonly decision: 'APPROVE' | 'HOLD' | 'REJECT' }): boolean { return !input.unlocked || input.pending || input.lockedStpId === null || input.effective === input.decision; }


export interface OwnerWorkspaceInput { readonly workspaceKey: string; readonly title: string; readonly description?: string; readonly token: string }
export interface OwnerWorkspaceReceipt { readonly contractVersion: '1.0.0'; readonly workspaceId: string; readonly workspaceKey: string; readonly state: 'ACTIVE'; readonly title: string; readonly description?: string; readonly createdAt: string; readonly exactRetry: boolean }
export function generatedWorkspaceKey(uuid: string = crypto.randomUUID()): string { const compact = uuid.toLowerCase().replace(/-/g, ''); if (!/^[0-9a-f]{32}$/.test(compact)) throw new TypeError('A random UUID is required'); return `market-${compact}`; }
export function ownerWorkspaceDisabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly title: string }): boolean { const title = input.title.trim(); return !input.unlocked || input.pending || title.length === 0 || title.length > 200; }
export async function submitOwnerWorkspace(input: OwnerWorkspaceInput, fetcher: typeof fetch = fetch): Promise<OwnerWorkspaceReceipt> {
  const body = { contractVersion: '1.0.0' as const, workspaceKey: input.workspaceKey, title: input.title, ...(input.description === undefined ? {} : { description: input.description }) };
  let response: Response; try { response = await fetcher('/owner-api/workspaces', { method: 'POST', headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); } catch { throw new OwnerWriteError('connection', 'Kết nối bị gián đoạn. Có thể thử lại an toàn với cùng định danh workspace.'); }
  if (!response.ok) { const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status >= 500 ? 'integrity' : 'invalid'; throw new OwnerWriteError(kind, kind === 'conflict' ? 'Khóa workspace đã được dùng với nội dung khác.' : 'OWNER API từ chối tạo workspace.'); }
  let value: unknown; try { value = await response.json(); } catch { throw new OwnerWriteError('integrity', 'Biên nhận tạo workspace không phải JSON hợp lệ.'); }
  const expectedRetry = response.status === 200 ? true : response.status === 201 ? false : null;
  const expectedKeys = ['contractVersion','workspaceId','workspaceKey','state','title','createdAt','exactRetry', ...(input.description === undefined ? [] : ['description'])].sort();
  if (!record(value) || Object.keys(value).sort().join(',') !== expectedKeys.join(',') || value.contractVersion !== '1.0.0' || !uuid(value.workspaceId) || value.workspaceKey !== input.workspaceKey || value.state !== 'ACTIVE' || value.title !== input.title || value.description !== input.description || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean' || expectedRetry === null || value.exactRetry !== expectedRetry) throw new OwnerWriteError('integrity', 'Biên nhận tạo workspace không đúng contract.');
  return value as OwnerWorkspaceReceipt;
}
export type OwnerWorkspaceOutcome = { readonly kind: 'success'; readonly receipt: OwnerWorkspaceReceipt; readonly state: DemoState } | { readonly kind: 'conflict'; readonly state: DemoState };
export async function submitOwnerWorkspaceAndReload(input: OwnerWorkspaceInput, reload: () => Promise<DemoState>, fetcher: typeof fetch = fetch): Promise<OwnerWorkspaceOutcome> { try { const receipt = await submitOwnerWorkspace(input, fetcher); const state = await reload(); const market = state.markets.find((item) => item.id === receipt.workspaceId); if (!market || market.name !== receipt.title || state.candidates.some((item) => item.marketId === receipt.workspaceId) || state.products.some((item) => item.marketId === receipt.workspaceId)) throw new OwnerWriteError('integrity', 'Workspace mới chưa xuất hiện đúng trạng thái trống trong dữ liệu có thẩm quyền.'); return { kind: 'success', receipt, state }; } catch (error) { if (error instanceof OwnerWriteError && error.kind === 'conflict') return { kind: 'conflict', state: await reload() }; throw error; } }

export interface OwnerCandidateInput { readonly workspaceId: string; readonly candidateKey: string; readonly label: string; readonly summary?: string; readonly token: string }
export interface OwnerCandidateRevisionInput { readonly workspaceId: string; readonly candidateId: string; readonly expectedVersion: number; readonly label: string; readonly summary?: string; readonly token: string }
export interface OwnerCandidateReceipt { readonly contractVersion: '1.0.0'; readonly candidateId: string; readonly workspaceId: string; readonly candidateKey: string; readonly state: 'EXPLORING'; readonly version: number; readonly label: string; readonly summary?: string; readonly createdAt: string; readonly exactRetry: boolean }
export function generatedCandidateKey(uuidValue: string = crypto.randomUUID()): string { const compact = uuidValue.toLowerCase().replace(/-/g, ''); if (!/^[0-9a-f]{32}$/.test(compact)) throw new TypeError('A random UUID is required'); return `candidate-${compact}`; }
export function ownerCandidateDisabled(input: { readonly unlocked: boolean; readonly pending: boolean; readonly label: string; readonly summary: string }): boolean { const label=input.label.trim(), summary=input.summary.trim(); return !input.unlocked || input.pending || !label || label.length>200 || summary.length>1000; }
async function submitOwnerCandidateRequest(input: OwnerCandidateInput | OwnerCandidateRevisionInput, fetcher: typeof fetch): Promise<OwnerCandidateReceipt> {
  const revision = 'candidateId' in input;
  const url = revision ? `/owner-api/workspaces/${encodeURIComponent(input.workspaceId)}/candidates/${encodeURIComponent(input.candidateId)}/revisions` : `/owner-api/workspaces/${encodeURIComponent(input.workspaceId)}/candidates`;
  const body = revision ? { contractVersion:'1.0.0', expectedVersion:input.expectedVersion, label:input.label, ...(input.summary===undefined?{}:{summary:input.summary}) } : { contractVersion:'1.0.0', candidateKey:input.candidateKey, label:input.label, ...(input.summary===undefined?{}:{summary:input.summary}) };
  let response:Response; try { response=await fetcher(url,{method:'POST',headers:{Authorization:`Bearer ${input.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)}); } catch { throw new OwnerWriteError('connection','Kết nối bị gián đoạn. Biểu mẫu giữ nguyên định danh để có thể thử lại an toàn.'); }
  if(!response.ok){ const kind:OwnerWriteFailure=response.status===401?'unauthorized':response.status===403?'forbidden':response.status===409?'conflict':response.status===404?'not_found':response.status>=500?'integrity':'invalid'; throw new OwnerWriteError(kind,kind==='conflict'?'Ứng viên đã thay đổi hoặc định danh đã được dùng với nội dung khác.':'OWNER API từ chối yêu cầu ứng viên.'); }
  let value:unknown; try{value=await response.json();}catch{throw new OwnerWriteError('integrity','Biên nhận ứng viên không phải JSON hợp lệ.');}
  const expectedVersion=revision?input.expectedVersion+1:1, expectedRetry=response.status===200?true:response.status===201?false:null;
  const expectedKeys=['contractVersion','candidateId','workspaceId','candidateKey','state','version','label','createdAt','exactRetry',...(input.summary===undefined?[]:['summary'])].sort().join(',');
  if(!record(value)||Object.keys(value).sort().join(',')!==expectedKeys||value.contractVersion!=='1.0.0'||!uuid(value.candidateId)||value.workspaceId!==input.workspaceId||!candidateKey(value.candidateKey)|| value.state!=='EXPLORING'||value.version!==expectedVersion||value.label!==input.label||value.summary!==input.summary||!dateTime(value.createdAt)||expectedRetry===null||value.exactRetry!==expectedRetry||(revision&&value.candidateId!==input.candidateId)) throw new OwnerWriteError('integrity','Biên nhận ứng viên không đúng contract.');
  if(!revision&&value.candidateKey!==input.candidateKey) throw new OwnerWriteError('integrity','Biên nhận ứng viên không đúng định danh.');
  return value as OwnerCandidateReceipt;
}
export const submitOwnerCandidate=(input:OwnerCandidateInput,fetcher:typeof fetch=fetch)=>submitOwnerCandidateRequest(input,fetcher);
export const submitOwnerCandidateRevision=(input:OwnerCandidateRevisionInput,fetcher:typeof fetch=fetch)=>submitOwnerCandidateRequest(input,fetcher);
export type OwnerCandidateOutcome={readonly kind:'success';readonly receipt:OwnerCandidateReceipt;readonly state:DemoState}|{readonly kind:'conflict';readonly state:DemoState};
export async function submitOwnerCandidateAndReload(input:OwnerCandidateInput|OwnerCandidateRevisionInput,reload:()=>Promise<DemoState>,fetcher:typeof fetch=fetch):Promise<OwnerCandidateOutcome>{try{const receipt=await submitOwnerCandidateRequest(input,fetcher);const state=await reload();const candidate=state.candidates.find(item=>item.id===receipt.candidateId&&item.marketId===receipt.workspaceId);if(!candidate||candidate.key!==receipt.candidateKey||candidate.version!==receipt.version||candidate.name!==receipt.label||candidate.summary!==(receipt.summary??''))throw new OwnerWriteError('integrity','Ứng viên chưa xuất hiện đúng ID và phiên bản trong dữ liệu có thẩm quyền.');return{kind:'success',receipt,state};}catch(error){if(error instanceof OwnerWriteError&&error.kind==='conflict')return{kind:'conflict',state:await reload()};throw error;}}

export interface OwnerBasketSelection { readonly candidateId: string; readonly candidateVersion: number }
export interface OwnerBasketInput { readonly workspaceId: string; readonly basketKey: string; readonly version: number; readonly candidates: readonly OwnerBasketSelection[]; readonly token: string }
export interface OwnerBasketReceipt { readonly contractVersion: '1.0.0'; readonly basketId: string; readonly workspaceId: string; readonly basketKey: string; readonly version: number; readonly frozenAt: string; readonly candidateCount: number; readonly exactRetry: boolean }
export function generatedBasketKey(uuidValue: string = crypto.randomUUID()): string { const compact=uuidValue.toLowerCase().replace(/-/g,''); if(!/^[0-9a-f]{32}$/.test(compact)) throw new TypeError('A random UUID is required'); return `basket-${compact}`; }
export function ownerBasketDisabled(input:{readonly unlocked:boolean;readonly pending:boolean;readonly selectedCount:number}):boolean{return !input.unlocked||input.pending||input.selectedCount<1;}
export async function submitOwnerBasket(input:OwnerBasketInput,fetcher:typeof fetch=fetch):Promise<OwnerBasketReceipt>{
  const body={contractVersion:'1.0.0' as const,basketKey:input.basketKey,version:input.version,candidates:input.candidates}; let response:Response;
  try{response=await fetcher(`/owner-api/workspaces/${encodeURIComponent(input.workspaceId)}/candidate-baskets`,{method:'POST',headers:{Authorization:`Bearer ${input.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});}catch{throw new OwnerWriteError('connection','Kết nối bị gián đoạn. Lựa chọn và định danh rổ được giữ để có thể thử lại an toàn.');}
  if(!response.ok){const kind:OwnerWriteFailure=response.status===401?'unauthorized':response.status===403?'forbidden':response.status===409?'conflict':response.status===404?'not_found':response.status>=500?'integrity':'invalid';throw new OwnerWriteError(kind,kind==='conflict'?'Rổ ứng viên hoặc phiên bản ứng viên đã thay đổi.':'OWNER API từ chối đóng băng rổ ứng viên.');}
  let value:unknown;try{value=await response.json();}catch{throw new OwnerWriteError('integrity','Biên nhận rổ ứng viên không phải JSON hợp lệ.');}const expectedRetry=response.status===200;
  if(!record(value)||Object.keys(value).sort().join(',')!=='basketId,basketKey,candidateCount,contractVersion,exactRetry,frozenAt,version,workspaceId'||value.contractVersion!=='1.0.0'||!uuid(value.basketId)||value.workspaceId!==input.workspaceId||value.basketKey!==input.basketKey||value.version!==input.version||!dateTime(value.frozenAt)||value.candidateCount!==input.candidates.length||value.exactRetry!==expectedRetry||(response.status!==200&&response.status!==201))throw new OwnerWriteError('integrity','Biên nhận rổ ứng viên không đúng contract.');return value as OwnerBasketReceipt;
}
export type OwnerBasketOutcome={readonly kind:'success';readonly receipt:OwnerBasketReceipt;readonly state:DemoState}|{readonly kind:'conflict';readonly state:DemoState};
export async function submitOwnerBasketAndReload(input:OwnerBasketInput,reload:()=>Promise<DemoState>,fetcher:typeof fetch=fetch):Promise<OwnerBasketOutcome>{try{const receipt=await submitOwnerBasket(input,fetcher);const state=await reload();const basket=state.baskets.find(item=>item.id===receipt.basketId&&item.marketId===receipt.workspaceId);if(!basket||basket.key!==receipt.basketKey||basket.version!==receipt.version||basket.candidates.length!==receipt.candidateCount||!sameBasketSelections(basket.candidates,input.candidates))throw new OwnerWriteError('integrity','Rổ mới chưa xuất hiện đúng snapshot trong dữ liệu có thẩm quyền.');return{kind:'success',receipt,state};}catch(error){if(error instanceof OwnerWriteError&&error.kind==='conflict')return{kind:'conflict',state:await reload()};throw error;}}

function sameBasketSelections(members: CandidateBasket['candidates'], selections: readonly OwnerBasketSelection[]): boolean {
  const expected = [...selections].sort((left, right) => left.candidateId < right.candidateId ? -1 : left.candidateId > right.candidateId ? 1 : left.candidateVersion - right.candidateVersion);
  return members.every((member, index) => member.candidateId === expected[index]?.candidateId && member.candidateVersion === expected[index]?.candidateVersion);
}

export function expectedLatestBasketVersion(baskets: readonly CandidateBasket[], workspaceId: string, basketKey: string): number | null {
  return latestBasketVersion(baskets, workspaceId, basketKey);
}

export interface OwnerB7Input { readonly workspaceId: string; readonly basketId: string; readonly candidateId: string; readonly candidateVersion: number; readonly decision: 'PASS'|'HOLD'|'REJECT'; readonly token: string }
export interface OwnerB7Receipt { readonly contractVersion:'1.0.0'; readonly decisionId:string; readonly workspaceId:string; readonly basketId:string; readonly candidateId:string; readonly candidateVersion:number; readonly decision:'PASS'|'HOLD'|'REJECT'; readonly decidedAt:string; readonly exactRetry:boolean }
export function ownerB7Disabled(input:{readonly unlocked:boolean;readonly pending:boolean;readonly complete:boolean;readonly effective:'NO_DECISION'|'PASS'|'HOLD'|'REJECT'}):boolean{return !input.unlocked||input.pending||!input.complete||input.effective!=='NO_DECISION';}
export async function submitOwnerB7Decision(input:OwnerB7Input,fetcher:typeof fetch=fetch):Promise<OwnerB7Receipt>{
  const body={contractVersion:'1.0.0' as const,candidateId:input.candidateId,candidateVersion:input.candidateVersion,decision:input.decision}; let response:Response;
  try{response=await fetcher(`/owner-api/workspaces/${encodeURIComponent(input.workspaceId)}/candidate-baskets/${encodeURIComponent(input.basketId)}/b7-decisions`,{method:'POST',headers:{Authorization:`Bearer ${input.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});}catch{throw new OwnerWriteError('connection','Kết nối bị gián đoạn. Có thể thử lại an toàn với đúng snapshot quyết định B7 này.');}
  if(!response.ok){const kind:OwnerWriteFailure=response.status===409?'conflict':response.status===401?'unauthorized':response.status===403?'forbidden':response.status===404?'not_found':response.status>=500?'integrity':'invalid';throw new OwnerWriteError(kind,kind==='conflict'?'Ứng viên đóng băng đã có quyết định B7.':'OWNER API từ chối quyết định B7.');}
  let value:unknown;try{value=await response.json();}catch{throw new OwnerWriteError('integrity','Biên nhận B7 không phải JSON hợp lệ.');}const expectedRetry=response.status===200;
  if(!record(value)||Object.keys(value).sort().join(',')!=='basketId,candidateId,candidateVersion,contractVersion,decidedAt,decision,decisionId,exactRetry,workspaceId'||value.contractVersion!=='1.0.0'||!uuid(value.decisionId)||value.workspaceId!==input.workspaceId||value.basketId!==input.basketId||value.candidateId!==input.candidateId||value.candidateVersion!==input.candidateVersion||value.decision!==input.decision||!dateTime(value.decidedAt)||value.exactRetry!==expectedRetry||(response.status!==200&&response.status!==201))throw new OwnerWriteError('integrity','Biên nhận B7 không đúng contract hoặc snapshot yêu cầu.');
  return value as OwnerB7Receipt;
}
export type OwnerB7Outcome={readonly kind:'success';readonly receipt:OwnerB7Receipt;readonly state:DemoState}|{readonly kind:'conflict';readonly state:DemoState};
export async function submitOwnerB7AndReload(input:OwnerB7Input,reload:()=>Promise<DemoState>,fetcher:typeof fetch=fetch):Promise<OwnerB7Outcome>{try{const receipt=await submitOwnerB7Decision(input,fetcher);const state=await reload();const member=state.baskets.find(item=>item.id===input.basketId&&item.marketId===input.workspaceId)?.candidates.find(item=>item.candidateId===input.candidateId&&item.candidateVersion===input.candidateVersion);if(!member||member.b7DecisionId!==receipt.decisionId||member.b7State!==receipt.decision)throw new OwnerWriteError('integrity','Quyết định B7 chưa xuất hiện đúng ID, trạng thái và snapshot trong dữ liệu có thẩm quyền.');return{kind:'success',receipt,state};}catch(error){if(error instanceof OwnerWriteError&&error.kind==='conflict')return{kind:'conflict',state:await reload()};throw error;}}


export interface OwnerProductWorkspaceInput { readonly workspaceId:string; readonly basketId:string; readonly candidateId:string; readonly candidateVersion:number; readonly decisionId:string; readonly productWorkspaceKey:string; readonly token:string }
export interface OwnerProductWorkspaceReceipt { readonly contractVersion:'1.0.0'; readonly productWorkspaceId:string; readonly productWorkspaceKey:string; readonly workspaceId:string; readonly basketId:string; readonly candidateId:string; readonly candidateVersion:number; readonly b7DecisionId:string; readonly state:'ACTIVE'; readonly entryStep:'B8'; readonly title:string; readonly createdAt:string; readonly exactRetry:boolean }
export function generatedProductWorkspaceKey(uuidValue:string=crypto.randomUUID()):string{const compact=uuidValue.toLowerCase().replace(/-/g,'');if(!/^[0-9a-f]{32}$/.test(compact))throw new TypeError('A random UUID is required');return `product-${compact}`;}
export async function submitOwnerProductWorkspace(input:OwnerProductWorkspaceInput,fetcher:typeof fetch=fetch):Promise<OwnerProductWorkspaceReceipt>{
  const body={contractVersion:'1.0.0' as const,productWorkspaceKey:input.productWorkspaceKey};let response:Response;
  try{response=await fetcher(`/owner-api/workspaces/${encodeURIComponent(input.workspaceId)}/candidate-baskets/${encodeURIComponent(input.basketId)}/b7-decisions/${encodeURIComponent(input.decisionId)}/product-workspace`,{method:'POST',headers:{Authorization:`Bearer ${input.token}`,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(body)});}catch{throw new OwnerWriteError('connection','Kết nối bị gián đoạn. Định danh workspace được giữ để thử lại an toàn.');}
  if(!response.ok){const kind:OwnerWriteFailure=response.status===409?'conflict':response.status===401?'unauthorized':response.status===403?'forbidden':response.status===404?'not_found':response.status>=500?'integrity':'invalid';throw new OwnerWriteError(kind,kind==='conflict'?'B7 PASS hoặc khóa workspace đã được dùng với định danh khác.':'OWNER API từ chối tạo workspace sản phẩm.');}
  let value:unknown;try{value=await response.json();}catch{throw new OwnerWriteError('integrity','Biên nhận workspace sản phẩm không phải JSON hợp lệ.');}const expectedRetry=response.status===200;
  if(!record(value)||Object.keys(value).sort().join(',')!=='b7DecisionId,basketId,candidateId,candidateVersion,contractVersion,createdAt,entryStep,exactRetry,productWorkspaceId,productWorkspaceKey,state,title,workspaceId'||value.contractVersion!=='1.0.0'||!uuid(value.productWorkspaceId)||value.productWorkspaceKey!==input.productWorkspaceKey||value.workspaceId!==input.workspaceId||value.basketId!==input.basketId||value.candidateId!==input.candidateId||value.candidateVersion!==input.candidateVersion||value.b7DecisionId!==input.decisionId||value.state!=='ACTIVE'||value.entryStep!=='B8'||!text(value.title)||!dateTime(value.createdAt)||value.exactRetry!==expectedRetry||(response.status!==200&&response.status!==201))throw new OwnerWriteError('integrity','Biên nhận workspace sản phẩm không đúng contract hoặc nguồn B7.');return value as OwnerProductWorkspaceReceipt;
}
export type OwnerProductWorkspaceOutcome={readonly kind:'success';readonly receipt:OwnerProductWorkspaceReceipt;readonly state:DemoState}|{readonly kind:'conflict';readonly state:DemoState};
export async function submitOwnerProductWorkspaceAndReload(input:OwnerProductWorkspaceInput,reload:()=>Promise<DemoState>,fetcher:typeof fetch=fetch):Promise<OwnerProductWorkspaceOutcome>{try{const receipt=await submitOwnerProductWorkspace(input,fetcher);const state=await reload();const member=state.baskets.find(item=>item.id===input.basketId&&item.marketId===input.workspaceId)?.candidates.find(item=>item.candidateId===input.candidateId&&item.candidateVersion===input.candidateVersion&&item.b7DecisionId===input.decisionId);const product=member?.productWorkspace;if(!product||product.id!==receipt.productWorkspaceId||product.key!==receipt.productWorkspaceKey||product.title!==receipt.title||product.state!=='ACTIVE'||product.entryStep!=='B8'||product.createdAt!==formatTime(receipt.createdAt)||!state.products.some(item=>item.id===receipt.productWorkspaceId&&item.marketId===receipt.workspaceId&&item.basketId===receipt.basketId&&item.candidateId===receipt.candidateId&&item.candidateVersion===receipt.candidateVersion))throw new OwnerWriteError('integrity','Workspace sản phẩm chưa xuất hiện đúng nguồn B7 trong dữ liệu có thẩm quyền.');return{kind:'success',receipt,state};}catch(error){if(error instanceof OwnerWriteError&&error.kind==='conflict')return{kind:'conflict',state:await reload()};throw error;}}
