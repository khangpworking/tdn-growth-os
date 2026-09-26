import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeedState } from '../src/model';
import { ContentDataSourceError } from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';
import {
  brandCounts,
  campaignDraftBlocker,
  campaignRequestFromDraft,
  changeDemoCampaignLifecycle,
  createDemoCampaign,
  draftFromCampaign,
  emptyCampaignDraft,
  generatedCampaignKey,
  itemLabel,
  loadCampaign,
  loadCampaigns,
  reviseDemoCampaign,
  submitCampaignCreate,
  submitCampaignLifecycle,
  submitCampaignRevision,
} from '../src/campaign-data-source';
import { parseRoute, routeToHash } from '../src/routing';

const brandId = '66666666-6666-4666-8666-000000000001';
const otherBrandId = '66666666-6666-4666-8666-000000000002';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const itemId = '66666666-6666-4666-8666-0000000000a1';
const otherItemId = '66666666-6666-4666-8666-0000000000a2';
const workspaceId = '66666666-6666-4666-8666-0000000000d1';
const time = '2027-01-01T00:00:00.000Z';
const deletedAt = '2027-01-02T00:00:00.000Z';
const restorableUntil = '2027-01-31T00:00:00.000Z';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const campaign = {
  name: 'Chiến dịch Tết',
  objective: 'Tăng số cuộc tư vấn trong tháng một.',
  items: [
    { itemId, itemVersion: 2, tierKeys: ['plus', 'pro'] },
    { itemId: otherItemId, itemVersion: 1 },
  ],
  researchProductWorkspaceId: workspaceId,
};
const summary = {
  campaignId,
  campaignKey: 'campaign-abc',
  brandId,
  version: 2,
  name: campaign.name,
  items: [{ itemId, itemVersion: 2, name: 'Tư vấn', tierNames: ['Plus', 'Pro'] }],
  updatedAt: time,
  deleted: { deletedAt, restorableUntil },
};
const detail = {
  contractVersion: '1.0.0',
  campaign: { campaignId, campaignKey: 'campaign-abc', brandId, version: 2, campaign, createdAt: time },
  items: [{ itemId, itemVersion: 2, itemKey: 'tu-van', itemType: 'SERVICE', name: 'Tư vấn', tiers: [{ tierKey: 'plus', name: 'Plus' }, { tierKey: 'pro', name: 'Pro' }] }],
  history: [{ version: 1, name: 'Bản cũ', createdAt: time }, { version: 2, name: campaign.name, createdAt: time }],
  lifecycle: { sequence: 1, deleted: { deletedAt, restorableUntil } },
};

test('campaign routes parse and round-trip only the supported content paths', () => {
  const state = createSeedState();
  assert.deepEqual(parseRoute(routeToHash.content(), state), { kind: 'content' });
  assert.deepEqual(parseRoute(routeToHash.campaignNew(), state), { kind: 'campaign-new' });
  assert.deepEqual(parseRoute(routeToHash.campaign(campaignId), state), { kind: 'campaign', campaignId });
  assert.equal(parseRoute('#/content/abc', state).kind, 'invalid');
  assert.equal(parseRoute(`#/content/${campaignId}/x`, state).kind, 'invalid');
  assert.equal(routeToHash.content(), '#/content');
  assert.equal(routeToHash.campaignNew(), '#/content/new');
  assert.equal(routeToHash.campaign(campaignId), `#/content/${campaignId}`);
});

test('campaign reads accept valid Task 4 payloads and reject unexpected shapes', async () => {
  const list = await loadCampaigns(async () => json(200, { contractVersion: '1.0.0', campaigns: [summary] }));
  assert.equal(list.campaigns[0]!.deleted?.restorableUntil, restorableUntil);
  assert.equal((await loadCampaign(campaignId, async () => json(200, detail)))!.campaign.campaign.name, campaign.name);
  assert.equal(await loadCampaign(campaignId, async () => json(404, { error: { code: 'not_found', message: 'x' } })), null);

  const invalidCases: unknown[] = [
    { contractVersion: '1.0.0', campaigns: [{ ...summary, extra: true }] },
    { contractVersion: '1.0.0', campaigns: [{ ...summary, name: undefined }] },
    { contractVersion: '1.0.0', campaigns: [{ ...summary, campaignId: 'not-a-uuid' }] },
    { contractVersion: '1.0.0', campaigns: [{ ...summary, items: [{ ...summary.items[0]!, tierNames: 'Plus' }] }] },
  ];
  for (const value of invalidCases) {
    await assert.rejects(loadCampaigns(async () => json(200, value)), (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
  }

  await assert.rejects(loadCampaign(campaignId, async () => json(200, { ...detail, campaign: { ...detail.campaign, campaign: { ...campaign, name: undefined } } })),
    (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
});

test('campaign draft blockers return the specified messages in order', () => {
  const valid = { ...emptyCampaignDraft(brandId), name: 'Tên', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 1, tierKeys: [] }] };
  assert.equal(campaignDraftBlocker(emptyCampaignDraft()), 'Chọn thương hiệu.');
  assert.equal(campaignDraftBlocker({ ...valid, name: ' ' }), 'Nhập tên chiến dịch.');
  assert.equal(campaignDraftBlocker({ ...valid, name: 'x'.repeat(121) }), 'Tên chiến dịch tối đa 120 ký tự.');
  assert.equal(campaignDraftBlocker({ ...valid, objective: ' ' }), 'Nhập mục tiêu chiến dịch.');
  assert.equal(campaignDraftBlocker({ ...valid, objective: 'x'.repeat(1001) }), 'Mục tiêu tối đa 1000 ký tự.');
  assert.equal(campaignDraftBlocker({ ...valid, items: [] }), 'Chọn ít nhất một sản phẩm.');
  assert.equal(campaignDraftBlocker({ ...valid, items: Array.from({ length: 13 }, () => ({ itemId, itemVersion: 1, tierKeys: [] })) }), 'Tối đa 12 sản phẩm trong một chiến dịch.');
  assert.equal(campaignDraftBlocker({ ...valid, items: [{ itemId, itemVersion: 1, tierKeys: Array.from({ length: 9 }, (_, index) => `tier-${index}`) }] }), 'Mỗi sản phẩm chọn tối đa 8 gói.');
  assert.equal(campaignDraftBlocker(valid), null);
});

test('campaign drafts become trimmed requests while preserving item order and omissions', () => {
  const draft = {
    ...emptyCampaignDraft(brandId),
    name: ' Chiến dịch Tết ',
    objective: ' Tăng tư vấn ',
    items: [{ itemId, itemVersion: 2, tierKeys: [] }, { itemId: otherItemId, itemVersion: 1, tierKeys: ['pro'] }],
    researchProductWorkspaceId: ' ',
  };
  assert.deepEqual(campaignRequestFromDraft(draft), {
    name: 'Chiến dịch Tết',
    objective: 'Tăng tư vấn',
    items: [{ itemId, itemVersion: 2 }, { itemId: otherItemId, itemVersion: 1, tierKeys: ['pro'] }],
  });
  assert.deepEqual(draftFromCampaign(detail as never), { brandId, name: campaign.name, objective: campaign.objective, items: [{ ...campaign.items[0] }, { itemId: otherItemId, itemVersion: 1, tierKeys: [] }], researchProductWorkspaceId: workspaceId });
  assert.equal(generatedCampaignKey('ABC-123'), 'campaign-abc-123');
});

test('OWNER campaign submissions post exact bodies and map failures', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const receipt = { contractVersion: '1.0.0', campaignId, campaignKey: 'campaign-abc', brandId, version: 1, name: campaign.name, createdAt: time, exactRetry: false };
  const fetcher = (answer: unknown, status = 201) => async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return json(status, answer); };
  await submitCampaignCreate({ campaignKey: 'campaign-abc', brandId, campaign: campaign as never, token: 't' }, fetcher(receipt));
  assert.equal(calls[0]!.url, '/owner-api/content/campaigns');
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { contractVersion: '1.0.0', campaignKey: 'campaign-abc', brandId, campaign });
  await submitCampaignRevision({ campaignId, expectedVersion: 1, campaign: campaign as never, token: 't' }, fetcher({ ...receipt, version: 2 }));
  assert.equal(calls[1]!.url, `/owner-api/content/campaigns/${campaignId}/revisions`);
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { contractVersion: '1.0.0', expectedVersion: 1, campaign });
  const lifecycleReceipt = { contractVersion: '1.0.0', campaignId, sequence: 1, action: 'DELETE', createdAt: time, restorableUntil, exactRetry: false };
  await submitCampaignLifecycle({ campaignId, action: 'DELETE', expectedSequence: 0, token: 't' }, fetcher(lifecycleReceipt));
  assert.equal(calls[2]!.url, `/owner-api/content/campaigns/${campaignId}/lifecycle`);
  assert.deepEqual(JSON.parse(String(calls[2]!.init.body)), { contractVersion: '1.0.0', action: 'DELETE', expectedSequence: 0 });
  assert.equal((calls[0]!.init.headers as Record<string, string>).Authorization, 'Bearer t');
  await assert.rejects(submitCampaignLifecycle({ campaignId, action: 'RESTORE', expectedSequence: 1, token: 't' }, fetcher({ error: { code: 'conflict', message: 'x' } }, 409)),
    (error: unknown) => error instanceof OwnerWriteError && error.kind === 'conflict');
  await assert.rejects(submitCampaignCreate({ campaignKey: 'campaign-abc', brandId, campaign: campaign as never, token: 't' }, fetcher({ ...receipt, brandId: otherBrandId })),
    (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('campaign display helpers count active campaigns and label selected tiers', () => {
  const brands = [
    { brandId, brandKey: 'brand-a', version: 1, brandName: 'A', updatedAt: time },
    { brandId: otherBrandId, brandKey: 'brand-b', version: 1, brandName: 'B', updatedAt: time },
  ];
  const campaigns = [summary, { ...summary, campaignId: otherItemId, brandId: otherBrandId, deleted: undefined }, { ...summary, campaignId: itemId, deleted: undefined }];
  assert.deepEqual(brandCounts(campaigns as never, brands), [
    { brandId: null, label: 'Tất cả', count: 2 },
    { brandId, label: 'A', count: 1 },
    { brandId: otherBrandId, label: 'B', count: 1 },
  ]);
  assert.equal(itemLabel({ ...summary.items[0]! }), 'Tư vấn (Plus, Pro)');
  assert.equal(itemLabel({ ...summary.items[0]!, tierNames: [] }), 'Tư vấn');
});

test('demo campaigns are versioned, deleted and restored in memory only', () => {
  const draft = { ...emptyCampaignDraft(brandId), name: 'Demo', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 1, tierKeys: [] }] };
  const created = createDemoCampaign([], brandId, draft, campaignId, time);
  assert.deepEqual([created.length, created[0]!.versions[0]!.version, created[0]!.brandId], [1, 1, brandId]);
  const revised = reviseDemoCampaign(created, campaignId, 1, { ...draft, name: 'Demo 2' }, time);
  assert.deepEqual([revised[0]!.versions.length, revised[0]!.versions[1]!.version], [2, 2]);
  const deleted = changeDemoCampaignLifecycle(revised, campaignId, 'DELETE', time);
  assert.equal(deleted[0]!.lifecycle.deleted?.restorableUntil, '2027-01-31T00:00:00.000Z');
  assert.equal(changeDemoCampaignLifecycle(deleted, campaignId, 'RESTORE', time)[0]!.lifecycle.deleted, undefined);
  assert.throws(() => reviseDemoCampaign(deleted, campaignId, 2, draft, time), /deleted/);
  assert.throws(() => changeDemoCampaignLifecycle(deleted, campaignId, 'RESTORE', '2027-02-02T00:00:00.000Z'), /30 ngày/);
});
