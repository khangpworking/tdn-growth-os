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
    // A source-stated basis also carries `state`/`value`, so only an exact two-key {state, value} object is a Value.
    const keys = Object.keys(object);
    if (keys.length === 2 && keys.includes('state') && keys.includes('value')) validateObservation(object as unknown as Observation);
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
    // 1.1.0 derives the group from a source-stated platform/buyer basis, so a source-assigned cell needs either an
    // explicit in-policy label or that basis; 1.0.0 keeps requiring the explicit label.
    const labeled = cell.group !== null || ((input.semanticsVersion ?? '1.0.0') === '1.1.0' && cell.groupBasis !== undefined);
    if (cell.assignment.state === 'SOURCE_ASSIGNED' && (cell.assignment.source === null || !labeled)) {
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

/** U-04 (E11 / Ultimate §6.3): a descriptive rate is reported only with >=30 located text records per group. */
const MIN_RATE_RECORDS = 30 as const;
/** U-04: input semantics version. Absence retains 1.0.0 bytes exactly (no derived groups, no rates). */
type SemanticsVersion = '1.0.0' | '1.1.0';
type I11Cell = NonNullable<Input['i11']>['cells'][number];
type I11Partition = BoundedAnalysisGates['sections']['I11']['partitions'][number];

/**
 * A source-stated group label only: the platform the source itself names, subdivided by an explicit retail/wholesale
 * buyer type when the source states one. A stated platform with an absent or non-retail/wholesale buyer type stays
 * platform-only (it never stands for every buyer); a missing platform yields no label at all. No buyer type is inferred.
 */
function derivedGroupLabel(cell: I11Cell): string | null {
  const basis = cell.groupBasis;
  if (!basis || basis.platform.state !== 'SOURCE_STATED' || basis.platform.value === null) return null;
  const buyer = basis.buyerType;
  const stated = buyer && buyer.state === 'SOURCE_STATED' && (buyer.value === 'RETAIL' || buyer.value === 'WHOLESALE');
  return stated ? `${basis.platform.value} / ${buyer.value}` : basis.platform.value;
}

function i11(input: Input, version: SemanticsVersion): BoundedAnalysisGates['sections']['I11'] {
  const data = input.i11;
  const declared = data?.groupPolicy?.groups.map(group => group.label) ?? [];
  // U-04: without a declared policy, 1.1.0 derives disjoint labels from source-stated platform + buyer type.
  const groups = version === '1.0.0' || declared.length ? declared
    : unique((data?.cells ?? []).map(derivedGroupLabel).filter((label): label is string => label !== null));
  const labelOf = (cell: I11Cell): string | null => {
    if (cell.group !== null && groups.includes(cell.group)) return cell.group;
    return version === '1.1.0' && cell.assignment.state === 'SOURCE_ASSIGNED' ? derivedGroupLabel(cell) : null;
  };
  const partitions = new Map<string, I11Partition>();
  const groupValues = new Map<string, Map<string, { numerator: number | null; denominator: number | null; unit: I11Cell['countUnit']; members: string[]; numeratorMembers: string[] }>>();
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
    const label = labelOf(cell);
    if (label === null) {
      partition.unknownAssignmentPointers.push(pointer);
      partition.blockers.push('I11_GROUP_ASSIGNMENT_UNKNOWN');
    } else if (!partition.groupOrder.includes(label)) partition.groupOrder.push(label);
    partition.blockers.push(...scopeBlockers(cell.scope, 'I11'));
    if (cell.numerator.value === null) partition.blockers.push('I11_NUMERATOR_UNAVAILABLE');
    if (cell.denominator.value === null) partition.blockers.push('I11_DENOMINATOR_UNAVAILABLE');
    if (cell.denominator.state === 'observed_zero') partition.blockers.push('I11_ZERO_DENOMINATOR');
    if (label !== null) {
      const values = groupValues.get(key) ?? new Map();
      // 1.1.0: two cells for the same group in one partition would silently overwrite numerator/denominator, so this
      // version rejects the ambiguity. 1.0.0 keeps its historical last-cell-wins bytes and replays unchanged.
      if (version === '1.1.0' && values.has(label)) fail('I11_DUPLICATE_GROUP_CELL');
      values.set(label, {
        numerator: cell.numerator.value, denominator: cell.denominator.value, unit: cell.countUnit,
        // Member identity is the retained source key (sha256 + locator): the same record retained under two logical
        // paths is one record, so a path alias can neither inflate a denominator nor evade the overlap check.
        members: (cell.memberSources ?? []).map(sourceKey), numeratorMembers: (cell.numeratorMemberSources ?? []).map(sourceKey),
      });
      groupValues.set(key, values);
    }
    partitions.set(key, partition);
  });
  for (const partition of partitions.values()) {
    partition.groupOrder = groups.filter(group => partition.groupOrder.includes(group));
    partition.blockers = unique(partition.blockers);
  }
  // U-04: a descriptive rate needs a proven denominator, not a declared one. It is emitted only when the partition has
  // no unresolved condition, every group is a fully specified platform+buyer group whose authenticated member
  // references are unique, match the denominator, and contain the numerator members, and no record is counted twice.
  const partitionIndex = new Map([...partitions.keys()].map((key, index) => [key, index]));
  const rateGroups: { partition: number; group: string; numerator: number; denominator: number; rate: number }[] = [];
  if (version === '1.1.0') for (const [key, groups] of groupValues) {
    const partition = partitions.get(key)!;
    const values = [...groups];
    const owner = new Map<string, string>();
    let overlap = false;
    for (const [group, value] of values) for (const member of value.members) {
      const other = owner.get(member);
      if (other !== undefined && other !== group) overlap = true;
      owner.set(member, group);
    }
    if (overlap) partition.blockers = unique([...partition.blockers, 'I11_GROUP_MEMBER_OVERLAP']);
    // A platform-only group and a buyer-subdivided group of the same platform describe overlapping universes, so the
    // partition stays counts-only rather than comparing them; the missing buyer type is never read as all buyers.
    for (const [group] of values) if (!group.includes(' / ') && values.some(([other]) => other.startsWith(`${group} / `)))
      partition.blockers = unique([...partition.blockers, 'I11_PLATFORM_ONLY_GROUP_OVERLAPS_BUYER_SUBDIVISION']);
    // A member reference repeated under a path alias (or twice) proves nothing about a denominator, so the reason is
    // named for the reader instead of silently dropping the rate.
    if (values.some(([, value]) => value.members.length !== new Set(value.members).size ||
        value.numeratorMembers.length !== new Set(value.numeratorMembers).size))
      partition.blockers = unique([...partition.blockers, 'I11_MEMBER_REFERENCES_NOT_DISTINCT']);
    // An unknown assignment, scope or missing/zero denominator in the partition keeps every group counts-only.
    if (overlap || partition.blockers.length) continue;
    const proven = values.every(([, value]) => {
      const members = new Set(value.members);
      const numerators = new Set(value.numeratorMembers.filter(member => members.has(member)));
      // Declared counts are stored as source text, so they are read as integers before they can prove a denominator.
      const denominator = value.denominator === null ? null : Number(value.denominator);
      const numerator = value.numerator === null ? null : Number(value.numerator);
      return value.unit === 'LOCATED_RECORD' && denominator !== null && numerator !== null &&
        Number.isSafeInteger(denominator) && Number.isSafeInteger(numerator) &&
        // Every declared member reference must be distinct, and the authenticated member set must equal the denominator.
        value.members.length === members.size && members.size === denominator && members.size >= MIN_RATE_RECORDS &&
        // The numerator must be a distinct subset of that member set, so a repeated member can never inflate it.
        value.numeratorMembers.length === numerators.size && numerators.size === numerator;
    });
    if (!proven) continue;
    const index = partitionIndex.get(key)!;
    for (const [group, value] of values) {
      if (value.numerator === null) continue;
      const numerator = Number(value.numerator);
      const members = new Set(value.members);
      rateGroups.push({ partition: index, group, numerator, denominator: members.size, rate: numerator / members.size });
    }
  }
  const rates = rateGroups.length > 0 ? { recordsPerGroupMinimum: MIN_RATE_RECORDS, groups: rateGroups } : null;
  return {
    status: 'INTERNAL_INVENTORY', partitions: [...partitions.values()], rates, differences: null, publicationStatus: 'NOT_AUTHORIZED',
    blockers: unique([
      ...(version === '1.0.0'
        ? ['I11_RATES_DIFFERENCES_AND_INFERENCE_DISABLED', 'I11_PUBLICATION_NOT_AUTHORIZED',
          ...(data?.groupPolicy ? [] : ['I11_GROUP_POLICY_MISSING']),
          ...(data?.groupPolicy?.overlap === 'DISJOINT' ? [] : ['I11_GROUPS_NOT_A_DISJOINT_PARTITION'])]
        : [...(rates ? [] : ['I11_RATE_REQUIRES_COMPATIBLE_DENOMINATORS_AND_30_RECORDS']), 'I11_DIFFERENCES_AND_INFERENCE_DISABLED']),
      ...(data?.groupPolicy?.suppressionRule ? [] : ['I11_SUPPRESSION_POLICY_UNSET']),
      ...(partitions.size ? [] : ['I11_CELLS_MISSING']),
      ...(partitions.size > 1 ? ['I11_MEASURE_OR_DENOMINATOR_SCOPE_INCOMPATIBLE'] : []),
      ...[...partitions.values()].flatMap(partition => partition.blockers),
    ]),
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
  // U-04: an omitted semanticsVersion is the historical 1.0.0 (no derived groups, no rates, hard blockers kept).
  const version: SemanticsVersion = input.semanticsVersion ?? '1.0.0';
  const body: Omit<BoundedAnalysisGates, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'bounded-analysis-gates', methodVersion: version, input,
    sections: { M10: m10(input), I11: i11(input, version), I12: i12(input), I16: i16(input) },
    limitations: [
      'NORMALIZED_DECLARATIONS_REQUIRE_EXACT_RETAINED_SOURCE_VERIFICATION',
      'SOURCE_POINTERS_DO_NOT_AUTHENTICATE_TRUTH_APPROVAL_OR_SEMANTIC_VALIDITY',
      'M10_EACH_DECLARED_SERIES_REMAINS_SEPARATE_NO_ENTITY_JOIN_OR_IMPUTATION',
      'M10_FORECAST_BASELINE_AND_ERROR_EVALUATION_DISABLED',
      version === '1.1.0'
        ? 'I11_SOURCE_BACKED_DISJOINT_GROUPS_AND_DESCRIPTIVE_RATES_ONLY_WITH_30_LOCATED_RECORDS_PER_GROUP_NO_INFERENCE'
        : 'I11_SOURCE_GROUP_CELLS_ONLY_NO_RATES_DIFFERENCES_INFERENCE_OR_PUBLICATION_AUTHORITY',
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
