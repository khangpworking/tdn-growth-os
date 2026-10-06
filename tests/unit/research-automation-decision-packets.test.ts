import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildAutomationDecisionPacket, verifyAutomationDecisionPacket,
  validateAutomationDecisionCandidateResponse, verifyAutomationDecisionCandidates } from '../../src/modules/analysis/research-automation/decision-packets.js';
import { syntheticI14Input, validI14Response } from '../helpers/i14-execution-fixture.js';
import type { AutomationSourceClaims } from '../../contracts/analysis/automation-source-claims.generated.js';
import { prepareAutomationDecisionSynthesis } from '../../src/modules/analysis/research-automation/decision-synthesis-input.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';

// Primary owner for the new closed candidate and section contracts. Existing
// I14 tests cannot catch a strategy/action accepted as a hypothesis or a model
// value copied into an owner option. Persistence/source replay live in integration.
test('decision packets keep owner authority unset and candidate types bound to their section', () => {
  const evidence = { ...syntheticI14Input(), admissionVersion: '1.0.0' as const };
  for (const sectionId of ['M11', 'M12', 'I15'] as const) {
    const input = { sectionId, evidence };
    const packet = buildAutomationDecisionPacket(input).artifact;
    assert.deepEqual(packet.ownerQuestion, { state: 'UNSET', text: null });
    assert.deepEqual(packet.ownerConstraints, []);
    assert.equal(packet.items[0]!.encodedCounterevidenceSpans, 1);
    assert.equal(packet.items[0]!.currentAdapterSupport, 'USE_CONTEXT_ANCHOR');
    if (packet.sectionId === 'M11') assert.equal(packet.opportunity.priority, null);
    if (packet.sectionId === 'M12') assert.deepEqual([packet.action.chosen, packet.action.executionAuthorization], [null, null]);
    if (packet.sectionId === 'I15') assert.deepEqual([packet.strategy.ownerOptions, packet.strategy.preferredOption], [[], null]);
    assert.deepEqual(verifyAutomationDecisionPacket(packet, input), packet);
    assert.throws(() => verifyAutomationDecisionPacket({ ...packet, ownerQuestion: { state: 'DECLARED', text: 'Invented target' } }, input), /INVALID_DECISION_PACKET/);

    const draft = { ...validI14Response(evidence).aiCandidates[0],
      candidateType: sectionId === 'M11' ? 'HYPOTHESIS' : sectionId === 'M12' ? 'ACTION_OPTION' : 'STRATEGY_OPTION',
      counterevidenceRelations: [],
      ...(sectionId === 'M12' ? { prerequisites: ['Verify the source-stated work setting before choosing any action.'] } : {}),
      ...(sectionId === 'I15' ? { conditions: ['Only if the owner later confirms a compatible objective.'] } : {}),
    };
    const result = validateAutomationDecisionCandidateResponse({ aiCandidates: [draft] }, input).artifact;
    assert.equal(result.validation.semantic, 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED');
    assert.deepEqual(verifyAutomationDecisionCandidates(result, input), result);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...draft, chosen: true }] }, input), /INVALID_DECISION_CANDIDATES/);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...draft, candidateType: 'SUMMARY_DRAFT' }] }, input), /CANDIDATE_TYPE_SECTION_MISMATCH/);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...draft, citedClaimRefs: ['f'.repeat(64)] }] }, input), /UNKNOWN_CLAIM_REFERENCE/);
    assert.throws(() => verifyAutomationDecisionCandidates({ ...result, packet: { ...result.packet, packetSha256: 'f'.repeat(64) } }, input), /DECISION_CANDIDATES_REPLAY_MISMATCH/);
  }
});

test('missing evidence remains missing rather than generating owner choices or a free-standing option', () => {
  const base = syntheticI14Input();
  const source = base.sourceClaims as Record<string, unknown>;
  const claimsSha256 = createHash('sha256').update(canonicalJson([])).digest('hex');
  const evidence = { ...base, admissionVersion: '1.0.0' as const, claimsSha256,
    sourceClaims: { ...source, claimsSha256, claims: [] }, locatedMethodOutput: null };
  const input = { sectionId: 'M11' as const, evidence };
  const packet = buildAutomationDecisionPacket(input).artifact;
  assert.equal(packet.status, 'INSUFFICIENT_EVIDENCE');
  assert.deepEqual(packet.items, []);
  const empty = validateAutomationDecisionCandidateResponse({ aiCandidates: [] }, input).artifact;
  assert.equal(empty.insufficientEvidence, 'NO_ADMISSIBLE_SOURCE_STATED_USE_CONTEXT');
  assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...validI14Response(base).aiCandidates[0], counterevidenceRelations: [] }] }, input), /CANDIDATES_WITHOUT_ADMITTED_USE_CONTEXT/);
});

test('a proposed M05 counterclaim requires its exact target and one retained human-review relation', () => {
  const base = syntheticI14Input();
  const source = base.sourceClaims as AutomationSourceClaims;
  const anchor = source.claims[0]!;
  const { claimId: _anchorId, ...body } = anchor;
  // Literal synthetic observation. This unit owner verifies the closed relation
  // boundary, not raw source intake (covered by the service integration owner).
  const marketBody = { ...body, sectionId: 'M05' as const,
    method: { ...body.method, methodId: 'descriptive-market-methods', outputPointer: '/input/m05/0' },
    source: { ...body.source, recordLocator: null, spans: [], statement: null, attribution: null },
    observation: { ...body.observation, basis: 'SOURCE_OBSERVED' as const, state: 'observed_zero' as const,
      measure: { literal: 'Reported sales', definition: 'One source-stated observation', entityLabel: 'Synthetic item' },
      value: '0', unit: 'source sales', precision: 'exact' as const,
      coverage: { unit: 'SOURCE_OBSERVATIONS' as const, observedCount: 0, zeroCount: 1, missingCount: 0, unknownCount: 0,
        nonExactCount: 0, description: 'One synthetic observation; not market demand' } }, declaration: null };
  const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
  const counter = { ...marketBody, claimId: sha(marketBody) };
  const claims = [...source.claims, counter];
  const evidence = { ...base, admissionVersion: '1.0.0' as const, claimsSha256: sha(claims),
    sourceClaims: { ...source, claims, claimsSha256: sha(claims) } };
  const input = { sectionId: 'M11' as const, evidence };
  const draft = validI14Response(base).aiCandidates[0]!;
  // The new adapter permits this exact zero as literal draft support, without
  // requiring a qualitative anchor or promoting it into demand or a pattern.
  const onlyObserved = { ...evidence, claimsSha256: sha([counter]), sourceClaims: { ...source, claims: [counter], claimsSha256: sha([counter]) }, locatedMethodOutput: null };
  const expanded = { ...input, packetVersion: '1.1.0' as const, evidence: onlyObserved };
  assert.equal(prepareAutomationDecisionSynthesis({ ...expanded, packetVersion: '1.0.0' }).status, 'NOT_DISPATCHABLE');
  const literal = prepareAutomationDecisionSynthesis(expanded);
  assert.equal(literal.status, 'READY');
  if (literal.status !== 'READY') throw new Error('Expected literal observation input.');
  assert.deepEqual(literal.projection.supportClaimIds, [counter.claimId]);
  assert.equal(literal.input.artifact.observedContext[0]!.observation.value, '0');
  assert.equal(literal.input.artifact.observedContext[0]!.observation.period, null);
  assert.deepEqual(literal.input.artifact.supportEligible, []);
  assert.equal(literal.prompt.artifact.promptVersion, '1.2.0');
  const literalDraft = { ...draft, citedClaimRefs: [counter.claimId], counterevidenceRelations: [] };
  const acceptedDraft = validateAutomationDecisionCandidateResponse({ aiCandidates: [literalDraft] }, expanded).artifact;
  assert.equal(acceptedDraft.validation.semantic, 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED');
  assert.deepEqual(verifyAutomationDecisionCandidates(acceptedDraft, expanded), acceptedDraft);
  const unidentifiedBody = { ...marketBody, observation: { ...marketBody.observation, unit: null } };
  const unidentified = [{ ...unidentifiedBody, claimId: sha(unidentifiedBody) }];
  assert.equal(prepareAutomationDecisionSynthesis({ ...expanded, evidence: { ...onlyObserved, claimsSha256: sha(unidentified),
    sourceClaims: { ...source, claims: unidentified, claimsSha256: sha(unidentified) } } }).status, 'NOT_DISPATCHABLE');
  const prepared = prepareAutomationDecisionSynthesis(input);
  assert.equal(prepared.status, 'READY');
  if (prepared.status !== 'READY') throw new Error('Expected exact model input.');
  assert.equal(prepared.input.artifact.observedContext[0]!.claimId, counter.claimId);
  assert.equal(prepared.input.artifact.observedContext[0]!.observation.value, '0');
  assert.equal(prepared.input.artifact.observedContext[0]!.observation.state, 'observed_zero');
  assert.equal(prepared.input.artifact.supportEligible.some(claim => claim.claimId === counter.claimId), false);
  const relation = { claimRef: counter.claimId, relationType: 'PROPOSED_COUNTEREVIDENCE', relationStatus: 'HUMAN_REVIEW_REQUIRED',
    layer: 3, counteredTarget: draft.text,
    compatibility: { entity: 'Identity alignment is unresolved.', measure: 'Sales and reported use are different measures.',
      unit: 'No rate comparison is proposed.', period: 'Period alignment is unknown.', scope: 'Scopes are distinct.',
      denominator: 'No common denominator is established.' }, inferentialLimitations: ['This relation is a proposal, not a verified contradiction.'] };
  const candidate = { ...draft, counterevidenceRefs: [counter.claimId], counterevidenceRelations: [relation] };
  const run = (value: unknown) => validateAutomationDecisionCandidateResponse({ aiCandidates: [value] }, input);
  const saved = run(candidate).artifact;
  assert.equal(saved.aiCandidates[0]!.counterevidenceRelations[0]!.relationStatus, 'HUMAN_REVIEW_REQUIRED');
  assert.equal(buildAutomationDecisionPacket(input).artifact.items[0]!.claimId, counter.claimId);
  for (const [changed, error] of [
    [{ ...candidate, counterevidenceRelations: [] }, /COUNTEREVIDENCE_RELATION_MISSING/],
    [{ ...candidate, counterevidenceRefs: [] }, /COUNTEREVIDENCE_RELATION_UNBOUND/],
    [{ ...candidate, counterevidenceRelations: [relation, { ...relation, inferentialLimitations: ['A different draft limitation.'] }] }, /COUNTEREVIDENCE_RELATION_DUPLICATE/],
    [{ ...candidate, counterevidenceRelations: [{ ...relation, claimRef: 'f'.repeat(64) }] }, /UNKNOWN_CLAIM_REFERENCE/],
    [{ ...candidate, counterevidenceRelations: [{ ...relation, counteredTarget: 'An assertion absent from the candidate.' }] }, /COUNTEREVIDENCE_TARGET_NOT_IN_CANDIDATE/],
    [{ ...candidate, counterevidenceRelations: [{ ...relation, relationStatus: 'VERIFIED' }] }, /INVALID_DECISION_CANDIDATES/],
    [{ ...candidate, counterevidenceRelations: [{ ...relation, compatibility: { ...relation.compatibility, period: '2026' } }] }, /INVALID_DECISION_CANDIDATES/],
  ] as const) assert.throws(() => run(changed), error);
});

test('behavior draft support keeps its exact contained context and rejects bare or ambiguous actions', () => {
  const base = syntheticI14Input();
  const original = base.sourceClaims as AutomationSourceClaims;
  const located = base.locatedMethodOutput as LocatedInsightMethods;
  const sha = (value: unknown) => createHash('sha256').update(canonicalJson(value)).digest('hex');
  for (const [kind, attribution, qualified, expected] of [
    ['ACTION_REPORTED', 'SELF_REPORTED', false, true], ['ATTEMPT_REPORTED', 'SELF_REPORTED', false, true],
    ['COMPLETION_REPORTED', 'SOURCE_LOGGED', false, true], ['NO_ACTION_EXPLICIT', 'SELF_REPORTED', false, false],
    ['ACTION_REPORTED', 'OTHER_REPORTED', false, false], ['ACTION_REPORTED', 'SELF_REPORTED', true, false],
  ] as const) {
    const sourceInput = structuredClone(located.input);
    const context = sourceInput.i02[0]!;
    const span = { start: 0, end: 22, quote: 'I take the fan to work' };
    sourceInput.i04 = [{ recordIndex: 0, provenance: context.provenance, qualifiers: qualified ? [context.setting.span!] : [],
      counterevidence: context.counterevidence, span, eventKind: kind, attribution }];
    const output = buildLocatedInsightMethods(sourceInput).output;
    const { claimId: _oldId, ...old } = original.claims[0]!;
    const contextBody = { ...old, method: { ...old.method, methodOutputId: output.methodOutputId } };
    const contextClaim = { ...contextBody, claimId: sha(contextBody) };
    const behaviorBody = { ...contextBody, sectionId: 'I04' as const,
      method: { ...contextBody.method, outputPointer: '/input/i04/0' },
      source: { ...contextBody.source, spans: [{ role: 'DECLARATION' as const, ...span },
        ...(qualified ? [{ role: 'QUALIFIER' as const, ...context.setting.span! }] : []),
        ...context.counterevidence.map(value => ({ role: 'COUNTEREVIDENCE' as const, ...value }))] },
      declaration: { ...contextBody.declaration!, annotationAttribution: attribution } };
    const behavior = { ...behaviorBody, claimId: sha(behaviorBody) };
    const claims = [contextClaim, behavior];
    const evidence = { ...base, admissionVersion: '1.0.0' as const, locatedMethodOutput: output,
      claimsSha256: sha(claims), sourceClaims: { ...original, claims, claimsSha256: sha(claims) } };
    const input = { sectionId: 'M11' as const, packetVersion: '1.1.0' as const, evidence };
    const packet = buildAutomationDecisionPacket(input).artifact;
    const member = packet.items.find(item => item.claimId === behavior.claimId)!;
    assert.equal(member.currentAdapterSupport, expected ? 'BEHAVIOR_WITH_USE_CONTEXT' : 'NOT_ADMITTED_BY_CURRENT_ADAPTER');
    if (!expected) continue;
    assert.deepEqual(member.contextClaimRefs, [contextClaim.claimId]);
    const prepared = prepareAutomationDecisionSynthesis(input);
    if (prepared.status !== 'READY') throw new Error('Expected contained behavior input.');
    assert.equal(prepared.input.artifact.declarationContext[0]!.behavior!.eventKind, kind);
    const candidate = { ...validI14Response(evidence).aiCandidates[0], counterevidenceRelations: [], citedClaimRefs: [behavior.claimId] };
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [candidate] }, input), /CITED_BEHAVIOR_CONTEXT_MISSING/);
    const saved = validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...candidate, citedClaimRefs: [behavior.claimId, contextClaim.claimId] }] }, input);
    assert.equal(saved.artifact.validation.semantic, 'NOT_VERIFIED_HUMAN_REVIEW_REQUIRED');
  }
});
