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
const artifactBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const identity = (value: unknown): string => digest(Buffer.from(canonicalJson(value), 'utf8'));

function requiredFile(bundle: SourceBackedReportBundle, name: string): Buffer {
  const value = bundle.files.get(name);
  if (!value) throw new TypeError(`semantic content: MISSING_${name.toUpperCase().replaceAll(/[^A-Z0-9]+/g, '_')}`);
  return value;
}

function assertDigest(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new TypeError(`semantic content: ${label}_DIGEST_MISMATCH`);
}

function assertCanonicalBytes(actual: Buffer, value: unknown, label: string): void {
  if (!actual.equals(artifactBytes(value))) throw new TypeError(`semantic content: ${label}_OBJECT_BYTES_MISMATCH`);
}

function assertJsonMeaning(actual: Buffer, value: unknown, label: string): void {
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(actual)); }
  catch { throw new TypeError(`semantic content: ${label}_INVALID_JSON_UTF8`); }
  if (canonicalJson(parsed) !== canonicalJson(value)) {
    throw new TypeError(`semantic content: ${label}_OBJECT_BYTES_MISMATCH`);
  }
}

function sourceEvidenceProjection(bundle: SourceBackedReportBundle, catalogContentSha256: string): unknown {
  const { artifacts, ...envelope } = bundle.envelope;
  const { catalogSha256: _catalogSha256, ...request } = envelope.request;
  return {
    ...envelope,
    request: { ...request, catalogContentSha256 },
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

function normalizedLineageDigests(
  value: unknown,
  exactResultSha256: string,
  resultContentSha256: string,
  exactCatalogSha256: string,
  catalogContentSha256: string,
): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizedLineageDigests(
      item, exactResultSha256, resultContentSha256, exactCatalogSha256, catalogContentSha256,
    ));
  }
  if (value === null || typeof value !== 'object') return value;
  const normalized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === 'resultSha256') {
      if (item !== exactResultSha256) throw new TypeError('semantic content: CHART_RESULT_LINEAGE_MISMATCH');
      normalized.resultContentSha256 = resultContentSha256;
    } else if (key === 'catalogSha256') {
      if (item !== exactCatalogSha256) throw new TypeError('semantic content: CHART_CATALOG_LINEAGE_MISMATCH');
      normalized.catalogContentSha256 = catalogContentSha256;
    } else {
      normalized[key] = normalizedLineageDigests(
        item, exactResultSha256, resultContentSha256, exactCatalogSha256, catalogContentSha256,
      );
    }
  }
  return normalized;
}

function chartContentProjection(
  bundle: SourceBackedReportBundle,
  resultContentSha256: string,
  catalogContentSha256: string,
): unknown {
  const { approvalState: _approvalState, computation, ...chart } = bundle.charts;
  const { rendererVersion: _rendererVersion, ...calculation } = computation;
  return normalizedLineageDigests(
    { ...chart, computation: calculation },
    bundle.packet.metricResultSha256,
    resultContentSha256,
    bundle.packet.catalogSha256,
    catalogContentSha256,
  );
}

function semanticSections(bundle: SourceBackedReportBundle): ReportSemanticContent['calculationLayer']['sections'] {
  return bundle.packet.sections.map(section => {
    const definition = bundle.packet.catalog.sections.find(item => item.sectionId === section.sectionId);
    if (!definition) throw new TypeError('semantic content: SECTION_DEFINITION_MISSING');
    const claims = section.claimIds.map(claimId => {
      const claim = bundle.packet.claims.find(item => item.claimId === claimId);
      if (!claim) throw new TypeError('semantic content: SECTION_CLAIM_MISSING');
      return claim;
    });
    const sectionContent = {
      definition,
      deliveryState: section.deliveryState,
      claimIds: section.claimIds,
      contextPointers: section.contextPointers,
      blockers: section.blockers,
      claims,
    };
    return {
      sectionId: section.sectionId,
      sectionContentSha256: identity(sectionContent),
      deliveryState: section.deliveryState,
    };
  });
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
  assertJsonMeaning(catalogBytes, bundle.packet.catalog, 'CATALOG');
  assertDigest(bundle.packet.metricResultSha256, bundle.charts.resultSha256, 'RESULT_CHART_BINDING');
  assertDigest(bundle.packet.catalogSha256, bundle.charts.catalogSha256, 'CATALOG_CHART_BINDING');
  for (const section of bundle.packet.sections) {
    if (section.methodArtifact === undefined) continue;
    const methodBytes = requiredFile(bundle, section.methodArtifact.fileName);
    assertDigest(digest(methodBytes), section.methodArtifact.sha256, 'SECTION_METHOD_ARTIFACT');
    let methodOutput: unknown;
    try { methodOutput = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(methodBytes)); }
    catch { throw new TypeError('semantic content: SECTION_METHOD_ARTIFACT_INVALID_JSON_UTF8'); }
    if (methodOutput === null || typeof methodOutput !== 'object' ||
        (methodOutput as { methodOutputId?: unknown }).methodOutputId !== section.methodArtifact.methodOutputId) {
      throw new TypeError('semantic content: SECTION_METHOD_OUTPUT_ID_MISMATCH');
    }
  }

  const selectedSourceSha256s = [...new Set(bundle.envelope.selectedSources.map(source => source.sha256))].sort();
  if (selectedSourceSha256s.length < 2) throw new TypeError('semantic content: INSUFFICIENT_SOURCE_MEMBERSHIP');
  const resultContentSha256 = identity(resultContentProjection(bundle));
  const catalogContentSha256 = identity(bundle.packet.catalog);
  const payload: SemanticPayload = {
    contractVersion: '1.0.0',
    policyVersion: 'report-semantic-content-v1',
    sourceLayer: {
      workspaceId: bundle.envelope.workspace.workspaceId,
      sourceEvidenceSha256: identity(sourceEvidenceProjection(bundle, catalogContentSha256)),
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
      metricResultContentSha256: resultContentSha256,
      catalogContentSha256,
      claimsSha256: identity(bundle.packet.claims),
      chartContentSha256: identity(chartContentProjection(bundle, resultContentSha256, catalogContentSha256)),
      sections: semanticSections(bundle),
    },
    interpretationLayer: { state: 'NONE', artifacts: [] },
    limitations: [
      'SEMANTIC_ID_BINDS_SOURCE_AND_CALCULATION_LAYERS_ONLY',
      'NO_AI_INTERPRETATION_ARTIFACT_IS_INCLUDED',
      'HUMAN_REVIEW_STATE_IS_SEPARATE_AND_UNREVIEWED',
      'PROVIDER_AUTHENTICITY_AND_MARKET_COMPLETENESS_ARE_NOT_ESTABLISHED',
    ],
  };
  const semanticVersionId = identity(payload);
  const content: ReportSemanticContent = { ...payload, semanticVersionId };
  if (!validateContent(content)) throw new TypeError('semantic content: INVALID_OUTPUT_CONTRACT');
  return { content, contentBytes: artifactBytes(content) };
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
  return { state, stateBytes: artifactBytes(state) };
}
