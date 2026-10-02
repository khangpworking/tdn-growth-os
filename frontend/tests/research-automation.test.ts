import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { defaultPeriod, editPeriodDate, inclusiveDays, periodProblem } from '../src/research-automation/period';
import { emptyDraft, startBody } from '../src/research-automation/form';
import type { ResearchAutomationRun } from '../src/research-automation/api';
import { setupDom } from './dom';
import { parseRoute, routeToHash } from '../src/routing';
import { createSeedState } from '../src/model';
import { shouldPoll } from '../src/research-automation/run-status';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const token = 'synthetic-owner-token-1234567890-only';
const runId = '22222222-2222-4222-8222-222222222222';

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLInputElement.prototype, 'value')?.set;
  assert.ok(setter, 'jsdom input value setter is available');
  setter.call(input, value);
  input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
  input.dispatchEvent(new input.ownerDocument.defaultView!.Event('change', { bubbles: true }));
}

function successfulRun(): ResearchAutomationRun {
  const period = { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 };
  return {
    contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 1, status: 'QUICK_SEARCH_QUEUED', country: 'VN', mode: 'CATEGORY', keyword: 'đồ chơi gỗ',
    description: null, interview: {}, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'], definition: null, productCards: [],
    coverage: { requestedPeriod: period, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
    steps: [
      { stepId: 'QUICK_SEARCH', state: 'QUEUED', code: null, message: null, startedAt: null, finishedAt: null },
      { stepId: 'COLLECTION', state: 'PENDING', code: null, message: null, startedAt: null, finishedAt: null },
      { stepId: 'REPORTS', state: 'PENDING', code: null, message: null, startedAt: null, finishedAt: null },
    ],
    blockers: [], createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
  };
}

function successfulReceipt(): string {
  return JSON.stringify({ contractVersion: 'research-automation-receipt-v1', exactRetry: false, run: successfulRun() });
}

test('research entry and reload routes preserve workspace and run identity', () => {
  const workspace = 'market-real';
  const run = '11111111-1111-4111-8111-111111111111';
  assert.deepEqual(parseRoute(routeToHash.research(workspace), createSeedState()), { kind: 'research', marketId: workspace, runId: null });
  assert.deepEqual(parseRoute(routeToHash.research(workspace, run), createSeedState()), { kind: 'research', marketId: workspace, runId: run });
  assert.equal(parseRoute(`#/markets/${workspace}/research/not-a-uuid`, createSeedState()).kind, 'invalid');
});

test('an unknown future lifecycle state keeps polling instead of presenting a false terminal state', () => {
  assert.equal(shouldPoll('FUTURE_BACKEND_STATE'), true);
});

test('period editor preserves inclusive counts, supports exact 360-day custom windows, and rejects overlong requests', () => {
  const base = defaultPeriod('2026-10-02');
  assert.equal(base.startDate, '2025-10-03');
  assert.equal(base.endDate, '2026-10-02');
  assert.equal(inclusiveDays(base.startDate, base.endDate), 365);
  const custom = editPeriodDate(editPeriodDate(base, 'startDate', '2025-10-08'), 'endDate', '2026-10-02');
  assert.equal(custom.preset, 'CUSTOM');
  assert.equal(inclusiveDays(custom.startDate, custom.endDate), 360);
  assert.equal(periodProblem(custom, '2026-10-02'), null);
  assert.equal(periodProblem({ ...custom, startDate: '2023-10-02' }, '2026-10-02'), 'Kỳ nghiên cứu không được dài hơn 1.096 ngày.');
});

test('start body omits unknown category answers and only freezes choices at explicit start', () => {
  const draft = emptyDraft(defaultPeriod('2026-10-02'));
  const body = startBody({ ...draft, keyword: 'đồ chơi gỗ', interview: { ...draft.interview, audience: { text: '', unknown: true }, productType: { text: 'gỗ tự nhiên', unknown: false } } }, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(body.contractVersion, 'research-automation-start-v1');
  assert.equal(body.requestKey, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.deepEqual(body.interview, { productType: 'gỗ tự nhiên' });
  assert.deepEqual(body.requestedPeriod, { startDate: '2025-10-03', endDate: '2026-10-02' });
});

test('typing in the editor does not issue a paid start request', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; return new Response('{}', { status: 500 }); }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Editor } = await tsImport('../src/research-automation/ResearchEditor.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ResearchEditor');
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Editor, { mode: 'real', workspaceId, ownerToken: token, writesAvailable: true, navigate: () => undefined, notify: () => undefined })); });
    const input = dom.container.querySelector('#ra-keyword') as HTMLInputElement;
    await act(async () => { setInputValue(input, 'giày chạy bộ'); });
    assert.equal(calls, 0);
    assert.equal((dom.container.querySelector('button.primary') as HTMLButtonElement).textContent?.includes('Tiếp tục'), true);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

test('a valid 202 receipt with a run projection navigates while the editor is mounted', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  const navigations: string[] = [];
  globalThis.fetch = (async () => new Response(successfulReceipt(), { status: 202, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Editor } = await tsImport('../src/research-automation/ResearchEditor.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ResearchEditor');
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Editor, { mode: 'real', workspaceId, ownerToken: token, writesAvailable: true, navigate: hash => navigations.push(hash), notify: () => undefined })); });
    const keyword = dom.container.querySelector('#ra-keyword') as HTMLInputElement;
    await act(async () => { setInputValue(keyword, 'đồ chơi gỗ'); });
    const clickText = async (text: string) => {
      const button = [...dom.container.querySelectorAll('button')].find(item => item.textContent?.includes(text)) as HTMLButtonElement;
      assert.ok(button, `missing button: ${text}`);
      await act(async () => { button.click(); });
    };
    await clickText('Tiếp tục');
    await clickText('Tiếp tục');
    await clickText('Bắt đầu tìm nhanh');
    await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
    assert.deepEqual(navigations, [`#/markets/${workspaceId}/research/${runId}`]);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

test('a late successful start response cannot navigate after the editor is unmounted', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  let resolveStart!: (response: Response) => void;
  const requestPending = new Promise<Response>(resolve => { resolveStart = resolve; });
  const navigations: string[] = [];
  globalThis.fetch = (async () => requestPending) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Editor } = await tsImport('../src/research-automation/ResearchEditor.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ResearchEditor');
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Editor, { mode: 'real', workspaceId, ownerToken: token, writesAvailable: true, navigate: hash => navigations.push(hash), notify: () => undefined })); });
    const keyword = dom.container.querySelector('#ra-keyword') as HTMLInputElement;
    await act(async () => { setInputValue(keyword, 'đồ chơi gỗ'); });
    const clickText = async (text: string) => {
      const button = [...dom.container.querySelectorAll('button')].find(item => item.textContent?.includes(text)) as HTMLButtonElement;
      assert.ok(button, `missing button: ${text}`);
      await act(async () => { button.click(); });
    };
    await clickText('Tiếp tục');
    await clickText('Tiếp tục');
    await clickText('Bắt đầu tìm nhanh');
    assert.equal(dom.container.querySelector('button.primary')?.textContent?.includes('Đang gửi'), true);
    await act(async () => { root.unmount(); });
    resolveStart(new Response(successfulReceipt(), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    await act(async () => { await requestPending; });
    assert.deepEqual(navigations, []);
  } finally {
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

test('scope cards show the observed quick-search dates as a recent discovery window, not the requested period', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: ScopeConfirm } = await tsImport('../src/research-automation/ScopeConfirm.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ScopeConfirm');
  const run: ResearchAutomationRun = { ...successfulRun(), status: 'AWAITING_SCOPE', productCards: [{
    productId: 'kalodata:101', provider: 'kalodata', sourceProductId: '101', role: 'PRINCIPAL', title: 'Đồ chơi gỗ tổng hợp',
    sourceUrl: null, imageUrl: null, description: null, descriptionState: 'EMPTY',
    observedWindow: { startDate: '2026-09-02', endDate: '2026-10-01', label: 'QUICK_SEARCH_RECENT_WINDOW' }, retrievedAt: '2026-10-02T00:00:00.000Z',
  }] };
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(ScopeConfirm, { run, ownerToken: token, writesAvailable: true, onConfirmed: () => undefined, onConflict: () => undefined })); });
    const text = dom.container.textContent ?? '';
    assert.ok(text.includes('Kỳ tìm nhanh gần đây'));
    assert.ok(text.includes('02/09/2026 → 01/10/2026'));
    assert.ok(text.includes('không chứng minh dữ liệu cho kỳ nghiên cứu 365 ngày'));
    assert.equal(text.includes('QUICK_SEARCH_RECENT_WINDOW'), false);
  } finally {
    await act(async () => root.unmount());
    dom.cleanup();
  }
});

// UI owns explicit confirmation and field-to-request delivery; service tests
// own source retention and listing identity verification.
test('exact Shopee scope blocks duplicate links and sends only after explicit confirmation without requiring discovery cards', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  const bodies: Record<string, unknown>[] = [];
  const { createRoot } = await import('react-dom/client');
  const { default: ScopeConfirm } = await tsImport('../src/research-automation/ScopeConfirm.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ScopeConfirm');
  const root = createRoot(dom.container);
  let confirmed = 0;
  globalThis.fetch = (async (_url, init) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(successfulReceipt(), { status: 202, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  const fill = async (id: string, value: string) => {
    const field = dom.container.querySelector<HTMLTextAreaElement>(`#${id}`);
    assert.ok(field);
    const setter = Object.getOwnPropertyDescriptor(field.ownerDocument.defaultView!.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(field, value); field.dispatchEvent(new field.ownerDocument.defaultView!.Event('input', { bubbles: true })); });
  };
  const approve = () => [...dom.container.querySelectorAll('button')].find(button => button.textContent === 'Duyệt định nghĩa')!;
  const listing = 'https://shopee.vn/product/78085196/17678138164';
  try {
    await act(async () => root.render(createElement(ScopeConfirm, { run: { ...successfulRun(), status: 'AWAITING_SCOPE' }, ownerToken: token, writesAvailable: true, onConfirmed: () => { confirmed++; }, onConflict: () => assert.fail('unexpected conflict') })));
    await fill('ra-definition', 'Thạch dừa đúng listing đã chọn');
    await fill('ra-exact-urls', `${listing}\nhttps://shopee.vn/alias-i.78085196.17678138164`);
    assert.equal(approve().disabled, true);
    assert.match(dom.container.textContent ?? '', /cùng một listing/);
    await fill('ra-exact-urls', listing);
    assert.equal(approve().disabled, false);
    assert.equal(bodies.length, 0);
    await act(async () => approve().click());
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.match(dialog.textContent ?? '', /17678138164/);
    assert.equal(bodies.length, 0);
    const submit = [...dialog.querySelectorAll('button')].find(button => button.textContent === 'Xác nhận và bắt đầu');
    assert.ok(submit);
    await act(async () => submit.click());
    assert.equal(bodies.length, 1);
    assert.deepEqual(bodies[0]?.exactShopeeUrls, [listing]);
    assert.deepEqual(bodies[0]?.selectedProductIds, []);
    assert.deepEqual(bodies[0]?.peerProductIds, []);
    assert.equal(confirmed, 1);
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});
