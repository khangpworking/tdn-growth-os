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
export interface ShopeeCollector {
  readonly mode: 'fixture' | 'live';
  collect(selected: SelectedListing[], requestSha256: string, runKey: string): Promise<CollectedPages>;
}

export class FixtureShopeeCollector implements ShopeeCollector {
  readonly mode = 'fixture' as const;
  constructor(readonly bytes: Buffer) {}
  async collect(): Promise<CollectedPages> {
    const value = parseJsonBytes(this.bytes);
    if (!Array.isArray(value) || value.length > 2500) throw new Error('Fixture must be a JSON array of at most 2500 rows');
    return { mode: 'fixture', actor: { runId: null, datasetId: null, buildId: null, status: 'FIXTURE' },
      warnings: ['synthetic_fixture_not_live_evidence'], pages: [{ bytes: Buffer.from(this.bytes), offset: 0 }] };
  }
}

export class CollectionPendingError extends Error {}

export class ApifyShopeeCollector implements ShopeeCollector {
  readonly mode = 'live' as const;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number) => Promise<unknown>;
  constructor(readonly options: {
    token: string; maxChargeUsd: number; journalRoot: string;
    fetch?: typeof fetch; sleep?: (ms: number) => Promise<unknown>; maxPolls?: number;
  }) {
    if (!options.token.trim() || !Number.isFinite(options.maxChargeUsd) || options.maxChargeUsd <= 0) {
      throw new Error('Live collection requires token and a positive approved charge cap');
    }
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? delay;
  }

  async collect(selected: SelectedListing[], requestSha256: string, runKey: string): Promise<CollectedPages> {
    if (!/^[a-f0-9]{64}$/.test(requestSha256) || !/^[a-z0-9][a-z0-9-]{2,79}$/.test(runKey) || selected.length < 1 || selected.length > 5 ||
        selected.some(row => !shopeeUrlMatches(row))) throw new Error('Invalid bounded Shopee selection');
    const input = { startUrls: selected.map(row => ({ url: row.productUrl })),
      maxReviewsPerProduct: 500, starFilter: 'all', contentFilter: 'with comments' };
    // Stable runKey prevents changed input/formatting from bypassing an uncertain start.
    const directory = path.resolve(this.options.journalRoot, runKey);
    await fs.mkdir(directory, { recursive: true, mode: 0o700 });
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
          run = parseRun(parseJsonBytes(await this.#request(
            '/actors/zen-studio~shopee-product-reviews-scraper/runs?' + query,
            { method: 'POST', body: JSON.stringify(input) })));
          await writeReceipt(runPath, jsonBytes({ data: run }));
        } catch {
          throw new CollectionPendingError('Start outcome unknown; inspect Apify manually. No automatic POST retry');
        }
      }
      const terminal = new Set(['SUCCEEDED', 'FAILED', 'TIMED-OUT', 'ABORTED']);
      const polls = this.options.maxPolls ?? 30;
      for (let index = 0; !terminal.has(run.status) && index < polls; index++) {
        await this.#sleep(2000);
        const next = parseRun(parseJsonBytes(await this.#request('/actor-runs/' + run.id)));
        if (next.id !== run.id || next.defaultDatasetId !== run.defaultDatasetId) throw new Error('Run identity drift');
        run = next;
      }
      if (!terminal.has(run.status)) throw new CollectionPendingError('Run pending; resume with the same input and budget');
      const pages: CollectedPages['pages'] = [];
      let offset = 0;
      // Do not request more rows to compensate for filtering, invalid rows or duplicates.
      const maximum = selected.length * 500;
      while (offset < maximum) {
        const limit = Math.min(100, maximum - offset);
        const query = new URLSearchParams({ format: 'json', clean: 'false', offset: String(offset), limit: String(limit) });
        const bytes = await this.#request('/datasets/' + run.defaultDatasetId + '/items?' + query);
        const values = parseJsonBytes(bytes);
        if (!Array.isArray(values) || values.length > limit) throw new Error('Invalid bounded dataset page');
        pages.push({ bytes, offset });
        offset += values.length;
        if (values.length < limit) break;
      }
      return { mode: 'live', actor: { runId: run.id, datasetId: run.defaultDatasetId,
        buildId: run.buildId, status: run.status },
        warnings: run.status === 'SUCCEEDED' ? [] : ['actor_terminal_' + run.status.toLowerCase()], pages };
    } finally {
      await lock.close();
      await fs.unlink(lockPath);
    }
  }

  async #request(endpoint: string, init: RequestInit = {}): Promise<Buffer> {
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
      return Buffer.concat(chunks);
    } catch {
      // Do not print provider bodies, token-bearing URLs, or transport error details.
      throw new Error('Apify request failed or exceeded limits; resume the same request, not a new paid run');
    }
  }
}

interface Run { id: string; defaultDatasetId: string; buildId: string | null; status: string }
function parseRun(value: unknown): Run {
  const data = (value as { data?: Partial<Run> } | null)?.data;
  const validId = (x: unknown): x is string => typeof x === 'string' && /^[a-zA-Z0-9]{1,100}$/.test(x);
  if (!data || !validId(data.id) || !validId(data.defaultDatasetId) ||
      typeof data.status !== 'string' || !/^[A-Z-]{1,40}$/.test(data.status) ||
      (data.buildId != null && !validId(data.buildId))) throw new Error('Invalid Actor run metadata');
  return { id: data.id, defaultDatasetId: data.defaultDatasetId, status: data.status, buildId: data.buildId ?? null };
}
async function readOptional(file: string): Promise<Buffer | null> {
  try { return await fs.readFile(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
}
async function writeReceipt(file: string, bytes: Buffer): Promise<void> {
  const handle = await fs.open(file, 'wx', 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}
