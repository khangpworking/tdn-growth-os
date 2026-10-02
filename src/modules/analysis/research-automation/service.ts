import { createHash, randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';
import type { DescriptiveMarketMethods } from '../../../../contracts/analysis/descriptive-market-methods.generated.js';
import { AutomationDescriptiveMethodBridge } from './descriptive-method-bridge.js';
import { AutomationMarketMethodBridge, type AutomationMarketMethodSnapshot } from './market-method-bridge.js';
import { AutomationLocatedReviewBridge, type AutomationLocatedReviewSnapshot } from './located-review-bridge.js';
import { AutomationExactShopeeBridge, type ExactShopeeAttempt, type ShopeeCollectorFactory } from './exact-shopee-bridge.js';
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
  readonly descriptiveMethods?: DescriptiveMarketMethods;
  readonly descriptiveMethodFailure?: 'DESCRIPTIVE_METHOD_FAILED';
  readonly reviewCorpus?: ResearchReviewCorpus;
  readonly reviewCorpusFailure?: 'REVIEW_CORPUS_FAILED' | 'REVIEW_CORPUS_REPORT_TOO_LARGE';
  readonly locatedReview?: AutomationLocatedReviewSnapshot;
  readonly locatedReviewFailure?: 'LOCATED_REVIEW_METHOD_FAILED';
  readonly marketInventory?: AutomationMarketMethodSnapshot;
  readonly marketInventoryFailure?: 'MARKET_INVENTORY_FAILED';
}
/** Alias retained for the report module's public renderer signature. */
export type AutomationReportInput = ResearchAutomationReportInput;

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
  readonly renderer?: ResearchAutomationReportRenderer;
  readonly now?: () => Date;
  readonly uuid?: () => string;
  readonly actorId?: string;
  readonly shopeeCollectorFactory?: ShopeeCollectorFactory;
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
}
interface StepRow { runId: string; stepId: StepId; state: ResearchAutomationRun['steps'][number]['state']; code: string | null; resultSha: string | null; startedAt: string | null; finishedAt: string | null }
interface CaptureRow { stepId: SourceStepId; ordinal: bigint | number; artifactSha: string; mediaType: string; provider: string; operation: string; retrievedAt: string; windowStart: string | null; windowEnd: string | null; truncated: number | bigint }
interface UsageRow { stepId: SourceStepId; ordinal: bigint | number; provider: string; operation: string; requestCount: bigint | number; costState: 'KNOWN' | 'UNKNOWN'; costUnit: 'USD' | 'CREDITS' | null; costAmount: string | null }
interface OutputRow { reportKind: 'MARKET' | 'INSIGHT'; versionSha: string; htmlSha: string; pdfSha: string | null; pdfUnavailableCode: 'PDF_RENDERER_NOT_CONFIGURED' | 'PDF_RENDER_FAILED' | null }
interface PersistableSourceResult {
  readonly unsettledProvider?: string;
  result: BoundQuickSearchResult['result'] | BoundCollectResult['result'] | null;
  step: StepResultDocument;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const REQUEST_KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const CONTROL = /[\u0000-\u001f\u007f]/;
const LONG_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const MAX_BODY_TEXT = 2_000;

export class ResearchAutomationService {
  readonly #db: Database.Database;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #workspaces: DiscoveryWorkspaceReader;
  readonly #source: AutomationSourcePort | undefined;
  readonly #renderer: ResearchAutomationReportRenderer | undefined;
  readonly #now: () => Date;
  readonly #uuid: () => string;
  readonly #actorId: string;
  readonly #methods: AutomationDescriptiveMethodBridge;
  readonly #locatedReviews: AutomationLocatedReviewBridge;
  readonly #shopee: AutomationExactShopeeBridge;
  readonly #marketInventory: AutomationMarketMethodBridge;
  readonly #active = new Map<string, AbortController>();

  constructor(options: ResearchAutomationServiceOptions) {
    this.#db = options.db;
    this.#artifacts = options.artifactStore;
    this.#workspaces = options.workspaceReader;
    this.#source = options.source;
    this.#renderer = options.renderer;
    this.#now = options.now ?? (() => new Date());
    this.#uuid = options.uuid ?? randomUUID;
    this.#actorId = options.actorId ?? 'research-automation-worker';
    this.#methods = new AutomationDescriptiveMethodBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#locatedReviews = new AutomationLocatedReviewBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
    this.#shopee = new AutomationExactShopeeBridge(this.#db, this.#artifacts, options.shopeeCollectorFactory);
    this.#marketInventory = new AutomationMarketMethodBridge({ db: this.#db, artifactStore: this.#artifacts, now: this.#now });
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

  async confirmScope(workspaceId: string, runId: string, value: unknown): Promise<ResearchAutomationMutationReceipt> {
    const input = validateConfirm(value);
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
      const stored = await this.#putJson(scope, confirmedAt);
      this.#db.transaction(() => {
        this.#registerManifest(stored, 'application/json', confirmedAt);
        this.#db.prepare(`UPDATE analysis_research_automation_runs SET revision=revision+1,status='COLLECTION_QUEUED',scope_request_sha256=?,scope_confirmed_at=?,updated_at=? WHERE run_id=? AND revision=?`)
          .run(stored.sha256, confirmedAt, confirmedAt, runId, input.expectedRevision);
        this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='QUEUED' WHERE run_id=? AND step_id='COLLECTION'`).run(runId);
        this.#db.prepare(`INSERT INTO analysis_research_automation_requests(request_key,run_id,request_kind,request_sha256,accepted_at) VALUES (?,?,?,?,?)`)
          .run(input.requestKey, runId, 'CONFIRM', requestSha, confirmedAt);
      })();
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

  async getRun(workspaceId: string, runId: string): Promise<ResearchAutomationRun> {
    assertUuid(workspaceId); assertUuid(runId);
    const row = this.#db.prepare(`SELECT run_id runId,workspace_id workspaceId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,
      start_request_sha256 startSha,scope_request_sha256 scopeSha,scope_confirmed_at scopeConfirmedAt,actor_id actorId,created_at createdAt,updated_at updatedAt
      FROM analysis_research_automation_runs WHERE run_id=? AND workspace_id=?`).get(runId, workspaceId) as RunRow | undefined;
    if (!row) {
      await this.#readWorkspace(workspaceId);
      throw new ResearchAutomationNotFoundError('run_not_found', 'Research run not found.');
    }
    return this.#projection(row);
  }

  async readReport(workspaceId: string, runId: string, kind: 'MARKET' | 'INSIGHT', pdf = false): Promise<ResearchAutomationReadReport> {
    const run = await this.getRun(workspaceId, runId);
    const output = this.#output(runId, kind);
    if (!output) throw new ResearchAutomationNotFoundError(pdf ? 'pdf_not_available' : 'report_not_available', pdf ? 'PDF is not available for this run.' : 'Report is not available for this run.');
    if (pdf && !output.pdfSha) throw new ResearchAutomationNotFoundError('pdf_not_available', 'PDF is not available for this run.');
    // Verify the immutable semantic version before serving either representation;
    // the output row must point at a canonical report for this exact run/kind.
    const semantic = await this.#readJson<Record<string, unknown>>(output.versionSha, MAX_JSON_ARTIFACT_BYTES, 'application/json');
    if (semantic.contractVersion !== 'research-automation-report-v1' || semantic.runId !== runId || semantic.workspaceId !== workspaceId || semantic.kind !== kind) {
      throw new ResearchAutomationIntegrityError('Stored report semantic artifact has inconsistent identity.');
    }
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
      const collection = await this.#stepDocument(runId, 'COLLECTION');
      if (kind !== 'INSIGHT' || !frozen?.scopeSha || !frozen.scopeConfirmedAt || !collection?.exactShopee) throw new ResearchAutomationIntegrityError('Stored corpus lacks exact run lineage.');
      await this.#shopee.verifyCorpus(semantic.reviewCorpus, collection.exactShopee, { runId,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId), scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId), scopeConfirmedAt: frozen.scopeConfirmedAt });
    }
    if (semantic.locatedReview !== undefined && semantic.locatedReview !== null) {
      const frozen = this.#current(runId);
      const collection = await this.#stepDocument(runId, 'COLLECTION');
      if (kind !== 'INSIGHT' || !semantic.reviewCorpus || !frozen?.scopeSha || !frozen.scopeConfirmedAt || !collection?.exactShopee)
        throw new ResearchAutomationIntegrityError('Stored located review lacks its verified source and frozen run.');
      await this.#locatedReviews.verify(semantic.locatedReview, { runId, reference: collection.exactShopee,
        start: await this.#readStartSnapshot(frozen.startSha, workspaceId), scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId),
        scopeConfirmedAt: frozen.scopeConfirmedAt });
    }
    if (semantic.marketInventory !== undefined && semantic.marketInventory !== null) {
      const frozen = this.#current(runId);
      if (kind !== 'MARKET' || !frozen?.scopeSha) throw new ResearchAutomationIntegrityError('Stored Market inventory lacks scope.');
      await this.#marketInventory.verify(semantic.marketInventory, { runId, start: await this.#readStartSnapshot(frozen.startSha, workspaceId),
        scope: await this.#readScopeSnapshot(frozen.scopeSha, workspaceId, runId), collection: await this.#stepDocument(runId, 'COLLECTION'), captures: await this.#captureRecords(runId) });
    }
    const sha = pdf ? output.pdfSha! : output.htmlSha;
    const bytes = await this.#readArtifact(sha, pdf ? 64 * 1024 * 1024 : MAX_HTML_BYTES, pdf ? 'application/pdf' : 'text/html; charset=utf-8');
    if (pdf && !bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new ResearchAutomationIntegrityError('Stored PDF has an invalid header.');
    return { kind, versionId: output.versionSha, bytes, mediaType: pdf ? 'application/pdf' : 'text/html; charset=utf-8' };
  }

  /** Worker entry point: claims and settles at most one durable step. */
  async processNext(signal?: AbortSignal): Promise<boolean> {
    const row = this.#db.prepare(`SELECT run_id runId,workspace_id workspaceId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,
      start_request_sha256 startSha,scope_request_sha256 scopeSha,scope_confirmed_at scopeConfirmedAt,actor_id actorId,created_at createdAt,updated_at updatedAt
      FROM analysis_research_automation_runs WHERE status IN ('QUICK_SEARCH_QUEUED','COLLECTION_QUEUED','RENDERING') ORDER BY created_at,run_id LIMIT 1`).get() as RunRow | undefined;
    if (!row) return false;
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
      if (controller.signal.aborted) {
        await this.#settleSourceFailure(row.runId, stepId, 'CANCELLED_DURING_PROVIDER_OPERATION', 'CANCELLED');
        return true;
      }
      if (stepId === 'COLLECTION' && !scope?.selectedProductIds.length && !scope?.peerProductIds.length && !scope?.exactShopeeUrls?.length) {
        // An explicit "none" selection still yields a draft, but nothing was
        // requested, so the step must not read as a successful collection.
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
        if (stepId !== 'COLLECTION' || !scope?.exactShopeeUrls?.length || controller.signal.aborted) {
          await this.#settleSourceFailure(row.runId, stepId, controller.signal.aborted ? 'CANCELLED_DURING_PROVIDER_OPERATION' : 'PROVIDER_FAILED', controller.signal.aborted ? 'CANCELLED' : 'FAILED');
          return true;
        }
        result = { result: null, unsettledProvider: source!.id.toLowerCase(), step: { ...invalidProviderStep(row.runId, stepId), limitations: [{ code: 'PROVIDER_FAILED', provider: source!.id.toLowerCase(), message: 'Lượt nguồn chưa có biên nhận hoàn tất. Số request và chi phí chưa đối soát; tổng request chỉ gồm các lượt đã ghi nhận.' }] } };
      }
      let exact: ExactShopeeAttempt | undefined;
      if (stepId === 'COLLECTION' && scope?.exactShopeeUrls?.length && !controller.signal.aborted) {
        exact = await this.#shopee.collect({ runId: row.runId, start, scope, scopeConfirmedAt: row.scopeConfirmedAt! }, controller.signal);
      }
      try {
        await this.#persistSourceResult(row.runId, stepId, result, controller.signal.aborted, exact);
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

  async #executeReports(row: RunRow, externalSignal?: AbortSignal): Promise<boolean> {
    const current = this.#current(row.runId);
    if (!current || current.status !== 'RENDERING') return false;
    const controller = new AbortController();
    this.#active.set(row.runId, controller);
    const onAbort = () => controller.abort();
    externalSignal?.addEventListener('abort', onAbort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    try {
    const at = this.#now().toISOString();
    let claimed = false;
    await withDatabaseMutationMutex(this.#db, async () => {
      const fresh = this.#current(row.runId);
      if (!fresh || fresh.status !== 'RENDERING') return;
      this.#transition(row.runId, toNumber(fresh.revision), 'RENDERING', at);
      this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='RUNNING',started_at=?,message_code=NULL WHERE run_id=? AND step_id='REPORTS' AND state='QUEUED'`).run(at, row.runId);
      claimed = true;
    });
    if (!claimed) return false;
    if (controller.signal.aborted) {
      await this.#settleSourceFailure(row.runId, 'REPORTS', 'CANCELLED_DURING_REPORT_RENDERING', 'CANCELLED');
      return true;
    }
    const fresh = this.#current(row.runId);
    if (!fresh) return false;
    const start = await this.#readStartSnapshot(fresh.startSha, fresh.workspaceId);
    const scope = fresh.scopeSha ? await this.#readScopeSnapshot(fresh.scopeSha, fresh.workspaceId, fresh.runId) : null;
    if (!scope) { await this.#settleSourceFailure(row.runId, 'REPORTS', 'REPORT_RENDER_FAILED', 'FAILED'); return true; }
    const run = await this.getRun(fresh.workspaceId, fresh.runId);
    const collection = await this.#stepDocument(fresh.runId, 'COLLECTION');
    const captures = await this.#captureRecords(fresh.runId);
    const outputArtifacts: Array<{ kind: 'MARKET' | 'INSIGHT'; semantic: StoredArtifact; html: StoredArtifact; pdf: StoredArtifact | null; pdfCode: 'PDF_RENDERER_NOT_CONFIGURED' | 'PDF_RENDER_FAILED' | null }> = [];
    try {
      controller.signal.throwIfAborted();
      let descriptiveMethods: DescriptiveMarketMethods | undefined;
      let descriptiveMethodFailure: 'DESCRIPTIVE_METHOD_FAILED' | undefined;
      let marketInventory: AutomationMarketMethodSnapshot | undefined;
      let marketInventoryFailure: 'MARKET_INVENTORY_FAILED' | undefined;
      let reviewCorpus: ResearchReviewCorpus | undefined;
      let reviewCorpusFailure: 'REVIEW_CORPUS_FAILED' | undefined;
      let locatedReview: AutomationLocatedReviewSnapshot | undefined;
      let locatedReviewFailure: 'LOCATED_REVIEW_METHOD_FAILED' | undefined;
      if (start.reports.includes('INSIGHT') && collection?.exactShopee) {
        try { reviewCorpus = await this.#shopee.corpus(collection.exactShopee, { runId: fresh.runId, start, scope, scopeConfirmedAt: fresh.scopeConfirmedAt! }); }
        catch { controller.signal.throwIfAborted(); reviewCorpusFailure = 'REVIEW_CORPUS_FAILED'; }
        if (reviewCorpus) {
          try { locatedReview = await this.#locatedReviews.execute({ runId: fresh.runId, start, scope,
            scopeConfirmedAt: fresh.scopeConfirmedAt!, reference: collection.exactShopee }, controller.signal); }
          catch { controller.signal.throwIfAborted(); locatedReviewFailure = 'LOCATED_REVIEW_METHOD_FAILED'; }
        }
      }
      if (start.reports.includes('MARKET')) {
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
      for (const kind of start.reports) {
        if (controller.signal.aborted) throw new Error('aborted');
        let input: ResearchAutomationReportInput = { run, start, scope, captures,
          collection: kind === 'MARKET' && descriptiveMethodFailure && collection ? { ...collection, comparables: [] } : collection,
          ...(kind === 'MARKET' && descriptiveMethods ? { descriptiveMethods } : {}),
          ...(kind === 'MARKET' && descriptiveMethodFailure ? { descriptiveMethodFailure } : {}),
          ...(kind === 'INSIGHT' && reviewCorpus ? { reviewCorpus } : {}),
          ...(kind === 'INSIGHT' && reviewCorpusFailure ? { reviewCorpusFailure } : {}),
          ...(kind === 'INSIGHT' && locatedReview ? { locatedReview } : {}),
          ...(kind === 'INSIGHT' && locatedReviewFailure ? { locatedReviewFailure } : {}),
          ...(kind === 'MARKET' && marketInventory ? { marketInventory } : {}),
          ...(kind === 'MARKET' && marketInventoryFailure ? { marketInventoryFailure } : {}),
        };
        const render = async () => {
          const rendered = this.#renderer ? await this.#renderer(input, kind, controller.signal) : defaultRenderedReport(input, kind);
          controller.signal.throwIfAborted();
          if (typeof rendered.semantic !== 'object' || rendered.semantic === null || Array.isArray(rendered.semantic)) throw new ResearchAutomationIntegrityError('Research report semantic output is not an object.');
          // Method persistence is owned here, not delegated to an optional presentation adapter.
          const reportSemantic = { ...rendered.semantic, ...(kind === 'MARKET' && descriptiveMethods ? { descriptiveMethods } : {}),
            ...(kind === 'MARKET' && descriptiveMethodFailure ? { descriptiveMethodFailure } : {}),
            ...(kind === 'INSIGHT' ? { reviewCorpus: input.reviewCorpus ?? null } : {}),
            ...(kind === 'INSIGHT' && input.reviewCorpusFailure ? { reviewCorpusFailure: input.reviewCorpusFailure } : {}),
            ...(kind === 'INSIGHT' ? { locatedReview: input.locatedReview ?? null } : {}),
            ...(kind === 'INSIGHT' && input.locatedReviewFailure ? { locatedReviewFailure: input.locatedReviewFailure } : {}),
            ...(kind === 'MARKET' && marketInventory ? { marketInventory } : {}),
            ...(kind === 'MARKET' && marketInventoryFailure ? { marketInventoryFailure } : {}) };
          const semanticBytes = Buffer.from(canonicalJson(reportSemantic), 'utf8');
          const html = Buffer.from(rendered.html);
          return { rendered, semanticBytes, html };
        };
        let prepared = await render();
        if (kind === 'INSIGHT' && input.reviewCorpus && (prepared.semanticBytes.byteLength > MAX_JSON_ARTIFACT_BYTES || prepared.html.byteLength > MAX_HTML_BYTES)) {
          // Keep the entire admitted raw collection. Do not truncate quotes or
          // fail the independent Market report because this view is too large.
          const { reviewCorpus: _oversizedCorpus, locatedReview: _oversizedLocated, ...withoutCorpus } = input;
          input = { ...withoutCorpus, reviewCorpusFailure: 'REVIEW_CORPUS_REPORT_TOO_LARGE' };
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
        outputArtifacts.push({ kind, semantic, html: htmlArtifact, pdf, pdfCode: pdf ? null : rendered.pdfUnavailableCode ?? 'PDF_RENDERER_NOT_CONFIGURED' });
      }
    } catch {
      const current = this.#current(row.runId);
      if (!current || TERMINAL_STATUSES.has(current.status)) return true;
      await this.#settleSourceFailure(row.runId, 'REPORTS', controller.signal.aborted ? 'CANCELLED_DURING_REPORT_RENDERING' : 'REPORT_RENDER_FAILED', controller.signal.aborted ? 'CANCELLED' : 'FAILED');
      return true;
    }
    const beforeSave = this.#current(row.runId);
    if (!beforeSave || TERMINAL_STATUSES.has(beforeSave.status)) return true;
    const finished = this.#now().toISOString();
    try {
      await withDatabaseMutationMutex(this.#db, async () => {
        this.#db.transaction(() => {
          const current = this.#current(row.runId);
          if (!current || TERMINAL_STATUSES.has(current.status)) return;
          controller.signal.throwIfAborted();
          for (const output of outputArtifacts) {
            this.#registerManifest(output.semantic, 'application/json', finished);
            this.#registerManifest(output.html, 'text/html; charset=utf-8', finished);
            if (output.pdf) this.#registerManifest(output.pdf, 'application/pdf', finished);
            this.#db.prepare(`INSERT INTO analysis_research_automation_outputs(run_id,report_kind,version_sha256,html_sha256,pdf_sha256,pdf_unavailable_code,created_at) VALUES (?,?,?,?,?,?,?)`)
              .run(row.runId, output.kind, output.semantic.sha256, output.html.sha256, output.pdf?.sha256 ?? null, output.pdf ? null : output.pdfCode, finished);
          }
          this.#transition(row.runId, toNumber(current.revision), 'DRAFT_READY', finished);
          this.#db.prepare(`UPDATE analysis_research_automation_steps SET state='SUCCEEDED',finished_at=? WHERE run_id=? AND step_id='REPORTS' AND state='RUNNING'`).run(finished, row.runId);
        })();
      });
    } catch (error) {
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
      this.#active.delete(row.runId);
    }
  }

  async #persistSourceResult(runId: string, stepId: SourceStepId, bound: PersistableSourceResult, aborted: boolean, exact?: ExactShopeeAttempt): Promise<void> {
    const result = bound.result;
    let step = bound.step;
    const now = this.#now().toISOString();
    const captures: Array<{ row: CaptureRecord; artifact: StoredArtifact }> = [];
    let envelopes: Array<{ capture: NonNullable<PersistableSourceResult['result']>['captures'][number]; body: Buffer }> = [];
    try {
      if (result && (!Array.isArray(result.captures) || result.captures.length > MAX_CAPTURES_PER_STEP)) throw new ResearchAutomationProviderOutputError('Provider returned too many captures.');
      envelopes = (result?.captures ?? []).map(capture => {
        if ((capture.requestBodyBytes?.byteLength ?? 0) > MAX_CAPTURE_BYTES || (capture.responseBytes?.byteLength ?? 0) > MAX_CAPTURE_BYTES) throw new ResearchAutomationProviderOutputError('Provider capture exceeds its retention bound.');
        const body = captureEnvelope(capture);
        if (body.byteLength > MAX_CAPTURE_ENVELOPE_BYTES) throw new ResearchAutomationProviderOutputError('Provider capture envelope exceeds its retention bound.');
        return { capture, body };
      });
    } catch (error) {
      if (!(error instanceof ResearchAutomationProviderOutputError)) throw error;
      // Reject this source as a whole, not an arbitrary truncated prefix. The
      // independent exact collection and its cost receipt must still survive.
      step = invalidProviderStep(runId, stepId);
    }
    for (const [ordinal, { capture, body }] of envelopes.entries()) {
      const artifact = await this.#artifacts.put(body);
      captures.push({ row: {
        stepId, ordinal, artifactSha256: artifact.sha256, mediaType: 'application/vnd.tdn.research-automation.capture+json', provider: capture.provider.toLowerCase(),
        operation: capture.operation.toLowerCase(), retrievedAt: capture.completedAt, window: capture.queryWindow, truncated: false,
      }, artifact });
    }
    try {
      assertStepDocument(step, runId, stepId);
      assertCaptureLineage(step, captures.map(value => value.row));
    } catch {
      // Retain the bounded exchange and usage even when its normalized output
      // cannot be admitted. No invalid observation enters a report.
      step = invalidProviderStep(runId, stepId);
    }
    if (exact) step = { ...step,
      outcome: exact.coverage.state === 'FAILED' || exact.coverage.state === 'CANCELLED'
        ? step.outcome === 'SUCCEEDED' || step.outcome === 'PARTIAL' ? 'PARTIAL' : exact.coverage.state
        : exact.reference ? (step.outcome === 'SUCCEEDED' && exact.coverage.state === 'COLLECTED' ? 'SUCCEEDED' : 'PARTIAL') : step.outcome === 'SUCCEEDED' ? 'PARTIAL' : step.outcome,
      coverage: [...step.coverage, exact.coverage], limitations: [...step.limitations, exact.limitation],
      ...(exact.reference ? { exactShopee: exact.reference } : {}) };
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
        if (exact) this.#db.prepare(`INSERT INTO analysis_research_automation_usage(run_id,step_id,ordinal,provider,operation,request_count,cost_state,cost_unit,cost_amount,recorded_at) VALUES (?,?,1,'apify-shopee','reviews',?,?,?,?,?)`)
          .run(runId, stepId, exact.requestsIssued, exact.costUsd === null ? 'UNKNOWN' : 'KNOWN', exact.costUsd === null ? null : 'USD', exact.costUsd, now);
        const current = this.#current(runId);
        if (!current) throw new ResearchAutomationIntegrityError('Run disappeared while saving source output.');
        // close()/restart may have already settled this run as INTERRUPTED.
        // Keep the exact late capture and usage rows, but never reopen a
        // terminal run or mutate its interrupted step.
        if (TERMINAL_STATUSES.has(current.status)) return;
        const outcome = aborted || result?.status === 'CANCELLED' || current.status === 'CANCELLING' ? 'CANCELLED' : step.outcome;
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

  #persistUsage(runId: string, stepId: SourceStepId, result: { readonly provider: string; readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: string; readonly consumed?: number } } }, at: string): void {
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
      .run(runId, stepId, 0, provider, operation, usage.requestsIssued, costState, costUnit, costAmount, at);
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
    const blockers = blockerList(steps, documents, scope !== null);
    const outputRows = this.#db.prepare(`SELECT report_kind reportKind,version_sha256 versionSha,html_sha256 htmlSha,pdf_sha256 pdfSha,pdf_unavailable_code pdfUnavailableCode FROM analysis_research_automation_outputs WHERE run_id=?`).all(row.runId) as OutputRow[];
    const outputs = outputRows.length === 0 ? undefined : Object.fromEntries(outputRows.map((value) => [value.reportKind === 'MARKET' ? 'market' : 'insight', { versionId: value.versionSha, web: true as const, pdf: { available: value.pdfSha !== null, reason: value.pdfSha ? null : message(value.pdfUnavailableCode ?? 'PDF_RENDERER_NOT_CONFIGURED') } }])) as ResearchAutomationRun['outputs'];
    return {
      contractVersion: 'research-automation-run-v1', runId: row.runId, workspaceId: row.workspaceId, revision: toNumber(row.revision), status: row.status, country: 'VN', mode: row.mode, keyword: row.keyword,
      description: start.description, interview: start.interview, requestedPeriod: start.requestedPeriod, reports: start.reports as ResearchAutomationRun['reports'],
      definition: scope ? { definition: scope.definition, includeTerms: [...scope.includeTerms], excludeTerms: [...scope.excludeTerms], selectedProductIds: [...scope.selectedProductIds], peerProductIds: [...scope.peerProductIds], confirmedAt: row.scopeConfirmedAt!, ...(scope.exactShopeeUrls !== undefined ? { exactShopeeUrls: [...scope.exactShopeeUrls] } : {}) } : null,
      productCards: [...cards], coverage: { requestedPeriod: start.requestedPeriod, sources: [...coverageSources] }, usage: { entries: usageEntries, requestCount: usageEntries.reduce((total, value) => total + value.requestCount, 0), knownCosts: knownCosts.slice(0, 2), hasUnknownCost: usageEntries.some((value) => value.cost.state === 'UNKNOWN') },
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
  #current(runId: string): RunRow | undefined {
    return this.#db.prepare(`SELECT run_id runId,workspace_id workspaceId,revision,status,mode,keyword,period_start periodStart,period_end periodEnd,reports,start_request_sha256 startSha,scope_request_sha256 scopeSha,scope_confirmed_at scopeConfirmedAt,actor_id actorId,created_at createdAt,updated_at updatedAt FROM analysis_research_automation_runs WHERE run_id=?`).get(runId) as RunRow | undefined;
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
    return { contractVersion: 'research-automation-receipt-v1', exactRetry: true, run };
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
