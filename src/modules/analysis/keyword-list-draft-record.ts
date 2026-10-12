import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import schema from '../../../contracts/analysis/keyword-list-draft-record.schema.json' with { type: 'json' };
import v3Schema from '../../../contracts/analysis/keyword-list-draft-record-v3.schema.json' with { type: 'json' };
import sourceSetSchema from '../../../contracts/analysis/automation-confirmed-source-set.schema.json' with { type: 'json' };
import draftSchema from '../../../contracts/analysis/keyword-list-draft.schema.json' with { type: 'json' };
import filterSchema from '../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import type { KeywordListDraftRecord } from '../../../contracts/analysis/keyword-list-draft-record.generated.js';
import type { KeywordListDraftRecordV3 } from '../../../contracts/analysis/keyword-list-draft-record-v3.generated.js';
import type { AutomationConfirmedSourceSet } from '../../../contracts/analysis/automation-confirmed-source-set.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/artifact-store.js';
import { MAX_CAPTURE_BYTES, MAX_CAPTURE_ENVELOPE_BYTES } from './research-automation/model.js';
import { decodeSalesCapture } from './research-automation/sales-name-evidence.js';
import { readMetricSalesNameEvidence } from './research-automation/metric-sales-name-evidence.js';
import type { MetricRunInput } from './research-automation/metric-method-bridge.js';
import { registerPrivateReviewSchemas } from './research-automation/private-review-contracts.js';
import { filterKeywordMeanings } from './keyword-meaning-filter.js';
export type { KeywordListDraftRecord } from '../../../contracts/analysis/keyword-list-draft-record.generated.js';
export type { KeywordListDraftRecordV3, MetricWorkbookTitleCellRef } from '../../../contracts/analysis/keyword-list-draft-record-v3.generated.js';
export type RetainedKeywordListDraftRecord = KeywordListDraftRecord | KeywordListDraftRecordV3;
/** Internal owning-service context, never a caller-authored retained schema. */
export interface MetricKeywordDraftEvidenceContext {
  options: Parameters<typeof readMetricSalesNameEvidence>[0];
  input: MetricRunInput;
  sources: AutomationConfirmedSourceSet;
  sourceSetDigest: string;
}
export type KeywordListDraftSalesRef = KeywordListDraftRecord['salesNameRefs'][number];
export type KeywordListDraftModel = KeywordListDraftRecord['model'];
export const KEYWORD_LIST_DRAFT_RECORD_CONTRACT = 'l9-keyword-list-draft-record-v2' as const;
// Read safety bound, matching the automation JSON artifact budget; not a business policy.
export const MAX_KEYWORD_DRAFT_BYTES = 8 * 1024 * 1024;
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
addFormats(ajv);
registerPrivateReviewSchemas(ajv);
ajv.addSchema([draftSchema, filterSchema, sourceSetSchema]);
const validate = ajv.compile<KeywordListDraftRecord>(schema);
const validateV3 = ajv.compile<KeywordListDraftRecordV3>(v3Schema);
export class KeywordListDraftRecordError extends Error { readonly code = 'INVALID_KEYWORD_LIST_DRAFT_RECORD'; }
function fail(message: string): never { throw new KeywordListDraftRecordError(message); }
export function checkKeywordListDraftRecord(value: unknown): asserts value is KeywordListDraftRecord {
  if (!validate(value)) fail('record failed canonical schema validation');
  checkDraftContent(value);
}
function checkDraftContent(value: RetainedKeywordListDraftRecord): void {
  if (value.output.dataVersion !== value.dataVersion || value.output.category !== value.category || value.output.provenance !== 'MODEL_DRAFTED') fail('draft output identity differs from request');
  try { filterKeywordMeanings(value.output, []); } catch { fail('draft output failed semantic validation'); }
  if (value.salesNameRefs.length !== value.seeds.productNames.length) fail('each product name requires one exact sales reference');
  if (Buffer.byteLength(value.model.prompt) > 65536) fail('prompt exceeds transport safety budget');
  if (value.model.configuration && value.model.identity !== `${value.model.configuration.providerId}:${value.model.configuration.modelId}`) fail('model identity differs from retained dispatch configuration');
  if (value.model.promptSha256 !== createHash('sha256').update(value.model.prompt).digest('hex')) fail('prompt digest mismatch');
}
export function checkRetainedKeywordListDraftRecord(value: unknown): asserts value is RetainedKeywordListDraftRecord {
  if (validate(value)) { checkDraftContent(value); return; }
  if (!validateV3(value)) fail('record failed canonical versioned schema validation');
  checkDraftContent(value);
}
/** RFC6901 only: locators are never interpreted as code or filesystem paths. */
export function readJsonPointer(value: unknown, pointer: string): unknown {
  if (!pointer.startsWith('/') || /~(?![01])/u.test(pointer)) fail('invalid evidence JSON pointer');
  let current: unknown = value;
  for (const part of pointer.slice(1).split('/')) {
    const key = part.replace(/~1/g, '/').replace(/~0/g, '~');
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) fail('sales name locator is missing');
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}
async function readJson(store: ContentAddressedArtifactStore, digest: string, maxBytes = MAX_KEYWORD_DRAFT_BYTES): Promise<unknown> {
  try { return JSON.parse((await store.read(digest, { maxBytes })).toString('utf8')); }
  catch { fail('retained evidence is missing or failed digest verification'); }
}
/** Replay verifies dependency bytes, original scope terms and every exact source name. Service additionally verifies admission to the run. */
async function verifyFrozenKeywordScope(store: ContentAddressedArtifactStore, record: RetainedKeywordListDraftRecord): Promise<Record<string, unknown>> {
  const scope = await readJson(store, record.scopeDigest) as Record<string, unknown>;
  if (scope.workspaceId !== record.run.workspaceId || scope.runId !== record.run.runId ||
      canonicalJson(scope.includeTerms) !== canonicalJson(record.seeds.includeTerms) || canonicalJson(scope.excludeTerms) !== canonicalJson(record.seeds.excludeTerms)) fail('frozen scope evidence differs from draft');
  if (record.sourceSetDigest !== null) {
    const sources = await readJson(store, record.sourceSetDigest) as Record<string, unknown>;
    if (sources.workspaceId !== record.run.workspaceId || sources.runId !== record.run.runId || sources.scopeSha256 !== record.scopeDigest) fail('frozen source membership differs from draft');
  }
  return scope;
}
export async function verifyKeywordDraftEvidence(store: ContentAddressedArtifactStore, record: KeywordListDraftRecord): Promise<void> {
  checkKeywordListDraftRecord(record);
  const scope = await verifyFrozenKeywordScope(store, record);
  const selected = new Set([...(Array.isArray(scope.selectedProductIds) ? scope.selectedProductIds : []), ...(Array.isArray(scope.peerProductIds) ? scope.peerProductIds : [])].map(id => String(id).replace(/^kalodata:/, '')));
  const seen = new Set<string>();
  for (const [index, ref] of record.salesNameRefs.entries()) {
    const key = `${ref.digest}#${ref.locator}`;
    if (seen.has(key)) fail('duplicate sales evidence reference');
    seen.add(key);
    const envelope = await readJson(store, ref.captureDigest, MAX_CAPTURE_ENVELOPE_BYTES) as Record<string, unknown>;
    let raw: ReturnType<typeof decodeSalesCapture>;
    try { raw = decodeSalesCapture(envelope); } catch { fail('sales capture is not authentic retained sales evidence'); }
    if (createHash('sha256').update(raw.bytes).digest('hex') !== ref.digest) fail('sales reference differs from its capture bytes');
    const source = await readJson(store, ref.digest, MAX_CAPTURE_BYTES);
    const locatorPattern = envelope.operation === 'kalodata.product.rank' ? /^\/data\/(0|[1-9][0-9]*)\/product_name$/ : /^\/data\/product_name$/;
    if (!locatorPattern.test(ref.locator)) fail('sales name locator differs from connector operation');
    const product = readJsonPointer(source, ref.locator.slice(0, -'/product_name'.length)) as { product_id?: unknown } | null;
    if (!product || typeof product.product_id !== 'string' || !selected.has(product.product_id)) fail('sales name is not a selected frozen product');
    if (readJsonPointer(source, ref.locator) !== record.seeds.productNames[index]) fail('product name differs from exact retained source bytes');
  }
}
export async function retainKeywordListDraft(store: ContentAddressedArtifactStore, record: KeywordListDraftRecord,
  checkCancellation?: () => void): Promise<{ digest: string; byteSize: number }> {
  await verifyKeywordDraftEvidence(store, record);
  checkCancellation?.();
  const bytes = Buffer.from(canonicalJson(record));
  if (bytes.length > MAX_KEYWORD_DRAFT_BYTES) fail('draft artifact exceeds safety budget');
  const stored = await store.put(bytes);
  return { digest: stored.sha256, byteSize: stored.byteSize };
}
export async function replayKeywordListDraft(store: ContentAddressedArtifactStore, digest: string): Promise<KeywordListDraftRecord> {
  const record = await readJson(store, digest);
  checkKeywordListDraftRecord(record);
  await verifyKeywordDraftEvidence(store, record);
  return record;
}

/** Additive dispatch; historical v2 always uses its original capture replay. */
export async function verifySourceKeywordDraftEvidence(store: ContentAddressedArtifactStore, record: RetainedKeywordListDraftRecord,
  context?: MetricKeywordDraftEvidenceContext): Promise<void> {
  checkRetainedKeywordListDraftRecord(record);
  if (record.contractVersion === 'l9-keyword-list-draft-record-v2') return verifyKeywordDraftEvidence(store, record);
  await verifyFrozenKeywordScope(store, record);
  if (!context || context.options.artifacts !== store || context.sourceSetDigest !== record.sourceSetDigest ||
      context.input.runId !== record.run.runId || context.input.start.workspaceId !== record.run.workspaceId ||
      createHash('sha256').update(canonicalJson(context.input.scope)).digest('hex') !== record.scopeDigest)
    fail('Metric draft requires its exact owning-service frozen source context');
  const metric = await readMetricSalesNameEvidence(context.options, context.input, context.sources, context.sourceSetDigest);
  if (!metric) fail('Metric draft source is not admitted');
  const seen = new Set<string>();
  const legacyRefs: KeywordListDraftSalesRef[] = [], legacyNames: string[] = [];
  for (const [index, ref] of record.salesNameRefs.entries()) {
    if ('captureDigest' in ref) {
      const key = `capture:${ref.digest}#${ref.locator}`;
      if (seen.has(key)) fail('duplicate sales evidence reference');
      seen.add(key); legacyRefs.push(ref); legacyNames.push(record.seeds.productNames[index]!);
      continue;
    }
    const key = `metric:${ref.sourcePackage.packageId}:${ref.workbook.sha256}#${ref.locator}`;
    if (seen.has(key)) fail('duplicate sales evidence reference');
    seen.add(key);
    const original = metric.names.find(cell => cell.row === ref.row && cell.locator === ref.locator);
    if (canonicalJson(ref.sourcePackage) !== canonicalJson(metric.sourcePackage) || canonicalJson(ref.workbook) !== canonicalJson(metric.workbook) ||
        !original || original.name !== record.seeds.productNames[index]) fail('Metric draft cell differs from exact retained workbook evidence');
  }
  // Reuse the unchanged v2 verifier for the exact original capture subset;
  // this projection is never persisted or substituted for the retained v3 bytes.
  if (legacyRefs.length) await verifyKeywordDraftEvidence(store, { ...record, contractVersion: 'l9-keyword-list-draft-record-v2',
    salesNameRefs: legacyRefs as KeywordListDraftRecord['salesNameRefs'],
    seeds: { ...record.seeds, productNames: legacyNames as [string, ...string[]] } });
}

export async function retainSourceKeywordListDraft(store: ContentAddressedArtifactStore, record: RetainedKeywordListDraftRecord,
  context?: MetricKeywordDraftEvidenceContext, checkCancellation?: () => void): Promise<{ digest: string; byteSize: number }> {
  if (record.contractVersion === 'l9-keyword-list-draft-record-v2') return retainKeywordListDraft(store, record, checkCancellation);
  await verifySourceKeywordDraftEvidence(store, record, context);
  checkCancellation?.();
  const bytes = Buffer.from(canonicalJson(record));
  if (bytes.length > MAX_KEYWORD_DRAFT_BYTES) fail('draft artifact exceeds safety budget');
  const stored = await store.put(bytes);
  return { digest: stored.sha256, byteSize: stored.byteSize };
}

export async function replaySourceKeywordListDraft(store: ContentAddressedArtifactStore, digest: string,
  context?: MetricKeywordDraftEvidenceContext): Promise<RetainedKeywordListDraftRecord> {
  const record = await readJson(store, digest);
  checkRetainedKeywordListDraftRecord(record);
  await verifySourceKeywordDraftEvidence(store, record, context);
  return record;
}
