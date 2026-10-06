import assert from 'node:assert/strict';
import test from 'node:test';
import { validateSemanticCodingResponse } from '../../src/modules/analysis/research-automation/semantic-coding-response.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

// Owns untrusted model-response boundaries. Persist/retry/report behavior lives in
// the existing exact-review integration journey, not another copy of this fixture.
test('semantic coding accepts only exact batch evidence and never imports claimed model approval', () => {
  const input = locatedInsightFixture();
  const text = '🙂 Tôi không mua vì hết hàng. Tôi đã dùng rồi.';
  input.records = [0, 1].map(index => ({ sourceSha256: '1'.repeat(64), locator: `/reviews/${index}`,
    text, sourceAttribution: 'synthetic source', timeText: null, disposition: 'INCLUDED' as const, dispositionReason: null }));
  const provenance = { basis: 'HUMAN_REVIEWED' as const, coderRole: 'model claims owner', adjudication: 'approved', disagreement: null };
  const value = { i02: [], i04: [{ recordIndex: 0, provenance, qualifiers: [], counterevidence: [],
    span: locatedSpan(text, 'không mua'), eventKind: 'NO_ACTION_EXPLICIT' as const, attribution: 'SELF_REPORTED' as const }],
    i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
  const before = structuredClone(input);
  const output = validateSemanticCodingResponse(value, input, [0]);
  assert.equal(output.i04![0]!.span.start, 7, 'UTF-16 offsets account for the emoji surrogate pair');
  assert.deepEqual(output.i04![0]!.provenance, { basis: 'PENDING_AI', coderRole: 'semantic-coding-model-v1', adjudication: null, disagreement: null });
  assert.deepEqual(input, before);
  assert.equal(value.i04[0]!.provenance.basis, 'HUMAN_REVIEWED', 'untrusted response is not modified in place');
  const uncertain = { ...value, i04: [{ ...value.i04[0]!, provenance: { ...provenance, disagreement: 'Speaker attribution unresolved' } }] };
  assert.equal(validateSemanticCodingResponse(uncertain, input, [0]).i04![0]!.provenance.disagreement, 'Speaker attribution unresolved');
  for (const change of [
    (v: typeof value) => { v.i04[0]!.recordIndex = 1; },
    (v: typeof value) => { v.i04[0]!.span.quote = 'tôi đã mua'; },
    (v: typeof value) => { v.i04[0]!.span.start--; },
  ]) {
    const bad = structuredClone(value); change(bad);
    assert.throws(() => validateSemanticCodingResponse(bad, input, [0]), TypeError);
  }
  assert.throws(() => validateSemanticCodingResponse({ ...value, ownerApproved: true }, input, [0]), TypeError);
  assert.throws(() => validateSemanticCodingResponse({ ...value, i02: undefined }, input, [0]), TypeError);
  assert.throws(() => validateSemanticCodingResponse(value, input, [0, 0]), TypeError);
  input.records[0]!.disposition = 'EXCLUDED'; input.records[0]!.dispositionReason = 'outside scope';
  assert.throws(() => validateSemanticCodingResponse(value, input, [0]), TypeError);
});

test('semantic corpus output cannot invent membership, codes, or completion outside the batch', () => {
  const input = locatedInsightFixture();
  const text = 'Tôi muốn nhỏ hơn.';
  input.records = [0, 1].map(index => ({ sourceSha256: '1'.repeat(64), locator: `/reviews/${index}`,
    text, sourceAttribution: 'synthetic source', timeText: null, disposition: 'INCLUDED' as const, dispositionReason: null }));
  input.corpora = [{ sectionId: 'I10', recordIndexes: [0, 1], question: 'What is stated?', unit: 'record', period: null,
    frame: null, channel: null, inclusionRule: 'both records', membershipComplete: true, multiCode: false,
    externalSampling: 'UNKNOWN', codebook: { revision: 'v1', codes: [{ code: 'SIZE', label: 'smaller', phrase: 'nhỏ hơn', firstRecordIndex: 0, firstSpan: locatedSpan(text, 'nhỏ hơn') }] },
    assignments: [], dispositions: [] }];
  const provenance = { basis: 'PENDING_AI' as const, coderRole: 'model', adjudication: null, disagreement: null };
  const coding = { corpusIndex: 0, assignments: [{ recordIndex: 0, code: 'SIZE', span: locatedSpan(text, 'nhỏ hơn'), provenance }],
    dispositions: [{ recordIndex: 0, state: 'CODED' as const, provenance }] };
  const value = { i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [coding] };
  const output = validateSemanticCodingResponse(value, input, [0]);
  assert.deepEqual(output.corpora[0]!.dispositions.map(row => row.recordIndex), [0]);
  assert.deepEqual(input.corpora[0]!.recordIndexes, [0, 1]);
  assert.throws(() => validateSemanticCodingResponse({ ...value, corpora: [coding, coding] }, input, [0]), TypeError);
  const outside = structuredClone(value); outside.corpora[0]!.dispositions[0]!.recordIndex = 1;
  assert.throws(() => validateSemanticCodingResponse(outside, input, [0]), TypeError);
  const invented = structuredClone(value); invented.corpora[0]!.assignments[0]!.code = 'INVENTED';
  assert.throws(() => validateSemanticCodingResponse(invented, input, [0]), TypeError);
});
