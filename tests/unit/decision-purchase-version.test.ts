import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAutomationDecisionPacket, validateAutomationDecisionCandidateResponse, verifyAutomationDecisionCandidates } from '../../src/modules/analysis/research-automation/decision-packets.js';
import { automationDecisionSynthesisPrompt, prepareAutomationDecisionSynthesis } from '../../src/modules/analysis/research-automation/decision-synthesis-input.js';
import { decisionPacketSection } from '../../src/modules/analysis/research-automation/synthesis-evidence-report.js';
import { syntheticI14Input, validI14Response } from '../helpers/i14-execution-fixture.js';

const evidence = { ...syntheticI14Input(), admissionVersion: '1.1.0' as const };
const sections = ['M11', 'M12', 'I15'] as const;
function candidate(sectionId: typeof sections[number]) {
  return { ...validI14Response(evidence).aiCandidates[0],
    candidateType: sectionId === 'M12' ? 'ACTION_OPTION' : sectionId === 'I15' ? 'STRATEGY_OPTION' : 'HYPOTHESIS',
    counterevidenceRelations: [], immediateTask: 'Review public quality evidence',
    proposedOwner: 'Owner to confirm', proposedDeadline: 'Within two weeks',
    ...(sectionId === 'M12' ? { prerequisites: ['Only public reviews and owner-provided data'] } : {}),
    ...(sectionId === 'I15' ? { conditions: ['Only after owner review'] } : {}),
  };
}

test('packet/input 1.3 and prompt 1.4 enforce U16 without reinterpreting 1.2', () => {
  for (const sectionId of sections) {
    const source = { sectionId, packetVersion: '1.3.0' as const, evidence };
    const prepared = prepareAutomationDecisionSynthesis(source);
    assert.equal(prepared.status, 'READY');
    if (prepared.status !== 'READY') throw new Error('Expected admitted synthetic evidence');
    assert.equal(prepared.input.artifact.methodVersion, '1.3.0');
    assert.equal(prepared.prompt.artifact.promptVersion, '1.4.0');
    assert.equal(prepared.prompt.artifact.inputContract.methodVersion, '1.3.0');
    assert.match(prepared.prompt.artifact.systemText, /General purchase-to-inspect/);
    assert.equal(prepared.input.artifact.workingQuestion, null);
    const good = validateAutomationDecisionCandidateResponse({ aiCandidates: [candidate(sectionId)] }, source);
    assert.deepEqual(verifyAutomationDecisionCandidates(good.artifact, source), good.artifact);
    const fields = ['text', 'conciseEvidenceLinkedRationale', 'immediateTask', 'proposedOwner', 'proposedDeadline',
      'assumptions', 'unknowns', 'evidenceGaps', 'limitations', ...(sectionId === 'M12' ? ['prerequisites'] : sectionId === 'I15' ? ['conditions'] : [])];
    for (const field of fields) {
      const bad = { ...candidate(sectionId), [field]: ['assumptions', 'unknowns', 'evidenceGaps', 'limitations', 'prerequisites', 'conditions'].includes(field)
        ? ['Buy a competitor product to assess its quality'] : 'Mua sản phẩm đối thủ để kiểm tra chất lượng' };
      assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [bad] }, source), /PURCHASE_SUGGESTION_NOT_ALLOWED/, field);
    }
    const historical = { ...source, packetVersion: '1.2.0' as const };
    const formerlyAdmitted = validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...candidate(sectionId), text: 'Mua sản phẩm đối thủ để kiểm tra chất lượng' }] }, historical);
    assert.deepEqual(verifyAutomationDecisionCandidates(formerlyAdmitted.artifact, source), formerlyAdmitted.artifact);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...candidate(sectionId), text: 'Đặt hàng thử sản phẩm đối thủ' }] }, historical), /PURCHASE_SUGGESTION_NOT_ALLOWED/);
    const { immediateTask: _omitted, ...incomplete } = candidate(sectionId);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [incomplete] }, source), /CANDIDATE_PROPOSAL_FIELDS_REQUIRED/);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: ['First', 'Second', 'Third', 'Fourth'].map(text => ({ ...candidate(sectionId), text })) }, source), /CANDIDATE_COUNT_EXCEEDS_PROPOSAL_LIMIT/);
    assert.throws(() => validateAutomationDecisionCandidateResponse({ aiCandidates: [{ ...candidate(sectionId), citedClaimRefs: ['f'.repeat(64)] }] }, source), /UNKNOWN_CLAIM_REFERENCE/);
    const blocked = decisionPacketSection(prepared.packet.artifact, evidence.sourceClaims as Parameters<typeof decisionPacketSection>[1],
      { status: 'INVALID', executionId: 'synthetic', dispatched: false, validationCode: 'INVALID_DECISION_CANDIDATES' });
    assert.match(blocked, /Đề xuất AI bị chặn/);
    assert.doesNotMatch(blocked, /Mua sản phẩm đối thủ để kiểm tra chất lượng/);
  }
});

// Historical factory branches were inspected unchanged; pin the pre-follow-up 1.3 prompt bytes as well.
test('historical prompt 1.3 stays byte-identical and 1.2 reports keep their historical rejection copy', () => {
  const hashes = {
    M11: '13fa94f7d0efff2ff4b01aae4816f5157d6b5006abcd13c0eed859228e6f3586',
    M12: 'aa91c0693a76603f4a6f572cf96be4f126ed1a68c9c74284f30dfeefef9ca3bb',
    I15: 'b90c5e310eba12566a7ed8401f659c97251809f6ce52c8996c4bff635070a8c1',
  };
  for (const sectionId of sections) {
    assert.equal(automationDecisionSynthesisPrompt(sectionId, '1.3.0').sha256, hashes[sectionId]);
    const packet = buildAutomationDecisionPacket({ sectionId, packetVersion: '1.2.0', evidence }).artifact;
    const html = decisionPacketSection(packet, evidence.sourceClaims as Parameters<typeof decisionPacketSection>[1],
      { status: 'INVALID', executionId: 'synthetic', dispatched: false, validationCode: 'INVALID_DECISION_CANDIDATES' });
    assert.match(html, /Phản hồi AI cho mục này không đạt kiểm tra cấu trúc hoặc tham chiếu nguồn/);
    assert.doesNotMatch(html, /Đề xuất AI bị chặn/);
  }
});
