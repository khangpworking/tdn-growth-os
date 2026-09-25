import type {
  ContentPromptDetailResponse,
  ContentPromptHistoryItem,
  ContentPromptListResponse,
  ContentSystemPromptDetailResponse,
} from '../../contracts/api/content-api.generated';
import type {
  ContentPromptContent,
  ContentPromptLineage,
  ContentPromptModel,
  ContentPromptType,
  OwnerContentPromptLifecycleReceipt,
  OwnerContentPromptReceipt,
} from '../../contracts/api/owner-content-prompt-api.generated';
import { dateTime, exactKeys, invalid, readJson, record, sha256, uuid, version as positiveVersion } from './content-data-source';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';
import { createDraftEditorReducer, type DraftEditor, type DraftEditorEvent } from './draft-editor';

export type PromptType = ContentPromptType;
export type PromptContent = ContentPromptContent;
export type PromptLineage = ContentPromptLineage;
export type PromptList = ContentPromptListResponse;
export type PromptDetailResponse = ContentPromptDetailResponse;
export type SystemPromptDetailResponse = ContentSystemPromptDetailResponse;

export const PROMPT_TYPES: readonly { readonly key: PromptType; readonly slug: string; readonly label: string }[] = [
  { key: 'BIG_IDEA', slug: 'big-idea', label: 'Big Idea' },
  { key: 'ANGLE', slug: 'angle', label: 'Góc' },
  { key: 'CAPTION', slug: 'caption', label: 'Caption' },
  { key: 'POSTER', slug: 'poster', label: 'Poster' },
];
const MODELS: readonly { readonly key: ContentPromptModel; readonly label: string; readonly image: boolean }[] = [
  { key: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', image: false },
  { key: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', image: false },
  { key: 'gemini-3.5-flash-low', label: 'Gemini 3.5 Flash Low', image: false },
  { key: 'gpt-image-2', label: 'GPT Image 2', image: true },
  { key: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image', image: true },
];
export const RESTORE_DAYS = 30;
const LIMITS = { name: 120, description: 300, creativeText: 12000, tag: 40, tags: 8, demoInput: 2000, demoOutput: 4000 } as const;

export function modelsForType(type: PromptType): readonly { readonly key: ContentPromptModel; readonly label: string }[] {
  return MODELS.filter((model) => model.image === (type === 'POSTER'));
}
export function modelLabel(key: string): string { return MODELS.find((model) => model.key === key)?.label ?? key; }
export function typeBySlug(slug: string): PromptType | undefined { return PROMPT_TYPES.find((type) => type.slug === slug)?.key; }
export function slugOf(type: PromptType): string { return PROMPT_TYPES.find((entry) => entry.key === type)!.slug; }

export interface PromptDraft {
  readonly name: string;
  readonly description: string;
  readonly creativeText: string;
  readonly recommendedModel: ContentPromptModel;
  /** Comma-separated tags. */
  readonly tagsText: string;
  readonly demoInput: string;
  readonly demoOutput: string;
}
export interface PromptBase {
  readonly promptId: string;
  readonly promptType: PromptType;
  readonly version: number;
  readonly draft: PromptDraft;
  readonly history: readonly ContentPromptHistoryItem[];
}

export function emptyPromptDraft(type: PromptType): PromptDraft {
  return { name: '', description: '', creativeText: '', recommendedModel: modelsForType(type)[0]!.key, tagsText: '', demoInput: '', demoOutput: '' };
}

export function draftFromPrompt(prompt: PromptContent, type: PromptType): PromptDraft {
  return {
    name: prompt.name, description: prompt.description ?? '', creativeText: prompt.creativeText,
    recommendedModel: modelsForType(type).some((model) => model.key === prompt.recommendedModel) ? prompt.recommendedModel : modelsForType(type)[0]!.key,
    tagsText: prompt.tags.join(', '), demoInput: prompt.demoInput ?? '', demoOutput: prompt.demoOutput ?? '',
  };
}

function tagsOf(text: string): string[] {
  return [...new Set(text.split(',').map((tag) => tag.trim()).filter(Boolean))];
}
const chars = (text: string) => [...text.trim()].length;

export function promptDraftBlocker(draft: PromptDraft): string | null {
  if (!draft.name.trim()) return 'Nhập tên prompt.';
  if (!draft.creativeText.trim()) return 'Nhập phần sáng tạo.';
  if (chars(draft.name) > LIMITS.name) return `Tên tối đa ${LIMITS.name} ký tự.`;
  if (chars(draft.description) > LIMITS.description) return `Mô tả tối đa ${LIMITS.description} ký tự.`;
  if (chars(draft.creativeText) > LIMITS.creativeText) return `Phần sáng tạo tối đa ${LIMITS.creativeText} ký tự.`;
  const tags = tagsOf(draft.tagsText);
  if (tags.length > LIMITS.tags) return `Tối đa ${LIMITS.tags} thẻ.`;
  if (tags.some((tag) => chars(tag) > LIMITS.tag)) return `Mỗi thẻ tối đa ${LIMITS.tag} ký tự.`;
  if (chars(draft.demoInput) > LIMITS.demoInput) return `Demo đầu vào tối đa ${LIMITS.demoInput} ký tự.`;
  if (chars(draft.demoOutput) > LIMITS.demoOutput) return `Demo kết quả tối đa ${LIMITS.demoOutput} ký tự.`;
  return null;
}

export function promptRequestFromDraft(draft: PromptDraft): PromptContent {
  const optional = (key: 'description' | 'demoInput' | 'demoOutput') => { const value = draft[key].trim(); return value ? { [key]: value } : {}; };
  return {
    name: draft.name.trim(), ...optional('description'), creativeText: draft.creativeText.trim(), recommendedModel: draft.recommendedModel,
    tags: tagsOf(draft.tagsText) as PromptContent['tags'], ...optional('demoInput'), ...optional('demoOutput'),
  } as PromptContent;
}

export function samePromptContent(left: PromptDraft, right: PromptDraft): boolean {
  return JSON.stringify(promptRequestFromDraft(left)) === JSON.stringify(promptRequestFromDraft(right));
}

export function promptDifferences(draft: PromptDraft, saved: PromptDraft): string[] {
  const left = promptRequestFromDraft(draft); const right = promptRequestFromDraft(saved);
  const labels: [keyof PromptContent, string][] = [['name', 'Tên'], ['description', 'Mô tả'], ['creativeText', 'Phần sáng tạo'], ['recommendedModel', 'Mô hình'], ['tags', 'Thẻ'], ['demoInput', 'Demo đầu vào'], ['demoOutput', 'Demo kết quả']];
  return labels.filter(([key]) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map(([, label]) => label);
}

export type PromptEditor = DraftEditor<PromptDraft, PromptBase>;
export type PromptEditorEvent = DraftEditorEvent<PromptDraft, PromptBase>;
export const promptEditorReducer = createDraftEditorReducer<PromptDraft, PromptBase>({
  idOf: (base) => base.promptId,
  empty: () => emptyPromptDraft('BIG_IDEA'),
  same: samePromptContent,
  differences: promptDifferences,
});

/** The library route an open editor belongs to: a type list, or one prompt of that type. */
export const promptEditorRoute = (promptType: PromptType, promptRef: string | null): string => `${promptType}/${promptRef ?? ''}`;

/** Keeps an open editor only while the page shows the route it was opened for. */
export function editingForRoute<T extends { readonly route: string }>(editing: T | null, route: string): T | null {
  return editing?.route === route ? editing : null;
}

export function generatedPromptKey(id: string = crypto.randomUUID()): string {
  const compact = id.toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new TypeError('A UUID is required to generate a prompt key');
  return `prompt-${compact}`;
}

// ------------------------------------------------------------------ reads

const isType = (value: unknown): value is PromptType => PROMPT_TYPES.some((type) => type.key === value);
const isModel = (value: unknown): value is ContentPromptModel => MODELS.some((model) => model.key === value);
const strings = (value: unknown): boolean => Array.isArray(value) && value.every((item) => typeof item === 'string');

function promptContent(value: unknown): boolean {
  if (!record(value) || typeof value.name !== 'string' || typeof value.creativeText !== 'string' || !isModel(value.recommendedModel) || !strings(value.tags)) return false;
  const keys = ['creativeText', 'name', 'recommendedModel', 'tags', ...(['description', 'demoInput', 'demoOutput'] as const).filter((key) => key in value)];
  return exactKeys(value, keys) && ['description', 'demoInput', 'demoOutput'].every((key) => !(key in value) || typeof value[key] === 'string');
}
function lineage(value: unknown): boolean {
  return record(value) && exactKeys(value, ['id', 'kind', 'version']) && (value.kind === 'SYSTEM' || value.kind === 'USER') && typeof value.id === 'string' && positiveVersion(value.version);
}
function deletion(value: unknown): boolean {
  return record(value) && exactKeys(value, ['deletedAt', 'restorableUntil']) && dateTime(value.deletedAt) && dateTime(value.restorableUntil);
}
function systemLayer(value: unknown, type: PromptType): boolean {
  return record(value) && exactKeys(value, ['promptType', 'sha256', 'text', 'version']) && value.promptType === type && sha256(value.sha256) && typeof value.text === 'string' && positiveVersion(value.version);
}

export async function loadPrompts(fetcher: typeof fetch = fetch): Promise<PromptList> {
  const value = await readJson('/api/content/prompts', fetcher);
  if (value === null || !record(value) || !exactKeys(value, ['contractVersion', 'prompts', 'systemPrompts']) || value.contractVersion !== '1.0.0' || !Array.isArray(value.systemPrompts) || !Array.isArray(value.prompts)) invalid();
  const list = value as Record<string, unknown[]>;
  const systemOk = list.systemPrompts!.every((entry) => record(entry) && exactKeys(entry, ['id', 'isDefault', 'name', 'promptType', 'recommendedModel', 'tags', 'version', ...('description' in entry ? ['description'] : [])])
    && typeof entry.id === 'string' && isType(entry.promptType) && positiveVersion(entry.version) && typeof entry.name === 'string' && isModel(entry.recommendedModel) && strings(entry.tags) && typeof entry.isDefault === 'boolean');
  const userOk = list.prompts!.every((entry) => record(entry) && exactKeys(entry, ['name', 'promptId', 'promptKey', 'promptType', 'recommendedModel', 'tags', 'updatedAt', 'version', ...('deleted' in entry ? ['deleted'] : [])])
    && uuid(entry.promptId) && typeof entry.promptKey === 'string' && isType(entry.promptType) && positiveVersion(entry.version) && typeof entry.name === 'string' && isModel(entry.recommendedModel) && strings(entry.tags) && dateTime(entry.updatedAt) && (!('deleted' in entry) || deletion(entry.deleted)));
  if (!systemOk || !userOk) invalid();
  return value as unknown as PromptList;
}

export async function loadPrompt(promptId: string, fetcher: typeof fetch = fetch): Promise<PromptDetailResponse | null> {
  const value = await readJson(`/api/content/prompts/${encodeURIComponent(promptId)}`, fetcher);
  if (value === null) return null;
  if (!record(value) || !exactKeys(value, ['contractVersion', 'history', 'lifecycle', 'prompt', 'systemLayer']) || value.contractVersion !== '1.0.0') invalid();
  const prompt = value.prompt;
  if (!record(prompt) || !exactKeys(prompt, ['createdAt', 'prompt', 'promptId', 'promptKey', 'promptType', 'version', ...('duplicatedFrom' in prompt ? ['duplicatedFrom'] : [])]) || prompt.promptId !== promptId || typeof prompt.promptKey !== 'string'
    || !isType(prompt.promptType) || !positiveVersion(prompt.version) || !promptContent(prompt.prompt) || !dateTime(prompt.createdAt) || ('duplicatedFrom' in prompt && !lineage(prompt.duplicatedFrom))) invalid();
  const history = value.history;
  if (!Array.isArray(history) || history.length !== prompt.version || !history.every((entry, index) => record(entry) && exactKeys(entry, ['createdAt', 'name', 'version']) && entry.version === index + 1 && typeof entry.name === 'string' && dateTime(entry.createdAt))) invalid();
  const lifecycle = value.lifecycle;
  if (!record(lifecycle) || !exactKeys(lifecycle, ['sequence', ...('deleted' in lifecycle ? ['deleted'] : [])]) || !Number.isSafeInteger(lifecycle.sequence) || Number(lifecycle.sequence) < 0 || ('deleted' in lifecycle && !deletion(lifecycle.deleted))) invalid();
  if (!systemLayer(value.systemLayer, prompt.promptType)) invalid();
  return value as unknown as PromptDetailResponse;
}

export async function loadSystemPrompt(id: string, fetcher: typeof fetch = fetch): Promise<SystemPromptDetailResponse | null> {
  const value = await readJson(`/api/content/system-prompts/${encodeURIComponent(id)}`, fetcher);
  if (value === null) return null;
  if (!record(value) || !exactKeys(value, ['contractVersion', 'systemLayer', 'systemPrompt']) || value.contractVersion !== '1.0.0') invalid();
  const prompt = value.systemPrompt;
  if (!record(prompt) || !exactKeys(prompt, ['id', 'isDefault', 'prompt', 'promptType', 'sha256', 'version']) || prompt.id !== id || !isType(prompt.promptType) || !positiveVersion(prompt.version) || !sha256(prompt.sha256) || !promptContent(prompt.prompt) || typeof prompt.isDefault !== 'boolean') invalid();
  if (!systemLayer(value.systemLayer, prompt.promptType)) invalid();
  return value as unknown as SystemPromptDetailResponse;
}

// ------------------------------------------------------------------ OWNER writes

async function ownerJson(url: string, token: string, body: unknown, fetcher: typeof fetch, conflictMessage: string): Promise<unknown> {
  let response: Response;
  try { response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    throw new OwnerWriteError(kind, kind === 'conflict' ? conflictMessage
      : kind === 'invalid' ? 'OWNER API từ chối prompt: kiểm tra nội dung, mô hình phù hợp loại prompt và nguồn nhân bản.'
      : kind === 'integrity' ? 'Dữ liệu đã lưu không vượt qua kiểm tra toàn vẹn; không có gì được ghi.'
      : 'OWNER API từ chối yêu cầu.');
  }
  try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
}

function promptReceipt(value: unknown, promptType: PromptType, promptId?: string): OwnerContentPromptReceipt {
  if (!record(value) || !exactKeys(value, ['contractVersion', 'createdAt', 'exactRetry', 'name', 'promptId', 'promptKey', 'promptType', 'version']) || value.contractVersion !== '1.0.0' || !uuid(value.promptId)
    || (promptId !== undefined && value.promptId !== promptId) || typeof value.promptKey !== 'string' || value.promptType !== promptType || typeof value.name !== 'string' || !positiveVersion(value.version) || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentPromptReceipt;
}

export async function submitPromptCreate(input: { readonly promptKey: string; readonly promptType: PromptType; readonly prompt: PromptContent; readonly duplicatedFrom?: PromptLineage; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPromptReceipt> {
  const body = { contractVersion: '1.0.0', promptKey: input.promptKey, promptType: input.promptType, prompt: input.prompt, ...(input.duplicatedFrom ? { duplicatedFrom: input.duplicatedFrom } : {}) };
  return promptReceipt(await ownerJson('/owner-api/content/prompts', input.token, body, fetcher, 'Prompt đã thay đổi. Hãy tải lại trước khi lưu.'), input.promptType);
}

export async function submitPromptRevision(input: { readonly promptId: string; readonly promptType?: PromptType; readonly expectedVersion: number; readonly prompt: PromptContent; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPromptReceipt> {
  const value = await ownerJson(`/owner-api/content/prompts/${encodeURIComponent(input.promptId)}/revisions`, input.token, { contractVersion: '1.0.0', expectedVersion: input.expectedVersion, prompt: input.prompt }, fetcher, 'Prompt đã thay đổi ở nơi khác hoặc đã bị xóa. Hãy tải lại trước khi lưu.');
  return promptReceipt(value, input.promptType ?? (record(value) && isType(value.promptType) ? value.promptType : 'BIG_IDEA'), input.promptId);
}

export async function submitPromptLifecycle(input: { readonly promptId: string; readonly action: 'DELETE' | 'RESTORE'; readonly expectedSequence: number; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPromptLifecycleReceipt> {
  const value = await ownerJson(`/owner-api/content/prompts/${encodeURIComponent(input.promptId)}/lifecycle`, input.token, { contractVersion: '1.0.0', action: input.action, expectedSequence: input.expectedSequence }, fetcher,
    input.action === 'RESTORE' ? 'Không thể khôi phục: prompt đã thay đổi hoặc đã quá 30 ngày.' : 'Prompt đã thay đổi. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['action', 'contractVersion', 'createdAt', 'exactRetry', 'promptId', 'sequence', ...('restorableUntil' in value ? ['restorableUntil'] : [])]) || value.contractVersion !== '1.0.0'
    || value.promptId !== input.promptId || value.action !== input.action || !positiveVersion(value.sequence) || !dateTime(value.createdAt) || ('restorableUntil' in value && !dateTime(value.restorableUntil)) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentPromptLifecycleReceipt;
}

// ------------------------------------------------------------------ demo (in memory only)

export interface DemoPrompt {
  readonly promptId: string;
  readonly promptKey: string;
  readonly promptType: PromptType;
  readonly version: number;
  readonly prompt: PromptContent;
  readonly duplicatedFrom?: PromptLineage;
  readonly createdAt: string;
  readonly history: readonly ContentPromptHistoryItem[];
  readonly sequence: number;
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
}

export function createDemoPrompt(prompts: readonly DemoPrompt[], promptType: PromptType, draft: PromptDraft, promptId: string, now: string, duplicatedFrom?: PromptLineage): DemoPrompt[] {
  const prompt = promptRequestFromDraft(draft);
  return [...prompts, { promptId, promptKey: generatedPromptKey(promptId), promptType, version: 1, prompt, ...(duplicatedFrom ? { duplicatedFrom } : {}), createdAt: now, history: [{ version: 1, name: prompt.name, createdAt: now }], sequence: 0 }];
}

export function reviseDemoPrompt(prompts: readonly DemoPrompt[], promptId: string, expectedVersion: number, draft: PromptDraft, now: string): DemoPrompt[] {
  return prompts.map((entry) => {
    if (entry.promptId !== promptId) return entry;
    if (entry.deleted) throw new Error('Demo prompt is deleted');
    if (entry.version !== expectedVersion) throw new Error('Demo prompt revision conflict');
    const prompt = promptRequestFromDraft(draft); const version = entry.version + 1;
    return { ...entry, prompt, version, createdAt: now, history: [...entry.history, { version, name: prompt.name, createdAt: now }] };
  });
}

export function changeDemoLifecycle(prompts: readonly DemoPrompt[], promptId: string, action: 'DELETE' | 'RESTORE', now: string): DemoPrompt[] {
  return prompts.map((entry) => {
    if (entry.promptId !== promptId) return entry;
    const { deleted: _previous, ...rest } = entry;
    return action === 'DELETE'
      ? { ...rest, sequence: entry.sequence + 1, deleted: { deletedAt: now, restorableUntil: new Date(Date.parse(now) + RESTORE_DAYS * 86_400_000).toISOString() } }
      : { ...rest, sequence: entry.sequence + 1 };
  });
}
