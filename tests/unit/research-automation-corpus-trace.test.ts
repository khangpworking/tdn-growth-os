import assert from 'node:assert/strict';
import test from 'node:test';
import { projectCorpusTrace } from '../../src/modules/analysis/research-automation/corpus-trace-projection.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

function fixture(): Parameters<typeof projectCorpusTrace>[0] {
  const input = locatedInsightFixture();
  input.records = ['Tôi đã dùng sản phẩm. Tôi thích sản phẩm.', 'Tôi đã dùng sản phẩm nếu có dịp.', null].map((text, index) => ({
    sourceSha256: '1'.repeat(64), locator: `/${index}/comment`, sourceAttribution: 'Synthetic source', timeText: null,
    text, disposition: text === null ? 'UNREADABLE' : 'INCLUDED', dispositionReason: text === null ? 'UNREADABLE_TEXT' : null,
  }));
  input.records.push(structuredClone(input.records[0]!));
  return {
    sourcePackage: { packageId: 'synthetic', manifestArtifactSha256: '2'.repeat(64), packageContentSha256: '3'.repeat(64) },
    projectionSha256: '4'.repeat(64), policySha256: '5'.repeat(64),
    output: { methodOutputId: '6'.repeat(64), input }, projection: {
      admitted: [0, 3].flatMap(recordIndex => ([
        { family: 'I04' as const, candidateIndex: recordIndex, recordIndex, spans: [locatedSpan(input.records[0]!.text!, 'Tôi đã dùng sản phẩm')] },
        { family: 'I05' as const, candidateIndex: recordIndex, recordIndex, spans: [locatedSpan(input.records[0]!.text!, 'Tôi thích sản phẩm')] },
      ])),
      pending: [
        { family: 'I02', recordIndex: 0, reason: 'NO_RULE_MATCH', span: null, trigger: null },
        { family: 'I04', recordIndex: 1, reason: 'CONDITIONAL_SCOPE', span: null, trigger: null },
        { family: 'I05', recordIndex: 1, reason: 'NO_RULE_MATCH', span: null, trigger: null },
      ],
      blocked: [{ family: 'I04', candidateIndex: 1, recordIndex: 1, reasons: ['CONDITIONAL_SCOPE'], pendingIndexes: [1] }],
    },
  };
}

// Owns identity/overlap accounting. Persisted integration tests own admission and HTML/replay.
test('trace counts exact records separately from overlapping declaration families and pending items', () => {
  const input = fixture();
  const before = structuredClone(input);
  const trace = projectCorpusTrace(input);
  assert.deepEqual([trace.counts.inputRows, trace.counts.uniqueRecords, trace.counts.duplicateRows], [4, 3, 1]);
  assert.deepEqual([trace.counts.included, trace.counts.excluded, trace.counts.unreadable], [2, 0, 1]);
  assert.equal(trace.counts.admittedRecords, 1);
  assert.equal(trace.families.find(row => row.family === 'I04')!.admittedRecords, 1);
  assert.equal(trace.families.find(row => row.family === 'I05')!.admittedRecords, 1);
  assert.ok(trace.counts.admittedCandidates > trace.counts.admittedRecords);
  assert.ok(trace.counts.pendingItems > trace.counts.pendingRecords);
  assert.equal(trace.counts.blockedRecords, 1);
  assert.deepEqual(trace.records.map(row => row.inputIndexes), [[0, 3], [1], [2]]);
  assert.equal(trace.records[0]!.text, input.output.input.records[0]!.text);
  assert.deepEqual(input, before);
  assert.deepEqual(projectCorpusTrace(input), trace);
});

test('trace rejects conflicting source identities and out-of-universe candidate references', () => {
  const changed = fixture();
  changed.output.input.records[3]!.text = 'Different source content';
  assert.throws(() => projectCorpusTrace(changed), /conflicting records/);
  for (const field of ['admitted', 'pending', 'blocked'] as const) {
    const input = fixture();
    assert.ok(input.projection[field].length > 0);
    input.projection[field][0]!.recordIndex = input.output.input.records.length;
    assert.throws(() => projectCorpusTrace(input), /invalid record/, field);
  }
});
