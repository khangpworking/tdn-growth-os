import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  DiscoveryWorkspaceIdentityConflictError,
  DiscoveryWorkspaceService,
  FlowDiscoveryWorkspaceReader,
  FlowProductCandidateReader,
  FlowValidationError,
  ProductCandidateIdentityConflictError,
  ProductCandidateService,
} from '../../src/modules/flow/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
const priorMigrations = [
  'migrations/0001_foundation.sql',
  'migrations/0002_data_packs.sql',
  'migrations/0003_analysis_results.sql',
  'migrations/0004_analysis_interpretations.sql',
  'migrations/0005_research_documents.sql',
  'migrations/0006_analysis_research_results.sql',
  'migrations/0007_analysis_research_audits.sql',
  'migrations/0008_orchestrator_proposals.sql',
  'migrations/0009_governance_proposal_decisions.sql',
  'migrations/0010_flow_authorized_plans.sql',
  'migrations/0011_shopee_review_collection.sql',
  'migrations/0012_source_package_intake.sql',
] as const;
const priorDigests = [
  'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb',
  'b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
  'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec',
  '0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
  'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592',
  '241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88',
  '18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b',
  '285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848',
  'f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439',
  '4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb',
  'c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65',
  '1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca',
] as const;

const workspaceId = '11111111-1111-4111-8111-111111111111';
const candidateId = '22222222-2222-4222-8222-222222222222';
const secondWorkspaceId = '33333333-3333-4333-8333-333333333333';
const secondCandidateId = '44444444-4444-4444-8444-444444444444';
const thirdCandidateId = '55555555-5555-4555-8555-555555555555';

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true })));
});

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-discovery-workspace-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime', 'flow.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  let workspaceUuidUsed = false;
  let candidateUuidUsed = false;
  const workspaces = new DiscoveryWorkspaceService({
    db,
    artifactStore: artifacts,
    now: () => new Date('2026-09-25T01:00:00.000Z'),
    uuid: () => { assert.equal(workspaceUuidUsed, false); workspaceUuidUsed = true; return workspaceId; },
  });
  const candidates = new ProductCandidateService({
    db,
    artifactStore: artifacts,
    now: () => new Date('2026-09-25T02:00:00.000Z'),
    uuid: () => { assert.equal(candidateUuidUsed, false); candidateUuidUsed = true; return candidateId; },
  });
  return { root, db, artifacts, workspaces, candidates };
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}

function totalChanges(db: Database.Database): bigint {
  return (db.prepare('SELECT total_changes() value').get() as { value: bigint }).value;
}

const workspaceRequest = {
  contractVersion: '1.0.0',
  workspaceKey: 'skin-care-discovery',
  title: 'Khám phá sản phẩm chăm sóc da',
  description: 'Không gian tổng hợp dành cho khám phá ban đầu.',
} as const;

async function createWorkspace(state: ReturnType<typeof setup>) {
  return state.workspaces.createWorkspace(workspaceRequest);
}

const candidateRequest = {
  contractVersion: '1.0.0',
  workspaceId,
  candidateKey: 'gentle-cleanser',
  label: 'Sữa rửa mặt dịu nhẹ',
  summary: 'Ứng viên ban đầu cho nhóm da nhạy cảm.',
} as const;

test('migration 0013 upgrades version 12 once and migrations 0001-0012 remain byte-identical', () => {
  assert.deepEqual(priorMigrations.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), priorDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-discovery-migration-'));
  roots.push(root);
  const directory = path.join(root, 'migrations');
  fs.mkdirSync(directory);
  for (const file of priorMigrations) fs.copyFileSync(file, path.join(directory, path.basename(file)));
  const databasePath = path.join(root, 'discovery.sqlite');
  const twelve = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.equal(twelve.migration.currentVersion, 12);
  twelve.db.close();
  fs.copyFileSync('migrations/0013_discovery_workspaces.sql', path.join(directory, '0013_discovery_workspaces.sql'));
  const thirteen = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(thirteen.migration.applied, [13]);
  assert.equal(thirteen.migration.currentVersion, 13);
  thirteen.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory });
  assert.deepEqual(rerun.migration.applied, []);
  rerun.db.close();
});

test('workspace creation is canonical, immutable, verified, and exactly idempotent', async () => {
  const state = setup();
  const first = await createWorkspace(state);
  assert.deepEqual(first, { workspaceId, workspaceArtifactSha256: first.workspaceArtifactSha256, state: 'ACTIVE', deduplicated: false, databaseMutations: 2 });
  const artifact = await new FlowDiscoveryWorkspaceReader(state.workspaces).readVerifiedWorkspace(workspaceId);
  assert.equal(artifact.workspaceKey, workspaceRequest.workspaceKey);
  assert.equal(artifact.requestSha256, createHash('sha256').update(canonicalJson(workspaceRequest)).digest('hex'));
  assert.deepEqual(Object.keys(artifact).sort(), ['contractVersion', 'createdAt', 'description', 'requestSha256', 'state', 'title', 'workspaceId', 'workspaceKey']);
  const manifests = count(state.db, 'artifact_manifests');
  const changesBeforeRetry = totalChanges(state.db);
  const retry = await createWorkspace(state);
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.databaseMutations, 0);
  assert.equal(retry.workspaceId, first.workspaceId);
  assert.equal(count(state.db, 'artifact_manifests'), manifests);
  assert.equal(totalChanges(state.db), changesBeforeRetry);
  await assert.rejects(state.workspaces.createWorkspace({ ...workspaceRequest, title: 'Changed title' }), DiscoveryWorkspaceIdentityConflictError);
  assert.throws(() => state.db.prepare("UPDATE flow_discovery_workspaces SET title='x' WHERE workspace_id=?").run(workspaceId), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_discovery_workspaces WHERE workspace_id=?').run(workspaceId), /immutable/);
  state.db.close();
});

test('candidate service creates and appends verified revisions without mutating prior versions', async () => {
  const state = setup();
  await createWorkspace(state);
  const created = await state.candidates.createCandidate(candidateRequest);
  assert.equal(created.version, 1);
  assert.equal(created.state, 'EXPLORING');
  assert.equal(created.databaseMutations, 3);
  const reader = new FlowProductCandidateReader(state.candidates);
  assert.equal((await reader.readVerifiedCandidate(candidateId)).label, candidateRequest.label);
  const revised = await state.candidates.reviseCandidate({
    contractVersion: '1.0.0', candidateId, expectedVersion: 1,
    label: 'Sữa rửa mặt dịu nhẹ phiên bản 2', summary: 'Bổ sung giả thuyết công thức không hương liệu.',
  });
  assert.equal(revised.version, 2);
  assert.equal(revised.databaseMutations, 2);
  assert.equal((await reader.readVerifiedCandidate(candidateId)).version, 2);
  assert.equal((await reader.readVerifiedCandidate(candidateId, 1)).label, candidateRequest.label);
  assert.equal(count(state.db, 'flow_product_candidates'), 1n);
  assert.equal(count(state.db, 'flow_product_candidate_revisions'), 2n);
  const changesBeforeRetry = totalChanges(state.db);
  const retry = await state.candidates.reviseCandidate({
    contractVersion: '1.0.0', candidateId, expectedVersion: 1,
    label: 'Sữa rửa mặt dịu nhẹ phiên bản 2', summary: 'Bổ sung giả thuyết công thức không hương liệu.',
  });
  assert.equal(retry.deduplicated, true);
  assert.equal(retry.databaseMutations, 0);
  assert.equal(count(state.db, 'flow_product_candidate_revisions'), 2n);
  assert.equal(totalChanges(state.db), changesBeforeRetry);
  await assert.rejects(state.candidates.reviseCandidate({ contractVersion: '1.0.0', candidateId, expectedVersion: 1, label: 'Drift' }), ProductCandidateIdentityConflictError);
  assert.throws(() => state.db.prepare("UPDATE flow_product_candidate_revisions SET label='x' WHERE candidate_id=? AND version=1").run(candidateId), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_product_candidate_revisions WHERE candidate_id=? AND version=1').run(candidateId), /immutable/);
  assert.throws(() => state.db.prepare("UPDATE flow_product_candidates SET state='EXPLORING' WHERE candidate_id=?").run(candidateId), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_product_candidates WHERE candidate_id=?').run(candidateId), /immutable/);
  state.db.close();
});

test('invalid or injected workspace/candidate input and missing lineage reject before database writes', async () => {
  const state = setup();
  for (const field of ['state', 'workspaceId', 'createdAt', 'requestSha256', 'tasks', 'commands', 'provider', 'relations']) {
    await assert.rejects(state.workspaces.createWorkspace({ ...workspaceRequest, [field]: 'attacker' }), FlowValidationError);
  }
  await assert.rejects(state.candidates.createCandidate(candidateRequest), FlowValidationError);
  assert.equal(count(state.db, 'flow_discovery_workspaces'), 0n);
  assert.equal(count(state.db, 'flow_product_candidates'), 0n);
  assert.equal(count(state.db, 'artifact_manifests'), 0n);
  await createWorkspace(state);
  for (const field of ['state', 'candidateId', 'version', 'createdAt', 'requestSha256', 'transition', 'action', 'relation']) {
    await assert.rejects(state.candidates.createCandidate({ ...candidateRequest, [field]: 'attacker' }), FlowValidationError);
  }
  await assert.rejects(state.candidates.createCandidate({ ...candidateRequest, workspaceId: randomUUID() }), FlowValidationError);
  const changes = totalChanges(state.db);
  await assert.rejects(state.candidates.reviseCandidate({
    contractVersion: '1.0.0', candidateId: randomUUID(), expectedVersion: 1, label: 'x', unknown: 'attacker',
  }), FlowValidationError);
  assert.equal(totalChanges(state.db), changes);
  state.db.close();
});

test('verified readers detect database metadata drift and noncanonical artifacts', async () => {
  const state = setup();
  await createWorkspace(state);
  await state.candidates.createCandidate(candidateRequest);
  state.db.exec('DROP TRIGGER flow_product_candidate_revisions_no_update');
  state.db.prepare("UPDATE flow_product_candidate_revisions SET label='tampered' WHERE candidate_id=? AND version=1").run(candidateId);
  await assert.rejects(state.candidates.readCandidate(candidateId, 1), ProductCandidateIdentityConflictError);
  state.db.exec('DROP TRIGGER flow_discovery_workspaces_no_update');
  state.db.prepare("UPDATE flow_discovery_workspaces SET title='tampered' WHERE workspace_id=?").run(workspaceId);
  await assert.rejects(state.workspaces.readWorkspace(workspaceId), DiscoveryWorkspaceIdentityConflictError);
  state.db.close();
});


test('candidate creation and revision retries resolve their exact historical versions after later revisions', async () => {
  const state = setup();
  await createWorkspace(state);
  const created = await state.candidates.createCandidate(candidateRequest);
  const revisionTwo = {
    contractVersion: '1.0.0', candidateId, expectedVersion: 1,
    label: 'Sữa rửa mặt phiên bản 2', summary: 'Nội dung phiên bản hai.',
  } as const;
  const revisionThree = {
    contractVersion: '1.0.0', candidateId, expectedVersion: 2,
    label: 'Sữa rửa mặt phiên bản 3', summary: 'Nội dung phiên bản ba.',
  } as const;
  const second = await state.candidates.reviseCandidate(revisionTwo);
  await state.candidates.reviseCandidate(revisionThree);

  const changesBeforeRetries = totalChanges(state.db);
  const createRetry = await state.candidates.createCandidate(candidateRequest);
  assert.deepEqual(createRetry, { ...created, deduplicated: true, databaseMutations: 0 });
  const revisionRetry = await state.candidates.reviseCandidate(revisionTwo);
  assert.deepEqual(revisionRetry, { ...second, deduplicated: true, databaseMutations: 0 });
  assert.equal(totalChanges(state.db), changesBeforeRetries);
  assert.equal(count(state.db, 'flow_product_candidates'), 1n);
  assert.equal(count(state.db, 'flow_product_candidate_revisions'), 3n);

  await assert.rejects(
    state.candidates.reviseCandidate({ ...revisionTwo, label: 'Phiên bản hai bị thay đổi' }),
    ProductCandidateIdentityConflictError,
  );
  await assert.rejects(
    state.candidates.reviseCandidate({ ...revisionThree, expectedVersion: 4 }),
    ProductCandidateIdentityConflictError,
  );
  assert.equal(count(state.db, 'flow_product_candidate_revisions'), 3n);
  state.db.close();
});

test('candidate keys are workspace-scoped, multiple candidates coexist, and candidate identity cannot move workspaces', async () => {
  const state = setup();
  await createWorkspace(state);
  const secondWorkspaceService = new DiscoveryWorkspaceService({
    db: state.db,
    artifactStore: state.artifacts,
    now: () => new Date('2026-09-25T01:30:00.000Z'),
    uuid: () => secondWorkspaceId,
  });
  await secondWorkspaceService.createWorkspace({
    ...workspaceRequest,
    workspaceKey: 'hair-care-discovery',
    title: 'Khám phá sản phẩm chăm sóc tóc',
  });
  await state.candidates.createCandidate(candidateRequest);

  const secondCandidateService = new ProductCandidateService({
    db: state.db,
    artifactStore: state.artifacts,
    now: () => new Date('2026-09-25T02:30:00.000Z'),
    uuid: () => secondCandidateId,
  });
  const second = await secondCandidateService.createCandidate({
    ...candidateRequest,
    candidateKey: 'barrier-serum',
    label: 'Serum phục hồi hàng rào da',
  });
  const thirdCandidateService = new ProductCandidateService({
    db: state.db,
    artifactStore: state.artifacts,
    now: () => new Date('2026-09-25T03:00:00.000Z'),
    uuid: () => thirdCandidateId,
  });
  const sameKeyElsewhere = await thirdCandidateService.createCandidate({
    ...candidateRequest,
    workspaceId: secondWorkspaceId,
  });

  assert.equal(second.candidateId, secondCandidateId);
  assert.equal(sameKeyElsewhere.candidateId, thirdCandidateId);
  assert.equal(count(state.db, 'flow_product_candidates'), 3n);
  await assert.rejects(
    secondCandidateService.createCandidate({ ...candidateRequest, label: 'Nội dung trùng khóa bị thay đổi' }),
    ProductCandidateIdentityConflictError,
  );
  assert.throws(
    () => state.db.prepare('UPDATE flow_product_candidates SET workspace_id=? WHERE candidate_id=?').run(secondWorkspaceId, candidateId),
    /immutable/,
  );
  assert.equal((await state.candidates.readCandidate(candidateId)).workspaceId, workspaceId);
  state.db.close();
});

test('candidate artifact manifest keeps the first-storage acquired_at on reuse', async () => {
  const state = setup();
  await createWorkspace(state);
  const createdAt = '2026-09-25T02:00:00.000Z';
  const requestSha256 = createHash('sha256').update(canonicalJson(candidateRequest)).digest('hex');
  const artifact = {
    contractVersion: '1.0.0', candidateId, workspaceId,
    candidateKey: candidateRequest.candidateKey, state: 'EXPLORING', version: 1,
    label: candidateRequest.label, summary: candidateRequest.summary, createdAt, requestSha256,
  } as const;
  const stored = await state.artifacts.put(Buffer.from(canonicalJson(artifact), 'utf8'));
  const firstStoredAt = '2026-09-24T23:00:00.000Z';
  state.db.prepare(`
    INSERT INTO artifact_manifests(
      sha256, byte_size, media_type, relative_path, acquired_at,
      contract_version, retention_status, created_at
    ) VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
  `).run(stored.sha256, stored.byteSize, stored.relativePath, firstStoredAt, firstStoredAt);

  const result = await state.candidates.createCandidate(candidateRequest);
  assert.equal(result.candidateArtifactSha256, stored.sha256);
  const manifest = state.db.prepare('SELECT acquired_at acquiredAt, created_at createdAt FROM artifact_manifests WHERE sha256=?')
    .get(stored.sha256) as { acquiredAt: string; createdAt: string };
  assert.deepEqual(manifest, { acquiredAt: firstStoredAt, createdAt: firstStoredAt });
  assert.equal(await state.candidates.readCandidate(candidateId, 1).then((value) => value.createdAt), createdAt);
  state.db.close();
});


test('optional summary can be removed while historical revisions and exact retry identity stay immutable', async () => {
  const state = setup();
  await createWorkspace(state);
  await state.candidates.createCandidate(candidateRequest);
  const withoutSummary = {
    contractVersion: '1.0.0', candidateId, expectedVersion: 1, label: 'Ứng viên không còn tóm tắt',
  } as const;
  const revised = await state.candidates.reviseCandidate(withoutSummary);
  assert.equal(revised.databaseMutations, 2);
  assert.equal((await state.candidates.readCandidate(candidateId, 1)).summary, candidateRequest.summary);
  assert.equal(Object.hasOwn(await state.candidates.readCandidate(candidateId, 2), 'summary'), false);
  const before = totalChanges(state.db);
  assert.equal((await state.candidates.reviseCandidate(withoutSummary)).databaseMutations, 0);
  assert.equal(totalChanges(state.db), before);
  await assert.rejects(
    state.candidates.reviseCandidate({ ...withoutSummary, summary: 'Retry drift' }),
    ProductCandidateIdentityConflictError,
  );
  assert.equal((await state.candidates.readCandidate(candidateId, 1)).summary, candidateRequest.summary);
  state.db.close();
});

test('direct SQL rejects skipped and otherwise nonsequential candidate revisions', async () => {
  const state = setup();
  await createWorkspace(state);
  const created = await state.candidates.createCandidate(candidateRequest);
  const values = [candidateId, 'Skipped', createHash('sha256').update('x').digest('hex'), created.candidateArtifactSha256, '2026-09-25T03:00:00.000Z'] as const;
  assert.throws(() => state.db.prepare(`
    INSERT INTO flow_product_candidate_revisions(candidate_id, version, label, request_sha256, candidate_artifact_sha256, created_at)
    VALUES (?, 3, ?, ?, ?, ?)
  `).run(...values), /not_sequential/);
  assert.throws(() => state.db.prepare(`
    INSERT INTO flow_product_candidate_revisions(candidate_id, version, label, request_sha256, candidate_artifact_sha256, created_at)
    VALUES (?, 1, ?, ?, ?, ?)
  `).run(...values), /not_sequential|UNIQUE/);
  assert.equal(count(state.db, 'flow_product_candidate_revisions'), 1n);
  state.db.close();
});

test('workspace artifact manifest keeps first-storage acquired_at on reuse', async () => {
  const state = setup();
  const createdAt = '2026-09-25T01:00:00.000Z';
  const requestSha256 = createHash('sha256').update(canonicalJson(workspaceRequest)).digest('hex');
  const artifact = {
    contractVersion: '1.0.0', workspaceId, workspaceKey: workspaceRequest.workspaceKey,
    state: 'ACTIVE', title: workspaceRequest.title, description: workspaceRequest.description, createdAt, requestSha256,
  } as const;
  const stored = await state.artifacts.put(Buffer.from(canonicalJson(artifact), 'utf8'));
  const firstStoredAt = '2026-09-24T22:00:00.000Z';
  state.db.prepare(`
    INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
    VALUES (?, ?, 'application/json', ?, ?, '1.0.0', 'active', ?)
  `).run(stored.sha256, stored.byteSize, stored.relativePath, firstStoredAt, firstStoredAt);
  const result = await createWorkspace(state);
  assert.equal(result.databaseMutations, 1);
  const manifest = state.db.prepare('SELECT acquired_at acquiredAt, created_at createdAt FROM artifact_manifests WHERE sha256=?')
    .get(stored.sha256) as { acquiredAt: string; createdAt: string };
  assert.deepEqual(manifest, { acquiredAt: firstStoredAt, createdAt: firstStoredAt });
  state.db.close();
});


test('verified replay recomputes owner request digests for workspace, candidate v1, and later revision', async () => {
  const state = setup();
  const workspace = await createWorkspace(state);
  const candidate = await state.candidates.createCandidate(candidateRequest);
  const revisionRequest = {
    contractVersion: '1.0.0', candidateId, expectedVersion: 1, label: 'Phiên bản hai', summary: 'Tóm tắt phiên bản hai.',
  } as const;
  const revision = await state.candidates.reviseCandidate(revisionRequest);
  const cases = [
    {
      sha256: workspace.workspaceArtifactSha256,
      read: () => state.workspaces.readWorkspace(workspaceId),
      prepare: (tamperedSha256: string) => state.db.prepare(
        'UPDATE flow_discovery_workspaces SET request_sha256=?, workspace_artifact_sha256=? WHERE workspace_id=?',
      ).run('0'.repeat(64), tamperedSha256, workspaceId),
    },
    {
      sha256: candidate.candidateArtifactSha256,
      read: () => state.candidates.readCandidate(candidateId, 1),
      prepare: (tamperedSha256: string) => state.db.prepare(
        'UPDATE flow_product_candidate_revisions SET request_sha256=?, candidate_artifact_sha256=? WHERE candidate_id=? AND version=1',
      ).run('0'.repeat(64), tamperedSha256, candidateId),
    },
    {
      sha256: revision.candidateArtifactSha256,
      read: () => state.candidates.readCandidate(candidateId, 2),
      prepare: (tamperedSha256: string) => state.db.prepare(
        'UPDATE flow_product_candidate_revisions SET request_sha256=?, candidate_artifact_sha256=? WHERE candidate_id=? AND version=2',
      ).run('0'.repeat(64), tamperedSha256, candidateId),
    },
  ] as const;
  state.db.exec('DROP TRIGGER flow_discovery_workspaces_no_update');
  state.db.exec('DROP TRIGGER flow_product_candidate_revisions_no_update');
  for (const item of cases) {
    const artifactPath = path.join(state.root, 'artifacts', 'sha256', item.sha256.slice(0, 2), item.sha256);
    const original = JSON.parse(fs.readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
    const tampered = await state.artifacts.put(Buffer.from(canonicalJson({ ...original, requestSha256: '0'.repeat(64) })));
    state.db.prepare(`
      INSERT INTO artifact_manifests(sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status, created_at)
      VALUES (?, ?, 'application/json', ?, '2026-09-25T04:00:00.000Z', '1.0.0', 'active', '2026-09-25T04:00:00.000Z')
    `).run(tampered.sha256, tampered.byteSize, tampered.relativePath);
    item.prepare(tampered.sha256);
    await assert.rejects(item.read(), /immutable metadata/);
  }
  state.db.close();
});
