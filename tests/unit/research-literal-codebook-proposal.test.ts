import assert from 'node:assert/strict';
import test from 'node:test';
import { proposeLiteralCodebook } from '../../src/modules/analysis/research-automation/literal-codebook-proposal.js';
import { validateLocatedInsightInput, buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';
import { projectSelectedInsightCandidates } from '../../src/modules/analysis/research-automation/selected-insight-projection.js';
import { locatedInsightFixture } from '../helpers/located-insight-fixture.js';

test('literal proposals preserve exact occurrences and full membership without inventing a negative disposition or a semantic relation', () => {
  for (const phrase of ['thạch dừa', 'bình giữ nhiệt', 'quạt cầm tay']) {
    const input = locatedInsightFixture();
    const text = `😀 Không chọn ${phrase}; bạn nói ${phrase} tốt. ${phrase.toUpperCase()}`;
    input.records = [text, 'Không nhắc đến.', null, phrase].map((text, index) => ({
      sourceSha256: input.sources[0]!.sha256, locator: `/records/${index}`, text, sourceAttribution: 'Synthetic', timeText: null,
      disposition: index === 2 ? 'UNREADABLE' as const : index === 3 ? 'EXCLUDED' as const : 'INCLUDED' as const,
      dispositionReason: index < 2 ? null : 'Synthetic exclusion',
    }));
    input.records.push(structuredClone(input.records[0]!));
    input.corpora = [{ sectionId: 'I13', recordIndexes: [0, 1, 2, 3, 4, 0], question: 'Literal references only', unit: 'source record',
      period: 'Synthetic window', frame: 'Retained records', channel: 'Synthetic', inclusionRule: 'Included records', membershipComplete: true,
      multiCode: true, externalSampling: 'UNKNOWN', codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: null, firstSpan: null }] },
      assignments: [], dispositions: [] }];
    validateLocatedInsightInput(input);
    const before = structuredClone(input);
    const annotations = proposeLiteralCodebook(input);
    const coding = annotations.corpora[0]!;
    assert.deepEqual(coding.assignments.map(row => row.span.start), [text.indexOf(phrase), text.indexOf(phrase, text.indexOf(phrase) + 1)]);
    assert.ok(coding.assignments.every(row => row.span.quote === phrase && row.provenance.basis === 'PENDING_AI'));
    assert.deepEqual(coding.dispositions.map(row => [row.recordIndex, row.state]), [[0, 'CODED'], [1, 'PENDING']]);
    assert.equal(annotations.i13Mentions.length, 2);
    assert.deepEqual(annotations.i06, []); assert.deepEqual(annotations.i09, []);
    assert.deepEqual(input, before);
    const composed = { ...input, i13Mentions: annotations.i13Mentions,
      corpora: input.corpora.map((corpus, index) => ({ ...corpus, assignments: annotations.corpora[index]!.assignments, dispositions: annotations.corpora[index]!.dispositions })) };
    const unaccepted = buildLocatedInsightMethods(composed).output.sections.I13;
    assert.equal(unaccepted.mentionPointers.length, 0);
    assert.equal(unaccepted.corpora[0]!.counts[0]!.recordCount, 0);
    assert.equal(unaccepted.corpora[0]!.pendingCount, 2);
    const selected = projectSelectedInsightCandidates(composed, { contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [0, 1],
      corpora: [{ corpusIndex: 0, assignments: [0, 1], dispositions: [0] }] }).output.sections.I13;
    assert.equal(selected.corpora[0]!.counts[0]!.recordCount, 1, 'two mentions and duplicate source rows are one located record, never two people');
    assert.equal(selected.corpora[0]!.counts[0]!.ratio, null, 'unmatched record is still pending');
    assert.equal(selected.corpora[0]!.excludedCount, 1); assert.equal(selected.corpora[0]!.unreadableCount, 1);
    assert.deepEqual(proposeLiteralCodebook(input, annotations), annotations, 'rerunning exact matching does not duplicate candidates');
  }
});

test('literal proposal append preserves prior annotations and leaves competing single-code matches pending', () => {
  const input = locatedInsightFixture();
  input.records = [{ sourceSha256: input.sources[0]!.sha256, locator: '/records/0', text: 'pin và quạt', sourceAttribution: 'Synthetic',
    timeText: null, disposition: 'INCLUDED', dispositionReason: null }];
  input.corpora = [{ sectionId: 'I10', recordIndexes: [0], question: 'Literal candidate discovery', unit: 'record', period: null, frame: null, channel: null,
    inclusionRule: 'Included', membershipComplete: true, multiCode: false, externalSampling: 'UNKNOWN',
    codebook: { revision: 'v1', codes: ['pin', 'quạt'].map(phrase => ({ code: phrase, label: phrase, phrase, firstRecordIndex: null, firstSpan: null })) }, assignments: [], dispositions: [] }];
  const first = proposeLiteralCodebook(input);
  first.i09.push({ recordIndex: 0, provenance: { basis: 'DECLARED', coderRole: 'synthetic author', adjudication: null, disagreement: null },
    qualifiers: [], counterevidence: [], desiredState: { start: 0, end: 3, quote: 'pin' }, currentState: null, relation: null, workaround: { state: 'NOT_STATED', span: null } });
  const original = structuredClone(first);
  const next = proposeLiteralCodebook(input, first);
  assert.deepEqual(first, original); assert.deepEqual(next, original);
  assert.equal(next.corpora[0]!.assignments.length, 2);
  const composed = { ...input, corpora: input.corpora.map((c, i) => ({ ...c, assignments: next.corpora[i]!.assignments, dispositions: next.corpora[i]!.dispositions })) };
  assert.equal(buildLocatedInsightMethods(composed).output.sections.I10.corpora[0]!.pendingCount, 1);
  assert.throws(() => projectSelectedInsightCandidates(composed, { contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [],
    corpora: [{ corpusIndex: 0, assignments: [0, 1], dispositions: [0] }] }), /MULTICODE_NOT_ALLOWED/);
  input.records[0]!.text = 'pin '.repeat(10_001);
  assert.throws(() => proposeLiteralCodebook(input), /INSIGHT_LITERAL_PROPOSAL_TOO_LARGE/, 'over-limit generation fails rather than silently dropping later occurrences');
});
