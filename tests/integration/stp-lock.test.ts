import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import type { B8ClearanceArtifact } from '../../contracts/flow/b8-clearance-artifact.generated.js';
import type { LockedStpArtifact } from '../../contracts/flow/locked-stp-artifact.generated.js';
import type { ProductWorkspaceArtifact } from '../../contracts/flow/product-workspace-artifact.generated.js';
import type { StpWorkingSaveRequest } from '../../contracts/flow/stp-working-save-request.generated.js';
import {
  FlowLockedStpReader,
  FlowValidationError,
  PRODUCT_B9_LOCK_CAPABILITY,
  StpIdentityConflictError,
  StpService,
  type B8ClearanceReader,
  type ProductWorkspaceReader,
} from '../../src/modules/flow/index.js';
import { canonicalJson } from '../../src/modules/foundation/index.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/index.js';
import { openDatabase } from '../../src/platform/db/index.js';

const roots: string[] = [];
afterEach(async () => Promise.all(roots.splice(0).map((root) => fsp.rm(root, { recursive: true, force: true }))));
const workspaceId = '66666666-6666-4666-8666-666666666666';
const otherWorkspaceId = '66666666-6666-4666-8666-666666666667';
const clearanceId = '88888888-8888-4888-8888-888888888888';
const workingId = '99999999-9999-4999-8999-999999999991';
const lockId = '99999999-9999-4999-8999-999999999992';
const owner = { actorId: 'owner:khang', roleSnapshot: 'OWNER', capabilities: new Set<string>([PRODUCT_B9_LOCK_CAPABILITY]) };

function workspace(id = workspaceId): ProductWorkspaceArtifact {
  return {
    contractVersion: '1.0.0', productWorkspaceId: id, productWorkspaceKey: id === workspaceId ? 'adult-calcium-product' : 'other-product',
    state: 'ACTIVE', entryStep: 'B8', title: id === workspaceId ? 'Canxi người lớn tổng hợp' : 'Sản phẩm khác', createdAt: '2026-09-28T00:00:00.000Z', requestSha256: '1'.repeat(64),
    source: {
      discoveryWorkspace: { workspaceId: '11111111-1111-4111-8111-111111111111' },
      basket: { basketId: '44444444-4444-4444-8444-444444444444', basketArtifactSha256: 'a'.repeat(64), workspaceId: '11111111-1111-4111-8111-111111111111', basketKey: 'b7-basket', basketVersion: 1 },
      candidate: { candidateId: '22222222-2222-4222-8222-222222222222', candidateVersion: 1, candidateArtifactSha256: 'b'.repeat(64), candidateKey: 'adult-calcium', label: 'Canxi người lớn tổng hợp', summary: 'Ý tưởng tổng hợp.', state: 'EXPLORING' },
      b7Decision: { contractVersion: '1.0.0', decisionId: '55555555-5555-4555-8555-555555555555', decisionArtifactSha256: 'c'.repeat(64), decidedAt: '2026-09-27T00:00:00.000Z', decision: 'PASS', actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' }, requiredCapability: 'governance:candidate-b7-review', policy: { policyId: 'governance:candidate-b7-review-v1', policyVersion: 1 }, requestSha256: 'd'.repeat(64) },
    },
  };
}
function clearance(ws = workspace(), id = clearanceId): B8ClearanceArtifact {
  const productWorkspace = { productWorkspaceId: ws.productWorkspaceId, productWorkspaceArtifactSha256: digest(ws), productWorkspaceKey: ws.productWorkspaceKey, state: ws.state, entryStep: ws.entryStep, title: ws.title, source: ws.source };
  const lanes = ['LEGAL','SCIENTIFIC','QUALITY','FINANCE'] as const;
  return { contractVersion: '1.0.0', clearanceId: id, state: 'READY_FOR_B9', clearedAt: '2026-09-30T00:00:00.000Z', requestSha256: 'e'.repeat(64), productWorkspace, decisions: lanes.map((lane,index) => ({ lane, decisionId: `77777777-7777-4777-8777-${String(index+1).padStart(12,'0')}`, decisionVersion: 1, decisionArtifactSha256: String(index+1).repeat(64), decidedAt: `2026-09-29T0${index}:00:00.000Z`, decision: 'PASS' as const, actor: { actorId: 'owner:khang', roleSnapshot: 'OWNER' as const }, requiredCapability: 'governance:product-b8-review' as const, policy: { policyId: 'governance:product-b8-review-v1' as const, policyVersion: 1 as const } })) as B8ClearanceArtifact['decisions'] };
}
class Sources implements ProductWorkspaceReader, B8ClearanceReader {
  workspace = workspace(); clearance = clearance(); workspaceCalls: string[] = []; clearanceCalls: string[] = [];
  async readVerifiedProductWorkspace(id: string): Promise<ProductWorkspaceArtifact> { this.workspaceCalls.push(id); return structuredClone(this.workspace); }
  async readVerifiedClearance(id: string): Promise<B8ClearanceArtifact> { this.clearanceCalls.push(id); return structuredClone(this.clearance); }
}
function save(overrides: Partial<StpWorkingSaveRequest> = {}): StpWorkingSaveRequest {
  return { contractVersion: '1.0.0', productWorkspaceId: workspaceId, b8ClearanceId: clearanceId, expectedWorkingDigest: null,
    segments: [
      { key: 'active-adults', label: 'Người trưởng thành năng động', description: 'Quan tâm sức khỏe xương.' },
      { key: 'older-adults', label: 'Người lớn tuổi' },
      { key: 'caregivers', label: 'Người chăm sóc' },
    ], primaryTargetSegmentKey: 'active-adults', secondaryTargetSegmentKeys: ['older-adults'], positioningStatement: 'Canxi tiện dùng cho người trưởng thành chủ động.', ...overrides };
}
function contentOf(input: StpWorkingSaveRequest) { return { segments: input.segments, primaryTargetSegmentKey: input.primaryTargetSegmentKey, ...(input.secondaryTargetSegmentKeys === undefined ? {} : { secondaryTargetSegmentKeys: input.secondaryTargetSegmentKeys }), positioningStatement: input.positioningStatement }; }
function digest(value: unknown): string { return createHash('sha256').update(Buffer.from(canonicalJson(value))).digest('hex'); }
function setup(sources = new Sources()) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-stp-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  let uuidCall = 0; let timeCall = 0;
  const service = new StpService({ db, artifactStore: artifacts, productWorkspaceReader: sources, b8ClearanceReader: sources,
    uuid: () => [workingId, lockId][uuidCall++]!, now: () => new Date(Date.UTC(2026,9,1,0,0,timeCall++)) });
  return { root, db, artifacts, sources, service };
}
function count(state: ReturnType<typeof setup>, table: string): bigint { return (state.db.prepare(`SELECT count(*) n FROM ${table}`).get() as {n:bigint}).n; }

 test('verified workspace and READY_FOR_B9 clearance create one ordered working STP', async () => {
  const state = setup(); const input = save(); const result = await state.service.saveWorking(input); const replay = await state.service.readVerifiedWorking(workspaceId);
  assert.equal(result.workingStpId, workingId); assert.equal(result.workingDigest, digest(contentOf(input)));
  assert.deepEqual(replay.content.segments.map((segment) => segment.key), ['active-adults','older-adults','caregivers']);
  assert.equal(replay.b8ClearanceId, clearanceId); assert.equal(count(state,'flow_stp_working_records'),1n); assert.equal(count(state,'flow_locked_stps'),0n); state.db.close();
});

test('changed pre-lock content updates the same row; identical save deduplicates with zero mutations', async () => {
  const state=setup(); const first=await state.service.saveWorking(save()); const before=(state.db.prepare('SELECT total_changes() n').get() as {n:bigint}).n; const same=await state.service.saveWorking(save()); const after=(state.db.prepare('SELECT total_changes() n').get() as {n:bigint}).n;
  assert.deepEqual(same,{...first,deduplicated:true,databaseMutations:0}); assert.equal(after,before);
  const changed=save({expectedWorkingDigest:first.workingDigest,positioningStatement:'Định vị mới, do con người cung cấp.'}); const updated=await state.service.saveWorking(changed); assert.equal(updated.workingStpId,first.workingStpId); assert.notEqual(updated.workingDigest,first.workingDigest); assert.equal(count(state,'flow_stp_working_records'),1n); assert.equal((await state.service.readVerifiedWorking(workspaceId)).content.positioningStatement,changed.positioningStatement); state.db.close();
});

test('closed save input and segment/target invariants reject before writes', async () => {
  const variants: unknown[]=[
    {...save(),reason:'x'}, {...save(),score:1}, {...save(),segments:[]},
    {...save(),segments:[{key:'same-key',label:'A'},{key:'same-key',label:'B'}]},
    {...save(),primaryTargetSegmentKey:'missing-key'},
    {...save(),secondaryTargetSegmentKeys:['missing-key']},
    {...save(),secondaryTargetSegmentKeys:['older-adults','older-adults']},
    {...save(),secondaryTargetSegmentKeys:['active-adults']},
  ];
  for(const value of variants){const state=setup();await assert.rejects(state.service.saveWorking(value),FlowValidationError);assert.equal(count(state,'flow_stp_working_records'),0n);state.db.close();}
});

test('stale update, wrong workspace, missing/malformed/mismatched clearance fail closed', async () => {
  const state=setup();const first=await state.service.saveWorking(save());await assert.rejects(state.service.saveWorking(save({expectedWorkingDigest:'f'.repeat(64),positioningStatement:'Changed'})),StpIdentityConflictError);state.db.close();
  for(const mutate of [
    (s:Sources)=>{s.workspace=workspace(otherWorkspaceId);},
    (s:Sources)=>{s.clearance=clearance(workspace(), '88888888-8888-4888-8888-888888888889');},
    (s:Sources)=>{s.clearance={...clearance(),state:'NOT_READY' as 'READY_FOR_B9'};},
    (s:Sources)=>{s.clearance=clearance(workspace(otherWorkspaceId));},
  ]){const sources=new Sources();mutate(sources);const next=setup(sources);await assert.rejects(next.service.saveWorking(save()));assert.equal(count(next,'flow_stp_working_records'),0n);next.db.close();}
});

test('OWNER with capability locks exact current digest and exact content, lineage, clearance, actor and policy', async () => {
  const state=setup();const first=await state.service.saveWorking(save());const changed=save({expectedWorkingDigest:first.workingDigest,positioningStatement:'Định vị chính thức cuối cùng.'});const current=await state.service.saveWorking(changed);const result=await state.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:current.workingDigest},owner);const locked=await new FlowLockedStpReader(state.service).readVerifiedLockedStp(result.lockId);
  assert.equal(locked.state,'LOCKED_STP');assert.deepEqual(locked.workingStp.content,contentOf(changed));assert.equal(locked.workingStp.workingDigest,current.workingDigest);assert.equal(locked.productWorkspace.productWorkspaceArtifactSha256,digest(workspace()));assert.deepEqual(locked.productWorkspace.artifact.source,workspace().source);assert.equal(locked.b8Clearance.clearanceId,clearanceId);assert.equal(locked.b8Clearance.clearanceArtifactSha256,digest(clearance()));assert.deepEqual(locked.actor,{actorId:'owner:khang',roleSnapshot:'OWNER'});assert.equal(locked.policy.policyId,'governance:product-b9-lock-v1'); state.db.close();
});

test('non-owner, missing capability, AI, closed lock fields, stale digest, wrong workspace, missing working and missing clearance reject', async () => {
  const badActors=[{...owner,roleSnapshot:'SPECIALIST'},{...owner,capabilities:new Set<string>()},{...owner,actorId:'ai:agent',roleSnapshot:'AI'}];
  for(const actor of badActors){const state=setup();const draft=await state.service.saveWorking(save());await assert.rejects(state.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest},actor),FlowValidationError);assert.equal(count(state,'flow_locked_stps'),0n);state.db.close();}
  const state=setup();const draft=await state.service.saveWorking(save());for(const input of [{contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest,reason:'x'},{contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:'f'.repeat(64)},{contractVersion:'1.0.0',productWorkspaceId:otherWorkspaceId,expectedWorkingDigest:draft.workingDigest}])await assert.rejects(state.service.lock(input,owner));assert.equal(count(state,'flow_locked_stps'),0n);state.db.close();
  const noWorking=setup();await assert.rejects(noWorking.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:'f'.repeat(64)},owner));noWorking.db.close();
  const sources=new Sources();const missing=setup(sources);const record=await missing.service.saveWorking(save());sources.clearance={...clearance(),clearanceId:'88888888-8888-4888-8888-888888888889'};await assert.rejects(missing.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:record.workingDigest},owner));missing.db.close();
});

test('exact lock retry deduplicates with zero mutations; changed digest or actor and second different lock fail closed', async () => {
  const state=setup();const draft=await state.service.saveWorking(save());const request={contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest} as const;const first=await state.service.lock(request,owner);const before=(state.db.prepare('SELECT total_changes() n').get() as {n:bigint}).n;const retry=await state.service.lock(request,owner);const after=(state.db.prepare('SELECT total_changes() n').get() as {n:bigint}).n;assert.deepEqual(retry,{...first,deduplicated:true,databaseMutations:0});assert.equal(after,before);await assert.rejects(state.service.lock({...request,expectedWorkingDigest:'f'.repeat(64)},owner),StpIdentityConflictError);await assert.rejects(state.service.lock(request,{...owner,actorId:'owner:other'}),StpIdentityConflictError);assert.equal(count(state,'flow_locked_stps'),1n);state.db.close();
});

test('post-lock edits, replacement, direct deletion/unlock and second locked row fail closed', async () => {
  const state=setup();const draft=await state.service.saveWorking(save());await state.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest},owner);await assert.rejects(state.service.saveWorking(save()),/Locked STP/);await assert.rejects(state.service.saveWorking(save({expectedWorkingDigest:draft.workingDigest,positioningStatement:'Replacement'})),/Locked STP/);assert.throws(()=>state.db.prepare("UPDATE flow_stp_working_records SET content_json='{}'").run(),/locked/);assert.throws(()=>state.db.prepare('DELETE FROM flow_stp_working_records').run(),/no_delete/);assert.throws(()=>state.db.prepare('DELETE FROM flow_locked_stps').run(),/immutable/);assert.throws(()=>state.db.prepare("UPDATE flow_locked_stps SET actor_id='owner:other'").run(),/immutable/);assert.throws(()=>state.db.prepare('INSERT INTO flow_locked_stps SELECT ?,product_workspace_id,working_stp_id,working_digest,product_workspace_artifact_sha256,b8_clearance_id,b8_clearance_artifact_sha256,actor_id,role_snapshot,required_capability,policy_id,policy_version,request_sha256,lock_artifact_sha256,locked_at FROM flow_locked_stps').run('99999999-9999-4999-8999-999999999999'));state.db.close();
});

test('locked replay rejects corrupt/noncanonical/mismatched artifact, manifest, row, working content, workspace or clearance',async()=>{
  for(const mode of ['corrupt','noncanonical','manifest','row','working','workspace','clearance'] as const){const sources=new Sources();const state=setup(sources);const draft=await state.service.saveWorking(save());const result=await state.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest},owner);const file=state.artifacts.pathForDigest(result.lockArtifactSha256);if(mode==='corrupt')fs.writeFileSync(file,'{}');if(mode==='noncanonical'){const parsed=JSON.parse(fs.readFileSync(file,'utf8'));const data=Buffer.from(JSON.stringify(parsed,null,2));const sha=createHash('sha256').update(data).digest('hex');const target=state.artifacts.pathForDigest(sha);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,data);state.db.exec('DROP TRIGGER flow_locked_stps_no_update');state.db.prepare('INSERT INTO artifact_manifests SELECT ?,?,media_type,?,acquired_at,contract_version,retention_status,created_at FROM artifact_manifests WHERE sha256=?').run(sha,data.length,`sha256/${sha.slice(0,2)}/${sha}`,result.lockArtifactSha256);state.db.prepare('UPDATE flow_locked_stps SET lock_artifact_sha256=?').run(sha);}if(mode==='manifest')state.db.prepare('UPDATE artifact_manifests SET media_type=? WHERE sha256=?').run('text/plain',result.lockArtifactSha256);if(mode==='row'){state.db.exec('DROP TRIGGER flow_locked_stps_no_update');state.db.prepare("UPDATE flow_locked_stps SET actor_id='owner:other'").run();}if(mode==='working'){state.db.exec('DROP TRIGGER flow_stp_working_records_locked_no_update');state.db.prepare("UPDATE flow_stp_working_records SET content_json='{}'").run();}if(mode==='workspace')sources.workspace={...workspace(),title:'Drift'};if(mode==='clearance')sources.clearance={...clearance(),clearedAt:'2026-10-02T00:00:00.000Z'};await assert.rejects(state.service.replayLocked(result.lockId));state.db.close();}
});

test('first-storage artifact acquired_at is preserved',async()=>{const state=setup();const draft=await state.service.saveWorking(save());const sources={workspace:workspace(),clearance:clearance()};const actor={actorId:'owner:khang',roleSnapshot:'OWNER' as const};const request={contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest} as const;const requestSha=digest({request,actor,requiredCapability:'governance:product-b9-lock',policy:{policyId:'governance:product-b9-lock-v1',policyVersion:1},productWorkspaceArtifactSha256:digest(sources.workspace),b8ClearanceId:clearanceId,b8ClearanceArtifactSha256:digest(sources.clearance)});const artifact:LockedStpArtifact={contractVersion:'1.0.0',lockId,state:'LOCKED_STP',lockedAt:'2026-10-01T00:00:01.000Z',requestSha256:requestSha,workingStp:{workingStpId:workingId,workingDigest:draft.workingDigest,content:contentOf(save())},productWorkspace:{productWorkspaceArtifactSha256:digest(sources.workspace),artifact:sources.workspace},b8Clearance:{clearanceId,clearanceArtifactSha256:digest(sources.clearance),state:'READY_FOR_B9'},actor,requiredCapability:'governance:product-b9-lock',policy:{policyId:'governance:product-b9-lock-v1',policyVersion:1}};const stored=await state.artifacts.put(Buffer.from(canonicalJson(artifact)));state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2000-01-01T00:00:00.000Z','1.0.0','active','2000-01-01T00:00:00.000Z')").run(stored.sha256,stored.byteSize,stored.relativePath);await state.service.lock(request,owner);assert.equal((state.db.prepare('SELECT acquired_at value FROM artifact_manifests WHERE sha256=?').get(stored.sha256) as {value:string}).value,'2000-01-01T00:00:00.000Z');state.db.close();});

test('migration v18→v19 and rerun pass; migrations 0001–0018 stay byte-identical; no cross-box SQL/FK or B10',()=>{const expected=['cc454e4c837cac9ae4718fe3e963f9b9fad2b20ce0c4e6ae47757a25e701a7eb','b62f1a6d3ad5d0c7c4b26855da8f6b71bc3d5845b9fd6e8d6d13e1f468680d46','a13daec88cfe5abbb4a26d517744c9c6ccc613841eb47c3d9932264a1c5157ec','0e8add96ffe9cbfce075a5457349273ecac4d76bfc1bad98d19d6e0258b5530d','e4785c6f98cf3a262b1ffa71dc7e374ae38263db4fe9b47677575d54389d7592','241b8a941db06673322b44aa2e7e5c26b5c45a390afcb06ca5062ced66ddeb88','18509c37e92f9d3a1b89921b2c827eadaa2ea58eeb5f15fe4e1f4a252e4f273b','285e1591771294455a9212d3cc1f3b02f17ade50e38718bfa337a8b9c6ebe848','f7c08885f9e7b42d12fbdd3b37011df65855ae21a7a4e33b3d2e490fd67d8439','4c2b348adb776e12bf011f90b46d6e12cd17798fc3374ffe399a3ffa67ffaebb','c09dbf2e8bd8ee4046565cb6bbbd417c9c7ff3e93c25f79eff60299b58395a65','1248f644bead0002f0559611ae0d7038a6e182d90c21163529bc262f688652ca','964f2d630247ebf3eddfd1e79e620dae9311995959411c1caed129a688f8bcb3','cd0c9cd3fe37f4847a2ee0690b6f4151783dd4adca5ddbb83d79f9cb874d9c03','0cdccfbaa7e60bc423126977cf2e545e4025454c2006fd1b92d3e24bc473dae1','9e8daf707e2a913d60610690fcab57c178f2facd0883e45bc53dd72a30284c72','effd4f667451f2d4dd727ef6c525e36d84c25e24775a75205ab32d366d13420c','080ef4c35ebcf2e8dc3c937336f3838ab8ef2d1b002a0533e3f62e017817a9b6'];for(let version=1;version<=18;version++){const file=fs.readdirSync('migrations').find(name=>name.startsWith(String(version).padStart(4,'0')))!;assert.equal(createHash('sha256').update(fs.readFileSync(path.join('migrations',file))).digest('hex'),expected[version-1]);}const root=fs.mkdtempSync(path.join(os.tmpdir(),'tdn-stp-migration-'));roots.push(root);const dir=path.join(root,'migrations');fs.mkdirSync(dir);for(const file of fs.readdirSync('migrations').filter(name=>/^00(0[1-9]|1[0-8])_/.test(name)))fs.copyFileSync(path.join('migrations',file),path.join(dir,file));const dbPath=path.join(root,'db.sqlite');const v18=openDatabase({databasePath:dbPath,migrationsDirectory:dir});assert.equal(v18.migration.currentVersion,18);v18.db.close();fs.copyFileSync('migrations/0019_single_stp_lock.sql',path.join(dir,'0019_single_stp_lock.sql'));const v19=openDatabase({databasePath:dbPath,migrationsDirectory:dir});assert.deepEqual(v19.migration.applied,[19]);v19.db.close();const rerun=openDatabase({databasePath:dbPath,migrationsDirectory:dir});assert.deepEqual(rerun.migration.applied,[]);assert.equal(rerun.migration.currentVersion,19);assert.equal((rerun.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%b10%'").get() as {n:bigint}).n,0n);rerun.db.close();for(const file of ['migrations/0019_single_stp_lock.sql','src/modules/flow/stp-service.ts']){const text=fs.readFileSync(file,'utf8');assert.doesNotMatch(text,/governance_product_b8|governance_candidate_b7/i);assert.doesNotMatch(text,/REFERENCES\s+(?:governance_|flow_b8_clearances|flow_product_workspaces)/i);}});

test('synthetic end-to-end leaves product workspace, B7, B8 and clearance rows unchanged and creates no B10',async()=>{const state=setup();const tables=['flow_product_workspaces','governance_candidate_b7_decisions','governance_product_b8_lane_decisions','flow_b8_clearances'] as const;const before=Object.fromEntries(tables.map(table=>[table,count(state,table)]));const initial=await state.service.saveWorking(save());const changed=await state.service.saveWorking(save({expectedWorkingDigest:initial.workingDigest,positioningStatement:'Bản STP chính thức tổng hợp.'}));await state.service.lock({contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:changed.workingDigest},owner);for(const table of tables)assert.equal(count(state,table),before[table]);assert.equal(count(state,'flow_stp_working_records'),1n);assert.equal(count(state,'flow_locked_stps'),1n);assert.equal((state.db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='table' AND name LIKE '%b10%'").get() as {n:bigint}).n,0n);state.db.close();});

test('database rejects a locked row whose workspace, digest, or clearance does not match its working record', async()=>{const state=setup();const draft=await state.service.saveWorking(save());const stored=await state.artifacts.put(Buffer.from('{}'));state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2026-10-01T00:00:00.000Z','1.0.0','active','2026-10-01T00:00:00.000Z')").run(stored.sha256,stored.byteSize,stored.relativePath);assert.throws(()=>state.db.prepare(`INSERT INTO flow_locked_stps(lock_id,product_workspace_id,working_stp_id,working_digest,product_workspace_artifact_sha256,b8_clearance_id,b8_clearance_artifact_sha256,actor_id,role_snapshot,required_capability,policy_id,policy_version,request_sha256,lock_artifact_sha256,locked_at) VALUES(?,?,?,?,?,?,?,'owner:khang','OWNER','governance:product-b9-lock','governance:product-b9-lock-v1',1,?,?,?)`).run(lockId,otherWorkspaceId,draft.workingStpId,draft.workingDigest,digest(workspace()),clearanceId,digest(clearance()),'f'.repeat(64),stored.sha256,'2026-10-01T00:00:00.000Z'),/working_mismatch/);assert.equal(count(state,'flow_locked_stps'),0n);state.db.close();});

test('same-file second connections serialize concurrent first saves and exact locks',async()=>{const state=setup();const second=openDatabase({databasePath:path.join(state.root,'db.sqlite')}).db;const service2=new StpService({db:second,artifactStore:state.artifacts,productWorkspaceReader:state.sources,b8ClearanceReader:state.sources,uuid:()=>workingId,now:()=>new Date('2026-10-01T00:00:00Z')});const [a,b]=await Promise.all([state.service.saveWorking(save()),service2.saveWorking(save())]);assert.equal(a.workingStpId,b.workingStpId);assert.equal([a,b].filter(value=>value.deduplicated).length,1);assert.equal(count(state,'flow_stp_working_records'),1n);const service3=new StpService({db:second,artifactStore:state.artifacts,productWorkspaceReader:state.sources,b8ClearanceReader:state.sources,uuid:()=>lockId,now:()=>new Date('2026-10-01T00:00:01Z')});const request={contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:a.workingDigest} as const;const [first,secondLock]=await Promise.all([state.service.lock(request,owner),service3.lock(request,owner)]);assert.equal(first.lockId,secondLock.lockId);assert.equal([first,secondLock].filter(value=>value.deduplicated).length,1);assert.equal(count(state,'flow_locked_stps'),1n);second.close();state.db.close();});

test('non-active pre-existing lock artifact manifest fails closed',async()=>{const state=setup();const draft=await state.service.saveWorking(save());const actor={actorId:'owner:khang',roleSnapshot:'OWNER' as const};const request={contractVersion:'1.0.0',productWorkspaceId:workspaceId,expectedWorkingDigest:draft.workingDigest} as const;const requestSha=digest({request,actor,requiredCapability:'governance:product-b9-lock',policy:{policyId:'governance:product-b9-lock-v1',policyVersion:1},productWorkspaceArtifactSha256:digest(workspace()),b8ClearanceId:clearanceId,b8ClearanceArtifactSha256:digest(clearance())});const artifact:LockedStpArtifact={contractVersion:'1.0.0',lockId,state:'LOCKED_STP',lockedAt:'2026-10-01T00:00:01.000Z',requestSha256:requestSha,workingStp:{workingStpId:workingId,workingDigest:draft.workingDigest,content:contentOf(save())},productWorkspace:{productWorkspaceArtifactSha256:digest(workspace()),artifact:workspace()},b8Clearance:{clearanceId,clearanceArtifactSha256:digest(clearance()),state:'READY_FOR_B9'},actor,requiredCapability:'governance:product-b9-lock',policy:{policyId:'governance:product-b9-lock-v1',policyVersion:1}};const stored=await state.artifacts.put(Buffer.from(canonicalJson(artifact)));state.db.prepare("INSERT INTO artifact_manifests VALUES(?,?,'application/json',?,'2000-01-01T00:00:00.000Z','1.0.0','held','2000-01-01T00:00:00.000Z')").run(stored.sha256,stored.byteSize,stored.relativePath);await assert.rejects(state.service.lock(request,owner),StpIdentityConflictError);assert.equal(count(state,'flow_locked_stps'),0n);state.db.close();});
