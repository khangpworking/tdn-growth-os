import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import proposalSchema from '../../../../contracts/analysis/shopee-review-coding-v1.schema.json' with { type: 'json' };
import modelSchema from '../../../../contracts/analysis/shopee-review-coding-model-v1.schema.json' with { type: 'json' };
import configurationSchema from '../../../../contracts/analysis/shopee-review-coding-configuration-v1.schema.json' with { type: 'json' };
import type { ShopeeCodingProposeRequest, ShopeeDraftCoding, ShopeeDraftCode,
  ShopeeCodingReceipt, ShopeeCitedSynthesis, ShopeeCodingContextView, ShopeeSampleSelection } from '../../../../contracts/analysis/shopee-review-coding-v1.generated.js';
import type { ShopeeCodingModelSource, ShopeeCodingModelInput, ShopeeCodingModelPrompt,
  ShopeeCodingModelCandidates } from '../../../../contracts/analysis/shopee-review-coding-model-v1.generated.js';
import type { ShopeeReviewCodingConfiguration } from '../../../../contracts/analysis/shopee-review-coding-configuration-v1.generated.js';
import type { AutomationReviewSample } from '../../../../contracts/analysis/automation-review-sample.generated.js';
import type { PrivateReviewReportView } from '../../../../contracts/analysis/private-review-report-view.generated.js';
import type { SourcePackageIntakeRequest } from '../../../../contracts/foundation/source-package-intake-request.generated.js';
import { SourcePackageService, type VerifiedFinalizedSourcePackage } from '../../foundation/source-package-service.js';
import type { ContentAddressedArtifactStore } from '../../../platform/artifacts/artifact-store.js';
import { FoundationSourcePackageReader } from '../../foundation/source-package-reader.js';
import { P9SourceError } from './p9-source-intake.js';
import { canonicalJson } from '../../foundation/canonical-json.js';
import { CitationRegistry } from '../citation-registry.js';
import type { RetainedKeywordListDraftRecord } from '../keyword-list-draft-record.js';
import type { AutomationSynthesisTextPort } from './synthesis-execution.js';
import { buildShopeeCodingContext, type ShopeeCodingContext } from './shopee-coding-context.js';
import { shopeeCodingPrompt } from './shopee-coding-prompt.js';

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
ajv.addSchema(proposalSchema); ajv.addSchema(modelSchema); ajv.addSchema(configurationSchema);
const validateProposeRequest = ajv.compile<ShopeeCodingProposeRequest>({ $ref: `${proposalSchema.$id}#/$defs/proposeRequest` });
const validateDraftCoding = ajv.compile<ShopeeDraftCoding>({ $ref: `${proposalSchema.$id}#/$defs/draftCoding` });
const validateReport = ajv.compile<ShopeeCitedSynthesis>({ $ref: `${proposalSchema.$id}#/$defs/report` });
const validateContextView = ajv.compile<ShopeeCodingContextView>({ $ref: `${proposalSchema.$id}#/$defs/context` });
const validateSampleSelection = ajv.compile<ShopeeSampleSelection>({ $ref: `${proposalSchema.$id}#/$defs/sampleSelection` });
const validateSource = ajv.compile<ShopeeCodingModelSource>({ $ref: `${modelSchema.$id}#/$defs/source` });
const validateInput = ajv.compile<ShopeeCodingModelInput>({ $ref: `${modelSchema.$id}#/$defs/input` });
const validateCandidates = ajv.compile<ShopeeCodingModelCandidates>({ $ref: `${modelSchema.$id}#/$defs/candidates` });
const validateConfiguration = ajv.compile<ShopeeReviewCodingConfiguration>({ $ref: `${configurationSchema.$id}` });

const sha = (value: Uint8Array | string) => createHash('sha256').update(value).digest('hex');
const bytes = (value: unknown) => Buffer.from(canonicalJson(value));
const equal = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);

const BUDGET = { maxFileBytes: 32 * 1024 * 1024, maxTotalBytes: 128 * 1024 * 1024 };
const MAX_RESPONSE_BYTES = 1024 * 1024;
const BRIEF = 'Propose draft topic and stated-sentiment codes for retained Shopee customer reviews.';
const LIMITATIONS = [
  'Nguồn là đánh giá công khai đã thu thập; giai đoạn đo lường và giai đoạn bán hàng không được xác minh.',
  'Chỉ bản ghi SELECTED_TEXT có chữ đọc được mới được mã hoá; các bản ghi khác nằm ngoài số lượng chính cùng lý do.',
  'Số lượng là đề xuất, chờ chủ duyệt; không phải phê duyệt của chủ hay phương pháp thống kê.',
];

/** Run/source-authenticated refusal. Never carries secrets, prompts, or provider output. */
export class ShopeeCodingError extends Error {
  constructor(message = 'Shopee coding identity, retained evidence or explicit configuration differs.') {
    super(message);
    this.name = 'ShopeeCodingError';
  }
}
/** Model-transport outcome is unknown after dispatch; never blindly retried or retained. */
export class ShopeeCodingTransportError extends Error {
  constructor(readonly code: 'MODEL_NOT_CONFIGURED' | 'MODEL_MISCONFIGURED' | 'MODEL_DISPATCH_FAILED' | 'MODEL_RESPONSE_INVALID', options?: { cause?: unknown }) {
    super(code, options);
    this.name = 'ShopeeCodingTransportError';
  }
}
function fail(): never {
  throw new ShopeeCodingError();
}

export const shopeeCodingPackagePrefix = (runId: string) => `automation-shopee-coding:${runId}-`;

/** Authenticated run binding for one coding proposal; the service owns its construction. */
export interface ShopeeCodingRunBinding {
  readonly workspaceId: string;
  readonly runId: string;
  readonly scopeSha256: string;
  readonly sourceSetSha256: string | null;
  readonly requestedPeriod: { readonly startDate: string; readonly endDate: string };
}

/** Replayed retained U22 source for one coding proposal; the service owns its construction. */
export interface ShopeeCodingSource {
  readonly sample: AutomationReviewSample;
  readonly view: PrivateReviewReportView;
  readonly corpusSha256: string;
  readonly acquiredAt: string | null;
}

/** Digest identifying the deterministic retained corpus view bytes both sides replay. */
export function shopeeCorpusViewDigest(view: PrivateReviewReportView): string {
  return sha(Buffer.from(canonicalJson(view)));
}

/** Resolved model transport and frozen configuration, or null when unconfigured. */
export type ShopeeCodingAI = {
  readonly port: AutomationSynthesisTextPort<ShopeeReviewCodingConfiguration>;
  readonly configuration: ShopeeReviewCodingConfiguration;
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

export class AutomationShopeeCoding {
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
    sampleSource: () => Promise<ShopeeCodingSource>;
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

  /** Coding-package server origin: only an AUTOMATION_ATTACHMENT intake under the exact run
   * binding authenticates a same-prefix package. Ordinary intake cannot acquire that origin. */
  async #verifyCodingOrigin(binding: ShopeeCodingRunBinding, retained: VerifiedFinalizedSourcePackage) {
    const origin = await this.#reader.readAutomationAttachmentOrigin(retained.packageId, BUDGET);
    const expectedBinding = { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
      sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } };
    if (!origin || origin.bindingSha256 !== sha(bytes(expectedBinding)) ||
      origin.manifestArtifactSha256 !== retained.manifestArtifactSha256) fail();
  }

  /** Explicit OWNER draft-coding proposal. Refusals happen before any model dispatch or write. */
  async propose(binding: ShopeeCodingRunBinding, value: unknown, ai: ShopeeCodingAI, signal?: AbortSignal): Promise<ShopeeCodingReceipt> {
    if (!validateProposeRequest(value)) fail();
    const request = structuredClone(value);
    const prior = await this.#lookup(shopeeCodingPackagePrefix(binding.runId) + request.requestKey);
    if (prior) {
      const checked = await this.read(binding, prior.packageId, prior.manifestArtifactSha256, prior.packageContentSha256);
      if (checked.draft.requestKey !== request.requestKey || !equal(json(prior, 'proposal-request.json'), request)) fail();
      return { contractVersion: 'shopee-coding-receipt-v1', proposalId: checked.draft.proposalId, requestKey: request.requestKey, exactRetry: true };
    }
    if (!equal(request.binding, { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
      sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } })) fail();
    // Observe any existing durable claim before source replay, CAS puts, clock reads, or database
    // mutation: a failed/unknown/in-flight same key refuses or replays here with zero side effects.
    const known = this.#db.prepare('SELECT request_key FROM analysis_shopee_coding_executions WHERE request_key=?')
      .get(request.requestKey) as { request_key: string } | undefined;
    if (known) return this.#followClaim(binding, request);
    const source = await this.options.sampleSource();
    if (source.sample.sampleId !== request.sample.sampleId || source.corpusSha256 !== request.sample.corpusArtifactSha256) fail();
    // The keyword draft is run-identity provenance only: resolved when present, absent otherwise.
    // Shopee evidence never depends on L9 terms, so coding works without a configured draft.
    const keyword = request.keywordDigest === null ? null : await this.options.keywordDraft(request.keywordDigest);
    const context = buildShopeeCodingContext(source.view, source.corpusSha256, request.recordIndexes);
    const admission: ShopeeCodingModelSource = { contractVersion: 'shopee-coding-source-v1',
      request: { requestKey: request.requestKey, ...(request.recordIndexes ? { recordIndexes: [...request.recordIndexes] } : {}) },
      binding: { ...request.binding },
      sample: { sampleId: request.sample.sampleId, corpusArtifactSha256: request.sample.corpusArtifactSha256, corpusSha256: source.corpusSha256 },
      keywordDigest: request.keywordDigest };
    if (!validateSource(admission)) fail();
    const input: ShopeeCodingModelInput = { contractVersion: 'shopee-coding-input-v1', brief: BRIEF,
      records: context.rows.map(row => ({ recordIndex: row.recordIndex, text: row.text, shopId: row.shopId, itemId: row.itemId })) as ShopeeCodingModelInput['records'] };
    if (!validateInput(input) || bytes(input).byteLength > BUDGET.maxFileBytes) fail();
    if (!ai) throw new ShopeeCodingTransportError('MODEL_NOT_CONFIGURED');
    if (!validateConfiguration(ai.configuration)) throw new ShopeeCodingTransportError('MODEL_MISCONFIGURED');
    const prompt: ShopeeCodingModelPrompt = { ...shopeeCodingPrompt() };
    // The mutation mutex is never held across the model call: it guards only the atomic claim
    // insert/transition and the guarded publication below. Dispatch runs lock-free between them.
    // A failed/unknown same-key retry was already observed above; this insert only wins fresh keys.
    const admissionBytes = bytes(admission), inputBytes = bytes(input), promptBytes = bytes(prompt);
    const configurationBytes = bytes(ai.configuration);
    const [admissionStored, inputStored, promptStored, configuration] = await Promise.all(
      [admissionBytes, inputBytes, promptBytes, configurationBytes].map(value => this.#artifacts.put(value)));
    if (!admissionStored || !inputStored || !promptStored || !configuration) fail();
    const executionId = await this.options.publish(async () => this.#claim(binding, request,
      admissionStored.sha256, inputStored.sha256, promptStored.sha256, configuration.sha256, signal));
    if (!executionId) return this.#followClaim(binding, request);
    let candidates: ShopeeCodingModelCandidates & { raw: Buffer };
    try {
      candidates = await this.#dispatch(ai, { admission, input, prompt }, signal);
    } catch (error) {
      // A delivered but malformed/invalid response is known INVALID, never ambiguous transport.
      if (error instanceof ShopeeCodingTransportError && error.code === 'MODEL_RESPONSE_INVALID') {
        await this.options.mutex(async () => { this.#settle(executionId, 'COMPLETED', 'INVALID', null); });
      } else {
        await this.options.mutex(async () => { this.#settle(executionId,
          'DISPATCH_UNKNOWN', null, signal?.aborted === true ? 'INTERRUPTED_AFTER_CLAIM' : 'TRANSPORT_OUTCOME_AMBIGUOUS'); });
      }
      throw error;
    }
    let draftCoding: ShopeeDraftCoding, report: import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis;
    try {
      ({ draftCoding, report } = this.#assemble(request, context, source.acquiredAt, candidates));
    } catch (error) {
      await this.options.mutex(async () => { this.#settle(executionId, 'COMPLETED', 'INVALID', null); });
      if (error instanceof ShopeeCodingTransportError) throw error;
      throw new ShopeeCodingTransportError('MODEL_RESPONSE_INVALID');
    }
    const files = new Map<string, Uint8Array>([
      ['proposal-request.json', bytes(request)],
      ['coding-source.json', admissionBytes],
      ['coding-input.json', bytes(input)],
      ['coding-prompt.json', promptBytes],
      ['coding-configuration.json', configurationBytes],
      ['model-response.json', candidates.raw],
      ['keyword-draft.json', bytes(keyword?.output ?? null)],
      ['draft-coding.json', bytes(draftCoding)],
      ['cited-synthesis.json', bytes(report)],
    ]);
    try {
      await this.options.publish(async () => this.#publish(binding, request, executionId, draftCoding, report, files));
    } catch (error) {
      await this.options.mutex(async () => { this.#settle(executionId,
        'DISPATCH_UNKNOWN', null, 'TRANSPORT_OUTCOME_AMBIGUOUS'); });
      if (error instanceof ShopeeCodingTransportError) throw error;
      throw new ShopeeCodingTransportError('MODEL_DISPATCH_FAILED', { cause: error });
    }
    return { contractVersion: 'shopee-coding-receipt-v1', proposalId: draftCoding.proposalId, requestKey: request.requestKey, exactRetry: false };
  }

  /**
   * Durable atomic pre-dispatch claim. One row per requestKey: the winner dispatches once;
   * a second instance observes the existing claim instead of dispatching again. Transport-unknown
   * and invalid outcomes are terminal for their key; only a new owner requestKey dispatches again.
   * Runs under the guarded publication mutex; returns the owned execution id, or null when another
   * claim already exists (the caller then observes it without dispatching).
   */
  async #claim(binding: ShopeeCodingRunBinding, request: ShopeeCodingProposeRequest,
    admissionSha256: string, inputSha256: string, promptSha256: string, configurationSha256: string,
    signal?: AbortSignal): Promise<string | null> {
    signal?.throwIfAborted();
    const executionId = randomUUID(), createdAt = this.#now().toISOString();
    try {
      this.#db.prepare(`INSERT INTO analysis_shopee_coding_executions(execution_id,run_id,workspace_id,scope_sha256,request_key,
        admission_sha256,input_sha256,prompt_sha256,configuration_sha256,state,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,'PREPARED',?)`).run(executionId, binding.runId, binding.workspaceId, binding.scopeSha256,
        request.requestKey, admissionSha256, inputSha256, promptSha256, configurationSha256, createdAt);
    } catch (error) {
      // Only a duplicate request key observes the existing claim; any other store failure is real and rethrown.
      if (!(error instanceof Error) || !/UNIQUE constraint failed/.test(error.message)) throw error;
      return null;
    }
    const claimed = this.#db.prepare(`UPDATE analysis_shopee_coding_executions SET state='DISPATCHING',dispatch_claimed_at=?
      WHERE execution_id=? AND state='PREPARED'`).run(this.#now().toISOString(), executionId);
    if (claimed.changes !== 1) return null;
    return executionId;
  }

  /** A lost claim race or a same-key retry observes the durable outcome; it never dispatches again. */
  async #followClaim(binding: ShopeeCodingRunBinding, request: ShopeeCodingProposeRequest): Promise<ShopeeCodingReceipt> {
    const row = this.#db.prepare(`SELECT state,validation_status FROM analysis_shopee_coding_executions WHERE request_key=?`)
      .get(request.requestKey) as { state: string; validation_status: string | null } | undefined;
    if (!row || row.state === 'PREPARED' || row.state === 'DISPATCHING') {
      throw new ShopeeCodingError('A Shopee coding dispatch for this request key is already claimed and still running; resend the identical request after it settles, never a concurrent duplicate.');
    }
    if (row.state !== 'COMPLETED' || row.validation_status !== 'VALID') {
      throw new ShopeeCodingError('A Shopee coding dispatch for this request key already failed or is of unknown outcome; retry with a new request key, never by resending this one.');
    }
    const prior = await this.#lookup(shopeeCodingPackagePrefix(binding.runId) + request.requestKey);
    if (!prior) fail();
    const checked = await this.read(binding, prior.packageId, prior.manifestArtifactSha256, prior.packageContentSha256);
    if (checked.draft.requestKey !== request.requestKey || !equal(json(prior, 'proposal-request.json'), request)) fail();
    return { contractVersion: 'shopee-coding-receipt-v1', proposalId: checked.draft.proposalId, requestKey: request.requestKey, exactRetry: true };
  }

  #settle(executionId: string, state: 'COMPLETED' | 'DISPATCH_UNKNOWN', validation: 'VALID' | 'INVALID' | null, code: string | null): void {
    const settled = this.#db.prepare(`UPDATE analysis_shopee_coding_executions
      SET state=?,validation_status=?,validation_code=?,unknown_code=?,settled_at=? WHERE execution_id=? AND state='DISPATCHING'`)
      .run(state, validation, validation === 'INVALID' ? 'SHOPEE_CODING_RESPONSE_INVALID' : null, code, this.#now().toISOString(), executionId);
    if (settled.changes !== 1) fail();
  }

  /**
   * Pure post-dispatch assembly: validated model candidates become retained draft coding plus the
   * deterministic cited synthesis. Any failure here means the model output did not match retained
   * evidence, settled as INVALID by the caller; nothing is published from this step.
   */
  #assemble(request: ShopeeCodingProposeRequest, context: ShopeeCodingContext, acquiredAt: string | null,
    candidates: ShopeeCodingModelCandidates & { raw: Buffer }):
    { draftCoding: ShopeeDraftCoding; report: import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis } {
    const registry = new CitationRegistry();
    const byIndex = new Map(context.rows.map(row => [row.recordIndex, row] as const));
    const codes: ShopeeDraftCode[] = candidates.codes.map(entry => {
      const row = byIndex.get(entry.recordIndex);
      if (!row || entry.quote.end <= entry.quote.start || entry.quote.start < 0 ||
        entry.quote.end > row.text.length || row.text.slice(entry.quote.start, entry.quote.end) !== entry.quote.text) fail();
      const citationId = registry.cite({ sourceKind: 'REVIEW', identity: row.pageSha256, locator: row.locator,
        label: 'Đánh giá khách hàng trên Shopee', retrievedAt: acquiredAt, url: null,
        quote: null, quoteVerification: 'NOT_APPLICABLE' });
      if (citationId === null) fail();
      return { code: entry.code, label: entry.label, recordIndex: entry.recordIndex,
        quote: { ...entry.quote }, citationId };
    });
    const proposalId = randomUUID();
    const codedIndexes = new Set(codes.map(entry => entry.recordIndex));
    const draftCoding: ShopeeDraftCoding = { contractVersion: 'shopee-draft-coding-v1', proposalId,
      requestKey: request.requestKey, binding: { ...request.binding }, sample: { ...request.sample },
      keywordDigest: request.keywordDigest, promptVersion: 'shopee-review-coding-prompt-v1', codes,
      counts: { recordsCoded: codedIndexes.size, codesProposed: codes.length, quotesCited: codes.length },
      status: 'PROPOSED_AWAITING_REVIEW', limitations: [...LIMITATIONS] as ShopeeDraftCoding['limitations'] };
    if (!validateDraftCoding(draftCoding)) fail();
    const report = this.#citedSynthesis(draftCoding, context);
    return { draftCoding, report };
  }

  /**
   * Deterministic cited assembly of the retained draft: findings grouped per code, ordered by code,
   * capped at six, each with per-occurrence citation locators. The Reader replays these exact retained
   * bytes; semantic identity is their digest.
   */
  #citedSynthesis(draft: ShopeeDraftCoding, context: ShopeeCodingContext): import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis {
    const byCode = new Map<string, { label: string; citations: { citationId: number; locator: string; url: string | null }[] }>();
    const byIndex = new Map(context.rows.map(row => [row.recordIndex, row] as const));
    for (const entry of draft.codes) {
      const row = byIndex.get(entry.recordIndex);
      if (!row) fail();
      const group = byCode.get(entry.code) ?? { label: entry.label, citations: [] };
      if (group.label !== entry.label) fail();
      group.citations.push({ citationId: entry.citationId, locator: row.locator, url: null });
      byCode.set(entry.code, group);
    }
    const scope = 'Trong tập đánh giá đã lưu (S05); đơn vị đếm là bản ghi, không phải số người. Số lượng là đề xuất, chờ chủ duyệt.';
    const findings = [...byCode].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).slice(0, 6).map(([code, group]) => {
      if (group.citations.length === 0) fail();
      return { sectionId: 'I10' as const, code, label: group.label,
        template: `Mã chủ đề trong mẫu lời nguồn: {{shopee.codes.${code}.records}} bản ghi có trích dẫn trực tiếp (đề xuất, chờ chủ duyệt).`,
        status: 'PROPOSED_AWAITING_REVIEW' as const, scope,
        citations: group.citations as import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis['findings'][number]['citations'] };
    });
    const report = { contractVersion: 'shopee-cited-synthesis-v1', proposalId: draft.proposalId,
      draftSha256: sha(bytes(draft)), sample: { ...draft.sample }, keywordDigest: draft.keywordDigest,
      findings: findings as import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis['findings'],
      counts: { ...draft.counts }, status: 'PROPOSED_AWAITING_REVIEW', limitations: [...LIMITATIONS] as import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis['limitations'] };
    if (!validateReport(report)) fail();
    return report;
  }

  /** Bounded single model dispatch. Transport failures retain nothing and grant no retry. */
  async #dispatch(ai: NonNullable<ShopeeCodingAI>, artifacts: { admission: ShopeeCodingModelSource;
    input: ShopeeCodingModelInput; prompt: { contractVersion: string; systemText: string } },
    signal?: AbortSignal): Promise<ShopeeCodingModelCandidates & { raw: Buffer }> {
    const configuration = ai.configuration;
    if (configuration.contractVersion !== 'shopee-review-coding-configuration-v1') throw new ShopeeCodingTransportError('MODEL_NOT_CONFIGURED');
    const timeout = AbortSignal.timeout(configuration.timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let text: string;
    try {
      const userText = new TextDecoder('utf-8', { fatal: true }).decode(bytes(artifacts.input));
      const outcome = await ai.port.generateText({ configuration, systemText: artifacts.prompt.systemText, userText, signal: combined });
      text = outcome.text;
    } catch {
      throw new ShopeeCodingTransportError('MODEL_DISPATCH_FAILED');
    }
    if (Buffer.byteLength(text, 'utf8') > Math.min(configuration.maxResponseBytes, MAX_RESPONSE_BYTES)) {
      throw new ShopeeCodingTransportError('MODEL_DISPATCH_FAILED');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new ShopeeCodingTransportError('MODEL_RESPONSE_INVALID');
    }
    const shaped = { contractVersion: 'shopee-coding-candidates-v1', ...(parsed as Record<string, unknown>) };
    if (!validateCandidates(shaped)) throw new ShopeeCodingTransportError('MODEL_RESPONSE_INVALID');
    for (const entry of shaped.codes) {
      if (entry.label.includes('{{') || entry.label.includes('}}')) throw new ShopeeCodingTransportError('MODEL_RESPONSE_INVALID');
    }
    return { ...shaped, raw: Buffer.from(text, 'utf8') };
  }

  /**
   * Guarded publication. The caller holds the publication mutex exactly once; this method never
   * re-enters it (the mutex is non-reentrant). A pre-existing same-key package fails honestly.
   */
  async #store(binding: ShopeeCodingRunBinding, requestKey: string, files: ReadonlyMap<string, Uint8Array>) {
    if ([...files.values()].some(value => value.byteLength > BUDGET.maxFileBytes) ||
      [...files.values()].reduce((total, value) => total + value.byteLength, 0) > BUDGET.maxTotalBytes) fail();
    const mediaType = (name: string) => name === 'keyword-draft.json' ? 'application/vnd.tdn.keyword-draft+json' : 'application/json';
    const input: SourcePackageIntakeRequest = { contractVersion: '1.0.0', packageKey: shopeeCodingPackagePrefix(binding.runId) + requestKey,
      version: 1, sourceLabel: 'Shopee draft coding: explicitly requested bounded model proposal over retained U22 evidence',
      sourceAcquiredAt: null,
      files: [...files].map(([path, value]) => ({ path, sha256: sha(value), byteSize: value.byteLength,
        mediaType: mediaType(path), evidenceFamily: 'shopee-coding-v1', representationRole: 'derived', independence: 'non_independent',
        providerProvenance: 'operator_supplied_unverified', provenanceBasis: 'Explicit Analysis-owned Shopee draft-coding intake; bounded model proposal over retained sanitized U22 evidence, proposed and awaiting owner review, not human approval.' })) as SourcePackageIntakeRequest['files'] };
    if (await this.#lookup(input.packageKey)) fail();
    const result = await this.#packages.intakeAutomationAttachment(input, files, sha(bytes(binding)), BUDGET);
    return this.#reader.readFinalizedSourcePackage(result.packageId, BUDGET);
  }

  /**
   * Guarded publication. The caller holds the publication mutex exactly once; this method never
   * re-enters it. Verifies the stored bytes, then settles COMPLETED/VALID.
   */
  async #publish(binding: ShopeeCodingRunBinding, request: ShopeeCodingProposeRequest, executionId: string,
    draftCoding: ShopeeDraftCoding, report: ShopeeCitedSynthesis, files: ReadonlyMap<string, Uint8Array>): Promise<void> {
    const retained = await this.#store(binding, request.requestKey, files);
    const kept = json<ShopeeDraftCoding>(retained, 'draft-coding.json');
    const keptReport = json<ShopeeCitedSynthesis>(retained, 'cited-synthesis.json');
    if (!validateDraftCoding(kept) || !validateReport(keptReport) || !equal(kept, draftCoding) || !equal(keptReport, report)) fail();
    this.#settle(executionId, 'COMPLETED', 'VALID', null);
  }

  /** Configless query-only retained read. No model, collector, clock, or CAS mutation. */
  async read(binding: ShopeeCodingRunBinding, packageId: string, manifestArtifactSha256: string, packageContentSha256: string) {
    const retained = await this.#reader.readFinalizedSourcePackage(packageId, BUDGET);
    if (retained.manifestArtifactSha256 !== manifestArtifactSha256 || retained.packageContentSha256 !== packageContentSha256 ||
      !retained.manifest.packageKey.startsWith(shopeeCodingPackagePrefix(binding.runId)) || retained.manifest.version !== 1) fail();
    await this.#verifyCodingOrigin(binding, retained);
    const paths = ['proposal-request.json', 'coding-source.json', 'coding-input.json', 'coding-prompt.json',
      'coding-configuration.json', 'model-response.json', 'keyword-draft.json', 'draft-coding.json', 'cited-synthesis.json'];
    if (retained.files.length !== paths.length || retained.files.some(f => !paths.includes(f.path))) fail();
    for (const f of retained.files) {
      if (f.evidenceFamily !== 'shopee-coding-v1' || f.independence !== 'non_independent' || f.representationRole !== 'derived' ||
        f.providerProvenance !== 'operator_supplied_unverified' ||
        f.mediaType !== (f.path === 'keyword-draft.json' ? 'application/vnd.tdn.keyword-draft+json' : 'application/json')) fail();
    }
    const draft = json<ShopeeDraftCoding>(retained, 'draft-coding.json');
    if (!validateDraftCoding(draft)) fail();
    const expectedDraftBinding = { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
      sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } };
    if (!equal(draft.binding, expectedDraftBinding)) fail();
    const report = json<import('../../../../contracts/analysis/shopee-review-coding-v1.generated.js').ShopeeCitedSynthesis>(retained, 'cited-synthesis.json');
    if (!validateReport(report) || report.proposalId !== draft.proposalId || report.draftSha256 !== sha(bytes(draft))) fail();
    if (!equal(report.sample, draft.sample) || report.keywordDigest !== draft.keywordDigest ||
      !equal(report.counts, draft.counts) || report.status !== draft.status) fail();
    const memberIds = new Set(draft.codes.map(entry => `${entry.code}:${entry.citationId}`));
    for (const finding of report.findings) {
      for (const citation of finding.citations) {
        if (!memberIds.has(`${finding.code}:${citation.citationId}`)) fail();
      }
    }
    this.#requireSettledExecution(binding, draft, retained);
    const source = await this.options.sampleSource();
    if (source.sample.sampleId !== draft.sample.sampleId || source.corpusSha256 !== draft.sample.corpusArtifactSha256) fail();
    const keywordOutput = json<unknown>(retained, 'keyword-draft.json');
    if (draft.keywordDigest === null) { if (keywordOutput !== null) fail(); }
    else {
      const keyword = await this.options.keywordDraft(draft.keywordDigest);
      if (!equal(keyword.output, keywordOutput)) fail();
    }
    const context = buildShopeeCodingContext(source.view, source.corpusSha256);
    const byIndex = new Map(context.rows.map(record => [record.recordIndex, record] as const));
    const registry = new CitationRegistry();
    const citations = draft.codes.map(entry => {
      const record = byIndex.get(entry.recordIndex);
      if (!record || record.text.slice(entry.quote.start, entry.quote.end) !== entry.quote.text) fail();
      // retrievedAt is actual capture acquisition time or unknown; source-createdAt never proves retrieval.
      const citationId = registry.cite({ sourceKind: 'REVIEW', identity: record.pageSha256, locator: `đánh giá ${record.shopId ?? 'unknown'}:${record.itemId ?? 'unknown'}#${entry.recordIndex}`,
        label: 'Đánh giá khách hàng trên Shopee', retrievedAt: source.acquiredAt, url: null,
        quote: null, quoteVerification: 'NOT_APPLICABLE' });
      if (citationId === null || citationId !== entry.citationId) fail();
      return { citationId, locator: `đánh giá ${record.shopId ?? 'unknown'}:${record.itemId ?? 'unknown'}#${entry.recordIndex}`, url: null as string | null,
        context: record.text, recordIndex: entry.recordIndex };
    });
    return { draft, report, citations, finalizedAt: retained.manifest.finalizedAt };
  }

  /** Settled-execution gate: identical guarantees to the TikTok path, over the Shopee claim table. */
  #requireSettledExecution(binding: ShopeeCodingRunBinding, draft: ShopeeDraftCoding, retained: VerifiedFinalizedSourcePackage): void {
    const row = this.#db.prepare(`SELECT workspace_id,run_id,scope_sha256,state,validation_status,
      admission_sha256,input_sha256,prompt_sha256,configuration_sha256 FROM analysis_shopee_coding_executions WHERE request_key=?`)
      .get(draft.requestKey) as { workspace_id: string; run_id: string; scope_sha256: string; state: string;
        validation_status: string | null; admission_sha256: string; input_sha256: string;
        prompt_sha256: string; configuration_sha256: string } | undefined;
    if (!row || row.state !== 'COMPLETED' || row.validation_status !== 'VALID') fail();
    if (row.workspace_id !== binding.workspaceId || row.run_id !== binding.runId || row.scope_sha256 !== binding.scopeSha256) fail();
    const memberBytes = (path: string) => member(retained, path).bytes;
    if (sha(memberBytes('coding-source.json')) !== row.admission_sha256 ||
      sha(memberBytes('coding-input.json')) !== row.input_sha256 ||
      sha(memberBytes('coding-prompt.json')) !== row.prompt_sha256 ||
      sha(memberBytes('coding-configuration.json')) !== row.configuration_sha256) fail();
  }

  /** Configless query-only retained history: exposes only settled valid proposals. */
  async history(binding: ShopeeCodingRunBinding) {
    const entries = await this.#reader.findAutomationAttachmentPackagesByKeyPrefix(shopeeCodingPackagePrefix(binding.runId));
    if (entries.length >= 101) fail();
    const sources: { proposalId: string; requestKey: string; packageId: string; manifestArtifactSha256: string;
      packageContentSha256: string; createdAt: string; status: 'PROPOSED_AWAITING_REVIEW' }[] = [];
    for (const entry of entries) {
      const retained = await this.#reader.readFinalizedSourcePackage(entry.packageId, BUDGET);
      if (entry.version !== 1) fail();
      let read: Awaited<ReturnType<typeof this.read>>;
      try {
        read = await this.read(binding, entry.packageId, entry.manifestArtifactSha256, retained.packageContentSha256);
      } catch (error) {
        // Product-validation refusals skip the entry so one bad package cannot poison discovery;
        // infrastructure failures propagate. Direct read/build still refuse strictly.
        if (!(error instanceof ShopeeCodingError) && !(error instanceof P9SourceError)) throw error;
        continue;
      }
      sources.push({ proposalId: read.draft.proposalId, requestKey: read.draft.requestKey, packageId: entry.packageId,
        manifestArtifactSha256: entry.manifestArtifactSha256, packageContentSha256: retained.packageContentSha256,
        createdAt: read.finalizedAt, status: 'PROPOSED_AWAITING_REVIEW' });
    }
    return { contractVersion: 'shopee-coding-history-v1', sources };
  }

  /**
   * Authenticated retained-sample selection for one run: the exact U22 sample identity plus
   * eligibility counts from replayed retention. No recollection, no latest guess, no model.
   */
  async samples(binding: ShopeeCodingRunBinding): Promise<ShopeeSampleSelection> {
    const source = await this.options.sampleSource();
    const built = buildShopeeCodingContext(source.view, source.corpusSha256);
    const selection: ShopeeSampleSelection = { contractVersion: 'shopee-sample-selection-v1',
      binding: { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
        sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } },
      sample: { sampleId: source.sample.sampleId, corpusArtifactSha256: source.corpusSha256 },
      counts: { eligible: built.rows.length, excluded: built.excluded, unreadable: built.unreadable } };
    if (!validateSampleSelection(selection)) fail();
    return selection;
  }

  /**
   * Authenticated query-only propose-binding assembly for the retained U22 sample. Binding, exact
   * sample identity, and keyword digest all come from replayed retention. No model, collector,
   * clock, or CAS mutation.
   */
  async context(binding: ShopeeCodingRunBinding, keywordDigest: string | null): Promise<ShopeeCodingContextView> {
    const source = await this.options.sampleSource();
    // Resolving a present draft authenticates that the digest names retained evidence of this run.
    if (keywordDigest !== null) {
      if (!/^[a-f0-9]{64}$/.test(keywordDigest)) fail();
      await this.options.keywordDraft(keywordDigest);
    }
    const built = buildShopeeCodingContext(source.view, source.corpusSha256);
    const view = { contractVersion: 'shopee-coding-context-v1',
      binding: { workspaceId: binding.workspaceId, runId: binding.runId, scopeSha256: binding.scopeSha256,
        sourceSetSha256: binding.sourceSetSha256, requestedPeriod: { ...binding.requestedPeriod } },
      sample: { sampleId: source.sample.sampleId, corpusArtifactSha256: source.corpusSha256 },
      keywordDigest, counts: { eligible: built.rows.length, excluded: built.excluded, unreadable: built.unreadable } };
    if (!validateContextView(view)) fail();
    return view;
  }

  /** Configless query-only sample replay for the owning Reader builder. Re-authenticates run binding. */
  async readSample() {
    return this.options.sampleSource();
  }
}
