import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/bounded-analysis-gates.schema.json' with { type: 'json' };
import type { BoundedAnalysisGates } from '../../../contracts/analysis/bounded-analysis-gates.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(schema);
type Input = BoundedAnalysisGates['input'];
type Series = NonNullable<Input['m10']>['series'][number];
type Period = Series['period'];
type Observation = Series['rows'][number]['observation'];
type Scope = NonNullable<Input['i11']>['cells'][number]['scope'];
const validateInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<BoundedAnalysisGates>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_CALENDAR_DAYS = 10000;
const unique = (values: string[]): string[] => [...new Set(values)];
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const sourceKey = (source: Series['source']): string => canonicalJson([source.sha256, source.locator]);

export class BoundedAnalysisGatesValidationError extends TypeError {}
function fail(code: string): never { throw new BoundedAnalysisGatesValidationError(code); }

function calendar(period: Period): string[] {
  if (period.start > period.end) fail('PERIOD_REVERSED');
  const start = Date.parse(`${period.start}T00:00:00Z`);
  const end = Date.parse(`${period.end}T00:00:00Z`);
  const count = (end - start) / 86400000 + 1;
  if (!Number.isInteger(count) || count > MAX_CALENDAR_DAYS) fail('CALENDAR_RESOURCE_LIMIT');
  return Array.from({ length: count }, (_, index) => new Date(start + index * 86400000).toISOString().slice(0, 10));
}

function validateObservation(observation: Observation): void {
  const value = observation.value;
  const zero = value !== null && BigInt(value.replace('.', '')) === 0n;
  if (observation.state === 'missing' || observation.state === 'UNKNOWN') {
    if (value !== null) fail('VALUE_STATE_MISMATCH');
  } else if (value === null || (observation.state === 'observed_zero' ? !zero : zero)) fail('VALUE_STATE_MISMATCH');
}

function validateTimezone(zone: string): void {
  if (/^[+-](0[0-9]|1[0-4]):[0-5][0-9]$/.test(zone)) {
    if (/^[+-]14:(?!00)/.test(zone)) fail('INVALID_TIMEZONE');
    return;
  }
  try { new Intl.DateTimeFormat('en', { timeZone: zone }); }
  catch { fail('INVALID_TIMEZONE'); }
}

/** Source references are declarations here; retention verifies exact bytes and payload locators. */
export function validateBoundedAnalysisGatesInput(untrusted: unknown): Input {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('INPUT_TOO_LARGE');
  if (!validateInput(untrusted)) fail(`INVALID_BOUNDED_ANALYSIS_GATES_INPUT:${ajv.errorsText(validateInput.errors)}`);
  const input = JSON.parse(serialized) as Input;
  function check(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(check); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('logicalPath' in object) {
      const path = object.logicalPath as string;
      if (path.startsWith('/') || path.includes('\\') || /^[a-z]:/i.test(path) ||
        path.split('/').some(part => part === '' || part === '.' || part === '..')) fail('INVALID_SOURCE_LOGICAL_PATH');
    }
    // AJV above has checked these closed field shapes before recursive checks.
    if ('start' in object && 'end' in object) calendar(object as unknown as Period);
    if ('state' in object && 'value' in object) validateObservation(object as unknown as Observation);
    if (typeof object.timezone === 'string') validateTimezone(object.timezone);
    Object.values(object).forEach(check);
  }
  check(input);
  for (const series of input.m10?.series ?? []) {
    const dates = new Set<string>();
    for (const row of series.rows) {
      if (dates.has(row.date)) fail('M10_DUPLICATE_SERIES_DATE');
      dates.add(row.date);
      if (row.date < series.period.start || row.date > series.period.end) fail('M10_ROW_OUTSIDE_PERIOD');
    }
  }
  const groupLabels = new Set<string>();
  for (const group of input.i11?.groupPolicy?.groups ?? []) {
    if (groupLabels.has(group.label)) fail('I11_DUPLICATE_GROUP_LABEL');
    groupLabels.add(group.label);
  }
  for (const cell of input.i11?.cells ?? []) {
    if (cell.assignment.state === 'SOURCE_ASSIGNED' && (cell.assignment.source === null || cell.group === null)) {
      fail('I11_SOURCE_ASSIGNMENT_EVIDENCE_REQUIRED');
    }
    if (cell.countUnit === 'SOURCE_IDENTIFIED_ENTITY' && cell.identityEvidence === null) fail('I11_ENTITY_IDENTITY_EVIDENCE_REQUIRED');
  }
  for (const record of input.i12?.records ?? []) {
    if (record.kind === 'PRESENCE' && record.observation !== null) fail('I12_PRESENCE_CANNOT_MEASURE_EXPOSURE_OR_OUTCOME');
  }
  if (input.i16?.mode === 'DESIGN_ONLY' && input.i16.outcomes.length) fail('I16_DESIGN_ONLY_HAS_RESULT_DATA');
  return input;
}

function m10(input: Input): BoundedAnalysisGates['sections']['M10'] {
  const partitions = (input.m10?.series ?? []).map((series, index) => {
    const blockers: string[] = [];
    const pointer = `/input/m10/series/${index}`;
    const byDate = new Map(series.rows.map((row, rowIndex) => [row.date, { row, rowIndex }]));
    const days = calendar(series.period);
    const missingCalendarDates = days.filter(date => !byDate.has(date));
    const missingValueDates = days.filter(date => byDate.get(date)?.row.observation.state === 'missing');
    const unknownValueDates = days.filter(date => byDate.get(date)?.row.observation.state === 'UNKNOWN');
    const observedZeroDates = days.filter(date => byDate.get(date)?.row.observation.state === 'observed_zero');
    for (const field of ['entityLiteral', 'metric', 'unit', 'timezone', 'dailyBoundary', 'universe', 'frame', 'aggregationRule'] as const) {
      if (series[field] === null) blockers.push(`M10_${field}_MISSING`);
    }
    const { train, validation, holdout } = series.splits;
    let splitStatus: 'VALID' | 'INVALID' | 'MISSING' = train && holdout ? 'VALID' : 'MISSING';
    const splits = [train, validation, holdout].filter((value): value is Period => value !== null);
    if (splits.some(split => split.start < series.period.start || split.end > series.period.end) ||
      splits.some((split, splitIndex) => splitIndex > 0 && splits[splitIndex - 1]!.end >= split.start)) splitStatus = 'INVALID';
    if (splitStatus !== 'VALID') blockers.push(`M10_SPLIT_${splitStatus}`);
    for (const [field, value] of Object.entries(series.policy)) if (value === null) blockers.push(`M10_POLICY_${field}_UNSET`);
    if (train && series.policy.historyMinimumDays !== null) {
      const observedTrainDays = series.rows.filter(row => row.date >= train.start && row.date <= train.end && row.observation.value !== null).length;
      if (observedTrainDays < series.policy.historyMinimumDays) blockers.push('M10_DECLARED_HISTORY_MINIMUM_UNMET');
    }
    if (missingCalendarDates.length || missingValueDates.length || unknownValueDates.length) blockers.push('M10_MISSING_OR_UNKNOWN_DAYS');
    return {
      seriesPointer: pointer,
      recordPointers: [...byDate.values()].sort((a, b) => compare(a.row.date, b.row.date)).map(({ rowIndex }) => `${pointer}/rows/${rowIndex}`),
      missingCalendarDates, missingValueDates, unknownValueDates, observedZeroDates, splitStatus,
      structurallyComplete: blockers.length === 0, blockers,
    };
  });
  const timezones = unique((input.m10?.series ?? []).flatMap(series => series.timezone === null ? [] : [series.timezone]));
  return {
    status: 'BLOCKED', partitions, forecasts: null, errorMetrics: null, baselineEvaluation: null,
    blockers: unique(['M10_ADVANCED_ANALYSIS_DISABLED', ...(partitions.length ? [] : ['M10_SERIES_MISSING']),
      ...(timezones.length > 1 ? ['M10_TIMEZONE_INCOMPATIBLE'] : []), ...partitions.flatMap(partition => partition.blockers)]),
  };
}

function scopeBlockers(scope: Scope, prefix: string): string[] {
  return Object.entries(scope).flatMap(([key, value]) => value === null ? [`${prefix}_${key}_MISSING`] : []);
}

function i11(input: Input): BoundedAnalysisGates['sections']['I11'] {
  const data = input.i11;
  const groups = data?.groupPolicy?.groups.map(group => group.label) ?? [];
  const partitions = new Map<string, BoundedAnalysisGates['sections']['I11']['partitions'][number]>();
  const seen = new Map<string, string>();
  data?.cells.forEach((cell, index) => {
    const identity = sourceKey(cell.source);
    const bytes = canonicalJson(cell);
    if (seen.has(identity)) {
      if (seen.get(identity) !== bytes) fail('I11_CONFLICTING_SOURCE_CELL');
      return;
    }
    seen.set(identity, bytes);
    const key = canonicalJson([cell.scope, cell.countUnit]);
    const partition = partitions.get(key) ?? { cellPointers: [], groupOrder: [], unknownAssignmentPointers: [], blockers: [] };
    const pointer = `/input/i11/cells/${index}`;
    partition.cellPointers.push(pointer);
    if (cell.assignment.state === 'UNKNOWN' || cell.group === null || !groups.includes(cell.group)) {
      partition.unknownAssignmentPointers.push(pointer);
      partition.blockers.push('I11_GROUP_ASSIGNMENT_UNKNOWN');
    } else if (!partition.groupOrder.includes(cell.group)) partition.groupOrder.push(cell.group);
    partition.blockers.push(...scopeBlockers(cell.scope, 'I11'));
    if (cell.numerator.value === null) partition.blockers.push('I11_NUMERATOR_UNAVAILABLE');
    if (cell.denominator.value === null) partition.blockers.push('I11_DENOMINATOR_UNAVAILABLE');
    if (cell.denominator.state === 'observed_zero') partition.blockers.push('I11_ZERO_DENOMINATOR');
    partitions.set(key, partition);
  });
  for (const partition of partitions.values()) {
    partition.groupOrder = groups.filter(group => partition.groupOrder.includes(group));
    partition.blockers = unique(partition.blockers);
  }
  return {
    status: 'INTERNAL_INVENTORY', partitions: [...partitions.values()], rates: null, differences: null, publicationStatus: 'NOT_AUTHORIZED',
    blockers: unique(['I11_RATES_DIFFERENCES_AND_INFERENCE_DISABLED', 'I11_PUBLICATION_NOT_AUTHORIZED',
      ...(data?.groupPolicy ? [] : ['I11_GROUP_POLICY_MISSING']),
      ...(data?.groupPolicy?.suppressionRule ? [] : ['I11_SUPPRESSION_POLICY_UNSET']),
      ...(data?.groupPolicy?.overlap === 'DISJOINT' ? [] : ['I11_GROUPS_NOT_A_DISJOINT_PARTITION']),
      ...(partitions.size ? [] : ['I11_CELLS_MISSING']),
      ...(partitions.size > 1 ? ['I11_MEASURE_OR_DENOMINATOR_SCOPE_INCOMPATIBLE'] : []),
      ...[...partitions.values()].flatMap(partition => partition.blockers)]),
  };
}

function i12(input: Input): BoundedAnalysisGates['sections']['I12'] {
  const presencePointers: string[] = [];
  const exposurePointers: string[] = [];
  const outcomePointers: string[] = [];
  const partitions = new Map<string, BoundedAnalysisGates['sections']['I12']['partitions'][number]>();
  const seen = new Map<string, string>();
  input.i12?.records.forEach((record, index) => {
    const identity = sourceKey(record.source);
    const bytes = canonicalJson(record);
    if (seen.has(identity)) {
      if (seen.get(identity) !== bytes) fail('I12_CONFLICTING_SOURCE_RECORD');
      return;
    }
    seen.set(identity, bytes);
    const pointer = `/input/i12/records/${index}`;
    ({ PRESENCE: presencePointers, EXPOSURE: exposurePointers, OUTCOME: outcomePointers })[record.kind].push(pointer);
    const key = canonicalJson([record.kind, record.touchpoint, record.channel, record.scope, record.window]);
    const partition = partitions.get(key) ?? { kind: record.kind, recordPointers: [], blockers: [] };
    partition.recordPointers.push(pointer);
    partition.blockers.push(...scopeBlockers(record.scope, 'I12'));
    if (record.date === null) partition.blockers.push('I12_DATE_UNKNOWN');
    if (record.channel === null) partition.blockers.push('I12_CHANNEL_UNKNOWN');
    if (record.kind !== 'PRESENCE' && record.observation?.value == null) partition.blockers.push('I12_MEASUREMENT_UNAVAILABLE');
    if (record.kind !== 'PRESENCE' && record.window === null) partition.blockers.push('I12_WINDOW_UNKNOWN');
    partitions.set(key, partition);
  });
  for (const partition of partitions.values()) partition.blockers = unique(partition.blockers);
  return {
    status: 'SEPARATE_INVENTORIES', presencePointers, exposurePointers, outcomePointers, partitions: [...partitions.values()],
    joins: null, rates: null, effectiveness: null,
    blockers: unique(['I12_LINKAGE_RATES_AND_EFFECTIVENESS_DISABLED',
      ...(presencePointers.length ? [] : ['I12_PRESENCE_MISSING']),
      ...(exposurePointers.length ? [] : ['I12_EXPOSURE_MISSING']),
      ...(outcomePointers.length ? [] : ['I12_OUTCOME_MISSING']),
      ...[...partitions.values()].flatMap(partition => partition.blockers)]),
  };
}

function i16(input: Input): BoundedAnalysisGates['sections']['I16'] {
  const data = input.i16;
  const missingFields = data ? Object.entries(data.fields).flatMap(([field, value]) => value === null ? [field] : []) : [];
  const incompatibleOutcomePointers: string[] = [];
  const blockers: string[] = ['I16_ESTIMATOR_EXECUTION_DISABLED'];
  if (!data) blockers.push('I16_MODE_UNDECLARED');
  if (missingFields.length) blockers.push('I16_DESIGN_INCOMPLETE');
  if (data?.mode === 'EXISTING_RESULT') {
    if (data.protocolRef === null) blockers.push('I16_PROTOCOL_MISSING');
    if (!data.outcomes.length) blockers.push('I16_OUTCOMES_MISSING');
    for (const arm of ['TREATMENT', 'COMPARATOR'] as const) {
      if (!data.outcomes.some(outcome => outcome.arm === arm)) blockers.push(`I16_${arm}_DATA_MISSING`);
    }
    data.outcomes.forEach((outcome, index) => {
      if (outcome.arm === 'UNKNOWN' || (['assignmentUnit', 'outcome', 'unit', 'window'] as const).some(field =>
        outcome[field] === null || outcome[field] !== data.fields[field])) incompatibleOutcomePointers.push(`/input/i16/outcomes/${index}`);
      if (outcome.observation.value === null) blockers.push('I16_OUTCOME_UNAVAILABLE');
      if (outcome.denominator.value === null) blockers.push('I16_DENOMINATOR_UNAVAILABLE');
      if (outcome.denominator.state === 'observed_zero') blockers.push('I16_ZERO_DENOMINATOR');
    });
    if (incompatibleOutcomePointers.length) blockers.push('I16_PROTOCOL_DATA_INCOMPATIBLE');
  }
  return {
    mode: data?.mode ?? null,
    status: data?.mode === 'DESIGN_ONLY' ? 'METHOD_ONLY' : data ? 'ELIGIBILITY_ONLY' : 'BLOCKED', executionState: 'NOT_EXECUTED',
    structurallyComplete: data !== null && blockers.length === 1, protocolPointer: data?.protocolRef ? '/input/i16/protocolRef' : null,
    outcomePointers: data?.outcomes.map((_, index) => `/input/i16/outcomes/${index}`) ?? [],
    missingFields, incompatibleOutcomePointers, estimate: null, uncertainty: null, blockers: unique(blockers),
  };
}

export function buildBoundedAnalysisGates(untrustedInput: unknown): { output: BoundedAnalysisGates; bytes: Buffer } {
  const input = validateBoundedAnalysisGatesInput(untrustedInput);
  const body: Omit<BoundedAnalysisGates, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'bounded-analysis-gates', methodVersion: '1.0.0', input,
    sections: { M10: m10(input), I11: i11(input), I12: i12(input), I16: i16(input) },
    limitations: [
      'NORMALIZED_DECLARATIONS_REQUIRE_EXACT_RETAINED_SOURCE_VERIFICATION',
      'SOURCE_POINTERS_DO_NOT_AUTHENTICATE_TRUTH_APPROVAL_OR_SEMANTIC_VALIDITY',
      'M10_EACH_DECLARED_SERIES_REMAINS_SEPARATE_NO_ENTITY_JOIN_OR_IMPUTATION',
      'M10_FORECAST_BASELINE_AND_ERROR_EVALUATION_DISABLED',
      'I11_SOURCE_GROUP_CELLS_ONLY_NO_RATES_DIFFERENCES_INFERENCE_OR_PUBLICATION_AUTHORITY',
      'I12_PRESENCE_EXPOSURE_AND_OUTCOME_ARE_SEPARATE_NO_LINKAGE_OR_CONVERSION',
      'I16_DESIGN_OR_STRUCTURAL_ELIGIBILITY_ONLY_NO_ESTIMATOR_OR_EXECUTION',
      'NO_NEW_COLLECTION_AI_GENERATION_RANKING_CAUSAL_OR_BUSINESS_DECISION',
    ],
  };
  const output: BoundedAnalysisGates = { ...body, methodOutputId: createHash('sha256').update(canonicalJson(body)).digest('hex') };
  if (!validateOutput(output)) fail(`INVALID_BOUNDED_ANALYSIS_GATES_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.byteLength > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  return { output, bytes };
}

export function verifyBoundedAnalysisGates(untrustedOutput: unknown): { output: BoundedAnalysisGates; bytes: Buffer } {
  if (!validateOutput(untrustedOutput)) fail(`INVALID_BOUNDED_ANALYSIS_GATES_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const built = buildBoundedAnalysisGates((untrustedOutput as BoundedAnalysisGates).input);
  if (canonicalJson(untrustedOutput) !== canonicalJson(built.output)) fail('BOUNDED_ANALYSIS_GATES_REPLAY_MISMATCH');
  return built;
}
