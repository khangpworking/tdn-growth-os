import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';

const brandId = '77777777-7777-4777-8777-000000000001';
const campaignOne = '77777777-7777-4777-8777-0000000000c1';
const campaignTwo = '77777777-7777-4777-8777-0000000000c2';
const at = '2027-01-01T00:00:00.000Z';
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-insight-migration-')); roots.push(root);
  const { db, migration } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => brandId, now: () => new Date(at) });
  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile: { brandName: 'Canxi Việt' }, displayRules });
  const artifactSha = (db.prepare('SELECT brand_artifact_sha256 sha FROM flow_content_brand_revisions WHERE brand_id = ?').get(brandId) as { sha: string }).sha;
  return { db, migration, artifactSha };
}

function insertCampaign(db: ReturnType<typeof openDatabase>['db'], campaignId: string, artifactSha: string): void {
  db.prepare('INSERT INTO flow_content_campaigns(campaign_id, campaign_key, brand_id, created_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, `campaign-${campaignId.slice(-2)}`, brandId, at);
  const insert = db.prepare(`INSERT INTO flow_content_campaign_revisions
    (campaign_id, version, campaign_name, request_sha256, campaign_artifact_sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  insert.run(campaignId, 1, 'Campaign v1', 'a'.repeat(64), artifactSha, at);
  insert.run(campaignId, 2, 'Campaign v2', 'b'.repeat(64), artifactSha, at);
}

function insertInsight(db: ReturnType<typeof openDatabase>['db'], campaignId: string, version: number, artifactSha: string): void {
  db.prepare(`INSERT INTO flow_content_insight_revisions
    (campaign_id, version, source_kind, locked_stp_id, request_sha256, insight_artifact_sha256, created_at)
    VALUES (?, ?, 'TYPED', NULL, ?, ?, ?)`)
    .run(campaignId, version, `${String.fromCharCode(96 + version)}${'c'.repeat(63)}`, artifactSha, at);
}

function insertLock(db: ReturnType<typeof openDatabase>['db'], campaignId: string, insightVersion: number, campaignVersion: number, artifactSha: string): void {
  db.prepare(`INSERT INTO flow_content_insight_locks
    (campaign_id, insight_version, campaign_version, b10_decision_id, request_sha256, lock_artifact_sha256, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?)`)
    .run(campaignId, insightVersion, campaignVersion, 'd'.repeat(64), artifactSha, at);
}

test('migration 0026 creates the two immutable insight tables and all sequence/latest guards', async () => {
  const state = await setup();
  assert.equal(state.migration.currentVersion, 38);
  assert.deepEqual(
    (state.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('flow_content_insight_revisions', 'flow_content_insight_locks') ORDER BY name").all() as { name: string }[]).map((row) => row.name),
    ['flow_content_insight_locks', 'flow_content_insight_revisions'],
  );
  assert.deepEqual(
    (state.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'flow_content_insight_%' ORDER BY name").all() as { name: string }[]).map((row) => row.name),
    [
      'flow_content_insight_locks_latest_campaign',
      'flow_content_insight_locks_latest_insight',
      'flow_content_insight_locks_no_delete',
      'flow_content_insight_locks_no_update',
      'flow_content_insight_revisions_after_lock',
      'flow_content_insight_revisions_no_delete',
      'flow_content_insight_revisions_no_update',
      'flow_content_insight_revisions_sequential',
    ],
  );

  insertCampaign(state.db, campaignOne, state.artifactSha);
  insertCampaign(state.db, campaignTwo, state.artifactSha);
  insertInsight(state.db, campaignOne, 1, state.artifactSha);
  insertInsight(state.db, campaignOne, 2, state.artifactSha);
  insertInsight(state.db, campaignTwo, 1, state.artifactSha);
  insertInsight(state.db, campaignTwo, 2, state.artifactSha);

  assert.throws(() => insertInsight(state.db, campaignOne, 4, state.artifactSha), /flow_content_insight_revision_not_sequential/);
  assert.throws(() => state.db.prepare("UPDATE flow_content_insight_revisions SET source_kind='STP'").run(), /flow_content_insight_revision_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_insight_revisions').run(), /flow_content_insight_revision_immutable/);

  assert.throws(() => insertLock(state.db, campaignOne, 1, 2, state.artifactSha), /flow_content_insight_lock_not_latest/);
  assert.throws(() => insertLock(state.db, campaignTwo, 2, 1, state.artifactSha), /flow_content_insight_lock_campaign_not_latest/);
  insertLock(state.db, campaignOne, 2, 2, state.artifactSha);
  insertLock(state.db, campaignTwo, 2, 2, state.artifactSha);
  assert.throws(() => insertInsight(state.db, campaignOne, 3, state.artifactSha), /flow_content_insight_locked/);
  assert.throws(() => state.db.prepare("UPDATE flow_content_insight_locks SET campaign_version=1").run(), /flow_content_insight_lock_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_insight_locks').run(), /flow_content_insight_lock_immutable/);
  state.db.close();
});
