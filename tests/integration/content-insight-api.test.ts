import assert from 'node:assert/strict';
import { once } from 'node:events';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { AddressInfo } from 'node:net';
import BetterSqlite3 from 'better-sqlite3';
import contentApiSchema from '../../contracts/api/content-api.schema.json' with { type: 'json' };
import ownerContentInsightApiSchema from '../../contracts/api/owner-content-insight-api.schema.json' with { type: 'json' };
import contentCampaignCreateSchema from '../../contracts/flow/content-campaign-create-request.schema.json' with { type: 'json' };
import contentCampaignDefaultsSchema from '../../contracts/flow/content-campaign-defaults-request.schema.json' with { type: 'json' };
import contentCatalogItemCreateSchema from '../../contracts/flow/content-catalog-item-create-request.schema.json' with { type: 'json' };
import contentIdeaGenerateSchema from '../../contracts/flow/content-idea-generate-request.schema.json' with { type: 'json' };
import contentIdeaStateSchema from '../../contracts/flow/content-idea-state-request.schema.json' with { type: 'json' };
import contentInsightLockArtifactSchema from '../../contracts/flow/content-insight-lock-artifact.schema.json' with { type: 'json' };
import contentInsightRevisionSchema from '../../contracts/flow/content-insight-revision-request.schema.json' with { type: 'json' };
import contentInsightLockSchema from '../../contracts/flow/content-insight-lock-request.schema.json' with { type: 'json' };
import contentPromptCreateSchema from '../../contracts/flow/content-prompt-create-request.schema.json' with { type: 'json' };
import contentPurposeTagSchema from '../../contracts/flow/content-purpose-tag-request.schema.json' with { type: 'json' };
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { canonicalBytes, canonicalDigest, registerContentManifest } from '../../src/modules/flow/content-artifacts.js';
import { openDatabase } from '../../src/platform/db/database.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import {
  CandidateBasketService,
  DiscoveryWorkspaceService,
  FlowCandidateBasketReader,
  FlowDiscoveryWorkspaceReader,
  FlowProductCandidateReader,
  ProductCandidateService,
  ProductWorkspaceService,
} from '../../src/modules/flow/index.js';
import {
  CANDIDATE_B7_DECISION_CAPABILITY,
  CANDIDATE_B7_DECISION_POLICY_ID,
  CandidateB7DecisionService,
  GovernanceCandidateB7DecisionReader,
} from '../../src/modules/governance/index.js';
import { openContentOwnerApi, openContentReadApi } from '../../src/api/content-api.js';
import { INSIGHT_GATE_NOT_APPROVED } from '../../src/modules/flow/content-insight-service.js';

const token = 'correct-owner-token-with-at-least-32-characters';
const origin = 'http://127.0.0.1:5173';
const brandId = '88888888-8888-4888-8888-000000000001';
const itemA = '88888888-8888-4888-8888-0000000000a1';
const itemB = '88888888-8888-4888-8888-0000000000a2';
const campaignId = '88888888-8888-4888-8888-0000000000c1';
const unknownId = '88888888-8888-4888-8888-00000000ffff';
const productWorkspaceId = '88888888-8888-4888-8888-0000000000f1';
const discoveryWorkspaceId = '11111111-1111-4111-8111-111111111111';
const candidateId = '22222222-2222-4222-8222-222222222222';
const basketId = '44444444-4444-4444-8444-444444444444';
const b7DecisionId = '55555555-5555-4555-8555-555555555555';
const at = '2027-01-01T00:00:00.000Z';
const roots: string[] = [];
test.afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

const displayRules = {
  sales: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'ALWAYS', web: 'ALWAYS', address: 'OPTIONAL' },
  trust: { name: 'ALWAYS', logo: 'ALWAYS', tagline: 'ALWAYS', hotline: 'OPTIONAL', web: 'OPTIONAL', address: 'HIDDEN' },
  education: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'OPTIONAL', hotline: 'HIDDEN', web: 'OPTIONAL', address: 'HIDDEN' },
  entertainment: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'HIDDEN', address: 'HIDDEN' },
  engagement: { name: 'OPTIONAL', logo: 'ALWAYS', tagline: 'HIDDEN', hotline: 'HIDDEN', web: 'ALWAYS', address: 'HIDDEN' },
} as const;
const item = (patch: Record<string, unknown> = {}) => ({
  itemType: 'SERVICE', name: 'Tư vấn dinh dưỡng xương', description: 'Tư vấn tổng hợp cho gia đình.',
  tiers: [{ tierKey: 'plus', name: 'Plus', priceText: '249.000đ', inclusions: ['3 buổi'] }], photos: [], ...patch,
});
const campaign = (patch: Record<string, unknown> = {}) => ({
  name: 'Chiến dịch Tết', objective: 'Tăng số cuộc tư vấn trong tháng một.',
  items: [{ itemId: itemA, itemVersion: 1 }, { itemId: itemB, itemVersion: 1 }], ...patch,
});
const insight = (patch: Record<string, unknown> = {}) => ({
  customer: 'Người con đi làm xa', painPoint: 'Khó chọn món quà thiết thực.', insight: 'Trao sự yên tâm mỗi ngày.', source: { kind: 'TYPED' }, ...patch,
});
const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json', origin };
const createBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', campaignKey: 'tet-2027', brandId, campaign: campaign(), ...patch });
const revisionBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', expectedVersion: 0, insight: insight(), ...patch });
const lockBody = (patch: Record<string, unknown> = {}) => JSON.stringify({ contractVersion: '1.0.0', insightVersion: 1, campaignVersion: 1, ...patch });

async function listen(handler: http.RequestListener): Promise<{ base: string; close(): Promise<void> }> {
  const server = http.createServer(handler); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  return { base: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, close: () => new Promise((resolve) => server.close(() => resolve())) };
}

async function seedResearchProduct(db: BetterSqlite3.Database, artifacts: ContentAddressedArtifactStore): Promise<void> {
  const discovery = new DiscoveryWorkspaceService({ db, artifactStore: artifacts, uuid: () => discoveryWorkspaceId, now: () => new Date('2026-09-25T00:00:00Z') });
  const candidates = new ProductCandidateService({ db, artifactStore: artifacts, uuid: () => candidateId, now: () => new Date('2026-09-25T01:00:00Z') });
  const baskets = new CandidateBasketService({
    db, artifactStore: artifacts,
    workspaceReader: new FlowDiscoveryWorkspaceReader(discovery), candidateReader: new FlowProductCandidateReader(candidates),
    uuid: () => basketId, now: () => new Date('2026-09-26T00:00:00Z'),
  });
  const decisions = new CandidateB7DecisionService({
    db, artifactStore: artifacts, basketReader: new FlowCandidateBasketReader(baskets),
    configuration: { policyId: CANDIDATE_B7_DECISION_POLICY_ID, policyVersion: 1, requiredCapability: CANDIDATE_B7_DECISION_CAPABILITY },
    uuid: () => b7DecisionId, now: () => new Date('2026-09-27T00:00:00Z'),
  });
  const products = new ProductWorkspaceService({
    db, artifactStore: artifacts, decisionReader: new GovernanceCandidateB7DecisionReader(decisions),
    uuid: () => productWorkspaceId, now: () => new Date('2026-09-28T00:00:00Z'),
  });
  await discovery.createWorkspace({ contractVersion: '1.0.0', workspaceKey: 'synthetic-calcium-market', title: 'Thị trường canxi tổng hợp' });
  await candidates.createCandidate({ contractVersion: '1.0.0', workspaceId: discoveryWorkspaceId, candidateKey: 'adult-calcium', label: 'Canxi người lớn tổng hợp', summary: 'Ý tưởng tổng hợp.' });
  await baskets.freezeBasket({ contractVersion: '1.0.0', workspaceId: discoveryWorkspaceId, basketKey: 'b7-basket', version: 1, candidates: [{ candidateId, candidateVersion: 1 }] });
  await decisions.decide(
    { contractVersion: '1.0.0', basketId, candidateId, candidateVersion: 1, decision: 'PASS' },
    { actorId: 'owner:khang', roleSnapshot: 'OWNER', capabilities: new Set([CANDIDATE_B7_DECISION_CAPABILITY]) },
  );
  await products.createWorkspace({ contractVersion: '1.0.0', decisionId: b7DecisionId, productWorkspaceKey: 'adult-calcium-product' });
}

async function serve(run: (read: string, owner: string, state: { databasePath: string; artifactRoot: string }) => Promise<void>, options: { readonly researchProduct?: boolean } = {}): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-insight-api-')); roots.push(root);
  const databasePath = path.join(root, 'db.sqlite'); const artifactRoot = path.join(root, 'artifacts');
  const { db } = openDatabase({ databasePath });
  try {
    const artifacts = new ContentAddressedArtifactStore(artifactRoot);
    const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => brandId, now: () => new Date(at) });
    const ids = [itemA, itemB];
    const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid: () => ids.shift()!, now: () => new Date(at) });
    await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile: { brandName: 'Canxi Việt' }, displayRules });
    await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'tu-van', item: item() });
    await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'canxi-nano', item: item({ name: 'Canxi nano' }) });
    if (options.researchProduct) await seedResearchProduct(db, artifacts);
  } finally { db.close(); }
  const owner = openContentOwnerApi({ databasePath, artifactRoot, writeEnabled: true, token, allowedOrigin: origin, actorId: 'owner:local', uuid: () => campaignId, now: () => new Date(at) });
  const read = openContentReadApi({ databasePath, artifactRoot, now: () => new Date(at) });
  const ownerServer = await listen(owner.handler); const readServer = await listen(read.handler);
  try { await run(readServer.base, ownerServer.base, { databasePath, artifactRoot }); }
  finally { await ownerServer.close(); await readServer.close(); owner.close(); read.close(); }
}

const post = (url: string, body: string, extraHeaders: Record<string, string> = headers) => fetch(url, { method: 'POST', headers: extraHeaders, body });

async function seedUnlinkedStpInsight(state: { readonly databasePath: string; readonly artifactRoot: string }): Promise<void> {
  const request = {
    contractVersion: '1.0.0' as const,
    campaignId,
    expectedVersion: 0,
    insight: {
      customer: 'Người con đi làm xa',
      painPoint: 'Khó chọn món quà thiết thực.',
      insight: 'Trao sự yên tâm mỗi ngày.',
      source: { kind: 'STP' as const, lockedStpId: '88888888-8888-4888-8888-0000000000e1' },
    },
  };
  const artifact = {
    contractVersion: '1.0.0' as const,
    campaignId,
    version: 1,
    insight: request.insight,
    createdAt: at,
    requestSha256: canonicalDigest(request),
  };
  const db = new BetterSqlite3(state.databasePath);
  try {
    const stored = await new ContentAddressedArtifactStore(state.artifactRoot).put(canonicalBytes(artifact));
    registerContentManifest(db, stored, at, 'application/json');
    db.prepare(`
      INSERT INTO flow_content_insight_revisions(campaign_id, version, source_kind, locked_stp_id, request_sha256, insight_artifact_sha256, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(campaignId, 1, 'STP', request.insight.source.lockedStpId, artifact.requestSha256, stored.sha256, at);
  } finally { db.close(); }
}

function committedDigest(state: { readonly databasePath: string }, table: 'flow_content_insight_revisions' | 'flow_content_insight_locks', column: 'insight_artifact_sha256' | 'lock_artifact_sha256'): string {
  const db = new BetterSqlite3(state.databasePath, { readonly: true });
  try { return (db.prepare(`SELECT ${column} digest FROM ${table} WHERE campaign_id = ?`).get(campaignId) as { digest: string }).digest; }
  finally { db.close(); }
}

test('Insight GET has the closed shape, distinguishes unknown campaigns and rejects invalid routes', async () => {
  await serve(async (read, owner) => {
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    const response = await fetch(`${read}/api/content/campaigns/${campaignId}/insight`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { contractVersion: '1.0.0', campaignId, campaignVersion: 1, campaignDeleted: false, history: [], gate: { required: false, ready: true } });
    assert.equal((await fetch(`${read}/api/content/campaigns/${unknownId}/insight`)).status, 404);
    assert.deepEqual(await (await fetch(`${read}/api/content/campaigns/not-a-uuid/insight`)).json(), { error: { code: 'bad_request', message: 'Campaign ID must be a UUID' } });
    assert.equal((await fetch(`${read}/api/content/campaigns/${campaignId}/insight?x=1`)).status, 400);
    assert.equal((await fetch(`${read}/api/content/campaigns/${campaignId}/insight`, { method: 'POST' })).status, 405);
    assert.equal((await fetch(`${read}/api/content/campaigns/${campaignId}/history`)).status, 404);
  });
});

test('OWNER Insight revisions and locks return exact receipts and exact retries', async () => {
  await serve(async (_read, owner) => {
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    const revisions = `${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`;
    const first = await post(revisions, revisionBody());
    assert.equal(first.status, 201);
    assert.deepEqual(await first.json(), { contractVersion: '1.0.0', campaignId, version: 1, createdAt: at, exactRetry: false });
    const retry = await post(revisions, revisionBody());
    assert.equal(retry.status, 200); assert.equal(((await retry.json()) as { exactRetry: boolean }).exactRetry, true);
    assert.equal((await post(revisions, revisionBody({ insight: insight({ insight: 'Đã đổi.' }) }))).status, 409);

    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    const locked = await post(locks, lockBody());
    assert.equal(locked.status, 201);
    assert.deepEqual(await locked.json(), { contractVersion: '1.0.0', campaignId, insightVersion: 1, campaignVersion: 1, lockedAt: at, exactRetry: false });
    const lockRetry = await post(locks, lockBody());
    assert.equal(lockRetry.status, 200); assert.equal(((await lockRetry.json()) as { exactRetry: boolean }).exactRetry, true);
    const detail = await (await fetch(`${_read}/api/content/campaigns/${campaignId}/insight`)).json() as { latest: { version: number }; lock: { insightVersion: number; campaignVersion: number }; history: unknown[] };
    assert.deepEqual([detail.latest.version, detail.lock.insightVersion, detail.lock.campaignVersion, detail.history.length], [1, 1, 1, 1]);
  });
});

test('OWNER Insight routes enforce exact keys, token/origin/preflight/body-size rules and unknown campaigns', async () => {
  await serve(async (_read, owner) => {
    const revisions = `${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`;
    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    assert.equal((await post(revisions, revisionBody({ extra: true }))).status, 400);
    assert.equal((await post(locks, lockBody({ extra: true }))).status, 400);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${unknownId}/insight/revisions`, revisionBody())).status, 404);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/${unknownId}/insight/lock`, lockBody())).status, 404);
    assert.equal((await post(`${owner}/owner-api/content/campaigns/not-a-uuid/insight/revisions`, revisionBody())).status, 400);
    assert.equal((await post(revisions, revisionBody(), { ...headers, authorization: 'Bearer wrong' })).status, 401);
    assert.equal((await post(revisions, revisionBody(), { ...headers, origin: 'http://evil.example' })).status, 403);
    assert.equal((await post(revisions, revisionBody(), { ...headers, 'content-type': 'text/plain' })).status, 400);
    assert.equal((await fetch(revisions, { method: 'GET', headers })).status, 405);
    assert.equal((await post(`${owner}/owner-api/content/unknown`, revisionBody())).status, 404);
    const preflight = await fetch(revisions, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'POST', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(preflight.status, 204);
    const rejectedPreflight = await fetch(revisions, { method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization, content-type' } });
    assert.equal(rejectedPreflight.status, 403);
    const large = await post(revisions, revisionBody({ insight: insight({ customer: 'x'.repeat(40 * 1024) }) }));
    assert.deepEqual([large.status, await large.json()], [400, { error: { code: 'bad_request', message: 'Request body is too large' } }]);
  });
});

test('Insight API maps invalid references, version conflicts and the B10 gate to the documented errors', async () => {
  await serve(async (_read, owner) => {
    const revisions = `${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`;
    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody({ campaign: campaign({ researchProductWorkspaceId: productWorkspaceId }) }))).status, 201);
    const invalidReference = await post(revisions, revisionBody({ insight: insight({ source: { kind: 'STP', lockedStpId: '88888888-8888-4888-8888-0000000000e1' } }) }));
    assert.deepEqual([invalidReference.status, await invalidReference.json()], [400, { error: { code: 'bad_request', message: 'Invalid insight reference' } }]);
    assert.equal((await post(revisions, revisionBody())).status, 201);
    const drift = await post(locks, lockBody({ insightVersion: 2 }));
    assert.deepEqual([drift.status, await drift.json()], [409, { error: { code: 'conflict', message: 'Request conflicts with current state' } }]);
  }, { researchProduct: true });

  await serve(async (_read, owner) => {
    const revisions = `${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`;
    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody({ campaign: campaign({ researchProductWorkspaceId: productWorkspaceId }) }))).status, 201);
    assert.equal((await post(revisions, revisionBody())).status, 201);
    const blocked = await post(locks, lockBody());
    assert.deepEqual([blocked.status, await blocked.json()], [409, { error: { code: 'conflict', message: INSIGHT_GATE_NOT_APPROVED } }]);
  }, { researchProduct: true });
});

test('OWNER Insight lock maps an unlinked STP source mismatch to a stable 409 conflict', async () => {
  await serve(async (_read, owner, state) => {
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    await seedUnlinkedStpInsight(state);
    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    const response = await post(locks, lockBody());
    assert.deepEqual([response.status, await response.json()], [409, { error: { code: 'conflict', message: 'Request conflicts with current state' } }]);
  });
});

test('OWNER Insight retries recover only the exact missing committed revision and lock artifacts', async () => {
  await serve(async (_read, owner, state) => {
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    const revisions = `${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`;
    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    assert.equal((await post(revisions, revisionBody())).status, 201);

    const revisionDigest = committedDigest(state, 'flow_content_insight_revisions', 'insight_artifact_sha256');
    const revisionFile = path.join(state.artifactRoot, 'sha256', revisionDigest.slice(0, 2), revisionDigest);
    fs.rmSync(revisionFile);
    const changedRevision = await post(revisions, revisionBody({ insight: insight({ insight: 'Yêu cầu khác.' }) }));
    assert.deepEqual([changedRevision.status, await changedRevision.json()], [500, { error: { code: 'integrity_error', message: 'Stored content data failed integrity verification' } }]);
    assert.equal(fs.existsSync(revisionFile), false);
    const revisionRetry = await post(revisions, revisionBody());
    assert.equal(revisionRetry.status, 200);
    assert.equal(fs.existsSync(revisionFile), true);

    assert.equal((await post(locks, lockBody())).status, 201);
    const lockDigest = committedDigest(state, 'flow_content_insight_locks', 'lock_artifact_sha256');
    const lockFile = path.join(state.artifactRoot, 'sha256', lockDigest.slice(0, 2), lockDigest);
    fs.rmSync(lockFile);
    const changedLock = await post(locks, lockBody({ campaignVersion: 2 }));
    assert.deepEqual([changedLock.status, await changedLock.json()], [500, { error: { code: 'integrity_error', message: 'Stored content data failed integrity verification' } }]);
    assert.equal(fs.existsSync(lockFile), false);
    const lockRetry = await post(locks, lockBody());
    assert.equal(lockRetry.status, 200);
    assert.equal(fs.existsSync(lockFile), true);
  });
});

test('OWNER Insight schemas are closed and route responses satisfy their JSON contracts', async () => {
  const require = createRequire(import.meta.url);
  const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
  const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
  const ajv = new Ajv2020({ allErrors: true, strict: true }); addFormats(ajv);
  ajv.addSchema(contentCampaignCreateSchema); ajv.addSchema(contentCampaignDefaultsSchema); ajv.addSchema(contentCatalogItemCreateSchema);
  ajv.addSchema(contentIdeaGenerateSchema); ajv.addSchema(contentIdeaStateSchema); ajv.addSchema(contentPromptCreateSchema); ajv.addSchema(contentPurposeTagSchema);
  ajv.addSchema(contentInsightRevisionSchema); ajv.addSchema(contentInsightLockSchema); ajv.addSchema(contentInsightLockArtifactSchema); ajv.addSchema(contentApiSchema); ajv.addSchema(ownerContentInsightApiSchema);
  const revisionRequest = ajv.getSchema(`${ownerContentInsightApiSchema.$id}#/$defs/revisionRequest`)!;
  const lockRequest = ajv.getSchema(`${ownerContentInsightApiSchema.$id}#/$defs/lockRequest`)!;
  const insightDetail = ajv.getSchema(`${contentApiSchema.$id}#/$defs/insightDetail`)!;
  const revisionReceipt = ajv.getSchema(`${ownerContentInsightApiSchema.$id}#/$defs/revisionReceipt`)!;
  const lockReceipt = ajv.getSchema(`${ownerContentInsightApiSchema.$id}#/$defs/lockReceipt`)!;
  assert.equal(revisionRequest({ contractVersion: '1.0.0', expectedVersion: 0, insight: insight() }), true);
  assert.equal(lockRequest({ contractVersion: '1.0.0', insightVersion: 1, campaignVersion: 1 }), true);
  assert.equal(revisionRequest({ contractVersion: '1.0.0', expectedVersion: 0, insight: insight(), extra: true }), false);
  assert.equal(lockRequest({ contractVersion: '1.0.0', insightVersion: 1, campaignVersion: 1, extra: true }), false);
  await serve(async (read, owner) => {
    assert.equal((await post(`${owner}/owner-api/content/campaigns`, createBody())).status, 201);
    const emptyDetail = await (await fetch(`${read}/api/content/campaigns/${campaignId}/insight`)).json();
    assert.equal(insightDetail(emptyDetail), true);
    const revisions = `${owner}/owner-api/content/campaigns/${campaignId}/insight/revisions`;
    const revisionResponse = await post(revisions, revisionBody());
    const revisionValue = await revisionResponse.json();
    assert.equal(revisionResponse.status, 201);
    assert.equal(revisionReceipt(revisionValue), true);
    const locks = `${owner}/owner-api/content/campaigns/${campaignId}/insight/lock`;
    const lockResponse = await post(locks, lockBody());
    const lockValue = await lockResponse.json();
    assert.equal(lockResponse.status, 201);
    assert.equal(lockReceipt(lockValue), true);
    const finalDetail = await (await fetch(`${read}/api/content/campaigns/${campaignId}/insight`)).json();
    assert.equal(insightDetail(finalDetail), true);
  });
});
