import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { JSDOM } from 'jsdom';

const html = await readFile(new URL('../../tools/shopee-desktop/index.html', import.meta.url), 'utf8');

const preset = (presetId: string, label: string) => ({
  presetId, label, keywords: [label], categoryLabel: 'Sức Khoẻ', source: 'manual',
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function waitFor(check: () => boolean, label: string, ms = 3000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('timeout waiting for ' + label);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

/** The real page, with a fake pywebview bridge whose preset refresh can be held open. */
function harness() {
  const state: {
    addCalls: number; presetsCalls: number; newRunCalls: number; listRunsCalls: number;
    presets: ReturnType<typeof preset>[];
    refresh: Deferred<any> | undefined;
    addResult: ((input: any) => any) | undefined;
  } = {
    addCalls: 0, presetsCalls: 0, newRunCalls: 0, listRunsCalls: 0,
    presets: [preset('kem', 'Kem chống nắng')],
    refresh: undefined,
    addResult: undefined,
  };
  const api = {
    connection: async () => ({ ok: true, data: { connected: true, readonly: false, runsRoot: '/synthetic' } }),
    presets: async () => {
      state.presetsCalls++;
      if (state.refresh) return state.refresh.promise;
      return { ok: true, data: { format: 'presets-v1', presets: state.presets.slice() } };
    },
    listRuns: async () => {
      state.listRunsCalls++;
      return { ok: true, data: { format: 'runs-v1', runs: [] } };
    },
    library: async () => ({ ok: true, data: { format: 'library-v1', modules: {}, skills: [] } }),
    newRun: async () => {
      state.newRunCalls++;
      return { ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } };
    },
    status: async () => ({ ok: false, error: { code: 'RUN_NOT_FOUND', message: 'RUN_NOT_FOUND' } }),
    runFlow: async () => ({ ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } }),
    runModule: async () => ({ ok: false, error: { code: 'SYNTHETIC', message: 'SYNTHETIC' } }),
    addProduct: async (input: any) => {
      state.addCalls++;
      if (state.addResult) return state.addResult(input);
      state.presets.push(preset(input.presetId, input.label));
      return { ok: true, data: { format: 'add-product-v1', presetId: input.presetId, label: input.label } };
    },
  };
  const dom = new JSDOM(html, {
    url: 'file:///shopee-desktop/index.html',
    runScripts: 'dangerously',
    beforeParse(window) { (window as any).pywebview = { api }; },
  });
  return { dom, doc: dom.window.document, window: dom.window, state };
}

const element = <T extends HTMLElement>(doc: Document, id: string): T => doc.getElementById(id) as T;

function fill(doc: Document, label: string, keyword: string): void {
  element<HTMLInputElement>(doc, 'productLabel').value = label;
  element<HTMLInputElement>(doc, 'productKeyword').value = keyword;
  element<HTMLSelectElement>(doc, 'productCategory').value = 'c2035652732';
}

/** A user-like click on the submit button; the page owns the form submit handler. */
const save = (doc: Document) => element<HTMLButtonElement>(doc, 'btnProductSave').click();

async function booted(doc: Document): Promise<void> {
  await waitFor(() => element<HTMLButtonElement>(doc, 'btnProductSave').disabled === false, 'connected product form');
}

test('a slow preset refresh keeps the save pending, blocks edits and duplicate submits, then applies the saved product', async () => {
  const { dom, doc, state, window } = harness();
  try {
    await booted(doc);
    fill(doc, 'Viên uống vitamin C', 'vitamin C');
    state.refresh = deferred();
    save(doc);
    await waitFor(() => state.addCalls === 1, 'add-product started');
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === false, 'pending while the refresh is in flight');

    const label = element<HTMLInputElement>(doc, 'productLabel');
    const saveBtn = element<HTMLButtonElement>(doc, 'btnProductSave');
    assert.equal(saveBtn.disabled, true, 'save stays disabled through the whole operation');
    assert.equal(label.disabled, true, 'the form is protected while the save is in flight');
    assert.equal(element<HTMLInputElement>(doc, 'productKeyword').disabled, true);
    assert.equal(element<HTMLSelectElement>(doc, 'productCategory').disabled, true);
    assert.equal(element<HTMLButtonElement>(doc, 'btnNew').disabled, false, 'the new-run control is untouched');

    // A second user attempt and a direct submit event must not start another save.
    label.value = 'Viên uống vitamin C mới';
    save(doc);
    element<HTMLFormElement>(doc, 'productForm').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(state.addCalls, 1, 'a duplicate submission is refused while the operation is pending');
    assert.equal(state.newRunCalls, 0, 'saving a product never creates a run');
    assert.equal(state.listRunsCalls, 1, 'saving a product never refreshes runs');

    const refreshed = [preset('kem', 'Kem chống nắng'), preset('vien-uong-vitamin-c', 'Viên uống vitamin C')];
    state.refresh.resolve({ ok: true, data: { format: 'presets-v1', presets: refreshed } });
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === true, 'pending cleared after refresh');

    const select = element<HTMLSelectElement>(doc, 'presetSel');
    assert.equal(select.value, 'vien-uong-vitamin-c');
    assert.ok([...select.options].some((option) => option.value === 'kem'), 'the old preset is preserved');
    assert.match(element<HTMLElement>(doc, 'productSaved').textContent!, /Viên uống vitamin C/);
    assert.equal(label.value, '', 'the form resets only after the saved preset is selected');
    assert.equal(label.disabled, false, 'the form is restored after success');
    assert.equal(saveBtn.disabled, false, 'save is re-enabled after success');
  } finally { dom.window.close(); }
});

test('a failed preset refresh restores the form, keeps the saved product message and allows a retry', async () => {
  const { dom, doc, state } = harness();
  try {
    await booted(doc);
    fill(doc, 'Viên uống vitamin C', 'vitamin C');
    state.refresh = deferred();
    save(doc);
    await waitFor(() => state.addCalls === 1, 'add-product started');
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === false, 'pending while the refresh is in flight');

    state.refresh.resolve({ ok: false, error: { code: 'SSH_TIMEOUT', message: 'SSH_TIMEOUT' } });
    await waitFor(() => element<HTMLElement>(doc, 'productPending').hidden === true, 'pending cleared after the refresh failure');
    assert.match(element<HTMLElement>(doc, 'productSaved').textContent!, /Đã lưu “Viên uống vitamin C”/);
    assert.match(element<HTMLElement>(doc, 'errbar').textContent!, /SSH_TIMEOUT/);
    const label = element<HTMLInputElement>(doc, 'productLabel');
    assert.equal(label.value, 'Viên uống vitamin C', 'the values stay so the user can retry');
    assert.equal(label.disabled, false, 'the form is restored after the refresh failure');
    assert.equal(element<HTMLButtonElement>(doc, 'btnProductSave').disabled, false, 'save is restored after the refresh failure');

    state.refresh = undefined;
    state.presets = [preset('kem', 'Kem chống nắng'), preset('vien-uong-vitamin-c', 'Viên uống vitamin C')];
    save(doc);
    await waitFor(() => state.addCalls === 2 && element<HTMLElement>(doc, 'productPending').hidden === true, 'retry completes');
  } finally { dom.window.close(); }
});

test('a rejected save restores the form, shows the product error and does not refresh presets', async () => {
  const { dom, doc, state } = harness();
  try {
    await booted(doc);
    fill(doc, 'Viên uống vitamin C', 'vitamin C');
    const presetsBefore = state.presetsCalls;
    state.addResult = () => ({ ok: false, error: { code: 'PRESET_BUSY', message: 'PRESET_BUSY' } });
    save(doc);
    await waitFor(() => element<HTMLElement>(doc, 'productErr').hidden === false, 'product error');

    assert.match(element<HTMLElement>(doc, 'productErr').textContent!, /PRESET_BUSY/);
    assert.equal(element<HTMLElement>(doc, 'productPending').hidden, true);
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').value, 'Viên uống vitamin C');
    assert.equal(element<HTMLInputElement>(doc, 'productLabel').disabled, false);
    assert.equal(element<HTMLElement>(doc, 'productSaved').hidden, true);
    assert.equal(element<HTMLButtonElement>(doc, 'btnProductSave').disabled, false);
    assert.equal(state.presetsCalls, presetsBefore, 'a rejected save does not refresh presets');
  } finally { dom.window.close(); }
});
