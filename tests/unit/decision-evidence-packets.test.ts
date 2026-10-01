import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDecisionEvidencePackets, validateDecisionEvidencePacketsInput, verifyDecisionEvidencePackets } from '../../src/modules/analysis/decision-evidence-packets.js';
import { decisionEvidencePacketsFixture } from '../helpers/decision-evidence-packets-fixture.js';

// Pure methods own ordering, declared review boundaries, reference consistency,
// and open decisions. Report integration owns actual packet-byte authentication.
// These tests use the public builder/validator and independent expected states;
// no test-only export or copied decision logic is needed.
test('unset owner inputs retain catalog inventory and exact overlapping scopes without choosing or combining', () => {
  const input = decisionEvidencePacketsFixture();
  const all = input.claims.find(claim => claim.payload.claimId === 'M03:all:revenue')!;
  const wide = input.claims.find(claim => claim.payload.claimId === 'M03:wide:revenue')!;
  const share = input.claims.find(claim => claim.payload.claimId === 'M04:all:top1')!;
  assert.ok(all && wide && share);
  input.claims = [share, wide, all, structuredClone(all)];
  const { output, bytes } = buildDecisionEvidencePackets(input);
  assert.deepEqual(output.inventory.map(item => item.claimKey), [all.claimKey, wide.claimKey, share.claimKey]);
  assert.equal(output.duplicateReferenceCount, 1);
  assert.deepEqual(output.sections.M11.groups.map(group => [group.basis, group.label]), [
    ['SOURCE_SECTION', 'M03'], ['SOURCE_SECTION', 'M04'],
  ]);
  assert.deepEqual(output.sections.M11.groups[0]!.claimKeys, [all.claimKey, wide.claimKey]);
  assert.equal(output.input.claims[2]!.payload.value, '185');
  assert.equal(output.input.claims[2]!.payload.approvalState, 'UNREVIEWED');
  assert.deepEqual(output.sections.I14.directions, []);
  assert.deepEqual(output.sections.I15.options, []);
  assert.deepEqual(output.sections.M12.ownerOptionIndexes, []);
  assert.deepEqual(output.sections.M12.constraints.cost, { state: 'UNSET', text: null });
  assert.equal(output.sections.M01.conclusion, null);
  assert.equal(output.sections.I15.preferredOption, null);
  assert.equal(output.sections.M12.chosen, null);
  assert.equal(output.sections.M12.executionAuthorization, null);
  assert.equal(output.sections.M12.decisionState, 'OPEN');
  assert.deepEqual(verifyDecisionEvidencePackets(JSON.parse(bytes.toString())).bytes, bytes);
  const reordered = structuredClone(output);
  reordered.sections.M01.claimKeys.reverse();
  assert.throws(() => verifyDecisionEvidencePackets(reordered), /DECISION_EVIDENCE_REPLAY_MISMATCH/);
});

test('declared review, excluded counterclaims, ambiguous directions and owner option order stay explicit', () => {
  const input = decisionEvidencePacketsFixture();
  input.claims = input.claims.slice(0, 3);
  const [a, b, unassigned] = input.claims;
  assert.ok(a && b && unassigned);
  a.reviewDeclaration = { state: 'DECLARED_REVIEWED', reason: 'Imported declaration only' };
  b.reviewDeclaration = { state: 'EXCLUDED', reason: 'Owner declares scope mismatch' };
  a.counterclaimKeys = [b.claimKey];
  input.question = { state: 'SUPPLIED', text: 'Owner question exactly as supplied' };
  input.questionClaimKeys = [a.claimKey];
  const group = (label: string, claimKeys: string[]) => ({ label, claimKeys, counterclaimKeys: [], missingEvidence: ['Unknown denominator compatibility'] });
  input.ownerHypotheses = [group('Hypothesis Z', [a.claimKey, b.claimKey])];
  input.ownerDirections = [group('Direction Z', [a.claimKey]), group('Direction A', [a.claimKey])];
  const unknown = { state: 'UNSET' as const, text: null };
  const constraints = { cost: unknown, capability: unknown, time: unknown, risk: unknown };
  input.ownerOptions = [
    { ...group('Option Z', [a.claimKey]), constraints: { ...constraints, cost: { state: 'SUPPLIED', text: '0 VND declared budget' } } },
    { ...group('Option A', [b.claimKey]), constraints },
  ];
  const { output } = buildDecisionEvidencePackets(input);
  assert.deepEqual(output.sections.M01.declaredReviewedClaimKeys, [a.claimKey]);
  assert.deepEqual(output.sections.M01.excludedClaimKeys, [b.claimKey]);
  assert.equal(output.input.claims[0]!.payload.approvalState, 'UNREVIEWED');
  assert.equal(output.sections.M01.decisionSupportStatus, 'HUMAN_REVIEW_REQUIRED');
  assert.deepEqual(output.sections.M11.groups[0]!.claimKeys, [a.claimKey]);
  assert.deepEqual(output.sections.M11.groups[0]!.counterclaimKeys, [b.claimKey]);
  assert.deepEqual(output.sections.M11.groups[0]!.excludedClaimKeys, [b.claimKey]);
  assert.deepEqual(output.sections.I14.directions.map(group => group.label), ['Direction Z', 'Direction A']);
  assert.deepEqual(output.sections.I14.ambiguousClaims.find(item => item.claimKey === a.claimKey)?.directionIndexes, [0, 1]);
  assert.deepEqual(output.sections.I14.unassignedClaimKeys, [unassigned.claimKey]);
  assert.deepEqual(output.sections.I15.options.map(option => option.label), ['Option Z', 'Option A']);
  assert.deepEqual(output.sections.I15.options[1]!.claimKeys, []);
  assert.equal(output.sections.I15.options[0]!.constraints.cost.text, '0 VND declared budget');
  assert.deepEqual(output.sections.I15.options[1]!.constraints.cost, unknown);
  assert.equal(output.sections.I15.preferredOption, null);
  assert.equal(output.sections.M12.chosen, null);
  assert.ok(output.sections.M12.blockers.includes('EVIDENCE_CONFLICT_REQUIRES_REVIEW'));
  for (const section of Object.values(output.sections)) assert.equal(section.decisionSupportStatus, 'HUMAN_REVIEW_REQUIRED');
});

test('identity drift, unresolved associations and self-conflicts fail before producing a packet', () => {
  const variants: Array<[string, (input: ReturnType<typeof decisionEvidencePacketsFixture>) => void, RegExp]> = [
    ['payload drift at exact claim identity', input => {
      const duplicate = structuredClone(input.claims[0]!); duplicate.payload.value = '999'; input.claims.push(duplicate);
    }, /CLAIM_IDENTITY_DRIFT/],
    ['review drift at exact claim identity', input => {
      const duplicate = structuredClone(input.claims[0]!); duplicate.reviewDeclaration.state = 'DECLARED_REVIEWED'; input.claims.push(duplicate);
    }, /CLAIM_IDENTITY_DRIFT/],
    ['different claim at one reference', input => { input.claims[1]!.reference = structuredClone(input.claims[0]!.reference); }, /CLAIM_REFERENCE_COLLISION/],
    ['key drift', input => { input.claims[0]!.claimKey = `missing@${'a'.repeat(64)}`; }, /CLAIM_KEY_IDENTITY_MISMATCH/],
    ['missing counterclaim', input => { input.claims[0]!.counterclaimKeys = [`missing@${'a'.repeat(64)}`]; }, /UNKNOWN_CLAIM_KEY/],
    ['self counterclaim', input => { input.claims[0]!.counterclaimKeys = [input.claims[0]!.claimKey]; }, /SELF_COUNTERCLAIM/],
    ['unset owner field contains a value', input => { input.constraints.cost.text = '0'; }, /OWNER_FIELD_STATE_MISMATCH/],
    ['relevance without question', input => { input.questionClaimKeys = [input.claims[0]!.claimKey]; }, /QUESTION_LINKS_WITHOUT_QUESTION/],
  ];
  for (const [name, modify, expected] of variants) {
    const input = decisionEvidencePacketsFixture(); modify(input);
    assert.throws(() => buildDecisionEvidencePackets(input), expected, name);
  }
});

test('closed FactObservation and output contracts reject invented prose, authority and decisions', () => {
  const input = decisionEvidencePacketsFixture();
  const first = input.claims[0]!;
  const variants = [
    { ...input, aiCandidates: [{ text: 'Launch now' }] },
    { ...input, claims: [{ ...first, payload: { ...first.payload, text: 'Launch now' } }] },
    { ...input, claims: [{ ...first, payload: { ...first.payload, claimType: 'AI_INTERPRETATION' } }] },
    { ...input, claims: [{ ...first, payload: { ...first.payload, approvalState: 'APPROVED' } }] },
    { ...input, claims: [{ ...first, reference: { ...first.reference, fileName: 'interpretation.json' } }] },
    { ...input, synthesisProfileSha256: '0'.repeat(64) },
  ];
  for (const variant of variants) assert.throws(() => validateDecisionEvidencePacketsInput(variant), /INVALID_DECISION_EVIDENCE_INPUT/);
  const { output } = buildDecisionEvidencePackets(input);
  assert.throws(() => verifyDecisionEvidencePackets({ ...output, sections: { ...output.sections, M12: { ...output.sections.M12, chosen: 'launch' } } }), /INVALID_DECISION_EVIDENCE_OUTPUT/);
});
