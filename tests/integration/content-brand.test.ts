import assert from 'node:assert/strict';
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

export const defaultDisplayRules = {
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
  assert.equal(state.migration.currentVersion, 21);
  const names = (state.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'flow_content_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name);
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
