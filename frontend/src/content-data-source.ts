import type { ContentBrandDetailResponse, ContentBrandSummary, ContentDisplayRules, ContentProfile, ContentVisibility } from '../../contracts/api/content-api.generated';
import type { OwnerContentBrandReceipt } from '../../contracts/api/owner-content-brand-api.generated';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';

export type PurposeKey = keyof ContentDisplayRules;
export type ElementKey = keyof ContentDisplayRules['sales'];
export type BrandDetail = ContentBrandDetailResponse;

export const BRAND_PURPOSES: readonly { readonly key: PurposeKey; readonly label: string }[] = [
  { key: 'sales', label: 'Bán hàng' },
  { key: 'trust', label: 'Niềm tin' },
  { key: 'education', label: 'Giáo dục' },
  { key: 'entertainment', label: 'Giải trí' },
  { key: 'engagement', label: 'Tương tác' },
];
export const BRAND_ELEMENTS: readonly { readonly key: ElementKey; readonly label: string; readonly group: 'identity' | 'contact' }[] = [
  { key: 'name', label: 'Tên thương hiệu', group: 'identity' },
  { key: 'logo', label: 'Logo', group: 'identity' },
  { key: 'tagline', label: 'Tagline', group: 'identity' },
  { key: 'hotline', label: 'Hotline', group: 'contact' },
  { key: 'web', label: 'Website / Fanpage', group: 'contact' },
  { key: 'address', label: 'Địa chỉ', group: 'contact' },
];
export const VISIBILITY_OPTIONS: readonly { readonly key: ContentVisibility; readonly label: string }[] = [
  { key: 'ALWAYS', label: 'Luôn' },
  { key: 'OPTIONAL', label: 'Tùy' },
  { key: 'HIDDEN', label: 'Ẩn' },
];

/** Task 047 §5 defaults; stored explicitly with every brand revision. */
export const DEFAULT_DISPLAY_RULES: ContentDisplayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
};

const FACTS = ['tagline', 'hotline', 'website', 'fanpage', 'address'] as const;
type FactKey = typeof FACTS[number];
const LIMITS: Readonly<Record<'brandName' | FactKey, { readonly max: number; readonly label: string }>> = {
  brandName: { max: 120, label: 'Tên thương hiệu' },
  tagline: { max: 240, label: 'Tagline' },
  hotline: { max: 64, label: 'Hotline' },
  website: { max: 512, label: 'Website' },
  fanpage: { max: 512, label: 'Fanpage' },
  address: { max: 1000, label: 'Địa chỉ' },
};

export interface BrandDraft {
  readonly brandName: string;
  readonly tagline: string;
  readonly hotline: string;
  readonly website: string;
  readonly fanpage: string;
  readonly address: string;
  readonly displayRules: ContentDisplayRules;
}
export interface BrandRequest { readonly profile: ContentProfile; readonly displayRules: ContentDisplayRules }

export function emptyBrandDraft(): BrandDraft {
  return { brandName: '', tagline: '', hotline: '', website: '', fanpage: '', address: '', displayRules: cloneRules(DEFAULT_DISPLAY_RULES) };
}

export function draftFromBrand(brand: { readonly profile: ContentProfile; readonly displayRules: ContentDisplayRules }): BrandDraft {
  return {
    brandName: brand.profile.brandName, tagline: brand.profile.tagline ?? '', hotline: brand.profile.hotline ?? '',
    website: brand.profile.website ?? '', fanpage: brand.profile.fanpage ?? '', address: brand.profile.address ?? '',
    displayRules: cloneRules(brand.displayRules),
  };
}

export function brandDraftBlocker(draft: BrandDraft): string | null {
  if (!draft.brandName.trim()) return 'Nhập tên thương hiệu.';
  for (const key of ['brandName', ...FACTS] as const) {
    const limit = LIMITS[key];
    if ([...draft[key].trim()].length > limit.max) return `${limit.label} tối đa ${limit.max} ký tự.`;
  }
  return null;
}

export function brandRequestFromDraft(draft: BrandDraft): BrandRequest {
  const profile: Record<string, string> = { brandName: draft.brandName.trim() };
  for (const key of FACTS) { const value = draft[key].trim(); if (value) profile[key] = value; }
  return { profile: profile as unknown as ContentProfile, displayRules: cloneRules(draft.displayRules) };
}

export function generatedBrandKey(uuid: string = crypto.randomUUID()): string {
  const compact = uuid.toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(compact)) throw new TypeError('A UUID is required to generate a brand key');
  return `brand-${compact}`;
}

export type ContentLoadFailure = 'connection' | 'integrity';
export class ContentDataSourceError extends Error {
  constructor(readonly kind: ContentLoadFailure, message: string) { super(message); }
}

export async function loadBrands(fetcher: typeof fetch = fetch): Promise<ContentBrandSummary[]> {
  const value = await readJson('/api/content/brands', fetcher);
  if (value === null || !record(value) || !exactKeys(value, ['brands', 'contractVersion']) || value.contractVersion !== '1.0.0' || !Array.isArray(value.brands) || !value.brands.every(summary)) invalid();
  return (value.brands as ContentBrandSummary[]).map((item) => ({ ...item }));
}

export async function loadBrand(brandId: string, fetcher: typeof fetch = fetch): Promise<BrandDetail | null> {
  const value = await readJson(`/api/content/brands/${encodeURIComponent(brandId)}`, fetcher);
  if (value === null) return null;
  if (!record(value) || !exactKeys(value, ['brand', 'contractVersion', 'history']) || value.contractVersion !== '1.0.0') invalid();
  const brand = value.brand as Record<string, unknown>;
  if (!record(brand) || !exactKeys(brand, ['brandId', 'brandKey', 'createdAt', 'displayRules', 'profile', 'version']) || brand.brandId !== brandId || typeof brand.brandKey !== 'string' || !version(brand.version) || !dateTime(brand.createdAt) || !profile(brand.profile) || !displayRules(brand.displayRules)) invalid();
  const history = value.history as unknown[];
  if (!Array.isArray(history) || history.length !== brand.version || !history.every((item, index) => record(item) && exactKeys(item, ['brandName', 'createdAt', 'version']) && item.version === index + 1 && typeof item.brandName === 'string' && dateTime(item.createdAt))) invalid();
  return value as unknown as BrandDetail;
}

export async function submitBrandCreate(input: BrandRequest & { readonly brandKey: string; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentBrandReceipt> {
  return ownerSubmit('/owner-api/content/brands', input.token, { contractVersion: '1.0.0', brandKey: input.brandKey, profile: input.profile, displayRules: input.displayRules }, fetcher);
}

export async function submitBrandRevision(input: BrandRequest & { readonly brandId: string; readonly expectedVersion: number; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentBrandReceipt> {
  return ownerSubmit(`/owner-api/content/brands/${encodeURIComponent(input.brandId)}/revisions`, input.token, { contractVersion: '1.0.0', expectedVersion: input.expectedVersion, profile: input.profile, displayRules: input.displayRules }, fetcher);
}

export interface DemoBrand {
  readonly brandId: string;
  readonly brandKey: string;
  readonly version: number;
  readonly profile: ContentProfile;
  readonly displayRules: ContentDisplayRules;
  readonly createdAt: string;
  readonly history: readonly { readonly version: number; readonly brandName: string; readonly createdAt: string }[];
}

export function createDemoBrand(brands: readonly DemoBrand[], draft: BrandDraft, brandId: string, now: string): DemoBrand[] {
  const request = brandRequestFromDraft(draft);
  return [...brands, { brandId, brandKey: generatedBrandKey(brandId), version: 1, ...request, createdAt: now, history: [{ version: 1, brandName: request.profile.brandName, createdAt: now }] }];
}

export function reviseDemoBrand(brands: readonly DemoBrand[], brandId: string, expectedVersion: number, draft: BrandDraft, now: string): DemoBrand[] {
  return brands.map((brand) => {
    if (brand.brandId !== brandId) return brand;
    if (brand.version !== expectedVersion) throw new Error('Demo brand revision conflict');
    const request = brandRequestFromDraft(draft);
    const version = brand.version + 1;
    return { ...brand, ...request, version, createdAt: now, history: [...brand.history, { version, brandName: request.profile.brandName, createdAt: now }] };
  });
}

async function readJson(url: string, fetcher: typeof fetch): Promise<unknown | null> {
  let response: Response;
  try { response = await fetcher(url, { headers: { Accept: 'application/json' } }); }
  catch { throw new ContentDataSourceError('connection', 'Không thể kết nối API nội dung.'); }
  if (response.status === 404) return null;
  if (!response.ok) throw new ContentDataSourceError('integrity', 'API nội dung không trả về dữ liệu hợp lệ.');
  try { return await response.json(); } catch { invalid(); }
}

async function ownerSubmit(url: string, token: string, body: unknown, fetcher: typeof fetch): Promise<OwnerContentBrandReceipt> {
  let response: Response;
  try { response = await fetcher(url, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }); }
  catch { throw new OwnerWriteError('connection', 'Không thể kết nối OWNER API cục bộ.'); }
  if (!response.ok) {
    const kind: OwnerWriteFailure = response.status === 401 ? 'unauthorized' : response.status === 403 ? 'forbidden' : response.status === 409 ? 'conflict' : response.status === 404 ? 'not_found' : response.status >= 500 ? 'integrity' : 'invalid';
    throw new OwnerWriteError(kind, kind === 'conflict' ? 'Thương hiệu đã thay đổi. Hãy tải lại trước khi lưu.' : 'OWNER API từ chối yêu cầu thương hiệu.');
  }
  let value: unknown;
  try { value = await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
  if (!record(value) || !exactKeys(value, ['brandId', 'brandKey', 'brandName', 'contractVersion', 'createdAt', 'exactRetry', 'version']) || value.contractVersion !== '1.0.0' || !uuid(value.brandId) || typeof value.brandKey !== 'string' || typeof value.brandName !== 'string' || !version(value.version) || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentBrandReceipt;
}

function summary(value: unknown): boolean {
  return record(value) && exactKeys(value, ['brandId', 'brandKey', 'brandName', 'updatedAt', 'version']) && uuid(value.brandId) && typeof value.brandKey === 'string' && typeof value.brandName === 'string' && version(value.version) && dateTime(value.updatedAt);
}
function profile(value: unknown): boolean {
  if (!record(value) || typeof value.brandName !== 'string') return false;
  return Object.entries(value).every(([key, item]) => (key === 'brandName' || (FACTS as readonly string[]).includes(key)) && typeof item === 'string');
}
function displayRules(value: unknown): boolean {
  return record(value) && exactKeys(value, BRAND_PURPOSES.map((purpose) => purpose.key)) && BRAND_PURPOSES.every(({ key }) => {
    const rules = value[key];
    return record(rules) && exactKeys(rules, BRAND_ELEMENTS.map((element) => element.key)) && Object.values(rules).every((item) => VISIBILITY_OPTIONS.some((option) => option.key === item));
  });
}
function cloneRules(rules: ContentDisplayRules): ContentDisplayRules {
  return Object.fromEntries(BRAND_PURPOSES.map(({ key }) => [key, { ...rules[key] }])) as unknown as ContentDisplayRules;
}
function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function uuid(value: unknown): value is string { return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function version(value: unknown): value is number { return Number.isSafeInteger(value) && Number(value) >= 1; }
function dateTime(value: unknown): value is string { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)); }
function invalid(): never { throw new ContentDataSourceError('integrity', 'API nội dung không trả về dữ liệu hợp lệ.'); }
