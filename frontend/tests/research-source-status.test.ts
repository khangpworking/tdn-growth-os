import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import type { ResearchAutomationSourceStatus, ResearchAutomationSourceStatusEntry } from '../src/research-automation/api';
import type { BoardEntry } from '../src/research-automation/SourceStatusBoard';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';

function entry(source: string, overrides: Record<string, unknown> = {}): BoardEntry {
  return { state: 'READY', credential: 'CONFIGURED', wiredIntoRuns: true, paid: true,
    lastDataAt: null, dataCount: 0, lastUsageAt: null, source, ...overrides } as unknown as BoardEntry;
}

function status(): ResearchAutomationSourceStatus {
  return { contractVersion: 'research-automation-source-status-v1', workspaceId, checkedAt: '2026-02-03T00:00:00.000Z', executorEnabled: true, sources: [
    entry('METRIC', { state: 'MANUAL_IMPORT', credential: 'NOT_REQUIRED', paid: false }),
    entry('KALODATA', { dataCount: 2, lastDataAt: '2026-02-03T00:00:00.000Z', lastUsageAt: '2026-02-03T00:00:01.000Z' }),
    entry('KALODATA_VIDEO_FILE', { state: 'MANUAL_IMPORT', credential: 'NOT_REQUIRED', paid: false, dataCount: 1 }),
    entry('APIFY_SHOPEE', { state: 'NOT_CONFIGURED', spendCapUsd: null }),
    entry('APIFY_TIKTOK_COMMENTS', { state: 'NOT_BUILT', credential: 'MISSING', wiredIntoRuns: false, pendingPackage: 'P9', registryIds: ['S07'], tier: 'B', group: 'CUSTOMER_VOICE', reportName: 'bình luận công khai dưới video', spendCapUsd: null }),
    entry('VIDEO_READING', { state: 'NOT_BUILT', credential: 'NOT_REQUIRED', wiredIntoRuns: false, paid: false, pendingPackage: 'P9', group: 'SELLER_VOICE' }),
    entry('META_AD_LIBRARY', { state: 'NOT_BUILT', credential: 'NOT_REQUIRED', wiredIntoRuns: false, paid: false, pendingPackage: 'U-23', group: 'SELLER_VOICE' }),
    entry('SERPAPI', { state: 'CONFIGURED_NOT_WIRED', wiredIntoRuns: false, operations: [
      { operation: 'serpapi.google.search', count: 3, lastDataAt: '2026-02-03T00:00:00.000Z', lastUsageAt: null, registryIds: ['S19'], tier: null },
      { operation: 'serpapi.google.trends', count: 0, lastDataAt: null, lastUsageAt: null, registryIds: ['S20'], tier: 'B' },
    ] }),
    entry('OFFICIAL_STATS', { state: 'NOT_BUILT', credential: 'NOT_REQUIRED', wiredIntoRuns: false, paid: false, pendingPackage: 'P10', group: 'MACRO' }),
    entry('WORLD_BANK', { state: 'NOT_BUILT', credential: 'NOT_REQUIRED', wiredIntoRuns: false, paid: false, pendingPackage: 'P10', group: 'MACRO' }),
    entry('PAGEINDEX', { state: 'NOT_CONFIGURED', credential: 'MISSING', wiredIntoRuns: false, pageindex: {
      automaticState: 'DISABLED', documentsSent: 9, balanceMicroDollars: null, balanceCheckedAt: null,
      billingUrl: 'https://dash.pageindex.ai', activePages: 12, estimatedMonthlyCostMicroDollars: null, usageLimited: false,
    } }),
  ] as unknown as ResearchAutomationSourceStatus['sources'] };
}

test('source state labels separate a missing key from a token without a spending cap', async () => {
  const { sourceStateView } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  assert.equal(sourceStateView(entry('KALODATA') as unknown as ResearchAutomationSourceStatusEntry).tone, 'ready');
  assert.equal(sourceStateView(entry('SERPAPI', { state: 'CONFIGURED_NOT_WIRED' }) as unknown as ResearchAutomationSourceStatusEntry).label, 'Có khóa, chưa dùng');
  assert.match(sourceStateView(entry('APIFY_SHOPEE', { state: 'NOT_CONFIGURED' }) as unknown as ResearchAutomationSourceStatusEntry).detail, /thiếu hạn mức chi/);
  assert.equal(sourceStateView(entry('KALODATA', { state: 'NOT_CONFIGURED', credential: 'MISSING' }) as unknown as ResearchAutomationSourceStatusEntry).detail, 'Chưa cài khóa trên máy chủ.');
  assert.equal(sourceStateView(entry('METRIC', { state: 'EXECUTOR_DISABLED' }) as unknown as ResearchAutomationSourceStatusEntry).tone, 'off');
});

test('NOT_BUILT cards name their owning package and never claim to run', async () => {
  const { sourceStateView, formatCapUsd } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  const view = sourceStateView(entry('APIFY_TIKTOK_COMMENTS', { state: 'NOT_BUILT', pendingPackage: 'P9' }) as unknown as ResearchAutomationSourceStatusEntry);
  assert.equal(view.label, 'Chưa có bộ thu');
  assert.match(view.detail, /gói P9/);
  const disabled = sourceStateView(entry('APIFY_TIKTOK_COMMENTS', { state: 'EXECUTOR_DISABLED', pendingPackage: 'P9' }) as unknown as ResearchAutomationSourceStatusEntry);
  assert.equal(disabled.label, 'Máy chủ không chạy', 'Executor-disabled keeps precedence over NOT_BUILT');
  assert.equal(formatCapUsd(3), '$3 mỗi lượt');
  assert.equal(formatCapUsd(null), 'Chưa cấu hình', 'An absent cap is never defaulted to the approved test-run value');
  assert.equal(formatCapUsd(undefined), 'Chưa cấu hình');
});

test('source board renders grouped cards, caps, operations and registry rows, rejects another workspace and never loads in demo', async () => {
  const dom = setupDom(); const originalFetch = globalThis.fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: SourceStatusBoard } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  const root = createRoot(dom.container);
  let response: unknown = status(); const urls: string[] = [];
  globalThis.fetch = (async (url, init) => {
    assert.equal(init?.method ?? 'GET', 'GET');
    urls.push(String(url));
    return new Response(JSON.stringify(response));
  }) as typeof fetch;
  const render = async (mode: 'demo' | 'real', key: string) => act(async () => root.render(createElement(SourceStatusBoard, { key, mode, workspaceId })));
  try {
    await render('demo', 'demo');
    assert.equal(urls.length, 0, 'Demo mode never reads server configuration');
    assert.equal(document.querySelectorAll('.ra-source').length, 0);

    await render('real', 'real');
    assert.deepEqual(urls, [`/api/workspaces/${workspaceId}/research-automation/source-status`]);
    const groups = [...document.querySelectorAll<HTMLElement>('.ra-sources-group')];
    assert.deepEqual(groups.map(group => group.dataset.group), ['SALES_MARKET', 'CUSTOMER_VOICE', 'SELLER_VOICE', 'MACRO', 'DOCUMENTS']);
    const cards = [...document.querySelectorAll<HTMLElement>('.ra-source')];
    assert.equal(cards.length, 11, 'All eleven registry cards render');
    assert.deepEqual(cards.map(card => card.dataset.source), ['METRIC', 'KALODATA', 'KALODATA_VIDEO_FILE', 'SERPAPI',
      'APIFY_SHOPEE', 'APIFY_TIKTOK_COMMENTS', 'VIDEO_READING', 'META_AD_LIBRARY', 'OFFICIAL_STATS', 'WORLD_BANK', 'PAGEINDEX']);
    const pills = new Map(cards.map(card => [card.dataset.source, card.querySelector('.status-pill')?.textContent]));
    assert.equal(pills.get('KALODATA'), 'Đã kết nối');
    assert.equal(pills.get('SERPAPI'), 'Có khóa, chưa dùng');
    assert.equal(pills.get('APIFY_SHOPEE'), 'Chưa kết nối');
    assert.equal(pills.get('METRIC'), 'Nhập tay');
    assert.equal(pills.get('APIFY_TIKTOK_COMMENTS'), 'Chưa có bộ thu');
    const bySource = new Map(cards.map(card => [card.dataset.source, card]));
    assert.match(bySource.get('KALODATA')!.textContent!, /2 lần thu/);
    assert.match(bySource.get('METRIC')!.textContent!, /Theo gói thuê bao/);
    assert.match(bySource.get('KALODATA_VIDEO_FILE')!.textContent!, /Theo gói thuê bao/);
    assert.equal(bySource.get('METRIC')!.textContent!.includes('Gọi gần nhất'), false, 'Manual uploads have no paid call history');
    assert.match(bySource.get('APIFY_TIKTOK_COMMENTS')!.textContent!, /gói P9/);
    assert.match(bySource.get('APIFY_TIKTOK_COMMENTS')!.textContent!, /Trần chi.*Chưa cấu hình/);
    assert.match(bySource.get('WORLD_BANK')!.textContent!, /Không cần khóa/);
    // SerpApi per-operation rows with honest units, including the unbuilt Trends row.
    assert.match(bySource.get('SERPAPI')!.textContent!, /Tìm kiếm Google mở rộng/);
    assert.match(bySource.get('SERPAPI')!.textContent!, /3 lần thu/);
    assert.match(bySource.get('SERPAPI')!.textContent!, /Google Trends/);
    assert.match(bySource.get('SERPAPI')!.textContent!, /Chưa có lượt nào trong workspace/);
    // PageIndex reconciliation: workspace history apart from account totals.
    assert.match(bySource.get('PAGEINDEX')!.textContent!, /Chưa có PDF nào trong workspace này/);
    assert.match(bySource.get('PAGEINDEX')!.textContent!, /Tài liệu đã gửi \(tài khoản\)/);
    assert.match(bySource.get('PAGEINDEX')!.textContent!, /Số dư tài khoản/);
    assert.match(document.querySelector('.ra-sources-note')!.textContent!, /cả tài khoản, không phải của workspace này/);

    response = { ...(status() as unknown as Record<string, unknown>), workspaceId: '99999999-9999-4999-8999-999999999999' };
    await act(async () => [...document.querySelectorAll('button')].find(item => item.textContent === 'Kiểm tra lại')!.click());
    assert.equal(urls.length, 2);
    assert.match(document.querySelector('.ra-sources [role="alert"]')!.textContent!, /không đúng workspace/);
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});
