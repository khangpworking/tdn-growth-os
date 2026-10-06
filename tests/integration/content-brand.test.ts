import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandIdentityConflictError, ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { FlowValidationError } from '../../src/modules/flow/validation.js';

const brandId = '44444444-4444-4444-8444-000000000001';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const defaultDisplayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;
const profile = { brandName: 'Canxi Việt', tagline: 'Xương chắc mỗi ngày', hotline: '0900 000 000', website: 'https://canxiviet.example', address: '12 Đường Mẫu, Q.1' };
const createRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile, displayRules: defaultDisplayRules, ...patch });
const revisionRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', brandId, expectedVersion: 1, profile: { ...profile, hotline: '0900 111 222' }, displayRules: defaultDisplayRules, ...patch });

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-brand-')); roots.push(root);
  const { db, migration } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  let tick = 0;
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => brandId, now: () => new Date(Date.UTC(2027, 0, 1, 0, 0, tick++)) });
  return { root, db, migration, artifacts, brands };
}

test('migration 0021 creates immutable content brand tables', () => {
  const state = setup();
  assert.equal(state.migration.currentVersion, 48);
  const names = (state.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'flow_content_brand%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
  assert.deepEqual(names, ['flow_content_brand_revisions', 'flow_content_brands']);
  state.db.close();
});

test('create, read and exact retry of a brand', async () => {
  const state = setup();
  const created = await state.brands.createBrand(createRequest());
  assert.deepEqual({ ...created, brandArtifactSha256: '<sha>' }, { brandId, brandArtifactSha256: '<sha>', version: 1, deduplicated: false, databaseMutations: 3 });
  const artifact = await state.brands.readBrand(brandId);
  assert.equal(artifact.brandKey, 'canxi-viet');
  assert.equal(artifact.version, 1);
  assert.deepEqual(artifact.profile, profile);
  assert.deepEqual(artifact.displayRules, defaultDisplayRules);
  const retry = await state.brands.createBrand(createRequest());
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.databaseMutations, 0);
  assert.equal(retry.brandArtifactSha256, created.brandArtifactSha256);
  await assert.rejects(state.brands.createBrand(createRequest({ profile: { ...profile, brandName: 'Khác' } })), ContentBrandIdentityConflictError);
  state.db.close();
});

test('revisions are sequential, deduplicate exact retries and reject drift', async () => {
  const state = setup();
  await state.brands.createBrand(createRequest());
  const revised = await state.brands.reviseBrand(revisionRequest());
  assert.equal(revised.version, 2);
  assert.equal((await state.brands.readBrand(brandId)).profile.hotline, '0900 111 222');
  assert.equal((await state.brands.readBrand(brandId, 1)).profile.hotline, '0900 000 000');
  const retry = await state.brands.reviseBrand(revisionRequest());
  assert.deepEqual([retry.version, retry.deduplicated, retry.databaseMutations], [2, true, 0]);
  await assert.rejects(state.brands.reviseBrand(revisionRequest({ profile: { ...profile, hotline: '0999' } })), ContentBrandIdentityConflictError);
  await assert.rejects(state.brands.reviseBrand(revisionRequest({ expectedVersion: 3 })), ContentBrandIdentityConflictError);
  await assert.rejects(state.brands.reviseBrand(revisionRequest({ brandId: '44444444-4444-4444-8444-00000000ffff' })), FlowValidationError);
  state.db.close();
});

test('validation rejects unknown fields, incomplete display rules and invalid values', async () => {
  const state = setup();
  const { engagement: _omitted, ...fourPurposes } = defaultDisplayRules;
  const invalid: Record<string, unknown>[] = [
    createRequest({ extra: true }),
    createRequest({ brandKey: 'Bad Key' }),
    createRequest({ profile: { ...profile, brandName: ' padded ' } }),
    createRequest({ profile: { ...profile, brandName: 'x'.repeat(121) } }),
    createRequest({ profile: { ...profile, color: 'blue' } }),
    createRequest({ displayRules: fourPurposes }),
    createRequest({ displayRules: { ...defaultDisplayRules, sales: { ...defaultDisplayRules.sales, hotline: 'SOMETIMES' } } }),
    createRequest({ displayRules: { ...defaultDisplayRules, sales: { ...defaultDisplayRules.sales, fax: 'HIDDEN' } } }),
  ];
  for (const request of invalid) await assert.rejects(state.brands.createBrand(request), FlowValidationError);
  assert.equal((state.db.prepare('SELECT count(*) n FROM flow_content_brands').get() as { n: bigint }).n, 0n);
  state.db.close();
});

test('rows are immutable and tampered artifacts fail verification', async () => {
  const state = setup();
  const created = await state.brands.createBrand(createRequest());
  assert.throws(() => state.db.prepare('UPDATE flow_content_brand_revisions SET brand_name = ?').run('X'), /flow_content_brand_revision_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_brands').run(), /flow_content_brand_immutable/);
  assert.throws(() => state.db.prepare(`INSERT INTO flow_content_brand_revisions(brand_id, version, brand_name, request_sha256, brand_artifact_sha256, created_at)
    VALUES (?, 3, 'X', ?, ?, 'now')`).run(brandId, 'a'.repeat(64), created.brandArtifactSha256), /flow_content_brand_revision_not_sequential/);
  const file = state.artifacts.pathForDigest(created.brandArtifactSha256);
  fs.chmodSync(file, 0o600);
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Canxi Việt', 'Canxi Viet'));
  await assert.rejects(state.brands.readBrand(brandId));
  state.db.close();
});

test('migration v20 to v21 applies once, reruns idempotently and leaves 0001-0020 byte-identical', () => {
  const expected = ['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb', 'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46', 'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec', '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d', 'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592', '241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88', '18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b', '285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848', 'f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439', '4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb', 'c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65', '1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca', '964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3', 'cd0c9cd3fe37f4847a2ee0690b6f4151783dd4adca5ddbb83d79f9cb874d9c03', '0cdccfbaa7e60bc423126977cf2e545e4025454c2006fd1b92d3e24bc473dae1', '9e8daf707e2a913d60610690fcab57c178f2facd0883e45bc53dd72a30284c72', 'effd4f667451f2d4dd727ef6c525e36d84c25e24775a75205ab32d366d13420c', '080ef4c35ebcf2e8dc3c937336f3838ab8ef2d1b002a0533e3f62e017817a9b6', 'ae48dc07a5cb790a8c13a6a27a6cbd925a773be90c0e8f3a3d021effb26afb89', '85d65595b62e01c67bcd38f6c9bdc9ac8a15bc279e297e4f0cc59912fd4dfda1'];
  const prior = fs.readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-9]|20)_/.test(name)).sort();
  assert.equal(prior.length, 20);
  assert.deepEqual(prior.map((name) => createHash('sha256').update(fs.readFileSync(path.join('migrations', name))).digest('hex')), expected);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-migration-')); roots.push(root);
  const dir = path.join(root, 'migrations'); fs.mkdirSync(dir);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(dir, name));
  const databasePath = path.join(root, 'db.sqlite');
  const v20 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.equal(v20.migration.currentVersion, 20); v20.db.close();
  fs.copyFileSync('migrations/0021_flow_content_brands.sql', path.join(dir, '0021_flow_content_brands.sql'));
  const v21 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(v21.migration.applied, [21]); v21.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 21);
  assert.doesNotMatch(fs.readFileSync('migrations/0021_flow_content_brands.sql', 'utf8'), /REFERENCES\s+(?:governance_|foundation_|analysis_|orchestrator_|flow_(?!content_))/i);
  rerun.db.close();
});
