import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/i17-evidence-trace.schema.json' with { type: 'json' };
import type { I17EvidenceTrace } from '../../../contracts/analysis/i17-evidence-trace.generated.js';
import type { I03ResearchMethod } from '../../../contracts/analysis/i03-research-method.generated.js';
import type { M02ScopeMethod } from '../../../contracts/analysis/m02-scope-method.generated.js';
import type { M08TabletQuoteMethod } from '../../../contracts/analysis/m08-tablet-quote-method.generated.js';
import type { M13ProvenanceAppendix } from '../../../contracts/analysis/m13-provenance-appendix.generated.js';
import type { MetricScopeOutput } from '../../../contracts/analysis/metric-scope-output.generated.js';
import type { VersionedReportPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validate = ajv.compile<I17EvidenceTrace>(schema);
const sha256 = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

type MethodInput = {
  readonly output: M02ScopeMethod | M08TabletQuoteMethod | M13ProvenanceAppendix | I03ResearchMethod;
  readonly bytes: Buffer;
  readonly fileName: 'm02-scope-method.json' | 'm08-tablet-quote-method.json' | 'm13-provenance-appendix.json' | 'i03-research-method.json';
};

type UpstreamMethodSection = 'M02' | 'M08' | 'M13' | 'I03';

export interface I17EvidenceTraceInputs {
  readonly packet: VersionedReportPacket;
  readonly result: MetricScopeOutput;
  readonly resultBytes: Buffer;
  readonly m02: MethodInput & { readonly output: M02ScopeMethod; readonly fileName: 'm02-scope-method.json' };
  readonly m08?: MethodInput & { readonly output: M08TabletQuoteMethod; readonly fileName: 'm08-tablet-quote-method.json' };
  readonly m13: MethodInput & { readonly output: M13ProvenanceAppendix; readonly fileName: 'm13-provenance-appendix.json' };
  readonly i03: MethodInput & { readonly output: I03ResearchMethod; readonly fileName: 'i03-research-method.json' };
}

function atPointer(value: unknown, pointer: string): unknown {
  if (pointer === '') return value;
  if (!pointer.startsWith('/')) return undefined;
  let current: unknown = value;
  for (const raw of pointer.slice(1).split('/')) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (Array.isArray(current)) {
      if (!/^(0|[1-9][0-9]*)$/.test(key)) return undefined;
      current = current[Number(key)];
    } else if (typeof current === 'object' && current !== null && Object.prototype.hasOwnProperty.call(current, key)) {
      current = (current as Record<string, unknown>)[key];
    } else return undefined;
  }
  return current;
}

function entry<T extends Omit<I17EvidenceTrace['entries'][number], 'entryId'>>(value: T): T & { readonly entryId: string } {
  return { ...value, entryId: sha256(canonicalJson(value)) };
}

function boundedLimitations(values: readonly string[]): I17EvidenceTrace['entries'][number]['limitations'] {
  if (values.length < 1 || values.length > 20 || new Set(values).size !== values.length) {
    throw new TypeError('I17: INVALID_ENTRY_LIMITATIONS');
  }
  return [...values] as I17EvidenceTrace['entries'][number]['limitations'];
}

function methodSection(method: MethodInput): UpstreamMethodSection {
  if (method.output.methodId === 'metric-scope-packet-context' && method.fileName === 'm02-scope-method.json') return 'M02';
  if (method.output.methodId === 'tablet-quote-normalization' && method.fileName === 'm08-tablet-quote-method.json') return 'M08';
  if (method.output.methodId === 'metric-scope-packet-provenance' && method.fileName === 'm13-provenance-appendix.json') return 'M13';
  if (method.output.methodId === 'metric-research-method-account' && method.fileName === 'i03-research-method.json') return 'I03';
  throw new TypeError('I17: METHOD_FILE_IDENTITY_MISMATCH');
}

function computedMethodOutputId(method: MethodInput): string {
  const { methodOutputId: _methodOutputId, ...payload } = method.output;
  return sha256(canonicalJson(payload));
}

function verifyPacketMethodArtifact(packet: VersionedReportPacket, method: MethodInput): void {
  const sectionId = methodSection(method);
  const descriptor = packet.sections.find(section => section.sectionId === sectionId)?.methodArtifact;
  if (descriptor === undefined ||
      descriptor.fileName !== method.fileName ||
      descriptor.sha256 !== sha256(method.bytes) ||
      descriptor.methodOutputId !== method.output.methodOutputId) {
    throw new TypeError(`I17: PACKET_METHOD_ARTIFACT_MISMATCH:${sectionId}`);
  }
}

function methodEntry(method: MethodInput): I17EvidenceTrace['entries'][number] {
  const sectionId = methodSection(method);
  const pointerMap = {
    M02: ['/scope', '/measurement', '/sources', '/rawByteMappings'],
    M08: ['/sources', '/lineage', '/quote'],
    M13: ['/sourcePackage', '/lineage', '/sources', '/recordLineage', '/coverage'],
    I03: ['/sourcePackage', '/lineage', '/measurementFrame', '/sourceInventory', '/coverage', '/scopeMembership'],
  } as const;
  const denominatorMap = { M02: ['/measurement/recordCount'], M08: ['/quote/packCount'], M13: ['/coverage/recordCount'], I03: ['/coverage/denominatorRecordCount'] } as const;
  for (const pointer of pointerMap[sectionId]) if (atPointer(method.output, pointer) === undefined) throw new TypeError(`I17: UNRESOLVED_METHOD_POINTER:${sectionId}:${pointer}`);
  const denominatorPointer: string = denominatorMap[sectionId][0];
  const denominatorPointers: [] | [string] = atPointer(method.output, denominatorPointer) === undefined ? [] : [denominatorPointer];
  return entry({
    sectionId,
    subjectType: 'METHOD_ARTIFACT',
    subjectId: method.output.methodOutputId,
    relationType: 'TRACE_FOR',
    resolutionState: 'RESOLVED',
    artifactFile: method.fileName,
    artifactSha256: sha256(method.bytes),
    artifactPointer: '',
    supportingPointers: [...pointerMap[sectionId]],
    denominatorPointers,
    coveragePointers: sectionId === 'M13' || sectionId === 'I03' ? ['/coverage'] : [],
    membershipPointers: sectionId === 'I03' ? ['/scopeMembership'] : [],
    scopeKey: null,
    deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
    approvalState: 'UNREVIEWED',
    limitations: boundedLimitations(method.output.limitations),
  });
}

/** Builds a resolved claim-to-artifact index. It does not create or validate business claims. */
export function buildI17EvidenceTrace(input: I17EvidenceTraceInputs): { readonly output: I17EvidenceTrace; readonly bytes: Buffer } {
  if (!input.resultBytes.equals(canonicalBytes(input.result)) || sha256(input.resultBytes) !== input.packet.metricResultSha256 ||
      input.result.inputSha256 !== input.packet.inputSha256) throw new TypeError('I17: RESULT_OR_PACKET_MISMATCH');
  const methods = [input.m02, ...(input.m08 === undefined ? [] : [input.m08]), input.m13, input.i03];
  for (const method of methods) {
    if (!method.bytes.equals(canonicalBytes(method.output))) throw new TypeError('I17: NONCANONICAL_METHOD_ARTIFACT');
    if (method.output.methodOutputId !== computedMethodOutputId(method)) throw new TypeError(`I17: METHOD_OUTPUT_ID_MISMATCH:${methodSection(method)}`);
    verifyPacketMethodArtifact(input.packet, method);
  }
  const suppliedSections = new Set(methods.map(methodSection));
  for (const sectionId of ['M02', 'M08', 'M13', 'I03'] as const) {
    const descriptor = input.packet.sections.find(section => section.sectionId === sectionId)?.methodArtifact;
    if ((descriptor !== undefined) !== suppliedSections.has(sectionId)) throw new TypeError(`I17: PACKET_METHOD_SET_MISMATCH:${sectionId}`);
  }
  if (input.i03.output.lineage.m02MethodOutputId !== input.m02.output.methodOutputId ||
      input.i03.output.lineage.m02ArtifactSha256 !== sha256(input.m02.bytes) ||
      input.i03.output.lineage.m13MethodOutputId !== input.m13.output.methodOutputId ||
      input.i03.output.lineage.m13ArtifactSha256 !== sha256(input.m13.bytes) ||
      input.i03.output.lineage.normalizedInputSha256 !== input.m13.output.lineage.normalizedInputSha256 ||
      input.i03.output.lineage.normalizationReceiptSha256 !== input.m13.output.lineage.normalizationReceiptSha256 ||
      input.i03.output.lineage.metricResultSha256 !== input.packet.metricResultSha256 ||
      input.i03.output.normalization.inputSha256 !== input.packet.inputSha256 ||
      input.m13.output.lineage.metricResultSha256 !== input.packet.metricResultSha256 ||
      (input.m08 !== undefined && canonicalJson(input.m08.output.sourcePackage) !== canonicalJson(input.m13.output.sourcePackage)) ||
      canonicalJson(input.i03.output.sourcePackage) !== canonicalJson(input.m13.output.sourcePackage)) {
    throw new TypeError('I17: METHOD_LINEAGE_MISMATCH');
  }
  const claimSetSha256 = sha256(canonicalJson(input.packet.claims));
  const methodArtifacts = methods.map(method => ({
    sectionId: methodSection(method),
    fileName: method.fileName,
    sha256: sha256(method.bytes),
    methodOutputId: method.output.methodOutputId,
    methodId: method.output.methodId,
    methodVersion: '2.0.0' as const,
  }));
  const upstreamBinding = {
    sourcePackage: {
      packageId: input.m13.output.sourcePackage.packageId,
      version: input.m13.output.sourcePackage.version,
      manifestArtifactSha256: input.m13.output.sourcePackage.manifestArtifactSha256,
      packageContentSha256: input.m13.output.sourcePackage.packageContentSha256,
    },
    catalogSha256: input.packet.catalogSha256,
    normalizedInputSha256: input.m13.output.lineage.normalizedInputSha256,
    metricResultSha256: input.packet.metricResultSha256,
    claimSetSha256,
    methodArtifacts,
  };
  const methodEntries = methods.map(methodEntry);
  const claimEntries = [...input.packet.claims].sort((left, right) => left.claimId < right.claimId ? -1 : left.claimId > right.claimId ? 1 : 0).map(claim => {
    if (claim.sectionId !== 'M03' && claim.sectionId !== 'M04') throw new TypeError(`I17: UNSUPPORTED_CLAIM_SECTION:${claim.sectionId}`);
    const pointers = [claim.metricPointer, claim.scopePointer, claim.membershipPointer,
      ...(claim.denominatorPointer === null ? [] : [claim.denominatorPointer]),
      ...(claim.coveragePointer === null ? [] : [claim.coveragePointer])];
    for (const pointer of pointers) if (atPointer(input.result, pointer) === undefined) throw new TypeError(`I17: UNRESOLVED_CLAIM_POINTER:${claim.claimId}:${pointer}`);
    return entry({
      sectionId: claim.sectionId as 'M03' | 'M04',
      subjectType: 'FACT_CLAIM' as const,
      subjectId: claim.claimId,
      relationType: 'CALCULATION_BASIS' as const,
      resolutionState: 'RESOLVED' as const,
      artifactFile: 'metric-result.json' as const,
      artifactSha256: input.packet.metricResultSha256,
      artifactPointer: claim.metricPointer,
      supportingPointers: [claim.metricPointer, claim.scopePointer],
      denominatorPointers: claim.denominatorPointer === null ? [] : [claim.denominatorPointer],
      coveragePointers: claim.coveragePointer === null ? [] : [claim.coveragePointer],
      membershipPointers: [claim.membershipPointer],
      scopeKey: claim.scopeKey,
      deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT' as const,
      approvalState: 'UNREVIEWED' as const,
      limitations: boundedLimitations(claim.limitations),
    });
  });
  const entries = [...methodEntries, ...claimEntries];
  if (entries.length === 0) throw new TypeError('I17: NO_RESOLVED_ENTRIES');
  const payload = {
    contractVersion: '1.0.0',
    sectionId: 'I17',
    sectionTitle: 'Phụ lục và bằng chứng',
    methodId: 'evidence-trace-index',
    methodVersion: '2.0.0',
    bindingPolicyVersion: 'directional-evidence-trace-v1',
    deliveryState: 'PARTIAL_DETERMINISTIC_DRAFT',
    approvalState: 'UNREVIEWED',
    evidenceState: 'RESOLVED_REFERENCES_NOT_SOURCE_TRUTH',
    upstreamBindingSha256: sha256(canonicalJson(upstreamBinding)),
    upstreamBinding,
    summary: {
      entryCount: entries.length,
      resolvedEntryCount: entries.length,
      unresolvedEntryCount: 0,
      referencedArtifactCount: new Set(entries.map(item => `${item.artifactFile}:${item.artifactSha256}`)).size,
      methodArtifactCount: methodEntries.length,
      claimCount: claimEntries.length,
    },
    entries,
    limitations: [
      'REFERENTIAL_INTEGRITY_AND_TRACEABILITY_DO_NOT_ESTABLISH_SOURCE_TRUTH_OR_PROVIDER_AUTHENTICITY',
      'THE_INDEX_DOES_NOT_ESTABLISH_PERIOD_TRUTH_LABEL_CORRECTNESS_MARKET_COMPLETENESS_OR_REPRESENTATIVENESS',
      'TRACE_FOR_AND_CALCULATION_BASIS_RELATIONS_DO_NOT_MEAN_VALIDATED_SUPPORT_OR_PROOF',
      'RESOLVED_MEANS_THE_POINTER_EXISTS_AND_DOES_NOT_CHANGE_MISSING_OBSERVED_ZERO_UNKNOWN_OR_NONEXACT_STATES',
      'ALL_WIDE_CORE_SCOPES_ARE_NESTED_NON_ADDITIVE_AND_KEEP_THE_FROZEN_UNKNOWN_POLICY',
      'M08_TABLET_COUNT_IS_A_PACKAGING_DENOMINATOR_NOT_A_MARKET_DENOMINATOR',
      'NO_NEW_CONCLUSION_INSIGHT_RECOMMENDATION_RANKING_CAUSALITY_EFFECTIVENESS_AI_INTERPRETATION_OR_APPROVAL',
    ],
    reopenConditions: [
      'SOURCE_PACKAGE_MEMBERSHIP_DIGEST_OR_LOCATOR_CHANGES',
      'NORMALIZED_INPUT_RECEIPT_OR_METRIC_RESULT_REPLAY_CHANGES',
      'SCOPE_CODEBOOK_UNKNOWN_POLICY_OR_DENOMINATOR_CHANGES',
      'M02_M03_M04_M08_M13_OR_I03_METHOD_CLAIM_OR_VERSION_CHANGES',
      'ANY_REFERENCED_POINTER_NO_LONGER_RESOLVES_EXACTLY',
      'SOURCE_USAGE_RIGHTS_OR_PROVENANCE_DECLARATION_CHANGES',
    ],
  } as const;
  const candidate: unknown = { ...payload, methodOutputId: sha256(canonicalJson(payload)) };
  if (!validate(candidate)) throw new TypeError(`I17: INVALID_OUTPUT ${ajv.errorsText(validate.errors)}`);
  const output: I17EvidenceTrace = candidate;
  return { output, bytes: canonicalBytes(output) };
}
