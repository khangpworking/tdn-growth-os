import type {
  ContentInsightContent,
  ContentInsightDetailResponse,
  ContentInsightGate,
  ContentInsightStpSuggestion,
} from '../../contracts/api/content-api.generated';
import type { OwnerContentInsightLockReceipt, OwnerContentInsightRevisionReceipt } from '../../contracts/api/owner-content-insight-api.generated';
import { dateTime, exactKeys, invalid, readJson, record, uuid, version as positiveVersion } from './content-data-source';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';

export type InsightDetail = ContentInsightDetailResponse;

export interface InsightDraft {
  readonly customer: string;
  readonly painPoint: string;
  readonly insight: string;
  /** Set while the draft still carries the text applied from a locked STP; cleared as soon as the owner types over it. */
  readonly lockedStpId: string;
}

export const emptyInsightDraft = (): InsightDraft => ({ customer: '', painPoint: '', insight: '', lockedStpId: '' });

export function draftFromInsight(detail: InsightDetail): InsightDraft {
  const latest = detail.latest?.insight;
  if (!latest) return emptyInsightDraft();
  return { customer: latest.customer, painPoint: latest.painPoint, insight: latest.insight, lockedStpId: latest.source.kind === 'STP' ? latest.source.lockedStpId : '' };
}

const chars = (value: string): number => [...value.trim()].length;

export function insightDraftBlocker(draft: InsightDraft): string | null {
  if (!draft.customer.trim()) return 'Nhập khách hàng mục tiêu.';
  if (chars(draft.customer) > 500) return 'Khách hàng mục tiêu tối đa 500 ký tự.';
  if (!draft.painPoint.trim()) return 'Nhập nỗi đau của khách hàng.';
  if (chars(draft.painPoint) > 1000) return 'Nỗi đau tối đa 1000 ký tự.';
  if (!draft.insight.trim()) return 'Nhập insight.';
  if (chars(draft.insight) > 2000) return 'Insight tối đa 2000 ký tự.';
  return null;
}

export function insightRequestFromDraft(draft: InsightDraft): ContentInsightContent {
  return {
    customer: draft.customer.trim(),
    painPoint: draft.painPoint.trim(),
    insight: draft.insight.trim(),
    source: draft.lockedStpId ? { kind: 'STP', lockedStpId: draft.lockedStpId } : { kind: 'TYPED' },
  };
}

export function sameInsightContent(left: InsightDraft, right: InsightDraft): boolean {
  return JSON.stringify(insightRequestFromDraft(left)) === JSON.stringify(insightRequestFromDraft(right));
}

/** Applies the STP suggestion without touching the pain point, which STP does not describe. */
export function applyStpSuggestion(draft: InsightDraft, suggestion: ContentInsightStpSuggestion): InsightDraft {
  return { ...draft, customer: suggestion.customer, insight: suggestion.insight, lockedStpId: suggestion.lockedStpId };
}

/** Editing the customer or insight away from the applied STP text makes the insight owner-typed again. */
export function editInsightDraft(draft: InsightDraft, field: 'customer' | 'painPoint' | 'insight', value: string): InsightDraft {
  const next = { ...draft, [field]: value };
  return field === 'painPoint' ? next : { ...next, lockedStpId: '' };
}

export type InsightStage = 'deleted' | 'locked' | 'empty' | 'blocked' | 'lockable';

/** One stage per screen state: the campaign, the lock and the B10 gate decide which actions the owner sees. */
export function insightStage(detail: InsightDetail): InsightStage {
  if (detail.lock) return 'locked';
  if (detail.campaignDeleted) return 'deleted';
  if (!detail.latest) return 'empty';
  if (detail.gate.required && !detail.gate.ready) return 'blocked';
  return 'lockable';
}

function source(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.kind === 'TYPED') return exactKeys(value, ['kind']);
  return value.kind === 'STP' && exactKeys(value, ['kind', 'lockedStpId']) && uuid(value.lockedStpId);
}

const trimmed = (value: unknown, max: number): boolean => typeof value === 'string' && value.length >= 1 && value.length <= max && value.trim() === value;

function content(value: unknown): value is ContentInsightContent {
  return record(value) && exactKeys(value, ['customer', 'insight', 'painPoint', 'source']) && trimmed(value.customer, 500) && trimmed(value.painPoint, 1000)
    && trimmed(value.insight, 2000) && source(value.source);
}

function gate(value: unknown): value is ContentInsightGate {
  if (!record(value) || typeof value.required !== 'boolean' || typeof value.ready !== 'boolean') return false;
  if (!exactKeys(value, ['ready', 'required', ...(['effectiveDecision', 'productWorkspaceId', 'reason'] as const).filter((key) => key in value)])) return false;
  return (!('productWorkspaceId' in value) || uuid(value.productWorkspaceId)) && (!('reason' in value) || typeof value.reason === 'string')
    && (!('effectiveDecision' in value) || value.effectiveDecision === 'APPROVE' || value.effectiveDecision === 'HOLD' || value.effectiveDecision === 'REJECT');
}

function b10(value: unknown): boolean {
  return record(value) && exactKeys(value, ['effectiveDecision', 'effectiveDecisionId', 'effectiveDecisionNumber', 'lockedStpId', 'productWorkspaceId'])
    && value.effectiveDecision === 'APPROVE' && uuid(value.effectiveDecisionId) && positiveVersion(value.effectiveDecisionNumber) && uuid(value.lockedStpId) && uuid(value.productWorkspaceId);
}

export async function loadInsight(campaignId: string, fetcher: typeof fetch = fetch): Promise<InsightDetail | null> {
  const value = await readJson(`/api/content/campaigns/${encodeURIComponent(campaignId)}/insight`, fetcher);
  if (value === null) return null;
  const optional = (['latest', 'lock', 'stpSuggestion'] as const).filter((key) => record(value) && key in value);
  if (!record(value) || !exactKeys(value, ['campaignDeleted', 'campaignId', 'campaignVersion', 'contractVersion', 'gate', 'history', ...optional]) || value.contractVersion !== '1.0.0'
    || value.campaignId !== campaignId || !positiveVersion(value.campaignVersion) || typeof value.campaignDeleted !== 'boolean' || !gate(value.gate)) invalid();
  const history = value.history;
  if (!Array.isArray(history) || !history.every((entry, index) => record(entry) && exactKeys(entry, ['createdAt', 'sourceKind', 'version']) && entry.version === index + 1
    && (entry.sourceKind === 'TYPED' || entry.sourceKind === 'STP') && dateTime(entry.createdAt))) invalid();
  const latest = value.latest;
  if (latest === undefined ? history.length !== 0 : !record(latest) || !exactKeys(latest, ['createdAt', 'insight', 'version']) || latest.version !== history.length || !content(latest.insight) || !dateTime(latest.createdAt)) invalid();
  const lock = value.lock;
  if (lock !== undefined && (!record(lock) || !exactKeys(lock, ['campaignVersion', 'insightVersion', 'lockedAt', ...('b10' in lock ? ['b10'] : [])]) || lock.insightVersion !== history.length
    || !positiveVersion(lock.campaignVersion) || !dateTime(lock.lockedAt) || ('b10' in lock && !b10(lock.b10)))) invalid();
  const suggestion = value.stpSuggestion;
  if (suggestion !== undefined && (!record(suggestion) || !exactKeys(suggestion, ['customer', 'insight', 'lockedStpId']) || !uuid(suggestion.lockedStpId)
    || !trimmed(suggestion.customer, 500) || !trimmed(suggestion.insight, 2000))) invalid();
  return value as unknown as InsightDetail;
}

async function ownerJson(url: string, token: string, body: unknown, fetcher: typeof fetch, conflictMessage: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.');
  }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    let serverMessage: string | null = null;
    if (kind === 'conflict') {
      try {
        const payload: unknown = await response.json();
        // The B10 gate explains itself in Vietnamese; every other conflict uses the screen's own wording.
        if (record(payload) && record(payload.error) && typeof payload.error.message === 'string' && /B10/.test(payload.error.message)) serverMessage = payload.error.message;
      } catch { /* fall back to the generic conflict wording */ }
    }
    throw new OwnerWriteError(kind, kind === 'conflict' ? serverMessage ?? conflictMessage
      : kind === 'invalid' ? 'OWNER API từ chối Insight: kiểm tra nội dung và liên kết STP.'
      : kind === 'integrity' ? 'Dữ liệu đã lưu không vượt qua kiểm tra toàn vẹn; không có gì được ghi.'
      : 'OWNER API từ chối yêu cầu.');
  }
  try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
}

export async function submitInsightRevision(input: { readonly campaignId: string; readonly expectedVersion: number; readonly insight: ContentInsightContent; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentInsightRevisionReceipt> {
  const value = await ownerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/insight/revisions`, input.token,
    { contractVersion: '1.0.0', expectedVersion: input.expectedVersion, insight: input.insight }, fetcher, 'Insight đã thay đổi ở nơi khác, đã bị khóa hoặc chiến dịch đã bị xóa. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['campaignId', 'contractVersion', 'createdAt', 'exactRetry', 'version']) || value.contractVersion !== '1.0.0' || value.campaignId !== input.campaignId
    || value.version !== input.expectedVersion + 1 || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentInsightRevisionReceipt;
}

export async function submitInsightLock(input: { readonly campaignId: string; readonly insightVersion: number; readonly campaignVersion: number; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentInsightLockReceipt> {
  const value = await ownerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/insight/lock`, input.token,
    { contractVersion: '1.0.0', insightVersion: input.insightVersion, campaignVersion: input.campaignVersion }, fetcher, 'Insight hoặc chiến dịch đã thay đổi trước khi khóa. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['campaignId', 'campaignVersion', 'contractVersion', 'exactRetry', 'insightVersion', 'lockedAt']) || value.contractVersion !== '1.0.0'
    || value.campaignId !== input.campaignId || value.insightVersion !== input.insightVersion || value.campaignVersion !== input.campaignVersion
    || !dateTime(value.lockedAt) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentInsightLockReceipt;
}

/** What the demo knows about a linked research product: its effective B10 decision and, once STP is locked, the suggestion. */
export interface DemoResearchProduct {
  readonly id: string;
  readonly b10: 'APPROVE' | 'HOLD' | 'REJECT' | null;
  readonly stp: ContentInsightStpSuggestion | null;
}

export interface DemoInsight {
  readonly campaignId: string;
  readonly versions: readonly { readonly version: number; readonly insight: ContentInsightContent; readonly createdAt: string }[];
  readonly lock?: { readonly insightVersion: number; readonly campaignVersion: number; readonly lockedAt: string };
}

export const INSIGHT_GATE_NOT_APPROVED = 'Sản phẩm nghiên cứu chưa được duyệt ở B10 — chưa thể khóa Insight';

export function demoInsightGate(researchProductWorkspaceId: string | undefined, products: readonly DemoResearchProduct[]): ContentInsightGate {
  if (!researchProductWorkspaceId) return { required: false, ready: true };
  const product = products.find((entry) => entry.id === researchProductWorkspaceId);
  const decision = product?.b10 ?? null;
  return decision === 'APPROVE'
    ? { required: true, ready: true, effectiveDecision: 'APPROVE' }
    : { required: true, ready: false, ...(decision ? { effectiveDecision: decision } : {}), reason: INSIGHT_GATE_NOT_APPROVED };
}

export function demoInsightDetail(insights: readonly DemoInsight[], campaign: { readonly campaignId: string; readonly version: number; readonly deleted: boolean; readonly researchProductWorkspaceId?: string }, products: readonly DemoResearchProduct[]): InsightDetail {
  const entry = insights.find((candidate) => candidate.campaignId === campaign.campaignId);
  const latest = entry?.versions[entry.versions.length - 1];
  const gateValue = demoInsightGate(campaign.researchProductWorkspaceId, products);
  const stp = campaign.researchProductWorkspaceId ? products.find((product) => product.id === campaign.researchProductWorkspaceId)?.stp ?? null : null;
  return {
    contractVersion: '1.0.0',
    campaignId: campaign.campaignId,
    campaignVersion: campaign.version,
    campaignDeleted: campaign.deleted,
    ...(latest ? { latest } : {}),
    history: (entry?.versions ?? []).map((version) => ({ version: version.version, sourceKind: version.insight.source.kind, createdAt: version.createdAt })),
    ...(entry?.lock ? { lock: entry.lock } : {}),
    gate: { ...gateValue, ...(campaign.researchProductWorkspaceId ? { productWorkspaceId: campaign.researchProductWorkspaceId } : {}) },
    ...(stp ? { stpSuggestion: stp } : {}),
  };
}

export function reviseDemoInsight(insights: readonly DemoInsight[], campaignId: string, expectedVersion: number, draft: InsightDraft, now: string): DemoInsight[] {
  const entry = insights.find((candidate) => candidate.campaignId === campaignId) ?? { campaignId, versions: [] };
  if (entry.lock) throw new Error('Demo insight is locked');
  if (entry.versions.length !== expectedVersion) throw new Error('Demo insight revision conflict');
  const next = { ...entry, versions: [...entry.versions, { version: expectedVersion + 1, insight: insightRequestFromDraft(draft), createdAt: now }] };
  return [...insights.filter((candidate) => candidate.campaignId !== campaignId), next];
}

export function lockDemoInsight(insights: readonly DemoInsight[], campaignId: string, insightVersion: number, campaignVersion: number, now: string): DemoInsight[] {
  return insights.map((entry) => {
    if (entry.campaignId !== campaignId) return entry;
    if (entry.lock || entry.versions.length !== insightVersion) throw new Error('Demo insight lock conflict');
    return { ...entry, lock: { insightVersion, campaignVersion, lockedAt: now } };
  });
}
