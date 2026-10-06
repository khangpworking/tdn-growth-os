import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import type { TemporalWindowMethod } from '../../contracts/analysis/temporal-window-method.generated.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { buildTemporalWindowMethod, verifyTemporalWindowMethod } from '../../src/modules/analysis/temporal-window-method.js';

type Input = TemporalWindowMethod['input'];
type Observation = Input['observations'][number];
type Reason = TemporalWindowMethod['operations'][number]['reasons'][number];
const sourceSha256 = '1'.repeat(64); const declarationSha256 = '2'.repeat(64); const upstreamSha256 = '3'.repeat(64);
const ref = (fieldPointer: string, sha256 = sourceSha256) => ({ sourceSha256: sha256, locator: 'synthetic fixture source', fieldPointer });
function observation(id: string, value: string, start: string, end: string): Observation {
  return {
    observationId: id, source: ref(`/windows/${id}/value`), sourceNamespace: 'synthetic-provider/v1', rawRequestSha256: null, rawResponseSha256: '6'.repeat(64), retrievedAt: '2026-02-01T00:00:00Z', subjectMemberKeys: ['A', 'B'],
    measure: { literal: 'Reported period revenue', canonicalMapping: 'period_revenue', definition: 'Revenue during source interval for fixed members', definitionRevision: '1.0.0', definitionRef: ref('/definition'), dimension: 'CURRENCY', unit: 'VND', currency: 'VND', semantics: 'PERIOD_FLOW', semanticsRef: ref('/semantics'), additive: true, additivityRef: ref('/additivity'), displayPolicy: 'EXACT_DECIMAL', displayPolicyRef: ref('/display', upstreamSha256) },
    value: { state: value === '0' ? 'OBSERVED_ZERO' : 'EXACT', decimal: value, literal: value },
    requestedWindow: { start, end, binding: ref(`/windows/${id}/request`) }, rawQuery: { start, end, binding: ref(`/windows/${id}/query`) },
    observedWindow: { rawStart: start, rawEnd: end, interval: { start, end }, basisKind: 'TIMEZONE', basisLiteral: 'UTC', basisRef: ref('/timezone'), boundaryConvention: 'HALF_OPEN', boundaryRef: ref('/boundary'), mappingRef: ref('/mapping', declarationSha256), duration: { basis: 'ELAPSED_MILLISECONDS', value: '864000000', unit: 'milliseconds', proof: ref(`/windows/${id}/duration`) } },
    membership: { observedMemberKeys: ['A', 'B'], unknownMemberKeys: [], excludedMemberKeys: [], complete: true, proof: ref(`/windows/${id}/membership`, upstreamSha256) },
    upstream: { kind: 'METHOD_RESULT', ready: true, complete: true, entityOverlapResolved: true, proof: ref(`/windows/${id}/scalar`, upstreamSha256) },
  };
}
function fixture(values = ['100', '120'], requested = true): Input {
  const baseline = observation('baseline', values[0]!, '2026-01-01T00:00:00Z', '2026-01-11T00:00:00Z');
  const comparison = observation('comparison', values[1]!, '2026-01-11T00:00:00Z', '2026-01-21T00:00:00Z');
  return {
    contractVersion: '1.0.0', sourcePackage: { packageId: '00000000-0000-4000-8000-000000000001', version: 1, manifestArtifactSha256: '7'.repeat(64), packageContentSha256: '8'.repeat(64) },
    sources: [{ logicalPath: 'source.json', sha256: sourceSha256, role: 'SOURCE' }, { logicalPath: 'response.json', sha256: '6'.repeat(64), role: 'SOURCE' }, { logicalPath: 'configuration.json', sha256: declarationSha256, role: 'OWNER_DECLARATION' }, { logicalPath: 'verified-scalar.json', sha256: upstreamSha256, role: 'UPSTREAM_RESULT' }, { logicalPath: 'profile.json', sha256: '4'.repeat(64), role: 'OWNER_DECLARATION' }],
    configuration: { profileId: 'source-compatible-temporal-v1', profileVersion: '1.0.0', profileSha256: '4'.repeat(64), profileRef: ref('/profile', '4'.repeat(64)), mappingRevision: '1.0.0', compatibilityPolicyRevision: 'fixed-frame-equal-declared-duration-v1', configurationRef: ref('/run', declarationSha256) },
    frame: { frameId: 'fixed-selected-set', revision: '1.0.0', universePurpose: 'Synthetic selected listings only', scopeRuleRevision: '1.0.0', labelsRevision: '1.0.0', selectionRef: ref('/selection', declarationSha256), scopeRef: ref('/scope', declarationSha256), externalCoverage: 'UNKNOWN_NOT_MARKET_POPULATION', members: ['A', 'B'].map(key => ({ memberKey: key, identityState: 'EXACT', provider: 'synthetic-provider', country: 'VN', platform: 'synthetic-platform', shopId: `source-shop-${key}`, listingId: `source-listing-${key}`, variantScope: 'LISTING_AGGREGATE', variantId: null, source: ref(`/members/${key}`) })) },
    observations: [baseline, comparison], snapshotDispositions: [],
    requests: requested ? [
      { operationId: 'sum', operation: 'SUM_DISJOINT_WINDOWS', observationIds: ['baseline', 'comparison'], targetInterval: { start: baseline.observedWindow.interval!.start, end: comparison.observedWindow.interval!.end }, baselineId: null, comparisonId: null },
      { operationId: 'delta', operation: 'ABSOLUTE_CHANGE', observationIds: ['baseline', 'comparison'], targetInterval: null, baselineId: 'baseline', comparisonId: 'comparison' },
      { operationId: 'growth', operation: 'RELATIVE_CHANGE', observationIds: ['baseline', 'comparison'], targetInterval: null, baselineId: 'baseline', comparisonId: 'comparison' },
    ] : [],
  };
}
const results = (input: Input) => buildTemporalWindowMethod(input).output.operations;
const row = (input: Input, index = 1) => input.observations[index]!;

test('inventory is default; requested compatible fixed-set flows produce 220, 20 and 20 percent with stable operand order', () => {
  const inventory = fixture(undefined, false); inventory.observations.reverse();
  const output = buildTemporalWindowMethod(inventory).output;
  assert.equal(output.operations.length, 0);
  assert.deepEqual(output.series[0]!.observationPointers, ['/input/observations/1', '/input/observations/0']);
  const [sum, delta, growth] = results(fixture());
  assert.deepEqual(sum!.exact, { numerator: '220', denominator: '1' });
  assert.deepEqual(delta!.exact, { numerator: '20', denominator: '1' });
  assert.deepEqual(growth!.exact, { numerator: '20', denominator: '1' });
  assert.equal(sum!.display, '220'); assert.equal(growth!.display, '20.00');
  assert.deepEqual(sum!.operandPointers, ['/input/observations/0', '/input/observations/1']);
  assert.deepEqual(sum!.coverage.subjectMemberKeys, ['A', 'B']); assert.equal(sum!.coverage.complete, true); assert.equal(sum!.coverage.entireFrameComplete, true);
  const listingOnly = fixture(); listingOnly.observations.forEach(observation => { observation.subjectMemberKeys = ['A']; observation.membership.observedMemberKeys = ['A']; });
  const listingResult = results(listingOnly)[0]!;
  assert.equal(listingResult.coverage.complete, true); assert.equal(listingResult.coverage.entireFrameComplete, false);
  assert.deepEqual(listingResult.coverage.subjectMemberKeys, ['A']); assert.deepEqual(listingResult.coverage.frameMemberKeys, ['A', 'B']);
});

test('missing remains missing, observed zero permits delta but not growth, and signed rational growth rounds half-even', () => {
  const missing = fixture(); row(missing).value = { state: 'MISSING', decimal: null, literal: null };
  const retained = buildTemporalWindowMethod(missing).output;
  assert.equal(retained.series[0]!.observationPointers.length, 2);
  for (const result of retained.operations) { assert.equal(result.exact, null); assert.ok(result.reasons.includes('VALUE_NOT_EXACT')); }
  assert.deepEqual(retained.operations[0]!.coverage.exactObservationIds, ['baseline']);
  const zero = results(fixture(['0', '10']));
  assert.deepEqual(zero[1]!.exact, { numerator: '10', denominator: '1' });
  assert.deepEqual(zero[2]!.reasons, ['BASELINE_ZERO']); assert.equal(zero[2]!.exact, null); assert.equal(zero[2]!.coverage.complete, true);
  const expected: Array<[string, string, string, string, string]> = [
    ['100', '80', '-20', '1', '-20.00'], ['3', '4', '100', '3', '33.33'],
    ['20000', '20001', '1', '200', '0.00'], ['20000', '20003', '3', '200', '0.02'],
  ];
  for (const [baseline, comparison, numerator, denominator, display] of expected) {
    const result = results(fixture([baseline, comparison]))[2]!;
    assert.deepEqual(result.exact, { numerator, denominator }); assert.equal(result.display, display);
  }
});

test('overlap, target gaps, incomplete frozen membership and unknown or non-flow semantics block only applicable operations', () => {
  const cases: Array<[string, (input: Input) => void, Reason]> = [
    ['overlap', input => { row(input).observedWindow.interval = { start: '2026-01-06T00:00:00Z', end: '2026-01-16T00:00:00Z' }; input.requests[0]!.targetInterval!.end = '2026-01-16T00:00:00Z'; }, 'WINDOW_OVERLAP'],
    ['missing member', input => { row(input).membership.observedMemberKeys = ['A']; row(input).membership.unknownMemberKeys = ['B']; row(input).membership.complete = false; }, 'MEMBERSHIP_INCOMPLETE'],
    ['unknown basis', input => { row(input).observedWindow.basisKind = 'UNKNOWN'; row(input).observedWindow.basisLiteral = null; row(input).observedWindow.basisRef = null; }, 'TIME_BASIS_UNKNOWN'],
    ['unknown mapping', input => { row(input).observedWindow.mappingRef = null; }, 'BOUNDARY_MAPPING_MISSING'],
    ['upstream incomplete', input => { row(input).upstream.complete = false; }, 'UPSTREAM_SCALAR_NOT_READY'],
    ['unknown money unit', input => { row(input).measure.currency = null; }, 'METRIC_UNIT_UNKNOWN'],
  ];
  for (const [name, mutate, reason] of cases) {
    const input = fixture(); mutate(input);
    for (const result of results(input)) { assert.equal(result.exact, null, name); assert.ok(result.reasons.includes(reason), name); }
  }
  for (const semantics of ['ROLLING', 'CUMULATIVE', 'STOCK', 'UNKNOWN'] as const) {
    const input = fixture(); input.observations.forEach(observation => { observation.measure.semantics = semantics; });
    for (const result of results(input)) assert.ok(result.reasons.includes('NOT_PERIOD_FLOW'), semantics);
  }
  const gap = fixture(); row(gap).observedWindow.interval = { start: '2026-01-12T00:00:00Z', end: '2026-01-22T00:00:00Z' }; gap.requests[0]!.targetInterval!.end = '2026-01-22T00:00:00Z';
  assert.deepEqual(results(gap)[0]!.reasons, ['TARGET_GAP']); assert.equal(results(gap)[1]!.display, '20');
  const additive = fixture(); row(additive).measure.additive = null; row(additive).measure.additivityRef = null;
  assert.deepEqual(results(additive)[0]!.reasons, ['ADDITIVITY_NOT_PROVEN']); assert.equal(results(additive)[2]!.display, '20.00');
  const changedSubject = fixture(); row(changedSubject).subjectMemberKeys = ['A']; row(changedSubject).membership.observedMemberKeys = ['A'];
  assert.ok(results(changedSubject)[1]!.reasons.includes('SERIES_MISMATCH'));
  assert.deepEqual(results(changedSubject)[1]!.coverage.subjectMemberKeys, ['A', 'B']);
});

test('equal-duration change uses explicit elapsed or source calendar basis, never retrieval/query labels or inferred DST days', () => {
  const input = fixture(); row(input).observedWindow.interval!.end = '2026-01-22T00:00:00Z'; row(input).observedWindow.duration.value = '950400000';
  input.requests[0]!.targetInterval!.end = '2026-01-22T00:00:00Z';
  assert.equal(results(input)[0]!.display, '220'); assert.deepEqual(results(input)[1]!.reasons, ['DURATION_MISMATCH']);
  const queryOnly = fixture(); queryOnly.observations.forEach(observation => {
    observation.observedWindow.interval = null; observation.observedWindow.duration = { basis: 'UNKNOWN', value: null, unit: null, proof: null };
  });
  row(queryOnly).observedWindow.rawStart = '2026-01-11T00:00:00.0001Z';
  assert.equal(buildTemporalWindowMethod(queryOnly).output.input.observations[1]!.observedWindow.rawStart, '2026-01-11T00:00:00.0001Z');
  for (const result of results(queryOnly)) assert.ok(result.reasons.includes('BOUNDARY_MAPPING_MISSING'));
  const dst = fixture(); dst.observations[0]!.observedWindow.interval = { start: '2026-03-08T00:00:00-05:00', end: '2026-03-09T00:00:00-04:00' };
  dst.observations[1]!.observedWindow.interval = { start: '2026-03-09T00:00:00-04:00', end: '2026-03-10T00:00:00-04:00' };
  dst.observations.forEach(observation => { observation.observedWindow.basisLiteral = 'America/New_York'; });
  dst.observations[0]!.observedWindow.duration.value = '82800000'; dst.observations[1]!.observedWindow.duration.value = '86400000';
  dst.requests[0]!.targetInterval = { start: '2026-03-08T00:00:00-05:00', end: '2026-03-10T00:00:00-04:00' };
  assert.deepEqual(results(dst)[1]!.reasons, ['DURATION_MISMATCH']);
  dst.observations.forEach(observation => {
    observation.observedWindow.basisKind = 'SOURCE_CALENDAR'; observation.observedWindow.basisLiteral = 'source civil day in America/New_York';
    observation.observedWindow.duration = { basis: 'SOURCE_CALENDAR_UNITS', value: '1', unit: 'calendar-day', proof: ref('/calendar-duration') };
  });
  assert.equal(results(dst)[1]!.display, '20');
  for (const unit of ['month', 'quarter', 'year']) {
    const unequalMonths = fixture();
    unequalMonths.observations[0]!.observedWindow.interval = { start: '2026-02-01T00:00:00Z', end: '2026-03-01T00:00:00Z' };
    unequalMonths.observations[1]!.observedWindow.interval = { start: '2026-03-01T00:00:00Z', end: '2026-04-01T00:00:00Z' };
    unequalMonths.observations.forEach(observation => { observation.observedWindow.basisKind = 'SOURCE_CALENDAR'; observation.observedWindow.basisLiteral = 'source calendar'; observation.observedWindow.duration = { basis: 'SOURCE_CALENDAR_UNITS', value: '1', unit, proof: ref('/calendar-duration') }; });
    unequalMonths.requests[0]!.targetInterval = { start: '2026-02-01T00:00:00Z', end: '2026-04-01T00:00:00Z' };
    assert.deepEqual(results(unequalMonths)[1]!.reasons, ['DURATION_UNKNOWN'], unit);
    assert.equal(results(unequalMonths)[0]!.display, '220');
  }
});

test('duplicate captures/revisions never sum or newest-win; explicit disposition can select one same-window snapshot, definition changes split series', () => {
  const duplicateCapture = fixture(); row(duplicateCapture).source = structuredClone(row(duplicateCapture, 0).source);
  row(duplicateCapture).source.locator = 'different display label for identical source field';
  assert.ok(results(duplicateCapture)[0]!.reasons.includes('DUPLICATE_CAPTURE'));
  const revisions = fixture(); const alternative = structuredClone(row(revisions, 0)); alternative.observationId = 'alternative'; alternative.source = ref('/windows/alternative/value'); alternative.value.decimal = '150'; alternative.value.literal = '150';
  revisions.observations.push(alternative);
  assert.ok(results(revisions)[0]!.reasons.includes('WINDOW_REVISION_UNRESOLVED'));
  revisions.snapshotDispositions = [{ selectedObservationId: 'baseline', rejectedObservationIds: ['alternative'], binding: ref('/snapshot-disposition', declarationSha256) }];
  assert.equal(results(revisions)[0]!.display, '220');
  revisions.requests[0]!.observationIds = ['alternative', 'comparison'];
  assert.ok(results(revisions)[0]!.reasons.includes('UNSELECTED_WINDOW_REVISION'));
  const definition = fixture(); row(definition).measure.definitionRevision = '2.0.0';
  const output = buildTemporalWindowMethod(definition).output;
  assert.equal(output.series.length, 2);
  for (const result of output.operations) assert.ok(result.reasons.includes('SERIES_MISMATCH'));
});

test('invalid lineage/state declarations reject input; full canonical replay rejects recalculated-hash tampering without mutation', () => {
  const corruptions: Array<[(input: Input) => void, RegExp]> = [
    [input => { row(input).source.sourceSha256 = '9'.repeat(64); }, /UNKNOWN_SOURCE_REFERENCE/],
    [input => { row(input).rawResponseSha256 = '9'.repeat(64); }, /RAW_PAYLOAD_SOURCE_DIGEST_UNREGISTERED/],
    [input => { row(input).rawRequestSha256 = declarationSha256; }, /RAW_PAYLOAD_SOURCE_DIGEST_UNREGISTERED/],
    [input => { row(input).source.fieldPointer = '/bad~2'; }, /INVALID_TEMPORAL_INPUT/],
    [input => { row(input).source.locator = ' '; }, /EMPTY_SOURCE_LOCATOR/],
    [input => { row(input).measure.semanticsRef = ref('/semantics', declarationSha256); }, /SOURCE_PROOF_ROLE_MISMATCH/],
    [input => { row(input).upstream.proof = ref('/result'); }, /UPSTREAM_PROOF_ROLE_MISMATCH/],
    [input => { row(input).observedWindow.duration.value = '1'; }, /ELAPSED_DURATION_MISMATCH/],
    [input => { row(input).observedWindow.interval!.start = '2026-01-11T00:00:00.0001Z'; }, /INVALID_TEMPORAL_INPUT/],
    [input => { row(input).value = { state: 'MISSING', decimal: '0', literal: '0' }; }, /VALUE_STATE_MISMATCH/],
    [input => { input.frame.members[0]!.listingId = null; }, /EXACT_IDENTITY_INCOMPLETE/],
    [input => { input.frame.members[1]!.shopId = input.frame.members[0]!.shopId; input.frame.members[1]!.listingId = input.frame.members[0]!.listingId; }, /DUPLICATE_SOURCE_IDENTITY/],
    [input => { input.configuration.profileRef = ref('/profile'); }, /PROFILE_DIGEST_MISMATCH/],
  ];
  for (const [mutate, expected] of corruptions) { const input = fixture(); mutate(input); assert.throws(() => buildTemporalWindowMethod(input), expected); }
  const input = fixture(); const before = canonicalJson(input);
  const { output, bytes } = buildTemporalWindowMethod(input);
  assert.equal(canonicalJson(input), before);
  assert.equal(output.inputSha256, createHash('sha256').update(before).digest('hex'));
  assert.equal(verifyTemporalWindowMethod(JSON.parse(bytes.toString())).bytes.equals(bytes), true);
  const tampered = structuredClone(output); tampered.operations[0]!.exact!.numerator = '270';
  const { methodOutputId: _old, ...body } = tampered;
  tampered.methodOutputId = createHash('sha256').update(canonicalJson(body)).digest('hex');
  assert.throws(() => verifyTemporalWindowMethod(tampered), /TEMPORAL_REPLAY_MISMATCH/);
});
