import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentPromptLibrary } from '../../src/modules/flow/content-prompt-library.js';
import { ContentPromptConflictError, ContentPromptService } from '../../src/modules/flow/content-prompt-service.js';
import { FlowValidationError } from '../../src/modules/flow/validation.js';

const ids = ['99999999-9999-4999-8999-000000000001', '99999999-9999-4999-8999-000000000002', '99999999-9999-4999-8999-000000000003'] as const;
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const content = (patch: Record<string, unknown> = {}) => ({
  name: 'Cảm xúc gia đình ngày Tết', description: 'Big Idea từ góc nhìn người con.',
  creativeText: 'Viết như một người con đi làm xa nghĩ về bố mẹ ngày Tết. Tránh giọng quảng cáo.',
  recommendedModel: 'gpt-5.6-luna', tags: ['Tết', 'quà tặng'],
  demoInput: 'Insight: con muốn bố mẹ khỏe cả năm.', demoOutput: '“Mùa xuân của đôi chân”',
  ...patch,
});
const createRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', promptKey: 'tet-gia-dinh', promptType: 'BIG_IDEA', prompt: content(), ...patch });
const revisionRequest = (patch: Record<string, unknown> = {}) => ({ contractVersion: '1.0.0', promptId: ids[0], expectedVersion: 1, prompt: content({ name: 'Tết đoàn viên' }), ...patch });
const lifecycle = (action: 'DELETE' | 'RESTORE', expectedSequence: number) => ({ contractVersion: '1.0.0', promptId: ids[0], action, expectedSequence });

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-prompt-')); roots.push(root);
  const { db, migration } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const clock = { now: new Date(Date.UTC(2027, 0, 1)) };
  const queue: string[] = [...ids];
  const prompts = new ContentPromptService({ db, artifactStore: artifacts, library: new ContentPromptLibrary(), uuid: () => queue.shift()!, now: () => new Date(clock.now.getTime()) });
  const advance = (days: number) => { clock.now = new Date(clock.now.getTime() + days * 86_400_000); };
  return { db, migration, artifacts, prompts, advance };
}

test('migration 0023 creates immutable prompt tables whose lifecycle alternates within the restore window', async () => {
  const state = setup();
  assert.equal(state.migration.currentVersion, 28);
  await state.prompts.createPrompt(createRequest());
  const insert = state.db.prepare('INSERT INTO flow_content_prompt_lifecycle(prompt_id, sequence, action, created_at) VALUES (?, ?, ?, ?)');
  assert.throws(() => insert.run(ids[0], 1, 'RESTORE', '2027-01-01T00:00:00.000Z'), /not_alternating/);
  insert.run(ids[0], 1, 'DELETE', '2027-01-01T00:00:00.000Z');
  assert.throws(() => insert.run(ids[0], 2, 'DELETE', '2027-01-02T00:00:00.000Z'), /not_alternating/);
  assert.throws(() => insert.run(ids[0], 3, 'RESTORE', '2027-01-02T00:00:00.000Z'), /not_sequential/);
  assert.throws(() => insert.run(ids[0], 2, 'RESTORE', '2027-02-01T00:00:01.000Z'), /restore_window_expired/);
  assert.throws(() => insert.run(ids[0], 2, 'RESTORE', '2026-12-31T23:59:59.999Z'), /lifecycle_not_chronological/);
  insert.run(ids[0], 2, 'RESTORE', '2027-01-31T00:00:00.000Z');
  assert.throws(() => insert.run(ids[0], 3, 'DELETE', '2027-01-30T00:00:00.000Z'), /lifecycle_not_chronological/);
  assert.throws(() => state.db.prepare("UPDATE flow_content_prompt_lifecycle SET action = 'DELETE'").run(), /flow_content_prompt_lifecycle_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_prompt_revisions').run(), /flow_content_prompt_revision_immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_content_prompts').run(), /flow_content_prompt_immutable/);
  state.db.close();
});

test('user prompts are created, read, retried exactly and conflict on changed content', async () => {
  const state = setup();
  const created = await state.prompts.createPrompt(createRequest());
  assert.deepEqual([created.promptId, created.version, created.deduplicated, created.databaseMutations], [ids[0], 1, false, 3]);
  const artifact = await state.prompts.readPrompt(ids[0]);
  assert.deepEqual([artifact.promptType, artifact.promptKey, artifact.version, artifact.prompt], ['BIG_IDEA', 'tet-gia-dinh', 1, content()]);
  const retry = await state.prompts.createPrompt(createRequest());
  assert.deepEqual([retry.deduplicated, retry.databaseMutations], [true, 0]);
  await assert.rejects(state.prompts.createPrompt(createRequest({ prompt: content({ name: 'Khác' }) })), ContentPromptConflictError);
  await assert.rejects(state.prompts.createPrompt(createRequest({ promptKey: 'poster-sai', promptType: 'POSTER' })), FlowValidationError);
  await assert.rejects(state.prompts.createPrompt(createRequest({ promptKey: 'caption-sai', promptType: 'CAPTION', prompt: content({ recommendedModel: 'gpt-image-2' }) })), FlowValidationError);
  await assert.rejects(state.prompts.createPrompt(createRequest({ promptKey: 'tag-lap', prompt: content({ tags: ['Tết', 'Tết'] }) })), FlowValidationError);
  await assert.rejects(state.prompts.createPrompt(createRequest({ promptKey: 'thua', prompt: content({ extra: 1 }) })), FlowValidationError);
  assert.equal(Number((state.db.prepare('SELECT count(*) n FROM flow_content_prompts').get() as { n: bigint }).n), 1);
  state.db.close();
});

test('revisions are sequential, keep the type, reject drift and stale versions', async () => {
  const state = setup();
  await state.prompts.createPrompt(createRequest());
  assert.equal((await state.prompts.revisePrompt(revisionRequest())).version, 2);
  assert.equal((await state.prompts.readPrompt(ids[0])).prompt.name, 'Tết đoàn viên');
  assert.equal((await state.prompts.readPrompt(ids[0], 1)).prompt.name, 'Cảm xúc gia đình ngày Tết');
  assert.deepEqual([(await state.prompts.revisePrompt(revisionRequest())).deduplicated], [true]);
  await assert.rejects(state.prompts.revisePrompt(revisionRequest({ prompt: content({ name: 'Drift' }) })), ContentPromptConflictError);
  await assert.rejects(state.prompts.revisePrompt(revisionRequest({ expectedVersion: 3 })), ContentPromptConflictError);
  await assert.rejects(state.prompts.revisePrompt(revisionRequest({ expectedVersion: 2, prompt: content({ recommendedModel: 'gemini-3.1-flash-image' }) })), FlowValidationError);
  state.db.close();
});

test('duplicates record verified lineage to an exact system or user prompt version', async () => {
  const state = setup();
  const fromSystem = await state.prompts.createPrompt(createRequest({ duplicatedFrom: { kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 } }));
  assert.deepEqual((await state.prompts.readPrompt(fromSystem.promptId)).duplicatedFrom, { kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 1 });
  const fromUser = await state.prompts.createPrompt(createRequest({ promptKey: 'ban-sao', duplicatedFrom: { kind: 'USER', id: ids[0], version: 1 } }));
  assert.equal((await state.prompts.readPrompt(fromUser.promptId)).duplicatedFrom?.id, ids[0]);
  for (const duplicatedFrom of [
    { kind: 'SYSTEM', id: 'system-khong-co', version: 1 },
    { kind: 'SYSTEM', id: 'system-big-idea-strategic', version: 2 },
    { kind: 'SYSTEM', id: 'system-angle-social', version: 1 },
    { kind: 'USER', id: ids[0], version: 9 },
    { kind: 'USER', id: 'system-big-idea-strategic', version: 1 },
  ]) {
    await assert.rejects(state.prompts.createPrompt(createRequest({ promptKey: 'sai-nguon', duplicatedFrom })), FlowValidationError, JSON.stringify(duplicatedFrom));
  }
  state.db.close();
});

test('a lifecycle change dated before the last one is a conflict and writes nothing', async () => {
  const state = setup();
  await state.prompts.createPrompt(createRequest());
  await state.prompts.changeLifecycle(lifecycle('DELETE', 0));
  state.advance(-1);
  await assert.rejects(state.prompts.changeLifecycle(lifecycle('RESTORE', 1)), ContentPromptConflictError);
  assert.equal(state.prompts.lifecycleState(ids[0]).sequence, 1);
  state.advance(2);
  await state.prompts.changeLifecycle(lifecycle('RESTORE', 1));
  state.advance(-1);
  await assert.rejects(state.prompts.changeLifecycle(lifecycle('DELETE', 2)), ContentPromptConflictError);
  assert.equal(state.prompts.lifecycleState(ids[0]).sequence, 2);
  state.db.close();
});

test('prompts can be deleted, restored within 30 days, and not revised while deleted', async () => {
  const state = setup();
  await state.prompts.createPrompt(createRequest());
  const deleted = await state.prompts.changeLifecycle(lifecycle('DELETE', 0));
  assert.deepEqual([deleted.sequence, deleted.action, deleted.createdAt, deleted.restorableUntil, deleted.deduplicated], [1, 'DELETE', '2027-01-01T00:00:00.000Z', '2027-01-31T00:00:00.000Z', false]);
  assert.equal((await state.prompts.changeLifecycle(lifecycle('DELETE', 0))).deduplicated, true);
  assert.deepEqual(state.prompts.lifecycleState(ids[0]), { sequence: 1, deleted: { deletedAt: '2027-01-01T00:00:00.000Z', restorableUntil: '2027-01-31T00:00:00.000Z' }, expired: false });
  await assert.rejects(state.prompts.revisePrompt(revisionRequest()), ContentPromptConflictError);
  await assert.rejects(state.prompts.changeLifecycle(lifecycle('RESTORE', 0)), ContentPromptConflictError);
  await assert.rejects(state.prompts.changeLifecycle(lifecycle('DELETE', 1)), ContentPromptConflictError);
  state.advance(29);
  assert.equal((await state.prompts.changeLifecycle(lifecycle('RESTORE', 1))).action, 'RESTORE');
  assert.deepEqual(state.prompts.lifecycleState(ids[0]), { sequence: 2, expired: false });
  assert.equal((await state.prompts.revisePrompt(revisionRequest())).version, 2);
  await state.prompts.changeLifecycle(lifecycle('DELETE', 2));
  state.advance(31);
  assert.equal(state.prompts.lifecycleState(ids[0]).expired, true);
  await assert.rejects(state.prompts.changeLifecycle(lifecycle('RESTORE', 3)), ContentPromptConflictError);
  assert.equal((await state.prompts.readPrompt(ids[0], 2)).version, 2, 'versions stay readable for lineage');
  await assert.rejects(state.prompts.changeLifecycle({ ...lifecycle('DELETE', 0), promptId: '99999999-9999-4999-8999-00000000ffff' }), FlowValidationError);
  state.db.close();
});

test('tampered prompt artifacts fail verification', async () => {
  const state = setup();
  const created = await state.prompts.createPrompt(createRequest());
  const file = state.artifacts.pathForDigest(created.promptArtifactSha256);
  fs.chmodSync(file, 0o600); fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('ngày Tết', 'ngày tết'));
  await assert.rejects(state.prompts.readPrompt(ids[0]));
  state.db.close();
});

test('migration v22 to v23 applies once and leaves 0001-0022 byte-identical', () => {
  assert.equal(createHash('sha256').update(fs.readFileSync('migrations/0022_flow_content_catalog_media.sql')).digest('hex'), 'bc776e4482b56562a6371f5d99923693b283ae3db7682b71ce73c808c07443dd');
  const prior = fs.readdirSync('migrations').filter((name) => /^00(?:0[1-9]|1[0-9]|2[0-2])_/.test(name)).sort();
  assert.equal(prior.length, 22);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-prompt-migration-')); roots.push(root);
  const dir = path.join(root, 'migrations'); fs.mkdirSync(dir);
  for (const name of prior) fs.copyFileSync(path.join('migrations', name), path.join(dir, name));
  const databasePath = path.join(root, 'db.sqlite');
  const v22 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.equal(v22.migration.currentVersion, 22); v22.db.close();
  fs.copyFileSync('migrations/0023_flow_content_prompts.sql', path.join(dir, '0023_flow_content_prompts.sql'));
  const v23 = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(v23.migration.applied, [23]); v23.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: dir }); assert.deepEqual(rerun.migration.applied, []); rerun.db.close();
  assert.doesNotMatch(fs.readFileSync('migrations/0023_flow_content_prompts.sql', 'utf8'), /REFERENCES\s+(?:governance_|foundation_|analysis_|orchestrator_|flow_(?!content_))/i);
});
