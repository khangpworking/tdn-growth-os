import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/m02-scope-method.schema.json' with { type: 'json' };
import type { M02ScopeMethod } from '../../../contracts/analysis/m02-scope-method.generated.js';
import type { MetricScopeInput, Observation } from '../../../contracts/analysis/metric-scope-input.generated.js';
import type { MetricScopeOutput } from '../../../contracts/analysis/metric-scope-output.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedRawByteMapping, SourceBackedSourceProvenance } from './source-backed-report.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<M02ScopeMethod>(schema);

const digest = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');

function observationCoverage(records: MetricScopeInput['records'], key: 'revenue' | 'units') {
  const values = records.map(record => record[key]);
  const count = (predicate: (value: Observation) => boolean): number => values.filter(predicate).length;
  return {
    missing: count(value => value.state === 'missing'),
    observedZero: count(value => value.state === 'observed_zero'),
    observedValue: count(value => value.state === 'observed_value'),
    exact: count(value => value.precision === 'exact'),
    displayRounded: count(value => value.precision === 'display_rounded'),
    estimated: count(value => value.precision === 'estimated'),
    unknownPrecision: count(value => value.precision === 'unknown'),
    locatorCount: count(value => value.source.locator.length > 0),
  };
}

/** Deterministic M02 account. It records method/scope facts; it never writes narrative conclusions. */
export function buildM02ScopeMethod(
  input: MetricScopeInput,
  result: MetricScopeOutput,
  selectedSources: readonly SourceBackedSourceProvenance[],
  rawByteMappings: readonly SourceBackedRawByteMapping[],
): { readonly output: M02ScopeMethod; readonly bytes: Buffer } {
  if (canonicalJson(result.input) !== canonicalJson(input)) throw new TypeError('M02: RESULT_INPUT_MISMATCH');
  if (selectedSources.length < 2 || selectedSources.length > 3 || selectedSources.length !== rawByteMappings.length) {
    throw new TypeError('M02: SOURCE_MEMBERSHIP_MISMATCH');
  }
  for (const [index, source] of selectedSources.entries()) {
    const mapping = rawByteMappings[index];
    if (!mapping || mapping.role !== source.role || mapping.logicalPath !== source.logicalPath ||
        mapping.packageFileSha256 !== source.sha256 || mapping.rawByteSha256 !== source.sha256 ||
        mapping.byteSize !== source.byteSize || mapping.mediaType !== source.mediaType) {
      throw new TypeError('M02: RAW_MAPPING_MISMATCH');
    }
  }
  const labels = input.records.map(record => record.label);
  const labelCount = (predicate: (label: NonNullable<(typeof labels)[number]>) => boolean): number =>
    labels.filter((label): label is NonNullable<typeof label> => label !== null).filter(predicate).length;
  const payload = {
    contractVersion: '1.0.0',
    methodId: 'metric-scope-packet-context',
    methodVersion: '2.0.0',
    sourceVerification: 'EXACT_PACKAGE_BYTES_REPLAYED',
    scope: { ...input.scope, currency: 'VND' },
    measurement: {
      profileId: input.profileId,
      labelCodebookVersion: input.labelCodebookVersion,
      wideUnknownPolicy: input.wideUnknownPolicy,
      recordCount: input.records.length,
      labelIssueCount: result.labelIssues.length,
      recordLocatorCount: input.records.filter(record => record.source.locator.length > 0).length,
      revenue: observationCoverage(input.records, 'revenue'),
      units: observationCoverage(input.records, 'units'),
      labels: {
        labeled: labels.filter(label => label !== null).length,
        unlabeled: labels.filter(label => label === null).length,
        coreCandidate: labelCount(label => label.classification === 'CORE_CANDIDATE'),
        adjacent: labelCount(label => label.classification === 'ADJACENT'),
        outside: labelCount(label => label.classification === 'OUTSIDE'),
        unknown: labelCount(label => label.classification === 'UNKNOWN'),
        human: labelCount(label => label.adjudication === 'human'),
        assistant: labelCount(label => label.adjudication === 'assistant'),
        unadjudicated: labelCount(label => label.adjudication === 'unknown'),
      },
    },
    sources: selectedSources.map(source => ({
      role: source.role,
      logicalPath: source.logicalPath,
      sha256: source.sha256,
      byteSize: source.byteSize,
      mediaType: source.mediaType,
      evidenceFamily: source.evidenceFamily,
      representationRole: source.representationRole,
      independence: source.independence,
      providerProvenance: source.providerProvenance,
      provenanceBasis: source.provenanceBasis,
      period: source.period ?? null,
    })),
    rawByteMappings: rawByteMappings.map(mapping => ({
      role: mapping.role,
      logicalPath: mapping.logicalPath,
      packageFileSha256: mapping.packageFileSha256,
      rawByteSha256: mapping.rawByteSha256,
      byteSize: mapping.byteSize,
      mediaType: mapping.mediaType,
      exportPath: mapping.exportPath,
    })),
    limitations: [
      'OBSERVED_EXPORT_SCOPE_NOT_MARKET_UNIVERSE',
      'BYTE_VERIFICATION_DOES_NOT_AUTHENTICATE_PROVIDER_COLLECTION',
      'MISSING_AND_OBSERVED_ZERO_REMAIN_DISTINCT',
      'UNKNOWN_LABELS_REMAIN_VISIBLE_AND_FOLLOW_THE_EXPLICIT_WIDE_POLICY',
      'OWNER_REVIEW_REQUIRED_BEFORE_REPORT_USE',
    ],
  };
  const candidate: unknown = { ...payload, methodOutputId: digest(payload) };
  if (!validate(candidate)) throw new TypeError(`M02: INVALID_OUTPUT ${ajv.errorsText(validate.errors)}`);
  const output: M02ScopeMethod = candidate;
  return { output, bytes: Buffer.from(`${canonicalJson(output)}\n`, 'utf8') };
}
