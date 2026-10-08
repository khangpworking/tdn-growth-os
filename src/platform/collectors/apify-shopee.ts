import { createHash } from 'node:crypto';
import type { ShopeePrivateIntake } from './shopee-private-intake.js';
import { validatePrivateProfile, validatePrivateRows } from '../../modules/foundation/shopee-private-contracts.js';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { ShopeeCollection } from '../../../contracts/foundation/shopee-collection.generated.js';
import { jsonBytes, parseJsonBytes, shopeeUrlMatches } from '../../modules/foundation/shopee-selection.js';

export const SHOPEE_ACTOR = 'zen-studio/shopee-product-reviews-scraper';
export interface CollectedPages {
  /** Explicit opt-in sanitized capture, never retroactively assigned to historical raw pages. */
  privacy?: ShopeePrivateIntake['profile'];
  mode: 'fixture' | 'live';
  actor: ShopeeCollection['actor'];
  warnings: string[];
  pages: { bytes: Buffer; offset: number }[];
  /** Last provider status message, sanitized. Diagnostic only: never part of the saved collection packet. */
  actorStatusMessage?: string | null;
}

export const PRODUCTION_MAX_REVIEWS_PER_PRODUCT = 500 as const;
export const SMOKE_MAX_REVIEWS_PER_PRODUCT = 20 as const;
export const FIXED_SHOPEE_SETTINGS = Object.freeze({
  starFilter: 'all' as const,
  contentFilter: 'with comments' as const,
});
export type ShopeeContentFilter = 'all' | 'with comments';
export interface ShopeeTransportListing {
  readonly platform: 'shopee';
  readonly productUrl: string;
  readonly shopId: string;
  readonly itemId: string;
}

function validateMaxReviewsPerProduct(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > PRODUCTION_MAX_REVIEWS_PER_PRODUCT) {
    throw new Error('Reviews per product must be an integer from 1 through 500');
  }
  return value;
}
export interface ShopeeCollector {
  readonly mode: 'fixture' | 'live';
  readonly privacyProfile?: ShopeePrivateIntake['profile'] | undefined;
  collect(selected: readonly ShopeeTransportListing[], requestSha256: string, runKey: string, signal?: AbortSignal): Promise<CollectedPages>;
}

export class FixtureShopeeCollector implements ShopeeCollector {
  readonly mode = 'fixture' as const;
  readonly #bytes: Buffer;
  readonly #privacy: ShopeePrivateIntake | undefined;
  constructor(bytes: Buffer, privacy?: ShopeePrivateIntake) { this.#bytes = Buffer.from(bytes); if (privacy) validatePrivateProfile(privacy.profile); this.#privacy = privacy; }
  get privacyProfile() { return this.#privacy?.profile; }
  async collect(selected: readonly ShopeeTransportListing[], _requestSha256?: string, _runKey?: string, signal?: AbortSignal): Promise<CollectedPages> {
    checkCancellation(signal);
    const value = parseJsonBytes(this.#bytes);
    const maximum = selected.length * PRODUCTION_MAX_REVIEWS_PER_PRODUCT;
    if (!Array.isArray(value) || value.length > maximum) {
      throw new Error(`Fixture must be a JSON array of at most ${maximum} rows`);
    }
    return { mode: 'fixture', ...(this.#privacy ? { privacy: this.#privacy.profile } : {}), actor: {
      actorId: SHOPEE_ACTOR, settings: { maxReviewsPerProduct: PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
        ...FIXED_SHOPEE_SETTINGS, maxChargeUsd: null },
      inputSha256: shopeeActorInputSha256(selected, PRODUCTION_MAX_REVIEWS_PER_PRODUCT),
      runId: null, datasetId: null, buildId: null, status: 'FIXTURE',
      retrievedAt: new Date().toISOString(), providerTotalRows: null, usageTotalUsd: null,
      stopReason: 'fixture_complete',
    }, warnings: ['synthetic_fixture_not_live_evidence'], pages: [{ bytes: this.#privacy ? privatePage(this.#privacy, this.#bytes) : Buffer.from(this.#bytes), offset: 0 }] };
  }
}

export class CollectionPendingError extends Error {}

export class ApifyShopeeCollector implements ShopeeCollector {
  readonly mode = 'live' as const;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  readonly #privacy: ShopeePrivateIntake | undefined;
  get privacyProfile() { return this.#privacy?.profile; }
  constructor(readonly options: {
    token: string; maxChargeUsd: number; journalRoot: string; maxReviewsPerProduct?: number;
    contentFilter?: ShopeeContentFilter;
    retainReturnedPages?: boolean;
    existingRun?: { runId: string; datasetId: string };
    fetch?: typeof fetch; sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>; maxPolls?: number;
  }, privacy?: ShopeePrivateIntake) {
    if (privacy) validatePrivateProfile(privacy.profile);
    this.#privacy = privacy;
    if (!options.token.trim() || !Number.isFinite(options.maxChargeUsd) || options.maxChargeUsd <= 0) {
      throw new Error('Live collection requires token and a positive approved charge cap');
    }
    if (options.maxChargeUsd > 10_000) {
      throw new Error('Approved charge cap exceeds the bounded maximum');
    }
    validateMaxReviewsPerProduct(options.maxReviewsPerProduct ?? PRODUCTION_MAX_REVIEWS_PER_PRODUCT);
    if (options.contentFilter !== undefined && !['all', 'with comments'].includes(options.contentFilter)) {
      throw new Error('Invalid Shopee content filter');
    }
    if (options.existingRun && (!validProviderId(options.existingRun.runId) || !validProviderId(options.existingRun.datasetId))) {
      throw new Error('Invalid existing Apify run identity');
    }
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms, signal) => delay(ms, undefined, signal ? { signal } : {}));
  }

  async collect(selected: readonly ShopeeTransportListing[], requestSha256: string, runKey: string, signal?: AbortSignal): Promise<CollectedPages> {
    checkCancellation(signal);
    if (!/^[a-f0-9]{64}$/.test(requestSha256) || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(runKey) || selected.length < 1 || selected.length > 5 ||
        selected.some(row => row.platform !== 'shopee' || !shopeeUrlMatches(row))) throw new Error('Invalid bounded Shopee selection');
    const maxReviewsPerProduct = validateMaxReviewsPerProduct(
      this.options.maxReviewsPerProduct ?? PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
    );
    const contentFilter = this.options.contentFilter ?? FIXED_SHOPEE_SETTINGS.contentFilter;
    const input = shopeeActorInput(selected, maxReviewsPerProduct, contentFilter);
    if (this.options.existingRun && !this.options.retainReturnedPages) {
      const run = await this.#existingRun(input, signal);
      return this.#finishCollection(run, selected, input, maxReviewsPerProduct, contentFilter, signal);
    }
    // Stable runKey prevents changed input/formatting from bypassing an uncertain start.
    const journalRoot = path.resolve(this.options.journalRoot);
    await ensureDirectory(journalRoot);
    await fs.chmod(journalRoot, 0o700);
    const directory = path.join(journalRoot, runKey);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    await fs.chmod(directory, 0o700);
    await syncDirectory(journalRoot);
    const lockPath = path.join(directory, 'active.lock');
    let lock;
    try { lock = await fs.open(lockPath, 'wx', 0o600); }
    catch { throw new CollectionPendingError('Collection locked; inspect prior process before removing its local lock'); }
    try {
      const startPath = path.join(directory, 'start.json');
      const runPath = path.join(directory, 'run.json');
      const identity = { runKey, requestSha256, input, maxChargeUsd: this.options.maxChargeUsd,
        ...(this.#privacy ? { privacy: this.#privacy.profile } : {}),
        ...(this.options.existingRun ? { existingRun: this.options.existingRun } : {}) };
      const prior = await readOptional(startPath);
      if (prior && !jsonBytes(parseJsonBytes(prior)).equals(jsonBytes(identity))) throw new Error('Receipt identity or budget conflict');
      const retainedDirectory = this.options.retainReturnedPages ? await prepareReturnedPages(directory) : undefined;
      let run: Run;
      if (this.options.existingRun) {
        if (!prior) await writeReceipt(startPath, jsonBytes(identity));
        run = await this.#existingRun(input, signal);
        if (!await readOptional(runPath)) await writeReceipt(runPath, jsonBytes({ data: this.#privacy ? { ...run, statusMessage: null } : run }));
      } else if (prior) {
        const runBytes = await readOptional(runPath);
        if (!runBytes) throw new CollectionPendingError('Start outcome unknown; inspect Apify manually. No second run was started');
        run = parseRun(parseJsonBytes(runBytes));
      } else {
        checkCancellation(signal);
        // Persist intent before spending, including across process crashes.
        await writeReceipt(startPath, jsonBytes(identity));
        try {
          const query = new URLSearchParams({ timeout: '300', maxTotalChargeUsd: String(this.options.maxChargeUsd) });
          run = parseRun(parseJsonBytes((await this.#request(
            '/actors/zen-studio~shopee-product-reviews-scraper/runs?' + query,
            { method: 'POST', body: JSON.stringify(input) }, false, signal)).bytes));
          await writeReceipt(runPath, jsonBytes({ data: this.#privacy ? { ...run, statusMessage: null } : run }));
        } catch {
          throw new CollectionPendingError('Start outcome unknown; inspect Apify manually. No automatic POST retry');
        }
      }
      const collected = await this.#finishCollection(run, selected, input, maxReviewsPerProduct, contentFilter, signal);
      if (retainedDirectory) await retainReturnedPages(retainedDirectory, requestSha256, runKey, collected);
      return collected;
    } finally {
      await lock.close();
      await fs.unlink(lockPath);
    }
  }

  async #existingRun(input: ReturnType<typeof shopeeActorInput>, signal?: AbortSignal): Promise<Run> {
    const existing = this.options.existingRun!;
    const run = parseRun(parseJsonBytes((await this.#request('/actor-runs/' + existing.runId, {}, false, signal)).bytes));
    if (run.id !== existing.runId || run.defaultDatasetId !== existing.datasetId ||
        run.maxTotalChargeUsd !== this.options.maxChargeUsd || run.defaultKeyValueStoreId === null) {
      throw new Error('Existing run identity or approved charge cap mismatch');
    }
    const providerInput = parseJsonBytes((await this.#request(
      '/key-value-stores/' + run.defaultKeyValueStoreId + '/records/INPUT', {}, false, signal)).bytes);
    if (!jsonBytes(providerInput).equals(jsonBytes(input))) throw new Error('Existing run input mismatch');
    return run;
  }

  async #finishCollection(run: Run, selected: readonly ShopeeTransportListing[], input: ReturnType<typeof shopeeActorInput>,
    maxReviewsPerProduct: number, contentFilter: ShopeeContentFilter, signal?: AbortSignal): Promise<CollectedPages> {
      const terminal = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);
      const polls = this.options.maxPolls ?? 30;
      for (let index = 0; !terminal.has(run.status) && index < polls; index++) {
        checkCancellation(signal);
        try { await this.#sleep(2000, signal); }
        catch (error) { checkCancellation(signal); throw error; }
        checkCancellation(signal);
        const next = parseRun(parseJsonBytes((await this.#request('/actor-runs/' + run.id, {}, false, signal)).bytes));
        if (next.id !== run.id || next.defaultDatasetId !== run.defaultDatasetId) throw new Error('Run identity drift');
        run = next;
      }
      if (!terminal.has(run.status)) throw new CollectionPendingError('Run pending; resume with the same input and budget');
      const pages: CollectedPages['pages'] = [];
      let offset = 0;
      // Do not request more rows to compensate for filtering, invalid rows or duplicates.
      const maximum = selected.length * maxReviewsPerProduct;
      let exhausted = false;
      let readFailed = false;
      let providerTotalRows: number | null = null;
      while (offset < maximum) {
        if (signal?.aborted) { readFailed = true; break; }
        const limit = Math.min(100, maximum - offset);
        const query = new URLSearchParams({ format: 'json', clean: 'false', offset: String(offset), limit: String(limit) });
        try {
          const response = await this.#request('/datasets/' + run.defaultDatasetId + '/items?' + query, {}, true, signal);
          const bytes = response.bytes;
          if (response.providerTotalRows !== null) {
            if (providerTotalRows !== null && providerTotalRows !== response.providerTotalRows) throw new Error('Dataset total drift');
            providerTotalRows = response.providerTotalRows;
          }
          const values = parseJsonBytes(bytes);
          if (!Array.isArray(values) || values.length > limit) throw new Error('Invalid bounded dataset page');
          pages.push({ bytes: this.#privacy ? privatePage(this.#privacy, bytes) : bytes, offset });
          offset += values.length;
          if (values.length < limit) { exhausted = true; break; }
        } catch {
          readFailed = true;
          break;
        }
      }
      const terminalReason = run.status === 'FAILED' ? 'actor_terminal_failed' as const
        : run.status === 'TIMED-OUT' ? 'actor_terminal_timed-out' as const
        : run.status === 'ABORTED' ? 'actor_terminal_aborted' as const : null;
      const cancelled = signal?.aborted === true;
      if (cancelled) readFailed = true;
      return { mode: 'live', ...(this.#privacy ? { privacy: this.#privacy.profile } : {}), actor: {
        actorId: SHOPEE_ACTOR, settings: { maxReviewsPerProduct, starFilter: 'all', contentFilter,
          maxChargeUsd: this.options.maxChargeUsd },
        inputSha256: createHash('sha256').update(jsonBytes(input)).digest('hex'),
        runId: run.id, datasetId: run.defaultDatasetId, buildId: run.buildId, status: run.status,
        retrievedAt: new Date().toISOString(), providerTotalRows, usageTotalUsd: run.usageTotalUsd,
        stopReason: terminalReason ?? (readFailed ? 'dataset_read_failed'
          : exhausted ? 'dataset_exhausted' : 'collection_limit_reached'),
      }, ...(this.#privacy ? {} : { actorStatusMessage: run.statusMessage }), warnings: [...(terminalReason ? [terminalReason] : readFailed ? ['dataset_read_failed'] : []),
        ...(cancelled ? ['collection_cancelled_locally_provider_status_unchanged'] : [])], pages };
  }

  async #request(endpoint: string, init: RequestInit = {}, captureTotal = false, signal?: AbortSignal): Promise<{ bytes: Buffer; providerTotalRows: number | null }> {
    checkCancellation(signal);
    try {
      const timeout = AbortSignal.timeout(30_000);
      const response = await this.#fetch('https://api.apify.com/v2' + endpoint, {
        ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Authorization: 'Bearer ' + this.options.token, 'Content-Type': 'application/json' },
      });
      if (!response.ok || !response.body) throw new Error('Provider request failed');
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 8 * 1024 * 1024) throw new Error('Response too large');
          chunks.push(part.value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      let providerTotalRows: number | null = null;
      if (captureTotal) {
        const rawTotal = response.headers.get('x-apify-pagination-total');
        if (rawTotal !== null) {
          if (!/^(0|[1-9][0-9]{0,15})$/.test(rawTotal) || !Number.isSafeInteger(Number(rawTotal))) {
            throw new Error('Invalid provider total');
          }
          providerTotalRows = Number(rawTotal);
        }
      }
      return { bytes: Buffer.concat(chunks), providerTotalRows };
    } catch {
      checkCancellation(signal);
      // Do not print provider bodies, token-bearing URLs, or transport error details.
      throw new Error('Apify request failed or exceeded limits; resume the same request, not a new paid run');
    }
  }
}

function checkCancellation(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CollectionPendingError('Collection cancelled locally; a started Actor run may still be active. Resume only the same request and approved budget');
}

interface Run {
  id: string; defaultDatasetId: string; defaultKeyValueStoreId: string | null; buildId: string | null;
  status: string; usageTotalUsd: number | null; maxTotalChargeUsd: number | null; statusMessage: string | null;
}
/** Provider status text for diagnostics: trimmed, control characters removed, at most 300 chars. */
export function providerStatusMessage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ').trim().slice(0, 300).trim();
  return text === '' ? null : text;
}
function validProviderId(x: unknown): x is string { return typeof x === 'string' && /^[a-zA-Z0-9]{1,100}$/.test(x); }
function parseRun(value: unknown): Run {
  const data = (value as { data?: Partial<Omit<Run, 'statusMessage'>> & { statusMessage?: unknown; options?: { maxTotalChargeUsd?: unknown } } } | null)?.data;
  if (!data || !validProviderId(data.id) || !validProviderId(data.defaultDatasetId) ||
      typeof data.status !== 'string' || !/^[A-Z-]{1,40}$/.test(data.status) ||
      (data.buildId != null && !validProviderId(data.buildId)) ||
      (data.defaultKeyValueStoreId != null && !validProviderId(data.defaultKeyValueStoreId)) ||
      (data.usageTotalUsd != null && (!Number.isFinite(data.usageTotalUsd) || data.usageTotalUsd < 0 ||
        data.usageTotalUsd > 10_000))) throw new Error('Invalid Actor run metadata');
  const cap = data.options?.maxTotalChargeUsd;
  if (cap != null && (typeof cap !== 'number' || !Number.isFinite(cap) || cap <= 0 || cap > 10_000)) {
    throw new Error('Invalid Actor run charge cap');
  }
  return { id: data.id, defaultDatasetId: data.defaultDatasetId,
    defaultKeyValueStoreId: data.defaultKeyValueStoreId ?? null, status: data.status,
    buildId: data.buildId ?? null, usageTotalUsd: data.usageTotalUsd ?? null, maxTotalChargeUsd: cap ?? null,
    statusMessage: providerStatusMessage(data.statusMessage) };
}
async function readOptional(file: string): Promise<Buffer | null> {
  try { return await fs.readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function writeReceipt(file: string, bytes: Buffer): Promise<void> {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
  await syncDirectory(path.dirname(file));
}

// One returned snapshot per run; a further attempt requires manual reconciliation.
const MAX_RETURNED_PAGES = 25;
const MAX_RETURNED_PAGE_BYTES = 8 * 1024 * 1024;
async function prepareReturnedPages(runDirectory: string): Promise<string> {
  const directory = path.join(runDirectory, 'returned-pages');
  await ensureDirectory(directory);
  await fs.chmod(directory, 0o700);
  const entries = await fs.readdir(directory);
  let snapshots = 0;
  let pages = 0;
  for (const name of entries) {
    const metadata = await fs.lstat(path.join(directory, name));
    if (!metadata.isFile()) throw new Error('Invalid returned-page journal entry');
    if (/^snapshot-[a-f0-9]{64}\.json$/.test(name)) {
      snapshots++;
      if (metadata.size > 64 * 1024) throw new Error('Returned-page receipt exceeds limits');
    } else if (/^page-[a-f0-9]{64}\.json$/.test(name) && metadata.size <= MAX_RETURNED_PAGE_BYTES) {
      pages++;
    } else throw new Error('Invalid returned-page journal entry');
  }
  if (snapshots > 0 || pages > MAX_RETURNED_PAGES) {
    throw new CollectionPendingError('Returned-page journal is full; reconcile retained snapshot before collecting again');
  }
  return directory;
}

async function retainReturnedPages(directory: string, requestSha256: string, runKey: string, collected: CollectedPages): Promise<void> {
  if (collected.pages.length > MAX_RETURNED_PAGES || collected.pages.some(page => page.bytes.length > MAX_RETURNED_PAGE_BYTES)) {
    throw new Error('Returned pages exceed journal limits');
  }
  const files = new Set(await fs.readdir(directory));
  for (const page of collected.pages) files.add(`page-${createHash('sha256').update(page.bytes).digest('hex')}.json`);
  if (files.size > MAX_RETURNED_PAGES) throw new CollectionPendingError('Returned-page journal is full; reconcile retained pages before collecting again');
  const pages = [];
  for (const page of collected.pages) {
    const sha256 = createHash('sha256').update(page.bytes).digest('hex');
    const file = `page-${sha256}.json`;
    await writeOrVerifyReceipt(path.join(directory, file), page.bytes);
    pages.push({ file, sha256, byteSize: page.bytes.length, offset: page.offset });
  }
  const receipt = jsonBytes({ receiptVersion: collected.privacy ? '2.0.0' : '1.0.0',
    ...(collected.privacy ? { privacy: collected.privacy } : {}), admission: 'UNVERIFIED', requestSha256, runKey,
    mode: collected.mode, actor: collected.actor, warnings: collected.warnings, pages });
  const sha256 = createHash('sha256').update(receipt).digest('hex');
  await writeOrVerifyReceipt(path.join(directory, `snapshot-${sha256}.json`), receipt);
}

async function writeOrVerifyReceipt(file: string, bytes: Buffer): Promise<void> {
  const prior = await readOptional(file);
  if (prior) {
    if (!prior.equals(bytes)) throw new Error('Returned-page journal digest mismatch');
    await fs.chmod(file, 0o600);
    const handle = await fs.open(file, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
    await syncDirectory(path.dirname(file));
    return;
  }
  await writeReceipt(file, bytes);
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const directory = await fs.open(directoryPath, 'r');
  try { await directory.sync(); } finally { await directory.close(); }
}

async function ensureDirectory(directoryPath: string): Promise<void> {
  try {
    const metadata = await fs.stat(directoryPath);
    if (!metadata.isDirectory()) throw new Error('Receipt path is not a directory');
    return;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  const parent = path.dirname(directoryPath);
  if (parent === directoryPath) throw new Error('Cannot create receipt directory root');
  await ensureDirectory(parent);
  try { await fs.mkdir(directoryPath, { mode: 0o700 }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
  await fs.chmod(directoryPath, 0o700);
  await syncDirectory(parent);
}

export function shopeeActorInput(selected: readonly ShopeeTransportListing[],
  maxReviewsPerProduct: number = PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
  contentFilter: ShopeeContentFilter = FIXED_SHOPEE_SETTINGS.contentFilter): {
    startUrls: { url: string }[];
    maxReviewsPerProduct: number;
    starFilter: 'all';
    contentFilter: ShopeeContentFilter;
  } {
  if (!['all', 'with comments'].includes(contentFilter)) throw new Error('Invalid Shopee content filter');
  return { startUrls: selected.map(row => ({ url: row.productUrl })),
    maxReviewsPerProduct: validateMaxReviewsPerProduct(maxReviewsPerProduct), starFilter: 'all', contentFilter };
}

export function shopeeActorInputSha256(selected: readonly ShopeeTransportListing[],
  maxReviewsPerProduct: number = PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
  contentFilter: ShopeeContentFilter = FIXED_SHOPEE_SETTINGS.contentFilter): string {
  return createHash('sha256').update(jsonBytes(shopeeActorInput(selected, maxReviewsPerProduct, contentFilter))).digest('hex');
}

function privatePage(intake: ShopeePrivateIntake, bytes: Buffer): Buffer {
  const sanitized = intake.sanitizePage(bytes);
  // Validate even injected intake mechanics before any return or private journal publication.
  validatePrivateRows(parseJsonBytes(sanitized));
  return sanitized;
}
