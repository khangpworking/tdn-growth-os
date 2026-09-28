import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';

const brandId = '66666666-6666-4666-8666-000000000001';
const itemId = '66666666-6666-4666-8666-0000000000a1';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const productWorkspaceId = '66666666-6666-4666-8666-0000000000f1';
const lockedStpId = '66666666-6666-4666-8666-0000000000e1';
const at = '2027-01-01T00:00:00.000Z';
const later = '2027-01-02T00:00:00.000Z';
const positioningReference = 'Positioning from the linked locked STP';
const campaignUrl = `/api/content/campaigns/${campaignId}`;
const insightUrl = `${campaignUrl}/insight`;
const revisionUrl = `/owner-api/content/campaigns/${campaignId}/insight/revisions`;
const lockUrl = `/owner-api/content/campaigns/${campaignId}/insight/lock`;

const response = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

interface PendingRequest {
  readonly url: string;
  readonly method: string;
  readonly init: RequestInit;
  readonly resolve: (value: Response) => void;
}

function deferredFetchQueue() {
  const pending: PendingRequest[] = [];
  const fetcher: typeof fetch = (input, init) => new Promise<Response>((resolve) => {
    pending.push({ url: String(input), method: String(init?.method ?? 'GET').toUpperCase(), init: init ?? {}, resolve });
  });
  const find = (url: string, method = 'GET') => pending.findIndex((request) => request.url === url && request.method === method.toUpperCase());
  const resolve = (url: string, body: unknown, status = 200, method = 'GET') => {
    const index = find(url, method);
    assert.notEqual(index, -1, `No pending ${method} request for ${url}; pending: ${pending.map((request) => `${request.method} ${request.url}`).join(', ')}`);
    const request = pending.splice(index, 1)[0]!;
    request.resolve(response(status, body));
  };
  return { pending, fetcher, resolve, has: (url: string, method = 'GET') => find(url, method) !== -1 };
}

function campaignDetail() {
  return {
    contractVersion: '1.0.0',
    campaign: {
      campaignId,
      campaignKey: 'campaign-a',
      brandId,
      version: 1,
      campaign: { name: 'Campaign A', objective: 'Objective A', items: [{ itemId, itemVersion: 1 }] },
      createdAt: at,
    },
    items: [{ itemId, itemVersion: 1, itemKey: 'item-a', itemType: 'SERVICE', name: 'Tư vấn', tiers: [] }],
    history: [{ version: 1, name: 'Campaign A', createdAt: at }],
    lifecycle: { sequence: 0 },
  };
}

type InsightContent = { readonly customer: string; readonly painPoint: string; readonly insight: string; readonly source: { readonly kind: 'TYPED' } };

function insightDetail(content?: InsightContent, createdAt = at) {
  return {
    contractVersion: '1.0.0',
    campaignId,
    campaignVersion: 1,
    campaignDeleted: false,
    ...(content ? {
      latest: { version: 1, insight: content, createdAt },
      history: [{ version: 1, sourceKind: 'TYPED', createdAt }],
    } : { history: [] }),
    gate: { required: false, ready: true },
  };
}

function insightWith(content: Omit<InsightContent, 'source'>): InsightContent {
  return { ...content, source: { kind: 'TYPED' } };
}

type InsightPageModule = typeof import('../src/InsightPage');
type InsightPageComponent = InsightPageModule['default'];

async function importInsightPage(): Promise<InsightPageComponent> {
  return (await tsImport('../src/InsightPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as InsightPageModule).default;
}

async function flushAct() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settleReads(queue: ReturnType<typeof deferredFetchQueue>, detail: unknown) {
  for (let round = 0; round < 5; round += 1) {
    await flushAct();
    let settled = false;
    await act(async () => {
      if (queue.has(campaignUrl)) { queue.resolve(campaignUrl, campaignDetail()); settled = true; }
      if (queue.has(insightUrl)) { queue.resolve(insightUrl, detail); settled = true; }
      await Promise.resolve();
      await Promise.resolve();
    });
    if (!settled) break;
  }
  await flushAct();
}

interface InsightHarness {
  readonly container: HTMLElement;
  readonly queue: ReturnType<typeof deferredFetchQueue>;
  readonly notifications: string[];
  readonly cleanup: () => Promise<void>;
}

async function mountInsightPage(Page: InsightPageComponent): Promise<InsightHarness> {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const queue = deferredFetchQueue();
  const notifications: string[] = [];
  const originalFetch = globalThis.fetch;
  let cleaned = false;
  globalThis.fetch = queue.fetcher;
  const root = createRoot(dom.container);
  await act(async () => {
    root.render(createElement(Page, {
      mode: 'real', campaignId, ownerToken: 'owner-token', writesAvailable: true,
      demoCampaigns: [], demoItems: [], demoInsights: [], setDemoInsights: () => undefined,
      researchProducts: [], notify: (message: string) => { notifications.push(message); },
    }));
    await Promise.resolve();
  });
  return {
    container: dom.container,
    queue,
    notifications,
    cleanup: async () => {
      if (cleaned) return;
      cleaned = true;
      await act(async () => { root.unmount(); });
      globalThis.fetch = originalFetch;
      dom.cleanup();
    },
  };
}

function insightForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form.insight-form');
  assert.ok(form, 'Expected the Insight form to be mounted');
  return form as HTMLFormElement;
}

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(text));
  assert.ok(button, `Expected a button containing ${text}`);
  return button as HTMLButtonElement;
}

async function setInsightField(form: HTMLFormElement, id: string, value: string) {
  const textarea = form.querySelector(`#${id}`) as HTMLTextAreaElement | null;
  assert.ok(textarea, `Expected textarea #${id}`);
  const setter = Object.getOwnPropertyDescriptor(textarea.ownerDocument.defaultView!.HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new textarea.ownerDocument.defaultView!.Event('input', { bubbles: true }));
    textarea.dispatchEvent(new textarea.ownerDocument.defaultView!.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(textarea.value, value);
}

async function submitInsight(harness: InsightHarness): Promise<PendingRequest> {
  const form = insightForm(harness.container);
  const submit = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
  assert.ok(submit, 'Expected the Insight save button');
  assert.equal(submit.disabled, false, 'Expected the Insight save button to be enabled');
  await act(async () => {
    submit.click();
    await Promise.resolve();
  });
  await flushAct();
  const request = harness.queue.pending.find((candidate) => candidate.url === revisionUrl && candidate.method === 'POST');
  assert.ok(request, 'Expected a pending Insight revision request');
  return request;
}

function requestBody(request: PendingRequest): Record<string, unknown> {
  return JSON.parse(String(request.init.body)) as Record<string, unknown>;
}

async function settlePost(harness: InsightHarness, body: unknown, status: number) {
  await act(async () => {
    harness.queue.resolve(revisionUrl, body, status, 'POST');
    await Promise.resolve();
    await Promise.resolve();
  });
  await flushAct();
}

const ownerDraft = insightWith({ customer: 'Owner draft', painPoint: 'Owner pain', insight: 'Owner insight' });
const serverInsight = insightWith({ customer: 'Server customer', painPoint: 'Server pain', insight: 'Server insight' });

async function reachConflictReload(harness: InsightHarness) {
  await settleReads(harness.queue, insightDetail());
  const form = insightForm(harness.container);
  await setInsightField(form, 'insight-customer', ownerDraft.customer);
  await setInsightField(form, 'insight-pain', ownerDraft.painPoint);
  await setInsightField(form, 'insight-text', ownerDraft.insight);
  const firstPost = await submitInsight(harness);
  await settlePost(harness, { error: { code: 'conflict', message: 'Request conflicts with current state' } }, 409);
  const reload = buttonWithText(harness.container, 'Tải lại');
  await act(async () => {
    reload.click();
    await Promise.resolve();
  });
  await settleReads(harness.queue, insightDetail(serverInsight));
  return firstPost;
}

test('an empty Insight campaign mounts its form and first save posts expectedVersion 0 with typed content', { concurrency: false }, async () => {
  const Page = await importInsightPage();
  const harness = await mountInsightPage(Page);
  try {
    await settleReads(harness.queue, insightDetail());
    const form = insightForm(harness.container);
    assert.equal((form.querySelector('#insight-customer') as HTMLTextAreaElement).value, '');

    await setInsightField(form, 'insight-customer', 'Target customer');
    await setInsightField(form, 'insight-pain', 'A concrete pain point');
    await setInsightField(form, 'insight-text', 'A useful insight');
    const post = await submitInsight(harness);

    assert.deepEqual(requestBody(post), {
      contractVersion: '1.0.0',
      expectedVersion: 0,
      insight: {
        customer: 'Target customer',
        painPoint: 'A concrete pain point',
        insight: 'A useful insight',
        source: { kind: 'TYPED' },
      },
    });
    await settlePost(harness, { contractVersion: '1.0.0', campaignId, version: 1, createdAt: at, exactRetry: false }, 201);
    await settleReads(harness.queue, insightDetail(insightWith({ customer: 'Target customer', painPoint: 'A concrete pain point', insight: 'A useful insight' })));
  } finally {
    await harness.cleanup();
  }
});

test('a linked STP keeps positioning in the read-only reference after applying its customer suggestion', { concurrency: false }, async () => {
  const Page = await importInsightPage();
  const harness = await mountInsightPage(Page);
  try {
    await settleReads(harness.queue, {
      ...insightDetail(),
      gate: { required: true, ready: true, productWorkspaceId },
      stpSuggestion: { lockedStpId, customer: 'Primary segment', insight: positioningReference },
    });
    const form = insightForm(harness.container);
    const apply = form.querySelector('.insight-suggestion button') as HTMLButtonElement | null;
    assert.ok(apply, 'Expected the STP suggestion button');
    await act(async () => {
      apply.click();
      await Promise.resolve();
    });

    const reference = form.querySelector('.insight-reference');
    assert.ok(reference, 'Expected the STP positioning reference block');
    assert.equal((reference.textContent ?? '').includes(positioningReference), true);
    assert.equal(reference.querySelector('textarea'), null);
    assert.equal((form.querySelector('#insight-customer') as HTMLTextAreaElement).value, 'Primary segment');
    assert.equal((form.querySelector('#insight-text') as HTMLTextAreaElement).value, '');
  } finally {
    await harness.cleanup();
  }
});

test('Insight conflict reload keeps the owner draft, resaves it at the loaded version, and refreshes after success', { concurrency: false }, async () => {
  const Page = await importInsightPage();
  const harness = await mountInsightPage(Page);
  try {
    const firstPost = await reachConflictReload(harness);
    assert.deepEqual(requestBody(firstPost), { contractVersion: '1.0.0', expectedVersion: 0, insight: ownerDraft });
    const form = insightForm(harness.container);
    assert.deepEqual([...form.querySelectorAll('textarea')].map((textarea) => textarea.value), [ownerDraft.customer, ownerDraft.painPoint, ownerDraft.insight]);
    assert.equal(buttonWithText(harness.container, 'Bỏ nháp').disabled, false);

    const nextPost = await submitInsight(harness);
    assert.deepEqual(requestBody(nextPost), { contractVersion: '1.0.0', expectedVersion: 1, insight: ownerDraft });

    const saved = insightWith({ customer: 'Owner draft', painPoint: 'Owner pain', insight: 'Owner insight' });
    await settlePost(harness, { contractVersion: '1.0.0', campaignId, version: 2, createdAt: later, exactRetry: false }, 201);
    await settleReads(harness.queue, {
      ...insightDetail(saved, later),
      latest: { version: 2, insight: saved, createdAt: later },
      history: [{ version: 1, sourceKind: 'TYPED', createdAt: at }, { version: 2, sourceKind: 'TYPED', createdAt: later }],
    });
    assert.match(harness.container.textContent ?? '', /tạo phiên bản 3/);
    assert.deepEqual([...insightForm(harness.container).querySelectorAll('textarea')].map((textarea) => textarea.value), [saved.customer, saved.painPoint, saved.insight]);
  } finally {
    await harness.cleanup();
  }
});

test('Insight conflict reload offers discard that restores the server version', { concurrency: false }, async () => {
  const Page = await importInsightPage();
  const harness = await mountInsightPage(Page);
  try {
    await reachConflictReload(harness);
    const form = insightForm(harness.container);
    assert.deepEqual([...form.querySelectorAll('textarea')].map((textarea) => textarea.value), [ownerDraft.customer, ownerDraft.painPoint, ownerDraft.insight]);
    await act(async () => {
      buttonWithText(harness.container, 'Bỏ nháp').click();
      await Promise.resolve();
    });
    assert.deepEqual([...insightForm(harness.container).querySelectorAll('textarea')].map((textarea) => textarea.value), [serverInsight.customer, serverInsight.painPoint, serverInsight.insight]);
    assert.equal((insightForm(harness.container).querySelector('button[type="submit"]') as HTMLButtonElement).disabled, true);
  } finally {
    await harness.cleanup();
  }
});

test('a deferred save completion after unmount does not notify or reload the old Insight page', { concurrency: false }, async () => {
  const Page = await importInsightPage();
  const harness = await mountInsightPage(Page);
  await settleReads(harness.queue, insightDetail());
  const form = insightForm(harness.container);
  try {
    await setInsightField(form, 'insight-customer', ownerDraft.customer);
    await setInsightField(form, 'insight-pain', ownerDraft.painPoint);
    await setInsightField(form, 'insight-text', ownerDraft.insight);
    await submitInsight(harness);
    await harness.cleanup();
    await act(async () => {
      harness.queue.resolve(revisionUrl, { contractVersion: '1.0.0', campaignId, version: 1, createdAt: at, exactRetry: false }, 201, 'POST');
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.deepEqual(harness.notifications, []);
    assert.equal(harness.queue.pending.some((request) => request.method === 'GET'), false);
  } finally { await harness.cleanup(); }
});

test('a deferred lock completion after unmount does not notify or reload the old Insight page', { concurrency: false }, async () => {
  const Page = await importInsightPage();
  const harness = await mountInsightPage(Page);
  await settleReads(harness.queue, insightDetail(insightWith({ customer: 'Customer', painPoint: 'Pain', insight: 'Insight' })));
  try {
    await act(async () => {
      buttonWithText(harness.container, 'Khóa Insight').click();
      await Promise.resolve();
    });
    const dialog = harness.container.querySelector('[role="dialog"]');
    assert.ok(dialog, 'Expected the lock confirmation dialog');
    const confirm = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.includes('Khóa Insight')) as HTMLButtonElement | undefined;
    assert.ok(confirm, 'Expected the lock confirmation button');
    await act(async () => {
      confirm.click();
      await Promise.resolve();
    });
    assert.equal(harness.queue.pending.some((request) => request.url === lockUrl && request.method === 'POST'), true);
    await harness.cleanup();
    await act(async () => {
      harness.queue.resolve(lockUrl, { contractVersion: '1.0.0', campaignId, insightVersion: 1, campaignVersion: 1, lockedAt: at, exactRetry: false }, 201, 'POST');
      await Promise.resolve();
      await Promise.resolve();
    });
    assert.deepEqual(harness.notifications, []);
    assert.equal(harness.queue.pending.some((request) => request.method === 'GET'), false);
  } finally { await harness.cleanup(); }
});
