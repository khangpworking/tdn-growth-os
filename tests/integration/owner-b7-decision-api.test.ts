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
import { FlowDiscoveryWorkspaceReader } from '../../src/modules/flow/discovery-workspace-reader.js';
import { ProductCandidateService } from '../../src/modules/flow/product-candidate-service.js';
import { FlowProductCandidateReader } from '../../src/modules/flow/product-candidate-reader.js';
import { CandidateBasketService } from '../../src/modules/flow/candidate-basket-service.js';
import { createOwnerApiServer } from '../../src/api/owner-api.js';
import { createWorkspaceApiServer } from '../../src/api/workspace-api.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const workspace = '11111111-1111-4111-8111-111111111111';
const otherWorkspace = '11111111-1111-4111-8111-222222222222';
const candidate = '22222222-2222-4222-8222-111111111111';
const otherCandidate = '22222222-2222-4222-8222-222222222222';
const basket = '33333333-3333-4333-8333-111111111111';
const otherBasket = '33333333-3333-4333-8333-222222222222';
const decision = '44444444-4444-4444-8444-111111111111';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-owner-b7-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath }); const store = new ContentAddressedArtifactStore(artifactRoot);
  let workspaceIndex = 0;
  const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: store, uuid: () => [workspace, otherWorkspace][workspaceIndex++]! });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'calcium', title: 'Thị trường canxi' });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'other', title: 'Thị trường khác' });
  let candidateIndex = 0;
  const candidates = new ProductCandidateService({ db, artifactStore: store, uuid: () => [candidate, otherCandidate][candidateIndex++]! });
  await candidates.createCandidate({ contractVersion: '1.0.0', workspaceId: workspace, candidateKey: 'adult', label: 'Canxi người lớn', summary: 'Ứng viên synthetic.' });
  await candidates.createCandidate({ contractVersion: '1.0.0', workspaceId: otherWorkspace, candidateKey: 'other', label: 'Ứng viên khác' });
  let basketIndex = 0;
  const baskets = new CandidateBasketService({ db, artifactStore: store, workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), candidateReader: new FlowProductCandidateReader(candidates), uuid: () => [basket, otherBasket][basketIndex++]! });
  await baskets.freezeBasket({ contractVersion: '1.0.0', workspaceId: workspace, basketKey: 'shortlist', version: 1, candidates: [{ candidateId: candidate, candidateVersion: 1 }] });
  await baskets.freezeBasket({ contractVersion: '1.0.0', workspaceId: otherWorkspace, basketKey: 'private', version: 1, candidates: [{ candidateId: otherCandidate, candidateVersion: 1 }] });
  db.close(); return { databasePath, artifactRoot };
}
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };
const endpoint = (base: string, workspaceId = workspace, basketId = basket) => `${base}/owner-api/workspaces/${workspaceId}/candidate-baskets/${basketId}/b7-decisions`;
const readEndpoint = (base: string) => `${base}/api/workspaces/${workspace}/candidate-baskets/${basket}/b7`;
const body = (result: 'PASS' | 'HOLD' | 'REJECT' = 'PASS', patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', candidateId: candidate, candidateVersion: 1, decision: result, ...patch });
async function serveOwner(state: Awaited<ReturnType<typeof fixture>>, run: (base: string) => Promise<void>) {
  const api = createOwnerApiServer({ ...state, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', now: () => new Date('2027-02-01T00:00:00Z'), uuid: () => decision });
  api.server.listen(0, '127.0.0.1'); await once(api.server, 'listening');
  try { await run(`http://127.0.0.1:${(api.server.address() as AddressInfo).port}`); } finally { await api.close(); }
}

for (const result of ['PASS', 'HOLD', 'REJECT'] as const) test(`OWNER records one immutable ${result} B7 decision and exposes its effective read state`, async () => {
  const state = await fixture();
  await serveOwner(state, async (base) => {
    const response = await fetch(endpoint(base), { method: 'POST', headers, body: body(result) });
    assert.equal(response.status, 201);
    assert.deepEqual(await response.json(), { contractVersion: '1.0.0', decisionId: decision, workspaceId: workspace, basketId: basket, candidateId: candidate, candidateVersion: 1, decision: result, decidedAt: '2027-02-01T00:00:00.000Z', exactRetry: false });
  });
  const db = new BetterSqlite3(state.databasePath);
  assert.deepEqual(db.prepare('SELECT decision,actor_id actorId,role_snapshot role,required_capability capability,policy_id policy FROM governance_candidate_b7_decisions').get(), { decision: result, actorId: 'owner:local', role: 'OWNER', capability: 'governance:candidate-b7-review', policy: 'governance:candidate-b7-review-v1' });
  assert.equal((db.prepare('SELECT count(*) count FROM flow_product_workspaces').get() as { count: number }).count, 0); db.close();
  const api = createWorkspaceApiServer(state); api.server.listen(0, '127.0.0.1'); await once(api.server, 'listening');
  try { const read = await fetch(readEndpoint(`http://127.0.0.1:${(api.server.address() as AddressInfo).port}`)); assert.equal(read.status, 200); const value = await read.json() as any; assert.equal(value.candidates[0].effectiveState, result); assert.equal(value.candidates[0].decisionId, decision); assert.doesNotMatch(JSON.stringify(value), /actor|capability|policy|sha256|artifact/i); } finally { await api.close(); }
});

test('B7 exact retry is zero-mutation while changed decision, wrong membership and cross-workspace pairing conflict', async () => {
  const state = await fixture(); await serveOwner(state, async (base) => {
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body() })).status, 201);
    const db = new BetterSqlite3(state.databasePath); const before = db.prepare('SELECT (SELECT count(*) FROM governance_candidate_b7_decisions) decisions,(SELECT count(*) FROM artifact_manifests) manifests').get(); db.close();
    const retry = await fetch(endpoint(base), { method: 'POST', headers, body: body() }); assert.equal(retry.status, 200); assert.equal(((await retry.json()) as any).exactRetry, true);
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body('HOLD') })).status, 409);
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body('PASS', { candidateVersion: 2 }) })).status, 409);
    assert.equal((await fetch(endpoint(base, workspace, otherBasket), { method: 'POST', headers, body: body() })).status, 409);
    const check = new BetterSqlite3(state.databasePath); assert.deepEqual(check.prepare('SELECT (SELECT count(*) FROM governance_candidate_b7_decisions) decisions,(SELECT count(*) FROM artifact_manifests) manifests').get(), before); check.close();
  });
});

test('concurrent identical B7 requests serialize to one creation and one exact retry', async () => {
  const state = await fixture(); await serveOwner(state, async (base) => {
    const responses = await Promise.all([fetch(endpoint(base), { method: 'POST', headers, body: body('HOLD') }), fetch(endpoint(base), { method: 'POST', headers, body: body('HOLD') })]);
    assert.deepEqual(responses.map((response) => response.status).sort(), [200, 201]);
    const receipts = await Promise.all(responses.map((response) => response.json() as Promise<any>));
    assert.equal(new Set(receipts.map((receipt) => receipt.decisionId)).size, 1); assert.deepEqual(receipts.map((receipt) => receipt.exactRetry).sort(), [false, true]);
  });
  const db = new BetterSqlite3(state.databasePath); assert.equal((db.prepare('SELECT count(*) count FROM governance_candidate_b7_decisions').get() as { count: number }).count, 1); db.close();
});

test('B7 route is closed, authenticated, origin-bound, and schema-generated without caller authority fields', async () => {
  const state = await fixture(); await serveOwner(state, async (base) => {
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers: { ...headers, authorization: '' }, body: body() })).status, 401);
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers: { ...headers, origin: 'http://evil.local' }, body: body() })).status, 403);
    for (const invalid of [body('PASS', { actorId: 'attacker' }), body('PASS', { rationale: 'invented' }), body('PASS', { decision: 'APPROVE' }), body('PASS', { candidateId: 'bad' })]) assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: invalid })).status, 400);
    assert.equal((await fetch(endpoint(base, workspace, '99999999-9999-4999-8999-999999999999'), { method: 'POST', headers, body: body() })).status, 404);
  });
  const schema = JSON.parse(fs.readFileSync('contracts/api/owner-b7-decision-api.schema.json', 'utf8')) as any;
  assert.equal(schema.$defs.request.additionalProperties, false); assert.deepEqual(schema.$defs.request.required, ['contractVersion', 'candidateId', 'candidateVersion', 'decision']);
  assert.equal(schema.$defs.receipt.additionalProperties, false); assert.ok(schema.$defs.receipt.required.includes('workspaceId')); assert.ok(schema.$defs.receipt.required.includes('basketId')); assert.match(fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8'), /owner-b7-decision-api/);
});

test('committed B7 artifact drift fails closed and does not create another decision', async () => {
  const state = await fixture(); await serveOwner(state, async (base) => {
    await fetch(endpoint(base), { method: 'POST', headers, body: body() });
    const db = new BetterSqlite3(state.databasePath); const row = db.prepare('SELECT decision_artifact_sha256 digest FROM governance_candidate_b7_decisions').get() as { digest: string }; db.close();
    fs.writeFileSync(path.join(state.artifactRoot, 'sha256', row.digest.slice(0, 2), row.digest), 'corrupt');
    const response = await fetch(endpoint(base), { method: 'POST', headers, body: body() }); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: { code: 'integrity_error', message: 'Stored workspace data failed integrity verification' } });
  });
  const db = new BetterSqlite3(state.databasePath); assert.equal((db.prepare('SELECT count(*) count FROM governance_candidate_b7_decisions').get() as { count: number }).count, 1); db.close();
});


test('exact B7 retry recovers only an absent canonical artifact with no database mutation', async () => {
  const state = await fixture();
  await serveOwner(state, async (base) => {
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body() })).status, 201);
    const db = new BetterSqlite3(state.databasePath);
    const row = db.prepare('SELECT decision_artifact_sha256 digest FROM governance_candidate_b7_decisions').get() as { digest: string };
    const before = db.prepare('SELECT total_changes() changes,(SELECT count(*) FROM governance_candidate_b7_decisions) decisions,(SELECT count(*) FROM artifact_manifests) manifests').get() as any;
    db.close();
    const canonicalPath = path.join(state.artifactRoot, 'sha256', row.digest.slice(0, 2), row.digest);
    fs.unlinkSync(canonicalPath);
    const response = await fetch(endpoint(base), { method: 'POST', headers, body: body() });
    assert.equal(response.status, 200);
    const receipt = await response.json() as any;
    assert.equal(receipt.exactRetry, true); assert.equal(receipt.workspaceId, workspace); assert.equal(receipt.basketId, basket);
    assert.equal(fs.existsSync(canonicalPath), true);
    const check = new BetterSqlite3(state.databasePath);
    assert.deepEqual(check.prepare('SELECT (SELECT count(*) FROM governance_candidate_b7_decisions) decisions,(SELECT count(*) FROM artifact_manifests) manifests').get(), { decisions: before.decisions, manifests: before.manifests });
    check.close();
  });
});

test('missing B7 artifact is not healed for a changed request', async () => {
  const state = await fixture();
  await serveOwner(state, async (base) => {
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body() })).status, 201);
    const db = new BetterSqlite3(state.databasePath); const row = db.prepare('SELECT decision_artifact_sha256 digest FROM governance_candidate_b7_decisions').get() as { digest:string }; db.close();
    const canonicalPath = path.join(state.artifactRoot, 'sha256', row.digest.slice(0, 2), row.digest); fs.unlinkSync(canonicalPath);
    const response = await fetch(endpoint(base), { method: 'POST', headers, body: body('HOLD') });
    assert.equal(response.status, 500); assert.equal(fs.existsSync(canonicalPath), false);
  });
});
