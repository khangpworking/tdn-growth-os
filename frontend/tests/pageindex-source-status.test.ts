import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import type { ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from '../src/research-automation/api';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';

function entry(overrides: Partial<ResearchAutomationSourceStatusEntry> & Pick<ResearchAutomationSourceStatusEntry, 'source'>): ResearchAutomationSourceStatusEntry {
  return { state: 'READY', credential: 'CONFIGURED', wiredIntoRuns: true, paid: true, lastDataAt: null, dataCount: 0, lastUsageAt: null, ...overrides };
}

function pageindexEntry(): ResearchAutomationSourceStatusEntry {
  return entry({ source: 'PAGEINDEX', dataCount: 2, lastUsageAt: '2026-10-07T00:00:00.000Z', pageindex: {
    automaticState: 'INDEXING_PDFS', documentsSent: 2, balanceMicroDollars: 9_990_000,
    balanceCheckedAt: '2026-10-07T00:00:00.000Z', billingUrl: 'https://billing.example.invalid/pageindex',
    activePages: 500, estimatedMonthlyCostMicroDollars: 0, usageLimited: false,
  } });
}

function statusWith(sources: ResearchAutomationSourceStatusEntry[]): ResearchAutomationSourceStatus {
  return { contractVersion: 'research-automation-source-status-v1', workspaceId, checkedAt: '2026-10-07T00:00:00.000Z', executorEnabled: true, sources: sources as ResearchAutomationSourceStatus['sources'] };
}

test('balance formats as dollars and automatic states have plain copy', async () => {
  const board = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  assert.equal(board.formatMicroDollars(9_990_000), '$9.99');
  assert.equal(board.formatMicroDollars(500_000), '$0.50');
  assert.equal(board.formatMicroDollars(null), 'Chưa rõ');
  assert.equal(board.pageIndexAutomaticCopy('INDEXING_PDFS'), 'Đang tự dùng cho PDF');
  assert.equal(board.pageIndexAutomaticCopy('PAUSED_LOW_BALANCE'), 'Tạm dừng vì số dư thấp');
  assert.equal(board.pageIndexAutomaticCopy('DISABLED'), 'Đã tắt');
});

test('run-page notice lists every PDF state and the paused banner', async () => {
  const notice = await tsImport('../src/research-automation/PageIndexPdfNotice.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/PageIndexPdfNotice');
  assert.equal(notice.pageIndexPdfStateCopy('INDEXING').label, 'Đang lập chỉ mục');
  assert.equal(notice.pageIndexPdfStateCopy('READY').label, 'Sẵn sàng');
  assert.equal(notice.pageIndexPdfStateCopy('FAILED').label, 'Lỗi — báo cáo không có trích dẫn từ tài liệu này');
  assert.equal(notice.pageIndexPdfStateCopy('SKIPPED_LOW_BALANCE').label, 'Bỏ qua vì số dư thấp');
  assert.equal(notice.pageIndexPdfStateCopy('SKIPPED_USAGE_LIMIT').label, 'Bỏ qua vì số dư thấp');
  assert.equal(notice.pageIndexPdfStateCopy('DISABLED').label, 'Đã tắt');

  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(createElement(notice.default, {
      documents: [
        { fileName: 'a.pdf', sourceSha256: '1'.repeat(64), state: 'READY' },
        { fileName: 'b.pdf', sourceSha256: '2'.repeat(64), state: 'INDEXING' },
        { fileName: 'c.pdf', sourceSha256: '3'.repeat(64), state: 'FAILED' },
        { fileName: 'd.pdf', sourceSha256: '4'.repeat(64), state: 'SKIPPED_LOW_BALANCE' },
      ],
      paused: true,
    })));
    const text = document.body.textContent ?? '';
    for (const label of ['Sẵn sàng', 'Đang lập chỉ mục', 'Lỗi — báo cáo không có trích dẫn từ tài liệu này', 'Bỏ qua vì số dư thấp', 'Đã tạm dừng gửi PDF mới']) {
      assert.ok(text.includes(label), `missing copy: ${label}`);
    }
    assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Đã tạm dừng gửi PDF mới vì số dư thấp.');
  } finally { await act(async () => root.unmount()); dom.cleanup(); }
});

test('status board shows the PageIndex card and rechecks with GET only', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: SourceStatusBoard } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  const root = createRoot(dom.container);
  const methods: string[] = [];
  globalThis.fetch = (async (url, init) => {
    methods.push(init?.method ?? 'GET');
    assert.ok(String(url).endsWith('/research-automation/source-status'));
    return new Response(JSON.stringify(statusWith([
      entry({ source: 'METRIC', state: 'MANUAL_IMPORT', credential: 'NOT_REQUIRED', paid: false }),
      pageindexEntry(),
    ])));
  }) as typeof fetch;
  try {
    await act(async () => root.render(createElement(SourceStatusBoard, { mode: 'real', workspaceId })));
    const card = document.querySelector<HTMLElement>('.ra-source[data-source="PAGEINDEX"]');
    assert.ok(card, 'PageIndex card renders');
    const text = card!.textContent ?? '';
    assert.match(text, /Đã kết nối/);
    assert.match(text, /Số dư tài khoản \(ước tính\).*\$9\.99/);
    assert.match(text, /Thanh toán/);
    assert.ok(card!.querySelector('a[href="https://billing.example.invalid/pageindex"]'), 'billing link renders');
    assert.match(text, /500 trang/);
    assert.match(text, /Đang tự dùng cho PDF/);
    assert.match(text, /2 PDF trong workspace này/);
    assert.match(text, /Tài liệu đã gửi \(tài khoản\)/);
    assert.match(text, /Gọi gần nhất/);
    await act(async () => [...document.querySelectorAll('button')].find(item => item.textContent === 'Kiểm tra lại')!.click());
    assert.ok(methods.length >= 2 && methods.every(method => method === 'GET'), 'recheck never posts or spends');
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});

test('paused card shows the blocked banner', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: SourceStatusBoard } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  const root = createRoot(dom.container);
  const paused = pageindexEntry();
  globalThis.fetch = (async () => new Response(JSON.stringify(statusWith([{
    ...paused, pageindex: { ...paused.pageindex!, automaticState: 'PAUSED_LOW_BALANCE', balanceMicroDollars: 400_000 },
  }])))) as unknown as typeof fetch;
  try {
    await act(async () => root.render(createElement(SourceStatusBoard, { mode: 'real', workspaceId })));
    const card = document.querySelector<HTMLElement>('.ra-source[data-source="PAGEINDEX"]');
    assert.match(card?.querySelector('[role="alert"]')?.textContent ?? '', /Đã tạm dừng gửi PDF mới/);
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});
