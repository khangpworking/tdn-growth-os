import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
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
import { FlowProductWorkspaceReader } from '../../src/modules/flow/product-workspace-reader.js';
import { ProductB8LaneDecisionService, PRODUCT_B8_LANES, PRODUCT_B8_REVIEW_CAPABILITY, PRODUCT_B8_REVIEW_POLICY_ID } from '../../src/modules/governance/product-b8-lane-decision-service.js';
import { GovernanceProductB8Reader } from '../../src/modules/governance/product-b8-status-reader.js';
import { B8ClearanceService } from '../../src/modules/flow/b8-clearance-service.js';
import { StpService, PRODUCT_B9_LOCK_CAPABILITY } from '../../src/modules/flow/stp-service.js';
import { FlowLockedStpReader } from '../../src/modules/flow/locked-stp-reader.js';
import { ProductB10DecisionService, PRODUCT_B10_REVIEW_CAPABILITY } from '../../src/modules/governance/product-b10-decision-service.js';
import { createWorkspaceApiServer, openWorkspaceApi } from '../../src/api/workspace-api.js';

const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
const ids = {
  workspace1: '11111111-1111-4111-8111-111111111111', workspace2: '11111111-1111-4111-8111-222222222222',
  candidate1: '22222222-2222-4222-8222-111111111111', candidate2: '22222222-2222-4222-8222-222222222222',
  basket: '33333333-3333-4333-8333-111111111111', b7: '44444444-4444-4444-8444-111111111111',
  product: '55555555-5555-4555-8555-111111111111',
  decisions: ['66666666-6666-4666-8666-111111111111', '66666666-6666-4666-8666-222222222222', '66666666-6666-4666-8666-333333333333', '66666666-6666-4666-8666-444444444444'],
  clearance: '77777777-7777-4777-8777-111111111111', working: '88888888-8888-4888-8888-111111111111',
  lock: '88888888-8888-4888-8888-222222222222', b10: ['99999999-9999-4999-8999-111111111111', '99999999-9999-4999-8999-222222222222'],
  unknown: '99999999-9999-4999-8999-999999999999',
} as const;

async function fixture(withData = true, b9State: 'NOT_STARTED' | 'WORKING' | 'LOCKED' = 'LOCKED') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-workspace-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  if (withData) {
    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    let workspaceIndex = 0;
    const workspaces = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => [ids.workspace1, ids.workspace2][workspaceIndex++]!, now: () => new Date('2026-10-01T00:00:00Z') });
    await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'alpha-market', title: 'Duplicate name', description: 'First discovery workspace' });
    await workspaces.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'beta-market', title: 'Duplicate name' });
    let candidateIndex = 0;
    const candidates = new ProductCandidateService({ db, artifactStore: artifacts, uuid: () => [ids.candidate1, ids.candidate2][candidateIndex++]!, now: () => new Date('2026-10-02T00:00:00Z') });
    await candidates.createCandidate({ contractVersion: '1.0.0', workspaceId: ids.workspace1, candidateKey: 'first-candidate', label: 'Duplicate candidate' });
    await candidates.createCandidate({ contractVersion: '1.0.0', workspaceId: ids.workspace1, candidateKey: 'second-candidate', label: 'Duplicate candidate', summary: 'Initial candidate summary' });
    await candidates.reviseCandidate({ contractVersion: '1.0.0', candidateId: ids.candidate2, expectedVersion: 1, label: 'Duplicate candidate v2', summary: 'Latest candidate summary' });
    const baskets = new CandidateBasketService({ db, artifactStore: artifacts, workspaceReader: new FlowDiscoveryWorkspaceReader(workspaces), candidateReader: new FlowProductCandidateReader(candidates), uuid: () => ids.basket, now: () => new Date('2026-10-03T00:00:00Z') });
    await baskets.freezeBasket({ contractVersion: '1.0.0', workspaceId: ids.workspace1, basketKey: 'first-basket', version: 1, candidates: [{ candidateId: ids.candidate1, candidateVersion: 1 }] });
    const b7 = new CandidateB7DecisionService({ db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets), configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY }, uuid: () => ids.b7, now: () => new Date('2026-10-04T00:00:00Z') });
    await b7.decide({ contractVersion: '1.0.0', basketId: ids.basket, candidateId: ids.candidate1, candidateVersion: 1, decision: 'PASS' }, { actorId: 'owner:fixture', roleSnapshot: 'OWNER', capabilities: new Set([CANDIDATE_B7_DECISION_CAPABILITY]) });
    const products = new ProductWorkspaceService({ db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(b7), uuid: () => ids.product, now: () => new Date('2026-10-05T00:00:00Z') });
    await products.createWorkspace({ contractVersion: '1.0.0', decisionId: ids.b7, productWorkspaceKey: 'first-product' });
    let decisionIndex = 0;
    const b8 = new ProductB8LaneDecisionService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(products), configuration: { policyId: PRODUCT_B8_REVIEW_POLICY_ID, policyVersion: 1, requiredCapability: PRODUCT_B8_REVIEW_CAPABILITY }, uuid: () => ids.decisions[decisionIndex++]!, now: () => new Date(`2026-10-${String(6 + decisionIndex).padStart(2, '0')}T00:00:00Z`) });
    for (const lane of PRODUCT_B8_LANES) await b8.decide({ contractVersion: '1.0.0', productWorkspaceId: ids.product, lane, expectedVersion: 0, decision: 'PASS' }, { actorId: 'owner:fixture', roleSnapshot: 'OWNER', capabilities: new Set([PRODUCT_B8_REVIEW_CAPABILITY]) });
    const b8Reader = new GovernanceProductB8Reader(b8);
    const clearance = new B8ClearanceService({ db, artifactStore: artifacts, decisionReader: b8Reader, statusReader: b8Reader, uuid: () => ids.clearance, now: () => new Date('2026-10-11T00:00:00Z') });
    await clearance.createClearance({ contractVersion: '1.0.0', productWorkspaceId: ids.product, decisions: Object.fromEntries(PRODUCT_B8_LANES.map((lane, index) => [lane, ids.decisions[index]])) });
    if (b9State !== 'NOT_STARTED') {
      let stpIndex = 0;
      const stp = new StpService({ db, artifactStore: artifacts, productWorkspaceReader: new FlowProductWorkspaceReader(products), b8ClearanceReader: new (await import('../../src/modules/flow/b8-clearance-reader.js')).FlowB8ClearanceReader(clearance), uuid: () => [ids.working, ids.lock][stpIndex++]!, now: () => new Date('2026-10-12T00:00:00Z') });
      const saved = await stp.saveWorking({ contractVersion: '1.0.0', productWorkspaceId: ids.product, b8ClearanceId: ids.clearance, expectedWorkingDigest: null, segments: [{ key: 'adult', label: 'Người trưởng thành' }], primaryTargetSegmentKey: 'adult', positioningStatement: 'Canxi tiện dùng mỗi ngày.' });
      if (b9State === 'LOCKED') {
        await stp.lock({ contractVersion: '1.0.0', productWorkspaceId: ids.product, expectedWorkingDigest: saved.workingDigest }, { actorId: 'owner:fixture', roleSnapshot: 'OWNER', capabilities: new Set([PRODUCT_B9_LOCK_CAPABILITY]) });
        let b10Index = 0;
        const b10 = new ProductB10DecisionService({ db, artifactStore: artifacts, lockedStpReader: new FlowLockedStpReader(stp), uuid: () => ids.b10[b10Index++]!, now: () => new Date(`2026-10-${13 + b10Index}T00:00:00Z`) });
        const first = await b10.decide({ contractVersion: '1.0.0', lockedStpId: ids.lock, previousDecisionId: null, decision: 'HOLD' }, { actorId: 'owner:fixture', roleSnapshot: 'OWNER', capabilities: new Set([PRODUCT_B10_REVIEW_CAPABILITY]) });
        await b10.decide({ contractVersion: '1.0.0', lockedStpId: ids.lock, previousDecisionId: first.decisionId, decision: 'APPROVE' }, { actorId: 'owner:fixture', roleSnapshot: 'OWNER', capabilities: new Set([PRODUCT_B10_REVIEW_CAPABILITY]) });
      }
    }
  }
  db.pragma('wal_checkpoint(TRUNCATE)'); db.close();
  return { root, databasePath, artifactRoot };
}
async function serve(state: Awaited<ReturnType<typeof fixture>>, run: (origin: string) => Promise<void>) {
  const api = createWorkspaceApiServer(state); api.server.listen(0, '127.0.0.1'); await once(api.server, 'listening');
  try { await run(`http://127.0.0.1:${(api.server.address() as AddressInfo).port}`); } finally { await api.close(); }
}
function hash(file: string) { return createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }

test('opens SQLite in query-only mode through a non-HTTP diagnostic', async () => {
  const state = await fixture(false);
  const application = openWorkspaceApi(state);
  try { assert.deepEqual(application.diagnostics(), { queryOnly: true }); }
  finally { application.close(); }
});

test('HTTP reads compose stable ID-based portfolio/detail, preserve ordering and never alter SQLite', async () => {
  const state = await fixture(); const before = hash(state.databasePath);
  await serve(state, async (origin) => {
    const portfolioResponse = await fetch(`${origin}/api/workspaces`); assert.equal(portfolioResponse.status, 200);
    const portfolio = await portfolioResponse.json() as any;
    assert.deepEqual(portfolio.workspaces.map((item: any) => [item.workspaceId, item.title, item.candidateCount, item.productCount]), [[ids.workspace1, 'Duplicate name', 2, 1], [ids.workspace2, 'Duplicate name', 0, 0]]);
    const discovery = await (await fetch(`${origin}/api/workspaces/${ids.workspace1}`)).json() as any;
    assert.deepEqual(discovery.candidates.map((item: any) => [item.candidateId, item.version, item.label]), [[ids.candidate1, 1, 'Duplicate candidate'], [ids.candidate2, 2, 'Duplicate candidate v2']]);
    assert.deepEqual(discovery.products.map((item: any) => item.productWorkspaceId), [ids.product]);
    const productResponse = await fetch(`${origin}/api/product-workspaces/${ids.product}`); assert.equal(productResponse.status, 200);
    const product = await productResponse.json() as any;
    assert.deepEqual(product.b8.lanes.map((lane: any) => [lane.lane, lane.effectiveState]), PRODUCT_B8_LANES.map((lane) => [lane, 'PASS']));
    assert.equal(product.b8.readyForB9, true); assert.equal(product.clearance.clearanceId, ids.clearance);
    assert.deepEqual(product.clearance.decisions.map((item: any) => item.decisionId), [...ids.decisions]);
    const b9 = await (await fetch(`${origin}/api/product-workspaces/${ids.product}/b9`)).json() as any;
    assert.deepEqual([b9.state, b9.working.workingStpId, b9.locked.lockId], ['LOCKED', ids.working, ids.lock]);
    assert.equal(b9.working.content.positioningStatement, 'Canxi tiện dùng mỗi ngày.');
    const b10 = await (await fetch(`${origin}/api/product-workspaces/${ids.product}/b10`)).json() as any;
    assert.deepEqual(b10.history.map((item: any) => [item.decisionNumber, item.decision]), [[1, 'HOLD'], [2, 'APPROVE']]);
    assert.equal(b10.effective.decisionId, ids.b10[1]); assert.equal(b10.readyForB11, true);
    assert.equal(JSON.stringify(await (await fetch(`${origin}/api/workspaces`)).json()), JSON.stringify(portfolio));
  });
  assert.equal(hash(state.databasePath), before);
});

test('B9 status is deterministic for NOT_STARTED and WORKING and B10 is empty without decisions', async () => {
  for (const expected of ['NOT_STARTED', 'WORKING'] as const) {
    const state = await fixture(true, expected);
    await serve(state, async (origin) => {
      const b9 = await (await fetch(`${origin}/api/product-workspaces/${ids.product}/b9`)).json() as any;
      assert.equal(b9.state, expected);
      assert.equal('working' in b9, expected === 'WORKING');
      assert.equal('locked' in b9, false);
      const b10 = await (await fetch(`${origin}/api/product-workspaces/${ids.product}/b10`)).json() as any;
      assert.deepEqual(b10, { contractVersion: '1.0.0', productWorkspaceId: ids.product, history: [], effective: null, readyForB11: false });
    });
  }
});

test('empty, malformed, unknown and mutation requests are closed JSON responses', async () => {
  const state = await fixture(false);
  await serve(state, async (origin) => {
    assert.deepEqual(await (await fetch(`${origin}/api/workspaces`)).json(), { contractVersion: '1.0.0', workspaces: [] });
    for (const route of ['/api/workspaces/not-a-uuid', '/api/workspaces/%2Fetc', '/api/workspaces?id=x']) assert.equal((await fetch(origin + route)).status, 400);
    assert.equal((await fetch(`${origin}/api/workspaces/${ids.unknown}`)).status, 404);
    assert.equal((await fetch(`${origin}/api/product-workspaces/${ids.unknown}`)).status, 404);
    assert.equal((await fetch(`${origin}/api/product-workspaces/${ids.unknown}/b9`)).status, 404);
    assert.equal((await fetch(`${origin}/api/product-workspaces/${ids.unknown}/b10`)).status, 404);
    const mutation = await fetch(`${origin}/api/workspaces`, { method: 'DELETE' }); assert.equal(mutation.status, 405); assert.equal(mutation.headers.get('allow'), 'GET');
  });
});

test('missing or corrupt artifacts return only a generic integrity error', async () => {
  for (const mode of ['missing', 'corrupt'] as const) {
    const state = await fixture();
    const db = new (await import('better-sqlite3')).default(state.databasePath, { readonly: true });
    const row = db.prepare('SELECT workspace_artifact_sha256 digest FROM flow_discovery_workspaces WHERE workspace_id=?').get(ids.workspace1) as { digest: string }; db.close();
    const artifact = path.join(state.artifactRoot, 'sha256', row.digest.slice(0, 2), row.digest);
    mode === 'missing' ? fs.rmSync(artifact) : fs.writeFileSync(artifact, 'private /tmp/path actor:secret deadbeef');
    await serve(state, async (origin) => {
      const response = await fetch(`${origin}/api/workspaces`); assert.equal(response.status, 500);
      const text = await response.text(); assert.equal(text, '{"error":{"code":"integrity_error","message":"Stored workspace data failed integrity verification"}}');
      assert.doesNotMatch(text, /tmp|actor|deadbeef|sha256|SELECT|stack/i);
    });
  }
});
