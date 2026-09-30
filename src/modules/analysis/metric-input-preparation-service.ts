import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import requestSchema from '../../../contracts/analysis/metric-input-preparation-request.schema.json' with { type: 'json' };
import resultSchema from '../../../contracts/analysis/metric-input-preparation-result.schema.json' with { type: 'json' };
import type { MetricInputPreparationRequest } from '../../../contracts/analysis/metric-input-preparation-request.generated.js';
import type { MetricInputPreparationResult } from '../../../contracts/analysis/metric-input-preparation-result.generated.js';
import type { MetricScopeInput } from '../../../contracts/analysis/metric-scope-input.generated.js';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { SourcePackageReadBudget } from '../foundation/source-package-service.js';
import type { DiscoveryWorkspaceReader } from '../flow/discovery-workspace-reader.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../platform/artifacts/index.js';
import { withDatabaseMutationMutex } from '../../platform/db/index.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { normalizeMetricWorkbookInput } from './metric-source-profile.js';
import { NormalizedMetricObservationStore } from './normalized-metric-observation-store.js';
import {
  ensureDistinctMetricSourcePaths,
  selectMetricSourceFile,
  verifyActiveMetricWorkspace,
  verifyFinalizedMetricSourcePackage,
  verifyNormalizedMetricEvidenceFamilies,
} from './source-backed-report.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(requestSchema);
const validateRequest = ajv.getSchema<MetricInputPreparationRequest>(requestSchema.$id)!;
const validateResult = ajv.compile<MetricInputPreparationResult>(resultSchema);

const MAX_BYTES = 32 * 1024 * 1024;
const READ_BUDGET: SourcePackageReadBudget = Object.freeze({
  maxFileBytes: MAX_BYTES,
  maxTotalBytes: 128 * 1024 * 1024,
});
const XLSX_MEDIA = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const JSON_MEDIA = 'application/json';

export class MetricInputPreparationValidationError extends Error {}
export class MetricInputPreparationIntegrityError extends Error {}

export interface MetricInputPreparationExecution {
  readonly preparationSha256: string;
  readonly normalizedInputSha256: string;
  readonly resultArtifactSha256: string;
  readonly rowCount: number;
  readonly sourceCount: number;
  readonly deduplicated: boolean;
  readonly databaseMutations: number;
}

export interface VerifiedMetricInputPreparation {
  readonly result: MetricInputPreparationResult;
  readonly input: MetricScopeInput;
}

export interface MetricInputPreparationReader {
  readVerified(preparationSha256: string): Promise<VerifiedMetricInputPreparation>;
}

interface PreparationRow {
  readonly preparationSha256: string;
  readonly requestSha256: string;
  readonly workspaceId: string;
  readonly workspaceSnapshotSha256: string;
  readonly sourcePackageId: string;
  readonly sourcePackageManifestSha256: string;
  readonly packageContentSha256: string;
  readonly workbookPath: string;
  readonly workbookSha256: string;
  readonly metricManifestPath: string;
  readonly metricManifestSha256: string;
  readonly labelsPath: string | null;
  readonly labelsSha256: string | null;
  readonly normalizedInputSha256: string;
  readonly normalizationReceiptSha256: string;
  readonly resultArtifactSha256: string;
}

interface BuiltPreparation {
  readonly result: MetricInputPreparationResult;
  readonly input: MetricScopeInput;
  readonly inputBytes: Buffer;
  readonly receiptBytes: Buffer;
  readonly resultBytes: Buffer;
}

export class MetricInputPreparationService implements MetricInputPreparationReader {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #sourcePackages: FinalizedSourcePackageReader;
  readonly #workspaces: DiscoveryWorkspaceReader;
  readonly #projections: NormalizedMetricObservationStore;
  readonly #now: () => Date;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: ContentAddressedArtifactStore;
    readonly sourcePackages: FinalizedSourcePackageReader;
    readonly workspaces: DiscoveryWorkspaceReader;
    readonly now?: () => Date;
  }) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#sourcePackages = options.sourcePackages;
    this.#workspaces = options.workspaces;
    this.#projections = new NormalizedMetricObservationStore({ db: options.db });
    this.#now = options.now ?? (() => new Date());
  }

  async prepare(untrustedRequest: unknown): Promise<MetricInputPreparationExecution> {
    const request = requestSnapshot(untrustedRequest);
    const built = await this.#build(request);
    const storedInput = await this.#artifacts.put(built.inputBytes);
    const storedReceipt = await this.#artifacts.put(built.receiptBytes);
    const storedResult = await this.#artifacts.put(built.resultBytes);
    const storedAt = exactTimestamp(this.#now());

    const execution = await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.exec('BEGIN IMMEDIATE');
      try {
        const concurrent = this.#row(built.result.preparationSha256);
        if (concurrent) {
          this.#assertRow(concurrent, built.result, storedResult.sha256);
          this.#db.exec('COMMIT');
          return executionFrom(built, storedResult.sha256, true, 0);
        }

        let databaseMutations = 0;
        databaseMutations += this.#registerArtifact(storedInput, JSON_MEDIA, storedAt);
        databaseMutations += this.#registerArtifact(storedReceipt, JSON_MEDIA, storedAt);
        databaseMutations += this.#registerArtifact(storedResult, JSON_MEDIA, storedAt);
        const projection = this.#projections.materializeCanonicalInputInTransaction(built.inputBytes);
        databaseMutations += projection.databaseMutations;
        databaseMutations += this.#insert(built.result, storedResult.sha256);
        this.#db.exec('COMMIT');
        return executionFrom(built, storedResult.sha256, false, databaseMutations);
      } catch (error) {
        if (this.#db.inTransaction) this.#db.exec('ROLLBACK');
        throw error;
      }
    });

    await this.readVerified(execution.preparationSha256);
    return execution;
  }

  async readVerified(preparationSha256: string): Promise<VerifiedMetricInputPreparation> {
    assertDigest(preparationSha256, 'preparationSha256');
    const row = this.#row(preparationSha256);
    if (!row) throw new MetricInputPreparationValidationError('Metric input preparation not found');
    const resultBytes = await this.#readRegisteredArtifact(row.resultArtifactSha256, JSON_MEDIA);
    const result = parseResult(resultBytes);
    this.#assertRow(row, result, row.resultArtifactSha256);

    const rebuilt = await this.#build(result.request);
    if (
      canonicalJson(rebuilt.result) !== canonicalJson(result) ||
      !rebuilt.resultBytes.equals(resultBytes)
    ) throw new MetricInputPreparationIntegrityError('Preparation result does not replay from its exact source selection');

    const inputBytes = await this.#readRegisteredArtifact(row.normalizedInputSha256, JSON_MEDIA);
    const receiptBytes = await this.#readRegisteredArtifact(row.normalizationReceiptSha256, JSON_MEDIA);
    if (!rebuilt.inputBytes.equals(inputBytes) || !rebuilt.receiptBytes.equals(receiptBytes)) {
      throw new MetricInputPreparationIntegrityError('Preparation artifacts do not replay from their exact source selection');
    }
    const projection = this.#projections.readVerifiedProjection(row.normalizedInputSha256, inputBytes);
    if (canonicalJson(projection.input) !== canonicalJson(rebuilt.input)) {
      throw new MetricInputPreparationIntegrityError('Preparation projection does not match normalized input');
    }
    return { result, input: structuredClone(projection.input) };
  }

  async #build(request: MetricInputPreparationRequest): Promise<BuiltPreparation> {
    ensureDistinctMetricSourcePaths({ ...request, tabletQuoteSourcePath: null, tabletQuoteInputPath: null });
    const [workspace, sourcePackage] = await Promise.all([
      this.#workspaces.readVerifiedWorkspace(request.workspaceId),
      this.#sourcePackages.readFinalizedSourcePackage(request.packageId, READ_BUDGET),
    ]);
    const workspaceSnapshotSha256 = verifyActiveMetricWorkspace(workspace, request);
    verifyFinalizedMetricSourcePackage(sourcePackage, request);
    const workbook = selectMetricSourceFile(sourcePackage, request.workbookPath, 'workbook', XLSX_MEDIA, 'raw-workbook.xlsx');
    const manifest = selectMetricSourceFile(sourcePackage, request.manifestPath, 'manifest', JSON_MEDIA, 'raw-manifest.json');
    const labels = request.labelsPath === null
      ? null
      : selectMetricSourceFile(sourcePackage, request.labelsPath, 'labels', JSON_MEDIA, 'raw-labels.json');
    const selected = [workbook, manifest, ...(labels === null ? [] : [labels])];
    const normalized = normalizeMetricWorkbookInput(
      Buffer.from(workbook.file.bytes),
      Buffer.from(manifest.file.bytes),
      labels === null ? undefined : Buffer.from(labels.file.bytes),
    );
    verifyNormalizedMetricEvidenceFamilies(normalized.input, selected);
    const requestSha256 = digest(canonicalBytes(request, false));
    const inputBytes = canonicalBytes(normalized.input);
    const receiptBytes = canonicalBytes(normalized.receipt);
    assertDerivedArtifactSize(inputBytes, 'normalized input');
    assertDerivedArtifactSize(receiptBytes, 'normalization receipt');
    const normalizedInputArtifactSha256 = digest(inputBytes);
    const normalizationReceiptSha256 = digest(receiptBytes);
    const sources = {
      workbook: sourceResult('workbook', workbook.provenance),
      manifest: sourceResult('manifest', manifest.provenance),
      labels: labels === null ? null : sourceResult('labels', labels.provenance),
    };
    const identity = {
      contractVersion: 'metric-input-preparation-identity-v1',
      requestSha256,
      workspaceSnapshotSha256,
      sourcePackage: {
        packageId: sourcePackage.packageId,
        manifestArtifactSha256: sourcePackage.manifestArtifactSha256,
        packageContentSha256: sourcePackage.packageContentSha256,
      },
      selectedSources: sources,
      normalizedInputArtifactSha256,
      normalizedInputValueSha256: normalized.receipt.inputSha256,
      normalizationReceiptSha256,
    } as const;
    const preparationSha256 = digest(canonicalBytes(identity, false));
    const result: MetricInputPreparationResult = {
      contractVersion: '1.0.0',
      preparationSha256,
      request,
      requestSha256,
      workspace: { workspaceId: workspace.workspaceId, state: 'ACTIVE', snapshotSha256: workspaceSnapshotSha256 },
      sourcePackage: {
        packageId: sourcePackage.packageId,
        manifestArtifactSha256: sourcePackage.manifestArtifactSha256,
        packageContentSha256: sourcePackage.packageContentSha256,
      },
      selectedSources: sources,
      normalizedInput: {
        artifactSha256: normalizedInputArtifactSha256,
        valueSha256: normalized.receipt.inputSha256,
        sourceCount: normalized.input.sources.length,
        rowCount: normalized.input.records.length,
      },
      normalizationReceiptSha256,
    };
    if (!validateResult(result)) {
      throw new MetricInputPreparationIntegrityError(`Built preparation result breaks its contract: ${ajv.errorsText(validateResult.errors)}`);
    }
    const resultBytes = canonicalBytes(result);
    assertDerivedArtifactSize(resultBytes, 'preparation result');
    return { result, input: normalized.input, inputBytes, receiptBytes, resultBytes };
  }

  #insert(result: MetricInputPreparationResult, resultArtifactSha256: string): number {
    const { workbook, manifest, labels } = result.selectedSources;
    return this.#db.prepare(`
      INSERT INTO analysis_metric_input_preparations(
        preparation_sha256, request_sha256, workspace_id, workspace_snapshot_sha256,
        source_package_id, source_package_manifest_sha256, package_content_sha256,
        workbook_path, workbook_sha256, metric_manifest_path, metric_manifest_sha256,
        labels_path, labels_sha256, normalized_input_sha256,
        normalization_receipt_sha256, result_artifact_sha256
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      result.preparationSha256, result.requestSha256,
      result.workspace.workspaceId, result.workspace.snapshotSha256,
      result.sourcePackage.packageId, result.sourcePackage.manifestArtifactSha256,
      result.sourcePackage.packageContentSha256,
      workbook.logicalPath, workbook.sha256, manifest.logicalPath, manifest.sha256,
      labels?.logicalPath ?? null, labels?.sha256 ?? null,
      result.normalizedInput.artifactSha256, result.normalizationReceiptSha256, resultArtifactSha256,
    ).changes;
  }

  #row(preparationSha256: string): PreparationRow | undefined {
    return this.#db.prepare(`
      SELECT preparation_sha256 preparationSha256, request_sha256 requestSha256,
             workspace_id workspaceId, workspace_snapshot_sha256 workspaceSnapshotSha256,
             source_package_id sourcePackageId,
             source_package_manifest_sha256 sourcePackageManifestSha256,
             package_content_sha256 packageContentSha256,
             workbook_path workbookPath, workbook_sha256 workbookSha256,
             metric_manifest_path metricManifestPath, metric_manifest_sha256 metricManifestSha256,
             labels_path labelsPath, labels_sha256 labelsSha256,
             normalized_input_sha256 normalizedInputSha256,
             normalization_receipt_sha256 normalizationReceiptSha256,
             result_artifact_sha256 resultArtifactSha256
      FROM analysis_metric_input_preparations WHERE preparation_sha256 = ?
    `).get(preparationSha256) as PreparationRow | undefined;
  }

  #assertRow(row: PreparationRow, result: MetricInputPreparationResult, resultArtifactSha256: string): void {
    const { workbook, manifest, labels } = result.selectedSources;
    if (
      row.preparationSha256 !== result.preparationSha256 || row.requestSha256 !== result.requestSha256 ||
      row.workspaceId !== result.workspace.workspaceId || row.workspaceSnapshotSha256 !== result.workspace.snapshotSha256 ||
      row.sourcePackageId !== result.sourcePackage.packageId ||
      row.sourcePackageManifestSha256 !== result.sourcePackage.manifestArtifactSha256 ||
      row.packageContentSha256 !== result.sourcePackage.packageContentSha256 ||
      row.workbookPath !== workbook.logicalPath || row.workbookSha256 !== workbook.sha256 ||
      row.metricManifestPath !== manifest.logicalPath || row.metricManifestSha256 !== manifest.sha256 ||
      row.labelsPath !== (labels?.logicalPath ?? null) || row.labelsSha256 !== (labels?.sha256 ?? null) ||
      row.normalizedInputSha256 !== result.normalizedInput.artifactSha256 ||
      row.normalizationReceiptSha256 !== result.normalizationReceiptSha256 ||
      row.resultArtifactSha256 !== resultArtifactSha256
    ) throw new MetricInputPreparationIntegrityError('Preparation row does not match its immutable result');
  }

  #registerArtifact(stored: StoredArtifact, mediaType: string, acquiredAt: string): number {
    const changes = this.#db.prepare(`
      INSERT INTO artifact_manifests(
        sha256, byte_size, media_type, relative_path, acquired_at,
        contract_version, retention_status, created_at
      ) VALUES (?, ?, ?, ?, ?, '1.0.0', 'active', ?)
      ON CONFLICT(sha256) DO NOTHING
    `).run(stored.sha256, stored.byteSize, mediaType, stored.relativePath, acquiredAt, acquiredAt).changes;
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(stored.sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string;
      contractVersion: string; retentionStatus: string;
    } | undefined;
    if (!row || row.byteSize !== BigInt(stored.byteSize) || row.mediaType !== mediaType ||
        row.relativePath !== stored.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new MetricInputPreparationIntegrityError('Preparation artifact manifest conflicts with immutable bytes');
    }
    return changes;
  }

  async #readRegisteredArtifact(sha256: string, mediaType: string): Promise<Buffer> {
    assertDigest(sha256, 'artifactSha256');
    const row = this.#db.prepare(`
      SELECT byte_size byteSize, media_type mediaType, relative_path relativePath,
             contract_version contractVersion, retention_status retentionStatus
      FROM artifact_manifests WHERE sha256 = ?
    `).get(sha256) as {
      byteSize: bigint; mediaType: string; relativePath: string;
      contractVersion: string; retentionStatus: string;
    } | undefined;
    if (!row || row.mediaType !== mediaType || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active') {
      throw new MetricInputPreparationIntegrityError('Preparation artifact manifest is missing or incompatible');
    }
    const bytes = await this.#artifacts.read(sha256, { maxBytes: MAX_BYTES });
    const expectedPath = `sha256/${sha256.slice(0, 2)}/${sha256}`;
    if (row.byteSize !== BigInt(bytes.byteLength) || row.relativePath !== expectedPath) {
      throw new MetricInputPreparationIntegrityError('Preparation artifact metadata does not match immutable bytes');
    }
    return bytes;
  }
}

export class AnalysisMetricInputPreparationReader implements MetricInputPreparationReader {
  constructor(private readonly service: MetricInputPreparationService) {}
  readVerified(preparationSha256: string): Promise<VerifiedMetricInputPreparation> {
    return this.service.readVerified(preparationSha256);
  }
}

function requestSnapshot(value: unknown): MetricInputPreparationRequest {
  if (!validateRequest(value)) {
    throw new MetricInputPreparationValidationError(`Invalid preparation request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  return JSON.parse(canonicalJson(value)) as MetricInputPreparationRequest;
}

function sourceResult<Role extends 'workbook' | 'manifest' | 'labels'>(
  role: Role,
  source: ReturnType<typeof selectMetricSourceFile>['provenance'],
) {
  return {
    role,
    logicalPath: source.logicalPath,
    sha256: source.sha256,
    byteSize: source.byteSize,
    mediaType: source.mediaType,
    evidenceFamily: source.evidenceFamily,
    representationRole: source.representationRole,
    independence: source.independence,
    providerProvenance: source.providerProvenance,
    provenanceBasis: source.provenanceBasis,
  };
}

function parseResult(bytes: Buffer): MetricInputPreparationResult {
  let value: unknown;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new MetricInputPreparationIntegrityError('Preparation result is not valid UTF-8 JSON'); }
  if (!validateResult(value)) throw new MetricInputPreparationIntegrityError('Preparation result breaks its contract');
  const result = JSON.parse(canonicalJson(value)) as MetricInputPreparationResult;
  if (!canonicalBytes(result).equals(bytes)) throw new MetricInputPreparationIntegrityError('Preparation result is not canonical JSON');
  const expectedIdentity = {
    contractVersion: 'metric-input-preparation-identity-v1',
    requestSha256: result.requestSha256,
    workspaceSnapshotSha256: result.workspace.snapshotSha256,
    sourcePackage: result.sourcePackage,
    selectedSources: result.selectedSources,
    normalizedInputArtifactSha256: result.normalizedInput.artifactSha256,
    normalizedInputValueSha256: result.normalizedInput.valueSha256,
    normalizationReceiptSha256: result.normalizationReceiptSha256,
  };
  if (digest(canonicalBytes(expectedIdentity, false)) !== result.preparationSha256) {
    throw new MetricInputPreparationIntegrityError('Preparation identity does not match its canonical result');
  }
  if (digest(canonicalBytes(result.request, false)) !== result.requestSha256) {
    throw new MetricInputPreparationIntegrityError('Preparation request identity does not match its canonical result');
  }
  return result;
}

function executionFrom(
  built: BuiltPreparation,
  resultArtifactSha256: string,
  deduplicated: boolean,
  databaseMutations: number,
): MetricInputPreparationExecution {
  return {
    preparationSha256: built.result.preparationSha256,
    normalizedInputSha256: built.result.normalizedInput.artifactSha256,
    resultArtifactSha256,
    rowCount: built.result.normalizedInput.rowCount,
    sourceCount: built.result.normalizedInput.sourceCount,
    deduplicated,
    databaseMutations,
  };
}

function canonicalBytes(value: unknown, newline = true): Buffer {
  return Buffer.from(canonicalJson(value) + (newline ? '\n' : ''), 'utf8');
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDigest(value: string, label: string): void {
  if (!/^[0-9a-f]{64}$/.test(value)) throw new MetricInputPreparationValidationError(`${label} is not a SHA-256 digest`);
}

function exactTimestamp(now: Date): string {
  if (!Number.isFinite(now.getTime())) throw new MetricInputPreparationValidationError('Preparation clock returned an invalid date');
  return now.toISOString();
}

function assertDerivedArtifactSize(bytes: Buffer, label: string): void {
  if (bytes.byteLength > MAX_BYTES) {
    throw new MetricInputPreparationValidationError(`${label} exceeds the preparation artifact size limit`);
  }
}
