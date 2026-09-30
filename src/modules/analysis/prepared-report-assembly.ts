import { createRequire } from 'node:module';
import requestSchema from '../../../contracts/analysis/prepared-report-create-request.schema.json' with { type: 'json' };
import sourceRequestSchema from '../../../contracts/analysis/source-backed-report-request.schema.json' with { type: 'json' };
import type { PreparedReportCreateRequest } from '../../../contracts/analysis/prepared-report-create-request.generated.js';
import type { MetricPreparationReadinessResult } from '../../../contracts/analysis/metric-preparation-readiness-result.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import {
  buildSourceBackedReport,
  type SourceBackedReportBundle,
  type SourceBackedReportDependencies,
} from './source-backed-report.js';
import type { MetricInputPreparationReader, VerifiedMetricInputPreparation } from './metric-input-preparation-service.js';
import { MetricPreparationReadinessService } from './metric-preparation-readiness.js';
import type { VerifiedSectionArtifactRetention } from './section-artifact-retention-ledger.js';
import { buildPreparedReportSemanticContent } from './prepared-report-semantic-content.js';
import { buildUnreviewedReportState } from './report-semantic-content.js';
import { buildReportAssemblySnapshot } from './report-assembly-snapshot.js';
import { renderReportAssemblyHtml } from './report-assembly-html.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(sourceRequestSchema);
const validateRequest = ajv.compile<PreparedReportCreateRequest>(requestSchema);

export class PreparedReportAssemblyValidationError extends Error {}
export class PreparedReportAssemblyIntegrityError extends Error {}

export interface SectionArtifactRetentionReader {
  read(sectionArtifactSha256: string): Promise<VerifiedSectionArtifactRetention>;
}

export interface PreparedReportAssemblyDependencies extends SourceBackedReportDependencies {
  readonly preparations: MetricInputPreparationReader;
  readonly sectionArtifacts: SectionArtifactRetentionReader;
}

type AssembledSnapshot = ReturnType<typeof buildReportAssemblySnapshot>;

export interface PreparedReportAssembly {
  readonly request: PreparedReportCreateRequest;
  readonly bundle: SourceBackedReportBundle;
  readonly preparation: VerifiedMetricInputPreparation;
  readonly readiness: MetricPreparationReadinessResult;
  readonly retainedM03: VerifiedSectionArtifactRetention;
  readonly assemblySnapshot: AssembledSnapshot['snapshot'];
  readonly assemblyBytes: Buffer;
  readonly assemblyHtml: string;
  readonly semanticVersionId: string;
  readonly semanticContentBytes: Buffer;
}

export function preparedReportRequestSnapshot(untrusted: unknown): PreparedReportCreateRequest {
  if (!validateRequest(untrusted)) {
    throw new PreparedReportAssemblyValidationError(`Invalid prepared report request: ${ajv.errorsText(validateRequest.errors)}`);
  }
  return JSON.parse(canonicalJson(untrusted)) as PreparedReportCreateRequest;
}

/**
 * Replays A30 preparation, recomputes and verifies A31 readiness, replays the
 * exact retained A37 M03 artifact, and reuses {@link buildSourceBackedReport}
 * for the remaining six bounded tracks (M02, M04 via charts, M08/P4, M13,
 * I03, I17). It rejects any workspace, source-package, normalized-input,
 * catalog, readiness or M03 identity drift before an A10 version may be
 * created from the result. This is a pure builder: readers perform their own
 * verified reads, but this function has no database, provider, clock,
 * random-ID or publication side effects of its own.
 */
export async function buildPreparedReportAssembly(
  untrustedRequest: unknown,
  catalogBytes: Buffer,
  dependencies: PreparedReportAssemblyDependencies,
): Promise<PreparedReportAssembly> {
  const request = preparedReportRequestSnapshot(untrustedRequest);

  const preparation = await dependencies.preparations.readVerified(request.preparationSha256);
  if (preparation.result.preparationSha256 !== request.preparationSha256) {
    throw new PreparedReportAssemblyIntegrityError('Preparation reader returned a different identity');
  }
  if (
    preparation.result.request.workbookPath !== request.sourceRequest.workbookPath ||
    preparation.result.request.manifestPath !== request.sourceRequest.manifestPath ||
    preparation.result.request.labelsPath !== request.sourceRequest.labelsPath
  ) throw new PreparedReportAssemblyIntegrityError('Source selection paths do not match the pinned preparation');

  const readiness = await new MetricPreparationReadinessService(dependencies.preparations)
    .evaluate(request.preparationSha256, catalogBytes, request.sourceRequest.catalogSha256);
  if (readiness.readinessSha256 !== request.readinessSha256) {
    throw new PreparedReportAssemblyValidationError('Recomputed A31 readiness does not match the requested readinessSha256');
  }

  const retainedM03 = await dependencies.sectionArtifacts.read(request.sectionArtifactSha256);
  if (retainedM03.record.sectionArtifactSha256 !== request.sectionArtifactSha256) {
    throw new PreparedReportAssemblyIntegrityError('Section artifact reader returned a different identity');
  }
  if (retainedM03.metricSet.preparation.preparationSha256 !== request.preparationSha256) {
    throw new PreparedReportAssemblyValidationError('Retained M03 artifact was not built from the requested preparation');
  }

  const bundle = await buildSourceBackedReport(request.sourceRequest, catalogBytes, dependencies);
  if (
    preparation.result.workspace.workspaceId !== bundle.envelope.workspace.workspaceId ||
    preparation.result.workspace.snapshotSha256 !== bundle.envelope.workspace.snapshotSha256
  ) throw new PreparedReportAssemblyIntegrityError('Source-backed bundle workspace does not match the pinned preparation');
  if (
    preparation.result.sourcePackage.packageId !== bundle.envelope.sourcePackage.packageId ||
    preparation.result.sourcePackage.manifestArtifactSha256 !== bundle.envelope.sourcePackage.manifestArtifactSha256 ||
    preparation.result.sourcePackage.packageContentSha256 !== bundle.envelope.sourcePackage.packageContentSha256
  ) throw new PreparedReportAssemblyIntegrityError('Source-backed bundle source package does not match the pinned preparation');
  if (preparation.result.normalizedInput.artifactSha256 !== bundle.envelope.artifacts.normalizedInputSha256) {
    throw new PreparedReportAssemblyIntegrityError('Source-backed bundle normalized input does not match the pinned preparation');
  }
  if (canonicalJson(preparation.input) !== canonicalJson(bundle.input)) {
    throw new PreparedReportAssemblyIntegrityError('Source-backed bundle does not replay the pinned preparation input exactly');
  }
  if (bundle.envelope.artifacts.catalogSha256 !== request.sourceRequest.catalogSha256) {
    throw new PreparedReportAssemblyIntegrityError('Source-backed bundle catalog does not match the requested catalog');
  }

  const assembled = buildReportAssemblySnapshot({ bundle, preparation, readiness, retainedM03 });

  const semantic = buildPreparedReportSemanticContent({
    bundle, preparation, readiness, retainedM03, assemblySha256: assembled.snapshot.assemblySha256,
  });

  const renderFiles = new Map(bundle.files);
  renderFiles.set('semantic-content.json', semantic.contentBytes);
  renderFiles.set('review-state.json', buildUnreviewedReportState(semantic.content.semanticVersionId).stateBytes);
  const assemblyHtml = renderReportAssemblyHtml({
    bundle: { ...bundle, files: renderFiles },
    snapshot: assembled.snapshot, retainedM03, semanticVersionId: semantic.content.semanticVersionId,
  });

  return {
    request, bundle, preparation, readiness, retainedM03,
    assemblySnapshot: assembled.snapshot, assemblyBytes: assembled.bytes, assemblyHtml,
    semanticVersionId: semantic.content.semanticVersionId, semanticContentBytes: semantic.contentBytes,
  };
}
