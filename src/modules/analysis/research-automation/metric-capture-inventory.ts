import { createHash } from 'node:crypto';
import type { ResearchAutomationMetricCapturePrepareRequest, ResearchAutomationPreparedMetricCaptureList } from '../../../../contracts/api/research-automation-metric-capture-intake-api.generated.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { AutomationSourcePackageLookup, FinalizedSourcePackageReader, SourceAttachmentOriginReader } from '../../foundation/source-package-reader.js';
import type { StartSnapshot, ScopeSnapshot } from './model.js';
import { captureContextScopeLines, CONTEXT_PATH, DESCRIPTOR_PATH, MANIFEST_PATH, MAX_METRIC_CAPTURE_BYTES, MAX_METRIC_CAPTURE_TOTAL_BYTES, METRIC_CAPTURE_CONTEXT_VERSIONS, packageKey, SNAPSHOT_PATH, verifyMetricCaptureArchive } from './metric-capture-intake.js';

type Reader = AutomationSourcePackageLookup & FinalizedSourcePackageReader & SourceAttachmentOriginReader;
const sha = (value: unknown): string => createHash('sha256').update(canonicalJson(value)).digest('hex');
const BUDGET = { maxFileBytes: MAX_METRIC_CAPTURE_BYTES, maxTotalBytes: MAX_METRIC_CAPTURE_TOTAL_BYTES + 128 * 1024 };

/** Read-only projection of capture choices. It never admits, executes or recalculates a source. */
export async function readPreparedMetricCaptureSources(reader: Reader, bound: { runId: string; start: StartSnapshot; scope: ScopeSnapshot }): Promise<ResearchAutomationPreparedMetricCaptureList['sources']> {
  const entries = await reader.findAutomationAttachmentPackagesByKeyPrefix(`automation-metric-capture:${bound.runId}-`);
  const sources: ResearchAutomationPreparedMetricCaptureList['sources'] = [];
  for (const entry of entries) {
    const source = await reader.readFinalizedSourcePackage(entry.packageId, BUDGET);
    const descriptorFile = source.files.find(file => file.path === DESCRIPTOR_PATH);
    const snapshotFile = source.files.find(file => file.path === SNAPSHOT_PATH);
    const manifestFile = source.files.find(file => file.path === MANIFEST_PATH);
    const contextFile = source.files.find(file => file.path === CONTEXT_PATH);
    if (!descriptorFile || !snapshotFile || !manifestFile || !contextFile || source.files.length !== 4)
      throw new Error('Prepared Metric capture package membership is invalid');
    const descriptor = parseServerJson(descriptorFile.bytes, DESCRIPTOR_PATH) as Record<string, unknown>;
    const context = parseServerJson(contextFile.bytes, CONTEXT_PATH) as Record<string, unknown>;
    const request = context.request as ResearchAutomationMetricCapturePrepareRequest | undefined;
    if (descriptor.contractVersion !== 'automation-metric-source-capture-v1' || descriptor.runId !== bound.runId || descriptor.workspaceId !== bound.start.workspaceId ||
        descriptor.runBindingSha256 !== sha({ runId: bound.runId, start: bound.start }) ||
        !METRIC_CAPTURE_CONTEXT_VERSIONS.includes(context.contractVersion as string) || (context.contractVersion !== 'automation-metric-capture-context-v1' && !captureContextScopeLines(context)) || context.provenance !== 'results-page capture' ||
        !request || source.manifest.packageKey !== packageKey(bound.runId, request.requestKey) || source.manifest.sourceLabel !== 'results-page capture' ||
        source.manifest.sourceAcquiredAt !== (parseJson(snapshotFile.bytes, SNAPSHOT_PATH) as { capturedAt?: unknown }).capturedAt ||
        entry.manifestArtifactSha256 !== source.manifestArtifactSha256)
      throw new Error('Prepared Metric capture identity differs from this run');
    const verified = verifyMetricCaptureArchive(snapshotFile.bytes, manifestFile.bytes, { start: bound.start });
    const origin = await reader.readAutomationAttachmentOrigin(entry.packageId, BUDGET);
    if (!origin || origin.bindingSha256 !== descriptor.runBindingSha256 || origin.manifestArtifactSha256 !== source.manifestArtifactSha256)
      throw new Error('Prepared Metric capture origin differs from this run');
    if (context.snapshotSha256 !== shaBytes(snapshotFile.bytes) || context.manifestSha256 !== shaBytes(manifestFile.bytes) ||
        descriptor.captureId !== verified.capture.captureId || descriptor.specDigest !== verified.capture.specDigest)
      throw new Error('Prepared Metric capture context differs from retained bytes');
    sources.push({ packageId: source.packageId, recordCount: verified.manifest.productPagination.rowsRead, request, capture: verified.capture, provenance: 'RESULTS_PAGE_CAPTURE' });
  }
  return sources;
}

function parseJson(bytes: Buffer, locator: string): unknown {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch { throw new Error(`Invalid capture JSON: ${locator}`); }
  return parsed;
}
function parseServerJson(bytes: Buffer, locator: string): unknown {
  const parsed = parseJson(bytes, locator);
  if (canonicalJson(parsed) !== bytes.toString('utf8')) throw new Error(`Non-canonical server JSON: ${locator}`);
  return parsed;
}
function shaBytes(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
