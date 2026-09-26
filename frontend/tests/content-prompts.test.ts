import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { act, createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { OwnerWriteError } from '../src/data-source';
import { createSeedState } from '../src/model';
import {
  PROMPT_TYPES,
  changeDemoLifecycle,
  createDemoPrompt,
  draftFromPrompt,
  editingForRoute,
  editorHiddenByDeletion,
  emptyPromptDraft,
  loadPrompt,
  loadPrompts,
  loadSystemPrompt,
  modelsForType,
  promptDraftBlocker,
  promptEditorRoute,
  promptEditorReducer,
  promptRequestFromDraft,
  reviseDemoPrompt,
  submitPromptCreate,
  submitPromptLifecycle,
  submitPromptRevision,
} from '../src/prompt-data-source';
import { parseRoute, routeToHash } from '../src/routing';
import { ContentDataSourceError } from '../src/content-data-source';
import { setupDom } from './dom';

const promptId = '66666666-6666-4666-8666-0000000000c1';
const time = '2027-01-01T00:00:00.000Z';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const content = { name: 'Tết gia đình', description: 'Góc nhìn người con.', creativeText: 'Viết như người con xa nhà.', recommendedModel: 'gpt-5.6-luna', tags: ['Tết', 'quà tặng'] };
const layer = { promptType: 'BIG_IDEA', version: 1, sha256: 'b'.repeat(64), text: '# DỮ LIỆU KHÓA' };
const promptBId = '66666666-6666-4666-8666-0000000000c2';
const promptCId = '66666666-6666-4666-8666-0000000000c3';
const promptAContent = { ...content, name: 'Prompt A', creativeText: 'Viết prompt A.' };
const promptBContent = { ...content, name: 'Prompt B', creativeText: 'Viết prompt B.' };
const systemSummary = { id: 'system-big-idea-strategic', promptType: 'BIG_IDEA', version: 1, name: 'Big Idea chiến lược v3.1', recommendedModel: 'gpt-5.6-sol', tags: [], isDefault: true };

function promptSummary(promptId: string, prompt: typeof content) {
  return { promptId, promptKey: `prompt-${promptId}`, promptType: 'BIG_IDEA', version: 1, name: prompt.name, recommendedModel: prompt.recommendedModel, tags: prompt.tags, updatedAt: time };
}

function promptDetail(promptId: string, prompt: typeof content) {
  return { contractVersion: '1.0.0', prompt: { promptId, promptKey: `prompt-${promptId}`, promptType: 'BIG_IDEA', version: 1, prompt, createdAt: time }, history: [{ version: 1, name: prompt.name, createdAt: time }], lifecycle: { sequence: 0 }, systemLayer: layer };
}

function promptList(entries: readonly { readonly promptId: string; readonly prompt: typeof content }[]) {
  return { contractVersion: '1.0.0', systemPrompts: [systemSummary], prompts: entries.map((entry) => promptSummary(entry.promptId, entry.prompt)) };
}

interface PendingRequest {
  readonly url: string;
  readonly method: string;
  readonly resolve: (response: Response) => void;
  readonly reject: (reason: unknown) => void;
}

function deferredFetchQueue() {
  const pending: PendingRequest[] = [];
  const fetcher: typeof fetch = (input, init) => new Promise<Response>((resolve, reject) => {
    pending.push({ url: String(input), method: String(init?.method ?? 'GET').toUpperCase(), resolve, reject });
  });
  const find = (url: string, method?: string) => pending.findIndex((request) => request.url === url && (method === undefined || request.method === method.toUpperCase()));
  const resolve = (url: string, body: unknown, status = 200, method?: string) => {
    const index = find(url, method);
    assert.notEqual(index, -1, `No pending ${method ?? ''} request for ${url}; pending: ${pending.map((request) => `${request.method} ${request.url}`).join(', ')}`);
    const request = pending.splice(index, 1)[0]!;
    request.resolve(json(status, body));
  };
  return { pending, fetcher, resolve, has: (url: string, method?: string) => find(url, method) !== -1 };
}

type PromptPageModule = typeof import('../src/PromptsPage');

async function importPromptsPage() {
  return (await tsImport('../src/PromptsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as PromptPageModule).default;
}

async function flushAct() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function settleRequest(queue: ReturnType<typeof deferredFetchQueue>, url: string, body: unknown, status = 200, method?: string) {
  await act(async () => {
    queue.resolve(url, body, status, method);
    await Promise.resolve();
    await Promise.resolve();
  });
}

interface PromptHarness {
  readonly container: HTMLElement;
  readonly queue: ReturnType<typeof deferredFetchQueue>;
  readonly navigateCalls: string[];
  readonly notifications: string[];
  readonly notice: HTMLElement;
  readonly render: (promptRef: string | null) => Promise<void>;
  readonly unmountPage: () => Promise<void>;
  readonly settle: (url: string, body: unknown, status?: number, method?: string) => Promise<void>;
  readonly cleanup: () => Promise<void>;
}

async function mountPromptPage(PromptsPage: PromptPageModule['default'], initialPromptRef: string): Promise<PromptHarness> {
  const dom = setupDom();
  const { createRoot } = await import('react-dom/client');
  const queue = deferredFetchQueue();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = queue.fetcher;
  const navigateCalls: string[] = [];
  const notifications: string[] = [];
  const notice = dom.container.ownerDocument.createElement('div');
  notice.setAttribute('role', 'status');
  dom.container.append(notice);
  let promptRef: string | null = initialPromptRef;
  const root = createRoot(dom.container);
  const render = async (nextPromptRef: string | null) => {
    promptRef = nextPromptRef;
    await act(async () => {
      root.render(createElement(PromptsPage, {
        mode: 'real', promptType: 'BIG_IDEA', promptRef, ownerToken: 'token', writesAvailable: true,
        demoPrompts: [], setDemoPrompts: () => undefined,
        navigate: (hash: string) => navigateCalls.push(hash),
        notify: (message: string) => { notifications.push(message); notice.textContent = message; },
      }));
      await Promise.resolve();
    });
  };
  await render(initialPromptRef);
  return {
    container: dom.container,
    queue,
    navigateCalls,
    notifications,
    notice,
    render,
    unmountPage: async () => {
      await act(async () => {
        root.render(null);
        await Promise.resolve();
      });
    },
    settle: (url, body, status, method) => settleRequest(queue, url, body, status, method),
    cleanup: async () => {
      await act(async () => { root.unmount(); });
      globalThis.fetch = originalFetch;
      dom.cleanup();
    },
  };
}

test('prompt routes use the type slug and a user or system prompt reference', () => {
  const state = createSeedState();
  assert.deepEqual(parseRoute(routeToHash.prompts('BIG_IDEA'), state), { kind: 'prompts', promptType: 'BIG_IDEA', promptRef: null });
  assert.deepEqual(parseRoute(routeToHash.prompt('POSTER', promptId), state), { kind: 'prompts', promptType: 'POSTER', promptRef: promptId });
  assert.deepEqual(parseRoute(routeToHash.prompt('CAPTION', 'system-caption-facebook'), state), { kind: 'prompts', promptType: 'CAPTION', promptRef: 'system-caption-facebook' });
  assert.deepEqual(parseRoute('#/prompts', state), { kind: 'prompts', promptType: 'BIG_IDEA', promptRef: null });
  assert.equal(parseRoute('#/prompts/video', state).kind, 'invalid');
  assert.equal(parseRoute('#/prompts/angle/../x', state).kind, 'invalid');
  assert.deepEqual(PROMPT_TYPES.map((type) => type.label), ['Big Idea', 'Góc', 'Caption', 'Poster']);
});

test('an open editor survives only the route it was opened for', () => {
  const list = promptEditorRoute('BIG_IDEA', null);
  const detail = promptEditorRoute('BIG_IDEA', promptId);
  assert.notEqual(list, detail);
  assert.notEqual(list, promptEditorRoute('POSTER', null));
  const fresh = { kind: 'new' as const, route: list };
  // "+ Prompt mới" on a prompt's page opens the editor for the list route, then the hash changes to it.
  assert.equal(editingForRoute(fresh, list), fresh);
  assert.equal(editingForRoute(fresh, detail), null);
  assert.equal(editingForRoute(fresh, promptEditorRoute('POSTER', null)), null);
  const edit = { kind: 'edit' as const, route: detail };
  assert.equal(editingForRoute(edit, detail), edit);
  assert.equal(editingForRoute(edit, list), null);
  assert.equal(editingForRoute(null, list), null);
});

test('an open edit gives way to the deleted state when the prompt was deleted elsewhere', async () => {
  const edit = { kind: 'edit' as const };
  const deleted = { lifecycle: { sequence: 1, deleted: { deletedAt: '2026-09-25T00:00:00.000Z', restorableUntil: '2026-10-25T00:00:00.000Z' } } };
  const active = { lifecycle: { sequence: 2 } };
  assert.equal(editorHiddenByDeletion(edit, deleted), true);
  assert.equal(editorHiddenByDeletion(edit, active), false);
  assert.equal(editorHiddenByDeletion({ kind: 'new' as const }, deleted), false);
  assert.equal(editorHiddenByDeletion(null, deleted), false);
  assert.equal(editorHiddenByDeletion(edit, null), false);
  const { PromptDetail } = await tsImport('../src/PromptsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PromptsPage');
  const html = renderToStaticMarkup(createElement(PromptDetail, { mode: 'real', ownerToken: 'token', writesAvailable: true, draftKept: true, onDuplicate: () => undefined, onEdit: () => undefined, onLifecycle: () => undefined,
    view: { source: 'USER', id: promptId, promptType: 'BIG_IDEA', version: 2, prompt: content, isDefault: false, systemLayer: null, history: [], lifecycle: { sequence: 1, deleted: { deletedAt: '2099-09-25T00:00:00.000Z', restorableUntil: '2099-10-25T00:00:00.000Z' } } } }));
  assert.match(html, /Khôi phục<\/button>/);
  assert.match(html, /Bản nháp chưa lưu vẫn được giữ/);
  assert.doesNotMatch(html, /Sửa \(tạo v/);
});

test('demo reset restores the seeded brand and catalog and drops demo prompts', async () => {
  const { seedDemoContent } = await tsImport('../src/App.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/App');
  const demo = seedDemoContent('demo');
  assert.equal(demo.brands.length, 1);
  assert.equal(demo.items.length, 1);
  assert.deepEqual(demo.media, {});
  assert.deepEqual(demo.prompts, []);
  assert.deepEqual(seedDemoContent('real'), { brands: [], items: [], media: {}, prompts: [], campaigns: [] });
  const app = fs.readFileSync('frontend/src/App.tsx', 'utf8');
  const reset = /const reset = \(\) => \{([\s\S]*?)\n  \};/.exec(app)?.[1] ?? '';
  assert.match(reset, /seedDemoContent\(mode\)/);
  for (const setter of ['setDemoBrands', 'setDemoItems', 'setDemoMedia', 'setDemoPrompts', 'setDemoCampaigns']) assert.match(reset, new RegExp(setter));
});

test('drafts become trimmed requests; models and limits depend on the type', () => {
  assert.deepEqual(modelsForType('POSTER').map((model) => model.key), ['gpt-image-2', 'gemini-3.1-flash-image']);
  assert.equal(emptyPromptDraft('POSTER').recommendedModel, 'gpt-image-2');
  const draft = { ...emptyPromptDraft('BIG_IDEA'), name: ' Tết ', creativeText: '  Viết như người con. ', tagsText: 'Tết,  quà tặng , Tết,', description: ' ', demoOutput: ' Kết quả ' };
  assert.deepEqual(promptRequestFromDraft(draft), { name: 'Tết', creativeText: 'Viết như người con.', recommendedModel: 'gpt-5.6-sol', tags: ['Tết', 'quà tặng'], demoOutput: 'Kết quả' });
  assert.equal(promptDraftBlocker(emptyPromptDraft('ANGLE')), 'Nhập tên prompt.');
  assert.equal(promptDraftBlocker({ ...draft, creativeText: ' ' }), 'Nhập phần sáng tạo.');
  assert.equal(promptDraftBlocker({ ...draft, tagsText: Array.from({ length: 9 }, (_, index) => `t${index}`).join(',') }), 'Tối đa 8 thẻ.');
  assert.equal(promptDraftBlocker({ ...draft, creativeText: 'x'.repeat(12001) }), 'Phần sáng tạo tối đa 12000 ký tự.');
  assert.equal(promptDraftBlocker(draft), null);
  assert.deepEqual(draftFromPrompt(content as never, 'BIG_IDEA').tagsText, 'Tết, quà tặng');
});

test('library reads are validated before use', async () => {
  const system = { id: 'system-big-idea-strategic', promptType: 'BIG_IDEA', version: 1, name: 'Big Idea chiến lược v3.1', description: 'x', recommendedModel: 'gpt-5.6-sol', tags: [], isDefault: true };
  const summary = { promptId, promptKey: 'tet', promptType: 'BIG_IDEA', version: 2, name: 'Tết', recommendedModel: 'gpt-5.6-luna', tags: ['Tết'], updatedAt: time, deleted: { deletedAt: time, restorableUntil: time } };
  assert.equal((await loadPrompts(async () => json(200, { contractVersion: '1.0.0', systemPrompts: [system], prompts: [summary] }))).prompts[0]!.deleted?.restorableUntil, time);
  await assert.rejects(loadPrompts(async () => json(200, { contractVersion: '1.0.0', systemPrompts: [{ ...system, promptType: 'VIDEO' }], prompts: [] })), ContentDataSourceError);
  const detail = { contractVersion: '1.0.0', prompt: { promptId, promptKey: 'tet', promptType: 'BIG_IDEA', version: 1, prompt: content, duplicatedFrom: { kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 }, createdAt: time }, history: [{ version: 1, name: 'Tết', createdAt: time }], lifecycle: { sequence: 0 }, systemLayer: layer };
  assert.equal((await loadPrompt(promptId, async () => json(200, detail)))!.prompt.duplicatedFrom?.id, 'system-big-idea-strategic');
  await assert.rejects(loadPrompt(promptId, async () => json(200, { ...detail, systemLayer: { ...layer, promptType: 'POSTER' } })), ContentDataSourceError);
  await assert.rejects(loadPrompt(promptId, async () => json(200, { ...detail, prompt: { ...detail.prompt, promptId: 'x' } })), ContentDataSourceError);
  const systemDetail = { contractVersion: '1.0.0', systemPrompt: { id: system.id, promptType: 'BIG_IDEA', version: 1, sha256: 'a'.repeat(64), prompt: { ...content, recommendedModel: 'gpt-5.6-sol' }, isDefault: true }, systemLayer: layer };
  assert.equal((await loadSystemPrompt(system.id, async () => json(200, systemDetail)))!.systemPrompt.sha256, 'a'.repeat(64));
  assert.equal(await loadSystemPrompt('system-khong-co', async () => json(404, { error: { code: 'not_found', message: 'x' } })), null);
});

test('OWNER submissions post exact bodies and map failures', async () => {
  const calls: { url: string; body: unknown }[] = [];
  const receipt = { contractVersion: '1.0.0', promptId, promptKey: 'prompt-abc', promptType: 'BIG_IDEA', version: 1, name: 'Tết', createdAt: time, exactRetry: false };
  const fetcher = (answer: unknown, status = 201) => async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), body: JSON.parse(String(init!.body)) }); return json(status, answer); };
  const lineage = { kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 } as const;
  await submitPromptCreate({ promptKey: 'prompt-abc', promptType: 'BIG_IDEA', prompt: content as never, duplicatedFrom: lineage, token: 't' }, fetcher(receipt));
  assert.deepEqual(calls[0], { url: '/owner-api/content/prompts', body: { contractVersion: '1.0.0', promptKey: 'prompt-abc', promptType: 'BIG_IDEA', prompt: content, duplicatedFrom: lineage } });
  await submitPromptRevision({ promptId, expectedVersion: 1, prompt: content as never, token: 't' }, fetcher({ ...receipt, version: 2 }));
  assert.deepEqual(calls[1], { url: `/owner-api/content/prompts/${promptId}/revisions`, body: { contractVersion: '1.0.0', expectedVersion: 1, prompt: content } });
  const lifecycleReceipt = { contractVersion: '1.0.0', promptId, sequence: 1, action: 'DELETE', createdAt: time, restorableUntil: time, exactRetry: false };
  assert.equal((await submitPromptLifecycle({ promptId, action: 'DELETE', expectedSequence: 0, token: 't' }, fetcher(lifecycleReceipt))).restorableUntil, time);
  assert.deepEqual(calls[2], { url: `/owner-api/content/prompts/${promptId}/lifecycle`, body: { contractVersion: '1.0.0', action: 'DELETE', expectedSequence: 0 } });
  await assert.rejects(submitPromptLifecycle({ promptId, action: 'RESTORE', expectedSequence: 1, token: 't' }, fetcher({ error: { code: 'conflict', message: 'x' } }, 409)), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'conflict');
  await assert.rejects(submitPromptCreate({ promptKey: 'prompt-abc', promptType: 'BIG_IDEA', prompt: content as never, token: 't' }, fetcher({ ...receipt, promptType: 'POSTER' })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('demo prompts are versioned, deleted and restored in memory only', () => {
  const draft = { ...emptyPromptDraft('ANGLE'), name: 'Demo', creativeText: 'Viết cụ thể.' };
  const created = createDemoPrompt([], 'ANGLE', draft, promptId, time);
  assert.deepEqual([created[0]!.version, created[0]!.promptType], [1, 'ANGLE']);
  const revised = reviseDemoPrompt(created, promptId, 1, { ...draft, name: 'Demo 2' }, time);
  assert.equal(revised[0]!.history.length, 2);
  const deleted = changeDemoLifecycle(revised, promptId, 'DELETE', time);
  assert.equal(deleted[0]!.deleted?.restorableUntil, '2027-01-31T00:00:00.000Z');
  assert.equal(changeDemoLifecycle(deleted, promptId, 'RESTORE', time)[0]!.deleted, undefined);
  assert.throws(() => reviseDemoPrompt(deleted, promptId, 2, draft, time), /deleted/);
});

test('the prompt view shows layers read-only for system prompts and offers edit, delete and restore for user prompts', async () => {
  const { PromptDetail, PromptForm } = await tsImport('../src/PromptsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/PromptsPage');
  const common = { mode: 'real' as const, ownerToken: 'token', writesAvailable: true, onDuplicate: () => undefined, onEdit: () => undefined, onLifecycle: () => undefined };
  const system = renderToStaticMarkup(createElement(PromptDetail, { ...common, view: { source: 'SYSTEM', id: 'system-big-idea-strategic', promptType: 'BIG_IDEA', version: 1, prompt: { ...content, recommendedModel: 'gpt-5.6-sol' }, isDefault: true, systemLayer: layer, history: [], lifecycle: { sequence: 0 } } }));
  assert.match(system, /Hệ thống/);
  assert.match(system, /Mặc định/);
  assert.match(system, /Phần sáng tạo · bạn viết/);
  assert.match(system, /Phần hệ thống · tự thêm/);
  assert.match(system, /Nhân bản/);
  assert.doesNotMatch(system, /Sửa \(tạo v2\)|Xóa/);
  const user = { source: 'USER' as const, id: promptId, promptType: 'BIG_IDEA' as const, version: 2, prompt: content as never, isDefault: false, systemLayer: layer, history: [{ version: 1, name: 'Tết', createdAt: time }, { version: 2, name: 'Tết', createdAt: time }], lifecycle: { sequence: 0 } };
  const active = renderToStaticMarkup(createElement(PromptDetail, { ...common, view: user }));
  assert.match(active, /Của tôi · v2/);
  assert.match(active, /Sửa \(tạo v3\)/);
  assert.match(active, /Xóa prompt/);
  const deleted = renderToStaticMarkup(createElement(PromptDetail, { ...common, view: { ...user, lifecycle: { sequence: 1, deleted: { deletedAt: time, restorableUntil: '2027-01-31T00:00:00.000Z' } } } }));
  assert.match(deleted, /Đã xóa/);
  assert.match(deleted, /Khôi phục/);
  assert.doesNotMatch(deleted, /Sửa \(tạo v3\)/);
  let editor = promptEditorReducer(null, { type: 'loaded', base: { promptId, promptType: 'BIG_IDEA', version: 1, draft: draftFromPrompt(content as never, 'BIG_IDEA'), history: [] } });
  editor = promptEditorReducer(editor, { type: 'edit', draft: { ...editor.draft, name: 'LOCAL' } });
  editor = promptEditorReducer(promptEditorReducer(editor, { type: 'submitted' }), { type: 'failed', conflict: true, message: '' });
  editor = promptEditorReducer(editor, { type: 'loaded', base: { promptId, promptType: 'BIG_IDEA', version: 2, draft: draftFromPrompt({ ...content, name: 'SERVER' } as never, 'BIG_IDEA'), history: [] } });
  const form = renderToStaticMarkup(createElement(PromptForm, { mode: 'real', ownerToken: 'token', writesAvailable: true, promptType: 'BIG_IDEA', editor, lineage: null, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoPrompts: [], setDemoPrompts: () => undefined }));
  assert.match(form, /value="LOCAL"/);
  assert.match(form, /Bỏ thay đổi, dùng phiên bản 2/);
  const saving = renderToStaticMarkup(createElement(PromptForm, { mode: 'real', ownerToken: 'token', writesAvailable: true, promptType: 'BIG_IDEA', editor: promptEditorReducer(editor, { type: 'submitted' }), lineage: null, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined, onCancel: () => undefined, notify: () => undefined, demoPrompts: [], setDemoPrompts: () => undefined }));
  assert.match(saving, /<fieldset[^>]*disabled=""/);
});

function buttonWithText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes(text));
  assert.ok(button, `Expected a button containing ${text}`);
  return button as HTMLButtonElement;
}

function promptForm(container: HTMLElement): HTMLFormElement {
  const form = container.querySelector('form.prompt-form');
  assert.ok(form, 'Expected the prompt form to be mounted');
  return form as HTMLFormElement;
}

async function setPromptName(form: HTMLFormElement, value: string) {
  const input = form.querySelector('input') as HTMLInputElement | null;
  assert.ok(input, 'Expected the prompt name input');
  const setter = Object.getOwnPropertyDescriptor(input.ownerDocument.defaultView!.HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('input', { bubbles: true }));
    input.dispatchEvent(new input.ownerDocument.defaultView!.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(input.value, value);
}

async function setPromptCreativeText(form: HTMLFormElement, value: string) {
  const textarea = form.querySelector('textarea') as HTMLTextAreaElement | null;
  assert.ok(textarea, 'Expected the prompt creative text input');
  const setter = Object.getOwnPropertyDescriptor(textarea.ownerDocument.defaultView!.HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(textarea, value);
    textarea.dispatchEvent(new textarea.ownerDocument.defaultView!.Event('input', { bubbles: true }));
    textarea.dispatchEvent(new textarea.ownerDocument.defaultView!.Event('change', { bubbles: true }));
    await Promise.resolve();
  });
  assert.equal(textarea.value, value);
}

async function clickEdit(harness: PromptHarness) {
  await act(async () => {
    buttonWithText(harness.container, 'Sửa (tạo v2)').click();
    await Promise.resolve();
  });
  await flushAct();
}

async function submitCurrentEdit(harness: PromptHarness, name: string, promptIdToSave: string) {
  await clickEdit(harness);
  const form = promptForm(harness.container);
  await setPromptName(form, name);
  assert.equal((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, false, `Save remained disabled after changing the name to ${name}`);
  await act(async () => {
    buttonWithText(form, 'Lưu phiên bản 2').click();
    await Promise.resolve();
  });
  assert.equal(harness.queue.has(`/owner-api/content/prompts/${promptIdToSave}/revisions`, 'POST'), true);
}

async function openNewPrompt(harness: PromptHarness, name: string, creativeText: string): Promise<HTMLFormElement> {
  await harness.render(null);
  await flushAct();
  await act(async () => {
    buttonWithText(harness.container, '+ Prompt mới').click();
    await Promise.resolve();
  });
  const form = promptForm(harness.container);
  await setPromptName(form, name);
  await setPromptCreativeText(form, creativeText);
  assert.equal((form.querySelector('button[type="submit"]') as HTMLButtonElement).disabled, false, `Save remained disabled after changing the new prompt to ${name}`);
  return form;
}

function pendingCount(harness: PromptHarness, url: string, method: string): number {
  return harness.queue.pending.filter((request) => request.url === url && request.method === method.toUpperCase()).length;
}

async function settleReload(harness: PromptHarness, list: unknown, detail?: { readonly promptId: string; readonly body: unknown }) {
  await flushAct();
  if (harness.queue.has('/api/content/prompts')) await harness.settle('/api/content/prompts', list);
  await flushAct();
  if (detail && harness.queue.has(`/api/content/prompts/${detail.promptId}`)) await harness.settle(`/api/content/prompts/${detail.promptId}`, detail.body);
  await flushAct();
}

const revisionReceipt = { contractVersion: '1.0.0', promptId, promptKey: `prompt-${promptId}`, promptType: 'BIG_IDEA', version: 2, name: 'Prompt A đã lưu', createdAt: time, exactRetry: false };

test('a prompt editor ignores a duplicate submit within one session', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));
    await clickEdit(harness);
    const form = promptForm(harness.container);
    await setPromptName(form, 'A double submit');

    await act(async () => {
      const Event = form.ownerDocument.defaultView!.Event;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });

    assert.equal(pendingCount(harness, `/owner-api/content/prompts/${promptId}/revisions`, 'POST'), 1);
    assert.equal(buttonWithText(form, 'Đang lưu…').disabled, true);

    await harness.settle(`/owner-api/content/prompts/${promptId}/revisions`, revisionReceipt, 200, 'POST');
    await settleReload(harness, list, { promptId, body: promptDetail(promptId, promptAContent) });
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptId)), true);
  } finally {
    await harness.cleanup();
  }
});

test('a stale exact-retry after leaving the editor keeps the list open and refreshes it', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));
    await submitCurrentEdit(harness, 'A exact retry', promptId);

    await harness.render(null);
    await flushAct();
    assert.equal(harness.container.querySelector('form.prompt-form'), null);
    assert.match(harness.container.textContent ?? '', /Chọn một prompt/);

    await harness.settle(`/owner-api/content/prompts/${promptId}/revisions`, { ...revisionReceipt, exactRetry: true }, 200, 'POST');
    await flushAct();
    assert.equal(harness.queue.has('/api/content/prompts'), true, 'A stale completion should refresh the prompt list');
    await harness.settle('/api/content/prompts', list);

    assert.equal(harness.container.querySelector('form.prompt-form'), null);
    assert.match(harness.container.textContent ?? '', /Chọn một prompt/);
    assert.equal(harness.notice.textContent, 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.');
    assert.deepEqual(harness.navigateCalls, []);
  } finally {
    await harness.cleanup();
  }
});

test('a new prompt session can submit while the previous session is still in flight', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));

    const firstForm = await openNewPrompt(harness, 'FIRST NEW', 'First prompt body.');
    await act(async () => {
      buttonWithText(firstForm, 'Tạo prompt').click();
      await Promise.resolve();
    });
    assert.equal(pendingCount(harness, '/owner-api/content/prompts', 'POST'), 1);

    const secondForm = await openNewPrompt(harness, 'SECOND NEW', 'Second prompt body.');
    await act(async () => {
      buttonWithText(secondForm, 'Tạo prompt').click();
      await Promise.resolve();
    });
    assert.equal(pendingCount(harness, '/owner-api/content/prompts', 'POST'), 2);

    const firstReceipt = { contractVersion: '1.0.0', promptId: promptBId, promptKey: `prompt-${promptBId}`, promptType: 'BIG_IDEA', version: 1, name: 'FIRST NEW', createdAt: time, exactRetry: true };
    const secondReceipt = { contractVersion: '1.0.0', promptId: promptCId, promptKey: `prompt-${promptCId}`, promptType: 'BIG_IDEA', version: 1, name: 'SECOND NEW', createdAt: time, exactRetry: false };
    await harness.settle('/owner-api/content/prompts', firstReceipt, 200, 'POST');
    await flushAct();

    const currentForm = promptForm(harness.container);
    assert.equal((currentForm.querySelector('input') as HTMLInputElement).value, 'SECOND NEW');
    assert.equal(buttonWithText(currentForm, 'Đang lưu…').disabled, true);
    assert.equal(harness.notice.textContent, 'Yêu cầu đã được ghi trước đó; không tạo bản trùng.');
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptBId)), false);
    assert.equal(harness.queue.has('/api/content/prompts'), true, 'The stale exact-retry should refresh the list');
    await harness.settle('/api/content/prompts', list);

    await harness.settle('/owner-api/content/prompts', secondReceipt, 201, 'POST');
    await settleReload(harness, list);
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptCId)), true);
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptBId)), false);
    assert.deepEqual(harness.notifications, ['Yêu cầu đã được ghi trước đó; không tạo bản trùng.', 'Đã tạo prompt.']);
  } finally {
    await harness.cleanup();
  }
});

test('a stale prompt save success leaves a newly opened draft intact', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }, { promptId: promptBId, prompt: promptBContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));
    await submitCurrentEdit(harness, 'A đang lưu', promptId);

    await harness.render(null);
    await flushAct();
    await act(async () => {
      buttonWithText(harness.container, '+ Prompt mới').click();
      await Promise.resolve();
    });
    await setPromptName(promptForm(harness.container), 'UNSAVED NEW B');

    await harness.settle(`/owner-api/content/prompts/${promptId}/revisions`, revisionReceipt, 200, 'POST');
    await settleReload(harness, list);

    const form = promptForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED NEW B');
    assert.equal(buttonWithText(form, 'Tạo prompt').textContent?.trim(), 'Tạo prompt');
    assert.equal((form.querySelector('input') as HTMLInputElement).disabled, false);
    assert.equal(harness.notice.textContent, 'Đã lưu phiên bản 2.');
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptId)), false);
  } finally {
    await harness.cleanup();
  }
});

test('a prompt save that resolves after the page unmounts cannot navigate over a new draft', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }, { promptId: promptBId, prompt: promptBContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));
    await submitCurrentEdit(harness, 'A dang luu truoc khi roi trang', promptId);

    await harness.unmountPage();
    await openNewPrompt(harness, 'UNSAVED NEW B AFTER UNMOUNT', 'B draft must survive the old save.');

    await harness.settle(`/owner-api/content/prompts/${promptId}/revisions`, revisionReceipt, 200, 'POST');

    const form = promptForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED NEW B AFTER UNMOUNT');
    assert.equal(buttonWithText(form, 'Tạo prompt').textContent?.trim(), 'Tạo prompt');
    assert.equal((form.querySelector('input') as HTMLInputElement).disabled, false);
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptId)), false);
  } finally {
    await harness.cleanup();
  }
});

test('a stale prompt save failure leaves a newly opened draft intact and reports the prior failure', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }, { promptId: promptBId, prompt: promptBContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));
    await submitCurrentEdit(harness, 'A đang lưu lỗi', promptId);

    await harness.render(null);
    await flushAct();
    await act(async () => {
      buttonWithText(harness.container, '+ Prompt mới').click();
      await Promise.resolve();
    });
    await setPromptName(promptForm(harness.container), 'UNSAVED NEW B AFTER FAILURE');

    await harness.settle(`/owner-api/content/prompts/${promptId}/revisions`, { error: { code: 'integrity', message: 'server failure' } }, 500, 'POST');
    await settleReload(harness, list);

    const form = promptForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED NEW B AFTER FAILURE');
    assert.equal(buttonWithText(form, 'Tạo prompt').textContent?.trim(), 'Tạo prompt');
    assert.match(harness.notice.textContent ?? '', /^Lần lưu trước không hoàn tất:/);
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptId)), false);
  } finally {
    await harness.cleanup();
  }
});

test('a stale prompt save success leaves an existing B edit intact', { concurrency: false }, async () => {
  const PromptsPage = await importPromptsPage();
  const harness = await mountPromptPage(PromptsPage, promptId);
  try {
    const list = promptList([{ promptId, prompt: promptAContent }, { promptId: promptBId, prompt: promptBContent }]);
    await harness.settle('/api/content/prompts', list);
    await harness.settle(`/api/content/prompts/${promptId}`, promptDetail(promptId, promptAContent));
    await submitCurrentEdit(harness, 'A đang lưu trước B', promptId);

    await harness.render(promptBId);
    await flushAct();
    await harness.settle(`/api/content/prompts/${promptBId}`, promptDetail(promptBId, promptBContent));
    await clickEdit(harness);
    await setPromptName(promptForm(harness.container), 'UNSAVED EXISTING B');

    await harness.settle(`/owner-api/content/prompts/${promptId}/revisions`, revisionReceipt, 200, 'POST');
    await settleReload(harness, list, { promptId: promptBId, body: promptDetail(promptBId, promptBContent) });

    const form = promptForm(harness.container);
    assert.equal((form.querySelector('input') as HTMLInputElement).value, 'UNSAVED EXISTING B');
    assert.equal(buttonWithText(form, 'Lưu phiên bản 2').textContent?.trim(), 'Lưu phiên bản 2');
    assert.equal((form.querySelector('input') as HTMLInputElement).disabled, false);
    assert.equal(harness.notice.textContent, 'Đã lưu phiên bản 2.');
    assert.equal(harness.navigateCalls.includes(routeToHash.prompt('BIG_IDEA', promptId)), false);
  } finally {
    await harness.cleanup();
  }
});

test('prompt frontend sources contain no hard-coded development or remote origins', () => {
  const sources = ['frontend/src/prompt-data-source.ts', 'frontend/src/PromptsPage.tsx'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /https?:\/\/[^'"`\s]+|(?:localhost|127\.0\.0\.1):\d+/);
});
