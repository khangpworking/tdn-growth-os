import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import legacySchema from '../../../contracts/foundation/shopee-collection.schema.json' with { type: 'json' };
import rowsSchema from '../../../contracts/foundation/shopee-public-rows.schema.json' with { type: 'json' };
import collectionSchema from '../../../contracts/foundation/shopee-public-collection.schema.json' with { type: 'json' };
import journalSchema from '../../../contracts/foundation/shopee-public-journal.schema.json' with { type: 'json' };
import type { ShopeePublicCollection } from '../../../contracts/foundation/shopee-public-collection.generated.js';
import type { ShopeePublicJournal } from '../../../contracts/foundation/shopee-public-journal.generated.js';
import type { ShopeePublicRows } from '../../../contracts/foundation/shopee-public-rows.generated.js';
import type { ShopeeCollector, ShopeeTransportListing } from './apify-shopee.js';
import { canonicalJson } from '../../modules/foundation/canonical-json.js';

export const PUBLIC_REVIEW_PROVIDER = 'shopee-public-review' as const;
export const PUBLIC_REVIEW_MAPPING = 'shopee-public-review-row-v1' as const;
export const PUBLIC_REVIEW_MAX_BYTES = 8 * 1024 * 1024;
export type PublicReviewReceipt = ShopeePublicCollection['listings'][number];
export type PublicReviewEnvelope = NonNullable<ShopeePublicJournal['snapshot']>;
export type PublicReviewStage = import('../../../contracts/foundation/shopee-public-collection.generated.js').Stage;
export interface PublicCollectedPages {
  mode: 'fixture' | 'live'; confirmedSourceSetSha256: string; providerId: typeof PUBLIC_REVIEW_PROVIDER;
  mappingRevision: typeof PUBLIC_REVIEW_MAPPING; maxReviewsPerProduct: number; usageTotalUsd: 0;
  warnings: string[]; pages: { bytes: Buffer; offset: number }[]; envelopes: PublicReviewEnvelope[];
  listings: PublicReviewReceipt[]; attemptedAt: string; reused: boolean;
}
export interface ShopeePublicReviewCollectorOptions {
  token: string; baseUrl?: string; maxReviewsPerProduct?: number; journalRoot: string;
  confirmedSourceSetSha256: string; sampleMode?: 'STANDARD' | 'TRIAL';
  fetch?: typeof fetch; sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>; clock?: () => Date;
  now?: () => Date;
}
const require = createRequire(import.meta.url);
const { Ajv2020 } = require('ajv/dist/2020.js') as typeof import('ajv/dist/2020.js');
const addFormats = (require('ajv-formats') as typeof import('ajv-formats')).default;
const ajv = new Ajv2020({ strict: true, allErrors: false }); addFormats(ajv);
for (const [name, schema] of [['shopee-collection', legacySchema], ['shopee-public-rows', rowsSchema], ['shopee-public-collection', collectionSchema], ['shopee-public-journal', journalSchema]] as const) ajv.addSchema(schema, name + '.schema.json');
ajv.addSchema(legacySchema, 'https://tdn.local/contracts/foundation/shopee-collection.schema.json');
const validUtc = ajv.compile<string>({ type: 'string', format: 'date-time', pattern: 'Z$' });
const validRows = ajv.compile<ShopeePublicRows>({ $ref: 'shopee-public-rows.schema.json' });
const validJournal = ajv.compile<ShopeePublicJournal>({ $ref: 'shopee-public-journal.schema.json' });
const validJob = ajv.compile<NonNullable<ShopeePublicJournal['job']>>({ $ref: 'shopee-public-collection.schema.json#/$defs/job' });
const validJobId = ajv.compile<string>({ type: 'string', format: 'uuid' });
const validEnvelope = ajv.compile<PublicReviewEnvelope>({ $ref: 'shopee-public-collection.schema.json#/$defs/envelope' });
const validCollection = ajv.compile<ShopeePublicCollection>({ $ref: 'shopee-public-collection.schema.json' });
const validSource = ajv.compile<import('../../../contracts/foundation/shopee-public-collection.generated.js').PublicReviewSource>({ $ref: 'shopee-public-collection.schema.json#/$defs/publicReviewSource' });
const validStage = ajv.compile<PublicReviewStage>({ $ref: 'shopee-public-collection.schema.json#/$defs/stage' });
export function validatePublicCollection(value: unknown): ShopeePublicCollection { if (!validCollection(value)) throw new ShopeePublicReviewError('SHOPEE_REVIEW_INVALID_RESPONSE'); return value; }
export function validatePublicEnvelope(value: unknown): PublicReviewEnvelope { if (!validEnvelope(value) || Buffer.byteLength(canonicalJson(value)) > PUBLIC_REVIEW_MAX_BYTES) throw new ShopeePublicReviewError('SHOPEE_REVIEW_INVALID_RESPONSE'); return value; }
export function validatePublicReviewStage(value: unknown): PublicReviewStage { if (!validStage(value)) throw new ShopeePublicReviewError('SHOPEE_REVIEW_INVALID_RESPONSE'); return value; }
export function validatePublicReviewSource(value: unknown): import('../../../contracts/foundation/shopee-public-collection.generated.js').PublicReviewSource { if (!validSource(value)) throw new ShopeePublicReviewError('SHOPEE_REVIEW_INVALID_RESPONSE'); return value; }
export class ShopeePublicReviewError extends Error {
  constructor(readonly code: string, readonly operation?: string, readonly httpStatus?: number) { super(code); this.name = 'ShopeePublicReviewError'; }
}
const fail = (code = 'SHOPEE_REVIEW_INVALID_RESPONSE'): never => { throw new ShopeePublicReviewError(code); };
const hash = (v: Buffer | string) => createHash('sha256').update(v).digest('hex');
const bytes = (v: unknown) => Buffer.from(canonicalJson(v));
const object = (v: unknown): Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v) ? v as Record<string, unknown> : fail();
const integer = (v: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): v is number => Number.isSafeInteger(v) && (v as number) >= min && (v as number) <= max;
const reviewIdentity = (v: unknown): string | null => typeof v === 'string' && v.length > 0 && v.length <= 2000 ? v : null;
const utc = (v: unknown): v is string => validUtc(v) && Number.isFinite(Date.parse(v));
const validZeroOffset = ajv.compile<string>({ type: 'string', format: 'date-time', pattern: '\\+00:00$' });
/** Service timestamps may carry an explicit zero offset (Python isoformat). Read as UTC and stored as canonical Z; anything else passes through for the normal check. */
const serviceUtc = (v: unknown): unknown => validZeroOffset(v) && Number.isFinite(Date.parse(v)) ? new Date(Date.parse(v)).toISOString() : v;
const active = (v: string) => v === 'queued' || v === 'running';
const blocking = (r: PublicReviewReceipt) => r.stopCode !== null || r.state === 'needs_login' || r.state === 'needs_verification';
const mutexes = new Map<string, Promise<unknown>>();

/** No source text is rewritten. This conversion never consults the host timezone. */
export function publicReviewLocalTime(value: string): string | null {
  if (!/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test(value)) return null;
  const [y, mo, d, h, mi] = value.match(/\d+/g)!.map(Number) as [number, number, number, number, number];
  const date = new Date(0); date.setUTCFullYear(y, mo - 1, d); date.setUTCHours(h, mi, 0, 0);
  if (y < 1 || date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || h > 23 || mi > 59) return null;
  return value.replace(' ', 'T') + ':00+07:00';
}
export function normalizePublicReviewUrl(value: unknown): string {
  if (typeof value !== 'string') return fail();
  let u: URL; try { u = new URL(value); } catch { return fail(); }
  if (u.protocol !== 'https:' || !['shopee.vn', 'www.shopee.vn'].includes(u.hostname) || u.username || u.password || u.port) return fail();
  const m = u.pathname.match(/^\/product\/([1-9][0-9]{0,19})\/([1-9][0-9]{0,19})\/?$/) ?? u.pathname.match(/-i\.([1-9][0-9]{0,19})\.([1-9][0-9]{0,19})\/?$/);
  return m ? `https://shopee.vn/product/${m[1]}/${m[2]}` : fail();
}
/** One row of the shared job list. A row that is not ours or not valid never throws; the caller decides what that means. */
function listRow(raw: unknown): { id: string | null; url: string | null; job: NonNullable<ShopeePublicJournal['job']> | null } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { id: null, url: null, job: null };
  const v = raw as Record<string, unknown>;
  const id = validJobId(v.id) ? v.id : null;
  const r = typeof v.request === 'object' && v.request !== null && !Array.isArray(v.request) ? v.request as Record<string, unknown> : null;
  let url: string | null = null; try { url = r ? normalizePublicReviewUrl(r.url) : null; } catch { url = null; }
  if (!r || url === null) return { id, url, job: null };
  const job = { id: v.id, request: { url, max_comments: r.max_comments }, state: v.state, created_at: serviceUtc(v.created_at), updated_at: serviceUtc(v.updated_at),
    result_available: v.result_available, ...(v.collected === undefined ? {} : { collected: v.collected }) };
  return { id, url, job: validJob(job) ? job : null };
}
function bounded(v: string, max: number) { if (Buffer.byteLength(v) > max) fail('SHOPEE_REVIEW_LIMIT'); return v; }
export function mapPublicReviewResult(raw: unknown, job: NonNullable<ShopeePublicJournal['job']>, listing: ShopeeTransportListing, cap: number, checkpoint = false): PublicReviewEnvelope {
  const v = object(raw);
  if (v.job_id !== job.id || normalizePublicReviewUrl(v.product_url) !== listing.productUrl || !Array.isArray(v.records) || v.records.length > cap) return fail();
  const rows: ShopeePublicRows = v.records.map((input, sourceRow) => {
    const r = object(input); if (normalizePublicReviewUrl(r.source_url) !== listing.productUrl) return fail();
    const reasons: ShopeePublicRows[number]['admissionReasons'] = [];
    const reviewId = reviewIdentity(r.review_id);
    if (reviewId === null) reasons.push('INVALID_REVIEW_ID');
    const comment = typeof r.comment === 'string' ? bounded(r.comment, 65536) : null;
    if (comment === null) reasons.push('UNREADABLE_COMMENT');
    let attributes: string[] = [];
    if (Array.isArray(r.attributes) && r.attributes.every(a => typeof a === 'string')) {
      if (r.attributes.length > 100) fail('SHOPEE_REVIEW_LIMIT');
      attributes = r.attributes.map(a => bounded(a as string, 65536));
    } else reasons.push('INVALID_ATTRIBUTES');
    const contentType = r.content_type === 'comment' ? 'COMMENT' : r.content_type === 'attributes_only' ? 'ATTRIBUTES_ONLY' : 'UNRESOLVED';
    if (!(contentType === 'COMMENT' && comment?.trim() || contentType === 'ATTRIBUTES_ONLY' && comment === '' && attributes.some(a => a.trim()))) reasons.push('INCONSISTENT_CONTENT_TYPE');
    if (typeof r.posted_at_local === 'string' && r.posted_at_local.length > 100) fail('SHOPEE_REVIEW_LIMIT');
    const postedAtLocal = typeof r.posted_at_local === 'string' && r.posted_at_local.length <= 100 ? r.posted_at_local : null;
    const createdAt = postedAtLocal === null ? null : publicReviewLocalTime(postedAtLocal);
    if (createdAt === null) reasons.push('SOURCE_TIME_NOT_PARSED');
    const variation = typeof r.variation === 'string' ? bounded(r.variation, 4096) : null;
    if (variation === null) reasons.push('INVALID_VARIATION');
    const sourcePage = integer(r.page, 1, 500) ? r.page : null;
    if (sourcePage === null) reasons.push('INVALID_SOURCE_PAGE');
    const ratingState = r.stars === null || r.stars === undefined ? 'MISSING' : integer(r.stars, 1, 5) ? 'VALID' : 'INVALID';
    return { reviewId, shopId: listing.shopId, itemId: listing.itemId, postedAtLocal, createdAt, variation,
      ratingStar: ratingState === 'VALID' ? r.stars as number : null, ratingState, comment, attributes, contentType,
      sourcePage, sourceUrl: listing.productUrl, sourceRow, admissionReasons: reasons };
  });
  if (!validRows(rows)) return fail();
  const excluded: PublicReviewEnvelope['excluded'] = [], diagnostics: PublicReviewEnvelope['diagnostics'] = [];
  if (v.excluded !== undefined && !Array.isArray(v.excluded)) return fail();
  for (const rawEntry of (v.excluded ?? []) as unknown[]) {
    if (rawEntry === null || typeof rawEntry !== 'object' || Array.isArray(rawEntry)) { diagnostics.push('INVALID_EXCLUDED_ENTRY'); continue; }
    const e = rawEntry as Record<string, unknown>;
    if (typeof e.review_id === 'string' && e.review_id.length > 0 && e.review_id.length <= 2000 && ['empty_or_media_only','empty_or_symbols_only'].includes(String(e.reason)))
      excluded.push({ reviewId: e.review_id, reason: e.reason === 'empty_or_media_only' ? 'EMPTY_OR_MEDIA_ONLY' : 'EMPTY_OR_SYMBOLS_ONLY' });
    else diagnostics.push('INVALID_EXCLUDED_ENTRY');
  }
  const pages: PublicReviewEnvelope['pages'] = [];
  if (v.pages !== undefined && !Array.isArray(v.pages)) return fail();
  for (const rawPage of (v.pages ?? []) as unknown[]) {
    const p = object(rawPage);
    if (!integer(p.page, 1, 500) || !integer(p.cards) || !integer(p.collected) || !Array.isArray(p.ids)) return fail();
    pages.push({ page: p.page, cards: p.cards, collected: p.collected, ids: p.ids.map(reviewIdentity) });
  }
  const startedAt = serviceUtc(v.started_at), finishedAt = serviceUtc(v.finished_at);
  return validatePublicEnvelope({ contractVersion: 'shopee-public-sanitized-result-v1', jobId: job.id, productUrl: listing.productUrl,
    shopId: listing.shopId, itemId: listing.itemId, maxReviewsPerProduct: cap, complete: !checkpoint && v.complete === true,
    stopReason: ['record_limit','expected_count_reached','last_page'].includes(String(v.stop_reason)) ? v.stop_reason : 'OTHER_OR_MISSING',
    filter: 'HAS_COMMENTS', expectedWithComments: integer(v.expected_with_comments) ? v.expected_with_comments : null,
    startedAt: utc(startedAt) ? startedAt : null, finishedAt: utc(finishedAt) ? finishedAt : null, excluded, diagnostics, pages, rows });
}

/** Worker-only transport. A durable intent is a one-use permission to submit. */
export class ShopeePublicReviewCollector implements ShopeeCollector<PublicCollectedPages> {
  readonly mode = 'live' as const;
  readonly maxReviewsPerProduct: number;
  readonly #fetch: typeof fetch; readonly #sleep: NonNullable<ShopeePublicReviewCollectorOptions['sleep']>; readonly #clock: () => Date;
  readonly #base: string; #requests = 0;
  constructor(readonly options: ShopeePublicReviewCollectorOptions) {
    if (!options.token || options.token.length > 512 || !/^[\x21-\x7e]+$/.test(options.token)) fail();
    const base = options.baseUrl ?? 'http://127.0.0.1:8877';
    if (!/^http:\/\/(?:127\.0\.0\.1|\[::1\]):8877\/?$/.test(base) || !/^[a-f0-9]{64}$/.test(options.confirmedSourceSetSha256)) fail();
    this.maxReviewsPerProduct = options.maxReviewsPerProduct ?? 300;
    if (!integer(this.maxReviewsPerProduct, 1, 300) || options.sampleMode === 'TRIAL' && this.maxReviewsPerProduct > 20) fail();
    this.#base = base.replace(/\/$/, ''); this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms, signal) => delay(ms, undefined, { signal })); this.#clock = options.clock ?? options.now ?? (() => new Date());
  }
  requestsIssued = (): number => this.#requests;
  async collect(selected: readonly ShopeeTransportListing[], requestSha256: string, runKey: string, signal?: AbortSignal): Promise<PublicCollectedPages> {
    if (selected.length < 1 || selected.length > 5 || !/^[a-f0-9]{64}$/.test(requestSha256)) return fail();
    const key = hash(bytes([runKey, this.options.confirmedSourceSetSha256]));
    const root = path.resolve(this.options.journalRoot), dir = path.join(root, key);
    const runMutex = path.join(root, hash(bytes([runKey])));
    const previous = mutexes.get(runMutex) ?? Promise.resolve();
    const work = previous.catch(() => {}).then(() => this.#collect(selected, requestSha256, runKey, root, dir, signal));
    mutexes.set(runMutex, work); try { return await work; } catch (e) { if (e instanceof ShopeePublicReviewError) throw e; throw new ShopeePublicReviewError('SHOPEE_REVIEW_INVALID_RESPONSE'); } finally { if (mutexes.get(runMutex) === work) mutexes.delete(runMutex); }
  }
  async #collect(selected: readonly ShopeeTransportListing[], requestSha: string, runKey: string, root: string, dir: string, signal?: AbortSignal): Promise<PublicCollectedPages> {
    await secureDirectory(root);
    // Check the run binding before creating a namespace or issuing any request.
    for (const entry of await fs.readdir(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^[a-f0-9]{64}$/.test(entry.name)) return fail();
      const priorDir = path.join(root, entry.name); await secureDirectory(priorDir);
      for (const name of await fs.readdir(priorDir)) if (name.endsWith('.json')) {
        const prior = await readJournal(path.join(priorDir, name));
        if (!prior || entry.name !== hash(bytes([prior.runKey, prior.confirmedSourceSetSha256])) ||
            name !== hash(bytes([prior.shopId, prior.itemId])) + '.json' ||
            prior.runKey === runKey && prior.confirmedSourceSetSha256 !== this.options.confirmedSourceSetSha256) return fail();
      }
    }
    await secureDirectory(dir);
    const journals: ShopeePublicJournal[] = []; let acquisitionDeadline: string | null = null, stopped = false, anyNew = false;
    for (const listing of selected) {
      if (normalizePublicReviewUrl(listing.productUrl) !== listing.productUrl || !listing.productUrl.endsWith(`/${listing.shopId}/${listing.itemId}`)) return fail();
      const file = path.join(dir, hash(bytes([listing.shopId, listing.itemId])) + '.json');
      const binding = { runKey, requestSha256: requestSha, confirmedSourceSetSha256: this.options.confirmedSourceSetSha256,
        providerId: PUBLIC_REVIEW_PROVIDER, mappingRevision: PUBLIC_REVIEW_MAPPING, maxReviewsPerProduct: this.maxReviewsPerProduct,
        sampleMode: this.options.sampleMode ?? 'STANDARD', productUrl: listing.productUrl, shopId: listing.shopId, itemId: listing.itemId,
        inputSha256: hash(bytes({ url: listing.productUrl, max_comments: this.maxReviewsPerProduct })) } as const;
      let journal = await readJournal(file);
      if (journal) { for (const k of Object.keys(binding) as (keyof typeof binding)[]) if (journal[k] !== binding[k]) return fail(); }
      else { anyNew = true; journal = { contractVersion: 'shopee-public-journal-v1', ...binding, intentAt: null, submitWindowStart: null,
        submitWindowEnd: null, deadline: null, acquisitionDeadline, baselineIds: [], job: null, lastState: 'NOT_SUBMITTED', snapshot: null,
        requestCount: 0, requestCountUncertain: false, cancelIntent: false, timedOut: false, terminal: null }; }
      const j: ShopeePublicJournal = journal;
      if (j.acquisitionDeadline) { if (acquisitionDeadline && acquisitionDeadline !== j.acquisitionDeadline) return fail(); acquisitionDeadline = j.acquisitionDeadline; }
      const save = () => writeJournal(file, j);
      const finalize = async (code?: PublicReviewReceipt['stopCode']) => {
        const at = this.#clock().toISOString();
        if (code) j.lastState = code;
        j.terminal = { productUrl: j.productUrl, shopId: j.shopId, itemId: j.itemId, inputSha256: j.inputSha256, jobId: j.job?.id ?? null,
          state: j.lastState, stopCode: code ?? null, createdAt: j.job?.created_at ?? null, observedAt: at, attemptedAt: at,
          complete: j.snapshot?.complete ?? false, stopReason: j.snapshot?.stopReason ?? 'OTHER_OR_MISSING', resultAvailable: j.snapshot !== null,
          resultSha256: j.snapshot ? hash(bytes(j.snapshot)) : null, resultByteSize: j.snapshot ? bytes(j.snapshot).length : 0,
          requestCount: j.requestCount, requestCountUncertain: j.requestCountUncertain, timedOut: j.timedOut, cancelIntent: j.cancelIntent };
        await save();
      };
      const remaining = () => Math.min(Date.parse(j.deadline ?? '9999-01-01'), Date.parse(j.acquisitionDeadline ?? '9999-01-01')) - this.#clock().getTime();
      const request = (op: string, id?: string, body?: unknown, cleanup = false) => this.#request(op, j, save, remaining(), cleanup ? undefined : signal, id, body);
      const pause = async (ms: number) => {
        if (signal?.aborted) fail('OWNER_ABORTED'); const left = remaining(); if (left <= 0) { j.timedOut = true; fail('DEADLINE'); }
        await this.#sleep(Math.min(ms, left), signal); if (signal?.aborted) fail('OWNER_ABORTED');
        if (remaining() <= 0) { j.timedOut = true; fail('DEADLINE'); }
      };
      const cancel = async () => {
        if (!j.job || !active(j.job.state) || j.cancelIntent) return;
        // At expiry, persist the intent before the one bounded best-effort cleanup.
        if (remaining() <= 0) j.timedOut = true;
        j.cancelIntent = true; await save(); try { await request('cancel', j.job.id, undefined, true); } catch { /* One cleanup dispatch, no further polling. */ }
      };
      const get = async (op: string, id?: string): Promise<unknown> => {
        for (let attempt = 0; ; attempt++) { try { return await request(op, id); } catch (e) {
          if (!(e instanceof ShopeePublicReviewError) || attempt >= 1 || !['SHOPEE_REVIEW_TIMEOUT','SHOPEE_REVIEW_TRANSPORT'].includes(e.code) && !(e.httpStatus && e.httpStatus >= 500)) throw e;
          await pause(3000);
        } }
      };
      const parseJob = (raw: unknown, bound = true) => {
        const v = object(raw), r = object(v.request);
        const job = { id: v.id, request: { url: normalizePublicReviewUrl(r.url), max_comments: r.max_comments }, state: v.state,
          created_at: serviceUtc(v.created_at), updated_at: serviceUtc(v.updated_at), result_available: v.result_available,
          ...(v.collected === undefined ? {} : { collected: v.collected }) };
        if (!validJob(job) || !utc(job.created_at) || !utc(job.updated_at) || Date.parse(job.created_at) > this.#clock().getTime() + 2000 || Date.parse(job.updated_at) < Date.parse(job.created_at) || (job.collected ?? 0) > this.maxReviewsPerProduct || job.request.url !== listing.productUrl || job.request.max_comments !== this.maxReviewsPerProduct ||
          bound && j.job && (job.id !== j.job.id || job.created_at !== j.job.created_at)) return fail();
        return job;
      };
      const reconcile = async () => {
        const list = await request('list'); if (!Array.isArray(list) || list.length > 100) return fail();
        // Foreign rows (known baseline id, or another listing URL) are ignored. A new row that claims our listing but is invalid cannot be trusted.
        const rows = list.map(listRow), known = new Set(j.baselineIds);
        if (rows.some(row => (row.id === null || !known.has(row.id)) && row.url === listing.productUrl && row.job === null)) fail('SUBMISSION_UNCERTAIN');
        const parsed = rows.flatMap(row => row.job ? [row.job] : []);
        const now = this.#clock().getTime(), lo = Date.parse(j.submitWindowStart!), hi = Date.parse(j.submitWindowEnd!);
        if (now < Date.parse(j.intentAt!) || parsed.some(v => Date.parse(v.created_at) > now + 2000) || list.length === 100 && !parsed.some(v => Date.parse(v.created_at) < lo)) fail('SUBMISSION_UNCERTAIN');
        const matches = parsed.filter(v => !j.baselineIds.includes(v.id) && v.request.url === listing.productUrl && v.request.max_comments === this.maxReviewsPerProduct && Date.parse(v.created_at) >= lo && Date.parse(v.created_at) <= hi);
        if (matches.length !== 1) fail('SUBMISSION_UNCERTAIN'); j.job = parseJob(matches[0], false); await save();
      };
      if (!j.terminal) {
        try {
          if (stopped) { await finalize('NOT_SUBMITTED'); }
          else {
            if (signal?.aborted || j.cancelIntent) fail('OWNER_ABORTED');
            if (!j.intentAt) {
              const health = object(await request('health'));
              if (health.status !== 'ok' || health.browser !== 'ready') fail('HEALTH_NOT_READY');
              const list = await request('list'); if (!Array.isArray(list) || list.length > 100) return fail();
              // Keep every usable id; a foreign or malformed row must not block the first submit.
              j.baselineIds = list.flatMap(raw => { const { id } = listRow(raw); return id === null ? [] : [id]; });
              const at = this.#clock().getTime(); j.intentAt = new Date(at).toISOString(); j.submitWindowStart = new Date(at - 2000).toISOString(); j.submitWindowEnd = new Date(at + 12000).toISOString();
              j.deadline = new Date(at + 40 * 60000).toISOString(); acquisitionDeadline ??= new Date(at + selected.length * 40 * 60000).toISOString(); j.acquisitionDeadline = acquisitionDeadline;
              await save(); // From here onward no recovery path may submit again.
              try { j.job = parseJob(await request('submit', undefined, { url: listing.productUrl, max_comments: this.maxReviewsPerProduct })); await save(); }
              catch (e) {
                if (signal?.aborted) throw e;
                if (e instanceof ShopeePublicReviewError && (e.code === 'CREDENTIAL_ECHO_REFUSED' || e.httpStatus && e.httpStatus < 500)) throw e;
                if (e instanceof ShopeePublicReviewError && e.code === 'SHOPEE_REVIEW_TIMEOUT') j.timedOut = true;
                if (j.job) await save(); else { try { await reconcile(); } catch { fail('SUBMISSION_UNCERTAIN'); } }
              }
            } else if (!j.job) { try { await reconcile(); } catch { fail('SUBMISSION_UNCERTAIN'); } }
            if (remaining() <= 0) { j.timedOut = true; fail('DEADLINE'); }
            let checkpointCount = j.snapshot?.rows.length ?? 0;
            while (true) {
              if (signal?.aborted) fail('OWNER_ABORTED');
              const job = parseJob(await get('status', j.job!.id)); j.job = job; j.lastState = job.state; await save();
              if (job.result_available && (!active(job.state) || (job.collected ?? 0) > checkpointCount)) {
                const snapshot = mapPublicReviewResult(await get('result', job.id), job, listing, this.maxReviewsPerProduct, active(job.state));
                if (signal?.aborted) fail('OWNER_ABORTED');
                if (job.state === 'succeeded') { const terminal = parseJob(await get('status', job.id)); if (terminal.state !== job.state || terminal.updated_at !== job.updated_at) return fail(); }
                j.snapshot = snapshot; checkpointCount = job.collected ?? snapshot.rows.length; await save();
              }
              if (!active(job.state)) {
                if (job.state === 'succeeded' && !job.result_available) return fail();
                await finalize(job.state === 'needs_login' ? 'HUMAN_LOGIN_REQUIRED' : job.state === 'needs_verification' ? 'HUMAN_VERIFICATION_REQUIRED' : undefined); break;
              }
              await pause(3000);
            }
          }
        } catch (e) {
          let code = signal?.aborted ? 'OWNER_ABORTED' : e instanceof ShopeePublicReviewError ? e.code : 'SHOPEE_REVIEW_INVALID_RESPONSE';
          if (remaining() <= 0 && code !== 'OWNER_ABORTED') code = 'DEADLINE';
          if (code === 'SHOPEE_REVIEW_TIMEOUT' || code === 'DEADLINE') j.timedOut = true;
          if (code === 'OWNER_ABORTED' || code === 'DEADLINE') await cancel();
          // Only declared safe codes enter the journal; neither exception messages nor response data do.
          if (!(collectionSchema.$defs.receipt.properties.stopCode.anyOf[0]!.enum ?? []).includes(code)) code = 'SHOPEE_REVIEW_INVALID_RESPONSE';
          await finalize(code as PublicReviewReceipt['stopCode']);
        }
      }
      journals.push(j); stopped ||= blocking(j.terminal!);
    }
    const pages: PublicCollectedPages['pages'] = [], envelopes: PublicReviewEnvelope[] = []; let offset = 0;
    for (const j of journals) if (j.snapshot) { envelopes.push(j.snapshot); pages.push({ bytes: bytes(j.snapshot.rows), offset }); offset += j.snapshot.rows.length; }
    return { mode: 'live', providerId: PUBLIC_REVIEW_PROVIDER, mappingRevision: PUBLIC_REVIEW_MAPPING, maxReviewsPerProduct: this.maxReviewsPerProduct,
      confirmedSourceSetSha256: this.options.confirmedSourceSetSha256, usageTotalUsd: 0, warnings: [], pages, envelopes,
      listings: journals.map(j => j.terminal!), attemptedAt: journals.map(j => j.terminal!.attemptedAt).sort().at(-1)!, reused: !anyNew };
  }
  async #request(op: string, j: ShopeePublicJournal, save: () => Promise<void>, remaining: number, signal?: AbortSignal, id?: string, body?: unknown): Promise<unknown> {
    if (signal?.aborted) return fail('OWNER_ABORTED');
    const jobId = id && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(id) ? id : undefined;
    const endpoints: Record<string, [string, string, number]> = { health: ['GET','/health',200], list: ['GET','/jobs?limit=100',200], submit: ['POST','/jobs',202],
      ...(jobId ? { status: ['GET',`/jobs/${jobId}`,200] as [string,string,number], result: ['GET',`/jobs/${jobId}/result`,200] as [string,string,number], cancel: ['POST',`/jobs/${jobId}/cancel`,202] as [string,string,number] } : {}) };
    const endpoint = endpoints[op]; if (!endpoint || body !== undefined && op !== 'submit') return fail();
    const ms = op === 'cancel' && remaining <= 0 ? 10000 : Math.min(op === 'result' ? 30000 : 10000, remaining);
    if (ms <= 0) return fail('DEADLINE');
    const controller = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, ms);
    const abort = () => controller.abort(); signal?.addEventListener('abort', abort, { once: true });
    const priorUncertainty = j.requestCountUncertain, priorRequestCount = j.requestCount;
    let dispatched = false;
    try {
      j.requestCount++; j.requestCountUncertain = true; await save();
      if (signal?.aborted) return fail('OWNER_ABORTED');
      if (controller.signal.aborted) return fail(timedOut ? 'SHOPEE_REVIEW_TIMEOUT' : 'OWNER_ABORTED');
      dispatched = true; this.#requests++;
      const work = async () => {
        const response = await this.#fetch(this.#base + endpoint[1], { method: endpoint[0], headers: { Authorization: `Bearer ${this.options.token}`, ...(op === 'submit' ? { 'Content-Type': 'application/json' } : {}) },
          ...(op === 'submit' ? { body: canonicalJson(body) } : {}), redirect: 'error', cache: 'no-store', signal: controller.signal });
        if (controller.signal.aborted || j.terminal) { await response.body?.cancel(); return fail(timedOut ? 'SHOPEE_REVIEW_TIMEOUT' : 'OWNER_ABORTED'); }
        j.requestCountUncertain = priorUncertainty; await save();
        if (response.status !== endpoint[2]) { await response.body?.cancel(); throw new ShopeePublicReviewError(response.status >= 500 ? 'SHOPEE_REVIEW_HTTP_5XX' : `SHOPEE_REVIEW_HTTP_${response.status}`, op, response.status); }
        if (Number(response.headers.get('content-length') ?? '0') > PUBLIC_REVIEW_MAX_BYTES) { await response.body?.cancel(); return fail('SHOPEE_REVIEW_LIMIT'); }
        if (!response.body) return fail(); const reader = response.body.getReader(); let size = 0; const parts: Uint8Array[] = [];
        const onAbort = () => { void reader.cancel().catch(() => {}); }; controller.signal.addEventListener('abort', onAbort, { once: true });
        try { while (true) { if (controller.signal.aborted) return fail(timedOut ? 'SHOPEE_REVIEW_TIMEOUT' : 'OWNER_ABORTED'); const part = await reader.read(); if (part.done) break; size += part.value.byteLength; if (size > PUBLIC_REVIEW_MAX_BYTES) return fail('SHOPEE_REVIEW_LIMIT'); parts.push(part.value); } }
        finally { controller.signal.removeEventListener('abort', onAbort); await reader.cancel().catch(() => {}); }
        let text: string; try { text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(parts)); } catch { return fail(); }
        if (text.includes(this.options.token) || text.includes(encodeURIComponent(this.options.token))) return fail('CREDENTIAL_ECHO_REFUSED');
        let parsed: unknown; try { parsed = JSON.parse(text); } catch { return fail(); }
        if (canonicalJson(parsed).includes(this.options.token) || canonicalJson(parsed).includes(encodeURIComponent(this.options.token))) return fail('CREDENTIAL_ECHO_REFUSED');
        return parsed;
      };
      return await Promise.race([work(), new Promise<never>((_, reject) => {
        const rejectAbort = () => reject(new ShopeePublicReviewError(timedOut ? 'SHOPEE_REVIEW_TIMEOUT' : 'OWNER_ABORTED', op));
        if (controller.signal.aborted) rejectAbort(); else controller.signal.addEventListener('abort', rejectAbort, { once: true });
      })]);
    } catch (e) {
      if (!j.terminal) { if (!dispatched) j.requestCount = priorRequestCount; j.requestCountUncertain = priorUncertainty; await save(); }
      if (e instanceof ShopeePublicReviewError) throw e;
      throw new ShopeePublicReviewError(timedOut || e instanceof Error && e.name === 'TimeoutError' ? 'SHOPEE_REVIEW_TIMEOUT' : signal?.aborted ? 'OWNER_ABORTED' : 'SHOPEE_REVIEW_TRANSPORT', op);
    } finally { clearTimeout(timer); signal?.removeEventListener('abort', abort); }
  }
}
async function secureDirectory(dir: string) {
  await fs.mkdir(dir, { recursive: true, mode: 0o700 }); const st = await fs.lstat(dir);
  if (st.isSymbolicLink() || !st.isDirectory() || (st.mode & 0o077) !== 0) return fail();
  // Reject symlink ancestors as well as the leaf.
  let parent = path.dirname(dir); while (parent !== path.dirname(parent)) { if ((await fs.lstat(parent)).isSymbolicLink()) return fail(); parent = path.dirname(parent); }
}
async function readJournal(file: string): Promise<ShopeePublicJournal | null> {
  let stat; try { stat = await fs.lstat(file); } catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; return fail(); }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PUBLIC_REVIEW_MAX_BYTES + 131072 || (stat.mode & 0o077) !== 0) return fail();
  const raw = await fs.readFile(file); let v: unknown; try { v = JSON.parse(raw.toString('utf8')); } catch { return fail(); }
  if (!validJournal(v) || !bytes(v).equals(raw)) return fail();
  if (v.inputSha256 !== hash(bytes({ url: v.productUrl, max_comments: v.maxReviewsPerProduct })) ||
      v.job && (v.job.request.url !== v.productUrl || v.job.request.max_comments !== v.maxReviewsPerProduct) ||
      v.snapshot && (v.snapshot.jobId !== v.job?.id || v.snapshot.productUrl !== v.productUrl || v.snapshot.shopId !== v.shopId || v.snapshot.itemId !== v.itemId || v.snapshot.maxReviewsPerProduct !== v.maxReviewsPerProduct) ||
      v.intentAt && (Date.parse(v.submitWindowStart!) !== Date.parse(v.intentAt) - 2000 || Date.parse(v.submitWindowEnd!) !== Date.parse(v.intentAt) + 12000 || Date.parse(v.deadline!) !== Date.parse(v.intentAt) + 40 * 60000) ||
      v.job && !v.intentAt ||
      v.terminal && (v.terminal.resultSha256 !== (v.snapshot ? hash(bytes(v.snapshot)) : null) || v.terminal.resultByteSize !== (v.snapshot ? bytes(v.snapshot).length : 0) || v.terminal.requestCount !== v.requestCount || v.terminal.requestCountUncertain !== v.requestCountUncertain ||
        v.terminal.productUrl !== v.productUrl || v.terminal.shopId !== v.shopId || v.terminal.itemId !== v.itemId || v.terminal.inputSha256 !== v.inputSha256 || v.terminal.jobId !== (v.job?.id ?? null) || v.terminal.state !== v.lastState || v.terminal.timedOut !== v.timedOut || v.terminal.cancelIntent !== v.cancelIntent)) return fail();
  return v;
}
async function writeJournal(file: string, journal: ShopeePublicJournal) {
  if (!validJournal(journal)) return fail();
  const previous = await readJournal(file); if (previous?.terminal && !bytes(previous).equals(bytes(journal))) return fail();
  const tmp = file + '.' + randomUUID() + '.tmp'; const handle = await fs.open(tmp, 'wx', 0o600);
  try { await handle.writeFile(bytes(journal)); await handle.sync(); } finally { await handle.close(); }
  await fs.rename(tmp, file); const parent = await fs.open(path.dirname(file), 'r'); try { await parent.sync(); } finally { await parent.close(); }
}
