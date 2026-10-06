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
import { loadPreparedMetricSources, prepareMetricSource, ResearchAutomationError } from '../src/research-automation/api';
import type { ResearchAutomationMetricPrepareRequest } from '../src/research-automation/api';

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

// UI owns the distinction between source requests, AI lifecycle counts and
// unknown billing; execution-state correctness is tested at the service boundary.
test('run inspector keeps AI activity separate from source requests and never displays unknown billing as zero', async () => {
  const dom = setupDom(); const originalFetch = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: RunView } = await tsImport('../src/research-automation/RunView.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/RunView');
  const root = createRoot(dom.container);
  let response: ResearchAutomationRun = { ...successfulRun(), status: 'FAILED',
    usage: { entries: [], requestCount: 7, knownCosts: [], hasUnknownCost: true },
    aiActivity: { i14: { states: { prepared: 1, dispatching: 2, completed: 3, dispatchUnknown: 4 },
      outcomes: { valid: 2, invalid: 1 }, billing: { state: 'UNKNOWN' } } },
  };
  let requests = 0;
  globalThis.fetch = (async (url, init) => {
    assert.notEqual(init?.method, 'POST');
    if (String(url).endsWith('/report-versions')) return new Response(JSON.stringify({ contractVersion: 'automation-report-version-list-v1', workspaceId, runId, versions: [] }));
    if (String(url).endsWith('/report-attempts')) return new Response(JSON.stringify({ contractVersion: 'automation-report-attempt-list-v1', workspaceId, runId, attempts: [] }));
    requests++;
    return new Response(JSON.stringify(response));
  }) as typeof fetch;
  const render = async (key: string) => act(async () => root.render(createElement(RunView, {
    key, workspaceId, runId, ownerToken: null, writesAvailable: false, notify: () => {}, onStatusChange: () => {},
  })));
  const value = (label: string) => [...document.querySelectorAll('.ra-inspector dt')]
    .find(node => node.textContent === label)?.nextElementSibling?.textContent;
  try {
    await render('mixed');
    assert.equal(value('Lượt gọi thu nguồn'), '7');
    assert.equal(value('Đã chuẩn bị, chưa bắt đầu gửi'), '1');
    assert.equal(value('Đang xử lý'), '2');
    assert.equal(value('Đã xử lý phản hồi'), '3');
    assert.equal(value('Phản hồi qua kiểm tra máy'), '2');
    assert.equal(value('Phản hồi không đạt kiểm tra'), '1');
    assert.equal(value('Chưa rõ kết quả gửi'), '4');
    assert.equal(value('Chi phí AI'), 'Chưa có số liệu xác nhận');
    assert.match(document.querySelector('.ra-inspector')!.textContent!, /không phải số lượt được tính tiền/);
    response = { ...response, aiActivity: { i14: { states: { prepared: 1, dispatching: 0, completed: 0, dispatchUnknown: 0 },
      outcomes: { valid: 0, invalid: 0 }, billing: { state: 'NOT_DISPATCHED' } } } };
    await render('prepared');
    assert.equal(value('Chi phí AI'), 'Chưa bắt đầu gửi yêu cầu');
    const { aiActivity: _omitted, ...legacy } = response; response = legacy;
    await render('legacy');
    assert.equal(value('Chi phí AI'), undefined);
    assert.match(document.querySelector('.ra-inspector')!.textContent!, /Chưa có thống kê hoạt động AI/);
    assert.equal(requests, 3, 'Inspecting activity must only load authoritative state');
    response = { ...response, status: 'DRAFT_READY', aiActivity: { i14: {
      states: { prepared: 0, dispatching: 0, completed: 1, dispatchUnknown: 0 },
      outcomes: { valid: 1, invalid: 0 }, billing: { state: 'UNKNOWN' },
    } } };
    await render('revisions');
    assert.equal(value('Đã xử lý phản hồi'), '1');
    const beforeRefresh = requests;
    response = { ...response, aiActivity: { i14: { ...response.aiActivity!.i14!,
      states: { prepared: 0, dispatching: 0, completed: 2, dispatchUnknown: 0 }, outcomes: { valid: 2, invalid: 0 },
    } } };
    const refresh = [...document.querySelectorAll('button')].find(item => item.textContent === 'Tải lại lịch sử');
    assert.ok(refresh);
    await act(async () => refresh.click());
    assert.equal(value('Đã xử lý phản hồi'), '2', 'Reading supplemental progress also refreshes cumulative AI activity');
    assert.equal(requests, beforeRefresh + 1, 'One history refresh must not start a recursive read loop');
    response = { ...response, status: 'FAILED', aiActivity: {
      m11: { states: { prepared: 0, dispatching: 0, completed: 1, dispatchUnknown: 0 }, outcomes: { valid: 0, invalid: 1 }, billing: { state: 'UNKNOWN' } },
      m12: { states: { prepared: 0, dispatching: 0, completed: 0, dispatchUnknown: 1 }, outcomes: { valid: 0, invalid: 0 }, billing: { state: 'UNKNOWN' } },
      i15: { states: { prepared: 1, dispatching: 0, completed: 0, dispatchUnknown: 0 }, outcomes: { valid: 0, invalid: 0 }, billing: { state: 'NOT_DISPATCHED' } },
    } };
    await render('decision-only');
    const details = [...document.querySelectorAll<HTMLDetailsElement>('.ra-inspector details')];
    assert.deepEqual(details.map(node => node.querySelector('summary')?.textContent), ['M11 · Cơ hội', 'M12 · Hành động', 'I15 · Định hướng chiến lược']);
    const sectionValue = (index: number, label: string) => [...details[index]!.querySelectorAll('dt')]
      .find(node => node.textContent === label)?.nextElementSibling?.textContent;
    assert.equal(sectionValue(0, 'Phản hồi không đạt kiểm tra'), '1');
    assert.equal(sectionValue(1, 'Chưa rõ kết quả gửi'), '1');
    assert.equal(sectionValue(2, 'Chi phí AI'), 'Chưa bắt đầu gửi yêu cầu');
    assert.match(document.querySelector('.ra-inspector')!.textContent!, /không phải số lượt được tính tiền hay số mục đã hoàn tất/);
    await act(async () => details[1]!.querySelector('summary')!.click());
    assert.equal(details[1]!.open, true);
    await act(async () => details[1]!.querySelector('summary')!.click());
    assert.equal(details[1]!.open, false);
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});

function metricRequest(): ResearchAutomationMetricPrepareRequest {
  return { contractVersion: 'automation-metric-prepare-v1', requestKey: '33333333-3333-4333-8333-333333333333', expectedRevision: 1,
    scope: { definition: 'Đồ chơi gỗ', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    sourceLabel: 'Tệp mẫu do người dùng cung cấp', sourceContext: 'Không phải thu thập từ nhà cung cấp',
    measurementPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', basis: 'Ngày hiển thị trên tệp mẫu' },
    acquiredAt: null, selection: 'UNSPECIFIED', precision: { revenue: 'unknown', units: 'unknown' } };
}

test('prepared-source client delivers the exact multipart snapshot and rejects a receipt for another request', async () => {
  const originalFetch = globalThis.fetch;
  const metadata = metricRequest();
  const workbook = new File([new Uint8Array([1, 2, 3])], 'original.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const receipt = { contractVersion: 'automation-metric-prepared-v1', requestKey: metadata.requestKey, packageId: '44444444-4444-4444-8444-444444444444',
    state: 'PREPARED_NOT_ADMITTED', exactRetry: false, recordCount: 1, sourceLabel: metadata.sourceLabel,
    measurementPeriod: metadata.measurementPeriod, acquiredAt: null, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' };
  let calls = 0;
  let mismatch = false;
  globalThis.fetch = (async (url, init) => {
    calls++;
    assert.equal(url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric`);
    assert.equal(new Headers(init?.headers).get('Content-Type'), null, 'browser owns the multipart boundary');
    assert.equal(new Headers(init?.headers).get('Authorization'), `Bearer ${token}`);
    assert.equal(init?.credentials, 'omit');
    assert.equal(init?.redirect, 'error');
    const form = init?.body as FormData;
    assert.deepEqual(JSON.parse(String(form.get('metadata'))), metadata);
    const sent = form.get('workbook') as File;
    assert.equal(sent.name, workbook.name);
    assert.deepEqual(new Uint8Array(await sent.arrayBuffer()), new Uint8Array([1, 2, 3]));
    return new Response(JSON.stringify({ ...receipt, ...(mismatch ? { requestKey: '55555555-5555-4555-8555-555555555555' } : {}) }), { status: 201 });
  }) as typeof fetch;
  try {
    assert.deepEqual(await prepareMetricSource(workspaceId, runId, metadata, workbook, token), receipt);
    mismatch = true;
    await assert.rejects(prepareMetricSource(workspaceId, runId, metadata, workbook, token), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
    assert.equal(calls, 2, 'a rejected response never triggers an automatic retry');
  } finally { globalThis.fetch = originalFetch; }
});

test('prepared-source reload verifies run identity, closed entries and integrity errors without an OWNER write', async () => {
  const originalFetch = globalThis.fetch;
  const list = { contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId,
    sources: [{ packageId: '44444444-4444-4444-8444-444444444444', recordCount: 1, request: metricRequest(), provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' }] };
  let response = new Response(JSON.stringify(list), { status: 200 });
  globalThis.fetch = (async (url, init) => {
    assert.equal(url, `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/sources/metric`);
    assert.equal(new Headers(init?.headers).get('Authorization'), null);
    assert.equal(init?.body, undefined);
    assert.notEqual(init?.method, 'POST');
    return response;
  }) as typeof fetch;
  const load = () => loadPreparedMetricSources(workspaceId, runId, new AbortController().signal);
  const rejected = () => assert.rejects(load(), error => error instanceof ResearchAutomationError && error.kind === 'integrity');
  try {
    assert.deepEqual(await load(), list);
    response = new Response(JSON.stringify({ ...list, runId: '55555555-5555-4555-8555-555555555555' }), { status: 200 }); await rejected();
    response = new Response(JSON.stringify({ ...list, sources: [list.sources[0], list.sources[0]] }), { status: 200 }); await rejected();
    response = new Response(JSON.stringify({ ...list, sources: [{ ...list.sources[0], internalPath: '/private/source' }] }), { status: 200 }); await rejected();
    response = new Response(JSON.stringify({ error: { code: 'INTEGRITY_ERROR', message: 'Không xác minh được nguồn.' } }), { status: 500 }); await rejected();
  } finally { globalThis.fetch = originalFetch; }
});

test('scope upload holds edits and confirmation, retries the same snapshot, and admits a compatible source only after explicit selection', async () => {
  const dom = setupDom(); const originalFetch = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: ScopeConfirm } = await tsImport('../src/research-automation/ScopeConfirm.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ScopeConfirm');
  const root = createRoot(dom.container);
  const uploads: { request: ResearchAutomationMetricPrepareRequest; file: File }[] = [];
  const sources: Record<string, unknown>[] = []; const confirmations: Record<string, unknown>[] = [];
  let resolveUpload!: (response: Response) => void; let rejectUpload!: (error: Error) => void;
  const first = new Promise<Response>((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject; });
  let receipt: Record<string, unknown>;
  const packageId = '44444444-4444-4444-8444-444444444444';
  globalThis.fetch = (async (url, init) => {
    if (String(url).startsWith('/api')) return new Response(JSON.stringify({ contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId, sources }), { status: 200 });
    if (String(url).endsWith('/sources/metric')) {
      const form = init?.body as FormData; const request = JSON.parse(String(form.get('metadata'))) as ResearchAutomationMetricPrepareRequest;
      uploads.push({ request, file: form.get('workbook') as File });
      if (uploads.length === 1) return first;
      receipt = { contractVersion: 'automation-metric-prepared-v1', requestKey: request.requestKey, packageId, state: 'PREPARED_NOT_ADMITTED', exactRetry: true,
        recordCount: 2, sourceLabel: request.sourceLabel, measurementPeriod: request.measurementPeriod, acquiredAt: null, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' };
      sources.push({ packageId, recordCount: 2, request, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' });
      return new Response(JSON.stringify(receipt), { status: 200 });
    }
    confirmations.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(successfulReceipt(), { status: 202 });
  }) as typeof fetch;
  const click = async (text: string) => {
    const button = [...document.querySelectorAll('button')].find(item => item.textContent === text); assert.ok(button, text);
    await act(async () => button.click());
  };
  const change = async (id: string, value: string) => {
    const field = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement; assert.ok(field, id);
    const prototype = field.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : field.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
    await act(async () => {
      Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
      field.dispatchEvent(new window.Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
    });
  };
  try {
    await act(async () => root.render(createElement(ScopeConfirm, { run: { ...successfulRun(), status: 'AWAITING_SCOPE' }, ownerToken: token, writesAvailable: true, onConfirmed: () => undefined, onConflict: () => assert.fail('unexpected conflict') })));
    await change('ra-definition', 'Đồ chơi gỗ'); await click('Không cái nào giống ý tôi');
    const file = new File([new Uint8Array([4, 5, 6])], 'kept-original.xlsx');
    const fileField = document.getElementById('ra-metric-file') as HTMLInputElement;
    Object.defineProperty(fileField, 'files', { configurable: true, value: [file] });
    await act(async () => fileField.dispatchEvent(new window.Event('change', { bubbles: true })));
    await change('ra-metric-label', 'Nguồn mẫu'); await change('ra-metric-context', 'Tệp mẫu tổng hợp');
    await change('ra-metric-start', '2025-10-03'); await change('ra-metric-end', '2026-10-02'); await change('ra-metric-basis', 'Kỳ ghi trên tệp mẫu');
    await click('Lưu nguồn, chưa đưa vào báo cáo');
    assert.equal((document.getElementById('ra-definition') as HTMLTextAreaElement).disabled, true);
    assert.equal([...document.querySelectorAll('button')].find(button => button.textContent === 'Duyệt định nghĩa')!.disabled, true);
    assert.equal(confirmations.length, 0);
    await act(async () => { rejectUpload(new TypeError('synthetic connection loss')); await Promise.resolve(); });
    assert.match(dom.container.textContent ?? '', /Chưa biết máy chủ đã lưu/);
    await click('Thử lại đúng lượt tải');
    assert.deepEqual(uploads[1]!.request, uploads[0]!.request);
    assert.deepEqual(await uploads[1]!.file.arrayBuffer(), await uploads[0]!.file.arrayBuffer());
    assert.equal((document.getElementById('ra-metric-choice') as HTMLSelectElement).value, 'ABSENT');
    assert.match(dom.container.textContent ?? '', /Tệp chưa được chọn/);
    await change('ra-metric-choice', packageId);
    await change('ra-definition', 'Phạm vi khác');
    assert.match(dom.container.textContent ?? '', /không khớp phạm vi/);
    assert.equal([...document.querySelectorAll('button')].find(button => button.textContent === 'Duyệt định nghĩa')!.disabled, true);
    await change('ra-definition', 'Đồ chơi gỗ'); await change('ra-native-review', 'SKIP');
    await click('Duyệt định nghĩa'); assert.equal(confirmations.length, 0);
    await click('Xác nhận và bắt đầu');
    assert.equal(confirmations.length, 1);
    assert.deepEqual(confirmations[0]!.sources, { metric: { decision: 'USE_PREPARED', packageId }, nativeReview: 'SKIP' });
  } finally { resolveUpload?.(new Response('{}')); await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});

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
  globalThis.fetch = (async (url, init) => {
    if (String(url).endsWith('/sources/metric')) return new Response(JSON.stringify({ contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId, sources: [] }), { status: 200 });
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
    assert.equal(bodies[0]?.contractVersion, 'research-automation-confirm-v2');
    assert.deepEqual(bodies[0]?.sources, { metric: { decision: 'ABSENT' }, nativeReview: 'AUTO_REUSE' });
    assert.equal(confirmed, 1);
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});
