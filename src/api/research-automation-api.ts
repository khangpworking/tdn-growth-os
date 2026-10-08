import { createKeywordCliproxyTransport, type KeywordDraftConfiguration } from '../modules/analysis/research-automation/keyword-cliproxy-transport.js';
import path from 'node:path';
import { createHash } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import BetterSqlite3 from 'better-sqlite3';
import AjvModule from 'ajv/dist/2020.js';
import addFormatsModule from 'ajv-formats';
import schema from '../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import sourceSchema from '../../contracts/api/research-automation-source-api.schema.json' with { type: 'json' };
import revisionRequestSchema from '../../contracts/analysis/automation-report-revision.schema.json' with { type: 'json' };
import marketPresentationRevisionSchema from '../../contracts/analysis/automation-market-presentation-revision.schema.json' with { type: 'json' };
import classifiedRevisionRequestSchema from '../../contracts/analysis/automation-classified-report-revision.schema.json' with { type: 'json' };
import revisionSchema from '../../contracts/api/research-automation-revision-api.schema.json' with { type: 'json' };
import metricIntakeSchema from '../../contracts/api/research-automation-metric-intake-api.schema.json' with { type: 'json' };
import supplementalIntakeSchema from '../../contracts/api/research-automation-supplemental-intake-api.schema.json' with { type: 'json' };
import foundationIntakeSchema from '../../contracts/foundation/source-package-intake-request.schema.json' with { type: 'json' };
import metricRuleSchema from '../../contracts/analysis/automation-metric-rule-adoption.schema.json' with { type: 'json' };
import membershipSchema from '../../contracts/analysis/automation-metric-membership.schema.json' with { type: 'json' };
import membershipApiSchema from '../../contracts/api/research-automation-metric-membership-api.schema.json' with { type: 'json' };
import insightRevisionRequestSchema from '../../contracts/analysis/automation-insight-report-revision.schema.json' with { type: 'json' };
import boundedRevisionRequestSchema from '../../contracts/analysis/automation-bounded-report-revision.schema.json' with { type: 'json' };
import quoteRevisionRequestSchema from '../../contracts/analysis/automation-quote-report-revision.schema.json' with { type: 'json' };
import locatedInsightSchema from '../../contracts/analysis/located-insight-methods.schema.json' with { type: 'json' };
import insightSelectionSchema from '../../contracts/analysis/automation-insight-selection.schema.json' with { type: 'json' };
import insightCodingSchema from '../../contracts/analysis/automation-insight-coding.schema.json' with { type: 'json' };
import insightCodingApiSchema from '../../contracts/api/research-automation-insight-coding-api.schema.json' with { type: 'json' };
import insightModelSchema from '../../contracts/analysis/automation-insight-model.schema.json' with { type: 'json' };
import insightModelApiSchema from '../../contracts/api/research-automation-insight-model-api.schema.json' with { type: 'json' };
import readerInputSchema from '../../contracts/analysis/reader-report-input.schema.json' with { type: 'json' };
import defaultPeerSchema from '../../contracts/analysis/default-market-peers.schema.json' with { type: 'json' };
import readerApiSchema from '../../contracts/api/research-automation-reader-report-api.schema.json' with { type: 'json' };
import sourceStatusSchema from '../../contracts/api/research-automation-source-status-api.schema.json' with { type: 'json' };
import { buildResearchAutomationSourceStatus } from '../modules/analysis/research-automation/source-status.js';
import type { ResearchInsightModelResponse } from '../../contracts/api/research-automation-insight-model-api.generated.js';
import type { InsightModelConfiguration } from '../modules/analysis/research-automation/insight-model-execution.js';
import { AutomationSynthesisExecutionError } from '../modules/analysis/research-automation/synthesis-execution.js';
import { LocatedInsightValidationError } from '../modules/analysis/located-insight-methods.js';
import { MAX_INSIGHT_CODING_BYTES } from '../modules/analysis/research-automation/insight-coding.js';
import { MetricSourceRejection } from '../modules/analysis/metric-source-profile.js';
import { MAX_METRIC_UPLOAD_BYTES } from '../modules/analysis/research-automation/metric-source-intake.js';
import { MAX_SUPPLEMENTAL_FILE_BYTES, MAX_SUPPLEMENTAL_TOTAL_BYTES, SupplementalSourceRejection } from '../modules/analysis/research-automation/supplemental-source-intake.js';
import kalodataVideoIntakeSchema from '../../contracts/analysis/kalodata-video-intake-v1.schema.json' with { type: 'json' };
import { AutomationKalodataVideoIntake, KalodataVideoRejection, MAX_VIDEO_UPLOAD_BYTES, readPreparedKalodataVideoSources } from '../modules/analysis/research-automation/kalodata-video-intake.js';
import { FoundationSourcePackageReader } from '../modules/foundation/source-package-reader.js';
import { withDatabaseMutationMutex } from '../platform/db/database-mutation-mutex.js';
import { MAX_UNIT_SPEC_FILE_BYTES, MAX_UNIT_SPEC_TOTAL_BYTES, MAX_UNIT_SPEC_FILES } from '../modules/analysis/research-automation/reader-unit-spec-intake.js';
import { RequestScopedArtifactStore } from './request-scoped-artifact-store.js';
import { SourcePackageRequestConflictError, SourcePackageService } from '../modules/foundation/source-package-service.js';
import { ContentAddressedArtifactStore } from '../platform/artifacts/artifact-store.js';
import { DiscoveryWorkspaceService, FlowDiscoveryWorkspaceReader } from '../modules/flow/index.js';
import { ResearchAutomationService } from '../modules/analysis/research-automation/service.js';
import { ResearchAutomationWorker } from '../modules/analysis/research-automation/worker.js';
import { bindResearchAutomationProvider } from '../modules/analysis/research-automation/source-binding.js';
import { createResearchAutomationProviderRegistry, type ResearchAutomationProviderConfig, type ProviderTransport } from '../modules/analysis/research-automation/providers.js';
import { buildResearchAutomationReport } from '../modules/analysis/research-automation/reports.js';
import { createChromiumPdfRenderer } from '../modules/analysis/research-automation/pdf.js';
import { createI14CliproxySynthesisAi, createDecisionCliproxySynthesisAi, createInsightCodingCliproxyAi } from '../modules/analysis/research-automation/i14-cliproxy-transport.js';
import type { AutomationI14SynthesisConfiguration } from '../modules/analysis/research-automation/i14-synthesis-execution.js';
import type { AutomationDecisionSynthesisConfiguration, AutomationDecisionExecutionRequest } from '../modules/analysis/research-automation/decision-synthesis-execution.js';
import type { AutomationDecisionSectionId } from '../modules/analysis/research-automation/decision-packets.js';
import type { CliproxyConfiguration } from '../platform/ai/cliproxy-configuration.js';
import { ApifyShopeeCollector } from '../platform/collectors/apify-shopee.js';
import { ResearchAutomationConflictError, ResearchAutomationNotFoundError, ResearchAutomationValidationError } from '../modules/analysis/research-automation/model.js';
import { assertOwnerHttpConfiguration, EmptyBodyError, ownerAuthorized, PayloadTooLargeError, readOwnerBytes, sendApiJson, singleHeader, type OwnerHttpConfiguration } from './owner-http.js';

export interface ResearchAutomationApiConfiguration {
  /** Independently configured list drafting; other model flags grant no calls here. */
  readonly keywordDrafting?: { readonly cliproxy: CliproxyConfiguration; readonly configuration: KeywordDraftConfiguration };
  readonly pageIndex?: import('../modules/analysis/research-automation/service.js').ResearchAutomationServiceOptions['pageIndex'];
  readonly databasePath: string;
  readonly artifactRoot: string;
  readonly origin: string;
  readonly owner?: OwnerHttpConfiguration;
  readonly providers?: ResearchAutomationProviderConfig;
  readonly pdfExecutablePath?: string;
  /** Opt-in I14 synthesis for the OWNER writer only. */
  readonly i14Synthesis?: { readonly cliproxy: CliproxyConfiguration; readonly configuration: AutomationI14SynthesisConfiguration };
  /** Independently enabled coding proposals. Never grants acceptance or report admission. */
  readonly insightCoding?: { readonly cliproxy: CliproxyConfiguration; readonly configuration: InsightModelConfiguration };
  readonly decisionSynthesis?: {
    readonly cliproxy: CliproxyConfiguration;
    readonly configurations: Partial<Record<AutomationDecisionSectionId, AutomationDecisionSynthesisConfiguration>>;
  };
}
export interface ResearchAutomationApiApplication {
  handler(request: IncomingMessage, response: ServerResponse): void;
  close(): Promise<void>;
}
const Ajv = AjvModule.default;
const addFormats = addFormatsModule.default;
const ajv = new Ajv({ allErrors: false, strict: true });
addFormats(ajv);
ajv.addSchema(defaultPeerSchema);
ajv.addSchema(schema);
ajv.addSchema(sourceSchema);
ajv.addSchema(revisionRequestSchema);
ajv.addSchema(marketPresentationRevisionSchema);
ajv.addSchema(classifiedRevisionRequestSchema);
ajv.addSchema(revisionSchema);
ajv.addSchema(metricIntakeSchema);
ajv.addSchema([foundationIntakeSchema, supplementalIntakeSchema]);
ajv.addSchema(kalodataVideoIntakeSchema);
ajv.addSchema(metricRuleSchema);
ajv.addSchema(membershipSchema); ajv.addSchema(membershipApiSchema);
ajv.addSchema(insightRevisionRequestSchema);
ajv.addSchema(boundedRevisionRequestSchema);
ajv.addSchema(quoteRevisionRequestSchema);
ajv.addSchema(locatedInsightSchema); ajv.addSchema(insightSelectionSchema); ajv.addSchema(insightCodingSchema); ajv.addSchema(insightCodingApiSchema);
ajv.addSchema(insightModelSchema); ajv.addSchema(insightModelApiSchema);
ajv.addSchema(readerInputSchema); ajv.addSchema(readerApiSchema);
ajv.addSchema(sourceStatusSchema);
const validates = {
  start: ajv.compile({ $ref: `${schema.$id}#/$defs/startRequest` }),
  confirm: ajv.compile({ oneOf: [{ $ref: `${schema.$id}#/$defs/confirmRequest` }, { $ref: sourceSchema.$id }] }),
  cancel: ajv.compile({ $ref: `${schema.$id}#/$defs/cancelRequest` }),
  revision: ajv.compile({ oneOf: [{ $ref: revisionRequestSchema.$id }, { $ref: classifiedRevisionRequestSchema.$id }, { $ref: insightRevisionRequestSchema.$id }, { $ref: boundedRevisionRequestSchema.$id }, { $ref: quoteRevisionRequestSchema.$id }, { $ref: marketPresentationRevisionSchema.$id }] }),
  revisionCancel: ajv.compile({ $ref: `${revisionSchema.$id}#/$defs/cancelRequest` }),
  revisionReceipt: ajv.compile({ $ref: `${revisionSchema.$id}#/$defs/receipt` }),
  versionList: ajv.compile({ $ref: `${revisionSchema.$id}#/$defs/versionList` }),
  attemptList: ajv.compile({ $ref: `${revisionSchema.$id}#/$defs/attemptList` }),
  metricPrepare: ajv.compile({ $ref: `${metricIntakeSchema.$id}#/$defs/request` }),
  supplementalPrepare: ajv.compile({ $ref: `${supplementalIntakeSchema.$id}#/$defs/request` }),
  supplementalPrepared: ajv.compile({ $ref: `${supplementalIntakeSchema.$id}#/$defs/receipt` }),
  videoPrepare: ajv.compile({ $ref: `${kalodataVideoIntakeSchema.$id}#/$defs/request` }),
  videoPrepared: ajv.compile({ $ref: `${kalodataVideoIntakeSchema.$id}#/$defs/receipt` }),
  videoPreparedList: ajv.compile({ $ref: `${kalodataVideoIntakeSchema.$id}#/$defs/preparedList` }),
  supplementalPreparedList: ajv.compile({ $ref: `${supplementalIntakeSchema.$id}#/$defs/preparedList` }),
  metricPrepared: ajv.compile({ $ref: `${metricIntakeSchema.$id}#/$defs/receipt` }),
  metricPreparedList: ajv.compile({ $ref: `${metricIntakeSchema.$id}#/$defs/preparedList` }),
  metricRuleAdopt: ajv.compile({ $ref: `${metricRuleSchema.$id}#/$defs/request` }),
  metricRuleReceipt: ajv.compile({ $ref: `${metricRuleSchema.$id}#/$defs/receipt` }),
  metricRuleList: ajv.compile({ $ref: `${metricRuleSchema.$id}#/$defs/list` }),
  membershipPropose: ajv.compile({ $ref: `${membershipSchema.$id}#/$defs/propose` }),
  membershipAccept: ajv.compile({ $ref: `${membershipSchema.$id}#/$defs/accept` }),
  membershipResponse: ajv.compile({ $ref: membershipApiSchema.$id }),
  insightAdopt: ajv.compile({ $ref: `${insightCodingApiSchema.$id}#/$defs/adoptRequest` }),
  insightPropose: ajv.compile({ $ref: `${insightCodingApiSchema.$id}#/$defs/proposeRequest` }),
  insightLiteralPropose: ajv.compile({ $ref: `${insightCodingApiSchema.$id}#/$defs/literalProposeRequest` }),
  insightAccept: ajv.compile({ $ref: `${insightCodingApiSchema.$id}#/$defs/acceptRequest` }),
  insightMutation: ajv.compile({ $ref: `${insightCodingApiSchema.$id}#/$defs/mutation` }),
  insightView: ajv.compile({ $ref: `${insightCodingApiSchema.$id}#/$defs/anyView` }),
  insightDefaultModelRequest: ajv.compile({ $ref: `${insightModelApiSchema.$id}#/$defs/defaultRequest` }),
    insightModelRequest: ajv.compile({ $ref: `${insightModelApiSchema.$id}#/$defs/request` }),
  insightModelResponse: ajv.compile({ $ref: `${insightModelApiSchema.$id}#/$defs/response` }),
  sourceStatus: ajv.compile({ $ref: `${sourceStatusSchema.$id}#/$defs/status` }),
  runPdfs: ajv.compile({ $ref: `${sourceStatusSchema.$id}#/$defs/runPdfStates` }),
  attachPdf: ajv.compile({ $ref: `${sourceStatusSchema.$id}#/$defs/attachPdfRequest` }),
  readerBuild: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/buildSubmission` }),
  unitSpecIntake: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/unitSpecIntakeRequest` }),
  unitSpecIntakeReceipt: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/unitSpecIntakeReceipt` }),
  readerBuildReceipt: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/buildReceipt` }),
  readerDecision: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/decisionRequest` }),
  readerDecisionReceipt: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/decisionReceipt` }),
  readerList: ajv.compile({ $ref: `${readerApiSchema.$id}#/$defs/list` }),
};
/** Inline JSON body of a reader build: profile, declared source and an optional inline cover image. */
const MAX_READER_BUILD_BYTES = 4 * 1024 * 1024 + 512 * 1024;
const REPORT_CSP = "default-src 'none'; style-src 'unsafe-inline'; font-src data:; img-src data:; base-uri 'none'; form-action 'none'";
/** The reader page keeps its own small inline scripts (appendix filter); only their exact hashes may run. */
function readerCsp(html: Buffer): string {
  const hashes = [...html.toString('utf8').matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => `'sha256-${createHash('sha256').update(m[1]!, 'utf8').digest('base64')}'`);
  return hashes.length ? `${REPORT_CSP}; script-src ${[...new Set(hashes)].join(' ')}` : REPORT_CSP;
}
// Keep in step with the executor wiring below: the run source is KALODATA, Shopee reviews go
// through the Apify collector when its cap is configured, and web search runs beside the product
// source whenever its key is configured.
const SOURCES_WIRED_INTO_RUNS = { kalodata: true, serpapi: true, apifyShopee: true } as const;
const insightWrites = {
  'insight-coding-adoptions': { kind: 'ADOPTION', validate: validates.insightAdopt },
  'insight-coding-proposals': { kind: 'PROPOSAL', validate: validates.insightPropose },
  'insight-coding-literal-proposals': { kind: 'PROPOSAL', validate: validates.insightLiteralPropose },
  'insight-coding-receipts': { kind: 'RECEIPT', validate: validates.insightAccept },
} as const;

export function researchAutomationApiPath(pathname: string): boolean {
  return /^\/(?:api|owner-api)\/workspaces\/[^/]+\/research-automation(?:\/|$)/.test(pathname);
}

/** Two application handles: GET is query-only; only the existing operator executor owns the worker. */
export function openResearchAutomationApi(configuration: ResearchAutomationApiConfiguration, transport?: ProviderTransport): ResearchAutomationApiApplication {
  const origin = new URL(configuration.origin);
  if (origin.origin !== configuration.origin || !['http:', 'https:'].includes(origin.protocol)) throw new TypeError('Automation requires an exact origin');
  if (configuration.owner) {
    assertOwnerHttpConfiguration(configuration.owner);
    if (configuration.owner.allowedOrigin !== configuration.origin ||
        path.resolve(configuration.owner.databasePath) !== path.resolve(configuration.databasePath) ||
        path.resolve(configuration.owner.artifactRoot) !== path.resolve(configuration.artifactRoot)) {
      throw new TypeError('Automation OWNER configuration must match its read application');
    }
  }
  if (configuration.i14Synthesis && !configuration.owner) throw new TypeError('Automation I14 synthesis requires the OWNER writer');
  if (configuration.keywordDrafting && !configuration.owner) throw new TypeError('Keyword drafting requires the OWNER writer');
  const keywordTransport = configuration.keywordDrafting ? createKeywordCliproxyTransport(configuration.keywordDrafting) : undefined;
  const sourceEvidence = { modelIdentity: configuration.keywordDrafting ? `cliproxy:${configuration.keywordDrafting.configuration.modelId}` : 'unconfigured',
    promptVersion: 'l9-keyword-prompt-v1', ...(configuration.keywordDrafting ? { configuration: configuration.keywordDrafting.configuration } : {}) };
  const i14SynthesisAi = configuration.i14Synthesis ? createI14CliproxySynthesisAi(configuration.i14Synthesis) : undefined;
  if (configuration.insightCoding && !configuration.owner) throw new TypeError('Automation Insight coding requires the OWNER writer');
  const insightCodingAi = configuration.insightCoding ? createInsightCodingCliproxyAi(configuration.insightCoding) : null;
  if (configuration.decisionSynthesis && !configuration.owner) throw new TypeError('Automation decision synthesis requires the OWNER writer');
  const decisionSynthesisAi: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionRequest['ai']>> = {};
  if (configuration.decisionSynthesis) {
    for (const [key, value] of Object.entries(configuration.decisionSynthesis.configurations)) {
      if (!['M11', 'M12', 'I15'].includes(key) || value?.sectionId !== key) throw new TypeError('Automation decision synthesis section configuration mismatch');
      decisionSynthesisAi[key as AutomationDecisionSectionId] = createDecisionCliproxySynthesisAi({ cliproxy: configuration.decisionSynthesis.cliproxy, configuration: value });
    }
  }
  const reader = new BetterSqlite3(path.resolve(configuration.databasePath), { readonly: true, fileMustExist: true });
  let writer: BetterSqlite3.Database | undefined;
  let worker: ResearchAutomationWorker | undefined;
  let pdf: ReturnType<typeof createChromiumPdfRenderer> | undefined;
  let ready: Promise<void> = Promise.resolve();
  let startupFailed = false;
  let closing = false;
  // Explicit coding calls are not worker jobs. Shutdown must settle their retained
  // outcome before closing SQLite; aborting never authorizes a paid retry.
  const modelRequests = new Map<AbortController, Promise<unknown>>();
  const artifacts = new ContentAddressedArtifactStore(path.resolve(configuration.artifactRoot));
  const create = (db: BetterSqlite3.Database, extra: Partial<ConstructorParameters<typeof ResearchAutomationService>[0]> = {}) => new ResearchAutomationService({
    db, artifactStore: artifacts, sourceEvidence, ...(configuration.pageIndex ? { pageIndex: configuration.pageIndex } : {}), workspaceReader: new FlowDiscoveryWorkspaceReader(new DiscoveryWorkspaceService({ db, artifactStore: artifacts })), ...extra,
  });
  let readService: ResearchAutomationService;
  let writeService: ResearchAutomationService | undefined;
  try {
    reader.pragma('query_only = ON'); reader.pragma('foreign_keys = ON'); reader.defaultSafeIntegers(true);
    if (!reader.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='analysis_research_automation_runs'").get()) throw new TypeError('Apply the automation migration before startup');
    readService = create(reader);
    if (configuration.owner) {
      writer = new BetterSqlite3(path.resolve(configuration.databasePath), { fileMustExist: true });
      writer.pragma('foreign_keys = ON'); writer.pragma('busy_timeout = 5000'); writer.defaultSafeIntegers(true);
      const registry = createResearchAutomationProviderRegistry(configuration.providers ?? { kalodataSecretKey: null, serpApiKey: null, apifyTokenConfigured: false }, transport);
      const selected = registry.get('KALODATA');
      // Web search runs beside the product source, only when its key is set on the server.
      const webSource = configuration.providers?.serpApiKey ? bindResearchAutomationProvider(registry.get('SERPAPI')) : undefined;
      if (configuration.pdfExecutablePath) pdf = createChromiumPdfRenderer({ executablePath: configuration.pdfExecutablePath });
      writeService = create(writer, {
        sourceEvidence: { ...sourceEvidence, ...(keywordTransport ? { transport: keywordTransport } : {}) },
        metricAttachmentStore: new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot)),
        actorId: configuration.owner.actorId, source: bindResearchAutomationProvider(selected), ...(webSource ? { webSource } : {}),
        ...(i14SynthesisAi ? { i14SynthesisAi } : {}),
        decisionSynthesisAi,
        ...(configuration.providers?.apifyReviews ? { shopeeCollectorFactory: () => {
          let requests = 0;
          const config = configuration.providers!.apifyReviews!;
          // Cover the actor's 300-second timeout plus a small terminal-state
          // margin. This polls the same run; it never retries a paid POST.
          return { requestsIssued: () => requests, collector: new ApifyShopeeCollector({ token: config.token, maxChargeUsd: config.maxChargeUsd, maxPolls: 155,
            ...(config.maxReviewsPerProduct !== undefined ? { maxReviewsPerProduct: config.maxReviewsPerProduct } : {}), retainReturnedPages: true,
            journalRoot: path.join(path.dirname(path.resolve(configuration.databasePath)), 'research-automation-apify-journal'), contentFilter: 'all',
            fetch: async (input, init) => { requests++; return fetch(input, init); } }) };
        } } : {}),
        renderer: async (input, kind, signal) => {
          const report = buildResearchAutomationReport(input, kind);
          if (!pdf) return { ...report, pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' };
          try { return { ...report, pdf: await pdf.render(report.html, signal) }; }
          catch { if (signal?.aborted) throw new Error('Research rendering stopped'); return { ...report, pdfUnavailableCode: 'PDF_RENDER_FAILED' }; }
        },
      });
      worker = new ResearchAutomationWorker({ service: writeService, db: writer });
      ready = worker.start().catch(() => { startupFailed = true; });
    }
  } catch (error) { void pdf?.close(); writer?.close(); reader.close(); throw error; }
  let closePromise: Promise<void> | undefined;
  return {
    handler: (request, response) => { void route(request, response).catch(() => { if (!response.headersSent) fail(response, 500, 'integrity_error', 'Stored research evidence failed verification'); else response.destroy(); }); },
    close() {
      if (closePromise) return closePromise;
      closing = true;
      closePromise = (async () => {
        const failures: unknown[] = [];
        for (const controller of modelRequests.keys()) controller.abort();
        await Promise.allSettled(modelRequests.values());
        try { await ready; await worker?.close(); } catch (error) { failures.push(error); }
        try { await pdf?.close(); } catch (error) { failures.push(error); }
        try { writer?.close(); } catch (error) { failures.push(error); }
        try { reader.close(); } catch (error) { failures.push(error); }
        if (failures.length) throw failures[0];
      })();
      return closePromise;
    },
  };

  async function route(request: IncomingMessage, response: ServerResponse): Promise<void> {
    if (closing) return fail(response, 503, 'service_unavailable', 'Research executor is stopping');
    if (singleHeader(request.headers.host) !== origin.host) return fail(response, 403, 'forbidden', 'Host is not allowed');
    const suppliedOrigin = singleHeader(request.headers.origin);
    if (suppliedOrigin !== undefined && suppliedOrigin !== origin.origin) return fail(response, 403, 'forbidden', 'Origin is not allowed');
    const raw = request.url ?? '';
    if (!raw.startsWith('/') || raw.startsWith('//') || raw.includes('#') || raw.includes('%')) return fail(response, 400, 'bad_request', 'Malformed request route');
    const url = new URL(raw, origin);
    if (url.search) return fail(response, 400, 'bad_request', 'Query parameters are not supported');
    const statusMatch = /^\/api\/workspaces\/([0-9a-f-]{36})\/research-automation\/source-status$/.exec(url.pathname);
    if (statusMatch) return sourceStatus(request, response, statusMatch[1]!);
    const recheckMatch = /^\/owner-api\/workspaces\/([0-9a-f-]{36})\/research-automation\/source-status\/pageindex\/recheck$/.exec(url.pathname);
    const match = recheckMatch ? [recheckMatch[0], 'owner-api', recheckMatch[1], undefined, 'pageindex-recheck']
      : /^\/(api|owner-api)\/workspaces\/([0-9a-f-]{36})\/research-automation\/runs(?:\/([0-9a-f-]{36})(?:\/(.+))?)?$/.exec(url.pathname);
    if (!match) return fail(response, 404, 'not_found', 'Route not found');
    const [, prefix, workspaceId, runId, action] = match;
    const originalReport = /^reports\/(market|insight)(\/pdf)?$/.exec(action ?? '');
    const versionReport = /^report-versions\/([0-9a-f]{64})\/reports\/(market|insight)(\/pdf)?$/.exec(action ?? '');
    const revisionRead = /^report-attempts\/([0-9a-f-]{36})$/.exec(action ?? '');
    const revisionCancel = /^report-attempts\/([0-9a-f-]{36})\/cancel$/.exec(action ?? '');
    const metricRuleRead = /^metric-rule-adoptions\/([0-9a-f-]{36})$/.exec(action ?? '');
    const membershipReview = /^metric-membership\/([0-9a-f]{64})\/([0-9a-f-]{36})$/.exec(action ?? '');
    const membershipRead = /^metric-membership-(proposals|receipts)\/([0-9a-f-]{36})$/.exec(action ?? '');
    const membershipWrite = action === 'metric-membership-proposals' || action === 'metric-membership-receipts';
    const insightRead = /^insight-coding\/([0-9a-f]{64})$/.exec(action ?? '');
    const insightWrite = action !== undefined && Object.hasOwn(insightWrites, action) ? insightWrites[action as keyof typeof insightWrites] : undefined;
    const insightDefaultModelWrite = action === 'insight-coding-default-model-proposals';
    const insightModelWrite = action === 'insight-coding-model-proposals' || insightDefaultModelWrite;
    const readerHtml = /^reader-reports\/([0-9a-f-]{36})\/html$/.exec(action ?? '');
    const readerUnitSpecIntake = action === 'reader-reports/unit-spec-intakes';
    const readerAction = readerUnitSpecIntake || action === 'reader-reports' || action === 'reader-reports/decisions' || Boolean(readerHtml);
    const report = originalReport?.[1] ?? versionReport?.[2];
    const pdfSuffix = originalReport?.[2] ?? versionReport?.[3];
    const mutation = prefix === 'owner-api';
    const allowed = mutation
      ? !runId || action === 'source-pdfs' || action === 'confirm-scope' || action === 'cancel' || action === 'report-revisions' || action === 'sources/metric' || action === 'sources/supplemental' || action === 'sources/kalodata-video' || action === 'metric-rule-adoptions' || membershipWrite || Boolean(insightWrite) || insightModelWrite || insightDefaultModelWrite || Boolean(revisionCancel) || readerUnitSpecIntake || action === 'reader-reports' || action === 'reader-reports/decisions'
      : !action || action === 'pageindex' || action === 'reader-reports' || Boolean(readerHtml) || action === 'report-versions' || action === 'report-attempts' || action === 'sources/metric' || action === 'sources/supplemental' || action === 'sources/kalodata-video' || action === 'metric-rule-adoptions' || Boolean(metricRuleRead) || Boolean(membershipReview) || Boolean(membershipRead) || Boolean(insightRead) || Boolean(report) || Boolean(revisionRead);
    if (!allowed) return fail(response, 404, 'not_found', 'Route not found');
    const method = mutation ? 'POST' : 'GET';
    response.setHeader('Allow', mutation ? 'POST, OPTIONS' : 'GET');
    if (mutation) {
      if (!configuration.owner || !writeService) return fail(response, 403, 'forbidden', 'OWNER writes are disabled');
      if (suppliedOrigin !== origin.origin) return fail(response, 403, 'forbidden', 'Exact Origin is required');
      response.setHeader('Access-Control-Allow-Origin', origin.origin); response.setHeader('Vary', 'Origin');
      response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); response.setHeader('Access-Control-Allow-Methods', 'POST');
      if (request.method === 'OPTIONS') {
        const headers = (singleHeader(request.headers['access-control-request-headers']) ?? '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
        if (singleHeader(request.headers['access-control-request-method']) !== 'POST' || !headers.includes('authorization') || headers.some(header => !['authorization', 'content-type'].includes(header))) return fail(response, 403, 'forbidden', 'Preflight is not allowed');
        response.writeHead(204, { 'Content-Length': '0', 'Cache-Control': 'no-store' }); response.end(); return;
      }
      if (!ownerAuthorized(request, configuration.owner.token)) { response.setHeader('WWW-Authenticate', 'Bearer'); return fail(response, 401, 'unauthorized', 'Authentication required'); }
    }
    if (request.method !== method) return fail(response, 405, 'method_not_allowed', 'Method is not supported');
    try {
      if (!mutation) {
        if (!runId) return sendApiJson(response, 200, await readService.listRuns(workspaceId!));
        if (action === 'pageindex') {
          const result = { contractVersion: 'research-automation-run-pdfs-v1', workspaceId, runId,
            ...await readService.pageIndexStatesForRun(workspaceId!, runId) };
          if (!validates.runPdfs(result)) throw new Error('PDF state projection failed validation');
          return sendApiJson(response, 200, result);
        }
        if (membershipReview || membershipRead) {
          const result = membershipReview ? await readService.readMetricMembership(workspaceId!, runId, membershipReview[1]!, membershipReview[2]!)
            : membershipRead![1] === 'proposals' ? await readService.readMetricMembershipProposal(workspaceId!, runId, membershipRead![2]!)
              : await readService.readMetricMembershipReceipt(workspaceId!, runId, membershipRead![2]!);
          if (!validates.membershipResponse(result)) throw new Error('Metric membership projection failed validation');
          return sendApiJson(response, 200, result);
        }
        if (insightRead) {
          // Explicit pair only: verified history, never an implicit latest pair or a currency claim.
          const result = await readService.readInsightCoding(workspaceId!, runId, insightRead[1]!);
          if (!validates.insightView(result)) throw new Error('Insight coding projection failed validation');
          return sendApiJson(response, 200, result);
        }
        if (action === 'reader-reports') {
          const result = await readService.listReaderReports(workspaceId!, runId);
          if (!validates.readerList(result)) throw new Error('Reader report list failed validation');
          return sendApiJson(response, 200, result);
        }
        if (readerHtml) {
          // Owner reader page only; the automated draft stays behind its own routes.
          const page = await readService.readReaderReport(workspaceId!, runId, readerHtml[1]!);
          response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': page.bytes.length, 'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': readerCsp(page.bytes) });
          response.end(page.bytes); return;
        }
        if (action === 'metric-rule-adoptions' || metricRuleRead) {
          const result = metricRuleRead ? await readService.getMetricRuleAdoption(workspaceId!, runId, metricRuleRead[1]!)
            : await readService.listMetricRuleAdoptions(workspaceId!, runId);
          if (!(metricRuleRead ? validates.metricRuleReceipt : validates.metricRuleList)(result)) throw new Error('Rule adoption projection failed validation');
          return sendApiJson(response, 200, result);
        }
        if (action === 'sources/metric') {
          const result = await readService.listPreparedMetricSources(workspaceId!, runId);
          if (!validates.metricPreparedList(result)) throw new Error('Prepared source inventory failed validation');
          return sendApiJson(response, 200, result);
        }
        if (action === 'sources/supplemental') {
          const result = await readService.listPreparedSupplementalSources(workspaceId!, runId);
          if (!validates.supplementalPreparedList(result)) throw new Error('Prepared supplemental inventory failed validation');
          return sendApiJson(response, 200, result);
        }
        if (action === 'sources/kalodata-video') {
          await readService.getRun(workspaceId!, runId);
          const inventory = new FoundationSourcePackageReader(new SourcePackageService({ db: reader, artifactStore: artifacts }));
          const result = await readPreparedKalodataVideoSources(inventory, { runId: runId!, workspaceId: workspaceId! });
          if (!validates.videoPreparedList(result)) throw new Error('Prepared video inventory failed validation');
          return sendApiJson(response, 200, result);
        }
        if (action === 'report-versions') {
          const result = { contractVersion: 'automation-report-version-list-v1', workspaceId: workspaceId!, runId,
            versions: await readService.listReportVersions(workspaceId!, runId) };
          if (!validates.versionList(result)) throw new Error('Report version projection failed validation');
          return sendApiJson(response, 200, result);
        }
        if (action === 'report-attempts') {
          const result = { contractVersion: 'automation-report-attempt-list-v1', workspaceId: workspaceId!, runId,
            attempts: await readService.listReportAttempts(workspaceId!, runId) };
          if (!validates.attemptList(result)) throw new Error('Report attempt inventory failed validation');
          return sendApiJson(response, 200, result);
        }
        if (revisionRead) {
          const result = await readService.getReportRevision(workspaceId!, runId, revisionRead[1]!);
          if (!validates.revisionReceipt(result)) throw new Error('Report revision projection failed validation');
          return sendApiJson(response, 200, result);
        }
        if (!report) return sendApiJson(response, 200, await readService.getRun(workspaceId!, runId));
        const output = await readService.readReport(workspaceId!, runId, report === 'market' ? 'MARKET' : 'INSIGHT', Boolean(pdfSuffix), versionReport?.[1]);
        response.writeHead(200, { 'Content-Type': output.mediaType, 'Content-Length': output.bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': REPORT_CSP, ...(pdfSuffix ? { 'Content-Disposition': `attachment; filename="${report}-report.pdf"` } : {}) });
        response.end(output.bytes); return;
      }
      await ready;
      if (startupFailed || worker?.lastError !== undefined) return fail(response, 503, 'service_unavailable', 'Research executor is unavailable');
      if (action === 'pageindex-recheck') {
        let input: unknown;
        try { input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readOwnerBytes(request, 1024))); }
        catch (error) { if (error instanceof PayloadTooLargeError || error instanceof EmptyBodyError) throw error; return fail(response, 400, 'bad_request', 'Thông tin kiểm tra không đúng định dạng.'); }
        if (typeof input !== 'object' || input === null || Array.isArray(input) || Object.keys(input).length)
          return fail(response, 400, 'bad_request', 'Kiểm tra lại không nhận tham số.');
        await readService.readSourceActivity(workspaceId!);
        await writeService!.recheckPageIndex();
        const result = await sourceStatusProjection(workspaceId!);
        return sendApiJson(response, 200, result);
      }
      if (readerUnitSpecIntake) {
        // Exact Origin, configured write permission and OWNER authentication already passed.
        const contentType = singleHeader(request.headers['content-type']);
        if (!contentType?.startsWith('multipart/form-data;')) return fail(response, 400, 'bad_request', 'Chọn các tệp quy cách bằng biểu mẫu tải lên.');
        const bytes = await readOwnerBytes(request, MAX_UNIT_SPEC_TOTAL_BYTES + 512 * 1024 + 64 * 1024);
        let form: FormData;
        try { form = await new Request(origin.origin, { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(bytes) }).formData(); }
        catch { return fail(response, 400, 'bad_request', 'Không đọc được biểu mẫu quy cách.'); }
        const fields = [...form.entries()], metadata = form.get('metadata');
        if (typeof metadata !== 'string' || Buffer.byteLength(metadata) > 512 * 1024 || form.getAll('metadata').length !== 1 || fields.length < 2 || fields.length > MAX_UNIT_SPEC_FILES + 1)
          return fail(response, 400, 'bad_request', 'Cần một bộ thông tin và từ một đến 16 tệp quy cách.');
        let input: unknown;
        try { input = JSON.parse(metadata); } catch { return fail(response, 400, 'bad_request', 'Thông tin quy cách phải là JSON hợp lệ.'); }
        if (!validates.unitSpecIntake(input)) return fail(response, 400, 'bad_request', 'Thông tin quy cách không đúng định dạng.');
        const files = new Map<string, Uint8Array>(); let total = 0;
        for (const [field, file] of fields) {
          if (field === 'metadata') continue;
          if (!/^file:[0-9a-f]{64}$/.test(field) || !(file instanceof File) || files.has(field.slice(5)))
            return fail(response, 400, 'bad_request', 'Các tệp quy cách không khớp danh sách nguồn.');
          if (!file.size || !['', 'application/json', 'application/octet-stream', 'text/plain'].includes(file.type))
            return fail(response, 400, 'bad_request', 'Mỗi nguồn cần một tệp JSON có nội dung.');
          total += file.size;
          if (file.size > MAX_UNIT_SPEC_FILE_BYTES || total > MAX_UNIT_SPEC_TOTAL_BYTES)
            return fail(response, 413, 'payload_too_large', 'Mỗi tệp tối đa 2 MiB, tổng tối đa 8 MiB.');
          files.set(field.slice(5), new Uint8Array(await file.arrayBuffer()));
        }
        const receipt = await writeService!.prepareReaderUnitSpecs(workspaceId!, runId!, input, files,
          { actorId: configuration.owner!.actorId, role: 'OWNER' });
        if (!validates.unitSpecIntakeReceipt(receipt)) throw new Error('Unit-spec intake receipt failed validation');
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (action === 'source-pdfs') {
        const contentType = singleHeader(request.headers['content-type']);
        if (!contentType?.startsWith('multipart/form-data;')) return fail(response, 400, 'bad_request', 'Hãy chọn một tệp PDF.');
        const bytes = await readOwnerBytes(request, 32 * 1024 * 1024 + 16 * 1024);
        let form: FormData;
        try { form = await new Request(origin.origin, { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(bytes) }).formData(); }
        catch { return fail(response, 400, 'bad_request', 'Không đọc được biểu mẫu PDF.'); }
        const metadata = form.get('metadata'); const pdf = form.get('pdf');
        if ([...form.entries()].length !== 2 || form.getAll('metadata').length !== 1 || form.getAll('pdf').length !== 1 ||
            typeof metadata !== 'string' || Buffer.byteLength(metadata) > 4096 || !(pdf instanceof File))
          return fail(response, 400, 'bad_request', 'Cần một bộ thông tin và một tệp PDF.');
        if (pdf.size > 32 * 1024 * 1024) return fail(response, 413, 'payload_too_large', 'PDF vượt giới hạn 32 MiB.');
        if (!pdf.size || !['', 'application/pdf', 'application/octet-stream'].includes(pdf.type))
          return fail(response, 400, 'bad_request', 'Tệp được chọn phải là PDF.');
        let input: unknown;
        try { input = JSON.parse(metadata); } catch { return fail(response, 400, 'bad_request', 'Thông tin PDF không đúng định dạng.'); }
        if (!validates.attachPdf(input)) return fail(response, 400, 'bad_request', 'Thông tin PDF không đúng định dạng.');
        const result = { contractVersion: 'research-automation-run-pdfs-v1', workspaceId, runId,
          ...await writeService!.attachRunPdf(workspaceId!, runId!, (input as { fileName: string }).fileName, new Uint8Array(await pdf.arrayBuffer())) };
        if (!validates.runPdfs(result)) throw new Error('PDF state projection failed validation');
        return sendApiJson(response, 200, result);
      }
      if (action === 'sources/supplemental') {
        const contentType = singleHeader(request.headers['content-type']);
        if (!contentType?.startsWith('multipart/form-data;')) return fail(response, 400, 'bad_request', 'Source upload requires multipart/form-data');
        const bytes = await readOwnerBytes(request, MAX_SUPPLEMENTAL_TOTAL_BYTES + 128 * 1024);
        let form: FormData;
        try { form = await new Request(origin.origin, { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(bytes) }).formData(); }
        catch { return fail(response, 400, 'bad_request', 'Malformed source upload'); }
        const fields = [...form.entries()]; const metadata = form.get('metadata');
        if (typeof metadata !== 'string' || Buffer.byteLength(metadata) > 32 * 1024 || fields.length < 2 || fields.length > 17 || form.getAll('metadata').length !== 1)
          return fail(response, 400, 'bad_request', 'Source upload requires one metadata object and bounded files');
        let input: unknown;
        try { input = JSON.parse(metadata); } catch { return fail(response, 400, 'bad_request', 'Source metadata must be valid JSON'); }
        if (!validates.supplementalPrepare(input)) return fail(response, 400, 'bad_request', 'Source metadata failed validation');
        const files = new Map<string, Uint8Array>();
        for (const [field, file] of fields) {
          if (field === 'metadata') continue;
          if (!field.startsWith('file:') || !(file instanceof File) || files.has(field.slice(5)))
            return fail(response, 400, 'bad_request', 'Source file membership is invalid');
          if (!file.size || file.size > MAX_SUPPLEMENTAL_FILE_BYTES) return fail(response, 413, 'payload_too_large', 'Source file exceeds the upload limit');
          files.set(field.slice(5), new Uint8Array(await file.arrayBuffer()));
        }
        const receipt = await writeService!.prepareSupplementalSource(workspaceId!, runId!, input, files);
        if (!validates.supplementalPrepared(receipt)) throw new Error('Prepared supplemental projection failed validation');
        // Preparation is inert. Only a separate explicit revision can admit this package.
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (action === 'sources/kalodata-video') {
        const contentType = singleHeader(request.headers['content-type']);
        if (!contentType?.startsWith('multipart/form-data;')) return fail(response, 400, 'bad_request', 'Hãy tải tệp bằng biểu mẫu đính kèm.');
        const bytes = await readOwnerBytes(request, MAX_VIDEO_UPLOAD_BYTES + 16 * 1024 + 4096);
        let form: FormData;
        try { form = await new Request(origin.origin, { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(bytes) }).formData(); }
        catch { return fail(response, 400, 'bad_request', 'Không đọc được biểu mẫu tải tệp.'); }
        const fields = [...form.entries()];
        const metadata = form.get('metadata'); const upload = form.get('file');
        if (fields.length !== 2 || typeof metadata !== 'string' || Buffer.byteLength(metadata) > 16 * 1024 || !(upload instanceof File))
          return fail(response, 400, 'bad_request', 'Cần một bộ thông tin nguồn và một tệp xuất.');
        if (upload.size > MAX_VIDEO_UPLOAD_BYTES) return fail(response, 413, 'payload_too_large', 'Tệp xuất vượt giới hạn tải lên.');
        if (!upload.size || !['', 'application/octet-stream', 'text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(upload.type))
          return fail(response, 400, 'bad_request', 'Định dạng tệp xuất chưa được hỗ trợ.');
        let input: unknown;
        try { input = JSON.parse(metadata); } catch { return fail(response, 400, 'bad_request', 'Không đọc được thông tin nguồn.'); }
        if (!validates.videoPrepare(input)) return fail(response, 400, 'bad_request', 'Thông tin nguồn không hợp lệ.');
        await readService.getRun(workspaceId!, runId!);
        const store = new RequestScopedArtifactStore(path.resolve(configuration.artifactRoot));
        const intake = new AutomationKalodataVideoIntake(store, writer!, () => new Date());
        const receipt = await withDatabaseMutationMutex(writer!, async () =>
          intake.prepare(input, new Uint8Array(await upload.arrayBuffer()), upload.name, { runId: runId!, workspaceId: workspaceId! }));
        if (!validates.videoPrepared(receipt)) throw new Error('Prepared video projection failed validation');
        // Preparation is inert: no transcription, wake, or implicit confirmation.
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (action === 'sources/metric') {
        const contentType = singleHeader(request.headers['content-type']);
        if (!contentType?.startsWith('multipart/form-data;')) return fail(response, 400, 'bad_request', 'Source upload requires multipart/form-data');
        const bytes = await readOwnerBytes(request, MAX_METRIC_UPLOAD_BYTES + 16 * 1024 + 4096);
        let form: FormData;
        try { form = await new Request(origin.origin, { method: 'POST', headers: { 'Content-Type': contentType }, body: new Uint8Array(bytes) }).formData(); }
        catch { return fail(response, 400, 'bad_request', 'Malformed source upload'); }
        const fields = [...form.entries()];
        const metadata = form.get('metadata'); const workbook = form.get('workbook');
        if (fields.length !== 2 || typeof metadata !== 'string' || Buffer.byteLength(metadata) > 16 * 1024 || !(workbook instanceof File))
          return fail(response, 400, 'bad_request', 'Source upload requires one metadata object and one workbook');
        if (workbook.size > MAX_METRIC_UPLOAD_BYTES) return fail(response, 413, 'payload_too_large', 'Workbook exceeds the upload limit');
        if (!workbook.size || !['', 'application/octet-stream', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'].includes(workbook.type))
          return fail(response, 400, 'bad_request', 'Workbook media type is unsupported');
        let input: unknown;
        try { input = JSON.parse(metadata); } catch { return fail(response, 400, 'bad_request', 'Source metadata must be valid JSON'); }
        if (!validates.metricPrepare(input)) return fail(response, 400, 'bad_request', 'Source metadata failed validation');
        const receipt = await writeService!.prepareMetricSource(workspaceId!, runId!, input, new Uint8Array(await workbook.arrayBuffer()));
        if (!validates.metricPrepared(receipt)) throw new Error('Prepared source projection failed validation');
        // Preparation is inert: no wake, provider request or implicit confirmation.
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (singleHeader(request.headers['content-type']) !== 'application/json') return fail(response, 400, 'bad_request', 'Content-Type must be application/json');
      let body: unknown;
      // Only Insight coding carries source spans; its cap equals the owner's canonical request bound.
      try { body = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await readOwnerBytes(request, insightWrite ? MAX_INSIGHT_CODING_BYTES : action === 'reader-reports' ? MAX_READER_BUILD_BYTES : 16 * 1024))); }
      catch (error) { if (error instanceof PayloadTooLargeError || error instanceof EmptyBodyError) throw error; return fail(response, 400, 'bad_request', 'Request body must be valid UTF-8 JSON'); }
      const validate = !runId ? validates.start : action === 'confirm-scope' ? validates.confirm
        : insightModelWrite ? insightDefaultModelWrite ? validates.insightDefaultModelRequest : validates.insightModelRequest
        : insightWrite ? insightWrite.validate
        : membershipWrite ? action === 'metric-membership-proposals' ? validates.membershipPropose : validates.membershipAccept
        : action === 'metric-rule-adoptions' ? validates.metricRuleAdopt
        : action === 'reader-reports' ? validates.readerBuild : action === 'reader-reports/decisions' ? validates.readerDecision
        : action === 'report-revisions' ? validates.revision : revisionCancel ? validates.revisionCancel : validates.cancel;
      if (!validate(body)) return fail(response, 400, 'bad_request', 'Research request failed validation');
      if (insightModelWrite) {
        if (closing) return fail(response, 503, 'service_unavailable', 'Research executor is stopping');
        const controller = new AbortController();
        const disconnected = () => { if (!response.writableEnded) controller.abort(); };
        response.once('close', disconnected);
        if (response.destroyed) controller.abort();
        const pending = (insightDefaultModelWrite ? writeService!.proposeDefaultModelInsightCoding.bind(writeService!) : writeService!.proposeModelInsightCoding.bind(writeService!))(workspaceId!, runId!, body,
          { actorId: configuration.owner!.actorId, role: 'OWNER' }, insightCodingAi, controller.signal);
        modelRequests.set(controller, pending);
        try {
          const result = await pending;
          const execution = result.execution;
          let receipt: ResearchInsightModelResponse;
          if (execution.status === 'VALID') {
            if (!result.proposal) throw new Error('Valid coding execution has no verified proposal');
            receipt = { contractVersion: 'insight-model-response-v1', status: 'PROPOSED', executionId: execution.executionId,
              proposal: { contractVersion: 'insight-coding-mutation-v1', kind: 'PROPOSAL', evidenceId: result.proposal.evidence.evidenceId, exactRetry: result.proposal.exactRetry } };
          } else if (execution.status === 'NOT_DISPATCHED') {
            receipt = { contractVersion: 'insight-model-response-v1', status: execution.status, reason: execution.reason };
          } else if (execution.status === 'PREPARED') {
            receipt = { contractVersion: 'insight-model-response-v1', status: execution.status, executionId: execution.executionId };
          } else {
            receipt = execution.status === 'INVALID'
              ? { contractVersion: 'insight-model-response-v1', status: execution.status, executionId: execution.executionId, code: execution.validationCode }
              : { contractVersion: 'insight-model-response-v1', status: execution.status, executionId: execution.executionId, code: execution.unknownCode };
          }
          if (!validates.insightModelResponse(receipt)) throw new Error('Insight model response failed validation');
          // Caller must explicitly review/select candidates. Never wake report generation here.
          return sendApiJson(response, receipt.status === 'PROPOSED' && !receipt.proposal.exactRetry ? 201 : 200, receipt);
        } finally {
          modelRequests.delete(controller); response.removeListener('close', disconnected);
        }
      }
      if (membershipWrite) {
        const actor = { actorId: configuration.owner!.actorId, role: 'OWNER' as const };
        const receipt = action === 'metric-membership-proposals' ? await writeService!.proposeMetricMembership(workspaceId!, runId!, body, actor)
          : await writeService!.acceptMetricMembership(workspaceId!, runId!, body, actor);
        if (!validates.membershipResponse(receipt)) throw new Error('Metric membership receipt failed validation');
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (insightWrite) {
        const owner = { actorId: configuration.owner!.actorId, role: 'OWNER' as const };
        let result: Awaited<ReturnType<ResearchAutomationService['adoptInsightCodingRules']>>;
        try {
          result = insightWrite.kind === 'ADOPTION' ? await writeService!.adoptInsightCodingRules(workspaceId!, runId!, body, owner)
            : action === 'insight-coding-literal-proposals' ? await writeService!.proposeLiteralInsightCoding(workspaceId!, runId!, body, owner)
            : insightWrite.kind === 'PROPOSAL' ? await writeService!.proposeInsightCoding(workspaceId!, runId!, body, owner)
              : await writeService!.acceptInsightCoding(workspaceId!, runId!, body, owner);
        } catch (error) {
          // Existing span and selection validators reject caller-authored coding with these errors.
          if (error instanceof LocatedInsightValidationError || (error instanceof TypeError &&
              (error.message.startsWith('INVALID_INSIGHT_SELECTION:') || error.message === 'INSIGHT_LITERAL_PROPOSAL_TOO_LARGE')))
            return fail(response, 400, 'bad_request', 'Research request failed validation');
          throw error;
        }
        const receipt = { contractVersion: 'insight-coding-mutation-v1', kind: insightWrite.kind, evidenceId: result.evidence.evidenceId, exactRetry: result.exactRetry };
        if (!validates.insightMutation(receipt)) throw new Error('Insight coding receipt failed validation');
        // Coding evidence is not report admission, regeneration or provider dispatch.
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (action === 'reader-reports' || action === 'reader-reports/decisions') {
        const owner = { actorId: configuration.owner!.actorId, role: 'OWNER' as const };
        if (action === 'reader-reports') {
          const receipt = (body as { contractVersion: string }).contractVersion === 'reader-report-unit-spec-build-v1'
            ? await writeService!.buildReaderReportFromUnitSpecs(workspaceId!, runId!, body, owner)
            : await writeService!.buildReaderReport(workspaceId!, runId!, body, owner);
          if (!validates.readerBuildReceipt(receipt)) throw new Error('Reader build receipt failed validation');
          // Building restates a finished draft: no wake, provider request or draft change.
          return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
        }
        const receipt = await writeService!.decideReaderReport(workspaceId!, runId!, body, owner);
        if (!validates.readerDecisionReceipt(receipt)) throw new Error('Reader decision receipt failed validation');
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (action === 'metric-rule-adoptions') {
        const receipt = await writeService!.adoptMetricRule(workspaceId!, runId!, body, { actorId: configuration.owner!.actorId, role: 'OWNER' });
        if (!validates.metricRuleReceipt(receipt)) throw new Error('Rule adoption receipt failed validation');
        // Adoption is not row acceptance, report regeneration, or provider collection.
        return sendApiJson(response, receipt.exactRetry ? 200 : 201, receipt);
      }
      if (action === 'report-revisions' || revisionCancel) {
        const receipt = revisionCancel
          ? await writeService!.cancelReportRevision(workspaceId!, runId!, revisionCancel[1]!, (body as { requestKey: string }).requestKey)
          : await writeService!.requestReportRevision(workspaceId!, runId!, body);
        if (!validates.revisionReceipt(receipt)) throw new Error('Report revision receipt failed validation');
        worker!.wake();
        return sendApiJson(response, revisionCancel || receipt.exactRetry ? 200 : 202, receipt);
      }
      const receipt = !runId ? await writeService!.start(workspaceId!, body) : action === 'confirm-scope' ? await writeService!.confirmScope(workspaceId!, runId, body) : await writeService!.cancel(workspaceId!, runId, body);
      worker!.wake();
      sendApiJson(response, action === 'cancel' || receipt.exactRetry ? 200 : 202, receipt);
    } catch (error) {
      if (action === 'source-pdfs' && error instanceof ResearchAutomationValidationError)
        return fail(response, 400, 'bad_request', 'Tài liệu PDF không hợp lệ hoặc vượt giới hạn dung lượng.');
      if (error instanceof AutomationSynthesisExecutionError) {
        if (error.code === 'INVALID_SYNTHESIS_CONFIGURATION') return fail(response, 503, 'service_unavailable', 'Research model is unavailable');
        return fail(response, 409, 'revision_conflict', 'Research state changed or an execution is pending; refresh before submitting');
      }
      if (error instanceof TypeError && ['INSIGHT_MODEL_RECORD_NOT_ELIGIBLE', 'INSIGHT_MODEL_INPUT_TOO_LARGE'].includes(error.message))
        return fail(response, 400, 'bad_request', 'Research model batch failed validation');
      if (error instanceof ResearchAutomationNotFoundError) return fail(response, 404, error.code, 'Research record or output was not found');
      // Reader messages are fixed plain-Vietnamese text written by the service, never source content.
      if (error instanceof ResearchAutomationConflictError) return fail(response, 409, error.code, readerAction ? error.message : 'Research state changed; refresh before submitting');
      if (readerAction && error instanceof ResearchAutomationValidationError) return fail(response, 400, 'bad_request', error.message);
      if (error instanceof SourcePackageRequestConflictError)
        return fail(response, 409, 'request_key_conflict', 'This upload identity is already bound to different content');
      if (error instanceof KalodataVideoRejection) return fail(response, 400, 'source_input_rejected', 'Tệp video không đúng cấu trúc được hỗ trợ.');
      if (error instanceof SupplementalSourceRejection) return fail(response, 400, 'source_input_rejected', 'The source package does not match a supported method profile');
      if (error instanceof MetricSourceRejection && !['INVALID_XLSX', 'OFFLINE_READER_UNAVAILABLE_OR_LIMIT'].includes(error.code))
        return fail(response, 400, 'source_input_rejected', 'The workbook does not match a supported source profile');
      if (error instanceof PayloadTooLargeError) return fail(response, 413, 'payload_too_large', 'Request body exceeds the limit');
      if (error instanceof ResearchAutomationValidationError || error instanceof EmptyBodyError) return fail(response, 400, 'bad_request', 'Research request failed validation');
      return fail(response, 500, 'integrity_error', 'Stored research evidence failed verification');
    }
  }

  /** Read-only board: configuration flags plus stored history. Never pings a provider, so it never spends money. */
  async function sourceStatus(request: IncomingMessage, response: ServerResponse, workspaceId: string): Promise<void> {
    response.setHeader('Allow', 'GET');
    if (request.method !== 'GET') return fail(response, 405, 'method_not_allowed', 'Method is not supported');
    try {
      const result = await sourceStatusProjection(workspaceId);
      return sendApiJson(response, 200, result);
    } catch (error) {
      if (error instanceof ResearchAutomationNotFoundError) return fail(response, 404, error.code, 'Research record or output was not found');
      if (error instanceof ResearchAutomationValidationError) return fail(response, 400, 'bad_request', 'Research request failed validation');
      return fail(response, 500, 'integrity_error', 'Stored research evidence failed verification');
    }
  }
  async function sourceStatusProjection(workspaceId: string) {
    const result = buildResearchAutomationSourceStatus({ workspaceId, checkedAt: new Date().toISOString(),
      executorEnabled: Boolean(writeService), providers: configuration.providers, wired: SOURCES_WIRED_INTO_RUNS,
      activity: await readService.readSourceActivity(workspaceId), pageindex: (writeService ?? readService).pageIndexStatusSummary() });
    if (!validates.sourceStatus(result)) throw new Error('Source status projection failed validation');
    return result;
  }
}
function fail(response: ServerResponse, status: number, code: string, message: string): void { sendApiJson(response, status, { error: { code, message } }); }
