import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, act } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const at = '2026-10-01T00:00:00.000Z';
const json = (body: unknown): Response => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('report panel requires an explicit version before exposing the stored report', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: ResearchReportsPanel } = await tsImport('../src/ResearchReportsPanel.tsx', {
    parentURL: import.meta.url,
    tsconfig: 'frontend/tsconfig.json',
  }) as typeof import('../src/ResearchReportsPanel');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith('/versions')) return json({
      contractVersion: '1.0.0', reportId, reportKey: 'market-canxi', workspaceId,
      versions: [{
        versionId, version: 1, previousSemanticVersionId: null, semanticVersionId: 'a'.repeat(64), createdAt: at,
        status: 'DRAFT', interpretationState: 'NONE', reviewState: 'UNREVIEWED',
        scope: { key: 'canxi', platform: 'shopee', selection: 'ON', start: '2024-08-10', end: '2026-08-10', periodBasis: 'Metric filter', acquiredAt: null },
        sectionCounts: { total: 30, partialDeterministicDraft: 4, methodOnly: 13, blocked: 12, manualReviewRequired: 1, notImplemented: 0 },
        selectedSourceCount: 2,
        artifacts: [{ fileName: 'report.html', mediaType: 'text/html; charset=utf-8', byteSize: 1200 }, { fileName: 'packet.json', mediaType: 'application/json', byteSize: 800 }],
      }],
    });
    return json({ contractVersion: '1.0.0', workspaceId, reports: [{ reportId, reportKey: 'market-canxi', createdAt: at }] });
  }) as typeof fetch;
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(ResearchReportsPanel, { mode: 'real', workspaceId })); await settle(); });
    const historyButton = [...dom.container.querySelectorAll('button')].find(button => button.textContent?.includes('Kiểm tra lịch sử'));
    assert.ok(historyButton);
    await act(async () => { historyButton.click(); await settle(); });
    const select = dom.container.querySelector('select') as HTMLSelectElement | null;
    assert.ok(select);
    assert.equal(select.value, '');
    assert.equal(dom.container.querySelector('a[href*="report.html"]'), null);
    await act(async () => {
      select.value = '1';
      select.dispatchEvent(new dom.container.ownerDocument.defaultView!.Event('change', { bubbles: true }));
      await settle();
    });
    const reportLink = dom.container.querySelector('a[href*="report.html"]') as HTMLAnchorElement | null;
    assert.ok(reportLink);
    assert.match(reportLink.getAttribute('href') ?? '', new RegExp(`/api/reports/${reportId}/versions/1/files/report\\.html$`));
    assert.match(dom.container.textContent ?? '', /4\/30 section/);
    assert.match(dom.container.textContent ?? '', /AI interpretationChưa tạo/);
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

async function settle(): Promise<void> {
  await Promise.resolve();
  await new Promise(resolve => setTimeout(resolve, 0));
  await Promise.resolve();
}
