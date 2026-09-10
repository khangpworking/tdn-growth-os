import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type { CandidateB7Decision } from '../../contracts/governance/candidate-b7-decision.generated.js';
import {
  CANDIDATE_B7_DECISION_CAPABILITY,
  CANDIDATE_B7_DECISION_POLICY_ID,
  CandidateB7DecisionService,
  GovernanceCandidateB7DecisionReader,
  type CandidateB7DecisionByIdReader,
} from '../../src/modules/governance/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import {
  CandidateBasketService,
  DiscoveryWorkspaceService,
  FlowCandidateBasketReader,
  FlowDiscoveryWorkspaceReader,
  FlowProductCandidateReader,
  FlowProductWorkspaceReader,
  FlowValidationError,
  ProductCandidateService,
  ProductWorkspaceIdentityConflictError,
  ProductWorkspaceService,
} from '../../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));

const workspaceId = '11111111-1111-4111-8111-111111111111';
const candidateId = '22222222-2222-4222-8222-222222222222';
const basketId = '44444444-4444-4444-8444-444444444444';
const decisionId = '55555555-5555-4555-8555-555555555555';
const otherDecisionId = '55555555-5555-4555-8555-555555555556';
const productWorkspaceId = '66666666-6666-4666-8666-666666666666';
const request = { contractVersion: '1.0.0', decisionId, productWorkspaceKey: 'adult-calcium-product' } as const;

function decision(id = decisionId, value: CandidateB7Decision['decision'] = 'PASS'): CandidateB7Decision {
  return {
    contractVersion: '1.0.0', decisionId: id, decidedAt: '2026-09-27T00:00:00.000Z',
    basket: { basketId, basketArtifactSha256: 'a'.repeat(64), workspaceId, basketKey: 'b7-basket', basketVersion: 3 },
    candidate: { candidateId, candidateVersion: 2, candidateArtifactSha256: 'b'.repeat(64), candidateKey: 'adult-calcium', label: 'Canxi người lớn tổng hợp', summary: 'Ý tưởng canxi tổng hợp cho người lớn.', state: 'EXPLORING' },
    decision: value,
    actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' },
    requiredCapability: 'governance:candidate-b7-review',
    policy: { policyId: 'governance:candidate-b7-review-v1', policyVersion: 1 },
    requestSha256: 'c'.repeat(64),
  };
}

class FakeDecisionReader implements CandidateB7DecisionByIdReader {
  calls: string[] = [];
  values = new Map<string, CandidateB7Decision>();
  constructor(value: CandidateB7Decision = decision()) { this.values.set(value.decisionId, value); }
  async readVerifiedDecision(id: string): Promise<CandidateB7Decision> {
    this.calls.push(id);
    const value = this.values.get(id) ?? this.values.values().next().value;
    if (!value) throw new Error('missing synthetic decision');
    return structuredClone(value);
  }
}

function setup(reader = new FakeDecisionReader(), id = productWorkspaceId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-product-workspace-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifactRoot = path.join(root, 'artifacts');
  const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const service = new ProductWorkspaceService({
    db, artifactStore: artifacts, decisionReader: reader,
    uuid: () => id, now: () => new Date('2026-09-28T00:00:00Z'),
  });
  return { root, db, artifactRoot, artifacts, service, reader };
}
function count(db: ReturnType<typeof setup>['db'], table = 'flow_product_workspaces'): bigint {
  return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count;
}
function digest(value: unknown): string { return createHash('sha256').update(Buffer.from(canonicalJson(value))).digest('hex'); }

 test('synthetic OWNER PASS creates one frozen independent ACTIVE/B8 workspace through exact decision-ID reader', async () => {
  const state = setup();
  const result = await state.service.createWorkspace(request);
  assert.deepEqual(result, {
    productWorkspaceId, productWorkspaceArtifactSha256: result.productWorkspaceArtifactSha256,
    state: 'ACTIVE', entryStep: 'B8', deduplicated: false, databaseMutations: 2,
  });
  assert.deepEqual(state.reader.calls, [decisionId]);
  const artifact = await new FlowProductWorkspaceReader(state.service).readVerifiedProductWorkspace(productWorkspaceId);
  assert.equal(artifact.title, 'Canxi người lớn tổng hợp');
  assert.equal(artifact.source.discoveryWorkspace.workspaceId, workspaceId);
  assert.deepEqual(artifact.source.basket, decision().basket);
  assert.deepEqual(artifact.source.candidate, decision().candidate);
  assert.equal(artifact.source.b7Decision.decisionArtifactSha256, digest(decision()));
  assert.equal(artifact.source.b7Decision.decision, 'PASS');
  assert.deepEqual(artifact.source.b7Decision.actor, { actorId: 'owner:khang', roleSnapshot: 'OWNER' });
  assert.equal(artifact.source.b7Decision.policy.policyId, 'governance:candidate-b7-review-v1');
  assert.equal(artifact.source.candidate.summary, 'Ý tưởng canxi tổng hợp cho người lớn.');
  assert.equal((state.db.prepare('SELECT source_candidate_summary summary FROM flow_product_workspaces').get() as { summary: string }).summary, 'Ý tưởng canxi tổng hợp cho người lớn.');
  assert.equal(count(state.db), 1n);
  state.db.close();
});

test('closed request rejects every caller-controlled source, content, state, step, governance, and AI field before reader or writes', async () => {
  for (const field of ['candidateId', 'basketId', 'title', 'summary', 'state', 'entryStep', 'actor', 'policy', 'notes', 'aiSuggestion']) {
    const state = setup();
    await assert.rejects(state.service.createWorkspace({ ...request, [field]: 'forbidden' }), FlowValidationError);
    assert.equal(state.reader.calls.length, 0); assert.equal(count(state.db), 0n); assert.equal(count(state.db, 'artifact_manifests'), 0n);
    state.db.close();
  }
});

test('HOLD and REJECT fail before artifact-store and database writes', async () => {
  for (const value of ['HOLD', 'REJECT'] as const) {
    const state = setup(new FakeDecisionReader(decision(decisionId, value)));
    await assert.rejects(state.service.createWorkspace(request), /must be PASS/);
    assert.equal(count(state.db), 0n); assert.equal(count(state.db, 'artifact_manifests'), 0n);
    assert.equal(fs.existsSync(state.artifactRoot), false);
    state.db.close();
  }
});

test('wrong decision ID and malformed or unauthorized fake-reader values fail closed before writes', async () => {
  const variants: unknown[] = [
    decision(otherDecisionId),
    { ...decision(), decision: 'PASS', actor: { actorId: 'owner:khang', roleSnapshot: 'STAFF' } },
    { ...decision(), requiredCapability: 'governance:other' },
    { ...decision(), candidate: { ...decision().candidate, state: 'ARCHIVED' } },
    { ...decision(), surprise: true },
  ];
  for (const value of variants) {
    const reader = new FakeDecisionReader(); reader.values.set(decisionId, value as CandidateB7Decision);
    const state = setup(reader);
    await assert.rejects(state.service.createWorkspace(request));
    assert.equal(count(state.db), 0n); assert.equal(count(state.db, 'artifact_manifests'), 0n);
    state.db.close();
  }
});

test('exact retry verifies replay and makes zero database changes', async () => {
  const state = setup(); const first = await state.service.createWorkspace(request);
  const before = (state.db.prepare('SELECT total_changes() value').get() as { value: bigint }).value;
  const retry = await state.service.createWorkspace(request);
  const after = (state.db.prepare('SELECT total_changes() value').get() as { value: bigint }).value;
  assert.deepEqual(retry, { ...first, deduplicated: true, databaseMutations: 0 });
  assert.equal(after, before); assert.equal(count(state.db), 1n); assert.equal(count(state.db, 'artifact_manifests'), 1n);
  state.db.close();
});

test('workspace key and exact PASS decision identities conflict independently', async () => {
  const reader = new FakeDecisionReader(); reader.values.set(otherDecisionId, decision(otherDecisionId));
  const state = setup(reader); await state.service.createWorkspace(request);
  await assert.rejects(
    state.service.createWorkspace({ ...request, decisionId: otherDecisionId }),
    ProductWorkspaceIdentityConflictError,
  );
  await assert.rejects(
    state.service.createWorkspace({ ...request, productWorkspaceKey: 'changed-product-key' }),
    ProductWorkspaceIdentityConflictError,
  );
  assert.equal(count(state.db), 1n); state.db.close();
});

test('product workspace and source candidate rows remain immutable and isolated', async () => {
  const state = setup(); await state.service.createWorkspace(request);
  assert.throws(() => state.db.prepare('UPDATE flow_product_workspaces SET title=?').run('changed'), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_product_workspaces').run(), /immutable/);
  assert.equal(count(state.db, 'flow_product_candidates'), 0n, 'product-workspace creation does not mutate discovery candidates');
  state.db.close();
});

test('replay rejects missing, corrupt, manifest-mismatched, row-mismatched, and changed verified source state', async () => {
  for (const mode of ['missing', 'corrupt', 'manifest', 'row', 'source'] as const) {
    const reader = new FakeDecisionReader(); const state = setup(reader); const result = await state.service.createWorkspace(request);
    const artifactPath = state.artifacts.pathForDigest(result.productWorkspaceArtifactSha256);
    if (mode === 'missing') fs.rmSync(artifactPath);
    if (mode === 'corrupt') fs.writeFileSync(artifactPath, '{}');
    if (mode === 'manifest') state.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run('text/plain', result.productWorkspaceArtifactSha256);
    if (mode === 'row') { state.db.exec('DROP TRIGGER flow_product_workspaces_no_update'); state.db.prepare('UPDATE flow_product_workspaces SET source_candidate_summary=?').run('Changed persisted summary'); }
    if (mode === 'source') reader.values.set(decisionId, { ...decision(), candidate: { ...decision().candidate, summary: 'Changed verified summary' } });
    await assert.rejects(state.service.replay(productWorkspaceId)); state.db.close();
  }
});

test('replay rejects a valid-digest but noncanonical product workspace artifact', async () => {
  const state = setup(); const result = await state.service.createWorkspace(request);
  const original = JSON.parse(fs.readFileSync(state.artifacts.pathForDigest(result.productWorkspaceArtifactSha256), 'utf8'));
  const noncanonical = Buffer.from(JSON.stringify(original, null, 2));
  const newSha = createHash('sha256').update(noncanonical).digest('hex');
  const newPath = state.artifacts.pathForDigest(newSha); fs.mkdirSync(path.dirname(newPath), { recursive: true }); fs.writeFileSync(newPath, noncanonical);
  state.db.exec('DROP TRIGGER flow_product_workspaces_no_update');
  state.db.prepare('INSERT INTO artifact_manifests SELECT ?, ?, media_type, ?, acquired_at, contract_version, retention_status, created_at FROM artifact_manifests WHERE sha256=?')
    .run(newSha, noncanonical.length, `sha256/${newSha.slice(0, 2)}/${newSha}`, result.productWorkspaceArtifactSha256);
  state.db.prepare('UPDATE flow_product_workspaces SET product_workspace_artifact_sha256=?').run(newSha);
  await assert.rejects(state.service.replay(productWorkspaceId), /canonical/); state.db.close();
});

test('reused workspace artifact preserves first-storage acquired_at', async () => {
  const state = setup();
  const sourceDecision = decision();
  const source = {
    discoveryWorkspace: { workspaceId }, basket: sourceDecision.basket, candidate: sourceDecision.candidate,
    b7Decision: {
      contractVersion: '1.0.0', decisionId, decisionArtifactSha256: digest(sourceDecision),
      decidedAt: sourceDecision.decidedAt, decision: 'PASS', actor: sourceDecision.actor,
      requiredCapability: sourceDecision.requiredCapability, policy: sourceDecision.policy,
      requestSha256: sourceDecision.requestSha256,
    },
  } as const;
  const artifact = {
    contractVersion: '1.0.0', productWorkspaceId, productWorkspaceKey: request.productWorkspaceKey,
    state: 'ACTIVE', entryStep: 'B8', title: sourceDecision.candidate.label,
    createdAt: '2026-09-28T00:00:00.000Z', requestSha256: digest(request), source,
  } as const;
  const stored = await state.artifacts.put(Buffer.from(canonicalJson(artifact)));
  state.db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at)
    VALUES (?,?,'application/json',?,'2020-01-01T00:00:00.000Z','1.0.0','active','2020-01-01T00:00:00.000Z')`)
    .run(stored.sha256, stored.byteSize, stored.relativePath);
  await state.service.createWorkspace(request);
  const acquiredAt = (state.db.prepare('SELECT acquired_at acquiredAt FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as { acquiredAt: string }).acquiredAt;
  assert.equal(acquiredAt, '2020-01-01T00:00:00.000Z'); state.db.close();
});

test('migration v15 to v16 is idempotent, migrations 0001-0015 are unchanged, and Box 4 has no Governance SQL or FK', () => {
  const hashes = [
    'cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46',
    'a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d',
    'e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88',
    '18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848',
    'f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb',
    'c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65','1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca',
    '964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3','cd0c9cd3fe37f4847a2ee0690b6f4151783dd4adca5ddbb83d79f9cb874d9c03',
    '0cdccfbaa7e60bc423126977cf2e545e4025454c2006fd1b92d3e24bc473dae1',
  ];
  for (let version = 1; version <= 15; version++) {
    const file = fs.readdirSync('migrations').find((name) => name.startsWith(String(version).padStart(4, '0')))!;
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join('migrations', file))).digest('hex'), hashes[version - 1]);
  }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-product-workspace-migration-')); roots.push(root);
  const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of fs.readdirSync('migrations').filter((name) => /^00(0[1-9]|1[0-5])_/.test(name))) fs.copyFileSync(path.join('migrations', file), path.join(directory, file));
  const databasePath = path.join(root, 'db.sqlite'); const fifteen = openDatabase({ databasePath, migrationsDirectory: directory }); assert.equal(fifteen.migration.currentVersion, 15); fifteen.db.close();
  fs.copyFileSync('migrations/0016_product_workspaces.sql', path.join(directory, '0016_product_workspaces.sql'));
  const sixteen = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(sixteen.migration.applied, [16]); sixteen.db.close();
  const rerun = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 16); rerun.db.close();
  for (const file of ['migrations/0016_product_workspaces.sql', 'src/modules/flow/product-workspace-service.ts']) {
    const content = fs.readFileSync(file, 'utf8'); assert.doesNotMatch(content, /governance_candidate_b7_decisions/i); assert.doesNotMatch(content, /REFERENCES\s+governance_/i);
  }
});

test('product workspace preserves absence of candidate summary as absence and persists SQL NULL', async () => {
  const sourceDecision = decision();
  delete sourceDecision.candidate.summary;
  const state = setup(new FakeDecisionReader(sourceDecision));
  const result = await state.service.createWorkspace(request);
  const artifact = await state.service.replay(result.productWorkspaceId);
  assert.equal('summary' in artifact.source.candidate, false);
  assert.equal((state.db.prepare('SELECT source_candidate_summary summary FROM flow_product_workspaces').get() as { summary: null }).summary, null);
  state.db.close();
});

test('summary is frozen candidate version → basket → B7 PASS → product workspace despite a later candidate revision', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-product-workspace-lineage-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const workspaces = new DiscoveryWorkspaceService({
    db, artifactStore: artifacts, uuid: () => workspaceId, now: () => new Date('2026-09-25T00:00:00Z'),
  });
  const candidates = new ProductCandidateService({
    db, artifactStore: artifacts, uuid: () => candidateId, now: () => new Date('2026-09-25T01:00:00Z'),
  });
  const baskets = new CandidateBasketService({
    db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces),
    candidateReader: new FlowProductCandidateReader(candidates),
    uuid: () => basketId, now: () => new Date('2026-09-26T00:00:00Z'),
  });
  const decisions = new CandidateB7DecisionService({
    db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets),
    configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY },
    uuid: () => decisionId, now: () => new Date('2026-09-27T00:00:00Z'),
  });
  const productWorkspaces = new ProductWorkspaceService({
    db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(decisions),
    uuid: () => productWorkspaceId, now: () => new Date('2026-09-28T00:00:00Z'),
  });
  const originalSummary = 'Canxi dạng viên cho người lớn cần thông tin sử dụng rõ ràng.';
  await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-calcium-market', title: 'Thị trường canxi tổng hợp' });
  await candidates.createCandidate({
    contractVersion: '1.0.0', workspaceId, candidateKey: 'adult-calcium',
    label: 'Canxi người lớn tổng hợp', summary: originalSummary,
  });
  await baskets.freezeBasket({
    contractVersion: '1.0.0', workspaceId, basketKey: 'b7-basket', version: 1,
    candidates: [{ candidateId, candidateVersion: 1 }],
  });
  await decisions.decide(
    { contractVersion: '1.0.0', basketId, candidateId, candidateVersion: 1, decision: 'PASS' },
    { actorId: 'owner:khang', roleSnapshot: 'OWNER', capabilities: new Set([CANDIDATE_B7_DECISION_CAPABILITY]) },
  );
  await productWorkspaces.createWorkspace(request);

  assert.equal((await baskets.readBasket(basketId)).candidates[0]!.summary, originalSummary);
  assert.equal((await decisions.replay(decisionId)).candidate.summary, originalSummary);
  assert.equal((await productWorkspaces.replay(productWorkspaceId)).source.candidate.summary, originalSummary);

  await candidates.reviseCandidate({
    contractVersion: '1.0.0', candidateId, expectedVersion: 1,
    label: 'Canxi người lớn tổng hợp', summary: 'Bản sửa đổi sau khi các snapshot đã được đóng băng.',
  });
  assert.equal((await candidates.readCandidate(candidateId, 2)).summary, 'Bản sửa đổi sau khi các snapshot đã được đóng băng.');
  assert.equal((await baskets.readBasket(basketId)).candidates[0]!.summary, originalSummary);
  assert.equal((await decisions.replay(decisionId)).candidate.summary, originalSummary);
  assert.equal((await productWorkspaces.replay(productWorkspaceId)).source.candidate.summary, originalSummary);
  db.close();
});
