import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { tsImport } from 'tsx/esm/api';
import { brandEditorReducer, type BrandBase } from '../src/brand-editor';
import { catalogEditorReducer, emptyCatalogDraft, type CatalogBase, type CatalogDraft } from '../src/catalog-data-source';
import { draftFromBrand, DEFAULT_DISPLAY_RULES } from '../src/content-data-source';
import { uploadCallbacks, type DraftEditor, type DraftEditorEvent, type EditorBase } from '../src/draft-editor';
import { runUploads } from '../src/media-upload-runner';

const brandA = '66666666-6666-4666-8666-00000000000a';
const brandB = '66666666-6666-4666-8666-00000000000b';
const itemA = '66666666-6666-4666-8666-0000000000a1';
const itemB = '66666666-6666-4666-8666-0000000000b1';
const digest = (n: number) => String(n).repeat(64).slice(0, 64);
const png = (name = 'a.png') => new File([new Uint8Array([1, 2, 3])], name, { type: 'image/png' });

/** A reducer-backed store standing in for the page component. */
function store<D, B extends EditorBase<D>>(reducer: (state: DraftEditor<D, B> | null, event: DraftEditorEvent<D, B>) => DraftEditor<D, B>) {
  let state: DraftEditor<D, B> | null = null;
  const dispatch = (event: DraftEditorEvent<D, B>) => { state = reducer(state, event); };
  return { dispatch, get: () => state! };
}
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((ok, fail) => { resolve = ok; reject = fail; });
  return { promise, resolve, reject };
}
const item = (itemId: string, version = 1, patch: Partial<CatalogDraft> = {}): CatalogBase => ({ itemId, version, draft: { ...emptyCatalogDraft(), name: itemId === itemA ? 'A' : 'B', ...patch }, history: [] });
const brand = (brandId: string, version = 1): BrandBase => ({ brandId, version, draft: draftFromBrand({ profile: { brandName: brandId === brandA ? 'A' : 'B' }, displayRules: DEFAULT_DISPLAY_RULES }), history: [] });
const addPhoto = (draft: CatalogDraft, mediaSha256: string): CatalogDraft => ({ ...draft, photos: [...draft.photos, { mediaSha256, posterDefault: true }] });

/** Starts an upload of `files` bound to the editor session that is current now; the uploader is controlled by the test. */
function startUpload<D, B extends EditorBase<D>>(s: ReturnType<typeof store<D, B>>, apply: (draft: D, mediaSha256: string) => D, files: File[], results: Promise<string>[]) {
  let call = 0;
  return runUploads(files, { ...uploadCallbacks(s.dispatch, s.get().session, apply), check: () => null, upload: () => results[call++]!, report: () => undefined });
}

test('R1: a late catalog upload never lands in another item, a new item or a later session of the same item', async () => {
  const s = store(catalogEditorReducer);
  s.dispatch({ type: 'loaded', base: item(itemA) });
  const toB = deferred<string>();
  const uploadForA = startUpload(s, addPhoto, [png()], [toB.promise]);
  s.dispatch({ type: 'loaded', base: item(itemB) });
  toB.resolve(digest(1)); await uploadForA;
  assert.deepEqual([s.get().target, s.get().draft.photos.length, s.get().uploads], [itemB, 0, 0]);

  const toNew = deferred<string>();
  const uploadForB = startUpload(s, addPhoto, [png()], [toNew.promise]);
  s.dispatch({ type: 'new', key: 'item-new', target: `new:${brandA}` });
  toNew.resolve(digest(2)); await uploadForB;
  assert.deepEqual([s.get().target, s.get().draft.photos.length, s.get().newKey], [`new:${brandA}`, 0, 'item-new']);

  s.dispatch({ type: 'loaded', base: item(itemA) });
  const reopened = deferred<string>();
  const stale = startUpload(s, addPhoto, [png()], [reopened.promise]);
  s.dispatch({ type: 'loaded', base: item(itemB) });
  s.dispatch({ type: 'loaded', base: item(itemA) });
  reopened.resolve(digest(3)); await stale;
  assert.deepEqual([s.get().target, s.get().draft.photos.length, s.get().uploads], [itemA, 0, 0]);
});

test('R1: a late logo upload never lands in another brand', async () => {
  const s = store(brandEditorReducer);
  s.dispatch({ type: 'loaded', base: brand(brandA) });
  const pending = deferred<string>();
  const upload = startUpload(s, (draft, sha) => ({ ...draft, logoMediaSha256: sha }), [png('logo.png')], [pending.promise]);
  s.dispatch({ type: 'loaded', base: brand(brandB) });
  pending.resolve(digest(4)); await upload;
  assert.deepEqual([s.get().target, s.get().draft.logoMediaSha256], [brandB, '']);
});

test('same-editor completions merge into current edits, including several files and failures', async () => {
  const s = store(catalogEditorReducer);
  s.dispatch({ type: 'loaded', base: item(itemA) });
  const first = deferred<string>(); const second = deferred<string>(); const third = deferred<string>();
  const reports: string[] = [];
  let call = 0;
  const upload = runUploads([png('1.png'), png('2.png'), png('3.png')], {
    ...uploadCallbacks(s.dispatch, s.get().session, addPhoto), check: () => null, report: (message) => reports.push(message),
    upload: () => [first.promise, second.promise, third.promise][call++]!,
  });
  assert.equal(s.get().uploads, 1);
  s.dispatch({ type: 'edit', draft: { ...s.get().draft, name: 'Typed during upload' } });
  first.resolve(digest(5)); await new Promise((resolve) => setTimeout(resolve, 0));
  second.reject(new Error('rejected by server')); await new Promise((resolve) => setTimeout(resolve, 0));
  third.resolve(digest(6)); await upload;
  assert.deepEqual([s.get().draft.name, s.get().draft.photos.map((photo) => photo.mediaSha256), s.get().uploads], ['Typed during upload', [digest(5), digest(6)], 0]);
  assert.deepEqual(reports, ['2.png: rejected by server']);
});

test('R2: an upload result that arrives during a save is kept and stays visibly unsaved after the save', async () => {
  for (const [reducer, base, apply, read] of [
    [catalogEditorReducer, item(itemA), addPhoto, (draft: CatalogDraft) => draft.photos.length],
    [brandEditorReducer, brand(brandA), (draft: ReturnType<typeof brand>['draft'], sha: string) => ({ ...draft, logoMediaSha256: sha }), (draft: ReturnType<typeof brand>['draft']) => draft.logoMediaSha256 ? 1 : 0],
  ] as const) {
    const s = store(reducer as never) as ReturnType<typeof store<unknown, EditorBase<unknown>>>;
    s.dispatch({ type: 'loaded', base: base as never });
    const pending = deferred<string>();
    const upload = startUpload(s, apply as never, [png()], [pending.promise]);
    s.dispatch({ type: 'submitted' });
    pending.resolve(digest(7)); await upload;
    assert.equal((read as (draft: unknown) => number)(s.get().draft), 0, 'the submitted snapshot is not changed');
    s.dispatch({ type: 'saved', version: 2 });
    assert.equal((read as (draft: unknown) => number)(s.get().draft), 1, 'the upload is applied after the save settles');
    const saved = { ...(base as { draft: unknown }), version: 2 };
    s.dispatch({ type: 'loaded', base: saved as never });
    assert.deepEqual([(read as (draft: unknown) => number)(s.get().draft), s.get().base?.version, s.get().notice], [1, 2, null], 'kept as an unsaved change, not a conflict');
  }
  const failed = store(catalogEditorReducer);
  failed.dispatch({ type: 'loaded', base: item(itemA) });
  const pending = deferred<string>();
  const upload = startUpload(failed, addPhoto, [png()], [pending.promise]);
  failed.dispatch({ type: 'submitted' });
  pending.resolve(digest(8)); await upload;
  failed.dispatch({ type: 'failed', conflict: true, message: '' });
  assert.equal(failed.get().draft.photos.length, 1, 'kept after a failed save too');
});

test('R2: Save is unavailable while an upload runs, with a Vietnamese explanation', async () => {
  const { CatalogForm } = await tsImport('../src/CatalogPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CatalogPanel');
  const { BrandForm } = await tsImport('../src/BrandsPage.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/BrandsPage');
  const common = { mode: 'real' as const, ownerToken: 'token', writesAvailable: true, mediaSrc: () => '', addDemoMedia: () => undefined, navigate: () => undefined, notify: () => undefined, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined };
  let catalog = catalogEditorReducer(null, { type: 'loaded', base: item(itemA) });
  catalog = catalogEditorReducer(catalog, { type: 'edit', draft: { ...catalog.draft, name: 'Changed' } });
  const uploading = catalogEditorReducer(catalog, { type: 'upload', session: catalog.session, phase: 'start' });
  const catalogHtml = renderToStaticMarkup(createElement(CatalogForm, { ...common, brandId: brandA, brandName: 'A', itemId: itemA, demoItems: [], setDemoItems: () => undefined, editor: uploading }));
  assert.match(catalogHtml, /<button class="button primary" type="submit" disabled=""[^>]*>Lưu phiên bản mới/);
  assert.match(catalogHtml, /Đang tải ảnh lên\. Chờ tải xong rồi lưu\./);
  const idle = renderToStaticMarkup(createElement(CatalogForm, { ...common, brandId: brandA, brandName: 'A', itemId: itemA, demoItems: [], setDemoItems: () => undefined, editor: catalogEditorReducer(uploading, { type: 'upload', session: catalog.session, phase: 'end' }) }));
  assert.doesNotMatch(idle, /type="submit" disabled=""/);
  let logo = brandEditorReducer(null, { type: 'loaded', base: brand(brandA) });
  logo = brandEditorReducer(logo, { type: 'edit', draft: { ...logo.draft, tagline: 'Mới' } });
  const brandHtml = renderToStaticMarkup(createElement(BrandForm, { ...common, brandId: brandA, view: 'profile' as const, itemId: null, demoBrands: [], setDemoBrands: () => undefined, demoItems: [], setDemoItems: () => undefined, demoMedia: {}, editor: brandEditorReducer(logo, { type: 'upload', session: logo.session, phase: 'start' }) }));
  assert.match(brandHtml, /type="submit" disabled=""/);
  assert.match(brandHtml, /Đang tải ảnh lên\. Chờ tải xong rồi lưu\./);
});

test('stale upload lifecycle events from an old session do not change the current upload count', () => {
  let editor = catalogEditorReducer(null, { type: 'loaded', base: item(itemA) });
  const old = editor.session;
  editor = catalogEditorReducer(editor, { type: 'upload', session: old, phase: 'start' });
  editor = catalogEditorReducer(editor, { type: 'loaded', base: item(itemB) });
  assert.equal(editor.uploads, 0);
  editor = catalogEditorReducer(editor, { type: 'upload', session: editor.session, phase: 'start' });
  editor = catalogEditorReducer(editor, { type: 'upload', session: old, phase: 'end' });
  assert.equal(editor.uploads, 1);
});
