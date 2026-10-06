import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../../contracts/analysis/automation-source-claims.schema.json' with { type: 'json' };
import referenceSchema from '../../../../contracts/analysis/automation-source-claims-reference.schema.json' with { type: 'json' };
import type { AutomationSourceClaimsReference } from '../../../../contracts/analysis/automation-source-claims-reference.generated.js';
import type { AutomationSourceClaims as AutomationSourceClaimsContract } from '../../../../contracts/analysis/automation-source-claims.generated.js';
import type { DescriptiveMarketMethods, MarketObservationScope } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { AutomationLocatedReviewAdoptedSnapshot } from './located-review-bridge.js';
import type { NativeSourceReviewSnapshot } from './native-source-review-bridge.js';
import type { ScopeSnapshot } from './model.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { verifyDescriptiveMarketSnapshot } from '../descriptive-market-methods.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateSchema = ajv.compile<AutomationSourceClaimsArtifact>(schema);
const validateReferenceSchema = ajv.compile<AutomationSourceClaimsReference>(referenceSchema);

const DIGEST = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const MAX_SOURCE_CLAIMS_BYTES = 64 * 1024 * 1024;
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const same = (left: unknown, right: unknown): boolean => canonicalJson(left) === canonicalJson(right);
export class AutomationSourceClaimsValidationError extends TypeError {}
function fail(code: string): never { throw new AutomationSourceClaimsValidationError(code); }

export function validateAutomationSourceClaimsReference(value: unknown): AutomationSourceClaimsReference {
  if (!validateReferenceSchema(value)) fail('INVALID_SOURCE_CLAIMS_REFERENCE');
  return value as AutomationSourceClaimsReference;
}

export type AutomationSourceClaimsArtifact = AutomationSourceClaimsContract;
export type AutomationSourceClaim = AutomationSourceClaimsArtifact['claims'][number];
export type SourceClaimsSectionId = AutomationSourceClaim['sectionId'];
export type SourceClaimsArtifact = AutomationSourceClaim['method']['artifact'];
export type SourceClaimSpan = AutomationSourceClaim['source']['spans'][number];
export type SourceClaimPeriod = NonNullable<AutomationSourceClaim['observation']['period']>;
export type SourceClaimScope = AutomationSourceClaim['observation']['scope'];
export type SourceClaimCoverage = AutomationSourceClaim['observation']['coverage'];
export type SourceClaimDeclaration = NonNullable<AutomationSourceClaim['declaration']>;

export interface SourceClaimsRunInput {
  readonly runId: string;
  readonly workspaceId: string;
}

export interface SourceClaimsDescriptiveInput {
  /** Must already have passed the owning automation method verifier. */
  readonly output: DescriptiveMarketMethods;
}

export interface SourceClaimsLocatedInput {
  /** Must be an adopted snapshot returned by the owning native/located verifier. */
  readonly snapshot: AutomationLocatedReviewAdoptedSnapshot | NativeSourceReviewSnapshot;
}

export interface AutomationSourceClaimsBuildInput {
  readonly run: SourceClaimsRunInput;
  /** The exact frozen scope snapshot. Its digest is computed here; callers cannot author a scope hash. */
  readonly scope: ScopeSnapshot;
  readonly descriptive?: SourceClaimsDescriptiveInput;
  readonly located?: SourceClaimsLocatedInput;
  readonly native?: SourceClaimsLocatedInput;
}

const unique = (values: readonly string[]): [string, ...string[]] => {
  const result = [...new Set(values)];
  if (!result.length) fail('CLAIM_LIMITATIONS_REQUIRED');
  return result as [string, ...string[]];
};
const text = (value: unknown, code: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) fail(code);
  return value;
};
const digest = (value: unknown, code: string): string => {
  const result = text(value, code);
  if (!DIGEST.test(result)) fail(code);
  return result;
};
const uuid = (value: unknown, code: string): string => {
  const result = text(value, code);
  if (!UUID.test(result)) fail(code);
  return result;
};

function packageIdentity(value: unknown, code = 'SOURCE_PACKAGE_IDENTITY_INVALID'): SourceClaimsArtifact {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const object = value as Record<string, unknown>;
  const manifest = object.manifest;
  const manifestObject = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    ? manifest as Record<string, unknown> : undefined;
  const packageId = uuid(object.packageId, code);
  const version = typeof object.version === 'number' ? object.version
    : typeof manifestObject?.version === 'number' ? manifestObject.version : NaN;
  const manifestArtifactSha256 = digest(object.manifestArtifactSha256, code);
  const packageContentSha256 = digest(object.packageContentSha256 ?? manifestObject?.packageContentSha256, code);
  if (!Number.isSafeInteger(version) || version < 1) fail(code);
  if (manifestObject && (manifestObject.packageId !== packageId || manifestObject.version !== version ||
      manifestObject.packageContentSha256 !== packageContentSha256)) fail('SOURCE_PACKAGE_MANIFEST_IDENTITY_MISMATCH');
  return { packageId, version, manifestArtifactSha256, packageContentSha256 };
}

function claimScope(scopeSha256: string, sourceScope: MarketObservationScope | undefined, description: string): SourceClaimScope {
  return {
    scopeSha256,
    universe: sourceScope?.universe ?? null,
    geography: sourceScope?.geography ?? null,
    frame: sourceScope?.frame ?? null,
    inclusionRule: sourceScope?.inclusionRule ?? null,
    exclusionRule: sourceScope?.exclusionRule ?? null,
    variantRule: sourceScope?.variantRule ?? null,
    description,
  };
}

function period(value: DescriptiveMarketMethods['input']['m05'][number]['period']): SourceClaimPeriod | null {
  return value === null ? null : { start: value.start, end: value.end, timezone: value.timezone, basis: value.basis };
}

function coverageForM05(value: DescriptiveMarketMethods['sections']['M05']['partitions'][number]['coverage']): SourceClaimCoverage {
  return { ...value, unit: 'SOURCE_OBSERVATIONS', description: 'Phủ theo partition thước đo nguồn; không phải người, hộ, nhu cầu hoặc toàn thị trường.' };
}

function declarationCoverage(): SourceClaimCoverage {
  return { unit: 'LOCATED_RECORDS', observedCount: 1, zeroCount: 0, missingCount: 0, unknownCount: 0, nonExactCount: 0,
    description: 'Một bản ghi nguồn được định vị; không phải số người, tỷ lệ hoặc quần thể.' };
}

function withClaimId(claim: Omit<AutomationSourceClaim, 'claimId'>): AutomationSourceClaim {
  return { ...claim, claimId: sha256(canonicalJson(claim)) };
}

function m05Pointer(pointer: string): number {
  const match = /^\/input\/m05\/(0|[1-9][0-9]*)$/.exec(pointer);
  if (!match) fail('M05_METHOD_POINTER_INVALID');
  return Number(match[1]);
}

function sourceFor(input: DescriptiveMarketMethods['input'], sourcePackage: SourceClaimsArtifact, sourceSha256: string, locator: string,
  statement: string | null, attribution: string | null, spans: readonly SourceClaimSpan[]) {
  const source = input.sources.find(value => value.sha256 === sourceSha256);
  if (!source) fail('SOURCE_FILE_REFERENCE_UNKNOWN');
  return { package: sourcePackage, logicalPath: source.logicalPath, sha256: source.sha256, locator,
    recordLocator: null, statement, attribution, spans: [...spans] };
}

function m05Claims(outputInput: SourceClaimsDescriptiveInput, scopeSha256: string): AutomationSourceClaim[] {
  const methods = verifyDescriptiveMarketSnapshot(outputInput.output);
  const methodPackage = packageIdentity(methods.input.sourcePackage);
  const sourceMetadata = new Map<string, { logicalPath: string; evidenceFamily: string; providerProvenance: string }>();
  const sourcePaths = new Set<string>();
  for (const source of methods.input.sources) {
    if (sourcePaths.has(source.logicalPath)) fail('SOURCE_FILE_PATH_DUPLICATE');
    sourcePaths.add(source.logicalPath);
    const prior = sourceMetadata.get(source.sha256);
    const metadata = { logicalPath: source.logicalPath, evidenceFamily: source.evidenceFamily, providerProvenance: source.providerProvenance };
    if (prior && !same(prior, metadata)) fail('SOURCE_FILE_IDENTITY_CONFLICT');
    sourceMetadata.set(source.sha256, metadata);
  }
  const byPointer = new Map<string, { partition: DescriptiveMarketMethods['sections']['M05']['partitions'][number]; index: number }>();
  for (const partition of methods.sections.M05.partitions) {
    for (const pointer of partition.recordPointers) {
      if (byPointer.has(pointer)) fail('M05_METHOD_POINTER_DUPLICATE');
      byPointer.set(pointer, { partition, index: m05Pointer(pointer) });
    }
  }
  const claims: AutomationSourceClaim[] = [];
  for (const [pointer, located] of byPointer) {
    const row = methods.input.m05[located.index];
    if (!row) fail('M05_METHOD_POINTER_UNRESOLVED');
    const observation = row.observation;
    if (observation.state !== 'observed_value' && observation.state !== 'observed_zero') continue;
    if (observation.value === null) fail('M05_OBSERVATION_VALUE_MISSING');
    const zero = BigInt(observation.value.replace('.', '')) === 0n;
    if ((observation.state === 'observed_zero') !== zero || (observation.state === 'observed_value' && zero))
      fail('M05_OBSERVATION_STATE_MISMATCH');
    const source = sourceFor(methods.input, methodPackage, row.source.sourceSha256, row.source.locator, row.sourceWording, null, []);
    const limitations = unique([...methods.limitations, ...located.partition.blockers.map(code => `M05_BLOCKER:${code}`),
      'SOURCE_STATED_MEASURE_IS_NOT_DEMAND_OR_MARKET_SIZE', 'LOCATED_RECORD_IS_NOT_A_PERSON_OR_POPULATION']);
    const body: Omit<AutomationSourceClaim, 'claimId'> = {
      sectionId: 'M05',
      method: { methodId: methods.methodId, methodVersion: methods.methodVersion, methodOutputId: methods.methodOutputId,
        artifact: methodPackage, outputPointer: pointer },
      source,
      observation: {
        basis: 'SOURCE_OBSERVED', state: observation.state,
        measure: { literal: row.measureLiteral, definition: row.measureDefinition, entityLabel: row.entityLabel },
        value: observation.value, unit: row.unit,
        precision: observation.precision, period: period(row.period), periodText: null,
        scope: claimScope(scopeSha256, row.scope, 'Source-declared M05 observation scope; not a market universe.'),
        coverage: coverageForM05(located.partition.coverage), limitations,
      },
      declaration: null, limitations,
    };
    claims.push(withClaimId(body));
  }
  return claims;
}

type AdoptedSnapshot = AutomationLocatedReviewAdoptedSnapshot | NativeSourceReviewSnapshot;
type SpanValue = { readonly start: number; readonly end: number; readonly quote: string };

function recordAt(output: LocatedInsightMethods, index: unknown): LocatedInsightMethods['input']['records'][number] {
  if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= output.input.records.length) fail('DECLARATION_RECORD_REFERENCE_INVALID');
  const record = output.input.records[index];
  if (!record || record.disposition !== 'INCLUDED' || record.text === null || record.text.trim().length === 0) fail('DECLARATION_RECORD_NOT_ELIGIBLE');
  return record;
}

function isSpan(value: unknown): value is SpanValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const object = value as Record<string, unknown>;
  return Number.isInteger(object.start) && Number.isInteger(object.end) && typeof object.quote === 'string';
}

function collectSpans(value: unknown, role: SourceClaimSpan['role'] = 'CONTEXT', sink: SourceClaimSpan[] = []): SourceClaimSpan[] {
  if (isSpan(value)) {
    sink.push({ role, start: value.start, end: value.end, quote: value.quote });
    return sink;
  }
  if (Array.isArray(value)) { for (const item of value) collectSpans(item, role, sink); return sink; }
  if (!value || typeof value !== 'object') return sink;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'provenance' || key === 'recordIndex') continue;
    const childRole = key === 'qualifiers' ? 'QUALIFIER' : key === 'counterevidence' ? 'COUNTEREVIDENCE'
      : key === 'span' || /(?:Clause|choiceText|attemptedTask|firstEvent|secondEvent)$/.test(key) ? 'DECLARATION' : role;
    collectSpans(child, childRole, sink);
  }
  return sink;
}

function verifySpan(textValue: string, span: SourceClaimSpan): void {
  if (span.start < 0 || span.start >= span.end || span.end > textValue.length || textValue.slice(span.start, span.end) !== span.quote)
    fail('DECLARATION_SOURCE_SPAN_MISMATCH');
  for (const offset of [span.start, span.end]) {
    if (offset > 0 && offset < textValue.length && /[\uD800-\uDBFF]/.test(textValue[offset - 1]!) && /[\uDC00-\uDFFF]/.test(textValue[offset]!))
      fail('DECLARATION_SOURCE_SPAN_MISMATCH');
  }
}

function provenance(value: unknown): SourceClaimDeclaration['provenance'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('DECLARATION_PROVENANCE_MISSING');
  const object = value as Record<string, unknown>;
  if (object.basis !== 'DECLARED' || typeof object.coderRole !== 'string' || !object.coderRole.trim() ||
      (object.adjudication !== null && typeof object.adjudication !== 'string') ||
      (object.disagreement !== null && typeof object.disagreement !== 'string')) fail('DECLARATION_PROVENANCE_NOT_DECLARED');
  return { basis: 'DECLARED', coderRole: object.coderRole, adjudication: object.adjudication as string | null, disagreement: object.disagreement as string | null };
}

function adoptedSnapshot(snapshot: AdoptedSnapshot, expectedRunId: string): { output: LocatedInsightMethods; packageIdentity: SourceClaimsArtifact } {
  if (!snapshot || snapshot.authorityState !== 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS' ||
      !['automation-located-review-snapshot-v2', 'automation-native-review-snapshot-v1', 'automation-native-review-snapshot-v2'].includes(snapshot.contractVersion))
    fail('DECLARATION_SNAPSHOT_NOT_ADOPTED');
  if (snapshot.runId !== expectedRunId) fail('DECLARATION_SNAPSHOT_RUN_ID_MISMATCH');
  const output = snapshot.output;
  if (!output || typeof output !== 'object') fail('DECLARATION_OUTPUT_MISSING');
  const { methodOutputId, ...body } = output;
  if (sha256(canonicalJson(body)) !== methodOutputId) fail('DECLARATION_METHOD_OUTPUT_DIGEST_MISMATCH');
  const packageValue = packageIdentity(snapshot.sourcePackage);
  // The owning bridge has already verified package membership and bytes. The
  // adapter only checks the frozen method's declared source metadata and does
  // not reopen or reverify package files.
  const sourceMetadata = new Map<string, { logicalPath: string }>();
  const sourcePaths = new Set<string>();
  for (const source of output.input.sources) {
    if (sourcePaths.has(source.logicalPath)) fail('DECLARATION_SOURCE_FILE_PATH_DUPLICATE');
    sourcePaths.add(source.logicalPath);
    const prior = sourceMetadata.get(source.sha256);
    if (prior && prior.logicalPath !== source.logicalPath) fail('DECLARATION_SOURCE_FILE_IDENTITY_CONFLICT');
    sourceMetadata.set(source.sha256, { logicalPath: source.logicalPath });
  }
  return { output, packageIdentity: packageValue };
}

function locatedClaims(input: SourceClaimsLocatedInput, scopeSha256: string, runId: string): AutomationSourceClaim[] {
  const { output, packageIdentity: methodPackage } = adoptedSnapshot(input.snapshot, runId);
  const projection = (input.snapshot as unknown as { projection: Record<string, unknown> }).projection;
  if (!projection || typeof projection !== 'object' || Array.isArray(projection)) fail('DECLARATION_PROJECTION_MISSING');
  if (projection.policyRevision !== 'literal-source-bound-v1') fail('DECLARATION_PROJECTION_POLICY_INVALID');
  const candidates = projection.candidates;
  const admitted = projection.admitted;
  if (!candidates || typeof candidates !== 'object' || Array.isArray(candidates) || !Array.isArray(admitted)) fail('DECLARATION_PROJECTION_INVALID');
  const claims: AutomationSourceClaim[] = [];
  for (const sectionId of ['I02', 'I04'] as const) {
    const key = sectionId.toLowerCase();
    const candidateRows = (candidates as Record<string, unknown>)[key];
    const outputRows = (output.input as unknown as Record<string, unknown[]>)[key];
    if (!Array.isArray(candidateRows) || !Array.isArray(outputRows)) fail('DECLARATION_PROJECTION_SECTION_INVALID');
    if (!same(candidateRows, outputRows)) fail('DECLARATION_PROJECTION_OUTPUT_MISMATCH');
    const refs = admitted.filter((value: unknown) => value && typeof value === 'object' && (value as Record<string, unknown>).family === sectionId);
    if (refs.length !== outputRows.length) fail('DECLARATION_PROJECTION_ADMISSION_COUNT_MISMATCH');
    // The bridge binds candidateIndex to its retained diagnostics candidate
    // list. This artifact carries only the accepted projection rows, so the
    // owning verifier, not this pure adapter, proves that cross-package index.
    refs.forEach((value: unknown) => {
      const candidateIndex = (value as Record<string, unknown>).candidateIndex;
      if (typeof candidateIndex !== 'number' || !Number.isInteger(candidateIndex) || candidateIndex < 0)
        fail('DECLARATION_PROJECTION_CANDIDATE_REFERENCE_INVALID');
    });
    outputRows.forEach((candidate, outputIndex) => {
      if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) fail('DECLARATION_CANDIDATE_INVALID');
      const row = candidate as Record<string, unknown>;
      const section = output.sections[sectionId];
      const outputPointer = `/input/${key}/${outputIndex}`;
      if (!section.annotationPointers.includes(outputPointer)) fail('DECLARATION_OUTPUT_POINTER_NOT_ADMITTED');
      const record = recordAt(output, row.recordIndex);
      const source = output.input.sources.find(value => value.sha256 === record.sourceSha256);
      if (!source) fail('DECLARATION_SOURCE_REFERENCE_INVALID');
      const spans = collectSpans(row);
      if (!spans.length) fail('DECLARATION_SOURCE_SPAN_REQUIRED');
      const uniqueSpans = [...new Map(spans.map(span => [canonicalJson({ start: span.start, end: span.end, quote: span.quote }), span])).values()];
      uniqueSpans.forEach(span => verifySpan(record.text!, span));
      const admittedSpans = refs[outputIndex] && typeof refs[outputIndex] === 'object'
        ? (refs[outputIndex] as Record<string, unknown>).spans : undefined;
      if (!Array.isArray(admittedSpans) || !same(admittedSpans, uniqueSpans.map(({ start, end, quote }) => ({ start, end, quote }))))
        fail('DECLARATION_PROJECTION_SPANS_MISMATCH');
      const declarationProvenance = provenance(row.provenance);
      const annotationAttribution = typeof row.attribution === 'string' ? row.attribution : null;
      const limitations = unique([
        ...output.limitations,
        'DECLARED_SOURCE_READING_NOT_AUTHENTICATED_OR_OWNER_APPROVED',
        'LOCATED_RECORD_IS_NOT_A_PERSON_OR_POPULATION',
        'EMPTY_COUNTEREVIDENCE_MEANS_NONE_ENCODED_NOT_NONE_EXISTS',
      ]);
      const body: Omit<AutomationSourceClaim, 'claimId'> = {
        sectionId,
        method: { methodId: output.methodId, methodVersion: output.methodVersion, methodOutputId: output.methodOutputId,
          artifact: methodPackage, outputPointer: `/input/${key}/${outputIndex}` },
        source: { package: methodPackage, logicalPath: source.logicalPath, sha256: source.sha256, locator: record.locator,
          recordLocator: record.locator, statement: null, attribution: record.sourceAttribution, spans: uniqueSpans },
        observation: {
          basis: 'DECLARED', state: 'DECLARED', measure: null, value: null, unit: null, precision: 'not_applicable', period: null,
          periodText: record.timeText, scope: claimScope(scopeSha256, undefined, 'Frozen automation scope; declaration has no structured source measure scope.'),
          coverage: declarationCoverage(), limitations,
        },
        declaration: { sourceAttribution: record.sourceAttribution, annotationAttribution, provenance: declarationProvenance },
        limitations,
      };
      claims.push(withClaimId(body));
    });
  }
  return claims;
}

function validateClaimIdentity(claim: AutomationSourceClaim, scopeSha256: string): void {
  const { claimId, ...body } = claim;
  if (sha256(canonicalJson(body)) !== claimId) fail('CLAIM_IDENTITY_MISMATCH');
  if (claim.sectionId === 'M05' && (claim.observation.basis !== 'SOURCE_OBSERVED' || claim.declaration !== null)) fail('M05_BASIS_INVALID');
  if ((claim.sectionId === 'I02' || claim.sectionId === 'I04') && (claim.observation.basis !== 'DECLARED' || claim.declaration === null)) fail('DECLARATION_BASIS_INVALID');
  if (claim.observation.scope.scopeSha256 !== scopeSha256) fail('CLAIM_SCOPE_INVALID');
  if (claim.source.package.packageId !== claim.method.artifact.packageId || claim.source.package.version !== claim.method.artifact.version ||
      claim.source.package.manifestArtifactSha256 !== claim.method.artifact.manifestArtifactSha256 || claim.source.package.packageContentSha256 !== claim.method.artifact.packageContentSha256)
    fail('CLAIM_PACKAGE_IDENTITY_MISMATCH');
  for (const span of claim.source.spans) if (span.start >= span.end) fail('CLAIM_SPAN_INVALID');
}

/** Validate and canonicalize a retained source-claim artifact. No provider or source call is made. */
export function validateAutomationSourceClaims(untrusted: unknown): AutomationSourceClaimsArtifact {
  const serialized = canonicalJson(untrusted);
  if (Buffer.byteLength(serialized) > MAX_SOURCE_CLAIMS_BYTES) fail('SOURCE_CLAIMS_TOO_LARGE');
  if (!validateSchema(untrusted)) fail(`INVALID_SOURCE_CLAIMS:${ajv.errorsText(validateSchema.errors)}`);
  const output = JSON.parse(serialized) as AutomationSourceClaimsArtifact;
  if (output.claimsSha256 !== sha256(canonicalJson(output.claims))) fail('CLAIMS_DIGEST_MISMATCH');
  const ids = new Set<string>();
  for (const claim of output.claims) {
    if (ids.has(claim.claimId)) fail('DUPLICATE_CLAIM_ID');
    ids.add(claim.claimId);
    validateClaimIdentity(claim, output.scopeSha256);
    const observation = claim.observation;
    if (observation.basis === 'SOURCE_OBSERVED') {
      if ((observation.state !== 'observed_value' && observation.state !== 'observed_zero') || observation.value === null || observation.measure === null)
        fail('OBSERVED_VALUE_STATE_INVALID');
      const zero = BigInt(observation.value.replace('.', '')) === 0n;
      if ((observation.state === 'observed_zero') !== zero || (observation.state === 'observed_value' && zero)) fail('OBSERVED_VALUE_STATE_INVALID');
    } else if (observation.state !== 'DECLARED' || observation.measure !== null || observation.value !== null || observation.precision !== 'not_applicable') fail('DECLARED_VALUE_STATE_INVALID');
  }
  return output;
}

/** Build only source-neutral eligible upstream claims; no candidate, model or owner decision is created. */
export function buildAutomationSourceClaims(input: AutomationSourceClaimsBuildInput): { readonly artifact: AutomationSourceClaimsArtifact; readonly bytes: Buffer } {
  const runId = uuid(input.run.runId, 'RUN_ID_INVALID');
  const workspaceId = uuid(input.run.workspaceId, 'WORKSPACE_ID_INVALID');
  if (!input.scope || input.scope.runId !== runId || input.scope.workspaceId !== workspaceId) fail('RUN_SCOPE_IDENTITY_MISMATCH');
  const scopeSha256 = sha256(canonicalJson(input.scope));
  if (input.located && input.native) fail('MULTIPLE_DECLARATION_SNAPSHOTS');
  const claims = [
    ...(input.descriptive ? m05Claims(input.descriptive, scopeSha256) : []),
    ...(input.located ? locatedClaims(input.located, scopeSha256, runId) : []),
    ...(input.native ? locatedClaims(input.native, scopeSha256, runId) : []),
  ].sort((left, right) => left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0);
  const artifact: AutomationSourceClaimsArtifact = {
    contractVersion: '1.0.0', methodId: 'automation-source-claims', methodVersion: '1.0.0', runId, workspaceId, scopeSha256,
    claimsSha256: sha256(canonicalJson(claims)), claims,
    limitations: [
      'SOURCE_PACKAGE_BYTES_AND_METHOD_SNAPSHOT_MUST_BE_VERIFIED_BY_THE_OWNING_SERVICE',
      'SOURCE_CLAIMS_ADAPTER_DOES_NOT_REVERIFY_SOURCE_PACKAGE_BYTES',
      'M05_SOURCE_OBSERVATIONS_RETAIN_SOURCE_UNITS_AND_ARE_NOT_DEMAND_OR_MARKET_SIZE',
      'I02_I04_DECLARATIONS_RETAIN_ATTRIBUTION_AND_ARE_NOT_AUTHENTICATED_TRUTH_OR_OWNER_APPROVAL',
      'LOCATED_RECORDS_ARE_NOT_PEOPLE_OR_POPULATION_AND_DO_NOT_ESTABLISH_PREVALENCE',
      'PENDING_AI_AND_UNADOPTED_DECLARATIONS_ARE_EXCLUDED',
      'MISSING_OR_INCOMPATIBLE_PERIOD_UNIT_SCOPE_AND_COUNTEREVIDENCE_ARE_NOT_INFERRED',
    ],
  };
  const validated = validateAutomationSourceClaims(artifact);
  const bytes = Buffer.from(`${canonicalJson(validated)}\n`, 'utf8');
  if (bytes.length > MAX_SOURCE_CLAIMS_BYTES) fail('SOURCE_CLAIMS_TOO_LARGE');
  return { artifact: validated, bytes };
}
