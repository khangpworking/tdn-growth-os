import type { ContentIdeaListEntry, ContentIdeaListResponse, ContentPurposeTagEntry } from '../../contracts/api/content-api.generated';
import type {
  OwnerContentIdeaGenerateRequest,
  OwnerContentIdeaReceipt,
  OwnerContentIdeaStateAction,
  OwnerContentIdeaStateReceipt,
  OwnerContentPurposeKind,
  OwnerContentPurposeTagReceipt,
} from '../../contracts/api/owner-content-idea-api.generated';
import type { ContentIdeaKind, ContentIdeaModel, ContentIdeaPromptChoice } from '../../contracts/flow/content-idea-generate-request.generated';
import { dateTime, exactKeys, invalid, readJson, record, uuid } from './content-data-source';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';

export type IdeaList = ContentIdeaListResponse;
export type IdeaEntry = ContentIdeaListEntry;
export type PurposeTag = ContentPurposeTagEntry;
export type IdeaKind = ContentIdeaKind;
export type IdeaModel = ContentIdeaModel;
export type PurposeKind = OwnerContentPurposeKind;

export const IDEA_MODELS: readonly { readonly key: IdeaModel; readonly label: string }[] = [
  { key: 'gpt-5.6-sol', label: 'GPT-5.6 Sol' },
  { key: 'gpt-5.6-luna', label: 'GPT-5.6 Luna' },
  { key: 'gemini-3.5-flash-low', label: 'Gemini 3.5 Flash Low' },
];
export const PURPOSE_KINDS: readonly { readonly key: PurposeKind; readonly label: string }[] = [
  { key: 'EDUCATION', label: 'Giáo dục' },
  { key: 'ENTERTAINMENT', label: 'Giải trí' },
  { key: 'SALES', label: 'Bán hàng' },
  { key: 'TRUST', label: 'Tạo niềm tin' },
  { key: 'ENGAGEMENT', label: 'Tương tác' },
];
export const IDEA_RESTORE_DAYS = 30;
/** Per prompt in one run *(provisional)*; the whole run is capped by the contract's plannedCallCount (100). */
export const MAX_CALLS_PER_PROMPT = 10;
export const MAX_CALLS_PER_RUN = 100;
export const MAX_PURPOSES = 6;
const FREESTYLE_LIMIT = 12000;
const PURPOSE_LABEL_LIMIT = 40;

const isKind = (value: unknown): value is IdeaKind => value === 'BIG_IDEA' || value === 'ANGLE';
const isModel = (value: unknown): value is IdeaModel => IDEA_MODELS.some((model) => model.key === value);
const isPurposeKind = (value: unknown): value is PurposeKind => PURPOSE_KINDS.some((kind) => kind.key === value);
const PURPOSE = /^(?:EDUCATION|ENTERTAINMENT|SALES|TRUST|ENGAGEMENT|tag:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const CODE = /^[A-Z]+(?:[1-9][0-9]*)?$/;
const chars = (value: string): number => [...value].length;
const sequence = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function modelLabel(key: string): string { return IDEA_MODELS.find((model) => model.key === key)?.label ?? key; }
export function purposeKindLabel(key: string): string { return PURPOSE_KINDS.find((kind) => kind.key === key)?.label ?? key; }

/** Display label of a stored purpose value: a built-in kind or `tag:<id>` of an owner tag. */
export function purposeLabel(value: string, tags: readonly PurposeTag[]): string {
  if (!value.startsWith('tag:')) return purposeKindLabel(value);
  return tags.find((tag) => tag.tagId === value.slice(4))?.label ?? 'Mục đích đã xóa';
}

/** Built-in kind a purpose is drawn like (owner tags pick one when created). */
export function purposeDisplayKind(value: string, tags: readonly PurposeTag[]): PurposeKind | null {
  if (!value.startsWith('tag:')) return isPurposeKind(value) ? value : null;
  return tags.find((tag) => tag.tagId === value.slice(4))?.displayLike ?? null;
}

// ------------------------------------------------------------------ reads

function entryOk(value: unknown): boolean {
  if (!record(value) || !isKind(value.kind)) return false;
  const optional = (['parentIdeaId', 'restorableUntil'] as const).filter((key) => key in value);
  const own = value.kind === 'BIG_IDEA' ? 'expression' : 'name';
  if (!exactKeys(value, ['code', 'concept', 'createdAt', 'deleted', 'developing', 'ideaId', 'kind', 'model', 'promptLabel', 'purposes', 'stateSequence', own, ...optional])) return false;
  const purposes = value.purposes;
  return uuid(value.ideaId) && typeof value.code === 'string' && CODE.test(value.code) && typeof value.concept === 'string' && typeof value[own] === 'string'
    && typeof value.developing === 'boolean' && typeof value.deleted === 'boolean' && sequence(value.stateSequence) && isModel(value.model)
    && typeof value.promptLabel === 'string' && dateTime(value.createdAt)
    && (value.kind === 'BIG_IDEA' ? !('parentIdeaId' in value) : uuid(value.parentIdeaId))
    && (value.deleted ? dateTime(value.restorableUntil) && value.developing === false : !('restorableUntil' in value))
    && Array.isArray(purposes) && purposes.length <= MAX_PURPOSES && new Set(purposes).size === purposes.length
    && purposes.every((purpose) => typeof purpose === 'string' && PURPOSE.test(purpose))
    && (value.kind === 'ANGLE' || purposes.length === 0);
}

function tagOk(value: unknown): boolean {
  return record(value) && exactKeys(value, ['createdAt', 'displayLike', 'label', 'tagId']) && uuid(value.tagId) && typeof value.label === 'string'
    && chars(value.label) >= 1 && chars(value.label) <= PURPOSE_LABEL_LIMIT && isPurposeKind(value.displayLike) && dateTime(value.createdAt);
}

export async function loadIdeas(campaignId: string, fetcher: typeof fetch = fetch): Promise<IdeaList | null> {
  const value = await readJson(`/api/content/campaigns/${encodeURIComponent(campaignId)}/ideas`, fetcher);
  if (value === null) return null;
  const optional = record(value) && 'insightVersion' in value ? ['insightVersion'] : [];
  if (!record(value) || !exactKeys(value, ['campaignDeleted', 'campaignId', 'campaignName', 'contractVersion', 'ideas', 'insightLocked', 'purposeTags', ...optional])
    || value.contractVersion !== '1.0.0' || value.campaignId !== campaignId || typeof value.campaignName !== 'string' || typeof value.campaignDeleted !== 'boolean'
    || typeof value.insightLocked !== 'boolean' || (value.insightLocked ? !(typeof value.insightVersion === 'number' && Number.isSafeInteger(value.insightVersion) && value.insightVersion > 0) : 'insightVersion' in value)
    || !Array.isArray(value.ideas) || !value.ideas.every(entryOk) || !Array.isArray(value.purposeTags) || !value.purposeTags.every(tagOk)) invalid();
  const ideas = value.ideas as IdeaEntry[];
  const bigIdeas = new Set(ideas.filter((idea) => idea.kind === 'BIG_IDEA').map((idea) => idea.ideaId));
  // Every Angle hangs under a listed Big Idea, and ids are unique.
  if (new Set(ideas.map((idea) => idea.ideaId)).size !== ideas.length || ideas.some((idea) => idea.kind === 'ANGLE' && !bigIdeas.has(idea.parentIdeaId!))) invalid();
  return value as unknown as IdeaList;
}

export function bigIdeasOf(list: IdeaList): IdeaEntry[] { return list.ideas.filter((idea) => idea.kind === 'BIG_IDEA'); }
export function anglesOf(list: IdeaList, parentIdeaId: string): IdeaEntry[] { return list.ideas.filter((idea) => idea.kind === 'ANGLE' && idea.parentIdeaId === parentIdeaId); }
export function developingBigIdeas(list: IdeaList): IdeaEntry[] { return bigIdeasOf(list).filter((idea) => idea.developing && !idea.deleted); }

// ------------------------------------------------------------------ run plan

/** One prompt the owner ticked for a run, with how many ideas to ask it for. */
export interface IdeaPromptSelection {
  readonly key: string;
  readonly label: string;
  readonly choice: ContentIdeaPromptChoice;
  readonly count: number;
}

export interface IdeaRunCall {
  readonly selectionKey: string;
  readonly label: string;
  readonly request: OwnerContentIdeaGenerateRequest;
}

/** Number of AI calls a run makes: one per requested idea. Shown before the owner starts the run. */
export function contentAiCallCount(selections: readonly IdeaPromptSelection[]): number {
  return selections.reduce((total, selection) => total + selection.count, 0);
}

export function freestyleBlocker(text: string): string | null {
  if (!text.trim()) return 'Nhập nội dung prompt tự do.';
  if (chars(text.trim()) > FREESTYLE_LIMIT) return `Prompt tự do tối đa ${FREESTYLE_LIMIT} ký tự.`;
  return null;
}

export function ideaRunBlocker(input: { readonly kind: IdeaKind; readonly parentIdeaId?: string; readonly selections: readonly IdeaPromptSelection[]; readonly insightLocked: boolean; readonly campaignDeleted: boolean; readonly writesAvailable: boolean }): string | null {
  if (!input.writesAvailable) return 'Cần mở khóa OWNER để tạo ý tưởng.';
  if (input.campaignDeleted) return 'Chiến dịch đã bị xóa.';
  if (!input.insightLocked) return 'Khóa Insight trước khi tạo Big Idea.';
  if (input.kind === 'ANGLE' && !input.parentIdeaId) return 'Chọn một Big Idea đang phát triển.';
  if (input.selections.length === 0) return 'Chọn ít nhất một prompt.';
  for (const selection of input.selections) {
    if (!Number.isSafeInteger(selection.count) || selection.count < 1 || selection.count > MAX_CALLS_PER_PROMPT) return `Mỗi prompt tạo từ 1 đến ${MAX_CALLS_PER_PROMPT} ý.`;
    if (selection.choice.source === 'FREESTYLE') {
      const blocker = freestyleBlocker(selection.choice.creativeText);
      if (blocker) return blocker;
    }
  }
  if (contentAiCallCount(input.selections) > MAX_CALLS_PER_RUN) return `Một lượt tạo tối đa ${MAX_CALLS_PER_RUN} lần gọi AI.`;
  return null;
}

/**
 * Expands a run into one request per call. Request ids are fixed here so a retried call is an exact retry, never a
 * second idea. Every call carries the run's total as plannedCallCount (ADR 0004 attempt ledger).
 */
export function ideaRunPlan(input: { readonly kind: IdeaKind; readonly parentIdeaId?: string; readonly model: IdeaModel; readonly selections: readonly IdeaPromptSelection[] }, newId: () => string = () => crypto.randomUUID()): IdeaRunCall[] {
  const plannedCallCount = contentAiCallCount(input.selections);
  const calls: IdeaRunCall[] = [];
  for (const selection of input.selections) {
    const prompt: ContentIdeaPromptChoice = selection.choice.source === 'FREESTYLE' ? { source: 'FREESTYLE', creativeText: selection.choice.creativeText.trim() } : selection.choice;
    for (let index = 0; index < selection.count; index += 1) {
      calls.push({
        selectionKey: selection.key, label: selection.label,
        request: {
          contractVersion: '1.0.0', requestId: newId(), kind: input.kind, ...(input.kind === 'ANGLE' && input.parentIdeaId ? { parentIdeaId: input.parentIdeaId } : {}),
          model: input.model, plannedCallCount, prompt,
        },
      });
    }
  }
  return calls;
}

// ------------------------------------------------------------------ writes

/** The AI step failed (503 not configured, 502 provider or output failure); nothing was saved for that call. */
export class IdeaAiError extends Error {
  constructor(readonly unavailable: boolean, readonly reason: string | null, message: string) { super(message); }
}

const AI_UNAVAILABLE_MESSAGE = 'AI chưa được cấu hình trên máy chủ này — chưa thể tạo ý tưởng.';

async function ideaOwnerJson(url: string, token: string, body: unknown, fetcher: typeof fetch, conflictMessage: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) });
  } catch {
    throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.');
  }
  if (response.status === 502 || response.status === 503) {
    let reason: string | null = null;
    let message: string | null = null;
    try {
      const payload: unknown = await response.json();
      if (record(payload) && record(payload.error)) {
        if (typeof payload.error.reason === 'string') reason = payload.error.reason;
        if (typeof payload.error.message === 'string') message = payload.error.message;
      }
    } catch { /* fall back to the generic wording */ }
    if (response.status === 503) throw new IdeaAiError(true, reason, AI_UNAVAILABLE_MESSAGE);
    throw new IdeaAiError(false, reason, message ?? 'AI không trả về kết quả hợp lệ; lần gọi này không được lưu.');
  }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    throw new OwnerWriteError(kind, kind === 'conflict' ? conflictMessage
      : kind === 'invalid' ? 'OWNER API từ chối yêu cầu: kiểm tra prompt và lựa chọn.'
      : kind === 'integrity' ? 'Dữ liệu đã lưu không vượt qua kiểm tra toàn vẹn; không có gì được ghi.'
      : kind === 'not_found' ? 'Không tìm thấy chiến dịch hoặc ý tưởng.'
      : 'OWNER API từ chối yêu cầu.');
  }
  try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
}

const receiptError = (): never => { throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.'); };

export async function submitIdeaGenerate(input: { readonly campaignId: string; readonly request: OwnerContentIdeaGenerateRequest; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentIdeaReceipt> {
  const value = await ideaOwnerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/ideas`, input.token, input.request, fetcher,
    'Insight, Big Idea gốc hoặc chiến dịch đã thay đổi. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['attemptId', 'campaignId', 'code', 'contractVersion', 'createdAt', 'exactRetry', 'ideaId', 'kind']) || value.contractVersion !== '1.0.0'
    || value.campaignId !== input.campaignId || value.kind !== input.request.kind || !uuid(value.ideaId) || !uuid(value.attemptId)
    || typeof value.code !== 'string' || !CODE.test(value.code) || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') receiptError();
  return value as unknown as OwnerContentIdeaReceipt;
}

export async function submitIdeaState(input: { readonly ideaId: string; readonly expectedSequence: number; readonly action: OwnerContentIdeaStateAction; readonly purposes?: readonly string[]; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentIdeaStateReceipt> {
  const body = { contractVersion: '1.0.0', expectedSequence: input.expectedSequence, action: input.action, ...(input.action === 'PURPOSES' ? { purposes: [...(input.purposes ?? [])] } : {}) };
  const value = await ideaOwnerJson(`/owner-api/content/ideas/${encodeURIComponent(input.ideaId)}/state`, input.token, body, fetcher,
    'Ý tưởng đã thay đổi ở nơi khác. Hãy tải lại.');
  const optional = record(value) && 'restorableUntil' in value ? ['restorableUntil'] : [];
  if (!record(value) || !exactKeys(value, ['action', 'contractVersion', 'createdAt', 'exactRetry', 'ideaId', 'sequence', ...optional]) || value.contractVersion !== '1.0.0'
    || value.ideaId !== input.ideaId || value.action !== input.action || value.sequence !== input.expectedSequence + 1 || !dateTime(value.createdAt)
    || typeof value.exactRetry !== 'boolean' || (input.action === 'DELETE') !== ('restorableUntil' in value) || ('restorableUntil' in value && !dateTime(value.restorableUntil))) receiptError();
  return value as unknown as OwnerContentIdeaStateReceipt;
}

export function purposeTagBlocker(label: string, existing: readonly PurposeTag[]): string | null {
  const trimmed = label.trim();
  if (!trimmed) return 'Nhập tên mục đích.';
  if (chars(trimmed) > PURPOSE_LABEL_LIMIT) return `Tên mục đích tối đa ${PURPOSE_LABEL_LIMIT} ký tự.`;
  const key = purposeLabelKey(trimmed);
  if (PURPOSE_KINDS.some((kind) => purposeLabelKey(kind.label) === key)) return 'Mục đích này đã có sẵn.';
  if (existing.some((tag) => purposeLabelKey(tag.label) === key)) return 'Mục đích này đã có trong “Của bạn”.';
  return null;
}

/** Same normalisation as the server's label key: NFC, trimmed, single spaces, Vietnamese lower case. */
export function purposeLabelKey(label: string): string {
  return label.normalize('NFC').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('vi');
}

export async function submitPurposeTag(input: { readonly label: string; readonly displayLike: PurposeKind; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPurposeTagReceipt> {
  const label = input.label.trim();
  const value = await ideaOwnerJson('/owner-api/content/purpose-tags', input.token, { contractVersion: '1.0.0', label, displayLike: input.displayLike }, fetcher,
    'Mục đích cùng tên đã tồn tại với kiểu hiển thị khác.');
  if (!record(value) || !exactKeys(value, ['contractVersion', 'createdAt', 'displayLike', 'exactRetry', 'label', 'tagId']) || value.contractVersion !== '1.0.0'
    || !uuid(value.tagId) || typeof value.label !== 'string' || purposeLabelKey(value.label) !== purposeLabelKey(label) || value.displayLike !== input.displayLike
    || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') receiptError();
  return value as unknown as OwnerContentPurposeTagReceipt;
}

/** A, B, …, Z, AA, … — the same bijective base-26 code the server assigns. */
export function letterCode(ordinal: number): string {
  if (!Number.isSafeInteger(ordinal) || ordinal < 1) throw new RangeError('ordinal must be a positive integer');
  let code = '';
  for (let n = ordinal; n > 0; n = Math.floor((n - 1) / 26)) code = String.fromCharCode(65 + ((n - 1) % 26)) + code;
  return code;
}

// ------------------------------------------------------------------ demo (in memory only)

export interface DemoIdea {
  readonly ideaId: string;
  readonly campaignId: string;
  readonly kind: IdeaKind;
  readonly parentIdeaId?: string;
  readonly ordinal: number;
  readonly requestId: string;
  readonly concept: string;
  readonly expression?: string;
  readonly name?: string;
  readonly model: IdeaModel;
  readonly promptLabel: string;
  readonly createdAt: string;
  readonly sequence: number;
  readonly developing: boolean;
  readonly purposes: readonly string[];
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
}

export interface DemoIdeaCampaign {
  readonly campaignId: string;
  readonly name: string;
  readonly deleted: boolean;
  /** Locked Insight version, or undefined while the Insight is not locked. */
  readonly insightVersion?: number;
  /** The locked Insight sentence the demo generator riffs on. */
  readonly insight?: string;
}

const restoreDeadline = (at: string): string => new Date(Date.parse(at) + IDEA_RESTORE_DAYS * 24 * 60 * 60 * 1000).toISOString();
const expired = (idea: DemoIdea, now: string): boolean => idea.deleted !== undefined && Date.parse(now) > Date.parse(idea.deleted.restorableUntil);

function demoCode(ideas: readonly DemoIdea[], idea: DemoIdea): string {
  if (idea.kind === 'BIG_IDEA') return letterCode(idea.ordinal);
  const parent = ideas.find((candidate) => candidate.ideaId === idea.parentIdeaId);
  return `${letterCode(parent?.ordinal ?? 1)}${idea.ordinal}`;
}

export function demoIdeaList(ideas: readonly DemoIdea[], tags: readonly PurposeTag[], campaign: DemoIdeaCampaign, now: string): IdeaList {
  const own = ideas.filter((idea) => idea.campaignId === campaign.campaignId && !expired(idea, now));
  const bigOrdinal = (idea: DemoIdea): number => idea.kind === 'BIG_IDEA' ? idea.ordinal : own.find((parent) => parent.ideaId === idea.parentIdeaId)?.ordinal ?? 0;
  const sorted = [...own].sort((a, b) => bigOrdinal(a) - bigOrdinal(b) || (a.kind === 'BIG_IDEA' ? 0 : a.ordinal) - (b.kind === 'BIG_IDEA' ? 0 : b.ordinal))
    .filter((idea) => idea.kind === 'BIG_IDEA' || own.some((parent) => parent.ideaId === idea.parentIdeaId));
  return {
    contractVersion: '1.0.0',
    campaignId: campaign.campaignId,
    campaignName: campaign.name,
    campaignDeleted: campaign.deleted,
    insightLocked: campaign.insightVersion !== undefined,
    ...(campaign.insightVersion !== undefined ? { insightVersion: campaign.insightVersion } : {}),
    ideas: sorted.map((idea): IdeaEntry => ({
      ideaId: idea.ideaId, kind: idea.kind, ...(idea.parentIdeaId ? { parentIdeaId: idea.parentIdeaId } : {}), code: demoCode(ideas, idea), concept: idea.concept,
      ...(idea.kind === 'BIG_IDEA' ? { expression: idea.expression ?? '' } : { name: idea.name ?? '' }),
      developing: idea.developing, deleted: idea.deleted !== undefined, ...(idea.deleted ? { restorableUntil: idea.deleted.restorableUntil } : {}),
      stateSequence: idea.sequence, purposes: [...idea.purposes] as IdeaEntry['purposes'], model: idea.model, promptLabel: idea.promptLabel, createdAt: idea.createdAt,
    })),
    purposeTags: [...tags],
  };
}

const DEMO_TWISTS = ['kể bằng một khoảnh khắc đời thường', 'đặt trước và sau cạnh nhau', 'để khách hàng tự nói ra', 'lật ngược một định kiến quen thuộc', 'biến con số thành hình ảnh'];
const DEMO_ANGLE_FORMATS = ['Nhật ký 7 ngày', 'Hỏi nhanh đáp gọn', 'Một ngày của khách hàng', 'Sai lầm thường gặp', 'Phía sau sản phẩm'];

function clip(text: string, limit: number): string { return [...text].length <= limit ? text : `${[...text].slice(0, limit - 1).join('')}…`; }

/**
 * Deterministic stand-in for the AI step in demo mode: the output depends only on the Insight, the prompt label and
 * the idea's position, so the same run always yields the same ideas. Nothing leaves the page.
 */
export function generateDemoIdea(ideas: readonly DemoIdea[], campaign: DemoIdeaCampaign, call: IdeaRunCall, now: string, ideaId: string): { readonly ideas: DemoIdea[]; readonly receipt: OwnerContentIdeaReceipt } {
  const { request } = call;
  const existing = ideas.find((idea) => idea.requestId === request.requestId);
  if (existing) return { ideas: [...ideas], receipt: { contractVersion: '1.0.0', ideaId: existing.ideaId, campaignId: existing.campaignId, kind: existing.kind, code: demoCode(ideas, existing), attemptId: existing.ideaId, createdAt: existing.createdAt, exactRetry: true } };
  if (campaign.deleted || campaign.insightVersion === undefined) throw new Error('Demo idea conflict');
  const parent = request.kind === 'ANGLE' ? ideas.find((idea) => idea.ideaId === request.parentIdeaId && idea.kind === 'BIG_IDEA' && idea.campaignId === campaign.campaignId) : undefined;
  if (request.kind === 'ANGLE' && (!parent || parent.deleted || !parent.developing)) throw new Error('Demo idea conflict');
  const siblings = ideas.filter((idea) => idea.campaignId === campaign.campaignId && idea.kind === request.kind && idea.parentIdeaId === (parent?.ideaId ?? undefined));
  const ordinal = siblings.length + 1;
  const insight = (campaign.insight ?? 'khách hàng cần một lý do rõ ràng để tin').trim();
  const twist = DEMO_TWISTS[(ordinal + call.label.length) % DEMO_TWISTS.length]!;
  const base = { ideaId, campaignId: campaign.campaignId, kind: request.kind, ordinal, requestId: request.requestId, model: request.model, promptLabel: call.label, createdAt: now, sequence: 0, developing: false, purposes: [] };
  const idea: DemoIdea = request.kind === 'BIG_IDEA'
    ? { ...base, concept: clip(`Từ insight “${insight}”, ${twist}: nội dung cho thấy sản phẩm giải quyết đúng điều khách hàng đang ngại nói ra.`, 780), expression: clip(`Ý ${letterCode(ordinal)} — ${twist}`, 180) }
    : { ...base, parentIdeaId: parent!.ideaId, name: clip(`${DEMO_ANGLE_FORMATS[(ordinal - 1) % DEMO_ANGLE_FORMATS.length]!} (${call.label})`, 120), concept: clip(`Triển khai ý “${parent!.expression ?? ''}” theo dạng ${DEMO_ANGLE_FORMATS[(ordinal - 1) % DEMO_ANGLE_FORMATS.length]!.toLowerCase()}, mở đầu bằng nỗi đau và kết bằng một hành động nhỏ khách hàng làm được ngay.`, 840) };
  const next = [...ideas, idea];
  return { ideas: next, receipt: { contractVersion: '1.0.0', ideaId, campaignId: campaign.campaignId, kind: request.kind, code: demoCode(next, idea), attemptId: ideaId, createdAt: now, exactRetry: false } };
}

export function changeDemoIdeaState(ideas: readonly DemoIdea[], input: { readonly ideaId: string; readonly expectedSequence: number; readonly action: OwnerContentIdeaStateAction; readonly purposes?: readonly string[] }, now: string): DemoIdea[] {
  return ideas.map((idea) => {
    if (idea.ideaId !== input.ideaId) return idea;
    if (idea.sequence !== input.expectedSequence || expired(idea, now)) throw new Error('Demo idea state conflict');
    const deleted = idea.deleted !== undefined;
    const sequence = idea.sequence + 1;
    switch (input.action) {
      case 'DEVELOP':
        if (deleted || idea.developing) throw new Error('Demo idea state conflict');
        return { ...idea, sequence, developing: true };
      case 'STOP':
        if (deleted || !idea.developing) throw new Error('Demo idea state conflict');
        return { ...idea, sequence, developing: false };
      case 'DELETE': {
        if (deleted) throw new Error('Demo idea state conflict');
        return { ...idea, sequence, developing: false, deleted: { deletedAt: now, restorableUntil: restoreDeadline(now) } };
      }
      case 'RESTORE': {
        if (!deleted) throw new Error('Demo idea state conflict');
        const { deleted: _removed, ...rest } = idea;
        return { ...rest, sequence, developing: false };
      }
      case 'PURPOSES':
        if (deleted || idea.kind !== 'ANGLE' || (input.purposes ?? []).length > MAX_PURPOSES) throw new Error('Demo idea state conflict');
        return { ...idea, sequence, purposes: [...(input.purposes ?? [])] };
    }
  });
}

export function createDemoPurposeTag(tags: readonly PurposeTag[], label: string, displayLike: PurposeKind, tagId: string, now: string): PurposeTag[] {
  const trimmed = label.trim();
  const existing = tags.find((tag) => purposeLabelKey(tag.label) === purposeLabelKey(trimmed));
  if (existing) {
    if (existing.displayLike !== displayLike) throw new Error('Demo purpose tag conflict');
    return [...tags];
  }
  return [...tags, { tagId, label: trimmed, displayLike, createdAt: now }];
}
