import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';

const brandId = '05100000-0000-4000-8000-000000000001';
const campaignId = '05100000-0000-4000-8000-000000000002';
const bigIdeaId = '05100000-0000-4000-8000-000000000004';
const angleId = '05100000-0000-4000-8000-000000000005';
const packageId = '05100000-0000-4000-8000-000000000006';
const secondPackageId = '05100000-0000-4000-8000-000000000007';
const at = '2027-01-01T00:00:00.000Z';
const sha = (letter: string) => letter.repeat(64);
const uuid = (n: number) => `05100000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const roots: string[] = [];

test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-package-migration-')); roots.push(root);
  const opened = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const { db } = opened;
  db.prepare(`INSERT INTO artifact_manifests
    (sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
    VALUES (?, 1, 'application/json', ?, ?, '1.0.0', 'active', ?)`)
    .run(sha('a'), `sha256/${sha('a').slice(0, 2)}/${sha('a')}`, at, at);
  db.prepare('INSERT INTO flow_content_brands(brand_id, brand_key, created_at) VALUES (?, ?, ?)').run(brandId, 'synthetic-brand', at);
  db.prepare(`INSERT INTO flow_content_brand_revisions
    (brand_id, version, brand_name, request_sha256, brand_artifact_sha256, created_at) VALUES (?, 1, ?, ?, ?, ?)`)
    .run(brandId, 'Synthetic Brand', sha('b'), sha('a'), at);
  db.prepare('INSERT INTO flow_content_campaigns(campaign_id, campaign_key, brand_id, created_at) VALUES (?, ?, ?, ?)').run(campaignId, 'synthetic-051', brandId, at);
  db.prepare(`INSERT INTO flow_content_campaign_revisions
    (campaign_id, version, campaign_name, request_sha256, campaign_artifact_sha256, created_at) VALUES (?, 1, ?, ?, ?, ?)`)
    .run(campaignId, 'Synthetic Campaign', sha('c'), sha('a'), at);
  db.prepare(`INSERT INTO flow_content_insight_revisions
    (campaign_id, version, source_kind, locked_stp_id, request_sha256, insight_artifact_sha256, created_at)
    VALUES (?, 1, 'TYPED', NULL, ?, ?, ?)`)
    .run(campaignId, sha('d'), sha('a'), at);
  db.prepare(`INSERT INTO flow_content_insight_locks
    (campaign_id, insight_version, campaign_version, b10_decision_id, request_sha256, lock_artifact_sha256, created_at)
    VALUES (?, 1, 1, NULL, ?, ?, ?)`)
    .run(campaignId, sha('e'), sha('a'), at);

  const attempt = (attemptId: string, targetType: string, targetId: string, modality: 'text' | 'image', model: string) => db.prepare(`
    INSERT INTO flow_content_ai_attempts
      (attempt_id, kind, modality, target_type, target_id, model, provider_model, prompt_ref, input_bundle_sha256, output_sha256,
       planned_action_call_count, state, error_code, retry_of, actor_id, created_at, closed_at, latency_ms, provider_request_id, input_tokens, output_tokens)
    VALUES (?, 'generate', ?, ?, ?, ?, ?, 'synthetic:051', ?, NULL, 1, 'running', NULL, NULL, 'owner:synthetic', ?, NULL, NULL, NULL, NULL, NULL)`)
    .run(attemptId, modality, targetType, targetId, model, model, sha('f'), at);
  attempt(uuid(10), 'content_big_idea', bigIdeaId, 'text', 'gpt-5.6-sol');
  db.prepare(`INSERT INTO flow_content_ideas
    (idea_id, campaign_id, kind, parent_idea_id, ordinal, insight_version, request_id, request_sha256, attempt_id, idea_artifact_sha256, created_at)
    VALUES (?, ?, 'BIG_IDEA', NULL, 1, 1, ?, ?, ?, ?, ?)`)
    .run(bigIdeaId, campaignId, uuid(11), sha('1'), uuid(10), sha('a'), at);
  attempt(uuid(12), 'content_angle', angleId, 'text', 'gpt-5.6-sol');
  db.prepare(`INSERT INTO flow_content_ideas
    (idea_id, campaign_id, kind, parent_idea_id, ordinal, insight_version, request_id, request_sha256, attempt_id, idea_artifact_sha256, created_at)
    VALUES (?, ?, 'ANGLE', ?, 1, 1, ?, ?, ?, ?, ?)`)
    .run(angleId, campaignId, bigIdeaId, uuid(13), sha('2'), uuid(12), sha('a'), at);

  const packageRow = (id: string, ordinal: number) => db.prepare(`INSERT INTO flow_content_packages
    (package_id, campaign_id, angle_id, ordinal, request_id, request_sha256, package_artifact_sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, campaignId, angleId, ordinal, uuid(20 + ordinal), sha(String(ordinal)), sha('a'), at);
  packageRow(packageId, 1);
  packageRow(secondPackageId, 2);
  return { root, db, migration: opened.migration, attempt, packageRow };
}

function version(db: ReturnType<typeof setup>['db'], values: { packageId: string; part: 'CAPTION' | 'POSTER'; version: number; source: 'GENERATED' | 'MANUAL' | 'RESTORE'; attemptId?: string; restoredFromVersion?: number; requestNo: number }) {
  db.prepare(`INSERT INTO flow_content_package_versions
    (package_id, part, version, source, attempt_id, restored_from_version, request_id, request_sha256, version_artifact_sha256, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(values.packageId, values.part, values.version, values.source, values.attemptId ?? null, values.restoredFromVersion ?? null,
      uuid(values.requestNo), sha((values.requestNo % 16).toString(16)), sha('a'), at);
}

test('0028/0029 inventories all package tables and triggers and keeps every table append-only', () => {
  const state = setup();
  assert.equal(state.migration.currentVersion, 34);
  assert.deepEqual((state.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('flow_content_packages', 'flow_content_package_versions', 'flow_content_package_states', 'flow_content_campaign_defaults') ORDER BY name").all() as { name: string }[]).map((row) => row.name), [
    'flow_content_campaign_defaults', 'flow_content_package_states', 'flow_content_package_versions', 'flow_content_packages',
  ]);
  assert.deepEqual((state.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND (name LIKE 'flow_content_packages_%' OR name LIKE 'flow_content_package_versions_%' OR name LIKE 'flow_content_package_states_%' OR name LIKE 'flow_content_campaign_defaults_%') ORDER BY name").all() as { name: string }[]).map((row) => row.name), [
    'flow_content_campaign_defaults_no_delete', 'flow_content_campaign_defaults_no_update', 'flow_content_campaign_defaults_sequential',
    'flow_content_package_states_no_delete', 'flow_content_package_states_no_update', 'flow_content_package_states_sequential',
    'flow_content_package_versions_attempt', 'flow_content_package_versions_no_delete', 'flow_content_package_versions_no_update', 'flow_content_package_versions_restore_target', 'flow_content_package_versions_sequential',
    'flow_content_packages_angle', 'flow_content_packages_no_delete', 'flow_content_packages_no_update', 'flow_content_packages_sequential',
  ]);
  for (const [sql, values] of [
    ['UPDATE flow_content_packages SET ordinal = 9', []],
    ['DELETE FROM flow_content_packages', []],
  ] as const) assert.throws(() => state.db.prepare(sql).run(...values), /flow_content_package_immutable/);

  version(state.db, { packageId, part: 'CAPTION', version: 1, source: 'MANUAL', requestNo: 30 });
  for (const [sql, values] of [
    ['UPDATE flow_content_package_versions SET version = 8', []],
    ['DELETE FROM flow_content_package_versions', []],
  ] as const) assert.throws(() => state.db.prepare(sql).run(...values), /flow_content_package_version_immutable/);
  state.db.prepare(`INSERT INTO flow_content_package_states(package_id, sequence, action, deleted, request_sha256, created_at) VALUES (?, 1, 'DELETE', 1, ?, ?)`).run(packageId, sha('3'), at);
  assert.throws(() => state.db.prepare('UPDATE flow_content_package_states SET deleted = 0').run(), /flow_content_package_state_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_package_states').run(), /flow_content_package_state_immutable/);
  state.db.prepare(`INSERT INTO flow_content_campaign_defaults(campaign_id, version, defaults_json, request_sha256, created_at) VALUES (?, 1, '{}', ?, ?)`).run(campaignId, sha('4'), at);
  assert.throws(() => state.db.prepare("UPDATE flow_content_campaign_defaults SET defaults_json = '{\"changed\":true}'").run(), /flow_content_campaign_defaults_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_campaign_defaults').run(), /flow_content_campaign_defaults_immutable/);
  state.db.close();
});

test('package, part-version, state and defaults numbers are sequential', () => {
  const state = setup();
  assert.throws(() => state.packageRow('05100000-0000-4000-8000-000000000008', 4), /flow_content_package_not_sequential/);
  assert.throws(() => version(state.db, { packageId, part: 'CAPTION', version: 3, source: 'MANUAL', requestNo: 31 }), /flow_content_package_version_not_sequential/);
  state.db.prepare(`INSERT INTO flow_content_package_states(package_id, sequence, action, deleted, request_sha256, created_at) VALUES (?, 1, 'DELETE', 1, ?, ?)`).run(packageId, sha('3'), at);
  assert.throws(() => state.db.prepare(`INSERT INTO flow_content_package_states(package_id, sequence, action, deleted, request_sha256, created_at) VALUES (?, 3, 'RESTORE', 0, ?, ?)`).run(packageId, sha('5'), at), /flow_content_package_state_not_sequential/);
  state.db.prepare(`INSERT INTO flow_content_campaign_defaults(campaign_id, version, defaults_json, request_sha256, created_at) VALUES (?, 1, '{}', ?, ?)`).run(campaignId, sha('6'), at);
  assert.throws(() => state.db.prepare(`INSERT INTO flow_content_campaign_defaults(campaign_id, version, defaults_json, request_sha256, created_at) VALUES (?, 3, '{}', ?, ?)`).run(campaignId, sha('7'), at), /flow_content_campaign_defaults_not_sequential/);
  state.db.close();
});

test('version attempts must match package target id, target type and modality', () => {
  const state = setup();
  const cases = [
    { id: uuid(40), targetType: 'content_poster', targetId: secondPackageId, modality: 'image' as const, model: 'gpt-image-2' },
    { id: uuid(41), targetType: 'content_caption', targetId: angleId, modality: 'text' as const, model: 'gpt-5.6-sol' },
    { id: uuid(42), targetType: 'content_caption', targetId: secondPackageId, modality: 'image' as const, model: 'gpt-image-2' },
  ];
  for (const [index, wrong] of cases.entries()) {
    state.attempt(wrong.id, wrong.targetType, wrong.targetId, wrong.modality, wrong.model);
    assert.throws(() => version(state.db, { packageId: secondPackageId, part: 'CAPTION', version: 1, source: 'GENERATED', attemptId: wrong.id, requestNo: 50 + index }), /flow_content_package_version_attempt_mismatch/);
    state.db.prepare("UPDATE flow_content_ai_attempts SET state = 'failed', error_code = 'network_error', closed_at = ? WHERE attempt_id = ?").run(at, wrong.id);
  }
  const correctCaption = uuid(60);
  const correctPoster = uuid(61);
  state.attempt(correctCaption, 'content_caption', secondPackageId, 'text', 'gpt-5.6-sol');
  state.attempt(correctPoster, 'content_poster', secondPackageId, 'image', 'gpt-image-2');
  version(state.db, { packageId: secondPackageId, part: 'CAPTION', version: 1, source: 'GENERATED', attemptId: correctCaption, requestNo: 70 });
  version(state.db, { packageId: secondPackageId, part: 'POSTER', version: 1, source: 'GENERATED', attemptId: correctPoster, requestNo: 71 });
  assert.equal((state.db.prepare('SELECT count(*) n FROM flow_content_package_versions WHERE package_id = ?').get(secondPackageId) as { n: bigint }).n, 2n);
  state.db.close();
});

test('defaults append immutable revisions independently of package versions', () => {
  const state = setup();
  state.db.prepare(`INSERT INTO flow_content_campaign_defaults(campaign_id, version, defaults_json, request_sha256, created_at) VALUES (?, 1, ?, ?, ?)`).run(campaignId, '{"caption":{}}', sha('8'), at);
  state.db.prepare(`INSERT INTO flow_content_campaign_defaults(campaign_id, version, defaults_json, request_sha256, created_at) VALUES (?, 2, ?, ?, ?)`).run(campaignId, '{"caption":{"style":"FRIENDLY"}}', sha('9'), '2027-01-02T00:00:00.000Z');
  assert.deepEqual(state.db.prepare('SELECT version, defaults_json FROM flow_content_campaign_defaults WHERE campaign_id = ? ORDER BY version').all(campaignId), [
    { version: 1n, defaults_json: '{"caption":{}}' },
    { version: 2n, defaults_json: '{"caption":{"style":"FRIENDLY"}}' },
  ]);
  state.db.close();
});
