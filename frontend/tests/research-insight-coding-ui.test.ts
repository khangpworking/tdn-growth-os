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
const attemptId = '66666666-6666-4666-8666-666666666666';
const pairId = 'a'.repeat(64);
const at = '2026-10-04T00:00:00.000Z';
const binding = { workspaceId, runId, pairId, scopeSha256: 'b'.repeat(64), reportSha256: 'c'.repeat(64),
  sourceKind: 'NATIVE' as const, sourcePackageSha256: 'd'.repeat(64), inputSha256: 'e'.repeat(64) };
const text = 'Tôi mở app rồi đặt hàng. Sau đó tôi đặt hàng lại.';
const records = [
  { sourceSha256: '1'.repeat(64), locator: '/0', text, sourceAttribution: 'Review mẫu thử A', timeText: null, disposition: 'INCLUDED' as const, dispositionReason: null },
  { sourceSha256: '1'.repeat(64), locator: '/1', text: 'Không liên quan.', sourceAttribution: 'Review mẫu thử B', timeText: null, disposition: 'EXCLUDED' as const, dispositionReason: 'Ngoài tiêu chí mẫu thử' },
];
const run = { workspaceId, runId, revision: 4, definition: { definition: 'Đồ chơi gỗ' },
  requestedPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 } } as ResearchAutomationRun;
const kinds = { 'insight-coding-adoptions': 'ADOPTION', 'insight-coding-proposals': 'PROPOSAL', 'insight-coding-receipts': 'RECEIPT' } as const;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const button = (root: Element, label: string) => {
  const found = [...root.querySelectorAll('button')].find(item => item.textContent?.trim() === label);
  assert.ok(found, `missing button ${label}`); return found;
};
const click = async (root: Element, label: string) => { await act(async () => button(root, label).click()); };
const dialog = () => document.querySelector<HTMLElement>('[role="dialog"]')!;
/** Finds a native control by the visible text that starts its label, the way an owner reads the form. */
const labeled = (root: Element, label: string) => {
  const found = [...root.querySelectorAll('label')].find(item => item.firstChild?.textContent === label)?.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input,select,textarea');
  assert.ok(found, `missing field ${label}`); return found;
};
const fieldset = (legend: string) => {
  const found = [...document.querySelectorAll('fieldset')].find(item => item.querySelector('legend')?.textContent === legend);
  assert.ok(found, `missing fieldset ${legend}`); return found;
};
async function setValue(field: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const win = field.ownerDocument.defaultView!;
  const proto = field.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
    field.dispatchEvent(new win.Event('input', { bubbles: true }));
    field.dispatchEvent(new win.Event('change', { bubbles: true }));
  });
}

/** Synthetic in-memory server: stores exactly what was posted and serves a contract-valid view back. */
function server(options: { loseFirstReceipt?: boolean; hold?: Promise<void>; records?: readonly unknown[] } = {}) {
  const evidence: unknown[] = [];
  const posts: { action: string; body: any }[] = [];
  let reads = 0, lost = false, failRead = false;
  const fetcher = (async (url, init) => {
    const path = String(url);
    if (init?.method !== 'POST') {
      assert.ok(path.endsWith(`/insight-coding/${pairId}`), `unexpected GET ${path}`); reads++;
      if (failRead) { failRead = false; return json({ error: { message: 'Synthetic read unavailable' } }, 500); }
      return json({ contractVersion: 'insight-coding-view-v1', context: { binding, input: { ...locatedInsightFixture(), records: options.records ?? records } }, evidence });
    }
    const body = JSON.parse(String(init.body)), action = path.split('/').at(-1)!;
    posts.push({ action, body });
    if (options.hold) await options.hold;
    if (action === 'report-revisions') return json({ attemptId, attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
    const kind = kinds[action as keyof typeof kinds];
    assert.ok(kind, `unexpected POST ${path}`);
    if (kind === 'RECEIPT' && options.loseFirstReceipt && !lost) { lost = true; throw new Error('Synthetic lost response'); }
    const sequence = evidence.length + 1, evidenceId = `${sequence}${'0'.repeat(7)}-0000-4000-8000-000000000000`;
    evidence.push({ evidenceId, kind, sequence, binding, request: body, createdAt: at, sha256: String(sequence).repeat(64) });
    return json({ contractVersion: 'insight-coding-mutation-v1', evidenceId, kind, exactRetry: false }, 201);
  }) as typeof fetch;
  return { fetcher, posts, evidence, reads: () => reads, failNextRead: () => { failRead = true; } };
}

async function mount(fetcher: typeof fetch) {
  const dom = setupDom(), originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/InsightCodingPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCodingPanel');
  const root = createRoot(dom.container);
  let activities = 0, busy = false;
  const props = { run, pairId, versionNumber: 2, ownerToken: 'synthetic-only', disabled: false, reportBlock: null,
    onActivityChanged: () => { activities++; }, onBusyChanged: (value: boolean) => { busy = value; } };
  await act(async () => root.render(createElement(Panel, props))); await settle();
  return { ...dom, activities: () => activities, busy: () => busy,
    unmount: async () => { await act(async () => root.render(null)); },
    cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); } };
}

async function adoptBlankRule(container: HTMLElement) {
  await click(container, 'Soạn quy tắc mã hóa');
  const fields = [...container.querySelectorAll<HTMLTextAreaElement>('.ic-rule-form textarea')];
  assert.equal(fields.length, 3);
  assert.ok(fields.every(field => field.value === ''), 'codebook and rules start blank');
  for (const [i, field] of fields.entries()) await setValue(field, `Quy tắc mẫu thử ${i}`);
  await click(container, 'Xem lại quy tắc mã hóa');
  assert.match(dialog().textContent!, /Duyệt quy tắc mã hóa bản 1/);
}

test('owner can review an expanded semantic proposal with full source context and confirms only the exact selected family indexes', async () => {
  // A short literal I10 phrase whose meaning depends on words outside it: negation before it, hearsay,
  // a hedge, a line break and markup-like text that must stay text.
  const phrase = 'bị móp';
  const contextText = 'Hộp giao tới không bị móp.\nNghe shop nói lô trước <img src=x onerror="globalThis.leaked=1"> hay vỡ nắp, chắc do trời mưa.';
  const api = server({ records: [...records, { sourceSha256: '1'.repeat(64), locator: '/2', text: contextText, sourceAttribution: 'Review mẫu thử C', timeText: null, disposition: 'INCLUDED', dispositionReason: null }] });
  const adoptionId = '10000000-0000-4000-8000-000000000000', proposalId = '20000000-0000-4000-8000-000000000000';
  const pendingAi = { basis: 'PENDING_AI', coderRole: 'synthetic model', adjudication: null, disagreement: null };
  api.evidence.push({ evidenceId: adoptionId, kind: 'ADOPTION', sequence: 1, binding, createdAt: at, sha256: '1'.repeat(64), request: {
    contractVersion: 'insight-coding-adopt-v1', requestKey: '30000000-0000-4000-8000-000000000000', binding,
    rules: { ruleId: 'synthetic-behavior', revision: 1, question: 'Hành động nào được kể?', inclusionRule: 'Nguồn mẫu thử', adjudicationRule: 'Duyệt trích đoạn', corpora: [{
      sectionId: 'I10', recordIndexes: [2], question: 'Cụm từ nào được nhắc?', unit: 'Bản ghi mẫu thử', period: null, frame: null, channel: null, inclusionRule: 'Bản ghi mẫu thử',
      membershipComplete: true, multiCode: false, externalSampling: 'UNKNOWN', assignments: [], dispositions: [],
      codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: 'Móp hộp', phrase, firstRecordIndex: null, firstSpan: null }] } }] },
  } });
  api.evidence.push({ evidenceId: proposalId, kind: 'PROPOSAL', sequence: 1, binding, createdAt: at, sha256: '2'.repeat(64), request: {
    contractVersion: 'insight-coding-propose-v1', requestKey: '40000000-0000-4000-8000-000000000000', adoptionId, previousProposalId: null,
    annotations: { i02: [], i04: [{ recordIndex: 0, span: { start: 4, end: 10, quote: 'mở app' }, eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED',
      qualifiers: [], counterevidence: [], provenance: pendingAi }],
      i05: [], i07: [], i08: [], i06: [], i09: [], i13Mentions: [], corpora: [{ corpusIndex: 0, dispositions: [],
        assignments: [{ recordIndex: 2, code: 'C1', span: { start: contextText.indexOf(phrase), end: contextText.indexOf(phrase) + phrase.length, quote: phrase }, provenance: pendingAi }] }] },
  } });
  const entry = (root: Element) => {
    const found = [...root.querySelectorAll<HTMLElement>('.ic-entries > li')].find(item => item.querySelector('strong')?.textContent?.includes(`“${phrase}”`));
    assert.ok(found, 'missing I10 entry'); return found;
  };
  /** Opens and closes one entry's disclosure the way an owner would, checking what it reveals. */
  const readContext = async (item: HTMLElement) => {
    const details = item.querySelector('details')!, summary = details.querySelector('summary')!;
    assert.equal(summary.textContent, 'Xem toàn văn nguồn');
    assert.equal(details.open, false, 'context starts collapsed');
    await act(async () => summary.click());
    assert.equal(details.open, true);
    assert.equal(details.querySelector('.ic-record-text')!.textContent, contextText, 'the whole stored record, unshortened and unrewritten');
    assert.equal(document.querySelector('img'), null, 'markup-like source text is rendered as text');
    const title = item.querySelector('strong')!.textContent!;
    assert.ok(title.includes(`“${phrase}”`) && !title.includes('không'), 'the coded span stays the short literal phrase');
    await act(async () => summary.click());
    assert.equal(details.open, false);
  };
  const dom = await mount(api.fetcher);
  try {
    await setValue(dom.container.querySelector<HTMLSelectElement>('#ic-rule')!, adoptionId);
    await setValue(dom.container.querySelector<HTMLSelectElement>('#ic-proposal')!, proposalId);
    assert.match(dom.container.textContent!, /I04 · Hành vi/);
    assert.match(dom.container.textContent!, /mở app.*Kể hành động.*Tự thuật/);
    assert.match(entry(dom.container).textContent!, /Gợi ý chờ duyệt/, 'the I10 candidate keeps pending provenance');
    await act(async () => dom.container.querySelector<HTMLInputElement>('.ic-entries input[type="checkbox"]')!.click());
    await act(async () => entry(dom.container).querySelector<HTMLInputElement>('input[type="checkbox"]')!.click());
    await readContext(entry(dom.container));
    assert.deepEqual([...dom.container.querySelectorAll<HTMLInputElement>('.ic-entries input[type="checkbox"]')].map(box => box.checked), [true, true], 'reading context keeps the marks');
    await click(dom.container, 'Xem xác nhận duyệt mục');
    assert.equal(api.posts.length, 0, 'opening confirmation does not accept a candidate');
    await readContext(entry(dialog()));
    const confirm = button(dialog(), 'Xác nhận');
    confirm.focus();
    await act(async () => { confirm.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); });
    assert.equal(document.activeElement, dialog().querySelector('summary'), 'Tab wraps from the last action to the first source disclosure');
    assert.equal(api.posts.length, 0, 'reading context in the confirmation writes nothing');
    await click(dialog(), 'Xác nhận'); await settle();
    assert.equal(api.posts.length, 1);
    assert.deepEqual(api.posts[0]!.body.selection, { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [0], i05: [], i07: [], i08: [], i06: [], i09: [], i13Mentions: [],
      corpora: [{ corpusIndex: 0, assignments: [0], dispositions: [] }] });
    assert.equal(api.posts[0]!.body.proposalId, proposalId);
    assert.equal(dom.container.querySelector<HTMLInputElement>('.ic-entries input[type="checkbox"]')!.disabled, true, 'read-back prevents accepting the same candidate again');
    assert.equal(api.posts.some(post => post.action === 'report-revisions'), false);
  } finally { await dom.cleanup(); }
});

test('owner picks a repeated quote by occurrence; adopt, propose, accept and report stay separate explicit writes', async () => {
  const api = server({ loseFirstReceipt: true });
  const dom = await mount(api.fetcher);
  try {
    assert.equal(api.posts.length, 0);
    assert.match(dom.container.textContent!, /2 bản ghi: 1 được đưa vào, 1 bị loại, 0 không đọc được/i);
    await adoptBlankRule(dom.container);
    assert.equal(dom.busy(), true, 'an open rule draft guards navigation');
    await click(dialog(), 'Xác nhận'); await settle();
    assert.equal(api.posts.length, 1);
    assert.equal(api.posts[0]!.body.rules.revision, 1);
    assert.deepEqual(api.posts[0]!.body.rules.corpora, []);
    const adoptionId = (dom.container.querySelector<HTMLSelectElement>('#ic-rule')!).value;
    assert.equal(adoptionId, '10000000-0000-4000-8000-000000000000', 'the verified new rule is selected explicitly, not inferred later');

    await click(dom.container, 'Soạn bản nháp đề xuất');
    await setValue(labeled(dom.container, 'Loại mục'), 'I06');
    const recordSelect = labeled(dom.container, 'Bản ghi nguồn') as HTMLSelectElement;
    assert.equal(recordSelect.querySelector<HTMLOptionElement>('option[value="1"]')!.disabled, true, 'excluded records cannot carry I06');
    await setValue(recordSelect, '0');
    await setValue(labeled(fieldset('Sự kiện thứ nhất'), 'Trích nguyên văn'), 'mở app');
    const second = fieldset('Sự kiện thứ hai');
    await setValue(labeled(second, 'Trích nguyên văn'), 'đặt hàng');
    const occurrences = [...second.querySelectorAll<HTMLInputElement>('.ic-occurrence input')];
    assert.equal(occurrences.length, 2, 'a repeated quote is never resolved silently');
    await act(async () => occurrences[1]!.click());
    await setValue(labeled(dom.container, 'Cơ sở'), 'DECLARED');
    await setValue(labeled(dom.container, 'Vai trò người mã hóa'), 'Người mã hóa mẫu thử');
    await click(dom.container, 'Thêm vào bản nháp');
    assert.equal(api.posts.length, 1, 'adding to the draft stays local');
    await click(dom.container, 'Xem lại và lưu đề xuất');
    await click(dialog(), 'Xác nhận'); await settle();
    assert.equal(api.posts.length, 2);
    const proposal = api.posts[1]!.body;
    assert.equal(proposal.adoptionId, adoptionId);
    assert.equal(proposal.previousProposalId, null);
    const start = text.lastIndexOf('đặt hàng');
    assert.deepEqual(proposal.annotations.i06[0].firstEvent, { start: text.indexOf('mở app'), end: text.indexOf('mở app') + 6, quote: 'mở app' });
    assert.deepEqual(proposal.annotations.i06[0].secondEvent, { start, end: start + 'đặt hàng'.length, quote: 'đặt hàng' });
    assert.deepEqual(proposal.annotations.i06[0].provenance, { basis: 'DECLARED', coderRole: 'Người mã hóa mẫu thử', adjudication: null, disagreement: null });

    await act(async () => dom.container.querySelector<HTMLInputElement>('.ic-entries input[type="checkbox"]')!.click());
    await click(dom.container, 'Xem xác nhận duyệt mục');
    await click(dialog(), 'Hủy');
    assert.equal(api.posts.length, 2, 'cancelling accepts nothing');
    await click(dom.container, 'Xem xác nhận duyệt mục');
    await click(dialog(), 'Xác nhận'); await settle();
    assert.equal(api.posts.length, 3);
    assert.match(dom.container.textContent!, /Chưa xác minh được kết quả thao tác/);
    await act(async () => { const retry = button(dom.container, 'Thử lại đúng thao tác'); retry.click(); retry.click(); }); await settle();
    assert.equal(api.posts.length, 4, 'a double click while retrying sends one request');
    assert.deepEqual(api.posts[3]!.body, api.posts[2]!.body, 'retry reuses the exact body and request key');
    assert.equal(api.posts[3]!.body.proposalSha256, '2'.repeat(64));
    assert.deepEqual(api.posts[3]!.body.selection.i06, [0]);
    assert.ok(api.posts.every(post => post.action !== 'report-revisions'), 'acceptance never creates a report');
    assert.equal(dom.activities(), 0);

    await act(async () => dom.container.querySelector<HTMLInputElement>('.ic-receipts input[type="checkbox"]')!.click());
    await click(dom.container, 'Tạo bản báo cáo từ mã hóa đã duyệt');
    assert.equal(api.posts.length, 4);
    await click(dialog(), 'Xác nhận'); await settle();
    assert.equal(api.posts.length, 5);
    assert.deepEqual(api.posts[4]!.body.acceptedInsight, { proposalId: '20000000-0000-4000-8000-000000000000', receiptIds: ['30000000-0000-4000-8000-000000000000'] });
    assert.deepEqual(api.posts[4]!.body.sources, { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } });
    assert.equal(api.posts[4]!.body.previousPairId, pairId);
    assert.equal(dom.activities(), 1);
  } finally { await dom.cleanup(); }
});

for (const form of ['rule', 'annotation'] as const) test(`collapsing an unfinished ${form} preserves input and the navigation guard until explicit discard`, async () => {
  const api = server();
  const dom = await mount(api.fetcher);
  try {
    if (form === 'rule') {
      await adoptBlankRule(dom.container);
      await click(dialog(), 'Hủy');
      api.failNextRead();
      await click(dom.container, 'Tải lại mã hóa'); await settle();
      assert.match(dom.container.textContent!, /Synthetic read unavailable/);
      assert.equal(api.posts.length, 0);
      await click(dom.container, 'Tải lại mã hóa'); await settle();
      assert.equal(dom.container.querySelector<HTMLTextAreaElement>('.ic-rule-form textarea')?.value, 'Quy tắc mẫu thử 0', 'failed read and retry preserve the rule draft');
      await click(dom.container, 'Đóng soạn quy tắc mã hóa');
      assert.equal(dom.busy(), true, 'collapsed unsaved rules still guard navigation');
      assert.equal((dom.container.querySelector('#ic-rule') as HTMLSelectElement).disabled, true);
      await click(dom.container, 'Soạn quy tắc mã hóa');
      assert.deepEqual([...dom.container.querySelectorAll<HTMLTextAreaElement>('.ic-rule-form textarea')].map(field => field.value),
        ['Quy tắc mẫu thử 0', 'Quy tắc mẫu thử 1', 'Quy tắc mẫu thử 2']);
      await click(dom.container, 'Bỏ bản nháp quy tắc');
      await click(dialog(), 'Hủy');
      assert.equal(dom.busy(), true);
      await click(dom.container, 'Bỏ bản nháp quy tắc');
      await click(dialog(), 'Bỏ bản nháp quy tắc');
      assert.equal(api.posts.length, 0);
      assert.equal(dom.busy(), false);
    } else {
      await adoptBlankRule(dom.container);
      await click(dialog(), 'Xác nhận'); await settle();
      await click(dom.container, 'Soạn bản nháp đề xuất');
      await setValue(labeled(dom.container, 'Loại mục'), 'I06');
      await setValue(labeled(dom.container, 'Bản ghi nguồn'), '0');
      await setValue(labeled(fieldset('Sự kiện thứ nhất'), 'Trích nguyên văn'), 'mở app');
      await setValue(labeled(dom.container, 'Vai trò người mã hóa'), 'Chưa thêm mục này');
      await click(dom.container, 'Thu gọn bản nháp');
      assert.equal(dom.busy(), true, 'an unfinished item is still unsaved even before Add');
      assert.equal((dom.container.querySelector('#ic-rule') as HTMLSelectElement).disabled, true);
      await click(dom.container, 'Soạn bản nháp đề xuất');
      assert.equal(labeled(dom.container, 'Loại mục').value, 'I06');
      assert.equal(labeled(fieldset('Sự kiện thứ nhất'), 'Trích nguyên văn').value, 'mở app');
      assert.equal(labeled(dom.container, 'Vai trò người mã hóa').value, 'Chưa thêm mục này');
      await click(dom.container, 'Bỏ bản nháp');
      await click(dialog(), 'Hủy');
      assert.equal(labeled(dom.container, 'Vai trò người mã hóa').value, 'Chưa thêm mục này');
      await click(dom.container, 'Bỏ bản nháp');
      await click(dialog(), 'Bỏ bản nháp');
      assert.equal(dom.busy(), false);
      assert.equal(api.posts.length, 1, 'discarding drafts performs no additional write');
      await click(dom.container, 'Soạn bản nháp đề xuất');
      assert.equal(labeled(dom.container, 'Loại mục').value, '', 'explicit discard resets the item editor');
    }
  } finally { await dom.cleanup(); }
});

test('a write that completes after unmount neither reads back nor reports activity', async () => {
  let release!: () => void;
  const api = server({ hold: new Promise<void>(resolve => { release = resolve; }) });
  const dom = await mount(api.fetcher);
  try {
    await adoptBlankRule(dom.container);
    await click(dialog(), 'Xác nhận');
    assert.equal(api.posts.length, 1);
    const reads = api.reads();
    await dom.unmount();
    await act(async () => { release(); await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(api.reads(), reads, 'no read-back after unmount');
    assert.equal(dom.activities(), 0);
    assert.equal(dom.container.childElementCount, 0);
  } finally { await dom.cleanup(); }
});

test('a fixed code phrase can select an occurrence beyond the first fifty without changing its text', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Picker } = await tsImport('../src/research-automation/InsightCodingSpanPicker.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/InsightCodingSpanPicker');
  const root = createRoot(dom.container);
  const quote = '😀 tốt', original = `${quote}; `.repeat(51);
  let selected: unknown = null;
  try {
    await act(async () => root.render(createElement(Picker, { label: 'Mã nguyên văn', text: original, fixedQuote: quote, value: null, onChange: value => { selected = value; } })));
    assert.equal(dom.container.querySelectorAll('input[type="radio"]').length, 50);
    await click(dom.container, 'Xem thêm lần xuất hiện');
    const occurrences = dom.container.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    assert.equal(occurrences.length, 51);
    await act(async () => occurrences[50]!.click());
    const start = original.lastIndexOf(quote);
    assert.deepEqual(selected, { start, end: start + quote.length, quote });
    assert.equal((labeled(dom.container, 'Cụm từ của mã (nguyên văn)') as HTMLInputElement).readOnly, true);
  } finally { await act(async () => root.unmount()); dom.cleanup(); }
});
