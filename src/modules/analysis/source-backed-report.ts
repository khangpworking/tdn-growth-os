import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/source-backed-report-request.schema.json' with { type: 'json' };
import type { SourceBackedReportRequest } from '../../../contracts/analysis/source-backed-report-request.generated.js';
import type { MetricScopeInput } from '../../../contracts/analysis/metric-scope-input.generated.js';
import type { MetricScopeOutput } from '../../../contracts/analysis/metric-scope-output.generated.js';
import type { VersionedReportPacket } from '../../../contracts/analysis/versioned-report-packet.generated.js';
import type { SourcePackageManifest } from '../../../contracts/foundation/source-package-manifest.generated.js';
import type { DiscoveryWorkspaceArtifact } from '../../../contracts/flow/discovery-workspace-artifact.generated.js';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { SourcePackageReadBudget } from '../foundation/source-package-service.js';
import type { VerifiedFinalizedSourcePackage, VerifiedSourcePackageFile } from '../foundation/source-package-service.js';
import type { DiscoveryWorkspaceReader } from '../flow/discovery-workspace-reader.js';
import { validateSourcePackageManifest } from '../foundation/validation.js';
import { validateDiscoveryWorkspaceArtifact } from '../flow/validation.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { normalizeMetricWorkbook } from './metric-source-profile.js';
import { createResearchReportPacket } from './versioned-report-packet.js';
import { buildResearchReportChartData, type ResearchReportChartData } from './research-report-charts.js';
import { buildM02ScopeMethod } from './m02-scope-method.js';
import { buildM08TabletQuoteMethod, type M08TabletQuoteSource } from './m08-tablet-quote-method.js';
import { buildM13ProvenanceAppendix } from './m13-provenance-appendix.js';
import { buildI03ResearchMethod } from './i03-research-method.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateRequest = ajv.compile<SourceBackedReportRequest>(requestSchema);

const MAX_BYTES = 32 * 1024 * 1024;
const SOURCE_BACKED_REPORT_READ_BUDGET: SourcePackageReadBudget = Object.freeze({
  maxFileBytes: MAX_BYTES,
  maxTotalBytes: 128 * 1024 * 1024,
});
const XLSX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const JSON_MEDIA_TYPE = 'application/json';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DIGEST = /^[0-9a-f]{64}$/;

type SourceRole = 'workbook' | 'manifest' | 'labels' | 'tabletQuoteSource' | 'tabletQuoteInput';

export interface SourceBackedReportDependencies {
  readonly sourcePackages: FinalizedSourcePackageReader;
  readonly workspaces: DiscoveryWorkspaceReader;
}

export interface SourceBackedSourceProvenance {
  readonly role: SourceRole;
  readonly logicalPath: string;
  readonly exportPath: string;
  readonly sha256: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly evidenceFamily: string;
  readonly representationRole: SourcePackageManifest['files'][number]['representationRole'];
  readonly independence: SourcePackageManifest['files'][number]['independence'];
  readonly providerProvenance: SourcePackageManifest['files'][number]['providerProvenance'];
  readonly provenanceBasis: string;
  readonly period?: SourcePackageManifest['files'][number]['period'];
}

export interface SourceBackedRawByteMapping {
  readonly role: SourceRole;
  readonly packageId: string;
  readonly logicalPath: string;
  readonly packageFileSha256: string;
  readonly rawByteSha256: string;
  readonly byteSize: number;
  readonly mediaType: string;
  readonly evidenceFamily: string;
  readonly providerProvenance: SourcePackageManifest['files'][number]['providerProvenance'];
  readonly provenanceBasis: string;
  readonly exportPath: string;
}

export interface SourceBackedReportEnvelope {
  readonly contractVersion: 'source-backed-report-v1';
  readonly request: SourceBackedReportRequest;
  readonly workspace: {
    readonly workspaceId: string;
    readonly state: 'ACTIVE';
    readonly snapshotSha256: string;
    readonly snapshot: DiscoveryWorkspaceArtifact;
  };
  readonly sourcePackage: {
    readonly packageId: string;
    readonly manifestArtifactSha256: string;
    readonly packageContentSha256: string;
    readonly manifest: SourcePackageManifest;
  };
  readonly selectedSources: readonly SourceBackedSourceProvenance[];
  readonly rawByteMappings: readonly SourceBackedRawByteMapping[];
  readonly artifacts: {
    readonly workspaceSnapshotSha256: string;
    readonly sourcePackageManifestSha256: string;
    readonly normalizedInputSha256: string;
    readonly receiptSha256: string;
    readonly metricResultSha256: string;
    readonly catalogSha256: string;
    readonly packetSha256: string;
    readonly chartSha256: string;
    readonly reportSha256: string;
    readonly m02ScopeMethodSha256?: string;
    readonly m08TabletQuoteMethodSha256?: string;
    readonly m13ProvenanceAppendixSha256?: string;
    readonly i03ResearchMethodSha256?: string;
  };
  readonly limitations: readonly string[];
}

export interface SourceBackedReportBundle {
  readonly envelope: SourceBackedReportEnvelope;
  readonly envelopeBytes: Buffer;
  readonly input: MetricScopeInput;
  readonly result: MetricScopeOutput;
  readonly receipt: ReturnType<typeof normalizeMetricWorkbook>['receipt'];
  readonly packet: VersionedReportPacket;
  readonly charts: ResearchReportChartData;
  readonly files: ReadonlyMap<string, Buffer>;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function canonicalBytes(value: unknown, newline = true): Buffer {
  return Buffer.from(canonicalJson(value) + (newline ? '\n' : ''), 'utf8');
}

function cloneBytes(bytes: Uint8Array, label: string): Buffer {
  if (bytes.byteLength > MAX_BYTES) throw new TypeError(`${label}: SIZE_LIMIT`);
  return Buffer.from(bytes);
}

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new TypeError(`${label}: INVALID_DIGEST`);
}

function assertUuid(value: string, label: string): void {
  if (!UUID.test(value)) throw new TypeError(`${label}: INVALID_UUID`);
}

function requestSnapshot(untrusted: unknown): SourceBackedReportRequest {
  if (!validateRequest(untrusted)) throw new TypeError(`request: INVALID_CONTRACT ${ajv.errorsText(validateRequest.errors)}`);
  const request = JSON.parse(canonicalJson(untrusted)) as SourceBackedReportRequest;
  assertUuid(request.workspaceId, 'request.workspaceId');
  assertUuid(request.packageId, 'request.packageId');
  assertDigest(request.packageManifestSha256, 'request.packageManifestSha256');
  assertDigest(request.catalogSha256, 'request.catalogSha256');
  return request;
}

function fileWithoutBytes(file: VerifiedSourcePackageFile): SourcePackageManifest['files'][number] {
  const { bytes: _bytes, ...metadata } = file;
  return metadata;
}

function packageContentDigest(files: readonly SourcePackageManifest['files'][number][]): string {
  const membership = files
    .map(({ path, sha256: fileSha256, byteSize }) => ({ path, sha256: fileSha256, byteSize }))
    .sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  return sha256(Buffer.from(canonicalJson(membership), 'utf8'));
}

function verifyPackage(
  value: VerifiedFinalizedSourcePackage,
  request: SourceBackedReportRequest,
): void {
  if (!value || typeof value !== 'object') throw new TypeError('package: INVALID_READER_RESULT');
  validateSourcePackageManifest(value.manifest);
  if (value.packageId !== request.packageId || value.manifest.packageId !== request.packageId) {
    throw new TypeError('package: ID_MISMATCH');
  }
  if (value.manifestArtifactSha256 !== request.packageManifestSha256) {
    throw new TypeError('package: MANIFEST_DIGEST_MISMATCH');
  }
  assertDigest(value.manifestArtifactSha256, 'package.manifestArtifactSha256');
  if (sha256(Buffer.from(canonicalJson(value.manifest), 'utf8')) !== value.manifestArtifactSha256) {
    throw new TypeError('package: MANIFEST_BYTES_MISMATCH');
  }
  assertDigest(value.packageContentSha256, 'package.packageContentSha256');
  if (value.manifest.packageContentSha256 !== value.packageContentSha256) {
    throw new TypeError('package: CONTENT_DIGEST_MISMATCH');
  }
  if (!Array.isArray(value.manifest.files) || !Array.isArray(value.files) || value.manifest.files.length !== value.files.length) {
    throw new TypeError('package: FILE_MEMBERSHIP_MISMATCH');
  }
  const manifestByPath = new Map<string, SourcePackageManifest['files'][number]>();
  for (const file of value.manifest.files) {
    if (manifestByPath.has(file.path)) throw new TypeError('package: DUPLICATE_LOGICAL_PATH');
    manifestByPath.set(file.path, file);
  }
  const readerPaths = new Set<string>();
  for (const file of value.files) {
    if (readerPaths.has(file.path)) throw new TypeError('package: DUPLICATE_READER_PATH');
    readerPaths.add(file.path);
    const declared = manifestByPath.get(file.path);
    if (!declared || canonicalJson(declared) !== canonicalJson(fileWithoutBytes(file))) {
      throw new TypeError(`package: FILE_METADATA_MISMATCH:${file.path}`);
    }
    if (!Buffer.isBuffer(file.bytes) && !(file.bytes instanceof Uint8Array)) {
      throw new TypeError(`package: FILE_BYTES_INVALID:${file.path}`);
    }
    if (file.byteSize < 0 || file.bytes.byteLength !== file.byteSize || sha256(file.bytes) !== file.sha256) {
      throw new TypeError(`package: FILE_BYTES_MISMATCH:${file.path}`);
    }
  }
  if (readerPaths.size !== manifestByPath.size || packageContentDigest(value.manifest.files) !== value.packageContentSha256) {
    throw new TypeError('package: CONTENT_MEMBERSHIP_MISMATCH');
  }
}

function verifyWorkspace(value: DiscoveryWorkspaceArtifact, request: SourceBackedReportRequest): string {
  validateDiscoveryWorkspaceArtifact(value);
  if (!value || typeof value !== 'object' || value.workspaceId !== request.workspaceId || value.state !== 'ACTIVE') {
    throw new TypeError('workspace: ID_OR_STATE_MISMATCH');
  }
  assertUuid(value.workspaceId, 'workspace.workspaceId');
  assertDigest(value.requestSha256, 'workspace.requestSha256');
  const ownerRequest = {
    contractVersion: '1.0.0' as const,
    workspaceKey: value.workspaceKey,
    title: value.title,
    ...(value.description === undefined ? {} : { description: value.description }),
  };
  if (sha256(Buffer.from(canonicalJson(ownerRequest), 'utf8')) !== value.requestSha256) {
    throw new TypeError('workspace: REQUEST_DIGEST_MISMATCH');
  }
  const bytes = canonicalBytes(value, false);
  if (bytes.byteLength > MAX_BYTES) throw new TypeError('workspace: SIZE_LIMIT');
  return sha256(bytes);
}

function selectedFile(
  pkg: VerifiedFinalizedSourcePackage,
  logicalPath: string,
  role: SourceRole,
  mediaType: string,
  exportPath: string,
): { readonly file: VerifiedSourcePackageFile; readonly provenance: SourceBackedSourceProvenance; readonly mapping: SourceBackedRawByteMapping } {
  const file = pkg.files.find(candidate => candidate.path === logicalPath);
  if (!file) throw new TypeError(`${role}: FILE_NOT_FOUND`);
  if (file.mediaType !== mediaType) throw new TypeError(`${role}: MEDIA_TYPE_MISMATCH`);
  if (file.bytes.byteLength > MAX_BYTES) throw new TypeError(`${role}: SIZE_LIMIT`);
  const actualSha256 = sha256(file.bytes);
  if (actualSha256 !== file.sha256 || file.bytes.byteLength !== file.byteSize) throw new TypeError(`${role}: RAW_BYTES_MISMATCH`);
  const provenance: SourceBackedSourceProvenance = {
    role, logicalPath, exportPath, sha256: file.sha256, byteSize: file.byteSize, mediaType: file.mediaType,
    evidenceFamily: file.evidenceFamily, representationRole: file.representationRole, independence: file.independence,
    providerProvenance: file.providerProvenance, provenanceBasis: file.provenanceBasis,
    ...(file.period === undefined ? {} : { period: file.period }),
  };
  const mapping: SourceBackedRawByteMapping = {
    role, packageId: pkg.packageId, logicalPath, packageFileSha256: file.sha256,
    rawByteSha256: actualSha256, byteSize: file.byteSize, mediaType: file.mediaType,
    evidenceFamily: file.evidenceFamily, providerProvenance: file.providerProvenance,
    provenanceBasis: file.provenanceBasis, exportPath,
  };
  return { file, provenance, mapping };
}

function verifyNormalizedEvidenceFamilies(
  input: MetricScopeInput,
  selected: readonly { readonly file: VerifiedSourcePackageFile; readonly provenance: SourceBackedSourceProvenance }[],
): void {
  for (const item of selected) {
    const digest = sha256(item.file.bytes);
    const source = input.sources.find(candidate => candidate.sha256 === digest);
    if (!source || source.evidenceFamily !== item.file.evidenceFamily) {
      throw new TypeError(`${item.provenance.role}: NORMALIZED_EVIDENCE_FAMILY_MISMATCH`);
    }
  }
}

function ensureDistinct(request: SourceBackedReportRequest): void {
  const tabletQuoteSourcePath = request.tabletQuoteSourcePath ?? null;
  const tabletQuoteInputPath = request.tabletQuoteInputPath ?? null;
  if ((tabletQuoteSourcePath === null) !== (tabletQuoteInputPath === null)) {
    throw new TypeError('request: TABLET_QUOTE_SOURCE_AND_INPUT_REQUIRED_TOGETHER');
  }
  const paths = [request.workbookPath, request.manifestPath, ...(request.labelsPath === null ? [] : [request.labelsPath]),
    ...(tabletQuoteSourcePath === null ? [] : [tabletQuoteSourcePath, tabletQuoteInputPath!])];
  if (new Set(paths).size !== paths.length) throw new TypeError('request: SELECTED_PATHS_NOT_DISTINCT');
}

function m08Source(
  selected: ReturnType<typeof selectedFile>,
  role: M08TabletQuoteSource['role'],
  exportPath: M08TabletQuoteSource['exportPath'],
): M08TabletQuoteSource {
  return {
    ...selected.provenance,
    role,
    exportPath,
    mediaType: 'application/json',
    period: selected.provenance.period ?? null,
    bytes: Buffer.from(selected.file.bytes),
  };
}

function assertGeneratedSize(files: ReadonlyMap<string, Buffer>): void {
  for (const [name, bytes] of files) if (bytes.byteLength > MAX_BYTES) throw new TypeError(`${name}: SIZE_LIMIT`);
}

/**
 * Replays one exact package/workspace selection through A2 and A3. This is a
 * pure builder: readers may perform their own verified reads, but this method
 * has no database, provider, clock, random-ID, or publication side effects.
 */
export async function buildSourceBackedReport(
  untrustedRequest: unknown,
  catalogBytes: Buffer,
  dependencies: SourceBackedReportDependencies,
): Promise<SourceBackedReportBundle> {
  const request = requestSnapshot(untrustedRequest);
  ensureDistinct(request);
  if (catalogBytes.byteLength > MAX_BYTES) throw new TypeError('catalog: SIZE_LIMIT');
  if (sha256(catalogBytes) !== request.catalogSha256) throw new TypeError('catalog: DIGEST_MISMATCH');
  const catalog = cloneBytes(catalogBytes, 'catalog');
  const [workspace, sourcePackage] = await Promise.all([
    dependencies.workspaces.readVerifiedWorkspace(request.workspaceId),
    dependencies.sourcePackages.readFinalizedSourcePackage(request.packageId, SOURCE_BACKED_REPORT_READ_BUDGET),
  ]);
  const workspaceSnapshotSha256 = verifyWorkspace(workspace, request);
  verifyPackage(sourcePackage, request);

  const workbook = selectedFile(sourcePackage, request.workbookPath, 'workbook', XLSX_MEDIA_TYPE, 'raw-workbook.xlsx');
  const manifest = selectedFile(sourcePackage, request.manifestPath, 'manifest', JSON_MEDIA_TYPE, 'raw-manifest.json');
  const labels = request.labelsPath === null ? null : selectedFile(sourcePackage, request.labelsPath, 'labels', JSON_MEDIA_TYPE, 'raw-labels.json');
  const tabletQuoteSourcePath = request.tabletQuoteSourcePath ?? null;
  const tabletQuoteInputPath = request.tabletQuoteInputPath ?? null;
  const tabletQuoteSource = tabletQuoteSourcePath === null ? null
    : selectedFile(sourcePackage, tabletQuoteSourcePath, 'tabletQuoteSource', JSON_MEDIA_TYPE, 'raw-tablet-quote-source.json');
  const tabletQuoteInput = tabletQuoteInputPath === null ? null
    : selectedFile(sourcePackage, tabletQuoteInputPath, 'tabletQuoteInput', JSON_MEDIA_TYPE, 'raw-tablet-quote-input.json');
  const normalized = normalizeMetricWorkbook(workbook.file.bytes, manifest.file.bytes, labels?.file.bytes);
  const metricSelected = [workbook, manifest, ...(labels === null ? [] : [labels])];
  const selected = [...metricSelected, ...(tabletQuoteSource === null ? [] : [tabletQuoteSource, tabletQuoteInput!])];
  const selectedSources = selected.map(item => item.provenance);
  const rawByteMappings = selected.map(item => item.mapping);
  verifyNormalizedEvidenceFamilies(normalized.input, metricSelected);
  const inputBytes = canonicalBytes(normalized.input);
  const receiptBytes = canonicalBytes(normalized.receipt);
  const resultBytes = canonicalBytes(normalized.result);
  const resultSha256 = sha256(resultBytes);
  let parsedCatalog: unknown;
  try { parsedCatalog = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(catalog)); }
  catch { throw new TypeError('catalog: INVALID_JSON_UTF8'); }
  const catalogSections = typeof parsedCatalog === 'object' && parsedCatalog !== null &&
    Array.isArray((parsedCatalog as { sections?: unknown }).sections) &&
    (parsedCatalog as { sections: Array<{ sectionId?: unknown; methodVersion?: unknown }> }).sections;
  const methodEnabled = (sectionId: string): boolean => catalogSections !== false &&
    catalogSections.some(section => section.sectionId === sectionId && section.methodVersion === '2.0.0');
  const m02Enabled = methodEnabled('M02');
  const m08Enabled = methodEnabled('M08');
  const m13Enabled = methodEnabled('M13');
  const i03Enabled = methodEnabled('I03');
  const m02 = m02Enabled
    ? buildM02ScopeMethod(
      normalized.input,
      normalized.result,
      metricSelected.map(item => item.provenance),
      metricSelected.map(item => item.mapping),
    )
    : undefined;
  const m02Sha256 = m02 === undefined ? undefined : sha256(m02.bytes);
  const m08 = m08Enabled && tabletQuoteSource !== null && tabletQuoteInput !== null
    ? buildM08TabletQuoteMethod(
      {
        packageId: sourcePackage.manifest.packageId,
        packageKey: sourcePackage.manifest.packageKey,
        version: sourcePackage.manifest.version,
        manifestArtifactSha256: sourcePackage.manifestArtifactSha256,
        packageContentSha256: sourcePackage.manifest.packageContentSha256,
        sourceAcquiredAt: sourcePackage.manifest.sourceAcquiredAt,
        finalizedAt: sourcePackage.manifest.finalizedAt,
      },
      m08Source(tabletQuoteSource, 'tabletQuoteSource', 'raw-tablet-quote-source.json'),
      m08Source(tabletQuoteInput, 'tabletQuoteInput', 'raw-tablet-quote-input.json'),
    )
    : undefined;
  const m08Sha256 = m08 === undefined ? undefined : sha256(m08.bytes);
  const m13 = m13Enabled ? buildM13ProvenanceAppendix(
    normalized.input,
    sourcePackage.manifest,
    sourcePackage.manifestArtifactSha256,
    selectedSources,
    rawByteMappings,
    {
      normalizedInputSha256: sha256(inputBytes),
      normalizationReceiptSha256: sha256(receiptBytes),
      metricResultSha256: resultSha256,
    },
  ) : undefined;
  const m13Sha256 = m13 === undefined ? undefined : sha256(m13.bytes);
  const i03 = i03Enabled && m02 !== undefined && m13 !== undefined ? buildI03ResearchMethod({
    m02,
    m13,
    receipt: normalized.receipt,
    receiptBytes,
    result: normalized.result,
    resultBytes,
    normalizedInputSha256: sha256(inputBytes),
  }) : undefined;
  const i03Sha256 = i03 === undefined ? undefined : sha256(i03.bytes);
  const packetResult = createResearchReportPacket(
    resultBytes,
    resultSha256,
    catalog,
    request.catalogSha256,
    [
      ...(m02 === undefined || m02Sha256 === undefined ? [] : [{
        sectionId: 'M02' as const, methodVersion: '2.0.0' as const, fileName: 'm02-scope-method.json' as const,
        sha256: m02Sha256, methodOutputId: m02.output.methodOutputId,
      }]),
      ...(m08 === undefined || m08Sha256 === undefined ? [] : [{
        sectionId: 'M08' as const, methodVersion: '2.0.0' as const, fileName: 'm08-tablet-quote-method.json' as const,
        sha256: m08Sha256, methodOutputId: m08.output.methodOutputId,
      }]),
      ...(m13 === undefined || m13Sha256 === undefined ? [] : [{
        sectionId: 'M13' as const, methodVersion: '2.0.0' as const, fileName: 'm13-provenance-appendix.json' as const,
        sha256: m13Sha256, methodOutputId: m13.output.methodOutputId,
      }]),
      ...(i03 === undefined || i03Sha256 === undefined ? [] : [{
        sectionId: 'I03' as const, methodVersion: '2.0.0' as const, fileName: 'i03-research-method.json' as const,
        sha256: i03Sha256, methodOutputId: i03.output.methodOutputId,
      }]),
    ],
  );
  const packetBytes = canonicalBytes(packetResult.packet);
  const charts = buildResearchReportChartData(resultBytes, resultSha256, catalog, request.catalogSha256);
  const chartBytes = canonicalBytes(charts);
  const reportBytes = Buffer.from(packetResult.report, 'utf8');
  const sourcePackageManifestBytes = canonicalBytes(sourcePackage.manifest, false);
  const workspaceBytes = canonicalBytes(workspace, false);
  const files = new Map<string, Buffer>([
    ['normalized-input.json', inputBytes],
    ['receipt.json', receiptBytes],
    ['metric-result.json', resultBytes],
    ['section-catalog.json', catalog],
    ['packet.json', packetBytes],
    ['charts.json', chartBytes],
    ['report.md', reportBytes],
    ...(m02 === undefined ? [] : [['m02-scope-method.json', m02.bytes] as const]),
    ...(m08 === undefined ? [] : [['m08-tablet-quote-method.json', m08.bytes] as const]),
    ...(m13 === undefined ? [] : [['m13-provenance-appendix.json', m13.bytes] as const]),
    ...(i03 === undefined ? [] : [['i03-research-method.json', i03.bytes] as const]),
    ['source-package-manifest.json', sourcePackageManifestBytes],
    ['workspace.json', workspaceBytes],
    ['raw-workbook.xlsx', Buffer.from(workbook.file.bytes)],
    ['raw-manifest.json', Buffer.from(manifest.file.bytes)],
    ...(labels === null ? [] : [['raw-labels.json', Buffer.from(labels.file.bytes)] as const]),
    ...(tabletQuoteSource === null ? [] : [['raw-tablet-quote-source.json', Buffer.from(tabletQuoteSource.file.bytes)] as const]),
    ...(tabletQuoteInput === null ? [] : [['raw-tablet-quote-input.json', Buffer.from(tabletQuoteInput.file.bytes)] as const]),
  ]);
  assertGeneratedSize(files);

  const envelope: SourceBackedReportEnvelope = {
    contractVersion: 'source-backed-report-v1',
    request,
    workspace: { workspaceId: workspace.workspaceId, state: workspace.state, snapshotSha256: workspaceSnapshotSha256, snapshot: workspace },
    sourcePackage: {
      packageId: sourcePackage.packageId, manifestArtifactSha256: sourcePackage.manifestArtifactSha256,
      packageContentSha256: sourcePackage.packageContentSha256, manifest: sourcePackage.manifest,
    },
    selectedSources,
    rawByteMappings,
    artifacts: {
      workspaceSnapshotSha256,
      sourcePackageManifestSha256: sourcePackage.manifestArtifactSha256,
      normalizedInputSha256: sha256(inputBytes), receiptSha256: sha256(receiptBytes),
      metricResultSha256: resultSha256, catalogSha256: request.catalogSha256,
      packetSha256: sha256(packetBytes), chartSha256: sha256(chartBytes), reportSha256: sha256(reportBytes),
      ...(m02Sha256 === undefined ? {} : { m02ScopeMethodSha256: m02Sha256 }),
      ...(m08Sha256 === undefined ? {} : { m08TabletQuoteMethodSha256: m08Sha256 }),
      ...(m13Sha256 === undefined ? {} : { m13ProvenanceAppendixSha256: m13Sha256 }),
      ...(i03Sha256 === undefined ? {} : { i03ResearchMethodSha256: i03Sha256 }),
    },
    limitations: [
      'EXACT_PACKAGE_BYTES_READ_AND_REPARSED_THROUGH_VERIFIED_READERS',
      'BYTE_AND_IMMUTABLE_METADATA_CHECKS_DO_NOT_AUTHENTICATE_PROVIDER_COLLECTION',
      'A3_PACKET_RETAINS_NORMALIZED_INPUT_ONLY_SEMANTICS',
      'OWNER_REVIEW_REQUIRED; NO_AI_INTERPRETATION_OR_HUMAN_DECISION_IS_CREATED',
    ],
  };
  const envelopeBytes = canonicalBytes(envelope);
  if (envelopeBytes.byteLength > MAX_BYTES) throw new TypeError('envelope: SIZE_LIMIT');
  return { envelope, envelopeBytes, input: normalized.input, result: normalized.result, receipt: normalized.receipt,
    packet: packetResult.packet, charts, files };
}
