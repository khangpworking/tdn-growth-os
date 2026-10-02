import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';

const brandId = '66666666-6666-4666-8666-000000000001';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const displayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;

async function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-campaign-migration-')); roots.push(root);
  const { db, migration } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => brandId, now: () => new Date(Date.UTC(2027, 0, 1)) });
  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile: { brandName: 'Canxi Việt' }, displayRules });
  // Any registered manifest satisfies the revision foreign key; reuse the brand artifact.
  const artifactSha = (db.prepare('SELECT brand_artifact_sha256 sha FROM flow_content_brand_revisions WHERE brand_id = ?').get(brandId) as { sha: string }).sha;
  return { db, migration, artifactSha };
}

test('migration 0024 creates immutable campaign tables whose lifecycle alternates within the restore window', async () => {
  const state = await setup();
  assert.equal(state.migration.currentVersion, 38);
  assert.ok(state.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'flow_content_campaigns_by_brand'").get());
  const at = '2027-01-01T00:00:00.000Z';
  const parent = state.db.prepare('INSERT INTO flow_content_campaigns(campaign_id, campaign_key, brand_id, created_at) VALUES (?, ?, ?, ?)');
  assert.throws(() => parent.run(campaignId, 'tet-2027', '66666666-6666-4666-8666-00000000ffff', at), /FOREIGN KEY/);
  assert.throws(() => parent.run(campaignId, 'Tet-2027', brandId, at), /CHECK/);
  parent.run(campaignId, 'tet-2027', brandId, at);
  const revision = state.db.prepare('INSERT INTO flow_content_campaign_revisions(campaign_id, version, campaign_name, request_sha256, campaign_artifact_sha256, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const request = 'a'.repeat(64);
  assert.throws(() => revision.run(campaignId, 2, 'Tết 2027', request, state.artifactSha, at), /flow_content_campaign_revision_not_sequential/);
  assert.throws(() => revision.run(campaignId, 1, ' Tết 2027', request, state.artifactSha, at), /CHECK/);
  assert.throws(() => revision.run(campaignId, 1, 'Tết 2027', request, 'b'.repeat(64), at), /FOREIGN KEY/);
  revision.run(campaignId, 1, 'Tết 2027', request, state.artifactSha, at);

  const insert = state.db.prepare('INSERT INTO flow_content_campaign_lifecycle(campaign_id, sequence, action, created_at) VALUES (?, ?, ?, ?)');
  assert.throws(() => insert.run(campaignId, 1, 'RESTORE', at), /not_alternating/);
  insert.run(campaignId, 1, 'DELETE', at);
  assert.throws(() => insert.run(campaignId, 2, 'DELETE', '2027-01-02T00:00:00.000Z'), /not_alternating/);
  assert.throws(() => insert.run(campaignId, 3, 'RESTORE', '2027-01-02T00:00:00.000Z'), /not_sequential/);
  assert.throws(() => insert.run(campaignId, 2, 'RESTORE', '2027-02-01T00:00:01.000Z'), /flow_content_campaign_restore_window_expired/);
  assert.throws(() => insert.run(campaignId, 2, 'RESTORE', '2026-12-31T23:59:59.999Z'), /lifecycle_not_chronological/);
  insert.run(campaignId, 2, 'RESTORE', '2027-01-31T00:00:00.000Z');
  assert.throws(() => insert.run(campaignId, 3, 'DELETE', '2027-01-30T00:00:00.000Z'), /lifecycle_not_chronological/);

  assert.throws(() => state.db.prepare("UPDATE flow_content_campaign_lifecycle SET action = 'DELETE'").run(), /flow_content_campaign_lifecycle_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_campaign_lifecycle').run(), /flow_content_campaign_lifecycle_immutable/);
  assert.throws(() => state.db.prepare("UPDATE flow_content_campaign_revisions SET campaign_name = 'Khác'").run(), /flow_content_campaign_revision_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_campaign_revisions').run(), /flow_content_campaign_revision_immutable/);
  assert.throws(() => state.db.prepare("UPDATE flow_content_campaigns SET campaign_key = 'khac'").run(), /flow_content_campaign_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_campaigns').run(), /flow_content_campaign_immutable/);
  state.db.close();
});

test('migration v23 to v24 applies once and pins 0023 byte-identical', () => {
  assert.equal(createHash('sha256').update(fs.readFileSync('migrations/0023_flow_content_prompts.sql')).digest('hex'), 'b95eda258e48c8c067ec2cca18e5cd53562567ff0de60364d68a17307015218a');
  const prior = fs.readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-9]|2[0-3])_/.test(name)).sort();
  assert.equal(prior.length, 23);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-campaign-migration-')); roots.push(root);
  const dir = path.join(root, 'migrations'); fs.mkdirSync(dir);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(dir, name));
  const databasePath = path.join(root, 'db.sqlite');
  const v23 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.equal(v23.migration.currentVersion, 23); v23.db.close();
  fs.copyFileSync('migrations/0024_flow_content_campaigns.sql', path.join(dir, '0024_flow_content_campaigns.sql'));
  const v24 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(v24.migration.applied, [24]); v24.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(rerun.migration.applied, []); rerun.db.close();
  assert.doesNotMatch(fs.readFileSync('migrations/0024_flow_content_campaigns.sql', 'utf8'), /REFERENCES\s+(?:governance_|foundation_|analysis_|orchestrator_|flow_(?!content_))/i);
});
