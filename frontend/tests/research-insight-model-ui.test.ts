import assert from 'node:assert/strict';
import { register } from 'node:module';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { locatedInsightFixture } from '../../tests/helpers/located-insight-fixture';
import { setupDom } from './dom';
import type { ResearchAutomationRun } from '../src/research-automation/api';

// The panel imports its scoped stylesheet; Node cannot load CSS, so this test alone resolves it to an empty module.
register('data:text/javascript,' + encodeURIComponent("export async function load(url, context, next) { return new URL(url).pathname.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : next(url, context); }"));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const pairId = 'a'.repeat(64);
const at = '2026-10-04T00:00:00.000Z';
const binding = { workspaceId, runId, pairId, scopeSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64),
  sourceKind: 'NATIVE' as const, sourcePackageSha256: 'd'.repeat(64), inputSha256: 'e'.repeat(64) };
const text = 'Tôi mở app rồi đặt hàng.';
const run = { workspaceId, runId, revision: 4, definition: { definition: 'Đồ chơi gỗ' },
  requestedPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 } } as ResearchAutomationRun;
const id = (n: number, tag: number) => `${String(n).padStart(8, '0')}-0000-4000-8000-${String(tag).padStart(12, '0')}`;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const buttons = (root: Element, label: string) => [...root.querySelectorAll('button')].filter(item => item.textContent?.trim() === label);
const button = (root: Element, label: string) => {
  const found = buttons(root, label)[0];
  assert.ok(found, `missing button ${label}`); return found;
};
const click = async (root: Element, label: string) => { await act(async () => button(root, label).click()); };
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
async function until(check: () => boolean, label: string) {
  for (let i = 0; i < 300 && !check(); i++) await settle();
  assert.ok(check(), `timed out waiting for ${label}`);
}
async function setValue(field: HTMLSelectElement, value: string) {
  const win = field.ownerDocument.defaultView!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(win.HTMLSelectElement.prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new win.Event('change', { bubbles: true }));
  });
}

/** Synthetic source: every record reads the same sentence, except the listed excluded and unreadable ones. */
function corpus(size: number, excluded: readonly number[] = [], unreadable: readonly number[] = []) {
  return Array.from({ length: size }, (_, i) => unreadable.includes(i)
    ? { sourceSha256: '1'.repeat(64), locator: `/${i}`, text: null, sourceAttribution: `Review mẫu thử ${i}`, timeText: null, disposition: 'UNREADABLE' as const, dispositionReason: 'Tệp mẫu thử không đọc được' }
    : { sourceSha256: '1'.repeat(64), locator: `/${i}`, text, sourceAttribution: `Review mẫu thử ${i}`, timeText: null,
      disposition: excluded.includes(i) ? 'EXCLUDED' as const : 'INCLUDED' as const, dispositionReason: excluded.includes(i) ? 'Ngoài tiêu chí mẫu thử' : null });
}
const blank = () => ({ i02: [], i04: [] as unknown[], i05: [], i07: [], i08: [], i06: [], i09: [], i13Mentions: [], corpora: [] });
const row = (recordIndex: number) => ({ recordIndex, span: { start: 4, end: 10, quote: 'mở app' }, eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED',
  qualifiers: [], counterevidence: [], provenance: { basis: 'PENDING_AI', coderRole: 'synthetic model', adjudication: null, disagreement: null } });

type Step = 'lose' | 'readback-mismatch' | 'conflict' | 'unknown' | 'intervene' | 'hold';
/**
 * Synthetic server for the real client path. It keeps one execution per request key (an exact retry replays the stored
 * proposal), refuses a predecessor that is not the latest proposal, and "calls the model" only when it creates a proposal.
 * The model answers only the first record of each batch, so the rest stay pending. Steps are keyed by 1-based POST number.
 */
function server(records: readonly unknown[], steps: Partial<Record<number, Step>> = {}) {
  const evidence: any[] = [], posts: { action: string; body: any; signal: AbortSignal | null | undefined }[] = [];
  const created = new Map<string, string>();
  let reads = 0, calls = 0, mismatchedRead = false, release: (() => void) | null = null;
  const add = (kind: string, request: unknown) => {
    const sequence = evidence.length + 1, evidenceId = id(sequence, 1);
    evidence.push({ evidenceId, kind, sequence, binding, request, createdAt: at, sha256: sequence.toString(16).padStart(64, '0') });
    return evidenceId;
  };
  const latest = (adoptionId: string) => evidence.filter(item => item.kind === 'PROPOSAL' && item.request.adoptionId === adoptionId).at(-1)?.evidenceId ?? null;
  const adoptionId = add('ADOPTION', { contractVersion: 'insight-coding-adopt-v1', requestKey: id(0, 4), binding,
    rules: { ruleId: 'synthetic-behavior', revision: 1, question: 'Hành động nào được kể?', inclusionRule: 'Nguồn mẫu thử', adjudicationRule: 'Duyệt trích đoạn', corpora: [] } });
  const seedId = add('PROPOSAL', { contractVersion: 'insight-coding-propose-v1', requestKey: id(0, 5), adoptionId, previousProposalId: null, annotations: { ...blank(), i04: [row(0)] } });
  const proposed = (evidenceId: string, exactRetry: boolean) => json({ contractVersion: 'insight-model-response-v1', status: 'PROPOSED', executionId: id(posts.length, 2),
    proposal: { contractVersion: 'insight-coding-mutation-v1', kind: 'PROPOSAL', evidenceId, exactRetry } }, exactRetry ? 200 : 201);
  const fetcher = (async (url, init) => {
    const path = String(url);
    if (init?.method !== 'POST') {
      assert.ok(path.endsWith(`/insight-coding/${pairId}`), `unexpected GET ${path}`); reads++;
      const returned = structuredClone(evidence);
      if (mismatchedRead) { returned.at(-1)!.request.requestKey = id(999, 5); mismatchedRead = false; }
      return json({ contractVersion: 'insight-coding-view-v1', context: { binding, input: { ...locatedInsightFixture(), records } }, evidence: returned });
    }
    const body = JSON.parse(String(init.body)), action = path.split('/').at(-1)!;
    posts.push({ action, body, signal: init.signal });
    assert.equal(action, 'insight-coding-model-proposals', `unexpected POST ${path}`);
    const step = steps[posts.length];
    if (step === 'hold') await new Promise<void>((resolve, reject) => {
      release = resolve;
      init.signal?.addEventListener('abort', () => reject(new DOMException('Synthetic abort', 'AbortError')));
    });
    if (step === 'conflict') return json({ error: { message: 'Synthetic conflict.' } }, 409);
    if (step === 'unknown') { calls++; return json({ contractVersion: 'insight-model-response-v1', status: 'DISPATCH_UNKNOWN', executionId: id(posts.length, 2), code: 'TRANSPORT_OUTCOME_AMBIGUOUS' }); }
    const existing = created.get(body.requestKey);
    if (existing) return proposed(existing, true);
    if (body.previousProposalId !== latest(body.adoptionId)) return json({ error: { message: 'Synthetic predecessor changed.' } }, 409);
    calls++;
    const before = evidence.find(item => item.evidenceId === body.previousProposalId)?.request.annotations ?? blank();
    const sent = new Set<number>(body.recordIndexes);
    const evidenceId = add('PROPOSAL', { contractVersion: 'insight-coding-propose-v1', requestKey: body.requestKey, adoptionId: body.adoptionId, previousProposalId: body.previousProposalId,
      annotations: { ...blank(), i04: [...before.i04.filter((item: any) => !sent.has(item.recordIndex)), row(body.recordIndexes[0])] } });
    created.set(body.requestKey, evidenceId);
    if (step === 'readback-mismatch') mismatchedRead = true;
    if (step === 'lose') throw new TypeError('Synthetic lost response');
    if (step === 'intervene') add('PROPOSAL', { contractVersion: 'insight-coding-propose-v1', requestKey: id(99, 3), adoptionId: body.adoptionId, previousProposalId: evidenceId, annotations: { ...blank(), i04: [row(1)] } });
    return proposed(evidenceId, false);
  }) as typeof fetch;
  return { fetcher, posts, evidence, adoptionId, seedId, reads: () => reads, calls: () => calls, release: () => release?.() };
}

async function mount(fetcher: typeof fetch) {
  const dom = setupDom(), originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/InsightCodingPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCodingPanel');
  const root = createRoot(dom.container);
  let busy = false;
  const props = { run, pairId, versionNumber: 2, ownerToken: 'synthetic-only', disabled: false, reportBlock: null,
    onActivityChanged: () => undefined, onBusyChanged: (value: boolean) => { busy = value; } };
  await act(async () => root.render(createElement(Panel, props))); await settle();
  const text = () => dom.container.textContent ?? '';
  const select = (selector: string) => dom.container.querySelector<HTMLSelectElement>(selector)!;
  return { ...dom, text, select, busy: () => busy,
    chooseRule: async (adoptionId: string) => setValue(select('#ic-rule'), adoptionId),
    unmount: async () => { await act(async () => root.render(null)); },
    cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); } };
}

const START = 'Tạo đề xuất AI cho toàn bộ bản ghi', CONFIRM = 'Gọi model và lưu đề xuất', RESUME = 'Gửi tiếp các lô còn lại';
const createdProposals = (api: ReturnType<typeof server>) => api.evidence.filter(item => item.kind === 'PROPOSAL' && item.evidenceId !== api.seedId).map(item => item.evidenceId as string);

test('explicit model run covers every eligible record in exact 100-record batches, chained and read back one by one', async () => {
  const excluded = [3, 50, 120, 200, 249], unreadable = [7, 60, 130, 210, 248];
  const api = server(corpus(250, excluded, unreadable));
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    assert.match(dom.text(), /240 bản ghi được đưa vào và có văn bản sẽ được gửi theo 3 lô/);
    assert.match(dom.text(), /Không gửi 5 bản ghi bị loại và 5 bản ghi không đọc được/);
    assert.equal(api.posts.length, 0, 'nothing runs on mount or rule selection');

    // A local selection blocks the start instead of being cleared silently.
    await setValue(dom.select('#ic-proposal'), api.seedId);
    await act(async () => dom.container.querySelector<HTMLInputElement>('.ic-entries input[type="checkbox"]')!.click());
    assert.equal(button(dom.container, START).disabled, true);
    assert.match(dom.text(), /Đang đánh dấu mục hoặc biên nhận/);
    await click(dom.container, 'Bỏ đánh dấu tất cả');

    await click(dom.container, START);
    assert.equal(dialog().querySelector('h3')!.textContent, 'Gọi model cho 240 bản ghi trong 3 lô?');
    assert.match(dialog().textContent!, /2 lô × 100 bản ghi, lô cuối 40 bản ghi · bản ghi 1 đến 248/);
    assert.match(dialog().textContent!, /Đề xuất 2 .*bản mới nhất của quy tắc bản 1/);
    assert.match(dialog().textContent!, /chưa có ước tính chi phí/);
    assert.equal(api.posts.length, 0, 'opening the confirmation calls nothing');
    const readsBefore = api.reads();
    await click(dialog(), CONFIRM);
    await until(() => /Đã xác minh mọi lô/.test(dom.text()), 'all batches verified');

    const eligible = [...Array(250).keys()].filter(i => !excluded.includes(i) && !unreadable.includes(i));
    assert.deepEqual(api.posts.map(post => post.body.recordIndexes), [eligible.slice(0, 100), eligible.slice(100, 200), eligible.slice(200)]);
    const created = createdProposals(api);
    assert.equal(created.length, 3);
    assert.deepEqual(api.posts.map(post => post.body.previousProposalId), [api.seedId, created[0], created[1]], 'each batch chains from the verified proposal before it');
    assert.equal(new Set(api.posts.map(post => post.body.requestKey)).size, 3);
    assert.ok(api.posts.every(post => post.body.adoptionId === api.adoptionId && post.body.contractVersion === 'insight-model-request-v1'));
    assert.equal(api.reads() - readsBefore, 3, 'one exact read-back per batch');
    assert.equal(api.calls(), 3);
    assert.equal(dom.select('#ic-proposal').value, created[2], 'the last verified proposal opens in the existing review');
    assert.match(dom.text(), /Đã xác minh 3\/3 lô · 240\/240 bản ghi thuộc lô đã xác minh/);
    assert.equal(dom.container.querySelectorAll('.ic-entries > li').length, 3, 'records the model left empty stay pending, not invented');
    assert.ok(api.posts.every(post => post.action === 'insight-coding-model-proposals'), 'nothing is accepted and no report is created');
    assert.equal(dom.busy(), false);
  } finally { await dom.cleanup(); }
});

for (const failure of ['lose', 'readback-mismatch'] as const) test(`${failure} holds the exact batch; only an explicit retry resends it, and resuming needs a new confirmation`, async () => {
  const api = server(corpus(150), { 1: failure });
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    await click(dom.container, START);
    await click(dialog(), CONFIRM);
    await until(() => buttons(dom.container, 'Thử lại đúng lô 1').length === 1, 'ambiguous outcome held for exact retry');
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 1, 'no automatic second model call');
    assert.equal(dom.busy(), true, 'the held identity keeps the page guarded');
    assert.equal(button(dom.container, 'Tải lại mã hóa').disabled, true);
    assert.equal(dom.select('#ic-proposal').disabled, true);
    assert.equal(buttons(dom.container, RESUME).length, 0, 'no new identity while the batch is held');

    await click(dom.container, 'Thử lại đúng lô 1');
    await until(() => /Đã xác minh lô 1\/2 bằng đúng yêu cầu cũ/.test(dom.text()), 'exact retry verified');
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 2, 'the retry sends only the held batch');
    assert.deepEqual(api.posts[1]!.body, api.posts[0]!.body, 'same key and body');
    assert.equal(api.calls(), 1, 'the server replayed the stored proposal');
    const [first] = createdProposals(api);
    assert.equal(dom.select('#ic-proposal').value, first);

    await click(dom.container, RESUME);
    assert.equal(dialog().querySelector('h3')!.textContent, 'Gửi tiếp 50 bản ghi trong 1 lô còn lại?');
    assert.match(dialog().textContent!, /bỏ qua 1 lô đã xác minh/);
    await click(dialog(), CONFIRM);
    await until(() => /Đã xác minh mọi lô/.test(dom.text()), 'resumed batch verified');
    assert.equal(api.posts.length, 3);
    assert.notEqual(api.posts[2]!.body.requestKey, api.posts[0]!.body.requestKey);
    assert.equal(api.posts[2]!.body.previousProposalId, first);
    assert.deepEqual(api.posts[2]!.body.recordIndexes, [...Array(50).keys()].map(i => i + 100));
    assert.equal(dom.busy(), false);
  } finally { await dom.cleanup(); }
});

test('unmount during a pending batch aborts it and sends no read-back or later batch', async () => {
  const api = server(corpus(250), { 1: 'hold' });
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    await click(dom.container, START);
    await click(dialog(), CONFIRM);
    await until(() => api.posts.length === 1, 'first batch sent');
    assert.match(dom.text(), /Đang gửi và xác minh lô 1\/3/);
    const readsBefore = api.reads();
    await dom.unmount();
    assert.equal(api.posts[0]!.signal?.aborted, true);
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 1);
    assert.equal(api.reads(), readsBefore);
    assert.equal(api.calls(), 0);
  } finally { await dom.cleanup(); }
});

test('stop after the current batch keeps its verified proposal and sends nothing after it', async () => {
  const api = server(corpus(250), { 1: 'hold' });
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    await click(dom.container, START);
    await click(dialog(), CONFIRM);
    await until(() => api.posts.length === 1, 'first batch sent');
    assert.equal(document.activeElement?.textContent, 'Dừng sau lô đang gửi');
    await click(dom.container, 'Dừng sau lô đang gửi');
    assert.match(dom.text(), /sẽ dừng sau lô này/);
    api.release();
    await until(() => /Đã dừng theo yêu cầu\. Chưa gửi lô 2\/3/.test(dom.text()), 'stopped');
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 1);
    assert.match(dom.text(), /Đã xác minh 1\/3 lô · 100\/250 bản ghi thuộc lô đã xác minh/);
    assert.equal(dom.select('#ic-proposal').value, createdProposals(api)[0]);
    assert.equal(buttons(dom.container, RESUME).length, 1);
  } finally { await dom.cleanup(); }
});

test('a conflict on a later batch stops the run and allows only the exact retry of that batch', async () => {
  const api = server(corpus(250), { 2: 'conflict' });
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    await click(dom.container, START);
    await click(dialog(), CONFIRM);
    await until(() => /Lô 2\/3 bị xung đột/.test(dom.text()), 'conflict');
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 2, 'the third batch is never sent');
    assert.equal(buttons(dom.container, RESUME).length, 0);
    await until(() => !button(dom.container, 'Thử lại đúng lô 2').disabled, 'history reloaded');
    await click(dom.container, 'Thử lại đúng lô 2');
    await until(() => /Đã xác minh lô 2\/3 bằng đúng yêu cầu cũ/.test(dom.text()), 'exact retry verified');
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 3);
    assert.deepEqual(api.posts[2]!.body, api.posts[1]!.body);
    assert.match(dom.text(), /Đã xác minh 2\/3 lô/);
  } finally { await dom.cleanup(); }
});

test('a proposal written by someone else after a verified batch stops the chain instead of overwriting it', async () => {
  const api = server(corpus(250), { 1: 'intervene' });
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    await click(dom.container, START);
    await click(dialog(), CONFIRM);
    await until(() => /vừa có một đề xuất khác mới hơn/.test(dom.text()), 'chain stopped');
    for (let i = 0; i < 5; i++) await settle();
    assert.equal(api.posts.length, 1);
    assert.equal(buttons(dom.container, 'Thử lại đúng lô 1').length, 0, 'the verified batch is not held');
    assert.match(dom.text(), /Đã xác minh 1\/3 lô · 100\/250/);
    await click(dom.container, RESUME);
    assert.match(dialog().textContent!, /Đề xuất 4 .*bản mới nhất/, 'resuming chains from the newer proposal, after a new confirmation');
    await click(dialog(), 'Hủy');
    assert.equal(api.posts.length, 1);
  } finally { await dom.cleanup(); }
});

test('a server-retained unknown dispatch stops without an exact retry and is told apart from a lost response', async () => {
  const api = server(corpus(250), { 1: 'unknown' });
  const dom = await mount(api.fetcher);
  try {
    await dom.chooseRule(api.adoptionId);
    await click(dom.container, START);
    await click(dialog(), CONFIRM);
    await until(() => /Máy chủ đã ghi nhận lô 1\/3 là không rõ kết quả/.test(dom.text()), 'retained unknown');
    for (let i = 0; i < 5; i++) await settle();
    assert.doesNotMatch(dom.text(), /Không biết máy chủ đã gọi model hay chưa/);
    assert.equal(api.posts.length, 1);
    assert.equal(buttons(dom.container, 'Thử lại đúng lô 1').length, 0);
    assert.equal(dom.busy(), false);
    await click(dom.container, RESUME);
    assert.match(dialog().textContent!, /gửi lại bằng mã mới sẽ gọi model thêm lần nữa/);
    await click(dialog(), 'Hủy');
    assert.equal(api.posts.length, 1, 'cancel sends nothing');
  } finally { await dom.cleanup(); }
});
