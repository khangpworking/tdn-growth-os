import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type {
  CaptureBilling, CaptureOutcome, CoverageOperation, CoverageStatus, CreditUsage, DateWindow, ProviderCoverage,
  ProviderOperation, ProviderProgressEvent, ProviderRawCapture, ProviderRunStatus, ProviderUsage,
  ResearchAutomationProviderId,
} from './providers.js';

export class ProviderInputError extends Error {
  readonly code = 'INVALID_PROVIDER_INPUT';
}

// ---- dates (inclusive VN calendar days) ----

const DAY_MS = 86_400_000;
const VN_OFFSET_MS = 7 * 3_600_000;
export const MAX_REQUESTED_PERIOD_DAYS = 3_660;

function dayNumber(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ProviderInputError('Dates must be YYYY-MM-DD');
  const time = Date.parse(value + 'T00:00:00Z');
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    throw new ProviderInputError('Invalid calendar date');
  }
  return time / DAY_MS;
}
function dayString(day: number): string { return new Date(day * DAY_MS).toISOString().slice(0, 10); }

export function validatePeriod(period: DateWindow): DateWindow {
  if (!period || typeof period !== 'object') throw new ProviderInputError('Requested period is required');
  const days = inclusiveDayCount(period);
  if (days < 1 || days > MAX_REQUESTED_PERIOD_DAYS) throw new ProviderInputError('Requested period is out of bounds');
  return { startDate: period.startDate, endDate: period.endDate };
}

export function inclusiveDayCount(period: DateWindow): number {
  return dayNumber(period.endDate) - dayNumber(period.startDate) + 1;
}

/** Consecutive non-overlapping windows of at most `maxDays`, covering the period exactly. */
export function splitPeriodIntoWindows(period: DateWindow, maxDays: number): DateWindow[] {
  if (!Number.isSafeInteger(maxDays) || maxDays < 1) throw new ProviderInputError('Invalid window size');
  validatePeriod(period);
  const end = dayNumber(period.endDate);
  const windows: DateWindow[] = [];
  for (let start = dayNumber(period.startDate); start <= end; start += maxDays) {
    windows.push({ startDate: dayString(start), endDate: dayString(Math.min(start + maxDays - 1, end)) });
  }
  return windows;
}

/** `days` inclusive VN dates ending the VN calendar day before `asOf`. */
export function recentWindowBefore(asOf: string, days: number): DateWindow {
  const time = typeof asOf === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(asOf) ? Date.parse(asOf) : Number.NaN;
  if (!Number.isFinite(time)) throw new ProviderInputError('asOf must be an ISO timestamp');
  const end = Math.floor((time + VN_OFFSET_MS) / DAY_MS) - 1;
  return { startDate: dayString(end - days + 1), endDate: dayString(end) };
}

export function windowRelation(window: DateWindow, period: DateWindow): 'INSIDE' | 'OVERLAPS' | 'OUTSIDE' {
  const [ws, we, ps, pe] = [window.startDate, window.endDate, period.startDate, period.endDate].map(dayNumber) as
    [number, number, number, number];
  if (ws >= ps && we <= pe) return 'INSIDE';
  return ws <= pe && we >= ps ? 'OVERLAPS' : 'OUTSIDE';
}

// ---- input validation ----

export function validateKeyword(keyword: unknown): string {
  if (typeof keyword !== 'string') throw new ProviderInputError('Keyword is required');
  const value = keyword.normalize('NFC').trim();
  // eslint-disable-next-line no-control-regex
  if (value.length < 1 || value.length > 200 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new ProviderInputError('Keyword must be 1-200 characters without control characters');
  }
  return value;
}

export function validateCountry(country: unknown): void {
  if (country !== 'VN') throw new ProviderInputError('Only Vietnam is supported');
}

// ---- product refs ----

export function formatProviderProductRef(provider: 'KALODATA', sourceProductId: string): string {
  if (provider !== 'KALODATA' || !/^\d{1,32}$/.test(sourceProductId)) throw new ProviderInputError('Invalid product ref');
  return 'kalodata:' + sourceProductId;
}

export function parseProviderProductRef(ref: unknown): { provider: 'KALODATA'; sourceProductId: string } | null {
  if (typeof ref !== 'string') return null;
  const match = /^kalodata:(\d{1,32})$/.exec(ref);
  return match ? { provider: 'KALODATA', sourceProductId: match[1]! } : null;
}

// ---- transport ----

export interface ProviderTransport {
  readonly fetch: typeof fetch;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
  readonly now: () => number;
}

export const defaultProviderTransport: ProviderTransport = {
  fetch: (input, init) => fetch(input, init),
  sleep: async (ms, signal) => { await delay(ms, undefined, signal ? { signal } : {}); },
  now: () => Date.now(),
};

/** Fixed provider hosts. URLs are built from constants only; no caller-supplied URL is ever fetched. */
const ALLOWED_HOSTS = new Set(['www.kalodata.com', 'serpapi.com']);

export type HttpOutcome =
  | { kind: 'RECEIVED'; status: number; bytes: Buffer }
  | { kind: 'OVERSIZE'; status: number }
  | { kind: 'TIMEOUT' | 'TRANSPORT' | 'ABORTED' };

export async function boundedRequest(transport: ProviderTransport, request: {
  url: URL; method: 'GET' | 'POST'; headers: Record<string, string>; body: string | null;
  timeoutMs: number; maxBytes: number; signal: AbortSignal | undefined;
}): Promise<HttpOutcome> {
  const { url } = request;
  if (url.protocol !== 'https:' || !ALLOWED_HOSTS.has(url.hostname) || url.port !== '' || url.username || url.password) {
    throw new ProviderInputError('Provider host is not allowed');
  }
  if (request.signal?.aborted) return { kind: 'ABORTED' };
  const timeout = AbortSignal.timeout(request.timeoutMs);
  const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
  const classify = (): HttpOutcome => request.signal?.aborted ? { kind: 'ABORTED' }
    : timeout.aborted ? { kind: 'TIMEOUT' } : { kind: 'TRANSPORT' };
  let response: Response;
  try {
    response = await transport.fetch(url, {
      method: request.method, headers: request.headers, redirect: 'error', signal,
      ...(request.body ? { body: request.body } : {}),
    });
  } catch {
    return classify();
  }
  if (!response.body) return { kind: 'RECEIVED', status: response.status, bytes: Buffer.alloc(0) };
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > request.maxBytes) return { kind: 'OVERSIZE', status: response.status };
      chunks.push(part.value);
    }
  } catch {
    return classify();
  } finally {
    await reader.cancel().catch(() => {});
  }
  return { kind: 'RECEIVED', status: response.status, bytes: Buffer.concat(chunks) };
}

/** Sliding-window limiter: at most `limit` request starts in any `windowMs`. */
export class RateLimiter {
  readonly #starts: number[] = [];
  constructor(readonly limit: number, readonly windowMs: number) {}
  async acquire(transport: ProviderTransport, signal: AbortSignal | undefined): Promise<boolean> {
    while (true) {
      if (signal?.aborted) return false;
      const now = transport.now();
      while (this.#starts.length && this.#starts[0]! <= now - this.windowMs) this.#starts.shift();
      if (this.#starts.length < this.limit) { this.#starts.push(now); return true; }
      try { await transport.sleep(this.#starts[0]! + this.windowMs - now, signal); }
      catch { return false; }
    }
  }
}

// ---- captures, usage, coverage ----

export function sha256(bytes: Buffer): string { return createHash('sha256').update(bytes).digest('hex'); }

function jsonContainsSecret(text: string, secret: string): boolean {
  let root: unknown;
  try { root = JSON.parse(text); } catch { return false; }
  const pending: unknown[] = [root];
  while (pending.length) {
    const value = pending.pop();
    if (typeof value === 'string') {
      if (value.includes(secret)) return true;
      continue;
    }
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (key.includes(secret)) return true;
        pending.push(child);
      }
    }
  }
  return false;
}

export function bytesContainSecret(bytes: Buffer, secret: string): boolean {
  if (bytes.includes(Buffer.from(secret))) return true;
  const rawText = bytes.toString('latin1');
  let decodedText: string | null = null;
  try {
    decodedText = decodeURIComponent(rawText);
    if (decodedText.includes(secret)) return true;
  } catch { /* malformed URL encoding is still checked by raw bytes and JSON below */ }
  if (jsonContainsSecret(bytes.toString('utf8'), secret)) return true;
  return decodedText !== null && jsonContainsSecret(decodedText, secret);
}

const AMBIGUOUS: ReadonlySet<CaptureOutcome> = new Set(['TIMEOUT_AMBIGUOUS', 'TRANSPORT_AMBIGUOUS', 'ABORTED_AMBIGUOUS']);
export const isAmbiguous = (outcome: CaptureOutcome) => AMBIGUOUS.has(outcome);

export interface CaptureContext {
  operation: ProviderOperation; billing: CaptureBilling; method: 'GET' | 'POST'; endpoint: string;
  requestParameters: Record<string, unknown>; requestBodyBytes: Buffer | null;
  queryWindow: DateWindow | null; pageNumber: number | null; productRef: string | null;
}

/** Collects every exchange for one quickSearch/collect call and reports progress. */
export class CaptureLog {
  readonly captures: ProviderRawCapture[] = [];
  #sequence = 0;
  constructor(
    readonly provider: ResearchAutomationProviderId,
    readonly transport: ProviderTransport,
    readonly onProgress: ((event: ProviderProgressEvent) => void) | undefined,
    public plannedRequests: number,
  ) {}

  timestamp(): string { return new Date(this.transport.now()).toISOString(); }

  record(context: CaptureContext, requestedAt: string, outcome: CaptureOutcome, httpStatus: number | null,
    responseBytes: Buffer | null, providerCode: string | null): ProviderRawCapture {
    this.#sequence++;
    const capture: ProviderRawCapture = {
      captureId: `${this.provider.toLowerCase()}-${String(this.#sequence).padStart(4, '0')}`,
      provider: this.provider, ...context, requestedAt, completedAt: this.timestamp(), outcome, httpStatus,
      responseBytes, responseSha256: responseBytes ? sha256(responseBytes) : null,
      responseByteLength: responseBytes ? responseBytes.byteLength : null, providerCode,
    };
    this.captures.push(capture);
    try {
      this.onProgress?.({ provider: this.provider, operation: context.operation, completedRequests: this.#sequence,
        plannedRequests: Math.max(this.plannedRequests, this.#sequence), queryWindow: context.queryWindow,
        productRef: context.productRef });
    } catch { /* progress callbacks cannot affect provider execution */ }
    return capture;
  }

  usage(credits: CreditUsage): ProviderUsage {
    const paid = this.captures.filter(capture => capture.billing !== 'FREE_ACCOUNT_QUERY');
    return {
      provider: this.provider, requestsIssued: this.captures.length, paidRequestsIssued: paid.length,
      ambiguousPaidRequests: paid.filter(capture => isAmbiguous(capture.outcome)).length,
      automaticRetries: 0, credits,
      monetaryCharge: { status: 'UNKNOWN', reason: 'Provider responses do not report a finalized monetary charge.' },
    };
  }
}

export function emptyUsage(provider: ResearchAutomationProviderId): ProviderUsage {
  return { provider, requestsIssued: 0, paidRequestsIssued: 0, ambiguousPaidRequests: 0, automaticRetries: 0,
    credits: { status: 'NONE_USED' },
    monetaryCharge: { status: 'UNKNOWN', reason: 'No provider request was made.' } };
}

export function unavailableCoverage(provider: ResearchAutomationProviderId, operation: CoverageOperation,
  status: Extract<CoverageStatus, 'UNSUPPORTED' | 'WAITING_FOR_INPUT' | 'NOT_CONFIGURED'>,
  requestedPeriod: DateWindow | null, limitations: readonly string[]): ProviderCoverage {
  return { provider, operation, status, semantics: 'NONE', requestedPeriod, queryWindows: [], truncated: false,
    continuation: { required: false, remainingWindows: [], remainingProductRefs: [] }, limitations };
}

export function runStatusFromCoverage(statuses: readonly CoverageStatus[], cancelled: boolean): ProviderRunStatus {
  if (cancelled) return 'CANCELLED';
  if (statuses.every(status => status === 'QUERIES_COMPLETE' || status === 'EMPTY')) return 'SUCCEEDED';
  if (statuses.every(status => status === 'FAILED')) return 'FAILED';
  return 'PARTIAL';
}

/** Safe provider code (never free-form messages). */
export function safeProviderCode(value: unknown): string | null {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return typeof value === 'string' && /^[A-Za-z0-9_.-]{1,64}$/.test(value) ? value : null;
}

export function parseJson(bytes: Buffer): unknown {
  try { return JSON.parse(bytes.toString('utf8')); } catch { return undefined; }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null;
  // eslint-disable-next-line no-control-regex
  const text = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
  return text.length ? text.slice(0, max) : null;
}

export function httpsUrl(value: unknown, max = 2048): string | null {
  if (typeof value !== 'string' || value.length > max) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : null;
  } catch { return null; }
}
