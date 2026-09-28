import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { ContentAddressedArtifactStore } from '../../src/platform/artifacts/artifact-store.js';
import { createFakeCreativeGateway, type FakeCreativeCall, type FakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import { ContentBrandService } from '../../src/modules/flow/content-brand-service.js';
import { ContentCampaignService } from '../../src/modules/flow/content-campaign-service.js';
import { ContentCatalogService } from '../../src/modules/flow/content-catalog-service.js';
import {
  BIG_IDEA_AGGREGATE_LIMIT,
  ContentIdeaConflictError,
  ContentIdeaIntegrityError,
  ContentIdeaReferenceError,
  ContentIdeaService,
  FREESTYLE_PROMPT_NAME,
  contentIdeaIdFor,
  letterCode,
  purposeLabelKey,
} from '../../src/modules/flow/content-idea-service.js';
import { ContentInsightService } from '../../src/modules/flow/content-insight-service.js';
import { ContentPromptLibrary } from '../../src/modules/flow/content-prompt-library.js';
import { ContentPromptService } from '../../src/modules/flow/content-prompt-service.js';
import { createContentAiAttemptService } from '../../src/modules/flow/content-ai-attempt-service.js';
import { FlowValidationError } from '../../src/modules/flow/validation.js';
import { openDatabase } from '../../src/platform/db/database.js';

const id = (number: number): string => `a0500000-0000-4000-8000-${number.toString(16).padStart(12, '0')}`;
const brandId = id(1);
const itemId = id(2);
const campaignId = id(3);
const otherCampaignId = id(4);
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

const catalogItem = {
  itemType: 'SERVICE', name: 'Synthetic service', description: 'Synthetic catalog fixture.',
  tiers: [{ tierKey: 'base', name: 'Base', priceText: '100', inclusions: ['Synthetic support'] }], photos: [],
};

const campaignContent = (name: string) => ({
  name, objective: 'Synthetic objective', items: [{ itemId, itemVersion: 1 }],
});

const insight = {
  customer: 'Synthetic customer', painPoint: 'Synthetic pain point', insight: 'Synthetic locked insight.', source: { kind: 'TYPED' },
};

type SetupOptions = {
  readonly outputs?: readonly Record<string, string>[];
  readonly gateway?: FakeCreativeGateway;
  readonly lockInsight?: boolean;
  readonly now?: string;
};

async function setup(options: SetupOptions = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tdn-content-idea-')); roots.push(root);
  const opened = openDatabase({ databasePath: path.join(root, 'db.sqlite') });
  const artifacts = new ContentAddressedArtifactStore(path.join(root, 'artifacts'));
  const clock = { value: new Date(options.now ?? at) };
  const now = () => new Date(clock.value.getTime());
  const brands = new ContentBrandService({ db: opened.db, artifactStore: artifacts, uuid: () => brandId, now });
  const catalog = new ContentCatalogService({ db: opened.db, artifactStore: artifacts, uuid: () => itemId, now });
  const campaignIds = [campaignId, otherCampaignId];
  const campaigns = new ContentCampaignService({ db: opened.db, artifactStore: artifacts, catalog, uuid: () => campaignIds.shift()!, now });
  await brands.createBrand({ contractVersion: '1.0.0', brandKey: 'synthetic-brand', profile: { brandName: 'Synthetic brand' }, displayRules });
  await catalog.createItem({ contractVersion: '1.0.0', brandId, itemKey: 'synthetic-service', item: catalogItem });
  await campaigns.createCampaign({ contractVersion: '1.0.0', campaignKey: 'synthetic-campaign', brandId, campaign: campaignContent('Synthetic campaign') });
  const insights = new ContentInsightService({ db: opened.db, artifactStore: artifacts, campaigns, now });
  await insights.reviseInsight({ contractVersion: '1.0.0', campaignId, expectedVersion: 0, insight });
  if (options.lockInsight !== false) await insights.lockInsight({ contractVersion: '1.0.0', campaignId, insightVersion: 1, campaignVersion: 1 });

  const library = new ContentPromptLibrary();
  const promptIds = Array.from({ length: 10 }, (_, index) => id(300 + index));
  const prompts = new ContentPromptService({ db: opened.db, artifactStore: artifacts, library, uuid: () => promptIds.shift()!, now });
  const gateway: FakeCreativeGateway = options.gateway ?? createFakeCreativeGateway({
    text: (options.outputs ?? []).map((output) => ({ result: { text: JSON.stringify(output), latencyMs: 1 } })),
  });
  const attemptIds = Array.from({ length: 100 }, (_, index) => id(1000 + index));
  const attempts = createContentAiAttemptService({ db: opened.db, gateway, artifactRoot: path.join(root, 'artifacts'), clock: now, newId: () => attemptIds.shift()! });
  const purposeTagIds = Array.from({ length: 100 }, (_, index) => id(2000 + index));
  const ideas = new ContentIdeaService({
    db: opened.db, artifactStore: artifacts, attempts, campaigns, insights, catalog, prompts, library, now,
    newId: () => purposeTagIds.shift()!,
  });
  return { ...opened, root, artifacts, clock, now, brands, catalog, campaigns, insights, prompts, library, gateway, attempts, ideas };
}

async function addLockedCampaign(state: Awaited<ReturnType<typeof setup>>) {
  await state.campaigns.createCampaign({ contractVersion: '1.0.0', campaignKey: 'synthetic-campaign-two', brandId, campaign: campaignContent('Synthetic campaign two') });
  await state.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: otherCampaignId, expectedVersion: 0, insight: { ...insight, insight: 'Other campaign insight.' } });
  await state.insights.lockInsight({ contractVersion: '1.0.0', campaignId: otherCampaignId, insightVersion: 1, campaignVersion: 1 });
}

function bigRequest(requestId: string, patch: Record<string, unknown> = {}) {
  return {
    contractVersion: '1.0.0', campaignId, requestId, kind: 'BIG_IDEA', model: 'gpt-5.6-sol', plannedCallCount: 1,
    prompt: { source: 'SYSTEM', id: 'system-big-idea-insight', version: 1 }, ...patch,
  };
}

function angleRequest(requestId: string, parentIdeaId: string, patch: Record<string, unknown> = {}) {
  return {
    contractVersion: '1.0.0', campaignId, requestId, kind: 'ANGLE', parentIdeaId, model: 'gpt-5.6-sol', plannedCallCount: 1,
    prompt: { source: 'SYSTEM', id: 'system-angle-content', version: 1 }, ...patch,
  };
}

function count(db: ReturnType<typeof openDatabase>['db'], table: string): number {
  return Number((db.prepare(`SELECT count(*) n FROM ${table}`).get() as { n: bigint | number }).n);
}

const bigOutput = (suffix: string) => ({ concept: `Synthetic concept ${suffix}`, expression: `Synthetic expression ${suffix}` });
const angleOutput = (suffix: string) => ({ name: `Synthetic angle ${suffix}`, concept: `Synthetic angle concept ${suffix}` });

test('Big Idea generation stores a verified artifact and succeeded text attempt, with exact request retry', async () => {
  const state = await setup({ outputs: [bigOutput('one')] });
  const input = bigRequest(id(10));
  const first = await state.ideas.generate(input, 'owner:050b');
  assert.equal(first.ideaId, contentIdeaIdFor(input.requestId));
  assert.deepEqual([first.kind, first.code, first.deduplicated], ['BIG_IDEA', 'A', false]);
  const retry = await state.ideas.generate(input, 'owner:050b');
  assert.deepEqual([retry.ideaId, retry.attemptId, retry.code, retry.deduplicated], [first.ideaId, first.attemptId, 'A', true]);
  assert.equal(state.gateway.calls.filter((call) => call.operation === 'generateText').length, 1);
  assert.equal(count(state.db, 'flow_content_ideas'), 1);
  assert.equal(count(state.db, 'flow_content_ai_attempts'), 1);
  const artifact = await state.ideas.readIdea(first.ideaId);
  assert.deepEqual([artifact.kind, artifact.insightVersion, artifact.output], ['BIG_IDEA', 1, bigOutput('one')]);
  const attempt = state.attempts.list({ targetId: first.ideaId, limit: 10 })[0];
  assert.ok(attempt);
  assert.deepEqual([attempt.targetType, attempt.modality, attempt.state, attempt.outputSha256 !== null], ['content_big_idea', 'text', 'succeeded', true]);
  assert.match((state.gateway.calls.find((call) => call.operation === 'generateText') as { request: { userInput: string } }).request.userInput, /LOCKED_INPUT_JSON/);
  state.db.close();
});

test('exact retry fails closed when the stored original AI output bytes are tampered with', async () => {
  const state = await setup({ outputs: [bigOutput('one')] });
  const input = bigRequest(id(11));
  const first = await state.ideas.generate(input, 'owner:050b');
  const artifact = await state.ideas.readIdea(first.ideaId);
  fs.writeFileSync(state.artifacts.pathForDigest(artifact.outputSha256), Buffer.from(JSON.stringify(bigOutput('tampered')), 'utf8'));

  await assert.rejects(state.ideas.generate(input, 'owner:050b'), ContentIdeaIntegrityError);
  assert.equal(state.gateway.calls.filter((call) => call.operation === 'generateText').length, 1);
  assert.equal(count(state.db, 'flow_content_ideas'), 1);
  state.db.close();
});

test('contentIdeaIdFor is deterministic, UUID v8/variant-valid, and request-scoped', () => {
  const first = contentIdeaIdFor(id(12));
  const same = contentIdeaIdFor(id(12));
  const other = contentIdeaIdFor(id(13));
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  assert.equal(same, first);
  assert.notEqual(other, first);
});

test('a durable running generation conflicts across service instances, then restart recovery chains an interrupted retry', async () => {
  type TextResult = Awaited<ReturnType<FakeCreativeGateway['generateText']>>;
  let release: ((result: TextResult) => void) | undefined;
  let markStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const calls: FakeCreativeCall[] = [];
  const hangingGateway: FakeCreativeGateway = {
    configured: true,
    calls,
    generateText(request) {
      calls.push({ operation: 'generateText', request });
      return new Promise<TextResult>((resolve) => {
        release = resolve;
        markStarted!();
      });
    },
    generateImage: async () => { throw new Error('unused image call'); },
    listModels: async () => [],
  };
  const state = await setup({ gateway: hangingGateway });
  const input = bigRequest(id(14));
  const running = state.ideas.generate(input, 'owner:050b');
  const staleResult = { text: JSON.stringify(bigOutput('stale process')), latencyMs: 1 };
  try {
    await started;
    const targetId = contentIdeaIdFor(input.requestId);
    const runningAttempt = state.attempts.list({ targetId, limit: 10 })[0];
    assert.ok(runningAttempt);
    assert.equal(runningAttempt.state, 'running');

    const secondGateway = createFakeCreativeGateway({ text: [{ result: { text: JSON.stringify(bigOutput('recovered')), latencyMs: 1 } }] });
    const secondAttemptIds = [id(9000)];
    const secondAttempts = createContentAiAttemptService({
      db: state.db, gateway: secondGateway, artifactRoot: path.join(state.root, 'artifacts'), clock: state.now,
      newId: () => secondAttemptIds.shift()!,
    });
    const restartedIdeas = new ContentIdeaService({
      db: state.db, artifactStore: state.artifacts, attempts: secondAttempts, campaigns: state.campaigns, insights: state.insights,
      catalog: state.catalog, prompts: state.prompts, library: state.library, now: state.now,
    });
    await assert.rejects(restartedIdeas.generate(input, 'owner:050b'), ContentIdeaConflictError);
    assert.equal(secondGateway.calls.filter((call) => call.operation === 'generateText').length, 0);

    assert.equal(state.attempts.sweepInterrupted(new Date('2027-01-01T00:00:01.000Z')), 1);
    assert.equal(state.attempts.list({ targetId, limit: 10 }).find((attempt) => attempt.attemptId === runningAttempt.attemptId)?.state, 'interrupted');
    const recovered = await restartedIdeas.generate(input, 'owner:050b');
    const attempts = state.attempts.list({ targetId, limit: 10 });
    const retry = attempts.find((attempt) => attempt.attemptId === id(9000));
    assert.ok(retry);
    assert.deepEqual([recovered.ideaId, recovered.deduplicated, retry.retryOf, count(state.db, 'flow_content_ideas')], [targetId, false, runningAttempt.attemptId, 1]);
    assert.equal(secondGateway.calls.filter((call) => call.operation === 'generateText').length, 1);

    release!(staleResult);
    await assert.rejects(running);
  } finally {
    release?.(staleResult);
    await running.catch(() => undefined);
    state.db.close();
  }
});

test('failed generations retry under the same request id as one retryOf chain', async () => {
  const state = await setup({ outputs: [{ concept: 'bad' }, { concept: 'bad again' }, bigOutput('recovered')] });
  const input = bigRequest(id(15));
  await assert.rejects(state.ideas.generate(input, 'owner:050b'));
  await assert.rejects(state.ideas.generate(input, 'owner:050b'));
  const recovered = await state.ideas.generate(input, 'owner:050b');
  const attempts = state.attempts.list({ targetId: recovered.ideaId, limit: 10 });
  const first = attempts.find((attempt) => attempt.attemptId === id(1000));
  const second = attempts.find((attempt) => attempt.attemptId === id(1001));
  const third = attempts.find((attempt) => attempt.attemptId === id(1002));
  assert.ok(first && second && third);
  assert.deepEqual([first.state, second.state, third.state, second.retryOf, third.retryOf, count(state.db, 'flow_content_ideas')], [
    'failed', 'failed', 'succeeded', first.attemptId, second.attemptId, 1,
  ]);
  assert.equal(state.gateway.calls.filter((call) => call.operation === 'generateText').length, 3);
  state.db.close();
});

test('a changed input after a failed attempt conflicts without a second AI call', async () => {
  const state = await setup({ outputs: [{ concept: 'bad' }, bigOutput('unused retry')] });
  const requestId = id(16);
  await assert.rejects(state.ideas.generate(bigRequest(requestId), 'owner:050b'));
  await assert.rejects(state.ideas.generate(bigRequest(requestId, { model: 'gpt-5.6-luna' }), 'owner:050b'), ContentIdeaConflictError);
  assert.equal(state.gateway.calls.filter((call) => call.operation === 'generateText').length, 1);
  assert.equal(count(state.db, 'flow_content_ideas'), 0);
  assert.equal(state.attempts.list({ targetId: contentIdeaIdFor(requestId), limit: 10 }).length, 1);
  state.db.close();
});

test('generation requires a live campaign and locked Insight, and Angle parents are referenced and developing', async () => {
  const unlocked = await setup({ lockInsight: false, outputs: [bigOutput('unused')] });
  await assert.rejects(unlocked.ideas.generate(bigRequest(id(20)), 'owner:050b'), ContentIdeaConflictError);
  assert.equal(unlocked.gateway.calls.length, 0);
  assert.equal(count(unlocked.db, 'flow_content_ideas'), 0);
  unlocked.db.close();

  const deleted = await setup({ outputs: [bigOutput('unused')] });
  await deleted.campaigns.changeLifecycle({ contractVersion: '1.0.0', campaignId, action: 'DELETE', expectedSequence: 0 });
  await assert.rejects(deleted.ideas.generate(bigRequest(id(21)), 'owner:050b'), ContentIdeaConflictError);
  assert.equal(deleted.gateway.calls.length, 0);
  deleted.db.close();

  const parents = await setup({ outputs: [bigOutput('other'), bigOutput('parent')] });
  await addLockedCampaign(parents);
  const other = await parents.ideas.generate({ ...bigRequest(id(22)), campaignId: otherCampaignId }, 'owner:050b');
  await assert.rejects(parents.ideas.generate(angleRequest(id(23), other.ideaId), 'owner:050b'), ContentIdeaReferenceError);
  await assert.rejects(parents.ideas.generate(angleRequest(id(24), id(99999)), 'owner:050b'), ContentIdeaReferenceError);
  const parent = await parents.ideas.generate(bigRequest(id(25)), 'owner:050b');
  await assert.rejects(parents.ideas.generate(angleRequest(id(26), parent.ideaId), 'owner:050b'), ContentIdeaConflictError);
  await parents.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  await parents.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 1, action: 'DELETE' });
  await assert.rejects(parents.ideas.generate(angleRequest(id(27), parent.ideaId), 'owner:050b'), ContentIdeaConflictError);
  parents.db.close();
});

test('locked input carries earlier ideas of the same layer and parent, while codes remain stable after deletion', async () => {
  const state = await setup({ outputs: [bigOutput('one'), bigOutput('two'), angleOutput('one'), angleOutput('two'), bigOutput('three')] });
  const first = await state.ideas.generate(bigRequest(id(30)), 'owner:050b');
  await state.ideas.generate(bigRequest(id(31)), 'owner:050b');
  const secondCall = state.gateway.calls.filter((call) => call.operation === 'generateText')[1] as { request: { userInput: string } };
  assert.match(secondCall.request.userInput, /previous_big_ideas/);
  assert.match(secondCall.request.userInput, /Synthetic concept one/);
  await state.ideas.changeState({ contractVersion: '1.0.0', ideaId: first.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  const angleOne = await state.ideas.generate(angleRequest(id(32), first.ideaId), 'owner:050b');
  const angleTwo = await state.ideas.generate(angleRequest(id(33), first.ideaId), 'owner:050b');
  assert.deepEqual([angleOne.code, angleTwo.code], ['A1', 'A2']);
  const angleCall = state.gateway.calls.filter((call) => call.operation === 'generateText')[3] as { request: { userInput: string } };
  assert.match(angleCall.request.userInput, /previous_angles/);
  assert.match(angleCall.request.userInput, /Synthetic angle one/);
  assert.deepEqual([letterCode(1), letterCode(26), letterCode(27)], ['A', 'Z', 'AA']);
  await state.ideas.changeState({ contractVersion: '1.0.0', ideaId: first.ideaId, expectedSequence: 1, action: 'DELETE' });
  const third = await state.ideas.generate(bigRequest(id(34)), 'owner:050b');
  assert.equal(third.code, 'C');
  state.db.close();
});

test('system, owner-library and freestyle prompts retain their source labels', async () => {
  const state = await setup({ outputs: [bigOutput('system'), bigOutput('owner'), bigOutput('free')] });
  const ownerPrompt = await state.prompts.createPrompt({
    contractVersion: '1.0.0', promptKey: 'synthetic-owner-big', promptType: 'BIG_IDEA',
    prompt: {
      name: 'Synthetic owner prompt', description: 'Synthetic prompt description', creativeText: 'Synthetic owner instructions.',
      recommendedModel: 'gpt-5.6-sol', tags: ['synthetic'], demoInput: 'Synthetic input', demoOutput: 'Synthetic output',
    },
  });
  await state.ideas.generate(bigRequest(id(40)), 'owner:050b');
  await state.ideas.generate(bigRequest(id(41), { prompt: { source: 'USER', promptId: ownerPrompt.promptId, version: 1 } }), 'owner:050b');
  await state.ideas.generate(bigRequest(id(42), { prompt: { source: 'FREESTYLE', creativeText: 'Synthetic freestyle instructions.' } }), 'owner:050b');
  const listed = await state.ideas.listCampaignIdeas(campaignId);
  assert.deepEqual(listed.map((entry) => entry.promptLabel), [
    state.library.find('system-big-idea-insight', 1)!.name,
    'Synthetic owner prompt',
    FREESTYLE_PROMPT_NAME,
  ]);
  const attempts = state.attempts.list({ targetType: 'content_big_idea', limit: 10 });
  assert.equal(attempts.filter((attempt) => attempt.promptRef.startsWith('user:')).length, 1);
  assert.equal(attempts.filter((attempt) => attempt.promptRef.startsWith('freestyle:')).length, 1);
  state.db.close();
});

test('state transitions are append-only, sequence-pinned and enforce every action conflict', async () => {
  const state = await setup({ outputs: [bigOutput('state'), bigOutput('expired')] });
  const idea = await state.ideas.generate(bigRequest(id(50)), 'owner:050b');
  const develop = { contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 0, action: 'DEVELOP' } as const;
  assert.equal((state.ideas.changeState(develop)).deduplicated, false);
  assert.equal(state.ideas.changeState(develop).deduplicated, true);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 1, action: 'DEVELOP' }), ContentIdeaConflictError);
  assert.throws(() => state.ideas.changeState({ ...develop, action: 'STOP' }), ContentIdeaConflictError);
  const stop = { contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 1, action: 'STOP' } as const;
  assert.equal(state.ideas.changeState(stop).sequence, 2);
  assert.equal(state.ideas.changeState(stop).deduplicated, true);
  assert.throws(() => state.ideas.changeState({ ...stop, expectedSequence: 2 }), ContentIdeaConflictError);
  const deleted = state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 2, action: 'DELETE' });
  assert.equal(deleted.sequence, 3);
  assert.equal(state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 2, action: 'DELETE' }).deduplicated, true);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 3, action: 'DELETE' }), ContentIdeaConflictError);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 3, action: 'DEVELOP' }), ContentIdeaConflictError);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 3, action: 'STOP' }), ContentIdeaConflictError);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 3, action: 'PURPOSES', purposes: ['EDUCATION'] }), ContentIdeaReferenceError);
  assert.equal(state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 3, action: 'RESTORE' }).sequence, 4);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 4, action: 'RESTORE' }), ContentIdeaConflictError);
  state.clock.value = new Date(Date.parse(at) - 1);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: idea.ideaId, expectedSequence: 4, action: 'DELETE' }), ContentIdeaConflictError);
  state.clock.value = new Date(at);

  const expired = await state.ideas.generate(bigRequest(id(51)), 'owner:050b');
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: expired.ideaId, expectedSequence: 0, action: 'DELETE' });
  state.clock.value = new Date(Date.parse(at) + 31 * 86_400_000);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: expired.ideaId, expectedSequence: 1, action: 'RESTORE' }), ContentIdeaConflictError);
  await state.campaigns.changeLifecycle({ contractVersion: '1.0.0', campaignId, action: 'DELETE', expectedSequence: 0 });
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: expired.ideaId, expectedSequence: 1, action: 'RESTORE' }), ContentIdeaConflictError);
  state.db.close();
});

test('Angle purposes accept built-ins and existing owner tags, with six-item and lifecycle guards', async () => {
  const state = await setup({ outputs: [bigOutput('purpose-parent'), angleOutput('purpose')] });
  const parent = await state.ideas.generate(bigRequest(id(60)), 'owner:050b');
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  const angle = await state.ideas.generate(angleRequest(id(61), parent.ideaId), 'owner:050b');
  const tag = state.ideas.createPurposeTag({ contractVersion: '1.0.0', label: 'Custom purpose', displayLike: 'EDUCATION' });
  const folded = state.ideas.createPurposeTag({ contractVersion: '1.0.0', label: 'custom   purpose', displayLike: 'EDUCATION' });
  assert.deepEqual([folded.tagId, folded.deduplicated, purposeLabelKey('  CUSTom   PURPOSE  ')], [tag.tagId, true, 'custom purpose']);
  assert.equal(state.ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 0, action: 'PURPOSES', purposes: ['EDUCATION', `tag:${tag.tagId}`] }).sequence, 1);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 1, action: 'PURPOSES', purposes: [`tag:${id(99999)}`] }), ContentIdeaReferenceError);
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 1, action: 'PURPOSES', purposes: ['EDUCATION', 'ENTERTAINMENT', 'SALES', 'TRUST', 'ENGAGEMENT', `tag:${tag.tagId}`, 'EDUCATION'] }), FlowValidationError);
  assert.throws(() => state.ideas.createPurposeTag({ contractVersion: '1.0.0', label: 'Custom purpose', displayLike: 'SALES' }), ContentIdeaConflictError);
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 1, action: 'DELETE' });
  assert.throws(() => state.ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 2, action: 'PURPOSES', purposes: ['TRUST'] }), ContentIdeaConflictError);
  state.db.close();
});

test('listCampaignIdeas orders Big Ideas before their Angles and exposes state, prompt and purpose fields', async () => {
  const state = await setup({ outputs: [bigOutput('one'), angleOutput('one'), bigOutput('two')] });
  const first = await state.ideas.generate(bigRequest(id(70)), 'owner:050b');
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: first.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  const angle = await state.ideas.generate(angleRequest(id(71), first.ideaId), 'owner:050b');
  const second = await state.ideas.generate(bigRequest(id(72)), 'owner:050b');
  const deleted = state.ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 0, action: 'DELETE' });
  const listed = await state.ideas.listCampaignIdeas(campaignId);
  assert.deepEqual(listed.map((entry) => [entry.code, entry.kind, entry.ideaId]), [['A', 'BIG_IDEA', first.ideaId], ['A1', 'ANGLE', angle.ideaId], ['B', 'BIG_IDEA', second.ideaId]]);
  assert.deepEqual(listed[1], {
    ideaId: angle.ideaId, kind: 'ANGLE', parentIdeaId: first.ideaId, code: 'A1', concept: 'Synthetic angle concept one', name: 'Synthetic angle one',
    developing: false, deleted: true, restorableUntil: deleted.restorableUntil, stateSequence: 1, purposes: [], model: 'gpt-5.6-sol',
    promptLabel: state.library.find('system-angle-content', 1)!.name, createdAt: at,
  });
  state.db.close();
});

test('Q6 derives Big Idea deletion over Angles without cascade rows, blocks Angle writes, and expires the whole subtree', async () => {
  const state = await setup({ outputs: [bigOutput('parent'), angleOutput('own'), angleOutput('live')] });
  const parent = await state.ideas.generate(bigRequest(id(17)), 'owner:050b');
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  const own = await state.ideas.generate(angleRequest(id(18), parent.ideaId), 'owner:050b');
  const live = await state.ideas.generate(angleRequest(id(19), parent.ideaId), 'owner:050b');

  state.clock.value = new Date('2027-01-02T00:00:00.000Z');
  const ownDeleted = state.ideas.changeState({ contractVersion: '1.0.0', ideaId: own.ideaId, expectedSequence: 0, action: 'DELETE' });
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: live.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: live.ideaId, expectedSequence: 1, action: 'PURPOSES', purposes: ['EDUCATION'] });
  const angleStateCountsBefore = [own, live].map((idea) => Number((state.db.prepare('SELECT count(*) n FROM flow_content_idea_states WHERE idea_id = ?').get(idea.ideaId) as { n: bigint | number }).n));

  state.clock.value = new Date('2027-01-03T00:00:00.000Z');
  const parentDeleted = state.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 1, action: 'DELETE' });
  const hidden = await state.ideas.listCampaignIdeas(campaignId);
  const parentEntry = hidden.find((entry) => entry.ideaId === parent.ideaId)!;
  const ownHidden = hidden.find((entry) => entry.ideaId === own.ideaId)!;
  const liveHidden = hidden.find((entry) => entry.ideaId === live.ideaId)!;
  assert.deepEqual([parentEntry.deleted, parentEntry.developing, parentEntry.hiddenByParent, parentEntry.restorableUntil], [true, false, undefined, parentDeleted.restorableUntil]);
  assert.deepEqual([ownHidden.deleted, ownHidden.developing, ownHidden.hiddenByParent, ownHidden.restorableUntil], [true, false, true, ownDeleted.restorableUntil]);
  assert.deepEqual([liveHidden.deleted, liveHidden.developing, liveHidden.hiddenByParent, liveHidden.restorableUntil], [true, false, true, parentDeleted.restorableUntil]);
  assert.deepEqual([ownHidden.restorableUntil, liveHidden.restorableUntil], ['2027-02-01T00:00:00.000Z', '2027-02-02T00:00:00.000Z']);
  assert.deepEqual(
    [own, live].map((idea) => Number((state.db.prepare('SELECT count(*) n FROM flow_content_idea_states WHERE idea_id = ?').get(idea.ideaId) as { n: bigint | number }).n)),
    angleStateCountsBefore,
  );

  for (const action of ['DELETE', 'RESTORE', 'PURPOSES'] as const) {
    assert.throws(() => state.ideas.changeState({
      contractVersion: '1.0.0', ideaId: live.ideaId, expectedSequence: 2, action,
      ...(action === 'PURPOSES' ? { purposes: ['TRUST'] } : {}),
    }), ContentIdeaConflictError);
  }
  const callsBeforeRejectedAngle = state.gateway.calls.filter((call) => call.operation === 'generateText').length;
  await assert.rejects(state.ideas.generate(angleRequest(id(20), parent.ideaId), 'owner:050b'), ContentIdeaConflictError);
  assert.equal(state.gateway.calls.filter((call) => call.operation === 'generateText').length, callsBeforeRejectedAngle);

  state.clock.value = new Date('2027-01-04T00:00:00.000Z');
  state.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 2, action: 'RESTORE' });
  const restored = await state.ideas.listCampaignIdeas(campaignId);
  const ownRestored = restored.find((entry) => entry.ideaId === own.ideaId)!;
  const liveRestored = restored.find((entry) => entry.ideaId === live.ideaId)!;
  assert.deepEqual([ownRestored.deleted, ownRestored.developing, 'hiddenByParent' in ownRestored, ownRestored.restorableUntil], [true, false, false, ownDeleted.restorableUntil]);
  assert.deepEqual([liveRestored.deleted, liveRestored.developing, liveRestored.purposes, 'hiddenByParent' in liveRestored], [false, true, ['EDUCATION'], false]);

  state.clock.value = new Date('2027-02-01T00:00:00.001Z');
  const afterOwnExpiry = await state.ideas.listCampaignIdeas(campaignId);
  assert.deepEqual(afterOwnExpiry.map((entry) => entry.ideaId), [parent.ideaId, live.ideaId]);

  const parentDeletedAgain = state.ideas.changeState({ contractVersion: '1.0.0', ideaId: parent.ideaId, expectedSequence: 3, action: 'DELETE' });
  state.clock.value = new Date(Date.parse(parentDeletedAgain.restorableUntil!) + 1);
  assert.deepEqual(await state.ideas.listCampaignIdeas(campaignId), []);
  state.db.close();
});

test('aggregate-over-limit output leaves no idea row and closes the audited attempt as failed', async () => {
  const concept = '\u0000'.repeat(780);
  const state = await setup({ outputs: [{ concept, expression: 'x' }] });
  assert.ok(BIG_IDEA_AGGREGATE_LIMIT < JSON.stringify({ concept, expression: 'x' }).length);
  await assert.rejects(state.ideas.generate(bigRequest(id(80)), 'owner:050b'));
  assert.equal(count(state.db, 'flow_content_ideas'), 0);
  const attempt = state.attempts.list({ targetType: 'content_big_idea', limit: 10 })[0];
  assert.ok(attempt);
  assert.equal(attempt.state, 'failed');
  assert.equal(attempt.outputSha256 !== null, true);
  state.db.close();
});
