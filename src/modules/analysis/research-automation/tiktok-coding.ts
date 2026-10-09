import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import proposalSchema from '../../../../contracts/analysis/tiktok-coding-proposal-v1.schema.json' with { type: 'json' };
import modelSchema from '../../../../contracts/analysis/tiktok-coding-model-v1.schema.json' with { type: 'json' };
import commentsSchema from '../../../../contracts/analysis/tiktok-comment-collection-v1.schema.json' with { type: 'json' };
import keywordSchema from '../../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import tiktokConfigurationSchema from '../../../../contracts/analysis/tiktok-coding-configuration-v1.schema.json' with { type: 'json' };
import type { TikTokSourcePackageIdentity } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { TikTokCodingProposeRequest, TikTokDraftCoding, TikTokDraftCode,
  TikTokCodingReceipt, TikTokCodedReport, TikTokCodingContextView } from '../../../../contracts/analysis/tiktok-coding-proposal-v1.generated.js';
import type { TikTokCodingModelSource, TikTokCodingModelInput, TikTokCodingModelPrompt,
  TikTokCodingModelCandidates } from '../../../../contracts/analysis/tiktok-coding-model-v1.generated.js';
import type { TikTokCodingConfiguration } from '../../../../contracts/analysis/tiktok-coding-configuration-v1.generated.js';
import type { TikTokCommentCorpus } from '../../../../contracts/analysis/tiktok-comment-collection-v1.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { CitationRegistry } from '../citation-registry.js';
import type { RetainedKeywordListDraftRecord } from '../keyword-list-draft-record.js';
import type { AutomationSynthesisTextPort } from './synthesis-execution.js';
import { buildTikTokCodingContext, type TikTokCodingContext } from './tiktok-coding-context.js';
import { tiktokCodingPrompt } from './tiktok-coding-prompt.js';
import { p9PackagePrefix } from './p9-source-intake.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema(keywordSchema); ajv.addSchema(commentsSchema); ajv.addSchema(proposalSchema); ajv.addSchema(modelSchema);
ajv.addSchema(tiktokConfigurationSchema);
const validateConfiguration = ajv.compile<TikTokCodingConfiguration>({ $ref: `${tiktokConfigurationSchema.$id}` });
const validateProposeRequest = ajv.compile<TikTokCodingProposeRequest>({ $ref: `${proposalSchema.$id}#/$defs/proposeRequest` });
const validateDraftCoding = ajv.compile<TikTokDraftCoding>({ $ref: `${proposalSchema.$id}#/$defs/draftCoding` });
const validateReport = ajv.compile<TikTokCodedReport>({ $ref: `${proposalSchema.$id}#/$defs/report` });
const validateContextView = ajv.compile<TikTokCodingContextView>({ $ref: `${proposalSchema.$id}#/$defs/context` });
const validateSource = ajv.compile<TikTokCodingModelSource>({ $ref: `${modelSchema.$id}#/$defs/source` });
const validateInput = ajv.compile<TikTokCodingModelInput>({ $ref: `${modelSchema.$id}#/$defs/input` });
const validateCandidates = ajv.compile<TikTokCodingModelCandidates>({ $ref: `${modelSchema.$id}#/$defs/candidates` });
const validateCorpus = ajv.compile<TikTokCommentCorpus>({ $ref: `${commentsSchema.$id}#/$defs/corpus` });

const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const bytes = (value: unknown) => Buffer.from(canonicalJson(value));
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

const BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 };
const MAX_RESPONSE_BYTES = 1024 * 1024;
const BRIEF = 'Propose draft topic codes for retained TikTok customer comments.';
const LIMITATIONS = [
  'Nguồn là bình luận công khai đã thu thập; giai đoạn đo lường và giai đoạn bán hàng không được xác minh.',
  'Chỉ bản ghi INCLUDED CUSTOMER được mã hoá; các bản ghi khác nằm ngoài số lượng chính cùng lý do.',
  'Số lượng là đề xuất, chờ chủ duyệt; không phải phê duyệt của chủ hay phương pháp thống kê.',
];

/** Run/source-authenticated refusal. Never carries secrets, prompts, or provider output. */
export class TikTokCodingError extends Error {
  constructor(message = 'TikTok coding identity, retained evidence or explicit configuration differs.') {
    super(message);
    this.name = 'TikTokCodingError';
  }
}
/** Model-transport outcome is unknown after dispatch; never blindly retried or retained. */
export class TikTokCodingTransportError extends Error {
  constructor(readonly code: 'MODEL_NOT_CONFIGURED' | 'MODEL_MISCONFIGURED' | 'MODEL_DISPATCH_FAILED' | 'MODEL_RESPONSE_INVALID', options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'TikTokCodingTransportError';
  }
}
function fail(): never {
  throw new TikTokCodingError();
}

export const tiktokCodingPackagePrefix = (runId: string) => `automation-tiktok-coding:${runId}-`;

/** Authenticated run binding for one coding proposal; the service owns its construction. */
export interface TikTokCodingRunBinding {
  readonly workspaceId: string;
  readonly runId: string;
  readonly scopeSha256: string;
  readonly sourceSetSha256: string;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string };
}

/** Resolved model transport and frozen configuration, or null when unconfigured. */
export type TikTokCodingAI = {
  readonly port: AutomationSynthesisTextPort<TikTokCodingConfiguration>;
  readonly configuration: TikTokCodingConfiguration;
} | null;

function member(p: VerifiedFinalizedSourcePackage, path: string) {
  const file = p.files.find(entry => entry.path === path);
  if (!file) fail();
  return file!;
}
function json<T>(p: VerifiedFinalizedSourcePackage, path: string): T {
  const file = member(p, path);
  try {
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(file.bytes));
    if (!bytes(value).equals(file.bytes)) fail();
    return value as T;
  } catch {
    fail();
  }
}

export class AutomationTikTokCoding {
  readonly #db: Database.Database;
  readonly #packages: SourcePackageService;
  readonly #reader: FoundationSourcePackageReader;
  readonly #artifacts: ContentAddressedArtifactStore;
  readonly #now: () => Date;
  constructor(private readonly options: {
    db: Database.Database;
    packages: SourcePackageService;
    artifacts: ContentAddressedArtifactStore;
    now?: () => Date;
    publish: <T>(operation: () => Promise<T>) => Promise<T>;
    mutex: <T>(operation: () => Promise<T>) => Promise<T>;
    keywordDraft: (digest: string) => Promise<RetainedKeywordListDraftRecord>;
    replayComments: (identity: TikTokSourcePackageIdentity) => Promise<unknown>;
  }) {
    this.#db = options.db;
    this.#packages = options.packages;
    this.#reader = new FoundationSourcePackageReader(options.packages);
    this.#artifacts = options.artifacts;
    this.#now = options.now ?? (() => new Date());
  }

  async #lookup(key: string) {
    const matches = await this.#reader.findFinalizedSourcePackagesByKey(key);
    if (matches.length > 1 || (matches[0] && matches[0].version !== 1)) fail();
    if (!matches[0]) return undefined;
    const p = await this.#reader.readFinalizedSourcePackage(matches[0].packageId, BUDGET);
    if (p.manifestArtifactSha256 !== matches[0].manifestArtifactSha256 || p.manifest.packageKey !== key) fail();
    return p;
  }

  /** Read and bind the retained S07 corpus package to this exact run/scope/source set. */
  async #corpus(binding: TikTokCodingRunBinding, packageId: string, manifestArtifactSha256: string, packageContentSha256: string) {
    const retained = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    if (retained.manifestArtifactSha256 !== manifestArtifactSha256 || retained.packageContentSha256 !== packageContentSha256) fail();
    if (!retained.manifest.packageKey.startsWith(p9PackagePrefix(binding.runId, 'comments')) || retained.manifest.version !== 1) fail();
    const origin = await this.#reader.readAutomationAttachmentOrigin(packageId, BUDGET);
    const expectedBinding = { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
      sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } };
    if (!origin || origin.bindingSha256 !== sha(bytes(expectedBinding)) || origin.manifestArtifactSha256 !== manifestArtifactSha256) fail();
    const corpus = json<TikTokCommentCorpus>(retained, 'corpus.json');
    if (!validateCorpus(corpus)) fail();
    // Full P9 acceptance replay, not just manifest/origin/schema: intent, selection, privacy, cap,
    // raw members, diagnostics, keyword bytes, and deterministic corpus equality are verified there.
    await this.options.replayComments({ packageId, manifestArtifactSha256, packageContentSha256 });
    return { retained, corpus, corpusSha256: sha(member(retained, 'corpus.json').bytes),
      acquiredAt: retained.manifest.sourceAcquiredAt };
  }

  /** Explicit OWNER draft-coding proposal. Refusals happen before any model dispatch or write. */
  async propose(binding: TikTokCodingRunBinding, value: unknown, ai: TikTokCodingAI, signal?: AbortSignal): Promise<TikTokCodingReceipt> {
    if (!validateProposeRequest(value)) fail();
    const request = structuredClone(value);
    const prior = await this.#lookup(tiktokCodingPackagePrefix(binding.runId) + request.requestKey);
    if (prior) {
      const kept = json<TikTokDraftCoding>(prior, 'draft-coding.json');
      if (!validateDraftCoding(kept) || !equal(json(prior, 'proposal-request.json'), request)) fail();
      return { contractVersion: 'tiktok-coding-receipt-v1', proposalId: kept.proposalId, requestKey: request.requestKey, exactRetry: true };
    }
    if (!equal(request.binding, { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
      sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } })) fail();
    // Observe any existing durable claim before corpus replay, CAS puts, clock reads, or database
    // mutation: a failed/unknown/in-flight same key refuses or replays here with zero side effects.
    const known = this.#db.prepare('SELECT request_key FROM analysis_tiktok_coding_executions WHERE request_key=?')
      .get(request.requestKey) as { request_key: string } | undefined;
    if (known) return this.#followClaim(binding, request);
    const { corpus, corpusSha256, acquiredAt } = await this.#corpus(binding, request.corpus.packageId,
      request.corpus.manifestArtifactSha256, request.corpus.packageContentSha256);
    const draft = await this.options.keywordDraft(request.keywordDigest);
    // corpus.sourcePackage is the original P4 video intake identity, never the retained comments
    // package: bind the exact keyword bytes the corpus was built from, not a caller-supplied digest alone.
    if (!equal(draft.output, corpus.keywordData)) fail();
    const context = buildTikTokCodingContext(corpus, corpusSha256, request.keywordDigest, draft.output, request.recordIndexes);
    const source: TikTokCodingModelSource = { contractVersion: 'tiktok-coding-source-v1',
      request: { requestKey: request.requestKey, ...(request.recordIndexes ? { recordIndexes: [...request.recordIndexes] } : {}) },
      binding: { ...request.binding }, corpus: { ...request.corpus, corpusSha256 }, keywordDigest: request.keywordDigest };
    if (!validateSource(source)) fail();
    const input: TikTokCodingModelInput = { contractVersion: 'tiktok-coding-input-v1', brief: BRIEF,
      records: context.rows.map(row => ({ recordIndex: row.recordIndex, text: row.text, videoKind: row.videoKind, sourceType: row.sourceType })) as TikTokCodingModelInput['records'] };
    if (!validateInput(input) || bytes(input).byteLength > BUDGET.maxFileBytes) fail();
    if (!ai) throw new TikTokCodingTransportError('MODEL_NOT_CONFIGURED');
    if (!validateConfiguration(ai.configuration)) throw new TikTokCodingTransportError('MODEL_MISCONFIGURED');
    const prompt: TikTokCodingModelPrompt = { ...tiktokCodingPrompt() };
    // The mutation mutex is never held across the model call: it guards only the atomic claim
    // insert/transition and the guarded publication below. Dispatch runs lock-free between them.
    // A failed/unknown same-key retry was already observed above; this insert only wins fresh keys.
    const admissionBytes = bytes(source), inputBytes = bytes(input), promptBytes = bytes(prompt);
    const configurationBytes = bytes(ai.configuration);
    const [admission, inputStored, promptStored, configuration] = await Promise.all(
      [admissionBytes, inputBytes, promptBytes, configurationBytes].map(value => this.#artifacts.put(value)));
    if (!admission || !inputStored || !promptStored || !configuration) fail();
    const executionId = await this.options.publish(async () => this.#claim(binding, request,
      admission.sha256, inputStored.sha256, promptStored.sha256, configuration.sha256, signal));
    if (!executionId) return this.#followClaim(binding, request);
    let candidates: TikTokCodingModelCandidates & { raw: Buffer };
    try {
      candidates = await this.#dispatch(ai, { admission: source, input, prompt }, signal);
    } catch (error) {
      // A delivered but malformed/invalid response is known INVALID, never ambiguous transport.
      if (error instanceof TikTokCodingTransportError && error.code === 'MODEL_RESPONSE_INVALID') {
        await this.options.mutex(async () => { this.#settle(executionId, 'COMPLETED', 'INVALID', null); });
      } else {
        await this.options.mutex(async () => { this.#settle(executionId,
          'DISPATCH_UNKNOWN', null, signal?.aborted === true ? 'INTERRUPTED_AFTER_CLAIM' : 'TRANSPORT_OUTCOME_AMBIGUOUS'); });
      }
      throw error;
    }
    let draftCoding: TikTokDraftCoding, report: TikTokCodedReport;
    try {
      ({ draftCoding, report } = this.#assemble(request, context, acquiredAt, candidates));
    } catch (error) {
      await this.options.mutex(async () => { this.#settle(executionId, 'COMPLETED', 'INVALID', null); });
      if (error instanceof TikTokCodingTransportError) throw error;
      throw new TikTokCodingTransportError('MODEL_RESPONSE_INVALID');
    }
    const files = new Map<string, Uint8Array>([
      ['proposal-request.json', bytes(request)],
      ['coding-source.json', admissionBytes],
      ['coding-input.json', inputBytes],
      ['coding-prompt.json', promptBytes],
      ['coding-configuration.json', configurationBytes],
      ['model-response.json', candidates.raw],
      ['keyword-draft.json', bytes(draft)],
      ['draft-coding.json', bytes(draftCoding)],
      ['coded-report.json', bytes(report)],
    ]);
    try {
      await this.options.publish(async () => this.#publish(binding, request, executionId, draftCoding, report, files));
    } catch (error) {
      await this.options.mutex(async () => { this.#settle(executionId,
        'DISPATCH_UNKNOWN', null, 'TRANSPORT_OUTCOME_AMBIGUOUS'); });
      if (error instanceof TikTokCodingTransportError) throw error;
      throw new TikTokCodingTransportError('MODEL_DISPATCH_FAILED', { cause: error });
    }
    return { contractVersion: 'tiktok-coding-receipt-v1', proposalId: draftCoding.proposalId, requestKey: request.requestKey, exactRetry: false };
  }

  /**
   * Durable atomic pre-dispatch claim. One row per requestKey: the winner dispatches once;
   * a second instance observes the existing claim instead of dispatching again. Transport-unknown
   * and invalid outcomes are terminal for their key; only a new owner requestKey dispatches again.
   * Runs under the guarded publication mutex; returns the owned execution id, or null when another
   * claim already exists (the caller then observes it without dispatching).
   */
  async #claim(binding: TikTokCodingRunBinding, request: TikTokCodingProposeRequest,
    admissionSha256: string, inputSha256: string, promptSha256: string, configurationSha256: string,
    signal?: AbortSignal): Promise<string | null> {
    signal?.throwIfAborted();
    const executionId = randomUUID(), createdAt = this.#now().toISOString();
    try {
      this.#db.prepare(`INSERT INTO analysis_tiktok_coding_executions(execution_id,run_id,workspace_id,scope_sha256,request_key,
        admission_sha256,input_sha256,prompt_sha256,configuration_sha256,state,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,'PREPARED',?)`).run(executionId, binding.runId, binding.workspaceId, binding.scopeSha256,
        request.requestKey, admissionSha256, inputSha256, promptSha256, configurationSha256, createdAt);
    } catch (error) {
      // Only a duplicate request key observes the existing claim; any other store failure is real and rethrown.
      if (!(error instanceof Error) || !/UNIQUE constraint failed/.test(error.message)) throw error;
      return null;
    }
    const claimed = this.#db.prepare(`UPDATE analysis_tiktok_coding_executions SET state='DISPATCHING',dispatch_claimed_at=?
      WHERE execution_id=? AND state='PREPARED'`).run(this.#now().toISOString(), executionId);
    if (claimed.changes !== 1) return null;
    return executionId;
  }
  /**
   * Pure post-dispatch assembly: validated model candidates become retained draft coding plus the
   * deterministic cited report. Any failure here means the model output did not match retained
   * evidence, settled as INVALID by the caller; nothing is published from this step.
   */
  #assemble(request: TikTokCodingProposeRequest, context: TikTokCodingContext, acquiredAt: string | null,
    candidates: TikTokCodingModelCandidates & { raw: Buffer }):
    { draftCoding: TikTokDraftCoding; report: TikTokCodedReport } {
    const registry = new CitationRegistry();
    const byIndex = new Map(context.rows.map(row => [row.recordIndex, row] as const));
    const codes: TikTokDraftCode[] = candidates.codes.map(entry => {
      const row = byIndex.get(entry.recordIndex);
      if (!row || entry.quote.end <= entry.quote.start || entry.quote.start < 0 ||
        entry.quote.end > row.text.length || row.text.slice(entry.quote.start, entry.quote.end) !== entry.quote.text) fail();
      const citationId = registry.cite({ sourceKind: 'REVIEW', identity: row.pageSha256, locator: row.locator,
        label: 'bình luận công khai dưới video TikTok', retrievedAt: acquiredAt, url: row.videoUrl,
        quote: null, quoteVerification: 'NOT_APPLICABLE' });
      if (citationId === null) fail();
      return { code: entry.code, label: entry.label, recordIndex: entry.recordIndex,
        quote: { ...entry.quote }, citationId };
    });
    const proposalId = randomUUID();
    const codedIndexes = new Set(codes.map(entry => entry.recordIndex));
    const draftCoding: TikTokDraftCoding = { contractVersion: 'tiktok-draft-coding-v1', proposalId,
      requestKey: request.requestKey, binding: { ...request.binding }, corpus: { ...request.corpus },
      keywordDigest: request.keywordDigest, promptVersion: 'tiktok-coding-prompt-v1', codes,
      counts: { recordsCoded: codedIndexes.size, codesProposed: codes.length, quotesCited: codes.length },
      status: 'PROPOSED_AWAITING_REVIEW', limitations: [...LIMITATIONS] as TikTokDraftCoding['limitations'] };
    if (!validateDraftCoding(draftCoding)) fail();
    const report = this.#codedReport(draftCoding, context);
    return { draftCoding, report };
  }

  /**
   * Guarded publication of one claimed proposal. Runs under the caller's publication mutex;
   * never nested inside another mutex hold. Settles COMPLETED on verified store.
   */
  async #publish(binding: TikTokCodingRunBinding, request: TikTokCodingProposeRequest, executionId: string,
    draftCoding: TikTokDraftCoding, report: TikTokCodedReport, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
    const retained = await this.#store(binding, request.requestKey, files);
    const kept = json<TikTokDraftCoding>(retained, 'draft-coding.json');
    const keptReport = json<TikTokCodedReport>(retained, 'coded-report.json');
    if (!validateDraftCoding(kept) || !validateReport(keptReport) || !equal(kept, draftCoding) || !equal(keptReport, report)) fail();
    this.#settle(executionId, 'COMPLETED', 'VALID', null);
  }

  /** A lost claim race or a same-key retry observes the durable outcome; it never dispatches again. */
  async #followClaim(binding: TikTokCodingRunBinding, request: TikTokCodingProposeRequest): Promise<TikTokCodingReceipt> {
    const row = this.#db.prepare(`SELECT state,validation_status FROM analysis_tiktok_coding_executions WHERE request_key=?`)
      .get(request.requestKey) as { state: string; validation_status: string | null } | undefined;
    if (!row || row.state === 'PREPARED' || row.state === 'DISPATCHING') {
      throw new TikTokCodingError('A TikTok coding dispatch for this request key is already claimed and still running; resend the identical request after it settles, never a concurrent duplicate.');
    }
    if (row.state !== 'COMPLETED' || row.validation_status !== 'VALID') {
      throw new TikTokCodingError('A TikTok coding dispatch for this request key already failed or is of unknown outcome; retry with a new request key, never by resending this one.');
    }
    const prior = await this.#lookup(tiktokCodingPackagePrefix(binding.runId) + request.requestKey);
    if (!prior) fail();
    const kept = json<TikTokDraftCoding>(prior, 'draft-coding.json');
    if (!validateDraftCoding(kept) || !equal(json(prior, 'proposal-request.json'), request)) fail();
    return { contractVersion: 'tiktok-coding-receipt-v1', proposalId: kept.proposalId, requestKey: request.requestKey, exactRetry: true };
  }

  #settle(executionId: string, state: 'COMPLETED' | 'DISPATCH_UNKNOWN', validation: 'VALID' | 'INVALID' | null, code: string | null): void {
    const settled = this.#db.prepare(`UPDATE analysis_tiktok_coding_executions
      SET state=?,validation_status=?,validation_code=?,unknown_code=?,settled_at=? WHERE execution_id=? AND state='DISPATCHING'`)
      .run(state, validation, validation === 'INVALID' ? 'TIKTOK_CODING_RESPONSE_INVALID' : null, code, this.#now().toISOString(), executionId);
    if (settled.changes !== 1) fail();
  }

  /**
   * Deterministic cited assembly of the retained draft: findings grouped per code, ordered by code,
   * capped at six, each with per-occurrence citation locators. Distinct-record membership is counted
   * by the Reader from retained codes; the report carries occurrence citations. The Reader replays
   * these exact retained bytes; semantic identity is their digest.
   */
  #codedReport(draft: TikTokDraftCoding, context: TikTokCodingContext): TikTokCodedReport {
    const byCode = new Map<string, { label: string; citations: { citationId: number; locator: string; url: string | null }[] }>();
    const byIndex = new Map(context.rows.map(row => [row.recordIndex, row] as const));
    for (const entry of draft.codes) {
      const row = byIndex.get(entry.recordIndex);
      if (!row) fail();
      const group = byCode.get(entry.code) ?? { label: entry.label, citations: [] };
      if (group.label !== entry.label) fail();
      group.citations.push({ citationId: entry.citationId, locator: row.locator, url: row.videoUrl });
      byCode.set(entry.code, group);
    }
    const scope = 'Trong tập bình luận thu được đã lưu (S07); đơn vị đếm là bản ghi, không phải số người. Số lượng là đề xuất, chờ chủ duyệt.';
    const findings = [...byCode].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 6).map(([code, group]) => {
      if (group.citations.length === 0) fail();
      // The finding template carries no literal digits outside {{}}: the code identifier travels
      // via the bundle key and the retained label stays in the draft and section bodies.
      return { sectionId: 'I10' as const, code, label: group.label,
        template: `Mã chủ đề trong mẫu lời nguồn: {{tiktok.codes.${code}.records}} bản ghi có trích dẫn trực tiếp (đề xuất, chờ chủ duyệt).`,
        status: 'PROPOSED_AWAITING_REVIEW' as const, scope,
        citations: group.citations as TikTokCodedReport['findings'][number]['citations'] };
    });
    const report: TikTokCodedReport = { contractVersion: 'tiktok-coded-report-v1', proposalId: draft.proposalId,
      draftSha256: sha(bytes(draft)), corpus: { ...draft.corpus }, keywordDigest: draft.keywordDigest,
      findings: findings as TikTokCodedReport['findings'],
      counts: { ...draft.counts }, status: 'PROPOSED_AWAITING_REVIEW', limitations: [...LIMITATIONS] as TikTokCodedReport['limitations'] };
    if (!validateReport(report)) fail();
    return report;
  }

  /** Bounded single model dispatch. Transport failures retain nothing and grant no retry. */
  async #dispatch(ai: NonNullable<TikTokCodingAI>, artifacts: { admission: TikTokCodingModelSource;
    input: TikTokCodingModelInput; prompt: { contractVersion: string; systemText: string } },
    signal?: AbortSignal): Promise<TikTokCodingModelCandidates & { raw: Buffer }> {
    const configuration = ai.configuration;
    if (configuration.contractVersion !== 'tiktok-coding-configuration-v1') throw new TikTokCodingTransportError('MODEL_NOT_CONFIGURED');
    const timeout = AbortSignal.timeout(configuration.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let text: string;
    try {
      const userText = new TextDecoder('utf-8', { fatal: true }).decode(bytes(artifacts.input));
      const outcome = await ai.port.generateText({ configuration, systemText: artifacts.prompt.systemText, userText, signal: combined });
      text = outcome.text;
    } catch {
      throw new TikTokCodingTransportError('MODEL_DISPATCH_FAILED');
    }
    if (Buffer.byteLength(text, 'utf8') > Math.min(configuration.maxResponseBytes, MAX_RESPONSE_BYTES)) {
      throw new TikTokCodingTransportError('MODEL_DISPATCH_FAILED');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new TikTokCodingTransportError('MODEL_RESPONSE_INVALID');
    }
    const shaped = { contractVersion: 'tiktok-coding-candidates-v1', ...(parsed as Record<string, unknown>) };
    if (!validateCandidates(shaped)) throw new TikTokCodingTransportError('MODEL_RESPONSE_INVALID');
    for (const entry of shaped.codes) {
      if (entry.label.includes('{{') || entry.label.includes('}}')) throw new TikTokCodingTransportError('MODEL_RESPONSE_INVALID');
    }
    return { ...shaped, raw: Buffer.from(text, 'utf8') };
  }

  /**
   * Guarded publication. The caller holds the publication mutex exactly once; this method never
   * re-enters it (the mutex is non-reentrant). A pre-existing same-key package fails honestly.
   */
  async #store(binding: TikTokCodingRunBinding, requestKey: string, files: ReadonlyMap<string, Uint8Array>) {
    if ([...files.values()].some(value => value.byteLength > BUDGET.maxFileBytes) ||
      [...files.values()].reduce((total, value) => total + value.byteLength, 0) > BUDGET.maxTotalBytes) fail();
    const mediaType = (name: string) => name === 'keyword-draft.json' ? 'application/vnd.tdn.keyword-draft+json' : 'application/json';
    const input: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: tiktokCodingPackagePrefix(binding.runId) + requestKey,
      version: 1, sourceLabel: 'TikTok draft coding: explicitly requested bounded model proposal over retained S07 evidence',
      sourceAcquiredAt: null,
      files: [...files].map(([path, value]) => ({ path, sha256: sha(value), byteSize: value.byteLength,
        mediaType: mediaType(path), evidenceFamily: 'tiktok-coding-v1', representationRole: 'derived', independence: 'non_independent',
        providerProvenance: 'operator_supplied_unverified', provenanceBasis: 'Explicit Analysis-owned TikTok draft-coding intake; bounded model proposal over retained sanitized S07 evidence, proposed and awaiting owner review, not human approval.' })) as SourcePackageIntakeRequest['files'] };
    if (await this.#lookup(input.packageKey)) fail();
    const result = await this.#packages.intakeAutomationAttachment(input, files, sha(bytes(binding)), BUDGET);
    return this.#reader.readFinalizedSourcePackage(result.packageId, BUDGET);
  }

  /** Configless query-only corpus replay for the owning Reader builder. Re-authenticates run binding. */
  async readCorpus(binding: TikTokCodingRunBinding, packageId: string, manifestArtifactSha256: string, packageContentSha256: string) {
    const { corpus, acquiredAt } = await this.#corpus(binding, packageId, manifestArtifactSha256, packageContentSha256);
    return { corpus, acquiredAt };
  }

  /**
   * Authenticated query-only propose-binding assembly for one explicitly selected retained S07
   * package. No caller guessing: binding, exact corpus identity, and the retained keyword-draft
   * digest all come from replayed retention. No model, collector, clock, or CAS mutation.
   */
  async context(binding: TikTokCodingRunBinding, packageId: string, keywordDigest: string): Promise<TikTokCodingContextView> {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(packageId)) fail();
    if (!/^[a-f0-9]{64}$/.test(keywordDigest)) fail();
    const retained = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    const { corpus, corpusSha256 } = await this.#corpus(binding, packageId,
      retained.manifestArtifactSha256, retained.packageContentSha256);
    const keyword = await this.options.keywordDraft(keywordDigest);
    if (!equal(keyword.output, corpus.keywordData)) fail();
    const built = buildTikTokCodingContext(corpus, corpusSha256, keywordDigest, keyword.output);
    const view: TikTokCodingContextView = { contractVersion: 'tiktok-coding-context-v1',
      binding: { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
        sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } },
      corpus: { packageId, manifestArtifactSha256: retained.manifestArtifactSha256, packageContentSha256: retained.packageContentSha256 },
      keywordDigest, counts: { eligible: built.rows.length, excluded: built.excluded, unclear: built.unclear } };
    if (!validateContextView(view)) fail();
    return view;
  }

  /** Configless query-only retained read. No model, collector, clock, or CAS mutation. */
  async read(binding: TikTokCodingRunBinding, packageId: string, manifestArtifactSha256: string, packageContentSha256: string) {
    const retained = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    if (retained.manifestArtifactSha256 !== manifestArtifactSha256 || retained.packageContentSha256 !== packageContentSha256 ||
      !retained.manifest.packageKey.startsWith(tiktokCodingPackagePrefix(binding.runId)) || retained.manifest.version !== 1) fail();
    const paths = ['proposal-request.json', 'coding-source.json', 'coding-input.json', 'coding-prompt.json',
      'coding-configuration.json', 'model-response.json', 'keyword-draft.json', 'draft-coding.json', 'coded-report.json'];
    if (retained.files.length !== paths.length || retained.files.some(f => !paths.includes(f.path))) fail();
    for (const f of retained.files) {
      if (f.evidenceFamily !== 'tiktok-coding-v1' || f.independence !== 'non_independent' || f.representationRole !== 'derived' ||
        f.providerProvenance !== 'operator_supplied_unverified' ||
        f.mediaType !== (f.path === 'keyword-draft.json' ? 'application/vnd.tdn.keyword-draft+json' : 'application/json')) fail();
    }
    const draft = json<TikTokDraftCoding>(retained, 'draft-coding.json');
    if (!validateDraftCoding(draft) || draft.binding.workspaceId !== binding.workspaceId || draft.binding.runId !== binding.runId) fail();
    const report = json<TikTokCodedReport>(retained, 'coded-report.json');
    if (!validateReport(report) || report.proposalId !== draft.proposalId || report.draftSha256 !== sha(bytes(draft))) fail();
    const { corpus, acquiredAt } = await this.#corpus(binding, draft.corpus.packageId, draft.corpus.manifestArtifactSha256, draft.corpus.packageContentSha256);
    const keyword = await this.options.keywordDraft(draft.keywordDigest);
    if (!equal(keyword.output, corpus.keywordData)) fail();
    const byIndex = new Map(corpus.records.map((record, recordIndex) => [recordIndex, record] as const));
    const registry = new CitationRegistry();
    const citations = draft.codes.map(entry => {
      const record = byIndex.get(entry.recordIndex);
      const ref = record?.versions[0]?.sourceRefs[0];
      if (!record || !ref || record.disposition !== 'INCLUDED' || record.voice !== 'CUSTOMER' || record.text === null ||
        record.text.slice(entry.quote.start, entry.quote.end) !== entry.quote.text) fail();
      // retrievedAt is actual package acquisition time or unknown; source-createdAt never proves retrieval.
      const citationId = registry.cite({ sourceKind: 'REVIEW', identity: ref.pageSha256, locator: `bình luận ${record.commentId}`,
        label: 'bình luận công khai dưới video TikTok', retrievedAt: acquiredAt, url: record.videoUrl,
        quote: null, quoteVerification: 'NOT_APPLICABLE' });
      if (citationId === null || citationId !== entry.citationId) fail();
      return { citationId, locator: `bình luận ${record.commentId}`, url: record.videoUrl };
    });
    return { draft, report, citations, finalizedAt: retained.manifest.finalizedAt };
  }

  /** Configless query-only retained history. Each member is re-read, never trusted from the index. */
  async history(binding: TikTokCodingRunBinding) {
    const entries = await this.#reader.findAutomationAttachmentPackagesByKeyPrefix(tiktokCodingPackagePrefix(binding.runId));
    if (entries.length >= 101) fail();
    const sources: { proposalId: string; requestKey: string; packageId: string; manifestArtifactSha256: string;
      packageContentSha256: string; createdAt: string; status: 'PROPOSED_AWAITING_REVIEW' }[] = [];
    for (const entry of entries) {
      const retained = await this.#reader.readFinalizedSourcePackage(entry.packageId, BUDGET);
      if (entry.version !== 1) fail();
      const read = await this.read(binding, entry.packageId, entry.manifestArtifactSha256, retained.packageContentSha256);
      sources.push({ proposalId: read.draft.proposalId, requestKey: read.draft.requestKey, packageId: entry.packageId,
        manifestArtifactSha256: entry.manifestArtifactSha256, packageContentSha256: retained.packageContentSha256,
        createdAt: read.finalizedAt, status: 'PROPOSED_AWAITING_REVIEW' });
    }
    return { contractVersion: 'tiktok-coding-history-v1', sources };
  }
}
