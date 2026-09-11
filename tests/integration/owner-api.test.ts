import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
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
import { FlowCandidateBasketReader } from '../../src/modules/flow/candidate-basket-reader.js';
import { CandidateB7DecisionService, CANDIDATE_B7_DECISION_CAPABILITY, CANDIDATE_B7_DECISION_POLICY_ID } from '../../src/modules/governance/candidate-b7-decision-service.js';
import { GovernanceCandidateB7DecisionReader } from '../../src/modules/governance/candidate-b7-decision-reader.js';
import { ProductWorkspaceService } from '../../src/modules/flow/product-workspace-service.js';
import { createOwnerApiServer, openOwnerApi } from '../../src/api/owner-api.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const allowedOrigin = 'http://127.0.0.1:5173';
const product = '55555555-5555-4555-8555-111111111111';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

async function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-owner-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath }); const artifacts = new ContentAddressedArtifactStore(artifactRoot);
  const discoveries = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => '11111111-1111-4111-8111-111111111111' });
  await discoveries.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'owner-test', title: 'Không gian thử nghiệm' });
  const candidates = new ProductCandidateService({ db, artifactStore: artifacts, uuid: () => '22222222-2222-4222-8222-111111111111' });
  await candidates.createCandidate({ contractVersion: '1.0.0', workspaceId: '11111111-1111-4111-8111-111111111111', candidateKey: 'calcium', label: 'Canxi thử nghiệm' });
  const baskets = new CandidateBasketService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(discoveries), candidateReader: new FlowProductCandidateReader(candidates), uuid: () => '33333333-3333-4333-8333-111111111111' });
  await baskets.freezeBasket({ contractVersion: '1.0.0', workspaceId: '11111111-1111-4111-8111-111111111111', basketKey: 'basket', version: 1, candidates: [{ candidateId: '22222222-2222-4222-8222-111111111111', candidateVersion: 1 }] });
  const b7 = new CandidateB7DecisionService({ db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets), configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY }, uuid: () => '44444444-4444-4444-8444-111111111111' });
  await b7.decide({ contractVersion: '1.0.0', basketId: '33333333-3333-4333-8333-111111111111', candidateId: '22222222-2222-4222-8222-111111111111', candidateVersion: 1, decision: 'PASS' }, { actorId: 'owner:fixture', roleSnapshot: 'OWNER', capabilities: new Set([CANDIDATE_B7_DECISION_CAPABILITY]) });
  const products = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(b7), uuid: () => product });
  await products.createWorkspace({ contractVersion: '1.0.0', decisionId: '44444444-4444-4444-8444-111111111111', productWorkspaceKey: 'calcium-product' });
  db.close(); return { root, databasePath, artifactRoot };
}
async function serve(state: Awaited<ReturnType<typeof fixture>>, run: (base: string) => Promise<void>) {
  let index = 0; const api = createOwnerApiServer({ ...state, writeEnabled: true, token, allowedOrigin, actorId: 'owner:local', now: () => new Date('2027-01-01T00:00:00Z'), uuid: () => `66666666-6666-4666-8666-${String(++index).padStart(12, '0')}` });
  api.server.listen(0, '127.0.0.1'); await once(api.server, 'listening');
  try { await run(`http://127.0.0.1:${(api.server.address() as AddressInfo).port}`); } finally { await api.close(); }
}
const endpoint = (base: string) => `${base}/owner-api/product-workspaces/${product}/b8-decisions`;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: allowedOrigin };
const body = (lane = 'LEGAL', expectedVersion = 0, decision = 'PASS') => JSON.stringify({ contractVersion: '1.0.0', lane, expectedVersion, decision });

test('launcher requires explicit opt-in and rejects non-loopback binding before opening storage', () => {
  const script = path.resolve('scripts/serve-owner-api.ts');
  const baseEnv = { ...process.env, TDN_WORKSPACE_DB: '/does/not/exist.sqlite', TDN_ARTIFACT_ROOT: '/does/not/exist', TDN_OWNER_API_TOKEN: token, TDN_OWNER_API_ALLOWED_ORIGIN: allowedOrigin, TDN_OWNER_API_ACTOR_ID: 'owner:local' };
  const disabled = spawnSync(process.execPath, ['--import', 'tsx', script], { env: baseEnv, encoding: 'utf8' });
  assert.notEqual(disabled.status, 0); assert.match(disabled.stderr, /ENABLED must be exactly true/);
  const exposed = spawnSync(process.execPath, ['--import', 'tsx', script], { env: { ...baseEnv, TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_HOST: '0.0.0.0' }, encoding: 'utf8' });
  assert.notEqual(exposed.status, 0); assert.match(exposed.stderr, /must be a loopback host/);
});

test('startup configuration fails closed for weak credentials, origins, actor and missing owner tables', async () => {
  const state = await fixture();
  for (const patch of [{ token: 'weak' }, { allowedOrigin: '*' }, { allowedOrigin: `${allowedOrigin}/path` }, { actorId: 'OWNER bad' }]) assert.throws(() => openOwnerApi({ ...state, writeEnabled: true, token, allowedOrigin, actorId: 'owner:local', ...patch }));
  const empty = path.join(state.root, 'empty.sqlite'); new BetterSqlite3(empty).close();
  assert.throws(() => openOwnerApi({ ...state, databasePath: empty, writeEnabled: true, token, allowedOrigin, actorId: 'owner:local' }), /required owner tables/);
});

test('authentication, exact-origin CORS, preflight, method, media type and bounded closed body are narrow', async () => {
  const state = await fixture(); await serve(state, async (base) => {
    for (const authorization of [undefined, 'Bearer wrong-owner-token-with-at-least-32-characters', `Basic ${token}`, `Bearer ${token}x`]) {
      const response = await fetch(endpoint(base), { method: 'POST', headers: { 'content-type': 'application/json', ...(authorization ? { authorization } : {}) }, body: body() }); assert.equal(response.status, 401); assert.equal(response.headers.get('access-control-allow-origin'), null);
    }
    const denied = await fetch(endpoint(base), { method: 'POST', headers: { ...headers, origin: 'http://evil.local' }, body: body() }); assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const preflight = await fetch(endpoint(base), { method: 'OPTIONS', headers: { origin: allowedOrigin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'Authorization, Content-Type' } }); assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.equal((await fetch(endpoint(base), { method: 'OPTIONS', headers: { origin: allowedOrigin, 'access-control-request-method': 'DELETE', 'access-control-request-headers': 'Authorization, Content-Type' } })).status, 403);
    assert.equal((await fetch(endpoint(base), { method: 'GET', headers })).status, 405);
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers: { ...headers, 'content-type': 'text/plain' }, body: body() })).status, 400);
    for (const invalid of ['', '{', JSON.stringify({ contractVersion: '1.0.0', lane: 'LEGAL', expectedVersion: 0, decision: 'PASS', actorId: 'attacker' }), JSON.stringify({ contractVersion: '1.0.0', productWorkspaceId: product, lane: 'LEGAL', expectedVersion: 0, decision: 'PASS' })]) assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: invalid })).status, 400);
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: 'x'.repeat(4097) })).status, 400);
    assert.equal((await fetch(`${base}/owner-api/product-workspaces/not-a-uuid/b8-decisions`, { method: 'POST', headers, body: body() })).status, 400);
  });
});

test('all lanes and decisions produce narrow receipts; exact retries deduplicate and conflicts/concurrency mutate only B8 owner scope', async () => {
  const state = await fixture();
  const beforeDb = new BetterSqlite3(state.databasePath);
  const beforeTables = beforeDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[];
  const protectedCounts = Object.fromEntries(beforeTables.filter(({ name }) => !['artifact_manifests', 'governance_product_b8_lane_decisions'].includes(name)).map(({ name }) => [name, (beforeDb.prepare(`SELECT count(*) count FROM \"${name}\"`).get() as { count: number }).count]));
  beforeDb.close();
  await serve(state, async (base) => {
    for (const lane of ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'] as const) for (const [expectedVersion, decision] of ['PASS', 'HOLD', 'REJECT'].entries()) {
      const response = await fetch(endpoint(base), { method: 'POST', headers, body: body(lane, expectedVersion, decision) }); assert.equal(response.status, 201); const receipt = await response.json() as any;
      assert.deepEqual(Object.keys(receipt).sort(), ['contractVersion','decision','decisionId','decisionVersion','decidedAt','exactRetry','lane'].sort()); assert.deepEqual([receipt.lane, receipt.decision, receipt.decisionVersion, receipt.exactRetry, receipt.decidedAt], [lane, decision, expectedVersion + 1, false, '2027-01-01T00:00:00.000Z']);
    }
    const retry = await fetch(endpoint(base), { method: 'POST', headers, body: body('LEGAL', 0, 'PASS') }); assert.equal(retry.status, 200); assert.equal((await retry.json() as any).exactRetry, true);
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body('LEGAL', 3, 'REJECT') })).status, 409, 'repeated effective state is a conflict');
    assert.equal((await fetch(endpoint(base), { method: 'POST', headers, body: body('LEGAL', 0, 'REJECT') })).status, 409);
    const concurrent = await Promise.all([0, 1].map(() => fetch(endpoint(base), { method: 'POST', headers, body: body('LEGAL', 3, 'HOLD') })));
    assert.deepEqual(concurrent.map((r) => r.status).sort(), [200, 201]);
  });
  const db = new BetterSqlite3(state.databasePath); const rows = db.prepare('SELECT lane,decision,actor_id actorId,role_snapshot role,required_capability capability,policy_id policy FROM governance_product_b8_lane_decisions ORDER BY lane,decision_version').all() as any[];
  assert.equal(rows.length, 13); assert.ok(rows.every((row) => row.actorId === 'owner:local' && row.role === 'OWNER' && row.capability === 'governance:product-b8-review' && row.policy === 'governance:product-b8-review-v1'));
  assert.deepEqual(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all(), beforeTables);
  for (const [table, count] of Object.entries(protectedCounts)) assert.equal((db.prepare(`SELECT count(*) count FROM \"${table}\"`).get() as { count: number }).count, count, `${table} must remain unchanged`);
  db.close();
  assert.equal(fs.statSync(state.databasePath).mode & 0o077, 0, 'database must not grant group/other permissions');
  const artifactFiles = fs.readdirSync(state.artifactRoot, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
  assert.ok(artifactFiles.length > 0); for (const file of artifactFiles) assert.equal(fs.statSync(file).mode & 0o077, 0, `${file} must be owner-only`);
});
