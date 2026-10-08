import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import automationApiSchema from '../../../../contracts/api/research-automation-api.schema.json' with { type: 'json' };
import sourceConfirmSchema from '../../../../contracts/api/research-automation-source-api.schema.json' with { type: 'json' };
import sourceSetSchema from '../../../../contracts/analysis/automation-confirmed-source-set.schema.json' with { type: 'json' };
import revisionSchema from '../../../../contracts/analysis/automation-report-revision.schema.json' with { type: 'json' };
import classifiedRevisionSchema from '../../../../contracts/analysis/automation-classified-report-revision.schema.json' with { type: 'json' };
import insightRevisionSchema from '../../../../contracts/analysis/automation-insight-report-revision.schema.json' with { type: 'json' };
import boundedRevisionSchema from '../../../../contracts/analysis/automation-bounded-report-revision.schema.json' with { type: 'json' };
import type { AutomationBoundedReportRevisionRequest } from '../../../../contracts/analysis/automation-bounded-report-revision.generated.js';
import type { AutomationBoundedMethodSnapshot } from '../../../../contracts/analysis/automation-bounded-method-snapshot.generated.js';
import { buildAutomationBoundedMethods, verifyAutomationBoundedMethods } from './bounded-methods.js';
import quoteRevisionSchema from '../../../../contracts/analysis/automation-quote-report-revision.schema.json' with { type: 'json' };
import type { AutomationQuoteReportRevisionRequest } from '../../../../contracts/analysis/automation-quote-report-revision.generated.js';
import type { AutomationQuoteMethodSnapshot } from '../../../../contracts/analysis/automation-quote-method-snapshot.generated.js';
import { buildAutomationQuoteMethods, verifyAutomationQuoteMethods } from './quote-methods.js';
import type { AutomationDecisionPacket } from '../../../../contracts/analysis/automation-decision-packets.generated.js';
import { buildAutomationDecisionPacket, verifyAutomationDecisionPacket, type AutomationDecisionPacketInput, type AutomationDecisionSectionId } from './decision-packets.js';
import { AutomationDecisionSynthesisExecutions, type AutomationDecisionExecutionRequest, type AutomationDecisionExecutionOutcome } from './decision-synthesis-execution.js';
import type { AutomationInsightReportRevisionRequest } from '../../../../contracts/analysis/automation-insight-report-revision.generated.js';
import type { AutomationInsightCodingSnapshot } from '../../../../contracts/analysis/automation-insight-coding-snapshot.generated.js';
import type { AutomationClassifiedReportRevisionRequest } from '../../../../contracts/analysis/automation-classified-report-revision.generated.js';
import type { AutomationClassifiedMetricSnapshot } from '../../../../contracts/analysis/automation-classified-metric.generated.js';
import { AutomationClassifiedMetric } from './classified-metric.js';
import metricIntakeSchema from '../../../../contracts/api/research-automation-metric-intake-api.schema.json' with { type: 'json' };
import supplementalIntakeSchema from '../../../../contracts/api/research-automation-supplemental-intake-api.schema.json' with { type: 'json' };
import foundationIntakeSchema from '../../../../contracts/foundation/source-package-intake-request.schema.json' with { type: 'json' };
import type { ResearchAutomationSupplementalPrepareRequest, ResearchAutomationSupplementalPrepareReceipt, ResearchAutomationSupplementalPreparedList } from '../../../../contracts/api/research-automation-supplemental-intake-api.generated.js';
import { AutomationSupplementalSourceIntake } from './supplemental-source-intake.js';
import { readPreparedSupplementalSources, verifyPreparedSupplementalSource } from './supplemental-source-inventory.js';
import m01ReferenceSchema from '../../../../contracts/analysis/automation-m01-inventory-reference.schema.json' with { type: 'json' };
import type { AutomationM01InventoryReference } from '../../../../contracts/analysis/automation-m01-inventory-reference.generated.js';
import type { AutomationM01EvidenceInventory } from '../../../../contracts/analysis/automation-m01-evidence-inventory.generated.js';
import { automationM01InventoryVersion, buildAutomationM01EvidenceInventory, MAX_M01_EVIDENCE_INVENTORY_BYTES } from './m01-evidence-inventory.js';
import i14ReferenceSchema from '../../../../contracts/analysis/automation-i14-admission-reference.schema.json' with { type: 'json' };
import type { AutomationI14AdmissionReference } from '../../../../contracts/analysis/automation-i14-admission-reference.generated.js';
import type { AutomationI14EvidenceAdmission } from '../../../../contracts/analysis/automation-i14-evidence-admission.generated.js';
import { automationI14AdmissionVersion, buildAutomationI14EvidenceAdmission, MAX_I14_EVIDENCE_ADMISSION_BYTES } from './i14-evidence-admission.js';
import { AutomationI14SynthesisExecutions, type AutomationI14ExecutionRequest, type AutomationI14ExecutionOutcome, type AutomationI14ExecutionParent } from './i14-synthesis-execution.js';
import type { ResearchAutomationMetricPrepareRequest, ResearchAutomationMetricPrepareReceipt, ResearchAutomationPreparedMetricList } from '../../../../contracts/api/research-automation-metric-intake-api.generated.js';
import { AutomationMetricSourceIntake, MAX_METRIC_UPLOAD_BYTES } from './metric-source-intake.js';
import { AutomationMetricRuleAdoptions, type MetricRuleBinding } from './metric-rule-adoption.js';
import { AutomationMetricMembership, type MetricMembershipContext } from './metric-membership.js';
import { AutomationInsightCoding, type InsightSourceContext } from './insight-coding.js';
import type { AutomationMetricRuleAdoptionList, AutomationMetricRuleAdoptionReceipt } from '../../../../contracts/analysis/automation-metric-rule-adoption.generated.js';
import { readPreparedMetricSources } from './metric-source-inventory.js';
import { AutomationReaderReports, type ReaderDraftContext, type ReaderRowsReader } from './reader-report-revisions.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { SourcePackageService } from '../../foundation/source-package-service.js';
import { videoPackageKeyPrefix } from './kalodata-video-intake.js';
import { RequestScopedArtifactStore } from '../../../platform/artifacts/request-scoped-artifact-store.js';
import type { AutomationReportRevisionRequest as SourceReportRevisionRequest } from '../../../../contracts/analysis/automation-report-revision.generated.js';
type AutomationReportRevisionRequest = SourceReportRevisionRequest | AutomationClassifiedReportRevisionRequest | AutomationInsightReportRevisionRequest | AutomationBoundedReportRevisionRequest | AutomationQuoteReportRevisionRequest;
import type { ResearchAutomationReportPair, ResearchAutomationRevisionReceipt } from '../../../../contracts/api/research-automation-revision-api.generated.js';
export type { ResearchAutomationReportPair, ResearchAutomationRevisionReceipt } from '../../../../contracts/api/research-automation-revision-api.generated.js';
import type { AutomationConfirmedSourceSet } from '../../../../contracts/analysis/automation-confirmed-source-set.generated.js';
import type { ResearchAutomationSourceConfirmRequest } from '../../../../contracts/api/research-automation-source-api.generated.js';
import type Database from 'better-sqlite3';
import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import { AutomationDescriptiveMethodBridge } from './descriptive-method-bridge.js';
import { AutomationMarketMethodBridge, type AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import { AutomationMetricMethodBridge, metricMethodFailureCode, type AutomationMetricMethodSnapshot, type MetricMethodFailureCode } from './metric-method-bridge.js';
import { PageIndexCloudClient } from '../pageindex-cloud.js';
import { estimatePageIndexBalance, estimatePageIndexLedgerBalance } from '../pageindex-balance.js';
import { extractPageIndexPdf, planPageIndexQuestions, verifyPageIndexQuotes, buildVerifiedQuotesArtifact,
  PAGEINDEX_ELIGIBLE_SECTIONS, type PageIndexLocalPage, type PageIndexQuotesArtifact, type PageIndexVerifiedQuote } from '../pageindex-questions.js';
import type { PageIndexStatusSummary } from './source-status.js';
import {
  indexRunPdfsForPageIndex,
  isPageIndexUsageLimited,
  setPageIndexUsageLimited,
  listPageIndexDocuments,
  readPageIndexDocument,
  type EnsureIndexedDeps,
} from '../pageindex-documents.js';
import { AutomationLocatedReviewBridge, type AutomationLocatedReviewSnapshot } from './located-review-bridge.js';
import { AutomationNativeSourceReviewBridge, type NativeSourceReviewSnapshot, type NativeSourceReviewReference } from './native-source-review-bridge.js';
import { buildAutomationSourceClaims, validateAutomationSourceClaimsReference, MAX_SOURCE_CLAIMS_BYTES } from './source-claims.js';
import type { AutomationSourceClaims } from '../../../../contracts/analysis/automation-source-claims.generated.js';
import { AutomationExactShopeeBridge, type ExactShopeeAttempt, type ShopeeCollectorFactory } from './exact-shopee-bridge.js';
import { EXACT_SHOPEE_OUTCOMES, MAX_PROVIDER_MESSAGE_LENGTH, type ExactShopeeOutcome } from './exact-shopee-outcome.js';
import { selectExactShopeeListings } from '../../foundation/shopee-exact-selection.js';
import type { ResearchReviewCorpus } from '../../../../contracts/analysis/research-review-corpus.generated.js';
import type {
  ResearchAutomationCancelRequest,
  ResearchAutomationConfirmRequest,
  ResearchAutomationCoverageSource,
  ResearchAutomationMutationReceipt,
  ResearchAutomationProductCard,
  ResearchAutomationRun,
  ResearchAutomationRunList,
  ResearchAutomationStartRequest,
} from '../../../../contracts/api/research-automation-api.generated.js';
import type { DiscoveryWorkspaceReader } from '../../../modules/flow/discovery-workspace-reader.js';
import { canonicalJson } from '../../../modules/foundation/canonical-json.js';
import { withDatabaseMutationMutex } from '../../../platform/db/database-mutation-mutex.js';
import { ContentAddressedArtifactStore, type StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import type {
  CollectInput,
  ProviderCallOptions,
  ProviderRawCapture,
  QuickSearchInput,
} from './providers.js';
import {
  invalidProviderStep,
  type AutomationSourcePort,
  type BoundCollectResult,
  type BoundQuickSearchResult,
} from './source-binding.js';
import {
  MAX_HTML_BYTES,
  MAX_CAPTURE_BYTES,
  MAX_CAPTURE_ENVELOPE_BYTES,
  MAX_CAPTURES_PER_STEP,
  MAX_JSON_ARTIFACT_BYTES,
  MAX_PDF_BYTES,
  MAX_WEB_RESULTS,
  RUN_LIST_LIMIT,
  STEP_IDS,
  TERMINAL_STATUSES,
  type CaptureRecord,
  type ScopeSnapshot,
  type SourceStepId,
  type StartSnapshot,
  type StepResultDocument,
  type StepId,
  message,
  ResearchAutomationConflictError,
  ResearchAutomationIntegrityError,
  ResearchAutomationProviderOutputError,
  ResearchAutomationNotFoundError,
  ResearchAutomationStateError,
  ResearchAutomationValidationError,
} from './model.js';

export interface ResearchAutomationReportInput {
  readonly run: ResearchAutomationRun;
  readonly start: StartSnapshot;
  readonly scope: ScopeSnapshot;
  readonly collection: StepResultDocument | null;
  readonly captures: readonly CaptureRecord[];
  readonly sourceClaims?: AutomationSourceClaims;
  readonly decisionPackets?: readonly AutomationDecisionPacket[];
  readonly decisionSourceClaims?: AutomationSourceClaims;
  readonly decisionSynthesis?: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionOutcome>>;
  readonly m01Inventory?: AutomationM01EvidenceInventory;
  readonly i14Admission?: AutomationI14EvidenceAdmission;
  readonly i14Synthesis?: AutomationI14ExecutionOutcome;
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly descriptiveMethodFailure?: 'DESCRIPTIVE_METHOD_FAILED';
  readonly reviewCorpus?: ResearchReviewCorpus;
  readonly reviewCorpusFailure?: 'REVIEW_CORPUS_FAILED' | 'REVIEW_CORPUS_REPORT_TOO_LARGE';
  readonly locatedReview?: AutomationLocatedReviewSnapshot;
  readonly locatedReviewFallback?: { readonly sourcePackage: Extract<AutomationLocatedReviewSnapshot, { contractVersion: 'automation-located-review-snapshot-v2' }>['sourcePackage'] };
  readonly nativeReview?: NativeSourceReviewSnapshot;
  readonly nativeReviewFallback?: Pick<NativeSourceReviewSnapshot, 'sourcePackage'>;
  readonly nativeReviewFailure?: 'NATIVE_REVIEW_METHOD_FAILED' | 'NATIVE_REVIEW_REPORT_TOO_LARGE';
  readonly locatedReviewFailure?: 'LOCATED_REVIEW_METHOD_FAILED';
  readonly marketInventory?: AutomationMarketMethodSnapshot;
  readonly marketInventoryFailure?: 'MARKET_INVENTORY_FAILED';
  readonly metricMethods?: AutomationMetricMethodSnapshot;
  readonly metricClassified?: AutomationClassifiedMetricSnapshot;
  readonly insightCoding?: AutomationInsightCodingSnapshot;
  readonly boundedMethods?: AutomationBoundedMethodSnapshot;
  readonly quoteMethods?: AutomationQuoteMethodSnapshot;
  readonly metricMethodsFailure?: MetricMethodFailureCode;
}
/** Alias retained for the report module's public renderer signature. */
export type AutomationReportInput = ResearchAutomationReportInput;
export type ResearchAutomationSourceActivityKey = 'kalodata' | 'serpapi' | 'apify-shopee' | 'metric'
  | 'kalodata-video' | 'apify-tiktok-comments' | 'video-reading' | 'meta-ad-library' | 'official-stats' | 'world-bank' | 'pageindex';
export interface ResearchAutomationSourceActivity { readonly lastDataAt: string | null; readonly dataCount: number; readonly lastUsageAt: string | null }
/** One stored-capture row per SerpApi operation. Count unit is stored captures, never mixed with uploads or usage rows. lastUsageAt stays null: usage rows are a provider-level aggregate, never per-operation evidence. */
export interface ResearchAutomationSerpApiOperation { readonly operation: string; readonly count: number; readonly lastDataAt: string | null; readonly lastUsageAt: string | null }
export interface ResearchAutomationSourceActivityResult extends Record<ResearchAutomationSourceActivityKey, ResearchAutomationSourceActivity> {
  /** Per-operation SerpApi capture history for the board's operation rows. */
  readonly serpapiOperations: readonly ResearchAutomationSerpApiOperation[];
}

/** One PDF of a run with its automatic-indexing state for the run page. */
export interface PageIndexRunPdfDocument {
  readonly fileName: string;
  readonly sourceSha256: string;
  readonly state: 'INDEXING' | 'READY' | 'FAILED' | 'SKIPPED_LOW_BALANCE' | 'SKIPPED_USAGE_LIMIT' | 'DISABLED';
  readonly cloudDocId: string | null;
}

/** Run-page PDF states with the paused flag for the warning banner. */
export interface PageIndexRunPdfStates {
  readonly paused: boolean;
  readonly usageLimited: boolean;
  readonly documents: readonly PageIndexRunPdfDocument[];
}
interface RunPdfRow { sha256: string; fileName: string; packageId: string; manifestSha256: string; logicalPath: string }

/** Best-effort ledger read that never throws; unreadable rows degrade to INDEXING. */
function safeReadPageIndex(db: Database.Database, sourceSha256: string): {
  readonly status: 'INDEXING' | 'READY' | 'FAILED' | 'SKIPPED_LOW_BALANCE' | 'SKIPPED_USAGE_LIMIT';
  readonly cloudDocId: string | null;
} | null {
  try {
    const found = readPageIndexDocument(db, sourceSha256);
    return found ? { status: found.status, cloudDocId: found.cloudDocId } : null;
  } catch {
    return null;
  }
}

export interface ResearchAutomationRenderedReport {
  readonly semantic: unknown;
  readonly html: Uint8Array;
  readonly pdf?: Uint8Array;
  readonly pdfUnavailableCode?: 'PDF_RENDERER_NOT_CONFIGURED' | 'PDF_RENDER_FAILED';
}

export type ResearchAutomationReportRenderer = (
  input: ResearchAutomationReportInput,
  kind: 'MARKET' | 'INSIGHT',
  signal?: AbortSignal,
) => Promise<ResearchAutomationRenderedReport> | ResearchAutomationRenderedReport;

export interface ResearchAutomationServiceOptions {
  readonly db: Database.Database;
  readonly artifactStore: ContentAddressedArtifactStore;
  readonly workspaceReader: DiscoveryWorkspaceReader;
  readonly source?: AutomationSourcePort;
  /** Optional web search, run once per collection beside the product source. */
  readonly webSource?: AutomationSourcePort;
  readonly renderer?: ResearchAutomationReportRenderer;
  readonly now?: () => Date;
  readonly uuid?: () => string;
  readonly actorId?: string;
  readonly shopeeCollectorFactory?: ShopeeCollectorFactory;
  /** Request-owned staging for explicit source intake and rule adoption. Never used by report workers. */
  readonly metricAttachmentStore?: RequestScopedArtifactStore;
  /** Explicit Analysis-owned transport. No provider is activated by default. */
  readonly i14SynthesisAi?: AutomationI14ExecutionRequest['ai'];
  /** Each additional section is separately opted in; I14 configuration grants no extra calls. */
  readonly decisionSynthesisAi?: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionRequest['ai']>>;
  /** Reader page charts: false keeps the hand-drawn SVG fallback only. */
  readonly readerReportFlint?: boolean;
  /** Test seam for reader rows; defaults to the prepared product-list workbook reader. */
  readonly readerRows?: ReaderRowsReader;
  /** Optional connector configuration; absent keeps environment-backed, disabled-by-default behavior. */
  readonly pageIndex?: {
    readonly enabled?: boolean;
    readonly apiKey?: string;
    readonly fetch?: typeof fetch;
    readonly startingCreditMicroDollars?: number;
    readonly maxQuestionsPerRun?: number;
    readonly extractPdf?: (bytes: Uint8Array) => Promise<readonly PageIndexLocalPage[]>;
  };
}

export interface ResearchAutomationReadReport {
  readonly kind: 'MARKET' | 'INSIGHT';
  readonly versionId: string;
  readonly bytes: Buffer;
  readonly mediaType: 'text/html; charset=utf-8' | 'application/pdf';
}

interface RunRow {
  runId: string; workspaceId: string; revision: bigint | number; status: ResearchAutomationRun['status']; mode: ResearchAutomationRun['mode'];
  keyword: string; periodStart: string; periodEnd: string; reports: string; startSha: string; scopeSha: string | null;
  scopeConfirmedAt: string | null; actorId: string; createdAt: string; updatedAt: string;
  sourceSetSha: string | null;
}
interface StepRow { runId: string; stepId: StepId; state: ResearchAutomationRun['steps'][number]['state']; code: string | null; resultSha: string | null; startedAt: string | null; finishedAt: string | null }
interface CaptureRow { stepId: SourceStepId; ordinal: bigint | number; artifactSha: string; mediaType: string; provider: string; operation: string; retrievedAt: string; windowStart: string | null; windowEnd: string | null; truncated: number | bigint }
interface UsageRow { stepId: SourceStepId; ordinal: bigint | number; provider: string; operation: string; requestCount: bigint | number; costState: 'KNOWN' | 'UNKNOWN'; costUnit: 'USD' | 'CREDITS' | null; costAmount: string | null }
interface OutputRow { reportKind: 'MARKET' | 'INSIGHT'; versionSha: string; htmlSha: string; pdfSha: string | null; pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' | 'PDF_RENDER_FAILED' | null }
interface AttemptRow {
  attemptId: string; runId: string; attemptNumber: number | bigint; previousPairId: string;
  requestSha: string; sourceSetSha: string; state: 'QUEUED' | 'RUNNING' | 'COMMITTED' | 'FAILED' | 'CANCELLED';
  versionNumber: number | bigint | null; pairId: string | null; createdAt: string;
}
interface PersistableSourceResult {
  readonly unsettledProvider?: string;
  result: BoundQuickSearchResult['result'] | BoundCollectResult['result'] | null;
  step: StepResultDocument;
}

/** The independent web-search lane of one collection; its usage is recorded at ordinal 2. */
type WebSearchAttempt = { readonly bound: BoundCollectResult } | { readonly failedProvider: string };
const WEB_USAGE_ORDINAL = 2;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const LONG_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_BODY_TEXT = 2_000;
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const sourceAjv = new Ajv2020({ strict: true, allErrors: true });
addFormats(sourceAjv);
sourceAjv.addSchema(automationApiSchema);
const validateSourceConfirm = sourceAjv.compile<ResearchAutomationSourceConfirmRequest>(sourceConfirmSchema);
const validateSourceSet = sourceAjv.compile<AutomationConfirmedSourceSet>(sourceSetSchema);
sourceAjv.addSchema(revisionSchema); sourceAjv.addSchema(classifiedRevisionSchema); sourceAjv.addSchema(insightRevisionSchema); sourceAjv.addSchema(boundedRevisionSchema); sourceAjv.addSchema(quoteRevisionSchema);
const validateRevision = sourceAjv.compile<AutomationReportRevisionRequest>({ oneOf: [{ $ref: revisionSchema.$id }, { $ref: classifiedRevisionSchema.$id }, { $ref: insightRevisionSchema.$id }, { $ref: boundedRevisionSchema.$id }, { $ref: quoteRevisionSchema.$id }] });
const validateM01Reference = sourceAjv.compile<AutomationM01InventoryReference>(m01ReferenceSchema);
const validateI14Reference = sourceAjv.compile<AutomationI14AdmissionReference>(i14ReferenceSchema);
sourceAjv.addSchema(metricIntakeSchema);
const validateMetricPrepare = sourceAjv.compile<ResearchAutomationMetricPrepareRequest>({ $ref: `${metricIntakeSchema.$id}#/$defs/request` });
sourceAjv.addSchema([foundationIntakeSchema, supplementalIntakeSchema]);
const validateSupplementalPrepare = sourceAjv.compile<ResearchAutomationSupplementalPrepareRequest>({ $ref: `${supplementalIntakeSchema.$id}#/$defs/request` });
interface FrozenSources { sha256: string; value: AutomationConfirmedSourceSet; nativeReference?: NativeSourceReviewReference }

export class ResearchAutomationService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #workspaces: DiscoveryWorkspaceReader;
  readonly #source: AutomationSourcePort | undefined;
  readonly #webSource: AutomationSourcePort | undefined;
  readonly #renderer: ResearchAutomationReportRenderer | undefined;
  readonly #now: () => Date;
  readonly #uuid: () => string;
  readonly #actorId: string;
  readonly #methods: AutomationDescriptiveMethodBridge;
  readonly #locatedReviews: AutomationLocatedReviewBridge;
  readonly #nativeReviews: AutomationNativeSourceReviewBridge;
  readonly #shopee: AutomationExactShopeeBridge;
  readonly #marketInventory: AutomationMarketMethodBridge;
  readonly #metricMethods: AutomationMetricMethodBridge;
  readonly #metricIntake: AutomationMetricSourceIntake | undefined;
  readonly #supplementalIntake: AutomationSupplementalSourceIntake | undefined;
  readonly #metricRules: AutomationMetricRuleAdoptions;
  readonly #readerReports: AutomationReaderReports;
  readonly #metricMembership: AutomationMetricMembership;
  readonly #insightCoding: AutomationInsightCoding;
  readonly #classifiedMetric: AutomationClassifiedMetric;
  readonly #i14Executions: AutomationI14SynthesisExecutions;
  readonly #i14Ai: AutomationI14ExecutionRequest['ai'];
  readonly #decisionExecutions: Record<AutomationDecisionSectionId, AutomationDecisionSynthesisExecutions>;
  readonly #decisionAi: NonNullable<ResearchAutomationServiceOptions['decisionSynthesisAi']>;
  readonly #active = new Map<string, AbortController>();
  readonly #pageIndex: ResearchAutomationServiceOptions['pageIndex'];

  constructor(options: ResearchAutomationServiceOptions) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#workspaces = options.workspaceReader;
    this.#source = options.source;
    this.#webSource = options.webSource;
    this.#renderer = options.renderer;
    this.#pageIndex = options.pageIndex;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
    this.#actorId = options.actorId ?? 'research-automation-worker';
    this.#i14Executions = new AutomationI14SynthesisExecutions({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#i14Ai = options.i14SynthesisAi ?? null;
    this.#decisionAi = options.decisionSynthesisAi ?? {};
    this.#decisionExecutions = {
      M11: new AutomationDecisionSynthesisExecutions({ db: this.#db, artifactStore: this.#artifacts, now: this.#now, sectionId: 'M11' }),
      M12: new AutomationDecisionSynthesisExecutions({ db: this.#db, artifactStore: this.#artifacts, now: this.#now, sectionId: 'M12' }),
      I15: new AutomationDecisionSynthesisExecutions({ db: this.#db, artifactStore: this.#artifacts, now: this.#now, sectionId: 'I15' }),
    };
    this.#methods = new AutomationDescriptiveMethodBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#locatedReviews = new AutomationLocatedReviewBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#nativeReviews = new AutomationNativeSourceReviewBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#shopee = new AutomationExactShopeeBridge(this.#db, this.#artifacts, options.shopeeCollectorFactory);
    this.#marketInventory = new AutomationMarketMethodBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#metricMethods = new AutomationMetricMethodBridge({ db: this.#db, artifactStore: this.#artifacts, workspaces: this.#workspaces, now: this.#now });
    if (options.metricAttachmentStore) this.#metricIntake = new AutomationMetricSourceIntake(options.metricAttachmentStore, this.#db, this.#now);
    if (options.metricAttachmentStore) this.#supplementalIntake = new AutomationSupplementalSourceIntake(options.metricAttachmentStore, this.#db, this.#now);
    this.#metricRules = new AutomationMetricRuleAdoptions(this.#db, this.#artifacts, options.metricAttachmentStore, this.#now);
    this.#readerReports = new AutomationReaderReports(this.#db, this.#artifacts, this.#now, {
      ...(options.readerReportFlint === undefined ? {} : { flint: options.readerReportFlint }),
      ...(options.readerRows ? { rows: options.readerRows } : {}) });
    this.#metricMembership = new AutomationMetricMembership({ db: this.#db, artifacts: this.#artifacts, now: this.#now,
      ...(options.metricAttachmentStore ? { staging: options.metricAttachmentStore } : {}),
      context: (workspaceId, runId, pairId, adoptionId) => this.#metricMembershipContext(workspaceId, runId, pairId, adoptionId),
      assertCurrent: async context => {
        const { workspaceId, runId, pairId, adoptionId } = context.binding;
        const versions = await this.listReportVersions(workspaceId, runId);
        const rules = await this.listMetricRuleAdoptions(workspaceId, runId);
        if (versions.at(-1)?.pairId !== pairId || rules.adoptions.some(item => item.adoptionId !== adoptionId &&
            item.rulebook.ruleId === context.adoption.request.rulebook.ruleId && item.rulebook.revision > context.adoption.request.rulebook.revision))
          throw new ResearchAutomationConflictError('revision_conflict', 'The report or rule revision changed before assignment acceptance.');
      },
    });
    this.#classifiedMetric = new AutomationClassifiedMetric(this.#metricMembership);
    this.#insightCoding = new AutomationInsightCoding({ db: this.#db, artifacts: this.#artifacts, now: this.#now,
      ...(options.metricAttachmentStore ? { staging: options.metricAttachmentStore } : {}),
      context: (workspaceId, runId, pairId) => this.readInsightSourceContext(workspaceId, runId, pairId),
      assertCurrent: async binding => {
        if ((await this.listReportVersions(binding.workspaceId, binding.runId)).at(-1)?.pairId !== binding.pairId)
          throw new ResearchAutomationConflictError('revision_conflict', 'The Insight report changed before coding confirmation.');
      },
    });
  }

  /** Explicit owner start. Workspace verification happens before any artifact or DB write. */
  async start(workspaceId: string, value: unknown): Promise<ResearchAutomationMutationReceipt> {
    const input = validateStart(value);
    assertUuid(workspaceId);
    await this.#readWorkspace(workspaceId);
    const requestSha = digest({ kind: 'START', workspaceId, input });
    return withDatabaseMutationMutex(this.#db, async () => {
      const prior = this.#request(input.requestKey);
      if (prior) return this.#retryOrConflict(prior, requestSha, workspaceId, 'START');
      const createdAt = this.#now().toISOString();
      const runId = this.#validUuid();
      const start: StartSnapshot = {
        contractVersion: 'research-automation-start-snapshot-v1', workspaceId, country: 'VN', mode: input.mode,
        keyword: input.keyword, description: input.description ?? null, interview: input.interview ?? null,
        requestedPeriod: { startDate: input.requestedPeriod.startDate, endDate: input.requestedPeriod.endDate, dayCount: inclusiveDays(input.requestedPeriod) },
        reports: [...input.reports],
      };
      const stored = await this.#putJson(start, createdAt);
      const run = this.#db.transaction(() => {
        this.#registerManifest(stored, 'application/json', createdAt);
        this.#db.prepare(`INSERT INTO analysis_research_automation_runs(
          run_id, workspace_id, revision, status, mode, keyword, period_start, period_end, reports,
          start_request_sha256, actor_id, created_at, updated_at
        ) VALUES (?, ?, 1, 'QUICK_SEARCH_QUEUED', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
          .run(runId, workspaceId, input.mode, input.keyword, input.requestedPeriod.startDate, input.requestedPeriod.endDate,
            input.reports.join(','), stored.sha256, this.#actorId, createdAt, createdAt);
        for (const stepId of STEP_IDS) this.#db.prepare(`INSERT INTO analysis_research_automation_steps(run_id,step_id,state) VALUES (?,?,'${stepId === 'QUICK_SEARCH' ? 'QUEUED' : 'PENDING'}')`).run(runId, stepId);
        this.#db.prepare(`INSERT INTO analysis_research_automation_requests(request_key,run_id,request_kind,request_sha256,accepted_at) VALUES (?,?,?,?,?)`)
          .run(input.requestKey, runId, 'START', requestSha, createdAt);
      })();
      void run;
      return { contractVersion: 'research-automation-receipt-v1', exactRetry: false, run: await this.getRun(workspaceId, runId) };
    });
  }

  /** An inert prepared export. The next confirmation/revision must explicitly select its exact package ID. */
  async prepareMetricSource(workspaceId: string, runId: string, value: unknown, bytes: Uint8Array): Promise<ResearchAutomationMetricPrepareReceipt> {
    assertUuid(workspaceId); assertUuid(runId);
    if (!validateMetricPrepare(value) || !REQUEST_KEY.test(value.requestKey)) throw new ResearchAutomationValidationError('Invalid source preparation request.');
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_METRIC_UPLOAD_BYTES) throw new ResearchAutomationValidationError('Workbook size is outside the bounded upload profile.');
    const input = JSON.parse(canonicalJson(value)) as ResearchAutomationMetricPrepareRequest;
    const workbook = Buffer.from(bytes);
    const period = input.measurementPeriod;
    if (period.startDate > period.endDate) throw new ResearchAutomationValidationError('Source period is invalid.');
    const declaration = validateConfirm({ ...input.scope, contractVersion: 'research-automation-confirm-v1', requestKey: input.requestKey, expectedRevision: input.expectedRevision });
    const { contractVersion: _version, requestKey: _key, expectedRevision: _revision, ...normalizedScope } = declaration;
    input.scope = normalizedScope;
    if (!this.#metricIntake) throw new ResearchAutomationStateError('Source upload is unavailable on this handle.');
    return withDatabaseMutationMutex(this.#db, async () => {
      const current = await this.#requireRun(workspaceId, runId);
      const prior = this.#metricIntake!.hasRequest(runId, input.requestKey);
      if (!prior && current.revision !== input.expectedRevision) throw new ResearchAutomationConflictError('revision_conflict', 'The run changed before source preparation.');
      const row = this.#current(runId)!;
      const start = await this.#readStartSnapshot(row.startSha, workspaceId);
      if (period.startDate < start.requestedPeriod.startDate || period.endDate > start.requestedPeriod.endDate)
        throw new ResearchAutomationValidationError('The declared source period must lie within the research period.');
      const scope: ScopeSnapshot = { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, ...normalizedScope };
      if (row.scopeSha) {
        if (canonicalJson(scope) !== canonicalJson(await this.#readScopeSnapshot(row.scopeSha, workspaceId, runId)))
          throw new ResearchAutomationConflictError('revision_conflict', 'Changing confirmed scope requires a new research run.');
        if (!prior && ['FAILED', 'CANCELLED', 'INTERRUPTED'].includes(current.status)) throw new ResearchAutomationStateError('This terminal run cannot receive a new prepared source.');
      } else {
        if (!prior && current.status !== 'AWAITING_SCOPE') throw new ResearchAutomationStateError('Prepare sources while the run is awaiting scope.');
        for (const id of [...scope.selectedProductIds, ...scope.peerProductIds]) if (!current.productCards.some(card => card.productId === id))
          throw new ResearchAutomationValidationError('Source scope products must belong to this run.');
      }
      return this.#metricIntake!.prepare(input, workbook, { runId, start, scope });
    });
  }

  /** Supplemental uploads bind to the immutable confirmed scope, never to a client-authored run identity. */
  async prepareSupplementalSource(workspaceId: string, runId: string, value: unknown,
    files: ReadonlyMap<string, Uint8Array>): Promise<ResearchAutomationSupplementalPrepareReceipt> {
    assertUuid(workspaceId); assertUuid(runId);
    if (!validateSupplementalPrepare(value) || !REQUEST_KEY.test(value.requestKey)) throw new ResearchAutomationValidationError('Invalid supplemental preparation request.');
    const input = JSON.parse(canonicalJson(value)) as ResearchAutomationSupplementalPrepareRequest;
    const retainedFiles = new Map([...files].map(([file, bytes]) => [file, Buffer.from(bytes)]));
    if (!this.#supplementalIntake) throw new ResearchAutomationStateError('Source upload is unavailable on this handle.');
    return withDatabaseMutationMutex(this.#db, async () => {
      const current = await this.#requireRun(workspaceId, runId);
      const prior = this.#supplementalIntake!.hasRequest(runId, input.family, input.requestKey);
      if (!prior && current.status !== 'DRAFT_READY') throw new ResearchAutomationConflictError('revision_conflict', 'Prepare supplemental sources after the original reports are available.');
      const row = this.#current(runId)!;
      if (!row.scopeSha) throw new ResearchAutomationConflictError('revision_conflict', 'A confirmed scope is required.');
      const start = await this.#readStartSnapshot(row.startSha, workspaceId);
      const scope = await this.#readScopeSnapshot(row.scopeSha, workspaceId, runId);
      const receipt = await this.#supplementalIntake!.prepare(input, retainedFiles, { runId, start, scope });
      // Shared automatic-indexing hook: every stored PDF funnels through one best-effort call that never breaks intake.
      await this.#indexStoredPdfsForPageIndex(runId, retainedFiles);
      return receipt;
    });
  }

  /** One PDF of a run with its ledger state for the run page. */
  async pageIndexStatesForRun(workspaceId: string, runId: string): Promise<PageIndexRunPdfStates> {
    assertUuid(workspaceId); assertUuid(runId);
    await this.#requireRun(workspaceId, runId);
    const enabled = this.#pageIndexEnabled() && Boolean(this.#pageIndexTransport());
    const pdfs = this.#runPdfs(runId);
    const documents: PageIndexRunPdfDocument[] = [];
    for (const pdf of pdfs) {
      const ledger = safeReadPageIndex(this.#db, pdf.sha256);
      documents.push({
        fileName: pdf.fileName,
        sourceSha256: pdf.sha256,
        state: !enabled ? 'DISABLED' : ledger?.status ?? 'INDEXING',
        cloudDocId: ledger?.cloudDocId ?? null,
      });
    }
    return { paused: !enabled || this.#pageIndexPaused(), usageLimited: isPageIndexUsageLimited(this.#db), documents };
  }

  #pageIndexEnabled(): boolean { return this.#pageIndex?.enabled ?? process.env.TDN_PAGEINDEX_CLOUD_ENABLED === 'true'; }

  #runPdfs(runId: string): RunPdfRow[] {
    return this.#db.prepare(`SELECT source_sha256 sha256, file_name fileName, package_id packageId,
      manifest_sha256 manifestSha256, logical_path logicalPath FROM analysis_pageindex_run_pdfs WHERE run_id=? ORDER BY source_sha256`).all(runId) as RunPdfRow[];
  }

  /** Explicit PDF attachment: immutable source bytes and a run binding precede indexing. */
  async attachRunPdf(workspaceId: string, runId: string, fileName: string, bytes: Uint8Array): Promise<PageIndexRunPdfStates> {
    assertUuid(workspaceId); assertUuid(runId); await this.#requireRun(workspaceId, runId);
    if (typeof fileName !== 'string' || !fileName.trim() || fileName.length > 250 || /[\\/\r\n\u0000;<>]/u.test(fileName) ||
      !fileName.toLowerCase().endsWith('.pdf') || bytes.length > 32 * 1024 * 1024 || Buffer.from(bytes.subarray(0, 5)).toString('utf8') !== '%PDF-')
      throw new ResearchAutomationValidationError('Tài liệu PDF không hợp lệ hoặc vượt giới hạn dung lượng.');
    await withDatabaseMutationMutex(this.#db, async () => {
      const run = await this.#requireRun(workspaceId, runId);
      const sha = createHash('sha256').update(bytes).digest('hex');
      const prior = this.#runPdfs(runId).find(pdf => pdf.sha256 === sha);
      if (!prior && !['AWAITING_SCOPE', 'DRAFT_READY'].includes(run.status))
        throw new ResearchAutomationConflictError('revision_conflict', 'Đính kèm PDF khi đang chọn phạm vi hoặc đã có bản nháp.');
      await this.#retainRunPdf(runId, fileName, Buffer.from(bytes));
    });
    return this.pageIndexStatesForRun(workspaceId, runId);
  }

  async #retainRunPdf(runId: string, fileName: string, bytes: Uint8Array): Promise<void> {
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const source = new SourcePackageService({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    const logicalPath = 'source.pdf';
    const receipt = await source.intake({ contractVersion: '1.0.0', packageKey: `run-pdf:${sha256}`, version: 1,
      sourceAcquiredAt: null, sourceLabel: 'Tài liệu PDF đính kèm', files: [{ path: logicalPath, sha256, byteSize: bytes.length,
        mediaType: 'application/pdf', evidenceFamily: 'run-pdf', representationRole: 'primary', independence: 'independent',
        providerProvenance: 'operator_supplied_unverified', provenanceBasis: 'Exact source bytes attached to this run; content remains unreviewed.' }] }, new Map([[logicalPath, bytes]]));
    this.#db.prepare(`INSERT INTO analysis_pageindex_run_pdfs(run_id,source_sha256,file_name,package_id,manifest_sha256,logical_path)
      VALUES (?,?,?,?,?,?) ON CONFLICT(run_id,source_sha256) DO NOTHING`).run(runId, sha256, fileName, receipt.packageId, receipt.manifestArtifactSha256, logicalPath);
    if (!this.#pageIndexEnabled()) return;
    await indexRunPdfsForPageIndex([{ sha256, fileName, bytes }], this.#pageIndexDeps());
  }

  /** Safe source-status reads work on the read-only API handle and never call a provider. */
  pageIndexStatusSummary(): PageIndexStatusSummary {
    const enabled = this.#pageIndexEnabled();
    const keyConfigured = Boolean((this.#pageIndex?.apiKey ?? process.env.PAGEINDEX_API_KEY)?.trim());
    const base = { enabled, keyConfigured, billingUrl: 'https://dash.pageindex.ai', usageLimited: isPageIndexUsageLimited(this.#db) };
    try {
      const rows = listPageIndexDocuments(this.#db);
      const attempted = rows.filter(row => row.uploadAttempted);
      const ledgerPages = attempted.reduce((sum, row) => sum + row.pageCount, 0);
      const check = this.#db.prepare('SELECT last_call_at at,succeeded,active_pages pages FROM analysis_pageindex_connector_checks WHERE singleton=1')
        .get() as { at: string; succeeded: number | bigint; pages: number | bigint | null } | undefined;
      const activePages = check && (Number(check.succeeded) !== 1 || check.pages === null) ? null : Math.max(ledgerPages, Number(check?.pages ?? 0));
      const raw = this.#pageIndex?.startingCreditMicroDollars ?? process.env.TDN_PAGEINDEX_STARTING_CREDIT_MICRO_DOLLARS;
      const starting = raw === undefined || String(raw).trim() === '' ? null : Number(raw);
      // A free list has no upload dates for untracked pages. Their historical
      // charges are unknown; replacing ledger accrual with one month refunds
      // known costs and can incorrectly reopen paid uploads.
      const balance = starting === null || activePages === null || activePages > ledgerPages ? null
        : estimatePageIndexLedgerBalance({ startingCreditMicroDollars: starting, now: this.#now(), documents: rows });
      const monthlyCost = balance?.estimatedMonthlyCostMicroDollars ?? (activePages !== null && activePages > ledgerPages ? estimatePageIndexBalance({
        startingCreditMicroDollars: 0, indexedPagesTotal: 0, activePages,
      }).estimatedMonthlyCostMicroDollars : null);
      const question = this.#db.prepare('SELECT max(attempted_at) at FROM analysis_pageindex_questions').get() as { at: string | null };
      return { ...base, lastCallAt: [...attempted.map(row => row.uploadAttemptedAt), check?.at, question.at].filter((at): at is string => Boolean(at)).sort().at(-1) ?? null,
        documentsSent: attempted.length, activePages, balanceMicroDollars: balance?.balanceMicroDollars ?? null,
        balanceCheckedAt: balance ? this.#now().toISOString() : null,
        estimatedMonthlyCostMicroDollars: monthlyCost,
        lowBalance: !balance || balance.lowBalance };
    } catch {
      return { ...base, lastCallAt: null, documentsSent: null, activePages: null, balanceMicroDollars: null,
        balanceCheckedAt: null, estimatedMonthlyCostMicroDollars: null, lowBalance: true };
    }
  }

  /** Only the free document list is called on an explicit owner recheck. */
  async recheckPageIndex(): Promise<PageIndexStatusSummary> {
    const transport = this.#pageIndexTransport();
    if (!transport) return this.pageIndexStatusSummary();
    const at = this.#now().toISOString();
    // Record the call before dispatch; an uncertain/free-list failure shows unknown, never zero.
    this.#db.prepare(`INSERT INTO analysis_pageindex_connector_checks(singleton,last_call_at,succeeded,active_pages) VALUES (1,?,0,NULL)
      ON CONFLICT(singleton) DO UPDATE SET last_call_at=excluded.last_call_at,succeeded=0,active_pages=NULL`).run(at);
    try {
      const remote = await transport.listDocuments();
      const activePages = remote.some(doc => doc.pageCount === null) ? null : remote.reduce((sum, doc) => sum + doc.pageCount!, 0);
      this.#db.prepare('UPDATE analysis_pageindex_connector_checks SET succeeded=1,active_pages=? WHERE singleton=1').run(activePages);
      for (const doc of remote) this.#db.prepare(`UPDATE analysis_pageindex_documents SET status=?, failure_code=?,updated_at=?
        WHERE cloud_doc_id=? AND status='INDEXING'`).run(doc.status === 'completed' ? 'READY' : doc.status === 'failed' ? 'FAILED' : 'INDEXING',
          doc.status === 'failed' ? 'PAGEINDEX_INDEX_FAILED' : null, at, doc.cloudDocId);
    } catch (error) {
      if (error instanceof Error && error.message === 'PAGEINDEX_USAGE_LIMIT_REACHED') {
        try { setPageIndexUsageLimited(this.#db, true, this.#now); } catch { /* unreadable state still pauses spending */ }
      }
    }
    return this.pageIndexStatusSummary();
  }

  /**
   * Shared source-ingest hook for PDFs: attached sources, uploaded inputs and
   * PDFs fetched during research all funnel through `indexRunPdfsForPageIndex`
   * exactly once. Best effort and never throws, so intake never breaks.
   */
  async #indexStoredPdfsForPageIndex(runId: string, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
    try {
      const pdfs = [...files]
        .filter(([, bytes]) => bytes.length > 5 && Buffer.from(bytes.subarray(0, 5)).toString('utf8') === '%PDF-')
        .map(([path, bytes]) => ({
          sha256: createHash('sha256').update(bytes).digest('hex'),
          fileName: path.split('/').pop() ?? path,
          bytes: Buffer.from(bytes),
        }));
      if (pdfs.length === 0) return;
      for (const pdf of pdfs) await this.#retainRunPdf(runId, pdf.fileName, pdf.bytes);
    } catch {
      // Automatic indexing never breaks intake.
    }
  }

  /** Transport for one upload/status check at most; undefined when no key is configured. */
  #pageIndexTransport(): PageIndexCloudClient | undefined {
    try {
      const key = this.#pageIndex?.apiKey ?? process.env.PAGEINDEX_API_KEY ?? '';
      if (!key.trim() || /[\r\n]/u.test(key)) return undefined;
      return new PageIndexCloudClient({ enabled: true, apiKey: key, ...(this.#pageIndex?.fetch ? { fetch: this.#pageIndex.fetch } : {}) });
    } catch {
      return undefined;
    }
  }

  #pageIndexDeps(): EnsureIndexedDeps {
    const transport = this.#pageIndexTransport();
    return {
      db: this.#db,
      now: this.#now,
      enabled: this.#pageIndexEnabled(),
      waitBetweenPollsMs: 1000,
      countPages: async bytes => (await (this.#pageIndex?.extractPdf ?? extractPageIndexPdf)(bytes)).length,
      lowBalance: pages => this.#pageIndexLowBalance(pages),
      upload: transport
        ? async input => {
          const doc = await transport.uploadDocument(input);
          return { cloudDocId: doc.cloudDocId, pageCount: doc.pageCount };
        }
        : undefined,
      fetchStatus: transport ? async id => (await transport.documentStatus(id)).status : undefined,
    };
  }

  /** Unknown balance fails closed, and uploaded/uncertain pages incur storage cost. */
  #pageIndexLowBalance(pages = 0): boolean {
    try {
      const summary = this.pageIndexStatusSummary();
      if (summary.lowBalance || summary.balanceMicroDollars === null) return true;
      const raw = this.#pageIndex?.startingCreditMicroDollars ?? process.env.TDN_PAGEINDEX_STARTING_CREDIT_MICRO_DOLLARS;
      const warning = Math.max(Math.ceil(Number(raw) * 0.2), 2_000_000);
      return summary.balanceMicroDollars - pages * 10_000 <= warning;
    } catch {
      return true;
    }
  }

  #pageIndexPaused(): boolean {
    try {
      return this.#pageIndexLowBalance() || isPageIndexUsageLimited(this.#db);
    } catch {
      return true;
    }
  }

  /** Read the stored, verified artifact; never asks a question while reading. */
  async readPageIndexQuotes(workspaceId: string, runId: string): Promise<PageIndexQuotesArtifact | null> {
    await this.#requireRun(workspaceId, runId);
    const row = this.#db.prepare('SELECT artifact_sha256 sha FROM analysis_pageindex_run_quotes WHERE run_id=?').get(runId) as { sha: string } | undefined;
    return row ? this.#readJson<PageIndexQuotesArtifact>(row.sha, MAX_JSON_ARTIFACT_BYTES, 'application/json') : null;
  }

  /** The run worker alone performs bounded indexing waits and durable no-retry questions. */
  async #processRunPdfs(runId: string, reports: readonly string[]): Promise<void> {
    if (!this.#pageIndexEnabled()) return;
    const transport = this.#pageIndexTransport();
    if (!transport) return;
    const files = this.#runPdfs(runId);
    const sections = PAGEINDEX_ELIGIBLE_SECTIONS.filter(id => reports.includes(id.startsWith('M') ? 'MARKET' : 'INSIGHT'));
    const rawCap = this.#pageIndex?.maxQuestionsPerRun ?? Number(process.env.TDN_PAGEINDEX_MAX_QUESTIONS_PER_RUN ?? 10);
    const cap = Number.isSafeInteger(rawCap) && rawCap >= 0 ? Math.min(rawCap, 100) : 0;
    const plan = planPageIndexQuestions({ sections, pdfCount: files.length, maxPerRun: cap });
    const reader = new SourcePackageService({ db: this.#db, artifactStore: this.#artifacts });
    const local = new Map<number, { bytes: Buffer; pages: readonly PageIndexLocalPage[] }>();
    for (const [index, file] of files.entries()) {
      try {
        const packageValue = await reader.readVerified(file.packageId, {
          maxFileBytes: 32 * 1024 * 1024,
          // The inclusive PDF member limit does not include its bounded manifest.
          maxTotalBytes: 32 * 1024 * 1024 + 64 * 1024,
        });
        const member = packageValue.files.find(entry => entry.path === file.logicalPath);
        if (packageValue.manifestArtifactSha256 !== file.manifestSha256 || !member || member.sha256 !== file.sha256 || member.mediaType !== 'application/pdf') continue;
        await indexRunPdfsForPageIndex([{ sha256: file.sha256, fileName: file.fileName, bytes: member.bytes }], this.#pageIndexDeps());
        const ledger = readPageIndexDocument(this.#db, file.sha256);
        if (ledger?.status !== 'READY' || !ledger.cloudDocId) continue;
        const pages = await (this.#pageIndex?.extractPdf ?? extractPageIndexPdf)(member.bytes);
        local.set(index, { bytes: member.bytes, pages });
      } catch { /* Local verification failure never authorizes a query. */ }
    }
    for (const question of plan) {
      const file = files[question.pdfIndex]!; const extracted = local.get(question.pdfIndex);
      const ledger = readPageIndexDocument(this.#db, file.sha256);
      if (!extracted || ledger?.status !== 'READY' || !ledger.cloudDocId || this.#pageIndexPaused()) continue;
      const reserved = this.#db.prepare(`INSERT INTO analysis_pageindex_questions(run_id,source_sha256,section_id,attempted_at)
        SELECT ?,?,?,? WHERE (SELECT count(*) FROM analysis_pageindex_questions WHERE run_id=?) < ?
        ON CONFLICT(run_id,source_sha256,section_id) DO NOTHING RETURNING section_id`)
        .get(runId, file.sha256, question.sectionId, this.#now().toISOString(), runId, cap);
      if (!reserved) continue;
      try {
        const result = await transport.query({ contractVersion: 'pageindex-cloud-query-v1', sourcePackageId: file.packageId,
          manifestSha256: file.manifestSha256, logicalPath: file.logicalPath, sourceSha256: file.sha256,
          cloudDocId: ledger.cloudDocId, cloudFileName: ledger.cloudFileName, pageCount: extracted.pages.length, question: question.question }, extracted.bytes, extracted.pages);
        const drops: string[] = [];
        const verified = verifyPageIndexQuotes({ candidates: result.candidates, localPages: extracted.pages,
          pageCount: extracted.pages.length, sourceSha256: file.sha256, cloudDocId: ledger.cloudDocId,
          sectionId: question.sectionId, onDrop: drop => drops.push(drop.reason) });
        const artifact = await this.#putJson(buildVerifiedQuotesArtifact(runId, verified), this.#now().toISOString());
        this.#db.transaction(() => {
          this.#registerManifest(artifact, 'application/json', this.#now().toISOString());
          this.#db.prepare(`UPDATE analysis_pageindex_questions SET result_sha256=?,failure_code=?
            WHERE run_id=? AND source_sha256=? AND section_id=? AND result_sha256 IS NULL AND failure_code IS NULL`)
            .run(artifact.sha256, drops.length ? `DROPPED_${drops[0]}` : null, runId, file.sha256, question.sectionId);
        })();
      } catch (error) {
        const code = error instanceof Error && /^PAGEINDEX_[A-Z0-9_]+$/u.test(error.message) ? error.message : 'PAGEINDEX_QUERY_FAILED';
        if (code === 'PAGEINDEX_USAGE_LIMIT_REACHED') {
          try { setPageIndexUsageLimited(this.#db, true, this.#now); } catch { /* reservation remains durable */ }
        }
        try { this.#db.prepare(`UPDATE analysis_pageindex_questions SET failure_code=? WHERE run_id=? AND source_sha256=? AND section_id=?
          AND result_sha256 IS NULL`).run(code, runId, file.sha256, question.sectionId); } catch { /* reserved question is never retried */ }
      }
    }
    const rows = this.#db.prepare(`SELECT result_sha256 sha FROM analysis_pageindex_questions WHERE run_id=? AND result_sha256 IS NOT NULL
      ORDER BY source_sha256,section_id`).all(runId) as Array<{ sha: string }>;
    const quotes: PageIndexVerifiedQuote[] = [];
    for (const row of rows) quotes.push(...(await this.#readJson<PageIndexQuotesArtifact>(row.sha, MAX_JSON_ARTIFACT_BYTES, 'application/json')).quotes);
    const artifact = await this.#putJson(buildVerifiedQuotesArtifact(runId, quotes), this.#now().toISOString());
    this.#db.transaction(() => {
      this.#registerManifest(artifact, 'application/json', this.#now().toISOString());
      this.#db.prepare(`INSERT INTO analysis_pageindex_run_quotes(run_id,artifact_sha256) VALUES (?,?)
        ON CONFLICT(run_id) DO UPDATE SET artifact_sha256=excluded.artifact_sha256`).run(runId, artifact.sha256);
    })();
  }

  async listPreparedMetricSources(workspaceId: string, runId: string): Promise<ResearchAutomationPreparedMetricList> {
    assertUuid(workspaceId); assertUuid(runId);
    await this.#requireRun(workspaceId, runId);
    const row = this.#current(runId)!;
    const start = await this.#readStartSnapshot(row.startSha, workspaceId);
    const reader = new FoundationSourcePackageReader(new SourcePackageService({ db: this.#db, artifactStore: this.#artifacts }));
    return { contractVersion: 'automation-prepared-metric-list-v1', workspaceId, runId,
      sources: await readPreparedMetricSources(reader, this.#metricMethods, { runId, start }, validateMetricPrepare) };
  }

  /** OWNER reader page from the latest verified market draft and one prepared product-list file of this run. */
  async buildReaderReport(workspaceId: string, runId: string, value: unknown, actor: { actorId: string; role: 'OWNER' }) {
    assertUuid(workspaceId); assertUuid(runId);
    const packageId = (value as { metricPackageId?: unknown } | null)?.metricPackageId;
    if (typeof packageId !== 'string') throw new ResearchAutomationValidationError('Yêu cầu dựng bản đọc không hợp lệ.');
    return withDatabaseMutationMutex(this.#db, async () =>
      this.#readerReports.build(await this.#readerContext(workspaceId, runId, packageId), value, actor));
  }
  async decideReaderReport(workspaceId: string, runId: string, value: unknown, actor: { actorId: string; role: 'OWNER' }) {
    await this.getRun(workspaceId, runId);
    return withDatabaseMutationMutex(this.#db, async () => this.#readerReports.decide({ workspaceId, runId }, value, actor));
  }
  async listReaderReports(workspaceId: string, runId: string) {
    await this.getRun(workspaceId, runId);
    return this.#readerReports.list({ workspaceId, runId });
  }
  async readReaderReport(workspaceId: string, runId: string, revisionId: string) {
    assertUuid(revisionId);
    await this.getRun(workspaceId, runId);
    return this.#readerReports.html({ workspaceId, runId }, revisionId);
  }
  async #readerContext(workspaceId: string, runId: string, packageId: string): Promise<ReaderDraftContext> {
    const run = await this.getRun(workspaceId, runId);
    if (run.status !== 'DRAFT_READY') throw new ResearchAutomationStateError('Chỉ dựng bản đọc khi bản nháp đã sẵn sàng.');
    const pairs = await this.listReportVersions(workspaceId, runId);
    const latest = pairs.at(-1);
    const market = latest?.outputs.find(output => output.kind === 'MARKET');
    if (!latest || !market) throw new ResearchAutomationStateError('Lượt này chưa có bản nháp thị trường.');
    // Full verification of the exact draft pair before its semantic content is restated.
    const verified = await this.readReport(workspaceId, runId, 'MARKET', false, latest.pairId);
    const marketSemantic = await this.#readJson<Record<string, unknown>>(verified.versionId, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    const prepared = (await this.listPreparedMetricSources(workspaceId, runId)).sources.find(source => source.packageId === packageId);
    if (!prepared) throw new ResearchAutomationValidationError('Tệp danh sách sản phẩm này không thuộc lượt research.');
    const reader = new FoundationSourcePackageReader(new SourcePackageService({ db: this.#db, artifactStore: this.#artifacts }));
    const source = await reader.readFinalizedSourcePackage(packageId, { maxFileBytes: MAX_METRIC_UPLOAD_BYTES, maxTotalBytes: MAX_METRIC_UPLOAD_BYTES + 64 * 1024 });
    const workbook = source.files.find(file => file.path === 'metric/export.xlsx');
    if (!workbook) throw new ResearchAutomationIntegrityError('Prepared product-list workbook is missing.');
    const collection = this.#db.prepare(`SELECT result_sha256 resultSha FROM analysis_research_automation_steps WHERE run_id=? AND step_id='COLLECTION'`).get(runId) as { resultSha: string | null } | undefined;
    const webResults = collection?.resultSha ? (await this.#readStepDocument(collection.resultSha, runId, 'COLLECTION')).webResults ?? [] : [];
    return { workspaceId, runId, draftPairId: latest.pairId, marketSemantic,
      webResults: webResults.map(({ position, title, url, snippet, retrievedAt, site, published }) =>
        ({ position, title, url, snippet, retrievedAt, site: site ?? null, published: published ?? null })),
      metric: { packageId, workbook: workbook.bytes, measurementPeriod: prepared.request.measurementPeriod } };
  }

  async listPreparedSupplementalSources(workspaceId: string, runId: string): Promise<ResearchAutomationSupplementalPreparedList> {
    assertUuid(workspaceId); assertUuid(runId);
    await this.#requireRun(workspaceId, runId);
    const row = this.#current(runId)!;
    if (!row.scopeSha) return { contractVersion: 'automation-supplemental-prepared-list-v1', workspaceId, runId, packages: [] };
    const start = await this.#readStartSnapshot(row.startSha, workspaceId);
    const scope = await this.#readScopeSnapshot(row.scopeSha, workspaceId, runId);
    return readPreparedSupplementalSources(this.#boundedSourceReader(), { runId, start, scope });
  }

  async adoptMetricRule(workspaceId: string, runId: string, value: unknown, actor: { actorId: string; role: 'OWNER' }): Promise<AutomationMetricRuleAdoptionReceipt> {
    return withDatabaseMutationMutex(this.#db, async () => this.#metricRules.adopt(await this.#metricRuleBinding(workspaceId, runId), value, actor));
  }

  async proposeMetricMembership(workspaceId: string, runId: string, value: unknown, actor: { actorId: string; role: 'OWNER' }) {
    const result = await this.#metricMembership.propose(workspaceId, runId, value, actor);
    return { contractVersion: 'metric-membership-mutation-v1' as const, kind: 'PROPOSAL' as const, id: result.evidence.proposalId, exactRetry: result.exactRetry };
  }

  async acceptMetricMembership(workspaceId: string, runId: string, value: unknown, actor: { actorId: string; role: 'OWNER' }) {
    const result = await this.#metricMembership.accept(workspaceId, runId, value, actor);
    return { contractVersion: 'metric-membership-mutation-v1' as const, kind: 'ACCEPTANCE' as const, id: result.evidence.receiptId, exactRetry: result.exactRetry };
  }

  async readMetricMembership(workspaceId: string, runId: string, pairId: string, adoptionId: string) {
    return this.#metricMembership.review(workspaceId, runId, pairId, adoptionId);
  }

  async readMetricMembershipProposal(workspaceId: string, runId: string, proposalId: string) {
    const value = await this.#metricMembership.readProposal(proposalId, workspaceId, runId);
    return { contractVersion: 'metric-membership-proposal-view-v1' as const, proposalId, workspaceId, runId,
      pairId: value.binding.pairId, adoptionId: value.binding.adoptionId, createdAt: value.createdAt, assignments: value.request.assignments };
  }

  async readMetricMembershipReceipt(workspaceId: string, runId: string, receiptId: string) {
    const value = await this.#metricMembership.readReceipt(receiptId, workspaceId, runId);
    return { contractVersion: 'metric-membership-acceptance-view-v1' as const, receiptId, workspaceId, runId,
      proposalId: value.request.proposalId, acceptedAt: value.acceptedAt, selectedRecordKeys: value.request.selectedRecordKeys };
  }

  async #metricMembershipContext(workspaceId: string, runId: string, pairId: string, adoptionId: string): Promise<MetricMembershipContext> {
    assertUuid(adoptionId);
    if (!/^[0-9a-f]{64}$/.test(pairId)) throw new ResearchAutomationValidationError('Invalid exact report pair.');
    const ruleBinding = await this.#metricRuleBinding(workspaceId, runId);
    const adoption = await this.#metricRules.read(ruleBinding, adoptionId);
    // This reuses the owning historical report reader, including exact source/method verification.
    const report = await this.readReport(workspaceId, runId, 'MARKET', false, pairId);
    const semantic = await this.#readJson<Record<string, unknown>>(report.versionId, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!semantic.metricMethods) throw new ResearchAutomationConflictError('invalid_state', 'This exact report has no verified Metric preparation.');
    const methods = semantic.metricMethods as AutomationMetricMethodSnapshot;
    return { binding: { workspaceId, runId, pairId, adoptionId, adoptionSha256: digest(adoption),
      preparationSha256: methods.preparation.preparationSha256, inputSha256: methods.preparation.normalizedInput.valueSha256,
      sourcePackageId: methods.originalSourcePackage.packageId, scopeSha256: ruleBinding.scopeSha256 }, input: methods.result.input, adoption };
  }

  async listMetricRuleAdoptions(workspaceId: string, runId: string): Promise<AutomationMetricRuleAdoptionList> {
    const binding = await this.#metricRuleBinding(workspaceId, runId);
    return { contractVersion: 'automation-metric-rule-list-v1', workspaceId, runId, adoptions: await this.#metricRules.list(binding) };
  }

  async getMetricRuleAdoption(workspaceId: string, runId: string, adoptionId: string): Promise<AutomationMetricRuleAdoptionReceipt> {
    assertUuid(adoptionId);
    const artifact = await this.#metricRules.read(await this.#metricRuleBinding(workspaceId, runId), adoptionId);
    return { contractVersion: 'automation-metric-rule-receipt-v1', adoptionId, workspaceId, runId,
      adoptedAt: artifact.adoptedAt, rulebook: artifact.request.rulebook, exactRetry: false };
  }

  async #metricRuleBinding(workspaceId: string, runId: string): Promise<MetricRuleBinding> {
    assertUuid(workspaceId); assertUuid(runId);
    await this.#requireRun(workspaceId, runId);
    const row = this.#current(runId)!;
    if (!row.scopeSha || !row.scopeConfirmedAt) throw new ResearchAutomationStateError('Confirm the research scope before adopting Metric rules.');
    await this.#readStartSnapshot(row.startSha, workspaceId);
    await this.#readScopeSnapshot(row.scopeSha, workspaceId, runId);
    return { workspaceId, runId, startSha256: row.startSha, scopeSha256: row.scopeSha };
  }

  async confirmScope(workspaceId: string, runId: string, value: unknown): Promise<ResearchAutomationMutationReceipt> {
    const input = validateScopeConfirmation(value);
    assertUuid(workspaceId); assertUuid(runId);
    const requestSha = digest({ kind: 'CONFIRM', workspaceId, runId, input });
    return withDatabaseMutationMutex(this.#db, async () => {
      const prior = this.#request(input.requestKey);
      if (prior) return this.#retryOrConflict(prior, requestSha, workspaceId, 'CONFIRM', runId);
      const current = await this.#requireRun(workspaceId, runId);
      if (current.revision !== input.expectedRevision) throw new ResearchAutomationConflictError('revision_conflict', 'The run changed; reload it before confirming scope.');
      if (current.status !== 'AWAITING_SCOPE') throw new ResearchAutomationStateError('Scope can only be confirmed while the run is awaiting scope.');
      for (const id of [...input.selectedProductIds, ...input.peerProductIds]) {
        if (!current.productCards.some((card) => card.productId === id)) throw new ResearchAutomationValidationError('Every selected product must be a card from this run.');
      }
      const confirmedAt = this.#now().toISOString();
      const scope: ScopeSnapshot = { contractVersion: 'research-automation-scope-snapshot-v1', workspaceId, runId, definition: input.definition,
        includeTerms: [...input.includeTerms], excludeTerms: [...input.excludeTerms], selectedProductIds: [...input.selectedProductIds], peerProductIds: [...input.peerProductIds],
        ...(input.exactShopeeUrls !== undefined ? { exactShopeeUrls: [...input.exactShopeeUrls] } : {}) };
      const row = this.#current(runId)!;
      const start = await this.#readStartSnapshot(row.startSha, workspaceId);
      const bound = { runId, start, scope, scopeConfirmedAt: confirmedAt };
      let metric: AutomationConfirmedSourceSet['metric'] | undefined;
      let native: AutomationConfirmedSourceSet['nativeReview'] | undefined;
      let referenceArtifact: StoredArtifact | undefined;
      if (input.contractVersion === 'research-automation-confirm-v2') {
        metric = input.sources.metric.decision === 'USE_PREPARED'
          ? { decision: 'ADMITTED', sourcePackage: await this.#metricMethods.inspectPrepared(bound, input.sources.metric.packageId) }
          : { decision: input.sources.metric.decision };
        if (input.sources.nativeReview === 'SKIP') native = { decision: 'SKIPPED' };
        else {
          const resolved = await this.#nativeReviews.resolve(bound);
          if (resolved.state === 'AMBIGUOUS' || resolved.state === 'UNSUPPORTED_SCOPE')
            throw new ResearchAutomationValidationError('Choose an unambiguous supported retained review scope before confirmation.');
          if (resolved.state === 'RESOLVED') {
            await this.#nativeReviews.readReference(resolved.reference, bound);
            referenceArtifact = await this.#putJson(resolved.reference, confirmedAt);
            native = { decision: 'RESOLVED', referenceSha256: referenceArtifact.sha256 };
          } else native = { decision: 'NONE' };
        }
      }
      const stored = await this.#putJson(scope, confirmedAt);
      const sourceSet: AutomationConfirmedSourceSet | undefined = metric && native ? {
        contractVersion: 'automation-confirmed-source-set-v1', runId, workspaceId, executionId: randomUUID(),
        startSha256: row.startSha, scopeSha256: stored.sha256, requestSha256: requestSha, confirmedAt, metric, nativeReview: native,
      } : undefined;
      if (sourceSet && !validateSourceSet(sourceSet)) throw new ResearchAutomationIntegrityError('Confirmed source set is invalid.');
      const sourceSetArtifact = sourceSet ? await this.#putJson(sourceSet, confirmedAt) : undefined;
      this.#db.transaction(() => {
        this.#registerManifest(stored, 'application/json', confirmedAt);
        if (sourceSetArtifact) this.#registerManifest(sourceSetArtifact, 'application/json', confirmedAt);
        const change = this.#db.prepare(`UPDATE analysis_research_automation_runs SET revision=revision+1,status='COLLECTION_QUEUED',scope_request_sha256=?,scope_confirmed_at=?,updated_at=?,confirmed_source_set_sha256=? WHERE run_id=? AND revision=? AND status='AWAITING_SCOPE'`)
          .run(stored.sha256, confirmedAt, confirmedAt, sourceSetArtifact?.sha256 ?? null, runId, input.expectedRevision);
        if (change.changes !== 1) throw new ResearchAutomationConflictError('revision_conflict', 'The run changed; reload it before confirming scope.');
        this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED' WHERE run_id=? AND step_id='COLLECTION'`).run(runId);
        this.#db.prepare(`INSERT INTO analysis_research_automation_requests(request_key,run_id,request_kind,request_sha256,accepted_at) VALUES (?,?,?,?,?)`)
          .run(input.requestKey, runId, 'CONFIRM', requestSha, confirmedAt);
        if (sourceSet && sourceSetArtifact) {
          if (referenceArtifact) this.#registerManifest(referenceArtifact, 'application/json', confirmedAt);
          this.#registerManifest(sourceSetArtifact, 'application/json', confirmedAt);
          this.#db.prepare(`INSERT INTO analysis_research_automation_source_sets(run_id,execution_id,source_set_sha256,request_key,request_sha256,start_sha256,scope_sha256,confirmed_at) VALUES (?,?,?,?,?,?,?,?)`)
            .run(runId, sourceSet.executionId, sourceSetArtifact.sha256, input.requestKey, requestSha, row.startSha, stored.sha256, confirmedAt);
        }
      }).immediate();
      return { contractVersion: 'research-automation-receipt-v1', exactRetry: false, run: await this.getRun(workspaceId, runId) };
    });
  }

  async cancel(workspaceId: string, runId: string, value: unknown): Promise<ResearchAutomationMutationReceipt> {
    const input = validateCancel(value);
    assertUuid(workspaceId); assertUuid(runId);
    const requestSha = digest({ kind: 'CANCEL', workspaceId, runId, input });
    const receipt: ResearchAutomationMutationReceipt = await withDatabaseMutationMutex(this.#db, async (): Promise<ResearchAutomationMutationReceipt> => {
      const prior = this.#request(input.requestKey);
      if (prior) return this.#retryOrConflict(prior, requestSha, workspaceId, 'CANCEL', runId);
      const current = await this.#requireRun(workspaceId, runId);
      if (current.revision !== input.expectedRevision) throw new ResearchAutomationConflictError('revision_conflict', 'The run changed; reload it before cancelling.');
      if (TERMINAL_STATUSES.has(current.status)) throw new ResearchAutomationStateError('The run is already closed.');
      const acceptedAt = this.#now().toISOString();
      this.#db.transaction(() => {
        if (current.status === 'QUICK_SEARCH_RUNNING' || current.status === 'COLLECTING') {
          this.#transition(runId, current.revision, 'CANCELLING', acceptedAt);
        } else if (current.status === 'RENDERING') {
          this.#transition(runId, current.revision, 'CANCELLED', acceptedAt);
          this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='CANCELLED',message_code='CANCELLED_BY_OWNER',finished_at=? WHERE run_id=? AND step_id='REPORTS' AND state IN ('QUEUED','RUNNING')`).run(acceptedAt, runId);
          this.#skipPendingSteps(runId, acceptedAt);
        } else {
          this.#transition(runId, current.revision, 'CANCELLED', acceptedAt);
          const queuedStep = current.status === 'QUICK_SEARCH_QUEUED' ? 'QUICK_SEARCH' : current.status === 'COLLECTION_QUEUED' ? 'COLLECTION' : null;
          if (queuedStep) {
            this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='CANCELLED',message_code='CANCELLED_BY_OWNER',finished_at=? WHERE run_id=? AND step_id=? AND state='QUEUED'`).run(acceptedAt, runId, queuedStep);
          } else {
            this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='CANCELLED',message_code='CANCELLED_BY_OWNER',finished_at=? WHERE run_id=? AND state='RUNNING'`).run(acceptedAt, runId);
          }
          this.#skipPendingSteps(runId, acceptedAt);
        }
        this.#db.prepare(`INSERT INTO analysis_research_automation_requests(request_key,run_id,request_kind,request_sha256,accepted_at) VALUES (?,?,?,?,?)`)
          .run(input.requestKey, runId, 'CANCEL', requestSha, acceptedAt);
      })();
      this.#active.get(runId)?.abort();
      return { contractVersion: 'research-automation-receipt-v1', exactRetry: false, run: await this.getRun(workspaceId, runId) };
    });
    return receipt;
  }

  async listRuns(workspaceId: string): Promise<ResearchAutomationRunList> {
    assertUuid(workspaceId);
    await this.#readWorkspace(workspaceId);
    const rows = this.#db.prepare(`SELECT run_id runId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,created_at createdAt,updated_at updatedAt
      FROM analysis_research_automation_runs WHERE workspace_id=? ORDER BY created_at DESC,run_id DESC LIMIT ?`).all(workspaceId, RUN_LIST_LIMIT) as Array<Record<string, unknown>>;
    return { contractVersion: 'research-automation-run-list-v1', workspaceId, runs: rows.map((row) => ({
      runId: String(row.runId), revision: toNumber(row.revision as bigint | number), status: row.status as ResearchAutomationRun['status'], mode: row.mode as ResearchAutomationRun['mode'], keyword: String(row.keyword),
      requestedPeriod: { startDate: String(row.periodStart), endDate: String(row.periodEnd), dayCount: inclusiveDays({ startDate: String(row.periodStart), endDate: String(row.periodEnd) }) },
      reports: String(row.reports).split(',') as ResearchAutomationRun['reports'], createdAt: String(row.createdAt), updatedAt: String(row.updatedAt),
    })) };
  }

  /** Stored history per source for the status board. Reads rows only; never calls a provider. */
  async readSourceActivity(workspaceId: string): Promise<ResearchAutomationSourceActivityResult> {
    assertUuid(workspaceId);
    await this.#readWorkspace(workspaceId);
    const activity = Object.fromEntries((['kalodata', 'serpapi', 'apify-shopee', 'metric', 'kalodata-video',
      'apify-tiktok-comments', 'video-reading', 'meta-ad-library', 'official-stats', 'world-bank', 'pageindex'] as const)
      .map(key => [key, { lastDataAt: null, dataCount: 0, lastUsageAt: null }])) as Record<ResearchAutomationSourceActivityKey, { lastDataAt: string | null; dataCount: number; lastUsageAt: string | null }>;
    const captures = this.#db.prepare(`SELECT c.provider provider,MAX(c.retrieved_at) lastAt,COUNT(*) total FROM analysis_research_automation_captures c
      JOIN analysis_research_automation_runs r ON r.run_id=c.run_id WHERE r.workspace_id=? AND c.provider IN ('kalodata','serpapi','apify-shopee') GROUP BY c.provider`).all(workspaceId) as Array<{ provider: 'kalodata' | 'serpapi' | 'apify-shopee'; lastAt: string; total: bigint | number }>;
    for (const row of captures) { activity[row.provider].lastDataAt = row.lastAt; activity[row.provider].dataCount = toNumber(row.total); }
    const usage = this.#db.prepare(`SELECT u.provider provider,MAX(u.recorded_at) lastAt FROM analysis_research_automation_usage u
      JOIN analysis_research_automation_runs r ON r.run_id=u.run_id WHERE r.workspace_id=? AND u.provider IN ('kalodata','serpapi','apify-shopee') GROUP BY u.provider`).all(workspaceId) as Array<{ provider: 'kalodata' | 'serpapi' | 'apify-shopee'; lastAt: string }>;
    for (const row of usage) activity[row.provider].lastUsageAt = row.lastAt;
    // Metric workbooks are owner uploads stored as finalized attachment packages keyed `automation-upload:<runId>-…`.
    const metric = this.#db.prepare(`SELECT MAX(p.finalized_at) lastAt,COUNT(*) total FROM foundation_source_packages p
      JOIN foundation_source_attachment_origins o ON o.package_id=p.package_id
      JOIN analysis_research_automation_runs r ON substr(p.package_key,1,55)='automation-upload:'||r.run_id||'-'
      WHERE r.workspace_id=? AND p.finalized_at IS NOT NULL AND o.origin_kind='AUTOMATION_ATTACHMENT'`).get(workspaceId) as { lastAt: string | null; total: bigint | number };
    activity.metric.lastDataAt = metric.lastAt; activity.metric.dataCount = toNumber(metric.total);
    // P4 Kalodata video/creator uploads via the owning module's declared
    // history-read interface: finalized attachment packages per run, metadata
    // only. The interface exposes no timestamp, so lastDataAt stays null.
    const videoReader = new FoundationSourcePackageReader(new SourcePackageService({ db: this.#db, artifactStore: this.#artifacts }));
    const runIds = this.#db.prepare(`SELECT run_id runId FROM analysis_research_automation_runs WHERE workspace_id=?`).all(workspaceId) as Array<{ runId: string }>;
    let videoCount = 0;
    for (const { runId } of runIds) {
      videoCount += (await videoReader.findAutomationAttachmentPackagesByKeyPrefix(videoPackageKeyPrefix(runId))).length;
    }
    activity['kalodata-video'].dataCount = videoCount;
    // PageIndex workspace history only: PDFs attached to this workspace's runs
    // and this workspace's recorded question attempts. Account-wide ledger
    // numbers (balance, active pages, documents sent) are deliberately excluded
    // here; the board renders them from the connector summary as account totals.
    // analysis_pageindex_run_pdfs carries no timestamp, so lastDataAt stays null.
    const workspacePdfs = this.#db.prepare(`SELECT COUNT(*) total FROM analysis_pageindex_run_pdfs p
      JOIN analysis_research_automation_runs r ON r.run_id=p.run_id WHERE r.workspace_id=?`).get(workspaceId) as { total: bigint | number };
    activity.pageindex.dataCount = toNumber(workspacePdfs.total);
    const workspaceQuestions = this.#db.prepare(`SELECT MAX(q.attempted_at) lastAt FROM analysis_pageindex_questions q
      JOIN analysis_research_automation_runs r ON r.run_id=q.run_id WHERE r.workspace_id=?`).get(workspaceId) as { lastAt: string | null };
    activity.pageindex.lastUsageAt = workspaceQuestions.lastAt;
    // SerpApi per-operation capture history (search vs Trends). Usage rows are a
    // provider-level aggregate across the whole provider call, so per-operation
    // lastUsageAt stays null: attributing it to one operation would mislabel it.
    // The provider-level last usage remains on the card itself.
    const operations = this.#db.prepare(`SELECT c.operation operation,MAX(c.retrieved_at) lastAt,COUNT(*) total
      FROM analysis_research_automation_captures c
      JOIN analysis_research_automation_runs r ON r.run_id=c.run_id WHERE r.workspace_id=? AND c.provider='serpapi' GROUP BY c.operation ORDER BY c.operation`).all(workspaceId) as Array<{ operation: string; lastAt: string; total: bigint | number }>;
    const serpapiOperations: ResearchAutomationSerpApiOperation[] = operations.map(row => ({
      operation: row.operation, count: toNumber(row.total), lastDataAt: row.lastAt, lastUsageAt: null }));
    // No collectors exist yet for these sources; their readers and the
    // NOT_BUILT flip belong to the owning packages (P9: TikTok comments and
    // video reading; P10: official statistics and World Bank; U-23: Meta ads).
    // Until then the board shows honest zeros, never invented history.
    return { ...activity, serpapiOperations };
  }

  async getRun(workspaceId: string, runId: string): Promise<ResearchAutomationRun> {
    assertUuid(workspaceId); assertUuid(runId);
    const row = this.#db.prepare(`SELECT run_id runId,workspace_id workspaceId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,
      start_request_sha256 startSha,scope_request_sha256 scopeSha,scope_confirmed_at scopeConfirmedAt,confirmed_source_set_sha256 sourceSetSha,actor_id actorId,created_at createdAt,updated_at updatedAt
      FROM analysis_research_automation_runs WHERE run_id=? AND workspace_id=?`).get(runId, workspaceId) as RunRow | undefined;
    if (!row) {
      await this.#readWorkspace(workspaceId);
      throw new ResearchAutomationNotFoundError('run_not_found', 'Research run not found.');
    }
    return this.#projection(row);
  }

  async listReportVersions(workspaceId: string, runId: string): Promise<readonly ResearchAutomationReportPair[]> {
    await this.getRun(workspaceId, runId);
    const run = this.#current(runId)!;
    const original = this.#originalPair(run);
    if (!original) return [];
    const result: ResearchAutomationReportPair[] = [original];
    const attempts = this.#db.prepare(`SELECT attempt_id attemptId FROM analysis_research_automation_attempts WHERE run_id=? AND state='COMMITTED' ORDER BY version_number`).all(runId) as { attemptId: string }[];
    let previous = original.pairId;
    for (const item of attempts) {
      const attempt = this.#attempt(item.attemptId)!;
      if (attempt.previousPairId !== previous || toNumber(attempt.versionNumber!) !== result.length + 1)
        throw new ResearchAutomationIntegrityError('Report revision chain is inconsistent.');
      const pair = await this.#readAttemptPair(run, attempt);
      result.push(pair); previous = pair.pairId;
    }
    return result;
  }

  async getReportRevision(workspaceId: string, runId: string, attemptId: string): Promise<ResearchAutomationRevisionReceipt> {
    assertUuid(attemptId);
    await this.getRun(workspaceId, runId);
    const run = this.#current(runId)!;
    const attempt = this.#attempt(attemptId);
    if (!attempt || attempt.runId !== runId) throw new ResearchAutomationNotFoundError('report_not_available', 'Report revision not found.');
    await this.#readAttemptSources(run, attempt);
    this.#previousAttempt(run, attempt);
    if (attempt.state === 'COMMITTED') await this.#readAttemptPair(run, attempt);
    return revisionReceipt(attempt, false);
  }

  /** Durable restoration of active/settled attempts, independent of browser memory. */
  async listReportAttempts(workspaceId: string, runId: string): Promise<readonly ResearchAutomationRevisionReceipt[]> {
    await this.getRun(workspaceId, runId);
    const identities = this.#db.prepare(`SELECT attempt_id attemptId FROM analysis_research_automation_attempts WHERE run_id=? ORDER BY attempt_number LIMIT 101`)
      .all(runId) as { attemptId: string }[];
    if (identities.length > 100) throw new ResearchAutomationValidationError('Report attempt inventory exceeds the supported read bound.');
    const receipts: ResearchAutomationRevisionReceipt[] = [];
    for (const identity of identities) {
      const receipt = await this.getReportRevision(workspaceId, runId, identity.attemptId);
      if (receipt.attemptNumber !== receipts.length + 1) throw new ResearchAutomationIntegrityError('Report attempt sequence is inconsistent.');
      receipts.push(receipt);
    }
    if (receipts.filter(receipt => receipt.state === 'QUEUED' || receipt.state === 'RUNNING').length > 1)
      throw new ResearchAutomationIntegrityError('Multiple report attempts are active.');
    return receipts;
  }

  /** Supplemental rendering never performs source collection or changes the original run. */
  async requestReportRevision(workspaceId: string, runId: string, value: unknown): Promise<ResearchAutomationRevisionReceipt> {
    if (!validateRevision(value) || !REQUEST_KEY.test(value.requestKey))
      throw new ResearchAutomationValidationError('Report revision request is invalid.');
    const input: AutomationReportRevisionRequest = JSON.parse(canonicalJson(value));
    if ('acceptedMetric' in input) input.acceptedMetric.receiptIds.sort();
    if ('acceptedInsight' in input) input.acceptedInsight.receiptIds.sort();
    const requestSha = digest(input);
    return withDatabaseMutationMutex(this.#db, async () => {
      await this.getRun(workspaceId, runId);
      const previousRequest = this.#attemptRequest(input.requestKey);
      if (previousRequest) {
        const prior = this.#attempt(previousRequest.attemptId)!;
        if (previousRequest.kind !== 'CREATE' || previousRequest.sha !== requestSha || prior.runId !== runId)
          throw new ResearchAutomationConflictError('request_key_conflict', 'This request key is bound to another revision.');
        await this.#readAttemptSources(this.#current(runId)!, prior);
        if (prior.state === 'COMMITTED') await this.#readAttemptPair(this.#current(runId)!, prior);
        if ('acceptedInsight' in input) await this.#insightCoding.reportSnapshot(workspaceId, runId, input.previousPairId, input.acceptedInsight);
        if ('draftInsight' in input) await this.#insightCoding.reportDraftSnapshot(workspaceId, runId, input.previousPairId, input.draftInsight);
        if ('boundedMethods' in input) await this.#loadBoundedMethods(this.#current(runId)!, input);
        if ('quoteMethods' in input) await this.#loadQuoteMethods(this.#current(runId)!, input);
        return revisionReceipt(prior, true);
      }
      const run = this.#current(runId)!;
      if (run.status !== 'DRAFT_READY' || !run.scopeSha || !run.scopeConfirmedAt)
        throw new ResearchAutomationStateError('Finish the original report before requesting another version.');
      const versions = await this.listReportVersions(workspaceId, runId);
      const previous = versions.at(-1)!;
      if (previous.pairId !== input.previousPairId)
        throw new ResearchAutomationConflictError('revision_conflict', 'The selected report version is no longer current.');
      if (this.#db.prepare(`SELECT 1 FROM analysis_research_automation_attempts WHERE run_id=? AND state IN ('QUEUED','RUNNING')`).get(runId))
        throw new ResearchAutomationConflictError('invalid_state', 'Another report revision is pending.');
      for (const output of previous.outputs) await this.readReport(workspaceId, runId, output.kind, false, previous.pairId);
      if ('acceptedMetric' in input) await this.#classifiedMetric.project(workspaceId, runId, previous.pairId, input.acceptedMetric, true);
      if ('acceptedInsight' in input) await this.#insightCoding.reportSnapshot(workspaceId, runId, previous.pairId, input.acceptedInsight, true);
      if ('draftInsight' in input) await this.#insightCoding.reportDraftSnapshot(workspaceId, runId, previous.pairId, input.draftInsight, true);
      if ('boundedMethods' in input) await this.#loadBoundedMethods(run, input);
      if ('quoteMethods' in input) await this.#loadQuoteMethods(run, input);
      const start = await this.#readStartSnapshot(run.startSha, workspaceId);
      const scope = await this.#readScopeSnapshot(run.scopeSha, workspaceId, runId);
      const bound = { runId, start, scope, scopeConfirmedAt: run.scopeConfirmedAt };
      const priorAttempt = previous.attemptId ? this.#attempt(previous.attemptId)! : undefined;
      const priorSources = priorAttempt ? await this.#readAttemptSources(run, priorAttempt) : await this.#readFrozenSources(run);
      let metric: AutomationConfirmedSourceSet['metric'];
      if (input.sources.metric.decision === 'USE_PREPARED')
        metric = { decision: 'ADMITTED', sourcePackage: await this.#metricMethods.inspectPrepared(bound, input.sources.metric.packageId) };
      else if (input.sources.metric.decision === 'SKIP') metric = { decision: 'SKIPPED' };
      else if (priorSources) metric = priorSources.value.metric;
      else {
        const originalOutput = this.#output(runId, 'MARKET');
        const semantic = originalOutput ? await this.#readJson<Record<string, unknown>>(originalOutput.versionSha, MAX_JSON_ARTIFACT_BYTES, 'application/json') : undefined;
        metric = semantic && isRecord(semantic.metricMethods) ? { decision: 'ADMITTED', sourcePackage: (semantic.metricMethods as unknown as AutomationMetricMethodSnapshot).originalSourcePackage } : { decision: 'ABSENT' };
      }
      let nativeReference: NativeSourceReviewReference | undefined;
      let nativeReview: AutomationConfirmedSourceSet['nativeReview'];
      if (input.sources.nativeReview.decision === 'SKIP') nativeReview = { decision: 'SKIPPED' };
      else {
        nativeReference = input.sources.nativeReview.decision === 'USE_PACKAGE'
          ? await this.#nativeReviews.resolvePackage(bound, input.sources.nativeReview.packageId)
          : priorSources ? priorSources.nativeReference : (await this.#stepDocument(runId, 'COLLECTION'))?.nativeReview;
        if (nativeReference) {
          await this.#nativeReviews.readReference(nativeReference, bound);
          nativeReview = { decision: 'RESOLVED', referenceSha256: digest(nativeReference) };
        } else nativeReview = priorSources?.value.nativeReview ?? { decision: 'NONE' };
      }
      const attemptId = randomUUID();
      const sources: AutomationConfirmedSourceSet = { contractVersion: 'automation-confirmed-source-set-v1', runId, workspaceId,
        executionId: attemptId, startSha256: run.startSha, scopeSha256: run.scopeSha, requestSha256: requestSha,
        confirmedAt: run.scopeConfirmedAt, metric, nativeReview };
      await this.#verifySourceDocument(run, sources, nativeReference);
      const at = this.#now().toISOString();
      const requestArtifact = await this.#putJson(input, at);
      const sourceArtifact = await this.#putJson(sources, at);
      const referenceArtifact = nativeReference ? await this.#putJson(nativeReference, at) : undefined;
      this.#db.transaction(() => {
        const currentPair = this.#db.prepare(`SELECT pair_sha256 pairId FROM analysis_research_automation_attempts WHERE run_id=? AND state='COMMITTED' ORDER BY version_number DESC LIMIT 1`).get(runId) as { pairId: string } | undefined;
        if ((currentPair?.pairId ?? this.#originalPair(run)?.pairId) !== previous.pairId)
          throw new ResearchAutomationConflictError('revision_conflict', 'The report predecessor changed during admission.');
        this.#registerManifest(requestArtifact, 'application/json', at);
        this.#registerManifest(sourceArtifact, 'application/json', at);
        if (referenceArtifact) this.#registerManifest(referenceArtifact, 'application/json', at);
        const number = this.#db.prepare(`SELECT coalesce(max(attempt_number),0)+1 number FROM analysis_research_automation_attempts WHERE run_id=?`).get(runId) as { number: number | bigint };
        this.#db.prepare(`INSERT INTO analysis_research_automation_attempts(attempt_id,run_id,attempt_number,previous_pair_sha256,request_sha256,source_set_sha256,state,created_at) VALUES (?,?,?,?,?,?,'QUEUED',?)`)
          .run(attemptId, runId, number.number, previous.pairId, requestArtifact.sha256, sourceArtifact.sha256, at);
        this.#db.prepare(`INSERT INTO analysis_research_automation_attempt_requests(request_key,attempt_id,request_kind,request_sha256,accepted_at) VALUES (?,?,'CREATE',?,?)`)
          .run(input.requestKey, attemptId, requestSha, at);
      }).immediate();
      return revisionReceipt(this.#attempt(attemptId)!, false);
    });
  }

  async cancelReportRevision(workspaceId: string, runId: string, attemptId: string, requestKey: string): Promise<ResearchAutomationRevisionReceipt> {
    if (!UUID.test(attemptId) || !REQUEST_KEY.test(requestKey)) throw new ResearchAutomationValidationError('Revision cancellation identity is invalid.');
    const sha = digest({ contractVersion: 'automation-report-revision-cancel-v1', runId, attemptId, requestKey });
    const receipt = await withDatabaseMutationMutex(this.#db, async () => {
      await this.getRun(workspaceId, runId);
      const attempt = this.#attempt(attemptId);
      if (!attempt || attempt.runId !== runId) throw new ResearchAutomationNotFoundError('report_not_available', 'Report revision not found.');
      await this.#readAttemptSources(this.#current(runId)!, attempt);
      const prior = this.#attemptRequest(requestKey);
      if (prior) {
        if (prior.kind !== 'CANCEL' || prior.attemptId !== attemptId || prior.sha !== sha)
          throw new ResearchAutomationConflictError('request_key_conflict', 'This request key is bound to another operation.');
        return revisionReceipt(attempt, true);
      }
      if (attempt.state !== 'QUEUED' && attempt.state !== 'RUNNING')
        throw new ResearchAutomationConflictError('invalid_state', 'The report revision has already settled.');
      const at = this.#now().toISOString();
      this.#db.transaction(() => {
        const changed = this.#db.prepare(`UPDATE analysis_research_automation_attempts SET state='CANCELLED',finished_at=? WHERE attempt_id=? AND state IN ('QUEUED','RUNNING')`).run(at, attemptId);
        if (changed.changes !== 1) throw new ResearchAutomationConflictError('invalid_state', 'The report revision has already settled.');
        this.#db.prepare(`INSERT INTO analysis_research_automation_attempt_requests(request_key,attempt_id,request_kind,request_sha256,accepted_at) VALUES (?,?,'CANCEL',?,?)`).run(requestKey, attemptId, sha, at);
      }).immediate();
      return revisionReceipt(this.#attempt(attemptId)!, false);
    });
    this.#active.get(attemptId)?.abort();
    return receipt;
  }

  async readReport(workspaceId: string, runId: string, kind: 'MARKET' | 'INSIGHT', pdf = false, pairId?: string): Promise<ResearchAutomationReadReport> {
    return (await this.#readVerifiedReport(workspaceId, runId, kind, pdf, pairId)).report;
  }

  /** Read-only literal source of one explicit Insight pair; no provider, parser, inference or collection. */
  async readInsightSourceContext(workspaceId: string, runId: string, pairId: string): Promise<InsightSourceContext> {
    if (!/^[0-9a-f]{64}$/.test(pairId)) throw new ResearchAutomationValidationError('Invalid exact report pair.');
    // The owning report reader verifies pair membership, fallback artifacts and KEEP method lineage.
    const { report, scopeSha256, verifiedLocated, verifiedNative } = await this.#readVerifiedReport(workspaceId, runId, 'INSIGHT', false, pairId);
    if (!scopeSha256) throw new ResearchAutomationIntegrityError('Insight source context lacks its frozen scope.');
    if (verifiedNative && verifiedLocated) throw new ResearchAutomationIntegrityError('Insight source context has more than one review source.');
    // A v1 located snapshot is a rule proposal only, never accepted literal context.
    const located = verifiedLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? verifiedLocated : undefined;
    const snapshot = verifiedNative ?? located;
    if (!snapshot) throw new ResearchAutomationConflictError('invalid_state', 'This exact report has no verified adopted review source.');
    const input = structuredClone(snapshot.output.input);
    return { binding: { workspaceId, runId, pairId, scopeSha256, reportSha256: report.versionId,
      sourceKind: verifiedNative ? 'NATIVE' as const : 'EXACT_SHOPEE' as const,
      sourcePackageSha256: digest(snapshot.sourcePackage), inputSha256: digest(input) }, input };
  }

  adoptInsightCodingRules(workspaceId: string, runId: string, value: unknown, owner: { actorId: string; role: 'OWNER' }) {
    return this.#insightCoding.adopt(workspaceId, runId, value, owner);
  }
  proposeInsightCoding(workspaceId: string, runId: string, value: unknown, owner: { actorId: string; role: 'OWNER' }) {
    return this.#insightCoding.propose(workspaceId, runId, value, owner);
  }
  proposeLiteralInsightCoding(workspaceId: string, runId: string, value: unknown, owner: { actorId: string; role: 'OWNER' }) {
    return this.#insightCoding.proposeLiteral(workspaceId, runId, value, owner);
  }
  proposeModelInsightCoding(workspaceId: string, runId: string, value: unknown, owner: { actorId: string; role: 'OWNER' },
    ai: import('./insight-model-execution.js').InsightModelAI, signal?: AbortSignal) {
    return this.#insightCoding.proposeModel(workspaceId, runId, value, owner, ai, signal);
  }
  acceptInsightCoding(workspaceId: string, runId: string, value: unknown, owner: { actorId: string; role: 'OWNER' }) {
    return this.#insightCoding.accept(workspaceId, runId, value, owner);
  }
  /** Verified query-only history of one explicit pair; it does not assert that the pair is current. */
  readInsightCoding(workspaceId: string, runId: string, pairId: string) {
    return this.#insightCoding.view(workspaceId, runId, pairId);
  }
  readInsightCodingEvidence(workspaceId: string, runId: string, evidenceId: string) {
    return this.#insightCoding.read(evidenceId, workspaceId, runId);
  }
  resolveInsightCoding(workspaceId: string, runId: string, proposalId: string, receiptIds: readonly string[]) {
    return this.#insightCoding.resolve(workspaceId, runId, proposalId, receiptIds);
  }

  async #readVerifiedReport(workspaceId: string, runId: string, kind: 'MARKET' | 'INSIGHT', pdf: boolean, pairId: string | undefined): Promise<{
    report: ResearchAutomationReadReport; scopeSha256: string | null;
    verifiedLocated: AutomationLocatedReviewSnapshot | undefined; verifiedNative: NativeSourceReviewSnapshot | undefined;
  }> {
    const run = await this.getRun(workspaceId, runId);
    const frozenRun = this.#current(runId)!;
    const selectedPair = pairId ? (await this.listReportVersions(workspaceId, runId)).find(item => item.pairId === pairId) : undefined;
    if (pairId && !selectedPair) throw new ResearchAutomationNotFoundError('report_not_available', 'Report version not found.');
    const attempt = selectedPair?.attemptId ? this.#attempt(selectedPair.attemptId) : undefined;
    const output = attempt ? this.#attemptOutputs(attempt.attemptId).find(item => item.reportKind === kind) : this.#output(runId, kind);
    if (!output) throw new ResearchAutomationNotFoundError(pdf ? 'pdf_not_available' : 'report_not_available', pdf ? 'PDF is not available for this run.' : 'Report is not available for this run.');
    if (pdf && !output.pdfSha) throw new ResearchAutomationNotFoundError('pdf_not_available', 'PDF is not available for this run.');
    // Verify the immutable semantic version before serving either representation;
    // the output row must point at a canonical report for this exact run/kind.
    const semantic = await this.#readJson<Record<string, unknown>>(output.versionSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (semantic.contractVersion !== 'research-automation-report-v1' || semantic.runId !== runId || semantic.workspaceId !== workspaceId || semantic.kind !== kind) {
      throw new ResearchAutomationIntegrityError('Stored report semantic artifact has inconsistent identity.');
    }
    const sources = attempt ? await this.#readAttemptSources(frozenRun, attempt) : await this.#readFrozenSources(frozenRun);
    const metricSources = attempt ? await this.#methodSources(frozenRun, attempt, 'metric') : sources;
    const nativeExecution = attempt ? (await this.#methodSources(frozenRun, attempt, 'nativeReview'))?.value.executionId : undefined;
    if (attempt ? semantic.reportAttemptId !== attempt.attemptId || semantic.previousPairId !== attempt.previousPairId : semantic.reportAttemptId !== undefined || semantic.previousPairId !== undefined)
      throw new ResearchAutomationIntegrityError('Stored report revision identity differs.');
    if (sources ? semantic.confirmedSourceSetSha256 !== sources.sha256 : semantic.confirmedSourceSetSha256 !== undefined)
      throw new ResearchAutomationIntegrityError('Stored report has inconsistent confirmed source membership.');
    if (semantic.descriptiveMethods !== undefined && semantic.descriptiveMethods !== null) {
      const frozen = this.#current(runId);
      if (!frozen?.scopeSha) throw new ResearchAutomationIntegrityError('Stored method output lacks its frozen scope.');
      await this.#methods.verify(semantic.descriptiveMethods, {
        runId,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId),
        scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId),
        collection: await this.#stepDocument(runId, 'COLLECTION'),
        captures: await this.#captureRecords(runId),
      });
    }
    if (semantic.reviewCorpus !== undefined && semantic.reviewCorpus !== null) {
      const frozen = this.#current(runId);
      const collection = await this.#reportCollection(runId, sources, Boolean(attempt));
      if (kind !== 'INSIGHT' || !frozen?.scopeSha || !frozen.scopeConfirmedAt || !collection?.exactShopee) throw new ResearchAutomationIntegrityError('Stored corpus lacks exact run lineage.');
      await this.#shopee.verifyCorpus(semantic.reviewCorpus, collection.exactShopee, { runId,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId), scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId), scopeConfirmedAt: frozen.scopeConfirmedAt });
    }
    let verifiedLocated: AutomationLocatedReviewSnapshot | undefined;
    let verifiedNative: NativeSourceReviewSnapshot | undefined;
    if ((semantic.locatedReview !== undefined && semantic.locatedReview !== null) || semantic.locatedReviewFallback) {
      const frozen = this.#current(runId);
      const collection = await this.#reportCollection(runId, sources, Boolean(attempt));
      if (kind !== 'INSIGHT' || (!semantic.reviewCorpus && !semantic.locatedReviewFallback) || !frozen?.scopeSha || !frozen.scopeConfirmedAt || !collection?.exactShopee)
        throw new ResearchAutomationIntegrityError('Stored located review lacks its verified source and frozen run.');
      const input = { runId, reference: collection.exactShopee,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId), scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId),
        scopeConfirmedAt: frozen.scopeConfirmedAt };
      if (semantic.locatedReviewFallback) {
        if (semantic.locatedReview || semantic.reviewCorpus || !isRecord(semantic.locatedReviewFallback) ||
            Object.keys(semantic.locatedReviewFallback).join(',') !== 'sourcePackage' || !isRecord(semantic.locatedReviewFallback.sourcePackage) ||
            semantic.reviewCorpusFailure !== 'REVIEW_CORPUS_REPORT_TOO_LARGE') throw new ResearchAutomationIntegrityError('Stored located fallback identity is invalid.');
        verifiedLocated = await this.#locatedReviews.readSnapshot(semantic.locatedReviewFallback.sourcePackage as Extract<AutomationLocatedReviewSnapshot, { contractVersion: 'automation-located-review-snapshot-v2' }>['sourcePackage'], input);
      } else verifiedLocated = await this.#locatedReviews.verify(semantic.locatedReview, input);
    }
    if ((semantic.nativeReview !== undefined && semantic.nativeReview !== null) || semantic.nativeReviewFallback) {
      const frozen = this.#current(runId);
      const collection = await this.#reportCollection(runId, sources, Boolean(attempt));
      if (kind !== 'INSIGHT' || semantic.reviewCorpus || semantic.locatedReview || !frozen?.scopeSha ||
          !frozen.scopeConfirmedAt || !collection?.nativeReview || collection.exactShopee)
        throw new ResearchAutomationIntegrityError('Stored native review lacks its distinct source and frozen run.');
      const input = { runId,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId),
        scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId), scopeConfirmedAt: frozen.scopeConfirmedAt,
        ...(nativeExecution ? { executionId: nativeExecution } : {}) };
      if (semantic.nativeReviewFallback) {
        if (semantic.nativeReview || !isRecord(semantic.nativeReviewFallback) || !isRecord(semantic.nativeReviewFallback.sourcePackage) ||
            semantic.nativeReviewFailure !== 'NATIVE_REVIEW_REPORT_TOO_LARGE')
          throw new ResearchAutomationIntegrityError('Stored native fallback identity is invalid.');
        verifiedNative = await this.#nativeReviews.readSnapshot(semantic.nativeReviewFallback.sourcePackage as NativeSourceReviewSnapshot['sourcePackage'], collection.nativeReview, input);
      } else {
        await this.#nativeReviews.verify(semantic.nativeReview, collection.nativeReview, input);
        verifiedNative = semantic.nativeReview as NativeSourceReviewSnapshot;
      }
    }
    if (semantic.marketInventory !== undefined && semantic.marketInventory !== null) {
      const frozen = this.#current(runId);
      if (kind !== 'MARKET' || !frozen?.scopeSha) throw new ResearchAutomationIntegrityError('Stored Market inventory lacks scope.');
      await this.#marketInventory.verify(semantic.marketInventory, { runId, start: await this.#readStartSnapshot(frozen.startSha, workspaceId),
        scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId), collection: await this.#stepDocument(runId, 'COLLECTION'), captures: await this.#captureRecords(runId) });
    }
    if (semantic.metricMethods !== undefined && semantic.metricMethods !== null) {
      const frozen = this.#current(runId);
      if (kind !== 'MARKET' || !frozen?.scopeSha || !frozen.scopeConfirmedAt)
        throw new ResearchAutomationIntegrityError('Stored Metric methods lack their exact confirmed run.');
      await this.#metricMethods.verify(semantic.metricMethods, { runId,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId),
        scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId), scopeConfirmedAt: frozen.scopeConfirmedAt,
        ...(metricSources ? { sourceSelection: metricSelection(metricSources.value) } : {}) });
    }
    const classifiedRequest = attempt ? await this.#classifiedRequest(frozenRun, attempt) : undefined;
    if (kind === 'MARKET' && classifiedRequest) {
      if (!semantic.metricMethods) throw new ResearchAutomationIntegrityError('Classified Metric result lacks its source preparation.');
      const proof = await this.#classifiedMetric.verify(semantic.metricClassified, workspaceId, runId, classifiedRequest.previousPairId, classifiedRequest.acceptedMetric);
      const classified = semantic.metricClassified as AutomationClassifiedMetricSnapshot;
      const metric = semantic.metricMethods as AutomationMetricMethodSnapshot;
      if (classified.binding.preparationSha256 !== metric.preparation.preparationSha256 ||
          classified.binding.sourcePackageId !== metric.originalSourcePackage.packageId ||
          !(await this.#readArtifact(classified.proofSha256, MAX_JSON_ARTIFACT_BYTES, 'application/json')).equals(proof))
        throw new ResearchAutomationIntegrityError('Classified Metric proof differs from its frozen preparation.');
    } else if (semantic.metricClassified !== undefined && semantic.metricClassified !== null) {
      throw new ResearchAutomationIntegrityError('Classified Metric snapshot lacks an explicit revision request.');
    }
    const insightRequest = attempt ? await this.#insightCodingRequest(frozenRun, attempt) : undefined;
    if (kind === 'INSIGHT' && insightRequest) {
      const snapshot = 'draftInsight' in insightRequest
        ? await this.#insightCoding.verifyReportDraftSnapshot(semantic.insightCoding, workspaceId, runId, insightRequest.previousPairId, insightRequest.draftInsight)
        : await this.#insightCoding.verifyReportSnapshot(semantic.insightCoding, workspaceId, runId, insightRequest.previousPairId, insightRequest.acceptedInsight);
      const source = verifiedNative ?? (verifiedLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? verifiedLocated : undefined);
      if (!source || snapshot.binding.scopeSha256 !== frozenRun.scopeSha || snapshot.binding.inputSha256 !== digest(source.output.input) ||
          snapshot.binding.sourcePackageSha256 !== digest(source.sourcePackage))
        throw new ResearchAutomationIntegrityError('Insight coding snapshot differs from the retained source.');
    } else if (semantic.insightCoding !== undefined && semantic.insightCoding !== null) {
      throw new ResearchAutomationIntegrityError('Insight coding snapshot lacks an explicit revision request.');
    }
    const boundedRequest = attempt ? await this.#boundedRequest(frozenRun, attempt) : undefined;
    if (boundedRequest && boundedRequest.boundedMethods.decision === 'USE_PACKAGE') {
      try {
        await this.#verifySupplementalOrigin(frozenRun, boundedRequest.boundedMethods, 'BOUNDED');
        await verifyAutomationBoundedMethods(semantic.boundedMethods, this.#boundedBinding(frozenRun, boundedRequest),
          boundedRequest.boundedMethods, this.#boundedSourceReader());
      } catch { throw new ResearchAutomationIntegrityError('Bounded method snapshot failed source replay.'); }
    } else if (semantic.boundedMethods !== undefined && semantic.boundedMethods !== null) {
      throw new ResearchAutomationIntegrityError('Bounded method snapshot lacks its explicit source selection.');
    }
    const quoteRequest = kind === 'MARKET' && attempt ? await this.#quoteRequest(frozenRun, attempt) : undefined;
    if (quoteRequest && quoteRequest.quoteMethods.decision === 'USE_PACKAGE') {
      try {
        await this.#verifySupplementalOrigin(frozenRun, quoteRequest.quoteMethods, 'QUOTE');
        await verifyAutomationQuoteMethods(semantic.quoteMethods, this.#boundedBinding(frozenRun, quoteRequest),
          quoteRequest.quoteMethods, this.#boundedSourceReader());
      } catch { throw new ResearchAutomationIntegrityError('Quote method snapshot failed source replay.'); }
    } else if (semantic.quoteMethods !== undefined && semantic.quoteMethods !== null) {
      throw new ResearchAutomationIntegrityError('Quote method snapshot lacks its explicit Market source selection.');
    }
    if (semantic.m01InventoryArtifact !== undefined && (kind !== 'MARKET' || semantic.sourceClaimsArtifact === undefined))
      throw new ResearchAutomationIntegrityError('Stored M01 inventory lacks its owning Market claims.');
    if (semantic.i14AdmissionArtifact !== undefined && (kind !== 'INSIGHT' || semantic.sourceClaimsArtifact === undefined))
      throw new ResearchAutomationIntegrityError('Stored I14 admission lacks its owning Insight claims.');
    if (semantic.i14ExecutionId !== undefined && (semantic.i14AdmissionArtifact === undefined || typeof semantic.i14ExecutionId !== 'string' || !UUID.test(semantic.i14ExecutionId)))
      throw new ResearchAutomationIntegrityError('Stored I14 execution lacks its owning admission.');
    if (semantic.sourceClaimsArtifact !== undefined) {
      if (!frozenRun.scopeSha) throw new ResearchAutomationIntegrityError('Stored source claims lack their frozen scope.');
      // Reconstruct only after the owning bridges verified the exact saved sources.
      const expected = buildAutomationSourceClaims({ run: { runId, workspaceId },
        scope: await this.#readScopeSnapshot(frozenRun.scopeSha, workspaceId, runId),
        ...(kind === 'MARKET' && semantic.descriptiveMethods ? { descriptive: { output: semantic.descriptiveMethods as DescriptiveMarketMethods } } : {}),
        ...(kind === 'INSIGHT' && verifiedLocated?.contractVersion === 'automation-located-review-snapshot-v2'
          ? { located: { snapshot: verifiedLocated } } : {}),
        ...(kind === 'INSIGHT' && verifiedNative ? { native: { snapshot: verifiedNative } } : {}) });
      const reference = validateAutomationSourceClaimsReference(semantic.sourceClaimsArtifact);
      const savedClaims = await this.#readArtifact(reference.sha256, MAX_SOURCE_CLAIMS_BYTES, 'application/json');
      if (savedClaims.length !== reference.byteSize || !savedClaims.equals(expected.bytes))
        throw new ResearchAutomationIntegrityError('Stored source claims differ from the verified method snapshots.');
      if (semantic.m01InventoryArtifact !== undefined) {
        if (!validateM01Reference(semantic.m01InventoryArtifact))
          throw new ResearchAutomationIntegrityError('Stored M01 inventory reference is invalid.');
        const m01Reference = semantic.m01InventoryArtifact;
        const savedM01 = await this.#readArtifact(m01Reference.sha256, MAX_M01_EVIDENCE_INVENTORY_BYTES, 'application/json');
        // The saved method version selects the replay semantics; historical 1.0.0 inventories stay byte-identical.
        const expectedM01 = buildAutomationM01EvidenceInventory({ run: { runId, workspaceId },
          scope: await this.#readScopeSnapshot(frozenRun.scopeSha, workspaceId, runId),
          inventoryVersion: automationM01InventoryVersion(JSON.parse(savedM01.toString('utf8'))),
          sourceClaims: expected.artifact, claimsSha256: expected.artifact.claimsSha256 });
        if (savedM01.length !== m01Reference.byteSize || !savedM01.equals(expectedM01.bytes))
          throw new ResearchAutomationIntegrityError('Stored M01 inventory differs from its exact upstream claims.');
      }
      if (semantic.i14AdmissionArtifact !== undefined) {
        if (!validateI14Reference(semantic.i14AdmissionArtifact))
          throw new ResearchAutomationIntegrityError('Stored I14 admission reference is invalid.');
        const i14Reference = semantic.i14AdmissionArtifact;
        const savedI14 = await this.#readArtifact(i14Reference.sha256, MAX_I14_EVIDENCE_ADMISSION_BYTES, 'application/json');
        const admissionInput = { run: { runId, workspaceId },
          admissionVersion: automationI14AdmissionVersion(JSON.parse(savedI14.toString('utf8'))),
          literalSnapshot: verifiedNative ?? (verifiedLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? verifiedLocated : null),
          scope: await this.#readScopeSnapshot(frozenRun.scopeSha, workspaceId, runId),
          sourceClaims: expected.artifact, claimsSha256: expected.artifact.claimsSha256,
          locatedMethodOutput: verifiedNative?.output ??
            (verifiedLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? verifiedLocated.output : null) };
        const expectedI14 = buildAutomationI14EvidenceAdmission(admissionInput);
        if (savedI14.length !== i14Reference.byteSize || !savedI14.equals(expectedI14.bytes))
          throw new ResearchAutomationIntegrityError('Stored I14 admission differs from its exact upstream claims and context.');
        if (semantic.i14ExecutionId !== undefined) {
          const retained = await this.#i14Executions.read(await this.#i14Parent(frozenRun, attempt), admissionInput);
          if (!['VALID', 'INVALID', 'DISPATCH_UNKNOWN'].includes(retained.status) || !('executionId' in retained) || retained.executionId !== semantic.i14ExecutionId)
            throw new ResearchAutomationIntegrityError('Stored I14 execution is not the exact settled report dependency.');
        }
      }
    }
    if (semantic.decisionPackets !== undefined) {
      const sectionIds = kind === 'MARKET' ? ['M11', 'M12'] as const : ['I15'] as const;
      if (!Array.isArray(semantic.decisionPackets) || semantic.decisionPackets.length !== sectionIds.length ||
          !frozenRun.scopeSha || semantic.sourceClaimsArtifact === undefined)
        throw new ResearchAutomationIntegrityError('Stored decision packets lack their exact source owner.');
      let decisionLocated = verifiedLocated;
      let decisionNative = verifiedNative;
      const pairedVersion = semantic.decisionPairedInsightVersionId;
      if (kind === 'INSIGHT' ? pairedVersion !== null : pairedVersion !== null &&
          (typeof pairedVersion !== 'string' || !/^[0-9a-f]{64}$/.test(pairedVersion)))
        throw new ResearchAutomationIntegrityError('Stored decision packet pair identity is invalid.');
      const siblingOutput = kind === 'MARKET'
        ? attempt ? this.#attemptOutputs(attempt.attemptId).find(item => item.reportKind === 'INSIGHT') : this.#output(runId, 'INSIGHT')
        : undefined;
      if (kind === 'MARKET' && pairedVersion !== (siblingOutput?.versionSha ?? null))
        throw new ResearchAutomationIntegrityError('Stored decision packet does not bind the exact sibling version.');
      if (kind === 'MARKET' && pairedVersion !== null) {
        // Read the sibling in this exact pair, never the latest Insight. Insight
        // cannot point back to Market, so this dependency has no recursion cycle.
        const sibling = await this.#readVerifiedReport(workspaceId, runId, 'INSIGHT', false, pairId);
        if (sibling.report.versionId !== pairedVersion)
          throw new ResearchAutomationIntegrityError('Stored decision packet differs from its paired Insight.');
        decisionLocated = sibling.verifiedLocated;
        decisionNative = sibling.verifiedNative;
      }
      const decisionScope = await this.#readScopeSnapshot(frozenRun.scopeSha, workspaceId, runId);
      const rebuilt = buildAutomationSourceClaims({ run: { runId, workspaceId }, scope: decisionScope,
        ...(kind === 'MARKET' && semantic.descriptiveMethods ? { descriptive: { output: semantic.descriptiveMethods as DescriptiveMarketMethods } } : {}),
        ...(decisionLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? { located: { snapshot: decisionLocated } } : {}),
        ...(decisionNative ? { native: { snapshot: decisionNative } } : {}) });
      const executionIds = semantic.decisionExecutionIds;
      if (executionIds !== undefined && (!isRecord(executionIds) || Object.entries(executionIds).some(([id, value]) =>
          !sectionIds.some(sectionId => sectionId === id) || typeof value !== 'string')))
        throw new ResearchAutomationIntegrityError('Stored decision execution references are invalid.');
      try {
        for (const [index, sectionId] of sectionIds.entries()) {
          const packet = semantic.decisionPackets[index];
          if (!isRecord(packet) || !isRecord(packet.useContextAdmission)) throw new Error('missing packet admission');
          const admissionVersion = packet.useContextAdmission.methodVersion;
          if (admissionVersion !== '1.0.0' && admissionVersion !== '1.1.0') throw new Error('unknown packet admission');
          if (!['1.0.0', '1.1.0', '1.2.0'].includes(packet.methodVersion as string)) throw new Error('unknown decision packet version');
          const source: AutomationDecisionPacketInput = { sectionId, packetVersion: packet.methodVersion, evidence: {
            run: { runId, workspaceId }, scope: decisionScope, admissionVersion,
            sourceClaims: rebuilt.artifact, claimsSha256: rebuilt.artifact.claimsSha256,
            literalSnapshot: decisionNative ?? (decisionLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? decisionLocated : null),
            locatedMethodOutput: decisionNative?.output ?? (decisionLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? decisionLocated.output : null),
          } };
          verifyAutomationDecisionPacket(packet, source);
          if (isRecord(executionIds) && executionIds[sectionId] !== undefined) {
            const retained = await this.#decisionExecutions[sectionId].read(await this.#i14Parent(frozenRun, attempt), source);
            if (!['VALID', 'INVALID', 'DISPATCH_UNKNOWN'].includes(retained.status) || !('executionId' in retained) ||
                retained.executionId !== executionIds[sectionId])
              throw new ResearchAutomationIntegrityError('Stored decision execution is not the exact settled report dependency.');
          }
        }
      } catch { throw new ResearchAutomationIntegrityError('Stored decision packet failed exact source replay.'); }
    } else if (semantic.decisionPairedInsightVersionId !== undefined || semantic.decisionExecutionIds !== undefined) {
      throw new ResearchAutomationIntegrityError('Stored decision dependency lacks packets.');
    }
    const sha = pdf ? output.pdfSha! : output.htmlSha;
    const bytes = await this.#readArtifact(sha, pdf ? 64 * 1024 * 1024 : MAX_HTML_BYTES, pdf ? 'application/pdf' : 'text/html; charset=utf-8');
    if (pdf && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ResearchAutomationIntegrityError('Stored PDF has an invalid header.');
    return { report: { kind, versionId: output.versionSha, bytes, mediaType: pdf ? 'application/pdf' : 'text/html; charset=utf-8' },
      scopeSha256: frozenRun.scopeSha, verifiedLocated, verifiedNative };
  }

  /** Worker entry point: claims and settles at most one durable step. */
  async processNext(signal?: AbortSignal): Promise<boolean> {
    const row = this.#db.prepare(`SELECT run_id runId,workspace_id workspaceId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,
      start_request_sha256 startSha,scope_request_sha256 scopeSha,scope_confirmed_at scopeConfirmedAt,confirmed_source_set_sha256 sourceSetSha,actor_id actorId,created_at createdAt,updated_at updatedAt
      FROM analysis_research_automation_runs WHERE status IN ('QUICK_SEARCH_QUEUED','COLLECTION_QUEUED','RENDERING') ORDER BY created_at,run_id LIMIT 1`).get() as RunRow | undefined;
    if (!row) {
      const queued = this.#db.prepare(`SELECT attempt_id attemptId FROM analysis_research_automation_attempts WHERE state='QUEUED' ORDER BY created_at,attempt_id LIMIT 1`).get() as { attemptId: string } | undefined;
      if (!queued) return false;
      const attempt = this.#attempt(queued.attemptId)!;
      const parent = this.#current(attempt.runId);
      if (!parent) throw new ResearchAutomationIntegrityError('Revision source run is missing.');
      return this.#executeReports(parent, signal, attempt);
    }
    if (row.status === 'QUICK_SEARCH_QUEUED') return this.#executeQuick(row, signal);
    if (row.status === 'COLLECTION_QUEUED') return this.#executeCollection(row, signal);
    return this.#executeReports(row, signal);
  }

  /** On executor start, paid provider operations are interrupted, never retried. */
  async recoverOnStart(): Promise<void> {
    await withDatabaseMutationMutex(this.#db, async () => {
      const rows = this.#db.prepare(`SELECT run_id runId,revision,status FROM analysis_research_automation_runs WHERE status IN ('QUICK_SEARCH_RUNNING','COLLECTING','CANCELLING','RENDERING')`).all() as Array<{ runId: string; revision: bigint | number; status: ResearchAutomationRun['status'] }>;
      const at = this.#now().toISOString();
      this.#db.transaction(() => {
        this.#i14Executions.recoverInterruptedDispatches();
        this.#db.prepare(`UPDATE analysis_research_automation_attempts SET state='QUEUED',started_at=NULL WHERE state='RUNNING'`).run();
        for (const row of rows) {
          if (row.status === 'RENDERING') {
            this.#transition(row.runId, toNumber(row.revision), 'RENDERING', at);
            this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED',message_code=NULL,started_at=NULL,finished_at=NULL WHERE run_id=? AND step_id='REPORTS' AND state='RUNNING'`).run(row.runId);
          } else {
            this.#transition(row.runId, toNumber(row.revision), 'INTERRUPTED', at);
            this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='INTERRUPTED',message_code='INTERRUPTED_DURING_PROVIDER_OPERATION',finished_at=? WHERE run_id=? AND state IN ('RUNNING','QUEUED')`).run(at, row.runId);
            this.#skipPendingSteps(row.runId, at);
          }
        }
      })();
    });
  }

  /** Stop active provider calls and settle their run as interrupted before DB close. */
  async interruptActive(): Promise<void> {
    const active = [...this.#active.keys()];
    const at = this.#now().toISOString();
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.transaction(() => {
        for (const runId of active) {
          if (this.#attempt(runId)) {
            this.#db.prepare(`UPDATE analysis_research_automation_attempts SET state='QUEUED',started_at=NULL WHERE attempt_id=? AND state='RUNNING'`).run(runId);
            continue;
          }
          const row = this.#db.prepare('SELECT revision,status FROM analysis_research_automation_runs WHERE run_id=?').get(runId) as { revision: bigint | number; status: ResearchAutomationRun['status'] } | undefined;
          if (!row || TERMINAL_STATUSES.has(row.status)) continue;
          this.#transition(runId, toNumber(row.revision), 'INTERRUPTED', at);
          this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='INTERRUPTED',message_code='OPERATOR_STOPPED',finished_at=? WHERE run_id=? AND state IN ('RUNNING','QUEUED')`).run(at, runId);
          this.#skipPendingSteps(runId, at);
        }
      })();
    });
    for (const controller of this.#active.values()) controller.abort();
  }

  #executeQuick(row: RunRow, externalSignal?: AbortSignal): Promise<boolean> {
    return this.#executeSource(row, 'QUICK_SEARCH', externalSignal);
  }
  #executeCollection(row: RunRow, externalSignal?: AbortSignal): Promise<boolean> {
    return this.#executeSource(row, 'COLLECTION', externalSignal);
  }

  async #executeSource(row: RunRow, stepId: SourceStepId, externalSignal?: AbortSignal): Promise<boolean> {
    const controller = new AbortController();
    this.#active.set(row.runId, controller);
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    try {
      const source = this.#source;
      if (!source && stepId === 'QUICK_SEARCH') {
        if (!controller.signal.aborted) await this.#settleUnavailable(row, stepId);
        return true;
      }
      const start = await this.#readStartSnapshot(row.startSha, row.workspaceId);
      const scope = row.scopeSha ? await this.#readScopeSnapshot(row.scopeSha, row.workspaceId, row.runId) : null;
      if (controller.signal.aborted) return false;
      const expectedStatus = stepId === 'QUICK_SEARCH' ? 'QUICK_SEARCH_QUEUED' : 'COLLECTION_QUEUED';
      const beforeClaim = this.#current(row.runId);
      if (!beforeClaim || beforeClaim.status !== expectedStatus) return false;
      const at = this.#now().toISOString();
      let claimed = false;
      await withDatabaseMutationMutex(this.#db, async () => {
        if (controller.signal.aborted) return;
        const current = this.#current(row.runId);
        if (!current || current.status !== expectedStatus) return;
        this.#transition(row.runId, toNumber(current.revision), stepId === 'QUICK_SEARCH' ? 'QUICK_SEARCH_RUNNING' : 'COLLECTING', at);
        this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='RUNNING',started_at=?,message_code=NULL WHERE run_id=? AND step_id=?`).run(at, row.runId, stepId);
        claimed = true;
      });
      if (!claimed) return false;
      let sources: FrozenSources | undefined;
      if (stepId === 'COLLECTION') {
        try { sources = await this.#readFrozenSources(this.#current(row.runId)!); }
        catch {
          await this.#settleSourceFailure(row.runId, stepId, 'SOURCE_PACKAGE_RESOLUTION_FAILED', 'FAILED');
          return true;
        }
      }
      if (controller.signal.aborted) {
        await this.#settleSourceFailure(row.runId, stepId, 'CANCELLED_DURING_PROVIDER_OPERATION', 'CANCELLED');
        return true;
      }
      if (stepId === 'COLLECTION' && !scope?.selectedProductIds.length && !scope?.peerProductIds.length && !scope?.exactShopeeUrls?.length) {
        // An explicit "none" selection still yields a draft, but nothing was
        // requested, so the step must not read as a successful collection.
        // Paid web search also waits for confirmed products.
        await this.#settleSourceFailure(row.runId, stepId, 'NO_APPROVED_PRODUCT_REFS', 'SKIPPED');
        return true;
      }
      const input = stepId === 'QUICK_SEARCH'
        ? ({ runId: row.runId, mode: start.mode, keyword: start.keyword, description: start.description, requestedPeriod: start.requestedPeriod, country: 'VN', asOf: row.createdAt } satisfies QuickSearchInput)
        : ({ runId: row.runId, mode: start.mode, keyword: start.keyword, requestedPeriod: start.requestedPeriod, country: 'VN', selectedProductRefs: scope?.selectedProductIds ?? [], peerProductRefs: scope?.peerProductIds ?? [] } satisfies CollectInput);
      let result: PersistableSourceResult;
      try {
        const options: ProviderCallOptions = { signal: controller.signal };
        result = stepId === 'QUICK_SEARCH' ? await source!.quickSearch(input as QuickSearchInput, options)
          : source && (scope?.selectedProductIds.length || scope?.peerProductIds.length) ? await source.collect(input as CollectInput, options)
          : { result: null, step: { contractVersion: 'research-automation-step-result-v1', runId: row.runId, stepId,
            outcome: 'UNAVAILABLE', productCards: [], comparables: [], coverage: [], limitations: [] } };
      } catch {
        if (stepId !== 'COLLECTION' || (!scope?.exactShopeeUrls?.length && !this.#webSource) || controller.signal.aborted) {
          await this.#settleSourceFailure(row.runId, stepId, controller.signal.aborted ? 'CANCELLED_DURING_PROVIDER_OPERATION' : 'PROVIDER_FAILED', controller.signal.aborted ? 'CANCELLED' : 'FAILED');
          return true;
        }
        result = { result: null, unsettledProvider: source!.id.toLowerCase(), step: { ...invalidProviderStep(row.runId, stepId), limitations: [{ code: 'PROVIDER_FAILED', provider: source!.id.toLowerCase(), message: 'Lượt nguồn chưa có biên nhận hoàn tất. Số request và chi phí chưa đối soát; tổng request chỉ gồm các lượt đã ghi nhận.' }] } };
      }
      let exact: ExactShopeeAttempt | undefined;
      if (stepId === 'COLLECTION' && scope?.exactShopeeUrls?.length && !controller.signal.aborted) {
        const frozenInput = { runId: row.runId, start, scope, scopeConfirmedAt: row.scopeConfirmedAt! };
        let resolution: Awaited<ReturnType<AutomationNativeSourceReviewBridge['resolve']>> | undefined;
        try {
          resolution = sources ? sources.value.nativeReview.decision === 'RESOLVED'
            ? { state: 'RESOLVED', reference: sources.nativeReference! }
            : sources.value.nativeReview.decision === 'NONE' ? { state: 'NONE' } : undefined
            : await this.#nativeReviews.resolve(frozenInput);
        }
        catch {
          if (!controller.signal.aborted) result.step = nativeSourceBlocked(result.step, 'SOURCE_PACKAGE_RESOLUTION_FAILED');
        }
        if (resolution?.state === 'RESOLVED') {
          try {
            const retained = await this.#nativeReviews.readReference(resolution.reference, frozenInput);
            result.step = { ...result.step, outcome: 'PARTIAL', nativeReview: resolution.reference,
              coverage: [...result.step.coverage, { provider: 'apify-dami', dataset: 'retained-listing-review-subset', state: 'PARTIAL',
                observedStartDate: null, observedEndDate: null, truncated: false,
                note: `Đã gắn bản thu review có sẵn của đúng listing. Thời điểm thu nguồn: ${retained.manifest.sourceAcquiredAt ?? 'chưa khai báo'}. Không gọi lại nhà cung cấp; chưa xác minh đủ lịch sử hoặc kỳ báo cáo.` }],
              limitations: [...result.step.limitations, { provider: 'apify-dami', code: 'NATIVE_REVIEW_CAPTURE_REUSED',
                message: 'Nguồn Dami được giữ độc lập. Listing khớp cấu trúc, không xác thực tác giả, biến thể hoặc toàn bộ lịch sử; không có lượt thu hay chi phí mới cho việc gắn nguồn.' }] };
          } catch {
            if (!controller.signal.aborted) result.step = nativeSourceBlocked(result.step, 'SOURCE_PACKAGE_RESOLUTION_FAILED');
          }
        } else if (resolution?.state === 'NONE' && !controller.signal.aborted) {
          exact = await this.#shopee.collect(frozenInput, controller.signal, this.#now);
        } else if (resolution && !controller.signal.aborted) {
          result.step = nativeSourceBlocked(result.step, resolution.state === 'AMBIGUOUS' ? 'NATIVE_SOURCE_AMBIGUOUS' : 'NATIVE_SOURCE_SCOPE_UNSUPPORTED');
        }
      }
      let web: WebSearchAttempt | undefined;
      if (stepId === 'COLLECTION' && this.#webSource && !controller.signal.aborted) {
        try { web = { bound: await this.#webSource.collect(input as CollectInput, { signal: controller.signal }) }; }
        catch { web = { failedProvider: this.#webSource.id.toLowerCase() }; }
      }
      try {
        await this.#persistSourceResult(row.runId, stepId, result, controller.signal.aborted, exact, web);
      } catch (error) {
        if (!(error instanceof ResearchAutomationProviderOutputError)) throw error;
        await this.#settleSourceFailure(row.runId, stepId, 'PROVIDER_OUTPUT_INVALID', 'FAILED');
      }
      return true;
    } finally {
      externalSignal?.removeEventListener('abort', onAbort);
      this.#active.delete(row.runId);
    }
  }

  async #executeReports(row: RunRow, externalSignal?: AbortSignal, attempt?: AttemptRow): Promise<boolean> {
    const current = this.#current(row.runId);
    if (!current || current.status !== (attempt ? 'DRAFT_READY' : 'RENDERING')) return false;
    const activeKey = attempt?.attemptId ?? row.runId;
    if (this.#active.has(activeKey)) return false;
    const controller = new AbortController();
    this.#active.set(activeKey, controller);
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    try {
    const at = this.#now().toISOString();
    let claimed = false;
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.transaction(() => {
        const fresh = this.#current(row.runId);
        if (!fresh || fresh.status !== (attempt ? 'DRAFT_READY' : 'RENDERING')) return;
        if (attempt) {
          const claim = this.#db.prepare(`UPDATE analysis_research_automation_attempts SET state='RUNNING',started_at=? WHERE attempt_id=? AND state='QUEUED'`).run(at, attempt.attemptId);
          claimed = claim.changes === 1;
          return;
        }
        const claim = this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='RUNNING',started_at=?,message_code=NULL WHERE run_id=? AND step_id='REPORTS' AND state='QUEUED'`).run(at, row.runId);
        if (claim.changes !== 1) return;
        this.#transition(row.runId, toNumber(fresh.revision), 'RENDERING', at);
        claimed = true;
      }).immediate();
    });
    if (!claimed) return false;
    if (controller.signal.aborted) {
      if (attempt) await this.#settleAttempt(attempt.attemptId, 'CANCELLED');
      else await this.#settleSourceFailure(row.runId, 'REPORTS', 'CANCELLED_DURING_REPORT_RENDERING', 'CANCELLED');
      return true;
    }
    const fresh = this.#current(row.runId);
    if (!fresh) return false;
    const start = await this.#readStartSnapshot(fresh.startSha, fresh.workspaceId);
    const scope = fresh.scopeSha ? await this.#readScopeSnapshot(fresh.scopeSha, fresh.workspaceId, fresh.runId) : null;
    if (!scope) { await this.#settleSourceFailure(row.runId, 'REPORTS', 'REPORT_RENDER_FAILED', 'FAILED'); return true; }
    // The REPORTS step waits a bounded moment for automatic PDF indexing to
    // settle. Best effort only: indexing never fails the run. Skipped entirely
    // while the kill switch is off, so existing runs are untouched.
    if (this.#pageIndexEnabled() && !controller.signal.aborted) {
      try { await this.#processRunPdfs(fresh.runId, start.reports); } catch { /* indexing never breaks reporting */ }
    }
    const run = await this.getRun(fresh.workspaceId, fresh.runId);
    const collection = await this.#stepDocument(fresh.runId, 'COLLECTION');
    const captures = await this.#captureRecords(fresh.runId);
    const outputArtifacts: Array<{ kind: 'MARKET' | 'INSIGHT'; claims: StoredArtifact; m01: StoredArtifact | null; i14: StoredArtifact | null; metricProof: StoredArtifact | null; semantic: StoredArtifact; html: StoredArtifact; pdf: StoredArtifact | null; pdfCode: 'PDF_RENDERER_NOT_CONFIGURED' | 'PDF_RENDER_FAILED' | null }> = [];
    try {
      controller.signal.throwIfAborted();
      const sources = attempt ? await this.#readAttemptSources(fresh, attempt) : await this.#readFrozenSources(fresh);
      const reviewCollection = attempt ? await this.#reportCollection(fresh.runId, sources, true) : collection;
      // The Market report reads the full collection, but a revision that skips or replaces the
      // exact review source must not keep that source's missing-review notice.
      const marketCollection = collection?.exactShopeeOutcome && !reviewCollection?.exactShopee
        ? (({ exactShopeeOutcome: _outcome, ...rest }) => rest)(collection) : collection;
      const revisionRequest = attempt ? await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json') : undefined;
      const priorMarket = attempt && start.reports.includes('MARKET') ? await this.#previousSemantic(fresh, attempt, 'MARKET') : undefined;
      const priorInsight = attempt && start.reports.includes('INSIGHT') ? await this.#previousSemantic(fresh, attempt, 'INSIGHT') : undefined;
      const boundedMethods = revisionRequest && 'boundedMethods' in revisionRequest
        ? await this.#loadBoundedMethods(fresh, revisionRequest)
        : (priorMarket ?? priorInsight)?.boundedMethods as AutomationBoundedMethodSnapshot | undefined;
      const quoteMethods = revisionRequest && 'quoteMethods' in revisionRequest
        ? await this.#loadQuoteMethods(fresh, revisionRequest)
        : priorMarket?.quoteMethods as AutomationQuoteMethodSnapshot | undefined;
      let descriptiveMethods: DescriptiveMarketMethods | undefined;
      let descriptiveMethodFailure: 'DESCRIPTIVE_METHOD_FAILED' | undefined;
      let marketInventory: AutomationMarketMethodSnapshot | undefined;
      let marketInventoryFailure: 'MARKET_INVENTORY_FAILED' | undefined;
      let metricMethods: AutomationMetricMethodSnapshot | undefined;
      let metricClassified: AutomationClassifiedMetricSnapshot | undefined;
      let insightCoding: AutomationInsightCodingSnapshot | undefined;
      let metricProof: StoredArtifact | null = null;
      let metricMethodsFailure: MetricMethodFailureCode | undefined;
      let reviewCorpus: ResearchReviewCorpus | undefined;
      let reviewCorpusFailure: ResearchAutomationReportInput['reviewCorpusFailure'];
      let locatedReview: AutomationLocatedReviewSnapshot | undefined;
      let locatedReviewFallback: ResearchAutomationReportInput['locatedReviewFallback'];
      let nativeReview: NativeSourceReviewSnapshot | undefined;
      let nativeReviewFailure: 'NATIVE_REVIEW_METHOD_FAILED' | undefined;
      let locatedReviewFailure: 'LOCATED_REVIEW_METHOD_FAILED' | undefined;
      if (priorInsight && revisionRequest?.sources.nativeReview.decision === 'KEEP') {
        insightCoding = priorInsight.insightCoding as AutomationInsightCodingSnapshot | undefined;
        reviewCorpus = priorInsight.reviewCorpus as ResearchReviewCorpus | undefined;
        reviewCorpusFailure = priorInsight.reviewCorpusFailure as typeof reviewCorpusFailure;
        locatedReview = priorInsight.locatedReview as AutomationLocatedReviewSnapshot | undefined;
        locatedReviewFailure = priorInsight.locatedReviewFailure as typeof locatedReviewFailure;
        if (priorInsight.locatedReviewFallback && reviewCollection?.exactShopee) {
          locatedReviewFallback = priorInsight.locatedReviewFallback as ResearchAutomationReportInput['locatedReviewFallback'];
          locatedReview = await this.#locatedReviews.readSnapshot(locatedReviewFallback!.sourcePackage,
            { runId: fresh.runId, start, scope, scopeConfirmedAt: fresh.scopeConfirmedAt!, reference: reviewCollection.exactShopee });
        }
        nativeReview = priorInsight.nativeReview as NativeSourceReviewSnapshot | undefined;
        if (priorInsight.nativeReviewFallback && reviewCollection?.nativeReview) {
          const identity = (priorInsight.nativeReviewFallback as Pick<NativeSourceReviewSnapshot, 'sourcePackage'>).sourcePackage;
          const execution = (await this.#methodSources(fresh, attempt!, 'nativeReview'))?.value.executionId;
          nativeReview = await this.#nativeReviews.readSnapshot(identity, reviewCollection.nativeReview,
            { runId: fresh.runId, start, scope, scopeConfirmedAt: fresh.scopeConfirmedAt!, ...(execution ? { executionId: execution } : {}) });
        } else nativeReviewFailure = priorInsight.nativeReviewFailure as typeof nativeReviewFailure;
      } else if (start.reports.includes('INSIGHT') && reviewCollection?.nativeReview) {
        try { nativeReview = await this.#nativeReviews.execute(reviewCollection.nativeReview, { runId: fresh.runId, start, scope,
          scopeConfirmedAt: fresh.scopeConfirmedAt!, ...(attempt ? { executionId: attempt.attemptId } : {}) }, controller.signal); }
        catch { controller.signal.throwIfAborted(); nativeReviewFailure = 'NATIVE_REVIEW_METHOD_FAILED'; }
      }
      if (revisionRequest?.sources.nativeReview.decision !== 'KEEP' && start.reports.includes('INSIGHT') && reviewCollection?.exactShopee) {
        try { reviewCorpus = await this.#shopee.corpus(reviewCollection.exactShopee, { runId: fresh.runId, start, scope, scopeConfirmedAt: fresh.scopeConfirmedAt! }); }
        catch { controller.signal.throwIfAborted(); reviewCorpusFailure = 'REVIEW_CORPUS_FAILED'; }
        if (reviewCorpus) {
          try { locatedReview = await this.#locatedReviews.execute({ runId: fresh.runId, start, scope,
            scopeConfirmedAt: fresh.scopeConfirmedAt!, reference: reviewCollection.exactShopee }, controller.signal); }
          catch { controller.signal.throwIfAborted(); locatedReviewFailure = 'LOCATED_REVIEW_METHOD_FAILED'; }
        }
      }
      if (revisionRequest && 'acceptedInsight' in revisionRequest) {
        insightCoding = await this.#insightCoding.reportSnapshot(fresh.workspaceId, fresh.runId, revisionRequest.previousPairId, revisionRequest.acceptedInsight);
      }
      if (revisionRequest && 'draftInsight' in revisionRequest) {
        insightCoding = await this.#insightCoding.reportDraftSnapshot(fresh.workspaceId, fresh.runId, revisionRequest.previousPairId, revisionRequest.draftInsight);
      }
      if (start.reports.includes('MARKET')) {
        if (priorMarket && revisionRequest?.sources.metric.decision === 'KEEP') {
          metricMethods = priorMarket.metricMethods as AutomationMetricMethodSnapshot | undefined;
          metricClassified = priorMarket.metricClassified as AutomationClassifiedMetricSnapshot | undefined;
          metricMethodsFailure = priorMarket.metricMethodsFailure as MetricMethodFailureCode | undefined;
        } else try {
          if (!fresh.scopeConfirmedAt) throw new ResearchAutomationIntegrityError('Metric methods require confirmed scope.');
          metricMethods = await this.#metricMethods.execute({ runId: fresh.runId, start, scope,
            scopeConfirmedAt: fresh.scopeConfirmedAt,
            ...(sources ? { sourceSelection: metricSelection(sources.value) } : {}) }, controller.signal);
        } catch (error) { controller.signal.throwIfAborted(); metricMethodsFailure = metricMethodFailureCode(error); }
        if (revisionRequest && 'acceptedMetric' in revisionRequest) {
          const classified = await this.#classifiedMetric.calculate(fresh.workspaceId, fresh.runId, revisionRequest.previousPairId, revisionRequest.acceptedMetric);
          metricClassified = classified.snapshot;
          metricProof = await this.#artifacts.put(classified.proofBytes);
        } else if (metricClassified) {
          metricProof = await this.#artifacts.put(await this.#readArtifact(metricClassified.proofSha256, MAX_JSON_ARTIFACT_BYTES, 'application/json'));
        }
        if (priorMarket) {
          marketInventory = priorMarket.marketInventory as AutomationMarketMethodSnapshot | undefined;
          marketInventoryFailure = priorMarket.marketInventoryFailure as typeof marketInventoryFailure;
          descriptiveMethods = priorMarket.descriptiveMethods as DescriptiveMarketMethods | undefined;
          descriptiveMethodFailure = priorMarket.descriptiveMethodFailure as typeof descriptiveMethodFailure;
        } else {
        try { marketInventory = await this.#marketInventory.execute({ runId: fresh.runId, start, scope, collection, captures }, controller.signal); }
        catch { controller.signal.throwIfAborted(); marketInventoryFailure = 'MARKET_INVENTORY_FAILED'; }
        try { descriptiveMethods = await this.#methods.execute({ runId: fresh.runId, start, scope, collection, captures }, controller.signal); }
        catch {
          controller.signal.throwIfAborted();
          // Preserve source-backed drafts and the independent Insight report.
          // Failed admission must not fall back to presenting unchecked numbers.
          descriptiveMethodFailure = 'DESCRIPTIVE_METHOD_FAILED';
        }
        }
      }
      // Market decision packets can cite the paired Insight. Render the sibling
      // first to bind its exact immutable version without a circular reference.
      for (const kind of (['INSIGHT', 'MARKET'] as const).filter(kind => start.reports.includes(kind))) {
        if (controller.signal.aborted) throw new Error('aborted');
        let input: ResearchAutomationReportInput = { run, start, scope, captures,
          ...(boundedMethods ? { boundedMethods } : {}),
          ...(kind === 'MARKET' && quoteMethods ? { quoteMethods } : {}),
          collection: kind === 'INSIGHT' ? reviewCollection : descriptiveMethodFailure && marketCollection ? { ...marketCollection, comparables: [] } : marketCollection,
          ...(kind === 'MARKET' && descriptiveMethods ? { descriptiveMethods } : {}),
          ...(kind === 'MARKET' && descriptiveMethodFailure ? { descriptiveMethodFailure } : {}),
          ...(kind === 'INSIGHT' && reviewCorpus ? { reviewCorpus } : {}),
          ...(kind === 'INSIGHT' && reviewCorpusFailure ? { reviewCorpusFailure } : {}),
          ...(kind === 'INSIGHT' && locatedReview && !locatedReviewFallback ? { locatedReview } : {}),
          ...(kind === 'INSIGHT' && locatedReviewFallback ? { locatedReviewFallback } : {}),
          ...(kind === 'INSIGHT' && nativeReview ? { nativeReview } : {}),
          ...(kind === 'INSIGHT' && insightCoding ? { insightCoding } : {}),
          ...(kind === 'INSIGHT' && nativeReviewFailure ? { nativeReviewFailure } : {}),
          ...(kind === 'INSIGHT' && locatedReviewFailure ? { locatedReviewFailure } : {}),
          ...(kind === 'MARKET' && marketInventory ? { marketInventory } : {}),
          ...(kind === 'MARKET' && marketInventoryFailure ? { marketInventoryFailure } : {}),
          ...(kind === 'MARKET' && metricMethods ? { metricMethods } : {}),
          ...(kind === 'MARKET' && metricClassified ? { metricClassified } : {}),
          ...(kind === 'MARKET' && metricMethodsFailure ? { metricMethodsFailure } : {}),
        };
        const builtClaims = buildAutomationSourceClaims({ run, scope,
            ...(input.descriptiveMethods ? { descriptive: { output: input.descriptiveMethods } } : {}),
            ...(kind === 'INSIGHT' && locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? { located: { snapshot: locatedReview } } : {}),
            ...(input.nativeReview ? { native: { snapshot: input.nativeReview } } : {}) });
        const claimsArtifact = await this.#artifacts.put(builtClaims.bytes);
        const builtM01 = kind === 'MARKET' ? buildAutomationM01EvidenceInventory({ run, scope, inventoryVersion: '1.1.0',
          sourceClaims: builtClaims.artifact, claimsSha256: builtClaims.artifact.claimsSha256 }) : undefined;
        const m01Artifact = builtM01 ? await this.#artifacts.put(builtM01.bytes) : null;
        const admissionInput = { run, scope,
          admissionVersion: '1.1.0' as const,
          literalSnapshot: nativeReview ?? (locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? locatedReview : null),
          sourceClaims: builtClaims.artifact, claimsSha256: builtClaims.artifact.claimsSha256,
          locatedMethodOutput: nativeReview?.output ??
            (locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? locatedReview.output : null) };
        const builtI14 = kind === 'INSIGHT' ? buildAutomationI14EvidenceAdmission(admissionInput) : undefined;
        const i14Artifact = builtI14 ? await this.#artifacts.put(builtI14.bytes) : null;
        let i14Synthesis: AutomationI14ExecutionOutcome | undefined;
        if (builtI14) {
          const parent = await this.#i14Parent(fresh, attempt);
          if (revisionRequest && ('acceptedMetric' in revisionRequest || 'acceptedInsight' in revisionRequest || 'draftInsight' in revisionRequest || 'boundedMethods' in revisionRequest || 'quoteMethods' in revisionRequest)) {
            // Selected coding changes deterministic methods, not the frozen AI evidence package.
            const retained = await this.#i14Executions.read(parent, admissionInput);
            if (retained.status === 'PREPARED' || retained.status === 'DISPATCHING')
              throw new ResearchAutomationIntegrityError('Prior Insight execution is not settled.');
            if (retained.status !== 'ABSENT') i14Synthesis = retained;
          } else i14Synthesis = await this.#i14Executions.execute({ parent,
            admission: admissionInput, ai: this.#i14Ai, signal: controller.signal });
        }
        if (i14Synthesis?.status === 'PREPARED') throw new ResearchAutomationIntegrityError('Prepared I14 execution has not settled.');
        const decisionClaims = kind === 'MARKET' ? buildAutomationSourceClaims({ run, scope,
          ...(descriptiveMethods ? { descriptive: { output: descriptiveMethods } } : {}),
          ...(locatedReview?.contractVersion === 'automation-located-review-snapshot-v2' ? { located: { snapshot: locatedReview } } : {}),
          ...(nativeReview ? { native: { snapshot: nativeReview } } : {}) }) : builtClaims;
        const decisionPackets: AutomationDecisionPacket[] = [];
        const decisionSynthesis: Partial<Record<AutomationDecisionSectionId, AutomationDecisionExecutionOutcome>> = {};
        const decisionExecutionIds: Partial<Record<AutomationDecisionSectionId, string>> = {};
        for (const sectionId of (kind === 'MARKET' ? ['M11', 'M12'] as const : ['I15'] as const)) {
          const source: AutomationDecisionPacketInput = { sectionId, packetVersion: '1.2.0', evidence: { ...admissionInput,
            sourceClaims: decisionClaims.artifact, claimsSha256: decisionClaims.artifact.claimsSha256 } };
          decisionPackets.push(buildAutomationDecisionPacket(source).artifact);
          const parent = await this.#i14Parent(fresh, attempt);
          let outcome: AutomationDecisionExecutionOutcome | undefined;
          if (revisionRequest && ('acceptedMetric' in revisionRequest || 'acceptedInsight' in revisionRequest || 'draftInsight' in revisionRequest || 'boundedMethods' in revisionRequest || 'quoteMethods' in revisionRequest)) {
            // Deterministic revisions preserve the source-bound draft, without authorizing new AI calls.
            const retained = await this.#decisionExecutions[sectionId].read(parent, source);
            if (retained.status === 'PREPARED' || retained.status === 'DISPATCHING')
              throw new ResearchAutomationIntegrityError('Prior decision synthesis is not settled.');
            if (retained.status !== 'ABSENT') outcome = retained;
          } else outcome = await this.#decisionExecutions[sectionId].execute({ parent, source,
            ai: this.#decisionAi[sectionId] ?? null, signal: controller.signal });
          if (outcome?.status === 'PREPARED') throw new ResearchAutomationIntegrityError('Prepared decision synthesis has not settled.');
          if (outcome) {
            decisionSynthesis[sectionId] = outcome;
            if ('executionId' in outcome) decisionExecutionIds[sectionId] = outcome.executionId;
          }
        }
        const decisionPairedInsightVersionId = kind === 'MARKET' ? outputArtifacts.find(output => output.kind === 'INSIGHT')?.semantic.sha256 ?? null : null;
        input = { ...input, decisionPackets, decisionSynthesis, decisionSourceClaims: decisionClaims.artifact,
          sourceClaims: builtClaims.artifact, ...(builtM01 ? { m01Inventory: builtM01.artifact } : {}),
          ...(builtI14 ? { i14Admission: builtI14.artifact } : {}), ...(i14Synthesis ? { i14Synthesis } : {}) };
        const render = async () => {
          const rendered = this.#renderer ? await this.#renderer(input, kind, controller.signal) : defaultRenderedReport(input, kind);
          controller.signal.throwIfAborted();
          if (typeof rendered.semantic !== 'object' || rendered.semantic === null || Array.isArray(rendered.semantic)) throw new ResearchAutomationIntegrityError('Research report semantic output is not an object.');
          // Method persistence is owned here, not delegated to an optional presentation adapter.
          const { decisionPackets: _untrustedPackets, decisionSourceClaims: _untrustedDecisionClaims, decisionPairedInsightVersionId: _untrustedPair,
            decisionSynthesis: _untrustedDecisionSynthesis, decisionExecutionIds: _untrustedDecisionExecutions,
            quoteMethods: _untrustedQuote, boundedMethods: _untrustedBounded, metricClassified: _untrustedClassified, insightCoding: _untrustedCoding, sourceClaims: _untrustedClaims, sourceClaimsArtifact: _untrustedReference,
            m01Inventory: _untrustedM01, m01InventoryArtifact: _untrustedM01Reference,
            i14Admission: _untrustedI14, i14AdmissionArtifact: _untrustedI14Reference,
            i14Synthesis: _untrustedSynthesis, i14ExecutionId: _untrustedExecution, ...presentation } = rendered.semantic as Record<string, unknown>;
          const reportSemantic = { ...presentation, decisionPackets, decisionPairedInsightVersionId,
            ...(Object.keys(decisionExecutionIds).length ? { decisionExecutionIds } : {}),
            sourceClaimsArtifact: { contractVersion: 'automation-source-claims-reference-v1', sha256: claimsArtifact.sha256, byteSize: builtClaims.bytes.length },
            ...(boundedMethods ? { boundedMethods } : {}),
            ...(kind === 'MARKET' && quoteMethods ? { quoteMethods } : {}),
            ...(builtM01 && m01Artifact ? { m01InventoryArtifact: { contractVersion: 'automation-m01-inventory-reference-v1', sha256: m01Artifact.sha256, byteSize: builtM01.bytes.length } } : {}),
            ...(builtI14 && i14Artifact ? { i14AdmissionArtifact: { contractVersion: 'automation-i14-admission-reference-v1', sha256: i14Artifact.sha256, byteSize: builtI14.bytes.length } } : {}),
            ...(i14Synthesis && 'executionId' in i14Synthesis ? { i14ExecutionId: i14Synthesis.executionId } : {}),
            ...(kind === 'MARKET' && descriptiveMethods ? { descriptiveMethods } : {}),
            ...(sources ? { confirmedSourceSetSha256: sources.sha256 } : {}),
            ...(attempt ? { reportAttemptId: attempt.attemptId, previousPairId: attempt.previousPairId } : {}),
            ...(kind === 'MARKET' && descriptiveMethodFailure ? { descriptiveMethodFailure } : {}),
            ...(kind === 'INSIGHT' ? { reviewCorpus: input.reviewCorpus ?? null } : {}),
            ...(kind === 'INSIGHT' && input.reviewCorpusFailure ? { reviewCorpusFailure: input.reviewCorpusFailure } : {}),
            ...(kind === 'INSIGHT' ? { locatedReview: input.locatedReview ?? null } : {}),
            ...(kind === 'INSIGHT' && input.locatedReviewFallback ? { locatedReviewFallback: input.locatedReviewFallback } : {}),
            ...(kind === 'INSIGHT' ? { nativeReview: input.nativeReview ?? null } : {}),
            ...(kind === 'INSIGHT' && insightCoding ? { insightCoding } : {}),
            ...(kind === 'INSIGHT' && input.nativeReviewFallback ? { nativeReviewFallback: input.nativeReviewFallback } : {}),
            ...(kind === 'INSIGHT' && input.nativeReviewFailure ? { nativeReviewFailure: input.nativeReviewFailure } : {}),
            ...(kind === 'INSIGHT' && input.locatedReviewFailure ? { locatedReviewFailure: input.locatedReviewFailure } : {}),
            ...(kind === 'MARKET' && marketInventory ? { marketInventory } : {}),
            ...(kind === 'MARKET' && marketInventoryFailure ? { marketInventoryFailure } : {}),
            ...(kind === 'MARKET' ? { metricMethods: metricMethods ?? null } : {}),
            ...(kind === 'MARKET' && metricClassified ? { metricClassified } : {}),
            ...(kind === 'MARKET' && metricMethodsFailure ? { metricMethodsFailure } : {}) };
          const semanticBytes = Buffer.from(canonicalJson(reportSemantic), 'utf8');
          const html = Buffer.from(rendered.html);
          return { rendered, semanticBytes, html };
        };
        let prepared = await render();
        if (kind === 'INSIGHT' && input.reviewCorpus && (prepared.semanticBytes.byteLength > MAX_JSON_ARTIFACT_BYTES || prepared.html.byteLength > MAX_HTML_BYTES)) {
          // Keep the entire admitted raw collection. Do not truncate quotes or
          // fail the independent Market report because this view is too large.
          const { reviewCorpus: _oversizedCorpus, locatedReview: _oversizedLocated, ...withoutCorpus } = input;
          input = { ...withoutCorpus,
            ...(_oversizedLocated?.contractVersion === 'automation-located-review-snapshot-v2' ? { locatedReviewFallback: { sourcePackage: _oversizedLocated.sourcePackage } } : {}),
            reviewCorpusFailure: 'REVIEW_CORPUS_REPORT_TOO_LARGE' };
          prepared = await render();
        }
        if (kind === 'INSIGHT' && input.nativeReview && (prepared.semanticBytes.byteLength > MAX_JSON_ARTIFACT_BYTES || prepared.html.byteLength > MAX_HTML_BYTES)) {
          const { nativeReview: oversizedNative, ...withoutNative } = input;
          input = { ...withoutNative, nativeReviewFallback: { sourcePackage: oversizedNative.sourcePackage },
            nativeReviewFailure: 'NATIVE_REVIEW_REPORT_TOO_LARGE' };
          prepared = await render();
        }
        const { rendered, semanticBytes, html } = prepared;
        if (semanticBytes.byteLength > MAX_JSON_ARTIFACT_BYTES || html.byteLength > MAX_HTML_BYTES) throw new ResearchAutomationIntegrityError('Research report output exceeds its bound.');
        const semantic = await this.#artifacts.put(semanticBytes);
        const htmlArtifact = await this.#artifacts.put(html);
        let pdf: StoredArtifact | null = null;
        if (rendered.pdf !== undefined) {
          const pdfBytes = Buffer.from(rendered.pdf);
          if (pdfBytes.byteLength > MAX_PDF_BYTES || !pdfBytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ResearchAutomationIntegrityError('Research PDF output failed validation.');
          pdf = await this.#artifacts.put(pdfBytes);
        }
        outputArtifacts.push({ kind, claims: claimsArtifact, m01: m01Artifact, i14: i14Artifact, metricProof: kind === 'MARKET' ? metricProof : null, semantic, html: htmlArtifact, pdf, pdfCode: pdf ? null : rendered.pdfUnavailableCode ?? 'PDF_RENDERER_NOT_CONFIGURED' });
      }
    } catch {
      if (attempt) { await this.#settleAttempt(attempt.attemptId, controller.signal.aborted ? 'CANCELLED' : 'FAILED'); return true; }
      const current = this.#current(row.runId);
      if (!current || TERMINAL_STATUSES.has(current.status)) return true;
      await this.#settleSourceFailure(row.runId, 'REPORTS', controller.signal.aborted ? 'CANCELLED_DURING_REPORT_RENDERING' : 'REPORT_RENDER_FAILED', controller.signal.aborted ? 'CANCELLED' : 'FAILED');
      return true;
    }
    const beforeSave = this.#current(row.runId);
    if (!beforeSave || (!attempt && TERMINAL_STATUSES.has(beforeSave.status))) return true;
    const finished = this.#now().toISOString();
    try {
      const previous = attempt ? (await this.listReportVersions(row.workspaceId, row.runId)).at(-1)! : undefined;
      if (attempt && previous!.pairId !== attempt.previousPairId) throw new ResearchAutomationIntegrityError('Revision predecessor changed.');
      const pairArtifact = attempt ? await this.#putJson(pairDocument(row, previous!.versionNumber + 1, outputArtifacts.map(output => ({ reportKind: output.kind,
        versionSha: output.semantic.sha256, htmlSha: output.html.sha256, pdfSha: output.pdf?.sha256 ?? null, pdfUnavailableCode: output.pdfCode })), attempt.attemptId), finished) : undefined;
      await withDatabaseMutationMutex(this.#db, async () => {
        this.#db.transaction(() => {
          const current = this.#current(row.runId);
          if (!current || (!attempt && TERMINAL_STATUSES.has(current.status))) return;
          if (attempt && this.#attempt(attempt.attemptId)?.state !== 'RUNNING') return;
          controller.signal.throwIfAborted();
          for (const output of outputArtifacts) {
            this.#registerManifest(output.claims, 'application/json', finished);
            if (output.m01) this.#registerManifest(output.m01, 'application/json', finished);
            if (output.i14) this.#registerManifest(output.i14, 'application/json', finished);
            if (output.metricProof) this.#registerManifest(output.metricProof, 'application/json', finished);
            this.#registerManifest(output.semantic, 'application/json', finished);
            this.#registerManifest(output.html, 'text/html; charset=utf-8', finished);
            if (output.pdf) this.#registerManifest(output.pdf, 'application/pdf', finished);
            if (attempt) this.#db.prepare(`INSERT INTO analysis_research_automation_attempt_outputs(attempt_id,report_kind,version_sha256,html_sha256,pdf_sha256,pdf_unavailable_code,created_at) VALUES (?,?,?,?,?,?,?)`)
              .run(attempt.attemptId, output.kind, output.semantic.sha256, output.html.sha256, output.pdf?.sha256 ?? null, output.pdf ? null : output.pdfCode, finished);
            else this.#db.prepare(`INSERT INTO analysis_research_automation_outputs(run_id,report_kind,version_sha256,html_sha256,pdf_sha256,pdf_unavailable_code,created_at) VALUES (?,?,?,?,?,?,?)`)
              .run(row.runId, output.kind, output.semantic.sha256, output.html.sha256, output.pdf?.sha256 ?? null, output.pdf ? null : output.pdfCode, finished);
          }
          if (attempt) {
            this.#registerManifest(pairArtifact!, 'application/json', finished);
            const change = this.#db.prepare(`UPDATE analysis_research_automation_attempts SET state='COMMITTED',version_number=?,pair_sha256=?,finished_at=? WHERE attempt_id=? AND state='RUNNING'`).run(previous!.versionNumber + 1, pairArtifact!.sha256, finished, attempt.attemptId);
            if (change.changes !== 1) throw new ResearchAutomationIntegrityError('Revision publication claim was lost.');
            return;
          }
          this.#transition(row.runId, toNumber(current.revision), 'DRAFT_READY', finished);
          this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='SUCCEEDED',finished_at=? WHERE run_id=? AND step_id='REPORTS' AND state='RUNNING'`).run(finished, row.runId);
        })();
      });
    } catch (error) {
      if (attempt) { await this.#settleAttempt(attempt.attemptId, controller.signal.aborted ? 'CANCELLED' : 'FAILED'); return true; }
      try {
        const current = this.#current(row.runId);
        if (!current || TERMINAL_STATUSES.has(current.status)) return true;
        await this.#settleSourceFailure(row.runId, 'REPORTS', controller.signal.aborted ? 'CANCELLED_DURING_REPORT_RENDERING' : 'REPORT_RENDER_FAILED', controller.signal.aborted ? 'CANCELLED' : 'FAILED');
        return true;
      } catch (settlementError) {
        throw new AggregateError([error, settlementError], 'Report publication failed and the run could not be settled.');
      }
    }
    return true;
    } finally {
      externalSignal?.removeEventListener('abort', onAbort);
      if (this.#active.get(activeKey) === controller) this.#active.delete(activeKey);
    }
  }

  async #persistSourceResult(runId: string, stepId: SourceStepId, bound: PersistableSourceResult, aborted: boolean, exact?: ExactShopeeAttempt, web?: WebSearchAttempt): Promise<void> {
    const result = bound.result;
    let step = bound.step;
    const nativeCoverage = bound.step.coverage.filter(value => value.provider === 'apify-dami');
    const nativeLimitations = bound.step.limitations.filter(value => value.provider === 'apify-dami');
    const now = this.#now().toISOString();
    const captures: Array<{ row: CaptureRecord; artifact: StoredArtifact }> = [];
    let envelopes = captureEnvelopes(result);
    if (!envelopes) {
      // Reject this source as a whole, not an arbitrary truncated prefix. The
      // independent exact collection and its cost receipt must still survive.
      envelopes = [];
      step = invalidProviderStep(runId, stepId);
    }
    const putCaptures = async (values: NonNullable<ReturnType<typeof captureEnvelopes>>): Promise<void> => {
      for (const { capture, body } of values) {
        if (stepId === 'COLLECTION' && capture.responseBytes && !aborted &&
          Buffer.from(capture.responseBytes.subarray(0, 5)).toString('utf8') === '%PDF-') {
          try { await this.#retainRunPdf(runId, `source-${captures.length + 1}.pdf`, capture.responseBytes); }
          catch { /* Source retention/indexing failure never invents a citation. */ }
        }
        const artifact = await this.#artifacts.put(body);
        captures.push({ row: {
          stepId, ordinal: captures.length, artifactSha256: artifact.sha256, mediaType: 'application/vnd.tdn.research-automation.capture+json', provider: capture.provider.toLowerCase(),
          operation: capture.operation.toLowerCase(), retrievedAt: capture.completedAt, window: capture.queryWindow, truncated: false,
        }, artifact });
      }
    };
    await putCaptures(envelopes);
    try {
      assertStepDocument(step, runId, stepId);
      assertCaptureLineage(step, captures.map(value => value.row));
    } catch {
      // Retain the bounded exchange and usage even when its normalized output
      // cannot be admitted. No invalid observation enters a report.
      step = invalidProviderStep(runId, stepId);
    }
    // Web captures follow the product source's captures, so existing
    // comparable indexes stay valid and web results are offset past them.
    let webStep: StepResultDocument | undefined;
    if (web && 'bound' in web) {
      const offset = captures.length;
      const webEnvelopes = captureEnvelopes(web.bound.result);
      await putCaptures(webEnvelopes ?? []);
      const provider = web.bound.result.provider.toLowerCase();
      const shifted = { ...web.bound.step, ...(web.bound.step.webResults ? { webResults: web.bound.step.webResults.map(value => ({ ...value, captureIndex: value.captureIndex + offset })) } : {}) };
      try {
        if (!webEnvelopes) throw new ResearchAutomationProviderOutputError('Web search capture exceeds its retention bound.');
        assertStepDocument(shifted, runId, stepId);
        assertCaptureLineage(shifted, captures.map(value => value.row));
        webStep = shifted;
      } catch {
        webStep = { ...invalidProviderStep(runId, stepId), limitations: [{ code: 'PROVIDER_OUTPUT_INVALID', provider, message: message('PROVIDER_OUTPUT_INVALID') }] };
      }
    } else if (web) {
      webStep = { ...invalidProviderStep(runId, stepId),
        coverage: [{ provider: web.failedProvider, dataset: 'web_discovery_current', state: 'FAILED', observedStartDate: null, observedEndDate: null, truncated: false, note: null }],
        limitations: [{ code: 'PROVIDER_FAILED', provider: web.failedProvider, message: message('PROVIDER_FAILED') }] };
    }
    if (nativeCoverage.length) step = { ...step,
      outcome: bound.step.nativeReview || step.outcome === 'SUCCEEDED' || step.outcome === 'PARTIAL' ? 'PARTIAL' : 'FAILED',
      ...(bound.step.nativeReview ? { nativeReview: bound.step.nativeReview } : {}),
      coverage: [...step.coverage.filter(value => value.provider !== 'apify-dami'), ...nativeCoverage],
      limitations: [...step.limitations.filter(value => value.provider !== 'apify-dami'), ...nativeLimitations] };
    if (exact) step = { ...step,
      outcome: exact.coverage.state === 'FAILED' || exact.coverage.state === 'CANCELLED'
        ? step.outcome === 'SUCCEEDED' || step.outcome === 'PARTIAL' ? 'PARTIAL' : exact.coverage.state
        : exact.reference ? (step.outcome === 'SUCCEEDED' && exact.coverage.state === 'COLLECTED' ? 'SUCCEEDED' : 'PARTIAL') : step.outcome === 'SUCCEEDED' ? 'PARTIAL' : step.outcome,
      coverage: [...step.coverage, exact.coverage],
      limitations: [...step.limitations, exact.limitation, ...(exact.outcomeLimitation ? [exact.outcomeLimitation] : [])],
      ...(exact.reference ? { exactShopee: exact.reference } : {}),
      ...(exact.reference && exact.exactShopeeOutcome ? { exactShopeeOutcome: exact.exactShopeeOutcome } : {}) };
    if (webStep) {
      // Without any product-source attempt the web lane alone decides the outcome.
      const productAttempted = result !== null || bound.unsettledProvider !== undefined || exact !== undefined || nativeCoverage.length > 0;
      const useful = (value: StepResultDocument['outcome']) => value === 'SUCCEEDED' || value === 'PARTIAL';
      step = { ...step,
        outcome: !productAttempted ? webStep.outcome
          : step.outcome === 'SUCCEEDED' && webStep.outcome === 'SUCCEEDED' ? 'SUCCEEDED'
            : useful(step.outcome) || useful(webStep.outcome) ? 'PARTIAL' : step.outcome,
        coverage: [...step.coverage, ...webStep.coverage], limitations: [...step.limitations, ...webStep.limitations],
        ...(webStep.webResults?.length ? { webResults: webStep.webResults } : {}) };
    }
    const webResult = web && 'bound' in web ? web.bound.result : null;
    const resultArtifact = await this.#artifacts.put(Buffer.from(canonicalJson(step), 'utf8'));
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.transaction(() => {
        for (const value of captures) this.#registerManifest(value.artifact, 'application/vnd.tdn.research-automation.capture+json', value.row.retrievedAt);
        this.#registerManifest(resultArtifact, 'application/vnd.tdn.research-automation.step+json', now);
        for (const value of captures) this.#db.prepare(`INSERT INTO analysis_research_automation_captures(run_id,step_id,ordinal,artifact_sha256,media_type,provider,operation,retrieved_at,window_start,window_end,truncated,retained_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
          .run(runId, stepId, value.row.ordinal, value.row.artifactSha256, value.row.mediaType, value.row.provider, value.row.operation, value.row.retrievedAt, value.row.window?.startDate ?? null, value.row.window?.endDate ?? null, value.row.truncated ? 1 : 0, now);
        if (result) this.#persistUsage(runId, stepId, result, now);
        else if (bound.unsettledProvider) this.#db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,cost_unit,cost_amount,recorded_at) VALUES (?,?,0,?,'unsettled-collection',0,'UNKNOWN',NULL,NULL,?)`)
          .run(runId, stepId, bound.unsettledProvider, now);
        if (webResult) this.#persistUsage(runId, stepId, webResult, now, WEB_USAGE_ORDINAL);
        else if (web && 'failedProvider' in web) this.#db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,cost_unit,cost_amount,recorded_at) VALUES (?,?,?,?,'unsettled-collection',0,'UNKNOWN',NULL,NULL,?)`)
          .run(runId, stepId, WEB_USAGE_ORDINAL, web.failedProvider, now);
        if (exact) this.#db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,cost_unit,cost_amount,recorded_at) VALUES (?,?,1,'apify-shopee','reviews',?,?,?,?,?)`)
          .run(runId, stepId, exact.requestsIssued, exact.costUsd === null ? 'UNKNOWN' : 'KNOWN', exact.costUsd === null ? null : 'USD', exact.costUsd, now);
        const current = this.#current(runId);
        if (!current) throw new ResearchAutomationIntegrityError('Run disappeared while saving source output.');
        // close()/restart may have already settled this run as INTERRUPTED.
        // Keep the exact late capture and usage rows, but never reopen a
        // terminal run or mutate its interrupted step.
        if (TERMINAL_STATUSES.has(current.status)) return;
        const outcome = aborted || result?.status === 'CANCELLED' || webResult?.status === 'CANCELLED' || current.status === 'CANCELLING' ? 'CANCELLED' : step.outcome;
        const code = outcome === 'CANCELLED' ? 'CANCELLED_DURING_PROVIDER_OPERATION' : outcome === 'UNAVAILABLE' ? 'PROVIDER_NOT_CONFIGURED' : outcome === 'FAILED'
          ? step.limitations.some(value => value.code === 'PROVIDER_OUTPUT_INVALID') ? 'PROVIDER_OUTPUT_INVALID' : 'PROVIDER_FAILED' : null;
        const finished = this.#now().toISOString();
        this.#db.prepare(`UPDATE analysis_research_automation_steps SET state=?,message_code=?,result_sha256=?,finished_at=? WHERE run_id=? AND step_id=? AND state='RUNNING'`)
          .run(outcome, code, resultArtifact.sha256, finished, runId, stepId);
        if (outcome === 'CANCELLED') {
          this.#transition(runId, toNumber(current.revision), 'CANCELLED', finished);
          this.#skipPendingSteps(runId, finished);
        } else if (stepId === 'QUICK_SEARCH') {
          this.#transition(runId, toNumber(current.revision), 'AWAITING_SCOPE', finished);
        } else {
          this.#transition(runId, toNumber(current.revision), 'RENDERING', finished);
          this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED' WHERE run_id=? AND step_id='REPORTS' AND state='PENDING'`).run(runId);
        }
      })();
    });
  }

  async #settleUnavailable(row: RunRow, stepId: SourceStepId): Promise<void> {
    const at = this.#now().toISOString();
    const step: StepResultDocument = { contractVersion: 'research-automation-step-result-v1', runId: row.runId, stepId, outcome: 'UNAVAILABLE', productCards: [], comparables: [], coverage: [], limitations: [{ code: 'PROVIDER_NOT_CONFIGURED', provider: null, message: message('PROVIDER_NOT_CONFIGURED') }] };
    const artifact = await this.#artifacts.put(Buffer.from(canonicalJson(step), 'utf8'));
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.transaction(() => {
        const current = this.#current(row.runId);
        const expectedStatus = stepId === 'QUICK_SEARCH' ? 'QUICK_SEARCH_QUEUED' : 'COLLECTION_QUEUED';
        if (!current || current.status !== expectedStatus) return;
        this.#registerManifest(artifact, 'application/vnd.tdn.research-automation.step+json', at);
        const updated = this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='UNAVAILABLE',message_code='PROVIDER_NOT_CONFIGURED',result_sha256=?,finished_at=? WHERE run_id=? AND step_id=? AND state IN ('QUEUED','RUNNING')`).run(artifact.sha256, at, row.runId, stepId);
        if (updated.changes !== 1) return;
        if (stepId === 'QUICK_SEARCH') this.#transition(row.runId, toNumber(current.revision), 'AWAITING_SCOPE', at);
        else { this.#transition(row.runId, toNumber(current.revision), 'RENDERING', at); this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED' WHERE run_id=? AND step_id='REPORTS'`).run(row.runId); }
      })();
    });
  }

  async #settleSourceFailure(runId: string, stepId: SourceStepId | 'REPORTS', code: string, state: 'FAILED' | 'CANCELLED' | 'SKIPPED'): Promise<void> {
    const at = this.#now().toISOString();
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.transaction(() => {
        const current = this.#current(runId); if (!current) return;
        if (TERMINAL_STATUSES.has(current.status)) return;
        this.#db.prepare(`UPDATE analysis_research_automation_steps SET state=?,message_code=?,finished_at=? WHERE run_id=? AND step_id=? AND state='RUNNING'`).run(state, code, at, runId, stepId);
        if (state === 'CANCELLED') {
          this.#transition(runId, toNumber(current.revision), 'CANCELLED', at);
          this.#skipPendingSteps(runId, at);
          return;
        }
        if (stepId === 'QUICK_SEARCH') {
          this.#transition(runId, toNumber(current.revision), 'AWAITING_SCOPE', at);
          return;
        }
        if (stepId === 'COLLECTION') {
          this.#transition(runId, toNumber(current.revision), 'RENDERING', at);
          this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED' WHERE run_id=? AND step_id='REPORTS' AND state='PENDING'`).run(runId);
          return;
        }
        this.#transition(runId, toNumber(current.revision), 'FAILED', at);
      })();
    });
  }

  #skipPendingSteps(runId: string, at: string): void {
    this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='SKIPPED',message_code='SKIPPED_AFTER_STOP',finished_at=? WHERE run_id=? AND state IN ('PENDING','QUEUED')`).run(at, runId);
  }

  #persistUsage(runId: string, stepId: SourceStepId, result: { readonly provider: string; readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: string; readonly consumed?: number } } }, at: string, ordinal = 0): void {
    const provider = result.provider.toLowerCase();
    // Usage is an aggregate across the provider call; attributing it to the
    // first capture would mislabel a credit-balance request as the run cost.
    const operation = 'provider.run';
    const usage = result.usage;
    // An account-wide balance delta is not attributable to this run and is
    // therefore never presented as a known CREDITS charge. Only an explicit
    // no-paid-request receipt can safely expose a zero credit usage.
    const noPaidUsage = usage.credits.status === 'NONE_USED' && usage.paidRequestsIssued === 0 && usage.ambiguousPaidRequests === 0;
    const costState = noPaidUsage ? 'KNOWN' : 'UNKNOWN';
    const costUnit = noPaidUsage ? 'CREDITS' : null;
    const costAmount = noPaidUsage ? '0' : null;
    this.#db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,cost_unit,cost_amount,recorded_at) VALUES (?,?,?,?,?,?,?,?,?,?)`)
      .run(runId, stepId, ordinal, provider, operation, usage.requestsIssued, costState, costUnit, costAmount, at);
  }

  async #projection(row: RunRow): Promise<ResearchAutomationRun> {
    const start = await this.#readStartSnapshot(row.startSha, row.workspaceId);
    const scope = row.scopeSha ? await this.#readScopeSnapshot(row.scopeSha, row.workspaceId, row.runId) : null;
    if (row.mode !== start.mode || row.keyword !== start.keyword || row.periodStart !== start.requestedPeriod.startDate || row.periodEnd !== start.requestedPeriod.endDate || row.reports !== start.reports.join(',')) {
      throw new ResearchAutomationIntegrityError('Run row does not match its frozen start snapshot.');
    }
    const steps = this.#db.prepare(`SELECT run_id runId,step_id stepId,state, message_code code,result_sha256 resultSha,started_at startedAt,finished_at finishedAt FROM analysis_research_automation_steps WHERE run_id=? ORDER BY CASE step_id WHEN 'QUICK_SEARCH' THEN 0 WHEN 'COLLECTION' THEN 1 ELSE 2 END`).all(row.runId) as StepRow[];
    const documents = new Map<StepId, StepResultDocument>();
    for (const step of steps) if (step.resultSha) documents.set(step.stepId, await this.#readStepDocument(step.resultSha, row.runId, step.stepId));
    const captures = await this.#captureRecords(row.runId);
    for (const document of documents.values()) assertCaptureLineage(document, captures);
    const cards = documents.get('QUICK_SEARCH')?.productCards ?? [];
    const coverageSources = [...documents.values()].flatMap((doc) => doc.coverage);
    const usageRows = this.#db.prepare(`SELECT step_id stepId,ordinal,provider,operation,request_count requestCount,cost_state costState,cost_unit costUnit,cost_amount costAmount FROM analysis_research_automation_usage WHERE run_id=? ORDER BY step_id,ordinal`).all(row.runId) as UsageRow[];
    const usageEntries = usageRows.map((value) => ({ stepId: value.stepId, provider: value.provider, operation: value.operation, requestCount: toNumber(value.requestCount), cost: value.costState === 'KNOWN' ? { state: 'KNOWN' as const, unit: value.costUnit!, amount: value.costAmount! } : { state: 'UNKNOWN' as const } }));
    const knownCosts = usageEntries.filter((value): value is typeof value & { cost: { state: 'KNOWN'; unit: 'USD' | 'CREDITS'; amount: string } } => value.cost.state === 'KNOWN').map((value) => ({ unit: value.cost.unit, amount: value.cost.amount }));
    const aiActivity: NonNullable<ResearchAutomationRun['aiActivity']> = { ...await this.#i14Executions.readActivity(row.workspaceId, row.runId) };
    for (const [sectionId, key] of [['M11', 'm11'], ['M12', 'm12'], ['I15', 'i15']] as const) {
      const activity = await this.#decisionExecutions[sectionId].readActivity(row.workspaceId, row.runId);
      if (activity) aiActivity[key] = activity;
    }
    const blockers = blockerList(steps, documents, scope !== null);
    const outputRows = this.#db.prepare(`SELECT report_kind reportKind,version_sha256 versionSha,html_sha256 htmlSha,pdf_sha256 pdfSha,pdf_unavailable_code pdfUnavailableCode FROM analysis_research_automation_outputs WHERE run_id=?`).all(row.runId) as OutputRow[];
    const outputs = outputRows.length === 0 ? undefined : Object.fromEntries(outputRows.map((value) => [value.reportKind === 'MARKET' ? 'market' : 'insight', { versionId: value.versionSha, web: true as const, pdf: { available: value.pdfSha !== null, reason: value.pdfSha ? null : message(value.pdfUnavailableCode ?? 'PDF_RENDERER_NOT_CONFIGURED') } }])) as ResearchAutomationRun['outputs'];
    return {
      contractVersion: 'research-automation-run-v1', runId: row.runId, workspaceId: row.workspaceId, revision: toNumber(row.revision), status: row.status, country: 'VN', mode: row.mode, keyword: row.keyword,
      description: start.description, interview: start.interview, requestedPeriod: start.requestedPeriod, reports: start.reports as ResearchAutomationRun['reports'],
      definition: scope ? { definition: scope.definition, includeTerms: [...scope.includeTerms], excludeTerms: [...scope.excludeTerms], selectedProductIds: [...scope.selectedProductIds], peerProductIds: [...scope.peerProductIds], confirmedAt: row.scopeConfirmedAt!, ...(scope.exactShopeeUrls !== undefined ? { exactShopeeUrls: [...scope.exactShopeeUrls] } : {}) } : null,
      productCards: [...cards], coverage: { requestedPeriod: start.requestedPeriod, sources: [...coverageSources] }, usage: { entries: usageEntries, requestCount: usageEntries.reduce((total, value) => total + value.requestCount, 0), knownCosts: knownCosts.slice(0, 2), hasUnknownCost: usageEntries.some((value) => value.cost.state === 'UNKNOWN') },
      ...(Object.keys(aiActivity).length ? { aiActivity } : {}),
      steps: steps.map((value) => ({ stepId: value.stepId, state: value.state, code: value.code, message: value.code ? safeStepMessage(value.code) : null, startedAt: value.startedAt, finishedAt: value.finishedAt })), blockers,
      ...(outputs ? { outputs } : {}), createdAt: row.createdAt, updatedAt: row.updatedAt,
    };
  }

  async #captureRecords(runId: string): Promise<CaptureRecord[]> {
    const rows = this.#db.prepare(`SELECT step_id stepId,ordinal,artifact_sha256 artifactSha,media_type mediaType,provider,operation,retrieved_at retrievedAt,window_start windowStart,window_end windowEnd,truncated FROM analysis_research_automation_captures WHERE run_id=? ORDER BY step_id,ordinal`).all(runId) as CaptureRow[];
    const output: CaptureRecord[] = [];
    for (const value of rows) {
      const envelope = await this.#readJson<Record<string, unknown>>(value.artifactSha, MAX_CAPTURE_ENVELOPE_BYTES, value.mediaType);
      assertCaptureEnvelope(envelope, value);
      output.push({ stepId: value.stepId, ordinal: toNumber(value.ordinal), artifactSha256: value.artifactSha, mediaType: value.mediaType, provider: value.provider, operation: value.operation, retrievedAt: value.retrievedAt, window: value.windowStart ? { startDate: value.windowStart, endDate: value.windowEnd! } : null, truncated: value.truncated === 1 || value.truncated === 1n });
    }
    return output;
  }

  async #stepDocument(runId: string, stepId: StepId): Promise<StepResultDocument | null> {
    const row = this.#db.prepare('SELECT result_sha256 resultSha FROM analysis_research_automation_steps WHERE run_id=? AND step_id=?').get(runId, stepId) as { resultSha: string | null } | undefined;
    return row?.resultSha ? this.#readStepDocument(row.resultSha, runId, stepId) : null;
  }
  #output(runId: string, kind: 'MARKET' | 'INSIGHT'): OutputRow | undefined {
    return this.#db.prepare(`SELECT report_kind reportKind,version_sha256 versionSha,html_sha256 htmlSha,pdf_sha256 pdfSha,pdf_unavailable_code pdfUnavailableCode FROM analysis_research_automation_outputs WHERE run_id=? AND report_kind=?`).get(runId, kind) as OutputRow | undefined;
  }
  #attempt(attemptId: string): AttemptRow | undefined {
    return this.#db.prepare(`SELECT attempt_id attemptId,run_id runId,attempt_number attemptNumber,previous_pair_sha256 previousPairId,request_sha256 requestSha,source_set_sha256 sourceSetSha,state,version_number versionNumber,pair_sha256 pairId,created_at createdAt FROM analysis_research_automation_attempts WHERE attempt_id=?`).get(attemptId) as AttemptRow | undefined;
  }
  #attemptRequest(key: string): { attemptId: string; kind: 'CREATE' | 'CANCEL'; sha: string } | undefined {
    return this.#db.prepare(`SELECT attempt_id attemptId,request_kind kind,request_sha256 sha FROM analysis_research_automation_attempt_requests WHERE request_key=?`).get(key) as { attemptId: string; kind: 'CREATE' | 'CANCEL'; sha: string } | undefined;
  }
  #attemptOutputs(attemptId: string): OutputRow[] {
    return this.#db.prepare(`SELECT report_kind reportKind,version_sha256 versionSha,html_sha256 htmlSha,pdf_sha256 pdfSha,pdf_unavailable_code pdfUnavailableCode FROM analysis_research_automation_attempt_outputs WHERE attempt_id=? ORDER BY CASE report_kind WHEN 'MARKET' THEN 0 ELSE 1 END`).all(attemptId) as OutputRow[];
  }
  #originalPair(run: RunRow): ResearchAutomationReportPair | undefined {
    const outputs = run.reports.split(',').map(kind => this.#output(run.runId, kind as 'MARKET' | 'INSIGHT'));
    if (outputs.every(item => !item)) return undefined;
    if (outputs.some(item => !item)) throw new ResearchAutomationIntegrityError('Original report pair is incomplete.');
    const rows = outputs as OutputRow[];
    return pairProjection(digest(pairDocument(run, 1, rows)), 1, null, rows);
  }
  async #readAttemptPair(run: RunRow, attempt: AttemptRow): Promise<ResearchAutomationReportPair> {
    if (attempt.runId !== run.runId || attempt.state !== 'COMMITTED' || !attempt.pairId || !attempt.versionNumber)
      throw new ResearchAutomationIntegrityError('Committed report revision is invalid.');
    await this.#readAttemptSources(run, attempt);
    const rows = this.#attemptOutputs(attempt.attemptId);
    if (rows.map(item => item.reportKind).join(',') !== run.reports)
      throw new ResearchAutomationIntegrityError('Committed report pair membership is invalid.');
    const document = await this.#readJson<unknown>(attempt.pairId, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (canonicalJson(document) !== canonicalJson(pairDocument(run, toNumber(attempt.versionNumber), rows, attempt.attemptId)))
      throw new ResearchAutomationIntegrityError('Committed report pair differs from its exact output identities.');
    return pairProjection(attempt.pairId, toNumber(attempt.versionNumber), attempt.attemptId, rows);
  }
  async #readAttemptSources(run: RunRow, attempt: AttemptRow): Promise<FrozenSources> {
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    const accepted = validateRevision(request) && this.#attemptRequest(request.requestKey);
    if (!accepted || accepted.kind !== 'CREATE' || accepted.attemptId !== attempt.attemptId || accepted.sha !== attempt.requestSha ||
        request.previousPairId !== attempt.previousPairId || attempt.runId !== run.runId)
      throw new ResearchAutomationIntegrityError('Revision request identity is inconsistent.');
    const value = await this.#readJson<AutomationConfirmedSourceSet>(attempt.sourceSetSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateSourceSet(value) || value.executionId !== attempt.attemptId || value.requestSha256 !== attempt.requestSha)
      throw new ResearchAutomationIntegrityError('Revision source set identity is inconsistent.');
    if ((request.sources.metric.decision === 'USE_PREPARED' && (value.metric.decision !== 'ADMITTED' || value.metric.sourcePackage.packageId !== request.sources.metric.packageId)) ||
        (request.sources.metric.decision === 'SKIP' && value.metric.decision !== 'SKIPPED') ||
        (request.sources.nativeReview.decision === 'SKIP' && value.nativeReview.decision !== 'SKIPPED'))
      throw new ResearchAutomationIntegrityError('Revision source choices differ from the owner request.');
    const nativeReference = await this.#verifySourceDocument(run, value);
    if (request.sources.nativeReview.decision === 'USE_PACKAGE' && nativeReference?.sourcePackage.packageId !== request.sources.nativeReview.packageId)
      throw new ResearchAutomationIntegrityError('Revision native choice differs from the owner request.');
    if (request.sources.metric.decision === 'KEEP' || request.sources.nativeReview.decision === 'KEEP') {
      const previous = this.#previousAttempt(run, attempt);
      const prior = previous ? await this.#readAttemptSources(run, previous) : await this.#readFrozenSources(run);
      if (prior) {
        if ((request.sources.metric.decision === 'KEEP' && canonicalJson(value.metric) !== canonicalJson(prior.value.metric)) ||
            (request.sources.nativeReview.decision === 'KEEP' && canonicalJson(value.nativeReview) !== canonicalJson(prior.value.nativeReview)))
          throw new ResearchAutomationIntegrityError('Retained source membership drifted across report versions.');
      } else {
        const original = this.#output(run.runId, 'MARKET');
        const semantic = original ? await this.#readJson<Record<string, unknown>>(original.versionSha, MAX_JSON_ARTIFACT_BYTES, 'application/json') : undefined;
        const metric = semantic && isRecord(semantic.metricMethods) ? { decision: 'ADMITTED', sourcePackage: (semantic.metricMethods as unknown as AutomationMetricMethodSnapshot).originalSourcePackage } : { decision: 'ABSENT' };
        const native = (await this.#stepDocument(run.runId, 'COLLECTION'))?.nativeReview;
        const nativeChoice = native ? { decision: 'RESOLVED', referenceSha256: digest(native) } : { decision: 'NONE' };
        if ((request.sources.metric.decision === 'KEEP' && canonicalJson(value.metric) !== canonicalJson(metric)) ||
            (request.sources.nativeReview.decision === 'KEEP' && canonicalJson(value.nativeReview) !== canonicalJson(nativeChoice)))
          throw new ResearchAutomationIntegrityError('Legacy source membership drifted across report versions.');
      }
    }
    return { sha256: attempt.sourceSetSha, value, ...(nativeReference ? { nativeReference } : {}) };
  }
  async #verifySourceDocument(run: RunRow, value: AutomationConfirmedSourceSet, reference?: NativeSourceReviewReference): Promise<NativeSourceReviewReference | undefined> {
    if (!validateSourceSet(value) || value.runId !== run.runId || value.workspaceId !== run.workspaceId ||
        value.startSha256 !== run.startSha || value.scopeSha256 !== run.scopeSha || value.confirmedAt !== run.scopeConfirmedAt || !run.scopeSha || !run.scopeConfirmedAt)
      throw new ResearchAutomationIntegrityError('Source set differs from the frozen research scope.');
    const bound = { runId: run.runId, start: await this.#readStartSnapshot(run.startSha, run.workspaceId),
      scope: await this.#readScopeSnapshot(run.scopeSha, run.workspaceId, run.runId), scopeConfirmedAt: run.scopeConfirmedAt };
    await this.#metricMethods.verifySelection({ ...bound, sourceSelection: metricSelection(value) });
    if (value.nativeReview.decision !== 'RESOLVED') return undefined;
    const native = reference ?? await this.#readJson<NativeSourceReviewReference>(value.nativeReview.referenceSha256, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (digest(native) !== value.nativeReview.referenceSha256) throw new ResearchAutomationIntegrityError('Source reference digest differs.');
    await this.#nativeReviews.readReference(native, bound);
    return native;
  }
  async #reportCollection(runId: string, sources: FrozenSources | undefined, supplemental: boolean): Promise<StepResultDocument | null> {
    const original = await this.#stepDocument(runId, 'COLLECTION');
    if (!supplemental || !sources || !original) return original;
    const { exactShopee: _exact, exactShopeeOutcome: _outcome, nativeReview: _native, ...withoutReviews } = original;
    if (sources.nativeReference) return { ...withoutReviews, nativeReview: sources.nativeReference };
    if (sources.value.nativeReview.decision === 'SKIPPED') return withoutReviews;
    return original;
  }
  #previousAttempt(run: RunRow, attempt: AttemptRow): AttemptRow | undefined {
    const row = this.#db.prepare(`SELECT attempt_id attemptId FROM analysis_research_automation_attempts WHERE run_id=? AND state='COMMITTED' AND pair_sha256=? AND attempt_number<?`).get(run.runId, attempt.previousPairId, attempt.attemptNumber) as { attemptId: string } | undefined;
    if (row) return this.#attempt(row.attemptId)!;
    if (this.#originalPair(run)?.pairId !== attempt.previousPairId)
      throw new ResearchAutomationIntegrityError('Revision predecessor is missing.');
    return undefined;
  }
  async #methodSources(run: RunRow, attempt: AttemptRow, family: 'metric' | 'nativeReview'): Promise<FrozenSources | undefined> {
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateRevision(request)) throw new ResearchAutomationIntegrityError('Revision request fails its closed contract.');
    if (request.sources[family].decision !== 'KEEP') return this.#readAttemptSources(run, attempt);
    const previous = this.#previousAttempt(run, attempt);
    return previous ? this.#methodSources(run, previous, family) : family === 'metric' ? this.#readFrozenSources(run) : undefined;
  }
  async #classifiedRequest(run: RunRow, attempt: AttemptRow): Promise<AutomationClassifiedReportRevisionRequest | undefined> {
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateRevision(request)) throw new ResearchAutomationIntegrityError('Classified revision request failed verification.');
    if ('acceptedMetric' in request) return request;
    if (request.sources.metric.decision !== 'KEEP') return undefined;
    const previous = this.#previousAttempt(run, attempt);
    return previous ? this.#classifiedRequest(run, previous) : undefined;
  }
  async #i14Parent(run: RunRow, attempt?: AttemptRow): Promise<AutomationI14ExecutionParent> {
    if (!attempt) return { kind: 'INITIAL_REPORTS', runId: run.runId };
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateRevision(request)) throw new ResearchAutomationIntegrityError('Insight execution revision request failed verification.');
    return 'acceptedMetric' in request || 'acceptedInsight' in request || 'draftInsight' in request || 'boundedMethods' in request || 'quoteMethods' in request ? this.#i14Parent(run, this.#previousAttempt(run, attempt))
      : { kind: 'SUPPLEMENTAL_ATTEMPT', runId: run.runId, attemptId: attempt.attemptId };
  }
  async #insightCodingRequest(run: RunRow, attempt: AttemptRow): Promise<AutomationInsightReportRevisionRequest | undefined> {
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateRevision(request)) throw new ResearchAutomationIntegrityError('Insight coding revision request failed verification.');
    if ('acceptedInsight' in request) return request;
    if ('draftInsight' in request) return request;
    if (request.sources.nativeReview.decision !== 'KEEP') return undefined;
    const previous = this.#previousAttempt(run, attempt);
    return previous ? this.#insightCodingRequest(run, previous) : undefined;
  }
  async #previousSemantic(run: RunRow, attempt: AttemptRow, kind: 'MARKET' | 'INSIGHT'): Promise<Record<string, unknown>> {
    const report = await this.readReport(run.workspaceId, run.runId, kind, false, attempt.previousPairId);
    return this.#readJson<Record<string, unknown>>(report.versionId, MAX_JSON_ARTIFACT_BYTES, 'application/json');
  }
  #boundedSourceReader(): FoundationSourcePackageReader {
    return new FoundationSourcePackageReader(new SourcePackageService({ db: this.#db, artifactStore: this.#artifacts }));
  }
  #boundedBinding(run: RunRow, request: Pick<AutomationBoundedReportRevisionRequest, 'previousPairId'>): AutomationBoundedMethodSnapshot['binding'] {
    if (!run.scopeSha) throw new ResearchAutomationIntegrityError('Bounded methods require confirmed scope.');
    return { workspaceId: run.workspaceId, runId: run.runId, startSha256: run.startSha,
      scopeSha256: run.scopeSha, previousPairId: request.previousPairId };
  }
  async #loadBoundedMethods(run: RunRow, request: AutomationBoundedReportRevisionRequest): Promise<AutomationBoundedMethodSnapshot | undefined> {
    if (request.boundedMethods.decision === 'SKIP') return undefined;
    await this.#verifySupplementalOrigin(run, request.boundedMethods, 'BOUNDED');
    return buildAutomationBoundedMethods(request.boundedMethods, this.#boundedBinding(run, request), this.#boundedSourceReader());
  }
  async #boundedRequest(run: RunRow, attempt: AttemptRow): Promise<AutomationBoundedReportRevisionRequest | undefined> {
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateRevision(request)) throw new ResearchAutomationIntegrityError('Bounded revision request failed verification.');
    if ('boundedMethods' in request) return request.boundedMethods.decision === 'USE_PACKAGE' ? request : undefined;
    const previous = this.#previousAttempt(run, attempt);
    return previous ? this.#boundedRequest(run, previous) : undefined;
  }
  async #loadQuoteMethods(run: RunRow, request: AutomationQuoteReportRevisionRequest): Promise<AutomationQuoteMethodSnapshot | undefined> {
    if (request.quoteMethods.decision === 'SKIP') return undefined;
    await this.#verifySupplementalOrigin(run, request.quoteMethods, 'QUOTE');
    return buildAutomationQuoteMethods(request.quoteMethods, this.#boundedBinding(run, request), this.#boundedSourceReader());
  }
  /** Manual packages retain the existing explicit-selection policy. Prepared attachments cannot escape their confirmed run/scope. */
  async #verifySupplementalOrigin(run: RunRow, selection: AutomationBoundedMethodSnapshot['selection'], family: 'QUOTE' | 'BOUNDED'): Promise<void> {
    const reader = this.#boundedSourceReader();
    const budget = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 };
    const source = await reader.readFinalizedSourcePackage(selection.packageId, budget);
    const origin = await reader.readAutomationAttachmentOrigin(selection.packageId, budget);
    const prepared = source.manifest.packageKey.startsWith('automation-supplemental:');
    if (!origin) {
      if (prepared) throw new ResearchAutomationIntegrityError('Prepared source origin is missing.');
      return;
    }
    if (!run.scopeSha || origin.manifestArtifactSha256 !== selection.manifestArtifactSha256)
      throw new ResearchAutomationIntegrityError('Prepared source origin failed verification.');
    const start = await this.#readStartSnapshot(run.startSha, run.workspaceId);
    const scope = await this.#readScopeSnapshot(run.scopeSha, run.workspaceId, run.runId);
    if (origin.bindingSha256 !== digest({ runId: run.runId, start, scope }) ||
        (prepared && !source.manifest.packageKey.startsWith(`automation-supplemental:${run.runId}-${family.toLowerCase()}-`)))
      throw new ResearchAutomationValidationError('Prepared source does not belong to this run and method family.');
    if (prepared) {
      const verified = await verifyPreparedSupplementalSource(reader, { runId: run.runId, start, scope }, source);
      if (verified.packageId !== selection.packageId || verified.manifestArtifactSha256 !== selection.manifestArtifactSha256 ||
          verified.packageContentSha256 !== selection.packageContentSha256 || verified.family !== family ||
          verified.descriptorPath !== selection.descriptorPath)
        throw new ResearchAutomationValidationError('Prepared source selection does not match its exact context.');
    }
  }
  async #quoteRequest(run: RunRow, attempt: AttemptRow): Promise<AutomationQuoteReportRevisionRequest | undefined> {
    const request = await this.#readJson<AutomationReportRevisionRequest>(attempt.requestSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (!validateRevision(request)) throw new ResearchAutomationIntegrityError('Quote revision request failed verification.');
    if ('quoteMethods' in request) return request.quoteMethods.decision === 'USE_PACKAGE' ? request : undefined;
    const previous = this.#previousAttempt(run, attempt);
    return previous ? this.#quoteRequest(run, previous) : undefined;
  }
  async #settleAttempt(attemptId: string, state: 'FAILED' | 'CANCELLED'): Promise<void> {
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.prepare(`UPDATE analysis_research_automation_attempts SET state=?,finished_at=? WHERE attempt_id=? AND state='RUNNING'`).run(state, this.#now().toISOString(), attemptId);
    });
  }
  #current(runId: string): RunRow | undefined {
    return this.#db.prepare(`SELECT run_id runId,workspace_id workspaceId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,start_request_sha256 startSha,scope_request_sha256 scopeSha,scope_confirmed_at scopeConfirmedAt,confirmed_source_set_sha256 sourceSetSha,actor_id actorId,created_at createdAt,updated_at updatedAt FROM analysis_research_automation_runs WHERE run_id=?`).get(runId) as RunRow | undefined;
  }
  async #requireRun(workspaceId: string, runId: string): Promise<ResearchAutomationRun> {
    return this.getRun(workspaceId, runId);
  }
  async #readWorkspace(workspaceId: string): Promise<void> {
    try { await this.#workspaces.readVerifiedWorkspace(workspaceId); }
    catch (error) {
      // The declared reader owns Flow's storage and error classes. Translate
      // only its ordinary missing-workspace result; integrity failures must
      // remain integrity failures for callers and operator diagnostics.
      if (error instanceof Error && /(?:workspace|discovery workspace).*(?:not found|does not exist)|unknown workspace/i.test(error.message)) {
        throw new ResearchAutomationNotFoundError('workspace_not_found', 'Workspace not found.');
      }
      throw error;
    }
  }
  #request(requestKey: string): { requestKey: string; runId: string; kind: 'START' | 'CONFIRM' | 'CANCEL'; sha: string } | undefined {
    const value = this.#db.prepare('SELECT request_key requestKey,run_id runId,request_kind kind,request_sha256 sha FROM analysis_research_automation_requests WHERE request_key=?').get(requestKey) as { requestKey: string; runId: string; kind: 'START' | 'CONFIRM' | 'CANCEL'; sha: string } | undefined;
    return value;
  }
  async #retryOrConflict(prior: { runId: string; kind: 'START' | 'CONFIRM' | 'CANCEL'; sha: string }, sha: string, workspaceId: string, kind: 'START' | 'CONFIRM' | 'CANCEL', runId?: string): Promise<ResearchAutomationMutationReceipt> {
    if (prior.sha !== sha || prior.kind !== kind || (runId !== undefined && prior.runId !== runId)) throw new ResearchAutomationConflictError('request_key_conflict', 'This request key is already bound to different content.');
    const run = await this.getRun(workspaceId, prior.runId);
    if (kind === 'CONFIRM') await this.#readFrozenSources(this.#current(prior.runId)!);
    return { contractVersion: 'research-automation-receipt-v1', exactRetry: true, run };
  }

  async #readFrozenSources(run: RunRow): Promise<FrozenSources | undefined> {
    const row = this.#db.prepare(`SELECT execution_id executionId,source_set_sha256 sha256,request_key requestKey,request_sha256 requestSha,start_sha256 startSha,scope_sha256 scopeSha,confirmed_at confirmedAt FROM analysis_research_automation_source_sets WHERE run_id=?`)
      .get(run.runId) as { executionId: string; sha256: string; requestKey: string; requestSha: string; startSha: string; scopeSha: string; confirmedAt: string } | undefined;
    if (!row) {
      if (run.sourceSetSha) throw new ResearchAutomationIntegrityError('Confirmed source membership is missing.');
      return undefined;
    }
    const value = await this.#readJson<AutomationConfirmedSourceSet>(row.sha256, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    const request = this.#request(row.requestKey);
    if (run.sourceSetSha !== row.sha256 || !validateSourceSet(value) || value.runId !== run.runId || value.workspaceId !== run.workspaceId ||
        value.executionId !== row.executionId || value.startSha256 !== row.startSha || value.scopeSha256 !== row.scopeSha ||
        value.requestSha256 !== row.requestSha || value.confirmedAt !== row.confirmedAt ||
        run.startSha !== row.startSha || run.scopeSha !== row.scopeSha || run.scopeConfirmedAt !== row.confirmedAt ||
        !request || request.runId !== run.runId || request.kind !== 'CONFIRM' || request.sha !== row.requestSha)
      throw new ResearchAutomationIntegrityError('Confirmed source set does not match its exact run and request.');
    const input = { runId: run.runId, start: await this.#readStartSnapshot(run.startSha, run.workspaceId),
      scope: await this.#readScopeSnapshot(row.scopeSha, run.workspaceId, run.runId), scopeConfirmedAt: row.confirmedAt };
    await this.#metricMethods.verifySelection({ ...input, sourceSelection: metricSelection(value) });
    if (value.nativeReview.decision !== 'RESOLVED') return { sha256: row.sha256, value };
    const nativeReference = await this.#readJson<NativeSourceReviewReference>(value.nativeReview.referenceSha256, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    await this.#nativeReviews.readReference(nativeReference, input);
    return { sha256: row.sha256, value, nativeReference };
  }
  #transition(runId: string, expectedRevision: number, status: ResearchAutomationRun['status'], at: string): void {
    const result = this.#db.prepare('UPDATE analysis_research_automation_runs SET revision=revision+1,status=?,updated_at=? WHERE run_id=? AND revision=?').run(status, at, runId, expectedRevision);
    if (result.changes !== 1) throw new ResearchAutomationConflictError('revision_conflict', 'The run changed; reload it before continuing.');
  }
  async #putJson(value: unknown, _at: string): Promise<StoredArtifact> {
    const bytes = Buffer.from(canonicalJson(value), 'utf8');
    if (bytes.byteLength > MAX_JSON_ARTIFACT_BYTES) throw new ResearchAutomationValidationError('Research automation input exceeds its bound.');
    return this.#artifacts.put(bytes);
  }
  #registerManifest(artifact: StoredArtifact, mediaType: string, acquiredAt: string): void {
    this.#db.prepare(`INSERT INTO artifact_manifests(sha256,byte_size,media_type,relative_path,acquired_at,contract_version,retention_status,created_at) VALUES (?,?,?,?,?,'1.0.0','active',?) ON CONFLICT(sha256) DO NOTHING`).run(artifact.sha256, artifact.byteSize, mediaType, artifact.relativePath, acquiredAt, acquiredAt);
    const row = this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion,retention_status retentionStatus,acquired_at acquiredAt FROM artifact_manifests WHERE sha256=?').get(artifact.sha256) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string; acquiredAt: string };
    if (BigInt(row.byteSize) !== BigInt(artifact.byteSize) || row.mediaType !== mediaType || row.relativePath !== artifact.relativePath || row.contractVersion !== '1.0.0' || row.retentionStatus !== 'active' || typeof row.acquiredAt !== 'string' || row.acquiredAt.length === 0) throw new ResearchAutomationIntegrityError('Artifact manifest conflict.');
  }
  async #readArtifact(sha: string, maxBytes: number, mediaType: string): Promise<Buffer> {
    const manifest = this.#db.prepare('SELECT byte_size byteSize,media_type mediaType,relative_path relativePath,contract_version contractVersion,retention_status retentionStatus FROM artifact_manifests WHERE sha256=?').get(sha) as { byteSize: bigint; mediaType: string; relativePath: string; contractVersion: string; retentionStatus: string } | undefined;
    if (!manifest) throw new ResearchAutomationIntegrityError('Stored artifact manifest is missing.');
    if (manifest.mediaType !== mediaType || manifest.contractVersion !== '1.0.0' || manifest.retentionStatus !== 'active') throw new ResearchAutomationIntegrityError('Stored artifact manifest metadata is invalid.');
    const bytes = await this.#artifacts.read(sha, { maxBytes });
    if (BigInt(bytes.byteLength) !== BigInt(manifest.byteSize) || manifest.relativePath !== `sha256/${sha.slice(0, 2)}/${sha}`) throw new ResearchAutomationIntegrityError('Stored artifact failed verification.');
    return bytes;
  }
  async #readStartSnapshot(sha: string, workspaceId: string): Promise<StartSnapshot> {
    const value = await this.#readJson<StartSnapshot>(sha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    assertStartSnapshot(value, workspaceId);
    return value;
  }
  async #readScopeSnapshot(sha: string, workspaceId: string, runId: string): Promise<ScopeSnapshot> {
    const value = await this.#readJson<ScopeSnapshot>(sha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    assertScopeSnapshot(value, workspaceId, runId);
    return value;
  }
  async #readStepDocument(sha: string, runId: string, stepId: StepId): Promise<StepResultDocument> {
    const value = await this.#readJson<StepResultDocument>(sha, MAX_JSON_ARTIFACT_BYTES, 'application/vnd.tdn.research-automation.step+json');
    assertStepDocument(value, runId, stepId);
    if (value.exactShopee) {
      const row = this.#current(runId);
      if (stepId !== 'COLLECTION' || !row?.scopeSha || !row.scopeConfirmedAt) throw new ResearchAutomationIntegrityError('Review source lacks confirmed scope.');
      await this.#shopee.read(value.exactShopee, { runId, start: await this.#readStartSnapshot(row.startSha, row.workspaceId),
        scope: await this.#readScopeSnapshot(row.scopeSha, row.workspaceId, runId), scopeConfirmedAt: row.scopeConfirmedAt });
    }
    if (value.nativeReview) {
      const row = this.#current(runId);
      if (stepId !== 'COLLECTION' || value.exactShopee || !row?.scopeSha || !row.scopeConfirmedAt)
        throw new ResearchAutomationIntegrityError('Native review source lacks separate confirmed scope.');
      await this.#nativeReviews.readReference(value.nativeReview, { runId, start: await this.#readStartSnapshot(row.startSha, row.workspaceId),
        scope: await this.#readScopeSnapshot(row.scopeSha, row.workspaceId, runId), scopeConfirmedAt: row.scopeConfirmedAt });
    }
    if (stepId === 'COLLECTION') {
      const sources = await this.#readFrozenSources(this.#current(runId)!);
      if (sources && (sources.value.nativeReview.decision === 'RESOLVED'
          ? digest(value.nativeReview) !== sources.value.nativeReview.referenceSha256 || value.exactShopee !== undefined
          : value.nativeReview !== undefined || (sources.value.nativeReview.decision === 'SKIPPED' && value.exactShopee !== undefined)))
        throw new ResearchAutomationIntegrityError('Collection does not match the confirmed review selection.');
    }
    return value;
  }
  async #readJson<T>(sha: string, maxBytes: number, mediaType: string): Promise<T> {
    let value: unknown;
    const bytes = await this.#readArtifact(sha, maxBytes, mediaType);
    try {
      value = JSON.parse(bytes.toString('utf8'));
      if (!Buffer.from(canonicalJson(value), 'utf8').equals(bytes)) throw new Error('non-canonical');
    } catch { throw new ResearchAutomationIntegrityError('Stored research artifact is invalid or non-canonical.'); }
    return value as T;
  }
  #validUuid(): string { const id = this.#uuid(); assertUuid(id); return id; }
}

function nativeSourceBlocked(step: StepResultDocument, code: 'SOURCE_PACKAGE_RESOLUTION_FAILED' | 'NATIVE_SOURCE_AMBIGUOUS' | 'NATIVE_SOURCE_SCOPE_UNSUPPORTED'): StepResultDocument {
  const note = code === 'NATIVE_SOURCE_AMBIGUOUS'
    ? 'Có nhiều bản thu native của listing này, chưa có lựa chọn nguồn duy nhất. Không tự chọn bản mới nhất hoặc gọi lại nhà cung cấp.'
    : code === 'NATIVE_SOURCE_SCOPE_UNSUPPORTED'
      ? 'Luồng nguồn native hiện chỉ gắn một listing chính xác mỗi lượt. Không tự chọn một listing trong phạm vi nhiều listing.'
      : 'Danh mục nguồn đã lưu không vượt qua kiểm tra. Chưa gắn review; cần kiểm tra nguồn, không tự thu lại bằng nguồn khác.';
  return { ...step, outcome: step.outcome === 'SUCCEEDED' || step.outcome === 'PARTIAL' ? 'PARTIAL' : 'FAILED',
    coverage: [...step.coverage, { provider: 'apify-dami', dataset: 'retained-listing-review-subset', state: 'FAILED',
      observedStartDate: null, observedEndDate: null, truncated: false, note }],
    limitations: [...step.limitations, { provider: 'apify-dami', code, message: note }] };
}

function assertStartSnapshot(value: unknown, workspaceId: string): asserts value is StartSnapshot {
  if (!isRecord(value) || value.contractVersion !== 'research-automation-start-snapshot-v1' || value.workspaceId !== workspaceId || value.country !== 'VN' ||
      (value.mode !== 'PRODUCT' && value.mode !== 'CATEGORY') || typeof value.keyword !== 'string' || value.keyword.length < 1 || value.keyword.length > 120 ||
      (value.description !== null && (typeof value.description !== 'string' || value.description.length > 2000 || LONG_CONTROL.test(value.description))) || (value.interview !== null && !isRecord(value.interview)) ||
      !isRecord(value.requestedPeriod) || typeof value.requestedPeriod.startDate !== 'string' || typeof value.requestedPeriod.endDate !== 'string' ||
      !validDate(value.requestedPeriod.startDate) || !validDate(value.requestedPeriod.endDate) || value.requestedPeriod.endDate < value.requestedPeriod.startDate ||
      value.requestedPeriod.dayCount !== inclusiveDays({ startDate: value.requestedPeriod.startDate, endDate: value.requestedPeriod.endDate }) ||
      !Array.isArray(value.reports) || (value.reports.length !== 1 && value.reports.length !== 2) ||
      value.reports.some((item) => item !== 'MARKET' && item !== 'INSIGHT') || new Set(value.reports).size !== value.reports.length ||
      (value.reports.length === 2 && (value.reports[0] !== 'MARKET' || value.reports[1] !== 'INSIGHT'))) throw new ResearchAutomationIntegrityError('Stored start snapshot has inconsistent identity.');
}

function assertScopeSnapshot(value: unknown, workspaceId: string, runId: string): asserts value is ScopeSnapshot {
  if (!isRecord(value) || value.contractVersion !== 'research-automation-scope-snapshot-v1' || value.workspaceId !== workspaceId || value.runId !== runId ||
      typeof value.definition !== 'string' || value.definition.length < 1 || value.definition.length > 2000 || LONG_CONTROL.test(value.definition) || !stringArray(value.includeTerms, 30, 80) ||
      !stringArray(value.excludeTerms, 30, 80) || !stringArray(value.selectedProductIds, 4, 160) || !stringArray(value.peerProductIds, 8, 160)) {
    throw new ResearchAutomationIntegrityError('Stored scope snapshot has inconsistent identity.');
  }
  if (value.exactShopeeUrls !== undefined) {
    try { validateExactUrls(value.exactShopeeUrls); } catch { throw new ResearchAutomationIntegrityError('Stored exact listing scope is invalid.'); }
  }
}

function assertStepDocument(value: unknown, runId: string, stepId: StepId): asserts value is StepResultDocument {
  const outcomes = new Set(['SUCCEEDED', 'PARTIAL', 'UNAVAILABLE', 'FAILED', 'CANCELLED', 'INTERRUPTED']);
  if (!isRecord(value) || value.contractVersion !== 'research-automation-step-result-v1' || value.runId !== runId || value.stepId !== stepId || !outcomes.has(String(value.outcome)) ||
      !Array.isArray(value.productCards) || !Array.isArray(value.comparables) || !Array.isArray(value.coverage) || !Array.isArray(value.limitations)) throw new ResearchAutomationIntegrityError('Stored step result has inconsistent identity.');
  if (value.exactShopee !== undefined && (!isRecord(value.exactShopee) || !UUID.test(String(value.exactShopee.collectionId)) ||
      !/^[a-f0-9]{64}$/.test(String(value.exactShopee.collectionSha256)) || !/^[a-f0-9]{64}$/.test(String(value.exactShopee.requestSha256)))) throw new ResearchAutomationIntegrityError('Stored exact collection reference is invalid.');
  if (value.nativeReview !== undefined && (value.exactShopee !== undefined || !isRecord(value.nativeReview) ||
      value.nativeReview.contractVersion !== 'automation-native-review-reference-v1' || value.nativeReview.runId !== runId ||
      stepId !== 'COLLECTION' || !/^[a-f0-9]{64}$/.test(String(value.nativeReview.bindingSha256))))
    throw new ResearchAutomationIntegrityError('Stored native source reference is invalid.');
  if (value.exactShopeeOutcome !== undefined && (stepId !== 'COLLECTION' || value.exactShopee === undefined || !isRecord(value.exactShopeeOutcome) ||
      !EXACT_SHOPEE_OUTCOMES.includes(value.exactShopeeOutcome.outcome as ExactShopeeOutcome) || typeof value.exactShopeeOutcome.reused !== 'boolean' ||
      typeof value.exactShopeeOutcome.attemptedAt !== 'string' || !Number.isFinite(Date.parse(value.exactShopeeOutcome.attemptedAt)) ||
      (value.exactShopeeOutcome.providerMessage !== null && (typeof value.exactShopeeOutcome.providerMessage !== 'string' ||
        value.exactShopeeOutcome.providerMessage.length > MAX_PROVIDER_MESSAGE_LENGTH)) ||
      !Array.isArray(value.exactShopeeOutcome.listings) || value.exactShopeeOutcome.listings.length < 1 || value.exactShopeeOutcome.listings.length > 5 ||
      value.exactShopeeOutcome.listings.some(item => !isRecord(item) || typeof item.listingUrl !== 'string' || !item.listingUrl.startsWith('https://shopee.vn/') ||
        item.listingUrl.length > 2000 || !Number.isSafeInteger(item.reviews) || item.reviews < 0)))
    throw new ResearchAutomationIntegrityError('Stored exact review outcome is invalid.');
  if (value.webResults !== undefined && (stepId !== 'COLLECTION' || !Array.isArray(value.webResults) || value.webResults.length > MAX_WEB_RESULTS ||
      value.webResults.some(item => !isRecord(item) || !Number.isSafeInteger(item.position) || item.position < 1 ||
        typeof item.title !== 'string' || item.title.length < 1 || item.title.length > 300 ||
        typeof item.url !== 'string' || item.url.length > 2000 || !item.url.startsWith('https://') ||
        (item.snippet !== null && (typeof item.snippet !== 'string' || item.snippet.length > 1000)) ||
        (item.site != null && (typeof item.site !== 'string' || item.site.length > 200)) ||
        (item.published != null && (typeof item.published !== 'string' || item.published.length > 100)) ||
        typeof item.retrievedAt !== 'string' || !Number.isFinite(Date.parse(item.retrievedAt)) ||
        !Number.isSafeInteger(item.captureIndex) || item.captureIndex < 0)))
    throw new ResearchAutomationIntegrityError('Stored web results are invalid.');
  for (const comparable of value.comparables) {
    if (!isRecord(comparable) || typeof comparable.productId !== 'string' || typeof comparable.provider !== 'string' || (comparable.metric !== 'GMV_VND' && comparable.metric !== 'UNITS_SOLD') ||
        typeof comparable.value !== 'string' || !isRecord(comparable.window) || typeof comparable.window.startDate !== 'string' || typeof comparable.window.endDate !== 'string' ||
        !validDate(comparable.window.startDate) || !validDate(comparable.window.endDate) || !Number.isSafeInteger(comparable.captureIndex) || comparable.captureIndex < 0) throw new ResearchAutomationIntegrityError('Stored comparable lineage is invalid.');
  }
}

function assertCaptureEnvelope(value: Record<string, unknown>, row: CaptureRow): void {
  if (value.contractVersion !== 'research-automation-capture-v1' || typeof value.captureId !== 'string' || typeof value.provider !== 'string' || value.provider.toLowerCase() !== row.provider ||
      typeof value.operation !== 'string' || value.operation.toLowerCase() !== row.operation || value.completedAt !== row.retrievedAt ||
      !sameWindow(value.queryWindow, row.windowStart, row.windowEnd)) throw new ResearchAutomationIntegrityError('Stored capture lineage does not match its capture row.');
}

function assertCaptureLineage(document: StepResultDocument, captures: readonly CaptureRecord[]): void {
  const stepCaptures = new Map(captures.filter((capture) => capture.stepId === document.stepId).map(capture => [capture.ordinal, capture]));
  for (const comparable of document.comparables) {
    const capture = stepCaptures.get(comparable.captureIndex);
    if (!capture || capture.truncated || capture.provider !== comparable.provider.toLowerCase() ||
        capture.window?.startDate !== comparable.window.startDate || capture.window.endDate !== comparable.window.endDate) throw new ResearchAutomationIntegrityError('Stored comparable references an incompatible capture.');
  }
  for (const result of document.webResults ?? []) {
    const capture = stepCaptures.get(result.captureIndex);
    if (!capture || capture.truncated || capture.retrievedAt !== result.retrievedAt) throw new ResearchAutomationIntegrityError('Stored web result references an incompatible capture.');
  }
}

/** Bounded capture envelopes of one source result; null rejects the source as a whole. */
function captureEnvelopes(result: PersistableSourceResult['result']): Array<{ capture: ProviderRawCapture; body: Buffer }> | null {
  if (result && (!Array.isArray(result.captures) || result.captures.length > MAX_CAPTURES_PER_STEP)) return null;
  const out: Array<{ capture: ProviderRawCapture; body: Buffer }> = [];
  for (const capture of result?.captures ?? []) {
    if ((capture.requestBodyBytes?.byteLength ?? 0) > MAX_CAPTURE_BYTES || (capture.responseBytes?.byteLength ?? 0) > MAX_CAPTURE_BYTES) return null;
    const body = captureEnvelope(capture);
    if (body.byteLength > MAX_CAPTURE_ENVELOPE_BYTES) return null;
    out.push({ capture, body });
  }
  return out;
}

function sameWindow(value: unknown, start: string | null, end: string | null): boolean {
  if (start === null || end === null) return value === null;
  return isRecord(value) && value.startDate === start && value.endDate === end;
}

function isRecord(value: unknown): value is Record<string, any> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function stringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems && value.every((item) => typeof item === 'string' && item.length >= 1 && item.length <= maxLength && !CONTROL.test(item) && new Set(value).size === value.length);
}

function validateStart(value: unknown): ResearchAutomationStartRequest {
  const object = plain(value); keys(object, ['contractVersion', 'requestKey', 'mode', 'keyword', 'description', 'requestedPeriod', 'reports', 'interview']);
  if (object.contractVersion !== 'research-automation-start-v1' || typeof object.requestKey !== 'string' || !REQUEST_KEY.test(object.requestKey)) throw new ResearchAutomationValidationError('Invalid start request.');
  if (object.mode !== 'PRODUCT' && object.mode !== 'CATEGORY') throw new ResearchAutomationValidationError('Invalid research mode.');
  const keyword = text(object.keyword, 120); const period = validatePeriod(object.requestedPeriod); const reports = validateReports(object.reports);
  const output: ResearchAutomationStartRequest = { contractVersion: 'research-automation-start-v1', requestKey: object.requestKey, mode: object.mode, keyword, requestedPeriod: period, reports };
  if (object.description !== undefined) output.description = text(object.description, 2000, true);
  if (object.interview !== undefined) output.interview = validateInterview(object.interview);
  return output;
}
function validateConfirm(value: unknown): ResearchAutomationConfirmRequest { const object = plain(value); keys(object, ['contractVersion', 'requestKey', 'expectedRevision', 'definition', 'includeTerms', 'excludeTerms', 'selectedProductIds', 'peerProductIds', 'exactShopeeUrls']); if (object.contractVersion !== 'research-automation-confirm-v1' || typeof object.requestKey !== 'string' || !REQUEST_KEY.test(object.requestKey) || !Number.isSafeInteger(object.expectedRevision) || object.expectedRevision < 1) throw new ResearchAutomationValidationError('Invalid scope confirmation request.'); return { contractVersion: 'research-automation-confirm-v1', requestKey: object.requestKey, expectedRevision: object.expectedRevision, definition: text(object.definition, 2000, true), includeTerms: terms(object.includeTerms), excludeTerms: terms(object.excludeTerms), selectedProductIds: productIds(object.selectedProductIds, 4), peerProductIds: productIds(object.peerProductIds, 8), ...(object.exactShopeeUrls !== undefined ? { exactShopeeUrls: validateExactUrls(object.exactShopeeUrls) } : {}) }; }
function validateScopeConfirmation(value: unknown): ResearchAutomationConfirmRequest | ResearchAutomationSourceConfirmRequest {
  if (!isRecord(value) || value.contractVersion !== 'research-automation-confirm-v2') return validateConfirm(value);
  if (!validateSourceConfirm(value)) throw new ResearchAutomationValidationError('Invalid source-bound scope confirmation.');
  const { sources, ...scope } = value;
  const normalized = validateConfirm({ ...scope, contractVersion: 'research-automation-confirm-v1' });
  const result = { ...normalized, contractVersion: 'research-automation-confirm-v2', sources };
  if (!validateSourceConfirm(result)) throw new ResearchAutomationValidationError('Invalid normalized source-bound confirmation.');
  return result;
}
function metricSelection(set: AutomationConfirmedSourceSet) {
  return { executionId: set.executionId, sourcePackage: set.metric.decision === 'ADMITTED' ? set.metric.sourcePackage : null };
}
function validateExactUrls(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 5) throw new ResearchAutomationValidationError('Choose up to five exact Shopee product URLs.');
  const urls = value.map(item => text(item, 2000));
  if (!urls.length) return [];
  try { selectExactShopeeListings({ contractVersion: '2.0.0', runKey: 'scope-validation', topic: 'URL validation', selectionBasis: 'OWNER_EXACT_URL',
    source: { label: 'Scope validation only', acquiredAt: '2026-01-01T00:00:00.000Z' }, productUrls: urls }); }
  catch { throw new ResearchAutomationValidationError('Use distinct https://shopee.vn product links containing shop and item IDs.'); }
  return urls;
}
function validateCancel(value: unknown): ResearchAutomationCancelRequest { const object = plain(value); keys(object, ['contractVersion', 'requestKey', 'expectedRevision']); if (object.contractVersion !== 'research-automation-cancel-v1' || typeof object.requestKey !== 'string' || !REQUEST_KEY.test(object.requestKey) || !Number.isSafeInteger(object.expectedRevision) || object.expectedRevision < 1) throw new ResearchAutomationValidationError('Invalid cancellation request.'); return { contractVersion: 'research-automation-cancel-v1', requestKey: object.requestKey, expectedRevision: object.expectedRevision }; }
function validatePeriod(value: unknown): { startDate: string; endDate: string } { const object = plain(value); keys(object, ['startDate', 'endDate']); if (typeof object.startDate !== 'string' || typeof object.endDate !== 'string' || !DATE.test(object.startDate) || !DATE.test(object.endDate) || !validDate(object.startDate) || !validDate(object.endDate)) throw new ResearchAutomationValidationError('Research period must use valid calendar dates.'); const days = inclusiveDays(object as { startDate: string; endDate: string }); if (days < 1 || days > 1096 || object.endDate > todayVN()) throw new ResearchAutomationValidationError('Research period is out of bounds.'); return { startDate: object.startDate, endDate: object.endDate }; }
function validateReports(value: unknown): ResearchAutomationStartRequest['reports'] { if (!Array.isArray(value) || (value.length !== 1 && value.length !== 2) || value.some((item) => item !== 'MARKET' && item !== 'INSIGHT') || new Set(value).size !== value.length || (value.length === 2 && (value[0] !== 'MARKET' || value[1] !== 'INSIGHT'))) throw new ResearchAutomationValidationError('Choose MARKET, INSIGHT, or both in that order.'); return value as ResearchAutomationStartRequest['reports']; }
function validateInterview(value: unknown): NonNullable<ResearchAutomationStartRequest['interview']> { const object = plain(value); keys(object, ['productType', 'audience', 'useCase', 'priceRange', 'knownProduct']); const output: Record<string, string> = {}; for (const key of ['productType', 'audience', 'useCase', 'priceRange', 'knownProduct']) if (object[key] !== undefined) output[key] = text(object[key], 200); return output; }
function terms(value: unknown): string[] { if (!Array.isArray(value) || value.length > 30) throw new ResearchAutomationValidationError('Scope terms are out of bounds.'); const values = value.map((item) => text(item, 80)); if (new Set(values).size !== values.length) throw new ResearchAutomationValidationError('Scope terms must be unique.'); return values; }
function productIds(value: unknown, max: number): string[] { if (!Array.isArray(value) || value.length > max) throw new ResearchAutomationValidationError('Product selections are out of bounds.'); const values = value.map((item) => { const id = text(item, 160); if (!/^[a-z0-9-]{1,40}:[A-Za-z0-9._~-]{1,118}$/.test(id)) throw new ResearchAutomationValidationError('Invalid product selection.'); return id; }); if (new Set(values).size !== values.length) throw new ResearchAutomationValidationError('Product selections must be unique.'); return values; }
function plain(value: unknown): Record<string, any> { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new ResearchAutomationValidationError('Request must be a JSON object.'); return value as Record<string, any>; }
function keys(value: Record<string, any>, allowed: readonly string[]): void { const set = new Set(allowed); if (Object.keys(value).some((key) => !set.has(key))) throw new ResearchAutomationValidationError('Request contains an unsupported field.'); }
function text(value: unknown, max: number, allowLongTextControls = false): string { if (typeof value !== 'string') throw new ResearchAutomationValidationError('Text field is invalid.'); const output = value.normalize('NFC').trim(); if (!output || output.length > max || (allowLongTextControls ? LONG_CONTROL.test(output) : CONTROL.test(output))) throw new ResearchAutomationValidationError('Text field is invalid.'); return output; }
function inclusiveDays(period: { startDate: string; endDate: string }): number { const start = Date.parse(`${period.startDate}T00:00:00Z`); const end = Date.parse(`${period.endDate}T00:00:00Z`); if (!Number.isFinite(start) || !Number.isFinite(end)) return -1; return Math.floor((end - start) / 86_400_000) + 1; }
function validDate(value: string): boolean { const time = Date.parse(`${value}T00:00:00Z`); return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value; }
function todayVN(): string { const date = new Date(Date.now() + 7 * 3_600_000); return date.toISOString().slice(0, 10); }
function digest(value: unknown): string { return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex'); }
function pairDocument(run: RunRow, versionNumber: number, outputs: readonly OutputRow[], attemptId?: string) {
  return { contractVersion: 'automation-report-pair-v1', runId: run.runId, workspaceId: run.workspaceId,
    startSha256: run.startSha, scopeSha256: run.scopeSha, versionNumber, ...(attemptId ? { attemptId } : {}),
    outputs: [...outputs].sort((a, b) => a.reportKind === b.reportKind ? 0 : a.reportKind === 'MARKET' ? -1 : 1) };
}
function pairProjection(pairId: string, versionNumber: number, attemptId: string | null, rows: readonly OutputRow[]): ResearchAutomationReportPair {
  return { pairId, versionNumber, attemptId, outputs: rows.map(row => ({ kind: row.reportKind, versionId: row.versionSha, pdfAvailable: row.pdfSha !== null })) };
}
function revisionReceipt(attempt: AttemptRow, exactRetry: boolean): ResearchAutomationRevisionReceipt {
  return { attemptId: attempt.attemptId, attemptNumber: toNumber(attempt.attemptNumber), state: attempt.state, pairId: attempt.pairId, exactRetry };
}
function toNumber(value: bigint | number): number { const number = typeof value === 'bigint' ? Number(value) : value; if (!Number.isSafeInteger(number)) throw new ResearchAutomationIntegrityError('Stored integer is out of bounds.'); return number; }
function assertUuid(value: string): void { if (!UUID.test(value)) throw new ResearchAutomationValidationError('ID must be a UUID.'); }
function captureEnvelope(capture: ProviderRawCapture): Buffer { const value = { contractVersion: 'research-automation-capture-v1', ...capture, requestBodyBytesBase64: capture.requestBodyBytes?.toString('base64') ?? null, responseBytesBase64: capture.responseBytes?.toString('base64') ?? null }; delete (value as { requestBodyBytes?: unknown }).requestBodyBytes; delete (value as { responseBytes?: unknown }).responseBytes; return Buffer.from(canonicalJson(value), 'utf8'); }
function blockerList(steps: readonly StepRow[], documents: ReadonlyMap<StepId, StepResultDocument>, scopeConfirmed: boolean): ResearchAutomationRun['blockers'] {
  const blockers: ResearchAutomationRun['blockers'] = [];
  if (scopeConfirmed) blockers.push({ code: 'SCOPE_FILTERS_NOT_APPLIED', scope: 'RUN', provider: null, message: message('SCOPE_FILTERS_NOT_APPLIED') });
  for (const step of steps) if (step.code) blockers.push({ code: step.code, scope: 'RUN', provider: null, message: safeStepMessage(step.code) });
  const executed = new Set<string>();
  for (const document of documents.values()) {
    for (const limitation of document.limitations) blockers.push({ code: limitation.code, scope: 'SOURCE', provider: limitation.provider, message: limitation.message });
    for (const source of document.coverage) {
      executed.add(source.provider);
      if (source.state !== 'COLLECTED') blockers.push({ code: coverageBlocker(source.state), scope: 'SOURCE', provider: source.provider, message: source.note ?? `Coverage is ${source.state.toLowerCase()}.` });
    }
  }
  // These are deliberately visible as non-executed source lanes. They prevent
  // a single configured provider from being mistaken for complete coverage.
  const notExecuted: Array<[string, string, string]> = [
    ['KALODATA', 'kalodata', 'KALODATA_NOT_EXECUTED'],
    ['SERPAPI', 'serpapi', 'SERPAPI_NOT_EXECUTED'],
    ['METRIC', 'metric', 'METRIC_MANUAL_EXPORT_REQUIRED'],
    ['APIFY_SHOPEE', 'apify-shopee', 'SHOPEE_PRODUCT_DETAIL_CONNECTOR_UNVERIFIED'],
  ];
  for (const [providerName, provider, code] of notExecuted) if (!executed.has(provider.toLowerCase())) blockers.push({ code, scope: 'SOURCE', provider, message: `${providerName} source was not executed for this run.` });
  return dedupeBlockers(blockers);
}
function coverageBlocker(state: ResearchAutomationCoverageSource['state']): string { return state === 'UNAVAILABLE' ? 'PROVIDER_NOT_CONFIGURED' : `COVERAGE_${state}`; }
function dedupeBlockers(values: ResearchAutomationRun['blockers']): ResearchAutomationRun['blockers'] { const seen = new Set<string>(); return values.filter((value) => { const key = `${value.code}:${value.scope}:${value.provider ?? ''}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
function safeStepMessage(code: string): string { try { return message(code); } catch { return 'This step has a recorded limitation; review the source coverage and run again if needed.'; } }
function defaultRenderedReport(input: ResearchAutomationReportInput, kind: 'MARKET' | 'INSIGHT'): ResearchAutomationRenderedReport { const title = kind === 'MARKET' ? 'Market research draft' : 'Insight research draft'; const escape = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]!)); const semantic = { contractVersion: 'research-automation-report-v1', kind, runId: input.run.runId, workspaceId: input.run.workspaceId, status: 'UNREVIEWED', scope: input.scope.definition, blockers: input.run.blockers }; const html = Buffer.from(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title></head><body><h1>${escape(title)}</h1><p>Draft, unreviewed. Scope: ${escape(input.scope.definition)}</p><p>Evidence remains source-bound; no unsupported totals were inferred.</p></body></html>`, 'utf8'); return { semantic, html, pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' }; }
