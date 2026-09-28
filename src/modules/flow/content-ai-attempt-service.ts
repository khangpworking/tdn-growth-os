import { createRequire } from 'node:module';
import type Database from 'better-sqlite3';
import type { ValidateFunction } from 'ajv';
import { ContentAddressedArtifactStore } from '../../platform/artifacts/index.js';
import {
  CREATIVE_IMAGE_FORMATS,
  CREATIVE_MODEL_ROUTES,
  CreativeAiError,
  isCreativeModel,
  type CreativeAiErrorCode,
  type CreativeAiGateway,
  type CreativeImageRequest,
  type CreativeImageResult,
  type CreativeModel,
  type CreativeTextRequest,
  type CreativeTextResult,
  type CreativeUsage,
} from '../../platform/ai/index.js';
import { assertContentUuid, registerContentManifest, sha256 } from './content-artifacts.js';
import { inspectContentImage, type ContentImageInfo } from './content-image.js';

/**
 * Runs one Content Studio creative AI call as an audited attempt (ADR 0004): a `running` row is
 * committed before the call, exactly one gateway operation is dispatched, validated output bytes
 * are stored and registered before any dependent persistence, and the row is closed exactly once.
 * No automatic retry.
 */

const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;

export type ContentAiCall =
  | { readonly modality: 'text'; readonly request: CreativeTextRequest; readonly responseSchema?: Readonly<Record<string, unknown>> }
  | { readonly modality: 'image'; readonly request: CreativeImageRequest };

export interface ContentAiAttemptInput {
  readonly kind: 'generate';
  readonly targetType: string;
  readonly targetId: string;
  readonly promptRef: string;
  readonly inputBundleSha256: string;
  readonly plannedActionCallCount: number;
  readonly actorId: string;
  readonly retryOf?: string;
  /** Model and modality are derived from this. */
  readonly call: ContentAiCall;
}

export type ContentAiAttemptOutcome =
  | { readonly attemptId: string; readonly modality: 'text'; readonly result: CreativeTextResult; readonly parsed?: unknown; readonly outputSha256: string }
  | { readonly attemptId: string; readonly modality: 'image'; readonly result: CreativeImageResult; readonly image: ContentImageInfo; readonly sizeMatchesFormat: boolean; readonly outputSha256: string };

export type ContentAiAttemptState = 'running' | 'succeeded' | 'failed' | 'interrupted';
export type ContentAiAttemptErrorCode = CreativeAiErrorCode | 'persist_failed' | 'interrupted_by_restart';

export interface ContentAiAttemptRecord {
  readonly attemptId: string;
  readonly kind: 'generate' | 'edit';
  readonly modality: 'text' | 'image';
  readonly targetType: string;
  readonly targetId: string;
  readonly model: CreativeModel;
  readonly promptRef: string;
  readonly inputBundleSha256: string;
  readonly plannedActionCallCount: number;
  readonly state: ContentAiAttemptState;
  readonly errorCode: ContentAiAttemptErrorCode | null;
  readonly retryOf: string | null;
  readonly actorId: string;
  readonly createdAt: string;
  readonly closedAt: string | null;
  readonly outputSha256: string | null;
  readonly inputTokens: number | null;
  readonly outputTokens: number | null;
  readonly latencyMs: number | null;
  readonly providerRequestId: string | null;
}

type NotPromise<T> = T extends PromiseLike<unknown> ? never : T;

export interface ContentAiPersistSteps<S, T> {
  /** Derived, reconstructable data only; runs before the closing transaction. */
  readonly stage?: (outcome: ContentAiAttemptOutcome) => Promise<S>;
  /** Trusted synchronous code; runs inside the closing transaction on the same database handle. */
  readonly persist: (outcome: ContentAiAttemptOutcome, staged: S | undefined) => NotPromise<T>;
}

export interface ContentAiAttemptListFilter {
  readonly targetType?: string;
  readonly targetId?: string;
  readonly state?: ContentAiAttemptState;
  readonly limit?: number;
}

export interface ContentAiAttemptService {
  run<S, T>(input: ContentAiAttemptInput, steps: ContentAiPersistSteps<S, T>): Promise<{ readonly outcome: ContentAiAttemptOutcome; readonly persisted: T }>;
  countRunning(): number;
  sweepInterrupted(now: Date): number;
  list(filter: ContentAiAttemptListFilter): readonly ContentAiAttemptRecord[];
}

/** Thrown when an attempt could not be closed; the row stays `running` until the next executor startup sweep. */
export class ContentAiAttemptCloseError extends Error {
  constructor(readonly attemptId: string, readonly outputSha256: string | null, cause: unknown) {
    super(outputSha256
      ? `AI attempt ${attemptId} could not be closed; its output association was not committed`
      : `AI attempt ${attemptId} could not be closed`, { cause });
    this.name = 'ContentAiAttemptCloseError';
  }
}

/** Another executor already owns a live dispatch for this target. */
export class ContentAiAttemptConflictError extends Error {
  constructor(readonly targetType: string, readonly targetId: string) {
    super(`AI target ${targetType}/${targetId} already has a running attempt`);
    this.name = 'ContentAiAttemptConflictError';
  }
}

const TARGET_TYPE = /^[a-z][a-z0-9_]{2,63}$/;
const TARGET_ID = /^[^\x00-\x1f\x7f]{1,128}$/;
const PROMPT_REF = /^[^\x00-\x1f\x7f]{1,200}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const ACTOR = /^[a-z][a-z0-9:_-]{2,119}$/;
const PROVIDER_REQUEST_ID = /^[\x21-\x7e]{1,128}$/;
const STATES: readonly ContentAiAttemptState[] = ['running', 'succeeded', 'failed', 'interrupted'];
const MAX_LATENCY_MS = 3_600_000;
const MAX_TOKENS = 1_000_000_000;

interface CloseFields {
  readonly state: Exclude<ContentAiAttemptState, 'running'>;
  readonly errorCode: ContentAiAttemptErrorCode | null;
  readonly outputSha256: string | null;
  readonly latencyMs?: number | null;
  readonly usage?: CreativeUsage;
  readonly providerRequestId?: string | undefined;
}

export function createContentAiAttemptService(options: {
  db: Database.Database;
  gateway: CreativeAiGateway;
  artifactRoot: string;
  clock: () => Date;
  newId: () => string;
}): ContentAiAttemptService {
  const { db, gateway, clock, newId } = options;
  const store = new ContentAddressedArtifactStore(options.artifactRoot);
  const schemaValidators = new WeakMap<object, ValidateFunction>();

  const compileResponseSchema = (schema: Readonly<Record<string, unknown>>): ValidateFunction => {
    const cached = schemaValidators.get(schema);
    if (cached) return cached;
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    addFormats(ajv);
    let validate: ValidateFunction;
    try { validate = ajv.compile(schema); }
    catch { throw new TypeError('responseSchema must be a valid JSON Schema'); }
    schemaValidators.set(schema, validate);
    return validate;
  };

  const now = (): string => clock().toISOString();

  const close = (attemptId: string, createdAt: string, fields: CloseFields): void => {
    const current = now();
    const closedAt = current < createdAt ? createdAt : current;
    const succeeded = fields.state === 'succeeded';
    const result = db.prepare(`
      UPDATE flow_content_ai_attempts
      SET state = ?, error_code = ?, output_sha256 = ?, closed_at = ?, latency_ms = ?,
          input_tokens = ?, output_tokens = ?, provider_request_id = ?
      WHERE attempt_id = ? AND state = 'running'
    `).run(
      fields.state, fields.errorCode, fields.outputSha256, closedAt, boundedLatency(fields.latencyMs),
      succeeded ? boundedTokens(fields.usage?.inputTokens) : null,
      succeeded ? boundedTokens(fields.usage?.outputTokens) : null,
      succeeded ? providerRequestId(fields.providerRequestId) : null,
      attemptId,
    );
    if (result.changes !== 1) throw new Error(`AI attempt ${attemptId} is no longer running`);
  };

  /** Closes in its own transaction; a failing close leaves the row running and is reported. */
  const closeOrReport = (attemptId: string, createdAt: string, fields: CloseFields): void => {
    try { db.transaction(() => close(attemptId, createdAt, fields))(); }
    catch (error) { throw new ContentAiAttemptCloseError(attemptId, fields.outputSha256, error); }
  };

  return {
    async run<S, T>(input: ContentAiAttemptInput, steps: ContentAiPersistSteps<S, T>) {
      // 0. Preflight: nothing is written and nothing is called when this fails.
      if (typeof steps !== 'object' || steps === null || typeof steps.persist !== 'function') throw new TypeError('persist must be a function');
      if (steps.persist.constructor.name === 'AsyncFunction') throw new TypeError('persist must be synchronous');
      if (steps.stage !== undefined && typeof steps.stage !== 'function') throw new TypeError('stage must be a function');
      const validateResponse = assertAttemptInput(input, compileResponseSchema);
      // 1. AI disabled: no row.
      if (!gateway.configured) throw new CreativeAiError('ai_not_configured');

      // 2. Commit the running row before the call.
      const attemptId = newId();
      assertContentUuid(attemptId);
      const createdAt = now();
      try {
        db.prepare(`
          INSERT INTO flow_content_ai_attempts(
            attempt_id, kind, modality, target_type, target_id, model, prompt_ref, input_bundle_sha256,
            planned_action_call_count, state, retry_of, actor_id, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'running', ?, ?, ?)
        `).run(
          attemptId, input.kind, input.call.modality, input.targetType, input.targetId, input.call.request.model,
          input.promptRef, input.inputBundleSha256, input.plannedActionCallCount, input.retryOf ?? null, input.actorId, createdAt,
        );
      } catch (error) {
        if (error instanceof Error && error.message.includes('flow_content_ai_attempt_retry_invalid')) {
          throw new TypeError('retry_of must name a failed or interrupted attempt for the same target');
        }
        // The partial unique index is the durable claim boundary. A second process may
        // pass all in-memory checks, so translate its SQLite conflict before any gateway
        // call is reachable.
        if (error instanceof Error && error.message.includes('flow_content_ai_attempts.target_type')) {
          throw new ContentAiAttemptConflictError(input.targetType, input.targetId);
        }
        throw error;
      }

      // 3. Exactly one gateway dispatch.
      let result: CreativeTextResult | CreativeImageResult;
      try {
        result = input.call.modality === 'text'
          ? await gateway.generateText(input.call.request)
          : await gateway.generateImage(input.call.request);
      } catch (error) {
        const safe = error instanceof CreativeAiError ? error : new CreativeAiError('network_error');
        closeOrReport(attemptId, createdAt, { state: 'failed', errorCode: safe.code, outputSha256: null });
        throw safe;
      }

      // 4. Validate. Invalid output is never stored or registered.
      let outcome: ContentAiAttemptOutcome;
      let bytes: Buffer;
      let mediaType: string;
      try {
        if (input.call.modality === 'text') {
          const textResult = result as CreativeTextResult;
          if (typeof textResult?.text !== 'string') throw new CreativeAiError('malformed_envelope');
          bytes = Buffer.from(textResult.text, 'utf8');
          let parsed: unknown;
          let parsedOk = false;
          try { parsed = JSON.parse(textResult.text); parsedOk = true; } catch { parsedOk = false; }
          if (validateResponse && (!parsedOk || !validateResponse(parsed))) throw new CreativeAiError('schema_mismatch');
          mediaType = parsedOk ? 'application/json' : 'text/plain';
          outcome = {
            attemptId, modality: 'text', result: textResult, outputSha256: sha256(bytes),
            ...(validateResponse ? { parsed } : {}),
          };
        } else {
          const imageResult = result as CreativeImageResult;
          if (!Buffer.isBuffer(imageResult?.bytes)) throw new CreativeAiError('malformed_envelope');
          bytes = imageResult.bytes;
          const sniffed = sniffImage(bytes);
          if (!sniffed) throw new CreativeAiError('invalid_image');
          if (imageResult.declaredMediaType !== undefined && imageResult.declaredMediaType !== sniffed) throw new CreativeAiError('invalid_image');
          let image: ContentImageInfo;
          try { image = inspectContentImage(bytes, { declaredType: sniffed, kind: 'PHOTO', decode: true }); }
          catch { throw new CreativeAiError('invalid_image'); }
          const format = CREATIVE_IMAGE_FORMATS[input.call.request.format];
          mediaType = sniffed;
          outcome = {
            attemptId, modality: 'image', result: imageResult, image,
            sizeMatchesFormat: image.width === format.width && image.height === format.height,
            outputSha256: sha256(bytes),
          };
        }
      } catch (error) {
        const safe = error instanceof CreativeAiError ? error : new CreativeAiError('malformed_envelope');
        closeOrReport(attemptId, createdAt, { state: 'failed', errorCode: safe.code, outputSha256: null, latencyMs: resultLatency(result) });
        throw safe;
      }
      const latencyMs = resultLatency(result);

      // 5. Store exact bytes in the plain store, then register the manifest in its own transaction.
      try {
        const stored = await store.put(bytes);
        if (stored.sha256 !== outcome.outputSha256 || stored.byteSize !== bytes.byteLength) throw new Error('Stored AI output digest mismatch');
        const acquiredAt = now();
        db.transaction(() => registerContentManifest(db, stored, acquiredAt, mediaType))();
      } catch (error) {
        closeOrReport(attemptId, createdAt, { state: 'failed', errorCode: 'persist_failed', outputSha256: null, latencyMs });
        throw error;
      }

      // 6. Optional staging of derived, reconstructable data.
      let staged: S | undefined;
      try {
        if (steps.stage) staged = await steps.stage(outcome);
      } catch (error) {
        closeOrReport(attemptId, createdAt, { state: 'failed', errorCode: 'persist_failed', outputSha256: outcome.outputSha256, latencyMs });
        throw error;
      }

      // 7. Synchronous persist and the successful close in one transaction.
      let persisted: T;
      try {
        persisted = db.transaction(() => {
          const value = steps.persist(outcome, staged);
          if (isThenable(value)) throw new TypeError('persist must be synchronous and must not return a promise');
          close(attemptId, createdAt, {
            state: 'succeeded', errorCode: null, outputSha256: outcome.outputSha256, latencyMs,
            ...(result.usage ? { usage: result.usage } : {}),
            providerRequestId: result.providerRequestId,
          });
          return value;
        })();
      } catch (error) {
        // 8. Domain writes rolled back; the registered output survives and stays associated.
        closeOrReport(attemptId, createdAt, { state: 'failed', errorCode: 'persist_failed', outputSha256: outcome.outputSha256, latencyMs });
        throw error;
      }
      return { outcome, persisted };
    },

    countRunning() {
      const row = db.prepare("SELECT COUNT(*) AS count FROM flow_content_ai_attempts WHERE state = 'running'").get() as { count: number | bigint };
      return Number(row.count);
    },

    sweepInterrupted(sweepAt: Date) {
      const at = sweepAt.toISOString();
      return db.transaction(() => db.prepare(`
        UPDATE flow_content_ai_attempts
        SET state = 'interrupted', error_code = 'interrupted_by_restart',
            closed_at = CASE WHEN created_at > ? THEN created_at ELSE ? END
        WHERE state = 'running'
      `).run(at, at).changes)();
    },

    list(filter) {
      const limit = filter.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new TypeError('limit must be an integer from 1 to 200');
      if (filter.state !== undefined && !STATES.includes(filter.state)) throw new TypeError('Unknown attempt state');
      const where: string[] = [];
      const values: unknown[] = [];
      if (filter.targetType !== undefined) { where.push('target_type = ?'); values.push(filter.targetType); }
      if (filter.targetId !== undefined) { where.push('target_id = ?'); values.push(filter.targetId); }
      if (filter.state !== undefined) { where.push('state = ?'); values.push(filter.state); }
      const rows = db.prepare(`
        SELECT * FROM flow_content_ai_attempts
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY created_at DESC, attempt_id DESC
        LIMIT ?
      `).all(...values, limit) as AttemptRow[];
      return rows.map(toRecord);
    },
  };
}

function assertAttemptInput(
  input: ContentAiAttemptInput,
  compile: (schema: Readonly<Record<string, unknown>>) => ValidateFunction,
): ValidateFunction | undefined {
  if (typeof input !== 'object' || input === null) throw new TypeError('AI attempt input is required');
  if (input.kind !== 'generate') throw new TypeError('kind must be generate');
  if (typeof input.targetType !== 'string' || !TARGET_TYPE.test(input.targetType)) throw new TypeError('targetType is invalid');
  if (typeof input.targetId !== 'string' || !TARGET_ID.test(input.targetId)) throw new TypeError('targetId is invalid');
  if (typeof input.promptRef !== 'string' || !PROMPT_REF.test(input.promptRef)) throw new TypeError('promptRef is invalid');
  if (typeof input.inputBundleSha256 !== 'string' || !SHA256.test(input.inputBundleSha256)) throw new TypeError('inputBundleSha256 must be a SHA-256 hex digest');
  if (typeof input.plannedActionCallCount !== 'number' || !Number.isInteger(input.plannedActionCallCount)
    || input.plannedActionCallCount < 1 || input.plannedActionCallCount > 100) {
    throw new TypeError('plannedActionCallCount must be an integer from 1 to 100');
  }
  if (typeof input.actorId !== 'string' || !ACTOR.test(input.actorId)) throw new TypeError('actorId is invalid');
  if (input.retryOf !== undefined) assertContentUuid(input.retryOf);
  const call = input.call;
  if (typeof call !== 'object' || call === null || typeof call.request !== 'object' || call.request === null) throw new TypeError('call is required');
  const model: unknown = call.request.model;
  if (!isCreativeModel(model) || CREATIVE_MODEL_ROUTES[model].kind !== call.modality) throw new TypeError('call model does not match its modality');
  if (call.modality === 'image') {
    if (!Object.hasOwn(CREATIVE_IMAGE_FORMATS, call.request.format)) throw new TypeError('image format is invalid');
    return undefined;
  }
  if (call.responseSchema === undefined) return undefined;
  if (typeof call.responseSchema !== 'object' || call.responseSchema === null) throw new TypeError('responseSchema must be an object');
  return compile(call.responseSchema);
}

function sniffImage(bytes: Buffer): 'image/png' | 'image/jpeg' | undefined {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  return undefined;
}

function isThenable(value: unknown): boolean {
  return (typeof value === 'object' || typeof value === 'function') && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

function resultLatency(result: { readonly latencyMs?: unknown } | null | undefined): number | null {
  return boundedLatency(result?.latencyMs);
}

function boundedLatency(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.min(Math.round(value), MAX_LATENCY_MS);
}

function boundedTokens(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_TOKENS ? value : null;
}

function providerRequestId(value: unknown): string | null {
  return typeof value === 'string' && PROVIDER_REQUEST_ID.test(value) ? value : null;
}

interface AttemptRow {
  attempt_id: string; kind: 'generate' | 'edit'; modality: 'text' | 'image'; target_type: string; target_id: string;
  model: CreativeModel; prompt_ref: string; input_bundle_sha256: string; output_sha256: string | null;
  planned_action_call_count: number | bigint; state: ContentAiAttemptState; error_code: ContentAiAttemptErrorCode | null;
  retry_of: string | null; actor_id: string; created_at: string; closed_at: string | null;
  latency_ms: number | bigint | null; provider_request_id: string | null;
  input_tokens: number | bigint | null; output_tokens: number | bigint | null;
}

const optionalNumber = (value: number | bigint | null): number | null => (value === null ? null : Number(value));

function toRecord(row: AttemptRow): ContentAiAttemptRecord {
  return {
    attemptId: row.attempt_id,
    kind: row.kind,
    modality: row.modality,
    targetType: row.target_type,
    targetId: row.target_id,
    model: row.model,
    promptRef: row.prompt_ref,
    inputBundleSha256: row.input_bundle_sha256,
    plannedActionCallCount: Number(row.planned_action_call_count),
    state: row.state,
    errorCode: row.error_code,
    retryOf: row.retry_of,
    actorId: row.actor_id,
    createdAt: row.created_at,
    closedAt: row.closed_at,
    outputSha256: row.output_sha256,
    inputTokens: optionalNumber(row.input_tokens),
    outputTokens: optionalNumber(row.output_tokens),
    latencyMs: optionalNumber(row.latency_ms),
    providerRequestId: row.provider_request_id,
  };
}
