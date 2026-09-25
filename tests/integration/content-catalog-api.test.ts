import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import BetterSqlite3 from 'better-sqlite3';
import ownerContentCatalogApiSchema from '../../contracts/api/owner-content-catalog-api.schema.json' with { type: 'json' };
import contentCatalogItemCreateSchema from '../../contracts/flow/content-catalog-item-create-request.schema.json' with { type: 'json' };
import { openDatabase } from '../../src/platform/db/database.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { syntheticJpeg, syntheticPng } from '../helpers/content-images.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const brandId = '88888888-8888-4888-8888-000000000001';
const otherBrandId = '88888888-8888-4888-8888-000000000002';
const itemId = '88888888-8888-4888-8888-0000000000a1';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const displayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
};
const logo = syntheticPng(256, 256);
const photo = syntheticJpeg(1200, 900);
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const json = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };
const image = (type: string) => ({ authorization: `Bearer ${token}`, 'content-type': type, origin });
const item = (patch: Record<string, unknown> = {}) => ({
  itemType: 'PHYSICAL', name: 'Canxi Nano D3K2', description: 'Viên uống bổ sung canxi.',
  tiers: [{ tierKey: 'hop-30', name: 'Hộp 30 viên', priceText: '320.000đ', inclusions: ['30 viên'] }, { tierKey: 'hop-60', name: 'Hộp 60 viên', priceText: '590.000đ', inclusions: ['60 viên', 'Miễn phí giao hàng'] }],
  photos: [{ mediaSha256: sha(photo), posterDefault: true }],
  ...patch,
});

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-catalog-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  openDatabase({ databasePath }).db.close();
  return { root, databasePath, artifactRoot };
}
async function listen(handler: http.RequestListener): Promise<{ base: string; close(): Promise<void> }> {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}
async function serve(state: ReturnType<typeof fixture>, run: (read: string, owner: string) => Promise<void>) {
  let tick = 0; const ids = [brandId, otherBrandId, itemId, '88888888-8888-4888-8888-0000000000a2'];
  const owner = openContentOwnerApi({ ...state, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', uuid: () => ids.shift()!, now: () => new Date(Date.UTC(2027, 0, 1, 0, 0, tick++)) });
  const read = openContentReadApi(state);
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  try {
    for (const key of ['canxi-viet', 'nanobone']) assert.equal((await fetch(`${ownerServer.base}/owner-api/content/brands`, { method: 'POST', headers: json, body: JSON.stringify({ contractVersion: '1.0.0', brandKey: key, profile: { brandName: key }, displayRules }) })).status, 201);
    await run(readServer.base, ownerServer.base);
  } finally { await ownerServer.close(); await readServer.close(); owner.close(); read.close(); }
}
function counts(state: ReturnType<typeof fixture>): Record<string, number> {
  const db = new BetterSqlite3(state.databasePath);
  const value = db.prepare(`SELECT (SELECT count(*) FROM flow_content_media) media, (SELECT count(*) FROM flow_content_catalog_items) items,
    (SELECT count(*) FROM flow_content_catalog_item_revisions) revisions, (SELECT count(*) FROM flow_content_brand_revisions) brandRevisions,
    (SELECT count(*) FROM artifact_manifests) manifests`).get() as Record<string, number>;
  db.close(); return value;
}
function tamper(state: ReturnType<typeof fixture>, digest: string): void {
  const file = path.join(state.artifactRoot, 'sha256', digest.slice(0, 2), digest);
  fs.chmodSync(file, 0o600); const bytes = fs.readFileSync(file); bytes[bytes.length - 3] = bytes[bytes.length - 3]! ^ 0xff; fs.writeFileSync(file, bytes);
}

test('OWNER media uploads validate images and deduplicate exact uploads without writing on rejection', async () => {
  const state = fixture();
  await serve(state, async (_read, owner) => {
    const url = `${owner}/owner-api/content/brands/${brandId}/media/logo`;
    const created = await fetch(url, { method: 'POST', headers: image('image/png'), body: logo });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { contractVersion: '1.0.0', brandId, mediaKind: 'LOGO', mediaSha256: sha(logo), mediaType: 'image/png', width: 256, height: 256, byteSize: logo.length, exactRetry: false });
    const retry = await fetch(url, { method: 'POST', headers: image('image/png'), body: logo });
    assert.equal(retry.status, 200); assert.equal(((await retry.json()) as { exactRetry: boolean }).exactRetry, true);
    assert.equal((await fetch(`${owner}/owner-api/content/brands/${brandId}/media/photo`, { method: 'POST', headers: image('image/jpeg'), body: photo })).status, 201);
    const before = counts(state);
    const rejected: [RequestInit, number, string | undefined][] = [
      [{ headers: image('image/svg+xml'), body: '<svg xmlns="http://www.w3.org/2000/svg"/>' }, 400, 'unsupported_format'],
      [{ headers: image('image/jpeg'), body: logo }, 400, 'type_mismatch'],
      [{ headers: image('image/png'), body: syntheticPng(96, 64).subarray(0, 50) }, 400, 'invalid'],
      [{ headers: image('image/png'), body: Buffer.alloc(2 * 1024 * 1024 + 1, 1) }, 400, 'too_large'],
      [{ headers: image('image/png'), body: syntheticPng(32, 32) }, 400, 'dimensions'],
      [{ headers: image('application/json'), body: logo }, 400, undefined],
      [{ headers: image('image/png') }, 400, undefined],
      [{ headers: { ...image('image/png'), authorization: 'Bearer wrong' }, body: logo }, 401, undefined],
      [{ headers: { ...image('image/png'), origin: 'http://evil.example' }, body: logo }, 403, undefined],
    ];
    for (const [init, status, reason] of rejected) {
      const response = await fetch(url, { method: 'POST', ...init });
      assert.equal(response.status, status, reason);
      const body = await response.json() as { error: { reason?: string } };
      assert.equal(body.error.reason, reason);
    }
    assert.equal((await fetch(`${owner}/owner-api/content/brands/88888888-8888-4888-8888-00000000ffff/media/logo`, { method: 'POST', headers: image('image/png'), body: logo })).status, 404);
    assert.equal((await fetch(`${owner}/owner-api/content/brands/${brandId}/media/banner`, { method: 'POST', headers: image('image/png'), body: logo })).status, 404);
    const preflight = await fetch(url, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(preflight.status, 204);
    assert.deepEqual(counts(state), before);
  });
});

test('media previews are served only for registered brand media, with safe headers and verified bytes', async () => {
  const state = fixture();
  await serve(state, async (read, owner) => {
    await fetch(`${owner}/owner-api/content/brands/${brandId}/media/photo`, { method: 'POST', headers: image('image/jpeg'), body: photo });
    const response = await fetch(`${read}/api/content/brands/${brandId}/media/${sha(photo)}`);
    assert.equal(response.status, 200);
    assert.equal(Buffer.from(await response.arrayBuffer()).equals(photo), true);
    assert.equal(response.headers.get('content-type'), 'image/jpeg');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(response.headers.get('content-disposition'), 'inline');
    assert.equal(response.headers.get('cross-origin-resource-policy'), 'same-origin');
    assert.match(response.headers.get('cache-control') ?? '', /^private, max-age=\d+, immutable$/);
    assert.equal((await fetch(`${read}/api/content/brands/${otherBrandId}/media/${sha(photo)}`)).status, 404);
    assert.equal((await fetch(`${read}/api/content/brands/${brandId}/media/${sha(logo)}`)).status, 404);
    assert.equal((await fetch(`${read}/api/content/brands/${brandId}/media/not-a-digest`)).status, 400);
    const db = new BetterSqlite3(state.databasePath);
    const brandArtifact = (db.prepare('SELECT brand_artifact_sha256 digest FROM flow_content_brand_revisions WHERE brand_id = ?').get(brandId) as { digest: string }).digest;
    db.close();
    assert.equal((await fetch(`${read}/api/content/brands/${brandId}/media/${brandArtifact}`)).status, 404, 'non-media artifacts are never served');
    tamper(state, sha(photo));
    const tampered = await fetch(`${read}/api/content/brands/${brandId}/media/${sha(photo)}`);
    assert.equal(tampered.status, 500);
    assert.equal(tampered.headers.get('content-type'), 'application/json; charset=utf-8');
  });
});

test('OWNER catalog create and revision return receipts, retries, conflicts and verified reads', async () => {
  const state = fixture();
  await serve(state, async (read, owner) => {
    await fetch(`${owner}/owner-api/content/brands/${brandId}/media/photo`, { method: 'POST', headers: image('image/jpeg'), body: photo });
    const catalogUrl = `${owner}/owner-api/content/brands/${brandId}/catalog`;
    const body = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', itemKey: 'canxi-nano', item: item(), ...patch });
    const created = await fetch(catalogUrl, { method: 'POST', headers: json, body: body() });
    assert.equal(created.status, 201);
    const receipt = await created.json() as Record<string, unknown>;
    assert.deepEqual({ ...receipt, createdAt: '<t>' }, { contractVersion: '1.0.0', brandId, itemId, itemKey: 'canxi-nano', version: 1, name: 'Canxi Nano D3K2', createdAt: '<t>', exactRetry: false });
    assert.equal((await fetch(catalogUrl, { method: 'POST', headers: json, body: body() })).status, 200);
    assert.equal((await fetch(catalogUrl, { method: 'POST', headers: json, body: body({ item: item({ name: 'Khác' }) }) })).status, 409);
    const revisionUrl = `${catalogUrl}/${itemId}/revisions`;
    const revision = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, item: item({ description: 'Mô tả mới.' }), ...patch });
    assert.equal((await fetch(revisionUrl, { method: 'POST', headers: json, body: revision() })).status, 201);
    assert.equal((await fetch(revisionUrl, { method: 'POST', headers: json, body: revision() })).status, 200);
    assert.equal((await fetch(revisionUrl, { method: 'POST', headers: json, body: revision({ item: item({ name: 'Stale' }) }) })).status, 409);
    assert.equal((await fetch(`${owner}/owner-api/content/brands/${otherBrandId}/catalog/${itemId}/revisions`, { method: 'POST', headers: json, body: revision({ expectedVersion: 2 }) })).status, 404);
    assert.equal((await fetch(`${catalogUrl}/88888888-8888-4888-8888-00000000ffff/revisions`, { method: 'POST', headers: json, body: revision() })).status, 404);
    const before = counts(state);
    for (const invalid of [body({ extra: 1 }), body({ item: item({ photos: [{ mediaSha256: sha(logo), posterDefault: true }] }) }), body({ itemKey: 'Bad Key' }), '{']) {
      assert.equal((await fetch(catalogUrl, { method: 'POST', headers: json, body: invalid })).status, 400);
    }
    assert.deepEqual(counts(state), before);

    const list = await (await fetch(`${read}/api/content/brands/${brandId}/catalog`)).json() as { brandId: string; items: Record<string, unknown>[] };
    assert.equal(list.brandId, brandId);
    assert.deepEqual({ ...list.items[0], updatedAt: '<t>' }, { itemId, itemKey: 'canxi-nano', version: 2, itemType: 'PHYSICAL', name: 'Canxi Nano D3K2', tierNames: ['Hộp 30 viên', 'Hộp 60 viên'], photoCount: 1, updatedAt: '<t>' });
    assert.deepEqual(await (await fetch(`${read}/api/content/brands/${otherBrandId}/catalog`)).json(), { contractVersion: '1.0.0', brandId: otherBrandId, items: [] });
    const detail = await (await fetch(`${read}/api/content/brands/${brandId}/catalog/${itemId}`)).json() as { item: Record<string, unknown>; history: { version: number }[] };
    assert.deepEqual(detail.item.item, item({ description: 'Mô tả mới.' }));
    assert.deepEqual(detail.history.map((entry) => entry.version), [1, 2]);
    assert.equal((await fetch(`${read}/api/content/brands/${otherBrandId}/catalog/${itemId}`)).status, 404);
    assert.equal((await fetch(`${read}/api/content/brands/88888888-8888-4888-8888-00000000ffff/catalog`)).status, 404);
  });
});

test('catalog revisions are refused without writing when history or referenced photos fail verification', async () => {
  const state = fixture();
  await serve(state, async (read, owner) => {
    await fetch(`${owner}/owner-api/content/brands/${brandId}/media/photo`, { method: 'POST', headers: image('image/jpeg'), body: photo });
    await fetch(`${owner}/owner-api/content/brands/${brandId}/catalog`, { method: 'POST', headers: json, body: JSON.stringify({ contractVersion: '1.0.0', itemKey: 'canxi-nano', item: item({ photos: [] }) }) });
    const revisionUrl = `${owner}/owner-api/content/brands/${brandId}/catalog/${itemId}/revisions`;
    tamper(state, sha(photo));
    let before = counts(state);
    const badPhoto = await fetch(revisionUrl, { method: 'POST', headers: json, body: JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, item: item() }) });
    assert.equal(badPhoto.status, 500);
    assert.deepEqual(counts(state), before);
    const db = new BetterSqlite3(state.databasePath);
    const v1 = (db.prepare('SELECT item_artifact_sha256 digest FROM flow_content_catalog_item_revisions WHERE version = 1').get() as { digest: string }).digest;
    db.close();
    fs.rmSync(path.join(state.artifactRoot, 'sha256', v1.slice(0, 2), v1));
    before = counts(state);
    const badHistory = await fetch(revisionUrl, { method: 'POST', headers: json, body: JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, item: item({ photos: [], name: 'Mới' }) }) });
    assert.equal(badHistory.status, 500);
    assert.deepEqual(counts(state), before);
    assert.equal((await fetch(`${read}/api/content/brands/${brandId}/catalog`)).status, 500);
  });
});

test('brand revisions accept a registered logo through the OWNER API and expose it on read', async () => {
  const state = fixture();
  await serve(state, async (read, owner) => {
    const revision = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, profile: { brandName: 'canxi-viet' }, displayRules, logoMediaSha256: sha(logo), ...patch });
    const url = `${owner}/owner-api/content/brands/${brandId}/revisions`;
    assert.equal((await fetch(url, { method: 'POST', headers: json, body: revision() })).status, 400);
    await fetch(`${owner}/owner-api/content/brands/${otherBrandId}/media/logo`, { method: 'POST', headers: image('image/png'), body: logo });
    assert.equal((await fetch(url, { method: 'POST', headers: json, body: revision() })).status, 400, 'logo of another brand');
    await fetch(`${owner}/owner-api/content/brands/${brandId}/media/logo`, { method: 'POST', headers: image('image/png'), body: logo });
    assert.equal((await fetch(url, { method: 'POST', headers: json, body: revision() })).status, 201);
    const detail = await (await fetch(`${read}/api/content/brands/${brandId}`)).json() as { brand: { logoMediaSha256?: string } };
    assert.equal(detail.brand.logoMediaSha256, sha(logo));
    tamper(state, sha(logo));
    const before = counts(state);
    assert.equal((await fetch(url, { method: 'POST', headers: json, body: revision({ expectedVersion: 2, profile: { brandName: 'Canxi Việt' } }) })).status, 500);
    assert.deepEqual(counts(state), before);
  });
});

test('the OWNER catalog contract accepts real requests and rejects invalid nested items', () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
  ajv.addSchema(contentCatalogItemCreateSchema); ajv.addSchema(ownerContentCatalogApiSchema);
  const create = ajv.getSchema(`${ownerContentCatalogApiSchema.$id}#/$defs/createRequest`)!;
  const media = ajv.getSchema(`${ownerContentCatalogApiSchema.$id}#/$defs/mediaReceipt`)!;
  assert.equal(create({ contractVersion: '1.0.0', itemKey: 'canxi-nano', item: item() }), true);
  assert.equal(create({ contractVersion: '1.0.0', itemKey: 'canxi-nano', item: { invented: 1 } }), false);
  assert.equal(create({ contractVersion: '1.0.0', itemKey: 'canxi-nano', item: item({ tiers: [{ tierKey: 'x', name: 'X' }] }) }), false);
  assert.equal(media({ contractVersion: '1.0.0', brandId, mediaKind: 'LOGO', mediaSha256: sha(logo), mediaType: 'image/svg+xml', width: 256, height: 256, byteSize: 1, exactRetry: false }), false);
});
