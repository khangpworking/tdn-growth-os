// Retained record for one versioned AI keyword/exclusion draft (plan U-12).
//
// The record binds the exact run, the frozen scope digest, the frozen source
// set digest when one exists, retained sales-name references, the original
// seed bytes, the data version, the full model prompt plus model identity,
// and the drafted output. It is stored through the generic content-addressed
// artifact store; replay re-reads the exact bytes and verifies the digest, so
// a corrupted or substituted record fails closed instead of replaying.
// Keyword lists need no human approval or adoption: the record carries no
// approval fields by design, and provenance stays MODEL_DRAFTED. Missing
// collection prerequisites are a service-side gating concern; this module
// only retains and replays explicitly supplied bindings.

import { createHash } from 'node:crypto';
import { canonicalJson } from '../foundation/canonical-json.js';
import { ArtifactIntegrityError, type ContentAddressedArtifactStore } from '../../platform/artifacts/artifact-store.js';
import type { KeywordMeaningFilterData } from './keyword-meaning-filter.js';

export const KEYWORD_LIST_DRAFT_RECORD_CONTRACT = 'l9-keyword-list-draft-record-v1' as const;

const PROMPT_MAX_BYTES = 65536;
const SEED_TERM_MAX_CHARS = 200;
const SEED_LIST_MAX_ITEMS = 200;

export interface KeywordListDraftSalesRef {
  /** Digest of the retained sales-evidence bytes the name came from. */
  readonly digest: string;
  /** Locator of the name within those bytes (path, row, or pointer). */
  readonly locator: string;
}

export interface KeywordListDraftModel {
  /** Model identity string, e.g. a fake transport name in tests. */
  readonly identity: string;
  readonly promptVersion: string;
  /** Full prompt text sent to the model. */
  readonly prompt: string;
}

export interface KeywordListDraftRecord {
  readonly contractVersion: typeof KEYWORD_LIST_DRAFT_RECORD_CONTRACT;
  readonly run: { readonly workspaceId: string; readonly runId: string };
  readonly scopeDigest: string;
  readonly sourceSetDigest: string | null;
  readonly salesNameRefs: readonly KeywordListDraftSalesRef[];
  readonly seeds: {
    readonly productNames: readonly string[];
    readonly includeTerms: readonly string[];
    readonly excludeTerms: readonly string[];
  };
  readonly dataVersion: string;
  readonly category: string;
  readonly model: KeywordListDraftModel;
  readonly output: KeywordMeaningFilterData;
}

export interface KeywordListDraftReceipt {
  readonly digest: string;
  readonly byteSize: number;
}

export class KeywordListDraftRecordError extends Error {
  readonly code = 'INVALID_KEYWORD_LIST_DRAFT_RECORD';
}

function fail(message: string): never {
  throw new KeywordListDraftRecordError(message);
}

function checkDigest(value: unknown, what: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/.test(value)) fail(`${what} must be a sha256 hex digest`);
  return value as string;
}

function checkText(value: unknown, what: string, max: number, allowEmpty: boolean): string {
  if (typeof value !== 'string' || (!allowEmpty && value.trim().length === 0) || value.length > max) {
    fail(`${what} must be a string within ${max} characters${allowEmpty ? '' : ' and non-empty'}`);
  }
  return value as string;
}

function checkTerms(values: unknown, what: string): readonly string[] {
  if (!Array.isArray(values) || values.length > SEED_LIST_MAX_ITEMS) fail(`${what} must be a list of at most ${SEED_LIST_MAX_ITEMS} terms`);
  return (values as unknown[]).map(term => checkText(term, `${what} term`, SEED_TERM_MAX_CHARS, false));
}

/** Structural validation mirroring the planned canonical record contract. */
export function checkKeywordListDraftRecord(value: unknown): asserts value is KeywordListDraftRecord {
  if (!value || typeof value !== 'object') fail('record must be an object');
  const record = value as Record<string, unknown>;
  if (record.contractVersion !== KEYWORD_LIST_DRAFT_RECORD_CONTRACT) fail('record contract version mismatch');
  const run = record.run as Record<string, unknown> | undefined;
  if (!run || typeof run !== 'object') fail('record.run must be an object');
  checkText(run.workspaceId, 'record.run.workspaceId', 36, false);
  checkText(run.runId, 'record.run.runId', 36, false);
  checkDigest(record.scopeDigest, 'record.scopeDigest');
  if (record.sourceSetDigest !== null) checkDigest(record.sourceSetDigest, 'record.sourceSetDigest');
  if (!Array.isArray(record.salesNameRefs) || record.salesNameRefs.length > 500) fail('record.salesNameRefs must be a list');
  for (const ref of record.salesNameRefs as unknown[]) {
    if (!ref || typeof ref !== 'object') fail('record.salesNameRefs entries must be objects');
    checkDigest((ref as Record<string, unknown>).digest, 'record.salesNameRefs.digest');
    checkText((ref as Record<string, unknown>).locator, 'record.salesNameRefs.locator', 500, false);
  }
  const seeds = record.seeds as Record<string, unknown> | undefined;
  if (!seeds || typeof seeds !== 'object') fail('record.seeds must be an object');
  const seedRecord = seeds as Record<string, unknown>;
  checkTerms(seedRecord.productNames, 'record.seeds.productNames');
  if ((seedRecord.productNames as unknown[]).length === 0) fail('record.seeds.productNames must not be empty');
  checkTerms(seedRecord.includeTerms, 'record.seeds.includeTerms');
  checkTerms(seedRecord.excludeTerms, 'record.seeds.excludeTerms');
  checkText(record.dataVersion, 'record.dataVersion', 80, false);
  checkText(record.category, 'record.category', 120, false);
  const model = record.model as Record<string, unknown> | undefined;
  if (!model || typeof model !== 'object') fail('record.model must be an object');
  checkText(model.identity, 'record.model.identity', 200, false);
  checkText(model.promptVersion, 'record.model.promptVersion', 80, false);
  if (typeof model.prompt !== 'string' || model.prompt.length === 0 ||
      Buffer.byteLength(model.prompt, 'utf8') > PROMPT_MAX_BYTES) {
    fail(`record.model.prompt must be non-empty within ${PROMPT_MAX_BYTES} bytes`);
  }
  const output = record.output as Record<string, unknown> | undefined;
  if (!output || typeof output !== 'object' || output.contractVersion !== 'l9-keyword-data-v1') {
    fail('record.output must be canonical filter data');
  }
}

/**
 * Retain one draft record as an immutable artifact. Returns the content digest;
 * identical bytes retain idempotently to the same digest.
 */
export async function retainKeywordListDraft(
  store: ContentAddressedArtifactStore,
  record: KeywordListDraftRecord,
): Promise<KeywordListDraftReceipt> {
  checkKeywordListDraftRecord(record);
  const bytes = Buffer.from(canonicalJson(record), 'utf8');
  const stored = await store.put(new Uint8Array(bytes));
  return { digest: stored.sha256, byteSize: stored.byteSize };
}

/**
 * Replay one retained draft record: exact bytes are re-read and the digest is
 * re-verified, so corruption or substitution fails closed. No model is called.
 */
export async function replayKeywordListDraft(
  store: ContentAddressedArtifactStore,
  digest: string,
  maxBytes = 4 * 1024 * 1024,
): Promise<KeywordListDraftRecord> {
  checkDigest(digest, 'digest');
  let bytes: Buffer;
  try {
    bytes = await store.read(digest, { maxBytes });
  } catch (error) {
    if (error instanceof ArtifactIntegrityError) fail(`retained draft record failed digest verification: ${digest}`);
    fail(`retained draft record is missing: ${digest}`);
  }
  const actual = createHash('sha256').update(bytes!).digest('hex');
  if (actual !== digest) fail('retained draft record failed digest verification');
  let record: unknown;
  try {
    record = JSON.parse(bytes!.toString('utf8'));
  } catch {
    fail('retained draft record is not valid JSON');
  }
  checkKeywordListDraftRecord(record);
  return record;
}
