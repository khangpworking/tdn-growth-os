import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { BoundedAnalysisGates } from '../../contracts/analysis/bounded-analysis-gates.generated.js';
import { buildBoundedAnalysisGates, validateBoundedAnalysisGatesInput, verifyBoundedAnalysisGates } from '../../src/modules/analysis/bounded-analysis-gates.js';
import { canonicalJson } from '../../src/modules/foundation/canonical-json.js';
import { boundedAnalysisGatesFixture } from '../helpers/bounded-analysis-gates-fixture.js';

type Input = BoundedAnalysisGates['input'];
type Series = NonNullable<Input['m10']>['series'][number];

test('M10 inventories calendar gaps, missing values and UNKNOWN separately from observed zero across all splits', () => {
  const input = boundedAnalysisGatesFixture();
  const series = input.m10!.series[0]!;
  series.rows = series.rows.filter(row => !['2026-01-03', '2026-01-05'].includes(row.date));
  series.rows[2]!.observation = { state: 'missing', value: null };
  series.rows[3]!.observation = { state: 'UNKNOWN', value: null };
  const output = buildBoundedAnalysisGates(input).output;
  const result = output.sections.M10;
  assert.deepEqual(result.partitions[0]!.missingCalendarDates, ['2026-01-03', '2026-01-05']);
  assert.deepEqual(result.partitions[0]!.missingValueDates, ['2026-01-04']);
  assert.deepEqual(result.partitions[0]!.unknownValueDates, ['2026-01-06']);
  assert.deepEqual(result.partitions[0]!.observedZeroDates, ['2026-01-02']);
  assert.equal(result.partitions[0]!.splitStatus, 'VALID');
  assert.equal(result.partitions[0]!.structurallyComplete, false);
  assert.ok(result.blockers.includes('M10_POLICY_modelId_UNSET'));
  assert.ok(result.blockers.includes('M10_MISSING_OR_UNKNOWN_DAYS'));
  assert.equal(result.forecasts, null);
  assert.equal(result.baselineEvaluation, null);
  assert.equal(result.errorMetrics, null);
  assert.equal(output.input.m10!.series[0]!.policy.historyMinimumDays, null);
});

test('M10 checks declared split order and history policy without activating a complete declared model', () => {
  const input = boundedAnalysisGatesFixture();
  const series = input.m10!.series[0]!;
  series.policy = {
    revision: 'synthetic-policy-v1', modelId: 'declared-model', baselineId: 'declared-baseline', historyMinimumDays: 3,
    horizonDays: 2, gapPolicy: 'Declared no-fill rule', errorMetric: 'Declared metric', selectionRule: 'Declared fixed model', refitRule: 'Declared no refit',
  };
  const complete = buildBoundedAnalysisGates(input).output.sections.M10;
  assert.equal(complete.partitions[0]!.structurallyComplete, true);
  assert.equal(complete.status, 'BLOCKED');
  assert.deepEqual(complete.blockers, ['M10_ADVANCED_ANALYSIS_DISABLED']);
  assert.equal(complete.forecasts, null);
  assert.equal(complete.errorMetrics, null);
  const cases: { change: (series: Series) => void; status: string; blocker: string }[] = [
    { change: row => { row.splits.validation!.start = '2026-01-03'; }, status: 'INVALID', blocker: 'M10_SPLIT_INVALID' },
    { change: row => { row.splits.holdout = { start: '2026-01-01', end: '2026-01-02' }; }, status: 'INVALID', blocker: 'M10_SPLIT_INVALID' },
    { change: row => { row.splits.holdout!.end = '2026-01-07'; }, status: 'INVALID', blocker: 'M10_SPLIT_INVALID' },
    { change: row => { row.splits.train = null; }, status: 'MISSING', blocker: 'M10_SPLIT_MISSING' },
    { change: row => { row.policy.historyMinimumDays = 4; }, status: 'VALID', blocker: 'M10_DECLARED_HISTORY_MINIMUM_UNMET' },
  ];
  for (const { change, status, blocker } of cases) {
    const changed = structuredClone(input);
    change(changed.m10!.series[0]!);
    const result = buildBoundedAnalysisGates(changed).output.sections.M10;
    assert.equal(result.partitions[0]!.splitStatus, status);
    assert.equal(result.partitions[0]!.structurallyComplete, false);
    assert.ok(result.blockers.includes(blocker));
    assert.equal(result.forecasts, null);
  }
  const duplicate = structuredClone(input);
  duplicate.m10!.series[0]!.rows.push(structuredClone(series.rows[0]!));
  assert.throws(() => buildBoundedAnalysisGates(duplicate), /M10_DUPLICATE_SERIES_DATE/);
});

test('M10 preserves incompatible timezone and unit series as separate partitions without stitched history', () => {
  const input = boundedAnalysisGatesFixture();
  const other = structuredClone(input.m10!.series[0]!);
  other.source.locator = '/m10/series/1';
  other.timezone = 'Asia/Bangkok';
  other.dailyBoundary = '00:00 Asia/Bangkok';
  other.unit = 'packs';
  other.rows.forEach((row, index) => { row.source.locator = `/m10/series/1/rows/${index}`; });
  input.m10!.series.push(other);
  const result = buildBoundedAnalysisGates(input).output.sections.M10;
  assert.deepEqual(result.partitions.map(partition => partition.seriesPointer), ['/input/m10/series/0', '/input/m10/series/1']);
  assert.equal(result.partitions[0]!.recordPointers.length, 6);
  assert.equal(result.partitions[1]!.recordPointers.length, 6);
  assert.ok(result.blockers.includes('M10_TIMEZONE_INCOMPATIBLE'));
  assert.equal(result.forecasts, null);
});

test('I11 preserves owner order, unknown assignment and incompatible raw cells without rates or publication authority', () => {
  const input = boundedAnalysisGatesFixture();
  const unknown = structuredClone(input.i11!.cells[0]!);
  unknown.source.locator = '/i11/cells/2';
  unknown.group = 'Unverified source suggestion';
  unknown.assignment = { state: 'UNKNOWN', source: null };
  unknown.numerator = { state: 'observed_zero', value: '0' };
  unknown.denominator = { state: 'missing', value: null };
  const incompatible = structuredClone(input.i11!.cells[1]!);
  incompatible.source.locator = '/i11/cells/3';
  incompatible.scope.unit = 'review events';
  incompatible.scope.period = { start: '2026-02-01', end: '2026-02-06' };
  incompatible.denominator = { state: 'observed_zero', value: '0' };
  input.i11!.cells.push(unknown, incompatible);
  const output = buildBoundedAnalysisGates(input).output;
  const result = output.sections.I11;
  assert.equal(result.partitions.length, 2);
  assert.deepEqual(result.partitions[0]!.groupOrder, ['B', 'A']);
  assert.deepEqual(result.partitions[0]!.unknownAssignmentPointers, ['/input/i11/cells/2']);
  assert.deepEqual(result.partitions[1]!.cellPointers, ['/input/i11/cells/3']);
  assert.ok(result.partitions[0]!.blockers.includes('I11_DENOMINATOR_UNAVAILABLE'));
  assert.ok(result.partitions[1]!.blockers.includes('I11_ZERO_DENOMINATOR'));
  assert.ok(result.blockers.includes('I11_GROUPS_NOT_A_DISJOINT_PARTITION'));
  assert.ok(result.blockers.includes('I11_SUPPRESSION_POLICY_UNSET'));
  assert.equal(result.rates, null);
  assert.equal(result.differences, null);
  assert.equal(result.publicationStatus, 'NOT_AUTHORIZED');
  assert.deepEqual(output.input.i11!.cells[2]!.numerator, { state: 'observed_zero', value: '0' });
  input.i11!.cells[0]!.assignment.source = null;
  assert.throws(() => buildBoundedAnalysisGates(input), /I11_SOURCE_ASSIGNMENT_EVIDENCE_REQUIRED/);
});

test('I12 presence never becomes exposure and raw exposure/outcome event counts never become a conversion', () => {
  const input = boundedAnalysisGatesFixture();
  const result = buildBoundedAnalysisGates(input).output.sections.I12;
  assert.deepEqual(result.presencePointers, ['/input/i12/records/0']);
  assert.deepEqual(result.exposurePointers, ['/input/i12/records/1']);
  assert.deepEqual(result.outcomePointers, ['/input/i12/records/2']);
  assert.deepEqual(result.partitions.map(partition => partition.kind), ['PRESENCE', 'EXPOSURE', 'OUTCOME']);
  assert.equal(result.joins, null);
  assert.equal(result.rates, null);
  assert.equal(result.effectiveness, null);
  input.i12!.records = [input.i12!.records[0]!];
  const presenceOnly = buildBoundedAnalysisGates(input).output.sections.I12;
  assert.deepEqual(presenceOnly.exposurePointers, []);
  assert.deepEqual(presenceOnly.outcomePointers, []);
  assert.ok(presenceOnly.blockers.includes('I12_EXPOSURE_MISSING'));
  assert.ok(presenceOnly.blockers.includes('I12_OUTCOME_MISSING'));
  const measurements = boundedAnalysisGatesFixture();
  measurements.i12!.records[1]!.observation = { state: 'observed_zero', value: '0' };
  measurements.i12!.records[2]!.observation = { state: 'UNKNOWN', value: null };
  const measured = buildBoundedAnalysisGates(measurements).output.sections.I12;
  assert.ok(!measured.partitions[1]!.blockers.includes('I12_MEASUREMENT_UNAVAILABLE'));
  assert.ok(measured.partitions[2]!.blockers.includes('I12_MEASUREMENT_UNAVAILABLE'));
});

function existingResult(): Input {
  const input = boundedAnalysisGatesFixture();
  const data = input.i16!;
  data.mode = 'EXISTING_RESULT';
  data.protocolRef = { ...data.source, locator: '/protocol' };
  data.fields.attrition = 'None declared in supplied protocol';
  data.fields.estimator = 'Source-declared estimator';
  data.fields.missingRule = 'Source-declared no imputation';
  data.fields.uncertaintyRule = 'Source-declared uncertainty rule';
  data.fields.decisionRule = 'No business decision rule';
  data.outcomes = (['TREATMENT', 'COMPARATOR'] as const).map((arm, index) => ({
    source: { ...data.source, locator: `/i16/outcomes/${index}` }, arm,
    assignmentUnit: data.fields.assignmentUnit, outcome: data.fields.outcome, unit: data.fields.unit, window: data.fields.window,
    observation: { state: 'observed_value', value: index === 0 ? '4' : '3' }, denominator: { state: 'observed_value', value: '10' },
  }));
  return input;
}

test('I16 design remains unexecuted and existing result data only receive structural eligibility, never an estimate', () => {
  const design = boundedAnalysisGatesFixture();
  const method = buildBoundedAnalysisGates(design).output.sections.I16;
  assert.equal(method.status, 'METHOD_ONLY');
  assert.equal(method.executionState, 'NOT_EXECUTED');
  assert.equal(method.estimate, null);
  assert.equal(method.uncertainty, null);
  assert.deepEqual(method.missingFields, ['attrition', 'decisionRule', 'estimator', 'missingRule', 'uncertaintyRule']);
  const existing = existingResult();
  const result = buildBoundedAnalysisGates(existing).output.sections.I16;
  assert.equal(result.status, 'ELIGIBILITY_ONLY');
  assert.equal(result.structurallyComplete, true);
  assert.equal(result.executionState, 'NOT_EXECUTED');
  assert.equal(result.estimate, null);
  assert.equal(result.uncertainty, null);
  assert.deepEqual(result.outcomePointers, ['/input/i16/outcomes/0', '/input/i16/outcomes/1']);
  design.i16!.outcomes = existing.i16!.outcomes;
  assert.throws(() => buildBoundedAnalysisGates(design), /I16_DESIGN_ONLY_HAS_RESULT_DATA/);
  existing.i16!.outcomes[1]!.unit = 'Different measurement unit';
  existing.i16!.outcomes[0]!.observation = { state: 'missing', value: null };
  const incompatible = buildBoundedAnalysisGates(existing).output.sections.I16;
  assert.equal(incompatible.structurallyComplete, false);
  assert.deepEqual(incompatible.incompatibleOutcomePointers, ['/input/i16/outcomes/1']);
  assert.ok(incompatible.blockers.includes('I16_PROTOCOL_DATA_INCOMPATIBLE'));
  assert.ok(incompatible.blockers.includes('I16_OUTCOME_UNAVAILABLE'));
  assert.equal(incompatible.estimate, null);
});

test('gate boundary rejects malformed source paths, dates and missing/zero value mismatches', () => {
  const cases: { change: (input: Input) => void; error: RegExp }[] = [
    { change: input => { input.m10!.source.logicalPath = '../private.json'; }, error: /INVALID_SOURCE_LOGICAL_PATH/ },
    { change: input => { input.m10!.series[0]!.rows[0]!.observation.state = 'missing'; }, error: /VALUE_STATE_MISMATCH/ },
    { change: input => { input.m10!.series[0]!.rows[1]!.observation.state = 'observed_value'; }, error: /VALUE_STATE_MISMATCH/ },
    { change: input => { input.m10!.series[0]!.period.end = '2026-02-30'; }, error: /INVALID_BOUNDED_ANALYSIS_GATES_INPUT/ },
    { change: input => { input.m10!.series[0]!.period.start = '2026-01-07'; }, error: /PERIOD_REVERSED/ },
    { change: input => { input.m10!.series[0]!.timezone = 'Unknown/Invented'; }, error: /INVALID_TIMEZONE/ },
    { change: input => { input.i12!.records[0]!.observation = { state: 'observed_zero', value: '0' }; }, error: /I12_PRESENCE_CANNOT_MEASURE/ },
  ];
  for (const { change, error } of cases) {
    const input = boundedAnalysisGatesFixture();
    change(input);
    assert.throws(() => validateBoundedAnalysisGatesInput(input), error);
  }
});

test('canonical gate replay verifies section content even under a forged digest and optional inputs stay independent', () => {
  const input = boundedAnalysisGatesFixture();
  input.m10 = null;
  input.i11 = null;
  input.i16 = null;
  const built = buildBoundedAnalysisGates(input);
  assert.deepEqual(verifyBoundedAnalysisGates(JSON.parse(built.bytes.toString())).bytes, built.bytes);
  assert.deepEqual(built.output.sections.I12.exposurePointers, ['/input/i12/records/1']);
  assert.deepEqual(built.output.sections.M10.partitions, []);
  assert.equal(built.output.sections.I16.mode, null);
  assert.equal(built.output.sections.I16.status, 'BLOCKED');
  const forged = structuredClone(built.output);
  forged.sections.I12.exposurePointers = [];
  const { methodOutputId: _ignored, ...body } = forged;
  forged.methodOutputId = createHash('sha256').update(canonicalJson(body)).digest('hex');
  assert.throws(() => verifyBoundedAnalysisGates(forged), /BOUNDED_ANALYSIS_GATES_REPLAY_MISMATCH/);
  input.i12!.records[1]!.observation!.value = '200';
  assert.equal(built.output.input.i12!.records[1]!.observation!.value, '100');
  assert.notEqual(buildBoundedAnalysisGates(input).output.methodOutputId, built.output.methodOutputId);
});
