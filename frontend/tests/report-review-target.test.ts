import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import { loadReportReviewTarget, ReportReviewTargetDataError } from '../src/report-review-data-source';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const reportId = '22222222-2222-4222-8222-222222222222';
const versionId = '33333333-3333-4333-8333-333333333333';
const interpretationId = '44444444-4444-4444-8444-444444444444';
const targetId = 'f'.repeat(64);
const at = '2026-10-01T00:00:00.000Z';
const intendedUse = 'Review nội bộ cơ hội thị trường trước khi lập danh sách ứng viên.';

const target = {
  contractVersion: '1.0.0', reviewTargetId: targetId, policyVersion: 'report-review-target-v1',
  report: { reportId, reportKey: 'market-canxi', versionId, version: 1, semanticVersionId: 'a'.repeat(64), createdAt: at },
  approvalScope: {
    workspaceId, sourcePackageId: '55555555-5555-4555-8555-555555555555', sourcePackageManifestSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64),
    selectedSources: [
      { ordinal: 0, role: 'workbook', logicalPath: 'metric.xlsx', sha256: 'd'.repeat(64) },
      { ordinal: 1, role: 'manifest', logicalPath: 'scope.json', sha256: 'e'.repeat(64) },
    ],
    marketKey: 'canxi', productKey: null, platform: 'shopee', selection: 'ON', start: '2024-08-10', end: '2026-08-10', periodBasis: 'Metric filter', acquiredAt: null,
    geography: 'UNSPECIFIED', intendedUse, sourceRights: 'UNSPECIFIED',
  },
  renderedReport: { fileName: 'report.html', sha256: '1'.repeat(64), mediaType: 'text/html; charset=utf-8', byteSize: 1200 },
  calculation: {
    packetId: '2'.repeat(64), packetSha256: '3'.repeat(64), catalogSha256: '4'.repeat(64), resultSha256: '5'.repeat(64), claimsSha256: '6'.repeat(64),
    packetPolicyVersion: 'report-packet-v1', metricMethodVersion: 'metric-method-v1', metricRounding: 'HALF_UP',
    sections: [{ sectionId: 'M01', sectionContentSha256: '7'.repeat(64), deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT' }],
  },
  interpretation: {
    interpretationId, reportVersionId: versionId, sourceSemanticVersionId: 'a'.repeat(64), interpretationNumber: 1, interpretationContentSha256: '8'.repeat(64), artifactSha256: '9'.repeat(64), completedAt: at,
    providerId: 'offline-fixture', modelId: 'model-pinned', promptId: 'report-insight', promptVersion: 3, promptSha256: '0'.repeat(64), outputSchemaVersion: '1.0.0',
  },
  reviewableContent: { purpose: 'INTERNAL_REVIEW_ONLY', reportSectionIds: ['M01'], interpretationSectionIds: ['M01'], interpretationItemIds: ['a1'.padEnd(64, 'a')], claimIds: ['claim-m01'] },
  limitations: [
    'UNAPPROVED_REVIEW_TARGET_NOT_A_HUMAN_DECISION',
    'TARGET_DOES_NOT_TRANSFER_TO_ANOTHER_REPORT_VERSION_INTERPRETATION_SCOPE_USE_OR_RENDERED_FILE',
    'SOURCE_RIGHTS_AND_EXTERNAL_PUBLICATION_NOT_GRANTED',
    'GEOGRAPHY_NOT_DECLARED_IN_SOURCE_SCOPE',
    'REVIEW_AUTHORITY_DELEGATION_AND_REVOCATION_NOT_DEFINED',
  ],
} as const;

const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('OWNER preparation sends the exact snapshot, verifies it through GET, then opens its stable route', { concurrency: false }, async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/ReportReviewTargetCreatePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ReportReviewTargetCreatePanel');
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input); requests.push({ url, init });
    if (url.startsWith('/api/report-review-targets/')) return json(target);
    return json({ contractVersion: '1.0.0', reviewTargetId: targetId, reportId, reportVersion: 1, interpretationId, intendedUse, storedAt: at, exactRetry: false }, 201);
  }) as typeof fetch;
  const navigations: string[] = [];
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Panel, { reportId, reportVersion: 1, interpretationId, interpretationNumber: 1, ownerToken: 'owner-token-123456789012345678901', writesAvailable: true, navigate: (hash: string) => navigations.push(hash), notify: () => undefined })); await settle(); });
    const textarea = dom.container.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => { textarea.value = intendedUse; textarea.dispatchEvent(new dom.container.ownerDocument.defaultView!.Event('input', { bubbles: true })); await settle(); });
    const prepare = [...dom.container.querySelectorAll('button')].find(button => button.textContent === 'Chuẩn bị gói review'); assert.ok(prepare); assert.equal(prepare.disabled, false);
    await act(async () => { prepare.click(); await settle(); });
    const confirm = [...dom.container.querySelectorAll('button')].find(button => button.textContent === 'Chuẩn bị đúng snapshot'); assert.ok(confirm);
    await act(async () => { confirm.click(); await settle(); });
    assert.equal(requests[0]?.url, '/owner-api/report-review-targets');
    assert.deepEqual(JSON.parse(String(requests[0]?.init?.body)), { contractVersion: '1.0.0', reportId, reportVersion: 1, interpretationId, intendedUse });
    assert.equal(requests[1]?.url, `/api/report-review-targets/${targetId}`);
    assert.deepEqual(navigations, [`#/review-targets/${targetId}`]);
  } finally {
    await act(async () => { root.unmount(); }); globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('the stable target page separates four layers and exposes no decision action', { concurrency: false }, async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Page } = await tsImport('../src/ReportReviewTargetPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ReportReviewTargetPage');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => json(target)) as typeof fetch;
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Page, { mode: 'real', reviewTargetId: targetId, navigate: () => undefined })); await settle(); });
    const text = dom.container.textContent ?? '';
    for (const label of ['Evidence nguồn', 'Kết quả tính toán', 'Nhận định AI', 'Quyết định người dùng', 'Chưa được duyệt', intendedUse, 'Quyền duyệt, ủy quyền và thu hồi quyết định chưa được định nghĩa']) assert.match(text, new RegExp(label));
    assert.equal([...dom.container.querySelectorAll('button')].some(button => /duyệt|approve|reject|tạm giữ/i.test(button.textContent ?? '')), false);
    assert.match((dom.container.querySelector('a[href*="report.html"]') as HTMLAnchorElement).href, /report\.html$/);
  } finally {
    await act(async () => { root.unmount(); }); globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('the read boundary rejects fields outside the canonical review-target contract', async () => {
  await assert.rejects(loadReportReviewTarget(targetId, (async () => json({ ...target, reviewer: 'owner' })) as typeof fetch), (error) => error instanceof ReportReviewTargetDataError && error.kind === 'integrity');
});

async function settle(): Promise<void> {
  await Promise.resolve(); await new Promise(resolve => setTimeout(resolve, 0)); await Promise.resolve();
}
