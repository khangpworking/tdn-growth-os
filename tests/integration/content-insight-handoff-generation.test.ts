import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import test from 'node:test';
import baseline from '../fixtures/content-insight-handoff-prompt-baseline.json' with { type: 'json' };
import { cihFixture, handoff, expectedInsight, lockRequest, inventory, typed, at } from '../helpers/content-insight-handoff-fixture.js';
import { locked, lockId, workspaceId } from '../helpers/content-insight-handoff-b10.js';
import { ContentInsightService, ContentInsightGateError, INSIGHT_GATE_NOT_APPROVED, INSIGHT_GATE_UNAVAILABLE, type ContentInsightB10Reader } from '../../src/modules/flow/content-insight-service.js';
import { GovernanceProductB10Reader, ProductB10DecisionService, PRODUCT_B10_REVIEW_CAPABILITY } from '../../src/modules/governance/index.js';
import { createFakeCreativeGateway } from '../../src/platform/ai/fake-creative-gateway.js';
import { createContentAiAttemptService } from '../../src/modules/flow/content-ai-attempt-service.js';
import { ContentIdeaService } from '../../src/modules/flow/content-idea-service.js';
import { ContentPromptLibrary } from '../../src/modules/flow/content-prompt-library.js';
import { ContentPackageService } from '../../src/modules/flow/content-package-service.js';
import { ContentMediaService } from '../../src/modules/flow/content-media-service.js';
import { fixtureDisplayRules } from '../helpers/content-package-fixture.js';
import { ContentPromptService } from '../../src/modules/flow/content-prompt-service.js';
import { canonicalBytes } from '../../src/modules/flow/content-artifacts.js';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

test('CIH-Q26 report approval cannot substitute for real B10 product clearance', async t => {
  const f = await cihFixture(t), s = await f.approved();
  const b10 = new ProductB10DecisionService({ db: f.db, artifactStore: f.artifacts, lockedStpReader: { async readVerifiedLockedStp() { return locked(); } } });
  const reader = new GovernanceProductB10Reader(b10);
  const actor = { actorId: 'owner:synthetic', roleSnapshot: 'OWNER', capabilities: new Set([PRODUCT_B10_REVIEW_CAPABILITY]) };
  const makeInsights = (b10Reader?: ContentInsightB10Reader) => new ContentInsightService({ db: f.db, artifactStore: f.artifacts, campaigns: f.campaigns, reportStatements: f.query, ...(b10Reader ? { b10Reader } : {}) });
  let predecessor: string | null = null;
  for (const decision of [null, 'HOLD', 'REJECT', 'APPROVE'] as const) {
    const c = await f.createCampaign(undefined, { researchProductWorkspaceId: workspaceId });
    const insights = makeInsights(reader); await insights.receiveReport(c.campaignId, handoff(s)); assert.equal(insights.isLocked(c.campaignId), false);
    if (decision) { const receipt = await b10.decide({ contractVersion: '1.0.0', lockedStpId: lockId, previousDecisionId: predecessor, decision }, actor); predecessor = receipt.decisionId; }
    if (decision !== 'APPROVE') { await assert.rejects(insights.lockInsight(lockRequest(c.campaignId)), (error: unknown) => error instanceof ContentInsightGateError && error.reason === INSIGHT_GATE_NOT_APPROVED); assert.equal(insights.isLocked(c.campaignId), false); }
    else {
      await insights.lockInsight(lockRequest(c.campaignId));
      assert.deepEqual((await insights.readLock(c.campaignId))!.b10, { productWorkspaceId: workspaceId, lockedStpId: lockId, effectiveDecisionId: predecessor, effectiveDecisionNumber: 3, effectiveDecision: 'APPROVE' });
    }
  }
  for (const [b10Reader, reason] of [[{ readStatusByProductWorkspace: async () => reader.readStatusByProductWorkspace(workspaceId), readStatusByLockedStp: reader.readStatusByLockedStp.bind(reader), readVerifiedDecision: reader.readVerifiedDecision.bind(reader) }, INSIGHT_GATE_NOT_APPROVED], [undefined, INSIGHT_GATE_UNAVAILABLE], [{ readStatusByProductWorkspace: async () => { throw new Error('Synthetic unavailable'); }, readStatusByLockedStp: reader.readStatusByLockedStp.bind(reader), readVerifiedDecision: reader.readVerifiedDecision.bind(reader) }, INSIGHT_GATE_UNAVAILABLE]] as const) {
    const c = await f.createCampaign(undefined, { researchProductWorkspaceId: b10Reader && reason === INSIGHT_GATE_NOT_APPROVED ? randomUUID() : workspaceId });
    const insights = makeInsights(b10Reader); await insights.receiveReport(c.campaignId, handoff(s));
    await assert.rejects(insights.lockInsight(lockRequest(c.campaignId)), (error: unknown) => error instanceof ContentInsightGateError && error.reason === reason);
    assert.equal(insights.isLocked(c.campaignId), false);
  }
});

test('CIH-Q23 / R-C07 locked report snapshot reaches actual fake-gateway Big Idea/Angle inputs with unchanged prompt bytes', async t => {
  const f = await cihFixture(t), s = await f.approved(), c = await f.createCampaign();
  const gateway = createFakeCreativeGateway({ text: Array.from({ length: 7 }, (_, i) => ({ result: { text: JSON.stringify(i === 2 ? { post: 'Synthetic retained caption stays unchanged.' } : i === 1 ? { name: 'Synthetic angle', concept: 'Synthetic angle concept' } : { concept: `Synthetic concept ${i}`, expression: `Synthetic expression ${i}` }), latencyMs: 1 } })) });
  const library = new ContentPromptLibrary(), prompts = new ContentPromptService({ db: f.db, artifactStore: f.artifacts, library });
  const attempts = createContentAiAttemptService({ db: f.db, gateway, artifactRoot: f.artifactRoot, clock: () => new Date(at), newId: randomUUID });
  const ideas = new ContentIdeaService({ db: f.db, artifactStore: f.artifacts, attempts, campaigns: f.campaigns, insights: f.insights, catalog: f.catalog, prompts, library });
  const big = (campaignId = c.campaignId, prompt: unknown = { source: 'SYSTEM', id: 'system-big-idea-insight', version: 1 }) => ({ contractVersion: '1.0.0', campaignId, requestId: randomUUID(), kind: 'BIG_IDEA', model: 'gpt-5.6-sol', plannedCallCount: 1, prompt });
  await f.insights.receiveReport(c.campaignId, handoff(s)); assert.equal(gateway.calls.length, 0);
  await assert.rejects(ideas.generate(big(), 'owner:synthetic'), /Insight must be locked/); assert.equal(gateway.calls.length, 0);
  const edit = { ...expectedInsight(s), customer: 'Edited customer', painPoint: 'Edited pain', insight: 'They value the edited routine.' };
  await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: c.campaignId, expectedVersion: 1, insight: edit }); await f.insights.lockInsight(lockRequest(c.campaignId, 2));
  const bigInput = big(), first = await ideas.generate(bigInput, 'owner:synthetic');
  ideas.changeState({ contractVersion: '1.0.0', ideaId: first.ideaId, expectedSequence: 0, action: 'DEVELOP' });
  const angle = await ideas.generate({ contractVersion: '1.0.0', campaignId: c.campaignId, requestId: randomUUID(), kind: 'ANGLE', parentIdeaId: first.ideaId, model: 'gpt-5.6-sol', plannedCallCount: 1, prompt: { source: 'SYSTEM', id: 'system-angle-content', version: 1 } }, 'owner:synthetic');
  const expectedCampaign = { name: 'Synthetic campaign', objective: 'Synthetic explicit objective', products: [{ name: 'Synthetic service', description: 'Synthetic description', type: 'SERVICE', tiers: [] }], customer: 'Edited customer', pain_point: 'Edited pain', insight: 'They value the edited routine.', insight_report: expectedInsight(s).source };
  const expectedInputs = [{ campaign: expectedCampaign, previous_big_ideas: [] }, { context: { campaign: expectedCampaign, big_idea: { concept: 'Synthetic concept 0', expression: 'Synthetic expression 0' }, platform: 'Facebook' }, previous_angles: [] }];
  const calls = gateway.calls.filter(call => call.operation === 'generateText'); assert.equal(calls.length, 2);
  const paths = [['library/big-idea-insight-v1.md', 'system/big-idea-v1.md'], ['library/angle-content-v1.md', 'system/angle-v1.md']] as const;
  for (const [index, call] of calls.entries()) {
    const [creative, system] = paths[index]!;
    assert.deepEqual(JSON.parse(call.request.userInput.replace(/^LOCKED_INPUT_JSON:\n/, '')), expectedInputs[index]);
    assert.equal(call.request.creativeLayer, baseline.prompts[creative].text); assert.equal(call.request.systemLayer, baseline.prompts[system].text);
    assert.equal(sha(fs.readFileSync(`prompts/content/${creative}`, 'utf8')), baseline.prompts[creative].sha256); assert.equal(sha(fs.readFileSync(`prompts/content/${system}`, 'utf8')), baseline.prompts[system].sha256);
  }
  const artifacts = [await ideas.readIdea(first.ideaId), await ideas.readIdea(angle.ideaId)];
  artifacts.forEach((artifact, index) => { assert.deepEqual(artifact.lockedInput, expectedInputs[index]); assert.equal(artifact.systemLayer.sha256, baseline.prompts[paths[index]![1]].sha256); });
  ideas.changeState({ contractVersion: '1.0.0', ideaId: angle.ideaId, expectedSequence: 0, action: 'PURPOSES', purposes: ['EDUCATION'] });
  const displayRules = structuredClone(fixtureDisplayRules) as Record<string, Record<string, string>>;
  for (const rules of Object.values(displayRules)) for (const key of Object.keys(rules)) rules[key] = key === 'name' ? 'ALWAYS' : 'HIDDEN';
  await f.brands.reviseBrand({ contractVersion: '1.0.0', brandId: (await f.campaigns.readCampaign(c.campaignId)).brandId, expectedVersion: 1, profile: { brandName: 'Synthetic CIH' }, displayRules });
  const packages = new ContentPackageService({ db: f.db, artifactStore: f.artifacts, attempts, campaigns: f.campaigns, insights: f.insights, catalog: f.catalog, prompts, library, brands: f.brands, media: new ContentMediaService({ db: f.db, artifactStore: f.artifacts }), ideas });
  const created = await packages.create({ contractVersion: '1.0.0', requestId: randomUUID(), campaignId: c.campaignId,
    caption: { prompt: { source: 'SYSTEM', id: 'system-caption-facebook', version: 1 }, model: 'gpt-5.6-sol', style: 'PROFESSIONAL', length: 'MEDIUM' },
    poster: { prompt: { source: 'SYSTEM', id: 'system-poster-b2b-infographic', version: 1 }, model: 'gpt-image-2', format: 'square', referenceMediaSha256s: [], includeLogo: false }, rows: [{ angleId: angle.ideaId }] });
  const packageId = created.packages[0]!.packageId;
  await packages.generate({ contractVersion: '1.0.0', packageId, requestId: randomUUID(), part: 'CAPTION', plannedCallCount: 1 }, 'owner:synthetic');
  const captionBefore = canonicalBytes(await packages.readPackage(packageId));
  const bytes = artifacts.map(canonicalBytes); const files = inventory(f.artifactRoot).map(file => [file, fs.readFileSync(file)] as const);
  // Later data is a separate run; saved campaign, generation and caption bytes stay frozen.
  const otherReport = await f.appendReader(); await f.decide(otherReport, 'APPROVED');
  assert.deepEqual(canonicalBytes(await ideas.readIdea(first.ideaId)), bytes[0]); assert.equal((await ideas.generate(bigInput, 'owner:synthetic')).deduplicated, true); assert.equal(gateway.calls.length, 3);
  assert.deepEqual(canonicalBytes(await packages.readPackage(packageId)), captionBefore);
  for (const [file, before] of files) assert.deepEqual(fs.readFileSync(file), before);
  // TYPED control and owner/freestyle prompt selection retain their existing contract.
  const tc = await f.createCampaign(); await f.insights.reviseInsight({ contractVersion: '1.0.0', campaignId: tc.campaignId, expectedVersion: 0, insight: typed }); await f.insights.lockInsight(lockRequest(tc.campaignId));
  const typedIdea = await ideas.generate(big(tc.campaignId), 'owner:synthetic'); assert.equal('insight_report' in ((await ideas.readIdea(typedIdea.ideaId)).lockedInput.campaign as Record<string, unknown>), false);
  const owner = await prompts.createPrompt({ contractVersion: '1.0.0', promptKey: 'cih-owner', promptType: 'BIG_IDEA', prompt: { name: 'Synthetic owner', creativeText: 'Synthetic owner instructions.', description: 'Synthetic description', recommendedModel: 'gpt-5.6-sol', tags: [] } });
  const ownerIdea = await ideas.generate(big(c.campaignId, { source: 'USER', promptId: owner.promptId, version: 1 }), 'owner:synthetic');
  assert.equal(gateway.calls.filter(call => call.operation === 'generateText').at(-1)!.request.creativeLayer, 'Synthetic owner instructions.');
  assert.deepEqual(((await ideas.readIdea(ownerIdea.ideaId)).lockedInput.campaign as Record<string, unknown>).insight_report, expectedInsight(s).source);
  await ideas.generate(big(c.campaignId, { source: 'FREESTYLE', creativeText: 'Synthetic freestyle instructions.' }), 'owner:synthetic'); assert.equal(gateway.calls.filter(call => call.operation === 'generateText').at(-1)!.request.creativeLayer, 'Synthetic freestyle instructions.');
  const stpCampaign = await f.createCampaign(undefined, { researchProductWorkspaceId: workspaceId });
  const stp = new ContentInsightService({ db: f.db, artifactStore: f.artifacts, campaigns: f.campaigns, lockedStpReader: { async readVerifiedLockedStp() { return locked(); } }, b10Reader: { async readStatusByProductWorkspace(productWorkspaceId) { return { productWorkspaceId, lockedStpId: lockId, decisionExists: true, readyForB11: true, effectiveDecision: 'APPROVE', effectiveDecisionId: randomUUID(), effectiveDecisionNumber: 1 }; }, async readStatusByLockedStp() { throw new Error('unused'); }, async readVerifiedDecision() { throw new Error('unused'); } } });
  await stp.reviseInsight({ contractVersion: '1.0.0', campaignId: stpCampaign.campaignId, expectedVersion: 0, insight: { ...typed, source: { kind: 'STP', lockedStpId: lockId } } }); await stp.lockInsight(lockRequest(stpCampaign.campaignId));
  const stpIdea = await ideas.generate(big(stpCampaign.campaignId), 'owner:synthetic');
  assert.equal('insight_report' in ((await ideas.readIdea(stpIdea.ideaId)).lockedInput.campaign as Record<string, unknown>), false);

});
