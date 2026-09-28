import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, act } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const interpretationId = '44444444-4444-4444-8444-444444444444';
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
    if (url.endsWith('/versions/1/interpretations')) return json({ contractVersion: '1.0.0', reportId, reportVersion: 1, interpretations: [] });
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
    assert.match(dom.container.textContent ?? '', /4\/30 phần/);
    assert.match(dom.container.textContent ?? '', /Phiên bản báo cáo này chưa có nhận định AI đã lưu/);
  } finally {
    await act(async () => { root.unmount(); });
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

test('report panel reads one explicit saved interpretation with its evidence links and limits', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: ResearchReportsPanel } = await tsImport('../src/ResearchReportsPanel.tsx', {
    parentURL: import.meta.url,
    tsconfig: 'frontend/tsconfig.json',
  }) as typeof import('../src/ResearchReportsPanel');
  const originalFetch = globalThis.fetch;
  const requests: string[] = [];
  globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push(url);
    if (url.endsWith(`/versions/1/interpretations/${interpretationId}`)) return json({
      contractVersion: '1.0.0', reportId, reportVersion: 1,
      interpretation: {
        interpretationId, interpretationNumber: 1, interpretationContentSha256: 'b'.repeat(64), completedAt: at, storedAt: at,
        source: { semanticVersionId: 'a'.repeat(64), packetId: 'c'.repeat(64), packetSha256: 'd'.repeat(64), claimsSha256: 'e'.repeat(64) },
        generation: { providerId: 'offline-fixture', modelId: 'model-pinned', promptId: 'report-insight', promptVersion: 3, outputSchemaVersion: '1.0.0' },
        items: [{
          itemId: 'f'.repeat(64), sectionId: 'M01', kind: 'INTERPRETATION',
          conclusion: 'Nhóm rộng giữ phần lớn listing quan sát sau khi loại OUTSIDE.',
          evidenceLogic: 'So sánh số listing WIDE với ALL trong cùng scope và cùng kỳ đo.',
          supportingClaimIds: ['claim-wide-listing'],
          citations: [{ claimId: 'claim-wide-listing', sectionId: 'M01', statementKind: 'LISTING_COUNT', scopeKey: 'wide', value: 210, unit: 'listing', metricPointer: '/results/wide/listingCount', scopePointer: '/input/scope', membershipPointer: '/results/wide/members', denominatorPointer: '/results/all/listingCount', coveragePointer: null, limitations: ['Listing không đồng nghĩa sản phẩm duy nhất.'] }],
          assumptions: ['Taxonomy đã được khóa cho report version này.'],
          limitations: ['Không suy ra quy mô toàn thị trường từ tập listing quan sát.'],
        }],
        limitations: ['AI không phải evidence nguồn.', 'Chưa có quyết định phê duyệt của người dùng.'],
      },
    });
    if (url.endsWith('/versions/1/interpretations')) return json({
      contractVersion: '1.0.0', reportId, reportVersion: 1,
      interpretations: [{ interpretationId, interpretationNumber: 1, interpretationContentSha256: 'b'.repeat(64), completedAt: at, storedAt: at, sourceSemanticVersionId: 'a'.repeat(64), sourcePacketId: 'c'.repeat(64), providerId: 'offline-fixture', modelId: 'model-pinned', promptId: 'report-insight', promptVersion: 3, itemCount: 1, sectionIds: ['M01'] }],
    });
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
    const select = dom.container.querySelector('select') as HTMLSelectElement;
    await act(async () => {
      select.value = '1';
      select.dispatchEvent(new dom.container.ownerDocument.defaultView!.Event('change', { bubbles: true }));
      await settle();
    });
    assert.ok(requests.includes(`/api/reports/${reportId}/versions/1/interpretations`));
    assert.equal(requests.some(url => url.endsWith(`/${interpretationId}`)), false);
    assert.match(dom.container.textContent ?? '', /Chưa được duyệt/);
    assert.match(dom.container.textContent ?? '', /không trở thành bằng chứng nguồn hoặc quyết định của bạn/);
    const runButton = [...dom.container.querySelectorAll('button')].find(button => button.textContent?.includes('Lần diễn giải 1'));
    assert.ok(runButton);
    await act(async () => { runButton.click(); await settle(); });
    assert.ok(requests.includes(`/api/reports/${reportId}/versions/1/interpretations/${interpretationId}`));
    const text = dom.container.textContent ?? '';
    assert.match(text, /Nhóm rộng giữ phần lớn listing quan sát/);
    assert.match(text, /So sánh số listing WIDE với ALL/);
    assert.match(text, /claim-wide-listing/);
    assert.match(text, /Taxonomy đã được khóa/);
    assert.match(text, /Không suy ra quy mô toàn thị trường/);
    assert.match(text, /Chưa có quyết định phê duyệt của người dùng/);
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
