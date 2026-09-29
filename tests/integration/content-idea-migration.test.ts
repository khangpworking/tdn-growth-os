import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { openDatabase } from '../../src/platform/db/database.js';

const brandId = '77777777-7777-4777-8777-000000000001';
const campaignOne = '77777777-7777-4777-8777-0000000000c1';
const campaignTwo = '77777777-7777-4777-8777-0000000000c2';
const campaignThree = '77777777-7777-4777-8777-0000000000c3';
const bigOne = '77777777-7777-4777-8777-0000000000b1';
const bigTwo = '77777777-7777-4777-8777-0000000000b2';
const bigOther = '77777777-7777-4777-8777-0000000000b3';
const angleOne = '77777777-7777-4777-8777-0000000000a1';
const at = '2027-01-01T00:00:00.000Z';
const later = '2027-01-02T00:00:00.000Z';
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-idea-migration-')); roots.push(root);
  const opened = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const brands = new ContentBrandService({ db: opened.db, artifactStore: artifacts, uuid: () => brandId, now: () => new Date(at) });
  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'synthetic-brand', profile: { brandName: 'Synthetic brand' }, displayRules });
  const artifactSha = (opened.db.prepare('SELECT brand_artifact_sha256 sha FROM flow_content_brand_revisions WHERE brand_id=?').get(brandId) as { sha: string }).sha;
  return { ...opened, artifactSha };
}

function insertCampaign(db: ReturnType<typeof openDatabase>['db'], campaignId: string, versions: number): void {
  db.prepare('INSERT INTO flow_content_campaigns(campaign_id, campaign_key, brand_id, created_at) VALUES (?, ?, ?, ?)')
    .run(campaignId, `campaign-${campaignId.slice(-2)}`, brandId, at);
  const insert = db.prepare(`INSERT INTO flow_content_campaign_revisions
    (campaign_id, version, campaign_name, request_sha256, campaign_artifact_sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?)`);
  for (let version = 1; version <= versions; version += 1) insert.run(campaignId, version, `Campaign ${version}`, `${version}`.repeat(64), currentArtifactSha, at);
}

let currentArtifactSha = '';

function insertInsightAndLock(db: ReturnType<typeof openDatabase>['db'], campaignId: string, versions: number, lockedVersion: number): void {
  const insight = db.prepare(`INSERT INTO flow_content_insight_revisions
    (campaign_id, version, source_kind, locked_stp_id, request_sha256, insight_artifact_sha256, created_at)
    VALUES (?, ?, 'TYPED', NULL, ?, ?, ?)`);
  for (let version = 1; version <= versions; version += 1) insight.run(campaignId, version, `${version + 2}`.repeat(64), currentArtifactSha, at);
  db.prepare(`INSERT INTO flow_content_insight_locks
    (campaign_id, insight_version, campaign_version, b10_decision_id, request_sha256, lock_artifact_sha256, created_at)
    VALUES (?, ?, ?, NULL, ?, ?, ?)`)
    .run(campaignId, lockedVersion, versions, 'd'.repeat(64), currentArtifactSha, at);
}

function insertAttempt(db: ReturnType<typeof openDatabase>['db'], attemptId: string, targetId: string, targetType: string, number: number): void {
  const inputSha = `${(number % 16).toString(16)}`.repeat(64);
  db.prepare(`INSERT INTO flow_content_ai_attempts(
    attempt_id, kind, modality, target_type, target_id, model, provider_model, prompt_ref, input_bundle_sha256,
    planned_action_call_count, state, actor_id, created_at
  ) VALUES (?, 'generate', 'text', ?, ?, 'gpt-5.6-sol', 'gpt-5.6-sol', 'system:050b@1', ?, 1, 'running', 'owner:050b', ?)`) 
    .run(attemptId, targetType, targetId, inputSha, at);
  db.prepare(`UPDATE flow_content_ai_attempts
    SET state='succeeded', output_sha256=?, closed_at=? WHERE attempt_id=?`).run(currentArtifactSha, later, attemptId);
}

function insertIdea(db: ReturnType<typeof openDatabase>['db'], options: {
  readonly ideaId: string;
  readonly campaignId: string;
  readonly kind: 'BIG_IDEA' | 'ANGLE';
  readonly parentIdeaId: string | null;
  readonly ordinal: number;
  readonly insightVersion: number;
  readonly requestId: string;
  readonly attemptId: string;
  readonly requestSha?: string;
}): void {
  db.prepare(`INSERT INTO flow_content_ideas(
    idea_id, campaign_id, kind, parent_idea_id, ordinal, insight_version, request_id, request_sha256,
    attempt_id, idea_artifact_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(options.ideaId, options.campaignId, options.kind, options.parentIdeaId, options.ordinal, options.insightVersion,
      options.requestId, options.requestSha ?? 'e'.repeat(64), options.attemptId, currentArtifactSha, at);
}

function insertState(db: ReturnType<typeof openDatabase>['db'], ideaId: string, sequence: number, action: string, purposes: string[] = []): void {
  db.prepare(`INSERT INTO flow_content_idea_states(
    idea_id, sequence, action, developing, deleted, purposes_json, request_sha256, created_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ideaId, sequence, action, action === 'DEVELOP' ? 1 : 0, action === 'DELETE' ? 1 : 0, JSON.stringify(purposes), 'f'.repeat(64), at);
}

test('migration 0027 creates the three immutable tables and all relationship/sequential guards', async () => {
  const state = await setup();
  currentArtifactSha = state.artifactSha;
  const migrations = fs.readdirSync('migrations').filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const head = Number(migrations.at(-1)!.slice(0, 4));
  assert.ok(head >= 27);
  assert.equal(state.migration.currentVersion, head);
  assert.deepEqual(
    (state.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('flow_content_ideas', 'flow_content_idea_states', 'flow_content_purpose_tags') ORDER BY name").all() as { name: string }[]).map((row) => row.name),
    ['flow_content_idea_states', 'flow_content_ideas', 'flow_content_purpose_tags'],
  );
  assert.deepEqual(
    (state.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'flow_content_idea_%' OR name LIKE 'flow_content_purpose_tag_%') ORDER BY name").all() as { name: string }[]).map((row) => row.name),
    [
      'flow_content_idea_states_no_delete', 'flow_content_idea_states_no_update', 'flow_content_idea_states_purposes_angle_only', 'flow_content_idea_states_sequential',
      'flow_content_ideas_attempt', 'flow_content_ideas_locked_insight', 'flow_content_ideas_no_delete', 'flow_content_ideas_no_update', 'flow_content_ideas_parent', 'flow_content_ideas_sequential',
      'flow_content_purpose_tags_no_delete', 'flow_content_purpose_tags_no_update',
    ],
  );

  insertCampaign(state.db, campaignOne, 1);
  insertCampaign(state.db, campaignTwo, 1);
  insertCampaign(state.db, campaignThree, 2);
  insertInsightAndLock(state.db, campaignOne, 1, 1);
  insertInsightAndLock(state.db, campaignTwo, 1, 1);
  insertInsightAndLock(state.db, campaignThree, 2, 2);
  insertAttempt(state.db, '77777777-7777-4777-8777-000000000101', bigOne, 'content_big_idea', 1);
  insertAttempt(state.db, '77777777-7777-4777-8777-000000000102', bigTwo, 'content_big_idea', 2);
  insertAttempt(state.db, '77777777-7777-4777-8777-000000000103', bigOther, 'content_big_idea', 3);
  insertAttempt(state.db, '77777777-7777-4777-8777-000000000104', angleOne, 'content_angle', 4);
  insertIdea(state.db, { ideaId: bigOne, campaignId: campaignOne, kind: 'BIG_IDEA', parentIdeaId: null, ordinal: 1, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000201', attemptId: '77777777-7777-4777-8777-000000000101' });
  insertIdea(state.db, { ideaId: bigTwo, campaignId: campaignOne, kind: 'BIG_IDEA', parentIdeaId: null, ordinal: 2, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000202', attemptId: '77777777-7777-4777-8777-000000000102' });
  insertIdea(state.db, { ideaId: bigOther, campaignId: campaignTwo, kind: 'BIG_IDEA', parentIdeaId: null, ordinal: 1, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000203', attemptId: '77777777-7777-4777-8777-000000000103' });
  insertIdea(state.db, { ideaId: angleOne, campaignId: campaignOne, kind: 'ANGLE', parentIdeaId: bigOne, ordinal: 1, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000204', attemptId: '77777777-7777-4777-8777-000000000104' });
  insertState(state.db, bigOne, 1, 'DEVELOP');
  insertState(state.db, angleOne, 1, 'PURPOSES', ['EDUCATION']);
  state.db.prepare(`INSERT INTO flow_content_purpose_tags(tag_id, label, label_key, display_like, request_sha256, created_at)
    VALUES (?, ?, ?, 'EDUCATION', ?, ?)`).run('77777777-7777-4777-8777-000000000301', 'Custom purpose', 'custom purpose', '1'.repeat(64), at);

  const gapIdea = '77777777-7777-4777-8777-0000000000b4';
  const gapAttempt = '77777777-7777-4777-8777-000000000105';
  insertAttempt(state.db, gapAttempt, gapIdea, 'content_big_idea', 5);
  assert.throws(() => insertIdea(state.db, { ideaId: gapIdea, campaignId: campaignOne, kind: 'BIG_IDEA', parentIdeaId: null, ordinal: 4, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000205', attemptId: gapAttempt }), /flow_content_idea_not_sequential/);

  const badAttemptIdea = '77777777-7777-4777-8777-0000000000b5';
  const badAttempt = '77777777-7777-4777-8777-000000000106';
  insertAttempt(state.db, badAttempt, '77777777-7777-4777-8777-0000000000ff', 'content_big_idea', 6);
  assert.throws(() => insertIdea(state.db, { ideaId: badAttemptIdea, campaignId: campaignOne, kind: 'BIG_IDEA', parentIdeaId: null, ordinal: 3, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000206', attemptId: badAttempt }), /flow_content_idea_attempt_mismatch/);

  const wrongInsightIdea = '77777777-7777-4777-8777-0000000000b6';
  const wrongInsightAttempt = '77777777-7777-4777-8777-000000000107';
  insertAttempt(state.db, wrongInsightAttempt, wrongInsightIdea, 'content_big_idea', 7);
  assert.throws(() => insertIdea(state.db, { ideaId: wrongInsightIdea, campaignId: campaignThree, kind: 'BIG_IDEA', parentIdeaId: null, ordinal: 1, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000207', attemptId: wrongInsightAttempt }), /flow_content_idea_insight_not_locked/);

  const wrongParentIdea = '77777777-7777-4777-8777-0000000000b7';
  const wrongParentAttempt = '77777777-7777-4777-8777-000000000108';
  insertAttempt(state.db, wrongParentAttempt, wrongParentIdea, 'content_angle', 8);
  assert.throws(() => insertIdea(state.db, { ideaId: wrongParentIdea, campaignId: campaignOne, kind: 'ANGLE', parentIdeaId: bigOther, ordinal: 1, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000208', attemptId: wrongParentAttempt }), /flow_content_idea_parent_invalid/);
  const angleParentAttempt = '77777777-7777-4777-8777-000000000109';
  insertAttempt(state.db, angleParentAttempt, '77777777-7777-4777-8777-0000000000b8', 'content_angle', 9);
  assert.throws(() => insertIdea(state.db, { ideaId: '77777777-7777-4777-8777-0000000000b8', campaignId: campaignOne, kind: 'ANGLE', parentIdeaId: angleOne, ordinal: 1, insightVersion: 1, requestId: '77777777-7777-4777-8777-000000000209', attemptId: angleParentAttempt }), /flow_content_idea_parent_invalid/);

  assert.throws(() => insertState(state.db, bigOne, 3, 'DEVELOP'), /flow_content_idea_state_not_sequential/);
  assert.throws(() => insertState(state.db, bigOne, 2, 'PURPOSES', ['EDUCATION']), /flow_content_idea_purposes_angle_only/);
  assert.throws(() => state.db.prepare(`INSERT INTO flow_content_purpose_tags(tag_id, label, label_key, display_like, request_sha256, created_at)
    VALUES (?, ?, ?, 'TRUST', ?, ?)`).run('77777777-7777-4777-8777-000000000302', 'Custom purpose 2', 'custom purpose', '2'.repeat(64), at), /UNIQUE constraint failed/);

  assert.throws(() => state.db.prepare(`UPDATE flow_content_ideas SET ordinal=9 WHERE idea_id=?`).run(bigOne), /flow_content_idea_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_ideas WHERE idea_id=?').run(bigOne), /flow_content_idea_immutable/);
  assert.throws(() => state.db.prepare(`UPDATE flow_content_idea_states SET developing=0 WHERE idea_id=? AND sequence=1`).run(bigOne), /flow_content_idea_state_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_idea_states WHERE idea_id=? AND sequence=1').run(bigOne), /flow_content_idea_state_immutable/);
  assert.throws(() => state.db.prepare(`UPDATE flow_content_purpose_tags SET label='Changed' WHERE tag_id=?`).run('77777777-7777-4777-8777-000000000301'), /flow_content_purpose_tag_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_purpose_tags WHERE tag_id=?').run('77777777-7777-4777-8777-000000000301'), /flow_content_purpose_tag_immutable/);
  state.db.close();
});
