import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import type { ResearchAutomationRun } from '../src/research-automation/api';
import type {
  AutomationReportRevisionRequest,
  ResearchAutomationReportAttemptList,
  ResearchAutomationReportPair,
  ResearchAutomationReportVersionList,
  ResearchAutomationRevisionReceipt,
} from '../src/research-automation/report-revisions-api';
import type { ResearchAutomationPreparedMetricEntry, ResearchAutomationMetricPrepareRequest } from '../src/research-automation/api';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const attemptId = '33333333-3333-4333-8333-333333333333';
const packageId = '66666666-6666-4666-8666-666666666666';
const token = 'synthetic-owner-token-1234567890-only';
const pairOne = 'a'.repeat(64);
const pairTwo = 'b'.repeat(64);
const versionOne = 'c'.repeat(64);
const versionTwo = 'd'.repeat(64);

const json = (value: unknown, status = 200): Response => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function pair(pairId: string, versionNumber: number, pairAttemptId: string | null, pdfAvailable = true): ResearchAutomationReportPair {
  return {
    pairId,
    versionNumber,
    attemptId: pairAttemptId,
    outputs: [
      { kind: 'MARKET', versionId: versionOne, pdfAvailable },
      { kind: 'INSIGHT', versionId: versionTwo, pdfAvailable },
    ],
  };
}

function versionList(versions: ResearchAutomationReportPair[]): ResearchAutomationReportVersionList {
  return { contractVersion: 'automation-report-version-list-v1', workspaceId, runId, versions };
}

function attemptList(attempts: ResearchAutomationRevisionReceipt[]): ResearchAutomationReportAttemptList {
  return { contractVersion: 'automation-report-attempt-list-v1', workspaceId, runId, attempts };
}

function runFixture(): ResearchAutomationRun {
  const period = { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 };
  return {
    contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 1, status: 'DRAFT_READY', country: 'VN', mode: 'CATEGORY', keyword: 'đồ chơi gỗ',
    description: null, interview: {}, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'],
    definition: { definition: 'Đồ chơi gỗ', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], confirmedAt: '2026-10-02T00:00:00.000Z' },
    productCards: [], coverage: { requestedPeriod: period, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
    steps: [
      { stepId: 'QUICK_SEARCH', state: 'SUCCEEDED', code: null, message: null, startedAt: null, finishedAt: null },
      { stepId: 'COLLECTION', state: 'SUCCEEDED', code: null, message: null, startedAt: null, finishedAt: null },
      { stepId: 'REPORTS', state: 'SUCCEEDED', code: null, message: null, startedAt: null, finishedAt: null },
    ],
    blockers: [], createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
  };
}

function sourceRequest(): ResearchAutomationMetricPrepareRequest {
  return {
    contractVersion: 'automation-metric-prepare-v1', requestKey: '77777777-7777-4777-8777-777777777777', expectedRevision: 1,
    scope: { definition: 'Đồ chơi gỗ', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [] },
    sourceLabel: 'Bảng giá đã lưu', sourceContext: 'Tệp tổng hợp do người dùng cung cấp',
    measurementPeriod: { startDate: '2025-10-03', endDate: '2026-10-02', basis: 'Bộ lọc ngày trên tệp' },
    selection: 'UNSPECIFIED', acquiredAt: null, precision: { revenue: 'unknown', units: 'unknown' },
  };
}

function sourceEntry(): ResearchAutomationPreparedMetricEntry {
  return { packageId, recordCount: 3, request: sourceRequest(), provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' };
}

function sourceList(sources: ResearchAutomationPreparedMetricEntry[] = []): Record<string, unknown> {
  return { contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId, sources };
}

async function settle(): Promise<void> {
  await act(async () => { await new Promise<void>(resolve => setTimeout(resolve, 0)); });
}

function button(container: HTMLElement, text: string): HTMLButtonElement {
  const found = [...container.querySelectorAll('button')].find(item => item.textContent?.trim() === text);
  assert.ok(found, `missing button: ${text}`);
  return found as HTMLButtonElement;
}

async function click(container: HTMLElement, text: string): Promise<void> {
  await act(async () => { button(container, text).click(); });
}

async function select(container: HTMLElement, id: string, value: string): Promise<void> {
  const field = container.querySelector<HTMLSelectElement>(`#${id}`);
  assert.ok(field, `missing select: ${id}`);
  const setter = Object.getOwnPropertyDescriptor(field.ownerDocument.defaultView!.HTMLSelectElement.prototype, 'value')!.set!;
  await act(async () => { setter.call(field, value); field.dispatchEvent(new field.ownerDocument.defaultView!.Event('change', { bubbles: true })); });
}

async function input(container: HTMLElement, id: string, value: string): Promise<void> {
  const field = container.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  assert.ok(field, `missing field: ${id}`);
  const prototype = field.tagName === 'TEXTAREA' ? field.ownerDocument.defaultView!.HTMLTextAreaElement.prototype : field.ownerDocument.defaultView!.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')!.set!;
  await act(async () => { setter.call(field, value); field.dispatchEvent(new field.ownerDocument.defaultView!.Event('input', { bubbles: true })); field.dispatchEvent(new field.ownerDocument.defaultView!.Event('change', { bubbles: true })); });
}

function outputLinks(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLAnchorElement>('.ra-output a')].map(link => link.getAttribute('href') ?? '');
}

test('parent classification writes require verified KEEP sources and explain pending, failed or changed selections', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  let resolveInventory!: (response: Response) => void;
  let delayed = true;
  let writes = 0;
  globalThis.fetch = (async (url, init) => {
    const address = String(url);
    if (init?.method === 'POST') { writes++; throw new Error('No write is expected'); }
    if (address.endsWith('/report-versions')) return json(versionList([pair(pairOne, 1, null)]));
    if (address.endsWith('/report-attempts')) return json(attemptList([]));
    if (address.endsWith('/metric-rule-adoptions')) return json({ contractVersion: 'automation-metric-rule-list-v1', workspaceId, runId, adoptions: [] });
    if (address.endsWith('/sources/metric')) return delayed ? new Promise<Response>(resolve => { resolveInventory = resolve; }) : json(sourceList([sourceEntry()]));
    throw new Error(`unexpected URL ${address}`);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReportVersionsPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReportVersionsPanel');
  const root = createRoot(dom.container);
  const blocked: Record<string, boolean> = {};
  try {
    await act(async () => root.render(createElement(Panel, { run: runFixture(), ownerToken: token, writesAvailable: true })));
    await settle();
    await click(dom.container, 'Duyệt phân loại mẫu'); await settle();
    blocked.loading = button(dom.container, 'Soạn quy tắc').disabled;
    await act(async () => resolveInventory(json({ error: { code: 'INTEGRITY_ERROR', message: 'Không xác minh được nguồn.' } }, 500)));
    await settle();
    blocked.failed = button(dom.container, 'Soạn quy tắc').disabled;
    delayed = false;
    await click(dom.container, 'Tải lại danh sách nguồn'); await settle();
    assert.equal(button(dom.container, 'Soạn quy tắc').disabled, false, 'verified KEEP permits classification');
    for (const choice of ['SKIPPED', packageId]) {
      await select(dom.container, 'ra-metric-choice', choice); await settle();
      blocked[choice] = button(dom.container, 'Soạn quy tắc').disabled;
    }
    await select(dom.container, 'ra-metric-choice', 'KEEP'); await settle();
    await select(dom.container, 'ra-revision-native', 'SKIP'); await settle();
    blocked.nativeSkipped = button(dom.container, 'Soạn quy tắc').disabled;
    const guidance = dom.container.querySelector('.ra-classification')?.textContent ?? '';
    await select(dom.container, 'ra-revision-native', 'KEEP'); await settle();
    assert.equal(button(dom.container, 'Soạn quy tắc').disabled, false, 'restoring KEEP releases the source gate');
    assert.deepEqual(blocked, { loading: true, failed: true, SKIPPED: true, [packageId]: true, nativeSkipped: true });
    assert.match(guidance, /giữ.*nguồn review/i, 'the child explains the exact recovery, not a fictitious running job');
    assert.equal(writes, 0);
  } finally {
    await act(async () => root.unmount()); globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('mounted reload restores active work without POST, holds the straddled commit, and switches exact pair links explicitly', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  let versions = versionList([pair(pairOne, 1, null)]);
  let attempts = attemptList([{ attemptId, attemptNumber: 1, state: 'COMMITTED', pairId: pairTwo, exactRetry: false }]);
  let readError = false;
  const posts: string[] = [];
  globalThis.fetch = (async (url, init) => {
    if (init?.method === 'POST') { posts.push(String(url)); return json({}); }
    if (String(url).endsWith('/report-versions')) return readError ? json({ error: { code: 'INTEGRITY_ERROR', message: 'Không xác minh được lịch sử phiên bản.' } }, 500) : json(versions);
    if (String(url).endsWith('/report-attempts')) return json(attempts);
    if (String(url).endsWith('/sources/metric')) return json(sourceList());
    throw new Error(`unexpected URL ${String(url)}`);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReportVersionsPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReportVersionsPanel');
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(createElement(Panel, { run: runFixture(), ownerToken: token, writesAvailable: true })));
    await settle();
    assert.equal(posts.length, 0, 'restoring retained work must remain read-only');
    assert.match(dom.container.textContent ?? '', /Đã lưu phiên bản/);
    assert.equal(button(dom.container, 'Tạo phiên bản báo cáo bổ sung').disabled, true, 'a committed receipt without its pair must not permit a stale predecessor write');
    assert.match(dom.container.textContent ?? '', /Đang xác minh các phiên bản đã lưu/);

    versions = versionList([pair(pairOne, 1, null), pair(pairTwo, 2, attemptId)]);
    attempts = attemptList([{ attemptId, attemptNumber: 1, state: 'COMMITTED', pairId: pairTwo, exactRetry: false }]);
    await click(dom.container, 'Tải lại lịch sử');
    await settle();
    assert.deepEqual(outputLinks(dom.container), [
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairOne}/reports/market`,
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairOne}/reports/market/pdf`,
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairOne}/reports/insight`,
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairOne}/reports/insight/pdf`,
    ], 'reload preserves the explicitly selected original pair');
    await select(dom.container, 'ra-report-version', pairTwo);
    assert.deepEqual(outputLinks(dom.container), [
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairTwo}/reports/market`,
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairTwo}/reports/market/pdf`,
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairTwo}/reports/insight`,
      `/api/workspaces/${workspaceId}/research-automation/runs/${runId}/report-versions/${pairTwo}/reports/insight/pdf`,
    ]);
    versions = versionList([]);
    attempts = attemptList([]);
    await click(dom.container, 'Tải lại lịch sử');
    await settle();
    assert.match(dom.container.textContent ?? '', /Chưa có cặp báo cáo đã lưu/);
    assert.equal(button(dom.container, 'Tạo phiên bản báo cáo bổ sung').disabled, true);
    readError = true;
    await click(dom.container, 'Tải lại lịch sử');
    await settle();
    assert.ok(dom.container.querySelector('[role="alert"]'));
    assert.match(dom.container.textContent ?? '', /Tải lại và xác minh lịch sử trước khi tiếp tục/);
    assert.equal(button(dom.container, 'Tạo phiên bản báo cáo bổ sung').disabled, true);
    assert.equal(posts.length, 0);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

test('mounted source intake stays unselected after abandon, and create confirmation retries one immutable body after connection loss', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const uploadSnapshots: Array<{ body: ResearchAutomationMetricPrepareRequest; name: string; bytes: Uint8Array }> = [];
  let uploadCalls = 0;
  let abortUpload: (() => void) | undefined;
  let savedSources: ResearchAutomationPreparedMetricEntry[] = [];
  const originalVersions = versionList([pair(pairOne, 1, null)]);
  globalThis.fetch = (async (url, init) => {
    const address = String(url);
    const method = init?.method ?? 'GET';
    if (method === 'POST' && address.endsWith('/sources/metric')) {
      const form = init?.body as FormData;
      const request = JSON.parse(String(form.get('metadata'))) as ResearchAutomationMetricPrepareRequest;
      uploadCalls++;
      requests.push({ url: address, method, body: request });
      const workbook = form.get('workbook') as File;
      uploadSnapshots.push({ body: request, name: workbook.name, bytes: new Uint8Array(await workbook.arrayBuffer()) });
      savedSources = [{ ...sourceEntry(), request }];
      if (uploadCalls <= 2) return new Promise<Response>((_, reject) => {
        abortUpload = () => reject(new DOMException('The operation was aborted.', 'AbortError'));
        init?.signal?.addEventListener('abort', abortUpload, { once: true });
      });
      return json({ contractVersion: 'automation-metric-prepared-v1', requestKey: request.requestKey, packageId, state: 'PREPARED_NOT_ADMITTED', exactRetry: true, recordCount: 3, sourceLabel: request.sourceLabel, measurementPeriod: request.measurementPeriod, acquiredAt: null, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' });
    }
    if (method === 'POST' && address.endsWith('/report-revisions')) {
      const body = JSON.parse(String(init?.body)) as AutomationReportRevisionRequest;
      requests.push({ url: address, method, body });
      if (requests.filter(item => item.url.endsWith('/report-revisions')).length === 1) throw new TypeError('synthetic connection loss');
      return json({ attemptId, attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
    }
    if (address.endsWith('/report-versions')) return json(originalVersions);
    if (address.endsWith('/report-attempts')) return json(attemptList([]));
    if (address.endsWith('/sources/metric')) return json(sourceList(savedSources));
    throw new Error(`unexpected URL ${address}`);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReportVersionsPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReportVersionsPanel');
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(createElement(Panel, { run: runFixture(), ownerToken: token, writesAvailable: true })));
    await settle();
    const file = new File([new Uint8Array([1, 2, 3])], 'metric.xlsx', { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileField = dom.container.querySelector<HTMLInputElement>('#ra-metric-file');
    assert.ok(fileField);
    Object.defineProperty(fileField, 'files', { configurable: true, value: [file] });
    await act(async () => fileField.dispatchEvent(new fileField.ownerDocument.defaultView!.Event('change', { bubbles: true })));
    await input(dom.container, 'ra-metric-label', 'Bảng giá đã lưu');
    await input(dom.container, 'ra-metric-context', 'Tệp tổng hợp do người dùng cung cấp');
    await input(dom.container, 'ra-metric-start', '2025-10-03');
    await input(dom.container, 'ra-metric-end', '2026-10-02');
    await input(dom.container, 'ra-metric-basis', 'Bộ lọc ngày trên tệp');
    await click(dom.container, 'Lưu nguồn, chưa đưa vào báo cáo');
    await settle();
    assert.ok(abortUpload);
    await click(dom.container, 'Dừng chờ tải');
    await settle();
    assert.match(dom.container.textContent ?? '', /Chưa biết máy chủ đã lưu tệp/);
    await click(dom.container, 'Thử lại đúng lượt tải');
    await settle();
    await click(dom.container, 'Dừng chờ tải');
    await settle();
    await click(dom.container, 'Bỏ lượt chờ, tải lại danh sách');
    await settle();
    assert.equal(uploadSnapshots.length, 2);
    assert.deepEqual(uploadSnapshots[1]!.body, uploadSnapshots[0]!.body, 'upload retry keeps the exact metadata request');
    assert.equal(uploadSnapshots[1]!.name, uploadSnapshots[0]!.name);
    assert.deepEqual(uploadSnapshots[1]!.bytes, uploadSnapshots[0]!.bytes, 'upload retry keeps the exact original file');
    assert.equal((dom.container.querySelector('#ra-metric-choice') as HTMLSelectElement).value, 'KEEP', 'a prepared receipt never auto-selects or admits its source');
    assert.match(dom.container.textContent ?? '', /Đã bỏ lượt chờ\. Nguồn máy chủ đã lưu vẫn có thể xuất hiện/);

    await select(dom.container, 'ra-metric-choice', packageId);
    await settle();
    assert.equal((dom.container.querySelector('#ra-metric-choice') as HTMLSelectElement).value, packageId);
    await click(dom.container, 'Tạo phiên bản báo cáo bổ sung');
    const dialog = dom.container.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.match(dialog.textContent ?? '', /Bảng giá đã lưu/);
    assert.equal(requests.filter(item => item.url.endsWith('/report-revisions')).length, 0);
    const confirm = button(dom.container, 'Xác nhận tạo phiên bản');
    await act(async () => { confirm.click(); confirm.click(); });
    await settle();
    assert.equal(requests.filter(item => item.url.endsWith('/report-revisions')).length, 1, 'double confirmation does not duplicate the owner request');
    assert.match(dom.container.textContent ?? '', /Chưa biết máy chủ đã nhận lượt bổ sung/);
    await click(dom.container, 'Thử lại đúng lượt bổ sung');
    await settle();
    const createBodies = requests.filter(item => item.url.endsWith('/report-revisions')).map(item => item.body);
    assert.equal(createBodies.length, 2);
    assert.deepEqual(createBodies[1], createBodies[0], 'connection retry reuses the immutable body, including requestKey and previousPairId');
    assert.deepEqual((createBodies[0] as AutomationReportRevisionRequest).sources, { metric: { decision: 'USE_PREPARED', packageId }, nativeReview: { decision: 'KEEP' } });
    assert.equal(requests.filter(item => item.url.endsWith('/sources/metric')).length, 2);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});

test('mounted cancel requires confirmation and retries the same exact attempt and retry key after a connection loss', async () => {
  const dom = setupDom();
  const originalFetch = globalThis.fetch;
  const cancelBodies: unknown[] = [];
  let attempts = attemptList([{ attemptId, attemptNumber: 1, state: 'RUNNING', pairId: null, exactRetry: false }]);
  globalThis.fetch = (async (url, init) => {
    const address = String(url);
    if ((init?.method ?? 'GET') === 'POST' && address.endsWith('/cancel')) {
      cancelBodies.push(JSON.parse(String(init?.body)));
      if (cancelBodies.length === 1) throw new TypeError('synthetic connection loss');
      attempts = attemptList([{ attemptId, attemptNumber: 1, state: 'CANCELLED', pairId: null, exactRetry: false }]);
      return json({ attemptId, attemptNumber: 1, state: 'CANCELLED', pairId: null, exactRetry: false });
    }
    if (address.endsWith('/report-versions')) return json(versionList([pair(pairOne, 1, null)]));
    if (address.endsWith('/report-attempts')) return json(attempts);
    if (address.endsWith('/sources/metric')) return json(sourceList());
    throw new Error(`unexpected URL ${address}`);
  }) as typeof fetch;
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/research-automation/ReportVersionsPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/research-automation/ReportVersionsPanel');
  const root = createRoot(dom.container);
  try {
    await act(async () => root.render(createElement(Panel, { run: runFixture(), ownerToken: token, writesAvailable: true })));
    await settle();
    await click(dom.container, 'Hủy lượt bổ sung 1');
    assert.equal(cancelBodies.length, 0, 'opening the cancel dialog is not a write');
    assert.match(dom.container.querySelector('[role="dialog"]')?.textContent ?? '', /Không xóa nguồn hoặc phiên bản báo cáo đã lưu/);
    await click(dom.container, 'Xác nhận hủy lượt');
    await settle();
    assert.equal(cancelBodies.length, 1);
    assert.match(dom.container.textContent ?? '', /Chưa kết nối được dịch vụ phiên bản báo cáo/);
    await click(dom.container, 'Hủy lượt bổ sung 1');
    await click(dom.container, 'Xác nhận hủy lượt');
    await settle();
    assert.equal(cancelBodies.length, 2);
    assert.deepEqual(cancelBodies[1], cancelBodies[0], 'the retry keeps the exact attempt and request key');
    assert.deepEqual(cancelBodies[0], { contractVersion: 'automation-report-revision-cancel-v1', requestKey: (cancelBodies[0] as { requestKey: string }).requestKey });
    assert.match(dom.container.textContent ?? '', /Đã xác minh kết quả hủy/);
    assert.match(dom.container.textContent ?? '', /Đã hủy/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch;
    dom.cleanup();
  }
});
