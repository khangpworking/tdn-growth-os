import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import type { ResearchAutomationAutoRun, ResearchAutomationRun } from '../src/research-automation/api';
import { AUTORUN_DENY_LIST, AUTORUN_FALLBACK_TEXT, AUTORUN_PHASE_TEXT, AUTORUN_RETRY_LABEL, AUTORUN_STOP_TEXT, AUTORUN_CAPTURE_QUEUED_TEXT, autoRunLinksText, autoRunText } from '../src/research-automation/autorun-text';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token-1234567890-only';
const period = { startDate: '2026-09-01', endDate: '2026-09-30', dayCount: 30 };
const runWith = (autoRun?: ResearchAutomationAutoRun) => ({
  contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 3, status: 'AWAITING_SCOPE', country: 'VN', mode: 'CATEGORY', keyword: 'synthetic only',
  description: null, interview: {}, requestedPeriod: period, reports: ['MARKET'], definition: null,
  productCards: [], coverage: { requestedPeriod: period, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
  steps: [], blockers: [], ...(autoRun ? { autoRun } : {}), createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
}) as unknown as ResearchAutomationRun;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const nextTurn = () => act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 1)); });

async function mount(t: test.TestContext, run: ResearchAutomationRun, handler: typeof fetch, ownerToken: string | null = token) {
  const dom = setupDom(), prior = globalThis.fetch; globalThis.fetch = handler;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: Component } = await tsImport('../src/research-automation/AutoRunCard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  const events = { retried: 0, conflicts: 0 };
  const render = (value: ResearchAutomationRun) => act(async () => { root.render(createElement(Component, { workspaceId, run: value, ownerToken, writesAvailable: true, onRetried: () => { events.retried++; }, onConflict: () => { events.conflicts++; } })); });
  await render(run);
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = prior; dom.cleanup(); });
  return { dom, events, render };
}
const retryButton = (container: HTMLElement) => [...container.querySelectorAll('button')].find(button => button.textContent === AUTORUN_RETRY_LABEL);

test('every phase and stop code has plain text with no provider or tool name and no percentage', () => {
  const texts = [...Object.values(AUTORUN_PHASE_TEXT), ...Object.values(AUTORUN_STOP_TEXT), AUTORUN_FALLBACK_TEXT, AUTORUN_CAPTURE_QUEUED_TEXT, AUTORUN_RETRY_LABEL, autoRunLinksText(3)];
  for (const text of texts) {
    assert.ok(text.trim().length > 0);
    assert.equal(text.includes('%'), false, text);
    for (const word of AUTORUN_DENY_LIST) assert.equal(text.toLowerCase().includes(word.toLowerCase()), false, `${word} in ${text}`);
  }
  for (const phase of ['WAITING_SCOPE', 'CAPTURE', 'PREPARE', 'PICK', 'CONFIRM', 'WAIT_DRAFT', 'PRESENT', 'DONE'] as const) assert.equal(autoRunText({ phase, state: 'RUNNING', canRetry: false }), AUTORUN_PHASE_TEXT[phase]);
  assert.equal(autoRunText({ phase: 'CAPTURE', state: 'QUEUED', canRetry: false }), AUTORUN_CAPTURE_QUEUED_TEXT);
  assert.equal(autoRunText({ phase: 'STOPPED', state: 'QUEUED', stopCode: 'SOMETHING_NEW', canRetry: false }), AUTORUN_FALLBACK_TEXT);
  assert.equal(autoRunText({ phase: 'STOPPED', state: 'QUEUED', canRetry: false }), AUTORUN_FALLBACK_TEXT);
  assert.equal(autoRunLinksText(3), 'Chỉ tìm được 3/5 liên kết Shopee phù hợp.');
  assert.match(AUTORUN_RETRY_LABEL, /thêm một lượt tra cứu/);
});

test('card renders nothing without autoRun', async t => {
  const { dom } = await mount(t, runWith(), (async () => { throw new Error('no fetch expected'); }) as typeof fetch);
  assert.equal(dom.container.innerHTML, '');
});

test('Q2 row 5: DONE card describes only the Insight draft and preserves Market completion text', async t => {
  for (const reports of [['INSIGHT'], ['MARKET'], ['MARKET', 'INSIGHT']] as ('MARKET' | 'INSIGHT')[][]) await t.test(reports.join('+'), async st => {
    const run = { ...runWith({ phase: 'DONE', state: 'QUEUED', canRetry: false }), reports };
    const { dom } = await mount(st, run, async () => { throw new Error('rendering must not fetch'); });
    const text = dom.container.textContent!;
    assert.match(text, /Phần tự động đã xong: bản nháp/);
    if (reports.includes('MARKET')) {
      assert.ok(text.includes('Phần tự động đã xong: bản nháp, bìa và biểu đồ. Bản đọc để xem và duyệt nằm ở mục "Bản đọc" phía trên.'));
    } else {
      assert.doesNotMatch(text, /bìa|biểu đồ/iu);
      assert.ok(text.includes('Phần tự động đã xong: bản nháp. Bản đọc để xem và duyệt nằm ở mục "Bản đọc" phía trên.'));
    }
  });
});

test('retry button shows only when canRetry is true; no progress bar or percent', async t => {
  for (const autoRun of [
    { phase: 'CAPTURE', state: 'RUNNING', canRetry: false },
    { phase: 'STOPPED', state: 'QUEUED', stopCode: 'METRIC_CAPTCHA', canRetry: false },
    { phase: 'DONE', state: 'QUEUED', linksFound: 3, canRetry: false },
  ] as const) await t.test(autoRun.phase, async st => {
    const { dom } = await mount(st, runWith(autoRun), (async () => { throw new Error('no fetch expected'); }) as typeof fetch);
    assert.equal(retryButton(dom.container), undefined, autoRun.phase);
    assert.equal(dom.container.querySelector('progress'), null);
    assert.equal(dom.container.textContent!.includes('%'), false);
    if (autoRun.phase === 'DONE') assert.match(dom.container.textContent!, /3\/5 liên kết Shopee/);
  });
});

test('retry sends one owner POST with a request key and reports a conflict', async t => {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const { dom, events } = await mount(t, runWith({ phase: 'STOPPED', state: 'QUEUED', stopCode: 'TIMEOUT', canRetry: true }), (async (url, init) => {
    calls.push({ url: String(url), init });
    return json({ error: { code: 'invalid_state', message: 'Conflict' } }, 409);
  }) as typeof fetch);
  const button = retryButton(dom.container);
  assert.ok(button);
  assert.match(dom.container.textContent!, /Thử lại/);
  await act(async () => { button.click(); });
  for (let i = 0; i < 20 && events.conflicts === 0; i++) await nextTurn();
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.url, `/owner-api/workspaces/${workspaceId}/research-automation/runs/${runId}/auto-run/retry`);
  assert.equal(calls[0]!.init?.method, 'POST');
  assert.equal(new Headers(calls[0]!.init?.headers).get('Authorization'), `Bearer ${token}`);
  const body = JSON.parse(String(calls[0]!.init?.body));
  assert.equal(body.contractVersion, 'research-automation-autorun-retry-v1');
  assert.match(body.requestKey, /^[0-9a-f-]{36}$/);
  assert.equal(events.conflicts, 1); assert.equal(events.retried, 0);
});

test('a failed send reuses its key; a later stop after the retry was accepted gets a fresh key', async t => {
  const keys: string[] = [];
  const stopped = runWith({ phase: 'STOPPED', state: 'QUEUED', stopCode: 'TIMEOUT', canRetry: true });
  const { dom, render } = await mount(t, stopped, (async (_url, init) => {
    keys.push(JSON.parse(String(init?.body)).requestKey);
    return json({ error: { code: 'internal', message: 'Synthetic failure' } }, 500);
  }) as typeof fetch);
  const click = async () => {
    const before = keys.length;
    await act(async () => { retryButton(dom.container)!.click(); });
    for (let i = 0; i < 20 && (keys.length === before || retryButton(dom.container)?.disabled); i++) await nextTurn();
  };
  await click(); await click();
  assert.equal(keys.length, 2);
  assert.equal(keys[0], keys[1], 'an unanswered retry is resent with the same key');
  // The server accepted it after all: the capture is queued again, then stops again.
  await render(runWith({ phase: 'CAPTURE', state: 'QUEUED', canRetry: false }));
  await render(stopped);
  await click();
  assert.equal(keys.length, 3);
  assert.notEqual(keys[2], keys[0], 'a new stop needs a new key');
});

test('retry button is disabled without an owner token', async t => {
  const { dom } = await mount(t, runWith({ phase: 'STOPPED', state: 'QUEUED', stopCode: 'TIMEOUT', canRetry: true }), (async () => { throw new Error('no fetch expected'); }) as typeof fetch, null);
  assert.equal(retryButton(dom.container)?.disabled, true);
});
