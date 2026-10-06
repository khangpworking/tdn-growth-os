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

function status(): ResearchAutomationSourceStatus {
  return { contractVersion: 'research-automation-source-status-v1', workspaceId, checkedAt: '2026-02-03T00:00:00.000Z', executorEnabled: true, sources: [
    entry({ source: 'KALODATA', dataCount: 2, lastDataAt: '2026-02-03T00:00:00.000Z', lastUsageAt: '2026-02-03T00:00:01.000Z' }),
    entry({ source: 'SERPAPI', state: 'CONFIGURED_NOT_WIRED', wiredIntoRuns: false }),
    entry({ source: 'APIFY_SHOPEE', state: 'NOT_CONFIGURED' }),
    entry({ source: 'METRIC', state: 'MANUAL_IMPORT', credential: 'NOT_REQUIRED', paid: false }),
  ] };
}

test('source state labels separate a missing key from a token without a spending cap', async () => {
  const { sourceStateView } = await tsImport('../src/research-automation/SourceStatusBoard.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/SourceStatusBoard');
  assert.equal(sourceStateView(entry({ source: 'KALODATA' })).tone, 'ready');
  assert.equal(sourceStateView(entry({ source: 'SERPAPI', state: 'CONFIGURED_NOT_WIRED' })).label, 'Có khóa, chưa dùng');
  assert.match(sourceStateView(entry({ source: 'APIFY_SHOPEE', state: 'NOT_CONFIGURED' })).detail, /thiếu hạn mức chi/);
  assert.equal(sourceStateView(entry({ source: 'KALODATA', state: 'NOT_CONFIGURED', credential: 'MISSING' })).detail, 'Chưa cài khóa trên máy chủ.');
  assert.equal(sourceStateView(entry({ source: 'METRIC', state: 'EXECUTOR_DISABLED' })).tone, 'off');
});

test('source board renders one card per source, rejects another workspace and never loads in demo', async () => {
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
    const cards = [...document.querySelectorAll<HTMLElement>('.ra-source')];
    assert.deepEqual(cards.map(card => card.dataset.source), ['KALODATA', 'SERPAPI', 'APIFY_SHOPEE', 'METRIC']);
    assert.deepEqual(cards.map(card => card.querySelector('.status-pill')?.textContent), ['Đã kết nối', 'Có khóa, chưa dùng', 'Chưa kết nối', 'Nhập tay']);
    assert.match(cards[0]!.textContent!, /2 lần thu/);
    assert.match(cards[3]!.textContent!, /Không tốn phí/);
    assert.equal(cards[3]!.textContent!.includes('Gọi gần nhất'), false, 'Manual uploads have no paid call history');

    response = { ...status(), workspaceId: '99999999-9999-4999-8999-999999999999' };
    await act(async () => [...document.querySelectorAll('button')].find(item => item.textContent === 'Kiểm tra lại')!.click());
    assert.equal(urls.length, 2);
    assert.match(document.querySelector('.ra-sources [role="alert"]')!.textContent!, /không đúng workspace/);
  } finally { await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup(); }
});
