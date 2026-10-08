import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, StrictMode } from 'react';
import { tsImport } from 'tsx/esm/api';
import { locatedInsightFixture } from '../../tests/helpers/located-insight-fixture';
import { sourceDefaultInsightRules } from '../../src/modules/analysis/research-automation/insight-default-coding';
import { setupDom } from './dom';
import type { ResearchAutomationRun } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111', runId = '22222222-2222-4222-8222-222222222222', pairId = 'a'.repeat(64);
const binding = { workspaceId, runId, pairId, scopeSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64), sourceKind: 'NATIVE', sourcePackageSha256: 'd'.repeat(64), inputSha256: 'e'.repeat(64) };
const run = { workspaceId, runId, revision: 4, definition: { definition: 'Nguồn mẫu thử' }, requestedPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 } } as ResearchAutomationRun;
const id = (n: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000001`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const blank = () => ({ i02: [], i04: [], i05: [], i07: [], i08: [], i06: [], i09: [], i13Mentions: [], corpora: [] });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const button = (root: Element, label: string) => {
  const found = [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === label);
  assert.ok(found, `missing ${label}`); return found;
};
const click = (root: Element, label: string) => act(async () => button(root, label).click());
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
async function until(check: () => boolean, label: string) {
  for (let i = 0; i < 400 && !check(); i++) await settle();
  assert.ok(check(), `timed out ${label}`);
}
const START = 'Tạo đề xuất AI mặc định', CONFIRM = 'Gọi model và lưu đề xuất', RETRY = 'Thử lại đúng yêu cầu mặc định';
const REPORT = 'Tạo báo cáo nháp từ đề xuất mặc định đã chọn';

type Step = 'lose' | 'mismatch' | 'hold' | 'unknown';
function server(size = 150, step?: Step) {
  const input = locatedInsightFixture();
  input.records = Array.from({ length: size }, (_, index) => ({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`,
    text: 'Tôi mở app.', sourceAttribution: 'Nguồn mẫu thử', timeText: null, disposition: 'INCLUDED' as const, dispositionReason: null }));
  input.corpora = []; for (const family of Object.keys(blank())) Object.assign(input, { [family]: [] });
  const rules = sourceDefaultInsightRules(input), evidence: any[] = [], posts: { action: string; body: any; signal?: AbortSignal | null }[] = [];
  const created = new Map<string, any>(); let calls = 0, reads = 0, mismatch = false;
  const fetcher = (async (url, init) => {
    const action = String(url).split('/').at(-1)!;
    if (init?.method !== 'POST') {
      reads++;
      const copied = structuredClone(evidence);
      if (mismatch) { copied.at(-1)!.request.recordIndexes = [149]; mismatch = false; }
      return json({ contractVersion: evidence.length ? 'insight-coding-view-v2' : 'insight-coding-view-v1', context: { binding, input }, evidence: copied });
    }
    const body = JSON.parse(String(init.body)); posts.push({ action, body, signal: init.signal });
    assert.equal((init.headers as Record<string, string>).Authorization, 'Bearer synthetic-only');
    if (action === 'report-revisions') return json({ attemptId: id(99), attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
    assert.equal(action, 'insight-coding-default-model-proposals');
    if (step === 'hold' && posts.length === 1) await new Promise<void>((_, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic abort', 'AbortError'))));
    if (step === 'unknown') { calls++; return json({ contractVersion: 'insight-model-response-v1', status: 'DISPATCH_UNKNOWN', executionId: id(80), code: 'TRANSPORT_OUTCOME_AMBIGUOUS' }); }
    const prior = created.get(body.requestKey);
    if (prior) return json({ contractVersion: 'insight-model-response-v1', status: 'PROPOSED', executionId: id(80), proposal: { contractVersion: 'insight-coding-mutation-v1', kind: 'PROPOSAL', evidenceId: prior.evidenceId, exactRetry: true } });
    calls++;
    if (body.defaultRuleId === null) evidence.push({ evidenceId: id(10), kind: 'DEFAULT_RULE', sequence: 1, binding, createdAt: '2026-10-08T00:00:00.000Z', sha256: 'f'.repeat(64),
      request: { contractVersion: 'insight-coding-default-rule-v1', kind: 'DEFAULT_RULE', status: 'PROPOSED', requestKey: id(11), originatingRequestKey: body.requestKey, binding, policyVersion: 'source-default-coding-v1', rules } });
    const sequence = evidence.filter(item => item.kind === 'PROPOSAL').length + 1;
    const proposal = { evidenceId: id(sequence + 20), kind: 'PROPOSAL', sequence, binding, createdAt: '2026-10-08T00:00:00.000Z', sha256: String(sequence).repeat(64),
      request: { contractVersion: 'insight-coding-default-propose-v1', status: 'PROPOSED', requestKey: body.requestKey, defaultRuleId: id(10), defaultRuleSha256: 'f'.repeat(64),
        previousProposalId: body.previousProposalId, previousProposalSha256: body.previousProposalSha256, executionId: id(80), recordIndexes: body.recordIndexes, rules,
        codebookSha256: 'f'.repeat(64), annotations: blank() } };
    evidence.push(proposal); created.set(body.requestKey, proposal);
    if (posts.length === 1 && step === 'lose') throw new TypeError('Synthetic lost response');
    if (posts.length === 1 && step === 'mismatch') mismatch = true;
    return json({ contractVersion: 'insight-model-response-v1', status: 'PROPOSED', executionId: id(80), proposal: { contractVersion: 'insight-coding-mutation-v1', kind: 'PROPOSAL', evidenceId: proposal.evidenceId, exactRetry: false } }, 201);
  }) as typeof fetch;
  return { fetcher, evidence, posts, calls: () => calls, reads: () => reads };
}
async function mount(api: ReturnType<typeof server>, strict = false) {
  const dom = setupDom(), original = globalThis.fetch; globalThis.fetch = api.fetcher;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/InsightCodingPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCodingPanel');
  const root = createRoot(dom.container); let busy = false, activity = 0;
  await act(async () => root.render(createElement(strict ? StrictMode : 'div', null, createElement(Panel, { run, pairId, versionNumber: 1, ownerToken: 'synthetic-only', disabled: false, reportBlock: null,
    onBusyChanged: (value: boolean) => { busy = value; }, onActivityChanged: () => { activity++; } }))));
  await until(() => Boolean([...dom.container.querySelectorAll('button')].find(item => item.textContent === START)), 'source loaded');
  return { ...dom, text: () => dom.container.textContent ?? '', busy: () => busy, activity: () => activity,
    unmount: () => act(async () => root.render(null)), cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = original; dom.cleanup(); } };
}

test('actual app StrictMode default UI needs no selected adoption; verified batches release controls and explicit selected draft action remains separate', async () => {
  const api = server(), dom = await mount(api, true);
  try {
    assert.equal(dom.container.querySelector<HTMLSelectElement>('#ic-rule')!.value, '');
    assert.equal(api.evidence.length, 0); assert.equal(api.posts.length, 0);
    assert.equal(button(dom.container, START).disabled, false);
    await click(dom.container, START); assert.equal(api.posts.length, 0);
    await click(dialog(), 'Hủy'); assert.equal(api.calls(), 0);
    await click(dom.container, START); await click(dialog(), CONFIRM);
    await until(() => api.posts.length === 2 && !dom.busy(), 'two verified batches');
    assert.deepEqual(api.posts.map(post => post.body.recordIndexes), [Array.from({ length: 100 }, (_, i) => i), Array.from({ length: 50 }, (_, i) => i + 100)]);
    assert.equal(api.posts[0]!.body.defaultRuleId, null);
    assert.equal(api.posts[1]!.body.previousProposalId, id(21));
    assert.equal(api.posts[1]!.body.previousProposalSha256, '1'.repeat(64));
    assert.ok(api.posts.every(post => !('adoptionId' in post.body)));
    assert.equal(api.evidence.filter(item => item.kind === 'ADOPTION' || item.kind === 'RECEIPT').length, 0);
    assert.equal(button(dom.container, 'Soạn quy tắc mã hóa').disabled, false, 'human override remains available');
    await click(dom.container, REPORT); assert.equal(api.posts.length, 2);
    await click(dialog(), 'Hủy'); assert.equal(api.posts.length, 2);
    await click(dom.container, REPORT); await click(dialog(), 'Tạo bản nháp');
    await until(() => dom.activity() === 1, 'explicit revision posted');
    const body = api.posts[2]!.body;
    assert.equal(body.contractVersion, 'automation-insight-default-report-revision-v1');
    assert.deepEqual(body.defaultInsight, { contractVersion: 'insight-default-draft-select-v1', proposalId: id(22), proposalSha256: '2'.repeat(64) });
    assert.equal(api.calls(), 2); assert.ok(!('acceptedInsight' in body));
  } finally { await dom.cleanup(); }
});
for (const step of ['lose', 'mismatch'] as const) test(`${step}: explicit retry replays only exact held bytes; remaining default batches need renewed confirmation`, async () => {
  const api = server(150, step), dom = await mount(api);
  try {
    await click(dom.container, START); await click(dialog(), CONFIRM);
    await until(() => dom.text().includes(RETRY), 'held batch');
    assert.equal(api.posts.length, 1); assert.equal(api.calls(), 1); assert.equal(dom.busy(), true);
    await click(dom.container, RETRY);
    await until(() => dom.text().includes('Gửi tiếp các lô mặc định còn lại'), 'exact replay verified');
    assert.equal(api.posts.length, 2); assert.deepEqual(api.posts[1]!.body, api.posts[0]!.body); assert.equal(api.calls(), 1);
    await click(dom.container, 'Gửi tiếp các lô mặc định còn lại'); assert.equal(api.posts.length, 2);
    await click(dialog(), CONFIRM); await until(() => api.posts.length === 3 && !dom.busy(), 'remaining batch');
    assert.equal(api.calls(), 2); assert.equal(api.posts[2]!.body.previousProposalId, id(21));
  } finally { await dom.cleanup(); }
});
test('default unmount aborts pending transport without read-back or another batch', async () => {
  const api = server(150, 'hold'), dom = await mount(api, true);
  try {
    await click(dom.container, START); await click(dialog(), CONFIRM); await until(() => api.posts.length === 1, 'pending transport');
    const reads = api.reads(); await dom.unmount(); await settle();
    assert.equal(api.posts[0]!.signal?.aborted, true); assert.equal(api.posts.length, 1); assert.equal(api.reads(), reads); assert.equal(api.calls(), 0);
  } finally { await dom.cleanup(); }
});
test('retained default dispatch unknown stops the chain and does not retry automatically', async () => {
  const api = server(150, 'unknown'), dom = await mount(api);
  try {
    await click(dom.container, START); await click(dialog(), CONFIRM); await until(() => /DISPATCH_UNKNOWN/.test(dom.text()), 'terminal unknown');
    assert.equal(api.posts.length, 1); assert.equal(api.calls(), 1); assert.equal(dom.busy(), false);
    assert.ok(!dom.text().includes(RETRY));
  } finally { await dom.cleanup(); }
});
test('history reload does not choose latest default proposal; explicit older proposal digest is sent unchanged', async () => {
  const api = server(150), first = await mount(api);
  await click(first.container, START); await click(dialog(), CONFIRM);
  await until(() => api.posts.length === 2 && !first.busy(), 'retained proposals'); await first.cleanup();
  const dom = await mount(api);
  try {
    const select = dom.container.querySelector<HTMLSelectElement>('.ic-model select')!;
    assert.equal(select.value, '', 'history does not silently select latest');
    assert.ok(![...dom.container.querySelectorAll('button')].some(item => item.textContent === REPORT));
    await act(async () => {
      const win = select.ownerDocument.defaultView!;
      Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')!.set!.call(select, id(21));
      select.dispatchEvent(new win.Event('change', { bubbles: true }));
    });
    await click(dom.container, REPORT); await click(dialog(), 'Tạo bản nháp');
    await until(() => dom.activity() === 1, 'selected older proposal revision');
    assert.deepEqual(api.posts[2]!.body.defaultInsight, { contractVersion: 'insight-default-draft-select-v1', proposalId: id(21), proposalSha256: '1'.repeat(64) });
    assert.equal(api.calls(), 2);
  } finally { await dom.cleanup(); }
});
