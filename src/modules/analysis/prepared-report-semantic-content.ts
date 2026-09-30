import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import contentSchema from '../../../contracts/analysis/prepared-report-semantic-content.schema.json' with { type: 'json' };
import type { PreparedReportSemanticContent } from '../../../contracts/analysis/prepared-report-semantic-content.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import { buildReportSemanticContent } from './report-semantic-content.js';
import type { VerifiedMetricInputPreparation } from './metric-input-preparation-service.js';
import type { MetricPreparationReadinessResult } from '../../../contracts/analysis/metric-preparation-readiness-result.generated.js';
import type { VerifiedSectionArtifactRetention } from './section-artifact-retention-ledger.js';

type SemanticPayload = Omit<PreparedReportSemanticContent, 'semanticVersionId'>;

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateContent = ajv.compile<PreparedReportSemanticContent>(contentSchema);

const DIGEST = /^[0-9a-f]{64}$/;
const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const artifactBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const identity = (value: unknown): string => digest(Buffer.from(canonicalJson(value), 'utf8'));

function assertDigest(value: string, label: string): void {
  if (!DIGEST.test(value)) throw new TypeError(`prepared semantic content: ${label}_INVALID_DIGEST`);
}

/**
 * Builds the immutable meaning-bearing identity of one prepared-report draft.
 * It reuses {@link buildReportSemanticContent}'s exact source/calculation
 * verification and binds it to the exact A30 preparation, A31 readiness and
 * A37 retained M03 identities that produced this bundle, plus the assembly
 * snapshot identity. Final assembled HTML bytes, version/report IDs, timestamps
 * and human decisions remain outside this identity; retained M03 HTML is bound
 * explicitly through its artifact digest.
 */
export function buildPreparedReportSemanticContent(input: {
  readonly bundle: SourceBackedReportBundle;
  readonly preparation: VerifiedMetricInputPreparation;
  readonly readiness: MetricPreparationReadinessResult;
  readonly retainedM03: VerifiedSectionArtifactRetention;
  readonly assemblySha256: string;
  readonly descriptiveMethodsSha256?: string;
}): {
  readonly content: PreparedReportSemanticContent;
  readonly contentBytes: Buffer;
} {
  const { bundle, preparation, readiness, retainedM03, assemblySha256, descriptiveMethodsSha256 } = input;
  assertDigest(assemblySha256, 'ASSEMBLY_SHA256');

  if (
    preparation.result.workspace.workspaceId !== bundle.envelope.workspace.workspaceId ||
    preparation.result.workspace.snapshotSha256 !== bundle.envelope.workspace.snapshotSha256
  ) throw new TypeError('prepared semantic content: PREPARATION_WORKSPACE_MISMATCH');
  if (
    preparation.result.sourcePackage.packageId !== bundle.envelope.sourcePackage.packageId ||
    preparation.result.sourcePackage.manifestArtifactSha256 !== bundle.envelope.sourcePackage.manifestArtifactSha256 ||
    preparation.result.sourcePackage.packageContentSha256 !== bundle.envelope.sourcePackage.packageContentSha256
  ) throw new TypeError('prepared semantic content: PREPARATION_SOURCE_PACKAGE_MISMATCH');
  if (
    preparation.result.request.workbookPath !== bundle.envelope.request.workbookPath ||
    preparation.result.request.manifestPath !== bundle.envelope.request.manifestPath ||
    preparation.result.request.labelsPath !== bundle.envelope.request.labelsPath
  ) throw new TypeError('prepared semantic content: PREPARATION_SOURCE_SELECTION_MISMATCH');
  if (preparation.result.normalizedInput.artifactSha256 !== bundle.envelope.artifacts.normalizedInputSha256) {
    throw new TypeError('prepared semantic content: PREPARATION_NORMALIZED_INPUT_MISMATCH');
  }
  if (canonicalJson(preparation.input) !== canonicalJson(bundle.input)) {
    throw new TypeError('prepared semantic content: PREPARATION_INPUT_REPLAY_MISMATCH');
  }
  if (readiness.preparationSha256 !== preparation.result.preparationSha256) {
    throw new TypeError('prepared semantic content: READINESS_PREPARATION_MISMATCH');
  }
  if (readiness.catalog.sha256 !== bundle.envelope.artifacts.catalogSha256) {
    throw new TypeError('prepared semantic content: READINESS_CATALOG_MISMATCH');
  }
  if (retainedM03.metricSet.preparation.preparationSha256 !== preparation.result.preparationSha256) {
    throw new TypeError('prepared semantic content: RETAINED_M03_PREPARATION_MISMATCH');
  }

  const inner = buildReportSemanticContent(bundle);

  const payload: SemanticPayload = {
    contractVersion: 'prepared-report-v1',
    policyVersion: 'prepared-report-semantic-content-v1',
    ...(descriptiveMethodsSha256 === undefined ? {} : { descriptiveMethodsSha256 }),
    sourceLayer: inner.content.sourceLayer,
    calculationLayer: inner.content.calculationLayer,
    preparationLayer: {
      preparationSha256: preparation.result.preparationSha256,
      workspaceId: preparation.result.workspace.workspaceId,
      sourcePackageId: preparation.result.sourcePackage.packageId,
      sourcePackageManifestSha256: preparation.result.sourcePackage.manifestArtifactSha256,
      packageContentSha256: preparation.result.sourcePackage.packageContentSha256,
      normalizedInputSha256: preparation.result.normalizedInput.artifactSha256,
      normalizedInputValueSha256: preparation.result.normalizedInput.valueSha256,
      normalizationReceiptSha256: preparation.result.normalizationReceiptSha256,
    },
    readinessLayer: {
      readinessSha256: readiness.readinessSha256,
      readinessProfile: readiness.readinessProfile,
      catalogId: readiness.catalog.catalogId,
      catalogVersion: readiness.catalog.catalogVersion,
      catalogSha256: readiness.catalog.sha256,
      totalSections: readiness.summary.totalSections,
      readyToCalculate: readiness.summary.readyToCalculate,
      blocked: readiness.summary.blocked,
      invalid: readiness.summary.invalid,
    },
    retainedSectionLayer: {
      sectionId: 'M03',
      sectionArtifactSha256: retainedM03.record.sectionArtifactSha256,
      preparationSha256: retainedM03.record.dependencies.preparationSha256,
      metricSetSha256: retainedM03.record.dependencies.metricSetSha256,
      chartBundleSha256: retainedM03.record.dependencies.chartBundleSha256,
      envelopeSha256: retainedM03.record.dependencies.envelopeSha256,
      narrativeSha256: retainedM03.record.dependencies.narrativeSha256,
      htmlSha256: retainedM03.record.members.html.artifactSha256,
    },
    assemblyLayer: { assemblySha256 },
    interpretationLayer: { state: 'NONE', artifacts: [] },
    limitations: [
      'SEMANTIC_ID_BINDS_SOURCE_CALCULATION_PREPARATION_READINESS_AND_ASSEMBLY_LAYERS',
      'NO_AI_INTERPRETATION_ARTIFACT_IS_INCLUDED',
      'HUMAN_REVIEW_STATE_IS_SEPARATE_AND_UNREVIEWED',
      'PROVIDER_AUTHENTICITY_AND_MARKET_COMPLETENESS_ARE_NOT_ESTABLISHED',
      'M08_SUPPLEMENTAL_READINESS_MAY_DIFFER_FROM_DELIVERED_BOUNDED_OUTPUT',
    ],
  };
  const semanticVersionId = identity(payload);
  const content: PreparedReportSemanticContent = { ...payload, semanticVersionId };
  if (!validateContent(content)) throw new TypeError(`prepared semantic content: INVALID_OUTPUT_CONTRACT ${ajv.errorsText(validateContent.errors)}`);
  return { content, contentBytes: artifactBytes(content) };
}
