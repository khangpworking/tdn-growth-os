import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCatalogIdentityConflictError, ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentImageError } from '../../src/modules/flow/content-image.js';
import { ContentMediaService } from '../../src/modules/flow/content-media-service.js';
import { FlowValidationError } from '../../src/modules/flow/validation.js';
import { fixtureImage, syntheticPng } from '../helpers/content-images.js';

const brandId = '77777777-7777-4777-8777-000000000001';
const otherBrandId = '77777777-7777-4777-8777-000000000002';
const itemId = '77777777-7777-4777-8777-0000000000a1';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const displayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;
const photo = fixtureImage('photo-a.jpg');
const logo = syntheticPng(256, 256);
const photoSha = createHash('sha256').update(photo).digest('hex');
const logoSha = createHash('sha256').update(logo).digest('hex');
const item = (patch: Record<string, unknown> = {}) => ({
  itemType: 'SERVICE', name: 'Tư vấn dinh dưỡng xương', description: 'Chuyên gia tư vấn 1:1, online.',
  tiers: [
    { tierKey: 'go', name: 'Go', priceText: '99.000đ', inclusions: ['1 buổi 30 phút'] },
    { tierKey: 'plus', name: 'Plus', priceText: '249.000đ', inclusions: ['3 buổi', 'Thực đơn'] },
  ],
  photos: [{ mediaSha256: photoSha, posterDefault: true }],
  ...patch,
});
const createRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', brandId, itemKey: 'tu-van', item: item(), ...patch });
const revisionRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', itemId, expectedVersion: 1, item: item({ name: 'Tư vấn xương 1:1' }), ...patch });

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-catalog-')); roots.push(root);
  const { db, migration } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  let tick = 0; const ids = [brandId, otherBrandId];
  const now = () => new Date(Date.UTC(2027, 0, 1, 0, 0, tick++));
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => ids.shift()!, now });
  const media = new ContentMediaService({ db, artifactStore: artifacts, now });
  const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid: () => itemId, now });
  for (const key of ['canxi-viet', 'nanobone']) await brands.createBrand({ contractVersion: '1.0.0', brandKey: key, profile: { brandName: key }, displayRules });
  return { root, db, migration, artifacts, brands, media, catalog };
}
const count = (db: ReturnType<typeof openDatabase>['db'], table: string) => Number((db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint | number }).n);

test('migration 0022 creates immutable media and catalog tables', async () => {
  const state = await setup();
  assert.equal(state.migration.currentVersion, 23);
  const names = (state.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'flow_content_%' AND name NOT LIKE 'flow_content_prompt%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
  assert.deepEqual(names, ['flow_content_brand_revisions', 'flow_content_brands', 'flow_content_catalog_item_revisions', 'flow_content_catalog_items', 'flow_content_media']);
  await state.media.registerMedia({ brandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  await state.catalog.createItem(createRequest());
  assert.throws(() => state.db.prepare("UPDATE flow_content_media SET width = 100").run(), /flow_content_media_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_catalog_items').run(), /flow_content_catalog_item_immutable/);
  assert.throws(() => state.db.prepare('UPDATE flow_content_catalog_item_revisions SET item_name = ?').run('X'), /flow_content_catalog_item_revision_immutable/);
  state.db.close();
});

test('media registration validates images, records metadata and deduplicates exact uploads', async () => {
  const state = await setup();
  const first = await state.media.registerMedia({ brandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  assert.deepEqual(first, { brandId, kind: 'PHOTO', mediaSha256: photoSha, mediaType: 'image/jpeg', width: 128, height: 96, byteSize: photo.length, exactRetry: false });
  const retry = await state.media.registerMedia({ brandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  assert.equal(retry.exactRetry, true);
  assert.equal(count(state.db, 'flow_content_media'), 1);
  await state.media.registerMedia({ brandId: otherBrandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  assert.equal(count(state.db, 'flow_content_media'), 2);
  const manifest = state.db.prepare('SELECT media_type mediaType, byte_size byteSize FROM artifact_manifests WHERE sha256 = ?').get(photoSha) as { mediaType: string; byteSize: bigint | number };
  assert.deepEqual([manifest.mediaType, Number(manifest.byteSize)], ['image/jpeg', photo.length]);
  const read = await state.media.readMedia(brandId, photoSha);
  assert.equal(read.bytes.equals(photo), true);
  assert.equal(read.media.mediaType, 'image/jpeg');
  await assert.rejects(state.media.registerMedia({ brandId, kind: 'LOGO', declaredType: 'image/png', bytes: Buffer.from('<svg/>') }), ContentImageError);
  await assert.rejects(state.media.registerMedia({ brandId, kind: 'LOGO', declaredType: 'image/png', bytes: syntheticPng(96, 64, { extraChunks: [] }).subarray(0, 40) }), ContentImageError);
  await assert.rejects(state.media.registerMedia({ brandId: '77777777-7777-4777-8777-00000000ffff', kind: 'LOGO', declaredType: 'image/png', bytes: logo }), FlowValidationError);
  assert.equal(count(state.db, 'flow_content_media'), 2);
  await assert.rejects(state.media.readMedia(brandId, logoSha), FlowValidationError);
  const file = state.artifacts.pathForDigest(photoSha);
  fs.chmodSync(file, 0o600); const tampered = Buffer.from(photo); tampered[tampered.length - 4] = tampered[tampered.length - 4]! ^ 0xff; fs.writeFileSync(file, tampered);
  await assert.rejects(state.media.readMedia(brandId, photoSha));
  state.db.close();
});

test('catalog items are created, read, retried exactly and conflict on changed content', async () => {
  const state = await setup();
  await state.media.registerMedia({ brandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  const created = await state.catalog.createItem(createRequest());
  assert.deepEqual({ ...created, itemArtifactSha256: '<sha>' }, { itemId, brandId, itemArtifactSha256: '<sha>', version: 1, deduplicated: false, databaseMutations: 3 });
  const artifact = await state.catalog.readItem(itemId);
  assert.deepEqual([artifact.brandId, artifact.itemKey, artifact.version, artifact.item], [brandId, 'tu-van', 1, item()]);
  const retry = await state.catalog.createItem(createRequest());
  assert.deepEqual([retry.deduplicated, retry.databaseMutations, retry.itemArtifactSha256], [true, 0, created.itemArtifactSha256]);
  await assert.rejects(state.catalog.createItem(createRequest({ item: item({ name: 'Khác' }) })), ContentCatalogIdentityConflictError);
  assert.deepEqual(state.catalog.listItems(brandId).map((row) => [row.itemId, row.version]), [[itemId, 1]]);
  assert.deepEqual(state.catalog.listItems(otherBrandId), []);
  state.db.close();
});

test('catalog revisions are sequential and reject drift, stale versions and foreign items', async () => {
  const state = await setup();
  await state.media.registerMedia({ brandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  await state.catalog.createItem(createRequest());
  const revised = await state.catalog.reviseItem(revisionRequest());
  assert.equal(revised.version, 2);
  assert.equal((await state.catalog.readItem(itemId)).item.name, 'Tư vấn xương 1:1');
  assert.equal((await state.catalog.readItem(itemId, 1)).item.name, 'Tư vấn dinh dưỡng xương');
  const retry = await state.catalog.reviseItem(revisionRequest());
  assert.deepEqual([retry.version, retry.deduplicated, retry.databaseMutations], [2, true, 0]);
  await assert.rejects(state.catalog.reviseItem(revisionRequest({ item: item({ name: 'Drift' }) })), ContentCatalogIdentityConflictError);
  await assert.rejects(state.catalog.reviseItem(revisionRequest({ expectedVersion: 3 })), ContentCatalogIdentityConflictError);
  await assert.rejects(state.catalog.reviseItem(revisionRequest({ itemId: '77777777-7777-4777-8777-00000000ffff' })), FlowValidationError);
  state.db.close();
});

test('catalog photos must be registered photos of the same brand and keys must be unique', async () => {
  const state = await setup();
  await state.media.registerMedia({ brandId, kind: 'LOGO', declaredType: 'image/png', bytes: logo });
  await state.media.registerMedia({ brandId: otherBrandId, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  const invalid: Record<string, unknown>[] = [
    createRequest(),
    createRequest({ item: item({ photos: [{ mediaSha256: logoSha, posterDefault: true }] }) }),
    createRequest({ item: item({ tiers: [{ tierKey: 'go', name: 'Go', inclusions: [] }, { tierKey: 'go', name: 'Go 2', inclusions: [] }] }) }),
    createRequest({ item: item({ photos: [] , extra: 1 }) }),
    createRequest({ item: item({ photos: [], tiers: Array.from({ length: 9 }, (_, index) => ({ tierKey: `t${index}`, name: `T${index}`, inclusions: [] })) }) }),
    createRequest({ item: item({ photos: [], itemType: 'DIGITAL' }) }),
    createRequest({ item: item({ photos: [], name: ' padded ' }) }),
    createRequest({ brandId: '77777777-7777-4777-8777-00000000ffff', item: item({ photos: [] }) }),
  ];
  for (const request of invalid) await assert.rejects(state.catalog.createItem(request), FlowValidationError);
  assert.equal(count(state.db, 'flow_content_catalog_items'), 0);
  state.db.close();
});

test('brand revisions can set a registered logo, which is verified on read', async () => {
  const state = await setup();
  const revision = { contractVersion: '1.0.0', brandId, expectedVersion: 1, profile: { brandName: 'canxi-viet' }, displayRules, logoMediaSha256: logoSha };
  await assert.rejects(state.brands.reviseBrand(revision), FlowValidationError);
  await state.media.registerMedia({ brandId, kind: 'PHOTO', declaredType: 'image/png', bytes: logo });
  await assert.rejects(state.brands.reviseBrand(revision), FlowValidationError);
  await state.media.registerMedia({ brandId, kind: 'LOGO', declaredType: 'image/png', bytes: logo });
  assert.equal((await state.brands.reviseBrand(revision)).version, 2);
  assert.equal((await state.brands.readBrand(brandId)).logoMediaSha256, logoSha);
  assert.equal((await state.brands.readBrand(brandId, 1)).logoMediaSha256, undefined);
  const { logoMediaSha256: _logo, ...withoutLogo } = revision;
  const removed = await state.brands.reviseBrand({ ...withoutLogo, expectedVersion: 2 });
  assert.equal((await state.brands.readBrand(brandId, removed.version)).logoMediaSha256, undefined);
  state.db.close();
});

test('migration v21 to v22 applies once and leaves 0001-0021 byte-identical', () => {
  const expected0021 = createHash('sha256').update(fs.readFileSync('migrations/0021_flow_content_brands.sql')).digest('hex');
  assert.equal(expected0021, '48e10ccad97535e483d83a89f58aff21306198610ab16f7baa444d45c0998a37');
  const prior = fs.readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-9]|2[01])_/.test(name)).sort();
  assert.equal(prior.length, 21);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-migration-')); roots.push(root);
  const dir = path.join(root, 'migrations'); fs.mkdirSync(dir);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(dir, name));
  const databasePath = path.join(root, 'db.sqlite');
  const v21 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.equal(v21.migration.currentVersion, 21); v21.db.close();
  fs.copyFileSync('migrations/0022_flow_content_catalog_media.sql', path.join(dir, '0022_flow_content_catalog_media.sql'));
  const v22 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(v22.migration.applied, [22]); v22.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(rerun.migration.applied, []); rerun.db.close();
  assert.doesNotMatch(fs.readFileSync('migrations/0022_flow_content_catalog_media.sql', 'utf8'), /REFERENCES\s+(?:governance_|foundation_|analysis_|orchestrator_|flow_(?!content_))/i);
});
