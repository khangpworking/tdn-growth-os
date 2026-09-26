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
import ownerContentCampaignApiSchema from '../../contracts/api/owner-content-campaign-api.schema.json' with { type: 'json' };
import contentCampaignCreateSchema from '../../contracts/flow/content-campaign-create-request.schema.json' with { type: 'json' };
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentMediaService } from '../../src/modules/flow/content-media-service.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { fixtureImage } from '../helpers/content-images.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const brandId = '66666666-6666-4666-8666-000000000001';
const otherBrandId = '66666666-6666-4666-8666-000000000002';
const itemA = '66666666-6666-4666-8666-0000000000a1';
const itemB = '66666666-6666-4666-8666-0000000000a2';
const itemOther = '66666666-6666-4666-8666-0000000000a3';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const secondCampaignId = '66666666-6666-4666-8666-0000000000c2';
const unknownId = '66666666-6666-4666-8666-00000000ffff';
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
const photoSha = createHash('sha256').update(photo).digest('hex');
const tiers = [
  { tierKey: 'go', name: 'Go', priceText: '99.000đ', inclusions: ['1 buổi 30 phút'] },
  { tierKey: 'plus', name: 'Plus', priceText: '249.000đ', inclusions: ['3 buổi', 'Thực đơn'] },
];
const item = (patch: Record<string, unknown> = {}) => ({
  itemType: 'SERVICE', name: 'Tư vấn dinh dưỡng xương', description: 'Chuyên gia tư vấn 1:1, online.',
  tiers, photos: [{ mediaSha256: photoSha, posterDefault: true }], ...patch,
});
const campaign = (patch: Record<string, unknown> = {}) => ({
  name: 'Tết 2027 — quà cho bố mẹ',
  objective: 'Tăng đơn quà Tết cho người con đi làm xa.',
  items: [{ itemId: itemA, itemVersion: 2, tierKeys: ['plus', 'pro'] }, { itemId: itemB, itemVersion: 1 }],
  ...patch,
});
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };
const createBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', campaignKey: 'tet-2027', brandId, campaign: campaign(), ...patch });
const revisionBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 1, campaign: campaign({ name: 'Tết 2027 — đoàn viên' }), ...patch });
const lifecycleBody = (action: string, expectedSequence: number) => JSON.stringify({ contractVersion: '1.0.0', action, expectedSequence });

async function listen(handler: http.RequestListener): Promise<{ base: string; close(): Promise<void> }> {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

/** Seeds two brands and three catalog items (item A has versions 1 and 2) through the services, then serves both APIs. */
async function serve(run: (read: string, owner: string, state: { databasePath: string; artifactRoot: string; advance(days: number): void }) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-campaign-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const clock = { now: Date.UTC(2027, 0, 1) };
  const now = () => new Date(clock.now);
  const { db } = openDatabase({ databasePath });
  try {
    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    const seedIds = [brandId, otherBrandId, itemA, itemB, itemOther];
    const uuid = () => seedIds.shift()!;
    const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid, now });
    const media = new ContentMediaService({ db, artifactStore: artifacts, now });
    const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid, now });
    for (const key of ['canxi-viet', 'nanobone']) await brands.createBrand({ contractVersion: '1.0.0', brandKey: key, profile: { brandName: key }, displayRules });
    for (const id of [brandId, otherBrandId]) await media.registerMedia({ brandId: id, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
    await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'tu-van', item: item() });
    await catalog.reviseItem({ contractVersion: '1.0.0', itemId: itemA, expectedVersion: 1, item: item({ tiers: [...tiers, { tierKey: 'pro', name: 'Pro', priceText: '499.000đ', inclusions: ['6 buổi'] }] }) });
    await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'canxi-nano', item: item({ itemType: 'PHYSICAL', name: 'Canxi nano 30 viên' }) });
    await catalog.createItem({ contractVersion: '1.0.0', brandId: otherBrandId, itemKey: 'nanobone-goi', item: item({ name: 'Gói Nanobone' }) });
  } finally { db.close(); }
  const queue = [campaignId, secondCampaignId];
  const owner = openContentOwnerApi({ databasePath, artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', uuid: () => queue.shift()!, now });
  const read = openContentReadApi({ databasePath, artifactRoot, now });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  try { await run(readServer.base, ownerServer.base, { databasePath, artifactRoot, advance: (days) => { clock.now += days * 86_400_000; } }); }
  finally { await ownerServer.close(); await readServer.close(); owner.close(); read.close(); }
}
function counts(databasePath: string): Record<string, number> {
  const db = new BetterSqlite3(databasePath);
  const value = db.prepare(`SELECT (SELECT count(*) FROM flow_content_campaigns) campaigns, (SELECT count(*) FROM flow_content_campaign_revisions) revisions,
    (SELECT count(*) FROM flow_content_campaign_lifecycle) lifecycle, (SELECT count(*) FROM artifact_manifests) manifests`).get() as Record<string, number>;
  db.close(); return value;
}
function tamper(artifactRoot: string, databasePath: string, query: string, parameters: unknown[], from: string, to: string): void {
  const db = new BetterSqlite3(databasePath);
  const { digest } = db.prepare(query).get(...parameters) as { digest: string };
  db.close();
  const file = path.join(artifactRoot, 'sha256', digest.slice(0, 2), digest);
  fs.chmodSync(file, 0o600); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace(from, to));
}
const post = (url: string, body: string) => fetch(url, { method: 'POST', headers, body });

test('OWNER campaign create and revision return receipts, retries and conflicts; reads resolve item and tier names', async () => {
  await serve(async (read, owner) => {
    const created = await post(`${owner}/owner-api/content/campaigns`, createBody());
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { contractVersion: '1.0.0', campaignId, campaignKey: 'tet-2027', brandId, version: 1, name: 'Tết 2027 — quà cho bố mẹ', createdAt: '2027-01-01T00:00:00.000Z', exactRetry: false });
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 200);
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody({ campaign: campaign({ name: 'Khác' }) }))).status, 409);
    const revisionUrl = `${owner}/owner-api/content/campaigns/${campaignId}/revisions`;
    const revised = await post(revisionUrl, revisionBody());
    assert.equal(revised.status, 201);
    assert.deepEqual(((await revised.json()) as { version: number }).version, 2);
    assert.equal((await post(revisionUrl, revisionBody())).status, 200);
    assert.equal((await post(revisionUrl, revisionBody({ campaign: campaign({ name: 'Stale' }) }))).status, 409);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${unknownId}/revisions`, revisionBody())).status, 404);

    const list = await (await fetch(`${read}/api/content/campaigns`)).json() as { contractVersion: string; campaigns: unknown[] };
    assert.deepEqual(list, {
      contractVersion: '1.0.0',
      campaigns: [{
        campaignId, campaignKey: 'tet-2027', brandId, version: 2, name: 'Tết 2027 — đoàn viên',
        items: [
          { itemId: itemA, itemVersion: 2, name: 'Tư vấn dinh dưỡng xương', tierNames: ['Plus', 'Pro'] },
          { itemId: itemB, itemVersion: 1, name: 'Canxi nano 30 viên', tierNames: [] },
        ],
        updatedAt: '2027-01-01T00:00:00.000Z',
      }],
    });
    const detail = await (await fetch(`${read}/api/content/campaigns/${campaignId}`)).json() as {
      campaign: { campaignKey: string; version: number; campaign: { name: string } }; items: unknown[]; history: { version: number; name: string }[]; lifecycle: unknown;
    };
    assert.deepEqual([detail.campaign.campaignKey, detail.campaign.version, detail.campaign.campaign.name], ['tet-2027', 2, 'Tết 2027 — đoàn viên']);
    assert.deepEqual(detail.items, [
      { itemId: itemA, itemVersion: 2, itemKey: 'tu-van', itemType: 'SERVICE', name: 'Tư vấn dinh dưỡng xương', tiers: [{ tierKey: 'plus', name: 'Plus' }, { tierKey: 'pro', name: 'Pro' }] },
      { itemId: itemB, itemVersion: 1, itemKey: 'canxi-nano', itemType: 'PHYSICAL', name: 'Canxi nano 30 viên', tiers: [] },
    ]);
    assert.deepEqual(detail.history.map((entry) => [entry.version, entry.name]), [[1, 'Tết 2027 — quà cho bố mẹ'], [2, 'Tết 2027 — đoàn viên']]);
    assert.deepEqual(detail.lifecycle, { sequence: 0 });
    assert.equal((await fetch(`${read}/api/content/campaigns/${unknownId}`)).status, 404);
  });
});

test('invalid OWNER campaign requests are rejected without writing', async () => {
  await serve(async (_read, owner, state) => {
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    const before = counts(state.databasePath);
    const create = `${owner}/owner-api/content/campaigns`;
    const rejected: [string, string, number][] = [
      [create, createBody({ campaignKey: 'khac-brand', campaign: campaign({ items: [{ itemId: itemOther, itemVersion: 1 }] }) }), 400],
      [create, createBody({ campaignKey: 'tier-sai', campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1, tierKeys: ['pro'] }] }) }), 400],
      [create, createBody({ campaignKey: 'ws-sai', campaign: campaign({ researchProductWorkspaceId: '66666666-6666-4666-8666-0000000000fe' }) }), 400],
      [create, createBody({ campaignKey: 'brand-sai', brandId: unknownId }), 404],
      [create, createBody({ campaignKey: 'lap-item', campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1 }, { itemId: itemA, itemVersion: 2 }] }) }), 400],
      [create, createBody({ campaignKey: 'thua', extra: 1 }), 400],
      [create, '{', 400],
      [`${owner}/owner-api/content/campaigns/${campaignId}/revisions`, revisionBody({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 9 }] }) }), 400],
      [`${owner}/owner-api/content/campaigns/${campaignId}/lifecycle`, lifecycleBody('RESTORE', 0), 409],
      [`${owner}/owner-api/content/campaigns/${campaignId}/lifecycle`, lifecycleBody('ARCHIVE', 0), 400],
      [`${owner}/owner-api/content/campaigns/not-a-uuid/lifecycle`, lifecycleBody('DELETE', 0), 400],
      [`${owner}/owner-api/content/campaigns/${unknownId}/lifecycle`, lifecycleBody('DELETE', 0), 404],
    ];
    for (const [url, body, status] of rejected) assert.equal((await post(url, body)).status, status, body);
    const reference = await post(create, createBody({ campaignKey: 'ws-sai-2', campaign: campaign({ researchProductWorkspaceId: '66666666-6666-4666-8666-0000000000fd' }) }));
    assert.deepEqual(await reference.json(), { error: { code: 'bad_request', message: 'Invalid campaign reference' } });
    assert.equal((await fetch(create, { method: 'POST', headers: { ...headers, authorization: 'Bearer wrong' }, body: createBody({ campaignKey: 'khong-token' }) })).status, 401);
    assert.deepEqual(counts(state.databasePath), before);
  });
});

test('campaigns are deleted, restorable for 30 days, then drop out of the list', async () => {
  await serve(async (read, owner, state) => {
    await post(`${owner}/owner-api/content/campaigns`, createBody());
    const lifecycleUrl = `${owner}/owner-api/content/campaigns/${campaignId}/lifecycle`;
    const deleted = await post(lifecycleUrl, lifecycleBody('DELETE', 0));
    assert.equal(deleted.status, 201);
    assert.deepEqual(await deleted.json(), { contractVersion: '1.0.0', campaignId, sequence: 1, action: 'DELETE', createdAt: '2027-01-01T00:00:00.000Z', restorableUntil: '2027-01-31T00:00:00.000Z', exactRetry: false });
    assert.equal((await post(lifecycleUrl, lifecycleBody('DELETE', 0))).status, 200);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/revisions`, revisionBody())).status, 409);
    let list = await (await fetch(`${read}/api/content/campaigns`)).json() as { campaigns: { deleted?: unknown }[] };
    assert.deepEqual(list.campaigns[0]!.deleted, { deletedAt: '2027-01-01T00:00:00.000Z', restorableUntil: '2027-01-31T00:00:00.000Z' });
    state.advance(10);
    assert.equal((await post(lifecycleUrl, lifecycleBody('RESTORE', 1))).status, 201);
    list = await (await fetch(`${read}/api/content/campaigns`)).json() as { campaigns: { deleted?: unknown }[] };
    assert.equal(list.campaigns[0]!.deleted, undefined);
    assert.equal((await post(lifecycleUrl, lifecycleBody('DELETE', 2))).status, 201);
    state.advance(31);
    list = await (await fetch(`${read}/api/content/campaigns`)).json() as { campaigns: { deleted?: unknown }[] };
    assert.deepEqual(list.campaigns, []);
    assert.equal((await post(lifecycleUrl, lifecycleBody('RESTORE', 3))).status, 409);
    const detail = await (await fetch(`${read}/api/content/campaigns/${campaignId}`)).json() as { lifecycle: { sequence: number; deleted?: unknown } };
    assert.equal(detail.lifecycle.sequence, 3);
  });
});

test('campaign writes and reads fail closed when the campaign history fails verification', async () => {
  await serve(async (read, owner, state) => {
    await post(`${owner}/owner-api/content/campaigns`, createBody());
    tamper(state.artifactRoot, state.databasePath, 'SELECT campaign_artifact_sha256 digest FROM flow_content_campaign_revisions WHERE version = 1', [], 'bố mẹ', 'ông bà');
    const before = counts(state.databasePath);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/revisions`, revisionBody())).status, 500);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/lifecycle`, lifecycleBody('DELETE', 0))).status, 500);
    const retried = await post(`${owner}/owner-api/content/campaigns`, createBody());
    assert.equal(retried.status, 500);
    assert.deepEqual(await retried.json(), { error: { code: 'integrity_error', message: 'Stored content data failed integrity verification' } });
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody({ campaign: campaign({ name: 'Khác' }) }))).status, 409, 'a changed create is still a key conflict');
    assert.deepEqual(counts(state.databasePath), before);
    assert.equal((await fetch(`${read}/api/content/campaigns/${campaignId}`)).status, 500);
    assert.equal((await fetch(`${read}/api/content/campaigns`)).status, 500);
  });
});

test('campaign reads and revisions fail closed when a pinned catalog item fails verification', async () => {
  await serve(async (read, owner, state) => {
    await post(`${owner}/owner-api/content/campaigns`, createBody());
    tamper(state.artifactRoot, state.databasePath, 'SELECT item_artifact_sha256 digest FROM flow_content_catalog_item_revisions WHERE item_id = ? AND version = 2', [itemA], 'Tư vấn', 'Tu van');
    const before = counts(state.databasePath);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/revisions`, revisionBody())).status, 500);
    assert.deepEqual(counts(state.databasePath), before);
    assert.equal((await fetch(`${read}/api/content/campaigns/${campaignId}`)).status, 500);
    assert.equal((await fetch(`${read}/api/content/campaigns`)).status, 500);
  });
});

test('campaign routes reject query strings, malformed IDs, unknown shapes and oversized bodies', async () => {
  await serve(async (read, owner) => {
    assert.equal((await fetch(`${read}/api/content/campaigns?brandId=${brandId}`)).status, 400);
    const badId = await fetch(`${read}/api/content/campaigns/not-a-uuid`);
    assert.deepEqual([badId.status, await badId.json()], [400, { error: { code: 'bad_request', message: 'Campaign ID must be a UUID' } }]);
    assert.equal((await fetch(`${read}/api/content/campaigns/${campaignId}/items`)).status, 404);
    assert.equal((await fetch(`${read}/api/content/campaigns`, { method: 'POST' })).status, 405);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/not-a-uuid/revisions`, revisionBody())).status, 400);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${campaignId}/history`, revisionBody())).status, 404);
    const large = await post(`${owner}/owner-api/content/campaigns`, createBody({ campaign: campaign({ objective: 'x'.repeat(40 * 1024) }) }));
    assert.deepEqual([large.status, await large.json()], [400, { error: { code: 'bad_request', message: 'Request body is too large' } }]);
  });
});

test('the OWNER campaign contract accepts real requests and rejects invalid nested campaigns', () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
  ajv.addSchema(contentCampaignCreateSchema); ajv.addSchema(ownerContentCampaignApiSchema);
  const create = ajv.getSchema(`${ownerContentCampaignApiSchema.$id}#/$defs/createRequest`)!;
  const revision = ajv.getSchema(`${ownerContentCampaignApiSchema.$id}#/$defs/revisionRequest`)!;
  const lifecycle = ajv.getSchema(`${ownerContentCampaignApiSchema.$id}#/$defs/lifecycleRequest`)!;
  assert.equal(create(JSON.parse(createBody())), true);
  assert.equal(create(JSON.parse(createBody({ campaignKey: 'X' }))), false);
  assert.equal(create(JSON.parse(createBody({ campaign: campaign({ items: [] }) }))), false);
  assert.equal(create(JSON.parse(createBody({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1, tierKeys: ['Plus'] }] }) }))), false);
  assert.equal(revision(JSON.parse(revisionBody())), true);
  assert.equal(revision(JSON.parse(revisionBody({ expectedVersion: 0 }))), false);
  assert.equal(lifecycle(JSON.parse(lifecycleBody('DELETE', 0))), true);
  assert.equal(lifecycle(JSON.parse(lifecycleBody('ARCHIVE', 0))), false);
});
