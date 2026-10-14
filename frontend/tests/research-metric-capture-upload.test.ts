import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import { loadPreparedMetricCaptureSources, prepareMetricCapture, ResearchAutomationError } from '../src/research-automation/api';
import type { ResearchAutomationMetricCapturePrepareRequest, ResearchAutomationRun } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const packageId = '44444444-4444-4444-8444-444444444444';
const token = 'synthetic-owner-token-1234567890-only';
const body: ResearchAutomationMetricCapturePrepareRequest = {
  contractVersion: 'automation-metric-capture-prepare-v1', requestKey: '33333333-3333-4333-8333-333333333333', expectedRevision: 1, sourceContext: 'Synthetic context',
};
const capture = {
  captureId: 'synthetic-capture', specDigest: 'a'.repeat(64), keyword: 'synthetic keyword', platforms: ['shopee'],
  measurementPeriod: { startDate: '2026-09-01', endDate: '2026-09-30' }, truncation: { cap: 50, totalShown: 80, pagesRead: 1, rowsRead: 50, truncated: true },
};
const receipt = {
  contractVersion: 'automation-metric-capture-prepared-v1', requestKey: body.requestKey, packageId, state: 'PREPARED_NOT_ADMITTED', exactRetry: false,
  recordCount: 50, sourceLabel: 'results-page capture', capture, provenance: 'RESULTS_PAGE_CAPTURE',
};
const entry = { packageId, recordCount: 50, request: body, capture, provenance: 'RESULTS_PAGE_CAPTURE' };
const inventory = (sources: unknown[] = [entry], id = runId) => ({ contractVersion: 'automation-prepared-metric-capture-list-v1', workspaceId, runId: id, sources });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const hasKind = (kind: ResearchAutomationError['kind']) => (error: unknown) => error instanceof ResearchAutomationError && error.kind === kind;
const captureUrl = `/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric-capture`;
const files = () => [new File(['{"synthetic":1}'], 'snapshot.json', { type: 'application/json' }), new File(['{"synthetic":2}'], 'manifest.json', { type: 'application/json' })] as const;

test('capture client sends metadata, snapshot and manifest once with owner auth and validates the receipt', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0, response = json(receipt, 201);
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(url, `/owner-api${captureUrl}`);
    assert.equal(init?.method, 'POST'); assert.equal(init?.credentials, 'omit'); assert.equal(init?.redirect, 'error');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${token}`);
    assert.equal(new Headers(init?.headers).get('Content-Type'), null);
    const form = init?.body as FormData;
    assert.deepEqual([...form.keys()].sort(), ['manifest', 'metadata', 'snapshot']);
    assert.deepEqual(JSON.parse(form.get('metadata') as string), body);
    assert.equal(await (form.get('snapshot') as Blob).text(), '{"synthetic":1}');
    assert.equal(await (form.get('manifest') as Blob).text(), '{"synthetic":2}');
    return response;
  }) as typeof fetch;
  const send = () => prepareMetricCapture(workspaceId, runId, body, ...files(), token);
  try {
    assert.deepEqual(await send(), receipt); assert.equal(calls, 1);
    response = json({ ...receipt, exactRetry: true }, 200); assert.equal((await send()).exactRetry, true);
    for (const invalid of [{ ...receipt, requestKey: workspaceId }, { ...receipt, state: 'ADMITTED' }, { ...receipt, recordCount: 0 }]) {
      response = json(invalid, 201); await assert.rejects(send(), hasKind('integrity'));
    }
    response = json(receipt, 202); await assert.rejects(send(), hasKind('integrity'));
    response = json({ error: { message: 'Máy chủ từ chối' } }, 400); await assert.rejects(send(), hasKind('rejected'));
    response = json({ error: { message: 'Conflict' } }, 409); await assert.rejects(send(), hasKind('conflict'));
    response = json({}, 401); await assert.rejects(send(), hasKind('authorization'));
    const before = calls;
    globalThis.fetch = async () => { calls++; throw new Error('Connection lost after possible commit'); };
    await assert.rejects(send(), hasKind('connection')); assert.equal(calls, before + 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('capture inventory is read-only and rejects another run or duplicate package', async () => {
  const originalFetch = globalThis.fetch;
  let response = json(inventory());
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api${captureUrl}`);
    assert.equal(init?.body, undefined); assert.equal(new Headers(init?.headers).get('Authorization'), null);
    return response;
  }) as typeof fetch;
  const load = () => loadPreparedMetricCaptureSources(workspaceId, runId, new AbortController().signal);
  try {
    assert.equal((await load()).sources.length, 1);
    response = json(inventory([])); assert.deepEqual((await load()).sources, []);
    response = json(inventory([entry, entry])); await assert.rejects(load(), hasKind('integrity'));
    response = json(inventory([entry], '55555555-5555-4555-8555-555555555555')); await assert.rejects(load(), hasKind('integrity'));
    response = json({ ...inventory(), contractVersion: 'other' }); await assert.rejects(load(), hasKind('integrity'));
  } finally { globalThis.fetch = originalFetch; }
});

const period = { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 };
const run = {
  contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 7, status: 'DRAFT_READY', country: 'VN', mode: 'CATEGORY', keyword: 'synthetic only',
  description: null, interview: {}, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'],
  definition: { definition: 'Synthetic only', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], confirmedAt: '2026-10-02T00:00:00.000Z' },
  productCards: [], coverage: { requestedPeriod: period, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
  steps: [], blockers: [], createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
} as unknown as ResearchAutomationRun;
const nextTurn = () => act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 1)); });
async function until(check: () => boolean, label: string) {
  const deadline = Date.now() + 30000;
  while (!check() && Date.now() < deadline) await nextTurn();
  assert.ok(check(), `${label}; current UI: ${document.body.textContent?.slice(-400) ?? '(empty)'}`);
}
function button(container: HTMLElement, label: string) { const found = [...container.querySelectorAll('button')].find(x => x.textContent?.trim() === label); assert.ok(found, label); return found; }
async function pick(container: HTMLElement, id: string, file: File) {
  const field = container.querySelector<HTMLInputElement>(`#${id}`)!;
  Object.defineProperty(field, 'files', { configurable: true, value: [file] });
  await act(async () => { field.dispatchEvent(new field.ownerDocument.defaultView!.Event('change', { bubbles: true })); });
}
async function type(container: HTMLElement, id: string, value: string) {
  const field = container.querySelector<HTMLTextAreaElement>(`#${id}`)!; const view = field.ownerDocument.defaultView!;
  await act(async () => { Object.getOwnPropertyDescriptor(view.HTMLTextAreaElement.prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new view.Event('input', { bubbles: true })); });
}
async function mount(t: test.TestContext, handler: typeof fetch, ownerToken: string | null = token) {
  const dom = setupDom(), prior = globalThis.fetch; globalThis.fetch = handler;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: Component } = await tsImport('../src/research-automation/MetricCapturePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  await act(async () => { root.render(createElement(Component, { run, ownerToken, disabled: false, onConflict: () => {} })); });
  await until(() => !dom.container.textContent?.includes('Đang tải danh sách'), 'inventory loaded');
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = prior; dom.cleanup(); });
  return dom;
}
async function fill(container: HTMLElement) {
  const [snapshot, manifest] = files();
  await pick(container, 'ra-capture-snapshot', snapshot); await pick(container, 'ra-capture-manifest', manifest);
  await type(container, 'ra-capture-context', 'Synthetic context');
}

test('panel stays disabled until both files and context exist, uploads once, shows receipt state and refreshes inventory without admitting', async t => {
  let sources: unknown[] = [], resolveUpload!: (response: Response) => void; const writes: RequestInit[] = []; const calls: string[] = [];
  const dom = await mount(t, (async (url, init) => {
    calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
    if (init?.method === 'POST') { writes.push(init); return new Promise<Response>(resolve => { resolveUpload = resolve; }); }
    return json(inventory(sources));
  }) as typeof fetch);
  assert.match(dom.container.textContent!, /Chưa có bản ghi trang kết quả nào/);
  const submit = 'Lưu bản ghi, chưa đưa vào báo cáo';
  assert.equal(button(dom.container, submit).disabled, true);
  await fill(dom.container);
  assert.equal(button(dom.container, submit).disabled, false);
  await act(async () => { button(dom.container, submit).click(); button(dom.container, submit).click(); });
  await until(() => writes.length === 1, 'upload dispatched');
  assert.equal(writes.length, 1);
  assert.equal(button(dom.container, 'Đang tải và kiểm tra…').disabled, true);
  const sent = JSON.parse((writes[0]!.body as FormData).get('metadata') as string);
  assert.equal(sent.contractVersion, 'automation-metric-capture-prepare-v1'); assert.equal(sent.expectedRevision, 7); assert.equal(sent.sourceContext, 'Synthetic context');
  sources = [entry];
  await act(async () => resolveUpload(json({ ...receipt, requestKey: sent.requestKey }, 201)));
  await until(() => dom.container.textContent?.includes('PREPARED_NOT_ADMITTED') ?? false, 'receipt shown');
  assert.match(dom.container.textContent!, /Đã lưu 50 dòng/); assert.match(dom.container.textContent!, /chưa được đưa vào báo cáo/);
  await until(() => dom.container.textContent?.includes('synthetic keyword') ?? false, 'inventory refreshed');
  assert.match(dom.container.textContent!, /danh sách bị cắt bớt/);
  assert.equal(writes.length, 1);
  assert.ok(calls.every(call => call.endsWith('/sources/metric-capture')), 'only capture inventory and capture upload were called');
});

test('server rejection is shown plainly and a new submit uses a fresh request key; lost response retries the identical request only on click', async t => {
  const forms: FormData[] = []; let mode: 'reject' | 'lose' | 'ok' = 'reject';
  const dom = await mount(t, (async (_url, init) => {
    if (init?.method !== 'POST') return json(inventory([]));
    forms.push(init.body as FormData);
    if (mode === 'reject') return json({ error: { message: 'Tệp kê khai không khớp bản ghi.' } }, 400);
    if (mode === 'lose') throw new Error('Response lost');
    return json({ ...receipt, requestKey: JSON.parse(forms.at(-1)!.get('metadata') as string).requestKey, exactRetry: true }, 200);
  }) as typeof fetch);
  const submit = 'Lưu bản ghi, chưa đưa vào báo cáo';
  await fill(dom.container);
  await act(async () => { button(dom.container, submit).click(); });
  await until(() => dom.container.textContent?.includes('Tệp kê khai không khớp bản ghi.') ?? false, 'rejection shown');
  assert.equal(button(dom.container, submit).disabled, false);
  mode = 'lose';
  await act(async () => { button(dom.container, submit).click(); });
  await until(() => dom.container.textContent?.includes('Chưa biết máy chủ đã lưu') ?? false, 'uncertain shown');
  assert.notEqual(JSON.parse(forms[0]!.get('metadata') as string).requestKey, JSON.parse(forms[1]!.get('metadata') as string).requestKey);
  mode = 'ok';
  await act(async () => { button(dom.container, 'Thử lại đúng lượt tải').click(); });
  await until(() => dom.container.textContent?.includes('lượt gửi trùng') ?? false, 'retry settled');
  assert.equal(forms[1]!.get('metadata'), forms[2]!.get('metadata'));
  assert.equal(forms.length, 3);
});

test('without an owner token the panel only lists stored captures', async t => {
  const dom = await mount(t, (async () => json(inventory())) as typeof fetch, null);
  assert.match(dom.container.textContent!, /synthetic keyword/); assert.match(dom.container.textContent!, /Mở khóa OWNER/);
  assert.equal(button(dom.container, 'Lưu bản ghi, chưa đưa vào báo cáo').disabled, true);
});
