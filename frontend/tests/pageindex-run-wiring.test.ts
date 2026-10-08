import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import type { ResearchAutomationRun, ResearchAutomationRunPdfStates, ResearchAutomationSourceStatus } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token-only';
const sha = 'a'.repeat(64);
const json = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const states = (documents: ResearchAutomationRunPdfStates['documents'] = []): ResearchAutomationRunPdfStates => ({
  contractVersion: 'research-automation-run-pdfs-v1', workspaceId, runId, paused: true, usageLimited: false, documents,
});
const period = { startDate: '2026-01-01', endDate: '2026-01-30', dayCount: 30 };
const run: ResearchAutomationRun = { contractVersion: 'research-automation-run-v1', workspaceId, runId, revision: 1,
  status: 'DRAFT_READY', country: 'VN', mode: 'CATEGORY', keyword: 'synthetic only', description: null, interview: {},
  requestedPeriod: period, reports: ['MARKET'], definition: null, productCards: [], coverage: { requestedPeriod: period, sources: [] },
  usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
  steps: ['QUICK_SEARCH', 'COLLECTION', 'REPORTS'].map(stepId => ({ stepId, state: 'SUCCEEDED', code: null, message: null, startedAt: null, finishedAt: null })) as ResearchAutomationRun['steps'], blockers: [],
  createdAt: '2026-01-31T00:00:00.000Z', updatedAt: '2026-01-31T00:00:00.000Z' };

// These protect mounted owner controls and response identity, which module upload tests cannot observe.
test('run progress refreshes an initially empty PDF inventory and displays PDFs retained before the terminal draft', async t => {
  const dom = setupDom(); const priorFetch = globalThis.fetch;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: RunView } = await tsImport('../src/research-automation/RunView.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  const priorTimeout = window.setTimeout; const priorClear = window.clearTimeout;
  const timers = new Map<number, () => void>(); let nextTimer = 0;
  window.setTimeout = ((callback: () => void) => { const id = ++nextTimer; timers.set(id, callback); return id; }) as typeof window.setTimeout;
  window.clearTimeout = (id: number | undefined) => { if (id !== undefined) timers.delete(id); };
  let currentRun: ResearchAutomationRun = { ...run, revision: 2, status: 'COLLECTING' };
  let pdfReads = 0; const signals: AbortSignal[] = [];
  globalThis.fetch = (async (url, init) => {
    assert.equal(init?.method ?? 'GET', 'GET', 'Run advancement must never upload, query or recheck a provider');
    if (String(url).endsWith('/pageindex')) {
      pdfReads++; signals.push(init!.signal as AbortSignal);
      return json({ ...states(currentRun.status === 'DRAFT_READY' ? [{ fileName: 'collected-evidence.pdf', sourceSha256: sha, state: 'READY', cloudDocId: null }] : []), paused: false });
    }
    if (String(url).endsWith('/reader-reports')) return json({ contractVersion: 'reader-report-list-v1', workspaceId, runId, revisions: [] });
    return json(currentRun);
  }) as typeof fetch;
  t.after(async () => {
    await act(async () => root.unmount()); globalThis.fetch = priorFetch;
    window.setTimeout = priorTimeout; window.clearTimeout = priorClear; dom.cleanup();
  });
  const advance = async () => act(async () => {
    const timer = timers.entries().next().value; assert.ok(timer, 'An active run schedules its next read');
    timers.delete(timer[0]); timer[1]();
  });
  await act(async () => root.render(createElement(RunView, { workspaceId, runId, ownerToken: null, writesAvailable: false, notify: () => {}, onStatusChange: () => {} })));
  assert.equal(pdfReads, 1);
  currentRun = { ...currentRun, revision: 3, status: 'RENDERING' };
  await advance();
  assert.equal(pdfReads, 2, 'Advancing the parent run refreshes an inventory that previously had no PDFs');
  assert.equal(signals[0]!.aborted, true, 'Run advancement cancels the preceding inventory scope');
  currentRun = { ...currentRun, revision: 4, status: 'DRAFT_READY' };
  await advance();
  assert.equal(pdfReads, 3, 'The terminal run snapshot gets a final inventory refresh');
  assert.match(dom.container.textContent!, /collected-evidence.pdf.*Sẵn sàng/);
  assert.equal(timers.size, 0, 'A terminal run with READY PDFs performs no further polling');
  await act(async () => root.unmount());
  assert.equal(signals.at(-1)!.aborted, true, 'Unmount cancels the last inventory scope');
});

test('real run page loads PDF states, makes one explicit bounded attachment, and hides cloud identifiers', { timeout: 10_000 }, async t => {
  const dom = setupDom(); const prior = globalThis.fetch;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: RunView } = await tsImport('../src/research-automation/RunView.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  const posts: { url: string; init: RequestInit }[] = []; let inventory = states();
  let acknowledge!: () => void; const submitted = new Promise<void>(resolve => { acknowledge = resolve; });
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') {
      posts.push({ url: String(url), init });
      const form = init.body as FormData;
      assert.equal((form.get('pdf') as File).name, 'evidence.pdf');
      assert.deepEqual(JSON.parse(form.get('metadata') as string), { contractVersion: 'research-automation-pdf-attach-v1', fileName: 'evidence.pdf' });
      inventory = states([{ fileName: 'evidence.pdf', sourceSha256: createHash('sha256').update(await (form.get('pdf') as File).arrayBuffer().then(bytes => Buffer.from(bytes))).digest('hex'), state: 'READY', cloudDocId: 'private-cloud-id' }]);
      acknowledge();
      return json(inventory);
    }
    if (String(url).endsWith('/reader-reports')) return json({ contractVersion: 'reader-report-list-v1', workspaceId, runId, revisions: [] });
    return json(String(url).endsWith('/pageindex') ? inventory : run);
  }) as typeof fetch;
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = prior; dom.cleanup(); });
  await act(async () => root.render(createElement(RunView, { workspaceId, runId, ownerToken: token, writesAvailable: true, notify: () => {}, onStatusChange: () => {} })));
  assert.ok(dom.container.querySelector('#ra-run-pdf'), 'PDF intake is mounted on the actual run page');
  assert.match(dom.container.textContent!, /Đã tạm dừng gửi PDF mới\. Kiểm tra kết nối/);
  assert.equal(posts.length, 0, 'Reading states never sends a PDF');
  const field = dom.container.querySelector<HTMLInputElement>('#ra-run-pdf')!;
  Object.defineProperty(field, 'files', { configurable: true, value: [new File(['%PDF-1.7\nsynthetic'], 'evidence.pdf', { type: 'application/pdf' })] });
  await act(async () => field.dispatchEvent(new dom.container.ownerDocument.defaultView!.Event('change', { bubbles: true })));
  const attach = [...dom.container.querySelectorAll('button')].find(item => item.textContent === 'Đính kèm PDF')!;
  await act(async () => { attach.click(); attach.click(); await submitted; });
  assert.equal(posts.length, 1, 'A double click cannot duplicate the upload');
  assert.ok(posts[0]!.url.endsWith(`/runs/${runId}/source-pdfs`));
  assert.equal((posts[0]!.init.headers as Record<string, string>).Authorization, `Bearer ${token}`);
  assert.match(dom.container.textContent!, /evidence.pdf.*Sẵn sàng/);
  assert.equal(dom.container.textContent!.includes('private-cloud-id'), false);
  assert.equal(dom.container.textContent!.includes('PageIndex'), false, 'Run notice uses source-neutral owner copy');
});

test('PDF transport rejects an invalid file before POST and rejects another run or duplicate SHA in the response', async t => {
  const api = await tsImport('../src/research-automation/api.ts', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/api');
  const prior = globalThis.fetch; t.after(() => { globalThis.fetch = prior; });
  let calls = 0; let response: unknown = { ...states(), runId: workspaceId };
  globalThis.fetch = (async () => { calls++; return json(response); }) as typeof fetch;
  await assert.rejects(api.attachRunPdf(workspaceId, runId, new File(['x'], '../outside.pdf'), token), /Chọn một PDF/);
  assert.equal(calls, 0);
  await assert.rejects(api.loadRunPdfs(workspaceId, runId, new AbortController().signal), /không thuộc phiên/);
  const document = { fileName: 'same.pdf', sourceSha256: sha, state: 'READY' as const, cloudDocId: null };
  response = states([document, document]);
  await assert.rejects(api.loadRunPdfs(workspaceId, runId, new AbortController().signal), /không thuộc phiên/);
  response = states([document]);
  await assert.rejects(api.attachRunPdf(workspaceId, runId, new File(['%PDF-1.7\nsynthetic'], 'valid.PDF'), token), /không chứa đúng tệp/);
});

test('a late free recheck cannot overwrite a different workspace or keep its button disabled', async t => {
  const dom = setupDom(); const prior = globalThis.fetch;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: SourceStatusBoard } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  const secondWorkspace = '33333333-3333-4333-8333-333333333333';
  const status = (workspaceId: string, documentsSent: number): ResearchAutomationSourceStatus => ({
    contractVersion: 'research-automation-source-status-v1', workspaceId, checkedAt: '2026-01-31T00:00:00.000Z', executorEnabled: true,
    sources: [{ source: 'PAGEINDEX', state: 'READY', credential: 'CONFIGURED', wiredIntoRuns: true, paid: true,
      dataCount: documentsSent, lastDataAt: null, lastUsageAt: null, pageindex: { automaticState: 'INDEXING_PDFS', documentsSent,
        activePages: documentsSent, balanceMicroDollars: 9_000_000, balanceCheckedAt: null, billingUrl: null,
        estimatedMonthlyCostMicroDollars: 0, usageLimited: false } }],
  });
  let finish!: (response: Response) => void; let signal: AbortSignal | undefined;
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') { signal = init.signal as AbortSignal; return new Promise<Response>(resolve => { finish = resolve; }); }
    return json(String(url).includes(secondWorkspace) ? status(secondWorkspace, 7) : status(workspaceId, 1));
  }) as typeof fetch;
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = prior; dom.cleanup(); });
  const render = (workspaceId: string) => act(async () => root.render(createElement(SourceStatusBoard, { mode: 'real', workspaceId, ownerToken: token, writesAvailable: true })));
  const button = () => [...dom.container.querySelectorAll('button')].find(item => item.textContent === 'Kiểm tra lại PDF');
  await render(workspaceId);
  await act(async () => button()!.click());
  await render(secondWorkspace);
  assert.equal(signal!.aborted, true);
  assert.equal(button()!.disabled, false);
  await act(async () => finish(json(status(workspaceId, 99))));
  assert.match(dom.container.querySelector('[data-source="PAGEINDEX"]')!.textContent!, /7 tài liệu/);
  assert.equal(dom.container.textContent!.includes('99 tài liệu'), false);
});

test('PageIndex card recheck is an owner action, refreshes unknown data, and cannot duplicate or run in demo', async t => {
  const dom = setupDom(); const prior = globalThis.fetch;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: SourceStatusBoard } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  const status: ResearchAutomationSourceStatus = { contractVersion: 'research-automation-source-status-v1', workspaceId,
    checkedAt: '2026-01-31T00:00:00.000Z', executorEnabled: true, sources: [{ source: 'PAGEINDEX', state: 'READY', credential: 'CONFIGURED',
      wiredIntoRuns: true, paid: true, lastDataAt: null, lastUsageAt: null, dataCount: null,
      pageindex: { automaticState: 'PAUSED_LOW_BALANCE', documentsSent: null, activePages: null, balanceMicroDollars: null,
        balanceCheckedAt: null, billingUrl: null, estimatedMonthlyCostMicroDollars: null, usageLimited: true } }] };
  const posts: string[] = []; let gets = 0;
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') {
      posts.push(String(url)); assert.equal(init.body, '{}');
      assert.equal((init.headers as Record<string, string>).Authorization, `Bearer ${token}`);
      return json(status);
    }
    gets++; return json(status);
  }) as typeof fetch;
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = prior; dom.cleanup(); });
  const render = async (mode: 'real' | 'demo', ownerToken: string | null) => act(async () => root.render(createElement(SourceStatusBoard, { mode, workspaceId, ownerToken, writesAvailable: true })));
  await render('real', null);
  const button = () => [...dom.container.querySelectorAll('button')].find(item => item.textContent === 'Kiểm tra lại PDF')!;
  assert.equal(button().disabled, true);
  assert.match(dom.container.querySelector('[data-source="PAGEINDEX"]')!.textContent!, /Chưa rõ/);
  assert.match(dom.container.querySelector('[role="alert"]')!.textContent!, /PageIndex báo đã hết số dư/);
  await render('real', token);
  await act(async () => { button().click(); button().click(); });
  assert.deepEqual(posts, [`/owner-api/workspaces/${workspaceId}/research-automation/source-status/pageindex/recheck`]);
  const priorGets = gets; await render('demo', token);
  assert.equal(gets, priorGets); assert.equal(dom.container.querySelector('[data-source="PAGEINDEX"]'), null);
});
