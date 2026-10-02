import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { LiteralReviewPending } from '../../src/modules/analysis/research-automation/literal-review-coding.js';
import { codeLiteralLocatedRecords, readLiteralReviewRulesV1 } from '../../src/modules/analysis/research-automation/literal-review-coding.js';
import { projectLiteralReviewCandidates, type LiteralProjectionCoding } from '../../src/modules/analysis/research-automation/literal-review-projection.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

const rules = readLiteralReviewRulesV1();
function fixture(texts: (string | null)[]) {
  const descriptor = locatedInsightFixture();
  descriptor.records = texts.map((text, index) => ({ sourceSha256: '1'.repeat(64), locator: `/${index}/comment`, text,
    sourceAttribution: 'Synthetic source-bound declaration', timeText: null,
    disposition: text === null ? 'UNREADABLE' : 'INCLUDED', dispositionReason: text === null ? 'UNREADABLE_TEXT' : null }));
  return { descriptor, coding: codeLiteralLocatedRecords(descriptor, rules) };
}

test('pending applies only to the affected reading; null ambiguity is conservative and coverage absence is retained', () => {
  const text = 'Tôi đã dùng sản phẩm. Tôi thích sản phẩm.';
  const first = locatedSpan(text, 'Tôi đã dùng sản phẩm');
  const second = locatedSpan(text, 'Tôi thích sản phẩm');
  const cases: { name: string; pending: LiteralReviewPending; admittedI04: number; admittedI05: number }[] = [
    { name: 'unrelated clause in same family', pending: { family: 'I04', recordIndex: 0, reason: 'NEGATED_VERB_AMBIGUOUS', span: second, trigger: null }, admittedI04: 1, admittedI05: 1 },
    { name: 'same reading', pending: { family: 'I04', recordIndex: 0, reason: 'NEGATED_VERB_AMBIGUOUS', span: first, trigger: null }, admittedI04: 0, admittedI05: 1 },
    { name: 'partial overlap', pending: { family: 'I04', recordIndex: 0, reason: 'NEGATION_SCOPE_UNCLEAR', span: locatedSpan(text, 'dùng sản phẩm'), trigger: null }, admittedI04: 0, admittedI05: 1 },
    { name: 'shared question scope', pending: { family: 'I02', recordIndex: 0, reason: 'QUESTION_SENTENCE', span: first, trigger: null }, admittedI04: 0, admittedI05: 1 },
    { name: 'shared quotation scope', pending: { family: 'I02', recordIndex: 0, reason: 'QUOTED_TEXT_SCOPE', span: second, trigger: null }, admittedI04: 1, admittedI05: 0 },
    { name: 'null family scope with located trigger', pending: { family: 'I04', recordIndex: 0, reason: 'UNRECOGNIZED_SUBJECT', span: null, trigger: locatedSpan(text, 'thích') }, admittedI04: 0, admittedI05: 1 },
    { name: 'null shared scope with located trigger', pending: { family: 'I02', recordIndex: 0, reason: 'CONDITIONAL_SCOPE', span: null, trigger: locatedSpan(text, 'dùng') }, admittedI04: 0, admittedI05: 0 },
    { name: 'no match is not counterevidence', pending: { family: 'I04', recordIndex: 0, reason: 'NO_RULE_MATCH', span: null, trigger: null }, admittedI04: 1, admittedI05: 1 },
    { name: 'non NFC is a record guard', pending: { family: 'I02', recordIndex: 0, reason: 'NON_NFC_TEXT', span: second, trigger: null }, admittedI04: 0, admittedI05: 0 },
  ];
  for (const row of cases) {
    const { descriptor, coding } = fixture([text]);
    assert.equal(coding.candidates.i04.length, 1);
    assert.equal(coding.candidates.i05.length, 1);
    coding.pending = [row.pending];
    const before = structuredClone({ descriptor, coding });
    const projection = projectLiteralReviewCandidates(descriptor, coding);
    assert.equal(projection.candidates.i04.length, row.admittedI04, row.name);
    assert.equal(projection.candidates.i05.length, row.admittedI05, row.name);
    assert.deepEqual(projection.pending, [row.pending], row.name);
    assert.deepEqual({ descriptor, coding }, before, row.name);
    for (const blocked of projection.blocked) {
      assert.equal(blocked.candidateIndex, 0, row.name);
      assert.deepEqual(blocked.pendingIndexes, [0], row.name);
      assert.deepEqual(blocked.reasons, [row.pending.reason], row.name);
    }
  }
});

test('relation contexts and qualifier spans bind pending to a reading without changing exact annotations', () => {
  const { descriptor, coding } = fixture(['😀 Tôi mua cho con ăn hàng ngày. Tôi thử đặt mua nhưng không đặt được.']);
  const text = descriptor.records[0]!.text!;
  assert.equal(coding.candidates.i02.length, 1);
  assert.equal(coding.candidates.i08.length, 1);
  const barrier = coding.candidates.i08[0]!;
  assert.equal(barrier.resolutionState.state, 'UNKNOWN');
  assert.equal(barrier.provenance.basis, 'DECLARED');
  const qualifier = locatedSpan(text, 'hàng ngày');
  const contrast = locatedSpan(text, 'nhưng');
  coding.pending = [
    { family: 'I02', recordIndex: 0, reason: 'NEGATED_CONTEXT', span: qualifier, trigger: null },
    { family: 'I08', recordIndex: 0, reason: 'TASK_CLAUSE_UNRESOLVED', span: contrast, trigger: null },
  ];
  const projection = projectLiteralReviewCandidates(descriptor, coding);
  assert.deepEqual(projection.candidates.i02, []);
  assert.deepEqual(projection.candidates.i08, []);
  assert.deepEqual(projection.blocked.map(row => [row.family, row.candidateIndex, row.pendingIndexes]),
    [['I02', 0, [0]], ['I08', 0, [1]]]);
  coding.pending = [];
  coding.candidates.i08[0]!.counterevidence = [contrast];
  const preserved = projectLiteralReviewCandidates(descriptor, coding);
  assert.deepEqual(preserved.candidates.i08, [barrier]);
  assert.equal(preserved.candidates.i08[0]!.attemptedTask.quote, 'Tôi thử đặt mua');
  assert.equal(preserved.candidates.i08[0]!.obstacleClause.quote, 'không đặt được');
  assert.equal(preserved.candidates.i08[0]!.resolutionState.state, 'UNKNOWN');
  assert.equal(preserved.candidates.i08[0]!.provenance.basis, 'DECLARED');
  assert.ok(preserved.admitted.find(row => row.family === 'I08')!.spans.some(span => span.quote === 'nhưng'));
  assert.equal(preserved.coverage.families.I08.admittedCandidates, 1);
  assert.equal(preserved.coverage.families.I08.admittedRecords, 1);
});

test('record eligibility and source corruption cannot be promoted, and clause conflicts affect only their candidates', () => {
  const { descriptor, coding } = fixture(['Tôi đã dùng sản phẩm. Tôi đã mua sản phẩm.', null, 'Tôi đã dùng.'.normalize('NFD')]);
  assert.equal(coding.candidates.i04.length, 2);
  assert.equal(coding.units[1]!.eligibility, 'UNREADABLE_TEXT');
  assert.deepEqual(coding.units[2]!.textFlags, ['NON_NFC_TEXT']);
  const conflict = structuredClone(coding.candidates.i04[0]!);
  conflict.eventKind = 'COMPLETION_REPORTED';
  coding.candidates.i04.push(conflict);
  const projection = projectLiteralReviewCandidates(descriptor, coding);
  assert.deepEqual(projection.candidates.i04.map(row => row.span.quote), ['Tôi đã mua sản phẩm']);
  assert.deepEqual(projection.blocked.map(row => [row.family, row.candidateIndex, row.reasons]),
    [['I04', 0, ['CONFLICTING_CANDIDATE_CODES']], ['I04', 2, ['CONFLICTING_CANDIDATE_CODES']]]);
  assert.equal(projection.coverage.recordsWithAdmittedCandidates, 1);
  for (const eligibility of ['EXCLUDED', 'QUARANTINED', 'CONFLICTING', 'EMPTY_TEXT', 'UNREADABLE_TEXT'] as const) {
    const state = fixture(['Tôi đã dùng sản phẩm.']);
    const proposal: LiteralProjectionCoding = state.coding;
    proposal.units[0]!.eligibility = eligibility;
    assert.deepEqual(projectLiteralReviewCandidates(state.descriptor, proposal).candidates.i04, []);
  }
  const excluded = fixture(['Tôi đã dùng sản phẩm.']);
  excluded.descriptor.records[0]!.disposition = 'EXCLUDED';
  excluded.descriptor.records[0]!.dispositionReason = 'WRONG_LISTING';
  excluded.coding.records = structuredClone(excluded.descriptor.records);
  assert.deepEqual(projectLiteralReviewCandidates(excluded.descriptor, excluded.coding).candidates.i04, []);
  const mismatch = fixture(['Tôi đã dùng sản phẩm.']);
  mismatch.coding.records[0]!.locator = '/invented/comment';
  assert.throws(() => projectLiteralReviewCandidates(mismatch.descriptor, mismatch.coding), /LITERAL_PROJECTION_RECORDS_MISMATCH/);
  const span = fixture(['😀 Tôi đã dùng sản phẩm.']);
  span.coding.candidates.i04[0]!.span.quote = 'invented source';
  assert.throws(() => projectLiteralReviewCandidates(span.descriptor, span.coding), /LITERAL_PROJECTION_SOURCE_SPAN_MISMATCH/);
  const provenance = fixture(['Tôi đã dùng sản phẩm.']);
  provenance.coding.candidates.i04[0]!.provenance.basis = 'HUMAN_REVIEWED';
  assert.throws(() => projectLiteralReviewCandidates(provenance.descriptor, provenance.coding), /LITERAL_PROJECTION_PROVENANCE_INVALID/);
});
