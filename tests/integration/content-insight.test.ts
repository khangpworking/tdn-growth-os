import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import type { LockedStpArtifact } from '../../contracts/flow/locked-stp-artifact.generated.js';
import type { ProductWorkspaceArtifact } from '../../contracts/flow/product-workspace-artifact.generated.js';
import type { ProductB10Decision } from '../../contracts/governance/product-b10-decision.generated.js';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCampaignConflictError, ContentCampaignService } from '../../src/modules/flow/content-campaign-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import {
  ContentInsightConflictError,
  ContentInsightGateError,
  ContentInsightReferenceError,
  ContentInsightService,
  INSIGHT_GATE_NOT_APPROVED,
  type ContentInsightB10Reader,
} from '../../src/modules/flow/content-insight-service.js';
import type { LockedStpReader } from '../../src/modules/flow/locked-stp-reader.js';
import type { ProductWorkspaceReader } from '../../src/modules/flow/product-workspace-reader.js';
import { FlowValidationError } from '../../src/modules/flow/validation.js';
import type { ProductB10Status } from '../../src/modules/governance/product-b10-decision-service.js';
import { openDatabase } from '../../src/platform/db/database.js';

const brandId = '66666666-6666-4666-8666-000000000001';
const itemA = '66666666-6666-4666-8666-0000000000a1';
const itemB = '66666666-6666-4666-8666-0000000000a2';
const campaignId = '66666666-6666-4666-8666-0000000000c1';
const workspaceId = '66666666-6666-4666-8666-0000000000f1';
const otherWorkspaceId = '66666666-6666-4666-8666-0000000000f2';
const lockedStpId = '66666666-6666-4666-8666-0000000000e1';
const b10DecisionId = '66666666-6666-4666-8666-0000000000b1';
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

const catalogItem = (patch: Record<string, unknown> = {}) => ({
  itemType: 'SERVICE', name: 'Tư vấn dinh dưỡng xương', description: 'Tư vấn tổng hợp cho gia đình.',
  tiers: [
    { tierKey: 'go', name: 'Go', priceText: '99.000đ', inclusions: ['1 buổi'] },
    { tierKey: 'plus', name: 'Plus', priceText: '249.000đ', inclusions: ['3 buổi'] },
  ], photos: [], ...patch,
});

const campaignContent = (patch: Record<string, unknown> = {}) => ({
  name: 'Chiến dịch Tết', objective: 'Tăng số cuộc tư vấn trong tháng một.',
  items: [{ itemId: itemA, itemVersion: 2, tierKeys: ['plus'] }, { itemId: itemB, itemVersion: 1 }],
  ...patch,
});

const insightContent = (patch: Record<string, unknown> = {}) => ({
  customer: 'Người con đi làm xa',
  painPoint: 'Khó chọn món quà chăm sóc bố mẹ thật thiết thực.',
  insight: 'Họ muốn trao sự yên tâm mỗi ngày, không chỉ một món quà dịp Tết.',
  source: { kind: 'TYPED' },
  ...patch,
});

const productWorkspace = (id: string): ProductWorkspaceArtifact => ({ productWorkspaceId: id } as unknown as ProductWorkspaceArtifact);
const lockedStp = (id: string): LockedStpArtifact => ({
  lockId: lockedStpId,
  productWorkspace: { artifact: { productWorkspaceId: id } },
} as unknown as LockedStpArtifact);

function b10Status(decision: ProductB10Decision['decision'] | null, id = workspaceId): ProductB10Status {
  if (decision === null) return { productWorkspaceId: id, decisionExists: false, readyForB11: false };
  return {
    lockedStpId,
    productWorkspaceId: id,
    decisionExists: true,
    effectiveDecisionId: b10DecisionId,
    effectiveDecisionNumber: 2,
    effectiveDecision: decision,
    readyForB11: decision === 'APPROVE',
  };
}

class ResearchFixture implements ProductWorkspaceReader, LockedStpReader, ContentInsightB10Reader {
  readonly lockedStpWorkspaceId: string;
  readonly status: ProductB10Status;
  readonly stpAvailable: boolean;

  constructor(options: { readonly decision?: ProductB10Decision['decision'] | null; readonly lockedStpWorkspaceId?: string; readonly stpAvailable?: boolean } = {}) {
    this.lockedStpWorkspaceId = options.lockedStpWorkspaceId ?? workspaceId;
    this.status = b10Status(options.decision ?? null);
    this.stpAvailable = options.stpAvailable ?? true;
  }

  async readVerifiedProductWorkspace(id: string): Promise<ProductWorkspaceArtifact> {
    if (id !== workspaceId && id !== otherWorkspaceId) throw new FlowValidationError(`Product workspace not found: ${id}`);
    return productWorkspace(id);
  }

  async readVerifiedLockedStp(id: string): Promise<LockedStpArtifact> {
    if (!this.stpAvailable) throw new FlowValidationError(`Locked STP not found: ${id}`);
    if (id !== lockedStpId) throw new FlowValidationError(`Locked STP not found: ${id}`);
    return lockedStp(this.lockedStpWorkspaceId);
  }

  async readStatusByLockedStp(_lockedStpId: string): Promise<ProductB10Status> { return structuredClone(this.status); }

  async readStatusByProductWorkspace(id: string): Promise<ProductB10Status> {
    return structuredClone({ ...this.status, productWorkspaceId: id });
  }

  async readVerifiedDecision(): Promise<never> { throw new Error('Synthetic B10 decision replay is not needed for this fixture'); }
}

interface SetupOptions {
  readonly decision?: ProductB10Decision['decision'] | null;
  readonly linkedStpWorkspaceId?: string;
  readonly stpAvailable?: boolean;
  readonly withB10?: boolean;
  readonly withStp?: boolean;
}

async function setup(options: SetupOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-insight-')); roots.push(root);
  const { db } = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const now = () => new Date(at);
  const brands = new ContentBrandService({ db, artifactStore: artifacts, uuid: () => brandId, now });
  const catalogIds = [itemA, itemB];
  const catalog = new ContentCatalogService({ db, artifactStore: artifacts, uuid: () => catalogIds.shift()!, now });
  const research = new ResearchFixture({
    decision: options.decision ?? null,
    ...(options.linkedStpWorkspaceId === undefined ? {} : { lockedStpWorkspaceId: options.linkedStpWorkspaceId }),
    ...(options.stpAvailable === undefined ? {} : { stpAvailable: options.stpAvailable }),
  });
  const campaigns = new ContentCampaignService({ db, artifactStore: artifacts, catalog, workspaceReader: research, uuid: () => campaignId, now });
  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'canxi-viet', profile: { brandName: 'Canxi Việt' }, displayRules });
  await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'tu-van', item: catalogItem() });
  await catalog.reviseItem({ contractVersion: '1.0.0', itemId: itemA, expectedVersion: 1, item: catalogItem({ tiers: [...catalogItem().tiers, { tierKey: 'pro', name: 'Pro', priceText: '499.000đ', inclusions: ['6 buổi'] }] }) });
  await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'canxi-nano', item: catalogItem({ name: 'Canxi nano' }) });
  const insights = new ContentInsightService({
    db, artifactStore: artifacts, campaigns,
    ...(options.withStp === false ? {} : { lockedStpReader: research }),
    ...(options.withB10 === false ? {} : { b10Reader: research }),
    now,
  });
  return { db, artifacts, campaigns, insights, research };
}

async function createCampaign(state: Awaited<ReturnType<typeof setup>>, patch: Record<string, unknown> = {}) {
  return state.campaigns.createCampaign({ contractVersion: '1.0.0', campaignKey: 'tet-2027', brandId, campaign: campaignContent(patch) });
}

function revision(campaign: string, expectedVersion: number, content: Record<string, unknown> = insightContent()) {
  return { contractVersion: '1.0.0', campaignId: campaign, expectedVersion, insight: content };
}

function lock(campaign: string, insightVersion: number, campaignVersion: number) {
  return { contractVersion: '1.0.0', campaignId: campaign, insightVersion, campaignVersion };
}

function count(db: ReturnType<typeof openDatabase>['db'], table: string): number {
  return Number((db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint | number }).n);
}

test('first Insight revision is v1, exact retries are receipts, and drift conflicts without new rows', async () => {
  const state = await setup(); await createCampaign(state);
  const first = await state.insights.reviseInsight(revision(campaignId, 0));
  assert.deepEqual([first.version, first.deduplicated, first.databaseMutations, first.createdAt], [1, false, 2, at]);
  const firstArtifact = await state.insights.readInsight(campaignId);
  assert.deepEqual([firstArtifact.version, firstArtifact.insight, firstArtifact.createdAt], [1, insightContent(), at]);
  assert.match(firstArtifact.requestSha256, /^[0-9a-f]{64}$/);
  const retry = await state.insights.reviseInsight(revision(campaignId, 0));
  assert.deepEqual(retry, { ...first, deduplicated: true, databaseMutations: 0 });
  await assert.rejects(state.insights.reviseInsight(revision(campaignId, 0, insightContent({ insight: 'Nội dung đã đổi.' }))), ContentInsightConflictError);
  await assert.rejects(state.insights.reviseInsight(revision(campaignId, 2)), ContentInsightConflictError);
  assert.equal(count(state.db, 'flow_content_insight_revisions'), 1);
  state.db.close();
});

test('revision is refused after lock, and deleted campaigns refuse both revision and lock', async () => {
  const locked = await setup(); await createCampaign(locked); await locked.insights.reviseInsight(revision(campaignId, 0));
  await locked.insights.lockInsight(lock(campaignId, 1, 1));
  await assert.rejects(locked.insights.reviseInsight(revision(campaignId, 1, insightContent({ insight: 'Sau khóa.' }))), (error: unknown) => error instanceof ContentInsightConflictError && /locked/.test(error.message));
  locked.db.close();

  const deleted = await setup(); await createCampaign(deleted); await deleted.insights.reviseInsight(revision(campaignId, 0));
  await deleted.campaigns.changeLifecycle({ contractVersion: '1.0.0', campaignId, action: 'DELETE', expectedSequence: 0 });
  await assert.rejects(deleted.insights.reviseInsight(revision(campaignId, 1, insightContent({ insight: 'Không được ghi.' }))), (error: unknown) => error instanceof ContentInsightConflictError && /deleted/.test(error.message));
  await assert.rejects(deleted.insights.lockInsight(lock(campaignId, 1, 1)), (error: unknown) => error instanceof ContentInsightConflictError && /deleted/.test(error.message));
  deleted.db.close();
});

test('STP source requires the linked product and that product’s locked STP', async () => {
  const unlinked = await setup(); await createCampaign(unlinked);
  await assert.rejects(unlinked.insights.reviseInsight(revision(campaignId, 0, insightContent({ source: { kind: 'STP', lockedStpId } }))), ContentInsightReferenceError);
  unlinked.db.close();

  const missingReader = await setup({ withStp: false }); await createCampaign(missingReader, { researchProductWorkspaceId: workspaceId });
  await assert.rejects(missingReader.insights.reviseInsight(revision(campaignId, 0, insightContent({ source: { kind: 'STP', lockedStpId } }))), ContentInsightReferenceError);
  missingReader.db.close();

  const wrongProduct = await setup({ linkedStpWorkspaceId: otherWorkspaceId }); await createCampaign(wrongProduct, { researchProductWorkspaceId: workspaceId });
  await assert.rejects(wrongProduct.insights.reviseInsight(revision(campaignId, 0, insightContent({ source: { kind: 'STP', lockedStpId } }))), ContentInsightReferenceError);
  wrongProduct.db.close();

  const valid = await setup(); await createCampaign(valid, { researchProductWorkspaceId: workspaceId });
  const result = await valid.insights.reviseInsight(revision(campaignId, 0, insightContent({ source: { kind: 'STP', lockedStpId } })));
  assert.deepEqual((await valid.insights.readInsight(campaignId)).insight.source, { kind: 'STP', lockedStpId });
  assert.equal(result.version, 1);
  valid.db.close();
});

test('an unlinked campaign has no B10 gate; HOLD, REJECT and no decision block linked locks', async () => {
  const unlinked = await setup({ withB10: false }); await createCampaign(unlinked); await unlinked.insights.reviseInsight(revision(campaignId, 0));
  assert.deepEqual(await unlinked.insights.gate(undefined), { required: false, ready: true });
  await unlinked.insights.lockInsight(lock(campaignId, 1, 1));
  unlinked.db.close();

  for (const decision of [null, 'HOLD', 'REJECT'] as const) {
    const state = await setup({ decision }); await createCampaign(state, { researchProductWorkspaceId: workspaceId }); await state.insights.reviseInsight(revision(campaignId, 0));
    const expectedGate = decision === null
      ? { required: true, ready: false, reason: INSIGHT_GATE_NOT_APPROVED }
      : { required: true, ready: false, effectiveDecision: decision, reason: INSIGHT_GATE_NOT_APPROVED };
    assert.deepEqual(await state.insights.gate(workspaceId), expectedGate);
    await assert.rejects(state.insights.lockInsight(lock(campaignId, 1, 1)), (error: unknown) => error instanceof ContentInsightGateError && error.reason === INSIGHT_GATE_NOT_APPROVED);
    state.db.close();
  }
});

test('B10 APPROVE locks the current clearance into the immutable lock artifact', async () => {
  const state = await setup({ decision: 'APPROVE' }); await createCampaign(state, { researchProductWorkspaceId: workspaceId });
  await state.insights.reviseInsight(revision(campaignId, 0));
  const result = await state.insights.lockInsight(lock(campaignId, 1, 1));
  assert.deepEqual([result.insightVersion, result.campaignVersion, result.deduplicated], [1, 1, false]);
  assert.deepEqual((await state.insights.readLock(campaignId))?.b10, {
    productWorkspaceId: workspaceId, lockedStpId, effectiveDecisionId: b10DecisionId, effectiveDecisionNumber: 2, effectiveDecision: 'APPROVE',
  });
  assert.equal((state.db.prepare('SELECT b10_decision_id value FROM flow_content_insight_locks WHERE campaign_id=?').get(campaignId) as { value: string }).value, b10DecisionId);
  state.db.close();
});

test('locking rejects insight-version and campaign-version drift', async () => {
  const insightDrift = await setup(); await createCampaign(insightDrift); await insightDrift.insights.reviseInsight(revision(campaignId, 0)); await insightDrift.insights.reviseInsight(revision(campaignId, 1, insightContent({ insight: 'Phiên bản hai.' })));
  await assert.rejects(insightDrift.insights.lockInsight(lock(campaignId, 1, 1)), ContentInsightConflictError);
  insightDrift.db.close();

  const campaignDrift = await setup(); await createCampaign(campaignDrift); await campaignDrift.insights.reviseInsight(revision(campaignId, 0));
  await campaignDrift.campaigns.reviseCampaign({ contractVersion: '1.0.0', campaignId, expectedVersion: 1, campaign: campaignContent({ name: 'Tên mới' }) });
  await assert.rejects(campaignDrift.insights.lockInsight(lock(campaignId, 1, 1)), ContentInsightConflictError);
  const locked = await campaignDrift.insights.lockInsight(lock(campaignId, 1, 2));
  assert.equal(locked.campaignVersion, 2);
  campaignDrift.db.close();
});

test('revision, lock and history reads fail closed when committed artifacts are tampered', async () => {
  const revisionState = await setup(); await createCampaign(revisionState); await revisionState.insights.reviseInsight(revision(campaignId, 0)); await revisionState.insights.reviseInsight(revision(campaignId, 1, insightContent({ insight: 'Phiên bản hai.' })));
  const revisionFile = revisionState.artifacts.pathForDigest((revisionState.db.prepare('SELECT insight_artifact_sha256 sha FROM flow_content_insight_revisions WHERE campaign_id=? AND version=1').get(campaignId) as { sha: string }).sha);
  fs.chmodSync(revisionFile, 0o600);
  const tamperedRevision = JSON.parse(fs.readFileSync(revisionFile, 'utf8')) as { insight: Record<string, unknown> };
  tamperedRevision.insight = { ...tamperedRevision.insight, customer: 'Tampered customer' };
  fs.writeFileSync(revisionFile, JSON.stringify(tamperedRevision));
  assert.deepEqual(revisionState.insights.history(campaignId).map((row) => row.version), [1, 2]);
  await assert.rejects(revisionState.insights.readInsight(campaignId, 1));
  await assert.rejects(Promise.all(revisionState.insights.history(campaignId).map((row) => revisionState.insights.readInsight(campaignId, row.version))));
  revisionState.db.close();

  const lockState = await setup(); await createCampaign(lockState); await lockState.insights.reviseInsight(revision(campaignId, 0)); await lockState.insights.lockInsight(lock(campaignId, 1, 1));
  const lockFile = lockState.artifacts.pathForDigest((lockState.db.prepare('SELECT lock_artifact_sha256 sha FROM flow_content_insight_locks WHERE campaign_id=?').get(campaignId) as { sha: string }).sha);
  fs.chmodSync(lockFile, 0o600); fs.writeFileSync(lockFile, fs.readFileSync(lockFile, 'utf8').replace('2027-01-01T00:00:00.000Z', '2027-01-02T00:00:00.000Z'));
  await assert.rejects(lockState.insights.readLock(campaignId));
  lockState.db.close();
});

test('after an Insight lock, campaign name/objective remain editable but items, tiers and research link are pinned', async () => {
  const state = await setup(); await createCampaign(state); await state.insights.reviseInsight(revision(campaignId, 0)); await state.insights.lockInsight(lock(campaignId, 1, 1));
  const renamed = await state.campaigns.reviseCampaign({ contractVersion: '1.0.0', campaignId, expectedVersion: 1, campaign: campaignContent({ name: 'Tên đã đổi', objective: 'Mục tiêu đã đổi' }) });
  assert.equal(renamed.version, 2);
  await assert.rejects(state.campaigns.reviseCampaign({ contractVersion: '1.0.0', campaignId, expectedVersion: 2, campaign: campaignContent({ items: [{ itemId: itemA, itemVersion: 2, tierKeys: [] }, { itemId: itemB, itemVersion: 1 }] }) }), ContentCampaignConflictError);
  await assert.rejects(state.campaigns.reviseCampaign({ contractVersion: '1.0.0', campaignId, expectedVersion: 2, campaign: campaignContent({ items: [{ itemId: itemB, itemVersion: 1 }] }) }), ContentCampaignConflictError);
  await assert.rejects(state.campaigns.reviseCampaign({ contractVersion: '1.0.0', campaignId, expectedVersion: 2, campaign: campaignContent({ researchProductWorkspaceId: workspaceId }) }), ContentCampaignConflictError);
  assert.deepEqual(state.campaigns.campaignVersions(campaignId), [1, 2]);
  state.db.close();
});
