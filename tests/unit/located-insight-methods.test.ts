import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildLocatedInsightMethods, validateLocatedInsightInput, verifyLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

type Input = LocatedInsightMethods['input'];
const provenance: Input['i04'][number]['provenance'] = {
  basis: 'DECLARED', coderRole: 'synthetic coder', adjudication: null, disagreement: null,
};
const unknown = { state: 'UNKNOWN' as const, span: null };
const absent = { state: 'NOT_STATED' as const, span: null };
function addRecord(input: Input, text: string): number {
  const index = input.records.length;
  input.records.push({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic account', timeText: null, disposition: 'INCLUDED', dispositionReason: null });
  return index;
}
function base(recordIndex: number) { return { recordIndex, provenance: { ...provenance }, qualifiers: [], counterevidence: [] }; }

test('I01 preserves exact owner declarations and UNSET fields without making them an upstream requirement', () => {
  const input = locatedInsightFixture();
  const recordIndex = addRecord(input, 'I tried to order A.');
  input.i04.push({ ...base(recordIndex), span: { start: 0, end: 18, quote: 'I tried to order A' }, eventKind: 'ATTEMPT_REPORTED', attribution: 'SELF_REPORTED' });
  assert.deepEqual(buildLocatedInsightMethods(input).output.sections.I01.unresolvedFields,
    ['questionText', 'decisionToInform', 'intendedAudience', 'scope', 'knownConstraints']);
  const unset = { state: 'UNSET' as const, text: null };
  input.brief = { version: 'owner-v1', questionText: { state: 'SUPPLIED', text: '  Which channel serves scope P?  ' },
    decisionToInform: unset, intendedAudience: { state: 'SUPPLIED', text: 'Owner' }, scope: unset,
    knownConstraints: { state: 'SUPPLIED', text: 'Existing sources only' }, selectedSectionIds: ['I04'] };
  const result = buildLocatedInsightMethods(input).output;
  assert.equal(result.input.brief!.questionText.text, '  Which channel serves scope P?  ');
  assert.deepEqual(result.sections.I01.unresolvedFields, ['decisionToInform', 'scope']);
  assert.equal(result.sections.I01.reviewState, 'DECLARED_NOT_AUTHENTICATED');
  assert.equal(result.sections.I04.locatedRecordCount, 1);
  input.brief.scope = { state: 'UNSET', text: 'all markets' };
  assert.throws(() => validateLocatedInsightInput(input), /OWNER_FIELD_STATE_MISMATCH/);
});

test('I02 and I05 retain source context, distinct missing states and clause polarity without treating matching text as people', () => {
  const input = locatedInsightFixture();
  const text = 'Before a trip, I liked the size, but did not like the taste, according to my friend.';
  addRecord(input, text); addRecord(input, text);
  input.records.push({ ...input.records[0]! });
  input.i02 = [{ ...base(0), role: unknown, situation: { state: 'SOURCE_STATED', span: locatedSpan(text, 'Before a trip') },
    task: absent, setting: { state: 'UNLOCATED', span: null }, time: { state: 'CONFLICTING', span: locatedSpan(text, 'Before a trip') } }];
  const attitude = (recordIndex: number, quote: string, polarity: 'POSITIVE' | 'NEGATIVE'): Input['i05'][number] => ({
    ...base(recordIndex), span: locatedSpan(text, quote), polarity, target: unknown,
    speakerAttribution: { state: 'SOURCE_STATED', span: locatedSpan(text, 'according to my friend') },
    qualifiers: [locatedSpan(text, 'did not'), locatedSpan(text, 'according to my friend')],
  });
  input.i05 = [attitude(0, 'I liked the size', 'POSITIVE'), attitude(0, 'did not like the taste', 'NEGATIVE'),
    attitude(1, 'I liked the size', 'POSITIVE'), attitude(2, 'I liked the size', 'POSITIVE')];
  const result = buildLocatedInsightMethods(input).output;
  assert.equal(result.sections.I05.locatedRecordCount, 2);
  assert.equal(result.sections.I05.annotationPointers.length, 3);
  assert.deepEqual(result.sections.I05.recordPolarities, [
    { recordPointer: '/input/records/0', polarity: 'MIXED' }, { recordPointer: '/input/records/1', polarity: 'POSITIVE' },
  ]);
  assert.equal(result.input.records[0]!.text, text);
  assert.deepEqual([result.input.i02[0]!.role.state, result.input.i02[0]!.task.state, result.input.i02[0]!.setting.state, result.input.i02[0]!.time.state],
    ['UNKNOWN', 'NOT_STATED', 'UNLOCATED', 'CONFLICTING']);
  assert.equal(result.sections.I05.semanticValidation, 'DECLARED_NOT_VERIFIED');
});

test('I06-I09 preserve exact same-record relation evidence, hearsay and negation; incomplete gaps stay incomplete', () => {
  const input = locatedInsightFixture();
  const text = 'First I tried to order A, but delivery was unavailable; then I chose B because my friend said it arrived sooner, not because of price. I need a small tablet, but this one is too large.';
  addRecord(input, text);
  const span = (quote: string) => locatedSpan(text, quote);
  const relation = (link: string) => ({ context: span(text), link: span(link) });
  input.i06 = [{ ...base(0), firstEvent: span('I tried to order A'), secondEvent: span('I chose B'), relation: relation('then') },
    { ...base(0), firstEvent: span('I tried to order A'), secondEvent: span('I chose B'), relation: null }];
  input.i07 = [{ ...base(0), choiceText: span('I chose B'), reasonClause: span('my friend said it arrived sooner'),
    relation: relation('because'), reasonFacet: 'ACCESS_AVAILABILITY', reasonPolarity: 'AFFIRMED', speakerBasis: 'OTHER_REPORTED', resultState: absent },
    { ...base(0), choiceText: span('I chose B'), reasonClause: span('not because of price'), relation: relation('not because'),
      reasonFacet: 'PRICE_COST', reasonPolarity: 'NEGATED', speakerBasis: 'SELF_STATED', resultState: absent }];
  input.i08 = [{ ...base(0), attemptedTask: span('I tried to order A'), obstacleClause: span('delivery was unavailable'),
    relation: relation('but'), barrierFacet: 'ACCESS_AVAILABILITY', resolutionState: unknown }];
  const gapLinkStart = text.indexOf('but this one');
  const gapRelation = { context: span('I need a small tablet, but this one is too large.'),
    link: { start: gapLinkStart, end: gapLinkStart + 3, quote: 'but' } };
  input.i09 = [{ ...base(0), desiredState: span('I need a small tablet'), currentState: span('this one is too large'), relation: gapRelation, workaround: absent },
    { ...base(0), desiredState: span('I need a small tablet'), currentState: null, relation: null, workaround: absent },
    { ...base(0), desiredState: null, currentState: span('this one is too large'), relation: null, workaround: absent }];
  const output = buildLocatedInsightMethods(input).output;
  assert.deepEqual(output.sections.I06.sequences, [{ annotationPointer: '/input/i06/0', sequenceBasis: 'SOURCE_EXPLICIT_SAME_RECORD', identityScope: 'RECORD_LOCAL', sequenceState: 'SOURCE_STATED_ORDER' }]);
  assert.ok(output.sections.I06.blockers.includes('I06_EVENT_ORDER_UNRESOLVED'));
  assert.deepEqual(output.sections.I09.candidates.map(row => [row.state, row.unmetNeedCandidate]),
    [['EXPLICIT_GAP', true], ['DESIRE_ONLY', false], ['CURRENT_STATE_ONLY', false]]);
  assert.deepEqual(output.input.i07.map(row => [row.reasonFacet, row.reasonPolarity, row.speakerBasis]),
    [['ACCESS_AVAILABILITY', 'AFFIRMED', 'OTHER_REPORTED'], ['PRICE_COST', 'NEGATED', 'SELF_STATED']]);
  assert.equal(output.input.i08[0]!.resolutionState.state, 'UNKNOWN');
  input.i08[0]!.relation.context = span('delivery was unavailable');
  assert.throws(() => buildLocatedInsightMethods(input), /RELATION_CONTEXT_EXCLUDES_EVIDENCE/);
});

test('pending AI and unresolved coder disagreements cannot become located coded examples through valid pointers', () => {
  const input = locatedInsightFixture();
  addRecord(input, 'I bought A.');
  const event: Input['i04'][number] = { ...base(0), span: { start: 0, end: 10, quote: 'I bought A' }, eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' };
  input.i04 = [{ ...event, provenance: { ...provenance, basis: 'PENDING_AI' } },
    { ...event, provenance: { ...provenance, basis: 'HUMAN_REVIEWED', adjudication: 'Compared coders', disagreement: 'Event remains disputed' } }];
  const output = buildLocatedInsightMethods(input).output;
  assert.equal(output.sections.I04.locatedRecordCount, 0);
  assert.deepEqual(output.sections.I04.annotationPointers, []);
  assert.deepEqual(output.sections.I04.pendingAnnotationPointers, ['/input/i04/0', '/input/i04/1']);
  assert.ok(output.sections.I04.blockers.includes('CODING_PENDING'));
});

test('normalized boundary rejects clipped quotes, unadopted codes, conflicting locators and unresolved cross-record spans', () => {
  const fixture = () => {
    const input = locatedInsightFixture();
    addRecord(input, '🙂 I tried A.'); addRecord(input, 'I bought B.');
    input.i04 = [{ ...base(0), span: { start: 3, end: 12, quote: 'I tried A' }, eventKind: 'ATTEMPT_REPORTED', attribution: 'SELF_REPORTED' }];
    return input;
  };
  const cases: { change: (input: Input) => void; error: RegExp }[] = [
    { change: input => { input.i04[0]!.span.quote = 'tried A'; }, error: /SPAN_QUOTE_MISMATCH/ },
    { change: input => { input.i04[0]!.span = { start: 0, end: 1, quote: '\uD83D' }; }, error: /SPAN_SPLITS_SURROGATE_PAIR/ },
    { change: input => { input.i04[0]!.recordIndex = 1; }, error: /SPAN_QUOTE_MISMATCH/ },
    { change: input => { input.records.push({ ...input.records[0]!, sourceAttribution: 'Changed source' }); }, error: /CONFLICTING_RECORD_REFERENCE/ },
    { change: input => { input.i04[0]!.eventKind = 'PURCHASE_INTENT' as Input['i04'][number]['eventKind']; }, error: /INVALID_LOCATED_INSIGHT_INPUT/ },
    { change: input => { input.i04.push({ ...input.i04[0]!, eventKind: 'NO_ACTION_EXPLICIT' }); }, error: /CONFLICTING_CLAUSE_CODE/ },
  ];
  for (const { change, error } of cases) {
    const input = fixture(); change(input);
    assert.throws(() => validateLocatedInsightInput(input), error);
  }
  const valid = fixture();
  assert.equal(buildLocatedInsightMethods(valid).output.sections.I04.locatedRecordCount, 1);
});

test('replay verifies computed content even when a forged result carries a matching recomputed identity', () => {
  const input = locatedInsightFixture();
  addRecord(input, 'I bought A.');
  input.i04 = [{ ...base(0), span: { start: 0, end: 10, quote: 'I bought A' }, eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }];
  const first = buildLocatedInsightMethods(input);
  assert.deepEqual(verifyLocatedInsightMethods(JSON.parse(first.bytes.toString())).bytes, first.bytes);
  const forged = JSON.parse(first.bytes.toString()) as LocatedInsightMethods;
  forged.sections.I04.locatedRecordCount = 8;
  const { methodOutputId: _prior, ...body } = forged;
  forged.methodOutputId = createHash('sha256').update(canonicalJson(body)).digest('hex');
  assert.throws(() => verifyLocatedInsightMethods(forged), /LOCATED_INSIGHT_REPLAY_MISMATCH/);
});
