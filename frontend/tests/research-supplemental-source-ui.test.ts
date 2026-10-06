import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { act, createElement } from 'react';
import { tsImport } from 'tsx/esm/api';
import { setupDom } from './dom';
import type { ResearchAutomationRun, ResearchAutomationSupplementalPrepareRequest, ResearchAutomationSupplementalPrepareReceipt } from '../src/research-automation/api';

const workspaceId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const packageId = '66666666-6666-4666-8666-666666666666';
const pairId = 'a'.repeat(64);
const token = 'synthetic-owner-token-1234567890-only';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const period = { startDate: '2025-10-03', endDate: '2026-10-02', dayCount: 365 };
const run: ResearchAutomationRun = {
  contractVersion: 'research-automation-run-v1', runId, workspaceId, revision: 1, status: 'DRAFT_READY', country: 'VN', mode: 'CATEGORY', keyword: 'synthetic only',
  description: null, interview: {}, requestedPeriod: period, reports: ['MARKET', 'INSIGHT'],
  definition: { definition: 'Synthetic only', includeTerms: [], excludeTerms: [], selectedProductIds: [], peerProductIds: [], confirmedAt: '2026-10-02T00:00:00.000Z' },
  productCards: [], coverage: { requestedPeriod: period, sources: [] }, usage: { entries: [], requestCount: 0, knownCosts: [], hasUnknownCost: false },
  steps: [], blockers: [], createdAt: '2026-10-02T00:00:00.000Z', updatedAt: '2026-10-02T00:00:00.000Z',
};
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const receipt: ResearchAutomationSupplementalPrepareReceipt = {
  contractVersion: 'automation-supplemental-prepared-v1', exactRetry: false, requestKey: workspaceId, family: 'QUOTE', state: 'PREPARED_NOT_ADMITTED', packageId,
  manifestArtifactSha256: 'b'.repeat(64), packageContentSha256: 'c'.repeat(64), descriptorPath: 'methods/quotes.json', sourceLabel: 'Báo giá thử nghiệm', acquiredAt: null,
  provenance: 'OPERATOR_SUPPLIED_UNVERIFIED', admission: 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION',
  files: [{ path: 'methods/quotes.json', sha256: sha(Buffer.from('{}')), byteSize: 2, mediaType: 'application/json' }, { path: 'quotes.json', sha256: sha(Buffer.from('{}')), byteSize: 2, mediaType: 'application/json' }],
};
function entry(value = receipt) { const { contractVersion: _v, exactRetry: _r, ...item } = value; return item; }
const inventory = (packages = [entry()], id = runId) => ({ contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId: id, packages });
const original = { pairId, versionNumber: 1, attemptId: null, outputs: [{ kind: 'MARKET', versionId: 'd'.repeat(64), pdfAvailable: true }, { kind: 'INSIGHT', versionId: 'e'.repeat(64), pdfAvailable: true }] };
const settled = async () => { await act(async () => { await new Promise(resolve => setTimeout(resolve, 5)); }); };
function button(container: HTMLElement, label: string) { const found = [...container.querySelectorAll('button')].find(x => x.textContent?.trim() === label); assert.ok(found, label); return found; }
async function click(container: HTMLElement, label: string) { await act(async () => { button(container, label).click(); }); }
async function input(container: HTMLElement, id: string, value: string) {
  const field = container.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`); assert.ok(field, id);
  const view = field.ownerDocument.defaultView!;
  const prototype = field.tagName === 'SELECT' ? view.HTMLSelectElement.prototype : view.HTMLInputElement.prototype;
  await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value); field.dispatchEvent(new view.Event(field.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
async function choose(container: HTMLElement) { await act(async () => { container.querySelector<HTMLInputElement>(`input[value="${packageId}"]`)!.click(); }); }
async function fillUpload(container: HTMLElement) {
  const field = container.querySelector<HTMLInputElement>('#ra-supplemental-files')!;
  const files = [new File(['{}'], 'quotes.json'), new File(['{}'], 'descriptor.json')];
  Object.defineProperty(field, 'files', { configurable: true, value: files });
  await act(async () => { field.dispatchEvent(new field.ownerDocument.defaultView!.Event('change', { bubbles: true })); });
  await input(container, 'ra-supplemental-path-1', 'methods/quotes.json');
  await act(async () => { container.querySelectorAll<HTMLInputElement>('input[name="ra-supplemental-descriptor"]')[1]!.click(); });
  await input(container, 'ra-supplemental-label', 'Báo giá thử nghiệm');
}
async function uploaded(form: FormData): Promise<ResearchAutomationSupplementalPrepareReceipt> {
  const request = JSON.parse(form.get('metadata') as string) as ResearchAutomationSupplementalPrepareRequest;
  return { ...receipt, ...{ requestKey: request.requestKey, family: request.family, sourceLabel: request.sourceLabel, acquiredAt: request.acquiredAt, descriptorPath: request.descriptorPath },
    files: await Promise.all(request.files.map(async file => { const bytes = new Uint8Array(await (form.get(`file:${file.path}`) as Blob).arrayBuffer()); return { path: file.path, mediaType: file.mediaType, sha256: sha(bytes), byteSize: bytes.byteLength }; })) };
}
async function mount(t: test.TestContext, handler: typeof fetch, parent = false) {
  const dom = setupDom(), prior = globalThis.fetch; globalThis.fetch = handler;
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.container);
  const { default: Component } = await tsImport(parent ? '../src/research-automation/ReportVersionsPanel.tsx' : '../src/research-automation/SupplementalSourcePanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' });
  const props = parent ? { run, ownerToken: token, writesAvailable: true } : { run, previousPairId: pairId, previousVersion: 1, ownerToken: token, blocker: null, disabled: false, onBusyChanged: () => {}, onRevisionSettled: () => {} };
  const render = async (changes = {}) => { await act(async () => { root.render(createElement(Component, { ...props, ...changes })); }); await settled(); };
  t.after(async () => { await act(async () => root.unmount()); globalThis.fetch = prior; dom.cleanup(); });
  await render(); return { ...dom, root, render };
}

// Visible behavior ownership: keep uploaded evidence separate from admission, and bind every write to the user's exact frozen selection.
test('parent stores without selecting, blocks other actions, then explicitly admits exact package while retaining original web/PDF selection', async t => {
  let packages: ReturnType<typeof entry>[] = [], resolveUpload!: (response: Response) => void;
  const writes: RequestInit[] = [];
  const dom = await mount(t, (async (url, init) => {
    const address = String(url);
    if (init?.method === 'POST') {
      writes.push(init);
      if (address.endsWith('/sources/supplemental')) return new Promise<Response>(resolve => { resolveUpload = resolve; });
      assert.ok(address.endsWith('/report-revisions'));
      return json({ attemptId: '33333333-3333-4333-8333-333333333333', attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: false }, 202);
    }
    if (address.endsWith('/report-versions')) return json({ contractVersion: 'automation-report-version-list-v1', workspaceId, runId, versions: [original] });
    if (address.endsWith('/report-attempts')) return json({ contractVersion: 'automation-report-attempt-list-v1', workspaceId, runId, attempts: [] });
    if (address.endsWith('/sources/metric')) return json({ contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId, sources: [] });
    if (address.endsWith('/sources/supplemental')) return json(inventory(packages));
    throw new Error(`Unexpected ${address}`);
  }) as typeof fetch, true);
  const before = [...dom.container.querySelectorAll('.ra-output a')].map(x => x.getAttribute('href'));
  assert.equal(before.length, 4); assert.match(dom.container.textContent!, /Chưa có nguồn bổ sung/);
  await fillUpload(dom.container);
  await act(async () => { button(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo').click(); button(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo').click(); });
  await settled(); assert.equal(writes.length, 1);
  assert.equal(button(dom.container, 'Tạo phiên bản báo cáo bổ sung').disabled, true);
  assert.equal(dom.container.querySelector<HTMLSelectElement>('#ra-report-version')!.disabled, true);
  const result = await uploaded(writes[0]!.body as FormData); packages = [entry(result)];
  await act(async () => resolveUpload(json(result, 201))); await settled();
  assert.match(dom.container.textContent!, /Nguồn đã lưu\. Chọn nguồn/);
  assert.equal(dom.container.querySelector<HTMLInputElement>(`input[value="${packageId}"]`)!.checked, false);
  assert.equal(writes.length, 1);
  await choose(dom.container); await click(dom.container, 'Tạo phiên bản với nguồn đã chọn');
  assert.match(dom.container.querySelector('[role="dialog"]')!.textContent!, /phiên bản 1/);
  await click(dom.container, 'Xác nhận tạo phiên bản'); await settled();
  assert.equal(writes.length, 2);
  assert.match(dom.container.textContent!, /Đã nhận lượt tạo phiên bản/);
  const body = JSON.parse(writes[1]!.body as string);
  assert.equal(body.contractVersion, 'automation-quote-report-revision-v1'); assert.equal(body.previousPairId, pairId);
  assert.deepEqual(body.quoteMethods, { decision: 'USE_PACKAGE', packageId, manifestArtifactSha256: result.manifestArtifactSha256, packageContentSha256: result.packageContentSha256, descriptorPath: result.descriptorPath });
  assert.deepEqual(body.sources, { metric: { decision: 'KEEP' }, nativeReview: { decision: 'KEEP' } });
  assert.deepEqual([...dom.container.querySelectorAll('.ra-output a')].map(x => x.getAttribute('href')), before);
});

test('uncertain upload retries the identical snapshot only on click; late response after stopping wait cannot settle a new upload', async t => {
  const forms: FormData[] = []; let oldResolve!: (response: Response) => void;
  const dom = await mount(t, (async (_url, init) => {
    if (init?.method !== 'POST') return json(inventory([]));
    forms.push(init.body as FormData);
    if (forms.length === 1) return new Promise<Response>(resolve => { oldResolve = resolve; });
    throw new Error('Response lost');
  }) as typeof fetch);
  await fillUpload(dom.container); await click(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo'); await settled();
  await click(dom.container, 'Dừng chờ tải gói'); await settled(); assert.equal(forms.length, 1);
  await click(dom.container, 'Thử lại đúng lượt tải gói'); await settled();
  assert.equal(forms.length, 2); assert.equal(forms[0]!.get('metadata'), forms[1]!.get('metadata'));
  await act(async () => oldResolve(json(await uploaded(forms[0]!), 201))); await settled();
  assert.match(dom.container.textContent!, /Chưa biết máy chủ đã lưu/);
  assert.equal(button(dom.container, 'Thử lại đúng lượt tải gói').disabled, false);
  await click(dom.container, 'Bỏ lượt chờ, tải lại nguồn bổ sung');
  await input(dom.container, 'ra-supplemental-label', 'Lượt khác');
  assert.equal(dom.container.querySelector<HTMLInputElement>('#ra-supplemental-label')!.value, 'Lượt khác');
});

test('late upload after run switch cannot clear a newly mounted form or select a package', async t => {
  let resolve!: (response: Response) => void, form!: FormData;
  const dom = await mount(t, (async (url, init) => {
    if (init?.method === 'POST') { form = init.body as FormData; return new Promise<Response>(done => { resolve = done; }); }
    return json(inventory([], String(url).includes(runId) ? runId : workspaceId));
  }) as typeof fetch);
  await fillUpload(dom.container); await click(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo'); await settled();
  // Parent integration keys the child by run ID; remount models that user-visible boundary.
  await act(async () => dom.root.render(null)); await dom.render({ run: { ...run, runId: workspaceId } });
  await input(dom.container, 'ra-supplemental-label', 'Phiên mới');
  await act(async () => resolve(json(await uploaded(form), 201))); await settled();
  assert.equal(dom.container.querySelector<HTMLInputElement>('#ra-supplemental-label')!.value, 'Phiên mới');
  assert.doesNotMatch(dom.container.textContent!, /Nguồn đã lưu\. Chọn nguồn/);
});

test('inventory corruption, OWNER lock and changed predecessor block admission; confirmation cancel writes nothing', async t => {
  let bad = true, posts = 0;
  const bounded = entry({ ...receipt, family: 'BOUNDED', sourceLabel: 'Phương pháp thử nghiệm' });
  const dom = await mount(t, (async (_url, init) => {
    if (init?.method === 'POST') { posts++; throw new Error('Not expected'); }
    return bad ? json({ error: { code: 'integrity', message: 'Failed verification' } }, 500) : json(inventory([bounded]));
  }) as typeof fetch);
  assert.ok(dom.container.querySelector('[role="alert"]'));
  assert.equal(button(dom.container, 'Tạo phiên bản với nguồn đã chọn').disabled, true);
  bad = false; await click(dom.container, 'Tải lại nguồn bổ sung'); await settled(); await choose(dom.container);
  await dom.render({ ownerToken: null }); assert.match(dom.container.textContent!, /Mở khóa OWNER/);
  assert.equal(button(dom.container, 'Tạo phiên bản với nguồn đã chọn').disabled, true);
  await dom.render(); await click(dom.container, 'Tạo phiên bản với nguồn đã chọn');
  assert.match(dom.container.querySelector('[role="dialog"]')!.textContent!, /phương pháp giới hạn/);
  await click(dom.container, 'Hủy'); assert.equal(posts, 0);
  await click(dom.container, 'Tạo phiên bản với nguồn đã chọn'); await dom.render({ previousPairId: 'f'.repeat(64), previousVersion: 2 });
  assert.equal(dom.container.querySelector('[role="dialog"]'), null); assert.equal(posts, 0);
  assert.match(dom.container.textContent!, /phiên bản trước đã đổi/);
});

test('bounded revision retries its exact predecessor and selection after uncertainty, without starting another family or duplicate submit', async t => {
  const bodies: string[] = []; let reloads = 0;
  const bounded = entry({ ...receipt, family: 'BOUNDED', sourceLabel: 'Phương pháp thử nghiệm' });
  const dom = await mount(t, (async (_url, init) => {
    if (init?.method !== 'POST') return json(inventory([bounded]));
    bodies.push(init.body as string);
    if (bodies.length === 1) throw new Error('Connection lost');
    return json({ attemptId: '33333333-3333-4333-8333-333333333333', attemptNumber: 1, state: 'QUEUED', pairId: null, exactRetry: true }, 200);
  }) as typeof fetch);
  await dom.render({ onRevisionSettled: () => { reloads++; } }); await choose(dom.container);
  await click(dom.container, 'Tạo phiên bản với nguồn đã chọn');
  await act(async () => { button(dom.container, 'Xác nhận tạo phiên bản').click(); button(dom.container, 'Xác nhận tạo phiên bản').click(); });
  await settled(); assert.equal(bodies.length, 1);
  assert.equal(button(dom.container, 'Tạo phiên bản với nguồn đã chọn').disabled, true);
  const body = JSON.parse(bodies[0]!);
  assert.equal(body.contractVersion, 'automation-bounded-report-revision-v1'); assert.equal(body.previousPairId, pairId);
  assert.deepEqual(body.boundedMethods, { decision: 'USE_PACKAGE', packageId, manifestArtifactSha256: bounded.manifestArtifactSha256, packageContentSha256: bounded.packageContentSha256, descriptorPath: bounded.descriptorPath });
  assert.equal(body.quoteMethods, undefined);
  await dom.render({ previousPairId: 'f'.repeat(64), previousVersion: 2, onRevisionSettled: () => { reloads++; } });
  await click(dom.container, 'Thử lại đúng lượt tạo phiên bản'); await settled();
  assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]); assert.equal(reloads, 1);
  assert.match(dom.container.textContent!, /Đã nhận lượt tạo phiên bản/);
});

test('a selected bounded descriptor renamed to Markdown blocks storage even with exactly two Markdown files', async t => {
  let posts = 0;
  const dom = await mount(t, (async (_url, init) => {
    if (init?.method === 'POST') posts++;
    return json(inventory([]));
  }) as typeof fetch);
  await input(dom.container, 'ra-supplemental-family', 'BOUNDED');
  const field = dom.container.querySelector<HTMLInputElement>('#ra-supplemental-files')!;
  const files = [new File(['{}'], 'input.json'), new File(['{}'], 'source.json'), new File(['synthetic method'], 'advanced-profile.md'), new File(['synthetic method'], 'adoption.md')];
  Object.defineProperty(field, 'files', { configurable: true, value: files });
  await act(async () => field.dispatchEvent(new field.ownerDocument.defaultView!.Event('change', { bubbles: true })));
  await input(dom.container, 'ra-supplemental-path-0', 'method-packets/input.json');
  await act(async () => dom.container.querySelectorAll<HTMLInputElement>('input[name="ra-supplemental-descriptor"]')[0]!.click());
  await input(dom.container, 'ra-supplemental-label', 'Phương pháp thử nghiệm');
  assert.equal(button(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo').disabled, false);
  await input(dom.container, 'ra-supplemental-path-0', 'method-packets/input.md');
  await input(dom.container, 'ra-supplemental-path-2', 'advanced-profile.json');
  assert.equal(button(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo').disabled, true);
  assert.match(dom.container.textContent!, /Chọn một tệp JSON làm tệp mô tả phương pháp/);
  await click(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo');
  assert.equal(posts, 0);
  await input(dom.container, 'ra-supplemental-path-0', 'method-packets/input.json');
  await input(dom.container, 'ra-supplemental-path-2', 'advanced-profile.md');
  assert.equal(button(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo').disabled, false);
});

test('upload acknowledgement without exact reloaded metadata keeps admission blocked until an exact inventory reload', async t => {
  let result = receipt, drift = true;
  const dom = await mount(t, (async (_url, init) => {
    if (init?.method === 'POST') { result = await uploaded(init.body as FormData); return json(result, 201); }
    return json(inventory([entry({ ...result, acquiredAt: drift ? '2026-10-01T00:00:00.000Z' : result.acquiredAt })]));
  }) as typeof fetch);
  await fillUpload(dom.container); await click(dom.container, 'Lưu gói nguồn, chưa đưa vào báo cáo'); await settled();
  assert.ok(dom.container.querySelector('[role="alert"]'));
  assert.equal(button(dom.container, 'Tạo phiên bản với nguồn đã chọn').disabled, true);
  drift = false; await click(dom.container, 'Tải lại nguồn bổ sung'); await settled();
  assert.match(dom.container.textContent!, /Nguồn đã lưu\. Chọn nguồn/); assert.equal(dom.container.querySelector('[role="alert"]'), null);
});
