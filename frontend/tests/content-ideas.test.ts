import assert from 'node:assert/strict';
import test from 'node:test';
import { ContentDataSourceError } from '../src/content-data-source';
import { OwnerWriteError } from '../src/data-source';
import {
  DEMO_SYSTEM_PROMPTS,
  demoPromptList,
  type DemoPrompt,
} from '../src/prompt-data-source';
import {
  IDEA_MODELS,
  MAX_CALLS_PER_PROMPT,
  MAX_CALLS_PER_RUN,
  MAX_PURPOSES,
  PURPOSE_KINDS,
  IdeaAiError,
  anglesOf,
  changeDemoIdeaState,
  contentAiCallCount,
  createDemoPurposeTag,
  demoIdeaList,
  developingBigIdeas,
  generateDemoIdea,
  ideaRunBlocker,
  ideaRunPlan,
  letterCode,
  loadIdeas,
  purposeDisplayKind,
  purposeKindLabel,
  purposeLabel,
  purposeTagBlocker,
  submitIdeaGenerate,
  submitIdeaState,
  submitPurposeTag,
  type DemoIdea,
  type DemoIdeaCampaign,
  type IdeaEntry,
  type IdeaList,
  type IdeaPromptSelection,
  type PurposeTag,
} from '../src/idea-data-source';
import type { OwnerContentIdeaGenerateRequest } from '../../contracts/api/owner-content-idea-api.generated';

const campaignId = '66666666-6666-4666-8666-0000000000c1';
const otherCampaignId = '66666666-6666-4666-8666-0000000000c2';
const bigA = '66666666-6666-4666-8666-0000000000a1';
const bigB = '66666666-6666-4666-8666-0000000000a2';
const angleA1 = '66666666-6666-4666-8666-0000000000b1';
const angleB1 = '66666666-6666-4666-8666-0000000000b2';
const tagId = '66666666-6666-4666-8666-0000000000d1';
const at = '2027-01-01T00:00:00.000Z';
const later = '2027-01-02T00:00:00.000Z';
const token = 'synthetic-owner-token';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function fixedFetcher(body: unknown, status = 200): typeof fetch {
  return (async () => response(body, status)) as typeof fetch;
}

async function assertIntegrity(promise: Promise<unknown>): Promise<void> {
  await assert.rejects(promise, (error: unknown) => error instanceof ContentDataSourceError && error.kind === 'integrity');
}

function bigEntry(overrides: Partial<IdeaEntry> = {}): IdeaEntry {
  return {
    ideaId: bigA, kind: 'BIG_IDEA', code: 'A', concept: 'Big concept', expression: 'Big expression', developing: false, deleted: false,
    stateSequence: 0, purposes: [], model: 'gpt-5.6-sol', promptLabel: 'Big prompt', createdAt: at, ...overrides,
  } as IdeaEntry;
}

function angleEntry(overrides: Partial<IdeaEntry> = {}): IdeaEntry {
  return {
    ideaId: angleA1, kind: 'ANGLE', parentIdeaId: bigA, code: 'A1', concept: 'Angle concept', name: 'Angle name', developing: false, deleted: false,
    stateSequence: 0, purposes: [], model: 'gpt-5.6-sol', promptLabel: 'Angle prompt', createdAt: at, ...overrides,
  } as IdeaEntry;
}

function ideaList(ideas: readonly IdeaEntry[], purposeTags: readonly PurposeTag[] = [], patch: Partial<IdeaList> = {}): IdeaList {
  return {
    contractVersion: '1.0.0', campaignId, campaignName: 'Synthetic campaign', campaignDeleted: false, insightLocked: true, insightVersion: 1,
    ideas: [...ideas], purposeTags: [...purposeTags], ...patch,
  };
}

function demoBig(ideaId: string, ordinal: number, patch: Partial<DemoIdea> = {}): DemoIdea {
  return {
    ideaId, campaignId, kind: 'BIG_IDEA', ordinal, requestId: `${ideaId}-request`, concept: `Concept ${ordinal}`, expression: `Expression ${ordinal}`,
    model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at, sequence: 0, developing: false, purposes: [], ...patch,
  };
}

function demoAngle(ideaId: string, parentIdeaId: string, ordinal: number, patch: Partial<DemoIdea> = {}): DemoIdea {
  return {
    ideaId, campaignId, kind: 'ANGLE', parentIdeaId, ordinal, requestId: `${ideaId}-request`, concept: `Angle concept ${ordinal}`, name: `Angle ${ordinal}`,
    model: 'gpt-5.6-sol', promptLabel: 'Synthetic prompt', createdAt: at, sequence: 0, developing: false, purposes: [], ...patch,
  };
}

const lockedCampaign: DemoIdeaCampaign = { campaignId, name: 'Synthetic campaign', deleted: false, insightVersion: 1, insight: 'Synthetic locked insight' };

test('loadIdeas enforces the closed response, maps 404 to missing and rejects orphan Angles', async () => {
  const valid = ideaList([bigEntry(), angleEntry()]);
  assert.deepEqual(await loadIdeas(campaignId, fixedFetcher(valid)), valid);
  assert.equal(await loadIdeas(campaignId, fixedFetcher({ error: { code: 'not_found' } }, 404)), null);
  await assertIntegrity(loadIdeas(campaignId, fixedFetcher({ ...valid, extra: true })));
  await assertIntegrity(loadIdeas(campaignId, fixedFetcher({ ...valid, ideas: [{ ...angleEntry(), parentIdeaId: bigB }] })));
  await assertIntegrity(loadIdeas(campaignId, fixedFetcher({ ...valid, ideas: [{ ...bigEntry(), purposes: ['EDUCATION'], expression: 'x' }] })));
  await assertIntegrity(loadIdeas(campaignId, fixedFetcher({ ...valid, purposeTags: [{ tagId, label: 'Bad', displayLike: 'EDUCATION', createdAt: at, extra: true }] })));
});

test('idea run counts, blockers and plans enforce per-prompt, per-run, freestyle and parent limits', () => {
  const systemChoice = { source: 'SYSTEM', id: 'system-big-idea-insight', version: 1 } as const;
  const freestyleChoice = { source: 'FREESTYLE', creativeText: '  Synthetic freestyle  ' } as const;
  const selections: IdeaPromptSelection[] = [
    { key: 'system', label: 'System', choice: systemChoice, count: 2 },
    { key: 'free', label: 'Free', choice: freestyleChoice, count: 3 },
  ];
  assert.equal(contentAiCallCount(selections), 5);
  assert.equal(ideaRunBlocker({ kind: 'BIG_IDEA', selections, insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'BIG_IDEA', selections: [{ ...selections[0]!, count: MAX_CALLS_PER_PROMPT + 1 }], insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.equal(contentAiCallCount(Array.from({ length: 10 }, (_, index) => ({ ...selections[0]!, key: `p${index}`, count: MAX_CALLS_PER_PROMPT }))), MAX_CALLS_PER_RUN);
  assert.equal(ideaRunBlocker({ kind: 'BIG_IDEA', selections: Array.from({ length: 10 }, (_, index) => ({ ...selections[0]!, key: `p${index}`, count: MAX_CALLS_PER_PROMPT })), insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'BIG_IDEA', selections: [...Array.from({ length: 10 }, (_, index) => ({ ...selections[0]!, key: `p${index}`, count: MAX_CALLS_PER_PROMPT })), { ...selections[0]!, key: 'overflow', count: 10 }], insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.equal(ideaRunBlocker({ kind: 'BIG_IDEA', selections: [{ key: 'free', label: 'Free', choice: { source: 'FREESTYLE', creativeText: 'x'.repeat(12000) }, count: 1 }], insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'BIG_IDEA', selections: [{ key: 'free', label: 'Free', choice: { source: 'FREESTYLE', creativeText: 'x'.repeat(12001) }, count: 1 }], insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'ANGLE', selections, insightLocked: true, campaignDeleted: false, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'BIG_IDEA', selections, insightLocked: false, campaignDeleted: false, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'BIG_IDEA', selections, insightLocked: true, campaignDeleted: true, writesAvailable: true }), null);
  assert.notEqual(ideaRunBlocker({ kind: 'BIG_IDEA', selections, insightLocked: true, campaignDeleted: false, writesAvailable: false }), null);
  const plan = ideaRunPlan({ kind: 'ANGLE', parentIdeaId: bigA, model: 'gpt-5.6-sol', selections }, (() => { let n = 0; return () => `request-${++n}`; })());
  assert.deepEqual(plan.map((call) => [call.request.requestId, call.request.plannedCallCount, call.request.prompt]), [
    ['request-1', 5, systemChoice], ['request-2', 5, systemChoice],
    ['request-3', 5, { source: 'FREESTYLE', creativeText: 'Synthetic freestyle' }],
    ['request-4', 5, { source: 'FREESTYLE', creativeText: 'Synthetic freestyle' }],
    ['request-5', 5, { source: 'FREESTYLE', creativeText: 'Synthetic freestyle' }],
  ]);
});

test('purpose labels, display kinds and owner-tag blockers use the same folded label rules', () => {
  const education = PURPOSE_KINDS.find((kind) => kind.key === 'EDUCATION')!;
  const tags: PurposeTag[] = [{ tagId, label: 'Custom audience', displayLike: 'TRUST', createdAt: at }];
  assert.equal(purposeLabel('EDUCATION', tags), education.label);
  assert.equal(purposeKindLabel('EDUCATION'), education.label);
  assert.equal(purposeDisplayKind('EDUCATION', tags), 'EDUCATION');
  assert.equal(purposeLabel(`tag:${tagId}`, tags), 'Custom audience');
  assert.equal(purposeDisplayKind(`tag:${tagId}`, tags), 'TRUST');
  assert.equal(purposeDisplayKind('tag:66666666-6666-4666-8666-0000000000ff', tags), null);
  assert.notEqual(purposeLabel(`tag:66666666-6666-4666-8666-0000000000ff`, tags), '');
  assert.notEqual(purposeTagBlocker('', tags), null);
  assert.notEqual(purposeTagBlocker('x'.repeat(41), tags), null);
  assert.notEqual(purposeTagBlocker(education.label, tags), null);
  assert.notEqual(purposeTagBlocker('custom   audience', tags), null);
  assert.equal(purposeTagBlocker('Fresh custom purpose', tags), null);
});

test('OWNER idea writers accept strict receipts and surface 503 as unavailable', async () => {
  const request: OwnerContentIdeaGenerateRequest = {
    contractVersion: '1.0.0', requestId: campaignId, kind: 'BIG_IDEA', model: 'gpt-5.6-sol', plannedCallCount: 1,
    prompt: { source: 'SYSTEM', id: 'system-big-idea-insight', version: 1 },
  };
  let observed: RequestInit | undefined;
  const receipt = await submitIdeaGenerate({ campaignId, request, token }, (async (_url, init) => {
    observed = init;
    return response({ contractVersion: '1.0.0', ideaId: bigA, campaignId, kind: 'BIG_IDEA', code: 'A', attemptId: bigB, createdAt: at, exactRetry: false }, 201);
  }) as typeof fetch);
  assert.deepEqual(receipt.code, 'A');
  assert.deepEqual(JSON.parse(String(observed?.body)), request);
  await assert.rejects(submitIdeaGenerate({ campaignId, request, token }, fixedFetcher({ contractVersion: '1.0.0', ideaId: bigA, campaignId, kind: 'BIG_IDEA', code: 'A', attemptId: bigB, createdAt: at, exactRetry: false, extra: true }, 201)), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
  await assert.rejects(submitIdeaGenerate({ campaignId, request, token }, fixedFetcher({ error: { code: 'ai_unavailable', message: 'server detail', reason: 'ai_not_configured' } }, 503)), (error: unknown) => error instanceof IdeaAiError && error.unavailable === true && error.reason === 'ai_not_configured');

  const stateReceipt = await submitIdeaState({ ideaId: bigA, expectedSequence: 0, action: 'DELETE', token }, fixedFetcher({ contractVersion: '1.0.0', ideaId: bigA, sequence: 1, action: 'DELETE', createdAt: at, restorableUntil: later, exactRetry: false }, 201));
  assert.equal(stateReceipt.restorableUntil, later);
  await assert.rejects(submitIdeaState({ ideaId: bigA, expectedSequence: 0, action: 'DEVELOP', token }, fixedFetcher({ contractVersion: '1.0.0', ideaId: bigA, sequence: 1, action: 'DEVELOP', createdAt: at, exactRetry: false, extra: true }, 201)), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
  const tagReceipt = await submitPurposeTag({ label: '  Fresh tag  ', displayLike: 'EDUCATION', token }, (async (_url, init) => {
    assert.deepEqual(JSON.parse(String(init?.body)), { contractVersion: '1.0.0', label: 'Fresh tag', displayLike: 'EDUCATION' });
    return response({ contractVersion: '1.0.0', tagId, label: 'Fresh tag', displayLike: 'EDUCATION', createdAt: at, exactRetry: false }, 201);
  }) as typeof fetch);
  assert.equal(tagReceipt.tagId, tagId);
  await assert.rejects(submitPurposeTag({ label: 'Fresh tag', displayLike: 'EDUCATION', token }, fixedFetcher({ contractVersion: '1.0.0', tagId, label: 'Fresh tag', displayLike: 'EDUCATION', createdAt: at, exactRetry: false, extra: true }, 201)), (error: unknown) => error instanceof OwnerWriteError && error.kind === 'integrity');
});

test('demoIdeaList orders by Big Idea and hides expired deletes and orphan Angles', () => {
  const expired: DemoIdea = demoBig('66666666-6666-4666-8666-0000000000e1', 4, { deleted: { deletedAt: '2026-11-01T00:00:00.000Z', restorableUntil: '2026-12-01T00:00:00.000Z' } });
  const restorable: DemoIdea = demoAngle(angleB1, bigB, 1, { deleted: { deletedAt: at, restorableUntil: '2027-01-31T00:00:00.000Z' } });
  const other = demoBig('66666666-6666-4666-8666-0000000000e2', 1, { campaignId: otherCampaignId });
  const list = demoIdeaList([
    demoBig(bigB, 2), restorable, demoAngle(angleA1, bigA, 1), demoBig(bigA, 1), demoAngle('66666666-6666-4666-8666-0000000000e3', '66666666-6666-4666-8666-0000000000ff', 1), expired, other,
  ], [], lockedCampaign, later);
  assert.deepEqual(list.ideas.map((idea) => [idea.code, idea.ideaId, idea.deleted]), [['A', bigA, false], ['A1', angleA1, false], ['B', bigB, false], ['B1', angleB1, true]]);
  assert.deepEqual(list.ideas.find((idea) => idea.ideaId === angleB1)?.restorableUntil, '2027-01-31T00:00:00.000Z');
  assert.equal(list.campaignId, campaignId);
  assert.equal(list.insightVersion, 1);
});

test('demo generator is deterministic, retries request ids exactly and assigns stable Big Idea/Angle codes', () => {
  const call = { selectionKey: 'system', label: 'Synthetic system', request: { contractVersion: '1.0.0', requestId: 'request-1', kind: 'BIG_IDEA', model: 'gpt-5.6-sol', plannedCallCount: 1, prompt: { source: 'SYSTEM', id: 'system-big-idea-insight', version: 1 } } } as const;
  const first = generateDemoIdea([], lockedCampaign, call, at, bigA);
  const same = generateDemoIdea(first.ideas, lockedCampaign, call, later, bigB);
  assert.equal(same.receipt.exactRetry, true);
  assert.equal(same.receipt.ideaId, bigA);
  assert.equal(same.ideas.length, 1);
  const deterministic = generateDemoIdea([], lockedCampaign, { ...call, request: { ...call.request, requestId: 'request-2' } }, at, bigB);
  assert.deepEqual([first.ideas[0]!.concept, first.ideas[0]!.expression], [deterministic.ideas[0]!.concept, deterministic.ideas[0]!.expression]);

  const second = generateDemoIdea(first.ideas, lockedCampaign, { ...call, request: { ...call.request, requestId: 'request-3' } }, at, '66666666-6666-4666-8666-0000000000a3');
  assert.equal(second.receipt.code, 'B');
  const developing = changeDemoIdeaState(second.ideas, { ideaId: bigA, expectedSequence: 0, action: 'DEVELOP' }, at);
  const angleCall = { selectionKey: 'angle', label: 'Synthetic angle', request: { ...call.request, requestId: 'request-4', kind: 'ANGLE' as const, parentIdeaId: bigA, prompt: { source: 'SYSTEM' as const, id: 'system-angle-content', version: 1 } } } as const;
  const angle = generateDemoIdea(developing, lockedCampaign, angleCall, at, angleA1);
  assert.equal(angle.receipt.code, 'A1');
  const deleted = changeDemoIdeaState(angle.ideas, { ideaId: bigA, expectedSequence: 1, action: 'DELETE' }, at);
  const third = generateDemoIdea(deleted, lockedCampaign, { ...call, request: { ...call.request, requestId: 'request-5' } }, at, '66666666-6666-4666-8666-0000000000a4');
  assert.equal(third.receipt.code, 'C');
  assert.deepEqual([letterCode(1), letterCode(26), letterCode(27)], ['A', 'Z', 'AA']);
});

test('demo state changes cover develop, stop, delete, restore, purposes and restore expiry', () => {
  const big = demoBig(bigA, 1);
  const angle = demoAngle(angleA1, bigA, 1);
  const developed = changeDemoIdeaState([big], { ideaId: bigA, expectedSequence: 0, action: 'DEVELOP' }, at);
  const stopped = changeDemoIdeaState(developed, { ideaId: bigA, expectedSequence: 1, action: 'STOP' }, at);
  const deleted = changeDemoIdeaState(stopped, { ideaId: bigA, expectedSequence: 2, action: 'DELETE' }, at);
  const restored = changeDemoIdeaState(deleted, { ideaId: bigA, expectedSequence: 3, action: 'RESTORE' }, later);
  assert.deepEqual([restored[0]!.sequence, restored[0]!.developing, restored[0]!.deleted], [4, false, undefined]);
  const withPurposes = changeDemoIdeaState([angle], { ideaId: angleA1, expectedSequence: 0, action: 'PURPOSES', purposes: ['EDUCATION', `tag:${tagId}`] }, at);
  assert.deepEqual(withPurposes[0]!.purposes, ['EDUCATION', `tag:${tagId}`]);
  assert.throws(() => changeDemoIdeaState([angle], { ideaId: angleA1, expectedSequence: 0, action: 'PURPOSES', purposes: ['EDUCATION', 'ENTERTAINMENT', 'SALES', 'TRUST', 'ENGAGEMENT', `tag:${tagId}`, 'EDUCATION'] }, at), /conflict/);
  assert.throws(() => changeDemoIdeaState([big], { ideaId: bigA, expectedSequence: 0, action: 'PURPOSES', purposes: ['EDUCATION'] }, at), /conflict/);
  assert.throws(() => changeDemoIdeaState(developed, { ideaId: bigA, expectedSequence: 0, action: 'STOP' }, at), /conflict/);
  assert.throws(() => changeDemoIdeaState(deleted, { ideaId: bigA, expectedSequence: 3, action: 'RESTORE' }, '2027-02-02T00:00:00.000Z'), /conflict/);
  assert.equal(MAX_PURPOSES, 6);
});

test('demo purpose tags deduplicate folded labels and preserve the first value', () => {
  const created = createDemoPurposeTag([], '  Custom audience  ', 'TRUST', tagId, at);
  const retry = createDemoPurposeTag(created, 'custom   audience', 'TRUST', '66666666-6666-4666-8666-0000000000d2', later);
  assert.deepEqual(retry, created);
  assert.throws(() => createDemoPurposeTag(created, 'custom audience', 'SALES', '66666666-6666-4666-8666-0000000000d3', later), /conflict/);
});

test('demoPromptList always returns the closed PromptList envelope with DEMO_SYSTEM_PROMPTS', () => {
  const list = demoPromptList([]);
  assert.equal(list.contractVersion, '1.0.0');
  assert.deepEqual(list.systemPrompts, DEMO_SYSTEM_PROMPTS);
  assert.deepEqual(list.prompts, []);
  const user: DemoPrompt = {
    promptId: bigA, promptKey: 'synthetic-prompt', promptType: 'BIG_IDEA', version: 1,
    prompt: { name: 'Synthetic prompt', creativeText: 'Synthetic text', recommendedModel: 'gpt-5.6-sol', tags: [] },
    createdAt: at, history: [{ version: 1, name: 'Synthetic prompt', createdAt: at }], sequence: 0,
  };
  assert.deepEqual(demoPromptList([user]).prompts, [{ promptId: bigA, promptKey: 'synthetic-prompt', promptType: 'BIG_IDEA', version: 1, name: 'Synthetic prompt', recommendedModel: 'gpt-5.6-sol', tags: [], updatedAt: at }]);
});

test('idea helper projections retain only the requested kind and parent', () => {
  const list = ideaList([bigEntry({ ideaId: bigA }), bigEntry({ ideaId: bigB, code: 'B' }), angleEntry({ ideaId: angleA1, parentIdeaId: bigA })]);
  assert.deepEqual(anglesOf(list, bigA).map((idea) => idea.ideaId), [angleA1]);
  assert.deepEqual(developingBigIdeas(ideaList([bigEntry({ developing: true }), bigEntry({ ideaId: bigB, code: 'B', developing: true, deleted: true })])).map((idea) => idea.ideaId), [bigA]);
  assert.deepEqual(IDEA_MODELS.map((model) => model.key), ['gpt-5.6-sol', 'gpt-5.6-luna', 'gemini-3.5-flash-low']);
});
