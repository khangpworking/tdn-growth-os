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
const workspaceEndpoint = (base: string) => `${base}/owner-api/workspaces`;
const endpoint = (base: string) => `${base}/owner-api/product-workspaces/${product}/b8-decisions`;
const clearanceEndpoint = (base: string) => `${base}/owner-api/product-workspaces/${product}/b8-clearance`;
const workingEndpoint = (base: string) => `${base}/owner-api/product-workspaces/${product}/b9/working`;
const lockEndpoint = (base: string) => `${base}/owner-api/product-workspaces/${product}/b9/lock`;
const b10Endpoint = (base: string, productWorkspaceId = product) => `${base}/owner-api/product-workspaces/${productWorkspaceId}/b10-decisions`;
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin: allowedOrigin };
const body = (lane = 'LEGAL', expectedVersion = 0, decision = 'PASS') => JSON.stringify({ contractVersion: '1.0.0', lane, expectedVersion, decision });
async function fourPasses(base: string): Promise<Record<'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE', string>> {
  const result = {} as Record<'LEGAL' | 'SCIENTIFIC' | 'QUALITY' | 'FINANCE', string>;
  for (const lane of ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE'] as const) {
    const response = await fetch(endpoint(base), { method: 'POST', headers, body: body(lane) });
    assert.equal(response.status, 201);
    result[lane] = ((await response.json()) as { decisionId: string }).decisionId;
  }
  return result;
}
const clearanceBody = (decisionIds: Record<string, string>) => JSON.stringify({ contractVersion: '1.0.0', decisionIds });
const workingBody = (clearanceId: string, expectedWorkingRevision: string | null, positioningStatement = 'Canxi tiện dùng mỗi ngày.', patch: Record<string, unknown> = {}) => JSON.stringify({
  contractVersion: '1.0.0', b8ClearanceId: clearanceId, expectedWorkingRevision,
  segments: [{ key: 'adult', label: 'Người trưởng thành', description: 'Ưu tiên sự tiện lợi.' }, { key: 'senior', label: 'Người cao tuổi' }],
  primaryTargetSegmentKey: 'adult', secondaryTargetSegmentKeys: ['senior'], positioningStatement, ...patch,
});
async function clearanceFixture(base: string): Promise<string> {
  const response = await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(await fourPasses(base)) });
  assert.equal(response.status, 201); return ((await response.json()) as { clearanceId: string }).clearanceId;
}
async function lockedFixture(base: string): Promise<string> {
  const clearanceId = await clearanceFixture(base);
  const working = await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, null) });
  assert.equal(working.status, 201); const revision = ((await working.json()) as { workingRevision: string }).workingRevision;
  const locked = await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: revision }) });
  assert.equal(locked.status, 201); return ((await locked.json()) as { lockId: string }).lockId;
}
const b10Body = (lockedStpId: string, previousDecisionId: string | null, decision: 'APPROVE' | 'HOLD' | 'REJECT') => JSON.stringify({ contractVersion: '1.0.0', lockedStpId, previousDecisionId, decision });
function tableCounts(databasePath: string) {
  const db = new BetterSqlite3(databasePath);
  const result = db.prepare(`SELECT
    (SELECT count(*) FROM flow_stp_working_records) working,
    (SELECT count(*) FROM flow_locked_stps) locks,
    (SELECT count(*) FROM governance_product_b10_decisions) b10,
    (SELECT count(*) FROM artifact_manifests) manifests`).get();
  db.close(); return result;
}

test('launcher requires explicit opt-in and rejects non-loopback binding before opening storage', () => {
  const script = path.resolve('scripts/serve-owner-api.ts');
  const baseEnv = { ...process.env, TDN_WORKSPACE_DB: '/does/not/exist.sqlite', TDN_ARTIFACT_ROOT: '/does/not/exist', TDN_OWNER_API_TOKEN: token, TDN_OWNER_API_ALLOWED_ORIGIN: allowedOrigin, TDN_OWNER_API_ACTOR_ID: 'owner:local' };
  const disabled = spawnSync(process.execPath, ['--import', 'tsx', script], { env: baseEnv, encoding: 'utf8' });
  assert.notEqual(disabled.status, 0); assert.match(disabled.stderr, /ENABLED must be exactly true/);
  const exposed = spawnSync(process.execPath, ['--import', 'tsx', script], { env: { ...baseEnv, TDN_OWNER_API_ENABLED: 'true', TDN_OWNER_API_HOST: '0.0.0.0' }, encoding: 'utf8' });
  assert.notEqual(exposed.status, 0); assert.match(exposed.stderr, /must be exactly 127\.0\.0\.1 or ::1/);
});

test('startup configuration fails closed for weak credentials, origins, actor and missing owner tables', async () => {
  const state = await fixture();
  for (const patch of [{ token: 'weak' }, { token: 'x'.repeat(32) }, { allowedOrigin: '*' }, { allowedOrigin: `${allowedOrigin}/path` }, { actorId: 'OWNER bad' }]) assert.throws(() => openOwnerApi({ ...state, writeEnabled: true, token, allowedOrigin, actorId: 'owner:local', ...patch }));
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
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'GET', headers })).status, 405);
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: clearanceBody({}) })).status, 401);
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers: { ...headers, origin: 'http://evil.local' }, body: clearanceBody({}) })).status, 403);
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


test('B8 clearance API accepts exactly four current PASS decisions, returns a closed receipt, and exact retry has zero mutation', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const decisionIds = await fourPasses(base);
    const before = new BetterSqlite3(state.databasePath);
    const productBefore = before.prepare('SELECT * FROM flow_product_workspaces WHERE product_workspace_id=?').get(product);
    const b8Before = before.prepare('SELECT * FROM governance_product_b8_lane_decisions ORDER BY decision_id').all();
    const manifestsBefore = (before.prepare('SELECT count(*) count FROM artifact_manifests').get() as { count: number }).count;
    before.close();

    const created = await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(decisionIds) });
    assert.equal(created.status, 201);
    const receipt = await created.json() as any;
    assert.deepEqual(Object.keys(receipt).sort(), ['clearanceId', 'clearedAt', 'contractVersion', 'exactRetry', 'state']);
    assert.deepEqual({ ...receipt, clearanceId: '<uuid>' }, { contractVersion: '1.0.0', clearanceId: '<uuid>', state: 'READY_FOR_B9', clearedAt: '2027-01-01T00:00:00.000Z', exactRetry: false });
    assert.match(receipt.clearanceId, /^[0-9a-f-]{36}$/i);

    const db = new BetterSqlite3(state.databasePath);
    assert.equal((db.prepare('SELECT count(*) count FROM flow_b8_clearances').get() as { count: number }).count, 1);
    assert.equal((db.prepare('SELECT count(*) count FROM flow_b8_clearance_decisions').get() as { count: number }).count, 4);
    assert.equal((db.prepare('SELECT count(*) count FROM artifact_manifests').get() as { count: number }).count, manifestsBefore + 1);
    assert.deepEqual(db.prepare('SELECT * FROM flow_product_workspaces WHERE product_workspace_id=?').get(product), productBefore);
    assert.deepEqual(db.prepare('SELECT * FROM governance_product_b8_lane_decisions ORDER BY decision_id').all(), b8Before);
    const countsBeforeRetry = db.prepare('SELECT (SELECT count(*) FROM flow_b8_clearances) clearances, (SELECT count(*) FROM flow_b8_clearance_decisions) members, (SELECT count(*) FROM artifact_manifests) artifacts').get();
    db.close();

    const retry = await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(decisionIds) });
    assert.equal(retry.status, 200);
    assert.deepEqual(await retry.json(), { ...receipt, exactRetry: true });
    const afterRetry = new BetterSqlite3(state.databasePath);
    assert.deepEqual(afterRetry.prepare('SELECT (SELECT count(*) FROM flow_b8_clearances) clearances, (SELECT count(*) FROM flow_b8_clearance_decisions) members, (SELECT count(*) FROM artifact_manifests) artifacts').get(), countsBeforeRetry);
    afterRetry.close();

    const different = { ...decisionIds, LEGAL: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' };
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(different) })).status, 409);
  });
});

test('B8 clearance body and effective-decision failures have exact statuses and no clearance mutation', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const ids = await fourPasses(base);
    const invalid: string[] = [
      JSON.stringify({ contractVersion: '1.0.0' }),
      clearanceBody({ LEGAL: ids.LEGAL, SCIENTIFIC: ids.SCIENTIFIC, QUALITY: ids.QUALITY }),
      clearanceBody({ ...ids, EXTRA: ids.LEGAL }),
      clearanceBody({ ...ids, LEGAL: 'bad-id' }),
      clearanceBody({ ...ids, SCIENTIFIC: ids.LEGAL }),
      JSON.stringify({ contractVersion: '1.0.0', decisionIds: ids, attacker: true }),
    ];
    for (const requestBody of invalid) assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: requestBody })).status, 400);

    const hold = await fetch(endpoint(base), { method: 'POST', headers, body: body('LEGAL', 1, 'HOLD') });
    assert.equal(hold.status, 201);
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(ids) })).status, 409, 'stale/mixed PASS and HOLD set');
    const holdId = ((await hold.json()) as { decisionId: string }).decisionId;
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody({ ...ids, LEGAL: holdId }) })).status, 409, 'HOLD is rejected');
    const rejected = await fetch(endpoint(base), { method: 'POST', headers, body: body('LEGAL', 2, 'REJECT') });
    const rejectId = ((await rejected.json()) as { decisionId: string }).decisionId;
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody({ ...ids, LEGAL: rejectId }) })).status, 409, 'REJECT is rejected');
    assert.equal((await fetch(`${base}/owner-api/product-workspaces/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/b8-clearance`, { method: 'POST', headers, body: clearanceBody(ids) })).status, 404);

    const db = new BetterSqlite3(state.databasePath);
    assert.equal((db.prepare('SELECT count(*) count FROM flow_b8_clearances').get() as { count: number }).count, 0);
    assert.equal((db.prepare('SELECT count(*) count FROM flow_b8_clearance_decisions').get() as { count: number }).count, 0);
    db.close();
  });
});

test('concurrent identical B8 clearance requests produce one creation and one exact retry', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const ids = await fourPasses(base);
    const responses = await Promise.all([0, 1].map(() => fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(ids) })));
    assert.deepEqual(responses.map(({ status }) => status).sort(), [200, 201]);
    const receipts = await Promise.all(responses.map((response) => response.json() as Promise<any>));
    assert.equal(receipts[0].clearanceId, receipts[1].clearanceId);
    assert.deepEqual(receipts.map(({ exactRetry }) => exactRetry).sort(), [false, true]);
  });
});


test('generated B8 clearance API contract is closed and registered', () => {
  const schema = JSON.parse(fs.readFileSync('contracts/api/owner-b8-clearance-api.schema.json', 'utf8')) as any;
  assert.deepEqual(schema.oneOf.map((entry: any) => entry.$ref), ['#/$defs/request', '#/$defs/receipt']);
  assert.equal(schema.$defs.request.additionalProperties, false);
  assert.deepEqual(schema.$defs.request.required, ['contractVersion', 'decisionIds']);
  assert.equal(schema.$defs.request.properties.decisionIds.additionalProperties, false);
  assert.deepEqual(schema.$defs.request.properties.decisionIds.required, ['LEGAL', 'SCIENTIFIC', 'QUALITY', 'FINANCE']);
  assert.equal(schema.$defs.receipt.additionalProperties, false);
  assert.deepEqual(schema.$defs.receipt.required, ['contractVersion', 'clearanceId', 'state', 'clearedAt', 'exactRetry']);
  assert.match(fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8'), /\['api', 'owner-b8-clearance-api'\]/);
});

test('stored clearance replay failure is a generic integrity error, not a semantic conflict', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const ids = await fourPasses(base);
    assert.equal((await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(ids) })).status, 201);
    const db = new BetterSqlite3(state.databasePath);
    db.exec('DROP TRIGGER governance_product_b8_lane_decisions_no_delete');
    db.prepare('DELETE FROM governance_product_b8_lane_decisions WHERE decision_id=?').run(ids.LEGAL);
    db.close();
    const retry = await fetch(clearanceEndpoint(base), { method: 'POST', headers, body: clearanceBody(ids) });
    assert.equal(retry.status, 500); assert.deepEqual(await retry.json(), { error: { code: 'integrity_error', message: 'Stored workspace data failed integrity verification' } });
  });
});


test('B9 working save/update/retry and lock expose closed receipts, opaque revisions and exact zero-mutation retries', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const clearanceId = await clearanceFixture(base);
    const before = tableCounts(state.databasePath);
    const created = await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, null) });
    assert.equal(created.status, 201); const first = await created.json() as any;
    assert.deepEqual(Object.keys(first).sort(), ['contractVersion','workingStpId','productWorkspaceId','workingRevision','createdAt','updatedAt','exactRetry'].sort());
    assert.equal(first.productWorkspaceId, product); assert.equal(first.createdAt, '2027-01-01T00:00:00.000Z'); assert.equal(first.updatedAt, first.createdAt);
    assert.match(first.workingRevision, /^wr1_[A-Za-z0-9_-]{43}$/); assert.equal(first.exactRetry, false);
    const afterCreate = tableCounts(state.databasePath); assert.deepEqual({ ...(afterCreate as any), manifests: (before as any).manifests }, { ...(before as any), working: 1 });

    const retry = await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, null) });
    assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), { ...first, exactRetry: true }); assert.deepEqual(tableCounts(state.databasePath), afterCreate);

    const updateBody = workingBody(clearanceId, first.workingRevision, 'Canxi minh bạch cho mỗi ngày.');
    const updated = await fetch(workingEndpoint(base), { method: 'POST', headers, body: updateBody });
    assert.equal(updated.status, 200); const second = await updated.json() as any;
    assert.equal(second.workingStpId, first.workingStpId); assert.notEqual(second.workingRevision, first.workingRevision);
    assert.equal(second.createdAt, first.createdAt); assert.equal(second.updatedAt, '2027-01-01T00:00:00.000Z'); assert.equal(second.exactRetry, false);
    assert.deepEqual(tableCounts(state.databasePath), afterCreate, 'working updates add no row, manifest, lock or B10 mutation');
    const updateRetry = await fetch(workingEndpoint(base), { method: 'POST', headers, body: updateBody });
    assert.equal(updateRetry.status, 200); assert.deepEqual(await updateRetry.json(), { ...second, exactRetry: true }); assert.deepEqual(tableCounts(state.databasePath), afterCreate);
    assert.equal((await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, first.workingRevision, 'stale') })).status, 409);

    const concurrent = await Promise.all([0, 1].map(() => fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, second.workingRevision, 'Bản cập nhật đồng thời.') })));
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 200]);
    const concurrentReceipts = await Promise.all(concurrent.map((response) => response.json() as Promise<any>));
    assert.equal(concurrentReceipts[0].workingRevision, concurrentReceipts[1].workingRevision);
    assert.deepEqual(concurrentReceipts.map((receipt) => receipt.exactRetry).sort(), [false, true]);

    const current = concurrentReceipts[0]; const beforeLock = tableCounts(state.databasePath);
    const locked = await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: current.workingRevision }) });
    assert.equal(locked.status, 201); const lock = await locked.json() as any;
    assert.deepEqual(Object.keys(lock).sort(), ['contractVersion','lockId','state','lockedAt','exactRetry'].sort());
    assert.deepEqual({ state: lock.state, lockedAt: lock.lockedAt, exactRetry: lock.exactRetry }, { state: 'LOCKED_STP', lockedAt: '2027-01-01T00:00:00.000Z', exactRetry: false });
    const db = new BetterSqlite3(state.databasePath); const row = db.prepare('SELECT actor_id actor,role_snapshot role,required_capability capability,policy_id policy FROM flow_locked_stps').get() as any; db.close();
    assert.deepEqual(row, { actor: 'owner:local', role: 'OWNER', capability: 'governance:product-b9-lock', policy: 'governance:product-b9-lock-v1' });
    const afterLock = tableCounts(state.databasePath); assert.equal((afterLock as any).locks, 1); assert.equal((afterLock as any).manifests, (beforeLock as any).manifests + 1); assert.equal((afterLock as any).b10, 0);
    const lockRetry = await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: current.workingRevision }) });
    assert.equal(lockRetry.status, 200); assert.deepEqual(await lockRetry.json(), { ...lock, exactRetry: true }); assert.deepEqual(tableCounts(state.databasePath), afterLock);
    assert.equal((await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: second.workingRevision }) })).status, 409);
    assert.equal((await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, current.workingRevision, 'Sau khóa') })).status, 409);
  });
});

test('B9 rejects malformed, extra, target, length, clearance and missing-lock inputs without orphan mutations', async () => {
  const state = await fixture(); await serve(state, async (base) => {
    const clearanceId = await clearanceFixture(base); const before = tableCounts(state.databasePath);
    const invalid = [
      '{', JSON.stringify({}),
      workingBody(clearanceId, null, 'Valid', { attacker: true }),
      workingBody(clearanceId, null, 'Valid', { segments: [] }),
      workingBody(clearanceId, null, 'Valid', { segments: [{ key: 'aa', label: 'x' }] }),
      workingBody(clearanceId, null, 'Valid', { segments: [{ key: 'adult', label: ' x ' }] }),
      workingBody(clearanceId, null, 'Valid', { segments: [{ key: 'adult', label: 'x' }, { key: 'adult', label: 'y' }] }),
      workingBody(clearanceId, null, 'Valid', { primaryTargetSegmentKey: 'missing' }),
      workingBody(clearanceId, null, 'Valid', { secondaryTargetSegmentKeys: ['adult'] }),
      workingBody(clearanceId, null, 'Valid', { secondaryTargetSegmentKeys: ['missing'] }),
      workingBody(clearanceId, null, 'x'.repeat(4001)),
      workingBody('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null),
      workingBody(clearanceId, 'wr1_' + 'a'.repeat(42)),
    ];
    for (const payload of invalid) { const response = await fetch(workingEndpoint(base), { method: 'POST', headers, body: payload }); assert.ok([400, 409].includes(response.status), `${response.status}: ${payload.slice(0, 80)}`); }
    assert.deepEqual(tableCounts(state.databasePath), before);
    for (const payload of [JSON.stringify({ contractVersion: '1.0.0' }), JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: 'wr1_' + 'a'.repeat(43), extra: true })]) assert.equal((await fetch(lockEndpoint(base), { method: 'POST', headers, body: payload })).status, 400);
    assert.equal((await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: 'wr1_' + 'a'.repeat(43) }) })).status, 409);
    assert.deepEqual(tableCounts(state.databasePath), before);
  });
});

test('B9 existing persisted reread failures are generic 500 while stale and identity failures remain 409', async () => {
  for (const corrupt of ['working', 'lock'] as const) {
    const state = await fixture(); await serve(state, async (base) => {
      const clearanceId = await clearanceFixture(base);
      const saved = await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, null) }); const receipt = await saved.json() as any;
      if (corrupt === 'lock') {
        const locked = await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: receipt.workingRevision }) }); assert.equal(locked.status, 201);
        const db = new BetterSqlite3(state.databasePath); db.exec('DROP TRIGGER flow_locked_stps_no_update'); db.prepare("UPDATE flow_locked_stps SET actor_id='owner:tampered'").run(); db.close();
      } else {
        const db = new BetterSqlite3(state.databasePath); db.exec('DROP TRIGGER flow_stp_working_records_no_delete'); db.prepare('DELETE FROM flow_stp_working_records').run(); db.close();
      }
      const response = corrupt === 'lock'
        ? await fetch(lockEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', expectedWorkingRevision: receipt.workingRevision }) })
        : await fetch(workingEndpoint(base), { method: 'POST', headers, body: workingBody(clearanceId, receipt.workingRevision) });
      assert.equal(response.status, corrupt === 'working' ? 409 : 500);
      if (response.status === 500) assert.deepEqual(await response.json(), { error: { code: 'integrity_error', message: 'Stored workspace data failed integrity verification' } });
    });
  }
});

test('generated B9 owner contract is closed, bounded and registered', () => {
  const schema = JSON.parse(fs.readFileSync('contracts/api/owner-b9-stp-api.schema.json', 'utf8')) as any;
  assert.deepEqual(schema.oneOf.map((entry: any) => entry.$ref), ['#/$defs/workingRequest','#/$defs/workingReceipt','#/$defs/lockRequest','#/$defs/lockReceipt']);
  for (const name of ['workingRequest','workingReceipt','lockRequest','lockReceipt']) assert.equal(schema.$defs[name].additionalProperties, false);
  assert.equal(schema.$defs.workingRequest.properties.positioningStatement.maxLength, 4000);
  assert.equal(schema.$defs.workingRequest.properties.segments.maxItems, 100);
  assert.equal(schema.$defs.workingRevision.pattern, '^wr1_[A-Za-z0-9_-]{43}$');
  assert.match(fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8'), /\['api', 'owner-b9-stp-api'\]/);
});


test('B10 OWNER API creates and corrects the combined decision with the exact closed receipt and zero-mutation retries', async () => {
  const state = await fixture(); await serve(state, async (base) => {
    const lockId = await lockedFixture(base);
    const created = await fetch(b10Endpoint(base), { method: 'POST', headers, body: b10Body(lockId, null, 'HOLD') });
    assert.equal(created.status, 201); const first = await created.json() as any;
    assert.deepEqual(Object.keys(first).sort(), ['contractVersion','decisionId','decisionNumber','previousDecisionId','decision','decidedAt','readyForB11','exactRetry'].sort());
    assert.deepEqual({ ...first, decisionId: '<uuid>' }, { contractVersion: '1.0.0', decisionId: '<uuid>', decisionNumber: 1, previousDecisionId: null, decision: 'HOLD', decidedAt: '2027-01-01T00:00:00.000Z', readyForB11: false, exactRetry: false });
    assert.equal(Object.hasOwn(first, 'lockedStpId'), false);
    const beforeRetry = tableCounts(state.databasePath);
    const retry = await fetch(b10Endpoint(base), { method: 'POST', headers, body: b10Body(lockId, null, 'HOLD') });
    assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), { ...first, exactRetry: true }); assert.deepEqual(tableCounts(state.databasePath), beforeRetry);
    const corrected = await fetch(b10Endpoint(base), { method: 'POST', headers, body: b10Body(lockId, first.decisionId, 'APPROVE') });
    assert.equal(corrected.status, 201); const second = await corrected.json() as any;
    assert.deepEqual({ decisionNumber: second.decisionNumber, previousDecisionId: second.previousDecisionId, decision: second.decision, readyForB11: second.readyForB11, exactRetry: second.exactRetry }, { decisionNumber: 2, previousDecisionId: first.decisionId, decision: 'APPROVE', readyForB11: true, exactRetry: false });
    assert.equal((await fetch(b10Endpoint(base), { method: 'POST', headers, body: b10Body(lockId, first.decisionId, 'REJECT') })).status, 409, 'stale predecessor fails closed');
    assert.equal((await fetch(b10Endpoint(base), { method: 'POST', headers, body: b10Body(lockId, second.decisionId, 'APPROVE') })).status, 409, 'correction must change state');
    const db = new BetterSqlite3(state.databasePath); const rows = db.prepare('SELECT actor_id actor,role_snapshot role,required_capability capability,decision_number number,decision FROM governance_product_b10_decisions ORDER BY decision_number').all(); db.close();
    assert.deepEqual(rows, [
      { actor: 'owner:local', role: 'OWNER', capability: 'governance:product-b10-review', number: 1, decision: 'HOLD' },
      { actor: 'owner:local', role: 'OWNER', capability: 'governance:product-b10-review', number: 2, decision: 'APPROVE' },
    ]);
  });
});

test('B10 OWNER API rejects malformed, unknown and cross-workspace lock inputs without B10 mutation', async () => {
  const state = await fixture(); await serve(state, async (base) => {
    const lockId = await lockedFixture(base); const before = tableCounts(state.databasePath);
    const invalid = [
      '{}', '{',
      JSON.stringify({ contractVersion: '1.0.0', lockedStpId: lockId, previousDecisionId: null, decision: 'APPROVE', actorId: 'attacker' }),
      b10Body('not-a-uuid', null, 'APPROVE'),
      JSON.stringify({ contractVersion: '1.0.0', lockedStpId: lockId, previousDecisionId: null, decision: 'PASS' }),
    ];
    for (const payload of invalid) assert.equal((await fetch(b10Endpoint(base), { method: 'POST', headers, body: payload })).status, 400);
    assert.equal((await fetch(b10Endpoint(base), { method: 'POST', headers, body: b10Body('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', null, 'APPROVE') })).status, 404);
    assert.equal((await fetch(b10Endpoint(base, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), { method: 'POST', headers, body: b10Body(lockId, null, 'APPROVE') })).status, 404);
    assert.deepEqual(tableCounts(state.databasePath), before);
  });
});

test('generated B10 owner contract is closed, exact and registered', () => {
  const schema = JSON.parse(fs.readFileSync('contracts/api/owner-b10-decision-api.schema.json', 'utf8')) as any;
  assert.deepEqual(schema.oneOf.map((entry: any) => entry.$ref), ['#/$defs/request', '#/$defs/receipt']);
  assert.equal(schema.$defs.request.additionalProperties, false); assert.equal(schema.$defs.receipt.additionalProperties, false);
  assert.deepEqual(schema.$defs.request.required, ['contractVersion', 'lockedStpId', 'previousDecisionId', 'decision']);
  assert.deepEqual(schema.$defs.receipt.required, ['contractVersion', 'decisionId', 'decisionNumber', 'previousDecisionId', 'decision', 'decidedAt', 'readyForB11', 'exactRetry']);
  assert.equal(schema.$defs.receipt.properties.lockedStpId, undefined);
  assert.match(fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8'), /\['api', 'owner-b10-decision-api'\]/);
});


test('discovery workspace creation returns closed receipts, preserves optional description, and creates no downstream records', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const first = await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'new-market', title: 'Shared title' }) });
    assert.equal(first.status, 201);
    const firstReceipt = await first.json() as any;
    assert.deepEqual(Object.keys(firstReceipt).sort(), ['contractVersion', 'workspaceId', 'workspaceKey', 'state', 'title', 'createdAt', 'exactRetry'].sort());
    assert.deepEqual({ ...firstReceipt, workspaceId: '<uuid>' }, { contractVersion: '1.0.0', workspaceId: '<uuid>', workspaceKey: 'new-market', state: 'ACTIVE', title: 'Shared title', createdAt: '2027-01-01T00:00:00.000Z', exactRetry: false });

    const second = await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'other-market', title: 'Shared title', description: 'A distinct workspace.' }) });
    assert.equal(second.status, 201);
    const secondReceipt = await second.json() as any;
    assert.deepEqual(Object.keys(secondReceipt).sort(), ['contractVersion', 'workspaceId', 'workspaceKey', 'state', 'title', 'description', 'createdAt', 'exactRetry'].sort());
    assert.equal(secondReceipt.description, 'A distinct workspace.');
    assert.notEqual(firstReceipt.workspaceId, secondReceipt.workspaceId);
  });
  const db = new BetterSqlite3(state.databasePath);
  assert.equal((db.prepare('SELECT count(*) count FROM flow_discovery_workspaces').get() as any).count, 3);
  for (const table of ['flow_product_candidates', 'flow_product_candidate_revisions', 'flow_candidate_baskets', 'flow_candidate_basket_members', 'governance_candidate_b7_decisions', 'flow_product_workspaces', 'governance_product_b8_lane_decisions', 'flow_b8_clearances', 'flow_b8_clearance_decisions', 'flow_stp_working_records', 'flow_locked_stps', 'governance_product_b10_decisions']) {
    const expected = ['flow_product_candidates', 'flow_product_candidate_revisions', 'flow_candidate_baskets', 'flow_candidate_basket_members', 'governance_candidate_b7_decisions', 'flow_product_workspaces'].includes(table) ? 1 : 0;
    assert.equal((db.prepare(`SELECT count(*) count FROM ${table}`).get() as any).count, expected, table);
  }
  db.close();
});

test('discovery workspace exact retries are zero-mutation; changed content conflicts and identical concurrency creates one artifact', async () => {
  const state = await fixture();
  await serve(state, async (base) => {
    const request = JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'concurrent-market', title: 'Concurrent', description: 'Same content' });
    const concurrent = await Promise.all([fetch(workspaceEndpoint(base), { method: 'POST', headers, body: request }), fetch(workspaceEndpoint(base), { method: 'POST', headers, body: request })]);
    assert.deepEqual(concurrent.map((response) => response.status).sort(), [200, 201]);
    const receipts = await Promise.all(concurrent.map((response) => response.json() as Promise<any>));
    assert.equal(receipts[0].workspaceId, receipts[1].workspaceId);
    assert.deepEqual(receipts.map((receipt) => receipt.exactRetry).sort(), [false, true]);

    const db = new BetterSqlite3(state.databasePath);
    const before = {
      rows: db.prepare('SELECT * FROM flow_discovery_workspaces ORDER BY workspace_id').all(),
      manifests: db.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(),
    };
    db.close();
    const retry = await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: request });
    assert.equal(retry.status, 200); assert.equal((await retry.json() as any).exactRetry, true);
    assert.equal((await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'concurrent-market', title: 'Changed' }) })).status, 409);
    assert.equal((await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'concurrent-market', title: 'Concurrent', description: 'Changed description' }) })).status, 409);
    const afterDb = new BetterSqlite3(state.databasePath);
    assert.deepEqual(afterDb.prepare('SELECT * FROM flow_discovery_workspaces ORDER BY workspace_id').all(), before.rows);
    assert.deepEqual(afterDb.prepare('SELECT * FROM artifact_manifests ORDER BY sha256').all(), before.manifests);
    afterDb.close();
  });
  const files = fs.readdirSync(state.artifactRoot, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.relative(state.artifactRoot, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, '/'));
  assert.equal(files.some((name) => name.endsWith('.tmp')), false);
  const manifestDb = new BetterSqlite3(state.databasePath); const manifests = new Set((manifestDb.prepare('SELECT relative_path relativePath FROM artifact_manifests').all() as { relativePath: string }[]).map((row) => row.relativePath)); manifestDb.close();
  assert.equal(files.every((file) => manifests.has(file)), true, 'every permanent artifact file is registered');
});

test('discovery workspace route rejects malformed bounds, additional fields, auth/origin/method and oversized bodies without mutation', async () => {
  const state = await fixture();
  const beforeDb = new BetterSqlite3(state.databasePath);
  const before = { rows: beforeDb.prepare('SELECT * FROM flow_discovery_workspaces').all(), manifests: beforeDb.prepare('SELECT * FROM artifact_manifests').all() };
  beforeDb.close();
  await serve(state, async (base) => {
    const valid = { contractVersion: '1.0.0', workspaceKey: 'valid-key', title: 'Valid' };
    assert.equal((await fetch(workspaceEndpoint(base), { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(valid) })).status, 401);
    assert.equal((await fetch(workspaceEndpoint(base), { method: 'POST', headers: { ...headers, origin: 'http://evil.local' }, body: JSON.stringify(valid) })).status, 403);
    assert.equal((await fetch(workspaceEndpoint(base), { method: 'GET', headers })).status, 405);
    for (const invalid of [
      {}, { contractVersion: '1.0.0', workspaceKey: '', title: 'Valid' }, { contractVersion: '1.0.0', workspaceKey: 'ab', title: 'Valid' },
      { contractVersion: '1.0.0', workspaceKey: 'valid-key', title: '' }, { contractVersion: '1.0.0', workspaceKey: 'valid-key', title: ' ' },
      { contractVersion: '1.0.0', workspaceKey: 'valid-key', title: 'x'.repeat(201) }, { contractVersion: '1.0.0', workspaceKey: 'valid-key', title: 'Valid', description: '' },
      { contractVersion: '1.0.0', workspaceKey: 'valid-key', title: 'Valid', description: 'x'.repeat(1001) }, { ...valid, extra: true },
    ]) assert.equal((await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify(invalid) })).status, 400);
    assert.equal((await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: 'x'.repeat(4097) })).status, 400);
  });
  const afterDb = new BetterSqlite3(state.databasePath);
  assert.deepEqual(afterDb.prepare('SELECT * FROM flow_discovery_workspaces').all(), before.rows);
  assert.deepEqual(afterDb.prepare('SELECT * FROM artifact_manifests').all(), before.manifests);
  afterDb.close();
});

test('discovery workspace retry verifies persisted artifact corruption as generic 500 with no orphan or mutation', async () => {
  const state = await fixture();
  const db = new BetterSqlite3(state.databasePath);
  const row = db.prepare('SELECT workspace_artifact_sha256 sha FROM flow_discovery_workspaces WHERE workspace_key=?').get('owner-test') as { sha: string };
  const beforeRows = db.prepare('SELECT * FROM flow_discovery_workspaces').all();
  const beforeManifests = db.prepare('SELECT * FROM artifact_manifests').all();
  db.close();
  const artifactPath = path.join(state.artifactRoot, 'sha256', row.sha.slice(0, 2), row.sha);
  fs.writeFileSync(artifactPath, '{}');
  const filesBefore = fs.readdirSync(state.artifactRoot, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort();
  await serve(state, async (base) => {
    const response = await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'owner-test', title: 'Không gian thử nghiệm' }) });
    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: { code: 'integrity_error', message: 'Stored workspace data failed integrity verification' } });
  });
  const afterDb = new BetterSqlite3(state.databasePath);
  assert.deepEqual(afterDb.prepare('SELECT * FROM flow_discovery_workspaces').all(), beforeRows);
  assert.deepEqual(afterDb.prepare('SELECT * FROM artifact_manifests').all(), beforeManifests);
  afterDb.close();
  assert.deepEqual(fs.readdirSync(state.artifactRoot, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name)).sort(), filesBefore);
});


test('generated discovery OWNER contract is closed, bounded, exact, and registered', () => {
  const schema = JSON.parse(fs.readFileSync('contracts/api/owner-discovery-workspace-api.schema.json', 'utf8')) as any;
  assert.deepEqual(schema.oneOf.map((entry: any) => entry.$ref), ['#/$defs/request', '#/$defs/receipt']);
  assert.equal(schema.$defs.request.additionalProperties, false); assert.equal(schema.$defs.receipt.additionalProperties, false);
  assert.deepEqual(schema.$defs.request.required, ['contractVersion', 'workspaceKey', 'title']); assert.deepEqual(schema.$defs.receipt.required, ['contractVersion', 'workspaceId', 'workspaceKey', 'state', 'title', 'createdAt', 'exactRetry']);
  assert.equal(schema.$defs.request.properties.title.maxLength, 200); assert.equal(schema.$defs.request.properties.description.maxLength, 1000); assert.equal(schema.$defs.request.properties.workspaceKey.pattern, '^[a-z][a-z0-9_-]{2,79}$');
  assert.match(fs.readFileSync('scripts/generate-foundation-contract.mjs', 'utf8'), /\['api', 'owner-discovery-workspace-api'\]/);
});

test('corrupt discovery row is generic 500 even when retry content differs', async () => {
  const state = await fixture(); const db = new BetterSqlite3(state.databasePath); db.exec('DROP TRIGGER flow_discovery_workspaces_no_update'); db.prepare("UPDATE flow_discovery_workspaces SET title='Corrupt' WHERE workspace_key='owner-test'").run(); const before = db.prepare('SELECT count(*) count FROM artifact_manifests').get() as any; db.close();
  await serve(state, async (base) => { const response = await fetch(workspaceEndpoint(base), { method: 'POST', headers, body: JSON.stringify({ contractVersion: '1.0.0', workspaceKey: 'owner-test', title: 'Changed request' }) }); assert.equal(response.status, 500); assert.deepEqual(await response.json(), { error: { code: 'integrity_error', message: 'Stored workspace data failed integrity verification' } }); });
  const after = new BetterSqlite3(state.databasePath); assert.equal((after.prepare('SELECT count(*) count FROM artifact_manifests').get() as any).count, before.count); after.close();
});
