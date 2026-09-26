import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { ProductWorkspaceArtifact } from '../../contracts/flow/product-workspace-artifact.generated.js';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCampaignConflictError, ContentCampaignReferenceError, ContentCampaignService } from '../../src/modules/flow/content-campaign-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import { ContentMediaService } from '../../src/modules/flow/content-media-service.js';
import type { ProductWorkspaceReader } from '../../src/modules/flow/product-workspace-reader.js';
import { FlowValidationError } from '../../src/modules/flow/validation.js';
import { fixtureImage } from '../helpers/content-images.js';

const brandId = '66666666-6666-4666-8666-000000000001';
const otherBrandId = '66666666-6666-4666-8666-000000000002';
const itemA = '66666666-6666-4666-8666-0000000000a1';
const itemB = '66666666-6666-4666-8666-0000000000a2';
const itemOther = '66666666-6666-4666-8666-0000000000a3';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const secondCampaignId = '66666666-6666-4666-8666-0000000000c2';
const workspaceId = '66666666-6666-4666-8666-0000000000f1';
const corruptWorkspaceId = '66666666-6666-4666-8666-0000000000f2';
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
const createRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', campaignKey: 'tet-2027', brandId, campaign: campaign(), ...patch });
const revisionRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', campaignId, expectedVersion: 1, campaign: campaign({ name: 'Tết 2027 — đoàn viên' }), ...patch });
const lifecycle = (action: 'DELETE' | 'RESTORE', expectedSequence: number) => ({ contractVersion: '1.0.0', campaignId, action, expectedSequence });

/** Synthetic reader: only `workspaceId` exists; `corruptWorkspaceId` fails verification like a tampered artifact would. Messages mirror FlowProductWorkspaceReader. */
const workspaces: ProductWorkspaceReader = {
  async readVerifiedProductWorkspace(id: string): Promise<ProductWorkspaceArtifact> {
    if (id === corruptWorkspaceId) throw new FlowValidationError('Product workspace artifact is not canonical JSON');
    if (id !== workspaceId) throw new FlowValidationError(`Product workspace not found: ${id}`);
    return {} as ProductWorkspaceArtifact;
  },
};

async function setup(options: { readonly withWorkspaces?: boolean } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-campaign-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const clock = { now: new Date(Date.UTC(2027, 0, 1)) };
  const now = () => new Date(clock.now.getTime());
  const brandIds = [brandId, otherBrandId];
  const itemIds = [itemA, itemB, itemOther];
  const campaignIds = [campaignId, secondCampaignId];
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => brandIds.shift()!, now });
  const media = new ContentMediaService({ db, artifactStore: artifacts, now });
  const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid: () => itemIds.shift()!, now });
  const campaigns = new ContentCampaignService({
    db, artifactStore: artifacts, catalog, now, uuid: () => campaignIds.shift()!,
    ...(options.withWorkspaces === false ? {} : { workspaceReader: workspaces }),
  });
  for (const key of ['canxi-viet', 'nanobone']) await brands.createBrand({ contractVersion: '1.0.0', brandKey: key, profile: { brandName: key }, displayRules });
  for (const id of [brandId, otherBrandId]) await media.registerMedia({ brandId: id, kind: 'PHOTO', declaredType: 'image/jpeg', bytes: photo });
  await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'tu-van', item: item() });
  await catalog.reviseItem({ contractVersion: '1.0.0', itemId: itemA, expectedVersion: 1, item: item({ tiers: [...tiers, { tierKey: 'pro', name: 'Pro', priceText: '499.000đ', inclusions: ['6 buổi'] }] }) });
  await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'canxi-nano', item: item({ itemType: 'PHYSICAL', name: 'Canxi nano 30 viên' }) });
  await catalog.createItem({ contractVersion: '1.0.0', brandId: otherBrandId, itemKey: 'nanobone-goi', item: item({ name: 'Gói Nanobone' }) });
  const advance = (days: number) => { clock.now = new Date(clock.now.getTime() + days * 86_400_000); };
  return { db, artifacts, campaigns, advance };
}
const count = (db: ReturnType<typeof openDatabase>['db'], table: string) => Number((db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint | number }).n);

test('campaigns are created, read, retried exactly and conflict on changed content', async () => {
  const state = await setup();
  const created = await state.campaigns.createCampaign(createRequest());
  assert.deepEqual([created.campaignId, created.version, created.deduplicated, created.databaseMutations], [campaignId, 1, false, 3]);
  const artifact = await state.campaigns.readCampaign(campaignId);
  assert.deepEqual([artifact.campaignKey, artifact.brandId, artifact.version, artifact.campaign], ['tet-2027', brandId, 1, campaign()]);
  const retry = await state.campaigns.createCampaign(createRequest());
  assert.deepEqual([retry.campaignId, retry.deduplicated, retry.databaseMutations], [campaignId, true, 0]);
  await assert.rejects(state.campaigns.createCampaign(createRequest({ campaign: campaign({ name: 'Khác' }) })), (error: unknown) => error instanceof ContentCampaignConflictError && /changed content/.test(error.message));
  await assert.rejects(state.campaigns.createCampaign(createRequest({ campaignKey: 'lap-item', campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1 }, { itemId: itemA, itemVersion: 2 }] }) })), FlowValidationError);
  assert.equal(count(state.db, 'flow_content_campaigns'), 1);
  state.db.close();
});

test('every reference is verified before anything is stored', async () => {
  const state = await setup();
  const manifests = count(state.db, 'artifact_manifests');
  for (const [label, request] of [
    ['unknown brand', createRequest({ brandId: '66666666-6666-4666-8666-00000000ffff' })],
    ['item of another brand', createRequest({ campaign: campaign({ items: [{ itemId: itemOther, itemVersion: 1 }] }) })],
    ['unknown item', createRequest({ campaign: campaign({ items: [{ itemId: '66666666-6666-4666-8666-0000000000af', itemVersion: 1 }] }) })],
    ['unknown item version', createRequest({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 3 }] }) })],
    ['tier missing at that version', createRequest({ campaign: campaign({ items: [{ itemId: itemA, itemVersion: 1, tierKeys: ['pro'] }] }) })],
    ['unknown workspace', createRequest({ campaign: campaign({ researchProductWorkspaceId: '66666666-6666-4666-8666-0000000000fe' }) })],
  ] as const) await assert.rejects(state.campaigns.createCampaign(request), ContentCampaignReferenceError, label);
  await assert.rejects(
    state.campaigns.createCampaign(createRequest({ campaign: campaign({ researchProductWorkspaceId: corruptWorkspaceId }) })),
    (error: unknown) => error instanceof FlowValidationError && !(error instanceof ContentCampaignReferenceError) && /not canonical/.test(error.message),
    'a workspace integrity failure is not reported as a bad reference',
  );
  assert.deepEqual([count(state.db, 'flow_content_campaigns'), count(state.db, 'artifact_manifests')], [0, manifests]);
  const linked = await state.campaigns.createCampaign(createRequest({ campaign: campaign({ researchProductWorkspaceId: workspaceId }) }));
  assert.equal((await state.campaigns.readCampaign(linked.campaignId)).campaign.researchProductWorkspaceId, workspaceId);
  state.db.close();
});

test('a workspace link is refused when no workspace reader is configured', async () => {
  const state = await setup({ withWorkspaces: false });
  await assert.rejects(state.campaigns.createCampaign(createRequest({ campaign: campaign({ researchProductWorkspaceId: workspaceId }) })), ContentCampaignReferenceError);
  assert.equal((await state.campaigns.createCampaign(createRequest())).version, 1);
  state.db.close();
});

test('revisions are sequential, keep key and brand, re-verify references and reject drift', async () => {
  const state = await setup();
  await state.campaigns.createCampaign(createRequest());
  assert.equal((await state.campaigns.reviseCampaign(revisionRequest())).version, 2);
  const latest = await state.campaigns.readCampaign(campaignId);
  assert.deepEqual([latest.version, latest.campaignKey, latest.brandId, latest.campaign.name], [2, 'tet-2027', brandId, 'Tết 2027 — đoàn viên']);
  assert.equal((await state.campaigns.readCampaign(campaignId, 1)).campaign.name, 'Tết 2027 — quà cho bố mẹ');
  assert.equal((await state.campaigns.reviseCampaign(revisionRequest())).deduplicated, true);
  await assert.rejects(state.campaigns.reviseCampaign(revisionRequest({ campaign: campaign({ name: 'Drift' }) })), ContentCampaignConflictError);
  await assert.rejects(state.campaigns.reviseCampaign(revisionRequest({ expectedVersion: 3 })), (error: unknown) => error instanceof ContentCampaignConflictError && /drift/.test(error.message));
  await assert.rejects(state.campaigns.reviseCampaign(revisionRequest({ expectedVersion: 2, campaign: campaign({ items: [{ itemId: itemOther, itemVersion: 1 }] }) })), ContentCampaignReferenceError);
  await assert.rejects(state.campaigns.reviseCampaign(revisionRequest({ campaignId: '66666666-6666-4666-8666-00000000ffff' })), /Campaign not found/);
  assert.deepEqual(state.campaigns.campaignVersions(campaignId), [1, 2]);
  state.db.close();
});

test('campaigns can be deleted, restored within 30 days, and not revised while deleted', async () => {
  const state = await setup();
  await state.campaigns.createCampaign(createRequest());
  const deleted = await state.campaigns.changeLifecycle(lifecycle('DELETE', 0));
  assert.deepEqual([deleted.sequence, deleted.action, deleted.createdAt, deleted.restorableUntil, deleted.deduplicated], [1, 'DELETE', '2027-01-01T00:00:00.000Z', '2027-01-31T00:00:00.000Z', false]);
  assert.equal((await state.campaigns.changeLifecycle(lifecycle('DELETE', 0))).deduplicated, true);
  assert.deepEqual(state.campaigns.lifecycleState(campaignId), { sequence: 1, deleted: { deletedAt: '2027-01-01T00:00:00.000Z', restorableUntil: '2027-01-31T00:00:00.000Z' }, expired: false });
  await assert.rejects(state.campaigns.reviseCampaign(revisionRequest()), (error: unknown) => error instanceof ContentCampaignConflictError && /deleted/.test(error.message));
  await assert.rejects(state.campaigns.changeLifecycle(lifecycle('RESTORE', 0)), ContentCampaignConflictError);
  await assert.rejects(state.campaigns.changeLifecycle(lifecycle('DELETE', 1)), ContentCampaignConflictError);
  state.advance(29);
  assert.equal((await state.campaigns.changeLifecycle(lifecycle('RESTORE', 1))).action, 'RESTORE');
  assert.deepEqual(state.campaigns.lifecycleState(campaignId), { sequence: 2, expired: false });
  assert.equal((await state.campaigns.reviseCampaign(revisionRequest())).version, 2);
  await state.campaigns.changeLifecycle(lifecycle('DELETE', 2));
  state.advance(31);
  assert.equal(state.campaigns.lifecycleState(campaignId).expired, true);
  await assert.rejects(state.campaigns.changeLifecycle(lifecycle('RESTORE', 3)), (error: unknown) => error instanceof ContentCampaignConflictError && /restore window/.test(error.message));
  assert.equal((await state.campaigns.readCampaign(campaignId, 2)).version, 2, 'versions stay readable');
  await assert.rejects(state.campaigns.changeLifecycle({ ...lifecycle('DELETE', 0), campaignId: '66666666-6666-4666-8666-00000000ffff' }), /Campaign not found/);
  state.db.close();
});

test('a lifecycle change dated before the last one is a conflict and writes nothing', async () => {
  const state = await setup();
  await state.campaigns.createCampaign(createRequest());
  await state.campaigns.changeLifecycle(lifecycle('DELETE', 0));
  state.advance(-1);
  await assert.rejects(state.campaigns.changeLifecycle(lifecycle('RESTORE', 1)), ContentCampaignConflictError);
  assert.equal(state.campaigns.lifecycleState(campaignId).sequence, 1);
  state.db.close();
});

test('list, brand and existence helpers read the latest revision of every campaign', async () => {
  const state = await setup();
  await state.campaigns.createCampaign(createRequest());
  await state.campaigns.createCampaign(createRequest({ campaignKey: 'he-2027', campaign: campaign({ name: 'Hè 2027', items: [{ itemId: itemB, itemVersion: 1 }] }) }));
  await state.campaigns.reviseCampaign(revisionRequest());
  assert.deepEqual(state.campaigns.listCampaigns().map((row) => [row.campaignId, row.campaignKey, row.brandId, row.version, row.campaignName]), [
    [campaignId, 'tet-2027', brandId, 2, 'Tết 2027 — đoàn viên'],
    [secondCampaignId, 'he-2027', brandId, 1, 'Hè 2027'],
  ]);
  assert.deepEqual([state.campaigns.campaignExists(campaignId), state.campaigns.campaignExists('66666666-6666-4666-8666-00000000ffff')], [true, false]);
  assert.deepEqual([state.campaigns.campaignBrand(campaignId), state.campaigns.campaignBrand('not-a-uuid')], [brandId, undefined]);
  state.db.close();
});

test('tampered campaign artifacts fail verification', async () => {
  const state = await setup();
  const created = await state.campaigns.createCampaign(createRequest());
  const file = state.artifacts.pathForDigest(created.campaignArtifactSha256);
  fs.chmodSync(file, 0o600); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('bố mẹ', 'ông bà'));
  await assert.rejects(state.campaigns.readCampaign(campaignId));
  state.db.close();
});

test('restoreExactArtifact re-stages only a missing artifact of the exact committed request', async () => {
  const state = await setup();
  const created = await state.campaigns.createCampaign(createRequest());
  assert.equal(await state.campaigns.restoreExactArtifact(createRequest()), false, 'artifact present');
  const file = state.artifacts.pathForDigest(created.campaignArtifactSha256);
  fs.chmodSync(file, 0o600); fs.rmSync(file);
  assert.equal(await state.campaigns.restoreExactArtifact(createRequest({ campaign: campaign({ name: 'Khác' }) })), false, 'different request');
  assert.equal(await state.campaigns.restoreExactArtifact(createRequest()), true);
  assert.equal((await state.campaigns.readCampaign(campaignId)).version, 1);
  state.db.close();
});
