import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { brandEditorReducer, type BrandBase, type BrandEditor } from '../src/brand-editor';
import { draftFromBrand, emptyBrandDraft, DEFAULT_DISPLAY_RULES } from '../src/content-data-source';

const brandId = '66666666-6666-4666-8666-000000000001';
const time = '2027-01-01T00:00:00.000Z';
const base = (version: number, patch: Record<string, string> = {}): BrandBase => ({
  brandId, version,
  draft: draftFromBrand({ profile: { brandName: 'Canxi Việt', hotline: '0900 000 000', ...patch }, displayRules: DEFAULT_DISPLAY_RULES }),
  history: Array.from({ length: version }, (_, index) => ({ version: index + 1, brandName: 'Canxi Việt', createdAt: time })),
});
const opened = (): BrandEditor => brandEditorReducer(null, { type: 'loaded', base: base(1) });
const edited = (editor: BrandEditor, brandName: string): BrandEditor => brandEditorReducer(editor, { type: 'edit', draft: { ...editor.draft, brandName } });

test('a 409 keeps the unsaved draft and a newer version is rebased under it with a visible notice', () => {
  let editor = edited(opened(), 'LOCAL UNSAVED EDIT');
  editor = brandEditorReducer(editor, { type: 'submitted' });
  editor = brandEditorReducer(editor, { type: 'failed', conflict: true, message: 'x' });
  assert.equal(editor.draft.brandName, 'LOCAL UNSAVED EDIT');
  assert.equal(editor.saving, false);
  assert.deepEqual(editor.notice, { kind: 'stale' });
  editor = brandEditorReducer(editor, { type: 'loaded', base: base(2, { brandName: 'SERVER OTHER EDIT' }) });
  assert.equal(editor.draft.brandName, 'LOCAL UNSAVED EDIT');
  assert.equal(editor.base?.version, 2);
  assert.deepEqual(editor.notice, { kind: 'rebased', fromVersion: 1, toVersion: 2, fields: ['Tên thương hiệu'] });
  const discarded = brandEditorReducer(editor, { type: 'discard' });
  assert.equal(discarded.draft.brandName, 'SERVER OTHER EDIT');
  assert.equal(discarded.notice, null);
});

test('a newer version arriving without unsaved edits simply replaces the form', () => {
  const editor = brandEditorReducer(opened(), { type: 'loaded', base: base(2, { hotline: '0900 111 222' }) });
  assert.equal(editor.draft.hotline, '0900 111 222');
  assert.equal(editor.notice, null);
});

test('edits are ignored while saving and a successful save settles on the saved version', () => {
  let editor = edited(opened(), 'SUBMITTED EDIT');
  editor = brandEditorReducer(editor, { type: 'submitted' });
  assert.equal(editor.saving, true);
  editor = edited(editor, 'TYPED WHILE SAVING');
  assert.equal(editor.draft.brandName, 'SUBMITTED EDIT');
  editor = brandEditorReducer(editor, { type: 'loaded', base: base(2, { brandName: 'SOMETHING ELSE' }) });
  assert.equal(editor.base?.version, 1, 'server reloads during a save wait for its result');
  editor = brandEditorReducer(editor, { type: 'saved' });
  editor = brandEditorReducer(editor, { type: 'loaded', base: base(2, { brandName: 'SUBMITTED EDIT' }) });
  assert.deepEqual([editor.saving, editor.notice, editor.base?.version, editor.draft.brandName], [false, null, 2, 'SUBMITTED EDIT']);
});

test('a new-brand editor keeps its retry key and draft across failures', () => {
  let editor = brandEditorReducer(null, { type: 'new', key: 'brand-abc' });
  assert.deepEqual([editor.target, editor.newKey, editor.base], ['new', 'brand-abc', null]);
  editor = edited(editor, 'Mới');
  editor = brandEditorReducer(brandEditorReducer(editor, { type: 'submitted' }), { type: 'failed', conflict: false, message: 'Kết nối không rõ kết quả.' });
  assert.deepEqual([editor.newKey, editor.draft.brandName, editor.notice], ['brand-abc', 'Mới', { kind: 'error', message: 'Kết nối không rõ kết quả.' }]);
  assert.deepEqual(brandEditorReducer(editor, { type: 'discard' }).draft, emptyBrandDraft());
});

test('the brand form renders the kept draft, the conflict choice, and locks fields while saving', async () => {
  const { BrandForm } = await tsImport('../src/BrandsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/BrandsPage');
  const props = { mode: 'real' as const, brandId, view: 'profile' as const, itemId: null, ownerToken: 'token', writesAvailable: true, demoBrands: [], setDemoBrands: () => undefined, demoItems: [], setDemoItems: () => undefined, demoMedia: {}, addDemoMedia: () => undefined, mediaSrc: (digest: string) => `/media/${digest}`, navigate: () => undefined, notify: () => undefined, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined };
  let editor = brandEditorReducer(brandEditorReducer(edited(opened(), 'LOCAL UNSAVED EDIT'), { type: 'submitted' }), { type: 'failed', conflict: true, message: 'x' });
  editor = brandEditorReducer(editor, { type: 'loaded', base: base(2, { brandName: 'SERVER OTHER EDIT' }) });
  const conflict = renderToStaticMarkup(createElement(BrandForm, { ...props, editor }));
  assert.match(conflict, /value="LOCAL UNSAVED EDIT"/);
  assert.doesNotMatch(conflict, /value="SERVER OTHER EDIT"/);
  assert.match(conflict, /role="alert"[^>]*>[^<]*phiên bản 2/);
  assert.match(conflict, /Bỏ thay đổi, dùng phiên bản 2/);
  assert.match(conflict, /Lưu để tạo phiên bản 3 từ bản nháp này/);
  const saving = renderToStaticMarkup(createElement(BrandForm, { ...props, editor: brandEditorReducer(edited(opened(), 'SUBMITTED EDIT'), { type: 'submitted' }) }));
  assert.match(saving, /<fieldset[^>]*disabled=""[^>]*>\s*<legend>Hồ sơ/);
  assert.match(saving, /<fieldset[^>]*disabled=""[^>]*class="rules-lock"|<fieldset class="rules-lock"[^>]*disabled=""/);
});

test('the brand form previews the draft logo and offers upload only for saved brands', async () => {
  const { BrandForm } = await tsImport('../src/BrandsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/BrandsPage');
  const props = { mode: 'real' as const, brandId, view: 'profile' as const, itemId: null, ownerToken: 'token', writesAvailable: true, demoBrands: [], setDemoBrands: () => undefined, demoItems: [], setDemoItems: () => undefined, demoMedia: {}, addDemoMedia: () => undefined, mediaSrc: (digest: string) => `/media/${digest}`, navigate: () => undefined, notify: () => undefined, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined };
  const withLogo = edited(opened(), 'Canxi Việt');
  const html = renderToStaticMarkup(createElement(BrandForm, { ...props, editor: { ...withLogo, draft: { ...withLogo.draft, logoMediaSha256: 'b'.repeat(64) } } }));
  assert.match(html, new RegExp(`<img src="/media/${'b'.repeat(64)}" alt="Logo Canxi Việt"`));
  assert.match(html, /Đổi logo/);
  assert.match(html, /Bỏ logo/);
  const fresh = renderToStaticMarkup(createElement(BrandForm, { ...props, editor: brandEditorReducer(null, { type: 'new', key: 'brand-abc' }) }));
  assert.match(fresh, /Lưu thương hiệu trước, rồi thêm logo\./);
  assert.doesNotMatch(fresh, /type="file"/);
});
