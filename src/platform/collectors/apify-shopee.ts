import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { ShopeeCollection } from '../../../contracts/foundation/shopee-collection.generated.js';
import { jsonBytes, parseJsonBytes, shopeeUrlMatches, type SelectedListing } from '../../modules/foundation/shopee-selection.js';

export const SHOPEE_ACTOR = 'zen-studio/shopee-product-reviews-scraper';
export interface CollectedPages {
  mode: 'fixture' | 'live';
  actor: ShopeeCollection['actor'];
  warnings: string[];
  pages: { bytes: Buffer; offset: number }[];
}

export const PRODUCTION_MAX_REVIEWS_PER_PRODUCT = 500 as const;
export const SMOKE_MAX_REVIEWS_PER_PRODUCT = 20 as const;
export const FIXED_SHOPEE_SETTINGS = Object.freeze({
  starFilter: 'all' as const,
  contentFilter: 'with comments' as const,
});
export type ShopeeContentFilter = 'all' | 'with comments';

function validateMaxReviewsPerProduct(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > PRODUCTION_MAX_REVIEWS_PER_PRODUCT) {
    throw new Error('Reviews per product must be an integer from 1 through 500');
  }
  return value;
}
export interface ShopeeCollector {
  readonly mode: 'fixture' | 'live';
  collect(selected: SelectedListing[], requestSha256: string, runKey: string): Promise<CollectedPages>;
}

export class FixtureShopeeCollector implements ShopeeCollector {
  readonly mode = 'fixture' as const;
  constructor(readonly bytes: Buffer) {}
  async collect(selected: SelectedListing[]): Promise<CollectedPages> {
    const value = parseJsonBytes(this.bytes);
    const maximum = selected.length * PRODUCTION_MAX_REVIEWS_PER_PRODUCT;
    if (!Array.isArray(value) || value.length > maximum) {
      throw new Error(`Fixture must be a JSON array of at most ${maximum} rows`);
    }
    return { mode: 'fixture', actor: {
      actorId: SHOPEE_ACTOR, settings: { maxReviewsPerProduct: PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
        ...FIXED_SHOPEE_SETTINGS, maxChargeUsd: null },
      inputSha256: shopeeActorInputSha256(selected, PRODUCTION_MAX_REVIEWS_PER_PRODUCT),
      runId: null, datasetId: null, buildId: null, status: 'FIXTURE',
      retrievedAt: new Date().toISOString(), providerTotalRows: null, usageTotalUsd: null,
      stopReason: 'fixture_complete',
    }, warnings: ['synthetic_fixture_not_live_evidence'], pages: [{ bytes: Buffer.from(this.bytes), offset: 0 }] };
  }
}

export class CollectionPendingError extends Error {}

export class ApifyShopeeCollector implements ShopeeCollector {
  readonly mode = 'live' as const;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<unknown>;
  constructor(readonly options: {
    token: string; maxChargeUsd: number; journalRoot: string; maxReviewsPerProduct?: number;
    contentFilter?: ShopeeContentFilter;
    existingRun?: { runId: string; datasetId: string };
    fetch?: typeof fetch; sleep?: (ms: number) => Promise<unknown>; maxPolls?: number;
  }) {
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
    this.#sleep = options.sleep ?? delay;
  }

  async collect(selected: SelectedListing[], requestSha256: string, runKey: string): Promise<CollectedPages> {
    if (!/^[a-f0-9]{64}$/.test(requestSha256) || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(runKey) || selected.length < 1 || selected.length > 5 ||
        selected.some(row => !shopeeUrlMatches(row))) throw new Error('Invalid bounded Shopee selection');
    const maxReviewsPerProduct = validateMaxReviewsPerProduct(
      this.options.maxReviewsPerProduct ?? PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
    );
    const contentFilter = this.options.contentFilter ?? FIXED_SHOPEE_SETTINGS.contentFilter;
    const input = shopeeActorInput(selected, maxReviewsPerProduct, contentFilter);
    if (this.options.existingRun) {
      const run = parseRun(parseJsonBytes((await this.#request('/actor-runs/' + this.options.existingRun.runId)).bytes));
      if (run.id !== this.options.existingRun.runId || run.defaultDatasetId !== this.options.existingRun.datasetId ||
          run.maxTotalChargeUsd !== this.options.maxChargeUsd || run.defaultKeyValueStoreId === null) {
        throw new Error('Existing run identity or approved charge cap mismatch');
      }
      const providerInput = parseJsonBytes((await this.#request(
        '/key-value-stores/' + run.defaultKeyValueStoreId + '/records/INPUT')).bytes);
      if (!jsonBytes(providerInput).equals(jsonBytes(input))) throw new Error('Existing run input mismatch');
      return this.#finishCollection(run, selected, input, maxReviewsPerProduct, contentFilter);
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
      const identity = { runKey, requestSha256, input, maxChargeUsd: this.options.maxChargeUsd };
      const prior = await readOptional(startPath);
      let run: Run;
      if (prior) {
        if (!jsonBytes(parseJsonBytes(prior)).equals(jsonBytes(identity))) throw new Error('Receipt identity or budget conflict');
        const runBytes = await readOptional(runPath);
        if (!runBytes) throw new CollectionPendingError('Start outcome unknown; inspect Apify manually. No second run was started');
        run = parseRun(parseJsonBytes(runBytes));
      } else {
        // Persist intent before spending, including across process crashes.
        await writeReceipt(startPath, jsonBytes(identity));
        try {
          const query = new URLSearchParams({ timeout: '300', maxTotalChargeUsd: String(this.options.maxChargeUsd) });
          run = parseRun(parseJsonBytes((await this.#request(
            '/actors/zen-studio~shopee-product-reviews-scraper/runs?' + query,
            { method: 'POST', body: JSON.stringify(input) })).bytes));
          await writeReceipt(runPath, jsonBytes({ data: run }));
        } catch {
          throw new CollectionPendingError('Start outcome unknown; inspect Apify manually. No automatic POST retry');
        }
      }
      return await this.#finishCollection(run, selected, input, maxReviewsPerProduct, contentFilter);
    } finally {
      await lock.close();
      await fs.unlink(lockPath);
    }
  }

  async #finishCollection(run: Run, selected: SelectedListing[], input: ReturnType<typeof shopeeActorInput>,
    maxReviewsPerProduct: number, contentFilter: ShopeeContentFilter): Promise<CollectedPages> {
      const terminal = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);
      const polls = this.options.maxPolls ?? 30;
      for (let index = 0; !terminal.has(run.status) && index < polls; index++) {
        await this.#sleep(2000);
        const next = parseRun(parseJsonBytes((await this.#request('/actor-runs/' + run.id)).bytes));
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
        const limit = Math.min(100, maximum - offset);
        const query = new URLSearchParams({ format: 'json', clean: 'false', offset: String(offset), limit: String(limit) });
        try {
          const response = await this.#request('/datasets/' + run.defaultDatasetId + '/items?' + query, {}, true);
          const bytes = response.bytes;
          if (response.providerTotalRows !== null) {
            if (providerTotalRows !== null && providerTotalRows !== response.providerTotalRows) throw new Error('Dataset total drift');
            providerTotalRows = response.providerTotalRows;
          }
          const values = parseJsonBytes(bytes);
          if (!Array.isArray(values) || values.length > limit) throw new Error('Invalid bounded dataset page');
          pages.push({ bytes, offset });
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
      return { mode: 'live', actor: {
        actorId: SHOPEE_ACTOR, settings: { maxReviewsPerProduct, starFilter: 'all', contentFilter,
          maxChargeUsd: this.options.maxChargeUsd },
        inputSha256: createHash('sha256').update(jsonBytes(input)).digest('hex'),
        runId: run.id, datasetId: run.defaultDatasetId, buildId: run.buildId, status: run.status,
        retrievedAt: new Date().toISOString(), providerTotalRows, usageTotalUsd: run.usageTotalUsd,
        stopReason: terminalReason ?? (readFailed ? 'dataset_read_failed'
          : exhausted ? 'dataset_exhausted' : 'collection_limit_reached'),
      }, warnings: terminalReason ? [terminalReason] : readFailed ? ['dataset_read_failed'] : [], pages };
  }

  async #request(endpoint: string, init: RequestInit = {}, captureTotal = false): Promise<{ bytes: Buffer; providerTotalRows: number | null }> {
    try {
      const response = await this.#fetch('https://api.apify.com/v2' + endpoint, {
        ...init, redirect: 'error', signal: AbortSignal.timeout(30_000),
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
      // Do not print provider bodies, token-bearing URLs, or transport error details.
      throw new Error('Apify request failed or exceeded limits; resume the same request, not a new paid run');
    }
  }
}

interface Run {
  id: string; defaultDatasetId: string; defaultKeyValueStoreId: string | null; buildId: string | null;
  status: string; usageTotalUsd: number | null; maxTotalChargeUsd: number | null;
}
function validProviderId(x: unknown): x is string { return typeof x === 'string' && /^[a-zA-Z0-9]{1,100}$/.test(x); }
function parseRun(value: unknown): Run {
  const data = (value as { data?: Partial<Run> & { options?: { maxTotalChargeUsd?: unknown } } } | null)?.data;
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
    buildId: data.buildId ?? null, usageTotalUsd: data.usageTotalUsd ?? null, maxTotalChargeUsd: cap ?? null };
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

export function shopeeActorInput(selected: readonly SelectedListing[],
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

export function shopeeActorInputSha256(selected: readonly SelectedListing[],
  maxReviewsPerProduct: number = PRODUCTION_MAX_REVIEWS_PER_PRODUCT,
  contentFilter: ShopeeContentFilter = FIXED_SHOPEE_SETTINGS.contentFilter): string {
  return createHash('sha256').update(jsonBytes(shopeeActorInput(selected, maxReviewsPerProduct, contentFilter))).digest('hex');
}
