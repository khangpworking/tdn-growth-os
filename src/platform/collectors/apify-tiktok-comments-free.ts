// Temporary free TikTok comment collector (S07, owner decision 25/10): the HTTPS transport over the existing Apify credential,
// the privacy-key file reader and the collector factory. Off unless TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED is exactly "1".
// One run per video with a fixed per-run charge cap; no retry and no fallback actor. Never logs the token, the salt or provider bodies.
import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ApifyTikTokCommentsCollector, createTikTokCommentPrivacy, FREE_TIKTOK_COMMENTS, TIKTOK_COMMENT_ACTORS,
  type TikTokCommentActor, type TikTokCommentPrivacy, type TikTokCommentRunReceipt, type TikTokCommentsTransport } from './apify-tiktok-comments.js';

export const TIKTOK_COMMENTS_FREE_FLAG = 'TDN_RESEARCH_TIKTOK_COMMENTS_FREE_ENABLED';
export const TIKTOK_COMMENTS_PRIVACY_FILE_ENV = 'TDN_RESEARCH_TIKTOK_COMMENTS_PRIVACY_FILE';
export function tiktokCommentsFreeEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[TIKTOK_COMMENTS_FREE_FLAG] === '1';
}

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Reads `{ "keyId": <uuid v4>, "salt": <base64, at least 32 bytes> }` from an absolute, regular, owner-only (mode 600) file.
 * Errors name the variable only, never the path content, key id or salt. */
export function readTikTokCommentPrivacyFile(file: string | undefined): TikTokCommentPrivacy {
  const invalid = (): never => { throw new TypeError(`${TIKTOK_COMMENTS_PRIVACY_FILE_ENV} must name an absolute mode-600 JSON file with keyId (uuid v4) and salt (base64, at least 32 bytes)`); };
  if (!file || !path.isAbsolute(file)) return invalid();
  let bytes: Buffer;
  try {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || (stat.mode & 0o777) !== 0o600 || (typeof process.getuid === 'function' && stat.uid !== process.getuid()) || stat.size > 4096) return invalid();
    bytes = fs.readFileSync(file);
  } catch { return invalid(); }
  let value: unknown;
  try { value = JSON.parse(bytes.toString('utf8')); } catch { return invalid(); }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid();
  const { keyId, salt } = value as Record<string, unknown>;
  if (Object.keys(value).length !== 2 || typeof keyId !== 'string' || !UUID_V4.test(keyId) || typeof salt !== 'string') return invalid();
  const decoded = Buffer.from(salt, 'base64');
  if (decoded.byteLength < 32 || decoded.toString('base64') !== salt) return invalid();
  try { return createTikTokCommentPrivacy({ salt: decoded, keyId }); } catch { return invalid(); } finally { decoded.fill(0); }
}

const TERMINAL: Readonly<Record<string, TikTokCommentRunReceipt['status']>> = { SUCCEEDED: 'SUCCEEDED', FAILED: 'FAILED', ABORTED: 'CANCELLED', 'TIMED-OUT': 'INCOMPLETE' };
const SETTLE_READS = 6, SETTLE_MS = 5000;
const providerId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9]{1,100}$/.test(value);
interface Run { id: string; datasetId: string; buildId: string | null; status: string; usageTotalUsd: number | null; maxTotalChargeUsd: number | null }
function parseProviderJson(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error('Invalid TikTok comment response'); }
}
function parseRun(bytes: Buffer, maxTotalChargeUsd: number): Run {
  const data = (parseProviderJson(bytes) as { data?: Record<string, unknown> } | null)?.data;
  if (!data || !providerId(data.id) || !providerId(data.defaultDatasetId) || typeof data.status !== 'string' || !/^[A-Z-]{1,40}$/.test(data.status) ||
    (data.buildId != null && !providerId(data.buildId)) ||
    (data.usageTotalUsd != null && (typeof data.usageTotalUsd !== 'number' || !Number.isFinite(data.usageTotalUsd) || data.usageTotalUsd < 0 || data.usageTotalUsd > maxTotalChargeUsd))) throw new Error('Invalid run');
  const cap = (data.options as { maxTotalChargeUsd?: unknown } | undefined)?.maxTotalChargeUsd;
  // Check every observation before unsettled metadata can be discarded as unknown.
  if (cap !== maxTotalChargeUsd) throw new Error('Run charge cap differs');
  return { id: data.id, datasetId: data.defaultDatasetId, buildId: (data.buildId as string | null | undefined) ?? null, status: data.status,
    usageTotalUsd: (data.usageTotalUsd as number | null | undefined) ?? null, maxTotalChargeUsd: typeof cap === 'number' && Number.isFinite(cap) ? cap : null };
}

/** HTTPS transport: start one run with the charge cap, wait for a terminal state within a bounded total time, read dataset pages. */
export class ApifyTikTokCommentsHttpTransport implements TikTokCommentsTransport {
  readonly #token: string;
  readonly #fetch: typeof fetch;
  readonly #sleep: (ms: number, signal?: AbortSignal) => Promise<unknown>;
  readonly #maxWaitMs: number;
  readonly #now: () => Date;
  constructor(options: { token: string; fetch?: typeof fetch; sleep?: (ms: number, signal?: AbortSignal) => Promise<unknown>; maxWaitMs?: number; now?: () => Date }) {
    if (!/^[\x21-\x7e]{1,512}$/.test(options.token)) throw new TypeError('TikTok comment transport requires the configured credential');
    this.#token = options.token;
    this.#fetch = options.fetch ?? fetch;
    this.#sleep = options.sleep ?? ((ms, signal) => delay(ms, undefined, signal ? { signal } : {}));
    this.#maxWaitMs = options.maxWaitMs ?? 240_000;
    this.#now = options.now ?? (() => new Date());
  }
  async start(actor: TikTokCommentActor, input: Readonly<Record<string, unknown>>, maxTotalChargeUsd: number, signal?: AbortSignal): Promise<TikTokCommentRunReceipt> {
    if (!Number.isFinite(maxTotalChargeUsd) || maxTotalChargeUsd <= 0) throw new Error('Invalid charge cap');
    const deadline = Date.now() + this.#maxWaitMs;
    // The actor's own timeout ends the provider run inside the local wait bound.
    const query = new URLSearchParams({ maxTotalChargeUsd: String(maxTotalChargeUsd), timeout: String(Math.max(30, Math.floor(this.#maxWaitMs / 1000) - 30)) });
    let run = parseRun(await this.#request(`/acts/${actor.replace('/', '~')}/runs?${query}`, { method: 'POST', body: JSON.stringify(input) }, 30_000, signal), maxTotalChargeUsd);
    // The provider-side cap is the hard spend guard (reported usage settles late): the started run must carry exactly ours.
    if (run.maxTotalChargeUsd !== maxTotalChargeUsd) throw new Error('Run charge cap differs');
    while (!(run.status in TERMINAL)) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      const wait = Math.min(60, Math.floor(left / 1000));
      if (wait < 1) { await this.#sleep(left, signal); continue; }
      const next = parseRun(await this.#request(`/actor-runs/${run.id}?waitForFinish=${wait}`, {}, (wait + 30) * 1000, signal), maxTotalChargeUsd);
      if (next.id !== run.id || next.datasetId !== run.datasetId || next.maxTotalChargeUsd !== maxTotalChargeUsd) throw new Error('Run identity drift');
      run = next;
    }
    const status = TERMINAL[run.status] ?? 'INCOMPLETE';
    let providerTotalRows: number | null = null;
    if (status === 'SUCCEEDED') {
      // Usage and dataset counts settle some seconds after the terminal state (live 25/10: 0 rows and 0 USD at
      // finish, 10 rows and 0.006 USD later; usage once still 0 after two reads 3 s apart). Re-read until two
      // spaced reads agree; otherwise both stay unknown. Reported usage is a record, the run cap is the guard.
      const itemCount = async () => {
        const data = (parseProviderJson(await this.#request(`/datasets/${run.datasetId}`, {}, 30_000, signal)) as { data?: { itemCount?: unknown } } | null)?.data;
        return typeof data?.itemCount === 'number' && Number.isSafeInteger(data.itemCount) && data.itemCount >= 0 ? data.itemCount : null;
      };
      // The terminal read itself is never trusted as settled: compare reads taken after a pause only.
      let previous: { rows: number | null; usage: number | null } | null = null, settled = false;
      for (let read = 0; read < SETTLE_READS && !settled; read++) {
        await this.#sleep(SETTLE_MS, signal);
        const next = parseRun(await this.#request(`/actor-runs/${run.id}`, {}, 30_000, signal), maxTotalChargeUsd);
        if (next.id !== run.id || next.datasetId !== run.datasetId || next.status !== run.status) throw new Error('Run identity drift');
        const current = { rows: await itemCount(), usage: next.usageTotalUsd };
        settled = previous !== null && current.rows !== null && current.rows === previous.rows && current.usage === previous.usage;
        run = next; previous = current;
      }
      if (settled && previous) providerTotalRows = previous.rows; else run = { ...run, usageTotalUsd: null };
    }
    return { runId: run.id, datasetId: run.datasetId, buildId: run.buildId, status, retrievedAt: this.#now().toISOString(),
      providerTotalRows, usageTotalUsd: run.usageTotalUsd };
  }
  async readPage(receipt: TikTokCommentRunReceipt, offset: number, limit: number, signal?: AbortSignal): Promise<Buffer> {
    if (!providerId(receipt.datasetId) || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('Invalid page request');
    const query = new URLSearchParams({ format: 'json', clean: 'false', offset: String(offset), limit: String(limit) });
    return this.#request(`/datasets/${receipt.datasetId}/items?${query}`, {}, 30_000, signal);
  }
  async #request(endpoint: string, init: RequestInit, timeoutMs: number, signal?: AbortSignal): Promise<Buffer> {
    signal?.throwIfAborted();
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      const response = await this.#fetch('https://api.apify.com/v2' + endpoint, {
        ...init, redirect: 'error', signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
        headers: { Authorization: 'Bearer ' + this.#token, 'Content-Type': 'application/json' },
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
      signal?.throwIfAborted();
      // Do not print provider bodies, token-bearing headers, or transport error details.
      throw new Error('TikTok comment request failed or exceeded limits; no automatic retry');
    }
  }
}

/** The free collector: fixed actor, 10 comments per video, 0.05 USD cap per run. */
export function createFreeTikTokCommentsCollector(options: { token: string; privacy: TikTokCommentPrivacy; transport?: TikTokCommentsTransport }) {
  return new ApifyTikTokCommentsCollector({ transport: options.transport ?? new ApifyTikTokCommentsHttpTransport({ token: options.token }),
    privacy: options.privacy, actor: TIKTOK_COMMENT_ACTORS.free, approvedMaxTotalChargeUsd: FREE_TIKTOK_COMMENTS.maxTotalChargeUsdPerRun,
    maxCommentsPerVideo: FREE_TIKTOK_COMMENTS.maxCommentsPerVideo });
}
