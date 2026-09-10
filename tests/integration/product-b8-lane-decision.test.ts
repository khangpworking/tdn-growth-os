import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type { ProductB8LaneDecision } from '../../contracts/governance/product-b8-lane-decision.generated.js';
import type { CandidateB7Decision } from '../../contracts/governance/candidate-b7-decision.generated.js';
import type { ProductWorkspaceArtifact } from '../../contracts/flow/product-workspace-artifact.generated.js';
import { FlowProductWorkspaceReader, ProductWorkspaceService, type ProductWorkspaceReader } from '../../src/modules/flow/index.js';
import type { CandidateB7DecisionByIdReader } from '../../src/modules/governance/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import {
  GovernanceProductB8Reader,
  GovernanceValidationError,
  PRODUCT_B8_LANES,
  PRODUCT_B8_REVIEW_CAPABILITY,
  PRODUCT_B8_REVIEW_POLICY_ID,
  ProductB8DecisionIdentityConflictError,
  ProductB8LaneDecisionService,
} from '../../src/modules/governance/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));
const productWorkspaceId = '66666666-6666-4666-8666-666666666666';
const otherWorkspaceId = '66666666-6666-4666-8666-666666666667';
const ids = Array.from({ length: 12 }, (_, index) => `77777777-7777-4777-8777-${String(index + 1).padStart(12, '0')}`);
const actor = { actorId: 'owner:khang', roleSnapshot: 'OWNER', capabilities: new Set<string>([PRODUCT_B8_REVIEW_CAPABILITY]) };

function workspace(id = productWorkspaceId): ProductWorkspaceArtifact {
  return {
    contractVersion: '1.0.0', productWorkspaceId: id, productWorkspaceKey: 'adult-calcium-product',
    state: 'ACTIVE', entryStep: 'B8', title: 'Canxi người lớn tổng hợp', createdAt: '2026-09-28T00:00:00.000Z', requestSha256: '1'.repeat(64),
    source: {
      discoveryWorkspace: { workspaceId: '11111111-1111-4111-8111-111111111111' },
      basket: { basketId: '44444444-4444-4444-8444-444444444444', basketArtifactSha256: 'a'.repeat(64), workspaceId: '11111111-1111-4111-8111-111111111111', basketKey: 'b7-basket', basketVersion: 1 },
      candidate: { candidateId: '22222222-2222-4222-8222-222222222222', candidateVersion: 1, candidateArtifactSha256: 'b'.repeat(64), candidateKey: 'adult-calcium', label: 'Canxi người lớn tổng hợp', summary: 'Ý tưởng tổng hợp.', state: 'EXPLORING' },
      b7Decision: { contractVersion: '1.0.0', decisionId: '55555555-5555-4555-8555-555555555555', decisionArtifactSha256: 'c'.repeat(64), decidedAt: '2026-09-27T00:00:00.000Z', decision: 'PASS', actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' }, requiredCapability: 'governance:candidate-b7-review', policy: { policyId: 'governance:candidate-b7-review-v1', policyVersion: 1 }, requestSha256: 'd'.repeat(64) },
    },
  };
}
class FakeWorkspaceReader implements ProductWorkspaceReader {
  calls: string[] = [];
  constructor(public value: ProductWorkspaceArtifact = workspace(), public error?: Error) {}
  async readVerifiedProductWorkspace(id: string): Promise<ProductWorkspaceArtifact> { this.calls.push(id); if (this.error) throw this.error; return structuredClone(this.value); }
}
function setup(reader = new FakeWorkspaceReader()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-b8-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  let idIndex = 0; let timeIndex = 0;
  const service = new ProductB8LaneDecisionService({
    db, artifactStore: artifacts, productWorkspaceReader: reader,
    configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY },
    uuid: () => ids[idIndex++]!, now: () => new Date(Date.UTC(2026, 8, 29, 0, 0, timeIndex++)),
  });
  return { root, db, artifacts, reader, service };
}
function request(lane: ProductB8LaneDecision['lane'] = 'LEGAL', expectedVersion = 0, decision: ProductB8LaneDecision['decision'] = 'PASS') { return { contractVersion: '1.0.0', productWorkspaceId, lane, expectedVersion, decision } as const; }
function count(state: ReturnType<typeof setup>, table = 'governance_product_b8_lane_decisions'): bigint { return (state.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint }).n; }
function digest(value: unknown): string { return createHash('sha256').update(Buffer.from(canonicalJson(value))).digest('hex'); }

for (const lane of PRODUCT_B8_LANES) test(`${lane} accepts all button states in independent synthetic history`, async () => {
  const state = setup();
  const pass = await state.service.decide(request(lane, 0, 'PASS'), actor);
  const hold = await state.service.decide(request(lane, 1, 'HOLD'), actor);
  const reject = await state.service.decide(request(lane, 2, 'REJECT'), actor);
  assert.deepEqual([pass.decisionVersion, hold.decisionVersion, reject.decisionVersion], [1, 2, 3]);
  assert.deepEqual([pass.decision, hold.decision, reject.decision], ['PASS', 'HOLD', 'REJECT']);
  const replay = await state.service.replay(pass.decisionId);
  assert.equal(replay.productWorkspace.productWorkspaceArtifactSha256, digest(workspace()));
  assert.equal(replay.productWorkspace.productWorkspaceKey, workspace().productWorkspaceKey);
  assert.deepEqual(replay.productWorkspace.source, workspace().source);
  state.db.close();
});

test('invalid lane/decision and closed free-text, specialist, evidence, attachment and AI fields reject before workspace access or writes', async () => {
  const variants: unknown[] = [
    { ...request(), lane: 'SAFETY' }, { ...request(), decision: 'APPROVE' },
    ...['reason', 'rationale', 'notes', 'explanation', 'evidence', 'evidenceReferences', 'attachment', 'attachments', 'reviewerName', 'specialist', 'aiText'].map((field) => ({ ...request(), [field]: 'forbidden' })),
  ];
  for (const value of variants) { const state = setup(); await assert.rejects(state.service.decide(value, actor), GovernanceValidationError); assert.equal(state.reader.calls.length, 0); assert.equal(count(state), 0n); state.db.close(); }
});

test('OWNER and capability authorization happen before workspace reads and writes; AI cannot submit', async () => {
  const actors = [
    { ...actor, roleSnapshot: 'SPECIALIST' }, { ...actor, capabilities: new Set<string>() },
    { ...actor, actorId: 'ai:agent', roleSnapshot: 'AI' }, { ...actor, capabilities: ['governance:product-b8-review'] as unknown as Set<string> },
  ];
  for (const value of actors) { const state = setup(); await assert.rejects(state.service.decide(request(), value), GovernanceValidationError); assert.equal(state.reader.calls.length, 0); assert.equal(count(state), 0n); assert.equal(count(state, 'artifact_manifests'), 0n); state.db.close(); }
});

test('wrong, missing, corrupt, noncanonical, inactive, or wrong-step workspace fails closed before decision writes', async () => {
  const variants = [
    new FakeWorkspaceReader(workspace(otherWorkspaceId)),
    new FakeWorkspaceReader(workspace(), new Error('missing workspace')),
    new FakeWorkspaceReader({} as ProductWorkspaceArtifact),
    new FakeWorkspaceReader({ ...workspace(), state: 'ARCHIVED' as 'ACTIVE' }),
    new FakeWorkspaceReader({ ...workspace(), entryStep: 'B9' as 'B8' }),
  ];
  for (const reader of variants) { const state = setup(reader); await assert.rejects(state.service.decide(request(), actor)); assert.equal(count(state), 0n); assert.equal(count(state, 'artifact_manifests'), 0n); state.db.close(); }
});

test('versions are sequential; optimistic concurrency, changed-content reuse, and repeated effective state fail closed', async () => {
  const state = setup();
  await state.service.decide(request('LEGAL', 0, 'PASS'), actor);
  await assert.rejects(state.service.decide(request('LEGAL', 2, 'HOLD'), actor), ProductB8DecisionIdentityConflictError);
  await assert.rejects(state.service.decide(request('LEGAL', 0, 'HOLD'), actor), ProductB8DecisionIdentityConflictError);
  await assert.rejects(state.service.decide(request('LEGAL', 1, 'PASS'), actor), /must change/);
  assert.equal(count(state), 1n); state.db.close();
});

test('exact retry deduplicates with zero mutations and verifies exact replay', async () => {
  const state = setup(); const first = await state.service.decide(request(), actor);
  const before = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
  const retry = await state.service.decide(request(), actor);
  const after = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
  assert.deepEqual(retry, { ...first, deduplicated: true, databaseMutations: 0 }); assert.equal(after, before);
  assert.equal((await state.service.replay(first.decisionId)).decisionId, first.decisionId); state.db.close();
});

test('historical rows are immutable; exact artifacts replay and detect missing, corrupt, noncanonical, manifest, row, or workspace identity drift', async () => {
  for (const mode of ['missing', 'corrupt', 'noncanonical', 'manifest', 'row', 'workspace'] as const) {
    const reader = new FakeWorkspaceReader(); const state = setup(reader); const result = await state.service.decide(request(), actor);
    const artifactPath = state.artifacts.pathForDigest(result.decisionArtifactSha256);
    if (mode === 'missing') fs.rmSync(artifactPath);
    if (mode === 'corrupt') fs.writeFileSync(artifactPath, '{}');
    if (mode === 'noncanonical') { const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')); const data = Buffer.from(JSON.stringify(parsed, null, 2)); const sha = createHash('sha256').update(data).digest('hex'); const target = state.artifacts.pathForDigest(sha); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); state.db.exec('DROP TRIGGER governance_product_b8_lane_decisions_no_update'); state.db.prepare('INSERT INTO artifact_manifests SELECT ?,?,media_type,?,acquired_at,contract_version,retention_status,created_at FROM artifact_manifests WHERE sha256=?').run(sha, data.length, `sha256/${sha.slice(0, 2)}/${sha}`, result.decisionArtifactSha256); state.db.prepare('UPDATE governance_product_b8_lane_decisions SET decision_artifact_sha256=?').run(sha); }
    if (mode === 'manifest') state.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run('text/plain', result.decisionArtifactSha256);
    if (mode === 'row') { state.db.exec('DROP TRIGGER governance_product_b8_lane_decisions_no_update'); state.db.prepare("UPDATE governance_product_b8_lane_decisions SET actor_id='owner:other'").run(); }
    if (mode === 'workspace') reader.value = { ...workspace(), title: 'Changed verified workspace' };
    await assert.rejects(state.service.replay(result.decisionId)); state.db.close();
  }
  const state = setup(); await state.service.decide(request(), actor);
  assert.throws(() => state.db.prepare("UPDATE governance_product_b8_lane_decisions SET decision='HOLD'").run(), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM governance_product_b8_lane_decisions').run(), /immutable/); state.db.close();
});

test('deterministic status is false for missing/HOLD/REJECT and true only for four PASS; a revision changes readiness without rewriting history', async () => {
  const state = setup(); const reader = new GovernanceProductB8Reader(state.service);
  const empty = await reader.readStatus(productWorkspaceId);
  assert.deepEqual(empty.lanes.map((lane) => lane.lane), [...PRODUCT_B8_LANES]); assert.ok(empty.lanes.every((lane) => lane.effectiveState === 'NO_DECISION')); assert.equal(empty.readyForB9, false);
  const receipts = [];
  for (const lane of PRODUCT_B8_LANES) receipts.push(await state.service.decide(request(lane, 0, lane === 'FINANCE' ? 'HOLD' : 'PASS'), actor));
  const hold = await reader.readStatus(productWorkspaceId); assert.equal(hold.readyForB9, false); assert.equal(hold.lanes[3]!.effectiveState, 'HOLD');
  const rejected = await state.service.decide(request('FINANCE', 1, 'REJECT'), actor); assert.equal((await reader.readStatus(productWorkspaceId)).readyForB9, false);
  const passed = await state.service.decide(request('FINANCE', 2, 'PASS'), actor); const ready = await reader.readStatus(productWorkspaceId);
  assert.equal(ready.readyForB9, true); assert.deepEqual(ready.lanes.map((lane) => lane.effectiveState), ['PASS', 'PASS', 'PASS', 'PASS']);
  assert.equal((await reader.readVerifiedDecision(receipts[3]!.decisionId)).decision, 'HOLD'); assert.equal((await reader.readVerifiedDecision(rejected.decisionId)).decision, 'REJECT'); assert.equal((await reader.readVerifiedDecision(passed.decisionId)).decision, 'PASS');
  assert.equal(count(state), 6n); assert.equal(count(state, 'flow_product_workspaces'), 0n); assert.equal(state.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%b9%'").get() && (state.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%b9%'").get() as { n: bigint }).n, 0n); state.db.close();
});

test('migration v16→v17 applies once, reruns idempotently, migrations 0001–0016 are unchanged, and Box 5 has no direct Box 4 SQL/FK', () => {
  const expected = ['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46','a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d','e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88','18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848','f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb','c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65','1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca','964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3','cd0c9cd3fe37f4847a2ee0690b6f4151783dd4adca5ddbb83d79f9cb874d9c03','0cdccfbaa7e60bc423126977cf2e545e4025454c2006fd1b92d3e24bc473dae1','9e8daf707e2a913d60610690fcab57c178f2facd0883e45bc53dd72a30284c72'];
  for (let version = 1; version <= 16; version++) { const file = fs.readdirSync('migrations').find((name) => name.startsWith(String(version).padStart(4, '0')))!; assert.equal(createHash('sha256').update(fs.readFileSync(path.join('migrations', file))).digest('hex'), expected[version - 1]); }
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-b8-migration-')); roots.push(root); const directory = path.join(root, 'migrations'); fs.mkdirSync(directory);
  for (const file of fs.readdirSync('migrations').filter((name) => /^00(0[1-9]|1[0-6])_/.test(name))) fs.copyFileSync(path.join('migrations', file), path.join(directory, file));
  const databasePath = path.join(root, 'db.sqlite'); const sixteen = openDatabase({ databasePath, migrationsDirectory: directory }); assert.equal(sixteen.migration.currentVersion, 16); sixteen.db.close();
  fs.copyFileSync('migrations/0017_product_b8_lane_decisions.sql', path.join(directory, '0017_product_b8_lane_decisions.sql')); const seventeen = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(seventeen.migration.applied, [17]); seventeen.db.close(); const rerun = openDatabase({ databasePath, migrationsDirectory: directory }); assert.deepEqual(rerun.migration.applied, []); assert.equal(rerun.migration.currentVersion, 17); rerun.db.close();
  for (const file of ['migrations/0017_product_b8_lane_decisions.sql', 'src/modules/governance/product-b8-lane-decision-service.ts']) { const text = fs.readFileSync(file, 'utf8'); assert.doesNotMatch(text, /flow_product_workspaces/i); assert.doesNotMatch(text, /REFERENCES\s+flow_/i); }
});

test('reused decision artifact preserves first-storage acquired_at', async () => {
  const state = setup(); const ws = workspace(); const workspaceSha = digest(ws); const req = request(); const requestSha256 = digest({ request: req, productWorkspaceArtifactSha256: workspaceSha, actor: { actorId: actor.actorId, roleSnapshot: 'OWNER' }, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY, policy: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1 } });
  const envelope: ProductB8LaneDecision = { contractVersion: '1.0.0', decisionId: ids[0]!, decisionVersion: 1, decidedAt: '2026-09-29T00:00:00.000Z', lane: 'LEGAL', decision: 'PASS', productWorkspace: { productWorkspaceId, productWorkspaceArtifactSha256: workspaceSha, productWorkspaceKey: ws.productWorkspaceKey, state: 'ACTIVE', entryStep: 'B8', title: ws.title, source: ws.source }, actor: { actorId: actor.actorId, roleSnapshot: 'OWNER' }, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY, policy: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1 }, requestSha256 };
  const stored = await state.artifacts.put(Buffer.from(canonicalJson(envelope))); state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2000-01-01T00:00:00.000Z','1.0.0','active','2000-01-01T00:00:00.000Z')").run(stored.sha256, stored.byteSize, stored.relativePath);
  await state.service.decide(req, actor); assert.equal((state.db.prepare('SELECT acquired_at value FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as { value: string }).value, '2000-01-01T00:00:00.000Z'); state.db.close();
});

test('synthetic four-gate acceptance uses a verified persisted product workspace without mutating it or creating B9 state', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-b8-acceptance-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const sourceDecision: CandidateB7Decision = {
    contractVersion: '1.0.0', decisionId: '55555555-5555-4555-8555-555555555555', decidedAt: '2026-09-27T00:00:00.000Z',
    basket: { basketId: '44444444-4444-4444-8444-444444444444', basketArtifactSha256: 'a'.repeat(64), workspaceId: '11111111-1111-4111-8111-111111111111', basketKey: 'b7-basket', basketVersion: 1 },
    candidate: { candidateId: '22222222-2222-4222-8222-222222222222', candidateVersion: 1, candidateArtifactSha256: 'b'.repeat(64), candidateKey: 'adult-calcium', label: 'Canxi người lớn tổng hợp', summary: 'Ý tưởng tổng hợp.', state: 'EXPLORING' },
    decision: 'PASS', actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' }, requiredCapability: 'governance:candidate-b7-review', policy: { policyId: 'governance:candidate-b7-review-v1', policyVersion: 1 }, requestSha256: 'd'.repeat(64),
  };
  const decisionReader: CandidateB7DecisionByIdReader = { async readVerifiedDecision() { return structuredClone(sourceDecision); } };
  const productWorkspaces = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader, uuid: () => productWorkspaceId, now: () => new Date('2026-09-28T00:00:00Z') });
  await productWorkspaces.createWorkspace({ contractVersion: '1.0.0', decisionId: sourceDecision.decisionId, productWorkspaceKey: 'adult-calcium-product' });
  const before = db.prepare('SELECT * FROM flow_product_workspaces WHERE product_workspace_id=?').get(productWorkspaceId);
  let index = 0;
  const b8 = new ProductB8LaneDecisionService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(productWorkspaces), configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY }, uuid: () => ids[index++]!, now: () => new Date(Date.UTC(2026, 8, 29, 0, 0, index)) });
  for (const lane of PRODUCT_B8_LANES) await b8.decide(request(lane), actor);
  const status = await b8.readStatus(productWorkspaceId);
  assert.equal(status.readyForB9, true); assert.deepEqual(status.lanes.map((lane) => lane.lane), [...PRODUCT_B8_LANES]);
  assert.deepEqual(db.prepare('SELECT * FROM flow_product_workspaces WHERE product_workspace_id=?').get(productWorkspaceId), before);
  assert.equal((db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%b9%'").get() as { n: bigint }).n, 0n);
  assert.equal((db.prepare('SELECT count(*) n FROM governance_product_b8_lane_decisions').get() as { n: bigint }).n, 4n);
  db.close();
});
