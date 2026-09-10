import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type { CandidateBasketArtifact } from '../../contracts/flow/candidate-basket-artifact.generated.js';
import type { CandidateBasketReader } from '../../src/modules/flow/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import { CANDIDATE_B7_DECISION_CAPABILITY, CANDIDATE_B7_DECISION_POLICY_ID, CandidateB7DecisionIdentityConflictError, CandidateB7DecisionService, GovernanceCandidateB7DecisionReader, GovernanceValidationError } from '../../src/modules/governance/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));
const basketId = '44444444-4444-4444-8444-444444444444';
const otherBasketId = '44444444-4444-4444-8444-444444444445';
const candidateId = '22222222-2222-4222-8222-222222222222';
const decisionId = '55555555-5555-4555-8555-555555555555';
const actor = { actorId: 'owner:khang', roleSnapshot: 'OWNER', capabilities: new Set<string>([CANDIDATE_B7_DECISION_CAPABILITY]) };
const basket: CandidateBasketArtifact = {
  contractVersion: '1.0.0', basketId, workspaceId: '11111111-1111-4111-8111-111111111111', basketKey: 'b7-basket', version: 3,
  frozenAt: '2026-09-26T00:00:00.000Z', requestSha256: 'a'.repeat(64),
  candidates: [{ candidateId, candidateKey: 'adult-calcium', candidateVersion: 2, candidateArtifactSha256: 'b'.repeat(64), label: 'Adult calcium', state: 'EXPLORING' }],
};
const request = { contractVersion: '1.0.0', basketId, candidateId, candidateVersion: 2, decision: 'PASS' } as const;
class FakeBasketReader implements CandidateBasketReader {
  calls = 0;
  constructor(public value: CandidateBasketArtifact = basket) {}
  async readVerifiedBasket(): Promise<CandidateBasketArtifact> { this.calls += 1; return structuredClone(this.value); }
}
function setup(reader = new FakeBasketReader(), id = decisionId) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-b7-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const decisions = new CandidateB7DecisionService({ db, artifactStore: artifacts, basketReader: reader, configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY }, uuid: () => id, now: () => new Date('2026-09-27T00:00:00Z') });
  return { root, db, artifacts, decisions, reader };
}
function count(db: ReturnType<typeof setup>['db'], table = 'governance_candidate_b7_decisions'): bigint { return (db.prepare(`SELECT count(*) count FROM ${table}`).get() as { count: bigint }).count; }

for (const decision of ['PASS', 'HOLD', 'REJECT'] as const) test(`OWNER with capability submits ${decision} in an independent synthetic fixture`, async () => {
  const state = setup(new FakeBasketReader(), decision === 'PASS' ? decisionId : decision === 'HOLD' ? '55555555-5555-4555-8555-555555555556' : '55555555-5555-4555-8555-555555555557');
  const result = await state.decisions.decide({ ...request, decision }, actor);
  assert.equal(result.decision, decision); assert.equal(result.databaseMutations, 2);
  const artifact = await state.decisions.replay(result.decisionId);
  assert.equal(artifact.actor.roleSnapshot, 'OWNER'); assert.equal(artifact.requiredCapability, 'governance:candidate-b7-review');
  assert.equal(artifact.candidate.state, 'EXPLORING'); assert.equal(artifact.candidate.candidateArtifactSha256, 'b'.repeat(64));
  assert.equal('rationale' in artifact, false); state.db.close();
});

test('missing capability and non-owner are separately rejected before basket calls or writes; capability Set values are validated', async () => {
  for (const badActor of [
    { ...actor, capabilities: new Set<string>() },
    { ...actor, roleSnapshot: 'STAFF' },
    { ...actor, capabilities: new Set<string>([CANDIDATE_B7_DECISION_CAPABILITY, ' bad']) },
  ]) {
    const state = setup();
    await assert.rejects(state.decisions.decide(request, badActor), GovernanceValidationError);
    assert.equal(state.reader.calls, 0); assert.equal(count(state.db), 0n); assert.equal(count(state.db, 'artifact_manifests'), 0n); state.db.close();
  }
});

test('closed five-field request rejects rationale, reason, notes, explanation, and AI fields', async () => {
  for (const field of ['rationale', 'reason', 'notes', 'explanation', 'aiSuggestion']) {
    const state = setup(); await assert.rejects(state.decisions.decide({ ...request, [field]: 'forbidden' }, actor), GovernanceValidationError);
    assert.equal(state.reader.calls, 0); assert.equal(count(state.db), 0n); state.db.close();
  }
});

test('exact basket identity, member ID/version/state/digest fail closed', async () => {
  const variants: CandidateBasketArtifact[] = [
    { ...basket, basketId: otherBasketId },
    { ...basket, candidates: [{ ...basket.candidates[0]!, candidateId: '33333333-3333-4333-8333-333333333333' }] },
    { ...basket, candidates: [{ ...basket.candidates[0]!, candidateVersion: 3 }] },
    { ...basket, candidates: [{ ...basket.candidates[0]!, state: 'ARCHIVED' as 'EXPLORING' }] },
    { ...basket, candidates: [{ ...basket.candidates[0]!, candidateArtifactSha256: 'INVALID' }] },
  ];
  for (const value of variants) { const state = setup(new FakeBasketReader(value)); await assert.rejects(state.decisions.decide(request, actor)); assert.equal(count(state.db), 0n); state.db.close(); }
});

test('retry is exact, verified, and causes zero total database changes; changed decision/actor/policy conflicts', async () => {
  const state = setup(); const first = await state.decisions.decide(request, actor);
  const before = (state.db.prepare('SELECT total_changes() value').get() as { value: bigint }).value;
  const retry = await state.decisions.decide(request, actor); const after = (state.db.prepare('SELECT total_changes() value').get() as { value: bigint }).value;
  assert.deepEqual(retry, { ...first, deduplicated: true, databaseMutations: 0 }); assert.equal(after, before);
  await assert.rejects(state.decisions.decide({ ...request, decision: 'REJECT' }, actor), CandidateB7DecisionIdentityConflictError);
  await assert.rejects(state.decisions.decide(request, { ...actor, actorId: 'owner:other' }), CandidateB7DecisionIdentityConflictError);
  state.db.prepare("UPDATE governance_candidate_b7_decisions SET policy_id='x'");
  assert.throws(() => state.db.prepare("UPDATE governance_candidate_b7_decisions SET decision='HOLD'").run(), /immutable/); state.db.close();
});

test('row and decision artifact are immutable and exact effective reader never selects latest', async () => {
  const state = setup(); await state.decisions.decide(request, actor);
  assert.throws(() => state.db.prepare('DELETE FROM governance_candidate_b7_decisions').run(), /immutable/);
  const reader = new GovernanceCandidateB7DecisionReader(state.decisions);
  const effective = await reader.readEffectiveDecision(basketId, candidateId, 2); assert.equal(effective.effectiveState, 'PASS');
  await assert.rejects(reader.readEffectiveDecision(basketId, candidateId, 3), GovernanceValidationError);
  const noDecisionBasket = { ...basket, basketId: otherBasketId }; state.reader.value = noDecisionBasket;
  const none = await reader.readEffectiveDecision(otherBasketId, candidateId, 2); assert.deepEqual(none, { basketId: otherBasketId, candidateId, candidateVersion: 2, effectiveState: 'NO_DECISION' }); state.db.close();
});

test('replay rejects missing/corrupt/noncanonical artifacts and mismatched row/manifest/input identity', async () => {
  for (const mode of ['missing', 'corrupt', 'manifest', 'row', 'basket'] as const) {
    const state = setup(); const result = await state.decisions.decide(request, actor); const artifactPath = state.artifacts.pathForDigest(result.decisionArtifactSha256);
    if (mode === 'missing') fs.rmSync(artifactPath);
    if (mode === 'corrupt') fs.writeFileSync(artifactPath, '{}');
    if (mode === 'manifest') state.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run('text/plain', result.decisionArtifactSha256);
    if (mode === 'row') { state.db.exec('DROP TRIGGER governance_candidate_b7_decisions_no_update'); state.db.prepare('UPDATE governance_candidate_b7_decisions SET actor_id=?').run('owner:other'); }
    if (mode === 'basket') state.reader.value = { ...basket, basketKey: 'changed-basket' };
    await assert.rejects(state.decisions.replay(decisionId)); state.db.close();
  }
  const state = setup(); const result = await state.decisions.decide(request, actor); const artifactPath = state.artifacts.pathForDigest(result.decisionArtifactSha256);
  const parsed = JSON.parse(fs.readFileSync(artifactPath, 'utf8')); const noncanonical = Buffer.from(JSON.stringify(parsed, null, 2)); const newSha = createHash('sha256').update(noncanonical).digest('hex'); const newPath = state.artifacts.pathForDigest(newSha); fs.mkdirSync(path.dirname(newPath), { recursive: true }); fs.writeFileSync(newPath, noncanonical);
  state.db.exec('DROP TRIGGER governance_candidate_b7_decisions_no_update'); state.db.prepare('INSERT INTO artifact_manifests SELECT ?, ?, media_type, ?, acquired_at, contract_version, retention_status, created_at FROM artifact_manifests WHERE sha256=?').run(newSha, noncanonical.length, `sha256/${newSha.slice(0, 2)}/${newSha}`, result.decisionArtifactSha256); state.db.prepare('UPDATE governance_candidate_b7_decisions SET decision_artifact_sha256=?').run(newSha);
  await assert.rejects(state.decisions.replay(decisionId), /canonical/); state.db.close();
});

test('migration v14 to v15 is idempotent, prior migrations have known hashes, and Box 5 has no Box 4 SQL dependency', () => {
  const hashes = ['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46','a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d','e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88','18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848','f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb','c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65','1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca','964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3','cd0c9cd3fe37f4847a2ee0690b6f4151783dd4adca5ddbb83d79f9cb874d9c03'];
  for (let version=1; version<=14; version++) { const file=fs.readdirSync('migrations').find((name)=>name.startsWith(String(version).padStart(4,'0')))!; assert.equal(createHash('sha256').update(fs.readFileSync(path.join('migrations',file))).digest('hex'),hashes[version-1]); }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tdn-b7-migration-')); roots.push(root); const directory=path.join(root,'migrations'); fs.mkdirSync(directory);
  for (const file of fs.readdirSync('migrations').filter((name)=>/^00(0[1-9]|1[0-4])_/.test(name))) fs.copyFileSync(path.join('migrations',file),path.join(directory,file));
  const databasePath=path.join(root,'db.sqlite'); const fourteen=openDatabase({databasePath,migrationsDirectory:directory}); assert.equal(fourteen.migration.currentVersion,14); fourteen.db.close();
  fs.copyFileSync('migrations/0015_candidate_b7_decisions.sql',path.join(directory,'0015_candidate_b7_decisions.sql')); const fifteen=openDatabase({databasePath,migrationsDirectory:directory}); assert.deepEqual(fifteen.migration.applied,[15]); fifteen.db.close(); const rerun=openDatabase({databasePath,migrationsDirectory:directory}); assert.deepEqual(rerun.migration.applied,[]); assert.equal(rerun.migration.currentVersion,15); rerun.db.close();
  for (const file of ['migrations/0015_candidate_b7_decisions.sql','src/modules/governance/candidate-b7-decision-service.ts']) assert.doesNotMatch(fs.readFileSync(file,'utf8'),/flow_/i);
});

test('reused decision artifact preserves first-storage acquired_at', async () => {
  const state=setup(); const envelope={contractVersion:'1.0.0',decisionId,decidedAt:'2026-09-27T00:00:00.000Z',basket:{basketId,basketArtifactSha256:createHash('sha256').update(Buffer.from(canonicalJson(basket))).digest('hex'),workspaceId:basket.workspaceId,basketKey:basket.basketKey,basketVersion:basket.version},candidate:{candidateId,candidateVersion:2,candidateArtifactSha256:'b'.repeat(64),candidateKey:'adult-calcium',label:'Adult calcium',state:'EXPLORING'},decision:'PASS',actor:{actorId:'owner:khang',roleSnapshot:'OWNER'},requiredCapability:CANDIDATE_B7_DECISION_CAPABILITY,policy:{policyId:CANDIDATE_B7_DECISION_POLICY_ID,policyVersion:1}} as const;
  const requestSha256=createHash('sha256').update(Buffer.from(canonicalJson({request,basketArtifactSha256:envelope.basket.basketArtifactSha256,frozenMember:basket.candidates[0],actor:envelope.actor,requiredCapability:CANDIDATE_B7_DECISION_CAPABILITY,policy:envelope.policy}))).digest('hex'); const stored=await state.artifacts.put(Buffer.from(canonicalJson({...envelope,requestSha256}))); state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2000-01-01T00:00:00.000Z','1.0.0','active','2000-01-01T00:00:00.000Z')").run(stored.sha256,stored.byteSize,stored.relativePath);
  await state.decisions.decide(request,actor); assert.equal((state.db.prepare('SELECT acquired_at value FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as {value:string}).value,'2000-01-01T00:00:00.000Z'); state.db.close();
});
