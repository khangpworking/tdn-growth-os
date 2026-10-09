import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { act, createElement, StrictMode } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import { personaServiceFixture, personaConfiguration, personaOwner, personaFixtureResponse, PERSONA_WORKSPACE, PERSONA_RUN } from '../../tests/helpers/insight-persona-service-fixture';
import type { ResearchAutomationRun } from '../src/research-automation/api';
import type { PersonaModelRequest } from '../../contracts/analysis/automation-insight-persona.generated';
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); });
async function until(check: () => boolean, label: string) { for (let i = 0; i < 400 && !check(); i++) await settle(); assert.ok(check(), label); }
function button(root: ParentNode, label: string) { const item = [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === label); assert.ok(item, label); return item; }
const click = (root: ParentNode, label: string) => act(async () => button(root, label).click());
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
const START = 'Đề xuất bộ mã từ nguồn đã chọn', CONFIRM = 'Gọi model và lưu bước đề xuất', RETRY = 'Đọc lại hoặc thử lại đúng yêu cầu chân dung';
const CLASSIFY = 'Phân loại lô kế tiếp theo bộ mã đã chọn', SYNTHESIZE = 'Đề xuất thẻ và chân dung từ phân loại đã chọn';
const REPORT = 'Tạo báo cáo nháp từ đề xuất chân dung đã chọn';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });

async function mount(t: Parameters<typeof personaServiceFixture>[0], mode?: 'lost' | 'hold' | 'unknown') {
  const f = await personaServiceFixture(t), run = await f.service.getRun(PERSONA_WORKSPACE, PERSONA_RUN);
  const dom = setupDom(), original = globalThis.fetch, posts: { action: string; body: any; signal?: AbortSignal | null | undefined }[] = [];
  let calls = 0, reads = 0, owner: string | null = 'synthetic-only';
  const ai = { configuration: personaConfiguration, port: { async generateText({ userText }: { userText: string }) {
    calls++; return { text: JSON.stringify(personaFixtureResponse(JSON.parse(userText), f.context.source)) };
  } } };
  const pairs = [f.pair];
  globalThis.fetch = (async (url, init) => {
    const route = String(url), action = route.split('/').at(-1)!;
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posts.push({ action, body, signal: init.signal });
      assert.equal(new Headers(init.headers).get('authorization'), 'Bearer synthetic-only');
      if (action === 'report-revisions') return json({ attemptId: randomUUID(), attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202); // Report26 backend phase is not yet granted.
      assert.equal(action, 'insight-persona-model-proposals');
      if (mode === 'hold') await new Promise<void>((_, reject) => {
        if (init.signal?.aborted) reject(new DOMException('Synthetic abort', 'AbortError'));
        else init.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic abort', 'AbortError')));
      });
      if (mode === 'unknown') return json({ contractVersion: 'insight-persona-model-response-v1', status: 'DISPATCH_UNKNOWN', executionId: randomUUID(), code: 'TRANSPORT_OUTCOME_AMBIGUOUS' });
      const response = await f.service.proposePersonaModel(PERSONA_WORKSPACE, PERSONA_RUN, body as PersonaModelRequest, personaOwner, ai);
      if (mode === 'lost' && posts.length === 1) throw new Error('Synthetic response lost after settlement');
      return json(response, response.status === 'PROPOSED' ? 201 : 200);
    }
    reads++;
    if (route.includes('/insight-personas/')) return json(await f.service.listPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, action));
    if (route.includes('/insight-persona-evidence/')) return json(await f.service.readPersonaEvidence(PERSONA_WORKSPACE, PERSONA_RUN, action));
    if (action === 'report-versions') return json({ contractVersion: 'automation-report-version-list-v1', workspaceId: PERSONA_WORKSPACE, runId: PERSONA_RUN, versions: pairs });
    if (action === 'report-attempts') return json({ contractVersion: 'automation-report-attempt-list-v1', workspaceId: PERSONA_WORKSPACE, runId: PERSONA_RUN, attempts: [] });
    if (action === 'metric') return json({ contractVersion: 'automation-prepared-metric-list-v1', workspaceId: PERSONA_WORKSPACE, runId: PERSONA_RUN, sources: [] });
    if (action === 'supplemental') return json({ contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId: PERSONA_WORKSPACE, runId: PERSONA_RUN, packages: [] });
    throw new Error(`Unexpected synthetic route ${route}`);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Parent } = await tsImport('../src/research-automation/ReportVersionsPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReportVersionsPanel');
  const root = createRoot(dom.container);
  const render = () => act(async () => root.render(createElement(StrictMode, null, createElement(Parent, { run: run as ResearchAutomationRun, ownerToken: owner, writesAvailable: true }))));
  await render(); await until(() => Boolean(dom.container.querySelector('#ra-report-version')), 'versions loaded');
  await click(dom.container, 'Xem thẻ và chân dung đề xuất');
  await until(() => !button(dom.container, START).disabled, 'persona source loaded');
  return { ...dom, f, posts, pairs, calls: () => calls, reads: () => reads,
    lock: async () => { owner = null; await render(); }, render,
    unmount: () => act(async () => root.render(null)),
    cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); } };
}

test('actual parent StrictMode explicit stages/readback and selected pending report action; opening/history/confirm cancel never dispatch', { timeout: 90000 }, async t => {
  const dom = await mount(t);
  try {
    assert.equal(dom.container.querySelector('section[aria-labelledby="persona-title"] > p')?.textContent,
      'Chỉ dùng lời khách trên Shopee của nguồn đã lưu. Ngày từ nguồn chưa xác lập kỳ đo lường; chưa có thống kê độ tin cậy hoặc điều kiện đưa vào kết luận chính. Nội dung nguyên văn vẫn có thể chứa thông tin cá nhân.');
    assert.equal(dom.posts.length, 0); assert.equal(dom.calls(), 0);
    assert.equal(dom.container.querySelector<HTMLSelectElement>('[aria-label="Đề xuất chân dung đã lưu"]')!.value, '');
    await click(dom.container, START); assert.equal(dom.posts.length, 0);
    assert.equal(dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.disabled, true);
    assert.equal(button(dom.container, 'Duyệt gán mã Insight').disabled, true);
    await click(dialog(), 'Hủy'); assert.equal(dom.posts.length, 0);
    for (const step of [START, CLASSIFY, SYNTHESIZE]) {
      await click(dom.container, step); await click(dialog(), CONFIRM);
      await until(() => !dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.disabled, `settled ${step}`);
      assert.equal(dom.posts.length, [START, CLASSIFY, SYNTHESIZE].indexOf(step) + 1);
    }
    assert.equal(dom.calls(), 3);
    assert.deepEqual(dom.posts.map(post => post.body.stage), ['TAXONOMY', 'CLASSIFY', 'SYNTHESIZE']);
    assert.equal(dom.posts[1]!.body.previousProposalId !== null, true);
    assert.ok(dom.container.textContent?.includes('6/18 bản ghi trong mẫu — đề xuất, chờ chủ duyệt'));
    assert.ok(dom.container.textContent?.includes('I do not want')); assert.ok(!dom.container.textContent?.includes('PRIVATE_AUTHOR'));
    await click(dom.container, REPORT); await click(dialog(), 'Hủy'); assert.equal(dom.posts.length, 3);
    await click(dom.container, REPORT); await click(dialog(), 'Tạo bản nháp chân dung');
    await until(() => dom.posts.length === 4, 'explicit report posted');
    assert.equal(dom.posts[3]!.body.contractVersion, 'automation-insight-persona-report-revision-v1');
    assert.equal(dom.posts[3]!.body.personaInsight.binding.pairId, dom.f.pair.pairId);
    assert.equal(dom.posts[3]!.body.personaInsight.proposalId, dom.container.querySelector<HTMLSelectElement>('[aria-label="Đề xuất chân dung đã lưu"]')!.value);
    assert.ok(!('acceptedInsight' in dom.posts[3]!.body)); assert.equal(dom.calls(), 3);
  } finally { await dom.cleanup(); }
});

test('lost result holds actual parent busy gates; exact retry reads settled bytes without new call and next stage needs new confirmation', { timeout: 90000 }, async t => {
  const dom = await mount(t, 'lost');
  try {
    await click(dom.container, START); await click(dialog(), CONFIRM); await until(() => Boolean([...dom.container.querySelectorAll('button')].find(item => item.textContent === RETRY)), 'held old request');
    assert.equal(dom.calls(), 1); assert.equal(dom.posts.length, 1);
    assert.equal(dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.disabled, true);
    assert.equal(dom.container.querySelector<HTMLSelectElement>('#ra-revision-native')!.disabled, true);
    assert.equal(button(dom.container, 'Tạo phiên bản báo cáo bổ sung').disabled, true);
    await click(dom.container, RETRY); await until(() => !dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.disabled, 'exact replay readback');
    assert.deepEqual(dom.posts[1]!.body, dom.posts[0]!.body); assert.equal(dom.calls(), 1); assert.equal(dom.posts.length, 2);
    await click(dom.container, CLASSIFY); assert.equal(dom.posts.length, 2); await click(dialog(), 'Hủy');
  } finally { await dom.cleanup(); }
});

test('unknown dispatch never advances automatically; OWNER lock and StrictMode unmount abort pending transport without readback or stage continuation', { timeout: 90000 }, async t => {
  const unknown = await mount(t, 'unknown');
  try {
    await click(unknown.container, START); await click(dialog(), CONFIRM); await until(() => Boolean([...unknown.container.querySelectorAll('button')].find(item => item.textContent === RETRY)), 'unknown stopped');
    assert.equal(unknown.posts.length, 1); assert.equal(button(unknown.container, START).disabled, true);
    await click(unknown.container, 'Bỏ thao tác cục bộ đang chờ'); assert.equal(unknown.posts.length, 1);
    await unknown.lock(); assert.equal(button(unknown.container, START).disabled, true);
  } finally { await unknown.cleanup(); }
  const held = await mount(t, 'hold');
  try {
    await click(held.container, START); await click(dialog(), CONFIRM); await until(() => held.posts.length === 1, 'pending request');
    const reads = held.reads(); await held.lock(); await until(() => held.posts[0]!.signal?.aborted === true, 'OWNER lock abort'); await held.unmount(); await settle();
    assert.equal(held.posts[0]!.signal?.aborted, true); assert.equal(held.posts.length, 1); assert.equal(held.reads(), reads);
  } finally { await held.cleanup(); }
});


test('actual parent source KEEP and cross-pair gates prevent stale proposal selection from travelling to another version', { timeout: 90000 }, async t => {
  const dom = await mount(t);
  try {
    const native = dom.container.querySelector<HTMLSelectElement>('#ra-revision-native')!;
    await act(async () => { native.value = 'SKIP'; native.dispatchEvent(new window.Event('change', { bubbles: true })); });
    assert.equal(button(dom.container, START).disabled, true);
    await act(async () => { native.value = 'KEEP'; native.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await click(dom.container, START); await click(dialog(), CONFIRM);
    await until(() => !dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.disabled, 'first stage settled');
    assert.notEqual(dom.container.querySelector<HTMLSelectElement>('[aria-label="Đề xuất chân dung đã lưu"]')!.value, '');
    dom.pairs.push({ ...dom.f.pair, pairId: 'f'.repeat(64), versionNumber: 2, attemptId: randomUUID() });
    await click(dom.container, 'Tải lại lịch sử');
    await until(() => dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.options.length === 2, 'new pair shown');
    assert.equal(button(dom.container, CLASSIFY).disabled, true, 'old pair is historical after current pair changes');
    const select = dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!;
    await act(async () => { select.value = 'f'.repeat(64); select.dispatchEvent(new window.Event('change', { bubbles: true })); });
    await until(() => dom.container.querySelector<HTMLSelectElement>('[aria-label="Đề xuất chân dung đã lưu"]')!.value === '', 'new keyed panel has no implicit proposal');
    assert.equal(dom.posts.length, 1); assert.equal(dom.calls(), 1);
    assert.ok(![...dom.container.querySelectorAll('button')].some(item => item.textContent === REPORT));
  } finally { await dom.cleanup(); }
});
