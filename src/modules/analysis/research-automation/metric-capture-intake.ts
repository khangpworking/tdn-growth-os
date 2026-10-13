import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import captureManifestSchema from '../../../../contracts/analysis/automation-metric-results-capture-v1.schema.json' with { type: 'json' };
import captureSourceSchema from '../../../../contracts/analysis/automation-metric-source-capture-v1.schema.json' with { type: 'json' };
import snapshotSchema from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.schema.json' with { type: 'json' };
import sourceV2Schema from '../../../../contracts/analysis/automation-metric-source-v2.schema.json' with { type: 'json' };
import type { AutomationMetricResultsCaptureV1 } from '../../../../contracts/analysis/automation-metric-results-capture-v1.generated.js';
import type { AutomationMetricSourceCaptureV1 } from '../../../../contracts/analysis/automation-metric-source-capture-v1.generated.js';
import type {
  Capture, ResearchAutomationMetricCapturePrepareReceipt, ResearchAutomationMetricCapturePrepareRequest,
} from '../../../../contracts/api/research-automation-metric-capture-intake-api.generated.js';
import type { AutomationMetricWebSnapshotV1 } from '../../../../contracts/analysis/automation-metric-web-snapshot-v1.generated.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService } from '../../foundation/source-package-service.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { validateMetricWebSnapshot } from './metric-web-snapshot.js';
import type { ScopeSnapshot, StartSnapshot } from './model.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(snapshotSchema);
ajv.addSchema(sourceV2Schema);
ajv.addSchema(captureManifestSchema);
ajv.addSchema(captureSourceSchema);
const validateManifest = ajv.compile<AutomationMetricResultsCaptureV1>(captureManifestSchema);
const validateDescriptor = ajv.compile<AutomationMetricSourceCaptureV1>(captureSourceSchema);

export const MAX_METRIC_CAPTURE_BYTES = 8 * 1024 * 1024;
export const MAX_METRIC_CAPTURE_TOTAL_BYTES = MAX_METRIC_CAPTURE_BYTES + 256 * 1024;
export const METRIC_CAPTURE_SOURCE_LABEL = 'results-page capture';
export const METRIC_CAPTURE_PROVENANCE = 'RESULTS_PAGE_CAPTURE' as const;
const SNAPSHOT_PATH = 'capture/snapshot.json';
const MANIFEST_PATH = 'capture/manifest.json';
const CONTEXT_PATH = 'capture/context.json';
const DESCRIPTOR_PATH = 'normalized/automation-metric-source-capture.json';
const hash = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value), 'utf8');
const norm = (value: string): string => value.normalize('NFC').trim().toLowerCase();
// The adapter's manifest `appliedFilters` repeats the snapshot scope and adds
// these page toggles, which the snapshot scope deliberately does not model.
// The snapshot schema keeps `scope` closed, so a toggle can never appear there.
const APPLIED_FILTER_TOGGLES = ['smartQuery', 'aiNormalisation', 'usefulFilters'] as const;

export type MetricCaptureRejectionCode =
  | 'CAPTURE_OVERSIZE' | 'CAPTURE_INVALID_JSON' | 'CAPTURE_SCHEMA_INVALID' | 'CAPTURE_MANIFEST_INVALID'
  | 'CAPTURE_GATE_NOT_CLEARED' | 'CAPTURE_DIGEST_MISMATCH' | 'CAPTURE_SCOPE_MISMATCH'
  | 'CAPTURE_PRODUCTS_MISSING' | 'CAPTURE_INTEGRITY_FAILED';

/** Closed input diagnostics for the capture boundary; no provider text crosses it. */
export class MetricCaptureRejection extends Error {
  constructor(readonly code: MetricCaptureRejectionCode, readonly locator: string, detail = '') {
    super(`${locator}: ${code}${detail ? ` (${detail})` : ''}`);
    this.name = 'MetricCaptureRejection';
  }
}

export interface VerifiedMetricCapture {
  readonly snapshot: AutomationMetricWebSnapshotV1;
  readonly manifest: AutomationMetricResultsCaptureV1;
  readonly snapshotBytes: Buffer;
  readonly manifestBytes: Buffer;
  readonly capture: Capture;
}

export function verifyMetricCaptureArchive(snapshotBytes: Buffer, manifestBytes: Buffer, bound?: { readonly start: StartSnapshot }): VerifiedMetricCapture {
  if (snapshotBytes.byteLength < 1 || manifestBytes.byteLength < 1 || snapshotBytes.byteLength > MAX_METRIC_CAPTURE_BYTES || manifestBytes.byteLength > MAX_METRIC_CAPTURE_BYTES || snapshotBytes.byteLength + manifestBytes.byteLength > MAX_METRIC_CAPTURE_TOTAL_BYTES)
    throw new MetricCaptureRejection('CAPTURE_OVERSIZE', 'capture');
  const snapshotValue = parseJson(snapshotBytes, 'snapshot.json');
  const manifestValue = parseJson(manifestBytes, 'manifest.json');
  let snapshot: AutomationMetricWebSnapshotV1;
  try { snapshot = validateMetricWebSnapshot(snapshotValue); }
  catch (error) { throw new MetricCaptureRejection('CAPTURE_SCHEMA_INVALID', 'snapshot.json', error instanceof Error ? error.message : 'schema'); }
  if (!validateManifest(manifestValue)) throw new MetricCaptureRejection('CAPTURE_MANIFEST_INVALID', 'manifest.json', (validateManifest.errors ?? []).slice(0, 2).map(error => `${error.instancePath || '/'} ${error.message ?? ''}`).join('; '));
  const manifest = manifestValue as AutomationMetricResultsCaptureV1;
  if (manifest.captureId !== snapshot.captureId || manifest.specDigest !== snapshot.specDigest)
    throw new MetricCaptureRejection('CAPTURE_SCOPE_MISMATCH', 'manifest', 'captureId/specDigest');
  if (canonicalJson(scopeShapedFilters(manifest.appliedFilters)) !== canonicalJson(snapshot.scope))
    throw new MetricCaptureRejection('CAPTURE_SCOPE_MISMATCH', 'manifest.appliedFilters');
  if (manifest.archive.normalizedSnapshot !== 'snapshot.json') throw new MetricCaptureRejection('CAPTURE_MANIFEST_INVALID', 'manifest.archive.normalizedSnapshot');
  const snapshotFile = manifest.files.find(file => file.path === 'snapshot.json');
  if (!snapshotFile || snapshotFile.byteSize !== snapshotBytes.byteLength || snapshotFile.sha256 !== hash(snapshotBytes))
    throw new MetricCaptureRejection('CAPTURE_DIGEST_MISMATCH', 'manifest.files[snapshot.json]');
  if (!gateCleared(manifest.captureGate))
    throw new MetricCaptureRejection('CAPTURE_GATE_NOT_CLEARED', 'manifest.captureGate');
  const rows = snapshot.groups.W12_topProducts;
  if ('absent' in rows || rows.rows.length === 0) throw new MetricCaptureRejection('CAPTURE_PRODUCTS_MISSING', 'groups.W12_topProducts');
  if (bound !== undefined) assertRunScope(snapshot, bound.start);
  if (snapshot.scope.period.startDate > snapshot.scope.period.endDate)
    throw new MetricCaptureRejection('CAPTURE_SCOPE_MISMATCH', 'snapshot.scope.period', 'startDate is after endDate');
  const keywords = snapshot.scope.keywords;
  const platforms = snapshot.scope.platforms;
  const pagination = manifest.productPagination;
  if (rows.rows.length > pagination.cap || rows.rows.length > 200 || pagination.rowsRead !== rows.rows.length)
    throw new MetricCaptureRejection('CAPTURE_INTEGRITY_FAILED', 'manifest.productPagination', 'rowsRead does not match W12_topProducts');
  const truncation = {
    cap: pagination.cap, totalShown: pagination.totalShown, pagesRead: pagination.pagesRead,
    rowsRead: pagination.rowsRead, truncated: pagination.truncated,
  };
  const capture: Capture = {
    captureId: snapshot.captureId, specDigest: snapshot.specDigest, keyword: keywords[0]!,
    platforms: [...platforms].sort() as Capture['platforms'],
    measurementPeriod: { ...snapshot.scope.period }, truncation,
  };
  return { snapshot, manifest, snapshotBytes, manifestBytes, capture };
}

/** The manifest repeats the snapshot scope plus the page toggles; compare only the scope-shaped part. */
function scopeShapedFilters(appliedFilters: AutomationMetricResultsCaptureV1['appliedFilters']): Record<string, unknown> {
  const scope = { ...appliedFilters } as Record<string, unknown>;
  for (const toggle of APPLIED_FILTER_TOGGLES) delete scope[toggle];
  return scope;
}

function parseJson(bytes: Buffer, locator: string): unknown {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new MetricCaptureRejection('CAPTURE_INVALID_JSON', locator); }
}

function gateCleared(value: boolean | { readonly [key: string]: unknown } | undefined): boolean {
  if (typeof value !== 'object' || value === null) return false;
  // The adapter's only live marker is exactly { cleared: true }.  Do not
  // accept legacy booleans, status-only markers, or extra fields that could
  // turn a replay/uncleared archive into a sales source.
  return Object.keys(value).length === 1 && value.cleared === true;
}

function assertRunScope(snapshot: AutomationMetricWebSnapshotV1, start: StartSnapshot): void {
  const requestedKeyword = norm(start.keyword);
  if (snapshot.scope.keywords.length !== 1 || norm(snapshot.scope.keywords[0]!) !== requestedKeyword)
    throw new MetricCaptureRejection('CAPTURE_SCOPE_MISMATCH', 'snapshot.scope.keywords');
  if (snapshot.scope.period.startDate < start.requestedPeriod.startDate || snapshot.scope.period.endDate > start.requestedPeriod.endDate)
    throw new MetricCaptureRejection('CAPTURE_SCOPE_MISMATCH', 'snapshot.scope.period');
}

/** Prepared storage only. Admission remains the explicit source-confirmation action. */
export class AutomationMetricCaptureSourceIntake {
  readonly #packages: SourcePackageService;
  constructor(private readonly artifacts: RequestScopedArtifactStore, db: Database.Database, private readonly now: () => Date) {
    this.#packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  }

  hasRequest(runId: string, requestKey: string): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(packageKey(runId, requestKey)).length > 0;
  }

  async prepare(input: ResearchAutomationMetricCapturePrepareRequest, snapshotBytes: Buffer, manifestBytes: Buffer,
    bound: { readonly runId: string; readonly start: StartSnapshot; readonly scope: ScopeSnapshot }): Promise<ResearchAutomationMetricCapturePrepareReceipt> {
    const verified = verifyMetricCaptureArchive(snapshotBytes, manifestBytes, bound);
    // The capture can be uploaded before scope confirmation. Bind it to the
    // immutable run start, not the temporary empty/proposed scope used by the
    // upload endpoint. Confirmation authenticates the same package again.
    const binding = hash(json({ runId: bound.runId, start: bound.start }));
    const descriptor: AutomationMetricSourceCaptureV1 = {
      contractVersion: 'automation-metric-source-capture-v1', runId: bound.runId, workspaceId: bound.start.workspaceId,
      runBindingSha256: binding, keyword: verified.capture.keyword, captureId: verified.capture.captureId,
      specDigest: verified.capture.specDigest, snapshotPath: SNAPSHOT_PATH, manifestPath: MANIFEST_PATH, sourceContextPath: CONTEXT_PATH,
    };
    if (!validateDescriptor(descriptor)) throw new MetricCaptureRejection('CAPTURE_INTEGRITY_FAILED', DESCRIPTOR_PATH);
    const family = `metric-capture-${bound.runId}`;
    const provenanceBasis = 'Exact sanitized results-page capture supplied by the owner; the capture gate, page scope and snapshot digest were checked, but provider authenticity and market completeness are not independently established.';
    const context = {
      contractVersion: 'automation-metric-capture-context-v1', request: input, provenance: METRIC_CAPTURE_SOURCE_LABEL,
      capture: verified.capture, snapshotSha256: hash(snapshotBytes), manifestSha256: hash(manifestBytes),
      truncation: verified.capture.truncation,
    };
    const documents = [
      { path: SNAPSHOT_PATH, bytes: snapshotBytes, mediaType: 'application/json', representationRole: 'primary' as const, providerProvenance: 'provider_reported' as const, basis: provenanceBasis },
      { path: MANIFEST_PATH, bytes: manifestBytes, mediaType: 'application/json', representationRole: 'derived' as const, providerProvenance: 'provider_reported' as const, basis: provenanceBasis },
      { path: CONTEXT_PATH, bytes: json(context), mediaType: 'application/json', representationRole: 'derived' as const, providerProvenance: 'operator_supplied_unverified' as const, basis: 'Server-authored run binding and capture metadata; not a replacement for page evidence.' },
      { path: DESCRIPTOR_PATH, bytes: json(descriptor), mediaType: 'application/json', representationRole: 'derived' as const, providerProvenance: 'operator_supplied_unverified' as const, basis: 'Server-authored run binding; not provider evidence.' },
    ];
    const request: SourcePackageIntakeRequest = {
      contractVersion: '1.0.0', packageKey: packageKey(bound.runId, input.requestKey), version: 1,
      sourceAcquiredAt: verified.snapshot.capturedAt, sourceLabel: METRIC_CAPTURE_SOURCE_LABEL,
      files: documents.map(file => ({ path: file.path, sha256: hash(file.bytes), byteSize: file.bytes.length, mediaType: file.mediaType,
        evidenceFamily: family, representationRole: file.representationRole, independence: 'non_independent' as const,
        providerProvenance: file.providerProvenance, provenanceBasis: file.basis,
        ...(file.path === SNAPSHOT_PATH ? { period: { start: `${verified.capture.measurementPeriod.startDate}T00:00:00.000Z`, end: `${verified.capture.measurementPeriod.endDate}T23:59:59.999Z` } } : {}) })) as SourcePackageIntakeRequest['files'],
    };
    return this.artifacts.withOwnership(async () => {
      const stored = await this.#packages.intakeAutomationAttachment(request, new Map(documents.map(file => [file.path, file.bytes])), binding,
        { maxFileBytes: MAX_METRIC_CAPTURE_BYTES, maxTotalBytes: MAX_METRIC_CAPTURE_TOTAL_BYTES + 128 * 1024 });
      const read = await this.#packages.readVerified(stored.packageId, { maxFileBytes: MAX_METRIC_CAPTURE_BYTES, maxTotalBytes: MAX_METRIC_CAPTURE_TOTAL_BYTES + 128 * 1024 });
      const origin = await this.#packages.readAutomationAttachmentOrigin(stored.packageId);
      if (!origin || origin.bindingSha256 !== binding || origin.manifestArtifactSha256 !== read.manifestArtifactSha256)
        throw new MetricCaptureRejection('CAPTURE_INTEGRITY_FAILED', 'stored package origin');
      for (const digest of new Set([read.manifestArtifactSha256, ...read.files.map(file => file.sha256)])) await this.artifacts.publishOwned(digest);
      return {
        contractVersion: 'automation-metric-capture-prepared-v1', requestKey: input.requestKey, packageId: stored.packageId,
        state: 'PREPARED_NOT_ADMITTED', exactRetry: stored.deduplicated, recordCount: verified.snapshot.groups.W12_topProducts && !('absent' in verified.snapshot.groups.W12_topProducts) ? verified.snapshot.groups.W12_topProducts.rows.length : 0,
        sourceLabel: METRIC_CAPTURE_SOURCE_LABEL, capture: verified.capture, provenance: METRIC_CAPTURE_PROVENANCE,
      };
    });
  }
}

export function packageKey(runId: string, requestKey: string): string { return `automation-metric-capture:${runId}-${requestKey}`; }
export { SNAPSHOT_PATH, MANIFEST_PATH, CONTEXT_PATH, DESCRIPTOR_PATH };
