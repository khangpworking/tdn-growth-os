import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/descriptive-market-methods.schema.json' with { type: 'json' };
import provenanceSchema from '../../../contracts/analysis/m13-provenance-appendix.schema.json' with { type: 'json' };
import type { DescriptiveMarketMethods } from '../../../contracts/analysis/descriptive-market-methods.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(provenanceSchema);
ajv.addSchema(schema);
type Input = DescriptiveMarketMethods['input'];
type Observation = Input['m05'][number];
type Ref = Observation['source'];
type Blocker = DescriptiveMarketMethods['sections']['M05']['blockers'][number];
type Partition = DescriptiveMarketMethods['sections']['M05']['partitions'][number];
type Located<T> = { row: T; pointer: string };
const validateInput = ajv.getSchema<Input>(`${schema.$id}#/$defs/input`)!;
const validateOutput = ajv.getSchema<DescriptiveMarketMethods>(schema.$id)!;
const MAX_BYTES = 8 * 1024 * 1024;
const compare = (a: string, b: string): number => a < b ? -1 : a > b ? 1 : 0;
const refKey = (ref: Ref): string => canonicalJson([ref.sourceSha256, ref.locator]);
const unique = (codes: Blocker[]): Blocker[] => [...new Set(codes)];

export class DescriptiveMarketValidationError extends TypeError {}

function fail(code: string): never { throw new DescriptiveMarketValidationError(code); }

function validatePeriod(period: Observation['period']): void {
  if (!period) return;
  if (period.start > period.end) fail('PERIOD_REVERSED');
  // Offsets and IANA zones are declarations, never inferred from local runtime time.
  if (/^[+-](0[0-9]|1[0-4]):[0-5][0-9]$/.test(period.timezone)) {
    if (/^[+-]14:(?!00)/.test(period.timezone)) fail('INVALID_TIMEZONE');
    return;
  }
  try { new Intl.DateTimeFormat('en', { timeZone: period.timezone }); }
  catch { fail('INVALID_TIMEZONE'); }
}

function validateObservation(row: Observation): void {
  validatePeriod(row.period);
  const { state, value } = row.observation;
  const zero = value !== null && BigInt(value.replace('.', '')) === 0n;
  if ((state === 'missing' || state === 'UNKNOWN') ? value !== null
    : value === null || (state === 'observed_zero' ? !zero : zero)) fail('VALUE_STATE_MISMATCH');
}

/** Validate normalized declarations. The caller still verifies retained package/config bytes and locators. */
export function validateDescriptiveMarketInput(untrusted: unknown): Input {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('INPUT_TOO_LARGE');
  if (!validateInput(untrusted)) fail(`INVALID_DESCRIPTIVE_MARKET_INPUT:${ajv.errorsText(validateInput.errors)}`);
  const input = JSON.parse(serialized) as Input;
  const paths = new Set<string>();
  const sources = new Map<string, Input['sources'][number]>();
  for (const source of input.sources) {
    if (paths.has(source.logicalPath)) fail('DUPLICATE_SOURCE_PATH');
    if (source.logicalPath.startsWith('/') || source.logicalPath.includes('\\') ||
      source.logicalPath.split('/').some(part => part === '..' || part === '.' || part === '') ||
      /^[a-z]:/i.test(source.logicalPath)) fail('INVALID_SOURCE_LOGICAL_PATH');
    paths.add(source.logicalPath);
    const previous = sources.get(source.sha256);
    if (previous && (previous.evidenceFamily !== source.evidenceFamily ||
      previous.providerProvenance !== source.providerProvenance)) fail('CONFLICTING_SOURCE_METADATA');
    sources.set(source.sha256, source);
  }
  function checkRefs(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(checkRefs); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('sourceSha256' in object && 'locator' in object) {
      if (!sources.has(object.sourceSha256 as string)) fail('UNKNOWN_EVIDENCE_SOURCE');
      if (!(object.locator as string).trim()) fail('SOURCE_LOCATOR_MISSING');
    }
    Object.values(object).forEach(checkRefs);
  }
  checkRefs(input);
  [...input.m05, ...input.m06.map(row => row.observation), ...input.m07].forEach(validateObservation);
  if (input.peerSet) {
    if (canonicalJson(input.peerSet.scope) !== canonicalJson(input.scope)) fail('PEER_DECLARATION_SCOPE_MISMATCH');
    if (input.peerSet.peerRefs.some(ref => refKey(ref) === refKey(input.peerSet!.anchorRef))) fail('ANCHOR_REPEATED_AS_PEER');
  }
  const eventRefs = new Set(input.m09.map(event => refKey(event.source)));
  for (const event of input.m09) {
    for (const conflict of event.conflictRefs) {
      if (!eventRefs.has(refKey(conflict))) fail('UNRESOLVED_EVENT_CONFLICT_REFERENCE');
      if (refKey(conflict) === refKey(event.source)) fail('SELF_EVENT_CONFLICT');
    }
  }
  return input;
}

function located<T>(rows: T[], section: string, source: (row: T) => Ref): Located<T>[] {
  const seen = new Map<string, string>();
  return rows.flatMap((row, index) => {
    const key = refKey(source(row));
    const bytes = canonicalJson(row);
    const previous = seen.get(key);
    if (previous !== undefined) {
      if (previous !== bytes) fail(`CONFLICTING_RECORD_REFERENCE:${section}:${index}`);
      return [];
    }
    seen.set(key, bytes);
    return [{ row, pointer: `/input/${section}/${index}` }];
  }).sort((a, b) => compare(refKey(source(a.row)), refKey(source(b.row))));
}

function observationBlockers(row: Observation): Blocker[] {
  const codes: Blocker[] = [];
  if (row.period === null) codes.push('PERIOD_MISSING');
  if (row.unit === null) codes.push('UNIT_MISSING');
  if (row.observation.state === 'missing') codes.push('VALUE_MISSING');
  if (row.observation.state === 'UNKNOWN') codes.push('VALUE_UNKNOWN');
  if (row.observation.value !== null && row.observation.precision !== 'exact') codes.push('NON_EXACT_VALUE');
  return codes;
}

// Existing calculators keep their arithmetic private. This bounded sum uses their
// BigInt convention, retaining the greatest source decimal precision without rounding.
function sumDecimals(values: string[]): string | null {
  if (!values.length) return null;
  const scale = Math.max(...values.map(value => value.split('.')[1]?.length ?? 0));
  const total = values.reduce((sum, value) => {
    const [whole, fraction = ''] = value.replace('-', '').split('.');
    const magnitude = BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
    return sum + (value.startsWith('-') ? -magnitude : magnitude);
  }, 0n);
  const magnitude = (total < 0n ? -total : total).toString().padStart(scale + 1, '0');
  return `${total < 0n ? '-' : ''}${scale ? `${magnitude.slice(0, -scale)}.${magnitude.slice(-scale)}` : magnitude}`;
}

function partitionKey(row: Observation): string {
  return canonicalJson([row.measureLiteral, row.period, row.source.sourceSha256, row.measureDefinition, row.unit, row.scope]);
}

function aggregate(rows: Located<Observation>[]): Partition {
  const first = rows[0]!.row;
  const blockers = unique(rows.flatMap(({ row }) => observationBlockers(row)));
  const coverage = {
    observedCount: rows.filter(({ row }) => row.observation.value !== null).length,
    zeroCount: rows.filter(({ row }) => row.observation.state === 'observed_zero').length,
    missingCount: rows.filter(({ row }) => row.observation.state === 'missing').length,
    unknownCount: rows.filter(({ row }) => row.observation.state === 'UNKNOWN').length,
    nonExactCount: rows.filter(({ row }) => row.observation.value !== null && row.observation.precision !== 'exact').length,
  };
  const firstAggregation = first.aggregation;
  const frameKey = (aggregation: NonNullable<Observation['aggregation']>): string => canonicalJson([
    aggregation.aggregationUnit, aggregation.sourceKeyNamespace,
    [...aggregation.requiredMemberKeys].sort(compare), aggregation.proof,
  ]);
  const members = new Set<string>();
  const memberLocators = new Set<string>();
  for (const { row } of rows) {
    const aggregation = row.aggregation;
    if (!aggregation?.additive) blockers.push('ADDITIVITY_UNDECLARED');
    if (!aggregation) { blockers.push('AGGREGATION_OVERLAP_UNRESOLVED'); continue; }
    if (!firstAggregation || frameKey(aggregation) !== frameKey(firstAggregation)) blockers.push('AGGREGATION_FRAME_INCOMPATIBLE');
    for (const member of aggregation.members) {
      if (!aggregation.requiredMemberKeys.includes(member.sourceKey)) blockers.push('AGGREGATION_FRAME_INCOMPATIBLE');
      if (members.has(member.sourceKey) || memberLocators.has(refKey(member.source))) blockers.push('AGGREGATION_OVERLAP_UNRESOLVED');
      members.add(member.sourceKey);
      memberLocators.add(refKey(member.source));
    }
  }
  if (firstAggregation && firstAggregation.requiredMemberKeys.some(key => !members.has(key))) blockers.push('MEMBERSHIP_INCOMPLETE');
  const arithmeticBlocked = blockers.some(code => [
    'PERIOD_MISSING', 'UNIT_MISSING', 'ADDITIVITY_UNDECLARED', 'AGGREGATION_OVERLAP_UNRESOLVED',
    'AGGREGATION_FRAME_INCOMPATIBLE', 'NON_EXACT_VALUE',
  ].includes(code));
  const values = rows.flatMap(({ row }) => row.observation.value === null ? [] : [row.observation.value]);
  const subtotal = arithmeticBlocked ? null : sumDecimals(values);
  return {
    recordPointers: rows.map(row => row.pointer), measureLiteral: first.measureLiteral,
    unit: first.unit, period: first.period, scope: first.scope, subtotal,
    complete: subtotal !== null && blockers.length === 0, coverage, blockers: unique(blockers),
  };
}

function comparePeers(input: Input, rows: Located<Observation>[]): DescriptiveMarketMethods['sections']['M07'] {
  const peers = input.peerSet;
  if (!peers) return {
    mode: 'UNRANKED_INVENTORY', recordPointers: rows.map(row => row.pointer), comparisons: [],
    blockers: ['M07_PEER_SET_UNAPPROVED', ...(rows.length ? [] : ['NO_LOCATED_RECORDS' as const])],
  };
  const byRef = new Map(rows.map(row => [refKey(row.row.source), row]));
  const anchor = byRef.get(refKey(peers.anchorRef));
  const comparisons = peers.peerRefs.map(peerRef => {
    const peer = byRef.get(refKey(peerRef));
    const blockers: Blocker[] = [];
    if (!anchor || !peer) blockers.push('M07_IDENTITY_UNRESOLVED');
    if (anchor && peer) {
      const a = anchor.row;
      const p = peer.row;
      blockers.push(...observationBlockers(a), ...observationBlockers(p));
      if (canonicalJson(a.period) !== canonicalJson(p.period)) blockers.push('M07_PERIOD_INCOMPATIBLE');
      if (canonicalJson([a.measureLiteral, a.measureDefinition, a.unit, a.scope]) !==
        canonicalJson([p.measureLiteral, p.measureDefinition, p.unit, p.scope]) ||
        canonicalJson(a.scope) !== canonicalJson(peers.scope)) blockers.push('M07_UNIVERSE_OR_MEASURE_INCOMPATIBLE');
    }
    return {
      anchorRef: peers.anchorRef, peerRef, anchorPointer: anchor?.pointer ?? null, peerPointer: peer?.pointer ?? null,
      compatibility: blockers.length ? 'NOT_COMPARABLE' as const : 'COMPARABLE' as const, blockers: unique(blockers),
    };
  });
  const declaredOrder = [peers.anchorRef, ...peers.peerRefs].flatMap(ref => {
    const record = byRef.get(refKey(ref));
    return record ? [record.pointer] : [];
  });
  return {
    mode: 'DECLARED_PEERS_SIDE_BY_SIDE',
    recordPointers: declaredOrder,
    comparisons, blockers: unique(comparisons.flatMap(row => row.blockers)),
  };
}

/** Pure offline section output; input is retained verbatim as normalized source declarations, never authenticated here. */
export function buildDescriptiveMarketMethods(untrustedInput: unknown, options: { methodVersion?: '1.0.0' | '1.1.0' } = {}): { output: DescriptiveMarketMethods; bytes: Buffer } {
  const input = validateDescriptiveMarketInput(untrustedInput);
  const m05 = located(input.m05, 'm05', row => row.source);
  const grouped = new Map<string, Located<Observation>[]>();
  for (const row of m05) {
    const key = partitionKey(row.row);
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  }
  const partitions = [...grouped].sort(([a], [b]) => compare(a, b)).map(([, rows]) => aggregate(rows));
  const m06 = located(input.m06, 'm06', row => row.observation.source);
  const m07 = located(input.m07, 'm07', row => row.source);
  const m09 = located(input.m09, 'm09', row => row.source).sort((a, b) => {
    const dates = compare(a.row.eventDate ?? '9999-99-99', b.row.eventDate ?? '9999-99-99');
    return dates || compare(refKey(a.row.source), refKey(b.row.source));
  });
  const events = m09.map(({ row, pointer }) => {
    const blockers: Blocker[] = [];
    if (row.eventDate === null) blockers.push('M09_EVENT_DATE_UNKNOWN');
    if (row.targetLink === null) blockers.push('M09_ENTITY_LINK_UNRESOLVED');
    if (row.conflictRefs.length) blockers.push('M09_COUNTEREVIDENCE_CONFLICT');
    return { recordPointer: pointer, blockers };
  });
  const body: Omit<DescriptiveMarketMethods, 'methodOutputId'> = {
    contractVersion: '1.0.0', methodId: 'source-bound-descriptive-market', methodVersion: options.methodVersion ?? '1.1.0', input,
    sections: {
      M05: { locatedRecordCount: m05.length, partitions, blockers: unique([
        ...(m05.length ? [] : ['NO_LOCATED_RECORDS' as const]), ...partitions.flatMap(partition => partition.blockers),
      ]) },
      M06: {
        locatedRecordCount: m06.length, recordPointers: m06.map(row => row.pointer), uniqueEntityCount: null,
        blockers: unique([...(m06.length ? [] : ['NO_LOCATED_RECORDS' as const]),
          ...m06.flatMap(({ row }) => observationBlockers(row.observation))]),
      },
      M07: comparePeers(input, m07),
      M09: { locatedRecordCount: m09.length, events, blockers: unique([
        ...(m09.length ? [] : ['NO_LOCATED_RECORDS' as const]), ...events.flatMap(event => event.blockers),
      ]) },
    },
    limitations: [
      'NORMALIZED_SOURCE_DECLARATIONS_NOT_PROVIDER_AUTHENTICATION',
      'EXACT_PACKAGE_BYTES_AND_LOCATORS_REQUIRE_CALLER_VERIFICATION',
      'SOURCE_WORDING_IS_ATTRIBUTED_INERT_TEXT_NOT_A_CONCLUSION',
      options.methodVersion === '1.0.0' ? 'M05_LITERAL_SOURCE_MEASURES_NOT_DEMAND_OR_MARKET_SIZE' : 'M05_ESTIMATED_SALES_IN_SAMPLE_DEMAND_PER_PLATFORM_SEARCH_SEPARATE',
      'SUBTOTAL_COMPLETENESS_ONLY_FOR_DECLARED_SOURCE_MEMBER_FRAME',
      'M06_LOCATED_RECORDS_NOT_UNIQUE_ENTITIES_STOCK_OR_TOTAL_SUPPLY',
      'M07_OWNER_DECLARED_SIDE_BY_SIDE_NO_RANK_SCORE_DIFFERENCE_OR_RATIO',
      'M09_ATTRIBUTED_EVENT_INVENTORY_NOT_CAUSAL_IMPACT_OR_FORECAST',
      'NO_RATE_POPULATION_INFERENCE_OR_MARKET_SHARE',
      'UNREVIEWED_BOUNDED_METHOD_OUTPUT_NOT_COMPLETE_SECTION',
    ],
  };
  const output: DescriptiveMarketMethods = {
    ...body, methodOutputId: createHash('sha256').update(canonicalJson(body)).digest('hex'),
  };
  if (!validateOutput(output)) fail(`INVALID_DESCRIPTIVE_MARKET_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const bytes = Buffer.from(`${canonicalJson(output)}\n`);
  if (bytes.byteLength > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  return { output, bytes };
}

/** Recompute all section content, not just its digest, before accepting a retained normalized output. */
export function verifyDescriptiveMarketMethods(untrustedOutput: unknown): { output: DescriptiveMarketMethods; bytes: Buffer } {
  if (!validateOutput(untrustedOutput)) fail(`INVALID_DESCRIPTIVE_MARKET_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const rebuilt = buildDescriptiveMarketMethods((untrustedOutput as DescriptiveMarketMethods).input, { methodVersion: (untrustedOutput as DescriptiveMarketMethods).methodVersion });
  if (canonicalJson(untrustedOutput) !== canonicalJson(rebuilt.output)) fail('DESCRIPTIVE_MARKET_REPLAY_MISMATCH');
  return rebuilt;
}

/**
 * Verify a previously committed v1 snapshot without executing today's method.
 * Only callers that also verify the owning immutable report and retained source
 * package may use this. New/imported calculations still require full replay.
 */
export function verifyDescriptiveMarketSnapshot(untrustedOutput: unknown): DescriptiveMarketMethods {
  if (!validateOutput(untrustedOutput)) fail(`INVALID_DESCRIPTIVE_MARKET_OUTPUT:${ajv.errorsText(validateOutput.errors)}`);
  const serialized = canonicalJson(untrustedOutput);
  if (Buffer.byteLength(serialized) > MAX_BYTES) fail('OUTPUT_TOO_LARGE');
  const output = JSON.parse(serialized) as DescriptiveMarketMethods;
  const { methodOutputId, ...body } = output;
  if (createHash('sha256').update(canonicalJson(body)).digest('hex') !== methodOutputId) fail('DESCRIPTIVE_MARKET_SNAPSHOT_DIGEST_MISMATCH');
  return output;
}
