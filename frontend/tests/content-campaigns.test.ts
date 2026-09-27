import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { createSeedState } from '../src/model';
import { ContentDataSourceError } from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';
import {
  brandCounts,
  campaignDraftBlocker,
  campaignEditorReducer,
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
import { setupDom } from './dom';

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

const campaignBrands = [
  { brandId, brandKey: 'brand-a', version: 1, profile: { brandName: 'Canxi A' }, displayRules: {} as never, createdAt: time, history: [] },
  { brandId: otherBrandId, brandKey: 'brand-b', version: 1, profile: { brandName: 'Canxi B' }, displayRules: {} as never, createdAt: time, history: [] },
];
const campaignItems = [
  { itemId, brandId, itemKey: 'tu-van', version: 1, item: { itemType: 'SERVICE' as const, name: 'Tư vấn', tiers: [{ tierKey: 'plus', name: 'Plus' }, { tierKey: 'pro', name: 'Pro' }], photos: [] }, createdAt: time, history: [] },
  { itemId: otherItemId, brandId: otherBrandId, itemKey: 'goi-a', version: 1, item: { itemType: 'PHYSICAL' as const, name: 'Gói A', tiers: [], photos: [] }, createdAt: time, history: [] },
];

function pageProps(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    mode: 'demo', ownerToken: 'demo-token', writesAvailable: true, campaignId: null, creating: false,
    demoCampaigns: [], setDemoCampaigns: () => undefined, demoBrands: campaignBrands, demoItems: campaignItems,
    productWorkspaces: [{ id: workspaceId, name: 'Workspace nghiên cứu' }], navigate: () => undefined, notify: () => undefined,
    ...overrides,
  };
}

function editorWithDraft(draft: Parameters<typeof emptyCampaignDraft>[0] extends never ? never : ReturnType<typeof emptyCampaignDraft> & { name: string; objective: string; items: { itemId: string; itemVersion: number; tierKeys: string[] }[] }) {
  return campaignEditorReducer(campaignEditorReducer(null, { type: 'new', key: 'campaign-test', target: 'new' }), { type: 'edit', draft });
}

const mountedCampaignContent = { ...campaign, name: 'Campaign A', objective: 'Objective A' };
const mountedCampaignSummary = {
  campaignId,
  campaignKey: 'campaign-a',
  brandId,
  version: 1,
  name: mountedCampaignContent.name,
  items: [{ itemId, itemVersion: 2, name: 'Tư vấn', tierNames: ['Plus', 'Pro'] }],
  updatedAt: time,
};
const mountedBrands = { contractVersion: '1.0.0', brands: [{ brandId, brandKey: 'brand-a', version: 1, brandName: 'Canxi A', updatedAt: time }] };
const mountedCatalog = { contractVersion: '1.0.0', brandId, items: [] };

function mountedCampaignList() {
  return { contractVersion: '1.0.0', campaigns: [mountedCampaignSummary] };
}

function mountedCampaignDetail(lifecycle: unknown, content = mountedCampaignContent) {
  return {
    contractVersion: '1.0.0',
    campaign: { campaignId, campaignKey: 'campaign-a', brandId, version: 1, campaign: content, createdAt: time },
    items: [{ itemId, itemVersion: 2, itemKey: 'tu-van', itemType: 'SERVICE', name: 'Tư vấn', tiers: [{ tierKey: 'plus', name: 'Plus' }, { tierKey: 'pro', name: 'Pro' }] }],
    history: [{ version: 1, name: content.name, createdAt: time }],
    lifecycle,
  };
}

interface PendingCampaignRequest {
  readonly url: string;
  readonly method: string;
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
}

function deferredCampaignFetchQueue() {
  const pending: PendingCampaignRequest[] = [];
  const fetcher: typeof fetch = (input, init) => new Promise<Response>((resolve, reject) => {
    pending.push({ url: String(input), method: String(init?.method ?? 'GET').toUpperCase(), resolve, reject });
  });
  const find = (url: string, method?: string) => pending.findIndex((request) => request.url === url && (method === undefined || request.method === method.toUpperCase()));
  const resolve = (url: string, body: unknown, status = 200, method?: string) => {
    const index = find(url, method);
    assert.notEqual(index, -1, `No pending ${method ?? ''} request for ${url}; pending: ${pending.map((request) => `${request.method} ${request.url}`).join(', ')}`);
    const request = pending.splice(index, 1)[0]!;
    request.resolve(json(status, body));
  };
  return { pending, fetcher, resolve, has: (url: string, method?: string) => find(url, method) !== -1 };
}

type CampaignPageModule = typeof import('../src/CampaignsPage');

async function importCampaignsPage() {
  return (await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as CampaignPageModule).default;
}

async function flushAct() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settleCampaignRequest(queue: ReturnType<typeof deferredCampaignFetchQueue>, url: string, body: unknown, status = 200, method?: string) {
  await act(async () => {
    queue.resolve(url, body, status, method);
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface CampaignHarness {
  readonly container: HTMLElement;
  readonly queue: ReturnType<typeof deferredCampaignFetchQueue>;
  readonly navigateCalls: string[];
  readonly notifications: string[];
  readonly notice: HTMLElement;
  readonly render: (campaignId: string | null, creating: boolean) => Promise<void>;
  readonly remount: (campaignId: string | null, creating: boolean) => Promise<void>;
  readonly settle: (url: string, body: unknown, status?: number, method?: string) => Promise<void>;
  readonly cleanup: () => Promise<void>;
}

async function mountCampaignPage(CampaignsPage: CampaignPageModule['default'], initialCampaignId: string | null): Promise<CampaignHarness> {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const queue = deferredCampaignFetchQueue();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = queue.fetcher;
  const navigateCalls: string[] = [];
  const notifications: string[] = [];
  const notice = dom.container.ownerDocument.createElement('div');
  notice.setAttribute('role', 'status');
  dom.container.append(notice);
  let root = createRoot(dom.container);
  const render = async (campaignId: string | null, creating: boolean) => {
    await act(async () => {
      root.render(createElement(CampaignsPage, {
        mode: 'real', campaignId, creating, ownerToken: 'token', writesAvailable: true,
        demoCampaigns: [], setDemoCampaigns: () => undefined, demoBrands: [], demoItems: [], productWorkspaces: [],
        navigate: (hash: string) => navigateCalls.push(hash),
        notify: (message: string) => { notifications.push(message); notice.textContent = message; },
      }));
      await Promise.resolve();
    });
  };
  const remount = async (campaignId: string | null, creating: boolean) => {
    await act(async () => { root.unmount(); });
    root = createRoot(dom.container);
    await render(campaignId, creating);
  };
  await render(initialCampaignId, false);
  return {
    container: dom.container,
    queue,
    navigateCalls,
    notifications,
    notice,
    render,
    remount,
    settle: (url, body, status, method) => settleCampaignRequest(queue, url, body, status, method),
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      globalThis.fetch = originalFetch;
      dom.cleanup();
    },
  };
}

async function settleCampaignReads(harness: CampaignHarness, detailBody: unknown, listBody: unknown = mountedCampaignList()) {
  for (let round = 0; round < 6; round += 1) {
    await flushAct();
    let settled = false;
    if (harness.queue.has('/api/content/brands')) { await harness.settle('/api/content/brands', mountedBrands); settled = true; }
    if (harness.queue.has('/api/content/campaigns')) { await harness.settle('/api/content/campaigns', listBody); settled = true; }
    if (harness.queue.has(`/api/content/campaigns/${campaignId}`)) { await harness.settle(`/api/content/campaigns/${campaignId}`, detailBody); settled = true; }
    if (harness.queue.has(`/api/content/brands/${brandId}/catalog`)) { await harness.settle(`/api/content/brands/${brandId}/catalog`, mountedCatalog); settled = true; }
    if (!settled) break;
  }
  await flushAct();
}

function campaignButtonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(text));
  assert.ok(button, `Expected a button containing ${text}`);
  return button as HTMLButtonElement;
}

function campaignForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form.campaign-form');
  assert.ok(form, 'Expected the campaign form to be mounted');
  return form as HTMLFormElement;
}

async function setCampaignName(form: HTMLFormElement, value: string) {
  const input = form.querySelector('input') as HTMLInputElement | null;
  assert.ok(input, 'Expected the campaign name input');
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(input.value, value);
}

async function clickCampaignEdit(harness: CampaignHarness) {
  await act(async () => {
    campaignButtonWithText(harness.container, 'Sửa').click();
    await Promise.resolve();
  });
  await flushAct();
}

async function submitCampaignEdit(harness: CampaignHarness, name: string) {
  await clickCampaignEdit(harness);
  await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
  const form = campaignForm(harness.container);
  await setCampaignName(form, name);
  await act(async () => {
    campaignButtonWithText(form, 'Lưu').click();
    await Promise.resolve();
  });
  assert.equal(harness.queue.has(`/owner-api/content/campaigns/${campaignId}/revisions`, 'POST'), true);
}

const campaignRevisionReceipt = { contractVersion: '1.0.0', campaignId, campaignKey: 'campaign-a', brandId, version: 2, name: 'Campaign A đã lưu', createdAt: time, exactRetry: false };

test('an unmounted campaign save cannot navigate over a newly mounted draft', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await submitCampaignEdit(harness, 'Campaign A đang lưu trước khi unmount');
    const navigationBeforeUnmount = harness.navigateCalls.length;

    await harness.remount(null, false);
    await settleCampaignReads(harness, null);
    await harness.render(null, true);
    await setCampaignName(campaignForm(harness.container), 'UNSAVED CAMPAIGN B');

    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, campaignRevisionReceipt, 200, 'POST');

    const form = campaignForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED CAMPAIGN B');
    assert.equal(campaignButtonWithText(form, 'Lưu').textContent?.trim(), 'Lưu');
    assert.equal((form.querySelector('input') as HTMLInputElement).disabled, false);
    assert.equal(harness.navigateCalls.slice(navigationBeforeUnmount).includes(routeToHash.campaign(campaignId)), false);
  } finally {
    await harness.cleanup();
  }
});

test('a stale campaign save success leaves a newly created draft intact', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await submitCampaignEdit(harness, 'Campaign A đang lưu');
    const navigationBeforeStaleSave = harness.navigateCalls.length;

    await harness.render(null, false);
    await flushAct();
    await harness.render(null, true);
    await flushAct();
    await setCampaignName(campaignForm(harness.container), 'UNSAVED CAMPAIGN B');

    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, campaignRevisionReceipt, 200, 'POST');
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));

    const form = campaignForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED CAMPAIGN B');
    assert.equal(campaignButtonWithText(form, 'Lưu').textContent?.trim(), 'Lưu');
    assert.equal((form.querySelector('input') as HTMLInputElement).disabled, false);
    assert.equal(harness.navigateCalls.length, navigationBeforeStaleSave);
    assert.equal(harness.notice.textContent, 'Đã lưu phiên bản 2.');
  } finally {
    await harness.cleanup();
  }
});

test('a stale campaign save failure after leaving to the list keeps the list and reloads it', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await submitCampaignEdit(harness, 'Campaign A đang lưu lỗi');

    await harness.render(null, false);
    await flushAct();
    const navigationBeforeStaleFailure = harness.navigateCalls.length;
    const refreshedList = { contractVersion: '1.0.0', campaigns: [{ ...mountedCampaignSummary, name: 'Campaign list reloaded' }] };

    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, { error: { code: 'integrity', message: 'server failure' } }, 500, 'POST');
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }), refreshedList);

    assert.equal(harness.container.querySelector('form.campaign-form') === null, true);
    assert.match(harness.container.textContent ?? '', /Campaign list reloaded/);
    assert.match(harness.notice.textContent ?? '', /^Lần lưu trước không hoàn tất:/);
    assert.equal(harness.navigateCalls.length, navigationBeforeStaleFailure);
  } finally {
    await harness.cleanup();
  }
});

test('an exact-retry campaign save reports reuse and completes the current editor session', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await submitCampaignEdit(harness, 'Campaign A đã lưu');
    const navigationBeforeSave = harness.navigateCalls.length;

    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, { ...campaignRevisionReceipt, exactRetry: true }, 200, 'POST');
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));

    assert.equal(harness.notice.textContent, 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.');
    assert.equal(harness.navigateCalls.length, navigationBeforeSave + 1);
    assert.equal(harness.navigateCalls.at(-1), routeToHash.campaign(campaignId));
  } finally {
    await harness.cleanup();
  }
});

test('a campaign form suppresses a synchronous double submit within one editor session', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await clickCampaignEdit(harness);
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    const form = campaignForm(harness.container);
    await setCampaignName(form, 'Campaign A double submit');

    await act(async () => {
      const submit = () => form.dispatchEvent(new form.ownerDocument.defaultView!.Event('submit', { bubbles: true, cancelable: true }));
      submit();
      submit();
      await Promise.resolve();
    });

    assert.equal(harness.queue.pending.filter((request) => request.url === `/owner-api/content/campaigns/${campaignId}/revisions` && request.method === 'POST').length, 1);
    assert.equal(campaignButtonWithText(form, 'Đang lưu…').textContent?.trim(), 'Đang lưu…');

    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, campaignRevisionReceipt, 200, 'POST');
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
  } finally {
    await harness.cleanup();
  }
});

test('campaign deletion elsewhere while editing hides the form and restores the kept draft', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await submitCampaignEdit(harness, 'UNSAVED AFTER DELETE');

    const deletedDetail = mountedCampaignDetail({ sequence: 1, deleted: { deletedAt, restorableUntil } });
    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, { error: { code: 'conflict' } }, 409, 'POST');
    await settleCampaignReads(harness, deletedDetail);

    assert.equal(harness.container.querySelector('form.campaign-form') === null, true);
    assert.match(harness.container.textContent ?? '', /Chiến dịch đã bị xóa\. Khôi phục được đến/);
    assert.match(harness.container.textContent ?? '', /Chiến dịch đã bị xóa ở nơi khác\. Bản nháp chưa lưu vẫn được giữ; khôi phục chiến dịch để tiếp tục sửa\./);
    assert.equal([...harness.container.querySelectorAll('button')].filter((button) => button.textContent?.includes('Khôi phục')).length, 1);

    campaignButtonWithText(harness.container, 'Khôi phục').click();
    await flushAct();
    assert.equal(harness.queue.has(`/owner-api/content/campaigns/${campaignId}/lifecycle`, 'POST'), true);
    await harness.settle(`/owner-api/content/campaigns/${campaignId}/lifecycle`, { contractVersion: '1.0.0', campaignId, action: 'RESTORE', createdAt: time, exactRetry: false, sequence: 2 }, 200, 'POST');
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 2 }));

    const form = campaignForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED AFTER DELETE');
  } finally {
    await harness.cleanup();
  }
});

test('expired campaign deletion while editing keeps the form hidden and offers no restore', { concurrency: false }, async () => {
  const CampaignsPage = await importCampaignsPage();
  const harness = await mountCampaignPage(CampaignsPage, campaignId);
  try {
    await settleCampaignReads(harness, mountedCampaignDetail({ sequence: 0 }));
    await submitCampaignEdit(harness, 'UNSAVED EXPIRED');

    const expiredDetail = mountedCampaignDetail({ sequence: 1, deleted: { deletedAt: '2020-01-02T00:00:00.000Z', restorableUntil: '2020-01-31T00:00:00.000Z' } });
    await harness.settle(`/owner-api/content/campaigns/${campaignId}/revisions`, { error: { code: 'conflict' } }, 409, 'POST');
    await settleCampaignReads(harness, expiredDetail);

    assert.equal(harness.container.querySelector('form.campaign-form') === null, true);
    assert.match(harness.container.textContent ?? '', /Chiến dịch đã bị xóa ngày/);
    assert.match(harness.container.textContent ?? '', /đã quá hạn khôi phục\./);
    assert.match(harness.container.textContent ?? '', /Chiến dịch đã bị xóa ở nơi khác và đã quá hạn khôi phục, nên bản nháp chưa lưu không thể lưu được\./);
    assert.equal([...harness.container.querySelectorAll('button')].filter((button) => button.textContent?.includes('Khôi phục')).length, 0);
  } finally {
    await harness.cleanup();
  }
});

test('campaign page renders active rows and keeps deleted campaigns in the recent section', async () => {
  const { default: CampaignsPage } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const first = createDemoCampaign([], brandId, { ...emptyCampaignDraft(brandId), name: 'Chiến dịch A', objective: 'Mục tiêu A', items: [{ itemId, itemVersion: 1, tierKeys: ['plus', 'pro'] }] }, campaignId, time);
  const second = createDemoCampaign(first, otherBrandId, { ...emptyCampaignDraft(otherBrandId), name: 'Chiến dịch B', objective: 'Mục tiêu B', items: [{ itemId: otherItemId, itemVersion: 1, tierKeys: [] }] }, otherItemId, time);
  const third = createDemoCampaign(second, brandId, { ...emptyCampaignDraft(brandId), name: 'Chiến dịch đã xóa', objective: 'Mục tiêu xóa', items: [{ itemId, itemVersion: 1, tierKeys: [] }] }, '66666666-6666-4666-8666-0000000000c3', deletedAt);
  const campaigns = changeDemoCampaignLifecycle(third, '66666666-6666-4666-8666-0000000000c3', 'DELETE', deletedAt);
  const html = renderToStaticMarkup(createElement(CampaignsPage, pageProps({ demoCampaigns: campaigns })));
  assert.match(html, /Tất cả \(2\)/);
  assert.match(html, /Canxi A \(1\)/);
  assert.match(html, /Canxi B \(1\)/);
  assert.match(html, /Tư vấn \(Plus, Pro\)/);
  assert.match(html, new RegExp(`href="#/content/${campaignId}/insight">Insight</`));
  assert.match(html, /Đã xóa gần đây/);
  assert.match(html, /Chiến dịch đã xóa/);
  assert.match(html, /Khôi phục/);
  assert.equal((html.match(/Chiến dịch đã xóa/g) ?? []).length, 1);
});

test('campaign page renders the brand and campaign empty states', async () => {
  const { default: CampaignsPage } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const noBrand = renderToStaticMarkup(createElement(CampaignsPage, pageProps({ demoBrands: [] })));
  assert.match(noBrand, /Chưa có thương hiệu\. Hãy tạo thương hiệu trước khi tạo chiến dịch\./);
  assert.match(noBrand, /#\/brands/);
  const noCampaign = renderToStaticMarkup(createElement(CampaignsPage, pageProps({ demoCampaigns: [] })));
  assert.match(noCampaign, /Chưa có chiến dịch nào\./);
});

test('CampaignForm shows a blocker and locks every control while saving', async () => {
  const { CampaignForm } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const blocked = editorWithDraft({ ...emptyCampaignDraft(brandId), name: '', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 1, tierKeys: [] }] });
  const common = { mode: 'demo' as const, ownerToken: 'demo-token', writesAvailable: true, brands: campaignBrands, catalogItems: campaignItems, productWorkspaces: [], editor: blocked, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoCampaigns: [], setDemoCampaigns: () => undefined };
  const form = renderToStaticMarkup(createElement(CampaignForm, common));
  assert.match(form, /Nhập tên chiến dịch\./);
  assert.match(form, /<button[^>]*disabled=""[^>]*>Lưu<\/button>/);
  const saving = renderToStaticMarkup(createElement(CampaignForm, { ...common, editor: campaignEditorReducer(blocked, { type: 'submitted' }) }));
  assert.match(saving, /Đang lưu…/);
  for (const control of saving.match(/<(?:input|select|textarea|button)\b[^>]*>/g) ?? []) assert.match(control, /disabled=""/);
});

test('CampaignForm warns before upgrading a pinned catalog item version', async () => {
  const { CampaignForm } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const draft = { ...emptyCampaignDraft(brandId), name: 'Chiến dịch', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 1, tierKeys: ['old'] }] };
  const editor = campaignEditorReducer(campaignEditorReducer(null, { type: 'new', key: 'campaign-test', target: campaignId }), { type: 'loaded', base: { campaignId, version: 1, draft, history: [] } });
  const current = { ...campaignItems[0]!, version: 2, item: { ...campaignItems[0]!.item, tiers: [{ tierKey: 'new', name: 'Gói mới' }] } };
  const html = renderToStaticMarkup(createElement(CampaignForm, { mode: 'demo', ownerToken: 'demo-token', writesAvailable: true, brands: campaignBrands, catalogItems: [current], productWorkspaces: [], editor, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoCampaigns: [], setDemoCampaigns: () => undefined }));
  assert.match(html, /Đang dùng phiên bản v1 — có phiên bản mới v2/);
  assert.match(html, /Dùng phiên bản mới/);
});

test('CampaignForm keeps tier keys and hides chips when catalog detail is unavailable', async () => {
  const { CampaignForm } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const draft = { ...emptyCampaignDraft(brandId), name: 'Chiến dịch', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 2, tierKeys: ['plus', 'pro'] }] };
  const editor = editorWithDraft(draft);
  const summaryOnly = { itemId, itemKey: 'tu-van', itemType: 'SERVICE' as const, name: 'Tư vấn', version: 2, tierNames: ['Plus', 'Pro'], photoCount: 0, updatedAt: time };
  const html = renderToStaticMarkup(createElement(CampaignForm, { mode: 'demo', ownerToken: 'demo-token', writesAvailable: true, brands: campaignBrands, catalogItems: [summaryOnly], productWorkspaces: [], editor, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoCampaigns: [], setDemoCampaigns: () => undefined }));
  assert.doesNotMatch(html, /class="tier-chips"/);
  assert.doesNotMatch(html, />Plus<\/button>/);
  assert.match(html, /Không tải được danh sách gói — giữ nguyên lựa chọn gói hiện tại\./);
  assert.deepEqual(campaignRequestFromDraft(draft).items, [{ itemId, itemVersion: 2, tierKeys: ['plus', 'pro'] }]);
});

test('CampaignForm hides chips for an older pinned version and shows latest chips after upgrade', async () => {
  const { CampaignForm, upgradeCampaignDraft } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const draft = { ...emptyCampaignDraft(brandId), name: 'Chiến dịch', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 1, tierKeys: ['old', 'keep'] }] };
  const editor = campaignEditorReducer(campaignEditorReducer(null, { type: 'new', key: 'campaign-test', target: campaignId }), { type: 'loaded', base: { campaignId, version: 1, draft, history: [] } });
  const latest = { ...campaignItems[0]!, version: 2, item: { ...campaignItems[0]!.item, tiers: [{ tierKey: 'new', name: 'Gói mới' }, { tierKey: 'keep', name: 'Gói giữ' }] } };
  const common = { mode: 'demo' as const, ownerToken: 'demo-token', writesAvailable: true, brands: campaignBrands, catalogItems: [latest], productWorkspaces: [], dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoCampaigns: [], setDemoCampaigns: () => undefined };
  const pinned = renderToStaticMarkup(createElement(CampaignForm, { ...common, editor }));
  assert.doesNotMatch(pinned, /class="tier-chips"/);
  assert.match(pinned, /Dùng phiên bản mới để đổi gói\./);

  const upgradedDraft = upgradeCampaignDraft(draft, { itemId, version: latest.version, tiers: latest.item.tiers });
  const upgraded = editorWithDraft(upgradedDraft);
  const afterUpgrade = renderToStaticMarkup(createElement(CampaignForm, { ...common, editor: upgraded }));
  assert.match(afterUpgrade, /class="tier-chips"/);
  assert.match(afterUpgrade, />Gói mới<\/button>/);
  assert.match(afterUpgrade, />Gói giữ<\/button>/);
  assert.doesNotMatch(afterUpgrade, />old<\/button>/);
  assert.deepEqual(campaignRequestFromDraft(upgradedDraft).items, [{ itemId, itemVersion: 2, tierKeys: ['keep'] }]);
});

test('CampaignForm disables upgrade when a selected summary-only option has no detail tiers', async () => {
  const { CampaignForm } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const draft = { ...emptyCampaignDraft(brandId), name: 'Chiến dịch', objective: 'Mục tiêu', items: [{ itemId, itemVersion: 1, tierKeys: ['plus', 'pro'] }] };
  const editor = campaignEditorReducer(campaignEditorReducer(null, { type: 'new', key: 'campaign-test', target: campaignId }), { type: 'loaded', base: { campaignId, version: 1, draft, history: [] } });
  const summaryOnly = { itemId, itemKey: 'tu-van', itemType: 'SERVICE' as const, name: 'Tư vấn', version: 2, tierNames: ['Plus', 'Pro'], photoCount: 0, updatedAt: time };
  const html = renderToStaticMarkup(createElement(CampaignForm, { mode: 'demo', ownerToken: 'demo-token', writesAvailable: true, brands: campaignBrands, catalogItems: [summaryOnly], productWorkspaces: [], editor, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoCampaigns: [], setDemoCampaigns: () => undefined }));
  assert.match(html, /<button[^>]*disabled=""[^>]*>Dùng phiên bản mới<\/button>/);
});

test('campaign detail links step 1, shows disabled next-step indicators and respects deletion and OWNER lock', async () => {
  const { CampaignDetail } = await tsImport('../src/CampaignsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CampaignsPage');
  const common = { view: detail as never, brandName: 'Canxi A', researchProductWorkspaceName: 'Workspace nghiên cứu', onEdit: () => undefined, onLifecycle: () => undefined };
  const active = renderToStaticMarkup(createElement(CampaignDetail, { ...common, mode: 'demo', ownerToken: 'demo-token', writesAvailable: true }));
  assert.match(active, new RegExp(`<a class="step" href="#/content/${campaignId}/insight"><b>Insight — mở bước 1</b></a>`));
  for (const step of ['Big Idea — cần khóa Insight trước', 'Góc nội dung — cần khóa Insight trước', 'Caption &amp; Poster — có ở bước tiếp theo']) assert.match(active, new RegExp(step));
  const deleted = renderToStaticMarkup(createElement(CampaignDetail, { ...common, mode: 'demo', ownerToken: 'demo-token', writesAvailable: true }));
  assert.match(deleted, /Chiến dịch đã bị xóa\. Khôi phục được đến/);
  assert.doesNotMatch(deleted, />Sửa</);
  const locked = renderToStaticMarkup(createElement(CampaignDetail, { ...common, view: { ...detail, lifecycle: { sequence: 0 } } as never, mode: 'real', ownerToken: null, writesAvailable: true }));
  assert.doesNotMatch(locked, />Sửa</);
  assert.doesNotMatch(locked, />Xóa</);
});

test('App keeps the content navigation in the planned order and wires seeded campaign state', () => {
  const app = fs.readFileSync('frontend/src/App.tsx', 'utf8');
  const nav = /<nav className="topnav"[\s\S]*?<\/nav>/.exec(app)?.[0] ?? '';
  assert.ok(nav.indexOf('Thị trường') < nav.indexOf('Nội dung'));
  assert.ok(nav.indexOf('Nội dung') < nav.indexOf('Thương hiệu'));
  assert.ok(nav.indexOf('Thương hiệu') < nav.indexOf('Thư viện prompt'));
  assert.match(nav, /routeToHash\.content\(\)/);
});
