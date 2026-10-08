import { locatedInsightFixture, locatedSpan } from './located-insight-fixture.js';

/** Synthetic clauses cover each family without claiming semantic verification. */
export function nextInsightFixture() {
  const input = locatedInsightFixture();
  input.semanticsVersion = '1.1.0';
  const text = 'Before a trip, I liked the size but disliked the taste. First I tried to order A, but delivery was unavailable; then I chose B because it arrived sooner. I need a small tablet, but this one is too large.';
  input.records = [0, 1].map(index => ({ sourceSha256: '1'.repeat(64), locator: `/records/${index}/text`, text,
    sourceAttribution: 'Synthetic account', timeText: null, disposition: 'INCLUDED' as const, dispositionReason: null }));
  input.records.push({ ...input.records[0]! });
  const pending = { basis: 'PENDING_AI' as const, coderRole: 'synthetic coder', adjudication: null, disagreement: null };
  const absent = { state: 'NOT_STATED' as const, span: null };
  const span = (quote: string) => locatedSpan(text, quote);
  const base = (recordIndex: number) => ({ recordIndex, provenance: { ...pending }, qualifiers: [], counterevidence: [] });
  const relation = (link: string) => ({ context: span(text), link: span(link) });
  input.i02 = [{ ...base(0), role: absent, situation: { state: 'SOURCE_STATED', span: span('Before a trip') }, task: absent, setting: absent, time: absent }];
  input.i04 = [0, 1, 2].map(recordIndex => ({ ...base(recordIndex), span: span('I tried to order A'), eventKind: 'ATTEMPT_REPORTED', attribution: 'SELF_REPORTED' }));
  input.i05 = [{ ...base(0), span: span('I liked the size'), polarity: 'POSITIVE', target: absent, speakerAttribution: absent },
    { ...base(0), span: span('disliked the taste'), polarity: 'NEGATIVE', target: absent, speakerAttribution: absent },
    { ...base(1), span: span('I liked the size'), polarity: 'POSITIVE', target: absent, speakerAttribution: absent }];
  input.i06 = [{ ...base(0), firstEvent: span('I tried to order A'), secondEvent: span('I chose B'), relation: relation('then') },
    { ...base(1), firstEvent: span('I tried to order A'), secondEvent: span('I chose B'), relation: null }];
  input.i07 = [{ ...base(0), choiceText: span('I chose B'), reasonClause: span('it arrived sooner'), relation: relation('because'),
    reasonFacet: 'ACCESS_AVAILABILITY', reasonPolarity: 'AFFIRMED', speakerBasis: 'SELF_STATED', resultState: absent }];
  input.i08 = [{ ...base(0), attemptedTask: span('I tried to order A'), obstacleClause: span('delivery was unavailable'),
    relation: relation('but delivery'), barrierFacet: 'ACCESS_AVAILABILITY', resolutionState: absent }];
  input.i09 = [{ ...base(0), desiredState: span('I need a small tablet'), currentState: span('this one is too large'),
    relation: relation('but this'), workaround: absent },
    { ...base(1), desiredState: span('I need a small tablet'), currentState: null, relation: null, workaround: absent }];
  input.corpora = [{ sectionId: 'I10', recordIndexes: [0, 1, 2], question: 'Which literal clauses occur?', unit: 'source-native record',
    period: 'Synthetic frozen period', frame: 'Two distinct source locators', channel: 'synthetic review', inclusionRule: 'All supplied records',
    membershipComplete: true, multiCode: false, externalSampling: 'UNKNOWN',
    codebook: { revision: 'synthetic-v1', codes: [{ code: 'C1', label: 'size', phrase: 'size', firstRecordIndex: 0, firstSpan: span('size') }] },
    assignments: [0, 1, 2].map(recordIndex => ({ recordIndex, code: 'C1', span: span('size'), provenance: { ...pending } })),
    dispositions: [0, 1, 2].map(recordIndex => ({ recordIndex, state: 'CODED', provenance: { ...pending } })) }];
  return input;
}
