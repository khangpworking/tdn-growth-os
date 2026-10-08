import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sourceDefaultInsightRules, composeDefaultInsightInput, mergeInsightBatch } from '../../src/modules/analysis/research-automation/insight-default-coding.js';
import { nextInsightFixture } from '../helpers/next-insight-fixture.js';

test('source default freezes native membership and explicit scope without inventing taxonomy or approval', () => {
  const input = nextInsightFixture();
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
