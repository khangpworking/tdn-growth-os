import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { buildBoundedAnalysisGates } from '../../src/modules/analysis/bounded-analysis-gates.js';
import { renderReportMethodPacketSection } from '../../src/modules/analysis/report-method-packets-pages.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { renderLocatedInsightSection } from '../../src/modules/analysis/report-located-insight-pages.js';
import { validateAutomationI14CandidateResponse } from '../../src/modules/analysis/research-automation/i14-evidence-admission.js';
import { buildAutomationDecisionPacket, validateAutomationDecisionCandidateResponse } from '../../src/modules/analysis/research-automation/decision-packets.js';
import { i14SynthesisSection, decisionPacketSection } from '../../src/modules/analysis/research-automation/synthesis-evidence-report.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';
import { locatedInsightPackageFixture } from '../helpers/located-insight-package-fixture.js';
import { syntheticI14Input, validI14Response } from '../helpers/i14-execution-fixture.js';
import { validateAutomationSourceClaims } from '../../src/modules/analysis/research-automation/source-claims.js';

// Renderer ownership: accepted metadata and validated proposals must be readable
// without exposing provider identity, digests or internal status identifiers.
// Original method/candidate objects and canonical bytes remain evidence.
const unsafe = ['Metric sample', 'a'.repeat(64), 'SOURCE_STATED_METADATA'];
function clean(html: string, literal: string, context: string): void {
  const dom = new JSDOM(html);
  try {
    const document = dom.window.document;
    // Metadata code/dumps are legitimate technical disclosures; freeform prose is not.
    document.querySelectorAll('pre, code').forEach(node => node.remove());
    assert.ok(!document.body.textContent?.includes(literal), context);
    if (literal.startsWith('Metric')) assert.ok(!html.includes(literal), `${context}: whole HTML`);
  } finally { dom.window.close(); }
}
function set(value: unknown, path: string, literal: string): void {
  const parts = path.split('.');
  let object = value as Record<string, unknown>;
  for (const key of parts.slice(0, -1)) object = object[key] as Record<string, unknown>;
  object[parts.at(-1)!] = literal;
}

test('accepted bounded source metadata projects safely across all four method pages without changing retained inputs', () => {
  const paths = {
    M10: ['m10.series.0.entityLiteral', 'm10.series.0.metric', 'm10.series.0.unit', 'm10.series.0.dailyBoundary', 'm10.series.0.universe', 'm10.series.0.frame', 'm10.series.0.aggregationRule', 'm10.series.0.policy.revision'],
    I11: ['i11.groupPolicy.revision', 'i11.cells.0.scope.measure', 'i11.cells.0.scope.unit', 'i11.cells.0.scope.universe', 'i11.cells.0.scope.frame', 'i11.cells.0.scope.inclusionRule'],
    I12: ['i12.records.0.touchpoint', 'i12.records.0.channel', 'i12.records.0.attribution', 'i12.records.0.window', 'i12.records.0.scope.measure', 'i12.records.0.scope.unit', 'i12.records.0.scope.universe', 'i12.records.0.scope.frame', 'i12.records.0.scope.inclusionRule'],
    I16: Object.keys(boundedAnalysisGatesFixture().i16!.fields).map(key => `i16.fields.${key}`),
  };
  for (const [section, fields] of Object.entries(paths)) for (const field of fields) for (const literal of unsafe) {
    const input = boundedAnalysisGatesFixture();
    set(input, field, literal);
    const original = JSON.stringify(input);
    const output = buildBoundedAnalysisGates(input).output;
    clean(renderReportMethodPacketSection({ gates: output }, section)!, literal, field);
    assert.equal(JSON.stringify(input), original);
    assert.deepEqual(output.input, input);
  }
  for (const literal of unsafe) {
    const input = boundedAnalysisGatesFixture();
    input.i11!.groupPolicy!.groups[1]!.label = literal;
    input.i11!.cells[0]!.group = literal;
    const output = buildBoundedAnalysisGates(input).output;
    clean(renderReportMethodPacketSection({ gates: output }, 'I11')!, literal, 'I11 declared group');
    assert.equal(output.input.i11!.cells[0]!.group, literal);
  }
});

test('validated I14 and decision candidates keep original proposal bytes while all freeform reader prose is projected safely', () => {
  const evidence = syntheticI14Input();
  for (const literal of unsafe) for (const field of ['text', 'conciseEvidenceLinkedRationale', 'assumptions', 'unknowns', 'evidenceGaps', 'limitations']) {
    const response = structuredClone(validI14Response(evidence));
    response.aiCandidates[0]![field] = ['text', 'conciseEvidenceLinkedRationale'].includes(field) ? literal : [literal];
    const accepted = validateAutomationI14CandidateResponse(response, evidence);
    const before = JSON.stringify(accepted.artifact);
    clean(i14SynthesisSection({ status: 'VALID', executionId: 'synthetic', dispatched: true, candidates: { ...accepted, sha256: createHash('sha256').update(accepted.bytes).digest('hex') } }), literal, `I14 ${field}`);
    assert.equal(JSON.stringify(accepted.artifact), before);
    assert.ok(accepted.bytes.toString().includes(literal));
    for (const sectionId of ['M11', 'M12', 'I15'] as const) {
      const input = { sectionId, evidence: { ...evidence, admissionVersion: '1.0.0' as const } };
      const packet = buildAutomationDecisionPacket(input).artifact;
      const proposal = { ...response.aiCandidates[0], candidateType: sectionId === 'M11' ? 'HYPOTHESIS' : sectionId === 'M12' ? 'ACTION_OPTION' : 'STRATEGY_OPTION', counterevidenceRelations: [], ...(sectionId === 'M12' ? { prerequisites: [literal] } : {}), ...(sectionId === 'I15' ? { conditions: [literal] } : {}) };
      const candidates = validateAutomationDecisionCandidateResponse({ aiCandidates: [proposal] }, input);
      const original = JSON.stringify(candidates.artifact);
      clean(decisionPacketSection(packet, validateAutomationSourceClaims(evidence.sourceClaims), { status: 'VALID', executionId: 'synthetic', dispatched: true, candidates: { ...candidates, sha256: createHash('sha256').update(candidates.bytes).digest('hex') } }), literal, `${sectionId} ${field}`);
      assert.equal(JSON.stringify(candidates.artifact), original);
      assert.ok(candidates.bytes.toString().includes(literal));
    }
  }
});

test('U-07 author-proposed task, owner and deadline render as an unapproved AI proposal', () => {
  const evidence = syntheticI14Input();
  for (const sectionId of ['M11', 'M12', 'I15'] as const) {
    const input = { sectionId, packetVersion: '1.2.0' as const, evidence: { ...evidence, admissionVersion: '1.0.0' as const } };
    const packet = buildAutomationDecisionPacket(input).artifact;
    const proposal = { ...structuredClone(validI14Response(evidence)).aiCandidates[0], candidateType: sectionId === 'M11' ? 'HYPOTHESIS' : sectionId === 'M12' ? 'ACTION_OPTION' : 'STRATEGY_OPTION',
      counterevidenceRelations: [], ...(sectionId === 'M12' ? { prerequisites: ['Owner confirms the retained observation'] } : sectionId === 'I15' ? { conditions: ['Owner confirms the retained observation'] } : {}),
      immediateTask: 'Review the stated barrier with the owner', proposedOwner: 'Owner to confirm', proposedDeadline: 'Within two weeks' };
    const candidates = validateAutomationDecisionCandidateResponse({ aiCandidates: [proposal] }, input);
    const html = decisionPacketSection(packet, validateAutomationSourceClaims(evidence.sourceClaims),
      { status: 'VALID', executionId: 'synthetic', dispatched: true, candidates: { ...candidates, sha256: createHash('sha256').update(candidates.bytes).digest('hex') } });
    assert.match(html, /Việc làm ngay AI đề xuất:<\/b> Review the stated barrier with the owner/);
    assert.match(html, /Người phụ trách AI đề xuất:<\/b> Owner to confirm/);
    assert.match(html, /Thời hạn AI đề xuất:<\/b> Within two weeks/);
    assert.equal((html.match(/đề xuất của AI, chờ chủ duyệt; chưa phải cam kết hay phân công/g) ?? []).length, 3, sectionId);
  }
});

test('accepted located protocols, brief, corpus and coding provenance use safe reader projections without altering retained source records', () => {
  const fields = ['inclusionRule', 'adjudicationRule', 'brief.version', 'brief.questionText.text', 'brief.decisionToInform.text', 'brief.intendedAudience.text', 'brief.scope.text', 'i02.0.provenance.coderRole', 'i04.0.provenance.coderRole', 'i05.0.provenance.coderRole', 'i06.0.provenance.coderRole', 'i07.0.provenance.coderRole', 'i08.0.provenance.coderRole', 'i09.0.provenance.coderRole', 'i13Mentions.0.provenance.coderRole', 'corpora.0.question', 'corpora.0.unit', 'corpora.0.inclusionRule', 'corpora.0.externalSampling', 'corpora.0.codebook.revision', 'corpora.0.codebook.codes.0.label', 'corpora.0.assignments.0.provenance.coderRole', 'corpora.0.dispositions.0.provenance.coderRole'];
  for (const field of fields) for (const literal of unsafe) {
    const { descriptor, files } = locatedInsightPackageFixture();
    const source = Buffer.from(files[1]!.bytes);
    set(descriptor, field, literal);
    const original = JSON.stringify(descriptor);
    const output = buildLocatedInsightMethods(descriptor).output;
    for (const section of ['I01', 'I02', 'I04', 'I05', 'I06', 'I07', 'I08', 'I09', 'I10', 'I13']) clean(renderLocatedInsightSection(output, section)!, literal, `${field}/${section}`);
    assert.equal(JSON.stringify(descriptor), original);
    assert.deepEqual(output.input, descriptor);
    assert.deepEqual(files[1]!.bytes, source);
  }
  // An unpopulated codebook has accepted labels/codes/phrases but no located
  // evidence. It must retain those declarations without projecting unsafe text.
  for (const literal of unsafe) for (const field of ['code', 'phrase']) {
    const { descriptor } = locatedInsightPackageFixture();
    const corpus = descriptor.corpora[0]!;
    corpus.assignments = [];
    corpus.dispositions.forEach(row => { row.state = 'UNCODED'; });
    corpus.codebook.codes = [{ code: 'T001', label: 'Declared empty code', phrase: 'Declared phrase', firstRecordIndex: null, firstSpan: null }];
    corpus.codebook.codes[0]![field as 'code' | 'phrase'] = literal;
    const output = buildLocatedInsightMethods(descriptor).output;
    clean(renderLocatedInsightSection(output, 'I10')!, literal, `unpopulated ${field}`);
    assert.deepEqual(output.input, descriptor);
  }
});
