import { createHash } from 'node:crypto';
import type { DescriptiveMarketMethods } from '../../../contracts/analysis/descriptive-market-methods.generated.js';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { VerifiedFinalizedSourcePackage, VerifiedSourcePackageFile } from '../foundation/source-package-service.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import { buildDescriptiveMarketMethods, validateDescriptiveMarketInput } from './descriptive-market-methods.js';

// Accepted A41 bytes are implementation authority, not mutable filesystem input.
const PROFILE_SHA256 = 'ddd4c0dcebc9a07a215646abce5152060f7d0c45c2582676ef84e2eb1ae3d8f7';
const ADOPTION_SHA256 = '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
const MAX_BYTES = 8 * 1024 * 1024;
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
type Input = DescriptiveMarketMethods['input'];
type Ref = Input['m05'][number]['source'];

export class ReportDescriptiveExtensionError extends TypeError {}
function fail(code: string): never { throw new ReportDescriptiveExtensionError(code); }

function parseJson(file: VerifiedSourcePackageFile): unknown {
  if (file.mediaType !== 'application/json') fail('DESCRIPTIVE_JSON_SOURCE_REQUIRED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)) as unknown; }
  catch { return fail('DESCRIPTIVE_INVALID_JSON_BYTES'); }
}

function verifyBytes(file: VerifiedSourcePackageFile): void {
  if (file.bytes.byteLength > MAX_BYTES) fail('DESCRIPTIVE_SOURCE_TOO_LARGE');
  if (file.bytes.byteLength !== file.byteSize || digest(file.bytes) !== file.sha256) fail('DESCRIPTIVE_SOURCE_BYTES_MISMATCH');
}

function jsonPointer(document: unknown, locator: string): unknown {
  if (!locator.startsWith('/') || /~(?:[^01]|$)/.test(locator)) fail('DESCRIPTIVE_JSON_POINTER_REQUIRED');
  let current = document;
  for (const encoded of locator.slice(1).split('/')) {
    const token = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, token) ||
      (Array.isArray(current) && !/^(0|[1-9][0-9]*)$/.test(token))) fail('DESCRIPTIVE_LOCATOR_UNRESOLVED');
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function equal(actual: unknown, expected: unknown, code: string): void {
  if (canonicalJson(actual) !== canonicalJson(expected)) fail(code);
}

/**
 * Reads an explicitly selected normalized declaration from the exact retained
 * package. JSON Pointer resolution and literal equality prove what the selected
 * normalized source says; they do not authenticate its provider or business truth.
 */
export async function buildReportDescriptiveExtension(
  logicalPath: string | undefined,
  bundle: SourceBackedReportBundle,
  sourcePackages: FinalizedSourcePackageReader,
): Promise<undefined | {
  output: DescriptiveMarketMethods;
  bytes: Buffer;
  inputBytes: Buffer;
  inputSha256: string;
  files: ReadonlyMap<string, Buffer>;
}> {
  if (logicalPath === undefined) return undefined;
  const retained = await sourcePackages.readFinalizedSourcePackage(bundle.envelope.sourcePackage.packageId, {
    maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024,
  });
  const identity = bundle.envelope.sourcePackage;
  if (retained.packageId !== identity.packageId || retained.manifestArtifactSha256 !== identity.manifestArtifactSha256 ||
    retained.packageContentSha256 !== identity.packageContentSha256) fail('DESCRIPTIVE_PACKAGE_IDENTITY_MISMATCH');
  equal(retained.manifest, identity.manifest, 'DESCRIPTIVE_PACKAGE_MANIFEST_MISMATCH');
  return buildVerifiedReportDescriptiveExtension(logicalPath, retained);
}

/** Shared package-bound method boundary, independent of the Metric-only report envelope. */
export function buildVerifiedReportDescriptiveExtension(logicalPath: string, retained: VerifiedFinalizedSourcePackage): {
  output: DescriptiveMarketMethods;
  bytes: Buffer;
  inputBytes: Buffer;
  inputSha256: string;
  files: ReadonlyMap<string, Buffer>;
} {
  const byPath = new Map(retained.files.map(file => [file.path, file]));
  const descriptorFile = byPath.get(logicalPath);
  if (!descriptorFile) fail('DESCRIPTIVE_DESCRIPTOR_NOT_IN_PACKAGE');
  verifyBytes(descriptorFile);
  const descriptor = parseJson(descriptorFile);
  if (!descriptor || typeof descriptor !== 'object' || Array.isArray(descriptor)) fail('DESCRIPTIVE_DESCRIPTOR_OBJECT_REQUIRED');
  if (Object.hasOwn(descriptor, 'sourcePackage')) fail('DESCRIPTIVE_DESCRIPTOR_PACKAGE_IDENTITY_FORBIDDEN');
  const input = validateDescriptiveMarketInput({
    ...descriptor,
    sourcePackage: {
      packageId: retained.packageId, version: retained.manifest.version,
      manifestArtifactSha256: retained.manifestArtifactSha256, packageContentSha256: retained.packageContentSha256,
    },
  });
  if (input.configuration.profileSha256 !== PROFILE_SHA256 || input.configuration.adoptionSha256 !== ADOPTION_SHA256)
    fail('DESCRIPTIVE_METHOD_AUTHORITY_MISMATCH');
  const profile = retained.files.find(file => file.sha256 === PROFILE_SHA256);
  const adoption = retained.files.find(file => file.sha256 === ADOPTION_SHA256);
  if (!profile || !adoption) fail('DESCRIPTIVE_METHOD_AUTHORITY_NOT_RETAINED');
  verifyBytes(profile);
  verifyBytes(adoption);

  const sourceFiles = new Map<string, VerifiedSourcePackageFile>();
  const documents = new Map<string, unknown>();
  for (const source of input.sources) {
    const file = byPath.get(source.logicalPath);
    if (!file || file.sha256 !== source.sha256 || file.evidenceFamily !== source.evidenceFamily ||
      file.providerProvenance !== source.providerProvenance) fail('DESCRIPTIVE_SOURCE_MEMBERSHIP_MISMATCH');
    verifyBytes(file);
    sourceFiles.set(source.sha256, file);
    documents.set(source.sha256, parseJson(file));
  }
  // Bound source parsing and retained evidence size independently of report counts.
  if (sourceFiles.size > 4) fail('DESCRIPTIVE_SOURCE_FILE_LIMIT');
  const resolve = (ref: Ref): unknown => {
    if (!documents.has(ref.sourceSha256)) fail('DESCRIPTIVE_UNREGISTERED_SOURCE');
    return jsonPointer(documents.get(ref.sourceSha256), ref.locator);
  };
  function resolveAll(value: unknown): void {
    if (Array.isArray(value)) { value.forEach(resolveAll); return; }
    if (!value || typeof value !== 'object') return;
    const object = value as Record<string, unknown>;
    if ('sourceSha256' in object && 'locator' in object) resolve(object as unknown as Ref);
    Object.values(object).forEach(resolveAll);
  }
  resolveAll(input);

  const { runConfiguration, ...configuration } = input.configuration;
  equal(resolve(runConfiguration), { configuration, question: input.question, scope: input.scope }, 'DESCRIPTIVE_RUN_CONFIGURATION_MISMATCH');
  const literalObservation = ({ source: _source, aggregation: _aggregation, ...literal }: Input['m05'][number]) => literal;
  for (const row of [...input.m05, ...input.m07]) {
    equal(resolve(row.source), literalObservation(row), 'DESCRIPTIVE_OBSERVATION_SOURCE_MISMATCH');
  }
  for (const row of input.m06) {
    equal(resolve(row.observation.source), {
      observation: literalObservation(row.observation), objectLiteral: row.objectLiteral,
      statusLiteral: row.statusLiteral, dateMeaning: row.dateMeaning,
    }, 'DESCRIPTIVE_SUPPLY_SOURCE_MISMATCH');
  }
  for (const row of [...input.m05, ...input.m06.map(record => record.observation), ...input.m07]) {
    const aggregation = row.aggregation;
    if (!aggregation) continue;
    const { members, proof, ...declaration } = aggregation;
    equal(resolve(proof), declaration, 'DESCRIPTIVE_ADDITIVITY_PROOF_MISMATCH');
    for (const member of members) equal(resolve(member.source), member.sourceKey, 'DESCRIPTIVE_MEMBER_KEY_MISMATCH');
  }
  if (input.peerSet) {
    const { declaration, ...peerSet } = input.peerSet;
    equal(resolve(declaration), peerSet, 'DESCRIPTIVE_PEER_DECLARATION_MISMATCH');
  }
  for (const event of input.m09) {
    const { source, targetLink, conflictRefs: _conflicts, ...literal } = event;
    equal(resolve(source), literal, 'DESCRIPTIVE_EVENT_SOURCE_MISMATCH');
    if (targetLink) equal(resolve(targetLink), event.namedScope, 'DESCRIPTIVE_EVENT_TARGET_LINK_MISMATCH');
  }
  const built = buildDescriptiveMarketMethods(input);
  const evidenceFiles = new Map([profile, adoption, ...sourceFiles.values()].map(file => [file.path, file]));
  const evidenceBytes = Buffer.from(`${canonicalJson({
    contractVersion: '1.0.0', encoding: 'base64',
    files: [...evidenceFiles].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, file]) => ({
      logicalPath: file.path, sha256: file.sha256, byteSize: file.byteSize, mediaType: file.mediaType,
      evidenceFamily: file.evidenceFamily, providerProvenance: file.providerProvenance,
      bytesBase64: file.bytes.toString('base64'),
    })),
  })}\n`);
  if (evidenceBytes.byteLength > MAX_BYTES) fail('DESCRIPTIVE_EVIDENCE_BUNDLE_TOO_LARGE');
  const files = new Map<string, Buffer>([
    ['descriptive-market-input.json', Buffer.from(descriptorFile.bytes)],
    ['descriptive-market-methods.json', built.bytes],
    ['descriptive-evidence-files.json', evidenceBytes],
  ]);
  return {
    ...built, inputBytes: Buffer.from(descriptorFile.bytes), inputSha256: descriptorFile.sha256, files,
  };
}
