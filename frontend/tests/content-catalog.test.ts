import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createSeedState } from '../src/model';
import { parseRoute, routeToHash } from '../src/routing';
import {
  catalogDraftBlocker,
  catalogEditorReducer,
  catalogRequestFromDraft,
  createDemoItem,
  draftFromItem,
  emptyCatalogDraft,
  loadCatalog,
  loadCatalogItem,
  mediaBlocker,
  mediaRejectionMessage,
  mediaUrl,
  reviseDemoItem,
  submitCatalogCreate,
  submitCatalogRevision,
  uploadBrandMedia,
} from '../src/catalog-data-source';
import { ContentDataSourceError } from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';

const brandId = '66666666-6666-4666-8666-000000000001';
const itemId = '66666666-6666-4666-8666-0000000000a1';
const digest = 'a'.repeat(64);
const time = '2027-01-01T00:00:00.000Z';
const json = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const content = { itemType: 'SERVICE', name: 'Tư vấn', description: 'Online 1:1.', tiers: [{ tierKey: 'go', name: 'Go', priceText: '99.000đ', inclusions: ['1 buổi 30 phút'] }], photos: [{ mediaSha256: digest, posterDefault: true }] };

test('catalog routes parse and build under their brand', () => {
  const state = createSeedState();
  assert.deepEqual(parseRoute(routeToHash.catalog(brandId), state), { kind: 'catalog', brandId, itemId: null });
  assert.deepEqual(parseRoute(routeToHash.catalogItem(brandId, itemId), state), { kind: 'catalog', brandId, itemId });
  assert.equal(parseRoute(`#/brands/${brandId}/products/not-a-uuid`, state).kind, 'invalid');
  assert.equal(parseRoute(`#/brands/${brandId}/photos`, state).kind, 'invalid');
});

test('catalog drafts become trimmed requests with one inclusion per line', () => {
  const draft = { ...emptyCatalogDraft(), itemType: 'SERVICE' as const, name: ' Tư vấn ', description: '  ', tiers: [{ tierKey: 'go', name: ' Go ', priceText: ' ', inclusionsText: '1 buổi\n\n  Thực đơn  \n' }], photos: [{ mediaSha256: digest, posterDefault: false }] };
  assert.deepEqual(catalogRequestFromDraft(draft), { itemType: 'SERVICE', name: 'Tư vấn', tiers: [{ tierKey: 'go', name: 'Go', inclusions: ['1 buổi', 'Thực đơn'] }], photos: [{ mediaSha256: digest, posterDefault: false }] });
  assert.deepEqual(draftFromItem(content as never).tiers[0], { tierKey: 'go', name: 'Go', priceText: '99.000đ', inclusionsText: '1 buổi 30 phút' });
  assert.equal(catalogDraftBlocker(emptyCatalogDraft()), 'Nhập tên sản phẩm hoặc dịch vụ.');
  assert.equal(catalogDraftBlocker({ ...draft, tiers: [{ ...draft.tiers[0]!, name: '' }] }), 'Mỗi gói cần có tên.');
  assert.equal(catalogDraftBlocker({ ...draft, tiers: Array.from({ length: 9 }, (_, index) => ({ tierKey: `t${index}`, name: 'Gói', priceText: '', inclusionsText: '' })) }), 'Tối đa 8 gói.');
  assert.equal(catalogDraftBlocker({ ...draft, tiers: [{ ...draft.tiers[0]!, inclusionsText: Array.from({ length: 13 }, () => 'x').join('\n') }] }), 'Mỗi gói tối đa 12 dòng “Bao gồm”.');
  assert.equal(catalogDraftBlocker(draft), null);
});

test('catalog read responses are validated before use', async () => {
  const summary = { itemId, itemKey: 'tu-van', version: 1, itemType: 'SERVICE', name: 'Tư vấn', tierNames: ['Go'], photoCount: 1, updatedAt: time };
  assert.deepEqual(await loadCatalog(brandId, async () => json(200, { contractVersion: '1.0.0', brandId, items: [summary] })), [summary]);
  await assert.rejects(loadCatalog(brandId, async () => json(200, { contractVersion: '1.0.0', brandId: itemId, items: [] })), ContentDataSourceError);
  await assert.rejects(loadCatalog(brandId, async () => json(200, { contractVersion: '1.0.0', brandId, items: [{ ...summary, itemType: 'DIGITAL' }] })), ContentDataSourceError);
  const detail = { contractVersion: '1.0.0', item: { itemId, brandId, itemKey: 'tu-van', version: 1, item: content, createdAt: time }, history: [{ version: 1, name: 'Tư vấn', createdAt: time }] };
  assert.equal((await loadCatalogItem(brandId, itemId, async () => json(200, detail)))!.item.version, 1);
  await assert.rejects(loadCatalogItem(brandId, itemId, async () => json(200, { ...detail, item: { ...detail.item, brandId: itemId } })), ContentDataSourceError);
  await assert.rejects(loadCatalogItem(brandId, itemId, async () => json(200, { ...detail, item: { ...detail.item, item: { ...content, photos: [{ mediaSha256: 'x', posterDefault: true }] } } })), ContentDataSourceError);
  assert.equal(await loadCatalogItem(brandId, itemId, async () => json(404, { error: { code: 'not_found', message: 'x' } })), null);
});

test('OWNER catalog submissions post exact bodies and map failures', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  const receipt = { contractVersion: '1.0.0', brandId, itemId, itemKey: 'item-abc', version: 1, name: 'Tư vấn', createdAt: time, exactRetry: false };
  const fetcher = async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init! }); return json(201, receipt); };
  assert.deepEqual(await submitCatalogCreate({ brandId, itemKey: 'item-abc', item: content as never, token: 't' }, fetcher), receipt);
  assert.equal(calls[0]!.url, `/owner-api/content/brands/${brandId}/catalog`);
  assert.deepEqual(JSON.parse(String(calls[0]!.init.body)), { contractVersion: '1.0.0', itemKey: 'item-abc', item: content });
  await submitCatalogRevision({ brandId, itemId, expectedVersion: 1, item: content as never, token: 't' }, fetcher);
  assert.equal(calls[1]!.url, `/owner-api/content/brands/${brandId}/catalog/${itemId}/revisions`);
  assert.deepEqual(JSON.parse(String(calls[1]!.init.body)), { contractVersion: '1.0.0', expectedVersion: 1, item: content });
  await assert.rejects(submitCatalogCreate({ brandId, itemKey: 'item-abc', item: content as never, token: 't' }, async () => json(409, { error: { code: 'conflict', message: 'x' } })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'conflict');
  await assert.rejects(submitCatalogCreate({ brandId, itemKey: 'item-abc', item: content as never, token: 't' }, async () => json(201, { ...receipt, brandId: itemId })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('media uploads send raw bytes with their type and explain rejections', async () => {
  const file = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' });
  const receipt = { contractVersion: '1.0.0', brandId, mediaKind: 'LOGO', mediaSha256: digest, mediaType: 'image/png', width: 256, height: 256, byteSize: 3, exactRetry: false };
  let seen: RequestInit | undefined; let seenUrl = '';
  assert.deepEqual(await uploadBrandMedia({ brandId, kind: 'LOGO', file, token: 'secret' }, async (url, init) => { seenUrl = String(url); seen = init; return json(201, receipt); }), receipt);
  assert.equal(seenUrl, `/owner-api/content/brands/${brandId}/media/logo`);
  assert.equal((seen!.headers as Record<string, string>)['Content-Type'], 'image/png');
  assert.equal(seen!.body, file);
  await assert.rejects(uploadBrandMedia({ brandId, kind: 'PHOTO', file, token: 't' }, async () => json(400, { error: { code: 'bad_request', message: 'x', reason: 'trailing_data' } })),
    (error: unknown) => error instanceof OwnerWriteError && error.kind === 'invalid' && error.message === mediaRejectionMessage('trailing_data', 'PHOTO'));
  await assert.rejects(uploadBrandMedia({ brandId, kind: 'LOGO', file, token: 't' }, async () => json(201, { ...receipt, mediaKind: 'PHOTO' })), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
  assert.equal(mediaBlocker({ type: 'image/svg+xml', size: 10 }, 'LOGO'), mediaRejectionMessage('unsupported_format', 'LOGO'));
  assert.equal(mediaBlocker({ type: 'image/png', size: 2 * 1024 * 1024 + 1 }, 'LOGO'), 'Logo tối đa 2 MB.');
  assert.equal(mediaBlocker({ type: 'image/jpeg', size: 2 * 1024 * 1024 + 1 }, 'PHOTO'), null);
  assert.equal(mediaBlocker({ type: 'image/jpeg', size: 8 * 1024 * 1024 + 1 }, 'PHOTO'), 'Ảnh tối đa 8 MB.');
  assert.equal(mediaUrl(brandId, digest), `/api/content/brands/${brandId}/media/${digest}`);
});

test('catalog edits survive conflicts like brand edits', () => {
  const base = (version: number, name: string) => ({ itemId, version, draft: { ...emptyCatalogDraft(), name }, history: [] });
  let editor = catalogEditorReducer(null, { type: 'loaded', base: base(1, 'Tư vấn') });
  editor = catalogEditorReducer(editor, { type: 'edit', draft: { ...editor.draft, name: 'LOCAL' } });
  editor = catalogEditorReducer(catalogEditorReducer(editor, { type: 'submitted' }), { type: 'failed', conflict: true, message: '' });
  editor = catalogEditorReducer(editor, { type: 'loaded', base: base(2, 'SERVER') });
  assert.equal(editor.draft.name, 'LOCAL');
  assert.deepEqual(editor.notice, { kind: 'rebased', fromVersion: 1, toVersion: 2, fields: ['Tên'] });
});

test('demo catalog items are versioned in memory only', () => {
  const draft = { ...emptyCatalogDraft(), name: 'Demo' };
  const created = createDemoItem([], brandId, draft, itemId, time);
  assert.deepEqual([created.length, created[0]!.version, created[0]!.brandId], [1, 1, brandId]);
  const revised = reviseDemoItem(created, itemId, 1, { ...draft, description: 'Mới' }, time);
  assert.deepEqual([revised[0]!.version, revised[0]!.history.length, revised[0]!.item.description], [2, 2, 'Mới']);
  assert.throws(() => reviseDemoItem(revised, itemId, 1, draft, time), /conflict/);
});

test('catalog frontend sources contain no hard-coded development or remote origins', () => {
  const sources = ['frontend/src/catalog-data-source.ts', 'frontend/src/CatalogPanel.tsx', 'frontend/src/MediaUpload.tsx'].map((file) => fs.readFileSync(file, 'utf8')).join('\n');
  assert.doesNotMatch(sources, /https?:\/\/[^'"`\s]+|(?:localhost|127\.0\.0\.1):\d+/);
});

test('the catalog form renders tiers, photos with Poster switches, the kept draft on conflict, and locks while saving', async () => {
  const { createElement } = await import('react');
  const { renderToStaticMarkup } = await import('react-dom/server');
  const { tsImport } = await import('tsx/esm/api');
  const { CatalogForm } = await tsImport('../src/CatalogPanel.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/CatalogPanel');
  const props = { mode: 'real' as const, brandId, brandName: 'Canxi Việt', itemId, ownerToken: 'token', writesAvailable: true, demoItems: [], setDemoItems: () => undefined, mediaSrc: (value: string) => `/media/${value}`, addDemoMedia: () => undefined, navigate: () => undefined, notify: () => undefined, dispatch: () => undefined, onSaved: () => undefined, onConflict: () => undefined };
  const saved = draftFromItem(content as never);
  let editor = catalogEditorReducer(null, { type: 'loaded', base: { itemId, version: 1, draft: saved, history: [{ version: 1, name: 'Tư vấn', createdAt: time }] } });
  editor = catalogEditorReducer(editor, { type: 'edit', draft: { ...editor.draft, name: 'LOCAL UNSAVED' } });
  editor = catalogEditorReducer(catalogEditorReducer(editor, { type: 'submitted' }), { type: 'failed', conflict: true, message: '' });
  editor = catalogEditorReducer(editor, { type: 'loaded', base: { itemId, version: 2, draft: { ...saved, name: 'SERVER' }, history: [] } });
  const html = renderToStaticMarkup(createElement(CatalogForm, { ...props, editor }));
  assert.match(html, /value="LOCAL UNSAVED"/);
  assert.match(html, /Bỏ thay đổi, dùng phiên bản 2/);
  assert.match(html, /value="Go"/);
  assert.match(html, /value="99\.000đ"/);
  assert.match(html, new RegExp(`<img src="/media/${digest}"`));
  assert.match(html, /<input type="checkbox" checked=""\/><span>Dùng cho Poster<\/span>/);
  const saving = renderToStaticMarkup(createElement(CatalogForm, { ...props, editor: catalogEditorReducer(catalogEditorReducer(null, { type: 'loaded', base: { itemId, version: 1, draft: saved, history: [] } }), { type: 'submitted' }) }));
  assert.equal((saving.match(/<fieldset[^>]*disabled=""/g) ?? []).length, 3);
  const locked = renderToStaticMarkup(createElement(CatalogForm, { ...props, ownerToken: null, editor: catalogEditorReducer(null, { type: 'new', key: 'item-abc', target: `new:${brandId}` }) }));
  assert.match(locked, /Mở khóa OWNER cục bộ/);
});
