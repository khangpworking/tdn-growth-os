import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import schema from '../../../contracts/analysis/keyword-list-draft-record.schema.json' with { type: 'json' };
import draftSchema from '../../../contracts/analysis/keyword-list-draft.schema.json' with { type: 'json' };
import filterSchema from '../../../contracts/analysis/keyword-meaning-filter.schema.json' with { type: 'json' };
import type { KeywordListDraftRecord } from '../../../contracts/analysis/keyword-list-draft-record.generated.js';
import { canonicalJson } from '../foundation/canonical-json.js';
import type { ContentAddressedArtifactStore } from '../../platform/artifacts/artifact-store.js';
import { MAX_CAPTURE_BYTES, MAX_CAPTURE_ENVELOPE_BYTES } from './research-automation/model.js';
import { decodeSalesCapture } from './research-automation/sales-name-evidence.js';
import { filterKeywordMeanings } from './keyword-meaning-filter.js';
export type { KeywordListDraftRecord } from '../../../contracts/analysis/keyword-list-draft-record.generated.js';
export type KeywordListDraftSalesRef = KeywordListDraftRecord['salesNameRefs'][number];
export type KeywordListDraftModel = KeywordListDraftRecord['model'];
export const KEYWORD_LIST_DRAFT_RECORD_CONTRACT = 'l9-keyword-list-draft-record-v2' as const;
// Read safety bound, matching the automation JSON artifact budget; not a business policy.
export const MAX_KEYWORD_DRAFT_BYTES = 8 * 1024 * 1024;
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const ajv = new Ajv2020({ strict: true });
ajv.addSchema([draftSchema, filterSchema]);
const validate = ajv.compile<KeywordListDraftRecord>(schema);
export class KeywordListDraftRecordError extends Error { readonly code = 'INVALID_KEYWORD_LIST_DRAFT_RECORD'; }
function fail(message: string): never { throw new KeywordListDraftRecordError(message); }
export function checkKeywordListDraftRecord(value: unknown): asserts value is KeywordListDraftRecord {
  if (!validate(value)) fail('record failed canonical schema validation');
  if (value.output.dataVersion !== value.dataVersion || value.output.category !== value.category || value.output.provenance !== 'MODEL_DRAFTED') fail('draft output identity differs from request');
  try { filterKeywordMeanings(value.output, []); } catch { fail('draft output failed semantic validation'); }
  if (value.salesNameRefs.length !== value.seeds.productNames.length) fail('each product name requires one exact sales reference');
  if (Buffer.byteLength(value.model.prompt) > 65536) fail('prompt exceeds transport safety budget');
  if (value.model.configuration && value.model.identity !== `${value.model.configuration.providerId}:${value.model.configuration.modelId}`) fail('model identity differs from retained dispatch configuration');
  if (value.model.promptSha256 !== createHash('sha256').update(value.model.prompt).digest('hex')) fail('prompt digest mismatch');
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
export async function verifyKeywordDraftEvidence(store: ContentAddressedArtifactStore, record: KeywordListDraftRecord): Promise<void> {
  checkKeywordListDraftRecord(record);
  const scope = await readJson(store, record.scopeDigest) as Record<string, unknown>;
  if (scope.workspaceId !== record.run.workspaceId || scope.runId !== record.run.runId ||
      canonicalJson(scope.includeTerms) !== canonicalJson(record.seeds.includeTerms) || canonicalJson(scope.excludeTerms) !== canonicalJson(record.seeds.excludeTerms)) fail('frozen scope evidence differs from draft');
  if (record.sourceSetDigest !== null) {
    const sources = await readJson(store, record.sourceSetDigest) as Record<string, unknown>;
    if (sources.workspaceId !== record.run.workspaceId || sources.runId !== record.run.runId || sources.scopeSha256 !== record.scopeDigest) fail('frozen source membership differs from draft');
  }
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
export async function retainKeywordListDraft(store: ContentAddressedArtifactStore, record: KeywordListDraftRecord): Promise<{ digest: string; byteSize: number }> {
  await verifyKeywordDraftEvidence(store, record);
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
