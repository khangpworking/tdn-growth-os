import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import type { ResearchAutomationRun } from '../src/research-automation/api';
import type { AutomationMetricRuleAdoptionReceipt, ResearchMetricMembershipReview } from '../src/research-automation/metric-membership-api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const adoptionId = '33333333-3333-4333-8333-333333333333';
const proposalId = '44444444-4444-4444-8444-444444444444';
const receiptId = '55555555-5555-4555-8555-555555555555';
const pairId = 'a'.repeat(64), keys = ['b'.repeat(64), 'c'.repeat(64)];
const at = '2026-10-04T00:00:00.000Z';
const rule: AutomationMetricRuleAdoptionReceipt = { contractVersion: 'automation-metric-rule-receipt-v1', adoptionId, workspaceId, runId,
  adoptedAt: at, exactRetry: false, rulebook: { ruleId: 'synthetic', revision: 1, title: 'Quy tắc mẫu thử', wideUnknownPolicy: 'exclude',
    definitions: { CORE_CANDIDATE: 'Sản phẩm chính', ADJACENT: 'Phụ kiện', OUTSIDE: 'Không liên quan', UNKNOWN: 'Chưa đủ thông tin' },
    groups: [{ key: 'sample', label: 'Nhóm mẫu thử', definition: 'Chỉ dùng kiểm tra' }] } };
const run = { workspaceId, runId, revision: 4, definition: { definition: 'Đồ chơi gỗ' },
  requestedPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 } } as ResearchAutomationRun;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const button = (container: HTMLElement, text: string) => {
  const found = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  assert.ok(found, `missing button ${text}`); return found;
};
const click = async (container: HTMLElement, text: string) => { await act(async () => button(container, text).click()); };
async function setField(container: HTMLElement, selector: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(selector);
  assert.ok(field, `missing field ${selector}`);
  const win = field.ownerDocument.defaultView!;
  const proto = field.tagName === 'SELECT' ? win.HTMLSelectElement.prototype : field.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
    field.dispatchEvent(new win.Event('input', { bubbles: true }));
    field.dispatchEvent(new win.Event('change', { bubbles: true }));
  });
}
const settle = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
function pendingReview(): ResearchMetricMembershipReview {
  return { contractVersion: 'metric-membership-review-v1', workspaceId, runId, pairId, adoptionId,
    recordCount: 2, acceptedCount: 0, pendingCount: 2, complete: false, acceptedReceiptIds: [],
    records: keys.map((recordKey, i) => ({ recordKey, title: i ? 'Phụ kiện B' : 'Đồ chơi A', category: 'Mẫu thử', shopId: '1', listingId: String(i + 1),
      locator: `Sheet1!A${i + 2}`, state: 'PENDING', classification: null, group: null, proposalId: null })) };
}

async function mount(fetcher: typeof fetch) {
  const dom = setupDom(), originalFetch = globalThis.fetch;
  globalThis.fetch = fetcher;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/MetricClassificationPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/MetricClassificationPanel');
  const root = createRoot(dom.container);
  let activities = 0;
  const props = { run, pairId, versionNumber: 1, ownerToken: 'synthetic-only', disabled: false,
    onActivityChanged: () => { activities++; }, onBusyChanged: (_value: boolean) => {} };
  await act(async () => root.render(createElement(Panel, props))); await settle();
  return { ...dom, activities: () => activities,
    unmount: async () => { await act(async () => root.render(null)); },
    cleanup: async () => { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); } };
}

test('mounted classification preserves hidden selections and separates proposal, acceptance and report creation', async () => {
  let review = pendingReview();
  const posts: { url: string; body: any }[] = [];
  let assignments: any[] = [];
  const dom = await mount((async (url, init) => {
    const path = String(url);
    if (init?.method === 'POST') {
      const body = JSON.parse(String(init.body)); posts.push({ url: path, body });
      if (path.endsWith('/metric-membership-proposals')) { assignments = body.assignments; return json({ contractVersion: 'metric-membership-mutation-v1', kind: 'PROPOSAL', id: proposalId, exactRetry: false }, 201); }
      if (path.endsWith('/metric-membership-receipts')) return json({ contractVersion: 'metric-membership-mutation-v1', kind: 'ACCEPTANCE', id: receiptId, exactRetry: false }, 201);
      if (path.endsWith('/report-revisions')) return json({ attemptId: receiptId, attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
      throw new Error(`unexpected POST ${path}`);
    }
    if (path.endsWith('/metric-rule-adoptions')) return json({ contractVersion: 'automation-metric-rule-list-v1', workspaceId, runId, adoptions: [rule] });
    if (path.endsWith(`/metric-membership-proposals/${proposalId}`)) return json({ contractVersion: 'metric-membership-proposal-view-v1', workspaceId, runId, pairId, adoptionId, proposalId, createdAt: at, assignments });
    if (path.endsWith(`/metric-membership-receipts/${receiptId}`)) {
      review = { ...review, acceptedCount: 2, pendingCount: 0, complete: true, acceptedReceiptIds: [receiptId],
        records: review.records.map((row, i) => ({ ...row, state: 'ACCEPTED', classification: i ? 'UNKNOWN' : 'CORE_CANDIDATE', group: 'sample', proposalId })) };
      return json({ contractVersion: 'metric-membership-acceptance-view-v1', workspaceId, runId, receiptId, proposalId, acceptedAt: at, selectedRecordKeys: keys });
    }
    return json(review);
  }) as typeof fetch);
  try {
    assert.equal(posts.length, 0);
    await setField(dom.container, '#ra-classification-rule', adoptionId); await settle();
    for (const [title, classification] of [['Đồ chơi A', 'CORE_CANDIDATE'], ['Phụ kiện B', 'UNKNOWN']]) {
      await act(async () => dom.container.querySelector<HTMLInputElement>(`[aria-label="Chọn ${title}"]`)!.click());
      await setField(dom.container, `[aria-label="Phân loại ${title}"]`, classification!);
      await setField(dom.container, `[aria-label="Nhóm ${title}"]`, 'sample');
    }
    await setField(dom.container, '#ra-classification-search', 'Đồ chơi A');
    assert.match(dom.container.textContent!, /Đã chọn 2 dòng, trong đó 1 dòng/);
    await click(dom.container, 'Lưu đề xuất và xem lại lựa chọn'); await settle();
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]!.body.assignments, [{ recordKey: keys[0], classification: 'CORE_CANDIDATE', group: 'sample' }, { recordKey: keys[1], classification: 'UNKNOWN', group: 'sample' }]);
    await click(dom.container, 'Xem xác nhận duyệt');
    const dialog = dom.container.querySelector<HTMLElement>('[role="dialog"]')!;
    assert.match(dialog.textContent!, /Phụ kiện B/);
    assert.match(dialog.textContent!, /Chưa xác định/);
    await click(dialog, 'Hủy'); assert.equal(posts.length, 1, 'cancelling cannot accept rows');
    await click(dom.container, 'Xem xác nhận duyệt');
    await click(dom.container.querySelector<HTMLElement>('[role="dialog"]')!, 'Xác nhận'); await settle();
    assert.equal(posts.length, 2, 'acceptance does not create reports');
    assert.deepEqual(posts[1]!.body.selectedRecordKeys, keys);
    assert.match(dom.container.textContent!, /2\/2 dòng đã duyệt/);
    await click(dom.container, 'Tạo bản báo cáo từ phân loại đã duyệt');
    assert.equal(posts.length, 2);
    await click(dom.container.querySelector<HTMLElement>('[role="dialog"]')!, 'Xác nhận'); await settle();
    assert.equal(posts.length, 3);
    assert.deepEqual(posts[2]!.body.acceptedMetric, { adoptionId, receiptIds: [receiptId] });
    assert.deepEqual(posts[2]!.body.sources, { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } });
    assert.equal(posts[2]!.body.previousPairId, pairId);
    assert.equal(dom.activities(), 1);
  } finally { await dom.cleanup(); }
});

test('rule form starts blank, only adopts after confirmation, and retries an uncertain write with one frozen request', async () => {
  const posts: any[] = [];
  let resolveRetry!: (response: Response) => void;
  const dom = await mount((async (url, init) => {
    if (init?.method === 'POST') {
      posts.push(JSON.parse(String(init.body)));
      if (posts.length === 1) throw new Error('lost synthetic response');
      return new Promise<Response>(resolve => { resolveRetry = resolve; });
    }
    assert.ok(String(url).endsWith('/metric-rule-adoptions'));
    return json({ contractVersion: 'automation-metric-rule-list-v1', workspaceId, runId, adoptions: [] });
  }) as typeof fetch);
  try {
    await click(dom.container, 'Soạn quy tắc');
    const fields = [...dom.container.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('form input, form textarea')];
    assert.equal(fields.length, 7);
    assert.ok(fields.every(field => field.value === ''), 'no product-specific definitions may be invented');
    for (let i = 0; i < fields.length; i++) {
      fields[i]!.id = `fixture-field-${i}`;
      await setField(dom.container, `#fixture-field-${i}`, `Định nghĩa mẫu thử ${i}`);
    }
    await click(dom.container, 'Xem lại quy tắc'); assert.equal(posts.length, 0);
    await click(dom.container.querySelector<HTMLElement>('[role="dialog"]')!, 'Xác nhận'); await settle();
    assert.equal(posts.length, 1);
    assert.equal(posts[0].expectedRevision, 4);
    assert.equal(posts[0].rulebook.wideUnknownPolicy, 'exclude');
    assert.equal(button(dom.container, 'Đóng soạn quy tắc').disabled, true);
    await act(async () => { const retry = button(dom.container, 'Thử lại đúng thao tác'); retry.click(); retry.click(); });
    assert.equal(posts.length, 2, 'double click while retry pending sends only one request');
    assert.deepEqual(posts[1], posts[0]);
    await dom.unmount();
    await act(async () => resolveRetry(json({ ...rule, rulebook: posts[0].rulebook, exactRetry: true })));
    assert.equal(dom.activities(), 0, 'a late result cannot refresh or navigate a newer page');
    assert.equal(dom.container.childElementCount, 0);
    assert.equal(posts.length, 2);
  } finally { await dom.cleanup(); }
});
