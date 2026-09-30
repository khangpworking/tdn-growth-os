import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { DescriptiveMarketMethods } from '../../contracts/analysis/descriptive-market-methods.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import {
  buildDescriptiveMarketMethods, validateDescriptiveMarketInput, verifyDescriptiveMarketMethods,
} from '../../src/modules/analysis/descriptive-market-methods.js';

type Input = DescriptiveMarketMethods['input'];
type Observation = Input['m05'][number];
const sourceSha256 = '1'.repeat(64);
const configSha256 = '2'.repeat(64);
const ref = (locator: string, sha256 = sourceSha256) => ({ sourceSha256: sha256, locator });
const scope: Input['scope'] = {
  universe: 'Source-declared store partitions', geography: 'Synthetic area', frame: 'January source table',
  inclusionRule: 'All declared member keys', exclusionRule: 'None', variantRule: 'Same source-defined event unit',
};
const period = { start: '2026-01-01', end: '2026-01-31', timezone: 'Asia/Bangkok', basis: 'source reporting month' };

function observation(row: number, value: string): Observation {
  return {
    source: ref(`table/rows/${row}/searchEvents`), sourceWording: `${value} reported search events`, entityLabel: null,
    measureLiteral: 'Reported searches', measureDefinition: 'Count of source-defined search events', unit: 'search events',
    period: { ...period }, scope: { ...scope },
    observation: { state: value === '0' ? 'observed_zero' : 'observed_value', value, precision: 'exact' },
    aggregation: {
      additive: true, aggregationUnit: 'source store partition', sourceKeyNamespace: 'synthetic-source/store-partition',
      members: [{ sourceKey: `store-${row}`, source: ref(`table/rows/${row}/storeKey`) }],
      requiredMemberKeys: ['store-1', 'store-2'], proof: ref('/definitions/search-count-membership'),
    },
  };
}

function fixture(): Input {
  return {
    contractVersion: '1.0.0',
    sourcePackage: {
      packageId: '00000000-0000-4000-8000-000000000001', version: 1,
      manifestArtifactSha256: '3'.repeat(64), packageContentSha256: '4'.repeat(64),
    },
    sources: [
      { logicalPath: 'source.json', sha256: sourceSha256, evidenceFamily: 'source table', providerProvenance: 'synthetic' },
      { logicalPath: 'run-config.json', sha256: configSha256, evidenceFamily: 'owner declaration', providerProvenance: 'synthetic' },
    ],
    configuration: {
      profileId: 'source-bound-descriptive-market-v1', profileVersion: '1.0.0', policyRevision: 'synthetic-v1',
      profileSha256: '5'.repeat(64), adoptionSha256: '6'.repeat(64), runConfiguration: ref('/run', configSha256),
    },
    question: 'What does the supplied source state?', scope: { ...scope },
    m05: [observation(1, '12'), observation(2, '8')], m06: [], m07: [], peerSet: null, m09: [],
  };
}

test('M05 exact subtotals retain literal measures, decimal precision and integers above floating-point precision', () => {
  const input = fixture();
  const twenty = buildDescriptiveMarketMethods(input).output.sections.M05.partitions[0]!;
  assert.equal(twenty.subtotal, '20');
  assert.equal(twenty.measureLiteral, 'Reported searches');
  assert.equal(twenty.complete, true);
  input.m05[0]!.observation.value = '9007199254740993.10';
  input.m05[1]!.observation.value = '0.20';
  const exact = buildDescriptiveMarketMethods(input).output.sections.M05.partitions[0]!;
  assert.equal(exact.subtotal, '9007199254740993.30');
  assert.deepEqual(exact.coverage, { observedCount: 2, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0 });
});

test('M05 rejects additive overlap and incompatible membership declarations while retaining located rows', () => {
  const cases: { change: (input: Input) => void; blocker: string }[] = [
    { change: input => { input.m05[1]!.aggregation = null; }, blocker: 'ADDITIVITY_UNDECLARED' },
    { change: input => { input.m05[1]!.aggregation!.members[0]!.sourceKey = 'store-1'; }, blocker: 'AGGREGATION_OVERLAP_UNRESOLVED' },
    { change: input => { input.m05[1]!.aggregation!.members[0]!.source = ref('table/rows/1/storeKey'); }, blocker: 'AGGREGATION_OVERLAP_UNRESOLVED' },
    { change: input => { input.m05[1]!.aggregation!.aggregationUnit = 'store plus subsidiary'; }, blocker: 'AGGREGATION_FRAME_INCOMPATIBLE' },
    { change: input => { input.m05[1]!.aggregation!.requiredMemberKeys = ['store-2']; }, blocker: 'AGGREGATION_FRAME_INCOMPATIBLE' },
    { change: input => { input.m05[1]!.observation.precision = 'non_exact'; }, blocker: 'NON_EXACT_VALUE' },
  ];
  for (const { change, blocker } of cases) {
    const input = fixture();
    change(input);
    const section = buildDescriptiveMarketMethods(input).output.sections.M05;
    assert.equal(section.locatedRecordCount, 2, blocker);
    assert.equal(section.partitions[0]!.subtotal, null, blocker);
    assert.ok(section.partitions[0]!.blockers.includes(blocker as typeof section.blockers[number]), blocker);
  }
});

test('M05 keeps missing, UNKNOWN and observed zero distinct and marks partial membership', () => {
  const input = fixture();
  input.m05 = [observation(1, '0'), observation(2, '8'), observation(3, '1')];
  for (const row of input.m05) row.aggregation!.requiredMemberKeys = ['store-1', 'store-2', 'store-3', 'store-4'];
  input.m05[1]!.observation = { state: 'missing', value: null, precision: 'exact' };
  input.m05[2]!.observation = { state: 'UNKNOWN', value: null, precision: 'exact' };
  const group = buildDescriptiveMarketMethods(input).output.sections.M05.partitions[0]!;
  assert.equal(group.subtotal, '0');
  assert.equal(group.complete, false);
  assert.deepEqual(group.coverage, { observedCount: 1, zeroCount: 1, missingCount: 1, unknownCount: 1, nonExactCount: 0 });
  assert.ok(group.blockers.includes('MEMBERSHIP_INCOMPLETE'));
  assert.ok(group.blockers.includes('VALUE_MISSING'));
  assert.ok(group.blockers.includes('VALUE_UNKNOWN'));
});

test('M05 partitions incompatible periods, units and source files; missing period blocks only its arithmetic', () => {
  for (const dimension of ['period', 'unit', 'source', 'missing-period'] as const) {
    const input = fixture();
    if (dimension === 'period') input.m05[1]!.period = { ...period, end: '2026-02-28' };
    if (dimension === 'unit') input.m05[1]!.unit = 'reported sales';
    if (dimension === 'source') input.m05[1]!.source = ref('/observations/1', configSha256);
    if (dimension === 'missing-period') input.m05[1]!.period = null;
    const partitions = buildDescriptiveMarketMethods(input).output.sections.M05.partitions;
    assert.equal(partitions.length, 2, dimension);
    assert.ok(partitions.every(partition => !partition.complete), dimension);
    assert.ok(partitions.every(partition => partition.subtotal !== '20'), dimension);
    if (dimension === 'missing-period') assert.equal(partitions.find(partition => partition.period === null)!.subtotal, null);
  }
});

test('located record identity collapses repeated references, preserves identical text at other locators, and rejects conflicting rewrites', () => {
  const input = fixture();
  const first = observation(1, '12');
  first.aggregation = null;
  const second = structuredClone(first);
  second.source = ref('table/rows/8/searchEvents');
  input.m05 = [first, structuredClone(first), second];
  assert.equal(buildDescriptiveMarketMethods(input).output.sections.M05.locatedRecordCount, 2);
  input.m05[1]!.observation.value = '13';
  assert.throws(() => buildDescriptiveMarketMethods(input), /CONFLICTING_RECORD_REFERENCE:m05:1/);
});

test('M06 inventories source-stated status and different units without inferring stock or unique products', () => {
  const input = fixture();
  input.m06 = [observation(1, '12'), observation(2, '4'), observation(3, '0')].map((row, index) => ({
    observation: { ...row, unit: index === 1 ? 'kilograms' : 'packs', aggregation: null },
    objectLiteral: 'offer shown', statusLiteral: index === 2 ? null : 'source says in stock', dateMeaning: 'source reporting period',
  }));
  const output = buildDescriptiveMarketMethods(input).output;
  assert.equal(output.sections.M06.locatedRecordCount, 3);
  assert.equal(output.sections.M06.uniqueEntityCount, null);
  assert.deepEqual(output.sections.M06.recordPointers, ['/input/m06/0', '/input/m06/1', '/input/m06/2']);
  assert.equal(output.input.m06[1]!.observation.unit, 'kilograms');
  assert.equal(output.input.m06[2]!.observation.observation.state, 'observed_zero');
  assert.equal(output.input.m06[0]!.statusLiteral, 'source says in stock');
});

function withPeers(): Input {
  const input = fixture();
  input.m07 = [observation(1, '10'), observation(2, '12'), observation(3, '8')];
  input.peerSet = {
    anchorRef: input.m07[0]!.source, peerRefs: [input.m07[2]!.source, input.m07[1]!.source],
    membershipBasis: 'Owner explicitly selected these source-local references', scope: { ...scope },
    membershipRevision: 'synthetic-peers-v1', declaration: ref('/peers', configSha256),
  };
  return input;
}

test('M07 uses declared peer order for comparable side-by-side values and keeps unmatched periods separate', () => {
  const input = withPeers();
  input.m07[2]!.period = { ...period, timezone: 'UTC' };
  const output = buildDescriptiveMarketMethods(input).output;
  assert.deepEqual(output.sections.M07.recordPointers, ['/input/m07/0', '/input/m07/2', '/input/m07/1']);
  const [differentPeriod, comparable] = output.sections.M07.comparisons;
  assert.equal(differentPeriod!.compatibility, 'NOT_COMPARABLE');
  assert.deepEqual(differentPeriod!.blockers, ['M07_PERIOD_INCOMPATIBLE']);
  assert.equal(comparable!.compatibility, 'COMPARABLE');
  assert.equal(comparable!.anchorPointer, '/input/m07/0');
  assert.equal(comparable!.peerPointer, '/input/m07/1');
  assert.equal(output.input.m07[0]!.observation.value, '10');
  assert.equal(output.input.m07[1]!.observation.value, '12');
});

test('M07 missing declarations, unresolved peers and different variants cannot create comparison eligibility', () => {
  const input = withPeers();
  input.peerSet = null;
  assert.equal(buildDescriptiveMarketMethods(input).output.sections.M07.mode, 'UNRANKED_INVENTORY');
  const missing = withPeers();
  missing.peerSet!.peerRefs = [ref('/not-in-peer-records')];
  assert.deepEqual(buildDescriptiveMarketMethods(missing).output.sections.M07.comparisons[0]!.blockers, ['M07_IDENTITY_UNRESOLVED']);
  const variant = withPeers();
  variant.m07[1]!.scope.variantRule = 'Different pack size';
  const result = buildDescriptiveMarketMethods(variant).output.sections.M07.comparisons[1]!;
  assert.equal(result.compatibility, 'NOT_COMPARABLE');
  assert.deepEqual(result.blockers, ['M07_UNIVERSE_OR_MEASURE_INCOMPATIBLE']);
});

test('M07 does not promote an undeclared candidate into the declared peer display', () => {
  const input = withPeers();
  input.m07.push(observation(4, '999'));
  const output = buildDescriptiveMarketMethods(input).output;
  assert.deepEqual(output.sections.M07.recordPointers, ['/input/m07/0', '/input/m07/2', '/input/m07/1']);
  assert.equal(output.sections.M07.comparisons.length, 2);
  assert.equal(output.input.m07[3]!.observation.value, '999');
});

test('M09 preserves contrary dates, attributed negation and unknown dates without causal output', () => {
  const input = fixture();
  const event = (row: number, date: string | null, text: string): Input['m09'][number] => ({
    source: ref(`/events/${row}`), statementType: 'DOCUMENTED_EVENT', sourceWording: text,
    attribution: 'Synthetic source A', publicationDate: '2026-02-01', eventDate: date,
    dateBasis: date === null ? 'Event date not stated' : 'Source-stated effective date', namedScope: 'Synthetic fee schedule',
    targetLink: ref('/target-scope', configSha256), affectedMetricLiteral: null, conflictRefs: [],
  });
  input.m09 = [event(1, null, 'It may apply; no date was given.'), event(2, '2026-01-10', 'The fee took effect on January 10.'),
    event(3, '2026-01-08', 'The fee did not take effect on January 10; it applied on January 8.')];
  input.m09[0]!.targetLink = null;
  input.m09[1]!.conflictRefs = [input.m09[2]!.source];
  input.m09[2]!.conflictRefs = [input.m09[1]!.source];
  const output = buildDescriptiveMarketMethods(input).output;
  assert.deepEqual(output.sections.M09.events.map(row => row.recordPointer), ['/input/m09/2', '/input/m09/1', '/input/m09/0']);
  assert.deepEqual(output.sections.M09.events[2]!.blockers, ['M09_EVENT_DATE_UNKNOWN', 'M09_ENTITY_LINK_UNRESOLVED']);
  assert.ok(output.sections.M09.events[0]!.blockers.includes('M09_COUNTEREVIDENCE_CONFLICT'));
  assert.equal(output.input.m09[2]!.sourceWording, 'The fee did not take effect on January 10; it applied on January 8.');
  assert.equal(output.input.m09[0]!.eventDate, null);
  assert.equal(output.input.m09[0]!.publicationDate, '2026-02-01');
  input.m09[1]!.conflictRefs = [ref('/not-an-event')];
  assert.throws(() => buildDescriptiveMarketMethods(input), /UNRESOLVED_EVENT_CONFLICT_REFERENCE/);
});

test('trust boundary rejects missing locators, unknown source digests, invalid periods and state/value mismatches', () => {
  const cases: { change: (input: Input) => void; error: RegExp }[] = [
    { change: input => { input.m05[0]!.source.locator = ''; }, error: /INVALID_DESCRIPTIVE_MARKET_INPUT/ },
    { change: input => { input.m05[0]!.source.locator = '  '; }, error: /SOURCE_LOCATOR_MISSING/ },
    { change: input => { input.m05[0]!.source.sourceSha256 = 'a'.repeat(64); }, error: /UNKNOWN_EVIDENCE_SOURCE/ },
    { change: input => { input.m05[0]!.period!.start = '2026-02-01'; }, error: /PERIOD_REVERSED/ },
    { change: input => { input.m05[0]!.period!.timezone = 'invented-zone'; }, error: /INVALID_TIMEZONE/ },
    { change: input => { input.m05[0]!.observation.state = 'missing'; }, error: /VALUE_STATE_MISMATCH/ },
    { change: input => { input.m05[0]!.observation.state = 'observed_zero'; }, error: /VALUE_STATE_MISMATCH/ },
  ];
  for (const { change, error } of cases) {
    const input = fixture();
    change(input);
    assert.throws(() => validateDescriptiveMarketInput(input), error);
  }
});

test('retained output replay checks computed content even if an altered subtotal carries a freshly recomputed digest', () => {
  const input = fixture();
  const built = buildDescriptiveMarketMethods(input);
  assert.deepEqual(verifyDescriptiveMarketMethods(JSON.parse(built.bytes.toString())).bytes, built.bytes);
  const tampered = structuredClone(built.output);
  tampered.sections.M05.partitions[0]!.subtotal = '200';
  const { methodOutputId: _ignored, ...body } = tampered;
  tampered.methodOutputId = createHash('sha256').update(canonicalJson(body)).digest('hex');
  assert.throws(() => verifyDescriptiveMarketMethods(tampered), /DESCRIPTIVE_MARKET_REPLAY_MISMATCH/);
  const changed = fixture();
  changed.configuration.policyRevision = 'synthetic-v2';
  assert.notEqual(buildDescriptiveMarketMethods(changed).output.methodOutputId, built.output.methodOutputId);
  input.m05[0]!.sourceWording = 'caller mutation';
  assert.equal(built.output.input.m05[0]!.sourceWording, '12 reported search events');
});
