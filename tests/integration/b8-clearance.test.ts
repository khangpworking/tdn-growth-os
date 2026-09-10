import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type { B8ClearanceArtifact } from '../../contracts/flow/b8-clearance-artifact.generated.js';
import type { B8ClearanceCreateRequest } from '../../contracts/flow/b8-clearance-create-request.generated.js';
import type { ProductB8LaneDecision } from '../../contracts/governance/product-b8-lane-decision.generated.js';
import type { ProductWorkspaceArtifact } from '../../contracts/flow/product-workspace-artifact.generated.js';
import {
  B8_CLEARANCE_LANES,
  B8ClearanceIdentityConflictError,
  B8ClearanceService,
  FlowB8ClearanceReader,
  FlowValidationError,
} from '../../src/modules/flow/index.js';
import { PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B8_REVIEW_POLICY_ID, ProductB8LaneDecisionService, type ProductB8DecisionByIdReader, type ProductB8Status, type ProductB8StatusReader } from '../../src/modules/governance/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import type { ProductWorkspaceReader } from '../../src/modules/flow/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));
const productWorkspaceId = '66666666-6666-4666-8666-666666666666';
const otherWorkspaceId = '66666666-6666-4666-8666-666666666667';
const clearanceId = '88888888-8888-4888-8888-888888888888';
const decisionIds = {
  LEGAL: '77777777-7777-4777-8777-000000000001',
  SCIENTIFIC: '77777777-7777-4777-8777-000000000002',
  QUALITY: '77777777-7777-4777-8777-000000000003',
  FINANCE: '77777777-7777-4777-8777-000000000004',
} as const;

function workspace(id = productWorkspaceId): ProductWorkspaceArtifact {
  return {
    contractVersion: '1.0.0', productWorkspaceId: id, productWorkspaceKey: id === productWorkspaceId ? 'adult-calcium-product' : 'other-calcium-product',
    state: 'ACTIVE', entryStep: 'B8', title: id === productWorkspaceId ? 'Canxi người lớn tổng hợp' : 'Canxi khác tổng hợp', createdAt: '2026-09-28T00:00:00.000Z', requestSha256: '1'.repeat(64),
    source: {
      discoveryWorkspace: { workspaceId: '11111111-1111-4111-8111-111111111111' },
      basket: { basketId: '44444444-4444-4444-8444-444444444444', basketArtifactSha256: 'a'.repeat(64), workspaceId: '11111111-1111-4111-8111-111111111111', basketKey: 'b7-basket', basketVersion: 1 },
      candidate: { candidateId: '22222222-2222-4222-8222-222222222222', candidateVersion: 1, candidateArtifactSha256: 'b'.repeat(64), candidateKey: 'adult-calcium', label: 'Canxi người lớn tổng hợp', summary: 'Ý tưởng tổng hợp.', state: 'EXPLORING' },
      b7Decision: { contractVersion: '1.0.0', decisionId: '55555555-5555-4555-8555-555555555555', decisionArtifactSha256: 'c'.repeat(64), decidedAt: '2026-09-27T00:00:00.000Z', decision: 'PASS', actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' }, requiredCapability: 'governance:candidate-b7-review', policy: { policyId: 'governance:candidate-b7-review-v1', policyVersion: 1 }, requestSha256: 'd'.repeat(64) },
    },
  };
}
function workspaceSnapshot(value = workspace()) { return { productWorkspaceId: value.productWorkspaceId, productWorkspaceArtifactSha256: digest(value), productWorkspaceKey: value.productWorkspaceKey, state: value.state, entryStep: value.entryStep, title: value.title, source: value.source }; }
function decision(lane: keyof typeof decisionIds, options: { id?: string; state?: ProductB8LaneDecision['decision']; workspace?: ProductWorkspaceArtifact; version?: number } = {}): ProductB8LaneDecision {
  const ws = options.workspace ?? workspace();
  return { contractVersion: '1.0.0', decisionId: options.id ?? decisionIds[lane], decisionVersion: options.version ?? 1, decidedAt: `2026-09-29T0${B8_CLEARANCE_LANES.indexOf(lane)}:00:00.000Z`, lane, decision: options.state ?? 'PASS', productWorkspace: workspaceSnapshot(ws), actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' }, requiredCapability: 'governance:product-b8-review', policy: { policyId: 'governance:product-b8-review-v1', policyVersion: 1 }, requestSha256: lane.toLowerCase().charAt(0).repeat(64).replace(/[^0-9a-f]/g, 'e') };
}
function currentStatus(ids: Record<string, string> = decisionIds): ProductB8Status { return { productWorkspaceId, readyForB9: true, lanes: B8_CLEARANCE_LANES.map((lane) => ({ lane, effectiveState: 'PASS' as const, decisionId: ids[lane]!, decisionVersion: 1 })) }; }
class FakeReaders implements ProductB8DecisionByIdReader, ProductB8StatusReader {
  decisions = new Map<string, ProductB8LaneDecision>(B8_CLEARANCE_LANES.map((lane) => [decisionIds[lane], decision(lane)]));
  status: ProductB8Status = currentStatus();
  decisionCalls: string[] = []; statusCalls: string[] = [];
  async readVerifiedDecision(id: string): Promise<ProductB8LaneDecision> { this.decisionCalls.push(id); const value = this.decisions.get(id); if (!value) throw new Error('missing decision'); return structuredClone(value); }
  async readStatus(id: string): Promise<ProductB8Status> { this.statusCalls.push(id); return structuredClone(this.status); }
}
function request(workspaceId = productWorkspaceId, ids: Record<string, string> = decisionIds): B8ClearanceCreateRequest { return { contractVersion: '1.0.0', productWorkspaceId: workspaceId, decisions: { LEGAL: ids.LEGAL!, SCIENTIFIC: ids.SCIENTIFIC!, QUALITY: ids.QUALITY!, FINANCE: ids.FINANCE! } }; }
function setup(readers = new FakeReaders()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-clearance-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const service = new B8ClearanceService({ db, artifactStore: artifacts, decisionReader: readers, statusReader: readers, uuid: () => clearanceId, now: () => new Date('2026-09-30T00:00:00Z') });
  return { root, db, artifacts, readers, service };
}
function digest(value: unknown): string { return createHash('sha256').update(Buffer.from(canonicalJson(value))).digest('hex'); }
function count(state: ReturnType<typeof setup>, table: string): bigint { return (state.db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint }).n; }

 test('exact four current PASS decisions create and replay one deterministic READY_FOR_B9 clearance', async () => {
  const state = setup(); const result = await state.service.createClearance(request());
  assert.equal(result.state, 'READY_FOR_B9'); assert.equal(result.deduplicated, false);
  const artifact = await new FlowB8ClearanceReader(state.service).readVerifiedClearance(result.clearanceId);
  assert.deepEqual(artifact.decisions.map((item) => item.lane), [...B8_CLEARANCE_LANES]);
  assert.deepEqual(artifact.decisions.map((item) => item.decisionId), Object.values(decisionIds));
  assert.equal(artifact.productWorkspace.productWorkspaceArtifactSha256, digest(workspace()));
  assert.deepEqual(artifact.productWorkspace.source, workspace().source);
  assert.deepEqual(state.readers.decisionCalls, [...Object.values(decisionIds), ...Object.values(decisionIds)]);
  assert.deepEqual(state.readers.statusCalls, [productWorkspaceId, productWorkspaceId]);
  state.db.close();
});

test('request rejects missing, extra, duplicate lane IDs and every forbidden latest/lane/value/reason/evidence/workspace/actor/B9 field before reads or writes', async () => {
  const missing = structuredClone(request()) as any; delete missing.decisions.FINANCE;
  const extra = { ...request(), decisions: { ...decisionIds, SAFETY: decisionIds.LEGAL } };
  const duplicate = { ...request(), decisions: { ...decisionIds, FINANCE: decisionIds.LEGAL } };
  const forbidden = ['latest','lane','decision','reason','notes','evidence','attachment','workspace','productWorkspaceKey','actor','b9','b9Input'].map((field) => ({ ...request(), [field]: field === 'latest' ? true : 'forbidden' }));
  for (const value of [missing, extra, duplicate, ...forbidden]) { const state = setup(); await assert.rejects(state.service.createClearance(value)); assert.equal(state.readers.decisionCalls.length, 0); assert.equal(state.readers.statusCalls.length, 0); assert.equal(count(state, 'flow_b8_clearances'), 0n); assert.equal(count(state, 'artifact_manifests'), 0n); state.db.close(); }
});

test('HOLD, REJECT, wrong lane/workspace, wrong ID and mixed workspace lineage reject before writes', async () => {
  const variants: ((readers: FakeReaders) => void)[] = [
    (r) => r.decisions.set(decisionIds.LEGAL, decision('LEGAL', { state: 'HOLD' })),
    (r) => r.decisions.set(decisionIds.LEGAL, decision('LEGAL', { state: 'REJECT' })),
    (r) => r.decisions.set(decisionIds.LEGAL, { ...decision('LEGAL'), lane: 'QUALITY' }),
    (r) => r.decisions.set(decisionIds.LEGAL, decision('LEGAL', { workspace: workspace(otherWorkspaceId) })),
    (r) => r.decisions.set(decisionIds.LEGAL, { ...decision('LEGAL'), decisionId: decisionIds.QUALITY }),
    (r) => r.decisions.set(decisionIds.FINANCE, decision('FINANCE', { workspace: { ...workspace(), title: 'Lineage drift' } })),
  ];
  for (const mutate of variants) { const readers = new FakeReaders(); mutate(readers); const state = setup(readers); await assert.rejects(state.service.createClearance(request())); assert.equal(count(state, 'flow_b8_clearances'), 0n); assert.equal(count(state, 'artifact_manifests'), 0n); state.db.close(); }
});

test('NO_DECISION, HOLD/REJECT status, false readiness, malformed ordering and superseded PASS reject at creation', async () => {
  const statuses: ProductB8Status[] = [
    { ...currentStatus(), readyForB9: false },
    { ...currentStatus(), lanes: [{ lane: 'LEGAL', effectiveState: 'NO_DECISION' }, ...currentStatus().lanes.slice(1)] },
    { ...currentStatus(), lanes: [{ lane: 'LEGAL', effectiveState: 'HOLD', decisionId: decisionIds.LEGAL, decisionVersion: 1 }, ...currentStatus().lanes.slice(1)] },
    { ...currentStatus(), lanes: [...currentStatus().lanes].reverse() },
    { ...currentStatus(), lanes: [{ lane: 'LEGAL', effectiveState: 'PASS', decisionId: '77777777-7777-4777-8777-000000000099', decisionVersion: 2 }, ...currentStatus().lanes.slice(1)] },
  ];
  for (const status of statuses) { const readers = new FakeReaders(); readers.status = status; const state = setup(readers); await assert.rejects(state.service.createClearance(request()), FlowValidationError); assert.equal(count(state, 'flow_b8_clearances'), 0n); assert.equal(count(state, 'artifact_manifests'), 0n); state.db.close(); }
});

test('exact retry makes zero database mutations and changed decision set conflicts without implicit latest selection', async () => {
  const state = setup(); const first = await state.service.createClearance(request()); const before = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
  const retry = await state.service.createClearance(request()); const after = (state.db.prepare('SELECT total_changes() n').get() as { n: bigint }).n;
  assert.deepEqual(retry, { ...first, deduplicated: true, databaseMutations: 0 }); assert.equal(after, before); assert.equal(state.readers.statusCalls.length, 2);
  await assert.rejects(state.service.createClearance(request(productWorkspaceId, { ...decisionIds, FINANCE: '77777777-7777-4777-8777-000000000009' })), B8ClearanceIdentityConflictError);
  state.db.close();
});

test('same exact decision set cannot be assigned to another workspace', async () => {
  const state = setup(); await state.service.createClearance(request());
  state.db.exec('DROP INDEX IF EXISTS unused');
  await assert.rejects(state.service.createClearance(request(otherWorkspaceId)), B8ClearanceIdentityConflictError);
  assert.equal(count(state, 'flow_b8_clearances'), 1n); state.db.close();
});

test('clearance and memberships are immutable; later B8 revision does not rewrite and historical replay does not require latest status', async () => {
  const state = setup(); const result = await state.service.createClearance(request()); const before = await state.service.replay(result.clearanceId);
  assert.throws(() => state.db.prepare("UPDATE flow_b8_clearances SET state='READY_FOR_B9'").run(), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_b8_clearances').run(), /immutable/);
  assert.throws(() => state.db.prepare('UPDATE flow_b8_clearance_decisions SET decision_version=2').run(), /immutable/);
  assert.throws(() => state.db.prepare('DELETE FROM flow_b8_clearance_decisions').run(), /immutable/);
  state.readers.status = { ...currentStatus(), readyForB9: false, lanes: [{ lane: 'LEGAL', effectiveState: 'HOLD', decisionId: '77777777-7777-4777-8777-000000000009', decisionVersion: 2 }, ...currentStatus().lanes.slice(1)] };
  const after = await state.service.replay(result.clearanceId); assert.deepEqual(after, before); assert.equal(state.readers.statusCalls.length, 2); state.db.close();
});

test('replay rejects missing/corrupt/noncanonical/mismatched clearance artifacts, rows, membership, and exact decision artifacts', async () => {
  for (const mode of ['missing','corrupt','noncanonical','manifest','row','member','decision'] as const) {
    const readers = new FakeReaders(); const state = setup(readers); const result = await state.service.createClearance(request()); const file = state.artifacts.pathForDigest(result.clearanceArtifactSha256);
    if (mode === 'missing') fs.rmSync(file);
    if (mode === 'corrupt') fs.writeFileSync(file, '{}');
    if (mode === 'noncanonical') { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); const data = Buffer.from(JSON.stringify(parsed, null, 2)); const sha = createHash('sha256').update(data).digest('hex'); const target = state.artifacts.pathForDigest(sha); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); state.db.exec('DROP TRIGGER flow_b8_clearances_no_update'); state.db.prepare('INSERT INTO artifact_manifests SELECT ?,?,media_type,?,acquired_at,contract_version,retention_status,created_at FROM artifact_manifests WHERE sha256=?').run(sha, data.length, `sha256/${sha.slice(0,2)}/${sha}`, result.clearanceArtifactSha256); state.db.prepare('UPDATE flow_b8_clearances SET clearance_artifact_sha256=?').run(sha); }
    if (mode === 'manifest') state.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run('text/plain', result.clearanceArtifactSha256);
    if (mode === 'row') { state.db.exec('DROP TRIGGER flow_b8_clearances_no_update'); state.db.prepare("UPDATE flow_b8_clearances SET product_workspace_title='Drift'").run(); }
    if (mode === 'member') { state.db.exec('DROP TRIGGER flow_b8_clearance_decisions_no_update'); state.db.prepare('UPDATE flow_b8_clearance_decisions SET decision_version=2 WHERE lane=?').run('LEGAL'); }
    if (mode === 'decision') readers.decisions.set(decisionIds.LEGAL, decision('LEGAL', { version: 2 }));
    await assert.rejects(state.service.replay(result.clearanceId)); state.db.close();
  }
});

test('synthetic persisted workspace and four current PASS decisions freeze one clearance without mutating workspace or B8 rows and without B9', async () => {
  const state = setup(); const ws = workspace(); const wsSha = digest(ws); const wsArtifact = await state.artifacts.put(Buffer.from(canonicalJson(ws))); state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2026-09-28T00:00:00.000Z','1.0.0','active','2026-09-28T00:00:00.000Z')").run(wsArtifact.sha256, wsArtifact.byteSize, wsArtifact.relativePath);
  state.db.prepare(`INSERT INTO flow_product_workspaces VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(productWorkspaceId, ws.productWorkspaceKey, 'ACTIVE', 'B8', ws.title, ws.source.discoveryWorkspace.workspaceId, ws.source.basket.basketId, ws.source.basket.basketArtifactSha256, ws.source.basket.basketKey, 1, ws.source.candidate.candidateId, 1, ws.source.candidate.candidateArtifactSha256, ws.source.candidate.candidateKey, ws.source.candidate.label, ws.source.candidate.summary, 'EXPLORING', ws.source.b7Decision.decisionId, ws.source.b7Decision.decisionArtifactSha256, ws.source.b7Decision.decidedAt, 'PASS', ws.source.b7Decision.actor.actorId, 'OWNER', ws.source.b7Decision.requiredCapability, ws.source.b7Decision.policy.policyId, 1, ws.source.b7Decision.requestSha256, ws.requestSha256, wsSha, ws.createdAt);
  const insert = state.db.prepare(`INSERT INTO governance_product_b8_lane_decisions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const lane of B8_CLEARANCE_LANES) { const value = state.readers.decisions.get(decisionIds[lane])!; const stored = await state.artifacts.put(Buffer.from(canonicalJson(value))); state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,?,'1.0.0','active',?)").run(stored.sha256, stored.byteSize, stored.relativePath, value.decidedAt, value.decidedAt); insert.run(value.decisionId, productWorkspaceId, wsSha, lane, 1, 'PASS', value.actor.actorId, 'OWNER', value.requiredCapability, value.policy.policyId, 1, value.requestSha256, stored.sha256, value.decidedAt); }
  const workspaceBefore = state.db.prepare('SELECT * FROM flow_product_workspaces').get(); const decisionsBefore = state.db.prepare('SELECT * FROM governance_product_b8_lane_decisions ORDER BY lane').all();
  const result = await state.service.createClearance(request()); const artifact = await state.service.replay(result.clearanceId);
  assert.equal(artifact.state, 'READY_FOR_B9'); assert.deepEqual(state.db.prepare('SELECT * FROM flow_product_workspaces').get(), workspaceBefore); assert.deepEqual(state.db.prepare('SELECT * FROM governance_product_b8_lane_decisions ORDER BY lane').all(), decisionsBefore); assert.equal((state.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%b9%'").get() as {n:bigint}).n, 0n); state.db.close();
});

test('migration v17→v18 and idempotent rerun pass; migrations 0001–0017 are byte-identical and Box 4 has no direct Box 5 SQL/FK', () => {
  const expected = ['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46','a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d','e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88','18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848','f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb','c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65','1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca','964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3','cd0c9cd3fe37f4847a2ee0690b6f4151783dd4adca5ddbb83d79f9cb874d9c03','0cdccfbaa7e60bc423126977cf2e545e4025454c2006fd1b92d3e24bc473dae1','9e8daf707e2a913d60610690fcab57c178f2facd0883e45bc53dd72a30284c72','effd4f667451f2d4dd727ef6c525e36d84c25e24775a75205ab32d366d13420c'];
  for (let version=1; version<=17; version++) { const file=fs.readdirSync('migrations').find((name)=>name.startsWith(String(version).padStart(4,'0')))!; assert.equal(createHash('sha256').update(fs.readFileSync(path.join('migrations',file))).digest('hex'), expected[version-1]); }
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tdn-clearance-migration-')); roots.push(root); const dir=path.join(root,'migrations'); fs.mkdirSync(dir); for(const file of fs.readdirSync('migrations').filter((name)=>/^00(0[1-9]|1[0-7])_/.test(name))) fs.copyFileSync(path.join('migrations',file),path.join(dir,file)); const dbPath=path.join(root,'db.sqlite'); const v17=openDatabase({databasePath:dbPath,migrationsDirectory:dir}); assert.equal(v17.migration.currentVersion,17); v17.db.close(); fs.copyFileSync('migrations/0018_b8_clearances.sql',path.join(dir,'0018_b8_clearances.sql')); const v18=openDatabase({databasePath:dbPath,migrationsDirectory:dir}); assert.deepEqual(v18.migration.applied,[18]); v18.db.close(); const rerun=openDatabase({databasePath:dbPath,migrationsDirectory:dir}); assert.deepEqual(rerun.migration.applied,[]); assert.equal(rerun.migration.currentVersion,18); rerun.db.close(); for(const file of ['migrations/0018_b8_clearances.sql','src/modules/flow/b8-clearance-service.ts']) { const text=fs.readFileSync(file,'utf8'); assert.doesNotMatch(text,/governance_product_b8_lane_decisions/i); assert.doesNotMatch(text,/REFERENCES\s+governance_/i); }
});

test('reused clearance artifact preserves first-storage acquired_at', async () => {
  const state=setup(); const decisions=B8_CLEARANCE_LANES.map((lane)=>decision(lane)); const artifact: B8ClearanceArtifact={contractVersion:'1.0.0',clearanceId,state:'READY_FOR_B9',clearedAt:'2026-09-30T00:00:00.000Z',requestSha256:digest(request()),productWorkspace:workspaceSnapshot(),decisions:decisions.map((value)=>({lane:value.lane,decisionId:value.decisionId,decisionVersion:value.decisionVersion,decisionArtifactSha256:digest(value),decidedAt:value.decidedAt,decision:'PASS' as const,actor:value.actor,requiredCapability:value.requiredCapability,policy:value.policy})) as B8ClearanceArtifact['decisions']}; const stored=await state.artifacts.put(Buffer.from(canonicalJson(artifact))); state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2000-01-01T00:00:00.000Z','1.0.0','active','2000-01-01T00:00:00.000Z')").run(stored.sha256,stored.byteSize,stored.relativePath); await state.service.createClearance(request()); assert.equal((state.db.prepare('SELECT acquired_at value FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as {value:string}).value,'2000-01-01T00:00:00.000Z'); state.db.close();
});

test('same-file second-connection B8 revision remains pending until clearance commits', async () => {
  const state = setup();
  const second = openDatabase({ databasePath: path.join(state.root, 'db.sqlite') }).db;
  const wsReader: ProductWorkspaceReader = { async readVerifiedProductWorkspace() { return workspace(); } };
  const b8 = new ProductB8LaneDecisionService({ db: second, artifactStore: state.artifacts, productWorkspaceReader: wsReader, configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY }, uuid: () => '77777777-7777-4777-8777-000000000099', now: () => new Date('2026-09-30T00:00:01Z') });
  let revision: Promise<unknown> | undefined;
  let revisionSettled = false;
  let statusCalls = 0;
  const guardedStatus: ProductB8StatusReader = { async readStatus() {
    statusCalls++;
    if (statusCalls === 2) {
      revision = b8.decide({ contractVersion: '1.0.0', productWorkspaceId, lane: 'LEGAL', expectedVersion: 0, decision: 'HOLD' }, { actorId: 'owner:khang', roleSnapshot: 'OWNER', capabilities: new Set([PRODUCT_B8_REVIEW_CAPABILITY]) });
      void revision.finally(() => { revisionSettled = true; });
      await Promise.resolve();
      assert.equal(revisionSettled, false);
      assert.equal((second.prepare('SELECT count(*) n FROM governance_product_b8_lane_decisions').get() as {n:bigint}).n, 0n);
    }
    return currentStatus();
  } };
  const service = new B8ClearanceService({ db: state.db, artifactStore: state.artifacts, decisionReader: state.readers, statusReader: guardedStatus, uuid: () => clearanceId, now: () => new Date('2026-09-30T00:00:00Z') });
  const result = await service.createClearance(request());
  assert.equal(result.state, 'READY_FOR_B9'); assert.equal(revisionSettled, false); assert.ok(revision); await revision;
  assert.equal((state.db.prepare('SELECT count(*) n FROM flow_b8_clearances').get() as {n:bigint}).n, 1n);
  assert.equal((second.prepare('SELECT count(*) n FROM governance_product_b8_lane_decisions').get() as {n:bigint}).n, 1n);
  second.close(); state.db.close();
});
