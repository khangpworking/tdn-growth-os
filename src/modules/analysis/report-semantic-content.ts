import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import reviewSchema from '../../../contracts/analysis/report-review-state.schema.json' with { type: 'json' };
import contentSchema from '../../../contracts/analysis/report-semantic-content.schema.json' with { type: 'json' };
import type { ReportReviewState } from '../../../contracts/analysis/report-review-state.generated.js';
import type { ReportSemanticContent } from '../../../contracts/analysis/report-semantic-content.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';

type SemanticPayload = Omit<ReportSemanticContent, 'semanticVersionId'>;

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateContent = ajv.compile<ReportSemanticContent>(contentSchema);
const validateReview = ajv.compile<ReportReviewState>(reviewSchema);

const digest = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const bytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

function requiredFile(bundle: SourceBackedReportBundle, name: string): Buffer {
  const value = bundle.files.get(name);
  if (!value) throw new TypeError(`semantic content: MISSING_${name.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}`);
  return value;
}

function assertDigest(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new TypeError(`semantic content: ${label}_DIGEST_MISMATCH`);
}

function assertCanonicalBytes(actual: Buffer, value: unknown, label: string): void {
  if (!actual.equals(bytes(value))) throw new TypeError(`semantic content: ${label}_OBJECT_BYTES_MISMATCH`);
}

function sourceEvidenceProjection(bundle: SourceBackedReportBundle): unknown {
  const { artifacts, ...envelope } = bundle.envelope;
  return {
    ...envelope,
    artifacts: {
      workspaceSnapshotSha256: artifacts.workspaceSnapshotSha256,
      sourcePackageManifestSha256: artifacts.sourcePackageManifestSha256,
      normalizedInputSha256: artifacts.normalizedInputSha256,
      receiptSha256: artifacts.receiptSha256,
    },
  };
}

function resultContentProjection(bundle: SourceBackedReportBundle): unknown {
  const { rendererVersion: _rendererVersion, ...content } = bundle.result;
  return content;
}

function chartContentProjection(bundle: SourceBackedReportBundle): unknown {
  const { approvalState: _approvalState, computation, ...chart } = bundle.charts;
  const { rendererVersion: _rendererVersion, ...calculation } = computation;
  return { ...chart, computation: calculation };
}

/**
 * Builds the immutable meaning-bearing identity of one report draft. Renderer
 * bytes and human decisions deliberately remain outside this identity.
 */
export function buildReportSemanticContent(bundle: SourceBackedReportBundle): {
  readonly content: ReportSemanticContent;
  readonly contentBytes: Buffer;
} {
  const packetBytes = requiredFile(bundle, 'packet.json');
  const inputBytes = requiredFile(bundle, 'normalized-input.json');
  const resultBytes = requiredFile(bundle, 'metric-result.json');
  const chartBytes = requiredFile(bundle, 'charts.json');
  const catalogBytes = requiredFile(bundle, 'section-catalog.json');
  assertDigest(digest(packetBytes), bundle.envelope.artifacts.packetSha256, 'PACKET');
  assertDigest(digest(inputBytes), bundle.envelope.artifacts.normalizedInputSha256, 'NORMALIZED_INPUT');
  assertDigest(digest(resultBytes), bundle.envelope.artifacts.metricResultSha256, 'METRIC_RESULT');
  assertDigest(digest(chartBytes), bundle.envelope.artifacts.chartSha256, 'CHART');
  assertDigest(digest(catalogBytes), bundle.packet.catalogSha256, 'CATALOG');
  assertCanonicalBytes(bundle.envelopeBytes, bundle.envelope, 'ENVELOPE');
  assertCanonicalBytes(packetBytes, bundle.packet, 'PACKET');
  assertCanonicalBytes(inputBytes, bundle.input, 'NORMALIZED_INPUT');
  assertCanonicalBytes(resultBytes, bundle.result, 'METRIC_RESULT');
  assertCanonicalBytes(chartBytes, bundle.charts, 'CHART');
  assertCanonicalBytes(catalogBytes, bundle.packet.catalog, 'CATALOG');
  assertDigest(bundle.packet.metricResultSha256, bundle.charts.resultSha256, 'RESULT_CHART_BINDING');
  assertDigest(bundle.packet.catalogSha256, bundle.charts.catalogSha256, 'CATALOG_CHART_BINDING');

  const selectedSourceSha256s = [...new Set(bundle.envelope.selectedSources.map(source => source.sha256))].sort();
  if (selectedSourceSha256s.length < 2) throw new TypeError('semantic content: INSUFFICIENT_SOURCE_MEMBERSHIP');
  const payload: SemanticPayload = {
    contractVersion: '1.0.0',
    policyVersion: 'report-semantic-content-v1',
    sourceLayer: {
      workspaceId: bundle.envelope.workspace.workspaceId,
      sourceEvidenceSha256: digest(bytes(sourceEvidenceProjection(bundle))),
      sourcePackageId: bundle.envelope.sourcePackage.packageId,
      sourcePackageManifestSha256: bundle.envelope.sourcePackage.manifestArtifactSha256,
      packageContentSha256: bundle.envelope.sourcePackage.packageContentSha256,
      selectedSourceSha256s,
    },
    calculationLayer: {
      packetPolicyVersion: bundle.packet.policyVersion,
      metricMethodVersion: bundle.packet.metricMethodVersion,
      metricRounding: bundle.packet.metricRounding,
      normalizedInputSha256: digest(inputBytes),
      metricResultContentSha256: digest(bytes(resultContentProjection(bundle))),
      catalogSha256: bundle.packet.catalogSha256,
      claimsSha256: digest(bytes(bundle.packet.claims)),
      chartContentSha256: digest(bytes(chartContentProjection(bundle))),
      sections: bundle.packet.sections.map(section => ({
        sectionId: section.sectionId,
        sectionSha256: section.sectionSha256,
        deliveryState: section.deliveryState,
      })),
    },
    interpretationLayer: { state: 'NONE', artifacts: [] },
    limitations: [
      'SEMANTIC_ID_BINDS_SOURCE_AND_CALCULATION_LAYERS_ONLY',
      'NO_AI_INTERPRETATION_ARTIFACT_IS_INCLUDED',
      'HUMAN_REVIEW_STATE_IS_SEPARATE_AND_UNREVIEWED',
      'PROVIDER_AUTHENTICITY_AND_MARKET_COMPLETENESS_ARE_NOT_ESTABLISHED',
    ],
  };
  const semanticVersionId = digest(bytes(payload));
  const content: ReportSemanticContent = { ...payload, semanticVersionId };
  if (!validateContent(content)) throw new TypeError('semantic content: INVALID_OUTPUT_CONTRACT');
  return { content, contentBytes: bytes(content) };
}

/** A separate layer-four snapshot; it cannot alter the semantic content ID. */
export function buildUnreviewedReportState(semanticVersionId: string): {
  readonly state: ReportReviewState;
  readonly stateBytes: Buffer;
} {
  if (!/^[0-9a-f]{64}$/.test(semanticVersionId)) throw new TypeError('review state: INVALID_SEMANTIC_VERSION_ID');
  const state: ReportReviewState = {
    contractVersion: '1.0.0',
    semanticVersionId,
    state: 'UNREVIEWED',
    decisionArtifacts: [],
    limitations: [
      'NO_HUMAN_DECISION_RECORDED',
      'FRAMEWORK_APPROVAL_DOES_NOT_APPROVE_THIS_REPORT_CONTENT',
    ],
  };
  if (!validateReview(state)) throw new TypeError('review state: INVALID_OUTPUT_CONTRACT');
  return { state, stateBytes: bytes(state) };
}
