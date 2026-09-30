import assert from 'node:assert/strict';
import test from 'node:test';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { buildLocatedInsightMethods } from '../../src/modules/analysis/located-insight-methods.js';

type Input = LocatedInsightMethods['input'];
type Corpus = Input['corpora'][number];
type Provenance = Corpus['assignments'][number]['provenance'];
const sourceSha256 = '1'.repeat(64);
const reviewed = (): Provenance => ({ basis: 'HUMAN_REVIEWED', coderRole: 'synthetic coder', adjudication: 'Reviewed literal coding', disagreement: null });
const pending = (): Provenance => ({ basis: 'PENDING_AI', coderRole: 'synthetic suggestion', adjudication: null, disagreement: null });
const span = (quote: string) => ({ start: 0, end: quote.length, quote });

function fixture(): Input {
  const texts = ['packaging', 'packaging', 'taste', 'packaging and taste', 'no topic assigned'];
  const records: Input['records'] = texts.map((text, index) => ({
    sourceSha256, locator: `/records/${index}/text`, text, sourceAttribution: 'Synthetic source', timeText: 'January 2026',
    disposition: 'INCLUDED', dispositionReason: null,
  }));
  return {
    contractVersion: '1.0.0', codebookId: 'located-evidence-v1-draft',
    profileSha256: '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded',
    adoptionSha256: '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7',
    question: 'Which literal topics occur in the five supplied records?', inclusionRule: 'All five retained records',
    codingUnit: 'LOCATED_RECORD', adjudicationRule: 'Literal coding; unresolved mappings remain pending',
    sources: [{ logicalPath: 'synthetic-corpus.json', sha256: sourceSha256 }], records,
    brief: null, i02: [], i04: [], i05: [], i06: [], i07: [], i08: [], i09: [], i13Mentions: [],
    corpora: [{
      sectionId: 'I10', recordIndexes: [0, 1, 2, 3, 4], question: 'Which literal topics occur?',
      unit: 'source-native record', period: 'January 2026', frame: 'Five frozen source-native records', channel: 'synthetic text',
      inclusionRule: 'All five retained records', membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
      codebook: { revision: 'synthetic-corpus-v1', codes: [
        { code: 'T002', label: 'taste', phrase: 'taste', firstRecordIndex: null, firstSpan: null },
        { code: 'T001', label: 'packaging', phrase: 'packaging', firstRecordIndex: null, firstSpan: null },
        { code: 'T003', label: 'delivery', phrase: 'delivery', firstRecordIndex: null, firstSpan: null },
      ] },
      assignments: [
        { recordIndex: 3, code: 'T001', span: span('packaging'), provenance: reviewed() },
        { recordIndex: 0, code: 'T001', span: span('packaging'), provenance: reviewed() },
        { recordIndex: 1, code: 'T001', span: span('packaging'), provenance: reviewed() },
        { recordIndex: 2, code: 'T002', span: span('taste'), provenance: reviewed() },
        { recordIndex: 3, code: 'T002', span: { start: 14, end: 19, quote: 'taste' }, provenance: reviewed() },
      ],
      dispositions: records.map((_, recordIndex) => ({ recordIndex, state: recordIndex === 4 ? 'UNCODED' : 'CODED', provenance: reviewed() })),
    }],
  };
}

const summarize = (input: Input) => buildLocatedInsightMethods(input).output.sections[input.corpora[0]!.sectionId].corpora[0]!;

test('I10 hand-counted corpus retains frozen codebook order, five-record denominator and multi-code overlap', () => {
  const output = buildLocatedInsightMethods(fixture()).output;
  const corpus = output.sections.I10.corpora[0]!;
  assert.deepEqual(corpus.counts, [
    { code: 'T002', recordCount: 2, ratio: { numerator: 2, denominator: 5 }, annotationPointers: ['/input/corpora/0/assignments/3', '/input/corpora/0/assignments/4'] },
    { code: 'T001', recordCount: 3, ratio: { numerator: 3, denominator: 5 }, annotationPointers: ['/input/corpora/0/assignments/1', '/input/corpora/0/assignments/2', '/input/corpora/0/assignments/0'] },
    { code: 'T003', recordCount: 0, ratio: { numerator: 0, denominator: 5 }, annotationPointers: [] },
  ]);
  assert.equal(corpus.membershipCount, 5);
  assert.equal(corpus.includedRecordCount, 5);
  assert.equal(corpus.codedCount, 4);
  assert.equal(corpus.uncodedCount, 1);
  assert.equal(corpus.multiCodedCount, 1);
  assert.equal(corpus.codingComplete, true);
  assert.equal(corpus.ratioStatus, 'COMPLETE');
  assert.equal(output.input.corpora[0]!.externalSampling, 'UNKNOWN');
  assert.equal(output.sections.I10.countUnit, 'LOCATED_RECORDS');
  assert.equal(output.sections.I10.semanticValidation, 'DECLARED_NOT_VERIFIED');
});

test('pending suggestions, unresolved disagreement and missing coding retain membership but suppress every final ratio', () => {
  const cases: { label: string; change: (corpus: Corpus) => void; uncodedCount?: number }[] = [
    { label: 'AI code suggestion', change: corpus => { corpus.assignments.push({ recordIndex: 4, code: 'T001', span: span('no topic assigned'), provenance: pending() }); } },
    { label: 'AI uncoded disposition', change: corpus => { corpus.dispositions[4]!.provenance = pending(); } },
    { label: 'explicit pending disposition', change: corpus => { corpus.dispositions[4]!.state = 'PENDING'; } },
    { label: 'pending record with accepted codes', change: corpus => { corpus.dispositions[3]!.state = 'PENDING'; }, uncodedCount: 1 },
    { label: 'unresolved reviewed disposition', change: corpus => { corpus.dispositions[4]!.provenance.disagreement = 'Unresolved topic interpretation'; } },
    { label: 'missing disposition', change: corpus => { corpus.dispositions.pop(); } },
  ];
  for (const { label, change, uncodedCount = 0 } of cases) {
    const input = fixture();
    change(input.corpora[0]!);
    const result = summarize(input);
    assert.equal(result.membershipCount, 5, label);
    assert.equal(result.includedRecordCount, 5, label);
    assert.equal(result.pendingCount, 1, label);
    assert.equal(result.uncodedCount, uncodedCount, label);
    assert.equal(result.codingComplete, false, label);
    assert.equal(result.ratioStatus, 'PARTIAL', label);
    assert.deepEqual(result.counts.map(code => [code.recordCount, code.ratio]), [[2, null], [3, null], [0, null]], label);
    assert.ok(result.blockers.includes('CORPUS_CODING_PENDING'), label);
  }
  const reviewedUnclear = fixture();
  reviewedUnclear.corpora[0]!.dispositions[4]!.state = 'UNCLEAR';
  const result = summarize(reviewedUnclear);
  assert.equal(result.unclearCount, 1);
  assert.equal(result.uncodedCount, 0);
  assert.equal(result.pendingCount, 0);
  assert.equal(result.ratioStatus, 'COMPLETE');
  assert.deepEqual(result.counts[1]!.ratio, { numerator: 3, denominator: 5 });
});

test('exact locator repetitions collapse while identical text at distinct locators contributes independently', () => {
  const input = fixture();
  input.records.push(structuredClone(input.records[0]!));
  input.corpora[0]!.recordIndexes.push(5, 0);
  input.corpora[0]!.assignments.push({ recordIndex: 5, code: 'T001', span: span('packaging'), provenance: reviewed() });
  input.corpora[0]!.dispositions.push({ recordIndex: 5, state: 'CODED', provenance: reviewed() });
  const result = summarize(input);
  assert.equal(result.membershipCount, 5);
  assert.equal(result.duplicateReferenceCount, 2);
  assert.equal(result.includedRecordCount, 5);
  assert.equal(result.counts[1]!.recordCount, 3);
  assert.deepEqual(result.counts[1]!.ratio, { numerator: 3, denominator: 5 });
});

test('excluded and unreadable records remain in coverage without changing the eligible denominator', () => {
  const input = fixture();
  input.records.push(
    { ...input.records[0]!, locator: '/records/5/text', disposition: 'EXCLUDED', dispositionReason: 'Outside frozen period' },
    { ...input.records[0]!, locator: '/records/6/text', text: null, disposition: 'UNREADABLE', dispositionReason: 'Source text unavailable' },
  );
  input.corpora[0]!.recordIndexes.push(5, 6);
  const result = summarize(input);
  assert.equal(result.membershipCount, 7);
  assert.equal(result.includedRecordCount, 5);
  assert.equal(result.excludedCount, 1);
  assert.equal(result.unreadableCount, 1);
  assert.equal(result.pendingCount, 0);
  assert.deepEqual(result.counts[1]!.ratio, { numerator: 3, denominator: 5 });
  const empty = fixture();
  empty.corpora[0]!.recordIndexes = [];
  empty.corpora[0]!.assignments = [];
  empty.corpora[0]!.dispositions = [];
  const zero = summarize(empty);
  assert.equal(zero.includedRecordCount, 0);
  assert.equal(zero.ratioStatus, 'ZERO_DENOMINATOR');
  assert.deepEqual(zero.counts.map(code => [code.recordCount, code.ratio]), [[0, null], [0, null], [0, null]]);
});

test('an incomplete frozen frame, period or member inventory blocks ratios while accepted counts remain visible', () => {
  for (const missing of ['frame', 'period', 'membership'] as const) {
    const input = fixture();
    if (missing === 'membership') input.corpora[0]!.membershipComplete = false;
    else input.corpora[0]![missing] = null;
    const result = summarize(input);
    assert.equal(result.codingComplete, true, missing);
    assert.equal(result.ratioStatus, 'PARTIAL', missing);
    assert.deepEqual(result.counts.map(code => [code.recordCount, code.ratio]), [[2, null], [3, null], [0, null]], missing);
  }
});

test('corpus semantic references reject unknown codes, contradictory dispositions and forbidden multi-coding', () => {
  const cases: { change: (corpus: Corpus) => void; error: RegExp }[] = [
    { change: corpus => { corpus.assignments[0]!.code = 'NOT_IN_FROZEN_CODEBOOK'; }, error: /UNKNOWN_CODE_REFERENCE/ },
    { change: corpus => { corpus.assignments[0]!.code = 'NOT_IN_FROZEN_CODEBOOK'; corpus.assignments[0]!.provenance = pending(); }, error: /UNKNOWN_CODE_REFERENCE/ },
    { change: corpus => { corpus.recordIndexes.pop(); }, error: /DISPOSITION_RECORD_OUTSIDE_CORPUS/ },
    { change: corpus => { corpus.dispositions[4]!.state = 'CODED'; }, error: /CODED_WITHOUT_ACCEPTED_ASSIGNMENT/ },
    { change: corpus => { corpus.dispositions[0]!.state = 'UNCODED'; }, error: /UNCODED_DISPOSITION_WITH_ACCEPTED_ASSIGNMENT/ },
    { change: corpus => { corpus.multiCode = false; }, error: /MULTICODE_NOT_ALLOWED/ },
  ];
  for (const { change, error } of cases) {
    const input = fixture();
    change(input.corpora[0]!);
    assert.throws(() => buildLocatedInsightMethods(input), error);
  }
});

test('I13 keeps source-attributed negated brand mentions unranked and pending mentions separate', () => {
  const input = fixture();
  input.corpora[0]!.sectionId = 'I13';
  const text = 'A friend said Brand Q was not preferred.';
  input.records[4]!.text = text;
  input.records.push({ ...input.records[4]!, locator: '/records/5/text' });
  input.i13Mentions = [
    { recordIndex: 5, span: { start: 14, end: 21, quote: 'Brand Q' }, provenance: reviewed() },
    { recordIndex: 4, span: { start: 14, end: 21, quote: 'Brand Q' }, provenance: reviewed() },
    { recordIndex: 4, span: { start: 14, end: 21, quote: 'Brand Q' }, provenance: pending() },
  ];
  const output = buildLocatedInsightMethods(input).output;
  assert.deepEqual(output.sections.I13.mentionPointers, ['/input/i13Mentions/1', '/input/i13Mentions/0']);
  assert.deepEqual(output.sections.I13.pendingMentionPointers, ['/input/i13Mentions/2']);
  assert.ok(output.sections.I13.blockers.includes('I13_UNRANKED_MENTIONS_NO_PEER_OR_ENTITY_RESOLUTION'));
  assert.equal(output.input.records[4]!.text, text);
  assert.equal(output.input.records[5]!.text, text);
  assert.deepEqual(output.sections.I05.recordPolarities, []);
  assert.deepEqual(output.sections.I13.corpora[0]!.counts[1]!.ratio, { numerator: 3, denominator: 5 });
  input.corpora[0]!.channel = null;
  const missingChannel = summarize(input);
  assert.equal(missingChannel.ratioStatus, 'PARTIAL');
  assert.ok(missingChannel.blockers.includes('CORPUS_CHANNEL_MISSING'));
  assert.equal(missingChannel.counts[1]!.ratio, null);
});

test('I13 literal counts preserve spelling and reject inferred labels, aliases and unsupported first phrases', () => {
  const input = fixture();
  input.records = [
    { ...input.records[0]!, text: 'Brand Q is not preferred.' },
    { ...input.records[1]!, text: 'brand Q was mentioned.' },
  ];
  const corpus = input.corpora[0]!;
  corpus.sectionId = 'I13';
  corpus.recordIndexes = [0, 1];
  corpus.frame = 'Two frozen source records';
  corpus.codebook.codes = [
    { code: 'B1', label: 'Brand Q', phrase: 'Brand Q', firstRecordIndex: 0, firstSpan: span('Brand Q') },
    { code: 'B2', label: 'brand Q', phrase: 'brand Q', firstRecordIndex: 1, firstSpan: span('brand Q') },
  ];
  corpus.assignments = [
    { recordIndex: 0, code: 'B1', span: span('Brand Q'), provenance: reviewed() },
    { recordIndex: 1, code: 'B2', span: span('brand Q'), provenance: reviewed() },
  ];
  corpus.dispositions = [0, 1].map(recordIndex => ({ recordIndex, state: 'CODED', provenance: reviewed() }));
  const result = summarize(input);
  assert.deepEqual(result.counts.map(row => [row.code, row.recordCount, row.ratio]), [
    ['B1', 1, { numerator: 1, denominator: 2 }],
    ['B2', 1, { numerator: 1, denominator: 2 }],
  ]);
  const cases: { label: string; change: (corpus: Corpus) => void; error: RegExp }[] = [
    { label: 'inferred preference label', change: value => { value.codebook.codes[0]!.label = 'positive preference'; }, error: /I13_LITERAL_CODE_LABEL_REQUIRED/ },
    { label: 'case alias', change: value => { value.assignments[1]!.code = 'B1'; }, error: /I13_LITERAL_ASSIGNMENT_MISMATCH/ },
    { label: 'pending case alias', change: value => { value.assignments[1]!.code = 'B1'; value.assignments[1]!.provenance = pending(); }, error: /I13_LITERAL_ASSIGNMENT_MISMATCH/ },
    { label: 'whitespace alias', change: value => {
      const code = value.codebook.codes[0]!;
      code.phrase = 'Brand  Q'; code.label = 'Brand  Q'; code.firstRecordIndex = null; code.firstSpan = null;
    }, error: /I13_LITERAL_ASSIGNMENT_MISMATCH/ },
    { label: 'unrelated first phrase', change: value => {
      value.codebook.codes[0]!.firstRecordIndex = 1;
      value.codebook.codes[0]!.firstSpan = span('brand Q');
    }, error: /CODEBOOK_FIRST_PHRASE_MISMATCH/ },
  ];
  for (const { label, change, error } of cases) {
    const changed = structuredClone(input);
    change(changed.corpora[0]!);
    assert.throws(() => buildLocatedInsightMethods(changed), error, label);
  }
  for (const provenance of [reviewed(), pending()]) {
    const excluded = structuredClone(input);
    excluded.records[0]!.disposition = 'EXCLUDED';
    excluded.records[0]!.dispositionReason = 'Outside owner-selected corpus';
    excluded.i13Mentions = [{ recordIndex: 0, span: span('Brand Q'), provenance }];
    assert.throws(() => buildLocatedInsightMethods(excluded), /I13_MENTION_RECORD_NOT_INCLUDED/);
  }
});
