import { createHash } from 'node:crypto';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { VerifiedSourcePackageFile } from '../foundation/source-package-service.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import { buildLocatedInsightMethods, validateLocatedInsightInput } from './located-insight-methods.js';

const PROFILE_SHA256 = '6bae6b549273d163899c6a342082a84b85a11bffc69ab0d6e34131a311dfaded';
const ADOPTION_SHA256 = '5c5d1ea4d6d8b8aebfbdc3d92cb51718351890184cc290aac82411722636b7e7';
const MAX_BYTES = 8 * 1024 * 1024;
const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
export class ReportLocatedInsightExtensionError extends TypeError {}
function fail(code: string): never { throw new ReportLocatedInsightExtensionError(code); }

function verify(file: VerifiedSourcePackageFile): void {
  if (file.bytes.byteLength > MAX_BYTES) fail('LOCATED_SOURCE_TOO_LARGE');
  if (file.byteSize !== file.bytes.byteLength || file.sha256 !== sha256(file.bytes))
    fail('LOCATED_SOURCE_BYTES_MISMATCH');
}

function parse(file: VerifiedSourcePackageFile): unknown {
  if (file.mediaType !== 'application/json') fail('LOCATED_JSON_SOURCE_REQUIRED');
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)) as unknown; }
  catch { return fail('LOCATED_INVALID_JSON_BYTES'); }
}

function pointer(document: unknown, locator: string): unknown {
  if (!locator.startsWith('/') || /~(?:[^01]|$)/.test(locator)) fail('LOCATED_JSON_POINTER_REQUIRED');
  let value = document;
  for (const encoded of locator.slice(1).split('/')) {
    const key = encoded.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, key) ||
      (Array.isArray(value) && !/^(0|[1-9][0-9]*)$/.test(key))) fail('LOCATED_POINTER_UNRESOLVED');
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

/**
 * Proves membership, bytes and exact source text, not the semantic correctness
 * or authenticated human approval of imported coding declarations.
 */
export async function buildReportLocatedInsightExtension(
  logicalPath: string | undefined,
  bundle: SourceBackedReportBundle,
  sourcePackages: FinalizedSourcePackageReader,
) {
  if (logicalPath === undefined) return undefined;
  const identity = bundle.envelope.sourcePackage;
  const retained = await sourcePackages.readFinalizedSourcePackage(identity.packageId, {
    maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024,
  });
  if (retained.packageId !== identity.packageId ||
    retained.manifestArtifactSha256 !== identity.manifestArtifactSha256 ||
    retained.packageContentSha256 !== identity.packageContentSha256 ||
    canonicalJson(retained.manifest) !== canonicalJson(identity.manifest)) fail('LOCATED_PACKAGE_IDENTITY_MISMATCH');
  const byPath = new Map(retained.files.map(file => [file.path, file]));
  const descriptorFile = byPath.get(logicalPath);
  if (!descriptorFile) fail('LOCATED_DESCRIPTOR_NOT_IN_PACKAGE');
  verify(descriptorFile);
  const input = validateLocatedInsightInput(parse(descriptorFile));
  const authorityFiles = [PROFILE_SHA256, ADOPTION_SHA256].map(hash => {
    const file = retained.files.find(candidate => candidate.sha256 === hash);
    if (!file) return fail('LOCATED_METHOD_AUTHORITY_NOT_RETAINED');
    verify(file);
    return file;
  });
  if (input.sources.length > 4) fail('LOCATED_SOURCE_FILE_LIMIT');
  const documents = new Map<string, unknown>();
  const evidenceFiles = new Map(authorityFiles.map(file => [file.path, file]));
  for (const source of input.sources) {
    const file = byPath.get(source.logicalPath);
    if (!file || file.sha256 !== source.sha256) fail('LOCATED_SOURCE_MEMBERSHIP_MISMATCH');
    verify(file);
    documents.set(source.sha256, parse(file));
    evidenceFiles.set(file.path, file);
  }
  for (const record of input.records) {
    if (!documents.has(record.sourceSha256)) fail('LOCATED_SOURCE_UNREGISTERED');
    if (pointer(documents.get(record.sourceSha256), record.locator) !== record.text)
      fail('LOCATED_RECORD_TEXT_MISMATCH');
  }
  const built = buildLocatedInsightMethods(input);
  const fileEnvelope = (file: VerifiedSourcePackageFile) => ({
    logicalPath: file.path, sha256: file.sha256, byteSize: file.byteSize,
    mediaType: file.mediaType, evidenceFamily: file.evidenceFamily,
    providerProvenance: file.providerProvenance, bytesBase64: file.bytes.toString('base64'),
  });
  // One retained artifact lets this supplement coexist with quote and Market
  // supplements under the existing 40-artifact report limit.
  const bytes = Buffer.from(`${canonicalJson({
    contractVersion: 'located-insight-bundle-v1', output: built.output,
    descriptor: fileEnvelope(descriptorFile), encoding: 'base64',
    files: [...evidenceFiles].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([, file]) => fileEnvelope(file)),
    limitations: ['IMPORTED_CODING_PROVENANCE_IS_DECLARED_NOT_AUTHENTICATED_OWNER_APPROVAL',
      'EXACT_SOURCE_TEXT_DOES_NOT_PROVE_SEMANTIC_CODING_TRUTH'],
  })}\n`, 'utf8');
  if (bytes.byteLength > MAX_BYTES) fail('LOCATED_EVIDENCE_BUNDLE_TOO_LARGE');
  return { output: built.output, bytes, files: new Map([['located-insight-bundle.json', bytes]]) };
}
