import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceDefaultInsightRules, composeDefaultInsightInput, mergeInsightBatch } from '../../src/modules/analysis/research-automation/insight-default-coding.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';

test('source default freezes native membership and explicit scope without inventing taxonomy or approval', () => {
  const input = nextInsightFixture();
  input.corpora = [];
  input.records.push({ ...input.records[1]!, locator: '/records/3/text', text: '' });
  const original = structuredClone(input);
  const rules = sourceDefaultInsightRules(input);
  assert.equal(rules.corpora.length, 2);
  for (const corpus of rules.corpora) {
    assert.deepEqual(corpus.recordIndexes, [0, 1, 2, 3]);
    assert.deepEqual(corpus.codebook.codes, []);
    assert.deepEqual(corpus.assignments, []);
    assert.deepEqual(corpus.dispositions, []);
    assert.equal(corpus.multiCode, false);
  }
  assert.deepEqual(input, original);
  const composed = composeDefaultInsightInput(input, rules);
  assert.deepEqual(composed.records, input.records);
  assert.deepEqual(composed.i05, []);
});

test('explicit subset and incomplete corpus scope/code meanings remain exact; default never expands or completes them', () => {
  const input = nextInsightFixture(), explicit = input.corpora[0]!;
  explicit.recordIndexes = [1]; explicit.assignments = [explicit.assignments[1]!]; explicit.dispositions = [explicit.dispositions[1]!];
  explicit.codebook.codes[0]!.firstRecordIndex = 1;
  explicit.question = 'Only this retained subset?'; explicit.unit = 'declared coding unit'; explicit.membershipComplete = false;
  explicit.inclusionRule = 'Only locator one'; explicit.multiCode = true;
  const original = structuredClone(input), rules = sourceDefaultInsightRules(input);
  assert.deepEqual(rules.corpora[0], { ...explicit, assignments: [], dispositions: [] });
  assert.deepEqual(rules.corpora[0]!.recordIndexes, [1]);
  assert.equal(rules.corpora[0]!.membershipComplete, false); assert.equal(rules.corpora[0]!.multiCode, true);
  assert.deepEqual(rules.corpora[0]!.codebook, explicit.codebook);
  assert.deepEqual(rules.corpora[1]!.recordIndexes, [0, 1, 2], 'only absent I13 derives full included source membership');
  const composed = composeDefaultInsightInput(input, rules);
  assert.deepEqual(composed.records, original.records); assert.deepEqual(input, original);
  composed.draftCountsVersion = 'draft-counts-v2';
  const corpus = buildLocatedInsightMethods(composed).output.sections.I10.corpora[0]!;
  assert.equal(corpus.membershipCount, 1); assert.equal(corpus.codingComplete, false);
  assert.equal(corpus.ratioStatus, 'PARTIAL');
  assert.ok(corpus.blockers.includes('CORPUS_MEMBERSHIP_INCOMPLETE'));
  assert.ok(corpus.counts.every(count => count.ratio === null));
  assert.throws(() => composeDefaultInsightInput(input, rules, { i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [],
    corpora: [{ corpusIndex: 0, assignments: [explicit.assignments[0]!].map(row => ({ ...row, recordIndex: 0 })), dispositions: [] }] }), /ASSIGNMENT_RECORD_OUTSIDE_CORPUS/);
});

test('default batch replacement retains previous other records and never expands membership', () => {
  const input = nextInsightFixture();
  const annotations = { i02: input.i02, i04: input.i04, i05: input.i05, i06: input.i06, i07: input.i07,
    i08: input.i08, i09: input.i09, i13Mentions: input.i13Mentions, corpora: [] };
  const empty = { i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [], corpora: [] };
  const merged = mergeInsightBatch(empty, annotations, [0]);
  assert.deepEqual(merged.i04?.map(row => row.recordIndex), [1, 2]);
  assert.equal(merged.i05?.length, 1);
  assert.equal(annotations.i04?.length, 3);
});
