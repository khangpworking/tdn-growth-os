import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import apiSchema from '../../../contracts/api/research-generation-api.schema.json' with { type: 'json' };
import manifestSchema from '../../../contracts/analysis/metric-source-manifest.schema.json' with { type: 'json' };
import labelsSchema from '../../../contracts/analysis/metric-source-labels.schema.json' with { type: 'json' };
import inputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import descriptiveMethodsSchema from '../../../contracts/analysis/descriptive-market-methods.schema.json' with { type: 'json' };
import descriptiveProvenanceSchema from '../../../contracts/analysis/m13-provenance-appendix.schema.json' with { type: 'json' };
import locatedMethodsSchema from '../../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import methodPacketsSchema from '../../../contracts/analysis/report-method-packets-input.schema.json' with { type: 'json' };
import gateSchema from '../../../contracts/analysis/bounded-analysis-gates.schema.json' with { type: 'json' };
import decisionSchema from '../../../contracts/analysis/decision-evidence-packets.schema.json' with { type: 'json' };
import packetSchema from '../../../contracts/analysis/versioned-report-packet.schema.json' with { type: 'json' };
import catalogSchema from '../../../contracts/analysis/report-section-catalog.schema.json' with { type: 'json' };
import type { ResearchGenerationChoice, ResearchGenerationInputs, ResearchGenerationMethodInputs, ResearchGenerationMethodCandidate, ResearchGenerationReceipt, ResearchGenerationRequest } from '../../../contracts/api/research-generation-api.generated.js';
import type { MetricSourceManifest } from '../../../contracts/analysis/metric-source-manifest.generated.js';
import type { MetricSourceLabels } from '../../../contracts/analysis/metric-source-labels.generated.js';
import type { MetricInputPreparationRequest } from '../../../contracts/analysis/metric-input-preparation-request.generated.js';
import type { FinalizedSourcePackageReader } from '../foundation/source-package-reader.js';
import type { FinalizedSourcePackageSummary, SourcePackageReadBudget, VerifiedFinalizedSourcePackage } from '../foundation/source-package-service.js';
import type { DiscoveryWorkspaceReader } from '../flow/discovery-workspace-reader.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import { RequestScopedArtifactStore } from '../../platform/artifacts/request-scoped-artifact-store.js';
import { MetricInputPreparationService } from './metric-input-preparation-service.js';
import { MetricPreparationReadinessService } from './metric-preparation-readiness.js';
import { M03SectionRecipeService } from './m03-section-recipe.js';
import { buildM03ChartBundle } from './m03-chart-bundle.js';
import { buildM03NarrativeEvidence } from './m03-narrative-evidence.js';
import { renderM03FactualNarrative } from './m03-factual-narrative.js';
import { renderM03SectionArtifact } from './m03-section-artifact.js';
import { SectionArtifactRetentionLedgerService } from './section-artifact-retention-ledger.js';
import { ReportVersionService, ReportVersionIdentityConflictError } from './report-version-service.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
ajv.addSchema(inputSchema);
ajv.addSchema(apiSchema);
ajv.addSchema([
  descriptiveProvenanceSchema, descriptiveMethodsSchema, locatedMethodsSchema,
  gateSchema, decisionSchema, packetSchema, catalogSchema,
]);
const validateRequest = ajv.getSchema<ResearchGenerationRequest>(`${apiSchema.$id}#/$defs/request`)!;
const validateManifest = ajv.compile<MetricSourceManifest>(manifestSchema);
const validateLabels = ajv.compile<MetricSourceLabels>(labelsSchema);
const validateInputs = ajv.getSchema<ResearchGenerationInputs>(`${apiSchema.$id}#/$defs/inputs`)!;
const validateReceipt = ajv.getSchema<ResearchGenerationReceipt>(`${apiSchema.$id}#/$defs/receipt`)!;
const validateDescriptiveMethodsInput = ajv.getSchema(`${descriptiveMethodsSchema.$id}#/$defs/input`)!;
const validateLocatedMethodsInput = ajv.getSchema(`${locatedMethodsSchema.$id}#/$defs/input`)!;
const validateMethodPacketsInput = ajv.compile(methodPacketsSchema);

export const RESEARCH_GENERATION_CATALOG_SHA256 = '926a175fa9104df4cefde799ad601861d94b4e9d4d7fe1dbf7717dc163a8e255';
const READ_BUDGET = Object.freeze({ maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMITATIONS = ['PARTIAL_REPORT', 'TABLET_QUOTE_NOT_SELECTED', 'NO_AI_INTERPRETATION', 'NOT_REVIEWED'];
const METHOD_FAMILIES = ['descriptiveMethods', 'locatedInsightMethods', 'methodPackets'] as const;
type MethodFamily = typeof METHOD_FAMILIES[number];
const METHOD_LIMITATIONS = ['SCHEMA_VALIDATED_ONLY', 'PACKAGE_RELATION_NOT_DECLARED', 'CONSUMER_VALIDATION_ON_CREATE'];
type MethodPaths = Partial<{
  descriptiveMethodsPath: string;
  locatedInsightMethodsPath: string;
  methodPacketsPath: string;
}>;
type WebSourceRequest = {
  contractVersion: '1.0.0'; workspaceId: string; packageId: string; packageManifestSha256: string;
  workbookPath: string; manifestPath: string; labelsPath: string | null; catalogSha256: string;
  tabletQuoteSourcePath: null; tabletQuoteInputPath: null;
};
const digest = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');
const canonicalBytes = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

export class ResearchGenerationValidationError extends Error {}
export class ResearchGenerationSelectionError extends Error {}
export class ResearchGenerationIntegrityError extends Error {}

export interface ResearchGenerationSourceReader extends FinalizedSourcePackageReader {
  listFinalizedSourcePackages(budget?: SourcePackageReadBudget): Promise<readonly FinalizedSourcePackageSummary[]>;
}

/** The web adapter owns selection only; preparation, retention and report history keep their existing owners. */
export class ReportGenerationService {
  readonly #db: Database.Database;
  readonly #artifacts: RequestScopedArtifactStore;
  readonly #sourcePackages: ResearchGenerationSourceReader;
  readonly #workspaces: DiscoveryWorkspaceReader;
  readonly #catalog: Buffer;
  readonly #preparations: MetricInputPreparationService;
  readonly #sections: SectionArtifactRetentionLedgerService;
  readonly #reports: ReportVersionService;

  constructor(options: {
    readonly db: Database.Database;
    readonly artifactStore: RequestScopedArtifactStore;
    readonly sourcePackages: ResearchGenerationSourceReader;
    readonly workspaces: DiscoveryWorkspaceReader;
    readonly catalogBytes: Buffer;
  }) {
    if (digest(options.catalogBytes) !== RESEARCH_GENERATION_CATALOG_SHA256) {
      throw new ResearchGenerationIntegrityError('The web generation catalog does not match its pinned revision');
    }
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#sourcePackages = options.sourcePackages;
    this.#workspaces = options.workspaces;
    this.#catalog = Buffer.from(options.catalogBytes);
    this.#preparations = new MetricInputPreparationService(options);
    this.#sections = new SectionArtifactRetentionLedgerService(options);
    this.#reports = new ReportVersionService({
      db: options.db, artifactStore: options.artifactStore,
      dependencies: { sourcePackages: options.sourcePackages, workspaces: options.workspaces },
      preparations: this.#preparations, sectionArtifacts: this.#sections,
    });
  }

  async inputs(workspaceId: string): Promise<ResearchGenerationInputs> {
    if (!UUID.test(workspaceId)) throw new ResearchGenerationValidationError('Invalid workspace');
    const workspace = await this.#workspaces.readVerifiedWorkspace(workspaceId);
    if (workspace.workspaceId !== workspaceId || workspace.state !== 'ACTIVE') {
      throw new ResearchGenerationIntegrityError('Workspace identity or state does not match');
    }
    const summaries = await this.#sourcePackages.listFinalizedSourcePackages(READ_BUDGET);
    if (summaries.length > 100) throw new ResearchGenerationValidationError('Source inventory exceeds the local web limit');
    const choices: ResearchGenerationChoice[] = [];
    for (const summary of summaries) {
      const source = await this.#sourcePackages.readFinalizedSourcePackage(summary.packageId, READ_BUDGET);
      if (source.packageId !== summary.packageId || source.manifestArtifactSha256 !== summary.manifestArtifactSha256) {
        throw new ResearchGenerationIntegrityError('Package inventory does not match its retained evidence');
      }
      choices.push(...sourceChoices(source));
      if (choices.length > 500) throw new ResearchGenerationValidationError('Source selection exceeds the local web limit');
    }
    const result: ResearchGenerationInputs = {
      contractVersion: '1.0.0', workspaceId, catalogSha256: RESEARCH_GENERATION_CATALOG_SHA256,
      choices: choices.sort((a, b) => compareCodeUnits(a.selectionId, b.selectionId)),
    };
    if (!validateInputs(result)) throw new ResearchGenerationIntegrityError('Source inventory violates its contract');
    return result;
  }

  async create(untrusted: unknown): Promise<ResearchGenerationReceipt> {
    if (!validateRequest(untrusted)) throw new ResearchGenerationValidationError('Invalid report creation request');
    const request = structuredClone(untrusted as ResearchGenerationRequest);
    const reportKey = `web-${request.requestKey}`;
    // Committed retries depend only on their pinned package, never global discovery.
    const existing = this.#db.prepare(`
      SELECT report_id reportId, source_package_id packageId, source_package_manifest_sha256 manifestSha256,
             package_content_sha256 packageContentSha256, workspace_id workspaceId,
             workspace_snapshot_sha256 workspaceSnapshotSha256,
             request_sha256 canonicalRequestSha256, request_artifact_sha256 requestArtifactSha256,
             version, previous_semantic_version_id previousSemanticVersionId
      FROM analysis_report_versions WHERE report_id =
        (SELECT report_id FROM analysis_report_series WHERE report_key = ?) AND version = 1
    `).get(reportKey) as {
      reportId: string; packageId: string; manifestSha256: string; packageContentSha256: string;
      workspaceId: string; workspaceSnapshotSha256: string; canonicalRequestSha256: string;
      requestArtifactSha256: string; version: number; previousSemanticVersionId: string | null;
    } | undefined;
    let choices: readonly ResearchGenerationChoice[];
    if (existing) {
      if (existing.workspaceId !== request.workspaceId) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another workspace');
      }
      const workspace = await this.#workspaces.readVerifiedWorkspace(request.workspaceId);
      if (workspace.workspaceId !== request.workspaceId || workspace.state !== 'ACTIVE') {
        throw new ResearchGenerationIntegrityError('Workspace identity or state does not match');
      }
      const source = await this.#sourcePackages.readFinalizedSourcePackage(existing.packageId, READ_BUDGET);
      if (source.packageId !== existing.packageId || source.manifestArtifactSha256 !== existing.manifestSha256 ||
          source.packageContentSha256 !== existing.packageContentSha256) {
        throw new ResearchGenerationIntegrityError('Committed source identity does not match its retained evidence');
      }
      choices = sourceChoices(source);
      const selected = choices.find(item => item.selectionId === request.selectionId);
      if (!selected) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
      }
      // Source membership commits with the version even if its request bytes have not been published.
      const committedSources = this.#db.prepare(`
        SELECT role, logical_path logicalPath, source_sha256 sha256
        FROM analysis_report_version_sources WHERE report_id = ? AND version = 1
        UNION ALL
        SELECT role, logical_path logicalPath, source_sha256 sha256
        FROM analysis_report_version_supplemental_sources WHERE report_id = ? AND version = 1
        ORDER BY role
      `).all(existing.reportId, existing.reportId);
      const selectedPaths = {
        workbook: selected.workbookPath, manifest: selected.manifestPath,
        ...(selected.labelsPath === null ? {} : { labels: selected.labelsPath }),
      };
      const selectedSources = Object.entries(selectedPaths).map(([role, logicalPath]) => ({
        role, logicalPath, sha256: source.files.find(file => file.path === logicalPath)!.sha256,
      })).sort((a, b) => a.role < b.role ? -1 : a.role > b.role ? 1 : 0);
      if (canonicalJson(committedSources) !== canonicalJson(selectedSources)) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
      }
    } else {
      choices = (await this.inputs(request.workspaceId)).choices;
    }
    const choice = choices.find(item => item.selectionId === request.selectionId);
    if (!choice) throw new ResearchGenerationSelectionError('The exact selected source is unavailable');
    const methodPaths = resolveMethodPaths(choice, request.methodSelectionIds, existing !== undefined);
    const preparationRequest: MetricInputPreparationRequest = {
      contractVersion: '1.0.0', workspaceId: request.workspaceId,
      packageId: choice.packageId, packageManifestSha256: choice.packageManifestSha256,
      workbookPath: choice.workbookPath, manifestPath: choice.manifestPath, labelsPath: choice.labelsPath,
    };
    const sourceRequest: WebSourceRequest = {
      ...preparationRequest, catalogSha256: RESEARCH_GENERATION_CATALOG_SHA256,
      tabletQuoteSourcePath: null, tabletQuoteInputPath: null,
    };
    // Reject a reused key with changed evidence before creating intermediate records.
    if (existing) {
      if (existing.packageId !== choice.packageId || existing.manifestSha256 !== choice.packageManifestSha256 ||
          existing.workspaceId !== request.workspaceId) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
      }
      await this.#assertExistingRequestIdentity(existing, reportKey, sourceRequest, methodPaths);
    }

    const prepared = await this.#artifacts.withOwnership(async () => {
      const result = await this.#preparations.prepare(preparationRequest);
      await this.#artifacts.publishOwned();
      return result;
    });
    const readiness = await new MetricPreparationReadinessService(this.#preparations)
      .evaluate(prepared.preparationSha256, this.#catalog, RESEARCH_GENERATION_CATALOG_SHA256);
    if (readiness.sections.some(section => section.state === 'INVALID')) {
      throw new ResearchGenerationValidationError('The selected labels do not cover the declared source scope');
    }
    const m03Ready = readiness.sections.find(section => section.sectionId === 'M03')?.state === 'READY_TO_CALCULATE';
    let execution;
    const profile = m03Ready ? 'prepared-report-v1' : 'source-backed-v1';
    if (m03Ready) {
      const sectionArtifactSha256 = await this.#retainM03(prepared.preparationSha256, readiness.readinessSha256);
      execution = await this.#reports.createPreparedVersion({
        contractVersion: 'prepared-report-v1', reportPresentation: 'report-kit-v1', reportKey, version: 1, previousSemanticVersionId: null,
        ...methodPaths, sourceRequest, preparationSha256: prepared.preparationSha256,
        readinessSha256: readiness.readinessSha256, sectionArtifactSha256,
      }, this.#catalog);
    } else {
      execution = await this.#artifacts.withOwnership(async () => {
        const result = await this.#reports.createVersion({
          contractVersion: '1.0.0', reportPresentation: 'report-kit-v1', reportKey, version: 1, previousSemanticVersionId: null,
          ...methodPaths, sourceRequest,
        }, this.#catalog);
        await this.#artifacts.publishOwned();
        return result;
      });
    }
    await this.#reports.readVersion(execution.reportId, 1);
    const receipt: ResearchGenerationReceipt = {
      contractVersion: '1.0.0', requestKey: request.requestKey, workspaceId: request.workspaceId,
      reportId: execution.reportId, version: 1, semanticVersionId: execution.semanticVersionId,
      profile, exactRetry: execution.deduplicated, reviewState: 'UNREVIEWED', interpretationState: 'NONE',
      limitations: [...LIMITATIONS, ...(m03Ready ? [] : ['M03_PREPARED_METHOD_NOT_EXECUTED', 'LABEL_DECISIONS_NOT_BOUND'])],
    };
    if (!validateReceipt(receipt)) throw new ResearchGenerationIntegrityError('Report receipt violates its contract');
    return receipt;
  }

  async #assertExistingRequestIdentity(
    existing: {
      readonly reportId: string; readonly packageId: string; readonly manifestSha256: string;
      readonly packageContentSha256: string; readonly workspaceId: string; readonly workspaceSnapshotSha256: string;
      readonly canonicalRequestSha256: string; readonly requestArtifactSha256: string;
      readonly version: number | bigint; readonly previousSemanticVersionId: string | null;
    },
    reportKey: string,
    sourceRequest: WebSourceRequest,
    methodPaths: MethodPaths,
  ): Promise<void> {
    const assemblyMembership = this.#db.prepare(`
      SELECT file_name fileName FROM analysis_report_version_artifacts
      WHERE report_id = ? AND version = 1 AND file_name = 'assembly-snapshot.json'
    `).all(existing.reportId) as { fileName: string }[];
    if (assemblyMembership.length > 1) {
      throw new ResearchGenerationIntegrityError('Committed report assembly membership is ambiguous');
    }

    const base = {
      reportPresentation: 'report-kit-v1' as const, reportKey, version: Number(existing.version),
      previousSemanticVersionId: existing.previousSemanticVersionId, ...methodPaths, sourceRequest,
    };
    let expected: Record<string, unknown>;
    if (assemblyMembership.length === 0) {
      expected = { contractVersion: '1.0.0' as const, ...base };
    } else {
      const sourceRows = this.#db.prepare(`
        SELECT role, logical_path logicalPath, source_sha256 sha256
        FROM analysis_report_version_sources WHERE report_id = ? AND version = 1
        UNION ALL
        SELECT role, logical_path logicalPath, source_sha256 sha256
        FROM analysis_report_version_supplemental_sources WHERE report_id = ? AND version = 1
        ORDER BY role
      `).all(existing.reportId, existing.reportId) as { role: string; logicalPath: string; sha256: string }[];
      const sourceByRole = new Map(sourceRows.map(row => [row.role, row]));
      const workbook = sourceByRole.get('workbook');
      const manifest = sourceByRole.get('manifest');
      const labels = sourceByRole.get('labels');
      if (!workbook || !manifest || (sourceRequest.labelsPath !== null) !== (labels !== undefined) ||
          (labels !== undefined && labels.logicalPath !== sourceRequest.labelsPath)) {
        throw new ResearchGenerationIntegrityError('Committed report source membership cannot reconstruct preparation');
      }
      if (workbook.logicalPath !== sourceRequest.workbookPath || manifest.logicalPath !== sourceRequest.manifestPath ||
          (labels !== undefined && labels.logicalPath !== sourceRequest.labelsPath)) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
      }
      const labelsWhere = labels === undefined ? 'labels_path IS NULL AND labels_sha256 IS NULL' : 'labels_path = ? AND labels_sha256 = ?';
      const preparationParams = labels === undefined
        ? [existing.workspaceId, existing.workspaceSnapshotSha256, existing.packageId, existing.manifestSha256,
          existing.packageContentSha256, workbook.logicalPath, workbook.sha256, manifest.logicalPath, manifest.sha256]
        : [existing.workspaceId, existing.workspaceSnapshotSha256, existing.packageId, existing.manifestSha256,
          existing.packageContentSha256, workbook.logicalPath, workbook.sha256, manifest.logicalPath, manifest.sha256,
          labels.logicalPath, labels.sha256];
      const preparationRows = this.#db.prepare(`
        SELECT preparation_sha256 preparationSha256
        FROM analysis_metric_input_preparations
        WHERE workspace_id = ? AND workspace_snapshot_sha256 = ? AND source_package_id = ?
          AND source_package_manifest_sha256 = ? AND package_content_sha256 = ?
          AND workbook_path = ? AND workbook_sha256 = ?
          AND metric_manifest_path = ? AND metric_manifest_sha256 = ? AND ${labelsWhere}
      `).all(...preparationParams) as { preparationSha256: string }[];
      if (preparationRows.length !== 1) {
        throw new ResearchGenerationIntegrityError('Committed report preparation identity is missing or ambiguous');
      }
      const preparationSha256 = preparationRows[0]!.preparationSha256;
      let readinessSha256: string;
      try {
        await this.#preparations.readVerified(preparationSha256);
        readinessSha256 = (await new MetricPreparationReadinessService(this.#preparations)
          .evaluate(preparationSha256, this.#catalog, RESEARCH_GENERATION_CATALOG_SHA256)).readinessSha256;
      } catch (error) {
        throw new ResearchGenerationIntegrityError('Committed report readiness cannot be reconstructed', { cause: error });
      }
      const sectionRows = this.#db.prepare(`
        SELECT section_artifact_sha256 sectionArtifactSha256
        FROM analysis_section_artifacts
        WHERE preparation_sha256 = ? AND section_id = 'M03' AND renderer_profile = 'm03-section-artifact-html-vi-v1'
        ORDER BY section_artifact_sha256
      `).all(preparationSha256) as { sectionArtifactSha256: string }[];
      if (sectionRows.length !== 1) {
        throw new ResearchGenerationIntegrityError('Committed report section artifact identity is missing or ambiguous');
      }
      expected = {
        contractVersion: 'prepared-report-v1' as const, ...base,
        preparationSha256, readinessSha256, sectionArtifactSha256: sectionRows[0]!.sectionArtifactSha256,
      };
    }
    const expectedRequestSha256 = digest(canonicalJson(expected));
    if (expectedRequestSha256 !== existing.canonicalRequestSha256) {
      throw new ReportVersionIdentityConflictError('Request key is already bound to another report request');
    }
    try {
      const requestBytes = await this.#artifacts.read(existing.requestArtifactSha256, { maxBytes: 64 * 1024 });
      if (digest(requestBytes) !== existing.requestArtifactSha256) {
        throw new ResearchGenerationIntegrityError('Committed report request artifact digest does not match its bytes');
      }
      let saved: unknown;
      try { saved = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(requestBytes)); }
      catch (error) { throw new ResearchGenerationIntegrityError('Committed report request artifact is invalid JSON', { cause: error }); }
      if (!requestBytes.equals(canonicalBytes(saved))) {
        throw new ResearchGenerationIntegrityError('Committed report request artifact is not canonical JSON');
      }
      if (canonicalJson(saved) !== canonicalJson(expected)) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another report request');
      }
    } catch (error) {
      if (missingArtifact(error)) return;
      if (error instanceof ResearchGenerationIntegrityError || error instanceof ReportVersionIdentityConflictError) throw error;
      throw new ResearchGenerationIntegrityError('Committed report request artifact cannot be verified', { cause: error });
    }
  }

  async #retainM03(preparationSha256: string, readinessSha256: string): Promise<string> {
    const metricSet = await new M03SectionRecipeService(this.#preparations).calculate({
      contractVersion: '1.0.0', sectionId: 'M03', recipeId: 'm03-scope-totals', recipeVersion: '1.0.0',
      preparationSha256, readinessSha256, catalogSha256: RESEARCH_GENERATION_CATALOG_SHA256,
    }, this.#catalog);
    const chartBundle = buildM03ChartBundle({
      contractVersion: '1.0.0', sectionId: 'M03', chartProfile: 'm03-chart-profile-v1', metricSetSha256: metricSet.metricSetSha256,
    }, metricSet);
    const envelope = buildM03NarrativeEvidence({
      contractVersion: '1.0.0', sectionId: 'M03', profile: 'm03-narrative-evidence-v1',
      metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
    }, metricSet, chartBundle);
    const narrative = renderM03FactualNarrative({
      contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-factual-narrative-vi-v1', envelopeSha256: envelope.envelopeSha256,
    }, envelope, metricSet, chartBundle);
    const rendered = renderM03SectionArtifact({
      contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1', narrativeSha256: narrative.narrativeSha256,
    }, metricSet, chartBundle, envelope, narrative);
    const identity = rendered.artifact.artifactSha256;
    const existing = this.#db.prepare('SELECT section_artifact_sha256 FROM analysis_section_artifacts WHERE section_artifact_sha256 = ?').get(identity);
    if (existing) {
      try { await this.#sections.read(identity); return identity; }
      catch (error) { if (!missingArtifact(error)) throw error; }
    }
    await this.#artifacts.withOwnership(async () => {
      await this.#sections.retain({
        contractVersion: '1.0.0', sectionId: 'M03', rendererProfile: 'm03-section-artifact-html-vi-v1',
        metricSetSha256: metricSet.metricSetSha256, chartBundleSha256: chartBundle.chartBundleSha256,
        envelopeSha256: envelope.envelopeSha256, narrativeSha256: narrative.narrativeSha256,
        sectionArtifactSha256: identity, htmlSha256: rendered.artifact.html.sha256,
      }, {
        metricSet: canonicalBytes(metricSet), chartBundle: canonicalBytes(chartBundle),
        envelope: canonicalBytes(envelope), narrative: canonicalBytes(narrative),
        receipt: canonicalBytes(rendered.artifact), html: Buffer.from(rendered.html, 'utf8'),
      });
      await this.#artifacts.publishOwned();
    });
    return identity;
  }
}

function sourceChoices(source: VerifiedFinalizedSourcePackage): ResearchGenerationChoice[] {
  const jsonFiles = source.files.filter(file => file.mediaType === 'application/json').map(file => {
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes)); }
    catch { value = null; }
    return { file, value };
  });
  const methodInputs = discoverMethodInputs(source, jsonFiles);
  const choices: ResearchGenerationChoice[] = [];
  for (const candidate of jsonFiles) {
    if (!validateManifest(candidate.value)) continue;
    const manifest = candidate.value;
    if (manifest.scope.platform !== 'shopee' || manifest.wideUnknownPolicy !== 'exclude') continue;
    for (const workbook of source.files.filter(file => file.mediaType === XLSX && file.sha256 === manifest.source.sha256)) {
      if (workbook.evidenceFamily !== manifest.source.evidenceFamily || candidate.file.evidenceFamily !== manifest.source.evidenceFamily) continue;
      const compatibleLabels = jsonFiles.filter(label => validateLabels(label.value) &&
        label.value.sourceSha256 === workbook.sha256 && label.value.codebookVersion === manifest.labelCodebookVersion &&
        label.file.evidenceFamily === manifest.source.evidenceFamily);
      for (const labels of [null, ...compatibleLabels]) {
        const paths = { workbookPath: workbook.path, manifestPath: candidate.file.path, labelsPath: labels?.file.path ?? null };
        const selectionId = digest(canonicalJson({
          profile: 'web-source-selection-v1', packageId: source.packageId,
          packageManifestSha256: source.manifestArtifactSha256, catalogSha256: RESEARCH_GENERATION_CATALOG_SHA256, ...paths,
        }));
        choices.push({
          selectionId, packageId: source.packageId, packageManifestSha256: source.manifestArtifactSha256,
          sourceLabel: source.manifest.sourceLabel, packageVersion: source.manifest.version,
          sourceName: manifest.source.label,
          period: { start: manifest.scope.start, end: manifest.scope.end, basis: manifest.scope.periodBasis },
          ...paths, eligibility: 'VALIDATE_ON_CREATE',
          methodInputs,
          limitations: ['SOURCE_MAPPING_NOT_PROVIDER_AUTHENTICATION', 'WORKBOOK_AND_LABEL_COVERAGE_CHECKED_ON_CREATE',
            ...LIMITATIONS, ...(labels === null ? ['LABEL_DECISIONS_NOT_BOUND', 'M03_PREPARED_METHOD_NOT_EXECUTED'] : [])],
        });
      }
    }
  }
  return choices;
}

function discoverMethodInputs(
  source: VerifiedFinalizedSourcePackage,
  jsonFiles: readonly { readonly file: VerifiedFinalizedSourcePackage['files'][number]; readonly value: unknown }[],
): ResearchGenerationMethodInputs {
  const candidates: Record<MethodFamily, ResearchGenerationMethodCandidate[]> = {
    descriptiveMethods: [], locatedInsightMethods: [], methodPackets: [],
  };
  for (const { file, value } of jsonFiles) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
    const descriptor = value as Record<string, unknown>;
    const accepted: MethodFamily[] = [];
    if (!Object.hasOwn(descriptor, 'sourcePackage') && validateDescriptiveMethodsInput({
      ...descriptor,
      sourcePackage: {
        packageId: source.packageId, version: source.manifest.version,
        manifestArtifactSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256,
      },
    })) accepted.push('descriptiveMethods');
    if (validateLocatedMethodsInput(value)) accepted.push('locatedInsightMethods');
    if (validateMethodPacketsInput(value)) accepted.push('methodPackets');
    for (const family of accepted) {
      candidates[family].push({
        methodSelectionId: digest(canonicalJson({
          profile: 'web-method-input-selection-v1', packageId: source.packageId,
          packageManifestSha256: source.manifestArtifactSha256, packageContentSha256: source.packageContentSha256,
          family, logicalPath: file.path, sha256: file.sha256,
        })),
        logicalPath: file.path,
        eligibility: 'VALIDATE_ON_CREATE', limitations: [...METHOD_LIMITATIONS],
      });
    }
  }
  for (const family of METHOD_FAMILIES) {
    candidates[family].sort((left, right) => compareCodeUnits(left.logicalPath, right.logicalPath) ||
      compareCodeUnits(left.methodSelectionId, right.methodSelectionId));
  }
  return candidates;
}

function resolveMethodPaths(
  choice: ResearchGenerationChoice,
  selections: ResearchGenerationRequest['methodSelectionIds'],
  conflict: boolean,
): MethodPaths {
  if (selections === undefined) return {};
  const methodInputs = choice.methodInputs ?? {
    descriptiveMethods: [], locatedInsightMethods: [], methodPackets: [],
  };
  const paths: MethodPaths = {};
  for (const family of METHOD_FAMILIES) {
    const selectionId = selections[family];
    if (selectionId === null) continue;
    const candidate = methodInputs[family].find(item => item.methodSelectionId === selectionId);
    if (!candidate) {
      const ErrorType = conflict ? ReportVersionIdentityConflictError : ResearchGenerationSelectionError;
      throw new ErrorType(`The selected ${family} method input is unavailable`);
    }
    const pathKey = family === 'descriptiveMethods' ? 'descriptiveMethodsPath' :
      family === 'locatedInsightMethods' ? 'locatedInsightMethodsPath' : 'methodPacketsPath';
    paths[pathKey] = candidate.logicalPath;
  }
  return paths;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function missingArtifact(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as NodeJS.ErrnoException).code === 'ENOENT' || (error.cause instanceof Error && missingArtifact(error.cause));
}
