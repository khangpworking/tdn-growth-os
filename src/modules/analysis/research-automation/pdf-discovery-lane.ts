// Automatic industry-report PDF lane for the automated Market flow (S25). Off unless the flag is exactly "1".
//
// Per run: PDF links already present in this run's collected search rows, plus at most ONE extra search
// (`<keyword> báo cáo filetype:pdf`, never retried) when those rows give fewer than 2 candidates; then at most
// 2 sequential downloads through an SSRF guard, never retried. A stored file is an ordinary COLLECTION capture
// whose bytes start with `%PDF-`, so the existing run-PDF retention path keeps and reads it. Nothing here fails a run.
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { CaptureLog, defaultProviderTransport, sha256, type ProviderTransport } from './provider-common.js';
import { createSerpApiProvider } from './provider-serpapi.js';
import { SearchCallBudget, type ExpandedSearchRequest } from './expanded-search-queries.js';
import type { CollectInput, CollectResult, ProviderCallOptions, ProviderRawCapture } from './providers.js';
import { webResultUrlKey } from './expanded-search-lane.js';
import { MAX_CAPTURE_BYTES, type PdfDiscoveryReason, type StepPdfDiscovery, type StepPdfDiscoveryFile, type StepWebResult } from './model.js';

export const PDF_DISCOVERY_FLAG = 'TDN_RESEARCH_PDF_DISCOVERY_ENABLED';
/** Usage ordinals inside the collection step (13 is the TikTok top-ads read). */
export const PDF_DISCOVERY_SEARCH_USAGE_ORDINAL = 14;
export const PDF_DISCOVERY_DOWNLOAD_USAGE_ORDINAL = 15;
export const PDF_DISCOVERY_PROVIDER = 'PDF-DISCOVERY' as const;
export const PDF_DISCOVERY_MAX_FILES = 2;
export const PDF_DISCOVERY_MAX_SEARCHES = 1;
export const PDF_DISCOVERY_MAX_REDIRECTS = 3;
export const PDF_DISCOVERY_TIMEOUT_MS = 60_000;
/** The smaller of the capture ceiling (16 MiB) and 20 MB, enforced while streaming. */
export const PDF_DISCOVERY_MAX_BYTES = Math.min(MAX_CAPTURE_BYTES, 20_000_000);

export function pdfDiscoveryEnabled(env: Readonly<Record<string, string | undefined>>): boolean {
  return env[PDF_DISCOVERY_FLAG] === '1';
}

/** Marketplace, social and video hosts: their pages are listings or posts, never an industry report. */
const BLOCKED_HOST_SUFFIXES = ['shopee.vn', 'shopee.com', 'shopee', 'tiktok.com', 'tiktokcdn.com', 'facebook.com', 'fb.com', 'fbcdn.net', 'instagram.com',
  'youtube.com', 'youtu.be', 'lazada.vn', 'lazada.com', 'tiki.vn', 'sendo.vn', 'zalo.me', 'zalo.vn', 'x.com', 'twitter.com', 'threads.net'];
export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/u, '');
  const labels = host.split('.');
  return BLOCKED_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`))
    || labels.some(label => ['shopee', 'tiktok', 'lazada', 'tiki', 'youtube', 'facebook'].includes(label));
}

export const isPdfPath = (url: string): boolean => {
  try { return /\.pdf$/iu.test(new URL(url).pathname); } catch { return false; }
};

/** A URL may be fetched only over https on the default port, with no credentials and a DNS name (never an IP literal). */
export function checkPdfUrl(raw: string): URL | null {
  let url: URL;
  try { url = new URL(raw); } catch { return null; }
  const host = url.hostname.replace(/^\[|\]$/gu, '');
  if (url.protocol !== 'https:' || (url.port !== '' && url.port !== '443') || url.username || url.password) return null;
  if (host === '' || isIP(host) !== 0 || /^[0-9.]+$/u.test(host) || !host.includes('.') || host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) return null;
  return url;
}

function ipv4Blocked(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(part => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  const [a, b] = parts as [number, number, number, number];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

/** Loopback, private, link-local, CGNAT, multicast/reserved, IPv6 ULA and link-local answers are refused; so is anything unparsable. */
export function isBlockedAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/%.*$/u, '');
  const kind = isIP(ip);
  if (kind === 4) return ipv4Blocked(ip);
  if (kind !== 6) return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/u.exec(ip);
  if (mapped) return ipv4Blocked(mapped[1]!);
  const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/u.exec(ip);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1]!, 16), lo = parseInt(hexMapped[2]!, 16);
    return ipv4Blocked(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  // `::`, `::1`, IPv4-compatible and every other address starting with a zero group is refused.
  if (ip.startsWith('::') || ip.startsWith('0:')) return true;
  const first = parseInt(ip.split(':')[0]!, 16);
  return (first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00 || ip.startsWith('2001:db8:') || ip.startsWith('64:ff9b:');
}

export type PdfResolver = (hostname: string) => Promise<readonly string[]>;
export const defaultPdfResolver: PdfResolver = async hostname => (await lookup(hostname, { all: true, verbatim: true })).map(answer => answer.address);

export interface PdfCandidate { readonly url: string; readonly origin: StepPdfDiscoveryFile['origin'] }

/** Eligible PDF links in row order: `.pdf` path, an allowed URL and host, deduplicated by page identity. */
export function pdfCandidates(rows: readonly Pick<StepWebResult, 'url'>[], origin: PdfCandidate['origin'], seen: Set<string> = new Set()): PdfCandidate[] {
  const out: PdfCandidate[] = [];
  for (const row of rows) {
    if (!isPdfPath(row.url)) continue;
    const url = checkPdfUrl(row.url);
    if (!url || isBlockedHost(url.hostname)) continue;
    const key = webResultUrlKey(row.url);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: row.url, origin });
  }
  return out;
}

export type PdfDownloadOutcome =
  | { readonly kind: 'DOWNLOADED'; readonly capture: ProviderRawCapture; readonly bytes: Buffer; readonly sha256: string }
  | { readonly kind: 'FAILED'; readonly reason: PdfDiscoveryReason; readonly requested: boolean };

/**
 * One guarded GET with manual redirects (each hop re-checked: URL rule, host rule, DNS answers), no cookies or auth
 * headers, a streaming size cap, a 60 s whole-download timeout and a `%PDF-` signature check. Never retried.
 */
export async function guardedPdfDownload(input: {
  readonly transport: ProviderTransport; readonly resolve: PdfResolver; readonly log: CaptureLog; readonly url: string;
  readonly signal?: AbortSignal | undefined; readonly timeoutMs?: number; readonly maxBytes?: number;
}): Promise<PdfDownloadOutcome> {
  const maxBytes = Math.min(input.maxBytes ?? PDF_DISCOVERY_MAX_BYTES, PDF_DISCOVERY_MAX_BYTES);
  if (input.signal?.aborted) return { kind: 'FAILED', reason: 'CANCELLED', requested: false };
  const timeout = AbortSignal.timeout(input.timeoutMs ?? PDF_DISCOVERY_TIMEOUT_MS);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  const stopped = (): PdfDiscoveryReason => input.signal?.aborted ? 'CANCELLED' : timeout.aborted ? 'TIMEOUT' : 'TRANSPORT';
  const requestedAt = input.log.timestamp();
  let requested = false;
  let current = input.url;
  for (let hop = 0; ; hop += 1) {
    const url = checkPdfUrl(current);
    if (!url) return { kind: 'FAILED', reason: 'URL_REFUSED', requested };
    if (isBlockedHost(url.hostname)) return { kind: 'FAILED', reason: 'URL_REFUSED', requested };
    let answers: readonly string[];
    try { answers = await input.resolve(url.hostname); } catch { return { kind: 'FAILED', reason: signal.aborted ? stopped() : 'DNS_FAILED', requested }; }
    if (signal.aborted) return { kind: 'FAILED', reason: stopped(), requested };
    if (!answers.length) return { kind: 'FAILED', reason: 'DNS_FAILED', requested };
    if (answers.some(isBlockedAddress)) return { kind: 'FAILED', reason: 'PRIVATE_ADDRESS', requested };
    let response: Response;
    requested = true;
    try {
      response = await input.transport.fetch(url, { method: 'GET', redirect: 'manual', credentials: 'omit', signal,
        headers: { accept: 'application/pdf' } });
    } catch { return { kind: 'FAILED', reason: stopped(), requested }; }
    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get('location');
      if (!location) return { kind: 'FAILED', reason: 'HTTP_ERROR', requested };
      if (hop >= PDF_DISCOVERY_MAX_REDIRECTS) return { kind: 'FAILED', reason: 'TOO_MANY_REDIRECTS', requested };
      try { current = new URL(location, url).toString(); } catch { return { kind: 'FAILED', reason: 'URL_REFUSED', requested }; }
      continue;
    }
    if (response.status !== 200 || !response.body) {
      await response.body?.cancel().catch(() => {});
      return { kind: 'FAILED', reason: 'HTTP_ERROR', requested };
    }
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) {
      await response.body.cancel().catch(() => {});
      return { kind: 'FAILED', reason: 'FILE_SIZE_LIMIT', requested };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const part = await reader.read();
        if (part.done) break;
        size += part.value.byteLength;
        if (size > maxBytes) return { kind: 'FAILED', reason: 'FILE_SIZE_LIMIT', requested };
        chunks.push(part.value);
      }
    } catch { return { kind: 'FAILED', reason: stopped(), requested }; }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = Buffer.concat(chunks);
    if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') return { kind: 'FAILED', reason: 'NOT_A_PDF', requested };
    const capture = input.log.record({ operation: 'pdfdiscovery.download', billing: 'FREE_ACCOUNT_QUERY', method: 'GET', endpoint: `${url.origin}${url.pathname}`,
      requestParameters: {}, requestBodyBytes: null, queryWindow: null, pageNumber: null, productRef: null }, requestedAt, 'OK', 200, bytes, null);
    return { kind: 'DOWNLOADED', capture, bytes, sha256: sha256(bytes) };
  }
}

export type PdfSearchAttempt =
  | { readonly state: 'CALLED'; readonly result: CollectResult }
  | { readonly state: 'THROWN' };

/** The executor-side port. Neither method throws. */
export interface PdfDiscoverySource {
  /** The one extra search: same provider and transport as the web lane, one budgeted call, never retried. */
  search(input: CollectInput, options?: ProviderCallOptions): Promise<PdfSearchAttempt>;
  /** At most PDF_DISCOVERY_MAX_FILES guarded downloads, sequential, stopping once that many files are kept; duplicates by bytes are dropped. */
  download(candidates: readonly PdfCandidate[], options?: ProviderCallOptions): Promise<PdfDownloadRun>;
}

export interface PdfDownloadRun {
  readonly requests: number;
  readonly items: readonly ({ readonly candidate: PdfCandidate } & PdfDownloadOutcome)[];
}

export function createPdfDiscoverySource(apiKey: string | null, transport: ProviderTransport = defaultProviderTransport, resolve: PdfResolver = defaultPdfResolver): PdfDiscoverySource {
  const provider = createSerpApiProvider(apiKey, transport);
  return {
    async search(input, options = {}) {
      const budget = new SearchCallBudget({ trends: 0, search: PDF_DISCOVERY_MAX_SEARCHES });
      const request: ExpandedSearchRequest = { version: 'expanded-search-request-v1', confirmedProducts: [], confirmedBrands: [],
        requestedWindow: null, siteDomain: null, exactKeyword: input.keyword, fileType: 'pdf' };
      try { return { state: 'CALLED', result: await provider.collectExpanded(input, request, 0, budget, options) }; }
      catch { return { state: 'THROWN' }; }
    },
    async download(candidates, options = {}) {
      const log = new CaptureLog(PDF_DISCOVERY_PROVIDER, transport, undefined, PDF_DISCOVERY_MAX_FILES);
      const items: ({ candidate: PdfCandidate } & PdfDownloadOutcome)[] = [];
      const shas = new Set<string>();
      let requests = 0, kept = 0;
      for (const candidate of candidates) {
        if (kept >= PDF_DISCOVERY_MAX_FILES || requests >= PDF_DISCOVERY_MAX_FILES) break;
        let outcome: PdfDownloadOutcome;
        try { outcome = await guardedPdfDownload({ transport, resolve, log, url: candidate.url, signal: options.signal }); }
        catch { outcome = { kind: 'FAILED', reason: 'TRANSPORT', requested: true }; }
        if (outcome.kind === 'DOWNLOADED' || outcome.requested) requests += 1;
        if (outcome.kind === 'DOWNLOADED' && shas.has(outcome.sha256)) { items.push({ candidate, kind: 'FAILED', reason: 'DUPLICATE', requested: true }); continue; }
        if (outcome.kind === 'DOWNLOADED') { shas.add(outcome.sha256); kept += 1; }
        items.push({ candidate, ...outcome });
      }
      return { requests, items };
    },
  };
}

/** The stored field. `fileIndexes[i]` is the step capture ordinal of the i-th item's stored file, null when none was stored. */
export function pdfDiscoveryDocument(search: StepPdfDiscovery['search'], run: PdfDownloadRun | null, fileIndexes: readonly (number | null)[], fallback: PdfDiscoveryReason): StepPdfDiscovery {
  const files: StepPdfDiscoveryFile[] = (run?.items ?? []).map((item, i): StepPdfDiscoveryFile => {
    const index = fileIndexes[i] ?? null;
    if (item.kind === 'DOWNLOADED' && index !== null) return { origin: item.candidate.origin, url: item.candidate.url, status: 'DOWNLOADED', reason: null,
      captureIndex: index, retrievedAt: item.capture.completedAt, sourceSha256: item.sha256, byteSize: item.bytes.byteLength };
    return { origin: item.candidate.origin, url: item.candidate.url, status: 'FAILED', reason: item.kind === 'FAILED' ? item.reason : 'DOCUMENT_INVALID',
      captureIndex: null, retrievedAt: null, sourceSha256: null, byteSize: null };
  });
  const downloaded = files.some(file => file.status === 'DOWNLOADED');
  return { search, files, reason: downloaded ? null : files.find(file => file.reason)?.reason ?? fallback };
}

export function pdfDiscoveryFailed(reason: PdfDiscoveryReason): StepPdfDiscovery {
  return { search: { status: 'FAILED', reason, captureIndex: null, retrievedAt: null }, files: [], reason };
}

/** Files that were stored and may carry S25 capture lineage. */
export function pdfDiscoveryDownloaded(value: StepPdfDiscovery | null | undefined): (StepPdfDiscoveryFile & { readonly captureIndex: number; readonly sourceSha256: string; readonly retrievedAt: string })[] {
  return (value?.files ?? []).filter((file): file is StepPdfDiscoveryFile & { captureIndex: number; sourceSha256: string; retrievedAt: string } =>
    file.status === 'DOWNLOADED' && file.captureIndex !== null && file.sourceSha256 !== null && file.retrievedAt !== null);
}

const REASONS: ReadonlySet<string> = new Set<PdfDiscoveryReason>(['NO_CANDIDATE', 'SEARCH_SKIPPED_ENOUGH', 'SEARCH_NO_ADMISSION', 'SEARCH_FAILED', 'NOT_ADMITTED',
  'URL_REFUSED', 'PRIVATE_ADDRESS', 'DNS_FAILED', 'TOO_MANY_REDIRECTS', 'FILE_SIZE_LIMIT', 'NOT_A_PDF', 'TIMEOUT', 'HTTP_ERROR', 'DUPLICATE', 'TRANSPORT', 'CANCELLED', 'DOCUMENT_INVALID']);
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const reasonOk = (value: unknown): boolean => value === null || (typeof value === 'string' && REASONS.has(value));
const indexOk = (value: unknown): boolean => value === null || (Number.isSafeInteger(value) && (value as number) >= 0);
const timeOk = (value: unknown): boolean => value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)));

export function validPdfDiscovery(value: unknown): value is StepPdfDiscovery {
  if (!isRecord(value) || !isRecord(value.search) || !Array.isArray(value.files) || value.files.length > PDF_DISCOVERY_MAX_FILES * 2 || !reasonOk(value.reason)) return false;
  const search = value.search;
  if (!['CALLED', 'SKIPPED', 'FAILED'].includes(String(search.status)) || !reasonOk(search.reason) || !indexOk(search.captureIndex) || !timeOk(search.retrievedAt)
    || (search.status === 'CALLED') !== (search.captureIndex !== null)) return false;
  return value.files.every(file => isRecord(file) && (file.origin === 'RUN_ROWS' || file.origin === 'PDF_SEARCH')
    && typeof file.url === 'string' && file.url.length <= 2000 && file.url.startsWith('https://') && reasonOk(file.reason)
    && (file.status === 'DOWNLOADED'
      ? file.reason === null && Number.isSafeInteger(file.captureIndex) && (file.captureIndex as number) >= 0 && timeOk(file.retrievedAt) && file.retrievedAt !== null
        && typeof file.sourceSha256 === 'string' && /^[a-f0-9]{64}$/u.test(file.sourceSha256)
        && Number.isSafeInteger(file.byteSize) && (file.byteSize as number) > 0 && (file.byteSize as number) <= PDF_DISCOVERY_MAX_BYTES
      : file.status === 'FAILED' && file.reason !== null && file.captureIndex === null && file.retrievedAt === null && file.sourceSha256 === null && file.byteSize === null));
}

/** Download usage: public files, no paid request and no credits. The search's own usage is recorded from its provider result. */
export function pdfDiscoveryUsage(requests: number): {
  readonly provider: string;
  readonly usage: { readonly requestsIssued: number; readonly paidRequestsIssued: number; readonly ambiguousPaidRequests: number; readonly credits: { readonly status: 'NONE_USED' } };
} {
  return { provider: PDF_DISCOVERY_PROVIDER, usage: { requestsIssued: requests, paidRequestsIssued: 0, ambiguousPaidRequests: 0, credits: { status: 'NONE_USED' } } };
}
