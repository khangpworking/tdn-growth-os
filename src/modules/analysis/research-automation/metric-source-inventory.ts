import { createHash } from 'node:crypto';
import type { ResearchAutomationMetricPrepareRequest, ResearchAutomationPreparedMetricEntry } from '../../../../contracts/api/research-automation-metric-intake-api.generated.js';
import type { MetricSourceManifest } from '../../../../contracts/analysis/metric-source-manifest.generated.js';
import type { AutomationSourcePackageLookup, FinalizedSourcePackageReader, SourceAttachmentOriginReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import type { AutomationMetricMethodBridge } from './metric-method-bridge.js';
import type { StartSnapshot, ScopeSnapshot } from './model.js';
import { MAX_METRIC_UPLOAD_BYTES, METRIC_UPLOAD_DECLARATION } from './metric-source-intake.js';

type SourceReader = AutomationSourcePackageLookup & FinalizedSourcePackageReader & SourceAttachmentOriginReader;
const budget = { maxFileBytes: MAX_METRIC_UPLOAD_BYTES, maxTotalBytes: MAX_METRIC_UPLOAD_BYTES + 64 * 1024 };

/** Reloadable choices only. Reading a prepared source does not admit it or execute its method. */
export async function readPreparedMetricSources(reader: SourceReader, bridge: AutomationMetricMethodBridge,
  bound: { runId: string; start: StartSnapshot }, validate: (value: unknown) => boolean): Promise<ResearchAutomationPreparedMetricEntry[]> {
  const prefix = `automation-upload:${bound.runId}-`;
  const entries = await reader.findAutomationAttachmentPackagesByKeyPrefix(prefix);
  const choices: ResearchAutomationPreparedMetricEntry[] = [];
  for (const entry of entries) {
    const source = await reader.readFinalizedSourcePackage(entry.packageId, budget);
    const contextFile = source.files.find(file => file.path === 'metric/context.json');
    if (!contextFile || contextFile.mediaType !== 'application/json') throw new Error('Prepared source context is missing');
    const context = JSON.parse(contextFile.bytes.toString('utf8')) as Record<string, unknown>;
    if (Object.keys(context).sort().join(',') !== 'contractVersion,declaration,request' ||
        context.contractVersion !== 'automation-metric-upload-context-v1' || context.declaration !== METRIC_UPLOAD_DECLARATION ||
        !validate(context.request) || canonicalJson(context) !== contextFile.bytes.toString('utf8')) throw new Error('Prepared source context is invalid');
    const request = context.request as ResearchAutomationMetricPrepareRequest;
    if (source.manifest.packageKey !== `${prefix}${request.requestKey}` || source.manifest.version !== 1 ||
        source.manifestArtifactSha256 !== entry.manifestArtifactSha256 || source.manifest.sourceLabel !== request.sourceLabel ||
        source.manifest.sourceAcquiredAt !== request.acquiredAt) throw new Error('Prepared source identity differs from its request');
    const scope: ScopeSnapshot = { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId: bound.start.workspaceId,
      runId: bound.runId, ...request.scope };
    const binding = createHash('sha256').update(canonicalJson({ ...bound, scope })).digest('hex');
    const origin = await reader.readAutomationAttachmentOrigin(entry.packageId, budget);
    if (!origin || origin.bindingSha256 !== binding) throw new Error('Prepared source origin differs from this run');
    // v2 verification binds only run/start/scope, not confirmation time. No timestamp is invented for this read.
    await bridge.verifyPreparedSourceMetadata({ ...bound, scope }, entry.packageId);
    const manifestFile = source.files.find(file => file.path === 'metric/manifest.json');
    if (!manifestFile) throw new Error('Prepared source manifest is missing');
    const manifest = JSON.parse(manifestFile.bytes.toString('utf8')) as MetricSourceManifest;
    if (canonicalJson(manifest) !== manifestFile.bytes.toString('utf8') || manifest.source.label !== request.sourceLabel ||
        manifest.scope.start !== request.measurementPeriod.startDate || manifest.scope.end !== request.measurementPeriod.endDate ||
        manifest.scope.periodBasis !== request.measurementPeriod.basis || manifest.scope.selection !== request.selection ||
        manifest.scope.acquiredAt !== request.acquiredAt || canonicalJson(manifest.precision) !== canonicalJson(request.precision))
      throw new Error('Prepared source declarations differ from the retained manifest');
    choices.push({ packageId: entry.packageId, recordCount: manifest.source.lastRow - 1, request, provenance: 'OPERATOR_SUPPLIED_UNVERIFIED' });
  }
  return choices;
}
