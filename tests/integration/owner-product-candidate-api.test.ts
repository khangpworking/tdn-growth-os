import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import BetterSqlite3 from 'better-sqlite3';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService } from '../../src/modules/flow/discovery-workspace-service.js';
import { createOwnerApiServer } from '../../src/api/owner-api.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const workspaceOne = '11111111-1111-4111-8111-111111111111';
const workspaceTwo = '22222222-2222-4222-8222-222222222222';
const candidateId = '33333333-3333-4333-8333-000000000001';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-owner-candidate-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath }); const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  let id = 0;
  const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => [workspaceOne, workspaceTwo][id++]! });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'one', title: 'Workspace one' });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'two', title: 'Workspace two' });
  db.close(); return { root, databasePath, artifactRoot };
}
async function serve(state: Awaited<ReturnType<typeof fixture>>, run: (base: string) => Promise<void>) {
  let id = 0;
  const api = createOwnerApiServer({ ...state, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', now: () => new Date(`2027-01-0${id + 1}T00:00:00Z`), uuid: () => `33333333-3333-4333-8333-${String(++id).padStart(12, '0')}` });
  api.server.listen(0, '127.0.0.1'); await once(api.server, 'listening');
  try { await run(`http://127.0.0.1:${(api.server.address() as AddressInfo).port}`); } finally { await api.close(); }
}
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };
const createEndpoint = (base: string, workspaceId = workspaceOne) => `${base}/owner-api/workspaces/${workspaceId}/candidates`;
const revisionEndpoint = (base: string, workspaceId = workspaceOne, id = candidateId) => `${base}/owner-api/workspaces/${workspaceId}/candidates/${id}/revisions`;
const createBody = (label = 'Calcium', patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', candidateKey: 'calcium', label, summary: 'Daily calcium', ...patch });
const revisionBody = (expectedVersion = 1, label = 'Calcium v2', patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion, label, summary: 'Revised calcium', ...patch });

function counts(databasePath: string) {
  const db = new BetterSqlite3(databasePath);
  const value = db.prepare(`SELECT (SELECT count(*) FROM flow_product_candidates) candidates,
    (SELECT count(*) FROM flow_product_candidate_revisions) revisions,
    (SELECT count(*) FROM flow_candidate_baskets) baskets,
    (SELECT count(*) FROM governance_candidate_b7_decisions) b7,
    (SELECT count(*) FROM flow_product_workspaces) products`).get();
  db.close(); return value;
}

 test('OWNER candidate create and append-only revision return closed receipts, exact retries, and no downstream mutation', async () => {
  const state = await fixture(); const before = counts(state.databasePath);
  await serve(state, async (base) => {
    const created = await fetch(createEndpoint(base), { method: 'POST', headers, body: createBody() });
    assert.equal(created.status, 201); const first = await created.json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(first).sort(), ['candidateId','candidateKey','contractVersion','createdAt','exactRetry','label','state','summary','version','workspaceId'].sort());
    assert.deepEqual({ ...first, createdAt: '<time>' }, { contractVersion: '1.0.0', candidateId, workspaceId: workspaceOne, candidateKey: 'calcium', state: 'EXPLORING', version: 1, label: 'Calcium', summary: 'Daily calcium', createdAt: '<time>', exactRetry: false });
    const retry = await fetch(createEndpoint(base), { method: 'POST', headers, body: createBody() });
    assert.equal(retry.status, 200); assert.equal(((await retry.json()) as any).exactRetry, true);
    const revised = await fetch(revisionEndpoint(base), { method: 'POST', headers, body: revisionBody() });
    assert.equal(revised.status, 201); const second = await revised.json() as any;
    assert.deepEqual([second.version, second.label, second.exactRetry], [2, 'Calcium v2', false]);
    assert.deepEqual(Object.keys(second).sort(), Object.keys(first).sort());
    const revisionRetry = await fetch(revisionEndpoint(base), { method: 'POST', headers, body: revisionBody() });
    assert.equal(revisionRetry.status, 200); assert.equal(((await revisionRetry.json()) as any).exactRetry, true);
    assert.equal((await fetch(createEndpoint(base), { method: 'POST', headers, body: createBody('Changed') })).status, 409);
    assert.equal((await fetch(revisionEndpoint(base), { method: 'POST', headers, body: revisionBody(1, 'Changed') })).status, 409);
  });
  const db = new BetterSqlite3(state.databasePath);
  assert.deepEqual(db.prepare('SELECT version,label FROM flow_product_candidate_revisions ORDER BY version').all(), [{ version: 1, label: 'Calcium' }, { version: 2, label: 'Calcium v2' }]);
  const rows = db.prepare('SELECT candidate_artifact_sha256 digest FROM flow_product_candidate_revisions ORDER BY version').all() as {digest:string}[];
  for (const { digest } of rows) assert.ok(fs.existsSync(path.join(state.artifactRoot, 'sha256', digest.slice(0, 2), digest)));
  db.close(); const after = counts(state.databasePath) as Record<string, bigint>; assert.equal(after.candidates, 1); assert.equal(after.revisions, 2); assert.equal(after.baskets, (before as Record<string, bigint>).baskets); assert.equal(after.b7, (before as Record<string, bigint>).b7); assert.equal(after.products, (before as Record<string, bigint>).products);
});

test('candidate URLs are authoritative and unknown or wrong workspace/candidate pairings fail closed', async () => {
  const state = await fixture(); await serve(state, async (base) => {
    assert.equal((await fetch(createEndpoint(base, '99999999-9999-4999-8999-999999999999'), { method: 'POST', headers, body: createBody() })).status, 404);
    assert.equal((await fetch(createEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion:'1.0.0', workspaceId:workspaceTwo, candidateKey:'calcium', label:'x' }) })).status, 400);
    assert.equal((await fetch(createEndpoint(base), { method: 'POST', headers, body: createBody() })).status, 201);
    assert.equal((await fetch(revisionEndpoint(base, workspaceOne, '99999999-9999-4999-8999-999999999999'), { method:'POST', headers, body:revisionBody() })).status, 404);
    assert.equal((await fetch(revisionEndpoint(base, workspaceTwo), { method:'POST', headers, body:revisionBody() })).status, 409);
    assert.equal((await fetch(revisionEndpoint(base), { method:'POST', headers, body:JSON.stringify({ contractVersion:'1.0.0', candidateId:'99999999-9999-4999-8999-999999999999', expectedVersion:1, label:'x' }) })).status, 400);
  });
});

test('exact retries recover only the exact missing create/revision canonical target and reject corruption', async () => {
  const state = await fixture(); const unrelated = await new ContentAddressedArtifactStore(state.artifactRoot).put(Buffer.from('pre-existing-unregistered'));
  await serve(state, async (base) => {
    await fetch(createEndpoint(base), { method:'POST', headers, body:createBody() });
    await fetch(revisionEndpoint(base), { method:'POST', headers, body:revisionBody() });
    const db = new BetterSqlite3(state.databasePath);
    const rows = db.prepare('SELECT version,candidate_artifact_sha256 digest FROM flow_product_candidate_revisions ORDER BY version').all() as {version:number;digest:string}[];
    for (const row of rows) fs.unlinkSync(path.join(state.artifactRoot, 'sha256', row.digest.slice(0,2), row.digest));
    db.close();
    assert.equal((await fetch(createEndpoint(base), { method:'POST', headers, body:createBody() })).status, 200);
    assert.equal((await fetch(revisionEndpoint(base), { method:'POST', headers, body:revisionBody() })).status, 200);
    for (const row of rows) assert.ok(fs.existsSync(path.join(state.artifactRoot, 'sha256', row.digest.slice(0,2), row.digest)));
    assert.equal(fs.readFileSync(unrelated.absolutePath, 'utf8'), 'pre-existing-unregistered');
    assert.deepEqual(fs.readdirSync(path.join(state.artifactRoot, '.owner-api-requests')), []);
    fs.unlinkSync(path.join(state.artifactRoot, 'sha256', rows[1]!.digest.slice(0,2), rows[1]!.digest));
    const corrupt = new BetterSqlite3(state.databasePath); corrupt.prepare('UPDATE artifact_manifests SET byte_size=byte_size+1 WHERE sha256=?').run(rows[1]!.digest); corrupt.close();
    assert.equal((await fetch(revisionEndpoint(base), { method:'POST', headers, body:revisionBody() })).status, 500);
    assert.equal(fs.readFileSync(unrelated.absolutePath, 'utf8'), 'pre-existing-unregistered');
  });
});

test('duplicate labels stay independent while summaries and sequential versions remain exact and historical', async () => {
  const state = await fixture(); await serve(state, async (base) => {
    const absent = JSON.stringify({ contractVersion:'1.0.0', candidateKey:'first-key', label:'Trùng tên' });
    const present = JSON.stringify({ contractVersion:'1.0.0', candidateKey:'second-key', label:'Trùng tên', summary:'Có tóm tắt' });
    const first = await fetch(createEndpoint(base), { method:'POST', headers, body:absent }); const second = await fetch(createEndpoint(base), { method:'POST', headers, body:present });
    assert.equal(first.status, 201); assert.equal(second.status, 201); const firstReceipt = await first.json() as any; const secondReceipt = await second.json() as any;
    assert.notEqual(firstReceipt.candidateId, secondReceipt.candidateId); assert.equal(firstReceipt.summary, undefined); assert.equal(secondReceipt.summary, 'Có tóm tắt');
    const endpoint = revisionEndpoint(base, workspaceOne, firstReceipt.candidateId);
    const add = JSON.stringify({ contractVersion:'1.0.0', expectedVersion:1, label:'Trùng tên', summary:'Đã thêm' });
    const change = JSON.stringify({ contractVersion:'1.0.0', expectedVersion:2, label:'Tên v3', summary:'Đã đổi' });
    const omit = JSON.stringify({ contractVersion:'1.0.0', expectedVersion:3, label:'Tên v4' });
    assert.equal((await fetch(endpoint,{method:'POST',headers,body:add})).status,201); assert.equal((await fetch(endpoint,{method:'POST',headers,body:change})).status,201); const fourth=await fetch(endpoint,{method:'POST',headers,body:omit}); assert.equal(fourth.status,201); assert.equal((await fourth.json() as any).summary,undefined);
    assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({contractVersion:'1.0.0',expectedVersion:1,label:'stale'})})).status,409);
    assert.equal((await fetch(endpoint,{method:'POST',headers,body:JSON.stringify({contractVersion:'1.0.0',expectedVersion:6,label:'skipped'})})).status,409);
  });
  const db=new BetterSqlite3(state.databasePath); const rows=db.prepare('SELECT version,label,summary FROM flow_product_candidate_revisions WHERE candidate_id=? ORDER BY version').all(candidateId); assert.deepEqual(rows,[{version:1,label:'Trùng tên',summary:null},{version:2,label:'Trùng tên',summary:'Đã thêm'},{version:3,label:'Tên v3',summary:'Đã đổi'},{version:4,label:'Tên v4',summary:null}]); assert.equal((db.prepare('SELECT count(*) count FROM flow_product_candidates').get() as any).count,2); db.close();
});

test('candidate route authentication and malformed closed bodies fail without candidate mutation', async()=>{
  const state=await fixture(); const before=counts(state.databasePath); await serve(state,async(base)=>{
    assert.equal((await fetch(createEndpoint(base),{method:'POST',headers:{...headers,authorization:''},body:createBody()})).status,401);
    assert.equal((await fetch(createEndpoint(base),{method:'POST',headers:{...headers,origin:'http://evil.local'},body:createBody()})).status,403);
    for(const body of [{contractVersion:'1.0.0',candidateKey:'calcium',label:''},{contractVersion:'1.0.0',candidateKey:'bad key',label:'x'},{contractVersion:'1.0.0',candidateKey:'calcium',label:'x',summary:''},{contractVersion:'1.0.0',candidateKey:'calcium',label:'x',score:1}]) assert.equal((await fetch(createEndpoint(base),{method:'POST',headers,body:JSON.stringify(body)})).status,400);
  }); assert.deepEqual(counts(state.databasePath),before);
});

test('generated OWNER candidate API schema is registered and closed', () => {
  const schema = JSON.parse(fs.readFileSync(path.resolve('contracts/api/owner-product-candidate-api.schema.json'), 'utf8'));
  assert.equal(schema.$defs.createRequest.additionalProperties, false); assert.equal(schema.$defs.revisionRequest.additionalProperties, false); assert.equal(schema.$defs.receipt.additionalProperties, false);
  const generator = fs.readFileSync(path.resolve('scripts/generate-foundation-contract.mjs'), 'utf8'); assert.match(generator, /\['api', 'owner-product-candidate-api'\]/);
});


test('persisted candidate workspace drift is generic integrity failure, not semantic pairing conflict', async()=>{
  const state=await fixture(); await serve(state,async(base)=>{assert.equal((await fetch(createEndpoint(base),{method:'POST',headers,body:createBody()})).status,201);});
  const db=new BetterSqlite3(state.databasePath); db.exec('DROP TRIGGER flow_product_candidates_no_update'); db.prepare('UPDATE flow_product_candidates SET workspace_id=? WHERE candidate_id=?').run(workspaceTwo,candidateId); db.close();
  await serve(state,async(base)=>{assert.equal((await fetch(revisionEndpoint(base,workspaceOne),{method:'POST',headers,body:revisionBody()})).status,500);});
});


test('wrong-workspace exact retry cannot recover or publish a missing candidate artifact',async()=>{
  const state=await fixture(); await serve(state,async(base)=>{await fetch(createEndpoint(base),{method:'POST',headers,body:createBody()});await fetch(revisionEndpoint(base),{method:'POST',headers,body:revisionBody()});});
  const db=new BetterSqlite3(state.databasePath);const row=db.prepare('SELECT candidate_artifact_sha256 digest FROM flow_product_candidate_revisions WHERE candidate_id=? AND version=2').get(candidateId) as {digest:string};db.close();const target=path.join(state.artifactRoot,'sha256',row.digest.slice(0,2),row.digest);fs.unlinkSync(target);
  await serve(state,async(base)=>{assert.equal((await fetch(revisionEndpoint(base,workspaceTwo),{method:'POST',headers,body:revisionBody()})).status,500);});assert.equal(fs.existsSync(target),false);
});
