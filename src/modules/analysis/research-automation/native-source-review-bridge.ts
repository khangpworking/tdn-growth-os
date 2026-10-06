import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import type { LocatedInsightMethods } from '../../../../contracts/analysis/located-insight-methods.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { selectExactShopeeListings } from '../../foundation/shopee-exact-selection.js';
import { buildPackageLocatedInsightExtension } from '../report-located-insight-extension.js';
import { mapDamiLocatedReviewSource, type DamiLocatedReviewMapping } from './dami-located-review-mapping.js';
import { exactShopeeRequest, type ExactShopeeRunInput } from './exact-shopee-bridge.js';
import { readLiteralReviewRulesV1 } from './literal-review-coding.js';
import { MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError } from './model.js';
import type { SourcePackageLiteralReviewDiagnostics } from './source-package-literal-review-adapter.js';
import { buildSourcePackageLiteralReviewProjection } from './source-package-literal-review-projection.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const DESCRIPTOR = 'methods/located-input.json';
const ORIGINAL_OUTPUT = 'methods/located-output.json';
const MAPPING = 'mapping/dami-production-mapping-v1.json';
const MAPPER = 'mapping/dami-production-mapper.ts';
const DATASET = 'capture/dataset.json';
const PROJECTION = 'methods/literal-declaration-projection.json';
const PROJECTION_INPUT = 'methods/literal-declaration-input.json';
const PROJECTION_OUTPUT = 'methods/literal-declaration-output.json';
const DIAGNOSTICS = 'methods/literal-located-diagnostics.json';
const CONFIG = 'normalized/native-review-run.json';
const REFERENCE = 'dependencies/native-review-reference.json';
const SCHEMA = 'profiles/located-insight-methods.schema.json';
const POLICY = 'authority/literal-review-projection-policy-v1.json';
const RULES = 'rules/literal-review-rules.json';
const PARSER = 'rules/literal-review-parser.ts';
const ADAPTER = 'rules/source-package-literal-review-adapter.ts';
const BRIEF = 'rules/literal-review-semantics.md';
const PROJECTOR = 'rules/literal-review-projection.ts';
const WRAPPER = 'rules/source-package-literal-review-projection.ts';
const MAPPER_SHA256 = '8533b496163822cc00be21bddad0ed1db9462f1de8c8bdba7c7907287507f94a';
const POLICY_SHA256 = 'ba676c8e9e89f7ba0f05ec6157b82414524f6af48697900afe61ac7e0dc64f42';
const PROJECTOR_SHA256 = 'a5195185db078e8ac03427885e24f72ec9c3eb0cce75d85ad8f081e5f04f0daa';
const WRAPPER_SHA256 = '160e97c67ac9c42fe0105f3cb147dd8aee13bc7dedb62afaeaca8baeadf083d7';
const NATIVE_PATHS = ['capture/request.json', 'capture/start-response.json', 'capture/terminal-status.json', DATASET,
  'capture/notices.json', 'capture/receipt.json', 'authority/qualitative-profile.md', 'authority/method-adoption.md',
  DESCRIPTOR, ORIGINAL_OUTPUT, 'mapping/dami-review-fields-v2.json', 'mapping/provider-field-basis.md', MAPPING, MAPPER,
  'dependencies/source-package-v2.json'];
const OVERLAY_PATHS = [...NATIVE_PATHS, PROJECTION, PROJECTION_INPUT, PROJECTION_OUTPUT, DIAGNOSTICS, CONFIG, REFERENCE,
  SCHEMA, POLICY, RULES, PARSER, ADAPTER, BRIEF, PROJECTOR, WRAPPER, 'methods/located-insight-bundle.json'];
const BUDGET = { maxFileBytes: MAX_JSON_ARTIFACT_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const sha = (value: Uint8Array | string): string => createHash('sha256').update(value).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
function fail(message: string): never { throw new ResearchAutomationIntegrityError(message); }
type Identity = NonNullable<Parameters<typeof buildPackageLocatedInsightExtension>[1]>;
type ProjectionDocument = Awaited<ReturnType<typeof buildSourcePackageLiteralReviewProjection>>['output'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** The optional execution identity belongs to a supplemental method attempt, not the v1 source reference. */
export type NativeSourceReviewRunInput = ExactShopeeRunInput & { readonly executionId?: string };
export interface NativeSourceReviewReference {
  contractVersion: 'automation-native-review-reference-v1';
  runId: string;
  selected: { shopId: string; itemId: string };
  sourcePackage: Identity;
  descriptor: { logicalPath: typeof DESCRIPTOR; sha256: string };
  mapping: { logicalPath: typeof MAPPING; sha256: string; mapperSha256: string };
  capture: { actor: string; runId: string; datasetId: string; requestSha256: string; datasetSha256: string;
    terminalSha256: string; receiptSha256: string };
  bindingSha256: string;
}
export type NativeSourceReviewResolution = { state: 'RESOLVED'; reference: NativeSourceReviewReference }
  | { state: 'NONE' | 'AMBIGUOUS' | 'UNSUPPORTED_SCOPE' };
export interface NativeSourceReviewSnapshot {
  contractVersion: 'automation-native-review-snapshot-v1' | 'automation-native-review-snapshot-v2';
  runId: string;
  /** Present only for explicit supplemental executions. Historical v1 snapshots keep their exact shape. */
  executionId?: string;
  /** Full input binding for a v2 method; v1 keeps the reference-only binding for historical replay. */
  runBindingSha256?: string;
  authorityState: 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS';
  nativeSource: NativeSourceReviewReference;
  sourcePackage: Identity;
  projectionSha256: string;
  projectionId: string;
  policySha256: string;
  projection: ProjectionDocument['projection'];
  output: LocatedInsightMethods;
}

/** Connects one confirmed listing to an original native capture, never a synthetic collection. */
export class AutomationNativeSourceReviewBridge {
  readonly #packages: SourcePackageService;
  readonly #reader: FoundationSourcePackageReader;
  readonly #db: Database.Database;
  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date }) {
    this.#db = options.db;
    this.#packages = new SourcePackageService(options);
    this.#reader = new FoundationSourcePackageReader(this.#packages);
  }

  async resolve(input: NativeSourceReviewRunInput): Promise<NativeSourceReviewResolution> {
    validateExecution(input);
    if (!input.scope.exactShopeeUrls?.length) return { state: 'NONE' };
    const selections = selectExactShopeeListings(exactShopeeRequest(input)).selected;
    const matches: NativeSourceReviewReference[] = [];
    try {
      // Still discovery, not an admitted reference: no run-bound native key or admission record exists yet.
      // Only immutable rows with the exact original version/membership are verified, so unrelated or damaged
      // packages of any other shape cannot block this run. Failure of a candidate is not absence.
      const candidates = await this.#reader.findFinalizedSourcePackagesByMembership(3, NATIVE_PATHS);
      for (const candidate of candidates) {
        if (!originalNativeKey(candidate.packageKey)) continue;
        const source = await this.#reader.readFinalizedSourcePackage(candidate.packageId, BUDGET);
        if (source.manifestArtifactSha256 !== candidate.manifestArtifactSha256) fail('Native source candidate identity differs.');
        if (!originalNativeFormat(source)) continue;
        const mapping = parse(source, MAPPING) as DamiLocatedReviewMapping;
        const selected = selections.find(value => equal(mapping.selected, { shopId: value.shopId, itemId: value.itemId }));
        if (!selected) continue;
        const oneListingInput = selections.length === 1 ? input : { ...input,
          scope: { ...input.scope, exactShopeeUrls: [selected.submittedUrl] } };
        const reference = referenceFor(source, oneListingInput);
        validateNativeBindings(source, reference, oneListingInput);
        await this.#verifyNativePrior(source);
        const mapped = mapDamiLocatedReviewSource(file(source, DATASET), reference.selected);
        const descriptor = parse(source, DESCRIPTOR) as LocatedInsightMethods['input'];
        if (!equal(mapped.mapping, mapping) || !equal(mapped.records, descriptor.records)) fail('Native source mapping differs from reviewed mapping.');
        await buildPackageLocatedInsightExtension(DESCRIPTOR, identity(source), this.#reader);
        matches.push(reference);
      }
    } catch {
      fail('SOURCE_PACKAGE_RESOLUTION_FAILED: native source candidates or binding could not be verified.');
    }
    if (matches.length && selections.length !== 1) return { state: 'UNSUPPORTED_SCOPE' };
    return matches.length === 0 ? { state: 'NONE' } : matches.length === 1
      ? { state: 'RESOLVED', reference: matches[0]! } : { state: 'AMBIGUOUS' };
  }

  /**
   * Explicit supplemental-source resolution. The package ID is supplied by the
   * owner attempt, so this path never discovers or chooses a different native
   * capture from the retained inventory.
   */
  async resolvePackage(input: NativeSourceReviewRunInput, packageId: string): Promise<NativeSourceReviewReference> {
    validateExecution(input);
    if (input.scope.exactShopeeUrls?.length !== 1 || typeof packageId !== 'string' || !packageId.length)
      fail('Native supplemental review requires one exact listing and one retained package.');
    const source = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    if (!originalNativeFormat(source)) fail('Native supplemental source package is not an original capture.');
    const mapping = parse(source, MAPPING) as DamiLocatedReviewMapping;
    const reference = referenceFor(source, input);
    validateNativeBindings(source, reference, input);
    await this.#verifyNativePrior(source);
    const mapped = mapDamiLocatedReviewSource(file(source, DATASET), reference.selected);
    const descriptor = parse(source, DESCRIPTOR) as LocatedInsightMethods['input'];
    if (!equal(mapped.mapping, mapping) || !equal(mapped.records, descriptor.records)) fail('Native source mapping differs from reviewed mapping.');
    await buildPackageLocatedInsightExtension(DESCRIPTOR, identity(source), this.#reader);
    return reference;
  }

  async readReference(reference: NativeSourceReviewReference, input: NativeSourceReviewRunInput): Promise<VerifiedFinalizedSourcePackage> {
    validateExecution(input);
    if (!reference || reference.contractVersion !== 'automation-native-review-reference-v1' || reference.runId !== input.runId ||
        reference.bindingSha256 !== referenceBinding(input) || !equal(reference.selected, selectedListing(input)))
      fail('Native review reference differs from its frozen confirmed run.');
    const source = await this.#reader.readFinalizedSourcePackage(reference.sourcePackage.packageId, BUDGET);
    if (!equal(reference.sourcePackage, identity(source)) || !equal(reference, referenceFor(source, input)))
      fail('Native review reference package or capture identity differs.');
    validateNativeBindings(source, reference, input);
    await this.#verifyNativePrior(source);
    return source;
  }

  async #verifyNativePrior(source: VerifiedFinalizedSourcePackage): Promise<void> {
    const frozen = parse(source, 'dependencies/source-package-v2.json') as Identity;
    if (typeof frozen?.packageId !== 'string') fail('Native mapped source dependency is invalid.');
    const prior = await this.#reader.readFinalizedSourcePackage(frozen.packageId, BUDGET);
    const priorPaths = NATIVE_PATHS.filter(path => ![MAPPING, MAPPER, 'dependencies/source-package-v2.json'].includes(path));
    if (!equal(frozen, identity(prior)) || prior.manifest.version !== 2 || prior.manifest.packageKey !== source.manifest.packageKey ||
        prior.manifest.sourceAcquiredAt !== source.manifest.sourceAcquiredAt || !membership(prior, priorPaths))
      fail('Native mapped source prior package identity differs.');
    for (const path of priorPaths.filter(value => value !== DESCRIPTOR && value !== ORIGINAL_OUTPUT)) {
      const { bytes: priorBytes, ...priorMetadata } = file(prior, path);
      const { bytes: sourceBytes, ...sourceMetadata } = file(source, path);
      if (!priorBytes.equals(sourceBytes) || !equal(priorMetadata, sourceMetadata))
        fail('Native mapped source capture or authority dependency differs.');
    }
  }

  async execute(reference: NativeSourceReviewReference, input: NativeSourceReviewRunInput, signal?: AbortSignal): Promise<NativeSourceReviewSnapshot> {
    signal?.throwIfAborted();
    validateExecution(input);
    const original = await this.readReference(reference, input);
    const prepared = await buildSourcePackageLiteralReviewProjection({ sourcePackage: reference.sourcePackage, logicalPath: DESCRIPTOR },
      this.#reader, readLiteralReviewRulesV1());
    if (prepared.output.implementation.projectionSha256 !== PROJECTOR_SHA256 || prepared.output.implementation.wrapperSha256 !== WRAPPER_SHA256)
      fail('Native declaration implementation differs from reviewed bytes.');
    const files = new Map(original.files.map(value => [value.path, value.bytes]));
    for (const [path, bytes] of prepared.files) {
      if (files.has(path) && !files.get(path)!.equals(bytes)) fail('Native declaration collides with original source bytes.');
      files.set(path, bytes);
    }
    files.set(REFERENCE, json(reference));
    files.set(CONFIG, json(runConfig(input, sha(files.get(REFERENCE)!))));
    for (const bytes of files.values()) if (bytes.length > MAX_JSON_ARTIFACT_BYTES) fail('Native declaration exceeds its bound.');
    const first = original.manifest.files[0]!;
    const metadataByPath = new Map(original.manifest.files.map(value => [value.path, value]));
    const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: methodKey(input), version: 1,
      sourceLabel: 'Retained native shop-sweep source and partial source-bound declarations', sourceAcquiredAt: original.manifest.sourceAcquiredAt,
      files: [first, ...[...files].filter(([path]) => path !== first.path).map(([path, bytes]) => metadataByPath.get(path) ?? metadata(path, bytes))] };
    return withDatabaseMutationMutex(this.#db, async () => {
      signal?.throwIfAborted();
      const receipt = await this.#packages.intake(request, files);
      const retained = await this.#reader.readFinalizedSourcePackage(receipt.packageId, BUDGET);
      if (retained.files.length !== files.size || retained.files.some(value => !files.get(value.path)?.equals(value.bytes)))
        fail('Native declaration publication differs from prepared bytes.');
      signal?.throwIfAborted();
      const version = snapshotVersion(input);
      return { contractVersion: version, runId: input.runId, ...executionSnapshotIdentity(input), authorityState: prepared.output.authorityState,
        nativeSource: reference, sourcePackage: identity(retained), projectionSha256: sha(prepared.bytes), projectionId: prepared.output.projectionId,
        policySha256: prepared.output.policySha256, projection: prepared.output.projection, output: prepared.locatedOutput };
    });
  }

  async verify(untrusted: unknown, reference: NativeSourceReviewReference, input: NativeSourceReviewRunInput): Promise<void> {
    if (!untrusted || typeof untrusted !== 'object' || Array.isArray(untrusted) || json(untrusted).length > MAX_JSON_ARTIFACT_BYTES)
      fail('Native declaration snapshot is invalid.');
    await this.#verifyFrozenSnapshot(untrusted as NativeSourceReviewSnapshot, reference, input);
  }

  async #verifyFrozenSnapshot(snapshot: NativeSourceReviewSnapshot, reference: NativeSourceReviewReference,
    input: NativeSourceReviewRunInput): Promise<void> {
    validateExecution(input);
    const v2 = input.executionId !== undefined;
    const keys = ['authorityState', 'contractVersion', 'nativeSource', 'output', 'policySha256', 'projection', 'projectionId', 'projectionSha256', 'runId', 'sourcePackage',
      ...(v2 ? ['executionId', 'runBindingSha256'] : [])].sort().join(',');
    if (Object.keys(snapshot).sort().join(',') !== keys ||
        snapshot.contractVersion !== snapshotVersion(input) || snapshot.runId !== input.runId ||
        snapshot.authorityState !== 'ADOPTED_FOR_SOURCE_BOUND_DECLARATIONS' || snapshot.policySha256 !== POLICY_SHA256 || !equal(snapshot.nativeSource, reference))
      fail('Native declaration snapshot identity differs.');
    if (v2 && (snapshot.executionId !== input.executionId || snapshot.runBindingSha256 !== sha(json(input))))
      fail('Native declaration supplemental execution identity differs.');
    const original = await this.readReference(reference, input);
    const retained = await this.#reader.readFinalizedSourcePackage(snapshot.sourcePackage.packageId, BUDGET);
    if (!equal(snapshot.sourcePackage, identity(retained)) || retained.manifest.packageKey !== methodKey(input) ||
        retained.manifest.version !== 1 || !membership(retained, OVERLAY_PATHS)) fail('Native declaration retained package identity differs.');
    const originalMetadata = new Map(original.manifest.files.map(value => [value.path, value]));
    for (const value of retained.files) {
      const { bytes, ...actual } = value;
      if (!equal(actual, originalMetadata.get(value.path) ?? metadata(value.path, bytes)) ||
          (originalMetadata.has(value.path) && !file(original, value.path).bytes.equals(bytes))) fail('Native declaration retained file role or source differs.');
    }
    if (!equal(parse(retained, REFERENCE), reference) || !equal(parse(retained, CONFIG), runConfig(input, file(retained, REFERENCE).sha256)))
      fail('Native declaration configuration differs from frozen run.');
    verifyFrozenProjection(retained, original, snapshot);
  }

  async readSnapshot(sourcePackage: NativeSourceReviewSnapshot['sourcePackage'], reference: NativeSourceReviewReference,
    input: NativeSourceReviewRunInput): Promise<NativeSourceReviewSnapshot> {
    validateExecution(input);
    const retained = await this.#reader.readFinalizedSourcePackage(sourcePackage.packageId, BUDGET);
    if (!equal(sourcePackage, identity(retained))) fail('Native declaration fallback package identity differs.');
    const overlay = parse(retained, PROJECTION) as ProjectionDocument;
    const snapshot: NativeSourceReviewSnapshot = { contractVersion: snapshotVersion(input), runId: input.runId, ...executionSnapshotIdentity(input),
      authorityState: overlay.authorityState, nativeSource: parse(retained, REFERENCE) as NativeSourceReviewReference, sourcePackage,
      projectionSha256: file(retained, PROJECTION).sha256, projectionId: overlay.projectionId, policySha256: overlay.policySha256,
      projection: overlay.projection, output: parse(retained, PROJECTION_OUTPUT) as LocatedInsightMethods };
    // Reconstructed data is bounded by Foundation's individual-file and package read budgets,
    // not the inline report-document limit. Frozen identity checks remain identical.
    await this.#verifyFrozenSnapshot(snapshot, reference, input);
    return snapshot;
  }
}

function selectedListing(input: NativeSourceReviewRunInput): NativeSourceReviewReference['selected'] {
  if (input.scope.exactShopeeUrls?.length !== 1) fail('Native review requires exactly one confirmed listing.');
  const selected = selectExactShopeeListings(exactShopeeRequest(input)).selected[0]!;
  return { shopId: selected.shopId, itemId: selected.itemId };
}
function validateExecution(input: NativeSourceReviewRunInput): void {
  if (input.executionId !== undefined && !UUID.test(input.executionId)) fail('Native review execution identity is invalid.');
}
function referenceInput(input: NativeSourceReviewRunInput): ExactShopeeRunInput {
  const { executionId: _executionId, ...historical } = input;
  return historical;
}
function referenceBinding(input: NativeSourceReviewRunInput): string {
  // The v1 reference is the historical source binding. Supplemental execution
  // identity is deliberately kept in the v2 method, not retrofitted into it.
  return sha(json(referenceInput(input)));
}
function snapshotVersion(input: NativeSourceReviewRunInput): NativeSourceReviewSnapshot['contractVersion'] {
  return input.executionId === undefined ? 'automation-native-review-snapshot-v1' : 'automation-native-review-snapshot-v2';
}
function methodKey(input: NativeSourceReviewRunInput): string {
  return input.executionId === undefined
    ? `automation-method:${input.runId}-native-review-v1`
    : `automation-method:${input.runId}-native-review-v2-${input.executionId}`;
}
function executionSnapshotIdentity(input: NativeSourceReviewRunInput): Pick<NativeSourceReviewSnapshot, 'executionId' | 'runBindingSha256'> | Record<never, never> {
  return input.executionId === undefined ? {} : { executionId: input.executionId, runBindingSha256: sha(json(input)) };
}
function runConfig(input: NativeSourceReviewRunInput, referenceSha256: string) {
  return { contractVersion: input.executionId === undefined ? 'automation-native-review-run-v1' : 'automation-native-review-run-v2',
    ...input, referenceSha256 };
}
function membership(source: VerifiedFinalizedSourcePackage, paths: readonly string[]): boolean {
  return source.files.length === paths.length && source.files.every(value => paths.includes(value.path));
}
function originalNativeKey(packageKey: string): boolean {
  return !/^(automation-method|private-method):/.test(packageKey);
}
function originalNativeFormat(source: VerifiedFinalizedSourcePackage): boolean {
  return source.manifest.version === 3 && originalNativeKey(source.manifest.packageKey) &&
    !source.files.some(value => value.path === PROJECTION) && membership(source, NATIVE_PATHS);
}
function identity(source: VerifiedFinalizedSourcePackage): Identity {
  return { packageId: source.packageId, manifestArtifactSha256: source.manifestArtifactSha256,
    packageContentSha256: source.packageContentSha256, manifest: source.manifest };
}
function file(source: VerifiedFinalizedSourcePackage, path: string) {
  const found = source.files.find(value => value.path === path);
  if (!found) fail(`Native review retained file is missing: ${path}`);
  return found;
}
function parse(source: VerifiedFinalizedSourcePackage, path: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file(source, path).bytes)); }
  catch { return fail(`Native review retained JSON is invalid: ${path}`); }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Native review retained object is invalid.');
  return value as Record<string, unknown>;
}
function referenceFor(source: VerifiedFinalizedSourcePackage, input: NativeSourceReviewRunInput): NativeSourceReviewReference {
  validateExecution(input);
  const request = object(parse(source, 'capture/request.json'));
  const terminal = object(object(parse(source, 'capture/terminal-status.json')).data);
  if (typeof request.actor !== 'string' || typeof terminal.id !== 'string' || typeof terminal.defaultDatasetId !== 'string')
    fail('Native capture reported identities are missing.');
  return { contractVersion: 'automation-native-review-reference-v1', runId: input.runId, selected: selectedListing(input), sourcePackage: identity(source),
    descriptor: { logicalPath: DESCRIPTOR, sha256: file(source, DESCRIPTOR).sha256 },
    mapping: { logicalPath: MAPPING, sha256: file(source, MAPPING).sha256, mapperSha256: file(source, MAPPER).sha256 },
    capture: { actor: request.actor, runId: terminal.id, datasetId: terminal.defaultDatasetId,
      requestSha256: file(source, 'capture/request.json').sha256, datasetSha256: file(source, DATASET).sha256,
      terminalSha256: file(source, 'capture/terminal-status.json').sha256, receiptSha256: file(source, 'capture/receipt.json').sha256 },
    bindingSha256: referenceBinding(input) };
}

/** Frozen source relationships only. This does not execute the retained or current mapper. */
function validateNativeBindings(source: VerifiedFinalizedSourcePackage, reference: NativeSourceReviewReference, input: NativeSourceReviewRunInput): void {
  if (!originalNativeFormat(source) || file(source, MAPPER).sha256 !== MAPPER_SHA256) fail('Native source format or reviewed mapper differs.');
  const request = object(parse(source, 'capture/request.json'));
  const receipt = object(parse(source, 'capture/receipt.json'));
  const start = object(object(parse(source, 'capture/start-response.json')).data);
  const terminal = object(object(parse(source, 'capture/terminal-status.json')).data);
  const requestUrls = object(request.input).startUrls;
  if (!Array.isArray(requestUrls) || requestUrls.length !== 1 || typeof requestUrls[0] !== 'string') fail('Native capture exact listing request is invalid.');
  const requested = selectExactShopeeListings({ ...exactShopeeRequest(input), productUrls: [requestUrls[0]] }).selected[0]!;
  if (!equal({ shopId: requested.shopId, itemId: requested.itemId }, reference.selected) ||
      request.actor !== 'dami_studio/shopee-shop-reviews-scraper' || receipt.actor !== request.actor || terminal.status !== 'SUCCEEDED' ||
      start.id !== terminal.id || receipt.runId !== terminal.id || start.defaultDatasetId !== terminal.defaultDatasetId ||
      typeof terminal.id !== 'string' || !terminal.id || typeof terminal.defaultDatasetId !== 'string' || !terminal.defaultDatasetId ||
      receipt.datasetSha256 !== file(source, DATASET).sha256 || receipt.requestSha256 !== file(source, 'capture/request.json').sha256 ||
      receipt.terminalSha256 !== file(source, 'capture/terminal-status.json').sha256 || receipt.noticesSha256 !== file(source, 'capture/notices.json').sha256)
    fail('Native capture receipt or selected listing binding differs.');
  const raw = parse(source, DATASET);
  const mapping = parse(source, MAPPING) as DamiLocatedReviewMapping;
  const descriptor = parse(source, DESCRIPTOR) as LocatedInsightMethods['input'];
  const output = parse(source, ORIGINAL_OUTPUT) as LocatedInsightMethods;
  const dataset = file(source, DATASET);
  if (!Array.isArray(raw) || raw.length > 10_000 || raw.length !== receipt.returnedRows || !Array.isArray(mapping.rows) || mapping.rows.length !== raw.length ||
      mapping.mappingRevision !== 'dami-shop-sweep-review-row-v1' || !equal(mapping.selected, reference.selected) ||
      !equal(mapping.source, { logicalPath: DATASET, sha256: dataset.sha256, byteSize: dataset.byteSize, providerProvenance: dataset.providerProvenance }) ||
      !Array.isArray(descriptor.records) || descriptor.records.length !== raw.length || !equal(output.input, descriptor) ||
      descriptor.profileSha256 !== file(source, 'authority/qualitative-profile.md').sha256 || descriptor.adoptionSha256 !== file(source, 'authority/method-adoption.md').sha256)
    fail('Native source mapping or descriptor identity differs.');
  const { methodOutputId, ...outputBody } = output;
  if (methodOutputId !== sha(json(outputBody)) || ['i02', 'i04', 'i05', 'i06', 'i07', 'i08', 'i09', 'corpora', 'i13Mentions'].some(key =>
    !Array.isArray(descriptor[key as 'i02']) || descriptor[key as 'i02'].length) || descriptor.brief !== null ||
      !equal(descriptor.sources, [{ logicalPath: DATASET, sha256: dataset.sha256 }]))
    fail('Native original output or unannotated descriptor differs.');
  let exactTextRows = 0;
  for (const [index, value] of raw.entries()) {
    const row = object(value); const mapped = mapping.rows[index]!; const record = descriptor.records[index]!;
    if (!Object.hasOwn(row, 'comment') || (row.comment !== null && typeof row.comment !== 'string')) fail('Native comment source field is invalid.');
    const original = (key: string): unknown => Object.hasOwn(row, key) ? row[key] : null;
    const sourceDate = typeof row.review_date === 'string' && row.review_date.length ? row.review_date : null;
    const rowShop = nativeId(row.shopid); const rowItem = nativeId(row.itemid);
    const listingAdmission = rowShop === null || rowItem === null ? 'UNRESOLVED_LISTING'
      : rowShop === reference.selected.shopId && rowItem === reference.selected.itemId ? 'SELECTED_LISTING' : 'WRONG_LISTING';
    const rowTypeAdmission = row.type === 'review' ? 'REVIEW_ROW' : typeof row.type === 'string' ? 'NON_REVIEW_ROW' : 'UNRESOLVED_ROW_TYPE';
    if (listingAdmission === 'SELECTED_LISTING' && typeof row.comment === 'string' && row.comment.trim()) exactTextRows++;
    if (mapped.recordIndex !== index || mapped.rowPointer !== `/${index}` || mapped.textPointer !== `/${index}/comment` ||
        mapped.rowTypePresent !== Object.hasOwn(row, 'type') || !equal(mapped.originalRowType, original('type')) || mapped.rowTypeAdmission !== rowTypeAdmission ||
        mapped.shopId !== rowShop || mapped.itemId !== rowItem || mapped.listingAdmission !== listingAdmission ||
        mapped.nativeReviewId !== nativeId(row.cmtid) || !equal(mapped.originalNativeReviewId, original('cmtid')) ||
        mapped.ratingPresent !== Object.hasOwn(row, 'rating_star') || !equal(mapped.ratingStar, original('rating_star')) ||
        mapped.reviewDatePresent !== Object.hasOwn(row, 'review_date') || !equal(mapped.originalReviewDate, original('review_date')) || mapped.sourceReviewDate !== sourceDate ||
        mapped.ctimePresent !== Object.hasOwn(row, 'ctime') || !equal(mapped.ctime, original('ctime')) ||
        mapped.collectedAtPresent !== Object.hasOwn(row, 'collected_at') || !equal(mapped.collectedAt, original('collected_at')) ||
        mapped.modelNamePresent !== Object.hasOwn(row, 'model_name') || !equal(mapped.modelName, original('model_name')) ||
        record.sourceSha256 !== dataset.sha256 || record.locator !== mapped.textPointer || record.text !== row.comment || record.timeText !== sourceDate ||
        !Array.isArray(mapped.nativeIdConflicts) || (record.disposition === 'INCLUDED' &&
          (listingAdmission !== 'SELECTED_LISTING' || rowTypeAdmission !== 'REVIEW_ROW' || typeof row.comment !== 'string' || !row.comment.trim() || mapped.quarantined || mapped.nativeIdConflicts.length)) ||
        (row.comment === null && record.disposition !== 'UNREADABLE')) fail('Native mapped record differs from actual source fields.');
  }
  if (receipt.exactTextRows !== exactTextRows || mapping.coverage.rawRows !== raw.length ||
      mapping.coverage.includedRows !== descriptor.records.filter(value => value.disposition === 'INCLUDED').length ||
      mapping.coverage.excludedRows !== descriptor.records.filter(value => value.disposition === 'EXCLUDED').length ||
      mapping.coverage.unreadableRows !== descriptor.records.filter(value => value.disposition === 'UNREADABLE').length)
    fail('Native retained row coverage differs.');
}
function nativeId(value: unknown): string | null {
  return typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value) ? value
    : typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? String(value) : null;
}

function verifyFrozenProjection(retained: VerifiedFinalizedSourcePackage, original: VerifiedFinalizedSourcePackage, snapshot: NativeSourceReviewSnapshot): void {
  const overlay = parse(retained, PROJECTION) as ProjectionDocument;
  const { projectionId, ...overlayBody } = overlay;
  const diagnostics = parse(retained, DIAGNOSTICS) as SourcePackageLiteralReviewDiagnostics;
  const { codingId, ...codingBody } = diagnostics;
  const policy = parse(retained, POLICY) as Pick<ProjectionDocument, 'policyRevision' | 'authorityState' | 'acceptedTuple' | 'acceptanceTurnId' | 'adoptionTurnId'>;
  const acceptedTuple = { rulesSha256: file(retained, RULES).sha256, parserSha256: file(retained, PARSER).sha256,
    adapterSha256: file(retained, ADAPTER).sha256, semanticsSha256: file(retained, BRIEF).sha256 };
  const descriptor = { logicalPath: DESCRIPTOR, sha256: file(original, DESCRIPTOR).sha256, byteSize: file(original, DESCRIPTOR).byteSize };
  const originalOutput = parse(original, ORIGINAL_OUTPUT) as LocatedInsightMethods;
  if (file(retained, PROJECTION).sha256 !== snapshot.projectionSha256 || projectionId !== snapshot.projectionId || sha(json(overlayBody)) !== projectionId ||
      overlay.contractVersion !== 'source-package-literal-declaration-projection-v1' || overlay.authorityState !== snapshot.authorityState || overlay.sectionState !== 'PARTIAL' ||
      overlay.policyRevision !== 'literal-source-bound-v1' || policy.policyRevision !== overlay.policyRevision || policy.authorityState !== overlay.authorityState ||
      file(retained, POLICY).sha256 !== POLICY_SHA256 || overlay.policySha256 !== POLICY_SHA256 ||
      policy.acceptanceTurnId !== overlay.acceptanceTurnId || policy.adoptionTurnId !== overlay.adoptionTurnId ||
      !equal(policy.acceptedTuple, acceptedTuple) || !equal(overlay.acceptedTuple, acceptedTuple) ||
      file(retained, PROJECTOR).sha256 !== PROJECTOR_SHA256 || file(retained, WRAPPER).sha256 !== WRAPPER_SHA256 ||
      !equal(overlay.implementation, { projectionSha256: PROJECTOR_SHA256, wrapperSha256: WRAPPER_SHA256 }) ||
      !equal(overlay.sourcePackage, snapshot.nativeSource.sourcePackage) || !equal(diagnostics.sourcePackage, overlay.sourcePackage) ||
      !equal(overlay.descriptor, descriptor) || !equal(diagnostics.descriptor, descriptor) ||
      overlay.codingSha256 !== file(retained, DIAGNOSTICS).sha256 || overlay.codingId !== codingId || codingId !== sha(json(codingBody)) ||
      diagnostics.contractVersion !== 'source-package-literal-review-diagnostics-v1' || diagnostics.authorityState !== 'RULE_PROPOSAL_ONLY' ||
      diagnostics.diagnostics.executionAuthority !== 'NONE_RULE_PROPOSAL_ONLY' || diagnostics.diagnostics.rules.declaredStatus !== 'PROPOSAL_PENDING_BUSINESS_REVIEW' ||
      diagnostics.diagnostics.rules.sha256 !== acceptedTuple.rulesSha256 || !equal(diagnostics.implementation,
        { parserSha256: acceptedTuple.parserSha256, adapterSha256: acceptedTuple.adapterSha256, semanticsSha256: acceptedTuple.semanticsSha256 }) ||
      diagnostics.locatedOutputId !== originalOutput.methodOutputId || !equal(diagnostics.diagnostics.records, originalOutput.input.records) ||
      !equal(overlay.projection, snapshot.projection) || !equal(overlay.projection.pending, diagnostics.diagnostics.pending))
    fail('Native declaration retained authority or diagnostics differ.');
  const schema = object(parse(retained, SCHEMA));
  const output = parse(retained, PROJECTION_OUTPUT) as LocatedInsightMethods;
  if (schema.$id !== 'https://tdn.local/contracts/analysis/located-insight-methods.schema.json' ||
      !new Ajv2020({ strict: true, allErrors: true }).compile(schema)(output)) fail('Native declaration output fails retained schema.');
  const { methodOutputId, ...body } = output;
  const { i02, i04, i05, i07, i08, adjudicationRule: _rule, ...base } = output.input;
  const { i02: _i02, i04: _i04, i05: _i05, i07: _i07, i08: _i08, adjudicationRule: _originalRule, ...originalBase } = originalOutput.input;
  if (methodOutputId !== sha(json(body)) || !equal(snapshot.output, output) || !equal(overlay.output, output) ||
      !equal(parse(retained, PROJECTION_INPUT), output.input) || !equal(base, originalBase) || !equal({ i02, i04, i05, i07, i08 }, overlay.projection.candidates))
    fail('Native declaration output differs from retained candidate input.');
  for (const key of ['i02', 'i04', 'i05', 'i07', 'i08'] as const) {
    const admitted = overlay.projection.admitted.filter(value => value.family === key.toUpperCase());
    if (!equal(admitted.map(value => diagnostics.diagnostics.candidates[key][value.candidateIndex]), output.input[key]) ||
        output.input[key].some(value => value.provenance.basis !== 'DECLARED' || value.provenance.adjudication !== null || value.provenance.disagreement !== null))
      fail('Native declaration selection or provenance differs.');
  }
}
function metadata(path: string, bytes: Buffer): SourcePackageIntakeRequest['files'][number] {
  return { path, sha256: sha(bytes), byteSize: bytes.length, mediaType: path.endsWith('.md') ? 'text/markdown' : path.endsWith('.ts') ? 'text/plain' : 'application/json',
    evidenceFamily: 'automation-native-review-declarations', representationRole: 'derived', independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
    provenanceBasis: 'Derived from immutable native capture and reviewed declarations; not provider authenticity, complete history or final report approval.' };
}
