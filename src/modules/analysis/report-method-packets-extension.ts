import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/report-method-packets-input.schema.json' with { type: 'json' };
import gateSchema from '../../../contracts/analysis/bounded-analysis-gates.schema.json' with { type: 'json' };
import decisionSchema from '../../../contracts/analysis/decision-evidence-packets.schema.json' with { type: 'json' };
import packetSchema from '../../../contracts/analysis/versioned-report-packet.schema.json' with { type: 'json' };
import catalogSchema from '../../../contracts/analysis/report-section-catalog.schema.json' with { type: 'json' };
import metricInputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import type { ReportMethodPacketsInput } from '../../../contracts/analysis/report-method-packets-input.generated.js';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { VerifiedFinalizedSourcePackage, VerifiedSourcePackageFile } from '../foundation/source-package-service.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import { buildBoundedAnalysisGates } from './bounded-analysis-gates.js';
import { buildDecisionEvidencePackets } from './decision-evidence-packets.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema([metricInputSchema, catalogSchema, packetSchema, gateSchema, decisionSchema]);
const validate = ajv.compile<ReportMethodPacketsInput>(schema);
const ADVANCED = 'c4e0f5fbda7f1afbb47571a384c59e59aa31264b2e5b79a38bce97a30605ba63';
const SYNTHESIS = '5fd879f42d6c9c82cbc87710b69206aaac2fc8d6bac2da18ba158825f910225a';
const ADOPTION = '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
const MAX_BYTES = 8 * 1024 * 1024;
const DESCRIPTIVE_FILES = ['descriptive-market-input.json', 'descriptive-market-methods.json', 'descriptive-evidence-files.json'];
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export class ReportMethodPacketsExtensionError extends TypeError {}
function fail(code: string): never { throw new ReportMethodPacketsExtensionError(code); }

function verify(file: VerifiedSourcePackageFile): void {
  if (file.byteSize !== file.bytes.length || file.sha256 !== digest(file.bytes)) fail('METHOD_PACKET_SOURCE_BYTES_MISMATCH');
  if (file.bytes.length > MAX_BYTES) fail('METHOD_PACKET_SOURCE_TOO_LARGE');
}

function parse(file: VerifiedSourcePackageFile): unknown {
  verify(file);
  if (file.mediaType !== 'application/json') fail('METHOD_PACKET_JSON_SOURCE_REQUIRED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)) as unknown; }
  catch { return fail('METHOD_PACKET_INVALID_JSON'); }
}

function pointer(document: unknown, locator: string): unknown {
  if (!locator.startsWith('/') || /~(?:[^01]|$)/.test(locator)) fail('METHOD_PACKET_INVALID_POINTER');
  let value = document;
  for (const token of locator.slice(1).split('/')) {
    const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
    if (value === null || typeof value !== 'object' || !Object.hasOwn(value, key) ||
        (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))) fail('METHOD_PACKET_UNRESOLVED_POINTER');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

// Origin references are not copied into their own source payloads, avoiding
// self-digest cycles. All business fields, including missing states, remain.
function methodPacketBusinessPayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(methodPacketBusinessPayload);
  if (value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'source' && key !== 'protocolRef' && key !== 'identityEvidence')
    .map(([key, child]) => [key, methodPacketBusinessPayload(child)]));
}

/** Consumes an owning Foundation reader's exact package, without requiring a Metric calculation.
 * Source references authenticate literal payloads, not semantic truth or human approval.
 * Decision claim references are NOT admitted here; the caller must bind them to calculation bytes.
 */
export function buildVerifiedMethodPacketSources(logicalPath: string, retained: VerifiedFinalizedSourcePackage) {
  const byPath = new Map(retained.files.map(file => [file.path, file]));
  if (byPath.size !== retained.files.length) fail('METHOD_PACKET_DUPLICATE_SOURCE_PATH');
  const descriptor = byPath.get(logicalPath);
  if (!descriptor) fail('METHOD_PACKET_DESCRIPTOR_MISSING');
  const input = parse(descriptor);
  if (!validate(input)) fail(`METHOD_PACKET_INVALID_INPUT:${ajv.errorsText(validate.errors)}`);
  if (input.gates === null && input.decisions === null) fail('METHOD_PACKET_EMPTY_SELECTION');
  const evidence = new Map<string, VerifiedSourcePackageFile>();
  for (const hash of [ADOPTION, ...(input.gates === null ? [] : [ADVANCED]), ...(input.decisions === null ? [] : [SYNTHESIS])]) {
    const file = retained.files.find(candidate => candidate.sha256 === hash);
    if (!file) fail('METHOD_PACKET_AUTHORITY_MISSING');
    verify(file);
    evidence.set(file.path, file);
  }
  const documents = new Map<string, unknown>();
  const sourcePaths = new Set<string>();
  const resolve = (ref: {logicalPath: string; sha256: string; locator: string}): unknown => {
    const file = byPath.get(ref.logicalPath);
    if (!file || file.sha256 !== ref.sha256) fail('METHOD_PACKET_SOURCE_MEMBERSHIP_MISMATCH');
    if (!documents.has(file.path)) documents.set(file.path, parse(file));
    sourcePaths.add(file.path);
    if (sourcePaths.size > 4) fail('METHOD_PACKET_SOURCE_FILE_LIMIT');
    evidence.set(file.path, file);
    return pointer(documents.get(file.path), ref.locator);
  };
  function verifyTree(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(verifyTree); return; }
    if (value === null || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if (object.source !== null && typeof object.source === 'object') {
      const actual = resolve(object.source as {logicalPath: string; sha256: string; locator: string});
      if (canonicalJson(actual) !== canonicalJson(methodPacketBusinessPayload(object))) fail('METHOD_PACKET_LITERAL_PAYLOAD_MISMATCH');
    }
    for (const key of ['protocolRef', 'identityEvidence']) {
      if (object[key] !== undefined && object[key] !== null) {
        if (resolve(object[key] as {logicalPath: string; sha256: string; locator: string}) === null) fail('METHOD_PACKET_EMPTY_EVIDENCE_REFERENCE');
      }
    }
    // U-04: each counted member must be one exact retained, eligible text record — resolving to a number, a container
    // object or an excluded/unreadable record is not text-record membership, so rates must not be built from it.
    for (const key of ['memberSources', 'numeratorMemberSources']) {
      const list = object[key];
      if (list === undefined) continue;
      if (!Array.isArray(list)) fail('METHOD_PACKET_INVALID_MEMBER_SOURCES');
      const seen = new Set<string>();
      for (const entry of list) {
        if (entry === null || typeof entry !== 'object' || !('logicalPath' in entry) || !('sha256' in entry) || !('locator' in entry) ||
            typeof entry.logicalPath !== 'string' || typeof entry.sha256 !== 'string' || typeof entry.locator !== 'string') {
          fail('METHOD_PACKET_INVALID_MEMBER_SOURCES');
        }
        const ref = { logicalPath: entry.logicalPath, sha256: entry.sha256, locator: entry.locator };
        if (seen.has(canonicalJson(ref))) fail('METHOD_PACKET_DUPLICATE_MEMBER_REFERENCE');
        seen.add(canonicalJson(ref));
        const record = resolve(ref);
        if (record === null || typeof record !== 'object' || Array.isArray(record) ||
            (record as Record<string, unknown>).disposition !== 'INCLUDED' ||
            typeof (record as Record<string, unknown>).text !== 'string' || !((record as Record<string, unknown>).text as string).trim())
          fail('METHOD_PACKET_MEMBER_NOT_AN_INCLUDED_TEXT_RECORD');
      }
    }
    for (const [key, child] of Object.entries(object)) if (!['source', 'protocolRef', 'identityEvidence'].includes(key)) verifyTree(child);
  }
  if (input.gates !== null) verifyTree(input.gates);
  const gates = input.gates === null ? undefined : buildBoundedAnalysisGates(input.gates).output;
  return { input, descriptor, evidence, gates };
}

export async function buildReportMethodPacketsExtension(
  logicalPath: string | undefined,
  bundle: SourceBackedReportBundle,
  sourcePackages: FinalizedSourcePackageReader,
) {
  if (logicalPath === undefined) return undefined;
  const identity = bundle.envelope.sourcePackage;
  const retained = await sourcePackages.readFinalizedSourcePackage(identity.packageId, {
    maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024,
  });
  if (retained.packageId !== identity.packageId || retained.manifestArtifactSha256 !== identity.manifestArtifactSha256 ||
      retained.packageContentSha256 !== identity.packageContentSha256 || canonicalJson(retained.manifest) !== canonicalJson(identity.manifest)) {
    fail('METHOD_PACKET_PACKAGE_IDENTITY_MISMATCH');
  }
  const { input, descriptor, evidence, gates } = buildVerifiedMethodPacketSources(logicalPath, retained);
  const packetBytes = bundle.files.get('packet.json');
  if (!packetBytes || digest(packetBytes) !== bundle.envelope.artifacts.packetSha256) fail('METHOD_PACKET_CALCULATION_BYTES_MISMATCH');
  const resultBytes = bundle.files.get('metric-result.json');
  if (!resultBytes || digest(resultBytes) !== bundle.envelope.artifacts.metricResultSha256 ||
      bundle.packet.metricResultSha256 !== digest(resultBytes) ||
      canonicalJson(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(packetBytes))) !== canonicalJson(bundle.packet)) {
    fail('METHOD_PACKET_CALCULATION_BYTES_MISMATCH');
  }
  for (const claim of input.decisions?.claims ?? []) {
    if (claim.reference.sha256 !== digest(resultBytes) ||
        canonicalJson(pointer(bundle.packet, claim.reference.claimPointer)) !== canonicalJson(claim.payload)) fail('METHOD_PACKET_CLAIM_REPLAY_MISMATCH');
  }
  const decisions = input.decisions === null ? undefined : buildDecisionEvidencePackets(input.decisions).output;
  const fileEnvelope = (file: VerifiedSourcePackageFile) => ({
    logicalPath: file.path, sha256: file.sha256, byteSize: file.byteSize, mediaType: file.mediaType,
    evidenceFamily: file.evidenceFamily, providerProvenance: file.providerProvenance, bytesBase64: file.bytes.toString('base64'),
  });
  const embedded = DESCRIPTIVE_FILES.flatMap(fileName => {
    const bytes = bundle.files.get(fileName);
    return bytes === undefined ? [] : [{fileName, sha256: digest(bytes), byteSize: bytes.length, bytesBase64: bytes.toString('base64')}];
  });
  const bytes = Buffer.from(`${canonicalJson({
    contractVersion: 'report-method-evidence-v1', descriptor: fileEnvelope(descriptor),
    gates: gates ?? null, decisions: decisions ?? null, encoding: 'base64', embeddedSupplements: embedded,
    files: [...evidence].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, file]) => fileEnvelope(file)),
    calculation: {fileName: 'metric-result.json', sha256: digest(resultBytes)},
    claimProjection: {fileName: 'packet.json', sha256: digest(packetBytes)},
    limitations: ['POINTER_INTEGRITY_NOT_SEMANTIC_TRUTH', 'IMPORTED_REVIEW_NOT_AUTHENTICATED_APPROVAL', 'NO_ADVANCED_ESTIMATOR_OR_AI_EXECUTION'],
  })}\n`, 'utf8');
  if (bytes.length > MAX_BYTES) fail('METHOD_PACKET_EVIDENCE_TOO_LARGE');
  const files = new Map(bundle.files);
  // The new request retains these exact bytes inside one download, not three
  // standalone artifacts. Old requests never enter this path.
  for (const fileName of DESCRIPTIVE_FILES) files.delete(fileName);
  files.set('report-method-evidence.json', bytes);
  return { bundle: {...bundle, files}, bytes, gates, decisions };
}
