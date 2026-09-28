import type {
  ContentBrandFactCheckView,
  ContentCampaignPackageDefaults,
  ContentCaptionLength,
  ContentCaptionSettings,
  ContentCaptionStyle,
  ContentCaptionVersionView,
  ContentPackageAttemptView,
  ContentPackageDetailResponse,
  ContentPackageListEntry,
  ContentPackageListResponse,
  ContentPackagePart,
  ContentPackageSettingsView,
  ContentPosterFormat,
  ContentPosterModel,
  ContentPosterSettings,
  ContentPosterVersionView,
  ContentVisibility,
} from '../../contracts/api/content-api.generated';
import type {
  OwnerContentCampaignDefaultsReceipt,
  OwnerContentPackageCreateReceipt,
  OwnerContentPackageGenerateReceipt,
  OwnerContentPackageStateReceipt,
  OwnerContentPackageVersionReceipt,
} from '../../contracts/api/owner-content-package-api.generated';
import type { ContentIdeaPromptChoice } from '../../contracts/flow/content-idea-generate-request.generated';
import type { ContentCaptionDisplayOverride, ContentPackageRow, ContentPosterDisplayOverride } from '../../contracts/flow/content-package-create-request.generated';
import { dateTime, exactKeys, invalid, readJson, record, sha256, uuid, version, type DemoBrand } from './content-data-source';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';
import { IDEA_MODELS, type IdeaEntry, type IdeaList, type PurposeKind } from './idea-data-source';
import type { PromptList } from './prompt-data-source';

export type PackageList = ContentPackageListResponse;
export type PackageEntry = ContentPackageListEntry;
export type PackageDetail = ContentPackageDetailResponse;
export type PackageDefaults = ContentCampaignPackageDefaults;
export type CaptionSettings = ContentCaptionSettings;
export type PosterSettings = ContentPosterSettings;
export type PackagePart = ContentPackagePart;
export type CaptionVersion = ContentCaptionVersionView;
export type PosterVersion = ContentPosterVersionView;
export type PackageRow = ContentPackageRow;
export type CaptionDisplayOverride = ContentCaptionDisplayOverride;
export type PosterDisplayOverride = ContentPosterDisplayOverride;
export type FactRow = ContentBrandFactCheckView;

export const CAPTION_STYLES: readonly { readonly key: ContentCaptionStyle; readonly label: string }[] = [
  { key: 'PROFESSIONAL', label: 'Chuyên nghiệp' },
  { key: 'FRIENDLY', label: 'Thân thiện' },
];
export const CAPTION_LENGTHS: readonly { readonly key: ContentCaptionLength; readonly label: string }[] = [
  { key: 'SHORT', label: 'Ngắn · 80–120 từ' },
  { key: 'MEDIUM', label: 'Vừa · 120–180 từ' },
  { key: 'LONG', label: 'Dài · 180–250 từ' },
];
export const POSTER_MODELS: readonly { readonly key: ContentPosterModel; readonly label: string }[] = [
  { key: 'gpt-image-2', label: 'GPT Image 2' },
  { key: 'gemini-3.1-flash-image', label: 'Gemini 3.1 Flash Image' },
];
export const POSTER_FORMATS: readonly { readonly key: ContentPosterFormat; readonly label: string; readonly width: number; readonly height: number }[] = [
  { key: 'square', label: 'Vuông 1:1', width: 1088, height: 1088 },
  { key: 'portrait', label: 'Dọc 4:5', width: 1088, height: 1360 },
  { key: 'story', label: 'Story 9:16', width: 1152, height: 2048 },
  { key: 'landscape', label: 'Ngang 16:9', width: 2048, height: 1152 },
];
export const FACT_STATES: Readonly<Record<FactRow['state'], string>> = {
  MATCH: '✓ Đúng hồ sơ', NOT_MENTIONED: 'Không nhắc', HIDDEN: 'Ẩn theo mục đích', MISMATCH: 'Sai hồ sơ',
};
export const FACT_ELEMENTS: Readonly<Record<FactRow['element'], string>> = {
  name: 'Tên thương hiệu', tagline: 'Tagline', hotline: 'Hotline', website: 'Website', fanpage: 'Fanpage', address: 'Địa chỉ', price: 'Giá',
};
export const PART_LABELS: Readonly<Record<PackagePart, string>> = { CAPTION: 'Caption', POSTER: 'Poster' };
export const SOURCE_LABELS: Readonly<Record<CaptionVersion['source'], string>> = { GENERATED: 'AI tạo', MANUAL: 'Sửa tay', RESTORE: 'Khôi phục' };
export const CAPTION_ELEMENTS = ['name', 'tagline', 'hotline', 'web', 'address'] as const;
export const POSTER_ELEMENTS = ['name', 'logo', 'tagline', 'hotline', 'web', 'address'] as const;
/** Photos sent with one Poster call *(provisional until 053: C4)*; the server accepts up to 8 ticked. */
export const POSTER_MAX_REFERENCES = 1;
export const PACKAGE_TICKED_REFERENCE_LIMIT = 8;
export const PACKAGE_BATCH_LIMIT = 20;
export const PACKAGE_RESTORE_DAYS = 30;
export const POST_LIMIT = 4000;
const FREESTYLE_LIMIT = 12000;
const PACKAGE_CODE = /^[A-Z]+[1-9][0-9]*·[1-9][0-9]*$/;
const ATTEMPT_STATES = new Set(['running', 'succeeded', 'failed', 'interrupted']);
const FACT_ELEMENT_ORDER = ['name', 'tagline', 'hotline', 'website', 'fanpage', 'address', 'price'] as const;

const chars = (value: string): number => [...value].length;
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const oneOf = <T extends string>(options: readonly { readonly key: T }[], value: unknown): value is T => options.some((option) => option.key === value);
const isVisibility = (value: unknown): value is ContentVisibility => value === 'ALWAYS' || value === 'OPTIONAL' || value === 'HIDDEN';
const isSource = (value: unknown): value is CaptionVersion['source'] => value === 'GENERATED' || value === 'MANUAL' || value === 'RESTORE';
const isPart = (value: unknown): value is PackagePart => value === 'CAPTION' || value === 'POSTER';

export function styleLabel(key: string): string { return CAPTION_STYLES.find((entry) => entry.key === key)?.label ?? key; }
export function lengthLabel(key: string): string { return CAPTION_LENGTHS.find((entry) => entry.key === key)?.label ?? key; }
export function posterModelLabel(key: string): string { return POSTER_MODELS.find((entry) => entry.key === key)?.label ?? key; }
export function formatLabel(key: string): string { return POSTER_FORMATS.find((entry) => entry.key === key)?.label ?? key; }
export function posterUrl(packageId: string, posterVersion: number): string { return `/api/content/packages/${encodeURIComponent(packageId)}/posters/${posterVersion}`; }

/** Name shown for a prompt choice; the server pins the same name on the package. */
export function promptChoiceName(choice: ContentIdeaPromptChoice, prompts: PromptList | null): string {
  if (choice.source === 'FREESTYLE') return 'Prompt tự do';
  if (choice.source === 'SYSTEM') return prompts?.systemPrompts.find((prompt) => prompt.id === choice.id)?.name ?? choice.id;
  return prompts?.prompts.find((prompt) => prompt.promptId === choice.promptId)?.name ?? 'Prompt của bạn';
}

// ------------------------------------------------------------------ reads

function promptChoiceOk(value: unknown): boolean {
  if (!record(value)) return false;
  if (value.source === 'SYSTEM') return exactKeys(value, ['id', 'source', 'version']) && typeof value.id === 'string' && /^system-[a-z0-9-]{3,60}$/.test(value.id) && version(value.version);
  if (value.source === 'USER') return exactKeys(value, ['promptId', 'source', 'version']) && uuid(value.promptId) && version(value.version);
  return value.source === 'FREESTYLE' && exactKeys(value, ['creativeText', 'source']) && typeof value.creativeText === 'string' && value.creativeText.trim() !== '' && chars(value.creativeText) <= FREESTYLE_LIMIT;
}

function referencesOk(value: unknown): boolean {
  return Array.isArray(value) && value.length <= PACKAGE_TICKED_REFERENCE_LIMIT && value.every(sha256) && new Set(value).size === value.length;
}

function defaultsOk(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, ['caption', 'poster'])) return false;
  const { caption, poster } = value;
  return record(caption) && exactKeys(caption, ['length', 'model', 'prompt', 'style']) && promptChoiceOk(caption.prompt) && oneOf(IDEA_MODELS, caption.model)
    && oneOf(CAPTION_STYLES, caption.style) && oneOf(CAPTION_LENGTHS, caption.length)
    && record(poster) && exactKeys(poster, ['format', 'includeLogo', 'model', 'prompt', 'referenceMediaSha256s']) && promptChoiceOk(poster.prompt)
    && oneOf(POSTER_MODELS, poster.model) && oneOf(POSTER_FORMATS, poster.format) && referencesOk(poster.referenceMediaSha256s) && typeof poster.includeLogo === 'boolean';
}

function lifecycleOk(value: Record<string, unknown>): boolean {
  return typeof value.deleted === 'boolean' && count(value.stateSequence) && (value.deleted ? dateTime(value.restorableUntil) : !('restorableUntil' in value));
}

function entryOk(value: unknown): boolean {
  if (!record(value)) return false;
  const optional = (['captionPreview', 'restorableUntil'] as const).filter((key) => key in value);
  return exactKeys(value, ['angleId', 'captionVersion', 'code', 'createdAt', 'deleted', 'packageId', 'posterFormat', 'posterVersion', 'stateSequence', ...optional])
    && uuid(value.packageId) && uuid(value.angleId) && typeof value.code === 'string' && PACKAGE_CODE.test(value.code) && lifecycleOk(value)
    && count(value.captionVersion) && count(value.posterVersion) && oneOf(POSTER_FORMATS, value.posterFormat) && dateTime(value.createdAt)
    && (value.captionVersion === 0 ? !('captionPreview' in value) : typeof value.captionPreview === 'string');
}

export async function loadPackages(campaignId: string, fetcher: typeof fetch = fetch): Promise<PackageList | null> {
  const value = await readJson(`/api/content/campaigns/${encodeURIComponent(campaignId)}/packages`, fetcher);
  if (value === null) return null;
  const optional = record(value) && 'defaults' in value ? ['defaults'] : [];
  if (!record(value) || !exactKeys(value, ['campaignDeleted', 'campaignId', 'campaignName', 'contractVersion', 'insightLocked', 'packages', ...optional])
    || value.contractVersion !== '1.0.0' || value.campaignId !== campaignId || typeof value.campaignName !== 'string' || typeof value.campaignDeleted !== 'boolean'
    || typeof value.insightLocked !== 'boolean' || !Array.isArray(value.packages) || !value.packages.every(entryOk)
    || ('defaults' in value && !(record(value.defaults) && exactKeys(value.defaults, ['createdAt', 'defaults', 'version']) && version(value.defaults.version)
      && dateTime(value.defaults.createdAt) && defaultsOk(value.defaults.defaults)))) invalid();
  const packages = value.packages as PackageEntry[];
  if (new Set(packages.map((entry) => entry.packageId)).size !== packages.length || new Set(packages.map((entry) => entry.code)).size !== packages.length) invalid();
  return value as unknown as PackageList;
}

function settingsOk(value: unknown): boolean {
  if (!record(value)) return false;
  const optional = 'logoMediaSha256' in value ? ['logoMediaSha256'] : [];
  if (!exactKeys(value, ['brandId', 'captionDisplay', 'captionLength', 'captionModel', 'captionPromptName', 'captionStyle', 'includeLogo', 'posterDisplay', 'posterFormat',
    'posterModel', 'posterPromptName', 'purposes', 'referenceMediaSha256s', ...optional])) return false;
  const { captionDisplay, posterDisplay } = value;
  return uuid(value.brandId) && Array.isArray(value.purposes) && value.purposes.length >= 1 && value.purposes.every((purpose) => typeof purpose === 'string')
    && typeof value.captionPromptName === 'string' && oneOf(IDEA_MODELS, value.captionModel) && oneOf(CAPTION_STYLES, value.captionStyle) && oneOf(CAPTION_LENGTHS, value.captionLength)
    && typeof value.posterPromptName === 'string' && oneOf(POSTER_MODELS, value.posterModel) && oneOf(POSTER_FORMATS, value.posterFormat) && typeof value.includeLogo === 'boolean'
    && (!('logoMediaSha256' in value) || sha256(value.logoMediaSha256)) && referencesOk(value.referenceMediaSha256s)
    && record(captionDisplay) && exactKeys(captionDisplay, [...CAPTION_ELEMENTS]) && CAPTION_ELEMENTS.every((element) => isVisibility(captionDisplay[element]))
    && record(posterDisplay) && exactKeys(posterDisplay, [...POSTER_ELEMENTS]) && POSTER_ELEMENTS.every((element) => typeof posterDisplay[element] === 'boolean');
}

function versionHeadOk(value: Record<string, unknown>, index: number, extra: readonly string[]): boolean {
  const optional = (['attemptId', 'restoredFromVersion'] as const).filter((key) => key in value);
  return exactKeys(value, ['createdAt', 'source', 'version', ...extra, ...optional]) && value.version === index + 1 && isSource(value.source) && dateTime(value.createdAt)
    && (value.source === 'GENERATED') === uuid(value.attemptId) && (value.source === 'GENERATED' || !('attemptId' in value))
    && (value.source === 'RESTORE' ? version(value.restoredFromVersion) && Number(value.restoredFromVersion) <= index : !('restoredFromVersion' in value));
}

function factOk(value: unknown): boolean {
  return record(value) && exactKeys(value, ['element', 'found', 'state']) && FACT_ELEMENT_ORDER.includes(value.element as never) && typeof value.state === 'string'
    && value.state in FACT_STATES && Array.isArray(value.found) && value.found.every((item) => typeof item === 'string');
}

function captionOk(value: unknown, index: number): boolean {
  return record(value) && versionHeadOk(value, index, ['factCheck', 'footer', 'post', 'text']) && typeof value.post === 'string' && value.post.trim() !== ''
    && chars(value.post) <= POST_LIMIT && typeof value.footer === 'string' && value.text === captionText(value.post, value.footer)
    && Array.isArray(value.factCheck) && value.factCheck.every(factOk) && new Set(value.factCheck.map((row) => (row as FactRow).element)).size === value.factCheck.length;
}

function posterOk(value: unknown, index: number): boolean {
  return record(value) && versionHeadOk(value, index, ['captionVersion', 'height', 'mediaType', 'sizeMatchesFormat', 'width'])
    && (value.mediaType === 'image/png' || value.mediaType === 'image/jpeg') && version(value.width) && version(value.height)
    && typeof value.sizeMatchesFormat === 'boolean' && version(value.captionVersion);
}

function attemptOk(value: unknown): boolean {
  return record(value) && exactKeys(value, ['attemptId', 'closedAt', 'createdAt', 'errorCode', 'model', 'part', 'retryOf', 'state']) && uuid(value.attemptId) && isPart(value.part)
    && typeof value.state === 'string' && ATTEMPT_STATES.has(value.state) && (value.errorCode === null || typeof value.errorCode === 'string')
    && (value.retryOf === null || uuid(value.retryOf)) && typeof value.model === 'string' && dateTime(value.createdAt)
    && (value.state === 'running' ? value.closedAt === null : dateTime(value.closedAt));
}

export async function loadPackage(packageId: string, fetcher: typeof fetch = fetch): Promise<PackageDetail | null> {
  const value = await readJson(`/api/content/packages/${encodeURIComponent(packageId)}`, fetcher);
  if (value === null) return null;
  const optional = record(value) && 'restorableUntil' in value ? ['restorableUntil'] : [];
  if (!record(value) || !exactKeys(value, ['angleId', 'attempts', 'campaignDeleted', 'campaignId', 'campaignName', 'captions', 'code', 'contractVersion', 'createdAt', 'deleted',
    'footer', 'packageId', 'posters', 'settings', 'stateSequence', ...optional])
    || value.contractVersion !== '1.0.0' || value.packageId !== packageId || !uuid(value.campaignId) || !uuid(value.angleId) || typeof value.campaignName !== 'string'
    || typeof value.campaignDeleted !== 'boolean' || typeof value.code !== 'string' || !PACKAGE_CODE.test(value.code) || !lifecycleOk(value) || !dateTime(value.createdAt)
    || !settingsOk(value.settings) || typeof value.footer !== 'string' || !Array.isArray(value.captions) || !value.captions.every(captionOk)
    || !Array.isArray(value.posters) || !value.posters.every(posterOk) || !Array.isArray(value.attempts) || !value.attempts.every(attemptOk)) invalid();
  const captions = value.captions as CaptionVersion[];
  const attempts = value.attempts as ContentPackageAttemptView[];
  // A Poster is drawn from an existing Caption version; every generated version names an attempt of its own part.
  if ((value.posters as PosterVersion[]).some((poster) => poster.captionVersion > captions.length)
    || new Set(attempts.map((attempt) => attempt.attemptId)).size !== attempts.length) invalid();
  return value as unknown as PackageDetail;
}

// ------------------------------------------------------------------ create form

export interface PackageRowDraft {
  readonly angleId: string;
  readonly style?: ContentCaptionStyle;
  readonly length?: ContentCaptionLength;
  readonly references?: readonly string[];
  readonly caption: Partial<Record<(typeof CAPTION_ELEMENTS)[number], ContentVisibility>>;
  readonly poster: Partial<Record<(typeof POSTER_ELEMENTS)[number], boolean>>;
}

/** Angles a package can be built from: listed, not deleted, with at least one purpose (C6). */
export function packageableAngles(list: IdeaList): IdeaEntry[] {
  return list.ideas.filter((idea) => idea.kind === 'ANGLE' && !idea.deleted && idea.purposes.length > 0);
}

export function emptyRowDraft(angleId: string): PackageRowDraft { return { angleId, caption: {}, poster: {} }; }

export function rowHasOverrides(row: PackageRowDraft): boolean {
  return row.style !== undefined || row.length !== undefined || row.references !== undefined || Object.keys(row.caption).length > 0 || Object.keys(row.poster).length > 0;
}

function promptBlocker(prompt: ContentIdeaPromptChoice, part: string): string | null {
  if (prompt.source !== 'FREESTYLE') return null;
  if (!prompt.creativeText.trim()) return `Nhập nội dung prompt tự do cho ${part}.`;
  if (chars(prompt.creativeText.trim()) > FREESTYLE_LIMIT) return `Prompt tự do cho ${part} tối đa ${FREESTYLE_LIMIT} ký tự.`;
  return null;
}

export function packageCreateBlocker(input: {
  readonly writesAvailable: boolean; readonly campaignDeleted: boolean; readonly insightLocked: boolean; readonly rows: readonly PackageRowDraft[];
  readonly caption: CaptionSettings; readonly poster: PosterSettings;
}): string | null {
  if (!input.writesAvailable) return 'Cần mở khóa OWNER để tạo Caption & Poster.';
  if (input.campaignDeleted) return 'Chiến dịch đã bị xóa.';
  if (!input.insightLocked) return 'Khóa Insight trước khi tạo Caption & Poster.';
  if (input.rows.length === 0) return 'Chọn ít nhất một góc nội dung.';
  if (input.rows.length > PACKAGE_BATCH_LIMIT) return `Một lượt tối đa ${PACKAGE_BATCH_LIMIT} góc.`;
  const blocker = promptBlocker(input.caption.prompt, 'Caption') ?? promptBlocker(input.poster.prompt, 'Poster');
  if (blocker) return blocker;
  for (const references of [input.poster.referenceMediaSha256s, ...input.rows.map((row) => row.references ?? [])]) {
    if (references.length > POSTER_MAX_REFERENCES) return `Mỗi Poster dùng tối đa ${POSTER_MAX_REFERENCES} ảnh tham chiếu.`;
  }
  return null;
}

const trimmedPrompt = (prompt: ContentIdeaPromptChoice): ContentIdeaPromptChoice => prompt.source === 'FREESTYLE' ? { source: 'FREESTYLE', creativeText: prompt.creativeText.trim() } : prompt;

/** The create body (the campaign comes from the URL). Row values only travel when they differ from the batch. */
export function packageCreateRequest(input: { readonly caption: CaptionSettings; readonly poster: PosterSettings; readonly rows: readonly PackageRowDraft[] }, requestId: string) {
  const rows: PackageRow[] = input.rows.map((row) => {
    const caption = { ...(row.style && row.style !== input.caption.style ? { style: row.style } : {}), ...(row.length && row.length !== input.caption.length ? { length: row.length } : {}) };
    const display = { ...(Object.keys(row.caption).length ? { caption: { ...row.caption } } : {}), ...(Object.keys(row.poster).length ? { poster: { ...row.poster } } : {}) };
    return {
      angleId: row.angleId,
      ...(Object.keys(caption).length ? { caption } : {}),
      ...(row.references !== undefined ? { poster: { referenceMediaSha256s: [...row.references] } } : {}),
      ...(Object.keys(display).length ? { display } : {}),
    };
  });
  return {
    contractVersion: '1.0.0' as const, requestId,
    caption: { ...input.caption, prompt: trimmedPrompt(input.caption.prompt) },
    poster: { ...input.poster, prompt: trimmedPrompt(input.poster.prompt), referenceMediaSha256s: [...input.poster.referenceMediaSha256s] },
    rows,
  };
}
export type PackageCreateBody = ReturnType<typeof packageCreateRequest>;

// ------------------------------------------------------------------ run plan

export interface PackageRunCall {
  readonly packageId: string;
  readonly code: string;
  readonly part: PackagePart;
  readonly request: { readonly contractVersion: '1.0.0'; readonly requestId: string; readonly part: PackagePart; readonly plannedCallCount: number; readonly retryOfAttemptId?: string };
}

/** Calls a run makes: one per package and part — shown as “3 Caption + 3 Poster” before the owner starts. */
export function packageCallSummary(packageCount: number, parts: readonly PackagePart[]): string {
  return parts.map((part) => `${packageCount} ${PART_LABELS[part]}`).join(' + ');
}

/**
 * One request per package and part, each package's Caption before its Poster (a Poster is drawn from the current
 * Caption). Request ids are fixed here so a resumed call is an exact retry; every call carries the run total.
 */
export function packageRunPlan(packages: readonly { readonly packageId: string; readonly code: string }[], parts: readonly PackagePart[], newId: () => string = () => crypto.randomUUID(), retryOfAttemptId?: string): PackageRunCall[] {
  const plannedCallCount = packages.length * parts.length;
  return packages.flatMap((entry) => parts.map((part): PackageRunCall => ({
    packageId: entry.packageId, code: entry.code, part,
    request: { contractVersion: '1.0.0', requestId: newId(), part, plannedCallCount, ...(retryOfAttemptId ? { retryOfAttemptId } : {}) },
  })));
}

// ------------------------------------------------------------------ writes

/** The AI step failed (503 not configured, 502 provider or output failure); no version was saved for that call. */
export class PackageAiError extends Error {
  constructor(readonly unavailable: boolean, readonly reason: string | null, message: string) { super(message); }
}

const AI_UNAVAILABLE_MESSAGE = 'AI chưa được cấu hình trên máy chủ này — chưa thể tạo Caption & Poster.';

async function packageOwnerJson(url: string, token: string, body: unknown, fetcher: typeof fetch, conflictMessage: string): Promise<unknown> {
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
    if (response.status === 503) throw new PackageAiError(true, reason, AI_UNAVAILABLE_MESSAGE);
    throw new PackageAiError(false, reason, message ?? 'AI không trả về kết quả hợp lệ; lần gọi này không được lưu.');
  }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    throw new OwnerWriteError(kind, kind === 'conflict' ? conflictMessage
      : kind === 'invalid' ? 'OWNER API từ chối yêu cầu: kiểm tra prompt, ảnh tham chiếu và lựa chọn.'
      : kind === 'integrity' ? 'Dữ liệu đã lưu không vượt qua kiểm tra toàn vẹn; không có gì được ghi.'
      : kind === 'not_found' ? 'Không tìm thấy chiến dịch, góc nội dung hoặc gói.'
      : 'OWNER API từ chối yêu cầu.');
  }
  try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
}

const receiptError = (): never => { throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.'); };

export async function submitPackageCreate(input: { readonly campaignId: string; readonly request: PackageCreateBody; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPackageCreateReceipt> {
  const value = await packageOwnerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/packages`, input.token, input.request, fetcher,
    'Insight, góc nội dung hoặc chiến dịch đã thay đổi. Hãy tải lại.');
  const angles = input.request.rows.map((row) => row.angleId);
  if (!record(value) || !exactKeys(value, ['campaignId', 'contractVersion', 'exactRetry', 'packages', 'requestId']) || value.contractVersion !== '1.0.0'
    || value.campaignId !== input.campaignId || value.requestId !== input.request.requestId || typeof value.exactRetry !== 'boolean'
    || !Array.isArray(value.packages) || value.packages.length !== angles.length
    || !value.packages.every((entry, index) => record(entry) && exactKeys(entry, ['angleId', 'code', 'createdAt', 'packageId']) && uuid(entry.packageId)
      && entry.angleId === angles[index] && typeof entry.code === 'string' && PACKAGE_CODE.test(entry.code) && dateTime(entry.createdAt))) receiptError();
  return value as unknown as OwnerContentPackageCreateReceipt;
}

export async function submitPackageGenerate(input: { readonly call: PackageRunCall; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPackageGenerateReceipt> {
  const { call } = input;
  const value = await packageOwnerJson(`/owner-api/content/packages/${encodeURIComponent(call.packageId)}/generate`, input.token, call.request, fetcher,
    'Gói đang được tạo ở nơi khác, đã bị xóa hoặc chưa có Caption. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['attemptId', 'contractVersion', 'createdAt', 'exactRetry', 'packageId', 'part', 'version']) || value.contractVersion !== '1.0.0'
    || value.packageId !== call.packageId || value.part !== call.part || !version(value.version) || !uuid(value.attemptId) || !dateTime(value.createdAt)
    || typeof value.exactRetry !== 'boolean') receiptError();
  return value as unknown as OwnerContentPackageGenerateReceipt;
}

export interface PackageVersionInput {
  readonly packageId: string;
  readonly requestId: string;
  readonly part: PackagePart;
  readonly expectedVersion: number;
  readonly action: 'MANUAL' | 'RESTORE';
  readonly post?: string;
  readonly restoreVersion?: number;
}

export function manualPostBlocker(post: string): string | null {
  if (!post.trim()) return 'Nội dung Caption không được để trống.';
  if (chars(post) > POST_LIMIT) return `Caption tối đa ${POST_LIMIT} ký tự (chưa tính khối liên hệ).`;
  return null;
}

export async function submitPackageVersion(input: PackageVersionInput & { readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPackageVersionReceipt> {
  const body = {
    contractVersion: '1.0.0', requestId: input.requestId, part: input.part, expectedVersion: input.expectedVersion, action: input.action,
    ...(input.action === 'MANUAL' ? { post: input.post ?? '' } : { restoreVersion: input.restoreVersion }),
  };
  const value = await packageOwnerJson(`/owner-api/content/packages/${encodeURIComponent(input.packageId)}/versions`, input.token, body, fetcher,
    'Gói đã có phiên bản mới ở nơi khác. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['contractVersion', 'createdAt', 'exactRetry', 'packageId', 'part', 'source', 'version']) || value.contractVersion !== '1.0.0'
    || value.packageId !== input.packageId || value.part !== input.part || value.source !== input.action || value.version !== input.expectedVersion + 1
    || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') receiptError();
  return value as unknown as OwnerContentPackageVersionReceipt;
}

export async function submitPackageState(input: { readonly packageId: string; readonly expectedSequence: number; readonly action: 'DELETE' | 'RESTORE'; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentPackageStateReceipt> {
  const value = await packageOwnerJson(`/owner-api/content/packages/${encodeURIComponent(input.packageId)}/state`, input.token,
    { contractVersion: '1.0.0', expectedSequence: input.expectedSequence, action: input.action }, fetcher, 'Gói đã thay đổi ở nơi khác. Hãy tải lại.');
  const optional = record(value) && 'restorableUntil' in value ? ['restorableUntil'] : [];
  if (!record(value) || !exactKeys(value, ['action', 'contractVersion', 'createdAt', 'exactRetry', 'packageId', 'sequence', ...optional]) || value.contractVersion !== '1.0.0'
    || value.packageId !== input.packageId || value.action !== input.action || value.sequence !== input.expectedSequence + 1 || !dateTime(value.createdAt)
    || typeof value.exactRetry !== 'boolean' || (input.action === 'DELETE') !== ('restorableUntil' in value) || ('restorableUntil' in value && !dateTime(value.restorableUntil))) receiptError();
  return value as unknown as OwnerContentPackageStateReceipt;
}

export async function submitCampaignDefaults(input: { readonly campaignId: string; readonly expectedVersion: number; readonly defaults: PackageDefaults; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentCampaignDefaultsReceipt> {
  const defaults: PackageDefaults = {
    caption: { ...input.defaults.caption, prompt: trimmedPrompt(input.defaults.caption.prompt) },
    poster: { ...input.defaults.poster, prompt: trimmedPrompt(input.defaults.poster.prompt), referenceMediaSha256s: [...input.defaults.poster.referenceMediaSha256s] },
  };
  const value = await packageOwnerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/defaults`, input.token,
    { contractVersion: '1.0.0', expectedVersion: input.expectedVersion, defaults }, fetcher, 'Mặc định của chiến dịch đã được lưu ở nơi khác. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['campaignId', 'contractVersion', 'createdAt', 'exactRetry', 'version']) || value.contractVersion !== '1.0.0'
    || value.campaignId !== input.campaignId || value.version !== input.expectedVersion + 1 || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') receiptError();
  return value as unknown as OwnerContentCampaignDefaultsReceipt;
}

// ------------------------------------------------------------------ brand display (mirror of src/modules/flow/content-display-rules.ts)

type Profile = DemoBrand['profile'];
type Rules = DemoBrand['displayRules'];
type Levels = Record<(typeof POSTER_ELEMENTS)[number], ContentVisibility>;
const RANK: Readonly<Record<ContentVisibility, number>> = { HIDDEN: 0, OPTIONAL: 1, ALWAYS: 2 };
const RULE_KEYS: Readonly<Record<PurposeKind, keyof Rules>> = { SALES: 'sales', TRUST: 'trust', EDUCATION: 'education', ENTERTAINMENT: 'entertainment', ENGAGEMENT: 'engagement' };
const IDENTITY = new Set(['name', 'logo', 'tagline']);

export function purposeKindsOf(purposes: readonly string[], tags: IdeaList['purposeTags']): PurposeKind[] {
  const kinds = new Set<PurposeKind>();
  for (const purpose of purposes) {
    const kind = purpose.startsWith('tag:') ? tags.find((tag) => tag.tagId === purpose.slice(4))?.displayLike : purpose in RULE_KEYS ? purpose as PurposeKind : undefined;
    if (kind) kinds.add(kind);
  }
  return [...kinds];
}

/** Highest level of each element across the purposes' brand rules (Luôn > Tùy > Ẩn). */
export function resolveLevels(rules: Rules, kinds: readonly PurposeKind[]): Levels {
  const levels = {} as Levels;
  for (const element of POSTER_ELEMENTS) {
    let best: ContentVisibility = 'HIDDEN';
    for (const kind of kinds) if (RANK[rules[RULE_KEYS[kind]][element]] > RANK[best]) best = rules[RULE_KEYS[kind]][element];
    levels[element] = best;
  }
  return levels;
}

export function captionDisplayOf(levels: Levels, override: CaptionDisplayOverride = {}): ContentPackageSettingsView['captionDisplay'] {
  return { name: override.name ?? levels.name, tagline: override.tagline ?? levels.tagline, hotline: override.hotline ?? levels.hotline, web: override.web ?? levels.web, address: override.address ?? levels.address };
}

/** Luôn on; Tùy on only for identity; `includeLogo: false` turns the logo off; the override is final. */
export function posterDisplayOf(levels: Levels, includeLogo: boolean, override: PosterDisplayOverride = {}): ContentPackageSettingsView['posterDisplay'] {
  const display = {} as ContentPackageSettingsView['posterDisplay'];
  for (const element of POSTER_ELEMENTS) {
    const on = (levels[element] === 'ALWAYS' || (levels[element] === 'OPTIONAL' && IDENTITY.has(element))) && (element !== 'logo' || includeLogo);
    display[element] = override[element] ?? on;
  }
  return display;
}

export function captionFooter(profile: Profile, display: ContentPackageSettingsView['captionDisplay']): string {
  const lines: string[] = [];
  if (display.hotline === 'ALWAYS' && profile.hotline) lines.push(`Hotline: ${profile.hotline}`);
  if (display.web === 'ALWAYS' && profile.website) lines.push(`Website: ${profile.website}`);
  if (display.web === 'ALWAYS' && profile.fanpage) lines.push(`Fanpage: ${profile.fanpage}`);
  if (display.address === 'ALWAYS' && profile.address) lines.push(`Địa chỉ: ${profile.address}`);
  return lines.join('\n');
}

export function captionText(post: string, footer: string): string { return footer === '' ? post : `${post}\n\n${footer}`; }

// ------------------------------------------------------------------ demo (in memory only)

export interface DemoPackage {
  readonly packageId: string;
  readonly campaignId: string;
  readonly angleId: string;
  readonly code: string;
  readonly createRequestId: string;
  readonly settings: ContentPackageSettingsView;
  readonly footer: string;
  readonly captions: readonly CaptionVersion[];
  readonly posters: readonly PosterVersion[];
  readonly attempts: readonly ContentPackageAttemptView[];
  /** requestId → part and version it produced, so a repeated call is an exact retry. */
  readonly requests: Readonly<Record<string, { readonly part: PackagePart; readonly version: number }>>;
  readonly sequence: number;
  readonly deleted?: { readonly deletedAt: string; readonly restorableUntil: string };
  readonly createdAt: string;
}

export interface DemoPackageDefaults { readonly campaignId: string; readonly version: number; readonly defaults: PackageDefaults; readonly createdAt: string }

export interface DemoPackageContext {
  readonly campaign: { readonly campaignId: string; readonly name: string; readonly deleted: boolean; readonly insightLocked: boolean };
  readonly brand: DemoBrand | null;
  readonly ideas: IdeaList;
  readonly prompts: PromptList | null;
}

export class DemoPackageError extends Error {}

const restoreDeadline = (at: string): string => new Date(Date.parse(at) + PACKAGE_RESTORE_DAYS * 24 * 60 * 60 * 1000).toISOString();
const expired = (entry: DemoPackage, now: string): boolean => entry.deleted !== undefined && Date.parse(now) > Date.parse(entry.deleted.restorableUntil);

export function demoPackageList(packages: readonly DemoPackage[], defaults: readonly DemoPackageDefaults[], context: DemoPackageContext, now: string): PackageList {
  const own = defaults.find((entry) => entry.campaignId === context.campaign.campaignId);
  return {
    contractVersion: '1.0.0', campaignId: context.campaign.campaignId, campaignName: context.campaign.name, campaignDeleted: context.campaign.deleted, insightLocked: context.campaign.insightLocked,
    ...(own ? { defaults: { version: own.version, defaults: own.defaults, createdAt: own.createdAt } } : {}),
    packages: packages.filter((entry) => entry.campaignId === context.campaign.campaignId && !expired(entry, now)).map((entry): PackageEntry => {
      const caption = entry.captions.at(-1);
      return {
        packageId: entry.packageId, angleId: entry.angleId, code: entry.code, deleted: entry.deleted !== undefined, ...(entry.deleted ? { restorableUntil: entry.deleted.restorableUntil } : {}),
        stateSequence: entry.sequence, captionVersion: entry.captions.length, posterVersion: entry.posters.length,
        ...(caption ? { captionPreview: [...caption.post].slice(0, 280).join('') } : {}), posterFormat: entry.settings.posterFormat, createdAt: entry.createdAt,
      };
    }),
  };
}

export function demoPackageDetail(packages: readonly DemoPackage[], packageId: string, context: DemoPackageContext, now: string): PackageDetail | null {
  const entry = packages.find((candidate) => candidate.packageId === packageId && candidate.campaignId === context.campaign.campaignId);
  if (!entry || expired(entry, now)) return null;
  return {
    contractVersion: '1.0.0', packageId: entry.packageId, campaignId: entry.campaignId, campaignName: context.campaign.name, campaignDeleted: context.campaign.deleted,
    angleId: entry.angleId, code: entry.code, deleted: entry.deleted !== undefined, ...(entry.deleted ? { restorableUntil: entry.deleted.restorableUntil } : {}),
    stateSequence: entry.sequence, settings: entry.settings, footer: entry.footer, captions: [...entry.captions], posters: [...entry.posters], attempts: [...entry.attempts], createdAt: entry.createdAt,
  };
}

export function createDemoPackages(packages: readonly DemoPackage[], context: DemoPackageContext, request: PackageCreateBody, now: string, newId: () => string = () => crypto.randomUUID()): { readonly packages: DemoPackage[]; readonly receipt: OwnerContentPackageCreateReceipt } {
  const campaignId = context.campaign.campaignId;
  const repeated = packages.filter((entry) => entry.createRequestId === request.requestId);
  if (repeated.length) return { packages: [...packages], receipt: { contractVersion: '1.0.0', campaignId, requestId: request.requestId, exactRetry: true, packages: repeated.map((entry) => ({ packageId: entry.packageId, angleId: entry.angleId, code: entry.code, createdAt: entry.createdAt })) } };
  const brand = context.brand;
  if (!brand || context.campaign.deleted || !context.campaign.insightLocked) throw new DemoPackageError('Demo package conflict');
  const next = [...packages];
  const created: DemoPackage[] = [];
  for (const row of request.rows) {
    const angle = context.ideas.ideas.find((idea) => idea.ideaId === row.angleId && idea.kind === 'ANGLE');
    if (!angle || angle.deleted || angle.purposes.length === 0) throw new DemoPackageError('Demo package conflict');
    const levels = resolveLevels(brand.displayRules, purposeKindsOf(angle.purposes, context.ideas.purposeTags));
    const captionDisplay = captionDisplayOf(levels, row.display?.caption);
    const references = row.poster?.referenceMediaSha256s ?? request.poster.referenceMediaSha256s;
    const ordinal = next.filter((entry) => entry.angleId === angle.ideaId).length + 1;
    const entry: DemoPackage = {
      packageId: newId(), campaignId, angleId: angle.ideaId, code: `${angle.code}·${ordinal}`, createRequestId: request.requestId,
      settings: {
        brandId: brand.brandId, purposes: [...angle.purposes], captionPromptName: promptChoiceName(request.caption.prompt, context.prompts), captionModel: request.caption.model,
        captionStyle: row.caption?.style ?? request.caption.style, captionLength: row.caption?.length ?? request.caption.length,
        posterPromptName: promptChoiceName(request.poster.prompt, context.prompts), posterModel: request.poster.model, posterFormat: request.poster.format, includeLogo: request.poster.includeLogo,
        ...(brand.logoMediaSha256 && request.poster.includeLogo ? { logoMediaSha256: brand.logoMediaSha256 } : {}), referenceMediaSha256s: [...references],
        captionDisplay, posterDisplay: posterDisplayOf(levels, request.poster.includeLogo, row.display?.poster),
      },
      footer: captionFooter(brand.profile, captionDisplay), captions: [], posters: [], attempts: [], requests: {}, sequence: 0, createdAt: now,
    };
    next.push(entry);
    created.push(entry);
  }
  return { packages: next, receipt: { contractVersion: '1.0.0', campaignId, requestId: request.requestId, exactRetry: false, packages: created.map((entry) => ({ packageId: entry.packageId, angleId: entry.angleId, code: entry.code, createdAt: entry.createdAt })) } };
}

const comparable = (text: string): string => text.normalize('NFC').toLocaleLowerCase('vi').replace(/\s+/gu, ' ').trim();

/** Simplified demo checklist: an element is ✓ when its profile value appears in the post, Ẩn when the purpose hides it. */
export function demoFactCheck(post: string, profile: Profile, display: ContentPackageSettingsView['captionDisplay']): FactRow[] {
  const text = comparable(post);
  const row = (element: FactRow['element'], hidden: boolean, value: string | undefined): FactRow => hidden ? { element, state: 'HIDDEN', found: [] }
    : value && text.includes(comparable(value)) ? { element, state: 'MATCH', found: [value] } : { element, state: 'NOT_MENTIONED', found: [] };
  return [
    row('name', display.name === 'HIDDEN', profile.brandName), row('tagline', display.tagline === 'HIDDEN', profile.tagline), row('hotline', display.hotline === 'HIDDEN', profile.hotline),
    row('website', display.web === 'HIDDEN', profile.website), row('fanpage', display.web === 'HIDDEN', profile.fanpage), row('address', display.address === 'HIDDEN', profile.address),
    { element: 'price', state: 'NOT_MENTIONED', found: [] },
  ];
}

const DEMO_OPENERS = ['Bạn đã bao giờ', 'Một buổi sáng bận rộn,', 'Nhiều khách hàng hỏi chúng tôi:', 'Chuyện nhỏ nhưng quan trọng:'];

function demoPost(entry: DemoPackage, angle: IdeaEntry | undefined, brand: DemoBrand, versionNumber: number): string {
  const opener = DEMO_OPENERS[(versionNumber + entry.code.length) % DEMO_OPENERS.length]!;
  const tone = entry.settings.captionStyle === 'FRIENDLY' ? 'Cùng thử nhé! 💬' : 'Liên hệ để được tư vấn chi tiết.';
  const name = entry.settings.captionDisplay.name === 'HIDDEN' ? 'chúng tôi' : brand.profile.brandName;
  const tagline = entry.settings.captionDisplay.tagline === 'ALWAYS' && brand.profile.tagline ? ` “${brand.profile.tagline}”.` : '';
  return `${opener} ${angle?.name ?? entry.code} — ${angle?.concept ?? ''}\n\n${name} đồng hành cùng bạn từ bước đầu tiên.${tagline} ${tone}`.trim();
}

/** Deterministic demo stand-in for one Caption or Poster call. Nothing leaves the page. */
export function generateDemoPart(packages: readonly DemoPackage[], context: DemoPackageContext, call: PackageRunCall, now: string, attemptId: string): { readonly packages: DemoPackage[]; readonly receipt: OwnerContentPackageGenerateReceipt } {
  const entry = packages.find((candidate) => candidate.packageId === call.packageId);
  if (!entry) throw new DemoPackageError('Demo package missing');
  const repeated = entry.requests[call.request.requestId];
  if (repeated) {
    const versionView = (repeated.part === 'CAPTION' ? entry.captions : entry.posters)[repeated.version - 1]!;
    return { packages: [...packages], receipt: { contractVersion: '1.0.0', packageId: entry.packageId, part: repeated.part, version: repeated.version, attemptId: versionView.attemptId ?? attemptId, createdAt: versionView.createdAt, exactRetry: true } };
  }
  const brand = context.brand;
  if (!brand || entry.deleted || context.campaign.deleted || (call.part === 'POSTER' && entry.captions.length === 0)) throw new DemoPackageError('Demo package conflict');
  const attempt: ContentPackageAttemptView = {
    attemptId, part: call.part, state: 'succeeded', errorCode: null, retryOf: call.request.retryOfAttemptId ?? null,
    model: call.part === 'CAPTION' ? entry.settings.captionModel : entry.settings.posterModel, createdAt: now, closedAt: now,
  };
  let next: DemoPackage;
  let versionNumber: number;
  if (call.part === 'CAPTION') {
    versionNumber = entry.captions.length + 1;
    const post = demoPost(entry, context.ideas.ideas.find((idea) => idea.ideaId === entry.angleId), brand, versionNumber);
    const caption: CaptionVersion = { version: versionNumber, source: 'GENERATED', attemptId, post, footer: entry.footer, text: captionText(post, entry.footer), factCheck: demoFactCheck(post, brand.profile, entry.settings.captionDisplay), createdAt: now };
    next = { ...entry, captions: [...entry.captions, caption], attempts: [...entry.attempts, attempt], requests: { ...entry.requests, [call.request.requestId]: { part: 'CAPTION', version: versionNumber } } };
  } else {
    versionNumber = entry.posters.length + 1;
    const format = POSTER_FORMATS.find((candidate) => candidate.key === entry.settings.posterFormat)!;
    const poster: PosterVersion = { version: versionNumber, source: 'GENERATED', attemptId, mediaType: 'image/png', width: format.width, height: format.height, sizeMatchesFormat: true, captionVersion: entry.captions.length, createdAt: now };
    next = { ...entry, posters: [...entry.posters, poster], attempts: [...entry.attempts, attempt], requests: { ...entry.requests, [call.request.requestId]: { part: 'POSTER', version: versionNumber } } };
  }
  return { packages: packages.map((candidate) => candidate === entry ? next : candidate), receipt: { contractVersion: '1.0.0', packageId: entry.packageId, part: call.part, version: versionNumber, attemptId, createdAt: now, exactRetry: false } };
}

export function changeDemoPackageVersion(packages: readonly DemoPackage[], context: DemoPackageContext, input: PackageVersionInput, now: string): DemoPackage[] {
  return packages.map((entry) => {
    if (entry.packageId !== input.packageId) return entry;
    if (entry.requests[input.requestId]) return entry;
    const list = input.part === 'CAPTION' ? entry.captions : entry.posters;
    if (entry.deleted || list.length !== input.expectedVersion || !context.brand) throw new DemoPackageError('Demo package version conflict');
    const versionNumber = list.length + 1;
    const requests = { ...entry.requests, [input.requestId]: { part: input.part, version: versionNumber } };
    if (input.action === 'MANUAL') {
      if (input.part !== 'CAPTION' || manualPostBlocker(input.post ?? '')) throw new DemoPackageError('Demo package version conflict');
      const post = input.post!;
      return { ...entry, requests, captions: [...entry.captions, { version: versionNumber, source: 'MANUAL', post, footer: entry.footer, text: captionText(post, entry.footer), factCheck: demoFactCheck(post, context.brand.profile, entry.settings.captionDisplay), createdAt: now }] };
    }
    const source = list[(input.restoreVersion ?? 0) - 1];
    if (!source) throw new DemoPackageError('Demo package version conflict');
    const { attemptId: _attempt, restoredFromVersion: _from, ...rest } = source;
    if (input.part === 'CAPTION') return { ...entry, requests, captions: [...entry.captions, { ...(rest as Omit<CaptionVersion, 'attemptId' | 'restoredFromVersion'>), version: versionNumber, source: 'RESTORE', restoredFromVersion: source.version, createdAt: now }] };
    return { ...entry, requests, posters: [...entry.posters, { ...(rest as Omit<PosterVersion, 'attemptId' | 'restoredFromVersion'>), version: versionNumber, source: 'RESTORE', restoredFromVersion: source.version, createdAt: now }] };
  });
}

export function changeDemoPackageState(packages: readonly DemoPackage[], input: { readonly packageId: string; readonly expectedSequence: number; readonly action: 'DELETE' | 'RESTORE' }, now: string): DemoPackage[] {
  return packages.map((entry) => {
    if (entry.packageId !== input.packageId) return entry;
    if (entry.sequence !== input.expectedSequence || expired(entry, now) || (input.action === 'DELETE') === (entry.deleted !== undefined)) throw new DemoPackageError('Demo package state conflict');
    if (input.action === 'DELETE') return { ...entry, sequence: entry.sequence + 1, deleted: { deletedAt: now, restorableUntil: restoreDeadline(now) } };
    const { deleted: _removed, ...rest } = entry;
    return { ...rest, sequence: entry.sequence + 1 };
  });
}

export function saveDemoPackageDefaults(all: readonly DemoPackageDefaults[], campaignId: string, expectedVersion: number, defaults: PackageDefaults, now: string): DemoPackageDefaults[] {
  const current = all.find((entry) => entry.campaignId === campaignId);
  if ((current?.version ?? 0) !== expectedVersion) throw new DemoPackageError('Demo defaults conflict');
  return [...all.filter((entry) => entry.campaignId !== campaignId), { campaignId, version: expectedVersion + 1, defaults, createdAt: now }];
}

/** Placeholder artwork for a demo Poster version: an SVG in the format's aspect ratio, never a real image. */
export function demoPosterDataUrl(entry: { readonly code: string; readonly settings: ContentPackageSettingsView }, poster: PosterVersion, brandName: string): string {
  const hue = (poster.version * 47 + entry.code.length * 31) % 360;
  const w = poster.width / 8;
  const h = poster.height / 8;
  const label = entry.settings.posterDisplay.name ? brandName : entry.code;
  const escape = (text: string): string => text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="hsl(${hue} 45% 32%)"/>`
    + `<circle cx="${w * 0.72}" cy="${h * 0.34}" r="${Math.min(w, h) * 0.22}" fill="hsl(${(hue + 40) % 360} 60% 62%)"/>`
    + `<text x="${w * 0.08}" y="${h * 0.8}" font-family="sans-serif" font-size="${Math.min(w, h) * 0.09}" fill="#fff">${escape(label)}</text>`
    + `<text x="${w * 0.08}" y="${h * 0.9}" font-family="sans-serif" font-size="${Math.min(w, h) * 0.055}" fill="#fff" opacity="0.8">Poster minh họa · ${escape(entry.code)} · v${poster.version}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
