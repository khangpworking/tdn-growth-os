import { laneOrder } from './model';
import type { Candidate, DemoState, LaneKey, LaneState, Market, Product } from './model';
import type { DiscoveryWorkspaceDetailResponse, ProductWorkspaceDetailResponse, WorkspacePortfolioResponse } from '../../contracts/api/workspace-api.generated';

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
  const summaries = details.flatMap((detail) => detail.products.map((product) => ({ product, workspaceId: detail.workspace.workspaceId })));
  const productDetails = await Promise.all(summaries.map(async ({ product, workspaceId }) => {
    const value = await requestJson(`/api/product-workspaces/${encodeURIComponent(product.productWorkspaceId)}`, fetcher);
    assertProduct(value, product.productWorkspaceId);
    if (!sameProductSummary(value.product, product) || value.product.sourceWorkspaceId !== workspaceId) invalid('Chi tiết product workspace không khớp discovery.');
    return value;
  }));
  const productById = uniqueMap(productDetails, (detail) => detail.product.productWorkspaceId, 'Product workspace bị lặp.');
  const markets: Market[] = details.map((detail) => ({ id: detail.workspace.workspaceId, name: detail.workspace.title, keywords: '', note: detail.workspace.description ?? 'Chưa có mô tả workspace.' }));
  const products: Product[] = [];
  const candidates: Candidate[] = [];
  for (const detail of details) {
    for (const candidate of detail.candidates) {
      const linked = productDetails.find((product) => product.product.sourceWorkspaceId === detail.workspace.workspaceId && product.product.sourceCandidateId === candidate.candidateId && product.product.sourceCandidateVersion === candidate.version);
      candidates.push({ id: candidate.candidateId, marketId: detail.workspace.workspaceId, version: candidate.version, name: candidate.label, productId: linked?.product.productWorkspaceId ?? null });
    }
    for (const summary of detail.products) {
      const source = productById.get(summary.productWorkspaceId);
      if (!source) invalid('Thiếu chi tiết product workspace.');
      const states = Object.fromEntries(laneOrder.map((lane) => { const value = source.b8.lanes.find((item) => item.lane === lane)!.effectiveState; return [lane, value === 'NO_DECISION' ? 'NONE' : value]; })) as Record<LaneKey, LaneState>;
      products.push({
        id: source.product.productWorkspaceId,
        marketId: source.product.sourceWorkspaceId,
        candidateId: source.product.sourceCandidateId,
        candidateVersion: source.product.sourceCandidateVersion,
        name: source.product.title,
        summary: source.product.sourceCandidateSummary ?? source.product.sourceCandidateLabel,
        states,
        history: source.b8.lanes.filter((lane) => lane.effectiveState !== 'NO_DECISION').map((lane) => ({ id: lane.decisionId!, lane: lane.lane, state: lane.effectiveState as Exclude<LaneState, 'NONE'>, time: formatTime(lane.decidedAt!) })),
        clearance: source.clearance ? { id: source.clearance.clearanceId, time: formatTime(source.clearance.clearedAt), decisionIds: Object.fromEntries(source.clearance.decisions.map((decision) => [decision.lane, decision.decisionId])) as Record<LaneKey, string> } : null,
      });
    }
  }
  return { markets, candidates, products, sequence: 1 };
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
function uniqueMap<T>(values: readonly T[], key: (value: T) => string, message: string): Map<string, T> { const result = new Map<string, T>(); for (const value of values) { const id = key(value); if (result.has(id)) invalid(message); result.set(id, value); } return result; }
function invalid(message: string): never { throw new WorkspaceDataSourceError('integrity', message); }
function record(value: unknown): value is Record<string, any> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function uuid(value: unknown): value is string { return typeof value === 'string' && UUID.test(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length > 0; }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 1; }
function count(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 0; }
function dateTime(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)); }
function formatTime(value: string): string { return new Date(value).toLocaleString('vi-VN'); }
