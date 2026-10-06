import { createHash } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { ResearchAutomationMetricPrepareRequest, ResearchAutomationMetricPrepareReceipt } from '../../../../contracts/api/research-automation-metric-intake-api.generated.js';
import type { MetricSourceManifest } from '../../../../contracts/analysis/metric-source-manifest.generated.js';
import type { AutomationMetricSourceV2 } from '../../../../contracts/analysis/automation-metric-source-v2.generated.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import { SourcePackageService } from '../../foundation/source-package-service.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { inspectMetricWorkbookProfile, normalizeMetricWorkbookInput } from '../metric-source-profile.js';
import type { ScopeSnapshot, StartSnapshot } from './model.js';

export const MAX_METRIC_UPLOAD_BYTES = 32 * 1024 * 1024;
export const METRIC_UPLOAD_DECLARATION = 'Operator declarations, not authenticated provider metadata. Upload time is storage time, not evidence acquisition time.';
const hash = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(canonicalJson(value));

/** Prepared storage only. Admission belongs to scope confirmation or an explicit supplemental attempt. */
export class AutomationMetricSourceIntake {
  readonly #packages: SourcePackageService;
  constructor(private readonly artifacts: RequestScopedArtifactStore, db: Database.Database, now: () => Date) {
    this.#packages = new SourcePackageService({ db, artifactStore: artifacts, now });
  }

  hasRequest(runId: string, requestKey: string): boolean {
    return this.#packages.findFinalizedSourcePackagesByKey(packageKey(runId, requestKey)).length > 0;
  }

  async prepare(input: ResearchAutomationMetricPrepareRequest, workbook: Buffer, bound: { runId: string; start: StartSnapshot; scope: ScopeSnapshot }): Promise<ResearchAutomationMetricPrepareReceipt> {
    const observed = inspectMetricWorkbookProfile(workbook);
    const family = `metric-upload-${bound.runId}`;
    const provenanceBasis = 'Operator-supplied exact workbook. Declared period, filters and precision are unverified; not provider collection or an independent evidence family.';
    const manifest: MetricSourceManifest = {
      contractVersion: '1.0.0', profileId: observed.profileId, profileVersion: observed.profileVersion,
      source: { sha256: hash(workbook), label: input.sourceLabel, provenanceBasis, evidenceFamily: family,
        sheetName: 'Sheet1', headerSha256: observed.headerSha256, lastRow: observed.lastRow },
      scope: { key: 'operator-shopee-export', platform: 'shopee', selection: input.selection,
        start: input.measurementPeriod.startDate, end: input.measurementPeriod.endDate,
        periodBasis: input.measurementPeriod.basis, acquiredAt: input.acquiredAt },
      precision: input.precision, labelCodebookVersion: 'unassigned-v1', wideUnknownPolicy: 'exclude',
    };
    // Exact structural validation without preparation rows, labels or calculation.
    normalizeMetricWorkbookInput(workbook, json(manifest));
    const binding = hash(json(bound));
    const descriptor: AutomationMetricSourceV2 = { contractVersion: 'automation-metric-source-v2', runId: bound.runId,
      workspaceId: bound.start.workspaceId, runBindingSha256: binding, keyword: bound.start.keyword,
      workbookPath: 'metric/export.xlsx', manifestPath: 'metric/manifest.json', sourceContextPath: 'metric/context.json', labelsPath: null };
    const documents = [
      { path: descriptor.workbookPath, bytes: workbook, mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', representationRole: 'structured' as const },
      { path: descriptor.manifestPath, bytes: json(manifest), mediaType: 'application/json', representationRole: 'derived' as const },
      { path: descriptor.sourceContextPath, bytes: json({ contractVersion: 'automation-metric-upload-context-v1', request: input,
        declaration: METRIC_UPLOAD_DECLARATION }), mediaType: 'application/json', representationRole: 'derived' as const },
      { path: 'normalized/automation-metric-source.json', bytes: json(descriptor), mediaType: 'application/json', representationRole: 'derived' as const },
    ];
    return this.artifacts.withOwnership(async () => {
      const stored = await this.#packages.intakeAutomationAttachment({ contractVersion: '1.0.0',
        packageKey: packageKey(bound.runId, input.requestKey), version: 1, sourceLabel: input.sourceLabel,
        sourceAcquiredAt: input.acquiredAt,
        files: documents.map(file => ({ path: file.path, sha256: hash(file.bytes), byteSize: file.bytes.length,
          mediaType: file.mediaType, representationRole: file.representationRole, evidenceFamily: family,
          independence: 'non_independent', providerProvenance: 'operator_supplied_unverified', provenanceBasis })) },
      new Map(documents.map(file => [file.path, file.bytes])), binding);
      const verified = await this.#packages.readVerified(stored.packageId, { maxFileBytes: MAX_METRIC_UPLOAD_BYTES, maxTotalBytes: MAX_METRIC_UPLOAD_BYTES + 64 * 1024 });
      const origin = await this.#packages.readAutomationAttachmentOrigin(stored.packageId);
      if (!origin || origin.bindingSha256 !== binding || origin.manifestArtifactSha256 !== verified.manifestArtifactSha256) throw new Error('Prepared origin verification failed');
      // Publish only this exact, verified committed membership; never all staged digests.
      for (const digest of new Set([verified.manifestArtifactSha256, ...verified.files.map(file => file.sha256)])) await this.artifacts.publishOwned(digest);
      return { contractVersion: 'automation-metric-prepared-v1', requestKey: input.requestKey, packageId: stored.packageId,
        state: 'PREPARED_NOT_ADMITTED', exactRetry: stored.deduplicated, recordCount: observed.lastRow - 1,
        sourceLabel: input.sourceLabel, measurementPeriod: input.measurementPeriod, acquiredAt: input.acquiredAt,
        provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' };
    });
  }
}

function packageKey(runId: string, requestKey: string): string { return `automation-upload:${runId}-${requestKey}`; }
