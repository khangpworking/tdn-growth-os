import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  ContentInsightContent,
  ContentInsightStpSuggestion,
} from '../../contracts/api/content-api.generated';
import { tsImport } from 'tsx/esm/api';
import { ContentDataSourceError } from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';
import { createSeedState } from '../src/model';
import {
  INSIGHT_GATE_NOT_APPROVED,
  applyStpSuggestion,
  demoInsightDetail,
  demoInsightGate,
  draftFromInsight,
  editInsightDraft,
  emptyInsightDraft,
  insightDraftBlocker,
  insightRequestFromDraft,
  insightStage,
  loadInsight,
  lockDemoInsight,
  reviseDemoInsight,
  submitInsightLock,
  submitInsightRevision,
  type InsightDetail,
  type InsightDraft,
} from '../src/insight-data-source';

const campaignId = '66666666-6666-4666-8666-0000000000c1';
const productWorkspaceId = '66666666-6666-4666-8666-0000000000f1';
const lockedStpId = '66666666-6666-4666-8666-0000000000e1';
const decisionId = '66666666-6666-4666-8666-0000000000b1';
const at = '2027-01-01T00:00:00.000Z';
const later = '2027-01-02T00:00:00.000Z';
const token = 'synthetic-owner-token';

const typedInsight = (): ContentInsightContent => ({
  customer: 'Target customer',
  painPoint: 'A concrete pain point',
  insight: 'A useful insight',
  source: { kind: 'TYPED' },
});

const stpSuggestion: ContentInsightStpSuggestion = {
  lockedStpId,
  customer: 'Primary segment',
  insight: 'Positioning from the locked STP',
};

function detail(overrides: Partial<InsightDetail> = {}): InsightDetail {
  return {
    contractVersion: '1.0.0',
    campaignId,
    campaignVersion: 2,
    campaignDeleted: false,
    history: [],
    gate: { required: false, ready: true },
    ...overrides,
  };
}

function oneRevisionDetail(): InsightDetail {
  const insight = typedInsight();
  return detail({
    latest: { version: 1, insight, createdAt: at },
    history: [{ version: 1, sourceKind: 'TYPED', createdAt: at }],
    gate: { required: true, ready: true, productWorkspaceId, effectiveDecision: 'APPROVE' },
    stpSuggestion,
    lock: {
      insightVersion: 1,
      campaignVersion: 2,
      lockedAt: later,
      b10: {
        productWorkspaceId,
        lockedStpId,
        effectiveDecisionId: decisionId,
        effectiveDecisionNumber: 2,
        effectiveDecision: 'APPROVE',
      },
    },
  });
}

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fixedFetcher(body: unknown, status = 200): typeof fetch {
  return (async () => response(body, status)) as typeof fetch;
}

async function assertIntegrity(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
}

test('Insight drafts preserve the pain point and clear STP provenance only for edited mapped fields', () => {
  assert.deepEqual(emptyInsightDraft(), { customer: '', painPoint: '', insight: '', lockedStpId: '' });
  const draft: InsightDraft = { customer: 'Old customer', painPoint: 'Keep this pain', insight: 'Old insight', lockedStpId };
  assert.deepEqual(applyStpSuggestion(draft, stpSuggestion), {
    customer: stpSuggestion.customer,
    painPoint: draft.painPoint,
    insight: stpSuggestion.insight,
    lockedStpId,
  });
  assert.equal(editInsightDraft(draft, 'customer', 'New customer').lockedStpId, '');
  assert.equal(editInsightDraft(draft, 'insight', 'New insight').lockedStpId, '');
  assert.equal(editInsightDraft(draft, 'painPoint', 'New pain').lockedStpId, lockedStpId);
  assert.deepEqual(draftFromInsight(detail({ latest: { version: 1, insight: { ...typedInsight(), source: { kind: 'STP', lockedStpId } }, createdAt: at } })), {
    customer: typedInsight().customer,
    painPoint: typedInsight().painPoint,
    insight: typedInsight().insight,
    lockedStpId,
  });
});

test('Insight draft blockers enforce required fields and UTF-16-independent length limits', () => {
  const valid: InsightDraft = { customer: 'Customer', painPoint: 'Pain', insight: 'Insight', lockedStpId: '' };
  assert.equal(insightDraftBlocker(valid), null);
  const invalids: InsightDraft[] = [
    { ...valid, customer: '' },
    { ...valid, customer: 'x'.repeat(501) },
    { ...valid, painPoint: '' },
    { ...valid, painPoint: 'x'.repeat(1001) },
    { ...valid, insight: '' },
    { ...valid, insight: 'x'.repeat(2001) },
  ];
  const messages = invalids.map((draft) => insightDraftBlocker(draft));
  assert.equal(messages.every((message) => typeof message === 'string'), true);
  assert.equal(new Set(messages).size, invalids.length);
  const emoji = String.fromCodePoint(0x1f642);
  assert.equal(insightDraftBlocker({ ...valid, customer: `  ${emoji.repeat(500)}  ` }), null);
  assert.notEqual(insightDraftBlocker({ ...valid, customer: `  ${emoji.repeat(501)}  ` }), null);
});

test('Insight request mapping trims text and carries only the selected source kind', () => {
  assert.deepEqual(insightRequestFromDraft({ customer: '  Customer  ', painPoint: ' Pain ', insight: ' Insight ', lockedStpId }), {
    customer: 'Customer', painPoint: 'Pain', insight: 'Insight', source: { kind: 'STP', lockedStpId },
  });
  assert.deepEqual(insightRequestFromDraft({ customer: 'Customer', painPoint: 'Pain', insight: 'Insight', lockedStpId: '' }), {
    ...typedInsight(),
  });
});

test('insightStage applies lock, deletion, empty, gate and lockable ordering', () => {
  const current = detail({
    latest: { version: 1, insight: typedInsight(), createdAt: at },
    history: [{ version: 1, sourceKind: 'TYPED', createdAt: at }],
  });
  assert.equal(insightStage({ ...current, lock: { insightVersion: 1, campaignVersion: 2, lockedAt: later } }), 'locked');
  assert.equal(insightStage({ ...current, campaignDeleted: true }), 'deleted');
  assert.equal(insightStage(detail()), 'empty');
  assert.equal(insightStage({ ...current, gate: { required: true, ready: false, reason: 'blocked' } }), 'blocked');
  assert.equal(insightStage(current), 'lockable');
});

test('loadInsight accepts the closed detail contract, maps 404 to null, and rejects extra keys', async () => {
  const valid = oneRevisionDetail();
  assert.deepEqual(await loadInsight(campaignId, fixedFetcher(valid)), valid);
  assert.equal(await loadInsight(campaignId, fixedFetcher({ error: { code: 'not_found' } }, 404)), null);
  await assertIntegrity(loadInsight(campaignId, fixedFetcher({ ...valid, extra: true })));
  await assertIntegrity(loadInsight(campaignId, fixedFetcher({ ...valid, history: [{ ...valid.history[0]!, extra: true }] })));
  await assertIntegrity(loadInsight(campaignId, fixedFetcher({
    ...valid,
    latest: { ...valid.latest!, insight: { ...valid.latest!.insight, extra: true } },
  })));
  await assertIntegrity(loadInsight(campaignId, fixedFetcher({ ...valid, campaignId: '66666666-6666-4666-8666-0000000000c2' })));
});

test('OWNER Insight revision and lock submissions send closed bodies and enforce receipt versions', async () => {
  const insight = typedInsight();
  let observedUrl = '';
  let observedInit: RequestInit | undefined;
  const revisionReceipt = await submitInsightRevision({ campaignId, expectedVersion: 1, insight, token }, (async (url, init) => {
    observedUrl = String(url); observedInit = init;
    return response({ contractVersion: '1.0.0', campaignId, version: 2, createdAt: at, exactRetry: false }, 201);
  }) as typeof fetch);
  assert.equal(observedUrl, `/owner-api/content/campaigns/${campaignId}/insight/revisions`);
  assert.equal(new Headers(observedInit?.headers).get('authorization'), `Bearer ${token}`);
  assert.deepEqual(JSON.parse(String(observedInit?.body)), { contractVersion: '1.0.0', expectedVersion: 1, insight });
  assert.deepEqual(revisionReceipt, { contractVersion: '1.0.0', campaignId, version: 2, createdAt: at, exactRetry: false });
  await assert.rejects(submitInsightRevision({ campaignId, expectedVersion: 1, insight, token }, fixedFetcher({ contractVersion: '1.0.0', campaignId, version: 3, createdAt: at, exactRetry: false }, 201)), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');

  const lockReceipt = await submitInsightLock({ campaignId, insightVersion: 2, campaignVersion: 2, token }, (async (_url, init) => {
    observedInit = init;
    return response({ contractVersion: '1.0.0', campaignId, insightVersion: 2, campaignVersion: 2, lockedAt: later, exactRetry: false }, 201);
  }) as typeof fetch);
  assert.deepEqual(JSON.parse(String(observedInit?.body)), { contractVersion: '1.0.0', insightVersion: 2, campaignVersion: 2 });
  assert.deepEqual(lockReceipt, { contractVersion: '1.0.0', campaignId, insightVersion: 2, campaignVersion: 2, lockedAt: later, exactRetry: false });
});

test('OWNER 409 surfaces the Vietnamese B10 gate reason instead of replacing it with generic conflict copy', async () => {
  await assert.rejects(
    submitInsightRevision({ campaignId, expectedVersion: 0, insight: typedInsight(), token }, fixedFetcher({ error: { code: 'conflict', message: INSIGHT_GATE_NOT_APPROVED } }, 409)),
    (error: unknown) => error instanceof OwnerWriteError && error.kind === 'conflict' && error.message === INSIGHT_GATE_NOT_APPROVED,
  );
  await assert.rejects(
    submitInsightLock({ campaignId, insightVersion: 1, campaignVersion: 1, token }, fixedFetcher({ error: { code: 'conflict', message: INSIGHT_GATE_NOT_APPROVED } }, 409)),
    (error: unknown) => error instanceof OwnerWriteError && error.kind === 'conflict' && error.message === INSIGHT_GATE_NOT_APPROVED,
  );
});

test('demo Insight gate, detail, revision and lock form the same owner flow', () => {
  const approve: { readonly id: string; readonly b10: 'APPROVE'; readonly stp: ContentInsightStpSuggestion } = { id: productWorkspaceId, b10: 'APPROVE', stp: stpSuggestion };
  const hold = { id: '66666666-6666-4666-8666-0000000000f2', b10: 'HOLD' as const, stp: null };
  const noDecision = { id: '66666666-6666-4666-8666-0000000000f3', b10: null, stp: null };
  assert.deepEqual(demoInsightGate(undefined, [approve]), { required: false, ready: true });
  assert.deepEqual(demoInsightGate(productWorkspaceId, [approve]), { required: true, ready: true, effectiveDecision: 'APPROVE' });
  assert.deepEqual(demoInsightGate(hold.id, [hold]), { required: true, ready: false, effectiveDecision: 'HOLD', reason: INSIGHT_GATE_NOT_APPROVED });
  assert.deepEqual(demoInsightGate(noDecision.id, [noDecision]), { required: true, ready: false, reason: INSIGHT_GATE_NOT_APPROVED });

  const campaign = { campaignId, version: 3, deleted: false, researchProductWorkspaceId: productWorkspaceId };
  const draft: InsightDraft = { customer: 'Customer', painPoint: 'Pain', insight: 'Insight', lockedStpId: lockedStpId };
  const empty = demoInsightDetail([], campaign, [approve]);
  assert.deepEqual(empty.gate, { required: true, ready: true, effectiveDecision: 'APPROVE', productWorkspaceId });
  assert.deepEqual(empty.stpSuggestion, stpSuggestion);
  assert.equal(insightStage(empty), 'empty');

  const revised = reviseDemoInsight([], campaignId, 0, draft, at);
  const revisedAgain = reviseDemoInsight(revised, campaignId, 1, { ...draft, insight: 'Second insight' }, later);
  assert.deepEqual(revisedAgain[0]?.versions.map((entry) => entry.version), [1, 2]);
  const locked = lockDemoInsight(revisedAgain, campaignId, 2, campaign.version, '2027-01-03T00:00:00.000Z');
  const lockedDetail = demoInsightDetail(locked, campaign, [approve]);
  assert.equal(insightStage(lockedDetail), 'locked');
  assert.deepEqual(lockedDetail.lock, { insightVersion: 2, campaignVersion: 3, lockedAt: '2027-01-03T00:00:00.000Z' });
  assert.throws(() => reviseDemoInsight(locked, campaignId, 2, draft, later), /locked/);
  assert.throws(() => lockDemoInsight(locked, campaignId, 2, campaign.version, later), /conflict/);
});

test('researchProduct maps a locked B9 primary target and the effective B10 decision, but never suggests unlocked STP', async () => {
  const { researchProduct } = await tsImport('../src/App.tsx', { parentURL: import.meta.url, tsconfig: 'frontend/tsconfig.json' }) as typeof import('../src/App');
  const seed = createSeedState();
  const adult = seed.products.find((product) => product.id === 'adult')!;
  const child = seed.products.find((product) => product.id === 'child')!;
  const adultResearch = researchProduct(adult);
  assert.equal(adultResearch.b10, adult.b10.effective?.decision);
  assert.equal(adultResearch.stp?.lockedStpId, adult.b9.state === 'LOCKED' ? adult.b9.locked.id : null);
  assert.equal(adultResearch.stp?.customer, adult.b9.state === 'LOCKED' ? adult.b9.working.segments.find((segment) => segment.key === adult.b9.working.primaryTargetKey)?.label : undefined);
  assert.equal(adultResearch.stp?.insight, adult.b9.state === 'LOCKED' ? adult.b9.working.positioning : undefined);
  assert.deepEqual(researchProduct(child).stp, null);
  assert.equal(researchProduct(child).b10, null);

  const hold = {
    ...child,
    b10: {
      history: [{ id: '66666666-6666-4666-8666-0000000000d1', number: 1, previousId: null, decision: 'HOLD', decidedAt: at }],
      effective: { id: '66666666-6666-4666-8666-0000000000d1', number: 1, previousId: null, decision: 'HOLD', decidedAt: at },
      readyForB11: false,
    },
  } as typeof child;
  assert.equal(researchProduct(hold).b10, 'HOLD');
  assert.equal(researchProduct(hold).stp, null);
});
