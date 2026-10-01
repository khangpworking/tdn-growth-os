import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import schema from '../../../contracts/analysis/report-assembly-snapshot.schema.json' with { type: 'json' };
import type { ReportAssemblySnapshot } from '../../../contracts/analysis/report-assembly-snapshot.generated.js';
import type { SourceBackedReportBundle } from './source-backed-report.js';
import type { VerifiedMetricInputPreparation } from './metric-input-preparation-service.js';
import type { MetricPreparationReadinessResult } from '../../../contracts/analysis/metric-preparation-readiness-result.generated.js';
import type { VerifiedSectionArtifactRetention } from './section-artifact-retention-ledger.js';
import { canonicalJson } from '../foundation/canonical-json.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const validateSnapshot = ajv.compile<ReportAssemblySnapshot>(schema);

const MAX_BYTES = 8 * 1024 * 1024;

export class ReportAssemblySnapshotValidationError extends Error {}
export class ReportAssemblySnapshotIntegrityError extends Error {}

export interface ReportAssemblySnapshotInputs {
  readonly bundle: SourceBackedReportBundle;
  readonly preparation: VerifiedMetricInputPreparation;
  readonly readiness: MetricPreparationReadinessResult;
  readonly retainedM03: VerifiedSectionArtifactRetention;
}

export interface ReportAssemblySnapshotResult {
  readonly snapshot: ReportAssemblySnapshot;
  readonly bytes: Buffer;
}

/**
 * Pure content assembly: pins the exact preparation/readiness/catalog/M03 identities
 * already established by their own verified readers, crosschecks them against each
 * other (since they are independently verified paths over the same source selection),
 * and freezes all 30 catalog sections with their catalog fallback, A31 readiness and
 * actual materialization kept as three separate facts. No database, provider, clock,
 * random-ID or report-version side effects.
 */
export function buildReportAssemblySnapshot(inputs: ReportAssemblySnapshotInputs): ReportAssemblySnapshotResult {
  const { bundle, preparation, readiness, retainedM03 } = inputs;

  for (const field of ['workbookPath', 'manifestPath', 'labelsPath'] as const) {
    if (bundle.envelope.request[field] !== preparation.result.request[field]) {
      throw new ReportAssemblySnapshotIntegrityError(`Assembly source selection mismatch at ${field}`);
    }
  }

  assertEqual(bundle.envelope.workspace.workspaceId, preparation.result.workspace.workspaceId, 'workspace.workspaceId');
  assertEqual(bundle.envelope.workspace.snapshotSha256, preparation.result.workspace.snapshotSha256, 'workspace.snapshotSha256');
  assertEqual(bundle.envelope.sourcePackage.packageId, preparation.result.sourcePackage.packageId, 'sourcePackage.packageId');
  assertEqual(
    bundle.envelope.sourcePackage.manifestArtifactSha256, preparation.result.sourcePackage.manifestArtifactSha256,
    'sourcePackage.manifestArtifactSha256',
  );
  assertEqual(
    bundle.envelope.sourcePackage.packageContentSha256, preparation.result.sourcePackage.packageContentSha256,
    'sourcePackage.packageContentSha256',
  );
  assertEqual(
    bundle.envelope.artifacts.normalizedInputSha256, preparation.result.normalizedInput.artifactSha256,
    'normalizedInput.artifactSha256',
  );
  assertEqual(bundle.receipt.inputSha256, preparation.result.normalizedInput.valueSha256, 'normalizedInput.valueSha256');
  if (canonicalJson(bundle.input) !== canonicalJson(preparation.input)) {
    throw new ReportAssemblySnapshotIntegrityError('Source-backed bundle input does not match the verified preparation input');
  }

  assertEqual(readiness.preparationSha256, preparation.result.preparationSha256, 'readiness.preparationSha256');
  assertEqual(readiness.catalog.sha256, bundle.envelope.artifacts.catalogSha256, 'readiness.catalog.sha256');
  assertEqual(readiness.catalog.catalogId, bundle.packet.catalog.catalogId, 'readiness.catalog.catalogId');
  assertEqual(readiness.catalog.catalogVersion, bundle.packet.catalog.catalogVersion, 'readiness.catalog.catalogVersion');

  assertEqual(retainedM03.metricSet.preparation.preparationSha256, preparation.result.preparationSha256, 'm03.preparation.preparationSha256');
  assertEqual(
    retainedM03.metricSet.preparation.normalizedInputArtifactSha256, preparation.result.normalizedInput.artifactSha256,
    'm03.preparation.normalizedInputArtifactSha256',
  );
  assertEqual(
    retainedM03.metricSet.preparation.normalizedInputValueSha256, preparation.result.normalizedInput.valueSha256,
    'm03.preparation.normalizedInputValueSha256',
  );
  assertEqual(retainedM03.metricSet.readiness.readinessSha256, readiness.readinessSha256, 'm03.readiness.readinessSha256');
  assertEqual(retainedM03.metricSet.readiness.catalogSha256, readiness.catalog.sha256, 'm03.readiness.catalogSha256');
  assertEqual(retainedM03.metricSet.readiness.catalogId, readiness.catalog.catalogId, 'm03.readiness.catalogId');
  assertEqual(retainedM03.metricSet.readiness.catalogVersion, readiness.catalog.catalogVersion, 'm03.readiness.catalogVersion');

  assertEqual(retainedM03.metricSet.scope.key, bundle.input.scope.key, 'm03.scope.key');
  assertEqual(retainedM03.metricSet.scope.platform, bundle.input.scope.platform, 'm03.scope.platform');
  assertEqual(retainedM03.metricSet.scope.selection, bundle.input.scope.selection, 'm03.scope.selection');
  assertEqual(retainedM03.metricSet.scope.start, bundle.input.scope.start, 'm03.scope.start');
  assertEqual(retainedM03.metricSet.scope.end, bundle.input.scope.end, 'm03.scope.end');
  assertEqual(retainedM03.metricSet.scope.periodBasis, bundle.input.scope.periodBasis, 'm03.scope.periodBasis');
  assertEqual(retainedM03.metricSet.labelPolicy.codebookVersion, bundle.input.labelCodebookVersion, 'm03.labelPolicy.codebookVersion');
  assertEqual(retainedM03.metricSet.labelPolicy.wideUnknownPolicy, bundle.input.wideUnknownPolicy, 'm03.labelPolicy.wideUnknownPolicy');

  const bundleScopesByKey = new Map(bundle.result.scopes.map(scope => [scope.key, scope]));
  for (const scope of retainedM03.metricSet.scopes) {
    const bundleScope = bundleScopesByKey.get(scope.key);
    if (!bundleScope) throw new ReportAssemblySnapshotIntegrityError(`Retained M03 scope ${scope.key} is missing from the source-backed bundle`);
    const projected = {
      key: bundleScope.key, recordIndices: bundleScope.recordIndices, listingCount: bundleScope.listingCount,
      shopCount: bundleScope.shopCount, revenue: bundleScope.revenue, units: bundleScope.units, warnings: bundleScope.warnings,
    };
    if (canonicalJson(projected) !== canonicalJson(scope)) {
      throw new ReportAssemblySnapshotIntegrityError(`Retained M03 scope ${scope.key} does not match the source-backed bundle's calculated scope`);
    }
  }

  const m03Packet = requireSection(bundle, 'M03');
  if (m03Packet.deliveryState !== 'PARTIAL_DETERMINISTIC_DRAFT' || m03Packet.claimIds.length === 0) {
    throw new ReportAssemblySnapshotIntegrityError('Source-backed bundle does not materialize M03, but a retained M03 artifact was provided');
  }

  const catalogSections = bundle.packet.catalog.sections;
  const packetSections = bundle.packet.sections;
  if (catalogSections.length !== 30 || packetSections.length !== 30 || readiness.sections.length !== 30) {
    throw new ReportAssemblySnapshotIntegrityError('Report section catalog does not contain exactly 30 sections');
  }
  const readinessBySection = new Map(readiness.sections.map(section => [section.sectionId, section]));
  const readinessInputById = new Map(readiness.inputs.map(input => [input.inputId, input]));

  const seen = new Set<string>();
  const sections: ReportAssemblySnapshot['sections'] = catalogSections.map((definition, index) => {
    if (seen.has(definition.sectionId)) throw new ReportAssemblySnapshotIntegrityError(`Duplicate section ${definition.sectionId} in catalog`);
    seen.add(definition.sectionId);
    const packetSection = packetSections[index];
    if (!packetSection || packetSection.sectionId !== definition.sectionId) {
      throw new ReportAssemblySnapshotIntegrityError(`Packet section order does not match catalog order at index ${index}`);
    }
    const sectionReadiness = readinessBySection.get(definition.sectionId);
    if (!sectionReadiness) throw new ReportAssemblySnapshotIntegrityError(`Readiness is missing section ${definition.sectionId}`);
    if (canonicalJson(sectionReadiness.requiredInputs) !== canonicalJson(definition.requiredInputs)) {
      throw new ReportAssemblySnapshotIntegrityError(`Readiness required inputs do not match the catalog for section ${definition.sectionId}`);
    }
    const inputChecks = sectionReadiness.requiredInputs.map(inputId => {
      const check = readinessInputById.get(inputId);
      if (!check) throw new ReportAssemblySnapshotIntegrityError(`Readiness is missing input check ${inputId} for section ${definition.sectionId}`);
      return {
        inputId: check.inputId, state: check.state, blocking: check.blocking,
        codes: [...check.codes], evidenceRefs: check.evidenceRefs.map(ref => ({ ...ref })),
      };
    });
    const materialized = packetSection.deliveryState === 'PARTIAL_DETERMINISTIC_DRAFT';
    return {
      sectionId: definition.sectionId,
      title: definition.title,
      catalog: { fallbackState: definition.fallbackState, fallbackReasons: [...definition.fallbackReasons] },
      readiness: {
        state: sectionReadiness.state, methodId: sectionReadiness.methodId, methodVersion: sectionReadiness.methodVersion,
        requiredInputs: [...sectionReadiness.requiredInputs], blockingCodes: [...sectionReadiness.blockingCodes], inputChecks,
      },
      materialization: {
        deliveryState: packetSection.deliveryState, materialized,
        claimIds: [...packetSection.claimIds], contextPointers: [...packetSection.contextPointers], blockers: [...packetSection.blockers],
        sectionSha256: packetSection.sectionSha256,
        methodArtifact: packetSection.methodArtifact ? { ...packetSection.methodArtifact } : null,
      },
      readinessBlockedWhileMaterialized: materialized && sectionReadiness.state !== 'READY_TO_CALCULATE',
    };
  }) as ReportAssemblySnapshot['sections'];

  const content = {
    contractVersion: '1.0.0' as const,
    assemblyProfile: 'report-assembly-snapshot-v1' as const,
    lifecycle: {
      status: 'DRAFT_PARTIAL' as const,
      interpretation: 'NONE' as const,
      reviewState: 'UNREVIEWED' as const,
      finalityStatement: 'NOT_FINAL_NOT_PUBLISHABLE_NOT_COMMERCIAL_READY' as const,
    },
    preparationSha256: preparation.result.preparationSha256,
    readinessSha256: readiness.readinessSha256,
    catalog: { catalogId: readiness.catalog.catalogId, catalogVersion: readiness.catalog.catalogVersion, sha256: readiness.catalog.sha256 },
    source: {
      workspaceId: bundle.envelope.workspace.workspaceId,
      workspaceSnapshotSha256: bundle.envelope.workspace.snapshotSha256,
      sourcePackageId: bundle.envelope.sourcePackage.packageId,
      sourcePackageManifestSha256: bundle.envelope.sourcePackage.manifestArtifactSha256,
      sourcePackageContentSha256: bundle.envelope.sourcePackage.packageContentSha256,
      normalizedInputArtifactSha256: bundle.envelope.artifacts.normalizedInputSha256,
      normalizedInputValueSha256: bundle.receipt.inputSha256,
      scope: {
        key: bundle.input.scope.key, platform: bundle.input.scope.platform, selection: bundle.input.scope.selection,
        start: bundle.input.scope.start, end: bundle.input.scope.end, periodBasis: bundle.input.scope.periodBasis,
      },
      labelPolicy: { codebookVersion: bundle.input.labelCodebookVersion, wideUnknownPolicy: bundle.input.wideUnknownPolicy },
    },
    m03: {
      sectionArtifactSha256: retainedM03.record.sectionArtifactSha256,
      preparationSha256: retainedM03.metricSet.preparation.preparationSha256,
      readinessSha256: retainedM03.metricSet.readiness.readinessSha256,
      members: {
        metricSet: { ...retainedM03.record.members.metricSet },
        chartBundle: { ...retainedM03.record.members.chartBundle },
        envelope: { ...retainedM03.record.members.envelope },
        narrative: { ...retainedM03.record.members.narrative },
        receipt: { ...retainedM03.record.members.receipt },
        html: { ...retainedM03.record.members.html },
      },
      scopeTotals: retainedM03.metricSet.scopes.map(scope => ({
        key: scope.key, listingCount: scope.listingCount, shopCount: scope.shopCount,
        revenue: { ...scope.revenue }, units: { ...scope.units }, warnings: [...scope.warnings],
      })),
    },
    sections,
  };
  assertDerivedArtifactSize(canonicalBytes(content, false), 'assembly identity');
  const assemblySha256 = digest(canonicalBytes(content, false));
  const snapshot = { ...content, assemblySha256 } as ReportAssemblySnapshot;
  if (!validateSnapshot(snapshot)) {
    throw new ReportAssemblySnapshotIntegrityError(`Report assembly snapshot breaks its contract: ${ajv.errorsText(validateSnapshot.errors)}`);
  }
  const normalized = JSON.parse(canonicalJson(snapshot)) as ReportAssemblySnapshot;
  const bytes = canonicalBytes(normalized, true);
  assertDerivedArtifactSize(bytes, 'assembly snapshot');
  return { snapshot: normalized, bytes };
}

function requireSection(bundle: SourceBackedReportBundle, sectionId: string): SourceBackedReportBundle['packet']['sections'][number] {
  const section = bundle.packet.sections.find(candidate => candidate.sectionId === sectionId);
  if (!section) throw new ReportAssemblySnapshotIntegrityError(`Source-backed bundle packet is missing section ${sectionId}`);
  return section;
}

function assertEqual(actual: string, expected: string, label: string): void {
  if (actual !== expected) throw new ReportAssemblySnapshotIntegrityError(`Assembly identity mismatch at ${label}`);
}

function canonicalBytes(value: unknown, newline: boolean): Buffer {
  return Buffer.from(canonicalJson(value) + (newline ? '\n' : ''), 'utf8');
}

function digest(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDerivedArtifactSize(bytes: Buffer, label: string): void {
  if (bytes.byteLength > MAX_BYTES) throw new ReportAssemblySnapshotValidationError(`${label} exceeds the assembly artifact size limit`);
}
