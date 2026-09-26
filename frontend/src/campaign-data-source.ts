import type {
  ContentBrandSummary,
  ContentCampaignDetailResponse,
  ContentCampaignHistoryItem,
  ContentCampaignItemSummary,
  ContentCampaignListResponse,
  ContentCampaignSummary,
} from '../../contracts/api/content-api.generated';
import type {
  ContentCampaignContent,
  OwnerContentCampaignLifecycleReceipt,
  OwnerContentCampaignReceipt,
} from '../../contracts/api/owner-content-campaign-api.generated';
import { dateTime, exactKeys, invalid, readJson, record, uuid, version as positiveVersion } from './content-data-source';
import { OwnerWriteError, type OwnerWriteFailure } from './data-source';
import { createDraftEditorReducer, type DraftEditor, type DraftEditorEvent } from './draft-editor';
import { RESTORE_DAYS } from './prompt-data-source';

export type CampaignList = ContentCampaignListResponse;
export type CampaignDetail = ContentCampaignDetailResponse;

export interface CampaignDraftItem {
  readonly itemId: string;
  readonly itemVersion: number;
  readonly tierKeys: readonly string[];
}

export interface CampaignDraft {
  readonly brandId: string;
  readonly name: string;
  readonly objective: string;
  readonly items: readonly CampaignDraftItem[];
  readonly researchProductWorkspaceId: string;
}

export interface CampaignBase {
  readonly campaignId: string;
  readonly version: number;
  readonly draft: CampaignDraft;
  readonly history: readonly ContentCampaignHistoryItem[];
}

export type CampaignEditor = DraftEditor<CampaignDraft, CampaignBase>;
export type CampaignEditorEvent = DraftEditorEvent<CampaignDraft, CampaignBase>;

export const emptyCampaignDraft = (brandId = ''): CampaignDraft => ({ brandId, name: '', objective: '', items: [], researchProductWorkspaceId: '' });

export function draftFromCampaign(detail: CampaignDetail): CampaignDraft {
  const content = detail.campaign.campaign;
  return {
    brandId: detail.campaign.brandId,
    name: content.name,
    objective: content.objective,
    items: content.items.map((item) => ({ itemId: item.itemId, itemVersion: item.itemVersion, tierKeys: item.tierKeys ? [...item.tierKeys] : [] })),
    researchProductWorkspaceId: content.researchProductWorkspaceId ?? '',
  };
}

const chars = (value: string): number => [...value.trim()].length;

export function campaignDraftBlocker(draft: CampaignDraft): string | null {
  if (!draft.brandId.trim()) return 'Chọn thương hiệu.';
  if (!draft.name.trim()) return 'Nhập tên chiến dịch.';
  if (chars(draft.name) > 120) return 'Tên chiến dịch tối đa 120 ký tự.';
  if (!draft.objective.trim()) return 'Nhập mục tiêu chiến dịch.';
  if (chars(draft.objective) > 1000) return 'Mục tiêu tối đa 1000 ký tự.';
  if (draft.items.length === 0) return 'Chọn ít nhất một sản phẩm.';
  if (draft.items.length > 12) return 'Tối đa 12 sản phẩm trong một chiến dịch.';
  if (draft.items.some((item) => item.tierKeys.length > 8)) return 'Mỗi sản phẩm chọn tối đa 8 gói.';
  return null;
}

export function campaignRequestFromDraft(draft: CampaignDraft): ContentCampaignContent {
  const researchProductWorkspaceId = draft.researchProductWorkspaceId.trim();
  return {
    name: draft.name.trim(),
    objective: draft.objective.trim(),
    items: draft.items.map((item) => ({ itemId: item.itemId, itemVersion: item.itemVersion, ...(item.tierKeys.length > 0 ? { tierKeys: [...item.tierKeys] } : {}) })) as ContentCampaignContent['items'],
    ...(researchProductWorkspaceId ? { researchProductWorkspaceId } : {}),
  };
}

export function sameCampaignContent(left: CampaignDraft, right: CampaignDraft): boolean {
  return JSON.stringify(campaignRequestFromDraft(left)) === JSON.stringify(campaignRequestFromDraft(right));
}

export function campaignDifferences(draft: CampaignDraft, saved: CampaignDraft): string[] {
  const left = campaignRequestFromDraft(draft);
  const right = campaignRequestFromDraft(saved);
  const labels: [keyof ContentCampaignContent, string][] = [
    ['name', 'Tên'],
    ['objective', 'Mục tiêu'],
    ['items', 'Sản phẩm'],
    ['researchProductWorkspaceId', 'Liên kết sản phẩm nghiên cứu'],
  ];
  return labels.filter(([key]) => JSON.stringify(left[key]) !== JSON.stringify(right[key])).map(([, label]) => label);
}

export const campaignEditorReducer = createDraftEditorReducer<CampaignDraft, CampaignBase>({
  idOf: (base) => base.campaignId,
  empty: () => emptyCampaignDraft(),
  same: sameCampaignContent,
  differences: campaignDifferences,
});

export function generatedCampaignKey(id: string = crypto.randomUUID()): string {
  return `campaign-${id.toLowerCase()}`;
}

function deletion(value: unknown): boolean {
  return record(value) && exactKeys(value, ['deletedAt', 'restorableUntil']) && dateTime(value.deletedAt) && dateTime(value.restorableUntil);
}

function campaignItemSummary(value: unknown): boolean {
  return record(value) && exactKeys(value, ['itemId', 'itemVersion', 'name', 'tierNames']) && uuid(value.itemId) && positiveVersion(value.itemVersion)
    && typeof value.name === 'string' && Array.isArray(value.tierNames) && value.tierNames.every((tierName) => typeof tierName === 'string');
}

function campaignSummary(value: unknown): boolean {
  return record(value) && exactKeys(value, ['brandId', 'campaignId', 'campaignKey', 'items', 'name', 'updatedAt', 'version', ...('deleted' in value ? ['deleted'] : [])])
    && uuid(value.campaignId) && uuid(value.brandId) && typeof value.campaignKey === 'string' && positiveVersion(value.version) && typeof value.name === 'string'
    && dateTime(value.updatedAt) && Array.isArray(value.items) && value.items.every(campaignItemSummary) && (!('deleted' in value) || deletion(value.deleted));
}

function campaignItemRef(value: unknown): boolean {
  if (!record(value) || !exactKeys(value, ['itemId', 'itemVersion', ...('tierKeys' in value ? ['tierKeys'] : [])]) || !uuid(value.itemId) || !positiveVersion(value.itemVersion)) return false;
  if (!('tierKeys' in value)) return true;
  if (!Array.isArray(value.tierKeys) || value.tierKeys.length < 1 || value.tierKeys.length > 8 || !value.tierKeys.every((key) => typeof key === 'string')) return false;
  return new Set(value.tierKeys).size === value.tierKeys.length;
}

function campaignContent(value: unknown): value is ContentCampaignContent {
  if (!record(value) || !exactKeys(value, ['items', 'name', 'objective', ...('researchProductWorkspaceId' in value ? ['researchProductWorkspaceId'] : [])])
    || typeof value.name !== 'string' || typeof value.objective !== 'string' || value.name.trim() !== value.name || value.objective.trim() !== value.objective
    || value.name.length < 1 || value.name.length > 120 || value.objective.length < 1 || value.objective.length > 1000 || !Array.isArray(value.items)
    || value.items.length < 1 || value.items.length > 12 || !value.items.every(campaignItemRef)) return false;
  return !('researchProductWorkspaceId' in value) || uuid(value.researchProductWorkspaceId);
}

function campaignItemView(value: unknown): boolean {
  return record(value) && exactKeys(value, ['itemId', 'itemKey', 'itemType', 'itemVersion', 'name', 'tiers']) && uuid(value.itemId) && positiveVersion(value.itemVersion)
    && typeof value.itemKey === 'string' && (value.itemType === 'PHYSICAL' || value.itemType === 'SERVICE') && typeof value.name === 'string'
    && Array.isArray(value.tiers) && value.tiers.every((tier) => record(tier) && exactKeys(tier, ['name', 'tierKey']) && typeof tier.tierKey === 'string' && typeof tier.name === 'string');
}

function campaignHistory(value: unknown, version: number): value is ContentCampaignHistoryItem[] {
  return Array.isArray(value) && value.length === version && value.every((entry, index) => record(entry) && exactKeys(entry, ['createdAt', 'name', 'version'])
    && entry.version === index + 1 && typeof entry.name === 'string' && dateTime(entry.createdAt));
}

function lifecycle(value: unknown): boolean {
  return record(value) && exactKeys(value, ['sequence', ...('deleted' in value ? ['deleted'] : [])]) && Number.isSafeInteger(value.sequence) && Number(value.sequence) >= 0
    && (!('deleted' in value) || deletion(value.deleted));
}

export async function loadCampaigns(fetcher: typeof fetch = fetch): Promise<CampaignList> {
  const value = await readJson('/api/content/campaigns', fetcher);
  if (value === null || !record(value) || !exactKeys(value, ['campaigns', 'contractVersion']) || value.contractVersion !== '1.0.0'
    || !Array.isArray(value.campaigns) || !value.campaigns.every(campaignSummary)) invalid();
  return value as unknown as CampaignList;
}

export async function loadCampaign(id: string, fetcher: typeof fetch = fetch): Promise<CampaignDetail | null> {
  const value = await readJson(`/api/content/campaigns/${encodeURIComponent(id)}`, fetcher);
  if (value === null) return null;
  if (!record(value) || !exactKeys(value, ['campaign', 'contractVersion', 'history', 'items', 'lifecycle']) || value.contractVersion !== '1.0.0') invalid();
  const campaignRecord = value.campaign;
  if (!record(campaignRecord) || !exactKeys(campaignRecord, ['brandId', 'campaign', 'campaignId', 'campaignKey', 'createdAt', 'version'])
    || campaignRecord.campaignId !== id || !uuid(campaignRecord.campaignId) || !uuid(campaignRecord.brandId) || typeof campaignRecord.campaignKey !== 'string'
    || !positiveVersion(campaignRecord.version) || !dateTime(campaignRecord.createdAt) || !campaignContent(campaignRecord.campaign)) invalid();
  if (!Array.isArray(value.items) || !value.items.every(campaignItemView) || !campaignHistory(value.history, campaignRecord.version) || !lifecycle(value.lifecycle)) invalid();
  return value as unknown as CampaignDetail;
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
    throw new OwnerWriteError(kind, kind === 'conflict' ? conflictMessage
      : kind === 'invalid' ? 'OWNER API từ chối chiến dịch: kiểm tra thương hiệu, sản phẩm và nội dung.'
      : kind === 'integrity' ? 'Dữ liệu đã lưu không vượt qua kiểm tra toàn vẹn; không có gì được ghi.'
      : 'OWNER API từ chối yêu cầu.');
  }
  try { return await response.json(); } catch { throw new OwnerWriteError('integrity', 'OWNER API trả về JSON không hợp lệ.'); }
}

function campaignReceipt(value: unknown, brandId?: string, campaignId?: string, campaignKey?: string): OwnerContentCampaignReceipt {
  if (!record(value) || !exactKeys(value, ['brandId', 'campaignId', 'campaignKey', 'contractVersion', 'createdAt', 'exactRetry', 'name', 'version'])
    || value.contractVersion !== '1.0.0' || !uuid(value.campaignId) || (campaignId !== undefined && value.campaignId !== campaignId) || typeof value.campaignKey !== 'string'
    || (campaignKey !== undefined && value.campaignKey !== campaignKey) || !uuid(value.brandId) || (brandId !== undefined && value.brandId !== brandId)
    || !positiveVersion(value.version) || typeof value.name !== 'string' || !dateTime(value.createdAt) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentCampaignReceipt;
}

export async function submitCampaignCreate(input: { readonly campaignKey: string; readonly brandId: string; readonly campaign: ContentCampaignContent; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentCampaignReceipt> {
  const body = { contractVersion: '1.0.0', campaignKey: input.campaignKey, brandId: input.brandId, campaign: input.campaign };
  return campaignReceipt(await ownerJson('/owner-api/content/campaigns', input.token, body, fetcher, 'Chiến dịch đã thay đổi. Hãy tải lại trước khi lưu.'), input.brandId, undefined, input.campaignKey);
}

export async function submitCampaignRevision(input: { readonly campaignId: string; readonly expectedVersion: number; readonly campaign: ContentCampaignContent; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentCampaignReceipt> {
  const value = await ownerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/revisions`, input.token,
    { contractVersion: '1.0.0', expectedVersion: input.expectedVersion, campaign: input.campaign }, fetcher, 'Chiến dịch đã thay đổi ở nơi khác hoặc đã bị xóa. Hãy tải lại trước khi lưu.');
  return campaignReceipt(value, undefined, input.campaignId);
}

export async function submitCampaignLifecycle(input: { readonly campaignId: string; readonly action: 'DELETE' | 'RESTORE'; readonly expectedSequence: number; readonly token: string }, fetcher: typeof fetch = fetch): Promise<OwnerContentCampaignLifecycleReceipt> {
  const value = await ownerJson(`/owner-api/content/campaigns/${encodeURIComponent(input.campaignId)}/lifecycle`, input.token,
    { contractVersion: '1.0.0', action: input.action, expectedSequence: input.expectedSequence }, fetcher,
    input.action === 'RESTORE' ? 'Không thể khôi phục: chiến dịch đã thay đổi hoặc đã quá 30 ngày.' : 'Chiến dịch đã thay đổi. Hãy tải lại.');
  if (!record(value) || !exactKeys(value, ['action', 'campaignId', 'contractVersion', 'createdAt', 'exactRetry', 'sequence', ...('restorableUntil' in value ? ['restorableUntil'] : [])])
    || value.contractVersion !== '1.0.0' || value.campaignId !== input.campaignId || value.action !== input.action || !positiveVersion(value.sequence)
    || !dateTime(value.createdAt) || ('restorableUntil' in value && !dateTime(value.restorableUntil)) || typeof value.exactRetry !== 'boolean') {
    throw new OwnerWriteError('integrity', 'OWNER API trả về biên nhận không hợp lệ.');
  }
  return value as unknown as OwnerContentCampaignLifecycleReceipt;
}

export function itemLabel(item: { readonly name: string; readonly tierNames: readonly string[] }): string {
  return item.tierNames.length > 0 ? `${item.name} (${item.tierNames.join(', ')})` : item.name;
}

type CampaignBrandSource = Pick<ContentBrandSummary, 'brandId'> & ({ readonly brandName: string } | { readonly profile: { readonly brandName: string } });

export function brandCounts(campaigns: readonly ContentCampaignSummary[], brands: readonly CampaignBrandSource[]): { readonly brandId: string | null; readonly label: string; readonly count: number }[] {
  const active = campaigns.filter((campaign) => campaign.deleted === undefined);
  return [
    { brandId: null, label: 'Tất cả', count: active.length },
    ...brands.map((brand) => ({ brandId: brand.brandId, label: 'brandName' in brand ? brand.brandName : brand.profile.brandName, count: active.filter((campaign) => campaign.brandId === brand.brandId).length })),
  ];
}

export interface DemoCampaignVersion {
  readonly version: number;
  readonly campaign: ContentCampaignContent;
  readonly createdAt: string;
}

export interface DemoCampaign {
  readonly campaignId: string;
  readonly campaignKey: string;
  readonly brandId: string;
  readonly versions: readonly DemoCampaignVersion[];
  readonly lifecycle: { readonly sequence: number; readonly deleted?: { readonly at: string; readonly restorableUntil: string } };
}

export function createDemoCampaign(campaigns: readonly DemoCampaign[], brandId: string, draft: CampaignDraft, campaignId: string, now: string): DemoCampaign[] {
  return [...campaigns, { campaignId, campaignKey: generatedCampaignKey(campaignId), brandId, versions: [{ version: 1, campaign: campaignRequestFromDraft(draft), createdAt: now }], lifecycle: { sequence: 0 } }];
}

export function reviseDemoCampaign(campaigns: readonly DemoCampaign[], campaignId: string, expectedVersion: number, draft: CampaignDraft, now: string): DemoCampaign[] {
  return campaigns.map((entry) => {
    if (entry.campaignId !== campaignId) return entry;
    if (entry.lifecycle.deleted) throw new Error('Demo campaign is deleted');
    const latest = entry.versions[entry.versions.length - 1];
    if (!latest || latest.version !== expectedVersion) throw new Error('Demo campaign revision conflict');
    return { ...entry, versions: [...entry.versions, { version: latest.version + 1, campaign: campaignRequestFromDraft(draft), createdAt: now }] };
  });
}

export function changeDemoCampaignLifecycle(campaigns: readonly DemoCampaign[], campaignId: string, action: 'DELETE' | 'RESTORE', now: string): DemoCampaign[] {
  return campaigns.map((entry) => {
    if (entry.campaignId !== campaignId) return entry;
    if (action === 'RESTORE' && entry.lifecycle.deleted && Date.parse(now) > Date.parse(entry.lifecycle.deleted.restorableUntil)) throw new Error('Không thể khôi phục sau 30 ngày.');
    return action === 'DELETE'
      ? { ...entry, lifecycle: { sequence: entry.lifecycle.sequence + 1, deleted: { at: now, restorableUntil: new Date(Date.parse(now) + RESTORE_DAYS * 86_400_000).toISOString() } } }
      : { ...entry, lifecycle: { sequence: entry.lifecycle.sequence + 1 } };
  });
}

interface CampaignCatalogItemSource {
  readonly itemId: string;
  readonly brandId?: string;
  readonly version: number;
  readonly itemKey?: string;
  readonly itemType?: 'PHYSICAL' | 'SERVICE';
  readonly name?: string;
  readonly tierNames?: readonly string[];
  readonly item?: { readonly itemType: 'PHYSICAL' | 'SERVICE'; readonly name: string; readonly tiers: readonly { readonly tierKey: string; readonly name: string }[] };
}

function catalogSource(items: readonly CampaignCatalogItemSource[], brandId: string, itemId: string): CampaignCatalogItemSource | undefined {
  return items.find((item) => item.itemId === itemId && (item.brandId === undefined || item.brandId === brandId));
}

function sourceTiers(source: CampaignCatalogItemSource | undefined): readonly { readonly tierKey: string; readonly name: string }[] {
  if (source?.item) return source.item.tiers;
  return (source?.tierNames ?? []).map((name, index) => ({ tierKey: `tier-${index + 1}`, name }));
}

function summaryItem(ref: ContentCampaignContent['items'][number], brandId: string, items: readonly CampaignCatalogItemSource[]): ContentCampaignItemSummary {
  const source = catalogSource(items, brandId, ref.itemId);
  const tiers = sourceTiers(source);
  const selected = ref.tierKeys ? tiers.filter((tier) => ref.tierKeys!.includes(tier.tierKey)) : tiers;
  return { itemId: ref.itemId, itemVersion: ref.itemVersion, name: source?.item?.name ?? source?.name ?? ref.itemId, tierNames: selected.map((tier) => tier.name) };
}

function detailItem(ref: ContentCampaignContent['items'][number], brandId: string, items: readonly CampaignCatalogItemSource[]) {
  const source = catalogSource(items, brandId, ref.itemId);
  const tiers = sourceTiers(source);
  const selected = ref.tierKeys ? tiers.filter((tier) => ref.tierKeys!.includes(tier.tierKey)) : tiers;
  return {
    itemId: ref.itemId,
    itemVersion: ref.itemVersion,
    itemKey: source?.itemKey ?? ref.itemId,
    itemType: source?.item?.itemType ?? source?.itemType ?? 'SERVICE',
    name: source?.item?.name ?? source?.name ?? ref.itemId,
    tiers: selected.map((tier) => ({ tierKey: tier.tierKey, name: tier.name })),
  };
}

function campaignListEntry(entry: DemoCampaign, items: readonly CampaignCatalogItemSource[]): ContentCampaignSummary {
  const latest = entry.versions[entry.versions.length - 1]!;
  const deleted = entry.lifecycle.deleted;
  return {
    campaignId: entry.campaignId,
    campaignKey: entry.campaignKey,
    brandId: entry.brandId,
    version: latest.version,
    name: latest.campaign.name,
    items: latest.campaign.items.map((item) => summaryItem(item, entry.brandId, items)),
    updatedAt: latest.createdAt,
    ...(deleted ? { deleted: { deletedAt: deleted.at, restorableUntil: deleted.restorableUntil } } : {}),
  };
}

export function demoCampaignList(campaigns: readonly DemoCampaign[], items: readonly CampaignCatalogItemSource[]): CampaignList {
  return { contractVersion: '1.0.0', campaigns: campaigns.map((entry) => campaignListEntry(entry, items)) };
}

function detailForDemoCampaign(entry: DemoCampaign, items: readonly CampaignCatalogItemSource[]): CampaignDetail {
  const latest = entry.versions[entry.versions.length - 1]!;
  return {
    contractVersion: '1.0.0',
    campaign: { campaignId: entry.campaignId, campaignKey: entry.campaignKey, brandId: entry.brandId, version: latest.version, campaign: latest.campaign, createdAt: latest.createdAt },
    items: latest.campaign.items.map((item) => detailItem(item, entry.brandId, items)),
    history: entry.versions.map((version) => ({ version: version.version, name: version.campaign.name, createdAt: version.createdAt })) as CampaignDetail['history'],
    lifecycle: { sequence: entry.lifecycle.sequence, ...(entry.lifecycle.deleted ? { deleted: { deletedAt: entry.lifecycle.deleted.at, restorableUntil: entry.lifecycle.deleted.restorableUntil } } : {}) },
  };
}

export function demoCampaignDetail(campaigns: readonly DemoCampaign[], campaignId: string, items: readonly CampaignCatalogItemSource[]): CampaignDetail | null {
  const entry = campaigns.find((candidate) => candidate.campaignId === campaignId);
  return entry ? detailForDemoCampaign(entry, items) : null;
}
