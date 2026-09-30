import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import apiSchema from '../../../contracts/api/research-generation-api.schema.json' with { type: 'json' };
import manifestSchema from '../../../contracts/analysis/metric-source-manifest.schema.json' with { type: 'json' };
import labelsSchema from '../../../contracts/analysis/metric-source-labels.schema.json' with { type: 'json' };
import inputSchema from '../../../contracts/analysis/metric-scope-input.schema.json' with { type: 'json' };
import type { ResearchGenerationChoice, ResearchGenerationInputs, ResearchGenerationReceipt, ResearchGenerationRequest } from '../../../contracts/api/research-generation-api.generated.js';
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
const validateRequest = ajv.getSchema<ResearchGenerationRequest>(`${apiSchema.$id}#/$defs/request`)!;
const validateManifest = ajv.compile<MetricSourceManifest>(manifestSchema);
const validateLabels = ajv.compile<MetricSourceLabels>(labelsSchema);
const validateInputs = ajv.getSchema<ResearchGenerationInputs>(`${apiSchema.$id}#/$defs/inputs`)!;
const validateReceipt = ajv.getSchema<ResearchGenerationReceipt>(`${apiSchema.$id}#/$defs/receipt`)!;

export const RESEARCH_GENERATION_CATALOG_SHA256 = '926a175fa9104df4cefde799ad601861d94b4e9d4d7fe1dbf7717dc163a8e255';
const READ_BUDGET = Object.freeze({ maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 });
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LIMITATIONS = ['PARTIAL_REPORT', 'TABLET_QUOTE_NOT_SELECTED', 'NO_AI_INTERPRETATION', 'NOT_REVIEWED'];
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
      choices: choices.sort((a, b) => a.selectionId.localeCompare(b.selectionId)),
    };
    if (!validateInputs(result)) throw new ResearchGenerationIntegrityError('Source inventory violates its contract');
    return result;
  }

  async create(untrusted: unknown): Promise<ResearchGenerationReceipt> {
    if (!validateRequest(untrusted)) throw new ResearchGenerationValidationError('Invalid report creation request');
    const request = structuredClone(untrusted);
    const reportKey = `web-${request.requestKey}`;
    // Committed retries depend only on their pinned package, never global discovery.
    const existing = this.#db.prepare(`
      SELECT source_package_id packageId, source_package_manifest_sha256 manifestSha256,
             workspace_id workspaceId, request_artifact_sha256 requestSha256
      FROM analysis_report_versions WHERE report_id =
        (SELECT report_id FROM analysis_report_series WHERE report_key = ?) AND version = 1
    `).get(reportKey) as { packageId: string; manifestSha256: string; workspaceId: string; requestSha256: string } | undefined;
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
      if (source.packageId !== existing.packageId || source.manifestArtifactSha256 !== existing.manifestSha256) {
        throw new ResearchGenerationIntegrityError('Committed source identity does not match its retained evidence');
      }
      choices = sourceChoices(source);
      if (!choices.some(item => item.selectionId === request.selectionId)) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
      }
    } else {
      choices = (await this.inputs(request.workspaceId)).choices;
    }
    const choice = choices.find(item => item.selectionId === request.selectionId);
    if (!choice) throw new ResearchGenerationSelectionError('The exact selected source is unavailable');
    const preparationRequest: MetricInputPreparationRequest = {
      contractVersion: '1.0.0', workspaceId: request.workspaceId,
      packageId: choice.packageId, packageManifestSha256: choice.packageManifestSha256,
      workbookPath: choice.workbookPath, manifestPath: choice.manifestPath, labelsPath: choice.labelsPath,
    };
    const sourceRequest = {
      ...preparationRequest, catalogSha256: RESEARCH_GENERATION_CATALOG_SHA256,
      tabletQuoteSourcePath: null, tabletQuoteInputPath: null,
    };
    // Reject a reused key with changed evidence before creating intermediate records.
    if (existing) {
      if (existing.packageId !== choice.packageId || existing.manifestSha256 !== choice.packageManifestSha256 || existing.workspaceId !== request.workspaceId) {
        throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
      }
      try {
        const saved = JSON.parse((await this.#artifacts.read(existing.requestSha256, { maxBytes: 64 * 1024 })).toString('utf8')) as { sourceRequest?: unknown; reportPresentation?: unknown };
        if (saved.reportPresentation !== 'report-kit-v1' || canonicalJson(saved.sourceRequest) !== canonicalJson(sourceRequest)) {
          throw new ReportVersionIdentityConflictError('Request key is already bound to another source selection');
        }
      } catch (error) {
        // A10 verifies the complete expected request when recovering missing publication.
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
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
        sourceRequest, preparationSha256: prepared.preparationSha256,
        readinessSha256: readiness.readinessSha256, sectionArtifactSha256,
      }, this.#catalog);
    } else {
      execution = await this.#artifacts.withOwnership(async () => {
        const result = await this.#reports.createVersion({
          contractVersion: '1.0.0', reportPresentation: 'report-kit-v1', reportKey, version: 1, previousSemanticVersionId: null, sourceRequest,
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
          limitations: ['SOURCE_MAPPING_NOT_PROVIDER_AUTHENTICATION', 'WORKBOOK_AND_LABEL_COVERAGE_CHECKED_ON_CREATE',
            ...LIMITATIONS, ...(labels === null ? ['LABEL_DECISIONS_NOT_BOUND', 'M03_PREPARED_METHOD_NOT_EXECUTED'] : [])],
        });
      }
    }
  }
  return choices;
}

function missingArtifact(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (error as NodeJS.ErrnoException).code === 'ENOENT' || (error.cause instanceof Error && missingArtifact(error.cause));
}
