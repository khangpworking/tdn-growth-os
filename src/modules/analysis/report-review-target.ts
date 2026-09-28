import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import reviewTargetSchema from '../../../contracts/analysis/report-review-target.schema.json' with { type: 'json' };
import type { ReportReviewTarget } from '../../../contracts/analysis/report-review-target.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { VerifiedReportInterpretation } from './report-interpretation-ledger.js';
import type { VerifiedReportInterpretationSource } from './report-version-service.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateTarget = ajv.compile<ReportReviewTarget>(reviewTargetSchema);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class ReportReviewTargetValidationError extends Error {}
export class ReportReviewTargetIntegrityError extends Error {}

export interface ReportReviewTargetReportReader {
  readInterpretationSource(reportId: string, version: number): Promise<VerifiedReportInterpretationSource>;
}

export interface ReportReviewTargetInterpretationReader {
  read(reportId: string, version: number, interpretationId: string): Promise<VerifiedReportInterpretation>;
}

export interface BuiltReportReviewTarget {
  readonly target: ReportReviewTarget;
  readonly targetBytes: Buffer;
}

type ReviewTargetPayload = Omit<ReportReviewTarget, 'reviewTargetId'>;

const limitations = Object.freeze([
  'UNAPPROVED_REVIEW_TARGET_NOT_A_HUMAN_DECISION',
  'TARGET_DOES_NOT_TRANSFER_TO_ANOTHER_REPORT_VERSION_INTERPRETATION_SCOPE_USE_OR_RENDERED_FILE',
  'SOURCE_RIGHTS_AND_EXTERNAL_PUBLICATION_NOT_GRANTED',
  'GEOGRAPHY_NOT_DECLARED_IN_SOURCE_SCOPE',
  'REVIEW_AUTHORITY_DELEGATION_AND_REVOCATION_NOT_DEFINED',
]);

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');
const identity = (value: unknown): string => sha256(Buffer.from(canonicalJson(value), 'utf8'));
const bytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
const sortedUnique = (values: readonly string[]): string[] => [...new Set(values)].sort();

function assertIdentity(reportId: string, reportVersion: number, interpretationId: string): void {
  if (!UUID.test(reportId)) throw new ReportReviewTargetValidationError('Invalid reportId');
  if (!Number.isSafeInteger(reportVersion) || reportVersion < 1 || reportVersion > 10_000) {
    throw new ReportReviewTargetValidationError('Invalid reportVersion');
  }
  if (!UUID.test(interpretationId)) throw new ReportReviewTargetValidationError('Invalid interpretationId');
}

function exactIntendedUse(value: string): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 300 || value.trim() !== value) {
    throw new ReportReviewTargetValidationError('Invalid intendedUse');
  }
  return value;
}

function assertExactBinding(
  reportId: string,
  reportVersion: number,
  interpretationId: string,
  source: VerifiedReportInterpretationSource,
  interpretation: VerifiedReportInterpretation,
): void {
  const { record, bundle } = source;
  const run = interpretation.record;
  const artifact = interpretation.artifact;
  const claimsSha256 = identity(bundle.packet.claims);
  if (
    record.reportId !== reportId || record.version !== reportVersion ||
    record.interpretationState !== 'NONE' || record.reviewState !== 'UNREVIEWED' ||
    run.reportId !== reportId || run.reportVersion !== reportVersion ||
    run.reportVersionId !== record.versionId ||
    run.interpretationId !== interpretationId || artifact.interpretationId !== interpretationId ||
    run.interpretationContentSha256 !== artifact.interpretationContentSha256 ||
    run.artifactSha256 !== sha256(interpretation.artifactBytes) ||
    run.sourceSemanticVersionId !== record.semanticVersionId ||
    artifact.source.semanticVersionId !== record.semanticVersionId ||
    run.sourcePacketId !== bundle.packet.packetId || artifact.source.packetId !== bundle.packet.packetId ||
    run.sourcePacketSha256 !== bundle.envelope.artifacts.packetSha256 ||
    artifact.source.packetSha256 !== bundle.envelope.artifacts.packetSha256 ||
    run.sourceClaimsSha256 !== claimsSha256 || artifact.source.claimsSha256 !== claimsSha256 ||
    run.providerId !== artifact.generation.providerId || run.modelId !== artifact.generation.modelId ||
    run.promptId !== artifact.generation.promptId || run.promptVersion !== artifact.generation.promptVersion ||
    run.outputSchemaVersion !== artifact.generation.outputSchemaVersion ||
    run.completedAt !== artifact.completedAt
  ) {
    throw new ReportReviewTargetIntegrityError('Report and interpretation identities do not match');
  }

  const sections = new Map(bundle.packet.sections.map(section => [section.sectionId, section]));
  const claims = new Map(bundle.packet.claims.map(claim => [claim.claimId, claim]));
  if (sections.size !== bundle.packet.sections.length || claims.size !== bundle.packet.claims.length) {
    throw new ReportReviewTargetIntegrityError('Report packet contains duplicate identities');
  }
  for (const item of artifact.items) {
    if (!sections.has(item.sectionId)) {
      throw new ReportReviewTargetIntegrityError('Interpretation references an unknown report section');
    }
    for (const claimId of item.supportingClaimIds) {
      const claim = claims.get(claimId);
      if (!claim || claim.sectionId !== item.sectionId) {
        throw new ReportReviewTargetIntegrityError('Interpretation references an unsupported claim');
      }
    }
    for (const citation of item.citations) {
      const claim = claims.get(citation.claimId);
      if (!claim || claim.sectionId !== citation.sectionId || citation.sectionId !== item.sectionId) {
        throw new ReportReviewTargetIntegrityError('Interpretation citation does not match the report packet');
      }
    }
  }
}

/**
 * Composes an immutable internal-review inventory from one exact report version
 * and one explicitly selected interpretation run. It records no human decision.
 */
export async function buildReportReviewTarget(options: {
  readonly reportId: string;
  readonly reportVersion: number;
  readonly interpretationId: string;
  readonly intendedUse: string;
  readonly reports: ReportReviewTargetReportReader;
  readonly interpretations: ReportReviewTargetInterpretationReader;
}): Promise<BuiltReportReviewTarget> {
  assertIdentity(options.reportId, options.reportVersion, options.interpretationId);
  const intendedUse = exactIntendedUse(options.intendedUse);
  const source = await options.reports.readInterpretationSource(options.reportId, options.reportVersion);
  const interpretation = await options.interpretations.read(
    options.reportId,
    options.reportVersion,
    options.interpretationId,
  );
  assertExactBinding(
    options.reportId,
    options.reportVersion,
    options.interpretationId,
    source,
    interpretation,
  );

  const { record, bundle } = source;
  const run = interpretation.record;
  const artifact = interpretation.artifact;
  const renderedReports = record.artifacts.filter(item => item.fileName === 'report.html');
  if (renderedReports.length !== 1) {
    throw new ReportReviewTargetIntegrityError('Report version must contain one exact report.html artifact');
  }
  const renderedReport = renderedReports[0]!;
  if (renderedReport.mediaType !== 'text/html; charset=utf-8' || renderedReport.byteSize < 1) {
    throw new ReportReviewTargetIntegrityError('Rendered report artifact metadata is invalid');
  }
  const selectedSources = [...record.selectedSources].sort((left, right) => left.ordinal - right.ordinal);
  if (new Set(selectedSources.map(item => item.ordinal)).size !== selectedSources.length) {
    throw new ReportReviewTargetIntegrityError('Report source membership contains duplicate ordinals');
  }
  const payload: ReviewTargetPayload = {
    contractVersion: '1.0.0',
    policyVersion: 'report-review-target-v1',
    report: {
      reportId: record.reportId,
      reportKey: record.reportKey,
      versionId: record.versionId,
      version: record.version,
      semanticVersionId: record.semanticVersionId,
      createdAt: record.createdAt,
    },
    approvalScope: {
      workspaceId: record.workspaceId,
      sourcePackageId: record.sourcePackageId,
      sourcePackageManifestSha256: record.sourcePackageManifestSha256,
      packageContentSha256: record.packageContentSha256,
      selectedSources: selectedSources.map(sourceItem => ({
        ordinal: sourceItem.ordinal,
        role: sourceItem.role,
        logicalPath: sourceItem.logicalPath,
        sha256: sourceItem.sha256,
      })),
      marketKey: bundle.input.scope.key,
      productKey: null,
      platform: bundle.input.scope.platform,
      selection: bundle.input.scope.selection,
      start: bundle.input.scope.start,
      end: bundle.input.scope.end,
      periodBasis: bundle.input.scope.periodBasis,
      acquiredAt: bundle.input.scope.acquiredAt,
      geography: 'UNSPECIFIED',
      intendedUse,
      sourceRights: 'UNSPECIFIED',
    },
    renderedReport: {
      fileName: 'report.html',
      sha256: renderedReport.sha256,
      mediaType: 'text/html; charset=utf-8',
      byteSize: renderedReport.byteSize,
    },
    calculation: {
      packetId: bundle.packet.packetId,
      packetSha256: bundle.envelope.artifacts.packetSha256,
      catalogSha256: bundle.packet.catalogSha256,
      resultSha256: bundle.envelope.artifacts.metricResultSha256,
      claimsSha256: artifact.source.claimsSha256,
      packetPolicyVersion: bundle.packet.policyVersion,
      metricMethodVersion: bundle.packet.metricMethodVersion,
      metricRounding: bundle.packet.metricRounding,
      sections: bundle.packet.sections.map(section => ({
        sectionId: section.sectionId,
        sectionContentSha256: section.sectionSha256,
        deliveryState: section.deliveryState,
      })),
    },
    interpretation: {
      interpretationId: run.interpretationId,
      reportVersionId: run.reportVersionId,
      sourceSemanticVersionId: run.sourceSemanticVersionId,
      interpretationNumber: run.interpretationNumber,
      interpretationContentSha256: run.interpretationContentSha256,
      artifactSha256: run.artifactSha256,
      completedAt: run.completedAt,
      providerId: run.providerId,
      modelId: run.modelId,
      promptId: run.promptId,
      promptVersion: run.promptVersion,
      promptSha256: artifact.generation.promptSha256,
      outputSchemaVersion: run.outputSchemaVersion,
    },
    reviewableContent: {
      purpose: 'INTERNAL_REVIEW_ONLY',
      reportSectionIds: sortedUnique(bundle.packet.sections.map(section => section.sectionId)),
      interpretationSectionIds: sortedUnique(artifact.items.map(item => item.sectionId)),
      interpretationItemIds: sortedUnique(artifact.items.map(item => item.itemId)),
      claimIds: sortedUnique(artifact.items.flatMap(item => item.supportingClaimIds)),
    },
    limitations: [...limitations],
  };
  const target: ReportReviewTarget = { ...payload, reviewTargetId: identity(payload) };
  if (!validateTarget(target)) {
    throw new ReportReviewTargetIntegrityError(`Review target violates its contract: ${ajv.errorsText(validateTarget.errors)}`);
  }
  return { target, targetBytes: bytes(target) };
}
