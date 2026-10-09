import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import type Database from 'better-sqlite3';
import descriptorSchema from '../../../../contracts/analysis/automation-metric-source.schema.json' with { type: 'json' };
import descriptorV2Schema from '../../../../contracts/analysis/automation-metric-source-v2.schema.json' with { type: 'json' };
import manifestSchema from '../../../../contracts/analysis/metric-source-manifest.schema.json' with { type: 'json' };
import inputSchema from '../../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import type { AutomationMetricSource } from '../../../../contracts/analysis/automation-metric-source.generated.js';
import type { AutomationMetricSourceV2 } from '../../../../contracts/analysis/automation-metric-source-v2.generated.js';
import type { MetricInputPreparationResult } from '../../../../contracts/analysis/metric-input-preparation-result.generated.js';
import type { MetricPreparationReadinessResult } from '../../../../contracts/analysis/metric-preparation-readiness-result.generated.js';
import type { MetricScopeOutput } from '../../../../contracts/analysis/metric-scope-output.generated.js';
import type { MetricSourceManifest } from '../../../../contracts/analysis/metric-source-manifest.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { ArtifactIntegrityError, ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { FoundationIdentityConflictError } from '../../foundation/foundation-service.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage, type VerifiedSourcePackageFile } from '../../foundation/source-package-service.js';
import type { DiscoveryWorkspaceReader } from '../../flow/discovery-workspace-reader.js';
import { AnalysisMetricInputPreparationReader, MetricInputPreparationService } from '../metric-input-preparation-service.js';
import { MetricPreparationReadinessService } from '../metric-preparation-readiness.js';
import { calculateMetricScopes, metricLabelFingerprint } from '../metric-scope-calculator.js';
import { METRIC_CURRENT_HEADERS, MetricSourceRejection, normalizeMetricWorkbookInput } from '../metric-source-profile.js';
import { MAX_JSON_ARTIFACT_BYTES, ResearchAutomationIntegrityError, type ScopeSnapshot, type StartSnapshot } from './model.js';
import { createRetainedSchemaCache } from './retained-schema-cache.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const currentAjv = new Ajv2020({ strict: true, allErrors: true });
addFormats(currentAjv);
currentAjv.addSchema(inputSchema);
const validateCurrentDescriptor = currentAjv.compile<AutomationMetricSource>(descriptorSchema);
const validateCurrentDescriptorV2 = currentAjv.compile<AutomationMetricSourceV2>(descriptorV2Schema);
const validateCurrentManifest = currentAjv.compile<MetricSourceManifest>(manifestSchema);
const retainedValidators = createRetainedSchemaCache({ formats: true });

const SOURCE_DESCRIPTOR = 'normalized/automation-metric-source.json';
const CONFIG = 'methods/metric-run.json';
const PREPARATION = 'methods/metric-preparation-result.json';
const NORMALIZED = 'methods/metric-normalized-input.json';
const RECEIPT = 'methods/metric-normalization-receipt.json';
const RESULT = 'methods/metric-scope-output.json';
const READINESS = 'methods/metric-readiness.json';
const CATALOG = 'authority/report-section-catalog-v1.json';
const SCHEMA_NAMES = ['automation-metric-source', 'metric-source-manifest', 'metric-scope-input', 'metric-scope-output',
  'metric-input-preparation-request', 'metric-input-preparation-result', 'metric-preparation-readiness-result', 'report-section-catalog'] as const;
type SchemaName = typeof SCHEMA_NAMES[number] | 'automation-metric-source-v2';
const schemaNames = (input: MetricRunInput): readonly SchemaName[] => input.sourceSelection
  ? [...SCHEMA_NAMES, 'automation-metric-source-v2'] : SCHEMA_NAMES;
const profilePath = (name: SchemaName): string => `profiles/${name}.schema.json`;
const schemaId = (name: SchemaName): string => `https://tdn.local/contracts/analysis/${name}.schema.json`;
const DERIVED_PATHS = [CONFIG, PREPARATION, NORMALIZED, RECEIPT, RESULT, READINESS, CATALOG, ...SCHEMA_NAMES.map(profilePath)];
const derivedPaths = (input: MetricRunInput): readonly string[] => input.sourceSelection
  ? [...DERIVED_PATHS, profilePath('automation-metric-source-v2')] : DERIVED_PATHS;
const XLSX_MEDIA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const MAX_FILE_BYTES = 32 * 1024 * 1024;
const BUDGET = { maxFileBytes: MAX_FILE_BYTES, maxTotalBytes: 128 * 1024 * 1024 };
const LIMITATIONS = [
  'OPERATOR_ATTACHED_EXPORT_NOT_PROVIDER_AUTHENTICATED',
  'KEYWORD_EXPORT_CONTEXT_RETAINED_LITERALLY_NO_FILTER_CATEGORY_OR_COVERAGE_GUARANTEE',
  'ALL_SCOPE_IS_BOUNDED_OBSERVED_KEYWORD_EXPORT_SAMPLE_NOT_WHOLE_MARKET',
  'CLASSIFICATION_LABELS_NOT_BOUND_WIDE_CORE_BLOCKED',
  'CLASSIFIED_M03_M04_READINESS_REMAINS_BLOCKED',
  'NO_ANNUAL_GROWTH_TAM_OR_WHOLE_MARKET_SHARE',
  'NOT_DIRECTLY_COMPARABLE_WITH_KALODATA_PERIODS',
  'DECLARED_PERIOD_AND_PRECISION_NOT_INDEPENDENTLY_VERIFIED',
] as const;
const SHORTER_PERIOD = 'SOURCE_PERIOD_SHORTER_THAN_REQUESTED_NOT_EXPANDED_OR_PRORATED';
/** Profile-owner codes that do not distinguish rejected input from a reader failure; they stay generic. */
const AMBIGUOUS_PROFILE_DIAGNOSTICS: ReadonlySet<string> = new Set(['OFFLINE_READER_UNAVAILABLE_OR_LIMIT', 'INVALID_XLSX']);
const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));
/** Preparation artifacts are canonical JSON plus one newline. */
const text = (value: unknown): Buffer => Buffer.from(canonicalJson(value) + '\n');
const digest = (value: unknown): string => sha(json(value));
const equal = (a: unknown, b: unknown): boolean => canonicalJson(a) === canonicalJson(b);
function integrity(message: string): never { throw new ResearchAutomationIntegrityError(message); }
function fail(code: ClassifiedFailure, message: string): never { throw new MetricMethodFailure(code, message); }
type Validator = (value: unknown) => boolean;
export type MetricSourceIdentity = { readonly packageId: string; readonly manifestArtifactSha256: string; readonly packageContentSha256: string };
type PackageIdentity = MetricSourceIdentity;
type SourceDescriptor = AutomationMetricSource | AutomationMetricSourceV2;
type Selected = { descriptor: SourceDescriptor; descriptorFile: VerifiedSourcePackageFile; workbook: VerifiedSourcePackageFile;
  manifest: VerifiedSourcePackageFile; context: VerifiedSourcePackageFile };

export interface MetricRunInput {
  runId: string; start: StartSnapshot; scope: ScopeSnapshot; scopeConfirmedAt: string;
  /** Internal exact frozen selection. Absence retains the historical v1 lookup; null source never performs discovery. */
  sourceSelection?: { readonly executionId: string; readonly sourcePackage: MetricSourceIdentity | null };
}

/** Closed, display-safe reasons. The last is the generic fallback for anything not established below. */
export const METRIC_METHOD_FAILURE_CODES = ['METRIC_SOURCE_AMBIGUOUS', 'METRIC_SOURCE_UNSUPPORTED', 'METRIC_SOURCE_INTEGRITY_FAILED',
  'METRIC_SOURCE_RUN_MISMATCH', 'METRIC_SOURCE_PERIOD_CONFLICT', 'METRIC_SOURCE_INPUT_REJECTED', 'METRIC_CALCULATION_FAILED',
  'METRIC_METHOD_FAILED'] as const;
export type MetricMethodFailureCode = typeof METRIC_METHOD_FAILURE_CODES[number];
type ClassifiedFailure = Exclude<MetricMethodFailureCode, 'METRIC_METHOD_FAILED'>;

/** Still an integrity failure; the code is set only where this bridge or a typed owner error establishes the reason. */
export class MetricMethodFailure extends ResearchAutomationIntegrityError {
  constructor(readonly code: ClassifiedFailure, message: string) { super(message); }
}

/** Only the closed code crosses into reports; exception text, paths and owner messages never do. */
export function metricMethodFailureCode(error: unknown): MetricMethodFailureCode {
  return error instanceof MetricMethodFailure ? error.code : 'METRIC_METHOD_FAILED';
}

/** Service retains these exact bytes under its committed artifact digest before reporting. */
export interface AutomationMetricMethodSnapshot {
  readonly contractVersion: 'automation-metric-method-snapshot-v1' | 'automation-metric-method-snapshot-v2';
  readonly runId: string;
  readonly runBindingSha256: string;
  readonly sourcePackage: PackageIdentity;
  readonly originalSourcePackage: PackageIdentity;
  readonly preparation: MetricInputPreparationResult;
  readonly readiness: MetricPreparationReadinessResult;
  readonly result: MetricScopeOutput;
  readonly limitations: readonly string[];
}

/** Explicitly attached Metric export -> existing preparation/readiness/calculator -> frozen Foundation method package. */
export class AutomationMetricMethodBridge {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #packages: SourcePackageService;
  readonly #reader: FoundationSourcePackageReader;
  readonly #workspaces: DiscoveryWorkspaceReader;
  readonly #now: () => Date;

  constructor(options: { db: Database.Database; artifactStore: ContentAddressedArtifactStore; workspaces: DiscoveryWorkspaceReader; now: () => Date }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#packages = new SourcePackageService(options);
    this.#reader = new FoundationSourcePackageReader(this.#packages);
    this.#workspaces = options.workspaces;
    this.#now = options.now;
  }

  /** Pre-confirmation admission checks the prepared bytes and owner profile; it creates no report or provider call. */
  async inspectPrepared(input: MetricRunInput, packageId: string): Promise<MetricSourceIdentity> {
    const source = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    const selected = selectSource(source, input, validateCurrentDescriptorV2, true);
    await this.#verifyPreparedOrigin(source, selected.descriptor.runBindingSha256);
    const manifest = jsonRecord(selected.manifest.bytes);
    if (selected.manifest.mediaType !== 'application/json' || !validateCurrentManifest(manifest))
      fail('METRIC_SOURCE_UNSUPPORTED', 'Prepared Metric manifest is invalid.');
    declaredPeriodCoverage(input, (manifest as unknown as MetricSourceManifest).scope);
    // Admission checks the same offline profile without persisting a calculation
    // or recursively acquiring the caller's database mutation mutex.
    normalizeMetricWorkbookInput(Buffer.from(selected.workbook.bytes), Buffer.from(selected.manifest.bytes));
    return identity(source);
  }

  /** Read-only inventory verification; no normalizer, preparation or confirmation timestamp is needed. */
  async verifyPreparedSourceMetadata(input: Pick<MetricRunInput, 'runId' | 'start' | 'scope'>, packageId: string): Promise<void> {
    const source = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    const selected = selectSource(source, input, validateCurrentDescriptorV2, true);
    await this.#verifyPreparedOrigin(source, selected.descriptor.runBindingSha256);
    const manifest = jsonRecord(selected.manifest.bytes);
    if (selected.manifest.mediaType !== 'application/json' || !validateCurrentManifest(manifest))
      fail('METRIC_SOURCE_UNSUPPORTED', 'Prepared Metric manifest is invalid.');
    declaredPeriodCoverage(input, (manifest as unknown as MetricSourceManifest).scope);
  }

  async verifySelection(input: MetricRunInput): Promise<void> {
    const source = await this.#resolve(input);
    if (!source) return;
    const selected = selectBoundSource(source, input, validateCurrentDescriptor, validateCurrentDescriptorV2);
    if (selected.descriptor.contractVersion === 'automation-metric-source-v2') await this.#verifyPreparedOrigin(source, selected.descriptor.runBindingSha256);
    const manifest = jsonRecord(selected.manifest.bytes);
    if (selected.manifest.mediaType !== 'application/json' || !validateCurrentManifest(manifest))
      fail('METRIC_SOURCE_UNSUPPORTED', 'Frozen Metric manifest is invalid.');
    declaredPeriodCoverage(input, (manifest as unknown as MetricSourceManifest).scope);
  }

  /** Cold exact-title read from this frozen source execution's existing method
   * package. Absence is not evidence; ambiguity/damage never falls back. */
  async readFrozenSalesNames(input: MetricRunInput) {
    if (input.sourceSelection?.sourcePackage === null) return undefined;
    const key = methodKey(input);
    const matches = await this.#reader.findFinalizedSourcePackagesByKey(key);
    if (matches.length > 1) integrity('Metric frozen sales-name proof is ambiguous.');
    const match = matches[0];
    if (!match) return undefined;
    if (match.version !== 1) integrity('Metric frozen sales-name proof version differs.');
    const retained = await this.#reader.readFinalizedSourcePackage(match.packageId, BUDGET);
    if (retained.manifestArtifactSha256 !== match.manifestArtifactSha256 || retained.manifest.packageKey !== key || retained.manifest.version !== 1)
      integrity('Metric frozen sales-name proof lookup identity differs.');
    const config = parse(retained, CONFIG);
    const snapshot = await this.verify({ contractVersion: snapshotVersion(input), runId: input.runId,
      runBindingSha256: digest(input), sourcePackage: identity(retained), originalSourcePackage: config.originalSourcePackage,
      preparation: parse(retained, PREPARATION), readiness: parse(retained, READINESS), result: parse(retained, RESULT),
      limitations: config.limitations }, input);
    await this.verifySelection(input);
    const original = await this.#reader.readFinalizedSourcePackage(snapshot.originalSourcePackage.packageId, BUDGET);
    // verify() above authenticated the frozen schemas and bytes. The existing
    // metadata validators select those same freshly verified original members.
    const selected = selectBoundSource(original, input, validateCurrentDescriptor, validateCurrentDescriptorV2);
    const manifest = parse(original, selected.manifest.path) as unknown as MetricSourceManifest;
    const receipt = parse(retained, RECEIPT);
    if (snapshot.result.input.profileId !== manifest.profileId || !equal(snapshot.result.input.scope, manifest.scope) ||
        receipt.headerSha256 !== digest(METRIC_CURRENT_HEADERS) || manifest.source.headerSha256 !== receipt.headerSha256 ||
        receipt.rowDigestMethod !== 'canonical-typed-cells-v1' || !Array.isArray(receipt.evidence))
      integrity('Metric frozen sales-name profile or receipt differs.');
    const seen = new Set<number>(); let previousRow = 1;
    const names = receipt.evidence.map((untrusted: unknown, index: number) => {
      const record = snapshot.result.input.records[index];
      if (!isRecord(untrusted) || !record || !Number.isSafeInteger(untrusted.row) || typeof untrusted.row !== 'number' ||
          untrusted.row <= previousRow || untrusted.row > manifest.source.lastRow || seen.has(untrusted.row) ||
          !Array.isArray(untrusted.cells) || untrusted.cells.length !== METRIC_CURRENT_HEADERS.length ||
          untrusted.rowSha256 !== digest(untrusted.cells) || untrusted.shopId !== record.shopId || untrusted.listingId !== record.listingId ||
          untrusted.contentSha256 !== metricLabelFingerprint(snapshot.result.input.scope.platform, record) ||
          untrusted.locator !== `Sheet1!A${untrusted.row}:T${untrusted.row}` || record.source.locator !== untrusted.locator ||
          record.source.sourceSha256 !== selected.workbook.sha256)
        integrity('Metric frozen sales-name row or cell witness differs.');
      const cell: unknown = untrusted.cells[0];
      if (!isRecord(cell) || cell.type !== 'text' || typeof cell.value !== 'string' || !cell.value.trim() || cell.value !== record.title)
        integrity('Metric frozen title is not the exact retained title cell.');
      seen.add(untrusted.row); previousRow = untrusted.row;
      return { name: cell.value, row: untrusted.row, locator: `Sheet1!A${untrusted.row}` };
    });
    return { sourcePackage: snapshot.originalSourcePackage,
      workbook: { logicalPath: selected.workbook.path, sha256: selected.workbook.sha256, byteSize: selected.workbook.byteSize }, names };
  }

  async #verifyPreparedOrigin(source: VerifiedFinalizedSourcePackage, bindingSha256: string): Promise<void> {
    const origin = await this.#reader.readAutomationAttachmentOrigin(source.packageId, BUDGET);
    if (!origin || origin.bindingSha256 !== bindingSha256 || origin.manifestArtifactSha256 !== source.manifestArtifactSha256)
      fail('METRIC_SOURCE_RUN_MISMATCH', 'Prepared Metric source lacks its server-authored storage binding.');
  }

  async execute(input: MetricRunInput, signal?: AbortSignal): Promise<AutomationMetricMethodSnapshot | undefined> {
    signal?.throwIfAborted();
    const original = await this.#resolve(input);
    if (!original) return undefined;
    const selected = selectBoundSource(original, input, validateCurrentDescriptor, validateCurrentDescriptorV2);
    const manifest = jsonRecord(selected.manifest.bytes);
    if (selected.manifest.mediaType !== 'application/json' || !validateCurrentManifest(manifest))
      fail('METRIC_SOURCE_UNSUPPORTED', 'Metric attachment manifest is invalid.');
    // These declared dates are already available before any preparation write.
    // Still check normalized dates below; neither check authenticates the source.
    declaredPeriodCoverage(input, (manifest as unknown as MetricSourceManifest).scope);
    signal?.throwIfAborted();
    const preparations = new MetricInputPreparationService({ db: this.#db, artifactStore: this.#artifacts,
      sourcePackages: this.#reader, workspaces: this.#workspaces, now: this.#now });
    const prepared = await preparations.prepare(preparationRequest(input, original, selected.descriptor)).catch((error: unknown) => {
      // The profile owner's typed workbook/declaration rejections are input failures. Its unavailable local
      // reader and its catch-all reader diagnostic (crash, undecodable or unstructured output) prove nothing about the input.
      if (error instanceof MetricSourceRejection && !AMBIGUOUS_PROFILE_DIAGNOSTICS.has(error.code))
        fail('METRIC_SOURCE_INPUT_REJECTED', 'Metric source rows or declarations were rejected by the export profile.');
      throw error;
    });
    const verified = await preparations.readVerified(prepared.preparationSha256);
    signal?.throwIfAborted();
    const catalogBytes = await fs.readFile(new URL('../../../../docs/research/report-section-catalog-v1.json', import.meta.url));
    const readiness = await new MetricPreparationReadinessService(new AnalysisMetricInputPreparationReader(preparations))
      .evaluate(prepared.preparationSha256, catalogBytes, sha(catalogBytes));
    // Approved generic calculation; no classifier or label is introduced here.
    const result = calculateMetricScopes(verified.input);
    if (result.inputSha256 !== verified.result.normalizedInput.valueSha256) fail('METRIC_CALCULATION_FAILED', 'Metric calculation input differs from its preparation.');
    assertBoundedState(result, readiness);
    const limitations = limitationsFor(periodCoverage(input, result));
    const [preparationBytes, inputBytes, receiptBytes] = await Promise.all([prepared.resultArtifactSha256,
      verified.result.normalizedInput.artifactSha256, verified.result.normalizationReceiptSha256]
      .map(value => this.#artifacts.read(value, { maxBytes: MAX_FILE_BYTES })));
    if (!preparationBytes!.equals(text(verified.result)) || !inputBytes!.equals(text(verified.input)))
      fail('METRIC_CALCULATION_FAILED', 'Metric preparation artifacts differ from their verified replay.');
    const files = new Map(original.files.map(file => [file.path, file.bytes]));
    const derived = new Map<string, Buffer>([[PREPARATION, preparationBytes!], [NORMALIZED, inputBytes!], [RECEIPT, receiptBytes!],
      [RESULT, json(result)], [READINESS, json(readiness)], [CATALOG, catalogBytes]]);
    for (const name of schemaNames(input))
      derived.set(profilePath(name), await fs.readFile(new URL(`../../../../contracts/analysis/${name}.schema.json`, import.meta.url)));
    derived.set(CONFIG, json(runConfig(input, original, selected, result, sha(catalogBytes), limitations)));
    let totalBytes = 0;
    for (const [filePath, bytes] of [...files, ...derived]) {
      if (files.has(filePath) && derived.has(filePath)) integrity('Metric method file collides with an original source path.');
      totalBytes += bytes.length;
      if (bytes.length > MAX_FILE_BYTES || totalBytes > BUDGET.maxTotalBytes - 1024 * 1024) integrity('Metric method package exceeds its exact-byte bound.');
    }
    for (const [filePath, bytes] of derived) files.set(filePath, bytes);
    const originalMetadata = new Map(original.manifest.files.map(file => [file.path, file]));
    const request: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: methodKey(input), version: 1,
      sourceAcquiredAt: original.manifest.sourceAcquiredAt, sourceLabel: methodLabel(input.runId),
      files: [...files].map(([filePath, bytes]) => originalMetadata.get(filePath) ?? derivedMetadata(filePath, bytes)) as SourcePackageIntakeRequest['files'] };
    const snapshot = await withDatabaseMutationMutex(this.#db, async () => {
      signal?.throwIfAborted();
      const receipt = await this.#packages.intake(request, files);
      const retained = await this.#packages.readVerified(receipt.packageId, BUDGET);
      if (retained.files.length !== files.size || retained.files.some(file => !files.get(file.path)?.equals(file.bytes)))
        fail('METRIC_CALCULATION_FAILED', 'Metric method publication differs from prepared bytes.');
      const output: AutomationMetricMethodSnapshot = { contractVersion: snapshotVersion(input), runId: input.runId,
        runBindingSha256: digest(input), sourcePackage: identity(retained), originalSourcePackage: identity(original),
        preparation: verified.result, readiness, result, limitations };
      return output;
    });
    // The returned value is exactly what historical replay accepts.
    return this.verify(snapshot, input);
  }

  /** Frozen v1 reader: no intake, normalizer, calculator, readiness, current catalog, workspace, clock or provider. */
  async verify(untrusted: unknown, input: MetricRunInput): Promise<AutomationMetricMethodSnapshot> {
    if (!isRecord(untrusted) || json(untrusted).length > MAX_JSON_ARTIFACT_BYTES ||
        Object.keys(untrusted).sort().join(',') !== 'contractVersion,limitations,originalSourcePackage,preparation,readiness,result,runBindingSha256,runId,sourcePackage' ||
        untrusted.contractVersion !== snapshotVersion(input) || untrusted.runId !== input.runId ||
        untrusted.runBindingSha256 !== digest(input) || !isIdentity(untrusted.sourcePackage) || !isIdentity(untrusted.originalSourcePackage) ||
        !isRecord(untrusted.preparation) || !isRecord(untrusted.readiness) || !isRecord(untrusted.result) || !Array.isArray(untrusted.limitations))
      integrity('Metric method snapshot identity is invalid.');
    const snapshot = untrusted as unknown as AutomationMetricMethodSnapshot;
    const retained = await this.#packages.readVerified(snapshot.sourcePackage.packageId, BUDGET);
    const original = await this.#packages.readVerified(snapshot.originalSourcePackage.packageId, BUDGET);
    if (!equal(snapshot.sourcePackage, identity(retained)) || retained.manifest.packageKey !== methodKey(input) ||
        retained.manifest.version !== 1 || retained.manifest.sourceLabel !== methodLabel(input.runId) ||
        !equal(snapshot.originalSourcePackage, identity(original)) ||
        (input.sourceSelection ? !equal(input.sourceSelection.sourcePackage, identity(original))
          : original.manifest.packageKey !== sourceKey(input.runId) || original.manifest.version !== 1) ||
        retained.manifest.sourceAcquiredAt !== original.manifest.sourceAcquiredAt)
      integrity('Metric method or original source package identity differs from the frozen run.');
    const originalMetadata = new Map(original.manifest.files.map(file => [file.path, file]));
    const expectedPaths = new Set([...originalMetadata.keys(), ...derivedPaths(input)]);
    if (expectedPaths.size !== originalMetadata.size + derivedPaths(input).length || retained.files.length !== expectedPaths.size ||
        retained.files.some(file => !expectedPaths.has(file.path))) integrity('Metric method package membership differs from its frozen roles.');
    for (const { bytes, ...metadata } of retained.files) {
      const originalFile = originalMetadata.get(metadata.path);
      if (!equal(metadata, originalFile ?? derivedMetadata(metadata.path, bytes)) ||
          (originalFile !== undefined && !bytes.equals(file(original, metadata.path).bytes)))
        integrity('Metric method retained file role or original bytes differ.');
    }
    const validators = frozenValidators(retained, input);
    const selected = selectBoundSource(original, input, validators['automation-metric-source'], validators['automation-metric-source-v2']);
    const { preparation, readiness, result } = snapshot;
    if (!validators['metric-input-preparation-result'](preparation) || !validators['metric-preparation-readiness-result'](readiness) ||
        !validators['metric-scope-output'](result) || !validators['report-section-catalog'](parse(retained, CATALOG)) ||
        !validators['metric-source-manifest'](parse(original, selected.manifest.path)))
      integrity('Metric frozen output fails its retained canonical schema.');
    if (!file(retained, PREPARATION).bytes.equals(text(preparation)) || !file(retained, NORMALIZED).bytes.equals(text(result.input)) ||
        !file(retained, RESULT).bytes.equals(json(result)) || !file(retained, READINESS).bytes.equals(json(readiness)))
      integrity('Metric snapshot differs from its frozen retained bytes.');
    verifyFrozenPreparation(retained, original, selected, input, preparation, result);
    const { readinessSha256, ...readinessContent } = readiness;
    const catalog = parse(retained, CATALOG);
    if (readinessSha256 !== digest(readinessContent) || readiness.preparationSha256 !== preparation.preparationSha256 ||
        !equal(readiness.catalog, { catalogId: catalog.catalogId, catalogVersion: catalog.catalogVersion, sha256: file(retained, CATALOG).sha256 }))
      integrity('Metric frozen readiness identity differs.');
    assertBoundedState(result, readiness);
    const limitations = limitationsFor(periodCoverage(input, result));
    if (!equal(snapshot.limitations, limitations) ||
        !equal(parse(retained, CONFIG), runConfig(input, original, selected, result, file(retained, CATALOG).sha256, limitations)))
      integrity('Metric frozen run configuration differs.');
    return snapshot;
  }

  async #resolve(input: MetricRunInput): Promise<VerifiedFinalizedSourcePackage | undefined> {
    if (input.sourceSelection) {
      assertSelection(input.sourceSelection);
      const chosen = input.sourceSelection.sourcePackage;
      if (chosen === null) return undefined;
      const source = await this.#reader.readFinalizedSourcePackage(chosen.packageId, BUDGET).catch((error: unknown) => {
        if (error instanceof ArtifactIntegrityError || error instanceof FoundationIdentityConflictError)
          fail('METRIC_SOURCE_INTEGRITY_FAILED', 'Frozen Metric source bytes or identity are damaged.');
        return integrity('Frozen Metric source could not be verified.');
      });
      if (!equal(chosen, identity(source))) fail('METRIC_SOURCE_INTEGRITY_FAILED', 'Frozen Metric source identity differs.');
      return source;
    }
    // Only this run's exact key is looked up and verified; other packages are never read or counted.
    // Every version of the key is returned, so a second version stays ambiguous instead of being ignored.
    const key = sourceKey(input.runId);
    const matches = await this.#reader.findFinalizedSourcePackagesByKey(key)
      .catch(() => integrity('METRIC_SOURCE_RESOLUTION_FAILED: run-attached source lookup failed.'));
    if (matches.length > 1) fail('METRIC_SOURCE_AMBIGUOUS', 'Metric source attachment is ambiguous.');
    const match = matches[0];
    if (!match) return undefined;
    if (match.version !== 1) fail('METRIC_SOURCE_UNSUPPORTED', 'Metric source attachment version is unsupported.');
    // Failure is not absence: a damaged attachment must not silently skip Metric.
    // Only Foundation's typed byte/identity checks establish damage; other read failures stay unclassified.
    const source = await this.#reader.readFinalizedSourcePackage(match.packageId, BUDGET).catch((error: unknown) => {
      if (error instanceof ArtifactIntegrityError || error instanceof FoundationIdentityConflictError)
        fail('METRIC_SOURCE_INTEGRITY_FAILED', 'METRIC_SOURCE_RESOLUTION_FAILED: run-attached source bytes or identity are damaged.');
      return integrity('METRIC_SOURCE_RESOLUTION_FAILED: run-attached source could not be verified.');
    });
    if (source.manifestArtifactSha256 !== match.manifestArtifactSha256 || source.manifest.packageKey !== key || source.manifest.version !== 1)
      fail('METRIC_SOURCE_INTEGRITY_FAILED', 'METRIC_SOURCE_RESOLUTION_FAILED: run-attached source identity differs from its lookup.');
    return source;
  }
}

function sourceKey(runId: string): string { return `automation-metric-source:${runId}`; }
function methodKey(input: MetricRunInput): string {
  if (input.sourceSelection) {
    assertSelection(input.sourceSelection);
    return `automation-method:${input.runId}-metric-v2-${input.sourceSelection.executionId}`;
  }
  return `automation-method:${input.runId}-metric-v1`;
}
function snapshotVersion(input: MetricRunInput): AutomationMetricMethodSnapshot['contractVersion'] {
  return input.sourceSelection ? 'automation-metric-method-snapshot-v2' : 'automation-metric-method-snapshot-v1';
}
function assertSelection(value: NonNullable<MetricRunInput['sourceSelection']>): void {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'executionId,sourcePackage' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.executionId) ||
      (value.sourcePackage !== null && (!isIdentity(value.sourcePackage) ||
        !/^[0-9a-f]{64}$/.test(value.sourcePackage.manifestArtifactSha256) || !/^[0-9a-f]{64}$/.test(value.sourcePackage.packageContentSha256))))
    integrity('Frozen Metric source selection is invalid.');
}
function methodLabel(runId: string): string { return `Automation ${runId}: attached Metric export and frozen ALL calculation`; }

function selectBoundSource(source: VerifiedFinalizedSourcePackage, input: MetricRunInput, v1: Validator, v2?: Validator): Selected {
  const declared = jsonRecord(file(source, SOURCE_DESCRIPTOR).bytes);
  if (input.sourceSelection && declared?.contractVersion === 'automation-metric-source-v2' && v2)
    return selectSource(source, input, v2, true);
  const { sourceSelection: _selection, ...originalBinding } = input;
  return selectSource(source, originalBinding, v1, false);
}

/** Exact explicit attachment only; nothing is inferred from names, dates or recency. */
function selectSource(source: VerifiedFinalizedSourcePackage, input: MetricRunInput, validate: Validator, prepared?: boolean): Selected;
function selectSource(source: VerifiedFinalizedSourcePackage, input: Pick<MetricRunInput, 'runId' | 'start' | 'scope'>, validate: Validator, prepared: true): Selected;
function selectSource(source: VerifiedFinalizedSourcePackage, input: Pick<MetricRunInput, 'runId' | 'start' | 'scope'> & Partial<MetricRunInput>, validate: Validator, prepared = Boolean(input.sourceSelection)): Selected {
  const descriptorFile = source.files.find(value => value.path === SOURCE_DESCRIPTOR);
  const descriptor = descriptorFile && jsonRecord(descriptorFile.bytes);
  if (!descriptorFile || descriptorFile.mediaType !== 'application/json' || !validate(descriptor) || !json(descriptor).equals(descriptorFile.bytes))
    fail('METRIC_SOURCE_UNSUPPORTED', 'Metric source descriptor is invalid or non-canonical.');
  const declared = descriptor as unknown as SourceDescriptor;
  if (input.scope.runId !== input.runId || input.scope.workspaceId !== input.start.workspaceId)
    integrity('Metric run input is not one confirmed run.');
  const binding = prepared ? { runId: input.runId, start: input.start, scope: input.scope } : input;
  if (declared.runId !== input.runId || declared.workspaceId !== input.start.workspaceId || declared.runBindingSha256 !== digest(binding) ||
      declared.keyword !== input.start.keyword)
    fail('METRIC_SOURCE_RUN_MISMATCH', 'Metric source descriptor is not bound to this confirmed run.');
  const paths = [SOURCE_DESCRIPTOR, declared.workbookPath, declared.manifestPath, declared.sourceContextPath];
  if (new Set(paths).size !== paths.length || source.files.length !== paths.length || source.files.some(value => !paths.includes(value.path)))
    fail('METRIC_SOURCE_UNSUPPORTED', 'Metric source package membership differs from its descriptor.');
  if (source.files.some(value => value.independence !== 'non_independent') || descriptorFile.providerProvenance !== 'operator_supplied_unverified' ||
      file(source, declared.workbookPath).mediaType !== XLSX_MEDIA)
    fail('METRIC_SOURCE_UNSUPPORTED', 'Metric source roles are not admitted for an operator attachment.');
  return { descriptor: declared, descriptorFile, workbook: file(source, declared.workbookPath), manifest: file(source, declared.manifestPath),
    context: file(source, declared.sourceContextPath) };
}

function preparationRequest(input: MetricRunInput, source: VerifiedFinalizedSourcePackage, descriptor: SourceDescriptor): MetricInputPreparationResult['request'] {
  return { contractVersion: '1.0.0', workspaceId: input.start.workspaceId, packageId: source.packageId,
    packageManifestSha256: source.manifestArtifactSha256, workbookPath: descriptor.workbookPath, manifestPath: descriptor.manifestPath, labelsPath: null };
}

/** Source dates stay as declared: equal or narrower than requested, never expanded or prorated. */
function periodCoverage(input: MetricRunInput, result: MetricScopeOutput): 'EXACT_REQUESTED_PERIOD' | 'SHORTER_THAN_REQUESTED' {
  return declaredPeriodCoverage(input, result.input.scope);
}
function declaredPeriodCoverage(input: Pick<MetricRunInput, 'start'>, source: { start: string; end: string }): 'EXACT_REQUESTED_PERIOD' | 'SHORTER_THAN_REQUESTED' {
  const { startDate, endDate } = input.start.requestedPeriod;
  const { start, end } = source;
  if (start > end || start < startDate || end > endDate) fail('METRIC_SOURCE_PERIOD_CONFLICT', 'Metric source period lies outside the requested dates.');
  return start === startDate && end === endDate ? 'EXACT_REQUESTED_PERIOD' : 'SHORTER_THAN_REQUESTED';
}
function limitationsFor(coverage: ReturnType<typeof periodCoverage>): string[] {
  return coverage === 'EXACT_REQUESTED_PERIOD' ? [...LIMITATIONS] : [...LIMITATIONS, SHORTER_PERIOD];
}

/** v1 binds no labels: ALL is an observed sample; WIDE/CORE and classified M03/M04 stay blocked. */
function assertBoundedState(result: MetricScopeOutput, readiness: MetricPreparationReadinessResult): void {
  const [all, wide, core] = result.scopes;
  const sections = new Map(readiness.sections.map(section => [section.sectionId, section.state]));
  if (result.scopes.length !== 3 || all?.key !== 'all' || all.status !== 'CALCULATED' || wide?.key !== 'wide' || wide.status !== 'BLOCKED_LABELS' ||
      core?.key !== 'core' || core.status !== 'BLOCKED_LABELS' || result.comparisons.length !== 0 ||
      result.input.records.some(row => row.label !== null) || result.labelIssues.length !== result.input.records.length ||
      sections.get('M03') !== 'BLOCKED' || sections.get('M04') !== 'BLOCKED')
    fail('METRIC_CALCULATION_FAILED', 'Metric labels or classified readiness are not in their bounded blocked state.');
}

function runConfig(input: MetricRunInput, original: VerifiedFinalizedSourcePackage, selected: Selected, result: MetricScopeOutput,
  catalogSha256: string, limitations: readonly string[]) {
  const ref = (value: VerifiedSourcePackageFile) => ({ logicalPath: value.path, sha256: value.sha256, byteSize: value.byteSize, mediaType: value.mediaType });
  return { contractVersion: input.sourceSelection ? 'automation-metric-run-v2' : 'automation-metric-run-v1', input, runBindingSha256: digest(input), originalSourcePackage: identity(original),
    descriptor: ref(selected.descriptorFile), workbook: ref(selected.workbook), manifest: ref(selected.manifest),
    // Literal retained bytes only; no filter, category, coverage guarantee or identifier is read from it.
    sourceContext: ref(selected.context),
    period: { requested: input.start.requestedPeriod, source: { start: result.input.scope.start, end: result.input.scope.end },
      coverage: periodCoverage(input, result) },
    catalog: { logicalPath: CATALOG, sha256: catalogSha256 }, limitations };
}

/** Canonical identities of the frozen preparation, receipt and normalized input; the normalizer is not rerun. */
function verifyFrozenPreparation(retained: VerifiedFinalizedSourcePackage, original: VerifiedFinalizedSourcePackage, selected: Selected,
  input: MetricRunInput, preparation: MetricInputPreparationResult, result: MetricScopeOutput): void {
  const source = (role: 'workbook' | 'manifest', value: VerifiedSourcePackageFile) => ({ role, logicalPath: value.path, sha256: value.sha256,
    byteSize: value.byteSize, mediaType: value.mediaType, evidenceFamily: value.evidenceFamily, representationRole: value.representationRole,
    independence: value.independence, providerProvenance: value.providerProvenance, provenanceBasis: value.provenanceBasis });
  const request = preparationRequest(input, original, selected.descriptor);
  const sourcePackage = identity(original);
  const selectedSources = { workbook: source('workbook', selected.workbook), manifest: source('manifest', selected.manifest), labels: null };
  const normalized = file(retained, NORMALIZED);
  const receiptFile = file(retained, RECEIPT);
  const preparationIdentity = { contractVersion: 'metric-input-preparation-identity-v1', requestSha256: preparation.requestSha256,
    workspaceSnapshotSha256: preparation.workspace.snapshotSha256, sourcePackage, selectedSources,
    normalizedInputArtifactSha256: normalized.sha256, normalizedInputValueSha256: result.inputSha256, normalizationReceiptSha256: receiptFile.sha256 };
  if (!equal(preparation.request, request) || preparation.requestSha256 !== digest(request) || preparation.workspace.workspaceId !== input.start.workspaceId ||
      !equal(preparation.sourcePackage, sourcePackage) || !equal(preparation.selectedSources, selectedSources) ||
      !equal(preparation.normalizedInput, { artifactSha256: normalized.sha256, valueSha256: result.inputSha256,
        sourceCount: result.input.sources.length, rowCount: result.input.records.length }) ||
      preparation.normalizationReceiptSha256 !== receiptFile.sha256 || preparation.preparationSha256 !== digest(preparationIdentity) ||
      result.inputSha256 !== digest(result.input) || !equal(result.input.sources.map(value => value.sha256), [selected.workbook.sha256, selected.manifest.sha256]))
    integrity('Metric frozen preparation identity differs.');
  const receipt = parse(retained, RECEIPT);
  if (!receiptFile.bytes.equals(text(receipt)) || receipt.inputSha256 !== result.inputSha256 || receipt.sourceSha256 !== selected.workbook.sha256 ||
      receipt.manifestSha256 !== selected.manifest.sha256 || receipt.labelSha256 !== null || receipt.profileId !== result.input.profileId ||
      !Array.isArray(receipt.evidence) || receipt.evidence.length !== result.input.records.length)
    integrity('Metric frozen normalization receipt differs.');
}

function frozenValidators(retained: VerifiedFinalizedSourcePackage, input: MetricRunInput): Record<SchemaName, Validator> {
  try {
    const profiles = schemaNames(input).map(name => {
      const schema = parse(retained, profilePath(name));
      if (schema.$id !== schemaId(name)) throw new Error('schema identity');
      return { path: profilePath(name), id: schemaId(name), bytes: file(retained, profilePath(name)).bytes };
    });
    const validators = retainedValidators(profiles);
    return Object.fromEntries(schemaNames(input).map(name => {
      const validate = validators[schemaId(name)];
      if (!validate) throw new Error('schema missing');
      return [name, (value: unknown) => validate(value) === true];
    })) as Record<SchemaName, Validator>;
  } catch {
    return integrity('Metric retained schema identity differs or does not compile.');
  }
}

function identity(source: VerifiedFinalizedSourcePackage): PackageIdentity {
  return { packageId: source.packageId, manifestArtifactSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256 };
}
function isIdentity(value: unknown): value is PackageIdentity {
  return isRecord(value) && Object.keys(value).sort().join(',') === 'manifestArtifactSha256,packageContentSha256,packageId' &&
    Object.values(value).every(item => typeof item === 'string');
}
function file(source: VerifiedFinalizedSourcePackage, filePath: string): VerifiedSourcePackageFile {
  return source.files.find(value => value.path === filePath) ?? integrity('Metric retained file is missing.');
}
function parse(source: VerifiedFinalizedSourcePackage, filePath: string): Record<string, unknown> {
  return jsonRecord(file(source, filePath).bytes) ?? integrity('Metric retained JSON is invalid.');
}
function jsonRecord(bytes: Buffer): Record<string, unknown> | undefined {
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (isRecord(value)) return value;
  } catch { /* Callers report a fixed reason. */ }
  return undefined;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value); }
function derivedMetadata(filePath: string, bytes: Buffer): SourcePackageIntakeRequest['files'][number] {
  return { path: filePath, sha256: sha(bytes), byteSize: bytes.length, mediaType: 'application/json', evidenceFamily: 'automation-metric-method',
    representationRole: 'derived', independence: 'non_independent', providerProvenance: 'operator_supplied_unverified',
    provenanceBasis: 'Derived from the operator-attached Metric export, frozen run binding and application method documents; not provider authenticity, market completeness or owner approval.' };
}
