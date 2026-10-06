import assert from 'node:assert/strict';
import test from 'node:test';
import type { AutomationInsightSelection } from '../../contracts/analysis/automation-insight-selection.generated.js';
import type { LocatedInsightMethods } from '../../contracts/analysis/located-insight-methods.generated.js';
import { projectSelectedInsightCandidates } from '../../src/modules/analysis/research-automation/selected-insight-projection.js';
import { locatedInsightFixture, locatedSpan } from '../helpers/located-insight-fixture.js';

type Input = LocatedInsightMethods['input'];
const declared = (): Input['i06'][number]['provenance'] => ({ basis: 'DECLARED', coderRole: 'synthetic proposer', adjudication: null, disagreement: null });

function fixture(product = 'bình giữ nhiệt'): Input {
  const input = locatedInsightFixture();
  const texts = [`Tôi xem nhãn rồi mua ${product}. Muốn nhỏ hơn nhưng hiện còn to.`, `Tôi muốn ${product} nhỏ hơn.`, 'Không nêu chủ đề.'];
  input.records = texts.map((text, index) => ({ sourceSha256: input.sources[0]!.sha256, locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic self-report', timeText: null, disposition: 'INCLUDED', dispositionReason: null }));
  const span = (index: number, quote: string) => locatedSpan(texts[index]!, quote);
  input.i06 = [{ recordIndex: 0, provenance: declared(), qualifiers: [span(0, 'hiện')], counterevidence: [span(0, 'còn to')],
    firstEvent: span(0, 'xem nhãn'), secondEvent: span(0, `mua ${product}`), relation: { context: span(0, texts[0]!), link: span(0, 'rồi') } }];
  input.i09 = [
    { recordIndex: 0, provenance: declared(), qualifiers: [span(0, 'hiện')], counterevidence: [span(0, 'còn to')],
      desiredState: span(0, 'nhỏ hơn'), currentState: span(0, 'còn to'), relation: { context: span(0, texts[0]!), link: span(0, 'nhưng') }, workaround: { state: 'NOT_STATED', span: null } },
    { recordIndex: 1, provenance: declared(), qualifiers: [], counterevidence: [], desiredState: span(1, 'nhỏ hơn'), currentState: null,
      relation: null, workaround: { state: 'NOT_STATED', span: null } },
  ];
  input.i13Mentions = [0, 1].map(recordIndex => ({ recordIndex, span: span(recordIndex, product), provenance: declared() }));
  input.corpora = (['I10', 'I13'] as const).map(sectionId => {
    const phrase = sectionId === 'I10' ? 'nhỏ hơn' : product;
    return { sectionId, recordIndexes: [0, 1, 2, 0], question: 'Which literal references occur?', unit: 'source-native record',
      period: 'Synthetic retained sample, January 2026', frame: 'Three exact records', channel: 'synthetic review', inclusionRule: 'All retained records',
      membershipComplete: true, multiCode: true, externalSampling: 'UNKNOWN',
      codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: phrase, phrase, firstRecordIndex: 0, firstSpan: span(0, phrase) }] },
      assignments: [0, 1].map(recordIndex => ({ recordIndex, code: 'C1', span: span(recordIndex, phrase), provenance: declared() })),
      dispositions: [0, 1, 2].map(recordIndex => ({ recordIndex, state: recordIndex === 2 ? 'UNCODED' as const : 'CODED' as const, provenance: declared() })),
    };
  });
  return input;
}

function all(): AutomationInsightSelection {
  return { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [0, 1], i13Mentions: [0, 1],
    corpora: [0, 1].map(corpusIndex => ({ corpusIndex, assignments: [0, 1], dispositions: [0, 1, 2] })) };
}

test('selected four-family projection retains full evidence and pending coverage before allowing independently counted n/N', () => {
  for (const product of ['thạch dừa', 'bình giữ nhiệt', 'quạt cầm tay']) {
    const proposal = fixture(product);
    const original = structuredClone(proposal);
    const partial: AutomationInsightSelection = { contractVersion: 'automation-insight-selection-v1', i06: [0], i09: [1], i13Mentions: [],
      corpora: [{ corpusIndex: 0, assignments: [0], dispositions: [0] }] };
    const output = projectSelectedInsightCandidates(proposal, partial).output;
    assert.deepEqual(proposal, original, 'projection never modifies the retained proposal');
    assert.deepEqual(output.input.records, original.records);
    assert.deepEqual(output.input.sources, original.sources);
    assert.deepEqual(output.input.i06[0]!.qualifiers, original.i06[0]!.qualifiers);
    assert.deepEqual(output.input.i06[0]!.counterevidence, original.i06[0]!.counterevidence);
    assert.equal(output.sections.I06.sequences[0]!.identityScope, 'RECORD_LOCAL');
    assert.deepEqual(output.sections.I09.candidates.map(row => [row.state, row.unmetNeedCandidate]), [['DESIRE_ONLY', false]]);
    assert.deepEqual(output.sections.I09.pendingAnnotationPointers, ['/input/i09/0']);
    assert.equal(output.sections.I13.mentionPointers.length, 0, 'unselected declarations cannot leak into results');
    for (const [index, section] of (['I10', 'I13'] as const).entries()) {
      const corpus = output.sections[section].corpora[0]!;
      assert.deepEqual(output.input.corpora[index]!.recordIndexes, [0, 1, 2, 0]);
      assert.deepEqual(output.input.corpora[index]!.codebook, original.corpora[index]!.codebook);
      assert.equal(corpus.membershipCount, 3);
      assert.equal(corpus.duplicateReferenceCount, 1);
      assert.equal(corpus.includedRecordCount, 3);
      assert.equal(corpus.pendingCount, index === 0 ? 2 : 3);
      assert.equal(corpus.counts[0]!.recordCount, index === 0 ? 1 : 0);
      assert.equal(corpus.counts[0]!.ratio, null);
    }
    const complete = projectSelectedInsightCandidates(proposal, all());
    assert.deepEqual(complete.output.sections.I09.candidates.map(row => row.state), ['EXPLICIT_GAP', 'DESIRE_ONLY']);
    assert.equal(complete.output.sections.I13.mentionPointers.length, 2);
    for (const section of ['I10', 'I13'] as const) {
      const corpus = complete.output.sections[section].corpora[0]!;
      assert.equal(corpus.pendingCount, 0);
      assert.equal(corpus.uncodedCount, 1);
      assert.deepEqual(corpus.counts[0]!.ratio, { numerator: 2, denominator: 3 });
    }
    const reordered = all();
    reordered.i09.reverse(); reordered.i13Mentions.reverse(); reordered.corpora.reverse();
    reordered.corpora.forEach(corpus => { corpus.assignments.reverse(); corpus.dispositions.reverse(); });
    assert.deepEqual(projectSelectedInsightCandidates(proposal, reordered).bytes, complete.bytes);
    assert.equal(complete.output.sections.I10.semanticValidation, 'DECLARED_NOT_VERIFIED');
    assert.deepEqual(proposal, original);
  }
});

test('selected pending suggestions remain declarations and cannot bypass missing frame or pending coding', () => {
  const proposal = fixture();
  proposal.i06[0]!.provenance.basis = 'PENDING_AI';
  proposal.corpora[0]!.period = null;
  const selection = all();
  selection.corpora[0]!.assignments = [0];
  const result = projectSelectedInsightCandidates(proposal, selection).output;
  assert.equal(result.input.i06[0]!.provenance.basis, 'DECLARED');
  assert.equal(result.input.i06[0]!.provenance.adjudication, null, 'a projection does not manufacture human approval');
  assert.equal(proposal.i06[0]!.provenance.basis, 'PENDING_AI');
  assert.equal(result.sections.I10.corpora[0]!.pendingCount, 1, 'selected CODED cannot hide an unselected assignment');
  assert.ok(result.sections.I10.corpora[0]!.blockers.includes('CORPUS_PERIOD_MISSING'));
  assert.equal(result.sections.I10.corpora[0]!.counts[0]!.ratio, null);
});

test('v2 can select only a semantic family while v1 retains its historical literal-source meaning', () => {
  const proposal = fixture();
  proposal.i04 = [{ recordIndex: 0, provenance: declared(), qualifiers: [], counterevidence: [],
    span: locatedSpan(proposal.records[0]!.text!, 'mua bình giữ nhiệt'), eventKind: 'ACTION_REPORTED', attribution: 'SELF_REPORTED' }];
  const selection: AutomationInsightSelection = { contractVersion: 'automation-insight-selection-v2', i02: [], i04: [0], i05: [], i07: [], i08: [], i06: [], i09: [], i13Mentions: [], corpora: [] };
  const chosen = projectSelectedInsightCandidates(proposal, selection).output;
  assert.equal(chosen.sections.I04.locatedRecordCount, 1);
  assert.equal(chosen.sections.I06.locatedRecordCount, 0);
  const unselected = projectSelectedInsightCandidates(proposal, { ...selection, i04: [], i06: [0] }).output;
  assert.equal(unselected.sections.I04.locatedRecordCount, 0);
  assert.deepEqual(unselected.sections.I04.pendingAnnotationPointers, ['/input/i04/0']);
  assert.equal(projectSelectedInsightCandidates(proposal, all()).output.sections.I04.locatedRecordCount, 1, 'old receipts never changed the literal-source projection');
  for (const invalid of [
    { ...selection, i04: [1] }, { ...selection, i04: [0, 0] },
    { ...selection, contractVersion: 'automation-insight-selection-v1' },
    { contractVersion: 'automation-insight-selection-v2', i04: [0], i06: [], i09: [], i13Mentions: [], corpora: [] },
  ]) assert.throws(() => projectSelectedInsightCandidates(proposal, invalid), /INVALID_CONTRACT|INDEX_OUT_OF_RANGE/);
});

test('invalid or contradictory selections fail instead of changing evidence or silently accepting another index', () => {
  const cases: Array<{ name: string; change: (input: Input, selection: AutomationInsightSelection) => unknown; error: RegExp }> = [
    { name: 'extra field', change: (_, s) => ({ ...s, approved: true }), error: /INVALID_CONTRACT/ },
    { name: 'duplicate annotation', change: (_, s) => { s.i06.push(0); return s; }, error: /INVALID_CONTRACT/ },
    { name: 'missing annotation', change: (_, s) => { s.i06 = [1]; return s; }, error: /INDEX_OUT_OF_RANGE/ },
    { name: 'missing corpus', change: (_, s) => { s.corpora[0]!.corpusIndex = 2; return s; }, error: /INDEX_OUT_OF_RANGE/ },
    { name: 'missing assignment', change: (_, s) => { s.corpora[0]!.assignments = [2]; return s; }, error: /INDEX_OUT_OF_RANGE/ },
    { name: 'duplicate corpus', change: (_, s) => { s.corpora.push(structuredClone(s.corpora[0]!)); return s; }, error: /DUPLICATE_CORPUS_SELECTION/ },
    { name: 'unresolved journey', change: (p, s) => { p.i06[0]!.provenance.disagreement = 'Sequence contested'; return s; }, error: /UNRESOLVED_DISAGREEMENT/ },
    { name: 'unresolved assignment', change: (p, s) => { p.corpora[0]!.assignments[0]!.provenance.disagreement = 'Code contested'; return s; }, error: /UNRESOLVED_DISAGREEMENT/ },
    { name: 'pending is not final', change: (p, s) => { p.corpora[0]!.dispositions[0]!.state = 'PENDING'; return s; }, error: /PENDING_DISPOSITION/ },
    { name: 'empty selection', change: () => ({ contractVersion: 'automation-insight-selection-v1', i06: [], i09: [], i13Mentions: [], corpora: [] }), error: /EMPTY_SELECTION/ },
    { name: 'contradictory disposition', change: (p, s) => { p.corpora[0]!.dispositions[0]!.state = 'UNCODED'; return s; }, error: /UNCODED_DISPOSITION_WITH_ACCEPTED_ASSIGNMENT/ },
    { name: 'invented quote', change: (p, s) => { p.i06[0]!.firstEvent.quote = 'fabricated'; return s; }, error: /SPAN_QUOTE_MISMATCH/ },
  ];
  for (const example of cases) {
    const proposal = fixture();
    const selection = example.change(proposal, all());
    const before = structuredClone(proposal);
    assert.throws(() => projectSelectedInsightCandidates(proposal, selection), example.error, example.name);
    assert.deepEqual(proposal, before, example.name);
  }
});
