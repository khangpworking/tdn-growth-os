import type { ContentCatalogHistoryItem, ContentCatalogItemSummary } from '../../contracts/api/content-api.generated';
import type {
  ContentCatalogItemContent,
  ContentCatalogItemType,
  ContentCatalogPhoto,
  OwnerContentCatalogItemReceipt,
  OwnerContentMediaKind,
  OwnerContentMediaReceipt,
  OwnerContentMediaRejection,
} from '../../contracts/api/owner-content-catalog-api.generated';
import { dateTime, exactKeys, invalid, readJson, record, sha256, uuid, version as positiveVersion } from './content-data-source';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';
import { createDraftEditorReducer, type DraftEditor, type DraftEditorEvent } from './draft-editor';

export type CatalogItemType = ContentCatalogItemType;
export type MediaKind = OwnerContentMediaKind;
export type CatalogPhoto = ContentCatalogPhoto;
export type CatalogSummary = ContentCatalogItemSummary;
export interface CatalogDetail {
  readonly item: { readonly itemId: string; readonly brandId: string; readonly itemKey: string; readonly version: number; readonly item: ContentCatalogItemContent; readonly createdAt: string };
  readonly history: readonly ContentCatalogHistoryItem[];
}

export const ITEM_TYPES: readonly { readonly key: CatalogItemType; readonly label: string; readonly badge: string }[] = [
  { key: 'PHYSICAL', label: 'Sản phẩm vật lý', badge: 'Sản phẩm' },
  { key: 'SERVICE', label: 'Dịch vụ', badge: 'Dịch vụ' },
];
export const MEDIA_TYPES = ['image/png', 'image/jpeg'] as const;
export const MEDIA_LIMITS: Readonly<Record<MediaKind, { readonly maxBytes: number; readonly label: string }>> = {
  LOGO: { maxBytes: 2 * 1024 * 1024, label: 'Logo tối đa 2 MB.' },
  PHOTO: { maxBytes: 8 * 1024 * 1024, label: 'Ảnh tối đa 8 MB.' },
};
const MAX_TIERS = 8;
const MAX_INCLUSIONS = 12;
const MAX_PHOTOS = 12;

export interface TierDraft {
  readonly tierKey: string;
  readonly name: string;
  readonly priceText: string;
  /** One inclusion per line. */
  readonly inclusionsText: string;
}
export interface CatalogDraft {
  readonly itemType: CatalogItemType;
  readonly name: string;
  readonly description: string;
  readonly tiers: readonly TierDraft[];
  readonly photos: readonly CatalogPhoto[];
}
export interface CatalogBase {
  readonly itemId: string;
  readonly version: number;
  readonly draft: CatalogDraft;
  readonly history: readonly ContentCatalogHistoryItem[];
}

export function emptyCatalogDraft(): CatalogDraft {
  return { itemType: 'PHYSICAL', name: '', description: '', tiers: [], photos: [] };
}

export function draftFromItem(item: ContentCatalogItemContent): CatalogDraft {
  return {
    itemType: item.itemType, name: item.name, description: item.description ?? '',
    tiers: item.tiers.map((tier) => ({ tierKey: tier.tierKey, name: tier.name, priceText: tier.priceText ?? '', inclusionsText: tier.inclusions.join('\n') })),
    photos: item.photos.map((photo) => ({ ...photo })),
  };
}

const lines = (text: string): string[] => text.split('\n').map((line) => line.trim()).filter(Boolean);
const tooLong = (text: string, max: number): boolean => [...text.trim()].length > max;

export function catalogDraftBlocker(draft: CatalogDraft): string | null {
  if (!draft.name.trim()) return 'Nhập tên sản phẩm hoặc dịch vụ.';
  if (tooLong(draft.name, 120)) return 'Tên tối đa 120 ký tự.';
  if (tooLong(draft.description, 2000)) return 'Mô tả tối đa 2000 ký tự.';
  if (draft.tiers.length > MAX_TIERS) return `Tối đa ${MAX_TIERS} gói.`;
  for (const tier of draft.tiers) {
    if (!tier.name.trim()) return 'Mỗi gói cần có tên.';
    if (tooLong(tier.name, 80) || tooLong(tier.priceText, 80)) return 'Tên gói và giá tối đa 80 ký tự.';
    const inclusions = lines(tier.inclusionsText);
    if (inclusions.length > MAX_INCLUSIONS) return `Mỗi gói tối đa ${MAX_INCLUSIONS} dòng “Bao gồm”.`;
    if (inclusions.some((line) => tooLong(line, 160))) return 'Mỗi dòng “Bao gồm” tối đa 160 ký tự.';
  }
  if (draft.photos.length > MAX_PHOTOS) return `Tối đa ${MAX_PHOTOS} ảnh.`;
  return null;
}

export function catalogRequestFromDraft(draft: CatalogDraft): ContentCatalogItemContent {
  const description = draft.description.trim();
  return {
    itemType: draft.itemType,
    name: draft.name.trim(),
    ...(description ? { description } : {}),
    tiers: draft.tiers.map((tier) => {
      const priceText = tier.priceText.trim();
      return { tierKey: tier.tierKey, name: tier.name.trim(), ...(priceText ? { priceText } : {}), inclusions: lines(tier.inclusionsText) };
    }) as ContentCatalogItemContent['tiers'],
    photos: draft.photos.map((photo) => ({ mediaSha256: photo.mediaSha256, posterDefault: photo.posterDefault })) as ContentCatalogItemContent['photos'],
  } as ContentCatalogItemContent;
}

export function sameCatalogContent(left: CatalogDraft, right: CatalogDraft): boolean {
  return JSON.stringify(catalogRequestFromDraft(left)) === JSON.stringify(catalogRequestFromDraft(right));
}

export function catalogDifferences(draft: CatalogDraft, saved: CatalogDraft): string[] {
  const left = catalogRequestFromDraft(draft); const right = catalogRequestFromDraft(saved);
  const fields: string[] = [];
  if (left.itemType !== right.itemType) fields.push('Loại');
  if (left.name !== right.name) fields.push('Tên');
  if ((left.description ?? '') !== (right.description ?? '')) fields.push('Mô tả');
  if (JSON.stringify(left.tiers) !== JSON.stringify(right.tiers)) fields.push('Gói / phiên bản');
  if (JSON.stringify(left.photos) !== JSON.stringify(right.photos)) fields.push('Ảnh');
  return fields;
}

export type CatalogEditor = DraftEditor<CatalogDraft, CatalogBase>;
export type CatalogEditorEvent = DraftEditorEvent<CatalogDraft, CatalogBase>;
export const catalogEditorReducer = createDraftEditorReducer<CatalogDraft, CatalogBase>({
  idOf: (base) => base.itemId,
  empty: emptyCatalogDraft,
  same: sameCatalogContent,
  differences: catalogDifferences,
});

export function generatedItemKey(id: string = crypto.randomUUID()): string {
  const compact = id.toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new TypeError('A UUID is required to generate an item key');
  return `item-${compact}`;
}

export function generatedTierKey(id: string = crypto.randomUUID()): string {
  return `t-${id.toLowerCase().replace(/-/g, '').slice(0, 12)}`;
}

export function mediaUrl(brandId: string, mediaSha256: string): string {
  return `/api/content/brands/${encodeURIComponent(brandId)}/media/${encodeURIComponent(mediaSha256)}`;
}

// ------------------------------------------------------------------ reads

export async function loadCatalog(brandId: string, fetcher: typeof fetch = fetch): Promise<CatalogSummary[] | null> {
  const value = await readJson(`/api/content/brands/${encodeURIComponent(brandId)}/catalog`, fetcher);
  if (value === null) return null;
  if (!record(value) || !exactKeys(value, ['brandId', 'contractVersion', 'items']) || value.contractVersion !== '1.0.0' || value.brandId !== brandId || !Array.isArray(value.items) || !value.items.every(summary)) invalid();
  return (value.items as CatalogSummary[]).map((item) => ({ ...item, tierNames: [...item.tierNames] }));
}

export async function loadCatalogItem(brandId: string, itemId: string, fetcher: typeof fetch = fetch): Promise<CatalogDetail | null> {
  const value = await readJson(`/api/content/brands/${encodeURIComponent(brandId)}/catalog/${encodeURIComponent(itemId)}`, fetcher);
  if (value === null) return null;
  if (!record(value) || !exactKeys(value, ['contractVersion', 'history', 'item']) || value.contractVersion !== '1.0.0') invalid();
  const item = value.item;
  if (!record(item) || !exactKeys(item, ['brandId', 'createdAt', 'item', 'itemId', 'itemKey', 'version']) || item.itemId !== itemId || item.brandId !== brandId || typeof item.itemKey !== 'string' || !positiveVersion(item.version) || !dateTime(item.createdAt) || !itemContent(item.item)) invalid();
  const history = value.history;
  if (!Array.isArray(history) || history.length !== item.version || !history.every((entry, index) => record(entry) && exactKeys(entry, ['createdAt', 'name', 'version']) && entry.version === index + 1 && typeof entry.name === 'string' && dateTime(entry.createdAt))) invalid();
  return value as unknown as CatalogDetail;
}

function summary(value: unknown): boolean {
  return record(value) && exactKeys(value, ['itemId', 'itemKey', 'itemType', 'name', 'photoCount', 'tierNames', 'updatedAt', 'version']) && uuid(value.itemId)
    && typeof value.itemKey === 'string' && ITEM_TYPES.some((type) => type.key === value.itemType) && typeof value.name === 'string'
    && Array.isArray(value.tierNames) && value.tierNames.every((name) => typeof name === 'string')
    && Number.isSafeInteger(value.photoCount) && Number(value.photoCount) >= 0 && positiveVersion(value.version) && dateTime(value.updatedAt);
}

function itemContent(value: unknown): boolean {
  if (!record(value) || !ITEM_TYPES.some((type) => type.key === value.itemType) || typeof value.name !== 'string') return false;
  const keys = ['itemType', 'name', 'photos', 'tiers', ...('description' in value ? ['description'] : [])];
  if (!exactKeys(value, keys) || ('description' in value && typeof value.description !== 'string')) return false;
  const tiers = value.tiers; const photos = value.photos;
  return Array.isArray(tiers) && tiers.every((tier) => record(tier) && exactKeys(tier, ['inclusions', 'name', 'tierKey', ...('priceText' in tier ? ['priceText'] : [])])
      && typeof tier.tierKey === 'string' && typeof tier.name === 'string' && (!('priceText' in tier) || typeof tier.priceText === 'string')
      && Array.isArray(tier.inclusions) && tier.inclusions.every((line) => typeof line === 'string'))
    && Array.isArray(photos) && photos.every((photo) => record(photo) && exactKeys(photo, ['mediaSha256', 'posterDefault']) && sha256(photo.mediaSha256) && typeof photo.posterDefault === 'boolean');
}

// ------------------------------------------------------------------ OWNER writes

export async function submitCatalogCreate(input: { readonly brandId: string; readonly itemKey: string; readonly item: ContentCatalogItemContent; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentCatalogItemReceipt> {
  const value = await ownerPost(`/owner-api/content/brands/${encodeURIComponent(input.brandId)}/catalog`, input.token, 'application/json', JSON.stringify({ contractVersion: '1.0.0', itemKey: input.itemKey, item: input.item }), fetcher, 'Sản phẩm/dịch vụ đã thay đổi. Hãy tải lại trước khi lưu.');
  return itemReceipt(value, input.brandId);
}

export async function submitCatalogRevision(input: { readonly brandId: string; readonly itemId: string; readonly expectedVersion: number; readonly item: ContentCatalogItemContent; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentCatalogItemReceipt> {
  const value = await ownerPost(`/owner-api/content/brands/${encodeURIComponent(input.brandId)}/catalog/${encodeURIComponent(input.itemId)}/revisions`, input.token, 'application/json', JSON.stringify({ contractVersion: '1.0.0', expectedVersion: input.expectedVersion, item: input.item }), fetcher, 'Sản phẩm/dịch vụ đã thay đổi. Hãy tải lại trước khi lưu.');
  const receipt = itemReceipt(value, input.brandId);
  if (receipt.itemId !== input.itemId) throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  return receipt;
}

export async function uploadBrandMedia(input: { readonly brandId: string; readonly kind: MediaKind; readonly file: Blob; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentMediaReceipt> {
  const value = await ownerPost(`/owner-api/content/brands/${encodeURIComponent(input.brandId)}/media/${input.kind === 'LOGO' ? 'logo' : 'photo'}`, input.token, input.file.type, input.file, fetcher, 'Ảnh không được chấp nhận.', input.kind);
  if (!record(value) || !exactKeys(value, ['brandId', 'byteSize', 'contractVersion', 'exactRetry', 'height', 'mediaKind', 'mediaSha256', 'mediaType', 'width']) || value.contractVersion !== '1.0.0'
    || value.brandId !== input.brandId || value.mediaKind !== input.kind || !sha256(value.mediaSha256) || !MEDIA_TYPES.includes(value.mediaType as typeof MEDIA_TYPES[number])
    || !Number.isSafeInteger(value.width) || !Number.isSafeInteger(value.height) || !Number.isSafeInteger(value.byteSize) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận ảnh không hợp lệ.');
  }
  return value as unknown as OwnerContentMediaReceipt;
}

/** Client-side check before upload; the server repeats every check. */
export function mediaBlocker(file: { readonly type: string; readonly size: number }, kind: MediaKind): string | null {
  if (!MEDIA_TYPES.includes(file.type as typeof MEDIA_TYPES[number])) return mediaRejectionMessage('unsupported_format', kind);
  if (file.size > MEDIA_LIMITS[kind].maxBytes) return MEDIA_LIMITS[kind].label;
  return null;
}

export function mediaRejectionMessage(reason: OwnerContentMediaRejection, kind: MediaKind): string {
  switch (reason) {
    case 'unsupported_format': return 'Chỉ nhận ảnh PNG hoặc JPEG (không nhận WebP, SVG, GIF, HEIC, ảnh CMYK hay ảnh động). Hãy xuất lại ảnh thành JPEG hoặc PNG.';
    case 'type_mismatch': return 'Định dạng ảnh không khớp với nội dung tệp. Hãy xuất lại ảnh rồi thử lại.';
    case 'too_large': return MEDIA_LIMITS[kind].label;
    case 'dimensions': return 'Mỗi cạnh ảnh phải từ 64 đến 8192 px.';
    case 'animated': return 'Không nhận ảnh động.';
    case 'trailing_data': return 'Ảnh có dữ liệu thừa sau phần hình (ví dụ ảnh chuyển động). Hãy xuất lại thành ảnh JPEG thường.';
    case 'invalid': return 'Tệp ảnh bị hỏng hoặc thiếu dữ liệu ảnh. Hãy xuất lại ảnh rồi thử lại.';
  }
}

const REJECTIONS: readonly OwnerContentMediaRejection[] = ['unsupported_format', 'type_mismatch', 'too_large', 'dimensions', 'invalid', 'animated', 'trailing_data'];

async function ownerPost(url: string, token: string, contentType: string, body: BodyInit, fetcher: typeof fetch, conflictMessage: string, mediaKind?: MediaKind): Promise<unknown> {
  let response: Response;
  try { response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType, Accept: 'application/json' }, body }); }
  catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    let reason: OwnerContentMediaRejection | undefined;
    try { const error = await response.json() as { error?: { reason?: unknown } }; if (REJECTIONS.includes(error.error?.reason as OwnerContentMediaRejection)) reason = error.error!.reason as OwnerContentMediaRejection; } catch { /* keep generic message */ }
    const message = kind === 'conflict' ? conflictMessage
      : reason && mediaKind ? mediaRejectionMessage(reason, mediaKind)
      : kind === 'invalid' ? 'OWNER API từ chối yêu cầu: dữ liệu không hợp lệ hoặc ảnh chưa được tải lên cho thương hiệu này.'
      : kind === 'integrity' ? 'Dữ liệu đã lưu không vượt qua kiểm tra toàn vẹn; không có gì được ghi.'
      : 'OWNER API từ chối yêu cầu.';
    throw new OwnerWriteError(kind, message);
  }
  try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
}

function itemReceipt(value: unknown, brandId: string): OwnerContentCatalogItemReceipt {
  if (!record(value) || !exactKeys(value, ['brandId', 'contractVersion', 'createdAt', 'exactRetry', 'itemId', 'itemKey', 'name', 'version']) || value.contractVersion !== '1.0.0'
    || value.brandId !== brandId || !uuid(value.itemId) || typeof value.itemKey !== 'string' || typeof value.name !== 'string' || !positiveVersion(value.version) || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentCatalogItemReceipt;
}

// ------------------------------------------------------------------ demo (in memory only)

export interface DemoCatalogItem {
  readonly itemId: string;
  readonly brandId: string;
  readonly itemKey: string;
  readonly version: number;
  readonly item: ContentCatalogItemContent;
  readonly createdAt: string;
  readonly history: readonly ContentCatalogHistoryItem[];
}

export function createDemoItem(items: readonly DemoCatalogItem[], brandId: string, draft: CatalogDraft, itemId: string, now: string): DemoCatalogItem[] {
  const item = catalogRequestFromDraft(draft);
  return [...items, { itemId, brandId, itemKey: generatedItemKey(itemId), version: 1, item, createdAt: now, history: [{ version: 1, name: item.name, createdAt: now }] }];
}

export function reviseDemoItem(items: readonly DemoCatalogItem[], itemId: string, expectedVersion: number, draft: CatalogDraft, now: string): DemoCatalogItem[] {
  return items.map((entry) => {
    if (entry.itemId !== itemId) return entry;
    if (entry.version !== expectedVersion) throw new Error('Demo catalog revision conflict');
    const item = catalogRequestFromDraft(draft); const version = entry.version + 1;
    return { ...entry, item, version, createdAt: now, history: [...entry.history, { version, name: item.name, createdAt: now }] };
  });
}

/** Demo uploads stay in the page as data URLs keyed by their SHA-256. */
export async function demoMediaFromFile(file: Blob): Promise<{ readonly mediaSha256: string; readonly dataUrl: string }> {
  const buffer = await file.arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  let binary = ''; for (const byte of new Uint8Array(buffer)) binary += String.fromCharCode(byte);
  return { mediaSha256: digest, dataUrl: `data:${file.type};base64,${btoa(binary)}` };
}
