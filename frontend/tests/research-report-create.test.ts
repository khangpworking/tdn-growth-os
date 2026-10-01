import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import type { ResearchGenerationInputs, ResearchGenerationReceipt, ResearchGenerationRequest } from '../../contracts/api/research-generation-api.generated';
import { createResearchReport, loadResearchGenerationInputs } from '../src/research-generation-client';
import { setupDom } from './dom';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const token = 'synthetic-owner-token-1234567890-only';
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
function inventory(id = workspaceId): ResearchGenerationInputs {
  return {
    contractVersion: '1.0.0', workspaceId: id, catalogSha256: 'a'.repeat(64),
    choices: [{
      selectionId: 'b'.repeat(64), packageId: '33333333-3333-4333-8333-333333333333', packageManifestSha256: 'c'.repeat(64),
      sourceLabel: 'Nguồn thử nghiệm', packageVersion: 1, sourceName: 'Workbook tổng hợp thử nghiệm',
      period: { start: '2026-08-17', end: '2026-09-15', basis: 'Kỳ khai báo thử nghiệm' },
      workbookPath: 'metric/workbook.xlsx', manifestPath: 'metric/manifest.json', labelsPath: null,
      eligibility: 'VALIDATE_ON_CREATE', limitations: ['LABEL_DECISIONS_NOT_BOUND'],
    }],
  };
}
function receipt(request: ResearchGenerationRequest): ResearchGenerationReceipt {
  return {
    contractVersion: '1.0.0', workspaceId: request.workspaceId, requestKey: request.requestKey,
    reportId: '44444444-4444-4444-8444-444444444444', version: 1, semanticVersionId: 'd'.repeat(64),
    profile: 'source-backed-v1', exactRetry: true, reviewState: 'UNREVIEWED', interpretationState: 'NONE',
    limitations: ['PARTIAL_REPORT', 'M03_PREPARED_METHOD_NOT_EXECUTED'],
  };
}
const methodCandidateIds = {
  descriptiveMethods: 'e'.repeat(64),
  locatedInsightMethods: 'f'.repeat(64),
  methodPackets: '1'.repeat(64),
};
function inventoryWithMethods(): ResearchGenerationInputs {
  const value = inventory();
  const base = value.choices[0]!;
  const methodInputs = () => ({
    descriptiveMethods: [{ methodSelectionId: methodCandidateIds.descriptiveMethods, logicalPath: 'methods/descriptive.json', eligibility: 'VALIDATE_ON_CREATE' as const, limitations: ['SCHEMA_VALIDATED_ONLY'] }],
    locatedInsightMethods: [{ methodSelectionId: methodCandidateIds.locatedInsightMethods, logicalPath: 'methods/located.json', eligibility: 'VALIDATE_ON_CREATE' as const, limitations: ['PACKAGE_RELATION_NOT_DECLARED'] }],
    methodPackets: [{ methodSelectionId: methodCandidateIds.methodPackets, logicalPath: 'methods/packets.json', eligibility: 'VALIDATE_ON_CREATE' as const, limitations: ['CONSUMER_VALIDATION_ON_CREATE'] }],
  });
  return { ...value, choices: [
    { ...base, methodInputs: methodInputs() },
    { ...base, selectionId: 'a'.repeat(64), sourceLabel: 'Nguồn thử nghiệm khác', workbookPath: 'metric/other.xlsx', methodInputs: methodInputs() },
  ] };
}
async function settle() { await new Promise(resolve => setTimeout(resolve, 0)); }
async function choose(container: HTMLElement) {
  const select = container.querySelector('select')!;
  await act(async () => {
    select.value = 'b'.repeat(64);
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  });
}
async function chooseValue(container: HTMLElement, selector: string, value: string) {
  const select = container.querySelector(selector) as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  });
}
async function chooseMethod(container: HTMLElement, index: number, value: string) {
  const select = container.querySelectorAll('fieldset select')[index] as HTMLSelectElement;
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', { bubbles: true }));
    await settle();
  });
}
function submit(container: HTMLElement) {
  container.querySelector('form')!.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

test('creation requires explicit selection, suppresses duplicate submits and retries the exact request after an ambiguous response', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/ResearchReportCreatePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ResearchReportCreatePanel');
  const originalFetch = globalThis.fetch;
  const posts: ResearchGenerationRequest[] = [];
  let rejectFirst!: (error: Error) => void;
  const firstResponse = new Promise<Response>((_resolve, reject) => { rejectFirst = reject; });
  const created: ResearchGenerationReceipt[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method !== 'POST') return json(inventory());
    assert.equal(new Headers(init.headers).get('authorization'), `Bearer ${token}`);
    const body = JSON.parse(String(init.body)) as ResearchGenerationRequest;
    posts.push(body);
    return posts.length === 1 ? firstResponse : json(receipt(body));
  }) as typeof fetch;
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Panel, { workspaceId, ownerToken: token, writesAvailable: true, onCreated: value => created.push(value) })); await settle(); });
    const initialButton = dom.container.querySelector('button[type="submit"]') as HTMLButtonElement;
    assert.equal(initialButton.disabled, true);
    assert.equal(posts.length, 0);
    await choose(dom.container);
    assert.match(dom.container.textContent ?? '', /Chưa có phân loại/);
    assert.match(dom.container.textContent ?? '', /2026-08-17/);
    await act(async () => { submit(dom.container); submit(dom.container); await settle(); });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]!.reportPresentation, 'report-kit-v1');
    assert.equal((dom.container.querySelector('select') as HTMLSelectElement).disabled, true);
    await act(async () => { rejectFirst(new Error('Synthetic lost response')); await settle(); });
    assert.match(dom.container.textContent ?? '', /Yêu cầu và nguồn đang được giữ nguyên/);
    await act(async () => { submit(dom.container); await settle(); });
    assert.equal(posts.length, 2);
    assert.deepEqual(posts[1], posts[0]);
    assert.equal(created.length, 1);
    assert.equal(created[0]!.workspaceId, workspaceId);
    assert.match(dom.container.textContent ?? '', /từ yêu cầu trước/);
    assert.equal((dom.container.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, true);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('method inputs default to none, clear when the source changes, and freeze selected IDs and display paths together', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/ResearchReportCreatePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ResearchReportCreatePanel');
  const originalFetch = globalThis.fetch;
  const posts: ResearchGenerationRequest[] = [];
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method !== 'POST') return json(inventoryWithMethods());
    const body = JSON.parse(String(init.body)) as ResearchGenerationRequest;
    posts.push(body);
    return json(receipt(body));
  }) as typeof fetch;
  const root = createRoot(dom.container);
  try {
    await act(async () => { root.render(createElement(Panel, { workspaceId, ownerToken: token, writesAvailable: true, onCreated: () => undefined })); await settle(); });
    await chooseValue(dom.container, 'select', 'b'.repeat(64));
    const methodSelects = dom.container.querySelectorAll('fieldset select');
    assert.equal(methodSelects.length, 3);
    assert.deepEqual([...methodSelects].map(select => (select as HTMLSelectElement).value), ['', '', '']);
    await chooseMethod(dom.container, 0, methodCandidateIds.descriptiveMethods);
    await chooseValue(dom.container, 'select', 'a'.repeat(64));
    assert.deepEqual([...dom.container.querySelectorAll('fieldset select')].map(select => (select as HTMLSelectElement).value), ['', '', '']);
    assert.match(dom.container.textContent ?? '', /Đã đặt lại hồ sơ phương pháp về Không dùng/);
    await chooseValue(dom.container, 'select', 'b'.repeat(64));
    await chooseMethod(dom.container, 0, methodCandidateIds.descriptiveMethods);
    await act(async () => { submit(dom.container); await settle(); });
    assert.equal(posts.length, 1);
    assert.deepEqual(posts[0]!.methodSelectionIds, {
      descriptiveMethods: methodCandidateIds.descriptiveMethods,
      locatedInsightMethods: null,
      methodPackets: null,
    });
    assert.doesNotMatch(JSON.stringify(posts[0]), /methods\/descriptive\.json/);
    assert.match(dom.container.textContent ?? '', /Yêu cầu đã gửi/);
    assert.match(dom.container.textContent ?? '', /methods\/descriptive\.json/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('the citation presentation is an explicit opt-in that is sent for the new version and locked while it is created', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/ResearchReportCreatePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ResearchReportCreatePanel');
  const originalFetch = globalThis.fetch;
  const posts: ResearchGenerationRequest[] = [];
  let resolvePost!: (response: Response) => void;
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    if (init?.method !== 'POST') return json(inventory());
    posts.push(JSON.parse(String(init.body)) as ResearchGenerationRequest);
    return new Promise<Response>(resolve => { resolvePost = resolve; });
  }) as typeof fetch;
  const root = createRoot(dom.container);
  const presentation = (value: string) => dom.container.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement;
  try {
    await act(async () => { root.render(createElement(Panel, { workspaceId, ownerToken: token, writesAvailable: true, onCreated: () => undefined })); await settle(); });
    await choose(dom.container);
    assert.equal(presentation('report-kit-v1').checked, true);
    assert.equal(presentation('report-kit-citations-v1').checked, false);
    await act(async () => { presentation('report-kit-citations-v1').click(); await settle(); });
    await act(async () => { submit(dom.container); await settle(); });
    assert.equal(posts.length, 1);
    assert.equal(posts[0]!.reportPresentation, 'report-kit-citations-v1');
    assert.equal(presentation('report-kit-v1').disabled, true);
    assert.equal(presentation('report-kit-citations-v1').disabled, true);
    assert.match(dom.container.textContent ?? '', /Yêu cầu đã gửi.*Cách trình bày.*Báo cáo có số tham chiếu nguồn/);
    await act(async () => { resolvePost(json(receipt(posts[0]!))); await settle(); });
    assert.match(dom.container.textContent ?? '', /Đã lưu báo cáo v1/);
  } finally {
    await act(async () => root.unmount());
    globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('locked OWNER sends no request and stale completion cannot refresh another workspace or an unmounted panel', async () => {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const { default: Panel } = await tsImport('../src/ResearchReportCreatePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/ResearchReportCreatePanel');
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const pending: { request: ResearchGenerationRequest; resolve: (response: Response) => void }[] = [];
  const created: ResearchGenerationReceipt[] = [];
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    calls++;
    if (init?.method !== 'POST') return Promise.resolve(json(inventory(new URL(String(url), 'http://localhost').searchParams.get('workspaceId')!)));
    return new Promise<Response>(resolve => pending.push({ request: JSON.parse(String(init.body)), resolve }));
  }) as typeof fetch;
  const root = createRoot(dom.container);
  const render = (id: string, ownerToken: string | null) => createElement(Panel, { workspaceId: id, ownerToken, writesAvailable: true, onCreated: (value: ResearchGenerationReceipt) => created.push(value) });
  let unmounted = false;
  try {
    await act(async () => { root.render(render(workspaceId, null)); await settle(); });
    assert.equal(calls, 0);
    assert.match(dom.container.textContent ?? '', /Mở khóa OWNER/);
    await act(async () => { root.render(render(workspaceId, token)); await settle(); });
    await choose(dom.container);
    await act(async () => { submit(dom.container); await settle(); });
    await act(async () => { root.render(render(otherWorkspaceId, token)); await settle(); });
    await act(async () => { pending[0]!.resolve(json(receipt(pending[0]!.request))); await settle(); });
    assert.deepEqual(created, []);
    assert.equal((dom.container.querySelector('select') as HTMLSelectElement).value, '');
    assert.doesNotMatch(dom.container.textContent ?? '', /Đã lưu báo cáo/);
    await choose(dom.container);
    await act(async () => { submit(dom.container); await settle(); });
    await act(async () => { root.unmount(); unmounted = true; });
    await act(async () => { pending[1]!.resolve(json(receipt(pending[1]!.request))); await settle(); });
    assert.deepEqual(created, []);
  } finally {
    if (!unmounted) await act(async () => root.unmount());
    globalThis.fetch = originalFetch; dom.cleanup();
  }
});

test('method inventory IDs are unique within one choice, shared package IDs remain valid, and a closed method error maps to the method state', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => json(inventoryWithMethods())) as typeof fetch;
    const valid = await loadResearchGenerationInputs(workspaceId, token, new AbortController().signal);
    assert.equal(valid.choices.length, 2);
    const duplicate = inventoryWithMethods();
    duplicate.choices[0]!.methodInputs!.locatedInsightMethods[0] = duplicate.choices[0]!.methodInputs!.descriptiveMethods[0]!;
    globalThis.fetch = (async () => json(duplicate)) as typeof fetch;
    await assert.rejects(
      () => loadResearchGenerationInputs(workspaceId, token, new AbortController().signal),
      error => error instanceof Error && error.message === 'Danh sách hồ sơ phương pháp có định danh bị trùng.',
    );
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: {
      code: 'method_input_rejected',
      family: 'locatedInsightMethods',
      message: 'The selected method input does not match its declared evidence; choose another input or none',
    } }), { status: 422, headers: { 'content-type': 'application/json' } })) as typeof fetch;
    await assert.rejects(
      () => createResearchReport({ contractVersion: '1.0.0', workspaceId, selectionId: 'b'.repeat(64), requestKey: 'request-key' }, token),
      error => error instanceof Error && error.message.includes('Phương pháp Insight gắn vị trí bằng chứng') && !error.message.includes('toàn vẹn'),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
