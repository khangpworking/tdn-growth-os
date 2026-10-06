import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/temporal-window-method.schema.json' with { type: 'json' };
import type { TemporalWindowMethod } from '../../../contracts/analysis/temporal-window-method.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv); ajv.addSchema(schema);
type Input = TemporalWindowMethod['input'];
type Observation = Input['observations'][number];
type Ref = Observation['source'];
type Interval = NonNullable<Observation['observedWindow']['interval']>;
type Result = TemporalWindowMethod['operations'][number];
type Reason = Result['reasons'][number];
type Located = { observation: Observation; pointer: string; seriesKey: string; windowKey: string | null; identityOrder: number };
type Rational = { n: bigint; d: bigint };
const validateInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<TemporalWindowMethod>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;
const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
export class TemporalWindowValidationError extends TypeError {}
function fail(code: string): never { throw new TemporalWindowValidationError(code); }

// Existing economics/tablet arithmetic is private; do not change its legacy API.
function rational(n: bigint, d = 1n): Rational {
  if (d <= 0n) fail('INVALID_RATIONAL');
  let a = n < 0n ? -n : n; let b = d;
  while (b) [a, b] = [b, a % b];
  return { n: n / a, d: d / a };
}
function decimal(value: string): Rational {
  const [whole, fraction = ''] = value.split('.');
  return rational(BigInt(`${whole}${fraction}`), 10n ** BigInt(fraction.length));
}
function add(a: Rational, b: Rational): Rational { return rational(a.n * b.d + b.n * a.d, a.d * b.d); }
function subtract(a: Rational, b: Rational): Rational { return rational(a.n * b.d - b.n * a.d, a.d * b.d); }
function relative(delta: Rational, baseline: Rational): Rational { return rational(100n * delta.n * baseline.d, delta.d * baseline.n); }
function exact(value: Rational): NonNullable<Result['exact']> { return { numerator: value.n.toString(), denominator: value.d.toString() }; }
function halfEven2(value: Rational): string {
  const magnitude = value.n < 0n ? -value.n : value.n;
  const scaled = magnitude * 100n; let rounded = scaled / value.d;
  const twice = 2n * (scaled % value.d);
  if (twice > value.d || (twice === value.d && rounded % 2n === 1n)) rounded++;
  return `${value.n < 0n && rounded !== 0n ? '-' : ''}${rounded / 100n}.${(rounded % 100n).toString().padStart(2, '0')}`;
}
function exactDecimal(value: Rational): string {
  const magnitude = value.n < 0n ? -value.n : value.n;
  let remainder = magnitude % value.d; let fraction = '';
  // Sums/differences of bounded decimal inputs terminate within 18 places.
  for (let index = 0; remainder && index < 18; index++) {
    remainder *= 10n; fraction += (remainder / value.d).toString(); remainder %= value.d;
  }
  if (remainder) fail('NON_TERMINATING_DECIMAL');
  return `${value.n < 0n ? '-' : ''}${magnitude / value.d}${fraction ? `.${fraction}` : ''}`;
}
function instant(value: string): number {
  const result = Date.parse(value);
  if (!Number.isSafeInteger(result)) fail('INVALID_CANONICAL_INSTANT');
  return result;
}
function interval(value: Interval): { start: number; end: number } {
  const start = instant(value.start); const end = instant(value.end);
  if (start >= end) fail('INVALID_CANONICAL_INTERVAL');
  return { start, end };
}
function sameKeys(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every(key => b.includes(key));
}

/** Validate declarations; caller must separately verify retained bytes, field resolution and normalization/profile replay. */
export function validateTemporalWindowInput(untrusted: unknown): Input {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('INPUT_TOO_LARGE');
  if (!validateInput(untrusted)) fail(`INVALID_TEMPORAL_INPUT:${ajv.errorsText(validateInput.errors)}`);
  const input = JSON.parse(serialized) as Input;
  const sources = new Map<string, Input['sources'][number]>(); const paths = new Set<string>();
  for (const source of input.sources) {
    if (paths.has(source.logicalPath)) fail('DUPLICATE_SOURCE_PATH');
    if (source.logicalPath.startsWith('/') || source.logicalPath.includes('\\') || /^[a-z]:/i.test(source.logicalPath) ||
      source.logicalPath.split('/').some(part => part === '' || part === '.' || part === '..')) fail('INVALID_SOURCE_PATH');
    paths.add(source.logicalPath);
    const prior = sources.get(source.sha256);
    if (prior && prior.role !== source.role) fail('CONFLICTING_SOURCE_ROLE');
    sources.set(source.sha256, source);
  }
  function checkRefs(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(checkRefs); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('sourceSha256' in object && 'locator' in object) {
      if (!sources.has(object.sourceSha256 as string)) fail('UNKNOWN_SOURCE_REFERENCE');
      if (!(object.locator as string).trim()) fail('EMPTY_SOURCE_LOCATOR');
    }
    Object.values(object).forEach(checkRefs);
  }
  checkRefs(input);
  if (input.configuration.profileRef.sourceSha256 !== input.configuration.profileSha256) fail('PROFILE_DIGEST_MISMATCH');
  const role = (ref: Ref | null): string | undefined => ref ? sources.get(ref.sourceSha256)?.role : undefined;
  const members = new Map<string, Input['frame']['members'][number]>();
  const identityKeys = new Set<string>();
  for (const member of input.frame.members) {
    if (!member.memberKey.trim() || members.has(member.memberKey)) fail('INVALID_OR_DUPLICATE_MEMBER_KEY');
    if (role(member.source) !== 'SOURCE') fail('MEMBER_SOURCE_ROLE_MISMATCH');
    if (member.identityState === 'EXACT' && [member.provider, member.country, member.platform, member.shopId, member.listingId].some(value => !value?.trim())) fail('EXACT_IDENTITY_INCOMPLETE');
    if (member.variantScope === 'EXACT_VARIANT' && !member.variantId?.trim()) fail('EXACT_VARIANT_INCOMPLETE');
    if (member.variantScope === 'LISTING_AGGREGATE' && member.variantId !== null) fail('LISTING_AGGREGATE_VARIANT_CONTRADICTION');
    if (member.identityState === 'EXACT') {
      const identityKey = canonicalJson([member.provider, member.country, member.platform, member.shopId, member.listingId, member.variantScope, member.variantId]);
      if (identityKeys.has(identityKey)) fail('DUPLICATE_SOURCE_IDENTITY');
      identityKeys.add(identityKey);
    }
    members.set(member.memberKey, member);
  }
  const ids = new Set<string>();
  for (const row of input.observations) {
    if (!row.observationId.trim() || ids.has(row.observationId)) fail('INVALID_OR_DUPLICATE_OBSERVATION_ID');
    ids.add(row.observationId);
    if (role(row.source) !== 'SOURCE') fail('OBSERVATION_SOURCE_ROLE_MISMATCH');
    if (sources.get(row.rawResponseSha256)?.role !== 'SOURCE' ||
      (row.rawRequestSha256 !== null && sources.get(row.rawRequestSha256)?.role !== 'SOURCE')) fail('RAW_PAYLOAD_SOURCE_DIGEST_UNREGISTERED');
    if (!row.subjectMemberKeys.length || row.subjectMemberKeys.some(key => !members.has(key))) fail('UNKNOWN_SUBJECT_MEMBER');
    const keys = [...row.membership.observedMemberKeys, ...row.membership.unknownMemberKeys, ...row.membership.excludedMemberKeys];
    if (keys.some(key => !row.subjectMemberKeys.includes(key)) || new Set(keys).size !== keys.length) fail('INVALID_MEMBERSHIP_PARTITION');
    const { state, decimal: value } = row.value;
    if (['EXACT', 'OBSERVED_ZERO'].includes(state)) {
      if (value === null || !row.value.literal?.trim() || (state === 'OBSERVED_ZERO') !== (decimal(value).n === 0n)) fail('VALUE_STATE_MISMATCH');
    } else if (['MISSING', 'UNREADABLE', 'UNKNOWN'].includes(state) && value !== null) fail('VALUE_STATE_MISMATCH');
    const window = row.observedWindow;
    if (window.interval !== null) interval(window.interval);
    if (window.basisKind === 'TIMEZONE' && window.basisLiteral !== null) {
      if (/^[+-](0[0-9]|1[0-4]):[0-5][0-9]$/.test(window.basisLiteral)) {
        if (/^[+-]14:(?!00)/.test(window.basisLiteral)) fail('INVALID_TIMEZONE');
      } else {
        try { new Intl.DateTimeFormat('en', { timeZone: window.basisLiteral }); }
        catch { fail('INVALID_TIMEZONE'); }
      }
    }
    const duration = window.duration;
    if (duration.basis === 'UNKNOWN' && (duration.value !== null || duration.unit !== null || duration.proof !== null)) fail('DURATION_STATE_MISMATCH');
    if (duration.basis === 'ELAPSED_MILLISECONDS' && duration.value !== null) {
      if (window.interval === null || duration.unit !== 'milliseconds') fail('ELAPSED_DURATION_INCOMPLETE');
      const span = interval(window.interval);
      if (BigInt(duration.value) !== BigInt(span.end) - BigInt(span.start)) fail('ELAPSED_DURATION_MISMATCH');
    }
    // A declaration artifact may select scope/snapshot, not masquerade as source semantics.
    for (const proof of [row.measure.definitionRef, row.measure.semanticsRef, row.measure.additivityRef, window.basisRef, window.boundaryRef, duration.proof, row.membership.proof]) {
      if (proof && !['SOURCE', 'UPSTREAM_RESULT'].includes(role(proof)!)) fail('SOURCE_PROOF_ROLE_MISMATCH');
    }
    if (row.upstream.proof && role(row.upstream.proof) !== (row.upstream.kind === 'METHOD_RESULT' ? 'UPSTREAM_RESULT' : 'SOURCE')) fail('UPSTREAM_PROOF_ROLE_MISMATCH');
  }
  const requestIds = new Set<string>();
  for (const request of input.requests) {
    if (!request.operationId.trim() || requestIds.has(request.operationId)) fail('INVALID_OR_DUPLICATE_OPERATION_ID');
    requestIds.add(request.operationId);
    if (request.observationIds.some(id => !ids.has(id))) fail('UNKNOWN_OPERATION_OBSERVATION');
    if (request.operation === 'SUM_DISJOINT_WINDOWS') {
      if (request.targetInterval === null || request.baselineId !== null || request.comparisonId !== null) fail('INVALID_SUM_REQUEST');
      interval(request.targetInterval);
    } else if (request.targetInterval !== null || request.baselineId === null || request.comparisonId === null ||
      request.baselineId === request.comparisonId || !sameKeys(request.observationIds, [request.baselineId, request.comparisonId])) fail('INVALID_CHANGE_REQUEST');
  }
  const disposed = new Set<string>();
  for (const disposition of input.snapshotDispositions) {
    const keys = [disposition.selectedObservationId, ...disposition.rejectedObservationIds];
    if (!disposition.rejectedObservationIds.length || keys.some(key => !ids.has(key) || disposed.has(key)) || new Set(keys).size !== keys.length) fail('INVALID_SNAPSHOT_DISPOSITION');
    keys.forEach(key => disposed.add(key));
  }
  return input;
}

export function buildTemporalWindowMethod(untrusted: unknown): { output: TemporalWindowMethod; bytes: Buffer } {
  const input = validateTemporalWindowInput(untrusted);
  const sources = new Map(input.sources.map(source => [source.sha256, source.role]));
  const sourceProof = (ref: Ref | null): boolean => ref !== null && ['SOURCE', 'UPSTREAM_RESULT'].includes(sources.get(ref.sourceSha256)!);
  const members = new Map(input.frame.members.map((member, order) => [member.memberKey, { member, order }]));
  const frameKeys = input.frame.members.map(member => member.memberKey);
  const fixedKeys = (keys: string[]): string[] => frameKeys.filter(key => keys.includes(key));
  const located: Located[] = input.observations.map((observation, index) => {
    const identities = fixedKeys(observation.subjectMemberKeys).map(key => {
      const { source: _ref, ...identity } = members.get(key)!.member;
      return identity;
    });
    const measure = observation.measure;
    const seriesKey = digest({ sourceNamespace: observation.sourceNamespace, identities,
      frame: { frameId: input.frame.frameId, revision: input.frame.revision, scopeRuleRevision: input.frame.scopeRuleRevision, labelsRevision: input.frame.labelsRevision },
      measure: { literal: measure.literal, canonicalMapping: measure.canonicalMapping, definition: measure.definition, definitionRevision: measure.definitionRevision, dimension: measure.dimension, unit: measure.unit, currency: measure.currency },
    });
    const span = observation.observedWindow.interval ? interval(observation.observedWindow.interval) : null;
    return { observation, pointer: `/input/observations/${index}`, seriesKey,
      windowKey: span ? canonicalJson([seriesKey, span.start, span.end]) : null,
      identityOrder: Math.min(...observation.subjectMemberKeys.map(key => members.get(key)!.order)),
    };
  });
  const byId = new Map(located.map(row => [row.observation.observationId, row]));
  const windowGroups = new Map<string, Located[]>();
  for (const row of located) if (row.windowKey) windowGroups.set(row.windowKey, [...(windowGroups.get(row.windowKey) ?? []), row]);
  const selectedRevisions = new Map<string, string>();
  for (const disposition of input.snapshotDispositions) {
    const selected = byId.get(disposition.selectedObservationId)!;
    const group = selected.windowKey ? windowGroups.get(selected.windowKey)! : [];
    if (!selected.windowKey || !sameKeys(group.map(row => row.observation.observationId), [disposition.selectedObservationId, ...disposition.rejectedObservationIds])) fail('SNAPSHOT_DISPOSITION_WINDOW_MISMATCH');
    selectedRevisions.set(selected.windowKey, disposition.selectedObservationId);
  }
  function sortRows(a: Located, b: Located): number {
    const ai = a.observation.observedWindow.interval; const bi = b.observation.observedWindow.interval;
    if (ai && bi) {
      const delta = instant(ai.start) - instant(bi.start);
      if (delta) return delta;
    } else if (ai || bi) return ai ? -1 : 1;
    return a.identityOrder - b.identityOrder || compare(a.observation.observationId, b.observation.observationId);
  }
  const ordered = [...located].sort(sortRows);
  const seriesMap = new Map<string, TemporalWindowMethod['series'][number]>();
  for (const row of ordered) {
    const series = seriesMap.get(row.seriesKey) ?? { seriesKey: row.seriesKey, observationPointers: [] };
    series.observationPointers.push(row.pointer); seriesMap.set(row.seriesKey, series);
  }
  function rowReasons(row: Located): Reason[] {
    const observation = row.observation; const measure = observation.measure; const window = observation.observedWindow;
    const reasons: Reason[] = [];
    if (observation.subjectMemberKeys.some(key => {
      const member = members.get(key)!.member; return member.identityState !== 'EXACT' || member.variantScope === 'UNKNOWN';
    })) reasons.push('IDENTITY_UNRESOLVED');
    if (!['EXACT', 'OBSERVED_ZERO'].includes(observation.value.state)) reasons.push('VALUE_NOT_EXACT');
    if (!measure.unit?.trim() || measure.dimension === 'UNKNOWN' || (measure.dimension === 'CURRENCY' && !measure.currency?.trim())) reasons.push('METRIC_UNIT_UNKNOWN');
    if (!measure.definition?.trim() || !measure.definitionRevision?.trim() || !sourceProof(measure.definitionRef)) reasons.push('DEFINITION_UNKNOWN');
    if (measure.semantics !== 'PERIOD_FLOW' || !sourceProof(measure.semanticsRef)) reasons.push('NOT_PERIOD_FLOW');
    if (window.basisKind === 'UNKNOWN' || !window.basisLiteral?.trim() || !sourceProof(window.basisRef)) reasons.push('TIME_BASIS_UNKNOWN');
    if (!window.interval || window.rawStart === null || window.rawEnd === null || window.boundaryConvention === 'UNKNOWN' || !sourceProof(window.boundaryRef) || !window.mappingRef) reasons.push('BOUNDARY_MAPPING_MISSING');
    const membership = observation.membership;
    if (!membership.complete || membership.unknownMemberKeys.length || membership.excludedMemberKeys.length ||
      !sameKeys(membership.observedMemberKeys, observation.subjectMemberKeys) || !sourceProof(membership.proof)) reasons.push('MEMBERSHIP_INCOMPLETE');
    const upstream = observation.upstream;
    if (!upstream.ready || !upstream.complete || !upstream.entityOverlapResolved || !upstream.proof || upstream.kind === 'UNKNOWN' ||
      (observation.subjectMemberKeys.length > 1 && upstream.kind !== 'METHOD_RESULT')) reasons.push('UPSTREAM_SCALAR_NOT_READY');
    if (row.windowKey && windowGroups.get(row.windowKey)!.length > 1) {
      const selected = selectedRevisions.get(row.windowKey);
      if (!selected) reasons.push('WINDOW_REVISION_UNRESOLVED');
      else if (selected !== observation.observationId) reasons.push('UNSELECTED_WINDOW_REVISION');
    }
    return reasons;
  }
  const timeKey = (row: Located): string => {
    const window = row.observation.observedWindow;
    return canonicalJson([window.basisKind, window.basisLiteral, window.boundaryConvention]);
  };
  const operations: TemporalWindowMethod['operations'] = input.requests.map(request => {
    const rows = request.observationIds.map(id => byId.get(id)!);
    const reasons: Reason[] = rows.length ? rows.flatMap(rowReasons) : ['NO_OPERANDS'];
    const keys = new Set(rows.map(row => row.seriesKey));
    if (keys.size > 1) reasons.push('SERIES_MISMATCH');
    if (new Set(rows.map(timeKey)).size > 1) reasons.push('TIME_BASIS_MISMATCH');
    const captureKeys = rows.map(row => canonicalJson([row.observation.source.sourceSha256, row.observation.source.fieldPointer]));
    if (new Set(captureKeys).size !== captureKeys.length) reasons.push('DUPLICATE_CAPTURE');
    let value: Rational | null = null;
    let operands = [...rows].sort(sortRows);
    if (request.operation === 'SUM_DISJOINT_WINDOWS') {
      if (rows.some(row => row.observation.measure.additive !== true || !sourceProof(row.observation.measure.additivityRef))) reasons.push('ADDITIVITY_NOT_PROVEN');
      if (rows.length && rows.every(row => row.observation.observedWindow.interval !== null)) {
        const spans = operands.map(row => interval(row.observation.observedWindow.interval!));
        const target = interval(request.targetInterval!);
        if (spans[0]!.start !== target.start || spans.at(-1)!.end !== target.end) reasons.push('TARGET_BOUNDARY_MISMATCH');
        let coveredEnd = spans[0]!.end;
        for (const span of spans.slice(1)) {
          if (span.start < coveredEnd) reasons.push('WINDOW_OVERLAP');
          if (span.start > coveredEnd) reasons.push('TARGET_GAP');
          coveredEnd = Math.max(coveredEnd, span.end);
        }
      }
      if (!reasons.length) value = operands.reduce((sum, row) => add(sum, decimal(row.observation.value.decimal!)), rational(0n));
    } else {
      const baseline = byId.get(request.baselineId!)!; const comparison = byId.get(request.comparisonId!)!;
      operands = [baseline, comparison];
      const baseWindow = baseline.observation.observedWindow; const compareWindow = comparison.observation.observedWindow;
      if (baseWindow.interval && compareWindow.interval) {
        const a = interval(baseWindow.interval); const b = interval(compareWindow.interval);
        if (b.start <= a.start) reasons.push('NOT_CHRONOLOGICAL');
        if (b.start < a.end && a.start < b.end) reasons.push('WINDOW_OVERLAP');
      }
      const durations = [baseWindow.duration, compareWindow.duration];
      if (durations.some(duration => duration.basis === 'UNKNOWN' || duration.value === null || !duration.unit?.trim() || !sourceProof(duration.proof) ||
        (duration.basis === 'SOURCE_CALENDAR_UNITS' && duration.unit !== 'calendar-day'))) reasons.push('DURATION_UNKNOWN');
      else if (canonicalJson(durations.map(({ proof: _proof, ...duration }) => duration)[0]) !==
        canonicalJson(durations.map(({ proof: _proof, ...duration }) => duration)[1])) reasons.push('DURATION_MISMATCH');
      if (request.operation === 'RELATIVE_CHANGE' && baseline.observation.value.decimal !== null && decimal(baseline.observation.value.decimal).n === 0n) reasons.push('BASELINE_ZERO');
      if (!reasons.length) {
        const base = decimal(baseline.observation.value.decimal!);
        value = subtract(decimal(comparison.observation.value.decimal!), base);
        if (request.operation === 'RELATIVE_CHANGE') value = relative(value, base);
      }
    }
    const policy = request.operation === 'RELATIVE_CHANGE' ? 'HALF_EVEN_2' :
      rows.length && rows.every(row => row.observation.measure.displayPolicy === rows[0]!.observation.measure.displayPolicy && row.observation.measure.displayPolicyRef !== null)
        ? rows[0]!.observation.measure.displayPolicy : 'UNKNOWN';
    const unique = [...new Set(reasons)];
    const subjectMemberKeys = fixedKeys(rows.flatMap(row => row.observation.subjectMemberKeys));
    const subjectComplete = rows.length > 0 && keys.size === 1 && !unique.some(reason => ['IDENTITY_UNRESOLVED', 'VALUE_NOT_EXACT', 'MEMBERSHIP_INCOMPLETE', 'UPSTREAM_SCALAR_NOT_READY', 'WINDOW_REVISION_UNRESOLVED', 'UNSELECTED_WINDOW_REVISION', 'DUPLICATE_CAPTURE'].includes(reason));
    return {
      operationId: request.operationId, operation: request.operation, status: unique.length ? 'UNAVAILABLE' : 'AVAILABLE', reasons: unique,
      seriesKey: keys.size === 1 ? rows[0]!.seriesKey : null, exact: value ? exact(value) : null,
      display: value ? policy === 'HALF_EVEN_2' ? halfEven2(value) : policy === 'EXACT_DECIMAL' ? exactDecimal(value) : null : null,
      displayPolicy: policy, operandPointers: operands.map(row => row.pointer),
      coverage: { requiredObservationIds: request.observationIds, exactObservationIds: rows.filter(row => ['EXACT', 'OBSERVED_ZERO'].includes(row.observation.value.state)).map(row => row.observation.observationId), subjectMemberKeys, frameMemberKeys: frameKeys,
        complete: subjectComplete, entireFrameComplete: subjectComplete && sameKeys(subjectMemberKeys, frameKeys) },
    };
  });
  const body: Omit<TemporalWindowMethod, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'source-compatible-temporal-v1', methodVersion: '1.0.0', inputSha256: digest(input), input,
    series: [...seriesMap.values()], operations,
    limitations: ['NORMALIZED_SOURCE_DECLARATIONS_NOT_VERIFIED_PROVIDER_TRUTH',
      'EXACT_BYTES_LOCATORS_RAW_PAYLOAD_HASHES_PROFILE_AND_MAPPING_REPLAY_REQUIRE_CALLER_VERIFICATION',
      'INVENTORY_DEFAULT_ONLY_REQUESTED_OPERATIONS_EXECUTED', 'SOURCE_MEASUREMENT_WINDOW_NOT_INFERRED_FROM_QUERY_OR_RETRIEVAL',
      'FIXED_SELECTED_FRAME_NOT_MARKET_POPULATION', 'UPSTREAM_SCALAR_COMPLETENESS_DECLARED_NOT_SELF_SUMMED_OR_REPAIRED',
      'NO_TIMEZONE_BOUNDARY_ADDITIVITY_OR_CALENDAR_DURATION_INFERENCE', 'NO_LATEST_WINS_INTERSECTION_OR_MISSING_TO_ZERO',
      'NO_FORECAST_SEASONALITY_CAUSAL_DEMAND_SHARE_OR_PER_DAY_RATE', 'OFFLINE_UNREVIEWED_METHOD_NOT_LIVE_OR_COMPLETE_M03_SECTION'],
  };
  const output: TemporalWindowMethod = { ...body, methodOutputId: digest(body) };
  if (!validateOutput(output)) fail(`INVALID_TEMPORAL_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.byteLength > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  return { output, bytes };
}

export function verifyTemporalWindowMethod(untrusted: unknown): { output: TemporalWindowMethod; bytes: Buffer } {
  if (Buffer.byteLength(canonicalJson(untrusted)) > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  if (!validateOutput(untrusted)) fail(`INVALID_TEMPORAL_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const rebuilt = buildTemporalWindowMethod((untrusted as TemporalWindowMethod).input);
  if (canonicalJson(untrusted) !== canonicalJson(rebuilt.output)) fail('TEMPORAL_REPLAY_MISMATCH');
  return rebuilt;
}
