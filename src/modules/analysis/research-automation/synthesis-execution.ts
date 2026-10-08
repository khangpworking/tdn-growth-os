import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import type Database from 'better-sqlite3';
import type { ContentAddressedArtifactStore, StoredArtifact } from '../../../platform/artifacts/artifact-store.js';
import { registerManifest } from '../../../platform/artifacts/register-manifest.js';
import { withDatabaseMutationMutex } from '../../../platform/db/index.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { ResearchAutomationIntegrityError } from './model.js';

/**
 * Shared Analysis-owned AI synthesis execution kernel. It is the only writer of
 * `analysis_research_automation_ai_executions`. Each section supplies one typed adapter for its schemas, admission,
 * input, prompt, configuration and candidate validation; the kernel owns parent binding, retention, the single
 * dispatch claim, settlement, query-only replay and restart recovery. It is not a report ledger.
 */

export type AutomationSynthesisSectionId = 'I14' | 'I15' | 'M11' | 'M12' | 'INSIGHT_CODING';
export type AutomationSynthesisReportKind = 'INSIGHT' | 'MARKET';
/** Report-kind compatibility of each section's execution parent. */
export const AUTOMATION_SYNTHESIS_REPORT_KIND: Readonly<Record<AutomationSynthesisSectionId, AutomationSynthesisReportKind>> = {
  I14: 'INSIGHT', I15: 'INSIGHT', M11: 'MARKET', M12: 'MARKET', INSIGHT_CODING: 'INSIGHT',
};

export type AutomationSynthesisExecutionParent =
  | { readonly kind: 'INITIAL_REPORTS'; readonly runId: string }
  | { readonly kind: 'SUPPLEMENTAL_ATTEMPT'; readonly runId: string; readonly attemptId: string }
  | { readonly kind: 'INSIGHT_CODING'; readonly runId: string; readonly adoptionId: string;
      readonly requestKey: string; readonly previousProposalId: string | null };

export interface AutomationSynthesisIdentity {
  readonly runId: string;
  readonly workspaceId: string;
  readonly scopeSha256: string;
}

/** Fields the kernel reads from a retained, schema-valid configuration to bound the single dispatch. */
export interface AutomationSynthesisDispatchConfiguration {
  readonly timeoutMs: number;
  readonly maxResponseBytes: number;
}

export interface AutomationSynthesisTextRequest<Configuration> {
  readonly configuration: Configuration;
  readonly systemText: string;
  /** The exact retained synthesis-input artifact bytes as UTF-8 text. */
  readonly userText: string;
  /** Aborted on caller cancellation or `configuration.timeoutMs`. The outcome is then unknown, never retried. */
  readonly signal: AbortSignal;
}

/** Explicit text transport. It returns only the generated text; credentials and provider payloads stay inside it. */
export interface AutomationSynthesisTextPort<Configuration> {
  generateText(request: AutomationSynthesisTextRequest<Configuration>): Promise<{ readonly text: string }>;
}

export interface AutomationSynthesisExecutionRequest<Source, Configuration> {
  readonly parent: AutomationSynthesisExecutionParent;
  /** The exact frozen inputs the owning report execution built this section's admission from. */
  readonly source: Source;
  /** Resolved section transport and non-secret configuration, or null when not configured. Never consulted to replay a settled execution. */
  readonly ai: { readonly port: AutomationSynthesisTextPort<Configuration>; readonly configuration: Configuration } | null;
  readonly signal?: AbortSignal | undefined;
}

/** Kernel-classified response defects, shared by every section. */
export type AutomationSynthesisResponseCode = 'RESPONSE_NOT_TEXT' | 'RESPONSE_TOO_LARGE' | 'RESPONSE_NOT_JSON';
export type AutomationSynthesisUnknownCode = 'INTERRUPTED_AFTER_CLAIM' | 'TRANSPORT_OUTCOME_AMBIGUOUS' | 'RESPONSE_NOT_RETAINED';
const RESPONSE_CODES: ReadonlySet<string> = new Set<AutomationSynthesisResponseCode>(['RESPONSE_NOT_TEXT', 'RESPONSE_TOO_LARGE', 'RESPONSE_NOT_JSON']);
const UNKNOWN_CODES: ReadonlySet<string> = new Set<AutomationSynthesisUnknownCode>(['INTERRUPTED_AFTER_CLAIM', 'TRANSPORT_OUTCOME_AMBIGUOUS', 'RESPONSE_NOT_RETAINED']);

/** Validated, retained candidates. Structure and references passed; every candidate stays HUMAN_REVIEW_REQUIRED. */
export interface AutomationSynthesisRetainedCandidates<Candidates> {
  readonly artifact: Candidates;
  readonly bytes: Buffer;
  readonly sha256: string;
}

export type AutomationSynthesisExecutionOutcome<Candidates, Code extends string> =
  | { readonly status: 'NOT_DISPATCHED'; readonly reason: 'INSUFFICIENT_EVIDENCE' | 'AI_NOT_CONFIGURED' }
  | { readonly status: 'PREPARED'; readonly executionId: string }
  | { readonly status: 'VALID'; readonly executionId: string; readonly dispatched: boolean; readonly candidates: AutomationSynthesisRetainedCandidates<Candidates> }
  | { readonly status: 'INVALID'; readonly executionId: string; readonly dispatched: boolean; readonly validationCode: AutomationSynthesisResponseCode | Code }
  | { readonly status: 'DISPATCH_UNKNOWN'; readonly executionId: string; readonly dispatched: boolean; readonly unknownCode: AutomationSynthesisUnknownCode };

export type AutomationSynthesisExecutionView<Candidates, Code extends string> =
  | AutomationSynthesisExecutionOutcome<Candidates, Code>
  | { readonly status: 'ABSENT' }
  | { readonly status: 'DISPATCHING'; readonly executionId: string };

/** Recorded lifecycle only. A dispatch claim is not proof of provider receipt or billing. */
export interface AutomationSynthesisActivity {
  states: { prepared: number; dispatching: number; completed: number; dispatchUnknown: number };
  outcomes: { valid: number; invalid: number };
  billing: { state: 'UNKNOWN' | 'NOT_DISPATCHED' };
}

export type AutomationSynthesisExecutionErrorCode =
  | 'PARENT_NOT_FOUND' | 'PARENT_RUN_MISMATCH' | 'PARENT_WORKSPACE_MISMATCH' | 'PARENT_SCOPE_MISMATCH'
  | 'PARENT_REPORTS_EXCLUDE_INSIGHT' | 'PARENT_REPORTS_EXCLUDE_MARKET' | 'PARENT_NOT_RUNNING' | 'INVALID_SYNTHESIS_CONFIGURATION'
  | 'EXECUTION_IDENTITY_CONFLICT' | 'EXECUTION_IN_PROGRESS' | 'ACTIVE_DISPATCH_IN_PROCESS';
/** Safe default error for adapters without a historical error class. */
export class AutomationSynthesisExecutionError extends Error {
  constructor(readonly code: AutomationSynthesisExecutionErrorCode) { super(code); }
}
/** Retained-record integrity failure. Never reported as a model INVALID outcome. */
export class AutomationSynthesisExecutionIntegrityError extends ResearchAutomationIntegrityError {
  constructor(message = 'Synthesis execution retained record failed integrity verification.') { super(message); }
}

/** One retained JSON artifact kind: its manifest/read bound and its canonical-schema guard (strict AJV). */
export interface AutomationSynthesisArtifactCodec<T> {
  readonly maxBytes: number;
  readonly validate: (value: unknown) => value is T;
}

/** Type bundle of one section adapter. */
export interface AutomationSynthesisAdapterTypes {
  /** Exact frozen caller inputs, including the admission version selector. */
  readonly source: unknown;
  /** The admission or packet artifact retained as `admission_sha256`. */
  readonly admission: unknown;
  readonly input: unknown;
  readonly prompt: unknown;
  readonly configuration: AutomationSynthesisDispatchConfiguration;
  readonly candidates: unknown;
  /** Closed response-content validation codes this adapter may report as INVALID. */
  readonly validationCode: string;
}

export interface AutomationSynthesisBuild<T extends AutomationSynthesisAdapterTypes> {
  readonly admission: T['admission'];
  readonly admissionBytes: Buffer;
  /** Exact model-facing input bytes, or null when nothing is eligible to send. */
  readonly inputBytes: Buffer | null;
  /** When an adapter has versioned inputs, retain the corresponding prompt on new preparation. */
  readonly promptBytes?: Buffer;
}

export interface AutomationSynthesisRetainedArtifacts<T extends AutomationSynthesisAdapterTypes> {
  readonly admission: T['admission'];
  readonly admissionBytes: Buffer;
  readonly input: T['input'];
  readonly inputBytes: Buffer;
  readonly prompt: T['prompt'];
  readonly promptBytes: Buffer;
  readonly configuration: T['configuration'];
  readonly configurationBytes: Buffer;
}

export type AutomationSynthesisResponseVerdict<T extends AutomationSynthesisAdapterTypes> =
  | { readonly status: 'VALID'; readonly candidates: { readonly artifact: T['candidates']; readonly bytes: Buffer } }
  | { readonly status: 'INVALID'; readonly code: T['validationCode'] };

/**
 * Section adapter. Every function is pure (no database, store, clock or provider access). Artifact bytes are
 * `canonicalJson(value) + '\n'`; the kernel rejects retained bytes that are not in that form.
 */
export interface AutomationSynthesisAdapter<T extends AutomationSynthesisAdapterTypes> {
  readonly sectionId: AutomationSynthesisSectionId;
  readonly admission: AutomationSynthesisArtifactCodec<T['admission']>;
  readonly input: AutomationSynthesisArtifactCodec<T['input']>;
  readonly prompt: AutomationSynthesisArtifactCodec<T['prompt']>;
  readonly configuration: AutomationSynthesisArtifactCodec<T['configuration']>;
  readonly candidatesMaxBytes: number;
  readonly validationCodes: ReadonlySet<T['validationCode']>;
  /** Exact frozen prompt bytes retained by a new preparation only. An existing row always uses its retained prompt. */
  readonly promptBytes: Buffer;
  executionError(code: AutomationSynthesisExecutionErrorCode): Error;
  integrityError(): AutomationSynthesisExecutionIntegrityError;
  /** Build the admission and model-facing input from exact sources. May throw its own validation errors. */
  build(source: T['source']): AutomationSynthesisBuild<T>;
  identity(admission: T['admission']): AutomationSynthesisIdentity;
  /** The same sources selecting the admission version saved in a retained admission. Must not throw. */
  atRetainedVersion(source: T['source'], admission: T['admission']): T['source'];
  /** Cross-artifact bindings of schema-valid retained artifacts. Return false (never throw) on mismatch. */
  bindsRetained(retained: AutomationSynthesisRetainedArtifacts<T>, expected: AutomationSynthesisIdentity & { readonly admissionSha256: string }): boolean;
  systemText(prompt: T['prompt']): string;
  /**
   * Classify a parsed untrusted response. Return INVALID only for a declared closed code. Throw for anything that is
   * not a model-response defect; after a dispatch that becomes DISPATCH_UNKNOWN, never INVALID.
   */
  classifyResponse(parsed: unknown, source: T['source']): AutomationSynthesisResponseVerdict<T>;
  /** Rebuild retained candidates from their parsed artifact; `source` is at the retained version. Undefined or throw is integrity. */
  replayCandidates(stored: unknown, source: T['source'], retained: AutomationSynthesisRetainedArtifacts<T>):
    { readonly artifact: T['candidates']; readonly bytes: Buffer } | undefined;
}

const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
const json = (value: unknown): Buffer => Buffer.from(`${canonicalJson(value)}\n`, 'utf8');

/**
 * Claimed dispatches in this process, per SQLite file (keyed like the mutation mutex), shared by every section
 * adapter. Recovery refuses while any is active, so one adapter can never settle another's live dispatch.
 */
const activeDispatches = new Map<string, Set<string>>();
const databaseKey = (db: Database.Database): string => path.resolve(db.name);
function addActiveDispatch(db: Database.Database, executionId: string): void {
  const key = databaseKey(db);
  activeDispatches.set(key, (activeDispatches.get(key) ?? new Set<string>()).add(executionId));
}
function deleteActiveDispatch(db: Database.Database, executionId: string): void {
  const key = databaseKey(db);
  const active = activeDispatches.get(key);
  if (active?.delete(executionId) && !active.size) activeDispatches.delete(key);
}

interface ExecutionRow {
  readonly execution_id: string; readonly state: 'PREPARED' | 'DISPATCHING' | 'COMPLETED' | 'DISPATCH_UNKNOWN';
  readonly workspace_id: string; readonly scope_sha256: string;
  readonly admission_sha256: string; readonly input_sha256: string; readonly prompt_sha256: string; readonly configuration_sha256: string;
  readonly validation_status: 'VALID' | 'INVALID' | null; readonly validation_code: string | null;
  readonly candidates_sha256: string | null; readonly unknown_code: string | null;
}
const ROW_COLUMNS = `execution_id, state, workspace_id, scope_sha256, admission_sha256, input_sha256, prompt_sha256, configuration_sha256,
  validation_status, validation_code, candidates_sha256, unknown_code`;

type Settlement<T extends AutomationSynthesisAdapterTypes> =
  | { readonly state: 'COMPLETED'; readonly status: 'VALID'; readonly candidates: { readonly artifact: T['candidates']; readonly bytes: Buffer }; readonly stored: StoredArtifact }
  | { readonly state: 'COMPLETED'; readonly status: 'INVALID'; readonly code: AutomationSynthesisResponseCode | T['validationCode'] }
  | { readonly state: 'DISPATCH_UNKNOWN'; readonly code: AutomationSynthesisUnknownCode };
const unknown = (code: AutomationSynthesisUnknownCode): { readonly state: 'DISPATCH_UNKNOWN'; readonly code: AutomationSynthesisUnknownCode } =>
  ({ state: 'DISPATCH_UNKNOWN', code });

/**
 * Execution subrecord for one exact parent (the initial REPORTS step or one supplemental report attempt) and one
 * section. It retains exact admission, input, prompt and configuration before a durable dispatch claim, makes at
 * most one dispatch per execution identity and replays a settled outcome without a call. It never publishes a
 * report, ranks, approves or records an owner direction. Do not call it while holding the database mutation mutex.
 */
export class AutomationSynthesisExecutionKernel<T extends AutomationSynthesisAdapterTypes> {
  readonly #db: Database.Database;
  readonly #store: ContentAddressedArtifactStore;
  readonly #now: () => Date;
  readonly #uuid: () => string;
  readonly #adapter: AutomationSynthesisAdapter<T>;
  readonly #reportKind: AutomationSynthesisReportKind;

  constructor(options: {
    db: Database.Database; artifactStore: ContentAddressedArtifactStore; now: () => Date; uuid?: (() => string) | undefined;
    adapter: AutomationSynthesisAdapter<T>;
  }) {
    if (!Object.hasOwn(AUTOMATION_SYNTHESIS_REPORT_KIND, options.adapter.sectionId)) throw new TypeError('SYNTHESIS_SECTION_UNSUPPORTED');
    this.#db = options.db;
    this.#store = options.artifactStore;
    this.#now = options.now;
    this.#uuid = options.uuid ?? randomUUID;
    this.#adapter = options.adapter;
    this.#reportKind = AUTOMATION_SYNTHESIS_REPORT_KIND[options.adapter.sectionId];
  }

  /** Write owner: prepare/claim a running parent once, or replay a settled exact-parent outcome without current AI config. */
  async execute(request: AutomationSynthesisExecutionRequest<T['source'], T['configuration']>): Promise<AutomationSynthesisExecutionOutcome<T['candidates'], T['validationCode']>> {
    const adapter = this.#adapter;
    let built = adapter.build(request.source);
    const ai = request.ai;

    const prepared = await withDatabaseMutationMutex(this.#db, async (): Promise<AutomationSynthesisExecutionOutcome<T['candidates'], T['validationCode']> | string> => {
      // A settled row is authoritative and may be replayed after the parent has
      // stopped running or current transport configuration has disappeared. The
      // non-running identity check still binds the caller to the owned parent;
      // the running check is reserved for preparation and dispatch claims.
      this.#verifyParent(request.parent, built.admission, false);
      const row = this.#row(request.parent);
      if (row) {
        const retained = await this.#readRetainedExecution(row, request.parent);
        built = adapter.build(adapter.atRetainedVersion(request.source, retained.admission));
        this.#assertIdentity(row, built);
        if (row.state === 'DISPATCHING') throw adapter.executionError('EXECUTION_IN_PROGRESS');
        if (row.state !== 'PREPARED') return this.#settled(row, request.source, retained);
        this.#verifyParent(request.parent, built.admission, true);
        const configurationBytes = this.#configurationBytes(ai);
        if (!configurationBytes) return { status: 'PREPARED', executionId: row.execution_id };
        if (row.prompt_sha256 !== sha256(retained.promptBytes) || row.configuration_sha256 !== sha256(configurationBytes))
          throw adapter.executionError('EXECUTION_IDENTITY_CONFLICT');
        return row.execution_id;
      }
      this.#verifyParent(request.parent, built.admission, true);
      const inputBytes = built.inputBytes;
      if (!inputBytes) return { status: 'NOT_DISPATCHED', reason: 'INSUFFICIENT_EVIDENCE' };
      const configurationBytes = this.#configurationBytes(ai);
      if (!configurationBytes) return { status: 'NOT_DISPATCHED', reason: 'AI_NOT_CONFIGURED' };
      // Plain content-addressed storage; manifest registration keeps each artifact's first acquired_at.
      const stored: StoredArtifact[] = [];
      for (const bytes of [built.admissionBytes, inputBytes, built.promptBytes ?? adapter.promptBytes, configurationBytes]) stored.push(await this.#store.put(bytes));
      const identity = adapter.identity(built.admission);
      const executionId = this.#uuid();
      const at = this.#now().toISOString();
      this.#db.transaction(() => {
        for (const artifact of stored) {
          registerManifest(this.#db, artifact, at);
          this.#manifest(artifact.sha256, artifact.byteSize);
        }
        this.#verifyParent(request.parent, built.admission, true);
        const codingParent = request.parent.kind === 'INSIGHT_CODING' ? request.parent : null;
        this.#db.prepare(`INSERT INTO analysis_research_automation_ai_executions
          (execution_id, run_id, attempt_id, section_id, workspace_id, scope_sha256, admission_sha256, input_sha256, prompt_sha256,
           configuration_sha256, state, created_at${codingParent ? ', coding_adoption_id, coding_request_key, coding_previous_proposal_id' : ''})
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PREPARED', ?${codingParent ? ', ?, ?, ?' : ''})`).run(
          executionId, request.parent.runId, request.parent.kind === 'SUPPLEMENTAL_ATTEMPT' ? request.parent.attemptId : null,
          adapter.sectionId, identity.workspaceId, identity.scopeSha256, ...stored.map(({ sha256: digest }) => digest), at,
          ...(codingParent ? [codingParent.adoptionId, codingParent.requestKey, codingParent.previousProposalId] : []));
      }).immediate();
      return executionId;
    });
    if (typeof prepared !== 'string') return prepared;
    const executionId = prepared;

    // Cancellation before the claim leaves an undispatched PREPARED row that a same-identity retry may claim.
    request.signal?.throwIfAborted();
    await withDatabaseMutationMutex(this.#db, async () => {
      this.#db.transaction(() => {
        this.#verifyParent(request.parent, built.admission, true);
        const claim = this.#db.prepare(`UPDATE analysis_research_automation_ai_executions SET state = 'DISPATCHING', dispatch_claimed_at = ?
          WHERE execution_id = ? AND state = 'PREPARED'`).run(this.#now().toISOString(), executionId);
        if (claim.changes !== 1) throw adapter.executionError('EXECUTION_IN_PROGRESS');
      }).immediate();
      addActiveDispatch(this.#db, executionId);
    });

    // From here a dispatch is possible. Every path settles once as COMPLETED or terminal DISPATCH_UNKNOWN.
    try {
      // Re-read every retained input before the only dispatch. The port is
      // caller-owned, but prompt/configuration/user text all come from the
      // committed artifacts, never from current process constants or config.
      let settlement: Settlement<T>;
      try {
        const row = this.#row(request.parent);
        if (!row) throw adapter.integrityError();
        const retained = await this.#readRetainedExecution(row, request.parent);
        settlement = await this.#dispatchAndRetain(ai!.port, retained, adapter.atRetainedVersion(request.source, retained.admission), request.signal);
      } catch (error) {
        // The claim is already durable. If retained evidence changed between
        // claim and reread, preserve that fact as a terminal unknown rather
        // than leaving a row claimed until a later restart recovery.
        if (!(error instanceof AutomationSynthesisExecutionIntegrityError)) throw error;
        settlement = unknown('RESPONSE_NOT_RETAINED');
      }
      try {
        await this.#settle(executionId, settlement);
        return this.#outcome(executionId, true, settlement);
      } catch (error) {
        if (settlement.state === 'DISPATCH_UNKNOWN') throw error;
        const fallback = unknown('RESPONSE_NOT_RETAINED');
        await this.#settle(executionId, fallback);
        return this.#outcome(executionId, true, fallback);
      }
    } finally {
      deleteActiveDispatch(this.#db, executionId);
    }
  }

  /** Query-only replay for report reads and PDFs. It never dispatches, settles or recovers anything. */
  async read(parent: AutomationSynthesisExecutionParent, source: T['source']): Promise<AutomationSynthesisExecutionView<T['candidates'], T['validationCode']>> {
    let built = this.#adapter.build(source);
    this.#verifyParent(parent, built.admission, false);
    const row = this.#row(parent);
    if (!row) return built.inputBytes ? { status: 'ABSENT' } : { status: 'NOT_DISPATCHED', reason: 'INSUFFICIENT_EVIDENCE' };
    const retained = await this.#readRetainedExecution(row, parent);
    built = this.#adapter.build(this.#adapter.atRetainedVersion(source, retained.admission));
    this.#assertIdentity(row, built);
    if (row.state === 'PREPARED' || row.state === 'DISPATCHING') return { status: row.state, executionId: row.execution_id };
    return this.#settled(row, source, retained);
  }

  /**
   * Executor-start recovery for every section in this database: each claimed dispatch without a settled outcome
   * becomes terminal DISPATCH_UNKNOWN. It refuses while any section has an active dispatch in this process. Only the
   * single write owner may call it, while it holds the database mutation mutex and before it requeues any report
   * parent. PREPARED rows are left alone because nothing was dispatched.
   */
  recoverInterruptedDispatches(): number {
    if (activeDispatches.get(databaseKey(this.#db))?.size) throw this.#adapter.executionError('ACTIVE_DISPATCH_IN_PROCESS');
    return this.#db.prepare(`UPDATE analysis_research_automation_ai_executions
      SET state = 'DISPATCH_UNKNOWN', unknown_code = 'INTERRUPTED_AFTER_CLAIM', settled_at = ? WHERE state = 'DISPATCHING'`)
      .run(this.#now().toISOString()).changes;
  }

  /** Recorded lifecycle of this adapter's section only. A dispatch claim is not proof of provider receipt or billing. */
  async readActivity(workspaceId: string, runId: string): Promise<AutomationSynthesisActivity | undefined> {
    const codingColumns = this.#adapter.sectionId === 'INSIGHT_CODING'
      ? 'coding_adoption_id, coding_request_key, coding_previous_proposal_id'
      : 'NULL coding_adoption_id, NULL coding_request_key, NULL coding_previous_proposal_id';
    const rows = this.#db.prepare(`SELECT ${ROW_COLUMNS}, attempt_id, ${codingColumns} FROM analysis_research_automation_ai_executions
      WHERE run_id = ? AND section_id = ? ORDER BY created_at, execution_id`).all(runId, this.#adapter.sectionId) as
      Array<ExecutionRow & { readonly attempt_id: string | null; readonly coding_adoption_id: string | null;
        readonly coding_request_key: string | null; readonly coding_previous_proposal_id: string | null }>;
    if (!rows.length) return undefined;
    const states = { prepared: 0, dispatching: 0, completed: 0, dispatchUnknown: 0 };
    const outcomes = { valid: 0, invalid: 0 };
    for (const row of rows) {
      if (row.workspace_id !== workspaceId) throw this.#adapter.integrityError();
      const parent: AutomationSynthesisExecutionParent = row.coding_adoption_id !== null
        ? { kind: 'INSIGHT_CODING', runId, adoptionId: row.coding_adoption_id, requestKey: row.coding_request_key!, previousProposalId: row.coding_previous_proposal_id }
        : row.attempt_id === null
        ? { kind: 'INITIAL_REPORTS', runId }
        : { kind: 'SUPPLEMENTAL_ATTEMPT', runId, attemptId: row.attempt_id };
      const retained = await this.#readRetainedExecution(row, parent);
      this.#verifyParent(parent, retained.admission, false);
      switch (row.state) {
        case 'PREPARED': states.prepared++; break;
        case 'DISPATCHING': states.dispatching++; break;
        case 'DISPATCH_UNKNOWN': states.dispatchUnknown++; break;
        case 'COMPLETED':
          states.completed++;
          if (row.validation_status === 'VALID') outcomes.valid++;
          else if (row.validation_status === 'INVALID') outcomes.invalid++;
          else throw this.#adapter.integrityError();
          break;
        default: throw this.#adapter.integrityError();
      }
    }
    const state = states.dispatching + states.completed + states.dispatchUnknown > 0 ? 'UNKNOWN' as const : 'NOT_DISPATCHED' as const;
    return { states, outcomes, billing: { state } };
  }

  #configurationBytes(ai: AutomationSynthesisExecutionRequest<T['source'], T['configuration']>['ai']): Buffer | null {
    if (ai && !this.#adapter.configuration.validate(ai.configuration)) throw this.#adapter.executionError('INVALID_SYNTHESIS_CONFIGURATION');
    return ai ? json(ai.configuration) : null;
  }

  /** Parent identity comes from owned rows; a caller-supplied hash is never evidence of linkage. */
  #verifyParent(parent: AutomationSynthesisExecutionParent, admission: T['admission'], requireRunning: boolean): void {
    const fail = (code: AutomationSynthesisExecutionErrorCode): never => { throw this.#adapter.executionError(code); };
    const identity = this.#adapter.identity(admission);
    if (parent.runId !== identity.runId) fail('PARENT_RUN_MISMATCH');
    if ((parent.kind === 'INSIGHT_CODING') !== (this.#adapter.sectionId === 'INSIGHT_CODING')) fail('EXECUTION_IDENTITY_CONFLICT');
    if (parent.kind === 'INSIGHT_CODING') {
      const coding = this.#db.prepare(`SELECT e.artifact_json artifact, e.pair_sha256 pairId,
          r.workspace_id workspaceId, r.scope_request_sha256 scopeSha256, r.status runStatus, r.reports
        FROM analysis_insight_coding_evidence e JOIN analysis_research_automation_runs r ON r.run_id=e.run_id
        WHERE e.evidence_id=? AND e.run_id=? AND e.kind='ADOPTION'`).get(parent.adoptionId, parent.runId) as
        { artifact: string; pairId: string; workspaceId: string; scopeSha256: string; runStatus: string; reports: string } | undefined;
      if (!coding) return fail('PARENT_NOT_FOUND');
      if (coding.workspaceId !== identity.workspaceId) fail('PARENT_WORKSPACE_MISMATCH');
      if (coding.scopeSha256 !== identity.scopeSha256) fail('PARENT_SCOPE_MISMATCH');
      if (!coding.reports.split(',').includes('INSIGHT')) fail('PARENT_REPORTS_EXCLUDE_INSIGHT');
      // Historical replay does not require the adoption or proposal to remain current.
      // The coding owner verifies the immutable adoption artifact and original pair.
      if (!requireRunning) return;
      if (coding.runStatus !== 'DRAFT_READY') fail('PARENT_NOT_RUNNING');
      const latestPair = this.#db.prepare(`SELECT pair_sha256 pairId FROM analysis_research_automation_attempts
        WHERE run_id=? AND state='COMMITTED' ORDER BY version_number DESC LIMIT 1`).get(parent.runId) as { pairId: string } | undefined;
      const superseded = this.#db.prepare(`SELECT 1 FROM analysis_insight_coding_evidence
        WHERE run_id=? AND pair_sha256=? AND kind='ADOPTION'
          AND json_extract(artifact_json,'$.request.contractVersion')=json_extract(?,'$.request.contractVersion')
          AND json_extract(artifact_json,'$.request.rules.ruleId')=json_extract(?,'$.request.rules.ruleId')
          AND json_extract(artifact_json,'$.request.rules.revision')>json_extract(?,'$.request.rules.revision') LIMIT 1`)
        .get(parent.runId, coding.pairId, coding.artifact, coding.artifact, coding.artifact);
      const proposal = this.#db.prepare(`SELECT evidence_id id FROM analysis_insight_coding_evidence
        WHERE parent_id=? AND kind='PROPOSAL' ORDER BY sequence DESC LIMIT 1`).get(parent.adoptionId) as { id: string } | undefined;
      if ((latestPair && latestPair.pairId !== coding.pairId) || superseded || (proposal?.id ?? null) !== parent.previousProposalId)
        fail('EXECUTION_IDENTITY_CONFLICT');
      return;
    }
    const row = (parent.kind === 'INITIAL_REPORTS'
      ? this.#db.prepare(`SELECT r.workspace_id workspaceId, r.scope_request_sha256 scopeSha256, r.reports, r.status runStatus, s.state parentState
          FROM analysis_research_automation_runs r
          LEFT JOIN analysis_research_automation_steps s ON s.run_id = r.run_id AND s.step_id = 'REPORTS' WHERE r.run_id = ?`).get(parent.runId)
      : this.#db.prepare(`SELECT r.workspace_id workspaceId, r.scope_request_sha256 scopeSha256, r.reports, r.status runStatus, a.state parentState
          FROM analysis_research_automation_attempts a JOIN analysis_research_automation_runs r ON r.run_id = a.run_id
          WHERE a.attempt_id = ? AND a.run_id = ?`).get(parent.attemptId, parent.runId)) as
      { workspaceId: string; scopeSha256: string | null; reports: string; runStatus: string; parentState: string | null } | undefined;
    if (!row) return fail('PARENT_NOT_FOUND');
    if (row.workspaceId !== identity.workspaceId) fail('PARENT_WORKSPACE_MISMATCH');
    if (row.scopeSha256 !== identity.scopeSha256) fail('PARENT_SCOPE_MISMATCH');
    if (!row.reports.split(',').includes(this.#reportKind))
      fail(this.#reportKind === 'INSIGHT' ? 'PARENT_REPORTS_EXCLUDE_INSIGHT' : 'PARENT_REPORTS_EXCLUDE_MARKET');
    const running = row.parentState === 'RUNNING' && row.runStatus === (parent.kind === 'INITIAL_REPORTS' ? 'RENDERING' : 'DRAFT_READY');
    if (requireRunning && !running) fail('PARENT_NOT_RUNNING');
  }

  /** The exact parent and this adapter's section; never another section's row. */
  #row(parent: AutomationSynthesisExecutionParent): ExecutionRow | undefined {
    if (parent.kind === 'INSIGHT_CODING') {
      const row = this.#db.prepare(`SELECT ${ROW_COLUMNS}, run_id, coding_adoption_id, coding_previous_proposal_id
        FROM analysis_research_automation_ai_executions WHERE coding_request_key=?`).get(parent.requestKey) as
        (ExecutionRow & { run_id: string; coding_adoption_id: string; coding_previous_proposal_id: string | null }) | undefined;
      if (row && (row.run_id !== parent.runId || row.coding_adoption_id !== parent.adoptionId || row.coding_previous_proposal_id !== parent.previousProposalId))
        throw this.#adapter.executionError('EXECUTION_IDENTITY_CONFLICT');
      return row;
    }
    return (parent.kind === 'INITIAL_REPORTS'
      ? this.#db.prepare(`SELECT ${ROW_COLUMNS} FROM analysis_research_automation_ai_executions
          WHERE run_id = ? AND attempt_id IS NULL AND section_id = ?`).get(parent.runId, this.#adapter.sectionId)
      : this.#db.prepare(`SELECT ${ROW_COLUMNS} FROM analysis_research_automation_ai_executions
          WHERE attempt_id = ? AND run_id = ? AND section_id = ?`).get(parent.attemptId, parent.runId, this.#adapter.sectionId)) as ExecutionRow | undefined;
  }

  /** The same parent identity cannot be reused with a different admission or model-facing input. */
  #assertIdentity(row: ExecutionRow, built: AutomationSynthesisBuild<T>): void {
    if (!built.inputBytes || row.admission_sha256 !== sha256(built.admissionBytes) || row.input_sha256 !== sha256(built.inputBytes))
      throw this.#adapter.executionError('EXECUTION_IDENTITY_CONFLICT');
  }

  #isValidationCode(code: string | null): code is AutomationSynthesisResponseCode | T['validationCode'] {
    return code !== null && (RESPONSE_CODES.has(code) || (this.#adapter.validationCodes as ReadonlySet<string>).has(code));
  }

  /** Replay a settled row from retained bytes only. No current prompt, configuration or transport is consulted. */
  async #settled(row: ExecutionRow, source: T['source'], retained: AutomationSynthesisRetainedArtifacts<T>):
    Promise<AutomationSynthesisExecutionOutcome<T['candidates'], T['validationCode']>> {
    if (row.state === 'DISPATCH_UNKNOWN') {
      const unknownCode = row.unknown_code;
      if (unknownCode === null || !UNKNOWN_CODES.has(unknownCode)) throw this.#adapter.integrityError();
      return { status: 'DISPATCH_UNKNOWN', executionId: row.execution_id, dispatched: false, unknownCode: unknownCode as AutomationSynthesisUnknownCode };
    }
    if (row.validation_status === 'INVALID') {
      const validationCode = row.validation_code;
      if (!this.#isValidationCode(validationCode)) throw this.#adapter.integrityError();
      return { status: 'INVALID', executionId: row.execution_id, dispatched: false, validationCode };
    }
    if (row.candidates_sha256 === null) throw this.#adapter.integrityError();
    const bytes = await this.#readArtifact(row.candidates_sha256, this.#adapter.candidatesMaxBytes);
    let replayed: { readonly artifact: T['candidates']; readonly bytes: Buffer } | undefined;
    try {
      replayed = this.#adapter.replayCandidates(JSON.parse(bytes.toString('utf8')) as unknown,
        this.#adapter.atRetainedVersion(source, retained.admission), retained);
    } catch {
      throw this.#adapter.integrityError();
    }
    if (!replayed || !replayed.bytes.equals(bytes)) throw this.#adapter.integrityError();
    return { status: 'VALID', executionId: row.execution_id, dispatched: false, candidates: { ...replayed, sha256: row.candidates_sha256 } };
  }

  async #readRetainedExecution(row: ExecutionRow, parent: AutomationSynthesisExecutionParent): Promise<AutomationSynthesisRetainedArtifacts<T>> {
    const adapter = this.#adapter;
    const admission = await this.#readRetainedJson(row.admission_sha256, adapter.admission);
    const input = await this.#readRetainedJson(row.input_sha256, adapter.input);
    const prompt = await this.#readRetainedJson(row.prompt_sha256, adapter.prompt);
    const configuration = await this.#readRetainedJson(row.configuration_sha256, adapter.configuration);
    const retained: AutomationSynthesisRetainedArtifacts<T> = {
      admission: admission.value, admissionBytes: admission.bytes,
      input: input.value, inputBytes: input.bytes,
      prompt: prompt.value, promptBytes: prompt.bytes,
      configuration: configuration.value, configurationBytes: configuration.bytes,
    };
    const identity = adapter.identity(retained.admission);
    const expected = { runId: parent.runId, workspaceId: row.workspace_id, scopeSha256: row.scope_sha256, admissionSha256: row.admission_sha256 };
    let bound: boolean;
    try { bound = adapter.bindsRetained(retained, expected); } catch { throw adapter.integrityError(); }
    if (identity.runId !== expected.runId || identity.workspaceId !== expected.workspaceId || identity.scopeSha256 !== expected.scopeSha256 || !bound)
      throw adapter.integrityError();
    return retained;
  }

  async #readRetainedJson<V>(digest: string, codec: AutomationSynthesisArtifactCodec<V>): Promise<{ readonly value: V; readonly bytes: Buffer }> {
    const bytes = await this.#readArtifact(digest, codec.maxBytes);
    let value: unknown;
    try { value = JSON.parse(bytes.toString('utf8')); } catch { throw this.#adapter.integrityError(); }
    if (!codec.validate(value) || !json(value).equals(bytes)) throw this.#adapter.integrityError();
    return { value, bytes };
  }

  async #readArtifact(digest: string, maxBytes: number): Promise<Buffer> {
    const manifest = this.#manifest(digest, maxBytes);
    let bytes: Buffer;
    try { bytes = await this.#store.read(digest, { maxBytes }); } catch { throw this.#adapter.integrityError(); }
    if (BigInt(bytes.length) !== BigInt(manifest.byte_size)) throw this.#adapter.integrityError();
    return bytes;
  }

  #manifest(digest: string, maxBytes: number): {
    readonly sha256: string; readonly byte_size: bigint | number; readonly media_type: string;
    readonly relative_path: string; readonly acquired_at: string; readonly contract_version: string; readonly retention_status: string;
  } {
    const manifest = this.#db.prepare(`SELECT sha256, byte_size, media_type, relative_path, acquired_at, contract_version, retention_status
      FROM artifact_manifests WHERE sha256 = ?`).get(digest) as {
        sha256: string; byte_size: bigint | number; media_type: string; relative_path: string; acquired_at: string;
        contract_version: string; retention_status: string;
      } | undefined;
    const expectedPath = `sha256/${digest.slice(0, 2)}/${digest}`;
    if (!manifest) throw this.#adapter.integrityError();
    if (manifest.sha256 !== digest || BigInt(manifest.byte_size) > BigInt(maxBytes) || manifest.media_type !== 'application/json' ||
        manifest.relative_path !== expectedPath || typeof manifest.acquired_at !== 'string' || manifest.acquired_at.trim().length === 0 ||
        manifest.contract_version !== '1.0.0' || manifest.retention_status !== 'active') throw this.#adapter.integrityError();
    return manifest;
  }

  /** Classify an untrusted response. Only a defined object that passes the adapter's validator is VALID. */
  #classify(text: unknown, source: T['source'], maxResponseBytes: number):
    | { readonly status: 'VALID'; readonly candidates: { readonly artifact: T['candidates']; readonly bytes: Buffer } }
    | { readonly status: 'INVALID'; readonly code: AutomationSynthesisResponseCode | T['validationCode'] } {
    if (typeof text !== 'string') return { status: 'INVALID', code: 'RESPONSE_NOT_TEXT' };
    if (Buffer.byteLength(text, 'utf8') > maxResponseBytes) return { status: 'INVALID', code: 'RESPONSE_TOO_LARGE' };
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return { status: 'INVALID', code: 'RESPONSE_NOT_JSON' }; }
    const verdict = this.#adapter.classifyResponse(parsed, source);
    // An undeclared code is an adapter defect, never a model INVALID.
    if (verdict.status === 'INVALID' && !this.#isValidationCode(verdict.code)) throw this.#adapter.integrityError();
    return verdict;
  }

  async #dispatchAndRetain(port: AutomationSynthesisTextPort<T['configuration']>, retained: AutomationSynthesisRetainedArtifacts<T>,
    source: T['source'], signal: AbortSignal | undefined): Promise<Settlement<T>> {
    let text: unknown;
    try {
      text = (await this.#dispatch(port, retained, signal))?.text;
    } catch {
      return unknown('TRANSPORT_OUTCOME_AMBIGUOUS');
    }
    try {
      const verdict = this.#classify(text, source, retained.configuration.maxResponseBytes);
      if (verdict.status === 'INVALID') return { state: 'COMPLETED', status: 'INVALID', code: verdict.code };
      const stored = await this.#store.put(verdict.candidates.bytes);
      return { state: 'COMPLETED', status: 'VALID', candidates: verdict.candidates, stored };
    } catch {
      return unknown('RESPONSE_NOT_RETAINED');
    }
  }

  /** Exactly one port call, bounded by the configured timeout and the caller's signal. A late response is ignored. */
  async #dispatch(port: AutomationSynthesisTextPort<T['configuration']>, retained: AutomationSynthesisRetainedArtifacts<T>,
    signal: AbortSignal | undefined): Promise<{ readonly text: string }> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let onAbort: (() => void) | undefined;
    const abandoned = new Promise<never>((_, reject) => {
      const stop = (reason: unknown) => { controller.abort(reason); reject(reason); };
      timer = setTimeout(() => stop(new Error(`${this.#adapter.sectionId}_DISPATCH_TIMEOUT`)), retained.configuration.timeoutMs);
      onAbort = () => stop(signal!.reason);
      if (signal?.aborted) onAbort();
      else signal?.addEventListener('abort', onAbort, { once: true });
    });
    abandoned.catch(() => {});
    const call = (async () => port.generateText({
      configuration: retained.configuration, systemText: this.#adapter.systemText(retained.prompt),
      userText: retained.inputBytes.toString('utf8'), signal: controller.signal,
    }))();
    call.catch(() => {});
    try {
      return await Promise.race([call, abandoned]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
  }

  /** Durably settle a claimed dispatch once. A VALID outcome registers its retained candidates in the same transaction. */
  async #settle(executionId: string, settlement: Settlement<T>): Promise<void> {
    await withDatabaseMutationMutex(this.#db, async () => {
      const at = this.#now().toISOString();
      this.#db.transaction(() => {
        if (settlement.state === 'COMPLETED' && settlement.status === 'VALID') {
          registerManifest(this.#db, settlement.stored, at);
          this.#manifest(settlement.stored.sha256, settlement.stored.byteSize);
        }
        const settled = this.#db.prepare(`UPDATE analysis_research_automation_ai_executions
          SET state = ?, validation_status = ?, validation_code = ?, candidates_sha256 = ?, unknown_code = ?, settled_at = ?
          WHERE execution_id = ? AND state = 'DISPATCHING'`).run(
          settlement.state,
          settlement.state === 'COMPLETED' ? settlement.status : null,
          settlement.state === 'COMPLETED' && settlement.status === 'INVALID' ? settlement.code : null,
          settlement.state === 'COMPLETED' && settlement.status === 'VALID' ? settlement.stored.sha256 : null,
          settlement.state === 'DISPATCH_UNKNOWN' ? settlement.code : null,
          at, executionId);
        if (settled.changes !== 1) throw this.#adapter.integrityError();
      }).immediate();
    });
  }

  #outcome(executionId: string, dispatched: boolean, settlement: Settlement<T>): AutomationSynthesisExecutionOutcome<T['candidates'], T['validationCode']> {
    if (settlement.state === 'DISPATCH_UNKNOWN') return { status: 'DISPATCH_UNKNOWN', executionId, dispatched, unknownCode: settlement.code };
    if (settlement.status === 'INVALID') return { status: 'INVALID', executionId, dispatched, validationCode: settlement.code };
    return { status: 'VALID', executionId, dispatched, candidates: { ...settlement.candidates, sha256: settlement.stored.sha256 } };
  }
}
