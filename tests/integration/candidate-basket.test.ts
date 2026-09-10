import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type Database from 'better-sqlite3';
import {
  CandidateBasketIdentityConflictError,
  CandidateBasketService,
  DiscoveryWorkspaceService,
  FlowCandidateBasketReader,
  FlowDiscoveryWorkspaceReader,
  FlowProductCandidateReader,
  FlowValidationError,
  ProductCandidateService,
} from '../../src/modules/flow/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const otherWorkspaceId = '22222222-2222-4222-8222-222222222222';
const candidateA = '33333333-3333-4333-8333-333333333333';
const candidateB = '44444444-4444-4444-8444-444444444444';
const basketId = '55555555-5555-4555-8555-555555555555';

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-candidate-basket-'));
  roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'runtime.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const workspaceService = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => workspaceId, now: () => new Date('2026-09-26T00:00:00Z') });
  let nextCandidate = candidateA;
  const candidateService = new ProductCandidateService({ db, artifactStore: artifacts, uuid: () => { const id = nextCandidate; nextCandidate = candidateB; return id; }, now: () => new Date('2026-09-26T01:00:00Z') });
  const baskets = new CandidateBasketService({
    db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(workspaceService),
    candidateReader: new FlowProductCandidateReader(candidateService),
    uuid: () => basketId, now: () => new Date('2026-09-26T02:00:00Z'),
  });
  return { root, db, artifacts, workspaceService, candidateService, baskets };
}

async function seed(state: ReturnType<typeof setup>) {
  await state.workspaceService.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'calcium-market', title: 'Thị trường canxi' });
  await state.candidateService.createCandidate({ contractVersion: '1.0.0', workspaceId, candidateKey: 'adult-calcium', label: 'Canxi cho người lớn', summary: 'Ứng viên người lớn.' });
  await state.candidateService.createCandidate({ contractVersion: '1.0.0', workspaceId, candidateKey: 'child-calcium', label: 'Canxi cho trẻ em' });
}

function request(candidates = [{ candidateId: candidateB, candidateVersion: 1 }, { candidateId: candidateA, candidateVersion: 1 }]) {
  return { contractVersion: '1.0.0', workspaceId, basketKey: 'b3-opportunity-basket', version: 1, candidates } as const;
}

function count(db: Database.Database, table: string): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}

function totalChanges(db: Database.Database): bigint {
  return (db.prepare('SELECT total_changes() value').get() as { value: bigint }).value;
}

test('explicit multi-candidate freeze is deterministic, immutable, exactly idempotent, and historical', async () => {
  const state = setup();
  await seed(state);
  const first = await state.baskets.freezeBasket(request());
  assert.equal(first.databaseMutations, 4);
  const artifact = await new FlowCandidateBasketReader(state.baskets).readVerifiedBasket(basketId);
  assert.deepEqual(artifact.candidates.map((member) => member.candidateId), [candidateA, candidateB]);
  assert.deepEqual(artifact.candidates.map((member) => member.label), ['Canxi cho người lớn', 'Canxi cho trẻ em']);
  assert.ok(artifact.candidates.every((member) => member.state === 'EXPLORING' && member.candidateVersion === 1));
  const before = totalChanges(state.db);
  const retry = await state.baskets.freezeBasket(request([...request().candidates].reverse()));
  assert.deepEqual(retry, { ...first, deduplicated: true, databaseMutations: 0 });
  assert.equal(totalChanges(state.db), before);
  await state.candidateService.reviseCandidate({ contractVersion: '1.0.0', candidateId: candidateA, expectedVersion: 1, label: 'Canxi người lớn v2' });
  assert.equal((await state.baskets.readBasket(basketId)).candidates[0].label, 'Canxi cho người lớn');
  assert.equal((await state.baskets.readBasket(basketId)).candidates[0].candidateVersion, 1);
  assert.throws(() => state.db.prepare("UPDATE flow_candidate_basket_members SET label='x' WHERE basket_id=?").run(basketId), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_candidate_baskets WHERE basket_id=?').run(basketId), /immutable/);
  state.db.close();
});

test('duplicates, missing revisions, wrong workspace, and identity drift fail closed', async () => {
  const state = setup();
  await seed(state);
  await assert.rejects(state.baskets.freezeBasket(request([{ candidateId: candidateA, candidateVersion: 1 }, { candidateId: candidateA, candidateVersion: 2 }])), FlowValidationError);
  await assert.rejects(state.baskets.freezeBasket(request([{ candidateId: candidateA, candidateVersion: 9 }])), FlowValidationError);
  const otherWorkspace = new DiscoveryWorkspaceService({ db: state.db, artifactStore: state.artifacts, uuid: () => otherWorkspaceId });
  await otherWorkspace.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'other-market', title: 'Khác' });
  const otherCandidate = new ProductCandidateService({ db: state.db, artifactStore: state.artifacts, uuid: () => '66666666-6666-4666-8666-666666666666' });
  const created = await otherCandidate.createCandidate({ contractVersion: '1.0.0', workspaceId: otherWorkspaceId, candidateKey: 'other-candidate', label: 'Khác' });
  await assert.rejects(state.baskets.freezeBasket(request([{ candidateId: created.candidateId, candidateVersion: 1 }])), FlowValidationError);
  const frozen = await state.baskets.freezeBasket(request());
  await assert.rejects(state.baskets.freezeBasket(request([{ candidateId: candidateA, candidateVersion: 1 }])), CandidateBasketIdentityConflictError);
  assert.equal(count(state.db, 'flow_candidate_baskets'), 1n);
  const member = state.db.prepare('SELECT * FROM flow_candidate_basket_members WHERE basket_id=? AND position=0').get(frozen.basketId) as Record<string, unknown>;
  assert.throws(() => state.db.prepare(`
    INSERT INTO flow_candidate_basket_members(
      basket_id, position, candidate_id, candidate_version, candidate_artifact_sha256,
      candidate_key, label, summary, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(frozen.basketId, 2, member.candidate_id, member.candidate_version, member.candidate_artifact_sha256,
    member.candidate_key, member.label, member.summary, member.state), /member_invalid|UNIQUE/);
  assert.throws(() => state.db.prepare(`
    INSERT INTO flow_candidate_basket_members(
      basket_id, position, candidate_id, candidate_version, candidate_artifact_sha256,
      candidate_key, label, summary, state
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(frozen.basketId, 2, created.candidateId, 1,
    (state.db.prepare('SELECT candidate_artifact_sha256 sha FROM flow_product_candidate_revisions WHERE candidate_id=? AND version=1').get(created.candidateId) as { sha: string }).sha,
    'other-candidate', 'Khác', null, 'EXPLORING'), /member_invalid/);
  assert.equal(count(state.db, 'flow_candidate_basket_members'), 2n);
  state.db.close();
});

test('verified replay detects missing, corrupt, noncanonical, and mismatched basket or candidate artifacts', async () => {
  for (const kind of ['basket-missing', 'basket-corrupt', 'basket-noncanonical', 'candidate-missing', 'candidate-corrupt', 'candidate-noncanonical', 'candidate-mismatch'] as const) {
    const state = setup();
    await seed(state);
    const frozen = await state.baskets.freezeBasket(request());
    const basketPath = state.artifacts.pathForDigest(frozen.basketArtifactSha256);
    if (kind === 'basket-missing') {
      fs.rmSync(basketPath);
      await assert.rejects(state.baskets.readBasket(basketId), /ENOENT/);
    } else if (kind === 'basket-corrupt') {
      fs.writeFileSync(basketPath, '{}');
      await assert.rejects(state.baskets.readBasket(basketId), ArtifactIntegrityError);
    } else if (kind === 'basket-noncanonical') {
      const parsed = JSON.parse(fs.readFileSync(basketPath, 'utf8'));
      const noncanonical = Buffer.from(JSON.stringify(parsed, null, 2));
      const stored = await state.artifacts.put(noncanonical);
      state.db.prepare('INSERT INTO artifact_manifests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(stored.sha256, stored.byteSize, 'application/json', stored.relativePath, '2026-09-26T03:00:00Z', '1.0.0', 'active', '2026-09-26T03:00:00Z');
      state.db.exec('DROP TRIGGER flow_candidate_baskets_no_update');
      state.db.prepare('UPDATE flow_candidate_baskets SET basket_artifact_sha256=? WHERE basket_id=?').run(stored.sha256, basketId);
      await assert.rejects(state.baskets.readBasket(basketId), /canonical/);
    } else if (kind === 'candidate-missing' || kind === 'candidate-corrupt' || kind === 'candidate-noncanonical') {
      const candidateSha256 = (state.db.prepare(`
        SELECT candidate_artifact_sha256 sha256 FROM flow_product_candidate_revisions
        WHERE candidate_id = ? AND version = 1
      `).get(candidateA) as { sha256: string }).sha256;
      const candidatePath = state.artifacts.pathForDigest(candidateSha256);
      if (kind === 'candidate-missing') {
        fs.rmSync(candidatePath);
        await assert.rejects(state.baskets.readBasket(basketId), /ENOENT/);
      } else if (kind === 'candidate-corrupt') {
        fs.writeFileSync(candidatePath, '{}');
        await assert.rejects(state.baskets.readBasket(basketId), ArtifactIntegrityError);
      } else {
        const parsed = JSON.parse(fs.readFileSync(candidatePath, 'utf8'));
        const stored = await state.artifacts.put(Buffer.from(JSON.stringify(parsed, null, 2)));
        state.db.prepare('INSERT INTO artifact_manifests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(stored.sha256, stored.byteSize, 'application/json', stored.relativePath, '2026-09-26T03:00:00Z', '1.0.0', 'active', '2026-09-26T03:00:00Z');
        state.db.exec('DROP TRIGGER flow_product_candidate_revisions_no_update');
        state.db.prepare('UPDATE flow_product_candidate_revisions SET candidate_artifact_sha256=? WHERE candidate_id=? AND version=1').run(stored.sha256, candidateA);
        await assert.rejects(state.baskets.readBasket(basketId), /canonical/);
      }
    } else {
      state.db.exec('DROP TRIGGER flow_candidate_basket_members_no_update');
      state.db.prepare("UPDATE flow_candidate_basket_members SET label='tampered' WHERE basket_id=? AND position=0").run(basketId);
      await assert.rejects(state.baskets.readBasket(basketId), CandidateBasketIdentityConflictError);
    }
    state.db.close();
  }
});

test('migration upgrades v13 to v14 once while migrations 0001-0013 remain byte-identical', () => {
  const files = Array.from({ length: 13 }, (_, index) => `migrations/${String(index + 1).padStart(4, '0')}_${[
    'foundation', 'data_packs', 'analysis_results', 'analysis_interpretations', 'research_documents', 'analysis_research_results',
    'analysis_research_audits', 'orchestrator_proposals', 'governance_proposal_decisions', 'flow_authorized_plans',
    'shopee_review_collection', 'source_package_intake', 'discovery_workspaces',
  ][index]}.sql`);
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
    '964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3',
  ];
  assert.deepEqual(files.map((file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex')), priorDigests);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-basket-migration-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of files) fs.copyFileSync(file, path.join(directory, path.basename(file)));
  const databasePath = path.join(root, 'db.sqlite');
  const thirteen = openDatabase({ databasePath, migrationsDirectory: directory }); assert.equal(thirteen.migration.currentVersion, 13); thirteen.db.close();
  fs.copyFileSync('migrations/0014_candidate_baskets.sql', path.join(directory, '0014_candidate_baskets.sql'));
  const fourteen = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(fourteen.migration.applied, [14]); fourteen.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(rerun.migration.applied, []); rerun.db.close();
});

test('basket artifact reuse preserves first-storage acquired_at', async () => {
  const state = setup(); await seed(state);
  const sorted = [candidateA, candidateB];
  const members = await Promise.all(sorted.map(async (id) => {
    const artifact = await state.candidateService.readCandidate(id, 1);
    const sha = (state.db.prepare('SELECT candidate_artifact_sha256 sha FROM flow_product_candidate_revisions WHERE candidate_id=? AND version=1').get(id) as { sha: string }).sha;
    return { candidateId: id, candidateKey: artifact.candidateKey, candidateVersion: 1, candidateArtifactSha256: sha, label: artifact.label, ...(artifact.summary ? { summary: artifact.summary } : {}), state: 'EXPLORING' as const };
  }));
  const canonicalRequest = { ...request(), candidates: [...request().candidates].sort((a, b) => a.candidateId < b.candidateId ? -1 : a.candidateId > b.candidateId ? 1 : 0) };
  const artifact = { contractVersion: '1.0.0', basketId, workspaceId, basketKey: request().basketKey, version: 1, frozenAt: '2026-09-26T02:00:00.000Z', requestSha256: createHash('sha256').update(canonicalJson(canonicalRequest)).digest('hex'), candidates: members };
  const stored = await state.artifacts.put(Buffer.from(canonicalJson(artifact)));
  const firstAt = '2026-09-25T00:00:00Z';
  state.db.prepare('INSERT INTO artifact_manifests VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(stored.sha256, stored.byteSize, 'application/json', stored.relativePath, firstAt, '1.0.0', 'active', firstAt);
  const result = await state.baskets.freezeBasket(request());
  assert.equal(result.basketArtifactSha256, stored.sha256);
  assert.equal((state.db.prepare('SELECT acquired_at value FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as { value: string }).value, firstAt);
  state.db.close();
});
