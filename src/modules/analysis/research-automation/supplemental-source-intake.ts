import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import path from 'node:path';
import type Database from 'better-sqlite3';
import intakeApiSchema from '../../../../contracts/api/research-automation-supplemental-intake-api.schema.json' with { type: 'json' };
import automationApiSchema from '../../../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import foundationIntakeSchema from '../../../../contracts/foundation/source-package-intake-request.schema.json' with { type: 'json' };
import type { ResearchAutomationSupplementalPrepareRequest, ResearchAutomationSupplementalPrepareReceipt, ResearchAutomationSupplementalPreparedPackage } from '../../../../contracts/api/research-automation-supplemental-intake-api.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import type { SourcePackageManifest } from '../../../../contracts/foundation/source-package-manifest.generated.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import type { FinalizedSourcePackageReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { BoundedAnalysisGatesValidationError } from '../bounded-analysis-gates.js';
import { GenericQuoteUnitValidationError } from '../generic-quote-unit.js';
import { buildVerifiedMethodPacketSources, ReportMethodPacketsExtensionError } from '../report-method-packets-extension.js';
import { buildAutomationBoundedMethods } from './bounded-methods.js';
import { buildAutomationQuoteMethods } from './quote-methods.js';
import type { ScopeSnapshot, StartSnapshot } from './model.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema([foundationIntakeSchema, automationApiSchema, intakeApiSchema]);
const validateRequest = ajv.compile<ResearchAutomationSupplementalPrepareRequest>({ $ref: `${intakeApiSchema.$id}#/$defs/request` });
const validateContext = ajv.compile<SupplementalSourceContext>({ $ref: `${intakeApiSchema.$id}#/$defs/sourceContext` });

type Request = ResearchAutomationSupplementalPrepareRequest;
type Receipt = ResearchAutomationSupplementalPrepareReceipt;
type FileMetadata = SourcePackageIntakeRequest['files'][number];
export type SupplementalRunBinding = { runId: string; start: StartSnapshot; scope: ScopeSnapshot };
/** Persisted server-created member; shape is `$defs/sourceContext` in the intake API schema. */
export interface SupplementalSourceContext {
  contractVersion: 'automation-supplemental-context-v1';
  declaration: typeof SUPPLEMENTAL_CONTEXT_DECLARATION;
  workspaceId: string;
  runId: string;
  runBindingSha256: string;
  request: Request;
}
/** Both method owners parse at most 8 MiB per JSON file; transport must not accept more. */
export const MAX_SUPPLEMENTAL_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_SUPPLEMENTAL_TOTAL_BYTES = 32 * 1024 * 1024;
export const SUPPLEMENTAL_READ_BUDGET = { maxFileBytes: MAX_SUPPLEMENTAL_FILE_BYTES, maxTotalBytes: MAX_SUPPLEMENTAL_TOTAL_BYTES + 64 * 1024 } as const;
/** Server-owned member path. The whole directory is reserved so no uploaded file can impersonate it. */
export const SUPPLEMENTAL_CONTEXT_PATH = 'automation-supplemental/context.json';
const RESERVED_DIRECTORY = 'automation-supplemental/';
export const SUPPLEMENTAL_CONTEXT_DECLARATION = 'Operator declarations, not authenticated provider metadata. Preparation is not revision admission.';
const PROVENANCE_BASIS = 'Operator-supplied exact method source bytes. Descriptor and source declarations are unverified; not provider collection, review approval or an independent evidence family.';
const CONTEXT_PROVENANCE_BASIS = 'Server-created record of the operator request bound to this run. Its declarations remain unverified; not provider collection, review approval or an independent evidence family.';
// Discarded preflight identity only. The descriptor never supplies package identity and none of these values is stored.
const PREVIEW_PACKAGE_ID = '00000000-0000-4000-8000-000000000000';
const PREVIEW_DIGEST = '0'.repeat(64);
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
/** Code-unit path order used for every stored member list. */
export const byPath = (a: { path: string }, b: { path: string }): number => a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

export class SupplementalSourceRejection extends Error {
  constructor(readonly code: string) { super(`Supplemental source rejected: ${code}`); }
}
function reject(code: string): never { throw new SupplementalSourceRejection(code); }

/**
 * Prepared storage only for M08 quote and M10/I11/I12/I16 bounded method packages. The existing method owner
 * replays the exact in-memory package before any write so that an unusable package is never stored; that replay
 * is discarded and is repeated against the stored package at explicit revision admission. Preparation makes no
 * report, collection, approval or Source-of-Truth result.
 */
export class AutomationSupplementalSourceIntake {
  readonly #packages: SourcePackageService;
  constructor(private readonly artifacts: RequestScopedArtifactStore, db: Database.Database, private readonly now: () => Date) {
    this.#packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  }

  hasRequest(runId: string, family: Request['family'], requestKey: string): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(supplementalPackageKey(runId, family, requestKey)).length > 0;
  }

  /** Caller holds the database mutation mutex and supplies the confirmed run/start/scope. */
  async prepare(untrusted: unknown, supplied: ReadonlyMap<string, Uint8Array>, bound: SupplementalRunBinding): Promise<Receipt> {
    if (!validateRequest(untrusted)) reject('REQUEST_INVALID');
    // Snapshot request and bytes synchronously, before any await, so later caller mutation cannot change what is checked and stored.
    const input = normalizeSupplementalRequest(JSON.parse(canonicalJson(untrusted)) as Request);
    if (!(supplied instanceof Map) || supplied.size !== input.files.length || input.files.some(file => !supplied.has(file.path))) reject('MEMBERSHIP_MISMATCH');
    const bytesByPath = new Map<string, Buffer>();
    let total = 0;
    for (const file of input.files) {
      const bytes = supplied.get(file.path);
      if (!(bytes instanceof Uint8Array) || bytes.byteLength < 1 || bytes.byteLength > MAX_SUPPLEMENTAL_FILE_BYTES) reject('FILE_SIZE_LIMIT');
      bytesByPath.set(file.path, Buffer.from(bytes));
      total += bytes.byteLength;
    }
    if (total > MAX_SUPPLEMENTAL_TOTAL_BYTES) reject('TOTAL_SIZE_LIMIT');
    for (const file of input.files) {
      if (file.mediaType !== 'application/json') continue;
      let value: unknown;
      try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytesByPath.get(file.path)!)); }
      catch { reject('MALFORMED_JSON'); }
      if (file.path !== input.descriptorPath) continue;
      if (value === null || typeof value !== 'object' || Array.isArray(value)) reject('DESCRIPTOR_INVALID');
      if (Object.hasOwn(value, 'sourcePackage')) reject('DESCRIPTOR_AUTHORED_PACKAGE_IDENTITY');
    }

    const key = supplementalPackageKey(bound.runId, input.family, input.requestKey);
    const binding = supplementalRunBindingSha256(bound);
    const context: SupplementalSourceContext = { contractVersion: 'automation-supplemental-context-v1', declaration: SUPPLEMENTAL_CONTEXT_DECLARATION,
      workspaceId: bound.start.workspaceId, runId: bound.runId, runBindingSha256: binding, request: input };
    bytesByPath.set(SUPPLEMENTAL_CONTEXT_PATH, Buffer.from(canonicalJson(context)));
    const files = expectedSupplementalMetadata(bound.runId, input, bytesByPath);
    if (!files) throw new Error('Supplemental metadata snapshot is incomplete');
    await this.#preflight(input, key, files, bytesByPath, bound);

    return this.artifacts.withOwnership(async () => {
      const stored = await this.#packages.intakeAutomationAttachment({ contractVersion: '1.0.0', packageKey: key, version: 1,
        sourceLabel: input.sourceLabel, sourceAcquiredAt: input.acquiredAt, files }, new Map(bytesByPath), binding);
      const verified = await this.#packages.readVerified(stored.packageId, SUPPLEMENTAL_READ_BUDGET);
      const origin = await this.#packages.readAutomationAttachmentOrigin(stored.packageId, SUPPLEMENTAL_READ_BUDGET);
      if (!origin || origin.bindingSha256 !== binding || origin.manifestArtifactSha256 !== verified.manifestArtifactSha256 ||
          verified.packageContentSha256 !== stored.packageContentSha256 || verified.manifest.packageKey !== key ||
          canonicalJson([...verified.files].sort(byPath).map(({ bytes: _bytes, ...file }) => file)) !== canonicalJson(files)) throw new Error('Prepared supplemental package verification failed');
      // Publish only this exact, verified committed membership; never all staged digests.
      for (const digest of new Set([verified.manifestArtifactSha256, ...verified.files.map(file => file.sha256)])) await this.artifacts.publishOwned(digest);
      return { contractVersion: 'automation-supplemental-prepared-v1', exactRetry: stored.deduplicated, ...preparedSupplementalPackage(input, verified) };
    });
  }

  /** Runs the unchanged method owner over the exact package about to be stored (including the server context
   * member), then requires every uploaded file to be consumed by it. Markdown can therefore only enter as a
   * digest-pinned bounded method authority. The server context is not a method source and is not consumed. */
  async #preflight(input: Request, key: string, files: readonly FileMetadata[], supplied: ReadonlyMap<string, Buffer>,
    bound: { runId: string; start: StartSnapshot }): Promise<void> {
    const preview: VerifiedFinalizedSourcePackage = { packageId: PREVIEW_PACKAGE_ID, manifestArtifactSha256: PREVIEW_DIGEST, packageContentSha256: PREVIEW_DIGEST,
      manifest: { contractVersion: '1.0.0', packageId: PREVIEW_PACKAGE_ID, packageKey: key, version: 1, sourceAcquiredAt: input.acquiredAt,
        sourceLabel: input.sourceLabel, finalizedAt: this.now().toISOString(), packageContentSha256: PREVIEW_DIGEST, files: [...files] as SourcePackageManifest['files'] },
      files: files.map(file => ({ ...file, bytes: supplied.get(file.path)! })) };
    const reader: FinalizedSourcePackageReader = { readFinalizedSourcePackage: async () => preview };
    const selection = { decision: 'USE_PACKAGE' as const, packageId: PREVIEW_PACKAGE_ID, manifestArtifactSha256: PREVIEW_DIGEST,
      packageContentSha256: PREVIEW_DIGEST, descriptorPath: input.descriptorPath };
    const binding = { workspaceId: bound.start.workspaceId, runId: bound.runId, startSha256: PREVIEW_DIGEST, scopeSha256: PREVIEW_DIGEST, previousPairId: PREVIEW_DIGEST };
    const consumed = new Set([input.descriptorPath]);
    try {
      if (input.family === 'QUOTE') {
        for (const source of (await buildAutomationQuoteMethods(selection, binding, reader)).sourceMetadata) consumed.add(source.path);
      } else {
        await buildAutomationBoundedMethods(selection, binding, reader);
        for (const sourcePath of buildVerifiedMethodPacketSources(input.descriptorPath, preview).evidence.keys()) consumed.add(sourcePath);
      }
    } catch (error) {
      if (error instanceof ReportMethodPacketsExtensionError || error instanceof BoundedAnalysisGatesValidationError ||
          error instanceof GenericQuoteUnitValidationError) reject(`METHOD_PREFLIGHT_REJECTED:${error.message}`);
      throw error;
    }
    if (input.files.some(file => !consumed.has(file.path))) reject('UNCONSUMED_FILE');
    // Server metadata records operator declarations; it must never stand in as method evidence.
    if (consumed.has(SUPPLEMENTAL_CONTEXT_PATH)) reject('CONTEXT_CONSUMED_AS_SOURCE');
  }
}

export function supplementalPackageKeyPrefix(runId: string): string { return `automation-supplemental:${runId}-`; }
export function supplementalPackageKey(runId: string, family: Request['family'], requestKey: string): string {
  return `${supplementalPackageKeyPrefix(runId)}${family.toLowerCase()}-${requestKey}`;
}
export function supplementalRunBindingSha256(bound: SupplementalRunBinding): string {
  return hash(Buffer.from(canonicalJson(bound)));
}

/** Declaration rules shared by preparation and reload. Returns the canonical request with files sorted by path,
 * so reordered equivalent declarations are the same request. */
export function normalizeSupplementalRequest(input: Request): Request {
  const declared = new Map<string, Request['files'][number]>();
  for (const file of input.files) {
    if (declared.has(file.path)) reject('DUPLICATE_PATH');
    if (path.posix.normalize(file.path) !== file.path || file.path === '.' || /^[A-Za-z]:\//.test(file.path)) reject('UNSAFE_PATH');
    if (file.path.startsWith(RESERVED_DIRECTORY)) reject('RESERVED_PATH');
    if (input.family === 'QUOTE' && file.mediaType !== 'application/json') reject('UNSUPPORTED_MEDIA_TYPE');
    declared.set(file.path, file);
  }
  if (declared.get(input.descriptorPath)?.mediaType !== 'application/json') reject('DESCRIPTOR_NOT_INCLUDED');
  return { ...input, files: [...declared.values()].sort(byPath) };
}

/** Exact server-owned Foundation metadata for a normalized request plus its context member, sorted by path;
 * undefined when any member's bytes are absent. Digests and sizes always come from the bytes. */
export function expectedSupplementalMetadata(runId: string, input: Request, bytesByPath: ReadonlyMap<string, Uint8Array>): FileMetadata[] | undefined {
  const evidenceFamily = `supplemental-${input.family.toLowerCase()}-${runId}`;
  const members = [...input.files.map(file => ({ ...file, provenanceBasis: PROVENANCE_BASIS })),
    { path: SUPPLEMENTAL_CONTEXT_PATH, mediaType: 'application/json', representationRole: 'derived' as const, provenanceBasis: CONTEXT_PROVENANCE_BASIS }];
  const files: FileMetadata[] = [];
  for (const member of members.sort(byPath)) {
    const bytes = bytesByPath.get(member.path);
    if (!bytes) return undefined;
    files.push({ path: member.path, sha256: hash(bytes), byteSize: bytes.byteLength, mediaType: member.mediaType, evidenceFamily,
      representationRole: member.representationRole, independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
      provenanceBasis: member.provenanceBasis });
  }
  return files;
}

/** Parses a stored context member closed and canonical; undefined unless it is exactly the server-created form. */
export function parseSupplementalContext(bytes: Uint8Array): SupplementalSourceContext | undefined {
  let text = '', value: unknown;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); value = JSON.parse(text); }
  catch { return undefined; }
  if (!validateContext(value) || canonicalJson(value) !== text) return undefined;
  try { if (canonicalJson(normalizeSupplementalRequest(value.request)) !== canonicalJson(value.request)) return undefined; }
  catch (error) { if (error instanceof SupplementalSourceRejection) return undefined; throw error; }
  return value;
}

/** Projection shared by the receipt and reload inventory: uploaded members only, never the server context. */
export function preparedSupplementalPackage(input: Request, verified: VerifiedFinalizedSourcePackage): ResearchAutomationSupplementalPreparedPackage {
  return { requestKey: input.requestKey, family: input.family, state: 'PREPARED_NOT_ADMITTED', packageId: verified.packageId,
    manifestArtifactSha256: verified.manifestArtifactSha256, packageContentSha256: verified.packageContentSha256,
    descriptorPath: input.descriptorPath,
    files: input.files.map(declared => {
      const file = verified.files.find(candidate => candidate.path === declared.path);
      if (!file) throw new Error('Prepared supplemental member is missing');
      return { path: file.path, sha256: file.sha256, byteSize: file.byteSize, mediaType: declared.mediaType };
    }),
    sourceLabel: verified.manifest.sourceLabel, acquiredAt: verified.manifest.sourceAcquiredAt,
    provenance: 'OPERATOR_SUPPLIED_UNVERIFIED', admission: 'SEMANTIC_REPLAY_REQUIRED_AT_REVISION' };
}
