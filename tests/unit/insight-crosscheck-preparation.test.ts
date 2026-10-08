import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { blindedCrosscheckBatch, crosscheckEligibleRecords, literalCrosscheckRows, sampleCrosscheckRecords } from '../../src/modules/analysis/research-automation/insight-crosscheck-preparation.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';

const seed = 'a'.repeat(64);
function fixture(size: number) {
  const input = locatedInsightFixture();
  input.records = Array.from({ length: size }, (_, index) => ({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`,
    text: 'size and taste', sourceAttribution: 'Synthetic source', timeText: null, disposition: 'INCLUDED' as const, dispositionReason: null }));
  return input;
}

test('sampling freezes exact <=200/>200 membership and seed, excludes unreadable/excluded/textless, and preserves distinct identical-text locators', () => {
  for (const size of [0, 1, 199, 200]) assert.deepEqual(sampleCrosscheckRecords(fixture(size), seed), Array.from({ length: size }, (_, i) => i));
  const input = fixture(201), before = canonicalJson(input);
  const sampled = sampleCrosscheckRecords(input, seed);
  assert.equal(sampled.length, 200); assert.equal(new Set(sampled).size, 200);
  assert.deepEqual(sampleCrosscheckRecords(input, seed), sampled);
  assert.ok(sampled.every(index => crosscheckEligibleRecords(input).includes(index)));
  assert.equal(canonicalJson(input), before);
  assert.throws(() => sampleCrosscheckRecords(input, 'random'), /INVALID_CROSSCHECK_SEED/);
  const bounded = fixture(6);
  bounded.records[2]!.disposition = 'EXCLUDED'; bounded.records[2]!.dispositionReason = 'Synthetic exclusion';
  bounded.records[3]!.disposition = 'UNREADABLE'; bounded.records[3]!.dispositionReason = 'Synthetic unresolved admission';
  bounded.records[3]!.text = null;
  bounded.records[4]!.text = null; bounded.records[4]!.disposition = 'UNREADABLE'; bounded.records[4]!.dispositionReason = 'Synthetic missing text';
  bounded.records[5]!.text = ' ';
  bounded.records.push(structuredClone(bounded.records[0]!));
  assert.deepEqual(sampleCrosscheckRecords(bounded, seed), [0, 1], 'distinct locators remain distinct; duplicate pointer is one native source record');
  // Independent known hash-ranked membership verifies the algorithm rather than copying its implementation.
  const large = fixture(500);
  assert.equal(createHash('sha256').update(canonicalJson(sampleCrosscheckRecords(large, seed))).digest('hex'),
    'a27053d5dceac95b89e0460d35f5d0173cd05a382017ae3afbf1351c7b04c14b');
  assert.notDeepEqual(sampleCrosscheckRecords(large, 'b'.repeat(64)), sampleCrosscheckRecords(large, seed));
});

test('blinded batch keeps exact source bytes and code meanings but no first labels, disposition, example or trace fields', () => {
  const input = fixture(2), span = locatedSpan(input.records[0]!.text!, 'size');
  input.corpora = [{ sectionId: 'I10', recordIndexes: [0, 1], question: input.question!, unit: 'record', period: 'synthetic',
    frame: 'synthetic', channel: 'synthetic', inclusionRule: input.inclusionRule!, membershipComplete: true, multiCode: true,
    externalSampling: 'UNKNOWN', codebook: { revision: 'frozen-first-codebook', codes: [{ code: 'C1', label: 'size', phrase: 'size', firstRecordIndex: 0, firstSpan: span }] },
    assignments: [{ recordIndex: 0, code: 'C1', span, provenance: { basis: 'PENDING_AI', coderRole: 'first-model', adjudication: null, disagreement: 'Unresolved first interpretation' } }],
    dispositions: [{ recordIndex: 0, state: 'CODED', provenance: { basis: 'PENDING_AI', coderRole: 'first-model', adjudication: null, disagreement: null } }] }];
  const before = canonicalJson(input), batch = blindedCrosscheckBatch(input, [1]);
  assert.deepEqual(batch.records, [{ recordIndex: 1, sourceSha256: '1'.repeat(64), locator: '/records/1/text', text: 'size and taste' }]);
  assert.deepEqual(batch.corpora[0]!.codes, input.corpora[0]!.codebook.codes.map(({ code, label, phrase }) => ({ code, label, phrase })));
  assert.equal(batch.corpora[0]!.multiCode, true, 'retained multi-code declaration is not replaced');
  assert.equal(batch.codebookSha256, createHash('sha256').update(canonicalJson(input.corpora.map(c => c.codebook))).digest('hex'));
  const forbidden = new Set(['assignments', 'dispositions', 'firstRecordIndex', 'firstSpan', 'provenance', 'adjudication', 'disagreement', 'examples', 'trace', 'i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'i13Mentions']);
  function inspect(value: unknown) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) { assert.ok(!forbidden.has(key), `prediction leak: ${key}`); inspect(child); }
  }
  inspect(batch); assert.ok(!canonicalJson(batch).includes('first-model'));
  assert.equal(canonicalJson(input), before);
  assert.throws(() => blindedCrosscheckBatch(input, [0, 0]), /INVALID_CROSSCHECK_BATCH/);
  assert.throws(() => blindedCrosscheckBatch(input, [2]), /INVALID_CROSSCHECK_BATCH/);
  assert.throws(() => blindedCrosscheckBatch(fixture(101), Array.from({ length: 101 }, (_, i) => i)), /INVALID_CROSSCHECK_BATCH/);
});

test('literal appendix preserves first alias rows, exact array order and uncertainty without semantic alignment or reviewed negatives', () => {
  const input = nextInsightFixture();
  input.i05[0]!.provenance.disagreement = 'Synthetic unresolved target';
  const second = { i02: [], i04: [structuredClone(input.i04[0]!)], i05: [...input.i05].reverse(), i06: [], i07: [], i08: [], i09: [], i13Mentions: [],
    corpora: [{ corpusIndex: 0, assignments: [structuredClone(input.corpora[0]!.assignments[0]!)], dispositions: [] }] };
  const before = canonicalJson({ input, second });
  const rows = literalCrosscheckRows(input, sampleCrosscheckRecords(input, seed), second);
  assert.equal(rows.length, 2, 'same exact source pointer sampled once, distinct locator retained');
  assert.equal(rows[0]!.text, input.records[0]!.text);
  assert.equal(rows[0]!.locator, input.records[0]!.locator);
  assert.deepEqual(rows[0]!.first.i04!.map(row => row.recordIndex), [0, 2]);
  assert.deepEqual(rows[0]!.second.i04!.map(row => row.recordIndex), [0]);
  assert.deepEqual(rows[0]!.second.i05!, [second.i05[1], second.i05[2]]);
  assert.ok(rows[0]!.literalDifferences.includes('i05'), 'array ordering is retained as literal difference, never an aligned disagreement metric');
  assert.deepEqual(rows[0]!.second.corpora[0]!.dispositions, [], 'missing rows remain absent rather than reviewed negative');
  assert.equal(canonicalJson({ input, second }), before);
  assert.ok(canonicalJson(rows).includes('Synthetic unresolved target'));
  assert.ok(!canonicalJson(rows).includes('kappa'));
  assert.throws(() => literalCrosscheckRows(input, [0, 0], second), /INVALID_CROSSCHECK_SAMPLE/);
});
